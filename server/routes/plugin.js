// ═══════════════════════════════════════════════════════
// Plugin Routes — Download, versão e auto-update
// Protegido com auth — plugin SketchUp autentica via JWT
// ═══════════════════════════════════════════════════════

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth } from '../auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = Router();

const PLUGINS_DIR = path.join(__dirname, '..', 'uploads', 'plugins');

// Carregar version.json (ou defaults)
function getVersionInfo() {
    const versionFile = path.join(PLUGINS_DIR, 'version.json');
    try {
        if (fs.existsSync(versionFile)) {
            return JSON.parse(fs.readFileSync(versionFile, 'utf8'));
        }
    } catch {}
    // Default se não existe
    return {
        version: '0.1.0',
        released_at: new Date().toISOString(),
        changelog: 'Versão inicial do plugin Ornato CNC para SketchUp.',
        min_sketchup: '2021',
        filename: 'ornato_cnc_0.1.0.rbz',
        size_mb: 0,
    };
}

// ─── GET /api/plugin/latest ─────────────────────────────
// Retorna info da versão mais recente
router.get('/latest', requireAuth, (req, res) => {
    const info = getVersionInfo();
    const host = req.get('host');
    const protocol = req.protocol;
    res.json({
        version: info.version,
        download_url: `${protocol}://${host}/api/plugin/download/${info.filename}`,
        filename: info.filename,
        size_mb: info.size_mb,
        released_at: info.released_at,
        changelog: info.changelog,
        min_sketchup: info.min_sketchup || '2021',
        features: [
            'Detecção automática de peças',
            '8 regras de furação (dobradiça, minifix, cavilha, System32, puxador, corrediça, fundo, prateleira)',
            '15 módulos paramétricos',
            'Ferragens 3D no modelo',
            'Edição manual de furos',
            '15 validações pré-export',
            'Catálogo Blum, Hettich, Hafele, Grass',
            'Biblioteca com 92 itens (móveis, ferragens, usinagens, materiais, bordas)',
            'Sync direto com Ornato ERP',
        ],
    });
});

// ─── GET /api/plugin/download/:filename ─────────────────
// Serve o arquivo .rbz para download
router.get('/download/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    // Segurança: só permite .rbz e sem path traversal
    if (!filename.endsWith('.rbz') || filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Arquivo inválido' });
    }
    const filePath = path.join(PLUGINS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado. Gere o .rbz com build.sh primeiro.' });
    }
    // Registrar download
    try {
        const logFile = path.join(PLUGINS_DIR, 'downloads.log');
        const entry = `${new Date().toISOString()} | ${req.ip} | ${filename}\n`;
        fs.appendFileSync(logFile, entry);
    } catch {}

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.sendFile(filePath);
});

// ─── POST /api/plugin/register ──────────────────────────
// Registra instalação do plugin (analytics)
router.post('/register', requireAuth, (req, res) => {
    const { version, sketchup_version, os, user_id } = req.body;
    try {
        const logFile = path.join(PLUGINS_DIR, 'installs.log');
        const entry = `${new Date().toISOString()} | v${version || '?'} | SKP${sketchup_version || '?'} | ${os || '?'} | ${req.ip}\n`;
        fs.appendFileSync(logFile, entry);
    } catch {}
    res.json({ ok: true, message: 'Instalação registrada' });
});

// ─── GET /api/plugin/check-update ───────────────────────
// Verifica se há atualização (chamado pelo plugin)
router.get('/check-update', requireAuth, (req, res) => {
    const { current_version } = req.query;
    const info = getVersionInfo();

    const hasUpdate = current_version && compareVersions(info.version, current_version) > 0;
    const host = req.get('host');
    const protocol = req.protocol;

    res.json({
        has_update: hasUpdate,
        latest_version: info.version,
        current_version: current_version || 'unknown',
        download_url: hasUpdate ? `${protocol}://${host}/api/plugin/download/${info.filename}` : null,
        changelog: hasUpdate ? info.changelog : null,
    });
});

// ─── Biblioteca de Módulos (pública, sem auth) ──────
// Base: ornato-plugin/biblioteca/ — servida pelo ERP

const BIBLIOTECA_DIR = path.join(__dirname, '..', '..', 'ornato-plugin', 'biblioteca');

const CATEGORIAS_MOVEIS = ['cozinha', 'dormitorio', 'banheiro', 'escritorio', 'closet', 'area_servico', 'comercial'];

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

// Mapeia id do módulo biblioteca → tipo Ruby builder
function resolveRubyType(id) {
    if (!id) return 'armario_base';
    const s = id.toLowerCase();
    if (s.startsWith('aereo') || s.includes('aereo')) return 'armario_aereo';
    if (s.startsWith('torre') || s.includes('torre')) return 'armario_torre';
    if (s.startsWith('gaveteiro')) return 'gaveteiro';
    if (s.startsWith('nicho') || s === 'paneleiro') return 'nicho';
    if (s.startsWith('canto') || s.includes('canto')) return 'coluna_canto';
    if (s.startsWith('sapateira')) return 'sapateira';
    if (s.startsWith('cabideiro')) return 'cabideiro';
    if (s.startsWith('prateleira')) return 'prateleira';
    if (s.startsWith('gaveta')) return 'gaveta';
    if (s.startsWith('porta_correr') || s.includes('correr')) return 'porta_correr';
    if (s.startsWith('porta')) return 'porta_abrir';
    if (s.startsWith('rodape')) return 'rodape';
    if (s.startsWith('divisoria')) return 'divisoria';
    if (s.startsWith('tamponamento')) return 'tamponamento';
    return 'armario_base'; // fallback genérico
}

function listModules(category) {
    const dir = path.join(BIBLIOTECA_DIR, 'moveis', category);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => readJsonFile(path.join(dir, f)))
        .filter(Boolean)
        .map(m => ({
            id: m.id,
            nome: m.nome,
            descricao: m.descricao,
            categoria: m.categoria,
            tags: m.tags,
            icone: m.icone,
            parametros: m.parametros,
            tipo_ruby: resolveRubyType(m.id),
        }));
}

// GET /api/plugin/biblioteca — índice de todas as categorias
router.get('/biblioteca', requireAuth, (req, res) => {
    const result = {};
    for (const cat of CATEGORIAS_MOVEIS) {
        const mods = listModules(cat);
        if (mods.length > 0) result[cat] = { count: mods.length, modulos: mods };
    }

    // Ferragens summary
    const ferragensDir = path.join(BIBLIOTECA_DIR, 'ferragens');
    let ferragensCount = 0;
    if (fs.existsSync(ferragensDir)) {
        const subdirs = fs.readdirSync(ferragensDir, { withFileTypes: true }).filter(d => d.isDirectory());
        for (const sub of subdirs) {
            const files = fs.readdirSync(path.join(ferragensDir, sub.name)).filter(f => f.endsWith('.json'));
            ferragensCount += files.length;
        }
    }

    res.json({ moveis: result, ferragens_count: ferragensCount });
});

// GET /api/plugin/biblioteca/moveis — lista todos os módulos (todas as categorias)
router.get('/biblioteca/moveis', requireAuth, (req, res) => {
    const { categoria, search } = req.query;
    let all = [];
    const cats = categoria ? [categoria] : CATEGORIAS_MOVEIS;
    for (const cat of cats) {
        all = all.concat(listModules(cat));
    }
    if (search) {
        const q = search.toLowerCase();
        all = all.filter(m =>
            m.nome?.toLowerCase().includes(q) ||
            m.descricao?.toLowerCase().includes(q) ||
            m.tags?.some(t => t.toLowerCase().includes(q))
        );
    }
    res.json(all);
});

// GET /api/plugin/biblioteca/moveis/:id — detalhes completos de um módulo
router.get('/biblioteca/moveis/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    if (id.includes('..') || id.includes('/')) return res.status(400).json({ error: 'ID inválido' });

    for (const cat of CATEGORIAS_MOVEIS) {
        const filePath = path.join(BIBLIOTECA_DIR, 'moveis', cat, `${id}.json`);
        if (fs.existsSync(filePath)) {
            const data = readJsonFile(filePath);
            if (data) return res.json(data);
        }
    }
    res.status(404).json({ error: 'Módulo não encontrado' });
});

// GET /api/plugin/biblioteca/ferragens — lista ferragens
router.get('/biblioteca/ferragens', requireAuth, (req, res) => {
    const ferragensDir = path.join(BIBLIOTECA_DIR, 'ferragens');
    if (!fs.existsSync(ferragensDir)) return res.json([]);

    const result = [];
    const subdirs = fs.readdirSync(ferragensDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const sub of subdirs) {
        const files = fs.readdirSync(path.join(ferragensDir, sub.name)).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const data = readJsonFile(path.join(ferragensDir, sub.name, file));
            if (data) result.push({ id: data.id, nome: data.nome, marca: data.marca, modelo: data.modelo, categoria: data.categoria || sub.name });
        }
    }
    res.json(result);
});

// Comparar versões semver simples (1.2.3 > 1.2.2)
function compareVersions(a, b) {
    const pa = (a || '0.0.0').split('.').map(Number);
    const pb = (b || '0.0.0').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
}

export default router;
