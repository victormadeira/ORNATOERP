import { Router } from 'express';
import db from '../db.js';
import { requireAuth, canSeeAll } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/clientes — listar todos
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const sql = canSeeAll(req.user)
        ? 'SELECT c.*, u.nome as criado_por FROM clientes c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.nome'
        : 'SELECT c.*, u.nome as criado_por FROM clientes c LEFT JOIN users u ON c.user_id = u.id WHERE c.user_id = ? ORDER BY c.nome';
    const params = canSeeAll(req.user) ? [] : [req.user.id];
    res.json(db.prepare(sql).all(...params));
});

// ═══════════════════════════════════════════════════════
// GET /api/clientes/:id — detalhe com dados CRM
// ═══════════════════════════════════════════════════════
router.get('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const cli = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });

    // Orçamentos do cliente
    const orcamentos = db.prepare(`
        SELECT id, numero, ambiente, valor_venda, kb_col, tipo, criado_em, parent_orc_id
        FROM orcamentos WHERE cliente_id = ? ORDER BY criado_em DESC
    `).all(id);

    // Projetos do cliente
    const projetos = db.prepare(`
        SELECT p.id, p.nome, p.status, p.data_inicio, p.data_vencimento,
               o.valor_venda, o.numero as orc_numero
        FROM projetos p
        LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.cliente_id = ? ORDER BY p.criado_em DESC
    `).all(id);

    // Lifetime value — soma dos orçamentos aprovados/concluídos
    const ltv = db.prepare(`
        SELECT COALESCE(SUM(o.valor_venda), 0) as total_faturado,
               COUNT(DISTINCT o.id) as total_orcamentos,
               COUNT(DISTINCT CASE WHEN o.kb_col IN ('ok','prod','mont') THEN o.id END) as orcamentos_aprovados,
               COUNT(DISTINCT p.id) as total_projetos
        FROM orcamentos o
        LEFT JOIN projetos p ON p.orc_id = o.id
        WHERE o.cliente_id = ? AND o.tipo != 'aditivo'
    `).get(id);

    // Recebido (contas pagas)
    const recebido = db.prepare(`
        SELECT COALESCE(SUM(cr.valor), 0) as total_recebido
        FROM contas_receber cr
        JOIN projetos p ON cr.projeto_id = p.id
        WHERE p.cliente_id = ? AND cr.status = 'pago'
    `).get(id);

    // Notas do cliente
    const notas = db.prepare(`
        SELECT n.*, u.nome as autor_nome
        FROM cliente_notas n
        LEFT JOIN users u ON n.user_id = u.id
        WHERE n.cliente_id = ? ORDER BY n.fixado DESC, n.criado_em DESC
    `).all(id);

    // WhatsApp conversations
    const conversas_wa = db.prepare(`
        SELECT id, wa_phone, wa_name, status, nao_lidas, ultimo_msg_em
        FROM chat_conversas WHERE cliente_id = ? ORDER BY ultimo_msg_em DESC LIMIT 5
    `).all(id);

    // Follow-ups pendentes
    const followups = db.prepare(`
        SELECT f.*, o.numero as orc_numero
        FROM ia_followups f
        LEFT JOIN orcamentos o ON f.orc_id = o.id
        WHERE f.cliente_id = ? ORDER BY f.criado_em DESC LIMIT 10
    `).all(id);

    res.json({
        ...cli,
        orcamentos,
        projetos,
        notas,
        conversas_wa,
        followups,
        metricas: {
            total_faturado: ltv.total_faturado,
            total_recebido: recebido.total_recebido,
            total_orcamentos: ltv.total_orcamentos,
            orcamentos_aprovados: ltv.orcamentos_aprovados,
            total_projetos: ltv.total_projetos,
            taxa_conversao: ltv.total_orcamentos > 0
                ? Math.round((ltv.orcamentos_aprovados / ltv.total_orcamentos) * 100)
                : 0,
        },
    });
});

// ═══════════════════════════════════════════════════════
// GET /api/clientes/:id/timeline — timeline CRM completa
// ═══════════════════════════════════════════════════════
router.get('/:id/timeline', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const events = [];

    // Orçamentos
    db.prepare(`
        SELECT id, numero, ambiente, valor_venda, kb_col, tipo, criado_em
        FROM orcamentos WHERE cliente_id = ? AND tipo != 'aditivo'
    `).all(id).forEach(o => {
        events.push({
            tipo: 'orcamento',
            data: o.criado_em,
            titulo: `Orçamento ${o.numero || '#' + o.id}`,
            descricao: `${o.ambiente || 'Sem ambiente'} · ${o.kb_col || 'lead'}`,
            valor: o.valor_venda,
            ref_id: o.id,
        });
    });

    // Projetos
    db.prepare(`
        SELECT p.id, p.nome, p.status, p.criado_em, o.numero as orc_numero
        FROM projetos p LEFT JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.cliente_id = ?
    `).all(id).forEach(p => {
        events.push({
            tipo: 'projeto',
            data: p.criado_em,
            titulo: `Projeto: ${p.nome}`,
            descricao: `Status: ${p.status} · Orc: ${p.orc_numero || '—'}`,
            ref_id: p.id,
        });
    });

    // Notas manuais
    db.prepare(`
        SELECT n.*, u.nome as autor_nome
        FROM cliente_notas n LEFT JOIN users u ON n.user_id = u.id
        WHERE n.cliente_id = ?
    `).all(id).forEach(n => {
        events.push({
            tipo: 'nota',
            data: n.criado_em,
            titulo: n.titulo || 'Nota',
            descricao: n.conteudo,
            autor: n.autor_nome,
            ref_id: n.id,
        });
    });

    // Interações registradas
    db.prepare(`
        SELECT i.*, u.nome as autor_nome
        FROM cliente_interacoes i LEFT JOIN users u ON i.user_id = u.id
        WHERE i.cliente_id = ?
    `).all(id).forEach(i => {
        events.push({
            tipo: i.tipo,
            data: i.data || i.criado_em,
            titulo: i.descricao,
            descricao: '',
            autor: i.autor_nome,
            ref_id: i.id,
        });
    });

    // Mensagens WhatsApp (últimas 20)
    db.prepare(`
        SELECT m.conteudo, m.direcao, m.tipo as msg_tipo, m.criado_em, c.wa_name
        FROM chat_mensagens m
        JOIN chat_conversas c ON m.conversa_id = c.id
        WHERE c.cliente_id = ?
        ORDER BY m.criado_em DESC LIMIT 20
    `).all(id).forEach(m => {
        events.push({
            tipo: 'whatsapp',
            data: m.criado_em,
            titulo: m.direcao === 'entrada' ? `${m.wa_name || 'Cliente'} enviou` : 'Você enviou',
            descricao: m.msg_tipo === 'texto' ? (m.conteudo || '').substring(0, 100) : `[${m.msg_tipo}]`,
            ref_id: null,
        });
    });

    // Follow-ups
    db.prepare(`
        SELECT f.tipo, f.mensagem, f.status, f.prioridade, f.criado_em
        FROM ia_followups f WHERE f.cliente_id = ?
    `).all(id).forEach(f => {
        events.push({
            tipo: 'followup',
            data: f.criado_em,
            titulo: `Follow-up: ${f.tipo}`,
            descricao: (f.mensagem || '').substring(0, 100),
            status: f.status,
        });
    });

    // Ordenar por data desc
    events.sort((a, b) => new Date(b.data) - new Date(a.data));
    res.json(events);
});

// ═══════════════════════════════════════════════════════
// POST /api/clientes
// ═══════════════════════════════════════════════════════
router.post('/', requireAuth, (req, res) => {
    const {
        nome, tel, email, arq, cidade,
        tipo_pessoa, cpf, cnpj, cep, endereco,
        numero, complemento, bairro, estado, obs,
        origem, indicado_por, data_nascimento
    } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const result = db.prepare(`
        INSERT INTO clientes
          (user_id, nome, tel, email, arq, cidade,
           tipo_pessoa, cpf, cnpj, cep, endereco,
           numero, complemento, bairro, estado, obs,
           origem, indicado_por, data_nascimento)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
        req.user.id, nome, tel || '', email || '', arq || '', cidade || '',
        tipo_pessoa || 'fisica', cpf || '', cnpj || '', cep || '', endereco || '',
        numero || '', complemento || '', bairro || '', estado || '', obs || '',
        origem || 'manual', indicado_por || '', data_nascimento || null
    );

    const cli = db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(cli);
});

// ═══════════════════════════════════════════════════════
// PUT /api/clientes/:id
// ═══════════════════════════════════════════════════════
router.put('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

    if (!canSeeAll(req.user) && existing.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    const {
        nome, tel, email, arq, cidade,
        tipo_pessoa, cpf, cnpj, cep, endereco,
        numero, complemento, bairro, estado, obs,
        origem, indicado_por, data_nascimento
    } = req.body;

    db.prepare(`
        UPDATE clientes SET
          nome=?, tel=?, email=?, arq=?, cidade=?,
          tipo_pessoa=?, cpf=?, cnpj=?, cep=?, endereco=?,
          numero=?, complemento=?, bairro=?, estado=?, obs=?,
          origem=?, indicado_por=?, data_nascimento=?
        WHERE id=?
    `).run(
        nome ?? existing.nome,
        tel ?? existing.tel,
        email ?? existing.email,
        arq ?? existing.arq,
        cidade ?? existing.cidade,
        tipo_pessoa ?? existing.tipo_pessoa,
        cpf ?? existing.cpf,
        cnpj ?? existing.cnpj,
        cep ?? existing.cep,
        endereco ?? existing.endereco,
        numero ?? existing.numero,
        complemento ?? existing.complemento,
        bairro ?? existing.bairro,
        estado ?? existing.estado,
        obs ?? existing.obs,
        origem ?? existing.origem ?? 'manual',
        indicado_por ?? existing.indicado_por ?? '',
        data_nascimento ?? existing.data_nascimento ?? null,
        id
    );

    res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(id));
});

// ═══════════════════════════════════════════════════════
// DELETE /api/clientes/:id
// ═══════════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

    if (!canSeeAll(req.user) && existing.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// NOTAS DO CLIENTE
// ═══════════════════════════════════════════════════════

// GET /api/clientes/:id/notas
router.get('/:id/notas', requireAuth, (req, res) => {
    const notas = db.prepare(`
        SELECT n.*, u.nome as autor_nome
        FROM cliente_notas n LEFT JOIN users u ON n.user_id = u.id
        WHERE n.cliente_id = ? ORDER BY n.fixado DESC, n.criado_em DESC
    `).all(parseInt(req.params.id));
    res.json(notas);
});

// POST /api/clientes/:id/notas
router.post('/:id/notas', requireAuth, (req, res) => {
    const { titulo, conteudo, cor } = req.body;
    if (!conteudo) return res.status(400).json({ error: 'Conteúdo obrigatório' });
    const r = db.prepare(`
        INSERT INTO cliente_notas (cliente_id, user_id, titulo, conteudo, cor)
        VALUES (?, ?, ?, ?, ?)
    `).run(parseInt(req.params.id), req.user.id, titulo || '', conteudo, cor || '#3b82f6');
    const nota = db.prepare('SELECT n.*, u.nome as autor_nome FROM cliente_notas n LEFT JOIN users u ON n.user_id = u.id WHERE n.id = ?').get(r.lastInsertRowid);
    res.status(201).json(nota);
});

// PUT /api/clientes/:id/notas/:notaId
router.put('/:id/notas/:notaId', requireAuth, (req, res) => {
    const { titulo, conteudo, cor, fixado } = req.body;
    db.prepare(`
        UPDATE cliente_notas SET titulo=?, conteudo=?, cor=?, fixado=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?
    `).run(titulo || '', conteudo || '', cor || '#3b82f6', fixado ?? 0, parseInt(req.params.notaId));
    res.json({ ok: true });
});

// DELETE /api/clientes/:id/notas/:notaId
router.delete('/:id/notas/:notaId', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cliente_notas WHERE id = ?').run(parseInt(req.params.notaId));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// INTERAÇÕES DO CLIENTE
// ═══════════════════════════════════════════════════════

// POST /api/clientes/:id/interacoes
router.post('/:id/interacoes', requireAuth, (req, res) => {
    const { tipo, descricao, data } = req.body;
    if (!descricao) return res.status(400).json({ error: 'Descrição obrigatória' });
    const r = db.prepare(`
        INSERT INTO cliente_interacoes (cliente_id, user_id, tipo, descricao, data)
        VALUES (?, ?, ?, ?, ?)
    `).run(parseInt(req.params.id), req.user.id, tipo || 'nota', descricao, data || new Date().toISOString());
    res.status(201).json({ id: r.lastInsertRowid });
});

export default router;
