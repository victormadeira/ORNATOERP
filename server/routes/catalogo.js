import express from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();

// ── Helper: auto-computa dimsAplicaveis a partir das fórmulas ──
function computeDimsAplicaveis(data, tipoItem) {
    if (tipoItem === 'componente') {
        // Componentes: escaneia fórmulas mas exclui dims cobertas por vars próprias
        const varsIds = (data.vars || []).map(v => v.id);
        const allCalcs = [
            ...(data.pecas || []).map(p => p.calc),
            data.frente_externa?.ativa ? data.frente_externa.calc : '',
            ...Object.values(data.varsDeriv || {}),
        ].join(' ');
        const dims = [];
        // L: inclui se fórmulas usam L/Li e não há var custom que substitui
        if (/\bL\b|\bLi\b|\bLg\b|\bLpr\b|\bLdv\b|\bLp\b/.test(allCalcs)) dims.push('L');
        // A: inclui só se usado diretamente (não via varsDeriv) e sem var custom tipo 'ag'/'Ap'
        if ((/\bA\b|\bAi\b/.test(allCalcs)) && !varsIds.some(v => /^[Aa]/.test(v) || v === 'nPortas')) dims.push('A');
        // P: inclui se fórmulas usam P/Pi
        if (/\bP\b|\bPi\b|\bPg\b|\bPpr\b|\bPdv\b/.test(allCalcs)) dims.push('P');
        return dims.length > 0 ? dims : ['L', 'A', 'P'];
    }
    // Caixas: escaneia todas as fórmulas de pecas + tamponamentos
    const allCalcs = [
        ...(data.pecas || []),
        ...(data.tamponamentos || []),
    ].map(p => p.calc).join(' ');
    const dims = [];
    if (/\bL\b|\bLi\b/.test(allCalcs)) dims.push('L');
    if (/\bA\b|\bAi\b/.test(allCalcs)) dims.push('A');
    if (/\bP\b|\bPi\b/.test(allCalcs)) dims.push('P');
    return dims.length > 0 ? dims : ['L', 'A', 'P'];
}

// Listar itens do catálogo (caixas e componentes)
router.get('/', requireAuth, (req, res) => {
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
router.post('/', requireAuth, (req, res) => {
    try {
        const { tipo_item, ...rest } = req.body;
        const userId = req.user?.id || 1;
        const tipo = tipo_item || 'caixa';
        const nome = rest.nome || '';
        // Auto-computa dimsAplicaveis se não foi definido manualmente
        if (!rest.dimsAplicaveis || rest.dimsAplicaveis.length === 0) {
            rest.dimsAplicaveis = computeDimsAplicaveis(rest, tipo);
        }
        const stmt = db.prepare('INSERT INTO modulos_custom (user_id, tipo_item, nome, json_data) VALUES (?, ?, ?, ?)');
        const result = stmt.run(userId, tipo, nome, JSON.stringify(rest));
        res.status(201).json({ id: result.lastInsertRowid, message: 'Item criado com sucesso' });
    } catch (err) {
        console.error('Erro ao criar item:', err);
        res.status(500).json({ error: 'Erro ao criar item' });
    }
});

// Atualizar item existente
router.put('/:id', requireAuth, (req, res) => {
    try {
        const { tipo_item, ...rest } = req.body;
        const nome = rest.nome || '';
        const tipo = tipo_item || 'caixa';
        // Sempre recalcula dimsAplicaveis ao atualizar (garante consistência)
        rest.dimsAplicaveis = computeDimsAplicaveis(rest, tipo);
        db.prepare('UPDATE modulos_custom SET tipo_item = ?, nome = ?, json_data = ? WHERE id = ?')
            .run(tipo, nome, JSON.stringify(rest), req.params.id);
        res.json({ message: 'Item atualizado' });
    } catch (err) {
        console.error('Erro ao atualizar item:', err);
        res.status(500).json({ error: 'Erro ao atualizar item' });
    }
});

// Excluir item
router.delete('/:id', requireAuth, (req, res) => {
    try {
        db.prepare('DELETE FROM modulos_custom WHERE id = ?').run(req.params.id);
        res.json({ message: 'Item removido' });
    } catch (err) {
        console.error('Erro ao remover item:', err);
        res.status(500).json({ error: 'Erro ao remover item' });
    }
});

export default router;
