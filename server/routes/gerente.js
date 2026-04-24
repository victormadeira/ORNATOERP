// ═══════════════════════════════════════════════════════════════
// Rotas do Gerente Revisional IA
// ═══════════════════════════════════════════════════════════════
import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import gerente from '../services/gerente_revisional.js';

const router = Router();

// ───────────────────────────────────────────────────────
// GET /api/gerente/relatorio — último relatório + ações pendentes
// Query: ?relatorio_id=123 para pegar um específico
// ───────────────────────────────────────────────────────
router.get('/relatorio', requireAuth, (req, res) => {
    try {
        const relId = req.query.relatorio_id
            ? Number(req.query.relatorio_id)
            : db.prepare('SELECT id FROM gerente_relatorios ORDER BY gerado_em DESC LIMIT 1').get()?.id;

        if (!relId) {
            return res.json({ relatorio: null, acoes: [] });
        }

        const relatorio = db.prepare(`
            SELECT id, gerado_em, leads_analisados, acoes_urgentes, acoes_media, acoes_baixa,
                   resumo, padroes_json, recomendacao, tokens_input, tokens_output, custo_usd, modelo, erro
              FROM gerente_relatorios WHERE id = ?
        `).get(relId);

        if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });

        relatorio.padroes = JSON.parse(relatorio.padroes_json || '[]');
        delete relatorio.padroes_json;

        const acoes = db.prepare(`
            SELECT a.id, a.conversa_id, a.cliente_id, a.orc_id, a.nome_alvo,
                   a.prioridade, a.tipo_acao, a.diagnostico, a.acao_sugerida, a.mensagem_sugerida,
                   a.status, a.resolvida_em, a.feedback, a.criado_em,
                   c.wa_phone, c.wa_name, cl.telefone as cliente_telefone, cl.nome as cliente_nome
              FROM gerente_acoes a
         LEFT JOIN chat_conversas c ON c.id = a.conversa_id
         LEFT JOIN clientes cl ON cl.id = a.cliente_id
             WHERE a.relatorio_id = ?
          ORDER BY CASE a.prioridade WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
                   a.id
        `).all(relId);

        res.json({ relatorio, acoes });
    } catch (e) {
        console.error('[Gerente] GET /relatorio:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ───────────────────────────────────────────────────────
// GET /api/gerente/historico — últimos N relatórios
// ───────────────────────────────────────────────────────
router.get('/historico', requireAuth, (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 30, 100);
        const rows = db.prepare(`
            SELECT id, gerado_em, leads_analisados, acoes_urgentes, acoes_media, acoes_baixa,
                   resumo, custo_usd, erro
              FROM gerente_relatorios
          ORDER BY gerado_em DESC
             LIMIT ?
        `).all(limit);
        res.json({ relatorios: rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ───────────────────────────────────────────────────────
// POST /api/gerente/acoes/:id/resolver — marca ação como resolvida/aplicada/ignorada
// body: { status: 'aplicada'|'ignorada'|'resolvida', feedback?: string }
// ───────────────────────────────────────────────────────
router.post('/acoes/:id/resolver', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const { status, feedback = '' } = req.body || {};
    const validos = ['aplicada', 'ignorada', 'resolvida', 'pendente'];
    if (!validos.includes(status)) {
        return res.status(400).json({ error: `status inválido, use um de: ${validos.join(', ')}` });
    }
    try {
        const r = db.prepare(`
            UPDATE gerente_acoes
               SET status = ?,
                   resolvida_em = CASE WHEN ? = 'pendente' THEN NULL ELSE CURRENT_TIMESTAMP END,
                   resolvida_por = CASE WHEN ? = 'pendente' THEN NULL ELSE ? END,
                   feedback = ?
             WHERE id = ?
        `).run(status, status, status, req.user.id, String(feedback).slice(0, 500), id);
        if (!r.changes) return res.status(404).json({ error: 'Ação não encontrada' });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ───────────────────────────────────────────────────────
// POST /api/gerente/rodar-agora — dispara manualmente (só gerente)
// ───────────────────────────────────────────────────────
router.post('/rodar-agora', requireAuth, requireRole('admin', 'gerente'), async (req, res) => {
    try {
        const r = await gerente.rodarAgora({ forcado: true });
        res.json(r);
    } catch (e) {
        console.error('[Gerente] rodar-agora:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ───────────────────────────────────────────────────────
// GET /api/gerente/stats — custo acumulado + totais
// ───────────────────────────────────────────────────────
router.get('/stats', requireAuth, (req, res) => {
    try {
        const totais = db.prepare(`
            SELECT
                COUNT(*) as total_relatorios,
                COALESCE(SUM(custo_usd), 0) as custo_total_usd,
                COALESCE(SUM(tokens_input), 0) as tokens_input_total,
                COALESCE(SUM(tokens_output), 0) as tokens_output_total,
                COALESCE(SUM(acoes_urgentes), 0) as total_urgentes,
                COALESCE(SUM(acoes_media + acoes_baixa), 0) as total_outras
              FROM gerente_relatorios
             WHERE gerado_em > datetime('now', '-30 days')
               AND erro = ''
        `).get();

        const acoesPorStatus = db.prepare(`
            SELECT status, COUNT(*) as n
              FROM gerente_acoes a
              JOIN gerente_relatorios r ON r.id = a.relatorio_id
             WHERE r.gerado_em > datetime('now', '-30 days')
          GROUP BY status
        `).all();

        res.json({ totais, acoesPorStatus });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
