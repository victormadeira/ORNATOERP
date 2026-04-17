// ═══════════════════════════════════════════════════════
// ROTAS DA EXTENSÃO CHROME (WhatsApp Web Sidebar)
// Autenticação via token pessoal (header x-ext-token)
// ═══════════════════════════════════════════════════════

import express from 'express';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import AdmZip from 'adm-zip';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import sofiaEscalacao from '../services/sofia_escalacao.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXT_DIR = path.resolve(__dirname, '..', '..', 'extension');

// ─── Helper: log de acesso ───
function registrarLog(tokenId, userId, req, tipo, detalhe) {
    try {
        db.prepare(`
            INSERT INTO ext_logs (token_id, user_id, tipo, endpoint, method, ip, user_agent, detalhe)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            tokenId || null,
            userId || null,
            tipo || 'api',
            (req.originalUrl || req.url || '').slice(0, 200),
            req.method,
            (req.ip || req.headers['x-forwarded-for'] || '').toString().slice(0, 80),
            (req.headers['user-agent'] || '').slice(0, 200),
            (detalhe || '').slice(0, 500),
        );
    } catch (_) { /* nunca derruba a requisição */ }
}

// ─── Normalizar telefone (só dígitos, opcional +55) ───
function normalizarTelefone(tel) {
    if (!tel) return '';
    let t = String(tel).replace(/\D/g, '');
    // remove prefixo 55 se presente para matching flexível
    if (t.startsWith('55') && t.length > 11) t = t.slice(2);
    return t;
}

// ─── Match flexível por telefone (ignora DDI/formatação) ───
function telefonesBatem(a, b) {
    const na = normalizarTelefone(a);
    const nb = normalizarTelefone(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // compara pelos últimos 8-11 dígitos
    const tail = (s) => s.slice(-Math.min(11, s.length));
    return tail(na) === tail(nb) || na.endsWith(nb) || nb.endsWith(na);
}

// ─── Middleware: auth via token de extensão ───
function requireExtToken(req, res, next) {
    const token = req.headers['x-ext-token'] || req.query.token;
    if (!token) return res.status(401).json({ error: 'Token ausente' });
    const row = db.prepare(`
        SELECT t.*, u.id as uid, u.nome as unome, u.email as uemail, u.role as urole
        FROM ext_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ? AND t.revogado = 0
    `).get(String(token));
    if (!row) return res.status(401).json({ error: 'Token inválido ou revogado' });
    db.prepare('UPDATE ext_tokens SET ultimo_uso_em = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    req.extUser = { id: row.uid, nome: row.unome, email: row.uemail, role: row.urole };
    req.extTokenId = row.id;
    // log de todo acesso autenticado via extensão
    registrarLog(row.id, row.uid, req, 'api');
    next();
}

// ═══════════════════════════════════════════════════════
// CORS para extensão: permite chrome-extension://*
// ═══════════════════════════════════════════════════════
router.use((req, res, next) => {
    const origin = req.headers.origin || '';
    if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Headers', 'Content-Type, x-ext-token, Authorization');
        res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.set('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ═══════════════════════════════════════════════════════
// GERENCIAMENTO DE TOKENS (autenticado via JWT normal)
// ═══════════════════════════════════════════════════════

// GET /api/ext/tokens — lista tokens do usuário logado
router.get('/tokens', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT id, nome, revogado, ultimo_uso_em, criado_em,
               substr(token, 1, 8) || '…' || substr(token, -4) as token_preview
        FROM ext_tokens WHERE user_id = ? ORDER BY criado_em DESC
    `).all(req.user.id);
    res.json(rows);
});

// POST /api/ext/tokens — gera um novo token
router.post('/tokens', requireAuth, (req, res) => {
    const { nome } = req.body || {};
    const token = randomBytes(32).toString('hex'); // 64 chars
    const r = db.prepare('INSERT INTO ext_tokens (user_id, token, nome) VALUES (?, ?, ?)')
        .run(req.user.id, token, (nome || 'Minha extensão').slice(0, 60));
    res.json({ id: r.lastInsertRowid, token, nome: nome || 'Minha extensão' });
});

// DELETE /api/ext/tokens/:id — revoga um token
router.delete('/tokens/:id', requireAuth, (req, res) => {
    db.prepare('UPDATE ext_tokens SET revogado = 1 WHERE id = ? AND user_id = ?')
        .run(parseInt(req.params.id), req.user.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// ENDPOINTS CONSUMIDOS PELA EXTENSÃO (auth via x-ext-token)
// ═══════════════════════════════════════════════════════

// GET /api/ext/me — valida o token, retorna usuário
router.get('/me', requireExtToken, (req, res) => {
    // marca evento de "login" separado (mais fácil de auditar)
    registrarLog(req.extTokenId, req.extUser.id, req, 'login', 'handshake /me');
    res.json({ user: req.extUser });
});

// GET /api/ext/cliente-por-tel/:tel — busca cliente por telefone
router.get('/cliente-por-tel/:tel', requireExtToken, (req, res) => {
    const tel = req.params.tel;
    const nrm = normalizarTelefone(tel);
    // Tenta match exato primeiro
    let cliente = db.prepare(`
        SELECT id, nome, email, tel, cidade, estado, endereco, bairro, numero,
               cpf, cnpj, tipo_pessoa, obs, criado_em
        FROM clientes
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(tel, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?
        LIMIT 1
    `).get('%' + nrm);
    if (!cliente && nrm) {
        // Busca ampla: varre clientes e compara com match flexível
        const todos = db.prepare('SELECT id, nome, email, tel, cidade, estado, endereco, bairro, numero, cpf, cnpj, tipo_pessoa, obs, criado_em FROM clientes').all();
        cliente = todos.find(c => telefonesBatem(c.tel, tel));
    }

    // Conversa correspondente
    let conversa = null;
    if (cliente) {
        conversa = db.prepare('SELECT * FROM chat_conversas WHERE cliente_id = ? ORDER BY ultimo_msg_em DESC LIMIT 1').get(cliente.id);
    }
    if (!conversa) {
        // tentar por telefone direto na conversa
        const convs = db.prepare('SELECT * FROM chat_conversas ORDER BY ultimo_msg_em DESC LIMIT 500').all();
        conversa = convs.find(c => telefonesBatem(c.wa_phone, tel));
    }

    res.json({ cliente: cliente || null, conversa: conversa || null });
});

// GET /api/ext/orcamentos-por-cliente/:id
router.get('/orcamentos-por-cliente/:id', requireExtToken, (req, res) => {
    const rows = db.prepare(`
        SELECT id, numero, titulo, valor_total, status_proposta, status, data_vencimento, criado_em
        FROM orcamentos
        WHERE cliente_id = ?
        ORDER BY criado_em DESC
        LIMIT 20
    `).all(parseInt(req.params.id));
    res.json(rows);
});

// GET /api/ext/sofia-status/:conversaId
router.get('/sofia-status/:conversaId', requireExtToken, (req, res) => {
    const c = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(parseInt(req.params.conversaId));
    if (!c) return res.status(404).json({ error: 'Conversa não encontrada' });
    let dossie = {};
    try { dossie = JSON.parse(c.lead_dados || '{}'); } catch {}
    const temperatura = sofiaEscalacao.classificarTemperatura(c.lead_score);
    res.json({
        conversa_id: c.id,
        status: c.status,
        ia_bloqueada: !!c.ia_bloqueada,
        ia_bloqueio_motivo: c.ia_bloqueio_motivo,
        ia_bloqueio_ate: c.ia_bloqueio_ate,
        aguardando_cliente: !!c.aguardando_cliente,
        lead_score: c.lead_score,
        lead_qualificacao: c.lead_qualificacao,
        temperatura,
        handoff_em: c.handoff_em,
        escalacao_nivel: c.escalacao_nivel,
        abandonada: !!c.abandonada,
        dossie,
    });
});

// GET /api/ext/templates — templates de mensagem disponíveis
router.get('/templates', requireExtToken, (req, res) => {
    const rows = db.prepare(`
        SELECT id, titulo, conteudo, atalho, categoria, usos
        FROM sofia_templates WHERE ativo = 1
        ORDER BY categoria, titulo
    `).all();
    res.json(rows);
});

// POST /api/ext/templates/:id/usar — incrementa contador de uso
router.post('/templates/:id/usar', requireExtToken, (req, res) => {
    db.prepare('UPDATE sofia_templates SET usos = usos + 1 WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// IMPORT BATCH — histórico via content script
// body: { telefone, nome, mensagens: [{ direcao, conteudo, criado_em, hash }] }
// Idempotente por (conversa_id, hash_import)
// ═══════════════════════════════════════════════════════
router.post('/import-batch', requireExtToken, (req, res) => {
    const { telefone, nome, mensagens } = req.body || {};
    if (!telefone || !Array.isArray(mensagens)) {
        return res.status(400).json({ error: 'telefone e mensagens (array) obrigatórios' });
    }
    const tel = normalizarTelefone(telefone);
    if (!tel) return res.status(400).json({ error: 'telefone inválido' });

    // Busca ou cria conversa
    let conversa = null;
    const convs = db.prepare('SELECT * FROM chat_conversas').all();
    conversa = convs.find(c => telefonesBatem(c.wa_phone, tel));

    if (!conversa) {
        const r = db.prepare(`
            INSERT INTO chat_conversas (wa_phone, wa_name, status, ultimo_msg_em, criado_em)
            VALUES (?, ?, 'humano', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(tel, nome || '');
        conversa = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(r.lastInsertRowid);
    } else if (nome && !conversa.wa_name) {
        db.prepare('UPDATE chat_conversas SET wa_name = ? WHERE id = ?').run(nome, conversa.id);
    }

    const inserir = db.prepare(`
        INSERT INTO chat_mensagens (conversa_id, direcao, tipo, conteudo, remetente, importado, hash_import, criado_em)
        VALUES (?, ?, 'texto', ?, ?, 1, ?, ?)
    `);
    const existe = db.prepare('SELECT 1 FROM chat_mensagens WHERE conversa_id = ? AND hash_import = ? LIMIT 1');

    let inseridas = 0, duplicadas = 0;
    const tx = db.transaction((msgs) => {
        for (const m of msgs) {
            if (!m || !m.hash || !m.conteudo) continue;
            const dir = m.direcao === 'saida' ? 'saida' : 'entrada';
            const rem = dir === 'saida' ? 'humano' : 'cliente';
            if (existe.get(conversa.id, m.hash)) { duplicadas++; continue; }
            const ts = m.criado_em ? new Date(m.criado_em).toISOString().replace('T', ' ').slice(0, 19) : null;
            inserir.run(conversa.id, dir, m.conteudo.slice(0, 10000), rem, m.hash, ts || new Date().toISOString());
            inseridas++;
        }
    });
    try {
        tx(mensagens);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }

    // Atualiza ultimo_msg_em pra refletir a última mensagem importada
    db.prepare(`
        UPDATE chat_conversas SET ultimo_msg_em = (
            SELECT MAX(criado_em) FROM chat_mensagens WHERE conversa_id = ?
        ) WHERE id = ?
    `).run(conversa.id, conversa.id);

    res.json({ ok: true, conversa_id: conversa.id, inseridas, duplicadas });
});

// PUT /api/ext/pausar-ia/:conversaId
router.put('/pausar-ia/:conversaId', requireExtToken, (req, res) => {
    const { bloqueada, minutos, motivo } = req.body || {};
    const id = parseInt(req.params.conversaId);
    if (bloqueada) {
        const min = Number(minutos) > 0 ? Number(minutos) : 60 * 24;
        const ate = new Date(Date.now() + min * 60 * 1000).toISOString();
        db.prepare('UPDATE chat_conversas SET ia_bloqueada = 1, ia_bloqueio_ate = ?, ia_bloqueio_motivo = ? WHERE id = ?')
            .run(ate, motivo || 'manual_ext', id);
    } else {
        db.prepare("UPDATE chat_conversas SET ia_bloqueada = 0, ia_bloqueio_ate = NULL, ia_bloqueio_motivo = '' WHERE id = ?").run(id);
    }
    res.json({ ok: true });
});

// PUT /api/ext/aguardando-cliente/:conversaId
router.put('/aguardando-cliente/:conversaId', requireExtToken, (req, res) => {
    const { aguardando } = req.body || {};
    const id = parseInt(req.params.conversaId);
    db.prepare('UPDATE chat_conversas SET aguardando_cliente = ? WHERE id = ?').run(aguardando ? 1 : 0, id);
    if (!aguardando) {
        db.prepare('UPDATE chat_conversas SET escalacao_nivel = 0, escalacao_ultima_em = NULL WHERE id = ?').run(id);
    }
    res.json({ ok: true });
});

// GET /api/ext/badge-count — quantas conversas com escalação pendente
router.get('/badge-count', requireExtToken, (req, res) => {
    const row = db.prepare(`
        SELECT COUNT(*) as n FROM chat_conversas
        WHERE status = 'humano'
          AND escalacao_nivel >= 1
          AND (aguardando_cliente IS NULL OR aguardando_cliente = 0)
          AND (abandonada IS NULL OR abandonada = 0)
    `).get();
    res.json({ count: row?.n || 0 });
});

// GET /api/ext/ping — health check
router.get('/ping', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ═══════════════════════════════════════════════════════
// POST /api/ext/login — login direto via extensão
// body: { email, senha, device_name }
// Retorna token vinculado ao usuário autenticado
// ═══════════════════════════════════════════════════════
router.post('/login', (req, res) => {
    const { email, senha, device_name } = req.body || {};
    if (!email || !senha) {
        return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (!user.ativo) return res.status(401).json({ error: 'Usuário desativado' });
    const valid = bcrypt.compareSync(senha, user.senha_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    // Nome do dispositivo (vem do user-agent se não enviado)
    const ua = (req.headers['user-agent'] || '').slice(0, 120);
    const nome = (device_name || `Chrome · ${new Date().toLocaleString('pt-BR')}`).slice(0, 60);

    const token = randomBytes(32).toString('hex');
    const r = db.prepare('INSERT INTO ext_tokens (user_id, token, nome) VALUES (?, ?, ?)')
        .run(user.id, token, nome);

    // Log do login via extensão
    try {
        db.prepare(`
            INSERT INTO ext_logs (token_id, user_id, tipo, endpoint, method, ip, user_agent, detalhe)
            VALUES (?, ?, 'login', '/api/ext/login', 'POST', ?, ?, ?)
        `).run(
            r.lastInsertRowid,
            user.id,
            (req.ip || '').toString().slice(0, 80),
            ua,
            `login direto ext: ${nome}`,
        );
    } catch {}

    // Atualiza último acesso
    db.prepare('UPDATE users SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    res.json({
        token,
        user: { id: user.id, nome: user.nome, email: user.email, role: user.role },
        device: nome,
    });
});

// POST /api/ext/logout — revoga o token atual
router.post('/logout', requireExtToken, (req, res) => {
    db.prepare('UPDATE ext_tokens SET revogado = 1 WHERE id = ?').run(req.extTokenId);
    registrarLog(req.extTokenId, req.extUser.id, req, 'logout', 'logout via extensão');
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// DOWNLOAD DA EXTENSÃO (ZIP)
// Gera on-the-fly da pasta extension/. Requer auth JWT (usuário logado no ERP).
// ═══════════════════════════════════════════════════════
router.get('/download-extension', requireAuth, (req, res) => {
    if (!fs.existsSync(EXT_DIR)) {
        return res.status(500).json({ error: 'Pasta da extensão não encontrada no servidor' });
    }
    try {
        const zip = new AdmZip();
        zip.addLocalFolder(EXT_DIR);
        const buf = zip.toBuffer();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="ornato-extension.zip"');
        res.setHeader('Content-Length', buf.length);
        res.end(buf);
        // registra log de download
        try {
            db.prepare(`
                INSERT INTO ext_logs (user_id, tipo, endpoint, method, ip, user_agent, detalhe)
                VALUES (?, 'download', ?, ?, ?, ?, 'download-zip')
            `).run(
                req.user.id,
                req.originalUrl || req.url,
                req.method,
                (req.ip || '').toString().slice(0, 80),
                (req.headers['user-agent'] || '').slice(0, 200),
            );
        } catch {}
    } catch (e) {
        res.status(500).json({ error: 'Falha ao empacotar: ' + e.message });
    }
});

// GET /api/ext/logs — auditoria (admin vê todos; demais vêem só os próprios)
router.get('/logs', requireAuth, (req, res) => {
    const limit = Math.min(500, parseInt(req.query.limit) || 100);
    const isAdmin = req.user.role === 'admin' || req.user.role === 'gerente';
    let rows;
    if (isAdmin) {
        rows = db.prepare(`
            SELECT l.*, u.nome as user_nome, u.email as user_email
            FROM ext_logs l
            LEFT JOIN users u ON u.id = l.user_id
            ORDER BY l.criado_em DESC LIMIT ?
        `).all(limit);
    } else {
        rows = db.prepare(`
            SELECT l.*, u.nome as user_nome, u.email as user_email
            FROM ext_logs l
            LEFT JOIN users u ON u.id = l.user_id
            WHERE l.user_id = ?
            ORDER BY l.criado_em DESC LIMIT ?
        `).all(req.user.id, limit);
    }
    res.json(rows);
});

export default router;
