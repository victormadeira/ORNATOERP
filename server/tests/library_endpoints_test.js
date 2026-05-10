// ═══════════════════════════════════════════════════════
// Standalone integration test — endpoints /api/library/* (Sprint B1)
// node server/tests/library_endpoints_test.js
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
        : (() => { throw new Error('JWT_SECRET not found — start the server once to generate'); })());

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/library', libraryRoutes);

// Test user
let user = db.prepare('SELECT id, email, role, nome FROM users WHERE email = ?').get('library-test@ornato.dev');
if (!user) {
    db.prepare(`INSERT INTO users (nome, email, senha_hash, role, ativo)
                VALUES ('Library Test', 'library-test@ornato.dev', 'x', 'admin', 1)`).run();
    user = db.prepare('SELECT id, email, role, nome FROM users WHERE email = ?').get('library-test@ornato.dev');
}
const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, nome: user.nome, empresa_id: 1 },
    JWT_SECRET, { expiresIn: '1h' }
);

let server;
function start() { return new Promise(r => { server = app.listen(0, () => r(server.address().port)); }); }
function stop()  { return new Promise(r => server.close(r)); }
function request(method, path, body, opts = {}) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const data = body ? JSON.stringify(body) : null;
        const headers = {
            'Content-Type': 'application/json',
            ...(opts.noauth ? {} : { 'Authorization': `Bearer ${token}` }),
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

async function run() {
    await start();
    console.log(`\n=== Library Endpoints Test ===  port=${server.address().port}\n`);

    // 1. manifest sem since → full
    console.log('1. GET /manifest (sem since)');
    let r = await request('GET', '/api/library/manifest');
    assert(r.status === 200, `status 200 (got ${r.status})`);
    assert(typeof r.body.library_version === 'string', `library_version presente`);
    assert(Array.isArray(r.body.modules) && r.body.modules.length > 0, `modules não-vazio (got ${r.body.modules?.length})`);
    const sample = r.body.modules[0];
    assert(sample.id && sample.sha256 && sample.json_url, `module tem id/sha256/json_url`);
    const libVer = r.body.library_version;

    // 2. manifest com since == versão atual → modules vazio
    console.log('\n2. GET /manifest?since=<current> → vazio');
    r = await request('GET', `/api/library/manifest?since=${encodeURIComponent(libVer)}`);
    assert(r.status === 200, `status 200`);
    assert(r.body.modules.length === 0, `modules vazio (got ${r.body.modules.length})`);

    // 3. asset JSON
    console.log('\n3. GET /asset/:json');
    const jsonAssetName = sample.json_url.split('/').pop();
    r = await request('GET', `/api/library/asset/${jsonAssetName}`);
    assert(r.status === 200, `status 200 (got ${r.status})`);
    assert(r.headers['content-sha256'] === sample.sha256, `Content-SHA256 bate com manifest`);
    assert(parseInt(r.headers['content-length']) > 0, `Content-Length > 0`);
    assert((r.headers['cache-control'] || '').includes('immutable'), `Cache-Control: immutable`);

    // 4. asset path traversal → 400
    console.log('\n4. GET /asset traversal → 400');
    r = await request('GET', '/api/library/asset/..%2F..%2F..%2Fetc%2Fpasswd');
    assert(r.status === 400, `status 400 (got ${r.status})`);

    // 5. asset 404
    console.log('\n5. GET /asset/inexistente → 404');
    r = await request('GET', '/api/library/asset/nao_existe_12345.json');
    assert(r.status === 404, `status 404 (got ${r.status})`);

    // 6. search por q
    console.log('\n6. GET /search?q=balcao');
    r = await request('GET', '/api/library/search?q=balcao');
    assert(r.status === 200, `status 200`);
    assert(r.body.total > 0, `total > 0 (got ${r.body.total})`);
    assert(r.body.results.every(m => /balcao/i.test(m.name) || /balcao/i.test(m.id) || (m.tags || []).join(' ').match(/balcao/i)),
           `todos os resultados batem com query (loose)`);

    // 7. search por categoria
    console.log('\n7. GET /search?category=cozinha');
    r = await request('GET', '/api/library/search?category=cozinha&per_page=50');
    assert(r.status === 200, `status 200`);
    assert(r.body.results.every(m => m.category === 'cozinha'), `todos da categoria cozinha`);
    assert(r.body.results.length > 0, `cozinha tem resultados (got ${r.body.results.length})`);

    // 8. search com largura_max
    console.log('\n8. GET /search?category=cozinha&largura_max=900');
    r = await request('GET', '/api/library/search?category=cozinha&largura_max=900&per_page=50');
    assert(r.status === 200, `status 200`);
    assert(r.body.results.every(m => m.largura_max === null || m.largura_max <= 900),
           `nenhum largura_max > 900`);

    // 9. paginação
    console.log('\n9. GET /search?per_page=5&page=1');
    r = await request('GET', '/api/library/search?per_page=5&page=1');
    assert(r.status === 200, `status 200`);
    assert(r.body.results.length <= 5, `<= 5 resultados na página`);
    assert(r.body.per_page === 5 && r.body.page === 1, `paginação ecoa`);

    // 10. auth — sem token em manifest
    console.log('\n10. GET /manifest sem token → 401');
    r = await request('GET', '/api/library/manifest', null, { noauth: true });
    assert(r.status === 401, `status 401 (got ${r.status})`);

    // 11. auth — sem token em asset
    console.log('\n11. GET /asset sem token → 401');
    r = await request('GET', `/api/library/asset/${jsonAssetName}`, null, { noauth: true });
    assert(r.status === 401, `status 401 (got ${r.status})`);

    // 12. auth — sem token em search
    console.log('\n12. GET /search sem token → 401');
    r = await request('GET', '/api/library/search?q=foo', null, { noauth: true });
    assert(r.status === 401, `status 401 (got ${r.status})`);

    // 13. manifest com since muito antigo → retorna full
    console.log('\n13. GET /manifest?since=v0.0.1 → cheio');
    r = await request('GET', '/api/library/manifest?since=v0.0.1');
    assert(r.status === 200, `status 200`);
    assert(r.body.modules.length > 0, `modules não-vazio (got ${r.body.modules.length})`);
    assert(Array.isArray(r.body.deleted), `deleted é array`);

    // 14. search retorna facets
    console.log('\n14. GET /search facets');
    r = await request('GET', '/api/library/search?per_page=100');
    assert(r.status === 200, `status 200`);
    assert(r.body.facets && Array.isArray(r.body.facets.category),
           `facets.category é array`);
    assert(r.body.facets.category.length > 0, `tem >=1 categoria nas facets`);
    const sumCat = r.body.facets.category.reduce((a, c) => a + c.count, 0);
    assert(sumCat === r.body.total,
           `soma das counts (${sumCat}) == total (${r.body.total})`);
    assert(r.body.facets.category.every(c => typeof c.value === 'string' && typeof c.count === 'number'),
           `cada facet tem {value, count}`);

    // 15. facets respeitam filtro aplicado (category=cozinha)
    console.log('\n15. GET /search?category=cozinha — facets refletem filtro');
    r = await request('GET', '/api/library/search?category=cozinha&per_page=100');
    assert(r.status === 200, `status 200`);
    assert(r.body.facets.category.length === 1 && r.body.facets.category[0].value === 'cozinha',
           `apenas categoria cozinha aparece nas facets quando filtrada`);

    // 16. sort=recent — ordena por updated_at DESC
    console.log('\n16. GET /search?sort=recent');
    r = await request('GET', '/api/library/search?sort=recent&per_page=10');
    assert(r.status === 200, `status 200`);
    assert(r.body.sort === 'recent', `sort ecoa "recent"`);
    let monotonic = true;
    for (let i = 1; i < r.body.results.length; i++) {
        if (r.body.results[i-1].updated_at < r.body.results[i].updated_at) { monotonic = false; break; }
    }
    assert(monotonic, `updated_at decresce monotonicamente`);

    // 17. sort=name (default sem q)
    console.log('\n17. GET /search sem q usa sort=name por default');
    r = await request('GET', '/api/library/search?per_page=5');
    assert(r.body.sort === 'name', `sort default = name (got ${r.body.sort})`);

    // 18. ranking bm25 com q
    console.log('\n18. GET /search?q=balcao usa relevance');
    r = await request('GET', '/api/library/search?q=balcao&per_page=5');
    assert(r.body.sort === 'relevance', `sort=relevance quando q presente`);
    assert(r.body.results.length > 0, `tem resultados`);

    // 19. profundidade filter
    console.log('\n19. GET /search?profundidade_max=400');
    r = await request('GET', '/api/library/search?profundidade_max=400&per_page=100');
    assert(r.status === 200, `status 200`);
    assert(r.body.results.every(m => m.profundidade_max === null || m.profundidade_max <= 400),
           `nenhum profundidade_max > 400`);

    // 20. autocomplete prefix
    console.log('\n20. GET /autocomplete?q=balc');
    r = await request('GET', '/api/library/autocomplete?q=balc&limit=5');
    assert(r.status === 200, `status 200`);
    assert(Array.isArray(r.body.suggestions), `suggestions é array`);
    assert(r.body.suggestions.length > 0 && r.body.suggestions.length <= 5, `1-5 suggestions`);
    assert(r.body.suggestions.every(s => s.id && s.name && s.category),
           `cada sugestão tem id/name/category`);
    assert((r.headers['cache-control'] || '').includes('max-age=60'),
           `Cache-Control max-age=60`);

    // 21. autocomplete vazio com q vazia
    console.log('\n21. GET /autocomplete?q= (vazio)');
    r = await request('GET', '/api/library/autocomplete?q=');
    assert(r.status === 200 && r.body.suggestions.length === 0, `suggestions vazio quando q vazia`);

    // 22. filters endpoint
    console.log('\n22. GET /filters');
    r = await request('GET', '/api/library/filters');
    assert(r.status === 200, `status 200`);
    assert(Array.isArray(r.body.categories) && r.body.categories.length > 0,
           `categories não-vazio (got ${r.body.categories?.length})`);
    assert(Array.isArray(r.body.channels), `channels é array`);
    assert(r.body.altura_range && typeof r.body.altura_range.min === 'number',
           `altura_range.min numérico (got ${JSON.stringify(r.body.altura_range)})`);
    assert(typeof r.body.n_portas_max === 'number', `n_portas_max numérico`);

    // 23. autocomplete sem auth
    console.log('\n23. GET /autocomplete sem token → 401');
    r = await request('GET', '/api/library/autocomplete?q=balc', null, { noauth: true });
    assert(r.status === 401, `status 401`);

    // 24. filters sem auth
    console.log('\n24. GET /filters sem token → 401');
    r = await request('GET', '/api/library/filters', null, { noauth: true });
    assert(r.status === 401, `status 401`);

    // 25. retro-compat — search legado sem novos params funciona
    console.log('\n25. retro-compat search legado');
    r = await request('GET', '/api/library/search?q=balcao&category=cozinha');
    assert(r.status === 200 && Array.isArray(r.body.results),
           `search legado OK (status ${r.status})`);

    await stop();
    console.log(`\n=== Resultado: ${pass} pass / ${fail} fail ===\n`);
    process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Erro fatal:', e); process.exit(1); });
