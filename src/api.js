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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    opts.signal = controller.signal;

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(`${BASE}${path}`, opts);
            clearTimeout(timeoutId);
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
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') throw { error: 'Requisição expirou (timeout 30s). Verifique sua conexão.' };
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
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path),
    postBlob: (path, body) => requestBlob('POST', path, body),
    upload: uploadFile,
};

export default api;
