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

export default router;
