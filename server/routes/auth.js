import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken, requireAuth, requireRole, isAdmin, tenantOf } from '../auth.js';
import { audit } from './gestao-avancada.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════
// Hash "fantasma" usado quando o email não existe — evita timing attack
// (sem isso, login de email inexistente retorna em 0ms, email existente em 70ms+).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-resistance', 10);

router.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    // Normaliza e limita payload (defesa contra DoS via senha longa — bcrypt é caro)
    if (typeof email !== 'string' || typeof senha !== 'string') return res.status(400).json({ error: 'Payload inválido' });
    if (senha.length > 256) return res.status(400).json({ error: 'Credenciais inválidas' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    // Sempre roda bcrypt (mesmo sem user) pra normalizar tempo de resposta e não vazar existência de email.
    // compare async — não bloqueia event loop sob logins concorrentes.
    const hashToCheck = user ? user.senha_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(senha, hashToCheck);
    if (!user || !valid) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (!user.ativo) return res.status(401).json({ error: 'Usuário desativado' });

    // Registra último acesso
    db.prepare('UPDATE users SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const token = signToken(user);
    res.json({
        token,
        user: {
            id: user.id,
            nome: user.nome,
            email: user.email,
            role: user.role,
            permissions: user.permissions || null,
            empresa_id: user.empresa_id || 1,
        }
    });
});

// ═══════════════════════════════════════════════════════
// POST /api/auth/register — somente admin
// ═══════════════════════════════════════════════════════
router.post('/register', requireAuth, requireRole('admin'), async (req, res) => {
    const { nome, email, senha, role } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, email e senha obrigatórios' });

    // Validação de email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Formato de e-mail inválido' });

    // Validação de senha
    if (senha.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    if (senha.length > 128) return res.status(400).json({ error: 'Senha muito longa' });

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) return res.status(409).json({ error: 'Email já cadastrado' });

    const validRoles = ['admin', 'gerente', 'vendedor'];
    const r = validRoles.includes(role) ? role : 'vendedor';
    const hash = await bcrypt.hash(senha, 12);

    // Herda empresa do admin que criou (ou empresa 1 como fallback)
    const empresa_id = req.user?.empresa_id || 1;
    const result = db.prepare('INSERT INTO users (nome, email, senha_hash, role, empresa_id) VALUES (?, ?, ?, ?, ?)').run(nome, email, hash, r, empresa_id);
    res.status(201).json({ id: result.lastInsertRowid, nome, email, role: r, empresa_id });
});

// ═══════════════════════════════════════════════════════
// GET /api/auth/me — dados do usuário logado
// ═══════════════════════════════════════════════════════
router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT id, nome, email, role, ativo, criado_em, permissions, ultimo_acesso, empresa_id FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ...user, empresa_id: user.empresa_id || 1 });
});

// ═══════════════════════════════════════════════════════
// GET /api/auth/users — listar todos (admin)
// ═══════════════════════════════════════════════════════
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
    const users = db.prepare('SELECT id, nome, email, role, ativo, criado_em, permissions, ultimo_acesso FROM users ORDER BY criado_em DESC').all();
    res.json(users);
});

// ═══════════════════════════════════════════════════════
// PUT /api/auth/users/:id — editar role/status/permissions (admin)
// ═══════════════════════════════════════════════════════
router.put('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
    const { role, ativo, nome, permissions } = req.body;
    const id = parseInt(req.params.id);

    // Não permite desativar a si mesmo
    if (id === req.user.id && ativo === 0) {
        return res.status(400).json({ error: 'Não é possível desativar sua própria conta' });
    }

    const updates = [];
    const params = [];
    if (role !== undefined) {
        const validRoles = ['admin', 'gerente', 'vendedor'];
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'Role inválido' });
        updates.push('role = ?'); params.push(role);
    }
    if (ativo !== undefined) { updates.push('ativo = ?'); params.push(ativo); }
    if (nome !== undefined) { updates.push('nome = ?'); params.push(nome); }
    if (permissions !== undefined) {
        // aceita array ou null; serializa como JSON string ou NULL
        const pVal = permissions === null ? null : JSON.stringify(permissions);
        updates.push('permissions = ?');
        params.push(pVal);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    params.push(id);

    const before = db.prepare('SELECT id, nome, email, role, ativo, permissions FROM users WHERE id = ?').get(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const user = db.prepare('SELECT id, nome, email, role, ativo, criado_em, permissions, ultimo_acesso FROM users WHERE id = ?').get(id);
    audit(req, 'update', 'user', id,
        { role: before?.role, ativo: before?.ativo, nome: before?.nome, permissions: before?.permissions },
        { role: user.role, ativo: user.ativo, nome: user.nome, permissions: user.permissions });
    res.json(user);
});

// ═══════════════════════════════════════════════════════
// DELETE /api/auth/users/:id — remover usuário (admin)
// ═══════════════════════════════════════════════════════
router.delete('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
    const id = parseInt(req.params.id);

    if (id === req.user.id) {
        return res.status(400).json({ error: 'Não é possível deletar sua própria conta' });
    }

    const user = db.prepare('SELECT id, nome, email, role FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Soft delete — desativa ao invés de remover para preservar dados vinculados
    db.prepare('UPDATE users SET ativo = 0, email = email || \'_deleted_\' || id WHERE id = ?').run(id);
    audit(req, 'delete', 'user', id, { nome: user.nome, email: user.email, role: user.role }, null);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// PUT /api/auth/perfil — atualizar próprio nome/email
// ═══════════════════════════════════════════════════════
router.put('/perfil', requireAuth, (req, res) => {
    const { nome, email } = req.body;
    if (!nome || !email) return res.status(400).json({ error: 'Nome e email obrigatórios' });
    if (nome.length < 2) return res.status(400).json({ error: 'Nome deve ter no mínimo 2 caracteres' });

    // Verificar se email já existe em outro usuário
    const existe = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
    if (existe) return res.status(400).json({ error: 'Este email já está em uso por outro usuário' });

    db.prepare('UPDATE users SET nome = ?, email = ? WHERE id = ?').run(nome.trim(), email.trim().toLowerCase(), req.user.id);

    const updated = db.prepare('SELECT id, nome, email, role, permissions FROM users WHERE id = ?').get(req.user.id);
    res.json(updated);
});

// ═══════════════════════════════════════════════════════
// PUT /api/auth/password — alterar própria senha
// ═══════════════════════════════════════════════════════
router.put('/password', requireAuth, async (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) return res.status(400).json({ error: 'Senhas obrigatórias' });
    if (novaSenha.length < 6) return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!(await bcrypt.compare(senhaAtual, user.senha_hash))) {
        return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hash = await bcrypt.hash(novaSenha, 12); // custo 12, igual ao registro
    db.prepare('UPDATE users SET senha_hash = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GET /api/auth/empresa — dados da empresa do usuário logado
// ═══════════════════════════════════════════════════════
router.get('/empresa', requireAuth, (req, res) => {
    const { empresa_id } = tenantOf(req);
    const empresa = db.prepare('SELECT id, slug, nome, plano, max_usuarios, ativo FROM empresas WHERE id = ?').get(empresa_id);
    if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });
    // Conta usuários ativos na empresa
    const { total_usuarios } = db.prepare('SELECT COUNT(*) as total_usuarios FROM users WHERE empresa_id = ? AND ativo = 1').get(empresa_id);
    res.json({ ...empresa, total_usuarios });
});

// ═══════════════════════════════════════════════════════
// GET /api/auth/empresas — listar todas (super-admin)
// ═══════════════════════════════════════════════════════
router.get('/empresas', requireAuth, (req, res) => {
    if (!req.user.is_super_admin) return res.status(403).json({ error: 'Apenas super-admins' });
    const empresas = db.prepare(`
        SELECT e.id, e.slug, e.nome, e.plano, e.ativo, e.max_usuarios, e.criado_em,
               COUNT(u.id) as total_usuarios
        FROM empresas e
        LEFT JOIN users u ON u.empresa_id = e.id AND u.ativo = 1
        GROUP BY e.id
        ORDER BY e.criado_em DESC
    `).all();
    res.json(empresas);
});

export default router;
