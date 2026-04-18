import { Ic } from '../../ui';
import { Search } from 'lucide-react';

export default function Topbar({
    isMobile, setMobileOpen, pg, ALL_MENUS, nav,
    buscaRef, buscaQuery, setBuscaQuery, buscaResults, buscaOpen, setBuscaOpen,
    waUnread, notifsRef, showNotifs, setShowNotifs,
    notifs, notifBadgeColor, markAllRead, goToNotif, getNotifStyle,
}) {
    return (
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
                        padding: 8, borderRadius: 10, transition: 'background 0.15s', color: 'var(--success)',
                    }}
                    className="hover:bg-[var(--bg-hover)]"
                    title={`${waUnread} mensagem(ns) nao lida(s)`}
                >
                    <Ic.WhatsApp />
                    <span className="badge-pulse" style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'var(--success)', color: '#fff',
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
    );
}
