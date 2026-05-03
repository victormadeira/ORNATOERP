import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// JWT_SECRET: em produção exige env var; em dev cai no fallback persistente.
const JWT_SECRET = (() => {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') {
        // Falha rápida — secret inconsistente entre workers (PM2 cluster) ou
        // commitado por engano são riscos reais em produção.
        throw new Error('JWT_SECRET é obrigatório em produção. Defina em .env antes de iniciar o servidor.');
    }
    // Dev: persistir em arquivo para não invalidar tokens a cada restart
    const __dir = dirname(fileURLToPath(import.meta.url));
    const secretPath = join(__dir, '.jwt_secret');
    try {
        if (existsSync(secretPath)) return readFileSync(secretPath, 'utf-8').trim();
    } catch (_) {}
    const secret = randomBytes(48).toString('base64');
    try { writeFileSync(secretPath, secret, { mode: 0o600 }); } catch (_) {}
    console.warn('⚠️  JWT_SECRET gerado em .jwt_secret (dev). Defina JWT_SECRET em produção.');
    return secret;
})();
const JWT_EXPIRY = '24h';

// ═══════════════════════════════════════════════════════
// GERAR TOKEN
// ═══════════════════════════════════════════════════════
export function signToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            nome: user.nome,
            empresa_id: user.empresa_id || 1,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

// ═══════════════════════════════════════════════════════
// MULTI-TENANT — helpers
// ═══════════════════════════════════════════════════════

/**
 * Retorna o empresa_id do usuário logado (1 se não definido — compatibilidade legada).
 * Uso: const { empresa_id } = tenantOf(req);
 */
export function tenantOf(req) {
    return { empresa_id: req.user?.empresa_id || 1 };
}

/**
 * Middleware — garante que o usuário pertence à empresa informada no path ou body.
 * Uso em rotas que precisam de isolamento estrito:
 *   router.get('/:empresa_id/dados', requireAuth, requireSameTenant, handler)
 */
export function requireSameTenant(req, res, next) {
    const requestedId = parseInt(req.params.empresa_id || req.body?.empresa_id || 0);
    const userEmpresaId = req.user?.empresa_id || 1;
    // Super-admins passam sempre; outros só se empresa_id bater
    if (req.user?.is_super_admin) return next();
    if (requestedId && requestedId !== userEmpresaId) {
        return res.status(403).json({ error: 'Acesso negado: empresa incompatível' });
    }
    next();
}

// ═══════════════════════════════════════════════════════
// MIDDLEWARE — Requer autenticação
// ═══════════════════════════════════════════════════════
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    // Fallback: token no body (multipart uploads onde proxy pode remover header)
    const tokenStr = (header && header.startsWith('Bearer '))
        ? header.split(' ')[1]
        : req.body?._token || null;

    if (!tokenStr) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    try {
        const decoded = jwt.verify(tokenStr, JWT_SECRET);
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

// ═══════════════════════════════════════════════════════
// MIDDLEWARE — Auth opcional (não bloqueia, só seta req.user se válido)
// ═══════════════════════════════════════════════════════
export function optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        try {
            req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
        } catch (_) { /* token inválido, segue sem user */ }
    }
    next();
}

// Verifica token e retorna payload — usado fora do middleware (ex: WebSocket)
export function verifyToken(token) {
    try { return jwt.verify(token, JWT_SECRET); } catch (_) { return null; }
}

// Helpers
export function isAdmin(user) { return user.role === 'admin'; }
export function isGerente(user) { return user.role === 'gerente' || user.role === 'admin'; }
export function canSeeAll(user) { return user.role === 'admin' || user.role === 'gerente'; }

// ═══════════════════════════════════════════════════════
// Inbox — quem pode ver uma conversa?
// Regra: gerente/admin veem tudo; vendedor vê só as atribuídas a ele
//        OU as não atribuídas (pra ninguém perder conversa nova).
// ═══════════════════════════════════════════════════════
export function canAccessConversa(user, conversa) {
    if (!user || !conversa) return false;
    if (canSeeAll(user)) return true;
    // Atribuída a ele
    if (Number(conversa.atribuido_user_id) === Number(user.id)) return true;
    // Não atribuída (ninguém ainda pegou) — vendedor pode ver e puxar
    if (!conversa.atribuido_user_id) return true;
    return false;
}

/**
 * Middleware — carrega a conversa e valida permissão.
 * Usa db passado pelo caller pra evitar import circular.
 * Espera req.params.id com o ID da conversa. Seta req.conversa.
 */
export function requireConversaAccess(db) {
    return (req, res, next) => {
        const id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID inválido' });
        const conv = db.prepare('SELECT * FROM chat_conversas WHERE id = ?').get(id);
        if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
        if (!canAccessConversa(req.user, conv)) {
            return res.status(403).json({ error: 'Sem permissão para acessar esta conversa' });
        }
        req.conversa = conv;
        next();
    };
}
