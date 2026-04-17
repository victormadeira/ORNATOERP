// ═══════════════════════════════════════════════════════
// Ornato ERP — Extension Popup
// Login direto via email+senha do ERP (não requer gerar token manual)
// ═══════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id);

const viewLogin = $('view-login');
const viewLogged = $('view-logged');

const baseUrlEl = $('baseUrl');
const emailEl = $('email');
const senhaEl = $('senha');
const btnLogin = $('btn-login');
const loginStatus = $('login-status');

const userName = $('user-name');
const userEmail = $('user-email');
const userRole = $('user-role');
const userAvatar = $('user-avatar');
const statBadge = $('stat-badge');
const statDevice = $('stat-device');
const btnLogout = $('btn-logout');
const btnOpenWa = $('btn-open-wa');
const loggedStatus = $('logged-status');

function setStatus(el, msg, cls) {
    el.textContent = msg || '';
    el.className = msg ? ('status ' + cls) : 'status';
}

function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function load() {
    const { baseUrl = '', token = '', user = null, device = '' } = await chrome.storage.local.get(['baseUrl', 'token', 'user', 'device']);
    baseUrlEl.value = baseUrl || 'https://gestaoornato.com';

    if (token && user) {
        await showLogged(user, device);
        // valida que o token ainda é válido
        try {
            const r = await fetch(baseUrl + '/api/ext/me', { headers: { 'x-ext-token': token } });
            if (!r.ok) throw new Error('invalid');
            const data = await r.json();
            await chrome.storage.local.set({ user: data.user });
            await showLogged(data.user, device);
        } catch {
            // token inválido → volta para login
            await chrome.storage.local.remove(['token', 'user', 'device']);
            showLogin();
        }
    } else {
        showLogin();
    }
}

function showLogin() {
    viewLogin.classList.remove('hide');
    viewLogged.classList.add('hide');
    setStatus(loginStatus, '', '');
    setTimeout(() => emailEl.focus(), 50);
}

async function showLogged(user, device) {
    viewLogin.classList.add('hide');
    viewLogged.classList.remove('hide');
    userName.textContent = user.nome || '—';
    userEmail.textContent = user.email || '';
    userRole.textContent = user.role || '—';
    userAvatar.textContent = initials(user.nome);
    statDevice.textContent = (device || 'Chrome').slice(0, 10);

    // Badge count
    try {
        const { baseUrl, token } = await chrome.storage.local.get(['baseUrl', 'token']);
        const r = await fetch(baseUrl + '/api/ext/badge-count', { headers: { 'x-ext-token': token } });
        if (r.ok) {
            const d = await r.json();
            statBadge.textContent = d.count ?? 0;
        }
    } catch {}
}

btnLogin.addEventListener('click', async () => {
    const baseUrl = (baseUrlEl.value || '').trim().replace(/\/+$/, '');
    const email = (emailEl.value || '').trim().toLowerCase();
    const senha = senhaEl.value || '';
    if (!baseUrl || !email || !senha) {
        setStatus(loginStatus, 'Preencha URL, email e senha.', 'err');
        return;
    }
    btnLogin.disabled = true;
    btnLogin.textContent = 'Entrando…';
    setStatus(loginStatus, '', '');
    try {
        const device_name = `Chrome · ${navigator.platform || 'desktop'}`;
        const r = await fetch(baseUrl + '/api/ext/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha, device_name }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
            setStatus(loginStatus, data.error || ('Erro HTTP ' + r.status), 'err');
            return;
        }
        await chrome.storage.local.set({
            baseUrl,
            token: data.token,
            user: data.user,
            device: data.device,
        });
        chrome.runtime.sendMessage({ type: 'updateBadge' });
        setStatus(loginStatus, '✓ Conectado como ' + data.user.nome, 'ok');
        setTimeout(() => showLogged(data.user, data.device), 400);
    } catch (e) {
        setStatus(loginStatus, 'Erro de rede: ' + e.message, 'err');
    } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Entrar';
    }
});

btnLogout.addEventListener('click', async () => {
    setStatus(loggedStatus, 'Saindo…', 'info');
    try {
        const { baseUrl, token } = await chrome.storage.local.get(['baseUrl', 'token']);
        await fetch(baseUrl + '/api/ext/logout', {
            method: 'POST',
            headers: { 'x-ext-token': token },
        });
    } catch {}
    await chrome.storage.local.remove(['token', 'user', 'device']);
    showLogin();
});

btnOpenWa.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
});

// Enter no campo senha faz login
senhaEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnLogin.click(); });
emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') senhaEl.focus(); });

load();
