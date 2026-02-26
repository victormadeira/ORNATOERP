import { Router } from 'express';
import db from '../db.js';
import evolution from '../services/evolution.js';
import ai from '../services/ai.js';

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

        if (event === 'messages.upsert') {
            await handleIncomingMessage(body.data || body);
        } else if (event === 'messages.update') {
            await handleMessageStatusUpdate(body.data || body);
        }
        // connection.update — log apenas, sem ação
    } catch (err) {
        console.error('[Webhook] Erro ao processar:', err.message);
    }
});

// ═══ Processar mensagem recebida ═══
async function handleIncomingMessage(data) {
    const msg = data?.message || data;
    if (!msg || !msg.key) return;

    // Ignorar mensagens enviadas por nós
    if (msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid || '';
    // Ignorar grupos por enquanto
    if (remoteJid.includes('@g.us')) return;

    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    if (!phone) return;

    // Extrair conteúdo da mensagem
    const messageContent = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || '';
    const messageType = msg.message?.imageMessage ? 'imagem'
        : msg.message?.audioMessage ? 'audio'
        : msg.message?.documentMessage ? 'documento'
        : 'texto';
    const pushName = msg.pushName || '';
    const waMessageId = msg.key.id || '';

    // Ignorar mensagens de texto vazias
    if (!messageContent && messageType === 'texto') return;

    // Buscar ou criar conversa
    let conversa = db.prepare('SELECT * FROM chat_conversas WHERE wa_phone = ?').get(phone);

    if (!conversa) {
        // Tentar vincular por telefone do cliente (últimos 8 dígitos)
        const lastDigits = phone.slice(-8);
        let clienteId = null;
        const cli = db.prepare("SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?").get(`%${lastDigits}%`);
        if (cli) clienteId = cli.id;

        const result = db.prepare(
            'INSERT INTO chat_conversas (cliente_id, wa_phone, wa_name, status, nao_lidas, ultimo_msg_em) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)'
        ).run(clienteId, phone, pushName, 'ia');

        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(result.lastInsertRowid);
    } else {
        // Atualizar conversa
        db.prepare(
            'UPDATE chat_conversas SET nao_lidas = nao_lidas + 1, ultimo_msg_em = CURRENT_TIMESTAMP, wa_name = COALESCE(NULLIF(?, \'\'), wa_name) WHERE id = ?'
        ).run(pushName, conversa.id);
        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(conversa.id);
    }

    // Verificar duplicata (mesmo wa_message_id)
    if (waMessageId) {
        const exists = db.prepare('SELECT id FROM chat_mensagens WHERE wa_message_id = ?').get(waMessageId);
        if (exists) return; // Mensagem duplicada
    }

    // Armazenar mensagem recebida
    db.prepare(`
        INSERT INTO chat_mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, remetente, criado_em)
        VALUES (?, ?, 'entrada', ?, ?, 'cliente', CURRENT_TIMESTAMP)
    `).run(conversa.id, waMessageId, messageType, messageContent || `[${messageType}]`);

    // Se conversa está em modo IA, auto-responder
    if (conversa.status === 'ia' && messageContent) {
        try {
            const result = await ai.processIncomingMessage(conversa, messageContent);

            if (!result) return; // IA não configurada/ativa

            if (result.action === 'escalate') {
                // Escalar para humano
                db.prepare('UPDATE chat_conversas SET status = ? WHERE id = ?').run('humano', conversa.id);
                // Enviar mensagem de transição
                const transMsg = 'Um momento! Vou transferir seu atendimento para nossa equipe. Já já alguém vai te responder! 😊';
                try {
                    await evolution.sendText(phone, transMsg);
                    db.prepare(`
                        INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, criado_em)
                        VALUES (?, 'saida', 'texto', ?, 'ia', CURRENT_TIMESTAMP)
                    `).run(conversa.id, transMsg);
                } catch (_) { /* silencioso */ }
            } else if (result.text) {
                // Enviar resposta da IA via WhatsApp
                await evolution.sendText(phone, result.text);
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

// ═══ Atualizar status de entrega/leitura ═══
async function handleMessageStatusUpdate(data) {
    if (!data || !data.key?.id) return;
    const statusMap = { 3: 'lido', 2: 'entregue', 1: 'enviado' };
    const status = statusMap[data.status] || 'enviado';
    db.prepare('UPDATE chat_mensagens SET status_envio = ? WHERE wa_message_id = ?').run(status, data.key.id);
}

export default router;
