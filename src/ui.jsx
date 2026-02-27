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
