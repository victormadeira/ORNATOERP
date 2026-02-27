import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { syncFinancialNotifications } from '../services/notificacoes.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/notificacoes — Lista notificações ativas com estado de leitura per-user
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    // Sincronizar notificações financeiras e de estoque
    try { syncFinancialNotifications(); } catch (err) {
        console.error('Erro sync notificações:', err.message);
    }

    const notificacoes = db.prepare(`
        SELECT n.*,
               CASE WHEN nl.id IS NOT NULL THEN 1 ELSE 0 END as lida,
               nl.lida_em
        FROM notificacoes n
        LEFT JOIN notificacoes_lidas nl ON nl.notificacao_id = n.id AND nl.user_id = ?
        WHERE n.ativo = 1
        AND (n.expira_em IS NULL OR n.expira_em > datetime('now'))
        ORDER BY
            CASE WHEN nl.id IS NULL THEN 0 ELSE 1 END,
            n.criado_em DESC
        LIMIT 25
    `).all(req.user.id);

    const nao_lidas = db.prepare(`
        SELECT COUNT(*) as total
        FROM notificacoes n
        WHERE n.ativo = 1
        AND (n.expira_em IS NULL OR n.expira_em > datetime('now'))
        AND n.id NOT IN (SELECT notificacao_id FROM notificacoes_lidas WHERE user_id = ?)
    `).get(req.user.id);

    res.json({
        notificacoes,
        nao_lidas: nao_lidas?.total || 0,
    });
});

// ═══════════════════════════════════════════════════════
// PUT /api/notificacoes/lidas — Marcar TODAS como lidas
// DEVE vir antes de /:id para evitar conflito de parâmetro
// ═══════════════════════════════════════════════════════
router.put('/lidas', requireAuth, (req, res) => {
    const unread = db.prepare(`
        SELECT n.id FROM notificacoes n
        WHERE n.ativo = 1
        AND (n.expira_em IS NULL OR n.expira_em > datetime('now'))
        AND n.id NOT IN (SELECT notificacao_id FROM notificacoes_lidas WHERE user_id = ?)
    `).all(req.user.id);

    const stmt = db.prepare('INSERT OR IGNORE INTO notificacoes_lidas (notificacao_id, user_id) VALUES (?, ?)');
    const markAll = db.transaction(() => {
        for (const n of unread) stmt.run(n.id, req.user.id);
    });
    markAll();

    res.json({ ok: true, marcadas: unread.length });
});

// ═══════════════════════════════════════════════════════
// PUT /api/notificacoes/:id/lida — Marcar UMA como lida
// ═══════════════════════════════════════════════════════
router.put('/:id/lida', requireAuth, (req, res) => {
    const notif_id = parseInt(req.params.id);
    try {
        db.prepare('INSERT OR IGNORE INTO notificacoes_lidas (notificacao_id, user_id) VALUES (?, ?)').run(notif_id, req.user.id);
    } catch (_) { /* já lida */ }
    res.json({ ok: true });
});

export default router;
