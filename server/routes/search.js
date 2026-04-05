import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

// GET /api/search?q=termo
router.get('/', requireAuth, (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ results: [] });

    const db = req.app.get('db');
    const like = `%${q}%`;
    const limit = 8;

    try {
        const clientes = db.prepare(`
            SELECT id, nome, email, telefone, 'cliente' as tipo
            FROM clientes
            WHERE (deletado = 0 OR deletado IS NULL)
            AND (nome LIKE ? OR email LIKE ? OR telefone LIKE ? OR cpf_cnpj LIKE ?)
            LIMIT ?
        `).all(like, like, like, like, limit);

        const orcamentos = db.prepare(`
            SELECT o.id, o.numero, c.nome as cliente_nome, o.status, 'orcamento' as tipo
            FROM orcamentos o
            LEFT JOIN clientes c ON c.id = o.cliente_id
            WHERE (o.deletado = 0 OR o.deletado IS NULL)
            AND (o.numero LIKE ? OR c.nome LIKE ? OR o.obs LIKE ?)
            LIMIT ?
        `).all(like, like, like, limit);

        const projetos = db.prepare(`
            SELECT p.id, p.nome, c.nome as cliente_nome, p.status, 'projeto' as tipo
            FROM projetos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            WHERE (p.deletado = 0 OR p.deletado IS NULL)
            AND (p.nome LIKE ? OR c.nome LIKE ? OR CAST(p.id AS TEXT) LIKE ?)
            LIMIT ?
        `).all(like, like, like, limit);

        const pecas = db.prepare(`
            SELECT cp.id, cp.descricao, cp.comprimento, cp.largura, cp.espessura, cp.material_code, cl.nome as lote_nome, 'peca' as tipo
            FROM cnc_pecas cp
            LEFT JOIN cnc_lotes cl ON cl.id = cp.lote_id
            WHERE cp.descricao LIKE ? OR cp.upmcode LIKE ? OR cp.material_code LIKE ?
            LIMIT ?
        `).all(like, like, like, limit);

        res.json({ results: [...clientes, ...orcamentos, ...projetos, ...pecas] });
    } catch (e) {
        console.error('Search error:', e);
        res.json({ results: [] });
    }
});

export default router;
