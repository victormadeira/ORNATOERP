import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { loadBiblioteca, calcularListaCorte } from './producao.js';
import { logActivity } from '../services/notificacoes.js';

const router = Router();

// ═══════════════════════════════════════════════════
// HELPER — Sincronizar despesa consolidada de materiais
// ═══════════════════════════════════════════════════
function syncMaterialExpense(projeto_id) {
    const MARKER = 'Materiais (consumo automático)';
    // Calcular total gasto em materiais neste projeto
    const result = db.prepare(`
        SELECT COALESCE(SUM(m.quantidade * CASE WHEN m.valor_unitario > 0 THEN m.valor_unitario ELSE b.preco END), 0) as total
        FROM movimentacoes_estoque m
        JOIN biblioteca b ON b.id = m.material_id
        WHERE m.projeto_id = ? AND m.tipo = 'saida'
    `).get(projeto_id);
    const total = Math.round((result?.total || 0) * 100) / 100;

    const existing = db.prepare(
        "SELECT id FROM despesas_projeto WHERE projeto_id = ? AND descricao = ?"
    ).get(projeto_id, MARKER);

    if (total > 0) {
        if (existing) {
            db.prepare('UPDATE despesas_projeto SET valor = ?, data = date(\'now\') WHERE id = ?').run(total, existing.id);
        } else {
            db.prepare(`
                INSERT INTO despesas_projeto (projeto_id, descricao, valor, data, categoria, fornecedor, observacao, criado_por)
                VALUES (?, ?, ?, date('now'), 'material', '', 'Gerado automaticamente pelo consumo de insumos', NULL)
            `).run(projeto_id, MARKER, total);
        }
    } else if (existing) {
        db.prepare('DELETE FROM despesas_projeto WHERE id = ?').run(existing.id);
    }
}

// ═══════════════════════════════════════════════════
// HELPER — Construir materiais_orcados a partir do BOM
// ═══════════════════════════════════════════════════
function buildMateriaisOrcados(orc_id) {
    const orc = db.prepare('SELECT mods_json FROM orcamentos WHERE id = ?').get(orc_id);
    if (!orc) return '[]';

    const bib = loadBiblioteca();
    let mods;
    try { mods = JSON.parse(orc.mods_json || '{}'); } catch { return '[]'; }

    const calc = calcularListaCorte(mods, bib);
    if (!calc) return '[]';

    const materiaisOrcados = [];

    // Chapas
    if (calc.chapas) {
        Object.values(calc.chapas).forEach(c => {
            const bibRow = db.prepare('SELECT id FROM biblioteca WHERE cod = ? AND ativo = 1').get(c.id);
            if (bibRow) {
                materiaisOrcados.push({
                    material_id: bibRow.id, cod: c.id, nome: c.nome,
                    unidade: 'chapa', quantidade: c.qtdChapas || 1,
                    valor_unitario: c.preco || 0,
                    valor: (c.qtdChapas || 1) * (c.preco || 0), tipo: 'chapa',
                });
            }
        });
    }

    // Ferragens
    if (calc.ferragens) {
        Object.values(calc.ferragens).forEach(f => {
            const bibRow = db.prepare('SELECT id FROM biblioteca WHERE cod = ? AND ativo = 1').get(f.id);
            if (bibRow && f.qtd > 0) {
                materiaisOrcados.push({
                    material_id: bibRow.id, cod: f.id, nome: f.nome,
                    unidade: f.un || 'un', quantidade: f.qtd,
                    valor_unitario: f.preco || 0,
                    valor: f.qtd * (f.preco || 0), tipo: 'ferragem',
                });
            }
        });
    }

    // Fita de borda
    if (calc.fita && calc.fita.metros > 0) {
        materiaisOrcados.push({
            material_id: null, cod: 'fita', nome: 'Fita de Borda',
            unidade: 'm', quantidade: Math.ceil(calc.fita.metros),
            valor_unitario: calc.fita.metros > 0 ? calc.fita.custo / calc.fita.metros : 0,
            valor: calc.fita.custo || 0, tipo: 'fita',
        });
    }

    return JSON.stringify(materiaisOrcados);
}

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

    try {
        const mat = db.prepare('SELECT nome FROM biblioteca WHERE id = ?').get(material_id);
        logActivity(req.user.id, req.user.nome, 'entrada_estoque',
            `Entrada de ${quantidade}x "${mat?.nome || material_id}" no estoque`,
            material_id, 'estoque', { quantidade, valor_unitario });
    } catch (_) { }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// POST /api/estoque/saida — registrar saída
// ═══════════════════════════════════════════════════
router.post('/saida', requireAuth, (req, res) => {
    const { material_id, quantidade, projeto_id, descricao, forcar } = req.body;
    if (!material_id || !quantidade || quantidade <= 0) {
        return res.status(400).json({ error: 'Material e quantidade positiva obrigatórios' });
    }

    const existing = db.prepare('SELECT id, quantidade FROM estoque WHERE material_id = ?').get(material_id);
    if (!existing) return res.status(400).json({ error: 'Material não possui estoque cadastrado' });

    // Validar saldo suficiente (só permite negativo se forcar=true)
    if (existing.quantidade < quantidade && !forcar) {
        return res.status(400).json({
            error: `Saldo insuficiente. Disponível: ${existing.quantidade}, solicitado: ${quantidade}`,
            saldo_atual: existing.quantidade
        });
    }

    db.prepare('UPDATE estoque SET quantidade = quantidade - ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
        .run(quantidade, existing.id);

    const mat = db.prepare('SELECT preco, nome FROM biblioteca WHERE id = ?').get(material_id);
    const valorUnit = mat?.preco || 0;

    db.prepare(`
        INSERT INTO movimentacoes_estoque (material_id, projeto_id, tipo, quantidade, valor_unitario, descricao, criado_por)
        VALUES (?, ?, 'saida', ?, ?, ?, ?)
    `).run(material_id, projeto_id || null, quantidade, valorUnit, descricao || 'Saída de material', req.user.id);

    // Sincronizar despesa se vinculado a projeto
    if (projeto_id) syncMaterialExpense(projeto_id);

    try {
        logActivity(req.user.id, req.user.nome, 'saida_estoque',
            `Saída de ${quantidade}x "${mat?.nome || material_id}" do estoque`,
            material_id, 'estoque', { quantidade, projeto_id: projeto_id || null });
    } catch (_) { }

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

    // Buscar preço atual do material para registrar valor_unitario
    const mat = db.prepare('SELECT preco FROM biblioteca WHERE id = ?').get(material_id);
    const valorUnit = mat?.preco || 0;

    // Atualizar saldo (validar disponibilidade)
    const existing = db.prepare('SELECT id, quantidade FROM estoque WHERE material_id = ?').get(material_id);
    if (existing) {
        if (existing.quantidade < quantidade) {
            return res.status(400).json({
                error: `Saldo insuficiente de "${db.prepare('SELECT nome FROM biblioteca WHERE id = ?').get(material_id)?.nome || material_id}". Disponível: ${existing.quantidade}, solicitado: ${quantidade}`,
                saldo_atual: existing.quantidade
            });
        }
        db.prepare('UPDATE estoque SET quantidade = quantidade - ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(quantidade, existing.id);
    } else {
        return res.status(400).json({ error: 'Material não possui estoque cadastrado. Registre uma entrada antes de consumir.' });
    }

    // Registrar movimentação vinculada ao projeto (agora com valor_unitario)
    db.prepare(`
        INSERT INTO movimentacoes_estoque (material_id, projeto_id, tipo, quantidade, valor_unitario, descricao, criado_por)
        VALUES (?, ?, 'saida', ?, ?, ?, ?)
    `).run(material_id, projeto_id, quantidade, valorUnit, descricao || 'Consumo do projeto', req.user.id);

    // Sincronizar despesa consolidada de materiais no financeiro
    syncMaterialExpense(projeto_id);

    try {
        const matInfo = db.prepare('SELECT nome FROM biblioteca WHERE id = ?').get(material_id);
        const projInfo = db.prepare('SELECT nome FROM projetos WHERE id = ?').get(projeto_id);
        logActivity(req.user.id, req.user.nome, 'consumir_material',
            `Consumiu ${quantidade}x "${matInfo?.nome || material_id}" no projeto "${projInfo?.nome || projeto_id}"`,
            projeto_id, 'projeto', { material_id, quantidade });
    } catch (_) { }

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

// ═══════════════════════════════════════════════════
// DELETE /api/estoque/movimentacao/:id — excluir lançamento (gerente+ apenas)
// ═══════════════════════════════════════════════════
router.delete('/movimentacao/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const id = parseInt(req.params.id);
    const mov = db.prepare('SELECT * FROM movimentacoes_estoque WHERE id = ?').get(id);
    if (!mov) return res.status(404).json({ error: 'Movimentação não encontrada' });

    // Reverter saldo do estoque
    const existing = db.prepare('SELECT id FROM estoque WHERE material_id = ?').get(mov.material_id);
    if (mov.tipo === 'saida') {
        // Saída: devolver ao estoque
        if (existing) {
            db.prepare('UPDATE estoque SET quantidade = quantidade + ?, atualizado_em = CURRENT_TIMESTAMP WHERE material_id = ?')
                .run(mov.quantidade, mov.material_id);
        } else {
            db.prepare('INSERT INTO estoque (material_id, quantidade) VALUES (?, ?)').run(mov.material_id, mov.quantidade);
        }
    } else if (mov.tipo === 'entrada') {
        // Entrada: remover do estoque
        if (existing) {
            db.prepare('UPDATE estoque SET quantidade = quantidade - ?, atualizado_em = CURRENT_TIMESTAMP WHERE material_id = ?')
                .run(mov.quantidade, mov.material_id);
        }
    }
    // Ajustes: não reverter (complexo demais, snapshot já perdido)

    // Excluir movimentação
    db.prepare('DELETE FROM movimentacoes_estoque WHERE id = ?').run(id);

    // Recalcular despesa consolidada se era vinculado a projeto
    if (mov.projeto_id) {
        syncMaterialExpense(mov.projeto_id);
    }

    try {
        const matInfo = db.prepare('SELECT nome FROM biblioteca WHERE id = ?').get(mov.material_id);
        logActivity(req.user.id, req.user.nome, 'excluir_movimentacao',
            `Excluiu movimentação de ${mov.tipo} ${mov.quantidade}x "${matInfo?.nome || mov.material_id}"`,
            mov.material_id, 'estoque', { tipo: mov.tipo, quantidade: mov.quantidade, projeto_id: mov.projeto_id });
    } catch (_) { }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// POST /api/estoque/projeto/:id/recalcular-orcado — recalcular BOM
// ═══════════════════════════════════════════════════
router.post('/projeto/:id/recalcular-orcado', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.id);
    const proj = db.prepare('SELECT orc_id FROM projetos WHERE id = ?').get(projeto_id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });
    if (!proj.orc_id) return res.status(400).json({ error: 'Projeto sem orçamento vinculado' });

    try {
        // Verificar se orçamento tem módulos configurados
        const orc = db.prepare('SELECT mods_json FROM orcamentos WHERE id = ?').get(proj.orc_id);
        let mods;
        try { mods = JSON.parse(orc?.mods_json || '{}'); } catch { mods = {}; }
        const ambientes = mods?.ambientes || [];
        const totalModulos = ambientes.reduce((s, a) => s + (a.modulos || []).length, 0);

        const materiaisJson = buildMateriaisOrcados(proj.orc_id);
        db.prepare('UPDATE projetos SET materiais_orcados = ? WHERE id = ?').run(materiaisJson, projeto_id);
        const itens = JSON.parse(materiaisJson);
        res.json({ ok: true, itens: itens.length, ambientes: ambientes.length, modulos: totalModulos });
    } catch (err) {
        console.error('Erro ao recalcular BOM:', err);
        res.status(500).json({ error: 'Erro ao calcular materiais do orçamento' });
    }
});

export default router;
export { buildMateriaisOrcados, syncMaterialExpense };
