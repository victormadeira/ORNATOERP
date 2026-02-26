import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/config — qualquer logado pode ler
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const cfg = db.prepare('SELECT * FROM config_taxas WHERE id = 1').get();
    res.json(cfg || { imp: 8, com: 10, mont: 12, lucro: 20, frete: 2, mdo: 350, inst: 180 });
});

// ═══════════════════════════════════════════════════════
// PUT /api/config — somente admin/gerente
// ═══════════════════════════════════════════════════════
router.put('/', requireAuth, requireRole('admin', 'gerente'), (req, res) => {
    const { imp, com, mont, lucro, frete, mdo, inst } = req.body;
    db.prepare(`
    UPDATE config_taxas SET imp=?, com=?, mont=?, lucro=?, frete=?, mdo=?, inst=? WHERE id=1
  `).run(
        imp ?? 8, com ?? 10, mont ?? 12, lucro ?? 20, frete ?? 2, mdo ?? 350, inst ?? 180
    );
    const cfg = db.prepare('SELECT * FROM config_taxas WHERE id = 1').get();
    res.json(cfg);
});

// ═══════════════════════════════════════════════════════
// GET /api/config/empresa/public — sem autenticação (login page)
// ═══════════════════════════════════════════════════════
router.get('/empresa/public', (req, res) => {
    const emp = db.prepare('SELECT nome, logo_sistema FROM empresa_config WHERE id = 1').get();
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
        wa_instance_url, wa_instance_name, wa_api_key, wa_webhook_token,
        ia_provider, ia_api_key, ia_model, ia_system_prompt, ia_temperatura, ia_ativa,
        upmobb_ativo,
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
      wa_instance_url=?, wa_instance_name=?, wa_api_key=?, wa_webhook_token=?,
      ia_provider=?, ia_api_key=?, ia_model=?, ia_system_prompt=?, ia_temperatura=?, ia_ativa=?,
      upmobb_ativo=?,
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
        wa_instance_url || '', wa_instance_name || '', wa_api_key || '', wa_webhook_token || '',
        ia_provider || 'anthropic', ia_api_key || '', ia_model || 'claude-sonnet-4',
        ia_system_prompt !== undefined ? ia_system_prompt : '', ia_temperatura ?? 0.7, ia_ativa ?? 0,
        upmobb_ativo ?? 0,
    );
    const emp = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get();
    res.json(emp);
});

export default router;
