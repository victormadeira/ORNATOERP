import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSetup } from '../preview/quick-quote/demoData.js';
import { buildQuickExtra, rebuildQuickItem } from '../src/quickQuote.js';
import { buildQuoteLibrary, calculateQuote } from '../src/quoteCalculator.js';
import {
    createCatalogBoxItem, addCatalogComponent, addLooseHardware, promoteToCatalogItem,
    updateCatalogComponent, updateCatalogItem, duplicateCatalogComponent,
} from '../src/quoteComposition.js';
import { getQuickItemControls, setQuickItemCount, setQuickItemHandle, setQuickItemFrontMaterial } from '../src/quickQuoteActions.js';

const setup = createDemoSetup();
const catalog = { caixas: setup.caixas, componentes: setup.componentes };
const materials = setup.initialDraft.materials;
const definition = (name) => setup.componentes.find((entry) => entry.nome === name);
const preset = (name) => structuredClone(setup.initialDraft.ambientes[0].itens.find((item) => item.quick.presetId === name));
const box = () => createCatalogBoxItem(setup.caixas[0], { l: 800, a: 720, p: 550 }, materials);
const controls = (item, padroes = setup.padroes, bibItems = setup.bibItems) => getQuickItemControls(item, catalog, bibItems, padroes);
const count = (item, type, value) => setQuickItemCount(item, type, value, catalog, materials);
const quote = (item, bibItems = setup.bibItems) => calculateQuote({
    ambientes: [{ id: 'room', tipo: 'calculadora', itens: [item], paineis: [], itensEspeciais: [] }],
    taxas: setup.taxas, bibItems, bib: buildQuoteLibrary(bibItems), padroes: setup.padroes, strictCatalog: true,
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected);
const front = (item) => {
    const result = quote(item);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    return result.itemResults[item.id].pecas.find((piece) => piece.tipo === 'frente_externa');
};

test('lê quantidades por móvel, a herança de frentes e apenas puxadores com a unidade certa', () => {
    const upper = preset('aereo2');
    assert.equal(upper.qtd, 2);
    const read = controls(upper);
    assert.equal(read.counts.doors.value, 2);
    assert.equal(read.counts.shelves.value, 1);
    assert.equal(read.counts.drawers.applicable, false);
    assert.equal(read.handle.value, '');
    assert.equal(read.frontMaterial.value, '');
    assert.equal(read.frontMaterial.effectiveId, materials.matFrente);
    assert.ok(read.handle.options.some((option) => option.id === 'demo_pux160'));
    assert.ok(read.handle.options.every((option) => option.unit === 'un'));
    assert.ok(!read.handle.options.some((option) => option.id === 'demo_perfil_puxador'));
    assert.equal(controls(upper, { puxador: '__none__' }).handle.value, '');
    assert.deepEqual(controls(upper).handle.options, controls(upper, setup.padroes, buildQuoteLibrary(setup.bibItems)).handle.options);
});

test('gaveteiro 3→4 continua rápido e distribui frente, folgas e caixa sem perder escolhas', () => {
    let item = preset('gaveteiro3');
    item.ajuste = { tipo: 'R', valor: 80 };
    item = setQuickItemHandle(item, 'demo_pux160', setup.bibItems);
    item = setQuickItemFrontMaterial(item, 'demo_mdf_grafite18', materials);
    const before = structuredClone(item);
    const next = count(item, 'drawers', 4);
    assert.equal(next.quick.kind, 'module');
    assert.equal(next.quick.counts.drawers, 4);
    assert.equal(next.componentes[0].id, before.componentes[0].id);
    assert.equal(next.componentes[0].compId, before.componentes[0].compId);
    assert.equal(next.componentes[0].subItensOvr.puxador, 'demo_pux160');
    assert.equal(next.composition.frontCustom, true);
    assert.equal(next.componentes[0].composition.matCustom, true);
    assert.equal(next._matCustom, before._matCustom);
    assert.deepEqual(next.caixaDef, before.caixaDef);
    assert.deepEqual(next.ajuste, before.ajuste);
    near(front(next).h, 177.5);
    const taller = rebuildQuickItem(next, { dims: { a: 900 } });
    near(front(taller).h * 4 + 2 * 3 + 4, 900);
    assert.equal(taller.componentes[0].matExtComp, 'demo_mdf_grafite18');
    assert.equal(taller.composition.matFrente, 'demo_mdf_grafite18');
    assert.equal(controls(taller).handle.value, 'demo_pux160');
    assert.equal(controls(taller).frontMaterial.value, 'demo_mdf_grafite18');
    assert.deepEqual(item, before);
    assert.equal(controls(next).counts.drawers.max, 7);
    assert.throws(() => count(next, 'drawers', 8), /quantidade/);
    assert.throws(() => count(next, 'drawers', 0), /quantidade/);
});

test('gaveteiro promovido mantém nUnits automático; alturas autorais pedem Personalizar', () => {
    const promoted = promoteToCatalogItem(preset('gaveteiro3'));
    let next = count(promoted, 'drawers', 4);
    assert.equal(next.composition.mode, 'catalog');
    assert.equal(next.componentes[0].vars.frenteAf, 0);
    assert.deepEqual(next.componentes[0].compDef, promoted.componentes[0].compDef);
    near(front(next).h, 177.5);
    next = updateCatalogItem(next, { dims: { a: 840 } });
    near(front(next).h * 4 + 2 * 3 + 4, 840);
    const manual = updateCatalogComponent(promoted, promoted.componentes[0].id, { vars: { frenteAf: 210, ag: 145 } });
    assert.equal(controls(manual).counts.drawers.value, 3);
    assert.equal(controls(manual).counts.drawers.editable, false);
    assert.throws(() => count(manual, 'drawers', 4), /Personalizar/);
    const handled = setQuickItemHandle(manual, '__none__', setup.bibItems);
    assert.equal(handled.componentes[0].vars.frenteAf, 210);
    assert.equal(handled.componentes[0].vars.ag, 145);
});

test('caixa livre recebe componentes simples do catálogo e conserva avulsos ao editar', () => {
    let item = box();
    assert.equal(controls(item).counts.doors.value, 0);
    assert.equal(controls(item).counts.doors.editable, true);
    item = count(item, 'doors', 3);
    item = count(item, 'shelves', 2);
    item = count(item, 'drawers', 2);
    item = addLooseHardware(item, setup.bibItems.find((entry) => entry.cod === 'demo_led'), { quantity: 1.25 });
    const before = structuredClone(item);
    const next = count(item, 'doors', 4);
    assert.equal(next.componentes[0].vars.nPortas, 4);
    assert.deepEqual(next.componentes.slice(1), before.componentes.slice(1));
    assert.deepEqual(next.caixaDef, before.caixaDef);
    assert.deepEqual(next.mats, before.mats);
    const result = quote(next);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.totNPortas, 4);
    assert.equal(result.totNGavetas, 2);
    assert.equal(result.totNPrateleiras, 2);
    near(result.fa.demo_led.qtd, 1.25);
    assert.deepEqual(item, before);
});

test('contagem também funciona para Porta cuja quantidade vem da instância', () => {
    const recipe = structuredClone(definition('Porta'));
    recipe.vars = recipe.vars.filter((variable) => variable.id !== 'nPortas');
    recipe.varsDeriv.Lp = 'Li/nUnits';
    recipe.sub_itens = [];
    let item = addCatalogComponent(box(), recipe);
    item = count(item, 'doors', 4);
    assert.equal(item.componentes[0].qtd, 4);
    assert.equal(item.componentes[0].vars.nPortas, undefined);
    assert.equal(controls(item).counts.doors.value, 4);
    const face = front(item);
    assert.equal(face.qtd, 4);
    near(face.w * face.qtd, 800 - 36);
});

test('retirar e repor portas/prateleiras preserva IDs, snapshot, material e ferragens', () => {
    let item = preset('balcao2');
    item = setQuickItemFrontMaterial(item, 'demo_mdf_grafite18', materials);
    item = setQuickItemHandle(item, 'demo_pux160', setup.bibItems);
    const originalDoor = structuredClone(item.componentes.find((ci) => ci.quick.role === 'door'));
    const originalShelf = structuredClone(item.componentes.find((ci) => ci.quick.role === 'shelf'));
    item = count(item, 'doors', 0);
    item = count(item, 'shelves', 0);
    assert.equal(item.componentes.length, 0);
    assert.equal(controls(item).counts.doors.editable, true);
    item = JSON.parse(JSON.stringify(item));
    item = rebuildQuickItem(item, { dims: { a: 800 }, materials });
    item = count(item, 'doors', 2);
    item = count(item, 'shelves', 1);
    assert.deepEqual(item.componentes.map((ci) => ci.id), [originalDoor.id, originalShelf.id]);
    assert.deepEqual(item.componentes.find((ci) => ci.quick.role === 'door'), originalDoor);
    assert.deepEqual(item.componentes.find((ci) => ci.quick.role === 'shelf'), originalShelf);
    assert.equal(item.quick.kind, 'module');
    assert.equal(front(item).h, 800);
    let free = promoteToCatalogItem(item);
    const before = structuredClone(free.componentes[0]);
    free = count(free, 'doors', 0);
    free = count(free, 'doors', 2);
    assert.deepEqual(free.componentes[0], before);
});

test('duas portas autorais bloqueiam só portas, sem fundir materiais e medidas próprias', () => {
    let item = addCatalogComponent(box(), definition('Porta'), { vars: { nPortas: 1 }, dimL: 400 });
    item = duplicateCatalogComponent(item, item.componentes[0].id);
    item = updateCatalogComponent(item, item.componentes[1].id, { dimL: 350, matExtComp: 'demo_mdf_grafite18' });
    item = addCatalogComponent(item, definition('Prateleira'));
    const before = structuredClone(item);
    assert.equal(controls(item).counts.doors.value, 2);
    assert.equal(controls(item).counts.doors.editable, false);
    assert.equal(controls(item).counts.shelves.editable, true);
    assert.equal(controls(item).frontMaterial.value, '__mixed__');
    assert.throws(() => count(item, 'doors', 3), /Personalizar/);
    const next = count(item, 'shelves', 3);
    assert.deepEqual(next.componentes.slice(0, 2), before.componentes.slice(0, 2));
    assert.deepEqual(item, before);
});

test('receitas complexas ficam intactas e não são reconstruídas ao editar puxador/frentes', () => {
    const recipe = structuredClone(definition('Porta'));
    recipe.pecas.push({ id: 'moldura', nome: 'Moldura autoral', qtd: 1, calc: 'L*100', mat: 'int', fita: ['all'] });
    let item = addCatalogComponent(box(), recipe);
    assert.equal(controls(item).counts.doors.editable, false);
    const before = structuredClone(item);
    item = setQuickItemHandle(item, 'demo_pux256', setup.bibItems);
    item = setQuickItemFrontMaterial(item, 'demo_mdf_grafite18', materials);
    assert.deepEqual(item.componentes[0].compDef, before.componentes[0].compDef);
    assert.equal(item.componentes[0].id, before.componentes[0].id);
    assert.equal(item.componentes[0].subItensOvr.puxador, 'demo_pux256');
    assert.equal(item.componentes[0].matExtComp, 'demo_mdf_grafite18');
});

test('puxador muda apenas slots categorizados e conserva avulsos, dobradiças e herança', () => {
    let item = addCatalogComponent(box(), definition('Porta'));
    item = addCatalogComponent(item, definition('Gaveta'));
    item = addLooseHardware(item, setup.bibItems.find((entry) => entry.cod === 'demo_perfil_puxador'), { quantity: 0.8 });
    item.componentes[0].subItensOvr.dob110 = 'demo_dob110';
    item.componentes[0].subItensOvr.puxador = 'demo_pux160';
    const before = structuredClone(item);
    assert.equal(controls(item).handle.value, '__mixed__');
    let next = setQuickItemHandle(item, '__none__', setup.bibItems);
    assert.equal(controls(next).handle.value, '__none__');
    assert.deepEqual(next.componentes[2], before.componentes[2]);
    assert.equal(next.componentes[0].subItensOvr.dob110, 'demo_dob110');
    next = setQuickItemHandle(next, 'demo_pux256', setup.bibItems);
    assert.equal(controls(next).handle.value, 'demo_pux256');
    next = setQuickItemHandle(next, '', setup.bibItems);
    assert.equal(controls(next).handle.value, '');
    assert.equal(next.componentes[0].subItensOvr.puxador, undefined);
    assert.equal(next.componentes[0].subItens.puxador, true);
    assert.throws(() => setQuickItemHandle(next, 'demo_perfil_puxador', setup.bibItems), /unidade/);
    assert.throws(() => setQuickItemHandle(next, 'demo_dob110', setup.bibItems), /unidade/);
    assert.deepEqual(item, before);
});

test('slots de puxador com unidades diferentes só oferecem herdar e desativar', () => {
    let item = addCatalogComponent(box(), definition('Porta'));
    const recipe = structuredClone(definition('Gaveta'));
    recipe.sub_itens.find((si) => si.id === 'puxador').ferrId = 'demo_perfil_puxador';
    recipe.sub_itens.find((si) => si.id === 'puxador').qtdFormula = 'Lg/1000';
    item = addCatalogComponent(item, recipe);
    assert.equal(controls(item).handle.editable, true);
    assert.deepEqual(controls(item).handle.options, []);
    assert.throws(() => setQuickItemHandle(item, 'demo_pux128', setup.bibItems), /unidade/);
    assert.equal(controls(setQuickItemHandle(item, '__none__', setup.bibItems)).handle.value, '__none__');
    assert.equal(controls(setQuickItemHandle(item, '', setup.bibItems)).handle.value, '');
});

test('frentes próprias/herdadas se aplicam a todas sem mudar corpo, fundo ou overrides alheios', () => {
    let item = addCatalogComponent(box(), definition('Porta'));
    item = addCatalogComponent(item, definition('Gaveta'));
    item = updateCatalogItem(item, { materials: { matInt: 'demo_mdf_branco15' }, matCustom: true });
    item = updateCatalogComponent(item, item.componentes[0].id, { matExtComp: 'demo_mdf_grafite18' });
    const before = structuredClone(item);
    let next = setQuickItemFrontMaterial(item, 'demo_mdf_branco18', materials);
    assert.equal(next.composition.frontCustom, true);
    assert.equal(next.composition.matFrente, 'demo_mdf_branco18');
    assert.ok(next.componentes.every((ci) => ci.matExtComp === 'demo_mdf_branco18' && ci.composition.matCustom));
    assert.deepEqual(next.mats, before.mats);
    assert.equal(next._matCustom, true);
    next = setQuickItemFrontMaterial(next, '', materials);
    assert.equal(next.composition.frontCustom, false);
    assert.equal(controls(next).frontMaterial.value, '');
    assert.ok(next.componentes.every((ci) => ci.matExtComp === materials.matFrente && !ci.composition.matCustom));
    next = updateCatalogItem(next, { materials: { matFrente: 'demo_mdf_grafite18' } });
    assert.ok(next.componentes.every((ci) => ci.matExtComp === 'demo_mdf_grafite18'));
    assert.deepEqual(next.mats, before.mats);
    assert.deepEqual(item, before);
    assert.throws(() => setQuickItemFrontMaterial(item, '', {}), /material/);
});

test('componentes inseridos em preset não desaparecem e extras não oferecem contagens', () => {
    const quick = preset('balcao2');
    const foreign = addLooseHardware(box(), setup.bibItems.find((entry) => entry.cod === 'demo_led'), { quantity: 2 }).componentes[0];
    quick.componentes.push(structuredClone(foreign));
    const next = count(quick, 'doors', 3);
    assert.equal(next.composition.mode, 'catalog');
    assert.deepEqual(next.componentes.at(-1), foreign);
    const resized = updateCatalogItem(next, { dims: { a: 800 } });
    assert.deepEqual(resized.componentes.at(-1), foreign);
    const extra = buildQuickExtra({ tipo: 'lateral', dims: { l: 550, a: 720 }, matId: materials.matFrente });
    for (const source of [extra, promoteToCatalogItem(extra)]) {
        const read = controls(source);
        assert.ok(Object.values(read.counts).every((entry) => !entry.applicable && !entry.editable));
        assert.equal(read.handle.editable, false);
        assert.equal(read.frontMaterial.editable, false);
        assert.throws(() => count(source, 'doors', 1), /Personalizar/);
    }
});

test('frente própria legada usa _matCustom; herança explícita só da frente prevalece', () => {
    let item = addCatalogComponent(box(), definition('Porta'));
    item = updateCatalogItem(item, { materials: { matInt: 'demo_mdf_branco15', matFrente: 'demo_mdf_grafite18' }, matCustom: true });
    assert.equal(item.componentes[0].composition.matCustom, false);
    assert.equal(item.composition.frontCustom, undefined);
    assert.equal(controls(item).frontMaterial.value, 'demo_mdf_grafite18');
    const inherited = setQuickItemFrontMaterial(item, '', materials);
    assert.equal(inherited._matCustom, true);
    assert.equal(inherited.composition.frontCustom, false);
    assert.equal(inherited.componentes[0].composition.matCustom, false);
    assert.equal(controls(inherited).frontMaterial.value, '');
    assert.equal(controls(inherited).frontMaterial.effectiveId, materials.matFrente);
    assert.equal(inherited.mats.matInt, 'demo_mdf_branco15');
    assert.equal(item.componentes[0].matExtComp, 'demo_mdf_grafite18');
});

test('zerar e repor portas atualiza só títulos automáticos, inclusive após Personalizar', () => {
    for (const promoted of [false, true]) {
        for (const customName of [false, true]) {
            let item = preset('balcao2');
            if (promoted) item = promoteToCatalogItem(item);
            if (customName) item.nome = 'Balcão da máquina de café';
            for (const [quantity, generated] of [[0, 'Balcão'], [1, 'Balcão · 1 porta'], [2, 'Balcão · 2 portas']]) {
                item = count(item, 'doors', quantity);
                assert.equal(item.nome, customName ? 'Balcão da máquina de café' : generated);
                assert.equal(controls(item).counts.doors.value, quantity);
            }
        }
    }
});
