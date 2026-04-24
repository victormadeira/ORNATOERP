// ═══════════════════════════════════════════════════════
// Webhook Outbound — dispatcher central n8n / Zapier / Make
// ═══════════════════════════════════════════════════════
// Uso: await dispatchOutbound('nome_evento', { ...dados })
// Timeout 3s, assinado com HMAC-SHA256 quando houver secret.
// Fire-and-forget: chamador não precisa aguardar, mas pode.
// Log de falhas em automacoes_log (tipo='webhook_<evento>').

import crypto from 'crypto';
import db from '../db.js';

export async function dispatchOutbound(event, payload, opts = {}) {
    const cfg = db.prepare('SELECT n8n_webhook_url, n8n_webhook_secret FROM empresa_config WHERE id = 1').get();
    const url = (cfg?.n8n_webhook_url || '').trim();
    if (!url) return { ok: false, motivo: 'webhook_nao_configurado' };

    const fullPayload = { event, timestamp: new Date().toISOString(), ...payload };
    const body = JSON.stringify(fullPayload);
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Ornato-ERP-Webhook/1',
        'X-Ornato-Event': event,
    };
    if (cfg.n8n_webhook_secret) {
        const sig = crypto.createHmac('sha256', cfg.n8n_webhook_secret).update(body).digest('hex');
        headers['X-Ornato-Signature'] = `sha256=${sig}`;
    }

    const referenciaId = opts.referenciaId || payload?.lead?.cliente_id || payload?.cliente_id || payload?.proposta?.orc_id || 0;
    const referenciaTipo = opts.referenciaTipo || 'cliente';
    const tipoLog = `webhook_${event}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        const r = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
        if (!r.ok) {
            db.prepare(`INSERT INTO automacoes_log (tipo, referencia_id, referencia_tipo, descricao, status)
                        VALUES (?, ?, ?, ?, 'falha')`).run(tipoLog, referenciaId, referenciaTipo, `n8n ${event} retornou ${r.status}`);
            return { ok: false, status: r.status };
        }
        db.prepare(`INSERT INTO automacoes_log (tipo, referencia_id, referencia_tipo, descricao, status)
                    VALUES (?, ?, ?, ?, 'sucesso')`).run(tipoLog, referenciaId, referenciaTipo, `n8n ${event} disparado`);
        return { ok: true };
    } catch (err) {
        const msg = err.name === 'AbortError' ? 'timeout 3s' : err.message;
        db.prepare(`INSERT INTO automacoes_log (tipo, referencia_id, referencia_tipo, descricao, status)
                    VALUES (?, ?, ?, ?, 'falha')`).run(tipoLog, referenciaId, referenciaTipo, `n8n ${event}: ${msg}`);
        return { ok: false, erro: msg };
    } finally {
        clearTimeout(timeout);
    }
}

export default { dispatchOutbound };
