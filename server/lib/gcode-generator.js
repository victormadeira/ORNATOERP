// @ts-check
/**
 * Gerador de G-Code sintético a partir das operações de uma peça.
 * NÃO substitui o post-processor da CNC — é apenas uma representação
 * consumível para o Digital Twin simular/visualizar o caminho de ferramenta.
 *
 * Formato: G21 (mm), G90 (absoluto), G17 (plano XY).
 *   Furos: G0 X Y → G1 Z-depth F300 → G0 Z_safe
 *   Rasgos: G0 X Y → rampa → G1 X_end Y_end F2000 → G0 Z_safe
 *   Freza circular: G0 X_entrada → G1 Z-depth → G2 círculo completo → G0 Z_safe
 *
 * @param {any} piece PieceGeometry
 * @param {object} [opts] Opções extras
 * @param {number} [opts.toolDiameter=6] Diâmetro da fresa (mm) — usado para offset circular
 * @param {number} [opts.rpm=18000] RPM do spindle
 * @param {number} [opts.safeZ=30] Altura segura de deslocamento rápido
 * @returns {string}
 */
export function generateGCode(piece, opts = {}) {
  const lines = [];
  const safeZ = opts.safeZ ?? 30;          // altura segura (era 5 — muito baixo, risco de colisão)
  const rapidFeed = 10000;
  const rpm = opts.rpm ?? 18000;
  const toolR = (opts.toolDiameter ?? 6) / 2; // raio da fresa para offset de bolsão circular

  lines.push(`(${piece.id} - ${piece.name})`);
  lines.push(`(${piece.material} - ${piece.width} x ${piece.height} x ${piece.thickness})`);
  lines.push('G21 G90 G17');              // mm, coordenadas absolutas, plano XY
  lines.push(`S${rpm} M3`);              // liga spindle com RPM
  lines.push(`G4 P1`);                   // dwell 1s aguardando spindle atingir RPM
  lines.push(`G0 Z${safeZ}`);            // posição segura

  for (const op of piece.operations || []) {
    switch (op.type) {
      case 'furo_cego':
      case 'furo_passante': {
        // Furos: vai XY em rápido, mergulha, retrai
        const z = op.type === 'furo_passante' ? -(piece.thickness + 1) : -(op.depth || 10);
        lines.push(`G0 X${(op.x || 0).toFixed(3)} Y${(op.y || 0).toFixed(3)}`);
        lines.push(`G1 Z${z.toFixed(3)} F300`);
        lines.push(`G4 P0.2`);           // dwell no fundo (acabamento)
        lines.push(`G0 Z${safeZ}`);
        break;
      }
      case 'freza_circular': {
        // Bolsão circular: entra no raio (tool-compensated), desce, faz arco completo
        // cut_r = raio_do_bolsao - raio_da_fresa (caminho do CENTRO da fresa)
        const holeR = (op.diameter || 35) / 2;
        const cutR = Math.max(0.5, holeR - toolR);
        const cx = op.x || 0;
        const cy = op.y || 0;
        // Ponto de entrada: lado direito do círculo de corte
        const entryX = cx + cutR;
        const entryY = cy;
        lines.push(`G0 X${entryX.toFixed(3)} Y${entryY.toFixed(3)}`);
        lines.push(`G0 Z2`);             // aproximação rápida
        lines.push(`G1 Z${(-(op.depth || 10)).toFixed(3)} F300`); // mergulha no ponto de entrada
        // Arco completo G2 (CW): de entry → metade oposta → de volta a entry (2 meias-voltas)
        // Meia volta: vai para (-cutR, 0) em relação ao centro
        const oppX = cx - cutR;
        lines.push(`G2 X${oppX.toFixed(3)} Y${entryY.toFixed(3)} I${(-cutR).toFixed(3)} J0 F${(rapidFeed * 0.25).toFixed(0)}`);
        lines.push(`G2 X${entryX.toFixed(3)} Y${entryY.toFixed(3)} I${cutR.toFixed(3)} J0 F${(rapidFeed * 0.25).toFixed(0)}`);
        lines.push(`G0 Z${safeZ}`);
        break;
      }
      case 'rasgo':
      case 'rebaixo': {
        const w = op.width || 50;
        const l = op.length || 8;
        const x0 = (op.x || 0);
        const y0 = (op.y || 0) + l / 2;
        const x1 = x0 + w;
        const depth = -(op.depth || 8);
        // Rampa de entrada (~30% do comprimento)
        const rampLen = Math.min(w * 0.3, 20);
        lines.push(`G0 X${x0.toFixed(3)} Y${y0.toFixed(3)}`);
        lines.push(`G0 Z2`);
        lines.push(`G1 X${(x0 + rampLen).toFixed(3)} Z${depth.toFixed(3)} F500`); // rampa
        lines.push(`G1 X${x0.toFixed(3)} F${rapidFeed}`);                          // retorna
        lines.push(`G1 X${x1.toFixed(3)} F${rapidFeed}`);                          // corta
        lines.push(`G0 Z${safeZ}`);
        break;
      }
      case 'chanfro': {
        const len = op.length || 20;
        const depth = -(op.depth || 5);
        lines.push(`G0 X${(op.x || 0).toFixed(3)} Y${(op.y || 0).toFixed(3)}`);
        lines.push(`G0 Z2`);
        lines.push(`G1 Z${depth.toFixed(3)} F500`);
        lines.push(`G1 X${((op.x || 0) + len).toFixed(3)} Y${(op.y || 0).toFixed(3)} F${rapidFeed}`);
        lines.push(`G0 Z${safeZ}`);
        break;
      }
      default:
        break;
    }
  }

  // Retorno seguro: levanta Z PRIMEIRO, depois retorna à home
  // G28 Z0 retrai o eixo Z à posição de referência antes de mover XY
  lines.push(`G0 Z${safeZ}`);  // garante Z seguro
  lines.push('G28 Z0');        // retorna Z à home (eixo Z primeiro — evita colisão)
  lines.push('G28 X0 Y0');     // retorna XY à home
  lines.push('M5');            // desliga spindle
  lines.push('M30');           // fim do programa

  return lines.join('\n');
}
