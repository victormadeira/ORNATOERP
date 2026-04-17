// ═══════════════════════════════════════════════════════
// Ornato ERP Extension — Content Script (web.whatsapp.com)
// v0.3.0 — UI redesign + detecção robusta + polish
// ═══════════════════════════════════════════════════════

(function () {
    if (window.__ornato_sidebar_loaded) return;
    window.__ornato_sidebar_loaded = true;

    const api = (method, path, body) =>
        new Promise((resolve) => chrome.runtime.sendMessage({ type: 'api', method, path, body }, resolve));

    // ─── Storage helpers (estado persistente) ───
    const storage = {
        get: (keys) => new Promise((r) => chrome.storage.local.get(keys, r)),
        set: (obj) => new Promise((r) => chrome.storage.local.set(obj, r)),
    };

    // ─── Ícones SVG (Lucide-style) ───
    const icons = {
        user: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        dollar: '<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        bot: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
        template: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
        inbox: '<svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
        close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        external: '<svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
        refresh: '<svg viewBox="0 0 24 24" style="width:14px;height:14px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    };

    // ═══════════════════════════════════════════════════════
    // FAB + Sidebar DOM
    // ═══════════════════════════════════════════════════════
    const fab = document.createElement('button');
    fab.id = 'ornato-fab';
    fab.title = 'Ornato ERP (Ctrl+Shift+O)';
    fab.innerHTML = 'ORN<span class="orn-fab-badge hide" id="orn-fab-badge">0</span>';
    document.body.appendChild(fab);

    const sidebar = document.createElement('div');
    sidebar.id = 'ornato-sidebar';
    sidebar.className = 'ornato-collapsed';
    sidebar.innerHTML = `
        <div class="ornato-resizer" title="Arraste para redimensionar"></div>
        <div class="ornato-header">
            <div class="ornato-brand">
                <div class="ornato-logo">OR</div>
                <div class="ornato-title">
                    <div class="t1">Ornato ERP <span id="orn-user-tag" style="font-weight:400;color:var(--orn-text-dim);font-size:10px;margin-left:4px"></span></div>
                    <div class="t2" id="orn-subtitle">Aguardando conversa…</div>
                </div>
            </div>
            <button class="ornato-iconbtn" id="orn-btn-refresh" title="Atualizar">${icons.refresh}</button>
            <button class="ornato-close" title="Fechar (Esc)">${icons.close}</button>
        </div>
        <div class="ornato-statusbar">
            <span class="ornato-dot off" id="orn-dot"></span>
            <span id="orn-status">Nenhuma conversa selecionada</span>
        </div>
        <div class="ornato-tabs">
            <button class="ornato-tab active" data-tab="cliente">${icons.user}<span class="ornato-tab-label">Cliente</span></button>
            <button class="ornato-tab" data-tab="orcamentos">${icons.dollar}<span class="ornato-tab-label">Orçamentos</span></button>
            <button class="ornato-tab" data-tab="sofia">${icons.bot}<span class="ornato-tab-label">Sofia</span></button>
            <button class="ornato-tab" data-tab="templates">${icons.template}<span class="ornato-tab-label">Templates</span></button>
        </div>
        <div class="ornato-body"></div>
    `;
    document.body.appendChild(sidebar);

    const body = sidebar.querySelector('.ornato-body');
    const closeBtn = sidebar.querySelector('.ornato-close');
    const refreshBtn = sidebar.querySelector('#orn-btn-refresh');
    const tabs = sidebar.querySelectorAll('.ornato-tab');
    const subtitleEl = sidebar.querySelector('#orn-subtitle');
    const statusEl = sidebar.querySelector('#orn-status');
    const dotEl = sidebar.querySelector('#orn-dot');
    const userTagEl = sidebar.querySelector('#orn-user-tag');
    const resizer = sidebar.querySelector('.ornato-resizer');
    const getFabBadge = () => fab.querySelector('#orn-fab-badge');

    // ═══════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════
    let currentTab = 'cliente';
    let currentPhone = null;
    let currentName = null;
    let currentData = null;
    let baseUrl = '';
    let currentUser = null;

    // ─── Carrega estado salvo ───
    (async () => {
        const s = await storage.get(['sidebarOpen', 'sidebarWidth', 'lastTab', 'baseUrl', 'user', 'brand']);
        baseUrl = (s.baseUrl || '').replace(/\/+$/, '');
        currentUser = s.user || null;
        if (currentUser) userTagEl.textContent = '· ' + (currentUser.nome || currentUser.email || '');
        if (s.sidebarWidth && Number(s.sidebarWidth) >= 320) {
            sidebar.style.width = s.sidebarWidth + 'px';
        }
        if (s.lastTab && ['cliente', 'orcamentos', 'sofia', 'templates'].includes(s.lastTab)) {
            currentTab = s.lastTab;
            tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
        }
        // Aplica branding cacheado imediatamente pra evitar flash
        if (s.brand) aplicarBrand(s.brand);
        if (s.sidebarOpen) openSidebar(false);

        // Atualiza branding do servidor (cache-bust)
        atualizarBrand();
    })();

    // ═══════════════════════════════════════════════════════
    // BRANDING DINÂMICO — cores + logo do ERP
    // ═══════════════════════════════════════════════════════
    function aplicarBrand(b) {
        if (!b) return;
        const root = sidebar;
        if (b.primary) {
            root.style.setProperty('--orn-primary', b.primary);
            root.style.setProperty('--orn-primary-hover', ajustarCor(b.primary, -20));
        }
        if (b.accent) {
            root.style.setProperty('--orn-accent', b.accent);
            root.style.setProperty('--orn-accent-dark', ajustarCor(b.accent, -20));
        }
        // FAB usa só a cor primária — mantém texto "ORN" pra não distorcer logo em 44px
        if (b.primary) {
            fab.style.background = `linear-gradient(135deg, ${b.primary}, ${ajustarCor(b.primary, -20)})`;
        }
        // Logo no header da sidebar (onde tem espaço suficiente)
        const logoEl = sidebar.querySelector('.ornato-logo');
        if (b.logo && logoEl) {
            logoEl.innerHTML = `<img src="${escapeAttr(b.logo)}" alt="${escapeAttr(b.nome || '')}" style="max-width:100%;max-height:100%;object-fit:contain" />`;
            logoEl.style.background = '#fff';
            logoEl.style.padding = '4px';
        } else if (logoEl) {
            // fallback: iniciais do nome
            const init = avatarInitials(b.nome || 'OR');
            logoEl.textContent = init.slice(0, 2);
        }
        // Nome
        const t1 = sidebar.querySelector('.ornato-title .t1');
        if (t1 && b.nome) {
            // preserva o span do user-tag
            const tag = sidebar.querySelector('#orn-user-tag');
            t1.textContent = b.nome + ' ';
            if (tag) t1.appendChild(tag);
        }
    }

    async function atualizarBrand() {
        if (!baseUrl) return;
        try {
            const r = await fetch(baseUrl + '/api/ext/brand', { cache: 'no-cache' });
            if (!r.ok) return;
            const brand = await r.json();
            // URL absoluta do logo (aceita caminho relativo ou absoluto)
            if (brand.logo && !/^https?:\/\//i.test(brand.logo)) {
                brand.logo = baseUrl + (brand.logo.startsWith('/') ? '' : '/') + brand.logo;
            }
            await storage.set({ brand });
            aplicarBrand(brand);
        } catch {}
    }

    // Ajusta brilho de cor HEX (+/- pontos, -100..100)
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

    function escapeAttr(s) { return String(s||'').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function openSidebar(save = true) {
        sidebar.classList.remove('ornato-collapsed');
        fab.classList.add('hidden');
        if (save) storage.set({ sidebarOpen: true });
    }
    function closeSidebar(save = true) {
        sidebar.classList.add('ornato-collapsed');
        fab.classList.remove('hidden');
        if (save) storage.set({ sidebarOpen: false });
    }
    fab.addEventListener('click', () => { openSidebar(); setTimeout(() => onDOMChange(), 50); });
    closeBtn.addEventListener('click', () => closeSidebar());
    refreshBtn.addEventListener('click', () => {
        if (currentPhone) carregar(currentPhone);
        else { tentouDrawerPara = null; onDOMChange(); }
    });

    tabs.forEach((t) => t.addEventListener('click', () => {
        currentTab = t.dataset.tab;
        tabs.forEach((x) => x.classList.toggle('active', x === t));
        storage.set({ lastTab: currentTab });
        render();
    }));

    // ─── Atalho teclado Ctrl+Shift+O ───
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
            e.preventDefault();
            if (sidebar.classList.contains('ornato-collapsed')) openSidebar();
            else closeSidebar();
        }
        // Esc fecha sidebar se não for digitando
        if (e.key === 'Escape' && !sidebar.classList.contains('ornato-collapsed')) {
            const active = document.activeElement;
            const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
            if (!isInput || sidebar.contains(active)) {
                closeSidebar();
            }
        }
    });

    // ─── Resize handle ───
    let resizing = false;
    resizer.addEventListener('mousedown', (e) => {
        resizing = true;
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        const w = Math.max(320, Math.min(640, window.innerWidth - e.clientX));
        sidebar.style.width = w + 'px';
    });
    document.addEventListener('mouseup', () => {
        if (!resizing) return;
        resizing = false;
        document.body.style.userSelect = '';
        const w = parseInt(sidebar.style.width);
        if (w) storage.set({ sidebarWidth: w });
    });

    // ═══════════════════════════════════════════════════════
    // DETECÇÃO ROBUSTA DE CHAT ATIVO
    // ═══════════════════════════════════════════════════════
    function digits(s) { return String(s || '').replace(/\D/g, ''); }

    function mainHeader() {
        return document.querySelector('#main header')
            || document.querySelector('div[data-testid="conversation-header"]')
            || document.querySelector('[data-testid="conversation-info-header"]');
    }

    function drawerPanel() {
        return document.querySelector('div[data-testid="drawer-right"]')
            || document.querySelector('span[data-testid="drawer-right-title"]')?.closest('div[role="region"]')
            || document.querySelector('section[data-testid="contact-info-drawer"]')
            || document.querySelector('#app div[role="region"][tabindex="-1"]')
            || null;
    }

    function buscarTelefoneEm(texto) {
        if (!texto) return null;
        // Padrões comuns: +55 11 99999-9999, +551199999999, etc.
        // Também aceita BR local sem DDI: (11) 99999-9999
        const patterns = [
            /\+\d{1,3}[\s.]?\(?\d{2,4}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,5}/g, // com +DDI
            /\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g,                   // BR local
            /\+?\d[\d\s\-().]{9,}/g,                                      // genérico
        ];
        for (const p of patterns) {
            const matches = texto.match(p);
            if (!matches) continue;
            for (const m of matches) {
                const d = digits(m);
                if (d.length >= 10 && d.length <= 15) return d;
            }
        }
        return null;
    }

    function extrairTelefoneAtivo() {
        // 1) Header do chat — varre TODOS os spans/divs com title ou aria-label
        const header = mainHeader();
        if (header) {
            // Primeiro tenta atributos title/aria-label diretamente
            const attrs = header.querySelectorAll('[title], [aria-label]');
            for (const el of attrs) {
                const t = (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '');
                const p = buscarTelefoneEm(t);
                if (p) return p;
            }
            // Depois o texto puro do header (alguns layouts mostram o número ali)
            const p = buscarTelefoneEm(header.innerText || header.textContent || '');
            if (p) return p;
        }

        // 2) Drawer (dados do contato) — se estiver aberto, tem o telefone
        const drawer = drawerPanel();
        if (drawer) {
            const attrs = drawer.querySelectorAll('[title], [aria-label]');
            for (const el of attrs) {
                const t = (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '');
                const p = buscarTelefoneEm(t);
                if (p) return p;
            }
            const p = buscarTelefoneEm(drawer.innerText || drawer.textContent || '');
            if (p) return p;
        }

        // 3) Chat list — item selecionado
        const selected = document.querySelector('#pane-side [aria-selected="true"], #pane-side [tabindex="-1"][aria-selected="true"], div[data-testid="cell-frame-container"][tabindex="-1"]');
        if (selected) {
            const attrs = selected.querySelectorAll('[title], [aria-label]');
            for (const el of attrs) {
                const t = (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '');
                const p = buscarTelefoneEm(t);
                if (p) return p;
            }
            const p = buscarTelefoneEm(selected.textContent || '');
            if (p) return p;
        }

        // 4) URL hash (alguns bridges expõem)
        const urlM = location.hash.match(/(\d{10,15})/);
        if (urlM) return urlM[1];

        // 5) Última tentativa: buscar no #main inteiro
        const main = document.querySelector('#main');
        if (main) {
            const attrs = main.querySelectorAll('header [title], header [aria-label]');
            for (const el of attrs) {
                const t = (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '');
                const p = buscarTelefoneEm(t);
                if (p) return p;
            }
        }

        return null;
    }

    function extrairNomeAtivo() {
        const header = mainHeader();
        if (!header) return '';
        // Procura spans com title que NÃO são telefone (ou seja, é o nome)
        const spans = header.querySelectorAll('span[title], span[dir="auto"]');
        for (const el of spans) {
            const t = (el.getAttribute('title') || el.textContent || '').trim();
            if (!t) continue;
            // Se for um telefone puro, ignora — queremos o nome
            const d = digits(t);
            if (d.length >= 10 && /^\+?[\d\s\-().+]+$/.test(t)) continue;
            return t;
        }
        return '';
    }

    function temConversaAberta() {
        return !!mainHeader();
    }

    // ─── Tenta abrir o drawer do contato para extrair telefone ───
    async function abrirDrawerParaDetectar() {
        const header = mainHeader();
        if (!header) return null;
        // Se drawer já está aberto, só extrai
        if (drawerPanel()) {
            const t = extrairTelefoneAtivo();
            if (t) return t;
        }

        // Estratégias de clique (ordem de preferência):
        // 1) Clique direto no nome (span[title] principal)
        // 2) Botão "Dados do contato" no header
        // 3) Próprio header
        const clickTargets = [
            header.querySelector('span[title]'),
            header.querySelector('div[role="button"][title]'),
            header.querySelector('[aria-label*="fil" i]'), // "Perfil"
            header.querySelector('[aria-label*="prof" i]'),
            header.querySelector('[data-testid="conversation-info-header"]'),
            header.querySelector('[role="button"]'),
            header,
        ].filter(Boolean);

        let opened = false;
        for (const target of clickTargets) {
            try {
                // dispara mouse events realistas
                const rect = target.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                ['mousedown', 'mouseup', 'click'].forEach(type => {
                    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
                });
            } catch {}
            // Aguarda drawer abrir (até 1.5s)
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 100));
                if (drawerPanel()) { opened = true; break; }
            }
            if (opened) break;
        }

        if (!opened) return null;
        await new Promise(r => setTimeout(r, 300)); // deixa renderizar completo
        const tel = extrairTelefoneAtivo();
        // Fecha drawer com botão X
        const panel = drawerPanel();
        const closeBtn = panel?.querySelector('button[aria-label*="Fechar" i], button[aria-label*="Close" i], div[role="button"][aria-label*="Fechar" i], [data-testid="x"]')
            || panel?.querySelector('header button')
            || panel?.querySelector('[role="button"]');
        try { closeBtn?.click(); } catch {}
        return tel;
    }

    // ═══════════════════════════════════════════════════════
    // CARREGAMENTO DE DADOS
    // ═══════════════════════════════════════════════════════
    async function carregar(tel) {
        renderLoading();
        const r = await api('GET', `/api/ext/cliente-por-tel/${encodeURIComponent(tel)}`);
        if (!r.ok) {
            const needsLogin = r.needsLogin || r.status === 401;
            body.innerHTML = `
                <div class="ornato-error">
                    <strong>${needsLogin ? 'Não autenticado' : 'Erro ao consultar ERP'}</strong><br>
                    ${escapeHtml(r.error || 'Falha de conexão')}
                </div>
                <div style="margin-top:12px;font-size:12px;color:var(--orn-text-soft);text-align:center">
                    ${needsLogin ? 'Clique no ícone da extensão na barra do Chrome e faça login.' : 'Verifique sua conexão e tente novamente.'}
                </div>`;
            dotEl.className = 'ornato-dot off';
            statusEl.textContent = needsLogin ? 'Login necessário' : 'Erro de conexão';
            return;
        }
        currentData = { cliente: r.data.cliente, conversa: r.data.conversa, orcamentos: [], sofia: null };

        if (currentData.cliente) {
            api('GET', `/api/ext/orcamentos-por-cliente/${currentData.cliente.id}`).then((rr) => {
                if (rr.ok) { currentData.orcamentos = rr.data || []; if (currentTab === 'orcamentos') render(); }
            });
        }
        if (currentData.conversa) {
            api('GET', `/api/ext/sofia-status/${currentData.conversa.id}`).then((rr) => {
                if (rr.ok) { currentData.sofia = rr.data; if (currentTab === 'sofia') render(); }
            });
        }

        dotEl.className = 'ornato-dot on';
        if (currentData.cliente) {
            statusEl.textContent = `✓ ${currentData.cliente.nome}`;
        } else {
            statusEl.textContent = `Contato: ${currentName || '+' + tel}`;
        }
        subtitleEl.textContent = currentName || '+' + tel;

        render();
        updateFabBadge();
    }

    async function updateFabBadge() {
        try {
            const r = await api('GET', '/api/ext/badge-count');
            if (r.ok && r.data) {
                const n = Number(r.data.count || 0);
                const badge = getFabBadge();
                if (badge) {
                    if (n > 0) { badge.textContent = n; badge.classList.remove('hide'); }
                    else badge.classList.add('hide');
                }
            }
        } catch {}
    }

    // ═══════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════
    function renderLoading() {
        body.innerHTML = `
            <div class="ornato-card">
                <div class="ornato-skeleton lg" style="width:60%"></div>
                <div class="ornato-skeleton"></div>
                <div class="ornato-skeleton" style="width:80%"></div>
                <div class="ornato-skeleton sm"></div>
            </div>
            <div class="ornato-card">
                <div class="ornato-skeleton lg"></div>
                <div class="ornato-skeleton sm"></div>
            </div>`;
    }

    function emptyState(strong, text) {
        return `
            <div class="ornato-empty">
                <div class="icon">${icons.inbox}</div>
                <strong>${escapeHtml(strong)}</strong>
                ${escapeHtml(text)}
            </div>`;
    }

    function render() {
        if (!currentPhone) {
            // Se temos nome mas não telefone, mostra UI de fallback (detectar/inserir manual)
            if (currentName && temConversaAberta()) {
                body.innerHTML = `
                    <div class="ornato-card ornato-client-head">
                        <div class="ornato-avatar">${escapeHtml(avatarInitials(currentName))}</div>
                        <div class="ornato-client-info">
                            <div class="name">${escapeHtml(currentName)}</div>
                            <div class="phone">Número ainda não detectado</div>
                        </div>
                    </div>
                    <div class="ornato-card">
                        <div class="ornato-card-title">Detectar telefone</div>
                        <div style="font-size:12px;color:var(--orn-text-soft);margin-bottom:10px;line-height:1.5">
                            O WhatsApp esconde o número no header. Clique abaixo para abrir os dados do contato e detectar automaticamente, ou digite manualmente.
                        </div>
                        <button class="ornato-btn block" id="orn-btn-detect">🔍 Detectar pelo painel de contato</button>
                        <div class="ornato-label" style="margin-top:14px">Ou digite o telefone (com DDD)</div>
                        <div style="display:flex;gap:6px">
                            <input id="orn-man-tel" class="ornato-input" placeholder="11999999999" autocomplete="off" style="flex:1" />
                            <button class="ornato-btn accent" id="orn-btn-man">Buscar</button>
                        </div>
                    </div>`;
                document.getElementById('orn-btn-detect')?.addEventListener('click', async () => {
                    const btn = document.getElementById('orn-btn-detect');
                    btn.disabled = true; btn.textContent = 'Detectando…';
                    const tel = await abrirDrawerParaDetectar();
                    if (tel) {
                        currentPhone = tel;
                        currentData = null;
                        subtitleEl.textContent = currentName + ' · +' + tel;
                        statusEl.textContent = 'Carregando dados…';
                        carregar(tel);
                    } else {
                        btn.disabled = false; btn.textContent = '🔍 Tentar novamente';
                        const msg = document.createElement('div');
                        msg.style.cssText = 'font-size:11px;color:var(--orn-danger);margin-top:6px;text-align:center';
                        msg.textContent = 'Não foi possível detectar. Clique no nome do contato no topo do chat e tente de novo, ou use entrada manual.';
                        btn.parentNode.insertBefore(msg, btn.nextSibling);
                    }
                });
                const manInput = document.getElementById('orn-man-tel');
                const manBtn = document.getElementById('orn-btn-man');
                const manGo = () => {
                    const v = digits(manInput.value);
                    if (v.length < 10) { manInput.style.borderColor = 'var(--orn-danger)'; return; }
                    currentPhone = v;
                    currentData = null;
                    subtitleEl.textContent = currentName + ' · +' + v;
                    statusEl.textContent = 'Carregando dados…';
                    carregar(v);
                };
                manBtn?.addEventListener('click', manGo);
                manInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') manGo(); });
                return;
            }
            body.innerHTML = emptyState('Nenhuma conversa aberta', 'Selecione uma conversa no WhatsApp para ver os dados do ERP.');
            return;
        }
        if (!currentData) { renderLoading(); return; }
        if (currentTab === 'cliente') renderCliente();
        else if (currentTab === 'orcamentos') renderOrcamentos();
        else if (currentTab === 'sofia') renderSofia();
        else if (currentTab === 'templates') renderTemplates();
    }

    function erpLink(path) {
        if (!baseUrl) return '#';
        return baseUrl + path;
    }

    function openErp(path) {
        if (!baseUrl) return;
        window.open(baseUrl + path, '_blank', 'noopener');
    }

    function avatarInitials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function renderCliente() {
        const c = currentData.cliente;
        const nomeBase = c?.nome || currentName || '?';
        const avatar = avatarInitials(nomeBase);
        if (!c) {
            body.innerHTML = `
                <div class="ornato-card ornato-client-head">
                    <div class="ornato-avatar">${escapeHtml(avatar)}</div>
                    <div class="ornato-client-info">
                        <div class="name">${escapeHtml(currentName || '—')}</div>
                        <div class="phone">+${escapeHtml(currentPhone || '—')}</div>
                    </div>
                </div>
                ${emptyState('Não cadastrado no ERP', 'Este contato ainda não existe como cliente. Cadastre no ERP para enriquecer a conversa.')}
                <button class="ornato-btn accent block" id="orn-btn-novo-cli">+ Cadastrar no ERP</button>`;
            document.getElementById('orn-btn-novo-cli')?.addEventListener('click', () => {
                const q = new URLSearchParams({ tel: currentPhone || '', nome: currentName || '' });
                openErp('/cli?novo=1&' + q.toString());
            });
            return;
        }
        body.innerHTML = `
            <div class="ornato-card ornato-client-head">
                <div class="ornato-avatar">${escapeHtml(avatar)}</div>
                <div class="ornato-client-info">
                    <div class="name">${escapeHtml(c.nome || '—')}</div>
                    <div class="phone">${escapeHtml(c.tel || '+' + currentPhone)}</div>
                </div>
            </div>
            <div class="ornato-card">
                <div class="ornato-card-title">Dados do cliente</div>
                ${c.email ? `<div class="ornato-label">Email</div><div class="ornato-value">${escapeHtml(c.email)}</div>` : ''}
                ${c.cidade ? `<div class="ornato-label">Localidade</div><div class="ornato-value">${escapeHtml(c.cidade)}${c.estado ? '/' + escapeHtml(c.estado) : ''}${c.bairro ? ' · ' + escapeHtml(c.bairro) : ''}</div>` : ''}
                ${c.endereco ? `<div class="ornato-label">Endereço</div><div class="ornato-value">${escapeHtml(c.endereco)}${c.numero ? ', ' + escapeHtml(c.numero) : ''}</div>` : ''}
                ${c.cpf ? `<div class="ornato-label">CPF</div><div class="ornato-value">${escapeHtml(c.cpf)}</div>` : ''}
                ${c.cnpj ? `<div class="ornato-label">CNPJ</div><div class="ornato-value">${escapeHtml(c.cnpj)}</div>` : ''}
                ${c.obs ? `<div class="ornato-label">Observações</div><div class="ornato-value">${escapeHtml(c.obs)}</div>` : ''}
                <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
                    <button class="ornato-btn" id="orn-btn-abrir-cli">Abrir no ERP ${icons.external}</button>
                    <button class="ornato-btn secondary" id="orn-btn-novo-orc">+ Novo orçamento</button>
                </div>
            </div>`;
        document.getElementById('orn-btn-abrir-cli')?.addEventListener('click', () => openErp(`/cli?id=${c.id}`));
        document.getElementById('orn-btn-novo-orc')?.addEventListener('click', () => openErp(`/orcs?novo=1&cliente_id=${c.id}`));
    }

    function fmtBRL(v) {
        return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function renderOrcamentos() {
        const list = currentData.orcamentos || [];
        if (!currentData.cliente) {
            body.innerHTML = emptyState('Sem cliente vinculado', 'Cadastre o contato como cliente no ERP para ver orçamentos.');
            return;
        }
        const header = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div style="font-size:11px;color:var(--orn-text-dim);text-transform:uppercase;font-weight:700;letter-spacing:0.5px">
                    ${list.length} orçamento${list.length === 1 ? '' : 's'}
                </div>
                <button class="ornato-btn" id="orn-btn-novo-orc2" style="padding:6px 10px;font-size:11px;margin:0">+ Novo</button>
            </div>`;
        if (list.length === 0) {
            body.innerHTML = header + emptyState('Sem orçamentos', 'Este cliente ainda não possui orçamentos.');
        } else {
            body.innerHTML = header + list.map((o) => `
                <div class="ornato-orc" data-id="${o.id}">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                        <div class="ornato-orc-num">#${escapeHtml(o.numero || o.id)}</div>
                        <div class="ornato-orc-val">${fmtBRL(o.valor_total)}</div>
                    </div>
                    <div class="ornato-orc-title">${escapeHtml(o.titulo || 'Sem título')}</div>
                    <div class="ornato-orc-meta">
                        ${escapeHtml(o.status_proposta || o.status || '—')}
                        ${o.criado_em ? ' · ' + new Date(o.criado_em).toLocaleDateString('pt-BR') : ''}
                    </div>
                </div>
            `).join('');
            body.querySelectorAll('.ornato-orc').forEach(el => {
                el.addEventListener('click', () => openErp(`/orcs?id=${el.dataset.id}`));
            });
        }
        document.getElementById('orn-btn-novo-orc2')?.addEventListener('click', () => openErp(`/orcs?novo=1&cliente_id=${currentData.cliente.id}`));
    }

    function renderSofia() {
        const s = currentData.sofia;
        if (!s) {
            body.innerHTML = emptyState('Sem conversa da Sofia', 'Esta conversa não está registrada no sistema da IA Sofia.');
            return;
        }
        const tempClass = { muito_quente: 'hot', quente: 'warm', morno: 'cool', frio: 'cold' }[s.temperatura] || 'cold';
        const tempLabel = { muito_quente: '🔥 Muito quente', quente: '🌡 Quente', morno: '💧 Morno', frio: '❄️ Frio' }[s.temperatura] || s.temperatura;

        const escalNivel = Number(s.escalacao_nivel || 0);
        const escalLabels = ['', 'N1 alerta', 'N2 holding', 'N3 retomada', 'N4 abandonada'];

        body.innerHTML = `
            <div class="ornato-card">
                <div class="ornato-card-title">Qualificação do lead</div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    <span class="ornato-chip ${tempClass}">${tempLabel}</span>
                </div>
                <div class="ornato-score-wrap">
                    <div class="ornato-score-bar"><div class="ornato-score-fill" style="width:${Math.min(100, s.lead_score)}%"></div></div>
                    <div class="ornato-score-num">${s.lead_score}%</div>
                </div>
                <div style="font-size:11px;color:var(--orn-text-soft)">${escapeHtml(s.lead_qualificacao || 'Sem qualificação ainda')}</div>
            </div>

            <div class="ornato-card">
                <div class="ornato-card-title">Estado da conversa</div>
                <div style="margin-bottom:10px">
                    ${s.status === 'humano' ? '<span class="ornato-chip">👤 Humano</span>' : '<span class="ornato-chip ok">🤖 IA ativa</span>'}
                    ${s.ia_bloqueada ? '<span class="ornato-chip hot">🚫 IA pausada</span>' : ''}
                    ${s.aguardando_cliente ? '<span class="ornato-chip warm">⏳ Aguardando</span>' : ''}
                    ${escalNivel > 0 ? `<span class="ornato-chip ${escalNivel >= 3 ? 'hot' : 'warm'}">⚡ ${escalLabels[escalNivel]}</span>` : ''}
                    ${s.abandonada ? '<span class="ornato-chip hot">💤 Abandonada</span>' : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                    <button class="ornato-btn secondary" id="orn-btn-pausar">${s.ia_bloqueada ? '▶ Retomar IA' : '⏸ Pausar IA 24h'}</button>
                    ${s.status === 'humano' ? `<button class="ornato-btn secondary" id="orn-btn-aguardar">${s.aguardando_cliente ? '↻ Reativar' : '⏳ Aguardar cliente'}</button>` : ''}
                    <button class="ornato-btn secondary" id="orn-btn-abrir-sofia">Abrir chat ${icons.external}</button>
                </div>
            </div>

            <div class="ornato-card">
                <div class="ornato-card-title">Dossiê Sofia</div>
                ${renderDossie(s.dossie || {})}
            </div>

            <div class="ornato-card">
                <div class="ornato-card-title">Importar histórico</div>
                <div style="font-size:11px;color:var(--orn-text-soft);margin-bottom:10px;line-height:1.5">
                    Traz para o ERP as mensagens visíveis desta conversa — útil para sincronizar histórico antigo.
                </div>
                <button class="ornato-btn accent block" id="orn-btn-import">⬆ Importar mensagens visíveis</button>
                <div id="orn-import-result" style="margin-top:8px;font-size:11px;text-align:center"></div>
            </div>
        `;

        document.getElementById('orn-btn-pausar')?.addEventListener('click', async () => {
            await api('PUT', `/api/ext/pausar-ia/${s.conversa_id}`, {
                bloqueada: !s.ia_bloqueada, minutos: 60 * 24, motivo: 'manual_ext',
            });
            carregar(currentPhone);
        });
        document.getElementById('orn-btn-aguardar')?.addEventListener('click', async () => {
            await api('PUT', `/api/ext/aguardando-cliente/${s.conversa_id}`, { aguardando: !s.aguardando_cliente });
            carregar(currentPhone);
        });
        document.getElementById('orn-btn-abrir-sofia')?.addEventListener('click', () => openErp(`/msg?conversa=${s.conversa_id}`));
        document.getElementById('orn-btn-import')?.addEventListener('click', async () => {
            const resultEl = document.getElementById('orn-import-result');
            resultEl.textContent = 'Extraindo mensagens…';
            const msgs = extrairMensagensVisiveis();
            if (msgs.length === 0) {
                resultEl.innerHTML = '<span style="color:var(--orn-danger)">Nenhuma mensagem visível. Role a conversa pra cima primeiro.</span>';
                return;
            }
            resultEl.textContent = `Enviando ${msgs.length} mensagens…`;
            const r = await api('POST', '/api/ext/import-batch', {
                telefone: currentPhone, nome: currentName, mensagens: msgs,
            });
            if (r.ok) {
                resultEl.innerHTML = `<span style="color:var(--orn-success)">✓ ${r.data.inseridas} novas · ${r.data.duplicadas} já existiam</span>`;
            } else {
                resultEl.innerHTML = `<span style="color:var(--orn-danger)">Erro: ${escapeHtml(r.error || '?')}</span>`;
            }
        });
    }

    function renderDossie(d) {
        const campos = [
            ['Nome', d.nome],
            ['Cidade', d.cidade],
            ['Bairro', d.bairro],
            ['Ambientes', Array.isArray(d.ambientes) ? d.ambientes.join(', ') : d.ambientes],
            ['Tem projeto', d.tem_projeto_arquiteto === true ? 'Sim' : d.tem_projeto_arquiteto === false ? 'Não' : null],
            ['Decisor', d.decisor],
            ['Origem', d.origem_lead],
            ['Intenção', d.intencao_score ? d.intencao_score + '/30' : null],
            ['Próx. passo', d.proximo_passo_sugerido],
        ].filter(([, v]) => v !== null && v !== undefined && v !== '');
        if (campos.length === 0) return '<div style="font-size:12px;color:var(--orn-text-dim);text-align:center;padding:8px">Dossiê ainda vazio</div>';
        return campos.map(([k, v]) =>
            `<div class="ornato-dossie-item"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(String(v))}</span></div>`
        ).join('');
    }

    // ═══════════════════════════════════════════════════════
    // TEMPLATES
    // ═══════════════════════════════════════════════════════
    let templatesCache = null;

    async function loadTemplates() {
        const r = await api('GET', '/api/ext/templates');
        templatesCache = r.ok ? (r.data || []) : [];
    }

    function renderTemplates() {
        if (!templatesCache) {
            renderLoading();
            loadTemplates().then(render);
            return;
        }
        if (templatesCache.length === 0) {
            body.innerHTML = emptyState('Sem templates', 'Cadastre templates em ERP → Configurações → Templates.');
            return;
        }
        const nome = (currentData?.cliente?.nome || currentName || '').split(/\s+/)[0] || '';
        body.innerHTML = `
            <input id="orn-tpl-search" class="ornato-input" placeholder="Buscar ou digitar /atalho…" style="margin-bottom:12px" autocomplete="off" />
            <div style="font-size:10px;color:var(--orn-text-dim);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">
                💡 Dica: no chat do WhatsApp, digite <strong style="color:var(--orn-primary)">/atalho</strong> e pressione Tab para auto-inserir
            </div>
            <div id="orn-tpl-list"></div>
        `;
        const render2 = (q) => {
            const ql = (q || '').toLowerCase().trim();
            const atalhoMode = ql.startsWith('/');
            const needle = atalhoMode ? ql.slice(1) : ql;
            const list = templatesCache.filter(t => {
                if (!needle) return true;
                if (atalhoMode) return (t.atalho || '').toLowerCase().includes(needle);
                return (t.titulo + ' ' + t.conteudo + ' ' + (t.atalho || '')).toLowerCase().includes(needle);
            });
            const container = document.getElementById('orn-tpl-list');
            if (!container) return;
            if (list.length === 0) { container.innerHTML = emptyState('Nada encontrado', 'Tente outra busca ou /atalho.'); return; }
            container.innerHTML = list.map(t => {
                const preview = t.conteudo.replace(/\{nome\}/g, nome || '{nome}');
                return `
                <div class="ornato-orc" data-id="${t.id}">
                    <div class="ornato-orc-num">${escapeHtml(t.titulo)} ${t.atalho ? '· /' + escapeHtml(t.atalho) : ''}</div>
                    <div style="font-size:12px;color:var(--orn-text);margin-top:6px;white-space:pre-wrap;line-height:1.4">${escapeHtml(preview)}</div>
                    <div style="margin-top:10px;display:flex;gap:6px">
                        <button class="ornato-btn" data-action="insert" data-id="${t.id}">📥 Inserir</button>
                        <button class="ornato-btn secondary" data-action="copy" data-id="${t.id}">📋 Copiar</button>
                    </div>
                </div>`;
            }).join('');
            container.querySelectorAll('button[data-action]').forEach(btn => {
                btn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    const t = templatesCache.find(x => String(x.id) === String(id));
                    if (!t) return;
                    const texto = t.conteudo.replace(/\{nome\}/g, nome || '');
                    const action = btn.getAttribute('data-action');
                    if (action === 'copy') {
                        try { await navigator.clipboard.writeText(texto); btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = '📋 Copiar'; }, 1200); } catch {}
                    } else if (action === 'insert') {
                        inserirNoWhatsApp(texto);
                    }
                    api('POST', `/api/ext/templates/${t.id}/usar`);
                });
            });
        };
        render2('');
        document.getElementById('orn-tpl-search').addEventListener('input', (e) => render2(e.target.value));
    }

    function inserirNoWhatsApp(texto) {
        const inputs = document.querySelectorAll('div[contenteditable="true"][role="textbox"]');
        const alvo = inputs[inputs.length - 1];
        if (!alvo) { alert('Campo de mensagem não encontrado. Abra uma conversa primeiro.'); return; }
        alvo.focus();
        document.execCommand('insertText', false, texto);
        if (!alvo.textContent || !alvo.textContent.includes(texto.slice(0, 10))) {
            const dt = new DataTransfer();
            dt.setData('text/plain', texto);
            alvo.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        }
    }

    // ═══════════════════════════════════════════════════════
    // COMMAND PALETTE — /atalho + Tab no campo do WhatsApp
    // ═══════════════════════════════════════════════════════
    async function garantirTemplates() {
        if (!templatesCache) { try { await loadTemplates(); } catch {} }
    }
    document.addEventListener('keydown', async (e) => {
        if (e.key !== 'Tab') return;
        const alvo = e.target;
        if (!alvo || !alvo.isContentEditable) return;
        if (sidebar.contains(alvo)) return; // ignora inputs do sidebar
        // Detecta texto após /
        const text = alvo.textContent || '';
        const m = text.match(/\/([a-zA-Z0-9_-]+)\s*$/);
        if (!m) return;
        await garantirTemplates();
        const atalho = m[1].toLowerCase();
        const tpl = (templatesCache || []).find(t => (t.atalho || '').toLowerCase() === atalho);
        if (!tpl) return;
        e.preventDefault();
        // Limpa o /atalho digitado e insere o template
        const nome = (currentData?.cliente?.nome || currentName || '').split(/\s+/)[0] || '';
        const texto = tpl.conteudo.replace(/\{nome\}/g, nome || '');
        // Apaga os últimos caracteres do /atalho
        alvo.focus();
        for (let i = 0; i < m[0].length; i++) {
            document.execCommand('delete', false);
        }
        document.execCommand('insertText', false, texto);
        api('POST', `/api/ext/templates/${tpl.id}/usar`);
    }, true);

    // ═══════════════════════════════════════════════════════
    // IMPORT HISTÓRICO
    // ═══════════════════════════════════════════════════════
    function extrairMensagensVisiveis() {
        const painel = document.querySelector('div[data-testid="conversation-panel-messages"]')
            || document.querySelector('#main [role="application"]')
            || document.querySelector('#main');
        if (!painel) return [];
        const nodes = painel.querySelectorAll('div[data-testid^="msg"], .message-in, .message-out, [role="row"]');
        const seen = new Set();
        const out = [];
        for (const n of nodes) {
            const texto = extrairTextoMensagem(n);
            if (!texto) continue;
            const isSaida = n.classList.contains('message-out') ||
                n.querySelector('.message-out') !== null ||
                (n.getAttribute('data-testid') || '').includes('out');
            const tm = n.textContent.match(/(\d{1,2}):(\d{2})/);
            let criado_em = null;
            if (tm) {
                const hoje = new Date();
                hoje.setHours(parseInt(tm[1]), parseInt(tm[2]), 0, 0);
                criado_em = hoje.toISOString();
            }
            const hash = simpleHash((isSaida ? 'o:' : 'i:') + texto + '|' + (tm ? tm[0] : ''));
            if (seen.has(hash)) continue;
            seen.add(hash);
            out.push({ direcao: isSaida ? 'saida' : 'entrada', conteudo: texto, criado_em, hash });
        }
        return out;
    }

    function extrairTextoMensagem(node) {
        const sel = node.querySelector('span.selectable-text, span[class*="selectable"]');
        if (sel && sel.textContent.trim()) return sel.textContent.trim();
        const t = (node.innerText || node.textContent || '').trim();
        if (!t || t.length < 2) return null;
        return t.replace(/\s+\d{1,2}:\d{2}(\s*(AM|PM))?\s*$/i, '').trim();
    }

    function simpleHash(s) {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
        return h.toString(16);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ═══════════════════════════════════════════════════════
    // OBSERVER DE MUDANÇA DE CHAT
    // ═══════════════════════════════════════════════════════
    let debounceTimer = null;
    let ultimoNomeDetectado = null; // pra saber se trocou de chat
    let tentouDrawerPara = null;   // evita abrir drawer em loop

    function onDOMChange() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            if (!temConversaAberta()) {
                if (currentPhone !== null || currentName !== null) {
                    currentPhone = null;
                    currentName = null;
                    currentData = null;
                    ultimoNomeDetectado = null;
                    dotEl.className = 'ornato-dot off';
                    statusEl.textContent = 'Nenhuma conversa selecionada';
                    subtitleEl.textContent = 'Aguardando conversa…';
                    render();
                }
                return;
            }
            const tel = extrairTelefoneAtivo();
            const nome = extrairNomeAtivo();

            // Mudou de chat (nome diferente) → reseta flag de tentativa
            if (nome && nome !== ultimoNomeDetectado) {
                ultimoNomeDetectado = nome;
                tentouDrawerPara = null;
            }

            if (tel && tel !== currentPhone) {
                currentPhone = tel;
                currentName = nome;
                currentData = null;
                subtitleEl.textContent = nome || '+' + tel;
                statusEl.textContent = 'Carregando dados…';
                dotEl.className = 'ornato-dot off';
                carregar(tel);
            } else if (!tel && !currentPhone && nome) {
                subtitleEl.textContent = nome;
                currentName = nome;
                // Não conseguimos detectar telefone pelo DOM visível.
                // Se sidebar está aberta e ainda não tentou drawer para este chat, tenta abrir automaticamente
                const aberto = !sidebar.classList.contains('ornato-collapsed');
                if (aberto && tentouDrawerPara !== nome) {
                    tentouDrawerPara = nome;
                    statusEl.textContent = 'Detectando número pelo drawer…';
                    const achou = await abrirDrawerParaDetectar();
                    if (achou) {
                        currentPhone = achou;
                        currentName = nome;
                        currentData = null;
                        subtitleEl.textContent = nome || '+' + achou;
                        statusEl.textContent = 'Carregando dados…';
                        carregar(achou);
                        return;
                    }
                }
                statusEl.textContent = nome ? `Número não detectado — use entrada manual` : 'Aguardando…';
                // Renderiza estado que permite entrada manual
                if (!currentData) render();
            }
        }, 400);
    }

    const observer = new MutationObserver(onDOMChange);
    observer.observe(document.body, { childList: true, subtree: true });
    onDOMChange();

    // Atualiza badge ao abrir
    setInterval(updateFabBadge, 60 * 1000);
    updateFabBadge();

    // Reage a mudanças no storage (login/logout no popup)
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.user) {
            currentUser = changes.user.newValue || null;
            userTagEl.textContent = currentUser ? ('· ' + (currentUser.nome || currentUser.email || '')) : '';
        }
        if (changes.token) {
            if (currentPhone) carregar(currentPhone);
            else updateFabBadge();
            atualizarBrand();
        }
        if (changes.baseUrl) {
            baseUrl = (changes.baseUrl.newValue || '').replace(/\/+$/, '');
            atualizarBrand();
        }
        if (changes.brand) {
            aplicarBrand(changes.brand.newValue);
        }
    });
})();
