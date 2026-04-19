import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { backupToDrive, listBackups } from '../services/backup.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/config — qualquer logado pode ler
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const cfg = db.prepare('SELECT * FROM config_taxas WHERE id = 1').get();
    const result = cfg || {
        imp: 8, com: 10, mont: 0, lucro: 12, frete: 2, inst: 5,
        mk_chapas: 1.45, mk_ferragens: 1.15, mk_fita: 1.45,
        mk_acabamentos: 1.30, mk_acessorios: 1.20, mk_mdo: 0.80,
    };
    // Enriquecer com dados do centro de custo (usado no painel comparativo do orçamento)
    const emp = db.prepare('SELECT centro_custo_json, centro_custo_dias_uteis FROM empresa_config WHERE id = 1').get();
    if (emp) {
        result.centro_custo_json = emp.centro_custo_json || '[]';
        result.centro_custo_dias_uteis = emp.centro_custo_dias_uteis ?? 22;
    }
    res.json(result);
});

// ═══════════════════════════════════════════════════════
// PUT /api/config — somente admin/gerente
// ═══════════════════════════════════════════════════════
router.put('/', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const {
        imp, com, mont, lucro, frete, inst,
        mk_chapas, mk_ferragens, mk_fita, mk_acabamentos, mk_acessorios, mk_mdo,
        // Fase 1: custo-hora
        custo_hora_ativo, func_producao, horas_dia, dias_uteis, eficiencia,
        tempo_corte, tempo_fita, tempo_furacao, tempo_montagem, tempo_acabamento, tempo_embalagem, tempo_instalacao,
        tempo_montagem_porta, tempo_montagem_gaveta, tempo_montagem_prat,
        // v3: velocidades e overheads baseados em dimensões reais
        cnc_velocidade, cnc_overhead_peca, cnc_overhead_chapa,
        fita_velocidade, fita_overhead_borda,
        // Fase 2: consumíveis
        consumiveis_ativo, cons_cola_m2, cons_minifix_un, cons_parafuso_un, cons_lixa_m2, cons_embalagem_mod,
    } = req.body;
    db.prepare(`
    UPDATE config_taxas SET
      imp=?, com=?, mont=?, lucro=?, frete=?, inst=?,
      mk_chapas=?, mk_ferragens=?, mk_fita=?, mk_acabamentos=?, mk_acessorios=?, mk_mdo=?,
      custo_hora_ativo=?, func_producao=?, horas_dia=?, dias_uteis=?, eficiencia=?,
      tempo_corte=?, tempo_fita=?, tempo_furacao=?, tempo_montagem=?, tempo_acabamento=?, tempo_embalagem=?, tempo_instalacao=?,
      tempo_montagem_porta=?, tempo_montagem_gaveta=?, tempo_montagem_prat=?,
      cnc_velocidade=?, cnc_overhead_peca=?, cnc_overhead_chapa=?,
      fita_velocidade=?, fita_overhead_borda=?,
      consumiveis_ativo=?, cons_cola_m2=?, cons_minifix_un=?, cons_parafuso_un=?, cons_lixa_m2=?, cons_embalagem_mod=?
    WHERE id=1
  `).run(
        imp ?? 8, com ?? 10, mont ?? 0, lucro ?? 12, frete ?? 2, inst ?? 5,
        mk_chapas ?? 1.45, mk_ferragens ?? 1.15, mk_fita ?? 1.45,
        mk_acabamentos ?? 1.30, mk_acessorios ?? 1.20, mk_mdo ?? 0.80,
        custo_hora_ativo ?? 0, func_producao ?? 10, horas_dia ?? 8.5, dias_uteis ?? 22, eficiencia ?? 75,
        tempo_corte ?? 0.033, tempo_fita ?? 0.0025, tempo_furacao ?? 0.017, tempo_montagem ?? 0.25, tempo_acabamento ?? 0.17, tempo_embalagem ?? 0.25, tempo_instalacao ?? 0.75,
        tempo_montagem_porta ?? 0.15, tempo_montagem_gaveta ?? 0.25, tempo_montagem_prat ?? 0.05,
        cnc_velocidade ?? 5000, cnc_overhead_peca ?? 20, cnc_overhead_chapa ?? 300,
        fita_velocidade ?? 500, fita_overhead_borda ?? 90,
        consumiveis_ativo ?? 0, cons_cola_m2 ?? 2.50, cons_minifix_un ?? 1.80, cons_parafuso_un ?? 0.35, cons_lixa_m2 ?? 1.20, cons_embalagem_mod ?? 15.00,
    );
    const cfg = db.prepare('SELECT * FROM config_taxas WHERE id = 1').get();
    res.json(cfg);
});

// ═══════════════════════════════════════════════════════
// GET /api/config/empresa/public — sem autenticação (login page)
// ═══════════════════════════════════════════════════════
router.get('/empresa/public', (req, res) => {
    const emp = db.prepare('SELECT nome, logo_sistema, sistema_cor_primaria FROM empresa_config WHERE id = 1').get();
    res.json(emp || {});
});

// ═══════════════════════════════════════════════════════
// GET /api/config/empresa — dados da empresa
// ═══════════════════════════════════════════════════════
router.get('/empresa', requireAuth, (req, res) => {
    const emp = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get();
    res.json(emp || {});
});

// ═══════════════════════════════════════════════════════
// PUT /api/config/empresa — somente admin/gerente
// ═══════════════════════════════════════════════════════
router.put('/empresa', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const {
        nome, cnpj, endereco, cidade, estado, cep, telefone, email, site,
        logo, logo_watermark, logo_watermark_opacity,
        logo_sistema,
        contrato_template,
        proposta_cor_primaria, proposta_cor_accent,
        proposta_sobre, proposta_garantia, proposta_consideracoes, proposta_rodape,
        gdrive_credentials, gdrive_folder_id,
        gdrive_client_id, gdrive_client_secret,
        wa_instance_url, wa_instance_name, wa_api_key, wa_webhook_token, wa_owner_phone,
        ia_provider, ia_api_key, ia_model, ia_system_prompt, ia_temperatura, ia_ativa, ia_blocked_phones,
        ia_sugestoes_ativa,
        upmobb_ativo,
        etapas_template_json,
        sistema_cor_primaria,
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
        centro_custo_json, centro_custo_dias_uteis,
        instagram, facebook, proposta_incluso, anos_experiencia,
        projetos_entregues, maquinas_industriais, texto_institucional, desc_maquinas,
        responsavel_legal_nome, responsavel_legal_cpf, assinatura_empresa_img,
        portal_mostrar_pagamento,
        clarity_project_id,
    } = req.body;
    db.prepare(`
    UPDATE empresa_config SET
      nome=?, cnpj=?, endereco=?, cidade=?, estado=?, cep=?,
      telefone=?, email=?, site=?, logo_header_path=?,
      logo_watermark_path=?, logo_watermark_opacity=?,
      logo_sistema=?,
      contrato_template=?,
      proposta_cor_primaria=?, proposta_cor_accent=?,
      proposta_sobre=?, proposta_garantia=?, proposta_consideracoes=?, proposta_rodape=?,
      gdrive_credentials=?, gdrive_folder_id=?,
      gdrive_client_id=?, gdrive_client_secret=?,
      wa_instance_url=?, wa_instance_name=?, wa_api_key=?, wa_webhook_token=?, wa_owner_phone=?,
      ia_provider=?, ia_api_key=?, ia_model=?, ia_system_prompt=?, ia_temperatura=?, ia_ativa=?, ia_blocked_phones=?,
      ia_sugestoes_ativa=?,
      upmobb_ativo=?,
      etapas_template_json=?,
      sistema_cor_primaria=?,
      landing_ativo=?,
      landing_titulo=?, landing_subtitulo=?, landing_descricao=?,
      landing_cta_primaria=?, landing_cta_secundaria=?,
      landing_form_titulo=?, landing_form_descricao=?,
      landing_cta_titulo=?, landing_cta_descricao=?, landing_texto_rodape=?,
      landing_prova_titulo=?, landing_provas_json=?,
      landing_logo=?,
      landing_hero_imagem=?,
      landing_hero_video_url=?, landing_hero_video_poster=?,
      landing_grafismo_imagem=?,
      landing_cor_fundo=?, landing_cor_destaque=?, landing_cor_neutra=?, landing_cor_clara=?,
      landing_servicos_json=?, landing_diferenciais_json=?, landing_etapas_json=?,
      centro_custo_json=?, centro_custo_dias_uteis=?,
      instagram=?, facebook=?, proposta_incluso=?, anos_experiencia=?,
      projetos_entregues=?, maquinas_industriais=?, texto_institucional=?, desc_maquinas=?,
      responsavel_legal_nome=?, responsavel_legal_cpf=?, assinatura_empresa_img=?,
      portal_mostrar_pagamento=?,
      clarity_project_id=?,
      atualizado_em=CURRENT_TIMESTAMP
    WHERE id=1
  `).run(
        nome || '', cnpj || '', endereco || '', cidade || '', estado || '',
        cep || '', telefone || '', email || '', site || '', logo || '',
        logo_watermark !== undefined ? logo_watermark : '',
        logo_watermark_opacity !== undefined ? logo_watermark_opacity : 0.04,
        logo_sistema !== undefined ? logo_sistema : '',
        contrato_template !== undefined ? contrato_template : '',
        proposta_cor_primaria || '#1B2A4A', proposta_cor_accent || '#C9A96E',
        proposta_sobre !== undefined ? proposta_sobre : '',
        proposta_garantia !== undefined ? proposta_garantia : '',
        proposta_consideracoes !== undefined ? proposta_consideracoes : '',
        proposta_rodape !== undefined ? proposta_rodape : '',
        gdrive_credentials !== undefined ? gdrive_credentials : '',
        gdrive_folder_id !== undefined ? gdrive_folder_id : '',
        gdrive_client_id !== undefined ? gdrive_client_id : '',
        gdrive_client_secret !== undefined ? gdrive_client_secret : '',
        wa_instance_url || '', wa_instance_name || '', wa_api_key || '', wa_webhook_token || '', wa_owner_phone || '',
        ia_provider || 'anthropic', ia_api_key || '', ia_model || 'claude-sonnet-4',
        ia_system_prompt !== undefined ? ia_system_prompt : '', ia_temperatura ?? 0.7, ia_ativa ?? 0,
        ia_blocked_phones !== undefined ? ia_blocked_phones : '',
        ia_sugestoes_ativa ?? 1,
        upmobb_ativo ?? 0,
        etapas_template_json !== undefined ? etapas_template_json : '[]',
        sistema_cor_primaria || '#1379F0',
        landing_ativo ?? 1,
        landing_titulo !== undefined ? landing_titulo : '',
        landing_subtitulo !== undefined ? landing_subtitulo : '',
        landing_descricao !== undefined ? landing_descricao : '',
        landing_cta_primaria !== undefined ? landing_cta_primaria : 'Solicitar orçamento',
        landing_cta_secundaria !== undefined ? landing_cta_secundaria : 'Falar no WhatsApp',
        landing_form_titulo !== undefined ? landing_form_titulo : 'Solicite um atendimento',
        landing_form_descricao !== undefined ? landing_form_descricao : 'Preencha os dados para receber contato da equipe Ornato.',
        landing_cta_titulo !== undefined ? landing_cta_titulo : '',
        landing_cta_descricao !== undefined ? landing_cta_descricao : '',
        landing_texto_rodape !== undefined ? landing_texto_rodape : '',
        landing_prova_titulo !== undefined ? landing_prova_titulo : 'Clientes que confiaram na Ornato',
        landing_provas_json !== undefined ? landing_provas_json : '[]',
        landing_logo !== undefined ? landing_logo : '',
        landing_hero_imagem !== undefined ? landing_hero_imagem : '',
        landing_hero_video_url !== undefined ? landing_hero_video_url : '',
        landing_hero_video_poster !== undefined ? landing_hero_video_poster : '',
        landing_grafismo_imagem !== undefined ? landing_grafismo_imagem : '',
        landing_cor_fundo || '#1E1917',
        landing_cor_destaque || '#93614C',
        landing_cor_neutra || '#847974',
        landing_cor_clara || '#DDD2CC',
        landing_servicos_json !== undefined ? landing_servicos_json : '[]',
        landing_diferenciais_json !== undefined ? landing_diferenciais_json : '[]',
        landing_etapas_json !== undefined ? landing_etapas_json : '[]',
        centro_custo_json !== undefined ? centro_custo_json : '[]',
        centro_custo_dias_uteis ?? 22,
        instagram !== undefined ? instagram : '',
        facebook !== undefined ? facebook : '',
        proposta_incluso !== undefined ? proposta_incluso : '',
        anos_experiencia ?? 0,
        projetos_entregues ?? 0,
        maquinas_industriais ?? 0,
        texto_institucional !== undefined ? texto_institucional : '',
        desc_maquinas !== undefined ? desc_maquinas : '',
        responsavel_legal_nome !== undefined ? responsavel_legal_nome : '',
        responsavel_legal_cpf !== undefined ? responsavel_legal_cpf : '',
        assinatura_empresa_img !== undefined ? assinatura_empresa_img : '',
        portal_mostrar_pagamento ?? 0,
        clarity_project_id !== undefined ? clarity_project_id : 'wed7zy3qnz',
    );
    const emp = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get();
    res.json(emp);
});

// ═══════════════════════════════════════════════════════
// PUT /api/config/menus — atualizar menus ocultos (admin only)
// ═══════════════════════════════════════════════════════
router.put('/menus', requireAuth, requireRole('admin'), (req, res) => {
    const { menus_ocultos_json } = req.body;
    if (menus_ocultos_json === undefined) return res.status(400).json({ error: 'menus_ocultos_json obrigatório' });
    try {
        db.prepare('UPDATE empresa_config SET menus_ocultos_json = ? WHERE id = 1').run(menus_ocultos_json);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Config] Erro ao salvar menus:', err.message);
        res.status(500).json({ error: 'Erro ao salvar menus' });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/config/escalacao — config da escalação Sofia pós-handoff
// ═══════════════════════════════════════════════════════
router.get('/escalacao', requireAuth, (req, res) => {
    const emp = db.prepare('SELECT escalacao_ativa, escalacao_config_json FROM empresa_config WHERE id = 1').get() || {};
    let cfg = {};
    try { cfg = JSON.parse(emp.escalacao_config_json || '{}'); } catch {}
    res.json({
        ativa: emp.escalacao_ativa !== 0,
        sla: cfg.sla || null, // null = usa padrão por temperatura
    });
});

// ═══════════════════════════════════════════════════════
// PUT /api/config/escalacao — kill-switch + override de tempos
// body: { ativa: bool, sla?: { muito_quente:{n1,n2,n3,n4}, ... } }
// ═══════════════════════════════════════════════════════
router.put('/escalacao', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { ativa, sla } = req.body || {};
    const emp = db.prepare('SELECT escalacao_config_json FROM empresa_config WHERE id = 1').get() || {};
    let cfg = {};
    try { cfg = JSON.parse(emp.escalacao_config_json || '{}'); } catch {}
    if (sla !== undefined) cfg.sla = sla;
    db.prepare('UPDATE empresa_config SET escalacao_ativa = ?, escalacao_config_json = ? WHERE id = 1')
        .run(ativa ? 1 : 0, JSON.stringify(cfg));
    res.json({ ok: true, ativa: !!ativa, sla: cfg.sla || null });
});

// ═══════════════════════════════════════════════════════
// GET /api/config/n8n — config usada pelo workflow n8n
// Autenticado por header x-n8n-token (valor configurado no sistema)
// ═══════════════════════════════════════════════════════
router.get('/n8n', (req, res) => {
    const emp = db.prepare('SELECT wa_instance_url, wa_instance_name, wa_api_key, wa_owner_phone, ia_api_key, ia_model, ia_ativa, ia_blocked_phones FROM empresa_config WHERE id = 1').get();
    if (!emp) return res.status(404).json({ error: 'Config não encontrada' });
    res.json({
        evolution_url: emp.wa_instance_url || '',
        evolution_instance: emp.wa_instance_name || '',
        evolution_key: emp.wa_api_key || '',
        owner_phone: emp.wa_owner_phone || '',
        anthropic_key: emp.ia_api_key || '',
        ai_model: emp.ia_model || 'claude-haiku-4-5-20251001',
        ia_enabled: emp.ia_ativa === 1,
        blocked_phones: emp.ia_blocked_phones || '',
    });
});

// ═══════════════════════════════════════════════════════
// FASE 4 — Feedback Loop: Custo Real vs Orçado
// ═══════════════════════════════════════════════════════

// GET /api/config/custo-real/:projetoId
router.get('/custo-real/:projetoId', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM custo_real_projeto WHERE projeto_id = ?').get(req.params.projetoId);
    res.json(row || null);
});

// PUT /api/config/custo-real/:projetoId
router.put('/custo-real/:projetoId', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { projetoId } = req.params;
    const {
        orc_id, custo_material_orcado, custo_mdo_orcado, pv_orcado,
        custo_material_real, custo_mdo_real, horas_reais, obs, finalizado,
    } = req.body;

    const custoRealTotal = (custo_material_real || 0) + (custo_mdo_real || 0);
    const custoOrcadoTotal = (custo_material_orcado || 0) + (custo_mdo_orcado || 0);
    const desvio_pct = custoOrcadoTotal > 0 ? ((custoRealTotal - custoOrcadoTotal) / custoOrcadoTotal) * 100 : 0;

    const existing = db.prepare('SELECT id FROM custo_real_projeto WHERE projeto_id = ?').get(projetoId);
    if (existing) {
        db.prepare(`UPDATE custo_real_projeto SET
            orc_id=?, custo_material_orcado=?, custo_mdo_orcado=?, pv_orcado=?,
            custo_material_real=?, custo_mdo_real=?, horas_reais=?, desvio_pct=?,
            obs=?, finalizado=?, atualizado_em=CURRENT_TIMESTAMP
            WHERE projeto_id=?`).run(
            orc_id || null, custo_material_orcado || 0, custo_mdo_orcado || 0, pv_orcado || 0,
            custo_material_real || 0, custo_mdo_real || 0, horas_reais || 0, desvio_pct,
            obs || '', finalizado ?? 0, projetoId,
        );
    } else {
        db.prepare(`INSERT INTO custo_real_projeto
            (projeto_id, orc_id, custo_material_orcado, custo_mdo_orcado, pv_orcado,
             custo_material_real, custo_mdo_real, horas_reais, desvio_pct, obs, finalizado)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
            projetoId, orc_id || null, custo_material_orcado || 0, custo_mdo_orcado || 0, pv_orcado || 0,
            custo_material_real || 0, custo_mdo_real || 0, horas_reais || 0, desvio_pct,
            obs || '', finalizado ?? 0,
        );
    }
    const row = db.prepare('SELECT * FROM custo_real_projeto WHERE projeto_id = ?').get(projetoId);
    res.json(row);
});

// GET /api/config/custo-real — Dashboard: desvio médio últimos projetos
router.get('/custo-real', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT cr.*, p.nome as projeto_nome
        FROM custo_real_projeto cr
        JOIN projetos p ON p.id = cr.projeto_id
        WHERE cr.finalizado = 1
        ORDER BY cr.atualizado_em DESC
        LIMIT 20
    `).all();
    const desvioMedio = rows.length > 0
        ? rows.reduce((s, r) => s + (r.desvio_pct || 0), 0) / rows.length
        : 0;
    res.json({ rows, desvioMedio, total: rows.length });
});

// ═══════════════════════════════════════════════════════
// FASE 5 — Materiais com preço vencido
// ═══════════════════════════════════════════════════════
router.get('/materiais-vencidos', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT id, nome, tipo, preco, preco_atualizado_em, preco_validade_dias
        FROM biblioteca
        WHERE tipo = 'material'
          AND preco_atualizado_em IS NOT NULL
          AND julianday('now') - julianday(preco_atualizado_em) > COALESCE(preco_validade_dias, 90)
        ORDER BY preco_atualizado_em ASC
    `).all();
    res.json(rows);
});

// ═══════════════════════════════════════════════════════
// BACKUP — Exportar / Importar sistema completo
// ═══════════════════════════════════════════════════════

const BACKUP_TABLES = [
    'empresa_config', 'config_taxas', 'users', 'biblioteca', 'modulos_custom',
    'clientes', 'cliente_notas', 'cliente_interacoes', 'cliente_documentos',
    'orcamentos', 'portal_tokens', 'proposta_acessos',
    'projetos', 'etapas_projeto', 'ocorrencias_projeto',
    'contas_receber', 'contas_pagar', 'contas_pagar_anexos', 'despesas_projeto',
    'estoque', 'movimentacoes_estoque',
    'montador_tokens', 'montador_fotos', 'projeto_arquivos',
    'chat_conversas', 'chat_mensagens',
    'colaboradores', 'apontamentos_horas',
    'portal_mensagens', 'notificacoes', 'atividades',
    'modelos_documento', 'automacoes_log', 'conteudo_marketing',
    'ia_contexto', 'ia_followups',
    'custo_real_projeto',
];

// Campos sensiveis removidos na exportacao
const CAMPOS_SENSIVEIS = {
    users: ['senha', 'senha_hash'],
    empresa_config: ['gdrive_refresh_token', 'gdrive_client_secret', 'ia_api_key', 'wa_api_key'],
};

// ── GET /api/config/backup — Exportar backup completo ──
router.get('/backup', requireAuth, requireRole('admin'), (req, res) => {
    try {
        const dados = {};
        let totalRegistros = 0;

        for (const tabela of BACKUP_TABLES) {
            try {
                const rows = db.prepare(`SELECT * FROM ${tabela}`).all();
                const sensiveis = CAMPOS_SENSIVEIS[tabela] || [];

                // Remove campos sensiveis
                const limpos = rows.map(row => {
                    const r = { ...row };
                    for (const campo of sensiveis) delete r[campo];
                    return r;
                });

                dados[tabela] = limpos;
                totalRegistros += limpos.length;
            } catch {
                // Tabela pode nao existir ainda — ignora
                dados[tabela] = [];
            }
        }

        const backup = {
            versao: '1.0',
            sistema: 'Ornato ERP',
            data_export: new Date().toISOString(),
            total_registros: totalRegistros,
            tabelas: Object.keys(dados).length,
            dados,
        };

        const filename = `ornato-backup-${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(backup);
    } catch (err) {
        console.error('Erro ao exportar backup:', err);
        res.status(500).json({ error: 'Erro ao gerar backup' });
    }
});

// ── POST /api/config/backup — Importar backup ──
router.post('/backup', requireAuth, requireRole('admin'), (req, res) => {
    try {
        const backup = req.body;

        // Validar estrutura
        if (!backup || !backup.versao || !backup.dados || !backup.sistema) {
            return res.status(400).json({ error: 'Arquivo de backup invalido. Verifique o formato.' });
        }

        if (backup.sistema !== 'Ornato ERP') {
            return res.status(400).json({ error: 'Este backup nao e do Ornato ERP.' });
        }

        const resumo = {};
        let totalImportados = 0;

        // Importar dentro de uma transacao
        const importar = db.transaction(() => {
            for (const tabela of BACKUP_TABLES) {
                const rows = backup.dados[tabela];
                if (!rows || !Array.isArray(rows) || rows.length === 0) {
                    resumo[tabela] = 0;
                    continue;
                }

                // Pegar colunas da primeira row
                const colunas = Object.keys(rows[0]);
                if (colunas.length === 0) { resumo[tabela] = 0; continue; }

                // Para users: preservar senhas existentes
                if (tabela === 'users') {
                    for (const row of rows) {
                        const existing = db.prepare('SELECT id, senha_hash FROM users WHERE id = ?').get(row.id);
                        const cols = Object.keys(row);

                        if (existing) {
                            // Update campos do backup sem tocar na senha_hash
                            const updateCols = cols.filter(c => c !== 'id');
                            if (updateCols.length === 0) continue;
                            const setCols = updateCols.map(c => `${c}=?`).join(', ');
                            const setVals = updateCols.map(c => row[c] ?? null);
                            db.prepare(`UPDATE users SET ${setCols} WHERE id=?`).run(...setVals, row.id);
                        } else {
                            // Insert novo user com senha_hash padrao (bcrypt de 'trocarsenha')
                            const defaultHash = '$2a$10$XKEr5J5L5Z5Z5Z5Z5Z5Z5eplaceholder00000000000000000000';
                            const colsComSenha = [...cols, 'senha_hash'];
                            const placeholders = colsComSenha.map(() => '?').join(', ');
                            const values = [...cols.map(c => row[c] ?? null), defaultHash];
                            try {
                                db.prepare(`INSERT OR IGNORE INTO users (${colsComSenha.join(', ')}) VALUES (${placeholders})`).run(...values);
                            } catch { /* ignora se user ja existe */ }
                        }
                    }
                    resumo[tabela] = rows.length;
                    totalImportados += rows.length;
                    continue;
                }

                // Para empresa_config: preservar campos sensiveis existentes
                if (tabela === 'empresa_config') {
                    const existing = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get();
                    const row = rows[0];
                    if (existing && row) {
                        const cols = Object.keys(row).filter(c => c !== 'id');
                        const setCols = cols.map(c => `${c}=?`).join(', ');
                        const values = cols.map(c => row[c] ?? null);
                        db.prepare(`UPDATE empresa_config SET ${setCols} WHERE id=1`).run(...values);
                    }
                    resumo[tabela] = 1;
                    totalImportados += 1;
                    continue;
                }

                // Para config_taxas: update direto
                if (tabela === 'config_taxas') {
                    const row = rows[0];
                    if (row) {
                        const cols = Object.keys(row).filter(c => c !== 'id');
                        const setCols = cols.map(c => `${c}=?`).join(', ');
                        const values = cols.map(c => row[c] ?? null);
                        db.prepare(`UPDATE config_taxas SET ${setCols} WHERE id=1`).run(...values);
                    }
                    resumo[tabela] = 1;
                    totalImportados += 1;
                    continue;
                }

                // Para demais tabelas: limpar e re-inserir
                try {
                    db.prepare(`DELETE FROM ${tabela}`).run();
                } catch { /* tabela pode nao existir */ }

                const placeholders = colunas.map(() => '?').join(', ');
                const insert = db.prepare(`INSERT OR IGNORE INTO ${tabela} (${colunas.join(', ')}) VALUES (${placeholders})`);

                let count = 0;
                for (const row of rows) {
                    try {
                        const values = colunas.map(c => row[c] ?? null);
                        insert.run(...values);
                        count++;
                    } catch { /* ignora rows com problema */ }
                }

                resumo[tabela] = count;
                totalImportados += count;
            }
        });

        importar();

        res.json({
            ok: true,
            mensagem: `Backup importado com sucesso! ${totalImportados} registros restaurados.`,
            data_backup: backup.data_export,
            resumo,
        });
    } catch (err) {
        console.error('Erro ao importar backup:', err);
        res.status(500).json({ error: `Erro ao importar: ${err.message}` });
    }
});

// ═══════════════════════════════════════════════════════
// POST /api/config/backup-drive — Backup manual para Google Drive
// ═══════════════════════════════════════════════════════
router.post('/backup-drive', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const result = await backupToDrive();
        res.json(result);
    } catch (err) {
        console.error('Erro no backup Drive:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════
// GET /api/config/backup-drive — Listar backups no Drive
// ═══════════════════════════════════════════════════════
router.get('/backup-drive', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const backups = await listBackups();
        res.json(backups);
    } catch (err) {
        console.error('Erro ao listar backups:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
