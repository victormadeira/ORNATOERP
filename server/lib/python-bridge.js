/**
 * python-bridge.js — Helper para comunicacao com o CNC Optimizer Python (FastAPI).
 *
 * O Express delega nesting e G-code para o backend Python quando disponivel.
 * Se Python nao estiver rodando, retorna null para que o Express use o motor JS.
 *
 * Uso:
 *   import { callPython, isPythonAvailable } from '../lib/python-bridge.js';
 *
 *   if (await isPythonAvailable()) {
 *     const result = await callPython('optimize', payload);
 *     if (result) return res.json(result);
 *   }
 *   // fallback JS...
 */

const PYTHON_URL = process.env.CNC_OPTIMIZER_URL || 'http://localhost:8000';
const HEALTH_TIMEOUT = 2000;   // 2s para health check
const REQUEST_TIMEOUT = 120000; // 2min para otimizacao

let _lastHealthCheck = 0;
let _lastHealthResult = false;
const HEALTH_CACHE_MS = 10000; // Cache health check por 10s

/**
 * Verifica se o backend Python esta disponivel.
 * Resultado cacheado por 10 segundos para nao sobrecarregar.
 */
export async function isPythonAvailable() {
    const now = Date.now();
    if (now - _lastHealthCheck < HEALTH_CACHE_MS) {
        return _lastHealthResult;
    }

    try {
        const resp = await fetch(`${PYTHON_URL}/api/v1/health`, {
            signal: AbortSignal.timeout(HEALTH_TIMEOUT),
        });
        _lastHealthResult = resp.ok;
    } catch {
        _lastHealthResult = false;
    }
    _lastHealthCheck = now;
    return _lastHealthResult;
}

/**
 * Chamar endpoint do Python bridge.
 *
 * @param {'optimize'|'gcode'} endpoint — Endpoint a chamar
 * @param {Object} payload — Dados para enviar
 * @returns {Object|null} — Resultado ou null se falhar
 */
export async function callPython(endpoint, payload) {
    try {
        const url = `${PYTHON_URL}/api/v1/bridge/${endpoint}`;
        console.log(`  [Python Bridge] POST ${url} (${JSON.stringify(payload).length} bytes)`);

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });

        if (!resp.ok) {
            const errorBody = await resp.text().catch(() => '');
            console.error(`  [Python Bridge] Erro ${resp.status}: ${errorBody.slice(0, 200)}`);
            return null;
        }

        const result = await resp.json();
        console.log(`  [Python Bridge] OK — motor=${result.motor || 'python'}, tempo=${result.tempo_ms || '?'}ms`);
        return result;
    } catch (err) {
        console.error(`  [Python Bridge] Falha:`, err.message);
        // Invalidar cache de health para recheck na proxima
        _lastHealthCheck = 0;
        _lastHealthResult = false;
        return null;
    }
}

/**
 * Resetar cache de health (util para testes).
 */
export function resetHealthCache() {
    _lastHealthCheck = 0;
    _lastHealthResult = false;
}
