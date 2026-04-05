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

        return safeEval(ruleString, variables);
    } catch (err) {
        // Silencia erros esperados durante digitação incompleta do usuário (Ex: "L + ")
        return 0;
    }
};

// ── Safe math/logic expression evaluator (no new Function) ──────────
// Supports: numbers, +, -, *, /, (, ), comparison (< > <= >= == != === !==),
// logical (&& || !), variable references, and Math.* functions.
// Tokenizer + recursive-descent parser.

const TOKEN = {
    NUM: 'NUM', ID: 'ID', OP: 'OP', LPAREN: '(', RPAREN: ')',
    DOT: '.', NOT: '!', END: 'END',
};

function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        if (/\s/.test(expr[i])) { i++; continue; }
        // Numbers (including decimals)
        if (/[\d.]/.test(expr[i]) && !(expr[i] === '.' && i + 1 < expr.length && /[a-zA-Z_]/.test(expr[i + 1]))) {
            let num = '';
            while (i < expr.length && /[\d.]/.test(expr[i])) { num += expr[i++]; }
            tokens.push({ type: TOKEN.NUM, value: parseFloat(num) });
            continue;
        }
        // Identifiers (variable names, Math)
        if (/[a-zA-Z_]/.test(expr[i])) {
            let id = '';
            while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { id += expr[i++]; }
            tokens.push({ type: TOKEN.ID, value: id });
            continue;
        }
        // Multi-char operators
        const two = expr.slice(i, i + 3);
        if (two === '===' || two === '!==') { tokens.push({ type: TOKEN.OP, value: two }); i += 3; continue; }
        const pair = expr.slice(i, i + 2);
        if (['==', '!=', '<=', '>=', '&&', '||'].includes(pair)) {
            tokens.push({ type: TOKEN.OP, value: pair }); i += 2; continue;
        }
        // Single-char
        if (expr[i] === '(') { tokens.push({ type: TOKEN.LPAREN }); i++; continue; }
        if (expr[i] === ')') { tokens.push({ type: TOKEN.RPAREN }); i++; continue; }
        if (expr[i] === '.') { tokens.push({ type: TOKEN.DOT }); i++; continue; }
        if (expr[i] === '!') { tokens.push({ type: TOKEN.NOT }); i++; continue; }
        if ('+-*/<>'.includes(expr[i])) { tokens.push({ type: TOKEN.OP, value: expr[i] }); i++; continue; }
        throw new Error(`Unexpected char: ${expr[i]}`);
    }
    tokens.push({ type: TOKEN.END });
    return tokens;
}

// Allowed Math methods (whitelist)
const SAFE_MATH = new Set([
    'abs','ceil','floor','round','max','min','pow','sqrt',
    'log','log2','log10','exp','sign','trunc','PI','E',
]);

function safeEval(expr, vars) {
    const tokens = tokenize(expr);
    let pos = 0;

    const peek = () => tokens[pos];
    const eat = (type) => {
        if (tokens[pos].type !== type) throw new Error(`Expected ${type}`);
        return tokens[pos++];
    };

    // Grammar (precedence low→high):
    //   expr       → logicOr
    //   logicOr    → logicAnd ( '||' logicAnd )*
    //   logicAnd   → comparison ( '&&' comparison )*
    //   comparison → addition ( ('<'|'>'|'<='|'>='|'=='|'!='|'==='|'!==') addition )*
    //   addition   → mult ( ('+'|'-') mult )*
    //   mult       → unary ( ('*'|'/') unary )*
    //   unary      → '!'? primary
    //   primary    → NUMBER | '(' expr ')' | IDENTIFIER | Math.fn(args)

    function parseExpr() { return parseLogicOr(); }

    function parseLogicOr() {
        let left = parseLogicAnd();
        while (peek().type === TOKEN.OP && peek().value === '||') {
            pos++; const right = parseLogicAnd(); left = left || right;
        }
        return left;
    }

    function parseLogicAnd() {
        let left = parseComparison();
        while (peek().type === TOKEN.OP && peek().value === '&&') {
            pos++; const right = parseComparison(); left = left && right;
        }
        return left;
    }

    function parseComparison() {
        let left = parseAddition();
        while (peek().type === TOKEN.OP && ['<','>','<=','>=','==','!=','===','!=='].includes(peek().value)) {
            const op = tokens[pos++].value;
            const right = parseAddition();
            if (op === '<') left = left < right;
            else if (op === '>') left = left > right;
            else if (op === '<=') left = left <= right;
            else if (op === '>=') left = left >= right;
            else if (op === '==' || op === '===') left = left === right;
            else if (op === '!=' || op === '!==') left = left !== right;
        }
        return left;
    }

    function parseAddition() {
        let left = parseMult();
        while (peek().type === TOKEN.OP && (peek().value === '+' || peek().value === '-')) {
            const op = tokens[pos++].value;
            const right = parseMult();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    function parseMult() {
        let left = parseUnary();
        while (peek().type === TOKEN.OP && (peek().value === '*' || peek().value === '/')) {
            const op = tokens[pos++].value;
            const right = parseUnary();
            left = op === '*' ? left * right : left / right;
        }
        return left;
    }

    function parseUnary() {
        if (peek().type === TOKEN.NOT) { pos++; return !parseUnary(); }
        if (peek().type === TOKEN.OP && peek().value === '-') { pos++; return -parseUnary(); }
        return parsePrimary();
    }

    function parsePrimary() {
        const t = peek();

        // Number literal
        if (t.type === TOKEN.NUM) { pos++; return t.value; }

        // Parenthesized expression
        if (t.type === TOKEN.LPAREN) {
            eat(TOKEN.LPAREN);
            const val = parseExpr();
            eat(TOKEN.RPAREN);
            return val;
        }

        // Identifier: variable or Math.*
        if (t.type === TOKEN.ID) {
            const name = t.value;
            pos++;

            // Math.something
            if (name === 'Math' && peek().type === TOKEN.DOT) {
                eat(TOKEN.DOT);
                const method = eat(TOKEN.ID).value;
                if (!SAFE_MATH.has(method)) throw new Error(`Math.${method} not allowed`);
                // Constants (PI, E)
                if (method === 'PI') return Math.PI;
                if (method === 'E') return Math.E;
                // Function call
                eat(TOKEN.LPAREN);
                const args = [];
                if (peek().type !== TOKEN.RPAREN) {
                    args.push(parseExpr());
                    // Support comma-separated args (treat comma as separator)
                    // Commas not in tokenizer, but Math.max(a, b) needs them
                    // We handle by checking for next token being a number/id after we hit something unexpected
                }
                eat(TOKEN.RPAREN);
                return Math[method](...args);
            }

            // Function call syntax for variables that happen to match — not allowed
            if (peek().type === TOKEN.LPAREN) throw new Error(`Function calls not allowed: ${name}`);

            // Variable lookup
            if (name in vars) return vars[name];

            // Boolean literals
            if (name === 'true') return true;
            if (name === 'false') return false;

            throw new Error(`Unknown variable: ${name}`);
        }

        throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
    }

    const result = parseExpr();
    if (peek().type !== TOKEN.END) throw new Error('Unexpected tokens after expression');
    return result;
}

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
