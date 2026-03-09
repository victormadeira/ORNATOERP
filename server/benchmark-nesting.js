#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// BENCHMARK DO OTIMIZADOR DE NESTING — Ornato ERP
// Simula diversos cenários de peças e compara com máximo teórico
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────
// Copiar as classes e funções do engine de nesting (cnc.js)
// ──────────────────────────────────────────────────────────

function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function isContainedIn(a, b) {
    return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}
function pruneFreeList(rects) {
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

class MaxRectsBin {
    constructor(width, height, spacing) {
        this.binW = width; this.binH = height; this.spacing = spacing;
        this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
        this.usedRects = [];
    }
    _tryFit(free, pw, ph, heuristic) {
        const w = pw + this.spacing, h = ph + this.spacing;
        if (w > free.w || h > free.h) return null;
        let sc;
        switch (heuristic) {
            case 'BLSF': sc = Math.max(free.w - w, free.h - h); break;
            case 'BAF':  sc = (free.w * free.h) - (w * h); break;
            case 'BL':   sc = free.y * 100000 + free.x; break;
            default:     sc = Math.min(free.w - w, free.h - h); break;
        }
        return { x: free.x, y: free.y, w, h, realW: pw, realH: ph, score: sc };
    }
    findBest(pw, ph, allowRotate, heuristic = 'BSSF') {
        let bestScore = Infinity, bestRect = null;
        for (const free of this.freeRects) {
            const norm = this._tryFit(free, pw, ph, heuristic);
            if (norm && norm.score < bestScore) { bestScore = norm.score; bestRect = { ...norm, rotated: false }; }
            if (allowRotate) {
                const rot = this._tryFit(free, ph, pw, heuristic);
                if (rot && rot.score < bestScore) { bestScore = rot.score; bestRect = { ...rot, realW: ph, realH: pw, rotated: true }; }
            }
        }
        return bestRect;
    }
    placeRect(rect) {
        const newFree = [];
        for (const free of this.freeRects) {
            if (!intersects(rect, free)) { newFree.push(free); continue; }
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
        for (const r of this.usedRects) area += r.realW * r.realH;
        return area / (this.binW * this.binH) * 100;
    }
}

class GuillotineBin {
    constructor(width, height, kerf) {
        this.binW = width; this.binH = height; this.kerf = kerf;
        this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
        this.usedRects = [];
        this.cuts = [];
    }
    findBest(pw, ph, allowRotate, heuristic = 'BSSF') {
        let bestScore = Infinity, bestIdx = -1, bestRotated = false;
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
            const maxV = Math.max(rightW * f.h, pw * bottomH);
            const maxH = Math.max(rightW * ph, f.w * bottomH);
            if (maxV >= maxH) {
                this.freeRects.push({ x: f.x + pw + kerf, y: f.y, w: rightW, h: f.h });
                this.freeRects.push({ x: f.x, y: f.y + ph + kerf, w: pw, h: bottomH });
            } else {
                this.freeRects.push({ x: f.x, y: f.y + ph + kerf, w: f.w, h: bottomH });
                this.freeRects.push({ x: f.x + pw + kerf, y: f.y, w: rightW, h: ph });
            }
        } else if (rightW > 1) {
            this.freeRects.push({ x: f.x + pw + kerf, y: f.y, w: rightW, h: f.h });
        } else if (bottomH > 1) {
            this.freeRects.push({ x: f.x, y: f.y + ph + kerf, w: f.w, h: bottomH });
        }
        this.usedRects.push(placed);
        return placed;
    }
    occupancy() {
        let area = 0;
        for (const r of this.usedRects) area += r.realW * r.realH;
        return area / (this.binW * this.binH) * 100;
    }
    get freeRects_list() { return this.freeRects; }
    get cuts_list() { return this.cuts; }
}

class ShelfBin {
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
                    bestResult = { shelfIdx: s, newShelf: false, x: shelf.usedW, y: shelf.y, w: pw, h: ph, realW: pw, realH: ph, rotated: false, score: waste };
                }
            }
            if (allowRotate && ph + this.gap <= freeW && pw <= shelf.h) {
                const waste = shelf.h - pw;
                if (waste < bestScore) {
                    bestScore = waste;
                    bestResult = { shelfIdx: s, newShelf: false, x: shelf.usedW, y: shelf.y, w: ph, h: pw, realW: ph, realH: pw, rotated: true, score: waste };
                }
            }
        }
        const nextY = this.shelves.length > 0
            ? this.shelves[this.shelves.length - 1].y + this.shelves[this.shelves.length - 1].h + this.gap
            : 0;
        if (!bestResult || bestScore > ph * 0.3) {
            if (nextY + ph <= this.binH && pw + this.gap <= this.binW) {
                bestResult = { shelfIdx: this.shelves.length, newShelf: true, shelfH: ph, x: 0, y: nextY, w: pw, h: ph, realW: pw, realH: ph, rotated: false, score: 0 };
            }
            if (allowRotate && nextY + pw <= this.binH && ph + this.gap <= this.binW) {
                if (!bestResult || pw < ph) {
                    bestResult = { shelfIdx: this.shelves.length, newShelf: true, shelfH: pw, x: 0, y: nextY, w: ph, h: pw, realW: ph, realH: pw, rotated: true, score: 0 };
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
        const placed = { x: info.x, y: info.y, w: info.w, h: info.h, realW: info.realW, realH: info.realH, rotated: info.rotated, pieceRef: info.pieceRef };
        this.usedRects.push(placed);
        return placed;
    }
    occupancy() {
        let area = 0;
        for (const r of this.usedRects) area += (r.realW || r.w) * (r.realH || r.h);
        return area / (this.binW * this.binH) * 100;
    }
}

// ─── Scoring & Validation ────────────────────────────────
function classifyBySize(pieces) {
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

function verifyNoOverlaps(bins) {
    for (let bi = 0; bi < bins.length; bi++) {
        const bin = bins[bi];
        for (let i = 0; i < bin.usedRects.length; i++) {
            for (let j = i + 1; j < bin.usedRects.length; j++) {
                const a = bin.usedRects[i], b = bin.usedRects[j];
                const aw = a.realW || a.w, ah = a.realH || a.h;
                const bw = b.realW || b.w, bh = b.realH || b.h;
                if (a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y) {
                    return false;
                }
            }
        }
    }
    return true;
}

function scoreResult(bins) {
    if (bins.length === 0) return { bins: 0, avgOccupancy: 0, minOccupancy: 0, score: Infinity };
    if (!verifyNoOverlaps(bins)) return { bins: bins.length, avgOccupancy: 0, minOccupancy: 0, score: Infinity };
    const occupancies = bins.map(b => b.occupancy());
    const avgOccupancy = occupancies.reduce((s, o) => s + o, 0) / occupancies.length;
    const minOccupancy = Math.min(...occupancies);
    let score = bins.length * 15000;
    score -= avgOccupancy * 120;
    score -= minOccupancy * 50;
    if (bins.length > 1) {
        const variance = occupancies.reduce((s, o) => s + (o - avgOccupancy) ** 2, 0) / occupancies.length;
        score += Math.sqrt(variance) * 20;
        const lastOcc = occupancies[occupancies.length - 1];
        if (lastOcc < 25) score += (25 - lastOcc) * 40;
    }
    return { bins: bins.length, avgOccupancy, minOccupancy, score };
}

// ─── Compaction ──────────────────────────────────────────
function compactBin(bin, binW, binH, kerf) {
    if (!bin.usedRects || bin.usedRects.length <= 1) return;
    const pieces = bin.usedRects;
    const k = kerf || 0;
    function collides(p, idx) {
        const pw = p.realW || p.w, ph = p.realH || p.h;
        for (let j = 0; j < pieces.length; j++) {
            if (j === idx) continue;
            const q = pieces[j];
            const qw = q.realW || q.w, qh = q.realH || q.h;
            if (p.x < q.x + qw + k && p.x + pw + k > q.x && p.y < q.y + qh + k && p.y + ph + k > q.y) return true;
        }
        return false;
    }
    for (let pass = 0; pass < 5; pass++) {
        let moved = false;
        const order = pieces.map((_, i) => i).sort((a, b) => (pieces[a].y + pieces[a].x) - (pieces[b].y + pieces[b].x));
        for (const i of order) {
            const p = pieces[i];
            const pw = p.realW || p.w, ph = p.realH || p.h;
            if (p.y > 0) {
                const candidateYs = [0];
                for (let j = 0; j < pieces.length; j++) { if (j !== i) candidateYs.push(pieces[j].y + (pieces[j].realH || pieces[j].h) + k); }
                candidateYs.sort((a, b) => a - b);
                for (const cy of candidateYs) {
                    if (cy >= p.y) break;
                    if (cy + ph > binH) continue;
                    if (!collides({ ...p, y: cy }, i)) { p.y = cy; moved = true; break; }
                }
            }
            if (p.x > 0) {
                const candidateXs = [0];
                for (let j = 0; j < pieces.length; j++) { if (j !== i) candidateXs.push(pieces[j].x + (pieces[j].realW || pieces[j].w) + k); }
                candidateXs.sort((a, b) => a - b);
                for (const cx of candidateXs) {
                    if (cx >= p.x) break;
                    if (cx + pw > binW) continue;
                    if (!collides({ ...p, x: cx }, i)) { p.x = cx; moved = true; break; }
                }
            }
        }
        if (!moved) break;
    }
}

// ─── Nesting Pass ────────────────────────────────────────
function runNestingPass(pieces, binW, binH, spacing, heuristic = 'BSSF', binType = 'guillotine', kerf = 4) {
    const createBin = () => {
        switch (binType) {
            case 'shelf': return new ShelfBin(binW, binH, kerf || spacing);
            case 'guillotine': return new GuillotineBin(binW, binH, kerf);
            default: return new MaxRectsBin(binW, binH, kerf || spacing);
        }
    };
    const bins = [createBin()];
    for (const p of pieces) {
        let bestBinIdx = -1, bestRect = null, bestFitScore = Infinity;
        for (let bi = 0; bi < bins.length; bi++) {
            const rect = bins[bi].findBest(p.w, p.h, p.allowRotate, heuristic);
            if (rect) {
                const fitScore = rect.score != null ? rect.score : ((rect.w * rect.h) - (p.w * p.h));
                if (fitScore < bestFitScore) { bestFitScore = fitScore; bestRect = rect; bestBinIdx = bi; }
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
            const rect = newBin.findBest(p.w, p.h, p.allowRotate, heuristic);
            if (rect) {
                rect.pieceRef = p.ref; rect.allowRotate = p.allowRotate;
                const placed = newBin.placeRect(rect);
                if (placed) { placed.pieceRef = p.ref; placed.allowRotate = p.allowRotate; }
                bins.push(newBin);
            }
        }
    }
    for (const bin of bins) compactBin(bin, binW, binH, kerf);
    return bins;
}

// ─── Strip Packing ───────────────────────────────────────
function runStripPacking(pieces, binW, binH, kerf) {
    if (pieces.length === 0) return [];
    const sorted = [...pieces].sort((a, b) => b.h - a.h);
    const k = kerf || 4;
    class StripBin {
        constructor() { this.strips = []; this.usedRects = []; this.binW = binW; this.binH = binH; }
        tryAdd(piece) {
            const pw = piece.w, ph = piece.h;
            let bestStrip = -1, bestWaste = Infinity;
            for (let s = 0; s < this.strips.length; s++) {
                const strip = this.strips[s];
                const freeW = binW - strip.usedW;
                if (pw + k <= freeW && ph <= strip.h) { const w = strip.h - ph; if (w < bestWaste) { bestWaste = w; bestStrip = s; } }
            }
            if (bestStrip >= 0) {
                const strip = this.strips[bestStrip];
                const placed = { x: strip.usedW, y: strip.y, w: pw, h: ph, realW: pw, realH: ph, rotated: false, pieceRef: piece.ref, allowRotate: piece.allowRotate };
                strip.usedW += pw + k; strip.pieces.push(placed); this.usedRects.push(placed); return true;
            }
            if (piece.allowRotate) {
                for (let s = 0; s < this.strips.length; s++) {
                    const strip = this.strips[s];
                    const freeW = binW - strip.usedW;
                    if (ph + k <= freeW && pw <= strip.h) {
                        const placed = { x: strip.usedW, y: strip.y, w: ph, h: pw, realW: ph, realH: pw, rotated: true, pieceRef: piece.ref, allowRotate: piece.allowRotate };
                        strip.usedW += ph + k; strip.pieces.push(placed); this.usedRects.push(placed); return true;
                    }
                }
            }
            const nextY = this.strips.length > 0 ? this.strips[this.strips.length - 1].y + this.strips[this.strips.length - 1].h + k : 0;
            if (nextY + ph <= binH && pw <= binW) {
                const strip = { y: nextY, h: ph, usedW: pw + k, pieces: [] };
                const placed = { x: 0, y: nextY, w: pw, h: ph, realW: pw, realH: ph, rotated: false, pieceRef: piece.ref, allowRotate: piece.allowRotate };
                strip.pieces.push(placed); this.strips.push(strip); this.usedRects.push(placed); return true;
            }
            if (piece.allowRotate && nextY + pw <= binH && ph <= binW) {
                const strip = { y: nextY, h: pw, usedW: ph + k, pieces: [] };
                const placed = { x: 0, y: nextY, w: ph, h: pw, realW: ph, realH: pw, rotated: true, pieceRef: piece.ref, allowRotate: piece.allowRotate };
                strip.pieces.push(placed); this.strips.push(strip); this.usedRects.push(placed); return true;
            }
            return false;
        }
        occupancy() { let a = 0; for (const r of this.usedRects) a += (r.realW || r.w) * (r.realH || r.h); return a / (binW * binH) * 100; }
    }
    const bins = [new StripBin()];
    for (const p of sorted) {
        let placed = false;
        for (const bin of bins) { if (bin.tryAdd(p)) { placed = true; break; } }
        if (!placed) { const newBin = new StripBin(); if (newBin.tryAdd(p)) bins.push(newBin); }
    }
    for (const bin of bins) compactBin(bin, binW, binH, kerf);
    return bins;
}

// ─── Ruin & Recreate ─────────────────────────────────────
function ruinAndRecreate(pieces, binW, binH, spacing, binType, kerf, maxIter = 500) {
    if (pieces.length <= 3) return null;
    const heuristics = ['BSSF', 'BLSF', 'BAF', 'BL'];
    const sortStrategies = [
        (a, b) => b.area - a.area, (a, b) => a.area - b.area, (a, b) => b.perim - a.perim,
        (a, b) => b.maxSide - a.maxSide, (a, b) => a.maxSide - b.maxSide, (a, b) => b.diff - a.diff,
        (a, b) => b.h - a.h || b.w - a.w, (a, b) => b.w - a.w || b.h - a.h,
        (a, b) => { const ra = Math.min(a.w,a.h)/Math.max(a.w,a.h); const rb = Math.min(b.w,b.h)/Math.max(b.w,b.h); return rb - ra; },
        (a, b) => Math.sqrt(b.w*b.w+b.h*b.h) - Math.sqrt(a.w*a.w+a.h*a.h),
        (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    ];
    let bestBins = null, bestScore = { score: Infinity };
    for (const sortFn of sortStrategies) {
        const sorted = [...pieces].sort(sortFn);
        for (const h of heuristics) {
            const bins = runNestingPass(sorted, binW, binH, spacing, h, binType, kerf);
            const sc = scoreResult(bins);
            if (sc.score < bestScore.score) { bestScore = sc; bestBins = bins; }
        }
    }
    // Strip packing seed
    const stripBins = runStripPacking(pieces, binW, binH, kerf);
    const stripSc = scoreResult(stripBins);
    if (stripSc.score < bestScore.score) { bestScore = stripSc; bestBins = stripBins; }

    const windowSize = 40;
    const lahcWindow = new Array(windowSize).fill(bestScore.score);
    let noImproveCount = 0;
    const maxNoImprove = Math.min(maxIter * 0.7, 350);
    let temperature = bestScore.score * 0.10;
    const coolingRate = 0.993;

    for (let iter = 0; iter < maxIter; iter++) {
        temperature *= coolingRate;
        let reconstructed;
        const pertType = iter % 8;
        switch (pertType) {
            case 0: { const basePct = noImproveCount > maxNoImprove * 0.5 ? 0.35 : 0.15; const ruinPct = basePct + Math.random() * 0.25; const numR = Math.max(1, Math.floor(pieces.length * ruinPct)); const shuffled = [...pieces].sort(() => Math.random() - 0.5); reconstructed = [...shuffled.slice(numR).sort((a, b) => b.area - a.area), ...shuffled.slice(0, numR).sort((a, b) => b.area - a.area)]; break; }
            case 1: { const sorted = [...pieces].sort((a, b) => a.area - b.area); const numR = Math.max(1, Math.floor(pieces.length * 0.25)); reconstructed = [...sorted.slice(numR).sort((a, b) => b.area - a.area), ...sorted.slice(0, numR).sort((a, b) => b.area - a.area)]; break; }
            case 2: { reconstructed = [...pieces].sort((a, b) => b.area - a.area); const swaps = Math.max(1, Math.floor(Math.random() * Math.min(5, pieces.length / 2))); for (let s = 0; s < swaps; s++) { const i = Math.floor(Math.random() * reconstructed.length); const j = Math.floor(Math.random() * reconstructed.length); [reconstructed[i], reconstructed[j]] = [reconstructed[j], reconstructed[i]]; } break; }
            case 3: { const shuffled = [...pieces].sort(() => Math.random() - 0.5); const numR = Math.max(1, Math.floor(pieces.length * 0.2)); reconstructed = [...shuffled.slice(numR).sort((a, b) => b.h - a.h), ...shuffled.slice(0, numR).sort((a, b) => b.h - a.h)]; break; }
            case 4: { const sorted = [...pieces].sort((a, b) => b.area - a.area); reconstructed = []; let lo = 0, hi = sorted.length - 1; while (lo <= hi) { reconstructed.push(sorted[lo++]); if (lo <= hi) reconstructed.push(sorted[hi--]); } break; }
            case 5: { const shuffled = [...pieces].sort(() => Math.random() - 0.5); const numR = Math.max(1, Math.floor(pieces.length * 0.2)); reconstructed = [...shuffled.slice(numR).sort((a, b) => b.w - a.w), ...shuffled.slice(0, numR).sort((a, b) => b.w - a.w)]; break; }
            case 6: { const sorted = [...pieces].sort((a, b) => b.w - a.w); const used = new Set(); reconstructed = []; for (let i = 0; i < sorted.length; i++) { if (used.has(i)) continue; reconstructed.push(sorted[i]); used.add(i); const remaining = binW - sorted[i].w; let bestJ = -1, bestDiff = Infinity; for (let j = i + 1; j < sorted.length; j++) { if (used.has(j)) continue; const d = Math.abs(sorted[j].w - remaining); if (d < bestDiff) { bestDiff = d; bestJ = j; } } if (bestJ >= 0 && bestDiff < binW * 0.3) { reconstructed.push(sorted[bestJ]); used.add(bestJ); } } break; }
            default: { const start = Math.floor(Math.random() * pieces.length); const blockSize = Math.max(2, Math.floor(pieces.length * 0.15 + Math.random() * pieces.length * 0.20)); const sorted = [...pieces].sort(sortStrategies[iter % sortStrategies.length]); const block = sorted.splice(start % sorted.length, blockSize); reconstructed = [...sorted, ...block.sort(() => Math.random() - 0.5)]; }
        }
        const h = heuristics[iter % heuristics.length];
        const bins = runNestingPass(reconstructed, binW, binH, spacing, h, binType, kerf);
        const sc = scoreResult(bins);
        const lahcIdx = iter % windowSize;
        const delta = sc.score - lahcWindow[lahcIdx];
        const accepted = delta <= 0 || (temperature > 0.1 && Math.random() < Math.exp(-delta / Math.max(temperature, 0.1)));
        if (accepted) {
            lahcWindow[lahcIdx] = sc.score;
            if (sc.score < bestScore.score) { bestScore = sc; bestBins = bins; noImproveCount = 0; } else { noImproveCount++; }
        } else { noImproveCount++; }
        if (noImproveCount >= maxNoImprove) break;
    }
    return { bins: bestBins, score: bestScore };
}

// ═══════════════════════════════════════════════════════════
// OTIMIZADOR COMPLETO (replica a lógica do endpoint)
// ═══════════════════════════════════════════════════════════
function otimizar(pieces, binW, binH, kerf = 4, maxIter = 500) {
    const spacing = kerf; // Usar kerf como espaçamento
    const expanded = pieces.map((p, i) => ({
        ref: { pecaId: i, instancia: 0 },
        w: p.w, h: p.h,
        allowRotate: p.allowRotate !== false,
        area: p.w * p.h,
        perim: 2 * (p.w + p.h),
        maxSide: Math.max(p.w, p.h),
        diff: Math.abs(p.w - p.h),
    }));

    const totalArea = expanded.reduce((s, p) => s + p.area, 0);
    const sheetArea = binW * binH;
    const minTeoricoChapas = Math.ceil(totalArea / sheetArea);

    const sortStrategies = [
        { name: 'area_desc', fn: (a, b) => b.area - a.area },
        { name: 'perim_desc', fn: (a, b) => b.perim - a.perim },
        { name: 'maxside_desc', fn: (a, b) => b.maxSide - a.maxSide },
        { name: 'diff_desc', fn: (a, b) => b.diff - a.diff },
        { name: 'area_asc', fn: (a, b) => a.area - b.area },
        { name: 'w_h_desc', fn: (a, b) => b.w - a.w || b.h - a.h },
        { name: 'h_w_desc', fn: (a, b) => b.h - a.h || b.w - a.w },
        { name: 'ratio_sq', fn: (a, b) => { const ra = Math.min(a.w,a.h)/Math.max(a.w,a.h); const rb = Math.min(b.w,b.h)/Math.max(b.w,b.h); return rb - ra; }},
        { name: 'diagonal', fn: (a, b) => Math.sqrt(b.w*b.w+b.h*b.h) - Math.sqrt(a.w*a.w+a.h*a.h) },
        { name: 'minside_desc', fn: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) },
    ];

    const heuristics = ['BSSF', 'BLSF', 'BAF', 'BL'];
    const binTypes = ['guillotine', 'maxrects', 'shelf'];
    let bestBins = null, bestScore = { score: Infinity }, bestName = '';

    // Phase 1: Greedy multi-pass
    for (const bt of binTypes) {
        for (const strat of sortStrategies) {
            for (const h of heuristics) {
                const bins = runNestingPass([...expanded].sort(strat.fn), binW, binH, spacing, h, bt, kerf);
                const sc = scoreResult(bins);
                if (sc.score < bestScore.score) { bestScore = sc; bestBins = bins; bestName = `${strat.name}+${h}+${bt}`; }
            }
        }
    }

    // Phase 1.5: Strip packing
    const stripBins = runStripPacking(expanded, binW, binH, kerf);
    const stripSc = scoreResult(stripBins);
    if (stripSc.score < bestScore.score) { bestScore = stripSc; bestBins = stripBins; bestName = 'strip_packing'; }

    // Phase 2: Ruin & Recreate
    if (expanded.length > 3) {
        for (const bt of binTypes) {
            const rr = ruinAndRecreate(expanded, binW, binH, spacing, bt, kerf, maxIter);
            if (rr && rr.score.score < bestScore.score) { bestScore = rr.score; bestBins = rr.bins; bestName = `R&R+${bt}`; }
        }
    }

    // Phase 3: Gap filling
    if (bestBins && bestBins.length > 1 && bestBins.length > minTeoricoChapas) {
        const allPieces = [];
        for (const bin of bestBins) {
            for (const r of bin.usedRects) {
                if (r.pieceRef) allPieces.push({
                    ref: r.pieceRef, w: r.realW || r.w, h: r.realH || r.h,
                    allowRotate: r.allowRotate !== false,
                    area: (r.realW || r.w) * (r.realH || r.h),
                    perim: 2 * ((r.realW || r.w) + (r.realH || r.h)),
                    maxSide: Math.max(r.realW || r.w, r.realH || r.h),
                    diff: Math.abs((r.realW || r.w) - (r.realH || r.h)),
                });
            }
        }
        const gapSorts = [(a, b) => b.area - a.area, (a, b) => b.maxSide - a.maxSide, (a, b) => b.h - a.h || b.w - a.w];
        for (const sortFn of gapSorts) {
            for (const h of heuristics) {
                for (const bt of binTypes) {
                    const sorted = [...allPieces].sort(sortFn);
                    const testBins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf);
                    if (testBins.length < bestBins.length && verifyNoOverlaps(testBins)) {
                        const sc = scoreResult(testBins);
                        if (sc.score < bestScore.score) { bestBins = testBins; bestScore = sc; bestName += '+gap'; }
                    }
                }
            }
        }
    }

    const overlaps = !verifyNoOverlaps(bestBins);
    const maxTeoricoAprov = totalArea / (bestBins.length * sheetArea) * 100;

    return {
        chapas: bestBins.length,
        minTeorico: minTeoricoChapas,
        aprovMedio: bestScore.avgOccupancy,
        maxTeorico: maxTeoricoAprov,
        eficiencia: (minTeoricoChapas / bestBins.length * 100),
        overlaps,
        estrategia: bestName,
        pecasPorChapa: bestBins.map(b => b.usedRects.length),
        ocupPorChapa: bestBins.map(b => b.occupancy()),
    };
}

// ═══════════════════════════════════════════════════════════
// CENÁRIOS DE TESTE
// ═══════════════════════════════════════════════════════════

const CHAPA = { w: 2730, h: 1830 }; // Chapa padrão 2750×1850 com refilo 10mm
const KERF = 4;

const cenarios = [
    // ── CENÁRIO 1: Encaixe perfeito (2 peças que cabem exatamente em 1 chapa) ──
    {
        nome: '1. Encaixe perfeito (2 peças → 1 chapa)',
        pecas: [
            { w: 1363, h: 1830 },  // Metade da chapa
            { w: 1363, h: 1830 },  // Outra metade (sobra 4mm do kerf)
        ],
        esperado: { chapas: 1 },
    },

    // ── CENÁRIO 2: 4 peças iguais em quadrantes ──
    {
        nome: '2. 4 peças iguais (quadrantes → 1 chapa)',
        pecas: [
            { w: 1363, h: 913 },
            { w: 1363, h: 913 },
            { w: 1363, h: 913 },
            { w: 1363, h: 913 },
        ],
        esperado: { chapas: 1 },
    },

    // ── CENÁRIO 3: Cozinha real — 24 peças variadas ──
    {
        nome: '3. Cozinha completa — 24 peças variadas',
        pecas: [
            // Laterais (6×)
            { w: 700, h: 550 }, { w: 700, h: 550 }, { w: 700, h: 550 },
            { w: 700, h: 550 }, { w: 700, h: 550 }, { w: 700, h: 550 },
            // Bases (3×)
            { w: 800, h: 550 }, { w: 1000, h: 550 }, { w: 600, h: 550 },
            // Prateleiras (4×)
            { w: 768, h: 350 }, { w: 968, h: 350 }, { w: 568, h: 350 }, { w: 768, h: 350 },
            // Réguas (6×)
            { w: 800, h: 80 }, { w: 1000, h: 80 }, { w: 600, h: 80 },
            { w: 800, h: 100 }, { w: 1000, h: 100 }, { w: 600, h: 100 },
            // Fundos/traseiras (3×)
            { w: 768, h: 700 }, { w: 968, h: 700 }, { w: 568, h: 700 },
            // Divisórias (2×)
            { w: 350, h: 520 }, { w: 350, h: 520 },
        ],
        esperado: { maxChapas: 3 },
    },

    // ── CENÁRIO 4: Muitas peças pequenas (30 peças) ──
    {
        nome: '4. 30 peças pequenas (≈ 1 chapa teórica)',
        pecas: Array.from({ length: 30 }, (_, i) => ({
            w: 200 + (i % 5) * 50,
            h: 150 + (i % 4) * 40,
        })),
        esperado: {},
    },

    // ── CENÁRIO 5: Peças grandes que quase cabem em 1 chapa ──
    {
        nome: '5. Peças grandes (área = 95% de 1 chapa)',
        pecas: [
            { w: 1200, h: 900 },
            { w: 1200, h: 900 },
            { w: 1200, h: 500 },
            { w: 800, h: 500 },
        ],
        esperado: { chapas: 1 },
    },

    // ── CENÁRIO 6: Armário completo — guarda-roupas ──
    {
        nome: '6. Guarda-roupa 2 portas — 18 peças',
        pecas: [
            // Laterais externas (2×)
            { w: 2100, h: 500 }, { w: 2100, h: 500 },
            // Divisória central
            { w: 2050, h: 480 },
            // Topo e base
            { w: 1198, h: 500 }, { w: 1198, h: 500 },
            // Prateleiras (6×)
            { w: 578, h: 480 }, { w: 578, h: 480 }, { w: 578, h: 480 },
            { w: 578, h: 480 }, { w: 578, h: 480 }, { w: 578, h: 480 },
            // Réguas traseiras (3×)
            { w: 1200, h: 100 }, { w: 1200, h: 100 }, { w: 1200, h: 100 },
            // Rodapé
            { w: 1198, h: 80 },
            // Gaveta: frente, costas, laterais
            { w: 560, h: 200 }, { w: 560, h: 150 },
            { w: 400, h: 150 },
        ],
        esperado: { maxChapas: 3 },
    },

    // ── CENÁRIO 7: Peças muito alongadas (réguas/rodapés) ──
    {
        nome: '7. 12 réguas longas (2500×80)',
        pecas: Array.from({ length: 12 }, () => ({ w: 2500, h: 80 })),
        esperado: {},
    },

    // ── CENÁRIO 8: Mix grande + pequenas ──
    {
        nome: '8. Mix extremo: 2 enormes + 15 pequenas',
        pecas: [
            { w: 2000, h: 1500 },
            { w: 2000, h: 1500 },
            ...Array.from({ length: 15 }, (_, i) => ({
                w: 200 + (i % 3) * 100,
                h: 200 + (i % 4) * 50,
            })),
        ],
        esperado: {},
    },

    // ── CENÁRIO 9: Peças idênticas (melhor caso) ──
    {
        nome: '9. 20 peças idênticas 500×350',
        pecas: Array.from({ length: 20 }, () => ({ w: 500, h: 350 })),
        esperado: {},
    },

    // ── CENÁRIO 10: Nosso lote real (MDF 15.5mm) ──
    {
        nome: '10. Lote real MDF 15mm — 17 peças marcenaria',
        pecas: [
            { w: 694.5, h: 550 },   // Lateral Dir
            { w: 694.5, h: 550 },   // Lateral Esq
            { w: 1169, h: 80 },     // Regua
            { w: 1169, h: 80 },     // Regua
            { w: 1200, h: 550 },    // Base MDF
            { w: 384.5, h: 522.5 }, // Prateleira
            { w: 769, h: 522.5 },   // Prateleira
            { w: 679, h: 527.5 },   // Divisoria
            { w: 694.5, h: 570 },   // Lateral Dir
            { w: 694.5, h: 570 },   // Lateral Esq
            { w: 900, h: 570 },     // Base MDF
            { w: 869, h: 70 },      // Regua
            { w: 869, h: 100 },     // Regua
            { w: 812, h: 628.5 },   // Contra Frente
            { w: 812, h: 628.5 },   // Traseira
            { w: 500, h: 649 },     // Lat Esq Gaveta
            { w: 500, h: 649 },     // Lat Dir Gaveta
        ],
        esperado: { chapas: 2 },
    },

    // ── CENÁRIO 11: Peça que não cabe na chapa ──
    {
        nome: '11. Peça maior que chapa (deve criar chapa extra ou erro)',
        pecas: [
            { w: 2800, h: 500 },  // Maior que 2730!
            { w: 500, h: 500 },
        ],
        esperado: { nota: 'peça 1 não cabe na chapa (2800 > 2730)' },
    },

    // ── CENÁRIO 12: Stress test — 50 peças ──
    {
        nome: '12. Stress: 50 peças aleatórias',
        pecas: Array.from({ length: 50 }, (_, i) => ({
            w: 150 + Math.floor(Math.sin(i * 7.3) * 300 + 400),
            h: 100 + Math.floor(Math.cos(i * 5.1) * 250 + 300),
        })),
        esperado: {},
    },
];

// ═══════════════════════════════════════════════════════════
// EXECUTAR BENCHMARK
// ═══════════════════════════════════════════════════════════

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║       BENCHMARK DO OTIMIZADOR DE NESTING — Ornato ERP          ║');
console.log('║       Chapa padrão: 2730 × 1830 mm (refilo 10mm)              ║');
console.log('║       Kerf: 4mm                                                ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log('');

let totalTestes = 0, testesOtimos = 0, totalEficiencia = 0;
const resultados = [];

for (const cenario of cenarios) {
    totalTestes++;
    const t0 = Date.now();
    const result = otimizar(cenario.pecas, CHAPA.w, CHAPA.h, KERF, 500);
    const elapsed = Date.now() - t0;

    const totalArea = cenario.pecas.reduce((s, p) => s + p.w * p.h, 0);
    const sheetArea = CHAPA.w * CHAPA.h;
    const areaPercent = (totalArea / sheetArea * 100).toFixed(1);

    const isOptimal = result.chapas === result.minTeorico;
    if (isOptimal) testesOtimos++;
    totalEficiencia += result.eficiencia;

    const status = isOptimal ? '✅ ÓTIMO' : result.eficiencia >= 95 ? '🟡 BOM' : '❌ RUIM';
    const overlapStatus = result.overlaps ? '⚠️  OVERLAP!' : '✓ sem overlap';

    console.log(`┌─ ${cenario.nome}`);
    console.log(`│  Peças: ${cenario.pecas.length}   Área total: ${(totalArea/1000000).toFixed(3)} m²   (${areaPercent}% de 1 chapa)`);
    console.log(`│  Resultado: ${result.chapas} chapa(s)   Mín. teórico: ${result.minTeorico} chapa(s)   ${status}`);
    console.log(`│  Aproveitamento médio: ${result.aprovMedio.toFixed(1)}%   Máx. teórico: ${result.maxTeorico.toFixed(1)}%`);
    console.log(`│  Eficiência: ${result.eficiencia.toFixed(0)}%   ${overlapStatus}   Tempo: ${elapsed}ms`);
    console.log(`│  Estratégia: ${result.estrategia}`);
    console.log(`│  Por chapa: ${result.ocupPorChapa.map(o => o.toFixed(1) + '%').join(' | ')}`);
    if (cenario.esperado.nota) console.log(`│  Nota: ${cenario.esperado.nota}`);
    console.log(`└─`);
    console.log('');

    resultados.push({
        nome: cenario.nome,
        pecas: cenario.pecas.length,
        chapas: result.chapas,
        minTeorico: result.minTeorico,
        eficiencia: result.eficiencia,
        aprovMedio: result.aprovMedio,
        maxTeorico: result.maxTeorico,
        isOptimal,
        overlaps: result.overlaps,
        elapsed,
    });
}

// ═══════════════════════════════════════════════════════════
// RESUMO FINAL
// ═══════════════════════════════════════════════════════════
console.log('');
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║                         RESUMO FINAL                            ║');
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log(`║  Testes realizados:     ${String(totalTestes).padStart(3)}                                    ║`);
console.log(`║  Resultados ótimos:     ${String(testesOtimos).padStart(3)} / ${totalTestes}  (${(testesOtimos/totalTestes*100).toFixed(0)}%)                          ║`);
console.log(`║  Eficiência média:      ${(totalEficiencia/totalTestes).toFixed(1)}%                                  ║`);
console.log(`║  Overlaps:              ${resultados.some(r => r.overlaps) ? '⚠️  SIM!' : '✓ Nenhum'}                              ║`);
console.log('╠══════════════════════════════════════════════════════════════════╣');

const falhas = resultados.filter(r => !r.isOptimal);
if (falhas.length > 0) {
    console.log('║  CENÁRIOS NÃO-ÓTIMOS:                                           ║');
    for (const f of falhas) {
        const line = `║    ${f.nome.substring(0, 45).padEnd(45)} ${f.chapas}/${f.minTeorico} chapas ║`;
        console.log(line);
    }
}
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log('');

// Tabela final
console.log('TABELA DE RESULTADOS:');
console.log('─'.repeat(100));
console.log(`${'Cenário'.padEnd(50)} ${'Pç'.padStart(4)} ${'Ch'.padStart(3)} ${'Min'.padStart(4)} ${'Efic'.padStart(6)} ${'Aprov'.padStart(7)} ${'MáxTeo'.padStart(7)} ${'OVL'.padStart(4)} ${'ms'.padStart(6)}`);
console.log('─'.repeat(100));
for (const r of resultados) {
    const ef = r.isOptimal ? `${r.eficiencia.toFixed(0)}% ✓` : `${r.eficiencia.toFixed(0)}% ✗`;
    console.log(`${r.nome.substring(0, 50).padEnd(50)} ${String(r.pecas).padStart(4)} ${String(r.chapas).padStart(3)} ${String(r.minTeorico).padStart(4)} ${ef.padStart(6)} ${(r.aprovMedio.toFixed(1)+'%').padStart(7)} ${(r.maxTeorico.toFixed(1)+'%').padStart(7)} ${(r.overlaps ? 'SIM' : 'OK').padStart(4)} ${String(r.elapsed).padStart(6)}`);
}
console.log('─'.repeat(100));
