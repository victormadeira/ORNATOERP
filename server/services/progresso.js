// ═══════════════════════════════════════════════════════
// progresso.js — cálculo ponderado de progresso de projeto
// ═══════════════════════════════════════════════════════
//
// Antes: % = (etapas concluídas / total) * 100. Concluir Medição+Aprovação+Compra
// (3 etapas leves) dava 50% sem ter produzido nada. Cliente via 50% no portal
// e ficava frustrado por achar que "tava quase".
//
// Agora: peso por tipo de etapa (detectado por regex no nome) + progresso
// parcial das em andamento. Soma ponderada normalizada → 0-100%.
//
// Pesos default:
//   medição: 5, aprovação: 5, compra: 5
//   produção: 35, acabamento: 20, entrega: 30
//   default (etapa custom): 10
//
// Editável em empresa_config.progresso_pesos_json via Cfg.

import db from '../db.js';

const DEFAULT_PESOS = {
    medicao:    5,
    aprovacao:  5,
    compra:     5,
    producao:   35,
    acabamento: 20,
    entrega:    30,
    default:    10,
};

let _cachedPesos = null;
let _cacheExpire = 0;

/** Carrega pesos configurados (com cache de 60s). */
export function getPesosConfig() {
    const now = Date.now();
    if (_cachedPesos && now < _cacheExpire) return _cachedPesos;
    try {
        const row = db.prepare('SELECT progresso_pesos_json FROM empresa_config WHERE id = 1').get();
        if (row?.progresso_pesos_json) {
            const parsed = JSON.parse(row.progresso_pesos_json);
            _cachedPesos = { ...DEFAULT_PESOS, ...parsed };
        } else {
            _cachedPesos = { ...DEFAULT_PESOS };
        }
    } catch (err) {
        console.error('[progresso] Erro lendo pesos:', err.message);
        _cachedPesos = { ...DEFAULT_PESOS };
    }
    _cacheExpire = now + 60_000;
    return _cachedPesos;
}

/** Limpa o cache (chamar após salvar novos pesos). */
export function invalidatePesosCache() {
    _cachedPesos = null;
    _cacheExpire = 0;
}

/** Detecta a "categoria" da etapa pelo nome via regex case-insensitive. */
export function categoriaDaEtapa(nome) {
    if (!nome) return 'default';
    const n = String(nome).toLowerCase();
    if (/medi[çc][ãa]o|levantamento/.test(n)) return 'medicao';
    if (/aprova[çc][ãa]o|projeto\s*3d|render/.test(n)) return 'aprovacao';
    if (/compra|material/.test(n)) return 'compra';
    if (/produ[çc][ãa]o|fabrica|f[aá]brica/.test(n)) return 'producao';
    if (/acabamento|pintura|laca/.test(n)) return 'acabamento';
    if (/entrega|instala[çc][ãa]o|montagem/.test(n)) return 'entrega';
    return 'default';
}

/** Peso (1-100) de uma etapa baseado em seu nome. */
export function pesoDaEtapa(nome, pesos = null) {
    const p = pesos || getPesosConfig();
    const cat = categoriaDaEtapa(nome);
    return Number(p[cat] ?? p.default ?? 10);
}

/**
 * Calcula progresso ponderado do projeto (0-100).
 * Considera:
 *  - peso da etapa (via categoria detectada)
 *  - progresso parcial: etapa.progresso (0-100) quando em andamento
 *  - status 'concluida' = 100% do peso, independente de progresso
 *
 * Retorna inteiro arredondado.
 */
export function calcularProgressoProjeto(etapas, pesos = null) {
    if (!Array.isArray(etapas) || etapas.length === 0) return 0;
    const p = pesos || getPesosConfig();
    let totalPeso = 0;
    let acumulado = 0;
    for (const e of etapas) {
        const peso = pesoDaEtapa(e?.nome, p);
        if (peso <= 0) continue;
        const status = e?.status || 'nao_iniciado';
        let progPct;
        if (status === 'concluida') progPct = 100;
        else if (status === 'em_andamento' || status === 'atrasada') {
            progPct = Math.max(0, Math.min(100, Number(e?.progresso ?? 0)));
        } else progPct = 0;
        totalPeso += peso;
        acumulado += peso * (progPct / 100);
    }
    if (totalPeso === 0) return 0;
    return Math.round((acumulado / totalPeso) * 100);
}

/**
 * Versão verbose para debug/admin — retorna progresso + breakdown por etapa.
 */
export function calcularProgressoProjetoVerbose(etapas, pesos = null) {
    const p = pesos || getPesosConfig();
    const breakdown = (etapas || []).map(e => {
        const peso = pesoDaEtapa(e?.nome, p);
        const status = e?.status || 'nao_iniciado';
        const progPct = status === 'concluida' ? 100
            : (status === 'em_andamento' || status === 'atrasada') ? Math.max(0, Math.min(100, Number(e?.progresso ?? 0)))
            : 0;
        return {
            id: e?.id,
            nome: e?.nome,
            categoria: categoriaDaEtapa(e?.nome),
            peso,
            status,
            progresso: progPct,
            contribuicao: Math.round(peso * (progPct / 100) * 10) / 10,
        };
    });
    return { progresso: calcularProgressoProjeto(etapas, p), breakdown, pesos: p };
}
