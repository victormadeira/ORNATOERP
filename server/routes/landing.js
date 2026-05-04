import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { sendCAPIEvent } from '../services/meta-capi.js';
import sofiaProspeccao from '../services/sofia_prospeccao.js';
import { dispatchOutbound } from '../services/webhook_outbound.js';

const router = Router();

// ─── Sanitização contra XSS stored ───────────────────────────────────────
// Strip tags HTML, protocolos perigosos e caracteres de controle.
// Aplicado em campos de input público (referrer, utm_*, path, mensagem, etc.)
// que depois são renderizados no dashboard admin.
function stripHtml(value, maxLen = 500) {
    if (value == null) return '';
    let s = String(value);
    // Remove tags HTML completas
    s = s.replace(/<[^>]*>/g, '');
    // Neutraliza protocolos perigosos em URLs colocadas como texto
    s = s.replace(/(javascript|data|vbscript):/gi, 'blocked:');
    // Remove caracteres de controle (exceto tab/newline)
    s = s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
    return s.slice(0, maxLen);
}

// Webhook outbound agora centralizado em services/webhook_outbound.js
// (dispatchOutbound — reusa HMAC, timeout, log de falhas)

// ═══════════════════════════════════════════════════════
// GET /api/leads/config — dados públicos da empresa (sem auth)
// ═══════════════════════════════════════════════════════
router.get('/config', (req, res) => {
    // SELECT * para não quebrar quando novos campos são adicionados sem migração explícita
    const emp = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get();

    // Expõe apenas campos públicos — nunca retorna chaves de API, tokens, etc.
    const PUBLIC_FIELDS = [
        'nome','telefone','email','endereco','cidade','estado','uf',
        'proposta_cor_primaria','proposta_cor_accent',
        'logo_sistema','logo_header_path','proposta_sobre',
        'landing_ativo',
        'landing_titulo','landing_subtitulo','landing_descricao',
        'landing_cta_primaria','landing_cta_secundaria',
        'landing_form_titulo','landing_form_descricao',
        'landing_cta_titulo','landing_cta_descricao','landing_texto_rodape',
        'landing_prova_titulo','landing_provas_json',
        'landing_logo','landing_hero_imagem',
        'landing_hero_video_url','landing_hero_video_poster','landing_video_institucional',
        'landing_grafismo_imagem',
        'landing_cor_fundo','landing_cor_destaque','landing_cor_neutra','landing_cor_clara',
        'landing_servicos_json','landing_diferenciais_json','landing_etapas_json',
        'clarity_project_id',
        'instagram','facebook',
        'fb_pixel_id','google_ads_id',
        'anos_experiencia','projetos_entregues','maquinas_industriais',
        'texto_institucional','desc_maquinas',
        'portfolio_ativo','portfolio_logo','portfolio_tag',
        'portfolio_titulo','portfolio_subtitulo',
        'portfolio_cor_fundo','portfolio_cor_destaque',
        'portfolio_wa_mensagem','portfolio_footer_texto','portfolio_cta_texto',
    ];
    const safe = {};
    if (emp) PUBLIC_FIELDS.forEach(f => { if (f in emp) safe[f] = emp[f]; });

    res.json(Object.keys(safe).length ? safe : { nome: 'Marcenaria' });
});

// ═══════════════════════════════════════════════════════
// GET /api/leads/stats — números reais para landing (sem auth)
// ═══════════════════════════════════════════════════════
router.get('/stats', (req, res) => {
    try {
        const projetos = db.prepare("SELECT COUNT(*) as n FROM projetos WHERE status IN ('concluido','entregue','instalado')").get()?.n || 0;
        const clientes = db.prepare("SELECT COUNT(DISTINCT cliente_id) as n FROM orcamentos WHERE valor_venda > 0").get()?.n || 0;
        const ambientes = db.prepare("SELECT COUNT(*) as n FROM orcamento_ambientes").get()?.n || 0;
        const emp = db.prepare("SELECT anos_experiencia FROM empresa_config WHERE id = 1").get();
        const anos = emp?.anos_experiencia || 0;
        res.json({ projetos, clientes, ambientes, anos });
    } catch (err) {
        // Fallback: retornar zeros se tabelas não existem
        res.json({ projetos: 0, clientes: 0, ambientes: 0, anos: 0 });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/leads/origens — dashboard de atribuição (AUTH)
// Agrega visitas × conversões por utm_source/origem
// Query: ?dias=30 (default 30)
// ═══════════════════════════════════════════════════════
router.get('/origens', requireAuth, (req, res) => {
    try {
        const dias = Math.min(parseInt(req.query.dias || '30') || 30, 365);

        const resumo = db.prepare(`
            SELECT
                COALESCE(NULLIF(utm_source, ''), 'direto') as origem,
                COUNT(*) as visitas,
                SUM(CASE WHEN cliente_id IS NOT NULL THEN 1 ELSE 0 END) as leads,
                COUNT(DISTINCT CASE WHEN cliente_id IS NOT NULL THEN cliente_id END) as leads_unicos
            FROM landing_visitas
            WHERE criado_em >= datetime('now', '-' || ? || ' days')
            GROUP BY origem
            ORDER BY visitas DESC
        `).all(dias);

        const porOrigem = resumo.map(r => {
            let fechados = 0, faturamento = 0;
            try {
                const fech = db.prepare(`
                    SELECT COUNT(DISTINCT o.id) as qtd, COALESCE(SUM(o.valor_venda), 0) as total
                    FROM orcamentos o
                    JOIN landing_visitas v ON v.cliente_id = o.cliente_id
                    WHERE v.criado_em >= datetime('now', '-' || ? || ' days')
                      AND COALESCE(NULLIF(v.utm_source, ''), 'direto') = ?
                      AND o.status_proposta = 'aprovada'
                `).get(dias, r.origem);
                fechados = fech?.qtd || 0;
                faturamento = fech?.total || 0;
            } catch (_) {}

            const taxaLead = r.visitas > 0 ? (r.leads / r.visitas * 100) : 0;
            const taxaFech = r.leads_unicos > 0 ? (fechados / r.leads_unicos * 100) : 0;
            return {
                origem: r.origem,
                visitas: r.visitas,
                leads: r.leads,
                leads_unicos: r.leads_unicos,
                fechados,
                faturamento,
                taxa_lead: Math.round(taxaLead * 10) / 10,
                taxa_fechamento: Math.round(taxaFech * 10) / 10,
            };
        });

        const totais = {
            visitas: porOrigem.reduce((a, x) => a + x.visitas, 0),
            leads: porOrigem.reduce((a, x) => a + x.leads, 0),
            leads_unicos: porOrigem.reduce((a, x) => a + x.leads_unicos, 0),
            fechados: porOrigem.reduce((a, x) => a + x.fechados, 0),
            faturamento: porOrigem.reduce((a, x) => a + x.faturamento, 0),
        };
        totais.taxa_lead = totais.visitas > 0 ? Math.round((totais.leads / totais.visitas) * 1000) / 10 : 0;
        totais.taxa_fechamento = totais.leads_unicos > 0 ? Math.round((totais.fechados / totais.leads_unicos) * 1000) / 10 : 0;

        res.json({ dias, totais, por_origem: porOrigem });
    } catch (err) {
        console.error('[Landing] Erro origens:', err.message);
        res.status(500).json({ error: 'Erro ao agregar origens' });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/leads/visita — registra pageview (PÚBLICO)
// ═══════════════════════════════════════════════════════
router.post('/visita', (req, res) => {
    try {
        const {
            path, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            gclid, fbclid, referrer,
        } = req.body || {};

        const ua = String(req.get('user-agent') || '').slice(0, 500);
        const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '').slice(0, 64);
        const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32) : '';
        const sessionId = crypto.randomBytes(12).toString('hex');

        const r = db.prepare(`
            INSERT INTO landing_visitas
                (session_id, path, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid, referrer, user_agent, ip_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            sessionId,
            stripHtml(path, 200),
            stripHtml(utm_source, 80),
            stripHtml(utm_medium, 80),
            stripHtml(utm_campaign, 120),
            stripHtml(utm_term, 120),
            stripHtml(utm_content, 120),
            stripHtml(gclid, 120),
            stripHtml(fbclid, 120),
            stripHtml(referrer, 300),
            stripHtml(ua, 500),
            ipHash,
        );
        res.json({ visit_id: r.lastInsertRowid, session_id: sessionId });
    } catch (err) {
        console.error('[Landing] Erro visita:', err.message);
        res.json({ visit_id: null });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/leads/captura — captação de lead (PÚBLICO, sem auth)
// ═══════════════════════════════════════════════════════
router.post('/captura', (req, res) => {
    const raw = req.body || {};
    // Sanitiza TODOS os campos textuais (renderizados em dashboard admin / propostas)
    const nome = stripHtml(raw.nome, 200);
    const telefone = stripHtml(raw.telefone, 40);
    const email = stripHtml(raw.email, 200);
    const tipo_projeto = stripHtml(raw.tipo_projeto, 100);
    const ambiente = stripHtml(raw.ambiente, 100);
    const faixa_investimento = stripHtml(raw.faixa_investimento, 100);
    const mensagem = stripHtml(raw.mensagem, 2000);
    const estagio = stripHtml(raw.estagio, 100);
    const bairro = stripHtml(raw.bairro, 120);
    const utm_source = stripHtml(raw.utm_source, 80);
    const utm_medium = stripHtml(raw.utm_medium, 80);
    const utm_campaign = stripHtml(raw.utm_campaign, 120);
    const utm_term = stripHtml(raw.utm_term, 120);
    const utm_content = stripHtml(raw.utm_content, 120);
    const gclid = stripHtml(raw.gclid, 120);
    const fbclid = stripHtml(raw.fbclid, 120);
    const referrer = stripHtml(raw.referrer, 300);
    const origemParam = stripHtml(raw.origem, 100);
    const visit_id = raw.visit_id;
    // ambiente é o campo novo (dropdown "qual ambiente?"), tipo_projeto é compat legado
    const ambienteReal = ambiente || tipo_projeto || 'Consulta';

    if (!nome || !telefone) {
        return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }

    try {
        // Pegar admin user para vincular
        const admin = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
        const userId = admin?.id || 1;

        // Verificar se cliente já existe pelo telefone
        const telLimpo = telefone.replace(/\D/g, '');
        let cliente = null;
        try {
            cliente = db.prepare('SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(tel, "(", ""), ")", ""), "-", ""), " ", "") = ?').get(telLimpo);
        } catch (_) {
            // Fallback: busca simples
            cliente = db.prepare('SELECT id FROM clientes WHERE tel = ?').get(telefone);
        }

        if (!cliente) {
            // Criar cliente novo
            try {
                const r = db.prepare(`
                    INSERT INTO clientes (user_id, nome, tel, email, origem, utm_source, utm_medium, utm_campaign, data_captacao)
                    VALUES (?, ?, ?, ?, 'landing_page', ?, ?, ?, CURRENT_TIMESTAMP)
                `).run(userId, nome, telefone, email || '', utm_source || '', utm_medium || '', utm_campaign || '');
                cliente = { id: r.lastInsertRowid };
            } catch (_) {
                // Fallback sem campos de origem (caso migração ainda não rodou)
                const r = db.prepare(`
                    INSERT INTO clientes (user_id, nome, tel, email)
                    VALUES (?, ?, ?, ?)
                `).run(userId, nome, telefone, email || '');
                cliente = { id: r.lastInsertRowid };
            }
        }

        // Gerar número do orçamento
        const ano = new Date().getFullYear();
        const maxNum = db.prepare('SELECT MAX(CAST(SUBSTR(numero, -5) AS INTEGER)) as n FROM orcamentos WHERE numero LIKE ? AND tipo = ?').get(`ORN-${ano}-%`, 'original');
        const nextNum = (maxNum?.n || 0) + 1;
        const numero = `ORN-${ano}-${String(nextNum).padStart(5, '0')}`;

        // Criar orçamento como lead
        // Atribuição extra (não persiste em colunas próprias — vai no obs pra virar texto consultável)
        const utmExtra = [utm_term, utm_content].filter(Boolean).join('/');
        const clickIds = [gclid ? `gclid=${gclid}` : '', fbclid ? `fbclid=${fbclid}` : ''].filter(Boolean).join(' ');
        const obsText = [
            ambienteReal !== 'Consulta' ? `Ambiente: ${ambienteReal}` : '',
            estagio ? `Estágio do imóvel: ${estagio}` : '',
            bairro ? `Bairro: ${bairro}` : '',
            faixa_investimento ? `Faixa de investimento: ${faixa_investimento}` : '',
            mensagem ? `Mensagem: ${mensagem}` : '',
            `Origem: ${origemParam || 'Landing Page'}`,
            utm_source ? `UTM: ${utm_source}/${utm_medium || ''}/${utm_campaign || ''}${utmExtra ? `/${utmExtra}` : ''}` : '',
            clickIds || '',
            referrer ? `Referrer: ${referrer}` : '',
        ].filter(Boolean).join('\n');

        const orc = db.prepare(`
            INSERT INTO orcamentos (user_id, cliente_id, cliente_nome, ambiente, numero, kb_col, obs, mods_json, valor_venda, custo_material)
            VALUES (?, ?, ?, ?, ?, 'lead', ?, '{}', 0, 0)
        `).run(userId, cliente.id, nome, ambienteReal, numero, obsText);

        // Log da automação
        db.prepare(`
            INSERT INTO automacoes_log (tipo, referencia_id, referencia_tipo, descricao, status)
            VALUES ('lead_captado', ?, 'cliente', ?, 'sucesso')
        `).run(cliente.id, `Lead captado via landing page: ${nome} (${telefone})`);

        // ── Linkar visita → cliente (atribuição) ──
        if (visit_id) {
            try {
                db.prepare('UPDATE landing_visitas SET cliente_id = ? WHERE id = ? AND cliente_id IS NULL').run(cliente.id, parseInt(visit_id));
            } catch (_) {}
        }

        // ── Notificação em tempo real no dashboard (WebSocket) ──
        try {
            const wsBroadcast = req.app.locals.wsBroadcast;
            if (typeof wsBroadcast === 'function') {
                wsBroadcast('novo_lead', {
                    nome,
                    telefone,
                    ambiente: ambienteReal,
                    origem: origemParam || 'landing_page',
                    orc_id: orc.lastInsertRowid,
                    cliente_id: cliente.id,
                });
            }
        } catch (_) {}

        // ── Meta CAPI: Lead (server-side, imune a ad blockers e iOS 14+) ──
        sendCAPIEvent({
            eventName:  'Lead',
            userData:   { phone: telefone, email: email || '' },
            customData: { content_name: ambienteReal },
            sourceUrl:  process.env.PUBLIC_URL || '',
            eventId:    `lead_${orc.lastInsertRowid}`,
        }).catch(() => {});

        // ── Webhook outbound (n8n / Zapier / Make) ──
        dispatchOutbound('lead_captado', {
            lead: {
                cliente_id: cliente.id,
                orc_id: orc.lastInsertRowid,
                numero: numero,
                nome, telefone, email: email || '',
                ambiente: ambienteReal,
                estagio: estagio || '',
                bairro:  bairro  || '',
                faixa_investimento: faixa_investimento || '',
                mensagem: mensagem || '',
            },
            attrib: {
                origem: origemParam || 'landing_page',
                utm_source: utm_source || '', utm_medium: utm_medium || '',
                utm_campaign: utm_campaign || '', utm_term: utm_term || '',
                utm_content: utm_content || '',
                gclid: gclid || '', fbclid: fbclid || '',
                referrer: referrer || '',
            },
        }).catch(() => {});

        // ── WhatsApp: boas-vindas ao lead + alerta ao dono ──
        try {
            const emp = db.prepare('SELECT wa_instance_url, wa_instance_name, wa_api_key, nome, telefone AS tel_empresa FROM empresa_config WHERE id = 1').get();
            if (emp?.wa_instance_url && emp?.wa_api_key) {
                const phoneClean = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`;
                // fetch fire-and-forget com timeout de 5s — se Evolution travar,
                // não acumula promises pendentes nem bloqueia outros leads.
                const fetchEvolution = (body) => {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 5000);
                    return fetch(`${emp.wa_instance_url}/message/sendText/${emp.wa_instance_name}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', apikey: emp.wa_api_key },
                        body: JSON.stringify(body),
                        signal: ctrl.signal,
                    })
                        .catch(err => console.warn('[landing/captura] Evolution fetch falhou:', err.message))
                        .finally(() => clearTimeout(timer));
                };

                // 1. Mensagem de boas-vindas ao lead
                fetchEvolution({
                    number: phoneClean,
                    text: `Olá ${nome.split(' ')[0]}! 👋\n\nRecebemos seu contato na *${emp.nome || 'nossa marcenaria'}*.\n\nEm breve um de nossos consultores entrará em contato. 🪵`,
                });

                // 2. Alerta ao dono (telefone da empresa configurado)
                const telEmpresa = (emp.tel_empresa || '').replace(/\D/g, '');
                if (telEmpresa) {
                    const donoDest = telEmpresa.startsWith('55') ? telEmpresa : `55${telEmpresa}`;
                    const ambienteInfo = ambienteReal !== 'Consulta' ? `\n🏠 *Ambiente:* ${ambienteReal}` : '';
                    const estagioInfo  = estagio ? `\n🏗️ *Estágio:* ${estagio}` : '';
                    const bairroInfo   = bairro  ? `\n📌 *Bairro:* ${bairro}`   : '';
                    fetchEvolution({
                        number: donoDest,
                        text: `🔔 *Novo lead via site!*\n\n👤 *Nome:* ${nome}\n📱 *Telefone:* ${telefone}${ambienteInfo}${estagioInfo}${bairroInfo}\n📍 *Origem:* ${origemParam || 'landing_page'}\n\nAcesse o sistema para atender! 🚀`,
                    });
                }
            }
        } catch (_) {}

        // ── Sofia Prospect: agendar prospecção ativa (se habilitada) ──
        try {
            sofiaProspeccao.agendarProspeccaoInicial(cliente.id, {
                ambiente: ambienteReal !== 'Consulta' ? ambienteReal : '',
                bairro: bairro || '',
                estagio: estagio || '',
                faixa_investimento: faixa_investimento || '',
                mensagem: mensagem || '',
            });
        } catch (_) { /* fire-and-forget */ }

        res.json({ ok: true, cliente_id: cliente.id, orc_id: orc.lastInsertRowid });

    } catch (err) {
        console.error('Erro captura lead:', err);
        res.status(500).json({ error: 'Erro ao registrar contato' });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/leads/facebook — webhook Meta Lead Ads
// Valida assinatura HMAC-SHA256 (header x-hub-signature-256) usando o
// app_secret configurado em empresa_config.fb_app_secret. Se app_secret
// não estiver configurado ainda, cai no fluxo legado de token (dev/setup),
// mas em produção deve sempre ser preenchido.
// ═══════════════════════════════════════════════════════
router.post('/facebook', (req, res) => {
    const emp = db.prepare('SELECT wa_webhook_token, fb_app_secret FROM empresa_config WHERE id = 1').get();
    const appSecret = emp?.fb_app_secret;
    if (appSecret) {
        const sig = String(req.headers['x-hub-signature-256'] || '');
        if (!sig.startsWith('sha256=') || !req.rawBody) {
            return res.status(401).json({ error: 'Assinatura ausente' });
        }
        const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return res.status(401).json({ error: 'Assinatura inválida' });
        }
    } else {
        // Fallback legado (somente até o app_secret ser configurado): token via querystring/header
        const token = req.query.token || req.headers['x-webhook-token'];
        if (emp?.wa_webhook_token && token !== emp.wa_webhook_token) {
            return res.status(401).json({ error: 'Token inválido' });
        }
    }

    try {
        const { entry } = req.body;
        if (!entry || !Array.isArray(entry)) {
            return res.json({ ok: true, msg: 'No entries' });
        }

        const admin = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
        const userId = admin?.id || 1;

        for (const e of entry) {
            const changes = e.changes || [];
            for (const change of changes) {
                const value = change.value || {};
                const data = value.field_data || [];

                let nome = '', telefone = '', email = '';
                for (const field of data) {
                    if (field.name === 'full_name' || field.name === 'nome') nome = field.values?.[0] || '';
                    if (field.name === 'phone_number' || field.name === 'telefone') telefone = field.values?.[0] || '';
                    if (field.name === 'email') email = field.values?.[0] || '';
                }

                if (!nome && !telefone) continue;

                const telLimpo = telefone.replace(/\D/g, '');
                let cliente = null;
                if (telLimpo) {
                    try { cliente = db.prepare('SELECT id FROM clientes WHERE tel = ?').get(telefone); } catch (_) {}
                }

                if (!cliente) {
                    try {
                        const r = db.prepare(`
                            INSERT INTO clientes (user_id, nome, tel, email, origem, utm_source, data_captacao)
                            VALUES (?, ?, ?, ?, 'facebook', 'meta_lead_ads', CURRENT_TIMESTAMP)
                        `).run(userId, nome || 'Lead Facebook', telefone, email || '');
                        cliente = { id: r.lastInsertRowid };
                    } catch (_) {
                        const r = db.prepare(`INSERT INTO clientes (user_id, nome, tel, email) VALUES (?, ?, ?, ?)`).run(userId, nome || 'Lead Facebook', telefone, email || '');
                        cliente = { id: r.lastInsertRowid };
                    }
                }

                const ano = new Date().getFullYear();
                const maxNum = db.prepare('SELECT MAX(CAST(SUBSTR(numero, -5) AS INTEGER)) as n FROM orcamentos WHERE numero LIKE ? AND tipo = ?').get(`ORN-${ano}-%`, 'original');
                const nextNum = (maxNum?.n || 0) + 1;
                const numero = `ORN-${ano}-${String(nextNum).padStart(5, '0')}`;

                db.prepare(`
                    INSERT INTO orcamentos (user_id, cliente_id, cliente_nome, ambiente, numero, kb_col, obs, mods_json, valor_venda, custo_material)
                    VALUES (?, ?, ?, 'Consulta', ?, 'lead', 'Lead captado via Facebook Lead Ads', '{}', 0, 0)
                `).run(userId, cliente.id, nome || 'Lead Facebook', numero);

                db.prepare(`
                    INSERT INTO automacoes_log (tipo, referencia_id, referencia_tipo, descricao, status)
                    VALUES ('lead_facebook', ?, 'cliente', ?, 'sucesso')
                `).run(cliente.id, `Lead captado via Facebook: ${nome} (${telefone})`);
            }
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('Erro webhook Facebook:', err);
        res.status(500).json({ error: 'Erro ao processar webhook' });
    }
});

// GET /api/leads/facebook — verificação do webhook Meta
router.get('/facebook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const emp = db.prepare('SELECT wa_webhook_token FROM empresa_config WHERE id = 1').get();
    if (mode === 'subscribe' && token === (emp?.wa_webhook_token || '')) {
        return res.status(200).send(challenge);
    }
    res.status(403).json({ error: 'Verification failed' });
});

// ═══════════════════════════════════════════════════════
// GET /api/leads/stats — estatísticas de leads (com auth)
// ═══════════════════════════════════════════════════════
router.get('/stats', requireAuth, (req, res) => {
    const totalPorOrigem = db.prepare(`
        SELECT COALESCE(origem, 'manual') as origem, COUNT(*) as total
        FROM clientes GROUP BY origem ORDER BY total DESC
    `).all();

    const leadsEsteMes = db.prepare(`
        SELECT COUNT(*) as total FROM clientes
        WHERE strftime('%Y-%m', data_captacao) = strftime('%Y-%m', 'now')
    `).get();

    const conversionFunnel = db.prepare(`
        SELECT kb_col, COUNT(*) as qtd, COALESCE(SUM(valor_venda), 0) as valor
        FROM orcamentos WHERE kb_col NOT IN ('arquivo', 'perdido')
        GROUP BY kb_col
    `).all();

    const ticketMedioOrigem = db.prepare(`
        SELECT c.origem, AVG(o.valor_venda) as ticket_medio, COUNT(*) as qtd
        FROM orcamentos o
        JOIN clientes c ON c.id = o.cliente_id
        WHERE o.kb_col = 'ok' AND o.valor_venda > 0
        GROUP BY c.origem
    `).all();

    res.json({
        por_origem: totalPorOrigem,
        leads_este_mes: leadsEsteMes?.total || 0,
        funil: conversionFunnel,
        ticket_medio: ticketMedioOrigem,
    });
});

export default router;
