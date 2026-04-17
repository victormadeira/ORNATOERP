// ═══════════════════════════════════════════════════════
// TEMPLATES de mensagem — CRUD (para UI do ERP)
// ═══════════════════════════════════════════════════════

import express from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();

// GET /api/templates
router.get('/', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT id, titulo, conteudo, atalho, categoria, ativo, usos, criado_em, atualizado_em
        FROM sofia_templates ORDER BY categoria, titulo
    `).all();
    res.json(rows);
});

// POST /api/templates
router.post('/', requireAuth, (req, res) => {
    const { titulo, conteudo, atalho, categoria, ativo } = req.body || {};
    if (!titulo || !conteudo) return res.status(400).json({ error: 'titulo e conteudo obrigatórios' });
    const r = db.prepare(`
        INSERT INTO sofia_templates (titulo, conteudo, atalho, categoria, ativo)
        VALUES (?, ?, ?, ?, ?)
    `).run(titulo.slice(0, 120), conteudo.slice(0, 4000), (atalho || '').slice(0, 30), (categoria || 'geral').slice(0, 40), ativo === false ? 0 : 1);
    const row = db.prepare('SELECT * FROM sofia_templates WHERE id = ?').get(r.lastInsertRowid);
    res.json(row);
});

// PUT /api/templates/:id
router.put('/:id', requireAuth, (req, res) => {
    const { titulo, conteudo, atalho, categoria, ativo } = req.body || {};
    db.prepare(`
        UPDATE sofia_templates SET
          titulo = COALESCE(?, titulo),
          conteudo = COALESCE(?, conteudo),
          atalho = COALESCE(?, atalho),
          categoria = COALESCE(?, categoria),
          ativo = COALESCE(?, ativo),
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        titulo !== undefined ? titulo : null,
        conteudo !== undefined ? conteudo : null,
        atalho !== undefined ? atalho : null,
        categoria !== undefined ? categoria : null,
        ativo !== undefined ? (ativo ? 1 : 0) : null,
        parseInt(req.params.id),
    );
    const row = db.prepare('SELECT * FROM sofia_templates WHERE id = ?').get(parseInt(req.params.id));
    res.json(row);
});

// DELETE /api/templates/:id
router.delete('/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM sofia_templates WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

export default router;
