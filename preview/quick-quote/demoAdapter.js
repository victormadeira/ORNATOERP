import { buildQuickQuotePayload } from '../../src/quickQuoteAdapter.js';
import { createDemoSetup } from './demoData.js';

export const DEMO_STORAGE_KEY = 'ornato-erp-quick-quote-v2';

// A prévia usa o mesmo contrato do ERP; somente o transporte é local.
export function createDemoQuickQuoteAdapter({ storage } = {}) {
    let setup;
    const getStorage = () => storage || globalThis.localStorage;
    return {
        mode: 'demo',
        async loadSetup() {
            setup = createDemoSetup();
            try {
                const saved = JSON.parse(getStorage()?.getItem(DEMO_STORAGE_KEY) || 'null');
                if (saved?.version === 1 && saved.draft?.ambientes?.length) {
                    setup.initialDraft = saved.draft;
                }
            } catch { /* Uma demonstração nova continua disponível sem armazenamento. */ }
            return setup;
        },
        async saveQuote(draft) {
            if (!setup) throw new Error('Aguarde o carregamento da demonstração.');
            const payload = buildQuickQuotePayload(draft, setup);
            const quote = { ...payload, id: draft.id || 1, numero: 'DEMO-001', status: 'rascunho' };
            try {
                const target = getStorage();
                if (!target) throw new Error('Armazenamento indisponível');
                target.setItem(DEMO_STORAGE_KEY, JSON.stringify({
                    version: 1,
                    draft: { ...draft, id: quote.id, numero: quote.numero },
                    quote,
                }));
            } catch {
                throw new Error('O navegador não permitiu salvar a demonstração. Os dados continuam nesta tela.');
            }
            return quote;
        },
    };
}
