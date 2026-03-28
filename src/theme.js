// ═══════════════════════════════════════════════════════════
// theme.js — Fonte Unica de Verdade para Design Tokens
// ═══════════════════════════════════════════════════════════

// ─── Helpers internos ────────────────────────────────
function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function darken(hex, pct) {
    const [r, g, b] = hexToRgb(hex);
    const f = 1 - pct;
    return rgbToHex(Math.round(r * f), Math.round(g * f), Math.round(b * f));
}

function lighten(hex, pct) {
    const [r, g, b] = hexToRgb(hex);
    return rgbToHex(
        Math.round(r + (255 - r) * pct),
        Math.round(g + (255 - g) * pct),
        Math.round(b + (255 - b) * pct)
    );
}

// ─── Aplicar cor primária dinâmica (white-label) ─────
export function applyPrimaryColor(hex) {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const root = document.documentElement;
    const [r, g, b] = hexToRgb(hex);
    const darkened = darken(hex, 0.12);
    const deepDark = darken(hex, 0.25);
    root.style.setProperty('--primary', hex);
    root.style.setProperty('--primary-hover', darkened);
    root.style.setProperty('--primary-light', `rgba(${r},${g},${b},0.08)`);
    root.style.setProperty('--primary-ring', `rgba(${r},${g},${b},0.2)`);
    root.style.setProperty('--primary-alpha', `rgba(${r},${g},${b},0.08)`);
    root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${hex} 0%, ${darkened} 50%, ${deepDark} 100%)`);
    root.style.setProperty('--primary-glow', `0 0 20px rgba(${r},${g},${b},0.3)`);
    root.style.setProperty('--shadow-glow', `0 0 30px rgba(${r},${g},${b},0.12)`);
    root.style.setProperty('--sidebar-indicator', hex);
    localStorage.setItem('sistema_cor_primaria', hex);
}

// Restaurar cor do localStorage no boot (antes do React montar)
const savedPrimary = typeof localStorage !== 'undefined' && localStorage.getItem('sistema_cor_primaria');
if (savedPrimary) applyPrimaryColor(savedPrimary);

// ─── Status de Projetos ─────────────────────────────
export const STATUS_PROJ = {
    nao_iniciado: { label: 'Nao iniciado', color: '#94a3b8', bg: '#f1f5f9' },
    em_andamento: { label: 'Em andamento', color: 'var(--primary)', bg: 'var(--primary-light)' },
    atrasado:     { label: 'Atrasado',     color: '#ef4444', bg: '#fef2f2' },
    concluido:    { label: 'Concluido',    color: '#22c55e', bg: '#f0fdf4' },
    suspenso:     { label: 'Suspenso',     color: '#f59e0b', bg: '#fffbeb' },
};

// ─── Status de Etapas ───────────────────────────────
export const STATUS_ETAPA = {
    nao_iniciado: { label: 'Nao iniciado', color: '#64748b' },
    pendente:     { label: 'Pendente',     color: '#64748b' },
    em_andamento: { label: 'Em andamento', color: 'var(--primary)' },
    concluida:    { label: 'Concluida',    color: '#22c55e' },
    atrasada:     { label: 'Atrasada',     color: '#ef4444' },
};

// ─── Categorias de Despesa (unificado) ──────────────
export const CATEGORIAS = [
    { id: 'material',     label: 'Material',     color: '#3b82f6' },
    { id: 'mao_de_obra',  label: 'Mao de Obra',  color: '#f59e0b' },
    { id: 'transporte',   label: 'Transporte',   color: '#8b5cf6' },
    { id: 'terceirizado', label: 'Terceirizado', color: '#ec4899' },
    { id: 'ferramentas',  label: 'Ferramentas',  color: '#14b8a6' },
    { id: 'acabamento',   label: 'Acabamento',   color: '#f97316' },
    { id: 'instalacao',   label: 'Instalacao',   color: '#06b6d4' },
    { id: 'aluguel',      label: 'Aluguel',      color: '#6366f1' },
    { id: 'energia',      label: 'Energia',      color: '#eab308' },
    { id: 'agua',         label: 'Agua',         color: '#22d3ee' },
    { id: 'internet',     label: 'Internet',     color: '#a855f7' },
    { id: 'telefone',     label: 'Telefone',     color: '#64748b' },
    { id: 'impostos',     label: 'Impostos',     color: '#ef4444' },
    { id: 'manutencao',   label: 'Manutencao',   color: '#84cc16' },
    { id: 'marketing',    label: 'Marketing',    color: '#d946ef' },
    { id: 'software',     label: 'Software',     color: '#0ea5e9' },
    { id: 'outros',       label: 'Outros',       color: '#94a3b8' },
];

// Lookups derivados
export const CAT_MAP = {};
CATEGORIAS.forEach(c => { CAT_MAP[c.id] = c; });
export const CAT_COLOR = {};
export const CAT_LABEL = {};
CATEGORIAS.forEach(c => { CAT_COLOR[c.id] = c.color; CAT_LABEL[c.id] = c.label; });

// ─── Cores Semanticas ───────────────────────────────
export const COLORS = {
    get primary() { return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#1379F0'; },
    success: '#22c55e',
    danger:  '#ef4444',
    warning: '#f59e0b',
    muted:   '#94a3b8',
};

// ─── Helpers de opacidade (padrao: 15% bg, 30% border) ──
export const colorBg = (c) => `${c}15`;
export const colorBorder = (c) => `${c}30`;
