import { Router } from 'express';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import evolution from '../services/evolution.js';
import ai from '../services/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads', 'whatsapp');
mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => cb(null, UPLOADS_DIR),
        filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extname(file.originalname)}`),
    }),
    limits: { fileSize: 64 * 1024 * 1024 }, // 64MB
});

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
        // Enviar via Evolution API — usar wa_jid (remoteJid completo) se disponível
        const dest = conversa.wa_jid || conversa.wa_phone;
        const result = await evolution.sendText(dest, conteudo);
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
// PUT /api/whatsapp/conversas/:id/ia-bloqueio — pausar/retomar IA manualmente
// body: { bloqueada: true|false, minutos?: number, motivo?: string }
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/ia-bloqueio', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { bloqueada, minutos, motivo } = req.body || {};
    if (bloqueada) {
        const min = Number(minutos) > 0 ? Number(minutos) : 60 * 24;
        const ate = new Date(Date.now() + min * 60 * 1000).toISOString();
        db.prepare(
            'UPDATE chat_conversas SET ia_bloqueada = 1, ia_bloqueio_ate = ?, ia_bloqueio_motivo = ? WHERE id = ?'
        ).run(ate, motivo || 'manual', id);
    } else {
        db.prepare(
            "UPDATE chat_conversas SET ia_bloqueada = 0, ia_bloqueio_ate = NULL, ia_bloqueio_motivo = '' WHERE id = ?"
        ).run(id);
    }
    const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(id);
    res.json(conversa);
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/aguardando-cliente
// Pausa escalação Sofia enquanto humano aguarda cliente ativamente
// body: { aguardando: true|false }
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/aguardando-cliente', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { aguardando } = req.body || {};
    const flag = aguardando ? 1 : 0;
    db.prepare('UPDATE chat_conversas SET aguardando_cliente = ? WHERE id = ?').run(flag, id);
    // Ao desligar, reseta escalação para recomeçar contagem
    if (!aguardando) {
        db.prepare('UPDATE chat_conversas SET escalacao_nivel = 0, escalacao_ultima_em = NULL WHERE id = ?').run(id);
    }
    const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(id);
    res.json(conversa);
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/processar-escalacao-manual
// Dispara verificação de escalação numa conversa específica (útil para testes)
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/processar-escalacao-manual', requireAuth, async (req, res) => {
    try {
        const esc = await import('../services/sofia_escalacao.js');
        await esc.processarEscalacoes(req.app.locals.wsBroadcast);
        const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(parseInt(req.params.id));
        res.json({ ok: true, conversa });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
// POST /api/whatsapp/conversas/:id/enviar-midia — enviar imagem/audio/doc
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/enviar-midia', requireAuth, upload.single('file'), async (req, res) => {
    const id = parseInt(req.params.id);
    const caption = req.body.caption || '';
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Arquivo obrigatório' });

    const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(id);
    if (!conversa) return res.status(404).json({ error: 'Conversa não encontrada' });

    const dest = conversa.wa_jid || conversa.wa_phone;
    const mime = file.mimetype || '';
    const mediaUrl = `/uploads/whatsapp/${file.filename}`;

    // Determinar tipo
    let tipo = 'documento';
    let mediatype = 'document';
    if (mime.startsWith('image/')) { tipo = 'imagem'; mediatype = 'image'; }
    else if (mime.startsWith('video/')) { tipo = 'video'; mediatype = 'video'; }
    else if (mime.startsWith('audio/')) { tipo = 'audio'; mediatype = 'audio'; }

    try {
        // Converter para base64 para enviar via Evolution API
        const fileBuffer = readFileSync(file.path);
        const base64 = fileBuffer.toString('base64');
        const dataUri = `data:${mime};base64,${base64}`;

        const cfg = db.prepare('SELECT wa_instance_url, wa_instance_name, wa_api_key FROM empresa_config WHERE id = 1').get();
        const url = `${cfg.wa_instance_url}/message/sendMedia/${cfg.wa_instance_name}`;
        const evoRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': cfg.wa_api_key },
            body: JSON.stringify({
                number: dest,
                mediatype,
                media: dataUri,
                caption: caption || '',
                fileName: file.originalname,
            }),
        });
        if (!evoRes.ok) {
            const err = await evoRes.json().catch(() => ({}));
            throw new Error(err.message || `Evolution API error: ${evoRes.status}`);
        }
        const result = await evoRes.json();
        const waMessageId = result?.key?.id || '';

        // Armazenar mensagem
        const r = db.prepare(`
            INSERT INTO chat_mensagens (conversa_id, wa_message_id, direcao, tipo, conteudo, media_url, remetente, remetente_id, criado_em)
            VALUES (?, ?, 'saida', ?, ?, ?, 'usuario', ?, CURRENT_TIMESTAMP)
        `).run(id, waMessageId, tipo, caption || `[${tipo}]`, mediaUrl, req.user.id);

        db.prepare('UPDATE chat_conversas SET ultimo_msg_em = CURRENT_TIMESTAMP WHERE id = ?').run(id);
        const msg = db.prepare('SELECT cm.*, u.nome as usuario_nome FROM chat_mensagens cm LEFT JOIN users u ON cm.remetente_id = u.id WHERE cm.id = ?').get(r.lastInsertRowid);
        res.json(msg);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
