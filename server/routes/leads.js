import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/leads/colunas — listar colunas do funil
// ═══════════════════════════════════════════════════════
router.get('/colunas', requireAuth, (req, res) => {
    try {
        const colunas = db.prepare('SELECT * FROM lead_colunas WHERE ativo = 1 ORDER BY ordem ASC').all();
        res.json(colunas);
    } catch (err) {
        console.error('[Leads] Erro ao listar colunas:', err.message);
        res.status(500).json({ error: 'Erro ao listar colunas' });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/leads/colunas — criar coluna
// ═══════════════════════════════════════════════════════
router.post('/colunas', requireAuth, (req, res) => {
    const { nome, cor } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    try {
        const maxOrdem = db.prepare('SELECT MAX(ordem) as m FROM lead_colunas').get();
        const r = db.prepare('INSERT INTO lead_colunas (nome, cor, ordem) VALUES (?, ?, ?)').run(nome, cor || '#64748b', (maxOrdem?.m ?? -1) + 1);
        const coluna = db.prepare('SELECT * FROM lead_colunas WHERE id = ?').get(r.lastInsertRowid);
        res.json(coluna);
    } catch (err) {
        console.error('[Leads] Erro ao criar coluna:', err.message);
        res.status(500).json({ error: 'Erro ao criar coluna' });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/leads/colunas/reordenar — reordenar colunas
// ⚠️ ANTES de /colunas/:id para não ser capturado como :id
// ═══════════════════════════════════════════════════════
router.put('/colunas/reordenar', requireAuth, (req, res) => {
    const { ordem } = req.body; // [{id, ordem}, ...]
    if (!Array.isArray(ordem)) return res.status(400).json({ error: 'Array obrigatório' });
    try {
        const stmt = db.prepare('UPDATE lead_colunas SET ordem = ? WHERE id = ?');
        const tx = db.transaction(() => {
            for (const item of ordem) stmt.run(item.ordem, item.id);
        });
        tx();
        res.json({ ok: true });
    } catch (err) {
        console.error('[Leads] Erro ao reordenar colunas:', err.message);
        res.status(500).json({ error: 'Erro ao reordenar colunas' });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/leads/colunas/:id — editar coluna
// ═══════════════════════════════════════════════════════
router.put('/colunas/:id', requireAuth, (req, res) => {
    const { nome, cor, ordem } = req.body;
    const id = parseInt(req.params.id);
    try {
        const col = db.prepare('SELECT protegida FROM lead_colunas WHERE id = ?').get(id);
        // Protegida: permite mudar cor, mas não o nome
        if (nome !== undefined && !col?.protegida) db.prepare('UPDATE lead_colunas SET nome = ? WHERE id = ?').run(nome, id);
        if (cor !== undefined) db.prepare('UPDATE lead_colunas SET cor = ? WHERE id = ?').run(cor, id);
        if (ordem !== undefined) db.prepare('UPDATE lead_colunas SET ordem = ? WHERE id = ?').run(ordem, id);
        const coluna = db.prepare('SELECT * FROM lead_colunas WHERE id = ?').get(id);
        res.json(coluna);
    } catch (err) {
        console.error('[Leads] Erro ao editar coluna:', err.message);
        res.status(500).json({ error: 'Erro ao editar coluna' });
    }
});

// ═══════════════════════════════════════════════════════
// DELETE /api/leads/colunas/:id — desativar coluna
// ═══════════════════════════════════════════════════════
router.delete('/colunas/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    try {
        // Impedir exclusão de coluna protegida
        const col = db.prepare('SELECT protegida FROM lead_colunas WHERE id = ?').get(id);
        if (col?.protegida) {
            return res.status(400).json({ error: 'Esta coluna é protegida e não pode ser removida' });
        }
        const primeira = db.prepare('SELECT id FROM lead_colunas WHERE ativo = 1 AND id != ? ORDER BY ordem ASC LIMIT 1').get(id);
        if (primeira) {
            db.prepare('UPDATE leads SET coluna_id = ? WHERE coluna_id = ?').run(primeira.id, id);
        }
        db.prepare('UPDATE lead_colunas SET ativo = 0 WHERE id = ?').run(id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Leads] Erro ao desativar coluna:', err.message);
        res.status(500).json({ error: 'Erro ao desativar coluna' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/leads/metricas/dashboard — dashboard de métricas
// ⚠️ ANTES de /:id para não ser capturado como :id
// ═══════════════════════════════════════════════════════
router.get('/metricas/dashboard', requireAuth, (req, res) => {
    try {
        const porColuna = db.prepare(`
            SELECT lc.nome, lc.cor, lc.ordem, COUNT(l.id) as total
            FROM lead_colunas lc LEFT JOIN leads l ON l.coluna_id = lc.id
            WHERE lc.ativo = 1
            GROUP BY lc.id ORDER BY lc.ordem
        `).all();

        const porOrigem = db.prepare(`
            SELECT COALESCE(NULLIF(origem, ''), 'não informado') as origem, COUNT(*) as total
            FROM leads GROUP BY origem ORDER BY total DESC
        `).all();

        const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
        const colConvertido = db.prepare("SELECT id FROM lead_colunas WHERE LOWER(nome) LIKE '%convertido%' LIMIT 1").get();
        const convertidos = colConvertido ? db.prepare('SELECT COUNT(*) as c FROM leads WHERE coluna_id = ?').get(colConvertido.id).c : 0;

        const porMes = db.prepare(`
            SELECT strftime('%Y-%m', criado_em) as mes, COUNT(*) as total
            FROM leads WHERE criado_em >= datetime('now', '-6 months')
            GROUP BY mes ORDER BY mes
        `).all();

        const estaSemana = db.prepare("SELECT COUNT(*) as c FROM leads WHERE criado_em >= datetime('now', 'weekday 0', '-7 days')").get().c;
        const semanaPassada = db.prepare("SELECT COUNT(*) as c FROM leads WHERE criado_em >= datetime('now', 'weekday 0', '-14 days') AND criado_em < datetime('now', 'weekday 0', '-7 days')").get().c;

        let tempoMedioConversao = 0;
        if (colConvertido) {
            const avg = db.prepare(`
                SELECT AVG(julianday(atualizado_em) - julianday(criado_em)) as media
                FROM leads WHERE coluna_id = ?
            `).get(colConvertido.id);
            tempoMedioConversao = Math.round(avg?.media || 0);
        }

        const followupAtrasado = db.prepare("SELECT COUNT(*) as c FROM leads WHERE proximo_followup_em IS NOT NULL AND proximo_followup_em < datetime('now')").get().c;
        const parados = db.prepare("SELECT COUNT(*) as c FROM leads WHERE julianday('now') - julianday(atualizado_em) > 3").get().c;

        res.json({
            porColuna, porOrigem, totalLeads, convertidos,
            taxaConversao: totalLeads > 0 ? ((convertidos / totalLeads) * 100).toFixed(1) : 0,
            porMes, estaSemana, semanaPassada, tempoMedioConversao, followupAtrasado, parados,
        });
    } catch (err) {
        console.error('[Leads] Erro ao gerar métricas:', err.message);
        res.status(500).json({ error: 'Erro ao gerar métricas' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/leads — listar todos os leads
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    try {
        const leads = db.prepare(`
            SELECT l.*, lc.nome as coluna_nome, lc.cor as coluna_cor,
                   c.nome as cliente_nome_crm,
                   u.nome as responsavel_nome,
                   (SELECT COUNT(*) FROM chat_mensagens WHERE conversa_id = l.conversa_id AND direcao = 'entrada') as total_msgs,
                   CAST(julianday('now') - julianday(l.atualizado_em) AS INTEGER) as dias_parado,
                   o.id as orc_id, o.numero as orc_numero, o.valor_venda as orc_valor, o.status_proposta as orc_status
            FROM leads l
            LEFT JOIN lead_colunas lc ON l.coluna_id = lc.id
            LEFT JOIN clientes c ON l.cliente_id = c.id
            LEFT JOIN users u ON l.responsavel_id = u.id
            LEFT JOIN orcamentos o ON o.lead_id = l.id
            ORDER BY l.atualizado_em DESC
        `).all();
        res.json(leads);
    } catch (err) {
        console.error('[Leads] Erro ao listar leads:', err.message);
        res.status(500).json({ error: 'Erro ao listar leads' });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/leads — criar lead manualmente
// ═══════════════════════════════════════════════════════
router.post('/', requireAuth, (req, res) => {
    const { nome, telefone, email, cidade, bairro, projeto, origem, coluna_id, conversa_id, cliente_id, score, dados } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    try {
        let col = coluna_id;
        if (!col) {
            const primeira = db.prepare('SELECT id FROM lead_colunas WHERE ativo = 1 ORDER BY ordem ASC LIMIT 1').get();
            col = primeira?.id || 1;
        }

        const r = db.prepare(`
            INSERT INTO leads (nome, telefone, email, cidade, bairro, projeto, origem, coluna_id, conversa_id, cliente_id, score, dados, responsavel_id, ultimo_contato_em, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(nome, telefone || '', email || '', cidade || '', bairro || '', projeto || '', origem || '', col, conversa_id || null, cliente_id || null, score || 0, dados || '{}', req.user.id);

        const colNome = db.prepare('SELECT nome FROM lead_colunas WHERE id = ?').get(col);
        db.prepare('INSERT INTO lead_historico (lead_id, user_id, acao, para_coluna) VALUES (?, ?, ?, ?)').run(r.lastInsertRowid, req.user.id, 'criado', colNome?.nome || '');

        const lead = db.prepare('SELECT l.*, lc.nome as coluna_nome, lc.cor as coluna_cor FROM leads l LEFT JOIN lead_colunas lc ON l.coluna_id = lc.id WHERE l.id = ?').get(r.lastInsertRowid);
        res.json(lead);
    } catch (err) {
        console.error('[Leads] Erro ao criar lead:', err.message);
        res.status(500).json({ error: 'Erro ao criar lead' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/leads/orcamentos-disponiveis — orçamentos sem lead vinculado
// ⚠️ ROTA FIXA — ANTES de /:id
// ═══════════════════════════════════════════════════════
router.get('/orcamentos-disponiveis', requireAuth, (req, res) => {
    try {
        const orcs = db.prepare(`
            SELECT id, numero, cliente_nome, ambiente, valor_venda, status_proposta, criado_em
            FROM orcamentos WHERE lead_id IS NULL
            ORDER BY criado_em DESC LIMIT 50
        `).all();
        res.json(orcs);
    } catch (err) {
        console.error('[Leads] Erro ao listar orçamentos disponíveis:', err.message);
        res.status(500).json({ error: 'Erro ao listar orçamentos' });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/leads/:id/vincular-orcamento — vincular orçamento existente
// ═══════════════════════════════════════════════════════
router.put('/:id/vincular-orcamento', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    const { orcamento_id } = req.body;
    if (!orcamento_id) return res.status(400).json({ error: 'orcamento_id obrigatório' });
    try {
        // Desvincular orçamento anterior desse lead (se houver)
        db.prepare('UPDATE orcamentos SET lead_id = NULL WHERE lead_id = ?').run(leadId);
        // Vincular o novo
        db.prepare('UPDATE orcamentos SET lead_id = ? WHERE id = ?').run(leadId, orcamento_id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Leads] Erro ao vincular orçamento:', err.message);
        res.status(500).json({ error: 'Erro ao vincular orçamento' });
    }
});

// ═══════════════════════════════════════════════════════
// DELETE /api/leads/:id/vincular-orcamento — desvincular orçamento
// ═══════════════════════════════════════════════════════
router.delete('/:id/vincular-orcamento', requireAuth, (req, res) => {
    const leadId = parseInt(req.params.id);
    try {
        db.prepare('UPDATE orcamentos SET lead_id = NULL WHERE lead_id = ?').run(leadId);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Leads] Erro ao desvincular orçamento:', err.message);
        res.status(500).json({ error: 'Erro ao desvincular orçamento' });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/leads/:id/mover — mover lead no kanban
// ⚠️ ANTES de /:id para não ser capturado
// ═══════════════════════════════════════════════════════
router.put('/:id/mover', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { coluna_id, motivo_perda } = req.body;
    if (!coluna_id) return res.status(400).json({ error: 'coluna_id obrigatório' });

    try {
        const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
        if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

        const deColuna = db.prepare('SELECT nome FROM lead_colunas WHERE id = ?').get(lead.coluna_id);
        const paraColuna = db.prepare('SELECT nome FROM lead_colunas WHERE id = ?').get(coluna_id);

        db.prepare('UPDATE leads SET coluna_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(coluna_id, id);

        if (motivo_perda) {
            db.prepare('UPDATE leads SET motivo_perda = ? WHERE id = ?').run(motivo_perda, id);
        }

        db.prepare('INSERT INTO lead_historico (lead_id, user_id, acao, de_coluna, para_coluna, obs) VALUES (?, ?, ?, ?, ?, ?)').run(
            id, req.user.id, 'movido', deColuna?.nome || '', paraColuna?.nome || '', motivo_perda || ''
        );

        const updated = db.prepare('SELECT l.*, lc.nome as coluna_nome, lc.cor as coluna_cor FROM leads l LEFT JOIN lead_colunas lc ON l.coluna_id = lc.id WHERE l.id = ?').get(id);
        res.json(updated);
    } catch (err) {
        console.error('[Leads] Erro ao mover lead:', err.message);
        res.status(500).json({ error: 'Erro ao mover lead' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/leads/:id/historico — histórico do lead
// ═══════════════════════════════════════════════════════
router.get('/:id/historico', requireAuth, (req, res) => {
    try {
        const hist = db.prepare(`
            SELECT lh.*, u.nome as user_nome
            FROM lead_historico lh LEFT JOIN users u ON lh.user_id = u.id
            WHERE lh.lead_id = ? ORDER BY lh.criado_em DESC
        `).all(parseInt(req.params.id));
        res.json(hist);
    } catch (err) {
        console.error('[Leads] Erro ao listar histórico:', err.message);
        res.status(500).json({ error: 'Erro ao listar histórico' });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/leads/:id — editar lead
// ═══════════════════════════════════════════════════════
router.put('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const fields = ['nome', 'telefone', 'email', 'cidade', 'bairro', 'projeto', 'origem', 'score', 'dados', 'motivo_perda', 'responsavel_id', 'proximo_followup_em', 'cliente_id'];
    const updates = [];
    const values = [];
    for (const f of fields) {
        if (req.body[f] !== undefined) {
            updates.push(`${f} = ?`);
            values.push(req.body[f]);
        }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    updates.push('atualizado_em = CURRENT_TIMESTAMP');
    values.push(id);

    try {
        db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const lead = db.prepare('SELECT l.*, lc.nome as coluna_nome, lc.cor as coluna_cor FROM leads l LEFT JOIN lead_colunas lc ON l.coluna_id = lc.id WHERE l.id = ?').get(id);
        res.json(lead);
    } catch (err) {
        console.error('[Leads] Erro ao editar lead:', err.message);
        res.status(500).json({ error: 'Erro ao editar lead' });
    }
});

// ═══════════════════════════════════════════════════════
// DELETE /api/leads/:id — excluir lead
// ═══════════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    try {
        db.prepare('DELETE FROM lead_historico WHERE lead_id = ?').run(id);
        db.prepare('DELETE FROM leads WHERE id = ?').run(id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Leads] Erro ao excluir lead:', err.message);
        res.status(500).json({ error: 'Erro ao excluir lead' });
    }
});

export default router;
