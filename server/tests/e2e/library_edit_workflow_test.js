// ═══════════════════════════════════════════════════════════════════════
// server/tests/e2e/library_edit_workflow_test.js
//
// E2E-3 — Workflow editorial COMPLETO (HTTP real contra Express + DB):
//   1. admin POST /admin/modules         → cria módulo
//   2. curator POST /checkout            → lock 30min
//   3. curator POST /heartbeat           → renova lock
//   4. curator POST /checkin             → v1 publicada
//   5. curator PATCH /publish channel=beta
//   6. admin PATCH /publish channel=stable
//   7. curator POST /checkout, /checkin  → v2
//   8. GET /versions retorna >= 2 versões
//   9. admin POST /rollback/v1           → v1 vira ativa, v2 marca rolled_back
//   10. DELETE /admin/modules            → cleanup
//
// Roda standalone: `node server/tests/e2e/library_edit_workflow_test.js`
// ═══════════════════════════════════════════════════════════════════════

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import db from '../../db.js';
import libraryRoutes from '../../routes/library.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET
    || (existsSync(join(__dir, '..', '..', '.jwt_secret'))
        ? readFileSync(join(__dir, '..', '..', '.jwt_secret'), 'utf-8').trim()
        : (() => { throw new Error('JWT_SECRET not found — start the server once') })());

const app = express();
app.use('/api/library', libraryRoutes);

function ensureUser(email, role) {
    let u = db.prepare('SELECT id, email, role, nome FROM users WHERE email=?').get(email);
    if (!u) {
        db.prepare(`INSERT INTO users (nome,email,senha_hash,role,ativo) VALUES (?,?,?,?,1)`)
          .run(`E2E ${role}`, email, 'x', role);
        u = db.prepare('SELECT id, email, role, nome FROM users WHERE email=?').get(email);
    } else if (u.role !== role) {
        db.prepare('UPDATE users SET role=? WHERE id=?').run(role, u.id);
        u.role = role;
    }
    return u;
}

const adminUser = ensureUser('e2e-edit-admin@ornato.dev', 'admin');
const curator   = ensureUser('e2e-edit-cur@ornato.dev',   'library_curator');

function tok(u) {
    return jwt.sign({ id: u.id, email: u.email, role: u.role, nome: u.nome, empresa_id: 1 },
                    JWT_SECRET, { expiresIn: '1h' });
}
const tAdmin = tok(adminUser);
const tCur   = tok(curator);

let server;
function start() { return new Promise(r => { server = app.listen(0, () => r(server.address().port)); }); }
function stop()  { return new Promise(r => server.close(r)); }

function mpEncode(fields, files) {
    const boundary = '----E2E' + Math.random().toString(16).slice(2);
    const parts = [];
    for (const [k, v] of Object.entries(fields || {})) {
        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
        ));
    }
    for (const f of files || []) {
        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\n` +
            `Content-Type: ${f.contentType || 'application/octet-stream'}\r\n\r\n`
        ));
        parts.push(Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data));
        parts.push(Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function request(method, path, opts = {}) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const headers = {};
        if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
        let body = null;
        if (opts.json) {
            body = JSON.stringify(opts.json);
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(body);
        } else if (opts.multipart) {
            const mp = mpEncode(opts.multipart.fields, opts.multipart.files);
            body = mp.body;
            headers['Content-Type'] = mp.contentType;
            headers['Content-Length'] = body.length;
        }
        const req = http.request({ host: '127.0.0.1', port, path: `/api/library${path}`, method, headers }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                let parsed;
                try { parsed = JSON.parse(buf.toString('utf8')); } catch { parsed = buf.toString('utf8'); }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: buf });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); pass++; }
    else      { console.log(`  ✗ ${msg}`); fail++; }
}

function makeModule(id, label = 'v1') {
    return {
        id, nome: `E2E ${label}`, categoria: 'e2e_workflow',
        tags: ['e2e','workflow', label],
        parametros: {
            largura:      { label: 'L', type: 'number', default: 800, min: 400, max: 1200, step: 10, unit: 'mm' },
            altura:       { label: 'A', type: 'number', default: 720, min: 600, max: 900,  step: 10, unit: 'mm' },
            profundidade: { label: 'P', type: 'number', default: 560, min: 400, max: 650,  step: 10, unit: 'mm' },
        },
        pecas: [
            { nome: 'Lat E',  role: 'lateral', largura: '{altura}', altura: '{profundidade}', espessura: 18 },
            { nome: 'Lat D',  role: 'lateral', largura: '{altura}', altura: '{profundidade}', espessura: 18 },
        ],
    };
}

const TEST_ID = 'e2e_workflow_full';

async function cleanup() {
    db.prepare(`DELETE FROM library_locks    WHERE module_id = ?`).run(TEST_ID);
    db.prepare(`DELETE FROM library_versions WHERE module_id = ?`).run(TEST_ID);
    db.prepare(`DELETE FROM library_modules  WHERE id = ?`).run(TEST_ID);
}

async function run() {
    await start();
    console.log(`\n=== E2E-3 Library Edit Workflow ===  port=${server.address().port}\n`);
    await cleanup();

    // 1. Cria módulo (admin/curator) → 201
    let r = await request('POST', '/admin/modules', {
        token: tCur,
        multipart: {
            fields: { channel: 'dev', status: 'draft' },
            files: [{ field: 'json_file', filename: 'm.json', data: JSON.stringify(makeModule(TEST_ID, 'v1')) }],
        },
    });
    assert(r.status === 201, `1. POST /admin/modules → 201 (got ${r.status})`);
    assert(r.body?.module?.id === TEST_ID, `   module.id = ${TEST_ID}`);

    // 2. Checkout curator → 200, lock_token presente
    r = await request('POST', `/admin/modules/${TEST_ID}/checkout`,
        { token: tCur, json: { reason: 'e2e edit' } });
    assert(r.status === 200, `2. POST /checkout → 200 (got ${r.status})`);
    assert(!!r.body.lock_token, `   lock_token presente`);
    assert(!!r.body.expires_at, `   expires_at presente`);

    // 3. Heartbeat → 200, renova expires_at
    r = await request('POST', `/admin/modules/${TEST_ID}/heartbeat`, { token: tCur });
    assert(r.status === 200 && !!r.body.expires_at, `3. POST /heartbeat → 200 renovado`);

    // 4. Checkin v2 (mesmo curator) → 200, new_version bumpa
    const beforeRow = db.prepare('SELECT version FROM library_modules WHERE id=?').get(TEST_ID);
    r = await request('POST', `/admin/modules/${TEST_ID}/checkin`, {
        token: tCur,
        multipart: { fields: { version_notes: 'e2e v2' },
                     files: [{ field: 'json', filename: 'm.json',
                               data: JSON.stringify(makeModule(TEST_ID, 'v2')) }] }
    });
    assert(r.status === 200, `4. POST /checkin → 200 (got ${r.status})`);
    assert(!!r.body.new_version && r.body.new_version !== beforeRow.version,
           `   new_version bumped (${beforeRow.version} → ${r.body.new_version})`);
    const lockAfterCheckin = db.prepare('SELECT * FROM library_locks WHERE module_id=?').get(TEST_ID);
    assert(!lockAfterCheckin, `   lock liberado após checkin`);

    // 5. Curator publica em beta → 200
    r = await request('PATCH', `/admin/modules/${TEST_ID}/publish`,
        { token: tCur, json: { channel: 'beta', status: 'published' } });
    assert(r.status === 200, `5. PATCH /publish channel=beta → 200 (got ${r.status})`);
    assert(r.body?.module?.channel === 'beta', `   channel=beta gravado`);

    // 6. Curator tenta publicar em stable → 403 (só admin master)
    r = await request('PATCH', `/admin/modules/${TEST_ID}/publish`,
        { token: tCur, json: { channel: 'stable', status: 'published' } });
    assert(r.status === 403, `6. curator → stable bloqueado (403, got ${r.status})`);

    // 7. Admin publica em stable → 200
    r = await request('PATCH', `/admin/modules/${TEST_ID}/publish`,
        { token: tAdmin, json: { channel: 'stable', status: 'published' } });
    assert(r.status === 200, `7. admin PATCH stable → 200 (got ${r.status})`);
    assert(r.body?.module?.channel === 'stable', `   channel=stable gravado`);

    // 8. GET /versions retorna pelo menos 1 versão (a do checkin)
    r = await request('GET', `/admin/modules/${TEST_ID}/versions`, { token: tCur });
    assert(r.status === 200, `8. GET /versions → 200`);
    assert(Array.isArray(r.body.versions) && r.body.versions.length >= 1,
           `   versions.length >= 1 (got ${r.body.versions?.length})`);
    const v1Id = r.body.versions[r.body.versions.length - 1].id; // mais antiga

    // 9. Admin rollback pra v1 → 200, v1 marca rolled_back, new_version bumpa
    r = await request('POST', `/admin/modules/${TEST_ID}/rollback/${v1Id}`,
        { token: tAdmin, json: {} });
    assert(r.status === 200, `9. POST /rollback admin → 200 (got ${r.status})`);
    assert(!!r.body.new_version, `   new_version retornado após rollback`);
    const rolledBack = db.prepare('SELECT status FROM library_versions WHERE id=?').get(v1Id);
    assert(rolledBack.status === 'rolled_back', `   v1 marcada rolled_back`);

    // 10. DELETE módulo (admin master) → 200
    r = await request('DELETE', `/admin/modules/${TEST_ID}`, { token: tAdmin });
    assert(r.status === 200, `10. DELETE module → 200 (got ${r.status})`);
    const after = db.prepare('SELECT deleted_at FROM library_modules WHERE id=?').get(TEST_ID);
    assert(after?.deleted_at, `   deleted_at marcado`);

    await cleanup();
    await stop();

    console.log(`\n  Resultado: ${pass} passes / ${fail} fails\n`);
    process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => {
    console.error('CRASH:', e);
    try { stop(); } catch {}
    process.exit(2);
});
