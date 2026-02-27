import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { randomBytes } from 'crypto';
import { createNotification } from '../services/notificacoes.js';

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

// Geolocalização por IP (ipinfo.io — 50k req/mês grátis)
const IPINFO_TOKEN = 'f4a5ba70f05a1c';
async function geolocateIP(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { cidade: 'Local', estado: '', pais: '' };
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(`https://ipinfo.io/${ip}/json?token=${IPINFO_TOKEN}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) return { cidade: '', estado: '', pais: '' };
        const data = await resp.json();
        return { cidade: data.city || '', estado: data.region || '', pais: data.country || '' };
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

// ── Lead Scoring (Score de Calor) ────────────────────────────────────────────
function calculateLeadScore(orc_id) {
    const views = db.prepare(`
        SELECT acessado_em, tempo_pagina, scroll_max, is_new_visit, fingerprint, evento_tipo
        FROM proposta_acessos WHERE orc_id = ? ORDER BY acessado_em DESC LIMIT 500
    `).all(orc_id);

    if (!views.length) return { score: 0, label: 'Sem acesso', cor: '#94a3b8' };

    let score = 0;

    // Abriu a proposta (+10)
    const realViews = views.filter(v => v.is_new_visit);
    if (realViews.length > 0) score += 10;

    // Tempo > 2min (+15)
    const maxTempo = Math.max(0, ...views.map(v => v.tempo_pagina || 0));
    if (maxTempo >= 120) score += 15;

    // Tempo > 5min (+10 extra)
    if (maxTempo >= 300) score += 10;

    // Scroll > 80% (+20)
    const maxScroll = Math.max(0, ...views.map(v => v.scroll_max || 0));
    if (maxScroll >= 80) score += 20;

    // Retornos (+25 por retorno, max 3)
    const returnVisits = Math.max(0, realViews.length - 1);
    score += Math.min(returnVisits, 3) * 25;

    // Novo fingerprint (compartilhamento) (+30)
    const uniqueFPs = new Set(views.filter(v => v.fingerprint).map(v => v.fingerprint));
    if (uniqueFPs.size > 1) score += 30;

    // Imprimiu (+20)
    const printed = views.some(v => v.evento_tipo === 'print');
    if (printed) score += 20;

    // Recência: se último acesso < 3 dias, multiplicador ×1.5
    const lastAccess = new Date(views[0].acessado_em);
    const daysSince = (Date.now() - lastAccess.getTime()) / 86400000;
    if (daysSince <= 3) score = Math.round(score * 1.5);

    // Classificação
    let label, cor;
    if (score >= 81) { label = 'Muito Quente'; cor = '#ef4444'; }
    else if (score >= 51) { label = 'Quente'; cor = '#f97316'; }
    else if (score >= 21) { label = 'Morno'; cor = '#f59e0b'; }
    else { label = 'Frio'; cor = '#94a3b8'; }

    return { score: Math.min(score, 200), label, cor };
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

    // Notificar equipe quando cliente visualiza a proposta (só visitas novas)
    if (newVisit) {
        try {
            const local = geo.cidade ? ` de ${geo.cidade}${geo.estado ? '/' + geo.estado : ''}` : '';
            createNotification(
                'proposta_visualizada',
                `Proposta visualizada: ${orc.numero || 'Orçamento #' + orc.id}`,
                `${orc.cliente_nome} abriu a proposta${local} (${dispositivo})`,
                orc.id, 'orcamento', orc.cliente_nome, null
            );

            // ── Fase 2: Alerta de Retorno ──
            const prevVisits = db.prepare(`
                SELECT COUNT(*) as c FROM proposta_acessos
                WHERE orc_id = ? AND is_new_visit = 1 AND id != (SELECT MAX(id) FROM proposta_acessos WHERE orc_id = ?)
            `).get(portalToken.orc_id, portalToken.orc_id);
            if (prevVisits && prevVisits.c > 0) {
                const visitNum = prevVisits.c + 1;
                createNotification(
                    'proposta_retorno',
                    `Cliente voltou! ${orc.numero || '#' + orc.id}`,
                    `${orc.cliente_nome} — ${visitNum}ª visita${local}`,
                    orc.id, 'orcamento', orc.cliente_nome, null
                );
            }
        } catch (_) {}
    }

    // Retornar dados (single query para empresa_config)
    const emp = db.prepare('SELECT nome, proposta_cor_primaria, proposta_cor_accent FROM empresa_config WHERE id = 1').get();
    res.json({
        html_proposta: portalToken.html_proposta || '',
        nivel: portalToken.nivel || 'geral',
        empresa_nome: emp?.nome || 'Marcenaria',
        cor_primaria: emp?.proposta_cor_primaria || '#1B2A4A',
        cor_accent: emp?.proposta_cor_accent || '#C9A96E',
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

        // ── Fase 2: Detecção de Compartilhamento (novo fingerprint) ──
        if (fingerprint) {
            try {
                const portalToken = db.prepare('SELECT orc_id FROM portal_tokens WHERE token = ? AND ativo = 1').get(token);
                if (portalToken) {
                    const existingFPs = db.prepare(`
                        SELECT DISTINCT fingerprint FROM proposta_acessos
                        WHERE orc_id = ? AND fingerprint != '' AND fingerprint != ?
                    `).all(portalToken.orc_id, fingerprint);

                    if (existingFPs.length > 0) {
                        // Rate-limit: já notificou este fingerprint em 24h?
                        const alreadyNotified = db.prepare(`
                            SELECT id FROM notificacoes
                            WHERE tipo = 'proposta_compartilhada' AND referencia_id = ? AND referencia_extra LIKE ?
                            AND criado_em > datetime('now', '-24 hours') LIMIT 1
                        `).get(portalToken.orc_id, `%${fingerprint.substring(0, 16)}%`);

                        if (!alreadyNotified) {
                            const orc = db.prepare('SELECT numero, cliente_nome, id FROM orcamentos WHERE id = ?').get(portalToken.orc_id);
                            if (orc) {
                                // Tentar pegar cidade do acesso mais recente deste fingerprint
                                const accessInfo = db.prepare(`
                                    SELECT cidade, estado FROM proposta_acessos WHERE orc_id = ? AND fingerprint = ? ORDER BY acessado_em DESC LIMIT 1
                                `).get(portalToken.orc_id, fingerprint);
                                const local = accessInfo?.cidade ? `${accessInfo.cidade}${accessInfo.estado ? '/' + accessInfo.estado : ''}` : 'local desconhecido';
                                createNotification(
                                    'proposta_compartilhada',
                                    `Proposta compartilhada: ${orc.numero || '#' + orc.id}`,
                                    `Novo dispositivo acessou de ${local}`,
                                    orc.id, 'orcamento', fingerprint.substring(0, 16), null
                                );
                            }
                        }
                    }
                }
            } catch (_) {}
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

    // Lead Score
    const lead_score = calculateLeadScore(orc_id);

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
        lead_score,
        dispositivos: Object.values(deviceMap).sort((a, b) => b.visitas - a.visitas),
        views: views.slice(0, 50), // últimos 50 para o frontend
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/portal/score/:orc_id — Lead Score individual
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/score/:orc_id', requireAuth, (req, res) => {
    const orc_id = parseInt(req.params.orc_id);
    res.json(calculateLeadScore(orc_id));
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/portal/scores — Lead Scores batch (todos com token ativo)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/scores', requireAuth, (req, res) => {
    const tokens = db.prepare('SELECT orc_id FROM portal_tokens WHERE ativo = 1').all();
    const result = {};
    for (const t of tokens) {
        result[t.orc_id] = calculateLeadScore(t.orc_id);
    }
    res.json(result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/portal/event/:token — evento genérico (print, etc.)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/event/:token', async (req, res) => {
    const { token } = req.params;
    const { tipo } = req.body;
    if (!tipo) return res.status(400).json({ error: 'tipo obrigatório' });

    const portalToken = db.prepare('SELECT * FROM portal_tokens WHERE token = ? AND ativo = 1').get(token);
    if (!portalToken) return res.status(404).json({ error: 'Token inválido' });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    // Rate-limit: mesmo tipo/IP em 5min = ignora
    const recent = db.prepare(`
        SELECT id FROM proposta_acessos
        WHERE orc_id = ? AND ip_cliente = ? AND evento_tipo = ?
        AND acessado_em > datetime('now', '-5 minutes') LIMIT 1
    `).get(portalToken.orc_id, ip, tipo);

    if (recent) return res.json({ ok: true, skipped: true });

    const ua = req.headers['user-agent'] || '';
    const { dispositivo, navegador, os_name } = parseUA(ua);

    db.prepare(`
        INSERT INTO proposta_acessos (orc_id, token, ip_cliente, user_agent, dispositivo, navegador, os_name, is_new_visit, evento_tipo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(portalToken.orc_id, token, ip, ua, dispositivo, navegador, os_name, tipo);

    // Notificação por tipo de evento
    if (tipo === 'print') {
        try {
            const orc = db.prepare('SELECT numero, cliente_nome, id FROM orcamentos WHERE id = ?').get(portalToken.orc_id);
            if (orc) {
                createNotification(
                    'proposta_impressa',
                    `Proposta impressa: ${orc.numero || '#' + orc.id}`,
                    `${orc.cliente_nome} imprimiu/salvou a proposta como PDF`,
                    orc.id, 'orcamento', orc.cliente_nome, null
                );
            }
        } catch (_) {}
    }

    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/portal/timeline/:orc_id — Timeline completa do cliente
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/timeline/:orc_id', requireAuth, (req, res) => {
    const orc_id = parseInt(req.params.orc_id);
    const events = [];

    // 1. Criação do orçamento
    const orc = db.prepare('SELECT criado_em, numero, cliente_nome FROM orcamentos WHERE id = ?').get(orc_id);
    if (orc) {
        events.push({ tipo: 'criacao', titulo: 'Orçamento criado', detalhe: orc.numero || `#${orc_id}`, data: orc.criado_em, icone: 'file' });
    }

    // 2. Geração do link portal
    const token = db.prepare('SELECT criado_em FROM portal_tokens WHERE orc_id = ? ORDER BY criado_em ASC LIMIT 1').get(orc_id);
    if (token) {
        events.push({ tipo: 'link', titulo: 'Link público gerado', detalhe: 'Portal do cliente ativado', data: token.criado_em, icone: 'link' });
    }

    // 3. Acessos (primeira visita, retornos, prints)
    const acessos = db.prepare(`
        SELECT acessado_em, dispositivo, navegador, cidade, estado, tempo_pagina, scroll_max, is_new_visit, evento_tipo, fingerprint
        FROM proposta_acessos WHERE orc_id = ? ORDER BY acessado_em ASC LIMIT 100
    `).all(orc_id);

    let visitCount = 0;
    for (const a of acessos) {
        if (a.evento_tipo === 'print') {
            events.push({ tipo: 'print', titulo: 'Proposta impressa/PDF', detalhe: `${a.dispositivo} · ${a.navegador}`, data: a.acessado_em, icone: 'printer' });
        } else if (a.is_new_visit) {
            visitCount++;
            const local = a.cidade ? `${a.cidade}${a.estado ? '/' + a.estado : ''}` : '';
            if (visitCount === 1) {
                events.push({ tipo: 'primeira_visita', titulo: 'Primeira visualização', detalhe: `${a.dispositivo} · ${a.navegador}${local ? ' · ' + local : ''}`, data: a.acessado_em, icone: 'eye' });
            } else {
                events.push({ tipo: 'retorno', titulo: `${visitCount}ª visita (retorno)`, detalhe: `${a.dispositivo}${local ? ' · ' + local : ''} · ${a.tempo_pagina || 0}s · ${a.scroll_max || 0}% scroll`, data: a.acessado_em, icone: 'refresh' });
            }
        }
    }

    // 4. Notificações de compartilhamento
    const shares = db.prepare(`
        SELECT criado_em, mensagem FROM notificacoes
        WHERE tipo = 'proposta_compartilhada' AND referencia_id = ?
        ORDER BY criado_em ASC
    `).all(orc_id);
    for (const s of shares) {
        events.push({ tipo: 'compartilhamento', titulo: 'Novo dispositivo detectado', detalhe: s.mensagem, data: s.criado_em, icone: 'share' });
    }

    // 5. Aprovação (se tiver mudado para 'ok')
    const aprovacao = db.prepare(`
        SELECT criado_em, mensagem FROM notificacoes
        WHERE tipo = 'orcamento_aprovado' AND referencia_id = ?
        ORDER BY criado_em ASC LIMIT 1
    `).get(orc_id);
    if (aprovacao) {
        events.push({ tipo: 'aprovacao', titulo: 'Proposta aprovada', detalhe: aprovacao.mensagem || '', data: aprovacao.criado_em, icone: 'check' });
    }

    // Ordenar cronologicamente
    events.sort((a, b) => new Date(a.data) - new Date(b.data));

    res.json({ events });
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
