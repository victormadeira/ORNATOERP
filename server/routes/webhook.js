import { Router } from 'express';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import evolution from '../services/evolution.js';
import ai from '../services/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads', 'whatsapp');
mkdirSync(UPLOADS_DIR, { recursive: true });

const router = Router();

// ═══ Dedup em memória ═══════════════════════════════════
// Evolution v1.8 envia messages.upsert 2-4x para a mesma mensagem
// (1x com @s.whatsapp.net, 1x com @lid, cada uma duplicada)
// Usar Set em memória para filtrar por wa_message_id
const _processedIds = new Set();
function alreadyProcessed(msgId) {
    if (!msgId) return false;
    if (_processedIds.has(msgId)) return true;
    _processedIds.add(msgId);
    // Limpar para não vazar memória (manter últimos 500)
    if (_processedIds.size > 1000) {
        const arr = [..._processedIds];
        for (let i = 0; i < 500; i++) _processedIds.delete(arr[i]);
    }
    return false;
}

// ═══════════════════════════════════════════════════════
// POST /api/webhook/whatsapp — recebe eventos do Evolution API
// PÚBLICO (sem auth JWT) — validado via webhook token
// ═══════════════════════════════════════════════════════
router.post('/whatsapp', async (req, res) => {
    // Validar webhook token (opcional — só valida se configurado)
    const expectedToken = evolution.getWebhookToken();
    const receivedToken = req.headers['apikey'] || req.query.token || '';
    if (expectedToken && receivedToken !== expectedToken) {
        return res.status(401).json({ error: 'Invalid webhook token' });
    }

    // Responde 200 imediatamente para o Evolution não dar timeout
    res.status(200).json({ ok: true });

    try {
        const body = req.body;
        const event = body.event || '';

        // Log compacto
        const keyInfo = body.data?.key ? `${body.data.key.remoteJid} id=${body.data.key.id} fromMe=${body.data.key.fromMe}` : '-';
        console.log(`[WH] ${event} | ${keyInfo}`);

        if (event === 'messages.upsert') {
            await handleIncomingMessage(body.data || body);
        } else if (event === 'messages.update') {
            await handleMessageStatusUpdate(body.data || body);
        }
    } catch (err) {
        console.error('[WH] Erro:', err.message);
    }
});

// ═══════════════════════════════════════════════════════
// PROCESSAR MENSAGEM RECEBIDA
// ═══════════════════════════════════════════════════════
async function handleIncomingMessage(data) {
    if (!data?.key) return;

    const msgId = data.key.id;
    const remoteJid = data.key.remoteJid || '';

    // ── 1. Filtros básicos ──
    if (data.key.fromMe) return;                         // Ignorar nossas próprias msgs
    if (remoteJid.includes('@g.us')) return;              // Ignorar grupos
    if (remoteJid.includes('@broadcast')) return;         // Ignorar broadcast

    // ── 2. Dedup em memória (Evolution envia o mesmo evento 2-4x) ──
    // Se chegar primeiro com @s.whatsapp.net, o @lid subsequente será descartado aqui
    if (alreadyProcessed(msgId)) return;

    // ── 3. Resolver formato (@lid ou @s.whatsapp.net) ──
    // Estratégia: se já temos uma conversa com esse @lid, reusar o wa_phone salvo.
    // Caso contrário, aceitar o @lid (usuário pode vincular o número manualmente depois).
    let finalJid = remoteJid;
    let finalPhone = '';

    if (remoteJid.includes('@lid')) {
        // 1. Verificar se já temos conversa existente com este LID e número real salvo
        const existingByJid = db.prepare('SELECT wa_phone FROM chat_conversas WHERE wa_jid = ?').get(remoteJid);
        if (existingByJid?.wa_phone && /^55\d{10,11}$/.test(existingByJid.wa_phone)) {
            finalPhone = existingByJid.wa_phone;
            finalJid = `${finalPhone}@s.whatsapp.net`;
        } else if (data.pushName) {
            // 2. Tentar casar com conversa existente pelo pushName (nome do contato no WhatsApp)
            // Muito útil quando o mesmo contato chega 1x como @s.whatsapp.net e depois como @lid
            const byName = db.prepare(
                "SELECT wa_phone, wa_jid FROM chat_conversas WHERE wa_name = ? AND wa_jid LIKE '%@s.whatsapp.net' LIMIT 1"
            ).get(data.pushName);
            if (byName?.wa_phone && /^55\d{10,11}$/.test(byName.wa_phone)) {
                finalPhone = byName.wa_phone;
                finalJid = byName.wa_jid;
                console.log(`[WH] LID ${remoteJid} casado com conversa existente via pushName="${data.pushName}" → ${finalJid}`);
            } else {
                finalPhone = remoteJid.replace('@lid', '');
            }
        } else {
            finalPhone = remoteJid.replace('@lid', '');
        }
    } else {
        finalPhone = remoteJid.replace('@s.whatsapp.net', '');
    }

    const phone = finalPhone;
    if (!phone || phone.length < 8) return;

    const messageContent = data.message?.conversation
        || data.message?.extendedTextMessage?.text
        || data.message?.imageMessage?.caption
        || '';
    const messageType = data.message?.imageMessage ? 'imagem'
        : data.message?.videoMessage ? 'video'
        : data.message?.audioMessage ? 'audio'
        : data.message?.documentMessage ? 'documento'
        : data.message?.stickerMessage ? 'sticker'
        : 'texto';
    const pushName = data.pushName || '';

    // Ignorar mensagens de texto vazias (mas processar mídia sem caption)
    if (!messageContent && messageType === 'texto') return;

    // ── 5. Buscar ou criar conversa ──
    // Busca pelo remoteJid original OU pelo finalJid (caso o LID tenha sido resolvido) OU pelo phone
    let conversa = db.prepare(
        'SELECT * FROM chat_conversas WHERE wa_jid = ? OR wa_jid = ? OR wa_phone = ?'
    ).get(remoteJid, finalJid, phone);

    if (!conversa) {
        // Tentar vincular a cliente existente (últimos 8 dígitos do telefone)
        const lastDigits = phone.slice(-8);
        let clienteId = null;
        // Só procurar cliente se o phone parece um número real (começa com 55)
        if (/^55\d{10,11}$/.test(phone)) {
            const cli = db.prepare(
                "SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?"
            ).get(`%${lastDigits}%`);
            if (cli) clienteId = cli.id;
        }

        const result = db.prepare(
            'INSERT INTO chat_conversas (cliente_id, wa_phone, wa_jid, wa_name, status, nao_lidas, ultimo_msg_em) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)'
        ).run(clienteId, phone, finalJid, pushName, 'ia');

        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(result.lastInsertRowid);
        console.log(`[WH] Nova conversa #${conversa.id} | ${pushName} | ${phone} | jid=${finalJid}`);
    } else {
        // Atualizar conversa — preferir JID real (@s.whatsapp.net) se disponível
        const keepJid = (!finalJid.includes('@lid')) ? finalJid : (conversa.wa_jid && !conversa.wa_jid.includes('@lid') ? conversa.wa_jid : finalJid);
        db.prepare(
            'UPDATE chat_conversas SET nao_lidas = nao_lidas + 1, ultimo_msg_em = CURRENT_TIMESTAMP, wa_name = COALESCE(NULLIF(?, \'\'), wa_name), wa_jid = ? WHERE id = ?'
        ).run(pushName, keepJid, conversa.id);
        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(conversa.id);
    }

    // ── 6. Verificar duplicata no banco (fallback do dedup em memória) ──
    if (msgId) {
        const exists = db.prepare('SELECT id FROM chat_mensagens WHERE wa_message_id = ?').get(msgId);
        if (exists) return;
    }

    // ── 7. Baixar mídia + processar (áudio→transcrição, imagem→descrição) ──
    let mediaUrl = '';
    let enrichedContent = messageContent;

    if (messageType !== 'texto' && msgId) {
        try {
            mediaUrl = await downloadMedia(data.key, messageType);
        } catch (err) {
            console.error('[WH] Erro download mídia:', err.message);
        }

        // Para áudio e imagem, a IA precisa entender — enriquecer o content
        if ((messageType === 'audio' || messageType === 'imagem') && conversa.status === 'ia' || !conversa) {
            try {
                const base64 = await evolution.baixarMidiaBase64(data.key);
                if (base64) {
                    if (messageType === 'audio') {
                        const transcricao = await ai.transcreverAudio(base64, 'audio/ogg');
                        enrichedContent = `[áudio transcrito] ${transcricao}`;
                        console.log(`[WH] Áudio transcrito (${transcricao.length} chars)`);
                    } else if (messageType === 'imagem') {
                        const desc = await ai.descreverImagem(base64, 'image/jpeg');
                        enrichedContent = (messageContent ? `${messageContent}\n` : '') + `[imagem enviada — descrição: ${desc}]`;
                        console.log(`[WH] Imagem descrita: ${desc.slice(0, 80)}`);
                    }
                }
            } catch (err) {
                console.error(`[WH] Erro processar ${messageType}:`, err.message);
            }
        }
    }

    // ── 8. Salvar mensagem (com conteúdo enriquecido) ──
    db.prepare(`
        INSERT INTO chat_mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, media_url, remetente, criado_em)
        VALUES (?, ?, 'entrada', ?, ?, ?, 'cliente', CURRENT_TIMESTAMP)
    `).run(conversa.id, msgId, messageType, enrichedContent || `[${messageType}]`, mediaUrl);

    console.log(`[WH] Msg salva | conv #${conversa.id} | ${messageType} | ${pushName}`);

    // ── 9. Resposta automática da IA (se ativo) ──
    if (conversa.status === 'ia' && enrichedContent) {
        try {
            // Typing indicator antes de chamar a IA (~3s)
            const dest = conversa.wa_jid || remoteJid;
            evolution.sendPresence(dest, 'composing', 3000).catch(() => { });

            const result = await ai.processIncomingMessage(conversa, enrichedContent);
            if (!result) return;

            // Dividir resposta em mensagens separadas (quebra dupla = nova mensagem)
            const parts = (result.text || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);

            if (result.action === 'escalate') {
                db.prepare(`UPDATE chat_conversas SET status = ?, handoff_em = COALESCE(handoff_em, CURRENT_TIMESTAMP), escalacao_nivel = 0, abandonada = 0 WHERE id = ?`).run('humano', conversa.id);
            }

            // Enviar cada parte com um pequeno delay de typing entre elas
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i > 0) {
                    // Typing curto antes da próxima parte (~1.5s)
                    evolution.sendPresence(dest, 'composing', 1500).catch(() => { });
                    await new Promise(r => setTimeout(r, 800));
                }
                try {
                    await evolution.sendText(dest, part);
                    db.prepare(`
                        INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                        VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
                    `).run(conversa.id, part);
                } catch (e) {
                    console.error('[WH] Erro enviar parte:', e.message);
                    break;
                }
            }

            // Se escalou e não havia texto, manda fallback
            if (result.action === 'escalate' && parts.length === 0) {
                const fallback = 'Um momento! Vou transferir seu atendimento para nossa equipe comercial. Retornamos em breve.';
                try {
                    await evolution.sendText(dest, fallback);
                    db.prepare(`
                        INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                        VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
                    `).run(conversa.id, fallback);
                } catch (_) { /* silencioso */ }
            }
        } catch (err) {
            console.error('[WH] Erro IA:', err.message);
        }
    }
}

// ═══ Baixar mídia via Evolution API ═══
async function downloadMedia(messageKey, messageType) {
    const cfg = db.prepare(
        'SELECT wa_instance_url, wa_instance_name, wa_api_key FROM empresa_config WHERE id = 1'
    ).get();
    if (!cfg?.wa_instance_url) return '';

    const url = `${cfg.wa_instance_url}/chat/getBase64FromMediaMessage/${cfg.wa_instance_name}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.wa_api_key },
        body: JSON.stringify({
            message: { key: messageKey },
            convertToMp4: false,
        }),
    });
    if (!res.ok) throw new Error(`Evolution media API: ${res.status}`);

    const data = await res.json();
    if (!data.base64) return '';

    const ext = { imagem: 'jpg', video: 'mp4', audio: 'ogg', documento: 'pdf', sticker: 'webp' }[messageType] || 'bin';
    const filename = `${messageKey.id}.${ext}`;
    const filepath = join(UPLOADS_DIR, filename);

    writeFileSync(filepath, Buffer.from(data.base64, 'base64'));
    return `/uploads/whatsapp/${filename}`;
}

// ═══ Atualizar status de entrega/leitura ═══
async function handleMessageStatusUpdate(data) {
    if (!data?.key?.id) return;
    const statusMap = { 3: 'lido', 2: 'entregue', 1: 'enviado' };
    const status = statusMap[data.status] || 'enviado';
    db.prepare('UPDATE chat_mensagens SET status_envio = ? WHERE wa_message_id = ?').run(status, data.key.id);
}

export default router;
