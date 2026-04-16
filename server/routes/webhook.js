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

// ═══ Dedup em memória (Evolution v1.8 envia messages.upsert duplicado) ═══
const _processedMsgIds = new Set();
function isDuplicate(msgId) {
    if (!msgId) return false;
    if (_processedMsgIds.has(msgId)) return true;
    _processedMsgIds.add(msgId);
    // Limpar IDs antigos a cada 1000 entradas para não vazar memória
    if (_processedMsgIds.size > 1000) {
        const arr = [..._processedMsgIds];
        arr.splice(0, 500).forEach(id => _processedMsgIds.delete(id));
    }
    return false;
}

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
        // sender contém o número real da instância (ex: 559887015547@s.whatsapp.net)
        // body.sender é quem é o dono da instância, não quem enviou
        const senderInstance = body.sender || '';

        console.log('[Webhook] Evento recebido:', event, '| sender:', senderInstance, '| data.key:', JSON.stringify(body.data?.key), '| participant:', body.data?.participant);

        if (event === 'messages.upsert') {
            await handleIncomingMessage(body.data || body, senderInstance);
        } else if (event === 'messages.update') {
            await handleMessageStatusUpdate(body.data || body);
        }
    } catch (err) {
        console.error('[Webhook] Erro ao processar:', err.message);
    }
});

// ═══ Processar mensagem recebida ═══
async function handleIncomingMessage(data, senderInstance) {
    if (!data || !data.key) return;

    // Dedup rápido em memória (Evolution v1.8 envia o mesmo evento 2x)
    if (isDuplicate(data.key.id)) return;

    // Ignorar mensagens enviadas por nós
    if (data.key.fromMe) return;

    const remoteJid = data.key.remoteJid || '';
    // Ignorar grupos
    if (remoteJid.includes('@g.us')) return;
    if (remoteJid.includes('@broadcast')) return;

    // ═══ Resolver LID → número real ═══
    // WhatsApp agora envia remoteJid como @lid (Linked ID) em vez de @s.whatsapp.net
    // Evolution v1.8 não consegue enviar para @lid, precisa do número real
    let realPhone = '';
    let realJid = remoteJid;

    if (remoteJid.includes('@lid')) {
        // O WhatsApp usa LID (Linked ID) internamente — Evolution v1.8 não suporta envio para @lid
        // Estratégia: buscar o número real via API de contatos da Evolution
        try {
            const cfg = db.prepare('SELECT wa_instance_url, wa_instance_name, wa_api_key FROM empresa_config WHERE id = 1').get();
            if (cfg?.wa_instance_url) {
                // 1. Buscar contato pelo LID
                const contactRes = await fetch(`${cfg.wa_instance_url}/chat/findContacts/${cfg.wa_instance_name}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': cfg.wa_api_key },
                    body: JSON.stringify({ where: { id: remoteJid } }),
                });
                if (contactRes.ok) {
                    const contacts = await contactRes.json();
                    const contact = contacts[0];
                    // Se o contato retornar um number real
                    if (contact?.number) {
                        realPhone = contact.number.replace(/\D/g, '');
                        realJid = `${realPhone}@s.whatsapp.net`;
                        console.log(`[Webhook] LID ${remoteJid} resolvido para ${realJid} via contact.number`);
                    }
                }

                // 2. Se não resolveu, tentar via profilePicture/whatsapp check com o pushName
                if (!realPhone && data.pushName) {
                    // Buscar todos contatos e encontrar o que tem @s.whatsapp.net com mesmo pushName
                    const allRes = await fetch(`${cfg.wa_instance_url}/chat/findContacts/${cfg.wa_instance_name}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'apikey': cfg.wa_api_key },
                        body: JSON.stringify({ where: {} }),
                    });
                    if (allRes.ok) {
                        const allContacts = await allRes.json();
                        // Procurar contato com mesmo pushName que tenha @s.whatsapp.net
                        const match = allContacts.find(c =>
                            c.pushName === data.pushName &&
                            c.id.includes('@s.whatsapp.net') &&
                            c.id !== remoteJid
                        );
                        if (match) {
                            realPhone = match.id.replace('@s.whatsapp.net', '');
                            realJid = match.id;
                            console.log(`[Webhook] LID ${remoteJid} resolvido para ${realJid} via pushName match`);
                        }
                    }
                }
            }
        } catch (err) {
            console.log('[Webhook] Erro ao resolver LID:', err.message);
        }

        // 3. Verificar se já temos o número real salvo no banco para este LID
        if (!realPhone || realPhone === remoteJid.replace('@lid', '')) {
            const existingConv = db.prepare('SELECT wa_phone FROM chat_conversas WHERE wa_jid = ? OR wa_jid = ?').get(remoteJid, remoteJid);
            if (existingConv?.wa_phone && existingConv.wa_phone.match(/^55\d{10,11}$/)) {
                realPhone = existingConv.wa_phone;
                realJid = `${realPhone}@s.whatsapp.net`;
                console.log(`[Webhook] LID ${remoteJid} resolvido para ${realJid} via banco`);
            }
        }

        // Fallback: usar o LID como identificador
        if (!realPhone) {
            realPhone = remoteJid.replace('@lid', '');
            console.log(`[Webhook] LID ${remoteJid} NÃO resolvido — mensagens não poderão ser enviadas até o número ser vinculado manualmente`);
        }
    } else {
        realPhone = remoteJid.replace('@s.whatsapp.net', '');
    }

    const phone = realPhone;
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

    // Buscar conversa por jid original (@lid ou @s.whatsapp.net), jid real, ou phone
    let conversa = db.prepare('SELECT * FROM chat_conversas WHERE wa_jid = ? OR wa_jid = ? OR wa_phone = ?').get(remoteJid, realJid, phone);

    if (!conversa) {
        // Tentar vincular por telefone do cliente (últimos 8 dígitos)
        const lastDigits = phone.slice(-8);
        let clienteId = null;
        // Buscar cliente pelo phone real (não pelo LID)
        if (realPhone && !realPhone.match(/^\d{15,}$/)) {
            const cli = db.prepare("SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?").get(`%${lastDigits}%`);
            if (cli) clienteId = cli.id;
        }

        const result = db.prepare(
            'INSERT INTO chat_conversas (cliente_id, wa_phone, wa_jid, wa_name, status, nao_lidas, ultimo_msg_em) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)'
        ).run(clienteId, phone, realJid, pushName, 'ia');

        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(result.lastInsertRowid);
    } else {
        // Atualizar conversa — se era @lid e agora temos o real, atualizar para @s.whatsapp.net
        const updateJid = (realJid !== remoteJid && !realJid.includes('@lid')) ? realJid : conversa.wa_jid;
        db.prepare(
            'UPDATE chat_conversas SET nao_lidas = nao_lidas + 1, ultimo_msg_em = CURRENT_TIMESTAMP, wa_name = COALESCE(NULLIF(?, \'\'), wa_name), wa_jid = ?, wa_phone = COALESCE(NULLIF(?, \'\'), wa_phone) WHERE id = ?'
        ).run(pushName, updateJid, phone, conversa.id);
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
    // Usar realJid (@s.whatsapp.net) para envio — Evolution v1.8 não envia para @lid
    const dest = (conversa.wa_jid && !conversa.wa_jid.includes('@lid')) ? conversa.wa_jid : (realJid || phone);
    if (conversa.status === 'ia' && messageContent) {
        try {
            const result = await ai.processIncomingMessage(conversa, messageContent);

            if (!result) return; // IA não configurada/ativa

            if (result.action === 'escalate') {
                // Escalar para humano
                db.prepare('UPDATE chat_conversas SET status = ? WHERE id = ?').run('humano', conversa.id);
                // Enviar mensagem de transição — usar mensagem da Sofia se disponível
                const transMsg = result.text || 'Um momento! Vou transferir seu atendimento para nossa equipe. Já já alguém vai te responder!';
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
