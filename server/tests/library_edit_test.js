// ═══════════════════════════════════════════════════════
// Standalone integration test — workflow editorial (LIB-EDIT)
// node server/tests/library_edit_test.js
// Cobre: checkout, heartbeat, checkin, validador, versions, rollback,
//        export.zip, import zip, conflict de lock, force unlock.
// ═══════════════════════════════════════════════════════

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import db from '../db.js';
import libraryRoutes from '../routes/library.js';
import { validateModulePackage } from '../lib/library_validator.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET
    || (existsSync(join(__dir, '..', '.jwt_secret'))
        ? readFileSync(join(__dir, '..', '.jwt_secret'), 'utf-8').trim()
        : (() => { throw new Error('JWT_SECRET not found — start the server once') })());

const app = express();
app.use('/api/library', libraryRoutes);

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

const adminUser    = ensureUser('lib-edit-admin@ornato.dev',   'admin');
const curator1     = ensureUser('lib-edit-cur1@ornato.dev',    'library_curator');
const curator2     = ensureUser('lib-edit-cur2@ornato.dev',    'library_curator');

function tok(u) {
    return jwt.sign({ id: u.id, email: u.email, role: u.role, nome: u.nome, empresa_id: 1 },
                    JWT_SECRET, { expiresIn: '1h' });
}
const tAdmin = tok(adminUser);
const tCur1  = tok(curator1);
const tCur2  = tok(curator2);

let server;
function start() { return new Promise(r => { server = app.listen(0, () => r(server.address().port)); }); }
function stop()  { return new Promise(r => server.close(r)); }

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

function makeJsonModule(id) {
    return {
        id, nome: `Edit ${id}`, categoria: 'teste_edit',
        tags: ['edit','test'],
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

const TEST_ID = 'edit_workflow_a';

async function ensureTestModule() {
    // Limpa qualquer estado pendente
    db.prepare(`DELETE FROM library_locks WHERE module_id = ?`).run(TEST_ID);
    db.prepare(`DELETE FROM library_versions WHERE module_id = ?`).run(TEST_ID);
    db.prepare(`DELETE FROM library_modules  WHERE id = ?`).run(TEST_ID);

    const r = await request('POST', '/api/library/admin/modules', {
        token: tCur1,
        multipart: {
            fields: { channel: 'dev', status: 'draft' },
            files: [{ field: 'json_file', filename: 'a.json', data: JSON.stringify(makeJsonModule(TEST_ID)) }],
        },
    });
    if (r.status !== 201) throw new Error('setup falhou: ' + JSON.stringify(r.body));
}

async function run() {
    await start();
    console.log(`\n=== Library EDIT Workflow Test ===  port=${server.address().port}\n`);

    await ensureTestModule();

    // 1. Checkout sem token → 401
    let r = await request('POST', `/api/library/admin/modules/${TEST_ID}/checkout`, { json: { reason: 'x' } });
    assert(r.status === 401, `1. checkout sem token → 401 (got ${r.status})`);

    // 2. Checkout cur1 → 200
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/checkout`,
        { token: tCur1, json: { reason: 'edit no SketchUp' } });
    assert(r.status === 200, `2. checkout cur1 → 200 (got ${r.status})`);
    assert(!!r.body.lock_token, `   lock_token presente`);
    assert(!!r.body.expires_at, `   expires_at presente`);
    assert(!!r.body.json_url, `   json_url presente`);

    // 3. Checkout cur2 enquanto cur1 segura → 409
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/checkout`,
        { token: tCur2, json: { reason: 'tentativa concorrente' } });
    assert(r.status === 409, `3. checkout concorrente → 409 (got ${r.status})`);
    assert(!!r.body.locked_by_name, `   locked_by_name no erro`);

    // 4. Heartbeat cur1 → 200, expires renovado
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/heartbeat`, { token: tCur1 });
    assert(r.status === 200 && !!r.body.expires_at, `4. heartbeat cur1 → 200`);

    // 5. Heartbeat cur2 → 409 (não dono)
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/heartbeat`, { token: tCur2 });
    assert(r.status === 409, `5. heartbeat cur2 (não dono) → 409 (got ${r.status})`);

    // 6. Checkin cur2 (sem lock) → 409
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/checkin`, {
        token: tCur2,
        multipart: { fields: {}, files: [{ field: 'json', filename: 'm.json', data: JSON.stringify(makeJsonModule(TEST_ID)) }] }
    });
    assert(r.status === 409, `6. checkin sem lock → 409 (got ${r.status})`);

    // 7. Checkin cur1 com role inválido → 400 + errors[]
    const invalidRole = makeJsonModule(TEST_ID);
    invalidRole.pecas[0].role = 'role_que_nao_existe';
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/checkin`, {
        token: tCur1,
        multipart: { fields: { version_notes: 'role bad' }, files: [{ field: 'json', filename: 'm.json', data: JSON.stringify(invalidRole) }] }
    });
    assert(r.status === 400, `7. checkin role inválido → 400 (got ${r.status})`);
    assert(Array.isArray(r.body.errors) && r.body.errors.some(e => /role/.test(e)),
           `   errors menciona role`);

    // 8. Checkin cur1 OK → 200, version bumpa, lock liberado
    const beforeRow = db.prepare(`SELECT version FROM library_modules WHERE id=?`).get(TEST_ID);
    const updated = makeJsonModule(TEST_ID);
    updated.tags = ['edit','test','v2'];
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/checkin`, {
        token: tCur1,
        multipart: { fields: { version_notes: 'segunda versão' },
                     files: [{ field: 'json', filename: 'm.json', data: JSON.stringify(updated) }] }
    });
    assert(r.status === 200, `8. checkin válido → 200 (got ${r.status}) ${JSON.stringify(r.body).slice(0,200)}`);
    assert(!!r.body.new_version && r.body.new_version !== beforeRow.version,
           `   new_version bumped (${beforeRow.version} → ${r.body.new_version})`);
    const lockAfter = db.prepare(`SELECT * FROM library_locks WHERE module_id=?`).get(TEST_ID);
    assert(!lockAfter, `   lock liberado após checkin`);

    // 9. GET versions — pelo menos 1 entrada
    r = await request('GET', `/api/library/admin/modules/${TEST_ID}/versions`, { token: tCur1 });
    assert(r.status === 200, `9. GET versions → 200`);
    assert(Array.isArray(r.body.versions) && r.body.versions.length >= 1,
           `   versions.length >= 1 (got ${r.body.versions?.length})`);
    const firstVersionId = r.body.versions[0].id;

    // 10. Checkout cur2 agora consegue → 200
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/checkout`,
        { token: tCur2, json: { reason: 'cur2 agora pega' } });
    assert(r.status === 200, `10. cur2 checkout após release → 200`);

    // 11. Release como cur2 (dono) → 200
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/release`, { token: tCur2 });
    assert(r.status === 200 && r.body.ok, `11. release pelo dono → 200`);

    // 12. Force unlock — checkout cur1, release pelo admin
    await request('POST', `/api/library/admin/modules/${TEST_ID}/checkout`,
        { token: tCur1, json: { reason: 'p/ force test' } });
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/release`, { token: tAdmin });
    assert(r.status === 200 && r.body.forced, `12. admin force unlock → forced=true`);

    // 13. Force unlock por outro curator (não dono, não master) → 403
    await request('POST', `/api/library/admin/modules/${TEST_ID}/checkout`,
        { token: tCur1, json: { reason: '13' } });
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/release`, { token: tCur2 });
    assert(r.status === 403, `13. cur2 força unlock alheio → 403 (got ${r.status})`);
    // Limpa pra próximos
    await request('POST', `/api/library/admin/modules/${TEST_ID}/release`, { token: tCur1 });

    // 14. Rollback como curator → 403
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/rollback/${firstVersionId}`,
        { token: tCur1, json: {} });
    assert(r.status === 403, `14. rollback como curator → 403 (got ${r.status})`);

    // 15. Rollback como admin → 200, version bumpa, snapshot antigo marcado rolled_back
    r = await request('POST', `/api/library/admin/modules/${TEST_ID}/rollback/${firstVersionId}`,
        { token: tAdmin, json: {} });
    assert(r.status === 200, `15. rollback admin → 200 (got ${r.status})`);
    assert(!!r.body.new_version, `    new_version retornado`);
    const oldVer = db.prepare(`SELECT status FROM library_versions WHERE id=?`).get(firstVersionId);
    assert(oldVer.status === 'rolled_back', `    versão antiga marcada rolled_back`);

    // 16. Export.zip → 200, header zip, conteúdo > 0
    r = await request('GET', `/api/library/admin/modules/${TEST_ID}/export.zip`, { token: tCur1 });
    assert(r.status === 200, `16. export.zip → 200`);
    assert(r.headers['content-type']?.includes('zip'), `    content-type zip`);
    assert(r.raw.length > 100, `    body > 100 bytes (got ${r.raw.length})`);
    const zipBuf = r.raw;

    // 17. Import roundtrip — usa o zip exportado, com id mudado
    //     (o zip carrega o id original; importar vai sobrescrever — testa caminho overwrote)
    r = await request('POST', `/api/library/admin/import`, {
        token: tCur1,
        multipart: { fields: { channel: 'dev' },
                     files: [{ field: 'file', filename: 'pkg.zip', data: zipBuf, contentType: 'application/zip' }] }
    });
    assert(r.status === 201, `17. import zip roundtrip → 201 (got ${r.status}) ${JSON.stringify(r.body).slice(0,200)}`);
    assert(r.body.module?.id === TEST_ID, `    id correto no import`);

    // 18. Import com lock conflict — checkout cur2, importa cur1
    db.prepare(`INSERT OR REPLACE INTO library_locks
        (module_id, locked_by, locked_by_name, expires_at, reason)
        VALUES (?, ?, ?, datetime('now','+30 minutes'), 'forced for test')`).run(
        TEST_ID, curator2.id, curator2.nome || curator2.email);
    r = await request('POST', `/api/library/admin/import`, {
        token: tCur1,
        multipart: { fields: { channel: 'dev' },
                     files: [{ field: 'file', filename: 'pkg.zip', data: zipBuf, contentType: 'application/zip' }] }
    });
    assert(r.status === 409, `18. import com lock alheio → 409 (got ${r.status})`);
    db.prepare(`DELETE FROM library_locks WHERE module_id=?`).run(TEST_ID);

    // 19. Import stable como curator → 403
    r = await request('POST', `/api/library/admin/import`, {
        token: tCur1,
        multipart: { fields: { channel: 'stable' },
                     files: [{ field: 'file', filename: 'pkg.zip', data: zipBuf, contentType: 'application/zip' }] }
    });
    assert(r.status === 403, `19. import stable como curator → 403 (got ${r.status})`);

    // 20. Import zip inválido → 400
    r = await request('POST', `/api/library/admin/import`, {
        token: tCur1,
        multipart: { fields: { channel: 'dev' },
                     files: [{ field: 'file', filename: 'bad.zip', data: 'not-a-zip-at-all-x', contentType: 'application/zip' }] }
    });
    assert(r.status === 400, `20. import zip inválido → 400 (got ${r.status})`);

    // 21. Validador unitário — borda inválida
    const v1 = validateModulePackage({
        json: {
            ...makeJsonModule('vu1'),
            pecas: [{ nome: 'P', role: 'lateral', largura: 100, altura: 100, bordas: { invalida: true } }],
        },
    });
    assert(!v1.ok && v1.errors.some(e => /borda/i.test(e)), `21. validator borda inválida`);

    // 22. Validador — peça nome duplicado
    const v2 = validateModulePackage({
        json: {
            ...makeJsonModule('vu2'),
            pecas: [
                { nome: 'X', role: 'lateral', largura: 100, altura: 100 },
                { nome: 'X', role: 'lateral', largura: 100, altura: 100 },
            ],
        },
    });
    assert(!v2.ok && v2.errors.some(e => /duplicado/i.test(e)), `22. validator nome duplicado`);

    // 23. Validador — confidence baixa (warning, not error)
    const v3 = validateModulePackage({
        json: { ...makeJsonModule('vu3'), _review: { confidence: 0.3 } },
    });
    assert(v3.ok && v3.warnings.some(w => /confidence/i.test(w)), `23. validator confidence warning`);

    // 24. Validador — shop key desconhecida (warning)
    const v4 = validateModulePackage({
        json: { ...makeJsonModule('vu4'),
                pecas: [{ nome: 'A', role: 'lateral', largura: 'shop.coisa_inexistente', altura: 100 }] },
    });
    assert(v4.warnings.some(w => /shop\./i.test(w)), `24. validator shop.* warning`);

    // 25. Validador — expressão inválida bloqueia
    const v5 = validateModulePackage({
        json: { ...makeJsonModule('vu5'),
                pecas: [{ nome: 'A', role: 'lateral', largura: '{x} ++ &&!', altura: 100 }] },
    });
    assert(!v5.ok && v5.errors.some(e => /expressão|expression|R10/i.test(e)),
           `25. validator expressão inválida`);

    // ── Cleanup ──
    db.prepare(`DELETE FROM library_locks WHERE module_id=?`).run(TEST_ID);
    db.prepare(`DELETE FROM library_versions WHERE module_id=?`).run(TEST_ID);
    db.prepare(`DELETE FROM library_modules WHERE id=?`).run(TEST_ID);

    await stop();
    console.log(`\n=== Resultado: ${pass} pass / ${fail} fail ===\n`);
    process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
