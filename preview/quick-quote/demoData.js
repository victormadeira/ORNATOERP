import { createQuickKitchenExample } from '../../src/quickQuote.js';

// Dados inteiramente fictícios, exclusivos da prévia. Não são preços de mercado,
// cadastros da Ornato ou parâmetros recomendados para a operação da empresa.
// As receitas seguem o formato do catálogo do ERP, sem importar/abrir seu banco.
const DEMO_NOTE = 'Cadastro fictício para demonstração; preço ilustrativo.';

const sheet = (id, cod, nome, espessura, preco, fita_preco) => ({
    id, cod, nome, tipo: 'material', unidade: 'chapa',
    descricao: DEMO_NOTE, categoria: 'MDF demonstrativo', ativo: 1,
    espessura, largura: 2750, altura: 1850,
    preco, perda_pct: 12, fita_preco,
});

const hardware = (id, cod, nome, categoria, preco, unidade = 'un') => ({
    id, cod, nome, tipo: 'ferragem', categoria, preco, unidade,
    descricao: DEMO_NOTE, ativo: 1,
});

function demoBox(db_id, nome, coef) {
    return {
        db_id, nome, tipo_item: 'caixa', cat: 'caixaria', coef,
        descricao: 'Receita de exemplo para estimativa, sujeita à revisão técnica.',
        dimsAplicaveis: ['L', 'A', 'P'],
        pecas: [
            { id: 'le', nome: 'Lateral esquerda', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'ld', nome: 'Lateral direita', qtd: 1, calc: 'A*P', mat: 'int', fita: ['f'] },
            { id: 'tp', nome: 'Topo', qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] },
            { id: 'bs', nome: 'Base', qtd: 1, calc: 'Li*P', mat: 'int', fita: ['f'] },
            { id: 'fn', nome: 'Fundo', qtd: 1, calc: 'Li*Ai', mat: 'fundo', fita: [] },
        ],
        tamponamentos: [],
        sub_itens: [],
    };
}

function demoComponents() {
    return [
        {
            db_id: 910010, nome: 'Porta', tipo_item: 'componente', cat: 'componente', coef: 0.15,
            dimsAplicaveis: ['L'],
            vars: [
                { id: 'nPortas', label: 'Número de portas', default: 2, min: 1, max: 8, unit: 'un' },
                { id: 'Ap', label: 'Altura da porta', default: 0, min: 100, max: 3000, unit: 'mm' },
            ],
            varsDeriv: { Lp: 'Li/nPortas', Ap: 'A' },
            pecas: [],
            frente_externa: { ativa: true, id: 'porta', nome: 'Porta', calc: 'Lp*Ap', mat: 'ext_comp', fita: ['all'] },
            sub_itens: [
                { id: 'dob110', nome: 'Dobradiça 110°', ferrId: 'demo_dob110_soft', defaultOn: true, qtdFormula: 'nPortas*(Ap<=900?2:Ap<=1600?3:4)' },
                { id: 'puxador', nome: 'Puxador', ferrId: 'demo_pux128', defaultOn: true, qtdFormula: 'nPortas' },
            ],
        },
        {
            db_id: 910011, nome: 'Gaveta', tipo_item: 'componente', cat: 'componente', coef: 0.20,
            dimsAplicaveis: ['L', 'P'],
            vars: [{ id: 'ag', label: 'Altura da caixa da gaveta', default: 150, min: 60, max: 400, unit: 'mm' }],
            varsDeriv: { Lg: 'Li', Pg: 'P-50' },
            pecas: [
                { id: 'lat_e', nome: 'Lateral esquerda', qtd: 1, calc: 'Pg*ag', mat: 'int', fita: ['t', 'b', 'f'] },
                { id: 'lat_d', nome: 'Lateral direita', qtd: 1, calc: 'Pg*ag', mat: 'int', fita: ['t', 'b', 'f'] },
                { id: 'base', nome: 'Traseira', qtd: 1, calc: 'Lg*ag', mat: 'int', fita: [] },
                { id: 'fnd', nome: 'Fundo', qtd: 1, calc: 'Lg*Pg', mat: 'fundo', fita: [] },
                { id: 'fi', nome: 'Frente interna', qtd: 1, calc: 'Lg*ag', mat: 'int', fita: ['all'] },
            ],
            frente_externa: { ativa: true, id: 'fe', nome: 'Frente externa', calc: 'Lg*ag', mat: 'ext_comp', fita: ['all'] },
            sub_itens: [
                { id: 'corrNorm', nome: 'Corrediça telescópica', ferrId: 'demo_corr500', defaultOn: true, qtdFormula: '1' },
                { id: 'corrOculta', nome: 'Corrediça oculta', ferrId: 'demo_corr500_soft', defaultOn: false, qtdFormula: '1' },
                { id: 'puxador', nome: 'Puxador', ferrId: 'demo_pux128', defaultOn: true, qtdFormula: '1' },
            ],
        },
        {
            db_id: 910012, nome: 'Prateleira', tipo_item: 'componente', cat: 'componente', coef: 0.05,
            dimsAplicaveis: ['L', 'P'], vars: [],
            varsDeriv: { Lpr: 'Li', Ppr: 'Pi' },
            pecas: [{ id: 'prat', nome: 'Prateleira', qtd: 1, calc: 'Lpr*Ppr', mat: 'int', fita: ['f'] }],
            frente_externa: { ativa: false },
            sub_itens: [{ id: 'suporte', nome: 'Suporte de prateleira', ferrId: 'demo_suporte', defaultOn: true, qtdFormula: '4' }],
        },
    ];
}

// Cada chamada devolve objetos novos para que editar/restaurar uma demonstração
// não altere o catálogo nem o rascunho inicial de outra instância.
export function createDemoSetup() {
    const clientes = [{ id: 910001, nome: 'Cliente de demonstração' }];
    const caixas = [
        demoBox(910001, 'Caixa Baixa / Balcão', 0.30),
        demoBox(910002, 'Caixa Aérea', 0.25),
    ];
    const componentes = demoComponents();
    const bibItems = [
        sheet(920001, 'demo_mdf_branco18', 'MDF branco · 18 mm (demo)', 18, 325, 1.80),
        sheet(920002, 'demo_mdf_branco15', 'MDF branco · 15 mm (demo)', 15, 295, 1.80),
        sheet(920003, 'demo_mdf_freijo18', 'MDF freijó · 18 mm (demo)', 18, 485, 2.50),
        sheet(920004, 'demo_mdf_grafite18', 'MDF grafite · 18 mm (demo)', 18, 450, 2.30),
        sheet(920005, 'demo_mdf_fundo6', 'MDF branco para fundo · 6 mm (demo)', 6, 165, 1.50),
        { id: 920006, cod: 'demo_fita22', nome: 'Fita de borda · 22 mm (demo)', tipo: 'material', unidade: 'm', preco: 1.80, descricao: DEMO_NOTE, ativo: 1 },
        hardware(930001, 'demo_dob110', 'Dobradiça 110° simples (demo)', 'dobradiça', 8.20),
        hardware(930002, 'demo_dob110_soft', 'Dobradiça 110° com amortecimento (demo)', 'dobradiça', 12.50),
        hardware(930003, 'demo_corr500', 'Corrediça telescópica · 500 mm (demo)', 'corrediça', 55, 'par'),
        hardware(930004, 'demo_corr500_soft', 'Corrediça oculta com amortecimento · 500 mm (demo)', 'corrediça', 120, 'par'),
        hardware(930005, 'demo_pux128', 'Puxador · 128 mm (demo)', 'puxador', 18),
        hardware(930006, 'demo_suporte', 'Suporte de prateleira (demo)', 'suporte', 1.50),
        { id: 940001, cod: 'demo_acab_pintura', nome: 'Pintura fosca por m² (demo)', tipo: 'acabamento', unidade: 'm²', preco: 150, preco_m2: 150, descricao: DEMO_NOTE, ativo: 1 },
    ];

    // Percentuais e multiplicadores apenas demonstram a fórmula já usada no
    // ERP. O campo "lucro" é parâmetro de formação de preço, não margem apurada.
    const taxas = {
        imp: 8, com: 5, lucro: 15, inst: 8, frete: 3,
        mk_chapas: 1.35, mk_fita: 1.35, mk_acabamentos: 1.30,
        mk_ferragens: 1.15, mk_acessorios: 1.20, mk_mdo: 0.65,
        custo_hora_ativo: false, consumiveis_ativo: false,
    };
    const padroes = { dobradica: 'demo_dob110_soft', corredica: 'demo_corr500', puxador: 'demo_pux128' };
    const materials = { matInt: 'demo_mdf_branco18', matFrente: 'demo_mdf_freijo18', matFundo: 'demo_mdf_fundo6' };
    let sequence = 0;
    const ambiente = createQuickKitchenExample({ caixas, componentes }, materials, {
        id: 'demo-cozinha', nome: 'Cozinha', idFactory: () => `demo-item-${++sequence}`,
    });
    const initialDraft = {
        clienteId: clientes[0].id,
        projeto: 'Cozinha de exemplo',
        ambientes: [ambiente],
        materials: { ...materials },
        taxas: { ...taxas },
        padroes: { ...padroes },
        pagamento: { desconto: { tipo: '%', valor: 0 }, blocos: [] },
        obs: 'Demonstração com cadastros e valores fictícios. Composição estimativa de marcenaria; bancada, cuba, eletrodomésticos e serviços de outras especialidades não estão incluídos.',
    };
    return { clientes, caixas, componentes, bibItems, taxas, padroes, initialDraft };
}
