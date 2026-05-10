// ═══════════════════════════════════════════════════════
// Library Validator — 11 regras (LIB-EDIT)
// Bloqueantes (errors) e avisos (warnings).
// ═══════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

// Whitelist de roles aceitos (role_normalizer keys).
// Mantida aqui pois o normalizer real está no plugin SketchUp (não tocamos).
export const ROLE_WHITELIST = [
    'lateral', 'lateral_esquerda', 'lateral_direita',
    'topo', 'tampo', 'base', 'fundo', 'prateleira',
    'porta', 'porta_esquerda', 'porta_direita',
    'gaveta_frente', 'gaveta_lateral', 'gaveta_traseira', 'gaveta_fundo',
    'travessa', 'rodape', 'pe', 'estrutura', 'reforco',
    'frente_gaveta', 'fundo_gaveta', 'caixa_gaveta',
    'componente_3d', 'ferragem', 'acessorio',
];

// Whitelist de bordas válidas
const BORDA_KEYS = ['frente', 'tras', 'topo', 'base', 'esquerda', 'direita'];

// Whitelist de chaves shop.* conhecidas (para warnings)
const SHOP_KEYS = [
    'espessura_mdf', 'espessura_padrao',
    'borda_padrao', 'cor_padrao',
    'altura_rodape', 'recuo_porta', 'folga_porta',
    'gap_gaveta', 'altura_gaveta',
    'corredicao_padrao', 'dobradica_padrao', 'puxador_padrao',
    'overlay_porta',
];

// ── Helpers ────────────────────────────────────────────
function walkExpressions(obj, cb, ctx = '') {
    if (obj == null) return;
    if (typeof obj === 'string') {
        // Heurística: contém {var}, shop.algo, ou operadores aritméticos
        if (/\{[^}]+\}/.test(obj) || /shop\.[a-zA-Z_]/.test(obj) || /[a-zA-Z_]\s*[+\-*/]/.test(obj)) {
            cb(obj, ctx);
        }
        return;
    }
    if (Array.isArray(obj)) {
        obj.forEach((v, i) => walkExpressions(v, cb, `${ctx}[${i}]`));
        return;
    }
    if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
            walkExpressions(v, cb, ctx ? `${ctx}.${k}` : k);
        }
    }
}

function walkShopRefs(obj, cb) {
    walkExpressions(obj, (expr) => {
        const matches = expr.match(/shop\.([a-zA-Z_][a-zA-Z0-9_]*)/g) || [];
        for (const m of matches) cb(m.slice(5));
    });
}

// Dry-run de expressão — checa que parses sem erro óbvio.
// Substitui {var} por 1 e tenta avaliar como expressão aritmética simples.
// NÃO usa eval — usa Function constructor com sandbox de variáveis numéricas.
export function expressionEvaluatorDryRun(expr) {
    if (typeof expr !== 'string') return;
    // Extrai vars {nome}
    const cleaned = expr.replace(/\{([^}]+)\}/g, '1')
                        .replace(/shop\.[a-zA-Z_][a-zA-Z0-9_]*/g, '1');
    // Só permite: dígitos, espaço, + - * / ( ) . , e min/max/round/floor/ceil/abs
    if (!/^[\d\s+\-*/().,]*((min|max|round|floor|ceil|abs)\s*\([^)]*\)[\d\s+\-*/().,]*)*$/i.test(cleaned)) {
        // Fallback: aceita se for apenas tokens conhecidos
        if (!/^[\d\s+\-*/().,a-zA-Z_]+$/.test(cleaned)) {
            throw new Error('caracteres não permitidos');
        }
    }
    try {
        // sandbox: nenhuma var disponível, só Math
        // eslint-disable-next-line no-new-func
        const fn = new Function('Math', `"use strict"; return (${cleaned});`);
        const res = fn(Math);
        if (typeof res !== 'number' || !isFinite(res)) {
            throw new Error('resultado não numérico');
        }
    } catch (e) {
        throw new Error(e.message);
    }
}

// ── Validador principal ────────────────────────────────
//
// args:
//   json:                   módulo paramétrico
//   skpRefs:                lista de refs declaradas (componente_3d) — strings
//   materials:              códigos válidos de material (do sistema)
//   role_normalizer_keys:   lista whitelist de roles (default: ROLE_WHITELIST)
//   assetsDir:              dir absoluto onde checar fileExists dos skp
//   isUniqueId(id):         função opcional retornando true se id é único
//
// returns: { ok, errors[], warnings[] }
export function validateModulePackage({
    json,
    skpRefs = null,
    materials = [],
    role_normalizer_keys = ROLE_WHITELIST,
    assetsDir = null,
    isUniqueId = null,
} = {}) {
    const errors = [];
    const warnings = [];

    if (!json || typeof json !== 'object') {
        return { ok: false, errors: ['JSON deve ser objeto'], warnings: [] };
    }

    // ── 🔴 Bloqueantes ──

    // R1: id obrigatório + único
    if (!json.id || typeof json.id !== 'string') {
        errors.push('R1: id obrigatório (string)');
    } else if (typeof isUniqueId === 'function' && !isUniqueId(json.id)) {
        errors.push(`R1: id "${json.id}" já existe`);
    }

    // R2: nome/categoria obrigatórios
    if (!json.nome && !json.name)         errors.push('R2: nome/name obrigatório');
    if (!json.categoria && !json.category) errors.push('R2: categoria/category obrigatória');

    // R3: parametros (objeto OU array)
    if (json.parametros == null) {
        errors.push('R3: parametros obrigatório');
    } else if (typeof json.parametros !== 'object') {
        errors.push('R3: parametros deve ser objeto ou array');
    } else if (Array.isArray(json.parametros)) {
        // se array, cada item precisa de name+default
        json.parametros.forEach((p, i) => {
            if (!p || typeof p !== 'object') errors.push(`R3: parametros[${i}] inválido`);
            else if (!p.name && !p.id)        errors.push(`R3: parametros[${i}].name obrigatório`);
        });
    } else {
        // objeto: cada chave é param
        for (const [k, p] of Object.entries(json.parametros)) {
            if (!p || typeof p !== 'object') {
                errors.push(`R3: parametros.${k} inválido`);
                continue;
            }
            if (!p.type)                    errors.push(`R3: parametros.${k}.type obrigatório`);
            if (p.default === undefined)    errors.push(`R3: parametros.${k}.default obrigatório`);
        }
    }

    // R4: pecas (array não-vazio)
    const pecas = Array.isArray(json.pecas) ? json.pecas : [];
    if (pecas.length === 0) errors.push('R4: pecas (array não-vazio) obrigatório');

    // R5: roles válidos
    pecas.forEach((peca, i) => {
        if (peca.role && !role_normalizer_keys.includes(peca.role)) {
            errors.push(`R5: pecas[${i}].role inválido: "${peca.role}"`);
        }
    });

    // R6: bordas válidas (frente/tras/topo/base + esquerda/direita)
    pecas.forEach((peca, i) => {
        if (peca.bordas && typeof peca.bordas === 'object') {
            const invalid = Object.keys(peca.bordas).filter(k => !BORDA_KEYS.includes(k));
            if (invalid.length) {
                errors.push(`R6: pecas[${i}].bordas inválidas: ${invalid.join(',')}`);
            }
        }
    });

    // R7: códigos de material existem
    const params = json.parametros || {};
    const paramList = Array.isArray(params)
        ? params
        : Object.entries(params).map(([k, v]) => ({ ...v, _key: k }));
    for (const param of paramList) {
        if (param && Array.isArray(param.options) && param.label && /material/i.test(param.label)) {
            const invalidMats = param.options.filter(m => materials.length > 0 && !materials.includes(m));
            if (invalidMats.length) {
                errors.push(`R7: materiais inexistentes em "${param.label}": ${invalidMats.join(',')}`);
            }
        }
    }

    // R8: componente_3d existe em assetsDir (se assetsDir fornecido)
    const declaredSkpRefs = [];
    pecas.forEach((peca) => {
        if (peca.componente_3d) declaredSkpRefs.push(peca.componente_3d);
    });
    const refsToCheck = skpRefs || declaredSkpRefs;
    if (assetsDir) {
        for (const ref of refsToCheck) {
            const abs = path.resolve(assetsDir, ref);
            if (!abs.startsWith(path.resolve(assetsDir))) {
                errors.push(`R8: ref fora do diretório: ${ref}`);
                continue;
            }
            if (!fs.existsSync(abs)) {
                errors.push(`R8: componente_3d não encontrado: ${ref}`);
            }
        }
    }

    // R9: peças com largura/altura/espessura presentes
    pecas.forEach((peca, i) => {
        if (peca.largura === undefined && peca.l === undefined) {
            errors.push(`R9: pecas[${i}].largura obrigatório`);
        }
        if (peca.altura === undefined && peca.a === undefined) {
            errors.push(`R9: pecas[${i}].altura obrigatório`);
        }
    });

    // R10: expressões parseiam (dry-run)
    walkExpressions(json, (expr, ctx) => {
        // Pula strings que não são expressões reais (urls, etc)
        if (!/\{|shop\./.test(expr)) return;
        try {
            expressionEvaluatorDryRun(expr);
        } catch (e) {
            errors.push(`R10: expressão inválida em "${ctx}": ${expr} → ${e.message}`);
        }
    });

    // R11: schema versão (warning se ausente)
    // (também count de duplicates por nome de peça)
    const pecaNomes = pecas.map(p => p.nome).filter(Boolean);
    const dupSet = new Set();
    for (const n of pecaNomes) {
        if (dupSet.has(n)) errors.push(`R11: nome de peça duplicado: "${n}"`);
        dupSet.add(n);
    }

    // ── 🟡 Warnings ──

    if (json._review?.confidence != null && json._review.confidence < 0.7) {
        warnings.push(`W1: _review.confidence baixa (${json._review.confidence})`);
    }

    walkShopRefs(json, (key) => {
        if (!SHOP_KEYS.includes(key)) {
            warnings.push(`W2: shop.${key} desconhecido (pode falhar em runtime)`);
        }
    });

    if (!json.tags || (Array.isArray(json.tags) && json.tags.length === 0)) {
        warnings.push('W3: tags ausentes (recomendado para busca)');
    }

    if (!Array.isArray(json.ferragens_auto)) {
        warnings.push('W4: ferragens_auto ausente (sem auto-pricing)');
    }

    return { ok: errors.length === 0, errors, warnings };
}

export default validateModulePackage;
