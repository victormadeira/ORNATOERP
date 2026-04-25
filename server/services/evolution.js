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
        return { connected: false, reason: 'not_configured', error: 'URL da instância ou nome não configurados' };
    }
    try {
        const url = `${cfg.wa_instance_url}/instance/connectionState/${cfg.wa_instance_name}`;
        console.log(`[Evolution] Verificando status: ${url}`);
        const res = await fetch(url, {
            headers: { 'apikey': cfg.wa_api_key || '' },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[Evolution] API retornou ${res.status}: ${body.slice(0, 200)}`);
            return { connected: false, reason: 'api_error', error: `HTTP ${res.status}${body ? ': ' + body.slice(0, 100) : ''}` };
        }
        const data = await res.json();
        console.log(`[Evolution] Estado: ${JSON.stringify(data?.instance || data)}`);
        const state = data.instance?.state || data.state || 'unknown';
        return {
            connected: state === 'open',
            state,
        };
    } catch (e) {
        console.warn(`[Evolution] Falha na conexão: ${e.message}`);
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

// ═══ Enviar typing indicator (composing) ═══
export async function sendPresence(phoneOrJid, presence = 'composing', delayMs = 2000) {
    const cfg = getConfig();
    if (!isConfigured()) return;
    try {
        const dest = phoneOrJid.includes('@lid') ? phoneOrJid.replace('@lid', '') : phoneOrJid.replace('@s.whatsapp.net', '');
        const url = `${cfg.wa_instance_url}/chat/sendPresence/${cfg.wa_instance_name}`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': cfg.wa_api_key },
            body: JSON.stringify({ number: dest, presence, delay: delayMs }),
        });
    } catch (_) { /* silencioso */ }
}

// ═══ Baixar áudio e transcrever ═══
export async function baixarMidiaBase64(messageKey) {
    const cfg = getConfig();
    if (!isConfigured()) throw new Error('WhatsApp não configurado');
    const url = `${cfg.wa_instance_url}/chat/getBase64FromMediaMessage/${cfg.wa_instance_name}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.wa_api_key },
        body: JSON.stringify({ message: { key: messageKey }, convertToMp4: false }),
    });
    if (!res.ok) throw new Error(`Evolution getBase64: ${res.status}`);
    const data = await res.json();
    return data.base64 || '';
}

// ═══ Ativa syncFullHistory na instância ═══════════════════════════
// Evolution v2.x: POST /settings/set/{instance} com SCHEMA COMPLETO.
// (só mandar { syncFullHistory: true } dá 400 — o endpoint valida todos os campos)
// Estratégia: GET /settings/find → merge → POST /settings/set
export async function enableFullHistorySync() {
    const cfg = getConfig();
    if (!isConfigured()) throw new Error('WhatsApp não configurado');

    const headers = { 'Content-Type': 'application/json', apikey: cfg.wa_api_key };
    const baseUrl = `${cfg.wa_instance_url}`;

    // 1. Busca config atual (se existir)
    let currentSettings = {};
    for (const path of [`/settings/find/${cfg.wa_instance_name}`, `/instance/fetchInstances?instanceName=${cfg.wa_instance_name}`]) {
        try {
            const res = await fetch(`${baseUrl}${path}`, { headers });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                if (data && typeof data === 'object') {
                    // Normaliza — pode vir aninhado em .settings ou em array
                    currentSettings = data.settings || (Array.isArray(data) ? (data[0]?.settings || data[0]) : data) || {};
                    console.log(`[evolution] settings atuais via ${path}:`, JSON.stringify(currentSettings).slice(0, 200));
                    break;
                }
            }
        } catch (_) { /* tenta próximo */ }
    }

    // 2. Schema completo Evolution v2 — com fallback seguro
    const fullBody = {
        rejectCall: currentSettings.rejectCall ?? false,
        msgCall: currentSettings.msgCall ?? '',
        groupsIgnore: currentSettings.groupsIgnore ?? true,
        alwaysOnline: currentSettings.alwaysOnline ?? false,
        readMessages: currentSettings.readMessages ?? false,
        readStatus: currentSettings.readStatus ?? false,
        syncFullHistory: true, // ← o que queremos ligar
    };

    // 3. Tenta vários endpoints/métodos pra cobrir forks
    const candidatos = [
        { path: `/settings/set/${cfg.wa_instance_name}`, method: 'POST', body: fullBody },
        { path: `/settings/set/${cfg.wa_instance_name}`, method: 'PUT', body: fullBody },
        { path: `/instance/update/${cfg.wa_instance_name}`, method: 'POST', body: fullBody },
        { path: `/instance/update/${cfg.wa_instance_name}`, method: 'PUT', body: fullBody },
    ];

    const erros = [];
    for (const c of candidatos) {
        try {
            const res = await fetch(`${baseUrl}${c.path}`, {
                method: c.method, headers, body: JSON.stringify(c.body),
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                console.log(`[evolution] syncFullHistory ativado via ${c.method} ${c.path}`);
                return { ok: true, endpoint: `${c.method} ${c.path}`, response: data };
            }
            const txt = await res.text().catch(() => '');
            erros.push(`${c.method} ${c.path}: ${res.status} ${txt.slice(0, 150)}`);
        } catch (e) {
            erros.push(`${c.method} ${c.path}: ${e.message}`);
        }
    }
    throw new Error(`Não consegui ativar syncFullHistory. Tentativas: ${erros.slice(0, 3).join(' | ')}`);
}

// ═══ Desconecta a instância (logout) ═══════════════════════════════
// Depois precisa escanear o QR de novo pra reconectar.
export async function logoutInstance() {
    const cfg = getConfig();
    if (!isConfigured()) throw new Error('WhatsApp não configurado');

    const headers = { apikey: cfg.wa_api_key };
    const candidatos = [
        { method: 'DELETE', path: `/instance/logout/${cfg.wa_instance_name}` },
        { method: 'POST', path: `/instance/logout/${cfg.wa_instance_name}` },
    ];
    for (const c of candidatos) {
        try {
            const res = await fetch(`${cfg.wa_instance_url}${c.path}`, { method: c.method, headers });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                console.log(`[evolution] logout via ${c.method} ${c.path}`);
                return { ok: true, endpoint: c.path, response: data };
            }
        } catch (_) { /* tenta próximo */ }
    }
    throw new Error('Não consegui desconectar a instância');
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
    sendPresence, baixarMidiaBase64,
    enableFullHistorySync, logoutInstance,
};
