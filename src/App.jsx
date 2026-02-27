import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './auth';
import api from './api';
import { Ic, Z } from './ui';
import { AlertTriangle, Clock, CheckCircle2, Folder, BarChart2, AlertCircle, DollarSign, Calendar, Bell, MessageCircle, Camera, Gift, FileText, ClipboardList, Eye, Search, RefreshCw, Share2, Printer } from 'lucide-react';
import LoginPage from './pages/Login';
import Dash from './pages/Dash';
import Cli from './pages/Cli';
import Cat from './pages/Cat';
import Orcs from './pages/Orcs';
import Novo from './pages/Novo';
import Kb from './pages/Kb';
import Cfg from './pages/Cfg';
import Users from './pages/Users';
import Projetos from './pages/Projetos';
import Estoque from './pages/Estoque';
import ItemBuilder from './pages/ItemBuilder';
import Mensagens from './pages/Mensagens';
import AssistenteIA from './pages/AssistenteIA';
import Relatorios from './pages/Relatorios';
import Financeiro from './pages/Financeiro';

export default function App() {
    const { user, loading, logout, isAdmin, isGerente, updateUser } = useAuth();
    const [pg, setPg] = useState("dash");
    const [sb, setSb] = useState(true);
    const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
    const [notif, setNotif] = useState(null);
    const [clis, setClis] = useState([]);
    const [orcs, setOrcs] = useState([]);
    const [taxas, setTaxas] = useState({ imp: 8, com: 10, mont: 12, lucro: 20, frete: 2, mdo: 350, inst: 180 });
    const [editOrc, setEditOrc] = useState(null);
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

    // Detectar mobile via resize
    useEffect(() => {
        const onResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (!mobile) setMobileOpen(false); // fechar overlay ao sair de mobile
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);

    const notify = (m) => { setNotif(m); setTimeout(() => setNotif(null), 3500); };

    const loadClis = useCallback(() => { if (user) api.get('/clientes').then(setClis).catch(() => { }); }, [user]);
    const loadOrcs = useCallback(() => { if (user) api.get('/orcamentos').then(setOrcs).catch(() => { }); }, [user]);
    const loadTaxas = useCallback(() => { if (user) api.get('/config').then(setTaxas).catch(() => { }); }, [user]);
    const loadNotifs = useCallback(() => { if (user) api.get('/notificacoes').then(setNotifs).catch(() => { }); }, [user]);
    const loadWaUnread = useCallback(() => { if (user) api.get('/whatsapp/nao-lidas').then(d => setWaUnread(d.total)).catch(() => { }); }, [user]);
    const loadEmpresa = useCallback(() => {
        if (user) api.get('/config/empresa').then(d => {
            const ls = d.logo_sistema || '';
            const nm = d.nome || 'Ornato';
            setLogoSistema(ls);
            setEmpNome(nm);
            localStorage.setItem('logo_sistema', ls);
            localStorage.setItem('emp_nome', nm);
        }).catch(() => {});
    }, [user]);

    useEffect(() => { loadClis(); loadOrcs(); loadTaxas(); loadNotifs(); loadWaUnread(); loadEmpresa(); }, [loadClis, loadOrcs, loadTaxas, loadNotifs, loadWaUnread, loadEmpresa]);

    // Atualizar notificações a cada 15s e WhatsApp a cada 15s
    useEffect(() => {
        if (!user) return;
        const i1 = setInterval(loadNotifs, 15000);
        const i2 = setInterval(loadWaUnread, 15000);
        return () => { clearInterval(i1); clearInterval(i2); };
    }, [user, loadNotifs, loadWaUnread]);

    // Fechar popup de notificações ao clicar fora
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
            }).catch(() => {});
        }, 300);
        return () => clearTimeout(buscaTimer.current);
    }, [buscaQuery]);

    // Marcar UMA notificação como lida
    const markNotifRead = (id) => {
        api.put(`/notificacoes/${id}/lida`).catch(() => {});
        setNotifs(prev => ({
            ...prev,
            notificacoes: prev.notificacoes.map(n => n.id === id ? { ...n, lida: 1 } : n),
            nao_lidas: Math.max(0, prev.nao_lidas - 1),
        }));
    };

    // Marcar TODAS como lidas
    const markAllRead = () => {
        api.put('/notificacoes/lidas').catch(() => {});
        setNotifs(prev => ({
            ...prev,
            notificacoes: prev.notificacoes.map(n => ({ ...n, lida: 1 })),
            nao_lidas: 0,
        }));
    };

    // Navegar a partir de notificação
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
            // Abrir orçamento direto em edição
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
        if (p === "novo" && orc !== undefined) setEditOrc(orc);
        else if (p !== "novo") setEditOrc(null);
        setPg(p);
        if (isMobile) setMobileOpen(false); // fechar sidebar mobile ao navegar
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-body)' }}>
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Carregando...</span>
            </div>
        </div>
    );
    if (!user) return <LoginPage dark={dark} setDark={setDark} logoSistema={logoSistema} empNome={empNome} />;

    // Todos os itens de menu disponíveis (exceto "users" que é sempre admin-only)
    const ALL_MENUS = [
        { id: "dash", lb: "Home", ic: Ic.Dash },
        { id: "cli", lb: "Clientes", ic: Ic.Usr },
        { id: "cat", lb: "Biblioteca", ic: Ic.Box },
        { id: "catalogo_itens", lb: "Engenharia de Módulos", ic: Ic.Package },
        { id: "orcs", lb: "Orçamentos", ic: Ic.File },
        { id: "kb", lb: "Pipeline CRM", ic: Ic.Kb },
        { id: "proj", lb: "Projetos", ic: Ic.Briefcase },
        { id: "estoque", lb: "Gestão de Recursos", ic: Ic.Briefcase },
        { id: "financeiro", lb: "Financeiro", ic: Ic.Dollar },
        { id: "whatsapp", lb: "WhatsApp", ic: Ic.WhatsApp },
        { id: "assistente", lb: "Assistente IA", ic: Ic.Sparkles },
        { id: "relatorios", lb: "Relatórios", ic: Ic.BarChart },
        { id: "cfg", lb: "Config & Taxas", ic: Ic.Gear },
    ];

    // Filtra menus por permissões do usuário (admin vê tudo; outros respeitam permissions)
    const userPerms = (() => { try { return user?.permissions ? JSON.parse(user.permissions) : null; } catch { return null; } })();
    const isVendedor = user?.role === 'vendedor';
    const mn = [
        ...(isAdmin
            ? ALL_MENUS
            : ALL_MENUS.filter(m => {
                // Vendedor nunca vê financeiro
                if (isVendedor && m.id === 'financeiro') return false;
                return !userPerms || userPerms.length === 0 || userPerms.includes(m.id);
            })
        ),
        ...(isAdmin ? [{ id: "users", lb: "Usuários", ic: Ic.Users }] : []),
    ];

    const renderPage = () => {
        switch (pg) {
            case "dash": return <Dash nav={nav} notify={notify} user={user} />;
            case "cli": return <Cli clis={clis} reload={loadClis} notify={notify} nav={nav} />;
            case "cat": return <Cat />;
            case "orcs": return <Orcs orcs={orcs} nav={nav} reload={loadOrcs} notify={notify} />;
            case "novo": return <Novo clis={clis} taxas={taxas} editOrc={editOrc} nav={nav} reload={reload} notify={notify} />;
            case "kb": return <Kb orcs={orcs} reload={loadOrcs} notify={notify} nav={nav} />;
            case "proj": return <Projetos orcs={orcs} notify={notify} user={user} openProjectId={openProjectId} onProjectOpened={() => setOpenProjectId(null)} />;
            case "estoque": return <Estoque notify={notify} />;
            case "financeiro": return <Financeiro notify={notify} user={user} nav={nav} />;
            case "whatsapp": return <Mensagens notify={notify} />;
            case "assistente": return <AssistenteIA notify={notify} />;
            case "catalogo_itens": return <ItemBuilder notify={notify} />;
            case "relatorios": return <Relatorios notify={notify} />;
            case "cfg": return <Cfg taxas={taxas} reload={loadTaxas} notify={notify} />;
            case "users": return isAdmin ? <Users notify={notify} meUser={user} /> : <Dash nav={nav} notify={notify} />;
            default: return <Dash nav={nav} notify={notify} />;
        }
    };

    // Notificação tipo → ícone + cor
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
    };
    const getNotifStyle = (tipo) => NOTIF_STYLE[tipo] || { icon: <Bell size={14} />, color: 'var(--primary)', bg: 'var(--bg-hover)' };
    const notifBadgeColor = notifs.nao_lidas > 0
        ? (notifs.notificacoes.some(n => !n.lida && (n.tipo === 'financeiro_vencido' || n.tipo === 'pagar_vencido')) ? '#ef4444' : '#3b82f6')
        : null;

    return (
        <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
            {/* Backdrop mobile */}
            {isMobile && mobileOpen && (
                <div className="fixed inset-0 z-30 bg-black/40 transition-opacity" onClick={() => setMobileOpen(false)} />
            )}

            {/* Sidebar */}
            <aside className={`
                ${isMobile
                    ? `fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`
                    : `relative z-20 shrink-0 overflow-hidden transition-all duration-200 ${sb ? 'w-56' : 'w-[52px]'}`
                }
                flex flex-col
            `}
                style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}>

                {/* Logo */}
                <div className="flex items-center gap-2.5 px-3 min-h-[52px]" style={{ borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => isMobile ? setMobileOpen(false) : setSb(!sb)} className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                        {isMobile && mobileOpen ? <Ic.X /> : <Ic.Menu />}
                    </button>
                    {(sb || isMobile) && (
                        <div className="flex items-center overflow-hidden min-w-0">
                            {logoSistema
                                ? <img src={logoSistema} alt="Logo" style={{ height: 28, maxWidth: 140, objectFit: 'contain' }} />
                                : <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{empNome}</span>
                            }
                        </div>
                    )}
                </div>

                {/* Nav Items */}
                <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                    {mn.map(m => {
                        const active = pg === m.id;
                        const I = m.ic;
                        const vencidasReceberCount = notifs.notificacoes.filter(n => !n.lida && n.tipo === 'financeiro_vencido').length;
                        const vencidasPagarCount = notifs.notificacoes.filter(n => !n.lida && n.tipo === 'pagar_vencido').length;
                        const showBadge = (m.id === 'proj' && vencidasReceberCount > 0 && !active) || (m.id === 'financeiro' && vencidasPagarCount > 0 && !active) || (m.id === 'whatsapp' && waUnread > 0 && !active);
                        const badgeNum = m.id === 'whatsapp' ? waUnread : m.id === 'financeiro' ? vencidasPagarCount : vencidasReceberCount;
                        const badgeBg = m.id === 'whatsapp' ? '#22c55e' : '#ef4444';
                        return (
                            <button key={m.id} onClick={() => nav(m.id)}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 cursor-pointer group
                                    ${active ? 'font-semibold' : 'hover:bg-[var(--bg-hover)]'}`}
                                style={active ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-secondary)' }}>
                                <span className="shrink-0 relative">
                                    <I />
                                    {showBadge && (
                                        <span style={{
                                            position: 'absolute', top: -3, right: -4,
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: badgeBg, border: '2px solid var(--bg-sidebar)',
                                        }} />
                                    )}
                                </span>
                                {(sb || isMobile) && (
                                    <span className="text-[13px] flex-1 text-left whitespace-nowrap">{m.lb}</span>
                                )}
                                {(sb || isMobile) && showBadge && (
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, background: badgeBg, color: '#fff',
                                        padding: '1px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center',
                                    }}>{badgeNum}</span>
                                )}
                                {(sb || isMobile) && !active && !showBadge && <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }}><Ic.ChevR /></span>}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="px-2 py-2 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
                    {/* Theme Toggle */}
                    <button onClick={() => setDark(!dark)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                        {dark ? <Ic.Sun /> : <Ic.Moon />}
                        {(sb || isMobile) && <span className="text-xs">{dark ? 'Modo Claro' : 'Modo Escuro'}</span>}
                    </button>

                    {(sb || isMobile) ? (
                        <div className="flex items-center gap-2.5 px-2.5 py-2">
                            <div onClick={() => setShowPerfil(true)} className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--bg-hover)]">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: 'var(--primary)' }}>
                                    {user.nome?.[0]?.toUpperCase()}
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
                        <button onClick={logout} className="w-full flex justify-center p-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                            <Ic.Logout />
                        </button>
                    )}
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 relative overflow-y-auto overflow-x-hidden">
                {/* Top bar */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-3 md:px-6 h-[52px] no-print" style={{ background: 'var(--bg-body)', borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {isMobile && (
                            <button onClick={() => setMobileOpen(true)} className="p-1.5 mr-1 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                                <Ic.Menu />
                            </button>
                        )}
                        <span className="hidden md:inline"><Ic.Home /></span>
                        <span className="hidden md:inline">›</span>
                        <span style={{ color: 'var(--text-primary)' }} className="font-medium truncate">{[...ALL_MENUS, { id: "novo", lb: "Novo Orçamento" }, { id: "users", lb: "Usuários" }].find(m => m.id === pg)?.lb || 'Home'}</span>
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
                                placeholder="Buscar clientes, orçamentos, projetos..."
                                style={{
                                    width: 260, padding: '6px 12px 6px 32px', borderRadius: 8,
                                    border: '1px solid var(--border)', background: 'var(--bg-muted)',
                                    fontSize: 12, color: 'var(--text-primary)', outline: 'none',
                                }}
                            />
                        </div>
                        {buscaOpen && buscaResults && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                width: 380, maxHeight: 420, overflowY: 'auto',
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 50, padding: 8,
                            }}>
                                {buscaResults.clientes.length === 0 && buscaResults.orcamentos.length === 0 && buscaResults.projetos.length === 0 && (
                                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum resultado</div>
                                )}
                                {buscaResults.clientes.length > 0 && (
                                    <>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 8px', letterSpacing: '0.05em' }}>Clientes</div>
                                        {buscaResults.clientes.map(c => (
                                            <button key={`c${c.id}`} onClick={() => { nav('cli'); setBuscaOpen(false); setBuscaQuery(''); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)' }}
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
                                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 8px', letterSpacing: '0.05em', marginTop: 4 }}>Orçamentos</div>
                                        {buscaResults.orcamentos.map(o => (
                                            <button key={`o${o.id}`} onClick={() => { nav('orcs'); setBuscaOpen(false); setBuscaQuery(''); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)' }}
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
                                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)' }}
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
                    {/* WhatsApp Badge na Top Bar */}
                    {waUnread > 0 && (
                        <button
                            onClick={() => nav('whatsapp')}
                            style={{
                                position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                                padding: 8, borderRadius: 10, transition: 'background 0.15s', color: '#22c55e',
                            }}
                            className="hover:bg-[var(--bg-hover)]"
                            title={`${waUnread} mensagem(ns) não lida(s)`}
                        >
                            <Ic.WhatsApp />
                            <span style={{
                                position: 'absolute', top: 4, right: 4,
                                width: 16, height: 16, borderRadius: '50%',
                                background: '#22c55e', color: '#fff',
                                fontSize: 9, fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid var(--bg-body)',
                            }}>{waUnread}</span>
                        </button>
                    )}
                    {/* Sininho de Notificações */}
                    <div ref={notifsRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowNotifs(!showNotifs)}
                            style={{
                                position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                                padding: 8, borderRadius: 10, transition: 'background 0.15s',
                                color: notifBadgeColor || 'var(--text-muted)',
                            }}
                            className="hover:bg-[var(--bg-hover)]"
                            title={notifs.nao_lidas > 0 ? `${notifs.nao_lidas} notificação(ões) não lida(s)` : 'Notificações'}
                        >
                            <Ic.Bell />
                            {notifs.nao_lidas > 0 && (
                                <span style={{
                                    position: 'absolute', top: 4, right: 4,
                                    width: 16, height: 16, borderRadius: '50%',
                                    background: notifBadgeColor, color: '#fff',
                                    fontSize: 9, fontWeight: 800,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '2px solid var(--bg-body)',
                                }}>{notifs.nao_lidas > 9 ? '9+' : notifs.nao_lidas}</span>
                            )}
                        </button>

                        {/* Dropdown de Notificações */}
                        {showNotifs && (
                            <div style={{
                                position: 'absolute', right: 0, top: '110%', zIndex: 50,
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,.18)',
                                minWidth: Math.min(370, window.innerWidth - 24), maxWidth: 'calc(100vw - 16px)', maxHeight: 440, overflow: 'hidden',
                            }}>
                                {/* Header */}
                                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Notificações</span>
                                        {notifs.nao_lidas > 0 && (
                                            <span style={{ fontSize: 11, fontWeight: 700, background: notifBadgeColor, color: '#fff', padding: '2px 8px', borderRadius: 10 }}>
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

                                {/* Lista */}
                                <div style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
                                    {notifs.notificacoes.length === 0 ? (
                                        <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                            Nenhuma notificação
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
                                                            if (min < 60) return `Há ${min}min`;
                                                            const hrs = Math.floor(min / 60);
                                                            if (hrs < 24) return `Há ${hrs}h`;
                                                            const dias = Math.floor(hrs / 24);
                                                            if (dias === 1) return 'Ontem';
                                                            return `Há ${dias}d`;
                                                        })() : ''}
                                                    </div>
                                                </div>
                                                {!isRead && (
                                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0, marginTop: 6 }} />
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
                    <div className="fixed top-4 right-4 z-50 animate-fade-up">
                        <div className="glass-card px-4 py-2.5 flex items-center gap-2 text-sm font-medium shadow-lg" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}>
                            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--primary)' }} />
                            {notif}
                        </div>
                    </div>
                )}

                <div className="min-h-full">
                    {renderPage()}
                </div>
            </main>

            {/* Modal de Perfil */}
            {showPerfil && <PerfilModal user={user} onClose={() => setShowPerfil(false)} notify={notify} updateUser={updateUser} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// PerfilModal — Editar perfil e alterar senha
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
        if (!nome.trim() || !email.trim()) { setErr('Nome e email obrigatórios'); return; }
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
        if (novaSenha.length < 6) { setErrSenha('Nova senha deve ter no mínimo 6 caracteres'); return; }
        if (novaSenha !== confirmar) { setErrSenha('As senhas não coincidem'); return; }
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
    };
    const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
            <div style={{
                position: 'relative', width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto',
                background: 'var(--bg-card)', borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,.25)',
                border: '1px solid var(--border)', margin: 16,
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: '50%', background: 'var(--primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 16, fontWeight: 800,
                        }}>{user.nome?.[0]?.toUpperCase()}</div>
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
                        <input value={nome} onChange={e => setNome(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Email</label>
                        <input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} />
                    </div>
                    <button onClick={handleSavePerfil} disabled={saving}
                        className={`${Z.btn} w-full py-2.5 text-sm`}>
                        {saving ? 'Salvando...' : 'Salvar Dados'}
                    </button>
                </div>

                {/* Divider */}
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
                        <input value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} type="password" style={inputStyle} placeholder="Digite sua senha atual" />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>Nova Senha</label>
                        <input value={novaSenha} onChange={e => setNovaSenha(e.target.value)} type="password" style={inputStyle} placeholder="Mínimo 6 caracteres" />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <label style={labelStyle}>Confirmar Nova Senha</label>
                        <input value={confirmar} onChange={e => setConfirmar(e.target.value)} type="password" style={inputStyle} placeholder="Repita a nova senha" />
                    </div>
                    <button onClick={handleSaveSenha} disabled={savingSenha}
                        style={{
                            width: '100%', padding: '10px 0', borderRadius: 10, border: '2px solid var(--border)',
                            background: 'var(--bg-body)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 14,
                            cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        {savingSenha ? 'Alterando...' : 'Alterar Senha'}
                    </button>
                </div>
            </div>
        </div>
    );
}
