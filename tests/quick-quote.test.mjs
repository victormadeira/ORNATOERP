import test from 'node:test';
import assert from 'node:assert/strict';
import {
    listQuickPresets, buildQuickItem, buildQuickExtra, rebuildQuickItem,
    createQuickKitchenExample, validateQuickInputs, validateQuickItem,
    validateQuickExtraInputs, QuickQuoteValidationError,
} from '../src/quickQuote.js';
import { calcItemV2 } from '../src/engine.js';

// Fixtures de estrutura, sem preços ou banco: mesmas convenções do catálogo ERP.
function catalogFixture() {
    const box = (db_id, nome) => ({
        db_id, nome, tipo_item: 'caixa', coef: 0.3, dimsAplicaveis: ['L', 'A', 'P'],
        pecas: [
            { id: 'le', nome: 'Lateral Esq.', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'ld', nome: 'Lateral Dir.', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'tp', nome: 'Topo', qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] },
            { id: 'bs', nome: 'Base', qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] },
            { id: 'fn', nome: 'Fundo', qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: [] },
        ],
        tamponamentos: [{ id: 'te', nome: 'Tamp. lateral', calc: 'A*P', mat: 'ext', fita: ['all'] }],
    });
    return {
        caixas: [box(1, 'Caixa Baixa / Balcão'), box(2, 'Caixa Aérea')],
        componentes: [
            {
                db_id: 10, nome: 'Porta', tipo_item: 'componente', coef: 0.15, pecas: [],
                vars: [{ id: 'nPortas', default: 2 }, { id: 'Ap', default: 0 }],
                varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
                frente_externa: { ativa: true, nome: 'Porta', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
                sub_itens: [{ id: 'dob110', ferrId: 'dob110', defaultOn: true, qtdFormula: 'nPortas*2' }],
            },
            {
                db_id: 11, nome: 'Gaveta', tipo_item: 'componente', coef: 0.2,
                vars: [{ id: 'ag', default: 150 }], varsDeriv: { Lg: 'Li', Pg: 'P-50' },
                pecas: [
                    { id: 'lat', nome: 'Lateral', qtd: 2, calc: 'Pg*ag', mat: 'int', fita: ['f'] },
                    { id: 'fnd', nome: 'Fundo', qtd: 1, calc: 'Lg*Pg', mat: 'fundo', fita: [] },
                ],
                frente_externa: { ativa: true, nome: 'Frente', calc: 'Lg*ag', mat: 'ext_comp', fita: ['all'] },
                sub_itens: [{ id: 'normal', ferrId: 'corr400', defaultOn: true }, { id: 'oculta', ferrId: 'corrFH', defaultOn: false }],
            },
            {
                db_id: 12, nome: 'Prateleira', tipo_item: 'componente', coef: 0.05,
                vars: [], varsDeriv: { Lpr: 'Li', Ppr: 'Pi' },
                pecas: [{ id: 'prat', nome: 'Prateleira', qtd: 1, calc: 'Lpr*Ppr', mat: 'int', fita: ['f'] }],
                frente_externa: { ativa: false }, sub_itens: [],
            },
        ],
    };
}
const materials = { matInt: 'corpo-real', matFrente: 'frente-real', matFundo: 'fundo-real' };
const syntheticBib = {
    chapas: [
        { id: 'corpo-real', esp: 18, larg: 2750, alt: 1850, preco: 0, perda_pct: 0, fita_preco: 0 },
        { id: 'frente-real', esp: 18, larg: 2750, alt: 1850, preco: 0, perda_pct: 0, fita_preco: 0 },
        { id: 'fundo-real', esp: 6, larg: 2750, alt: 1850, preco: 0, perda_pct: 0, fita_preco: 0 },
    ],
    fitas: [{ id: 'fita-test', preco: 0 }], ferragens: [], acabamentos: [],
};
const preset = (id, catalog = catalogFixture()) => listQuickPresets(catalog).find((entry) => entry.id === id);
const calc = (item) => calcItemV2(item.caixaDef, item.dims, item.mats, item.componentes, syntheticBib, {});
const approximate = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('presets resolvem o catálogo e denunciam receitas ausentes ou ambíguas', () => {
    const catalog = catalogFixture();
    assert.equal(listQuickPresets(catalog).filter((entry) => entry.available).length, 7);
    catalog.componentes = catalog.componentes.filter((entry) => entry.nome !== 'Porta');
    assert.equal(preset('aereo2', catalog).available, false);
    assert.equal(preset('gaveteiro3', catalog).available, true);
    catalog.caixas.push({ ...catalog.caixas[0], db_id: 99 });
    assert.match(preset('pia2', catalog).missing.join(' '), /duplicado/);
    assert.equal(listQuickPresets().some((entry) => entry.available), false);
});

test('a construção conserva IDs e snapshots sem modificar o catálogo', () => {
    const catalog = catalogFixture();
    const before = structuredClone(catalog);
    const item = buildQuickItem(preset('balcao2', catalog), { l: 1200, a: 720, p: 550 }, materials);
    assert.equal(item.caixaId, 1);
    assert.deepEqual(item.componentes.map((ci) => ci.compId), [10, 12]);
    assert.equal(item.componentes[0].matExtComp, materials.matFrente);
    assert.equal(item.mats.matExt, '');
    assert.deepEqual(item.caixaDef.tamponamentos, []);
    item.caixaDef.pecas[0].nome = 'alterado no orçamento';
    item.componentes[0].compDef.nome = 'alterado no orçamento';
    assert.deepEqual(catalog, before);
});

test('cozinha exemplo tem cinco linhas, seis móveis e 3.000 mm em cada grupo', () => {
    let sequence = 0;
    const amb = createQuickKitchenExample(catalogFixture(), materials, { idFactory: () => `test-${++sequence}` });
    assert.equal(amb.itens.length, 5);
    assert.equal(amb.itens.reduce((sum, item) => sum + item.qtd, 0), 6);
    for (const group of ['lower', 'upper']) {
        assert.equal(amb.itens.filter((item) => item.quick.group === group).reduce((sum, item) => sum + item.dims.l * item.qtd, 0), 3000);
    }
    assert.equal(amb.itens.reduce((sum, item) => sum + item.quick.counts.doors * item.qtd, 0), 9);
    const ids = [amb.id, ...amb.itens.flatMap((item) => [item.id, ...item.componentes.map((ci) => ci.id)])];
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(amb.itens.every((item) => validateQuickItem(item).length === 0));
    assert.ok(!JSON.stringify(amb).includes('preco'));
});

test('pia retira tampo e fundo, inclui exatamente duas travessas e suporta reconstrução', () => {
    const item = buildQuickItem(preset('pia2'), { l: 1200, a: 720, p: 550 }, { ...materials, matFundo: '' });
    assert.match(item.nome, /fundo aberto/);
    assert.equal(item.caixaDef.pecas.some((piece) => piece.id === 'tp' || piece.mat === 'fundo'), false);
    const travessas = item.caixaDef.pecas.filter((piece) => piece.id === 'quick_travessa_superior');
    assert.equal(travessas.length, 1);
    assert.equal(travessas[0].qtd, 2);
    approximate(calc(item).pecas.find((piece) => piece.nome.includes('Travessa')).area, (1200 - 36) * 100 * 2 / 1e6);
    const changed = rebuildQuickItem(item, { dims: { l: 1000 } });
    assert.equal(changed.caixaDef.pecas.filter((piece) => piece.id === 'quick_travessa_superior').length, 1);
    assert.equal(changed.caixaId, item.caixaId);
});

test('gavetas usam frentes que preenchem a fachada e caixas 40 mm mais baixas', () => {
    const item = buildQuickItem(preset('gaveteiro3'), { l: 600, a: 720, p: 550 }, materials);
    const ci = item.componentes[0];
    assert.equal(ci.qtd, 3);
    approximate(ci.vars.frenteAf * 3 + 2 * 2 + 2 * 2, 720);
    approximate(ci.vars.ag, ci.vars.frenteAf - 40);
    assert.equal(ci.compDef.frente_externa.calc, 'Lg*frenteAf');
    const fronts = calc(item).pecas.filter((piece) => piece.tipo === 'frente_externa');
    assert.equal(fronts.length, 1);
    assert.equal(fronts[0].qtd, 3);
    approximate(fronts[0].area, (600 - 36) * (720 - 8) / 1e6);
    assert.equal(ci.subItens.normal, true);
    assert.equal(ci.subItens.oculta, false);
});

test('edição recalcula gavetas, conserva identidade e overrides de ferragens', () => {
    const item = buildQuickItem(preset('gaveteiro3'), { l: 600, a: 720, p: 550 }, materials);
    item.componentes[0].subItensOvr.normal = 'corredica-escolhida';
    const changed = rebuildQuickItem(item, { dims: { a: 800 }, qtd: 2, drawerCount: 4, drawerGap: 3, materials: { matFrente: 'outra-frente' } });
    assert.equal(changed.id, item.id);
    assert.equal(changed.componentes[0].id, item.componentes[0].id);
    assert.equal(changed.componentes[0].matExtComp, 'outra-frente');
    assert.equal(changed.componentes[0].subItensOvr.normal, 'corredica-escolhida');
    assert.equal(changed.componentes[0].qtd, 4);
    assert.match(changed.nome, /4 gavetas/);
    approximate(changed.componentes[0].vars.frenteAf * 4 + 3 * 3 + 4, 800);
    assert.equal(item.dims.a, 720);
});

test('prateleiras podem ser removidas e recolocadas com a mesma receita salva', () => {
    const item = buildQuickItem(preset('balcao2'), { l: 800, a: 720, p: 550 }, materials);
    const empty = rebuildQuickItem(item, { shelfCount: 0 });
    assert.equal(empty.componentes.some((ci) => ci.quick.role === 'shelf'), false);
    const restored = rebuildQuickItem(empty, { shelfCount: 2 });
    assert.equal(restored.componentes.find((ci) => ci.quick.role === 'shelf').qtd, 2);
    const niche = buildQuickItem(preset('nicho'), { l: 600, a: 700, p: 330 }, materials, { shelfCount: 1 });
    assert.equal(niche.componentes.find((ci) => ci.quick.role === 'shelf').compId, 12);
});

test('complementos são planos separados e não exigem uma profundidade fictícia', () => {
    const extra = buildQuickExtra({ tipo: 'rodape', dims: { l: 3000, a: 100 }, qtd: 1, matId: materials.matFrente });
    assert.equal(extra.quick.group, 'extras');
    assert.equal(extra.quick.extraType, 'rodape');
    assert.equal(extra._matCustom, true, 'o material do ambiente não pode substituir o material do complemento');
    assert.equal(extra.dims.p, 0);
    assert.deepEqual(extra.componentes, []);
    assert.equal(extra.caixaDef.pecas.length, 1);
    assert.equal(validateQuickItem(extra).length, 0);
    approximate(calc(extra).area, 0.3);
    approximate(calc(extra).fita, 6.2);
    const changed = rebuildQuickItem(extra, { dims: { l: 3200 }, matId: 'outro-material' });
    assert.equal(changed.id, extra.id);
    assert.equal(changed.mats.matInt, 'outro-material');
    assert.equal(changed.quick.extraType, 'rodape');
});

test('editar complemento conserva receita revisada, ajuste comercial e demais dados', () => {
    const extra = buildQuickExtra({ tipo: 'lateral', dims: { l: 550, a: 720 }, qtd: 1, matId: materials.matFrente });
    extra.caixaDef.pecas[0].fita = ['f'];
    extra.ajuste = { tipo: 'R', valor: 35 };
    extra.descricao = 'Acabamento revisado no editor completo';
    extra.grupo_id = 'laterais-expostas';
    const original = structuredClone(extra);
    const changed = rebuildQuickItem(extra, { dims: { a: 800 }, qtd: 2 });
    assert.deepEqual(changed, { ...original, dims: { ...original.dims, a: 800 }, qtd: 2 });
    approximate(calc(changed).fita, 0.55);
    changed.caixaDef.pecas[0].fita.push('b');
    changed.ajuste.valor = 99;
    assert.deepEqual(extra, original, 'a edição não deve alterar o snapshot anterior');
    const otherMaterial = rebuildQuickItem(extra, { matId: 'frente-revisada' });
    assert.equal(otherMaterial.mats.matInt, 'frente-revisada');
    assert.deepEqual(otherMaterial.caixaDef, original.caixaDef);
    assert.deepEqual(otherMaterial.ajuste, original.ajuste);
});

test('validação recusa medidas vazias, contagens inválidas e frentes sem material', () => {
    const p = preset('balcao2');
    const dims = { l: 800, a: 720, p: 550 };
    for (const bad of [null, '', NaN, Infinity, -1]) assert.ok(validateQuickInputs(p, { ...dims, l: bad }, materials).length);
    for (const qtd of [null, '', 0, -1, 1.5]) {
        assert.throws(() => buildQuickItem(p, dims, materials, { qtd }), QuickQuoteValidationError);
    }
    assert.ok(validateQuickInputs(p, dims, { ...materials, matFrente: '' }).some((error) => error.code === 'MISSING_FRONT_MATERIAL'));
    const item = buildQuickItem(p, dims, materials);
    assert.throws(() => rebuildQuickItem(item, { qtd: null }), QuickQuoteValidationError);
    assert.throws(() => rebuildQuickItem(item, { shelfCount: null }), QuickQuoteValidationError);
    assert.ok(validateQuickExtraInputs({ tipo: 'rodape', dims: { l: 3000, a: 100 }, matId: '' }).length);
});

test('receitas impossíveis de gaveta e combinações mistas ficam bloqueadas', () => {
    const p = preset('gaveteiro3');
    const dims = { l: 600, a: 720, p: 550 };
    assert.ok(validateQuickInputs(p, { ...dims, a: 250 }, materials).some((error) => error.code === 'DRAWER_FRONT_TOO_SMALL'));
    assert.ok(validateQuickInputs(p, { ...dims, p: 150 }, materials).some((error) => error.code === 'DRAWER_DEPTH_TOO_SMALL'));
    assert.ok(validateQuickInputs(p, dims, materials, { doorCount: 1 }).some((error) => error.code === 'MIXED_FRONTS'));
    assert.ok(validateQuickInputs(p, dims, materials, { drawerGap: null }).some((error) => error.field === 'drawerGap'));
});
