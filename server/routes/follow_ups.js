import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// Helper: criar follow-up automático pra um lead segundo regras
// Usado pelos hooks em leads.js e landing.js
// ═══════════════════════════════════════════════════════════════
export function criarFollowUpAutomatico(leadId, colunaId, userId = null) {
    try {
        const regra = db.prepare(
            'SELECT * FROM follow_up_regras WHERE coluna_id = ? AND ativo = 1 ORDER BY id ASC LIMIT 1'
        ).get(colunaId);
        if (!regra) return null;

        const lead = db.prepare('SELECT responsavel_id FROM leads WHERE id = ?').get(leadId);

        const r = db.prepare(`
            INSERT INTO follow_ups (lead_id, tipo, due_at, notas, responsavel_id, criado_por, origem)
            VALUES (?, ?, datetime('now', '+' || ? || ' hours'), ?, ?, ?, 'auto')
        `).run(
            leadId,
            regra.tipo,
            regra.horas_apos,
            regra.notas || '',
            lead?.responsavel_id || null,
            userId,
        );

        const fu = db.prepare('SELECT due_at FROM follow_ups WHERE id = ?').get(r.lastInsertRowid);
        if (fu) {
            db.prepare('UPDATE leads SET proximo_followup_em = ? WHERE id = ?').run(fu.due_at, leadId);
        }
        return r.lastInsertRowid;
    } catch (err) {
        console.error('[FollowUps] Erro ao criar automático:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// Helper: atualizar proximo_followup_em do lead (usado em mutations)
// ═══════════════════════════════════════════════════════════════
function refreshProximoFollowUp(leadId) {
    const proximo = db.prepare(
        'SELECT MIN(due_at) as due FROM follow_ups WHERE lead_id = ? AND feito_at IS NULL'
    ).get(leadId);
    db.prepare('UPDATE leads SET proximo_followup_em = ? WHERE id = ?').run(proximo?.due || null, leadId);
}

// ═══════════════════════════════════════════════════════════════
// GET /api/follow-ups/hoje — pendentes até fim do dia (+ atrasados)
// Query: ?responsavel_id=me para filtrar por usuário atual
// ═══════════════════════════════════════════════════════════════
router.get('/hoje', requireAuth, (req, res) => {
    try {
        const filtroResp = req.query.responsavel_id === 'me' ? ` AND f.responsavel_id = ${req.user.id}` : '';
        const rows = db.prepare(`
            SELECT f.*, l.nome as lead_nome, l.telefone as lead_telefone, l.projeto as lead_projeto,
                   lc.nome as coluna_nome, lc.cor as coluna_cor,
                   u.nome as responsavel_nome,
                   CASE WHEN f.due_at < datetime('now', 'localtime') THEN 1 ELSE 0 END as atrasado
            FROM follow_ups f
            JOIN leads l ON l.id = f.lead_id
            LEFT JOIN lead_colunas lc ON lc.id = l.coluna_id
            LEFT JOIN users u ON u.id = f.responsavel_id
            WHERE f.feito_at IS NULL
              AND f.due_at <= datetime('now', 'localtime', 'start of day', '+1 day')
              ${filtroResp}
            ORDER BY f.due_at ASC
            LIMIT 50
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('[FollowUps] Erro hoje:', err.message);
        res.status(500).json({ error: 'Erro ao listar follow-ups' });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/follow-ups/contagem — {hoje, atrasados, total_pendentes}
// ═══════════════════════════════════════════════════════════════
router.get('/contagem', requireAuth, (req, res) => {
    try {
        const filtroResp = req.query.responsavel_id === 'me' ? ` AND responsavel_id = ${req.user.id}` : '';
        const row = db.prepare(`
            SELECT
                SUM(CASE WHEN due_at < datetime('now', 'localtime') THEN 1 ELSE 0 END) as atrasados,
                SUM(CASE WHEN due_at >= datetime('now', 'localtime', 'start of day')
                         AND due_at < datetime('now', 'localtime', 'start of day', '+1 day')
                         AND due_at >= datetime('now', 'localtime')
                    THEN 1 ELSE 0 END) as hoje,
                COUNT(*) as total_pendentes
            FROM follow_ups
            WHERE feito_at IS NULL ${filtroResp}
        `).get();
        res.json({
            atrasados: row?.atrasados || 0,
            hoje: row?.hoje || 0,
            total_pendentes: row?.total_pendentes || 0,
        });
    } catch (err) {
        console.error('[FollowUps] Erro contagem:', err.message);
        res.status(500).json({ error: 'Erro ao contar' });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/follow-ups/lead/:leadId — todos os follow-ups do lead
// ═══════════════════════════════════════════════════════════════
router.get('/lead/:leadId', requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT f.*, u.nome as responsavel_nome
            FROM follow_ups f LEFT JOIN users u ON u.id = f.responsavel_id
            WHERE f.lead_id = ? ORDER BY
                CASE WHEN f.feito_at IS NULL THEN 0 ELSE 1 END,
                f.due_at ASC
        `).all(parseInt(req.params.leadId));
        res.json(rows);
    } catch (err) {
        console.error('[FollowUps] Erro por lead:', err.message);
        res.status(500).json({ error: 'Erro ao listar' });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/follow-ups — criar manualmente
// body: { lead_id, tipo, due_at, notas, responsavel_id }
// ═══════════════════════════════════════════════════════════════
router.post('/', requireAuth, (req, res) => {
    const { lead_id, tipo, due_at, notas, responsavel_id } = req.body;
    if (!lead_id || !due_at) return res.status(400).json({ error: 'lead_id e due_at obrigatórios' });
    try {
        const lead = db.prepare('SELECT responsavel_id FROM leads WHERE id = ?').get(lead_id);
        const r = db.prepare(`
            INSERT INTO follow_ups (lead_id, tipo, due_at, notas, responsavel_id, criado_por, origem)
            VALUES (?, ?, ?, ?, ?, ?, 'manual')
        `).run(
            lead_id, tipo || 'whatsapp', due_at,
            notas || '',
            responsavel_id ?? lead?.responsavel_id ?? req.user.id,
            req.user.id
        );
        refreshProximoFollowUp(lead_id);
        const row = db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(r.lastInsertRowid);
        res.json(row);
    } catch (err) {
        console.error('[FollowUps] Erro ao criar:', err.message);
        res.status(500).json({ error: 'Erro ao criar follow-up' });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/follow-ups/:id/feito — marcar como concluído
// body: { motivo_conclusao, notas }
// ═══════════════════════════════════════════════════════════════
router.put('/:id/feito', requireAuth, (req, res) => {
    const { motivo_conclusao, notas } = req.body;
    try {
        const fu = db.prepare('SELECT lead_id FROM follow_ups WHERE id = ?').get(req.params.id);
        if (!fu) return res.status(404).json({ error: 'Follow-up não encontrado' });

        db.prepare(`
            UPDATE follow_ups
               SET feito_at = CURRENT_TIMESTAMP,
                   motivo_conclusao = ?,
                   notas = COALESCE(NULLIF(?, ''), notas)
             WHERE id = ?
        `).run(motivo_conclusao || '', notas || '', req.params.id);

        db.prepare('UPDATE leads SET ultimo_contato_em = CURRENT_TIMESTAMP WHERE id = ?').run(fu.lead_id);
        refreshProximoFollowUp(fu.lead_id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[FollowUps] Erro ao marcar feito:', err.message);
        res.status(500).json({ error: 'Erro ao marcar' });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/follow-ups/:id/reagendar — novo due_at
// body: { due_at }  OU  { horas_adiar }
// ═══════════════════════════════════════════════════════════════
router.put('/:id/reagendar', requireAuth, (req, res) => {
    const { due_at, horas_adiar } = req.body;
    try {
        const fu = db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(req.params.id);
        if (!fu) return res.status(404).json({ error: 'Follow-up não encontrado' });

        if (due_at) {
            db.prepare('UPDATE follow_ups SET due_at = ? WHERE id = ?').run(due_at, req.params.id);
        } else if (horas_adiar) {
            db.prepare(`UPDATE follow_ups SET due_at = datetime(due_at, '+' || ? || ' hours') WHERE id = ?`)
                .run(parseInt(horas_adiar), req.params.id);
        } else {
            return res.status(400).json({ error: 'due_at ou horas_adiar obrigatório' });
        }
        refreshProximoFollowUp(fu.lead_id);
        const row = db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(req.params.id);
        res.json(row);
    } catch (err) {
        console.error('[FollowUps] Erro ao reagendar:', err.message);
        res.status(500).json({ error: 'Erro ao reagendar' });
    }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/follow-ups/:id — remover
// ═══════════════════════════════════════════════════════════════
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const fu = db.prepare('SELECT lead_id FROM follow_ups WHERE id = ?').get(req.params.id);
        if (!fu) return res.status(404).json({ error: 'Follow-up não encontrado' });
        db.prepare('DELETE FROM follow_ups WHERE id = ?').run(req.params.id);
        refreshProximoFollowUp(fu.lead_id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[FollowUps] Erro ao deletar:', err.message);
        res.status(500).json({ error: 'Erro ao deletar' });
    }
});

// ═══════════════════════════════════════════════════════════════
// REGRAS AUTOMÁTICAS POR COLUNA — CRUD admin
// ═══════════════════════════════════════════════════════════════
router.get('/regras', requireAuth, (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT r.*, lc.nome as coluna_nome, lc.cor as coluna_cor
            FROM follow_up_regras r
            LEFT JOIN lead_colunas lc ON lc.id = r.coluna_id
            ORDER BY lc.ordem ASC, r.id ASC
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('[FollowUps] Erro ao listar regras:', err.message);
        res.status(500).json({ error: 'Erro ao listar regras' });
    }
});

router.post('/regras', requireAuth, (req, res) => {
    const { coluna_id, tipo, horas_apos, notas } = req.body;
    if (!coluna_id || !horas_apos) return res.status(400).json({ error: 'coluna_id e horas_apos obrigatórios' });
    try {
        const r = db.prepare(`
            INSERT INTO follow_up_regras (coluna_id, tipo, horas_apos, notas, ativo)
            VALUES (?, ?, ?, ?, 1)
        `).run(coluna_id, tipo || 'whatsapp', parseInt(horas_apos), notas || '');
        const row = db.prepare('SELECT * FROM follow_up_regras WHERE id = ?').get(r.lastInsertRowid);
        res.json(row);
    } catch (err) {
        console.error('[FollowUps] Erro ao criar regra:', err.message);
        res.status(500).json({ error: 'Erro ao criar regra' });
    }
});

router.put('/regras/:id', requireAuth, (req, res) => {
    const { tipo, horas_apos, notas, ativo } = req.body;
    try {
        db.prepare(`
            UPDATE follow_up_regras SET
                tipo = COALESCE(?, tipo),
                horas_apos = COALESCE(?, horas_apos),
                notas = COALESCE(?, notas),
                ativo = COALESCE(?, ativo)
            WHERE id = ?
        `).run(tipo ?? null, horas_apos ?? null, notas ?? null, (ativo === 0 || ativo === 1) ? ativo : null, req.params.id);
        const row = db.prepare('SELECT * FROM follow_up_regras WHERE id = ?').get(req.params.id);
        res.json(row);
    } catch (err) {
        console.error('[FollowUps] Erro ao editar regra:', err.message);
        res.status(500).json({ error: 'Erro ao editar regra' });
    }
});

router.delete('/regras/:id', requireAuth, (req, res) => {
    try {
        db.prepare('DELETE FROM follow_up_regras WHERE id = ?').run(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error('[FollowUps] Erro ao deletar regra:', err.message);
        res.status(500).json({ error: 'Erro ao deletar regra' });
    }
});

export default router;
