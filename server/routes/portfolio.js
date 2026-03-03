import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();

// ── GET /api/portfolio — público (sem auth) ──────────────────────
router.get('/', (req, res) => {
    const rows = db.prepare(
        'SELECT id, titulo, designer, descricao, imagem, ordem FROM portfolio WHERE ativo = 1 ORDER BY ordem ASC, id ASC'
    ).all();
    res.json(rows);
});

// ── POST /api/portfolio — criar item (admin/gerente) ─────────────
router.post('/', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { titulo, designer, descricao, imagem } = req.body;
    if (!imagem) return res.status(400).json({ error: 'Imagem obrigatória' });

    const maxOrdem = db.prepare('SELECT COALESCE(MAX(ordem), 0) as m FROM portfolio').get().m;
    const info = db.prepare(
        'INSERT INTO portfolio (titulo, designer, descricao, imagem, ordem) VALUES (?, ?, ?, ?, ?)'
    ).run(titulo || '', designer || '', descricao || '', imagem, maxOrdem + 1);

    const row = db.prepare('SELECT * FROM portfolio WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
});

// ── PUT /api/portfolio/:id — editar item (admin/gerente) ─────────
router.put('/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { titulo, designer, descricao, imagem } = req.body;
    const row = db.prepare('SELECT * FROM portfolio WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Item não encontrado' });

    db.prepare(
        'UPDATE portfolio SET titulo = ?, designer = ?, descricao = ? WHERE id = ?'
    ).run(titulo ?? row.titulo, designer ?? row.designer, descricao ?? row.descricao, req.params.id);

    // Atualizar imagem se fornecida
    if (imagem) {
        db.prepare('UPDATE portfolio SET imagem = ? WHERE id = ?').run(imagem, req.params.id);
    }

    res.json(db.prepare('SELECT * FROM portfolio WHERE id = ?').get(req.params.id));
});

// ── PUT /api/portfolio/reorder — reordenar em batch (admin/gerente) ──
router.put('/reorder', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { ids } = req.body; // [id1, id2, id3, ...] na ordem desejada
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids deve ser array' });

    const stmt = db.prepare('UPDATE portfolio SET ordem = ? WHERE id = ?');
    const tx = db.transaction(() => {
        ids.forEach((id, i) => stmt.run(i, id));
    });
    tx();
    res.json({ ok: true });
});

// ── DELETE /api/portfolio/:id — remover item (admin/gerente) ─────
router.delete('/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    db.prepare('DELETE FROM portfolio WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

export default router;
