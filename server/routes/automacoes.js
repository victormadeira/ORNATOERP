// ═══════════════════════════════════════════════════════
// /api/automacoes — painel de automações n8n
// ═══════════════════════════════════════════════════════
// Endpoints pra gerenciar a fila de reativação (preview / aprovar / rejeitar)
// e ajustar o modo (preview vs auto).

import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { dispatchOutbound } from '../services/webhook_outbound.js';
import inativosWatcher from '../services/inativos_watcher.js';

const router = Router();

// ═══ Lista candidatos de reativação (pending por padrão) ═══
router.get('/reativacao/preview', requireAuth, (req, res) => {
    try {
        const status = req.query.status || 'pending';
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const rows = db.prepare(`
            SELECT r.id, r.cliente_id, r.payload_json, r.status, r.motivo_rejeicao,
                   r.criado_em, r.decidido_em, r.disparado_em,
                   c.nome as cliente_nome, c.tel, c.email
              FROM reativacao_candidatos r
              LEFT JOIN clientes c ON c.id = r.cliente_id
             WHERE r.status = ?
             ORDER BY r.criado_em DESC
             LIMIT ?
        `).all(status, limit);

        const items = rows.map(r => {
            let payload = {};
            try { payload = JSON.parse(r.payload_json || '{}'); } catch (_) {}
            return { ...r, payload };
        });

        const stats = db.prepare(`
            SELECT status, COUNT(*) as n FROM reativacao_candidatos GROUP BY status
        `).all().reduce((a, r) => ({ ...a, [r.status]: r.n }), {});

        const cfg = db.prepare('SELECT reativacao_auto FROM empresa_config WHERE id = 1').get() || {};

        res.json({ items, stats, reativacao_auto: !!cfg.reativacao_auto });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══ Aprova candidato → dispara webhook n8n ═══
router.post('/reativacao/preview/:id/aprovar', requireAuth, requireRole('gerente'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const row = db.prepare("SELECT * FROM reativacao_candidatos WHERE id = ? AND status = 'pending'").get(id);
        if (!row) return res.status(404).json({ error: 'Candidato não encontrado ou já decidido' });

        let payload = {};
        try { payload = JSON.parse(row.payload_json || '{}'); } catch (_) {}

        const result = await dispatchOutbound('cliente_inativo_60d', payload, {
            referenciaId: row.cliente_id,
            referenciaTipo: 'cliente',
        });

        db.prepare(`
            UPDATE reativacao_candidatos
               SET status = 'disparada', decidido_em = CURRENT_TIMESTAMP,
                   decidido_por = ?, disparado_em = CURRENT_TIMESTAMP
             WHERE id = ?
        `).run(req.user.id, id);
        db.prepare('UPDATE clientes SET reativacao_disparada_em = CURRENT_TIMESTAMP WHERE id = ?').run(row.cliente_id);

        res.json({ ok: true, webhook: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══ Rejeita candidato (não dispara nada) ═══
router.post('/reativacao/preview/:id/rejeitar', requireAuth, requireRole('gerente'), (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const motivo = String(req.body?.motivo || '').slice(0, 200);
        const row = db.prepare("SELECT cliente_id FROM reativacao_candidatos WHERE id = ? AND status = 'pending'").get(id);
        if (!row) return res.status(404).json({ error: 'Candidato não encontrado ou já decidido' });

        db.prepare(`
            UPDATE reativacao_candidatos
               SET status = 'rejeitada', motivo_rejeicao = ?, decidido_em = CURRENT_TIMESTAMP, decidido_por = ?
             WHERE id = ?
        `).run(motivo, req.user.id, id);
        // Marca cliente.reativacao_disparada_em pra respeitar cooldown mesmo sendo rejeitado
        db.prepare('UPDATE clientes SET reativacao_disparada_em = CURRENT_TIMESTAMP WHERE id = ?').run(row.cliente_id);

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══ Toggle modo auto (preview → auto) ═══
router.put('/reativacao/config', requireAuth, requireRole('gerente'), (req, res) => {
    try {
        const auto = req.body?.reativacao_auto ? 1 : 0;
        db.prepare('UPDATE empresa_config SET reativacao_auto = ? WHERE id = 1').run(auto);
        res.json({ ok: true, reativacao_auto: !!auto });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══ Força varredura agora (útil pra testar) ═══
router.post('/reativacao/scan', requireAuth, requireRole('gerente'), async (req, res) => {
    try {
        await inativosWatcher.processar();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
