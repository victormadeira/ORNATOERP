// @ts-check
/**
 * Gerador de G-Code sintético a partir das operações de uma peça.
 * NÃO substitui o post-processor da CNC — é apenas uma representação
 * consumível para o Digital Twin simular/visualizar o caminho de ferramenta.
 *
 * Formato: G21 (mm), G90 (absoluto), G17 (plano XY).
 *   Furos: G0 X Y → G1 Z-depth F300 → G1 Z5
 *   Rasgos: G0 X Y → G1 Z-depth F400 → G1 X_end Y_end F2000 → G1 Z5
 *   Freza circular: G0 X Y → G2 X Y I R J0 Z-depth F350 → G1 Z5
 *
 * @param {any} piece PieceGeometry
 * @returns {string}
 */
export function generateGCode(piece) {
  const lines = [];
  const safeZ = 5;
  const rapidFeed = 2000;

  lines.push(`(${piece.id} - ${piece.name})`);
  lines.push(`(${piece.material} - ${piece.width} x ${piece.height} x ${piece.thickness})`);
  lines.push('G21 G90 G17');
  lines.push(`G0 Z${safeZ}`);

  for (const op of piece.operations || []) {
    switch (op.type) {
      case 'furo_cego':
      case 'furo_passante': {
        const z = op.type === 'furo_passante' ? -(piece.thickness + 1) : -op.depth;
        lines.push(`G0 X${op.x} Y${op.y}`);
        lines.push(`G1 Z${z.toFixed(2)} F300`);
        lines.push(`G1 Z${safeZ}`);
        break;
      }
      case 'freza_circular': {
        const r = (op.diameter || 35) / 2;
        lines.push(`G0 X${op.x} Y${op.y}`);
        lines.push(`G1 Z${(-op.depth).toFixed(2)} F350`);
        lines.push(`G2 X${op.x} Y${op.y} I${r.toFixed(2)} J0 F${rapidFeed / 4}`);
        lines.push(`G1 Z${safeZ}`);
        break;
      }
      case 'rasgo':
      case 'rebaixo': {
        const w = op.width || 50;
        const l = op.length || 8;
        const x0 = op.x;
        const y0 = op.y + l / 2;
        const x1 = op.x + w;
        lines.push(`G0 X${x0} Y${y0.toFixed(2)}`);
        lines.push(`G1 Z${(-op.depth).toFixed(2)} F400`);
        lines.push(`G1 X${x1} Y${y0.toFixed(2)} F${rapidFeed}`);
        lines.push(`G1 Z${safeZ}`);
        break;
      }
      case 'chanfro': {
        const len = op.length || 20;
        lines.push(`G0 X${op.x} Y${op.y}`);
        lines.push(`G1 Z${(-op.depth).toFixed(2)} F500`);
        lines.push(`G1 X${op.x + len} Y${op.y} F${rapidFeed}`);
        lines.push(`G1 Z${safeZ}`);
        break;
      }
      default:
        break;
    }
  }

  lines.push('G28');
  lines.push('M30');

  return lines.join('\n');
}
