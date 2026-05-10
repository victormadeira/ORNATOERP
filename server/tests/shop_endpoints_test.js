// ═══════════════════════════════════════════════════════
// Standalone integration test — endpoints /api/shop/* (Sprint SHOP-2)
// node server/tests/shop_endpoints_test.js
// ═══════════════════════════════════════════════════════

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import db from '../db.js';
import shopRoutes from '../routes/shop.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET
    || (existsSync(join(__dir, '..', '.jwt_secret'))
        ? readFileSync(join(__dir, '..', '.jwt_secret'), 'utf-8').trim()
        : (() => { throw new Error('JWT_SECRET not found — start the server once to generate'); })());

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/shop', shopRoutes);

// ─── Test users (admin org=1, gerente org=1, admin org=999) ───
function ensureUser(email, role, empresa_id) {
    let u = db.prepare('SELECT id, email, role, nome, empresa_id FROM users WHERE email = ?').get(email);
    if (!u) {
        db.prepare(`INSERT INTO users (nome, email, senha_hash, role, ativo, empresa_id)
                    VALUES (?, ?, 'x', ?, 1, ?)`).run(`Shop Test ${role}`, email, role, empresa_id);
        u = db.prepare('SELECT id, email, role, nome, empresa_id FROM users WHERE email = ?').get(email);
    } else if (u.empresa_id !== empresa_id || u.role !== role) {
        db.prepare(`UPDATE users SET role=?, empresa_id=? WHERE email=?`).run(role, empresa_id, email);
        u = db.prepare('SELECT id, email, role, nome, empresa_id FROM users WHERE email = ?').get(email);
    }
    return u;
}
const userAdmin    = ensureUser('shop-admin-test@ornato.dev',    'admin',    1);
const userGerente  = ensureUser('shop-gerente-test@ornato.dev',  'gerente',  1);
const userOrg999   = ensureUser('shop-org999-test@ornato.dev',   'admin',    999);

function tokenFor(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, nome: user.nome, empresa_id: user.empresa_id },
        JWT_SECRET, { expiresIn: '1h' }
    );
}
const tokAdmin   = tokenFor(userAdmin);
const tokGerente = tokenFor(userGerente);
const tokOrg999  = tokenFor(userOrg999);

let server;
function start() { return new Promise(r => { server = app.listen(0, () => r(server.address().port)); }); }
function stop()  { return new Promise(r => server.close(r)); }
function request(method, path, body, opts = {}) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const data = (body !== undefined && body !== null) ? JSON.stringify(body) : null;
        const tok  = opts.token === undefined ? tokAdmin : opts.token;
        const headers = {
            'Content-Type': 'application/json',
            ...(tok ? { 'Authorization': `Bearer ${tok}` } : {}),
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        };
        const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const ct = res.headers['content-type'] || '';
                resolve({
                    status: res.statusCode, headers: res.headers,
                    body: ct.includes('json') ? JSON.parse(buf.toString() || '{}') : buf,
                });
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); pass++; }
    else      { console.log(`  ✗ ${msg}`); fail++; }
}

// ─── cleanup pra teste idempotente ─────────────────────
function cleanup() {
    db.prepare(`DELETE FROM shop_profiles WHERE name LIKE 'test_%'`).run();
    // remove qq profile órfão da org 999 do teste
    db.prepare(`DELETE FROM shop_profiles WHERE org_id = 999`).run();
    // garante a default da org 1 ativa
    db.prepare(`UPDATE shop_profiles SET is_active = 1
                  WHERE org_id = 1 AND name = 'default'`).run();
}

async function run() {
    cleanup();
    await start();
    console.log(`\n=== Shop Endpoints Test ===  port=${server.address().port}\n`);

    // 1. GET /config retorna profile com valores
    console.log('1. GET /api/shop/config');
    let r = await request('GET', '/api/shop/config');
    assert(r.status === 200, `status 200 (got ${r.status})`);
    assert(r.body.profile_name === 'default', `profile_name = default`);
    assert(typeof r.body.values === 'object', `values é objeto`);
    assert(r.body.values.folga_porta_lateral === 2.0, `folga_porta_lateral default 2.0`);
    assert(r.body.values.dobradica_padrao === 'amor_cj', `dobradica_padrao default`);
    assert(typeof r.body.version === 'string', `version (updated_at) presente`);
    assert((r.headers['cache-control'] || '').includes('max-age=60'), `Cache-Control: max-age=60`);

    // 2. GET /config sem token → 401
    console.log('\n2. GET /config sem token → 401');
    r = await request('GET', '/api/shop/config', null, { token: null });
    assert(r.status === 401, `status 401 (got ${r.status})`);

    // 3. GET /profiles (admin)
    console.log('\n3. GET /profiles (admin)');
    r = await request('GET', '/api/shop/profiles');
    assert(r.status === 200, `status 200`);
    assert(Array.isArray(r.body.profiles), `profiles é array`);
    assert(r.body.profiles.length >= 1, `pelo menos 1 profile`);
    assert(r.body.profiles.some(p => p.name === 'default' && p.is_active), `default ativo`);

    // 4. GET /profiles sem permissão (gerente)
    console.log('\n4. GET /profiles como gerente → 403');
    r = await request('GET', '/api/shop/profiles', null, { token: tokGerente });
    assert(r.status === 403, `status 403 (got ${r.status})`);

    // 5. POST /profiles cria profile
    console.log('\n5. POST /profiles cria profile');
    r = await request('POST', '/api/shop/profiles', {
        name: 'test_premium',
        values: {
            folga_porta_lateral: 1.5,
            recuo_fundo: 15.0,
            dobradica_padrao: 'blum_clip_top',
            sistema32_ativo: false,
        },
        custom_keys: { fornecedor_padrao: 'leo_madeiras' },
        set_active: false,
    });
    assert(r.status === 201, `status 201 (got ${r.status})`);
    assert(r.body.profile_name === 'test_premium', `name ecoa`);
    assert(r.body.values.folga_porta_lateral === 1.5, `folga aplicada`);
    assert(r.body.values.dobradica_padrao === 'blum_clip_top', `dobradica aplicada`);
    assert(r.body.values.sistema32_ativo === false, `bool false aplicado`);
    assert(r.body.custom_keys.fornecedor_padrao === 'leo_madeiras', `custom_keys`);
    assert(r.body.is_active === false, `is_active = false (set_active false)`);
    const newId = r.body.id;

    // 6. POST com chave inválida → 400
    console.log('\n6. POST com chave inválida → 400');
    r = await request('POST', '/api/shop/profiles', {
        name: 'test_bad',
        values: { chave_que_nao_existe: 99, folga_porta_lateral: 2 },
    });
    assert(r.status === 400, `status 400 (got ${r.status})`);
    assert(Array.isArray(r.body.errors) && r.body.errors.some(e => /chave_que_nao_existe/.test(e)),
           `error menciona chave inválida`);

    // 7. POST duplicate name → 409
    console.log('\n7. POST com name duplicado → 409');
    r = await request('POST', '/api/shop/profiles', { name: 'test_premium', values: {} });
    assert(r.status === 409, `status 409 (got ${r.status})`);

    // 8. PUT atualiza profile
    console.log('\n8. PUT /profiles/:id');
    r = await request('PUT', `/api/shop/profiles/${newId}`, {
        values: { folga_porta_lateral: 1.0 },
        custom_keys: { fornecedor_padrao: 'placacenter' },
    });
    assert(r.status === 200, `status 200`);
    assert(r.body.values.folga_porta_lateral === 1.0, `valor atualizado`);
    assert(r.body.custom_keys.fornecedor_padrao === 'placacenter', `custom atualizado`);

    // 9. PATCH activate desativa anteriores
    console.log('\n9. PATCH activate');
    r = await request('PATCH', `/api/shop/profiles/${newId}/activate`);
    assert(r.status === 200, `status 200`);
    assert(r.body.is_active === true, `novo profile ativo`);

    r = await request('GET', '/api/shop/profiles');
    const activeList = r.body.profiles.filter(p => p.is_active);
    assert(activeList.length === 1, `apenas 1 profile ativo (got ${activeList.length})`);
    assert(activeList[0].id === newId, `o ativo é o novo`);

    // 10. GET /config agora reflete o novo ativo
    console.log('\n10. GET /config reflete novo ativo');
    r = await request('GET', '/api/shop/config');
    assert(r.body.profile_name === 'test_premium', `profile_name = test_premium`);
    assert(r.body.values.folga_porta_lateral === 1.0, `valor do novo ativo`);

    // 11. DELETE em ativo → 400
    console.log('\n11. DELETE ativo → 400');
    r = await request('DELETE', `/api/shop/profiles/${newId}`);
    assert(r.status === 400, `status 400 (got ${r.status})`);

    // 12. Reativa default e DELETE no inativo → 200
    console.log('\n12. ativa default + DELETE no test_premium (inativo)');
    const def = (await request('GET', '/api/shop/profiles')).body.profiles.find(p => p.name === 'default');
    r = await request('PATCH', `/api/shop/profiles/${def.id}/activate`);
    assert(r.status === 200, `default reativado`);
    r = await request('DELETE', `/api/shop/profiles/${newId}`);
    assert(r.status === 200, `delete inativo OK (got ${r.status})`);
    r = await request('GET', '/api/shop/profiles');
    assert(!r.body.profiles.some(p => p.id === newId), `removido da lista`);

    // 13. Isolamento: org 999 vê profiles independentes
    console.log('\n13. duas orgs independentes');
    r = await request('GET', '/api/shop/config', null, { token: tokOrg999 });
    assert(r.status === 200, `org 999 GET /config OK`);
    assert(r.body.org_id === 999, `org_id = 999`);
    // cria profile na org 999
    r = await request('POST', '/api/shop/profiles', {
        name: 'test_org999_only',
        values: { folga_porta_lateral: 5.0 },
        set_active: true,
    }, { token: tokOrg999 });
    assert(r.status === 201, `POST org 999 OK`);
    // org 1 não vê profile da org 999
    r = await request('GET', '/api/shop/profiles');
    assert(!r.body.profiles.some(p => p.name === 'test_org999_only'),
           `org 1 NÃO vê profile da org 999`);
    // org 999 vê o seu
    r = await request('GET', '/api/shop/profiles', null, { token: tokOrg999 });
    assert(r.body.profiles.some(p => p.name === 'test_org999_only'),
           `org 999 vê seu profile`);

    // 14. PUT em profile de outra org → 404
    console.log('\n14. PUT profile de outra org → 404');
    const org999Profile = (await request('GET', '/api/shop/profiles', null, { token: tokOrg999 }))
        .body.profiles.find(p => p.name === 'test_org999_only');
    r = await request('PUT', `/api/shop/profiles/${org999Profile.id}`, {
        values: { folga_porta_lateral: 9.0 },
    }); // chamado como admin org 1
    assert(r.status === 404, `status 404 — não enxerga profile de outra org`);

    // 15. POST como gerente → 403
    console.log('\n15. POST como gerente → 403');
    r = await request('POST', '/api/shop/profiles', {
        name: 'test_should_fail', values: {},
    }, { token: tokGerente });
    assert(r.status === 403, `status 403 (got ${r.status})`);

    // ─── final cleanup ─────────────────────────────────
    cleanup();

    await stop();
    console.log(`\n=== Resultado: ${pass} pass / ${fail} fail ===\n`);
    process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
