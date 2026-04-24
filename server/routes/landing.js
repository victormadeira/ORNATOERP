import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { sendCAPIEvent } from '../services/meta-capi.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/leads/config — dados públicos da empresa (sem auth)
// ═══════════════════════════════════════════════════════
router.get('/config', (req, res) => {
    const emp = db.prepare(`
        SELECT nome, telefone, email, endereco, cidade,
               proposta_cor_primaria, proposta_cor_accent,
               logo_sistema, proposta_sobre,
               landing_ativo,
               landing_titulo, landing_subtitulo, landing_descricao,
               landing_cta_primaria, landing_cta_secundaria,
               landing_form_titulo, landing_form_descricao,
               landing_cta_titulo, landing_cta_descricao, landing_texto_rodape,
               landing_prova_titulo, landing_provas_json,
               landing_logo,
               landing_hero_imagem,
               landing_hero_video_url, landing_hero_video_poster,
               landing_grafismo_imagem,
               landing_cor_fundo, landing_cor_destaque, landing_cor_neutra, landing_cor_clara,
               landing_servicos_json, landing_diferenciais_json, landing_etapas_json,
               clarity_project_id,
               instagram, facebook,
               fb_pixel_id, google_ads_id
        FROM empresa_config WHERE id = 1
    `).get();

    res.json(emp || { nome: 'Marcenaria' });
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
// POST /api/leads/captura — captação de lead (PÚBLICO, sem auth)
// ═══════════════════════════════════════════════════════
router.post('/captura', (req, res) => {
    const { nome, telefone, email, tipo_projeto, ambiente, faixa_investimento, mensagem,
            utm_source, utm_medium, utm_campaign, origem: origemParam } = req.body;
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
        const obsText = [
            ambienteReal !== 'Consulta' ? `Ambiente: ${ambienteReal}` : '',
            faixa_investimento ? `Faixa de investimento: ${faixa_investimento}` : '',
            mensagem ? `Mensagem: ${mensagem}` : '',
            `Origem: ${origemParam || 'Landing Page'}`,
            utm_source ? `UTM: ${utm_source}/${utm_medium || ''}/${utm_campaign || ''}` : '',
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

        // ── WhatsApp: boas-vindas ao lead + alerta ao dono ──
        try {
            const emp = db.prepare('SELECT wa_instance_url, wa_instance_name, wa_api_key, nome, telefone AS tel_empresa FROM empresa_config WHERE id = 1').get();
            if (emp?.wa_instance_url && emp?.wa_api_key) {
                const phoneClean = telLimpo.startsWith('55') ? telLimpo : `55${telLimpo}`;

                // 1. Mensagem de boas-vindas ao lead
                fetch(`${emp.wa_instance_url}/message/sendText/${emp.wa_instance_name}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: emp.wa_api_key },
                    body: JSON.stringify({
                        number: phoneClean,
                        text: `Olá ${nome.split(' ')[0]}! 👋\n\nRecebemos seu contato na *${emp.nome || 'nossa marcenaria'}*.\n\nEm breve um de nossos consultores entrará em contato. 🪵`,
                    }),
                }).catch(() => {});

                // 2. Alerta ao dono (telefone da empresa configurado)
                const telEmpresa = (emp.tel_empresa || '').replace(/\D/g, '');
                if (telEmpresa) {
                    const donoDest = telEmpresa.startsWith('55') ? telEmpresa : `55${telEmpresa}`;
                    const ambienteInfo = ambienteReal !== 'Consulta' ? `\n🏠 *Ambiente:* ${ambienteReal}` : '';
                    fetch(`${emp.wa_instance_url}/message/sendText/${emp.wa_instance_name}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', apikey: emp.wa_api_key },
                        body: JSON.stringify({
                            number: donoDest,
                            text: `🔔 *Novo lead via site!*\n\n👤 *Nome:* ${nome}\n📱 *Telefone:* ${telefone}${ambienteInfo}\n📍 *Origem:* ${origemParam || 'landing_page'}\n\nAcesse o sistema para atender! 🚀`,
                        }),
                    }).catch(() => {});
                }
            }
        } catch (_) {}

        res.json({ ok: true, cliente_id: cliente.id, orc_id: orc.lastInsertRowid });

    } catch (err) {
        console.error('Erro captura lead:', err);
        res.status(500).json({ error: 'Erro ao registrar contato' });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/leads/facebook — webhook Meta Lead Ads
// ═══════════════════════════════════════════════════════
router.post('/facebook', (req, res) => {
    // Verificar token
    const emp = db.prepare('SELECT wa_webhook_token FROM empresa_config WHERE id = 1').get();
    const token = req.query.token || req.headers['x-webhook-token'];
    if (emp?.wa_webhook_token && token !== emp.wa_webhook_token) {
        return res.status(401).json({ error: 'Token inválido' });
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
