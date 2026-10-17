import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSetup } from '../preview/quick-quote/demoData.js';
import { buildQuoteLibrary, calculateQuote } from '../src/quoteCalculator.js';
import { buildQuickExtra, rebuildQuickItem } from '../src/quickQuote.js';
import {
    CompositionValidationError, createCatalogBoxItem, promoteToCatalogItem,
    updateCatalogItem, duplicateCatalogItem, addCatalogComponent,
    updateCatalogComponent, removeCatalogComponent, duplicateCatalogComponent,
    addLooseHardware, updateLooseHardware, removeLooseHardware,
    setComponentHardware, getComponentHardware, setBoxPartEnabled, getBoxParts,
    validateCompositionItem,
} from '../src/quoteComposition.js';

const data = () => createDemoSetup();
const materials = () => data().initialDraft.materials;
const definition = (name) => data().componentes.find((entry) => entry.nome === name);
const box = () => createCatalogBoxItem(data().caixas[0], { l: 800, a: 720, p: 550 }, materials());
const withDoor = () => addCatalogComponent(box(), definition('Porta'));
const quote = (item, setup = data()) => calculateQuote({
    ambientes: [{ id: 'room', tipo: 'calculadora', itens: [item], paineis: [], itensEspeciais: [] }],
    taxas: setup.taxas, bibItems: setup.bibItems, bib: buildQuoteLibrary(setup.bibItems), padroes: setup.padroes, strictCatalog: true,
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('caixa de qualquer nome usa a receita e medidas próprias, sem limites dos presets', () => {
    const recipe = { ...data().caixas[0], db_id: 990100, nome: 'Caixa horizontal especial' };
    recipe.tamponamentos = [{ id: 'ext', nome: 'Acabamento externo', calc: 'A*P', mat: 'ext', qtd: 1, fita: ['all'] }];
    const original = structuredClone(recipe);
    const item = createCatalogBoxItem(recipe, { l: 120, a: 80, p: 50 }, materials());
    assert.deepEqual(item.caixaDef, original);
    assert.equal(item.caixaId, 990100);
    assert.equal(item.composition.mode, 'catalog');
    assert.equal(item.quick?.kind, undefined);
    assert.deepEqual(item.componentes, []);
    assert.equal(quote(item).valid, true);
    assert.ok(!quote(item).itemResults[item.id].pecas.some((piece) => piece.tipo === 'tamponamento'));
    item.caixaDef.pecas[0].nome = 'revisado';
    assert.deepEqual(recipe, original);
});

test('Porta do catálogo aceita Ap zero automático, defaults e reavalia altura ao redimensionar', () => {
    const item = withDoor();
    const ci = item.componentes[0];
    assert.equal(ci.vars.Ap, 0);
    assert.equal(ci.vars.nPortas, 2);
    assert.equal(ci.matExtComp, materials().matFrente);
    assert.equal(ci.composition.matCustom, false);
    const initial = quote(item);
    assert.equal(initial.valid, true, JSON.stringify(initial.errors));
    const resized = updateCatalogItem(item, { dims: { a: 900 } });
    const result = quote(resized);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    const front = result.itemResults[item.id].pecas.find((piece) => piece.tipo === 'frente_externa');
    assert.equal(front.qtd, 2);
    near(front.area, (800 - 36) * 900 / 1e6);
    assert.deepEqual(resized.componentes[0].compDef, ci.compDef);
    assert.deepEqual(resized.componentes[0].vars, ci.vars);
});

test('uma caixa livre aceita componentes diversos e quantidades independentes', () => {
    let item = withDoor();
    item = addCatalogComponent(item, definition('Gaveta'), { qtd: 2, vars: { ag: 120 } });
    item = addCatalogComponent(item, definition('Prateleira'), { qtd: 3 });
    const result = quote(item);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.totNPortas, 2);
    assert.equal(result.totNGavetas, 2);
    assert.equal(result.totNPrateleiras, 3);
    assert.equal(item.componentes.length, 3);
    const arbitrary = { ...definition('Prateleira'), db_id: 999111, nome: 'Divisória especial do catálogo' };
    item = addCatalogComponent(item, arbitrary, { qtd: 2, dimL: 400, matIntInst: 'demo_mdf_branco15' });
    assert.equal(item.componentes.at(-1).compId, 999111);
    assert.equal(item.componentes.at(-1).dimL, 400);
    assert.equal(item.componentes.at(-1).matIntInst, 'demo_mdf_branco15');
    assert.equal(quote(item).valid, true);
});

test('promoção de preset conserva todos os snapshots, IDs e ajuste comercial', () => {
    const item = data().initialDraft.ambientes[0].itens[0];
    item.ajuste = { tipo: 'R', valor: 50 };
    item.componentes[0].subItensOvr.puxador = 'demo_pux128';
    const before = structuredClone(item);
    const promoted = promoteToCatalogItem(item);
    assert.equal(promoted.composition.mode, 'catalog');
    assert.equal(promoted.composition.group, 'lower');
    assert.equal(promoted.quick.kind, undefined);
    assert.deepEqual(promoted.caixaDef, before.caixaDef);
    assert.deepEqual(promoted.componentes, before.componentes);
    assert.deepEqual(promoted.ajuste, before.ajuste);
    assert.equal(promoted.id, before.id);
    assert.deepEqual(item, before);
    const edited = updateCatalogItem(promoted, { dims: { l: 1400 }, qtd: 2 });
    assert.deepEqual(edited.caixaDef, before.caixaDef);
    assert.deepEqual(edited.componentes, before.componentes);
    near(quote(edited).totalAjustes, 50);
});

test('promoção de complemento conserva ausência de caixas e material próprio', () => {
    const extra = buildQuickExtra({ tipo: 'lateral', dims: { l: 550, a: 720 }, matId: materials().matFrente });
    const promoted = promoteToCatalogItem(extra);
    assert.equal(promoted.composition.kind, 'extra');
    assert.equal(promoted.composition.group, 'extras');
    assert.equal(promoted._matCustom, true);
    assert.deepEqual(promoted.caixaDef, extra.caixaDef);
    const before = quote(extra), after = quote(promoted);
    assert.equal(after.valid, true, JSON.stringify(after.errors));
    near(after.cm, before.cm);
    assert.equal(after.totNModulos, 0);
    assert.equal(after.totNCaixas, 0);
});

test('edição e duplicação de componentes preservam receita e trocam somente instâncias', () => {
    const original = withDoor();
    const id = original.componentes[0].id;
    let item = updateCatalogComponent(original, id, { vars: { nPortas: 3, Ap: 680 }, qtd: 2, dimL: 1000, dimP: 450 });
    assert.deepEqual(item.componentes[0].compDef, original.componentes[0].compDef);
    assert.equal(item.componentes[0].vars.nPortas, 3);
    item = updateCatalogComponent(item, id, { vars: { Ap: null } });
    assert.equal(item.componentes[0].vars.Ap, undefined);
    assert.equal(quote(item).valid, true);
    item = duplicateCatalogComponent(item, id, { id: 'component-copy' });
    assert.equal(item.componentes.length, 2);
    assert.deepEqual({ ...item.componentes[1], id }, item.componentes[0]);
    item = removeCatalogComponent(item, id);
    assert.equal(item.componentes[0].id, 'component-copy');
    assert.equal(original.componentes[0].vars.nPortas, 2);
});

test('duplicar móvel cria IDs novos sem compartilhar ajustes ou receitas', () => {
    const item = withDoor();
    item.ajuste = { tipo: '%', valor: 5 };
    let sequence = 0;
    const copy = duplicateCatalogItem(item, { idFactory: () => `copy-${++sequence}`, ordem: 4 });
    assert.equal(copy.id, 'copy-1');
    assert.equal(copy.componentes[0].id, 'copy-2');
    assert.equal(copy.ordem, 4);
    assert.deepEqual(copy.caixaDef, item.caixaDef);
    copy.caixaDef.pecas[0].fita.push('all');
    copy.ajuste.valor = 20;
    assert.equal(item.ajuste.valor, 5);
    assert.notDeepEqual(copy.caixaDef.pecas[0].fita, item.caixaDef.pecas[0].fita);
});

test('troca global de materiais respeita frente própria e conserva snapshots', () => {
    let item = addCatalogComponent(withDoor(), definition('Porta'));
    item = updateCatalogComponent(item, item.componentes[0].id, { matExtComp: 'demo_mdf_grafite18' });
    const original = structuredClone(item);
    const updated = updateCatalogItem(item, { materials: { ...materials(), matInt: 'demo_mdf_branco15', matFrente: 'demo_mdf_branco18' } });
    assert.equal(updated.mats.matInt, 'demo_mdf_branco15');
    assert.equal(updated.composition.matFrente, 'demo_mdf_branco18');
    assert.equal(updated.componentes[0].matExtComp, 'demo_mdf_grafite18');
    assert.equal(updated.componentes[1].matExtComp, 'demo_mdf_branco18');
    assert.deepEqual(updated.caixaDef, original.caixaDef);
    assert.deepEqual(updated.componentes.map((ci) => ci.compDef), original.componentes.map((ci) => ci.compDef));
    const local = updateCatalogItem(updated, { materials: { matInt: 'demo_mdf_grafite18' }, matCustom: true });
    assert.equal(local._matCustom, true);
    const inherited = updateCatalogItem(local, { materials: materials(), matCustom: false });
    assert.equal(inherited._matCustom, false);
    assert.equal(inherited.componentes[0].matExtComp, 'demo_mdf_grafite18');
});

test('puxador herda padrão, pode ser substituído e desligado explicitamente', () => {
    const setup = data();
    const secondHandle = { id: 939999, cod: 'handle-other', tipo: 'ferragem', nome: 'Puxador alternativo de teste', categoria: 'puxador', unidade: 'un', preco: 22 };
    setup.bibItems.push(secondHandle);
    let item = withDoor();
    const id = item.componentes[0].id;
    const state = (patterns) => getComponentHardware(item, id, setup.bibItems, patterns).find((row) => row.id === 'puxador');
    assert.equal(state({ puxador: 'handle-other' }).source, 'global');
    assert.equal(state({ puxador: 'handle-other' }).effectiveFerrId, 'handle-other');
    item = setComponentHardware(item, id, 'puxador', { ferrId: 'demo_pux128', enabled: true });
    assert.equal(state({ puxador: '__none__' }).source, 'override');
    assert.equal(state({ puxador: '__none__' }).enabled, true);
    item = setComponentHardware(item, id, 'puxador', { enabled: false });
    assert.equal(state({ puxador: 'handle-other' }).enabled, false);
    item = setComponentHardware(item, id, 'puxador', { ferrId: '', enabled: true });
    assert.equal(state({ puxador: '__none__' }).enabled, false);
    assert.equal(state({ puxador: '__none__' }).source, 'global');
    assert.equal(item.componentes[0].subItensOvr.puxador, undefined);
});

test('ferragem avulsa cobra quantidade na unidade real e conserva a escolha explícita', () => {
    const setup = data();
    const meter = { id: 939998, cod: 'test-profile-meter', tipo: 'ferragem', nome: 'Perfil de teste', categoria: 'puxador', unidade: 'm', preco: 30 };
    setup.bibItems.push(meter);
    let item = addLooseHardware(box(), meter, { quantity: 1.5 });
    const ci = item.componentes.at(-1);
    assert.equal(ci.qtd, 1);
    assert.equal(ci.composition.unit, 'm');
    assert.equal(ci.composition.hardwareId, 'test-profile-meter');
    assert.equal(ci.subItensOvr.loose, 'test-profile-meter');
    assert.ok(!JSON.stringify(ci).includes('preco'));
    let result = quote(item, setup);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    near(result.fa['test-profile-meter'].qtd, 1.5);
    near(result.totFerragens, 45);
    item = updateLooseHardware(item, ci.id, { quantity: 2.25 });
    result = quote(item, setup);
    near(result.fa['test-profile-meter'].qtd, 2.25);
    near(result.totFerragens, 67.5);
    item = removeLooseHardware(item, ci.id);
    assert.equal(item.componentes.length, 0);
    const pair = setup.bibItems.find((h) => h.cod === 'demo_corr500');
    assert.throws(() => addLooseHardware(box(), pair, { quantity: 1.5 }), CompositionValidationError);
    const perUnit = setup.bibItems.find((h) => h.cod === 'demo_pux128');
    assert.throws(() => addLooseHardware(box(), perUnit, { quantity: 0.5 }), CompositionValidationError);
});

test('desativar e reativar partes conserva receita, ordem e estado ao redimensionar', () => {
    const original = box();
    let item = setBoxPartEnabled(original, 'tp', false);
    item = setBoxPartEnabled(item, 'fn', false);
    assert.equal(getBoxParts(item).filter((part) => !part.enabled).length, 2);
    assert.equal(item.caixaDef.pecas.some((part) => part.id === 'fn'), false);
    const disabled = structuredClone(item.composition.disabledBoxParts);
    item = updateCatalogItem(item, { dims: { l: 950 }, materials: { matInt: 'demo_mdf_branco15' } });
    assert.deepEqual(item.composition.disabledBoxParts, disabled);
    item = setBoxPartEnabled(item, 'fn', true);
    item = setBoxPartEnabled(item, 'tp', true);
    assert.deepEqual(item.caixaDef, original.caixaDef);
    assert.equal(item.composition.disabledBoxParts.length, 0);
    assert.equal(original.caixaDef.pecas.length, 5);
});

test('entradas inválidas não apagam componentes nem produzem materiais implícitos', () => {
    const item = withDoor();
    const before = structuredClone(item);
    assert.throws(() => updateCatalogItem(item, { dims: { l: 0 } }), CompositionValidationError);
    assert.throws(() => updateCatalogItem(item, { qtd: 1.5 }), CompositionValidationError);
    assert.throws(() => updateCatalogItem(item, { materials: { matFundo: '' } }), CompositionValidationError);
    assert.throws(() => updateCatalogComponent(item, item.componentes[0].id, { vars: { nPortas: 1.5 } }), CompositionValidationError);
    assert.throws(() => updateCatalogComponent(item, item.componentes[0].id, { matExtComp: '' }), CompositionValidationError);
    assert.deepEqual(validateCompositionItem(item), []);
    assert.deepEqual(item, before);
});

const quickDrawer = () => data().initialDraft.ambientes[0].itens.find((item) => item.quick?.presetId === 'gaveteiro3');
const frontGeometry = (item) => {
    const result = quote(item);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    return result.itemResults[item.id].pecas.find((piece) => piece.tipo === 'frente_externa');
};

test('gavetas do preset redistribuem frentes ao mudar quantidade, altura e após serialização', () => {
    const original = quickDrawer();
    const before = structuredClone(original);
    const promoted = promoteToCatalogItem(original);
    const ci = promoted.componentes[0];
    assert.equal(ci.vars.frenteAf, 0);
    assert.equal(ci.vars.ag, 0);
    assert.equal(ci.composition.drawerLayout.source, 'quick-preset');
    assert.match(ci.compDef.varsDeriv.frenteAf, /nUnits/);
    assert.deepEqual(original, before);
    assert.deepEqual(ci.compDef.pecas, before.componentes[0].compDef.pecas);
    assert.deepEqual(ci.compDef.frente_externa, before.componentes[0].compDef.frente_externa);
    const four = updateCatalogComponent(promoted, ci.id, { qtd: 4 });
    let front = frontGeometry(four);
    near(front.h, 177.5);
    near(front.h * front.qtd + 2 * (front.qtd - 1) + 4, 720);
    const taller = updateCatalogItem(promoted, { dims: { a: 900 } });
    front = frontGeometry(taller);
    near(front.h, 297.3333333333333);
    near(front.h * front.qtd + 2 * (front.qtd - 1) + 4, 900);
    // O editor Novo pode alterar a instância diretamente: a fórmula salva
    // continua válida sem depender dos setters deste módulo.
    const restored = JSON.parse(JSON.stringify(promoted));
    restored.componentes[0].qtd = 4;
    restored.dims.a = 900;
    front = frontGeometry(restored);
    near(front.h * front.qtd + 2 * (front.qtd - 1) + 4, 900);
});

test('distribuição usa as folgas salvas e a altura própria do componente', () => {
    const item = rebuildQuickItem(quickDrawer(), { drawerGap: 6, drawerTopBottomGap: 4, drawerBoxClearance: 55 });
    const promoted = promoteToCatalogItem(item);
    const ci = promoted.componentes[0];
    let changed = updateCatalogComponent(promoted, ci.id, { qtd: 4 });
    let front = frontGeometry(changed);
    near(front.h, 173.5);
    near(front.h * 4 + 6 * 3 + 2 * 4, 720);
    changed = updateCatalogComponent(changed, ci.id, { dimA: 840 });
    front = frontGeometry(changed);
    near(front.h * 4 + 6 * 3 + 2 * 4, 840);
    const result = quote(changed).itemResults[changed.id];
    const side = result.pecas.find((piece) => piece.tipo === 'componente' && piece.nome.includes('Lateral'));
    near(side.h, front.h - 55);
});

test('alturas manuais anteriores ou posteriores à promoção não são substituídas', () => {
    const item = quickDrawer();
    item.componentes[0].vars.frenteAf = 210;
    item.componentes[0].vars.ag = 145;
    let promoted = promoteToCatalogItem(item);
    const ci = promoted.componentes[0];
    assert.equal(ci.vars.frenteAf, 210);
    assert.equal(ci.vars.ag, 145);
    promoted = updateCatalogComponent(promoted, ci.id, { qtd: 4 });
    promoted = updateCatalogItem(promoted, { dims: { a: 900 } });
    near(frontGeometry(promoted).h, 210);
    assert.equal(promoted.componentes[0].vars.ag, 145);
    let changed = promoteToCatalogItem(quickDrawer());
    const changedId = changed.componentes[0].id;
    changed = updateCatalogComponent(changed, changedId, { vars: { frenteAf: 220, ag: 160 } });
    changed = updateCatalogItem(changed, { dims: { a: 900 } });
    near(frontGeometry(changed).h, 220);
    assert.equal(changed.componentes[0].vars.ag, 160);
    changed = updateCatalogComponent(changed, changedId, { vars: { frenteAf: 0, ag: 0 } });
    near(frontGeometry(changed).h, 297.3333333333333);
});

test('receitas arbitrárias e fórmulas já revisadas não recebem distribuição de preset', () => {
    const arbitrary = addCatalogComponent(box(), definition('Gaveta'), { qtd: 3 });
    const arbitraryBefore = structuredClone(arbitrary.componentes[0]);
    const changed = updateCatalogComponent(arbitrary, arbitraryBefore.id, { qtd: 4 });
    assert.deepEqual(changed.componentes[0].compDef, arbitraryBefore.compDef);
    assert.deepEqual(changed.componentes[0].vars, arbitraryBefore.vars);
    assert.equal(changed.componentes[0].composition.drawerLayout, undefined);
    const custom = quickDrawer();
    custom.componentes[0].compDef.varsDeriv.frenteAf = 'A/4';
    const customBefore = structuredClone(custom.componentes[0]);
    const promoted = promoteToCatalogItem(custom);
    assert.deepEqual(promoted.componentes[0], customBefore);
    const otherShape = quickDrawer();
    otherShape.componentes[0].compDef.frente_externa.calc = 'Lg*(frenteAf-5)';
    assert.deepEqual(promoteToCatalogItem(otherShape).componentes, otherShape.componentes);
});

test('distribuição automática rejeita frentes e caixas de gaveta pequenas demais', () => {
    const item = promoteToCatalogItem(quickDrawer());
    const ciId = item.componentes[0].id;
    const predicate = (code) => (error) => error instanceof CompositionValidationError && error.errors.some((entry) => entry.code === code);
    assert.throws(() => updateCatalogComponent(item, ciId, { qtd: 8 }), predicate('AUTO_DRAWER_FRONT_TOO_SMALL'));
    assert.throws(() => updateCatalogItem(item, { dims: { a: 250 } }), predicate('AUTO_DRAWER_BOX_TOO_SMALL'));
    const corrupted = structuredClone(item);
    corrupted.componentes[0].qtd = 8;
    assert.ok(validateCompositionItem(corrupted).some((entry) => entry.code === 'AUTO_DRAWER_FRONT_TOO_SMALL'));
    assert.equal(quote(corrupted).valid, false);
    assert.equal(quote(updateCatalogComponent(item, ciId, { qtd: 7 })).valid, true);
    const clearance = promoteToCatalogItem(rebuildQuickItem(quickDrawer(), { drawerBoxClearance: 80 }));
    assert.throws(() => updateCatalogComponent(clearance, clearance.componentes[0].id, { qtd: 6 }), predicate('AUTO_DRAWER_BOX_TOO_SMALL'));
    assert.equal(item.componentes[0].qtd, 3);
});
