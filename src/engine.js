// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const R$ = v => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
export const N = (v, d = 2) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0);
export const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

// ═══════════════════════════════════════════════════════
// BANCO DE DADOS PADRÃO (fallback quando não há biblioteca do banco)
// ═══════════════════════════════════════════════════════
export const DB_CHAPAS = [
    { id: "mdf15", nome: "MDF 15mm", esp: 15, larg: 2750, alt: 1850, preco: 189.90, perda_pct: 15 },
    { id: "mdf18", nome: "MDF 18mm", esp: 18, larg: 2750, alt: 1850, preco: 219.90, perda_pct: 15 },
    { id: "mdf25", nome: "MDF 25mm", esp: 25, larg: 2750, alt: 1850, preco: 289.90, perda_pct: 15 },
    { id: "mdp15", nome: "MDP 15mm BP", esp: 15, larg: 2750, alt: 1850, preco: 149.90, perda_pct: 15 },
    { id: "mdp18", nome: "MDP 18mm BP", esp: 18, larg: 2750, alt: 1850, preco: 169.90, perda_pct: 15 },
    { id: "comp3", nome: "Compensado 3mm", esp: 3, larg: 2200, alt: 1600, preco: 42.90, perda_pct: 10 },
];
export const DB_FITAS = [
    { id: "fita22", nome: "Fita de Borda 22mm", larg: 22, preco: 0.85 },
    { id: "fita35", nome: "Fita de Borda 35mm", larg: 35, preco: 1.20 },
];
export const DB_FERRAGENS = [
    { id: "corr350", nome: "Corrediça 350mm",         preco: 28.90, un: "par", categoria: "corrediça" },
    { id: "corr400", nome: "Corrediça 400mm",         preco: 32.90, un: "par", categoria: "corrediça" },
    { id: "corr500", nome: "Corrediça 500mm",         preco: 42.90, un: "par", categoria: "corrediça" },
    { id: "corrFH",  nome: "Corrediça Full Ext. Soft",preco: 68.90, un: "par", categoria: "corrediça" },
    { id: "dob110",  nome: "Dobradiça 110° Amort.",   preco:  8.90, un: "un",  categoria: "dobradiça" },
    { id: "dob165",  nome: "Dobradiça 165° Amort.",   preco: 14.90, un: "un",  categoria: "dobradiça" },
    { id: "pux128",  nome: "Puxador 128mm",           preco: 12.90, un: "un",  categoria: "puxador"   },
    { id: "pux160",  nome: "Puxador 160mm",           preco: 16.90, un: "un",  categoria: "puxador"   },
    { id: "pux256",  nome: "Puxador 256mm",           preco: 22.90, un: "un",  categoria: "puxador"   },
    { id: "pistGas", nome: "Pistão a Gás 100N",       preco: 34.90, un: "par", categoria: "articulador"},
    { id: "cabOval", nome: "Cabideiro Tubo Oval",     preco: 18.90, un: "m",   categoria: "cabideiro" },
    { id: "sapReg",  nome: "Sapateira Regulável",     preco: 45.90, un: "un",  categoria: ""          },
    { id: "cestoAr", nome: "Cesto Aramado",           preco: 65.90, un: "un",  categoria: ""          },
];
// Grupos de ferragens com substituição global no orçamento.
// Mapeamento: chave do grupo → valor do campo `categoria` na biblioteca.
// Apenas estes 3 grupos têm substituição global — puxadores são trocados individualmente por componente.
export const FERR_GROUPS = {
    corredica:   'corrediça',
    dobradica:   'dobradiça',
    articulador: 'articulador',
};

export const DB_ACABAMENTOS = [
    { id: "bp_branco", nome: "BP Branco TX", preco: 0, un: "incluso" },
    { id: "bp_cinza", nome: "BP Cinza Etna", preco: 0, un: "incluso" },
    { id: "bp_nogueira", nome: "BP Nogueira Boreal", preco: 0, un: "incluso" },
    { id: "lam_freijo", nome: "Lâmina Natural Freijó", preco: 85.00, un: "m²" },
    { id: "lam_carv", nome: "Lâmina Natural Carvalho", preco: 95.00, un: "m²" },
    { id: "laca_branca", nome: "Laca PU Branca Fosca", preco: 120.00, un: "m²" },
    { id: "laca_color", nome: "Laca PU Colorida Fosca", preco: 135.00, un: "m²" },
];

// ═══════════════════════════════════════════════════════
// CATÁLOGO LEGADO — mantido apenas para compatibilidade
// (novo sistema usa calcItemV2 com dados do banco)
// ═══════════════════════════════════════════════════════
export const CATALOGO = [];

// ═══════════════════════════════════════════════════════
// MOTOR PARAMÉTRICO (bugs corrigidos)
// ═══════════════════════════════════════════════════════
const SAFE_EXPR = /^[\d\s+\-*/().?:<>=]+$/;

// FIX #3: Substituir variáveis de nome longo ANTES das de nome curto
// Ordem: Li, Ai, Pi, Lp, Ap, Lg, Ag, Pg → L, A, P
const VAR_ORDER = ["Li", "Ai", "Pi", "Lp", "Ap", "Lg", "Ag", "Pg", "L", "A", "P"];

function rCalc(expr, d) {
    try {
        let e = expr;
        // Substituir variáveis longas primeiro para evitar conflitos
        // Ex: "Li" deve ser substituído inteiramente, não como "L" + "i"
        for (const k of VAR_ORDER) {
            e = e.replace(new RegExp(`\\b${k}\\b`, "g"), String(d[k] || 0));
        }
        if (!SAFE_EXPR.test(e)) return 0;
        const r = Function('"use strict";return(' + e + ')')();
        return Number.isFinite(r) ? r : 0;
    } catch (_) { return 0; }
}

function rFerrForm(expr, d) {
    try {
        let e = expr;
        for (const k of VAR_ORDER) {
            e = e.replace(new RegExp(`\\b${k}\\b`, "g"), String(d[k] || 0));
        }
        if (!SAFE_EXPR.test(e)) return 1;
        return Math.ceil(Function('"use strict";return(' + e + ')')());
    } catch (_) { return 1; }
}

// FIX #1: cFita recebe dimensões reais (w=largura em mm, h=altura em mm)
function cFita(cfg, w, h) {
    if (!cfg || !cfg.length) return 0;
    let t = 0;
    cfg.forEach(s => {
        if (s === "f") t += w;       // frente
        else if (s === "b") t += w;  // base/bottom
        else if (s === "t") t += w;  // topo
        else if (s === "all") t += (w + h) * 2;  // 4 lados
    });
    return t / 1000; // mm → m
}

// Extrai dimensões reais de uma expressão tipo "A*P" usando o dicionário
function parseDimsFromExpr(expr, D) {
    const parts = expr.split("*").map(p => p.trim());
    if (parts.length === 2) {
        const w = D[parts[0]] || 0;
        const h = D[parts[1]] || 0;
        return { w, h };
    }
    // Expressão complexa: avaliar e usar raiz como proxy
    const amm = rCalc(expr, D);
    const side = Math.sqrt(Math.abs(amm));
    return { w: side, h: side };
}

export function cRipado(cfg, L, A) {
    if (!cfg || cfg.largR <= 0) return { q: 0, lr: 0, sobra: 0, areaR: 0, fitaR: 0, comp: 0 };
    const q = Math.floor((L + cfg.espac) / (cfg.largR + cfg.espac));
    if (q <= 0) return { q: 0, lr: 0, sobra: L / 2, areaR: 0, fitaR: 0, comp: A };
    const lr = q * cfg.largR + (q - 1) * cfg.espac;
    return { q, lr, sobra: (L - lr) / 2, areaR: (q * cfg.largR * A) / 1e6, fitaR: (q * A * 2) / 1000, comp: A };
}

// ═══════════════════════════════════════════════════════
// calcMod — Motor principal (aceita biblioteca dinâmica)
// ═══════════════════════════════════════════════════════
export function calcMod(mod, bib = null) {
    const chapasDB = bib?.chapas || DB_CHAPAS;
    const ferragensDB = bib?.ferragens || DB_FERRAGENS;
    const acabDB = bib?.acabamentos || DB_ACABAMENTOS;
    const fitasDB = bib?.fitas || DB_FITAS;

    const { dims, acabInt, acabExt, faces, tpl, ripCfg, qtd } = mod;

    // Sub-itens: usar array do mod (novo modelo) ou propriedades legadas
    const subs = mod.subitens || [];
    const nPortas = mod.nPortas ?? subs.filter(s => s.tipo === 'porta').reduce((a, s) => a + (s.qtd || 0), 0);
    const nGav = mod.nGav ?? subs.filter(s => s.tipo === 'gaveta').reduce((a, s) => a + (s.qtd || 0), 0);
    const altGav = mod.altGav ?? (subs.find(s => s.tipo === 'gaveta')?.altGav || 150);
    const subQtd = mod.subQtd || {};

    const L = dims.l, A = dims.a, P = dims.p;
    const esp = chapasDB.find(c => c.id === (tpl.internas[0]?.mat || "mdf18"))?.esp || 18;
    const Li = L - esp * 2, Ai = A - esp * 2, Pi = P;
    const Lp = nPortas > 0 ? L / nPortas : L, Ap = A;
    const Ag = altGav || 150, Lg = Li, Pg = Pi - 50;
    const D = { L, A, P, Li, Ai, Pi, Lp, Ap, Lg, Ag, Pg };

    let pecas = [], chapas = {}, fita = 0, ferrList = [], custo = 0, area = 0;
    const addChapa = (matId, a) => {
        const m = chapasDB.find(c => c.id === matId);
        if (!m) return;
        if (!chapas[matId]) chapas[matId] = { mat: m, area: 0 };
        chapas[matId].area += a;
    };

    // INTERNAS — usar dimensões reais para fita
    tpl.internas.forEach(p => {
        const amm = rCalc(p.calc, D);
        const am = amm / 1e6;
        const { w, h } = parseDimsFromExpr(p.calc, D);
        const f = cFita(p.fita, w, h);
        pecas.push({ nome: p.nome, tipo: "int", area: am, matId: p.mat, fita: f });
        area += am; fita += f; addChapa(p.mat, am);
    });

    // EXTERNAS (tamponamentos) — incluídos automaticamente quando acabExt está selecionado
    tpl.externas.forEach(p => {
        if (!acabExt) return; // só calcula tamponamento se houver acabamento externo escolhido
        const amm = rCalc(p.calc, D);
        const am = amm / 1e6;
        const { w, h } = parseDimsFromExpr(p.calc, D);
        const f = cFita(p.fita, w, h);
        pecas.push({ nome: p.nome, tipo: "ext", face: p.face, area: am, matId: p.mat, fita: f });
        area += am; fita += f; addChapa(p.mat, am);
        if (acabExt) {
            const ac = acabDB.find(x => x.id === acabExt);
            if (ac && ac.preco > 0) custo += am * ac.preco;
        }
    });

    // Acabamento interno
    if (acabInt) {
        const ac = acabDB.find(x => x.id === acabInt);
        if (ac && ac.preco > 0) {
            const ai = pecas.filter(p => p.tipo === "int").reduce((s, p) => s + p.area, 0);
            custo += ai * ac.preco;
        }
    }

    // SUB-ITENS (peças/ferragens do template)
    tpl.subs.forEach(s => {
        const q = subQtd[s.id] || 0;
        if (q <= 0) return;
        if (s.tipo === "ferr") {
            const fe = ferragensDB.find(x => x.id === s.ferrId);
            if (fe) {
                const m = s.calcM ? rCalc(s.calcM, D) / 1000 : 1;
                ferrList.push({ ...fe, qtd: m * q, orig: s.nome });
            }
        } else {
            const amm = rCalc(s.calc, D);
            const am = (amm / 1e6) * q;
            // FIX #1: usar dimensões reais para sub-itens
            const { w, h } = parseDimsFromExpr(s.calc, D);
            const f = cFita(s.fita, w, h) * q;
            pecas.push({ nome: `${s.nome} (×${q})`, tipo: "sub", area: am, matId: s.mat, fita: f });
            area += am; fita += f; addChapa(s.mat, am);
        }
    });

    // PORTAS
    if (nPortas > 0 && tpl.porta.calc) {
        const amm = rCalc(tpl.porta.calc, D);
        const am = (amm / 1e6) * nPortas;
        // FIX #1: dimensões reais da porta
        const f = cFita(tpl.porta.fita, Lp, Ap) * nPortas;
        pecas.push({ nome: `Porta (×${nPortas})`, tipo: "porta", area: am, matId: tpl.porta.mat, fita: f });
        area += am; fita += f; addChapa(tpl.porta.mat, am);
        tpl.porta.regras.forEach(r => {
            const fe = ferragensDB.find(x => x.id === r.ferrId);
            if (fe) {
                const qp = rFerrForm(r.form, D);
                ferrList.push({ ...fe, qtd: qp * nPortas, orig: "Porta", regra: r.form });
            }
        });
    }

    // GAVETAS
    if (nGav > 0 && tpl.gaveta.pecas.length > 0) {
        tpl.gaveta.pecas.forEach(gp => {
            const amm = rCalc(gp.calc, D);
            const mult = gp.mult || 1;
            const am = (amm / 1e6) * nGav * mult;
            // FIX #1: dimensões reais para partes de gaveta
            const { w, h } = parseDimsFromExpr(gp.calc, D);
            const f = cFita(gp.fita, w, h) * nGav * mult;
            pecas.push({ nome: `${gp.nome} (×${nGav * mult})`, tipo: "gav", area: am, matId: gp.mat, fita: f });
            area += am; fita += f; addChapa(gp.mat, am);
        });
        tpl.gaveta.regras.forEach(r => {
            const fe = ferragensDB.find(x => x.id === r.ferrId);
            if (fe) {
                const qg = rFerrForm(r.form, D);
                ferrList.push({ ...fe, qtd: qg * nGav, orig: "Gaveta" });
            }
        });
    }

    // RIPADO
    let rip = null;
    if (tpl.cat === "especial" && ripCfg) {
        rip = cRipado(ripCfg, L, A);
        if (rip.q > 0) {
            addChapa(ripCfg.matR, rip.areaR);
            area += rip.areaR;
            fita += rip.fitaR;
        }
    }

    // FIX #5: CONSOLIDAR CHAPAS — custo proporcional (fracionário) por item
    // Arredondamento para chapa inteira é feito no total do orçamento (Novo.jsx)
    Object.values(chapas).forEach(c => {
        const areaChapa = (c.mat.larg * c.mat.alt) / 1e6;
        const perda = c.mat.perda_pct != null ? c.mat.perda_pct : 15;
        const areaUtil = areaChapa * (1 - perda / 100);
        c.frac = areaUtil > 0 ? c.area / areaUtil : 1; // fracionário (ex: 0.25 chapas)
        c.n = Math.ceil(c.frac); // inteiro (para referência)
        custo += c.frac * c.mat.preco; // custo proporcional
    });

    const fitaPrecoDefault = fitasDB[0]?.preco || 0.85;
    custo += fita * fitaPrecoDefault;
    ferrList.forEach(f => custo += f.preco * f.qtd);

    return { pecas, chapas, fita, ferrList, custo, area, rip };
}

// ═══════════════════════════════════════════════════════
// calcItemV2 — Motor v2: Caixa + Componentes
// ═══════════════════════════════════════════════════════

// Resolve alias de material (int/ext/fundo/ext_comp) → ID real da chapa/acabamento
function resolveMat(alias, mats) {
    if (alias === 'int') return mats.matInt || 'mdf18';
    if (alias === 'ext') return mats.matExt || '';
    if (alias === 'fundo') return mats.matFundo || mats.matInt || 'mdf18';
    if (alias === 'ext_comp') return mats.matExtComp || '';
    return alias; // ID literal (ex: "mdf15", "comp3")
}

// VAR_ORDER estendido com variáveis de componentes
const VAR_ORDER_V2 = ["nPortas", "Lg", "Pg", "Lpr", "Ppr", "Ldv", "Pdv", "Lp", "Ap", "Li", "Ai", "Pi", "ag", "L", "A", "P"];

function rCalcV2(expr, d) {
    try {
        let e = String(expr);
        for (const k of VAR_ORDER_V2) {
            if (d[k] !== undefined) {
                e = e.replace(new RegExp(`\\b${k}\\b`, 'g'), String(d[k]));
            }
        }
        if (!SAFE_EXPR.test(e)) return 0;
        const r = Function('"use strict";return(' + e + ')')() || 0;
        return Number.isFinite(r) ? r : 0;
    } catch (_) { return 0; }
}

export function calcItemV2(caixaDef, dims, mats, compInstances = [], bib = null, globalPadroes = {}) {
    const chapasDB = bib?.chapas || DB_CHAPAS;
    // Mescla ferragens do banco com fallback embutido (evita perder ferragens quando banco tem dados parciais)
    const bibFerr = bib?.ferragens || [];
    const ferragensDB = bibFerr.length > 0
        ? [...bibFerr, ...DB_FERRAGENS.filter(df => !bibFerr.find(bf => bf.id === df.id))]
        : DB_FERRAGENS;
    const acabDB = bib?.acabamentos || DB_ACABAMENTOS;
    const fitasDB = bib?.fitas || DB_FITAS;
    const fitaPrecoDefault = fitasDB[0]?.preco || 0.85;
    // Retorna o preço da fita para um matId — usa fita_preco da chapa se cadastrado
    const getFitaPreco = (matId) => {
        const chapa = chapasDB.find(c => c.id === matId);
        return (chapa?.fita_preco > 0 ? chapa.fita_preco : fitaPrecoDefault);
    };

    const { l: L, a: A, p: P } = dims;

    // Espessura a partir do matInt
    const matIntId = resolveMat('int', mats);
    const matIntChapa = chapasDB.find(c => c.id === matIntId);
    const esp = matIntChapa?.esp || 18;

    // Variáveis da caixa
    const D = { L, A, P, Li: L - esp * 2, Ai: A - esp * 2, Pi: P };

    let pecas = [], chapas = {}, fita = 0, fitaByMat = {}, ferrList = [], custo = 0, area = 0;

    const addChapa = (matId, am) => {
        if (!matId) return;
        const m = chapasDB.find(c => c.id === matId);
        if (!m) return;
        if (!chapas[matId]) chapas[matId] = { mat: m, area: 0 };
        chapas[matId].area += am;
    };

    const addAcabamento = (matId, am) => {
        if (!matId) return;
        const ac = acabDB.find(x => x.id === matId);
        if (ac && (ac.preco || ac.preco_m2) > 0) {
            custo += am * (ac.preco || ac.preco_m2 || 0);
        }
    };

    const addPeca = (nome, tipo, matId, calcExpr, qtd, fitaCfg, D_ctx, isAcab = false) => {
        const resolvedMat = matId;
        const amm = rCalcV2(calcExpr, D_ctx);
        const am = (amm / 1e6) * qtd;
        if (am <= 0) return;
        const { w, h } = parseDimsFromExpr(calcExpr, D_ctx);
        const f = cFita(fitaCfg, w, h) * qtd;
        const nBordas = fitaCfg?.length || 0;
        const perimetro = 2 * (w + h); // mm
        pecas.push({ nome, tipo, matId: resolvedMat, area: am, fita: f, w, h, perimetro, nBordas, qtd: qtd || 1 });
        area += am;
        fita += f;
        if (f > 0 && !isAcab) {
            if (!fitaByMat[resolvedMat]) fitaByMat[resolvedMat] = { metros: 0, preco: getFitaPreco(resolvedMat) };
            fitaByMat[resolvedMat].metros += f;
        }
        if (isAcab) {
            addAcabamento(resolvedMat, am);
        } else {
            addChapa(resolvedMat, am);
        }
    };

    // ── 1. Peças da caixa ──────────────────────────────────
    (caixaDef.pecas || []).forEach(p => {
        const matId = resolveMat(p.mat, mats);
        if (!matId) return;
        addPeca(p.nome, 'caixa', matId, p.calc, p.qtd || 1, p.fita || [], D);
    });

    // ── 2. Tamponamentos (só se matExt definido) ────────────
    if (mats.matExt) {
        const isAcabExt = !chapasDB.find(c => c.id === mats.matExt);
        (caixaDef.tamponamentos || []).forEach(p => {
            const matId = resolveMat(p.mat, mats);
            if (!matId) return;
            addPeca(p.nome || `Tamp. ${p.face}`, 'tamponamento', matId, p.calc, p.qtd || 1, p.fita || [], D, isAcabExt);
        });
    }

    // ── 2b. Ferragens da caixa (sub_itens fixos, sem override/global) ────────
    (caixaDef.sub_itens || []).forEach(si => {
        if (si.defaultOn === false) return;
        const fe = ferragensDB.find(f => f.id === si.ferrId);
        if (!fe) return;
        const qtdUnit = si.qtdFormula
            ? Math.ceil(Math.max(1, rCalcV2(si.qtdFormula, D)))
            : 1;
        ferrList.push({ ...fe, qtd: qtdUnit, orig: `${caixaDef.nome || 'Módulo'} / ${si.nome}` });
    });

    // ── 3. Componentes ─────────────────────────────────────
    compInstances.forEach(ci => {
        const {
            compDef, qtd: cQtd = 1, vars: cVars = {}, matExtComp, subItens = {},
            subItensOvr = {},
            // Overrides de dimensão por instância (0 = auto, herda da caixa)
            dimL = 0, dimA = 0, dimP = 0,
            // Overrides de material por instância ('' = herda da caixa)
            matIntInst = '', matExtInst = '',
        } = ci;
        if (!compDef) return;

        // Contexto do componente = vars da caixa + derivados + vars próprias
        const cD = { ...D };

        // ── Override de dimensões da instância ──
        // Aplicado ANTES dos varsDeriv para que fórmulas derivadas usem o dim correto
        if (dimL > 0) { cD.L = dimL; cD.Li = dimL - esp * 2; }
        if (dimA > 0) { cD.A = dimA; cD.Ai = dimA - esp * 2; }
        if (dimP > 0) { cD.P = dimP; cD.Pi = dimP; }

        // Aplicar varsDeriv (ex: Lg=Li, Pg=P-50) — já usa as dims overridden
        Object.entries(compDef.varsDeriv || {}).forEach(([k, formula]) => {
            cD[k] = rCalcV2(formula, cD);
        });

        // Aplicar vars próprias (ex: ag=150)
        // Se userVal === undefined E default === 0/falsy → NÃO aplica, preserva varsDeriv
        (compDef.vars || []).forEach(v => {
            const userVal = cVars[v.id];
            if (userVal !== undefined) {
                cD[v.id] = userVal;
            } else if (v.default) {
                cD[v.id] = v.default;
            }
            // else: mantém valor de varsDeriv (ex: Ap derivado da caixa)
        });

        // ── Materiais da instância: sobrescreve int/ext se definido ──
        const compMats = {
            ...mats,
            matInt: matIntInst || mats.matInt,
            matExt: matExtInst || mats.matExt,
            matExtComp: matExtComp || '',
        };
        const compLabel = compDef.nome || 'Componente';

        // Peças do componente
        (compDef.pecas || []).forEach(p => {
            const matId = resolveMat(p.mat, compMats);
            if (!matId) return;
            addPeca(`${compLabel} — ${p.nome}`, 'componente', matId, p.calc, (p.qtd || 1) * cQtd, p.fita || [], cD);
        });

        // Frente externa
        const fe = compDef.frente_externa;
        if (fe?.ativa && matExtComp) {
            const feMatId = resolveMat(fe.mat, compMats);
            if (feMatId) {
                const isAcab = !chapasDB.find(c => c.id === feMatId);
                addPeca(`${compLabel} — ${fe.nome}`, 'frente_externa', feMatId, fe.calc, cQtd, fe.fita || [], cD, isAcab);
            }
        }

        // Sub-itens (ferragens)
        (compDef.sub_itens || []).forEach(si => {
            const ativo = subItens[si.id] !== undefined ? subItens[si.id] : si.defaultOn;
            if (!ativo) return;
            // Prioridade: 1) override individual (puxador por instância)
            //             2) padrão global (corredica/dobradica/articulador via categoria)
            //             3) padrão do componente (si.ferrId)
            let effFerrId = subItensOvr[si.id] || si.ferrId;
            if (!subItensOvr[si.id]) {
                const siCategoria = ferragensDB.find(f => f.id === si.ferrId)?.categoria?.toLowerCase() || '';
                for (const [grp, cat] of Object.entries(FERR_GROUPS)) {
                    if (siCategoria === cat.toLowerCase() && globalPadroes[grp]) {
                        effFerrId = globalPadroes[grp];
                        break;
                    }
                }
            }
            const fe = ferragensDB.find(f => f.id === effFerrId) || ferragensDB.find(f => f.id === si.ferrId);
            if (!fe) return;
            // qtdFormula: ex "1", "Ap<=1600?2:3", "Li/1000"
            const qtdUnit = si.qtdFormula
                ? Math.ceil(Math.max(1, rCalcV2(si.qtdFormula, cD)))
                : 1;
            ferrList.push({ ...fe, qtd: qtdUnit * cQtd, orig: `${compLabel} / ${si.nome}` });
        });
    });

    // ── 4. Consolidar chapas (custo proporcional — arredondamento no total do orçamento)
    let custoChapas = 0;
    Object.values(chapas).forEach(c => {
        const areaChapa = (c.mat.larg * c.mat.alt) / 1e6;
        const perda = c.mat.perda_pct != null ? c.mat.perda_pct : 15;
        const areaUtil = areaChapa * (1 - perda / 100);
        c.frac = areaUtil > 0 ? c.area / areaUtil : 1;
        c.n = Math.ceil(c.frac);
        const cc = c.frac * c.mat.preco; // proporcional
        custoChapas += cc;
        custo += cc;
    });

    // Custo de fita: per-material se fita_preco cadastrado, senão fallback global
    const custoFita = Object.values(fitaByMat).reduce((s, v) => s + v.metros * v.preco, 0)
        || fita * fitaPrecoDefault;
    custo += custoFita;

    // Custo de ferragens
    let custoFerragens = 0;
    ferrList.forEach(f => { const fc = f.preco * f.qtd; custoFerragens += fc; custo += fc; });

    // Custo de acabamentos (já adicionado ao custo em addAcabamento)
    // Calcular valor isolado para breakdown
    const custoAcabamentos = custo - custoChapas - custoFita - custoFerragens;

    // ── Fase 1+2: Métricas para custo-hora e consumíveis ──
    const nPecas = pecas.length;
    const nFerragens = ferrList.reduce((s, f) => s + (f.qtd || 0), 0);
    const nCaixas = 1; // cada item é 1 caixa
    const nJuncoes = Math.max(2, pecas.filter(p => ['caixa', 'componente', 'tamponamento'].includes(p.tipo)).length); // minifix por junção

    return { pecas, chapas, fita, fitaByMat, ferrList, custo, area, custoChapas, custoFita, custoFerragens, custoAcabamentos, nPecas, nFerragens, nCaixas, nJuncoes };
}

// ═══════════════════════════════════════════════════════
// FASE 1 — CUSTO-HORA: calcula tempo e mão de obra por operação
// ═══════════════════════════════════════════════════════
/**
 * Calcula custo-hora da fábrica e tempo de produção de um orçamento.
 * Modelo v3: tempo baseado nas DIMENSÕES REAIS de cada peça.
 * - CNC: tempo = perímetro / velocidade_avanço + overhead por peça + overhead por chapa
 * - Fita: tempo = nBordas × overhead_por_borda + metros_fita / velocidade_fitagem
 * - Montagem: escala com componentes (portas, gavetas, prateleiras)
 *
 * @param {object} metricas — { pecasDetalhe[], nChapas, nFerragens, nCaixas, areaAcab, nModulos, nPortas, nGavetas, nPrateleiras }
 *   pecasDetalhe[]: { perimetro (mm), nBordas, fita (m), qtd }
 * @param {object} cfg — config_taxas com velocidades e overheads
 * @param {number} coef — coeficiente de dificuldade médio
 */
export function calcCustoHora(metricas, cfg, coef = 0) {
    // ── CNC ──
    // velocidade em mm/min (default 5000 = 5m/min)
    // overhead_peca em segundos (etiquetar + retirar, default 20s)
    // overhead_chapa em segundos (carregar + fixar + aspirar, default 300s = 5min)
    const cncVel = cfg.cnc_velocidade ?? 5000;           // mm/min
    const cncOverheadPeca = (cfg.cnc_overhead_peca ?? 20) / 3600;   // seg → horas
    const cncOverheadChapa = (cfg.cnc_overhead_chapa ?? 300) / 3600; // seg → horas

    let hCorte = 0;
    (metricas.pecasDetalhe || []).forEach(p => {
        const perim = p.perimetro || 0; // mm
        const tempoCortePeca = cncVel > 0 ? (perim / cncVel) / 60 : 0; // min → horas
        hCorte += (tempoCortePeca + cncOverheadPeca) * (p.qtd || 1);
    });
    hCorte += (metricas.nChapas || 0) * cncOverheadChapa;

    // ── Fita de borda ──
    // velocidade_fitagem em mm/min (default 500 = 0.5m/min manual, ~8m/min com coladeira)
    // overhead_por_borda em segundos (pegar + girar + destopar + limar, default 90s)
    const fitaVel = cfg.fita_velocidade ?? 500;            // mm/min
    const fitaOverheadBorda = (cfg.fita_overhead_borda ?? 90) / 3600; // seg → horas

    let hFita = 0;
    let totalBordas = 0;
    (metricas.pecasDetalhe || []).forEach(p => {
        const bordas = (p.nBordas || 0) * (p.qtd || 1);
        const metros = (p.fita || 0); // já em metros, já × qtd
        const tempoColar = fitaVel > 0 ? (metros * 1000 / fitaVel) / 60 : 0; // mm→min→horas
        hFita += bordas * fitaOverheadBorda + tempoColar;
        totalBordas += bordas;
    });

    // ── Furação ──
    const hFuracao = (metricas.nFerragens || 0) * (cfg.tempo_furacao ?? 0.017);

    // ── Montagem (proporcional a componentes) ──
    const montBase = cfg.tempo_montagem ?? 0.25;
    const montPorta = cfg.tempo_montagem_porta ?? 0.15;
    const montGaveta = cfg.tempo_montagem_gaveta ?? 0.25;
    const montPrat = cfg.tempo_montagem_prat ?? 0.05;
    const hMontagemBruto = (metricas.nCaixas || 0) * montBase
        + (metricas.nPortas || 0) * montPorta
        + (metricas.nGavetas || 0) * montGaveta
        + (metricas.nPrateleiras || 0) * montPrat;
    const hMontagem = hMontagemBruto * (1 + coef);

    // ── Acabamento, embalagem, instalação ──
    const hAcabamento = (metricas.areaAcab || 0) * (cfg.tempo_acabamento ?? 0.17);
    const hEmbalagem = (metricas.nModulos || 0) * (cfg.tempo_embalagem ?? 0.25);
    const hInstalacao = (metricas.nModulos || 0) * (cfg.tempo_instalacao ?? 0.75);

    const horasProducao = hCorte + hFita + hFuracao + hMontagem + hAcabamento + hEmbalagem;
    const horasTotal = horasProducao + hInstalacao;

    // ── Custo-hora da fábrica ──
    const func = cfg.func_producao || 10;
    const hDia = cfg.horas_dia || 8.5;
    const dias = cfg.dias_uteis || 22;
    const efic = (cfg.eficiencia || 75) / 100;
    const custoFixoMensal = (() => {
        try {
            const linhas = JSON.parse(cfg.centro_custo_json || '[]');
            return linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
        } catch { return 0; }
    })();
    const horasProdMes = func * hDia * dias * efic;
    const custoHora = horasProdMes > 0 ? custoFixoMensal / horasProdMes : 0;
    const custoMdo = horasTotal * custoHora;

    return {
        horasTotal, horasProducao, hInstalacao, custoMdo, custoHora,
        breakdown: {
            hCorte, hFita, hFuracao, hMontagem, hAcabamento, hEmbalagem, hInstalacao,
            totalBordas,
            func, hDia, dias, efic, custoFixoMensal, horasProdMes,
        },
    };
}

// ═══════════════════════════════════════════════════════
// FASE 2 — CONSUMÍVEIS: cola, minifix, parafusos, lixa, embalagem
// ═══════════════════════════════════════════════════════
/**
 * @param {object} metricas — { areaColagem, nJuncoes, nPontosParafuso, areaAcab, nModulos }
 * @param {object} cfg — config de preços de consumíveis
 * @returns {{ custoConsumiveis, breakdown }}
 */
export function calcConsumiveis(metricas, cfg) {
    const cola = (metricas.areaColagem || 0) * (cfg.cons_cola_m2 ?? 2.50);
    const minifix = (metricas.nJuncoes || 0) * (cfg.cons_minifix_un ?? 1.80);
    const parafusos = (metricas.nPontosParafuso || 0) * (cfg.cons_parafuso_un ?? 0.35);
    const lixa = (metricas.areaAcab || 0) * (cfg.cons_lixa_m2 ?? 1.20);
    const embalagem = (metricas.nModulos || 0) * (cfg.cons_embalagem_mod ?? 15.00);
    const custoConsumiveis = cola + minifix + parafusos + lixa + embalagem;
    return { custoConsumiveis, breakdown: { cola, minifix, parafusos, lixa, embalagem } };
}

// ═══════════════════════════════════════════════════════
// FASE 3 — ESTIMATIVA DE CORTE REAL (First-Fit Decreasing Bin Packing)
// ═══════════════════════════════════════════════════════
/**
 * Estima quantas chapas inteiras são necessárias usando FFD 2D simplificado.
 * Muito mais preciso que fração simples (área/área_chapa).
 * @param {object} chapasMap — mesmo formato de calcItemV2().chapas: { matId: { mat, area } }
 * @param {Array} pecasList — lista de peças com { matId, area } (cada peça individual)
 * @param {number} spacing — espaçamento entre peças em mm (kerf + folga)
 * @returns {{ porMaterial: { [matId]: { estimadoFrac, estimadoReal, chapasNecessarias, ocupacao } }, totalFrac, totalReal }}
 */
export function estimarCorteReal(chapasMap, pecasList, spacing = 7) {
    const resultado = {};
    let totalFrac = 0, totalReal = 0;

    // Agrupar peças por material
    const pecasPorMat = {};
    pecasList.forEach(p => {
        if (!p.matId || p.area <= 0) return;
        if (!pecasPorMat[p.matId]) pecasPorMat[p.matId] = [];
        pecasPorMat[p.matId].push(p);
    });

    Object.entries(chapasMap).forEach(([matId, c]) => {
        const chapa = c.mat;
        const perda = chapa.perda_pct != null ? chapa.perda_pct : 15;
        const chapaW = (chapa.larg || 2750) - spacing * 2; // margem da borda
        const chapaH = (chapa.alt || 1850) - spacing * 2;
        const areaUtilChapa = (chapaW * chapaH) / 1e6;

        // Fração simples (método atual)
        const areaTotal = c.area; // m²
        const fracSimples = areaUtilChapa > 0 ? areaTotal / (areaUtilChapa * (1 - perda / 100)) : 1;
        totalFrac += Math.ceil(fracSimples);

        // FFD: simular encaixe real
        // Pegar dimensões reais das peças deste material
        const pecas = pecasPorMat[matId] || [];
        if (pecas.length === 0) {
            // Sem peças individuais, usar fração
            resultado[matId] = {
                estimadoFrac: Math.ceil(fracSimples),
                estimadoReal: Math.ceil(fracSimples),
                chapasNecessarias: Math.ceil(fracSimples),
                ocupacao: fracSimples > 0 ? (fracSimples / Math.ceil(fracSimples)) * 100 : 0,
            };
            totalReal += Math.ceil(fracSimples);
            return;
        }

        // Ordenar peças por área decrescente (FFD)
        const sorted = [...pecas].sort((a, b) => b.area - a.area);
        const bins = []; // cada bin = { restante: m² }
        const binCapacity = areaUtilChapa * (1 - perda / 100);

        sorted.forEach(p => {
            // Tentar encaixar na primeira chapa com espaço
            let placed = false;
            for (const bin of bins) {
                if (bin.restante >= p.area) {
                    bin.restante -= p.area;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                bins.push({ restante: binCapacity - p.area });
            }
        });

        const chapasNecessarias = bins.length;
        const ocupacao = chapasNecessarias > 0 ? (areaTotal / (chapasNecessarias * binCapacity)) * 100 : 0;

        resultado[matId] = {
            estimadoFrac: Math.ceil(fracSimples),
            estimadoReal: chapasNecessarias,
            chapasNecessarias,
            ocupacao,
        };
        totalReal += chapasNecessarias;
    });

    return { porMaterial: resultado, totalFrac, totalReal };
}

// ═══════════════════════════════════════════════════════
// MARKUP DIVISOR — FIX #7
// ═══════════════════════════════════════════════════════
export function precoVenda(custoBase, taxas) {
    const s = (taxas.imp + taxas.com + taxas.mont + taxas.lucro + taxas.frete) / 100;
    if (s >= 1) {
        return { valor: custoBase, erro: true, msg: "Σ taxas ≥ 100% — ajuste as taxas" };
    }
    return { valor: custoBase / (1 - s), erro: false };
}

// ═══════════════════════════════════════════════════════
// ENGINE V2 — Markups diferenciados por categoria
// ═══════════════════════════════════════════════════════
/**
 * @param {object} custos — { chapas, fita, acabamentos, ferragens, acessorios, consumiveis }
 * @param {number} coef — coeficiente de dificuldade do módulo (0.20-0.40)
 * @param {object} taxas — config_taxas com mk_chapas, mk_ferragens, etc.
 * @param {object} [custoHoraResult] — resultado de calcCustoHora (se modo custo-hora ativo)
 * @returns {{ valor, erro, cp, mdo, breakdown }}
 */
export function precoVendaV2(custos, coef, taxas, custoHoraResult = null) {
    const mk = {
        chapas: taxas.mk_chapas ?? 1.45,
        ferragens: taxas.mk_ferragens ?? 1.15,
        fita: taxas.mk_fita ?? 1.45,
        acabamentos: taxas.mk_acabamentos ?? 1.30,
        acessorios: taxas.mk_acessorios ?? 1.20,
        mdo: taxas.mk_mdo ?? 0.80,
    };

    // Etapa 1: aplicar coef (dificuldade/risco) — só em itens fabricados
    const chapasAdj = (custos.chapas || 0) * (1 + coef);
    const fitaAdj = (custos.fita || 0) * (1 + coef);
    const acabAdj = (custos.acabamentos || 0) * (1 + coef);
    // Ferragens e acessórios: sem coef (itens comprados prontos)
    const ferrVal = custos.ferragens || 0;
    const acessVal = custos.acessorios || 0;
    const consumiveisVal = custos.consumiveis || 0;

    // Etapa 2: markups por categoria
    const pvChapas = chapasAdj * mk.chapas;
    const pvFita = fitaAdj * mk.fita;
    const pvAcab = acabAdj * mk.acabamentos;
    const pvFerr = ferrVal * mk.ferragens;
    const pvAcess = acessVal * mk.acessorios;

    // Etapa 3: MDO — custo-hora real OU proporcional ao MDF (fallback)
    let mdo;
    if (custoHoraResult && custoHoraResult.custoMdo > 0) {
        mdo = custoHoraResult.custoMdo;
    } else {
        mdo = chapasAdj * mk.mdo;
    }

    // Etapa 4: custo de produção (consumíveis recebem markup de chapas — são itens de produção)
    const pvConsumiveis = consumiveisVal * mk.chapas;
    const cp = pvChapas + pvFita + pvAcab + pvFerr + pvAcess + pvConsumiveis + mdo;

    // ── Piso (custo real sem markup) — abaixo disso é prejuízo ──
    const custoReal = chapasAdj + fitaAdj + acabAdj + ferrVal + acessVal + consumiveisVal + mdo;

    // Etapa 5: divisor (taxas sobre PV)
    const inst = taxas.inst ?? 5;
    const s = ((taxas.imp || 0) + (taxas.com || 0) + (taxas.lucro || 0) + (inst) + (taxas.frete || 0) + (taxas.mont || 0)) / 100;
    if (s >= 1) {
        return { valor: cp, erro: true, msg: "Σ taxas ≥ 100% — ajuste os percentuais", cp, mdo, custoReal };
    }
    const pv = cp / (1 - s);
    // Preço mínimo: custo real ÷ (1 - impostos fixos), cobre custos + impostos obrigatórios
    const sFixo = ((taxas.imp || 0) + (taxas.inst ?? 5) + (taxas.frete || 0) + (taxas.mont || 0)) / 100;
    const pisoMinimo = sFixo < 1 ? custoReal / (1 - sFixo) : custoReal;

    return {
        valor: pv,
        erro: false,
        cp,
        mdo,
        custoReal,
        pisoMinimo,
        breakdown: { chapasAdj, fitaAdj, acabAdj, ferrVal, acessVal, consumiveisVal, pvConsumiveis, pvChapas, pvFita, pvAcab, pvFerr, pvAcess, mdo },
        custoHora: custoHoraResult,
    };
}

// Helper retrocompatível que sempre retorna número
export function precoVendaNum(custoBase, taxas) {
    const r = precoVenda(custoBase, taxas);
    return r.valor;
}

// ── Calculadora de Painéis Ripados / Muxarabi ─────────────────────────────────

function _nRipas(dim, larg, espc) {
    if (larg <= 0 || larg + espc <= 0) return 0;
    return Math.max(0, Math.floor((dim + espc) / (larg + espc)));
}

function _bestCut(chapaL, chapaW, ripaComp, ripaLarg) {
    const o1 = Math.floor(chapaL / ripaComp) * Math.floor(chapaW / ripaLarg);
    const o2 = Math.floor(chapaW / ripaComp) * Math.floor(chapaL / ripaLarg);
    return Math.max(o1, o2, 1);
}

function _calcPrecoM2Item(item) {
    if (item.largura > 0 && item.altura > 0 && item.preco > 0) {
        const area = (item.largura * item.altura) / 1e6;
        const util = area * (1 - (item.perda_pct || 15) / 100);
        return util > 0 ? item.preco / util : 0;
    }
    return item.preco_m2 || item.preco || 0;
}

/**
 * calcPainelRipado — calcula BOM e custo de um painel ripado/muxarabi
 * @param {object} cfg — { tipo, L, A, wV, eV, sV, wH, eH, sH, mesmasRipas, matRipaV, matRipaH, temSubstrato, matSubstrato }
 * @param {Array}  bib — array de itens da biblioteca
 * @returns objeto com nV, nH, mlTotal, chapasV, chapasH, fita, custoMaterial, cobertura, ...
 */
export function calcPainelRipado(cfg, bib = []) {
    const { tipo = 'ripado', L = 0, A = 0, wV = 40, eV = 18, sV = 15,
        wH = 40, eH = 18, sH = 15, mesmasRipas = true,
        matRipaV = '', matRipaH = '', temSubstrato = true, matSubstrato = '' } = cfg;

    if (!L || !A || !wV || eV <= 0) return null;

    const _wH = mesmasRipas ? wV : wH;
    const _eH = mesmasRipas ? eV : eH;
    const _sH = mesmasRipas ? sV : sH;

    const materiais = bib.filter(b => b.tipo === 'material');
    const fitaDefault = bib.find(b => b.nome?.includes('Fita'));
    const fitaPrecoDefault = fitaDefault?.preco || 0.85;

    // ── Ripas Verticais ──
    const nV = _nRipas(L, wV, sV);
    const compV = A;
    const mlV = nV * compV / 1000;
    const matV = materiais.find(m => m.id == matRipaV || m.nome === matRipaV);
    const chapaLV = matV?.largura || 2750;
    const chapaWV = matV?.altura  || 1830;
    const rpcV = _bestCut(chapaLV, chapaWV, compV, wV);
    const chapasV = nV > 0 ? Math.ceil(nV / rpcV) : 0;
    // Custo proporcional por área (preço/m²) em vez de chapas inteiras
    const areaRipasV = nV * compV * wV / 1e6; // m²
    const pm2V = matV ? _calcPrecoM2Item(matV) : 0;
    const custoRipasV = pm2V > 0 ? areaRipasV * pm2V : (matV ? chapasV * (matV.preco || 0) : 0);
    const fitaRipasV = nV * 2 * compV / 1000;
    const fitaPrecoV = matV?.fita_preco > 0 ? matV.fita_preco : fitaPrecoDefault;

    // ── Ripas Horizontais (muxarabi) ──
    let nH = 0, mlH = 0, chapasH = 0, custoRipasH = 0, fitaRipasH = 0, fitaPrecoH = fitaPrecoDefault;
    if (tipo === 'muxarabi' && _wH > 0) {
        nH = _nRipas(A, _wH, _sH);
        const compH = L;
        mlH = nH * compH / 1000;
        const matH = mesmasRipas ? matV : materiais.find(m => m.id == matRipaH || m.nome === matRipaH);
        const rpcH = _bestCut(matH?.largura || 2750, matH?.altura || 1830, compH, _wH);
        chapasH = nH > 0 ? Math.ceil(nH / rpcH) : 0;
        // Custo proporcional por área
        const areaRipasH = nH * compH * _wH / 1e6;
        const pm2H = matH ? _calcPrecoM2Item(matH) : 0;
        custoRipasH = pm2H > 0 ? areaRipasH * pm2H : (matH ? chapasH * (matH.preco || 0) : 0);
        fitaRipasH = nH * 2 * compH / 1000;
        fitaPrecoH = matH?.fita_preco > 0 ? matH.fita_preco : fitaPrecoDefault;
    }

    // ── Substrato ──
    const areaSubstrato = L * A / 1e6;
    const fitaSubstrato = 2 * (L + A) / 1000;
    const matSub = temSubstrato ? materiais.find(m => m.id == matSubstrato || m.nome === matSubstrato) : null;
    let custoSubstrato = 0;
    if (matSub) {
        const pm2 = _calcPrecoM2Item(matSub);
        custoSubstrato = pm2 > 0 ? areaSubstrato * pm2 : Math.ceil(areaSubstrato / ((matSub.largura * matSub.altura / 1e6) * (1 - (matSub.perda_pct || 15) / 100) || 1)) * (matSub.preco || 0);
    }
    const fitaPrecoSub = matSub?.fita_preco > 0 ? matSub.fita_preco : fitaPrecoDefault;

    // ── Cobertura efetiva (desconta interseções) ──
    const areaIntersecoes = tipo === 'muxarabi' ? (nV * wV * nH * _wH) / 1e6 : 0;
    const areaCoberta = (nV * wV * A + nH * _wH * L) / 1e6 - areaIntersecoes;
    const cobertura = Math.min(100, areaCoberta / (L * A / 1e6) * 100);

    const mlTotal = mlV + mlH;
    const fitaTotal = fitaRipasV + fitaRipasH + (temSubstrato ? fitaSubstrato : 0);

    // ── Custo fita de borda ──
    const custoFitaV = fitaRipasV * fitaPrecoV;
    const custoFitaH = fitaRipasH * fitaPrecoH;
    const custoFitaSub = temSubstrato ? fitaSubstrato * fitaPrecoSub : 0;
    const custoFita = custoFitaV + custoFitaH + custoFitaSub;

    const custoChapas = custoRipasV + custoRipasH + custoSubstrato;
    const custoMaterial = custoChapas + custoFita;

    return {
        nV, nH, mlV, mlH, mlTotal,
        chapasV, chapasH,
        fitaRipasV, fitaRipasH, fitaSubstrato, fitaTotal,
        areaSubstrato, custoSubstrato,
        custoRipasV, custoRipasH, custoFita, custoChapas, custoMaterial,
        cobertura, vazio: Math.max(0, 100 - cobertura),
        matV, matH: mesmasRipas ? matV : materiais.find(m => m.id == matRipaH),
        matSub, _wH, _eH, _sH,
    };
}

// ═══════════════════════════════════════════════════════
// ITENS ESPECIAIS — Espelhos, Estofados, Alumínio, Vidro
// ═══════════════════════════════════════════════════════

export const TIPOS_ESPECIAIS = [
    { id: 'espelho',  nome: 'Espelho',   cor: '#06b6d4', unidade: 'm²',  icon: 'Square' },
    { id: 'estofado', nome: 'Estofado',  cor: '#ec4899', unidade: 'm²',  icon: 'Sofa' },
    { id: 'aluminio', nome: 'Alumínio',  cor: 'var(--muted)', unidade: 'ml',  icon: 'RectangleHorizontal' },
    { id: 'vidro',    nome: 'Vidro',     cor: '#22d3ee', unidade: 'm²',  icon: 'GlassWater' },
    { id: 'outro',    nome: 'Outro',     cor: '#a78bfa', unidade: 'un',  icon: 'Shapes' },
];

/**
 * calcItemEspecial — calcula custo de um item especial (espelho, estofado, alumínio, etc.)
 * @param {object} item — { tipo, L, A, qtd, precoUnit, unidade, perfis[], vidro{}, custoInstalacao }
 * @param {Array}  bib — array de itens da biblioteca (para lookup de materialId)
 * @returns {{ custo, area, descricao }}
 */
export function calcItemEspecial(item, bib = []) {
    const { tipo = 'outro', L = 0, A = 0, qtd = 1, precoUnit = 0, unidade = 'm2', materialId, perfis = [], vidro, custoInstalacao = 0 } = item;

    // Resolver preço do material da biblioteca se houver materialId
    let precoEfetivo = precoUnit;
    if (materialId) {
        const mat = bib.find(m => String(m.id) === String(materialId));
        if (mat) {
            precoEfetivo = mat.preco_m2 || mat.preco || precoUnit;
        }
    }

    let custo = 0;
    let area = 0;
    let descricao = '';

    if (tipo === 'aluminio') {
        // Alumínio: perfis em metro linear + vidro opcional
        let custoPerfis = 0;
        perfis.forEach(p => {
            custoPerfis += ((p.comp || 0) / 1000) * (p.precoML || 0) * (p.qtd || 1);
        });
        let custoVidro = 0;
        if (vidro && vidro.precoM2 > 0 && L > 0 && A > 0) {
            const areaVidro = (L / 1000) * (A / 1000);
            custoVidro = areaVidro * vidro.precoM2;
        }
        custo = (custoPerfis + custoVidro) * qtd + custoInstalacao;
        area = L > 0 && A > 0 ? (L / 1000) * (A / 1000) * qtd : 0;
        descricao = `${perfis.length} perfil(s)${vidro ? ' + vidro' : ''}`;
    } else if (unidade === 'un' || tipo === 'outro') {
        // Preço unitário
        custo = precoEfetivo * qtd + custoInstalacao;
        area = L > 0 && A > 0 ? (L / 1000) * (A / 1000) * qtd : 0;
        descricao = `${qtd} un × ${R$(precoEfetivo)}`;
    } else {
        // m² (espelho, estofado, vidro)
        area = L > 0 && A > 0 ? (L / 1000) * (A / 1000) * qtd : 0;
        custo = area * precoEfetivo + custoInstalacao;
        descricao = `${N(area)} m² × ${R$(precoEfetivo)}/m²`;
    }

    return { custo, area, descricao };
}

// ═══════════════════════════════════════════════════════════════
// COMPARAÇÃO DE VERSÕES — diff estruturado entre duas versões
// ═══════════════════════════════════════════════════════════════
export function compareVersions(v1, v2) {
    const a1 = v1.ambientes || [];
    const a2 = v2.ambientes || [];
    const a1Map = new Map(a1.map(a => [a.id, a]));
    const a2Map = new Map(a2.map(a => [a.id, a]));

    const ambientes = { added: [], removed: [], modified: [], unchanged: [] };

    // Ambientes adicionados (em v2 mas não em v1)
    for (const [id, amb] of a2Map) {
        if (!a1Map.has(id)) {
            ambientes.added.push({ id, nome: amb.nome, itensCount: (amb.itens || []).length + (amb.paineis || []).length + (amb.itensEspeciais || []).length });
        }
    }

    // Ambientes removidos (em v1 mas não em v2)
    for (const [id, amb] of a1Map) {
        if (!a2Map.has(id)) {
            ambientes.removed.push({ id, nome: amb.nome, itensCount: (amb.itens || []).length + (amb.paineis || []).length + (amb.itensEspeciais || []).length });
        }
    }

    // Ambientes em ambas as versões — verificar mudanças
    for (const [id, amb2] of a2Map) {
        if (!a1Map.has(id)) continue;
        const amb1 = a1Map.get(id);
        const changes = compareAmbiente(amb1, amb2);
        if (changes.hasChanges) {
            ambientes.modified.push({ id, nome: amb2.nome, ...changes });
        } else {
            ambientes.unchanged.push({ id, nome: amb2.nome });
        }
    }

    // Comparar taxas
    const t1 = v1.taxas || {};
    const t2 = v2.taxas || {};
    const TAXA_LABELS = { imp: 'Impostos', com: 'Comissão', mont: 'Montagem', lucro: 'Lucro', frete: 'Frete', mdo: 'Mão de obra (R$/m²)', inst: 'Instalação' };
    const taxasChanged = [];
    for (const key of Object.keys(TAXA_LABELS)) {
        const de = t1[key] ?? 0;
        const para = t2[key] ?? 0;
        if (de !== para) taxasChanged.push({ campo: key, label: TAXA_LABELS[key], de, para });
    }

    // Comparar pagamento (resumo simplificado)
    const pag1 = v1.pagamento || {};
    const pag2 = v2.pagamento || {};
    const pagChanged = JSON.stringify(pag1) !== JSON.stringify(pag2);

    return {
        ambientes,
        taxas: { changed: taxasChanged },
        pagamento: { changed: pagChanged },
        resumo: {
            ambAdded: ambientes.added.length,
            ambRemoved: ambientes.removed.length,
            ambModified: ambientes.modified.length,
            ambUnchanged: ambientes.unchanged.length,
            taxasChanged: taxasChanged.length,
        },
    };
}

function compareAmbiente(amb1, amb2) {
    const changes = { hasChanges: false, itens: { added: [], removed: [], modified: [] }, paineis: { added: [], removed: [] }, itensEspeciais: { added: [], removed: [] } };

    // Comparar itens (marcenaria) por id
    const i1Map = new Map((amb1.itens || []).map(i => [i.id, i]));
    const i2Map = new Map((amb2.itens || []).map(i => [i.id, i]));

    for (const [id, item] of i2Map) {
        if (!i1Map.has(id)) { changes.itens.added.push({ nome: item.nome || item.caixaDef?.nome || '?', dims: item.dims }); changes.hasChanges = true; }
    }
    for (const [id, item] of i1Map) {
        if (!i2Map.has(id)) { changes.itens.removed.push({ nome: item.nome || item.caixaDef?.nome || '?', dims: item.dims }); changes.hasChanges = true; }
    }
    for (const [id, item2] of i2Map) {
        if (!i1Map.has(id)) continue;
        const item1 = i1Map.get(id);
        const diffs = [];
        if (item1.dims?.l !== item2.dims?.l) diffs.push({ campo: 'Largura', de: item1.dims?.l, para: item2.dims?.l });
        if (item1.dims?.a !== item2.dims?.a) diffs.push({ campo: 'Altura', de: item1.dims?.a, para: item2.dims?.a });
        if (item1.dims?.p !== item2.dims?.p) diffs.push({ campo: 'Prof.', de: item1.dims?.p, para: item2.dims?.p });
        if ((item1.qtd || 1) !== (item2.qtd || 1)) diffs.push({ campo: 'Qtd', de: item1.qtd || 1, para: item2.qtd || 1 });
        if (item1.mats?.matInt !== item2.mats?.matInt) diffs.push({ campo: 'Mat. Interno', de: item1.mats?.matInt, para: item2.mats?.matInt });
        if (item1.mats?.matExt !== item2.mats?.matExt) diffs.push({ campo: 'Mat. Externo', de: item1.mats?.matExt, para: item2.mats?.matExt });
        if ((item1.componentes || []).length !== (item2.componentes || []).length) diffs.push({ campo: 'Componentes', de: (item1.componentes || []).length, para: (item2.componentes || []).length });
        if (diffs.length > 0) { changes.itens.modified.push({ nome: item2.nome || item2.caixaDef?.nome || '?', diffs }); changes.hasChanges = true; }
    }

    // Comparar painéis por id
    const p1Set = new Set((amb1.paineis || []).map(p => p.id));
    const p2Set = new Set((amb2.paineis || []).map(p => p.id));
    for (const p of (amb2.paineis || [])) { if (!p1Set.has(p.id)) { changes.paineis.added.push({ nome: p.nome || 'Painel' }); changes.hasChanges = true; } }
    for (const p of (amb1.paineis || [])) { if (!p2Set.has(p.id)) { changes.paineis.removed.push({ nome: p.nome || 'Painel' }); changes.hasChanges = true; } }

    // Comparar itens especiais por id
    const e1Set = new Set((amb1.itensEspeciais || []).map(e => e.id));
    const e2Set = new Set((amb2.itensEspeciais || []).map(e => e.id));
    for (const e of (amb2.itensEspeciais || [])) { if (!e1Set.has(e.id)) { changes.itensEspeciais.added.push({ nome: e.nome || e.tipo || '?' }); changes.hasChanges = true; } }
    for (const e of (amb1.itensEspeciais || [])) { if (!e2Set.has(e.id)) { changes.itensEspeciais.removed.push({ nome: e.nome || e.tipo || '?' }); changes.hasChanges = true; } }

    return changes;
}

// KANBAN COLS — Pipeline ativo (7 colunas visiveis no kanban)
export const KCOLS = [
    { id: "lead", nm: "Primeiro Contato", c: "#7e7ec8" },
    { id: "orc", nm: "Em Orçamento", c: "#c8a97e" },
    { id: "env", nm: "Proposta Enviada", c: "#c8c87e" },
    { id: "neg", nm: "Negociação", c: "#c87eb8" },
    { id: "ok", nm: "Aprovado", c: "#8fbc8f" },
    { id: "prod", nm: "Em Produção", c: "#7eb8c8" },
    { id: "done", nm: "Entregue", c: "#6a9" },
];
// Status de arquivo (fora do pipeline visual)
export const KCOLS_ARCHIVE = [
    { id: "arquivo", nm: "Arquivado", c: "var(--muted)" },
    { id: "perdido", nm: "Perdido", c: "var(--danger-hover)" },
];
// Colunas que travam edição do orçamento (já aprovado/em produção/entregue)
export const LOCKED_COLS = ['ok', 'prod', 'done'];
