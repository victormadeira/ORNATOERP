import { useState, useRef, useEffect } from 'react';
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
    // Novos ícones para menu agrupado e páginas
    Library, Cpu, FolderKanban, Wallet, ShieldCheck, Handshake,
    Factory, LineChart, Cog, Star, PieChart, FileSpreadsheet, Kanban,
    InboxIcon, PackageSearch
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
    // Ícones para grupos do menu
    Handshake: () => <Handshake size={14} />,
    Factory: () => <Factory size={14} />,
    LineChart: () => <LineChart size={14} />,
    Cog: () => <Cog size={14} />,
    PieChart: () => <PieChart size={18} />,
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
    pg: "p-2 sm:p-3 md:p-6 lg:p-8 max-w-7xl mx-auto w-full",
};

// ─── PageHeader — cabeçalho padronizado de página ─────────
export function PageHeader({ icon: Icon, title, subtitle, children }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {Icon && (
                    <div style={{
                        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                        background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Icon size={20} style={{ color: '#fff' }} />
                    </div>
                )}
                <div style={{ minWidth: 0 }}>
                    <h1 className={Z.h1} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
                    {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{subtitle}</p>}
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
                        marginBottom: -2, whiteSpace: 'nowrap', transition: 'all .15s',
                        fontFamily: 'var(--font-sans)',
                    }}>
                        {t.icon && <t.icon size={15} />}
                        {t.label}
                        {t.badge != null && t.badge > 0 && (
                            <span style={{
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 12 }}>
            {Icon && (
                <div style={{
                    width: 56, height: 56, borderRadius: 16,
                    background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
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
 * Props:
 *   value        - valor selecionado atual
 *   onChange(val) - callback ao selecionar
 *   options      - [{ value, label }]  (flat list, sem grupos)
 *   groups       - [{ label, options: [{ value, label }] }]  (com grupos)
 *   emptyOption  - texto da opção vazia (ex: "Sem tamponamento")
 *   inheritOption - texto da opção herdar (ex: "↩ Herdar: MDF Branco")
 *   placeholder  - placeholder do input de busca
 *   className    - classe CSS do container
 *   style        - style adicional do container
 */
export function SearchableSelect({ value, onChange, options, groups, emptyOption, inheritOption, placeholder = 'Buscar...', className, style }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);
    const inputRef = useRef(null);

    // close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // focus input on open
    useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

    // build flat list for finding selected label
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
        borderRadius: 4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    });

    return (
        <div ref={ref} style={{ position: 'relative', ...style }}>
            {/* Trigger button */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={className}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 4,
                    cursor: 'pointer',
                    overflow: 'hidden',
                }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontSize: 12 }}>
                    {selectedLabel || <span style={{ color: 'var(--text-muted)' }}>Selecione...</span>}
                </span>
                <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                    zIndex: 999,
                    maxHeight: 260,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 200,
                }}>
                    {/* Search input */}
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <input
                            ref={inputRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={placeholder}
                            style={{
                                flex: 1,
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                fontSize: 12,
                                color: 'var(--text-primary)',
                                padding: '2px 0',
                            }}
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} style={{ cursor: 'pointer', color: 'var(--text-muted)', background: 'none', border: 'none', padding: 0 }}>
                                <X size={11} />
                            </button>
                        )}
                    </div>

                    {/* Options list */}
                    <div style={{ overflowY: 'auto', padding: 4, flex: 1 }}>
                        {/* Empty / inherit option */}
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

                        {/* No results */}
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
export function Badge({ label, color, icon: Icon }) {
    return (
        <span style={{
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

// ─── KpiCard — card de métrica padronizado ──────────────
export function KpiCard({ label, value, color, icon: Icon, sub }) {
    return (
        <div className="glass-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                {Icon && (
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={14} style={{ color }} />
                    </div>
                )}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

// ─── SectionHeader — header padronizado para cards ──────
export function SectionHeader({ icon: Icon, title, children }) {
    return (
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {Icon && <Icon size={15} style={{ color: 'var(--primary)' }} />} {title}
            </span>
            {children}
        </div>
    );
}

// ─── ConfirmModal — confirmação antes de ações destrutivas ──
export function ConfirmModal({ title = 'Confirmar', message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onCancel}>
            <div className="glass-card shadow-xl animate-fade-up" style={{ maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
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
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={close}>
            <div className="glass-card shadow-xl w-[95vw] max-h-[90vh] overflow-y-auto animate-fade-up" style={{ maxWidth: w }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center px-4 md:px-5 py-3 md:py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <span className="font-semibold text-sm md:text-base truncate mr-2">{title}</span>
                    <button onClick={close} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }}>
                        <Ic.X />
                    </button>
                </div>
                <div className="p-4 md:p-5">{children}</div>
            </div>
        </div>
    );
}
