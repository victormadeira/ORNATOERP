import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { signToken, requireAuth, requireRole, isAdmin } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════
router.post('/login', (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (!user.ativo) return res.status(401).json({ error: 'Usuário desativado' });

    const valid = bcrypt.compareSync(senha, user.senha_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    // Registra último acesso
    db.prepare('UPDATE users SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const token = signToken(user);
    res.json({
        token,
        user: { id: user.id, nome: user.nome, email: user.email, role: user.role, permissions: user.permissions || null }
    });
});

// ═══════════════════════════════════════════════════════
// POST /api/auth/register — somente admin
// ═══════════════════════════════════════════════════════
router.post('/register', requireAuth, requireRole('admin'), (req, res) => {
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
    const hash = bcrypt.hashSync(senha, 10);

    const result = db.prepare('INSERT INTO users (nome, email, senha_hash, role) VALUES (?, ?, ?, ?)').run(nome, email, hash, r);
    res.status(201).json({ id: result.lastInsertRowid, nome, email, role: r });
});

// ═══════════════════════════════════════════════════════
// GET /api/auth/me — dados do usuário logado
// ═══════════════════════════════════════════════════════
router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT id, nome, email, role, ativo, criado_em, permissions, ultimo_acesso FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(user);
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

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const user = db.prepare('SELECT id, nome, email, role, ativo, criado_em, permissions, ultimo_acesso FROM users WHERE id = ?').get(id);
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

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Soft delete — desativa ao invés de remover para preservar dados vinculados
    db.prepare('UPDATE users SET ativo = 0, email = email || \'_deleted_\' || id WHERE id = ?').run(id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// PUT /api/auth/password — alterar própria senha
// ═══════════════════════════════════════════════════════
router.put('/password', requireAuth, (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    if (!senhaAtual || !novaSenha) return res.status(400).json({ error: 'Senhas obrigatórias' });
    if (novaSenha.length < 6) return res.status(400).json({ error: 'Nova senha deve ter no mínimo 6 caracteres' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(senhaAtual, user.senha_hash)) {
        return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hash = bcrypt.hashSync(novaSenha, 10);
    db.prepare('UPDATE users SET senha_hash = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ ok: true });
});

export default router;
