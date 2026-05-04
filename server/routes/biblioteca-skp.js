// ═══════════════════════════════════════════════════════
// Biblioteca SketchUp — Modelos .skp, materiais .skm,
// thumbnails .png e modulos personalizados do usuario
// ═══════════════════════════════════════════════════════

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

// ─── Paths base ────────────────────────────────────────
const BIBLIOTECA_DIR = path.join(__dirname, '..', '..', 'ornato-plugin', 'biblioteca');
const MODELOS_DIR = path.join(BIBLIOTECA_DIR, 'modelos');
const MATERIAIS_DIR = path.join(BIBLIOTECA_DIR, 'materiais');
const PERSONALIZADOS_DIR = path.join(BIBLIOTECA_DIR, 'personalizados');

// ─── Helpers ───────────────────────────────────────────
function sanitize(str) {
    // Bloqueia path traversal e caracteres perigosos
    if (!str || str.includes('..') || str.includes('/') || str.includes('\\') || str.includes('\0')) {
        return null;
    }
    return str;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readJsonSafe(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch {}
    return null;
}

function writeJsonSafe(filePath, data) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Multer para upload de .skp personalizado ──────────
const skpStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userId = req.user?.id;
        if (!userId) return cb(new Error('User ID ausente'));
        const dest = path.join(PERSONALIZADOS_DIR, String(userId));
        ensureDir(dest);
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        // Preserva nome original sanitizado
        const safeName = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        cb(null, safeName);
    },
});

const uploadSkp = multer({
    storage: skpStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'modelo' && !file.originalname.toLowerCase().endsWith('.skp')) {
            return cb(new Error('Apenas arquivos .skp sao aceitos'));
        }
        cb(null, true);
    },
});


// ═══════════════════════════════════════════════════════
// 1. GET /catalogo — Catalogo geral de modelos
// ═══════════════════════════════════════════════════════
router.get('/catalogo', requireAuth, (req, res) => {
    const catalogPath = path.join(MODELOS_DIR, 'catalogo.json');
    const catalog = readJsonSafe(catalogPath);

    if (!catalog) {
        return res.status(404).json({ error: 'Catalogo nao encontrado' });
    }

    res.json(catalog);
});


// ═══════════════════════════════════════════════════════
// 2. GET /modelo/:categoria/:nome — Arquivo .skp
// ═══════════════════════════════════════════════════════
router.get('/modelo/:categoria/:nome', requireAuth, (req, res) => {
    const categoria = sanitize(req.params.categoria);
    const nome = sanitize(req.params.nome);
    if (!categoria || !nome) {
        return res.status(400).json({ error: 'Parametros invalidos' });
    }

    const filePath = path.join(MODELOS_DIR, categoria, `${nome}.skp`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Modelo nao encontrado' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${nome}.skp"`);
    fs.createReadStream(filePath).pipe(res);
});


// ═══════════════════════════════════════════════════════
// 3. GET /material/:fornecedor/:padrao — Arquivo .skm
// ═══════════════════════════════════════════════════════
router.get('/material/:fornecedor/:padrao', requireAuth, (req, res) => {
    const fornecedor = sanitize(req.params.fornecedor);
    const padrao = sanitize(req.params.padrao);
    if (!fornecedor || !padrao) {
        return res.status(400).json({ error: 'Parametros invalidos' });
    }

    const filePath = path.join(MATERIAIS_DIR, fornecedor, `${padrao}.skm`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Material nao encontrado' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${padrao}.skm"`);
    fs.createReadStream(filePath).pipe(res);
});


// ═══════════════════════════════════════════════════════
// 4. GET /thumbnail/:categoria/:nome — Preview .png (publico)
// ═══════════════════════════════════════════════════════
router.get('/thumbnail/:categoria/:nome', (req, res) => {
    const categoria = sanitize(req.params.categoria);
    const nome = sanitize(req.params.nome);
    if (!categoria || !nome) {
        return res.status(400).json({ error: 'Parametros invalidos' });
    }

    const filePath = path.join(MODELOS_DIR, categoria, `${nome}.png`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Thumbnail nao encontrada' });
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
    fs.createReadStream(filePath).pipe(res);
});


// ═══════════════════════════════════════════════════════
// 5. POST /personalizado — Upload de modulo personalizado
//    Multipart: campo "modelo" (.skp) + campo "metadata" (JSON string)
// ═══════════════════════════════════════════════════════
router.post('/personalizado', requireAuth, uploadSkp.single('modelo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Arquivo .skp e obrigatorio' });
    }

    const userId = String(req.user.id);
    let metadata = {};
    try {
        metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};
    } catch {
        return res.status(400).json({ error: 'Metadata JSON invalido' });
    }

    // Montar registro
    const entry = {
        id: `custom_${userId}_${Date.now()}`,
        user_id: userId,
        nome: metadata.nome || req.file.originalname.replace('.skp', ''),
        descricao: metadata.descricao || '',
        categoria: metadata.categoria || 'geral',
        tags: metadata.tags || [],
        arquivo: req.file.filename,
        tamanho: req.file.size,
        criado_em: new Date().toISOString(),
    };

    // Ler/criar indice personalizados.json
    const indexPath = path.join(PERSONALIZADOS_DIR, 'personalizados.json');
    const index = readJsonSafe(indexPath) || { modulos: [] };

    index.modulos.push(entry);
    writeJsonSafe(indexPath, index);

    res.json({ ok: true, modulo: entry });
});


// ═══════════════════════════════════════════════════════
// 6. GET /personalizados — Lista modulos .skp do usuario
// ═══════════════════════════════════════════════════════
router.get('/personalizados', requireAuth, (req, res) => {
    const userId = String(req.user.id);
    const indexPath = path.join(PERSONALIZADOS_DIR, 'personalizados.json');
    const index = readJsonSafe(indexPath) || { modulos: [] };

    const userModules = index.modulos.filter(m => String(m.user_id) === userId);
    res.json(userModules);
});


// ═══════════════════════════════════════════════════════
// TEMPLATES JSON — Biblioteca Cloud de módulos paramétricos
// Endpoints: POST, GET (lista), GET (item), DELETE
// ═══════════════════════════════════════════════════════

// 7. POST /template — Publicar template JSON na nuvem
router.post('/template', requireAuth, (req, res) => {
    const { nome, descricao, categoria, tags, template, thumbnail, publico } = req.body;

    if (!nome || !template) {
        return res.status(400).json({ error: 'nome e template são obrigatórios' });
    }

    // Valida que template é JSON válido
    let parsed;
    try {
        parsed = typeof template === 'string' ? JSON.parse(template) : template;
    } catch {
        return res.status(400).json({ error: 'template deve ser um JSON válido' });
    }

    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || '[]');
    const templateStr = typeof template === 'string' ? template : JSON.stringify(parsed);
    const isPublico = publico === false ? 0 : 1;

    const result = db.prepare(`
        INSERT INTO biblioteca_templates
            (user_id, nome, descricao, categoria, tags, template, thumbnail, publico)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.user.id,
        nome,
        descricao || '',
        categoria || 'geral',
        tagsJson,
        templateStr,
        thumbnail || '',
        isPublico
    );

    res.json({
        ok: true,
        id: result.lastInsertRowid,
        nome,
        categoria: categoria || 'geral',
    });
});

// 8. GET /templates — Listar templates públicos (+ os do próprio usuário)
router.get('/templates', requireAuth, (req, res) => {
    const { categoria, q } = req.query;
    const userId = req.user.id;

    let sql = `
        SELECT t.id, t.nome, t.descricao, t.categoria, t.tags, t.thumbnail,
               t.publico, t.downloads, t.criado_em, t.atualizado_em,
               u.nome AS autor,
               CASE WHEN t.user_id = ? THEN 1 ELSE 0 END AS proprio
        FROM biblioteca_templates t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE (t.publico = 1 OR t.user_id = ?)
    `;
    const params = [userId, userId];

    if (categoria) {
        sql += ' AND t.categoria = ?';
        params.push(categoria);
    }
    if (q) {
        sql += ' AND (t.nome LIKE ? OR t.descricao LIKE ? OR t.tags LIKE ?)';
        const like = `%${q}%`;
        params.push(like, like, like);
    }

    sql += ' ORDER BY t.downloads DESC, t.criado_em DESC';

    const rows = db.prepare(sql).all(...params);

    // Parse tags JSON
    const items = rows.map(r => ({
        ...r,
        tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })(),
    }));

    res.json(items);
});

// 9. GET /template/:id — Baixar template específico (retorna JSON completo)
router.get('/template/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const userId = req.user.id;
    const row = db.prepare(`
        SELECT t.*, u.nome AS autor
        FROM biblioteca_templates t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = ? AND (t.publico = 1 OR t.user_id = ?)
    `).get(id, userId);

    if (!row) return res.status(404).json({ error: 'Template não encontrado' });

    // Incrementa contador de downloads (só para templates de outros)
    if (row.user_id !== userId) {
        db.prepare('UPDATE biblioteca_templates SET downloads = downloads + 1 WHERE id = ?').run(id);
    }

    // Retorna o template completo
    let templateData;
    try { templateData = JSON.parse(row.template); } catch { templateData = row.template; }

    res.json({
        id:         row.id,
        nome:       row.nome,
        descricao:  row.descricao,
        categoria:  row.categoria,
        tags:       (() => { try { return JSON.parse(row.tags); } catch { return []; } })(),
        autor:      row.autor,
        downloads:  row.downloads,
        criado_em:  row.criado_em,
        proprio:    row.user_id === userId,
        template:   templateData,
    });
});

// 10. PUT /template/:id — Atualizar template próprio
router.put('/template/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const row = db.prepare('SELECT user_id FROM biblioteca_templates WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Template não encontrado' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Não autorizado' });

    const { nome, descricao, categoria, tags, template, thumbnail, publico } = req.body;
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || '[]');

    db.prepare(`
        UPDATE biblioteca_templates
        SET nome=?, descricao=?, categoria=?, tags=?, template=?, thumbnail=?,
            publico=?, atualizado_em=CURRENT_TIMESTAMP
        WHERE id=?
    `).run(
        nome, descricao || '', categoria || 'geral', tagsJson,
        typeof template === 'string' ? template : JSON.stringify(template),
        thumbnail || '', publico === false ? 0 : 1, id
    );

    res.json({ ok: true });
});

// 11. DELETE /template/:id — Remover template próprio
router.delete('/template/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const row = db.prepare('SELECT user_id FROM biblioteca_templates WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Template não encontrado' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Não autorizado' });

    db.prepare('DELETE FROM biblioteca_templates WHERE id = ?').run(id);
    res.json({ ok: true });
});

// 12. GET /templates/categorias — Listar categorias disponíveis
router.get('/templates/categorias', requireAuth, (req, res) => {
    const rows = db.prepare(`
        SELECT categoria, COUNT(*) AS total
        FROM biblioteca_templates
        WHERE publico = 1 OR user_id = ?
        GROUP BY categoria
        ORDER BY total DESC
    `).all(req.user.id);

    res.json(rows);
});


export default router;
