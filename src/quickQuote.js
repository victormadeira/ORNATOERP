/**
 * Presets de orçamento rápido sobre o contrato Caixa + Componentes do ERP.
 * Sem banco, rede, preços próprios ou alteração do catálogo recebido.
 * As receitas são estimativas para orçamento; não liberam peças para produção.
 */

export const QUICK_QUOTE_VERSION = 1;
export const QUICK_DRAWER_DEFAULTS = Object.freeze({
    drawerGap: 2,                 // entre duas frentes consecutivas, em mm
    drawerTopBottomGap: 2,        // em cada extremidade da fachada, em mm
    drawerBoxClearance: 40,       // diferença entre frente e caixa da gaveta, em mm
});

const PRESETS = [
    { id: 'pia2', label: 'Pia · 2 portas · fundo aberto', family: 'Pia', group: 'lower', caixa: 'Caixa Baixa / Balcão', doors: 2, drawers: 0, shelves: 0, defaultDims: { l: 1200, a: 720, p: 550 } },
    { id: 'balcao2', label: 'Balcão · 2 portas', family: 'Balcão', group: 'lower', caixa: 'Caixa Baixa / Balcão', doors: 2, drawers: 0, shelves: 1, defaultDims: { l: 800, a: 720, p: 550 } },
    { id: 'balcao1', label: 'Balcão · 1 porta', family: 'Balcão', group: 'lower', caixa: 'Caixa Baixa / Balcão', doors: 1, drawers: 0, shelves: 1, defaultDims: { l: 600, a: 720, p: 550 } },
    { id: 'gaveteiro3', label: 'Gaveteiro · 3 gavetas', family: 'Gaveteiro', group: 'lower', caixa: 'Caixa Baixa / Balcão', doors: 0, drawers: 3, shelves: 0, defaultDims: { l: 600, a: 720, p: 550 } },
    { id: 'aereo2', label: 'Aéreo · 2 portas', family: 'Aéreo', group: 'upper', caixa: 'Caixa Aérea', doors: 2, drawers: 0, shelves: 1, defaultDims: { l: 1200, a: 700, p: 330 } },
    { id: 'aereo1', label: 'Aéreo · 1 porta', family: 'Aéreo', group: 'upper', caixa: 'Caixa Aérea', doors: 1, drawers: 0, shelves: 1, defaultDims: { l: 600, a: 700, p: 330 } },
    { id: 'nicho', label: 'Nicho aberto', family: 'Nicho aberto', group: 'upper', caixa: 'Caixa Aérea', doors: 0, drawers: 0, shelves: 0, defaultDims: { l: 600, a: 700, p: 330 } },
];
const COMPONENT_NAMES = { door: 'Porta', drawer: 'Gaveta', shelf: 'Prateleira' };
const EXTRA_NAMES = { lateral: 'Tamponamento lateral', rodape: 'Rodapé', fechamento: 'Fechamento superior' };
const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizedName = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hasId = (id) => (typeof id === 'string' && id.trim().length > 0) || (typeof id === 'number' && Number.isFinite(id) && id > 0);
const makeId = () => globalThis.crypto?.randomUUID?.() || `quick-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const issue = (code, field, message) => ({ code, field, message });
const supplied = (value, fallback) => value === undefined ? fallback : value;

export class QuickQuoteValidationError extends Error {
    constructor(errors) {
        super(errors.map((error) => error.message).join(' '));
        this.name = 'QuickQuoteValidationError';
        this.errors = errors;
    }
}

function assertValid(errors) {
    if (errors.length) throw new QuickQuoteValidationError(errors);
}

function numberError(errors, value, field, label, min, max, integer = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        errors.push(issue('INVALID_NUMBER', field, `${label}: informe ${integer ? 'um inteiro' : 'um número'} entre ${min} e ${max}.`));
    }
}

function lookupDefinition(list, name) {
    const matches = (Array.isArray(list) ? list : []).filter((entry) => entry && normalizedName(entry.nome) === normalizedName(name));
    if (matches.length !== 1) return { definition: null, reason: matches.length ? `${name} (nome duplicado no catálogo)` : name };
    if (!hasId(matches[0].db_id)) return { definition: null, reason: `${name} (sem identificação no catálogo)` };
    return { definition: clone(matches[0]), reason: null };
}

/**
 * @param {{caixas: Array, componentes: Array}} catalog Resposta real do catálogo.
 * Presets indisponíveis continuam na lista, com available:false e missing:string[].
 * components é um array de {role:'door'|'drawer'|'shelf', compDef:snapshot}.
 */
export function listQuickPresets(catalog = {}) {
    const { caixas = [], componentes = [] } = catalog || {};
    return PRESETS.map((base) => {
        const box = lookupDefinition(caixas, base.caixa);
        const missing = box.reason ? [box.reason] : [];
        if (box.definition && (!Array.isArray(box.definition.pecas) || !box.definition.pecas.length)) missing.push(`${base.caixa} (sem peças)`);
        const components = [];
        const roles = [base.doors && 'door', base.drawers && 'drawer', !base.drawers && 'shelf'].filter(Boolean);
        for (const role of roles) {
            const found = lookupDefinition(componentes, COMPONENT_NAMES[role]);
            if (found.reason) {
                if (role !== 'shelf' || base.shelves) missing.push(found.reason);
            }
            else {
                if (role !== 'shelf' && (!found.definition.frente_externa?.ativa || !found.definition.frente_externa.calc)) {
                    missing.push(`${COMPONENT_NAMES[role]} (frente externa não configurada)`);
                }
                components.push({ role, compDef: found.definition });
            }
        }
        return {
            ...clone(base), counts: { doors: base.doors, drawers: base.drawers, shelves: base.shelves },
            caixaDef: box.definition, components, available: missing.length === 0, missing,
        };
    });
}

function getCounts(preset, options = {}) {
    return {
        doors: supplied(options.doorCount, preset?.counts?.doors ?? preset?.doors ?? 0),
        drawers: supplied(options.drawerCount, preset?.counts?.drawers ?? preset?.drawers ?? 0),
        shelves: supplied(options.shelfCount, preset?.counts?.shelves ?? preset?.shelves ?? 0),
    };
}

function drawerSettings(options = {}) {
    return Object.fromEntries(Object.entries(QUICK_DRAWER_DEFAULTS).map(([key, fallback]) => [key, supplied(options[key], fallback)]));
}

/** Estrutura de erros: [{code, field, message}]. Não completa campos vazios com zero. */
export function validateQuickInputs(preset, dims, materials, options = {}) {
    const errors = [];
    const base = PRESETS.find((entry) => entry.id === preset?.id);
    if (!base || !preset?.caixaDef) errors.push(issue('MISSING_PRESET', 'preset', 'Selecione uma receita disponível no catálogo.'));
    if (preset?.available === false || preset?.missing?.length) {
        errors.push(issue('MISSING_CATALOG_RECIPE', 'preset', `Complete o catálogo: ${(preset.missing || []).join(', ') || 'receita indisponível'}.`));
    }
    numberError(errors, dims?.l, 'dims.l', 'Largura (mm)', 150, 4000);
    numberError(errors, dims?.a, 'dims.a', 'Altura (mm)', 100, 3000);
    numberError(errors, dims?.p, 'dims.p', 'Profundidade (mm)', 80, 1200);
    numberError(errors, supplied(options.qtd, 1), 'qtd', 'Quantidade de móveis', 1, 100, true);
    const counts = getCounts(preset, options);
    numberError(errors, counts.doors, 'doorCount', 'Portas por móvel', 0, 8, true);
    numberError(errors, counts.drawers, 'drawerCount', 'Gavetas por móvel', 0, 12, true);
    numberError(errors, counts.shelves, 'shelfCount', 'Prateleiras por móvel', 0, 16, true);
    if (counts.doors && counts.drawers) errors.push(issue('MIXED_FRONTS', 'drawerCount', 'Separe portas e gavetas em móveis diferentes nesta receita rápida.'));
    if (counts.drawers && counts.shelves) errors.push(issue('DRAWER_SHELF_CONFLICT', 'shelfCount', 'O gaveteiro ocupa o vão interno; remova as prateleiras.'));
    for (const [key, role] of [['doors', 'door'], ['drawers', 'drawer'], ['shelves', 'shelf']]) {
        if (counts[key] && !preset?.components?.some((entry) => entry.role === role && entry.compDef)) {
            errors.push(issue('MISSING_COMPONENT_RECIPE', `${key}Count`, `A receita não contém ${COMPONENT_NAMES[role]}. Selecione outro tipo de móvel.`));
        }
    }
    if (!hasId(materials?.matInt)) errors.push(issue('MISSING_BODY_MATERIAL', 'materials.matInt', 'Selecione o material do corpo.'));
    if (!hasId(materials?.matFundo) && base?.id !== 'pia2') errors.push(issue('MISSING_BACK_MATERIAL', 'materials.matFundo', 'Selecione o material do fundo.'));
    if ((counts.doors > 0 || counts.drawers > 0) && !hasId(materials?.matFrente)) errors.push(issue('MISSING_FRONT_MATERIAL', 'materials.matFrente', 'Selecione o material das frentes.'));
    if (counts.drawers > 0) {
        const cfg = drawerSettings(options);
        numberError(errors, cfg.drawerGap, 'drawerGap', 'Folga entre frentes (mm)', 0, 20);
        numberError(errors, cfg.drawerTopBottomGap, 'drawerTopBottomGap', 'Folga superior e inferior (mm)', 0, 20);
        numberError(errors, cfg.drawerBoxClearance, 'drawerBoxClearance', 'Diferença entre frente e caixa (mm)', 0, 100);
        const faceHeight = (dims?.a - 2 * cfg.drawerTopBottomGap - (counts.drawers - 1) * cfg.drawerGap) / counts.drawers;
        if (Number.isFinite(faceHeight) && faceHeight < 100) errors.push(issue('DRAWER_FRONT_TOO_SMALL', 'drawerCount', 'Cada frente de gaveta precisa ter pelo menos 100 mm nesta receita.'));
        if (Number.isFinite(faceHeight) && faceHeight - cfg.drawerBoxClearance < 60) errors.push(issue('DRAWER_BOX_TOO_SMALL', 'drawerBoxClearance', 'A caixa de cada gaveta precisa ter pelo menos 60 mm de altura.'));
        if (Number.isFinite(dims?.p) && dims.p < 220) errors.push(issue('DRAWER_DEPTH_TOO_SMALL', 'dims.p', 'O gaveteiro precisa de pelo menos 220 mm de profundidade nesta receita.'));
    }
    return errors;
}

function presetLabel(preset, counts) {
    const parts = [preset.family];
    if (counts.doors) parts.push(`${counts.doors} ${counts.doors === 1 ? 'porta' : 'portas'}`);
    if (counts.drawers) parts.push(`${counts.drawers} ${counts.drawers === 1 ? 'gaveta' : 'gavetas'}`);
    if (preset.id === 'pia2') parts.push('fundo aberto');
    return parts.join(' · ');
}

function boxSnapshot(preset) {
    const box = clone(preset.caixaDef);
    // Tamponamentos pertencem ao ambiente, independentemente de materiais herdados.
    box.tamponamentos = [];
    if (preset.id === 'pia2') {
        box.nome = 'Balcão de pia · fundo aberto · duas travessas';
        box.pecas = (box.pecas || []).filter((piece) => {
            const id = normalizedName(piece.id);
            const name = normalizedName(piece.nome);
            return !['tp', 'topo', 'tampo', 'fn', 'fundo', 'quicktravessasuperior'].includes(id)
                && !['topo', 'tampo', 'fundo'].includes(name)
                && piece.mat !== 'fundo';
        });
        box.pecas.push({ id: 'quick_travessa_superior', nome: 'Travessa superior · 100 mm', qtd: 2, calc: 'Li*100', mat: 'int', fita: ['f'] });
    }
    return box;
}

function componentSnapshot(entry, role, dims, counts, materials, options, idFactory) {
    const compDef = clone(entry.compDef);
    const vars = Object.fromEntries((compDef.vars || []).filter((v) => v.default !== undefined).map((v) => [v.id, v.default]));
    let qtd = 1;
    if (role === 'door') vars.nPortas = counts.doors;
    if (role === 'shelf') qtd = counts.shelves;
    if (role === 'drawer') {
        const cfg = drawerSettings(options);
        qtd = counts.drawers;
        vars.frenteAf = (dims.a - 2 * cfg.drawerTopBottomGap - (qtd - 1) * cfg.drawerGap) / qtd;
        vars.ag = vars.frenteAf - cfg.drawerBoxClearance;
        compDef.vars = (compDef.vars || []).filter((v) => v.id !== 'frenteAf');
        compDef.vars.push({ id: 'frenteAf', label: 'Altura da frente', default: vars.frenteAf, min: 100, max: 3000, unit: 'mm' });
        compDef.frente_externa = { ...compDef.frente_externa, calc: 'Lg*frenteAf', qtdFormula: '1' };
    }
    return {
        id: options.componentIds?.[role] || idFactory(), compId: compDef.db_id, compDef, qtd, vars,
        matExtComp: compDef.frente_externa?.ativa ? materials.matFrente : '',
        subItens: Object.fromEntries((compDef.sub_itens || []).map((entry) => [entry.id, Boolean(entry.defaultOn)])),
        subItensOvr: {}, quick: { role },
    };
}

/**
 * materials = {matInt, matFrente, matFundo}, todos IDs da biblioteca do ERP.
 * options aceita qtd, id/existingId, idFactory, ordem, doorCount, drawerCount,
 * shelfCount e as três folgas exportadas em QUICK_DRAWER_DEFAULTS.
 * Falhas lançam QuickQuoteValidationError, sem devolver um item parcial.
 */
export function buildQuickItem(preset, dims, materials, options = {}) {
    assertValid(validateQuickInputs(preset, dims, materials, options));
    const counts = getCounts(preset, options);
    const idFactory = options.idFactory || makeId;
    const components = [];
    for (const [role, count] of [['door', counts.doors], ['drawer', counts.drawers], ['shelf', counts.shelves]]) {
        if (!count) continue;
        components.push(componentSnapshot(preset.components.find((entry) => entry.role === role), role, dims, counts, materials, options, idFactory));
    }
    return {
        id: options.id ?? options.existingId ?? idFactory(), caixaId: preset.caixaDef.db_id,
        caixaDef: boxSnapshot(preset), nome: presetLabel(preset, counts),
        dims: { l: dims.l, a: dims.a, p: dims.p }, qtd: supplied(options.qtd, 1),
        mats: { matInt: materials.matInt, matExt: '', matFundo: materials.matFundo || '' },
        componentes: components, grupo_id: options.grupo_id || '', ordem: options.ordem ?? 0,
        quick: {
            version: QUICK_QUOTE_VERSION, kind: 'module', presetId: preset.id, group: preset.group,
            recipe: preset.id === 'pia2' ? 'pia-fundo-aberto-duas-travessas' : preset.id,
            counts, ...drawerSettings(options),
            // Conserva receitas mesmo se o usuário remover e depois repor prateleiras.
            componentTemplates: clone(preset.components),
        },
    };
}

export function validateQuickExtraInputs({ tipo, dims, qtd = 1, matId } = {}) {
    const errors = [];
    if (!EXTRA_NAMES[tipo]) errors.push(issue('INVALID_EXTRA', 'tipo', 'Selecione um complemento válido.'));
    numberError(errors, dims?.l, 'dims.l', 'Comprimento do complemento (mm)', 1, 10000);
    numberError(errors, dims?.a, 'dims.a', 'Segunda medida do complemento (mm)', 1, 3000);
    numberError(errors, qtd, 'qtd', 'Quantidade de complementos', 1, 100, true);
    if (!hasId(matId)) errors.push(issue('MISSING_EXTRA_MATERIAL', 'matId', 'Selecione o material do complemento.'));
    return errors;
}

/** Complemento plano independente, sem assumir espessura, preço ou ferragens. */
export function buildQuickExtra(options = {}) {
    assertValid(validateQuickExtraInputs(options));
    const { tipo, dims, matId, qtd = 1, ordem = 0 } = options;
    const nome = EXTRA_NAMES[tipo];
    return {
        id: options.id ?? options.existingId ?? (options.idFactory || makeId)(), caixaId: null,
        nome, qtd, dims: { l: dims.l, a: dims.a, p: 0 },
        caixaDef: { nome, cat: 'complemento', coef: 0, dimsAplicaveis: ['L', 'A'], pecas: [{ id: 'quick_painel', nome, qtd: 1, calc: 'L*A', mat: 'int', fita: ['all'] }], tamponamentos: [], sub_itens: [] },
        mats: { matInt: matId, matExt: '', matFundo: '' }, _matCustom: true,
        componentes: [], grupo_id: options.grupo_id || '', ordem,
        quick: { version: QUICK_QUOTE_VERSION, kind: 'extra', group: 'extras', extraType: tipo },
    };
}

function presetFromItem(item) {
    const base = PRESETS.find((entry) => entry.id === item?.quick?.presetId);
    if (!base) return null;
    const templates = clone(item.quick.componentTemplates || (item.componentes || []).map((ci) => ({ role: ci.quick?.role || Object.keys(COMPONENT_NAMES).find((role) => normalizedName(COMPONENT_NAMES[role]) === normalizedName(ci.compDef?.nome)), compDef: ci.compDef })));
    for (const template of templates) {
        const current = item.componentes?.find((ci) => ci.quick?.role === template.role);
        if (current?.compDef) template.compDef = clone(current.compDef);
    }
    return { ...clone(base), counts: item.quick.counts || { doors: base.doors, drawers: base.drawers, shelves: base.shelves }, caixaDef: item.caixaDef, components: clone(templates), available: true, missing: [] };
}

/** Reaplica dimensões/quantidades e materiais sem trocar snapshots por catálogo novo. */
export function rebuildQuickItem(item, updates = {}) {
    if (item?.quick?.kind === 'extra') {
        const next = buildQuickExtra({
            tipo: item.quick.extraType, dims: { ...item.dims, ...updates.dims }, qtd: supplied(updates.qtd, item.qtd),
            matId: supplied(updates.matId, supplied(updates.materials?.matInt, item.mats?.matInt)),
            id: item.id, ordem: item.ordem, grupo_id: item.grupo_id,
        });
        // A receita e os ajustes podem ter sido revisados no editor completo.
        // Editar medidas ou quantidade conserva esse snapshot, sem recriá-lo.
        return {
            ...clone(item), dims: next.dims, qtd: next.qtd,
            mats: { ...clone(item.mats || {}), matInt: next.mats.matInt }, _matCustom: true,
        };
    }
    const preset = presetFromItem(item);
    if (!preset) throw new QuickQuoteValidationError([issue('NOT_QUICK_ITEM', 'item', 'Este móvel deve ser alterado no editor completo.')]);
    const materials = {
        matInt: item.mats?.matInt || '', matFundo: item.mats?.matFundo || '',
        matFrente: item.componentes?.find((ci) => ci.compDef?.frente_externa?.ativa)?.matExtComp || '',
        ...updates.materials,
    };
    const options = { ...item.quick, ...updates, id: item.id, qtd: supplied(updates.qtd, item.qtd), ordem: item.ordem, grupo_id: item.grupo_id };
    const next = buildQuickItem(preset, { ...item.dims, ...updates.dims }, materials, options);
    next.componentes = next.componentes.map((ci) => {
        const previous = (item.componentes || []).find((candidate) => candidate.quick?.role === ci.quick.role);
        return previous ? { ...previous, ...ci, id: previous.id, subItens: { ...ci.subItens, ...previous.subItens }, subItensOvr: { ...previous.subItensOvr } } : ci;
    });
    return { ...item, ...next };
}

export function validateQuickItem(item) {
    if (item?.quick?.kind === 'extra') return validateQuickExtraInputs({ tipo: item.quick.extraType, dims: item.dims, qtd: item.qtd, matId: item.mats?.matInt });
    const preset = presetFromItem(item);
    if (!preset) return [issue('NOT_QUICK_ITEM', 'item', 'Móvel sem receita de orçamento rápido.')];
    const errors = validateQuickInputs(preset, item.dims, {
        matInt: item.mats?.matInt, matFundo: item.mats?.matFundo,
        matFrente: item.componentes?.find((ci) => ci.compDef?.frente_externa?.ativa)?.matExtComp,
    }, { ...item.quick, qtd: item.qtd });
    for (const ci of item.componentes || []) {
        if (ci.compDef?.frente_externa?.ativa && !hasId(ci.matExtComp)) errors.push(issue('MISSING_FRONT_MATERIAL', 'componentes.matExtComp', 'Toda frente ativa precisa de material definido.'));
    }
    return errors;
}

/** Cinco linhas, seis móveis: 3.000 mm inferiores e 3.000 mm aéreos. Sem preços. */
export function createQuickKitchenExample(catalog, materials, options = {}) {
    const presets = listQuickPresets(catalog);
    const idFactory = options.idFactory || makeId;
    const rows = [
        ['pia2', 1200, 720, 550, 1], ['gaveteiro3', 600, 720, 550, 1],
        ['balcao2', 1200, 720, 550, 1], ['aereo2', 1200, 700, 330, 2], ['aereo1', 600, 700, 330, 1],
    ];
    return {
        id: options.id || idFactory(), nome: options.nome || 'Cozinha', tipo: 'calculadora',
        matInt: materials?.matInt || '', matExt: '',
        itens: rows.map(([presetId, l, a, p, qtd], index) => buildQuickItem(presets.find((preset) => preset.id === presetId), { l, a, p }, materials, { ...drawerSettings(options), qtd, idFactory, ordem: index })),
        paineis: [], itensEspeciais: [], grupos: [], descricao: '', quick: { version: QUICK_QUOTE_VERSION },
    };
}
