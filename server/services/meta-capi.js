// ═══════════════════════════════════════════════════════
// meta-capi.js — Meta Conversions API (server-side events)
// ═══════════════════════════════════════════════════════
// Envia eventos Lead/Purchase diretamente ao Meta via CAPI,
// sem depender do navegador do usuário (imune a ad blockers
// e à restrição de rastreamento do iOS 14+).
//
// Setup:
//   1. Crie um Access Token no Gerenciador de Eventos do Meta:
//      Gerenciador de Eventos → Configurações → Conversions API
//   2. Configure Pixel ID e Access Token em Config → Meta Ads no ERP.
// ═══════════════════════════════════════════════════════

import crypto from 'crypto';
import db from '../db.js';

const CAPI_VERSION      = 'v19.0';
const CAPI_BASE         = `https://graph.facebook.com/${CAPI_VERSION}`;
const CAPI_VERSION_CTWA = 'v23.0'; // versão mínima com suporte a business_messaging
const TIMEOUT_MS        = 8000;

// ── Utilitário ──────────────────────────────────────────
/**
 * SHA-256 normalizado conforme spec Meta (lower-case + trim).
 * Retorna null se a string estiver vazia.
 */
function sha256(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

// ── Configuração ────────────────────────────────────────
/**
 * Lê fb_pixel_id e fb_access_token do banco de dados.
 * @returns {{ pixelId: string, accessToken: string } | null}
 */
export function getCapiConfig() {
    try {
        const emp = db.prepare('SELECT fb_pixel_id, fb_access_token FROM empresa_config WHERE id = 1').get();
        if (!emp?.fb_pixel_id?.trim() || !emp?.fb_access_token?.trim()) return null;
        return {
            pixelId:     emp.fb_pixel_id.trim(),
            accessToken: emp.fb_access_token.trim(),
        };
    } catch (_) {
        return null;
    }
}

// ── Envio de evento ─────────────────────────────────────
/**
 * Envia um evento para a Conversions API do Meta (fire-and-forget seguro).
 *
 * @param {object} opts
 * @param {string}  opts.eventName    — 'Lead', 'Purchase', 'CompleteRegistration', etc.
 * @param {object}  [opts.userData]   — { phone, email, firstName, lastName }
 * @param {object}  [opts.customData] — { currency, value, content_name, ... }
 * @param {string}  [opts.sourceUrl]  — URL pública de origem (landing page, portal)
 * @param {string}  [opts.eventId]    — ID de deduplicação com pixel client-side
 *                                      (ex: `lead_${orc_id}` — deve coincidir com o fbq)
 */
export async function sendCAPIEvent({
    eventName,
    userData    = {},
    customData  = {},
    sourceUrl   = '',
    eventId     = '',
}) {
    const cfg = getCapiConfig();
    if (!cfg) return; // CAPI não configurado — ignora silenciosamente

    const { pixelId, accessToken } = cfg;

    // Montar user_data com hashes SHA-256 conforme spec Meta
    const user_data = {};
    if (userData.phone) {
        const phoneClean = userData.phone.replace(/\D/g, '');
        // Formatos aceitos: 5511999998888 ou 11999998888 — normalizar sem código de país
        user_data.ph = sha256(phoneClean);
    }
    if (userData.email)     user_data.em = sha256(userData.email);
    if (userData.firstName) user_data.fn = sha256(userData.firstName.split(' ')[0]);
    if (userData.lastName)  user_data.ln = sha256(userData.lastName);

    const event = {
        event_name:       eventName,
        event_time:       Math.floor(Date.now() / 1000),
        action_source:    'website',
        event_source_url: sourceUrl || undefined,
        user_data,
        ...(Object.keys(customData).length > 0 && { custom_data: customData }),
    };
    if (eventId) event.event_id = eventId;

    // Remover chaves undefined para não poluir o payload
    const cleanEvent = JSON.parse(JSON.stringify(event));

    const payload = { data: [cleanEvent] };
    // Código de teste do Meta (opcional — permite validar sem afetar dados reais)
    if (process.env.META_TEST_EVENT_CODE) {
        payload.test_event_code = process.env.META_TEST_EVENT_CODE;
    }

    try {
        const url  = `${CAPI_BASE}/${pixelId}/events?access_token=${accessToken}`;
        const resp = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            console.error(`[CAPI] Erro no evento "${eventName}": HTTP ${resp.status} — ${text}`);
        }
    } catch (err) {
        // Nunca propagar — CAPI é best-effort, não deve travar fluxo principal
        console.error(`[CAPI] Falha ao enviar "${eventName}":`, err.message);
    }
}

// ═══════════════════════════════════════════════════════
// CTWA — Click-to-WhatsApp Attribution
// ═══════════════════════════════════════════════════════
//
// Fecha o loop de atribuição: quando a Sofia qualifica um lead
// vindo de anúncio CTWA, dispara "LeadQualificado" para a Meta CAPI
// com action_source=business_messaging. Isso faz a campanha otimizar
// por quem qualifica de verdade, não só por quem clica.
//
// FASE 2 (quando acumular ~50 eventos LeadQualificado/semana):
// Criar nova campanha otimizando pela conversão "LeadQualificado"
// em vez de CONVERSATIONS. Migrar orçamento aos poucos.
// Por enquanto o evento coleta dados em paralelo sem alterar otimização.
// ═══════════════════════════════════════════════════════

/**
 * Normaliza telefone BR para o formato esperado pela Meta (55 + DDD + número).
 */
export function normalizePhone(raw = '') {
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    if (digits.length >= 10) return `55${digits}`;
    return digits;
}

function sha256Hex(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Busca recursiva até depth N por chaves ctwa_clid / ctwaClid.
 */
function deepFindCtwa(obj, depth) {
    if (depth <= 0 || !obj || typeof obj !== 'object') return {};
    for (const [k, v] of Object.entries(obj)) {
        if ((k === 'ctwa_clid' || k === 'ctwaClid') && v) return { ctwaClid: String(v) };
        if (typeof v === 'object') {
            const r = deepFindCtwa(v, depth - 1);
            if (r.ctwaClid) return r;
        }
    }
    return {};
}

/**
 * Extrai ctwa_clid do payload bruto do webhook (Evolution / Z-API / Cloud API).
 *
 * ATENÇÃO: o caminho exato varia por provider e versão do Baileys.
 * Logue o payload da 1ª mensagem de um anúncio real para confirmar
 * (em desenvolvimento o payload completo é logado via [MetaCAPI-DBG]).
 *
 * @param {any} payload  Payload bruto do webhook
 * @returns {{ ctwaClid?: string, sourceId?: string }}
 */
export function extractCtwaClid(payload) {
    if (!payload || typeof payload !== 'object') return {};

    if (process.env.NODE_ENV === 'development') {
        console.debug('[MetaCAPI-DBG] payload webhook:', JSON.stringify(payload).slice(0, 2000));
    }

    // ── Caminhos diretos (Cloud API + Z-API) ──
    const direct = [
        [() => payload?.referral?.ctwa_clid,                      () => payload?.referral?.source_id],
        [() => payload?.message?.referral?.ctwa_clid,             () => payload?.message?.referral?.source_id],
        [() => payload?.messages?.[0]?.referral?.ctwa_clid,       () => payload?.messages?.[0]?.referral?.source_id],
    ];
    for (const [getClid, getSrc] of direct) {
        try {
            const clid = getClid();
            if (clid) return { ctwaClid: String(clid), sourceId: getSrc?.() ? String(getSrc()) : undefined };
        } catch (_) { /* */ }
    }

    // ── Baileys: contextInfo.externalAdReply dentro de cada tipo de mensagem ──
    const msgObj = payload?.data?.message || payload?.message || payload;
    const msgTypes = [
        'conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage',
        'audioMessage', 'documentMessage', 'stickerMessage', 'buttonsMessage',
        'listMessage', 'templateMessage', 'interactiveMessage',
    ];
    for (const type of msgTypes) {
        const m = msgObj?.[type];
        if (!m) continue;
        const reply = m?.contextInfo?.externalAdReply;
        if (!reply) continue;
        const clid = reply.ctwaClid || reply.ctwa_clid;
        if (clid) return {
            ctwaClid: String(clid),
            sourceId: reply.sourceId || reply.source_id ? String(reply.sourceId || reply.source_id) : undefined,
        };
    }

    // ── Fallback: busca recursiva profunda (depth 6) ──
    return deepFindCtwa(payload, 6);
}

/**
 * Dispara o evento "LeadQualificado" para a Meta CAPI via business_messaging.
 * Reusa a configuração fb_pixel_id + fb_access_token já existente no ERP.
 *
 * @param {{ ctwaClid?: string, phone?: string, leadType?: 'b2c'|'b2b', value?: number }} params
 * @returns {Promise<{ ok: boolean, eventsReceived?: number, fbtraceId?: string, error?: string }>}
 */
export async function sendQualifiedLead({ ctwaClid, phone, leadType, value } = {}) {
    const cfg = getCapiConfig();
    if (!cfg) {
        console.warn('[MetaCAPI] fb_pixel_id ou fb_access_token não configurados — LeadQualificado ignorado');
        return { ok: false, error: 'not_configured' };
    }

    const normalizedPhone = normalizePhone(phone);
    if (!ctwaClid && !normalizedPhone) {
        console.warn('[MetaCAPI] LeadQualificado sem ctwaClid nem phone — ignorado');
        return { ok: false, error: 'missing_identifiers' };
    }

    const userData = {};
    if (ctwaClid) userData.ctwa_clid = ctwaClid;
    if (normalizedPhone) userData.ph = [sha256Hex(normalizedPhone)];

    const customData = { lead_type: leadType || 'b2c', currency: 'BRL' };
    if (value != null && value > 0) customData.value = value;

    const eventPayload = {
        data: [{
            event_name: 'LeadQualificado',
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'business_messaging',
            messaging_channel: 'whatsapp',
            user_data: userData,
            custom_data: customData,
        }],
        access_token: cfg.accessToken,
    };
    if (process.env.META_TEST_EVENT_CODE) {
        eventPayload.test_event_code = process.env.META_TEST_EVENT_CODE;
    }

    const url = `https://graph.facebook.com/${CAPI_VERSION_CTWA}/${cfg.pixelId}/events`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventPayload),
            signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error(`[MetaCAPI] LeadQualificado HTTP ${res.status}:`, JSON.stringify(json));
            return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
        }
        console.log(`[MetaCAPI] LeadQualificado enviado | ctwaClid=${ctwaClid || '-'} | phone=${normalizedPhone || '-'} | received=${json.events_received}`);
        return { ok: true, eventsReceived: json.events_received, fbtraceId: json.fbtrace_id };
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error('[MetaCAPI] Timeout ao enviar LeadQualificado');
            return { ok: false, error: 'timeout' };
        }
        console.error('[MetaCAPI] Erro:', err.message);
        return { ok: false, error: err.message };
    } finally {
        clearTimeout(timer);
    }
}
