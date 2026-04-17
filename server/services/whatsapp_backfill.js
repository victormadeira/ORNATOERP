// ═══════════════════════════════════════════════════════════════════
// WHATSAPP BACKFILL — Puxa histórico de conversas da Evolution API
// ═══════════════════════════════════════════════════════════════════
// Diferente do webhook (que só pega mensagens daqui pra frente), o backfill
// chama ativamente /chat/findChats + /chat/findMessages da Evolution pra
// recuperar o histórico que já está no banco interno dela (~30-90 dias
// do que foi sincronizado quando o QR foi pareado).
// ═══════════════════════════════════════════════════════════════════

import db from '../db.js';

function getConfig() {
    return db.prepare(
        'SELECT wa_instance_url, wa_instance_name, wa_api_key FROM empresa_config WHERE id = 1'
    ).get() || {};
}

async function evoFetch(path, { method = 'GET', body = null } = {}) {
    const cfg = getConfig();
    if (!cfg.wa_instance_url || !cfg.wa_instance_name) {
        throw new Error('WhatsApp não configurado');
    }
    const url = `${cfg.wa_instance_url}${path.replace('{instance}', cfg.wa_instance_name)}`;
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', apikey: cfg.wa_api_key },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Evolution ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
}

// ─── Normaliza tipo da mensagem ─────────────────────────
function detectarTipo(msg) {
    const m = msg?.message || {};
    if (m.conversation || m.extendedTextMessage) return 'texto';
    if (m.imageMessage) return 'imagem';
    if (m.videoMessage) return 'video';
    if (m.audioMessage) return 'audio';
    if (m.documentMessage) return 'documento';
    if (m.stickerMessage) return 'sticker';
    return 'texto';
}

function extrairConteudo(msg) {
    const m = msg?.message || {};
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        ''
    );
}

// ─── Encontra ou cria conversa a partir de um remoteJid ─────────
function upsertConversa(remoteJid, pushName) {
    let phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
    if (!phone) return null;

    // 1. Tentar achar por wa_jid exato
    let conv = db.prepare('SELECT * FROM chat_conversas WHERE wa_jid = ?').get(remoteJid);
    if (conv) return conv;

    // 2. Tentar achar por telefone
    conv = db.prepare('SELECT * FROM chat_conversas WHERE wa_phone = ?').get(phone);
    if (conv) {
        // Atualizar jid se vazio
        if (!conv.wa_jid) {
            db.prepare('UPDATE chat_conversas SET wa_jid = ? WHERE id = ?').run(remoteJid, conv.id);
        }
        return conv;
    }

    // 3. Tentar vincular a cliente existente pelos últimos 8 dígitos
    let clienteId = null;
    if (/^55\d{10,11}$/.test(phone)) {
        const lastDigits = phone.slice(-8);
        const cli = db.prepare(
            "SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?"
        ).get(`%${lastDigits}%`);
        if (cli) clienteId = cli.id;
    }

    const r = db.prepare(
        'INSERT INTO chat_conversas (cliente_id, wa_phone, wa_jid, wa_name, status, nao_lidas, ultimo_msg_em) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)'
    ).run(clienteId, phone, remoteJid, pushName || '', 'humano');
    return db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(r.lastInsertRowid);
}

// ─── Insere mensagem (idempotente via wa_message_id) ────────────
function upsertMensagem(conversaId, msg) {
    const msgId = msg?.key?.id;
    if (!msgId) return false;
    const exists = db.prepare('SELECT id FROM chat_mensagens WHERE wa_message_id = ?').get(msgId);
    if (exists) return false;

    const direcao = msg.key.fromMe ? 'saida' : 'entrada';
    const tipo = detectarTipo(msg);
    const conteudo = extrairConteudo(msg) || `[${tipo}]`;
    const ts = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toISOString() : new Date().toISOString();
    const remetente = msg.key.fromMe ? 'usuario' : 'cliente';

    db.prepare(`
        INSERT INTO chat_mensagens
            (conversa_id, wa_message_id, direcao, tipo, conteudo, remetente, importado, status_envio, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'enviado', ?)
    `).run(conversaId, msgId, direcao, tipo, conteudo, remetente, ts);
    return true;
}

// ═══ Backfill de UM chat específico ═══════════════════════════════
export async function backfillOneChat(remoteJid, { limit = 500 } = {}) {
    if (!remoteJid) throw new Error('remoteJid obrigatório');
    if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {
        return { chat: remoteJid, skipped: true, reason: 'grupo/broadcast' };
    }

    // 1. Busca mensagens na Evolution
    // Evolution v1.x: POST /chat/findMessages/{instance} { where: { key: { remoteJid } }, limit }
    let msgs = [];
    try {
        msgs = await evoFetch('/chat/findMessages/{instance}', {
            method: 'POST',
            body: {
                where: { key: { remoteJid } },
                limit,
            },
        });
    } catch (e) {
        // Alguns forks aceitam GET — tentar fallback
        try {
            msgs = await evoFetch(`/chat/findMessages/{instance}?remoteJid=${encodeURIComponent(remoteJid)}&limit=${limit}`);
        } catch (e2) {
            throw new Error(`findMessages falhou: ${e.message}`);
        }
    }

    if (!Array.isArray(msgs)) {
        // Alguns retornos vêm como { messages: { records: [...] } }
        msgs = msgs?.messages?.records || msgs?.records || [];
    }

    if (!msgs.length) {
        return { chat: remoteJid, inseridas: 0, total: 0 };
    }

    // 2. Upsert conversa (usando pushName da primeira msg não-fromMe)
    const pushName = msgs.find(m => !m?.key?.fromMe)?.pushName || '';
    const conversa = upsertConversa(remoteJid, pushName);
    if (!conversa) return { chat: remoteJid, skipped: true, reason: 'sem telefone válido' };

    // 3. Insere mensagens (ordem cronológica)
    const ordered = [...msgs].sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));
    let inseridas = 0;
    for (const msg of ordered) {
        try {
            if (upsertMensagem(conversa.id, msg)) inseridas++;
        } catch (e) {
            // silencioso — continua próxima
        }
    }

    // 4. Atualizar ultimo_msg_em
    if (ordered.length) {
        const ultimo = ordered[ordered.length - 1].messageTimestamp;
        if (ultimo) {
            const iso = new Date(ultimo * 1000).toISOString();
            db.prepare('UPDATE chat_conversas SET ultimo_msg_em = ? WHERE id = ?').run(iso, conversa.id);
        }
    }

    return {
        chat: remoteJid,
        conversa_id: conversa.id,
        total: msgs.length,
        inseridas,
    };
}

// ═══ Backfill de TODOS os chats ═══════════════════════════════════
export async function backfillFromEvolution({ perChatLimit = 300, onProgress = null } = {}) {
    // 1. Lista todos os chats
    let chats = [];
    try {
        chats = await evoFetch('/chat/findChats/{instance}', { method: 'POST', body: {} });
    } catch (e) {
        try {
            chats = await evoFetch('/chat/findChats/{instance}');
        } catch (e2) {
            throw new Error(`findChats falhou: ${e.message}`);
        }
    }

    if (!Array.isArray(chats)) {
        chats = chats?.chats || chats?.records || [];
    }

    const results = [];
    let totalInseridas = 0;
    let chatsProcessados = 0;

    for (const chat of chats) {
        const remoteJid = chat?.id || chat?.remoteJid;
        if (!remoteJid) continue;
        if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast') || remoteJid.includes('status@')) continue;

        try {
            const r = await backfillOneChat(remoteJid, { limit: perChatLimit });
            results.push(r);
            totalInseridas += r.inseridas || 0;
            chatsProcessados++;
            if (onProgress) onProgress({ current: chatsProcessados, total: chats.length, last: r });
        } catch (e) {
            results.push({ chat: remoteJid, error: e.message });
        }
        // Pausa pequena pra não sobrecarregar a Evolution
        await new Promise(r => setTimeout(r, 80));
    }

    return {
        chats_total: chats.length,
        chats_processados: chatsProcessados,
        mensagens_inseridas: totalInseridas,
        detalhes: results,
    };
}

export default { backfillFromEvolution, backfillOneChat };
