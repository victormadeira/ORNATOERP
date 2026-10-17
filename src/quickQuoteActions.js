/** Controles diretos do cartão; o custo continua sendo calculado pelo motor. */
import { rebuildQuickItem, validateQuickItem } from './quickQuote.js';
import {
    CompositionValidationError, promoteToCatalogItem, validateCompositionItem,
    addCatalogComponent, updateCatalogComponent, removeCatalogComponent,
    getComponentHardware, setComponentHardware, normalizeHardwareUnit,
} from './quoteComposition.js';

const TYPES = { doors: { role: 'door', name: 'porta', option: 'doorCount' }, drawers: { role: 'drawer', name: 'gaveta', option: 'drawerCount' }, shelves: { role: 'shelf', name: 'prateleira', option: 'shelfCount' } };
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const normalized = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const formula = (value) => String(value ?? '').replace(/\s/g, '');
const hasId = (value) => typeof value === 'string' ? Boolean(value.trim()) : Number.isFinite(value) && value > 0;
const isExtra = (item) => item?.quick?.kind === 'extra' || item?.composition?.kind === 'extra';
const isQuick = (item) => item?.quick?.kind === 'module' && item?.composition?.mode !== 'catalog';
const isLoose = (ci) => ci?.composition?.kind === 'loose-hardware';
const ownFront = (item) => item?.composition?.frontCustom ?? Boolean(item?._matCustom);
const variables = (ci) => ({ ...Object.fromEntries((ci.compDef?.vars || []).map((v) => [v.id, v.default])), ...ci.vars });
const fail = (code, field, message) => { throw new CompositionValidationError([{ code, field, message }]); };
const canonical = (value) => JSON.stringify(value, (_, child) => child && typeof child === 'object' && !Array.isArray(child) ? Object.fromEntries(Object.keys(child).sort().map((key) => [key, child[key]])) : child);
const advancedReason = 'Esta composição tem ajustes próprios. Use Personalizar para alterar a quantidade.';

function check(item) {
    const errors = isQuick(item) ? validateQuickItem(item) : validateCompositionItem(item);
    if (errors.length) throw new CompositionValidationError(errors);
    return item;
}

function matchesType(ci, type) {
    if (isLoose(ci)) return false;
    if (ci.quick?.role === TYPES[type].role) return true;
    const name = normalized((ci.compDef?.nome || '') + ' ' + (ci.compDef?.grupo || ''));
    return type === 'doors' ? /\bporta/.test(name) : type === 'drawers' ? /gavet/.test(name) : /prateleira|\bshelf\b/.test(name);
}

function drawerDistribution(item, ci) {
    if (item.quick?.presetId !== 'gaveteiro3' || ci.quick?.role !== 'drawer') return null;
    const def = ci.compDef || {};
    const layout = ci.composition?.drawerLayout;
    const height = ci.dimA > 0 ? ci.dimA : item.dims?.a;
    let gap, topBottomGap, boxClearance, automatic;
    if (layout?.source === 'quick-preset') {
        ({ gap, topBottomGap, boxClearance } = layout);
        automatic = def.varsDeriv?.frenteAf === layout.frontFormula && def.varsDeriv?.ag === layout.boxFormula
            && (ci.vars?.frenteAf === undefined || ci.vars.frenteAf === 0)
            && (ci.vars?.ag === undefined || ci.vars.ag === 0);
    } else {
        ({ drawerGap: gap, drawerTopBottomGap: topBottomGap, drawerBoxClearance: boxClearance } = item.quick);
        const expected = (height - 2 * topBottomGap - (ci.qtd - 1) * gap) / ci.qtd;
        automatic = formula(def.frente_externa?.calc) === 'Lg*frenteAf'
            && !own(def.varsDeriv, 'frenteAf') && !own(def.varsDeriv, 'ag')
            && Number.isFinite(expected) && Math.abs(ci.vars?.frenteAf - expected) < 1e-8
            && Math.abs(ci.vars?.ag - (expected - boxClearance)) < 1e-8;
    }
    if (![gap, topBottomGap, boxClearance, height].every(Number.isFinite)) automatic = false;
    const frontMin = Math.max(100, def.vars?.find((v) => v.id === 'frenteAf')?.min || 0);
    const boxMin = Math.max(60, def.vars?.find((v) => v.id === 'ag')?.min || 0);
    const max = Math.min(12, Math.floor((height - 2 * topBottomGap + gap) / (Math.max(frontMin, boxMin + boxClearance) + gap)));
    return { automatic, max };
}

// Um contador edita uma instância homogênea. Kits, fórmulas de quantidade e
// frentes independentes continuam acessíveis pelo editor completo.
function componentCount(item, ci, type) {
    const def = ci.compDef || {}, vars = variables(ci), qty = ci.qtd ?? 1;
    const front = def.frente_externa || {};
    const frontQty = formula(front.qtdFormula);
    let value = qty, mode = 'quantity', max;
    let safe = Number.isSafeInteger(qty) && qty > 0 && Array.isArray(def.pecas);
    if (type === 'doors') {
        const hasCount = own(vars, 'nPortas') || def.vars?.some((v) => v.id === 'nPortas');
        value = (hasCount ? vars.nPortas : 1) * qty;
        safe &&= Boolean(front.ativa) && def.pecas.length === 0;
        if (hasCount) {
            mode = 'variable';
            max = def.vars?.find((v) => v.id === 'nPortas')?.max;
            safe &&= qty === 1 && Number.isSafeInteger(vars.nPortas) && vars.nPortas > 0
                && /\bLp\b/.test(front.calc || '') && /\bnPortas\b/.test(def.varsDeriv?.Lp || '')
                && !own(def.varsDeriv, 'nPortas') && (!frontQty || frontQty === 'nPortas');
        } else {
            safe &&= normalized(def.nome) === 'porta' && (!frontQty || frontQty === '1')
                && /\bLp\b/.test(front.calc || '')
                && (!def.varsDeriv?.Lp || /\bnUnits\b/.test(def.varsDeriv.Lp));
        }
    } else if (type === 'shelves') {
        safe &&= !front.ativa && def.pecas.length === 1 && (def.pecas[0].qtd ?? 1) === 1
            && !own(vars, 'nPrateleiras');
    } else {
        value = (vars.nGavetas ?? 1) * qty;
        safe &&= Boolean(front.ativa) && (!frontQty || frontQty === '1') && !own(vars, 'nGavetas')
            && (normalized(def.nome) === 'gaveta' || ci.quick?.role === 'drawer');
        const layout = drawerDistribution(item, ci);
        if (layout) { safe &&= layout.automatic; max = layout.max; }
    }
    if (!Number.isSafeInteger(value) || value < 0) value = null;
    return { safe, value, mode, max: Number.isFinite(max) ? max : undefined, min: type === 'drawers' && drawerDistribution(item, ci) ? 1 : 0 };
}

function remembered(item, type) {
    return item.quickControls?.removed?.[type] || null;
}

function sourceForEmpty(item, type, catalog) {
    const removed = remembered(item, type);
    if (removed?.component) return { ci: removed.component, removed };
    let definitions;
    if (isQuick(item)) definitions = (item.quick.componentTemplates || []).filter((entry) => entry.role === TYPES[type].role).map((entry) => entry.compDef);
    else definitions = (catalog?.componentes || []).filter((def) => normalized(def.nome) === TYPES[type].name);
    if (definitions.length !== 1 || !hasId(definitions[0]?.db_id)) return null;
    const compDef = definitions[0];
    const vars = Object.fromEntries((compDef.vars || []).map((v) => [v.id, v.default]));
    if (type === 'doors' && own(vars, 'nPortas')) vars.nPortas = 1;
    return { ci: { compDef, qtd: 1, vars }, definition: compDef };
}

function analyzeCount(item, type, catalog) {
    if (isExtra(item) && !(item.componentes || []).some((ci) => matchesType(ci, type))) return { value: 0, editable: false, available: false, applicable: false, min: 0 };
    const matches = (item.componentes || []).filter((ci) => matchesType(ci, type));
    const source = matches.length ? null : sourceForEmpty(item, type, catalog);
    const analyzed = matches.map((ci) => componentCount(item, ci, type));
    const spec = matches.length === 1 ? analyzed[0] : source ? componentCount(item, source.ci, type) : null;
    const value = analyzed.some((entry) => entry.value === null) ? null : analyzed.reduce((sum, entry) => sum + entry.value, 0);
    let editable = matches.length <= 1 && Boolean(spec?.safe);
    let reason = editable ? '' : matches.length ? advancedReason : 'Adicione ou escolha a receita em Personalizar.';
    // O preset só oferece tipos presentes em sua receita. Não insere gavetas
    // atrás de portas nem prateleiras dentro do gaveteiro automaticamente.
    if (isQuick(item) && !matches.length && !source) editable = false;
    if (spec?.max !== undefined && spec.max < Math.max(1, spec.min)) {
        editable = false;
        reason = 'A altura disponível não permite a distribuição automática. Revise as medidas ou use Personalizar.';
    }
    const max = isQuick(item) ? Math.min(spec?.max ?? Infinity, { doors: 8, drawers: 12, shelves: 16 }[type]) : spec?.max;
    return {
        value, editable, available: editable, applicable: Boolean(matches.length || source),
        min: spec?.min ?? 0, max, reason,
        ci: matches[0], source, mode: spec?.mode,
    };
}

function currentMaterials(item, materials = {}) {
    return {
        matInt: item.mats?.matInt || materials.matInt || '',
        matFundo: item.mats?.matFundo || materials.matFundo || '',
        matFrente: ownFront(item) && item.composition?.matFrente ? item.composition.matFrente
            : item.componentes?.find((ci) => ci.compDef?.frente_externa?.ativa)?.matExtComp
                || materials.matFrente || item.composition?.matFrente || '',
    };
}

// Detecta o que rebuildQuickItem de fato preserva. Um móvel que recebeu peças,
// variáveis ou componentes autorais passa a usar edição por instância.
function quickBaseline(item) {
    if (!isQuick(item)) return null;
    try {
        const baseline = rebuildQuickItem(item, { materials: currentMaterials(item) });
        for (const key of ['caixaDef', 'mats', 'componentes']) if (canonical(baseline[key]) !== canonical(item[key])) return null;
        return baseline;
    } catch { return null; }
}

// Usa somente o título da receita e descarta a reconstrução. Assim um preset
// promovido pode atualizar seu nome automático sem tocar no snapshot autoral.
function generatedName(item, materials) {
    if (!item.quick?.presetId || isExtra(item)) return null;
    try { return rebuildQuickItem(item, { materials: currentMaterials(item, materials) }).nome; }
    catch { return null; }
}

function prepare(item) {
    return isQuick(item) && quickBaseline(item) ? clone(item) : promoteToCatalogItem(item);
}

function saveRemoved(item, type, component, index) {
    item.quickControls = { ...item.quickControls, removed: { ...item.quickControls?.removed, [type]: { component: clone(component), index } } };
}

function clearRemoved(item, type) {
    if (item.quickControls?.removed) delete item.quickControls.removed[type];
}

/** type: doors | drawers | shelves. Valores inválidos nunca alteram o original. */
export function setQuickItemCount(item, type, value, catalog = {}, materials = {}) {
    if (!TYPES[type]) fail('UNKNOWN_COUNT', 'type', 'Selecione portas, gavetas ou prateleiras.');
    const control = analyzeCount(item, type, catalog);
    if (!control.editable) fail('ADVANCED_COMPOSITION', type, control.reason || advancedReason);
    if (!Number.isSafeInteger(value) || value < control.min || (control.max !== undefined && value > control.max)) {
        fail('INVALID_COUNT', type, 'Informe uma quantidade inteira entre ' + control.min + ' e ' + (control.max ?? 'o limite da receita') + '.');
    }
    if (value === control.value) return clone(item);
    const baseline = quickBaseline(item);
    const previousGeneratedName = baseline?.nome || generatedName(item, materials);
    let next = baseline ? clone(item) : promoteToCatalogItem(item);
    const original = control.ci || control.source?.ci;
    const componentId = control.ci?.id;
    if (baseline && value > 0 && !control.source?.removed) {
        next = rebuildQuickItem(item, { [TYPES[type].option]: value, materials: currentMaterials(item, materials) });
        if (item.nome !== baseline.nome) next.nome = item.nome;
    } else if (value === 0 && componentId) {
        const index = item.componentes.findIndex((ci) => ci.id === componentId);
        if (baseline) next = rebuildQuickItem(item, { [TYPES[type].option]: value, materials: currentMaterials(item, materials) });
        else next = removeCatalogComponent(next, componentId);
        saveRemoved(next, type, control.ci, index);
        next.quickControls.order = item.quickControls?.order || item.componentes.map((ci) => ci.id);
    } else if (componentId) {
        next = updateCatalogComponent(next, componentId, control.mode === 'variable' ? { vars: { nPortas: value } } : { qtd: value });
    } else if (control.source?.removed) {
        const restored = clone(original);
        if (control.mode === 'variable') restored.vars = { ...restored.vars, nPortas: value };
        else restored.qtd = value;
        if (restored.compDef?.frente_externa?.ativa && !restored.composition?.matCustom) restored.matExtComp = currentMaterials(item, materials).matFrente;
        next.componentes.splice(Math.min(control.source.removed.index, next.componentes.length), 0, restored);
    } else {
        next = addCatalogComponent(next, control.source.definition, {
            qtd: control.mode === 'variable' ? 1 : value,
            vars: control.mode === 'variable' ? { nPortas: value } : {},
            materials: currentMaterials(item, materials), matCustom: Boolean(ownFront(item)),
        });
    }
    if (next.quick?.counts) next.quick.counts = { ...next.quick.counts, [type]: value };
    if (value > 0) clearRemoved(next, type);
    if (next.quickControls?.order) {
        const order = next.quickControls.order;
        const position = (ci) => order.includes(ci.id) ? order.indexOf(ci.id) : order.length;
        next.componentes.sort((a, b) => position(a) - position(b));
    }
    if (previousGeneratedName) next.nome = item.nome === previousGeneratedName ? generatedName(next, materials) || item.nome : item.nome;
    return check(next);
}

function hardwareId(hardware) {
    if (hasId(hardware?.cod)) return hardware.cod;
    if (!hasId(hardware?.id)) return '';
    return hardware.tipo || hardware.unidade || typeof hardware.id === 'number' ? 'bib_' + hardware.id : hardware.id;
}

function hardwareLibrary(bibItems) {
    return Array.isArray(bibItems) ? bibItems : Array.isArray(bibItems?.raw) ? bibItems.raw : bibItems?.ferragens || [];
}

function handleControls(item, bibItems = [], padroes = {}) {
    const library = hardwareLibrary(bibItems);
    const slots = [];
    for (const ci of item.componentes || []) {
        if (isLoose(ci)) continue;
        for (const slot of getComponentHardware(item, ci.id, library, padroes)) {
            if (slot.group !== 'puxador') continue;
            const base = library.find((hardware) => hardwareId(hardware) === slot.defaultFerrId);
            slots.push({ ...slot, componentId: ci.id, baseUnit: normalizeHardwareUnit(base?.unidade || base?.un || '') });
        }
    }
    const selections = slots.map((slot) => !slot.configuredEnabled ? '__none__' : slot.source === 'override' ? slot.effectiveFerrId : '');
    const unique = [...new Set(selections)];
    const ids = slots.map((slot) => String(slot.componentId) + ':' + String(slot.id));
    const editable = slots.length > 0 && new Set(ids).size === ids.length;
    const units = new Set(slots.map((slot) => slot.baseUnit));
    const unit = units.size === 1 ? [...units][0] : '';
    const options = editable && unit ? library.filter((hardware) => normalized(hardware.categoria) === 'puxador'
        && normalizeHardwareUnit(hardware.unidade || hardware.un || '') === unit
        && hardware.ativo !== 0 && hardware.ativo !== false)
        .map((hardware) => ({ id: hardwareId(hardware), nome: hardware.nome, unit })).filter((entry) => hasId(entry.id)) : [];
    return {
        value: unique.length > 1 ? '__mixed__' : unique[0] || '', mixed: unique.length > 1,
        editable, available: editable, applicable: slots.length > 0, options,
        reason: editable ? '' : 'Escolha ou revise o puxador em Personalizar.', slots,
    };
}

/** choice: vazio herda, __none__ desliga, ID troca somente slots de puxador. */
export function setQuickItemHandle(item, choice, bibItems = []) {
    const controls = handleControls(item, bibItems);
    if (!controls.editable) fail('HANDLE_UNAVAILABLE', 'handle', controls.reason);
    if (choice !== '' && choice !== '__none__' && !controls.options.some((option) => option.id === choice)) {
        fail('HANDLE_UNIT_MISMATCH', 'handle', 'Escolha um puxador com a unidade da receita. Perfis por metro podem ser adicionados em Personalizar.');
    }
    let next = prepare(item);
    for (const slot of controls.slots) {
        const enabled = choice !== '__none__';
        const ferrId = choice === '' || choice === '__none__' ? '' : choice;
        if (isQuick(next)) {
            const ci = next.componentes.find((entry) => entry.id === slot.componentId);
            ci.subItens = { ...ci.subItens, [slot.id]: enabled };
            ci.subItensOvr = { ...ci.subItensOvr };
            if (ferrId) ci.subItensOvr[slot.id] = ferrId;
            else delete ci.subItensOvr[slot.id];
        } else next = setComponentHardware(next, slot.componentId, slot.id, { enabled, ferrId });
    }
    return check(next);
}

function frontControls(item) {
    const fronts = (item.componentes || []).filter((ci) => !isLoose(ci) && ci.compDef?.frente_externa?.ativa);
    if (!fronts.length) return { value: '', effectiveId: '', editable: false, available: false, applicable: false, mixed: false };
    const choices = fronts.map((ci) => ci.composition?.matCustom || ownFront(item) ? ci.matExtComp || '' : '');
    const uniqueChoices = [...new Set(choices)];
    const uniqueMaterials = [...new Set(fronts.map((ci) => ci.matExtComp || ''))];
    const mixed = uniqueChoices.length > 1 || uniqueMaterials.length > 1;
    return {
        value: mixed ? '__mixed__' : uniqueChoices[0] || '',
        effectiveId: uniqueMaterials.length === 1 ? uniqueMaterials[0] : '',
        editable: true, available: true, applicable: true, mixed,
    };
}

/** Troca todas as frentes explicitamente, sem tornar corpo e fundo próprios. */
export function setQuickItemFrontMaterial(item, choice, materials = {}) {
    if (!frontControls(item).editable) fail('FRONT_UNAVAILABLE', 'frontMaterial', 'Adicione uma frente em Personalizar.');
    const matId = choice === '' ? materials.matFrente : choice;
    if (!hasId(matId) || choice === '__mixed__' || choice === '__none__') fail('MISSING_FRONT_MATERIAL', 'frontMaterial', 'Selecione o material das frentes.');
    const next = prepare(item);
    const custom = choice !== '';
    next.composition = { ...next.composition, matFrente: matId, frontCustom: custom };
    const apply = (ci) => {
        if (!isLoose(ci) && ci.compDef?.frente_externa?.ativa) {
            ci.matExtComp = matId;
            ci.composition = { ...ci.composition, matCustom: custom };
        }
    };
    next.componentes.forEach(apply);
    Object.values(next.quickControls?.removed || {}).forEach((entry) => apply(entry.component));
    return check(next);
}

/** Não inclui instâncias nos controles públicos nem depende de preços. */
export function getQuickItemControls(item, catalog = {}, bibItems = [], padroes = {}) {
    const counts = Object.fromEntries(Object.keys(TYPES).map((type) => {
        const { ci, source, mode, ...control } = analyzeCount(item, type, catalog);
        return [type, control];
    }));
    const { slots, ...handle } = handleControls(item, bibItems, padroes);
    return { counts, handle, frontMaterial: frontControls(item) };
}
