import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Ic } from '../../ui';
import { ChevronDown, ChevronsLeft, ChevronsRight, Search, User, FileText, FolderKanban, Box, X } from 'lucide-react';
import api from '../../api';

const LS_RECENT = 'erp_recent_pages';
const LS_FAVS = 'erp_favorite_pages';

function getRecentPages() {
    try { return JSON.parse(localStorage.getItem(LS_RECENT) || '[]'); } catch { return []; }
}
function setRecentPages(list) {
    localStorage.setItem(LS_RECENT, JSON.stringify(list.slice(0, 5)));
}
function getFavoritePages() {
    try { return JSON.parse(localStorage.getItem(LS_FAVS) || '[]'); } catch { return []; }
}
function setFavoritePages(list) {
    localStorage.setItem(LS_FAVS, JSON.stringify(list));
}

function useRecentAndFavorites(pg, MENU_GROUPS) {
    const [recents, setRecents] = useState(getRecentPages);
    const [favorites, setFavorites] = useState(getFavoritePages);

    // Build a flat map of all menu items: id -> { id, lb, ic }
    const menuMap = useMemo(() => {
        const map = {};
        if (!MENU_GROUPS) return map;
        for (const g of MENU_GROUPS) {
            for (const m of g.items) {
                map[m.id] = m;
            }
        }
        return map;
    }, [MENU_GROUPS]);

    // Track page visits
    useEffect(() => {
        if (!pg || !menuMap[pg]) return;
        const prev = getRecentPages();
        const next = [pg, ...prev.filter(id => id !== pg)].slice(0, 5);
        setRecentPages(next);
        setRecents(next);
    }, [pg, menuMap]);

    const toggleFavorite = useCallback((pageId) => {
        setFavorites(prev => {
            const next = prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId];
            setFavoritePages(next);
            return next;
        });
    }, []);

    const isFavorite = useCallback((pageId) => favorites.includes(pageId), [favorites]);

    return { recents, favorites, menuMap, toggleFavorite, isFavorite };
}

const TYPE_CONFIG = {
    cliente:   { icon: User,          label: 'Cliente',    page: 'cli',  color: 'var(--info)' },
    orcamento: { icon: FileText,      label: 'Orcamento', page: 'orcs', color: 'var(--warning)' },
    projeto:   { icon: FolderKanban,  label: 'Projeto',    page: 'proj', color: '#8b5cf6' },
    peca:      { icon: Box,           label: 'Peca',       page: 'cnc',  color: 'var(--success)' },
};

function getResultTitle(r) {
    if (r.tipo === 'cliente') return r.nome;
    if (r.tipo === 'orcamento') return `#${r.numero}`;
    if (r.tipo === 'projeto') return r.nome || `Projeto #${r.id}`;
    if (r.tipo === 'peca') return r.descricao || `Peca #${r.id}`;
    return `#${r.id}`;
}

function getResultSubtitle(r) {
    if (r.tipo === 'cliente') return [r.email, r.telefone].filter(Boolean).join(' | ') || '';
    if (r.tipo === 'orcamento') return r.cliente_nome || r.status || '';
    if (r.tipo === 'projeto') return [r.cliente_nome, r.status].filter(Boolean).join(' - ');
    if (r.tipo === 'peca') {
        const dims = [r.comprimento, r.largura, r.espessura].filter(Boolean).join('x');
        return [r.lote_nome, r.material_code, dims].filter(Boolean).join(' | ');
    }
    return '';
}

function SidebarSearch({ sidebarExpanded, nav, navToRecord, isMobile, setMobileOpen }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const inputRef = useRef(null);
    const containerRef = useRef(null);
    const debounceRef = useRef(null);

    // Debounced search
    const doSearch = useCallback((q) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!q || q.length < 2) { setResults([]); setLoading(false); return; }
        setLoading(true);
        debounceRef.current = setTimeout(() => {
            api.get(`/search?q=${encodeURIComponent(q)}`)
                .then(d => { setResults(d.results || []); setActiveIdx(-1); })
                .catch(() => setResults([]))
                .finally(() => setLoading(false));
        }, 300);
    }, []);

    useEffect(() => { doSearch(query); }, [query, doSearch]);

    // Note: Ctrl+K / "/" are handled globally by App.jsx command palette

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                closeSearch();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const closeSearch = () => {
        setOpen(false);
        setQuery('');
        setResults([]);
        setActiveIdx(-1);
    };

    const handleSelect = (r) => {
        if (navToRecord) { navToRecord(r); }
        else { const cfg = TYPE_CONFIG[r.tipo]; if (cfg) nav(cfg.page); }
        closeSearch();
        if (isMobile) setMobileOpen?.(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') { closeSearch(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) { handleSelect(results[activeIdx]); }
    };

    // Compact mode: just icon button
    if (!sidebarExpanded && !isMobile) {
        return (
            <div className="px-2 pt-2">
                <button
                    onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="sidebar-item w-full flex justify-center p-2 cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                    title="Buscar (Ctrl+K)"
                >
                    <Search size={16} />
                    <span className="sidebar-tooltip">Buscar (Ctrl+K)</span>
                </button>
                {open && <SearchOverlay
                    containerRef={containerRef} inputRef={inputRef} query={query} setQuery={setQuery}
                    results={results} loading={loading} activeIdx={activeIdx}
                    handleKeyDown={handleKeyDown} handleSelect={handleSelect} closeSearch={closeSearch}
                />}
            </div>
        );
    }

    // Expanded / Mobile
    return (
        <div className="px-2 pt-2 relative" ref={!open ? undefined : containerRef}>
            <div
                onClick={() => { if (!open) { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); } }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                style={{
                    background: open ? 'var(--bg-card)' : 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                }}
            >
                <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                {open ? (
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Buscar..."
                        autoFocus
                        className="flex-1 text-xs bg-transparent outline-none"
                        style={{ color: 'var(--text-primary)', minWidth: 0 }}
                    />
                ) : (
                    <span className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>Buscar...</span>
                )}
                {!open && (
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{
                        background: 'var(--bg-sidebar)', border: '1px solid var(--border)',
                        color: 'var(--text-muted)', fontFamily: 'inherit', lineHeight: 1,
                    }}>
                        {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}K
                    </kbd>
                )}
                {open && query && (
                    <button onClick={(e) => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }}
                        className="p-0.5 rounded hover:bg-[var(--bg-hover)] cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Results dropdown */}
            {open && (query.length >= 2 || results.length > 0) && (
                <div style={{
                    position: 'absolute', left: 8, right: 8, top: '100%', marginTop: 4,
                    zIndex: 50, borderRadius: 10, overflow: 'hidden',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    maxHeight: 320, overflowY: 'auto',
                }}>
                    {loading && <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Buscando...</div>}
                    {!loading && query.length >= 2 && results.length === 0 && (
                        <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum resultado</div>
                    )}
                    {results.map((r, i) => {
                        const cfg = TYPE_CONFIG[r.tipo] || {};
                        const Icon = cfg.icon || Search;
                        const subtitle = getResultSubtitle(r);
                        return (
                            <button
                                key={`${r.tipo}-${r.id}-${i}`}
                                onClick={() => handleSelect(r)}
                                onMouseEnter={() => setActiveIdx(i)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors"
                                style={{
                                    background: activeIdx === i ? 'var(--bg-hover)' : 'transparent',
                                    border: 'none', outline: 'none',
                                }}
                            >
                                <span className="shrink-0 flex items-center justify-center rounded-md" style={{
                                    width: 28, height: 28, background: `${cfg.color || '#666'}18`,
                                }}>
                                    <Icon size={14} style={{ color: cfg.color || 'var(--text-muted)' }} />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                        {getResultTitle(r)}
                                    </div>
                                    {subtitle && (
                                        <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
                                    )}
                                </div>
                                <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{
                                    background: `${cfg.color || '#666'}15`, color: cfg.color || 'var(--text-muted)',
                                }}>
                                    {cfg.label || r.tipo}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Floating overlay for compact sidebar search
function SearchOverlay({ containerRef, inputRef, query, setQuery, results, loading, activeIdx, handleKeyDown, handleSelect, closeSearch }) {
    // Close on click outside
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) closeSearch();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [closeSearch, containerRef]);

    return (
        <div ref={containerRef} style={{
            position: 'fixed', left: 'calc(var(--sidebar-compact) + 8px)', top: 8,
            width: 320, zIndex: 100, borderRadius: 12, overflow: 'hidden',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            backdropFilter: 'blur(16px)', boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
        }}>
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Buscar..."
                    autoFocus
                    className="flex-1 text-xs bg-transparent outline-none"
                    style={{ color: 'var(--text-primary)', minWidth: 0 }}
                />
                {query && (
                    <button onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                        className="p-0.5 rounded hover:bg-[var(--bg-hover)] cursor-pointer" style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}>
                        <X size={12} />
                    </button>
                )}
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {loading && <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Buscando...</div>}
                {!loading && query.length >= 2 && results.length === 0 && (
                    <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum resultado</div>
                )}
                {results.map((r, i) => {
                    const cfg = TYPE_CONFIG[r.tipo] || {};
                    const Icon = cfg.icon || Search;
                    const subtitle = getResultSubtitle(r);
                    return (
                        <button
                            key={`${r.tipo}-${r.id}-${i}`}
                            onClick={() => handleSelect(r)}
                            onMouseEnter={() => {}}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors"
                            style={{
                                background: activeIdx === i ? 'var(--bg-hover)' : 'transparent',
                                border: 'none', outline: 'none',
                            }}
                        >
                            <span className="shrink-0 flex items-center justify-center rounded-md" style={{
                                width: 28, height: 28, background: `${cfg.color || '#666'}18`,
                            }}>
                                <Icon size={14} style={{ color: cfg.color || 'var(--text-muted)' }} />
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                    {getResultTitle(r)}
                                </div>
                                {subtitle && (
                                    <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
                                )}
                            </div>
                            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{
                                background: `${cfg.color || '#666'}15`, color: cfg.color || 'var(--text-muted)',
                            }}>
                                {cfg.label || r.tipo}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function Sidebar({
    sb, setSb, sidebarHover, setSidebarHover, sidebarExpanded,
    dark, setDark, pg, nav, navToRecord, MENU_GROUPS, canSee, collapsed, toggleGroup,
    user, logout, logoSistema, empNome, setShowPerfil,
    notifs, waUnread, isMobile, mobileOpen, setMobileOpen,
}) {
    const { menuMap } = useRecentAndFavorites(pg, MENU_GROUPS);

    return (
        <>
            {/* Backdrop mobile */}
            {isMobile && mobileOpen && (
                <div className="fixed inset-0 z-30 transition-opacity modal-overlay" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setMobileOpen(false)} />
            )}

            {/* Desktop Sidebar */}
            {!isMobile && (
                <aside
                    onMouseEnter={() => {}}
                    onMouseLeave={() => {}}
                    className="sidebar-dark relative z-20 shrink-0 flex flex-col"
                    style={{
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

                    {/* Search */}
                    <SidebarSearch sidebarExpanded={sidebarExpanded} nav={nav} navToRecord={navToRecord} isMobile={false} />

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
                                if (id === 'whatsapp' && waUnread > 0) return { num: waUnread, bg: 'var(--success)' };
                                if (id === 'financeiro' && vencidasPagarCount > 0) return { num: vencidasPagarCount, bg: 'var(--danger)' };
                                if (id === 'proj' && vencidasReceberCount > 0) return { num: vencidasReceberCount, bg: 'var(--danger)' };
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
                                                    <div key={m.id} className="relative group">
                                                        <button onClick={() => nav(m.id)}
                                                            className={`sidebar-item w-full flex items-center gap-2.5 px-2.5 py-2 cursor-pointer
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
                                                    </div>
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
                        {/* Collapse/Expand toggle */}
                        <button
                            onClick={() => { setSb(!sb); setSidebarHover(false); }}
                            className="sidebar-item w-full flex items-center gap-2.5 px-2.5 py-2 cursor-pointer"
                            style={{ color: 'var(--text-muted)' }}
                            title={sidebarExpanded ? 'Recolher menu' : 'Expandir menu'}
                        >
                            {sidebarExpanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
                            {sidebarExpanded && <span className="text-xs whitespace-nowrap">Recolher menu</span>}
                            {!sidebarExpanded && <span className="sidebar-tooltip">Expandir menu</span>}
                        </button>

                        <button onClick={() => setDark(!dark)} className="sidebar-item w-full flex items-center gap-2.5 px-2.5 py-2 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                            {dark ? <Ic.Sun /> : <Ic.Moon />}
                            {sidebarExpanded && <span className="text-xs whitespace-nowrap">{dark ? 'Modo Claro' : 'Modo Escuro'}</span>}
                            {!sidebarExpanded && <span className="sidebar-tooltip">{dark ? 'Modo Claro' : 'Modo Escuro'}</span>}
                        </button>

                        {sidebarExpanded ? (
                            <div className="flex items-center gap-2.5 px-2.5 py-2">
                                <div onClick={() => setShowPerfil(true)} className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--bg-hover)]">
                                    <div className="relative shrink-0">
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: 'var(--accent-gradient)' }}>
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

            {/* Mobile Sidebar (overlay) */}
            {isMobile && mobileOpen && (
                <aside className="sidebar-dark fixed inset-y-0 left-0 z-40 w-64 flex flex-col animate-slide-left" style={{ borderRight: '1px solid var(--border)' }}>
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

                    {/* Search (mobile) */}
                    <SidebarSearch sidebarExpanded={true} nav={nav} navToRecord={navToRecord} isMobile={true} setMobileOpen={setMobileOpen} />

                    <nav className="flex-1 overflow-y-auto py-2 px-2">
                        {MENU_GROUPS.map(g => {
                            const visibleItems = g.items.filter(m => canSee(m.id));
                            if (visibleItems.length === 0) return null;
                            const isTop = g.id === 'top';
                            const isOpen = !collapsed[g.id];
                            const vencidasPagarCount = notifs.notificacoes.filter(n => !n.lida && n.tipo === 'pagar_vencido').length;
                            const getBadge = (id) => {
                                if (id === 'whatsapp' && waUnread > 0) return { num: waUnread, bg: 'var(--success)' };
                                if (id === 'financeiro' && vencidasPagarCount > 0) return { num: vencidasPagarCount, bg: 'var(--danger)' };
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
                                                    <button key={m.id} onClick={() => { nav(m.id); setMobileOpen(false); }}
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
