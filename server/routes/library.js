// ═══════════════════════════════════════════════════════
// Library Routes — Biblioteca de módulos paramétricos (Sprint B1)
// 3 endpoints:
//   GET /api/library/manifest?since=v1.0.10    → plugin no startup
//   GET /api/library/asset/:id                 → plugin sob demanda
//   GET /api/library/search?q=...&...          → UI v2 search
// Auth: Bearer JWT (mesmo middleware do plugin.js)
// ═══════════════════════════════════════════════════════

import express, { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { requireAuth, requireRole } from '../auth.js';
import db from '../db.js';
import { validateModulePackage, ROLE_WHITELIST } from '../lib/library_validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const router = Router();

const ASSETS_DIR = process.env.ORNATO_LIBRARY_DIR
    || path.join(__dirname, '..', '..', 'data', 'library', 'assets');

// Helper — versão atual da biblioteca (de library_meta)
function getLibraryVersion() {
    const row = db.prepare(`SELECT value FROM library_meta WHERE key = 'library_version'`).get();
    return row?.value || '1.0.0';
}

// Comparador semver simples para "since=" — aceita "v1.2.3" ou "1.2.3"
function parseVer(v) {
    return (v || '0.0.0').replace(/^v/i, '').split('.').map(n => parseInt(n) || 0);
}
function cmpVer(a, b) {
    const pa = parseVer(a), pb = parseVer(b);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
}

// ───────────────────────────────────────────────────────
// GET /api/library/manifest[?since=v1.0.10]
// ───────────────────────────────────────────────────────
router.get('/manifest', requireAuth, (req, res) => {
    const since = (req.query.since || '').toString();
    const libVersion = getLibraryVersion();

    // Se since == versão atual, devolve vazio (sem mudanças)
    if (since && cmpVer(since, libVersion) >= 0) {
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.json({
            library_version: libVersion,
            generated_at: new Date().toISOString(),
            modules: [],
            deleted: [],
        });
    }

    // LIB-VARIATION: filtra global OR (private_org da empresa do user)
    const userOrgId = req.user?.empresa_id || 1;
    let allRows;
    if (hasVariationColumns()) {
        allRows = db.prepare(
            `SELECT id, name, category, version, sha256, size_bytes,
                    json_path, thumbnail_path, skp_refs, channel,
                    visibility, org_id, derived_from, derived_from_version
             FROM library_modules
             WHERE deleted_at IS NULL AND status = 'published'
               AND (visibility = 'global' OR (visibility = 'private_org' AND org_id = ?))`
        ).all(userOrgId);
    } else {
        allRows = db.prepare(
            `SELECT id, name, category, version, sha256, size_bytes,
                    json_path, thumbnail_path, skp_refs, channel
             FROM library_modules
             WHERE deleted_at IS NULL AND status = 'published'`
        ).all();
    }

    // Variation tem prioridade sobre global se ambos existem com mesmo `name`
    // (UI escolhe — aqui marcamos override via flag).
    const byName = new Map();
    for (const r of allRows) {
        const k = (r.name || '').toLowerCase();
        const cur = byName.get(k);
        // private_org sobrescreve global
        if (!cur || (r.visibility === 'private_org' && cur.visibility !== 'private_org')) {
            byName.set(k, r);
        }
    }
    const dedupedRows = Array.from(byName.values());

    const modules = dedupedRows
        .filter(r => !since || cmpVer(r.version, since) > 0)
        .map(r => ({
            id:            r.id,
            name:          r.name,
            category:      r.category,
            version:       r.version,
            sha256:        r.sha256,
            size_bytes:    r.size_bytes,
            thumbnail_url: r.thumbnail_path
                ? `/api/library/asset/${encodeURIComponent(r.thumbnail_path)}`
                : null,
            json_url:      `/api/library/asset/${encodeURIComponent(r.json_path)}`,
            skp_refs:      r.skp_refs ? JSON.parse(r.skp_refs) : [],
            channel:       r.channel,
            visibility:    r.visibility || 'global',
            derived_from:  r.derived_from || null,
        }));

    // Deleted (soft-delete): quando since vier, lista os deletados após since
    let deleted = [];
    if (since) {
        deleted = db.prepare(
            `SELECT id FROM library_modules
             WHERE deleted_at IS NOT NULL AND version > ?`
        ).all(since).map(r => r.id);
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.json({
        library_version: libVersion,
        generated_at:    new Date().toISOString(),
        modules,
        deleted,
    });
});

// ───────────────────────────────────────────────────────
// GET /api/library/asset/:id
// :id = "balcao_2_portas.json", "ferragens/dobradica.skp", "balcao_2_portas.thumb.png"
// ───────────────────────────────────────────────────────
// Aceita um ou mais segmentos de path (mas com path-traversal blocking)
router.get('/asset/:id(*)', requireAuth, (req, res) => {
    const rawId = req.params.id || '';
    if (!rawId || rawId.includes('\0') || rawId.length > 256) {
        return res.status(400).json({ error: 'asset id inválido' });
    }
    // Bloqueia traversal antes mesmo do resolve (defesa em profundidade)
    if (rawId.includes('..') || rawId.startsWith('/') || rawId.startsWith('\\')) {
        return res.status(400).json({ error: 'path traversal detectado' });
    }

    const baseDir  = path.resolve(ASSETS_DIR);
    const fullPath = path.resolve(baseDir, rawId);
    if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
        return res.status(400).json({ error: 'path traversal detectado' });
    }
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        return res.status(404).json({ error: 'asset não encontrado' });
    }

    const stat = fs.statSync(fullPath);
    // SHA-256 streaming (1 vez por request — assets são versionados/imutáveis,
    // poderíamos cachear, mas mantenho simples e correto por agora)
    const buf = fs.readFileSync(fullPath);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');

    // Content-Type por extensão
    const ext = path.extname(fullPath).toLowerCase();
    const ctMap = {
        '.json': 'application/json',
        '.png':  'image/png',
        '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
        '.skp':  'application/octet-stream',
    };
    res.setHeader('Content-Type',  ctMap[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-SHA256', sha);
    // Asset é imutável (mudou conteúdo → muda sha → muda manifest). Cache forte.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
});

// ───────────────────────────────────────────────────────
// GET /api/library/search
// q, category, largura_min/max, altura_min/max, profundidade_min/max,
// n_portas, n_gavetas, tags (CSV), sort=relevance|name|recent, page, per_page
// Response: { results, total, page, per_page, facets }
// ───────────────────────────────────────────────────────
router.get('/search', requireAuth, (req, res) => {
    const q         = (req.query.q || '').toString().trim();
    const category  = (req.query.category || '').toString().trim();
    const channel   = (req.query.channel  || '').toString().trim();
    const lmax = parseInt(req.query.largura_max);
    const lmin = parseInt(req.query.largura_min);
    const amax = parseInt(req.query.altura_max);
    const amin = parseInt(req.query.altura_min);
    const pmax = parseInt(req.query.profundidade_max);
    const pmin = parseInt(req.query.profundidade_min);
    const n_portas  = parseInt(req.query.n_portas);
    const n_gavetas = parseInt(req.query.n_gavetas);
    const tagsCsv   = (req.query.tags || '').toString().trim();
    const sortRaw   = (req.query.sort || '').toString().trim().toLowerCase();
    const sort = ['relevance','name','recent'].includes(sortRaw)
        ? sortRaw : (q ? 'relevance' : 'name');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const per_page = Math.min(100, Math.max(1, parseInt(req.query.per_page) || 20));
    const offset = (page - 1) * per_page;

    // Build WHERE/JOIN comum a busca + facets
    const joinFts = !!q;
    const where = [`m.deleted_at IS NULL`, `m.status = 'published'`];
    const params = [];
    let ftsParam = null;

    if (q) {
        const ftsQ = q.split(/\s+/).filter(Boolean)
            .map(t => t.replace(/["']/g, '') + '*').join(' ');
        where.push(`f.library_modules_fts MATCH ?`);
        ftsParam = ftsQ;
        params.push(ftsQ);
    }
    if (category)             { where.push(`m.category = ?`); params.push(category); }
    if (channel)              { where.push(`m.channel = ?`);  params.push(channel); }
    if (Number.isFinite(lmax)) { where.push(`(m.largura_max IS NULL OR m.largura_max <= ?)`); params.push(lmax); }
    if (Number.isFinite(lmin)) { where.push(`(m.largura_min IS NULL OR m.largura_min >= ?)`); params.push(lmin); }
    if (Number.isFinite(amax)) { where.push(`(m.altura_max  IS NULL OR m.altura_max  <= ?)`); params.push(amax); }
    if (Number.isFinite(amin)) { where.push(`(m.altura_min  IS NULL OR m.altura_min  >= ?)`); params.push(amin); }
    if (Number.isFinite(pmax)) { where.push(`(m.profundidade_max IS NULL OR m.profundidade_max <= ?)`); params.push(pmax); }
    if (Number.isFinite(pmin)) { where.push(`(m.profundidade_min IS NULL OR m.profundidade_min >= ?)`); params.push(pmin); }
    if (Number.isFinite(n_portas))  { where.push(`m.n_portas = ?`);  params.push(n_portas); }
    if (Number.isFinite(n_gavetas)) { where.push(`m.n_gavetas = ?`); params.push(n_gavetas); }
    if (tagsCsv) {
        for (const t of tagsCsv.split(',').map(s => s.trim()).filter(Boolean)) {
            // tags armazenadas como JSON array (TEXT) → LIKE em substring "tag"
            where.push(`(m.tags IS NOT NULL AND LOWER(m.tags) LIKE ?)`);
            params.push(`%"${t.toLowerCase()}"%`);
        }
    }

    const fromClause = joinFts
        ? `library_modules m JOIN library_modules_fts f ON f.rowid = m.rowid`
        : `library_modules m`;
    const whereSql = `WHERE ${where.join(' AND ')}`;

    // ORDER BY
    let orderSql;
    if (sort === 'relevance' && q) {
        orderSql = `ORDER BY bm25(library_modules_fts) ASC, m.name ASC`;
    } else if (sort === 'recent') {
        orderSql = `ORDER BY m.updated_at DESC, m.name ASC`;
    } else {
        orderSql = `ORDER BY m.category ASC, m.name ASC`;
    }

    let rows, total, facetRows;
    try {
        const sql = `SELECT m.* FROM ${fromClause} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
        rows = db.prepare(sql).all(...params, per_page, offset);
        const countSql = `SELECT COUNT(*) AS c FROM ${fromClause} ${whereSql}`;
        total = db.prepare(countSql).get(...params).c;

        // ── Facets — UNION ALL agregada em UMA query ──
        const facetSql = `
            SELECT 'category' AS facet, m.category AS value, COUNT(*) AS count
              FROM ${fromClause} ${whereSql}
              GROUP BY m.category
            UNION ALL
            SELECT 'channel', m.channel, COUNT(*)
              FROM ${fromClause} ${whereSql}
              GROUP BY m.channel
            UNION ALL
            SELECT 'n_portas', CAST(m.n_portas AS TEXT), COUNT(*)
              FROM ${fromClause} ${whereSql} AND m.n_portas IS NOT NULL
              GROUP BY m.n_portas
            UNION ALL
            SELECT 'n_gavetas', CAST(m.n_gavetas AS TEXT), COUNT(*)
              FROM ${fromClause} ${whereSql} AND m.n_gavetas IS NOT NULL
              GROUP BY m.n_gavetas`;
        // 4 grupos × params do where → repetir params 4×
        const fp = [...params, ...params, ...params, ...params];
        facetRows = db.prepare(facetSql).all(...fp);
    } catch (e) {
        return res.status(400).json({ error: 'query inválida', detail: e.message });
    }

    const facets = { category: [], channel: [], n_portas: [], n_gavetas: [] };
    for (const fr of facetRows) {
        if (!facets[fr.facet]) continue;
        const value = (fr.facet === 'n_portas' || fr.facet === 'n_gavetas')
            ? parseInt(fr.value) : fr.value;
        if (value === null || value === undefined || value === '' || Number.isNaN(value)) continue;
        facets[fr.facet].push({ value, count: fr.count });
    }
    facets.category.sort((a,b) => b.count - a.count);
    facets.channel.sort((a,b) => b.count - a.count);
    facets.n_portas.sort((a,b) => a.value - b.value);
    facets.n_gavetas.sort((a,b) => a.value - b.value);

    const results = rows.map(r => ({
        id:        r.id,
        name:      r.name,
        category:  r.category,
        channel:   r.channel,
        version:   r.version,
        sha256:    r.sha256,
        thumbnail_url: r.thumbnail_path
            ? `/api/library/asset/${encodeURIComponent(r.thumbnail_path)}`
            : null,
        json_url:  `/api/library/asset/${encodeURIComponent(r.json_path)}`,
        tags:      r.tags ? JSON.parse(r.tags) : [],
        largura_min: r.largura_min, largura_max: r.largura_max,
        altura_min:  r.altura_min,  altura_max:  r.altura_max,
        profundidade_min: r.profundidade_min, profundidade_max: r.profundidade_max,
        n_portas:    r.n_portas,    n_gavetas:   r.n_gavetas,
        updated_at:  r.updated_at,
    }));

    res.json({ results, total, page, per_page, sort, facets });
});

// ───────────────────────────────────────────────────────
// GET /api/library/autocomplete?q=balc&limit=8
// Typeahead — prefix match em name/id/category. Cache 60s.
// ───────────────────────────────────────────────────────
router.get('/autocomplete', requireAuth, (req, res) => {
    const q = (req.query.q || '').toString().trim();
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 8));
    if (!q) {
        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.json({ suggestions: [] });
    }
    const like = `${q.toLowerCase()}%`;
    const likeMid = `%${q.toLowerCase()}%`;
    const rows = db.prepare(`
        SELECT id, name, category,
               CASE
                 WHEN LOWER(name) LIKE ? THEN 0
                 WHEN LOWER(id)   LIKE ? THEN 1
                 ELSE 2
               END AS rank_pos
          FROM library_modules
         WHERE deleted_at IS NULL AND status = 'published'
           AND (LOWER(name) LIKE ? OR LOWER(id) LIKE ? OR LOWER(category) LIKE ?)
         ORDER BY rank_pos ASC, name ASC
         LIMIT ?`).all(like, like, likeMid, likeMid, likeMid, limit);

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ suggestions: rows.map(r => ({ id: r.id, name: r.name, category: r.category })) });
});

// ───────────────────────────────────────────────────────
// GET /api/library/filters — metadata pra UI montar filtros
// ───────────────────────────────────────────────────────
router.get('/filters', requireAuth, (req, res) => {
    const base = `FROM library_modules WHERE deleted_at IS NULL AND status = 'published'`;
    const categories = db.prepare(
        `SELECT category AS value, COUNT(*) AS count ${base} GROUP BY category ORDER BY category`
    ).all();
    const channels = db.prepare(
        `SELECT channel AS value, COUNT(*) AS count ${base} GROUP BY channel ORDER BY channel`
    ).all();
    const ranges = db.prepare(`
        SELECT
          MIN(largura_min)      AS lar_min, MAX(largura_max)      AS lar_max,
          MIN(altura_min)       AS alt_min, MAX(altura_max)       AS alt_max,
          MIN(profundidade_min) AS prof_min, MAX(profundidade_max) AS prof_max,
          MAX(n_portas)         AS n_portas_max,
          MAX(n_gavetas)        AS n_gavetas_max
        ${base}`).get();

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
        categories,
        channels,
        largura_range:      { min: ranges.lar_min,  max: ranges.lar_max },
        altura_range:       { min: ranges.alt_min,  max: ranges.alt_max },
        profundidade_range: { min: ranges.prof_min, max: ranges.prof_max },
        n_portas_max:  ranges.n_portas_max  || 0,
        n_gavetas_max: ranges.n_gavetas_max || 0,
    });
});

// ═══════════════════════════════════════════════════════
// ADMIN ENDPOINTS — curadoria da biblioteca (Sprint B4)
// Roles: 'admin' (admin_master) → tudo. 'library_curator' → CRUD em dev/beta.
//        'gerente'/'vendedor'   → 403.
// ═══════════════════════════════════════════════════════

const CURATOR_ROLES = ['admin', 'library_curator'];
const MASTER_ROLES  = ['admin'];

// Helper: garante que diretório de assets existe
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Multer em memória — sanitiza/move manualmente após validar
const adminUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB por arquivo
});

// ── helpers ────────────────────────────────────────────
function sanitizeId(raw) {
    return (raw || '').toString().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 80);
}

function safeAssetWrite(filename, buffer) {
    // Bloqueia traversal — filename deve ser relativo simples sem ".."
    if (!filename || filename.includes('..') || filename.includes('\0') ||
        filename.startsWith('/') || filename.startsWith('\\') || filename.length > 200) {
        throw new Error('filename inválido');
    }
    const baseDir = path.resolve(ASSETS_DIR);
    const dest = path.resolve(baseDir, filename);
    if (!dest.startsWith(baseDir + path.sep) && dest !== baseDir) {
        throw new Error('path traversal detectado');
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buffer);
    return dest;
}

function safeAssetDelete(filename) {
    if (!filename) return;
    const baseDir = path.resolve(ASSETS_DIR);
    const target = path.resolve(baseDir, filename);
    if (!target.startsWith(baseDir + path.sep)) return;
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        try { fs.unlinkSync(target); } catch (_) {}
    }
}

function sha256Buf(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

// Valida JSON paramétrico de um módulo. Retorna { ok, errors[] }.
function validateModuleJson(data) {
    const errs = [];
    if (!data || typeof data !== 'object') {
        return { ok: false, errors: ['JSON deve ser objeto'] };
    }
    if (!data.id || typeof data.id !== 'string') errs.push('id (string) obrigatório');
    if (!data.nome && !data.name) errs.push('nome/name obrigatório');
    if (!data.categoria && !data.category) errs.push('categoria/category obrigatória');
    if (!data.parametros || typeof data.parametros !== 'object') {
        errs.push('parametros (objeto) obrigatório');
    } else {
        for (const [k, p] of Object.entries(data.parametros)) {
            if (!p || typeof p !== 'object') { errs.push(`parametros.${k} inválido`); continue; }
            if (!p.type) errs.push(`parametros.${k}.type obrigatório`);
            if (p.default === undefined) errs.push(`parametros.${k}.default obrigatório`);
        }
    }
    if (!Array.isArray(data.pecas) || data.pecas.length === 0) {
        errs.push('pecas (array não-vazio) obrigatório');
    } else {
        data.pecas.forEach((p, i) => {
            if (!p.nome) errs.push(`pecas[${i}].nome obrigatório`);
            if (p.largura === undefined) errs.push(`pecas[${i}].largura obrigatório`);
            if (p.altura === undefined)  errs.push(`pecas[${i}].altura obrigatório`);
        });
    }
    return { ok: errs.length === 0, errors: errs };
}

function extractParamRange(params, key) {
    const p = params?.[key];
    if (!p) return [null, null];
    return [Number.isFinite(p.min) ? p.min : null, Number.isFinite(p.max) ? p.max : null];
}
function countDoorsDrawers(data) {
    const tags = (data.tags || []).join(' ').toLowerCase();
    const id = (data.id || '').toLowerCase();
    let n_portas = null, n_gavetas = null;
    const m = (s, kw) => { const r = s.match(new RegExp(`(\\d+)\\s*${kw}`)); return r ? parseInt(r[1]) : null; };
    n_portas  = m(id, 'portas?') || m(tags, 'portas?');
    n_gavetas = m(id, 'gavetas?') || m(tags, 'gavetas?');
    return { n_portas, n_gavetas };
}

function bumpLibraryVersion() {
    const row = db.prepare(`SELECT value FROM library_meta WHERE key='library_version'`).get();
    const cur = (row?.value || '1.0.0').replace(/^v/i, '').split('.').map(n => parseInt(n) || 0);
    cur[2] = (cur[2] || 0) + 1;
    const next = cur.join('.');
    db.prepare(`INSERT INTO library_meta (key,value,updated_at) VALUES ('library_version',?,CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`).run(next);
    return next;
}

function rowToAdminDto(r) {
    if (!r) return null;
    return {
        id: r.id, name: r.name, category: r.category,
        version: r.version, channel: r.channel, status: r.status,
        sha256: r.sha256, size_bytes: r.size_bytes,
        json_path: r.json_path, json_url: `/api/library/asset/${encodeURIComponent(r.json_path)}`,
        thumbnail_path: r.thumbnail_path,
        thumbnail_url: r.thumbnail_path ? `/api/library/asset/${encodeURIComponent(r.thumbnail_path)}` : null,
        skp_refs: r.skp_refs ? JSON.parse(r.skp_refs) : [],
        tags: r.tags ? JSON.parse(r.tags) : [],
        largura_min: r.largura_min, largura_max: r.largura_max,
        altura_min: r.altura_min, altura_max: r.altura_max,
        profundidade_min: r.profundidade_min, profundidade_max: r.profundidade_max,
        n_portas: r.n_portas, n_gavetas: r.n_gavetas,
        // LIB-VARIATION fields
        visibility:           r.visibility || 'global',
        org_id:               r.org_id ?? null,
        derived_from:         r.derived_from || null,
        derived_from_version: r.derived_from_version || null,
        created_at: r.created_at, updated_at: r.updated_at, deleted_at: r.deleted_at,
    };
}

// LIB-VARIATION: helper que verifica se uma coluna existe (compat para DBs sem migration 007)
let _hasVariationCols = null;
function hasVariationColumns() {
    if (_hasVariationCols !== null) return _hasVariationCols;
    try {
        const cols = db.prepare(`PRAGMA table_info(library_modules)`).all();
        _hasVariationCols = cols.some(c => c.name === 'visibility');
    } catch { _hasVariationCols = false; }
    return _hasVariationCols;
}

// LIB-VARIATION: hook chamado quando publica em stable. Detecta variações
// derivadas e cria uma notificação `library_origin_updates` por variação.
function notifyDerivationsOfStablePublish(originId, oldVersion, newVersion) {
    if (!hasVariationColumns()) return 0;
    try {
        const derivations = db.prepare(
            `SELECT id, org_id FROM library_modules
              WHERE derived_from = ? AND deleted_at IS NULL`
        ).all(originId);
        if (!derivations.length) return 0;

        // Marca pendências antigas como superseded (apenas a mais nova fica pending)
        db.prepare(
            `UPDATE library_origin_updates
                SET status = 'superseded'
              WHERE origin_module_id = ? AND status = 'pending'`
        ).run(originId);

        const ins = db.prepare(`INSERT INTO library_origin_updates
            (variation_module_id, origin_module_id, origin_old_version, origin_new_version, status)
            VALUES (?, ?, ?, ?, 'pending')`);
        let count = 0;
        for (const d of derivations) {
            ins.run(d.id, originId, oldVersion || null, newVersion || null);
            count++;
        }
        return count;
    } catch (e) {
        // best-effort; não bloqueia publish
        console.error('notifyDerivationsOfStablePublish:', e.message);
        return 0;
    }
}

// ───────────────────────────────────────────────────────
// GET /api/admin/library/modules?channel=&category=&status=&q=&include_deleted=
// ───────────────────────────────────────────────────────
router.get('/admin/modules', requireAuth, requireRole(...CURATOR_ROLES), (req, res) => {
    const { channel, category, status, q } = req.query;
    const includeDeleted = req.query.include_deleted === '1';
    // LIB-VARIATION: include_variations=true → admin vê variações da própria org
    const includeVariations = req.query.include_variations === 'true' || req.query.include_variations === '1';
    const userOrgId = req.user?.empresa_id || 1;
    const where = [];
    const params = [];
    if (!includeDeleted) where.push('deleted_at IS NULL');
    if (channel)  { where.push('channel = ?');  params.push(channel); }
    if (category) { where.push('category = ?'); params.push(category); }
    if (status)   { where.push('status = ?');   params.push(status); }
    if (q) {
        where.push('(LOWER(name) LIKE ? OR LOWER(id) LIKE ? OR LOWER(category) LIKE ?)');
        const like = `%${q.toString().toLowerCase()}%`;
        params.push(like, like, like);
    }
    // Visibility scope (apenas se a coluna existir)
    if (hasVariationColumns()) {
        if (includeVariations) {
            // global OU variações da própria org
            where.push(`(visibility = 'global' OR (visibility = 'private_org' AND org_id = ?))`);
            params.push(userOrgId);
        } else {
            where.push(`visibility = 'global'`);
        }
    }
    const sql = `SELECT * FROM library_modules
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY updated_at DESC LIMIT 500`;
    const rows = db.prepare(sql).all(...params);
    res.json({ modules: rows.map(rowToAdminDto), total: rows.length });
});

// ───────────────────────────────────────────────────────
// GET /api/admin/library/modules/:id  (admin: vê drafts)
// ───────────────────────────────────────────────────────
router.get('/admin/modules/:id', requireAuth, requireRole(...CURATOR_ROLES), (req, res) => {
    const id = sanitizeId(req.params.id);
    const row = db.prepare('SELECT * FROM library_modules WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'módulo não encontrado' });
    // LIB-VARIATION: variação privada só pode ser vista pela própria org
    if (hasVariationColumns() && row.visibility === 'private_org') {
        const userOrgId = req.user?.empresa_id || 1;
        if (row.org_id !== userOrgId) {
            return res.status(404).json({ error: 'módulo não encontrado' });
        }
    }
    // Inclui o JSON inline pra editor
    let json_content = null;
    try {
        const jsonPath = path.resolve(ASSETS_DIR, row.json_path);
        if (jsonPath.startsWith(path.resolve(ASSETS_DIR)) && fs.existsSync(jsonPath)) {
            json_content = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }
    } catch (_) {}
    res.json({ module: rowToAdminDto(row), json_content });
});

// ───────────────────────────────────────────────────────
// POST /api/admin/library/modules
// multipart: json_file, thumbnail (opcional), skp_files[] (opcional)
//           + body fields: channel, status, version
// ───────────────────────────────────────────────────────
router.post('/admin/modules', requireAuth, requireRole(...CURATOR_ROLES),
    adminUpload.fields([
        { name: 'json_file', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
        { name: 'skp_files', maxCount: 20 },
    ]),
    (req, res) => {
        try {
            const jsonFile = req.files?.json_file?.[0];
            if (!jsonFile) return res.status(400).json({ error: 'json_file obrigatório' });

            let data;
            try { data = JSON.parse(jsonFile.buffer.toString('utf8')); }
            catch (e) { return res.status(400).json({ error: 'JSON inválido', detail: e.message }); }

            const v = validateModuleJson(data);
            if (!v.ok) return res.status(400).json({ error: 'schema inválido', errors: v.errors });

            const id = sanitizeId(data.id);
            if (!id) return res.status(400).json({ error: 'id inválido' });

            // Conflito: já existe e não está deleted
            const existing = db.prepare('SELECT id FROM library_modules WHERE id = ? AND deleted_at IS NULL').get(id);
            if (existing) return res.status(409).json({ error: `módulo "${id}" já existe — use PUT` });

            const channel = ['dev','beta','stable'].includes(req.body.channel) ? req.body.channel : 'dev';
            const status  = ['draft','published','deprecated'].includes(req.body.status) ? req.body.status : 'draft';

            // Promover stable só admin master
            if (channel === 'stable' && !MASTER_ROLES.includes(req.user.role)) {
                return res.status(403).json({ error: 'apenas admin master pode publicar em stable' });
            }

            // Salvar JSON
            const jsonName = `${id}.json`;
            const buf = Buffer.from(JSON.stringify(data, null, 2));
            safeAssetWrite(jsonName, buf);
            const sha = sha256Buf(buf);
            const size = buf.length;

            // Thumbnail (opcional)
            let thumbName = null;
            const thumb = req.files?.thumbnail?.[0];
            if (thumb) {
                thumbName = `${id}.thumb.png`;
                safeAssetWrite(thumbName, thumb.buffer);
            }

            // SKP files (opcional)
            const skpRefs = [];
            for (const skp of (req.files?.skp_files || [])) {
                const safeBase = path.basename(skp.originalname).replace(/[^a-zA-Z0-9_\-.]/g, '_');
                const skpName = `skp/${id}/${safeBase}`;
                safeAssetWrite(skpName, skp.buffer);
                skpRefs.push(skpName);
            }

            const version = (req.body.version || `1.0.${Date.now() % 1000}`).toString();
            const tags = JSON.stringify(data.tags || []);
            const [larMin, larMax]   = extractParamRange(data.parametros, 'largura');
            const [altMin, altMax]   = extractParamRange(data.parametros, 'altura');
            const [profMin, profMax] = extractParamRange(data.parametros, 'profundidade');
            const { n_portas, n_gavetas } = countDoorsDrawers(data);

            db.prepare(`INSERT INTO library_modules
                (id, name, category, version, channel, status, json_path, skp_refs, thumbnail_path,
                 sha256, size_bytes, tags,
                 largura_min, largura_max, altura_min, altura_max,
                 profundidade_min, profundidade_max, n_portas, n_gavetas,
                 created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(
                id, data.nome || data.name, (data.categoria || data.category).toString(),
                version, channel, status, jsonName, JSON.stringify(skpRefs), thumbName,
                sha, size, tags,
                larMin, larMax, altMin, altMax, profMin, profMax, n_portas, n_gavetas
            );

            const row = db.prepare('SELECT * FROM library_modules WHERE id = ?').get(id);
            if (status === 'published' && channel === 'stable') bumpLibraryVersion();
            res.status(201).json({ module: rowToAdminDto(row) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
);

// ───────────────────────────────────────────────────────
// PUT /api/admin/library/modules/:id  — atualiza (re-upload assets)
// ───────────────────────────────────────────────────────
router.put('/admin/modules/:id', requireAuth, requireRole(...CURATOR_ROLES),
    adminUpload.fields([
        { name: 'json_file', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
        { name: 'skp_files', maxCount: 20 },
    ]),
    (req, res) => {
        try {
            const id = sanitizeId(req.params.id);
            const cur = db.prepare('SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL').get(id);
            if (!cur) return res.status(404).json({ error: 'módulo não encontrado' });

            // Curator não edita stable existente
            if (cur.channel === 'stable' && !MASTER_ROLES.includes(req.user.role)) {
                return res.status(403).json({ error: 'apenas admin master edita módulos em stable' });
            }

            // JSON novo? valida e regrava
            let data = null, sha = cur.sha256, size = cur.size_bytes, jsonName = cur.json_path;
            const jsonFile = req.files?.json_file?.[0];
            if (jsonFile) {
                try { data = JSON.parse(jsonFile.buffer.toString('utf8')); }
                catch (e) { return res.status(400).json({ error: 'JSON inválido', detail: e.message }); }
                const v = validateModuleJson(data);
                if (!v.ok) return res.status(400).json({ error: 'schema inválido', errors: v.errors });
                if (sanitizeId(data.id) !== id) {
                    return res.status(400).json({ error: 'JSON.id não bate com URL' });
                }
                const buf = Buffer.from(JSON.stringify(data, null, 2));
                safeAssetWrite(jsonName, buf);
                sha = sha256Buf(buf);
                size = buf.length;
            }

            // Thumbnail
            let thumbName = cur.thumbnail_path;
            const thumb = req.files?.thumbnail?.[0];
            if (thumb) {
                thumbName = `${id}.thumb.png`;
                safeAssetWrite(thumbName, thumb.buffer);
            }

            // SKP files (append)
            let skpRefs = cur.skp_refs ? JSON.parse(cur.skp_refs) : [];
            for (const skp of (req.files?.skp_files || [])) {
                const safeBase = path.basename(skp.originalname).replace(/[^a-zA-Z0-9_\-.]/g, '_');
                const skpName = `skp/${id}/${safeBase}`;
                safeAssetWrite(skpName, skp.buffer);
                if (!skpRefs.includes(skpName)) skpRefs.push(skpName);
            }

            const version = (req.body.version || cur.version).toString();
            const name     = data?.nome || data?.name || cur.name;
            const category = data ? (data.categoria || data.category || cur.category).toString() : cur.category;
            const tags     = data ? JSON.stringify(data.tags || []) : cur.tags;
            let larMin = cur.largura_min, larMax = cur.largura_max;
            let altMin = cur.altura_min,  altMax = cur.altura_max;
            let profMin = cur.profundidade_min, profMax = cur.profundidade_max;
            let n_portas = cur.n_portas, n_gavetas = cur.n_gavetas;
            if (data) {
                [larMin, larMax]   = extractParamRange(data.parametros, 'largura');
                [altMin, altMax]   = extractParamRange(data.parametros, 'altura');
                [profMin, profMax] = extractParamRange(data.parametros, 'profundidade');
                ({ n_portas, n_gavetas } = countDoorsDrawers(data));
            }

            db.prepare(`UPDATE library_modules SET
                name=?, category=?, version=?, json_path=?, skp_refs=?, thumbnail_path=?,
                sha256=?, size_bytes=?, tags=?,
                largura_min=?, largura_max=?, altura_min=?, altura_max=?,
                profundidade_min=?, profundidade_max=?, n_portas=?, n_gavetas=?,
                updated_at=CURRENT_TIMESTAMP
                WHERE id = ?`).run(
                name, category, version, jsonName, JSON.stringify(skpRefs), thumbName,
                sha, size, tags,
                larMin, larMax, altMin, altMax, profMin, profMax, n_portas, n_gavetas, id
            );

            const row = db.prepare('SELECT * FROM library_modules WHERE id = ?').get(id);
            if (row.status === 'published' && row.channel === 'stable') bumpLibraryVersion();
            res.json({ module: rowToAdminDto(row) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
);

// ───────────────────────────────────────────────────────
// PATCH /api/admin/library/modules/:id/publish
// body: { channel, status }
// dev → beta → stable. Curator: dev/beta. Admin master: stable.
// ───────────────────────────────────────────────────────
router.patch('/admin/modules/:id/publish', requireAuth, requireRole(...CURATOR_ROLES),
    express.json(),
    (req, res) => {
        const id = sanitizeId(req.params.id);
        const cur = db.prepare('SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL').get(id);
        if (!cur) return res.status(404).json({ error: 'módulo não encontrado' });

        const channel = req.body.channel || cur.channel;
        const status  = req.body.status  || 'published';

        if (!['dev','beta','stable'].includes(channel)) {
            return res.status(400).json({ error: 'channel inválido' });
        }
        if (!['draft','published','deprecated'].includes(status)) {
            return res.status(400).json({ error: 'status inválido' });
        }
        if (channel === 'stable' && !MASTER_ROLES.includes(req.user.role)) {
            return res.status(403).json({ error: 'apenas admin master publica em stable' });
        }

        db.prepare(`UPDATE library_modules SET channel=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
            .run(channel, status, id);

        let library_version = null;
        let derivations_notified = 0;
        if (status === 'published' && channel === 'stable') {
            library_version = bumpLibraryVersion();
            // LIB-VARIATION: notifica variações derivadas dessa origem global
            if (hasVariationColumns() && (cur.visibility === 'global' || !cur.visibility)) {
                derivations_notified = notifyDerivationsOfStablePublish(id, cur.version, cur.version);
            }
        }

        const row = db.prepare('SELECT * FROM library_modules WHERE id = ?').get(id);
        res.json({ module: rowToAdminDto(row), library_version, derivations_notified });
    }
);

// ───────────────────────────────────────────────────────
// DELETE /api/admin/library/modules/:id  — soft delete (admin master only)
// ───────────────────────────────────────────────────────
router.delete('/admin/modules/:id', requireAuth, requireRole(...MASTER_ROLES), (req, res) => {
    const id = sanitizeId(req.params.id);
    const cur = db.prepare('SELECT * FROM library_modules WHERE id = ?').get(id);
    if (!cur) return res.status(404).json({ error: 'módulo não encontrado' });
    if (cur.deleted_at) return res.json({ ok: true, already: true });
    db.prepare(`UPDATE library_modules SET deleted_at=CURRENT_TIMESTAMP, status='deprecated', updated_at=CURRENT_TIMESTAMP WHERE id = ?`)
      .run(id);
    if (cur.channel === 'stable') bumpLibraryVersion();
    res.json({ ok: true });
});

// ───────────────────────────────────────────────────────
// POST /api/admin/library/validate — valida JSON sem persistir
// ───────────────────────────────────────────────────────
router.post('/admin/validate', requireAuth, requireRole(...CURATOR_ROLES),
    adminUpload.single('json_file'),
    (req, res) => {
        const file = req.file;
        let raw = null;
        if (file) raw = file.buffer.toString('utf8');
        else if (typeof req.body?.json === 'string') raw = req.body.json;
        else if (req.body && typeof req.body === 'object' && req.body.json) {
            raw = JSON.stringify(req.body.json);
        }
        if (!raw) return res.status(400).json({ error: 'json_file ou body.json obrigatório' });

        let data;
        try { data = JSON.parse(raw); }
        catch (e) { return res.status(200).json({ ok: false, errors: ['JSON inválido: ' + e.message] }); }
        const v = validateModuleJson(data);
        const skp_refs_in_json = [];
        if (data && Array.isArray(data.pecas)) {
            for (const p of data.pecas) if (p.componente_3d) skp_refs_in_json.push(p.componente_3d);
        }
        res.json({ ...v, id: data?.id, skp_refs_in_json });
    }
);

// ═══════════════════════════════════════════════════════
// EDITORIAL WORKFLOW — checkout/checkin, versions, rollback, export/import
// (LIB-EDIT — migration 006)
// ═══════════════════════════════════════════════════════

const LOCK_TTL_MS = 30 * 60 * 1000; // 30 min

// Helper: limpa locks expirados (chamado oportunisticamente)
function pruneExpiredLocks() {
    db.prepare(`DELETE FROM library_locks WHERE expires_at < datetime('now')`).run();
}

// Helper: pega lock atual (ou null)
function getLock(moduleId) {
    pruneExpiredLocks();
    return db.prepare(`SELECT * FROM library_locks WHERE module_id = ?`).get(moduleId);
}

// Helper: lista materiais (códigos) — best effort em catálogo (tabela pode não existir)
function getMaterialCodes() {
    try {
        const rows = db.prepare(`SELECT codigo FROM catalogo_materiais WHERE codigo IS NOT NULL`).all();
        return rows.map(r => r.codigo);
    } catch {
        return [];
    }
}

// Helper: bump version semver — "1.0.13" → "1.0.14"
function bumpModuleVersion(cur) {
    const parts = (cur || '1.0.0').replace(/^v/i, '').split('.').map(n => parseInt(n) || 0);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
}

function audit(moduleId, user, action, detail) {
    try {
        db.prepare(`INSERT INTO library_audit (module_id, user_id, user_name, action, detail)
                    VALUES (?, ?, ?, ?, ?)`)
          .run(moduleId, user?.id || null, user?.nome || user?.email || null,
               action, typeof detail === 'string' ? detail : JSON.stringify(detail || {}));
    } catch (_) {}
}

// ───────────────────────────────────────────────────────
// POST /api/library/admin/modules/:id/checkout
// body JSON: { reason }
// ───────────────────────────────────────────────────────
router.post('/admin/modules/:id/checkout',
    requireAuth, requireRole(...CURATOR_ROLES), express.json(),
    (req, res) => {
        const id = sanitizeId(req.params.id);
        const cur = db.prepare(`SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL`).get(id);
        if (!cur) return res.status(404).json({ error: 'módulo não encontrado' });

        const existing = getLock(id);
        if (existing && existing.locked_by !== req.user.id) {
            return res.status(409).json({
                error: 'módulo já em edição',
                locked_by: existing.locked_by,
                locked_by_name: existing.locked_by_name,
                expires_at: existing.expires_at,
            });
        }

        const reason = (req.body?.reason || '').toString().slice(0, 200);
        const expires = new Date(Date.now() + LOCK_TTL_MS).toISOString();
        db.prepare(`INSERT INTO library_locks (module_id, locked_by, locked_by_name, expires_at, reason, locked_at, heartbeat_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    ON CONFLICT(module_id) DO UPDATE SET
                      locked_by=excluded.locked_by, locked_by_name=excluded.locked_by_name,
                      expires_at=excluded.expires_at, reason=excluded.reason,
                      heartbeat_at=CURRENT_TIMESTAMP`)
          .run(id, req.user.id, req.user.nome || req.user.email, expires, reason);

        audit(id, req.user, 'checkout', { reason });

        const skpRefs = cur.skp_refs ? JSON.parse(cur.skp_refs) : [];
        res.json({
            lock_token: `${id}:${req.user.id}:${Date.now()}`,
            expires_at: expires,
            json_url:      `/api/library/asset/${encodeURIComponent(cur.json_path)}`,
            asset_urls:    skpRefs.map(p => `/api/library/asset/${encodeURIComponent(p)}`),
            thumbnail_url: cur.thumbnail_path
                ? `/api/library/asset/${encodeURIComponent(cur.thumbnail_path)}` : null,
            module:        rowToAdminDto(cur),
        });
    }
);

// ───────────────────────────────────────────────────────
// POST /api/library/admin/modules/:id/heartbeat
// ───────────────────────────────────────────────────────
router.post('/admin/modules/:id/heartbeat',
    requireAuth, requireRole(...CURATOR_ROLES),
    (req, res) => {
        const id = sanitizeId(req.params.id);
        const lock = getLock(id);
        if (!lock || lock.locked_by !== req.user.id) {
            return res.status(409).json({ error: 'lock expirado ou não pertence ao usuário' });
        }
        const expires = new Date(Date.now() + LOCK_TTL_MS).toISOString();
        db.prepare(`UPDATE library_locks SET expires_at=?, heartbeat_at=CURRENT_TIMESTAMP WHERE module_id=?`)
          .run(expires, id);
        res.json({ expires_at: expires });
    }
);

// ───────────────────────────────────────────────────────
// POST /api/library/admin/modules/:id/release
// admin only — force unlock (audited)
// ───────────────────────────────────────────────────────
router.post('/admin/modules/:id/release',
    requireAuth, requireRole(...CURATOR_ROLES), express.json(),
    (req, res) => {
        const id = sanitizeId(req.params.id);
        const lock = getLock(id);
        if (!lock) return res.json({ ok: true, already: true });
        const isOwner = lock.locked_by === req.user.id;
        const isMaster = MASTER_ROLES.includes(req.user.role);
        if (!isOwner && !isMaster) {
            return res.status(403).json({ error: 'apenas dono do lock ou admin master pode liberar' });
        }
        db.prepare(`DELETE FROM library_locks WHERE module_id = ?`).run(id);
        audit(id, req.user, isOwner ? 'release' : 'force_unlock',
              { previous_owner: lock.locked_by_name });
        res.json({ ok: true, forced: !isOwner });
    }
);

// ───────────────────────────────────────────────────────
// POST /api/library/admin/modules/:id/checkin
// multipart: json (file), skp_files[], thumbnail, version_notes (field)
// Cria nova library_versions (status='draft') + atualiza library_modules.
// ───────────────────────────────────────────────────────
router.post('/admin/modules/:id/checkin',
    requireAuth, requireRole(...CURATOR_ROLES),
    adminUpload.fields([
        { name: 'json',       maxCount: 1 },
        { name: 'json_file',  maxCount: 1 },  // alias
        { name: 'thumbnail',  maxCount: 1 },
        { name: 'skp_files',  maxCount: 20 },
    ]),
    (req, res) => {
        try {
            const id = sanitizeId(req.params.id);
            const cur = db.prepare(`SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL`).get(id);
            if (!cur) return res.status(404).json({ error: 'módulo não encontrado' });

            const lock = getLock(id);
            if (!lock || lock.locked_by !== req.user.id) {
                return res.status(409).json({ error: 'lock expirado ou inválido — refaça checkout' });
            }

            const jsonFile = req.files?.json?.[0] || req.files?.json_file?.[0];
            if (!jsonFile) return res.status(400).json({ error: 'json obrigatório' });

            let data;
            try { data = JSON.parse(jsonFile.buffer.toString('utf8')); }
            catch (e) { return res.status(400).json({ error: 'JSON inválido', detail: e.message }); }

            // SKPs propostos: refs derivados dos arquivos enviados (relativos ao módulo)
            const proposedSkpRefs = [];
            for (const skp of (req.files?.skp_files || [])) {
                const safeBase = path.basename(skp.originalname).replace(/[^a-zA-Z0-9_\-.]/g, '_');
                proposedSkpRefs.push(`skp/${id}/${safeBase}`);
            }

            // Validação completa
            const validation = validateModulePackage({
                json: data,
                skpRefs: null,                       // checa só refs declaradas no JSON
                materials: getMaterialCodes(),
                role_normalizer_keys: ROLE_WHITELIST,
                assetsDir: ASSETS_DIR,
                isUniqueId: (cand) => cand === id || !db.prepare(
                    `SELECT 1 FROM library_modules WHERE id = ? AND deleted_at IS NULL`
                ).get(cand),
            });
            if (!validation.ok) {
                return res.status(400).json({
                    error: 'validação falhou',
                    errors: validation.errors,
                    warnings: validation.warnings,
                });
            }
            if (sanitizeId(data.id) !== id) {
                return res.status(400).json({ error: 'JSON.id não bate com URL' });
            }

            // Persistir nova versão = bump
            const newVersion = bumpModuleVersion(cur.version);
            const buf = Buffer.from(JSON.stringify(data, null, 2));
            const sha = sha256Buf(buf);
            const size = buf.length;

            // Salva JSON principal (substitui — versão antiga preservada em library_versions snapshot)
            const jsonName = cur.json_path || `${id}.json`;
            safeAssetWrite(jsonName, buf);

            // Salva thumbnail (opcional)
            let thumbName = cur.thumbnail_path;
            const thumb = req.files?.thumbnail?.[0];
            if (thumb) {
                thumbName = `${id}.thumb.png`;
                safeAssetWrite(thumbName, thumb.buffer);
            }

            // Salva SKPs (append não destrutivo)
            let skpRefs = cur.skp_refs ? JSON.parse(cur.skp_refs) : [];
            for (const skp of (req.files?.skp_files || [])) {
                const safeBase = path.basename(skp.originalname).replace(/[^a-zA-Z0-9_\-.]/g, '_');
                const skpName = `skp/${id}/${safeBase}`;
                safeAssetWrite(skpName, skp.buffer);
                if (!skpRefs.includes(skpName)) skpRefs.push(skpName);
            }

            const versionNotes = (req.body?.version_notes || '').toString().slice(0, 500);

            // Snapshot na library_versions (status='draft')
            db.prepare(`INSERT INTO library_versions
                (module_id, version, status, channel, json_snapshot, asset_paths, thumbnail_path,
                 sha256, size_bytes, created_by, notes)
                VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                id, newVersion, cur.channel,
                buf.toString('utf8'),
                JSON.stringify(skpRefs),
                thumbName,
                sha, size,
                req.user.id, versionNotes
            );

            // Atualiza library_modules (mantém status='draft' até publish explícito)
            db.prepare(`UPDATE library_modules SET
                version=?, json_path=?, skp_refs=?, thumbnail_path=?,
                sha256=?, size_bytes=?, status='draft', updated_at=CURRENT_TIMESTAMP
                WHERE id = ?`).run(
                newVersion, jsonName, JSON.stringify(skpRefs), thumbName, sha, size, id
            );

            // Libera lock
            db.prepare(`DELETE FROM library_locks WHERE module_id = ?`).run(id);

            audit(id, req.user, 'checkin', { version: newVersion, notes: versionNotes });

            const row = db.prepare(`SELECT * FROM library_modules WHERE id = ?`).get(id);
            res.json({
                ok: true,
                module: rowToAdminDto(row),
                new_version: newVersion,
                warnings: validation.warnings,
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
);

// ───────────────────────────────────────────────────────
// GET /api/library/admin/modules/:id/versions?limit=50
// ───────────────────────────────────────────────────────
router.get('/admin/modules/:id/versions',
    requireAuth, requireRole(...CURATOR_ROLES),
    (req, res) => {
        const id = sanitizeId(req.params.id);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const rows = db.prepare(`
            SELECT id, module_id, version, status, channel, sha256, size_bytes,
                   created_by, created_at, notes,
                   asset_paths, thumbnail_path
              FROM library_versions
             WHERE module_id = ?
             ORDER BY created_at DESC
             LIMIT ?`).all(id, limit);
        res.json({
            versions: rows.map(r => ({
                ...r,
                asset_paths: r.asset_paths ? JSON.parse(r.asset_paths) : [],
            })),
            total: rows.length,
        });
    }
);

// ───────────────────────────────────────────────────────
// POST /api/library/admin/modules/:id/rollback/:version_id
// admin only — restaura snapshot de uma versão antiga
// ───────────────────────────────────────────────────────
router.post('/admin/modules/:id/rollback/:version_id',
    requireAuth, requireRole(...MASTER_ROLES), express.json(),
    (req, res) => {
        try {
            const id = sanitizeId(req.params.id);
            const versionId = parseInt(req.params.version_id);
            const cur = db.prepare(`SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL`).get(id);
            if (!cur) return res.status(404).json({ error: 'módulo não encontrado' });
            const old = db.prepare(`SELECT * FROM library_versions WHERE id = ? AND module_id = ?`).get(versionId, id);
            if (!old) return res.status(404).json({ error: 'versão não encontrada' });

            // Conflito de lock
            const lock = getLock(id);
            if (lock && lock.locked_by !== req.user.id) {
                return res.status(409).json({ error: 'módulo em edição — não pode dar rollback' });
            }

            // Restaura JSON e thumb (assets .skp são append-only — preservados)
            const buf = Buffer.from(old.json_snapshot);
            const jsonName = cur.json_path || `${id}.json`;
            safeAssetWrite(jsonName, buf);
            const sha = sha256Buf(buf);

            const newVersion = bumpModuleVersion(cur.version);
            // Marca versão antiga
            db.prepare(`UPDATE library_versions SET status='rolled_back' WHERE id = ?`).run(versionId);
            // Cria nova versão referenciando snapshot antigo
            db.prepare(`INSERT INTO library_versions
                (module_id, version, status, channel, json_snapshot, asset_paths, thumbnail_path,
                 sha256, size_bytes, created_by, notes)
                VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                id, newVersion, cur.channel,
                old.json_snapshot,
                old.asset_paths,
                old.thumbnail_path,
                sha, buf.length,
                req.user.id, `rollback de v${old.version} (id ${versionId})`
            );

            db.prepare(`UPDATE library_modules SET
                version=?, json_path=?, sha256=?, size_bytes=?, status='draft',
                updated_at=CURRENT_TIMESTAMP WHERE id = ?`).run(
                newVersion, jsonName, sha, buf.length, id
            );

            audit(id, req.user, 'rollback', { from_version_id: versionId, restored_to: newVersion });

            const row = db.prepare(`SELECT * FROM library_modules WHERE id = ?`).get(id);
            res.json({ ok: true, module: rowToAdminDto(row), new_version: newVersion });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
);

// ───────────────────────────────────────────────────────
// GET /api/library/admin/modules/:id/export.zip
// pacote: module.json + asset.skp (todos) + thumbnail.png + metadata.json + README.txt
// ───────────────────────────────────────────────────────
router.get('/admin/modules/:id/export.zip',
    requireAuth, requireRole(...CURATOR_ROLES),
    (req, res) => {
        try {
            const id = sanitizeId(req.params.id);
            const cur = db.prepare(`SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL`).get(id);
            if (!cur) return res.status(404).json({ error: 'módulo não encontrado' });

            const zip = new AdmZip();
            const baseDir = path.resolve(ASSETS_DIR);

            // module.json
            const jsonAbs = path.resolve(baseDir, cur.json_path);
            if (jsonAbs.startsWith(baseDir) && fs.existsSync(jsonAbs)) {
                zip.addFile('module.json', fs.readFileSync(jsonAbs));
            }

            // skp files
            const skpRefs = cur.skp_refs ? JSON.parse(cur.skp_refs) : [];
            for (const ref of skpRefs) {
                const abs = path.resolve(baseDir, ref);
                if (abs.startsWith(baseDir) && fs.existsSync(abs)) {
                    zip.addFile(`assets/${path.basename(ref)}`, fs.readFileSync(abs));
                }
            }

            // thumbnail
            if (cur.thumbnail_path) {
                const tabs = path.resolve(baseDir, cur.thumbnail_path);
                if (tabs.startsWith(baseDir) && fs.existsSync(tabs)) {
                    zip.addFile('thumbnail.png', fs.readFileSync(tabs));
                }
            }

            // metadata.json
            const meta = {
                id: cur.id,
                name: cur.name,
                category: cur.category,
                version: cur.version,
                channel: cur.channel,
                status: cur.status,
                sha256: cur.sha256,
                size_bytes: cur.size_bytes,
                exported_at: new Date().toISOString(),
                exported_by: req.user?.email,
                skp_refs: skpRefs.map(r => path.basename(r)),
            };
            zip.addFile('metadata.json', Buffer.from(JSON.stringify(meta, null, 2)));

            // README.txt
            const readme =
`Ornato ERP — Library Module Export
====================================

Module ID:  ${cur.id}
Name:       ${cur.name}
Version:    ${cur.version} (${cur.channel}/${cur.status})
SHA-256:    ${cur.sha256}
Exported:   ${new Date().toISOString()}

Conteúdo do pacote:
  module.json     — definição paramétrica (id, parametros, pecas, ferragens_auto)
  assets/*.skp    — modelos SketchUp referenciados em componente_3d
  thumbnail.png   — preview (opcional)
  metadata.json   — info de export

Para importar em outro ambiente:
  POST /api/library/admin/import (multipart: file=<este.zip>, channel=dev)
  ou
  ruby tools/library_export_import.rb import <este.zip> --channel=dev
`;
            zip.addFile('README.txt', Buffer.from(readme));

            const out = zip.toBuffer();
            audit(id, req.user, 'export', { size: out.length });
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition',
                `attachment; filename="${id}-v${cur.version}.zip"`);
            res.setHeader('Content-Length', out.length);
            res.send(out);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
);

// ───────────────────────────────────────────────────────
// POST /api/library/admin/import
// multipart: file (zip), channel
// Cria draft (ou atualiza se id já existe e curator tem permissão).
// ───────────────────────────────────────────────────────
router.post('/admin/import',
    requireAuth, requireRole(...CURATOR_ROLES),
    adminUpload.single('file'),
    (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'file (zip) obrigatório' });
            const channel = ['dev','beta','stable'].includes(req.body?.channel) ? req.body.channel : 'dev';
            if (channel === 'stable' && !MASTER_ROLES.includes(req.user.role)) {
                return res.status(403).json({ error: 'apenas admin master importa em stable' });
            }

            let zip;
            try { zip = new AdmZip(req.file.buffer); }
            catch (e) { return res.status(400).json({ error: 'zip inválido', detail: e.message }); }

            const entries = zip.getEntries();
            const findEntry = (name) => entries.find(e => e.entryName === name || e.entryName.endsWith('/' + name));
            const moduleEntry = findEntry('module.json');
            if (!moduleEntry) return res.status(400).json({ error: 'module.json ausente no zip' });

            let data;
            try { data = JSON.parse(moduleEntry.getData().toString('utf8')); }
            catch (e) { return res.status(400).json({ error: 'module.json inválido', detail: e.message }); }

            const id = sanitizeId(data.id);
            if (!id) return res.status(400).json({ error: 'id inválido' });

            // Conflito de lock?
            const lock = getLock(id);
            if (lock && lock.locked_by !== req.user.id) {
                return res.status(409).json({
                    error: 'módulo em edição por outro usuário',
                    locked_by_name: lock.locked_by_name,
                });
            }

            // Salva SKPs primeiro
            const skpRefs = [];
            for (const e of entries) {
                if (e.entryName.startsWith('assets/') && e.entryName.toLowerCase().endsWith('.skp')) {
                    const base = path.basename(e.entryName).replace(/[^a-zA-Z0-9_\-.]/g, '_');
                    const ref = `skp/${id}/${base}`;
                    safeAssetWrite(ref, e.getData());
                    skpRefs.push(ref);
                }
            }

            // Validação
            const validation = validateModulePackage({
                json: data,
                materials: getMaterialCodes(),
                role_normalizer_keys: ROLE_WHITELIST,
                assetsDir: ASSETS_DIR,
                isUniqueId: () => true, // import permite atualizar existente
            });
            if (!validation.ok) {
                return res.status(400).json({
                    error: 'validação falhou', errors: validation.errors, warnings: validation.warnings,
                });
            }

            const buf = Buffer.from(JSON.stringify(data, null, 2));
            const sha = sha256Buf(buf);
            const jsonName = `${id}.json`;
            safeAssetWrite(jsonName, buf);

            // thumbnail
            let thumbName = null;
            const thumbEntry = findEntry('thumbnail.png');
            if (thumbEntry) {
                thumbName = `${id}.thumb.png`;
                safeAssetWrite(thumbName, thumbEntry.getData());
            }

            const tags = JSON.stringify(data.tags || []);
            const [larMin, larMax]   = extractParamRange(data.parametros, 'largura');
            const [altMin, altMax]   = extractParamRange(data.parametros, 'altura');
            const [profMin, profMax] = extractParamRange(data.parametros, 'profundidade');
            const { n_portas, n_gavetas } = countDoorsDrawers(data);
            const name = data.nome || data.name;
            const category = (data.categoria || data.category || 'imported').toString();

            const existing = db.prepare(`SELECT version FROM library_modules WHERE id = ?`).get(id);
            const nextVersion = existing ? bumpModuleVersion(existing.version) : (data.version || '1.0.0');

            db.prepare(`INSERT INTO library_modules
                (id, name, category, version, channel, status, json_path, skp_refs, thumbnail_path,
                 sha256, size_bytes, tags,
                 largura_min, largura_max, altura_min, altura_max,
                 profundidade_min, profundidade_max, n_portas, n_gavetas,
                 created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                  name=excluded.name, category=excluded.category, version=excluded.version,
                  channel=excluded.channel, status=excluded.status,
                  json_path=excluded.json_path, skp_refs=excluded.skp_refs, thumbnail_path=excluded.thumbnail_path,
                  sha256=excluded.sha256, size_bytes=excluded.size_bytes, tags=excluded.tags,
                  largura_min=excluded.largura_min, largura_max=excluded.largura_max,
                  altura_min=excluded.altura_min, altura_max=excluded.altura_max,
                  profundidade_min=excluded.profundidade_min, profundidade_max=excluded.profundidade_max,
                  n_portas=excluded.n_portas, n_gavetas=excluded.n_gavetas,
                  updated_at=CURRENT_TIMESTAMP, deleted_at=NULL`)
              .run(id, name, category, nextVersion, channel, 'draft', jsonName,
                   JSON.stringify(skpRefs), thumbName, sha, buf.length, tags,
                   larMin, larMax, altMin, altMax, profMin, profMax, n_portas, n_gavetas);

            // Snapshot na library_versions
            db.prepare(`INSERT OR IGNORE INTO library_versions
                (module_id, version, status, channel, json_snapshot, asset_paths, thumbnail_path,
                 sha256, size_bytes, created_by, notes)
                VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                id, nextVersion, channel, buf.toString('utf8'),
                JSON.stringify(skpRefs), thumbName, sha, buf.length,
                req.user.id, `imported via zip${existing ? ' (overwrote existing)' : ''}`
            );

            audit(id, req.user, 'import',
                  { version: nextVersion, channel, skp_count: skpRefs.length, overwrote: !!existing });

            const row = db.prepare(`SELECT * FROM library_modules WHERE id = ?`).get(id);
            res.status(201).json({
                ok: true, module: rowToAdminDto(row),
                imported_skps: skpRefs.length, warnings: validation.warnings,
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
);

// ═══════════════════════════════════════════════════════
// LIB-VARIATION — duplicação por marcenaria + notificações de origem
// ═══════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────
// POST /api/library/admin/modules/:id/duplicate-for-shop
// body: { new_id?, name? }
// Cria variação privada (visibility='private_org', org_id=user.empresa_id),
// status='draft', channel='dev', com derived_from = :id.
// ───────────────────────────────────────────────────────
router.post('/admin/modules/:id/duplicate-for-shop',
    requireAuth, requireRole(...CURATOR_ROLES), express.json(),
    (req, res) => {
        try {
            if (!hasVariationColumns()) {
                return res.status(500).json({ error: 'migration 007 não aplicada' });
            }
            const originId = sanitizeId(req.params.id);
            const origin = db.prepare(
                `SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL`
            ).get(originId);
            if (!origin) return res.status(404).json({ error: 'módulo origem não encontrado' });

            // Regra: só blocos GLOBAIS podem ser duplicados (variação não duplica variação)
            if (origin.visibility === 'private_org') {
                return res.status(400).json({
                    error: 'apenas blocos globais podem ser duplicados; este já é uma variação privada',
                });
            }

            const userOrgId = req.user?.empresa_id || 1;
            const requestedId = sanitizeId(req.body?.new_id || `${originId}_org${userOrgId}`);
            const requestedName = (req.body?.name || `${origin.name} (custom)`).toString().slice(0, 200);

            // Auto-gera ID único
            let newId = requestedId;
            let suffix = 1;
            while (db.prepare(`SELECT 1 FROM library_modules WHERE id = ?`).get(newId)) {
                newId = `${requestedId}_${suffix++}`;
                if (suffix > 99) return res.status(409).json({ error: 'não foi possível gerar id único' });
            }

            // Lê JSON da origem e ajusta id/nome
            const baseDir = path.resolve(ASSETS_DIR);
            const originJsonPath = path.resolve(baseDir, origin.json_path);
            if (!originJsonPath.startsWith(baseDir) || !fs.existsSync(originJsonPath)) {
                return res.status(500).json({ error: 'arquivo JSON da origem não encontrado no FS' });
            }
            let data;
            try { data = JSON.parse(fs.readFileSync(originJsonPath, 'utf8')); }
            catch (e) { return res.status(500).json({ error: 'JSON da origem inválido', detail: e.message }); }

            data.id = newId;
            if (data.nome) data.nome = requestedName; else data.name = requestedName;

            const buf = Buffer.from(JSON.stringify(data, null, 2));
            const sha = sha256Buf(buf);
            const newJsonName = `${newId}.json`;
            safeAssetWrite(newJsonName, buf);

            // Thumbnail: copia (mesmo arquivo no FS, novo path lógico)
            let newThumbName = null;
            if (origin.thumbnail_path) {
                const orgThumb = path.resolve(baseDir, origin.thumbnail_path);
                if (orgThumb.startsWith(baseDir) && fs.existsSync(orgThumb)) {
                    newThumbName = `${newId}.thumb.png`;
                    safeAssetWrite(newThumbName, fs.readFileSync(orgThumb));
                }
            }

            // SKPs: copia arquivos pra pasta nova do módulo
            const originSkps = origin.skp_refs ? JSON.parse(origin.skp_refs) : [];
            const newSkps = [];
            for (const ref of originSkps) {
                const orgAbs = path.resolve(baseDir, ref);
                if (!orgAbs.startsWith(baseDir) || !fs.existsSync(orgAbs)) continue;
                const safeBase = path.basename(ref);
                const newRef = `skp/${newId}/${safeBase}`;
                safeAssetWrite(newRef, fs.readFileSync(orgAbs));
                newSkps.push(newRef);
            }

            const tags = JSON.stringify(data.tags || []);
            db.prepare(`INSERT INTO library_modules
                (id, name, category, version, channel, status, json_path, skp_refs, thumbnail_path,
                 sha256, size_bytes, tags,
                 largura_min, largura_max, altura_min, altura_max,
                 profundidade_min, profundidade_max, n_portas, n_gavetas,
                 derived_from, derived_from_version, org_id, visibility,
                 created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(
                newId, requestedName, origin.category,
                '1.0.0', 'dev', 'draft',
                newJsonName, JSON.stringify(newSkps), newThumbName,
                sha, buf.length, tags,
                origin.largura_min, origin.largura_max,
                origin.altura_min,  origin.altura_max,
                origin.profundidade_min, origin.profundidade_max,
                origin.n_portas, origin.n_gavetas,
                originId, origin.version, userOrgId, 'private_org'
            );

            audit(newId, req.user, 'duplicate_for_shop',
                  { from: originId, from_version: origin.version, org_id: userOrgId });

            const row = db.prepare(`SELECT * FROM library_modules WHERE id = ?`).get(newId);
            res.status(201).json({ module: rowToAdminDto(row) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
);

// ───────────────────────────────────────────────────────
// GET /api/library/admin/origin-updates
// Lista atualizações pendentes pra variações da org do user
// ───────────────────────────────────────────────────────
router.get('/admin/origin-updates',
    requireAuth, requireRole(...CURATOR_ROLES),
    (req, res) => {
        if (!hasVariationColumns()) return res.json({ updates: [] });
        const userOrgId = req.user?.empresa_id || 1;
        const status = (req.query.status || 'pending').toString();
        const rows = db.prepare(`
            SELECT u.id, u.variation_module_id, u.origin_module_id,
                   u.origin_old_version, u.origin_new_version,
                   u.detected_at, u.acknowledged_at, u.status,
                   v.name AS variation_name, v.version AS variation_version,
                   o.name AS origin_name, o.version AS origin_current_version
              FROM library_origin_updates u
              JOIN library_modules v ON v.id = u.variation_module_id
              LEFT JOIN library_modules o ON o.id = u.origin_module_id
             WHERE v.org_id = ? AND v.visibility = 'private_org'
               AND v.deleted_at IS NULL
               AND u.status = ?
             ORDER BY u.detected_at DESC
             LIMIT 200`).all(userOrgId, status);
        res.json({ updates: rows, total: rows.length });
    }
);

// ───────────────────────────────────────────────────────
// POST /api/library/admin/origin-updates/:id/apply
// Aplica atualização: traz JSON novo da origem mas mantém customizações
// (smart merge dos parametros.*.default — values custom da variação prevalecem
// sobre defaults da origem; novos parametros adicionados pela origem entram).
// ───────────────────────────────────────────────────────
router.post('/admin/origin-updates/:id/apply',
    requireAuth, requireRole(...CURATOR_ROLES), express.json(),
    (req, res) => {
        try {
            if (!hasVariationColumns()) return res.status(500).json({ error: 'migration 007 não aplicada' });
            const updateId = parseInt(req.params.id);
            const userOrgId = req.user?.empresa_id || 1;

            const upd = db.prepare(
                `SELECT * FROM library_origin_updates WHERE id = ?`
            ).get(updateId);
            if (!upd) return res.status(404).json({ error: 'origin_update não encontrada' });
            if (upd.status !== 'pending') {
                return res.status(409).json({ error: `origin_update já está em status ${upd.status}` });
            }

            const variation = db.prepare(
                `SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL`
            ).get(upd.variation_module_id);
            if (!variation) return res.status(404).json({ error: 'variação não encontrada' });
            if (variation.org_id !== userOrgId) return res.status(403).json({ error: 'variação pertence a outra org' });

            const origin = db.prepare(
                `SELECT * FROM library_modules WHERE id = ? AND deleted_at IS NULL`
            ).get(upd.origin_module_id);
            if (!origin) return res.status(404).json({ error: 'origem não encontrada' });

            // Lock: não aplica se variação está em edição por outro
            const lock = getLock(variation.id);
            if (lock && lock.locked_by !== req.user.id) {
                return res.status(409).json({ error: 'variação em edição por outro usuário' });
            }

            const baseDir = path.resolve(ASSETS_DIR);
            const variationJsonPath = path.resolve(baseDir, variation.json_path);
            const originJsonPath    = path.resolve(baseDir, origin.json_path);

            let varData = {}, originData = {};
            try { varData    = JSON.parse(fs.readFileSync(variationJsonPath, 'utf8')); } catch (_) {}
            try { originData = JSON.parse(fs.readFileSync(originJsonPath,    'utf8')); } catch (_) {}

            // Smart merge: começa com origem nova, sobrescreve defaults com customizações da variação
            const merged = JSON.parse(JSON.stringify(originData));
            merged.id = variation.id; // preserva ID da variação
            merged.nome = varData.nome || varData.name || merged.nome || merged.name;
            // tags da variação (ex: customizações de etiqueta) prevalecem se houver
            if (Array.isArray(varData.tags) && varData.tags.length) merged.tags = varData.tags;

            // Preserva defaults customizados nos parametros existentes
            const customParamDefaults = {};
            if (varData.parametros && typeof varData.parametros === 'object') {
                for (const [k, p] of Object.entries(varData.parametros)) {
                    if (p && p.default !== undefined) customParamDefaults[k] = p.default;
                }
            }
            if (merged.parametros) {
                for (const [k, p] of Object.entries(merged.parametros)) {
                    if (k in customParamDefaults && p && typeof p === 'object') {
                        p.default = customParamDefaults[k];
                    }
                }
            }

            // Persiste JSON merged
            const buf = Buffer.from(JSON.stringify(merged, null, 2));
            const sha = sha256Buf(buf);
            const newVersion = bumpModuleVersion(variation.version);
            safeAssetWrite(variation.json_path, buf);

            // Snapshot na library_versions
            db.prepare(`INSERT INTO library_versions
                (module_id, version, status, channel, json_snapshot, asset_paths, thumbnail_path,
                 sha256, size_bytes, created_by, notes)
                VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                variation.id, newVersion, variation.channel,
                buf.toString('utf8'),
                variation.skp_refs || JSON.stringify([]),
                variation.thumbnail_path,
                sha, buf.length,
                req.user.id,
                `apply origin update: ${origin.id} v${upd.origin_old_version || '?'} → v${upd.origin_new_version || origin.version}`
            );

            db.prepare(`UPDATE library_modules SET
                version=?, sha256=?, size_bytes=?, status='draft',
                derived_from_version=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=?`).run(
                newVersion, sha, buf.length, origin.version, variation.id
            );

            db.prepare(`UPDATE library_origin_updates SET
                status='applied', acknowledged_at=CURRENT_TIMESTAMP, acknowledged_by=?
                WHERE id=?`).run(req.user.id, updateId);

            audit(variation.id, req.user, 'origin_update_applied',
                  { update_id: updateId, origin: origin.id, origin_new_version: origin.version });

            const row = db.prepare(`SELECT * FROM library_modules WHERE id = ?`).get(variation.id);
            res.json({ ok: true, module: rowToAdminDto(row), new_version: newVersion });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
);

// ───────────────────────────────────────────────────────
// POST /api/library/admin/origin-updates/:id/dismiss
// Ignora atualização: variação fica como está. Notificação some da lista pending.
// ───────────────────────────────────────────────────────
router.post('/admin/origin-updates/:id/dismiss',
    requireAuth, requireRole(...CURATOR_ROLES), express.json(),
    (req, res) => {
        if (!hasVariationColumns()) return res.status(500).json({ error: 'migration 007 não aplicada' });
        const updateId = parseInt(req.params.id);
        const userOrgId = req.user?.empresa_id || 1;
        const upd = db.prepare(`SELECT * FROM library_origin_updates WHERE id = ?`).get(updateId);
        if (!upd) return res.status(404).json({ error: 'origin_update não encontrada' });
        const variation = db.prepare(`SELECT org_id FROM library_modules WHERE id = ?`).get(upd.variation_module_id);
        if (!variation || variation.org_id !== userOrgId) {
            return res.status(403).json({ error: 'variação pertence a outra org' });
        }
        if (upd.status !== 'pending') {
            return res.status(409).json({ error: `origin_update já está em status ${upd.status}` });
        }
        db.prepare(`UPDATE library_origin_updates SET
            status='dismissed', acknowledged_at=CURRENT_TIMESTAMP, acknowledged_by=?
            WHERE id=?`).run(req.user.id, updateId);
        audit(upd.variation_module_id, req.user, 'origin_update_dismissed', { update_id: updateId });
        res.json({ ok: true });
    }
);

export default router;
