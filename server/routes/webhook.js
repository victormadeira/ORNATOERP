import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';
import evolution from '../services/evolution.js';
import wa from '../services/wa.js';
import waAvatar from '../services/wa_avatar.js';
import ai from '../services/ai.js';
import sofiaProspeccao from '../services/sofia_prospeccao.js';
import { enqueue as iaRetryEnqueue } from '../services/ia_retry_queue.js';
import { extractCtwaClid } from '../services/meta-capi.js';

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
    // Validar webhook token — SEMPRE obrigatório, dev e produção.
    // Sem token configurado o endpoint fica inacessível por design:
    // payloads de 50MB sem autenticação podem esgotar memória e consumir cota de IA.
    const expectedToken = evolution.getWebhookToken();
    // A Evolution API não envia header de autenticação de forma confiável no webhook.
    // O token vai na query string da URL (?token=...), que a Evolution preserva intacta.
    // Header apikey fica como fallback para compatibilidade.
    const receivedToken = (req.query.token || req.headers['apikey'] || '').toString().trim();
    if (!expectedToken) {
        console.error('[WH] BLOQUEADO: wa_webhook_token não configurado. Configure nas configurações do sistema.');
        return res.status(503).json({ error: 'Webhook não configurado. Defina wa_webhook_token nas configurações.' });
    }
    const a = Buffer.from(receivedToken);
    const b = Buffer.from(expectedToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        console.warn(`[SEC] /api/webhook/whatsapp — token inválido de ${req.ip}`);
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
            await handleIncomingMessage(body.data || body, req.app.locals.wsBroadcast);
        } else if (event === 'messages.update') {
            await handleMessageStatusUpdate(body.data || body, req.app.locals.wsBroadcast);
        } else if (event === 'messages.set') {
            // Lote de histórico disparado no pareamento do WhatsApp
            await handleMessagesSet(body.data || body);
        } else if (event === 'connection.update') {
            const state = body.data?.state || body.state || 'unknown';
            req.app.locals.wsBroadcast?.('whatsapp.connection', { connected: state === 'open', state });
        }
    } catch (err) {
        console.error('[WH] Erro:', err.message);
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/webhook/zapi — recebe eventos da Z-API
// PÚBLICO — validado via webhook token na query string (?token=)
// ═══════════════════════════════════════════════════════
router.post('/zapi', async (req, res) => {
    const expectedToken = evolution.getWebhookToken();
    const receivedToken = (req.query.token || '').toString().trim();
    if (!expectedToken) return res.status(503).json({ error: 'Webhook não configurado' });
    const a = Buffer.from(receivedToken), b = Buffer.from(expectedToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        console.warn(`[SEC] /api/webhook/zapi — token inválido de ${req.ip}`);
        return res.status(401).json({ error: 'Invalid webhook token' });
    }
    res.status(200).json({ ok: true });

    try {
        const z = req.body || {};
        const type = z.type || '';

        // Status de entrega (SENT/RECEIVED/READ)
        if (type === 'MessageStatusCallback' || type === 'DeliveryCallback') {
            await handleZapiStatus(z, req.app.locals.wsBroadcast);
            return;
        }
        // Conexão
        if (type === 'ConnectedCallback' || type === 'DisconnectedCallback') {
            const connected = type === 'ConnectedCallback';
            req.app.locals.wsBroadcast?.('whatsapp.connection', { connected, state: connected ? 'open' : 'close' });
            return;
        }
        // Mensagem recebida — só entrada de clientes (ignora as nossas e grupos)
        if (z.fromMe) return;
        if (z.isGroup) return;
        if (!z.phone || !z.messageId) return;

        const data = {
            key: { id: z.messageId, remoteJid: `${z.phone}@s.whatsapp.net`, fromMe: false },
            pushName: z.senderName || z.chatName || '',
            message: {},
        };
        let mediaUrlOverride = '';
        if (z.text?.message != null) {
            data.message.conversation = z.text.message;
        } else if (z.image) {
            data.message.imageMessage = { caption: z.image.caption || '', mimetype: z.image.mimeType || '' };
            mediaUrlOverride = z.image.imageUrl || '';
        } else if (z.audio) {
            data.message.audioMessage = { mimetype: z.audio.mimeType || '' };
            mediaUrlOverride = z.audio.audioUrl || '';
        } else if (z.video) {
            data.message.videoMessage = { caption: z.video.caption || '', mimetype: z.video.mimeType || '' };
            mediaUrlOverride = z.video.videoUrl || '';
        } else if (z.document) {
            data.message.documentMessage = { fileName: z.document.fileName || '', mimetype: z.document.mimeType || '' };
            mediaUrlOverride = z.document.documentUrl || '';
        } else {
            return; // tipo não suportado (sticker, location, contato, etc.)
        }
        // Extrair ctwa_clid do payload bruto ANTES do mapeamento (Z-API pode incluir referral)
        const { ctwaClid: zapiCtwaClid, sourceId: zapiSourceId } = extractCtwaClid(z);
        if (zapiCtwaClid) console.log(`[MetaCAPI] ctwa_clid detectado no payload Z-API: ${zapiCtwaClid}`);
        console.log(`[ZAPI-WH] recebida de ${z.phone} | ${z.senderName || ''} | id=${z.messageId}`);
        await handleIncomingMessage(data, req.app.locals.wsBroadcast, { mediaUrlOverride, ctwaClid: zapiCtwaClid, ctwaSourceId: zapiSourceId });
    } catch (err) {
        console.error('[ZAPI-WH] Erro:', err.message);
    }
});

// Mapeia status de entrega da Z-API → status_envio das nossas mensagens
async function handleZapiStatus(z, wsBroadcast = null) {
    const map = { SENT: 'enviado', RECEIVED: 'entregue', DELIVERED: 'entregue', READ: 'lido', VIEWED: 'lido', PLAYED: 'lido' };
    const status = map[String(z.status || '').toUpperCase()];
    if (!status) return;
    const ids = Array.isArray(z.ids) ? z.ids : (z.messageId ? [z.messageId] : []);
    for (const wid of ids) {
        const msg = db.prepare('SELECT id, conversa_id FROM chat_mensagens WHERE wa_message_id = ?').get(wid);
        if (msg) {
            db.prepare('UPDATE chat_mensagens SET status_envio = ? WHERE id = ?').run(status, msg.id);
            try { wsBroadcast?.('chat.message-status', { conversa_id: msg.conversa_id, wa_message_id: wid, status }); } catch (_) { /* */ }
        }
    }
}

// ═══════════════════════════════════════════════════════
// MESSAGES_SET — Lote de histórico que chega no pareamento
// ═══════════════════════════════════════════════════════
async function handleMessagesSet(data) {
    const msgs = data?.messages || data || [];
    const arr = Array.isArray(msgs) ? msgs : (msgs.records || []);
    if (!arr.length) return;
    console.log(`[WH] messages.set recebido — ${arr.length} mensagens`);

    // Importa função de backfill pra reaproveitar lógica idempotente
    const { default: _ } = await import('../services/whatsapp_backfill.js');
    for (const msg of arr) {
        try {
            const remoteJid = msg?.key?.remoteJid || '';
            if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) continue;
            const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
            if (!phone || phone.length < 8) continue;

            // Upsert conversa (sem incrementar nao_lidas — é histórico)
            let conversa = db.prepare('SELECT * FROM chat_conversas WHERE wa_jid = ? OR wa_phone = ?').get(remoteJid, phone);
            if (!conversa) {
                const lastDigits = phone.slice(-8);
                let clienteId = null;
                if (/^55\d{10,11}$/.test(phone)) {
                    const cli = db.prepare(
                        "SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?"
                    ).get(`%${lastDigits}%`);
                    if (cli) clienteId = cli.id;
                }
                const r = db.prepare(
                    "INSERT INTO chat_conversas (cliente_id, wa_phone, wa_jid, wa_name, status, nao_lidas, ultimo_msg_em) VALUES (?, ?, ?, ?, 'humano', 0, CURRENT_TIMESTAMP)"
                ).run(clienteId, phone, remoteJid, msg.pushName || '');
                conversa = { id: r.lastInsertRowid };
            }

            // Insere mensagem se não existe
            const msgId = msg?.key?.id;
            if (!msgId) continue;
            const exists = db.prepare('SELECT id FROM chat_mensagens WHERE wa_message_id = ?').get(msgId);
            if (exists) continue;

            const direcao = msg.key.fromMe ? 'saida' : 'entrada';
            const m = msg.message || {};
            const tipo = m.imageMessage ? 'imagem'
                : m.videoMessage ? 'video'
                : m.audioMessage ? 'audio'
                : m.documentMessage ? 'documento'
                : m.stickerMessage ? 'sticker'
                : 'texto';
            const conteudo = m.conversation
                || m.extendedTextMessage?.text
                || m.imageMessage?.caption
                || m.videoMessage?.caption
                || m.documentMessage?.caption
                || `[${tipo}]`;
            const ts = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toISOString() : new Date().toISOString();
            const remetente = msg.key.fromMe ? 'usuario' : 'cliente';

            db.prepare(`
                INSERT OR IGNORE INTO chat_mensagens
                    (conversa_id, wa_message_id, direcao, tipo, conteudo, remetente, importado, status_envio, criado_em)
                VALUES (?, ?, ?, ?, ?, ?, 1, 'enviado', ?)
            `).run(conversa.id, msgId, direcao, tipo, conteudo, remetente, ts);
        } catch (e) {
            // silencioso — processa próxima
        }
    }
    console.log(`[WH] messages.set processado`);
}

// ═══════════════════════════════════════════════════════
// PROCESSAR MENSAGEM RECEBIDA
// ═══════════════════════════════════════════════════════
async function handleIncomingMessage(data, wsBroadcast = null, opts = {}) {
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
    // Nome de arquivo e mimetype reais (documento mostra o nome no chat, como no WhatsApp)
    const docMsg = data.message?.documentMessage;
    const mediaNome = docMsg?.fileName || '';
    const mediaMime = docMsg?.mimetype
        || data.message?.imageMessage?.mimetype
        || data.message?.videoMessage?.mimetype
        || data.message?.audioMessage?.mimetype
        || '';

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
        // Foto de perfil do contato em background (não bloqueia o fluxo da mensagem)
        waAvatar.refreshAvatar(conversa.id).catch(() => {});
    } else {
        // Atualizar conversa — preferir JID real (@s.whatsapp.net) se disponível
        const keepJid = (!finalJid.includes('@lid')) ? finalJid : (conversa.wa_jid && !conversa.wa_jid.includes('@lid') ? conversa.wa_jid : finalJid);
        // Cliente respondeu → reseta a cadência de follow-up (recomeça do zero se sumir de novo)
        db.prepare(
            'UPDATE chat_conversas SET nao_lidas = nao_lidas + 1, ultimo_msg_em = CURRENT_TIMESTAMP, wa_name = COALESCE(NULLIF(?, \'\'), wa_name), wa_jid = ?, followup_etapa = 0 WHERE id = ?'
        ).run(pushName, keepJid, conversa.id);
        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(conversa.id);
    }

    // ── 6a. Capturar ctwa_clid (só na 1ª mensagem — não sobrescrever se já tem) ──
    if (!conversa.ctwa_clid) {
        // Prioridade: opts (Z-API raw payload já processado) → Evolution (extrai do data)
        const { ctwaClid, sourceId } = (opts.ctwaClid)
            ? { ctwaClid: opts.ctwaClid, sourceId: opts.ctwaSourceId }
            : extractCtwaClid(data);
        if (ctwaClid) {
            db.prepare('UPDATE chat_conversas SET ctwa_clid = ?, ctwa_source_id = ?, ctwa_em = CURRENT_TIMESTAMP WHERE id = ?')
                .run(ctwaClid, sourceId || null, conversa.id);
            conversa = { ...conversa, ctwa_clid: ctwaClid, ctwa_source_id: sourceId || null };
            console.log(`[MetaCAPI] ctwa_clid capturado: ${ctwaClid} | conv #${conversa.id}`);
        }
    }

    // ── 6b. Verificar duplicata no banco (fallback do dedup em memória) ──
    if (msgId) {
        const exists = db.prepare('SELECT id FROM chat_mensagens WHERE wa_message_id = ?').get(msgId);
        if (exists) return;
    }

    // ── 7. Baixar mídia + processar (áudio→transcrição, imagem→descrição) ──
    let mediaUrl = '';
    let enrichedContent = messageContent;

    if (messageType !== 'texto' && msgId) {
        if (opts.mediaUrlOverride) {
            // Z-API já entrega a URL da mídia pronta — usar direto (sem download via Evolution)
            mediaUrl = opts.mediaUrlOverride;
        } else {
            try {
                mediaUrl = await downloadMedia(data.key, messageType, mediaNome, mediaMime);
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
    }

    // PDF/documento: a IA SÓ deve SABER que chegou — NUNCA ler o conteúdo (PDF inteiro = token caro).
    // Marcador leve só com o nome do arquivo; vale pra qualquer provider (Z-API e Evolution).
    if (messageType === 'documento') {
        enrichedContent = (messageContent ? `${messageContent}\n` : '')
            + `[O cliente enviou um arquivo de projeto (${mediaNome || 'PDF'}). Apenas confirme que recebeu e registre — NÃO leia nem analise o conteúdo; o consultor humano cuida disso.]`;
    }

    // ── 8. Salvar mensagem (com conteúdo enriquecido) ──
    // INSERT OR IGNORE — UNIQUE INDEX em wa_message_id garante dedup
    const insertResult = db.prepare(`
        INSERT OR IGNORE INTO chat_mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, media_url, media_nome, media_mime, remetente, criado_em)
        VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?, 'cliente', CURRENT_TIMESTAMP)
    `).run(conversa.id, msgId, messageType, enrichedContent || `[${messageType}]`, mediaUrl, mediaNome, mediaMime);
    if (insertResult.changes === 0) return; // race: outra request salvou essa msg primeiro

    console.log(`[WH] Msg salva | conv #${conversa.id} | ${messageType} | ${pushName}`);

    // ── Sofia Prospect: cliente respondeu → cancelar tasks pendentes ──
    if (conversa.cliente_id) {
        try { sofiaProspeccao.cancelarTasksCliente(conversa.cliente_id, 'cliente_respondeu'); } catch (_) {}
    }

    // WS broadcast — mensagem nova do cliente
    try {
        wsBroadcast?.('chat.message', {
            conversa_id: conversa.id,
            mensagem_id: insertResult.lastInsertRowid,
            direcao: 'entrada',
            tipo: messageType,
            remetente: 'cliente',
        });
        wsBroadcast?.('chat.conversa-updated', { conversa_id: conversa.id });
    } catch (_) { /* silencioso */ }

    // ── 9. Resposta automática da IA (se ativo) ──
    const msgReferenciaId = insertResult.lastInsertRowid; // ID da msg do cliente — usado pela retry queue
    if (conversa.status === 'ia' && enrichedContent) {
        try {
            // Typing indicator antes de chamar a IA (~3s)
            const dest = conversa.wa_jid || remoteJid;
            wa.sendPresence(dest, 'composing', 3000).catch(() => { });

            const result = await ai.processIncomingMessage(conversa, enrichedContent);
            if (!result) return;

            // Dividir resposta em mensagens separadas (quebra dupla = nova mensagem)
            const parts = (result.text || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);

            if (result.action === 'escalate') {
                db.prepare(`UPDATE chat_conversas SET status = ?, handoff_em = COALESCE(handoff_em, CURRENT_TIMESTAMP), escalacao_nivel = 0, abandonada = 0 WHERE id = ?`).run('humano', conversa.id);
                try { wsBroadcast?.('chat.conversa-updated', { conversa_id: conversa.id }); } catch (_) { /* silencioso */ }
            }

            // Enviar cada parte com um pequeno delay de typing entre elas
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i > 0) {
                    // Typing curto antes da próxima parte (~1.5s)
                    wa.sendPresence(dest, 'composing', 1500).catch(() => { });
                    await new Promise(r => setTimeout(r, 800));
                }
                // Salva no banco ANTES de tentar enviar — assim a resposta nunca se perde
                // mesmo que a Evolution rejeite (ex: contato @lid sem número real)
                const aiInsert = db.prepare(`
                    INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, status_envio, criado_em)
                    VALUES (?, 'saida', 'texto', ?, 'ia', 'pendente', CURRENT_TIMESTAMP)
                `).run(conversa.id, part);
                try {
                    const evoResult = await wa.sendText(dest, part);
                    const waId = evoResult?.key?.id || '';
                    db.prepare(`UPDATE chat_mensagens SET status_envio = 'enviado', wa_message_id = ? WHERE id = ?`).run(waId, aiInsert.lastInsertRowid);
                } catch (e) {
                    console.error('[WH] Erro enviar parte:', e.message);
                    db.prepare(`UPDATE chat_mensagens SET status_envio = 'falhou' WHERE id = ?`).run(aiInsert.lastInsertRowid);
                    // Não interrompe loop — tenta enviar as demais partes (mesmo que falhe, ficam salvas)
                }
                try {
                    wsBroadcast?.('chat.message', {
                        conversa_id: conversa.id,
                        mensagem_id: aiInsert.lastInsertRowid,
                        direcao: 'saida',
                        tipo: 'texto',
                        remetente: 'ia',
                    });
                } catch (_) { /* silencioso */ }
            }

            // Se escalou e não havia texto, manda fallback
            if (result.action === 'escalate' && parts.length === 0) {
                const fallback = 'Um momento! Vou transferir seu atendimento para nossa equipe comercial. Retornamos em breve.';
                const fbInsert = db.prepare(`
                    INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, status_envio, criado_em)
                    VALUES (?, 'saida', 'texto', ?, 'ia', 'pendente', CURRENT_TIMESTAMP)
                `).run(conversa.id, fallback);
                try {
                    await wa.sendText(dest, fallback);
                    db.prepare(`UPDATE chat_mensagens SET status_envio = 'enviado' WHERE id = ?`).run(fbInsert.lastInsertRowid);
                } catch (_) {
                    db.prepare(`UPDATE chat_mensagens SET status_envio = 'falhou' WHERE id = ?`).run(fbInsert.lastInsertRowid);
                }
                try {
                    wsBroadcast?.('chat.message', {
                        conversa_id: conversa.id,
                        mensagem_id: fbInsert.lastInsertRowid,
                        direcao: 'saida',
                        tipo: 'texto',
                        remetente: 'ia',
                    });
                } catch (_) { /* silencioso */ }
            }
        } catch (err) {
            console.error('[WH] Erro IA — enfileirando para retry:', err.message);
            // Enfileira na retry queue: 10s → 2min → 10min → 30min → 2h
            try {
                iaRetryEnqueue({ ...conversa, wa_jid: conversa.wa_jid || remoteJid }, enrichedContent, msgReferenciaId);
            } catch (qErr) {
                console.error('[WH] Falha ao enfileirar retry:', qErr.message);
            }
        }
    }
}

// ═══ Baixar mídia via Evolution API ═══
async function downloadMedia(messageKey, messageType, mediaNome = '', mediaMime = '') {
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

    // Extensão real: nome do arquivo > mimetype > fallback por tipo.
    // Whitelist evita XSS stored (.html/.svg servidos como estático).
    const EXT_OK = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm', 'ogg', 'mp3', 'm4a', 'opus', 'wav', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip', 'dxf', 'dwg', 'skp'];
    const MIME_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' };
    let ext = '';
    const nomeExt = (mediaNome.match(/\.([a-z0-9]{2,5})$/i) || [])[1]?.toLowerCase();
    if (nomeExt && EXT_OK.includes(nomeExt)) ext = nomeExt;
    else if (MIME_EXT[(mediaMime || '').split(';')[0]]) ext = MIME_EXT[(mediaMime || '').split(';')[0]];
    else ext = { imagem: 'jpg', video: 'mp4', audio: 'ogg', documento: 'pdf', sticker: 'webp' }[messageType] || 'bin';
    const filename = `${messageKey.id}.${ext}`;
    const filepath = join(UPLOADS_DIR, filename);

    writeFileSync(filepath, Buffer.from(data.base64, 'base64'));
    return `/uploads/whatsapp/${filename}`;
}

// ═══ Atualizar status de entrega/leitura ═══
// Evolution v1.8 manda formatos variados:
//   A) { key: { id: "..." }, status: 3 }
//   B) { keyId: "...", status: 3 }
//   C) { id: "...", status: 3 }
//   D) Array de updates: [{ keyId, status }, ...]
async function handleMessageStatusUpdate(raw, wsBroadcast = null) {
    const statusMap = { 3: 'lido', 2: 'entregue', 1: 'enviado', READ: 'lido', DELIVERY_ACK: 'entregue', SERVER_ACK: 'enviado' };
    const items = Array.isArray(raw) ? raw : [raw];
    let updates = 0;
    for (const data of items) {
        if (!data) continue;
        const msgId = data?.key?.id || data?.keyId || data?.id || data?.messageId || '';
        if (!msgId) continue;
        const rawStatus = data.status ?? data.ack;
        const status = statusMap[rawStatus] || (typeof rawStatus === 'string' ? rawStatus.toLowerCase() : 'enviado');
        const r = db.prepare('UPDATE chat_mensagens SET status_envio = ? WHERE wa_message_id = ?').run(status, msgId);
        if (r.changes > 0) {
            updates++;
            try {
                const row = db.prepare('SELECT conversa_id FROM chat_mensagens WHERE wa_message_id = ?').get(msgId);
                if (row) wsBroadcast?.('chat.message-status', { conversa_id: row.conversa_id, wa_message_id: msgId, status });
            } catch (_) { /* silencioso */ }
        }
    }
    if (updates > 0) console.log(`[WH] ACK atualizado em ${updates} msg(s)`);
}

export default router;
