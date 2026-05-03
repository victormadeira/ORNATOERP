// ═══════════════════════════════════════════════════════════════════
// safeParse.js — JSON.parse seguro para campos do banco de dados
// ─────────────────────────────────────────────────────────────────
// Problema: JSON.parse sem try/catch em rotas críticas significa que
// 1 registro corrompido no banco derruba a listagem inteira com 500.
// ═══════════════════════════════════════════════════════════════════

/**
 * Faz JSON.parse seguro — retorna `fallback` se a string for inválida.
 * @param {string|null|undefined} str
 * @param {*} fallback — valor retornado em caso de erro (default: null)
 */
export function safeParse(str, fallback = null) {
    if (str == null || str === '') return fallback;
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

export default safeParse;
