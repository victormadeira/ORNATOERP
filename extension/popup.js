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

function aplicarBrand(b) {
    if (!b) return;
    const root = document.documentElement;
    if (b.primary) {
        root.style.setProperty('--primary', b.primary);
        // hover = 20% mais escuro
        const dark = ajustarCor(b.primary, -20);
        root.style.setProperty('--primary-hover', dark);
        // topbar gradient
        const topbar = document.querySelector('.topbar');
        if (topbar) topbar.style.background = `linear-gradient(135deg, ${b.primary}, ${dark})`;
        // avatar do login/logged
        document.querySelectorAll('.avatar, .logo').forEach(el => {
            if (el.classList.contains('avatar')) el.style.background = `linear-gradient(135deg, ${b.primary}, ${b.accent || '#C9A96E'})`;
        });
    }
    if (b.accent) {
        root.style.setProperty('--accent', b.accent);
        document.querySelectorAll('.badge-role').forEach(el => el.style.background = b.accent);
    }
    // Logo na topbar
    const logoEl = document.querySelector('.topbar .logo');
    if (logoEl && b.logo) {
        logoEl.innerHTML = `<img src="${escapeAttr(b.logo)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:8px;filter:brightness(0) invert(1)" />`;
    }
    // Nome
    const brandT1 = document.querySelector('.brand .t1');
    if (brandT1 && b.nome) brandT1.textContent = b.nome;
}

function ajustarCor(hex, delta) {
    const m = String(hex).replace('#', '').match(/^([a-f0-9]{6}|[a-f0-9]{3})$/i);
    if (!m) return hex;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp(parseInt(h.slice(0,2), 16) + delta);
    const g = clamp(parseInt(h.slice(2,4), 16) + delta);
    const b = clamp(parseInt(h.slice(4,6), 16) + delta);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function escapeAttr(s) { return String(s||'').replace(/"/g, '&quot;'); }

async function carregarBrand(baseUrl) {
    if (!baseUrl) return;
    try {
        const r = await fetch(baseUrl + '/api/ext/brand', { cache: 'no-cache' });
        if (!r.ok) return;
        const b = await r.json();
        if (b.logo && !/^https?:\/\//i.test(b.logo)) {
            b.logo = baseUrl + (b.logo.startsWith('/') ? '' : '/') + b.logo;
        }
        await chrome.storage.local.set({ brand: b });
        aplicarBrand(b);
    } catch {}
}

async function load() {
    const { baseUrl = '', token = '', user = null, device = '', brand = null } = await chrome.storage.local.get(['baseUrl', 'token', 'user', 'device', 'brand']);
    baseUrlEl.value = baseUrl || 'https://gestaoornato.com';

    // Aplica branding cacheado imediatamente (sem flash)
    if (brand) aplicarBrand(brand);
    // E atualiza do servidor
    carregarBrand(baseUrl || 'https://gestaoornato.com');

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
        // Atualiza branding imediatamente após login
        carregarBrand(baseUrl);
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
