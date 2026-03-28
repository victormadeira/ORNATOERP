import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    LayoutDashboard, User, Box, FileText, Calculator, Trello,
    Settings, Users, Menu, X, Plus, Trash2, Edit, Copy,
    ChevronDown, ChevronRight, ChevronUp, Lock, LogOut, Sun, Moon, Search,
    Eye, Link, Bell, Clock, MapPin, Building2, ExternalLink, Send,
    FileCheck, Home, Phone, Mail, Folder, AlertCircle, CheckCircle2,
    Package, Ruler, Layers, Tag, SlidersHorizontal, FolderOpen,
    BarChart2, Calendar, ArrowRight, Briefcase, Printer, ClipboardList,
    Image, DollarSign, MessageSquare, HardHat, AlertTriangle, Wrench,
    BarChart3, ClipboardCheck, PauseCircle, PlayCircle, UserCheck, Warehouse,
    MessageCircle, Sparkles, Bot, Scissors,
    // Novos icones para menu agrupado e paginas
    Library, Cpu, FolderKanban, Wallet, ShieldCheck, Handshake,
    Factory, LineChart, Cog, Star, PieChart, FileSpreadsheet, Kanban,
    InboxIcon, PackageSearch, LayoutGrid, PenTool, Truck, ClipboardList as ClipList,
    Monitor, ShoppingCart
} from 'lucide-react';

export const Ic = {
    Dash: () => <LayoutDashboard size={18} />,
    Usr: () => <UserCheck size={18} />,
    Box: () => <Library size={18} />,
    File: () => <FileSpreadsheet size={18} />,
    Calc: () => <Calculator size={18} />,
    Kb: () => <Kanban size={18} />,
    Gear: () => <Settings size={18} />,
    Users: () => <ShieldCheck size={18} />,
    Menu: () => <Menu size={20} />,
    X: () => <X size={16} />,
    Plus: () => <Plus size={14} />,
    Trash: () => <Trash2 size={14} />,
    Edit: () => <Edit size={14} />,
    Copy: () => <Copy size={14} />,
    Chev: () => <ChevronDown size={14} />,
    ChevU: () => <ChevronUp size={14} />,
    ChevR: () => <ChevronRight size={14} />,
    Lock: () => <Lock size={16} />,
    Logout: () => <LogOut size={16} />,
    Sun: () => <Sun size={18} />,
    Moon: () => <Moon size={18} />,
    Search: () => <Search size={16} />,
    Eye: () => <Eye size={16} />,
    Link: () => <Link size={16} />,
    Bell: () => <Bell size={18} />,
    Clock: () => <Clock size={14} />,
    MapPin: () => <MapPin size={14} />,
    Building: () => <Building2 size={18} />,
    ExternalLink: () => <ExternalLink size={14} />,
    Send: () => <Send size={14} />,
    FileCheck: () => <FileCheck size={18} />,
    Home: () => <Home size={18} />,
    Phone: () => <Phone size={14} />,
    Mail: () => <Mail size={14} />,
    Folder: () => <Folder size={18} />,
    FolderOpen: () => <FolderOpen size={18} />,
    Alert: () => <AlertCircle size={16} />,
    Check: () => <CheckCircle2 size={16} />,
    Package: () => <Cpu size={18} />,
    Ruler: () => <Ruler size={16} />,
    Layers: () => <Layers size={18} />,
    Tag: () => <Tag size={14} />,
    Sliders: () => <SlidersHorizontal size={16} />,
    BarChart: () => <BarChart2 size={18} />,
    Calendar: () => <Calendar size={16} />,
    Arrow: () => <ArrowRight size={14} />,
    Briefcase: () => <FolderKanban size={18} />,
    Printer: () => <Printer size={14} />,
    OS: () => <ClipboardList size={14} />,
    Image: () => <Image size={22} />,
    Dollar: () => <Wallet size={18} />,
    Message: () => <MessageSquare size={16} />,
    HardHat: () => <HardHat size={18} />,
    AlertTriangle: () => <AlertTriangle size={14} />,
    Wrench: () => <Wrench size={12} />,
    BarChart3: () => <BarChart3 size={18} />,
    ClipboardCheck: () => <ClipboardCheck size={14} />,
    PauseCircle: () => <PauseCircle size={14} />,
    PlayCircle: () => <PlayCircle size={14} />,
    Warehouse: () => <Warehouse size={18} />,
    WhatsApp: () => <MessageCircle size={18} />,
    Sparkles: () => <Sparkles size={18} />,
    Bot: () => <Bot size={14} />,
    Scissors: () => <Scissors size={18} />,
    Star: () => <Star size={12} />,
    // Icones para grupos do menu
    Handshake: () => <Handshake size={14} />,
    Factory: () => <Factory size={14} />,
    LineChart: () => <LineChart size={14} />,
    Cog: () => <Cog size={14} />,
    PieChart: () => <PieChart size={18} />,
    LayoutGrid: () => <LayoutGrid size={18} />,
    PenTool: () => <PenTool size={18} />,
    Truck: () => <Truck size={18} />,
    Monitor: () => <Monitor size={18} />,
    ShoppingCart: () => <ShoppingCart size={18} />,
    ClipList: () => <ClipList size={18} />,
};

export const Z = {
    inp: "input-glass",
    btn: "btn-primary",
    btn2: "btn-secondary",
    btnD: "btn-danger",
    btnSm: "btn-primary btn-sm",
    btn2Sm: "btn-secondary btn-sm",
    btnDSm: "btn-danger btn-sm",
    card: "glass-card p-3 sm:p-5",
    h1: "text-xl font-semibold mb-0.5",
    sub: "text-sm text-[var(--text-muted)] mb-5",
    lbl: "label-text",
    th: "th-glass text-left",
    pg: "p-2 sm:p-3 md:p-6 lg:p-8 max-w-7xl mx-auto w-full page-enter",
};

// ─── PageHeader — cabecalho padronizado de pagina ─────────
export function PageHeader({ icon: Icon, title, subtitle, children }) {
    return (
        <div className="animate-fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                {Icon && (
                    <div style={{
                        width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                        background: 'var(--primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(19, 121, 240, 0.25)',
                    }}>
                        <Icon size={21} style={{ color: '#fff' }} />
                    </div>
                )}
                <div style={{ minWidth: 0 }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{title}</h1>
                    {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>{subtitle}</p>}
                </div>
            </div>
            {children && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>}
        </div>
    );
}

// ─── TabBar — abas padronizadas ───────────────────────────
export function TabBar({ tabs, active, onChange }) {
    return (
        <div style={{
            display: 'flex', gap: 0, borderBottom: '2px solid var(--border)',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
            marginBottom: 20,
        }}>
            {tabs.map(t => {
                const isActive = active === t.id;
                return (
                    <button key={t.id} onClick={() => onChange(t.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                        fontSize: 13, fontWeight: isActive ? 700 : 500, cursor: 'pointer',
                        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                        borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                        background: 'none', border: 'none', borderBottomWidth: 2,
                        marginBottom: -2, whiteSpace: 'nowrap', transition: 'all .2s',
                        fontFamily: 'var(--font-sans)',
                    }}>
                        {t.icon && <t.icon size={15} />}
                        {t.label}
                        {t.badge != null && t.badge > 0 && (
                            <span className="badge-pulse" style={{
                                fontSize: 10, fontWeight: 700, background: 'var(--danger)', color: '#fff',
                                padding: '1px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center',
                            }}>{t.badge}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ─── EmptyState — estado vazio padronizado ────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
    return (
        <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 12 }}>
            {Icon && (
                <div className="empty-state-icon">
                    <Icon size={28} style={{ color: 'var(--text-muted)' }} />
                </div>
            )}
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>{title}</h3>
            {description && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, textAlign: 'center', maxWidth: 320 }}>{description}</p>}
            {action && (
                <button onClick={action.onClick} className={Z.btn} style={{ marginTop: 8, fontSize: 13 }}>
                    <Plus size={14} /> {action.label}
                </button>
            )}
        </div>
    );
}

export const tagStyle = (c) => ({
    backgroundColor: c ? `${c}15` : 'var(--bg-muted)',
    color: c || 'var(--text-primary)',
    border: `1px solid ${c ? `${c}30` : 'var(--border)'}`
});
export const tagClass = "text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide inline-block";

export function Spinner({ size = 28, color = 'var(--primary)', text }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: text ? '40px 20px' : '20px', gap: 12 }}>
            <div style={{
                width: size, height: size,
                border: `2.5px solid ${color}25`,
                borderTopColor: color,
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
            }} />
            {text && <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{text}</span>}
        </div>
    );
}

/**
 * SearchableSelect — dropdown com busca por texto
 */
export function SearchableSelect({ value, onChange, options, groups, emptyOption, inheritOption, placeholder = 'Buscar...', className, style }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

    const allOpts = groups
        ? groups.flatMap(g => g.options)
        : (options || []);

    const selectedLabel = value === '' && emptyOption ? emptyOption
        : value === '' && inheritOption ? inheritOption
        : allOpts.find(o => String(o.value) === String(value))?.label || '';

    const q = search.toLowerCase();
    const filterOpts = (arr) => q ? arr.filter(o => o.label.toLowerCase().includes(q)) : arr;

    const select = (val) => {
        onChange(val);
        setOpen(false);
        setSearch('');
    };

    const itemStyle = (isActive) => ({
        padding: '6px 10px',
        fontSize: 12,
        cursor: 'pointer',
        background: isActive ? 'var(--primary)' : 'transparent',
        color: isActive ? '#fff' : 'var(--text-primary)',
        borderRadius: 6,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'background 0.15s',
    });

    return (
        <div ref={ref} style={{ position: 'relative', ...style }}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={className}
                style={{
                    width: '100%', textAlign: 'left', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    gap: 4, cursor: 'pointer', overflow: 'hidden',
                }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 12 }}>
                    {selectedLabel || <span style={{ color: 'var(--text-muted)' }}>Selecione...</span>}
                </span>
                <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </button>

            {open && (
                <div className="animate-scale-in" style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 10, boxShadow: 'var(--shadow-xl)',
                    zIndex: 999, maxHeight: 260, display: 'flex', flexDirection: 'column', minWidth: 200,
                }}>
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <input
                            ref={inputRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={placeholder}
                            style={{
                                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                                fontSize: 12, color: 'var(--text-primary)', padding: '2px 0',
                            }}
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} style={{ cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none', padding: 0 }}>
                                <X size={11} />
                            </button>
                        )}
                    </div>

                    <div style={{ overflowY: 'auto', padding: 4, flex: 1 }}>
                        {emptyOption && (!q || emptyOption.toLowerCase().includes(q)) && (
                            <div onClick={() => select('')} style={itemStyle(value === '')}
                                onMouseEnter={e => { if (value !== '') e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                onMouseLeave={e => { if (value !== '') e.currentTarget.style.background = 'transparent'; }}>
                                {emptyOption}
                            </div>
                        )}
                        {inheritOption && (!q || inheritOption.toLowerCase().includes(q)) && (
                            <div onClick={() => select('')} style={itemStyle(value === '')}
                                onMouseEnter={e => { if (value !== '') e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                onMouseLeave={e => { if (value !== '') e.currentTarget.style.background = 'transparent'; }}>
                                {inheritOption}
                            </div>
                        )}

                        {groups ? (
                            groups.map((g, gi) => {
                                const filtered = filterOpts(g.options);
                                if (filtered.length === 0) return null;
                                return (
                                    <div key={gi}>
                                        <div style={{ padding: '6px 8px 3px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                                            {g.label}
                                        </div>
                                        {filtered.map(o => (
                                            <div key={o.value} onClick={() => select(o.value)} style={itemStyle(String(value) === String(o.value))}
                                                onMouseEnter={e => { if (String(value) !== String(o.value)) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                                onMouseLeave={e => { if (String(value) !== String(o.value)) e.currentTarget.style.background = 'transparent'; }}>
                                                {o.label}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })
                        ) : (
                            filterOpts(allOpts).map(o => (
                                <div key={o.value} onClick={() => select(o.value)} style={itemStyle(String(value) === String(o.value))}
                                    onMouseEnter={e => { if (String(value) !== String(o.value)) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                    onMouseLeave={e => { if (String(value) !== String(o.value)) e.currentTarget.style.background = 'transparent'; }}>
                                    {o.label}
                                </div>
                            ))
                        )}

                        {q && filterOpts(allOpts).length === 0 && !(emptyOption && emptyOption.toLowerCase().includes(q)) && (
                            <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                                Nenhum resultado para "{search}"
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Badge — badge/tag unificado ────────────────────────
export function Badge({ label, color, icon: Icon, pulse }) {
    return (
        <span className={pulse ? 'badge-pulse' : ''} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
            color, background: `${color}15`,
            border: `1px solid ${color}30`,
            padding: '2px 8px', borderRadius: 20,
        }}>
            {Icon && <Icon size={10} />}{label}
        </span>
    );
}

// ─── CountUp — animated number ──────────────────────────
function useCountUp(target, duration = 800) {
    const [value, setValue] = useState(0);
    const frameRef = useRef(null);

    useEffect(() => {
        if (typeof target !== 'number' || isNaN(target)) { setValue(target); return; }
        const start = performance.now();
        const from = 0;
        const tick = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // easeOutExpo
            const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            setValue(from + (target - from) * eased);
            if (progress < 1) frameRef.current = requestAnimationFrame(tick);
        };
        frameRef.current = requestAnimationFrame(tick);
        return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
    }, [target, duration]);

    return value;
}

// ─── Sparkline — mini grafico SVG ───────────────────────
export function Sparkline({ data = [], color = 'var(--primary)', width = 80, height = 32 }) {
    if (!data || data.length < 2) return null;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
            <defs>
                <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polyline
                points={`0,${height} ${points} ${width},${height}`}
                fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, '')})`}
                stroke="none"
            />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// ─── KpiCard — card de metrica com count-up + sparkline ──
export function KpiCard({ label, value, color, icon: Icon, sub, sparkData, accent }) {
    // Parse numeric value for count-up
    const isMonetary = typeof value === 'string' && value.includes('R$');
    const numericVal = typeof value === 'number' ? value
        : typeof value === 'string' ? parseFloat(value.replace(/[^\d,.-]/g, '').replace(',', '.')) : NaN;
    const animated = useCountUp(isNaN(numericVal) ? 0 : numericVal, 900);

    const formatAnimated = () => {
        if (isNaN(numericVal)) return value;
        if (isMonetary) {
            return 'R$ ' + animated.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (Number.isInteger(numericVal)) return Math.round(animated).toLocaleString('pt-BR');
        return animated.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const accentColor = accent || color || 'var(--primary)';

    return (
        <div className="glass-card animate-fade-up hover-lift" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                {Icon && (
                    <div style={{
                        width: 34, height: 34, borderRadius: 10,
                        background: `${accentColor}12`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Icon size={16} style={{ color: accentColor }} />
                    </div>
                )}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                {formatAnimated()}
            </div>
            {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>}
            {sparkData && sparkData.length > 1 && (
                <div className="kpi-sparkline">
                    <Sparkline data={sparkData} color={accentColor} width={200} height={40} />
                </div>
            )}
        </div>
    );
}

// ─── SectionHeader — header padronizado para cards ──────
export function SectionHeader({ icon: Icon, title, children }) {
    return (
        <div style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(180deg, var(--bg-muted) 0%, transparent 100%)',
        }}>
            <span style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                {Icon && <Icon size={15} style={{ color: 'var(--primary)' }} />} {title}
            </span>
            {children}
        </div>
    );
}

// ─── ConfirmModal — confirmacao antes de acoes destrutivas ──
export function ConfirmModal({ title = 'Confirmar', message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onCancel}>
            <div className="glass-card shadow-xl modal-content" style={{ maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
                <div className="p-5">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: danger ? 'rgba(220,38,38,0.1)' : 'rgba(19,121,240,0.1)', flexShrink: 0 }}>
                            {danger
                                ? <AlertCircle size={18} style={{ color: 'var(--danger)' }} />
                                : <AlertCircle size={18} style={{ color: 'var(--primary)' }} />
                            }
                        </div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20, paddingLeft: 46 }}>{message}</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={onCancel} className="btn-secondary" style={{ fontSize: 13, padding: '8px 16px' }}>{cancelLabel}</button>
                        <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}
                            style={{ fontSize: 13, padding: '8px 16px', ...(danger ? { background: 'var(--danger)', color: '#fff', fontWeight: 600 } : {}) }}>
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function Modal({ title, close, children, w = 500 }) {
    // Bloquear scroll do body enquanto modal está aberto
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 md:p-4 modal-overlay" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={close}>
            <div className="glass-card w-[95vw] max-h-[90vh] overflow-y-auto modal-content" style={{ maxWidth: w, boxShadow: 'var(--shadow-xl)' }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center px-4 md:px-5 py-3 md:py-4" style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg-muted) 0%, transparent 100%)' }}>
                    <span className="font-semibold text-sm md:text-base truncate mr-2" style={{ color: 'var(--text-primary)' }}>{title}</span>
                    <button onClick={close} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }}>
                        <Ic.X />
                    </button>
                </div>
                <div className="p-4 md:p-5">{children}</div>
            </div>
        </div>,
        document.body
    );
}

// ─── Skeleton — loading placeholder ──────────────────────
export function Skeleton({ width, height = 14, rounded, className = '' }) {
    return (
        <div className={`skeleton ${className}`} style={{
            width: width || '100%',
            height,
            borderRadius: rounded ? '50%' : undefined,
        }} />
    );
}

export function SkeletonCard() {
    return (
        <div className="glass-card p-5" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Skeleton width={100} height={12} />
                <Skeleton width={32} height={32} rounded />
            </div>
            <Skeleton width={140} height={28} className="mb-2" />
            <Skeleton width={80} height={12} />
        </div>
    );
}
