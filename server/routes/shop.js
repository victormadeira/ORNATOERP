// ═══════════════════════════════════════════════════════
// Shop Profiles Routes — padrões técnicos por marcenaria (Sprint SHOP-2)
//
// Endpoints:
//   GET    /api/shop/config              → plugin no startup (profile ativo)
//   GET    /api/shop/profiles            → admin: lista profiles da org
//   POST   /api/shop/profiles            → admin: cria profile
//   PUT    /api/shop/profiles/:id        → admin: atualiza valores
//   PATCH  /api/shop/profiles/:id/activate → admin: ativa este, desativa demais
//   DELETE /api/shop/profiles/:id        → admin: deleta (somente se inativo)
//
// "org_id" = req.user.empresa_id (do JWT). Cada empresa tem profiles próprios.
// ═══════════════════════════════════════════════════════

import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import db from '../db.js';

const router = Router();

const ADMIN_ROLES = ['admin', 'library_curator'];

// Lista (whitelist) de colunas REAIS/TEXT/INTEGER editáveis (exclui id, org_id, audit, is_active)
const SCALAR_COLUMNS = [
    'folga_porta_lateral','folga_porta_vertical','folga_entre_portas',
    'folga_porta_reta','folga_porta_dupla','folga_gaveta',
    'recuo_fundo','profundidade_rasgo_fundo','largura_rasgo_fundo',
    'altura_rodape','rodape_altura_padrao',
    'espessura','espessura_padrao','espessura_chapa_padrao',
    'sistema32_offset','sistema32_passo','sistema32_ativo',
    'cavilha_diametro','cavilha_profundidade',
    'dobradica_padrao','corredica_padrao','puxador_padrao','minifix_padrao',
    'fita_borda_padrao','material_carcaca_padrao','material_frente_padrao',
    'material_fundo_padrao',
];

const TEXT_COLUMNS = new Set([
    'dobradica_padrao','corredica_padrao','puxador_padrao','minifix_padrao',
    'fita_borda_padrao','material_carcaca_padrao','material_frente_padrao',
    'material_fundo_padrao',
]);
const BOOL_COLUMNS = new Set(['sistema32_ativo']);

// Converte row do DB → DTO público
function rowToDto(row) {
    if (!row) return null;
    const values = {};
    for (const col of SCALAR_COLUMNS) {
        values[col] = BOOL_COLUMNS.has(col) ? !!row[col] : row[col];
    }
    let custom = {};
    try { custom = row.custom_keys ? JSON.parse(row.custom_keys) : {}; } catch (_) {}
    return {
        id: row.id,
        org_id: row.org_id,
        profile_name: row.name,
        is_active: !!row.is_active,
        version: row.updated_at,
        values,
        custom_keys: custom,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

// Valida o objeto `values` recebido. Retorna { ok, errors[] }.
function validateValues(values) {
    const errors = [];
    if (!values || typeof values !== 'object') {
        return { ok: false, errors: ['values deve ser objeto'] };
    }
    const allowed = new Set(SCALAR_COLUMNS);
    for (const [k, v] of Object.entries(values)) {
        if (!allowed.has(k)) {
            errors.push(`chave inválida: "${k}"`);
            continue;
        }
        if (TEXT_COLUMNS.has(k)) {
            if (v !== null && typeof v !== 'string') errors.push(`"${k}" deve ser string`);
        } else if (BOOL_COLUMNS.has(k)) {
            if (typeof v !== 'boolean' && v !== 0 && v !== 1) errors.push(`"${k}" deve ser bool`);
        } else {
            if (v !== null && typeof v !== 'number') errors.push(`"${k}" deve ser number`);
        }
    }
    return { ok: errors.length === 0, errors };
}

function coerceVal(col, v) {
    if (BOOL_COLUMNS.has(col)) return v ? 1 : 0;
    return v;
}

function getOrgId(req) {
    return req.user?.empresa_id || 1;
}

// ───────────────────────────────────────────────────────
// GET /api/shop/config — plugin no startup
// Retorna profile ativo (cria default sob demanda se ausente)
// ───────────────────────────────────────────────────────
router.get('/config', requireAuth, (req, res) => {
    const org_id = getOrgId(req);
    let row = db.prepare(
        `SELECT * FROM shop_profiles WHERE org_id = ? AND is_active = 1 LIMIT 1`
    ).get(org_id);

    if (!row) {
        // Cria default sob demanda (org sem profile ainda)
        db.prepare(
            `INSERT OR IGNORE INTO shop_profiles (org_id, name, is_active) VALUES (?, 'default', 1)`
        ).run(org_id);
        row = db.prepare(
            `SELECT * FROM shop_profiles WHERE org_id = ? AND is_active = 1 LIMIT 1`
        ).get(org_id);
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json(rowToDto(row));
});

// ───────────────────────────────────────────────────────
// GET /api/shop/profiles — lista profiles da org (admin)
// ───────────────────────────────────────────────────────
router.get('/profiles', requireAuth, requireRole(...ADMIN_ROLES), (req, res) => {
    const org_id = getOrgId(req);
    const rows = db.prepare(
        `SELECT id, name, is_active, created_at, updated_at
           FROM shop_profiles
          WHERE org_id = ?
          ORDER BY is_active DESC, name ASC`
    ).all(org_id);
    res.json({
        profiles: rows.map(r => ({
            id: r.id,
            name: r.name,
            is_active: !!r.is_active,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })),
    });
});

// ───────────────────────────────────────────────────────
// POST /api/shop/profiles — cria profile (admin)
// body: { name, values: {...}, custom_keys: {...}, set_active: bool }
// ───────────────────────────────────────────────────────
router.post('/profiles', requireAuth, requireRole(...ADMIN_ROLES), (req, res) => {
    const org_id = getOrgId(req);
    const name = (req.body?.name || '').toString().trim();
    if (!name) return res.status(400).json({ error: 'name obrigatório' });
    if (name.length > 80) return res.status(400).json({ error: 'name muito longo' });

    const values = req.body?.values || {};
    const v = validateValues(values);
    if (!v.ok) return res.status(400).json({ error: 'values inválidos', errors: v.errors });

    const custom = req.body?.custom_keys;
    let customJson = null;
    if (custom !== undefined && custom !== null) {
        if (typeof custom !== 'object' || Array.isArray(custom)) {
            return res.status(400).json({ error: 'custom_keys deve ser objeto' });
        }
        customJson = JSON.stringify(custom);
    }

    const setActive = !!req.body?.set_active;

    // Conflito de nome?
    const dup = db.prepare(
        `SELECT id FROM shop_profiles WHERE org_id = ? AND name = ?`
    ).get(org_id, name);
    if (dup) return res.status(409).json({ error: `profile "${name}" já existe` });

    // Build INSERT dinâmico — só colunas presentes em values
    const cols = ['org_id', 'name', 'is_active'];
    const vals = [org_id, name, setActive ? 1 : 0];
    const placeholders = ['?', '?', '?'];
    for (const [k, val] of Object.entries(values)) {
        cols.push(k);
        vals.push(coerceVal(k, val));
        placeholders.push('?');
    }
    if (customJson !== null) {
        cols.push('custom_keys');
        vals.push(customJson);
        placeholders.push('?');
    }

    const tx = db.transaction(() => {
        if (setActive) {
            db.prepare(
                `UPDATE shop_profiles SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                  WHERE org_id = ? AND is_active = 1`
            ).run(org_id);
        }
        const sql = `INSERT INTO shop_profiles (${cols.join(',')}) VALUES (${placeholders.join(',')})`;
        const info = db.prepare(sql).run(...vals);
        return info.lastInsertRowid;
    });

    let id;
    try { id = tx(); }
    catch (e) { return res.status(500).json({ error: e.message }); }

    const row = db.prepare(`SELECT * FROM shop_profiles WHERE id = ?`).get(id);
    res.status(201).json(rowToDto(row));
});

// ───────────────────────────────────────────────────────
// PUT /api/shop/profiles/:id — atualiza valores (admin)
// body: { name?, values?: {...}, custom_keys?: {...} }
// ───────────────────────────────────────────────────────
router.put('/profiles/:id', requireAuth, requireRole(...ADMIN_ROLES), (req, res) => {
    const org_id = getOrgId(req);
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });

    const cur = db.prepare(
        `SELECT * FROM shop_profiles WHERE id = ? AND org_id = ?`
    ).get(id, org_id);
    if (!cur) return res.status(404).json({ error: 'profile não encontrado' });

    const sets = [];
    const vals = [];

    if (req.body?.name !== undefined) {
        const n = (req.body.name || '').toString().trim();
        if (!n) return res.status(400).json({ error: 'name não pode ser vazio' });
        if (n.length > 80) return res.status(400).json({ error: 'name muito longo' });
        // Conflito com outro profile
        const dup = db.prepare(
            `SELECT id FROM shop_profiles WHERE org_id = ? AND name = ? AND id != ?`
        ).get(org_id, n, id);
        if (dup) return res.status(409).json({ error: `profile "${n}" já existe` });
        sets.push('name = ?'); vals.push(n);
    }

    if (req.body?.values !== undefined) {
        const v = validateValues(req.body.values);
        if (!v.ok) return res.status(400).json({ error: 'values inválidos', errors: v.errors });
        for (const [k, val] of Object.entries(req.body.values)) {
            sets.push(`${k} = ?`);
            vals.push(coerceVal(k, val));
        }
    }

    if (req.body?.custom_keys !== undefined) {
        const c = req.body.custom_keys;
        if (c === null) {
            sets.push('custom_keys = NULL');
        } else if (typeof c !== 'object' || Array.isArray(c)) {
            return res.status(400).json({ error: 'custom_keys deve ser objeto' });
        } else {
            sets.push('custom_keys = ?');
            vals.push(JSON.stringify(c));
        }
    }

    if (sets.length === 0) {
        return res.status(400).json({ error: 'nada a atualizar' });
    }

    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(id);

    db.prepare(`UPDATE shop_profiles SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    const row = db.prepare(`SELECT * FROM shop_profiles WHERE id = ?`).get(id);
    res.json(rowToDto(row));
});

// ───────────────────────────────────────────────────────
// PATCH /api/shop/profiles/:id/activate — ativa este, desativa demais
// ───────────────────────────────────────────────────────
router.patch('/profiles/:id/activate', requireAuth, requireRole(...ADMIN_ROLES), (req, res) => {
    const org_id = getOrgId(req);
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });

    const cur = db.prepare(
        `SELECT id FROM shop_profiles WHERE id = ? AND org_id = ?`
    ).get(id, org_id);
    if (!cur) return res.status(404).json({ error: 'profile não encontrado' });

    const tx = db.transaction(() => {
        db.prepare(
            `UPDATE shop_profiles SET is_active = 0, updated_at = CURRENT_TIMESTAMP
              WHERE org_id = ? AND id != ? AND is_active = 1`
        ).run(org_id, id);
        db.prepare(
            `UPDATE shop_profiles SET is_active = 1, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`
        ).run(id);
    });
    tx();

    const row = db.prepare(`SELECT * FROM shop_profiles WHERE id = ?`).get(id);
    res.json(rowToDto(row));
});

// ───────────────────────────────────────────────────────
// DELETE /api/shop/profiles/:id — só se is_active = 0
// ───────────────────────────────────────────────────────
router.delete('/profiles/:id', requireAuth, requireRole(...ADMIN_ROLES), (req, res) => {
    const org_id = getOrgId(req);
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'id inválido' });

    const cur = db.prepare(
        `SELECT id, is_active FROM shop_profiles WHERE id = ? AND org_id = ?`
    ).get(id, org_id);
    if (!cur) return res.status(404).json({ error: 'profile não encontrado' });

    if (cur.is_active) {
        return res.status(400).json({
            error: 'profile ativo não pode ser deletado — ative outro antes',
        });
    }

    db.prepare(`DELETE FROM shop_profiles WHERE id = ?`).run(id);
    res.json({ ok: true, id });
});

export default router;
