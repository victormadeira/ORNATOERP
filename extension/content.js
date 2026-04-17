// ═══════════════════════════════════════════════════════
// Ornato ERP Extension — Content Script (web.whatsapp.com)
// Injeta sidebar e monitora qual chat está aberto
// ═══════════════════════════════════════════════════════

(function () {
    if (window.__ornato_sidebar_loaded) return;
    window.__ornato_sidebar_loaded = true;

    const api = (method, path, body) =>
        new Promise((resolve) => chrome.runtime.sendMessage({ type: 'api', method, path, body }, resolve));

    // ─── Monta DOM da sidebar ───
    const sidebar = document.createElement('div');
    sidebar.id = 'ornato-sidebar';
    sidebar.className = 'ornato-collapsed';
    sidebar.innerHTML = `
        <button class="ornato-toggle" title="Ornato ERP">ORN</button>
        <div class="ornato-header">
            <div class="ornato-title">ORNATO · ERP</div>
            <button class="ornato-close">×</button>
        </div>
        <div class="ornato-tabs">
            <button class="ornato-tab active" data-tab="cliente">👤 Cliente</button>
            <button class="ornato-tab" data-tab="orcamentos">💰 Orçamentos</button>
            <button class="ornato-tab" data-tab="sofia">🤖 Sofia</button>
            <button class="ornato-tab" data-tab="templates">📋</button>
        </div>
        <div class="ornato-body"><div class="ornato-empty">Abra uma conversa…</div></div>
    `;
    document.body.appendChild(sidebar);

    const body = sidebar.querySelector('.ornato-body');
    const toggle = sidebar.querySelector('.ornato-toggle');
    const closeBtn = sidebar.querySelector('.ornato-close');
    const tabs = sidebar.querySelectorAll('.ornato-tab');

    toggle.addEventListener('click', () => sidebar.classList.remove('ornato-collapsed'));
    closeBtn.addEventListener('click', () => sidebar.classList.add('ornato-collapsed'));

    let currentTab = 'cliente';
    let currentPhone = null;
    let currentData = null; // { cliente, conversa, orcamentos, sofia }

    tabs.forEach((t) => t.addEventListener('click', () => {
        currentTab = t.dataset.tab;
        tabs.forEach((x) => x.classList.toggle('active', x === t));
        render();
    }));

    // ─── Extrai telefone do chat ativo (DOM WhatsApp Web) ───
    function extrairTelefoneAtivo() {
        // WA Web usa data-testid e atributos variáveis. Estratégias robustas:
        // 1) Header do chat: botão "Dados do contato" → title
        const header = document.querySelector('header [role="button"][title]');
        if (header) {
            const t = header.getAttribute('title') || '';
            const m = t.match(/\+?[\d][\d\s\-()]{7,}/);
            if (m) return m[0].replace(/\D/g, '');
        }
        // 2) URL contém telefone (fallback)
        const urlM = location.hash.match(/(\d{10,15})/);
        if (urlM) return urlM[1];
        // 3) Drawer/Info lateral
        const info = document.querySelector('[data-testid="chat-info-drawer"]');
        if (info) {
            const m = info.textContent.match(/\+?\d[\d\s\-()]{9,}/);
            if (m) return m[0].replace(/\D/g, '');
        }
        return null;
    }

    // ─── Extrai nome do chat ativo (pra mostrar antes de carregar) ───
    function extrairNomeAtivo() {
        const header = document.querySelector('header span[title]');
        return header ? header.getAttribute('title') : '';
    }

    // ─── Carrega dados do ERP ───
    async function carregar(tel) {
        body.innerHTML = '<div class="ornato-empty">Carregando…</div>';
        const r = await api('GET', `/api/ext/cliente-por-tel/${encodeURIComponent(tel)}`);
        if (!r.ok) {
            body.innerHTML = `<div class="ornato-error">${escapeHtml(r.error || 'Erro ao consultar ERP')}</div>
            <div style="margin-top:10px;font-size:11px;color:#8696a0">Clique no ícone da extensão e configure URL + token.</div>`;
            return;
        }
        currentData = { cliente: r.data.cliente, conversa: r.data.conversa, orcamentos: [], sofia: null };

        // Orçamentos em paralelo com sofia-status
        if (currentData.cliente) {
            api('GET', `/api/ext/orcamentos-por-cliente/${currentData.cliente.id}`).then((rr) => {
                if (rr.ok) { currentData.orcamentos = rr.data || []; render(); }
            });
        }
        if (currentData.conversa) {
            api('GET', `/api/ext/sofia-status/${currentData.conversa.id}`).then((rr) => {
                if (rr.ok) { currentData.sofia = rr.data; render(); }
            });
        }
        render();
    }

    // ─── Render ───
    function render() {
        if (!currentPhone) {
            body.innerHTML = '<div class="ornato-empty">Abra uma conversa…</div>';
            return;
        }
        if (!currentData) {
            body.innerHTML = '<div class="ornato-empty">Carregando…</div>';
            return;
        }
        if (currentTab === 'cliente') renderCliente();
        else if (currentTab === 'orcamentos') renderOrcamentos();
        else if (currentTab === 'sofia') renderSofia();
        else if (currentTab === 'templates') renderTemplates();
    }

    // ─── Templates ───
    let templatesCache = null;

    async function loadTemplates() {
        const r = await api('GET', '/api/ext/templates');
        if (r.ok) templatesCache = r.data || [];
        else templatesCache = [];
    }

    function renderTemplates() {
        if (!templatesCache) {
            body.innerHTML = '<div class="ornato-empty">Carregando…</div>';
            loadTemplates().then(render);
            return;
        }
        if (templatesCache.length === 0) {
            body.innerHTML = '<div class="ornato-empty">Nenhum template cadastrado. Crie em ERP → Configurações → Templates.</div>';
            return;
        }
        const nome = (currentData?.cliente?.nome || extrairNomeAtivo() || '').split(/\s+/)[0] || '';
        body.innerHTML = `
            <input id="orn-tpl-search" placeholder="Buscar ou digitar /atalho…" style="width:100%;padding:7px 9px;background:#111b21;color:#e9edef;border:1px solid #2a3942;border-radius:6px;font-size:12px;margin-bottom:10px" />
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
            if (list.length === 0) { container.innerHTML = '<div class="ornato-empty">Nada encontrado.</div>'; return; }
            container.innerHTML = list.map(t => {
                const preview = t.conteudo.replace(/\{nome\}/g, nome || '{nome}');
                return `
                <div class="ornato-orc" data-id="${t.id}" style="cursor:pointer">
                    <div class="ornato-orc-num">${escapeHtml(t.titulo)} ${t.atalho ? '· /' + escapeHtml(t.atalho) : ''}</div>
                    <div style="font-size:11px;color:#e9edef;margin-top:5px;white-space:pre-wrap">${escapeHtml(preview)}</div>
                    <div style="margin-top:6px;display:flex;gap:6px">
                        <button class="ornato-btn" data-action="insert" data-id="${t.id}">📥 Inserir no WA</button>
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

    // ─── Inserir texto no campo do WhatsApp Web ───
    function inserirNoWhatsApp(texto) {
        // WA Web usa um contenteditable div. Estratégia:
        // 1. Achar o campo de input (role=textbox, contenteditable=true)
        const inputs = document.querySelectorAll('div[contenteditable="true"][role="textbox"]');
        // Pega o último (normalmente o campo da mensagem, não da busca)
        const alvo = inputs[inputs.length - 1];
        if (!alvo) {
            alert('Campo de mensagem não encontrado. Abra uma conversa primeiro.');
            return;
        }
        alvo.focus();
        // Usa a API moderna de inserção
        document.execCommand('insertText', false, texto);
        // Fallback: se execCommand falhou, dispara evento de input manualmente
        if (!alvo.textContent || !alvo.textContent.includes(texto.slice(0, 10))) {
            const dataTransfer = new DataTransfer();
            dataTransfer.setData('text/plain', texto);
            alvo.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }));
        }
    }

    function renderCliente() {
        const c = currentData.cliente;
        const nomeChat = extrairNomeAtivo();
        if (!c) {
            body.innerHTML = `
                <div class="ornato-section">
                    <div class="ornato-label">Contato do WhatsApp</div>
                    <div class="ornato-value">${escapeHtml(nomeChat || '—')}</div>
                    <div class="ornato-label">Telefone</div>
                    <div class="ornato-value">${escapeHtml(currentPhone || '—')}</div>
                </div>
                <div class="ornato-empty">Não encontrado no ERP.</div>
                <div style="margin-top:8px">
                    <div class="ornato-label">Dica</div>
                    <div style="font-size:11px;color:#8696a0">Cadastre no ERP para enriquecer esta conversa.</div>
                </div>`;
            return;
        }
        body.innerHTML = `
            <div class="ornato-section">
                <div class="ornato-label">Cliente</div>
                <div class="ornato-value"><strong>${escapeHtml(c.nome || '—')}</strong></div>
                ${c.email ? `<div class="ornato-label">Email</div><div class="ornato-value">${escapeHtml(c.email)}</div>` : ''}
                ${c.tel ? `<div class="ornato-label">Telefone</div><div class="ornato-value">${escapeHtml(c.tel)}</div>` : ''}
                ${c.cidade ? `<div class="ornato-label">Cidade</div><div class="ornato-value">${escapeHtml(c.cidade)}${c.estado ? '/' + escapeHtml(c.estado) : ''}</div>` : ''}
                ${c.bairro ? `<div class="ornato-label">Bairro</div><div class="ornato-value">${escapeHtml(c.bairro)}</div>` : ''}
                ${c.endereco ? `<div class="ornato-label">Endereço</div><div class="ornato-value">${escapeHtml(c.endereco)}${c.numero ? ', ' + escapeHtml(c.numero) : ''}</div>` : ''}
                ${c.obs ? `<div class="ornato-label">Observações</div><div class="ornato-value">${escapeHtml(c.obs)}</div>` : ''}
            </div>
        `;
    }

    function fmtBRL(v) {
        return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function renderOrcamentos() {
        const list = currentData.orcamentos || [];
        if (!currentData.cliente) {
            body.innerHTML = '<div class="ornato-empty">Cliente não cadastrado no ERP.</div>';
            return;
        }
        if (list.length === 0) {
            body.innerHTML = '<div class="ornato-empty">Sem orçamentos para este cliente.</div>';
            return;
        }
        body.innerHTML = list.map((o) => `
            <div class="ornato-orc">
                <div class="ornato-orc-num">#${escapeHtml(o.numero || o.id)}</div>
                <div class="ornato-orc-title">${escapeHtml(o.titulo || 'Sem título')}</div>
                <div class="ornato-orc-val">${fmtBRL(o.valor_total)}</div>
                <div style="font-size:10px;color:#8696a0;margin-top:3px">
                    ${escapeHtml(o.status_proposta || o.status || '—')}
                    ${o.criado_em ? ' · ' + new Date(o.criado_em).toLocaleDateString('pt-BR') : ''}
                </div>
            </div>
        `).join('');
    }

    function renderSofia() {
        const s = currentData.sofia;
        if (!s) {
            body.innerHTML = '<div class="ornato-empty">Sem conversa vinculada.</div>';
            return;
        }
        const tempClass = { muito_quente: 'hot', quente: 'warm', morno: 'cool', frio: 'cold' }[s.temperatura] || 'cold';
        const tempLabel = { muito_quente: '🔥 Muito quente', quente: '🌡 Quente', morno: '💧 Morno', frio: '❄️ Frio' }[s.temperatura] || s.temperatura;

        const escalNivel = Number(s.escalacao_nivel || 0);
        const escalLabels = ['', 'N1 alerta', 'N2 holding', 'N3 retomada', 'N4 abandonada'];

        body.innerHTML = `
            <div class="ornato-section">
                <div class="ornato-label">Qualificação</div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <span class="ornato-chip ${tempClass}">${tempLabel}</span>
                    <strong>${s.lead_score}%</strong>
                </div>
                <div class="ornato-score-bar"><div class="ornato-score-fill" style="width:${Math.min(100, s.lead_score)}%"></div></div>
                <div style="font-size:11px;color:#8696a0">${escapeHtml(s.lead_qualificacao || '—')}</div>
            </div>

            <div class="ornato-section">
                <div class="ornato-label">Estado da conversa</div>
                <div style="margin-bottom:8px">
                    ${s.status === 'humano' ? '<span class="ornato-chip">👤 Humano</span>' : '<span class="ornato-chip ok">🤖 IA</span>'}
                    ${s.ia_bloqueada ? '<span class="ornato-chip hot">🚫 IA pausada</span>' : ''}
                    ${s.aguardando_cliente ? '<span class="ornato-chip warm">⏳ Aguardando cliente</span>' : ''}
                    ${escalNivel > 0 ? `<span class="ornato-chip ${escalNivel >= 3 ? 'hot' : 'warm'}">⚡ ${escalLabels[escalNivel]}</span>` : ''}
                    ${s.abandonada ? '<span class="ornato-chip hot">💤 Abandonada</span>' : ''}
                </div>
                <button class="ornato-btn secondary" id="orn-btn-pausar">${s.ia_bloqueada ? 'Retomar IA' : 'Pausar IA 24h'}</button>
                ${s.status === 'humano' ? `<button class="ornato-btn secondary" id="orn-btn-aguardar">${s.aguardando_cliente ? 'Reativar escalação' : 'Aguardar cliente'}</button>` : ''}
            </div>

            <div class="ornato-section">
                <div class="ornato-label">Dossiê Sofia</div>
                ${renderDossie(s.dossie || {})}
            </div>

            <div class="ornato-section">
                <div class="ornato-label">Histórico do WhatsApp</div>
                <div style="font-size:11px;color:#8696a0;margin-bottom:6px">
                    Importa as mensagens visíveis desta conversa para o ERP (útil pra trazer histórico que não passou pelo webhook).
                </div>
                <button class="ornato-btn secondary" id="orn-btn-import">⬆ Importar mensagens visíveis</button>
                <div id="orn-import-result" style="margin-top:6px;font-size:11px"></div>
            </div>
        `;

        document.getElementById('orn-btn-pausar')?.addEventListener('click', async () => {
            await api('PUT', `/api/ext/pausar-ia/${s.conversa_id}`, {
                bloqueada: !s.ia_bloqueada,
                minutos: 60 * 24,
                motivo: 'manual_ext',
            });
            carregar(currentPhone);
        });
        document.getElementById('orn-btn-aguardar')?.addEventListener('click', async () => {
            await api('PUT', `/api/ext/aguardando-cliente/${s.conversa_id}`, {
                aguardando: !s.aguardando_cliente,
            });
            carregar(currentPhone);
        });

        document.getElementById('orn-btn-import')?.addEventListener('click', async () => {
            const resultEl = document.getElementById('orn-import-result');
            resultEl.textContent = 'Extraindo mensagens…';
            const msgs = extrairMensagensVisiveis();
            if (msgs.length === 0) {
                resultEl.innerHTML = '<span style="color:#fca5a5">Nenhuma mensagem visível encontrada. Role a conversa pra cima pra carregar mais.</span>';
                return;
            }
            resultEl.textContent = `Enviando ${msgs.length} mensagens…`;
            const r = await api('POST', '/api/ext/import-batch', {
                telefone: currentPhone,
                nome: extrairNomeAtivo(),
                mensagens: msgs,
            });
            if (r.ok) {
                resultEl.innerHTML = `<span style="color:#86efac">✓ ${r.data.inseridas} novas · ${r.data.duplicadas} já existiam</span>`;
            } else {
                resultEl.innerHTML = `<span style="color:#fca5a5">Erro: ${escapeHtml(r.error || '?')}</span>`;
            }
        });
    }

    // ─── Extrai mensagens visíveis do container do WhatsApp Web ───
    function extrairMensagensVisiveis() {
        // WA Web marca mensagens com data-testid="msg-container" ou "message-in"/"message-out"
        // Estratégia ampla: pega todos os divs com role="row" dentro do painel principal
        const painel = document.querySelector('div[data-testid="conversation-panel-messages"]')
            || document.querySelector('[role="application"]')
            || document.body;
        const nodes = painel.querySelectorAll('div[data-testid^="msg"], .message-in, .message-out, [role="row"]');
        const seen = new Set();
        const out = [];
        for (const n of nodes) {
            const texto = extrairTextoMensagem(n);
            if (!texto) continue;
            const isSaida = n.classList.contains('message-out') ||
                n.querySelector('.message-out') !== null ||
                (n.getAttribute('data-testid') || '').includes('out');
            // timestamp visível (HH:MM); sem data completa, usar hoje como aproximação
            const tm = n.textContent.match(/(\d{1,2}):(\d{2})/);
            let criado_em = null;
            if (tm) {
                const hoje = new Date();
                hoje.setHours(parseInt(tm[1]), parseInt(tm[2]), 0, 0);
                criado_em = hoje.toISOString();
            }
            // hash estável pra idempotência: texto + minuto + direção
            const hash = simpleHash((isSaida ? 'o:' : 'i:') + texto + '|' + (tm ? tm[0] : ''));
            if (seen.has(hash)) continue;
            seen.add(hash);
            out.push({
                direcao: isSaida ? 'saida' : 'entrada',
                conteudo: texto,
                criado_em,
                hash,
            });
        }
        return out;
    }

    function extrairTextoMensagem(node) {
        // Prefere .selectable-text
        const sel = node.querySelector('span.selectable-text, span[class*="selectable"]');
        if (sel && sel.textContent.trim()) return sel.textContent.trim();
        // Fallback: todo texto, removendo timestamps e metadados
        const t = (node.innerText || node.textContent || '').trim();
        if (!t || t.length < 2) return null;
        // Remove "HH:MM" solto no final
        return t.replace(/\s+\d{1,2}:\d{2}(\s*(AM|PM))?\s*$/i, '').trim();
    }

    function simpleHash(s) {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return h.toString(16);
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
        if (campos.length === 0) return '<div style="font-size:11px;color:#8696a0">—</div>';
        return campos.map(([k, v]) =>
            `<div style="display:flex;gap:6px;font-size:11px;margin-bottom:3px">
                <span style="color:#8696a0;min-width:80px">${escapeHtml(k)}:</span>
                <span>${escapeHtml(String(v))}</span>
            </div>`
        ).join('');
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ─── Observa mudança de chat ativo ───
    let debounceTimer = null;
    function onDOMChange() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const tel = extrairTelefoneAtivo();
            if (tel && tel !== currentPhone) {
                currentPhone = tel;
                currentData = null;
                carregar(tel);
            }
        }, 500);
    }

    const observer = new MutationObserver(onDOMChange);
    observer.observe(document.body, { childList: true, subtree: true });
    onDOMChange();
})();
