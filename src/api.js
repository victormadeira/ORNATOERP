// ═══════════════════════════════════════════════════════
// API Helper — fetch com JWT automático + retry
// ═══════════════════════════════════════════════════════
const BASE = '/api';

function getToken() {
    return localStorage.getItem('erp_token');
}

// Timeout padrão 30s, rotas pesadas usam mais
const ROUTE_TIMEOUTS = {
    '/cnc/': 600000,        // CNC: 10min (otimização SA pesada)
    '/plano-corte/': 300000, // Plano de corte: 5min
};

function getTimeout(path) {
    for (const [route, ms] of Object.entries(ROUTE_TIMEOUTS)) {
        if (path.includes(route)) return ms;
    }
    return 30000;
}

async function request(method, path, body = null, retries = 1, { signal: externalSignal } = {}) {
    const token = getToken();
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    };
    if (body) opts.body = JSON.stringify(body);

    const timeoutMs = getTimeout(path);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    // Se receber signal externo (ex: cancelamento), abortar o controller interno.
    // Guardamos o handler para removê-lo após a request — sem isso o AbortController
    // fica referenciado pelo externalSignal até ele ser coletado (memory leak).
    let externalAbortHandler = null;
    if (externalSignal) {
        externalAbortHandler = () => controller.abort();
        externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
    }
    opts.signal = controller.signal;

    const cleanup = () => {
        clearTimeout(timeoutId);
        if (externalAbortHandler && externalSignal) {
            externalSignal.removeEventListener('abort', externalAbortHandler);
        }
    };

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${BASE}${path}`, opts);
            cleanup();
            let data;
            try {
                data = await res.json();
            } catch {
                if (!res.ok) throw { status: res.status, error: `Erro ${res.status}: ${res.statusText}` };
                return {};
            }
            if (!res.ok) throw { status: res.status, ...data };
            return data;
        } catch (err) {
            cleanup();
            if (err.name === 'AbortError') {
                // Se foi cancelamento externo (pelo usuário), propagar como AbortError
                if (externalSignal && externalSignal.aborted) {
                    const abortErr = new Error('Cancelado pelo usuário');
                    abortErr.name = 'AbortError';
                    throw abortErr;
                }
                const secs = Math.round(timeoutMs / 1000);
                throw { error: `Requisição expirou (timeout ${secs}s). ${secs > 60 ? 'A otimização pode demorar com muitas peças.' : 'Verifique sua conexão.'}` };
            }
            lastError = err;
            const isNetworkError = !err.status;
            if (!isNetworkError || attempt >= retries) throw lastError;
            await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
        }
    }
    throw lastError;
}

async function requestBlob(method, path, body = null) {
    const token = getToken();
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erro ao gerar documento' }));
        throw { status: res.status, ...err };
    }
    return res.blob();
}

function uploadFile(path, file, onProgress) {
    return new Promise((resolve, reject) => {
        const token = getToken();
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);
        // Token como campo do form (fallback caso header seja removido pelo proxy)
        if (token) formData.append('_token', token);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };
        xhr.onload = () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) resolve(data);
                else reject({ status: xhr.status, ...data });
            } catch { reject({ status: xhr.status, error: `Erro ${xhr.status}` }); }
        };
        xhr.onerror = () => reject({ error: 'Erro de rede ao enviar arquivo' });
        xhr.ontimeout = () => reject({ error: 'Timeout no envio do arquivo' });
        xhr.timeout = 300000; // 5 min

        xhr.open('POST', `${BASE}${path}`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
    });
}

const api = {
    get: (path, opts) => request('GET', path, null, 1, opts),  // opts aceita { signal } para AbortController
    post: (path, body, opts) => request('POST', path, body, 1, opts),
    put: (path, body, opts) => request('PUT', path, body, 1, opts),
    del: (path) => request('DELETE', path),
    postBlob: (path, body) => requestBlob('POST', path, body),
    upload: uploadFile,
};

export default api;
