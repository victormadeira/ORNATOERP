// ═══════════════════════════════════════════════════════
// Seed inicial — biblioteca Ornato (Sprint B1)
// Lê todos os JSONs paramétricos em ornato-plugin/biblioteca/moveis/**
// → copia para data/library/assets/<id>.json
// → upserta row em library_modules
//
// Roda: node server/scripts/seed_library.js
// Idempotente — pode ser executado múltiplas vezes.
// ═══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BIB_ROOT  = path.join(REPO_ROOT, 'ornato-plugin', 'biblioteca', 'moveis');
const ASSETS_DIR = process.env.ORNATO_LIBRARY_DIR
    || path.join(REPO_ROOT, 'data', 'library', 'assets');

const LIB_VERSION = process.env.LIBRARY_VERSION || `1.0.${Date.now() % 1000}`;
const CHANNEL = 'stable';
const STATUS  = 'published';

const SKIP_DIRS = new Set(['wps_imported']); // não usados (Sprint A confirmou)

fs.mkdirSync(ASSETS_DIR, { recursive: true });

function sha256File(p) {
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(p));
    return h.digest('hex');
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith('.')) continue;
        if (SKIP_DIRS.has(ent.name)) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, out);
        else if (ent.isFile() && ent.name.endsWith('.json')) out.push(full);
    }
    return out;
}

function extractParamRange(params, key) {
    const p = params?.[key];
    if (!p) return [null, null];
    return [Number.isFinite(p.min) ? p.min : null, Number.isFinite(p.max) ? p.max : null];
}

function countDoorsDrawers(data) {
    // Heurística por tags + por id
    const tags = (data.tags || []).join(' ').toLowerCase();
    const id = (data.id || '').toLowerCase();
    let n_portas = null, n_gavetas = null;
    const matchN = (s, kw) => {
        const m = s.match(new RegExp(`(\\d+)\\s*${kw}`));
        return m ? parseInt(m[1]) : null;
    };
    n_portas  = matchN(id, 'portas?') || matchN(tags, 'portas?');
    n_gavetas = matchN(id, 'gavetas?') || matchN(tags, 'gavetas?');
    if (id.includes('1porta')) n_portas = n_portas || 1;
    if (id.includes('2portas')) n_portas = n_portas || 2;
    if (id.includes('3portas')) n_portas = n_portas || 3;
    return { n_portas, n_gavetas };
}

const upsert = db.prepare(`
    INSERT INTO library_modules
        (id, name, category, version, channel, status, json_path, skp_refs,
         thumbnail_path, sha256, size_bytes, tags,
         largura_min, largura_max, altura_min, altura_max,
         profundidade_min, profundidade_max, n_portas, n_gavetas,
         created_at, updated_at)
    VALUES
        (@id, @name, @category, @version, @channel, @status, @json_path, @skp_refs,
         @thumbnail_path, @sha256, @size_bytes, @tags,
         @largura_min, @largura_max, @altura_min, @altura_max,
         @profundidade_min, @profundidade_max, @n_portas, @n_gavetas,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, category=excluded.category, version=excluded.version,
        channel=excluded.channel, status=excluded.status,
        json_path=excluded.json_path, skp_refs=excluded.skp_refs,
        thumbnail_path=excluded.thumbnail_path,
        sha256=excluded.sha256, size_bytes=excluded.size_bytes,
        tags=excluded.tags,
        largura_min=excluded.largura_min, largura_max=excluded.largura_max,
        altura_min=excluded.altura_min,   altura_max=excluded.altura_max,
        profundidade_min=excluded.profundidade_min, profundidade_max=excluded.profundidade_max,
        n_portas=excluded.n_portas, n_gavetas=excluded.n_gavetas,
        updated_at=CURRENT_TIMESTAMP
`);

const setMeta = db.prepare(`
    INSERT INTO library_meta (key, value, updated_at)
    VALUES ('library_version', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
`);

function run() {
    console.log(`[seed] biblioteca raiz: ${BIB_ROOT}`);
    console.log(`[seed] assets dest:    ${ASSETS_DIR}`);
    console.log(`[seed] library_version=${LIB_VERSION}`);

    const files = walk(BIB_ROOT);
    console.log(`[seed] encontrados: ${files.length} JSONs`);

    const seen = new Set();
    const breakdown = {};
    let inserted = 0, skipped = 0;

    const tx = db.transaction((files) => {
        for (const filePath of files) {
            let data;
            try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
            catch (e) { console.warn(`[seed] skip JSON inválido: ${filePath} (${e.message})`); skipped++; continue; }

            const slug = path.basename(filePath, '.json');
            const id = (data.id || slug).toString().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            if (!id || seen.has(id)) {
                skipped++;
                continue;
            }
            seen.add(id);

            const category = (data.categoria || path.basename(path.dirname(filePath)) || 'misc').toString();
            const name = data.nome || data.name || slug;
            const tags = JSON.stringify(data.tags || []);

            // Copy JSON to assets dir (canonical layout)
            const destJson = path.join(ASSETS_DIR, `${id}.json`);
            fs.writeFileSync(destJson, JSON.stringify(data, null, 2));
            const sha   = sha256File(destJson);
            const size  = fs.statSync(destJson).size;

            // Thumbnail (se existir)
            let thumbnail_path = null;
            if (data.thumbnail) {
                const srcThumb = path.join(path.dirname(filePath), data.thumbnail);
                if (fs.existsSync(srcThumb)) {
                    const destThumb = path.join(ASSETS_DIR, `${id}.thumb.png`);
                    fs.copyFileSync(srcThumb, destThumb);
                    thumbnail_path = `${id}.thumb.png`;
                }
            }

            const skp_refs = JSON.stringify(data.skp_refs || data.modelos_skp || []);

            const [larMin, larMax] = extractParamRange(data.parametros, 'largura');
            const [altMin, altMax] = extractParamRange(data.parametros, 'altura');
            const [profMin, profMax] = extractParamRange(data.parametros, 'profundidade');
            const { n_portas, n_gavetas } = countDoorsDrawers(data);

            upsert.run({
                id, name, category,
                version: LIB_VERSION,
                channel: CHANNEL, status: STATUS,
                json_path: `${id}.json`,
                skp_refs,
                thumbnail_path,
                sha256: sha, size_bytes: size,
                tags,
                largura_min: larMin, largura_max: larMax,
                altura_min:  altMin, altura_max:  altMax,
                profundidade_min: profMin, profundidade_max: profMax,
                n_portas, n_gavetas,
            });
            inserted++;
            breakdown[category] = (breakdown[category] || 0) + 1;
        }
    });

    tx(files);
    setMeta.run(LIB_VERSION);

    console.log(`\n[seed] OK — ${inserted} modules upserted, ${skipped} skipped`);
    console.log('[seed] breakdown:');
    for (const [k, v] of Object.entries(breakdown).sort()) console.log(`  ${k}: ${v}`);
    console.log(`\n[seed] library_version=${LIB_VERSION}`);
}

run();
