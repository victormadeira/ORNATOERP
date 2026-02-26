import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════
// CATEGORIAS DE DESPESA
// ═══════════════════════════════════════════════════
const CATEGORIAS = [
    'material', 'mao_de_obra', 'transporte', 'terceirizado',
    'ferramentas', 'acabamento', 'instalacao', 'outros',
];

// ═══════════════════════════════════════════════════════════
// GET /api/financeiro/lembretes — contas vencidas/próximas (global, para badge)
// DEVE vir antes de /:projeto_id para evitar conflito
// ═══════════════════════════════════════════════════════════
router.get('/lembretes', requireAuth, (req, res) => {
    const vencidas = db.prepare(`
        SELECT cr.*, p.nome as projeto_nome
        FROM contas_receber cr
        JOIN projetos p ON p.id = cr.projeto_id
        WHERE cr.status = 'pendente' AND cr.data_vencimento < date('now')
        ORDER BY cr.data_vencimento ASC
    `).all();

    const proximas = db.prepare(`
        SELECT cr.*, p.nome as projeto_nome
        FROM contas_receber cr
        JOIN projetos p ON p.id = cr.projeto_id
        WHERE cr.status = 'pendente'
        AND cr.data_vencimento >= date('now')
        AND cr.data_vencimento <= date('now', '+7 days')
        ORDER BY cr.data_vencimento ASC
    `).all();

    res.json({
        vencidas: vencidas.length,
        proximas_7dias: proximas.length,
        total: vencidas.length + proximas.length,
        itens: [...vencidas.map(v => ({ ...v, tipo_alerta: 'vencida' })), ...proximas.map(v => ({ ...v, tipo_alerta: 'proxima' }))],
    });
});

// ═══════════════════════════════════════════════════
// CONTAS A PAGAR — CRUD completo
// ═══════════════════════════════════════════════════

const CATEGORIAS_PAGAR = [
    'material', 'mao_de_obra', 'aluguel', 'energia', 'agua',
    'internet', 'telefone', 'impostos', 'manutencao', 'transporte',
    'ferramentas', 'terceirizado', 'marketing', 'software', 'outros',
];

// GET /api/financeiro/pagar — listar contas a pagar com filtros
router.get('/pagar', requireAuth, (req, res) => {
    const { status, categoria, periodo_inicio, periodo_fim, projeto_id } = req.query;
    let sql = 'SELECT cp.*, p.nome as projeto_nome FROM contas_pagar cp LEFT JOIN projetos p ON p.id = cp.projeto_id WHERE 1=1';
    const params = [];

    if (status) { sql += ' AND cp.status = ?'; params.push(status); }
    if (categoria) { sql += ' AND cp.categoria = ?'; params.push(categoria); }
    if (periodo_inicio) { sql += ' AND cp.data_vencimento >= ?'; params.push(periodo_inicio); }
    if (periodo_fim) { sql += ' AND cp.data_vencimento <= ?'; params.push(periodo_fim); }
    if (projeto_id) { sql += ' AND cp.projeto_id = ?'; params.push(parseInt(projeto_id)); }

    sql += ' ORDER BY cp.data_vencimento ASC, cp.criado_em DESC';

    const contas = db.prepare(sql).all(...params);

    // Marcar vencidas automaticamente
    const hoje = new Date().toISOString().slice(0, 10);
    contas.forEach(c => {
        if (c.status === 'pendente' && c.data_vencimento && c.data_vencimento < hoje) {
            c.vencida = true;
        }
    });

    res.json(contas);
});

// POST /api/financeiro/pagar — criar conta a pagar
router.post('/pagar', requireAuth, (req, res) => {
    const { descricao, valor, data_vencimento, categoria, fornecedor, meio_pagamento,
            codigo_barras, projeto_id, observacao, recorrente, frequencia } = req.body;
    if (!descricao || !valor) return res.status(400).json({ error: 'Descrição e valor obrigatórios' });

    const cat = CATEGORIAS_PAGAR.includes(categoria) ? categoria : 'outros';
    const r = db.prepare(`
        INSERT INTO contas_pagar (user_id, descricao, valor, data_vencimento, categoria, fornecedor,
                                  meio_pagamento, codigo_barras, projeto_id, observacao, recorrente, frequencia)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.user.id, descricao, valor, data_vencimento || null, cat,
        fornecedor || '', meio_pagamento || '', codigo_barras || '',
        projeto_id ? parseInt(projeto_id) : null, observacao || '',
        recorrente ? 1 : 0, frequencia || null
    );

    res.json({ id: r.lastInsertRowid });
});

// PUT /api/financeiro/pagar/:id — atualizar conta a pagar
router.put('/pagar/:id', requireAuth, (req, res) => {
    const { descricao, valor, data_vencimento, status, data_pagamento, categoria,
            fornecedor, meio_pagamento, codigo_barras, projeto_id, observacao } = req.body;

    const cat = CATEGORIAS_PAGAR.includes(categoria) ? categoria : undefined;
    const dataPgto = status === 'pago' && !data_pagamento
        ? new Date().toISOString().slice(0, 10)
        : (data_pagamento || null);

    db.prepare(`
        UPDATE contas_pagar
        SET descricao=?, valor=?, data_vencimento=?, status=?, data_pagamento=?,
            categoria=?, fornecedor=?, meio_pagamento=?, codigo_barras=?,
            projeto_id=?, observacao=?, atualizado_em=CURRENT_TIMESTAMP
        WHERE id=?
    `).run(
        descricao, valor, data_vencimento || null, status || 'pendente', dataPgto,
        cat || 'outros', fornecedor || '', meio_pagamento || '', codigo_barras || '',
        projeto_id ? parseInt(projeto_id) : null, observacao || '',
        parseInt(req.params.id)
    );
    res.json({ ok: true });
});

// DELETE /api/financeiro/pagar/:id
router.delete('/pagar/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM contas_pagar WHERE id=?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// GET /api/financeiro/pagar/resumo — resumo de contas a pagar
router.get('/pagar/resumo', requireAuth, (req, res) => {
    const total = db.prepare(`
        SELECT
            COALESCE(SUM(valor), 0) as total,
            COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) as pago,
            COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) as pendente,
            COALESCE(SUM(CASE WHEN status = 'pendente' AND data_vencimento < date('now') THEN valor ELSE 0 END), 0) as vencido,
            COUNT(CASE WHEN status = 'pendente' AND data_vencimento < date('now') THEN 1 END) as qtd_vencidas
        FROM contas_pagar
    `).get();

    const porCategoria = db.prepare(`
        SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd
        FROM contas_pagar WHERE status = 'pendente'
        GROUP BY categoria ORDER BY total DESC
    `).all();

    res.json({ ...total, por_categoria: porCategoria });
});

// ═══════════════════════════════════════════════════
// DESPESAS
// ═══════════════════════════════════════════════════

// GET /api/financeiro/:projeto_id/despesas
router.get('/:projeto_id/despesas', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const despesas = db.prepare(`
        SELECT d.*, u.nome as criado_por_nome
        FROM despesas_projeto d
        LEFT JOIN users u ON u.id = d.criado_por
        WHERE d.projeto_id = ?
        ORDER BY d.data DESC, d.criado_em DESC
    `).all(projeto_id);
    res.json(despesas);
});

// POST /api/financeiro/:projeto_id/despesas
router.post('/:projeto_id/despesas', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const { descricao, valor, data, categoria, fornecedor, observacao } = req.body;
    if (!descricao || !valor) return res.status(400).json({ error: 'Descrição e valor obrigatórios' });

    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    const r = db.prepare(`
        INSERT INTO despesas_projeto (projeto_id, descricao, valor, data, categoria, fornecedor, observacao, criado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(projeto_id, descricao, valor, data || null, cat, fornecedor || '', observacao || '', req.user.id);

    res.json({ id: r.lastInsertRowid });
});

// PUT /api/financeiro/despesas/:id
router.put('/despesas/:id', requireAuth, (req, res) => {
    const { descricao, valor, data, categoria, fornecedor, observacao } = req.body;
    const cat = CATEGORIAS.includes(categoria) ? categoria : 'outros';
    db.prepare(`
        UPDATE despesas_projeto
        SET descricao=?, valor=?, data=?, categoria=?, fornecedor=?, observacao=?
        WHERE id=?
    `).run(descricao, valor, data || null, cat, fornecedor || '', observacao || '', parseInt(req.params.id));
    res.json({ ok: true });
});

// DELETE /api/financeiro/despesas/:id
router.delete('/despesas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM despesas_projeto WHERE id=?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// CONTAS A RECEBER
// ═══════════════════════════════════════════════════

// GET /api/financeiro/:projeto_id/receber
router.get('/:projeto_id/receber', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const contas = db.prepare(`
        SELECT * FROM contas_receber
        WHERE projeto_id = ?
        ORDER BY data_vencimento ASC, criado_em ASC
    `).all(projeto_id);

    // Atualizar status de contas vencidas automaticamente
    const hoje = new Date().toISOString().slice(0, 10);
    contas.forEach(c => {
        if (c.status === 'pendente' && c.data_vencimento && c.data_vencimento < hoje) {
            c.status = 'atrasada';
        }
    });

    res.json(contas);
});

// POST /api/financeiro/:projeto_id/receber
router.post('/:projeto_id/receber', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const { descricao, valor, data_vencimento, meio_pagamento, observacao } = req.body;
    if (!descricao || !valor) return res.status(400).json({ error: 'Descrição e valor obrigatórios' });

    const proj = db.prepare('SELECT orc_id FROM projetos WHERE id = ?').get(projeto_id);

    const r = db.prepare(`
        INSERT INTO contas_receber (projeto_id, orc_id, descricao, valor, data_vencimento, meio_pagamento, observacao, auto_gerada)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(projeto_id, proj?.orc_id || null, descricao, valor, data_vencimento || null, meio_pagamento || '', observacao || '');

    res.json({ id: r.lastInsertRowid });
});

// PUT /api/financeiro/receber/:id — atualizar (marcar pago, editar, etc.)
router.put('/receber/:id', requireAuth, (req, res) => {
    const { descricao, valor, data_vencimento, status, data_pagamento, meio_pagamento, observacao } = req.body;

    // Se marcou como pago e não tem data de pagamento, usar hoje
    const dataPgto = status === 'pago' && !data_pagamento
        ? new Date().toISOString().slice(0, 10)
        : (data_pagamento || null);

    db.prepare(`
        UPDATE contas_receber
        SET descricao=?, valor=?, data_vencimento=?, status=?, data_pagamento=?, meio_pagamento=?, observacao=?
        WHERE id=?
    `).run(
        descricao, valor, data_vencimento || null, status || 'pendente',
        dataPgto, meio_pagamento || '', observacao || '',
        parseInt(req.params.id)
    );
    res.json({ ok: true });
});

// DELETE /api/financeiro/receber/:id
router.delete('/receber/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM contas_receber WHERE id=?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// IMPORTAR PARCELAS DO ORÇAMENTO
// ═══════════════════════════════════════════════════
router.post('/:projeto_id/importar-parcelas', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const proj = db.prepare('SELECT * FROM projetos WHERE id = ?').get(projeto_id);
    if (!proj || !proj.orc_id) return res.status(400).json({ error: 'Projeto sem orçamento vinculado' });

    // Verificar se já importou
    const jaImportou = db.prepare(
        'SELECT COUNT(*) as c FROM contas_receber WHERE projeto_id = ? AND auto_gerada = 1'
    ).get(projeto_id);
    if (jaImportou.c > 0) return res.status(400).json({ error: 'Parcelas já importadas. Exclua as existentes primeiro.' });

    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(proj.orc_id);
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

    const data = JSON.parse(orc.mods_json || '{}');
    const pagamento = data.pagamento || { desconto: { tipo: '%', valor: 0 }, blocos: [] };

    const desconto = pagamento.desconto?.valor || 0;
    const valorBase = orc.valor_venda || 0;
    const valorFinal = pagamento.desconto?.tipo === '%'
        ? valorBase * (1 - desconto / 100)
        : Math.max(0, valorBase - desconto);

    if (!pagamento.blocos || pagamento.blocos.length === 0 || valorFinal <= 0) {
        return res.status(400).json({ error: 'Orçamento sem condições de pagamento definidas' });
    }

    const MEIO_LABEL = {
        pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão Crédito',
        cartao_debito: 'Cartão Débito', transferencia: 'Transferência',
        boleto: 'Boleto', cheque: 'Cheque',
    };

    const stmt = db.prepare(`
        INSERT INTO contas_receber (projeto_id, orc_id, descricao, valor, data_vencimento, meio_pagamento, auto_gerada)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    const hoje = new Date();
    let parcNum = 0;

    for (const bloco of pagamento.blocos) {
        const valorBloco = valorFinal * ((bloco.percentual || 0) / 100);
        const nParcelas = Math.max(1, bloco.parcelas || 1);
        const valorParcela = Math.round((valorBloco / nParcelas) * 100) / 100;

        for (let i = 0; i < nParcelas; i++) {
            parcNum++;
            const venc = new Date(hoje);
            venc.setMonth(venc.getMonth() + i);
            const descr = nParcelas > 1
                ? `${bloco.descricao || 'Parcela'} ${i + 1}/${nParcelas}`
                : bloco.descricao || `Pagamento ${parcNum}`;

            stmt.run(
                projeto_id, orc.id, descr, valorParcela,
                venc.toISOString().slice(0, 10),
                MEIO_LABEL[bloco.meio] || bloco.meio || ''
            );
        }
    }

    res.json({ ok: true, parcelas_criadas: parcNum });
});

// ═══════════════════════════════════════════════════
// RESUMO FINANCEIRO DO PROJETO
// ═══════════════════════════════════════════════════
router.get('/:projeto_id/resumo', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);

    const proj = db.prepare(`
        SELECT p.*, o.valor_venda, o.custo_material
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.id = ?
    `).get(projeto_id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Valor orçado (com desconto)
    let orcado = proj.valor_venda || 0;
    if (proj.orc_id) {
        try {
            const orc = db.prepare('SELECT mods_json FROM orcamentos WHERE id = ?').get(proj.orc_id);
            const data = JSON.parse(orc?.mods_json || '{}');
            const pag = data.pagamento || {};
            const desc = pag.desconto?.valor || 0;
            if (desc > 0) {
                orcado = pag.desconto?.tipo === '%'
                    ? orcado * (1 - desc / 100)
                    : Math.max(0, orcado - desc);
            }
        } catch (_) { }
    }

    // Despesas
    const despTotais = db.prepare(
        'SELECT COALESCE(SUM(valor), 0) as total FROM despesas_projeto WHERE projeto_id = ?'
    ).get(projeto_id);

    const despPorCategoria = db.prepare(
        'SELECT categoria, COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd FROM despesas_projeto WHERE projeto_id = ? GROUP BY categoria ORDER BY total DESC'
    ).all(projeto_id);

    // Contas a receber
    const crTotais = db.prepare(`
        SELECT
            COALESCE(SUM(valor), 0) as total,
            COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) as recebido,
            COALESCE(SUM(CASE WHEN status != 'pago' THEN valor ELSE 0 END), 0) as pendente,
            COALESCE(SUM(CASE WHEN status != 'pago' AND data_vencimento < date('now') THEN valor ELSE 0 END), 0) as vencido
        FROM contas_receber WHERE projeto_id = ?
    `).get(projeto_id);

    res.json({
        orcado: Math.round(orcado * 100) / 100,
        custo_material: proj.custo_material || 0,
        total_despesas: despTotais.total,
        total_receber: crTotais.total,
        total_recebido: crTotais.recebido,
        total_pendente: crTotais.pendente,
        total_vencido: crTotais.vencido,
        lucro_estimado: Math.round((orcado - despTotais.total) * 100) / 100,
        despesas_por_categoria: despPorCategoria,
    });
});

export default router;
