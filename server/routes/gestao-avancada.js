import { Router } from 'express';
import { randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import evolution from '../services/evolution.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// LOGÍSTICA — Entregas + Instalações
// ═══════════════════════════════════════════════════════

router.get('/entregas', requireAuth, (req, res) => {
    const { data_inicio, data_fim, status } = req.query;
    let sql = `SELECT e.*, p.nome as projeto_nome, o.cliente_nome
               FROM entregas e LEFT JOIN projetos p ON p.id = e.projeto_id LEFT JOIN orcamentos o ON o.id = p.orc_id WHERE 1=1`;
    const params = [];
    if (data_inicio) { sql += ' AND e.data_agendada >= ?'; params.push(data_inicio); }
    if (data_fim) { sql += ' AND e.data_agendada <= ?'; params.push(data_fim); }
    if (status) { sql += ' AND e.status = ?'; params.push(status); }
    sql += ' ORDER BY e.data_agendada ASC LIMIT 100';
    res.json(db.prepare(sql).all(...params));
});

router.post('/entregas', requireAuth, (req, res) => {
    const { projeto_id, data_agendada, turno, endereco, motorista, veiculo, obs } = req.body;
    const result = db.prepare(`INSERT INTO entregas (projeto_id, data_agendada, turno, endereco, motorista, veiculo, obs, criado_por)
        VALUES (?,?,?,?,?,?,?,?)`).run(projeto_id, data_agendada, turno || 'manha', endereco || '', motorista || '', veiculo || '', obs || '', req.user.id);
    res.json(db.prepare('SELECT * FROM entregas WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/entregas/:id', requireAuth, (req, res) => {
    const { status, checkin_hora, checkout_hora, checkin_lat, checkin_lon, obs } = req.body;
    const sets = [], params = [];
    if (status) { sets.push('status=?'); params.push(status); }
    if (checkin_hora) { sets.push('checkin_hora=?'); params.push(checkin_hora); }
    if (checkout_hora) { sets.push('checkout_hora=?'); params.push(checkout_hora); }
    if (checkin_lat) { sets.push('checkin_lat=?, checkin_lon=?'); params.push(checkin_lat, checkin_lon); }
    if (obs !== undefined) { sets.push('obs=?'); params.push(obs); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    db.prepare(`UPDATE entregas SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json(db.prepare('SELECT * FROM entregas WHERE id = ?').get(req.params.id));
});

router.post('/instalacoes', requireAuth, (req, res) => {
    const { projeto_id, entrega_id, montador_id, data_agendada, obs } = req.body;
    const result = db.prepare(`INSERT INTO instalacoes (projeto_id, entrega_id, montador_id, data_agendada, obs) VALUES (?,?,?,?,?)`)
        .run(projeto_id, entrega_id || null, montador_id || null, data_agendada, obs || '');
    res.json(db.prepare('SELECT * FROM instalacoes WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/instalacoes', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT i.*, p.nome as projeto_nome, c.nome as montador_nome, o.cliente_nome
        FROM instalacoes i LEFT JOIN projetos p ON p.id = i.projeto_id
        LEFT JOIN colaboradores c ON c.id = i.montador_id
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        ORDER BY i.data_agendada ASC LIMIT 100`).all();
    res.json(rows);
});

router.put('/instalacoes/:id', requireAuth, (req, res) => {
    const { status, data_inicio, data_fim, horas_reais, avaliacao_cliente, obs } = req.body;
    db.prepare(`UPDATE instalacoes SET status=COALESCE(?,status), data_inicio=COALESCE(?,data_inicio),
        data_fim=COALESCE(?,data_fim), horas_reais=COALESCE(?,horas_reais),
        avaliacao_cliente=COALESCE(?,avaliacao_cliente), obs=COALESCE(?,obs) WHERE id=?`)
        .run(status, data_inicio, data_fim, horas_reais, avaliacao_cliente, obs, req.params.id);
    res.json(db.prepare('SELECT * FROM instalacoes WHERE id = ?').get(req.params.id));
});

// ═══════════════════════════════════════════════════════
// AUDIT LOG — Trilha de auditoria
// ═══════════════════════════════════════════════════════

router.get('/audit', requireAuth, requireRole('admin'), (req, res) => {
    const { entidade, entidade_id, user_id, limit = 100, offset = 0 } = req.query;
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (entidade) { sql += ' AND entidade = ?'; params.push(entidade); }
    if (entidade_id) { sql += ' AND entidade_id = ?'; params.push(entidade_id); }
    if (user_id) { sql += ' AND user_id = ?'; params.push(user_id); }
    sql += ' ORDER BY criado_em DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit) || 100, parseInt(offset) || 0);
    res.json(db.prepare(sql).all(...params));
});

// Helper: registrar no audit log (chamado de outras rotas)
export function registrarAudit(userId, userNome, acao, entidade, entidadeId, dadosAntes, dadosDepois, ip) {
    try {
        db.prepare(`INSERT INTO audit_log (user_id, user_nome, acao, entidade, entidade_id, dados_antes, dados_depois, ip) VALUES (?,?,?,?,?,?,?,?)`)
            .run(userId, userNome || '', acao, entidade, entidadeId || null,
                typeof dadosAntes === 'object' ? JSON.stringify(dadosAntes) : (dadosAntes || ''),
                typeof dadosDepois === 'object' ? JSON.stringify(dadosDepois) : (dadosDepois || ''),
                ip || '');
    } catch (_) { /* audit log não bloqueia operação */ }
}

// ═══════════════════════════════════════════════════════
// GESTÃO DE PESSOAS — Ponto, Férias
// ═══════════════════════════════════════════════════════

// Whitelist de campos — impede SQL injection via req.body.tipo
const PONTO_CAMPOS_VALIDOS = new Set(['entrada', 'saida_almoco', 'retorno_almoco', 'saida']);

router.post('/ponto', requireAuth, (req, res) => {
    const { colaborador_id, tipo } = req.body; // tipo: entrada, saida_almoco, retorno_almoco, saida
    const hoje = new Date().toISOString().slice(0, 10);
    const agora = new Date().toISOString();

    let registro = db.prepare('SELECT * FROM controle_ponto WHERE colaborador_id = ? AND data = ?').get(colaborador_id, hoje);
    if (!registro) {
        db.prepare('INSERT INTO controle_ponto (colaborador_id, data, entrada) VALUES (?, ?, ?)').run(colaborador_id, hoje, agora);
        return res.json({ ok: true, tipo: 'entrada', hora: agora });
    }

    // Se tipo vier do body, validar contra whitelist; caso contrário, inferir pelo estado.
    let campo;
    if (tipo !== undefined) {
        if (!PONTO_CAMPOS_VALIDOS.has(tipo)) {
            return res.status(400).json({ error: 'tipo inválido' });
        }
        campo = tipo;
    } else {
        campo = !registro.saida_almoco ? 'saida_almoco' : !registro.retorno_almoco ? 'retorno_almoco' : 'saida';
    }
    db.prepare(`UPDATE controle_ponto SET ${campo} = ? WHERE id = ?`).run(agora, registro.id);

    // Calcular horas se saída final
    if (campo === 'saida') {
        const entrada = new Date(registro.entrada);
        const saida = new Date(agora);
        let horas = (saida - entrada) / 3600000;
        if (registro.saida_almoco && registro.retorno_almoco) {
            horas -= (new Date(registro.retorno_almoco) - new Date(registro.saida_almoco)) / 3600000;
        }
        const extras = Math.max(0, horas - 8.5); // 8.5h padrão
        db.prepare('UPDATE controle_ponto SET horas_trabalhadas = ?, horas_extras = ? WHERE id = ?')
            .run(Math.round(horas * 100) / 100, Math.round(extras * 100) / 100, registro.id);
    }

    res.json({ ok: true, tipo: campo, hora: agora });
});

router.get('/ponto', requireAuth, (req, res) => {
    const { colaborador_id, mes } = req.query;
    let sql = `SELECT cp.*, c.nome as colaborador_nome FROM controle_ponto cp
               JOIN colaboradores c ON c.id = cp.colaborador_id WHERE 1=1`;
    const params = [];
    if (colaborador_id) { sql += ' AND cp.colaborador_id = ?'; params.push(colaborador_id); }
    if (mes) { sql += " AND strftime('%Y-%m', cp.data) = ?"; params.push(mes); }
    sql += ' ORDER BY cp.data DESC LIMIT 100';
    res.json(db.prepare(sql).all(...params));
});

router.get('/ferias', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT fa.*, c.nome as colaborador_nome FROM ferias_afastamentos fa
        JOIN colaboradores c ON c.id = fa.colaborador_id ORDER BY fa.data_inicio DESC`).all();
    res.json(rows);
});

router.post('/ferias', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { colaborador_id, tipo, data_inicio, data_fim, obs } = req.body;
    const dias = Math.ceil((new Date(data_fim) - new Date(data_inicio)) / 86400000) + 1;
    const result = db.prepare(`INSERT INTO ferias_afastamentos (colaborador_id, tipo, data_inicio, data_fim, dias, obs) VALUES (?,?,?,?,?,?)`)
        .run(colaborador_id, tipo || 'ferias', data_inicio, data_fim, dias, obs || '');
    res.json(db.prepare('SELECT * FROM ferias_afastamentos WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════
// NPS — Pesquisa de Satisfação
// ═══════════════════════════════════════════════════════

router.post('/nps/enviar', requireAuth, (req, res) => {
    const { projeto_id, cliente_id } = req.body;
    const token = randomBytes(16).toString('hex');
    const result = db.prepare('INSERT INTO pesquisa_nps (projeto_id, cliente_id, token) VALUES (?,?,?)')
        .run(projeto_id, cliente_id, token);
    res.json({ id: result.lastInsertRowid, token, url: `/nps/${token}` });
});

// Público — responder NPS
router.post('/nps/responder/:token', (req, res) => {
    const { nota, comentario } = req.body;
    if (nota === undefined || nota < 0 || nota > 10) return res.status(400).json({ error: 'Nota 0-10 obrigatória' });
    const nps = db.prepare('SELECT * FROM pesquisa_nps WHERE token = ? AND respondido = 0').get(req.params.token);
    if (!nps) return res.status(404).json({ error: 'Pesquisa não encontrada ou já respondida' });
    db.prepare('UPDATE pesquisa_nps SET nota = ?, comentario = ?, respondido = 1, respondido_em = CURRENT_TIMESTAMP WHERE id = ?')
        .run(nota, comentario || '', nps.id);
    res.json({ ok: true, obrigado: true });
});

router.get('/nps', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT n.*, p.nome as projeto_nome, c.nome as cliente_nome
        FROM pesquisa_nps n LEFT JOIN projetos p ON p.id = n.projeto_id LEFT JOIN clientes c ON c.id = n.cliente_id
        ORDER BY n.criado_em DESC LIMIT 100`).all();
    const respondidas = rows.filter(r => r.respondido);
    const media = respondidas.length > 0 ? respondidas.reduce((s, r) => s + r.nota, 0) / respondidas.length : 0;
    const promotores = respondidas.filter(r => r.nota >= 9).length;
    const detratores = respondidas.filter(r => r.nota <= 6).length;
    const npsScore = respondidas.length > 0 ? Math.round(((promotores - detratores) / respondidas.length) * 100) : 0;
    res.json({ rows, media: Math.round(media * 10) / 10, npsScore, total: rows.length, respondidas: respondidas.length });
});

// ═══════════════════════════════════════════════════════
// INDICAÇÕES
// ═══════════════════════════════════════════════════════

router.post('/indicacoes', requireAuth, (req, res) => {
    const { cliente_origem_id, nome_indicado, telefone_indicado, email_indicado } = req.body;
    const result = db.prepare(`INSERT INTO indicacoes (cliente_origem_id, nome_indicado, telefone_indicado, email_indicado) VALUES (?,?,?,?)`)
        .run(cliente_origem_id, nome_indicado || '', telefone_indicado || '', email_indicado || '');
    res.json(db.prepare('SELECT * FROM indicacoes WHERE id = ?').get(result.lastInsertRowid));
});

router.get('/indicacoes', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT i.*, co.nome as cliente_origem_nome, cc.nome as convertido_nome
        FROM indicacoes i LEFT JOIN clientes co ON co.id = i.cliente_origem_id
        LEFT JOIN clientes cc ON cc.id = i.convertido_cliente_id
        ORDER BY i.criado_em DESC`).all();
    res.json(rows);
});

// Atualizar indicação (marcar como convertida, adicionar recompensa)
router.put('/indicacoes/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const { convertido_cliente_id, recompensa, status } = req.body;

        const indicacao = db.prepare('SELECT * FROM indicacoes WHERE id = ?').get(id);
        if (!indicacao) return res.status(404).json({ error: 'Indicação não encontrada' });

        const foiConvertidaAntes = !!indicacao.convertido_cliente_id;

        // Campos permitidos para atualização
        const updates = [];
        const params = [];
        if (convertido_cliente_id !== undefined) { updates.push('convertido_cliente_id = ?'); params.push(convertido_cliente_id || null); }
        if (recompensa !== undefined) { updates.push('recompensa = ?'); params.push(recompensa || ''); }
        if (status !== undefined) { updates.push('status = ?'); params.push(status); }
        if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

        db.prepare(`UPDATE indicacoes SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);

        // WhatsApp automático para quem indicou quando vira cliente
        const acabouDeConverter = convertido_cliente_id && !foiConvertidaAntes;
        if (acabouDeConverter) {
            (async () => {
                try {
                    if (!evolution.isConfigured()) return;
                    const clienteOrigem = db.prepare('SELECT nome, telefone FROM clientes WHERE id = ?').get(indicacao.cliente_origem_id);
                    const tel = (clienteOrigem?.telefone || '').replace(/\D/g, '');
                    if (!tel) return;
                    const dest = evolution.formatPhone(tel);
                    const emp = db.prepare('SELECT nome FROM empresa_config WHERE id = 1').get();
                    const msg = [
                        `Olá${clienteOrigem?.nome ? ` ${clienteOrigem.nome.split(' ')[0]}` : ''}! 🎉`,
                        ``,
                        `Ótima notícia! A pessoa que você indicou *(${indicacao.nome_indicado})* se tornou nosso cliente!`,
                        ``,
                        `Muito obrigado pela indicação. Você é parte fundamental do crescimento da ${emp?.nome || 'nossa empresa'}.`,
                        recompensa ? `\n🎁 Sua recompensa: ${recompensa}` : '',
                        ``,
                        `Continue indicando — cada indicação é muito valorizada! 🙏`,
                    ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
                    await evolution.sendText(dest, msg);
                } catch (wErr) {
                    console.error('[indicacoes] WhatsApp recompensa erro:', wErr.message);
                }
            })();
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[indicacoes] Erro update:', err);
        res.status(500).json({ error: 'Erro ao atualizar indicação' });
    }
});

// ═══════════════════════════════════════════════════════
// MANUTENÇÃO DE MÁQUINAS
// ═══════════════════════════════════════════════════════

router.get('/manutencao', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM manutencao_maquinas ORDER BY data_proxima ASC').all();
    const vencidas = rows.filter(r => r.data_proxima && new Date(r.data_proxima) < new Date());
    res.json({ rows, vencidas: vencidas.length });
});

router.post('/manutencao', requireAuth, (req, res) => {
    const { maquina_nome, tipo, descricao, data_realizada, data_proxima, custo, responsavel, horas_uso, obs } = req.body;
    const result = db.prepare(`INSERT INTO manutencao_maquinas (maquina_nome, tipo, descricao, data_realizada, data_proxima, custo, responsavel, horas_uso, obs)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(maquina_nome, tipo || 'preventiva', descricao || '', data_realizada || null, data_proxima || null, custo || 0, responsavel || '', horas_uso || 0, obs || '');
    res.json(db.prepare('SELECT * FROM manutencao_maquinas WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════
// RELATÓRIOS AVANÇADOS — DRE, Rentabilidade, Sazonalidade
// ═══════════════════════════════════════════════════════

// DRE Automático
router.get('/relatorios/dre', requireAuth, (req, res) => {
    const { periodo = 'mes', data } = req.query;
    const dataRef = data || new Date().toISOString().slice(0, 7); // YYYY-MM

    // Receitas (contas_receber pagas no período)
    const receitas = db.prepare(`
        SELECT SUM(valor) as total FROM contas_receber
        WHERE status = 'pago' AND deletado = 0 AND strftime('%Y-%m', data_pagamento) = ?
    `).get(dataRef)?.total || 0;

    // Despesas por categoria
    const despesasProjeto = db.prepare(`
        SELECT SUM(valor) as total, categoria FROM despesas_projeto
        WHERE deletado = 0 AND strftime('%Y-%m', data) = ? GROUP BY categoria
    `).all(dataRef);

    const contasPagas = db.prepare(`
        SELECT SUM(valor) as total, categoria FROM contas_pagar
        WHERE status = 'pago' AND deletado = 0 AND strftime('%Y-%m', data_pagamento) = ? GROUP BY categoria
    `).all(dataRef);

    // Centro de custo (fixo mensal)
    let custoFixo = 0;
    try {
        const emp = db.prepare('SELECT centro_custo_json FROM empresa_config WHERE id = 1').get();
        const linhas = JSON.parse(emp?.centro_custo_json || '[]');
        custoFixo = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    } catch (_) {}

    const totalDespesas = despesasProjeto.reduce((s, d) => s + d.total, 0)
        + contasPagas.reduce((s, d) => s + d.total, 0);

    res.json({
        periodo: dataRef,
        receitas,
        despesas: { projetos: despesasProjeto, contas: contasPagas, custoFixo, total: totalDespesas + custoFixo },
        lucro: receitas - totalDespesas - custoFixo,
        margem: receitas > 0 ? Math.round(((receitas - totalDespesas - custoFixo) / receitas) * 100) : 0,
    });
});

// Radar de Rentabilidade — Top projetos por margem
router.get('/relatorios/rentabilidade', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT p.id, p.nome, o.cliente_nome, o.valor_venda, o.custo_material,
               cr.custo_material_real, cr.custo_mdo_real, cr.desvio_pct,
               (SELECT SUM(valor) FROM despesas_projeto WHERE projeto_id = p.id AND deletado = 0) as despesas,
               (SELECT SUM(valor) FROM contas_receber WHERE projeto_id = p.id AND status = 'pago' AND deletado = 0) as recebido
        FROM projetos p
        JOIN orcamentos o ON o.id = p.orc_id
        LEFT JOIN custo_real_projeto cr ON cr.projeto_id = p.id
        WHERE p.status IN ('concluido', 'entregue', 'instalado')
        ORDER BY p.criado_em DESC LIMIT 30
    `).all();

    rows.forEach(r => {
        r.custoTotal = (r.custo_material_real || r.custo_material || 0) + (r.custo_mdo_real || 0) + (r.despesas || 0);
        r.lucro = (r.recebido || r.valor_venda || 0) - r.custoTotal;
        r.margem = r.recebido > 0 ? Math.round((r.lucro / r.recebido) * 100) : 0;
    });

    res.json(rows.sort((a, b) => b.margem - a.margem));
});

// Sazonalidade — Faturamento por mês nos últimos 24 meses
router.get('/relatorios/sazonalidade', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT strftime('%Y-%m', data_pagamento) as mes, SUM(valor) as faturamento, COUNT(*) as parcelas
        FROM contas_receber
        WHERE status = 'pago' AND deletado = 0 AND data_pagamento >= date('now', '-24 months')
        GROUP BY mes ORDER BY mes ASC
    `).all();
    res.json(rows);
});

// Previsão de Caixa — 30/60/90 dias
router.get('/relatorios/previsao-caixa', requireAuth, (req, res) => {
    const receber30 = db.prepare(`SELECT SUM(valor) as v FROM contas_receber WHERE status = 'pendente' AND deletado = 0 AND data_vencimento BETWEEN date('now') AND date('now', '+30 days')`).get()?.v || 0;
    const receber60 = db.prepare(`SELECT SUM(valor) as v FROM contas_receber WHERE status = 'pendente' AND deletado = 0 AND data_vencimento BETWEEN date('now') AND date('now', '+60 days')`).get()?.v || 0;
    const receber90 = db.prepare(`SELECT SUM(valor) as v FROM contas_receber WHERE status = 'pendente' AND deletado = 0 AND data_vencimento BETWEEN date('now') AND date('now', '+90 days')`).get()?.v || 0;

    const pagar30 = db.prepare(`SELECT SUM(valor) as v FROM contas_pagar WHERE status = 'pendente' AND deletado = 0 AND data_vencimento BETWEEN date('now') AND date('now', '+30 days')`).get()?.v || 0;
    const pagar60 = db.prepare(`SELECT SUM(valor) as v FROM contas_pagar WHERE status = 'pendente' AND deletado = 0 AND data_vencimento BETWEEN date('now') AND date('now', '+60 days')`).get()?.v || 0;
    const pagar90 = db.prepare(`SELECT SUM(valor) as v FROM contas_pagar WHERE status = 'pendente' AND deletado = 0 AND data_vencimento BETWEEN date('now') AND date('now', '+90 days')`).get()?.v || 0;

    let custoFixoMensal = 0;
    try {
        const emp = db.prepare('SELECT centro_custo_json FROM empresa_config WHERE id = 1').get();
        custoFixoMensal = JSON.parse(emp?.centro_custo_json || '[]').reduce((s, l) => s + (Number(l.valor) || 0), 0);
    } catch (_) {}

    res.json({
        '30d': { receber: receber30, pagar: pagar30 + custoFixoMensal, saldo: receber30 - pagar30 - custoFixoMensal },
        '60d': { receber: receber60, pagar: pagar60 + custoFixoMensal * 2, saldo: receber60 - pagar60 - custoFixoMensal * 2 },
        '90d': { receber: receber90, pagar: pagar90 + custoFixoMensal * 3, saldo: receber90 - pagar90 - custoFixoMensal * 3 },
    });
});

// Taxa de conversão por vendedor
router.get('/relatorios/conversao', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT u.id, u.nome,
               COUNT(o.id) as total_orcamentos,
               SUM(CASE WHEN o.kb_col IN ('ok','prod','done') THEN 1 ELSE 0 END) as convertidos,
               SUM(CASE WHEN o.kb_col IN ('ok','prod','done') THEN o.valor_venda ELSE 0 END) as faturamento,
               AVG(CASE WHEN o.kb_col IN ('ok','prod','done') THEN o.valor_venda END) as ticket_medio
        FROM orcamentos o
        JOIN users u ON u.id = o.user_id
        WHERE o.criado_em >= date('now', '-6 months')
        GROUP BY u.id ORDER BY faturamento DESC
    `).all();
    rows.forEach(r => { r.taxa_conversao = r.total_orcamentos > 0 ? Math.round((r.convertidos / r.total_orcamentos) * 100) : 0; });
    res.json(rows);
});

export default router;
