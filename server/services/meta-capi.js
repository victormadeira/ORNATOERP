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

const CAPI_VERSION = 'v19.0';
const CAPI_BASE    = `https://graph.facebook.com/${CAPI_VERSION}`;

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
