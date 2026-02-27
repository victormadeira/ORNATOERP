import { Router } from 'express';
import db from '../db.js';
import { requireAuth, canSeeAll } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/atividades — Lista atividades recentes com paginação
// Admin/gerente vê tudo, vendedor vê só suas
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const all = canSeeAll(req.user);

    let sql, params;
    if (all) {
        sql = 'SELECT * FROM atividades ORDER BY criado_em DESC LIMIT ? OFFSET ?';
        params = [limit, offset];
    } else {
        sql = 'SELECT * FROM atividades WHERE user_id = ? ORDER BY criado_em DESC LIMIT ? OFFSET ?';
        params = [req.user.id, limit, offset];
    }

    const rows = db.prepare(sql).all(...params);
    res.json(rows);
});

export default router;
