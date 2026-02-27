import { Router } from 'express';
import db from '../db.js';
import { requireAuth, canSeeAll } from '../auth.js';

const router = Router();

// Nomes dos meses em pt-BR
const MESES = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

router.get('/', requireAuth, (req, res) => {
    const uid = req.user.id;
    const all = canSeeAll(req.user);
    const userFilter = all ? '' : 'AND o.user_id = ?';
    const userFilterP = all ? '' : 'AND p.user_id = ?';
    const params = all ? [] : [uid];

    try {
        // ── Headline do Mes ──────────────────────────────────────────
        const now = new Date();
        const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const mesAnteriorDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const mesAnterior = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`;

        const headMes = db.prepare(`
            SELECT COALESCE(SUM(o.valor_venda), 0) as total, COUNT(*) as qtd
            FROM orcamentos o
            WHERE o.kb_col IN ('ok','prod','done')
            AND strftime('%Y-%m', o.atualizado_em) = ?
            ${userFilter}
        `).get(mesAtual, ...params);

        const headMesAnt = db.prepare(`
            SELECT COALESCE(SUM(o.valor_venda), 0) as total
            FROM orcamentos o
            WHERE o.kb_col IN ('ok','prod','done')
            AND strftime('%Y-%m', o.atualizado_em) = ?
            ${userFilter}
        `).get(mesAnterior, ...params);

        const fMes = headMes.total;
        const fAnt = headMesAnt.total;
        const pctVar = fAnt > 0 ? Math.round(((fMes - fAnt) / fAnt) * 100) : (fMes > 0 ? 100 : 0);

        const headline = {
            faturamento_mes: fMes,
            faturamento_anterior: fAnt,
            pct_variacao: pctVar,
            qtd_fechados: headMes.qtd,
            mes_atual: MESES[now.getMonth()],
            mes_anterior: MESES[mesAnteriorDate.getMonth()],
        };

        // ── Fila de Atencao ──────────────────────────────────────────
        const orcParados = db.prepare(`
            SELECT o.id, o.cliente_nome, o.ambiente, o.valor_venda, o.kb_col,
                   o.atualizado_em,
                   CAST(julianday('now') - julianday(o.atualizado_em) AS INTEGER) as dias_parado
            FROM orcamentos o
            WHERE o.kb_col IN ('lead','orc','env','neg')
            AND julianday('now') - julianday(o.atualizado_em) > 7
            ${userFilter}
            ORDER BY dias_parado DESC
            LIMIT 10
        `).all(...params);

        const contasVencidas = db.prepare(`
            SELECT cr.id, cr.descricao, cr.valor, cr.data_vencimento,
                   CAST(julianday('now') - julianday(cr.data_vencimento) AS INTEGER) as dias_atraso,
                   p.nome as projeto_nome, p.id as projeto_id
            FROM contas_receber cr
            JOIN projetos p ON p.id = cr.projeto_id
            WHERE cr.status = 'pendente'
            AND cr.data_vencimento < date('now')
            ${userFilterP.replace('o.', 'p.')}
            ORDER BY dias_atraso DESC
            LIMIT 10
        `).all(...params);

        const atencao = {
            orcamentos_parados: orcParados,
            contas_vencidas: contasVencidas,
            total_parados: orcParados.length,
            total_vencidas: contasVencidas.length,
            valor_vencido: contasVencidas.reduce((s, c) => s + (c.valor || 0), 0),
        };

        // ── Pipeline (só lead→prod, sem done/arquivo/perdido) ────────
        const pipeRows = db.prepare(`
            SELECT o.kb_col, COUNT(*) as qtd, COALESCE(SUM(o.valor_venda), 0) as valor
            FROM orcamentos o
            WHERE o.kb_col NOT IN ('done','arquivo','perdido')
            ${userFilter}
            GROUP BY o.kb_col
        `).all(...params);

        const KCOLS = [
            { id: 'lead', nome: 'Primeiro Contato', cor: '#7e7ec8' },
            { id: 'orc',  nome: 'Em Orcamento',     cor: '#c8a97e' },
            { id: 'env',  nome: 'Proposta Enviada',  cor: '#c8c87e' },
            { id: 'neg',  nome: 'Negociacao',        cor: '#c87eb8' },
            { id: 'ok',   nome: 'Aprovado',          cor: '#8fbc8f' },
            { id: 'prod', nome: 'Em Producao',       cor: '#7eb8c8' },
        ];

        const pipeMap = {};
        pipeRows.forEach(r => { pipeMap[r.kb_col] = r; });
        const pipeline = KCOLS.map(k => ({
            ...k,
            qtd: pipeMap[k.id]?.qtd || 0,
            valor: pipeMap[k.id]?.valor || 0,
        }));
        const pipeline_total = pipeline.reduce((s, p) => s + p.valor, 0);

        // ── Fluxo de Caixa ───────────────────────────────────────────
        const ent30 = db.prepare(`
            SELECT COALESCE(SUM(cr.valor), 0) as total
            FROM contas_receber cr
            JOIN projetos p ON p.id = cr.projeto_id
            WHERE cr.status IN ('pendente')
            AND cr.data_vencimento >= date('now')
            AND cr.data_vencimento <= date('now', '+30 days')
            ${userFilterP.replace('o.', 'p.')}
        `).get(...params);

        const ent60 = db.prepare(`
            SELECT COALESCE(SUM(cr.valor), 0) as total
            FROM contas_receber cr
            JOIN projetos p ON p.id = cr.projeto_id
            WHERE cr.status IN ('pendente')
            AND cr.data_vencimento >= date('now')
            AND cr.data_vencimento <= date('now', '+60 days')
            ${userFilterP.replace('o.', 'p.')}
        `).get(...params);

        const recMes = db.prepare(`
            SELECT COALESCE(SUM(cr.valor), 0) as total
            FROM contas_receber cr
            JOIN projetos p ON p.id = cr.projeto_id
            WHERE cr.status = 'pago'
            AND strftime('%Y-%m', cr.data_pagamento) = ?
            ${userFilterP.replace('o.', 'p.')}
        `).get(mesAtual, ...params);

        const entVencidas = db.prepare(`
            SELECT COALESCE(SUM(cr.valor), 0) as total
            FROM contas_receber cr
            JOIN projetos p ON p.id = cr.projeto_id
            WHERE cr.status = 'pendente'
            AND cr.data_vencimento < date('now')
            ${userFilterP.replace('o.', 'p.')}
        `).get(...params);

        // Saídas (contas a pagar)
        const sai30 = db.prepare(`
            SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar
            WHERE status = 'pendente' AND data_vencimento >= date('now') AND data_vencimento <= date('now', '+30 days')
        `).get();

        const sai60 = db.prepare(`
            SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar
            WHERE status = 'pendente' AND data_vencimento >= date('now') AND data_vencimento <= date('now', '+60 days')
        `).get();

        const saiVencidas = db.prepare(`
            SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar
            WHERE status = 'pendente' AND data_vencimento < date('now')
        `).get();

        const pagoMes = db.prepare(`
            SELECT COALESCE(SUM(valor), 0) as total FROM contas_pagar
            WHERE status = 'pago' AND strftime('%Y-%m', data_pagamento) = ?
        `).get(mesAtual);

        const fluxo_caixa = {
            entradas_30d: ent30.total,
            entradas_60d: ent60.total,
            entradas_vencidas: entVencidas.total,
            recebido_mes: recMes.total,
            saidas_30d: sai30.total,
            saidas_60d: sai60.total,
            saidas_vencidas: saiVencidas.total,
            pago_mes: pagoMes.total,
        };

        // ── Projetos Ativos ──────────────────────────────────────────
        const projetos_ativos = db.prepare(`
            SELECT p.id, p.nome, p.status, p.data_vencimento, p.data_inicio,
                   o.cliente_nome, o.valor_venda,
                   (SELECT COUNT(*) FROM etapas_projeto e WHERE e.projeto_id = p.id) as total_etapas,
                   (SELECT COUNT(*) FROM etapas_projeto e WHERE e.projeto_id = p.id AND e.status = 'concluida') as etapas_concluidas,
                   (SELECT COUNT(*) FROM ocorrencias_projeto oc WHERE oc.projeto_id = p.id AND oc.status = 'aberto') as ocorrencias_abertas,
                   (SELECT COALESCE(SUM(cr.valor), 0) FROM contas_receber cr WHERE cr.projeto_id = p.id AND cr.status = 'pago') as recebido,
                   (SELECT COALESCE(SUM(cr.valor), 0) FROM contas_receber cr WHERE cr.projeto_id = p.id AND cr.status != 'pago') as pendente,
                   (SELECT COUNT(*) FROM contas_receber cr WHERE cr.projeto_id = p.id AND cr.status = 'pendente' AND cr.data_vencimento < date('now')) as contas_vencidas,
                   CAST(julianday(p.data_vencimento) - julianday('now') AS INTEGER) as dias_restantes
            FROM projetos p
            LEFT JOIN orcamentos o ON o.id = p.orc_id
            WHERE p.status IN ('em_andamento', 'atrasado', 'nao_iniciado')
            ${userFilterP.replace('o.', 'p.')}
            ORDER BY
                CASE WHEN p.status = 'atrasado' THEN 0 ELSE 1 END,
                p.data_vencimento ASC
            LIMIT 6
        `).all(...params).map(p => ({
            ...p,
            progresso_pct: p.total_etapas > 0 ? Math.round((p.etapas_concluidas / p.total_etapas) * 100) : 0,
        }));

        // ── Atividades Recentes ──────────────────────────────────────
        const recentOrcs = db.prepare(`
            SELECT 'orcamento' as tipo, o.id, o.cliente_nome, o.ambiente,
                   o.valor_venda, o.kb_col, o.numero,
                   o.atualizado_em as timestamp
            FROM orcamentos o
            WHERE 1=1 ${userFilter}
            ORDER BY o.atualizado_em DESC LIMIT 5
        `).all(...params);

        const recentPagamentos = db.prepare(`
            SELECT 'pagamento' as tipo, cr.id, p.nome as projeto_nome,
                   cr.descricao, cr.valor, cr.data_pagamento as timestamp
            FROM contas_receber cr
            JOIN projetos p ON p.id = cr.projeto_id
            WHERE cr.status = 'pago'
            ${userFilterP.replace('o.', 'p.')}
            ORDER BY cr.data_pagamento DESC LIMIT 5
        `).all(...params);

        const recentProjetos = db.prepare(`
            SELECT 'projeto' as tipo, p.id, p.nome, p.status,
                   p.atualizado_em as timestamp
            FROM projetos p
            WHERE 1=1 ${userFilterP.replace('o.', 'p.')}
            ORDER BY p.atualizado_em DESC LIMIT 5
        `).all(...params);

        // Merge e ordena por timestamp desc, top 8
        const atividades = [...recentOrcs, ...recentPagamentos, ...recentProjetos]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 8);

        // ── Métricas do Vendedor (sempre calculado, filtrado por user) ──
        const vendedorMetrics = {};
        if (!all) {
            const meusMes = db.prepare(`
                SELECT COUNT(*) as total, COALESCE(SUM(valor_venda), 0) as valor
                FROM orcamentos WHERE user_id = ? AND strftime('%Y-%m', criado_em) = ?
            `).get(uid, mesAtual);
            const meusAprovados = db.prepare(`
                SELECT COUNT(*) as total, COALESCE(SUM(valor_venda), 0) as valor
                FROM orcamentos WHERE user_id = ? AND kb_col = 'ok' AND strftime('%Y-%m', atualizado_em) = ?
            `).get(uid, mesAtual);
            const meusTotal = db.prepare(`
                SELECT COUNT(*) as total FROM orcamentos WHERE user_id = ?
                AND kb_col NOT IN ('done','arquivo') AND status != 'cancelado'
            `).get(uid);
            const meusConvertidos = db.prepare(`
                SELECT COUNT(*) as total FROM orcamentos WHERE user_id = ?
                AND kb_col IN ('ok','prod','done')
            `).get(uid);
            const meusClientes = db.prepare(`
                SELECT COUNT(*) as total FROM clientes WHERE user_id = ?
                AND strftime('%Y-%m', criado_em) = ?
            `).get(uid, mesAtual);
            vendedorMetrics.orcs_mes = meusMes.total;
            vendedorMetrics.orcs_valor_mes = meusMes.valor;
            vendedorMetrics.aprovados_mes = meusAprovados.total;
            vendedorMetrics.aprovados_valor_mes = meusAprovados.valor;
            vendedorMetrics.taxa_conversao = meusTotal.total > 0 ? Math.round((meusConvertidos.total / meusTotal.total) * 100) : 0;
            vendedorMetrics.novos_clientes_mes = meusClientes.total;
        }

        // ── Resposta ─────────────────────────────────────────────────
        res.json({
            headline,
            atencao,
            pipeline,
            pipeline_total,
            fluxo_caixa,
            projetos_ativos,
            total_projetos_ativos: projetos_ativos.length,
            atividades,
            vendedor: Object.keys(vendedorMetrics).length > 0 ? vendedorMetrics : undefined,
        });

    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/dashboard/financeiro — DRE + Fluxo de Caixa avançado
// ═══════════════════════════════════════════════════════
router.get('/financeiro', requireAuth, (req, res) => {
    const uid = req.user.id;
    const all = canSeeAll(req.user);
    const userFilterP = all ? '' : 'AND p.user_id = ?';
    const params = all ? [] : [uid];

    try {
        const now = new Date();
        const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // ── DRE: Receita (contas_receber pagas) ────────────────
        const receitaMes = db.prepare(`
            SELECT COALESCE(SUM(cr.valor), 0) as total
            FROM contas_receber cr
            JOIN projetos p ON p.id = cr.projeto_id
            WHERE cr.status = 'pago' AND strftime('%Y-%m', cr.data_pagamento) = ?
            ${userFilterP.replace('o.', 'p.')}
        `).get(mesAtual, ...params);

        // ── DRE: Despesas do mês ────────────────────────────────
        const despesaMes = db.prepare(`
            SELECT COALESCE(SUM(d.valor), 0) as total
            FROM despesas_projeto d
            JOIN projetos p ON p.id = d.projeto_id
            WHERE strftime('%Y-%m', d.data) = ?
            ${userFilterP.replace('o.', 'p.')}
        `).get(mesAtual, ...params);

        // ── DRE: Contas a pagar do mês ──────────────────────────
        const pagarMes = db.prepare(`
            SELECT COALESCE(SUM(valor), 0) as total,
                   COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) as pago,
                   COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END), 0) as pendente
            FROM contas_pagar
            WHERE strftime('%Y-%m', data_vencimento) = ?
        `).get(mesAtual);

        // ── Lucro ───────────────────────────────────────────────
        const lucro = receitaMes.total - despesaMes.total - (pagarMes?.pago || 0);
        const margem = receitaMes.total > 0 ? Math.round((lucro / receitaMes.total) * 100) : 0;

        // ── DRE: Receita + Despesa últimos 6 meses ─────────────
        const ultimos6 = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = MESES[d.getMonth()].slice(0, 3);

            const rec = db.prepare(`
                SELECT COALESCE(SUM(cr.valor), 0) as total
                FROM contas_receber cr
                JOIN projetos p ON p.id = cr.projeto_id
                WHERE cr.status = 'pago' AND strftime('%Y-%m', cr.data_pagamento) = ?
                ${userFilterP.replace('o.', 'p.')}
            `).get(mes, ...params);

            const desp = db.prepare(`
                SELECT COALESCE(SUM(d.valor), 0) as total
                FROM despesas_projeto d
                JOIN projetos p ON p.id = d.projeto_id
                WHERE strftime('%Y-%m', d.data) = ?
                ${userFilterP.replace('o.', 'p.')}
            `).get(mes, ...params);

            const cpag = db.prepare(`
                SELECT COALESCE(SUM(valor), 0) as total
                FROM contas_pagar WHERE status = 'pago' AND strftime('%Y-%m', data_pagamento) = ?
            `).get(mes);

            ultimos6.push({
                mes, label,
                receita: rec.total,
                despesa: desp.total + (cpag?.total || 0),
                lucro: rec.total - desp.total - (cpag?.total || 0),
            });
        }

        // ── Despesas por categoria (mês atual) ──────────────────
        const despPorCategoria = db.prepare(`
            SELECT d.categoria, COALESCE(SUM(d.valor), 0) as total, COUNT(*) as qtd
            FROM despesas_projeto d
            JOIN projetos p ON p.id = d.projeto_id
            WHERE strftime('%Y-%m', d.data) = ?
            ${userFilterP.replace('o.', 'p.')}
            GROUP BY d.categoria
            ORDER BY total DESC
        `).all(mesAtual, ...params);

        // ── Top 5 projetos mais lucrativos ──────────────────────
        const topProjetos = db.prepare(`
            SELECT p.id, p.nome, o.cliente_nome, o.valor_venda,
                   COALESCE((SELECT SUM(cr.valor) FROM contas_receber cr WHERE cr.projeto_id = p.id AND cr.status = 'pago'), 0) as recebido,
                   COALESCE((SELECT SUM(d.valor) FROM despesas_projeto d WHERE d.projeto_id = p.id), 0) as despesas,
                   o.valor_venda - COALESCE((SELECT SUM(d.valor) FROM despesas_projeto d WHERE d.projeto_id = p.id), 0) as lucro
            FROM projetos p
            LEFT JOIN orcamentos o ON o.id = p.orc_id
            WHERE p.status IN ('em_andamento', 'concluido', 'nao_iniciado')
            ${userFilterP.replace('o.', 'p.')}
            ORDER BY lucro DESC
            LIMIT 5
        `).all(...params).map(p => ({
            ...p,
            margem: p.valor_venda > 0 ? Math.round(((p.valor_venda - p.despesas) / p.valor_venda) * 100) : 0,
        }));

        // ── Top 5 clientes por faturamento ──────────────────────
        const topClientes = db.prepare(`
            SELECT o.cliente_nome, o.cliente_id,
                   COUNT(DISTINCT p.id) as total_projetos,
                   COALESCE(SUM(o.valor_venda), 0) as valor_total,
                   COALESCE((SELECT SUM(cr2.valor) FROM contas_receber cr2
                             JOIN projetos p2 ON p2.id = cr2.projeto_id
                             WHERE p2.orc_id = o.id AND cr2.status = 'pago'), 0) as recebido
            FROM projetos p
            JOIN orcamentos o ON o.id = p.orc_id
            WHERE p.status NOT IN ('cancelado')
            ${userFilterP.replace('o.', 'p.')}
            GROUP BY o.cliente_id
            ORDER BY valor_total DESC
            LIMIT 5
        `).all(...params);

        // ── Fluxo de caixa projetado (próximos 90 dias, por mês) ─
        const fluxoProjetado = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = MESES[d.getMonth()];

            const entradas = db.prepare(`
                SELECT COALESCE(SUM(cr.valor), 0) as total
                FROM contas_receber cr
                WHERE cr.status = 'pendente' AND strftime('%Y-%m', cr.data_vencimento) = ?
            `).get(mes);

            const saidas = db.prepare(`
                SELECT COALESCE(SUM(valor), 0) as total
                FROM contas_pagar WHERE status = 'pendente' AND strftime('%Y-%m', data_vencimento) = ?
            `).get(mes);

            fluxoProjetado.push({
                mes, label,
                entradas: entradas.total,
                saidas: saidas?.total || 0,
                saldo: entradas.total - (saidas?.total || 0),
            });
        }

        // ── Contas a pagar próximas ─────────────────────────────
        const contasPagar = db.prepare(`
            SELECT id, descricao, valor, data_vencimento, categoria, fornecedor, status,
                   CAST(julianday(data_vencimento) - julianday('now') AS INTEGER) as dias_ate
            FROM contas_pagar
            WHERE status = 'pendente'
            ORDER BY data_vencimento ASC
            LIMIT 10
        `).all();

        // ── Contas a pagar vencidas ─────────────────────────────
        const pagarVencidas = db.prepare(`
            SELECT COALESCE(SUM(valor), 0) as total, COUNT(*) as qtd
            FROM contas_pagar
            WHERE status = 'pendente' AND data_vencimento < date('now')
        `).get();

        res.json({
            resumo: {
                receita_mes: receitaMes.total,
                despesa_mes: despesaMes.total + (pagarMes?.pago || 0),
                pagar_mes: pagarMes?.total || 0,
                pagar_pendente: pagarMes?.pendente || 0,
                lucro_mes: lucro,
                margem_pct: margem,
            },
            ultimos_6_meses: ultimos6,
            despesas_por_categoria: despPorCategoria,
            top_projetos: topProjetos,
            top_clientes: topClientes,
            fluxo_projetado: fluxoProjetado,
            contas_pagar_proximas: contasPagar,
            pagar_vencidas: pagarVencidas,
        });

    } catch (err) {
        console.error('Dashboard financeiro error:', err);
        res.status(500).json({ error: 'Erro ao carregar dashboard financeiro' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/dashboard/relatorio/:tipo — Relatórios exportáveis
// ═══════════════════════════════════════════════════════
router.get('/relatorio/:tipo', requireAuth, (req, res) => {
    const { tipo } = req.params;
    const { periodo_inicio, periodo_fim } = req.query;
    const inicio = periodo_inicio || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const fim = periodo_fim || new Date().toISOString().slice(0, 10);

    try {
        switch (tipo) {
            case 'clientes': {
                const rows = db.prepare(`
                    SELECT c.id, c.nome, c.tel, c.email, c.cidade, c.estado, c.tipo_pessoa, c.cpf, c.cnpj, c.arq, c.origem, c.criado_em,
                           COUNT(DISTINCT o.id) as total_orcamentos,
                           COUNT(DISTINCT CASE WHEN o.kb_col IN ('ok','prod','mont') THEN o.id END) as aprovados,
                           COALESCE(SUM(CASE WHEN o.kb_col IN ('ok','prod','mont') THEN o.valor_venda ELSE 0 END), 0) as total_faturado,
                           COUNT(DISTINCT p.id) as total_projetos
                    FROM clientes c
                    LEFT JOIN orcamentos o ON o.cliente_id = c.id AND o.tipo != 'aditivo'
                    LEFT JOIN projetos p ON p.cliente_id = c.id
                    GROUP BY c.id
                    ORDER BY total_faturado DESC
                `).all();
                res.json({ tipo: 'clientes', periodo: { inicio, fim }, dados: rows });
                break;
            }

            case 'orcamentos': {
                const rows = db.prepare(`
                    SELECT o.id, o.numero, o.cliente_nome, o.ambiente, o.valor_venda, o.custo_material,
                           o.kb_col, o.tipo, o.criado_em, o.atualizado_em,
                           u.nome as vendedor,
                           o.parent_orc_id
                    FROM orcamentos o
                    LEFT JOIN users u ON o.user_id = u.id
                    WHERE o.criado_em BETWEEN ? AND ? || ' 23:59:59'
                    ORDER BY o.criado_em DESC
                `).all(inicio, fim);
                res.json({ tipo: 'orcamentos', periodo: { inicio, fim }, dados: rows });
                break;
            }

            case 'projetos': {
                const rows = db.prepare(`
                    SELECT p.id, p.nome, p.status, p.data_inicio, p.data_vencimento,
                           o.cliente_nome, o.valor_venda, o.custo_material, o.numero as orc_numero,
                           COALESCE((SELECT SUM(cr.valor) FROM contas_receber cr WHERE cr.projeto_id = p.id AND cr.status = 'pago'), 0) as recebido,
                           COALESCE((SELECT SUM(cr.valor) FROM contas_receber cr WHERE cr.projeto_id = p.id AND cr.status = 'pendente'), 0) as a_receber,
                           COALESCE((SELECT SUM(d.valor) FROM despesas_projeto d WHERE d.projeto_id = p.id), 0) as despesas,
                           (SELECT COUNT(*) FROM etapas_projeto e WHERE e.projeto_id = p.id) as total_etapas,
                           (SELECT COUNT(*) FROM etapas_projeto e WHERE e.projeto_id = p.id AND e.status = 'concluida') as etapas_concluidas,
                           p.criado_em
                    FROM projetos p
                    LEFT JOIN orcamentos o ON o.id = p.orc_id
                    WHERE p.criado_em BETWEEN ? AND ? || ' 23:59:59'
                    ORDER BY p.criado_em DESC
                `).all(inicio, fim);
                res.json({ tipo: 'projetos', periodo: { inicio, fim }, dados: rows });
                break;
            }

            case 'financeiro': {
                const receber = db.prepare(`
                    SELECT cr.id, cr.descricao, cr.valor, cr.data_vencimento, cr.data_pagamento,
                           cr.status, cr.meio_pagamento as forma_pagamento, p.nome as projeto_nome
                    FROM contas_receber cr
                    LEFT JOIN projetos p ON p.id = cr.projeto_id
                    WHERE cr.data_vencimento BETWEEN ? AND ?
                    ORDER BY cr.data_vencimento ASC
                `).all(inicio, fim);

                const pagar = db.prepare(`
                    SELECT cp.id, cp.descricao, cp.valor, cp.data_vencimento, cp.data_pagamento,
                           cp.status, cp.categoria, cp.fornecedor
                    FROM contas_pagar cp
                    WHERE cp.data_vencimento BETWEEN ? AND ?
                    ORDER BY cp.data_vencimento ASC
                `).all(inicio, fim);

                const despesas = db.prepare(`
                    SELECT d.id, d.descricao, d.valor, d.data, d.categoria, d.fornecedor,
                           p.nome as projeto_nome
                    FROM despesas_projeto d
                    LEFT JOIN projetos p ON p.id = d.projeto_id
                    WHERE d.data BETWEEN ? AND ?
                    ORDER BY d.data ASC
                `).all(inicio, fim);

                const totalReceber = receber.reduce((s, r) => s + (r.valor || 0), 0);
                const totalRecebido = receber.filter(r => r.status === 'pago').reduce((s, r) => s + (r.valor || 0), 0);
                const totalPagar = pagar.reduce((s, r) => s + (r.valor || 0), 0);
                const totalPago = pagar.filter(r => r.status === 'pago').reduce((s, r) => s + (r.valor || 0), 0);
                const totalDespesas = despesas.reduce((s, r) => s + (r.valor || 0), 0);

                res.json({
                    tipo: 'financeiro', periodo: { inicio, fim },
                    resumo: { totalReceber, totalRecebido, totalPagar, totalPago, totalDespesas, saldo: totalRecebido - totalPago - totalDespesas },
                    contas_receber: receber,
                    contas_pagar: pagar,
                    despesas,
                });
                break;
            }

            case 'produtividade': {
                const rows = db.prepare(`
                    SELECT u.id as colaborador_id, u.nome as colaborador_nome,
                           COUNT(DISTINCT ah.projeto_id) as projetos_trabalhados,
                           COALESCE(SUM(ah.horas), 0) as total_horas,
                           COALESCE(SUM(ah.horas * u.valor_hora), 0) as custo_total
                    FROM colaboradores u
                    LEFT JOIN apontamentos_horas ah ON ah.colaborador_id = u.id
                        AND ah.data BETWEEN ? AND ?
                    WHERE u.ativo = 1
                    GROUP BY u.id
                    ORDER BY total_horas DESC
                `).all(inicio, fim);
                res.json({ tipo: 'produtividade', periodo: { inicio, fim }, dados: rows });
                break;
            }

            case 'conversao': {
                const rows = db.prepare(`
                    SELECT kb_col, COUNT(*) as total,
                           COALESCE(SUM(valor_venda), 0) as valor
                    FROM orcamentos
                    WHERE tipo != 'aditivo'
                      AND criado_em BETWEEN ? AND ? || ' 23:59:59'
                    GROUP BY kb_col
                    ORDER BY total DESC
                `).all(inicio, fim);
                const grandTotal = rows.reduce((s, r) => s + r.total, 0) || 1;
                const KB_ORDER = { lead: 'Lead', orc: 'Orçamento', env: 'Enviado', neg: 'Negociação', ok: 'Aprovado', prod: 'Produção', mont: 'Montagem', arq: 'Arquivo', perdido: 'Perdido' };
                const dados = Object.entries(KB_ORDER).map(([key, label]) => {
                    const found = rows.find(r => r.kb_col === key);
                    return {
                        etapa: label,
                        total: found ? found.total : 0,
                        valor: found ? found.valor : 0,
                        pct_total: found ? Math.round((found.total / grandTotal) * 100) : 0,
                    };
                }).filter(r => r.total > 0);
                res.json({ tipo: 'conversao', periodo: { inicio, fim }, dados });
                break;
            }

            case 'vendedores': {
                const rows = db.prepare(`
                    SELECT u.id, u.nome,
                           COUNT(o.id) as total_orcs,
                           COALESCE(SUM(o.valor_venda), 0) as valor_orcs,
                           COUNT(CASE WHEN o.kb_col IN ('ok','prod','mont') THEN 1 END) as aprovados,
                           COALESCE(SUM(CASE WHEN o.kb_col IN ('ok','prod','mont') THEN o.valor_venda ELSE 0 END), 0) as valor_aprovados,
                           COUNT(CASE WHEN o.kb_col = 'perdido' THEN 1 END) as perdidos
                    FROM users u
                    LEFT JOIN orcamentos o ON o.user_id = u.id
                        AND o.tipo != 'aditivo'
                        AND o.criado_em BETWEEN ? AND ? || ' 23:59:59'
                    WHERE u.role IN ('admin','gerente','vendedor')
                    GROUP BY u.id
                    ORDER BY valor_aprovados DESC
                `).all(inicio, fim);
                const dados = rows.map(r => ({
                    ...r,
                    taxa_conversao: r.total_orcs > 0 ? Math.round((r.aprovados / r.total_orcs) * 100) : 0,
                    ticket_medio: r.aprovados > 0 ? Math.round(r.valor_aprovados / r.aprovados) : 0,
                }));
                res.json({ tipo: 'vendedores', periodo: { inicio, fim }, dados });
                break;
            }

            default:
                res.status(400).json({ error: 'Tipo de relatório inválido' });
        }
    } catch (err) {
        console.error('Relatório error:', err);
        res.status(500).json({ error: 'Erro ao gerar relatório' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/dashboard/busca — busca global
// ═══════════════════════════════════════════════════════
router.get('/busca', requireAuth, (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ clientes: [], orcamentos: [], projetos: [] });

    const like = `%${q}%`;
    try {
        const clientes = db.prepare(`
            SELECT id, nome, tel, email, cidade FROM clientes
            WHERE nome LIKE ? OR email LIKE ? OR tel LIKE ? OR cidade LIKE ?
            ORDER BY nome LIMIT 8
        `).all(like, like, like, like);

        const orcamentos = db.prepare(`
            SELECT id, numero, cliente_nome, ambiente, valor_venda, status, kb_col
            FROM orcamentos
            WHERE cliente_nome LIKE ? OR ambiente LIKE ? OR CAST(numero AS TEXT) LIKE ?
            ORDER BY criado_em DESC LIMIT 8
        `).all(like, like, like);

        const projetos = db.prepare(`
            SELECT p.id, p.nome, p.status, o.cliente_nome
            FROM projetos p
            LEFT JOIN orcamentos o ON o.id = p.orc_id
            WHERE p.nome LIKE ? OR o.cliente_nome LIKE ?
            ORDER BY p.criado_em DESC LIMIT 8
        `).all(like, like);

        res.json({ clientes, orcamentos, projetos });
    } catch (err) {
        console.error('Busca error:', err);
        res.status(500).json({ error: 'Erro na busca' });
    }
});

export default router;
