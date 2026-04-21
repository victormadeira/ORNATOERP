import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// Observabilidade — error tracker próprio (zero external deps)
// ═══════════════════════════════════════════════════════
// Desabilitável via env. Em teste/dev, deixa ligado por padrão.
const ENABLED = process.env.ERROR_TRACKING !== 'off';

// Agrupa erros "iguais" por fingerprint (hash de source+message+top-frame).
// Janela de 1h: mesmo fingerprint dentro de 1h → incrementa count, não cria linha nova.
// Isso evita spam de DB quando algo trava em loop.
const WINDOW_MS = 60 * 60 * 1000;

function topFrame(stack) {
    if (!stack || typeof stack !== 'string') return '';
    const lines = stack.split('\n').map(l => l.trim()).filter(Boolean);
    // Primeira linha costuma ser o "Error: msg" — pega a segunda "at ...".
    const frame = lines.find(l => l.startsWith('at ')) || lines[0] || '';
    return frame.slice(0, 300);
}

function makeFingerprint(source, message, stack) {
    const key = `${source}|${(message || '').slice(0, 200)}|${topFrame(stack)}`;
    return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

function clipStr(s, max) {
    if (!s) return '';
    const str = typeof s === 'string' ? s : String(s);
    return str.length > max ? str.slice(0, max) : str;
}

/**
 * Registra um erro. Usada tanto pelo endpoint POST /api/errors quanto pelo
 * error handler do express (via helper exportado).
 *
 * @param {object} e
 * @param {string} e.source - 'backend' | 'frontend' | 'unhandled'
 * @param {string} e.message
 * @param {string} [e.stack]
 * @param {string} [e.url]
 * @param {string} [e.method]
 * @param {number} [e.statusCode]
 * @param {string} [e.errorId]
 * @param {number} [e.userId]
 * @param {string} [e.userAgent]
 * @param {string} [e.ip]
 * @param {object} [e.meta]
 * @param {string} [e.level] - 'error' | 'warn' | 'info'
 */
export function recordError(e) {
    if (!ENABLED) return;
    try {
        const source = clipStr(e.source || 'backend', 32);
        const message = clipStr(e.message || 'Unknown error', 2000);
        const stack = clipStr(e.stack || '', 8000);
        const fp = makeFingerprint(source, message, stack);

        // Procura registro recente com mesmo fingerprint
        const existing = db.prepare(
            `SELECT id, count FROM error_log
             WHERE fingerprint = ? AND last_seen > datetime('now', ?)
             ORDER BY last_seen DESC LIMIT 1`
        ).get(fp, `-${Math.floor(WINDOW_MS / 1000)} seconds`);

        if (existing) {
            db.prepare(
                `UPDATE error_log
                 SET count = count + 1, last_seen = CURRENT_TIMESTAMP,
                     resolved = 0, error_id = COALESCE(NULLIF(?, ''), error_id)
                 WHERE id = ?`
            ).run(clipStr(e.errorId || '', 32), existing.id);
            return existing.id;
        }

        const info = db.prepare(
            `INSERT INTO error_log
             (error_id, fingerprint, source, level, message, stack, url, method,
              status_code, user_id, user_agent, ip, meta_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            clipStr(e.errorId || '', 32),
            fp,
            source,
            clipStr(e.level || 'error', 16),
            message,
            stack,
            clipStr(e.url || '', 500),
            clipStr(e.method || '', 10),
            e.statusCode != null ? Number(e.statusCode) : null,
            e.userId != null ? Number(e.userId) : null,
            clipStr(e.userAgent || '', 300),
            clipStr(e.ip || '', 64),
            JSON.stringify(e.meta || {}).slice(0, 4000),
        );
        return info.lastInsertRowid;
    } catch (err) {
        // Último recurso: se o tracker quebra, não derruba a app.
        console.error('[errors.recordError] falhou:', err);
        return null;
    }
}

// ═══════════════════════════════════════════════════════
// POST /api/errors — report de erro do frontend (anônimo OK)
// ═══════════════════════════════════════════════════════
// Sem requireAuth: queremos capturar erros mesmo antes do login.
// Rate limit aplicado no index.js para evitar flood.
router.post('/', (req, res) => {
    if (!ENABLED) return res.json({ ok: true, disabled: true });
    const b = req.body || {};
    // Whitelist rígida de campos — cliente não controla source/level arbitrariamente
    const level = ['error', 'warn', 'info'].includes(b.level) ? b.level : 'error';
    const id = recordError({
        source: 'frontend',
        level,
        message: clipStr(b.message, 2000),
        stack: clipStr(b.stack, 8000),
        url: clipStr(b.url || req.get('referer') || '', 500),
        method: '',
        userId: req.user?.id || null,
        userAgent: clipStr(req.get('user-agent') || '', 300),
        ip: clipStr(req.ip || '', 64),
        meta: typeof b.meta === 'object' && b.meta !== null ? b.meta : {},
    });
    res.json({ ok: true, id });
});

// ═══════════════════════════════════════════════════════
// Tudo abaixo é admin-only
// ═══════════════════════════════════════════════════════
router.use(requireAuth, requireRole('admin'));

// GET /api/errors — lista paginada com filtros
router.get('/', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const source = req.query.source || '';
    const resolved = req.query.resolved;
    const q = req.query.q || '';

    const where = [];
    const params = [];
    if (source) { where.push('source = ?'); params.push(source); }
    if (resolved === '0' || resolved === '1') { where.push('resolved = ?'); params.push(parseInt(resolved)); }
    if (q) { where.push('(message LIKE ? OR url LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(
        `SELECT id, error_id, fingerprint, source, level, message, url, method,
                status_code, user_id, count, resolved, first_seen, last_seen
         FROM error_log ${whereSql}
         ORDER BY last_seen DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    const total = db.prepare(`SELECT COUNT(*) as c FROM error_log ${whereSql}`).get(...params).c;
    res.json({ rows, total, limit, offset });
});

// GET /api/errors/stats — contadores 24h / 7d / por source
router.get('/stats', (req, res) => {
    const last24h = db.prepare(
        `SELECT COUNT(*) as c, COALESCE(SUM(count), 0) as total_hits
         FROM error_log WHERE last_seen > datetime('now', '-24 hours')`
    ).get();
    const last7d = db.prepare(
        `SELECT COUNT(*) as c, COALESCE(SUM(count), 0) as total_hits
         FROM error_log WHERE last_seen > datetime('now', '-7 days')`
    ).get();
    const bySource = db.prepare(
        `SELECT source, COUNT(*) as c, COALESCE(SUM(count), 0) as hits
         FROM error_log WHERE last_seen > datetime('now', '-24 hours')
         GROUP BY source`
    ).all();
    const unresolved = db.prepare(`SELECT COUNT(*) as c FROM error_log WHERE resolved = 0`).get().c;
    res.json({ last24h, last7d, bySource, unresolved });
});

// GET /api/errors/:id — detalhe completo (stack + meta)
router.get('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM error_log WHERE id = ?`).get(parseInt(req.params.id));
    if (!row) return res.status(404).json({ error: 'Erro não encontrado' });
    res.json(row);
});

// PUT /api/errors/:id/resolve — marca resolvido/aberto
router.put('/:id/resolve', (req, res) => {
    const resolved = req.body.resolved ? 1 : 0;
    db.prepare('UPDATE error_log SET resolved = ? WHERE id = ?').run(resolved, parseInt(req.params.id));
    res.json({ ok: true, resolved });
});

// DELETE /api/errors/:id
router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM error_log WHERE id = ?').run(parseInt(req.params.id));
    res.json({ ok: true });
});

// DELETE /api/errors — limpa antigos (default: > 30 dias)
router.delete('/', (req, res) => {
    const days = Math.max(parseInt(req.query.days) || 30, 1);
    const info = db.prepare(
        `DELETE FROM error_log WHERE last_seen < datetime('now', ?)`
    ).run(`-${days} days`);
    res.json({ ok: true, deleted: info.changes });
});

export default router;
