// ═══════════════════════════════════════════════════════════════════
// dateBR.js — Helpers de data no fuso de São Paulo (UTC-3, sem DST)
// Brasil aboliu horário de verão em 2019 — SP é sempre UTC-3.
// ─────────────────────────────────────────────────────────────────
// Problema: new Date().toISOString() e date('now') do SQLite retornam
// UTC. Das 21h–23h59 SP (00h–02h59 UTC do dia seguinte) o sistema
// considerava "hoje" como amanhã → contas/dashboards errados.
// ═══════════════════════════════════════════════════════════════════

const SP_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3, fixo

/** Retorna 'YYYY-MM-DD' de hoje no fuso SP */
export function todayBR() {
    return new Date(Date.now() - SP_OFFSET_MS).toISOString().slice(0, 10);
}

/** Retorna 'YYYY-MM-DD' de daqui a +N dias, no fuso SP */
export function todayPlusDaysBR(days) {
    return new Date(Date.now() - SP_OFFSET_MS + days * 86400000).toISOString().slice(0, 10);
}

/** Retorna 'YYYY-MM-DD' do primeiro dia do mês corrente em SP */
export function monthStartBR() {
    return todayBR().slice(0, 7) + '-01';
}

/** Retorna 'YYYY-MM' do mês corrente em SP */
export function yearMonthBR() {
    return todayBR().slice(0, 7);
}

/**
 * Retorna modificador SQLite equivalente a "hoje em SP".
 * Uso: `WHERE data_vencimento < ${SQL_TODAY_SP}`
 *
 * Exemplo:     date('now', '-3 hours')
 * Com offset:  date('now', '-3 hours', '+7 days')
 */
export function sqlToday(extra = '') {
    return extra ? `date('now', '-3 hours', '${extra}')` : `date('now', '-3 hours')`;
}

export default { todayBR, todayPlusDaysBR, monthStartBR, yearMonthBR, sqlToday };
