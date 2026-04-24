// ═══════════════════════════════════════════════════════
// Hot Silent Watcher — lead quente que parou de responder
// ═══════════════════════════════════════════════════════
// Detecta leads com score ≥65 que não respondem há 72h+ e
// dispara webhook 'lead_quente_silencioso' pro n8n (normalmente
// pra acionar retargeting Meta Ads / Google Ads).
//
// Cooldown: 14 dias entre disparos pro mesmo cliente (pra não
// queimar budget com o mesmo lead toda semana).
//
// Loop: 1h (processa em batches de 20 por vez).

import db from '../db.js';
import { dispatchOutbound } from './webhook_outbound.js';

const SCORE_MIN = 65;
const HORAS_SILENCIO = 72;
const COOLDOWN_DIAS = 14;
const BATCH_SIZE = 20;

// Retorna último horário em que o CLIENTE enviou mensagem (direção 'entrada')
function ultimoInboundEm(conversaId) {
    const row = db.prepare(`
        SELECT MAX(criado_em) as t FROM chat_mensagens
         WHERE conversa_id = ? AND direcao = 'entrada'
    `).get(conversaId);
    return row?.t || null;
}

async function processar() {
    try {
        // Conversas candidatas: score alto, não bloqueadas, não abandonadas
        const conversas = db.prepare(`
            SELECT c.id as conv_id, c.cliente_id, c.wa_phone, c.lead_score,
                   c.classificacao, c.status, c.tags, c.ultimo_msg_em,
                   c.lead_quente_disparado_em,
                   cli.nome, cli.tel, cli.email
              FROM chat_conversas c
              LEFT JOIN clientes cli ON cli.id = c.cliente_id
             WHERE c.lead_score >= ?
               AND COALESCE(c.ia_bloqueada, 0) = 0
               AND COALESCE(c.abandonada, 0) = 0
               AND (c.lead_quente_disparado_em IS NULL
                    OR julianday('now') - julianday(c.lead_quente_disparado_em) >= ?)
             LIMIT ?
        `).all(SCORE_MIN, COOLDOWN_DIAS, BATCH_SIZE * 3);

        let disparados = 0;
        for (const conv of conversas) {
            // Checa silêncio real: último INBOUND do cliente > 72h atrás
            const ultInbound = ultimoInboundEm(conv.conv_id);
            if (!ultInbound) continue; // cliente nunca respondeu — não é "ficou silencioso"

            const horas = (Date.now() - new Date(ultInbound).getTime()) / 36e5;
            if (horas < HORAS_SILENCIO) continue;

            let tags = [];
            try { tags = JSON.parse(conv.tags || '[]'); } catch (_) {}

            const contextoAmbiente = (() => {
                try {
                    const ctx = db.prepare(`
                        SELECT tipo_projeto, ambiente, faixa_investimento, bairro, estagio
                          FROM orcamentos WHERE cliente_id = ? ORDER BY id DESC LIMIT 1
                    `).get(conv.cliente_id);
                    return ctx || {};
                } catch { return {}; }
            })();

            const payload = {
                lead: {
                    cliente_id: conv.cliente_id,
                    nome: conv.nome || '',
                    telefone: conv.tel || conv.wa_phone || '',
                    email: conv.email || '',
                    score: conv.lead_score,
                    classificacao: conv.classificacao || '',
                    status_conversa: conv.status,
                    tags,
                    ambiente: contextoAmbiente.ambiente || '',
                    tipo_projeto: contextoAmbiente.tipo_projeto || '',
                    bairro: contextoAmbiente.bairro || '',
                    estagio: contextoAmbiente.estagio || '',
                    faixa_investimento: contextoAmbiente.faixa_investimento || '',
                    ultima_mensagem_cliente_em: ultInbound,
                    horas_em_silencio: Math.round(horas),
                },
            };

            await dispatchOutbound('lead_quente_silencioso', payload, {
                referenciaId: conv.cliente_id,
                referenciaTipo: 'cliente',
            });

            db.prepare('UPDATE chat_conversas SET lead_quente_disparado_em = CURRENT_TIMESTAMP WHERE id = ?').run(conv.conv_id);
            disparados++;
            if (disparados >= BATCH_SIZE) break;
        }

        if (disparados > 0) console.log(`[HotSilent] ${disparados} lead(s) quente(s) silencioso(s) disparado(s) pro n8n`);
    } catch (err) {
        console.error('[HotSilent] erro:', err.message);
    }
}

export function iniciarHotSilentWatcher() {
    setTimeout(processar, 2 * 60 * 1000);           // warmup 2min após boot
    setInterval(processar, 60 * 60 * 1000);         // loop 1h
    console.log('  [OK] Hot Silent Watcher ativado (score≥65 + 72h silêncio, cooldown 14d, loop 1h)');
}

export default { iniciarHotSilentWatcher };
