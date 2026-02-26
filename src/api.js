// ═══════════════════════════════════════════════════════
// API Helper — fetch com JWT automático
// ═══════════════════════════════════════════════════════
const BASE = '/api';

function getToken() {
    return localStorage.getItem('erp_token');
}

async function request(method, path, body = null) {
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
    const data = await res.json();
    if (!res.ok) throw { status: res.status, ...data };
    return data;
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
