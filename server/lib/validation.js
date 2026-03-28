// ═══════════════════════════════════════════════════════
// Validação e helpers reutilizáveis
// ═══════════════════════════════════════════════════════

/**
 * Middleware: Valida que req.params contém IDs numéricos válidos.
 * Uso: router.get('/:id', validateId('id'), requireAuth, handler)
 */
export function validateId(...paramNames) {
    return (req, res, next) => {
        for (const name of paramNames) {
            const val = parseInt(req.params[name], 10);
            if (isNaN(val) || val <= 0) {
                return res.status(400).json({ error: `${name} inválido` });
            }
            req.params[name] = String(val); // normalizar
        }
        next();
    };
}

/**
 * Wrapper de handler que captura erros async automaticamente.
 * Uso: router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Validar campos obrigatórios no body.
 * Uso: const err = requireFields(req.body, ['nome', 'email']); if (err) return res.status(400).json(err);
 */
export function requireFields(body, fields) {
    const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
    if (missing.length > 0) {
        return { error: `Campos obrigatórios: ${missing.join(', ')}` };
    }
    return null;
}

/**
 * Sanitizar string — remove HTML tags e trim
 */
export function sanitize(str, maxLen = 1000) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

/**
 * Validar CPF brasileiro
 */
export function validarCPF(cpf) {
    const d = (cpf || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
    let c = 11 - (s % 11); if (c >= 10) c = 0;
    if (parseInt(d[9]) !== c) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
    c = 11 - (s % 11); if (c >= 10) c = 0;
    return parseInt(d[10]) === c;
}

/**
 * Validar CNPJ brasileiro
 */
export function validarCNPJ(cnpj) {
    const d = (cnpj || '').replace(/\D/g, '');
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
    const calc = (len) => {
        let s = 0, w = len === 12 ? 5 : 6;
        for (let i = 0; i < len; i++) { s += parseInt(d[i]) * w; w = w === 2 ? 9 : w - 1; }
        const r = s % 11;
        return r < 2 ? 0 : 11 - r;
    };
    return parseInt(d[12]) === calc(12) && parseInt(d[13]) === calc(13);
}
