import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useAuth } from './auth';
import api from './api';
import { Ic, Z, Skeleton } from './ui';
import { applyPrimaryColor } from './theme';
import { reportError } from './lib/errorReporter';
import { AlertTriangle, Clock, CheckCircle2, Folder, BarChart2, AlertCircle, DollarSign, Calendar, Bell, MessageCircle, Camera, Gift, FileText, ClipboardList, Eye, Search, RefreshCw, Share2, Printer, LayoutDashboard, FileSpreadsheet, Wallet, FolderKanban, Settings, Bug } from 'lucide-react';
import LoginPage from './pages/Login';
import Dash from './pages/Dash';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import OnboardingWizard, { shouldShowOnboarding } from './components/OnboardingWizard';

// ── Code splitting: lazy load de paginas pesadas ──────────────────────────
const Cli = lazy(() => import('./pages/Cli'));
const Cat = lazy(() => import('./pages/Cat'));
const Orcs = lazy(() => import('./pages/Orcs'));
const Novo = lazy(() => import('./pages/Novo'));
const OrcImport = lazy(() => import('./pages/OrcImport'));
const Kb = lazy(() => import('./pages/Kb'));
const Cfg = lazy(() => import('./pages/Cfg'));
const Users = lazy(() => import('./pages/Users'));
const Projetos = lazy(() => import('./pages/Projetos'));
const Estoque = lazy(() => import('./pages/Estoque'));
const ItemBuilder = lazy(() => import('./pages/ItemBuilder'));
const Mensagens = lazy(() => import('./pages/Mensagens'));
const AssistenteIA = lazy(() => import('./pages/AssistenteIA'));
const GerenteRevisional = lazy(() => import('./pages/GerenteRevisional'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const Financeiro = lazy(() => import('./pages/Financeiro'));
const ProducaoCNC = lazy(() => import('./pages/ProducaoCNC'));
const PlanoCorte = lazy(() => import('./pages/PlanoCorte'));
const Industrializacao = lazy(() => import('./pages/Industrializacao'));
const ProducaoFabrica = lazy(() => import('./pages/ProducaoFabrica'));
const Expedicao = lazy(() => import('./pages/Expedicao'));
const Compras = lazy(() => import('./pages/Compras'));
const GestaoAvancada = lazy(() => import('./pages/GestaoAvancada'));
const ProducaoTV = lazy(() => import('./pages/ProducaoTV'));
const Produtividade = lazy(() => import('./pages/Produtividade'));
const PluginDownload = lazy(() => import('./pages/PluginDownload'));
const PluginReleases = lazy(() => import('./pages/admin/PluginReleases'));
const PluginTelemetry = lazy(() => import('./pages/admin/PluginTelemetry'));
const PluginErrorReports = lazy(() => import('./pages/admin/PluginErrorReports'));
const LibraryManager = lazy(() => import('./pages/admin/LibraryManager'));
const ShopProfiles = lazy(() => import('./pages/admin/ShopProfiles'));
const Ponto = lazy(() => import('./pages/Ponto'));
const FunilLeads = lazy(() => import('./pages/FunilLeads'));
const ErrorsPage = lazy(() => import('./pages/Errors'));
const Oficina    = lazy(() => import('./pages/Oficina'));

// ── Skeleton Fallback ──────────────────────────────────────────
const LazyFallback = () => (
    <div className="p-6 max-w-7xl mx-auto">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <Skeleton width={42} height={42} rounded />
            <div>
                <Skeleton width={180} height={20} />
                <div style={{ height: 6 }} />
                <Skeleton width={120} height={14} />
            </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[1,2,3,4].map(i => (
                <div key={i} className="glass-card p-5">
                    <Skeleton width={80} height={12} />
                    <div style={{ height: 12 }} />
                    <Skeleton width={120} height={28} />
                    <div style={{ height: 8 }} />
                    <Skeleton width={60} height={12} />
                </div>
            ))}
        </div>
        <div className="glass-card p-5">
            <Skeleton width={200} height={16} />
            <div style={{ height: 16 }} />
            {[1,2,3].map(i => (
                <div key={i} style={{ marginBottom: 12 }}>
                    <Skeleton width="100%" height={14} />
                </div>
            ))}
        </div>
    </div>
);

// ── Error Boundary ──────────────────────────────────────────
import { Component } from 'react';
class ErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, info) {
        console.error('ErrorBoundary:', error, info.componentStack);
        try {
            reportError({
                message: error?.message || String(error),
                stack: error?.stack || '',
                meta: { kind: 'ErrorBoundary', componentStack: (info?.componentStack || '').slice(0, 3000) },
            });
        } catch (_) { /* noop */ }
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 16, padding: 40 }}>
                    <div className="empty-state-icon">
                        <AlertTriangle size={28} style={{ color: 'var(--danger)' }} />
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Algo deu errado</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 400 }}>
                        Ocorreu um erro inesperado nesta secao. Tente recarregar a pagina.
                    </p>
                    <button
                        onClick={() => { this.setState({ hasError: false, error: null }); }}
                        className="btn-primary"
                        style={{ padding: '8px 24px', fontSize: 13 }}
                    >
                        Tentar Novamente
                    </button>
                    {this.state.error && (
                        <details style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 500, wordBreak: 'break-all' }}>
                            <summary style={{ cursor: 'pointer' }}>Detalhes tecnicos</summary>
                            <pre style={{ marginTop: 8, padding: 12, background: 'var(--bg-muted)', borderRadius: 8, overflow: 'auto', maxHeight: 120 }}>
                                {this.state.error.message}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }
        return this.props.children;
    }
}

export default function App() {
    const { user, loading, logout, isAdmin, isGerente, updateUser } = useAuth();
    // ── Roteamento com History API ──────────────────────────────────────────
    const VALID_PAGES = ['dash','cli','cat','catalogo_itens','orcs','novo','kb','proj','estoque','financeiro','whatsapp','assistente','relatorios','industrializacao','cnc','producao_fabrica','expedicao','cfg','users','plano_corte','compras','gestao','producao_tv','produtividade','plugin_download','plugin_releases','plugin_telemetry','plugin_errors','library_manager','shop_profiles','ponto','funil','errors','oficina','oficina_tv'];
    // Páginas aposentadas — redirecionam para o destino atual
    const LEGACY_REDIRECTS = { digital_twin: 'cnc' };
    const [pg, setPg] = useState(() => {
        const rawPath = window.location.pathname.replace(/^\/+/, '');
        const parts = rawPath.split('/');
        let pathPage = parts[0] || '';
        if (LEGACY_REDIRECTS[pathPage]) pathPage = LEGACY_REDIRECTS[pathPage];
        if (pathPage && VALID_PAGES.includes(pathPage)) {
            localStorage.setItem('erp_page', pathPage);
            if (parts[0] && LEGACY_REDIRECTS[parts[0]]) {
                window.history.replaceState({}, '', pathPage === 'dash' ? '/' : `/${pathPage}`);
            }
            return pathPage;
        }
        // Sem URL explícita → sempre começa no dashboard (não restaura última página)
        localStorage.setItem('erp_page', 'dash');
        return 'dash';
    });
    const [sb, setSb] = useState(() => localStorage.getItem('erp_sidebar') !== 'collapsed');
    const [sidebarHover, setSidebarHover] = useState(false);

    // Persist sidebar state
    useEffect(() => {
        localStorage.setItem('erp_sidebar', sb ? 'expanded' : 'collapsed');
    }, [sb]);
    const [dark, setDark] = useState(() => (localStorage.getItem('ornato-theme') || 'dark') === 'dark');
    const [notif, setNotif] = useState(null);
    const [notifExiting, setNotifExiting] = useState(false);
    const notifTimer = useRef(null);
    const [clis, setClis] = useState([]);
    const [orcs, setOrcs] = useState([]);
    const [taxas, setTaxas] = useState({ imp: 8, com: 10, mont: 12, lucro: 20, frete: 2, mdo: 350, inst: 180 });
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [editOrc, setEditOrc] = useState(() => {
        const rawPath = window.location.pathname.replace(/^\/+/, '');
        const parts = rawPath.split('/');
        if (parts[0] === 'novo' && parts[1]) {
            const orcId = parseInt(parts[1]);
            if (orcId > 0) return { id: orcId };
        }
        return null;
    });
    const [notifs, setNotifs] = useState({ notificacoes: [], nao_lidas: 0 });
    const [showNotifs, setShowNotifs] = useState(false);
    const notifsRef = useRef(null);
    const [waUnread, setWaUnread] = useState(0);
    const [logoSistema, setLogoSistema] = useState(() => localStorage.getItem('logo_sistema') || '');
    const [empNome, setEmpNome] = useState(() => localStorage.getItem('emp_nome') || 'Ornato');
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
    const [showPerfil, setShowPerfil] = useState(false);
    const [buscaQuery, setBuscaQuery] = useState('');
    const [buscaResults, setBuscaResults] = useState(null);
    const [buscaOpen, setBuscaOpen] = useState(false);
    const [openProjectId, setOpenProjectId] = useState(null);
    const buscaRef = useRef(null);
    const buscaTimer = useRef(null);
    const [pageKey, setPageKey] = useState(0); // for page transitions
    const [navDepth, setNavDepth] = useState(0); // nav stack depth for back button

    // Estado de colapso dos grupos do menu (default: tudo colapsado)
    const [collapsed, setCollapsed] = useState(() => {
        const stored = localStorage.getItem('menu_collapsed');
        if (stored) try { return JSON.parse(stored); } catch {}
        // Primeira vez: colapsa todos os grupos (exceto top/projetos_hub que não têm label)
        return { comercial: true, producao: true, cadastros: true, gestao: true, sistema: true };
    });
    // Menus ocultos (carregado da empresa_config)
    const [menusOcultos, setMenusOcultos] = useState(() => {
        try { return JSON.parse(localStorage.getItem('menus_ocultos') || '[]'); } catch { return []; }
    });
    // Command palette (Ctrl+K)
    const [cmdOpen, setCmdOpen] = useState(false);
    const [cmdQuery, setCmdQuery] = useState('');
    const [cmdResults, setCmdResults] = useState(null);
    const [cmdLoading, setCmdLoading] = useState(false);
    const [cmdSel, setCmdSel] = useState(0);
    const cmdInputRef = useRef(null);
    const cmdSearchTimer = useRef(null);
    // Keyboard shortcuts overlay
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const gPressedRef = useRef(false);
    const gTimerRef = useRef(null);

    // Ctrl+K command palette + keyboard shortcuts
    useEffect(() => {
        const isInput = () => {
            const el = document.activeElement;
            return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.contentEditable === 'true' || el.tagName === 'SELECT');
        };
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCmdOpen(v => !v);
                setCmdQuery('');
                setCmdResults(null);
                setCmdLoading(false);
                setCmdSel(0);
                return;
            }
            if (e.key === 'Escape') {
                if (shortcutsOpen) { setShortcutsOpen(false); return; }
                if (cmdOpen) { setCmdOpen(false); setCmdResults(null); setCmdSel(0); return; }
            }
            if (isInput()) return;
            // ? key shows shortcuts overlay
            if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                setShortcutsOpen(v => !v);
                return;
            }
            // / key opens command palette (same as Ctrl+K)
            if (e.key === '/' && !e.metaKey && !e.ctrlKey && !cmdOpen) {
                e.preventDefault();
                setCmdOpen(true);
                setCmdQuery('');
                return;
            }
            // G + letter navigation
            if (e.key === 'g' || e.key === 'G') {
                if (!gPressedRef.current) {
                    gPressedRef.current = true;
                    clearTimeout(gTimerRef.current);
                    gTimerRef.current = setTimeout(() => { gPressedRef.current = false; }, 1000);
                    return;
                }
            }
            if (gPressedRef.current) {
                const map = { d: 'dash', o: 'orcs', p: 'proj', c: 'cli', f: 'financeiro', e: 'estoque' };
                const target = map[e.key.toLowerCase()];
                if (target) {
                    e.preventDefault();
                    gPressedRef.current = false;
                    clearTimeout(gTimerRef.current);
                    // nav is defined later in the component, use a ref-free approach via setPg
                    window.dispatchEvent(new CustomEvent('erp-nav', { detail: target }));
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [cmdOpen, shortcutsOpen]);

    // Focus command palette input when opened
    useEffect(() => {
        if (cmdOpen && cmdInputRef.current) cmdInputRef.current.focus();
    }, [cmdOpen]);

    // Entity search inside command palette
    useEffect(() => {
        if (!cmdOpen || cmdQuery.length < 2) { setCmdResults(null); setCmdLoading(false); return; }
        setCmdLoading(true);
        clearTimeout(cmdSearchTimer.current);
        cmdSearchTimer.current = setTimeout(() => {
            api.get(`/search?q=${encodeURIComponent(cmdQuery)}`)
                .then(r => { setCmdResults(r.results || []); })
                .catch(() => setCmdResults([]))
                .finally(() => setCmdLoading(false));
        }, 250);
        return () => clearTimeout(cmdSearchTimer.current);
    }, [cmdOpen, cmdQuery]);

    // Detectar mobile via resize
    useEffect(() => {
        const onResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (!mobile) setMobileOpen(false);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Swipe gesture: arrastar da borda esquerda abre menu, arrastar pra esquerda fecha
    useEffect(() => {
        if (!isMobile) return;
        let startX = 0, startY = 0, tracking = false;
        const EDGE = 28;       // zona de borda (px) para iniciar swipe
        const THRESHOLD = 60;  // distância mínima para disparar

        const onStart = (e) => {
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            // Iniciar tracking se: swipe da borda esquerda (para abrir) ou menu já aberto (para fechar)
            tracking = startX < EDGE || mobileOpen;
        };
        const onEnd = (e) => {
            if (!tracking) return;
            tracking = false;
            const t = e.changedTouches[0];
            const dx = t.clientX - startX;
            const dy = Math.abs(t.clientY - startY);
            // Ignorar se scroll vertical é maior que horizontal
            if (dy > Math.abs(dx)) return;
            if (!mobileOpen && startX < EDGE && dx > THRESHOLD) {
                setMobileOpen(true);   // swipe pra direita na borda → abrir
            } else if (mobileOpen && dx < -THRESHOLD) {
                setMobileOpen(false);  // swipe pra esquerda → fechar
            }
        };

        document.addEventListener('touchstart', onStart, { passive: true });
        document.addEventListener('touchend', onEnd, { passive: true });
        return () => {
            document.removeEventListener('touchstart', onStart);
            document.removeEventListener('touchend', onEnd);
        };
    }, [isMobile, mobileOpen]);

    useEffect(() => {
        const theme = dark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('dark', dark); /* backward compat */
        localStorage.setItem('ornato-theme', theme);
    }, [dark]);

    const notify = useCallback((m) => {
        if (notifTimer.current) clearTimeout(notifTimer.current);
        setNotifExiting(false);
        setNotif(m);
        notifTimer.current = setTimeout(() => {
            setNotifExiting(true);
            setTimeout(() => { setNotif(null); setNotifExiting(false); }, 300);
        }, 2700);
    }, []);

    const loadClis = useCallback(() => { if (user) api.get('/clientes').then(setClis).catch(err => console.warn('loadClis:', err)); }, [user]);
    const loadOrcs = useCallback(() => { if (user) api.get('/orcamentos?slim=1').then(setOrcs).catch(err => console.warn('loadOrcs:', err)); }, [user]);
    const loadTaxas = useCallback(() => { if (user) api.get('/config').then(setTaxas).catch(err => console.warn('loadTaxas:', err)); }, [user]);
    const loadNotifs = useCallback(() => { if (user) api.get('/notificacoes').then(setNotifs).catch(err => console.warn('loadNotifs:', err)); }, [user]);
    const loadWaUnread = useCallback(() => { if (user) api.get('/whatsapp/nao-lidas').then(d => setWaUnread(d.total)).catch(err => console.warn('loadWaUnread:', err)); }, [user]);
    const loadEmpresa = useCallback(() => {
        if (user) api.get('/config/empresa').then(d => {
            const ls = d.logo_sistema || '';
            const nm = d.nome || 'Ornato';
            setLogoSistema(ls);
            setEmpNome(nm);
            localStorage.setItem('logo_sistema', ls);
            localStorage.setItem('emp_nome', nm);
            if (d.sistema_cor_primaria) applyPrimaryColor(d.sistema_cor_primaria);
            // Menus ocultos
            try {
                const ocultos = JSON.parse(d.menus_ocultos_json || '[]');
                setMenusOcultos(Array.isArray(ocultos) ? ocultos : []);
                localStorage.setItem('menus_ocultos', d.menus_ocultos_json || '[]');
            } catch { setMenusOcultos([]); }
        }).catch(err => console.warn('loadEmpresa:', err));
    }, [user]);

    useEffect(() => { loadClis(); loadOrcs(); loadTaxas(); loadNotifs(); loadWaUnread(); loadEmpresa(); }, [loadClis, loadOrcs, loadTaxas, loadNotifs, loadWaUnread, loadEmpresa]);

    // Onboarding: mostrar para gerentes na primeira vez
    useEffect(() => { if (user && shouldShowOnboarding(user)) setShowOnboarding(true); }, [user]);

    useEffect(() => {
        if (!user) return;
        const i1 = setInterval(loadNotifs, 15000);
        const i2 = setInterval(loadWaUnread, 15000);
        return () => { clearInterval(i1); clearInterval(i2); };
    }, [user, loadNotifs, loadWaUnread]);

    useEffect(() => {
        const handleClick = (e) => {
            if (notifsRef.current && !notifsRef.current.contains(e.target)) setShowNotifs(false);
            if (buscaRef.current && !buscaRef.current.contains(e.target)) { setBuscaOpen(false); }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Busca global debounce
    useEffect(() => {
        if (buscaQuery.length < 2) { setBuscaResults(null); setBuscaOpen(false); return; }
        clearTimeout(buscaTimer.current);
        buscaTimer.current = setTimeout(() => {
            api.get(`/dashboard/busca?q=${encodeURIComponent(buscaQuery)}`).then(r => {
                setBuscaResults(r);
                setBuscaOpen(true);
            }).catch(err => console.warn('busca global:', err));
        }, 300);
        return () => clearTimeout(buscaTimer.current);
    }, [buscaQuery]);

    // Marcar UMA notificacao como lida
    const markNotifRead = (id) => {
        api.put(`/notificacoes/${id}/lida`).catch(err => console.warn('markNotifRead:', err));
        setNotifs(prev => ({
            ...prev,
            notificacoes: prev.notificacoes.map(n => n.id === id ? { ...n, lida: 1 } : n),
            nao_lidas: Math.max(0, prev.nao_lidas - 1),
        }));
    };

    const markAllRead = () => {
        api.put('/notificacoes/lidas').catch(err => console.warn('markAllRead:', err));
        setNotifs(prev => ({
            ...prev,
            notificacoes: prev.notificacoes.map(n => ({ ...n, lida: 1 })),
            nao_lidas: 0,
        }));
    };

    const goToNotif = (n) => {
        if (!n.lida) markNotifRead(n.id);
        setShowNotifs(false);
        if (n.referencia_tipo === 'contas_pagar' || n.tipo?.startsWith('pagar_')) {
            nav('financeiro');
        } else if (n.referencia_tipo === 'contas_receber' || n.tipo?.startsWith('financeiro')) {
            nav('financeiro');
        } else if (n.referencia_tipo === 'projeto') {
            setOpenProjectId(n.referencia_id);
            nav('proj');
        } else if (n.referencia_tipo === 'orcamento') {
            const orc = orcs.find(o => o.id === n.referencia_id);
            if (orc) nav('novo', orc); else nav('orcs');
        } else if (n.referencia_tipo === 'estoque') {
            nav('estoque');
        } else {
            nav('dash');
        }
    };

    const reload = () => { loadClis(); loadOrcs(); loadTaxas(); loadNotifs(); };

    const nav = (p, orc) => {
        window.scrollTo(0, 0);
        // Não incrementa quando é navegação para a mesma página
        const sameTarget = p === pg && !(p === 'novo' && orc?.id !== editOrc?.id);
        if (p === "novo" && orc !== undefined) setEditOrc(orc);
        else if (p !== "novo") setEditOrc(null);
        setPg(p);
        setPageKey(k => k + 1); // trigger page transition
        if (!sameTarget) setNavDepth(d => d + 1);
        localStorage.setItem('erp_page', p);
        let url = p === 'dash' ? '/' : `/${p}`;
        if (p === 'novo' && orc?.id) url = `/novo/${orc.id}`;
        window.history.pushState({ page: p, orcId: orc?.id || null, depth: navDepth + (sameTarget ? 0 : 1) }, '', url);
        if (isMobile) setMobileOpen(false);
    };

    const goBack = () => {
        if (navDepth > 0) {
            window.history.back();
        } else {
            nav('dash');
        }
    };

    // Navigate directly to a search result record
    const navToRecord = (r) => {
        if (r.tipo === 'orcamento') { nav('novo', { id: r.id }); }
        else if (r.tipo === 'projeto') { setOpenProjectId(r.id); nav('proj'); }
        else if (r.tipo === 'cliente') { nav('cli'); }
        else if (r.tipo === 'peca') { nav('cat'); }
        else if (r.page) { nav(r.page); }
    };

    // Listen for keyboard shortcut navigation events
    useEffect(() => {
        const handleNav = (e) => nav(e.detail);
        window.addEventListener('erp-nav', handleNav);
        return () => window.removeEventListener('erp-nav', handleNav);
    }); // intentionally no deps — nav changes each render

    // Keyboard shortcut: Alt+← (or Cmd+[ on Mac) — voltar
    useEffect(() => {
        const handleKey = (e) => {
            const tag = (e.target?.tagName || '').toUpperCase();
            const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;
            if (isInput) return;
            const altLeft = e.altKey && e.key === 'ArrowLeft';
            const cmdBracket = (e.metaKey || e.ctrlKey) && e.key === '[';
            if (altLeft || cmdBracket) {
                e.preventDefault();
                if (navDepth > 0) window.history.back();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [navDepth]);

    useEffect(() => {
        let initUrl = pg === 'dash' ? '/' : `/${pg}`;
        if (pg === 'novo' && editOrc?.id) initUrl = `/novo/${editOrc.id}`;
        window.history.replaceState({ page: pg, orcId: editOrc?.id || null }, '', initUrl);

        const handlePopState = (e) => {
            const page = e.state?.page || 'dash';
            const orcId = e.state?.orcId;
            const depth = e.state?.depth ?? 0;
            setPg(page);
            setPageKey(k => k + 1);
            setNavDepth(Math.max(0, depth));
            localStorage.setItem('erp_page', page);
            if (page === 'novo' && orcId) setEditOrc({ id: orcId });
            else if (page !== 'novo') setEditOrc(null);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return (
        <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-body)' }}>
            <div className="flex flex-col items-center gap-4">
                <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(19,121,240,.28)',
                }}>
                    <LayoutDashboard size={24} style={{ color: '#fff' }} />
                </div>
                <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando...</span>
            </div>
        </div>
    );
    if (!user) return <LoginPage dark={dark} setDark={setDark} logoSistema={logoSistema} empNome={empNome} />;

    // Todos os itens de menu (flat)
    const ALL_MENUS = [
        { id: "dash", lb: "Home", ic: Ic.Dash },
        { id: "cli", lb: "Clientes", ic: Ic.Usr },
        { id: "cat", lb: "Biblioteca", ic: Ic.Box },
        { id: "catalogo_itens", lb: "Engenharia de Modulos", ic: Ic.Package },
        { id: "orcs", lb: "Orcamentos", ic: Ic.File },
        { id: "kb", lb: "Pipeline CRM", ic: Ic.Kb },
        { id: "proj", lb: "Projetos", ic: Ic.Briefcase },
        { id: "estoque", lb: "Gestao de Recursos", ic: Ic.Warehouse },
        { id: "financeiro", lb: "Financeiro", ic: Ic.Dollar },
        { id: "funil", lb: "Funil de Leads", ic: Ic.Target },
        { id: "whatsapp", lb: "WhatsApp", ic: Ic.WhatsApp },
        { id: "assistente", lb: "Assistente IA", ic: Ic.Sparkles },
        { id: "gerente-revisional", lb: "Gerente Revisional IA", ic: Ic.Brain },
        { id: "relatorios", lb: "Relatorios", ic: Ic.PieChart },
        { id: "industrializacao", lb: "Ordens de Producao", ic: Ic.ClipList },
        { id: "cnc", lb: "Corte & CNC", ic: Ic.CircularSaw },
        { id: "producao_fabrica", lb: "Acompanhamento", ic: Ic.Factory },
        { id: "expedicao", lb: "Expedicao", ic: Ic.Truck },
        { id: "cfg", lb: "Config & Taxas", ic: Ic.Gear },
        ...(isAdmin ? [{ id: "users", lb: "Usuarios", ic: Ic.Users }] : []),
    ];

    // Filtro por permissoes
    const userPerms = (() => { try { return user?.permissions ? JSON.parse(user.permissions) : null; } catch { return null; } })();
    const isVendedor = user?.role === 'vendedor';
    const canSee = (id) => {
        if (isAdmin) return true;
        if (isVendedor && id === 'financeiro') return false;
        return !userPerms || userPerms.length === 0 || userPerms.includes(id);
    };

    // Menu agrupado (enxuto — páginas extras acessíveis via Ctrl+K)
    const MENU_GROUPS = [
        { id: 'top', items: [{ id: "dash", lb: "Dashboard", ic: Ic.Dash }] },
        { id: 'projetos_hub', label: 'Projetos', icon: Ic.Briefcase, items: [{ id: "proj", lb: "Projetos", ic: Ic.Briefcase }] },
        { id: 'comercial', label: 'Comercial', icon: Ic.Handshake, items: [
            { id: "funil", lb: "Funil de Leads", ic: Ic.Target },
            { id: "cli", lb: "Clientes", ic: Ic.Usr },
            { id: "orcs", lb: "Orçamentos", ic: Ic.File },
            { id: "whatsapp", lb: "WhatsApp", ic: Ic.WhatsApp },
        ]},
        { id: 'producao', label: 'Produção', icon: Ic.Factory, items: [
            { id: "oficina", lb: "Oficina", ic: Ic.LayoutGrid },
            { id: "industrializacao", lb: "Ordens", ic: Ic.ClipList },
            { id: "cnc", lb: "Corte & CNC", ic: Ic.CircularSaw },
            { id: "producao_fabrica", lb: "Acompanhamento", ic: Ic.HardHat },
            { id: "expedicao", lb: "Expedição", ic: Ic.Truck },
        ]},
        { id: 'cadastros', label: 'Cadastros', icon: Ic.Box, items: [
            { id: "cat", lb: "Materiais", ic: Ic.Box },
            { id: "catalogo_itens", lb: "Engenharia", ic: Ic.Package },
            { id: "estoque", lb: "Estoque", ic: Ic.Warehouse },
        ]},
        { id: 'gestao', label: 'Gestão', icon: Ic.LineChart, items: [
            { id: "financeiro", lb: "Financeiro", ic: Ic.Dollar },
            { id: "compras", lb: "Compras & NF", ic: Ic.ShoppingCart },
            { id: "ponto", lb: "Ponto", ic: Ic.Clock },
            { id: "gestao", lb: "Gestão Avançada", ic: Ic.BarChart },
            { id: "relatorios", lb: "Relatórios", ic: Ic.PieChart },
        ]},
        { id: 'sistema', label: 'Sistema', icon: Ic.Cog, items: [
            { id: "assistente", lb: "Assistente IA", ic: Ic.Sparkles },
        { id: "gerente-revisional", lb: "Gerente Revisional IA", ic: Ic.Brain },
            { id: "plugin_download", lb: "Plugin SketchUp", ic: Ic.Plug },
            ...(isAdmin ? [{ id: "plugin_releases", lb: "Plugin · Releases", ic: Ic.Plug }] : []),
            ...((isAdmin || user?.role === 'library_curator') ? [{ id: "library_manager", lb: "Biblioteca · Curadoria", ic: Ic.Briefcase || Ic.File }] : []),
            ...(isAdmin ? [{ id: "shop_profiles", lb: "Padrões · Marcenaria", ic: Ic.Cog || Ic.Gear }] : []),
            { id: "cfg", lb: "Configurações", ic: Ic.Gear },
            ...(isAdmin ? [{ id: "users", lb: "Usuários", ic: Ic.Users }] : []),
            ...(isAdmin ? [{ id: "errors", lb: "Erros do Sistema", ic: Bug }] : []),
        ]},
    ];

    // Itens protegidos — nunca ocultar (evita admin se trancar)
    const PROTECTED_MENUS = ['dash', 'cfg', 'users'];

    // Filtrar menus ocultos
    const VISIBLE_MENU_GROUPS = MENU_GROUPS.map(group => ({
        ...group,
        items: group.items.filter(item => PROTECTED_MENUS.includes(item.id) || !menusOcultos.includes(item.id)),
    })).filter(group => group.items.length > 0);

    // Todas as páginas (para command palette Ctrl+K) — inclui as que saíram do sidebar
    const ALL_PAGES = [
        { id: "dash", lb: "Dashboard", ic: Ic.Dash },
        { id: "proj", lb: "Projetos", ic: Ic.Briefcase },
        { id: "cli", lb: "Clientes", ic: Ic.Usr },
        { id: "orcs", lb: "Orçamentos", ic: Ic.File },
        { id: "funil", lb: "Funil de Leads", ic: Ic.Target },
        { id: "kb", lb: "Pipeline CRM", ic: Ic.Kb },
        { id: "whatsapp", lb: "WhatsApp", ic: Ic.WhatsApp },
        { id: "industrializacao", lb: "Ordens de Produção", ic: Ic.ClipList },
        { id: "cnc", lb: "Corte & CNC", ic: Ic.CircularSaw },
        { id: "producao_fabrica", lb: "Acompanhamento Fábrica", ic: Ic.HardHat },
        { id: "producao_tv", lb: "TV Fábrica", ic: Ic.Monitor },
        { id: "expedicao", lb: "Expedição", ic: Ic.Truck },
        { id: "produtividade", lb: "Produtividade", ic: Ic.BarChart },
        { id: "cat", lb: "Materiais", ic: Ic.Box },
        { id: "catalogo_itens", lb: "Engenharia / Catálogo", ic: Ic.Package },
        { id: "estoque", lb: "Estoque / Recursos", ic: Ic.Warehouse },
        { id: "compras", lb: "Compras & NF", ic: Ic.ShoppingCart },
        { id: "financeiro", lb: "Financeiro", ic: Ic.Dollar },
        { id: "gestao", lb: "Gestão Avançada", ic: Ic.BarChart },
        { id: "relatorios", lb: "Relatórios", ic: Ic.PieChart },
        { id: "assistente", lb: "Assistente IA", ic: Ic.Sparkles },
        { id: "gerente-revisional", lb: "Gerente Revisional IA", ic: Ic.Brain },
        { id: "plugin_download", lb: "Plugin SketchUp", ic: Ic.Plug },
        { id: "cfg", lb: "Configurações", ic: Ic.Gear },
        ...(isAdmin ? [{ id: "users", lb: "Usuários", ic: Ic.Users }] : []),
        ...(isAdmin ? [{ id: "errors", lb: "Erros do Sistema", ic: Bug }] : []),
    ].filter(p => canSee(p.id));

    // Mobile bottom nav items (5 main)
    const MOBILE_NAV = [
        { id: 'dash', lb: 'Home', ic: LayoutDashboard },
        { id: 'proj', lb: 'Projetos', ic: FolderKanban },
        { id: 'orcs', lb: 'Orcamentos', ic: FileSpreadsheet },
        { id: 'financeiro', lb: 'Financeiro', ic: Wallet },
        { id: 'more', lb: 'Menu', ic: Settings },
    ];

    const toggleGroup = (gid) => {
        const next = { ...collapsed, [gid]: !collapsed[gid] };
        setCollapsed(next);
        localStorage.setItem('menu_collapsed', JSON.stringify(next));
    };

    const activeGroup = MENU_GROUPS.find(g => g.items.some(m => m.id === pg));
    if (activeGroup && collapsed[activeGroup.id]) {
        collapsed[activeGroup.id] = false;
    }

    // Sidebar expanded state (full or hover)
    const sidebarExpanded = sb || sidebarHover;

    const renderPage = () => {
        switch (pg) {
            case "dash": return <Dash nav={nav} notify={notify} user={user} />;
            case "cli": return <Cli clis={clis} reload={loadClis} notify={notify} nav={nav} />;
            case "cat": return <Cat notify={notify} />;
            case "orcs": return <Orcs orcs={orcs} nav={nav} reload={loadOrcs} notify={notify} />;
            case "novo": return <Novo clis={clis} taxas={taxas} editOrc={editOrc} nav={nav} reload={reload} notify={notify} />;
            case "orc-import": return <OrcImport clis={clis} nav={nav} reload={loadOrcs} notify={notify} />;
            case "kb": return <Kb orcs={orcs} reload={loadOrcs} notify={notify} nav={nav} />;
            case "proj": return <Projetos orcs={orcs} notify={notify} user={user} openProjectId={openProjectId} onProjectOpened={() => setOpenProjectId(null)} nav={nav} />;
            case "estoque": return <Estoque notify={notify} />;
            case "financeiro": return <Financeiro notify={notify} user={user} nav={nav} />;
            case "whatsapp": return <Mensagens notify={notify} />;
            case "assistente": return <AssistenteIA notify={notify} />;
            case "gerente-revisional": return <GerenteRevisional notify={notify} />;
            case "catalogo_itens": return <ItemBuilder notify={notify} />;
            case "relatorios": return <Relatorios notify={notify} />;
            case "plano_corte": return <PlanoCorte notify={notify} />;
            case "cnc": return <ProducaoCNC notify={notify} />;
            case "cfg": return <Cfg taxas={taxas} reload={loadTaxas} notify={notify} allMenuItems={MENU_GROUPS} menusOcultos={menusOcultos} onMenusChange={() => loadEmpresa()} />;
            case "users": return isAdmin ? <Users notify={notify} meUser={user} /> : <Dash nav={nav} notify={notify} />;
            case "industrializacao": return <Industrializacao notify={notify} nav={nav} />;
            case "producao_fabrica": return <ProducaoFabrica notify={notify} user={user} />;
            case "expedicao": return <Expedicao notify={notify} user={user} />;
            case "compras": return <Compras notify={notify} />;
            case "gestao": return <GestaoAvancada notify={notify} />;
            case "producao_tv": return <ProducaoTV />;
            case "oficina":    return <Oficina notify={notify} />;
            case "oficina_tv": return <Oficina notify={notify} tvMode />;
            case "produtividade": return <Produtividade notify={notify} />;
            case "plugin_download": return <PluginDownload notify={notify} />;
            case "plugin_releases":  return isAdmin ? <PluginReleases notify={notify} onNav={nav} /> : <Dash nav={nav} notify={notify} />;
            case "plugin_telemetry": return isAdmin ? <PluginTelemetry notify={notify} onNav={nav} /> : <Dash nav={nav} notify={notify} />;
            case "plugin_errors":    return isAdmin ? <PluginErrorReports notify={notify} onNav={nav} /> : <Dash nav={nav} notify={notify} />;
            case "library_manager":  return (isAdmin || user?.role === 'library_curator')
                ? <LibraryManager notify={notify} user={user} />
                : <Dash nav={nav} notify={notify} />;
            case "shop_profiles":    return isAdmin ? <ShopProfiles notify={notify} user={user} /> : <Dash nav={nav} notify={notify} />;
            case "ponto": return <Ponto notify={notify} />;
            case "funil": return <FunilLeads notify={notify} nav={nav} />;
            case "errors": return isAdmin ? <ErrorsPage notify={notify} /> : <Dash nav={nav} notify={notify} />;
            default: return <Dash nav={nav} notify={notify} />;
        }
    };

    // Notificacao tipo -> icone + cor
    const NOTIF_STYLE = {
        financeiro_vencido:  { icon: <AlertTriangle size={14} />, color: 'var(--danger)', bg: 'var(--danger-bg)' },
        financeiro_proximo:  { icon: <Clock size={14} />, color: 'var(--warning)', bg: 'var(--warning-bg)' },
        orcamento_aprovado:  { icon: <CheckCircle2 size={14} />, color: 'var(--success)', bg: 'var(--success-bg)' },
        projeto_criado:      { icon: <Folder size={14} />, color: 'var(--info)', bg: 'var(--info-bg)' },
        projeto_status:      { icon: <BarChart2 size={14} />, color: 'var(--info)', bg: 'var(--info-bg)' },
        estoque_baixo:       { icon: <AlertCircle size={14} />, color: '#f97316', bg: '#fff7ed' },
        pagar_vencido:       { icon: <AlertTriangle size={14} />, color: 'var(--danger)', bg: 'var(--danger-bg)' },
        pagar_proximo:       { icon: <DollarSign size={14} />, color: 'var(--warning)', bg: 'var(--warning-bg)' },
        recorrencia_gerada:  { icon: <Calendar size={14} />, color: 'var(--info)', bg: 'var(--info-bg)' },
        portal_mensagem:     { icon: <MessageCircle size={14} />, color: 'var(--info)', bg: 'var(--info-bg)' },
        montador_foto:       { icon: <Camera size={14} />, color: 'var(--info)', bg: 'var(--info-bg)' },
        orcamento_parado:    { icon: <FileText size={14} />, color: '#f97316', bg: '#fff7ed' },
        etapa_atrasada:      { icon: <ClipboardList size={14} />, color: 'var(--danger)', bg: 'var(--danger-bg)' },
        cliente_aniversario: { icon: <Gift size={14} />, color: '#ec4899', bg: '#fdf2f8' },
        proposta_visualizada:{ icon: <Eye size={14} />, color: '#6366f1', bg: '#eef2ff' },
        portal_visualizado:  { icon: <Eye size={14} />, color: '#0ea5e9', bg: '#f0f9ff' },
        proposta_retorno:    { icon: <RefreshCw size={14} />, color: '#f97316', bg: '#fff7ed' },
        proposta_compartilhada: { icon: <Share2 size={14} />, color: 'var(--info)', bg: 'var(--info-bg)' },
        proposta_impressa:   { icon: <Printer size={14} />, color: 'var(--success-hover)', bg: 'var(--success-bg)' },
        entrega_hoje:        { icon: <Calendar size={14} />, color: 'var(--info)', bg: 'var(--info-bg)' },
        entrega_atrasada:    { icon: <AlertTriangle size={14} />, color: 'var(--danger)', bg: 'var(--danger-bg)' },
    };
    const getNotifStyle = (tipo) => NOTIF_STYLE[tipo] || { icon: <Bell size={14} />, color: 'var(--primary)', bg: 'var(--bg-hover)' };
    const notifBadgeColor = notifs.nao_lidas > 0
        ? (notifs.notificacoes.some(n => !n.lida && (n.tipo === 'financeiro_vencido' || n.tipo === 'pagar_vencido')) ? 'var(--danger)' : 'var(--info)')
        : null;

    // ── Páginas standalone (sem sidebar/topbar) — ex: modos TV ──
    const FULLSCREEN_PAGES = ['producao_tv', 'oficina_tv'];
    if (FULLSCREEN_PAGES.includes(pg)) {
        return (
            <div style={{ width: '100vw', height: '100dvh', overflow: 'hidden' }}>
                <ErrorBoundary>
                    <Suspense fallback={<div style={{ background: '#0E1116', width: '100%', height: '100%' }} />}>
                        {renderPage()}
                    </Suspense>
                </ErrorBoundary>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
            <Sidebar
                sb={sb} setSb={setSb} sidebarHover={sidebarHover} setSidebarHover={setSidebarHover}
                sidebarExpanded={sidebarExpanded} dark={dark} setDark={setDark}
                pg={pg} nav={nav} navToRecord={navToRecord} MENU_GROUPS={VISIBLE_MENU_GROUPS} canSee={canSee}
                collapsed={collapsed} toggleGroup={toggleGroup}
                user={user} logout={logout} logoSistema={logoSistema} empNome={empNome}
                setShowPerfil={setShowPerfil} notifs={notifs} waUnread={waUnread}
                isMobile={isMobile} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
            />

            {/* ═══ Main ═══ */}
            <main className="flex-1 relative overflow-y-auto overflow-x-hidden" aria-label="Conteúdo principal">
                <Topbar
                    isMobile={isMobile} setMobileOpen={setMobileOpen} pg={pg} ALL_MENUS={ALL_MENUS} nav={nav}
                    navToRecord={navToRecord} canGoBack={navDepth > 0} goBack={goBack}
                    buscaRef={buscaRef} buscaQuery={buscaQuery} setBuscaQuery={setBuscaQuery}
                    buscaResults={buscaResults} buscaOpen={buscaOpen} setBuscaOpen={setBuscaOpen}
                    waUnread={waUnread} notifsRef={notifsRef} showNotifs={showNotifs} setShowNotifs={setShowNotifs}
                    notifs={notifs} notifBadgeColor={notifBadgeColor} markAllRead={markAllRead}
                    goToNotif={goToNotif} getNotifStyle={getNotifStyle}
                    dark={dark} setDark={setDark}
                    crumbSub={(() => {
                        if (pg === 'novo' && editOrc?.id) {
                            const orc = orcs.find(o => o.id === editOrc.id);
                            return { label: `#${orc?.numero || editOrc.id}`, hint: orc?.cliente_nome || '' };
                        }
                        if (pg === 'proj' && openProjectId) {
                            const orc = orcs.find(o => o.id === openProjectId);
                            return { label: orc?.ambiente || `Projeto #${openProjectId}`, hint: orc?.cliente_nome || '' };
                        }
                        return null;
                    })()}
                />

                {/* Toast */}
                {notif && (
                    <div className={`fixed top-4 right-4 z-50 ${notifExiting ? 'toast-exit' : 'toast-enter'}`}>
                        <div className="glass-card px-4 py-2.5 flex items-center gap-2 text-sm font-medium" style={{
                            borderColor: 'var(--primary)', color: 'var(--primary)',
                            boxShadow: 'var(--shadow-lg), 0 0 20px rgba(19, 121, 240, 0.1)',
                        }}>
                            <div className="w-1.5 h-1.5 rounded-full status-dot-active" style={{ background: 'var(--primary)' }} />
                            {notif}
                        </div>
                    </div>
                )}

                {/* Page content with transition */}
                <div key={pageKey} className="min-h-full page-enter">
                    <ErrorBoundary>
                        <Suspense fallback={<LazyFallback />}>
                            {renderPage()}
                        </Suspense>
                    </ErrorBoundary>
                </div>
            </main>

            {/* ═══ Mobile Bottom Nav ═══ */}
            {isMobile && (
                <nav className="mobile-bottom-nav no-print" aria-label="Navegação principal">
                    {MOBILE_NAV.map(item => {
                        const active = item.id === 'more' ? false : pg === item.id;
                        const I = item.ic;
                        return (
                            <button
                                key={item.id}
                                onClick={() => item.id === 'more' ? setMobileOpen(true) : nav(item.id)}
                                className={`mobile-bottom-nav-item ${active ? 'mobile-bottom-nav-item-active' : ''}`}
                                aria-label={item.lb}
                                aria-current={active ? 'page' : undefined}
                            >
                                <I size={20} />
                                <span>{item.lb}</span>
                            </button>
                        );
                    })}
                </nav>
            )}

            {/* Command Palette (Ctrl+K) */}
            {cmdOpen && (() => {
                const CMD_RTYPE = {
                    cliente:   { label: 'Cliente',    color: 'var(--info)',    ic: <Ic.Usr size={14} /> },
                    orcamento: { label: 'Orçamento',  color: 'var(--warning)', ic: <Ic.File size={14} /> },
                    projeto:   { label: 'Projeto',    color: 'var(--primary)', ic: <Ic.Briefcase size={14} /> },
                    peca:      { label: 'Peça',       color: 'var(--success)', ic: <Ic.Box size={14} /> },
                    lote_cnc:  { label: 'Lote CNC',  color: 'var(--info)',    ic: <Ic.Layers size={14} /> },
                };
                const getRecordTitle = (r) => {
                    if (r.tipo === 'cliente') return r.nome;
                    if (r.tipo === 'orcamento') return `#${r.numero}${r.cliente_nome ? ` — ${r.cliente_nome}` : ''}`;
                    if (r.tipo === 'projeto') return r.nome || `Projeto #${r.id}`;
                    return r.descricao || `#${r.id}`;
                };

                // Quick create actions (show when no query)
                const quickActions = [
                    { id: 'new-orc', label: 'Novo Orçamento', shortcut: 'N O', color: 'var(--primary)', ic: <Ic.Plus size={14} />, action: () => { nav('novo', null); setCmdOpen(false); setCmdQuery(''); } },
                    { id: 'new-cli', label: 'Novo Cliente', shortcut: 'N C', color: 'var(--success)', ic: <Ic.Plus size={14} />, action: () => { nav('cli'); setCmdOpen(false); setCmdQuery(''); } },
                    { id: 'go-dash', label: 'Dashboard', shortcut: 'G D', color: 'var(--text-muted)', ic: <LayoutDashboard size={14} />, action: () => { nav('dash'); setCmdOpen(false); } },
                    { id: 'go-kb', label: 'Kanban', shortcut: 'G K', color: 'var(--text-muted)', ic: <FolderKanban size={14} />, action: () => { nav('kb'); setCmdOpen(false); } },
                ];

                const filteredPages = ALL_PAGES.filter(p =>
                    !cmdQuery || p.lb.toLowerCase().includes(cmdQuery.toLowerCase()) || p.id.toLowerCase().includes(cmdQuery.toLowerCase())
                ).slice(0, 8);

                // Build flat list of all items for keyboard nav
                const allItems = [
                    ...(cmdQuery.length < 2 ? quickActions.map(a => ({ type: 'action', ...a })) : []),
                    ...(!cmdLoading && cmdResults ? cmdResults.slice(0, 6).map(r => ({ type: 'record', ...r })) : []),
                    ...filteredPages.map(p => ({ type: 'page', ...p })),
                ];

                const handleSelect = (item) => {
                    if (!item) return;
                    if (item.type === 'action') { item.action(); return; }
                    if (item.type === 'record') { navToRecord(item); setCmdOpen(false); setCmdResults(null); setCmdQuery(''); return; }
                    if (item.type === 'page') { nav(item.id); setCmdOpen(false); setCmdResults(null); setCmdQuery(''); }
                };

                const Kbd = ({ children }) => (
                    <kbd style={{
                        fontSize: 9, padding: '2px 5px', borderRadius: 4, lineHeight: 1.4,
                        background: 'var(--bg-muted)', border: '1px solid var(--border-strong)',
                        color: 'var(--text-muted)', fontFamily: 'inherit', display: 'inline-block',
                        letterSpacing: '0.02em',
                    }}>{children}</kbd>
                );

                return (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" onClick={() => { setCmdOpen(false); setCmdResults(null); setCmdQuery(''); }}>
                    <div className="fixed inset-0 modal-overlay" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
                    <div className="relative animate-scale-in" style={{
                        width: '100%', maxWidth: 560,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 14,
                        boxShadow: 'var(--shadow-xl)',
                        overflow: 'hidden',
                    }} onClick={e => e.stopPropagation()}>

                        {/* ─── Input ─────────────────────── */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                            <Search size={16} style={{
                                color: cmdLoading ? 'var(--primary)' : 'var(--text-muted)',
                                flexShrink: 0, transition: 'color 0.2s',
                                animation: cmdLoading ? 'spin 1s linear infinite' : 'none',
                            }} />
                            <input
                                ref={cmdInputRef}
                                type="text"
                                value={cmdQuery}
                                onChange={e => { setCmdQuery(e.target.value); setCmdSel(0); }}
                                placeholder="Buscar ou ir para..."
                                style={{
                                    flex: 1, background: 'none', border: 'none', outline: 'none',
                                    fontSize: 15, color: 'var(--text-primary)', fontFamily: 'inherit',
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'ArrowDown') { e.preventDefault(); setCmdSel(s => Math.min(s + 1, allItems.length - 1)); }
                                    else if (e.key === 'ArrowUp') { e.preventDefault(); setCmdSel(s => Math.max(s - 1, 0)); }
                                    else if (e.key === 'Enter') { e.preventDefault(); handleSelect(allItems[cmdSel]); }
                                }}
                            />
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                <Kbd>↑↓</Kbd>
                                <Kbd>↵</Kbd>
                                <Kbd>ESC</Kbd>
                            </div>
                        </div>

                        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            {/* Quick actions (empty state) */}
                            {cmdQuery.length < 2 && (
                                <div style={{ padding: '6px 8px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', padding: '6px 8px 4px' }}>Ações rápidas</div>
                                    {quickActions.map((a, i) => (
                                        <button key={a.id} onClick={a.action}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                padding: '9px 10px', borderRadius: 8, border: 'none',
                                                background: cmdSel === i ? 'var(--bg-hover)' : 'transparent',
                                                cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                                            }}
                                            onMouseEnter={() => setCmdSel(i)}
                                        >
                                            <span style={{ width: 28, height: 28, borderRadius: 8, background: `${a.color}18`, border: `1px solid ${a.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: a.color }}>{a.ic}</span>
                                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{a.label}</span>
                                            <Kbd>{a.shortcut}</Kbd>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Entity search results */}
                            {cmdQuery.length >= 2 && (
                                <div style={{ borderBottom: !filteredPages.length ? 'none' : '1px solid var(--border)', padding: '6px 8px' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', padding: '6px 8px 4px' }}>
                                        {cmdLoading ? 'Buscando...' : cmdResults?.length ? 'Registros' : 'Nenhum registro'}
                                    </div>
                                    {!cmdLoading && cmdResults?.map((r, ri) => {
                                        const rt = CMD_RTYPE[r.tipo] || { label: r.tipo, color: 'var(--text-muted)', ic: <Search size={14} /> };
                                        const idx = quickActions.length + ri;
                                        return (
                                            <button key={`${r.tipo}-${r.id}`}
                                                onClick={() => { navToRecord(r); setCmdOpen(false); setCmdResults(null); setCmdQuery(''); }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                    padding: '9px 10px', borderRadius: 8, border: 'none',
                                                    background: cmdSel === idx ? 'var(--bg-hover)' : 'transparent',
                                                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                                                }}
                                                onMouseEnter={() => setCmdSel(idx)}
                                            >
                                                <span style={{ width: 28, height: 28, borderRadius: 8, background: `${rt.color}18`, border: `1px solid ${rt.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: rt.color }}>{rt.ic}</span>
                                                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getRecordTitle(r)}</span>
                                                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${rt.color}14`, color: rt.color, flexShrink: 0, border: `1px solid ${rt.color}28` }}>{rt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Pages */}
                            {filteredPages.length > 0 && (
                                <div style={{ padding: '6px 8px', borderTop: cmdQuery.length >= 2 ? '1px solid var(--border)' : 'none' }}>
                                    {cmdQuery.length >= 2 && (
                                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', padding: '6px 8px 4px' }}>Ir para</div>
                                    )}
                                    {filteredPages.map((p, pi) => {
                                        const I = p.ic;
                                        const active = pg === p.id;
                                        const baseOffset = cmdQuery.length < 2 ? quickActions.length : (cmdResults?.length || 0);
                                        const idx = baseOffset + pi;
                                        return (
                                            <button key={p.id} onClick={() => { nav(p.id); setCmdOpen(false); setCmdResults(null); setCmdQuery(''); }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                                    padding: '9px 10px', borderRadius: 8, border: 'none',
                                                    background: cmdSel === idx ? 'var(--bg-hover)' : active ? 'var(--bg-muted)' : 'transparent',
                                                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                                                }}
                                                onMouseEnter={() => setCmdSel(idx)}
                                            >
                                                <span style={{ width: 28, height: 28, borderRadius: 8, background: active ? 'var(--primary-alpha)' : 'var(--bg-muted)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: active ? 'var(--primary)' : 'var(--text-muted)' }}><I /></span>
                                                <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--primary)' : 'var(--text-primary)' }}>{p.lb}</span>
                                                {active && <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 4, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>atual</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ─── Footer hint ─────────────────── */}
                        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-muted)' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pressione <Kbd>?</Kbd> para ver todos os atalhos</span>
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                                <Kbd>G</Kbd> + letra para navegar direto
                            </span>
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* Keyboard Shortcuts Modal */}
            {shortcutsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShortcutsOpen(false)}>
                    <div className="fixed inset-0 modal-overlay" style={{ background: 'rgba(0,0,0,0.4)' }} />
                    <div className="relative animate-scale-in" style={{
                        width: '100%', maxWidth: 440, background: 'var(--bg-card)',
                        border: '1px solid var(--border)', borderRadius: 16,
                        boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
                        backdropFilter: 'blur(20px)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Atalhos de Teclado</span>
                            <kbd style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>ESC</kbd>
                        </div>
                        <div style={{ padding: '12px 20px' }}>
                            {[
                                { section: 'Geral', items: [
                                    { keys: ['Ctrl', 'K'], desc: 'Busca global' },
                                    { keys: ['/'], desc: 'Busca global' },
                                    { keys: ['?'], desc: 'Mostrar atalhos' },
                                    { keys: ['Esc'], desc: 'Fechar modal/painel' },
                                ]},
                                { section: 'Navegacao', items: [
                                    { keys: ['G', 'D'], desc: 'Ir para Dashboard' },
                                    { keys: ['G', 'O'], desc: 'Ir para Orcamentos' },
                                    { keys: ['G', 'P'], desc: 'Ir para Projetos' },
                                    { keys: ['G', 'C'], desc: 'Ir para Clientes' },
                                    { keys: ['G', 'F'], desc: 'Ir para Financeiro' },
                                    { keys: ['G', 'E'], desc: 'Ir para Estoque' },
                                ]},
                            ].map(group => (
                                <div key={group.section} style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>{group.section}</div>
                                    {group.items.map((item, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.desc}</span>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {item.keys.map((k, j) => (
                                                    <span key={j}>
                                                        <kbd style={{
                                                            fontSize: 11, padding: '2px 7px', borderRadius: 5,
                                                            background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                                            color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'inherit',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                                                        }}>{k}</kbd>
                                                        {j < item.keys.length - 1 && <span style={{ margin: '0 2px', fontSize: 10, color: 'var(--text-muted)' }}>+</span>}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4, textAlign: 'center' }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pressione <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>G</kbd> e depois a letra para navegar</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Perfil */}
            {showPerfil && <PerfilModal user={user} onClose={() => setShowPerfil(false)} notify={notify} updateUser={updateUser} />}

            {/* Onboarding Wizard — primeira vez */}
            {showOnboarding && (
                <OnboardingWizard
                    onClose={() => setShowOnboarding(false)}
                    notify={notify}
                    taxas={taxas}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// PerfilModal
// ═══════════════════════════════════════════════════════
function PerfilModal({ user, onClose, notify, updateUser }) {
    const [nome, setNome] = useState(user.nome || '');
    const [email, setEmail] = useState(user.email || '');
    const [saving, setSaving] = useState(false);
    const [senhaAtual, setSenhaAtual] = useState('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [savingSenha, setSavingSenha] = useState(false);
    const [err, setErr] = useState('');
    const [errSenha, setErrSenha] = useState('');

    const handleSavePerfil = async () => {
        setErr('');
        if (!nome.trim() || !email.trim()) { setErr('Nome e email obrigatorios'); return; }
        setSaving(true);
        try {
            const updated = await api.put('/auth/perfil', { nome: nome.trim(), email: email.trim() });
            updateUser(updated);
            notify('Perfil atualizado');
        } catch (ex) {
            setErr(ex.error || 'Erro ao salvar');
        } finally { setSaving(false); }
    };

    const handleSaveSenha = async () => {
        setErrSenha('');
        if (!senhaAtual || !novaSenha) { setErrSenha('Preencha todos os campos'); return; }
        if (novaSenha.length < 6) { setErrSenha('Nova senha deve ter no minimo 6 caracteres'); return; }
        if (novaSenha !== confirmar) { setErrSenha('As senhas nao coincidem'); return; }
        setSavingSenha(true);
        try {
            await api.put('/auth/password', { senhaAtual, novaSenha });
            setSenhaAtual(''); setNovaSenha(''); setConfirmar('');
            notify('Senha alterada com sucesso');
        } catch (ex) {
            setErrSenha(ex.error || 'Erro ao alterar senha');
        } finally { setSavingSenha(false); }
    };

    const inputStyle = {
        width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
        border: '1.5px solid var(--border)', background: 'var(--bg-body)',
        color: 'var(--text-primary)', outline: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
    };
    const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };

    return (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
            <div className="modal-content" style={{
                position: 'relative', width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto',
                background: 'var(--bg-card)', borderRadius: 18, boxShadow: 'var(--shadow-xl)',
                border: '1px solid var(--border)', margin: 16,
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="relative">
                            <div style={{
                                width: 42, height: 42, borderRadius: '50%', background: 'var(--primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 16, fontWeight: 800,
                                boxShadow: '0 1px 3px rgba(0,0,0,.22)',
                            }}>{user.nome?.[0]?.toUpperCase()}</div>
                            <span className="status-online" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Meu Perfil</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role}</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Ic.X />
                    </button>
                </div>

                {/* Dados pessoais */}
                <div style={{ padding: '20px 24px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Ic.Edit /> Dados Pessoais
                    </div>

                    {err && (
                        <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 600, background: 'rgba(220,38,38,0.08)', color: 'var(--danger)', border: '1px solid rgba(220,38,38,0.15)' }}>
                            {err}
                        </div>
                    )}

                    <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>Nome</label>
                        <input value={nome} onChange={e => setNome(e.target.value)} style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-ring)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Email</label>
                        <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-ring)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                    </div>
                    <button onClick={handleSavePerfil} disabled={saving}
                        className={`${Z.btn} w-full py-2.5 text-sm`}>
                        {saving ? 'Salvando...' : 'Salvar Dados'}
                    </button>
                </div>

                <div style={{ height: 1, background: 'var(--border)', margin: '0 24px' }} />

                {/* Alterar senha */}
                <div style={{ padding: '20px 24px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Ic.Lock /> Alterar Senha
                    </div>

                    {errSenha && (
                        <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 600, background: 'rgba(220,38,38,0.08)', color: 'var(--danger)', border: '1px solid rgba(220,38,38,0.15)' }}>
                            {errSenha}
                        </div>
                    )}

                    <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>Senha Atual</label>
                        <input value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} type="password" style={inputStyle} placeholder="Digite sua senha atual"
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-ring)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>Nova Senha</label>
                        <input value={novaSenha} onChange={e => setNovaSenha(e.target.value)} type="password" style={inputStyle} placeholder="Minimo 6 caracteres"
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-ring)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Confirmar Nova Senha</label>
                        <input value={confirmar} onChange={e => setConfirmar(e.target.value)} type="password" style={inputStyle} placeholder="Repita a nova senha"
                            onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-ring)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                    </div>
                    <button onClick={handleSaveSenha} disabled={savingSenha}
                        className="btn-secondary w-full" style={{ padding: '10px 0', fontSize: 14, fontWeight: 600 }}>
                        {savingSenha ? 'Alterando...' : 'Alterar Senha'}
                    </button>
                </div>
            </div>
        </div>
    );
}
