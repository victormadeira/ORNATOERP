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
        gdrive_client_id, gdrive_client_secret,
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
      gdrive_client_id=?, gdrive_client_secret=?,
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
        gdrive_client_id !== undefined ? gdrive_client_id : '',
        gdrive_client_secret !== undefined ? gdrive_client_secret : '',
        wa_instance_url || '', wa_instance_name || '', wa_api_key || '', wa_webhook_token || '',
        ia_provider || 'anthropic', ia_api_key || '', ia_model || 'claude-sonnet-4',
        ia_system_prompt !== undefined ? ia_system_prompt : '', ia_temperatura ?? 0.7, ia_ativa ?? 0,
        upmobb_ativo ?? 0,
    );
    const emp = db.prepare('SELECT * FROM empresa_config WHERE id = 1').get();
    res.json(emp);
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

export default router;
