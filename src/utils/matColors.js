// ═══════════════════════════════════════════════════════
// matColors.js — Mapeamento de material → cor para visualização
// Cores para visualização de materiais
// ═══════════════════════════════════════════════════════

export const MAT_COLORS = {
    mdf18: '#D4A574', mdf15: '#C49A6C', mdf25: '#BA8C5E',
    mdp18: '#E8D4B8', mdp15: '#F0E6D3', mdp25: '#D8C4A8',
    comp3: '#B8956A', comp6: '#A88558',
    lam_freijo: '#8B6914', lam_carv: '#A0522D',
    laca_branca: '#F5F5F5', laca_color: '#E0E0E0',
    bp_branco: '#FAFAFA', bp_cinza: '#D5D5D5', bp_nogueira: '#7B5B3A',
};

export const DEFAULT_COLOR = '#D4A574';

export function getMatColor(matId) {
    if (!matId) return DEFAULT_COLOR;
    if (MAT_COLORS[matId]) return MAT_COLORS[matId];
    for (const [k, v] of Object.entries(MAT_COLORS)) {
        if (matId.startsWith(k.split('_')[0])) return v;
    }
    return DEFAULT_COLOR;
}

/** Converte hex (#RRGGBB) para número Three.js (0xRRGGBB) */
export function hexToThreeColor(hex) {
    return parseInt(hex.replace('#', ''), 16);
}
