import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './auth';
import api from './api';
import { Ic, Z } from './ui';
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

export default function App() {
    const { user, loading, logout, isAdmin, isGerente } = useAuth();
    const [pg, setPg] = useState("dash");
    const [sb, setSb] = useState(true);
    const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
    const [notif, setNotif] = useState(null);
    const [clis, setClis] = useState([]);
    const [orcs, setOrcs] = useState([]);
    const [taxas, setTaxas] = useState({ imp: 8, com: 10, mont: 12, lucro: 20, frete: 2, mdo: 350, inst: 180 });
    const [editOrc, setEditOrc] = useState(null);
    const [lembretes, setLembretes] = useState({ vencidas: 0, proximas_7dias: 0, total: 0, itens: [] });
    const [showLembretes, setShowLembretes] = useState(false);
    const lembretesRef = useRef(null);
    const [waUnread, setWaUnread] = useState(0);
    const [logoSistema, setLogoSistema] = useState(() => localStorage.getItem('logo_sistema') || '');
    const [empNome, setEmpNome] = useState(() => localStorage.getItem('emp_nome') || 'Ornato');

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    }, [dark]);

    const notify = (m) => { setNotif(m); setTimeout(() => setNotif(null), 3500); };

    const loadClis = useCallback(() => { if (user) api.get('/clientes').then(setClis).catch(() => { }); }, [user]);
    const loadOrcs = useCallback(() => { if (user) api.get('/orcamentos').then(setOrcs).catch(() => { }); }, [user]);
    const loadTaxas = useCallback(() => { if (user) api.get('/config').then(setTaxas).catch(() => { }); }, [user]);
    const loadLembretes = useCallback(() => { if (user) api.get('/financeiro/lembretes').then(setLembretes).catch(() => { }); }, [user]);
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

    useEffect(() => { loadClis(); loadOrcs(); loadTaxas(); loadLembretes(); loadWaUnread(); loadEmpresa(); }, [loadClis, loadOrcs, loadTaxas, loadLembretes, loadWaUnread, loadEmpresa]);

    // Atualizar lembretes a cada 60s e WhatsApp a cada 15s
    useEffect(() => {
        if (!user) return;
        const i1 = setInterval(loadLembretes, 60000);
        const i2 = setInterval(loadWaUnread, 15000);
        return () => { clearInterval(i1); clearInterval(i2); };
    }, [user, loadLembretes, loadWaUnread]);

    // Fechar popup de lembretes ao clicar fora
    useEffect(() => {
        const handleClick = (e) => {
            if (lembretesRef.current && !lembretesRef.current.contains(e.target)) setShowLembretes(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const reload = () => { loadClis(); loadOrcs(); loadTaxas(); loadLembretes(); };

    const nav = (p, orc) => {
        if (p === "novo" && orc !== undefined) setEditOrc(orc);
        else if (p !== "novo") setEditOrc(null);
        setPg(p);
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
        { id: "whatsapp", lb: "WhatsApp", ic: Ic.WhatsApp },
        { id: "assistente", lb: "Assistente IA", ic: Ic.Sparkles },
        { id: "relatorios", lb: "Relatórios", ic: Ic.BarChart },
        { id: "cfg", lb: "Config & Taxas", ic: Ic.Gear },
    ];

    // Filtra menus por permissões do usuário (admin vê tudo; outros respeitam permissions)
    const userPerms = (() => { try { return user?.permissions ? JSON.parse(user.permissions) : null; } catch { return null; } })();
    const mn = [
        ...(isAdmin
            ? ALL_MENUS
            : ALL_MENUS.filter(m => !userPerms || userPerms.length === 0 || userPerms.includes(m.id))
        ),
        ...(isAdmin ? [{ id: "users", lb: "Usuários", ic: Ic.Users }] : []),
    ];

    const renderPage = () => {
        switch (pg) {
            case "dash": return <Dash nav={nav} notify={notify} />;
            case "cli": return <Cli clis={clis} reload={loadClis} notify={notify} nav={nav} />;
            case "cat": return <Cat />;
            case "orcs": return <Orcs orcs={orcs} nav={nav} reload={loadOrcs} notify={notify} />;
            case "novo": return <Novo clis={clis} taxas={taxas} editOrc={editOrc} nav={nav} reload={reload} notify={notify} />;
            case "kb": return <Kb orcs={orcs} reload={loadOrcs} notify={notify} nav={nav} />;
            case "proj": return <Projetos orcs={orcs} notify={notify} />;
            case "estoque": return <Estoque notify={notify} />;
            case "whatsapp": return <Mensagens notify={notify} />;
            case "assistente": return <AssistenteIA notify={notify} />;
            case "catalogo_itens": return <ItemBuilder notify={notify} />;
            case "relatorios": return <Relatorios notify={notify} />;
            case "cfg": return <Cfg taxas={taxas} reload={loadTaxas} notify={notify} />;
            case "users": return isAdmin ? <Users notify={notify} meUser={user} /> : <Dash nav={nav} notify={notify} />;
            default: return <Dash nav={nav} notify={notify} />;
        }
    };

    // Badge count helpers
    const hasVencidas = lembretes.vencidas > 0;
    const hasProximas = lembretes.proximas_7dias > 0;
    const badgeColor = hasVencidas ? '#ef4444' : hasProximas ? '#f59e0b' : null;

    return (
        <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
            {/* Sidebar */}
            <aside className={`relative z-20 flex flex-col shrink-0 overflow-hidden transition-all duration-200 ${sb ? 'w-56' : 'w-[52px]'}`}
                style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}>

                {/* Logo */}
                <div className="flex items-center gap-2.5 px-3 min-h-[52px]" style={{ borderBottom: '1px solid var(--border)' }}>
                    <button onClick={() => setSb(!sb)} className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                        <Ic.Menu />
                    </button>
                    {sb && (
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
                        // Badge no menu Projetos se tem contas vencidas
                        const showBadge = (m.id === 'proj' && hasVencidas && !active) || (m.id === 'whatsapp' && waUnread > 0 && !active);
                        const badgeNum = m.id === 'whatsapp' ? waUnread : lembretes.vencidas;
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
                                {sb && (
                                    <span className="text-[13px] flex-1 text-left whitespace-nowrap">{m.lb}</span>
                                )}
                                {sb && showBadge && (
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, background: badgeBg, color: '#fff',
                                        padding: '1px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center',
                                    }}>{badgeNum}</span>
                                )}
                                {sb && !active && !showBadge && <span className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }}><Ic.ChevR /></span>}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="px-2 py-2 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
                    {/* Theme Toggle */}
                    <button onClick={() => setDark(!dark)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }}>
                        {dark ? <Ic.Sun /> : <Ic.Moon />}
                        {sb && <span className="text-xs">{dark ? 'Modo Claro' : 'Modo Escuro'}</span>}
                    </button>

                    {sb ? (
                        <div className="flex items-center gap-2.5 px-2.5 py-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--primary)' }}>
                                {user.nome?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user.nome}</div>
                                <div className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>{user.role}</div>
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
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 h-[52px]" style={{ background: 'var(--bg-body)', borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                        <span><Ic.Home /></span>
                        <span>›</span>
                        <span style={{ color: 'var(--text-primary)' }} className="font-medium">{[...ALL_MENUS, { id: "novo", lb: "Novo Orçamento" }, { id: "users", lb: "Usuários" }].find(m => m.id === pg)?.lb || 'Home'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                    {/* Lembretes Badge na Top Bar */}
                    {lembretes.total > 0 && (
                        <div ref={lembretesRef} style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowLembretes(!showLembretes)}
                                style={{
                                    position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                                    padding: 8, borderRadius: 10, transition: 'background 0.15s',
                                    color: badgeColor || 'var(--text-muted)',
                                }}
                                className="hover:bg-[var(--bg-hover)]"
                                title={`${lembretes.total} lembrete(s) financeiro(s)`}
                            >
                                <Ic.Bell />
                                <span style={{
                                    position: 'absolute', top: 4, right: 4,
                                    width: 16, height: 16, borderRadius: '50%',
                                    background: badgeColor, color: '#fff',
                                    fontSize: 9, fontWeight: 800,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '2px solid var(--bg-body)',
                                }}>{lembretes.total}</span>
                            </button>

                            {/* Dropdown de Lembretes */}
                            {showLembretes && (
                                <div style={{
                                    position: 'absolute', right: 0, top: '110%', zIndex: 50,
                                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,.18)',
                                    minWidth: 340, maxHeight: 400, overflow: 'hidden',
                                }}>
                                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Lembretes Financeiros</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {hasVencidas && <span style={{ fontSize: 11, fontWeight: 700, background: '#fef2f2', color: '#ef4444', padding: '2px 8px', borderRadius: 10 }}>{lembretes.vencidas} vencida(s)</span>}
                                            {hasProximas && <span style={{ fontSize: 11, fontWeight: 700, background: '#fffbeb', color: '#f59e0b', padding: '2px 8px', borderRadius: 10 }}>{lembretes.proximas_7dias} próxima(s)</span>}
                                        </div>
                                    </div>
                                    <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
                                        {lembretes.itens.map((item, i) => {
                                            const isVencida = item.tipo_alerta === 'vencida';
                                            return (
                                                <div key={item.id || i}
                                                    onClick={() => { setShowLembretes(false); nav('proj'); }}
                                                    style={{
                                                        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                                                        marginBottom: 4, transition: 'background 0.15s',
                                                        background: isVencida ? '#fef2f220' : '#fffbeb20',
                                                        borderLeft: `3px solid ${isVencida ? '#ef4444' : '#f59e0b'}`,
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = isVencida ? '#fef2f220' : '#fffbeb20'}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{item.descricao}</div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                                {item.projeto_nome} · Venc.: {item.data_vencimento ? new Date(item.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                                            </div>
                                                        </div>
                                                        <div style={{ fontWeight: 700, fontSize: 13, color: isVencida ? '#ef4444' : '#f59e0b', whiteSpace: 'nowrap' }}>
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor || 0)}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                                        <button onClick={() => { setShowLembretes(false); nav('proj'); }}
                                            style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            Ver todos os projetos →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
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
        </div>
    );
}
