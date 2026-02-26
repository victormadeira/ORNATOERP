import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════
// GET /api/estoque — lista materiais com saldo
// ═══════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    // Busca todos os materiais da biblioteca + saldo em estoque
    const materiais = db.prepare(`
        SELECT b.id, b.tipo, b.cod, b.nome, b.unidade, b.preco, b.preco_m2, b.espessura,
               COALESCE(e.quantidade, 0) as quantidade,
               COALESCE(e.quantidade_minima, 0) as quantidade_minima,
               COALESCE(e.localizacao, '') as localizacao,
               e.id as estoque_id
        FROM biblioteca b
        LEFT JOIN estoque e ON e.material_id = b.id
        WHERE b.ativo = 1 AND b.tipo IN ('material', 'ferragem', 'componente')
        ORDER BY b.tipo, b.nome
    `).all();

    res.json(materiais);
});

// ═══════════════════════════════════════════════════
// GET /api/estoque/alertas — materiais abaixo do mínimo
// ═══════════════════════════════════════════════════
router.get('/alertas', requireAuth, (req, res) => {
    const alertas = db.prepare(`
        SELECT b.id, b.nome, b.tipo, b.unidade, e.quantidade, e.quantidade_minima
        FROM estoque e
        JOIN biblioteca b ON b.id = e.material_id
        WHERE e.quantidade < e.quantidade_minima AND e.quantidade_minima > 0
        ORDER BY (e.quantidade / NULLIF(e.quantidade_minima, 0)) ASC
    `).all();
    res.json(alertas);
});

// ═══════════════════════════════════════════════════
// POST /api/estoque/entrada — registrar entrada
// ═══════════════════════════════════════════════════
router.post('/entrada', requireAuth, (req, res) => {
    const { material_id, quantidade, valor_unitario, descricao } = req.body;
    if (!material_id || !quantidade || quantidade <= 0) {
        return res.status(400).json({ error: 'Material e quantidade positiva obrigatórios' });
    }

    // Criar ou atualizar registro de estoque
    const existing = db.prepare('SELECT id, quantidade FROM estoque WHERE material_id = ?').get(material_id);
    if (existing) {
        db.prepare('UPDATE estoque SET quantidade = quantidade + ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(quantidade, existing.id);
    } else {
        db.prepare('INSERT INTO estoque (material_id, quantidade) VALUES (?, ?)').run(material_id, quantidade);
    }

    // Registrar movimentação
    db.prepare(`
        INSERT INTO movimentacoes_estoque (material_id, tipo, quantidade, valor_unitario, descricao, criado_por)
        VALUES (?, 'entrada', ?, ?, ?, ?)
    `).run(material_id, quantidade, valor_unitario || 0, descricao || 'Entrada de material', req.user.id);

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// POST /api/estoque/saida — registrar saída
// ═══════════════════════════════════════════════════
router.post('/saida', requireAuth, (req, res) => {
    const { material_id, quantidade, projeto_id, descricao } = req.body;
    if (!material_id || !quantidade || quantidade <= 0) {
        return res.status(400).json({ error: 'Material e quantidade positiva obrigatórios' });
    }

    const existing = db.prepare('SELECT id, quantidade FROM estoque WHERE material_id = ?').get(material_id);
    if (!existing) return res.status(400).json({ error: 'Material não possui estoque cadastrado' });

    // Atualizar saldo (permite ficar negativo para controle)
    db.prepare('UPDATE estoque SET quantidade = quantidade - ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
        .run(quantidade, existing.id);

    // Registrar movimentação
    db.prepare(`
        INSERT INTO movimentacoes_estoque (material_id, projeto_id, tipo, quantidade, descricao, criado_por)
        VALUES (?, ?, 'saida', ?, ?, ?)
    `).run(material_id, projeto_id || null, quantidade, descricao || 'Saída de material', req.user.id);

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// POST /api/estoque/ajuste — ajuste de inventário
// ═══════════════════════════════════════════════════
router.post('/ajuste', requireAuth, (req, res) => {
    const { material_id, quantidade_real, descricao } = req.body;
    if (!material_id || quantidade_real === undefined) {
        return res.status(400).json({ error: 'Material e quantidade real obrigatórios' });
    }

    const existing = db.prepare('SELECT id, quantidade FROM estoque WHERE material_id = ?').get(material_id);
    const qtdAnterior = existing?.quantidade || 0;
    const diferenca = quantidade_real - qtdAnterior;

    if (existing) {
        db.prepare('UPDATE estoque SET quantidade = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(quantidade_real, existing.id);
    } else {
        db.prepare('INSERT INTO estoque (material_id, quantidade) VALUES (?, ?)').run(material_id, quantidade_real);
    }

    // Registrar movimentação de ajuste
    db.prepare(`
        INSERT INTO movimentacoes_estoque (material_id, tipo, quantidade, descricao, criado_por)
        VALUES (?, 'ajuste', ?, ?, ?)
    `).run(material_id, diferenca, descricao || `Ajuste de inventário (${qtdAnterior} → ${quantidade_real})`, req.user.id);

    res.json({ ok: true, diferenca });
});

// ═══════════════════════════════════════════════════
// PUT /api/estoque/config/:material_id — configurar mínimo e localização
// ═══════════════════════════════════════════════════
router.put('/config/:material_id', requireAuth, (req, res) => {
    const material_id = parseInt(req.params.material_id);
    const { quantidade_minima, localizacao } = req.body;

    const existing = db.prepare('SELECT id FROM estoque WHERE material_id = ?').get(material_id);
    if (existing) {
        db.prepare('UPDATE estoque SET quantidade_minima = ?, localizacao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(quantidade_minima || 0, localizacao || '', existing.id);
    } else {
        db.prepare('INSERT INTO estoque (material_id, quantidade, quantidade_minima, localizacao) VALUES (?, 0, ?, ?)')
            .run(material_id, quantidade_minima || 0, localizacao || '');
    }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// GET /api/estoque/movimentacoes — histórico geral
// ═══════════════════════════════════════════════════
router.get('/movimentacoes', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const movs = db.prepare(`
        SELECT m.*, b.nome as material_nome, b.unidade, u.nome as usuario_nome, p.nome as projeto_nome
        FROM movimentacoes_estoque m
        JOIN biblioteca b ON b.id = m.material_id
        LEFT JOIN users u ON u.id = m.criado_por
        LEFT JOIN projetos p ON p.id = m.projeto_id
        ORDER BY m.criado_em DESC
        LIMIT ?
    `).all(limit);
    res.json(movs);
});

// ═══════════════════════════════════════════════════
// GET /api/estoque/projeto/:id — materiais usados no projeto
// ═══════════════════════════════════════════════════
router.get('/projeto/:id', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);
    const movs = db.prepare(`
        SELECT m.*, b.nome as material_nome, b.unidade, b.preco, u.nome as usuario_nome
        FROM movimentacoes_estoque m
        JOIN biblioteca b ON b.id = m.material_id
        LEFT JOIN users u ON u.id = m.criado_por
        WHERE m.projeto_id = ?
        ORDER BY m.criado_em DESC
    `).all(projeto_id);
    res.json(movs);
});

// ═══════════════════════════════════════════════════
// POST /api/estoque/projeto/:id/consumir — registrar consumo do projeto
// ═══════════════════════════════════════════════════
router.post('/projeto/:id/consumir', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);
    const { material_id, quantidade, descricao } = req.body;
    if (!material_id || !quantidade || quantidade <= 0) {
        return res.status(400).json({ error: 'Material e quantidade positiva obrigatórios' });
    }

    // Atualizar saldo
    const existing = db.prepare('SELECT id, quantidade FROM estoque WHERE material_id = ?').get(material_id);
    if (existing) {
        db.prepare('UPDATE estoque SET quantidade = quantidade - ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(quantidade, existing.id);
    } else {
        db.prepare('INSERT INTO estoque (material_id, quantidade) VALUES (?, ?)').run(material_id, -quantidade);
    }

    // Registrar movimentação vinculada ao projeto
    db.prepare(`
        INSERT INTO movimentacoes_estoque (material_id, projeto_id, tipo, quantidade, descricao, criado_por)
        VALUES (?, ?, 'saida', ?, ?, ?)
    `).run(material_id, projeto_id, quantidade, descricao || 'Consumo do projeto', req.user.id);

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// GET /api/estoque/projeto/:id/comparativo — orçado vs gasto
// ═══════════════════════════════════════════════════
router.get('/projeto/:id/comparativo', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);

    const proj = db.prepare('SELECT materiais_orcados, orc_id FROM projetos WHERE id = ?').get(projeto_id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Materiais orçados (snapshot)
    let orcados = [];
    try {
        orcados = JSON.parse(proj.materiais_orcados || '[]');
    } catch (_) { }

    // Materiais gastos (movimentações de saída vinculadas ao projeto)
    const gastos = db.prepare(`
        SELECT m.material_id, b.nome, b.unidade, b.preco,
               SUM(m.quantidade) as qtd_gasta,
               SUM(m.quantidade * CASE WHEN m.valor_unitario > 0 THEN m.valor_unitario ELSE b.preco END) as valor_gasto
        FROM movimentacoes_estoque m
        JOIN biblioteca b ON b.id = m.material_id
        WHERE m.projeto_id = ? AND m.tipo = 'saida'
        GROUP BY m.material_id
    `).all(projeto_id);

    // Montar comparativo
    const gastoMap = {};
    gastos.forEach(g => { gastoMap[g.material_id] = g; });

    const comparativo = orcados.map(o => {
        const g = gastoMap[o.material_id] || {};
        return {
            material_id: o.material_id,
            nome: o.nome || g.nome || 'Material',
            unidade: o.unidade || g.unidade || 'un',
            orcado_qtd: o.quantidade || 0,
            orcado_valor: o.valor || 0,
            gasto_qtd: g.qtd_gasta || 0,
            gasto_valor: g.valor_gasto || 0,
            dif_qtd: (o.quantidade || 0) - (g.qtd_gasta || 0),
            dif_valor: (o.valor || 0) - (g.valor_gasto || 0),
        };
    });

    // Adicionar gastos que não estavam no orçamento
    gastos.forEach(g => {
        if (!orcados.find(o => o.material_id === g.material_id)) {
            comparativo.push({
                material_id: g.material_id,
                nome: g.nome,
                unidade: g.unidade,
                orcado_qtd: 0,
                orcado_valor: 0,
                gasto_qtd: g.qtd_gasta,
                gasto_valor: g.valor_gasto,
                dif_qtd: -(g.qtd_gasta),
                dif_valor: -(g.valor_gasto),
            });
        }
    });

    const totais = {
        orcado: comparativo.reduce((s, c) => s + c.orcado_valor, 0),
        gasto: comparativo.reduce((s, c) => s + c.gasto_valor, 0),
    };
    totais.diferenca = totais.orcado - totais.gasto;

    res.json({ comparativo, totais });
});

export default router;
