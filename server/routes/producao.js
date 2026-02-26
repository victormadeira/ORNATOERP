import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// HELPERS — Motor de cálculo server-side (simplificado)
// ═══════════════════════════════════════════════════════

const SAFE_EXPR = /^[\d\s+\-*/().?:<>=]+$/;
const VAR_ORDER = ["nPortas", "Lg", "Pg", "Lpr", "Ppr", "Ldv", "Pdv", "Lp", "Ap", "Li", "Ai", "Pi", "ag", "L", "A", "P"];

function rCalc(expr, d) {
    try {
        let e = String(expr);
        for (const k of VAR_ORDER) {
            if (d[k] !== undefined) e = e.replace(new RegExp(`\\b${k}\\b`, 'g'), String(d[k]));
        }
        if (!SAFE_EXPR.test(e)) return 0;
        return Function('"use strict";return(' + e + ')')() || 0;
    } catch { return 0; }
}

function parseDims(expr, D) {
    const parts = expr.split('*').map(p => p.trim());
    if (parts.length === 2) return { w: D[parts[0]] || 0, h: D[parts[1]] || 0 };
    const amm = rCalc(expr, D);
    const side = Math.sqrt(Math.abs(amm));
    return { w: side, h: side };
}

function cFita(cfg, w, h) {
    if (!cfg || !cfg.length) return 0;
    let t = 0;
    cfg.forEach(s => {
        if (s === 'f' || s === 'b' || s === 't') t += w;
        else if (s === 'all') t += (w + h) * 2;
    });
    return t / 1000;
}

function resolveMat(alias, mats) {
    if (alias === 'int') return mats.matInt || 'mdf18';
    if (alias === 'ext') return mats.matExt || '';
    if (alias === 'fundo') return mats.matFundo || mats.matInt || 'mdf18';
    if (alias === 'ext_comp') return mats.matExtComp || '';
    return alias;
}

// ═══════════════════════════════════════════════════════
// Carregar biblioteca de materiais do banco
// ═══════════════════════════════════════════════════════
function loadBiblioteca() {
    const rows = db.prepare('SELECT * FROM biblioteca WHERE ativo = 1').all();
    const chapas = rows.filter(r => r.tipo === 'material').map(r => ({
        id: r.cod, nome: r.nome, esp: r.espessura || 18,
        larg: r.largura || 2750, alt: r.altura || 1850,
        preco: r.preco || 0, perda_pct: r.perda_pct ?? 15,
        fita_preco: r.fita_preco || 0,
    }));
    const ferragens = rows.filter(r => r.tipo === 'ferragem').map(r => ({
        id: r.cod, nome: r.nome, preco: r.preco || 0,
        un: r.unidade || 'un', categoria: (r.categoria || '').toLowerCase(),
    }));
    const acabamentos = rows.filter(r => r.tipo === 'acabamento').map(r => ({
        id: r.cod, nome: r.nome, preco: r.preco || r.preco_m2 || 0,
        preco_m2: r.preco_m2 || 0, un: r.unidade || 'm²',
    }));
    return { chapas, ferragens, acabamentos };
}

// ═══════════════════════════════════════════════════════
// Calcular peças detalhadas de um orçamento (lista de corte)
// ═══════════════════════════════════════════════════════
function calcularListaCorte(mods, bib) {
    const pecas = [];      // { nome, ambiente, modulo, matId, matNome, largura, altura, area, qtd, fita, tipo }
    const chapasTotal = {}; // { matId: { mat, areaPecas, qtdChapas } }
    const ferrTotal = {};   // { ferrId: { nome, qtd, preco, un, orig[] } }
    const fitaTotal = { metros: 0, custo: 0 };

    const ambientes = mods?.ambientes || [];

    for (const amb of ambientes) {
        for (const mod of (amb.modulos || [])) {
            const modNome = mod.nome || 'Módulo';
            const dims = mod.dims || { l: 0, a: 0, p: 0 };
            const mats = mod.mats || {};
            const qtdMod = mod.qtd || 1;

            // Espessura do material interno
            const matIntId = resolveMat('int', mats);
            let esp = 18;
            const chapaInt = bib.chapas.find(c => c.id === matIntId);
            if (chapaInt) esp = chapaInt.esp;

            const D = {
                L: dims.l, A: dims.a, P: dims.p,
                Li: dims.l - esp * 2, Ai: dims.a - esp * 2, Pi: dims.p,
            };

            // Carregar definição da caixa
            const caixaRow = db.prepare('SELECT json_data FROM modulos_custom WHERE id = ?').get(mod.tplId);
            const caixaDef = caixaRow ? JSON.parse(caixaRow.json_data) : null;
            if (!caixaDef) continue;

            // ── Peças da caixa ──
            (caixaDef.pecas || []).forEach(p => {
                const matId = resolveMat(p.mat, mats);
                if (!matId) return;
                const amm = rCalc(p.calc, D);
                const am = amm / 1e6;
                if (am <= 0) return;
                const { w, h } = parseDims(p.calc, D);
                const f = cFita(p.fita || [], w, h);
                const matInfo = bib.chapas.find(c => c.id === matId);

                for (let q = 0; q < qtdMod; q++) {
                    pecas.push({
                        nome: p.nome,
                        ambiente: amb.nome,
                        modulo: modNome,
                        matId,
                        matNome: matInfo?.nome || matId,
                        espessura: matInfo?.esp || esp,
                        largura: Math.round(w),
                        altura: Math.round(h),
                        area: am,
                        qtd: p.qtd || 1,
                        fita: f,
                        tipo: 'caixa',
                    });
                }

                addChapa(chapasTotal, matId, am * qtdMod * (p.qtd || 1), bib);
                fitaTotal.metros += f * qtdMod * (p.qtd || 1);
            });

            // ── Tamponamentos ──
            if (mats.matExt) {
                (caixaDef.tamponamentos || []).forEach(p => {
                    const matId = resolveMat(p.mat, mats);
                    if (!matId) return;
                    const amm = rCalc(p.calc, D);
                    const am = amm / 1e6;
                    if (am <= 0) return;
                    const { w, h } = parseDims(p.calc, D);
                    const f = cFita(p.fita || [], w, h);
                    const matInfo = bib.chapas.find(c => c.id === matId);

                    for (let q = 0; q < qtdMod; q++) {
                        pecas.push({
                            nome: p.nome || `Tamp. ${p.face || ''}`,
                            ambiente: amb.nome,
                            modulo: modNome,
                            matId,
                            matNome: matInfo?.nome || matId,
                            espessura: matInfo?.esp || esp,
                            largura: Math.round(w),
                            altura: Math.round(h),
                            area: am,
                            qtd: p.qtd || 1,
                            fita: f,
                            tipo: 'tamponamento',
                        });
                    }

                    addChapa(chapasTotal, matId, am * qtdMod * (p.qtd || 1), bib);
                    fitaTotal.metros += f * qtdMod * (p.qtd || 1);
                });
            }

            // ── Componentes ──
            const padroes = mods?.padroes || {};
            (mod.componentes || []).forEach(ci => {
                const compRow = ci.compId ? db.prepare('SELECT json_data FROM modulos_custom WHERE id = ?').get(ci.compId) : null;
                const compDef = compRow ? JSON.parse(compRow.json_data) : null;
                if (!compDef) return;

                const cQtd = (ci.qtd || 1) * qtdMod;
                const cD = { ...D };

                // varsDeriv
                Object.entries(compDef.varsDeriv || {}).forEach(([k, formula]) => {
                    cD[k] = rCalc(formula, cD);
                });
                // vars próprias
                (compDef.vars || []).forEach(v => {
                    const userVal = ci.vars?.[v.id];
                    if (userVal !== undefined) cD[v.id] = userVal;
                    else if (v.default) cD[v.id] = v.default;
                });

                const compMats = { ...mats, matExtComp: ci.matExtComp || '' };
                const compLabel = compDef.nome || 'Componente';

                // Peças do componente
                (compDef.pecas || []).forEach(p => {
                    const matId = resolveMat(p.mat, compMats);
                    if (!matId) return;
                    const amm = rCalc(p.calc, cD);
                    const am = amm / 1e6;
                    if (am <= 0) return;
                    const { w, h } = parseDims(p.calc, cD);
                    const f = cFita(p.fita || [], w, h);
                    const matInfo = bib.chapas.find(c => c.id === matId);
                    const pQtd = (p.qtd || 1) * cQtd;

                    pecas.push({
                        nome: `${compLabel} — ${p.nome}`,
                        ambiente: amb.nome,
                        modulo: modNome,
                        matId,
                        matNome: matInfo?.nome || matId,
                        espessura: matInfo?.esp || esp,
                        largura: Math.round(w),
                        altura: Math.round(h),
                        area: am,
                        qtd: pQtd,
                        fita: f * pQtd,
                        tipo: 'componente',
                    });

                    addChapa(chapasTotal, matId, am * pQtd, bib);
                    fitaTotal.metros += f * pQtd;
                });

                // Frente externa
                const fe = compDef.frente_externa;
                if (fe?.ativa && ci.matExtComp) {
                    const feMatId = resolveMat(fe.mat, compMats);
                    if (feMatId) {
                        const amm = rCalc(fe.calc, cD);
                        const am = amm / 1e6;
                        if (am > 0) {
                            const { w, h } = parseDims(fe.calc, cD);
                            const f = cFita(fe.fita || [], w, h);
                            const matInfo = bib.chapas.find(c => c.id === feMatId);

                            pecas.push({
                                nome: `${compLabel} — ${fe.nome}`,
                                ambiente: amb.nome,
                                modulo: modNome,
                                matId: feMatId,
                                matNome: matInfo?.nome || feMatId,
                                espessura: matInfo?.esp || esp,
                                largura: Math.round(w),
                                altura: Math.round(h),
                                area: am,
                                qtd: cQtd,
                                fita: f * cQtd,
                                tipo: 'frente_externa',
                            });

                            addChapa(chapasTotal, feMatId, am * cQtd, bib);
                            fitaTotal.metros += f * cQtd;
                        }
                    }
                }

                // Sub-itens (ferragens)
                (compDef.sub_itens || []).forEach(si => {
                    const ativo = ci.subItens?.[si.id] !== undefined ? ci.subItens[si.id] : si.defaultOn;
                    if (!ativo) return;

                    let effFerrId = ci.subItensOvr?.[si.id] || si.ferrId;
                    // Substituição global por padrões
                    if (!ci.subItensOvr?.[si.id]) {
                        const siCat = bib.ferragens.find(f => f.id === si.ferrId)?.categoria || '';
                        const FERR_GROUPS = { corredica: 'corrediça', dobradica: 'dobradiça', articulador: 'articulador' };
                        for (const [grp, cat] of Object.entries(FERR_GROUPS)) {
                            if (siCat === cat && padroes[grp]) { effFerrId = padroes[grp]; break; }
                        }
                    }

                    const ferr = bib.ferragens.find(f => f.id === effFerrId) || bib.ferragens.find(f => f.id === si.ferrId);
                    if (!ferr) return;

                    const qtdUnit = si.qtdFormula ? Math.ceil(Math.max(1, rCalc(si.qtdFormula, cD))) : 1;
                    const totalQtd = qtdUnit * cQtd;

                    if (!ferrTotal[ferr.id]) ferrTotal[ferr.id] = { id: ferr.id, nome: ferr.nome, qtd: 0, preco: ferr.preco, un: ferr.un || 'un', orig: [] };
                    ferrTotal[ferr.id].qtd += totalQtd;
                    ferrTotal[ferr.id].orig.push(`${compLabel} / ${si.nome}`);
                });
            });
        }
    }

    // Calcular custo de fita
    const fitaPreco = 0.85; // fallback
    fitaTotal.custo = fitaTotal.metros * fitaPreco;

    return { pecas, chapas: chapasTotal, ferragens: Object.values(ferrTotal), fita: fitaTotal };
}

function addChapa(chapasTotal, matId, area, bib) {
    if (!matId) return;
    const mat = bib.chapas.find(c => c.id === matId);
    if (!mat) return;
    if (!chapasTotal[matId]) {
        const areaChapa = (mat.larg * mat.alt) / 1e6;
        const perda = mat.perda_pct ?? 15;
        chapasTotal[matId] = {
            id: matId, nome: mat.nome, esp: mat.esp,
            larg: mat.larg, alt: mat.alt,
            preco: mat.preco, perda_pct: perda,
            areaChapa, areaUtil: areaChapa * (1 - perda / 100),
            areaPecas: 0, qtdChapas: 0,
        };
    }
    chapasTotal[matId].areaPecas += area;
    chapasTotal[matId].qtdChapas = chapasTotal[matId].areaUtil > 0
        ? Math.ceil(chapasTotal[matId].areaPecas / chapasTotal[matId].areaUtil)
        : 1;
}

// ═══════════════════════════════════════════════════════
// GET /api/producao/:projetoId — Ordem de Produção completa
// ═══════════════════════════════════════════════════════
router.get('/:projetoId', requireAuth, (req, res) => {
    const projetoId = parseInt(req.params.projetoId);

    const projeto = db.prepare(`
        SELECT p.*, o.mods_json, o.numero as orc_numero, o.ambiente as orc_ambiente,
               o.cliente_nome, o.valor_venda, o.custo_material
        FROM projetos p
        JOIN orcamentos o ON o.id = p.orc_id
        WHERE p.id = ?
    `).get(projetoId);

    if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });

    let mods = {};
    try { mods = JSON.parse(projeto.mods_json || '{}'); } catch { /* */ }

    // Incluir aditivos
    const aditivos = db.prepare(`
        SELECT id, numero, ambiente, mods_json, valor_venda, custo_material
        FROM orcamentos WHERE parent_orc_id = ? AND tipo = 'aditivo' AND kb_col NOT IN ('arquivo', 'perdido')
    `).all(projeto.orc_id);

    const bib = loadBiblioteca();

    // Calcular lista de corte do orçamento principal
    const principal = calcularListaCorte(mods, bib);

    // Calcular aditivos
    const aditivosCalc = aditivos.map(ad => {
        let adMods = {};
        try { adMods = JSON.parse(ad.mods_json || '{}'); } catch { /* */ }
        const calc = calcularListaCorte(adMods, bib);
        return { id: ad.id, numero: ad.numero, ambiente: ad.ambiente, ...calc };
    });

    // Consolidar tudo (principal + aditivos)
    const todasPecas = [...principal.pecas];
    const todasChapas = { ...principal.chapas };
    const todasFerragens = [...principal.ferragens];
    let totalFita = { metros: principal.fita.metros, custo: principal.fita.custo };

    aditivosCalc.forEach(ad => {
        todasPecas.push(...ad.pecas.map(p => ({ ...p, aditivo: ad.numero })));

        Object.entries(ad.chapas).forEach(([matId, data]) => {
            if (!todasChapas[matId]) {
                todasChapas[matId] = { ...data };
            } else {
                todasChapas[matId].areaPecas += data.areaPecas;
                todasChapas[matId].qtdChapas = todasChapas[matId].areaUtil > 0
                    ? Math.ceil(todasChapas[matId].areaPecas / todasChapas[matId].areaUtil) : 1;
            }
        });

        ad.ferragens.forEach(f => {
            const existing = todasFerragens.find(e => e.id === f.id);
            if (existing) { existing.qtd += f.qtd; existing.orig.push(...f.orig); }
            else todasFerragens.push({ ...f });
        });

        totalFita.metros += ad.fita.metros;
        totalFita.custo += ad.fita.custo;
    });

    // Comparar com estoque
    const estoque = {};
    try {
        const estoqueRows = db.prepare(`
            SELECT e.*, b.cod, b.nome, b.tipo as bib_tipo
            FROM estoque e JOIN biblioteca b ON b.id = e.material_id
        `).all();
        estoqueRows.forEach(r => {
            estoque[r.cod] = { quantidade: r.quantidade, minimo: r.quantidade_minima, nome: r.nome, tipo: r.bib_tipo };
        });
    } catch { /* tabela pode não existir */ }

    // BOM — lista de compras
    const bom = [];

    // Chapas
    Object.values(todasChapas).forEach(c => {
        const emEstoque = estoque[c.id]?.quantidade || 0;
        bom.push({
            tipo: 'chapa',
            id: c.id, nome: c.nome, un: 'chapa',
            necessario: c.qtdChapas,
            em_estoque: emEstoque,
            comprar: Math.max(0, c.qtdChapas - emEstoque),
            custo_unitario: c.preco,
            custo_total: c.qtdChapas * c.preco,
            area_pecas: c.areaPecas,
        });
    });

    // Ferragens
    todasFerragens.forEach(f => {
        const emEstoque = estoque[f.id]?.quantidade || 0;
        bom.push({
            tipo: 'ferragem',
            id: f.id, nome: f.nome, un: f.un,
            necessario: f.qtd,
            em_estoque: emEstoque,
            comprar: Math.max(0, f.qtd - emEstoque),
            custo_unitario: f.preco,
            custo_total: f.qtd * f.preco,
        });
    });

    // Fita
    if (totalFita.metros > 0) {
        bom.push({
            tipo: 'fita',
            id: 'fita22', nome: 'Fita de Borda 22mm', un: 'm',
            necessario: Math.ceil(totalFita.metros),
            em_estoque: estoque['fita22']?.quantidade || 0,
            comprar: Math.max(0, Math.ceil(totalFita.metros) - (estoque['fita22']?.quantidade || 0)),
            custo_unitario: 0.85,
            custo_total: totalFita.custo,
        });
    }

    // Resumo financeiro
    const custoChapas = Object.values(todasChapas).reduce((s, c) => s + c.qtdChapas * c.preco, 0);
    const custoFerragens = todasFerragens.reduce((s, f) => s + f.qtd * f.preco, 0);

    res.json({
        projeto: {
            id: projeto.id,
            nome: projeto.nome,
            status: projeto.status,
            orc_numero: projeto.orc_numero,
            orc_ambiente: projeto.orc_ambiente,
            cliente_nome: projeto.cliente_nome,
            valor_venda: projeto.valor_venda,
            custo_material: projeto.custo_material,
        },
        pecas: todasPecas,
        chapas: Object.values(todasChapas),
        ferragens: todasFerragens,
        fita: totalFita,
        bom,
        aditivos: aditivosCalc.map(a => ({ id: a.id, numero: a.numero, ambiente: a.ambiente })),
        resumo: {
            total_pecas: todasPecas.length,
            total_chapas: Object.values(todasChapas).reduce((s, c) => s + c.qtdChapas, 0),
            total_ferragens: todasFerragens.reduce((s, f) => s + f.qtd, 0),
            total_fita_m: totalFita.metros,
            custo_chapas: custoChapas,
            custo_ferragens: custoFerragens,
            custo_fita: totalFita.custo,
            custo_total: custoChapas + custoFerragens + totalFita.custo,
        },
    });
});

// ═══════════════════════════════════════════════════════
// GET /api/producao — listar projetos com ordem de produção
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const projetos = db.prepare(`
        SELECT p.id, p.nome, p.status, p.data_inicio, p.data_vencimento,
               o.numero, o.cliente_nome, o.ambiente, o.valor_venda, o.custo_material
        FROM projetos p
        JOIN orcamentos o ON o.id = p.orc_id
        ORDER BY p.criado_em DESC
    `).all();
    res.json(projetos);
});

export default router;
