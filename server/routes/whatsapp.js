import { Router } from 'express';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import db from '../db.js';
import { requireAuth, requireConversaAccess, canSeeAll, isGerente } from '../auth.js';
import evolution from '../services/evolution.js';
import ai from '../services/ai.js';
import { backfillFromEvolution, backfillOneChat } from '../services/whatsapp_backfill.js';

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
// GET /api/whatsapp/diagnostico — check-list consolidado de Sofia
// Responde em <500ms com todas as camadas que precisam estar OK
// para a IA capturar leads e responder mensagens.
// ═══════════════════════════════════════════════════════
router.get('/diagnostico', requireAuth, async (req, res) => {
    const emp = db.prepare(
        'SELECT ia_ativa, ia_api_key, ia_model, wa_instance_url, wa_instance_name, wa_api_key, escalacao_ativa, ia_sugestoes_ativa FROM empresa_config WHERE id = 1'
    ).get() || {};

    // 1) IA globalmente ativa?
    const ia_ativa = emp.ia_ativa === 1;
    const ia_api_configurada = !!emp.ia_api_key;

    // 2) WhatsApp (Evolution) configurado e conectado?
    const wa_configurado = !!(emp.wa_instance_url && emp.wa_instance_name && emp.wa_api_key);
    let evolution_state = 'nao_configurado';
    let evolution_connected = false;
    if (wa_configurado) {
        try {
            const st = await evolution.getConnectionStatus();
            evolution_connected = !!st.connected;
            evolution_state = st.state || (st.connected ? 'open' : (st.reason || 'desconhecido'));
        } catch (e) {
            evolution_state = 'erro';
        }
    }

    // 3) Conversas com IA pausada (anti-abuso)
    const conversas_bloqueadas = db.prepare(
        "SELECT COUNT(*) as n FROM chat_conversas WHERE ia_bloqueada = 1 AND (ia_bloqueio_ate IS NULL OR ia_bloqueio_ate > datetime('now'))"
    ).get()?.n || 0;

    // 4) Última interação real da IA
    const ultima_resposta = db.prepare(
        "SELECT MAX(criado_em) as t FROM chat_mensagens WHERE remetente = 'ia'"
    ).get()?.t || null;

    // 5) Leads capturados nas últimas 24h (indicador de funcionamento real)
    const leads_24h = db.prepare(
        "SELECT COUNT(*) as n FROM leads WHERE criado_em >= datetime('now', '-1 day')"
    ).get()?.n || 0;

    // 6) Status consolidado
    const camadas_ok = ia_ativa && ia_api_configurada && evolution_connected;
    let status_geral = 'offline';
    if (camadas_ok) status_geral = 'online';
    else if (ia_ativa && wa_configurado) status_geral = 'parcial';

    const problemas = [];
    if (!ia_ativa) problemas.push('IA está DESATIVADA no sistema');
    if (!ia_api_configurada) problemas.push('API key da IA (Claude) não configurada');
    if (!wa_configurado) problemas.push('WhatsApp (Evolution) não configurado');
    else if (!evolution_connected) problemas.push(`WhatsApp desconectado (estado: ${evolution_state})`);

    res.json({
        status_geral,          // 'online' | 'parcial' | 'offline'
        ia_ativa,
        ia_api_configurada,
        wa_configurado,
        evolution_connected,
        evolution_state,       // 'open' | 'close' | 'connecting' | 'nao_configurado' | ...
        escalacao_ativa: emp.escalacao_ativa !== 0,
        sugestoes_ativa: emp.ia_sugestoes_ativa !== 0,  // botão Sugerir em Mensagens
        conversas_bloqueadas,  // quantas conversas com IA pausada
        ultima_resposta_ia_em: ultima_resposta,  // ISO string ou null
        leads_24h,
        problemas,             // lista human-readable
    });
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/ia/toggle — kill-switch rápido
// body: { ativa: true|false }  (se omitido, inverte o estado atual)
// Requer gerente/admin.
// ═══════════════════════════════════════════════════════
router.post('/ia/toggle', requireAuth, (req, res) => {
    if (!isGerente(req.user)) {
        return res.status(403).json({ error: 'Apenas gerente/admin pode desligar a IA' });
    }
    const atual = db.prepare('SELECT ia_ativa FROM empresa_config WHERE id = 1').get()?.ia_ativa === 1;
    const nova = req.body?.ativa === undefined ? !atual : !!req.body.ativa;
    db.prepare('UPDATE empresa_config SET ia_ativa = ? WHERE id = 1').run(nova ? 1 : 0);
    res.json({ ok: true, ia_ativa: nova });
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
// GET /api/whatsapp/nao-lidas — total de mensagens não lidas (só das minhas)
// ═══════════════════════════════════════════════════════
router.get('/nao-lidas', requireAuth, (req, res) => {
    const u = req.user;
    let total;
    if (canSeeAll(u)) {
        total = db.prepare('SELECT COALESCE(SUM(nao_lidas), 0) as total FROM chat_conversas WHERE arquivada = 0').get().total;
    } else {
        total = db.prepare(
            'SELECT COALESCE(SUM(nao_lidas), 0) as total FROM chat_conversas WHERE arquivada = 0 AND (atribuido_user_id = ? OR atribuido_user_id IS NULL)'
        ).get(u.id).total;
    }
    res.json({ total });
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/conversas — listar conversas
// Query: ?filtro=minhas|nao_atribuidas|todas|arquivadas&categoria=&q=
// Regra de permissão:
//   - admin/gerente veem tudo
//   - vendedor vê apenas: atribuídas a ele + não atribuídas (fila pública)
// ═══════════════════════════════════════════════════════
router.get('/conversas', requireAuth, (req, res) => {
    const u = req.user;
    const { filtro = 'todas', categoria = '', q = '', limit: limitParam = '100', offset: offsetParam = '0' } = req.query;
    const pageLimit = Math.min(Math.max(1, parseInt(limitParam) || 100), 200); // máx 200 por página
    const pageOffset = Math.max(0, parseInt(offsetParam) || 0);

    const where = [];
    const params = [];

    // Permissão — vendedor só vê dele ou não-atribuídas
    if (!canSeeAll(u)) {
        where.push('(cc.atribuido_user_id = ? OR cc.atribuido_user_id IS NULL)');
        params.push(u.id);
    }

    // Filtro UI
    if (filtro === 'minhas') {
        where.push('cc.atribuido_user_id = ?');
        params.push(u.id);
    } else if (filtro === 'nao_atribuidas') {
        where.push('cc.atribuido_user_id IS NULL');
    } else if (filtro === 'arquivadas') {
        where.push('cc.arquivada = 1');
    } else {
        where.push('cc.arquivada = 0');
    }

    if (categoria) {
        where.push('cc.categoria = ?');
        params.push(categoria);
    }

    if (q) {
        where.push('(COALESCE(c.nome,\'\') LIKE ? OR cc.wa_name LIKE ? OR cc.wa_phone LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like);
    }

    const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const conversas = db.prepare(`
        SELECT cc.*, c.nome as cliente_nome, c.tel as cliente_tel,
               ua.nome as atribuido_nome, ua.role as atribuido_role,
               (SELECT conteudo FROM chat_mensagens WHERE conversa_id = cc.id ORDER BY criado_em DESC LIMIT 1) as ultima_msg,
               (SELECT remetente FROM chat_mensagens WHERE conversa_id = cc.id ORDER BY criado_em DESC LIMIT 1) as ultima_msg_remetente,
               (SELECT criado_em FROM chat_mensagens WHERE conversa_id = cc.id ORDER BY criado_em DESC LIMIT 1) as ultima_msg_em
        FROM chat_conversas cc
        LEFT JOIN clientes c ON cc.cliente_id = c.id
        LEFT JOIN users ua ON cc.atribuido_user_id = ua.id
        ${whereSQL}
        ORDER BY cc.ultimo_msg_em DESC
        LIMIT ? OFFSET ?
    `).all(...params, pageLimit, pageOffset);

    // Total para paginação no frontend
    const totalRow = db.prepare(
        `SELECT COUNT(*) as total FROM chat_conversas cc ${whereSQL}`
    ).get(...params);

    res.json({ conversas, total: totalRow.total, limit: pageLimit, offset: pageOffset });
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/conversas/contadores — contadores por aba
// Retorna { minhas, nao_atribuidas, todas, arquivadas }
// ═══════════════════════════════════════════════════════
router.get('/conversas/contadores', requireAuth, (req, res) => {
    const u = req.user;
    const userId = Number(u.id);
    // Parametrizado — sem interpolação de u.id em template string
    const verTudo = canSeeAll(u);
    const base = verTudo ? '1=1' : '(atribuido_user_id = ? OR atribuido_user_id IS NULL)';
    const baseParams = verTudo ? [] : [userId];

    const count = (extra, extraParams = []) =>
        db.prepare(`SELECT COUNT(*) as c FROM chat_conversas WHERE ${base} AND ${extra}`)
          .get(...baseParams, ...extraParams).c;

    res.json({
        minhas:           count('arquivada = 0 AND atribuido_user_id = ?', [userId]),
        nao_atribuidas:   count('arquivada = 0 AND atribuido_user_id IS NULL'),
        todas:            count('arquivada = 0'),
        arquivadas:       count('arquivada = 1'),
    });
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/conversas/:id/mensagens — mensagens de uma conversa
// ═══════════════════════════════════════════════════════
router.get('/conversas/:id/mensagens', requireAuth, requireConversaAccess(db), (req, res) => {
    const id = req.conversa.id;
    // Paginação: ?before=ID retorna mensagens anteriores ao ID dado
    const { before, limit = 200 } = req.query;
    const lim = Math.min(parseInt(limit) || 200, 1000);

    // Marcar como lida
    db.prepare('UPDATE chat_conversas SET nao_lidas = 0 WHERE id = ?').run(id);
    db.prepare(
        'INSERT INTO chat_leituras (user_id, conversa_id, ultima_leitura_em) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, conversa_id) DO UPDATE SET ultima_leitura_em = CURRENT_TIMESTAMP'
    ).run(req.user.id, id);

    let mensagens;
    if (before) {
        mensagens = db.prepare(`
            SELECT cm.*, u.nome as usuario_nome
            FROM chat_mensagens cm
            LEFT JOIN users u ON cm.remetente_id = u.id
            WHERE cm.conversa_id = ? AND cm.id < ?
            ORDER BY cm.criado_em DESC LIMIT ?
        `).all(id, parseInt(before), lim).reverse();
    } else {
        // Últimas N ordenadas cronologicamente
        mensagens = db.prepare(`
            SELECT * FROM (
                SELECT cm.*, u.nome as usuario_nome
                FROM chat_mensagens cm
                LEFT JOIN users u ON cm.remetente_id = u.id
                WHERE cm.conversa_id = ?
                ORDER BY cm.criado_em DESC
                LIMIT ?
            ) ORDER BY criado_em ASC
        `).all(id, lim);
    }
    res.json(mensagens);
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/enviar — enviar mensagem ao cliente
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/enviar', requireAuth, requireConversaAccess(db), async (req, res) => {
    const id = req.conversa.id;
    const { tipo } = req.body;
    // Remove blocos <dossie>...</dossie> que porventura existam (dados internos da IA não devem vazar)
    const conteudo = (req.body.conteudo || '').replace(/<dossie>[\s\S]*?<\/dossie>/gi, '').trim();
    if (!conteudo) return res.status(400).json({ error: 'Conteúdo obrigatório' });

    const conversa = req.conversa;

    // Auto-atribuir a si mesmo ao enviar 1ª mensagem (se ainda não atribuída)
    if (!conversa.atribuido_user_id) {
        db.prepare(
            'UPDATE chat_conversas SET atribuido_user_id = ?, atribuido_em = CURRENT_TIMESTAMP, atribuido_por_id = ? WHERE id = ?'
        ).run(req.user.id, req.user.id, id);
        db.prepare(
            'INSERT INTO chat_conversa_atribuicoes (conversa_id, de_user_id, para_user_id, por_user_id, motivo) VALUES (?, NULL, ?, ?, ?)'
        ).run(id, req.user.id, req.user.id, 'auto-atribuição ao responder');
    }

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
        try {
            req.app.locals.wsBroadcast?.('chat.message', {
                conversa_id: id,
                mensagem_id: r.lastInsertRowid,
                direcao: 'saida',
                tipo: tipo || 'texto',
                remetente: 'usuario',
            });
            req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: id });
        } catch (_) { /* silencioso */ }
        res.json(msg);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/nota-interna — nota interna
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/nota-interna', requireAuth, requireConversaAccess(db), (req, res) => {
    const id = req.conversa.id;
    const { conteudo } = req.body;
    if (!conteudo) return res.status(400).json({ error: 'Conteúdo obrigatório' });

    const r = db.prepare(`
        INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, remetente_id, interno, criado_em)
        VALUES (?, 'saida', 'texto', ?, 'usuario', ?, 1, CURRENT_TIMESTAMP)
    `).run(id, conteudo, req.user.id);

    const msg = db.prepare('SELECT cm.*, u.nome as usuario_nome FROM chat_mensagens cm LEFT JOIN users u ON cm.remetente_id = u.id WHERE cm.id = ?').get(r.lastInsertRowid);
    try {
        req.app.locals.wsBroadcast?.('chat.message', {
            conversa_id: id,
            mensagem_id: r.lastInsertRowid,
            direcao: 'saida',
            tipo: 'texto',
            remetente: 'usuario',
            interno: 1,
        });
    } catch (_) { /* silencioso */ }
    res.json(msg);
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/status — alterar status
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/status', requireAuth, requireConversaAccess(db), (req, res) => {
    const id = req.conversa.id;
    const { status } = req.body;
    if (!['ia', 'humano', 'fechado'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
    }
    db.prepare('UPDATE chat_conversas SET status = ? WHERE id = ?').run(status, id);
    try { req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: id, status }); } catch (_) { /* silencioso */ }
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/atribuir — atribuir conversa a um atendente
// body: { user_id: number|null, motivo?: string }
// Regras:
//   - Qualquer usuário autenticado pode PUXAR pra si (user_id = eu) se não-atribuída
//   - Qualquer usuário pode LARGAR (user_id = null) uma conversa DELE
//   - Só gerente/admin pode atribuir pra outra pessoa OU remover atribuição de outro
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/atribuir', requireAuth, requireConversaAccess(db), (req, res) => {
    const id = req.conversa.id;
    const { user_id, motivo } = req.body || {};
    const me = req.user;
    const conversa = req.conversa;
    const target = user_id === null || user_id === undefined ? null : parseInt(user_id);

    // Regras de permissão
    const isGer = isGerente(me);
    const ehMinha = Number(conversa.atribuido_user_id) === Number(me.id);
    const puxandoPraMim = target === Number(me.id);
    const largando = target === null;

    if (!isGer) {
        if (puxandoPraMim) {
            // só pode puxar se estiver não-atribuída
            if (conversa.atribuido_user_id && !ehMinha) {
                return res.status(403).json({ error: 'Conversa já atribuída a outro atendente. Peça ao gerente pra transferir.' });
            }
        } else if (largando) {
            if (!ehMinha) return res.status(403).json({ error: 'Você só pode largar conversas atribuídas a você.' });
        } else {
            return res.status(403).json({ error: 'Apenas gerentes podem atribuir conversas a outros atendentes.' });
        }
    }

    // Validar usuário-alvo existe e está ativo
    if (target !== null) {
        const u = db.prepare('SELECT id, nome, role, ativo FROM users WHERE id = ?').get(target);
        if (!u) return res.status(400).json({ error: 'Usuário não encontrado' });
        if (!u.ativo) return res.status(400).json({ error: 'Usuário inativo' });
    }

    db.prepare(`
        UPDATE chat_conversas
           SET atribuido_user_id = ?,
               atribuido_em = CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
               atribuido_por_id = ?
         WHERE id = ?
    `).run(target, target, me.id, id);

    db.prepare(
        'INSERT INTO chat_conversa_atribuicoes (conversa_id, de_user_id, para_user_id, por_user_id, motivo) VALUES (?, ?, ?, ?, ?)'
    ).run(id, conversa.atribuido_user_id, target, me.id, motivo || '');

    const updated = db.prepare(`
        SELECT cc.*, c.nome as cliente_nome, ua.nome as atribuido_nome, ua.role as atribuido_role
        FROM chat_conversas cc
        LEFT JOIN clientes c ON cc.cliente_id = c.id
        LEFT JOIN users ua ON cc.atribuido_user_id = ua.id
        WHERE cc.id = ?
    `).get(id);
    try { req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: id, atribuido_user_id: target }); } catch (_) { /* silencioso */ }
    res.json(updated);
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/categoria — definir categoria e prioridade
// body: { categoria?: string, prioridade?: string, tags?: string[] }
// ═══════════════════════════════════════════════════════
const CATEGORIAS_VALIDAS = ['', 'comercial', 'pos_venda', 'medicao', 'financeiro', 'suporte', 'outros'];
const PRIORIDADES_VALIDAS = ['baixa', 'normal', 'alta', 'urgente'];
router.put('/conversas/:id/categoria', requireAuth, requireConversaAccess(db), (req, res) => {
    const id = req.conversa.id;
    const { categoria, prioridade, tags } = req.body || {};
    const updates = [];
    const params = [];
    if (categoria !== undefined) {
        if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ error: 'Categoria inválida' });
        updates.push('categoria = ?'); params.push(categoria);
    }
    if (prioridade !== undefined) {
        if (!PRIORIDADES_VALIDAS.includes(prioridade)) return res.status(400).json({ error: 'Prioridade inválida' });
        updates.push('prioridade = ?'); params.push(prioridade);
    }
    if (Array.isArray(tags)) {
        updates.push('tags_json = ?'); params.push(JSON.stringify(tags));
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada pra atualizar' });
    params.push(id);
    db.prepare(`UPDATE chat_conversas SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(id);
    try { req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: id }); } catch (_) { /* silencioso */ }
    res.json(updated);
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/arquivar — arquivar/desarquivar
// body: { arquivada: boolean }
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/arquivar', requireAuth, requireConversaAccess(db), (req, res) => {
    const { arquivada } = req.body || {};
    db.prepare('UPDATE chat_conversas SET arquivada = ? WHERE id = ?').run(arquivada ? 1 : 0, req.conversa.id);
    try { req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: req.conversa.id, arquivada: arquivada ? 1 : 0 }); } catch (_) { /* silencioso */ }
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/conversas/:id/historico — histórico de atribuições
// ═══════════════════════════════════════════════════════
router.get('/conversas/:id/historico', requireAuth, requireConversaAccess(db), (req, res) => {
    const h = db.prepare(`
        SELECT a.*, ud.nome as de_nome, up.nome as para_nome, upor.nome as por_nome
        FROM chat_conversa_atribuicoes a
        LEFT JOIN users ud ON a.de_user_id = ud.id
        LEFT JOIN users up ON a.para_user_id = up.id
        LEFT JOIN users upor ON a.por_user_id = upor.id
        WHERE a.conversa_id = ?
        ORDER BY a.criado_em DESC
    `).all(req.conversa.id);
    res.json(h);
});

// ═══════════════════════════════════════════════════════
// GET /api/whatsapp/usuarios-disponiveis — lista de atendentes pra atribuir
// ═══════════════════════════════════════════════════════
router.get('/usuarios-disponiveis', requireAuth, (req, res) => {
    const users = db.prepare(
        'SELECT id, nome, role FROM users WHERE ativo = 1 ORDER BY nome'
    ).all();
    res.json(users);
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/ia-bloqueio — pausar/retomar IA manualmente
// body: { bloqueada: true|false, minutos?: number, motivo?: string }
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/ia-bloqueio', requireAuth, requireConversaAccess(db), (req, res) => {
    const id = req.conversa.id;
    const { bloqueada, minutos, motivo } = req.body || {};
    if (bloqueada) {
        const min = Number(minutos) > 0 ? Number(minutos) : 60 * 24;
        const ate = new Date(Date.now() + min * 60 * 1000).toISOString();
        db.prepare(
            'UPDATE chat_conversas SET ia_bloqueada = 1, ia_bloqueio_ate = ?, ia_bloqueio_motivo = ? WHERE id = ?'
        ).run(ate, motivo || 'manual', id);
    } else {
        // Retomar: limpa bloqueio E garante status 'ia' para o webhook voltar a responder
        // (status pode ter virado 'humano' durante a pausa por escalada ou resposta manual)
        db.prepare(
            "UPDATE chat_conversas SET ia_bloqueada = 0, ia_bloqueio_ate = NULL, ia_bloqueio_motivo = '', status = 'ia', abandonada = 0 WHERE id = ?"
        ).run(id);
    }
    const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(id);
    try { req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: id, ia_bloqueada: conversa.ia_bloqueada }); } catch (_) { /* silencioso */ }
    res.json(conversa);
});

// ═══════════════════════════════════════════════════════
// PUT /api/whatsapp/conversas/:id/aguardando-cliente
// Pausa escalação Sofia enquanto humano aguarda cliente ativamente
// body: { aguardando: true|false }
// ═══════════════════════════════════════════════════════
router.put('/conversas/:id/aguardando-cliente', requireAuth, requireConversaAccess(db), (req, res) => {
    const id = req.conversa.id;
    const { aguardando } = req.body || {};
    const flag = aguardando ? 1 : 0;
    db.prepare('UPDATE chat_conversas SET aguardando_cliente = ? WHERE id = ?').run(flag, id);
    // Ao desligar, reseta escalação para recomeçar contagem
    if (!aguardando) {
        db.prepare('UPDATE chat_conversas SET escalacao_nivel = 0, escalacao_ultima_em = NULL WHERE id = ?').run(id);
    }
    const conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(id);
    try { req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: id, aguardando_cliente: conversa.aguardando_cliente }); } catch (_) { /* silencioso */ }
    res.json(conversa);
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/processar-escalacao-manual
// Dispara verificação de escalação numa conversa específica (útil para testes)
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/processar-escalacao-manual', requireAuth, requireConversaAccess(db), async (req, res) => {
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
router.put('/conversas/:id/vincular', requireAuth, requireConversaAccess(db), (req, res) => {
    const id = req.conversa.id;
    const { cliente_id } = req.body;
    db.prepare('UPDATE chat_conversas SET cliente_id = ? WHERE id = ?').run(cliente_id || null, id);
    const conversa = db.prepare(`
        SELECT cc.*, c.nome as cliente_nome
        FROM chat_conversas cc LEFT JOIN clientes c ON cc.cliente_id = c.id
        WHERE cc.id = ?
    `).get(id);
    try { req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: id, cliente_id: conversa.cliente_id }); } catch (_) { /* silencioso */ }
    res.json(conversa);
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/enviar-midia — enviar imagem/audio/doc
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/enviar-midia', requireAuth, upload.single('file'), requireConversaAccess(db), async (req, res) => {
    const id = req.conversa.id;
    const caption = req.body.caption || '';
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Arquivo obrigatório' });

    const conversa = req.conversa;

    // Auto-atribuir ao enviar (mesmo padrão do /enviar)
    if (!conversa.atribuido_user_id) {
        db.prepare(
            'UPDATE chat_conversas SET atribuido_user_id = ?, atribuido_em = CURRENT_TIMESTAMP, atribuido_por_id = ? WHERE id = ?'
        ).run(req.user.id, req.user.id, id);
    }

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
        try {
            req.app.locals.wsBroadcast?.('chat.message', {
                conversa_id: id,
                mensagem_id: r.lastInsertRowid,
                direcao: 'saida',
                tipo,
                remetente: 'usuario',
            });
            req.app.locals.wsBroadcast?.('chat.conversa-updated', { conversa_id: id });
        } catch (_) { /* silencioso */ }
        res.json(msg);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/sugerir — IA sugere resposta
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/sugerir', requireAuth, requireConversaAccess(db), async (req, res) => {
    try {
        const suggestion = await ai.suggestResponse(req.conversa.id);
        res.json({ sugestao: suggestion });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/backfill — pull histórico completo da Evolution
// body: { chat_id?: string }  — se omitido, puxa TODOS os chats
// Restrito a gerente/admin (operação pesada)
// ═══════════════════════════════════════════════════════
router.post('/backfill', requireAuth, async (req, res) => {
    if (!isGerente(req.user)) return res.status(403).json({ error: 'Apenas gerentes podem rodar backfill' });
    const { chat_id, limit } = req.body || {};
    console.log(`[backfill] Request recebida — user=${req.user?.id} chat_id=${chat_id || 'ALL'} limit=${limit || 'default'}`);
    try {
        let result;
        if (chat_id) {
            result = await backfillOneChat(chat_id, { limit: limit || 1000 });
        } else {
            result = await backfillFromEvolution({ perChatLimit: limit || 1000, onProgress: null });
        }
        res.json(result);
    } catch (e) {
        console.error('[backfill] FALHA:', e.message, e.stack);
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/conversas/:id/backfill — só essa conversa
// ═══════════════════════════════════════════════════════
router.post('/conversas/:id/backfill', requireAuth, requireConversaAccess(db), async (req, res) => {
    try {
        const conversa = req.conversa;
        const jid = conversa.wa_jid || `${conversa.wa_phone}@s.whatsapp.net`;
        const result = await backfillOneChat(jid, { limit: 1000 });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/whatsapp/enable-full-history — ativa syncFullHistory + logout
// Fluxo: ativa a flag na Evolution → desconecta → cliente re-escaneia o QR.
// No pareamento seguinte, Evolution dispara messages.set com ~6 meses de
// histórico do celular, que nosso webhook captura em handleMessagesSet.
// ═══════════════════════════════════════════════════════
router.post('/enable-full-history', requireAuth, async (req, res) => {
    if (!isGerente(req.user)) return res.status(403).json({ error: 'Apenas gerentes podem ativar sincronização completa' });
    const { logout = true } = req.body || {};
    try {
        console.log(`[whatsapp] Ativando syncFullHistory — user=${req.user?.id}`);
        const enable = await evolution.enableFullHistorySync();
        let logoutResult = null;
        if (logout) {
            try {
                logoutResult = await evolution.logoutInstance();
            } catch (e) {
                // Ativamos a flag mas não conseguimos deslogar — cliente desloga manualmente
                logoutResult = { ok: false, error: e.message };
            }
        }
        res.json({
            ok: true,
            enable,
            logout: logoutResult,
            instrucoes: 'Agora abra a tela de QR Code e escaneie pelo celular novamente. A Evolution vai puxar o histórico completo (pode levar alguns minutos).',
        });
    } catch (e) {
        console.error('[whatsapp] enable-full-history FALHOU:', e.message);
        res.status(500).json({ error: e.message });
    }
});

export default router;
