// ═══════════════════════════════════════════════════════
// google-ads.js — Google Ads Conversion API (server-side)
// ═══════════════════════════════════════════════════════
// Envia conversões via Google Ads API offline (Enhanced Conversions)
// sem depender do navegador — imune a ad blockers e iOS ITP.
//
// Setup:
//   1. No Google Ads: Ferramentas → Conversões → Importar → API do Google Ads
//   2. Anote o Conversion ID (ex: AW-123456789) e Conversion Label por ação
//   3. Configure google_ads_id e google_ads_dev_token em Configurações → Integrações
// ═══════════════════════════════════════════════════════

import crypto from 'crypto';
import db from '../db.js';

/** SHA-256 normalizado conforme spec Google (lower-case + trim) */
function sha256(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(String(value).toLowerCase().trim()).digest('hex');
}

/** Lê google_ads_id e google_ads_dev_token do banco */
export function getGadsConfig() {
    try {
        const emp = db.prepare(
            'SELECT google_ads_id, google_ads_dev_token FROM empresa_config WHERE id = 1'
        ).get();
        if (!emp?.google_ads_id?.trim()) return null;
        return {
            conversionId: emp.google_ads_id.trim(), // ex: AW-123456789
            devToken: emp.google_ads_dev_token?.trim() || '',
        };
    } catch (_) {
        return null;
    }
}

/**
 * Envia conversão para o Google Ads Conversion Measurement API (fire-and-forget).
 *
 * @param {object} opts
 * @param {string}  opts.conversionLabel   — Label da ação de conversão no Google Ads
 * @param {object}  [opts.userData]        — { phone, email }
 * @param {number}  [opts.value]           — Valor da conversão em BRL
 * @param {string}  [opts.currency]        — Moeda (default 'BRL')
 * @param {string}  [opts.orderId]         — ID único para deduplicação
 * @param {string}  [opts.conversionTime]  — ISO datetime (default now)
 */
export async function sendGadsConversion({
    conversionLabel,
    userData = {},
    value = 0,
    currency = 'BRL',
    orderId,
    conversionTime,
}) {
    const cfg = getGadsConfig();
    if (!cfg || !conversionLabel) return;

    const conversionIdPart = cfg.conversionId.replace(/^AW-/i, '');
    const url = `https://googleads.googleapis.com/v16/customers/${conversionIdPart}:uploadConversions`;

    const payload = {
        conversions: [{
            gclid: undefined, // sem GCLID server-side — usamos hashed user data
            conversion_action: `customers/${conversionIdPart}/conversionActions/${conversionLabel}`,
            conversion_date_time: (conversionTime || new Date().toISOString()).replace('T', ' ').replace('Z', '+00:00'),
            conversion_value: value,
            currency_code: currency,
            order_id: orderId || undefined,
            user_identifiers: [
                userData.email ? { hashed_email: sha256(userData.email) } : null,
                userData.phone ? { hashed_phone_number: sha256(userData.phone.replace(/\D/g, '')) } : null,
            ].filter(Boolean),
        }],
        partial_failure: true,
    };

    // Fire-and-forget — não bloqueia a resposta ao usuário
    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'developer-token': cfg.devToken || '',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
    }).then(async r => {
        if (!r.ok) {
            const txt = await r.text().catch(() => '');
            console.error(`[Google Ads] Conversão falhou ${r.status}: ${txt.slice(0, 200)}`);
        }
    }).catch(e => console.error('[Google Ads] Erro de rede:', e.message));
}

export default { getGadsConfig, sendGadsConversion };
