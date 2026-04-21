// Extraído automaticamente de ProducaoCNC.jsx (linhas 7621-7718).

export function buildMillingOutline(compOrig, largOrig, openPaths) {
    if (openPaths.length === 0) return [[0, 0], [compOrig, 0], [compOrig, largOrig], [0, largOrig]];
    const SX = compOrig, SZ = largOrig;
    const perim = 2 * (SX + SZ);
    const corners = [[0, 0], [SX, 0], [SX, SZ], [0, SZ]];
    const cornerT = [0, SX, SX + SZ, 2 * SX + SZ];

    function snapToEdge(px2, py2) {
        const edges = [
            { x0: 0, y0: 0, x1: SX, y1: 0, t0: 0 },
            { x0: SX, y0: 0, x1: SX, y1: SZ, t0: SX },
            { x0: SX, y0: SZ, x1: 0, y1: SZ, t0: SX + SZ },
            { x0: 0, y0: SZ, x1: 0, y1: 0, t0: 2 * SX + SZ },
        ];
        let best = { dist: Infinity, x: 0, y: 0, t: 0 };
        for (const e of edges) {
            const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
            const len = Math.sqrt(dx * dx + dy * dy);
            const proj = Math.max(0, Math.min(1, ((px2 - e.x0) * dx + (py2 - e.y0) * dy) / (len * len)));
            const sx2 = e.x0 + proj * dx, sy2 = e.y0 + proj * dy;
            const d = Math.sqrt((px2 - sx2) ** 2 + (py2 - sy2) ** 2);
            if (d < best.dist) best = { dist: d, x: sx2, y: sy2, t: e.t0 + proj * len };
        }
        return best;
    }
    function inArc(t, a, b) {
        a = ((a % perim) + perim) % perim;
        b = ((b % perim) + perim) % perim;
        t = ((t % perim) + perim) % perim;
        if (a <= b) return t > a + 0.01 && t < b - 0.01;
        return t > a + 0.01 || t < b - 0.01;
    }

    let currentCornerFlags = [true, true, true, true];
    let result = corners.map(c => [...c]);

    for (const pts of openPaths) {
        if (pts.length < 2) continue;
        const first = snapToEdge(pts[0][0], pts[0][1]);
        const last = snapToEdge(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        const midIdx = Math.floor(pts.length / 2);
        let closestCI = 0, closestDist = Infinity;
        for (let ci = 0; ci < 4; ci++) {
            const d = Math.hypot(corners[ci][0] - pts[midIdx][0], corners[ci][1] - pts[midIdx][1]);
            if (d < closestDist) { closestDist = d; closestCI = ci; }
        }
        const wasteIsFirstToLast = inArc(cornerT[closestCI], first.t, last.t);
        const skipCorner = [false, false, false, false];
        for (let ci = 0; ci < 4; ci++) {
            if (wasteIsFirstToLast) {
                if (inArc(cornerT[ci], first.t, last.t)) skipCorner[ci] = true;
            } else {
                if (inArc(cornerT[ci], last.t, first.t)) skipCorner[ci] = true;
            }
        }
        const newResult = [];
        if (wasteIsFirstToLast) {
            newResult.push([last.x, last.y]);
            const keptCorners = [];
            for (let ci = 0; ci < 4; ci++) {
                if (skipCorner[ci] || !currentCornerFlags[ci]) continue;
                if (inArc(cornerT[ci], last.t, first.t)) {
                    let rel = cornerT[ci] - last.t; if (rel < 0) rel += perim;
                    keptCorners.push({ idx: ci, rel });
                }
            }
            keptCorners.sort((a, b) => a.rel - b.rel);
            for (const kc of keptCorners) newResult.push([...corners[kc.idx]]);
            newResult.push([first.x, first.y]);
            for (const pt of pts) newResult.push([pt[0], pt[1]]);
        } else {
            newResult.push([first.x, first.y]);
            const keptCorners = [];
            for (let ci = 0; ci < 4; ci++) {
                if (skipCorner[ci] || !currentCornerFlags[ci]) continue;
                if (inArc(cornerT[ci], first.t, last.t)) {
                    let rel = cornerT[ci] - first.t; if (rel < 0) rel += perim;
                    keptCorners.push({ idx: ci, rel });
                }
            }
            keptCorners.sort((a, b) => a.rel - b.rel);
            for (const kc of keptCorners) newResult.push([...corners[kc.idx]]);
            newResult.push([last.x, last.y]);
            for (let pi2 = pts.length - 1; pi2 >= 0; pi2--) newResult.push([pts[pi2][0], pts[pi2][1]]);
        }
        result = newResult;
        for (let ci = 0; ci < 4; ci++) { if (skipCorner[ci]) currentCornerFlags[ci] = false; }
    }
    return result;
}

// ─── Render machining operations (usinagens) on piece SVG ──
// Usa exatamente a mesma lógica do gerador de G-code para transformar coordenadas.
// machining_json coords: x = eixo comprimento original, y = eixo largura original
// No plano: se NÃO rotated → p.w=comprimento, p.h=largura
//           se rotated     → p.w=largura,      p.h=comprimento
// Rotação (igual ao backend): transformRotated(wx,wy,compOrig) → {x: wy, y: compOrig - wx}
let _machClipId = 0;
