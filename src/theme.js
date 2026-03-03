// ═══════════════════════════════════════════════════════════
// theme.js — Fonte Única de Verdade para Design Tokens
// ═══════════════════════════════════════════════════════════

// ─── Status de Projetos ─────────────────────────────
export const STATUS_PROJ = {
    nao_iniciado: { label: 'Não iniciado', color: '#94a3b8', bg: '#f1f5f9' },
    em_andamento: { label: 'Em andamento', color: '#1379F0', bg: '#eff6ff' },
    atrasado:     { label: 'Atrasado',     color: '#ef4444', bg: '#fef2f2' },
    concluido:    { label: 'Concluído',    color: '#22c55e', bg: '#f0fdf4' },
    suspenso:     { label: 'Suspenso',     color: '#f59e0b', bg: '#fffbeb' },
};

// ─── Status de Etapas ───────────────────────────────
export const STATUS_ETAPA = {
    nao_iniciado: { label: 'Não iniciado', color: '#64748b' },
    pendente:     { label: 'Pendente',     color: '#64748b' },
    em_andamento: { label: 'Em andamento', color: '#1379F0' },
    concluida:    { label: 'Concluída',    color: '#22c55e' },
    atrasada:     { label: 'Atrasada',     color: '#ef4444' },
};

// ─── Categorias de Despesa (unificado) ──────────────
export const CATEGORIAS = [
    { id: 'material',     label: 'Material',     color: '#3b82f6' },
    { id: 'mao_de_obra',  label: 'Mão de Obra',  color: '#f59e0b' },
    { id: 'transporte',   label: 'Transporte',   color: '#8b5cf6' },
    { id: 'terceirizado', label: 'Terceirizado', color: '#ec4899' },
    { id: 'ferramentas',  label: 'Ferramentas',  color: '#14b8a6' },
    { id: 'acabamento',   label: 'Acabamento',   color: '#f97316' },
    { id: 'instalacao',   label: 'Instalação',   color: '#06b6d4' },
    { id: 'aluguel',      label: 'Aluguel',      color: '#6366f1' },
    { id: 'energia',      label: 'Energia',      color: '#eab308' },
    { id: 'agua',         label: 'Água',         color: '#22d3ee' },
    { id: 'internet',     label: 'Internet',     color: '#a855f7' },
    { id: 'telefone',     label: 'Telefone',     color: '#64748b' },
    { id: 'impostos',     label: 'Impostos',     color: '#ef4444' },
    { id: 'manutencao',   label: 'Manutenção',   color: '#84cc16' },
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

// ─── Cores Semânticas ───────────────────────────────
export const COLORS = {
    primary: '#1379F0',
    success: '#22c55e',
    danger:  '#ef4444',
    warning: '#f59e0b',
    muted:   '#94a3b8',
};

// ─── Helpers de opacidade (padrão: 15% bg, 30% border) ──
export const colorBg = (c) => `${c}15`;
export const colorBorder = (c) => `${c}30`;
