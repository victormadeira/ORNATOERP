import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════
// GET /api/recursos/colaboradores — listar colaboradores
// ═══════════════════════════════════════════════════
router.get('/colaboradores', requireAuth, (req, res) => {
    const todos = req.query.todos === '1';
    const rows = db.prepare(`
        SELECT id, nome, funcao, valor_hora, telefone, ativo, criado_em
        FROM colaboradores
        ${todos ? '' : 'WHERE ativo = 1'}
        ORDER BY nome
    `).all();
    res.json(rows);
});

// ═══════════════════════════════════════════════════
// POST /api/recursos/colaboradores — criar colaborador
// ═══════════════════════════════════════════════════
router.post('/colaboradores', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { nome, funcao, valor_hora, telefone } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const r = db.prepare(`
        INSERT INTO colaboradores (nome, funcao, valor_hora, telefone)
        VALUES (?, ?, ?, ?)
    `).run(nome.trim(), funcao || '', valor_hora || 0, telefone || '');

    const novo = db.prepare('SELECT * FROM colaboradores WHERE id = ?').get(r.lastInsertRowid);
    res.json(novo);
});

// ═══════════════════════════════════════════════════
// PUT /api/recursos/colaboradores/:id — atualizar colaborador
// ═══════════════════════════════════════════════════
router.put('/colaboradores/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const id = parseInt(req.params.id);
    const { nome, funcao, valor_hora, telefone } = req.body;

    db.prepare(`
        UPDATE colaboradores
        SET nome = COALESCE(?, nome),
            funcao = COALESCE(?, funcao),
            valor_hora = COALESCE(?, valor_hora),
            telefone = COALESCE(?, telefone)
        WHERE id = ?
    `).run(nome || null, funcao !== undefined ? funcao : null, valor_hora !== undefined ? valor_hora : null, telefone !== undefined ? telefone : null, id);

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// DELETE /api/recursos/colaboradores/:id — desativar colaborador (soft delete)
// ═══════════════════════════════════════════════════
router.delete('/colaboradores/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const id = parseInt(req.params.id);
    db.prepare('UPDATE colaboradores SET ativo = 0 WHERE id = ?').run(id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// GET /api/recursos/apontamentos — listar apontamentos de horas
// ═══════════════════════════════════════════════════
router.get('/apontamentos', requireAuth, (req, res) => {
    const { projeto_id, colaborador_id, de, ate } = req.query;
    const limit = parseInt(req.query.limit) || 200;

    const conditions = [];
    const params = [];

    if (projeto_id) {
        conditions.push('ah.projeto_id = ?');
        params.push(parseInt(projeto_id));
    }
    if (colaborador_id) {
        conditions.push('ah.colaborador_id = ?');
        params.push(parseInt(colaborador_id));
    }
    if (de) {
        conditions.push('ah.data >= ?');
        params.push(de);
    }
    if (ate) {
        conditions.push('ah.data <= ?');
        params.push(ate);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limit);

    const rows = db.prepare(`
        SELECT ah.*,
               c.nome as colaborador_nome, c.valor_hora,
               p.nome as projeto_nome,
               ep.nome as etapa_nome,
               u.nome as usuario_nome,
               ROUND(ah.horas * c.valor_hora, 2) as valor
        FROM apontamentos_horas ah
        JOIN colaboradores c ON c.id = ah.colaborador_id
        LEFT JOIN projetos p ON p.id = ah.projeto_id
        LEFT JOIN etapas_projeto ep ON ep.id = ah.etapa_id
        LEFT JOIN users u ON u.id = ah.criado_por
        ${where}
        ORDER BY ah.data DESC, ah.criado_em DESC
        LIMIT ?
    `).all(...params);

    res.json(rows);
});

// ═══════════════════════════════════════════════════
// POST /api/recursos/apontamentos — criar apontamento de horas
// ═══════════════════════════════════════════════════
router.post('/apontamentos', requireAuth, (req, res) => {
    const { colaborador_id, projeto_id, etapa_id, data, horas, descricao } = req.body;
    if (!colaborador_id || !data || !horas) {
        return res.status(400).json({ error: 'colaborador_id, data e horas são obrigatórios' });
    }

    const r = db.prepare(`
        INSERT INTO apontamentos_horas (colaborador_id, projeto_id, etapa_id, data, horas, descricao, criado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        parseInt(colaborador_id),
        projeto_id ? parseInt(projeto_id) : null,
        etapa_id ? parseInt(etapa_id) : null,
        data,
        horas,
        descricao || '',
        req.user.id
    );

    const novo = db.prepare(`
        SELECT ah.*,
               c.nome as colaborador_nome, c.valor_hora,
               p.nome as projeto_nome,
               ep.nome as etapa_nome,
               u.nome as usuario_nome,
               ROUND(ah.horas * c.valor_hora, 2) as valor
        FROM apontamentos_horas ah
        JOIN colaboradores c ON c.id = ah.colaborador_id
        LEFT JOIN projetos p ON p.id = ah.projeto_id
        LEFT JOIN etapas_projeto ep ON ep.id = ah.etapa_id
        LEFT JOIN users u ON u.id = ah.criado_por
        WHERE ah.id = ?
    `).get(r.lastInsertRowid);

    res.json(novo);
});

// ═══════════════════════════════════════════════════
// PUT /api/recursos/apontamentos/:id — atualizar apontamento
// ═══════════════════════════════════════════════════
router.put('/apontamentos/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { colaborador_id, projeto_id, etapa_id, data, horas, descricao } = req.body;

    db.prepare(`
        UPDATE apontamentos_horas
        SET colaborador_id = COALESCE(?, colaborador_id),
            projeto_id = COALESCE(?, projeto_id),
            etapa_id = COALESCE(?, etapa_id),
            data = COALESCE(?, data),
            horas = COALESCE(?, horas),
            descricao = COALESCE(?, descricao)
        WHERE id = ?
    `).run(
        colaborador_id ? parseInt(colaborador_id) : null,
        projeto_id !== undefined ? (projeto_id ? parseInt(projeto_id) : null) : null,
        etapa_id !== undefined ? (etapa_id ? parseInt(etapa_id) : null) : null,
        data || null,
        horas !== undefined ? horas : null,
        descricao !== undefined ? descricao : null,
        id
    );

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// DELETE /api/recursos/apontamentos/:id — excluir apontamento
// ═══════════════════════════════════════════════════
router.delete('/apontamentos/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM apontamentos_horas WHERE id = ?').run(id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// GET /api/recursos/projeto/:id/custo-real — custo real do projeto
// ═══════════════════════════════════════════════════
router.get('/projeto/:id/custo-real', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);

    // Custo de materiais (saídas de estoque vinculadas ao projeto)
    const mat = db.prepare(`
        SELECT COALESCE(SUM(quantidade * valor_unitario), 0) as custo_material
        FROM movimentacoes_estoque
        WHERE projeto_id = ? AND tipo = 'saida'
    `).get(projeto_id);

    // Custo de mão de obra (apontamentos * valor_hora do colaborador)
    const mdo = db.prepare(`
        SELECT COALESCE(SUM(ah.horas * c.valor_hora), 0) as custo_mao_obra,
               COALESCE(SUM(ah.horas), 0) as total_horas
        FROM apontamentos_horas ah
        JOIN colaboradores c ON c.id = ah.colaborador_id
        WHERE ah.projeto_id = ?
    `).get(projeto_id);

    const custo_material = mat.custo_material;
    const custo_mao_obra = mdo.custo_mao_obra;
    const total_horas = mdo.total_horas;

    res.json({
        custo_material,
        custo_mao_obra,
        total_horas,
        custo_real_total: custo_material + custo_mao_obra,
    });
});

// ═══════════════════════════════════════════════════
// GET /api/recursos/dashboard — resumo de recursos
// ═══════════════════════════════════════════════════
router.get('/dashboard', requireAuth, (req, res) => {
    const colaboradores_ativos = db.prepare(
        'SELECT COUNT(*) as total FROM colaboradores WHERE ativo = 1'
    ).get().total;

    const mes = db.prepare(`
        SELECT COALESCE(SUM(ah.horas), 0) as horas_mes,
               COALESCE(SUM(ah.horas * c.valor_hora), 0) as custo_mao_obra_mes
        FROM apontamentos_horas ah
        JOIN colaboradores c ON c.id = ah.colaborador_id
        WHERE strftime('%Y-%m', ah.data) = strftime('%Y-%m', 'now')
    `).get();

    res.json({
        colaboradores_ativos,
        horas_mes: mes.horas_mes,
        custo_mao_obra_mes: mes.custo_mao_obra_mes,
    });
});

export default router;
