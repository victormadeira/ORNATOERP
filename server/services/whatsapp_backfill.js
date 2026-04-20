// ═══════════════════════════════════════════════════════════════════
// WHATSAPP BACKFILL — Puxa histórico de conversas da Evolution API
// ═══════════════════════════════════════════════════════════════════
// Diferente do webhook (que só pega mensagens daqui pra frente), o backfill
// chama ativamente /chat/findChats + /chat/findMessages da Evolution pra
// recuperar o histórico que já está no banco interno dela (~30-90 dias
// do que foi sincronizado quando o QR foi pareado).
//
// Melhorias vs v1:
// - Logs verbosos [backfill] em cada etapa (diagnóstico via pm2 logs)
// - Timeout de 30s por request (AbortController)
// - Retry com backoff exponencial (3 tentativas)
// - Paginação (Evolution v1.8 limita findMessages ~50-100 por chamada)
// - INSERT OR IGNORE + UNIQUE INDEX garante dedup sem SELECT extra
// ═══════════════════════════════════════════════════════════════════

import db from '../db.js';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const PAGE_SIZE = 100; // Evolution v1.8 costuma aceitar até ~100 por chamada

function getConfig() {
    return db.prepare(
        'SELECT wa_instance_url, wa_instance_name, wa_api_key FROM empresa_config WHERE id = 1'
    ).get() || {};
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function evoFetch(path, { method = 'GET', body = null } = {}) {
    const cfg = getConfig();
    if (!cfg.wa_instance_url || !cfg.wa_instance_name) {
        throw new Error('WhatsApp não configurado');
    }
    const url = `${cfg.wa_instance_url}${path.replace('{instance}', cfg.wa_instance_name)}`;

    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', apikey: cfg.wa_api_key },
                body: body ? JSON.stringify(body) : undefined,
                signal: ctrl.signal,
            });
            clearTimeout(timer);
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                // 4xx não faz sentido tentar de novo (exceto 429)
                if (res.status >= 400 && res.status < 500 && res.status !== 429) {
                    throw new Error(`Evolution ${res.status}: ${txt.slice(0, 200)}`);
                }
                lastErr = new Error(`Evolution ${res.status}: ${txt.slice(0, 200)}`);
            } else {
                return res.json();
            }
        } catch (e) {
            clearTimeout(timer);
            lastErr = e;
            if (e.name === 'AbortError') {
                lastErr = new Error(`Evolution timeout após ${FETCH_TIMEOUT_MS}ms em ${path}`);
            }
        }
        if (attempt < MAX_RETRIES) {
            const delay = 500 * Math.pow(2, attempt - 1); // 500ms, 1s, 2s
            console.warn(`[backfill] ${path} tentativa ${attempt}/${MAX_RETRIES} falhou: ${lastErr?.message}. Aguardando ${delay}ms...`);
            await sleep(delay);
        }
    }
    throw lastErr || new Error(`Evolution fetch falhou após ${MAX_RETRIES} tentativas`);
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

// ─── Insere mensagem (idempotente via UNIQUE INDEX wa_message_id) ─
const insertMsgStmt = db.prepare(`
    INSERT OR IGNORE INTO chat_mensagens
        (conversa_id, wa_message_id, direcao, tipo, conteudo, remetente, importado, status_envio, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'enviado', ?)
`);

function upsertMensagem(conversaId, msg) {
    const msgId = msg?.key?.id;
    if (!msgId) return false;

    const direcao = msg.key.fromMe ? 'saida' : 'entrada';
    const tipo = detectarTipo(msg);
    const conteudo = extrairConteudo(msg) || `[${tipo}]`;
    const ts = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toISOString() : new Date().toISOString();
    const remetente = msg.key.fromMe ? 'usuario' : 'cliente';

    const r = insertMsgStmt.run(conversaId, msgId, direcao, tipo, conteudo, remetente, ts);
    return r.changes > 0;
}

// ─── Normaliza resposta Evolution (aceita vários formatos) ──────
function extractArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.messages)) return raw.messages;
    if (Array.isArray(raw.messages?.records)) return raw.messages.records;
    if (Array.isArray(raw.records)) return raw.records;
    if (Array.isArray(raw.chats)) return raw.chats;
    if (Array.isArray(raw.data)) return raw.data;
    return [];
}

// ═══ Cache do endpoint findMessages que funciona (evita tentar 404 todo chat) ═
let _msgsEndpoint = null; // { path, style: 'v1-noPage' | 'v2-paged' | 'get' }

async function _descobrirEndpointMensagens(remoteJid) {
    const tentativas = [
        { path: '/chat/findMessages/{instance}', style: 'v2-paged' },   // Evolution v2
        { path: '/chat/findMessages/{instance}', style: 'v1-noPage' },  // Evolution v1 (sem page)
        { path: '/chat/fetchMessages/{instance}', style: 'v1-noPage' }, // alguns forks legados
        { path: '/chat/findMessages/{instance}', style: 'get' },        // GET com querystring
    ];
    for (const t of tentativas) {
        try {
            const body = t.style === 'v2-paged'
                ? { where: { key: { remoteJid } }, limit: 1, page: 1 }
                : t.style === 'v1-noPage'
                    ? { where: { key: { remoteJid } }, limit: 1 }
                    : null;
            const method = t.style === 'get' ? 'GET' : 'POST';
            const path = t.style === 'get'
                ? `${t.path}?remoteJid=${encodeURIComponent(remoteJid)}&limit=1`
                : t.path;
            await evoFetch(path, { method, body });
            console.log(`[backfill] endpoint mensagens: ${t.path} (${t.style})`);
            return t;
        } catch (_) { /* tenta próximo */ }
    }
    throw new Error('Nenhum endpoint findMessages/fetchMessages respondeu');
}

// ═══ Buscar mensagens de um chat com paginação ═══════════════════
async function fetchMessagesPaginated(remoteJid, limit) {
    // Descobre endpoint 1x e reusa nos demais chats
    if (!_msgsEndpoint) _msgsEndpoint = await _descobrirEndpointMensagens(remoteJid);

    const all = [];
    const { path, style } = _msgsEndpoint;

    // Estilos v1 (sem page) e GET não paginam — faz uma request só com limit=limit
    if (style === 'v1-noPage' || style === 'get') {
        try {
            const body = style === 'v1-noPage' ? { where: { key: { remoteJid } }, limit } : null;
            const method = style === 'get' ? 'GET' : 'POST';
            const url = style === 'get'
                ? `${path}?remoteJid=${encodeURIComponent(remoteJid)}&limit=${limit}`
                : path;
            const raw = await evoFetch(url, { method, body });
            const arr = extractArray(raw);
            return arr.slice(0, limit);
        } catch (e) {
            console.warn(`[backfill] fetchMessages falhou ${remoteJid}: ${e.message}`);
            return [];
        }
    }

    // v2-paged
    let page = 1;
    const maxPages = Math.ceil(limit / PAGE_SIZE);
    while (page <= maxPages && all.length < limit) {
        let batch;
        try {
            batch = await evoFetch(path, {
                method: 'POST',
                body: { where: { key: { remoteJid } }, limit: PAGE_SIZE, page },
            });
        } catch (e) {
            console.warn(`[backfill] findMessages page=${page} ${remoteJid}: ${e.message}`);
            break;
        }
        const arr = extractArray(batch);
        if (!arr.length) break;
        all.push(...arr);
        if (arr.length < PAGE_SIZE) break;
        page++;
        await sleep(100);
    }
    return all.slice(0, limit);
}

// ═══ Backfill de UM chat específico ═══════════════════════════════
export async function backfillOneChat(remoteJid, { limit = 1000 } = {}) {
    if (!remoteJid) throw new Error('remoteJid obrigatório');
    if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {
        return { chat: remoteJid, skipped: true, reason: 'grupo/broadcast' };
    }

    console.log(`[backfill] Chat ${remoteJid} — buscando mensagens (limit=${limit})`);

    const msgs = await fetchMessagesPaginated(remoteJid, limit);

    if (!msgs.length) {
        console.log(`[backfill] Chat ${remoteJid} — 0 mensagens retornadas`);
        return { chat: remoteJid, inseridas: 0, total: 0 };
    }

    // Upsert conversa (usando pushName da primeira msg não-fromMe)
    const pushName = msgs.find(m => !m?.key?.fromMe)?.pushName || '';
    const conversa = upsertConversa(remoteJid, pushName);
    if (!conversa) {
        console.log(`[backfill] Chat ${remoteJid} — skip (telefone inválido)`);
        return { chat: remoteJid, skipped: true, reason: 'sem telefone válido' };
    }

    // Insere mensagens (ordem cronológica)
    const ordered = [...msgs].sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));
    let inseridas = 0;
    const tx = db.transaction((rows) => {
        for (const msg of rows) {
            try { if (upsertMensagem(conversa.id, msg)) inseridas++; } catch (_) { /* silencioso */ }
        }
    });
    tx(ordered);

    // Atualizar ultimo_msg_em
    if (ordered.length) {
        const ultimo = ordered[ordered.length - 1].messageTimestamp;
        if (ultimo) {
            const iso = new Date(ultimo * 1000).toISOString();
            db.prepare('UPDATE chat_conversas SET ultimo_msg_em = ? WHERE id = ?').run(iso, conversa.id);
        }
    }

    console.log(`[backfill] Chat ${remoteJid} — conv #${conversa.id}: ${inseridas}/${msgs.length} inseridas`);

    return {
        chat: remoteJid,
        conversa_id: conversa.id,
        total: msgs.length,
        inseridas,
    };
}

// ═══ Tenta listar chats em múltiplos endpoints (forks da Evolution variam) ═══
// Evolution v1.x usa "fetchChats" — Evolution v2.x usa "findChats"
async function listarChats() {
    const candidatos = [
        // Evolution v1.x (mais comum em instâncias auto-hospedadas)
        { path: '/chat/fetchChats/{instance}', method: 'POST', body: {} },
        { path: '/chat/fetchChats/{instance}', method: 'GET' },
        // Evolution v2.x
        { path: '/chat/findChats/{instance}', method: 'POST', body: {} },
        { path: '/chat/findChats/{instance}', method: 'POST', body: { where: {} } },
        { path: '/chat/findChats/{instance}', method: 'GET' },
        // Fallback: contatos
        { path: '/chat/findContacts/{instance}', method: 'POST', body: { where: {} } },
        { path: '/chat/fetchContacts/{instance}', method: 'GET' },
    ];

    for (const c of candidatos) {
        try {
            const raw = await evoFetch(c.path, { method: c.method, body: c.body || null });
            const arr = extractArray(raw);
            const sample = JSON.stringify(raw).slice(0, 300);
            console.log(`[backfill] ${c.path} (${c.method}) → ${arr.length} items | sample=${sample}`);
            if (arr.length > 0) {
                return { arr, endpoint: c.path };
            }
        } catch (e) {
            console.warn(`[backfill] ${c.path} (${c.method}) falhou: ${e.message}`);
        }
    }
    return { arr: [], endpoint: null };
}

// ═══ Fallback: usar conversas locais como fonte de jids ═════════════
// Se a Evolution não listar chats, ao menos faz backfill das conversas
// que já existem no banco (mensagens novas em telefones conhecidos)
function listarChatsLocais() {
    const rows = db.prepare(`
        SELECT wa_jid, wa_phone FROM chat_conversas
        WHERE (wa_jid IS NOT NULL AND wa_jid != '')
           OR (wa_phone IS NOT NULL AND wa_phone != '')
        ORDER BY ultimo_msg_em DESC
    `).all();
    return rows
        .map(r => r.wa_jid || `${r.wa_phone}@s.whatsapp.net`)
        .filter(jid => jid && !jid.includes('@g.us') && !jid.includes('@broadcast'));
}

// ═══ Backfill de TODOS os chats ═══════════════════════════════════
export async function backfillFromEvolution({ perChatLimit = 1000, onProgress = null } = {}) {
    console.log(`[backfill] Iniciando backfill completo — perChatLimit=${perChatLimit}`);

    let { arr: chats, endpoint } = await listarChats();

    // Fallback: se a Evolution não listou nada, usa conversas do banco local
    let usouFallback = false;
    if (chats.length === 0) {
        const jidsLocais = listarChatsLocais();
        if (jidsLocais.length > 0) {
            chats = jidsLocais.map(jid => ({ id: jid }));
            endpoint = '(fallback: conversas locais)';
            usouFallback = true;
            console.log(`[backfill] Fallback: usando ${chats.length} conversas locais como fonte de jids`);
        }
    }

    console.log(`[backfill] ${chats.length} chats via ${endpoint || '(nenhum endpoint respondeu com dados — talvez você precise mandar/receber 1 msg pra popular o cache da Evolution)'}`);

    const results = [];
    let totalInseridas = 0;
    let chatsProcessados = 0;
    let chatsIgnorados = 0;
    const t0 = Date.now();

    for (const chat of chats) {
        const remoteJid = chat?.id || chat?.remoteJid;
        if (!remoteJid) { chatsIgnorados++; continue; }
        if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast') || remoteJid.includes('status@')) {
            chatsIgnorados++;
            continue;
        }

        try {
            const r = await backfillOneChat(remoteJid, { limit: perChatLimit });
            results.push(r);
            totalInseridas += r.inseridas || 0;
            chatsProcessados++;
            if (onProgress) onProgress({ current: chatsProcessados, total: chats.length, last: r });
        } catch (e) {
            console.error(`[backfill] Erro em chat ${remoteJid}:`, e.message);
            results.push({ chat: remoteJid, error: e.message });
        }
        await sleep(150);
    }

    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[backfill] Concluído em ${elapsedSec}s — ${chatsProcessados} chats, ${totalInseridas} msgs inseridas, ${chatsIgnorados} ignorados`);

    return {
        chats_total: chats.length,
        chats_processados: chatsProcessados,
        chats_ignorados: chatsIgnorados,
        mensagens_inseridas: totalInseridas,
        duracao_s: Number(elapsedSec),
        detalhes: results,
    };
}

export default { backfillFromEvolution, backfillOneChat };
