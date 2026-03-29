import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useAuth } from './auth';
import api from './api';
import { Ic, Z, Skeleton } from './ui';
import { applyPrimaryColor } from './theme';
import { AlertTriangle, Clock, CheckCircle2, Folder, BarChart2, AlertCircle, DollarSign, Calendar, Bell, MessageCircle, Camera, Gift, FileText, ClipboardList, Eye, Search, RefreshCw, Share2, Printer, ChevronDown, LayoutDashboard, Users as UsersIcon, FileSpreadsheet, Wallet, FolderKanban, Settings } from 'lucide-react';
import LoginPage from './pages/Login';
import Dash from './pages/Dash';

// ── Code splitting: lazy load de paginas pesadas ──────────────────────────
const Cli = lazy(() => import('./pages/Cli'));
const Cat = lazy(() => import('./pages/Cat'));
const Orcs = lazy(() => import('./pages/Orcs'));
const Novo = lazy(() => import('./pages/Novo'));
const Kb = lazy(() => import('./pages/Kb'));
const Cfg = lazy(() => import('./pages/Cfg'));
const Users = lazy(() => import('./pages/Users'));
const Projetos = lazy(() => import('./pages/Projetos'));
const Estoque = lazy(() => import('./pages/Estoque'));
const ItemBuilder = lazy(() => import('./pages/ItemBuilder'));
const Mensagens = lazy(() => import('./pages/Mensagens'));
const AssistenteIA = lazy(() => import('./pages/AssistenteIA'));
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
    componentDidCatch(error, info) { console.error('ErrorBoundary:', error, info.componentStack); }
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
    const VALID_PAGES = ['dash','cli','cat','catalogo_itens','orcs','novo','kb','proj','estoque','financeiro','whatsapp','assistente','relatorios','industrializacao','cnc','producao_fabrica','expedicao','cfg','users','plano_corte','compras','gestao','producao_tv','produtividade'];
    const [pg, setPg] = useState(() => {
        const rawPath = window.location.pathname.replace(/^\/+/, '');
        const parts = rawPath.split('/');
        const pathPage = parts[0] || '';
        if (pathPage && VALID_PAGES.includes(pathPage)) {
            localStorage.setItem('erp_page', pathPage);
            return pathPage;
        }
        return localStorage.getItem('erp_page') || 'dash';
    });
    const [sb, setSb] = useState(true);
    const [sidebarHover, setSidebarHover] = useState(false);
    const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
    const [notif, setNotif] = useState(null);
    const [clis, setClis] = useState([]);
    const [orcs, setOrcs] = useState([]);
    const [taxas, setTaxas] = useState({ imp: 8, com: 10, mont: 12, lucro: 20, frete: 2, mdo: 350, inst: 180 });
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

    // Estado de colapso dos grupos do menu (default: tudo colapsado)
    const [collapsed, setCollapsed] = useState(() => {
        const stored = localStorage.getItem('menu_collapsed');
        if (stored) try { return JSON.parse(stored); } catch {}
        // Primeira vez: colapsa todos os grupos (exceto top/projetos_hub que não têm label)
        return { comercial: true, producao: true, cadastros: true, gestao: true, sistema: true };
    });
    // Command palette (Ctrl+K)
    const [cmdOpen, setCmdOpen] = useState(false);
    const [cmdQuery, setCmdQuery] = useState('');
    const cmdInputRef = useRef(null);

    // Ctrl+K command palette
    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setCmdOpen(v => !v);
                setCmdQuery('');
            }
            if (e.key === 'Escape' && cmdOpen) {
                setCmdOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [cmdOpen]);

    // Focus command palette input when opened
    useEffect(() => {
        if (cmdOpen && cmdInputRef.current) cmdInputRef.current.focus();
    }, [cmdOpen]);

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
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);

    const notify = (m) => { setNotif(m); setTimeout(() => setNotif(null), 3500); };

    const loadClis = useCallback(() => { if (user) api.get('/clientes').then(setClis).catch(err => console.warn('loadClis:', err)); }, [user]);
    const loadOrcs = useCallback(() => { if (user) api.get('/orcamentos').then(setOrcs).catch(err => console.warn('loadOrcs:', err)); }, [user]);
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
        }).catch(err => console.warn('loadEmpresa:', err));
    }, [user]);

    useEffect(() => { loadClis(); loadOrcs(); loadTaxas(); loadNotifs(); loadWaUnread(); loadEmpresa(); }, [loadClis, loadOrcs, loadTaxas, loadNotifs, loadWaUnread, loadEmpresa]);

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
        if (p === "novo" && orc !== undefined) setEditOrc(orc);
        else if (p !== "novo") setEditOrc(null);
        setPg(p);
        setPageKey(k => k + 1); // trigger page transition
        localStorage.setItem('erp_page', p);
        let url = p === 'dash' ? '/' : `/${p}`;
        if (p === 'novo' && orc?.id) url = `/novo/${orc.id}`;
        window.history.pushState({ page: p, orcId: orc?.id || null }, '', url);
        if (isMobile) setMobileOpen(false);
    };

    useEffect(() => {
        let initUrl = pg === 'dash' ? '/' : `/${pg}`;
        if (pg === 'novo' && editOrc?.id) initUrl = `/novo/${editOrc.id}`;
        window.history.replaceState({ page: pg, orcId: editOrc?.id || null }, '', initUrl);

        const handlePopState = (e) => {
            const page = e.state?.page || 'dash';
            const orcId = e.state?.orcId;
            setPg(page);
            setPageKey(k => k + 1);
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
                    width: 48, height: 48, borderRadius: 16,
                    background: 'var(--primary-gradient)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'pulse-glow 2s ease-in-out infinite',
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
        { id: "whatsapp", lb: "WhatsApp", ic: Ic.WhatsApp },
        { id: "assistente", lb: "Assistente IA", ic: Ic.Sparkles },
        { id: "relatorios", lb: "Relatorios", ic: Ic.PieChart },
        { id: "industrializacao", lb: "Ordens de Producao", ic: Ic.ClipList },
        { id: "cnc", lb: "Corte & CNC", ic: Ic.Scissors },
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
        { id: 'projetos_hub', items: [{ id: "proj", lb: "Projetos", ic: Ic.Briefcase }] },
        { id: 'comercial', label: 'Comercial', icon: Ic.Handshake, items: [
            { id: "cli", lb: "Clientes", ic: Ic.Usr },
            { id: "orcs", lb: "Orçamentos", ic: Ic.File },
            { id: "whatsapp", lb: "WhatsApp", ic: Ic.WhatsApp },
        ]},
        { id: 'producao', label: 'Produção', icon: Ic.Factory, items: [
            { id: "industrializacao", lb: "Ordens", ic: Ic.ClipList },
            { id: "cnc", lb: "Corte & CNC", ic: Ic.Scissors },
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
            { id: "gestao", lb: "Gestão Avançada", ic: Ic.BarChart },
            { id: "relatorios", lb: "Relatórios", ic: Ic.PieChart },
        ]},
        { id: 'sistema', label: 'Sistema', icon: Ic.Cog, items: [
            { id: "assistente", lb: "Assistente IA", ic: Ic.Sparkles },
            { id: "cfg", lb: "Configurações", ic: Ic.Gear },
            ...(isAdmin ? [{ id: "users", lb: "Usuários", ic: Ic.Users }] : []),
        ]},
    ];

    // Todas as páginas (para command palette Ctrl+K) — inclui as que saíram do sidebar
    const ALL_PAGES = [
        { id: "dash", lb: "Dashboard", ic: Ic.Dash },
        { id: "proj", lb: "Projetos", ic: Ic.Briefcase },
        { id: "cli", lb: "Clientes", ic: Ic.Usr },
        { id: "orcs", lb: "Orçamentos", ic: Ic.File },
        { id: "kb", lb: "Pipeline CRM", ic: Ic.Kb },
        { id: "whatsapp", lb: "WhatsApp", ic: Ic.WhatsApp },
        { id: "industrializacao", lb: "Ordens de Produção", ic: Ic.ClipList },
        { id: "cnc", lb: "Corte & CNC", ic: Ic.Scissors },
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
        { id: "cfg", lb: "Configurações", ic: Ic.Gear },
        ...(isAdmin ? [{ id: "users", lb: "Usuários", ic: Ic.Users }] : []),
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
            case "cat": return <Cat />;
            case "orcs": return <Orcs orcs={orcs} nav={nav} reload={loadOrcs} notify={notify} />;
            case "novo": return <Novo clis={clis} taxas={taxas} editOrc={editOrc} nav={nav} reload={reload} notify={notify} />;
            case "kb": return <Kb orcs={orcs} reload={loadOrcs} notify={notify} nav={nav} />;
            case "proj": return <Projetos orcs={orcs} notify={notify} user={user} openProjectId={openProjectId} onProjectOpened={() => setOpenProjectId(null)} nav={nav} />;
            case "estoque": return <Estoque notify={notify} />;
            case "financeiro": return <Financeiro notify={notify} user={user} nav={nav} />;
            case "whatsapp": return <Mensagens notify={notify} />;
            case "assistente": return <AssistenteIA notify={notify} />;
            case "catalogo_itens": return <ItemBuilder notify={notify} />;
            case "relatorios": return <Relatorios notify={notify} />;
            case "plano_corte": return <PlanoCorte notify={notify} />;
            case "cnc": return <ProducaoCNC notify={notify} />;
            case "cfg": return <Cfg taxas={taxas} reload={loadTaxas} notify={notify} />;
            case "users": return isAdmin ? <Users notify={notify} meUser={user} /> : <Dash nav={nav} notify={notify} />;
            case "industrializacao": return <Industrializacao notify={notify} nav={nav} />;
            case "producao_fabrica": return <ProducaoFabrica notify={notify} user={user} />;
            case "expedicao": return <Expedicao notify={notify} user={user} />;
            case "compras": return <Compras notify={notify} />;
            case "gestao": return <GestaoAvancada notify={notify} />;
            case "producao_tv": return <ProducaoTV />;
            case "produtividade": return <Produtividade notify={notify} />;
            default: return <Dash nav={nav} notify={notify} />;
        }
    };

    // Notificacao tipo -> icone + cor
    const NOTIF_STYLE = {
        financeiro_vencido:  { icon: <AlertTriangle size={14} />, color: '#ef4444', bg: '#fef2f2' },
        financeiro_proximo:  { icon: <Clock size={14} />, color: '#f59e0b', bg: '#fffbeb' },
        orcamento_aprovado:  { icon: <CheckCircle2 size={14} />, color: '#22c55e', bg: '#f0fdf4' },
        projeto_criado:      { icon: <Folder size={14} />, color: '#3b82f6', bg: '#eff6ff' },
        projeto_status:      { icon: <BarChart2 size={14} />, color: '#8b5cf6', bg: '#f5f3ff' },
        estoque_baixo:       { icon: <AlertCircle size={14} />, color: '#f97316', bg: '#fff7ed' },
        pagar_vencido:       { icon: <AlertTriangle size={14} />, color: '#ef4444', bg: '#fef2f2' },
        pagar_proximo:       { icon: <DollarSign size={14} />, color: '#f59e0b', bg: '#fffbeb' },
        recorrencia_gerada:  { icon: <Calendar size={14} />, color: '#8b5cf6', bg: '#f5f3ff' },
        portal_mensagem:     { icon: <MessageCircle size={14} />, color: '#3b82f6', bg: '#eff6ff' },
        montador_foto:       { icon: <Camera size={14} />, color: '#8b5cf6', bg: '#f5f3ff' },
        orcamento_parado:    { icon: <FileText size={14} />, color: '#f97316', bg: '#fff7ed' },
        etapa_atrasada:      { icon: <ClipboardList size={14} />, color: '#ef4444', bg: '#fef2f2' },
        cliente_aniversario: { icon: <Gift size={14} />, color: '#ec4899', bg: '#fdf2f8' },
        proposta_visualizada:{ icon: <Eye size={14} />, color: '#6366f1', bg: '#eef2ff' },
        portal_visualizado:  { icon: <Eye size={14} />, color: '#0ea5e9', bg: '#f0f9ff' },
        proposta_retorno:    { icon: <RefreshCw size={14} />, color: '#f97316', bg: '#fff7ed' },
        proposta_compartilhada: { icon: <Share2 size={14} />, color: '#8b5cf6', bg: '#f5f3ff' },
        proposta_impressa:   { icon: <Printer size={14} />, color: '#16a34a', bg: '#f0fdf4' },
        entrega_hoje:        { icon: <Calendar size={14} />, color: '#3b82f6', bg: '#eff6ff' },
        entrega_atrasada:    { icon: <AlertTriangle size={14} />, color: '#ef4444', bg: '#fef2f2' },
    };
    const getNotifStyle = (tipo) => NOTIF_STYLE[tipo] || { icon: <Bell size={14} />, color: 'var(--primary)', bg: 'var(--bg-hover)' };
    const notifBadgeColor = notifs.nao_lidas > 0
        ? (notifs.notificacoes.some(n => !n.lida && (n.tipo === 'financeiro_vencido' || n.tipo === 'pagar_vencido')) ? '#ef4444' : '#3b82f6')
        : null;

    return (
        <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
            {/* Backdrop mobile */}
            {isMobile && mobileOpen && (
                <div className="fixed inset-0 z-30 transition-opacity modal-overlay" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setMobileOpen(false)} />
            )}

            {/* ═══ Sidebar ═══ */}
            {!isMobile && (
                <aside
                    onMouseEnter={() => { if (!sb) setSidebarHover(true); }}
                    onMouseLeave={() => setSidebarHover(false)}
                    className="relative z-20 shrink-0 flex flex-col"
                    style={{
                        background: 'var(--bg-sidebar)',
                        borderRight: '1px solid var(--border)',
                        width: sidebarExpanded ? 'var(--sidebar-width)' : 'var(--sidebar-compact)',
                        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        overflow: 'hidden',
                    }}>

                    {/* Logo */}
                    <div className="flex items-center gap-2.5 px-3 min-h-[56px]" style={{ borderBottom: '1px solid var(--border)' }}>
                        <button onClick={() => setSb(!sb)} className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                            <Ic.Menu />
                        </button>
                        {sidebarExpanded && (
                            <div className="flex items-center overflow-hidden min-w-0 animate-fade-in" style={{ whiteSpace: 'nowrap' }}>
                                {logoSistema
                                    ? <img src={logoSistema} alt="Logo" style={{ height: 28, maxWidth: 140, objectFit: 'contain' }} />
                                    : <span className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{empNome}</span>
                                }
                            </div>
                        )}
                    </div>

                    {/* Nav Items */}
                    <nav className="flex-1 overflow-y-auto py-2 px-2" style={{ scrollbarWidth: 'thin' }}>
                        {MENU_GROUPS.map(g => {
                            const visibleItems = g.items.filter(m => canSee(m.id));
                            if (visibleItems.length === 0) return null;
                            const isTop = g.id === 'top';
                            const isOpen = !collapsed[g.id];

                            const vencidasReceberCount = notifs.notificacoes.filter(n => !n.lida && n.tipo === 'financeiro_vencido').length;
                            const vencidasPagarCount = notifs.notificacoes.filter(n => !n.lida && n.tipo === 'pagar_vencido').length;
                            const getBadge = (id) => {
                                if (id === 'whatsapp' && waUnread > 0) return { num: waUnread, bg: '#22c55e' };
                                if (id === 'financeiro' && vencidasPagarCount > 0) return { num: vencidasPagarCount, bg: '#ef4444' };
                                if (id === 'proj' && vencidasReceberCount > 0) return { num: vencidasReceberCount, bg: '#ef4444' };
                                return null;
                            };

                            return (
                                <div key={g.id} style={{ marginBottom: isTop ? 4 : 0 }}>
                                    {/* Group label */}
                                    {!isTop && sidebarExpanded && (
                                        <button onClick={() => toggleGroup(g.id)} style={{
                                            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                            padding: '8px 10px 4px', background: 'none', border: 'none', cursor: 'pointer',
                                        }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', flex: 1, textAlign: 'left' }}>
                                                {g.label}
                                            </span>
                                            <ChevronDown size={12} style={{
                                                color: 'var(--text-muted)', transition: 'transform .2s',
                                                transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                            }} />
                                        </button>
                                    )}
                                    {!isTop && !sidebarExpanded && (
                                        <div style={{ height: 1, background: 'var(--border)', margin: '6px 8px' }} />
                                    )}

                                    {/* Items */}
                                    <div style={{
                                        overflow: 'hidden', transition: 'max-height .25s ease',
                                        maxHeight: (isTop || isOpen || !sidebarExpanded) ? 500 : 0,
                                    }}>
                                        <div className="space-y-0.5" style={{ paddingTop: isTop ? 0 : 2 }}>
                                            {visibleItems.map(m => {
                                                const active = pg === m.id;
                                                const I = m.ic;
                                                const badge = !active ? getBadge(m.id) : null;
                                                return (
                                                    <button key={m.id} onClick={() => nav(m.id)}
                                                        className={`sidebar-item w-full flex items-center gap-2.5 px-2.5 py-2 cursor-pointer group
                                                            ${active ? 'sidebar-item-active font-semibold' : ''}`}
                                                        style={!active ? { color: 'var(--text-secondary)' } : undefined}>
                                                        <span className="shrink-0 relative" style={{ width: 18, display: 'flex', justifyContent: 'center' }}>
                                                            <I />
                                                            {badge && !sidebarExpanded && (
                                                                <span style={{
                                                                    position: 'absolute', top: -3, right: -4,
                                                                    width: 8, height: 8, borderRadius: '50%',
                                                                    background: badge.bg, border: '2px solid var(--bg-sidebar)',
                                                                }} />
                                                            )}
                                                        </span>
                                                        {sidebarExpanded && (
                                                            <span className="text-[13px] flex-1 text-left whitespace-nowrap">{m.lb}</span>
                                                        )}
                                                        {sidebarExpanded && badge && (
                                                            <span className="badge-pulse" style={{
                                                                fontSize: 10, fontWeight: 700, background: badge.bg, color: '#fff',
                                                                padding: '1px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center',
                                                            }}>{badge.num}</span>
                                                        )}
                                                        {/* Tooltip when compact */}
                                                        {!sidebarExpanded && (
                                                            <span className="sidebar-tooltip">{m.lb}</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </nav>

                    {/* Footer */}
                    <div className="px-2 py-2 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
                        <button onClick={() => setDark(!dark)} className="sidebar-item w-full flex items-center gap-2.5 px-2.5 py-2 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                            {dark ? <Ic.Sun /> : <Ic.Moon />}
                            {sidebarExpanded && <span className="text-xs whitespace-nowrap">{dark ? 'Modo Claro' : 'Modo Escuro'}</span>}
                            {!sidebarExpanded && <span className="sidebar-tooltip">{dark ? 'Modo Claro' : 'Modo Escuro'}</span>}
                        </button>

                        {sidebarExpanded ? (
                            <div className="flex items-center gap-2.5 px-2.5 py-2">
                                <div onClick={() => setShowPerfil(true)} className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--bg-hover)]">
                                    <div className="relative shrink-0">
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--primary-gradient)' }}>
                                            {user.nome?.[0]?.toUpperCase()}
                                        </div>
                                        <span className="status-online" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.nome}</div>
                                        <div className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>{user.role}</div>
                                    </div>
                                </div>
                                <button onClick={logout} className="p-1 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Sair">
                                    <Ic.Logout />
                                </button>
                            </div>
                        ) : (
                            <button onClick={logout} className="sidebar-item w-full flex justify-center p-2 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                <Ic.Logout />
                                <span className="sidebar-tooltip">Sair</span>
                            </button>
                        )}
                    </div>
                </aside>
            )}

            {/* ═══ Mobile Sidebar (overlay) ═══ */}
            {isMobile && mobileOpen && (
                <aside className="fixed inset-y-0 left-0 z-40 w-64 flex flex-col animate-slide-left" style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2.5 px-3 min-h-[56px]" style={{ borderBottom: '1px solid var(--border)' }}>
                        <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                            <Ic.X />
                        </button>
                        <div className="flex items-center overflow-hidden min-w-0">
                            {logoSistema
                                ? <img src={logoSistema} alt="Logo" style={{ height: 28, maxWidth: 140, objectFit: 'contain' }} />
                                : <span className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{empNome}</span>
                            }
                        </div>
                    </div>
                    <nav className="flex-1 overflow-y-auto py-2 px-2">
                        {MENU_GROUPS.map(g => {
                            const visibleItems = g.items.filter(m => canSee(m.id));
                            if (visibleItems.length === 0) return null;
                            const isTop = g.id === 'top';
                            const isOpen = !collapsed[g.id];
                            const vencidasPagarCount = notifs.notificacoes.filter(n => !n.lida && n.tipo === 'pagar_vencido').length;
                            const getBadge = (id) => {
                                if (id === 'whatsapp' && waUnread > 0) return { num: waUnread, bg: '#22c55e' };
                                if (id === 'financeiro' && vencidasPagarCount > 0) return { num: vencidasPagarCount, bg: '#ef4444' };
                                return null;
                            };
                            return (
                                <div key={g.id} style={{ marginBottom: isTop ? 4 : 0 }}>
                                    {!isTop && (
                                        <button onClick={() => toggleGroup(g.id)} style={{
                                            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                            padding: '8px 10px 4px', background: 'none', border: 'none', cursor: 'pointer',
                                        }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', flex: 1, textAlign: 'left' }}>{g.label}</span>
                                            <ChevronDown size={12} style={{ color: 'var(--text-muted)', transition: 'transform .2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                                        </button>
                                    )}
                                    <div style={{ overflow: 'hidden', transition: 'max-height .25s ease', maxHeight: (isTop || isOpen) ? 500 : 0 }}>
                                        <div className="space-y-0.5" style={{ paddingTop: isTop ? 0 : 2 }}>
                                            {visibleItems.map(m => {
                                                const active = pg === m.id;
                                                const I = m.ic;
                                                const badge = !active ? getBadge(m.id) : null;
                                                return (
                                                    <button key={m.id} onClick={() => nav(m.id)}
                                                        className={`sidebar-item w-full flex items-center gap-2.5 px-2.5 py-2.5 cursor-pointer ${active ? 'sidebar-item-active font-semibold' : ''}`}
                                                        style={!active ? { color: 'var(--text-secondary)' } : undefined}>
                                                        <span className="shrink-0"><I /></span>
                                                        <span className="text-[13px] flex-1 text-left whitespace-nowrap">{m.lb}</span>
                                                        {badge && (
                                                            <span className="badge-pulse" style={{ fontSize: 10, fontWeight: 700, background: badge.bg, color: '#fff', padding: '1px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center' }}>{badge.num}</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </nav>
                    <div className="px-2 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                        <button onClick={() => setDark(!dark)} className="sidebar-item w-full flex items-center gap-2.5 px-2.5 py-2 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                            {dark ? <Ic.Sun /> : <Ic.Moon />}
                            <span className="text-xs">{dark ? 'Modo Claro' : 'Modo Escuro'}</span>
                        </button>
                        <div className="flex items-center gap-2.5 px-2.5 py-2 mt-1">
                            <div className="relative shrink-0">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--primary-gradient)' }}>
                                    {user.nome?.[0]?.toUpperCase()}
                                </div>
                                <span className="status-online" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.nome}</div>
                            </div>
                            <button onClick={logout} className="p-1 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                                <Ic.Logout />
                            </button>
                        </div>
                    </div>
                </aside>
            )}

            {/* ═══ Main ═══ */}
            <main className="flex-1 relative overflow-y-auto overflow-x-hidden">
                {/* Top bar */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-3 md:px-6 h-[56px] no-print"
                    style={{
                        background: 'var(--glass-bg)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        borderBottom: '1px solid var(--border)',
                    }}>
                    <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {isMobile && (
                            <button onClick={() => setMobileOpen(true)} className="p-1.5 mr-1 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                                <Ic.Menu />
                            </button>
                        )}
                        <span className="hidden md:inline"><Ic.Home /></span>
                        <span className="hidden md:inline" style={{ opacity: 0.4 }}>/</span>
                        <span style={{ color: 'var(--text-primary)' }} className="font-medium truncate">{[...ALL_MENUS, { id: "novo", lb: "Novo Orcamento" }, { id: "users", lb: "Usuarios" }].find(m => m.id === pg)?.lb || 'Home'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Busca Global */}
                    <div ref={buscaRef} style={{ position: 'relative' }} className="hidden md:block">
                        <div style={{ position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                value={buscaQuery}
                                onChange={e => setBuscaQuery(e.target.value)}
                                onFocus={() => buscaResults && setBuscaOpen(true)}
                                placeholder="Buscar... (Ctrl+K navegar)"
                                style={{
                                    width: 260, padding: '7px 12px 7px 32px', borderRadius: 10,
                                    border: '1px solid var(--border)', background: 'var(--bg-muted)',
                                    fontSize: 12, color: 'var(--text-primary)', outline: 'none',
                                    transition: 'all 0.2s',
                                }}
                                onFocusCapture={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-ring)'; }}
                                onBlurCapture={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                            />
                        </div>
                        {buscaOpen && buscaResults && (
                            <div className="animate-scale-in" style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                width: 380, maxHeight: 420, overflowY: 'auto',
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 14, boxShadow: 'var(--shadow-xl)', zIndex: 50, padding: 8,
                            }}>
                                {buscaResults.clientes.length === 0 && buscaResults.orcamentos.length === 0 && buscaResults.projetos.length === 0 && (
                                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum resultado</div>
                                )}
                                {buscaResults.clientes.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 8px', letterSpacing: '0.05em' }}>Clientes</div>
                                        {buscaResults.clientes.map(c => (
                                            <button key={`c${c.id}`} onClick={() => { nav('cli'); setBuscaOpen(false); setBuscaQuery(''); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)', transition: 'background 0.15s' }}
                                                className="hover:bg-[var(--bg-hover)]">
                                                <Ic.Usr style={{ flexShrink: 0, color: 'var(--text-muted)' }} size={14} />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.tel || c.email || c.cidade || ''}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </>
                                )}
                                {buscaResults.orcamentos.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 8px', letterSpacing: '0.05em', marginTop: 4 }}>Orcamentos</div>
                                        {buscaResults.orcamentos.map(o => (
                                            <button key={`o${o.id}`} onClick={() => { nav('orcs'); setBuscaOpen(false); setBuscaQuery(''); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)', transition: 'background 0.15s' }}
                                                className="hover:bg-[var(--bg-hover)]">
                                                <Ic.File style={{ flexShrink: 0, color: 'var(--text-muted)' }} size={14} />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600 }}>#{o.numero} — {o.cliente_nome}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.ambiente || ''}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </>
                                )}
                                {buscaResults.projetos.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 8px', letterSpacing: '0.05em', marginTop: 4 }}>Projetos</div>
                                        {buscaResults.projetos.map(p => (
                                            <button key={`p${p.id}`} onClick={() => { nav('proj'); setBuscaOpen(false); setBuscaQuery(''); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)', transition: 'background 0.15s' }}
                                                className="hover:bg-[var(--bg-hover)]">
                                                <Ic.Briefcase style={{ flexShrink: 0, color: 'var(--text-muted)' }} size={14} />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600 }}>{p.nome}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.cliente_nome || ''}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    {/* WhatsApp Badge */}
                    {waUnread > 0 && (
                        <button
                            onClick={() => nav('whatsapp')}
                            style={{
                                position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                                padding: 8, borderRadius: 10, transition: 'background 0.15s', color: '#22c55e',
                            }}
                            className="hover:bg-[var(--bg-hover)]"
                            title={`${waUnread} mensagem(ns) nao lida(s)`}
                        >
                            <Ic.WhatsApp />
                            <span className="badge-pulse" style={{
                                position: 'absolute', top: 4, right: 4,
                                width: 16, height: 16, borderRadius: '50%',
                                background: '#22c55e', color: '#fff',
                                fontSize: 9, fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid var(--bg-body)',
                            }}>{waUnread}</span>
                        </button>
                    )}
                    {/* Notificacoes */}
                    <div ref={notifsRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowNotifs(!showNotifs)}
                            style={{
                                position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                                padding: 8, borderRadius: 10, transition: 'background 0.15s',
                                color: notifBadgeColor || 'var(--text-muted)',
                            }}
                            className="hover:bg-[var(--bg-hover)]"
                            title={notifs.nao_lidas > 0 ? `${notifs.nao_lidas} notificacao(oes) nao lida(s)` : 'Notificacoes'}
                        >
                            <Ic.Bell />
                            {notifs.nao_lidas > 0 && (
                                <span className="badge-pulse" style={{
                                    position: 'absolute', top: 4, right: 4,
                                    width: 16, height: 16, borderRadius: '50%',
                                    background: notifBadgeColor, color: '#fff',
                                    fontSize: 9, fontWeight: 800,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '2px solid var(--bg-body)',
                                }}>{notifs.nao_lidas > 9 ? '9+' : notifs.nao_lidas}</span>
                            )}
                        </button>

                        {/* Dropdown de Notificacoes */}
                        {showNotifs && (
                            <div className="animate-scale-in" style={{
                                position: 'absolute', right: 0, top: '110%', zIndex: 50,
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 14, boxShadow: 'var(--shadow-xl)',
                                minWidth: Math.min(370, window.innerWidth - 24), maxWidth: 'calc(100vw - 16px)', maxHeight: 440, overflow: 'hidden',
                            }}>
                                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Notificacoes</span>
                                        {notifs.nao_lidas > 0 && (
                                            <span className="badge-pulse" style={{ fontSize: 11, fontWeight: 700, background: notifBadgeColor, color: '#fff', padding: '2px 8px', borderRadius: 10 }}>
                                                {notifs.nao_lidas} nova{notifs.nao_lidas > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                    {notifs.nao_lidas > 0 && (
                                        <button onClick={markAllRead}
                                            style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            Marcar todas como lidas
                                        </button>
                                    )}
                                </div>

                                <div style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
                                    {notifs.notificacoes.length === 0 ? (
                                        <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                            Nenhuma notificacao
                                        </div>
                                    ) : notifs.notificacoes.map(n => {
                                        const st = getNotifStyle(n.tipo);
                                        const isRead = !!n.lida;
                                        return (
                                            <div key={n.id}
                                                onClick={() => goToNotif(n)}
                                                style={{
                                                    padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                                    marginBottom: 3, transition: 'background 0.15s',
                                                    display: 'flex', gap: 10, alignItems: 'flex-start',
                                                    opacity: isRead ? 0.55 : 1,
                                                    borderLeft: `3px solid ${st.color}`,
                                                    background: isRead ? 'transparent' : `${st.bg}40`,
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                                onMouseLeave={e => e.currentTarget.style.background = isRead ? 'transparent' : `${st.bg}40`}
                                            >
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: st.bg, color: st.color,
                                                }}>{st.icon}</div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: isRead ? 500 : 700, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                                                        {n.titulo}
                                                    </div>
                                                    {n.mensagem && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 }}>
                                                            {n.mensagem}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                                                        {n.criado_em ? (() => {
                                                            const diff = Date.now() - new Date(n.criado_em + 'Z').getTime();
                                                            const min = Math.floor(diff / 60000);
                                                            if (min < 1) return 'Agora';
                                                            if (min < 60) return `Ha ${min}min`;
                                                            const hrs = Math.floor(min / 60);
                                                            if (hrs < 24) return `Ha ${hrs}h`;
                                                            const dias = Math.floor(hrs / 24);
                                                            if (dias === 1) return 'Ontem';
                                                            return `Ha ${dias}d`;
                                                        })() : ''}
                                                    </div>
                                                </div>
                                                {!isRead && (
                                                    <div className="status-dot-active" style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0, marginTop: 6 }} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    </div>
                </div>

                {/* Toast */}
                {notif && (
                    <div className="fixed top-4 right-4 z-50 toast-enter">
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
                <div className="mobile-bottom-nav no-print">
                    {MOBILE_NAV.map(item => {
                        const active = item.id === 'more' ? false : pg === item.id;
                        const I = item.ic;
                        return (
                            <button
                                key={item.id}
                                onClick={() => item.id === 'more' ? setMobileOpen(true) : nav(item.id)}
                                className={`mobile-bottom-nav-item ${active ? 'mobile-bottom-nav-item-active' : ''}`}
                            >
                                <I size={20} />
                                <span>{item.lb}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Command Palette (Ctrl+K) */}
            {cmdOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setCmdOpen(false)}>
                    <div className="fixed inset-0 modal-overlay" style={{ background: 'rgba(0,0,0,0.4)' }} />
                    <div className="relative animate-scale-in" style={{
                        width: '100%', maxWidth: 480, background: 'var(--bg-card)',
                        border: '1px solid var(--border)', borderRadius: 16,
                        boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                            <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <input
                                ref={cmdInputRef}
                                type="text"
                                value={cmdQuery}
                                onChange={e => setCmdQuery(e.target.value)}
                                placeholder="Ir para..."
                                style={{
                                    flex: 1, background: 'none', border: 'none', outline: 'none',
                                    fontSize: 15, color: 'var(--text-primary)',
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        const filtered = ALL_PAGES.filter(p =>
                                            p.lb.toLowerCase().includes(cmdQuery.toLowerCase()) ||
                                            p.id.toLowerCase().includes(cmdQuery.toLowerCase())
                                        );
                                        if (filtered.length > 0) {
                                            nav(filtered[0].id);
                                            setCmdOpen(false);
                                        }
                                    }
                                }}
                            />
                            <kbd style={{
                                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                color: 'var(--text-muted)', fontFamily: 'inherit',
                            }}>ESC</kbd>
                        </div>
                        <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
                            {ALL_PAGES.filter(p =>
                                !cmdQuery || p.lb.toLowerCase().includes(cmdQuery.toLowerCase()) || p.id.toLowerCase().includes(cmdQuery.toLowerCase())
                            ).map(p => {
                                const I = p.ic;
                                const active = pg === p.id;
                                return (
                                    <button key={p.id} onClick={() => { nav(p.id); setCmdOpen(false); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                            padding: '10px 12px', borderRadius: 10, border: 'none',
                                            background: active ? 'var(--bg-hover)' : 'none',
                                            cursor: 'pointer', textAlign: 'left', fontSize: 13,
                                            color: active ? 'var(--primary)' : 'var(--text-primary)',
                                            fontWeight: active ? 600 : 400, transition: 'background 0.15s',
                                        }}
                                        className="hover:bg-[var(--bg-hover)]">
                                        <span style={{ color: active ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }}><I /></span>
                                        <span>{p.lb}</span>
                                        {active && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>atual</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Perfil */}
            {showPerfil && <PerfilModal user={user} onClose={() => setShowPerfil(false)} notify={notify} updateUser={updateUser} />}
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
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, var(--bg-muted) 0%, transparent 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="relative">
                            <div style={{
                                width: 42, height: 42, borderRadius: '50%', background: 'var(--primary-gradient)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 16, fontWeight: 800,
                                boxShadow: '0 2px 8px rgba(19,121,240,0.25)',
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
                        <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 600, background: 'rgba(220,38,38,0.08)', color: '#ef4444', border: '1px solid rgba(220,38,38,0.15)' }}>
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
                        <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12, fontWeight: 600, background: 'rgba(220,38,38,0.08)', color: '#ef4444', border: '1px solid rgba(220,38,38,0.15)' }}>
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
