import test from 'node:test';
import assert from 'node:assert/strict';
import { calcItemV2, calcCustoHora, calcPainelRipado } from '../src/engine.js';
import { calculateQuote, buildQuoteLibrary, resolveItemMats, applyQuoteDiscount } from '../src/quoteCalculator.js';
import { createDemoSetup } from '../preview/quick-quote/demoData.js';
import { createCatalogBoxItem, addCatalogComponent, addLooseHardware, promoteToCatalogItem, getComponentHardware, getBoxParts, setBoxPartEnabled, setComponentHardware } from '../src/quoteComposition.js';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const clone = value => structuredClone(value);
const rawLibrary = [
    { id: 1, cod: 'body', tipo: 'material', unidade: 'chapa', nome: 'Corpo 18', espessura: 18, largura: 2750, altura: 1850, preco: 300, perda_pct: 15, fita_preco: 1.2 },
    { id: 2, cod: 'front', tipo: 'material', unidade: 'chapa', nome: 'Frente 18', espessura: 18, largura: 2750, altura: 1850, preco: 500, perda_pct: 15, fita_preco: 2.4 },
    { id: 3, cod: 'back', tipo: 'material', unidade: 'chapa', nome: 'Fundo 6', espessura: 6, largura: 2750, altura: 1850, preco: 120, perda_pct: 10 },
    { id: 4, cod: 'hinge', tipo: 'ferragem', unidade: 'un', nome: 'Dobradiça', categoria: 'dobradiça', preco: 18 },
    { id: 5, cod: 'support', tipo: 'ferragem', unidade: 'un', nome: 'Suporte', categoria: '', preco: 1.5 },
    { id: 6, cod: 'edge', tipo: 'material', unidade: 'm', nome: 'Fita', preco: 1.2 },
    { id: 7, cod: 'included', tipo: 'acabamento', unidade: 'incluso', nome: 'BP incluso', preco: 0 },
    { id: 8, cod: 'paint', tipo: 'acabamento', unidade: 'm²', nome: 'Laca', preco: 180 },
];
const bib = buildQuoteLibrary(rawLibrary);
const hardwareLibrary = [
    ...rawLibrary,
    { id: 9, cod: 'handle', tipo: 'ferragem', unidade: 'un', nome: 'Puxador A', categoria: 'puxador', preco: 12 },
    { id: 10, cod: 'handle_alt', tipo: 'ferragem', unidade: 'un', nome: 'Puxador B', categoria: 'puxador', preco: 25 },
    { id: 11, cod: 'linear', tipo: 'ferragem', unidade: 'm', nome: 'Perfil por metro', categoria: '', preco: 20 },
    { id: 12, cod: 'slide_pair', tipo: 'ferragem', unidade: 'par', nome: 'Corrediça por par', categoria: 'corrediça', preco: 40 },
];
const hardwareBib = buildQuoteLibrary(hardwareLibrary);
const taxas = { imp: 8, com: 0, lucro: 20, inst: 5, frete: 2,
    mk_chapas: 1.45, mk_ferragens: 1.15, mk_fita: 1.45, mk_acabamentos: 1.3, mk_acessorios: 1.2, mk_mdo: 0.8 };
const caixaDef = {
    nome: 'Caixa', coef: 0.3, dimsAplicaveis: ['L', 'A', 'P'],
    pecas: [
        { nome: 'Laterais', calc: 'A*P', qtd: 2, mat: 'int', fita: ['f'] },
        { nome: 'Topo', calc: 'Li*P', qtd: 1, mat: 'int', fita: ['f'] },
        { nome: 'Base', calc: 'Li*P', qtd: 1, mat: 'int', fita: ['f'] },
        { nome: 'Fundo', calc: 'Li*Ai', qtd: 1, mat: 'fundo', fita: [] },
    ], tamponamentos: [], sub_itens: [],
};
const portaDef = {
    nome: 'Porta', cat: 'componente', vars: [{ id: 'nPortas', default: 2 }, { id: 'Ap', default: 0 }],
    varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' }, pecas: [],
    frente_externa: { ativa: true, nome: 'Porta', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
    sub_itens: [{ id: 'dob', nome: 'Dobradiças', ferrId: 'hinge', defaultOn: true, qtdFormula: 'nPortas*2' }],
};
const shelfDef = {
    nome: 'Prateleira', vars: [], varsDeriv: { Lpr: 'Li', Ppr: 'Pi' },
    pecas: [{ nome: 'Prateleira', qtd: 1, calc: 'Lpr*Ppr', mat: 'int', fita: ['f'] }],
    sub_itens: [{ id: 'sup', nome: 'Suportes', ferrId: 'support', defaultOn: true, qtdFormula: '4' }],
};
const item = (quantity = 1) => ({ id: 'module', nome: 'Balcão', caixaDef: clone(caixaDef),
    dims: { l: 800, a: 720, p: 550 }, qtd: quantity,
    mats: { matInt: 'body', matExt: '', matFundo: 'back' },
    componentes: [
        { id: 'doors', compDef: clone(portaDef), qtd: 1, vars: { nPortas: 2 }, matExtComp: 'front' },
        { id: 'shelf', compDef: clone(shelfDef), qtd: 1, vars: {} },
    ],
});
const environment = items => ({ id: 'kitchen', nome: 'Cozinha', tipo: 'calculadora', itens: items, paineis: [], itensEspeciais: [] });
const quote = (items = [item()], options = {}) => calculateQuote({ ambientes: [environment(items)], taxas, bib, bibItems: rawLibrary, ...options });
const quoteHardware = (items, options = {}) => quote(items, { bib: hardwareBib, bibItems: hardwareLibrary, strictCatalog: true, ...options });

test('puxador global, override individual e sem puxador conservam prioridade, preço e quantidade', () => {
    const module = item(2);
    module.componentes[0].compDef.sub_itens.push({ id: 'handle', nome: 'Puxador', ferrId: 'handle', defaultOn: true, qtdFormula: 'nPortas' });
    const initial = quoteHardware([module]);
    const global = quoteHardware([module], { padroes: { puxador: 'handle_alt' } });
    assert.equal(initial.valid, true, JSON.stringify(initial.errors));
    assert.equal(global.valid, true, JSON.stringify(global.errors));
    assert.equal(initial.fa.handle.qtd, 4); // duas portas por caixa, duas caixas
    assert.equal(global.fa.handle_alt.qtd, 4);
    assert.equal(global.fa.handle, undefined);
    near(global.cm - initial.cm, 4 * (25 - 12));
    near(global.pvFinal - initial.pvFinal, 4 * (25 - 12) * 1.15 / 0.65);
    assert.equal(global.totNPortas, 4);

    const local = clone(module);
    local.componentes[0].subItensOvr = { handle: 'handle' };
    near(quoteHardware([local], { padroes: { puxador: 'handle_alt' } }).cm, initial.cm);
    near(quoteHardware([local], { padroes: { puxador: '__none__' } }).cm, initial.cm);

    const disabled = clone(module);
    disabled.componentes[0].subItens = { handle: false };
    const localOff = quoteHardware([disabled], { padroes: { puxador: 'handle_alt' } });
    const globalOff = quoteHardware([module], { padroes: { puxador: '__none__' } });
    assert.equal(globalOff.valid, true, JSON.stringify(globalOff.errors));
    assert.equal(globalOff.fa.handle, undefined);
    near(globalOff.cm, initial.cm - 4 * 12);
    near(localOff.cm, globalOff.cm);
    assert.equal(globalOff.totNPortas, 4);

    const invalid = quoteHardware([module], { padroes: { puxador: 'missing' } });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some(e => e.code === 'hardware_missing'));
});

test('troca global ou individual entre unidade, par e metro exige receita compatível', () => {
    const module = item();
    module.componentes[0].compDef.sub_itens.push({ id: 'handle', nome: 'Puxador', ferrId: 'handle', defaultOn: true, qtdFormula: 'nPortas' });
    for (const code of ['linear', 'slide_pair']) {
        const global = quoteHardware([module], { padroes: { puxador: code } });
        assert.equal(global.valid, false);
        assert.ok(global.errors.some(e => e.code === 'hardware_unit_mismatch'));
        const local = clone(module);
        local.componentes[0].subItensOvr = { handle: code };
        const individual = quoteHardware([local]);
        assert.equal(individual.valid, false);
        assert.ok(individual.errors.some(e => e.code === 'hardware_unit_mismatch'));
    }
});

test('categorias sem acento, maiúsculas e espaços aplicam no custo a mesma ferragem exibida no editor', () => {
    const setup = createDemoSetup();
    const library = setup.bibItems.map(entry => ({ ...entry,
        categoria: entry.categoria === 'dobradiça' ? ' DOBRADICA ' : entry.categoria === 'corrediça' ? ' CORREDICA ' : entry.categoria,
    }));
    const calculate = padroes => calculateQuote({ ambientes: setup.initialDraft.ambientes, taxas: setup.taxas,
        bibItems: library, bib: buildQuoteLibrary(library), padroes, strictCatalog: true });
    const initial = calculate(setup.padroes);
    const padroes = { ...setup.padroes, dobradica: 'demo_dob110', corredica: 'demo_corr500_soft' };
    const changed = calculate(padroes);
    assert.equal(initial.valid, true, JSON.stringify(initial.errors));
    assert.equal(changed.valid, true, JSON.stringify(changed.errors));
    assert.equal(changed.fa.demo_dob110.qtd, 18);
    assert.equal(changed.fa.demo_corr500_soft.qtd, 3);
    assert.equal(changed.fa.demo_dob110_soft, undefined);
    assert.equal(changed.fa.demo_corr500, undefined);
    near(changed.cm - initial.cm, 18 * (8.2 - 12.5) + 3 * (120 - 55));
    for (const module of setup.initialDraft.ambientes[0].itens) {
        for (const ci of module.componentes) {
            for (const slot of getComponentHardware(module, ci.id, library, padroes).filter(slot => slot.enabled)) {
                assert.ok(changed.fa[slot.effectiveFerrId], `Ferragem exibida ${slot.effectiveFerrId} ausente do cálculo`);
            }
        }
    }
});

test('puxadores de gaveta multiplicam a quantidade de gavetas e de caixas uma única vez', () => {
    const setup = createDemoSetup();
    const drawer = clone(setup.initialDraft.ambientes[0].itens.find(i => i.quick.counts.drawers > 0));
    drawer.qtd = 2;
    const result = calculateQuote({ ambientes: [environment([drawer])], taxas: setup.taxas,
        bibItems: setup.bibItems, bib: buildQuoteLibrary(setup.bibItems), padroes: setup.padroes, strictCatalog: true });
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.fa.demo_pux128.qtd, 6);
    assert.equal(result.totNGavetas, 6);
    assert.equal(result.totNPortas, 0);
    assert.equal(result.totNCaixas, 2);
});

test('ferragem avulsa em metros conserva frações, fixa a escolha e não cria portas ou caixas', () => {
    const module = item(2);
    const loose = {
        id: 'loose', qtd: 1, vars: { quantidade: 1.25 }, subItensOvr: { loose: 'linear' },
        composition: { kind: 'loose-hardware', unit: 'm', hardwareId: 'linear' },
        compDef: { nome: 'Ferragem avulsa para porta', pecas: [], frente_externa: { ativa: false },
            vars: [{ id: 'quantidade', default: 1 }],
            sub_itens: [{ id: 'loose', ferrId: 'linear', defaultOn: true, qtdFormula: 'quantidade' }] },
    };
    const baseline = quoteHardware([module]);
    module.componentes.push(loose);
    const result = quoteHardware([module]);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    near(result.fa.linear.qtd, 2.5);
    near(result.cm - baseline.cm, 2.5 * 20);
    assert.equal(result.totNPortas, baseline.totNPortas);
    assert.equal(result.totNGavetas, baseline.totNGavetas);
    assert.equal(result.totNCaixas, baseline.totNCaixas);
    assert.equal(result.totNModulos, baseline.totNModulos);
    assert.equal(result.totNPecas, baseline.totNPecas);

    const explicitHandle = clone(module);
    const handle = explicitHandle.componentes.at(-1);
    handle.vars.quantidade = 3;
    handle.compDef.sub_itens[0].ferrId = 'handle';
    handle.subItensOvr.loose = 'handle';
    handle.composition = { kind: 'loose-hardware', unit: 'un', hardwareId: 'handle' };
    const fixed = quoteHardware([explicitHandle], { padroes: { puxador: '__none__' } });
    assert.equal(fixed.valid, true, JSON.stringify(fixed.errors));
    assert.equal(fixed.fa.handle.qtd, 6);

    for (const code of ['handle', 'slide_pair']) {
        const invalid = clone(module);
        const ci = invalid.componentes.at(-1);
        ci.compDef.sub_itens[0].ferrId = code;
        ci.subItensOvr.loose = code;
        const result = quoteHardware([invalid]);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.code === 'quantity_invalid'));
    }
    const zeroPrice = hardwareLibrary.map(m => m.cod === 'linear' ? { ...m, preco: 0 } : m);
    assert.ok(quoteHardware([module], { bib: buildQuoteLibrary(zeroPrice), bibItems: zeroPrice }).errors.some(e => e.code === 'price_invalid'));
});

test('fórmula linear da caixa usa consumo real em metros, sem arredondar para unidade', () => {
    const module = item();
    const initial = quoteHardware([module]);
    module.caixaDef.sub_itens.push({ id: 'profile', nome: 'Perfil', ferrId: 'linear', defaultOn: true, qtdFormula: 'Li/1000' });
    const result = quoteHardware([module]);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    near(result.fa.linear.qtd, 0.764);
    near(result.cm - initial.cm, 0.764 * 20);
});

test('caixa livre usa snapshots fora dos presets e mistura componentes sem outro motor', () => {
    const setup = createDemoSetup();
    const freeBox = { ...clone(setup.caixas[0]), db_id: 99001, nome: 'Aparador livre do catálogo' };
    const before = clone(freeBox);
    let module = createCatalogBoxItem(freeBox, { l: 1100, a: 1400, p: 500 }, setup.initialDraft.materials, { id: 'free', qtd: 1 });
    module = addCatalogComponent(module, setup.componentes.find(c => c.nome === 'Porta'), { qtd: 1, vars: { nPortas: 3, Ap: 1000 } });
    module = addCatalogComponent(module, setup.componentes.find(c => c.nome === 'Gaveta'), { qtd: 2 });
    module = addCatalogComponent(module, setup.componentes.find(c => c.nome === 'Prateleira'), { qtd: 2 });
    const calculate = items => calculateQuote({ ambientes: [environment(items)], taxas: setup.taxas,
        bib: buildQuoteLibrary(setup.bibItems), bibItems: setup.bibItems, padroes: setup.padroes, strictCatalog: true });
    const initial = calculate([module]);
    assert.equal(initial.valid, true, JSON.stringify(initial.errors));
    assert.equal(module.quick?.kind, undefined);
    assert.equal(module.composition.mode, 'catalog');
    assert.equal(initial.totNPortas, 3);
    assert.equal(initial.totNGavetas, 2);
    assert.equal(initial.totNPrateleiras, 2);
    assert.equal(initial.fa.demo_pux128.qtd, 5);
    assert.deepEqual(freeBox, before);

    const repeated = { ...module, qtd: 2 };
    const twice = calculate([repeated]);
    near(twice.cm, initial.cm * 2);
    near(twice.pvFinal, initial.pvFinal * 2);
    assert.equal(twice.totNCaixas, 2);
    assert.equal(twice.totNModulos, 2);
    assert.equal(twice.totNPortas, 6);
    assert.equal(twice.totNGavetas, 4);
    assert.equal(twice.fa.demo_pux128.qtd, 10);

    const invalid = clone(module);
    invalid.componentes.find(ci => ci.compDef.nome === 'Gaveta').matExtComp = '';
    assert.ok(calculate([invalid]).errors.some(e => e.code === 'MISSING_FRONT_MATERIAL'));
    invalid.componentes = [];
    invalid.mats.matFundo = '';
    assert.ok(calculate([invalid]).errors.some(e => e.code === 'MISSING_PIECE_MATERIAL'));
});

test('builder de ferragem avulsa integra metragem e preserva extras promovidos ao catálogo livre', () => {
    const source = {
        id: 'panel', nome: 'Tamponamento', qtd: 2, _matCustom: true,
        quick: { kind: 'extra', extraType: 'lateral', group: 'extras' }, dims: { l: 720, a: 550, p: 0 },
        caixaDef: { nome: 'Tamponamento', coef: 0, dimsAplicaveis: ['L', 'A'], pecas: [{ nome: 'Painel', qtd: 1, calc: 'L*A', mat: 'int', fita: ['all'] }], tamponamentos: [] },
        mats: { matInt: 'front', matExt: '' }, componentes: [],
    };
    const original = quoteHardware([source]);
    const promoted = promoteToCatalogItem(source);
    const plain = quoteHardware([promoted]);
    assert.equal(plain.valid, true, JSON.stringify(plain.errors));
    near(plain.cm, original.cm);
    near(plain.pvFinal, original.pvFinal);
    assert.equal(plain.totNCaixas, 0);
    assert.equal(plain.totNModulos, 0);
    assert.equal(plain.totNPecas, original.totNPecas);
    const linear = hardwareLibrary.find(m => m.cod === 'linear');
    const withHardware = addLooseHardware(promoted, linear, { quantity: 0.75 });
    const result = quoteHardware([withHardware]);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    near(result.cm - plain.cm, 0.75 * 2 * 20);
    near(result.fa.linear.qtd, 1.5);
    assert.equal(result.totNCaixas, 0);
    assert.equal(result.totNModulos, 0);
    const synonyms = hardwareLibrary.map(m => m.cod === 'linear' ? { ...m, unidade: 'metro' } : m);
    const same = quoteHardware([withHardware], { bib: buildQuoteLibrary(synonyms), bibItems: synonyms });
    assert.equal(same.valid, true, JSON.stringify(same.errors));
    near(same.cm, result.cm);
});

test('composição livre vazia pode ser editada, mas só volta a ser válida com conteúdo ativo', () => {
    const setup = createDemoSetup();
    const original = createCatalogBoxItem(setup.caixas[0], { l: 600, a: 720, p: 550 }, setup.initialDraft.materials);
    const parts = getBoxParts(original);
    const calculate = module => calculateQuote({ ambientes: [environment([module])], taxas: setup.taxas,
        bibItems: setup.bibItems, bib: buildQuoteLibrary(setup.bibItems), padroes: setup.padroes, strictCatalog: true });
    let empty = original;
    for (const part of parts) empty = setBoxPartEnabled(empty, part.id, false, { source: part.source });
    assert.equal(getBoxParts(empty).filter(part => part.enabled).length, 0);
    const invalid = calculate(empty);
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some(error => error.code === 'composition_empty' && error.itemId === empty.id));
    assert.equal(invalid.totNModulos, 0);
    assert.equal(invalid.cm, 0);
    assert.equal(invalid.itemResults[empty.id].valid, false);

    const restored = setBoxPartEnabled(empty, parts[0].id, true, { source: parts[0].source });
    const restoredQuote = calculate(restored);
    assert.equal(restoredQuote.valid, true, JSON.stringify(restoredQuote.errors));
    assert.ok(restoredQuote.cm > 0);
    const fullDiscount = applyQuoteDiscount(restoredQuote.pvFinal, { tipo: '%', valor: 100 });
    assert.equal(fullDiscount.valid, true);
    assert.equal(fullDiscount.pvComDesconto, 0);

    const hardware = setup.bibItems.find(entry => entry.cod === 'demo_pux128');
    const hardwareOnly = addLooseHardware(empty, hardware, { quantity: 2 });
    const hardwareQuote = calculate(hardwareOnly);
    assert.equal(hardwareQuote.valid, true, JSON.stringify(hardwareQuote.errors));
    assert.equal(hardwareQuote.totNPecas, 0);
    assert.equal(hardwareQuote.fa.demo_pux128.qtd, 2);
    const hardwareOff = setComponentHardware(hardwareOnly, hardwareOnly.componentes[0].id, 'loose', { enabled: false });
    assert.ok(calculate(hardwareOff).errors.some(error => error.code === 'composition_empty'));

    let frontOnly = addCatalogComponent(empty, setup.componentes.find(component => component.nome === 'Porta'));
    for (const slot of frontOnly.componentes[0].compDef.sub_itens) {
        frontOnly = setComponentHardware(frontOnly, frontOnly.componentes[0].id, slot.id, { enabled: false });
    }
    const frontQuote = calculate(frontOnly);
    assert.equal(frontQuote.valid, true, JSON.stringify(frontQuote.errors));
    assert.equal(frontQuote.totNPecas, 2);
    assert.equal(frontQuote.totNFerragens, 0);
});

test('paridade: mantém custo proporcional, markups, coeficiente e divisor do ERP', () => {
    const result = quote([item(2)]);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    const bodyArea = 2 * 720 * 550 / 1e6 + 3 * 764 * 550 / 1e6;
    const frontArea = 2 * 382 * 720 / 1e6;
    const backArea = 764 * 684 / 1e6;
    const sheetCosts = bodyArea / (5.0875 * 0.85) * 300 + frontArea / (5.0875 * 0.85) * 500 + backArea / (5.0875 * 0.90) * 120;
    const edgeCosts = 3.732 * 1.2 + 4.408 * 2.4;
    const hardwareCosts = 4 * 18 + 4 * 1.5;
    const material = (sheetCosts + edgeCosts + hardwareCosts) * 2;
    const fabricated = (sheetCosts + edgeCosts) * 2 * 1.3;
    const expectedCP = fabricated * (1.45 + 0.8) + hardwareCosts * 2 * 1.15;
    near(result.cm, material);
    near(result.cp, expectedCP);
    near(result.pv, expectedCP / 0.65);
    near(result.pvFinal, result.pv);
    near(result.ca.body.area, bodyArea * 2);
    assert.equal(result.totNPortas, 4);
    assert.equal(result.totNPrateleiras, 2);
    assert.equal(result.totNPecas, 16);
    assert.equal(Object.keys(result.itemResults).length, 1);
});

test('métricas: multiplicidades físicas, fita, quatro bordas e portas sem contar dobradiças', () => {
    const cfg = { ...taxas, custo_hora_ativo: 1, func_producao: 2, horas_dia: 8, dias_uteis: 20, eficiencia: 75,
        centro_custo_json: '[{"valor":36000}]', cnc_velocidade: 6000, cnc_overhead_peca: 10, cnc_overhead_chapa: 0,
        fita_velocidade: 1000, fita_overhead_borda: 60, tempo_furacao: 0, tempo_montagem: 0,
        tempo_montagem_porta: 0.2, tempo_montagem_gaveta: 0, tempo_montagem_prat: 0,
        tempo_acabamento: 0, tempo_embalagem: 0, tempo_instalacao: 0 };
    const result = quote([item(2)], { taxas: cfg });
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.totNFerragens, 16);
    assert.equal(result.totNPortas, 4);
    assert.equal(result.custoHoraResult.breakdown.totalBordas, 26);
    near(result.custoHoraResult.breakdown.hFita, 26 / 60 + 16.28 / 60);
    near(result.custoHoraResult.breakdown.hCorte, 40536 / 6000 / 60 + 16 * 10 / 3600);
    near(result.custoHoraResult.breakdown.hMontagem, 4 * 0.2 * 1.3);
    near(result.custoHoraResult.custoHora, 150);
    const one = quote([item()], { taxas: cfg });
    near(result.custoMdo, one.custoMdo * 2);
});

test('complemento usa receita própria e não cria outra caixa ou instalação por módulo', () => {
    const complement = { id: 'panel', nome: 'Tamponamento', qtd: 2,
        quick: { kind: 'extra', extraType: 'lateral' }, dims: { l: 720, a: 550, p: 0 },
        caixaDef: { nome: 'Tamponamento', coef: 0, dimsAplicaveis: ['L', 'A'], pecas: [{ nome: 'Painel', qtd: 1, calc: 'L*A', mat: 'int', fita: ['all'] }], tamponamentos: [] },
        mats: { matInt: 'front', matExt: '' }, componentes: [] };
    const result = quote([complement]);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.totNCaixas, 0);
    assert.equal(result.totNModulos, 0);
    assert.equal(result.totNPecas, 2);
    near(result.ca.front.area, 0.792);
    near(result.ft, 5.08);
});

test('biblioteca e ripados respeitam perda de zero por cento', () => {
    const noWasteRaw = rawLibrary.map(m => m.unidade === 'chapa' ? { ...m, perda_pct: 0, preco_m2: 0 } : m);
    const noWaste = buildQuoteLibrary(noWasteRaw);
    assert.equal(noWaste.chapas.find(c => c.id === 'body').perda_pct, 0);
    const result = quote([item()], { bib: noWaste });
    near(result.ca.body.frac, result.ca.body.area / 5.0875);
    const cfg = { tipo: 'ripado', L: 600, A: 720, wV: 40, eV: 18, sV: 20, matRipaV: 1, matSubstrato: 1, temSubstrato: true };
    const ripado = calcPainelRipado(cfg, noWasteRaw);
    near(ripado.custoRipasV, (10 * 720 * 40 / 1e6) * 300 / 5.0875);
    near(ripado.custoSubstrato, (600 * 720 / 1e6) * 300 / 5.0875);
    const amb = environment([]);
    amb.paineis = [{ ...cfg, qtd: 1 }];
    assert.equal(calculateQuote({ ambientes: [amb], taxas, bib: noWaste, bibItems: noWasteRaw }).valid, true);
});

test('manual e avulso continuam sendo venda direta; especiais e ripados mantêm formação de preço', () => {
    const manual = { id: 'manual', tipo: 'manual', linhas: [{ tipo: 'bloco', valor: 1000 }, { qtd: 2, valorUnit: 200 }] };
    const modular = environment([item(), { id: 'avulso', tipo: 'avulso', valor: 300, qtd: 2 }]);
    modular.itensEspeciais = [{ id: 'special', tipo: 'outro', qtd: 2, precoUnit: 100, unidade: 'un' }];
    modular.paineis = [{ id: 'ripado', tipo: 'ripado', L: 600, A: 720, wV: 40, eV: 18, sV: 20, matRipaV: 1, matSubstrato: 1, temSubstrato: true, qtd: 2, coefDificuldade: 1.3 }];
    const result = calculateQuote({ ambientes: [modular, manual], taxas, bib, bibItems: rawLibrary });
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    const base = quote();
    const ripado = calcPainelRipado(modular.paineis[0], rawLibrary);
    const addedCP = ripado.custoMaterial * 2 * 1.3 * (1.45 + 0.8) + 200 * 1.15;
    near(result.cp - base.cp, addedCP);
    near(result.cm - base.cm, ripado.custoMaterial * 2 + 200);
    near(result.manualTotal, 2000);
    near(result.pvFinal, result.pv + 2000);
});

test('acabamento explicitamente incluso pode custar zero; preço ausente não pode', () => {
    const included = item();
    included.componentes[0].matExtComp = 'included';
    assert.equal(quote([included]).valid, true);
    const badLibrary = clone(bib);
    badLibrary.acabamentos.find(a => a.id === 'paint').preco = 0;
    const painted = item();
    painted.componentes[0].matExtComp = 'paint';
    const result = quote([painted], { bib: badLibrary });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.code === 'price_invalid'));
    const legacyPrices = rawLibrary.map(m => m.cod === 'paint' ? { ...m, preco: 0, preco_m2: 180 } : m);
    const legacyBib = buildQuoteLibrary(legacyPrices);
    assert.equal(legacyBib.acabamentos.find(a => a.id === 'paint').preco, 180);
    assert.equal(quote([painted], { bib: legacyBib }).valid, true);
    legacyBib.acabamentos.find(a => a.id === 'paint').preco_m2 = 0;
    assert.equal(quote([painted], { bib: legacyBib }).valid, true);
});

test('catálogo estrito bloqueia somente preços padrão efetivamente usados e mantém totais do editor', () => {
    const complete = quote([item()], { strictCatalog: true });
    assert.equal(complete.valid, true, JSON.stringify(complete.errors));
    assert.equal(complete.warnings.some(e => e.code === 'fallback_price'), false);
    const fallbackItem = item();
    fallbackItem.componentes[0].compDef.sub_itens[0].ferrId = 'dob110';
    const editor = quote([fallbackItem]);
    const quick = quote([fallbackItem], { strictCatalog: true });
    assert.equal(editor.valid, true);
    assert.equal(quick.valid, false);
    near(quick.pvFinal, editor.pvFinal);
    const issue = quick.errors.find(e => e.code === 'fallback_price');
    assert.equal(issue.source, 'ferragem');
    assert.equal(issue.catalogId, 'dob110');
    assert.equal(issue.itemId, 'module');
    assert.ok(editor.warnings.some(e => e.code === 'fallback_price' && e.catalogId === 'dob110'));
    const noTapeRaw = rawLibrary.filter(m => m.cod !== 'edge').map(m => ({ ...m, fita_preco: 0 }));
    const tape = quote([item()], { bib: buildQuoteLibrary(noTapeRaw), bibItems: noTapeRaw, strictCatalog: true });
    assert.ok(tape.errors.some(e => e.code === 'fallback_price' && e.source === 'fita'));
});

test('override explícito de ferragem ausente falha sem voltar à receita padrão', () => {
    const globalOverride = quote([item()], { padroes: { dobradica: 'does-not-exist' }, strictCatalog: true });
    assert.equal(globalOverride.valid, false);
    assert.ok(globalOverride.errors.some(e => e.code === 'hardware_missing' && e.message.includes('does-not-exist')));
    const overridden = item();
    overridden.componentes[0].subItensOvr = { dob: 'does-not-exist' };
    const individualOverride = quote([overridden]);
    assert.equal(individualOverride.valid, false);
    assert.ok(individualOverride.errors.some(e => e.code === 'hardware_missing'));
});

test('receita rápida não omite frentes de gaveta nem substitui fundo vazio pelo corpo', () => {
    const setup = createDemoSetup();
    const draft = setup.initialDraft;
    const calculate = ambientes => calculateQuote({ ambientes, taxas: draft.taxas, padroes: draft.padroes,
        bibItems: setup.bibItems, bib: buildQuoteLibrary(setup.bibItems), strictCatalog: true });
    const valid = calculate(draft.ambientes);
    assert.equal(valid.valid, true, JSON.stringify(valid.errors));
    assert.equal(valid.totNModulos, 6);
    assert.equal(valid.totNPortas, 9);
    assert.equal(valid.totNGavetas, 3);
    for (const field of ['front', 'back']) {
        const ambientes = clone(draft.ambientes);
        const drawer = ambientes[0].itens.find(i => i.quick.counts.drawers > 0);
        if (field === 'front') drawer.componentes[0].matExtComp = '';
        else drawer.mats.matFundo = '';
        const result = calculate(ambientes);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.code === (field === 'front' ? 'MISSING_FRONT_MATERIAL' : 'MISSING_BACK_MATERIAL')));
    }
});

test('lucro negativo do PV manual é preservado no editor e recusado no modo estrito', () => {
    const legacy = quote([item()], { taxas: { ...taxas, lucro: -6 } });
    assert.equal(legacy.valid, true, JSON.stringify(legacy.errors));
    near(legacy.pvFinal, legacy.cp / (1 - (8 + 0 - 6 + 5 + 2) / 100));
    const strict = quote([item()], { taxas: { ...taxas, lucro: -6 }, strictCatalog: true });
    assert.equal(strict.valid, false);
    assert.ok(strict.errors.some(e => e.code === 'rate_invalid'));
    assert.equal(quote([item()], { taxas: { ...taxas, imp: -1 } }).valid, false);
});

test('consumíveis contam as multiplicidades físicas da receita e do componente', () => {
    const one = item();
    const three = item();
    three.componentes[1].qtd = 3;
    const cfg = { ...taxas, consumiveis_ativo: true, cons_minifix_un: 1.8 };
    const base = quote([one], { taxas: cfg });
    const more = quote([three], { taxas: cfg });
    assert.equal(base.itemResults.module.nJuncoes, 6); // 5 peças da caixa + 1 prateleira
    assert.equal(more.itemResults.module.nJuncoes, 8); // 5 peças da caixa + 3 prateleiras
    near(more.consumiveisResult.breakdown.minifix - base.consumiveisResult.breakdown.minifix, 2 * 1.8);
    three.qtd = 2;
    near(quote([three], { taxas: cfg }).consumiveisResult.breakdown.minifix, 8 * 2 * 1.8);
});

test('receita/material/preço inválidos são erros visíveis e não totais silenciosamente incompletos', () => {
    const scenarios = [
        item => { item.dims.l = -100; },
        item => { item.qtd = 0; },
        item => { item.caixaDef = null; },
        item => { item.caixaDef.pecas[0].calc = 'A*VAR_INEXISTENTE'; },
        item => { item.caixaDef.pecas[0].qtd = 0; },
        item => { item.mats.matInt = 'missing'; },
        item => { item.mats.matInt = ''; },
        item => { item.componentes[0].matExtComp = ''; },
    ];
    for (const mutate of scenarios) {
        const invalid = item(); mutate(invalid);
        const result = quote([invalid]);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.itemId === 'module'));
        assert.ok(Number.isFinite(result.pvFinal));
    }
    const zeroPrice = clone(bib);
    zeroPrice.chapas[0].preco = 0;
    assert.equal(quote([item()], { bib: zeroPrice }).valid, false);
    assert.equal(quote([item()], { taxas: { ...taxas, imp: 80, lucro: 30 } }).valid, false);
});

test('desconto é aplicado uma vez ao preço final; limites são explícitos', () => {
    assert.deepEqual(applyQuoteDiscount(1000, { tipo: '%', valor: 10 }), { descontoR: 100, pvComDesconto: 900, valid: true, errors: [] });
    assert.equal(applyQuoteDiscount(1000, { tipo: 'R', valor: 100 }).pvComDesconto, 900);
    assert.equal(applyQuoteDiscount(1000, { tipo: '%', valor: 100 }).pvComDesconto, 0);
    for (const discount of [{ tipo: '%', valor: -1 }, { tipo: '%', valor: 101 }, { tipo: 'R', valor: 1001 }, { tipo: '%', valor: NaN }]) {
        const result = applyQuoteDiscount(1000, discount);
        assert.equal(result.valid, false);
        assert.equal(result.pvComDesconto, null);
        assert.ok(result.errors.length);
    }
});

test('resolução de materiais preserva override e cálculo não modifica snapshots recebidos', () => {
    const original = item();
    const snapshot = clone(original);
    const env = { matInt: 'front', matExt: 'paint' };
    assert.equal(resolveItemMats(original, env).matInt, 'front');
    assert.equal(resolveItemMats({ ...original, _matCustom: true }, env).matInt, 'body');
    quote([original]);
    assert.deepEqual(original, snapshot);
    const empty = calculateQuote({ ambientes: [], taxas, bib });
    assert.equal(empty.valid, true);
    assert.equal(empty.pvFinal, 0);
    assert.equal(empty.cm, 0);
});
