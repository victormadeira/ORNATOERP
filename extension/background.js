// ═══════════════════════════════════════════════════════
// Ornato ERP Extension — Service Worker
// Faz chamadas ao ERP (evita CORS em content script)
// ═══════════════════════════════════════════════════════

async function getConfig() {
    const { baseUrl, token } = await chrome.storage.local.get(['baseUrl', 'token']);
    return { baseUrl: (baseUrl || '').replace(/\/+$/, ''), token: token || '' };
}

async function apiCall({ method = 'GET', path, body }) {
    const { baseUrl, token } = await getConfig();
    if (!baseUrl) return { ok: false, error: 'Configure a URL do ERP no popup da extensão.', needsLogin: true };
    if (!token) return { ok: false, error: 'Faça login no popup da extensão.', needsLogin: true };
    try {
        const r = await fetch(baseUrl + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-ext-token': token,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const text = await r.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch {}
        if (!r.ok) {
            // token inválido/revogado → limpa e pede login
            if (r.status === 401) {
                await chrome.storage.local.remove(['token', 'user', 'device']);
                return { ok: false, status: 401, error: 'Sessão expirada — faça login novamente.', needsLogin: true };
            }
            return { ok: false, status: r.status, error: (data && data.error) || `HTTP ${r.status}` };
        }
        return { ok: true, data };
    } catch (e) {
        return { ok: false, error: 'Rede: ' + e.message };
    }
}

async function updateBadge() {
    const r = await apiCall({ path: '/api/ext/badge-count' }).catch(() => null);
    if (!r || !r.ok || !r.data) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }
    const n = Number(r.data.count || 0);
    chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
}

// Roteador de mensagens do content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        if (msg?.type === 'api') {
            const r = await apiCall({ method: msg.method, path: msg.path, body: msg.body });
            sendResponse(r);
        } else if (msg?.type === 'getConfig') {
            const cfg = await getConfig();
            sendResponse({ ok: true, data: { baseUrl: cfg.baseUrl, tokenSet: !!cfg.token } });
        } else if (msg?.type === 'updateBadge') {
            await updateBadge();
            sendResponse({ ok: true });
        }
    })();
    return true; // resposta assíncrona
});

// Atualiza badge ao iniciar
chrome.runtime.onInstalled.addListener(() => { updateBadge(); });
chrome.runtime.onStartup.addListener(() => { updateBadge(); });
// Poll periódico (a cada 2 min)
setInterval(updateBadge, 2 * 60 * 1000);
