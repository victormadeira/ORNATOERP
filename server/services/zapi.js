import db from '../db.js';

// ═══════════════════════════════════════════════════════
// Z-API — Wrapper para WhatsApp (provider alternativo à Evolution)
// Mesma interface de evolution.js (sendText/sendMedia/getConnectionStatus)
// para o sistema poder alternar via empresa_config.wa_provider.
// ═══════════════════════════════════════════════════════

function getConfig() {
    const cfg = db.prepare(
        'SELECT zapi_instance_id, zapi_token, zapi_client_token FROM empresa_config WHERE id = 1'
    ).get();
    return cfg || {};
}

export function isConfigured() {
    const c = getConfig();
    return !!(c.zapi_instance_id && c.zapi_token);
}

function base() {
    const c = getConfig();
    return `https://api.z-api.io/instances/${c.zapi_instance_id}/token/${c.zapi_token}`;
}

function headers() {
    const c = getConfig();
    const h = { 'Content-Type': 'application/json' };
    // Client-Token só é exigido se a conta tiver "Account Security" ligado
    if (c.zapi_client_token) h['Client-Token'] = c.zapi_client_token;
    return h;
}

// Z-API quer o número puro (DDI+DDD+numero), sem @s.whatsapp.net / @lid
function toPhone(phoneOrJid) {
    return String(phoneOrJid || '').split('@')[0].replace(/\D/g, '');
}

// Normaliza a resposta pro formato que as rotas esperam (result?.key?.id)
function normalize(data) {
    return { key: { id: data?.messageId || data?.id || '' }, raw: data };
}

// ═══ Enviar texto ═══
export async function sendText(phoneOrJid, text) {
    if (!isConfigured()) throw new Error('Z-API não configurada');
    const phone = toPhone(phoneOrJid);
    const res = await fetch(`${base()}/send-text`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ phone, message: text }),
        signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error || data?.message || `Z-API error: ${res.status}`);
    return normalize(data);
}

// ═══ Enviar mídia ═══
export async function sendMedia(phoneOrJid, mediaUrl, caption, mediatype = 'image') {
    if (!isConfigured()) throw new Error('Z-API não configurada');
    const phone = toPhone(phoneOrJid);
    const map = {
        image: { ep: 'send-image', field: 'image' },
        video: { ep: 'send-video', field: 'video' },
        audio: { ep: 'send-audio', field: 'audio' },
        document: { ep: 'send-document/pdf', field: 'document' },
    };
    const { ep, field } = map[mediatype] || map.image;
    const body = { phone, [field]: mediaUrl };
    if (caption && mediatype !== 'audio') body.caption = caption;
    const res = await fetch(`${base()}/${ep}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error || `Z-API media error: ${res.status}`);
    return normalize(data);
}

// ═══ Status da conexão ═══
export async function getConnectionStatus() {
    if (!isConfigured()) return { connected: false, reason: 'not_configured' };
    try {
        const res = await fetch(`${base()}/status`, { headers: headers(), signal: AbortSignal.timeout(10000) });
        const data = await res.json().catch(() => ({}));
        return { connected: !!data?.connected, state: data?.connected ? 'open' : 'close', raw: data };
    } catch (e) {
        return { connected: false, reason: 'connection_failed', error: e.message };
    }
}

export function formatPhone(phone) {
    let clean = (phone || '').replace(/\D/g, '');
    if (clean.length <= 11) clean = '55' + clean;
    return clean;
}

export default { sendText, sendMedia, getConnectionStatus, isConfigured, formatPhone };
