import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickQuotePayload, createErpQuickQuoteAdapter } from '../src/quickQuoteAdapter.js';
import { applyQuoteDiscount, buildQuoteLibrary, calculateQuote } from '../src/quoteCalculator.js';
import { valorFinalOrcamento } from '../server/lib/orcamento-values.js';
import { createDemoSetup } from '../preview/quick-quote/demoData.js';
import { createDemoQuickQuoteAdapter, DEMO_STORAGE_KEY } from '../preview/quick-quote/demoAdapter.js';

const fresh = () => {
    const setup = createDemoSetup();
    return { setup, draft: structuredClone(setup.initialDraft) };
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const calculate = (draft, setup) => calculateQuote({
    ambientes: draft.ambientes, taxas: draft.taxas || setup.taxas,
    padroes: draft.padroes || setup.padroes, bibItems: setup.bibItems,
    bib: buildQuoteLibrary(setup.bibItems), strictCatalog: true,
});

test('o exemplo usa somente o catálogo demonstrativo e mantém o preço ao serializar para o ERP', () => {
    const { setup, draft } = fresh();
    const before = calculate(draft, setup);
    assert.equal(before.valid, true, JSON.stringify(before.errors));
    assert.equal(before.warnings.some(w => ['default_library', 'fallback_price'].includes(w.code)), false);
    assert.equal(before.totNModulos, 6);
    const payload = buildQuickQuotePayload(draft, setup);
    const stored = JSON.parse(JSON.stringify({ ambientes: payload.ambientes, taxas: payload.taxas, padroes: payload.padroes }));
    near(calculate(stored, setup).pvFinal, before.pvFinal);
    near(payload.valor_venda, before.pvFinal);
});

test('o payload recalcula os totais e aplica desconto exatamente uma vez no financeiro', () => {
    const { setup, draft } = fresh();
    draft.totals = { pvFinal: 1, cm: 1 };
    draft.pagamento = { desconto: { tipo: '%', valor: 10 }, blocos: [] };
    const base = calculate(draft, setup);
    const expected = applyQuoteDiscount(base.pvFinal, draft.pagamento.desconto);
    const payload = buildQuickQuotePayload(draft, setup);
    near(payload.valor_venda, expected.pvComDesconto);
    near(payload.custo_material, base.cm);
    assert.equal(valorFinalOrcamento(payload), Math.round(expected.pvComDesconto * 100) / 100);
    assert.notEqual(valorFinalOrcamento(payload), Math.round(expected.pvComDesconto * 0.9 * 100) / 100);
});

test('contrato rejeita cliente, projeto, quantidade, preço ausente e desconto inválidos', () => {
    const { setup, draft } = fresh();
    assert.throws(() => buildQuickQuotePayload({ ...draft, clienteId: 987654 }, setup), /cliente/i);
    assert.throws(() => buildQuickQuotePayload({ ...draft, projeto: '  ' }, setup), /projeto/i);
    assert.throws(() => buildQuickQuotePayload({ ...draft, ambientes: [] }, setup), /móvel/i);
    const invalid = structuredClone(draft);
    invalid.ambientes[0].itens[0].qtd = -1;
    assert.throws(() => buildQuickQuotePayload(invalid, setup), /quantidade/i);
    const noPrice = structuredClone(setup);
    noPrice.bibItems.filter(i => i.tipo === 'material').forEach(i => { i.preco = 0; });
    assert.throws(() => buildQuickQuotePayload(draft, noPrice), /preço/i);
    assert.throws(() => buildQuickQuotePayload({ ...draft, pagamento: { desconto: { tipo: '%', valor: 101 } } }, setup), /desconto/i);
});

test('o payload não compartilha objetos mutáveis com o formulário', () => {
    const { setup, draft } = fresh();
    const payload = buildQuickQuotePayload(draft, setup);
    payload.ambientes[0].itens[0].dims.l = 1;
    payload.pagamento.desconto.valor = 99;
    assert.notEqual(draft.ambientes[0].itens[0].dims.l, 1);
    assert.notEqual(draft.pagamento.desconto.valor, 99);
});

test('adapter autenticado usa cadastros existentes, cria rascunho e atualiza o mesmo ID', async () => {
    const { setup, draft } = fresh();
    const calls = [];
    const paths = { '/clientes': setup.clientes, '/catalogo?tipo=caixa': setup.caixas,
        '/catalogo?tipo=componente': setup.componentes, '/biblioteca': setup.bibItems, '/config/taxas': setup.taxas };
    const client = {
        async get(path) { calls.push(['GET', path]); assert.ok(path in paths); return paths[path]; },
        async post(path, body, options) { calls.push(['POST', path, body, options]); return { ...body, id: 81 }; },
        async put(path, body) { calls.push(['PUT', path, body]); return { ...body, id: 81 }; },
    };
    const adapter = createErpQuickQuoteAdapter(client);
    await assert.rejects(adapter.saveQuote(draft), /carregamento/i);
    const loaded = await adapter.loadSetup();
    assert.deepEqual(loaded.caixas, setup.caixas);
    const created = await adapter.saveQuote({ ...draft, id: undefined });
    assert.equal(created.id, 81);
    const post = calls.find(c => c[0] === 'POST');
    assert.equal(post[1], '/orcamentos');
    assert.equal(post[2].status, 'rascunho');
    assert.equal(post[3].retries, 0);
    const updated = await adapter.saveQuote({ ...draft, id: 81 });
    assert.equal(updated.id, 81);
    assert.equal(calls.find(c => c[0] === 'PUT')[1], '/orcamentos/81');
    assert.equal(calls.filter(c => c[0] === 'GET').length, 5);
});

test('falha na leitura dos cadastros não é apresentada como carregamento concluído', async () => {
    const adapter = createErpQuickQuoteAdapter({ async get() { throw new Error('Conexão indisponível'); } });
    await assert.rejects(adapter.loadSetup(), /indisponível/);
    await assert.rejects(adapter.saveQuote({}), /carregamento/);
});

test('prévia salva e reabre localmente pelo mesmo contrato de cálculo', async () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const adapter = createDemoQuickQuoteAdapter({ storage });
    const setup = await adapter.loadSetup();
    const draft = structuredClone(setup.initialDraft);
    draft.projeto = 'Cozinha revisada';
    const saved = await adapter.saveQuote(draft);
    assert.equal(saved.numero, 'DEMO-001');
    assert.ok(values.has(DEMO_STORAGE_KEY));
    const reopened = await createDemoQuickQuoteAdapter({ storage }).loadSetup();
    assert.equal(reopened.initialDraft.projeto, 'Cozinha revisada');
    near(buildQuickQuotePayload(reopened.initialDraft, reopened).valor_venda, saved.valor_venda);
});

test('prévia não afirma ter salvo se o armazenamento falhar', async () => {
    const adapter = createDemoQuickQuoteAdapter({ storage: { getItem: () => null, setItem() { throw new Error('quota'); } } });
    const setup = await adapter.loadSetup();
    await assert.rejects(adapter.saveQuote(setup.initialDraft), /não permitiu salvar/i);
});

test('o valor financeiro aceita o líquido positivo e rejeita valores inválidos', () => {
    assert.equal(valorFinalOrcamento({ valor_venda: 9000, pagamento: { desconto: { valor: 10, tipo: '%' } } }), 9000);
    assert.equal(valorFinalOrcamento({ valor_venda: '123.45' }), 123.45);
    for (const value of [-1, NaN, Infinity, undefined]) assert.throws(() => valorFinalOrcamento({ valor_venda: value }), /inválido/);
});
