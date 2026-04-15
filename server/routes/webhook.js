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

// ═══════════════════════════════════════════════════════
// POST /api/webhook/whatsapp — recebe mensagens do Evolution API
// PÚBLICO (sem auth JWT) — validado via webhook token
// ═══════════════════════════════════════════════════════
router.post('/whatsapp', async (req, res) => {
    // Validar webhook token
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

        console.log('[Webhook] Evento recebido:', event, '| sender:', body.sender, '| data.key:', JSON.stringify(body.data?.key), '| participant:', body.data?.participant);

        if (event === 'messages.upsert') {
            await handleIncomingMessage(body.data || body);
        } else if (event === 'messages.update') {
            await handleMessageStatusUpdate(body.data || body);
        }
    } catch (err) {
        console.error('[Webhook] Erro ao processar:', err.message);
    }
});

// ═══ Processar mensagem recebida ═══
async function handleIncomingMessage(data) {
    if (!data || !data.key) return;

    // Ignorar mensagens enviadas por nós
    if (data.key.fromMe) return;

    const remoteJid = data.key.remoteJid || '';
    // Ignorar grupos
    if (remoteJid.includes('@g.us')) return;
    if (remoteJid.includes('@broadcast')) return;

    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
    if (!phone) return;

    // Extrair conteúdo da mensagem
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
    const waMessageId = data.key.id || '';

    // Ignorar mensagens de texto vazias
    if (!messageContent && messageType === 'texto') return;

    // Buscar conversa por jid (preferido) ou por phone (fallback)
    let conversa = db.prepare('SELECT * FROM chat_conversas WHERE wa_jid = ? OR wa_phone = ?').get(remoteJid, phone);

    if (!conversa) {
        // Tentar vincular por telefone do cliente (últimos 8 dígitos)
        const lastDigits = phone.slice(-8);
        let clienteId = null;
        // Só buscar cliente se o phone parece um número real (não @lid)
        if (!remoteJid.includes('@lid')) {
            const cli = db.prepare("SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?").get(`%${lastDigits}%`);
            if (cli) clienteId = cli.id;
        }

        const result = db.prepare(
            'INSERT INTO chat_conversas (cliente_id, wa_phone, wa_jid, wa_name, status, nao_lidas, ultimo_msg_em) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)'
        ).run(clienteId, phone, remoteJid, pushName, 'ia');

        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(result.lastInsertRowid);
    } else {
        // Atualizar conversa (garantir que wa_jid está preenchido)
        db.prepare(
            'UPDATE chat_conversas SET nao_lidas = nao_lidas + 1, ultimo_msg_em = CURRENT_TIMESTAMP, wa_name = COALESCE(NULLIF(?, \'\'), wa_name), wa_jid = COALESCE(NULLIF(?, \'\'), wa_jid) WHERE id = ?'
        ).run(pushName, remoteJid, conversa.id);
        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(conversa.id);
    }

    // Verificar duplicata (mesmo wa_message_id)
    if (waMessageId) {
        const exists = db.prepare('SELECT id FROM chat_mensagens WHERE wa_message_id = ?').get(waMessageId);
        if (exists) return; // Mensagem duplicada
    }

    // Baixar mídia se não for texto puro
    let mediaUrl = '';
    if (messageType !== 'texto' && waMessageId) {
        try {
            mediaUrl = await downloadMedia(data.key, messageType);
        } catch (err) {
            console.error('[Webhook] Erro ao baixar mídia:', err.message);
        }
    }

    // Armazenar mensagem recebida
    db.prepare(`
        INSERT INTO chat_mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, media_url, remetente, criado_em)
        VALUES (?, ?, 'entrada', ?, ?, ?, 'cliente', CURRENT_TIMESTAMP)
    `).run(conversa.id, waMessageId, messageType, messageContent || `[${messageType}]`, mediaUrl);

    // Se conversa está em modo IA, auto-responder
    const dest = conversa.wa_jid || remoteJid || phone;
    if (conversa.status === 'ia' && messageContent) {
        try {
            const result = await ai.processIncomingMessage(conversa, messageContent);

            if (!result) return; // IA não configurada/ativa

            if (result.action === 'escalate') {
                // Escalar para humano
                db.prepare('UPDATE chat_conversas SET status = ? WHERE id = ?').run('humano', conversa.id);
                // Enviar mensagem de transição
                const transMsg = 'Um momento! Vou transferir seu atendimento para nossa equipe. Já já alguém vai te responder!';
                try {
                    await evolution.sendText(dest, transMsg);
                    db.prepare(`
                        INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                        VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
                    `).run(conversa.id, transMsg);
                } catch (_) { /* silencioso */ }
            } else if (result.text) {
                // Enviar resposta da IA via WhatsApp
                await evolution.sendText(dest, result.text);
                // Armazenar resposta
                db.prepare(`
                    INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                    VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
                `).run(conversa.id, result.text);
            }
        } catch (err) {
            console.error('[Webhook] Erro no processamento IA:', err.message);
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
    if (!data || !data.key?.id) return;
    const statusMap = { 3: 'lido', 2: 'entregue', 1: 'enviado' };
    const status = statusMap[data.status] || 'enviado';
    db.prepare('UPDATE chat_mensagens SET status_envio = ? WHERE wa_message_id = ?').run(status, data.key.id);
}

export default router;
