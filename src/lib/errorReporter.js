// ═══════════════════════════════════════════════════════
// Error Reporter — envia erros do frontend para /api/errors
// ═══════════════════════════════════════════════════════
// Non-blocking: usa sendBeacon quando disponível (sobrevive a navegação).
// Dedup local: não envia o mesmo erro 2x em 10s (evita flood em loop).
// Fire-and-forget: nunca joga exceção, nunca bloqueia a UI.

const DEDUP_MS = 10_000;
const MAX_RECENT = 100;     // teto do Map — evita vazamento em caso de 100 erros distintos/s
const recent = new Map(); // key → timestamp

function shouldSend(key) {
    const now = Date.now();
    // Limpa entradas velhas
    for (const [k, t] of recent) {
        if (now - t > DEDUP_MS) recent.delete(k);
    }
    if (recent.has(key)) return false;
    // Teto duro: se chegou no limite e nenhuma entrada velha foi purgada,
    // descarta a mais antiga (FIFO, Map preserva ordem de inserção).
    if (recent.size >= MAX_RECENT) {
        const firstKey = recent.keys().next().value;
        if (firstKey !== undefined) recent.delete(firstKey);
    }
    recent.set(key, now);
    return true;
}

/**
 * Reporta um erro ao backend.
 * @param {object} opts
 * @param {string} opts.message
 * @param {string} [opts.stack]
 * @param {string} [opts.level] - 'error' | 'warn' | 'info'
 * @param {object} [opts.meta]
 */
export function reportError({ message, stack = '', level = 'error', meta = {} } = {}) {
    try {
        if (!message) return;
        const msgStr = String(message).slice(0, 500);
        const key = `${level}|${msgStr}|${(stack || '').split('\n')[1] || ''}`;
        if (!shouldSend(key)) return;

        const payload = {
            message: msgStr,
            stack: String(stack || '').slice(0, 8000),
            level,
            url: typeof window !== 'undefined' ? window.location.href : '',
            meta: {
                ...meta,
                ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                ts: new Date().toISOString(),
            },
        };
        const body = JSON.stringify(payload);

        // sendBeacon é best-effort e não bloqueia unload. Fallback para fetch.
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon('/api/errors', blob);
        } else {
            fetch('/api/errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true,
            }).catch(() => {});
        }
    } catch (_) {
        // Nunca propaga — reporter falhando não pode quebrar a app
    }
}

let installed = false;
/**
 * Instala listeners globais. Chamar UMA vez no bootstrap do app.
 */
export function installGlobalErrorHandlers() {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', (e) => {
        // e.error tem stack; e.message é fallback
        const err = e.error;
        reportError({
            message: (err && err.message) || e.message || 'Unknown error',
            stack: (err && err.stack) || '',
            meta: {
                kind: 'window.error',
                filename: e.filename || '',
                lineno: e.lineno || 0,
                colno: e.colno || 0,
            },
        });
    });

    window.addEventListener('unhandledrejection', (e) => {
        const reason = e.reason;
        reportError({
            message: (reason && reason.message) || String(reason) || 'Unhandled promise rejection',
            stack: (reason && reason.stack) || '',
            meta: { kind: 'unhandledrejection' },
        });
    });
}
