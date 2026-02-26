import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'marcenaria-erp-secret-2024-change-in-prod';
const JWT_EXPIRY = '24h';

// ═══════════════════════════════════════════════════════
// GERAR TOKEN
// ═══════════════════════════════════════════════════════
export function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, nome: user.nome },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

// ═══════════════════════════════════════════════════════
// MIDDLEWARE — Requer autenticação
// ═══════════════════════════════════════════════════════
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    try {
        const token = header.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (_) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

// ═══════════════════════════════════════════════════════
// MIDDLEWARE — Requer role específica
// ═══════════════════════════════════════════════════════
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Sem permissão para esta ação' });
        }
        next();
    };
}

// Helpers
export function isAdmin(user) { return user.role === 'admin'; }
export function isGerente(user) { return user.role === 'gerente' || user.role === 'admin'; }
export function canSeeAll(user) { return user.role === 'admin' || user.role === 'gerente'; }
