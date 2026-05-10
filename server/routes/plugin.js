// ═══════════════════════════════════════════════════════
// Plugin Routes — Download, versão e auto-update
// Protegido com auth — plugin SketchUp autentica via JWT
// ═══════════════════════════════════════════════════════

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { requireAuth, isAdmin } from '../auth.js';
import db from '../db.js';

// ─── requireAdmin middleware (local) ───────────────────
function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Apenas admin' });
    next();
}

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
// Se a query string tiver `channel`, delega ao handler novo (Sprint A2)
router.get('/download/:filename', requireAuth, (req, res, next) => {
    if (req.query.channel) return next(); // → handler channel-based abaixo

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

// ═══════════════════════════════════════════════════════
// SISTEMA DE RELEASES (channel-based) — Sprint A2
// Storage: data/plugin/releases/<channel>/<version>.rbz
// Tabela:  plugin_releases (migration 003)
// ═══════════════════════════════════════════════════════

const RELEASES_DIR = process.env.ORNATO_PLUGIN_DIR
    || path.join(__dirname, '..', '..', 'data', 'plugin', 'releases');

const VALID_CHANNELS = new Set(['dev', 'beta', 'stable']);

function findLatestRelease(channel, currentVersion) {
    // Busca todos publicados no canal e escolhe o maior > current via compareVersions
    const rows = db.prepare(
        `SELECT version, rbz_path, sha256, size_bytes, changelog, force_update, min_compat
         FROM plugin_releases
         WHERE channel = ? AND status = 'published'`
    ).all(channel);

    let best = null;
    for (const r of rows) {
        if (compareVersions(r.version, currentVersion || '0.0.0') > 0) {
            if (!best || compareVersions(r.version, best.version) > 0) best = r;
        }
    }
    return best;
}

// ─── GET /api/plugin/check-update ───────────────────────
// Suporta dois formatos:
//  - Legacy:  ?current_version=X.Y.Z         → version.json (clientes antigos)
//  - New:     ?current=X.Y.Z&channel=stable  → DB plugin_releases (Sprint A2)
router.get('/check-update', requireAuth, (req, res) => {
    const { current_version, current, channel } = req.query;

    // ── NEW path: channel-based (Sprint A2) ─────────────
    if (channel) {
        if (!VALID_CHANNELS.has(channel)) {
            return res.status(400).json({ error: 'channel inválido (use dev|beta|stable)' });
        }
        const cur = (current || current_version || '0.0.0').toString();
        const latest = findLatestRelease(channel, cur);

        const host = req.get('host');
        const protocol = req.protocol;

        if (!latest) {
            console.log(`[plugin] check-update channel=${channel} current=${cur} → up_to_date`);
            return res.json({ latest: cur, up_to_date: true });
        }

        console.log(`[plugin] check-update channel=${channel} current=${cur} → ${latest.version}`);
        return res.json({
            latest:     latest.version,
            url:        `${protocol}://${host}/api/plugin/download/${encodeURIComponent(latest.version)}.rbz?channel=${channel}`,
            sha256:     latest.sha256,
            force:      !!latest.force_update,
            changelog:  latest.changelog || '',
            min_compat: latest.min_compat || null,
            up_to_date: false,
        });
    }

    // ── LEGACY path (plugin SketchUp atual) ─────────────
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

// ─── GET /api/plugin/download/:version.rbz?channel=stable ──
// Stream do arquivo binário com header Content-SHA256.
// Path no disco: <RELEASES_DIR>/<channel>/<version>.rbz
//
// Compatível com legacy: rota /download/:filename já existe acima e cobre
// o caso "filename termina com .rbz mas é só nome de arquivo solto".
// Esta rota só ativa quando ?channel= for passado, deixando legacy intacto.
router.get('/download/:filename', requireAuth, (req, res, next) => {
    const channel = (req.query.channel || '').toString();
    if (!channel) return next(); // delega ao handler legacy registrado abaixo

    if (!VALID_CHANNELS.has(channel)) {
        return res.status(400).json({ error: 'channel inválido' });
    }

    const filename = req.params.filename;
    if (!filename.endsWith('.rbz') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'filename inválido' });
    }
    const version = filename.replace(/\.rbz$/, '');

    // Verifica licença ativa do user (= conta ativa). req.user populado por requireAuth.
    const u = req.user;
    if (!u || !u.id) return res.status(401).json({ error: 'não autenticado' });
    const userRow = db.prepare('SELECT ativo FROM users WHERE id = ?').get(u.id);
    if (!userRow || userRow.ativo !== 1) {
        return res.status(403).json({ error: 'licença inativa' });
    }

    // Busca registro na DB
    const rel = db.prepare(
        `SELECT version, rbz_path, sha256, size_bytes
         FROM plugin_releases
         WHERE version = ? AND channel = ? AND status IN ('published','deprecated')`
    ).get(version, channel);

    if (!rel) return res.status(404).json({ error: 'release não encontrado' });

    const filePath = path.resolve(RELEASES_DIR, rel.rbz_path);
    const baseDir = path.resolve(RELEASES_DIR);
    if (!filePath.startsWith(baseDir + path.sep)) {
        return res.status(400).json({ error: 'path traversal detectado' });
    }
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'arquivo .rbz ausente no storage' });
    }

    console.log(`[plugin] download user=${u.id} channel=${channel} version=${version}`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${version}.rbz"`);
    res.setHeader('Content-SHA256', rel.sha256);
    res.setHeader('Content-Length', rel.size_bytes);
    fs.createReadStream(filePath).pipe(res);
});

// ─── POST /api/plugin/telemetry ─────────────────────────
// Body: {plugin_version, os, sketchup_version, locale, install_id}
// Rate limit: 1 request por install_id por hora
router.post('/telemetry', requireAuth, (req, res) => {
    const { plugin_version, os, sketchup_version, locale, install_id } = req.body || {};
    if (!install_id || typeof install_id !== 'string' || install_id.length > 128) {
        return res.status(400).json({ error: 'install_id obrigatório' });
    }

    // Anti-flood: 1 por install_id por hora
    const recent = db.prepare(
        `SELECT id FROM plugin_telemetry
         WHERE install_id = ? AND created_at > datetime('now', '-1 hour')
         LIMIT 1`
    ).get(install_id);
    if (recent) {
        console.log(`[plugin] telemetry rate-limited install=${install_id}`);
        return res.status(429).json({ error: 'rate_limited', retry_after: 3600 });
    }

    db.prepare(
        `INSERT INTO plugin_telemetry (install_id, plugin_version, os, sketchup_version, locale)
         VALUES (?, ?, ?, ?, ?)`
    ).run(install_id,
          (plugin_version || '').toString().slice(0, 64),
          (os || '').toString().slice(0, 64),
          (sketchup_version || '').toString().slice(0, 64),
          (locale || '').toString().slice(0, 32));

    console.log(`[plugin] telemetry install=${install_id} v=${plugin_version} os=${os}`);
    res.json({ ok: true });
});

// ─── POST /api/plugin/error-report ──────────────────────
// Body: {error_class, message, stack, context, plugin_version, install_id}
router.post('/error-report', requireAuth, (req, res) => {
    const { error_class, message, stack, context, plugin_version, install_id } = req.body || {};
    if (!message && !error_class) {
        return res.status(400).json({ error: 'error_class ou message obrigatório' });
    }

    const ticket_id = crypto.randomUUID();
    db.prepare(
        `INSERT INTO plugin_error_reports
         (ticket_id, install_id, plugin_version, error_class, message, stack, context)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(ticket_id,
          (install_id || '').toString().slice(0, 128),
          (plugin_version || '').toString().slice(0, 64),
          (error_class || '').toString().slice(0, 128),
          (message || '').toString().slice(0, 4000),
          (stack || '').toString().slice(0, 16000),
          typeof context === 'string' ? context.slice(0, 8000) : JSON.stringify(context || {}).slice(0, 8000));

    console.log(`[plugin] error-report ticket=${ticket_id} class=${error_class} install=${install_id}`);
    res.json({ ok: true, ticket_id });
});

// ─── Biblioteca de Módulos (pública, sem auth) ──────
// Base: ornato-plugin/biblioteca/ — servida pelo ERP

const BIBLIOTECA_DIR = path.join(__dirname, '..', '..', 'ornato-plugin', 'biblioteca');

// Legacy fallback list (older clients / older folder layouts)
const LEGACY_CATEGORIAS_MOVEIS = ['cozinha', 'dormitorio', 'banheiro', 'escritorio', 'closet', 'area_servico', 'comercial', 'sala'];

// Slug validation for module ids (filename without extension).
// Keep it tight to avoid traversal and weird unicode issues.
function isValidSlug(s) {
    return typeof s === 'string' && /^[a-z0-9_-]{1,80}$/i.test(s);
}

function safeJoin(baseDir, ...parts) {
    const full = path.resolve(baseDir, ...parts);
    const base = path.resolve(baseDir);
    if (!full.startsWith(base + path.sep) && full !== base) return null;
    return full;
}

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

// ─────────────────────────────────────────────────────────────
// Biblioteca index (cached in memory; rebuilt if underlying dir mtime changes)
// ─────────────────────────────────────────────────────────────
let _moveisIndex = null; // { builtAtMs, rootMtimeMs, bySlug: Map, metaList: Array, categories: Array }

function getMoveisRootDir() {
    return safeJoin(BIBLIOTECA_DIR, 'moveis');
}

function statMtimeMs(p) {
    try { return fs.statSync(p).mtimeMs || 0; } catch { return 0; }
}

function walkJsonFiles(dir, out) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        if (ent.name.startsWith('.')) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walkJsonFiles(full, out);
        else if (ent.isFile() && ent.name.endsWith('.json')) out.push(full);
    }
}

function buildMoveisIndex() {
    const root = getMoveisRootDir();
    if (!root || !fs.existsSync(root)) {
        _moveisIndex = { builtAtMs: Date.now(), rootMtimeMs: 0, bySlug: new Map(), metaList: [], categories: [] };
        return _moveisIndex;
    }

    const files = [];
    walkJsonFiles(root, files);

    const bySlug = new Map();
    const metaList = [];
    const categories = new Set();

    for (const filePath of files) {
        const slug = path.basename(filePath, '.json');
        if (!isValidSlug(slug)) continue;
        const data = readJsonFile(filePath);
        if (!data) continue;

        const categoria = (data.categoria || path.basename(path.dirname(filePath)) || '').toString();
        if (categoria) categories.add(categoria);

        let id = (data.id || slug).toString();
        if (!isValidSlug(id)) id = slug;
        const meta = {
            id,
            slug,
            nome: data.nome,
            descricao: data.descricao,
            categoria,
            tags: data.tags,
            icone: data.icone,
            parametros: data.parametros,
            // Prefer explicit tipo_ruby if provided by JSON; otherwise infer from id/slug.
            tipo_ruby: (data.tipo_ruby || data.tipoRuby || null) || resolveRubyType(id || slug),
        };

        bySlug.set(slug, { filePath, data, meta });
        metaList.push(meta);
    }

    _moveisIndex = {
        builtAtMs: Date.now(),
        rootMtimeMs: statMtimeMs(root),
        bySlug,
        metaList,
        categories: Array.from(categories).sort(),
    };
    return _moveisIndex;
}

function ensureMoveisIndex() {
    const root = getMoveisRootDir();
    const mtime = root ? statMtimeMs(root) : 0;
    // Root dir mtime doesn't necessarily change when nested files change,
    // so also rebuild periodically as a cheap correctness safeguard.
    const tooOld = !_moveisIndex || (Date.now() - (_moveisIndex.builtAtMs || 0)) > 60_000;
    if (!_moveisIndex || _moveisIndex.rootMtimeMs !== mtime || tooOld) buildMoveisIndex();
    return _moveisIndex;
}

function listModules(category) {
    const idx = ensureMoveisIndex();
    if (!category) return idx.metaList.slice();
    return idx.metaList.filter(m => (m.categoria || '') === category);
}

// GET /api/plugin/biblioteca — índice de todas as categorias
router.get('/biblioteca', requireAuth, (req, res) => {
    const idx = ensureMoveisIndex();
    const result = {};
    for (const cat of (idx.categories.length ? idx.categories : LEGACY_CATEGORIAS_MOVEIS)) {
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
    if (categoria) {
        all = listModules(categoria.toString());
    } else {
        all = listModules(null);
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
    if (!isValidSlug(id)) return res.status(400).json({ error: 'ID inválido' });

    const idx = ensureMoveisIndex();
    const hit = idx.bySlug.get(id);
    if (hit?.data) {
        // Ensure minimal identity fields for consumers
        const payload = { ...hit.data };
        payload.id = payload.id || id;
        payload.slug = payload.slug || id;
        payload.categoria = payload.categoria || hit.meta.categoria || null;
        payload.tipo_ruby = payload.tipo_ruby || hit.meta.tipo_ruby || resolveRubyType(payload.id || id);
        return res.json(payload);
    }

    // Legacy fallback search (in case index is stale or folder layout differs)
    for (const cat of LEGACY_CATEGORIAS_MOVEIS) {
        const filePath = safeJoin(BIBLIOTECA_DIR, 'moveis', cat, `${id}.json`);
        if (!filePath) continue;
        if (fs.existsSync(filePath)) {
            const data = readJsonFile(filePath);
            if (data) return res.json({ ...data, slug: data.slug || id, tipo_ruby: data.tipo_ruby || resolveRubyType(data.id || id) });
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

// ═══════════════════════════════════════════════════════
// INTEGRAÇÃO PLUGIN ↔ ERP (Design → Orçamento)
// ═══════════════════════════════════════════════════════

// ─── GET /api/plugin/projeto/:id/info ───────────────────
// Retorna dados do orçamento/projeto para exibir no plugin
router.get('/projeto/:id/info', requireAuth, (req, res) => {
    const orc = db.prepare(
        `SELECT o.id, o.numero, o.cliente_nome, o.ambiente,
                o.valor_venda, o.status, o.criado_em,
                c.telefone as cliente_tel, c.email as cliente_email
         FROM orcamentos o
         LEFT JOIN clientes c ON o.cliente_id = c.id
         WHERE o.id = ?`
    ).get(req.params.id);

    if (!orc) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({
        id:           orc.id,
        numero:       orc.numero,
        cliente:      orc.cliente_nome,
        cliente_tel:  orc.cliente_tel,
        cliente_email: orc.cliente_email,
        ambiente:     orc.ambiente,
        valor_atual:  orc.valor_venda,
        status:       orc.status,
        criado_em:    orc.criado_em,
    });
});

// ─── POST /api/plugin/projeto/init ──────────────────────
// Inicia sessão de design — plugin envia numero/id do orçamento
// e recebe dados completos para exibir no painel
router.post('/projeto/init', requireAuth, (req, res) => {
    const { orc_id, numero } = req.body;

    let orc;
    if (orc_id) {
        orc = db.prepare(`SELECT * FROM orcamentos WHERE id = ?`).get(orc_id);
    } else if (numero) {
        orc = db.prepare(`SELECT * FROM orcamentos WHERE numero = ?`).get(numero);
    }

    if (!orc) {
        return res.status(404).json({ error: 'Orçamento não encontrado. Informe um número ou ID válido.' });
    }

    // Parse stored materials/modules from mods_json
    let ambientes = [];
    try {
        const data = JSON.parse(orc.mods_json || '{}');
        ambientes = data.ambientes || [];
    } catch (_) {}

    res.json({
        ok: true,
        projeto: {
            id:      orc.id,
            numero:  orc.numero,
            cliente: orc.cliente_nome,
            ambiente: orc.ambiente,
            status:  orc.status,
            valor_venda: orc.valor_venda,
            ambientes_count: ambientes.length,
        },
    });
});

// ─── POST /api/plugin/projeto/:id/bom ───────────────────
// Push BOM ao vivo — plugin envia lista de peças enquanto o
// usuário projeta; retorna custo estimado em tempo real
router.post('/projeto/:id/bom', requireAuth, (req, res) => {
    const { modulos, pecas, total_pecas, materiais } = req.body;
    const orc_id = req.params.id;

    // Verifica existência
    const orc = db.prepare(`SELECT id, mods_json FROM orcamentos WHERE id = ?`).get(orc_id);
    if (!orc) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Calcula custo estimado de material com base no estoque
    let custo_estimado = 0;
    const preco_por_peca = [];

    if (Array.isArray(pecas)) {
        pecas.forEach(p => {
            // Tenta encontrar material no estoque para precificação
            const mat = p.material ? db.prepare(
                `SELECT preco FROM estoque WHERE codigo = ? OR nome LIKE ? LIMIT 1`
            ).get(p.material, `%${p.material}%`) : null;

            const area_m2 = ((p.largura || 0) * (p.comprimento || p.altura || 0)) / 1_000_000;
            const preco_unit = mat?.preco || 0;
            const custo = area_m2 * preco_unit;
            custo_estimado += custo;
            preco_por_peca.push({ nome: p.nome, material: p.material, custo: custo.toFixed(2) });
        });
    }

    // Salva snapshot do BOM no orçamento (campo plugin_bom)
    try {
        db.prepare(
            `UPDATE orcamentos SET plugin_bom = ?, atualizado_em = datetime('now')
             WHERE id = ?`
        ).run(JSON.stringify({ modulos, pecas, total_pecas, materiais, custo_estimado, updated_at: new Date().toISOString() }), orc_id);
    } catch (_) {
        // plugin_bom column may not exist yet — ignore gracefully
    }

    res.json({
        ok: true,
        custo_estimado: custo_estimado.toFixed(2),
        total_pecas: total_pecas || (pecas?.length || 0),
        preco_por_peca: preco_por_peca.slice(0, 20), // top 20
    });
});

// ─── GET /api/plugin/projeto/:id/bom ────────────────────
// Retorna BOM salvo mais recente para um projeto
router.get('/projeto/:id/bom', requireAuth, (req, res) => {
    const orc = db.prepare(`SELECT plugin_bom FROM orcamentos WHERE id = ?`).get(req.params.id);
    if (!orc) return res.status(404).json({ error: 'Projeto não encontrado' });
    const bom = orc.plugin_bom ? JSON.parse(orc.plugin_bom) : {};
    res.json(bom);
});

// ─── POST /api/plugin/projeto/:id/proposta ──────────────
// Cria/atualiza proposta a partir do design SketchUp
// Preenche ambientes + materiais do orçamento com os dados do plugin
router.post('/projeto/:id/proposta', requireAuth, (req, res) => {
    const { design_summary, modulos, pecas, imagem_base64 } = req.body;
    const orc_id = req.params.id;

    const orc = db.prepare(`SELECT * FROM orcamentos WHERE id = ?`).get(orc_id);
    if (!orc) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Montar novo ambiente do orçamento a partir do design
    let existingData = {};
    try { existingData = JSON.parse(orc.mods_json || '{}'); } catch (_) {}

    // Criar ambiente "SketchUp Design" com os módulos
    const novoAmbiente = {
        nome: design_summary?.ambiente || 'Design SketchUp',
        modulos: (modulos || []).map(m => ({
            id:          m.type || 'generico',
            nome:        m.label || m.name || m.type,
            largura:     m.params?.largura || 0,
            altura:      m.params?.altura || 0,
            profundidade: m.params?.profundidade || 0,
            material:    m.params?.material || '',
            quantidade:  1,
            preco:       0,
        })),
        pecas_total: pecas?.length || 0,
    };

    // Adicionar ou substituir ambiente SKP
    const ambientes = (existingData.ambientes || []).filter(a => a.nome !== 'Design SketchUp');
    ambientes.push(novoAmbiente);
    existingData.ambientes = ambientes;

    // Atualizar mods_json
    db.prepare(
        `UPDATE orcamentos SET mods_json = ?, atualizado_em = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(existingData), orc_id);

    // URL da proposta no ERP
    const host = req.get('host');
    const protocol = req.protocol;
    const proposta_url = `${protocol}://${host}/proposta/${orc.numero}`;

    res.json({
        ok: true,
        orc_id:      orc.id,
        numero:      orc.numero,
        proposta_url,
        ambientes_total: ambientes.length,
        modulos_inseridos: novoAmbiente.modulos.length,
    });
});

// ═══════════════════════════════════════════════════════
// ADMIN — gerenciamento de releases (Sprint A4)
// ═══════════════════════════════════════════════════════

// Multer em memória — escrevemos no disco só após validar checksum/version/etc
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        if (!/\.rbz$/i.test(file.originalname)) return cb(new Error('Arquivo deve ter extensão .rbz'));
        cb(null, true);
    },
});

const VERSION_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9._-]+)?$/;

function ensureDirSync(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── POST /api/plugin/releases ─────────────────────────
// multipart: file (.rbz) + version + channel + changelog? + force_update? + min_compat?
router.post('/releases', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
    try {
        const { version, channel, changelog, force_update, min_compat } = req.body || {};
        if (!req.file) return res.status(400).json({ error: 'Arquivo .rbz obrigatório' });
        if (!version || !VERSION_RE.test(version)) {
            return res.status(400).json({ error: 'version inválida (use semver: 1.2.3 ou 1.2.3-beta1)' });
        }
        if (!VALID_CHANNELS.has(channel)) {
            return res.status(400).json({ error: 'channel inválido (use dev|beta|stable)' });
        }

        // Path traversal block — version já foi regex-validada, mas seguimos defensivos
        const safeName = `${version}.rbz`;
        const targetDir = path.resolve(RELEASES_DIR, channel);
        const targetPath = path.resolve(targetDir, safeName);
        if (!targetPath.startsWith(path.resolve(RELEASES_DIR) + path.sep)) {
            return res.status(400).json({ error: 'path traversal' });
        }

        // Já existe?
        const existing = db.prepare(
            `SELECT id FROM plugin_releases WHERE version = ? AND channel = ?`
        ).get(version, channel);
        if (existing) {
            return res.status(409).json({ error: `release ${version} já existe no canal ${channel}` });
        }

        const buf = req.file.buffer;
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
        const size_bytes = buf.length;

        ensureDirSync(targetDir);
        fs.writeFileSync(targetPath, buf);

        // rbz_path relativo ao RELEASES_DIR (consistente com handler de download)
        const rbz_path = path.join(channel, safeName);

        const stmt = db.prepare(
            `INSERT INTO plugin_releases (version, channel, status, rbz_path, sha256, size_bytes, changelog, force_update, min_compat)
             VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?)`
        );
        const info = stmt.run(
            version, channel, rbz_path, sha256, size_bytes,
            (changelog || '').toString().slice(0, 16000),
            force_update === '1' || force_update === 'true' || force_update === true ? 1 : 0,
            (min_compat || '').toString().slice(0, 32) || null,
        );

        console.log(`[plugin] release uploaded id=${info.lastInsertRowid} v=${version} ch=${channel} size=${size_bytes}`);
        const row = db.prepare(`SELECT * FROM plugin_releases WHERE id = ?`).get(info.lastInsertRowid);
        res.json({ ok: true, release: row });
    } catch (err) {
        console.error('[plugin] release upload error:', err);
        res.status(500).json({ error: err.message || 'Erro ao salvar release' });
    }
});

// ─── GET /api/plugin/releases?channel=stable ───────────
router.get('/releases', requireAuth, requireAdmin, (req, res) => {
    const { channel, status } = req.query;
    const where = [];
    const params = [];
    if (channel) {
        if (!VALID_CHANNELS.has(channel)) return res.status(400).json({ error: 'channel inválido' });
        where.push('channel = ?'); params.push(channel);
    }
    if (status) {
        if (!['draft', 'published', 'deprecated'].includes(status)) return res.status(400).json({ error: 'status inválido' });
        where.push('status = ?'); params.push(status);
    }
    const sql = `SELECT id, version, channel, status, sha256, size_bytes, changelog, force_update, min_compat, created_at, published_at
                 FROM plugin_releases ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY datetime(created_at) DESC`;
    const rows = db.prepare(sql).all(...params);
    res.json({ releases: rows });
});

// ─── PATCH /api/plugin/releases/:id ────────────────────
router.patch('/releases/:id', requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const row = db.prepare(`SELECT * FROM plugin_releases WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: 'release não encontrado' });

    const { status, force_update, changelog, channel } = req.body || {};

    const updates = [];
    const params = [];
    if (status !== undefined) {
        if (!['draft', 'published', 'deprecated'].includes(status)) return res.status(400).json({ error: 'status inválido' });
        updates.push('status = ?'); params.push(status);
        if (status === 'published' && !row.published_at) {
            updates.push("published_at = datetime('now')");
        }
    }
    if (force_update !== undefined) {
        updates.push('force_update = ?'); params.push(force_update ? 1 : 0);
    }
    if (changelog !== undefined) {
        updates.push('changelog = ?'); params.push((changelog || '').toString().slice(0, 16000));
    }
    // PROMOTE: mover release pra outro canal (dev→beta→stable)
    if (channel !== undefined && channel !== row.channel) {
        if (!VALID_CHANNELS.has(channel)) return res.status(400).json({ error: 'channel inválido' });
        // Bloqueia colisão (mesmo version já existe no destino)
        const dup = db.prepare(`SELECT id FROM plugin_releases WHERE version = ? AND channel = ? AND id != ?`).get(row.version, channel, id);
        if (dup) return res.status(409).json({ error: `version ${row.version} já existe no canal ${channel}` });

        // Copiar arquivo .rbz para o novo canal
        const srcPath = path.resolve(RELEASES_DIR, row.rbz_path);
        const newRel = path.join(channel, `${row.version}.rbz`);
        const dstPath = path.resolve(RELEASES_DIR, newRel);
        const baseDir = path.resolve(RELEASES_DIR);
        if (!dstPath.startsWith(baseDir + path.sep)) return res.status(400).json({ error: 'path traversal' });
        if (fs.existsSync(srcPath)) {
            ensureDirSync(path.dirname(dstPath));
            fs.copyFileSync(srcPath, dstPath);
        }
        updates.push('channel = ?'); params.push(channel);
        updates.push('rbz_path = ?'); params.push(newRel);
    }

    if (!updates.length) return res.status(400).json({ error: 'nada pra atualizar' });
    params.push(id);
    db.prepare(`UPDATE plugin_releases SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare(`SELECT * FROM plugin_releases WHERE id = ?`).get(id);
    console.log(`[plugin] release patch id=${id} updates=${updates.join(',')}`);
    res.json({ ok: true, release: updated });
});

// ─── DELETE /api/plugin/releases/:id ───────────────────
router.delete('/releases/:id', requireAuth, requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });
    const row = db.prepare(`SELECT * FROM plugin_releases WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: 'release não encontrado' });

    // Apaga DB + arquivo (best-effort)
    db.prepare(`DELETE FROM plugin_releases WHERE id = ?`).run(id);
    try {
        const filePath = path.resolve(RELEASES_DIR, row.rbz_path);
        const baseDir = path.resolve(RELEASES_DIR);
        if (filePath.startsWith(baseDir + path.sep) && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.warn('[plugin] delete file failed:', e.message);
    }
    console.log(`[plugin] release deleted id=${id} v=${row.version} ch=${row.channel}`);
    res.json({ ok: true });
});

// ─── GET /api/plugin/telemetry ─────────────────────────
// Agregação de installs por versão/dia
router.get('/telemetry', requireAuth, requireAdmin, (req, res) => {
    const { since, group_by } = req.query;
    const sinceClause = since ? `WHERE created_at >= ?` : `WHERE created_at >= datetime('now', '-30 days')`;
    const params = since ? [since] : [];

    if (group_by === 'version') {
        const rows = db.prepare(
            `SELECT plugin_version as version, COUNT(DISTINCT install_id) as installs
             FROM plugin_telemetry ${sinceClause}
             GROUP BY plugin_version
             ORDER BY installs DESC`
        ).all(...params);
        return res.json({ group_by: 'version', rows });
    }
    if (group_by === 'os') {
        const rows = db.prepare(
            `SELECT os, COUNT(DISTINCT install_id) as installs
             FROM plugin_telemetry ${sinceClause}
             GROUP BY os ORDER BY installs DESC`
        ).all(...params);
        return res.json({ group_by: 'os', rows });
    }
    // Default: por dia
    const rows = db.prepare(
        `SELECT date(created_at) as day, COUNT(DISTINCT install_id) as installs
         FROM plugin_telemetry ${sinceClause}
         GROUP BY date(created_at)
         ORDER BY day ASC`
    ).all(...params);
    res.json({ group_by: 'day', rows });
});

// ─── GET /api/plugin/error-reports ─────────────────────
router.get('/error-reports', requireAuth, requireAdmin, (req, res) => {
    const { install_id, version, q, limit } = req.query;
    const where = [];
    const params = [];
    if (install_id) { where.push('install_id = ?'); params.push(install_id); }
    if (version) { where.push('plugin_version = ?'); params.push(version); }
    if (q) {
        where.push('(message LIKE ? OR error_class LIKE ?)');
        params.push(`%${q}%`, `%${q}%`);
    }
    const lim = Math.min(parseInt(limit) || 200, 1000);
    const sql = `SELECT id, ticket_id, install_id, plugin_version, error_class, message, created_at
                 FROM plugin_error_reports ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY datetime(created_at) DESC LIMIT ${lim}`;
    const rows = db.prepare(sql).all(...params);
    res.json({ reports: rows });
});

// ─── GET /api/plugin/error-reports/:ticket_id ──────────
router.get('/error-reports/:ticket_id', requireAuth, requireAdmin, (req, res) => {
    const row = db.prepare(`SELECT * FROM plugin_error_reports WHERE ticket_id = ?`).get(req.params.ticket_id);
    if (!row) return res.status(404).json({ error: 'ticket não encontrado' });
    res.json(row);
});

// ─── GET /api/plugin/health ─────────────────────────────
// Ping rápido para testar conectividade
router.get('/health', (req, res) => {
    res.json({ ok: true, server: 'Ornato ERP', time: new Date().toISOString() });
});

export default router;
