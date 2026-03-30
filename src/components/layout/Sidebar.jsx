import { Ic } from '../../ui';
import { ChevronDown } from 'lucide-react';

export default function Sidebar({
    sb, setSb, sidebarHover, setSidebarHover, sidebarExpanded,
    dark, setDark, pg, nav, MENU_GROUPS, canSee, collapsed, toggleGroup,
    user, logout, logoSistema, empNome, setShowPerfil,
    notifs, waUnread, isMobile, mobileOpen, setMobileOpen,
}) {
    return (
        <>
            {/* Backdrop mobile */}
            {isMobile && mobileOpen && (
                <div className="fixed inset-0 z-30 transition-opacity modal-overlay" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setMobileOpen(false)} />
            )}

            {/* ═══ Desktop Sidebar ═══ */}
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
        </>
    );
}
