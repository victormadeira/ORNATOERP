import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import ai from '../services/ai.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// POST /api/ia/chat — consulta livre ao CRM
// ═══════════════════════════════════════════════════════
router.post('/chat', requireAuth, async (req, res) => {
    const { pergunta } = req.body;
    if (!pergunta) return res.status(400).json({ error: 'Pergunta obrigatória' });
    try {
        const resposta = await ai.queryCRM(pergunta);
        res.json({ resposta });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/ia/followups — listar follow-ups pendentes
// ═══════════════════════════════════════════════════════
router.get('/followups', requireAuth, (req, res) => {
    const followups = db.prepare(`
        SELECT f.*, c.nome as cliente_nome, c.tel as cliente_tel,
               o.numero as orc_numero, o.ambiente as orc_ambiente, o.valor_venda as orc_valor
        FROM ia_followups f
        LEFT JOIN clientes c ON f.cliente_id = c.id
        LEFT JOIN orcamentos o ON f.orc_id = o.id
        WHERE f.status = 'pendente'
        ORDER BY
            CASE f.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
            f.criado_em DESC
    `).all();
    res.json(followups);
});

// ═══════════════════════════════════════════════════════
// POST /api/ia/gerar-followups — gerar sugestões via IA
// ═══════════════════════════════════════════════════════
router.post('/gerar-followups', requireAuth, async (req, res) => {
    try {
        const results = await ai.generateFollowups();
        res.json({ gerados: results.length, followups: results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// PUT /api/ia/followups/:id — marcar como feito/ignorado
// ═══════════════════════════════════════════════════════
router.put('/followups/:id', requireAuth, (req, res) => {
    const { status } = req.body;
    if (!['feito', 'ignorado', 'pendente'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
    }
    db.prepare('UPDATE ia_followups SET status = ? WHERE id = ?').run(status, parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// POST /api/ia/resumo — gerar resumo semanal do CRM
// ═══════════════════════════════════════════════════════
router.post('/resumo', requireAuth, async (req, res) => {
    try {
        const resposta = await ai.queryCRM(
            'Faça um resumo executivo semanal completo: novos clientes, orçamentos criados, movimentações no funil de vendas, projetos em andamento, contas a receber próximas do vencimento, e quaisquer alertas importantes. Use bullet points e seja objetivo.'
        );
        res.json({ resumo: resposta });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// CRUD — Base de Conhecimento (ia_contexto)
// ═══════════════════════════════════════════════════════

// GET /api/ia/contexto
router.get('/contexto', requireAuth, (req, res) => {
    const items = db.prepare('SELECT * FROM ia_contexto ORDER BY criado_em DESC').all();
    res.json(items);
});

// POST /api/ia/contexto
router.post('/contexto', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { tipo, titulo, conteudo } = req.body;
    if (!tipo || !conteudo) return res.status(400).json({ error: 'Tipo e conteúdo obrigatórios' });
    const r = db.prepare('INSERT INTO ia_contexto (tipo, titulo, conteudo) VALUES (?, ?, ?)').run(tipo, titulo || '', conteudo);
    const item = db.prepare('SELECT * FROM ia_contexto WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(item);
});

// PUT /api/ia/contexto/:id
router.put('/contexto/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const id = parseInt(req.params.id);
    const { tipo, titulo, conteudo, ativo } = req.body;
    db.prepare('UPDATE ia_contexto SET tipo=?, titulo=?, conteudo=?, ativo=? WHERE id=?').run(
        tipo, titulo || '', conteudo, ativo ?? 1, id
    );
    res.json(db.prepare('SELECT * FROM ia_contexto WHERE id = ?').get(id));
});

// DELETE /api/ia/contexto/:id
router.delete('/contexto/:id', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    db.prepare('DELETE FROM ia_contexto WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// POST /api/ia/gerar-conteudo — gerar conteúdo de marketing com IA
// ═══════════════════════════════════════════════════════
router.post('/gerar-conteudo', requireAuth, async (req, res) => {
    const { tipo, tema, tom, plataforma } = req.body;
    // tipo: 'post_instagram', 'copy_anuncio', 'descricao_projeto'
    if (!tipo) return res.status(400).json({ error: 'Tipo de conteúdo obrigatório' });

    try {
        const emp = db.prepare('SELECT nome, proposta_sobre FROM empresa_config WHERE id = 1').get();

        // Buscar dados reais para enriquecer
        const projRecentes = db.prepare(`
            SELECT o.cliente_nome, o.ambiente, o.valor_venda
            FROM projetos p JOIN orcamentos o ON o.id = p.orc_id
            WHERE p.status IN ('concluido', 'em_andamento')
            ORDER BY p.atualizado_em DESC LIMIT 5
        `).all();

        const prompts = {
            post_instagram: `Você é o social media de uma marcenaria chamada "${emp?.nome || 'marcenaria'}".
${emp?.proposta_sobre ? `Sobre a empresa: ${emp.proposta_sobre}` : ''}
Projetos recentes: ${projRecentes.map(p => `${p.ambiente} para ${p.cliente_nome}`).join(', ') || 'diversos projetos de móveis planejados'}

Gere um POST para Instagram sobre: ${tema || 'móveis planejados sob medida'}.
Tom: ${tom || 'profissional e inspirador'}

Retorne APENAS:
1. Caption (com emojis e hashtags relevantes, max 300 caracteres)
2. Sugestão de imagem/foto para acompanhar`,

            copy_anuncio: `Você é um copywriter para anúncios de uma marcenaria: "${emp?.nome || 'marcenaria'}".
${emp?.proposta_sobre ? `Sobre: ${emp.proposta_sobre}` : ''}

Gere um texto de anúncio para ${plataforma || 'Meta Ads (Facebook/Instagram)'} sobre: ${tema || 'móveis planejados'}.
Tom: ${tom || 'persuasivo e direto'}

Retorne:
1. Headline (max 40 caracteres)
2. Texto principal (max 125 caracteres)
3. CTA sugerido
4. Público-alvo sugerido`,

            descricao_projeto: `Você é redator de portfólio de uma marcenaria: "${emp?.nome || 'marcenaria'}".

Gere uma descrição elegante para portfólio/site sobre: ${tema || 'projeto de móveis planejados'}.
Tom: ${tom || 'sofisticado e detalhista'}

Retorne:
1. Título atraente (max 60 caracteres)
2. Descrição (2-3 parágrafos curtos, max 300 palavras)
3. Tags/categorias sugeridas`,
        };

        const prompt = prompts[tipo] || prompts.post_instagram;
        const resposta = await ai.queryCRM(prompt);

        res.json({ conteudo: resposta, tipo, tema });

    } catch (e) {
        res.status(500).json({ error: e.message || 'Erro ao gerar conteúdo' });
    }
});

// ═══════════════════════════════════════════════════════
// CRUD — Conteúdo Marketing (calendário)
// ═══════════════════════════════════════════════════════

// GET /api/ia/marketing — listar conteúdos
router.get('/marketing', requireAuth, (req, res) => {
    const { status, plataforma } = req.query;
    let sql = 'SELECT * FROM conteudo_marketing WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (plataforma) { sql += ' AND plataforma = ?'; params.push(plataforma); }
    sql += ' ORDER BY COALESCE(data_publicar, criado_em) DESC';
    res.json(db.prepare(sql).all(...params));
});

// POST /api/ia/marketing — criar conteúdo
router.post('/marketing', requireAuth, (req, res) => {
    const { titulo, tipo, texto, plataforma, status, data_publicar } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título obrigatório' });

    const r = db.prepare(`
        INSERT INTO conteudo_marketing (user_id, titulo, tipo, texto, plataforma, status, data_publicar)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, titulo, tipo || 'post', texto || '', plataforma || 'instagram', status || 'rascunho', data_publicar || null);

    res.json({ id: r.lastInsertRowid });
});

// PUT /api/ia/marketing/:id — atualizar conteúdo
router.put('/marketing/:id', requireAuth, (req, res) => {
    const { titulo, tipo, texto, plataforma, status, data_publicar } = req.body;
    db.prepare(`
        UPDATE conteudo_marketing
        SET titulo=?, tipo=?, texto=?, plataforma=?, status=?, data_publicar=?, atualizado_em=CURRENT_TIMESTAMP
        WHERE id=?
    `).run(titulo, tipo || 'post', texto || '', plataforma || 'instagram', status || 'rascunho', data_publicar || null, parseInt(req.params.id));
    res.json({ ok: true });
});

// DELETE /api/ia/marketing/:id
router.delete('/marketing/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM conteudo_marketing WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

export default router;
