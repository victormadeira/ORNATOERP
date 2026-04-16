import db from '../db.js';

// ═══════════════════════════════════════════════════════
// EVOLUTION API — Wrapper para WhatsApp Business
// ═══════════════════════════════════════════════════════

function getConfig() {
    const cfg = db.prepare(
        'SELECT wa_instance_url, wa_instance_name, wa_api_key, wa_webhook_token FROM empresa_config WHERE id = 1'
    ).get();
    return cfg || {};
}

export function isConfigured() {
    const cfg = getConfig();
    return !!(cfg.wa_instance_url && cfg.wa_instance_name && cfg.wa_api_key);
}

export function getWebhookToken() {
    const cfg = getConfig();
    return cfg.wa_webhook_token || '';
}

// ═══ Enviar mensagem de texto ═══
// Aceita phone (número puro) ou jid completo (ex: 5598...@s.whatsapp.net)
export async function sendText(phoneOrJid, text) {
    const cfg = getConfig();
    if (!isConfigured()) throw new Error('WhatsApp não configurado');

    // Se vier @lid, tentar resolver para número real via banco (wa_phone da conversa)
    let dest = phoneOrJid;
    if (dest.includes('@lid')) {
        const conv = db.prepare('SELECT wa_phone FROM chat_conversas WHERE wa_jid = ?').get(dest);
        if (conv?.wa_phone && /^55\d{10,11}$/.test(conv.wa_phone)) {
            dest = conv.wa_phone;
        } else {
            throw new Error('Número real do contato não encontrado. Vincule o telefone a esta conversa e tente novamente.');
        }
    }

    const url = `${cfg.wa_instance_url}/message/sendText/${cfg.wa_instance_name}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': cfg.wa_api_key,
        },
        body: JSON.stringify({
            number: dest,
            textMessage: { text },
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Evolution API error: ${res.status}`);
    }
    return res.json();
}

// ═══ Enviar mídia (imagem, documento, etc.) ═══
export async function sendMedia(phone, mediaUrl, caption, mediatype = 'image') {
    const cfg = getConfig();
    if (!isConfigured()) throw new Error('WhatsApp não configurado');

    const url = `${cfg.wa_instance_url}/message/sendMedia/${cfg.wa_instance_name}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': cfg.wa_api_key,
        },
        body: JSON.stringify({
            number: phone,
            mediatype,
            media: mediaUrl,
            caption: caption || '',
        }),
    });
    if (!res.ok) throw new Error(`Evolution API error: ${res.status}`);
    return res.json();
}

// ═══ Status da conexão ═══
export async function getConnectionStatus() {
    const cfg = getConfig();
    if (!cfg.wa_instance_url || !cfg.wa_instance_name) {
        return { connected: false, reason: 'not_configured' };
    }
    try {
        const url = `${cfg.wa_instance_url}/instance/connectionState/${cfg.wa_instance_name}`;
        const res = await fetch(url, {
            headers: { 'apikey': cfg.wa_api_key },
        });
        if (!res.ok) return { connected: false, reason: 'api_error' };
        const data = await res.json();
        return {
            connected: data.instance?.state === 'open',
            state: data.instance?.state || 'unknown',
        };
    } catch (e) {
        return { connected: false, reason: 'connection_failed', error: e.message };
    }
}

// ═══ Obter QR Code para pareamento ═══
export async function getQRCode() {
    const cfg = getConfig();
    if (!cfg.wa_instance_url || !cfg.wa_instance_name) {
        throw new Error('WhatsApp não configurado');
    }
    const url = `${cfg.wa_instance_url}/instance/connect/${cfg.wa_instance_name}`;
    const res = await fetch(url, {
        headers: { 'apikey': cfg.wa_api_key },
    });
    if (!res.ok) throw new Error(`Erro ao obter QR Code: ${res.status}`);
    const data = await res.json();
    return { qrcode: data.base64 || data.qrcode?.base64 || '' };
}

// ═══ Formatar número de telefone ═══
export function formatPhone(phone) {
    // Remove tudo que não é número
    let clean = (phone || '').replace(/\D/g, '');
    // Adiciona 55 (Brasil) se não tem código de país
    if (clean.length <= 11) clean = '55' + clean;
    return clean;
}

export default {
    sendText, sendMedia, getConnectionStatus, getQRCode,
    isConfigured, getWebhookToken, formatPhone,
};
