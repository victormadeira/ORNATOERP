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
    nao_iniciado: { label: 'Nao iniciado', color: 'var(--muted)',   bg: 'var(--muted-bg)' },
    em_andamento: { label: 'Em andamento', color: 'var(--primary)', bg: 'var(--primary-light)' },
    atrasado:     { label: 'Atrasado',     color: 'var(--danger)',  bg: 'var(--danger-bg)' },
    concluido:    { label: 'Concluido',    color: 'var(--success)', bg: 'var(--success-bg)' },
    suspenso:     { label: 'Suspenso',     color: 'var(--warning)', bg: 'var(--warning-bg)' },
};

// ─── Status de Etapas ───────────────────────────────
export const STATUS_ETAPA = {
    nao_iniciado: { label: 'Nao iniciado', color: 'var(--muted)' },
    pendente:     { label: 'Pendente',     color: 'var(--muted)' },
    em_andamento: { label: 'Em andamento', color: 'var(--primary)' },
    concluida:    { label: 'Concluida',    color: 'var(--success)' },
    atrasada:     { label: 'Atrasada',     color: 'var(--danger)' },
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
// Getters leem do CSS em runtime — respondem ao tema (light/dark) e config dinâmica
function cssVar(name, fallback) {
    if (typeof document === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
export const COLORS = {
    get primary() { return cssVar('--primary', '#1379F0'); },
    get success() { return cssVar('--success', '#6B8E4E'); },
    get danger()  { return cssVar('--danger',  '#A0473A'); },
    get warning() { return cssVar('--warning', '#C9882B'); },
    get info()    { return cssVar('--info',    '#5B7B8A'); },
    get muted()   { return cssVar('--muted',   '#8B7D6E'); },
};

// ─── Status Unificado (usar em TODAS as páginas) ────
// Usa var(--*) para responder a tema e config — sem hex hardcoded
export const STATUS_COLORS = {
    // Genéricos
    pendente:      { label: 'Pendente',      color: 'var(--warning)', bg: 'var(--warning-bg)', icon: 'clock' },
    em_andamento:  { label: 'Em andamento',  color: 'var(--info)',    bg: 'var(--info-bg)',    icon: 'play' },
    concluido:     { label: 'Concluído',     color: 'var(--success)', bg: 'var(--success-bg)', icon: 'check' },
    concluida:     { label: 'Concluída',     color: 'var(--success)', bg: 'var(--success-bg)', icon: 'check' },
    atrasado:      { label: 'Atrasado',      color: 'var(--danger)',  bg: 'var(--danger-bg)',  icon: 'alert' },
    atrasada:      { label: 'Atrasada',      color: 'var(--danger)',  bg: 'var(--danger-bg)',  icon: 'alert' },
    suspenso:      { label: 'Suspenso',      color: 'var(--muted)',   bg: 'var(--muted-bg)',   icon: 'pause' },
    cancelado:     { label: 'Cancelado',     color: 'var(--muted)',   bg: 'var(--muted-bg)',   icon: 'x' },
    nao_iniciado:  { label: 'Não iniciado',  color: 'var(--muted)',   bg: 'var(--muted-bg)',   icon: 'circle' },

    // CNC específicos
    em_corte:      { label: 'Em corte',      color: '#8b5cf6',        bg: '#f5f3ff',           icon: 'scissors' },
    cortada:       { label: 'Cortada',       color: 'var(--success)', bg: 'var(--success-bg)', icon: 'check' },
    conferida:     { label: 'Conferida',     color: 'var(--success)', bg: 'var(--success-bg)', icon: 'checkDouble' },

    // Produção/Expedição
    em_producao:   { label: 'Em produção',   color: 'var(--info)',    bg: 'var(--info-bg)',    icon: 'factory' },
    aguardando:    { label: 'Aguardando',    color: 'var(--warning)', bg: 'var(--warning-bg)', icon: 'clock' },
    expedido:      { label: 'Expedido',      color: 'var(--info)',    bg: 'var(--info-bg)',    icon: 'truck' },
    entregue:      { label: 'Entregue',      color: 'var(--success)', bg: 'var(--success-bg)', icon: 'check' },
    instalando:    { label: 'Instalando',    color: '#8b5cf6',        bg: '#f5f3ff',           icon: 'wrench' },

    // Financeiro
    pago:          { label: 'Pago',          color: 'var(--success)', bg: 'var(--success-bg)', icon: 'check' },
    vencido:       { label: 'Vencido',       color: 'var(--danger)',  bg: 'var(--danger-bg)',  icon: 'alert' },
    a_vencer:      { label: 'A vencer',      color: 'var(--warning)', bg: 'var(--warning-bg)', icon: 'clock' },
};

// Helper: buscar status com fallback
export function getStatus(key) {
    return STATUS_COLORS[key] || { label: key, color: 'var(--muted)', bg: 'var(--muted-bg)', icon: 'circle' };
}

// ─── Escala de Espaçamento (múltiplos de 4) ─────────
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32, '4xl': 48 };

// ─── Escala de Border Radius (sincronizada com --radius-* em index.css) ──
// Use estes em inline styles. Para classNames Tailwind, prefira rounded-{sm,md,lg}.
export const R = {
    xs: 4,    // badges pequenos, indicadores
    sm: 6,    // chips, inputs pequenos
    md: 8,    // padrão — botões, cards, inputs
    lg: 12,   // modais, cards destacados
    xl: 16,   // hero, banners
    '2xl': 24, // landing hero
    pill: 999, // pills, avatars circulares
};

// ─── Escala Tipográfica em PIXELS ───────────────────
// Use T.* em vez de números mágicos em inline styles (fontSize: T.sm).
// 778x ocorrências de fontSize:11 e 753x de fontSize:10 estavam espalhadas
// sem hierarquia — esta escala define os pontos canônicos.
export const T = {
    xs: 10,    // legendas, badges micro
    sm: 11,    // labels, helpers, body em tabela densa
    base: 12,  // body padrão em ERP denso
    md: 13,    // body principal, conteúdo confortável
    lg: 15,    // subtítulos
    xl: 18,    // títulos de seção
    '2xl': 24, // títulos de página
    '3xl': 32, // KPIs grandes, hero
    '4xl': 40, // landing hero
};

// ─── Escala Tipográfica em REM (legacy — manter por enquanto) ─────────
export const FONT = {
    caption: '0.6875rem',   // 11px
    small:   '0.75rem',     // 12px
    body:    '0.8125rem',   // 13px
    base:    '0.875rem',    // 14px
    h3:      '1rem',        // 16px
    h2:      '1.125rem',    // 18px
    h1:      '1.375rem',    // 22px
};

// ─── Helpers de opacidade (padrao: 15% bg, 30% border) ──
// Suporte a CSS vars: se receber `var(--success)`, retorna `var(--success-bg)`
// (os tokens -bg e -border estão definidos em index.css para success/danger/warning/info/muted).
// Para hex, mantém o append de alpha (#ef444415).
const _SEM_VARS = new Set(['--success', '--danger', '--warning', '--info', '--muted']);
function _isSemanticVar(c) {
    const m = /^var\((--[a-z-]+)\)$/i.exec(c || '');
    return m && _SEM_VARS.has(m[1].toLowerCase()) ? m[1] : null;
}
export const colorBg = (c) => {
    if (!c) return '';
    const sv = _isSemanticVar(c);
    if (sv) return `var(${sv}-bg)`;
    if (c === 'var(--primary)') return 'var(--primary-light)';
    if (c.startsWith('var(')) return c; // fallback seguro
    return `${c}15`;
};
export const colorBorder = (c) => {
    if (!c) return '';
    const sv = _isSemanticVar(c);
    if (sv) return `var(${sv}-border)`;
    if (c === 'var(--primary)') return 'var(--primary-ring)';
    if (c.startsWith('var(')) return c;
    return `${c}30`;
};
