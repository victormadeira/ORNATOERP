// @ts-check
/**
 * Nesting simples Bottom-Left Fill — espelhado do frontend
 * (src/modules/digital-twin/components/nesting/nestingEngine.js).
 * Expõe versão idêntica para /api/digital-twin/nesting.
 */

/**
 * @param {Array<{pieceId:string, width:number, height:number, quantity:number, allowRotation:boolean, material:string}>} pieces
 * @param {{sheetWidth?:number, sheetHeight?:number, kerf?:number, bleed?:number}} [config]
 */
export function computeNesting(pieces, config = {}) {
  const cfg = {
    sheetWidth: 2750,
    sheetHeight: 1840,
    kerf: 6,
    bleed: 10,
    ...config,
  };

  const expanded = [];
  for (const p of pieces) {
    for (let i = 0; i < (p.quantity || 1); i++) {
      expanded.push({
        pieceId: p.pieceId,
        w: p.width + cfg.kerf,
        h: p.height + cfg.kerf,
        allowRotation: p.allowRotation !== false,
        material: p.material,
      });
    }
  }
  expanded.sort((a, b) => b.w * b.h - a.w * a.h);

  const placed = [];
  const sheets = [{ occupied: [] }];
  const usableW = cfg.sheetWidth - cfg.bleed * 2;
  const usableH = cfg.sheetHeight - cfg.bleed * 2;

  for (const item of expanded) {
    let placedItem = false;
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

    if (!placedItem) {
      const orient = orientations[0];
      if (orient.w > usableW || orient.h > usableH) continue;
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

  const totalSheetArea = sheets.length * cfg.sheetWidth * cfg.sheetHeight;
  let usedArea = 0;
  let kerfLossArea = 0;
  for (const sheet of sheets) {
    for (const rect of sheet.occupied) {
      const realW = rect.w - cfg.kerf;
      const realH = rect.h - cfg.kerf;
      usedArea += realW * realH;
      kerfLossArea += rect.w * rect.h - realW * realH;
    }
  }

  return {
    placed,
    sheetsUsed: sheets.length,
    utilizationPercent: totalSheetArea > 0 ? (usedArea / totalSheetArea) * 100 : 0,
    wasteArea: (totalSheetArea - usedArea - kerfLossArea) / 1_000_000,
    kerfLoss: kerfLossArea / 1_000_000,
    config: cfg,
  };
}

function findBottomLeft(occupied, w, h, sheetW, sheetH) {
  const candidates = [{ x: 0, y: 0 }];
  for (const rect of occupied) {
    candidates.push({ x: rect.x + rect.w, y: rect.y });
    candidates.push({ x: rect.x, y: rect.y + rect.h });
  }
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);

  for (const c of candidates) {
    if (c.x + w > sheetW || c.y + h > sheetH) continue;
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
