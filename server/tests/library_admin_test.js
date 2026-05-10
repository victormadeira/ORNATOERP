// ═══════════════════════════════════════════════════════
// Standalone integration test — endpoints admin /api/library/admin/* (Sprint B4)
// node server/tests/library_admin_test.js
// ═══════════════════════════════════════════════════════

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import db from '../db.js';
import libraryRoutes from '../routes/library.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET
    || (existsSync(join(__dir, '..', '.jwt_secret'))
        ? readFileSync(join(__dir, '..', '.jwt_secret'), 'utf-8').trim()
        : (() => { throw new Error('JWT_SECRET not found — start the server once') })());

const app = express();
app.use('/api/library', libraryRoutes);

// Users + tokens (admin master, curator, vendedor)
function ensureUser(email, role) {
    let u = db.prepare('SELECT id, email, role, nome FROM users WHERE email=?').get(email);
    if (!u) {
        db.prepare(`INSERT INTO users (nome,email,senha_hash,role,ativo) VALUES (?,?,?,?,1)`)
          .run(`Test ${role}`, email, 'x', role);
        u = db.prepare('SELECT id, email, role, nome FROM users WHERE email=?').get(email);
    } else if (u.role !== role) {
        db.prepare('UPDATE users SET role=? WHERE id=?').run(role, u.id);
        u.role = role;
    }
    return u;
}
const adminUser    = ensureUser('lib-admin@ornato.dev',    'admin');
const curatorUser  = ensureUser('lib-curator@ornato.dev',  'library_curator');
const vendedorUser = ensureUser('lib-vendedor@ornato.dev', 'vendedor');
function tok(u) {
    return jwt.sign({ id: u.id, email: u.email, role: u.role, nome: u.nome, empresa_id: 1 },
                    JWT_SECRET, { expiresIn: '1h' });
}
const tokAdmin   = tok(adminUser);
const tokCurator = tok(curatorUser);
const tokVend    = tok(vendedorUser);

let server;
function start() { return new Promise(r => { server = app.listen(0, () => r(server.address().port)); }); }
function stop()  { return new Promise(r => server.close(r)); }

// Multipart helper minimal — boundary
function mpEncode(fields, files) {
    const boundary = '----BNDRY' + Math.random().toString(16).slice(2);
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
            body = Buffer.from(JSON.stringify(opts.json));
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = body.length;
        } else if (opts.multipart) {
            const enc = mpEncode(opts.multipart.fields, opts.multipart.files);
            body = enc.body;
            headers['Content-Type'] = enc.contentType;
            headers['Content-Length'] = body.length;
        }
        const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const ct = res.headers['content-type'] || '';
                let parsed = buf;
                if (ct.includes('json')) { try { parsed = JSON.parse(buf.toString() || '{}'); } catch { parsed = {}; } }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
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

// Sample valid JSON paramétrico minimal
function makeJsonModule(id) {
    return {
        id,
        nome: `Teste ${id}`,
        categoria: 'teste',
        tags: ['teste','admin'],
        parametros: {
            largura:      { label: 'L', type: 'number', default: 800, min: 400, max: 1200, step: 10, unit: 'mm' },
            altura:       { label: 'A', type: 'number', default: 720, min: 600, max: 900,  step: 10, unit: 'mm' },
            profundidade: { label: 'P', type: 'number', default: 560, min: 400, max: 650,  step: 10, unit: 'mm' },
        },
        pecas: [
            { nome: 'Lateral E', role: 'lateral', largura: '{altura}', altura: '{profundidade}', espessura: 18 },
            { nome: 'Lateral D', role: 'lateral', largura: '{altura}', altura: '{profundidade}', espessura: 18 },
        ],
    };
}

async function run() {
    await start();
    console.log(`\n=== Library ADMIN Endpoints Test ===  port=${server.address().port}\n`);

    // Cleanup: remove módulo de teste se sobrou
    db.prepare(`DELETE FROM library_modules WHERE id IN ('test_admin_a','test_admin_b','test_admin_c')`).run();

    // 1. POST sem token → 401
    console.log('1. POST /admin/modules sem token → 401');
    let r = await request('POST', '/api/library/admin/modules', {
        multipart: { fields: { channel: 'dev' }, files: [{ field: 'json_file', filename: 'm.json', data: JSON.stringify(makeJsonModule('test_admin_a')) }] }
    });
    assert(r.status === 401, `401 (got ${r.status})`);

    // 2. POST como vendedor → 403
    console.log('\n2. POST /admin/modules como vendedor → 403');
    r = await request('POST', '/api/library/admin/modules', {
        token: tokVend,
        multipart: { fields: { channel: 'dev' }, files: [{ field: 'json_file', filename: 'm.json', data: JSON.stringify(makeJsonModule('test_admin_a')) }] }
    });
    assert(r.status === 403, `403 (got ${r.status})`);

    // 3. POST como curator com JSON inválido → 400 + errors[]
    console.log('\n3. POST /admin/modules com JSON sem pecas → 400 + errors[]');
    r = await request('POST', '/api/library/admin/modules', {
        token: tokCurator,
        multipart: { fields: { channel: 'dev' }, files: [{ field: 'json_file', filename: 'bad.json', data: JSON.stringify({ id: 'foo', nome: 'X', categoria: 'y', parametros: {} }) }] }
    });
    assert(r.status === 400, `400 (got ${r.status})`);
    assert(Array.isArray(r.body.errors) && r.body.errors.length > 0, `errors[] presente`);

    // 4. POST curator OK em dev/draft → 201
    console.log('\n4. POST /admin/modules curator → 201');
    r = await request('POST', '/api/library/admin/modules', {
        token: tokCurator,
        multipart: { fields: { channel: 'dev', status: 'draft' }, files: [{ field: 'json_file', filename: 'a.json', data: JSON.stringify(makeJsonModule('test_admin_a')) }] }
    });
    assert(r.status === 201, `201 (got ${r.status}) body=${JSON.stringify(r.body).slice(0,200)}`);
    assert(r.body.module?.id === 'test_admin_a', `id retornado`);
    assert(r.body.module?.channel === 'dev', `channel=dev`);
    assert(r.body.module?.status === 'draft', `status=draft`);
    assert(r.body.module?.sha256?.length === 64, `sha256 64 chars`);

    // 5. POST curator tentando publicar em stable → 403
    console.log('\n5. POST stable como curator → 403');
    r = await request('POST', '/api/library/admin/modules', {
        token: tokCurator,
        multipart: { fields: { channel: 'stable', status: 'published' }, files: [{ field: 'json_file', filename: 'b.json', data: JSON.stringify(makeJsonModule('test_admin_b')) }] }
    });
    assert(r.status === 403, `403 (got ${r.status})`);

    // 6. POST admin master em stable → 201 + bumpa version
    console.log('\n6. POST stable como admin → 201');
    const verBefore = db.prepare(`SELECT value FROM library_meta WHERE key='library_version'`).get().value;
    r = await request('POST', '/api/library/admin/modules', {
        token: tokAdmin,
        multipart: { fields: { channel: 'stable', status: 'published' }, files: [{ field: 'json_file', filename: 'b.json', data: JSON.stringify(makeJsonModule('test_admin_b')) }] }
    });
    assert(r.status === 201, `201 (got ${r.status})`);
    const verAfter = db.prepare(`SELECT value FROM library_meta WHERE key='library_version'`).get().value;
    assert(verAfter !== verBefore, `library_version bumped (${verBefore} → ${verAfter})`);

    // 7. GET admin/modules?channel=dev — lista vê drafts
    console.log('\n7. GET /admin/modules?channel=dev');
    r = await request('GET', '/api/library/admin/modules?channel=dev', { token: tokCurator });
    assert(r.status === 200, `200`);
    assert(r.body.modules.some(m => m.id === 'test_admin_a'), `test_admin_a aparece em dev`);

    // 8. GET single — inclui json_content
    console.log('\n8. GET /admin/modules/:id');
    r = await request('GET', '/api/library/admin/modules/test_admin_a', { token: tokCurator });
    assert(r.status === 200, `200`);
    assert(r.body.json_content?.id === 'test_admin_a', `json_content presente`);

    // 9. PATCH publish dev→beta como curator → ok
    console.log('\n9. PATCH publish dev→beta curator');
    r = await request('PATCH', '/api/library/admin/modules/test_admin_a/publish', {
        token: tokCurator, json: { channel: 'beta', status: 'published' }
    });
    assert(r.status === 200, `200`);
    assert(r.body.module.channel === 'beta', `channel=beta`);

    // 10. PATCH publish beta→stable como curator → 403
    console.log('\n10. PATCH publish beta→stable curator → 403');
    r = await request('PATCH', '/api/library/admin/modules/test_admin_a/publish', {
        token: tokCurator, json: { channel: 'stable', status: 'published' }
    });
    assert(r.status === 403, `403 (got ${r.status})`);

    // 11. PATCH publish beta→stable como admin → 200
    console.log('\n11. PATCH publish beta→stable admin');
    r = await request('PATCH', '/api/library/admin/modules/test_admin_a/publish', {
        token: tokAdmin, json: { channel: 'stable', status: 'published' }
    });
    assert(r.status === 200, `200`);
    assert(r.body.module.channel === 'stable', `channel=stable`);

    // 12. POST /admin/validate retorna ok=true em JSON válido
    console.log('\n12. POST /admin/validate ok');
    r = await request('POST', '/api/library/admin/validate', {
        token: tokCurator,
        multipart: { fields: {}, files: [{ field: 'json_file', filename: 'v.json', data: JSON.stringify(makeJsonModule('test_validate_x')) }] }
    });
    assert(r.status === 200, `200`);
    assert(r.body.ok === true, `ok=true`);

    // 13. POST /admin/validate retorna errors em JSON ruim
    console.log('\n13. POST /admin/validate inválido');
    r = await request('POST', '/api/library/admin/validate', {
        token: tokCurator,
        multipart: { fields: {}, files: [{ field: 'json_file', filename: 'v.json', data: '{"id":"x"}' }] }
    });
    assert(r.body.ok === false && r.body.errors.length > 0, `errors retornados`);

    // 14. DELETE como curator → 403
    console.log('\n14. DELETE como curator → 403');
    r = await request('DELETE', '/api/library/admin/modules/test_admin_a', { token: tokCurator });
    assert(r.status === 403, `403 (got ${r.status})`);

    // 15. DELETE como admin → 200 (soft)
    console.log('\n15. DELETE como admin → soft');
    r = await request('DELETE', '/api/library/admin/modules/test_admin_a', { token: tokAdmin });
    assert(r.status === 200 && r.body.ok === true, `ok`);
    const deletedRow = db.prepare('SELECT deleted_at FROM library_modules WHERE id=?').get('test_admin_a');
    assert(!!deletedRow.deleted_at, `deleted_at preenchido (soft delete)`);

    // 16. POST com path traversal no SKP filename → bloqueado (filename sanitizado, então deve criar OK em pasta segura)
    console.log('\n16. POST com SKP traversal-like filename → sanitizado OK');
    r = await request('POST', '/api/library/admin/modules', {
        token: tokCurator,
        multipart: {
            fields: { channel: 'dev', status: 'draft' },
            files: [
                { field: 'json_file', filename: 'c.json', data: JSON.stringify(makeJsonModule('test_admin_c')) },
                { field: 'skp_files', filename: '../../../evil.skp', data: 'fake-skp-bytes', contentType: 'application/octet-stream' },
            ]
        }
    });
    assert(r.status === 201, `201 (got ${r.status})`);
    const skpRefs = r.body.module.skp_refs || [];
    assert(skpRefs.length === 1 && !skpRefs[0].includes('..'), `skp ref sanitizado: ${skpRefs[0]}`);

    // Cleanup
    db.prepare(`DELETE FROM library_modules WHERE id IN ('test_admin_a','test_admin_b','test_admin_c')`).run();

    await stop();
    console.log(`\n=== Resultado: ${pass} pass / ${fail} fail ===\n`);
    process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
