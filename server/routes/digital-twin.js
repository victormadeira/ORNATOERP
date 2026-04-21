// @ts-check
import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import {
  cncPecaToPieceGeometry,
  findPieceByCode,
  listRecentPieces,
} from '../lib/digital-twin-adapter.js';
import { generateGCode } from '../lib/gcode-generator.js';
import { computeNesting } from '../lib/dt-nesting.js';

const router = Router();

// Todas as rotas exigem auth (usuário logado)
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────
// LOTES (reusa cnc_lotes — o DT é a UX 3D em cima)
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/digital-twin/lotes
 * Lista lotes com contador de peças.
 */
router.get('/lotes', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        l.id, l.nome, l.cliente, l.projeto, l.codigo, l.status,
        l.total_pecas, l.total_chapas, l.aproveitamento, l.criado_em,
        l.projeto_id, l.orc_id,
        (SELECT COUNT(*) FROM cnc_pecas p WHERE p.lote_id = l.id) AS pecas_real
      FROM cnc_lotes l
      ORDER BY l.criado_em DESC
      LIMIT 100
    `).all();
    res.json({ lotes: rows });
  } catch (err) {
    console.error('[digital-twin] GET /lotes failed', err);
    res.status(500).json({ error: 'failed_list_lotes' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PEÇAS
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/digital-twin/pieces?lote_id=N&limit=60
 * Lista peças recentes — para a sidebar esquerda.
 */
router.get('/pieces', (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '60'), 10) || 60, 500);
    const loteId = req.query.lote_id ? parseInt(String(req.query.lote_id), 10) : null;

    let rows;
    if (loteId && !Number.isNaN(loteId)) {
      rows = db.prepare(`
        SELECT * FROM cnc_pecas
        WHERE lote_id = ?
        ORDER BY id ASC
        LIMIT ?
      `).all(loteId, limit);
    } else {
      rows = db.prepare(`
        SELECT * FROM cnc_pecas
        ORDER BY criado_em DESC, id DESC
        LIMIT ?
      `).all(limit);
    }
    res.json({ pieces: rows.map(cncPecaToPieceGeometry), loteId });
  } catch (err) {
    console.error('[digital-twin] GET /pieces failed', err);
    res.status(500).json({ error: 'failed_list_pieces' });
  }
});

/**
 * GET /api/digital-twin/pieces/:code
 */
router.get('/pieces/:code', (req, res) => {
  try {
    const row = findPieceByCode(db, req.params.code);
    if (!row) return res.status(404).json({ error: 'not_found', code: req.params.code });
    res.json({ piece: cncPecaToPieceGeometry(row) });
  } catch (err) {
    console.error('[digital-twin] GET /pieces/:code failed', err);
    res.status(500).json({ error: 'failed_fetch_piece' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// G-CODE
// ─────────────────────────────────────────────────────────────────────

/** GET /api/digital-twin/gcode/:code */
router.get('/gcode/:code', (req, res) => {
  try {
    const row = findPieceByCode(db, req.params.code);
    if (!row) return res.status(404).json({ error: 'not_found', code: req.params.code });

    let stored = null;
    try {
      stored = db.prepare('SELECT gcode FROM cnc_gcode_historico WHERE peca_id = ? ORDER BY id DESC LIMIT 1').get(row.id);
    } catch { /* tabela pode não ter coluna */ }

    if (stored && stored.gcode && String(stored.gcode).length > 10) {
      return res.json({ gcode: stored.gcode, source: 'stored' });
    }

    const piece = cncPecaToPieceGeometry(row);
    const gcode = generateGCode(piece);
    res.json({ gcode, source: 'generated' });
  } catch (err) {
    console.error('[digital-twin] GET /gcode/:code failed', err);
    res.status(500).json({ error: 'failed_fetch_gcode' });
  }
});

/** GET /api/digital-twin/scan/:code */
router.get('/scan/:code', (req, res) => {
  try {
    const row = findPieceByCode(db, req.params.code);
    if (!row) return res.status(404).json({ error: 'not_found', code: req.params.code });
    const piece = cncPecaToPieceGeometry(row);

    let gcode = null;
    try {
      const stored = db.prepare('SELECT gcode FROM cnc_gcode_historico WHERE peca_id = ? ORDER BY id DESC LIMIT 1').get(row.id);
      if (stored?.gcode) gcode = stored.gcode;
    } catch { /* noop */ }
    if (!gcode) gcode = generateGCode(piece);

    res.json({ piece, gcode });
  } catch (err) {
    console.error('[digital-twin] GET /scan/:code failed', err);
    res.status(500).json({ error: 'failed_scan' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// NESTING (simples – BLF – usado apenas quando não há lote real)
// ─────────────────────────────────────────────────────────────────────

router.post('/nesting', (req, res) => {
  try {
    const { pieces, config } = req.body || {};
    if (!Array.isArray(pieces) || pieces.length === 0) {
      return res.status(400).json({ error: 'missing_pieces' });
    }
    const result = computeNesting(pieces, config);
    res.json({ result });
  } catch (err) {
    console.error('[digital-twin] POST /nesting failed', err);
    res.status(500).json({ error: 'failed_nesting' });
  }
});

/**
 * GET /api/digital-twin/plano/:loteId
 * Lê o plano já otimizado (cnc_lotes.plano_json) e devolve no formato
 * amigável pro NestingCanvas. NÃO roda otimização — isso fica no
 * /api/cnc/otimizar/:loteId (BRKGA/SA pesado), que o DT dispara via API.
 */
router.get('/plano/:loteId', (req, res) => {
  try {
    const loteId = parseInt(req.params.loteId, 10);
    if (!loteId) return res.status(400).json({ error: 'invalid_lote_id' });

    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ?').get(loteId);
    if (!lote) return res.status(404).json({ error: 'lote_not_found' });

    let plano = null;
    try { plano = lote.plano_json ? JSON.parse(lote.plano_json) : null; } catch { /* noop */ }

    // Carrega peças do lote para resolver dimensões na UI
    const pieces = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(loteId)
      .map(cncPecaToPieceGeometry);

    res.json({
      lote: {
        id: lote.id, nome: lote.nome, status: lote.status,
        total_pecas: lote.total_pecas, total_chapas: lote.total_chapas,
        aproveitamento: lote.aproveitamento,
      },
      plano,
      pieces,
    });
  } catch (err) {
    console.error('[digital-twin] GET /plano/:loteId failed', err);
    res.status(500).json({ error: 'failed_fetch_plano' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// SOBRAS (read-only view)
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/digital-twin/sobras?material=MDF15
 * Lista retalhos disponíveis para consultar dentro do DT.
 */
router.get('/sobras', (req, res) => {
  try {
    const material = req.query.material ? String(req.query.material) : null;
    let rows;
    if (material) {
      rows = db.prepare(`
        SELECT id, nome, material_code, espessura_real, comprimento, largura, origem_lote, criado_em
        FROM cnc_retalhos
        WHERE disponivel = 1 AND material_code LIKE ?
        ORDER BY (comprimento * largura) DESC
        LIMIT 60
      `).all(`%${material}%`);
    } else {
      rows = db.prepare(`
        SELECT id, nome, material_code, espessura_real, comprimento, largura, origem_lote, criado_em
        FROM cnc_retalhos
        WHERE disponivel = 1
        ORDER BY (comprimento * largura) DESC
        LIMIT 60
      `).all();
    }
    res.json({ sobras: rows });
  } catch (err) {
    console.error('[digital-twin] GET /sobras failed', err);
    res.status(500).json({ error: 'failed_list_sobras' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// MÁQUINAS (read-only)
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/digital-twin/maquinas
 * Lista máquinas configuradas — read-only. A edição fica em /api/cnc/maquinas.
 */
router.get('/maquinas', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, nome, fabricante, modelo, tipo_pos, x_max, y_max, z_max,
             vel_corte, rpm_padrao, padrao, ativo
      FROM cnc_maquinas
      WHERE ativo = 1
      ORDER BY padrao DESC, nome ASC
    `).all();
    res.json({ maquinas: rows });
  } catch (err) {
    console.error('[digital-twin] GET /maquinas failed', err);
    res.status(500).json({ error: 'failed_list_maquinas' });
  }
});

export default router;
