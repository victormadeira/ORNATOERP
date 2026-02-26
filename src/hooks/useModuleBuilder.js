// ═══════════════════════════════════════════════════════
// MOTOR DE AVALIAÇÃO DINÂMICA (AST Wrapper)
// ═══════════════════════════════════════════════════════

/**
 * Avalia strings matemáticas e condicionais dentro de um ambiente isolado.
 * Segue o padrão Top-Down (Unidirecional):
 * Módulo Pai (L, A, P) -> Filhos (Gavetas, Portas)
 * 
 * @param {string} ruleString - Ex: "(L / 2) - 15" ou "A > 1600 && P <= 600"
 * @param {object} variables - Dicionário de variáveis globais. Ex: { L: 1000, A: 2200, P: 600 }
 * @returns {number|boolean|null}
 */
export const evalRule = (ruleString, variables) => {
    if (!ruleString || typeof ruleString !== 'string') return 0;

    try {
        // Sanitização contra XSS e injeção (Permite apenas vars matemáticas e lógicas básicas)
        if (/[^a-zA-Z0-9\s\+\-\*\/\(\)\.\<\>\=\!\&\|_]/.test(ruleString)) {
            console.warn("Caracteres não autorizados na regra matemática:", ruleString);
            return 0; // Fallback seguro
        }

        const keys = Object.keys(variables);
        const values = Object.values(variables);

        // Evita warnings do strict mode injetando as vars diretamente.
        const evaluator = new Function(...keys, `"use strict"; return (${ruleString});`);
        return evaluator(...values);
    } catch (err) {
        // Silencia erros esperados durante digitação incompleta do usuário (Ex: "L + ")
        return 0;
    }
};

// ═══════════════════════════════════════════════════════
// REDUCER - STATE MANAGEMENT PARA O BUILDER
// Arquitetura portada do sistema antigo (possuiPartes)
// ═══════════════════════════════════════════════════════

export const initialBuilderState = {
    id: `mod_${Date.now()}`,
    nome: "Novo Gabarito de Módulo",
    categoria: "caixaria",

    // Quais dimensões o projetista pode alterar no orçamento
    possuiDimensoes: {
        comprimento: true,    // L (largura/comprimento)
        altura: true,         // A
        profundidade: true    // P
    },

    // Engenharia Estrutural: Quais peças esse módulo possui
    possuiPartes: {
        topo: { tem: true, quantidade: 1 },
        base: { tem: true, quantidade: 1 },
        fundo: { tem: true, quantidade: 1 },
        laterais: { tem: true, quantidade: 2 },
        prateleiras: { tem: false, quantidade: 0 }
    },

    // Faces que recebem acabamento externo (tamponamento)
    facesExternas: {
        topo: false,
        base: true,
        lateralEsquerda: true,
        lateralDireita: true,
        frente: false,
        fundo: false
    },

    // Coeficiente de dificuldade de fabricação
    coeficienteDificuldade: 1.0,

    // Ferragens embutidas no gabarito (dobradiças, corrediças, etc)
    ferragens: [],

    // Sub-itens opcionais pré-definidos (portas, gavetas)
    sub_itens: []
};

export function builderReducer(state, action) {
    switch (action.type) {
        case 'SET_HEADER':
            return { ...state, [action.field]: action.value };

        // ── Dimensões Permitidas ──
        case 'TOGGLE_DIMENSAO':
            return {
                ...state,
                possuiDimensoes: {
                    ...state.possuiDimensoes,
                    [action.field]: !state.possuiDimensoes[action.field]
                }
            };

        // ── Peças Estruturais (possuiPartes) ──
        case 'TOGGLE_PARTE':
            return {
                ...state,
                possuiPartes: {
                    ...state.possuiPartes,
                    [action.parte]: {
                        ...state.possuiPartes[action.parte],
                        tem: !state.possuiPartes[action.parte].tem,
                        quantidade: !state.possuiPartes[action.parte].tem ? 1 : 0
                    }
                }
            };

        case 'UPDATE_PARTE_QTD':
            return {
                ...state,
                possuiPartes: {
                    ...state.possuiPartes,
                    [action.parte]: {
                        ...state.possuiPartes[action.parte],
                        quantidade: Number(action.value) || 0
                    }
                }
            };

        // ── Faces Externas (Tamponamento) ──
        case 'TOGGLE_FACE_EXTERNA':
            return {
                ...state,
                facesExternas: {
                    ...state.facesExternas,
                    [action.face]: !state.facesExternas[action.face]
                }
            };

        // ── Sub Itens (Portas, Gavetas, etc) ──
        case 'ADD_SUB_ITEM':
            return {
                ...state,
                sub_itens: [...state.sub_itens, {
                    id: `sub_${Date.now()}`,
                    categoria: action.categoria || "marcenaria",
                    nome: "Novo Componente",
                    qtd: 1,
                    formulas: { largura: "L", comprimento: "A" },
                    regras_ferragens: []
                }]
            };

        case 'UPDATE_SUB_ITEM':
            return {
                ...state,
                sub_itens: state.sub_itens.map(s =>
                    s.id === action.id ? { ...s, [action.field]: action.value } : s
                )
            };

        case 'UPDATE_SUB_ITEM_FORMULA':
            return {
                ...state,
                sub_itens: state.sub_itens.map(s =>
                    s.id === action.id ? {
                        ...s,
                        formulas: { ...s.formulas, [action.dimension]: action.value }
                    } : s
                )
            };

        case 'REMOVE_SUB_ITEM':
            return { ...state, sub_itens: state.sub_itens.filter(s => s.id !== action.id) };

        case 'ADD_REGRA_FERRAGEM':
            return {
                ...state,
                sub_itens: state.sub_itens.map(s => {
                    if (s.id !== action.subItemId) return s;
                    return {
                        ...s,
                        regras_ferragens: [...s.regras_ferragens, {
                            id: `rf_${Date.now()}`,
                            condicao: "L > 0",
                            ferragem_id: "dob110",
                            resultado_qtd: 1
                        }]
                    };
                })
            };

        case 'UPDATE_REGRA_FERRAGEM':
            return {
                ...state,
                sub_itens: state.sub_itens.map(s => {
                    if (s.id !== action.subItemId) return s;
                    return {
                        ...s,
                        regras_ferragens: s.regras_ferragens.map(rf =>
                            rf.id === action.ruleId ? { ...rf, [action.field]: action.value } : rf
                        )
                    };
                })
            };

        case 'REMOVE_REGRA_FERRAGEM':
            return {
                ...state,
                sub_itens: state.sub_itens.map(s => {
                    if (s.id !== action.subItemId) return s;
                    return {
                        ...s,
                        regras_ferragens: s.regras_ferragens.filter(rf => rf.id !== action.ruleId)
                    };
                })
            };

        case 'LOAD_MOCK_HIBRIDO':
            return action.mockState;

        default:
            return state;
    }
}
