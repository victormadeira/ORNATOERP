import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const r = Router();

// GET all items (optional ?tipo=material|ferragem|componente|acabamento)
r.get('/', requireAuth, (req, res) => {
    const { tipo } = req.query;
    const rows = tipo
        ? db.prepare('SELECT * FROM biblioteca WHERE tipo = ? AND ativo = 1 ORDER BY nome').all(tipo)
        : db.prepare('SELECT * FROM biblioteca WHERE ativo = 1 ORDER BY tipo, nome').all();

    // Auto-calc preço/m² for chapas
    rows.forEach(r => {
        if (r.tipo === 'material' && r.largura > 0 && r.altura > 0 && r.preco > 0) {
            const areaChapa = (r.largura * r.altura) / 1e6;
            const areaUtil = areaChapa * (1 - r.perda_pct / 100);
            r.preco_m2_calc = areaUtil > 0 ? +(r.preco / areaUtil).toFixed(2) : 0;
            r.area_chapa = +areaChapa.toFixed(4);
            r.area_util = +areaUtil.toFixed(4);
        }
    });

    res.json(rows);
});

// POST create
r.post('/', requireAuth, (req, res) => {
    const { tipo, cod, nome, descricao, unidade, preco, espessura, largura, altura, perda_pct, preco_m2, fita_preco, categoria } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = db.prepare(
        'INSERT INTO biblioteca (tipo, cod, nome, descricao, unidade, preco, espessura, largura, altura, perda_pct, preco_m2, fita_preco, categoria) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(tipo || 'material', cod || '', nome, descricao || '', unidade || 'un', preco || 0, espessura || 0, largura || 0, altura || 0, perda_pct || 15, preco_m2 || 0, fita_preco || 0, categoria || '');

    res.json({ id: result.lastInsertRowid });
});

// PUT update
r.put('/:id', requireAuth, (req, res) => {
    const { tipo, cod, nome, descricao, unidade, preco, espessura, largura, altura, perda_pct, preco_m2, fita_preco, categoria } = req.body;
    db.prepare(
        'UPDATE biblioteca SET tipo=?, cod=?, nome=?, descricao=?, unidade=?, preco=?, espessura=?, largura=?, altura=?, perda_pct=?, preco_m2=?, fita_preco=?, categoria=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?'
    ).run(tipo, cod || '', nome, descricao || '', unidade || 'un', preco || 0, espessura || 0, largura || 0, altura || 0, perda_pct || 0, preco_m2 || 0, fita_preco || 0, categoria || '', req.params.id);
    res.json({ ok: true });
});

// DELETE
r.delete('/:id', requireAuth, (req, res) => {
    db.prepare('UPDATE biblioteca SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

export default r;
