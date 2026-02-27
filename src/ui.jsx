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
    MessageCircle, Sparkles, Bot, Scissors
} from 'lucide-react';

export const Ic = {
    Dash: () => <LayoutDashboard size={18} />,
    Usr: () => <User size={18} />,
    Box: () => <Box size={18} />,
    File: () => <FileText size={18} />,
    Calc: () => <Calculator size={18} />,
    Kb: () => <Trello size={18} />,
    Gear: () => <Settings size={18} />,
    Users: () => <Users size={18} />,
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
    Package: () => <Package size={18} />,
    Ruler: () => <Ruler size={16} />,
    Layers: () => <Layers size={18} />,
    Tag: () => <Tag size={14} />,
    Sliders: () => <SlidersHorizontal size={16} />,
    BarChart: () => <BarChart2 size={18} />,
    Calendar: () => <Calendar size={16} />,
    Arrow: () => <ArrowRight size={14} />,
    Briefcase: () => <Briefcase size={18} />,
    Printer: () => <Printer size={14} />,
    OS: () => <ClipboardList size={14} />,
    Image: () => <Image size={22} />,
    Dollar: () => <DollarSign size={18} />,
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
};

export const Z = {
    inp: "input-glass",
    btn: "btn-primary",
    btn2: "btn-secondary",
    btnD: "btn-danger",
    card: "glass-card p-5",
    h1: "text-xl font-semibold mb-0.5",
    sub: "text-sm text-[var(--text-muted)] mb-5",
    lbl: "label-text",
    th: "th-glass text-left",
    pg: "p-3 md:p-6 lg:p-8 max-w-7xl mx-auto w-full",
};

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
