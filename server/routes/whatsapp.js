import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import evolution from '../services/evolution.js';
import ai from '../services/ai.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/status — status da conexão Evolution
// ═══════════════════════════════════════════════════════
router.get('/status', requireAuth, async (req, res) => {
    try {
        const status = await evolution.getConnectionStatus();
        res.json(status);
    } catch (e) {
        res.json({ connected: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/qrcode — QR code para pareamento
// ═══════════════════════════════════════════════════════
router.get('/qrcode', requireAuth, async (req, res) => {
    try {
        const data = await evolution.getQRCode();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/nao-lidas — total de mensagens não lidas
// ═══════════════════════════════════════════════════════
router.get('/nao-lidas', requireAuth, (req, res) => {
    const result = db.prepare('SELECT COALESCE(SUM(nao_lidas), 0) as total FROM chat_conversas').get();
    res.json({ total: result.total });
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/conversas — listar conversas
// ═══════════════════════════════════════════════════════
router.get('/conversas', requireAuth, (req, res) => {
    const conversas = db.prepare(`
        SELECT cc.*, c.nome as cliente_nome, c.tel as cliente_tel,
               (SELECT conteudo FROM chat_mensagens WHERE conversa_id = cc.id ORDER BY criado_em DESC LIMIT 1) as ultima_msg,
               (SELECT remetente FROM chat_mensagens WHERE conversa_id = cc.id ORDER BY criado_em DESC LIMIT 1) as ultima_msg_remetente,
               (SELECT criado_em FROM chat_mensagens WHERE conversa_id = cc.id ORDER BY criado_em DESC LIMIT 1) as ultima_msg_em
        FROM chat_conversas cc
        LEFT JOIN clientes c ON cc.cliente_id = c.id
        ORDER BY cc.ultimo_msg_em DESC
    `).all();
    res.json(conversas);
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/conversas/:id/mensagens — mensagens de uma conversa
// ═══════════════════════════════════════════════════════
router.get('/conversas/:id/mensagens', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    // Marcar como lida
    db.prepare('UPDATE chat_conversas SET nao_lidas = 0 WHERE id = ?').run(id);

    const mensagens = db.prepare(`
        SELECT cm.*, u.nome as usuario_nome
        FROM chat_mensagens cm
        LEFT JOIN users u ON cm.remetente_id = u.id
        WHERE cm.conversa_id = ?
        ORDER BY cm.criado_em ASC
    `).all(id);
    res.json(mensagens);
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/enviar — enviar mensagem ao cliente
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/enviar', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { conteudo, tipo } = req.body;
    if (!conteudo) return res.status(400).json({ error: 'Conteúdo obrigatório' });

    const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(id);
    if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

    try {
        // Enviar via Evolution API
        const result = await evolution.sendText(conversa.wa_phone, conteudo);
        const waMessageId = result?.key?.id || '';

        // Armazenar mensagem
        const r = db.prepare(`
            INSERT INTO chat_mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, remetente, remetente_id, criado_em)
            VALUES (?, ?, 'saida', ?, ?, 'usuario', ?, CURRENT_TIMESTAMP)
        `).run(id, waMessageId, tipo || 'texto', conteudo, req.user.id);

        // Atualizar timestamp da conversa
        db.prepare('UPDATE chat_conversas SET ultimo_msg_em = CURRENT_TIMESTAMP WHERE id = ?').run(id);

        const msg = db.prepare('SELECT cm.*, u.nome as usuario_nome FROM chat_mensagens cm LEFT JOIN users u ON cm.remetente_id = u.id WHERE cm.id = ?').get(r.lastInsertRowid);
        res.json(msg);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/nota-interna — nota interna
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/nota-interna', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { conteudo } = req.body;
    if (!conteudo) return res.status(400).json({ error: 'Conteúdo obrigatório' });

    const r = db.prepare(`
        INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, remetente_id, interno, criado_em)
        VALUES (?, 'saida', 'texto', ?, 'usuario', ?, 1, CURRENT_TIMESTAMP)
    `).run(id, conteudo, req.user.id);

    const msg = db.prepare('SELECT cm.*, u.nome as usuario_nome FROM chat_mensagens cm LEFT JOIN users u ON cm.remetente_id = u.id WHERE cm.id = ?').get(r.lastInsertRowid);
    res.json(msg);
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/status — alterar status
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/status', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!['ia', 'humano', 'fechado'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
    }
    db.prepare('UPDATE chat_conversas SET status = ? WHERE id = ?').run(status, id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/vincular — vincular a cliente
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/vincular', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { cliente_id } = req.body;
    db.prepare('UPDATE chat_conversas SET cliente_id = ? WHERE id = ?').run(cliente_id || null, id);
    const conversa = db.prepare(`
        SELECT cc.*, c.nome as cliente_nome
        FROM chat_conversas cc LEFT JOIN clientes c ON cc.cliente_id = c.id
        WHERE cc.id = ?
    `).get(id);
    res.json(conversa);
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/sugerir — IA sugere resposta
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/sugerir', requireAuth, async (req, res) => {
    try {
        const suggestion = await ai.suggestResponse(parseInt(req.params.id));
        res.json({ sugestao: suggestion });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
