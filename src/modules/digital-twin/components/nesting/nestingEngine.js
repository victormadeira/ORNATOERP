// @ts-check
/**
 * Nesting Engine — algoritmo Bottom-Left Fill (BLF) com rotação 0°/90°.
 * Não é o ótimo global (SVGnest faz melhor com polígonos reais), mas para
 * peças retangulares (padrão marcenaria) o BLF já entrega 75-85% de
 * aproveitamento, o que é comparável ao industrial para MDF em chapas 2750x1840.
 *
 * @param {import('../../types/cnc.types.js').PieceNesting[]} pieces
 * @param {import('../../types/cnc.types.js').NestingConfig} [config]
 * @returns {import('../../types/cnc.types.js').NestingResult}
 */
export function computeNesting(pieces, config) {
  const cfg = {
    sheetWidth: 2750,
    sheetHeight: 1840,
    kerf: 6,
    bleed: 10,
    ...config,
  };

  // Expandir quantidades: [{ pieceId, qty:3 }] → 3 entradas
  /** @type {Array<{pieceId:string, w:number, h:number, allowRotation:boolean, material:string}>} */
  const expanded = [];
  for (const p of pieces) {
    for (let i = 0; i < p.quantity; i++) {
      // Aplicar kerf + bleed já no tamanho da peça (cada peça reserva esse gap ao redor)
      expanded.push({
        pieceId: p.pieceId,
        w: p.width + cfg.kerf,
        h: p.height + cfg.kerf,
        allowRotation: p.allowRotation,
        material: p.material,
      });
    }
  }

  // Ordenar: maior área primeiro (First Fit Decreasing-like)
  expanded.sort((a, b) => b.w * b.h - a.w * a.h);

  /** @type {import('../../types/cnc.types.js').PlacedPiece[]} */
  const placed = [];
  /** @type {Array<{pieceId:string, w:number, h:number, reason:string}>} */
  const unplaced = [];
  /** @type {Array<{ occupied: Array<{x:number,y:number,w:number,h:number}> }>} */
  const sheets = [{ occupied: [] }];

  // Zona utilizável por chapa (descontando bleed das bordas)
  const usableW = cfg.sheetWidth - cfg.bleed * 2;
  const usableH = cfg.sheetHeight - cfg.bleed * 2;

  for (const item of expanded) {
    let placedItem = false;

    // Orientações possíveis (0° e 90° se permitido)
    /** @type {Array<{w:number, h:number, rot:0|90}>} */
    const orientations = item.allowRotation
      ? [{ w: item.w, h: item.h, rot: 0 }, { w: item.h, h: item.w, rot: 90 }]
      : [{ w: item.w, h: item.h, rot: 0 }];

    for (let sheetIdx = 0; sheetIdx < sheets.length && !placedItem; sheetIdx++) {
      for (const orient of orientations) {
        if (orient.w > usableW || orient.h > usableH) continue;

        const pos = findBottomLeft(sheets[sheetIdx].occupied, orient.w, orient.h, usableW, usableH);
        if (pos) {
          sheets[sheetIdx].occupied.push({ x: pos.x, y: pos.y, w: orient.w, h: orient.h });
          placed.push({
            pieceId: item.pieceId,
            x: pos.x + cfg.bleed,
            y: pos.y + cfg.bleed,
            rotation: orient.rot,
            sheetIndex: sheetIdx,
          });
          placedItem = true;
          break;
        }
      }
    }

    // Não coube em nenhuma chapa existente → nova chapa
    if (!placedItem) {
      const orient = orientations[0];
      if (orient.w > usableW || orient.h > usableH) {
        // Peça maior que a chapa — registra como não-colocada para o caller tratar
        console.warn('[nesting] peça maior que chapa:', item.pieceId, item.w, item.h);
        unplaced.push({
          pieceId: item.pieceId,
          w: item.w - cfg.kerf,
          h: item.h - cfg.kerf,
          reason: 'excede_chapa',
        });
        continue;
      }
      sheets.push({ occupied: [{ x: 0, y: 0, w: orient.w, h: orient.h }] });
      placed.push({
        pieceId: item.pieceId,
        x: cfg.bleed,
        y: cfg.bleed,
        rotation: orient.rot,
        sheetIndex: sheets.length - 1,
      });
    }
  }

  // Cálculos finais
  const totalSheetArea = sheets.length * cfg.sheetWidth * cfg.sheetHeight;
  let usedArea = 0;
  for (const sheet of sheets) {
    for (const rect of sheet.occupied) {
      // Remover kerf do cálculo de área útil real
      const realW = rect.w - cfg.kerf;
      const realH = rect.h - cfg.kerf;
      usedArea += realW * realH;
    }
  }

  const kerfLossArea = totalSheetArea === 0
    ? 0
    : sheets.reduce((sum, sh) => {
      return sum + sh.occupied.reduce((s, r) => s + (r.w * r.h - (r.w - cfg.kerf) * (r.h - cfg.kerf)), 0);
    }, 0);

  return {
    placed,
    unplaced, // peças que não couberam em nenhuma chapa (excede dimensões)
    sheetsUsed: sheets.length,
    utilizationPercent: totalSheetArea > 0 ? (usedArea / totalSheetArea) * 100 : 0,
    wasteArea: (totalSheetArea - usedArea - kerfLossArea) / 1_000_000, // m²
    kerfLoss: kerfLossArea / 1_000_000, // m²
    config: cfg,
  };
}

/**
 * Encontra a posição Bottom-Left mais baixa-e-esquerda possível para colocar um retângulo.
 * @param {Array<{x:number,y:number,w:number,h:number}>} occupied
 * @param {number} w
 * @param {number} h
 * @param {number} sheetW
 * @param {number} sheetH
 * @returns {{x:number,y:number}|null}
 */
function findBottomLeft(occupied, w, h, sheetW, sheetH) {
  // Pontos candidatos: cantos (0,0), direita de cada ocupado, topo de cada ocupado
  /** @type {Array<{x:number,y:number}>} */
  const candidates = [{ x: 0, y: 0 }];
  for (const rect of occupied) {
    candidates.push({ x: rect.x + rect.w, y: rect.y });
    candidates.push({ x: rect.x, y: rect.y + rect.h });
  }

  // Ordenar por (y, x) — bottom-left
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);

  for (const c of candidates) {
    if (c.x + w > sheetW || c.y + h > sheetH) continue;
    // Checa colisão com todos os ocupados
    let collides = false;
    for (const rect of occupied) {
      if (
        c.x < rect.x + rect.w &&
        c.x + w > rect.x &&
        c.y < rect.y + rect.h &&
        c.y + h > rect.y
      ) {
        collides = true;
        break;
      }
    }
    if (!collides) return c;
  }
  return null;
}
