import api from './api.js';
import { applyQuoteDiscount, buildQuoteLibrary, calculateQuote } from './quoteCalculator.js';

// Both the authenticated page and its isolated preview persist this contract.
// Totals are recalculated from the composition, never copied from a UI label.
export function buildQuickQuotePayload(draft, setup) {
    const clienteId = Number(draft.clienteId);
    const cliente = (setup.clientes || []).find(c => Number(c.id) === clienteId);
    if (!cliente) throw new Error('Selecione um cliente cadastrado para salvar.');
    if (!String(draft.projeto || '').trim()) throw new Error('Informe o nome do projeto.');
    const ambientes = draft.ambientes || [];
    const hasItems = ambientes.some(amb => (amb.itens || []).length || (amb.itensEspeciais || []).length || (amb.linhas || []).length);
    if (!hasItems) throw new Error('Adicione pelo menos um móvel ou complemento.');

    const bibItems = setup.bibItems || [];
    const taxas = draft.taxas || setup.taxas || {};
    const padroes = draft.padroes || {};
    const totals = calculateQuote({ ambientes, taxas, padroes, bibItems, bib: buildQuoteLibrary(bibItems), strictCatalog: true });
    if (!totals.valid || totals.pvErro || !Number.isFinite(totals.pvFinal)) {
        throw new Error(totals.errors?.[0]?.message || totals.pvMsg || 'Revise as pendências do orçamento.');
    }
    const pagamento = draft.pagamento || { desconto: { tipo: '%', valor: 0 }, blocos: [] };
    const discounted = applyQuoteDiscount(totals.pvFinal, pagamento.desconto);
    if (!discounted.valid) throw new Error(discounted.errors?.[0]?.message || 'Revise o desconto.');

    return {
        cliente_id: clienteId,
        cliente_nome: cliente.nome,
        projeto: draft.projeto.trim(),
        ambientes: JSON.parse(JSON.stringify(ambientes)),
        taxas: { ...taxas },
        padroes: { ...padroes },
        pagamento: JSON.parse(JSON.stringify(pagamento)),
        obs: String(draft.obs || ''),
        custo_material: totals.cm,
        // Canonical ERP value: the negotiated amount after the discount.
        valor_venda: discounted.pvComDesconto,
        prazo_entrega: draft.prazoEntrega || '',
        endereco_obra: draft.enderecoObra || '',
        validade_dias: 15,
    };
}

export function createErpQuickQuoteAdapter(client = api) {
    let setup = null;
    return {
        mode: 'erp',
        async loadSetup() {
            const [clientes, caixas, componentes, bibItems, taxas] = await Promise.all([
                client.get('/clientes'),
                client.get('/catalogo?tipo=caixa'),
                client.get('/catalogo?tipo=componente'),
                client.get('/biblioteca'),
                client.get('/config/taxas'),
            ]);
            if (![clientes, caixas, componentes, bibItems].every(Array.isArray)) {
                throw new Error('Não foi possível carregar os cadastros do ERP. Tente novamente.');
            }
            setup = { clientes, caixas, componentes, bibItems, taxas, padroes: {} };
            return setup;
        },
        async saveQuote(draft) {
            if (!setup) throw new Error('Aguarde o carregamento dos cadastros.');
            const payload = buildQuickQuotePayload(draft, setup);
            if (draft.id != null) {
                const id = Number(draft.id);
                if (!Number.isInteger(id) || id <= 0) throw new Error('Orçamento inválido.');
                return client.put(`/orcamentos/${id}`, payload);
            }
            // POST is not retried: a lost response must not create a duplicate.
            return client.post('/orcamentos', { ...payload, status: 'rascunho' }, { retries: 0 });
        },
    };
}

export const erpQuickQuoteAdapter = createErpQuickQuoteAdapter();
