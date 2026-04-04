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
// 6. GET /personalizados — Lista modulos do usuario
// ═══════════════════════════════════════════════════════
router.get('/personalizados', requireAuth, (req, res) => {
    const userId = String(req.user.id);
    const indexPath = path.join(PERSONALIZADOS_DIR, 'personalizados.json');
    const index = readJsonSafe(indexPath) || { modulos: [] };

    const userModules = index.modulos.filter(m => String(m.user_id) === userId);
    res.json(userModules);
});


export default router;
