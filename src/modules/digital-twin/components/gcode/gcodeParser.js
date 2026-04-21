// @ts-check
/**
 * Parser G-Code caseiro — cobre o subset usado pelas CNCs de marcenaria
 * (G0, G1, G2, G3, G17/G20/G21, G28, G90/G91). Não usamos `gcode-toolpath`
 * porque ele depende de APIs Node; fazemos regex-based no browser.
 *
 */

/**
 * Parseia texto G-Code em uma lista de segmentos para renderização 3D.
 *
 * Sistema CNC → Three.js:
 *   CNC X → Three.js X (mm)
 *   CNC Y → Three.js Z (mm, profundidade/altura da chapa)
 *   CNC Z → Three.js Y (mm, altura da ferramenta; Z>0 é acima da peça)
 *
 * G-Code CNC marcenaria:
 *   G0: rápido (sem corte) — vermelho (#E0513F)
 *   G1: linear com corte — azul (#2E7FD6)
 *   G2: arco horário — verde (#3D9B47)
 *   G3: arco antihorário — verde-escuro (#2E8A42)
 *
 * @param {string} text raw G-Code
 * @returns {{
 *   segments: Array<{
 *     type: 'G0'|'G1'|'G2'|'G3',
 *     from: [number, number, number],
 *     to: [number, number, number],
 *     feedRate?: number
 *   }>,
 *   bounds: { min: [number,number,number], max: [number,number,number] }
 * }}
 */
export function parseGCode(text) {
  if (!text || typeof text !== 'string') {
    return { segments: [], bounds: { min: [0, 0, 0], max: [0, 0, 0] } };
  }

  /** @type {Array<{type:'G0'|'G1'|'G2'|'G3', from:[number,number,number], to:[number,number,number], feedRate?:number}>} */
  const segments = [];

  let x = 0;
  let y = 0;
  let z = 0;
  let feedRate = 0;
  let absolute = true; // G90 default

  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    // Remove comentários: (...) ou ; ...
    let line = rawLine.replace(/\([^)]*\)/g, '').replace(/;.*$/, '').trim();
    if (!line) continue;

    // Tokens: G0 X50 Y30 Z-12 F300
    const tokens = line.toUpperCase().match(/([GMXYZFIJKR])(-?\d+(?:\.\d+)?)/g);
    if (!tokens) continue;

    /** @type {Record<string, number>} */
    const cmd = {};
    let gCode = -1;
    for (const tk of tokens) {
      const letter = tk[0];
      const value = parseFloat(tk.slice(1));
      if (letter === 'G') {
        gCode = value;
      } else {
        cmd[letter] = value;
      }
    }

    // Mudanças de modo
    if (gCode === 90) { absolute = true; continue; }
    if (gCode === 91) { absolute = false; continue; }
    if (gCode === 21 || gCode === 17 || gCode === 20 || gCode === 28) {
      // G21 (mm), G17 (XY plane), G20 (inch - ignorar), G28 (home)
      if (gCode === 28) {
        // Home: segmento G0 até (0,0,5)
        segments.push({
          type: 'G0',
          from: [x, z, y],
          to: [0, 5, 0],
        });
        x = 0; y = 0; z = 5;
      }
      continue;
    }

    // Movimentos G0/G1/G2/G3
    if (gCode === 0 || gCode === 1 || gCode === 2 || gCode === 3) {
      const newX = cmd.X !== undefined ? (absolute ? cmd.X : x + cmd.X) : x;
      const newY = cmd.Y !== undefined ? (absolute ? cmd.Y : y + cmd.Y) : y;
      const newZ = cmd.Z !== undefined ? (absolute ? cmd.Z : z + cmd.Z) : z;
      if (cmd.F !== undefined) feedRate = cmd.F;

      // Converter CNC (X,Y,Z) → Three.js (X, Z_cnc→Y_three, Y_cnc→Z_three)
      /** @type {[number,number,number]} */
      const from = [x, z, y];
      /** @type {[number,number,number]} */
      const to = [newX, newZ, newY];

      /** @type {'G0'|'G1'|'G2'|'G3'} */
      const type = /** @type {any} */ (`G${gCode}`);

      // Para G2/G3 arcos, aproximamos com segmentos (poligonais)
      if ((gCode === 2 || gCode === 3) && (cmd.I !== undefined || cmd.J !== undefined)) {
        const cx = x + (cmd.I || 0);
        const cy = y + (cmd.J || 0);
        const radius = Math.hypot(x - cx, y - cy);
        const startAng = Math.atan2(y - cy, x - cx);
        const endAng = Math.atan2(newY - cy, newX - cx);
        let delta = endAng - startAng;
        if (gCode === 2) {
          // Horário: delta deve ser negativo
          if (delta > 0) delta -= Math.PI * 2;
        } else {
          // Antihorário: delta deve ser positivo
          if (delta < 0) delta += Math.PI * 2;
        }
        // Se start === end (círculo completo), delta vira 2π
        if (Math.abs(delta) < 0.0001) delta = gCode === 2 ? -Math.PI * 2 : Math.PI * 2;

        const steps = Math.max(16, Math.ceil(Math.abs(delta) * 16));
        let prev = from;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const ang = startAng + delta * t;
          const px = cx + radius * Math.cos(ang);
          const py = cy + radius * Math.sin(ang);
          const pz = z + (newZ - z) * t;
          /** @type {[number,number,number]} */
          const arcTo = [px, pz, py];
          segments.push({ type, from: prev, to: arcTo, feedRate });
          prev = arcTo;
        }
      } else {
        segments.push({ type, from, to, feedRate });
      }

      x = newX;
      y = newY;
      z = newZ;
    }
  }

  // Bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const seg of segments) {
    for (const p of [seg.from, seg.to]) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] > maxZ) maxZ = p[2];
    }
  }
  if (segments.length === 0) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  return {
    segments,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
  };
}

