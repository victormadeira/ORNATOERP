// ═══════════════════════════════════════════════════════
// Standalone integration test — variações de blocos por marcenaria (LIB-VARIATION)
// node server/tests/library_variation_test.js
// Cobre: duplicate-for-shop, manifest scoping, origin-updates apply/dismiss,
//        regras (variação não duplica, org alheia não vê).
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

function ensureUser(email, role, empresa_id = 1) {
    let u = db.prepare('SELECT id, email, role, nome, empresa_id FROM users WHERE email=?').get(email);
    if (!u) {
        db.prepare(`INSERT INTO users (nome,email,senha_hash,role,ativo,empresa_id) VALUES (?,?,?,?,1,?)`)
          .run(`Test ${role}`, email, 'x', role, empresa_id);
        u = db.prepare('SELECT id, email, role, nome, empresa_id FROM users WHERE email=?').get(email);
    } else {
        if (u.role !== role) { db.prepare('UPDATE users SET role=? WHERE id=?').run(role, u.id); u.role = role; }
        if (u.empresa_id !== empresa_id) {
            db.prepare('UPDATE users SET empresa_id=? WHERE id=?').run(empresa_id, u.id);
            u.empresa_id = empresa_id;
        }
    }
    return u;
}

// Garante empresa 2 (pra teste cross-org)
try { db.prepare(`INSERT OR IGNORE INTO empresas (id, slug, nome, plano) VALUES (2, 'org2', 'Org Teste 2', 'padrao')`).run(); } catch (_) {}

const adminOrg1   = ensureUser('var-admin-o1@ornato.dev',   'admin', 1);
const curatorOrg1 = ensureUser('var-cur-o1@ornato.dev',     'library_curator', 1);
const curatorOrg2 = ensureUser('var-cur-o2@ornato.dev',     'library_curator', 2);

function tok(u) {
    return jwt.sign({ id: u.id, email: u.email, role: u.role, nome: u.nome, empresa_id: u.empresa_id || 1 },
                    JWT_SECRET, { expiresIn: '1h' });
}
const tAdmin1 = tok(adminOrg1);
const tCur1   = tok(curatorOrg1);
const tCur2Org = tok(curatorOrg2);

let server;
function start() { return new Promise(r => { server = app.listen(0, () => r(server.address().port)); }); }
function stop()  { return new Promise(r => server.close(r)); }

function mpEncode(fields, files) {
    const boundary = '----BNDRY' + Math.random().toString(16).slice(2);
    const parts = [];
    for (const [k, v] of Object.entries(fields || {})) {
        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    for (const f of files || []) {
        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\n` +
            `Content-Type: ${f.contentType || 'application/octet-stream'}\r\n\r\n`));
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

function makeJsonModule(id, name = null) {
    return {
        id, nome: name || `Var ${id}`, categoria: 'teste_variation',
        tags: ['variation','test'],
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

const ORIGIN_ID = 'var_origin_a';

async function ensureGlobalOrigin() {
    // Limpa estado prévio
    db.prepare(`DELETE FROM library_origin_updates WHERE origin_module_id LIKE 'var_%' OR variation_module_id LIKE 'var_%'`).run();
    db.prepare(`DELETE FROM library_locks WHERE module_id LIKE 'var_%'`).run();
    db.prepare(`DELETE FROM library_versions WHERE module_id LIKE 'var_%'`).run();
    db.prepare(`DELETE FROM library_modules WHERE id LIKE 'var_%'`).run();

    const r = await request('POST', '/api/library/admin/modules', {
        token: tAdmin1,
        multipart: {
            fields: { channel: 'stable', status: 'published' },
            files: [{ field: 'json_file', filename: 'a.json', data: JSON.stringify(makeJsonModule(ORIGIN_ID, 'Bloco Origem')) }],
        },
    });
    if (r.status !== 201) throw new Error('setup falhou: ' + JSON.stringify(r.body));
    // Garante que ficou como global (default da migration 007)
    db.prepare(`UPDATE library_modules SET visibility='global', org_id=NULL WHERE id=?`).run(ORIGIN_ID);
}

async function run() {
    await start();
    console.log(`\n=== Library VARIATION Test ===  port=${server.address().port}\n`);

    await ensureGlobalOrigin();

    // 1. Curator org2 NÃO duplicar bloco inexistente → 404
    let r = await request('POST', `/api/library/admin/modules/nope_xyz/duplicate-for-shop`,
        { token: tCur2Org, json: {} });
    assert(r.status === 404, `1. duplicate origem inexistente → 404 (got ${r.status})`);

    // 2. Curator org1 duplica bloco global → 201, derived_from + org_id + visibility setados
    r = await request('POST', `/api/library/admin/modules/${ORIGIN_ID}/duplicate-for-shop`,
        { token: tCur1, json: { name: 'Bloco Custom Org1' } });
    assert(r.status === 201, `2. duplicate por curatorOrg1 → 201 (got ${r.status}) ${JSON.stringify(r.body).slice(0,200)}`);
    const variationId = r.body.module?.id;
    assert(!!variationId && variationId !== ORIGIN_ID, `   variation tem ID novo (${variationId})`);
    assert(r.body.module.derived_from === ORIGIN_ID, `   derived_from = origem`);
    assert(r.body.module.org_id === 1, `   org_id = 1`);
    assert(r.body.module.visibility === 'private_org', `   visibility = private_org`);

    // 3. Curator org2 duplica também → 201, mas com org_id=2 (variação distinta)
    r = await request('POST', `/api/library/admin/modules/${ORIGIN_ID}/duplicate-for-shop`,
        { token: tCur2Org, json: { name: 'Bloco Custom Org2' } });
    assert(r.status === 201, `3. duplicate por curatorOrg2 → 201`);
    const variationId2 = r.body.module?.id;
    assert(r.body.module.org_id === 2, `   org_id = 2`);

    // 4. Admin de org1 NÃO vê variação de org2 em GET /admin/modules/:id (404)
    r = await request('GET', `/api/library/admin/modules/${variationId2}`, { token: tCur1 });
    assert(r.status === 404, `4. cross-org GET variação alheia → 404 (got ${r.status})`);

    // 5. Listagem admin SEM include_variations → só mostra global, não a variation
    r = await request('GET', `/api/library/admin/modules`, { token: tCur1 });
    const ids5 = (r.body.modules || []).map(m => m.id);
    assert(ids5.includes(ORIGIN_ID), `5a. listagem admin contém origem global`);
    assert(!ids5.includes(variationId), `5b. listagem admin SEM include_variations não traz variação`);

    // 6. Listagem admin COM include_variations=true → traz variação da PRÓPRIA org
    r = await request('GET', `/api/library/admin/modules?include_variations=true`, { token: tCur1 });
    const ids6 = (r.body.modules || []).map(m => m.id);
    assert(ids6.includes(variationId), `6a. include_variations traz variação da própria org`);
    assert(!ids6.includes(variationId2), `6b. include_variations NÃO traz variação de outra org (got ${ids6.join(',')})`);

    // 7. Tentar duplicar uma VARIAÇÃO → 400 (regra: só globais duplicam)
    r = await request('POST', `/api/library/admin/modules/${variationId}/duplicate-for-shop`,
        { token: tCur1, json: {} });
    assert(r.status === 400, `7. duplicar variação (não global) → 400 (got ${r.status})`);

    // (Para o manifest: variações precisam estar published — em produção, isso vem
    // do publish da própria marcenaria via PATCH /publish na variação)
    db.prepare(`UPDATE library_modules SET status='published' WHERE id IN (?, ?)`).run(variationId, variationId2);

    // 8. Manifest de user da org1 inclui variação privada da org1
    r = await request('GET', `/api/library/manifest`, { token: tCur1 });
    const manifestIds1 = (r.body.modules || []).map(m => m.id);
    assert(manifestIds1.includes(variationId), `8a. manifest org1 inclui variação privada org1`);
    assert(!manifestIds1.includes(variationId2), `8b. manifest org1 NÃO inclui variação org2`);

    // 9. Manifest de user da org2 NÃO inclui variação org1 (e inclui sua própria)
    r = await request('GET', `/api/library/manifest`, { token: tCur2Org });
    const manifestIds2 = (r.body.modules || []).map(m => m.id);
    assert(!manifestIds2.includes(variationId), `9a. manifest org2 NÃO inclui variação org1`);
    assert(manifestIds2.includes(variationId2), `9b. manifest org2 inclui variação privada org2`);


    // 10. Publicar STABLE da origem → cria origin_updates pra todas as variações
    //     Faz checkin novo na origem pra ter v nova, depois publish stable
    const updatedOriginJson = makeJsonModule(ORIGIN_ID, 'Bloco Origem v2');
    updatedOriginJson.parametros.largura.default = 850; // mudou default
    updatedOriginJson.parametros.cor = { label: 'Cor', type: 'string', default: 'branco' }; // novo param

    // checkout + checkin para ter nova versão
    await request('POST', `/api/library/admin/modules/${ORIGIN_ID}/checkout`,
        { token: tAdmin1, json: { reason: 'update v2' } });
    r = await request('POST', `/api/library/admin/modules/${ORIGIN_ID}/checkin`, {
        token: tAdmin1,
        multipart: { fields: { version_notes: 'v2' },
                     files: [{ field: 'json', filename: 'o.json', data: JSON.stringify(updatedOriginJson) }] },
    });
    assert(r.status === 200, `10a. checkin nova versão da origem → 200 (got ${r.status})`);

    // publica stable → dispara hook
    r = await request('PATCH', `/api/library/admin/modules/${ORIGIN_ID}/publish`,
        { token: tAdmin1, json: { channel: 'stable', status: 'published' } });
    assert(r.status === 200, `10b. publish stable origem → 200 (got ${r.status})`);
    assert(r.body.derivations_notified >= 2, `10c. hook notificou ≥2 variações (got ${r.body.derivations_notified})`);

    // 11. GET origin-updates para org1 → vê só a variação da org1 (não da org2)
    r = await request('GET', `/api/library/admin/origin-updates`, { token: tCur1 });
    assert(r.status === 200, `11a. GET origin-updates → 200`);
    const updates1 = r.body.updates || [];
    assert(updates1.some(u => u.variation_module_id === variationId), `11b. update da variação org1 listada`);
    assert(!updates1.some(u => u.variation_module_id === variationId2), `11c. update da variação org2 NÃO listada (cross-org)`);

    const updateIdOrg1 = updates1.find(u => u.variation_module_id === variationId)?.id;

    // 12. Apply origin-update por curator org1 → 200, marca status='applied'
    //     (precisamos que a variação tenha um `default` customizado pra validar smart merge)
    //     Mas como duplicação copiou JSON da origem, o default da variação == 800.
    //     Vamos forçar uma customização via UPDATE direto no JSON.
    //     Em produção isso viria de checkin na variação. Pra teste: simulamos.
    //     (apply lê do FS — vamos reescrever via library_modules.json_path direto)
    {
        const varRow = db.prepare(`SELECT json_path FROM library_modules WHERE id = ?`).get(variationId);
        const fs = await import('fs');
        const path = await import('path');
        const dataDir = process.env.ORNATO_LIBRARY_DIR
            || path.join(__dir, '..', '..', 'data', 'library', 'assets');
        const p = path.resolve(dataDir, varRow.json_path);
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        j.parametros.largura.default = 999; // customização da marcenaria
        fs.writeFileSync(p, JSON.stringify(j, null, 2));
    }

    r = await request('POST', `/api/library/admin/origin-updates/${updateIdOrg1}/apply`,
        { token: tCur1, json: {} });
    assert(r.status === 200, `12a. apply origin-update por curator dono → 200 (got ${r.status}) ${JSON.stringify(r.body).slice(0,200)}`);
    assert(!!r.body.new_version, `12b. apply retorna new_version`);
    // Verifica smart merge: largura.default deve ser 999 (custom mantida), cor (novo) deve aparecer
    {
        const varRow = db.prepare(`SELECT json_path FROM library_modules WHERE id = ?`).get(variationId);
        const fs = await import('fs');
        const path = await import('path');
        const dataDir = process.env.ORNATO_LIBRARY_DIR
            || path.join(__dir, '..', '..', 'data', 'library', 'assets');
        const j = JSON.parse(fs.readFileSync(path.resolve(dataDir, varRow.json_path), 'utf8'));
        assert(j.parametros.largura.default === 999, `12c. smart merge preservou customização (largura=999, got ${j.parametros.largura.default})`);
        assert(!!j.parametros.cor, `12d. smart merge trouxe novo param da origem (cor)`);
    }
    const stRow = db.prepare(`SELECT status FROM library_origin_updates WHERE id=?`).get(updateIdOrg1);
    assert(stRow.status === 'applied', `12e. update marcado status=applied`);

    // 13. Tentar apply de novo → 409 (não está pending)
    r = await request('POST', `/api/library/admin/origin-updates/${updateIdOrg1}/apply`,
        { token: tCur1, json: {} });
    assert(r.status === 409, `13. apply já aplicada → 409 (got ${r.status})`);

    // 14. Dismiss origin-update da variação org2 por curator org2 → 200
    r = await request('GET', `/api/library/admin/origin-updates`, { token: tCur2Org });
    const upd2 = (r.body.updates || []).find(u => u.variation_module_id === variationId2);
    assert(!!upd2, `14a. update org2 visível pra curator org2`);
    r = await request('POST', `/api/library/admin/origin-updates/${upd2.id}/dismiss`,
        { token: tCur2Org, json: {} });
    assert(r.status === 200, `14b. dismiss → 200`);
    const stRow2 = db.prepare(`SELECT status FROM library_origin_updates WHERE id=?`).get(upd2.id);
    assert(stRow2.status === 'dismissed', `14c. update marcado status=dismissed`);

    // 15. Curator org1 tenta dismiss update da org2 → 403
    db.prepare(`UPDATE library_origin_updates SET status='pending' WHERE id=?`).run(upd2.id);
    r = await request('POST', `/api/library/admin/origin-updates/${upd2.id}/dismiss`,
        { token: tCur1, json: {} });
    assert(r.status === 403, `15. cross-org dismiss → 403 (got ${r.status})`);

    console.log(`\n=== Resultado: ${pass} passes / ${fail} falhas ===\n`);
    await stop();
    process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
