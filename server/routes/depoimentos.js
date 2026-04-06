import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();

// ── GET /api/depoimentos — público (sem auth) ──────────────────────
router.get('/', (req, res) => {
    const rows = db.prepare(
        'SELECT id, nome_cliente, texto, estrelas, ordem FROM depoimentos WHERE ativo = 1 ORDER BY ordem ASC, id ASC'
    ).all();
    res.json(rows);
});

// ── POST /api/depoimentos — criar (admin/gerente) ──────────────────
router.post('/', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { nome_cliente, texto, estrelas } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'Texto do depoimento é obrigatório' });

    const maxOrdem = db.prepare('SELECT COALESCE(MAX(ordem), 0) as m FROM depoimentos').get().m;
    const info = db.prepare(
        'INSERT INTO depoimentos (nome_cliente, texto, estrelas, ordem) VALUES (?, ?, ?, ?)'
    ).run(nome_cliente || '', texto.trim(), Math.min(5, Math.max(1, parseInt(estrelas) || 5)), maxOrdem + 1);

    const row = db.prepare('SELECT * FROM depoimentos WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
});

// ── PUT /api/depoimentos/:id — editar (admin/gerente) ───────────────
router.put('/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { nome_cliente, texto, estrelas } = req.body;
    const row = db.prepare('SELECT * FROM depoimentos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Depoimento não encontrado' });

    db.prepare(
        'UPDATE depoimentos SET nome_cliente = ?, texto = ?, estrelas = ? WHERE id = ?'
    ).run(
        nome_cliente ?? row.nome_cliente,
        texto ?? row.texto,
        Math.min(5, Math.max(1, parseInt(estrelas) || row.estrelas)),
        req.params.id
    );

    res.json(db.prepare('SELECT * FROM depoimentos WHERE id = ?').get(req.params.id));
});

// ── PUT /api/depoimentos/reorder — reordenar (admin/gerente) ────────
router.put('/reorder', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids deve ser array' });

    const stmt = db.prepare('UPDATE depoimentos SET ordem = ? WHERE id = ?');
    const tx = db.transaction(() => {
        ids.forEach((id, i) => stmt.run(i, id));
    });
    tx();
    res.json({ ok: true });
});

// ── DELETE /api/depoimentos/:id — remover (admin/gerente) ───────────
router.delete('/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    db.prepare('DELETE FROM depoimentos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

export default router;
