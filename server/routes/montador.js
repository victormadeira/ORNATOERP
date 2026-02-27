import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as gdrive from '../services/gdrive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const router = Router();

// ═══════════════════════════════════════════════════
// POST /api/montador/gerar-link/:projeto_id — gerar link público
// ═══════════════════════════════════════════════════
router.post('/gerar-link/:projeto_id', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const { nome_montador } = req.body;

    const proj = db.prepare('SELECT id, nome FROM projetos WHERE id = ?').get(projeto_id);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });

    const token = randomBytes(16).toString('hex');

    db.prepare(`
        INSERT INTO montador_tokens (projeto_id, token, nome_montador)
        VALUES (?, ?, ?)
    `).run(projeto_id, token, nome_montador || 'Montador');

    res.json({ token, url: `/montador/${token}` });
});

// ═══════════════════════════════════════════════════
// GET /api/montador/links/:projeto_id — listar links do projeto
// ═══════════════════════════════════════════════════
router.get('/links/:projeto_id', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const links = db.prepare(`
        SELECT mt.*, p.nome as projeto_nome
        FROM montador_tokens mt
        JOIN projetos p ON p.id = mt.projeto_id
        WHERE mt.projeto_id = ?
        ORDER BY mt.criado_em DESC
    `).all(projeto_id);
    res.json(links);
});

// ═══════════════════════════════════════════════════
// PUT /api/montador/toggle/:id — ativar/desativar link
// ═══════════════════════════════════════════════════
router.put('/toggle/:id', requireAuth, (req, res) => {
    const token = db.prepare('SELECT * FROM montador_tokens WHERE id = ?').get(parseInt(req.params.id));
    if (!token) return res.status(404).json({ error: 'Link não encontrado' });

    db.prepare('UPDATE montador_tokens SET ativo = ? WHERE id = ?').run(token.ativo ? 0 : 1, token.id);
    res.json({ ok: true, ativo: !token.ativo });
});

// ═══════════════════════════════════════════════════
// PUT /api/montador/link/:id — editar nome do montador
// ═══════════════════════════════════════════════════
router.put('/link/:id', requireAuth, (req, res) => {
    const { nome_montador } = req.body;
    if (!nome_montador?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
    const token = db.prepare('SELECT * FROM montador_tokens WHERE id = ?').get(parseInt(req.params.id));
    if (!token) return res.status(404).json({ error: 'Link não encontrado' });
    db.prepare('UPDATE montador_tokens SET nome_montador = ? WHERE id = ?').run(nome_montador.trim(), token.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// DELETE /api/montador/link/:id — excluir link
// ═══════════════════════════════════════════════════
router.delete('/link/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM montador_tokens WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// GET /api/montador/public/:token — info pública (sem auth)
// ═══════════════════════════════════════════════════
router.get('/public/:token', (req, res) => {
    const tokenRow = db.prepare(`
        SELECT mt.*, p.nome as projeto_nome, p.id as projeto_id
        FROM montador_tokens mt
        JOIN projetos p ON p.id = mt.projeto_id
        WHERE mt.token = ?
    `).get(req.params.token);

    if (!tokenRow) return res.status(404).json({ error: 'Link inválido ou expirado' });
    if (!tokenRow.ativo) return res.status(403).json({ error: 'Este link foi desativado' });

    const empresa = db.prepare(
        'SELECT nome, logo_header_path, proposta_cor_primaria, proposta_cor_accent FROM empresa_config WHERE id = 1'
    ).get() || {};

    // Buscar ambientes do orçamento vinculado ao projeto
    let ambientes = [];
    const proj = db.prepare('SELECT orc_id FROM projetos WHERE id = ?').get(tokenRow.projeto_id);
    if (proj && proj.orc_id) {
        const orc = db.prepare('SELECT mods_json, ambiente FROM orcamentos WHERE id = ?').get(proj.orc_id);
        if (orc) {
            try {
                const mods = orc.mods_json ? JSON.parse(orc.mods_json) : [];
                const ambSet = new Set();
                // mods é array; cada item pode ter .ambientes[]
                for (const mod of (Array.isArray(mods) ? mods : [mods])) {
                    if (Array.isArray(mod.ambientes)) {
                        for (const amb of mod.ambientes) {
                            if (amb.nome) ambSet.add(amb.nome);
                        }
                    }
                }
                if (orc.ambiente) ambSet.add(orc.ambiente);
                ambientes = [...ambSet];
            } catch (e) {
                ambientes = [];
            }
        }
    }

    res.json({
        projeto_nome: tokenRow.projeto_nome,
        nome_montador: tokenRow.nome_montador,
        empresa_nome: empresa.nome || '',
        empresa_logo: empresa.logo_header_path || '',
        cor_primaria: empresa.proposta_cor_primaria || '#1B2A4A',
        cor_accent: empresa.proposta_cor_accent || '#C9A96E',
        ambientes,
    });
});

// ═══════════════════════════════════════════════════
// POST /api/montador/public/:token/upload — upload de foto (sem auth)
// ═══════════════════════════════════════════════════
router.post('/public/:token/upload', async (req, res) => {
    const tokenRow = db.prepare(`
        SELECT mt.*, p.id as projeto_id
        FROM montador_tokens mt
        JOIN projetos p ON p.id = mt.projeto_id
        WHERE mt.token = ? AND mt.ativo = 1
    `).get(req.params.token);

    if (!tokenRow) return res.status(403).json({ error: 'Link invalido ou desativado' });

    const { filename, data, ambiente } = req.body;
    if (!filename || !data) return res.status(400).json({ error: 'Filename e data obrigatorios' });

    const timestamp = Date.now();
    const safeName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = path.extname(safeName).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mime = mimeMap[ext] || 'image/jpeg';

    let gdriveFileId = '';

    if (gdrive.isConfigured()) {
        try {
            const folderId = await gdrive.getProjectMontadorFolder(tokenRow.projeto_id);
            const result = await gdrive.uploadFile(folderId, safeName, mime, buffer);
            gdriveFileId = result.id;
        } catch (err) {
            console.error('Drive montador upload erro:', err.message);
            // fallback para local
        }
    }

    // Se nao foi para o Drive, salvar local
    if (!gdriveFileId) {
        const montadorDir = path.join(UPLOADS_DIR, `projeto_${tokenRow.projeto_id}`, 'montador');
        if (!fs.existsSync(montadorDir)) fs.mkdirSync(montadorDir, { recursive: true });
        fs.writeFileSync(path.join(montadorDir, safeName), buffer);
    }

    db.prepare(`
        INSERT INTO montador_fotos (projeto_id, token_id, nome_montador, ambiente, filename, gdrive_file_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(tokenRow.projeto_id, tokenRow.id, tokenRow.nome_montador, ambiente || '', safeName, gdriveFileId);

    res.json({ ok: true, nome: safeName });
});

// ═══════════════════════════════════════════════════
// GET /api/montador/fotos/:projeto_id — listar fotos do projeto (autenticado)
// ═══════════════════════════════════════════════════
router.get('/fotos/:projeto_id', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const fotos = db.prepare(`
        SELECT id, nome_montador, ambiente, filename, visivel_portal, criado_em
        FROM montador_fotos
        WHERE projeto_id = ?
        ORDER BY criado_em DESC
    `).all(projeto_id);

    const result = fotos.map(f => ({
        ...f,
        url: `/api/drive/arquivo/${projeto_id}/montador/${f.filename}`,
    }));

    res.json(result);
});

// ═══════════════════════════════════════════════════
// PUT /api/montador/fotos/:id/portal — toggle visibilidade no portal (auth)
// ═══════════════════════════════════════════════════
router.put('/fotos/:id/portal', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const foto = db.prepare('SELECT * FROM montador_fotos WHERE id = ?').get(id);
    if (!foto) return res.status(404).json({ error: 'Foto não encontrada' });

    const novoValor = foto.visivel_portal ? 0 : 1;
    db.prepare('UPDATE montador_fotos SET visivel_portal = ? WHERE id = ?').run(novoValor, id);
    res.json({ ok: true, visivel_portal: novoValor });
});

// ═══════════════════════════════════════════════════
// PUT /api/montador/fotos/portal-lote/:projeto_id — toggle em lote (auth)
// ═══════════════════════════════════════════════════
router.put('/fotos/portal-lote/:projeto_id', requireAuth, (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const { ids, visivel } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'IDs obrigatórios' });

    const stmt = db.prepare('UPDATE montador_fotos SET visivel_portal = ? WHERE id = ? AND projeto_id = ?');
    const run = db.transaction(() => {
        for (const id of ids) stmt.run(visivel ? 1 : 0, id, projeto_id);
    });
    run();
    res.json({ ok: true, atualizados: ids.length });
});

// ═══════════════════════════════════════════════════
// POST /api/montador/fotos/:projeto_id/upload — upload de foto pelo admin (auth)
// ═══════════════════════════════════════════════════
router.post('/fotos/:projeto_id/upload', requireAuth, async (req, res) => {
    const projeto_id = parseInt(req.params.projeto_id);
    const { filename, data, ambiente } = req.body;
    if (!filename || !data) return res.status(400).json({ error: 'Filename e data obrigatorios' });

    const timestamp = Date.now();
    const safeName = `${timestamp}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const base64Data = data.includes(',') ? data.split(',')[1] : data;
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = path.extname(safeName).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mime = mimeMap[ext] || 'image/jpeg';

    let gdriveFileId = '';

    if (gdrive.isConfigured()) {
        try {
            const folderId = await gdrive.getProjectMontadorFolder(projeto_id);
            const result = await gdrive.uploadFile(folderId, safeName, mime, buffer);
            gdriveFileId = result.id;
        } catch (err) {
            console.error('Drive admin upload erro:', err.message);
        }
    }

    if (!gdriveFileId) {
        const montadorDir = path.join(UPLOADS_DIR, `projeto_${projeto_id}`, 'montador');
        if (!fs.existsSync(montadorDir)) fs.mkdirSync(montadorDir, { recursive: true });
        fs.writeFileSync(path.join(montadorDir, safeName), buffer);
    }

    db.prepare(`
        INSERT INTO montador_fotos (projeto_id, token_id, nome_montador, ambiente, filename, gdrive_file_id)
        VALUES (?, NULL, ?, ?, ?, ?)
    `).run(projeto_id, req.user.nome || 'Equipe', ambiente || '', safeName, gdriveFileId);

    res.json({ ok: true, nome: safeName });
});

// ═══════════════════════════════════════════════════
// DELETE /api/montador/fotos/:id — excluir foto (auth)
// ═══════════════════════════════════════════════════
router.delete('/fotos/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const foto = db.prepare('SELECT * FROM montador_fotos WHERE id = ?').get(id);
    if (!foto) return res.status(404).json({ error: 'Foto nao encontrada' });

    // Excluir do Drive se aplicavel
    if (foto.gdrive_file_id) {
        try { await gdrive.deleteFile(foto.gdrive_file_id); } catch (err) { console.error('Drive delete foto erro:', err.message); }
    }

    // Excluir arquivo local se existir
    const filePath = path.join(UPLOADS_DIR, `projeto_${foto.projeto_id}`, 'montador', foto.filename);
    if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { }
    }

    db.prepare('DELETE FROM montador_fotos WHERE id = ?').run(id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// GET /api/montador/public/:token/fotos — listar fotos do token (sem auth)
// ═══════════════════════════════════════════════════
router.get('/public/:token/fotos', (req, res) => {
    const tokenRow = db.prepare(`
        SELECT mt.*
        FROM montador_tokens mt
        WHERE mt.token = ? AND mt.ativo = 1
    `).get(req.params.token);

    if (!tokenRow) return res.status(403).json({ error: 'Link inválido ou desativado' });

    const fotos = db.prepare(`
        SELECT id, ambiente, filename, criado_em
        FROM montador_fotos
        WHERE token_id = ?
        ORDER BY criado_em DESC
    `).all(tokenRow.id);

    res.json(fotos);
});

export default router;
