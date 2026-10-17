/**
 * Composição livre sobre o mesmo contrato Caixa + Componentes do editor Novo.
 * Não consulta preços, não altera o catálogo e não recria receitas ao editar.
 */
export const COMPOSITION_VERSION = 1;
export const NO_GLOBAL_HANDLE = '__none__';

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const supplied = (value, fallback) => value === undefined ? fallback : value;
const uid = () => globalThis.crypto?.randomUUID?.() || `composition-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const hasId = (id) => typeof id === 'string' ? id.trim().length > 0 : typeof id === 'number' && Number.isFinite(id) && id > 0;
const cleanText = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const issue = (code, field, message) => ({ code, field, message });
const MATERIAL_KEYS = ['matInt', 'matExt', 'matFundo'];
const HARDWARE_GROUPS = { dobradica: 'dobradica', corredica: 'corredica', articulador: 'articulador', puxador: 'puxador' };

export class CompositionValidationError extends Error {
    constructor(errors) {
        super(errors.map((error) => error.message).join(' '));
        this.name = 'CompositionValidationError';
        this.errors = errors;
    }
}

function assertValid(errors) {
    if (errors.length) throw new CompositionValidationError(errors);
}

function numberError(errors, value, field, label, { integer = false, positive = false, min, max } = {}) {
    if (typeof value !== 'number' || !Number.isFinite(value)
        || (integer && !Number.isInteger(value)) || (positive && value <= 0)
        || (min !== undefined && value < min) || (max !== undefined && value > max)) {
        errors.push(issue('INVALID_NUMBER', field, `${label}: informe ${integer ? 'um número inteiro' : 'um número'}${positive ? ' positivo' : ' válido'}.`));
    }
}

export function normalizeHardwareUnit(unit) {
    const normalized = cleanText(unit);
    if (['m', 'ml', 'metro', 'metros', 'metro linear', 'metros lineares'].includes(normalized)) return 'm';
    if (['par', 'pares'].includes(normalized)) return 'par';
    if (['un', 'un.', 'unid', 'unid.', 'unidade', 'unidades', 'pc', 'pç', 'peca', 'pecas'].includes(normalized)) return 'un';
    return normalized;
}

function hardwareId(hardware) {
    if (hasId(hardware?.cod)) return hardware.cod;
    if (!hasId(hardware?.id)) return '';
    return hardware.tipo || hardware.unidade || typeof hardware.id === 'number' ? `bib_${hardware.id}` : hardware.id;
}

function hardwareUnit(hardware) {
    return normalizeHardwareUnit(hardware?.unidade || hardware?.un || '');
}

function selectedComponent(item, componentId) {
    const ci = (item?.componentes || []).find((entry) => entry.id === componentId);
    if (!ci) throw new CompositionValidationError([issue('COMPONENT_NOT_FOUND', 'componentId', 'O componente não foi encontrado neste móvel.')]);
    return ci;
}

function componentVariables(ci) {
    return { ...Object.fromEntries((ci.compDef?.vars || []).filter((v) => v.default !== undefined).map((v) => [v.id, v.default])), ...(ci.vars || {}) };
}

function promoteQuickDrawerLayout(item) {
    if (item.quick?.presetId !== 'gaveteiro3') return;
    const { drawerGap: gap, drawerTopBottomGap: topBottomGap, drawerBoxClearance: boxClearance } = item.quick;
    if (![gap, topBottomGap, boxClearance].every((value) => Number.isFinite(value) && value >= 0)) return;
    for (const ci of item.componentes || []) {
        const def = ci.compDef;
        // Só a adaptação conhecida do preset: receitas autorais e derivadas
        // já revisadas pelo usuário não recebem uma nova regra de distribuição.
        if (ci.quick?.role !== 'drawer' || ci.composition?.drawerLayout
            || def?.frente_externa?.calc !== 'Lg*frenteAf'
            || own(def.varsDeriv, 'frenteAf') || own(def.varsDeriv, 'ag')) continue;
        const frontVariable = def.vars?.find((variable) => variable.id === 'frenteAf');
        const originalFront = frontVariable?.default;
        if (!(Number.isFinite(originalFront) && originalFront > 0)) continue;
        const sameValue = (value, expected) => value === undefined || value === 0 || (Number.isFinite(value) && Math.abs(value - expected) < 1e-8);
        const frontAutomatic = sameValue(ci.vars?.frenteAf, originalFront);
        const boxAutomatic = sameValue(ci.vars?.ag, originalFront - boxClearance);
        const frontFormula = `(A-2*${topBottomGap}-(nUnits-1)*${gap})/nUnits`;
        const boxFormula = `frenteAf-${boxClearance}`;
        def.varsDeriv = { ...(def.varsDeriv || {}), frenteAf: frontFormula, ag: boxFormula };
        ci.vars = { ...ci.vars, ...(frontAutomatic ? { frenteAf: 0 } : {}), ...(boxAutomatic ? { ag: 0 } : {}) };
        ci.composition = {
            ...ci.composition,
            drawerLayout: { source: 'quick-preset', version: 1, gap, topBottomGap, boxClearance, frontFormula, boxFormula },
        };
    }
}

function validateQuickDrawerLayout(errors, item, ci, field) {
    const layout = ci.composition?.drawerLayout;
    const def = ci.compDef;
    if (layout?.source !== 'quick-preset'
        || def.varsDeriv?.frenteAf !== layout.frontFormula
        || def.varsDeriv?.ag !== layout.boxFormula) return;
    const frontAutomatic = ci.vars?.frenteAf === undefined || ci.vars.frenteAf === 0;
    const boxAutomatic = ci.vars?.ag === undefined || ci.vars.ag === 0;
    const height = ci.dimA > 0 ? ci.dimA : item.dims?.a;
    const frontHeight = frontAutomatic
        ? (height - 2 * layout.topBottomGap - (ci.qtd - 1) * layout.gap) / ci.qtd
        : ci.vars.frenteAf;
    const boxHeight = boxAutomatic ? frontHeight - layout.boxClearance : ci.vars.ag;
    const frontMin = Math.max(100, def.vars?.find((variable) => variable.id === 'frenteAf')?.min || 0);
    const boxMin = Math.max(60, def.vars?.find((variable) => variable.id === 'ag')?.min || 0);
    if (frontAutomatic && (!Number.isFinite(frontHeight) || frontHeight < frontMin)) {
        errors.push(issue('AUTO_DRAWER_FRONT_TOO_SMALL', `${field}.vars.frenteAf`, `A distribuição automática precisa de frentes com pelo menos ${frontMin} mm. Reduza a quantidade de gavetas ou aumente a altura disponível.`));
    }
    if (boxAutomatic && (!Number.isFinite(boxHeight) || boxHeight < boxMin)) {
        errors.push(issue('AUTO_DRAWER_BOX_TOO_SMALL', `${field}.vars.ag`, `A caixa automática da gaveta precisa ter pelo menos ${boxMin} mm de altura. Revise a quantidade, a altura disponível ou informe uma altura manual válida.`));
    }
}

function requirePieceMaterials(errors, pieces, mats, prefix) {
    const aliases = { int: 'matInt', ext: 'matExt', fundo: 'matFundo', ext_comp: 'matExtComp' };
    for (const [index, piece] of (pieces || []).entries()) {
        const field = `${prefix}.${index}`;
        if (!piece || typeof piece.calc !== 'string' || !piece.calc.trim()) {
            errors.push(issue('MISSING_PIECE_FORMULA', `${field}.calc`, 'Uma peça está sem fórmula de dimensões.'));
            continue;
        }
        numberError(errors, supplied(piece.qtd, 1), `${field}.qtd`, `Quantidade de ${piece.nome || 'peças'}`, { integer: true, positive: true });
        const materialKey = aliases[piece.mat];
        if ((materialKey && !hasId(mats[materialKey])) || (!materialKey && !hasId(piece.mat))) {
            errors.push(issue('MISSING_PIECE_MATERIAL', `${field}.mat`, `Selecione o material de ${piece.nome || 'uma peça'}.`));
        }
    }
}

/** Erros estruturados; dimensões seguem a receita, sem limites dos presets rápidos. */
export function validateCompositionItem(item) {
    const errors = [];
    if (!item?.caixaDef || !Array.isArray(item.caixaDef.pecas)) {
        return [issue('MISSING_BOX_RECIPE', 'caixaDef', 'Selecione uma caixa com receita no catálogo.')];
    }
    numberError(errors, supplied(item.qtd, 1), 'qtd', 'Quantidade de móveis', { integer: true, positive: true });
    const dimensions = new Set((item.caixaDef.dimsAplicaveis || ['L', 'A', 'P']).map((key) => String(key).toLowerCase()));
    for (const key of ['l', 'a', 'p']) {
        const required = dimensions.has(key);
        numberError(errors, item.dims?.[key], `dims.${key}`, `Medida ${key.toUpperCase()} (mm)`, required ? { positive: true } : { min: 0 });
    }
    if (item.caixaDef.coef !== undefined) numberError(errors, item.caixaDef.coef, 'caixaDef.coef', 'Coeficiente da caixa', { min: 0 });
    const mats = item.mats || {};
    requirePieceMaterials(errors, item.caixaDef.pecas, mats, 'caixaDef.pecas');
    if (mats.matExt) requirePieceMaterials(errors, item.caixaDef.tamponamentos, mats, 'caixaDef.tamponamentos');
    for (const [index, ci] of (item.componentes || []).entries()) {
        const field = `componentes.${index}`;
        const def = ci.compDef;
        if (!def || !Array.isArray(def.pecas)) {
            errors.push(issue('MISSING_COMPONENT_RECIPE', `${field}.compDef`, 'Um componente está sem receita.'));
            continue;
        }
        numberError(errors, supplied(ci.qtd, 1), `${field}.qtd`, `Quantidade de ${def.nome || 'componentes'}`, { integer: true, positive: true });
        for (const key of ['dimL', 'dimA', 'dimP']) if (ci[key] !== undefined) numberError(errors, ci[key], `${field}.${key}`, 'Medida do componente', { min: 0 });
        const vars = componentVariables(ci);
        for (const variable of def.vars || []) {
            const value = vars[variable.id];
            const automatic = value === 0 && own(def.varsDeriv, variable.id);
            if (automatic) continue;
            const count = normalizeHardwareUnit(variable.unit) === 'un' || /^n(Portas|Gavetas|Prateleiras)$/.test(variable.id);
            numberError(errors, value, `${field}.vars.${variable.id}`, variable.label || variable.id, {
                integer: count, min: variable.min, max: variable.max,
            });
        }
        validateQuickDrawerLayout(errors, item, ci, field);
        requirePieceMaterials(errors, def.pecas, {
            ...mats, matInt: ci.matIntInst || mats.matInt, matExt: ci.matExtInst || mats.matExt, matExtComp: ci.matExtComp,
        }, `${field}.compDef.pecas`);
        if (def.frente_externa?.ativa && !hasId(ci.matExtComp)) {
            errors.push(issue('MISSING_FRONT_MATERIAL', `${field}.matExtComp`, `Selecione o material da frente de ${def.nome || 'componente'}.`));
        }
        if (ci.composition?.kind === 'loose-hardware') {
            const unit = normalizeHardwareUnit(ci.composition.unit);
            if (!unit) errors.push(issue('MISSING_HARDWARE_UNIT', `${field}.composition.unit`, 'A ferragem precisa de uma unidade cadastrada.'));
            numberError(errors, vars.quantidade, `${field}.vars.quantidade`, `Quantidade de ${def.nome || 'ferragem'} (${unit || 'unidade'})`, { positive: true, integer: unit !== 'm' });
            if (ci.qtd !== 1) errors.push(issue('INVALID_LOOSE_MULTIPLIER', `${field}.qtd`, 'Edite a quantidade da ferragem no campo da sua unidade.'));
        }
        for (const [subId, enabled] of Object.entries(ci.subItens || {})) {
            if (typeof enabled !== 'boolean') errors.push(issue('INVALID_HARDWARE_STATE', `${field}.subItens.${subId}`, 'Ative ou desative a ferragem explicitamente.'));
        }
    }
    return errors;
}

function checked(item) {
    assertValid(validateCompositionItem(item));
    return item;
}

/** Converte vínculo de preset em edição livre; conserva receita, IDs e ajustes. */
export function promoteToCatalogItem(item) {
    const next = clone(item);
    if (!next || !next.caixaDef) throw new CompositionValidationError([issue('MISSING_BOX_RECIPE', 'item', 'Este item não contém uma receita de caixa.')]);
    const quickKind = next.quick?.kind;
    next.composition = {
        version: COMPOSITION_VERSION, ...next.composition, mode: 'catalog',
        kind: next.composition?.kind || (quickKind === 'extra' ? 'extra' : 'box'),
        group: next.composition?.group || next.quick?.group || 'catalog',
        matFrente: next.composition?.matFrente ?? next.componentes?.find((ci) => ci.matExtComp)?.matExtComp ?? '',
    };
    if (next.quick) delete next.quick.kind;
    next.componentes = next.componentes || [];
    promoteQuickDrawerLayout(next);
    return next;
}

/** materials = {matInt,matExt,matFundo,matFrente}; preserva todas as peças da caixa. */
export function createCatalogBoxItem(caixaDef, dims, materials = {}, options = {}) {
    if (!hasId(caixaDef?.db_id)) throw new CompositionValidationError([issue('MISSING_CATALOG_ID', 'caixaDef.db_id', 'A caixa precisa de identificação no catálogo.')]);
    const snapshot = clone(caixaDef);
    const applicable = new Set((snapshot.dimsAplicaveis || ['L', 'A', 'P']).map((key) => String(key).toLowerCase()));
    const item = {
        id: options.id || (options.idFactory || uid)(), caixaId: snapshot.db_id, caixaDef: snapshot,
        nome: options.nome ?? snapshot.nome ?? 'Caixa',
        dims: Object.fromEntries(['l', 'a', 'p'].map((key) => [key, supplied(dims?.[key], applicable.has(key) ? undefined : 0)])),
        qtd: supplied(options.qtd, 1),
        mats: Object.fromEntries(MATERIAL_KEYS.map((key) => [key, materials[key] || ''])),
        componentes: [], grupo_id: options.grupo_id || '', ordem: options.ordem ?? 0,
        _matCustom: Boolean(options.matCustom),
        composition: { version: COMPOSITION_VERSION, mode: 'catalog', kind: 'box', group: options.group || 'catalog', matFrente: materials.matFrente || '' },
    };
    return checked(item);
}

/** Atualiza campos de instância. materials sem matCustom é uma troca de padrão. */
export function updateCatalogItem(item, updates = {}) {
    const next = promoteToCatalogItem(item);
    if (own(updates, 'dims')) next.dims = { ...next.dims, ...clone(updates.dims) };
    for (const key of ['qtd', 'nome', 'ordem', 'grupo_id', 'descricao', 'ajuste']) if (own(updates, key)) next[key] = clone(updates[key]);
    if (own(updates, 'matCustom')) next._matCustom = Boolean(updates.matCustom);
    if (updates.materials) {
        const materials = updates.materials;
        next.mats = { ...next.mats };
        for (const key of MATERIAL_KEYS) if (own(materials, key)) next.mats[key] = materials[key];
        if (own(materials, 'matFrente')) {
            next.composition.matFrente = materials.matFrente;
            next.componentes = next.componentes.map((ci) => {
                if (!ci.compDef?.frente_externa?.ativa || ci.composition?.matCustom) return ci;
                return { ...ci, matExtComp: materials.matFrente };
            });
        }
    }
    return checked(next);
}

export const updateCompositionItem = updateCatalogItem;

export function duplicateCatalogItem(item, options = {}) {
    const next = promoteToCatalogItem(item);
    const idFactory = options.idFactory || uid;
    next.id = options.id || idFactory();
    next.componentes = next.componentes.map((ci) => ({ ...ci, id: idFactory() }));
    for (const key of ['nome', 'qtd', 'ordem', 'grupo_id']) if (own(options, key)) next[key] = options[key];
    return checked(next);
}

export const duplicateCompositionItem = duplicateCatalogItem;

export function addCatalogComponent(item, compDef, options = {}) {
    if (!hasId(compDef?.db_id)) throw new CompositionValidationError([issue('MISSING_CATALOG_ID', 'compDef.db_id', 'O componente precisa de identificação no catálogo.')]);
    const next = promoteToCatalogItem(item);
    const snapshot = clone(compDef);
    const defaults = Object.fromEntries((snapshot.vars || []).filter((v) => v.default !== undefined).map((v) => [v.id, v.default]));
    const front = supplied(options.matExtComp, options.materials?.matFrente ?? next.composition.matFrente ?? '');
    next.componentes.push({
        id: options.id || (options.idFactory || uid)(), compId: snapshot.db_id, compDef: snapshot,
        qtd: supplied(options.qtd, 1), vars: { ...defaults, ...clone(options.vars || {}) },
        matExtComp: snapshot.frente_externa?.ativa ? front : '',
        dimL: supplied(options.dimL, 0), dimA: supplied(options.dimA, 0), dimP: supplied(options.dimP, 0),
        matIntInst: options.matIntInst || '', matExtInst: options.matExtInst || '',
        subItens: { ...Object.fromEntries((snapshot.sub_itens || []).map((si) => [si.id, Boolean(si.defaultOn)])), ...clone(options.subItens || {}) },
        subItensOvr: clone(options.subItensOvr || {}),
        composition: { kind: 'catalog-component', matCustom: Boolean(options.matCustom) },
    });
    return checked(next);
}

function mergeOptionalMap(previous, updates) {
    const next = { ...previous };
    for (const [key, value] of Object.entries(updates || {})) {
        if (value === null || value === undefined) delete next[key];
        else next[key] = clone(value);
    }
    return next;
}

export function updateCatalogComponent(item, componentId, updates = {}) {
    const next = promoteToCatalogItem(item);
    const ci = selectedComponent(next, componentId);
    for (const key of ['qtd', 'matExtComp', 'dimL', 'dimA', 'dimP', 'matIntInst', 'matExtInst', 'nome']) if (own(updates, key)) ci[key] = clone(updates[key]);
    for (const key of ['vars', 'subItens', 'subItensOvr']) if (own(updates, key)) ci[key] = mergeOptionalMap(ci[key], updates[key]);
    if (own(updates, 'matExtComp') || own(updates, 'matCustom')) {
        ci.composition = { ...ci.composition, matCustom: supplied(updates.matCustom, true) };
    }
    return checked(next);
}

export function removeCatalogComponent(item, componentId) {
    const next = promoteToCatalogItem(item);
    selectedComponent(next, componentId);
    next.componentes = next.componentes.filter((ci) => ci.id !== componentId);
    return checked(next);
}

export function duplicateCatalogComponent(item, componentId, options = {}) {
    const next = promoteToCatalogItem(item);
    const ci = clone(selectedComponent(next, componentId));
    ci.id = options.id || (options.idFactory || uid)();
    if (own(options, 'qtd')) ci.qtd = options.qtd;
    next.componentes.push(ci);
    return checked(next);
}

function looseHardwareComponent(hardware, quantity, options = {}) {
    const id = hardwareId(hardware);
    const unit = hardwareUnit(hardware);
    const errors = [];
    if (!hasId(id)) errors.push(issue('MISSING_HARDWARE_ID', 'hardware', 'Selecione uma ferragem da biblioteca.'));
    if (!unit) errors.push(issue('MISSING_HARDWARE_UNIT', 'hardware.unit', 'A ferragem precisa de unidade cadastrada.'));
    numberError(errors, quantity, 'quantity', `Quantidade (${unit || 'unidade'})`, { positive: true, integer: unit !== 'm' });
    assertValid(errors);
    return {
        id: options.id || (options.idFactory || uid)(), compId: null,
        compDef: {
            nome: 'Ferragem avulsa', tipo_item: 'componente', cat: 'componente', coef: 0,
            dimsAplicaveis: [], pecas: [], varsDeriv: {},
            vars: [{ id: 'quantidade', label: `Quantidade (${unit})`, default: 1, min: 0, unit }],
            frente_externa: { ativa: false },
            sub_itens: [{ id: 'loose', nome: hardware.nome || 'Ferragem', ferrId: id, defaultOn: true, qtdFormula: 'quantidade' }],
        },
        qtd: 1, vars: { quantidade: quantity }, matExtComp: '',
        subItens: { loose: true }, subItensOvr: { loose: id },
        composition: { kind: 'loose-hardware', hardwareId: id, unit, nome: hardware.nome || 'Ferragem' },
    };
}

/** quantity usa a unidade comercial cadastrada: 1 par, 2 un ou 1,5 m. */
export function addLooseHardware(item, hardware, options = {}) {
    const next = promoteToCatalogItem(item);
    next.componentes.push(looseHardwareComponent(hardware, supplied(options.quantity, 1), options));
    return checked(next);
}

export function updateLooseHardware(item, componentId, updates = {}) {
    const next = promoteToCatalogItem(item);
    const previous = selectedComponent(next, componentId);
    if (previous.composition?.kind !== 'loose-hardware') throw new CompositionValidationError([issue('NOT_LOOSE_HARDWARE', 'componentId', 'Este componente não é uma ferragem avulsa.')]);
    const quantity = supplied(updates.quantity, previous.vars?.quantidade ?? 1);
    if (updates.hardware) {
        const replacement = looseHardwareComponent(updates.hardware, quantity, { id: previous.id });
        Object.assign(previous, replacement);
    } else previous.vars = { ...previous.vars, quantidade: quantity };
    return checked(next);
}

export const removeLooseHardware = removeCatalogComponent;

/** ferrId vazio/null retoma herança; enabled:false desliga mesmo com padrão global. */
export function setComponentHardware(item, componentId, subItemId, { enabled, ferrId } = {}) {
    const next = promoteToCatalogItem(item);
    const ci = selectedComponent(next, componentId);
    if (!(ci.compDef.sub_itens || []).some((si) => si.id === subItemId)) throw new CompositionValidationError([issue('HARDWARE_SLOT_NOT_FOUND', 'subItemId', 'A ferragem não foi encontrada neste componente.')]);
    if (enabled !== undefined) ci.subItens = { ...ci.subItens, [subItemId]: enabled };
    if (ferrId !== undefined) {
        ci.subItensOvr = { ...ci.subItensOvr };
        if (ferrId === '' || ferrId === null) delete ci.subItensOvr[subItemId];
        else ci.subItensOvr[subItemId] = ferrId;
    }
    return checked(next);
}

/** Resolve apenas escolha/herança; preços continuam sob responsabilidade do motor. */
export function getComponentHardware(item, componentId, bibItems = [], padroes = {}) {
    const ci = selectedComponent(item, componentId);
    const library = Array.isArray(bibItems) ? bibItems : (bibItems?.ferragens || []);
    const lookup = (id) => library.find((hardware) => hardwareId(hardware) === id) || null;
    return (ci.compDef?.sub_itens || []).map((si) => {
        const baseHardware = lookup(si.ferrId);
        const category = cleanText(baseHardware?.categoria);
        const group = Object.keys(HARDWARE_GROUPS).find((key) => HARDWARE_GROUPS[key] === category);
        const configuredEnabled = own(ci.subItens, si.id) ? ci.subItens[si.id] : Boolean(si.defaultOn);
        const override = ci.subItensOvr?.[si.id];
        const global = group ? padroes?.[group] : '';
        const effective = override || global || si.ferrId;
        const globalDisabled = !override && group === 'puxador' && global === NO_GLOBAL_HANDLE;
        const enabled = Boolean(configuredEnabled) && !globalDisabled;
        const source = !configuredEnabled ? 'disabled' : override ? 'override' : global ? 'global' : 'component';
        const hardware = globalDisabled ? null : lookup(effective);
        return {
            id: si.id, subItemId: si.id, nome: si.nome || hardware?.nome || 'Ferragem',
            enabled, configuredEnabled: Boolean(configuredEnabled), defaultFerrId: si.ferrId,
            effectiveFerrId: globalDisabled ? '' : effective, hardware,
            unit: hardwareUnit(hardware) || ci.composition?.unit || '', source, group: group || '',
        };
    });
}

export function getBoxParts(item) {
    const parts = [];
    for (const source of ['pecas', 'tamponamentos']) {
        for (const part of item?.caixaDef?.[source] || []) parts.push({ id: part.id, pieceId: part.id, enabled: true, source, part: clone(part) });
    }
    for (const entry of item?.composition?.disabledBoxParts || []) {
        parts.push({ id: entry.part.id, pieceId: entry.part.id, enabled: false, source: entry.source, part: clone(entry.part) });
    }
    const order = item?.composition?.boxPartOrder || {};
    return parts.sort((a, b) => a.source !== b.source ? (a.source === 'pecas' ? -1 : 1) : (order[a.source]?.indexOf(a.id) ?? 0) - (order[b.source]?.indexOf(b.id) ?? 0));
}

/** Desativa sem destruir a receita original; reativar repõe a mesma peça e ordem. */
export function setBoxPartEnabled(item, pieceId, enabled, options = {}) {
    const next = promoteToCatalogItem(item);
    if (typeof enabled !== 'boolean') throw new CompositionValidationError([issue('INVALID_PART_STATE', 'enabled', 'Ative ou desative a peça explicitamente.')]);
    const matches = getBoxParts(next).filter((entry) => entry.id === pieceId && (!options.source || entry.source === options.source));
    if (!hasId(pieceId) || matches.length !== 1) throw new CompositionValidationError([issue('BOX_PART_NOT_FOUND', 'pieceId', 'Selecione uma peça com identificação única na receita.')]);
    const entry = matches[0];
    if (entry.enabled === enabled) return next;
    next.composition.disabledBoxParts = next.composition.disabledBoxParts || [];
    next.composition.boxPartOrder = next.composition.boxPartOrder || {};
    if (!next.composition.boxPartOrder[entry.source]) next.composition.boxPartOrder[entry.source] = getBoxParts(next).filter((p) => p.source === entry.source).map((p) => p.id);
    if (!enabled) {
        next.composition.disabledBoxParts.push({ source: entry.source, part: clone(entry.part) });
        next.caixaDef[entry.source] = (next.caixaDef[entry.source] || []).filter((part) => part.id !== pieceId);
    } else {
        next.caixaDef[entry.source] = [...(next.caixaDef[entry.source] || []), clone(entry.part)];
        const order = next.composition.boxPartOrder[entry.source];
        next.caixaDef[entry.source].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        next.composition.disabledBoxParts = next.composition.disabledBoxParts.filter((record) => record.source !== entry.source || record.part.id !== pieceId);
    }
    return checked(next);
}
