// @ts-check
/**
 * Adapter CLIENT-SIDE: converte uma row cnc_pecas (como usada em ProducaoCNC.jsx)
 * em PieceGeometry consumível pelo WoodPiece CSG.
 *
 * Mantém paridade com server/lib/digital-twin-adapter.js para evitar roundtrip
 * quando já temos a peça em memória no frontend.
 */

/**
 * @param {any} w
 * @param {number} thickness
 * @param {number} idx
 */
function normalizeWorker(w, thickness, idx) {
  if (!w || typeof w !== 'object') return null;

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
    type = depth >= thickness - 1 ? 'furo_passante' : 'furo_cego';
  } else {
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
 * Extrai array de workers independente do formato (A=obj numérico, B=array).
 * Aceita tanto JSON string quanto objeto já parseado.
 * @param {string|any} machining
 */
function extractWorkers(machining) {
  if (!machining) return [];
  /** @type {any} */
  let parsed = machining;
  if (typeof machining === 'string') {
    try { parsed = JSON.parse(machining); } catch { return []; }
  }
  if (!parsed) return [];

  if (parsed.workers && typeof parsed.workers === 'object') {
    if (Array.isArray(parsed.workers)) return parsed.workers;
    return Object.values(parsed.workers);
  }
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object') {
    const vals = Object.values(parsed);
    if (vals.length > 0 && vals.every((v) => v && typeof v === 'object' && ('category' in v || 'tool' in v || 'diameter' in v))) {
      return /** @type {any[]} */ (vals);
    }
  }
  return [];
}

/**
 * @param {any} row
 */
function buildPieceId(row) {
  const raw = (row.upmcode || row.persistent_id || `PECA-${row.id}`).toString();
  return raw.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9\-_]/g, '').slice(0, 16);
}

/**
 * Converte uma row cnc_pecas (client-side) em PieceGeometry.
 * @param {any} peca
 * @returns {import('../types/cnc.types.js').PieceGeometry}
 */
export function pecaToPieceGeometry(peca) {
  if (!peca) throw new Error('peca is required');
  const thickness = Number(peca.espessura) || 15;
  const width = Number(peca.comprimento) || Number(peca.largura_mm) || 1000;
  const height = Number(peca.largura) || Number(peca.altura_mm) || 500;

  // machining_json pode vir como string (SQLite) ou já parseado (API que já fez parse)
  const workers = extractWorkers(peca.machining_json ?? peca.operations ?? peca.workers);

  const operations = workers
    .map((w, i) => normalizeWorker(w, thickness, i))
    .filter(Boolean);

  /** @type {'ok'|'pendente'|'usinado'} */
  let status = 'pendente';
  if (operations.length > 0 && operations.every((/** @type {any} */ o) => o.status === 'ok')) status = 'ok';

  return /** @type {any} */ ({
    id: buildPieceId(peca),
    name: peca.descricao || peca.modulo_desc || `Peça ${peca.id}`,
    material: peca.material || 'MDF',
    thickness,
    width,
    height,
    program: `${buildPieceId(peca)}.nc`,
    operations,
    status,
    projectId: peca.lote_id ? `LOTE-${peca.lote_id}` : undefined,
    createdAt: peca.criado_em,
    // preserva row original pra quem quiser reusar
    _raw: peca,
  });
}
