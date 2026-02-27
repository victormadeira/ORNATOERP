import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { randomBytes } from 'crypto';
import { createNotification, logActivity } from '../services/notificacoes.js';

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

    // Auto-sync status do projeto baseado nas etapas
    const syncedStatus = autoUpdateProjectStatus(proj.id);
    if (syncedStatus) proj.status = syncedStatus;

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
// GET /api/projetos/portal/:token/fotos — listar fotos do montador (público)
// ═══════════════════════════════════════════════════
router.get('/portal/:token/fotos', (req, res) => {
    const proj = db.prepare(`
        SELECT p.id FROM projetos p WHERE p.token = ?
    `).get(req.params.token);

    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const fotos = db.prepare(`
        SELECT id, nome_montador, ambiente, filename, criado_em
        FROM montador_fotos
        WHERE projeto_id = ? AND visivel_portal = 1
        ORDER BY criado_em DESC
    `).all(proj.id);

    const result = fotos.map(f => ({
        ...f,
        url: `/api/drive/arquivo/${proj.id}/montador/${f.filename}`,
    }));

    res.json(result);
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

    const nomeCliente = (autor_nome || '').trim() || 'Cliente';
    const r = db.prepare(`
        INSERT INTO portal_mensagens (projeto_id, token, autor_tipo, autor_nome, conteudo)
        VALUES (?, ?, 'cliente', ?, ?)
    `).run(proj.id, token, nomeCliente, conteudo.trim());

    // Notificar equipe
    const projNome = db.prepare('SELECT nome FROM projetos WHERE id = ?').get(proj.id)?.nome || '';
    try {
        createNotification(
            'portal_mensagem',
            'Nova mensagem do cliente',
            `${nomeCliente} enviou mensagem no portal "${projNome}"`,
            proj.id, 'projeto'
        );
    } catch (_) { /* não bloqueia */ }

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

    // Auto-sync status do projeto baseado nas etapas
    const syncedStatus = autoUpdateProjectStatus(proj.id, req.user.id, req.user.nome);
    if (syncedStatus) proj.status = syncedStatus;

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

    try {
        logActivity(req.user.id, req.user.nome, 'criar', `Criou projeto "${nome.trim()}"`, projId, 'projeto');
    } catch (_) { /* log não bloqueia */ }

    res.json({ id: projId, token });
});

// ═══════════════════════════════════════════════════
// POST /api/projetos/:id/duplicar — duplicar projeto (auth)
// ═══════════════════════════════════════════════════
router.post('/:id/duplicar', requireAuth, (req, res) => {
    const srcId = parseInt(req.params.id);
    const src = db.prepare('SELECT * FROM projetos WHERE id = ?').get(srcId);
    if (!src) return res.status(404).json({ error: 'Projeto não encontrado' });

    const token = randomBytes(24).toString('hex');
    const nome = (req.body.nome || `${src.nome} (cópia)`).trim();

    const r = db.prepare(`
        INSERT INTO projetos (user_id, orc_id, nome, descricao, data_inicio, data_vencimento, status, token)
        VALUES (?, ?, ?, ?, ?, ?, 'nao_iniciado', ?)
    `).run(req.user.id, src.orc_id, nome, src.descricao || '', req.body.data_inicio || null, req.body.data_vencimento || null, token);

    const newProjId = r.lastInsertRowid;

    // Copiar etapas (sem status, progresso e datas)
    const etapas = db.prepare('SELECT * FROM etapas_projeto WHERE projeto_id = ? ORDER BY ordem').all(srcId);
    const stmtEtapa = db.prepare(`
        INSERT INTO etapas_projeto (projeto_id, nome, descricao, data_inicio, data_vencimento, ordem, responsavel_id)
        VALUES (?, ?, ?, NULL, NULL, ?, ?)
    `);
    etapas.forEach(e => stmtEtapa.run(newProjId, e.nome, e.descricao || '', e.ordem, e.responsavel_id));

    try { logActivity(req.user.id, req.user.nome, 'criar', `Duplicou projeto "${src.nome}" → "${nome}"`, newProjId, 'projeto'); } catch (_) {}

    res.json({ id: newProjId, token });
});

// ═══════════════════════════════════════════════════
// GET /api/projetos/templates — listar templates de etapas
// ═══════════════════════════════════════════════════
router.get('/templates/list', requireAuth, (req, res) => {
    const templates = db.prepare('SELECT * FROM etapas_templates ORDER BY nome').all();
    res.json(templates.map(t => ({ ...t, etapas: JSON.parse(t.etapas_json || '[]') })));
});

// POST /api/projetos/templates — salvar template
router.post('/templates', requireAuth, (req, res) => {
    const { nome, etapas } = req.body;
    if (!nome || !etapas?.length) return res.status(400).json({ error: 'Nome e etapas obrigatórios' });
    const r = db.prepare('INSERT INTO etapas_templates (nome, etapas_json) VALUES (?, ?)').run(nome, JSON.stringify(etapas));
    res.json({ id: r.lastInsertRowid });
});

// DELETE /api/projetos/templates/:id
router.delete('/templates/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM etapas_templates WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// PUT /api/projetos/:id — atualizar projeto (auth)
// ═══════════════════════════════════════════════════
router.put('/:id', requireAuth, (req, res) => {
    const { nome, descricao, status, data_inicio, data_vencimento } = req.body;
    const projId = parseInt(req.params.id);

    // Buscar status anterior para detectar mudança
    const anterior = db.prepare('SELECT status, nome FROM projetos WHERE id = ?').get(projId);

    db.prepare(`
        UPDATE projetos
        SET nome=?, descricao=?, status=?, data_inicio=?, data_vencimento=?, atualizado_em=CURRENT_TIMESTAMP
        WHERE id=?
    `).run(nome, descricao || '', status, data_inicio || null, data_vencimento || null, projId);

    try {
        const label = nome || anterior?.nome || `#${projId}`;
        if (status && anterior && status !== anterior.status) {
            logActivity(req.user.id, req.user.nome, 'atualizar_status',
                `Alterou status do projeto "${label}" de ${anterior.status} para ${status}`,
                projId, 'projeto', { status_anterior: anterior.status, status_novo: status });
            if (status === 'concluido' || status === 'atrasado') {
                createNotification('projeto_status',
                    `Projeto ${status === 'concluido' ? 'concluído' : 'atrasado'}: ${label}`,
                    `Status alterado por ${req.user.nome}`,
                    projId, 'projeto', '', req.user.id);
            }
        } else {
            logActivity(req.user.id, req.user.nome, 'editar', `Editou projeto "${label}"`, projId, 'projeto');
        }
    } catch (_) { /* log não bloqueia */ }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// DELETE /api/projetos/:id — excluir projeto (auth)
// ═══════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    try {
        const deleteProjeto = db.transaction(() => {
            db.prepare('DELETE FROM portal_mensagens WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM despesas_projeto WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM contas_receber WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM contas_pagar WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM movimentacoes_estoque WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM montador_fotos WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM montador_tokens WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM apontamentos_horas WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM etapas_projeto WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM ocorrencias_projeto WHERE projeto_id = ?').run(id);
            db.prepare('DELETE FROM projetos WHERE id = ?').run(id);
        });
        deleteProjeto();
        res.json({ ok: true });
    } catch (err) {
        console.error('Erro ao excluir projeto:', err);
        res.status(500).json({ error: 'Erro ao excluir projeto' });
    }
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
// Helper: auto-atualizar status do projeto baseado nas etapas
// ═══════════════════════════════════════════════════
function autoUpdateProjectStatus(projetoId, userId, userName) {
    try {
        const projeto = db.prepare('SELECT id, nome, status FROM projetos WHERE id = ?').get(projetoId);
        if (!projeto) return projeto?.status;

        // Só age sobre nao_iniciado e em_andamento (respeita suspenso/atrasado como manuais)
        const autoStatuses = ['nao_iniciado', 'em_andamento'];
        if (!autoStatuses.includes(projeto.status)) return projeto.status;

        const etapas = db.prepare('SELECT status FROM etapas_projeto WHERE projeto_id = ?').all(projetoId);
        if (etapas.length === 0) return projeto.status;

        const allDone = etapas.every(e => e.status === 'concluida');
        const anyStarted = etapas.some(e => e.status === 'em_andamento' || e.status === 'concluida');

        let newStatus = null;
        if (allDone && projeto.status !== 'concluido') {
            newStatus = 'concluido';
        } else if (anyStarted && projeto.status === 'nao_iniciado') {
            newStatus = 'em_andamento';
        } else if (!anyStarted && !allDone && projeto.status === 'em_andamento') {
            const anyActive = etapas.some(e => e.status !== 'nao_iniciado' && e.status !== 'pendente');
            if (!anyActive) newStatus = 'nao_iniciado';
        }

        if (newStatus) {
            db.prepare('UPDATE projetos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, projetoId);
            try {
                logActivity(userId, userName, 'atualizar_status',
                    `Status do projeto "${projeto.nome}" alterado automaticamente para ${newStatus}`,
                    projetoId, 'projeto', { status_anterior: projeto.status, status_novo: newStatus, auto: true });
                if (newStatus === 'concluido') {
                    createNotification('projeto_status',
                        `Projeto concluído: ${projeto.nome}`,
                        'Todas as etapas foram concluídas',
                        projetoId, 'projeto', '', userId);
                }
            } catch (_) { /* log não bloqueia */ }
            return newStatus;
        }
        return projeto.status;
    } catch (err) {
        console.error('autoUpdateProjectStatus error:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════
// PUT /api/projetos/etapas/:etapa_id — atualizar etapa
// ═══════════════════════════════════════════════════
router.put('/etapas/:etapa_id', requireAuth, (req, res) => {
    const { nome, descricao, status, data_inicio, data_vencimento, ordem, responsavel_id, progresso, dependencia_id } = req.body;
    const etapaId = parseInt(req.params.etapa_id);

    // Buscar projeto_id antes de atualizar
    const etapaRow = db.prepare('SELECT projeto_id FROM etapas_projeto WHERE id = ?').get(etapaId);

    db.prepare(`
        UPDATE etapas_projeto
        SET nome=?, descricao=?, status=?, data_inicio=?, data_vencimento=?, ordem=?, responsavel_id=?, progresso=?, dependencia_id=?
        WHERE id=?
    `).run(
        nome, descricao || '', status,
        data_inicio || null, data_vencimento || null,
        ordem ?? 0, responsavel_id || null,
        progresso ?? 0, dependencia_id || null,
        etapaId
    );

    // Auto-atualizar status do projeto
    if (etapaRow) {
        autoUpdateProjectStatus(etapaRow.projeto_id, req.user.id, req.user.nome);
    }

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
