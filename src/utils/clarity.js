// ═══════════════════════════════════════════════════════════════════════════════
// Microsoft Clarity — heatmap & session recording
// https://clarity.microsoft.com
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PROJECT_ID = 'wed7zy3qnz';

// Lista de hostnames onde NÃO carregamos o Clarity (evita poluir o dashboard)
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

let scriptLoaded = false;

/**
 * Inicializa o Clarity de forma idempotente.
 * - Não carrega em localhost (dev)
 * - Não carrega 2x na mesma sessão (mesmo se chamado N vezes)
 * - Aceita override de Project ID; cai no default `wed7zy3qnz` se vazio
 *
 * @param {string} [projectId] — Project ID do Clarity. Default: wed7zy3qnz
 */
export function initClarity(projectId) {
    if (typeof window === 'undefined') return;
    if (scriptLoaded) return;

    const host = window.location.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return;

    const id = (projectId || DEFAULT_PROJECT_ID || '').trim();
    if (!id) return;

    // Snippet oficial do Clarity, encapsulado
    (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', id);

    scriptLoaded = true;
}

/**
 * Vincula a sessão atual a um identificador (ex: token da proposta, id do cliente)
 * para você descobrir QUEM visualizou no dashboard do Clarity.
 *
 * Documentação: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api
 *
 * @param {string} customId — ID único do usuário/sessão (ex: token, email, cliente_id)
 * @param {string} [sessionId] — opcional: ID da sessão
 * @param {string} [pageId] — opcional: ID da página
 * @param {string} [friendlyName] — opcional: nome legível (ex: "João Silva")
 */
export function identifyClarity(customId, sessionId, pageId, friendlyName) {
    if (typeof window === 'undefined' || !window.clarity) return;
    try {
        window.clarity('identify', customId, sessionId || '', pageId || '', friendlyName || '');
    } catch { /* silencioso */ }
}

/**
 * Adiciona uma tag customizada à sessão (útil pra filtrar no dashboard).
 * Ex: setClarityTag('tipo', 'proposta'), setClarityTag('valor', 'alto')
 */
export function setClarityTag(key, value) {
    if (typeof window === 'undefined' || !window.clarity) return;
    try {
        window.clarity('set', key, String(value ?? ''));
    } catch { /* silencioso */ }
}

/**
 * Marca a sessão atual como "importante" (Clarity prioriza essas gravações).
 * Use em momentos chave: aprovação de proposta, erro, conversão, etc.
 */
export function upgradeClarity(reason) {
    if (typeof window === 'undefined' || !window.clarity) return;
    try {
        window.clarity('upgrade', reason || 'manual');
    } catch { /* silencioso */ }
}

/**
 * Injeta o Clarity DENTRO de um iframe (cujo conteúdo é HTML standalone via srcDoc).
 * Necessário porque o Clarity da página-mãe NÃO captura o que acontece dentro de um iframe.
 *
 * Use no `onLoad` do iframe:
 *     onLoad={() => injectClarityIntoIframe(iframeRef.current, { token, friendlyName, tags: { ... } })}
 *
 * @param {HTMLIFrameElement} iframe — referência ao iframe já carregado
 * @param {Object} [opts]
 * @param {string} [opts.projectId] — override; cai no default `wed7zy3qnz`
 * @param {string} [opts.token] — usado como customId no identify
 * @param {string} [opts.friendlyName] — nome legível pro dashboard
 * @param {Object} [opts.tags] — tags { key: value } pra filtrar no Clarity
 */
export function injectClarityIntoIframe(iframe, opts = {}) {
    if (typeof window === 'undefined') return;
    if (!iframe || !iframe.contentDocument || !iframe.contentWindow) return;

    const host = window.location.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return;

    const id = (opts.projectId || DEFAULT_PROJECT_ID || '').trim();
    if (!id) return;

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;

    // Idempotência: se já injetou, não injeta de novo (onLoad pode disparar várias vezes)
    if (win.__clarityInjected) return;
    win.__clarityInjected = true;

    try {
        // Snippet oficial do Clarity, mas executado no contexto do iframe
        const script = doc.createElement('script');
        script.type = 'text/javascript';
        script.textContent = `
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${id.replace(/"/g, '')}");
        `;
        (doc.head || doc.documentElement).appendChild(script);

        // Aguarda o snippet definir window.clarity, depois identifica + tags
        const setupTracking = () => {
            if (!win.clarity) return;
            try {
                if (opts.token) {
                    win.clarity('identify', opts.token, '', '', opts.friendlyName || '');
                }
                if (opts.tags && typeof opts.tags === 'object') {
                    for (const [k, v] of Object.entries(opts.tags)) {
                        if (v != null) win.clarity('set', String(k), String(v));
                    }
                }
            } catch { /* silencioso */ }
        };
        // O snippet acima carrega async; tentamos imediatamente e com retry
        setupTracking();
        const retryId = win.setInterval(() => {
            if (win.clarity && win.clarity.q === undefined) { setupTracking(); win.clearInterval(retryId); }
        }, 200);
        win.setTimeout(() => win.clearInterval(retryId), 8000); // desiste após 8s
    } catch { /* silencioso — iframe cross-origin, etc. */ }
}
