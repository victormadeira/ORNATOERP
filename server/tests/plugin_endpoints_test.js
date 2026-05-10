// ═══════════════════════════════════════════════════════
// Standalone integration test — endpoints /api/plugin/*
// Roda direto: node server/tests/plugin_endpoints_test.js
//
// Usa o app Express real montado em memória (sem porta de rede)
// e injeta token JWT válido para um user de teste.
// ═══════════════════════════════════════════════════════

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import db from '../db.js';
import pluginRoutes from '../routes/plugin.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Mesmo fallback do auth.js para JWT_SECRET em dev
const JWT_SECRET = process.env.JWT_SECRET
    || (existsSync(join(__dir, '..', '.jwt_secret'))
        ? readFileSync(join(__dir, '..', '.jwt_secret'), 'utf-8').trim()
        : (() => { throw new Error('JWT_SECRET not found — start the server once to generate'); })());

// ── Setup app ─────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/plugin', pluginRoutes);

// ── Test user ─────────────────────────────────────────
let user = db.prepare('SELECT id, email, role, nome FROM users WHERE email = ?').get('plugin-test@ornato.dev');
if (!user) {
    db.prepare(
        `INSERT INTO users (nome, email, senha_hash, role, ativo)
         VALUES ('Plugin Test', 'plugin-test@ornato.dev', 'x', 'admin', 1)`
    ).run();
    user = db.prepare('SELECT id, email, role, nome FROM users WHERE email = ?').get('plugin-test@ornato.dev');
}
const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, nome: user.nome, empresa_id: 1 },
    JWT_SECRET,
    { expiresIn: '1h' }
);

// ── Helpers ───────────────────────────────────────────
let server;
function start() {
    return new Promise(resolve => {
        server = app.listen(0, () => resolve(server.address().port));
    });
}
function stop() {
    return new Promise(resolve => server.close(resolve));
}
function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({
            host: '127.0.0.1', port, path, method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const ct = res.headers['content-type'] || '';
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: ct.includes('json') ? JSON.parse(buf.toString()) : buf,
                });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// ── Test runner ──────────────────────────────────────
let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); pass++; }
    else      { console.log(`  ✗ ${msg}`); fail++; }
}

// ── Cleanup test fixture ──────────────────────────────
const TEST_INSTALL_ID = 'test-install-' + Date.now();
db.prepare('DELETE FROM plugin_telemetry WHERE install_id LIKE ?').run('test-install-%');
db.prepare('DELETE FROM plugin_error_reports WHERE install_id LIKE ?').run('test-install-%');

// ─────────────────────────────────────────────────────
async function run() {
    await start();
    console.log(`\n=== Plugin Endpoints Test ===  port=${server.address().port}\n`);

    // 1. check-update — sem versão nova (current = future version)
    console.log('1. GET /check-update?channel=dev&current=99.0.0  (sem nova)');
    let r = await request('GET', '/api/plugin/check-update?channel=dev&current=99.0.0');
    assert(r.status === 200, `status 200 (got ${r.status})`);
    assert(r.body.up_to_date === true, `up_to_date=true (got ${r.body.up_to_date})`);
    assert(r.body.latest === '99.0.0', `latest echoes current`);

    // 2. check-update — com versão nova disponível (current = 0.0.0 < bootstrap)
    console.log('\n2. GET /check-update?channel=dev&current=0.0.0  (nova disponível)');
    r = await request('GET', '/api/plugin/check-update?channel=dev&current=0.0.0');
    assert(r.status === 200, `status 200 (got ${r.status})`);
    assert(r.body.up_to_date === false, `up_to_date=false`);
    assert(r.body.latest === '0.0.1', `latest=0.0.1 (got ${r.body.latest})`);
    assert(typeof r.body.sha256 === 'string' && r.body.sha256.length === 64, `sha256 64-char`);
    assert(r.body.url.includes('/api/plugin/download/'), `url contém /download/`);
    assert(r.body.url.includes('channel=dev'), `url contém channel=dev`);

    // 3. check-update — channel inválido
    console.log('\n3. GET /check-update?channel=lol  (inválido)');
    r = await request('GET', '/api/plugin/check-update?channel=lol&current=0.0.0');
    assert(r.status === 400, `status 400 (got ${r.status})`);

    // 4. download por version
    console.log('\n4. GET /download/0.0.1.rbz?channel=dev');
    r = await request('GET', '/api/plugin/download/0.0.1.rbz?channel=dev');
    assert(r.status === 200, `status 200 (got ${r.status})`);
    assert(r.headers['content-sha256'], `header Content-SHA256 presente`);
    assert(r.headers['content-sha256'].length === 64, `sha256 64 chars`);
    assert(r.body instanceof Buffer && r.body.length > 0, `body é binário não-vazio`);

    // 5. telemetry — primeira chamada → ok
    console.log('\n5. POST /telemetry  (primeira chamada)');
    r = await request('POST', '/api/plugin/telemetry', {
        install_id: TEST_INSTALL_ID,
        plugin_version: '1.2.3',
        os: 'darwin',
        sketchup_version: '2024',
        locale: 'pt-BR',
    });
    assert(r.status === 200, `status 200 (got ${r.status})`);
    assert(r.body.ok === true, `ok=true`);
    const teleRow = db.prepare('SELECT * FROM plugin_telemetry WHERE install_id = ?').get(TEST_INSTALL_ID);
    assert(teleRow && teleRow.plugin_version === '1.2.3', `row inserida na DB`);

    // 6. telemetry — segunda chamada (mesmo install) → rate-limit 429
    console.log('\n6. POST /telemetry  (rate-limit)');
    r = await request('POST', '/api/plugin/telemetry', { install_id: TEST_INSTALL_ID });
    assert(r.status === 429, `status 429 rate-limited (got ${r.status})`);

    // 7. telemetry — sem install_id → 400
    console.log('\n7. POST /telemetry  (sem install_id)');
    r = await request('POST', '/api/plugin/telemetry', { plugin_version: '1.0.0' });
    assert(r.status === 400, `status 400 (got ${r.status})`);

    // 8. error-report — happy path
    console.log('\n8. POST /error-report');
    r = await request('POST', '/api/plugin/error-report', {
        install_id: TEST_INSTALL_ID,
        plugin_version: '1.2.3',
        error_class: 'NoMethodError',
        message: 'undefined method `foo` for nil:NilClass',
        stack: 'plugin.rb:42:in `bar`',
        context: { tool: 'detect_pieces' },
    });
    assert(r.status === 200, `status 200 (got ${r.status})`);
    assert(r.body.ok === true, `ok=true`);
    assert(/^[0-9a-f-]{36}$/.test(r.body.ticket_id), `ticket_id é UUID v4 (got ${r.body.ticket_id})`);
    const errRow = db.prepare('SELECT * FROM plugin_error_reports WHERE ticket_id = ?').get(r.body.ticket_id);
    assert(errRow && errRow.error_class === 'NoMethodError', `row inserida na DB`);

    // 9. error-report — sem class nem message → 400
    console.log('\n9. POST /error-report  (vazio)');
    r = await request('POST', '/api/plugin/error-report', {});
    assert(r.status === 400, `status 400 (got ${r.status})`);

    // 10. auth — sem token
    console.log('\n10. GET /check-update sem token');
    const port = server.address().port;
    const noauth = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/plugin/check-update?channel=dev&current=0.0.0`,
            (res) => resolve(res.statusCode))
            .on('error', reject);
    });
    assert(noauth === 401, `status 401 sem token (got ${noauth})`);

    await stop();

    console.log(`\n=== Resultado: ${pass} pass / ${fail} fail ===\n`);
    process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
