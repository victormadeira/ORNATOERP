import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { randomBytes } from 'crypto';

const router = Router();

// ═══════════════════════════════════════════════════
// GET /api/projetos/users-list — lista de usuários para dropdown de responsável
// DEVE vir ANTES de /:id para evitar conflito de rota
// ═══════════════════════════════════════════════════
router.get('/users-list', requireAuth, (req, res) => {
    const users = db.prepare('SELECT id, nome, role FROM users WHERE ativo = 1 ORDER BY nome').all();
    res.json(users);
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/portal/:token — acesso público (sem auth)
// DEVE vir ANTES de /:id para evitar conflito de rota
// ═══════════════════════════════════════════════════
router.get('/portal/:token', (req, res) => {
    const proj = db.prepare(`
        SELECT p.*, o.cliente_nome, o.valor_venda
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.token = ?
    `).get(req.params.token);

    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado ou link inválido' });

    const etapas = db.prepare(`
        SELECT e.*, u.nome as responsavel_nome
        FROM etapas_projeto e
        LEFT JOIN users u ON u.id = e.responsavel_id
        WHERE e.projeto_id = ? ORDER BY e.ordem, e.id
    `).all(proj.id);

    const ocorrencias = db.prepare(
        "SELECT * FROM ocorrencias_projeto WHERE projeto_id = ? AND status != 'interno' ORDER BY criado_em DESC"
    ).all(proj.id);

    const empresa = db.prepare(
        'SELECT nome, telefone, email, cidade, estado, cnpj, logo_header_path, proposta_cor_primaria, proposta_cor_accent FROM empresa_config WHERE id = 1'
    ).get() || {};

    // Portal v2: mensagens do chat
    const mensagens = db.prepare(`
        SELECT id, autor_tipo, autor_nome, conteudo, criado_em
        FROM portal_mensagens
        WHERE projeto_id = ? AND token = ?
        ORDER BY criado_em ASC
    `).all(proj.id, req.params.token);

    res.json({
        projeto: {
            id: proj.id,
            nome: proj.nome,
            descricao: proj.descricao,
            status: proj.status,
            data_inicio: proj.data_inicio,
            data_vencimento: proj.data_vencimento,
            cliente_nome: proj.cliente_nome,
            etapas,
            ocorrencias,
            mensagens,
        },
        empresa,
    });
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/portal/:token/mensagens — cliente envia mensagem (público)
// ═══════════════════════════════════════════════════
router.post('/portal/:token/mensagens', (req, res) => {
    const { token } = req.params;
    const { autor_nome, conteudo } = req.body;

    if (!conteudo || !conteudo.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });

    const proj = db.prepare('SELECT id FROM projetos WHERE token = ?').get(token);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const r = db.prepare(`
        INSERT INTO portal_mensagens (projeto_id, token, autor_tipo, autor_nome, conteudo)
        VALUES (?, ?, 'cliente', ?, ?)
    `).run(proj.id, token, (autor_nome || '').trim() || 'Cliente', conteudo.trim());

    const msg = db.prepare('SELECT * FROM portal_mensagens WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(msg);
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/:id/mensagens-portal — listar mensagens do portal (auth)
// ═══════════════════════════════════════════════════
router.get('/:id/mensagens-portal', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const mensagens = db.prepare(`
        SELECT * FROM portal_mensagens WHERE projeto_id = ? ORDER BY criado_em ASC
    `).all(id);
    res.json(mensagens);
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/mensagens-portal — equipe responde (auth)
// ═══════════════════════════════════════════════════
router.post('/:id/mensagens-portal', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { conteudo } = req.body;
    if (!conteudo || !conteudo.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });

    const proj = db.prepare('SELECT id, token FROM projetos WHERE id = ?').get(id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });
    if (!proj.token) return res.status(400).json({ error: 'Projeto sem token de portal' });

    const r = db.prepare(`
        INSERT INTO portal_mensagens (projeto_id, token, autor_tipo, autor_nome, conteudo)
        VALUES (?, ?, 'equipe', ?, ?)
    `).run(proj.id, proj.token, req.user.nome, conteudo.trim());

    // Marcar mensagens do cliente como lidas
    db.prepare(`UPDATE portal_mensagens SET lida = 1 WHERE projeto_id = ? AND autor_tipo = 'cliente' AND lida = 0`).run(proj.id);

    const msg = db.prepare('SELECT * FROM portal_mensagens WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(msg);
});

// ═══════════════════════════════════════════════════
// GET /api/projetos — listar todos (auth)
// ═══════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT p.*, o.cliente_nome, o.ambiente as orc_nome, o.valor_venda,
            (SELECT COUNT(*) FROM etapas_projeto e WHERE e.projeto_id = p.id) as total_etapas,
            (SELECT COUNT(*) FROM etapas_projeto e WHERE e.projeto_id = p.id AND e.status = 'concluida') as etapas_concluidas,
            (SELECT COUNT(*) FROM ocorrencias_projeto oc WHERE oc.projeto_id = p.id AND oc.status = 'aberto') as ocorrencias_abertas,
            (SELECT COUNT(*) FROM contas_receber cr WHERE cr.projeto_id = p.id AND cr.status = 'pendente' AND cr.data_vencimento <= date('now')) as contas_vencidas
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        ORDER BY p.criado_em DESC
    `).all();
    res.json(rows);
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/:id — projeto completo (auth)
// ═══════════════════════════════════════════════════
router.get('/:id', requireAuth, (req, res) => {
    const proj = db.prepare(`
        SELECT p.*, o.cliente_nome, o.valor_venda, o.custo_material, o.numero as orc_numero
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.id = ?
    `).get(parseInt(req.params.id));

    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const etapas = db.prepare(`
        SELECT e.*, u.nome as responsavel_nome
        FROM etapas_projeto e
        LEFT JOIN users u ON u.id = e.responsavel_id
        WHERE e.projeto_id = ? ORDER BY e.ordem, e.id
    `).all(proj.id);

    const ocorrencias = db.prepare(
        'SELECT * FROM ocorrencias_projeto WHERE projeto_id = ? ORDER BY criado_em DESC'
    ).all(proj.id);

    res.json({ ...proj, etapas, ocorrencias });
});

// ═══════════════════════════════════════════════════
// POST /api/projetos — criar projeto (auth)
// ═══════════════════════════════════════════════════
router.post('/', requireAuth, (req, res) => {
    const { orc_id, nome, descricao, data_inicio, data_vencimento, etapas } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const token = randomBytes(16).toString('hex');

    const r = db.prepare(`
        INSERT INTO projetos (user_id, orc_id, nome, descricao, data_inicio, data_vencimento, token)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.user.id,
        orc_id ? parseInt(orc_id) : null,
        nome.trim(),
        descricao || '',
        data_inicio || null,
        data_vencimento || null,
        token
    );

    const projId = r.lastInsertRowid;

    // Inserir etapas iniciais se fornecidas
    if (Array.isArray(etapas) && etapas.length > 0) {
        const stmt = db.prepare(`
            INSERT INTO etapas_projeto (projeto_id, nome, descricao, data_inicio, data_vencimento, responsavel_id, ordem)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        etapas.forEach((e, i) =>
            stmt.run(projId, e.nome, e.descricao || '', e.data_inicio || null, e.data_vencimento || null, e.responsavel_id || null, i)
        );
    }

    res.json({ id: projId, token });
});

// ═══════════════════════════════════════════════════
// PUT /api/projetos/:id — atualizar projeto (auth)
// ═══════════════════════════════════════════════════
router.put('/:id', requireAuth, (req, res) => {
    const { nome, descricao, status, data_inicio, data_vencimento } = req.body;
    db.prepare(`
        UPDATE projetos
        SET nome=?, descricao=?, status=?, data_inicio=?, data_vencimento=?, atualizado_em=CURRENT_TIMESTAMP
        WHERE id=?
    `).run(nome, descricao || '', status, data_inicio || null, data_vencimento || null, parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// DELETE /api/projetos/:id — excluir projeto (auth)
// ═══════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    db.prepare('DELETE FROM despesas_projeto WHERE projeto_id = ?').run(id);
    db.prepare('DELETE FROM contas_receber WHERE projeto_id = ?').run(id);
    db.prepare('DELETE FROM movimentacoes_estoque WHERE projeto_id = ?').run(id);
    db.prepare('DELETE FROM montador_tokens WHERE projeto_id = ?').run(id);
    db.prepare('DELETE FROM etapas_projeto WHERE projeto_id = ?').run(id);
    db.prepare('DELETE FROM ocorrencias_projeto WHERE projeto_id = ?').run(id);
    db.prepare('DELETE FROM projetos WHERE id = ?').run(id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/etapas — adicionar etapa
// ═══════════════════════════════════════════════════
router.post('/:id/etapas', requireAuth, (req, res) => {
    const { nome, descricao, data_inicio, data_vencimento, responsavel_id } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const last = db.prepare(
        'SELECT COALESCE(MAX(ordem), -1) as m FROM etapas_projeto WHERE projeto_id = ?'
    ).get(parseInt(req.params.id));

    const r = db.prepare(`
        INSERT INTO etapas_projeto (projeto_id, nome, descricao, data_inicio, data_vencimento, responsavel_id, ordem)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        parseInt(req.params.id), nome, descricao || '',
        data_inicio || null, data_vencimento || null,
        responsavel_id || null, (last.m + 1)
    );
    res.json({ id: r.lastInsertRowid });
});

// ═══════════════════════════════════════════════════
// PUT /api/projetos/etapas/:etapa_id — atualizar etapa
// ═══════════════════════════════════════════════════
router.put('/etapas/:etapa_id', requireAuth, (req, res) => {
    const { nome, descricao, status, data_inicio, data_vencimento, ordem, responsavel_id, progresso, dependencia_id } = req.body;
    db.prepare(`
        UPDATE etapas_projeto
        SET nome=?, descricao=?, status=?, data_inicio=?, data_vencimento=?, ordem=?, responsavel_id=?, progresso=?, dependencia_id=?
        WHERE id=?
    `).run(
        nome, descricao || '', status,
        data_inicio || null, data_vencimento || null,
        ordem ?? 0, responsavel_id || null,
        progresso ?? 0, dependencia_id || null,
        parseInt(req.params.etapa_id)
    );
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// DELETE /api/projetos/etapas/:etapa_id — excluir etapa
// ═══════════════════════════════════════════════════
router.delete('/etapas/:etapa_id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM etapas_projeto WHERE id=?').run(parseInt(req.params.etapa_id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/ocorrencias — adicionar ocorrência
// ═══════════════════════════════════════════════════
router.post('/:id/ocorrencias', requireAuth, (req, res) => {
    const { assunto, descricao, status: ocStatus } = req.body;
    if (!assunto) return res.status(400).json({ error: 'Assunto obrigatório' });

    const r = db.prepare(`
        INSERT INTO ocorrencias_projeto (projeto_id, assunto, descricao, autor, status)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        parseInt(req.params.id), assunto, descricao || '',
        req.user.nome, ocStatus || 'aberto'
    );
    res.json({ id: r.lastInsertRowid });
});

// ═══════════════════════════════════════════════════
// PUT /api/projetos/ocorrencias/:oc_id — atualizar status
// ═══════════════════════════════════════════════════
router.put('/ocorrencias/:oc_id', requireAuth, (req, res) => {
    const { status } = req.body;
    db.prepare('UPDATE ocorrencias_projeto SET status=? WHERE id=?')
        .run(status, parseInt(req.params.oc_id));
    res.json({ ok: true });
});

export default router;
