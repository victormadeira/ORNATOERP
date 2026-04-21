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

/**
 * GET /api/digital-twin/pieces
 * Lista peças recentes — para a sidebar esquerda.
 */
router.get('/pieces', (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 200);
    const pieces = listRecentPieces(db, limit);
    res.json({ pieces });
  } catch (err) {
    console.error('[digital-twin] GET /pieces failed', err);
    res.status(500).json({ error: 'failed_list_pieces' });
  }
});

/**
 * GET /api/digital-twin/pieces/:code
 * Busca peça pelo código (upmcode ou PECA-<id>).
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

/**
 * GET /api/digital-twin/gcode/:code
 * Busca (ou gera) o G-Code para a peça.
 */
router.get('/gcode/:code', (req, res) => {
  try {
    const row = findPieceByCode(db, req.params.code);
    if (!row) return res.status(404).json({ error: 'not_found', code: req.params.code });

    // Se houver G-Code histórico salvo, prefere ele
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

/**
 * GET /api/digital-twin/scan/:code
 * Resolve código escaneado → retorna peça + gcode num único roundtrip.
 */
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

/**
 * POST /api/digital-twin/nesting
 * Body: { pieces: PieceNesting[], config?: NestingConfig }
 * Retorna NestingResult.
 */
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

export default router;
