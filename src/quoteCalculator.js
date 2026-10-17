import {
    DB_CHAPAS, DB_FERRAGENS, DB_ACABAMENTOS, DB_FITAS,
    calcItemV2, calcPainelRipado as rawCalcPainelRipado,
    calcItemEspecial as rawCalcItemEspecial, precoVendaV2,
    calcCustoHora, calcConsumiveis, estimarCorteReal,
} from './engine.js';
import { validateQuickItem } from './quickQuote.js';

// Contrato compartilhado entre o editor completo e o orçamento rápido.
// Sem rede, React ou banco de dados; não modifica os objetos recebidos.
export function buildQuoteLibrary(bibItems = []) {
    if (!bibItems.length) return null;
    const chapas = bibItems.filter(i => i.tipo === 'material' && i.unidade === 'chapa').map(i => ({
        id: i.cod || `bib_${i.id}`, nome: i.nome, esp: i.espessura, larg: i.largura,
        alt: i.altura, preco: i.preco, perda_pct: i.perda_pct ?? 15, fita_preco: i.fita_preco ?? 0,
        uso_count: i.uso_count || 0,
    }));
    const ferragens = bibItems.filter(i => i.tipo === 'ferragem' || i.tipo === 'acessorio').map(i => ({
        id: i.cod || `bib_${i.id}`, nome: i.nome, preco: i.preco, un: i.unidade,
        categoria: i.categoria || '', uso_count: i.uso_count || 0,
    }));
    const acabamentos = bibItems.filter(i => i.tipo === 'acabamento').map(i => ({
        id: i.cod || `bib_${i.id}`, nome: i.nome, preco: i.preco > 0 ? i.preco : (i.preco_m2 ?? i.preco),
        un: i.unidade === 'incluso' || i.incluso === true ? 'incluso' : 'm²',
        uso_count: i.uso_count || 0,
    }));
    const fitas = bibItems.filter(i => i.tipo === 'material' && i.unidade === 'm' && i.nome?.toLowerCase().includes('fita')).map(i => ({
        id: i.cod || `bib_${i.id}`, nome: i.nome, preco: i.preco,
    }));
    const top = items => [...items].sort((a, b) => (b.uso_count || 0) - (a.uso_count || 0)).filter(c => c.uso_count > 0).slice(0, 5);
    return {
        chapas: chapas.length ? chapas : DB_CHAPAS,
        ferragens: ferragens.length ? [...ferragens, ...DB_FERRAGENS.filter(df => !ferragens.find(bf => bf.id === df.id))] : DB_FERRAGENS,
        acabamentos: acabamentos.length ? acabamentos : DB_ACABAMENTOS,
        fitas: fitas.length ? fitas : DB_FITAS,
        topChapas: top(chapas), topAcab: top(acabamentos), raw: bibItems,
    };
}

export function resolveItemMats(item, amb) {
    if (item._matCustom || !amb?.matInt) return item.mats || {};
    return {
        matInt: amb.matInt,
        matExt: amb.matExt ?? item.mats?.matExt ?? '',
        matFundo: item.mats?.matFundo ?? '',
        matExtComp: item.mats?.matExtComp ?? '',
    };
}

export function applyQuoteDiscount(pvBase, desconto = { tipo: '%', valor: 0 }) {
    const errors = [];
    const value = desconto?.valor ?? 0;
    const type = desconto?.tipo ?? '%';
    if (!Number.isFinite(pvBase) || pvBase < 0) errors.push({ code: 'price_invalid', message: 'O preço base precisa ser um valor não negativo.' });
    if (!['%', 'R', 'R$'].includes(type)) errors.push({ code: 'discount_type_invalid', message: 'Selecione desconto em percentual ou reais.' });
    if (!Number.isFinite(value) || value < 0 || (type === '%' ? value > 100 : value > pvBase)) {
        errors.push({ code: 'discount_invalid', message: type === '%' ? 'O desconto precisa estar entre 0 e 100%.' : 'O desconto em reais deve estar entre zero e o preço base.' });
    }
    if (errors.length) return { descontoR: null, pvComDesconto: null, valid: false, errors };
    const descontoR = type === '%' ? pvBase * value / 100 : value;
    return { descontoR, pvComDesconto: Math.max(0, pvBase - descontoR), valid: true, errors: [] };
}

function countComponents(components) {
    const counts = { portas: 0, gavetas: 0, prateleiras: 0 };
    for (const ci of components) {
        const def = ci.compDef || {};
        const label = `${def.nome || ''} ${def.grupo || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const vars = Object.fromEntries((def.vars || []).map(v => [v.id, v.default]));
        Object.assign(vars, ci.vars || {});
        const quantity = ci.qtd ?? 1;
        if (/\bporta/.test(label)) counts.portas += (Number.isFinite(vars.nPortas) && vars.nPortas > 0 ? vars.nPortas : 1) * quantity;
        if (/gavet/.test(label)) counts.gavetas += (Number.isFinite(vars.nGavetas) && vars.nGavetas > 0 ? vars.nGavetas : 1) * quantity;
        if (/prateleira|shelf/.test(label)) counts.prateleiras += quantity;
    }
    return counts;
}

function validateItem(item) {
    const errors = [];
    const fail = (code, message) => errors.push({ code, message });
    if (!item.caixaDef || !Array.isArray(item.caixaDef.pecas)) fail('recipe_missing', 'O módulo precisa de uma receita de caixa válida.');
    if (!Number.isInteger(item.qtd ?? 1) || (item.qtd ?? 1) <= 0) fail('quantity_invalid', 'A quantidade do módulo precisa ser um inteiro positivo.');
    for (const key of item.caixaDef?.dimsAplicaveis || ['L', 'A', 'P']) {
        const value = item.dims?.[key.toLowerCase()];
        if (!Number.isFinite(value) || value <= 0) fail('dimension_invalid', `A dimensão ${key} do módulo precisa ser positiva.`);
    }
    if (item.caixaDef?.coef != null && (!Number.isFinite(item.caixaDef.coef) || item.caixaDef.coef < 0)) fail('coefficient_invalid', 'Coeficiente de dificuldade inválido.');
    for (const ci of item.componentes || []) {
        if (!ci.compDef) fail('component_missing', 'Um componente está sem receita.');
        if (!Number.isInteger(ci.qtd ?? 1) || (ci.qtd ?? 1) <= 0) fail('quantity_invalid', 'A quantidade do componente precisa ser um inteiro positivo.');
        for (const key of ['dimL', 'dimA', 'dimP']) if (ci[key] != null && (!Number.isFinite(ci[key]) || ci[key] < 0)) fail('dimension_invalid', `Dimensão ${key} inválida no componente.`);
    }
    if (item.quick?.kind) errors.push(...validateQuickItem(item));
    return errors;
}

function validateRates(taxas, strictCatalog = false) {
    const errors = [];
    for (const key of ['imp', 'com', 'lucro', 'inst', 'frete', 'mk_chapas', 'mk_fita', 'mk_acabamentos', 'mk_ferragens', 'mk_acessorios', 'mk_mdo']) {
        const acceptsNegative = key === 'lucro' && !strictCatalog;
        if (taxas[key] != null && (!Number.isFinite(taxas[key]) || (taxas[key] < 0 && !acceptsNegative) || (key.startsWith('mk_') && key !== 'mk_mdo' && taxas[key] === 0))) {
            errors.push({ code: 'rate_invalid', message: `Configuração inválida em ${key}.` });
        }
    }
    const sum = (taxas.imp ?? 0) + (taxas.com ?? 0) + (taxas.lucro ?? 0) + (taxas.inst ?? 5) + (taxas.frete ?? 0);
    if (sum >= 100) errors.push({ code: 'rates_total_invalid', message: 'A soma de impostos, comissão, lucro, instalação e frete precisa ser menor que 100%.' });
    return errors;
}

export function calculateQuote({ ambientes = [], taxas = {}, bib = null, padroes = {}, bibItems = [], strictCatalog = false } = {}) {
    taxas = taxas ?? {};
    const errors = validateRates(taxas, strictCatalog), warnings = [];
    const itemResults = {}, cache = new Map();
    const report = (issue, amb, item) => errors.push({ ...issue, ...(amb?.id ? { ambId: amb.id } : {}), ...(item?.id ? { itemId: item.id } : {}) });
    if (!Array.isArray(ambientes)) {
        errors.push({ code: 'environments_invalid', message: 'A lista de ambientes é inválida.' });
        ambientes = [];
    }
    // O editor mantém os fallbacks do ERP; a tela rápida exige cadastro real.
    const rawCatalog = Array.isArray(bib?.raw) ? bib.raw : (Array.isArray(bibItems) ? bibItems : []);
    const catalogIds = {
        chapa: new Set(rawCatalog.filter(i => i.tipo === 'material' && i.unidade === 'chapa').map(i => i.cod || `bib_${i.id}`)),
        ferragem: new Set(rawCatalog.filter(i => i.tipo === 'ferragem' || i.tipo === 'acessorio').map(i => i.cod || `bib_${i.id}`)),
        acabamento: new Set(rawCatalog.filter(i => i.tipo === 'acabamento').map(i => i.cod || `bib_${i.id}`)),
        fita: new Set(rawCatalog.filter(i => i.tipo === 'material' && i.unidade === 'm' && i.nome?.toLowerCase().includes('fita')).map(i => i.cod || `bib_${i.id}`)),
    };
    const checkCatalogUsage = (res, amb, item) => {
        const usages = [
            ...Object.entries(res.chapas).map(([id, c]) => ({ source: 'chapa', id, nome: c.mat.nome })),
            ...res.ferrList.map(f => ({ source: 'ferragem', id: f.id, nome: f.nome })),
            ...res.pecas.filter(p => !res.chapas[p.matId]).map(p => ({ source: 'acabamento', id: p.matId, nome: p.matId })),
        ];
        if (Object.keys(res.fitaByMat).some(id => !(res.chapas[id]?.mat.fita_preco > 0))) {
            const tape = (bib?.fitas || DB_FITAS)[0];
            usages.push({ source: 'fita', id: tape?.id || 'fita_padrao', nome: tape?.nome || 'Fita padrão' });
        }
        for (const usage of usages) {
            if (catalogIds[usage.source].has(usage.id)) continue;
            const issue = { code: 'fallback_price', source: usage.source, catalogId: usage.id,
                message: `${usage.nome}: preço padrão do ERP, sem cadastro correspondente na biblioteca real.` };
            warnings.push({ ...issue, ambId: amb.id, itemId: item.id });
            if (strictCatalog) report(issue, amb, item);
        }
    };
    if (!bib && ambientes.some(a => a.tipo !== 'manual' && (a.itens || []).some(i => i.tipo !== 'avulso'))) {
        const issue = { code: 'default_library', source: 'biblioteca', message: 'Cálculo usando os materiais e preços padrão do ERP.' };
        warnings.push(issue);
        if (strictCatalog) errors.push(issue);
    }
    for (const amb of ambientes) {
        for (const line of amb.tipo === 'manual' ? (amb.linhas || []) : []) {
            const value = line.tipo === 'bloco' ? line.valor : line.valorUnit;
            if (!Number.isFinite(value) || value < 0) report({ code: 'manual_price_invalid', message: 'Preço inválido em uma linha manual.' }, amb);
        }
        for (const item of amb.itens || []) {
            if (item.tipo === 'avulso' && (!Number.isFinite(item.valor) || item.valor < 0 || !Number.isInteger(item.qtd ?? 1) || (item.qtd ?? 1) <= 0)) {
                report({ code: 'manual_price_invalid', message: 'Valor ou quantidade inválida no item avulso.' }, amb, item);
            }
        }
    }
    const getItemResult = (item, amb) => {
        if (cache.has(item)) {
            const cached = cache.get(item);
            if (!cached || cached.valid === false) throw new Error('Receita incompleta');
            return cached;
        }
        const issues = validateItem(item);
        if (issues.length) {
            issues.forEach(issue => report(issue, amb, item));
            cache.set(item, null);
            throw new Error('Módulo inválido');
        }
        try {
            const res = calcItemV2(item.caixaDef, item.dims, resolveItemMats(item, amb), (item.componentes || []).map(ci => ({
                compDef: ci.compDef, qtd: ci.qtd ?? 1, vars: ci.vars || {},
                matExtComp: ci.matExtComp || '', subItens: ci.subItens || {}, subItensOvr: ci.subItensOvr || {},
                dimL: ci.dimL || 0, dimA: ci.dimA || 0, dimP: ci.dimP || 0,
                matIntInst: ci.matIntInst || '', matExtInst: ci.matExtInst || '',
            })), bib, padroes);
            cache.set(item, res);
            if (item.id) itemResults[item.id] = res;
            (res.errors || []).forEach(issue => report(issue, amb, item));
            (res.warnings || []).forEach(issue => warnings.push({ ...issue, ambId: amb.id, itemId: item.id }));
            checkCatalogUsage(res, amb, item);
            if (res.valid === false) throw new Error('Receita incompleta');
            return res;
        } catch (error) {
            if (!cache.has(item)) {
                report({ code: 'recipe_error', message: `Não foi possível calcular ${item.nome || 'o módulo'}: ${error.message}` }, amb, item);
                cache.set(item, null);
            }
            throw error;
        }
    };
    const calcPainelRipado = (cfg, materials) => {
        if (!(cfg.L > 0) || !(cfg.A > 0) || !Number.isFinite(cfg.L) || !Number.isFinite(cfg.A)) {
            errors.push({ code: 'panel_dimensions_invalid', message: 'Informe largura e altura válidas para o painel ripado.' });
        }
        const refs = [cfg.matRipaV];
        if (cfg.tipo === 'muxarabi' && cfg.mesmasRipas === false) refs.push(cfg.matRipaH);
        if (cfg.temSubstrato !== false) refs.push(cfg.matSubstrato);
        for (const ref of refs) {
            const mat = materials.find(m => m.tipo === 'material' && (m.id == ref || m.nome === ref));
            if (!mat || !(mat.preco_m2 > 0 || mat.preco > 0)) errors.push({ code: 'panel_material_invalid', message: 'Selecione materiais com preço para todas as partes do painel ripado.' });
        }
        const result = rawCalcPainelRipado(cfg, materials);
        if (!result) errors.push({ code: 'panel_invalid', message: 'A receita do painel ripado está incompleta.' });
        return result;
    };
    const calcItemEspecial = (item, materials) => {
        const result = rawCalcItemEspecial(item, materials);
        if (item.materialId && !materials.some(m => String(m.id) === String(item.materialId))) errors.push({ code: 'special_material_missing', message: `Material não encontrado em ${item.nome || 'item especial'}.` });
        if (!(result.custo > 0) || !Number.isFinite(result.custo)) errors.push({ code: 'special_price_invalid', message: `Informe um custo válido para ${item.nome || 'o item especial'}.` });
        return result;
    };
    let cm = 0, at = 0, ft = 0, manualTotal = 0;
    // ── Engine v2: custos separados por categoria ──
    let totChapas = 0, totFita = 0, totFerragens = 0, totAcabamentos = 0, totAcessorios = 0, totEspeciais = 0;
    const ca = {}, fa = {}, ambTotals = [];
    const itemCostList = []; // { ambId, custoItem, coef, ajuste }
    ambientes.forEach(amb => {
        let ambCm = 0;
        // ── Ambiente Manual: valor = preco de venda direto (sem markup) ──
        if (amb.tipo === 'manual') {
            (amb.linhas || []).forEach(ln => {
                if (ln.tipo === 'bloco') {
                    ambCm += Number(ln.valor) || 0;
                } else {
                    // compatibilidade com linhas antigas (descricao/qtd/valorUnit)
                    ambCm += (ln.qtd || 0) * (ln.valorUnit || 0);
                }
            });
            manualTotal += ambCm;
            ambTotals.push({ id: amb.id, custo: ambCm, manual: true });
            return;
        }
        let ambCP = 0;
        let ambAvulso = 0;
        amb.itens.forEach(item => {
            // Item avulso: valor = PV direto, bypass engine
            if (item.tipo === 'avulso') {
                const avValor = (Number(item.valor) || 0) * (item.qtd || 1);
                manualTotal += avValor;
                ambCm += avValor;
                ambAvulso += avValor;
                return;
            }
            try {
                const res = getItemResult(item, amb);
                const coef = item.caixaDef?.coef || 0;
                const qtd = item.qtd || 1;
                // Custos brutos (sem coef)
                const cChapas = (res.custoChapas || 0) * qtd;
                const cFita = (res.custoFita || 0) * qtd;
                const cFerr = (res.custoFerragens || 0) * qtd;
                const cAcab = (res.custoAcabamentos || 0) * qtd;
                const itemCusto = cChapas + cFita + cFerr + cAcab;
                cm += itemCusto; ambCm += itemCusto;
                // Acumular custos COM coef individual por categoria (para precoVendaV2)
                totChapas += cChapas * (1 + coef);
                totFita += cFita * (1 + coef);
                totAcabamentos += cAcab * (1 + coef);
                totFerragens += cFerr; // ferragens sem coef
                at += res.area * qtd;
                ft += res.fita * qtd;
                // CP individual com markups (consistente com precoVendaV2)
                const mk = { chapas: taxas.mk_chapas ?? 1.45, fita: taxas.mk_fita ?? 1.45, acabamentos: taxas.mk_acabamentos ?? 1.30, ferragens: taxas.mk_ferragens ?? 1.15, mdo: taxas.mk_mdo ?? 0.80 };
                const _ca = cChapas * (1 + coef);
                const _fa = cFita * (1 + coef);
                const _aa = cAcab * (1 + coef);
                const itemCP = _ca * mk.chapas + _fa * mk.fita + _aa * mk.acabamentos + cFerr * mk.ferragens + (_ca + _fa + _aa) * mk.mdo;
                ambCP += itemCP;
                itemCostList.push({ itemId: item.id, ambId: amb.id, custoItem: itemCusto, itemCP, coef, ajuste: item.ajuste || null });
                Object.entries(res.chapas).forEach(([id, c]) => {
                    if (!ca[id]) ca[id] = { mat: c.mat, area: 0, n: 0, frac: 0 };
                    ca[id].area += c.area * qtd;
                    const perda = c.mat.perda_pct != null ? c.mat.perda_pct : 15;
                    const areaUtil = ((c.mat.larg * c.mat.alt) / 1e6) * (1 - perda / 100);
                    ca[id].frac = areaUtil > 0 ? ca[id].area / areaUtil : 1;
                    ca[id].n = Math.ceil(ca[id].frac); // chapas inteiras reais
                });
                res.ferrList.forEach(f => {
                    if (!fa[f.id]) fa[f.id] = { ...f, qtd: 0 };
                    fa[f.id].qtd += f.qtd * qtd;
                });
            } catch (_) { }
            // ── Ripado dentro do módulo ──
            if (item.ripado) {
                try {
                    const ripCfg = { ...item.ripado, L: item.dims?.l || 0, A: item.dims?.a || 0 };
                    const ripRes = calcPainelRipado(ripCfg, bibItems);
                    if (ripRes) {
                        const rCoef = item.ripado.coefDificuldade ?? 1.3;
                        const rQtd = item.qtd || 1;
                        const ripCustoMat = ripRes.custoMaterial * rCoef * rQtd;
                        const ripCustoRaw = ripRes.custoMaterial * rQtd; // sem coef — para cm (custo material bruto)
                        const ripChapas = (ripRes.custoChapas || 0) * rCoef * rQtd;
                        const ripFita = (ripRes.custoFita || 0) * rCoef * rQtd;
                        totChapas += ripChapas;
                        totFita += ripFita;
                        cm += ripCustoRaw; ambCm += ripCustoRaw;
                        const mkC = taxas.mk_chapas ?? 1.45;
                        const mkF = taxas.mk_fita ?? 1.45;
                        const mkMdo = taxas.mk_mdo ?? 0.80;
                        const ripCP = ripChapas * mkC + ripFita * mkF + ripCustoMat * mkMdo;
                        ambCP += ripCP;
                        // Atualizar entry existente do módulo ou criar nova
                        const existing = itemCostList.find(e => e.itemId === item.id && e.ambId === amb.id);
                        if (existing) {
                            existing.custoItem += ripCustoMat;
                            existing.itemCP += ripCP;
                        } else {
                            itemCostList.push({ itemId: item.id, ambId: amb.id, custoItem: ripCustoMat, itemCP: ripCP, coef: 0, ajuste: item.ajuste || null });
                        }
                    }
                } catch (_) { }
            }
        });
        // ── Painéis ripados (custo vai pra chapas + fita, com coef dificuldade) ──
        (amb.paineis || []).forEach(painel => {
            try {
                const res = calcPainelRipado(painel, bibItems);
                if (res) {
                    const pCoef = painel.coefDificuldade ?? (painel.tipo === 'muxarabi' ? 1.5 : 1.3);
                    const qtdP = painel.qtd || 1;
                    const custoComCoef = res.custoMaterial * pCoef * qtdP;
                    const custoRaw = res.custoMaterial * qtdP; // sem coef — para cm (custo material bruto)
                    const chapasCoef = (res.custoChapas || 0) * pCoef * qtdP;
                    const fitaCoef = (res.custoFita || 0) * pCoef * qtdP;
                    totChapas += chapasCoef;
                    totFita += fitaCoef;
                    cm += custoRaw; ambCm += custoRaw;
                    // CP: chapas × mk_chapas + fita × mk_fita + mdo
                    const mkC = taxas.mk_chapas ?? 1.45;
                    const mkF = taxas.mk_fita ?? 1.45;
                    const mkMdo = taxas.mk_mdo ?? 0.80;
                    const painelCP = chapasCoef * mkC + fitaCoef * mkF + custoComCoef * mkMdo;
                    ambCP += painelCP;
                    itemCostList.push({ itemId: painel.id, ambId: amb.id, custoItem: custoComCoef, itemCP: painelCP, coef: 0, ajuste: null });
                }
            } catch (_) { }
        });
        // ── Itens Especiais (espelho, estofado, alumínio, vidro, outro) ──
        (amb.itensEspeciais || []).forEach(ie => {
            try {
                const res = calcItemEspecial(ie, bibItems);
                if (res.custo > 0) {
                    const mkEsp = taxas.mk_ferragens ?? 1.15;
                    cm += res.custo; ambCm += res.custo;
                    // Itens especiais = comprados prontos → categoria ferragens (sem coef dificuldade)
                    totFerragens += res.custo;
                    totEspeciais += res.custo;
                    const ieCP = res.custo * mkEsp;
                    ambCP += ieCP;
                    itemCostList.push({ itemId: ie.id, ambId: amb.id, custoItem: res.custo, itemCP: ieCP, coef: 0, ajuste: null });
                }
            } catch (_) { }
        });
        ambTotals.push({ id: amb.id, custo: ambCm, cp: ambCP, avulso: ambAvulso });
    });

    // ── Métricas acumuladas para custo-hora e consumíveis ──
    let totNPecas = 0, totNFerragens = 0, totNCaixas = 0, totNJuncoes = 0, totNModulos = 0;
    let totNPortas = 0, totNGavetas = 0, totNPrateleiras = 0;
    const pecasDetalhe = []; // { perimetro (mm), nBordas, fita (m), qtd }
    ambientes.forEach(amb => {
        if (amb.tipo === 'manual') return;
        (amb.itens || []).forEach(item => {
            if (item.tipo === 'avulso') return;
            const qtd = item.qtd || 1;
            try {
                const res = getItemResult(item, amb);
                totNPecas += (res.nPecas || 0) * qtd;
                totNFerragens += (res.nFerragens || 0) * qtd;
                totNCaixas += item.quick?.kind === 'extra' ? 0 : (res.nCaixas || 0) * qtd;
                totNJuncoes += item.quick?.kind === 'extra' ? 0 : (res.nJuncoes || 0) * qtd;
                totNModulos += item.quick?.kind === 'extra' ? 0 : qtd;
                // Coletar dimensões de cada peça para cálculo preciso CNC + fita
                res.pecas.forEach(p => {
                    pecasDetalhe.push({ perimetro: p.perimetro || 0, nBordas: p.nBordas || 0, fita: (p.fita || 0) * qtd, qtd: (p.qtd || 1) * qtd });
                });
                const componentCounts = countComponents(item.componentes || []);
                totNPortas += componentCounts.portas * qtd;
                totNGavetas += componentCounts.gavetas * qtd;
                totNPrateleiras += componentCounts.prateleiras * qtd;
                if (item.ripado) {
                    try {
                        const ripCfg = { ...item.ripado, L: item.dims?.l || 0, A: item.dims?.a || 0 };
                        const ripRes = calcPainelRipado(ripCfg, bibItems);
                        if (ripRes) {
                            totNPecas += (ripRes.nV || 0) + (ripRes.nH || 0) + (ripRes.temSubstrato ? 1 : 0);
                            totNModulos += 1;
                        }
                    } catch (_) {}
                }
            } catch (_) { }
        });
        (amb.paineis || []).forEach(painel => {
            try {
                const res = calcPainelRipado(painel, bibItems);
                if (res) {
                    totNPecas += (res.nV || 0) + (res.nH || 0) + (res.temSubstrato ? 1 : 0);
                    totNModulos += (painel.qtd || 1);
                }
            } catch (_) {}
        });
    });

    // ── Fase 1: Custo-hora real (se ativo) ──
    let custoHoraResult = null;
    if (taxas.custo_hora_ativo) {
        const coefMedio = totNModulos > 0
            ? ambientes.reduce((s, amb) => {
                if (amb.tipo === 'manual') return s;
                return s + (amb.itens || []).reduce((s2, it) => s2 + (it.caixaDef?.coef || 0) * (it.qtd || 1), 0);
            }, 0) / totNModulos
            : 0;
        custoHoraResult = calcCustoHora(
            {
                pecasDetalhe,
                nChapas: Object.values(ca).reduce((s, c) => s + (c.n || 0), 0),
                nFerragens: totNFerragens, nCaixas: totNCaixas,
                areaAcab: at * 0.6, nModulos: totNModulos,
                nPortas: totNPortas, nGavetas: totNGavetas, nPrateleiras: totNPrateleiras,
            },
            taxas,
            coefMedio,
        );
    }

    // ── Fase 2: Consumíveis (se ativo) ──
    let consumiveisResult = null;
    let totConsumiveis = 0;
    if (taxas.consumiveis_ativo) {
        // areaColagem = ~10% da área total (juntas de colagem, não toda a superfície)
        // nPontosParafuso = ~2 por caixa (fundo, trilho) + 1 por ferragem pesada
        const areaColagem = at * 0.12;
        const nPontosParafuso = totNCaixas * 2 + Math.ceil(totNFerragens * 0.3);
        // areaAcab = faces externas (~60% da área total para acabamento/lixa)
        const areaAcab = at * 0.6;
        consumiveisResult = calcConsumiveis(
            { areaColagem, nJuncoes: totNJuncoes, nPontosParafuso, areaAcab, nModulos: totNModulos },
            taxas,
        );
        totConsumiveis = consumiveisResult.custoConsumiveis || 0;
    }

    // ── Engine v2: precoVendaV2 com markups por categoria ──
    // totChapas/totFita/totAcabamentos já incluem coef individual de cada item.
    // Passa coef=0 para precoVendaV2 (coef já embutido nos totais).
    const pvResult = precoVendaV2(
        { chapas: totChapas, fita: totFita, acabamentos: totAcabamentos, ferragens: totFerragens, acessorios: totAcessorios, consumiveis: totConsumiveis },
        0,
        taxas,
        custoHoraResult,
    );
    const pv = pvResult.valor;
    const cp = pvResult.cp || 0;
    const custoMdo = pvResult.mdo || 0;

    // Total CP individual (soma dos CPs por item) — usado para proporção de PV
    const totalItemCP = itemCostList.reduce((s, i) => s + (i.itemCP || 0), 0)
        + ambTotals.filter(a => a.manual).reduce((s, a) => s + a.custo, 0);

    // Calcular ajustes por módulo (proporcional ao CP do item)
    let totalAjustes = 0;
    itemCostList.forEach(({ itemCP, ajuste }) => {
        if (!ajuste || !ajuste.valor) return;
        const precoBase = totalItemCP > 0 ? (itemCP / totalItemCP) * pv : 0;
        const ajR = ajuste.tipo === 'R' ? ajuste.valor : precoBase * (ajuste.valor / 100);
        totalAjustes += ajR;
    });

    const pvFinal = pv + totalAjustes + manualTotal;

    // Economia de chapas: diferença entre arredondamento individual vs global
    const chapasInteiras = Object.values(ca).reduce((s, c) => s + c.n, 0);
    const chapasFrac = Object.values(ca).reduce((s, c) => s + (c.frac || 0), 0);
    const chapasEconomia = Object.values(ca).reduce((s, c) => s + (c.n - (c.frac || 0)) * c.mat.preco, 0);

    // cmCalculado = custo material apenas dos itens calculados (exclui avulso/manual)
    // Nota: cm nunca inclui manualTotal (acumulados separadamente), então = cm
    const cmCalculado = cm;

    const result = {
        cm, cmCalculado, at, ft, ca, fa, pv, cp,
        pvErro: pvResult.erro, pvMsg: pvResult.msg,
        custoMdo, totChapas, totFita, totFerragens, totAcabamentos, totAcessorios, totEspeciais,
        ambTotals, totalAjustes, pvFinal, manualTotal, totalItemCP, itemCostList,
        breakdown: pvResult.breakdown,
        custoReal: pvResult.custoReal || 0,
        pisoMinimo: pvResult.pisoMinimo || 0,
        cb: cp, // compatibilidade
        chapasInteiras, chapasFrac, chapasEconomia,
        // Fase 3: estimativa de corte real
        corteReal: (() => {
            // Coletar peças individuais para FFD
            const allPecas = [];
            ambientes.forEach(amb => {
                if (amb.tipo === 'manual') return;
                (amb.itens || []).forEach(item => {
                    if (item.tipo === 'avulso') return;
                    try {
                        const res = getItemResult(item, amb);
                        const qtd = item.qtd || 1;
                        for (let q = 0; q < qtd; q++) {
                            res.pecas.forEach(p => { for (let unit = 0; unit < (p.qtd || 1); unit++) allPecas.push({ matId: p.matId, area: p.area / (p.qtd || 1) }); });
                        }
                    } catch (_) {}
                });
            });
            return estimarCorteReal(ca, allPecas);
        })(),
        // Fase 1+2: métricas para exibição
        custoHoraResult, consumiveisResult, totConsumiveis,
        totNPecas, totNFerragens, totNCaixas, totNModulos, totNPortas, totNGavetas, totNPrateleiras,
    };

    if (result.pvErro) errors.push({ code: 'pricing_invalid', message: result.pvMsg || 'Não foi possível formar o preço de venda.' });
    if (taxas.custo_hora_ativo && !(result.custoHoraResult?.custoMdo > 0)) warnings.push({ code: 'hourly_cost_fallback', message: 'Custo-hora sem valor positivo: foi mantido o cálculo proporcional de mão de obra do ERP.' });
    const clean = value => {
        if (typeof value === 'number' && !Number.isFinite(value)) {
            errors.push({ code: 'non_finite_result', message: 'O cálculo contém um valor numérico inválido; revise as entradas.' });
            return 0;
        }
        if (Array.isArray(value)) return value.map(clean);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
        return value;
    };
    const safeResult = clean({ ...result, itemResults });
    const unique = list => [...new Map(list.map(issue => [JSON.stringify(issue), issue])).values()];
    return { ...safeResult, valid: errors.length === 0, errors: unique(errors), warnings: unique(warnings) };
}
