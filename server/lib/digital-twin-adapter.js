// @ts-check
/**
 * Adapter: cnc_pecas (schema legacy) → PieceGeometry (contrato Digital Twin).
 * Lê machining_json em dois formatos conhecidos:
 *   A) Objeto numérico: { "0": {...}, "1": {...} } com position_x/y/z + quadrant
 *   B) Array direto: [ {...}, {...} ] com x/y + face + category
 *
 * Categorias reconhecidas:
 *   transfer_hole              → furo_passante (ou cego se depth < espessura-1)
 *   transfer_hole_blind        → furo_cego
 *   transfer_slot              → rasgo
 *   Transfer_vertical_saw_cut  → rasgo
 *   transfer_milling           → freza_circular
 */

/**
 * Normaliza um worker em um operation no contrato Digital Twin.
 * @param {any} w
 * @param {number} thickness
 * @param {number} idx
 * @returns {Object|null}
 */
function normalizeWorker(w, thickness, idx) {
  if (!w || typeof w !== 'object') return null;

  // Formato A → position_x/y/z | Formato B → x/y
  const x = Number(w.x ?? w.position_x ?? 0);
  const y = Number(w.y ?? w.position_y ?? 0);
  const depth = Number(w.depth ?? 0);
  const diameter = Number(w.diameter ?? 0);
  const length = Number(w.length ?? 0);
  const width = Number(w.width ?? 0);
  const cat = String(w.category ?? '').toLowerCase();

  let type;
  if (cat.includes('saw_cut') || cat.includes('slot')) {
    type = 'rasgo';
  } else if (cat.includes('milling')) {
    type = 'freza_circular';
  } else if (cat.includes('blind')) {
    type = 'furo_cego';
  } else if (cat.includes('hole')) {
    // Furo: passante se profundidade >= espessura-1mm
    type = depth >= thickness - 1 ? 'furo_passante' : 'furo_cego';
  } else {
    // fallback: considera furo cego
    type = 'furo_cego';
  }

  /** @type {any} */
  const op = {
    id: `op-${idx + 1}`,
    type,
    x,
    y,
    depth,
    label: (w.tool_code || w.tool || '').toString().toUpperCase() || '—',
    status: 'ok',
  };

  if (type === 'furo_cego' || type === 'furo_passante' || type === 'freza_circular') {
    op.diameter = diameter || 5;
  }
  if (type === 'rasgo' || type === 'rebaixo') {
    op.width = length || width || 50;
    op.length = width || 8;
  }
  if (type === 'chanfro') {
    op.angle = Number(w.angle ?? 45);
    op.length = length || 20;
  }

  return op;
}

/**
 * Extrai array de workers independente do formato.
 * @param {string} machiningJson
 * @returns {any[]}
 */
function extractWorkers(machiningJson) {
  if (!machiningJson) return [];
  try {
    const parsed = JSON.parse(machiningJson);
    // Formato A: { element, workers: { 0: {...}, 1: {...} } }
    if (parsed?.workers && typeof parsed.workers === 'object') {
      if (Array.isArray(parsed.workers)) return parsed.workers;
      return Object.values(parsed.workers);
    }
    // Formato B: array direto
    if (Array.isArray(parsed)) return parsed;
    // Formato objeto numérico sem wrapper
    if (typeof parsed === 'object') {
      const vals = Object.values(parsed);
      if (vals.length > 0 && vals.every((v) => v && typeof v === 'object' && ('category' in v || 'tool' in v || 'diameter' in v))) {
        return vals;
      }
    }
  } catch (err) {
    // machining_json pode ser "{}" ou malformado — ignora silenciosamente
  }
  return [];
}

/**
 * Infere um ID legível para escaneamento a partir do upmcode/persistent_id.
 * @param {Object} row
 */
function buildPieceId(row) {
  const raw = (row.upmcode || row.persistent_id || `PECA-${row.id}`).toString();
  // Normaliza: uppercase, espaços → hífen, limita tamanho
  return raw.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9\-_]/g, '').slice(0, 16);
}

/**
 * Transforma uma row de cnc_pecas em PieceGeometry.
 * @param {any} row
 * @returns {any} PieceGeometry
 */
export function cncPecaToPieceGeometry(row) {
  const thickness = Number(row.espessura) || 15;
  const width = Number(row.comprimento) || 1000;
  const height = Number(row.largura) || 500;
  const workers = extractWorkers(row.machining_json);

  const operations = workers
    .map((w, i) => normalizeWorker(w, thickness, i))
    .filter(Boolean);

  /** @type {'ok'|'pendente'|'usinado'} */
  let status = 'pendente';
  if (operations.length > 0 && operations.every((/** @type {any} */ o) => o.status === 'ok')) status = 'ok';

  return {
    id: buildPieceId(row),
    name: row.descricao || row.modulo_desc || `Peça ${row.id}`,
    material: row.material || 'MDF',
    thickness,
    width,
    height,
    program: `${buildPieceId(row)}.nc`,
    operations,
    status,
    projectId: row.lote_id ? `LOTE-${row.lote_id}` : undefined,
    orderId: undefined,
    createdAt: row.criado_em,
  };
}

/**
 * Busca uma peça do banco por código público (upmcode/persistent_id ou PECA-<id>).
 * @param {import('better-sqlite3').Database} db
 * @param {string} code
 */
export function findPieceByCode(db, code) {
  if (!code) return null;
  const normalized = code.toUpperCase().trim();

  // Match por PECA-<id>
  const byIdMatch = normalized.match(/^PECA-(\d+)$/);
  if (byIdMatch) {
    const row = db.prepare('SELECT * FROM cnc_pecas WHERE id = ?').get(parseInt(byIdMatch[1], 10));
    return row || null;
  }

  // Match upmcode exato (case-insensitive)
  let row = db.prepare('SELECT * FROM cnc_pecas WHERE UPPER(upmcode) = ?').get(normalized);
  if (row) return row;

  // Match persistent_id exato
  row = db.prepare('SELECT * FROM cnc_pecas WHERE UPPER(persistent_id) = ?').get(normalized);
  if (row) return row;

  // Fuzzy: upmcode contém
  row = db.prepare('SELECT * FROM cnc_pecas WHERE UPPER(upmcode) LIKE ? LIMIT 1').get(`%${normalized}%`);
  return row || null;
}

/**
 * Lista peças recentes para a sidebar, limitadas a N.
 * @param {import('better-sqlite3').Database} db
 * @param {number} [limit]
 */
export function listRecentPieces(db, limit = 40) {
  const rows = db.prepare(`
    SELECT * FROM cnc_pecas
    ORDER BY criado_em DESC, id DESC
    LIMIT ?
  `).all(limit);
  return rows.map(cncPecaToPieceGeometry);
}
