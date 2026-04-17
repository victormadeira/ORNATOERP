#!/usr/bin/env node
// ═══════════════════════════════════════════════════════
// smoke-test.js — sobe o server e valida boot + rotas críticas
// ═══════════════════════════════════════════════════════
// Uso:
//   npm run smoke
//
// O que faz:
//   1. Spawn do server/index.js em subprocess (PORT aleatória)
//   2. Aguarda `listening on` no stdout (ou timeout 15s)
//   3. GET /api/health — deve responder 200 { status: 'ok' }
//   4. GET /api/* inexistente — deve responder 404
//   5. GET /api/auth/me sem token — deve responder 401
//   6. Encerra o subprocess e sai com exit code
//
// Rodar no CI antes de deploy — se algo quebrar no boot
// ou em middlewares de guarda, pega aqui.

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SERVER = join(ROOT, 'server', 'index.js');
const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 15000;

let proc;
let bootTimer;

function log(...args) {
    console.log('[smoke]', ...args);
}
function fail(msg, extra = '') {
    console.error('[smoke] FAIL:', msg, extra);
    if (proc && !proc.killed) proc.kill('SIGTERM');
    process.exit(1);
}

function waitForBoot() {
    return new Promise((resolve, reject) => {
        let ready = false;
        const onData = (buf) => {
            const s = buf.toString();
            process.stdout.write(s);
            // Heurística: mensagem "listening" ou "ouvindo" ou URL http
            if (!ready && /listening|ouvindo|rodando|started|http:\/\//i.test(s)) {
                ready = true;
                clearTimeout(bootTimer);
                // Pequena folga para finalizar init (migrações, crons)
                setTimeout(resolve, 500);
            }
        };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', (buf) => process.stderr.write(buf.toString()));
        proc.on('exit', (code) => {
            if (!ready) reject(new Error(`Server saiu antes do boot (exit ${code})`));
        });
        bootTimer = setTimeout(() => {
            if (!ready) reject(new Error(`Boot timeout (${BOOT_TIMEOUT_MS}ms)`));
        }, BOOT_TIMEOUT_MS);
    });
}

async function check(name, fn) {
    try {
        await fn();
        log('PASS', name);
    } catch (e) {
        fail(name, e.message);
    }
}

async function main() {
    log(`Bootando server em PORT=${PORT}...`);
    proc = spawn('node', [SERVER], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForBoot();
    log('Server up. Rodando checks...');

    // Check 1: health
    await check('GET /api/health → 200 { status: ok }', async () => {
        const r = await fetch(`${BASE}/api/health`);
        if (r.status !== 200) throw new Error(`status ${r.status}`);
        const j = await r.json();
        if (j.status !== 'ok') throw new Error(`body inesperado: ${JSON.stringify(j)}`);
    });

    // Check 2: 404 em /api inexistente
    await check('GET /api/__nope → 404', async () => {
        const r = await fetch(`${BASE}/api/__nope__${Date.now()}`);
        if (r.status !== 404) throw new Error(`esperado 404, veio ${r.status}`);
    });

    // Check 3: rota protegida sem token → 401
    await check('GET /api/clientes sem token → 401', async () => {
        const r = await fetch(`${BASE}/api/clientes`);
        if (r.status !== 401) throw new Error(`esperado 401, veio ${r.status}`);
    });

    // Check 4: SPA fallback serve HTML em rota não-/api
    await check('GET / → 200 (SPA)', async () => {
        const r = await fetch(`${BASE}/`);
        if (r.status !== 200) throw new Error(`status ${r.status}`);
    });

    log('Todos os checks passaram ✓');
    proc.kill('SIGTERM');
    // Dar tempo pro process encerrar limpo
    setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', () => {
    if (proc && !proc.killed) proc.kill('SIGTERM');
    process.exit(130);
});
process.on('SIGTERM', () => {
    if (proc && !proc.killed) proc.kill('SIGTERM');
    process.exit(143);
});

main().catch((e) => fail('erro fatal', e.message));
