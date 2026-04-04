// ═══════════════════════════════════════════════════════════════════
// ENGINE DE NESTING 2D — Módulo Compartilhado
// Extraído de cnc.js para reutilização em plano-corte.js
//
// Baseado em:
//   • Jukka Jylanki, "A Thousand Ways to Pack the Bin" (MaxRects-BSSF/CP)
//   • Skyline Bottom-Left com Waste Map (stb_rect_pack / Vernay)
//   • GDRR-2BP (Ruin & Recreate + Late Acceptance Hill Climbing)
//   • BRKGA — Biased Random-Key Genetic Algorithm (Gonçalves & Resende)
//   • Corte guilhotina com SLA (Shorter Leftover Axis)
//   • Multi-pass portfolio (40+ combinações paralelas)
// ═══════════════════════════════════════════════════════════════════

// ─── Module-level state for vacuum-aware nesting ──────────────────
let _vacuumAware = false;

export function setVacuumAware(v) { _vacuumAware = !!v; }
export function getVacuumAware() { return _vacuumAware; }

// ─── Contour / Polygon Utilities ────────────────────────────────
// Shoelace formula for polygon area
export function calculatePolygonArea(points) {
    if (!points || points.length < 3) return 0;
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

// Ray-casting point-in-polygon test
export function isPointInPolygon(px, py, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// Compute bounding box of contour
export function contourBoundingBox(points) {
    if (!points || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ─── Helpers MaxRects ────────────────────────────────────────────
export function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function isContainedIn(a, b) {
    return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}
export function pruneFreeList(rects) {
    const result = [];
    for (let i = 0; i < rects.length; i++) {
        let dominated = false;
        for (let j = 0; j < rects.length; j++) {
            if (i === j) continue;
            if (isContainedIn(rects[i], rects[j])) { dominated = true; break; }
        }
        if (!dominated) result.push(rects[i]);
    }
    return result;
}

// ─── Clip & Keep: resolver sobreposição de freeRects ─────────────
export function clipRect(a, b) {
    if (a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h) return [a];
    const result = [];
    if (a.y < b.y) result.push({ x: a.x, y: a.y, w: a.w, h: b.y - a.y });
    if (a.y + a.h > b.y + b.h) result.push({ x: a.x, y: b.y + b.h, w: a.w, h: (a.y + a.h) - (b.y + b.h) });
    const oy1 = Math.max(a.y, b.y), oy2 = Math.min(a.y + a.h, b.y + b.h);
    if (oy2 > oy1) {
        if (a.x < b.x) result.push({ x: a.x, y: oy1, w: b.x - a.x, h: oy2 - oy1 });
        if (a.x + a.w > b.x + b.w) result.push({ x: b.x + b.w, y: oy1, w: (a.x + a.w) - (b.x + b.w), h: oy2 - oy1 });
    }
    return result;
}
export function clipAndKeep(freeRects, sobraMinW, sobraMinH) {
    const candidates = freeRects
        .filter(fr => {
            const w = Math.round(fr.w), h = Math.round(fr.h);
            return (w >= sobraMinW && h >= sobraMinH) || (h >= sobraMinW && w >= sobraMinH);
        })
        .sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const accepted = [];
    for (const cand of candidates) {
        let remaining = [{ x: cand.x, y: cand.y, w: cand.w, h: cand.h }];
        for (const acc of accepted) {
            remaining = remaining.flatMap(r => clipRect(r, acc));
        }
        const valid = remaining.filter(r => {
            const w = Math.round(r.w), h = Math.round(r.h);
            return (w >= sobraMinW && h >= sobraMinH) || (h >= sobraMinW && w >= sobraMinH);
        });
        if (valid.length > 0) {
            valid.sort((a, b) => (b.w * b.h) - (a.w * a.h));
            accepted.push(valid[0]);
        }
    }
    return accepted;
}

// ─── MaxRectsBin (CNC livre — sem restrição guilhotina) ──────────
export class MaxRectsBin {
    constructor(width, height, spacing, splitDir = 'auto') {
        this.binW = width; this.binH = height; this.spacing = spacing;
        this.splitDir = splitDir; // 'horizontal', 'vertical', 'auto'/'misto'
        this.vacuumAware = _vacuumAware;
        this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
        this.usedRects = [];
    }
    _contactLength(x, y, w, h) {
        let score = 0;
        if (x === 0 || x + w >= this.binW) score += h;
        if (y === 0 || y + h >= this.binH) score += w;
        for (const used of this.usedRects) {
            const uw = used.realW || used.w, uh = used.realH || used.h;
            if (Math.abs(used.x + uw - x) < 1 || Math.abs(x + w - used.x) < 1) {
                const overlap = Math.min(y + h, used.y + uh) - Math.max(y, used.y);
                if (overlap > 0) score += overlap;
            }
            if (Math.abs(used.y + uh - y) < 1 || Math.abs(y + h - used.y) < 1) {
                const overlap = Math.min(x + w, used.x + uw) - Math.max(x, used.x);
                if (overlap > 0) score += overlap;
            }
        }
        return score;
    }
    _tryFit(free, pw, ph, heuristic) {
        const w = pw + this.spacing, h = ph + this.spacing;
        if (w > free.w || h > free.h) return null;
        let sc;
        // When direction is explicitly set, OVERRIDE heuristic with directional placement
        if (this.splitDir === 'horizontal') {
            // Horizontal: fill in rows (low y first, then low x) → leaves wide remnants at bottom
            sc = free.y * 100000 + free.x;
        } else if (this.splitDir === 'vertical') {
            // Vertical: fill in columns (low x first, then low y) → leaves tall remnants on right
            sc = free.x * 100000 + free.y;
        } else {
            switch (heuristic) {
                case 'BLSF': sc = Math.max(free.w - w, free.h - h); break;
                case 'BAF':  sc = (free.w * free.h) - (w * h); break;
                case 'BL':   sc = free.y * 100000 + free.x; break;
                case 'CP':   sc = -this._contactLength(free.x, free.y, pw, ph); break;
                default:     sc = Math.min(free.w - w, free.h - h); break; // BSSF
            }
        }
        return { x: free.x, y: free.y, w, h, realW: pw, realH: ph, score: sc };
    }
    findBest(pw, ph, allowRotate, heuristic = 'BSSF', pieceClass = 'normal') {
        let bestScore = Infinity, bestRect = null;
        const centerX = this.binW / 2, centerY = this.binH / 2;
        const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
        for (const free of this.freeRects) {
            const applyVacuum = (fit) => {
                if (!fit || !this.vacuumAware || pieceClass === 'normal') return fit;
                const pcx = fit.x + fit.realW / 2, pcy = fit.y + fit.realH / 2;
                const dist = Math.sqrt((pcx - centerX) ** 2 + (pcy - centerY) ** 2) / maxDist;
                const weight = pieceClass === 'super_pequena' ? 0.4 : 0.2;
                fit.score += dist * weight * Math.abs(fit.score || 1);
                return fit;
            };
            const norm = applyVacuum(this._tryFit(free, pw, ph, heuristic));
            if (norm && norm.score < bestScore) { bestScore = norm.score; bestRect = { ...norm, rotated: false }; }
            if (allowRotate && (pw !== ph)) {
                const rot = applyVacuum(this._tryFit(free, ph, pw, heuristic));
                // Directional rotation preference: STRONGLY prefer orientation aligned with direction
                if (rot && this.splitDir === 'horizontal') {
                    // horizontal → prefer wider placement (realW > realH) — penalize heavily if rotation makes it narrower
                    if (ph < pw) rot.score += 5000;
                } else if (rot && this.splitDir === 'vertical') {
                    // vertical → prefer taller placement (realH > realW) — penalize heavily if rotation makes it shorter
                    if (pw < ph) rot.score += 5000;
                }
                if (rot && rot.score < bestScore) { bestScore = rot.score; bestRect = { ...rot, realW: ph, realH: pw, rotated: true }; }
            }
        }
        return bestRect;
    }
    placeRect(rect) {
        const newFree = [];
        for (const free of this.freeRects) {
            if (!intersects(rect, free)) { newFree.push(free); continue; }
            // Standard MaxRects split — all 4 maximal sub-rectangles
            if (rect.x > free.x) newFree.push({ x: free.x, y: free.y, w: rect.x - free.x, h: free.h });
            if (rect.x + rect.w < free.x + free.w) newFree.push({ x: rect.x + rect.w, y: free.y, w: (free.x + free.w) - (rect.x + rect.w), h: free.h });
            if (rect.y > free.y) newFree.push({ x: free.x, y: free.y, w: free.w, h: rect.y - free.y });
            if (rect.y + rect.h < free.y + free.h) newFree.push({ x: free.x, y: rect.y + rect.h, w: free.w, h: (free.y + free.h) - (rect.y + rect.h) });
        }
        this.freeRects = pruneFreeList(newFree);
        this.usedRects.push(rect);
    }
    occupancy() {
        let area = 0;
        for (const r of this.usedRects) {
            // Use actual contour area if available (irregular pieces)
            if (r.contourArea && r.contourArea > 0) {
                area += r.contourArea;
            } else {
                area += r.realW * r.realH;
            }
        }
        return area / (this.binW * this.binH) * 100;
    }
}

// ─── SkylineBin (Bottom-Left com Waste Map) ──────────────────────
export class SkylineBin {
    constructor(width, height, spacing, splitDir = 'auto') {
        this.binW = width; this.binH = height; this.spacing = spacing;
        this.splitDir = splitDir;
        this.skyline = [{ x: 0, y: 0, w: width }];
        this.usedRects = [];
        this.wasteRects = [];
    }
    _fitCheck(startIdx, w, h) {
        let remainW = w;
        let maxY = 0;
        let i = startIdx;
        if (this.skyline[i].x + w > this.binW) return -1;
        while (remainW > 0) {
            if (i >= this.skyline.length) return -1;
            maxY = Math.max(maxY, this.skyline[i].y);
            if (maxY + h > this.binH) return -1;
            let segW;
            if (i === startIdx) {
                segW = Math.min(this.skyline[i].x + this.skyline[i].w - this.skyline[startIdx].x, remainW);
            } else {
                segW = Math.min(this.skyline[i].w, remainW);
            }
            remainW -= segW;
            i++;
        }
        return maxY;
    }
    findBest(pw, ph, allowRotate, _heuristic) {
        const sp = this.spacing;
        for (let wi = 0; wi < this.wasteRects.length; wi++) {
            const wr = this.wasteRects[wi];
            if (pw + sp <= wr.w && ph + sp <= wr.h) {
                return { x: wr.x, y: wr.y, w: pw + sp, h: ph + sp, realW: pw, realH: ph, rotated: false, wasteIdx: wi, score: -(wr.w * wr.h) };
            }
            if (allowRotate && ph + sp <= wr.w && pw + sp <= wr.h) {
                return { x: wr.x, y: wr.y, w: ph + sp, h: pw + sp, realW: ph, realH: pw, rotated: true, wasteIdx: wi, score: -(wr.w * wr.h) };
            }
        }
        let bestY = Infinity, bestX = Infinity, bestIdx = -1, bestRot = false;
        const tryOrientation = (w, h, rot) => {
            for (let i = 0; i < this.skyline.length; i++) {
                const y = this._fitCheck(i, w + sp, h + sp);
                if (y >= 0) {
                    const topY = y + h + sp;
                    if (topY < bestY || (topY === bestY && this.skyline[i].x < bestX)) {
                        bestY = topY; bestX = this.skyline[i].x; bestIdx = i; bestRot = rot;
                    }
                }
            }
        };
        // Directional preference: try preferred orientation first so it wins on ties
        if (this.splitDir === 'vertical' && allowRotate && pw > ph) {
            // vertical → prefer taller pieces, try rotated (h>w) first
            tryOrientation(ph, pw, true);
            tryOrientation(pw, ph, false);
        } else if (this.splitDir === 'horizontal' && allowRotate && ph > pw) {
            // horizontal → prefer wider pieces, try rotated (w>h) first
            tryOrientation(ph, pw, true);
            tryOrientation(pw, ph, false);
        } else {
            tryOrientation(pw, ph, false);
            if (allowRotate) tryOrientation(ph, pw, true);
        }
        if (bestIdx < 0) return null;
        const rw = bestRot ? ph : pw, rh = bestRot ? pw : ph;
        return { x: bestX, y: bestY - rh - sp, w: rw + sp, h: rh + sp, realW: rw, realH: rh, rotated: bestRot, skyIdx: bestIdx, score: bestY };
    }
    placeRect(info) {
        const sp = this.spacing;
        if (info.wasteIdx != null) {
            const wr = this.wasteRects[info.wasteIdx];
            const rightW = wr.w - info.w;
            const bottomH = wr.h - info.h;
            this.wasteRects.splice(info.wasteIdx, 1);
            if (rightW > sp * 2) this.wasteRects.push({ x: wr.x + info.w, y: wr.y, w: rightW, h: wr.h });
            if (bottomH > sp * 2) this.wasteRects.push({ x: wr.x, y: wr.y + info.h, w: info.w, h: bottomH });
            const placed = { x: info.x, y: info.y, w: info.realW, h: info.realH, realW: info.realW, realH: info.realH, rotated: info.rotated };
            this.usedRects.push(placed);
            return placed;
        }
        const px = info.x, py = info.y, pw = info.w, ph = info.h;
        let scanW = pw, scanIdx = info.skyIdx;
        while (scanW > 0 && scanIdx < this.skyline.length) {
            const seg = this.skyline[scanIdx];
            const segStart = Math.max(seg.x, px);
            const segEnd = Math.min(seg.x + seg.w, px + pw);
            const segW = segEnd - segStart;
            if (segW > 0 && py > seg.y) {
                const gapH = py - seg.y;
                if (gapH > sp * 2 && segW > sp * 2) {
                    this.wasteRects.push({ x: segStart, y: seg.y, w: segW, h: gapH });
                }
            }
            scanW -= segW;
            scanIdx++;
        }
        const newSeg = { x: px, y: py + ph, w: pw };
        const newSkyline = [];
        let inserted = false;
        for (const seg of this.skyline) {
            const segRight = seg.x + seg.w;
            const newRight = px + pw;
            if (segRight <= px || seg.x >= newRight) {
                newSkyline.push(seg); continue;
            }
            if (seg.x < px) newSkyline.push({ x: seg.x, y: seg.y, w: px - seg.x });
            if (!inserted) { newSkyline.push(newSeg); inserted = true; }
            if (segRight > newRight) newSkyline.push({ x: newRight, y: seg.y, w: segRight - newRight });
        }
        const merged = [newSkyline[0]];
        for (let i = 1; i < newSkyline.length; i++) {
            const last = merged[merged.length - 1];
            if (Math.abs(last.y - newSkyline[i].y) < 0.5 && Math.abs(last.x + last.w - newSkyline[i].x) < 0.5) {
                last.w += newSkyline[i].w;
            } else {
                merged.push(newSkyline[i]);
            }
        }
        this.skyline = merged;
        const placed = { x: px, y: py, w: info.realW, h: info.realH, realW: info.realW, realH: info.realH, rotated: info.rotated };
        this.usedRects.push(placed);
        return placed;
    }
    occupancy() {
        let area = 0;
        for (const r of this.usedRects) area += (r.realW || r.w) * (r.realH || r.h);
        return area / (this.binW * this.binH) * 100;
    }
    get freeRects() {
        const rects = [...this.wasteRects];
        for (const seg of this.skyline) {
            if (this.binH - seg.y > 1) rects.push({ x: seg.x, y: seg.y, w: seg.w, h: this.binH - seg.y });
        }
        return rects;
    }
    get cuts() { return []; }
}

// ─── GuillotineBin (esquadrejadeira — cortes ponta-a-ponta) ──────
export class GuillotineBin {
    constructor(width, height, kerf, splitDir = 'auto') {
        this.binW = width; this.binH = height; this.kerf = kerf;
        this.splitDir = splitDir;
        this.vacuumAware = _vacuumAware;
        this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
        this.usedRects = [];
        this.cuts = [];
    }
    findBest(pw, ph, allowRotate, heuristic = 'BSSF', pieceClass = 'normal') {
        let bestScore = Infinity, bestIdx = -1, bestRotated = false;
        const centerX = this.binW / 2, centerY = this.binH / 2;
        const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
        for (let i = 0; i < this.freeRects.length; i++) {
            const f = this.freeRects[i];
            const tryPlace = (tw, th, rot) => {
                if (tw > f.w || th > f.h) return;
                let sc;
                switch (heuristic) {
                    case 'BLSF': sc = Math.max(f.w - tw, f.h - th); break;
                    case 'BAF':  sc = (f.w * f.h) - (tw * th); break;
                    case 'BL':   sc = f.y * 100000 + f.x; break;
                    default:     sc = Math.min(f.w - tw, f.h - th); break;
                }
                if (this.vacuumAware && pieceClass !== 'normal') {
                    const pcx = f.x + tw / 2, pcy = f.y + th / 2;
                    const dist = Math.sqrt((pcx - centerX) ** 2 + (pcy - centerY) ** 2) / maxDist;
                    const weight = pieceClass === 'super_pequena' ? 0.4 : 0.2;
                    sc += dist * weight * sc;
                }
                if (sc < bestScore) { bestScore = sc; bestIdx = i; bestRotated = rot; }
            };
            tryPlace(pw, ph, false);
            if (allowRotate) tryPlace(ph, pw, true);
        }
        if (bestIdx < 0) return null;
        const f = this.freeRects[bestIdx];
        const rw = bestRotated ? ph : pw, rh = bestRotated ? pw : ph;
        return { freeIdx: bestIdx, x: f.x, y: f.y, w: rw, h: rh, realW: rw, realH: rh, rotated: bestRotated, score: bestScore };
    }
    placeRect(info) {
        const f = this.freeRects[info.freeIdx];
        const pw = info.w, ph = info.h;
        const kerf = this.kerf;
        const placed = { x: f.x, y: f.y, w: pw, h: ph, realW: info.realW, realH: info.realH, rotated: info.rotated };

        this.freeRects.splice(info.freeIdx, 1);

        const rightW = f.w - pw - kerf;
        const bottomH = f.h - ph - kerf;

        if (rightW > 1 && bottomH > 1) {
            let useVerticalSplit;
            switch (this.splitDir) {
                case 'horizontal': useVerticalSplit = false; break;
                case 'vertical': useVerticalSplit = true; break;
                default:
                    const maxV = Math.max(rightW * f.h, pw * bottomH);
                    const maxH = Math.max(rightW * ph, f.w * bottomH);
                    useVerticalSplit = maxV >= maxH;
            }
            if (useVerticalSplit) {
                this.freeRects.push({ x: f.x + pw + kerf, y: f.y, w: rightW, h: f.h });
                this.freeRects.push({ x: f.x, y: f.y + ph + kerf, w: pw, h: bottomH });
                this.cuts.push({ dir: 'V', x: f.x + pw, y: f.y, len: f.h });
                this.cuts.push({ dir: 'H', x: f.x, y: f.y + ph, len: pw });
            } else {
                this.freeRects.push({ x: f.x, y: f.y + ph + kerf, w: f.w, h: bottomH });
                this.freeRects.push({ x: f.x + pw + kerf, y: f.y, w: rightW, h: ph });
                this.cuts.push({ dir: 'H', x: f.x, y: f.y + ph, len: f.w });
                this.cuts.push({ dir: 'V', x: f.x + pw, y: f.y, len: ph });
            }
        } else if (rightW > 1) {
            this.freeRects.push({ x: f.x + pw + kerf, y: f.y, w: rightW, h: f.h });
            this.cuts.push({ dir: 'V', x: f.x + pw, y: f.y, len: f.h });
        } else if (bottomH > 1) {
            this.freeRects.push({ x: f.x, y: f.y + ph + kerf, w: f.w, h: bottomH });
            this.cuts.push({ dir: 'H', x: f.x, y: f.y + ph, len: f.w });
        }

        this.usedRects.push(placed);
        return placed;
    }
    occupancy() {
        let area = 0;
        for (const r of this.usedRects) area += r.realW * r.realH;
        return area / (this.binW * this.binH) * 100;
    }
}

// ─── ShelfBin (prateleira/faixa — ideal para esquadrejadeira) ────
export class ShelfBin {
    constructor(width, height, gap) {
        this.binW = width; this.binH = height; this.gap = gap;
        this.shelves = [];
        this.usedRects = [];
    }
    findBest(pw, ph, allowRotate, _heuristic) {
        let bestScore = Infinity, bestResult = null;
        for (let s = 0; s < this.shelves.length; s++) {
            const shelf = this.shelves[s];
            const freeW = this.binW - shelf.usedW;
            if (pw + this.gap <= freeW && ph <= shelf.h) {
                const waste = shelf.h - ph;
                if (waste < bestScore) {
                    bestScore = waste;
                    bestResult = { shelfIdx: s, newShelf: false,
                        x: shelf.usedW, y: shelf.y, w: pw, h: ph,
                        realW: pw, realH: ph, rotated: false, score: waste };
                }
            }
            if (allowRotate && ph + this.gap <= freeW && pw <= shelf.h) {
                const waste = shelf.h - pw;
                if (waste < bestScore) {
                    bestScore = waste;
                    bestResult = { shelfIdx: s, newShelf: false,
                        x: shelf.usedW, y: shelf.y, w: ph, h: pw,
                        realW: ph, realH: pw, rotated: true, score: waste };
                }
            }
        }
        const nextY = this.shelves.length > 0
            ? this.shelves[this.shelves.length - 1].y + this.shelves[this.shelves.length - 1].h + this.gap
            : 0;
        if (!bestResult || bestScore > ph * 0.3) {
            if (nextY + ph <= this.binH && pw + this.gap <= this.binW) {
                bestResult = { shelfIdx: this.shelves.length, newShelf: true, shelfH: ph,
                    x: 0, y: nextY, w: pw, h: ph, realW: pw, realH: ph,
                    rotated: false, score: 0 };
            }
            if (allowRotate && nextY + pw <= this.binH && ph + this.gap <= this.binW) {
                if (!bestResult || pw < ph) {
                    bestResult = { shelfIdx: this.shelves.length, newShelf: true, shelfH: pw,
                        x: 0, y: nextY, w: ph, h: pw, realW: ph, realH: pw,
                        rotated: true, score: 0 };
                }
            }
        }
        return bestResult;
    }
    placeRect(info) {
        if (info.newShelf) {
            this.shelves.push({ y: info.y, h: info.shelfH, usedW: info.w + this.gap, pieces: [] });
        } else {
            this.shelves[info.shelfIdx].usedW += info.w + this.gap;
        }
        const placed = { x: info.x, y: info.y, w: info.w, h: info.h,
            realW: info.realW, realH: info.realH, rotated: info.rotated, pieceRef: info.pieceRef };
        this.usedRects.push(placed);
        return placed;
    }
    occupancy() {
        let area = 0;
        for (const r of this.usedRects) area += r.realW * r.realH;
        return area / (this.binW * this.binH) * 100;
    }
    get freeRects() {
        const rects = [];
        const usedH = this.shelves.length > 0
            ? this.shelves[this.shelves.length - 1].y + this.shelves[this.shelves.length - 1].h
            : 0;
        if (this.binH - usedH > 1) rects.push({ x: 0, y: usedH, w: this.binW, h: this.binH - usedH });
        for (const shelf of this.shelves) {
            const freeW = this.binW - shelf.usedW;
            if (freeW > 1) rects.push({ x: shelf.usedW, y: shelf.y, w: freeW, h: shelf.h });
        }
        return rects;
    }
    get cuts() {
        const cutsArr = [];
        for (let i = 0; i < this.shelves.length; i++) {
            const shelf = this.shelves[i];
            if (shelf.y + shelf.h < this.binH) {
                cutsArr.push({ dir: 'H', y: shelf.y + shelf.h, x: 0, len: this.binW });
            }
        }
        return cutsArr;
    }
}

// ─── Helpers de classificação e scoring ──────────────────────────

export function classifyBySize(pieces) {
    if (pieces.length === 0) return { small: [], medium: [], large: [] };
    const avgArea = pieces.reduce((s, p) => s + p.area, 0) / pieces.length;
    const small = [], medium = [], large = [];
    for (const p of pieces) {
        if (p.area <= avgArea * 0.5) small.push(p);
        else if (p.area <= avgArea * 1.5) medium.push(p);
        else large.push(p);
    }
    return { small, medium, large };
}

export function scoreResult(bins) {
    if (bins.length === 0) return { bins: 0, avgOccupancy: 0, minOccupancy: 0, score: Infinity };
    if (!verifyNoOverlaps(bins)) return { bins: bins.length, avgOccupancy: 0, minOccupancy: 0, score: Infinity };
    const occupancies = bins.map(b => b.occupancy());
    const sorted = [...occupancies].sort((a, b) => b - a);
    const n = bins.length;
    const avgOccupancy = occupancies.reduce((s, o) => s + o, 0) / n;
    const minOccupancy = Math.min(...occupancies);

    // ─── Scoring v2: chapas mínimas é o OBJETIVO PRINCIPAL ───────
    let score = n * 10000;                          // Penalidade forte por chapa (eliminar chapas é prioridade)

    // Recompensa progressiva por aproveitamento (quadrática — premia altos valores)
    for (const occ of sorted) {
        score -= occ * occ * 0.15;                  // Progressiva: 90%→-1215, 70%→-735, 50%→-375
        // Bônus escalonado
        if (occ >= 95) score -= 2500;
        else if (occ >= 90) score -= 1800;
        else if (occ >= 80) score -= 1000;
        else if (occ >= 70) score -= 500;
        else if (occ >= 60) score -= 200;
        // Penalidades para bins subutilizados
        else if (occ < 25) score += 4000;           // Chapa quase vazia — FORTE penalidade
        else if (occ < 40) score += (40 - occ) * 80; // Penalidade progressiva
    }

    // Distribuição uniforme (variância baixa é melhor — peças bem distribuídas)
    if (n > 1) {
        const variance = sorted.reduce((s, o) => s + (o - avgOccupancy) ** 2, 0) / n;
        score += variance * 0.3;                    // Penalizar alta variância
    }

    // Recompensa especial: último bin com boa ocupação (não desperdiça chapa)
    if (n > 1 && sorted[sorted.length - 1] >= 50) score -= 800;

    // Penalidade severa para bins muito vazios em soluções multi-chapa
    if (minOccupancy < 15 && n > 1) score += 5000;

    return { bins: n, avgOccupancy, minOccupancy, score };
}

// ─── Verificação de sobreposição (segurança) ────────────────────
export function verifyNoOverlaps(bins) {
    for (let bi = 0; bi < bins.length; bi++) {
        const bin = bins[bi];
        for (let i = 0; i < bin.usedRects.length; i++) {
            for (let j = i + 1; j < bin.usedRects.length; j++) {
                const a = bin.usedRects[i], b = bin.usedRects[j];
                const aw = a.realW || a.w, ah = a.realH || a.h;
                const bw = b.realW || b.w, bh = b.realH || b.h;
                if (a.x < b.x + bw && a.x + aw > b.x &&
                    a.y < b.y + bh && a.y + ah > b.y) {
                    return false;
                }
            }
        }
    }
    return true;
}

// ─── Reparo de sobreposição (post-processing) ───────────────────
export function repairOverlaps(bins, binW, binH, spacing, binType, kerf, splitDir = 'auto') {
    for (let bi = 0; bi < bins.length; bi++) {
        const bin = bins[bi];
        let hasOverlap = false;
        for (let i = 0; i < bin.usedRects.length && !hasOverlap; i++) {
            for (let j = i + 1; j < bin.usedRects.length && !hasOverlap; j++) {
                const a = bin.usedRects[i], b = bin.usedRects[j];
                const aw = a.realW || a.w, ah = a.realH || a.h;
                const bw = b.realW || b.w, bh = b.realH || b.h;
                if (a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y) {
                    hasOverlap = true;
                }
            }
        }
        if (!hasOverlap) continue;
        const pieces = bin.usedRects.map(r => ({
            ref: r.pieceRef, w: r.realW || r.w, h: r.realH || r.h,
            allowRotate: r.allowRotate || false,
            area: (r.realW || r.w) * (r.realH || r.h),
        })).filter(p => p.ref);
        pieces.sort((a, b) => b.area - a.area);
        const effSp = Math.max(kerf || 0, spacing || 0);
        const createBin = () => {
            switch (binType) {
                case 'shelf': return new ShelfBin(binW, binH, effSp);
                case 'guillotine': return new GuillotineBin(binW, binH, effSp, splitDir);
                case 'skyline': return new SkylineBin(binW, binH, effSp, splitDir);
                default: return new MaxRectsBin(binW, binH, effSp, splitDir);
            }
        };
        const newBin = createBin();
        const overflow = [];
        for (const p of pieces) {
            const rect = newBin.findBest(p.w, p.h, p.allowRotate, 'BSSF');
            if (rect) {
                rect.pieceRef = p.ref;
                rect.allowRotate = p.allowRotate;
                newBin.placeRect(rect);
            } else {
                overflow.push(p);
            }
        }
        bins[bi] = newBin;
        if (overflow.length > 0) {
            for (const p of overflow) {
                let placed = false;
                for (let nextBi = bi + 1; nextBi < bins.length && !placed; nextBi++) {
                    const rect = bins[nextBi].findBest(p.w, p.h, p.allowRotate, 'BSSF');
                    if (rect) {
                        rect.pieceRef = p.ref;
                        rect.allowRotate = p.allowRotate;
                        bins[nextBi].placeRect(rect);
                        placed = true;
                    }
                }
                if (!placed) {
                    const extra = createBin();
                    const rect = extra.findBest(p.w, p.h, p.allowRotate, 'BSSF');
                    if (rect) {
                        rect.pieceRef = p.ref;
                        rect.allowRotate = p.allowRotate;
                        extra.placeRect(rect);
                        bins.push(extra);
                    }
                }
            }
        }
    }
    return bins;
}

// ─── Compactação por gravidade (Enhanced: 10 passes + X→Y + rotation swap) ─
export function compactBin(bin, binW, binH, kerf, spacing, splitDir) {
    if (!bin.usedRects || bin.usedRects.length <= 1) return;
    const pieces = bin.usedRects;
    // Usar o MAIOR entre kerf e spacing para manter espaçamento configurado
    const k = Math.max(kerf || 0, spacing || 0);

    function collides(p, idx) {
        const pw = p.realW || p.w, ph = p.realH || p.h;
        for (let j = 0; j < pieces.length; j++) {
            if (j === idx) continue;
            const q = pieces[j];
            const qw = q.realW || q.w, qh = q.realH || q.h;
            if (p.x < q.x + qw + k && p.x + pw + k > q.x &&
                p.y < q.y + qh + k && p.y + ph + k > q.y) return true;
        }
        return false;
    }

    function tryCompactAxis(primary, secondary) {
        let moved = false;
        const order = pieces.map((_, i) => i).sort((a, b) => {
            const pa = pieces[a], pb = pieces[b];
            return primary === 'y'
                ? (pa.y + pa.x * 0.001) - (pb.y + pb.x * 0.001)
                : (pa.x + pa.y * 0.001) - (pb.x + pb.y * 0.001);
        });
        for (const i of order) {
            const p = pieces[i];
            const pw = p.realW || p.w, ph = p.realH || p.h;
            // Compact primary axis
            if (p[primary] > 0) {
                const dimP = primary === 'y' ? ph : pw;
                const maxP = primary === 'y' ? binH : binW;
                const candidates = [0];
                for (let j = 0; j < pieces.length; j++) {
                    if (j === i) continue;
                    const q = pieces[j];
                    const qdim = primary === 'y' ? (q.realH || q.h) : (q.realW || q.w);
                    candidates.push(q[primary] + qdim + k);
                }
                candidates.sort((a, b) => a - b);
                for (const c of candidates) {
                    if (c >= p[primary]) break;
                    if (c + dimP > maxP) continue;
                    const test = { ...p, [primary]: c };
                    if (!collides(test, i)) { p[primary] = c; moved = true; break; }
                }
            }
            // Compact secondary axis
            if (p[secondary] > 0) {
                const dimS = secondary === 'y' ? ph : pw;
                const maxS = secondary === 'y' ? binH : binW;
                const candidates = [0];
                for (let j = 0; j < pieces.length; j++) {
                    if (j === i) continue;
                    const q = pieces[j];
                    const qdim = secondary === 'y' ? (q.realH || q.h) : (q.realW || q.w);
                    candidates.push(q[secondary] + qdim + k);
                }
                candidates.sort((a, b) => a - b);
                for (const c of candidates) {
                    if (c >= p[secondary]) break;
                    if (c + dimS > maxS) continue;
                    const test = { ...p, [secondary]: c };
                    if (!collides(test, i)) { p[secondary] = c; moved = true; break; }
                }
            }
        }
        return moved;
    }

    // Direction-aware compaction: compact along the direction axis FIRST to preserve directional structure
    const primaryAxis = splitDir === 'vertical' ? 'x' : 'y';   // vertical→fill columns (compact X first), horizontal/auto→fill rows (compact Y first)
    const secondaryAxis = primaryAxis === 'y' ? 'x' : 'y';

    // Phase 1: Primary axis compaction (6 passes)
    for (let pass = 0; pass < 6; pass++) {
        if (!tryCompactAxis(primaryAxis, secondaryAxis)) break;
    }
    // Phase 2: Secondary axis compaction (4 passes) — catches gaps
    for (let pass = 0; pass < 4; pass++) {
        if (!tryCompactAxis(secondaryAxis, primaryAxis)) break;
    }

    // Phase 3: Rotation swap — try rotating each piece to see if it packs tighter
    for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        if (!p.allowRotate) continue;
        const pw = p.realW || p.w, ph = p.realH || p.h;
        if (Math.abs(pw - ph) < 1) continue; // Square piece, skip
        // Try swapping width/height
        const rotated = { ...p, realW: ph, realH: pw, w: ph, h: pw };
        if (rotated.x + ph > binW || rotated.y + pw > binH) continue;
        if (!collides(rotated, i)) {
            // Rotated fits — but is it better? Check if it compacts lower
            const origMaxY = p.y + ph, rotMaxY = rotated.y + pw;
            const origMaxX = p.x + pw, rotMaxX = rotated.x + ph;
            if (rotMaxY < origMaxY || (rotMaxY === origMaxY && rotMaxX < origMaxX)) {
                p.realW = ph; p.realH = pw; p.w = ph; p.h = pw;
                p.rotated = !p.rotated;
            }
        }
    }
}

// ─── Nesting pass genérico (4 tipos de bin) ──────────────────────
export function runNestingPass(pieces, binW, binH, spacing, heuristic = 'BSSF', binType = 'guillotine', kerf = 4, splitDir = 'auto') {
    // Espaçamento efetivo: o MAIOR entre kerf (disco) e spacing (espaço desejado)
    const effectiveSpacing = Math.max(kerf || 0, spacing || 0);
    const createBin = () => {
        switch (binType) {
            case 'shelf': return new ShelfBin(binW, binH, effectiveSpacing);
            case 'guillotine': return new GuillotineBin(binW, binH, effectiveSpacing, splitDir);
            case 'skyline': return new SkylineBin(binW, binH, effectiveSpacing, splitDir);
            default: return new MaxRectsBin(binW, binH, effectiveSpacing, splitDir);
        }
    };

    const bins = [createBin()];
    for (const p of pieces) {
        const pClass = p.classificacao || 'normal';
        let bestBinIdx = -1, bestRect = null, bestFitScore = Infinity;
        for (let bi = 0; bi < bins.length; bi++) {
            const rect = bins[bi].findBest(p.w, p.h, p.allowRotate, heuristic, pClass);
            if (rect) {
                const fitScore = rect.score != null ? rect.score : ((rect.w * rect.h) - (p.w * p.h));
                if (fitScore < bestFitScore) {
                    bestFitScore = fitScore; bestRect = rect; bestBinIdx = bi;
                }
                if (fitScore <= 0) break;
            }
        }
        if (bestRect && bestBinIdx >= 0) {
            bestRect.pieceRef = p.ref;
            bestRect.allowRotate = p.allowRotate;
            const placed = bins[bestBinIdx].placeRect(bestRect);
            if (placed) { placed.pieceRef = p.ref; placed.allowRotate = p.allowRotate; }
        } else {
            const newBin = createBin();
            const rect = newBin.findBest(p.w, p.h, p.allowRotate, heuristic, pClass);
            if (rect) {
                rect.pieceRef = p.ref;
                rect.allowRotate = p.allowRotate;
                const placed = newBin.placeRect(rect);
                if (placed) { placed.pieceRef = p.ref; placed.allowRotate = p.allowRotate; }
                newBin.push ? bins.push(newBin) : bins.push(newBin);
            }
        }
    }
    for (const bin of bins) {
        compactBin(bin, binW, binH, kerf, spacing, splitDir);
    }
    return bins;
}

// ─── Fill-First Nesting (Enhanced: Multi-Heuristic per Piece) ────
const ALL_HEURISTICS = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];

export function runFillFirst(pieces, binW, binH, spacing, heuristic = 'BSSF', binType = 'guillotine', kerf = 4, splitDir = 'auto', multiHeuristic = false) {
    const effectiveSpacing = Math.max(kerf || 0, spacing || 0);
    const createBin = () => {
        switch (binType) {
            case 'shelf': return new ShelfBin(binW, binH, effectiveSpacing);
            case 'guillotine': return new GuillotineBin(binW, binH, effectiveSpacing, splitDir);
            case 'skyline': return new SkylineBin(binW, binH, effectiveSpacing, splitDir);
            default: return new MaxRectsBin(binW, binH, effectiveSpacing, splitDir);
        }
    };

    const heuristicsToTry = multiHeuristic ? ALL_HEURISTICS : [heuristic];
    const remaining = pieces.map((p, i) => ({ ...p, _idx: i }));
    const bins = [];

    while (remaining.length > 0) {
        const bin = createBin();
        let placedAny = true;

        while (placedAny && remaining.length > 0) {
            placedAny = false;
            let bestIdx = -1, bestRect = null, bestScore = Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const p = remaining[i];
                const pClass = p.classificacao || 'normal';
                // Test ALL heuristics for each piece to find the tightest possible fit
                for (const h of heuristicsToTry) {
                    const rect = bin.findBest(p.w, p.h, p.allowRotate, h, pClass);
                    if (rect) {
                        // Composite score: primary = heuristic score, tiebreak = area fit
                        let sc = rect.score != null ? rect.score : ((rect.w * rect.h) - (p.w * p.h));
                        // Bonus for larger pieces (fill big gaps first, leave small gaps for small pieces)
                        if (multiHeuristic) sc -= p.area * 0.00001;
                        if (sc < bestScore) { bestScore = sc; bestRect = rect; bestIdx = i; }
                    }
                }
            }

            if (bestIdx >= 0 && bestRect) {
                const p = remaining.splice(bestIdx, 1)[0];
                bestRect.pieceRef = p.ref;
                bestRect.allowRotate = p.allowRotate;
                const placed = bin.placeRect(bestRect);
                if (placed) { placed.pieceRef = p.ref; placed.allowRotate = p.allowRotate; }
                placedAny = true;
            }
        }

        if (bin.usedRects.length > 0) {
            bins.push(bin);
        } else {
            if (remaining.length > 0) {
                const p = remaining.shift();
                // Try all heuristics for the first piece in a new bin
                let bestRect = null, bestSc = Infinity;
                for (const h of heuristicsToTry) {
                    const rect = bin.findBest(p.w, p.h, p.allowRotate, h);
                    if (rect) {
                        const sc = rect.score != null ? rect.score : 0;
                        if (sc < bestSc) { bestSc = sc; bestRect = rect; }
                    }
                }
                if (bestRect) {
                    bestRect.pieceRef = p.ref;
                    bestRect.allowRotate = p.allowRotate;
                    bin.placeRect(bestRect);
                    bins.push(bin);
                }
            }
        }
    }

    for (const bin of bins) {
        compactBin(bin, binW, binH, kerf, spacing, splitDir);
    }
    return bins;
}

// ─── Strip Packing ──────────────────────────────────────────────
export function runStripPacking(pieces, binW, binH, kerf, spacing, splitDir) {
    if (pieces.length === 0) return [];
    const sorted = [...pieces].sort((a, b) => b.h - a.h);
    const k = kerf || 4;

    class StripBin {
        constructor() {
            this.strips = [];
            this.usedRects = [];
            this.binW = binW;
            this.binH = binH;
        }
        tryAdd(piece) {
            const pw = piece.w, ph = piece.h;
            let bestStrip = -1, bestWaste = Infinity;
            for (let s = 0; s < this.strips.length; s++) {
                const strip = this.strips[s];
                const freeW = binW - strip.usedW;
                if (pw + k <= freeW && ph <= strip.h) {
                    const waste = strip.h - ph;
                    if (waste < bestWaste) { bestWaste = waste; bestStrip = s; }
                }
            }
            if (bestStrip >= 0) {
                const strip = this.strips[bestStrip];
                const placed = {
                    x: strip.usedW, y: strip.y,
                    w: pw, h: ph, realW: pw, realH: ph,
                    rotated: false, pieceRef: piece.ref, allowRotate: piece.allowRotate
                };
                strip.usedW += pw + k;
                strip.pieces.push(placed);
                this.usedRects.push(placed);
                return true;
            }
            if (piece.allowRotate) {
                for (let s = 0; s < this.strips.length; s++) {
                    const strip = this.strips[s];
                    const freeW = binW - strip.usedW;
                    if (ph + k <= freeW && pw <= strip.h) {
                        const placed = {
                            x: strip.usedW, y: strip.y,
                            w: ph, h: pw, realW: ph, realH: pw,
                            rotated: true, pieceRef: piece.ref, allowRotate: piece.allowRotate
                        };
                        strip.usedW += ph + k;
                        strip.pieces.push(placed);
                        this.usedRects.push(placed);
                        return true;
                    }
                }
            }
            const nextY = this.strips.length > 0
                ? this.strips[this.strips.length - 1].y + this.strips[this.strips.length - 1].h + k
                : 0;
            if (nextY + ph <= binH && pw <= binW) {
                const strip = { y: nextY, h: ph, usedW: pw + k, pieces: [] };
                const placed = {
                    x: 0, y: nextY,
                    w: pw, h: ph, realW: pw, realH: ph,
                    rotated: false, pieceRef: piece.ref, allowRotate: piece.allowRotate
                };
                strip.pieces.push(placed);
                this.strips.push(strip);
                this.usedRects.push(placed);
                return true;
            }
            if (piece.allowRotate && nextY + pw <= binH && ph <= binW) {
                const strip = { y: nextY, h: pw, usedW: ph + k, pieces: [] };
                const placed = {
                    x: 0, y: nextY,
                    w: ph, h: pw, realW: ph, realH: pw,
                    rotated: true, pieceRef: piece.ref, allowRotate: piece.allowRotate
                };
                strip.pieces.push(placed);
                this.strips.push(strip);
                this.usedRects.push(placed);
                return true;
            }
            return false;
        }
        occupancy() {
            let area = 0;
            for (const r of this.usedRects) area += (r.realW || r.w) * (r.realH || r.h);
            return area / (binW * binH) * 100;
        }
        get freeRects() {
            const rects = [];
            const usedH = this.strips.length > 0
                ? this.strips[this.strips.length - 1].y + this.strips[this.strips.length - 1].h
                : 0;
            if (binH - usedH > 1) rects.push({ x: 0, y: usedH, w: binW, h: binH - usedH });
            for (const strip of this.strips) {
                const freeW = binW - strip.usedW;
                if (freeW > 1) rects.push({ x: strip.usedW, y: strip.y, w: freeW, h: strip.h });
            }
            return rects;
        }
        get cuts() { return []; }
    }

    const bins = [new StripBin()];
    for (const p of sorted) {
        let placed = false;
        for (const bin of bins) {
            if (bin.tryAdd(p)) { placed = true; break; }
        }
        if (!placed) {
            const newBin = new StripBin();
            if (newBin.tryAdd(p)) bins.push(newBin);
        }
    }
    for (const bin of bins) compactBin(bin, binW, binH, kerf, spacing, splitDir);
    return bins;
}

// ─── BRKGA — Biased Random-Key Genetic Algorithm ─────────────────
export function runBRKGA(pieces, binW, binH, spacing, binType, kerf, maxGen = 80, splitDir = 'auto') {
    if (pieces.length <= 3) return null;
    const n = pieces.length;
    const POP_SIZE = Math.min(60, Math.max(30, n * 3));     // Larger population (was min 20, max 40)
    const ELITE_FRAC = 0.20;
    const MUTANT_FRAC = 0.15;
    const INHERIT_PROB = 0.70;

    const heuristics = ['BSSF', 'BAF', 'CP', 'BL', 'BLSF'];
    const binTypes = [binType];
    if (!binTypes.includes('guillotine')) binTypes.push('guillotine');
    if (!binTypes.includes('skyline')) binTypes.push('skyline');

    function decode(keys) {
        const order = pieces.map((p, i) => ({ idx: i, key: keys[i] }));
        order.sort((a, b) => a.key - b.key);
        const sorted = order.map(o => {
            const p = pieces[o.idx];
            const rotate = p.allowRotate && keys[n + o.idx] > 0.5;
            return rotate ? { ...p, w: p.h, h: p.w, allowRotate: p.allowRotate } : { ...p };
        });
        const hIdx = Math.floor(keys[2 * n] * heuristics.length) % heuristics.length;
        const btIdx = Math.floor(keys[2 * n + 1] * binTypes.length) % binTypes.length;
        // Extra chromosome bit: select fill-first vs nesting pass
        const useFillFirst = keys[2 * n + 2] > 0.4; // 60% bias toward fill-first
        const bins = useFillFirst
            ? runFillFirst(sorted, binW, binH, spacing, heuristics[hIdx], binTypes[btIdx], kerf, splitDir, true)
            : runNestingPass(sorted, binW, binH, spacing, heuristics[hIdx], binTypes[btIdx], kerf, splitDir);
        return scoreResult(bins);
    }

    const chromLen = 2 * n + 3;                      // +1 for fill-first bit (was 2*n+2)
    let population = [];
    for (let i = 0; i < POP_SIZE; i++) {
        const keys = new Float64Array(chromLen);
        for (let j = 0; j < chromLen; j++) keys[j] = Math.random();
        population.push({ keys, fitness: Infinity });
    }

    const seedSorts = [
        (a, b) => b.area - a.area,
        (a, b) => b.maxSide - a.maxSide,
        (a, b) => b.h - a.h || b.w - a.w,
    ];
    for (let si = 0; si < seedSorts.length && si < POP_SIZE; si++) {
        const sorted = pieces.map((p, i) => ({ idx: i, ...p })).sort(seedSorts[si]);
        const keys = new Float64Array(chromLen);
        for (let j = 0; j < sorted.length; j++) keys[sorted[j].idx] = j / n;
        for (let j = n; j < chromLen; j++) keys[j] = Math.random();
        population[si] = { keys, fitness: Infinity };
    }

    let bestResult = null, bestFitness = Infinity;

    for (let gen = 0; gen < maxGen; gen++) {
        for (const chr of population) {
            if (chr.fitness === Infinity) chr.fitness = decode(chr.keys).score;
            if (chr.fitness < bestFitness) { bestFitness = chr.fitness; bestResult = chr; }
        }
        population.sort((a, b) => a.fitness - b.fitness);
        const eliteCount = Math.floor(POP_SIZE * ELITE_FRAC);
        const mutantCount = Math.floor(POP_SIZE * MUTANT_FRAC);
        const newPop = population.slice(0, eliteCount);
        for (let i = 0; i < mutantCount; i++) {
            const keys = new Float64Array(chromLen);
            for (let j = 0; j < chromLen; j++) keys[j] = Math.random();
            newPop.push({ keys, fitness: Infinity });
        }
        while (newPop.length < POP_SIZE) {
            const elite = population[Math.floor(Math.random() * eliteCount)];
            const nonElite = population[eliteCount + Math.floor(Math.random() * (POP_SIZE - eliteCount))];
            const childKeys = new Float64Array(chromLen);
            for (let j = 0; j < chromLen; j++) {
                childKeys[j] = Math.random() < INHERIT_PROB ? elite.keys[j] : nonElite.keys[j];
            }
            newPop.push({ keys: childKeys, fitness: Infinity });
        }
        population = newPop;
        if (bestFitness < 10001) break;  // Tighter convergence threshold
    }

    if (!bestResult) return null;

    const order = pieces.map((p, i) => ({ idx: i, key: bestResult.keys[i] }));
    order.sort((a, b) => a.key - b.key);
    const sorted = order.map(o => {
        const p = pieces[o.idx];
        const rotate = p.allowRotate && bestResult.keys[n + o.idx] > 0.5;
        return rotate ? { ...p, w: p.h, h: p.w } : { ...p };
    });
    const hIdx = Math.floor(bestResult.keys[2 * n] * heuristics.length) % heuristics.length;
    const btIdx = Math.floor(bestResult.keys[2 * n + 1] * binTypes.length) % binTypes.length;
    const useFillFirst = bestResult.keys[2 * n + 2] > 0.4;
    const bins = useFillFirst
        ? runFillFirst(sorted, binW, binH, spacing, heuristics[hIdx], binTypes[btIdx], kerf, splitDir, true)
        : runNestingPass(sorted, binW, binH, spacing, heuristics[hIdx], binTypes[btIdx], kerf, splitDir);
    return { bins, score: scoreResult(bins) };
}

// ─── Ruin & Recreate + LAHC + Simulated Annealing ────────────────
export function ruinAndRecreate(pieces, binW, binH, spacing, binType, kerf, maxIter = 500, splitDir = 'auto') {
    if (pieces.length <= 3) return null;

    const heuristics = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];
    const sortStrategies = [
        (a, b) => b.area - a.area,
        (a, b) => a.area - b.area,
        (a, b) => b.perim - a.perim,
        (a, b) => b.maxSide - a.maxSide,
        (a, b) => a.maxSide - b.maxSide,
        (a, b) => b.diff - a.diff,
        (a, b) => b.h - a.h || b.w - a.w,
        (a, b) => b.w - a.w || b.h - a.h,
        (a, b) => { const ra = Math.min(a.w,a.h)/Math.max(a.w,a.h); const rb = Math.min(b.w,b.h)/Math.max(b.w,b.h); return rb - ra; },
        (a, b) => Math.sqrt(b.w*b.w+b.h*b.h) - Math.sqrt(a.w*a.w+a.h*a.h),
        (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    ];

    let bestBins = null, bestScore = { score: Infinity };
    for (const sortFn of sortStrategies) {
        const sorted = [...pieces].sort(sortFn);
        for (const h of heuristics) {
            // Test both nesting pass AND fill-first for each combo
            const bins = runNestingPass(sorted, binW, binH, spacing, h, binType, kerf, splitDir);
            const sc = scoreResult(bins);
            if (sc.score < bestScore.score) { bestScore = sc; bestBins = bins; }
            // Fill-first with multi-heuristic
            const ffBins = runFillFirst(sorted, binW, binH, spacing, h, binType, kerf, splitDir, true);
            const ffSc = scoreResult(ffBins);
            if (ffSc.score < bestScore.score) { bestScore = ffSc; bestBins = ffBins; }
        }
    }

    const stripBins = runStripPacking(pieces, binW, binH, kerf, spacing, splitDir);
    const stripSc = scoreResult(stripBins);
    if (stripSc.score < bestScore.score) { bestScore = stripSc; bestBins = stripBins; }

    const windowSize = 60;                          // Wider window (was 40) — more memory of past scores
    const lahcWindow = new Array(windowSize).fill(bestScore.score);
    let noImproveCount = 0;
    const maxNoImprove = Math.min(maxIter * 0.75, 400);
    let temperature = bestScore.score * 0.12;
    const coolingRate = 0.996;                      // Slower cooling (was 0.993) — more exploration time

    for (let iter = 0; iter < maxIter; iter++) {
        temperature *= coolingRate;
        let reconstructed;
        const pertType = iter % 8;

        switch (pertType) {
            case 0: {
                const basePct = noImproveCount > maxNoImprove * 0.5 ? 0.35 : 0.15;
                const ruinPct = basePct + Math.random() * 0.25;
                const numR = Math.max(1, Math.floor(pieces.length * ruinPct));
                const shuffled = [...pieces].sort(() => Math.random() - 0.5);
                reconstructed = [
                    ...shuffled.slice(numR).sort((a, b) => b.area - a.area),
                    ...shuffled.slice(0, numR).sort((a, b) => b.area - a.area),
                ];
                break;
            }
            case 1: {
                const sorted = [...pieces].sort((a, b) => a.area - b.area);
                const numR = Math.max(1, Math.floor(pieces.length * 0.25));
                reconstructed = [
                    ...sorted.slice(numR).sort((a, b) => b.area - a.area),
                    ...sorted.slice(0, numR).sort((a, b) => b.area - a.area),
                ];
                break;
            }
            case 2: {
                reconstructed = [...pieces].sort((a, b) => b.area - a.area);
                const swaps = Math.max(1, Math.floor(Math.random() * Math.min(5, pieces.length / 2)));
                for (let s = 0; s < swaps; s++) {
                    const i = Math.floor(Math.random() * reconstructed.length);
                    const j = Math.floor(Math.random() * reconstructed.length);
                    [reconstructed[i], reconstructed[j]] = [reconstructed[j], reconstructed[i]];
                }
                break;
            }
            case 3: {
                const shuffled = [...pieces].sort(() => Math.random() - 0.5);
                const numR = Math.max(1, Math.floor(pieces.length * 0.2));
                reconstructed = [
                    ...shuffled.slice(numR).sort((a, b) => b.h - a.h),
                    ...shuffled.slice(0, numR).sort((a, b) => b.h - a.h),
                ];
                break;
            }
            case 4: {
                const sorted = [...pieces].sort((a, b) => b.area - a.area);
                reconstructed = [];
                let lo = 0, hi = sorted.length - 1;
                while (lo <= hi) {
                    reconstructed.push(sorted[lo++]);
                    if (lo <= hi) reconstructed.push(sorted[hi--]);
                }
                break;
            }
            case 5: {
                const shuffled = [...pieces].sort(() => Math.random() - 0.5);
                const numR = Math.max(1, Math.floor(pieces.length * 0.2));
                reconstructed = [
                    ...shuffled.slice(numR).sort((a, b) => b.w - a.w),
                    ...shuffled.slice(0, numR).sort((a, b) => b.w - a.w),
                ];
                break;
            }
            case 6: {
                const sorted = [...pieces].sort((a, b) => b.w - a.w);
                const used = new Set();
                reconstructed = [];
                for (let i = 0; i < sorted.length; i++) {
                    if (used.has(i)) continue;
                    reconstructed.push(sorted[i]);
                    used.add(i);
                    const remaining = binW - sorted[i].w;
                    let bestJ = -1, bestDiff = Infinity;
                    for (let j = i + 1; j < sorted.length; j++) {
                        if (used.has(j)) continue;
                        const d = Math.abs(sorted[j].w - remaining);
                        if (d < bestDiff) { bestDiff = d; bestJ = j; }
                    }
                    if (bestJ >= 0 && bestDiff < binW * 0.3) {
                        reconstructed.push(sorted[bestJ]);
                        used.add(bestJ);
                    }
                }
                break;
            }
            default: {
                const start = Math.floor(Math.random() * pieces.length);
                const blockSize = Math.max(2, Math.floor(pieces.length * 0.15 + Math.random() * pieces.length * 0.20));
                const sorted = [...pieces].sort(sortStrategies[iter % sortStrategies.length]);
                const block = sorted.splice(start % sorted.length, blockSize);
                reconstructed = [...sorted, ...block.sort(() => Math.random() - 0.5)];
            }
        }

        const h = heuristics[iter % heuristics.length];
        // Alternate: even iterations → nesting pass, odd → fill-first multi-heuristic
        const useFillFirst = iter % 3 !== 0; // 2/3 fill-first (it's generally better)
        const bins = useFillFirst
            ? runFillFirst(reconstructed, binW, binH, spacing, h, binType, kerf, splitDir, true)
            : runNestingPass(reconstructed, binW, binH, spacing, h, binType, kerf, splitDir);
        const sc = scoreResult(bins);

        const lahcIdx = iter % windowSize;
        const delta = sc.score - lahcWindow[lahcIdx];
        const accepted = delta <= 0 || (temperature > 0.1 && Math.random() < Math.exp(-delta / Math.max(temperature, 0.1)));

        if (accepted) {
            lahcWindow[lahcIdx] = sc.score;
            if (sc.score < bestScore.score) {
                bestScore = sc; bestBins = bins;
                noImproveCount = 0;
            } else {
                noImproveCount++;
            }
        } else {
            noImproveCount++;
        }

        if (noImproveCount >= maxNoImprove) break;
    }

    return { bins: bestBins, score: bestScore };
}

// ─── Helper: extract pieces from a bin as packable objects ──
function extractPieces(bin) {
    return bin.usedRects.filter(r => r.pieceRef).map(r => ({
        w: r.realW || r.w,
        h: r.realH || r.h,
        ref: r.pieceRef,
        allowRotate: r.allowRotate !== false,
        area: (r.realW || r.w) * (r.realH || r.h),
        classificacao: r.classificacao || 'normal',
        perim: 2 * ((r.realW || r.w) + (r.realH || r.h)),
        maxSide: Math.max(r.realW || r.w, r.realH || r.h),
        diff: Math.abs((r.realW || r.w) - (r.realH || r.h)),
    }));
}

// ─── Helper: rebuild a bin from scratch with given pieces ──
function rebuildBin(pieces, binW, binH, binType, kerf, splitDir, spacing) {
    const effSp = Math.max(kerf || 0, spacing || 0);
    const createBin = () => {
        switch (binType) {
            case 'shelf': return new ShelfBin(binW, binH, effSp);
            case 'guillotine': return new GuillotineBin(binW, binH, effSp, splitDir);
            case 'skyline': return new SkylineBin(binW, binH, effSp, splitDir);
            default: return new MaxRectsBin(binW, binH, effSp, splitDir);
        }
    };
    const bin = createBin();
    const failed = [];
    for (const p of pieces) {
        let bestRect = null, bestScore = Infinity;
        for (const h of ALL_HEURISTICS) {
            const rect = bin.findBest(p.w, p.h, p.allowRotate, h, p.classificacao || 'normal');
            if (rect) {
                const sc = rect.score != null ? rect.score : ((rect.w * rect.h) - p.area);
                if (sc < bestScore) { bestScore = sc; bestRect = rect; }
            }
        }
        if (bestRect) {
            bestRect.pieceRef = p.ref;
            bestRect.allowRotate = p.allowRotate;
            const placed = bin.placeRect(bestRect);
            if (placed) { placed.pieceRef = p.ref; placed.allowRotate = p.allowRotate; }
            else failed.push(p);
        } else {
            failed.push(p);
        }
    }
    return { bin, failed };
}

// ─── Optimize Last Bin — Rebuild approach for fresh freeRects ──
export function optimizeLastBin(bins, binW, binH, spacing, binType = 'guillotine', kerf = 4, splitDir = 'auto') {
    if (bins.length <= 1) return bins;

    // Find the bin with lowest occupancy
    let minOcc = Infinity, minIdx = -1;
    for (let i = 0; i < bins.length; i++) {
        const occ = bins[i].occupancy();
        if (occ < minOcc) { minOcc = occ; minIdx = i; }
    }

    // Not worth optimizing if least-full bin is already well utilized
    if (minOcc >= 70 || minIdx < 0) return bins;

    const weakPieces = extractPieces(bins[minIdx]);
    if (weakPieces.length === 0) return bins;

    // Strategy: rebuild each other bin with its pieces + weak pieces, fresh freeRects
    // Try multiple sort orders for the combined pieces
    const otherBinPieces = bins.filter((_, i) => i !== minIdx).map(b => extractPieces(b));

    // For each target bin, rebuild with its pieces then try to add weak pieces
    let bestResult = null;
    let bestResultScore = scoreResult(bins).score;

    // Approach 1: Try inserting weak pieces into rebuilt bins one at a time
    {
        const rebuiltBins = [];
        for (const pieces of otherBinPieces) {
            // Sort: largest first for best packing
            const sorted = [...pieces].sort((a, b) => b.area - a.area);
            const { bin } = rebuildBin(sorted, binW, binH, binType, kerf, splitDir, spacing);
            rebuiltBins.push(bin);
        }

        // Now try to insert weak pieces (sorted by area desc — hardest first)
        const remaining = [...weakPieces].sort((a, b) => b.area - a.area);
        const stillFailed = [];

        for (const p of remaining) {
            let placed = false;
            const pClass = p.classificacao || 'normal';

            // Try each rebuilt bin (which now has fresh freeRects)
            for (const targetBin of rebuiltBins) {
                let bestRect = null, bestSc = Infinity;
                for (const h of ALL_HEURISTICS) {
                    const rect = targetBin.findBest(p.w, p.h, p.allowRotate, h, pClass);
                    if (rect) {
                        const sc = rect.score != null ? rect.score : ((rect.w * rect.h) - p.area);
                        if (sc < bestSc) { bestSc = sc; bestRect = rect; }
                    }
                }
                if (bestRect) {
                    bestRect.pieceRef = p.ref;
                    bestRect.allowRotate = p.allowRotate;
                    const pl = targetBin.placeRect(bestRect);
                    if (pl) { pl.pieceRef = p.ref; pl.allowRotate = p.allowRotate; placed = true; break; }
                }
            }
            if (!placed) stillFailed.push(p);
        }

        if (stillFailed.length === 0) {
            // ALL weak pieces redistributed → eliminate the bin!
            for (const bin of rebuiltBins) compactBin(bin, binW, binH, kerf, spacing, splitDir);
            const sc = scoreResult(rebuiltBins);
            if (sc.score < bestResultScore) {
                bestResult = rebuiltBins;
                bestResultScore = sc.score;
            }
        } else if (stillFailed.length < weakPieces.length) {
            // Some redistributed — rebuild weak bin with remaining
            const { bin: newWeak } = rebuildBin(stillFailed.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);
            const combined = [...rebuiltBins, newWeak];
            for (const bin of combined) compactBin(bin, binW, binH, kerf, spacing, splitDir);
            const sc = scoreResult(combined);
            if (sc.score < bestResultScore) {
                bestResult = combined;
                bestResultScore = sc.score;
            }
        }
    }

    // Approach 2: Collect ALL pieces and try fill-first packing into (n-1) bins
    {
        const allPieces = [];
        for (const bin of bins) {
            allPieces.push(...extractPieces(bin));
        }
        const targetBinCount = bins.length - 1;
        const totalArea = allPieces.reduce((s, p) => s + p.area, 0);
        const binArea = binW * binH;
        // Only attempt if theoretically possible
        if (totalArea <= targetBinCount * binArea * 0.98) {
            const sortStrategies = [
                (a, b) => b.area - a.area,
                (a, b) => b.maxSide - a.maxSide,
                (a, b) => b.h - a.h || b.w - a.w,
                (a, b) => b.w - a.w || b.h - a.h,
                (a, b) => b.perim - a.perim,
            ];
            for (const sortFn of sortStrategies) {
                const sorted = [...allPieces].sort(sortFn);
                // Try fill-first multi-heuristic
                const ffBins = runFillFirst(sorted, binW, binH, 0, 'BSSF', binType, kerf, splitDir, true);
                if (ffBins.length <= targetBinCount && verifyNoOverlaps(ffBins)) {
                    for (const bin of ffBins) compactBin(bin, binW, binH, kerf, spacing, splitDir);
                    const sc = scoreResult(ffBins);
                    if (sc.score < bestResultScore) {
                        bestResult = ffBins;
                        bestResultScore = sc.score;
                    }
                }
                // Try nesting pass
                for (const h of ALL_HEURISTICS) {
                    const npBins = runNestingPass(sorted, binW, binH, 0, h, binType, kerf, splitDir);
                    if (npBins.length <= targetBinCount && verifyNoOverlaps(npBins)) {
                        for (const bin of npBins) compactBin(bin, binW, binH, kerf, spacing, splitDir);
                        const sc = scoreResult(npBins);
                        if (sc.score < bestResultScore) {
                            bestResult = npBins;
                            bestResultScore = sc.score;
                        }
                    }
                }
            }
        }
    }

    return bestResult || bins;
}

// ─── Cross-bin optimization — try moving pieces between any bins ──
export function crossBinOptimize(bins, binW, binH, spacing, binType = 'guillotine', kerf = 4, splitDir = 'auto') {
    if (bins.length <= 1) return bins;

    // Multiple rounds of last-bin optimization
    let current = bins;
    for (let round = 0; round < 3; round++) {
        const improved = optimizeLastBin(current, binW, binH, spacing, binType, kerf, splitDir);
        if (improved.length < current.length) {
            current = improved; // Eliminated a bin! Try again
        } else {
            break; // No improvement
        }
    }
    return current;
}

// ═══════════════════════════════════════════════════════════════════
// SIMULATED ANNEALING — Otimizador de cross-bin com perturbações
// Objetivo: reduzir número de chapas movendo peças entre bins
// ═══════════════════════════════════════════════════════════════════
export function simulatedAnnealing(bins, binW, binH, spacing, binType, kerf, maxIter = 20000, splitDir = 'auto') {
    if (!bins || bins.length <= 1) return { bins, improved: false };

    const ALL_H = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];
    let bestBins = bins;
    let bestScore = scoreResult(bins);
    let currentBins = bins;
    let currentScore = bestScore;

    // Temperatura inicial proporcional ao score
    const T0 = bestScore.score * 0.15;
    const Tmin = 0.01;
    // Cooling rate: para maxIter=20000, queremos chegar perto de Tmin no final
    // T0 * rate^maxIter = Tmin → rate = (Tmin/T0)^(1/maxIter)
    const coolingRate = Math.pow(Tmin / T0, 1 / maxIter);
    let T = T0;

    let noImproveStreak = 0;
    const maxNoImprove = Math.max(maxIter * 0.25, 1500);

    // Reheat counter — quando fica estagnado, reaquece
    let reheatCount = 0;
    const maxReheats = 4;

    // Tempo máximo para SA: 60s (não travar servidor)
    const saStartTime = Date.now();
    const saMaxMs = 60000;

    for (let iter = 0; iter < maxIter; iter++) {
        T *= coolingRate;

        // Reheat se estagnado
        if (noImproveStreak > maxNoImprove / 2 && reheatCount < maxReheats) {
            T = T0 * 0.3;
            reheatCount++;
            noImproveStreak = 0;
        }

        // Escolher perturbação
        const pertType = Math.random();
        let candidateBins;

        if (pertType < 0.35) {
            // ─── PERTURBAÇÃO 1: Mover peça do bin menos cheio para outro ───
            candidateBins = perturbMove(currentBins, binW, binH, binType, kerf, splitDir, spacing);
        } else if (pertType < 0.55) {
            // ─── PERTURBAÇÃO 2: Swap de peças entre dois bins ───
            candidateBins = perturbSwap(currentBins, binW, binH, binType, kerf, splitDir, spacing);
        } else if (pertType < 0.70) {
            // ─── PERTURBAÇÃO 3: Tentar esvaziar o bin mais fraco ───
            candidateBins = perturbEvacuate(currentBins, binW, binH, binType, kerf, splitDir, spacing);
        } else if (pertType < 0.85) {
            // ─── PERTURBAÇÃO 4: Rebuild de um bin aleatório com sort diferente ───
            candidateBins = perturbRebuild(currentBins, binW, binH, binType, kerf, splitDir, spacing);
        } else {
            // ─── PERTURBAÇÃO 5: Mover múltiplas peças pequenas do bin fraco ───
            candidateBins = perturbMultiMove(currentBins, binW, binH, binType, kerf, splitDir, spacing);
        }

        if (!candidateBins || candidateBins.length === 0) {
            noImproveStreak++;
            continue;
        }

        const candidateScore = scoreResult(candidateBins);
        if (candidateScore.score >= Infinity) {
            noImproveStreak++;
            continue;
        }

        const delta = candidateScore.score - currentScore.score;

        // Aceitar se melhor, ou com probabilidade e^(-delta/T)
        if (delta < 0 || Math.random() < Math.exp(-delta / Math.max(T, 0.001))) {
            currentBins = candidateBins;
            currentScore = candidateScore;

            if (candidateScore.score < bestScore.score) {
                bestBins = candidateBins;
                bestScore = candidateScore;
                noImproveStreak = 0;
            } else {
                noImproveStreak++;
            }
        } else {
            noImproveStreak++;
        }

        if (noImproveStreak >= maxNoImprove) break;
        // Timeout de segurança: não exceder 60s
        if (iter % 500 === 0 && Date.now() - saStartTime > saMaxMs) break;
    }

    // Compactar bins finais
    for (const bin of bestBins) compactBin(bin, binW, binH, kerf, spacing, splitDir);
    // Remover bins vazios
    bestBins = bestBins.filter(b => b.usedRects && b.usedRects.length > 0);

    return { bins: bestBins, score: bestScore, improved: bestBins.length < bins.length };
}

// ─── Cascata de Retalhos: usar sobras de chapas cheias para peças da chapa fraca ──
// Tenta eliminar a chapa com menor ocupação redistribuindo suas peças
// nas sobras (freeRects) das demais chapas
export function cascadeRemnants(bins, binW, binH, spacing, binType, kerf, splitDir, sobraMinW = 300, sobraMinH = 300) {
    if (!bins || bins.length < 2) return { bins, improved: false };

    const ALL_H = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];
    let improved = false;
    let currentBins = [...bins];

    // Tentar até 3 rodadas de cascata
    for (let round = 0; round < 3; round++) {
        if (currentBins.length < 2) break;

        // Encontrar bin com menor ocupação
        let weakIdx = 0, minOcc = Infinity;
        for (let i = 0; i < currentBins.length; i++) {
            const occ = currentBins[i].occupancy();
            if (occ < minOcc) { minOcc = occ; weakIdx = i; }
        }

        // Se a chapa fraca tem >70% de ocupação, não vale tentar
        if (minOcc > 0.70) break;

        const weakPieces = extractPieces(currentBins[weakIdx]);
        if (weakPieces.length === 0) break;

        // Ordenar peças do bin fraco: menores primeiro (mais fáceis de encaixar em sobras)
        const sortedPieces = [...weakPieces].sort((a, b) => a.area - b.area);

        // Para cada peça do bin fraco, tentar encaixar nas freeRects das outras chapas
        const placed = [];
        const failed = [];

        // Rebuild outros bins para ter freeRects frescos
        const otherBins = [];
        for (let i = 0; i < currentBins.length; i++) {
            if (i === weakIdx) continue;
            const pieces = extractPieces(currentBins[i]);
            const { bin } = rebuildBin(pieces.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);
            otherBins.push(bin);
        }

        for (const p of sortedPieces) {
            let didPlace = false;
            for (const targetBin of otherBins) {
                for (const h of ALL_H) {
                    const rect = targetBin.findBest(p.w, p.h, p.allowRotate, h, p.classificacao || 'normal');
                    if (rect) {
                        rect.pieceRef = p.ref;
                        rect.allowRotate = p.allowRotate;
                        const pl = targetBin.placeRect(rect);
                        if (pl) {
                            pl.pieceRef = p.ref;
                            pl.allowRotate = p.allowRotate;
                            didPlace = true;
                            placed.push(p);
                            break;
                        }
                    }
                }
                if (didPlace) break;
            }
            if (!didPlace) failed.push(p);
        }

        if (placed.length === weakPieces.length) {
            // Eliminamos a chapa fraca completamente!
            currentBins = otherBins;
            improved = true;
            console.log(`  [Cascade] Rodada ${round + 1}: eliminada chapa fraca (${Math.round(minOcc * 100)}% occ, ${weakPieces.length} peças redistribuídas)`);
        } else if (placed.length > 0 && failed.length < weakPieces.length) {
            // Redistribuímos parcialmente — reconstruir chapa fraca com peças restantes
            const { bin: newWeak, failed: rebuildFailed } = rebuildBin(
                failed.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing
            );
            if (rebuildFailed.length === 0) {
                currentBins = [...otherBins, newWeak];
                // Não "improved" se não eliminou chapa, mas melhorou distribuição
            }
            break; // Não tentar mais rodadas se não eliminou
        } else {
            break; // Nenhuma peça colocada, parar
        }
    }

    return { bins: currentBins, improved };
}

// ─── SA Perturbação: Mover uma peça de um bin para outro ──
function perturbMove(bins, binW, binH, binType, kerf, splitDir, spacing) {
    if (bins.length < 2) return null;

    // Encontrar bin com menor ocupação (fonte)
    let srcIdx = 0, minOcc = Infinity;
    for (let i = 0; i < bins.length; i++) {
        const occ = bins[i].occupancy();
        if (occ < minOcc) { minOcc = occ; srcIdx = i; }
    }

    const srcPieces = extractPieces(bins[srcIdx]);
    if (srcPieces.length === 0) return null;

    // Escolher peça aleatória do bin fonte
    const pieceIdx = Math.floor(Math.random() * srcPieces.length);
    const piece = srcPieces[pieceIdx];

    // Tentar inserir em outro bin
    const otherIndices = [...Array(bins.length).keys()].filter(i => i !== srcIdx);
    // Embaralhar para variedade
    for (let i = otherIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherIndices[i], otherIndices[j]] = [otherIndices[j], otherIndices[i]];
    }

    for (const dstIdx of otherIndices) {
        // Rebuild bin destino com suas peças + a nova
        const dstPieces = extractPieces(bins[dstIdx]);
        const combined = [...dstPieces.sort((a, b) => b.area - a.area), piece];
        const { bin: newDst, failed } = rebuildBin(combined.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);

        if (failed.length === 0) {
            // Sucesso! Rebuild bin fonte sem a peça
            const remainingSrc = srcPieces.filter((_, i) => i !== pieceIdx);
            const newBins = bins.map((b, i) => {
                if (i === srcIdx) {
                    if (remainingSrc.length === 0) return null;
                    const { bin: newSrc } = rebuildBin(remainingSrc.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);
                    return newSrc;
                }
                if (i === dstIdx) return newDst;
                return b;
            }).filter(Boolean);
            return newBins;
        }
    }
    return null;
}

// ─── SA Perturbação: Swap de peças entre dois bins ──
function perturbSwap(bins, binW, binH, binType, kerf, splitDir, spacing) {
    if (bins.length < 2) return null;

    const idx1 = Math.floor(Math.random() * bins.length);
    let idx2 = Math.floor(Math.random() * (bins.length - 1));
    if (idx2 >= idx1) idx2++;

    const pieces1 = extractPieces(bins[idx1]);
    const pieces2 = extractPieces(bins[idx2]);
    if (pieces1.length === 0 || pieces2.length === 0) return null;

    const pi1 = Math.floor(Math.random() * pieces1.length);
    const pi2 = Math.floor(Math.random() * pieces2.length);

    // Swap
    const newPieces1 = [...pieces1]; newPieces1[pi1] = pieces2[pi2];
    const newPieces2 = [...pieces2]; newPieces2[pi2] = pieces1[pi1];

    const { bin: newBin1, failed: f1 } = rebuildBin(newPieces1.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);
    if (f1.length > 0) return null;
    const { bin: newBin2, failed: f2 } = rebuildBin(newPieces2.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);
    if (f2.length > 0) return null;

    const newBins = bins.map((b, i) => {
        if (i === idx1) return newBin1;
        if (i === idx2) return newBin2;
        return b;
    });
    return newBins;
}

// ─── SA Perturbação: Esvaziar o bin mais fraco redistribuindo peças ──
function perturbEvacuate(bins, binW, binH, binType, kerf, splitDir, spacing) {
    if (bins.length < 2) return null;

    // Bin mais fraco
    let weakIdx = 0, minOcc = Infinity;
    for (let i = 0; i < bins.length; i++) {
        const occ = bins[i].occupancy();
        if (occ < minOcc) { minOcc = occ; weakIdx = i; }
    }

    const weakPieces = extractPieces(bins[weakIdx]);
    if (weakPieces.length === 0) return null;

    // Rebuild todos os outros bins (freeRects frescos)
    const otherBins = [];
    for (let i = 0; i < bins.length; i++) {
        if (i === weakIdx) continue;
        const pieces = extractPieces(bins[i]);
        const { bin } = rebuildBin(pieces.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);
        otherBins.push(bin);
    }

    // Tentar inserir todas as peças do bin fraco nos outros
    const remaining = [...weakPieces].sort((a, b) => b.area - a.area);
    const ALL_H = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];

    for (const p of remaining) {
        let placed = false;
        for (const targetBin of otherBins) {
            for (const h of ALL_H) {
                const rect = targetBin.findBest(p.w, p.h, p.allowRotate, h, p.classificacao || 'normal');
                if (rect) {
                    rect.pieceRef = p.ref;
                    rect.allowRotate = p.allowRotate;
                    const pl = targetBin.placeRect(rect);
                    if (pl) { pl.pieceRef = p.ref; pl.allowRotate = p.allowRotate; placed = true; break; }
                }
            }
            if (placed) break;
        }
        if (!placed) return null; // Não conseguiu evacuar todas
    }

    // Sucesso — eliminamos um bin!
    return otherBins;
}

// ─── SA Perturbação: Rebuild um bin aleatório com sort diferente ──
function perturbRebuild(bins, binW, binH, binType, kerf, splitDir, spacing) {
    const idx = Math.floor(Math.random() * bins.length);
    const pieces = extractPieces(bins[idx]);
    if (pieces.length < 2) return null;

    // Sort aleatório
    const sorts = [
        (a, b) => b.area - a.area,
        (a, b) => a.area - b.area,
        (a, b) => b.h - a.h || b.w - a.w,
        (a, b) => b.w - a.w || b.h - a.h,
        (a, b) => b.maxSide - a.maxSide,
        (a, b) => Math.random() - 0.5,
    ];
    const sortFn = sorts[Math.floor(Math.random() * sorts.length)];
    const { bin: newBin, failed } = rebuildBin(pieces.sort(sortFn), binW, binH, binType, kerf, splitDir, spacing);

    if (failed.length > 0) return null;

    return bins.map((b, i) => i === idx ? newBin : b);
}

// ─── SA Perturbação: Mover múltiplas peças pequenas do bin fraco ──
function perturbMultiMove(bins, binW, binH, binType, kerf, splitDir, spacing) {
    if (bins.length < 2) return null;

    let weakIdx = 0, minOcc = Infinity;
    for (let i = 0; i < bins.length; i++) {
        const occ = bins[i].occupancy();
        if (occ < minOcc) { minOcc = occ; weakIdx = i; }
    }

    const weakPieces = extractPieces(bins[weakIdx]);
    if (weakPieces.length < 2) return null;

    // Pegar 2-4 peças menores do bin fraco
    const sorted = [...weakPieces].sort((a, b) => a.area - b.area);
    const numToMove = Math.min(sorted.length, 2 + Math.floor(Math.random() * 3));
    const toMove = sorted.slice(0, numToMove);
    const toKeep = sorted.slice(numToMove);

    // Rebuild outros bins com freeRects frescos
    const ALL_H = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];
    const otherBins = [];
    for (let i = 0; i < bins.length; i++) {
        if (i === weakIdx) continue;
        const pieces = extractPieces(bins[i]);
        const { bin } = rebuildBin(pieces.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);
        otherBins.push(bin);
    }

    // Tentar inserir as peças nos outros bins
    const stillFailed = [];
    for (const p of toMove.sort((a, b) => b.area - a.area)) {
        let placed = false;
        for (const targetBin of otherBins) {
            for (const h of ALL_H) {
                const rect = targetBin.findBest(p.w, p.h, p.allowRotate, h, p.classificacao || 'normal');
                if (rect) {
                    rect.pieceRef = p.ref; rect.allowRotate = p.allowRotate;
                    const pl = targetBin.placeRect(rect);
                    if (pl) { pl.pieceRef = p.ref; pl.allowRotate = p.allowRotate; placed = true; break; }
                }
            }
            if (placed) break;
        }
        if (!placed) stillFailed.push(p);
    }

    // Rebuild bin fraco com peças restantes
    const remaining = [...toKeep, ...stillFailed];
    if (remaining.length === 0) {
        return otherBins; // Bin eliminado!
    }

    const { bin: newWeak, failed } = rebuildBin(remaining.sort((a, b) => b.area - a.area), binW, binH, binType, kerf, splitDir, spacing);
    if (failed.length > 0) return null;

    return [...otherBins, newWeak];
}

// ─── Gerar sequência de cortes (para esquadrejadeira) — OTIMIZADA ──
// Strip-based ordering: H cuts first (separate strips), then V within each strip
// Large pieces first (more stable on the saw), small pieces last
// Minimize direction changes (group same-direction cuts)
export function gerarSequenciaCortes(bin) {
    if (!bin.usedRects || bin.usedRects.length === 0) {
        // Fallback to old behavior if only cuts available
        if (bin.cuts && bin.cuts.length > 0) {
            const hCuts = bin.cuts.filter(c => c.dir === 'H').sort((a, b) => a.y - b.y);
            const vCuts = bin.cuts.filter(c => c.dir === 'V').sort((a, b) => a.x - b.x);
            let seq = 1;
            return [
                ...hCuts.map(c => ({ seq: seq++, dir: 'Horizontal', pos: Math.round(c.y), len: Math.round(c.len) })),
                ...vCuts.map(c => ({ seq: seq++, dir: 'Vertical', pos: Math.round(c.x), len: Math.round(c.len) })),
            ];
        }
        return [];
    }

    const rects = bin.usedRects;
    const binW = bin.binW || bin.w;
    const binH = bin.binH || bin.h;

    // 1. Identify horizontal strip boundaries (unique Y positions + heights)
    const yLines = new Set();
    yLines.add(0);
    yLines.add(binH);
    for (const r of rects) {
        yLines.add(r.y);
        yLines.add(r.y + (r.realH || r.h));
    }
    const sortedY = [...yLines].sort((a, b) => a - b);

    // 2. Build horizontal cuts (to separate strips)
    const hCuts = [];
    for (let i = 1; i < sortedY.length - 1; i++) {
        const y = sortedY[i];
        // Check if this Y line separates pieces (full-width cut)
        const crossingPieces = rects.filter(r => r.y < y && r.y + (r.realH || r.h) > y);
        if (crossingPieces.length === 0) {
            hCuts.push({ dir: 'H', y: Math.round(y), len: binW });
        }
    }

    // 3. For each strip, build vertical cuts (left→right)
    const strips = [];
    const yBounds = [0, ...hCuts.map(c => c.y), binH];
    yBounds.sort((a, b) => a - b);

    for (let s = 0; s < yBounds.length - 1; s++) {
        const yStart = yBounds[s];
        const yEnd = yBounds[s + 1];
        const stripPieces = rects.filter(r => {
            const ry = Math.round(r.y);
            const rh = Math.round(r.realH || r.h);
            return ry >= yStart && (ry + rh) <= yEnd;
        });

        if (stripPieces.length === 0) continue;

        // Sort pieces by X position (left→right), then by area desc
        stripPieces.sort((a, b) => a.x - b.x || ((b.realW || b.w) * (b.realH || b.h)) - ((a.realW || a.w) * (a.realH || a.h)));

        // Vertical cuts within this strip
        const xLines = new Set();
        for (const r of stripPieces) {
            xLines.add(r.x);
            xLines.add(r.x + (r.realW || r.w));
        }
        const sortedX = [...xLines].sort((a, b) => a - b);

        const vCuts = [];
        for (let i = 1; i < sortedX.length - 1; i++) {
            const x = sortedX[i];
            const crossingInStrip = stripPieces.filter(r => r.x < x && r.x + (r.realW || r.w) > x);
            if (crossingInStrip.length === 0) {
                vCuts.push({ dir: 'V', x: Math.round(x), len: Math.round(yEnd - yStart) });
            }
        }

        strips.push({
            yStart, yEnd,
            pieces: stripPieces,
            vCuts: vCuts.sort((a, b) => a.x - b.x)
        });
    }

    // 4. Build optimized sequence
    let seq = 1;
    const sequence = [];

    // Horizontal cuts first (separate strips) — sorted top to bottom
    // Start from the top to keep material stable
    for (const hc of hCuts) {
        sequence.push({
            seq: seq++,
            dir: 'Horizontal',
            pos: hc.y,
            len: Math.round(hc.len),
            tipo: 'separacao_faixa'
        });
    }

    // Then vertical cuts within each strip, top-to-bottom strips
    for (const strip of strips) {
        // Large pieces first (more stable cuts)
        const sortedVCuts = strip.vCuts.sort((a, b) => {
            // Cuts that produce larger pieces first
            return a.x - b.x;
        });

        for (const vc of sortedVCuts) {
            sequence.push({
                seq: seq++,
                dir: 'Vertical',
                pos: vc.x,
                len: vc.len,
                tipo: 'separacao_peca',
                faixa: `Y${Math.round(strip.yStart)}-${Math.round(strip.yEnd)}`
            });
        }
    }

    return sequence;
}
