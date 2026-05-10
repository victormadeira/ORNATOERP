// ═══════════════════════════════════════════════════════
// Test admin endpoints — POST/PATCH/DELETE /releases, GET /telemetry, /error-reports
// Roda direto: node server/tests/plugin_admin_test.js
// ═══════════════════════════════════════════════════════

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import db from '../db.js';
import pluginRoutes from '../routes/plugin.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET
    || (existsSync(join(__dir, '..', '.jwt_secret'))
        ? readFileSync(join(__dir, '..', '.jwt_secret'), 'utf-8').trim()
        : (() => { throw new Error('JWT_SECRET not found — start the server once'); })());

// Releases dir isolado pra teste
const TEST_RELEASES_DIR = join(__dir, '..', '..', 'tmp', 'plugin-test-releases');
process.env.ORNATO_PLUGIN_DIR = TEST_RELEASES_DIR;
try { rmSync(TEST_RELEASES_DIR, { recursive: true, force: true }); } catch {}
mkdirSync(TEST_RELEASES_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/plugin', pluginRoutes);

// User admin pra teste
let user = db.prepare('SELECT id, email, role, nome FROM users WHERE email = ?').get('plugin-admin-test@ornato.dev');
if (!user) {
    db.prepare(`INSERT INTO users (nome, email, senha_hash, role, ativo) VALUES ('Plugin Admin', 'plugin-admin-test@ornato.dev', 'x', 'admin', 1)`).run();
    user = db.prepare('SELECT id, email, role, nome FROM users WHERE email = ?').get('plugin-admin-test@ornato.dev');
}
const adminToken = jwt.sign({ id: user.id, email: user.email, role: 'admin', nome: user.nome, empresa_id: 1 }, JWT_SECRET, { expiresIn: '1h' });

// User não-admin
let nonAdmin = db.prepare('SELECT id, email, role, nome FROM users WHERE email = ?').get('plugin-vend-test@ornato.dev');
if (!nonAdmin) {
    db.prepare(`INSERT INTO users (nome, email, senha_hash, role, ativo) VALUES ('Plugin Vend', 'plugin-vend-test@ornato.dev', 'x', 'vendedor', 1)`).run();
    nonAdmin = db.prepare('SELECT id, email, role, nome FROM users WHERE email = ?').get('plugin-vend-test@ornato.dev');
}
const userToken = jwt.sign({ id: nonAdmin.id, email: nonAdmin.email, role: 'vendedor', nome: nonAdmin.nome, empresa_id: 1 }, JWT_SECRET, { expiresIn: '1h' });

let server;
function start() { return new Promise(r => { server = app.listen(0, () => r(server.address().port)); }); }
function stop() { return new Promise(r => server.close(r)); }

function request(method, path, { token: tk = adminToken, json, multipart } = {}) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const headers = { Authorization: `Bearer ${tk}` };
        let body = null;
        if (json) {
            body = Buffer.from(JSON.stringify(json));
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = body.length;
        } else if (multipart) {
            const boundary = '----test' + Date.now();
            const chunks = [];
            for (const [k, v] of Object.entries(multipart.fields || {})) {
                chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
            }
            if (multipart.file) {
                const { name, filename, contentType, content } = multipart.file;
                chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
                chunks.push(Buffer.isBuffer(content) ? content : Buffer.from(content));
                chunks.push(Buffer.from('\r\n'));
            }
            chunks.push(Buffer.from(`--${boundary}--\r\n`));
            body = Buffer.concat(chunks);
            headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
            headers['Content-Length'] = body.length;
        }
        const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const ct = res.headers['content-type'] || '';
                resolve({ status: res.statusCode, headers: res.headers, body: ct.includes('json') ? JSON.parse(buf.toString() || '{}') : buf });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { console.log(`  ✓ ${msg}`); pass++; } else { console.log(`  ✗ ${msg}`); fail++; } }

// Cleanup fixtures de testes anteriores
db.prepare(`DELETE FROM plugin_releases WHERE version LIKE '99.%'`).run();

async function run() {
    await start();
    console.log(`\n=== Plugin Admin Test === port=${server.address().port}\n`);

    // Fake .rbz (zip mínimo é só p/ teste — backend só checksum, não desempacota)
    const fakeRbz = Buffer.from('PK\x03\x04fake-rbz-content-' + 'x'.repeat(200));

    // 1. Upload happy path
    console.log('1. POST /releases  (upload válido)');
    let r = await request('POST', '/api/plugin/releases', {
        multipart: {
            fields: { version: '99.0.1', channel: 'dev', changelog: 'Test release', force_update: '0' },
            file: { name: 'file', filename: '99.0.1.rbz', contentType: 'application/zip', content: fakeRbz },
        },
    });
    assert(r.status === 200, `status 200 (got ${r.status} ${JSON.stringify(r.body).slice(0,200)})`);
    assert(r.body.release?.version === '99.0.1', `version=99.0.1`);
    assert(r.body.release?.status === 'draft', `status inicial draft`);
    assert(r.body.release?.sha256?.length === 64, `sha256 64-char`);
    assert(r.body.release?.size_bytes === fakeRbz.length, `size_bytes correto`);
    const releaseId = r.body.release?.id;

    // 2. Versão inválida
    console.log('\n2. POST /releases  (versão inválida)');
    r = await request('POST', '/api/plugin/releases', {
        multipart: {
            fields: { version: 'not-semver', channel: 'dev' },
            file: { name: 'file', filename: 'x.rbz', contentType: 'application/zip', content: fakeRbz },
        },
    });
    assert(r.status === 400, `status 400 (got ${r.status})`);

    // 3. Channel inválido
    console.log('\n3. POST /releases  (channel inválido)');
    r = await request('POST', '/api/plugin/releases', {
        multipart: {
            fields: { version: '99.0.2', channel: 'lol' },
            file: { name: 'file', filename: '99.0.2.rbz', contentType: 'application/zip', content: fakeRbz },
        },
    });
    assert(r.status === 400, `status 400 (got ${r.status})`);

    // 4. Não-admin bloqueado
    console.log('\n4. POST /releases sem admin');
    r = await request('POST', '/api/plugin/releases', {
        token: userToken,
        multipart: {
            fields: { version: '99.0.3', channel: 'dev' },
            file: { name: 'file', filename: '99.0.3.rbz', contentType: 'application/zip', content: fakeRbz },
        },
    });
    assert(r.status === 403, `status 403 vendedor (got ${r.status})`);

    // 5. List filtro
    console.log('\n5. GET /releases?channel=dev');
    r = await request('GET', '/api/plugin/releases?channel=dev');
    assert(r.status === 200, `status 200`);
    assert(Array.isArray(r.body.releases), `releases é array`);
    assert(r.body.releases.some(x => x.version === '99.0.1'), `inclui release upado`);

    // 6. Publish
    console.log('\n6. PATCH /releases/:id status=published');
    r = await request('PATCH', `/api/plugin/releases/${releaseId}`, { json: { status: 'published' } });
    assert(r.status === 200, `status 200`);
    assert(r.body.release?.status === 'published', `published`);
    assert(r.body.release?.published_at, `published_at preenchido`);

    // 7. Promote (dev→beta)
    console.log('\n7. PATCH /releases/:id channel=beta (promote)');
    r = await request('PATCH', `/api/plugin/releases/${releaseId}`, { json: { channel: 'beta' } });
    assert(r.status === 200, `status 200 (got ${r.status} ${JSON.stringify(r.body).slice(0,150)})`);
    assert(r.body.release?.channel === 'beta', `canal=beta`);
    assert(r.body.release?.rbz_path?.startsWith('beta/'), `rbz_path em beta/`);

    // 8. Telemetry
    console.log('\n8. GET /telemetry?group_by=version');
    r = await request('GET', '/api/plugin/telemetry?group_by=version');
    assert(r.status === 200, `status 200`);
    assert(r.body.group_by === 'version', `group_by=version`);
    assert(Array.isArray(r.body.rows), `rows array`);

    // 9. Error reports list
    console.log('\n9. GET /error-reports');
    r = await request('GET', '/api/plugin/error-reports?limit=10');
    assert(r.status === 200, `status 200`);
    assert(Array.isArray(r.body.reports), `reports array`);

    // 10. Delete
    console.log('\n10. DELETE /releases/:id');
    r = await request('DELETE', `/api/plugin/releases/${releaseId}`);
    assert(r.status === 200, `status 200`);
    const remain = db.prepare('SELECT id FROM plugin_releases WHERE id = ?').get(releaseId);
    assert(!remain, `removido da DB`);

    // Cleanup
    db.prepare(`DELETE FROM plugin_releases WHERE version LIKE '99.%'`).run();
    try { rmSync(TEST_RELEASES_DIR, { recursive: true, force: true }); } catch {}

    await stop();
    console.log(`\n=== Resultado: ${pass} pass / ${fail} fail ===\n`);
    process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
