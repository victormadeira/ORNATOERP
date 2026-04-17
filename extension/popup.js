const baseUrlEl = document.getElementById('baseUrl');
const tokenEl = document.getElementById('token');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

async function load() {
    const { baseUrl = '', token = '' } = await chrome.storage.local.get(['baseUrl', 'token']);
    baseUrlEl.value = baseUrl || 'https://gestaoornato.com';
    tokenEl.value = token;
}

function setStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (ok ? 'ok' : 'err');
}

saveBtn.addEventListener('click', async () => {
    const baseUrl = (baseUrlEl.value || '').trim().replace(/\/+$/, '');
    const token = (tokenEl.value || '').trim();
    if (!baseUrl || !token) {
        setStatus('Preencha URL e token.', false);
        return;
    }
    await chrome.storage.local.set({ baseUrl, token });
    setStatus('Testando conexão…', true);
    try {
        const r = await fetch(baseUrl + '/api/ext/me', {
            headers: { 'x-ext-token': token },
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.user) {
            setStatus('✓ Conectado como ' + (data.user.nome || data.user.email), true);
            chrome.runtime.sendMessage({ type: 'updateBadge' });
        } else {
            setStatus('Erro: ' + (data.error || 'HTTP ' + r.status), false);
        }
    } catch (e) {
        setStatus('Erro de rede: ' + e.message, false);
    }
});

load();
