// ═══════════════════════════════════════════════════════
// IA Retry Queue — fila persistente para mensagens que falharam por sobrecarga da API
//
// Quando callAI falha (503 / overload), a mensagem é enfileirada no banco.
// Um worker verifica a cada 15s e retenta conforme o escalonamento:
//   tentativa 1: +10s   tentativa 2: +2min   tentativa 3: +10min
//   tentativa 4: +30min tentativa 5: +2h      → desiste
//
// A conversa permanece em status='ia' o tempo todo.
// Se o cliente mandar outra mensagem antes do retry, o webhook trata normalmente
// e o item na fila é cancelado.
// ═══════════════════════════════════════════════════════

import db from '../db.js';
import * as aiSvc from './ai.js';

// Delays em ms: índice = número de tentativas já realizadas
const RETRY_DELAYS_MS = [
    10 * 1000,           // 10s
    2 * 60 * 1000,       // 2min
    10 * 60 * 1000,      // 10min
    30 * 60 * 1000,      // 30min
    2 * 60 * 60 * 1000,  // 2h
];
const MAX_TENTATIVAS = RETRY_DELAYS_MS.length; // 5 retries → desiste

// ───────────────────────────────────────────
// Enfileirar mensagem que falhou
// ───────────────────────────────────────────
export function enqueue(conversa, conteudo, msgReferenciaId = 0) {
    // Se já há um item na fila para esta conversa, não duplica
    const existe = db.prepare('SELECT id FROM ia_retry_queue WHERE conversa_id = ?').get(conversa.id);
    if (existe) {
        console.log(`[RetryQueue] Conversa ${conversa.id} já está na fila — ignorando duplicata`);
        return;
    }
    const proxima = new Date(Date.now() + RETRY_DELAYS_MS[0]);
    db.prepare(`
        INSERT INTO ia_retry_queue (conversa_id, wa_jid, conteudo, msg_referencia_id, tentativas, proxima_tentativa)
        VALUES (?, ?, ?, ?, 0, ?)
    `).run(conversa.id, conversa.wa_jid || '', conteudo, msgReferenciaId, proxima.toISOString());
    console.log(`[RetryQueue] Enfileirado conversa ${conversa.id} — próxima tentativa em 10s`);
}

// ───────────────────────────────────────────
// Processar um item da fila
// ───────────────────────────────────────────
async function processEntry(entry) {
    // Se a conversa saiu do status 'ia' (operador assumiu, cliente pausado, etc.) → cancela
    const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(entry.conversa_id);
    if (!conversa || conversa.status !== 'ia') {
        db.prepare('DELETE FROM ia_retry_queue WHERE id = ?').run(entry.id);
        console.log(`[RetryQueue] Conversa ${entry.conversa_id} não está mais em ia — retry cancelado`);
        return;
    }

    // Verificar se o cliente já respondeu depois da falha (nova mensagem do cliente após o item da fila)
    const ultimaMsgCliente = db.prepare(`
        SELECT id FROM chat_mensagens
        WHERE conversa_id = ? AND remetente = 'cliente'
        ORDER BY id DESC LIMIT 1
    `).get(entry.conversa_id);
    const primeiraMsgNaFila = db.prepare(`
        SELECT id FROM chat_mensagens WHERE conversa_id = ? ORDER BY id ASC LIMIT 1
    `).get(entry.conversa_id); // só pra ter referência de quando a fila foi criada
    if (ultimaMsgCliente && ultimaMsgCliente.id > entry.msg_referencia_id) {
        // Cliente mandou nova mensagem desde então — o webhook já tratou. Cancela o retry.
        db.prepare('DELETE FROM ia_retry_queue WHERE id = ?').run(entry.id);
        console.log(`[RetryQueue] Cliente ${entry.conversa_id} já respondeu — retry obsoleto, removendo`);
        return;
    }

    console.log(`[RetryQueue] Tentativa ${entry.tentativas + 1}/${MAX_TENTATIVAS} para conversa ${entry.conversa_id}`);

    try {
        const result = await aiSvc.processIncomingMessage(conversa, entry.conteudo);

        if (!result?.text) {
            db.prepare('DELETE FROM ia_retry_queue WHERE id = ?').run(entry.id);
            return;
        }

        // Importar evolution dinamicamente para evitar circular deps
        const { default: evolution } = await import('./evolution.js');
        const dest = entry.wa_jid;
        const parts = result.text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

        for (let i = 0; i < parts.length; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, 800));
            try {
                await evolution.sendText(dest, parts[i]);
                db.prepare(`
                    INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                    VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
                `).run(entry.conversa_id, parts[i]);
            } catch (sendErr) {
                console.error(`[RetryQueue] Falha ao enviar parte para ${dest}:`, sendErr.message);
                break;
            }
        }

        db.prepare('DELETE FROM ia_retry_queue WHERE id = ?').run(entry.id);
        console.log(`[RetryQueue] ✓ Sucesso na tentativa ${entry.tentativas + 1} para conversa ${entry.conversa_id}`);

    } catch (err) {
        const novasTentativas = entry.tentativas + 1;
        if (novasTentativas >= MAX_TENTATIVAS) {
            console.error(`[RetryQueue] ✗ Desistindo após ${novasTentativas} tentativas para conversa ${entry.conversa_id}: ${err.message}`);
            db.prepare('DELETE FROM ia_retry_queue WHERE id = ?').run(entry.id);
            return;
        }
        const delay = RETRY_DELAYS_MS[novasTentativas];
        const proxima = new Date(Date.now() + delay);
        db.prepare('UPDATE ia_retry_queue SET tentativas = ?, proxima_tentativa = ? WHERE id = ?')
            .run(novasTentativas, proxima.toISOString(), entry.id);
        const delayLabel = delay >= 3600000 ? `${delay / 3600000}h` : delay >= 60000 ? `${delay / 60000}min` : `${delay / 1000}s`;
        console.warn(`[RetryQueue] Falha tentativa ${novasTentativas} conversa ${entry.conversa_id} — próxima em ${delayLabel}: ${err.message}`);
    }
}

// ───────────────────────────────────────────
// Worker principal — verifica a fila a cada 15s
// ───────────────────────────────────────────
export function iniciarRetryQueue() {
    setInterval(async () => {
        try {
            const due = db.prepare(`
                SELECT * FROM ia_retry_queue
                WHERE proxima_tentativa <= datetime('now')
                ORDER BY proxima_tentativa ASC
                LIMIT 5
            `).all();

            for (const entry of due) {
                await processEntry(entry).catch(e =>
                    console.error('[RetryQueue] Erro inesperado ao processar entry:', e.message)
                );
            }
        } catch (e) {
            console.error('[RetryQueue] Erro no worker:', e.message);
        }
    }, 15_000);

    console.log('[RetryQueue] Worker iniciado — retries: 10s → 2min → 10min → 30min → 2h');
}
