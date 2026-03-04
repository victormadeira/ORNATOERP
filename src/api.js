// ═══════════════════════════════════════════════════════
// API Helper — fetch com JWT automático + retry
// ═══════════════════════════════════════════════════════
const BASE = '/api';

function getToken() {
    return localStorage.getItem('erp_token');
}

async function request(method, path, body = null, retries = 1) {
    const token = getToken();
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    };
    if (body) opts.body = JSON.stringify(body);

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${BASE}${path}`, opts);
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
            lastError = err;
            // Só faz retry em erros de rede (não em 4xx/5xx)
            const isNetworkError = !err.status;
            if (!isNetworkError || attempt >= retries) throw lastError;
            // Espera antes de tentar de novo (200ms, 600ms...)
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

const api = {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path),
    postBlob: (path, body) => requestBlob('POST', path, body),
};

export default api;
