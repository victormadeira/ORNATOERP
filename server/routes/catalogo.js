import express from 'express';
import db from '../db.js';

const router = express.Router();

// Listar itens do catálogo (caixas e componentes)
router.get('/', (req, res) => {
    try {
        const { tipo } = req.query;
        let rows;
        if (tipo) {
            rows = db.prepare('SELECT id, tipo_item, nome, json_data, criado_em FROM modulos_custom WHERE tipo_item = ? ORDER BY id ASC').all(tipo);
        } else {
            rows = db.prepare('SELECT id, tipo_item, nome, json_data, criado_em FROM modulos_custom ORDER BY tipo_item ASC, id ASC').all();
        }
        const itens = rows.map(r => ({
            db_id: r.id,
            tipo_item: r.tipo_item,
            ...JSON.parse(r.json_data),
            criado_em: r.criado_em,
        }));
        res.json(itens);
    } catch (err) {
        console.error('Erro ao listar catálogo:', err);
        res.status(500).json({ error: 'Erro ao listar catálogo' });
    }
});

// Criar novo item (caixa ou componente)
router.post('/', (req, res) => {
    try {
        const { tipo_item, ...rest } = req.body;
        const userId = req.user?.id || 1;
        const tipo = tipo_item || 'caixa';
        const nome = rest.nome || '';
        const stmt = db.prepare('INSERT INTO modulos_custom (user_id, tipo_item, nome, json_data) VALUES (?, ?, ?, ?)');
        const result = stmt.run(userId, tipo, nome, JSON.stringify(rest));
        res.status(201).json({ id: result.lastInsertRowid, message: 'Item criado com sucesso' });
    } catch (err) {
        console.error('Erro ao criar item:', err);
        res.status(500).json({ error: 'Erro ao criar item' });
    }
});

// Atualizar item existente
router.put('/:id', (req, res) => {
    try {
        const { tipo_item, ...rest } = req.body;
        const nome = rest.nome || '';
        const tipo = tipo_item || 'caixa';
        db.prepare('UPDATE modulos_custom SET tipo_item = ?, nome = ?, json_data = ? WHERE id = ?')
            .run(tipo, nome, JSON.stringify(rest), req.params.id);
        res.json({ message: 'Item atualizado' });
    } catch (err) {
        console.error('Erro ao atualizar item:', err);
        res.status(500).json({ error: 'Erro ao atualizar item' });
    }
});

// Excluir item
router.delete('/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM modulos_custom WHERE id = ?').run(req.params.id);
        res.json({ message: 'Item removido' });
    } catch (err) {
        console.error('Erro ao remover item:', err);
        res.status(500).json({ error: 'Erro ao remover item' });
    }
});

export default router;
