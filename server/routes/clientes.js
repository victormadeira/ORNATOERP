import { Router } from 'express';
import db from '../db.js';
import { requireAuth, canSeeAll } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════
// GET /api/clientes
// ═══════════════════════════════════════════════════════
router.get('/', requireAuth, (req, res) => {
    const sql = canSeeAll(req.user)
        ? 'SELECT c.*, u.nome as criado_por FROM clientes c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.nome'
        : 'SELECT c.*, u.nome as criado_por FROM clientes c LEFT JOIN users u ON c.user_id = u.id WHERE c.user_id = ? ORDER BY c.nome';
    const params = canSeeAll(req.user) ? [] : [req.user.id];
    res.json(db.prepare(sql).all(...params));
});

// ═══════════════════════════════════════════════════════
// GET /api/clientes/:id
// ═══════════════════════════════════════════════════════
router.get('/:id', requireAuth, (req, res) => {
    const cli = db.prepare('SELECT * FROM clientes WHERE id = ?').get(parseInt(req.params.id));
    if (!cli) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(cli);
});

// ═══════════════════════════════════════════════════════
// POST /api/clientes
// ═══════════════════════════════════════════════════════
router.post('/', requireAuth, (req, res) => {
    const {
        nome, tel, email, arq, cidade,
        tipo_pessoa, cpf, cnpj, cep, endereco,
        numero, complemento, bairro, estado, obs
    } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });

    const result = db.prepare(`
        INSERT INTO clientes
          (user_id, nome, tel, email, arq, cidade,
           tipo_pessoa, cpf, cnpj, cep, endereco,
           numero, complemento, bairro, estado, obs)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
        req.user.id, nome, tel || '', email || '', arq || '', cidade || '',
        tipo_pessoa || 'fisica', cpf || '', cnpj || '', cep || '', endereco || '',
        numero || '', complemento || '', bairro || '', estado || '', obs || ''
    );

    const cli = db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(cli);
});

// ═══════════════════════════════════════════════════════
// PUT /api/clientes/:id
// ═══════════════════════════════════════════════════════
router.put('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

    if (!canSeeAll(req.user) && existing.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    const {
        nome, tel, email, arq, cidade,
        tipo_pessoa, cpf, cnpj, cep, endereco,
        numero, complemento, bairro, estado, obs
    } = req.body;

    db.prepare(`
        UPDATE clientes SET
          nome=?, tel=?, email=?, arq=?, cidade=?,
          tipo_pessoa=?, cpf=?, cnpj=?, cep=?, endereco=?,
          numero=?, complemento=?, bairro=?, estado=?, obs=?
        WHERE id=?
    `).run(
        nome ?? existing.nome,
        tel ?? existing.tel,
        email ?? existing.email,
        arq ?? existing.arq,
        cidade ?? existing.cidade,
        tipo_pessoa ?? existing.tipo_pessoa,
        cpf ?? existing.cpf,
        cnpj ?? existing.cnpj,
        cep ?? existing.cep,
        endereco ?? existing.endereco,
        numero ?? existing.numero,
        complemento ?? existing.complemento,
        bairro ?? existing.bairro,
        estado ?? existing.estado,
        obs ?? existing.obs,
        id
    );

    res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(id));
});

// ═══════════════════════════════════════════════════════
// DELETE /api/clientes/:id
// ═══════════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });

    if (!canSeeAll(req.user) && existing.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
    }

    db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
    res.json({ ok: true });
});

export default router;
