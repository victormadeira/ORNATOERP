import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { randomBytes } from 'crypto';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

// Parse user-agent para extrair dispositivo, navegador e OS
function parseUA(ua) {
    if (!ua) return { dispositivo: 'Desconhecido', navegador: '', os_name: '' };

    let dispositivo = 'Desktop';
    if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) dispositivo = /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Mobile';

    let navegador = '';
    if (/Edg\//i.test(ua)) navegador = 'Edge';
    else if (/OPR|Opera/i.test(ua)) navegador = 'Opera';
    else if (/Chrome/i.test(ua)) navegador = 'Chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) navegador = 'Safari';
    else if (/Firefox/i.test(ua)) navegador = 'Firefox';
    else navegador = 'Outro';

    // Versão do navegador
    const verMatch = ua.match(new RegExp(`${navegador === 'Edge' ? 'Edg' : navegador}\\/([\\d.]+)`));
    if (verMatch) navegador += ` ${verMatch[1].split('.')[0]}`;

    let os_name = '';
    if (/Windows NT 10/i.test(ua)) os_name = 'Windows 10/11';
    else if (/Windows/i.test(ua)) os_name = 'Windows';
    else if (/Mac OS X/i.test(ua)) os_name = ua.match(/iPhone|iPad/) ? 'iOS' : 'macOS';
    else if (/Android/i.test(ua)) {
        const v = ua.match(/Android\s([\d.]+)/);
        os_name = v ? `Android ${v[1]}` : 'Android';
    }
    else if (/Linux/i.test(ua)) os_name = 'Linux';
    else os_name = 'Outro';

    return { dispositivo, navegador, os_name };
}

// Geolocalização por IP (ip-api.com — gratuito, 45 req/min)
async function geolocateIP(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { cidade: 'Local', estado: '', pais: '' };
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country&lang=pt-BR`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) return { cidade: '', estado: '', pais: '' };
        const data = await resp.json();
        return { cidade: data.city || '', estado: data.regionName || '', pais: data.country || '' };
    } catch {
        return { cidade: '', estado: '', pais: '' };
    }
}

// Rate limit: mesma IP nos últimos 30min não gera nova notificação
const RATE_LIMIT_MIN = 30;
function isNewVisit(orc_id, ip) {
    const recent = db.prepare(`
        SELECT id FROM proposta_acessos
        WHERE orc_id = ? AND ip_cliente = ? AND is_new_visit = 1
        AND acessado_em > datetime('now', ?)
        LIMIT 1
    `).get(orc_id, ip, `-${RATE_LIMIT_MIN} minutes`);
    return !recent;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/portal/generate — gera ou retorna token existente (+ salva HTML)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/generate', requireAuth, (req, res) => {
    const { orc_id, html_proposta, nivel } = req.body;
    if (!orc_id) return res.status(400).json({ error: 'orc_id obrigatório' });

    const orc = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(parseInt(orc_id));
    if (!orc) return res.status(404).json({ error: 'Orçamento não encontrado' });

    // Retorna token existente se já houver (atualiza HTML se fornecido)
    const existing = db.prepare('SELECT * FROM portal_tokens WHERE orc_id = ? AND ativo = 1').get(orc.id);
    if (existing) {
        if (html_proposta) {
            db.prepare('UPDATE portal_tokens SET html_proposta = ?, nivel = ? WHERE id = ?')
                .run(html_proposta, nivel || 'geral', existing.id);
        }
        return res.json({ token: existing.token });
    }

    // Gera novo token
    const token = randomBytes(20).toString('hex');
    db.prepare('INSERT INTO portal_tokens (orc_id, token, html_proposta, nivel) VALUES (?, ?, ?, ?)')
        .run(orc.id, token, html_proposta || '', nivel || 'geral');
    res.json({ token });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/portal/update-html — atualiza HTML da proposta no token existente
// ═══════════════════════════════════════════════════════════════════════════════
router.put('/update-html', requireAuth, (req, res) => {
    const { orc_id, html_proposta, nivel } = req.body;
    if (!orc_id || !html_proposta) return res.status(400).json({ error: 'orc_id e html_proposta obrigatórios' });

    const existing = db.prepare('SELECT * FROM portal_tokens WHERE orc_id = ? AND ativo = 1').get(parseInt(orc_id));
    if (!existing) return res.status(404).json({ error: 'Token não encontrado. Gere o link primeiro.' });

    db.prepare('UPDATE portal_tokens SET html_proposta = ?, nivel = ? WHERE id = ?')
        .run(html_proposta, nivel || existing.nivel || 'geral', existing.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/portal/public/:token — acesso público (sem auth) com rate limit
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/public/:token', async (req, res) => {
    const { token } = req.params;

    const portalToken = db.prepare('SELECT * FROM portal_tokens WHERE token = ? AND ativo = 1').get(token);
    if (!portalToken) return res.status(404).json({ error: 'Link inválido ou expirado' });

    const orc = db.prepare(`
        SELECT o.*, u.nome as vendedor_nome
        FROM orcamentos o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = ?
    `).get(portalToken.orc_id);
    if (!orc) return res.status(404).json({ error: 'Proposta não encontrada' });

    // Extrair dados do request
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    const { dispositivo, navegador, os_name } = parseUA(ua);

    // Rate limit: verificar se é nova visita
    const newVisit = isNewVisit(portalToken.orc_id, ip);

    // Geolocalização assíncrona
    const geo = await geolocateIP(ip);

    // Registrar acesso
    db.prepare(`
        INSERT INTO proposta_acessos (orc_id, token, ip_cliente, user_agent, dispositivo, navegador, os_name, cidade, estado, pais, is_new_visit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(portalToken.orc_id, token, ip, ua, dispositivo, navegador, os_name, geo.cidade, geo.estado, geo.pais, newVisit ? 1 : 0);

    db.prepare('UPDATE portal_tokens SET ultimo_acesso = CURRENT_TIMESTAMP WHERE token = ?').run(token);

    // Retornar dados
    res.json({
        html_proposta: portalToken.html_proposta || '',
        nivel: portalToken.nivel || 'geral',
        empresa_nome: (() => {
            const emp = db.prepare('SELECT nome, proposta_cor_primaria, proposta_cor_accent FROM empresa_config WHERE id = 1').get();
            return emp?.nome || 'Marcenaria';
        })(),
        cor_primaria: (() => {
            const emp = db.prepare('SELECT proposta_cor_primaria FROM empresa_config WHERE id = 1').get();
            return emp?.proposta_cor_primaria || '#1B2A4A';
        })(),
        cor_accent: (() => {
            const emp = db.prepare('SELECT proposta_cor_accent FROM empresa_config WHERE id = 1').get();
            return emp?.proposta_cor_accent || '#C9A96E';
        })(),
        numero: orc.numero || '',
        cliente_nome: orc.cliente_nome || '',
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/portal/heartbeat/:token — atualiza tempo + scroll de sessão ativa
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/heartbeat/:token', (req, res) => {
    const { token } = req.params;
    const { tempo_pagina, scroll_max, resolucao, fingerprint } = req.body;

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    // Atualizar o último acesso deste IP/token (mais recente)
    const lastAccess = db.prepare(`
        SELECT id FROM proposta_acessos
        WHERE token = ? AND ip_cliente = ?
        ORDER BY acessado_em DESC LIMIT 1
    `).get(token, ip);

    if (lastAccess) {
        const updates = [];
        const params = [];
        if (tempo_pagina > 0) { updates.push('tempo_pagina = MAX(tempo_pagina, ?)'); params.push(tempo_pagina); }
        if (scroll_max > 0) { updates.push('scroll_max = MAX(scroll_max, ?)'); params.push(scroll_max); }
        if (resolucao) { updates.push('resolucao = ?'); params.push(resolucao); }
        if (fingerprint) { updates.push('fingerprint = ?'); params.push(fingerprint); }
        if (updates.length > 0) {
            params.push(lastAccess.id);
            db.prepare(`UPDATE proposta_acessos SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        }
    }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/portal/views/:orc_id — histórico de acessos (avançado)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/views/:orc_id', requireAuth, (req, res) => {
    const orc_id = parseInt(req.params.orc_id);
    const portalToken = db.prepare('SELECT token, nivel, criado_em, ultimo_acesso FROM portal_tokens WHERE orc_id = ? AND ativo = 1').get(orc_id);
    if (!portalToken) return res.json({ token: null, total: 0, unique: 0, views: [], resumo: {} });

    const views = db.prepare(`
        SELECT id, acessado_em, ip_cliente, dispositivo, navegador, os_name,
               cidade, estado, pais, resolucao, fingerprint,
               tempo_pagina, scroll_max, is_new_visit
        FROM proposta_acessos
        WHERE orc_id = ?
        ORDER BY acessado_em DESC
        LIMIT 200
    `).all(orc_id);

    // Contadores
    const total = views.length;
    const newVisits = views.filter(v => v.is_new_visit).length;
    const uniqueIPs = new Set(views.map(v => v.ip_cliente)).size;
    const uniqueFingerprints = new Set(views.filter(v => v.fingerprint).map(v => v.fingerprint)).size;
    const maxTempo = Math.max(0, ...views.map(v => v.tempo_pagina || 0));
    const maxScroll = Math.max(0, ...views.map(v => v.scroll_max || 0));

    // Dispositivos únicos
    const deviceMap = {};
    views.forEach(v => {
        const key = v.fingerprint || `${v.ip_cliente}_${v.dispositivo}_${v.navegador}`;
        if (!deviceMap[key]) {
            deviceMap[key] = {
                ip: v.ip_cliente,
                dispositivo: v.dispositivo,
                navegador: v.navegador,
                os_name: v.os_name,
                cidade: v.cidade,
                estado: v.estado,
                visitas: 0,
                primeiro_acesso: v.acessado_em,
                ultimo_acesso: v.acessado_em,
                tempo_max: v.tempo_pagina || 0,
                scroll_max: v.scroll_max || 0,
            };
        }
        deviceMap[key].visitas++;
        deviceMap[key].tempo_max = Math.max(deviceMap[key].tempo_max, v.tempo_pagina || 0);
        deviceMap[key].scroll_max = Math.max(deviceMap[key].scroll_max, v.scroll_max || 0);
        if (v.acessado_em < deviceMap[key].primeiro_acesso) deviceMap[key].primeiro_acesso = v.acessado_em;
        if (v.acessado_em > deviceMap[key].ultimo_acesso) deviceMap[key].ultimo_acesso = v.acessado_em;
    });

    res.json({
        token: portalToken.token,
        nivel: portalToken.nivel,
        criado_em: portalToken.criado_em,
        ultimo_acesso: portalToken.ultimo_acesso,
        total,
        new_visits: newVisits,
        unique_ips: uniqueIPs,
        unique_devices: uniqueFingerprints || uniqueIPs,
        max_tempo: maxTempo,
        max_scroll: maxScroll,
        dispositivos: Object.values(deviceMap).sort((a, b) => b.visitas - a.visitas),
        views: views.slice(0, 50), // últimos 50 para o frontend
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/portal/revoke/:orc_id — revogar token
// ═══════════════════════════════════════════════════════════════════════════════
router.delete('/revoke/:orc_id', requireAuth, (req, res) => {
    const orc_id = parseInt(req.params.orc_id);
    db.prepare('UPDATE portal_tokens SET ativo = 0 WHERE orc_id = ?').run(orc_id);
    res.json({ ok: true });
});

export default router;
