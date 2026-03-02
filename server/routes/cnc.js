import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// ENGINE DE NESTING 2D — State-of-the-Art
// Baseado em:
//   • Jukka Jylanki, "A Thousand Ways to Pack the Bin" (MaxRects-BSSF/CP)
//   • Skyline Bottom-Left com Waste Map (stb_rect_pack / Vernay)
//   • GDRR-2BP (Ruin & Recreate + Late Acceptance Hill Climbing)
//   • BRKGA — Biased Random-Key Genetic Algorithm (Gonçalves & Resende)
//   • Corte guilhotina com SLA (Shorter Leftover Axis)
//   • Multi-pass portfolio (40+ combinações paralelas)
// ═══════════════════════════════════════════════════════════════════

// ─── Module-level state for vacuum-aware nesting ──────────────────
let _vacuumAware = false; // Set per-optimization run, read by bin constructors

// ─── Helpers MaxRects ────────────────────────────────────────────
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

// ─── Clip & Keep: resolver sobreposição de freeRects ─────────────
// MaxRects mantém freeRects sobrepostos intencionalmente.
// Clip & Keep produz retângulos NÃO sobrepostos para uso como sobras físicas.
function clipRect(a, b) {
    // Clipa rect A removendo intersecção com rect B → 0-4 retângulos
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
function clipAndKeep(freeRects, sobraMinW, sobraMinH) {
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
// Agora com 5 heurísticas: BSSF, BLSF, BAF, BL, CP (Contact Point)
class MaxRectsBin {
    constructor(width, height, spacing) {
        this.binW = width; this.binH = height; this.spacing = spacing;
        this.vacuumAware = _vacuumAware;
        this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
        this.usedRects = [];
    }
    // Calcula comprimento de contato com bordas do bin e peças adjacentes
    _contactLength(x, y, w, h) {
        let score = 0;
        if (x === 0 || x + w >= this.binW) score += h;
        if (y === 0 || y + h >= this.binH) score += w;
        for (const used of this.usedRects) {
            const uw = used.realW || used.w, uh = used.realH || used.h;
            // Adjacência horizontal
            if (Math.abs(used.x + uw - x) < 1 || Math.abs(x + w - used.x) < 1) {
                const overlap = Math.min(y + h, used.y + uh) - Math.max(y, used.y);
                if (overlap > 0) score += overlap;
            }
            // Adjacência vertical
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
        switch (heuristic) {
            case 'BLSF': sc = Math.max(free.w - w, free.h - h); break;
            case 'BAF':  sc = (free.w * free.h) - (w * h); break;
            case 'BL':   sc = free.y * 100000 + free.x; break;
            case 'CP':   sc = -this._contactLength(free.x, free.y, pw, ph); break; // Negativo pq maior contato = melhor
            default:     sc = Math.min(free.w - w, free.h - h); break; // BSSF
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
            if (allowRotate) {
                const rot = applyVacuum(this._tryFit(free, ph, pw, heuristic));
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

// ─── SkylineBin (Bottom-Left com Waste Map) ──────────────────────
// Algoritmo Skyline: mantém contorno superior, peças empilham como Tetris
// Com Waste Map para preencher espaços abaixo do skyline
class SkylineBin {
    constructor(width, height, spacing) {
        this.binW = width; this.binH = height; this.spacing = spacing;
        this.skyline = [{ x: 0, y: 0, w: width }]; // segmentos do contorno
        this.usedRects = [];
        // Waste map: free rects abaixo do skyline (para peças pequenas)
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
        // Tentar waste map primeiro (peças pequenas nos gaps)
        for (let wi = 0; wi < this.wasteRects.length; wi++) {
            const wr = this.wasteRects[wi];
            if (pw + sp <= wr.w && ph + sp <= wr.h) {
                return { x: wr.x, y: wr.y, w: pw + sp, h: ph + sp, realW: pw, realH: ph, rotated: false, wasteIdx: wi, score: -(wr.w * wr.h) };
            }
            if (allowRotate && ph + sp <= wr.w && pw + sp <= wr.h) {
                return { x: wr.x, y: wr.y, w: ph + sp, h: pw + sp, realW: ph, realH: pw, rotated: true, wasteIdx: wi, score: -(wr.w * wr.h) };
            }
        }
        // Skyline placement
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
        tryOrientation(pw, ph, false);
        if (allowRotate) tryOrientation(ph, pw, true);
        if (bestIdx < 0) return null;
        const rw = bestRot ? ph : pw, rh = bestRot ? pw : ph;
        return { x: bestX, y: bestY - rh - sp, w: rw + sp, h: rh + sp, realW: rw, realH: rh, rotated: bestRot, skyIdx: bestIdx, score: bestY };
    }
    placeRect(info) {
        const sp = this.spacing;
        // Se veio do waste map
        if (info.wasteIdx != null) {
            const wr = this.wasteRects[info.wasteIdx];
            // Dividir waste rect restante
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
        // Registrar waste gaps (espaço abaixo da peça até o skyline)
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
        // Atualizar skyline: novo segmento no topo da peça
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
        // Merge segmentos adjacentes de mesma altura
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
        // Espaço acima do skyline
        for (const seg of this.skyline) {
            if (this.binH - seg.y > 1) rects.push({ x: seg.x, y: seg.y, w: seg.w, h: this.binH - seg.y });
        }
        return rects;
    }
    get cuts() { return []; }
}

// ─── GuillotineBin (esquadrejadeira — cortes ponta-a-ponta) ──────
// Cada corte divide o retângulo livre em EXATAMENTE 2 sub-retângulos
// splitDir: 'auto' (SLA), 'horizontal' (faixas), 'vertical' (colunas)
class GuillotineBin {
    constructor(width, height, kerf, splitDir = 'auto') {
        this.binW = width; this.binH = height; this.kerf = kerf;
        this.splitDir = splitDir; // 'auto' = SLA, 'horizontal' = faixas, 'vertical' = colunas
        this.vacuumAware = _vacuumAware;
        this.freeRects = [{ x: 0, y: 0, w: width, h: height }];
        this.usedRects = [];
        this.cuts = []; // sequência de cortes
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
                // Vacuum-aware: peças pequenas preferem centro, grandes preferem bordas
                if (this.vacuumAware && pieceClass !== 'normal') {
                    const pcx = f.x + tw / 2, pcy = f.y + th / 2;
                    const dist = Math.sqrt((pcx - centerX) ** 2 + (pcy - centerY) ** 2) / maxDist; // 0=centro, 1=canto
                    // Peças pequenas: penalizar distância do centro (preferir centro)
                    // Multiplier proporcional: super_pequena = mais forte
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

        // Remover retângulo livre usado
        this.freeRects.splice(info.freeIdx, 1);

        // Sobras após o kerf
        const rightW = f.w - pw - kerf;
        const bottomH = f.h - ph - kerf;

        if (rightW > 1 && bottomH > 1) {
            // Decisão de split baseada na direção de corte configurada
            let useVerticalSplit;
            switch (this.splitDir) {
                case 'horizontal':
                    // Prioriza cortes horizontais (faixas): bottom pega largura total
                    useVerticalSplit = false;
                    break;
                case 'vertical':
                    // Prioriza cortes verticais (colunas): right pega altura total
                    useVerticalSplit = true;
                    break;
                default: // 'auto' — SLA: split que maximiza o maior retalho
                    const maxV = Math.max(rightW * f.h, pw * bottomH);
                    const maxH = Math.max(rightW * ph, f.w * bottomH);
                    useVerticalSplit = maxV >= maxH;
            }

            if (useVerticalSplit) {
                // V-first: right pega altura total da free rect (colunas)
                this.freeRects.push({ x: f.x + pw + kerf, y: f.y, w: rightW, h: f.h });
                this.freeRects.push({ x: f.x, y: f.y + ph + kerf, w: pw, h: bottomH });
                this.cuts.push({ dir: 'V', x: f.x + pw, y: f.y, len: f.h });
                this.cuts.push({ dir: 'H', x: f.x, y: f.y + ph, len: pw });
            } else {
                // H-first: bottom pega largura total da free rect (faixas)
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
// Organiza peças em faixas horizontais (prateleiras). Cada prateleira
// tem altura fixa (do peça mais alta). Naturalmente produz cortes guilhotina.
// Baseado em Best Fit Decreasing Height (BFDH) — melhor algoritmo de shelf.
class ShelfBin {
    constructor(width, height, gap) {
        this.binW = width; this.binH = height; this.gap = gap;
        this.shelves = []; // { y, h, usedW, pieces[] }
        this.usedRects = [];
    }
    findBest(pw, ph, allowRotate, _heuristic) {
        let bestScore = Infinity, bestResult = null;
        // Try existing shelves — Best Fit (minimize height waste)
        for (let s = 0; s < this.shelves.length; s++) {
            const shelf = this.shelves[s];
            const freeW = this.binW - shelf.usedW;
            // Normal
            if (pw + this.gap <= freeW && ph <= shelf.h) {
                const waste = shelf.h - ph; // vertical waste
                if (waste < bestScore) {
                    bestScore = waste;
                    bestResult = { shelfIdx: s, newShelf: false,
                        x: shelf.usedW, y: shelf.y, w: pw, h: ph,
                        realW: pw, realH: ph, rotated: false, score: waste };
                }
            }
            // Rotated
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
        // Try new shelf (only if no existing shelf fits well, or none exist)
        const nextY = this.shelves.length > 0
            ? this.shelves[this.shelves.length - 1].y + this.shelves[this.shelves.length - 1].h + this.gap
            : 0;
        if (!bestResult || bestScore > ph * 0.3) { // If waste > 30% of piece height, try new shelf
            if (nextY + ph <= this.binH && pw + this.gap <= this.binW) {
                bestResult = { shelfIdx: this.shelves.length, newShelf: true, shelfH: ph,
                    x: 0, y: nextY, w: pw, h: ph, realW: pw, realH: ph,
                    rotated: false, score: 0 };
            }
            if (allowRotate && nextY + pw <= this.binH && ph + this.gap <= this.binW) {
                if (!bestResult || pw < ph) { // prefer orientation that creates shorter shelf
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
        // Generate horizontal cuts between shelves
        const cutsArr = [];
        for (let i = 0; i < this.shelves.length; i++) {
            const shelf = this.shelves[i];
            // Horizontal cut at top of each shelf
            if (shelf.y + shelf.h < this.binH) {
                cutsArr.push({ dir: 'H', y: shelf.y + shelf.h, x: 0, len: this.binW });
            }
        }
        return cutsArr;
    }
}

// ─── Helpers de classificação e scoring ──────────────────────────

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

function scoreResult(bins) {
    if (bins.length === 0) return { bins: 0, avgOccupancy: 0, minOccupancy: 0, score: Infinity };
    // REJECT solutions with overlapping pieces
    if (!verifyNoOverlaps(bins)) return { bins: bins.length, avgOccupancy: 0, minOccupancy: 0, score: Infinity };
    const occupancies = bins.map(b => b.occupancy());
    const sorted = [...occupancies].sort((a, b) => b - a); // highest first
    const n = bins.length;
    const avgOccupancy = occupancies.reduce((s, o) => s + o, 0) / n;
    const minOccupancy = Math.min(...occupancies);

    // PRIMARY: fewer bins is overwhelmingly better (×15000)
    let score = n * 15000;

    // SECONDARY: maximize total utilization
    const totalOcc = sorted.reduce((s, o) => s + o, 0);
    score -= totalOcc * 30;

    // TERTIARY: CONCENTRATE packing into fewer sheets (fill-first strategy)
    // Sum of squares rewards higher individual occupancy:
    //   [94,87,18] → 94²+87²+18² = 16729   vs   [66,66,66] → 66²×3 = 13068
    // The concentrated solution gets 3661 more points of bonus
    const sumSq = sorted.reduce((s, o) => s + o * o, 0);
    score -= sumSq * 0.5;

    // BONUS: reward very full bins (tight packing like commercial optimizers)
    for (const occ of sorted) {
        if (occ >= 90) score -= 800;
        else if (occ >= 80) score -= 400;
        else if (occ >= 70) score -= 150;
    }

    return { bins: n, avgOccupancy, minOccupancy, score };
}

// ─── Verificação de sobreposição (segurança) ────────────────────
function verifyNoOverlaps(bins) {
    for (let bi = 0; bi < bins.length; bi++) {
        const bin = bins[bi];
        for (let i = 0; i < bin.usedRects.length; i++) {
            for (let j = i + 1; j < bin.usedRects.length; j++) {
                const a = bin.usedRects[i], b = bin.usedRects[j];
                const aw = a.realW || a.w, ah = a.realH || a.h;
                const bw = b.realW || b.w, bh = b.realH || b.h;
                if (a.x < b.x + bw && a.x + aw > b.x &&
                    a.y < b.y + bh && a.y + ah > b.y) {
                    console.warn(`  [OVERLAP] bin ${bi}: piece ${i} (${a.x},${a.y},${aw}x${ah}) vs piece ${j} (${b.x},${b.y},${bw}x${bh})`);
                    return false;
                }
            }
        }
    }
    return true;
}

// ─── Reparo de sobreposição (post-processing) ───────────────────
// Se o algoritmo produzir sobreposições, reconstrói o layout peça por peça
function repairOverlaps(bins, binW, binH, spacing, binType, kerf, splitDir = 'auto') {
    for (let bi = 0; bi < bins.length; bi++) {
        const bin = bins[bi];
        // Check this bin for overlaps
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
        console.warn(`  [REPAIR] Rebuilding bin ${bi} with ${bin.usedRects.length} pieces to fix overlaps`);
        // Extract all pieces from this bin
        const pieces = bin.usedRects.map(r => ({
            ref: r.pieceRef, w: r.realW || r.w, h: r.realH || r.h,
            allowRotate: r.allowRotate || false,
            area: (r.realW || r.w) * (r.realH || r.h),
        })).filter(p => p.ref);
        // Sort by area desc (largest first — they're harder to place)
        pieces.sort((a, b) => b.area - a.area);
        // Rebuild using a fresh bin
        const createBin = () => {
            switch (binType) {
                case 'shelf': return new ShelfBin(binW, binH, kerf || spacing);
                case 'guillotine': return new GuillotineBin(binW, binH, kerf, splitDir);
                default: return new MaxRectsBin(binW, binH, spacing);
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
        // Replace the bin
        bins[bi] = newBin;
        // If pieces overflowed, try to add to subsequent bins or create new bin
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

// ─── Compactação por gravidade (empurra peças p/ canto superior-esquerdo) ──
// Após o nesting, reduz gaps visuais empurrando cada peça o mais para
// cima e para a esquerda possível, respeitando kerf entre peças.
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
            if (p.x < q.x + qw + k && p.x + pw + k > q.x &&
                p.y < q.y + qh + k && p.y + ph + k > q.y) return true;
        }
        return false;
    }

    // Múltiplas passadas até estabilizar
    for (let pass = 0; pass < 5; pass++) {
        let moved = false;
        // Ordenar por posição (top-left first) para compactar em cascata
        const order = pieces.map((_, i) => i).sort((a, b) => {
            return (pieces[a].y + pieces[a].x) - (pieces[b].y + pieces[b].x);
        });

        for (const i of order) {
            const p = pieces[i];
            const pw = p.realW || p.w, ph = p.realH || p.h;

            // Tentar mover para cima (reduzir Y)
            if (p.y > 0) {
                let bestY = p.y;
                // Encontrar posições candidatas: y=0 ou logo abaixo de outra peça
                const candidateYs = [0];
                for (let j = 0; j < pieces.length; j++) {
                    if (j === i) continue;
                    const q = pieces[j];
                    const qh = q.realH || q.h;
                    candidateYs.push(q.y + qh + k);
                }
                candidateYs.sort((a, b) => a - b);
                for (const cy of candidateYs) {
                    if (cy >= p.y) break;
                    if (cy + ph > binH) continue;
                    const test = { ...p, y: cy };
                    if (!collides(test, i)) { bestY = cy; break; }
                }
                if (bestY < p.y) { p.y = bestY; moved = true; }
            }

            // Tentar mover para esquerda (reduzir X)
            if (p.x > 0) {
                let bestX = p.x;
                const candidateXs = [0];
                for (let j = 0; j < pieces.length; j++) {
                    if (j === i) continue;
                    const q = pieces[j];
                    const qw = q.realW || q.w;
                    candidateXs.push(q.x + qw + k);
                }
                candidateXs.sort((a, b) => a - b);
                for (const cx of candidateXs) {
                    if (cx >= p.x) break;
                    if (cx + pw > binW) continue;
                    const test = { ...p, x: cx };
                    if (!collides(test, i)) { bestX = cx; break; }
                }
                if (bestX < p.x) { p.x = bestX; moved = true; }
            }
        }
        if (!moved) break;
    }
}

// ─── Nesting pass genérico (4 tipos de bin) ──────────────────────
// binType: 'maxrects' | 'guillotine' | 'shelf' | 'skyline'
// splitDir: 'auto' | 'horizontal' | 'vertical' (afeta GuillotineBin)
function runNestingPass(pieces, binW, binH, spacing, heuristic = 'BSSF', binType = 'guillotine', kerf = 4, splitDir = 'auto') {
    const createBin = () => {
        switch (binType) {
            case 'shelf': return new ShelfBin(binW, binH, kerf || spacing);
            case 'guillotine': return new GuillotineBin(binW, binH, kerf, splitDir);
            case 'skyline': return new SkylineBin(binW, binH, kerf || spacing);
            default: return new MaxRectsBin(binW, binH, kerf || spacing);
        }
    };

    const bins = [createBin()];
    for (const p of pieces) {
        const pClass = p.classificacao || 'normal';
        let bestBinIdx = -1, bestRect = null, bestFitScore = Infinity;
        for (let bi = 0; bi < bins.length; bi++) {
            const rect = bins[bi].findBest(p.w, p.h, p.allowRotate, heuristic, pClass);
            if (rect) {
                // Use internal score from bin (BSSF/BAF/etc) for better inter-bin comparison
                const fitScore = rect.score != null ? rect.score : ((rect.w * rect.h) - (p.w * p.h));
                if (fitScore < bestFitScore) {
                    bestFitScore = fitScore; bestRect = rect; bestBinIdx = bi;
                }
                if (fitScore <= 0) break; // Perfect fit, stop searching
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
                bins.push(newBin);
            }
        }
    }
    // Compactar cada bin (gravidade p/ top-left) para melhor visual
    for (const bin of bins) {
        compactBin(bin, binW, binH, kerf);
    }
    return bins;
}

// ─── Fill-First Nesting: enche cada chapa ao MÁXIMO antes de abrir outra ───
// Estratégia "bin-by-bin": para cada chapa, tenta colocar a melhor peça restante
// até não caber mais nada. Produz chapas concentradas (94%+87%+18%) em vez de
// distribuição uniforme (66%+66%+66%).
function runFillFirst(pieces, binW, binH, spacing, heuristic = 'BSSF', binType = 'guillotine', kerf = 4, splitDir = 'auto') {
    const createBin = () => {
        switch (binType) {
            case 'shelf': return new ShelfBin(binW, binH, kerf || spacing);
            case 'guillotine': return new GuillotineBin(binW, binH, kerf, splitDir);
            case 'skyline': return new SkylineBin(binW, binH, kerf || spacing);
            default: return new MaxRectsBin(binW, binH, kerf || spacing);
        }
    };

    const remaining = pieces.map((p, i) => ({ ...p, _idx: i }));
    const bins = [];

    while (remaining.length > 0) {
        const bin = createBin();
        let placedAny = true;

        // Greedy: keep placing the best-fitting piece until nothing fits
        while (placedAny && remaining.length > 0) {
            placedAny = false;
            let bestIdx = -1, bestRect = null, bestScore = Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const p = remaining[i];
                const pClass = p.classificacao || 'normal';
                const rect = bin.findBest(p.w, p.h, p.allowRotate, heuristic, pClass);
                if (rect) {
                    const sc = rect.score != null ? rect.score : ((rect.w * rect.h) - (p.w * p.h));
                    if (sc < bestScore) { bestScore = sc; bestRect = rect; bestIdx = i; }
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
            // Can't place any remaining piece — force into new bin one by one
            if (remaining.length > 0) {
                const p = remaining.shift();
                const rect = bin.findBest(p.w, p.h, p.allowRotate, heuristic);
                if (rect) {
                    rect.pieceRef = p.ref;
                    rect.allowRotate = p.allowRotate;
                    bin.placeRect(rect);
                    bins.push(bin);
                }
            }
        }
    }

    // Compactar cada bin
    for (const bin of bins) {
        compactBin(bin, binW, binH, kerf);
    }
    return bins;
}

// ─── Nesting com strip-packing (faixas por altura similar) ───────
// Agrupa peças com alturas similares em "faixas" horizontais
// Produz layouts visualmente mais organizados e compactos
function runStripPacking(pieces, binW, binH, kerf) {
    if (pieces.length === 0) return [];

    // Ordenar por altura descendente
    const sorted = [...pieces].sort((a, b) => b.h - a.h);
    const k = kerf || 4;

    class StripBin {
        constructor() {
            this.strips = [];     // { y, h, pieces: [{x,y,w,h,...}] }
            this.usedRects = [];
            this.binW = binW;
            this.binH = binH;
        }
        tryAdd(piece) {
            const pw = piece.w, ph = piece.h;
            // Try existing strips (best fit on height)
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
            // Try rotation in existing strips
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
            // New strip
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
            // Try rotated in new strip
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
    // Compactar
    for (const bin of bins) compactBin(bin, binW, binH, kerf);
    return bins;
}

// ─── BRKGA — Biased Random-Key Genetic Algorithm ─────────────────
// State-of-the-art para bin packing (Gonçalves & Resende, 2013)
// Cromossomas são vetores de chaves aleatórias [0,1] decodificados deterministicamente
function runBRKGA(pieces, binW, binH, spacing, binType, kerf, maxGen = 80, splitDir = 'auto') {
    if (pieces.length <= 3) return null;
    const n = pieces.length;
    const POP_SIZE = Math.min(40, Math.max(20, n * 2));
    const ELITE_FRAC = 0.20;
    const MUTANT_FRAC = 0.15;
    const INHERIT_PROB = 0.70;

    const heuristics = ['BSSF', 'BAF', 'CP', 'BL'];
    const binTypes = [binType];
    if (!binTypes.includes('guillotine')) binTypes.push('guillotine');
    if (!binTypes.includes('skyline')) binTypes.push('skyline');

    // Decoder: chaves [0..n-1] = ordem, [n..2n-1] = rotação, [2n] = heurística, [2n+1] = binType
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
        const h = heuristics[hIdx];
        const bt = binTypes[btIdx];

        const bins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
        return scoreResult(bins);
    }

    // Inicializar população
    const chromLen = 2 * n + 2;
    let population = [];
    for (let i = 0; i < POP_SIZE; i++) {
        const keys = new Float64Array(chromLen);
        for (let j = 0; j < chromLen; j++) keys[j] = Math.random();
        population.push({ keys, fitness: Infinity });
    }

    // Seeds inteligentes: inserir como cromossomas com chaves que reproduzem boas ordenações
    const seedSorts = [
        (a, b) => b.area - a.area,             // area desc
        (a, b) => b.maxSide - a.maxSide,        // maxside desc
        (a, b) => b.h - a.h || b.w - a.w,       // height desc
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
        // Avaliar
        for (const chr of population) {
            if (chr.fitness === Infinity) chr.fitness = decode(chr.keys).score;
            if (chr.fitness < bestFitness) { bestFitness = chr.fitness; bestResult = chr; }
        }

        population.sort((a, b) => a.fitness - b.fitness);
        const eliteCount = Math.floor(POP_SIZE * ELITE_FRAC);
        const mutantCount = Math.floor(POP_SIZE * MUTANT_FRAC);

        const newPop = population.slice(0, eliteCount); // Manter elite

        // Mutantes (imigrantes aleatórios)
        for (let i = 0; i < mutantCount; i++) {
            const keys = new Float64Array(chromLen);
            for (let j = 0; j < chromLen; j++) keys[j] = Math.random();
            newPop.push({ keys, fitness: Infinity });
        }

        // Crossover para preencher o resto
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

        // Early stop se já atingiu mínimo teórico
        if (bestFitness < 15001) break; // 1 bin
    }

    if (!bestResult) return null;

    // Decodificar o melhor resultado para obter os bins
    const order = pieces.map((p, i) => ({ idx: i, key: bestResult.keys[i] }));
    order.sort((a, b) => a.key - b.key);
    const sorted = order.map(o => {
        const p = pieces[o.idx];
        const rotate = p.allowRotate && bestResult.keys[n + o.idx] > 0.5;
        return rotate ? { ...p, w: p.h, h: p.w } : { ...p };
    });
    const hIdx = Math.floor(bestResult.keys[2 * n] * heuristics.length) % heuristics.length;
    const btIdx = Math.floor(bestResult.keys[2 * n + 1] * binTypes.length) % binTypes.length;
    const bins = runNestingPass(sorted, binW, binH, spacing, heuristics[hIdx], binTypes[btIdx], kerf, splitDir);

    return { bins, score: scoreResult(bins) };
}

// ─── Ruin & Recreate + LAHC + Simulated Annealing ────────────────
// Meta-heurística avançada com 8 tipos de perturbação
function ruinAndRecreate(pieces, binW, binH, spacing, binType, kerf, maxIter = 500, splitDir = 'auto') {
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
        // Aspect ratio (most square first)
        (a, b) => { const ra = Math.min(a.w,a.h)/Math.max(a.w,a.h); const rb = Math.min(b.w,b.h)/Math.max(b.w,b.h); return rb - ra; },
        // Diagonal desc
        (a, b) => Math.sqrt(b.w*b.w+b.h*b.h) - Math.sqrt(a.w*a.w+a.h*a.h),
        // Min side desc
        (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h),
    ];

    // Phase 1: best greedy seed (expanded search)
    let bestBins = null, bestScore = { score: Infinity };
    for (const sortFn of sortStrategies) {
        const sorted = [...pieces].sort(sortFn);
        for (const h of heuristics) {
            const bins = runNestingPass(sorted, binW, binH, spacing, h, binType, kerf, splitDir);
            const sc = scoreResult(bins);
            if (sc.score < bestScore.score) { bestScore = sc; bestBins = bins; }
        }
    }

    // Phase 1b: Try strip packing too
    const stripBins = runStripPacking(pieces, binW, binH, kerf);
    const stripSc = scoreResult(stripBins);
    if (stripSc.score < bestScore.score) { bestScore = stripSc; bestBins = stripBins; }

    // Phase 2: LAHC + SA perturbation with 8 strategies
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
            case 0: { // Random ruin — adaptive rate
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
            case 1: { // Targeted ruin — remove smallest pieces
                const sorted = [...pieces].sort((a, b) => a.area - b.area);
                const numR = Math.max(1, Math.floor(pieces.length * 0.25));
                reconstructed = [
                    ...sorted.slice(numR).sort((a, b) => b.area - a.area),
                    ...sorted.slice(0, numR).sort((a, b) => b.area - a.area),
                ];
                break;
            }
            case 2: { // Pair swap — swap random pairs in best ordering
                reconstructed = [...pieces].sort((a, b) => b.area - a.area);
                const swaps = Math.max(1, Math.floor(Math.random() * Math.min(5, pieces.length / 2)));
                for (let s = 0; s < swaps; s++) {
                    const i = Math.floor(Math.random() * reconstructed.length);
                    const j = Math.floor(Math.random() * reconstructed.length);
                    [reconstructed[i], reconstructed[j]] = [reconstructed[j], reconstructed[i]];
                }
                break;
            }
            case 3: { // Height-focused ruin (good for shelf/strip)
                const shuffled = [...pieces].sort(() => Math.random() - 0.5);
                const numR = Math.max(1, Math.floor(pieces.length * 0.2));
                reconstructed = [
                    ...shuffled.slice(numR).sort((a, b) => b.h - a.h),
                    ...shuffled.slice(0, numR).sort((a, b) => b.h - a.h),
                ];
                break;
            }
            case 4: { // Interleave large/small
                const sorted = [...pieces].sort((a, b) => b.area - a.area);
                reconstructed = [];
                let lo = 0, hi = sorted.length - 1;
                while (lo <= hi) {
                    reconstructed.push(sorted[lo++]);
                    if (lo <= hi) reconstructed.push(sorted[hi--]);
                }
                break;
            }
            case 5: { // Width-focused (group similar widths = better columns)
                const shuffled = [...pieces].sort(() => Math.random() - 0.5);
                const numR = Math.max(1, Math.floor(pieces.length * 0.2));
                reconstructed = [
                    ...shuffled.slice(numR).sort((a, b) => b.w - a.w),
                    ...shuffled.slice(0, numR).sort((a, b) => b.w - a.w),
                ];
                break;
            }
            case 6: { // Dimension-match ruin — group pieces with complementary dimensions
                // Peças cuja soma das larguras ≈ binW formam boas faixas
                const sorted = [...pieces].sort((a, b) => b.w - a.w);
                const used = new Set();
                reconstructed = [];
                for (let i = 0; i < sorted.length; i++) {
                    if (used.has(i)) continue;
                    reconstructed.push(sorted[i]);
                    used.add(i);
                    // Try to find a complement piece
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
            default: { // Block ruin — remove contiguous block + re-insert with varied sort
                const start = Math.floor(Math.random() * pieces.length);
                const blockSize = Math.max(2, Math.floor(pieces.length * 0.15 + Math.random() * pieces.length * 0.20));
                const sorted = [...pieces].sort(sortStrategies[iter % sortStrategies.length]);
                const block = sorted.splice(start % sorted.length, blockSize);
                reconstructed = [...sorted, ...block.sort(() => Math.random() - 0.5)];
            }
        }

        const h = heuristics[iter % heuristics.length];
        const bins = runNestingPass(reconstructed, binW, binH, spacing, h, binType, kerf, splitDir);
        const sc = scoreResult(bins);

        const lahcIdx = iter % windowSize;
        const delta = sc.score - lahcWindow[lahcIdx];
        // Accept if better, or with SA probability (exploration)
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

// ─── Gerar sequência de cortes (para esquadrejadeira) ────────────
function gerarSequenciaCortes(bin) {
    if (!bin.cuts || bin.cuts.length === 0) return [];
    // Ordenar: primeiro cortes horizontais (faixas), depois verticais dentro de cada faixa
    const hCuts = bin.cuts.filter(c => c.dir === 'H').sort((a, b) => a.y - b.y);
    const vCuts = bin.cuts.filter(c => c.dir === 'V').sort((a, b) => a.x - b.x);
    let seq = 1;
    return [
        ...hCuts.map(c => ({ seq: seq++, dir: 'Horizontal', pos: Math.round(c.y), len: Math.round(c.len) })),
        ...vCuts.map(c => ({ seq: seq++, dir: 'Vertical', pos: Math.round(c.x), len: Math.round(c.len) })),
    ];
}

// ═══════════════════════════════════════════════════════
// JSON PARSING — Extrair peças do JSON do plugin
// ═══════════════════════════════════════════════════════

function parsePluginJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const details = data.details_project || {};
    const machining = data.machining || {};
    const entities = data.model_entities || {};

    const loteInfo = {
        cliente: details.client_name || details.cliente || '',
        projeto: details.project_name || details.projeto || '',
        codigo: details.project_code || details.codigo || '',
        vendedor: details.seller_name || details.vendedor || '',
    };

    const pecas = [];

    // Iterate model_entities — each index is a module
    for (const modIdx of Object.keys(entities)) {
        const modulo = entities[modIdx];
        if (!modulo || !modulo.entities) continue;

        for (const entIdx of Object.keys(modulo.entities)) {
            const ent = modulo.entities[entIdx];
            if (!ent || !ent.upmpiece) continue;

            // Extract piece info
            const peca = {
                persistent_id: ent.upmpersistentid || '',
                upmcode: ent.upmcode || '',
                descricao: ent.upmdescription || '',
                modulo_desc: ent.upmmasterdescription || modulo.upmmasterdescription || '',
                modulo_id: ent.upmmasterid || modulo.upmmasterid || 0,
                produto_final: ent.upmproductfinal || '',
                material: '',
                material_code: '',
                espessura: 0,
                comprimento: 0,
                largura: 0,
                quantidade: ent.upmquantity || 1,
                borda_dir: ent.upmedgeside1 || '',
                borda_esq: ent.upmedgeside2 || '',
                borda_frontal: ent.upmedgeside3 || '',
                borda_traseira: ent.upmedgeside4 || '',
                acabamento: ent.upmedgesidetype || '',
                upmdraw: ent.upmdraw || '',
                usi_a: ent.upmprocesscodea || '',
                usi_b: ent.upmprocesscodeb || '',
                machining_json: '{}',
                observacao: '',
            };

            // Extract dimensions — use panel sub-entity if available
            let panelFound = false;
            if (ent.entities) {
                for (const subIdx of Object.keys(ent.entities)) {
                    const sub = ent.entities[subIdx];
                    if (sub && sub.upmfeedstockpanel) {
                        peca.material_code = sub.upmmaterialcode || sub.upmcode || '';
                        peca.material = sub.upmdescription || sub.upmmaterialcode || '';
                        peca.espessura = sub.upmrealthickness || sub.upmthickness || 0;
                        peca.comprimento = sub.upmcutlength || sub.upmlength || 0;
                        peca.largura = sub.upmcutwidth || sub.upmwidth || 0;
                        panelFound = true;
                        break;
                    }
                }
            }

            // Fallback: use piece dimensions directly
            if (!panelFound) {
                const h = ent.upmheight || 0;
                const d = ent.upmdepth || 0;
                const w = ent.upmwidth || 0;
                const dims = [h, d, w].sort((a, b) => b - a);
                peca.comprimento = dims[0] || 0;
                peca.largura = dims[1] || 0;
                peca.espessura = dims[2] || 0;
            }

            // Normalize espessura: extract from material_code if still 0
            // e.g. MDF_15.5_BRANCO_TX → 15.5, MDF_6_CRU → 6
            if ((!peca.espessura || peca.espessura === 0) && peca.material_code) {
                const m = peca.material_code.match(/_(\d+(?:\.\d+)?)_/);
                if (m) peca.espessura = parseFloat(m[1]);
            }

            // Machining data
            if (peca.persistent_id && machining[peca.persistent_id]) {
                const machData = { ...machining[peca.persistent_id] };
                // Se o contour esta no nivel da piece entity (model_entities), incluir no machining
                if (ent.contour && !machData.contour) {
                    machData.contour = ent.contour;
                }
                peca.machining_json = JSON.stringify(machData);
            } else if (ent.contour) {
                // Peca sem machining mas com contour
                peca.machining_json = JSON.stringify({ contour: ent.contour });
            }

            pecas.push(peca);
        }
    }

    return { loteInfo, pecas };
}

// ═══════════════════════════════════════════════════════
// GRUPO 1: Importação JSON
// ═══════════════════════════════════════════════════════

router.post('/lotes/importar', requireAuth, (req, res) => {
    try {
        const { json, nome } = req.body;
        if (!json) return res.status(400).json({ error: 'JSON é obrigatório' });

        const { loteInfo, pecas } = parsePluginJSON(json);
        if (pecas.length === 0) return res.status(400).json({ error: 'Nenhuma peça encontrada no JSON' });

        const loteNome = nome || loteInfo.projeto || `Lote ${new Date().toLocaleDateString('pt-BR')}`;

        const insertLote = db.prepare(`
            INSERT INTO cnc_lotes (user_id, nome, cliente, projeto, codigo, vendedor, json_original, total_pecas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = insertLote.run(
            req.user.id, loteNome, loteInfo.cliente, loteInfo.projeto,
            loteInfo.codigo, loteInfo.vendedor, typeof json === 'string' ? json : JSON.stringify(json),
            pecas.length
        );
        const loteId = result.lastInsertRowid;

        const insertPeca = db.prepare(`
            INSERT INTO cnc_pecas (lote_id, persistent_id, upmcode, descricao, modulo_desc, modulo_id,
              produto_final, material, material_code, espessura, comprimento, largura, quantidade,
              borda_dir, borda_esq, borda_frontal, borda_traseira, acabamento, upmdraw, usi_a, usi_b,
              machining_json, observacao)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `);

        const insertMany = db.transaction((items) => {
            for (const p of items) {
                insertPeca.run(
                    loteId, p.persistent_id, p.upmcode, p.descricao, p.modulo_desc, p.modulo_id,
                    p.produto_final, p.material, p.material_code, p.espessura, p.comprimento, p.largura,
                    p.quantidade, p.borda_dir, p.borda_esq, p.borda_frontal, p.borda_traseira,
                    p.acabamento, p.upmdraw, p.usi_a, p.usi_b, p.machining_json, p.observacao
                );
            }
        });
        insertMany(pecas);

        res.json({
            id: Number(loteId),
            nome: loteNome,
            total_pecas: pecas.length,
            cliente: loteInfo.cliente,
            projeto: loteInfo.projeto,
        });
    } catch (err) {
        console.error('Erro ao importar JSON CNC:', err);
        res.status(500).json({ error: 'Erro ao importar JSON' });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 2: Listagem e CRUD
// ═══════════════════════════════════════════════════════

router.get('/lotes', requireAuth, (req, res) => {
    const lotes = db.prepare('SELECT * FROM cnc_lotes WHERE user_id = ? ORDER BY criado_em DESC').all(req.user.id);
    res.json(lotes);
});

router.get('/lotes/:id', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(lote.id);
    // Resume info
    const materiais = [...new Set(pecas.map(p => p.material_code).filter(Boolean))];
    const modulos = [...new Set(pecas.map(p => p.modulo_desc).filter(Boolean))];
    const totalInstancias = pecas.reduce((s, p) => s + p.quantidade, 0);
    const areaTotal = pecas.reduce((s, p) => s + (p.comprimento * p.largura * p.quantidade) / 1e6, 0);
    res.json({ ...lote, pecas, materiais, modulos, totalInstancias, areaTotal: Math.round(areaTotal * 100) / 100 });
});

router.delete('/lotes/:id', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT id FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    db.prepare('DELETE FROM cnc_lotes WHERE id = ?').run(lote.id);
    res.json({ ok: true });
});

router.get('/pecas/:loteId', requireAuth, (req, res) => {
    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(req.params.loteId);
    res.json(pecas);
});

router.put('/pecas/:id', requireAuth, (req, res) => {
    const { observacao, comprimento, largura } = req.body;
    const peca = db.prepare('SELECT p.id FROM cnc_pecas p JOIN cnc_lotes l ON p.lote_id = l.id WHERE p.id = ? AND l.user_id = ?').get(req.params.id, req.user.id);
    if (!peca) return res.status(404).json({ error: 'Peça não encontrada' });
    const updates = [];
    const vals = [];
    if (observacao !== undefined) { updates.push('observacao = ?'); vals.push(observacao); }
    if (comprimento !== undefined) { updates.push('comprimento = ?'); vals.push(comprimento); }
    if (largura !== undefined) { updates.push('largura = ?'); vals.push(largura); }
    if (updates.length === 0) return res.json({ ok: true });
    vals.push(req.params.id);
    db.prepare(`UPDATE cnc_pecas SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GRUPO 3: Otimizador Nesting 2D — MaxRects-BSSF
// ═══════════════════════════════════════════════════════

router.post('/otimizar/:loteId', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

        const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
        if (pecas.length === 0) return res.status(400).json({ error: 'Nenhuma peça no lote' });

        const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get() || {};

        // Body overrides (frontend config panel can override saved defaults)
        const body = req.body || {};
        const spacing = body.espaco_pecas != null ? Number(body.espaco_pecas) : (config.espaco_pecas || 7);
        const kerfPadrao = body.kerf != null ? Number(body.kerf) : (config.kerf_padrao || 4);
        const modoRaw = body.modo != null ? body.modo : (config.usar_guilhotina !== 0 ? 'guilhotina' : 'maxrects');
        // binType: 'maxrects', 'guillotine', or 'shelf'
        const binType = modoRaw === 'maxrects' ? 'maxrects' : modoRaw === 'shelf' ? 'shelf' : 'guillotine';
        const canGenerateCuts = binType !== 'maxrects'; // guillotine & shelf produce cut sequences
        const useRetalhos = body.usar_retalhos != null ? !!body.usar_retalhos : (config.usar_retalhos !== 0);
        const maxIter = body.iteracoes != null ? Number(body.iteracoes) : (config.iteracoes_otimizador || 300);
        const considerarSobra = body.considerar_sobra != null ? !!body.considerar_sobra : (config.considerar_sobra !== 0);
        const sobraMinW = body.sobra_min_largura != null ? Number(body.sobra_min_largura) : (config.sobra_min_largura || 300);
        const sobraMinH = body.sobra_min_comprimento != null ? Number(body.sobra_min_comprimento) : (config.sobra_min_comprimento || 600);
        const permitirRotacao = body.permitir_rotacao != null ? !!body.permitir_rotacao : null; // null = use grain logic
        const refiloOverride = body.refilo != null ? Number(body.refilo) : null; // null = use sheet default
        // Direção de corte: 'misto' (auto/SLA), 'horizontal' (faixas), 'vertical' (colunas)
        const direcaoCorteRaw = body.direcao_corte || 'misto';
        const splitDir = direcaoCorteRaw === 'horizontal' ? 'horizontal' : direcaoCorteRaw === 'vertical' ? 'vertical' : 'auto';

        // Classificação de peças por tamanho (para CNC: vácuo, tabs, velocidade)
        const limiarPequena = body.limiar_pequena != null ? Number(body.limiar_pequena) : 400;   // mm — menor dimensão
        const limiarSuperPequena = body.limiar_super_pequena != null ? Number(body.limiar_super_pequena) : 200; // mm
        const classificarPecas = body.classificar_pecas !== false; // ativo por padrão

        const vacuumAware = body.vacuum_aware !== false; // ativo por padrão

        function classifyPiece(w, h) {
            if (!classificarPecas) return 'normal';
            const minDim = Math.min(w, h);
            if (minDim < limiarSuperPequena) return 'super_pequena';
            if (minDim < limiarPequena) return 'pequena';
            return 'normal';
        }

        // Set vacuum-aware module state for bin constructors
        _vacuumAware = vacuumAware;

        // Group pieces by material_code + espessura (normalize espessura=0 from material_code)
        const groups = {};
        for (const p of pecas) {
            let esp = p.espessura || 0;
            if (!esp && p.material_code) { const m = p.material_code.match(/_(\d+(?:\.\d+)?)_/); if (m) esp = parseFloat(m[1]); }
            const key = `${p.material_code}__${esp}`;
            if (!groups[key]) groups[key] = { material_code: p.material_code, espessura: esp || p.espessura, pieces: [] };
            groups[key].pieces.push(p);
        }

        const plano = {
            chapas: [], retalhos: [], materiais: {}, modo: binType, direcao_corte: direcaoCorteRaw,
            classificacao: { limiar_pequena: limiarPequena, limiar_super_pequena: limiarSuperPequena, ativo: classificarPecas },
        };
        let globalChapaIdx = 0;
        let totalCombinacoes = 0;

        // Reset all piece positions
        db.prepare('UPDATE cnc_pecas SET chapa_idx = NULL, pos_x = 0, pos_y = 0, rotacionada = 0 WHERE lote_id = ?').run(lote.id);
        db.prepare("DELETE FROM cnc_retalhos WHERE origem_lote = ?").run(String(lote.id));

        for (const [groupKey, group] of Object.entries(groups)) {
            // Find matching sheet
            let chapa = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(group.material_code);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE espessura_real = ? AND ativo = 1').get(group.espessura);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY comprimento DESC LIMIT 1').get();
            if (!chapa) chapa = { comprimento: 2750, largura: 1850, refilo: 10, kerf: kerfPadrao, nome: 'Padrão 2750x1850', material_code: group.material_code, preco: 0, veio: 'sem_veio' };

            const refilo = refiloOverride != null ? refiloOverride : (chapa.refilo || 10);
            const kerf = chapa.kerf || kerfPadrao;
            const binW = chapa.comprimento - 2 * refilo;
            const binH = chapa.largura - 2 * refilo;
            const chapaVeio = chapa.veio || 'sem_veio'; // sem_veio, horizontal, vertical
            const temVeio = chapaVeio !== 'sem_veio';

            // Expand pieces by quantity + GRAIN DIRECTION (veio)
            const expanded = [];
            for (const p of group.pieces) {
                // Veio SEMPRE tem prioridade: material com veio NUNCA permite rotação
                // permitirRotacao só afeta materiais sem veio
                const allowRotate = temVeio ? false : (permitirRotacao != null ? permitirRotacao : true);

                for (let q = 0; q < p.quantidade; q++) {
                    expanded.push({
                        ref: { pecaId: p.id, instancia: q },
                        w: p.comprimento,
                        h: p.largura,
                        allowRotate,
                        area: p.comprimento * p.largura,
                        perim: 2 * (p.comprimento + p.largura),
                        maxSide: Math.max(p.comprimento, p.largura),
                        diff: Math.abs(p.comprimento - p.largura),
                        classificacao: classifyPiece(p.comprimento, p.largura),
                    });
                }
            }

            // ═══ FASE 1: Tentar usar retalhos existentes PRIMEIRO ═══
            let pecasRestantes = [...expanded];
            const retalhosUsados = [];

            if (useRetalhos) {
                const retalhosDisp = db.prepare(
                    'SELECT * FROM cnc_retalhos WHERE material_code = ? AND espessura_real = ? AND disponivel = 1 ORDER BY comprimento * largura DESC'
                ).all(group.material_code, group.espessura);

                for (const ret of retalhosDisp) {
                    if (pecasRestantes.length === 0) break;
                    const retW = ret.comprimento, retH = ret.largura;

                    // Tentar encaixar peças no retalho
                    const bins = runNestingPass(
                        [...pecasRestantes].sort((a, b) => b.area - a.area),
                        retW, retH, spacing, 'BSSF', binType, kerf, splitDir
                    );

                    if (bins.length === 1 && bins[0].usedRects.length > 0) {
                        const bin = bins[0];
                        const chapaIdx = globalChapaIdx++;
                        const chapaInfo = {
                            idx: chapaIdx,
                            material: `RETALHO: ${ret.nome}`,
                            material_code: group.material_code,
                            comprimento: retW, largura: retH, refilo: 0,
                            preco: 0, veio: chapaVeio,
                            aproveitamento: Math.round(bin.occupancy() * 100) / 100,
                            is_retalho: true, retalho_id: ret.id,
                            pecas: [], retalhos: [],
                            cortes: canGenerateCuts ? gerarSequenciaCortes(bin) : [],
                        };

                        const placedRefs = new Set();
                        const updatePeca = db.prepare('UPDATE cnc_pecas SET chapa_idx = ?, pos_x = ?, pos_y = ?, rotacionada = ? WHERE id = ? AND lote_id = ?');
                        for (const rect of bin.usedRects) {
                            if (!rect.pieceRef) continue;
                            const { pecaId, instancia } = rect.pieceRef;
                            if (instancia === 0) updatePeca.run(chapaIdx, rect.x, rect.y, rect.rotated ? 1 : 0, pecaId, lote.id);
                            const clsR = classifyPiece(rect.realW, rect.realH);
                            const pecaR = { pecaId, instancia, x: rect.x, y: rect.y, w: rect.realW, h: rect.realH, rotated: rect.rotated };
                            if (clsR !== 'normal') pecaR.classificacao = clsR;
                            chapaInfo.pecas.push(pecaR);
                            placedRefs.add(`${pecaId}_${instancia}`);
                        }

                        plano.chapas.push(chapaInfo);
                        retalhosUsados.push(ret.id);
                        db.prepare('UPDATE cnc_retalhos SET disponivel = 0 WHERE id = ?').run(ret.id);

                        // Remover peças já colocadas
                        pecasRestantes = pecasRestantes.filter(p => !placedRefs.has(`${p.ref.pecaId}_${p.ref.instancia}`));
                    }
                }
            }

            if (pecasRestantes.length === 0) {
                plano.materiais[groupKey] = {
                    material_code: group.material_code, espessura: group.espessura,
                    total_pecas: expanded.length, total_chapas: plano.chapas.length - globalChapaIdx + 1,
                    chapa_usada: chapa.nome, estrategia: 'retalhos_only',
                    ocupacao_media: 0, retalhos_usados: retalhosUsados.length,
                };
                continue;
            }

            // ═══ FASE 2: Multi-pass greedy (expanded: 15+ sort strategies) ═══
            const sortStrategies = [
                { name: 'area_desc',    fn: (a, b) => b.area - a.area },
                { name: 'perim_desc',   fn: (a, b) => b.perim - a.perim },
                { name: 'maxside_desc', fn: (a, b) => b.maxSide - a.maxSide },
                { name: 'diff_desc',    fn: (a, b) => b.diff - a.diff },
                { name: 'area_asc',     fn: (a, b) => a.area - b.area },
                { name: 'perim_asc',    fn: (a, b) => a.perim - b.perim },
                { name: 'maxside_asc',  fn: (a, b) => a.maxSide - b.maxSide },
                { name: 'w_h_desc',     fn: (a, b) => b.w - a.w || b.h - a.h },
                { name: 'h_w_desc',     fn: (a, b) => b.h - a.h || b.w - a.w },
                { name: 'ratio_sq',     fn: (a, b) => {
                    const ra = Math.min(a.w, a.h) / Math.max(a.w, a.h);
                    const rb = Math.min(b.w, b.h) / Math.max(b.w, b.h);
                    return rb - ra; // most square first
                }},
                { name: 'ratio_thin',   fn: (a, b) => {
                    const ra = Math.min(a.w, a.h) / Math.max(a.w, a.h);
                    const rb = Math.min(b.w, b.h) / Math.max(b.w, b.h);
                    return ra - rb; // thinnest first
                }},
                { name: 'diagonal',     fn: (a, b) => Math.sqrt(b.w*b.w+b.h*b.h) - Math.sqrt(a.w*a.w+a.h*a.h) },
                { name: 'minside_desc', fn: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) },
                { name: 'w_asc_h_desc', fn: (a, b) => a.w - b.w || b.h - a.h },
                { name: 'area_diff',    fn: (a, b) => (b.area - a.area) || (b.diff - a.diff) },
            ];

            const { small, medium, large } = classifyBySize(pecasRestantes);
            const tieredSets = [];
            if (small.length + medium.length + large.length === pecasRestantes.length) {
                tieredSets.push({ name: 'tiered_SMG', pieces: [...small.sort((a, b) => a.area - b.area), ...medium.sort((a, b) => a.area - b.area), ...large.sort((a, b) => a.area - b.area)] });
                tieredSets.push({ name: 'tiered_GMS', pieces: [...large.sort((a, b) => b.area - a.area), ...medium.sort((a, b) => b.area - a.area), ...small.sort((a, b) => b.area - a.area)] });
                // Intercalado
                const interleaved = [];
                const pools = [[...large].sort((a, b) => b.area - a.area), [...small].sort((a, b) => a.area - b.area), [...medium].sort((a, b) => b.area - a.area)];
                while (pools.some(p => p.length > 0)) { for (const pool of pools) { if (pool.length > 0) interleaved.push(pool.shift()); } }
                tieredSets.push({ name: 'tiered_mix', pieces: interleaved });
            }

            const heuristics = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];
            let bestBins = null, bestBinScore = { score: Infinity }, bestStrategyName = '', bestBinType = binType;

            // Calcular mínimo teórico de chapas
            const totalPieceArea = pecasRestantes.reduce((s, p) => s + p.area, 0);
            const sheetArea = binW * binH;
            const minTeoricoChapas = Math.ceil(totalPieceArea / sheetArea);

            // Try the selected binType + also try all 4 types to find the best result
            const binTypesToTry = [binType];
            if (!binTypesToTry.includes('guillotine')) binTypesToTry.push('guillotine');
            if (!binTypesToTry.includes('shelf')) binTypesToTry.push('shelf');
            if (!binTypesToTry.includes('maxrects')) binTypesToTry.push('maxrects');
            if (!binTypesToTry.includes('skyline')) binTypesToTry.push('skyline');

            // Adicionar sorts específicos por direção de corte
            const dirSortStrategies = [...sortStrategies];
            if (splitDir === 'horizontal') {
                // Horizontal: priorizar agrupamento por alturas similares (faixas)
                dirSortStrategies.push(
                    { name: 'dir_h_group', fn: (a, b) => b.h - a.h || b.area - a.area },
                    { name: 'dir_h_strip', fn: (a, b) => {
                        // Agrupar peças com alturas similares (±10%) para faixas eficientes
                        const ha = Math.round(a.h / 20) * 20;
                        const hb = Math.round(b.h / 20) * 20;
                        return hb - ha || b.w - a.w;
                    }},
                );
            } else if (splitDir === 'vertical') {
                // Vertical: priorizar agrupamento por larguras similares (colunas)
                dirSortStrategies.push(
                    { name: 'dir_v_group', fn: (a, b) => b.w - a.w || b.area - a.area },
                    { name: 'dir_v_col', fn: (a, b) => {
                        // Agrupar peças com larguras similares (±10%) para colunas eficientes
                        const wa = Math.round(a.w / 20) * 20;
                        const wb = Math.round(b.w / 20) * 20;
                        return wb - wa || b.h - a.h;
                    }},
                );
            }

            for (const bt of binTypesToTry) {
                for (const strat of dirSortStrategies) {
                    const sorted = [...pecasRestantes].sort(strat.fn);
                    for (const h of heuristics) {
                        const bins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                        const sc = scoreResult(bins);
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = bins; bestStrategyName = `${strat.name}+${h}+${bt}`; bestBinType = bt; }
                        totalCombinacoes++;
                    }
                }
                for (const ts of tieredSets) {
                    for (const h of heuristics) {
                        const bins = runNestingPass([...ts.pieces], binW, binH, spacing, h, bt, kerf, splitDir);
                        const sc = scoreResult(bins);
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = bins; bestStrategyName = `${ts.name}+${h}+${bt}`; bestBinType = bt; }
                        totalCombinacoes++;
                    }
                }
            }

            // ═══ FASE 2.5a: Fill-First — enche cada chapa ao máximo antes de abrir outra ═══
            // Estratégia de empacotamento concentrado (como CutOptima, OptiCut, etc.)
            for (const bt of binTypesToTry) {
                for (const strat of dirSortStrategies) {
                    const sorted = [...pecasRestantes].sort(strat.fn);
                    for (const h of heuristics) {
                        const bins = runFillFirst(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                        const sc = scoreResult(bins);
                        if (sc.score < bestBinScore.score) {
                            bestBinScore = sc; bestBins = bins;
                            bestStrategyName = `fillFirst+${strat.name}+${h}+${bt}`;
                            bestBinType = bt;
                        }
                        totalCombinacoes++;
                    }
                }
            }

            // ═══ FASE 2.5b: Strip Packing (faixas por altura) ═══
            // Especialmente bom para peças com alturas variadas (reguas + laterais + bases)
            {
                const stripBins = runStripPacking(pecasRestantes, binW, binH, kerf);
                const sc = scoreResult(stripBins);
                if (sc.score < bestBinScore.score) {
                    bestBinScore = sc; bestBins = stripBins;
                    bestStrategyName = 'strip_packing'; bestBinType = 'strip';
                }
                totalCombinacoes++;
                // Also try strip with rotated pieces (swap w/h)
                if (pecasRestantes.some(p => p.allowRotate)) {
                    const rotated = pecasRestantes.map(p => p.allowRotate
                        ? { ...p, w: p.h, h: p.w }
                        : p);
                    const stripBins2 = runStripPacking(rotated, binW, binH, kerf);
                    const sc2 = scoreResult(stripBins2);
                    if (sc2.score < bestBinScore.score) {
                        bestBinScore = sc2; bestBins = stripBins2;
                        bestStrategyName = 'strip_packing_rotated'; bestBinType = 'strip';
                    }
                    totalCombinacoes++;
                }
            }

            // ═══ FASE 3: Ruin & Recreate (meta-heurística LAHC) ═══
            const rrIter = Math.max(maxIter, 500); // Mínimo 500 iterações R&R
            if (pecasRestantes.length > 3 && rrIter > 0) {
                // Run R&R with all bin types too
                for (const bt of binTypesToTry) {
                    const rrResult = ruinAndRecreate(pecasRestantes, binW, binH, spacing, bt, kerf, rrIter, splitDir);
                    if (rrResult && rrResult.score.score < bestBinScore.score) {
                        bestBinScore = rrResult.score;
                        bestBins = rrResult.bins;
                        bestStrategyName = `ruin_recreate+LAHC+${bt}`;
                        bestBinType = bt;
                    }
                    totalCombinacoes += rrIter;
                }
            }

            // ═══ FASE 3.5: BRKGA — Genetic Algorithm com chaves aleatórias ═══
            // Evolui populações de permutações + rotações para encontrar layout ótimo
            if (pecasRestantes.length > 3 && bestBinScore.bins > minTeoricoChapas) {
                const brkgaGen = Math.min(100, Math.max(40, pecasRestantes.length * 3));
                const brkgaResult = runBRKGA(pecasRestantes, binW, binH, spacing, binType, kerf, brkgaGen, splitDir);
                if (brkgaResult && brkgaResult.score.score < bestBinScore.score) {
                    bestBinScore = brkgaResult.score;
                    bestBins = brkgaResult.bins;
                    bestStrategyName = `BRKGA_${brkgaGen}gen`;
                    bestBinType = binType;
                }
                totalCombinacoes += brkgaGen * 40; // POP_SIZE * generations
            }

            // ═══ FASE 4: Consolidation — re-run nesting with compact strategies ═══
            if (bestBins && bestBins.length > 1) {
                // Collect all placed pieces and try compact-focused sort strategies
                const compactPieces = [];
                for (const bin of bestBins) {
                    for (const r of bin.usedRects) {
                        if (!r.pieceRef) continue;
                        compactPieces.push({
                            ref: r.pieceRef,
                            w: r.realW || r.w,
                            h: r.realH || r.h,
                            allowRotate: r.allowRotate || false,
                            area: (r.realW || r.w) * (r.realH || r.h),
                            perim: 2 * ((r.realW || r.w) + (r.realH || r.h)),
                            maxSide: Math.max(r.realW || r.w, r.realH || r.h),
                            diff: Math.abs((r.realW || r.w) - (r.realH || r.h)),
                        });
                    }
                }
                // Extra compact strategies focused on tight packing
                const compactSorts = [
                    { name: 'compact_h_desc', fn: (a, b) => b.h - a.h || b.w - a.w },
                    { name: 'compact_w_desc', fn: (a, b) => b.w - a.w || b.h - a.h },
                    { name: 'compact_sqratio', fn: (a, b) => {
                        const ra = Math.min(a.w, a.h) / Math.max(a.w, a.h);
                        const rb = Math.min(b.w, b.h) / Math.max(b.w, b.h);
                        return rb - ra; // most square first
                    }},
                ];
                for (const cs of compactSorts) {
                    const sorted = [...compactPieces].sort(cs.fn);
                    for (const h of ['BSSF', 'BAF']) {
                        for (const bt of binTypesToTry) {
                            const newBins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                            const sc = scoreResult(newBins);
                            if (sc.score < bestBinScore.score) {
                                bestBins = newBins; bestBinScore = sc; bestBinType = bt;
                                bestStrategyName = `${cs.name}+${h}+${bt}+consolidated`;
                            }
                            totalCombinacoes++;
                        }
                    }
                }
            }

            // ═══ FASE 5: Gap filling (SAFE — rebuild approach) ═══
            // Agressivamente tenta reduzir número de chapas
            if (bestBins && bestBins.length > 1) {
                // Sempre tentar reduzir, não só quando última chapa < 60%
                const allPieces = [];
                for (const bin of bestBins) {
                    for (const r of bin.usedRects) {
                        if (!r.pieceRef) continue;
                        allPieces.push({
                            ref: r.pieceRef, w: r.realW || r.w, h: r.realH || r.h,
                            allowRotate: r.allowRotate || false,
                            area: (r.realW || r.w) * (r.realH || r.h),
                            perim: 2 * ((r.realW || r.w) + (r.realH || r.h)),
                            maxSide: Math.max(r.realW || r.w, r.realH || r.h),
                            diff: Math.abs((r.realW || r.w) - (r.realH || r.h)),
                        });
                    }
                }
                const targetBins = bestBins.length - 1;
                // Só faz sentido tentar se a área teórica cabe em menos chapas
                if (targetBins >= minTeoricoChapas) {
                    const gapSorts = [
                        (a, b) => b.area - a.area,
                        (a, b) => b.maxSide - a.maxSide,
                        (a, b) => b.h - a.h || b.w - a.w,
                        (a, b) => b.w - a.w || b.h - a.h,
                        (a, b) => b.perim - a.perim,
                        (a, b) => b.diff - a.diff,
                    ];
                    for (const sortFn of gapSorts) {
                        for (const h of heuristics) {
                            for (const bt of binTypesToTry) {
                                const sorted = [...allPieces].sort(sortFn);
                                const testBins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                                if (testBins.length <= targetBins && verifyNoOverlaps(testBins)) {
                                    const sc = scoreResult(testBins);
                                    if (sc.score < bestBinScore.score) {
                                        bestBins = testBins;
                                        bestBinScore = sc;
                                        bestBinType = bt;
                                        bestStrategyName += '+gap_repack';
                                    }
                                }
                                totalCombinacoes++;
                            }
                        }
                    }
                    // Also try strip packing for gap filling
                    const stripTest = runStripPacking(allPieces, binW, binH, kerf);
                    if (stripTest.length <= targetBins && verifyNoOverlaps(stripTest)) {
                        const sc = scoreResult(stripTest);
                        if (sc.score < bestBinScore.score) {
                            bestBins = stripTest; bestBinScore = sc;
                            bestBinType = 'strip'; bestStrategyName += '+strip_repack';
                        }
                    }
                    // Also try fill-first for gap filling (concentrated packing)
                    for (const bt of binTypesToTry) {
                        for (const h of heuristics) {
                            const ffBins = runFillFirst([...allPieces].sort((a, b) => b.area - a.area), binW, binH, spacing, h, bt, kerf, splitDir);
                            const ffSc = scoreResult(ffBins);
                            if (ffSc.score < bestBinScore.score) {
                                bestBins = ffBins; bestBinScore = ffSc;
                                bestBinType = bt; bestStrategyName += `+fillFirst_gap_${bt}`;
                            }
                            totalCombinacoes++;
                        }
                    }
                }
            }

            // ═══ SAFETY: Verify no overlaps & repair if needed ═══
            if (!verifyNoOverlaps(bestBins)) {
                console.warn(`  [OVERLAP DETECTED] Repairing overlaps in ${groupKey}...`);
                bestBins = repairOverlaps(bestBins, binW, binH, spacing, bestBinType, kerf, splitDir);
                bestBinScore = scoreResult(bestBins);
                if (!verifyNoOverlaps(bestBins)) {
                    console.error(`  [OVERLAP STILL EXISTS] after repair in ${groupKey} — rebuilding from scratch`);
                    // Last resort: rebuild ALL pieces from scratch with simple greedy
                    const allPieces = [];
                    for (const bin of bestBins) {
                        for (const r of bin.usedRects) {
                            if (r.pieceRef) allPieces.push({
                                ref: r.pieceRef, w: r.realW || r.w, h: r.realH || r.h,
                                allowRotate: r.allowRotate || false,
                                area: (r.realW || r.w) * (r.realH || r.h),
                                perim: 2 * ((r.realW || r.w) + (r.realH || r.h)),
                                maxSide: Math.max(r.realW || r.w, r.realH || r.h),
                                diff: Math.abs((r.realW || r.w) - (r.realH || r.h)),
                            });
                        }
                    }
                    allPieces.sort((a, b) => b.area - a.area);
                    bestBins = runNestingPass(allPieces, binW, binH, spacing, 'BSSF', 'guillotine', kerf, splitDir);
                    bestBinScore = scoreResult(bestBins);
                    bestBinType = 'guillotine';
                    bestStrategyName = 'fallback_guillotine';
                }
            }

            // ═══ COMPACTAÇÃO FINAL ═══
            // Garantir que peças estão o mais compactadas possível (visualmente)
            for (const bin of bestBins) {
                compactBin(bin, binW, binH, kerf);
            }

            const maxTeoricoAprov = totalPieceArea / (bestBins.length * sheetArea) * 100;
            console.log(`  [Nesting] ${groupKey}: ${pecasRestantes.length} peças → ${bestBins.length} chapa(s), ${bestBinScore.avgOccupancy.toFixed(1)}% (${bestStrategyName}, bestBinType=${bestBinType}, kerf=${kerf}mm, splitDir=${splitDir}, mín.teórico=${minTeoricoChapas} chapas, máx.teórico=${maxTeoricoAprov.toFixed(1)}%)`);

            // Record results
            const updatePeca = db.prepare('UPDATE cnc_pecas SET chapa_idx = ?, pos_x = ?, pos_y = ?, rotacionada = ? WHERE id = ? AND lote_id = ?');

            for (let bi = 0; bi < bestBins.length; bi++) {
                const bin = bestBins[bi];
                const chapaIdx = globalChapaIdx++;
                const chapaInfo = {
                    idx: chapaIdx,
                    material: chapa.nome,
                    material_code: chapa.material_code || group.material_code,
                    comprimento: chapa.comprimento, largura: chapa.largura,
                    refilo, kerf,
                    preco: chapa.preco || 0,
                    veio: chapaVeio,
                    aproveitamento: Math.round(bin.occupancy() * 100) / 100,
                    pecas: [], retalhos: [],
                    cortes: bestBinType !== 'maxrects' ? gerarSequenciaCortes(bin) : [],
                };

                for (const rect of bin.usedRects) {
                    if (!rect.pieceRef) continue;
                    const { pecaId, instancia } = rect.pieceRef;
                    if (instancia === 0) updatePeca.run(chapaIdx, rect.x + refilo, rect.y + refilo, rect.rotated ? 1 : 0, pecaId, lote.id);
                    const cls = classifyPiece(rect.realW, rect.realH);
                    const pecaInfo = { pecaId, instancia, x: rect.x, y: rect.y, w: rect.realW, h: rect.realH, rotated: rect.rotated };
                    if (cls !== 'normal') pecaInfo.classificacao = cls;
                    // Regras especiais de corte por classificação
                    if (cls === 'super_pequena') {
                        pecaInfo.corte = { passes: 2, velocidade: 'lenta', tabs: true, tabSize: 3, tabCount: 2 };
                    } else if (cls === 'pequena') {
                        pecaInfo.corte = { passes: 1, velocidade: 'media', tabs: binType === 'maxrects', tabSize: 2, tabCount: 1 };
                    }
                    chapaInfo.pecas.push(pecaInfo);
                }

                // Generate scraps (Clip & Keep — sem sobreposição)
                if (considerarSobra) {
                    const sobras = clipAndKeep(bin.freeRects, sobraMinW, sobraMinH);
                    for (const s of sobras) {
                        const w = Math.round(s.w), h = Math.round(s.h);
                        chapaInfo.retalhos.push({ x: s.x, y: s.y, w: s.w, h: s.h });
                        db.prepare(`INSERT INTO cnc_retalhos (user_id, chapa_ref_id, nome, material_code, espessura_real, comprimento, largura, origem_lote)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                            req.user.id, chapa.id || null,
                            `Retalho ${Math.max(w, h)}x${Math.min(w, h)}`,
                            group.material_code, group.espessura,
                            Math.max(w, h), Math.min(w, h), String(lote.id)
                        );
                    }
                }

                plano.chapas.push(chapaInfo);
            }

            plano.materiais[groupKey] = {
                material_code: group.material_code, espessura: group.espessura,
                total_pecas: expanded.length, total_chapas: bestBins.length,
                chapa_usada: chapa.nome, estrategia: bestStrategyName,
                ocupacao_media: Math.round(bestBinScore.avgOccupancy * 100) / 100,
                kerf, veio: chapaVeio,
                retalhos_usados: retalhosUsados.length,
                min_teorico_chapas: minTeoricoChapas,
                max_teorico_aproveitamento: Math.round(totalPieceArea / (bestBins.length * sheetArea) * 10000) / 100,
            };
        }

        // Classification stats
        const clsStats = { normal: 0, pequena: 0, super_pequena: 0 };
        for (const ch of plano.chapas) {
            for (const p of ch.pecas) {
                const cls = p.classificacao || 'normal';
                clsStats[cls] = (clsStats[cls] || 0) + 1;
            }
        }
        plano.classificacao.stats = clsStats;

        // Calculate totals
        const totalChapas = plano.chapas.length;
        const aprovMedio = totalChapas > 0
            ? Math.round(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / totalChapas * 100) / 100
            : 0;

        // Update lot
        db.prepare(`UPDATE cnc_lotes SET status = 'otimizado', total_chapas = ?, aproveitamento = ?, plano_json = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(totalChapas, aprovMedio, JSON.stringify(plano), lote.id);

        res.json({
            ok: true,
            total_chapas: totalChapas,
            aproveitamento: aprovMedio,
            total_combinacoes_testadas: totalCombinacoes,
            modo: binType,
            config_usada: { spacing, kerf: kerfPadrao, binType, useRetalhos, maxIter, considerarSobra, sobraMinW, sobraMinH, permitirRotacao, refiloOverride, direcaoCorte: direcaoCorteRaw, splitDir, limiarPequena, limiarSuperPequena, classificarPecas },
            plano,
        });
    } catch (err) {
        console.error('Erro no otimizador CNC:', err);
        res.status(500).json({ error: 'Erro ao otimizar corte' });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 3B: Otimizador Multi-Lote (Multi-Projeto)
// Combina peças de múltiplos lotes/projetos numa única otimização
// Peças rastreadas por lote_id — etiquetas preservam projeto/cliente
// ═══════════════════════════════════════════════════════

router.post('/otimizar-multi', requireAuth, (req, res) => {
    try {
        const { loteIds, ...bodyConfig } = req.body || {};
        if (!Array.isArray(loteIds) || loteIds.length < 2) {
            return res.status(400).json({ error: 'Necessário pelo menos 2 lotes para otimização multi-projeto' });
        }

        // Validar que todos os lotes existem e pertencem ao usuário
        const lotes = [];
        for (const loteId of loteIds) {
            const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(loteId, req.user.id);
            if (!lote) return res.status(404).json({ error: `Lote ${loteId} não encontrado` });
            lotes.push(lote);
        }

        const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get() || {};

        const spacing = bodyConfig.espaco_pecas != null ? Number(bodyConfig.espaco_pecas) : (config.espaco_pecas || 7);
        const kerfPadrao = bodyConfig.kerf != null ? Number(bodyConfig.kerf) : (config.kerf_padrao || 4);
        const modoRaw = bodyConfig.modo != null ? bodyConfig.modo : (config.usar_guilhotina !== 0 ? 'guilhotina' : 'maxrects');
        const binType = modoRaw === 'maxrects' ? 'maxrects' : modoRaw === 'shelf' ? 'shelf' : 'guillotine';
        const useRetalhos = bodyConfig.usar_retalhos != null ? !!bodyConfig.usar_retalhos : (config.usar_retalhos !== 0);
        const maxIter = bodyConfig.iteracoes != null ? Number(bodyConfig.iteracoes) : (config.iteracoes_otimizador || 300);
        const considerarSobra = bodyConfig.considerar_sobra != null ? !!bodyConfig.considerar_sobra : (config.considerar_sobra !== 0);
        const sobraMinW = bodyConfig.sobra_min_largura != null ? Number(bodyConfig.sobra_min_largura) : (config.sobra_min_largura || 300);
        const sobraMinH = bodyConfig.sobra_min_comprimento != null ? Number(bodyConfig.sobra_min_comprimento) : (config.sobra_min_comprimento || 600);
        const permitirRotacao = bodyConfig.permitir_rotacao != null ? !!bodyConfig.permitir_rotacao : null;
        const refiloOverride = bodyConfig.refilo != null ? Number(bodyConfig.refilo) : null;
        const direcaoCorteRaw = bodyConfig.direcao_corte || 'misto';
        const splitDir = direcaoCorteRaw === 'horizontal' ? 'horizontal' : direcaoCorteRaw === 'vertical' ? 'vertical' : 'auto';

        // Classificação de peças
        const limiarPequena = bodyConfig.limiar_pequena != null ? Number(bodyConfig.limiar_pequena) : 400;
        const limiarSuperPequena = bodyConfig.limiar_super_pequena != null ? Number(bodyConfig.limiar_super_pequena) : 200;
        const classificarPecas = bodyConfig.classificar_pecas !== false;
        function classifyPieceMulti(w, h) {
            if (!classificarPecas) return 'normal';
            const minDim = Math.min(w, h);
            if (minDim < limiarSuperPequena) return 'super_pequena';
            if (minDim < limiarPequena) return 'pequena';
            return 'normal';
        }

        // Atribuir grupo de otimização
        const grupoId = Date.now();
        const updateGrupo = db.prepare('UPDATE cnc_lotes SET grupo_otimizacao = ? WHERE id = ?');
        for (const lote of lotes) updateGrupo.run(grupoId, lote.id);

        // Coletar TODAS as peças de todos os lotes
        const allPecas = [];
        const loteMap = {}; // pecaId → loteId para rastreabilidade
        for (const lote of lotes) {
            const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
            for (const p of pecas) {
                allPecas.push(p);
                loteMap[p.id] = lote.id;
            }
        }

        if (allPecas.length === 0) return res.status(400).json({ error: 'Nenhuma peça nos lotes selecionados' });

        // Set vacuum-aware module state
        const vacuumAwareMulti = bodyConfig.vacuum_aware !== false;
        _vacuumAware = vacuumAwareMulti;

        // Agrupar por material_code + espessura (normalize espessura=0 from material_code)
        const groups = {};
        for (const p of allPecas) {
            let esp = p.espessura || 0;
            if (!esp && p.material_code) { const m = p.material_code.match(/_(\d+(?:\.\d+)?)_/); if (m) esp = parseFloat(m[1]); }
            const key = `${p.material_code}__${esp}`;
            if (!groups[key]) groups[key] = { material_code: p.material_code, espessura: esp || p.espessura, pieces: [] };
            groups[key].pieces.push(p);
        }

        const plano = {
            chapas: [], retalhos: [], materiais: {}, modo: binType, multi_lote: true, lote_ids: loteIds, grupo_otimizacao: grupoId,
            classificacao: { limiar_pequena: limiarPequena, limiar_super_pequena: limiarSuperPequena, ativo: classificarPecas },
        };
        let globalChapaIdx = 0;
        let totalCombinacoes = 0;

        // Reset positions in ALL lotes
        for (const lote of lotes) {
            db.prepare('UPDATE cnc_pecas SET chapa_idx = NULL, pos_x = 0, pos_y = 0, rotacionada = 0 WHERE lote_id = ?').run(lote.id);
            db.prepare("DELETE FROM cnc_retalhos WHERE origem_lote = ?").run(String(lote.id));
        }

        // Cores por projeto para visualização
        const projectColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        const loteColorMap = {};
        lotes.forEach((l, i) => { loteColorMap[l.id] = projectColors[i % projectColors.length]; });

        // Informações dos lotes para exibição
        plano.lotes_info = lotes.map((l, i) => ({
            id: l.id,
            nome: l.nome,
            cliente: l.cliente,
            projeto: l.projeto,
            cor: projectColors[i % projectColors.length],
        }));

        for (const [groupKey, group] of Object.entries(groups)) {
            let chapa = db.prepare('SELECT * FROM cnc_chapas WHERE material_code = ? AND ativo = 1').get(group.material_code);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE espessura_real = ? AND ativo = 1').get(group.espessura);
            if (!chapa) chapa = db.prepare('SELECT * FROM cnc_chapas WHERE ativo = 1 ORDER BY comprimento DESC LIMIT 1').get();
            if (!chapa) chapa = { comprimento: 2750, largura: 1850, refilo: 10, kerf: kerfPadrao, nome: 'Padrão 2750x1850', material_code: group.material_code, preco: 0, veio: 'sem_veio' };

            const refilo = refiloOverride != null ? refiloOverride : (chapa.refilo || 10);
            const kerf = chapa.kerf || kerfPadrao;
            const binW = chapa.comprimento - 2 * refilo;
            const binH = chapa.largura - 2 * refilo;
            const chapaVeio = chapa.veio || 'sem_veio';
            const temVeio = chapaVeio !== 'sem_veio';

            // Expandir peças com rastreio de lote_id
            const expanded = [];
            for (const p of group.pieces) {
                const allowRotate = temVeio ? false : (permitirRotacao != null ? permitirRotacao : true);
                for (let q = 0; q < p.quantidade; q++) {
                    expanded.push({
                        ref: { pecaId: p.id, instancia: q, loteId: loteMap[p.id] },
                        w: p.comprimento, h: p.largura, allowRotate,
                        area: p.comprimento * p.largura,
                        perim: 2 * (p.comprimento + p.largura),
                        maxSide: Math.max(p.comprimento, p.largura),
                        diff: Math.abs(p.comprimento - p.largura),
                        classificacao: classifyPieceMulti(p.comprimento, p.largura),
                    });
                }
            }

            // ═══ FASE 1: Retalhos ═══
            let pecasRestantes = [...expanded];
            const retalhosUsados = [];

            if (useRetalhos) {
                const retalhosDisp = db.prepare(
                    'SELECT * FROM cnc_retalhos WHERE material_code = ? AND espessura_real = ? AND disponivel = 1 ORDER BY comprimento * largura DESC'
                ).all(group.material_code, group.espessura);

                for (const ret of retalhosDisp) {
                    if (pecasRestantes.length === 0) break;
                    const retW = ret.comprimento, retH = ret.largura;
                    const bins = runNestingPass(
                        [...pecasRestantes].sort((a, b) => b.area - a.area),
                        retW, retH, spacing, 'BSSF', binType, kerf, splitDir
                    );

                    if (bins.length === 1 && bins[0].usedRects.length > 0) {
                        const bin = bins[0];
                        const chapaIdx = globalChapaIdx++;
                        const chapaInfo = {
                            idx: chapaIdx, material: `RETALHO: ${ret.nome}`,
                            material_code: group.material_code, comprimento: retW, largura: retH,
                            refilo: 0, preco: 0, veio: chapaVeio,
                            aproveitamento: Math.round(bin.occupancy() * 100) / 100,
                            is_retalho: true, retalho_id: ret.id, pecas: [], retalhos: [],
                            cortes: binType !== 'maxrects' ? gerarSequenciaCortes(bin) : [],
                        };

                        const placedRefs = new Set();
                        for (const rect of bin.usedRects) {
                            if (!rect.pieceRef) continue;
                            const { pecaId, instancia, loteId } = rect.pieceRef;
                            const clsM = classifyPieceMulti(rect.realW, rect.realH);
                            const pecaM = {
                                pecaId, instancia, x: rect.x, y: rect.y,
                                w: rect.realW, h: rect.realH, rotated: rect.rotated,
                                loteId, cor: loteColorMap[loteId],
                            };
                            if (clsM !== 'normal') pecaM.classificacao = clsM;
                            chapaInfo.pecas.push(pecaM);
                            placedRefs.add(`${pecaId}_${instancia}`);
                        }
                        plano.chapas.push(chapaInfo);
                        retalhosUsados.push(ret.id);
                        db.prepare('UPDATE cnc_retalhos SET disponivel = 0 WHERE id = ?').run(ret.id);
                        pecasRestantes = pecasRestantes.filter(p => !placedRefs.has(`${p.ref.pecaId}_${p.ref.instancia}`));
                    }
                }
            }

            if (pecasRestantes.length === 0) {
                plano.materiais[groupKey] = {
                    material_code: group.material_code, espessura: group.espessura,
                    total_pecas: expanded.length, total_chapas: 0,
                    chapa_usada: chapa.nome, estrategia: 'retalhos_only',
                    ocupacao_media: 0, retalhos_usados: retalhosUsados.length,
                };
                continue;
            }

            // ═══ FASES 2-5: Mesma lógica do otimizador single-lote ═══
            const heuristics = ['BSSF', 'BLSF', 'BAF', 'BL', 'CP'];
            let bestBins = null, bestBinScore = { score: Infinity }, bestStrategyName = '', bestBinType = binType;

            const totalPieceArea = pecasRestantes.reduce((s, p) => s + p.area, 0);
            const sheetArea = binW * binH;
            const minTeoricoChapas = Math.ceil(totalPieceArea / sheetArea);

            const binTypesToTry = [binType];
            if (!binTypesToTry.includes('guillotine')) binTypesToTry.push('guillotine');
            if (!binTypesToTry.includes('shelf')) binTypesToTry.push('shelf');
            if (!binTypesToTry.includes('maxrects')) binTypesToTry.push('maxrects');
            if (!binTypesToTry.includes('skyline')) binTypesToTry.push('skyline');

            const sortStrategies = [
                { name: 'area_desc',    fn: (a, b) => b.area - a.area },
                { name: 'perim_desc',   fn: (a, b) => b.perim - a.perim },
                { name: 'maxside_desc', fn: (a, b) => b.maxSide - a.maxSide },
                { name: 'diff_desc',    fn: (a, b) => b.diff - a.diff },
                { name: 'area_asc',     fn: (a, b) => a.area - b.area },
                { name: 'perim_asc',    fn: (a, b) => a.perim - b.perim },
                { name: 'maxside_asc',  fn: (a, b) => a.maxSide - b.maxSide },
                { name: 'w_h_desc',     fn: (a, b) => b.w - a.w || b.h - a.h },
                { name: 'h_w_desc',     fn: (a, b) => b.h - a.h || b.w - a.w },
                { name: 'ratio_sq',     fn: (a, b) => { const ra = Math.min(a.w,a.h)/Math.max(a.w,a.h); const rb = Math.min(b.w,b.h)/Math.max(b.w,b.h); return rb - ra; }},
                { name: 'diagonal',     fn: (a, b) => Math.sqrt(b.w*b.w+b.h*b.h) - Math.sqrt(a.w*a.w+a.h*a.h) },
                { name: 'minside_desc', fn: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) },
            ];

            // FASE 2: Portfolio multi-pass
            for (const bt of binTypesToTry) {
                for (const strat of sortStrategies) {
                    const sorted = [...pecasRestantes].sort(strat.fn);
                    for (const h of heuristics) {
                        const bins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                        const sc = scoreResult(bins);
                        if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = bins; bestStrategyName = `${strat.name}+${h}+${bt}`; bestBinType = bt; }
                        totalCombinacoes++;
                    }
                }
            }

            // FASE 2.5: Strip packing
            {
                const stripBins = runStripPacking(pecasRestantes, binW, binH, kerf);
                const sc = scoreResult(stripBins);
                if (sc.score < bestBinScore.score) { bestBinScore = sc; bestBins = stripBins; bestStrategyName = 'strip_packing'; bestBinType = 'strip'; }
                totalCombinacoes++;
            }

            // FASE 3: R&R
            const rrIter = Math.max(maxIter, 500);
            if (pecasRestantes.length > 3) {
                for (const bt of binTypesToTry) {
                    const rrResult = ruinAndRecreate(pecasRestantes, binW, binH, spacing, bt, kerf, rrIter, splitDir);
                    if (rrResult && rrResult.score.score < bestBinScore.score) {
                        bestBinScore = rrResult.score; bestBins = rrResult.bins;
                        bestStrategyName = `ruin_recreate+LAHC+${bt}`; bestBinType = bt;
                    }
                    totalCombinacoes += rrIter;
                }
            }

            // FASE 3.5: BRKGA
            if (pecasRestantes.length > 3 && bestBinScore.bins > minTeoricoChapas) {
                const brkgaGen = Math.min(100, Math.max(40, pecasRestantes.length * 3));
                const brkgaResult = runBRKGA(pecasRestantes, binW, binH, spacing, binType, kerf, brkgaGen, splitDir);
                if (brkgaResult && brkgaResult.score.score < bestBinScore.score) {
                    bestBinScore = brkgaResult.score; bestBins = brkgaResult.bins;
                    bestStrategyName = `BRKGA_${brkgaGen}gen`; bestBinType = binType;
                }
                totalCombinacoes += brkgaGen * 40;
            }

            // FASE 5: Gap filling
            if (bestBins && bestBins.length > 1) {
                const allPcs = [];
                for (const bin of bestBins) {
                    for (const r of bin.usedRects) {
                        if (!r.pieceRef) continue;
                        allPcs.push({
                            ref: r.pieceRef, w: r.realW || r.w, h: r.realH || r.h,
                            allowRotate: r.allowRotate || false,
                            area: (r.realW || r.w) * (r.realH || r.h),
                            perim: 2 * ((r.realW || r.w) + (r.realH || r.h)),
                            maxSide: Math.max(r.realW || r.w, r.realH || r.h),
                            diff: Math.abs((r.realW || r.w) - (r.realH || r.h)),
                        });
                    }
                }
                const targetBins = bestBins.length - 1;
                if (targetBins >= minTeoricoChapas) {
                    const gapSorts = [(a, b) => b.area - a.area, (a, b) => b.maxSide - a.maxSide, (a, b) => b.h - a.h || b.w - a.w];
                    for (const sortFn of gapSorts) {
                        for (const h of heuristics) {
                            for (const bt of binTypesToTry) {
                                const sorted = [...allPcs].sort(sortFn);
                                const testBins = runNestingPass(sorted, binW, binH, spacing, h, bt, kerf, splitDir);
                                if (testBins.length <= targetBins && verifyNoOverlaps(testBins)) {
                                    const sc = scoreResult(testBins);
                                    if (sc.score < bestBinScore.score) { bestBins = testBins; bestBinScore = sc; bestBinType = bt; bestStrategyName += '+gap_repack'; }
                                }
                                totalCombinacoes++;
                            }
                        }
                    }
                }
            }

            // Safety + Compactação
            if (!verifyNoOverlaps(bestBins)) {
                bestBins = repairOverlaps(bestBins, binW, binH, spacing, bestBinType, kerf, splitDir);
                bestBinScore = scoreResult(bestBins);
            }
            for (const bin of bestBins) compactBin(bin, binW, binH, kerf);

            const maxTeoricoAprov = totalPieceArea / (bestBins.length * sheetArea) * 100;
            console.log(`  [Nesting Multi] ${groupKey}: ${pecasRestantes.length} peças (${lotes.length} lotes) → ${bestBins.length} chapa(s), ${bestBinScore.avgOccupancy.toFixed(1)}% (${bestStrategyName})`);

            // Gravar resultados com rastreio de lote
            for (let bi = 0; bi < bestBins.length; bi++) {
                const bin = bestBins[bi];
                const chapaIdx = globalChapaIdx++;
                const chapaInfo = {
                    idx: chapaIdx, material: chapa.nome,
                    material_code: chapa.material_code || group.material_code,
                    comprimento: chapa.comprimento, largura: chapa.largura,
                    refilo, kerf, preco: chapa.preco || 0, veio: chapaVeio,
                    aproveitamento: Math.round(bin.occupancy() * 100) / 100,
                    pecas: [], retalhos: [],
                    cortes: bestBinType !== 'maxrects' ? gerarSequenciaCortes(bin) : [],
                };

                const updatePeca = db.prepare('UPDATE cnc_pecas SET chapa_idx = ?, pos_x = ?, pos_y = ?, rotacionada = ? WHERE id = ? AND lote_id = ?');
                for (const rect of bin.usedRects) {
                    if (!rect.pieceRef) continue;
                    const { pecaId, instancia, loteId } = rect.pieceRef;
                    if (instancia === 0) updatePeca.run(chapaIdx, rect.x + refilo, rect.y + refilo, rect.rotated ? 1 : 0, pecaId, loteId || loteMap[pecaId]);
                    const clsM2 = classifyPieceMulti(rect.realW, rect.realH);
                    const pecaM2 = {
                        pecaId, instancia, x: rect.x, y: rect.y,
                        w: rect.realW, h: rect.realH, rotated: rect.rotated,
                        loteId: loteId || loteMap[pecaId],
                        cor: loteColorMap[loteId || loteMap[pecaId]],
                    };
                    if (clsM2 !== 'normal') pecaM2.classificacao = clsM2;
                    if (clsM2 === 'super_pequena') {
                        pecaM2.corte = { passes: 2, velocidade: 'lenta', tabs: true, tabSize: 3, tabCount: 2 };
                    } else if (clsM2 === 'pequena') {
                        pecaM2.corte = { passes: 1, velocidade: 'media', tabs: binType === 'maxrects', tabSize: 2, tabCount: 1 };
                    }
                    chapaInfo.pecas.push(pecaM2);
                }

                // Retalhos (Clip & Keep — sem sobreposição)
                if (considerarSobra) {
                    const sobras = clipAndKeep(bin.freeRects, sobraMinW, sobraMinH);
                    for (const s of sobras) {
                        const w = Math.round(s.w), h = Math.round(s.h);
                        chapaInfo.retalhos.push({ x: s.x, y: s.y, w: s.w, h: s.h });
                        db.prepare(`INSERT INTO cnc_retalhos (user_id, chapa_ref_id, nome, material_code, espessura_real, comprimento, largura, origem_lote)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
                            req.user.id, chapa.id || null,
                            `Retalho ${Math.max(w, h)}x${Math.min(w, h)}`,
                            group.material_code, group.espessura,
                            Math.max(w, h), Math.min(w, h), loteIds.join(',')
                        );
                    }
                }

                plano.chapas.push(chapaInfo);
            }

            plano.materiais[groupKey] = {
                material_code: group.material_code, espessura: group.espessura,
                total_pecas: expanded.length, total_chapas: bestBins.length,
                chapa_usada: chapa.nome, estrategia: bestStrategyName,
                ocupacao_media: Math.round(bestBinScore.avgOccupancy * 100) / 100,
                kerf, veio: chapaVeio, retalhos_usados: retalhosUsados.length,
                min_teorico_chapas: minTeoricoChapas,
                max_teorico_aproveitamento: Math.round(totalPieceArea / (bestBins.length * sheetArea) * 10000) / 100,
            };
        }

        // Classification stats multi-lote
        const clsStatsMulti = { normal: 0, pequena: 0, super_pequena: 0 };
        for (const ch of plano.chapas) {
            for (const p of ch.pecas) {
                const cls = p.classificacao || 'normal';
                clsStatsMulti[cls] = (clsStatsMulti[cls] || 0) + 1;
            }
        }
        plano.classificacao.stats = clsStatsMulti;

        // Totais
        const totalChapas = plano.chapas.length;
        const aprovMedio = totalChapas > 0
            ? Math.round(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / totalChapas * 100) / 100 : 0;

        // Atualizar todos os lotes com o plano combinado
        for (const lote of lotes) {
            db.prepare(`UPDATE cnc_lotes SET status = 'otimizado', total_chapas = ?, aproveitamento = ?, plano_json = ?, grupo_otimizacao = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
                .run(totalChapas, aprovMedio, JSON.stringify(plano), grupoId, lote.id);
        }

        res.json({
            ok: true,
            total_chapas: totalChapas,
            aproveitamento: aprovMedio,
            total_combinacoes_testadas: totalCombinacoes,
            modo: binType,
            grupo_otimizacao: grupoId,
            lotes: lotes.map(l => ({ id: l.id, nome: l.nome, cliente: l.cliente, projeto: l.projeto })),
            plano,
        });
    } catch (err) {
        console.error('Erro no otimizador multi-lote:', err);
        res.status(500).json({ error: 'Erro ao otimizar corte multi-projeto' });
    }
});

// ─── Desvincular lote de um grupo de otimização ─────
router.put('/lotes/:loteId/desvincular-grupo', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
    db.prepare('UPDATE cnc_lotes SET grupo_otimizacao = NULL, status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
        .run('importado', lote.id);
    // Reset piece positions for this lote
    db.prepare('UPDATE cnc_pecas SET chapa_idx = NULL, pos_x = 0, pos_y = 0, rotacionada = 0 WHERE lote_id = ?').run(lote.id);
    res.json({ ok: true });
});

// ─── Ajuste manual do plano (mover/rotacionar peça) ─────
// ─── Helpers de colisão para ajustes manuais ──────────────────────
function checkCollision(peca, pecas, excludeIdx, kerf = 0) {
    const a = { x: peca.x - kerf, y: peca.y - kerf, w: peca.w + kerf * 2, h: peca.h + kerf * 2 };
    for (let i = 0; i < pecas.length; i++) {
        if (i === excludeIdx) continue;
        const b = pecas[i];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
            return { collides: true, withIdx: i, withPeca: b };
        }
    }
    return { collides: false };
}

function checkBounds(peca, chapa) {
    const ref = chapa.refilo || 0;
    const maxX = chapa.comprimento - 2 * ref - peca.w;
    const maxY = chapa.largura - 2 * ref - peca.h;
    return peca.x >= 0 && peca.y >= 0 && peca.x <= maxX + 0.5 && peca.y <= maxY + 0.5;
}

function findNonCollidingPosition(peca, pecas, excludeIdx, chapaW, chapaH, refilo, kerf) {
    const maxX = chapaW - 2 * refilo - peca.w;
    const maxY = chapaH - 2 * refilo - peca.h;
    // Tentar posição original
    if (!checkCollision(peca, pecas, excludeIdx, kerf).collides) return { x: peca.x, y: peca.y };
    // Varrer grid 10mm
    for (let yy = 0; yy <= maxY; yy += 10) {
        for (let xx = 0; xx <= maxX; xx += 10) {
            const test = { ...peca, x: xx, y: yy };
            if (!checkCollision(test, pecas, excludeIdx, kerf).collides) return { x: xx, y: yy };
        }
    }
    // Grid 2mm (fallback)
    for (let yy = 0; yy <= maxY; yy += 2) {
        for (let xx = 0; xx <= maxX; xx += 2) {
            const test = { ...peca, x: xx, y: yy };
            if (!checkCollision(test, pecas, excludeIdx, kerf).collides) return { x: xx, y: yy };
        }
    }
    return null; // Não cabe
}

function recalcOccupancy(plano) {
    for (const ch of plano.chapas) {
        const ref = ch.refilo || 0;
        const usableW = ch.comprimento - 2 * ref;
        const usableH = ch.largura - 2 * ref;
        const usableArea = usableW * usableH;
        const usedArea = ch.pecas.reduce((s, p) => s + p.w * p.h, 0);
        ch.aproveitamento = usableArea > 0 ? Math.round(usedArea / usableArea * 10000) / 100 : 0;
    }
    // Remover chapas vazias automaticamente (se não é a última do material)
    const byMat = {};
    for (let i = 0; i < plano.chapas.length; i++) {
        const key = plano.chapas[i].material;
        if (!byMat[key]) byMat[key] = [];
        byMat[key].push(i);
    }
    const toRemove = [];
    for (const [, indices] of Object.entries(byMat)) {
        if (indices.length > 1) {
            for (const i of indices) {
                if (plano.chapas[i].pecas.length === 0) toRemove.push(i);
            }
        }
    }
    // Remover de trás para frente
    toRemove.sort((a, b) => b - a);
    for (const i of toRemove) plano.chapas.splice(i, 1);

    return plano.chapas.length > 0
        ? Math.round(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / plano.chapas.length * 100) / 100
        : 0;
}

router.put('/plano/:loteId/ajustar', requireAuth, (req, res) => {
    try {
        const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
        if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });
        if (!lote.plano_json) return res.status(400).json({ error: 'Lote sem plano de corte' });

        const plano = JSON.parse(lote.plano_json);
        if (!plano.transferencia) plano.transferencia = []; // Área de transferência
        const { chapaIdx, pecaIdx, action, x, y, targetChapaIdx, force } = req.body;
        const kerf = plano.config?.kerf || 4;

        // ═══ ACTION: move ═══════════════════════════════════════════════
        if (action === 'move') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            if (peca.locked) return res.status(400).json({ error: 'Peça travada' });

            // Validar limites
            const ref = chapa.refilo || 0;
            const clampedX = Math.max(0, Math.min(chapa.comprimento - 2 * ref - peca.w, x));
            const clampedY = Math.max(0, Math.min(chapa.largura - 2 * ref - peca.h, y));

            const testPeca = { ...peca, x: clampedX, y: clampedY };
            const moveKerf = chapa.kerf || 0;
            const collision = checkCollision(testPeca, chapa.pecas, pecaIdx, moveKerf);

            if (collision.collides && !force) {
                return res.status(409).json({
                    error: 'Colisão detectada',
                    collision: true,
                    withPeca: collision.withPeca,
                    withIdx: collision.withIdx,
                });
            }
            peca.x = clampedX;
            peca.y = clampedY;

        // ═══ ACTION: rotate ════════════════════════════════════════════
        } else if (action === 'rotate') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            if (peca.locked) return res.status(400).json({ error: 'Peça travada' });
            const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
            if (hasVeio) return res.status(400).json({ error: 'Material com veio não permite rotação' });

            const newW = peca.h, newH = peca.w;
            const ref = chapa.refilo || 0;
            // Verificar se cabe após rotação
            if (peca.x + newW > chapa.comprimento - 2 * ref || peca.y + newH > chapa.largura - 2 * ref) {
                // Tentar reposicionar
                const testPeca = { ...peca, w: newW, h: newH };
                testPeca.x = Math.min(testPeca.x, chapa.comprimento - 2 * ref - newW);
                testPeca.y = Math.min(testPeca.y, chapa.largura - 2 * ref - newH);
                if (testPeca.x < 0 || testPeca.y < 0) {
                    return res.status(400).json({ error: 'Peça não cabe rotacionada nesta chapa' });
                }
                peca.x = testPeca.x;
                peca.y = testPeca.y;
            }
            peca.w = newW;
            peca.h = newH;
            peca.rotated = !peca.rotated;

            // Verificar colisão pós-rotação
            const rotKerf = chapa.kerf || 0;
            const collision = checkCollision(peca, chapa.pecas, pecaIdx, rotKerf);
            if (collision.collides) {
                const pos = findNonCollidingPosition(peca, chapa.pecas, pecaIdx, chapa.comprimento, chapa.largura, ref, rotKerf);
                if (pos) { peca.x = pos.x; peca.y = pos.y; }
                else {
                    // Reverter
                    peca.w = newH; peca.h = newW; peca.rotated = !peca.rotated;
                    return res.status(400).json({ error: 'Sem espaço para rotacionar (colisão)' });
                }
            }

        // ═══ ACTION: move_to_sheet ═════════════════════════════════════
        } else if (action === 'move_to_sheet') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            const targetChapa = plano.chapas[targetChapaIdx];
            if (!targetChapa) return res.status(400).json({ error: 'Chapa destino inválida' });

            // Verificar material compatível
            if (chapa.material !== targetChapa.material) {
                return res.status(400).json({ error: 'Material incompatível entre chapas' });
            }

            const ref = targetChapa.refilo || 0;
            const targetX = x ?? 0, targetY = y ?? 0;
            const testPeca = { ...peca, x: targetX, y: targetY };

            // Validar limites na chapa destino
            if (!checkBounds(testPeca, targetChapa)) {
                return res.status(400).json({ error: 'Peça não cabe na chapa destino' });
            }

            // Verificar colisão na chapa destino
            const collision = checkCollision(testPeca, targetChapa.pecas, -1, 0);
            if (collision.collides && !force) {
                // Tentar posicionar automaticamente
                const pos = findNonCollidingPosition(testPeca, targetChapa.pecas, -1, targetChapa.comprimento, targetChapa.largura, ref, 0);
                if (pos) {
                    testPeca.x = pos.x; testPeca.y = pos.y;
                } else {
                    return res.status(409).json({ error: 'Sem espaço na chapa destino', collision: true });
                }
            }
            chapa.pecas.splice(pecaIdx, 1);
            peca.x = testPeca.x;
            peca.y = testPeca.y;
            targetChapa.pecas.push(peca);

        // ═══ ACTION: to_transfer ═══════════════════════════════════════
        } else if (action === 'to_transfer') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            chapa.pecas.splice(pecaIdx, 1);
            peca.fromChapaIdx = chapaIdx;
            peca.fromMaterial = chapa.material;
            plano.transferencia.push(peca);

        // ═══ ACTION: from_transfer ════════════════════════════════════
        } else if (action === 'from_transfer') {
            const { transferIdx } = req.body;
            if (transferIdx == null || !plano.transferencia[transferIdx]) {
                return res.status(400).json({ error: 'Peça não encontrada na transferência' });
            }
            const targetChapa = plano.chapas[targetChapaIdx];
            if (!targetChapa) return res.status(400).json({ error: 'Chapa destino inválida' });
            const peca = plano.transferencia[transferIdx];

            // ══ Material validation — block cross-material transfers ══
            if (peca.fromMaterial && targetChapa.material && peca.fromMaterial !== targetChapa.material) {
                return res.status(400).json({
                    error: `Material incompatível! Peça é ${peca.fromMaterial}, chapa é ${targetChapa.material}`,
                    materialMismatch: true
                });
            }

            const ref = targetChapa.refilo || 0;
            const targetX = x ?? 0, targetY = y ?? 0;
            const testPeca = { ...peca, x: targetX, y: targetY };

            if (!checkBounds(testPeca, targetChapa)) {
                // Auto-posicionar
                const pos = findNonCollidingPosition(testPeca, targetChapa.pecas, -1, targetChapa.comprimento, targetChapa.largura, ref, 0);
                if (!pos) return res.status(409).json({ error: 'Sem espaço na chapa destino' });
                testPeca.x = pos.x; testPeca.y = pos.y;
            } else {
                const collision = checkCollision(testPeca, targetChapa.pecas, -1, 0);
                if (collision.collides) {
                    const pos = findNonCollidingPosition(testPeca, targetChapa.pecas, -1, targetChapa.comprimento, targetChapa.largura, ref, 0);
                    if (!pos) return res.status(409).json({ error: 'Sem espaço na chapa destino' });
                    testPeca.x = pos.x; testPeca.y = pos.y;
                }
            }

            plano.transferencia.splice(transferIdx, 1);
            delete peca.fromChapaIdx;
            delete peca.fromMaterial;
            peca.x = testPeca.x;
            peca.y = testPeca.y;
            targetChapa.pecas.push(peca);

        // ═══ ACTION: lock / unlock ════════════════════════════════════
        } else if (action === 'lock' || action === 'unlock') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const peca = chapa.pecas[pecaIdx];
            if (!peca) return res.status(400).json({ error: 'Peça inválida' });
            peca.locked = action === 'lock';

        // ═══ ACTION: add_sheet ════════════════════════════════════════
        } else if (action === 'add_sheet') {
            const { material } = req.body;
            // Encontrar template de chapa do mesmo material
            const templateChapa = plano.chapas.find(c => c.material === material);
            if (!templateChapa) return res.status(400).json({ error: 'Material não encontrado no plano' });
            const newChapa = {
                idx: plano.chapas.length,
                material: templateChapa.material,
                comprimento: templateChapa.comprimento,
                largura: templateChapa.largura,
                espessura: templateChapa.espessura,
                refilo: templateChapa.refilo,
                veio: templateChapa.veio,
                custo: templateChapa.custo || 0,
                pecas: [],
                retalhos: [],
                aproveitamento: 0,
                cortes: [],
            };
            plano.chapas.push(newChapa);

        // ═══ ACTION: compact ══════════════════════════════════════════
        } else if (action === 'compact') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const ref = chapa.refilo || 0;
            const usableW = chapa.comprimento - 2 * ref;
            const usableH = chapa.largura - 2 * ref;

            // Separar peças locked vs livres
            const locked = [], free = [];
            for (let i = 0; i < chapa.pecas.length; i++) {
                if (chapa.pecas[i].locked) locked.push(chapa.pecas[i]);
                else free.push(chapa.pecas[i]);
            }

            // Ordenar livres por área desc
            free.sort((a, b) => (b.w * b.h) - (a.w * a.h));

            // Re-alocar com MaxRects, mantendo locked no lugar
            const bin = new MaxRectsBin(usableW, usableH, 0);
            // Colocar locked primeiro
            for (const p of locked) {
                bin.placeRect({ x: p.x, y: p.y, w: p.w, h: p.h, realW: p.w, realH: p.h });
            }
            // Colocar livres
            const placed = [...locked];
            for (const p of free) {
                const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
                const rect = bin.findBest(p.w, p.h, !hasVeio, 'BSSF');
                if (rect) {
                    rect.realW = rect.rotated ? p.h : p.w;
                    rect.realH = rect.rotated ? p.w : p.h;
                    bin.placeRect(rect);
                    placed.push({
                        ...p,
                        x: rect.x, y: rect.y,
                        w: rect.rotated ? p.h : p.w,
                        h: rect.rotated ? p.w : p.h,
                        rotated: rect.rotated ? !p.rotated : p.rotated,
                    });
                } else {
                    // Não coube — manter posição original
                    placed.push(p);
                }
            }
            chapa.pecas = placed;

        // ═══ ACTION: re_optimize ══════════════════════════════════════
        } else if (action === 're_optimize') {
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa inválida' });
            const ref = chapa.refilo || 0;
            const usableW = chapa.comprimento - 2 * ref;
            const usableH = chapa.largura - 2 * ref;
            const kerfVal = plano.config?.kerf || 4;
            const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';

            // Separar locked vs livres
            const locked = chapa.pecas.filter(p => p.locked);
            const free = chapa.pecas.filter(p => !p.locked);

            // Preparar peças para nesting
            const pieces = free.map((p, i) => ({
                ref: { pecaId: p.pecaId, instancia: p.instancia || 0 },
                w: p.w, h: p.h, area: p.w * p.h,
                perim: 2 * (p.w + p.h), maxSide: Math.max(p.w, p.h),
                diff: Math.abs(p.w - p.h),
                allowRotate: !hasVeio,
                originalPeca: p,
            }));

            // Executar R&R com alta iteração
            const rrResult = ruinAndRecreate(pieces, usableW, usableH, 0, 'maxrects', kerfVal, 300);
            if (rrResult && rrResult.bins && rrResult.bins.length === 1) {
                const bin = rrResult.bins[0];
                const reOptimized = [...locked];
                for (const rect of bin.usedRects) {
                    const orig = pieces.find(p => p.ref.pecaId === rect.pieceRef?.pecaId && p.ref.instancia === rect.pieceRef?.instancia);
                    if (orig) {
                        reOptimized.push({
                            ...orig.originalPeca,
                            x: rect.x, y: rect.y,
                            w: rect.realW, h: rect.realH,
                            rotated: rect.rotated,
                        });
                    }
                }
                chapa.pecas = reOptimized;
            }

        // ═══ ACTION: marcar_refugo ═══════════════════════════════════
        } else if (action === 'marcar_refugo') {
            const { retalhoIdx } = req.body;
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa não encontrada' });
            if (!chapa.retalhos || !chapa.retalhos[retalhoIdx]) return res.status(400).json({ error: 'Retalho não encontrado' });
            chapa.retalhos.splice(retalhoIdx, 1);

        // ═══ ACTION: ajustar_sobra (redistribuir área entre sobras adjacentes) ═══
        } else if (action === 'ajustar_sobra') {
            const { retalhoIdx, novoX, novoY, novoW, novoH, retalho2Idx, novo2X, novo2Y, novo2W, novo2H } = req.body;
            const chapa = plano.chapas[chapaIdx];
            if (!chapa) return res.status(400).json({ error: 'Chapa não encontrada' });
            if (!chapa.retalhos || !chapa.retalhos[retalhoIdx]) return res.status(400).json({ error: 'Retalho não encontrado' });
            // Atualizar sobra 1
            Object.assign(chapa.retalhos[retalhoIdx], { x: novoX, y: novoY, w: novoW, h: novoH });
            // Atualizar ou remover sobra 2
            if (retalho2Idx != null && chapa.retalhos[retalho2Idx]) {
                const cfgR = db.prepare('SELECT * FROM cnc_config WHERE user_id = ?').get(req.user.id) || {};
                const minW = cfgR.sobra_min_largura || 300, minH = cfgR.sobra_min_comprimento || 600;
                const w2 = novo2W, h2 = novo2H;
                const isValid = (Math.max(w2, h2) >= Math.max(minW, minH) && Math.min(w2, h2) >= Math.min(minW, minH));
                if (isValid) {
                    Object.assign(chapa.retalhos[retalho2Idx], { x: novo2X, y: novo2Y, w: novo2W, h: novo2H });
                } else {
                    // Sobra absorvida (Modo B)
                    const idxToRemove = retalho2Idx > retalhoIdx ? retalho2Idx : retalho2Idx;
                    chapa.retalhos.splice(idxToRemove, 1);
                }
            }

        // ═══ ACTION: restore (undo/redo) ══════════════════════════════
        } else if (action === 'restore') {
            const { planoData } = req.body;
            if (!planoData) return res.status(400).json({ error: 'Missing plano data' });
            const restored = typeof planoData === 'string' ? JSON.parse(planoData) : planoData;
            if (!restored.transferencia) restored.transferencia = [];
            const avgAprov = recalcOccupancy(restored);
            db.prepare('UPDATE cnc_lotes SET plano_json = ?, aproveitamento = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
                .run(JSON.stringify(restored), avgAprov, lote.id);
            return res.json({ ok: true, plano: restored, aproveitamento: avgAprov });

        } else {
            return res.status(400).json({ error: 'Ação inválida: ' + action });
        }

        const aprovMedio = recalcOccupancy(plano);

        db.prepare('UPDATE cnc_lotes SET plano_json = ?, aproveitamento = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
            .run(JSON.stringify(plano), aprovMedio, lote.id);

        res.json({ ok: true, plano, aproveitamento: aprovMedio });
    } catch (err) {
        console.error('Erro ao ajustar plano:', err);
        res.status(500).json({ error: 'Erro ao ajustar plano' });
    }
});

// ═══════════════════════════════════════════════════════
// GRUPO 4: Etiquetas
// ═══════════════════════════════════════════════════════

router.get('/etiquetas/:loteId', requireAuth, (req, res) => {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(req.params.loteId, req.user.id);
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

    const pecas = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ? ORDER BY modulo_id, id').all(lote.id);
    let controle = 1;
    const etiquetas = [];

    for (const p of pecas) {
        for (let q = 0; q < p.quantidade; q++) {
            const bordas = {
                dir: p.borda_dir || '',
                esq: p.borda_esq || '',
                frontal: p.borda_frontal || '',
                traseira: p.borda_traseira || '',
            };
            const diagrama = {
                top: !!bordas.frontal,
                bottom: !!bordas.traseira,
                left: !!bordas.esq,
                right: !!bordas.dir,
            };
            // Build fita_resumo
            const fitaParts = [bordas.dir, bordas.esq, bordas.frontal, bordas.traseira].filter(Boolean);
            const fitaResumo = fitaParts.length > 0 ? [...new Set(fitaParts)].join(' / ') : 'Sem fita';

            etiquetas.push({
                pecaId: p.id,
                instancia: q,
                controle: String(controle).padStart(3, '0'),
                usi_a: p.usi_a,
                usi_b: p.usi_b,
                material: p.material,
                material_code: p.material_code,
                espessura: p.espessura,
                comprimento: p.comprimento,
                largura: p.largura,
                descricao: p.descricao,
                modulo_desc: p.modulo_desc,
                modulo_id: p.modulo_id,
                produto_final: p.produto_final,
                bordas,
                acabamento: p.acabamento,
                cliente: lote.cliente,
                projeto: lote.projeto,
                codigo: lote.codigo,
                fita_resumo: fitaResumo,
                diagrama,
            });
            controle++;
        }
    }

    res.json(etiquetas);
});

// ─── Config de etiquetas GET/PUT ─────────────────────
router.get('/etiqueta-config', requireAuth, (req, res) => {
    let cfg = db.prepare('SELECT * FROM cnc_etiqueta_config WHERE id = 1').get();
    if (!cfg) {
        db.prepare('INSERT INTO cnc_etiqueta_config (id) VALUES (1)').run();
        cfg = db.prepare('SELECT * FROM cnc_etiqueta_config WHERE id = 1').get();
    }
    res.json(cfg);
});

router.put('/etiqueta-config', requireAuth, (req, res) => {
    const {
        formato, orientacao, colunas_impressao, margem_pagina, gap_etiquetas,
        mostrar_usia, mostrar_usib, mostrar_material, mostrar_espessura,
        mostrar_cliente, mostrar_projeto, mostrar_codigo, mostrar_modulo,
        mostrar_peca, mostrar_dimensoes, mostrar_bordas_diagrama, mostrar_fita_resumo,
        mostrar_acabamento, mostrar_id_modulo, mostrar_controle, mostrar_produto_final,
        mostrar_observacao, mostrar_codigo_barras,
        fonte_tamanho, empresa_nome, empresa_logo_url, cor_borda_fita, cor_controle,
    } = req.body;

    db.prepare(`UPDATE cnc_etiqueta_config SET
        formato=?, orientacao=?, colunas_impressao=?, margem_pagina=?, gap_etiquetas=?,
        mostrar_usia=?, mostrar_usib=?, mostrar_material=?, mostrar_espessura=?,
        mostrar_cliente=?, mostrar_projeto=?, mostrar_codigo=?, mostrar_modulo=?,
        mostrar_peca=?, mostrar_dimensoes=?, mostrar_bordas_diagrama=?, mostrar_fita_resumo=?,
        mostrar_acabamento=?, mostrar_id_modulo=?, mostrar_controle=?, mostrar_produto_final=?,
        mostrar_observacao=?, mostrar_codigo_barras=?,
        fonte_tamanho=?, empresa_nome=?, empresa_logo_url=?, cor_borda_fita=?, cor_controle=?,
        atualizado_em=CURRENT_TIMESTAMP
        WHERE id = 1`).run(
        formato ?? '100x70', orientacao ?? 'paisagem', colunas_impressao ?? 2,
        margem_pagina ?? 8, gap_etiquetas ?? 4,
        mostrar_usia ?? 1, mostrar_usib ?? 1, mostrar_material ?? 1, mostrar_espessura ?? 1,
        mostrar_cliente ?? 1, mostrar_projeto ?? 1, mostrar_codigo ?? 1, mostrar_modulo ?? 1,
        mostrar_peca ?? 1, mostrar_dimensoes ?? 1, mostrar_bordas_diagrama ?? 1, mostrar_fita_resumo ?? 1,
        mostrar_acabamento ?? 1, mostrar_id_modulo ?? 1, mostrar_controle ?? 1, mostrar_produto_final ?? 0,
        mostrar_observacao ?? 1, mostrar_codigo_barras ?? 1,
        fonte_tamanho ?? 'medio', empresa_nome ?? '', empresa_logo_url ?? '', cor_borda_fita ?? '#22c55e', cor_controle ?? '',
    );
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GRUPO 4B: Templates de Etiquetas (CRUD)
// ═══════════════════════════════════════════════════════

// Listar templates (sem elementos para payload leve)
router.get('/etiqueta-templates', requireAuth, (req, res) => {
    const templates = db.prepare(
        'SELECT id, nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, padrao, criado_em, atualizado_em FROM cnc_etiqueta_templates WHERE user_id = ? ORDER BY padrao DESC, atualizado_em DESC'
    ).all(req.user.id);
    res.json(templates);
});

// Obter template completo com elementos
router.get('/etiqueta-templates/:id', requireAuth, (req, res) => {
    const t = db.prepare('SELECT * FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    t.elementos = JSON.parse(t.elementos || '[]');
    res.json(t);
});

// Criar template
router.post('/etiqueta-templates', requireAuth, (req, res) => {
    const { nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, elementos } = req.body;
    const result = db.prepare(
        'INSERT INTO cnc_etiqueta_templates (user_id, nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, elementos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, nome || 'Sem nome', largura || 100, altura || 70, colunas_impressao || 2, margem_pagina || 8, gap_etiquetas || 4, JSON.stringify(elementos || []));
    res.json({ ok: true, id: result.lastInsertRowid });
});

// Atualizar template
router.put('/etiqueta-templates/:id', requireAuth, (req, res) => {
    const t = db.prepare('SELECT id FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    const { nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, elementos } = req.body;
    db.prepare(
        `UPDATE cnc_etiqueta_templates SET nome = ?, largura = ?, altura = ?, colunas_impressao = ?, margem_pagina = ?, gap_etiquetas = ?, elementos = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(nome || 'Sem nome', largura || 100, altura || 70, colunas_impressao || 2, margem_pagina || 8, gap_etiquetas || 4, JSON.stringify(elementos || []), req.params.id);
    res.json({ ok: true });
});

// Excluir template
router.delete('/etiqueta-templates/:id', requireAuth, (req, res) => {
    const t = db.prepare('SELECT id FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    db.prepare('DELETE FROM cnc_etiqueta_templates WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// Definir como padrão
router.put('/etiqueta-templates/:id/padrao', requireAuth, (req, res) => {
    const t = db.prepare('SELECT id FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    db.prepare('UPDATE cnc_etiqueta_templates SET padrao = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE cnc_etiqueta_templates SET padrao = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// Duplicar template
router.post('/etiqueta-templates/:id/duplicar', requireAuth, (req, res) => {
    const t = db.prepare('SELECT * FROM cnc_etiqueta_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Template não encontrado' });
    const result = db.prepare(
        'INSERT INTO cnc_etiqueta_templates (user_id, nome, largura, altura, colunas_impressao, margem_pagina, gap_etiquetas, elementos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, t.nome + ' (cópia)', t.largura, t.altura, t.colunas_impressao, t.margem_pagina, t.gap_etiquetas, t.elementos);
    res.json({ ok: true, id: result.lastInsertRowid });
});

// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// GRUPO 5: Gerador G-code v2 — por chapa, contorno automático,
//          agrupamento global por ferramenta, DOC automático
// ═══════════════════════════════════════════════════════

// ─── Helper: Calcular passadas automáticas (DOC) ───────
function calcularPassadas(depthTotal, doc) {
    if (!doc || doc <= 0 || depthTotal <= doc) return [depthTotal];
    const passes = [];
    let remaining = depthTotal;
    while (remaining > 0) {
        passes.push(Math.min(remaining, doc));
        remaining -= passes[passes.length - 1];
    }
    // Última passada muito fina? Redistribuir
    if (passes.length > 1 && passes[passes.length - 1] < Math.max(doc * 0.3, 1.0)) {
        const merged = passes.pop() + passes.pop();
        passes.push(merged / 2, merged / 2);
    }
    // Converter para profundidades acumuladas
    const acc = [];
    let sum = 0;
    for (const p of passes) { sum += p; acc.push(sum); }
    return acc;
}

// ─── Helper: Mapear worker → tipo de usinagem ──────────
function mapWorkerToTipo(worker, usinagemTipos) {
    const cat = (worker.type || worker.category || '').toLowerCase();
    const diam = Number(worker.diameter || 0);
    // 1) Match por categoria + diâmetro (mais específico)
    for (const t of usinagemTipos) {
        if (!t.categoria_match || t.diametro_match == null) continue;
        const cats = t.categoria_match.toLowerCase().split(',').map(s => s.trim());
        if (cats.some(c => cat.includes(c)) && Math.abs(diam - t.diametro_match) < 1) return t;
    }
    // 2) Match por categoria sem diâmetro
    for (const t of usinagemTipos) {
        if (!t.categoria_match || t.diametro_match != null) continue;
        const cats = t.categoria_match.toLowerCase().split(',').map(s => s.trim());
        if (cats.some(c => cat.includes(c))) return t;
    }
    return { codigo: 'generico', nome: 'Operação genérica', prioridade: 5, fase: 'interna' };
}

// ─── Helper: Nearest-neighbor (minimizar G0) ───────────
function orderByProximity(ops) {
    if (ops.length <= 1) return ops;
    const rem = [...ops];
    const ord = [rem.shift()];
    while (rem.length > 0) {
        const last = ord[ord.length - 1];
        let bi = 0, bd = Infinity;
        for (let i = 0; i < rem.length; i++) {
            const d = (rem[i].absX - last.absX) ** 2 + (rem[i].absY - last.absY) ** 2;
            if (d < bd) { bd = d; bi = i; }
        }
        ord.push(rem.splice(bi, 1)[0]);
    }
    return ord;
}

// ─── Helper: Transformar coords quando peça rotacionada ─
function transformRotated(wx, wy, compOriginal) {
    return { x: wy, y: compOriginal - wx };
}

// ═══════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL: Gerar G-code para UMA chapa
// ═══════════════════════════════════════════════════════
function generateGcodeForChapa(chapa, chapaIdx, pecasDb, maquina, toolMap, usinagemTipos, cfg) {
    // --- Config da máquina ---
    const header = maquina.gcode_header || '%\nG90 G54 G17';
    const footer = maquina.gcode_footer || 'G0 Z200.000\nM5\nM30\n%';
    const zSeg = maquina.z_seguro || 30;
    const velCorteMaq = maquina.vel_corte || 4000;
    const profExtraMaq = maquina.profundidade_extra ?? 0.1;
    const dec = maquina.casas_decimais || 3;
    const cmt = maquina.comentario_prefixo || ';';
    const trocaCmd = maquina.troca_ferramenta_cmd || 'M6';
    const sOn = maquina.spindle_on_cmd || 'M3';
    const sOff = maquina.spindle_off_cmd || 'M5';
    const rpmDef = maquina.rpm_padrao || 12000;
    const useOnion = maquina.usar_onion_skin !== 0;
    const onionEsp = maquina.onion_skin_espessura || 0.5;
    const onionAreaMax = maquina.onion_skin_area_max || 500;
    const feedPct = maquina.feed_rate_pct_pequenas || 50;
    const feedAreaMax = maquina.feed_rate_area_max || 500;
    const exportA = maquina.exportar_lado_a !== 0;
    const exportB = maquina.exportar_lado_b !== 0;
    const exportFuros = maquina.exportar_furos !== 0;
    const exportRebaixos = maquina.exportar_rebaixos !== 0;
    const exportUsinagens = maquina.exportar_usinagens !== 0;
    // Novos campos G-Code v2
    const zOrigin = maquina.z_origin || 'mesa';
    const zAprox = maquina.z_aproximacao ?? 2.0;
    const dirCorte = maquina.direcao_corte || 'climb';
    const useNCodes = maquina.usar_n_codes !== 0;
    const nInc = maquina.n_code_incremento || 10;
    const dwellSpindle = maquina.dwell_spindle ?? 1.0;
    // Novos campos G-Code v3 — Ramping, Lead-in, Ordenação
    const useRampa = maquina.usar_rampa !== 0;
    const rampaAngulo = maquina.rampa_angulo ?? 3.0;   // graus
    const velMergulho = maquina.vel_mergulho ?? 1500;   // mm/min plunge feed
    const zAproxRapida = maquina.z_aproximacao_rapida ?? 5.0; // mm acima do material para G0 rápido
    const ordenarContornos = maquina.ordenar_contornos || 'menor_primeiro';
    const usarLeadIn = maquina.usar_lead_in !== 0;
    const leadInRaio = maquina.lead_in_raio ?? 5.0;

    const fmt = (n) => Number(n).toFixed(dec);
    const refilo = chapa.refilo || 10;
    const alertas = [];
    const missingTools = new Set();
    const espChapa = chapa.espessura_real || 18.5;

    // ─── Funções Z baseadas no z_origin ───
    function zApproach() { return zOrigin === 'mesa' ? espChapa + zAprox : zAprox; }
    function zCut(depth) { return zOrigin === 'mesa' ? espChapa - depth : -depth; }
    function zSafe() { return zOrigin === 'mesa' ? espChapa + zSeg : zSeg; }
    // Z rápido: altura intermediária para G0 entre operações próximas (minimizar air cutting)
    function zRapid() { return zOrigin === 'mesa' ? espChapa + zAproxRapida : zAproxRapida; }

    // ─── Emissão com N-codes opcionais ───
    const L = [];
    let nLine = 0;
    function emit(line) {
        if (useNCodes && line.trim() && !line.startsWith(cmt) && !line.startsWith('%') && !line.startsWith('(')) {
            nLine += nInc;
            L.push(`N${nLine} ${line}`);
        } else {
            L.push(line);
        }
    }

    // --- Ferramenta de contorno ---
    let contTool = cfg.contorno_tool_code ? toolMap[cfg.contorno_tool_code] : null;
    if (!contTool) {
        contTool = Object.values(toolMap).find(t =>
            t.tipo_corte === 'fresa_compressao' || t.tipo_corte === 'fresa_reta' || t.tipo === 'fresa'
        );
    }
    if (!contTool) {
        alertas.push({ tipo: 'aviso', msg: 'Nenhuma fresa de contorno no magazine. Contornos não serão gerados.' });
    }

    // ═══ PASSO 1: Coletar TODAS as operações ═══
    const allOps = [];

    for (const pp of chapa.pecas) {
        const pDb = pecasDb.find(p => p.id === pp.pecaId);
        if (!pDb) continue;

        const pX = pp.x, pY = pp.y, pW = pp.w, pH = pp.h;
        const rotated = pp.rotated || false;
        const compOrig = pDb.comprimento, largOrig = pDb.largura;
        const esp = pDb.espessura || 18.5;
        const areaCm2 = (pW * pH) / 100;
        const cls = pp.classificacao || 'normal';
        const isPeq = areaCm2 < feedAreaMax;

        // Parse machining
        let mach = {};
        try { mach = JSON.parse(pDb.machining_json || '{}'); } catch (_) {}

        // Coletar workers
        const workers = [];
        if (mach.workers) {
            const wArr = Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers);
            for (const r of wArr) { if (r && typeof r === 'object') workers.push({ ...r, side: undefined }); }
        }
        for (const side of ['side_a', 'side_b']) {
            const sd = mach[side];
            if (!sd) continue;
            const sArr = Array.isArray(sd) ? sd : Object.values(sd);
            for (const r of sArr) { if (r && typeof r === 'object') workers.push({ ...r, side }); }
        }

        // Processar cada worker
        for (const w of workers) {
            const tc = w.tool_code || w.tool || '';
            const tipo = (w.type || w.category || '').toLowerCase();
            if (w.side === 'side_b' && !exportB) continue;
            if (w.side === 'side_a' && !exportA) continue;
            if (tipo.includes('hole') && !exportFuros) continue;
            if (tipo.includes('rebaixo') && !exportRebaixos) continue;
            if (tipo.includes('pocket') && !exportUsinagens) continue;

            if (tc && !toolMap[tc]) missingTools.add(tc);
            const tool = toolMap[tc] || null;
            const usiTipo = mapWorkerToTipo(w, usinagemTipos);

            // Coords locais
            let wx, wy, wx2, wy2;
            if (w.pos_start_for_line) {
                wx = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0);
                wy = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0);
                wx2 = Number(w.pos_end_for_line?.position_x ?? w.pos_end_for_line?.x ?? wx);
                wy2 = Number(w.pos_end_for_line?.position_y ?? w.pos_end_for_line?.y ?? wy);
            } else {
                wx = Number(w.x ?? w.position_x ?? 0);
                wy = Number(w.y ?? w.position_y ?? 0);
                wx2 = w.x2 != null ? Number(w.x2) : undefined;
                wy2 = w.y2 != null ? Number(w.y2) : undefined;
            }
            if (rotated) {
                const t1 = transformRotated(wx, wy, compOrig);
                wx = t1.x; wy = t1.y;
                if (wx2 !== undefined && wy2 !== undefined) {
                    const t2 = transformRotated(wx2, wy2, compOrig);
                    wx2 = t2.x; wy2 = t2.y;
                }
            }

            const absX = refilo + pX + wx;
            const absY = refilo + pY + wy;
            const absX2 = wx2 !== undefined ? refilo + pX + wx2 : undefined;
            const absY2 = wy2 !== undefined ? refilo + pY + wy2 : undefined;

            // ─── Tool-Agnostic Machining ───
            // Se a ferramenta especificada não existe, tentar encontrar qualquer fresa disponível
            let effectiveTool = tool;
            let toolAdapted = false;
            if (!effectiveTool && tc) {
                // Buscar alternativa: qualquer fresa no magazine
                const alternatives = Object.values(toolMap).filter(t =>
                    t.tipo === 'fresa' || t.tipo_corte === 'fresa_reta' || t.tipo_corte === 'fresa_compressao' || t.tipo === 'broca'
                );
                if (alternatives.length > 0) {
                    // Para rasgo: preferir fresa menor que a largura do rasgo
                    const reqWidth = w.width_line || w.diameter || 0;
                    if (reqWidth > 0) {
                        const fitting = alternatives.filter(t => t.diametro <= reqWidth).sort((a, b) => b.diametro - a.diametro);
                        effectiveTool = fitting[0] || alternatives.sort((a, b) => a.diametro - b.diametro)[0];
                    } else {
                        effectiveTool = alternatives[0];
                    }
                    if (effectiveTool) {
                        toolAdapted = true;
                        alertas.push({ tipo: 'info', msg: `Ferramenta ${tc} não disponível. Usando ${effectiveTool.nome} (Ø${effectiveTool.diametro}mm) com estratégia adaptada para ${pDb.descricao}` });
                    }
                }
            }

            const profExtra = effectiveTool?.profundidade_extra ?? profExtraMaq;
            const depthTotal = Number(w.depth ?? 5) + profExtra;
            const doc = effectiveTool?.doc || null;
            const passes = calcularPassadas(depthTotal, doc);

            // Tool-agnostic: calcular step-over para rasgos/canais mais largos que a fresa
            const reqWidth = w.width_line || 0;
            const toolDiamEf = effectiveTool?.diametro || 0;
            let grooveMultiPass = false;
            let grooveOffsets = [0]; // offsets laterais para passadas múltiplas
            if (reqWidth > 0 && toolDiamEf > 0 && reqWidth > toolDiamEf) {
                // Canal mais largo que a fresa: calcular passadas laterais
                grooveMultiPass = true;
                const stepOver = toolDiamEf * 0.7;
                const halfW = (reqWidth - toolDiamEf) / 2; // offset total do centro
                grooveOffsets = [];
                for (let off = -halfW; off <= halfW + 0.01; off += stepOver) {
                    grooveOffsets.push(Math.min(off, halfW));
                }
                // Garantir que a última passada cobre a borda
                if (grooveOffsets[grooveOffsets.length - 1] < halfW - 0.1) {
                    grooveOffsets.push(halfW);
                }
                alertas.push({ tipo: 'info', msg: `Rasgo ${reqWidth}mm com fresa Ø${toolDiamEf}mm: ${grooveOffsets.length} passadas laterais em ${pDb.descricao}` });
            }

            // Validação: diâmetro fresa > largura rasgo (erro só se não tem multi-pass)
            if (reqWidth > 0 && effectiveTool && effectiveTool.diametro > reqWidth && !grooveMultiPass) {
                alertas.push({ tipo: 'erro_critico', msg: `Fresa ${effectiveTool.nome} (Ø${effectiveTool.diametro}mm) > largura rasgo (${reqWidth}mm) na peça ${pDb.descricao}` });
            }

            const isHole = tipo.includes('hole') || tipo === 'transfer_hole';
            const isCut = tipo.includes('saw') || tipo.includes('cut') || tipo === 'transfer_vertical_saw_cut';
            const isPocket = tipo.includes('pocket') || tipo.includes('rebaixo');
            const velCorte = effectiveTool?.velocidade_corte || velCorteMaq;
            const velEf = isPeq ? Math.round(velCorte * feedPct / 100) : velCorte;

            allOps.push({
                pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                absX, absY, absX2, absY2,
                opType: isHole ? 'hole' : isCut ? 'groove' : isPocket ? 'pocket' : 'generic',
                fase: usiTipo.fase === 'contorno' ? 1 : 0,
                prioridade: usiTipo.prioridade, tipoNome: usiTipo.nome,
                toolCode: effectiveTool?.tool_code || tc,
                toolCodigo: effectiveTool?.codigo || '', toolNome: effectiveTool?.nome || tc,
                toolRpm: effectiveTool?.rpm || rpmDef, toolDiam: effectiveTool?.diametro || 0,
                depthTotal, passes, velCorte: velEf,
                pocketW: w.width || w.w || 0, pocketH: w.height || w.h || 0,
                classificacao: cls, areaCm2, isPequena: isPeq,
                isContorno: false, needsOnionSkin: false,
                // Tool-agnostic multi-pass
                grooveMultiPass, grooveOffsets, grooveWidth: reqWidth, toolAdapted,
            });
        }

        // ═══ CONTORNO AUTOMÁTICO da peça ═══
        if (contTool) {
            const cR = contTool.diametro / 2;
            const profExtra = contTool.profundidade_extra ?? profExtraMaq;
            const depthTotal = esp + profExtra;
            const needsOnion = useOnion && areaCm2 < onionAreaMax;
            const depthCont = needsOnion ? depthTotal - onionEsp : depthTotal;
            const doc = contTool.doc || null;
            const passes = calcularPassadas(depthCont, doc);
            const velC = contTool.velocidade_corte || velCorteMaq;
            const velEf = isPeq ? Math.round(velC * feedPct / 100) : velC;

            const cTipo = usinagemTipos.find(t => t.codigo === 'contorno_peca') || { prioridade: 8, fase: 'contorno' };

            // Classificação determina sub-prioridade do contorno
            const clsOrder = cls === 'super_pequena' ? 0 : cls === 'pequena' ? 1 : 2;

            // ─── Índice de Risco de Vácuo (Vacuum Risk Index) ───
            const chapaW = chapa.comprimento || 2750, chapaH = chapa.largura || 1850;
            const centerX = pX + pW / 2, centerY = pY + pH / 2;
            const distBorda = Math.min(centerX, centerY, chapaW - centerX, chapaH - centerY);
            const distBordaNorm = Math.min(distBorda / (Math.min(chapaW, chapaH) / 2), 1.0);
            const areaMax = chapaW * chapaH / 100;
            const areaNorm = Math.min(areaCm2 / (areaMax * 0.1), 1.0);
            const vacuumRiskIndex = (1.0 - areaNorm) * 0.6 + (1.0 - distBordaNorm) * 0.4;

            // Verificar se a peça tem contorno complexo (não-retangular)
            const hasComplexContour = mach.contour && mach.contour.outer && mach.contour.outer.length > 0;

            if (hasComplexContour) {
                // ═══ CONTORNO COMPLEXO (arcos, curvas, furos) ═══
                const contour = mach.contour;
                const offsetX = refilo + pX;
                const offsetY = refilo + pY;

                // Contorno externo
                allOps.push({
                    pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                    absX: refilo + pX - cR, absY: refilo + pY - cR,
                    absX2: refilo + pX + pW + cR, absY2: refilo + pY + pH + cR,
                    opType: 'contorno', fase: 1,
                    prioridade: cTipo.prioridade, clsOrder, tipoNome: 'Contorno Complexo',
                    toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                    toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                    depthTotal, depthCont, passes, velCorte: velEf,
                    contornoPath: null,  // Não usar path retangular
                    contourData: contour,  // Contorno complexo
                    offsetX, offsetY, cutterRadius: cR,
                    classificacao: cls, areaCm2, isPequena: isPeq,
                    isContorno: true, isComplexContour: true,
                    needsOnionSkin: needsOnion, onionDepthFull: depthTotal,
                    vacuumRiskIndex, distBorda: Math.round(distBorda),
                });

                // Furos/recortes internos (cada um = operação separada, ANTES do contorno externo)
                if (contour.holes && contour.holes.length > 0) {
                    for (const hole of contour.holes) {
                        const holeDepth = esp + profExtra;
                        const holePasses = calcularPassadas(holeDepth, doc);
                        allOps.push({
                            pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                            absX: offsetX, absY: offsetY,
                            absX2: offsetX + pW, absY2: offsetY + pH,
                            opType: hole.type === 'circle' ? 'circular_hole' : 'contour_hole',
                            fase: 0,  // Antes dos contornos externos
                            prioridade: 5, clsOrder: 0, tipoNome: hole.type === 'circle' ? 'Furo Circular' : 'Recorte Interno',
                            toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                            toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                            depthTotal: holeDepth, passes: holePasses, velCorte: velEf,
                            holeData: hole,
                            offsetX, offsetY, cutterRadius: cR,
                            classificacao: cls, areaCm2, isPequena: isPeq,
                            isContorno: false, isComplexContour: false,
                            needsOnionSkin: false,
                        });
                    }
                }

            } else {
                // ═══ CONTORNO RETANGULAR (comportamento existente) ═══
                const cx1 = refilo + pX - cR, cy1 = refilo + pY - cR;
                const cx2 = refilo + pX + pW + cR, cy2 = refilo + pY + pH + cR;

                allOps.push({
                    pecaId: pp.pecaId, pecaDesc: pDb.descricao, moduloDesc: pDb.modulo_desc,
                    absX: cx1, absY: cy1, absX2: cx2, absY2: cy2,
                    opType: 'contorno', fase: 1,
                    prioridade: cTipo.prioridade, clsOrder, tipoNome: 'Contorno',
                    toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                    toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                    depthTotal, depthCont, passes, velCorte: velEf,
                    contornoPath: [{ x: cx1, y: cy1 }, { x: cx2, y: cy1 }, { x: cx2, y: cy2 }, { x: cx1, y: cy2 }],
                    classificacao: cls, areaCm2, isPequena: isPeq,
                    isContorno: true, isComplexContour: false,
                    needsOnionSkin: needsOnion, onionDepthFull: depthTotal,
                    vacuumRiskIndex, distBorda: Math.round(distBorda),
                });
            }
        }
    }

    // ═══ CONTORNOS DE SOBRAS aproveitáveis ═══
    if (contTool && chapa.retalhos) {
        const sobraMinW = cfg.sobra_min_largura || 300;
        const sobraMinH = cfg.sobra_min_comprimento || 600;

        for (const ret of chapa.retalhos) {
            const isSobra = Math.max(ret.w, ret.h) >= sobraMinH && Math.min(ret.w, ret.h) >= sobraMinW;
            if (!isSobra) continue;

            const cR = contTool.diametro / 2;
            const profExtra = contTool.profundidade_extra ?? profExtraMaq;
            const depthTotal = espChapa + profExtra;
            const passes = calcularPassadas(depthTotal, contTool.doc || null);

            const sx1 = refilo + ret.x - cR, sy1 = refilo + ret.y - cR;
            const sx2 = refilo + ret.x + ret.w + cR, sy2 = refilo + ret.y + ret.h + cR;
            const sTipo = usinagemTipos.find(t => t.codigo === 'contorno_sobra') || { prioridade: 9, fase: 'contorno' };

            allOps.push({
                pecaId: null, pecaDesc: `Sobra ${Math.round(ret.w)}x${Math.round(ret.h)}`, moduloDesc: '',
                absX: sx1, absY: sy1, absX2: sx2, absY2: sy2,
                opType: 'contorno_sobra', fase: 2, prioridade: sTipo.prioridade, clsOrder: 9, tipoNome: 'Contorno Sobra',
                toolCode: contTool.tool_code, toolCodigo: contTool.codigo, toolNome: contTool.nome,
                toolRpm: contTool.rpm || rpmDef, toolDiam: contTool.diametro,
                depthTotal, depthCont: depthTotal, passes, velCorte: contTool.velocidade_corte || velCorteMaq,
                contornoPath: [{ x: sx1, y: sy1 }, { x: sx2, y: sy1 }, { x: sx2, y: sy2 }, { x: sx1, y: sy2 }],
                classificacao: 'normal', areaCm2: (ret.w * ret.h) / 100, isPequena: false,
                isContorno: true, needsOnionSkin: false,
            });
        }
    }

    // ═══ PASSO 2: Ordenação global ═══
    // Estratégia: Fase 0 (usinagens internas) → Fase 1 (contornos peças) → Fase 2 (contornos sobras)
    // Dentro de contornos: MENOR PRIMEIRO (preservar vácuo/fixação enquanto chapa tem massa)
    // Vacuum Risk Index: combina área (60%) + distância da borda (40%)
    allOps.sort((a, b) => {
        if (a.fase !== b.fase) return a.fase - b.fase;
        if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
        // Contornos: ordenar por vacuum risk index (maior risco primeiro)
        if (a.isContorno && b.isContorno) {
            if (ordenarContornos === 'menor_primeiro') {
                // Usar vacuum risk index: maior risco = cortar primeiro
                const riskA = a.vacuumRiskIndex ?? 0;
                const riskB = b.vacuumRiskIndex ?? 0;
                if (Math.abs(riskA - riskB) > 0.05) return riskB - riskA; // maior risco primeiro
                // Dentro do mesmo risco: classe
                if ((a.clsOrder ?? 9) !== (b.clsOrder ?? 9)) return (a.clsOrder ?? 9) - (b.clsOrder ?? 9);
                // Dentro da mesma classe, menor área primeiro
                if (a.areaCm2 !== b.areaCm2) return a.areaCm2 - b.areaCm2;
            } else if (ordenarContornos === 'maior_primeiro') {
                if ((a.clsOrder ?? 9) !== (b.clsOrder ?? 9)) return (b.clsOrder ?? 9) - (a.clsOrder ?? 9);
                if (a.areaCm2 !== b.areaCm2) return b.areaCm2 - a.areaCm2;
            }
            // else 'proximidade' — ordenação por proximity abaixo
        }
        if (a.toolCode !== b.toolCode) return (a.toolCode || '').localeCompare(b.toolCode || '');
        return 0;
    });

    const sortedOps = [];
    let gs = 0;
    for (let i = 0; i <= allOps.length; i++) {
        const newGrp = i === allOps.length ||
            allOps[i].fase !== allOps[gs].fase ||
            allOps[i].prioridade !== allOps[gs].prioridade ||
            allOps[i].toolCode !== allOps[gs].toolCode;
        if (newGrp && i > gs) {
            const grp = allOps.slice(gs, i);
            // Para contornos com ordenação por tamanho, manter a ordem de tamanho
            // mas aplicar proximity DENTRO de cada sub-grupo de tamanho similar
            if (grp[0]?.isContorno && ordenarContornos === 'menor_primeiro') {
                // Manter a ordem de vacuum risk index (já ordenada pelo sort principal)
                // NÃO aplicar proximity — a ordem de risco é mais importante que minimizar G0
                sortedOps.push(...grp);
            } else if (grp[0]?.isContorno && ordenarContornos === 'maior_primeiro') {
                // Manter a ordem de área descendente
                sortedOps.push(...grp);
            } else {
                sortedOps.push(...orderByProximity(grp));
            }
            gs = i;
        }
    }

    // ═══ PASSO 3: Gerar G-code ═══
    const onionOps = [];
    let trocas = 0, totalOps = 0, curTool = null;

    // ─── Cabeçalho ───
    L.push(header, '');
    L.push(`${cmt} ═══════════════════════════════════════════════════════`);
    L.push(`${cmt} Ornato ERP — ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`);
    L.push(`${cmt} Maquina: ${maquina.nome} (${maquina.fabricante || ''} ${maquina.modelo || ''})`);
    L.push(`${cmt} Chapa ${chapaIdx + 1}: ${chapa.material || ''} ${chapa.comprimento}x${chapa.largura}mm esp=${espChapa}mm`);
    L.push(`${cmt} Pecas: ${chapa.pecas.length} | Operacoes: ${sortedOps.length}`);
    L.push(`${cmt} Z-origin: ${zOrigin === 'mesa' ? 'Mesa de sacrificio (Z0=mesa)' : 'Topo do material (Z0=material)'}`);
    L.push(`${cmt} Direcao contorno: ${dirCorte === 'climb' ? 'Climb Milling (CW)' : 'Convencional (CCW)'}`);
    const ordLabel = ordenarContornos === 'menor_primeiro' ? 'Menor→Maior (vacuo)' :
                     ordenarContornos === 'maior_primeiro' ? 'Maior→Menor' : 'Proximidade';
    L.push(`${cmt} Ordem contornos: ${ordLabel}`);
    const ad = [];
    if (useOnion) ad.push(`Onion-skin ${onionEsp}mm`);
    if (feedPct < 100) ad.push(`Feed ${feedPct}% peq.`);
    if (useRampa) ad.push(`Rampa ${rampaAngulo}°`);
    if (usarLeadIn) ad.push(`Lead-in R${leadInRaio}mm`);
    if (ad.length) L.push(`${cmt} Estrategias: ${ad.join(' | ')}`);
    L.push(`${cmt} ═══════════════════════════════════════════════════════`, '');

    // ─── Retração Z segura inicial ───
    emit(`G0 Z${fmt(zSafe())}`);
    L.push('');

    let lastFase = -1;

    for (const op of sortedOps) {
        // Separador de fase
        if (op.fase !== lastFase) {
            const fn = op.fase === 0 ? 'USINAGENS INTERNAS' : op.fase === 1 ? 'CONTORNOS DE PECAS' : 'CONTORNOS DE SOBRAS';
            L.push('', `${cmt} ════════════════════════════════════════`);
            L.push(`${cmt} FASE ${op.fase}: ${fn}`);
            L.push(`${cmt} ════════════════════════════════════════`, '');
            lastFase = op.fase;
        }

        // Troca de ferramenta
        if (op.toolCode !== curTool) {
            if (curTool !== null) { emit(`${sOff}`); L.push(`${cmt} Spindle OFF`, ''); }
            const tl = toolMap[op.toolCode];
            if (tl) {
                emit(`${tl.codigo} ${trocaCmd}`);
                L.push(`${cmt} Troca: ${tl.nome} (D${tl.diametro}mm)`);
                emit(`S${tl.rpm || rpmDef} ${sOn}`);
                L.push(`${cmt} Spindle ON`);
                if (dwellSpindle > 0) emit(`G4 P${dwellSpindle.toFixed(1)}`);
            } else {
                L.push(`${cmt} Ferramenta: ${op.toolCode} (nao cadastrada)`);
            }
            L.push('');
            curTool = op.toolCode;
            trocas++;
        }
        totalOps++;

        // ═══ Gerar movimentos por tipo ═══

        // ─── CONTORNO COMPLEXO (arcos, curvas) ───
        if (op.isContorno && op.isComplexContour && op.contourData) {
            const cd = op.contourData;
            const oX = op.offsetX, oY = op.offsetY;
            const cR = op.cutterRadius || 0;
            const outerSegs = cd.outer || [];
            if (outerSegs.length === 0) continue;

            L.push(`${cmt} Contorno COMPLEXO: ${op.pecaDesc}${op.moduloDesc ? ' (' + op.moduloDesc + ')' : ''} (${outerSegs.length} segmentos)`);
            if (op.needsOnionSkin) L.push(`${cmt}   ONION-SKIN: corte ate ${fmt(op.depthCont)}mm, breakthrough ${fmt(op.depthTotal)}mm`);
            L.push(`${cmt}   Passadas: ${op.passes.length} | Prof: ${fmt(op.needsOnionSkin ? op.depthCont : op.depthTotal)}mm | Area: ${op.areaCm2.toFixed(0)}cm2`);
            if (op.vacuumRiskIndex != null) L.push(`${cmt}   Risco vacuo: ${(op.vacuumRiskIndex * 100).toFixed(0)}% | Dist.borda: ${op.distBorda}mm`);
            if (op.isPequena) L.push(`${cmt}   PECA PEQUENA -- Feed ${feedPct}%`);

            // Ponto inicial: ultimo segmento do contorno fecha no primeiro
            const lastSeg = outerSegs[outerSegs.length - 1];
            const startX = oX + lastSeg.x2;
            const startY = oY + lastSeg.y2;

            // Rastrear posição atual para cálculo de I,J relativos em arcos
            let curX = startX, curY = startY;

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                // Posicionar
                emit(`G0 X${fmt(startX)} Y${fmt(startY)}`);
                emit(`G0 Z${fmt(zApproach())}`);

                // Mergulho (rampa se habilitado e primeiro segmento é longo o bastante)
                if (useRampa && outerSegs[0]) {
                    const firstSeg = outerSegs[0];
                    const dx = (oX + firstSeg.x2) - startX;
                    const dy = (oY + firstSeg.y2) - startY;
                    const segLen = Math.sqrt(dx * dx + dy * dy);
                    const rampLen = Math.min(segLen * 0.4, 50);
                    if (rampLen > 5) {
                        const rampFrac = rampLen / segLen;
                        const rampX = startX + dx * rampFrac;
                        const rampY = startY + dy * rampFrac;
                        L.push(`${cmt}   Rampa ${fmt(rampLen)}mm ao longo primeiro segmento`);
                        emit(`G1 X${fmt(rampX)} Y${fmt(rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 X${fmt(startX)} Y${fmt(startY)} F${op.velCorte}`);
                        curX = startX; curY = startY;
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }
                } else {
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                }

                // Percorrer contorno complexo
                for (const seg of outerSegs) {
                    const targetX = oX + seg.x2;
                    const targetY = oY + seg.y2;

                    if (seg.type === 'arc') {
                        // I,J relativos ao ponto atual
                        const I = (oX + seg.cx) - curX;
                        const J = (oY + seg.cy) - curY;
                        const cmd = seg.dir === 'cw' ? 'G2' : 'G3';
                        emit(`${cmd} X${fmt(targetX)} Y${fmt(targetY)} I${fmt(I)} J${fmt(J)} F${op.velCorte}`);
                    } else {
                        // Linha reta (G1)
                        emit(`G1 X${fmt(targetX)} Y${fmt(targetY)} F${op.velCorte}`);
                    }
                    curX = targetX;
                    curY = targetY;
                }

                // Retração Z
                const nextOp = sortedOps[sortedOps.indexOf(op) + 1];
                const useFastRetract = nextOp && nextOp.isContorno && nextOp.toolCode === op.toolCode;
                emit(`G0 Z${fmt(useFastRetract ? zRapid() : zSafe())}`);
            }
            if (op.needsOnionSkin) {
                onionOps.push({ ...op, velFinal: Math.round(op.velCorte * 0.6) });
            }
            L.push('');

        // ─── FURO CIRCULAR (passa-fio, etc.) ───
        } else if (op.opType === 'circular_hole' && op.holeData) {
            const h = op.holeData;
            const oX = op.offsetX, oY = op.offsetY;
            const cx = oX + h.cx, cy = oY + h.cy, r = h.r;
            const cR = op.cutterRadius || 0;
            const toolR = (op.toolDiam || 6) / 2;

            L.push(`${cmt} Furo circular D${fmt(r * 2)}mm (passa-fio): ${op.pecaDesc}`);

            if (r > toolR * 1.5) {
                // Contorno circular: posicionar na borda do furo, G2 volta completa
                const cutR = r - toolR;  // Compensação do raio da fresa

                for (let pi = 0; pi < op.passes.length; pi++) {
                    const zTarget = zCut(op.passes[pi]);
                    if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                    emit(`G0 X${fmt(cx + cutR)} Y${fmt(cy)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    // G2 volta completa: endpoint = startpoint, I = -cutR, J = 0
                    emit(`G2 X${fmt(cx + cutR)} Y${fmt(cy)} I${fmt(-cutR)} J0 F${op.velCorte}`);
                }
                emit(`G0 Z${fmt(zSafe())}`);
            } else {
                // Plunge simples (furo pequeno)
                emit(`G0 X${fmt(cx)} Y${fmt(cy)}`);
                emit(`G0 Z${fmt(zApproach())}`);
                for (let pi = 0; pi < op.passes.length; pi++) {
                    const zTarget = zCut(op.passes[pi]);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                }
                emit(`G0 Z${fmt(zSafe())}`);
            }
            L.push('');

        // ─── RECORTE POLIGONAL INTERNO ───
        } else if (op.opType === 'contour_hole' && op.holeData) {
            const h = op.holeData;
            const oX = op.offsetX, oY = op.offsetY;
            const segs = h.segments || [];

            L.push(`${cmt} Recorte interno: ${op.pecaDesc} (${segs.length} segmentos)`);

            if (segs.length > 0) {
                const lastSeg = segs[segs.length - 1];
                const startX = oX + lastSeg.x2, startY = oY + lastSeg.y2;
                let curX = startX, curY = startY;

                for (let pi = 0; pi < op.passes.length; pi++) {
                    const zTarget = zCut(op.passes[pi]);
                    if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                    emit(`G0 X${fmt(startX)} Y${fmt(startY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    curX = startX; curY = startY;

                    for (const seg of segs) {
                        const targetX = oX + seg.x2;
                        const targetY = oY + seg.y2;

                        if (seg.type === 'arc') {
                            const I = (oX + seg.cx) - curX;
                            const J = (oY + seg.cy) - curY;
                            const cmd = seg.dir === 'cw' ? 'G2' : 'G3';
                            emit(`${cmd} X${fmt(targetX)} Y${fmt(targetY)} I${fmt(I)} J${fmt(J)} F${op.velCorte}`);
                        } else {
                            emit(`G1 X${fmt(targetX)} Y${fmt(targetY)} F${op.velCorte}`);
                        }
                        curX = targetX;
                        curY = targetY;
                    }
                }
                emit(`G0 Z${fmt(zSafe())}`);
            }
            L.push('');

        // ─── CONTORNO RETANGULAR (comportamento existente) ───
        } else if (op.isContorno) {
            const path = op.contornoPath;
            if (!path || path.length < 4) continue;

            L.push(`${cmt} ${op.opType === 'contorno_sobra' ? 'Sobra' : 'Contorno'}: ${op.pecaDesc}${op.moduloDesc ? ' (' + op.moduloDesc + ')' : ''}`);
            if (op.needsOnionSkin) L.push(`${cmt}   ONION-SKIN: corte ate ${fmt(op.depthCont)}mm, breakthrough ${fmt(op.depthTotal)}mm`);
            L.push(`${cmt}   Passadas: ${op.passes.length} | Prof: ${fmt(op.needsOnionSkin ? op.depthCont : op.depthTotal)}mm | Area: ${op.areaCm2.toFixed(0)}cm2`);
            if (op.vacuumRiskIndex != null) L.push(`${cmt}   Risco vacuo: ${(op.vacuumRiskIndex * 100).toFixed(0)}% | Dist.borda: ${op.distBorda}mm`);
            if (op.isPequena) L.push(`${cmt}   PECA PEQUENA -- Feed ${feedPct}%`);

            // Calcular ponto de entrada com lead-in
            // Para climb (CW): entrada no meio da aresta inferior (P0→P1)
            // Lead-in: deslocar ponto de entrada para fora do contorno
            const p0 = path[0], p1 = path[1], p2 = path[2], p3 = path[3];
            const edgeLen = Math.abs(p1.x - p0.x); // comprimento da aresta inferior
            const leadR = usarLeadIn ? Math.min(leadInRaio, edgeLen * 0.2, 15) : 0;

            // Ponto de entrada: meio da primeira aresta, deslocado para fora
            const entryX = (p0.x + p1.x) / 2;
            const entryY = p0.y - leadR;  // fora do contorno (abaixo)

            // Ponto no contorno onde o lead-in termina
            const contX = (p0.x + p1.x) / 2;
            const contY = p0.y;

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                // ─── Calcular comprimento da primeira aresta para rampa ───
                const firstEdgeLen = dirCorte === 'climb'
                    ? Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2)
                    : Math.sqrt((p3.x - p0.x) ** 2 + (p3.y - p0.y) ** 2);
                const rampLen = Math.min(firstEdgeLen * 0.4, 50); // max 50mm de rampa, 40% da aresta
                const depthNeeded = zApproach() - zTarget;

                if (usarLeadIn && leadR > 1) {
                    // ─── COM LEAD-IN ───
                    // 1. Posicionar no ponto de lead-in (fora do contorno)
                    emit(`G0 X${fmt(entryX)} Y${fmt(entryY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    // 2. Entrar no contorno (lead-in) na altura de approach
                    emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);

                    // 3. Descer: rampa ao longo da primeira aresta OU plunge no ponto de entrada
                    if (useRampa && rampLen > 5) {
                        // Rampa ao longo da primeira aresta do contorno
                        const nextPt = dirCorte === 'climb' ? p1 : p0;
                        const dx = nextPt.x - contX, dy = nextPt.y - contY;
                        const edgeLenFromCont = Math.sqrt(dx * dx + dy * dy);
                        const rampFrac = Math.min(rampLen / edgeLenFromCont, 0.9);
                        const rampX = contX + dx * rampFrac;
                        const rampY = contY + dy * rampFrac;
                        L.push(`${cmt}   Rampa ${fmt(rampLen)}mm ao longo aresta, ${rampaAngulo}deg`);
                        emit(`G1 X${fmt(rampX)} Y${fmt(rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        // Voltar ao ponto de entrada do contorno na profundidade de corte
                        emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);
                    } else {
                        // Plunge no ponto de entrada (fora da peça, marca aceitável)
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // 4. Percorrer contorno completo a partir do meio da aresta
                    if (dirCorte === 'climb') {
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);
                    } else {
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(contX)} Y${fmt(contY)} F${op.velCorte}`);
                    }

                    // 5. Lead-out: sair do contorno
                    emit(`G1 X${fmt(entryX)} Y${fmt(entryY)} F${op.velCorte}`);

                } else {
                    // ─── SEM LEAD-IN: entrada direta no P0 ───
                    emit(`G0 X${fmt(p0.x)} Y${fmt(p0.y)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa && rampLen > 5) {
                        // Rampa ao longo da primeira aresta do contorno
                        const nextPt = dirCorte === 'climb' ? p1 : p3;
                        const dx = nextPt.x - p0.x, dy = nextPt.y - p0.y;
                        const edgeL = Math.sqrt(dx * dx + dy * dy);
                        const rampFrac = Math.min(rampLen / edgeL, 0.9);
                        const rampX = p0.x + dx * rampFrac;
                        const rampY = p0.y + dy * rampFrac;
                        L.push(`${cmt}   Rampa ${fmt(rampLen)}mm, ${rampaAngulo}deg`);
                        emit(`G1 X${fmt(rampX)} Y${fmt(rampY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // Direção do contorno
                    if (dirCorte === 'climb') {
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                    } else {
                        emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${op.velCorte}`);
                        emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${op.velCorte}`);
                    }
                }

                // ─── Retração Z: usar zRapid para operações próximas, zSafe entre seções ───
                const nextOp = sortedOps[sortedOps.indexOf(op) + 1];
                const useFastRetract = nextOp && nextOp.isContorno && nextOp.toolCode === op.toolCode;
                emit(`G0 Z${fmt(useFastRetract ? zRapid() : zSafe())}`);
            }
            if (op.needsOnionSkin) {
                onionOps.push({ ...op, velFinal: Math.round(op.velCorte * 0.6) });
            }
            L.push('');

        } else if (op.opType === 'hole') {
            L.push(`${cmt} Furo: ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)} Prof=${fmt(op.depthTotal)}`);
            emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
            emit(`G0 Z${fmt(zApproach())}`);
            for (let pi = 0; pi < op.passes.length; pi++) {
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length}`);
                emit(`G1 Z${fmt(zCut(op.passes[pi]))} F${velMergulho}`);
                if (pi < op.passes.length - 1) emit(`G0 Z${fmt(zApproach())}`);
            }
            // Retração: usar zRapid entre furos consecutivos da mesma ferramenta
            const nextOpH = sortedOps[sortedOps.indexOf(op) + 1];
            const fastRetractH = nextOpH && nextOpH.opType === 'hole' && nextOpH.toolCode === op.toolCode;
            emit(`G0 Z${fmt(fastRetractH ? zRapid() : zSafe())}`);
            L.push('');

        } else if (op.opType === 'groove') {
            const x2 = op.absX2 ?? op.absX, y2 = op.absY2 ?? op.absY;
            const grooveLen = Math.sqrt((x2 - op.absX) ** 2 + (y2 - op.absY) ** 2);
            const gOffsets = op.grooveMultiPass ? op.grooveOffsets : [0];

            if (op.grooveMultiPass) {
                L.push(`${cmt} Rasgo MULTI-PASS: ${op.pecaDesc} Larg=${op.grooveWidth}mm Fresa=D${op.toolDiam}mm (${gOffsets.length} passadas laterais)`);
            } else {
                L.push(`${cmt} Rasgo: ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)} -> X${fmt(x2)} Y${fmt(y2)} Prof=${fmt(op.depthTotal)} L=${fmt(grooveLen)}`);
            }
            if (op.toolAdapted) L.push(`${cmt}   FERRAMENTA ADAPTADA: usando ${op.toolNome} (D${op.toolDiam}mm)`);

            // Calcular vetor perpendicular ao rasgo para offsets laterais
            let perpX = 0, perpY = 0;
            if (grooveLen > 0.01) {
                const dx = x2 - op.absX, dy = y2 - op.absY;
                perpX = -dy / grooveLen; // perpendicular normalizado
                perpY = dx / grooveLen;
            }

            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada Z ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                // Multi-pass lateral: cada offset lateral em cada profundidade
                for (let li = 0; li < gOffsets.length; li++) {
                    const off = gOffsets[li];
                    const sx = op.absX + perpX * off;
                    const sy = op.absY + perpY * off;
                    const ex = x2 + perpX * off;
                    const ey = y2 + perpY * off;

                    if (gOffsets.length > 1) L.push(`${cmt}   Lateral ${li + 1}/${gOffsets.length} offset=${fmt(off)}mm`);

                    emit(`G0 X${fmt(sx)} Y${fmt(sy)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa && grooveLen > 10) {
                        const rampLen = Math.min(grooveLen * 0.3, 20);
                        const ratio = rampLen / grooveLen;
                        const rampEndX = sx + (ex - sx) * ratio;
                        const rampEndY = sy + (ey - sy) * ratio;
                        emit(`G1 X${fmt(rampEndX)} Y${fmt(rampEndY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 X${fmt(sx)} Y${fmt(sy)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    emit(`G1 X${fmt(ex)} Y${fmt(ey)} F${op.velCorte}`);

                    // Retração entre passadas laterais: approach (mínimo)
                    if (li < gOffsets.length - 1) {
                        emit(`G0 Z${fmt(zApproach())}`);
                    }
                }

                // Retração entre passadas Z
                if (pi < op.passes.length - 1) {
                    emit(`G0 Z${fmt(zApproach())}`);
                } else {
                    const nextOpG = sortedOps[sortedOps.indexOf(op) + 1];
                    const fastRetractG = nextOpG && nextOpG.opType === 'groove' && nextOpG.toolCode === op.toolCode;
                    emit(`G0 Z${fmt(fastRetractG ? zRapid() : zSafe())}`);
                }
            }
            L.push('');

        } else if (op.opType === 'pocket') {
            const pw = op.pocketW, ph = op.pocketH;
            const toolDiam = op.toolDiam || 8;
            L.push(`${cmt} Pocket: ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)} ${pw}x${ph} Prof=${fmt(op.depthTotal)}`);
            for (let pi = 0; pi < op.passes.length; pi++) {
                const pd = op.passes[pi];
                const zTarget = zCut(pd);
                if (op.passes.length > 1) L.push(`${cmt}   Passada ${pi + 1}/${op.passes.length} Z=${fmt(zTarget)}`);

                if (pw > toolDiam * 1.2 && ph > toolDiam * 1.2) {
                    // ─── Zigzag clearing para pockets maiores que a fresa ───
                    const stepOver = toolDiam * 0.7;
                    const toolR = toolDiam / 2;
                    const ox = Number(op.absX), oy = Number(op.absY);
                    const startX = ox + toolR, startY = oy + toolR;
                    const endX = ox + pw - toolR, endY = oy + ph - toolR;

                    emit(`G0 X${fmt(startX)} Y${fmt(startY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);

                    if (useRampa) {
                        // Rampa em zigzag: desce ao longo da primeira linha do zigzag
                        const rampLen = Math.min(Math.abs(endY - startY) * 0.3, 20);
                        const rampEndY = startY + rampLen;
                        emit(`G1 X${fmt(startX)} Y${fmt(rampEndY)} Z${fmt(zTarget)} F${velMergulho}`);
                        emit(`G1 X${fmt(startX)} Y${fmt(startY)} F${op.velCorte}`);
                    } else {
                        emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    }

                    // Zigzag em Y com passo em X
                    let cx = startX;
                    let dir = 1;
                    while (cx <= endX + 0.01) {
                        const ty = dir === 1 ? endY : startY;
                        emit(`G1 X${fmt(cx)} Y${fmt(ty)} F${op.velCorte}`);
                        cx += stepOver;
                        if (cx <= endX + 0.01) {
                            emit(`G1 X${fmt(Math.min(cx, endX))} Y${fmt(ty)} F${op.velCorte}`);
                        }
                        dir *= -1;
                    }

                    // Perímetro final (acabamento)
                    L.push(`${cmt}   Perimetro acabamento`);
                    emit(`G1 X${fmt(ox)} Y${fmt(oy)} F${op.velCorte}`);
                    emit(`G1 X${fmt(ox + pw)} Y${fmt(oy)} F${op.velCorte}`);
                    emit(`G1 X${fmt(ox + pw)} Y${fmt(oy + ph)} F${op.velCorte}`);
                    emit(`G1 X${fmt(ox)} Y${fmt(oy + ph)} F${op.velCorte}`);
                    emit(`G1 X${fmt(ox)} Y${fmt(oy)} F${op.velCorte}`);
                    emit(`G0 Z${fmt(zSafe())}`);
                } else if (pw > 0 && ph > 0) {
                    // Pocket pequeno: perímetro simples
                    emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    const px2 = Number(op.absX) + pw, py2 = Number(op.absY) + ph;
                    emit(`G1 X${fmt(px2)} Y${fmt(op.absY)} F${op.velCorte}`);
                    emit(`G1 X${fmt(px2)} Y${fmt(py2)} F${op.velCorte}`);
                    emit(`G1 X${fmt(op.absX)} Y${fmt(py2)} F${op.velCorte}`);
                    emit(`G1 X${fmt(op.absX)} Y${fmt(op.absY)} F${op.velCorte}`);
                    emit(`G0 Z${fmt(zSafe())}`);
                } else {
                    // Plunge simples (sem dimensão de pocket)
                    emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
                    emit(`G0 Z${fmt(zApproach())}`);
                    emit(`G1 Z${fmt(zTarget)} F${velMergulho}`);
                    emit(`G0 Z${fmt(zSafe())}`);
                }
            }
            L.push('');

        } else {
            L.push(`${cmt} Op: ${op.tipoNome} ${op.pecaDesc} X${fmt(op.absX)} Y${fmt(op.absY)}`);
            emit(`G0 X${fmt(op.absX)} Y${fmt(op.absY)}`);
            emit(`G0 Z${fmt(zApproach())}`);
            emit(`G1 Z${fmt(zCut(op.depthTotal))} F${velMergulho}`);
            emit(`G0 Z${fmt(zSafe())}`);
            L.push('');
        }
    }

    if (curTool !== null) { emit(`${sOff}`); L.push(`${cmt} Spindle OFF`, ''); }

    // ═══ PASSE FINAL: Onion-skin breakthrough ═══
    if (onionOps.length > 0) {
        L.push('', `${cmt} ════════════════════════════════════════════════════════`);
        L.push(`${cmt} PASSE FINAL -- Onion-skin breakthrough (${onionOps.length} contornos)`);
        L.push(`${cmt} Corte dos ultimos ${onionEsp}mm com velocidade reduzida (60%)`);
        L.push(`${cmt} ════════════════════════════════════════════════════════`, '');

        const onionByTool = {};
        for (const o of onionOps) { (onionByTool[o.toolCode] ||= []).push(o); }

        for (const [tc, ops] of Object.entries(onionByTool)) {
            const tl = toolMap[tc];
            if (!tl) continue;
            emit(`${tl.codigo} ${trocaCmd}`);
            L.push(`${cmt} Troca: ${tl.nome} (breakthrough)`);
            emit(`S${tl.rpm || rpmDef} ${sOn}`);
            if (dwellSpindle > 0) emit(`G4 P${dwellSpindle.toFixed(1)}`);
            L.push('');
            trocas++;

            // Onion breakthrough: ordenar menor→maior (mesma lógica do contorno principal)
            const orderedOnion = ordenarContornos === 'menor_primeiro'
                ? [...ops].sort((a, b) => a.areaCm2 - b.areaCm2)
                : [...ops];
            for (const os of orderByProximity(orderedOnion)) {
                const path = os.contornoPath;
                if (!path || path.length < 4) continue;
                const dFull = os.onionDepthFull || os.depthTotal;
                L.push(`${cmt} Breakthrough: ${os.pecaDesc} Prof=${fmt(dFull)} (${os.areaCm2.toFixed(0)}cm2)`);

                const p0 = path[0], p1 = path[1], p2 = path[2], p3 = path[3];

                // Para breakthrough, entrada direta (pele fina, sem necessidade de rampa complexa)
                emit(`G0 X${fmt(p0.x)} Y${fmt(p0.y)}`);
                emit(`G0 Z${fmt(zApproach())}`);
                emit(`G1 Z${fmt(zCut(dFull))} F${Math.min(velMergulho, os.velFinal)}`);
                L.push(`${cmt}   vel. reduzida (breakthrough ${onionEsp}mm)`);

                if (dirCorte === 'climb') {
                    emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${os.velFinal}`);
                } else {
                    emit(`G1 X${fmt(p3.x)} Y${fmt(p3.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p2.x)} Y${fmt(p2.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p1.x)} Y${fmt(p1.y)} F${os.velFinal}`);
                    emit(`G1 X${fmt(p0.x)} Y${fmt(p0.y)} F${os.velFinal}`);
                }
                emit(`G0 Z${fmt(zRapid())}`);
                L.push('');
            }
            emit(`${sOff}`);
            L.push(`${cmt} Spindle OFF`, '');
        }
    }

    L.push('', footer);

    return {
        gcode: L.join('\n'),
        stats: {
            total_operacoes: totalOps,
            trocas_ferramenta: trocas,
            contornos_peca: allOps.filter(o => o.opType === 'contorno').length,
            contornos_sobra: allOps.filter(o => o.opType === 'contorno_sobra').length,
            onion_skin_ops: onionOps.length,
            usinagens_internas: allOps.filter(o => o.fase === 0).length,
            pecas_pequenas: allOps.filter(o => o.isPequena && o.isContorno).length,
            ferramentas_adaptadas: allOps.filter(o => o.toolAdapted).length,
            rasgos_multi_pass: allOps.filter(o => o.grooveMultiPass).length,
            ordenacao_contornos: ordenarContornos,
            usar_rampa: useRampa,
            usar_lead_in: usarLeadIn,
            tempo_estimado_min: Math.round((totalOps * 3 + trocas * 12) / 60),
        },
        alertas,
        ferramentas_faltando: [...missingTools],
        contorno_tool: contTool ? { codigo: contTool.codigo, nome: contTool.nome, diametro: contTool.diametro } : null,
    };
}


// ─── Endpoints G-code v2 ───────────────────────────────

// Carrega dados comuns para geração de G-code
function loadGcodeContext(req, loteId) {
    const lote = db.prepare('SELECT * FROM cnc_lotes WHERE id = ? AND user_id = ?').get(loteId, req.user.id);
    if (!lote) return { error: 'Lote não encontrado', status: 404 };
    if (!lote.plano_json) return { error: 'Lote sem plano de corte. Otimize primeiro.', status: 400 };

    let plano;
    try { plano = JSON.parse(lote.plano_json); } catch (_) { return { error: 'Plano de corte inválido', status: 400 }; }
    if (!plano.chapas || plano.chapas.length === 0) return { error: 'Plano sem chapas', status: 400 };

    const maquinaId = req.body.maquina_id;
    let maquina;
    if (maquinaId) maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ? AND ativo = 1').get(maquinaId);
    if (!maquina) maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE padrao = 1 AND ativo = 1 LIMIT 1').get();
    if (!maquina) maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE ativo = 1 LIMIT 1').get();
    if (!maquina) return { error: 'Nenhuma máquina CNC cadastrada.', status: 400 };

    const ferramentas = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? AND ativo = 1').all(maquina.id);
    const toolMap = {};
    for (const f of ferramentas) { if (f.tool_code) toolMap[f.tool_code] = f; }

    const usinagemTipos = db.prepare('SELECT * FROM cnc_usinagem_tipos WHERE ativo = 1 ORDER BY prioridade').all();
    // Multi-lote: coletar TODOS pecaIds referenciados no plano (pode ter lotes mesclados)
    const allPecaIds = new Set();
    for (const ch of plano.chapas || []) {
        for (const p of ch.pecas || []) { if (p.pecaId) allPecaIds.add(p.pecaId); }
    }
    let pecasDb;
    if (allPecaIds.size > 0) {
        const ids = [...allPecaIds];
        pecasDb = db.prepare(`SELECT * FROM cnc_pecas WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    } else {
        pecasDb = db.prepare('SELECT * FROM cnc_pecas WHERE lote_id = ?').all(lote.id);
    }

    const cfgRow = db.prepare('SELECT * FROM cnc_config LIMIT 1').get() || {};
    const cfg = {
        sobra_min_largura: cfgRow.sobra_min_largura || 300,
        sobra_min_comprimento: cfgRow.sobra_min_comprimento || 600,
        contorno_tool_code: req.body.contorno_tool_code || '',
    };

    const extensao = maquina.extensao_arquivo || '.nc';

    return { lote, plano, maquina, toolMap, usinagemTipos, pecasDb, cfg, extensao };
}

// POST /gcode/:loteId/chapa/:chapaIdx — G-code de UMA chapa
router.post('/gcode/:loteId/chapa/:chapaIdx', requireAuth, (req, res) => {
    try {
        const ctx = loadGcodeContext(req, req.params.loteId);
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

        const chapaIdx = parseInt(req.params.chapaIdx);
        if (isNaN(chapaIdx) || chapaIdx < 0 || chapaIdx >= ctx.plano.chapas.length) {
            return res.status(400).json({ error: `Chapa ${chapaIdx} não existe. Total: ${ctx.plano.chapas.length}` });
        }

        const chapa = ctx.plano.chapas[chapaIdx];
        const result = generateGcodeForChapa(chapa, chapaIdx, ctx.pecasDb, ctx.maquina, ctx.toolMap, ctx.usinagemTipos, ctx.cfg);

        if (result.ferramentas_faltando.length > 0) {
            return res.json({
                ok: false, ...result, extensao: ctx.extensao,
                error: `Ferramentas faltando: ${result.ferramentas_faltando.join(', ')}`,
            });
        }

        const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(chapaIdx + 1).padStart(2, '0')}`;
        const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + ctx.extensao;

        res.json({ ok: true, ...result, extensao: ctx.extensao, filename, chapa_idx: chapaIdx });
    } catch (err) {
        console.error('Erro G-code chapa:', err);
        res.status(500).json({ error: 'Erro ao gerar G-code' });
    }
});

// POST /gcode/:loteId — G-code (todas as chapas OU lote completo)
router.post('/gcode/:loteId', requireAuth, (req, res) => {
    try {
        const ctx = loadGcodeContext(req, req.params.loteId);
        if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

        const porChapa = req.body.por_chapa !== false; // default: true (gerar por chapa)

        if (porChapa) {
            // Gerar um G-code separado por chapa
            const chapas = [];
            let allMissing = new Set();
            let allAlertas = [];

            for (let i = 0; i < ctx.plano.chapas.length; i++) {
                const chapa = ctx.plano.chapas[i];
                const result = generateGcodeForChapa(chapa, i, ctx.pecasDb, ctx.maquina, ctx.toolMap, ctx.usinagemTipos, ctx.cfg);
                result.ferramentas_faltando.forEach(f => allMissing.add(f));
                allAlertas.push(...result.alertas);

                const nomeBase = `${ctx.lote.nome || 'Lote'}_${ctx.lote.cliente || ''}_Chapa${String(i + 1).padStart(2, '0')}`;
                const filename = nomeBase.replace(/[^a-zA-Z0-9_-]/g, '_') + ctx.extensao;

                chapas.push({
                    idx: i, gcode: result.gcode, filename, stats: result.stats,
                    alertas: result.alertas, contorno_tool: result.contorno_tool,
                    material: chapa.material || '', pecas_count: chapa.pecas.length,
                });
            }

            if (allMissing.size > 0) {
                return res.json({
                    ok: false, chapas, extensao: ctx.extensao,
                    ferramentas_faltando: [...allMissing],
                    alertas: allAlertas,
                    error: `Ferramentas faltando: ${[...allMissing].join(', ')}`,
                });
            }

            const validacao = {
                maquina: { id: ctx.maquina.id, nome: ctx.maquina.nome, fabricante: ctx.maquina.fabricante, modelo: ctx.maquina.modelo },
                ferramentas_faltando: [],
                anti_arrasto: {
                    onion_skin: ctx.maquina.usar_onion_skin !== 0,
                    tabs: false,
                    lead_in: ctx.maquina.usar_lead_in !== 0,
                    feed_reducao: `${ctx.maquina.feed_rate_pct_pequenas || 50}% para peças < ${ctx.maquina.feed_rate_area_max || 500}cm²`,
                },
            };

            return res.json({ ok: true, chapas, extensao: ctx.extensao, validacao, alertas: allAlertas, total_chapas: chapas.length });
        } else {
            // Modo legado: gerar tudo num único G-code (concatenado)
            const allGcode = [];
            let allStats = { total_operacoes: 0, trocas_ferramenta: 0, contornos_peca: 0, contornos_sobra: 0, onion_skin_ops: 0 };
            let allAlertas = [];

            for (let i = 0; i < ctx.plano.chapas.length; i++) {
                const result = generateGcodeForChapa(ctx.plano.chapas[i], i, ctx.pecasDb, ctx.maquina, ctx.toolMap, ctx.usinagemTipos, ctx.cfg);
                allGcode.push(result.gcode);
                for (const k in allStats) allStats[k] += (result.stats[k] || 0);
                allAlertas.push(...result.alertas);
            }

            res.json({ ok: true, gcode: allGcode.join('\n\n'), extensao: ctx.extensao, stats: allStats, alertas: allAlertas });
        }
    } catch (err) {
        console.error('Erro G-code:', err);
        res.status(500).json({ error: 'Erro ao gerar G-code' });
    }
});


// GRUPO 6: CRUD Máquinas CNC (pós-processadores)
// ═══════════════════════════════════════════════════════

router.get('/maquinas', requireAuth, (req, res) => {
    const maquinas = db.prepare('SELECT * FROM cnc_maquinas ORDER BY padrao DESC, nome').all();
    // Include tool count per machine
    const countStmt = db.prepare('SELECT COUNT(*) as c FROM cnc_ferramentas WHERE maquina_id = ?');
    res.json(maquinas.map(m => ({ ...m, total_ferramentas: countStmt.get(m.id).c })));
});

router.get('/maquinas/:id', requireAuth, (req, res) => {
    const maquina = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ?').get(req.params.id);
    if (!maquina) return res.status(404).json({ error: 'Máquina não encontrada' });
    const ferramentas = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ? ORDER BY codigo').all(maquina.id);
    res.json({ ...maquina, ferramentas });
});

router.post('/maquinas', requireAuth, (req, res) => {
    const m = req.body;
    if (!m.nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare(`INSERT INTO cnc_maquinas (user_id, nome, fabricante, modelo, tipo_pos, extensao_arquivo,
        x_max, y_max, z_max, gcode_header, gcode_footer,
        z_seguro, vel_vazio, vel_corte, vel_aproximacao, rpm_padrao, profundidade_extra,
        coordenada_zero, eixo_x_invertido, eixo_y_invertido,
        exportar_lado_a, exportar_lado_b, exportar_furos, exportar_rebaixos, exportar_usinagens,
        usar_ponto_decimal, casas_decimais, comentario_prefixo, troca_ferramenta_cmd, spindle_on_cmd, spindle_off_cmd,
        usar_onion_skin, onion_skin_espessura, onion_skin_area_max, usar_tabs, tab_largura, tab_altura, tab_qtd, tab_area_max,
        usar_lead_in, lead_in_tipo, lead_in_raio, feed_rate_pct_pequenas, feed_rate_area_max,
        z_origin, z_aproximacao, direcao_corte, usar_n_codes, n_code_incremento, dwell_spindle,
        usar_rampa, rampa_angulo, vel_mergulho, z_aproximacao_rapida, ordenar_contornos,
        padrao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, m.nome, m.fabricante || '', m.modelo || '', m.tipo_pos || 'generic', m.extensao_arquivo || '.nc',
            m.x_max || 2800, m.y_max || 1900, m.z_max || 200,
            m.gcode_header || '%\nG90 G54 G17',
            m.gcode_footer || 'G0 Z200.000\nM5\nM30\n%',
            m.z_seguro || 30, m.vel_vazio || 20000, m.vel_corte || 4000, m.vel_aproximacao || 8000,
            m.rpm_padrao || 12000, m.profundidade_extra || 0.20,
            m.coordenada_zero || 'canto_esq_inf', m.eixo_x_invertido || 0, m.eixo_y_invertido || 0,
            m.exportar_lado_a ?? 1, m.exportar_lado_b ?? 1, m.exportar_furos ?? 1, m.exportar_rebaixos ?? 1, m.exportar_usinagens ?? 1,
            m.usar_ponto_decimal ?? 1, m.casas_decimais || 3, m.comentario_prefixo || ';',
            m.troca_ferramenta_cmd || 'M6', m.spindle_on_cmd || 'M3', m.spindle_off_cmd || 'M5',
            m.usar_onion_skin ?? 1, m.onion_skin_espessura ?? 0.5, m.onion_skin_area_max ?? 500,
            m.usar_tabs ?? 0, m.tab_largura ?? 4, m.tab_altura ?? 1.5, m.tab_qtd ?? 2, m.tab_area_max ?? 800,
            m.usar_lead_in ?? 0, m.lead_in_tipo || 'arco', m.lead_in_raio ?? 5,
            m.feed_rate_pct_pequenas ?? 50, m.feed_rate_area_max ?? 500,
            m.z_origin || 'mesa', m.z_aproximacao ?? 2.0, m.direcao_corte || 'climb',
            m.usar_n_codes ?? 1, m.n_code_incremento ?? 10, m.dwell_spindle ?? 1.0,
            m.usar_rampa ?? 1, m.rampa_angulo ?? 3.0, m.vel_mergulho ?? 1500,
            m.z_aproximacao_rapida ?? 5.0, m.ordenar_contornos || 'menor_primeiro',
            m.padrao || 0);
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/maquinas/:id', requireAuth, (req, res) => {
    const m = req.body;
    // If setting as default, unset others
    if (m.padrao) {
        db.prepare('UPDATE cnc_maquinas SET padrao = 0 WHERE id != ?').run(req.params.id);
    }
    db.prepare(`UPDATE cnc_maquinas SET nome=?, fabricante=?, modelo=?, tipo_pos=?, extensao_arquivo=?,
        x_max=?, y_max=?, z_max=?, gcode_header=?, gcode_footer=?,
        z_seguro=?, vel_vazio=?, vel_corte=?, vel_aproximacao=?, rpm_padrao=?, profundidade_extra=?,
        coordenada_zero=?, eixo_x_invertido=?, eixo_y_invertido=?,
        exportar_lado_a=?, exportar_lado_b=?, exportar_furos=?, exportar_rebaixos=?, exportar_usinagens=?,
        usar_ponto_decimal=?, casas_decimais=?, comentario_prefixo=?, troca_ferramenta_cmd=?, spindle_on_cmd=?, spindle_off_cmd=?,
        usar_onion_skin=?, onion_skin_espessura=?, onion_skin_area_max=?,
        usar_tabs=?, tab_largura=?, tab_altura=?, tab_qtd=?, tab_area_max=?,
        usar_lead_in=?, lead_in_tipo=?, lead_in_raio=?,
        feed_rate_pct_pequenas=?, feed_rate_area_max=?,
        z_origin=?, z_aproximacao=?, direcao_corte=?, usar_n_codes=?, n_code_incremento=?, dwell_spindle=?,
        usar_rampa=?, rampa_angulo=?, vel_mergulho=?, z_aproximacao_rapida=?, ordenar_contornos=?,
        padrao=?, ativo=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`)
        .run(m.nome, m.fabricante, m.modelo, m.tipo_pos, m.extensao_arquivo,
            m.x_max, m.y_max, m.z_max, m.gcode_header, m.gcode_footer,
            m.z_seguro, m.vel_vazio, m.vel_corte, m.vel_aproximacao, m.rpm_padrao, m.profundidade_extra,
            m.coordenada_zero, m.eixo_x_invertido, m.eixo_y_invertido,
            m.exportar_lado_a, m.exportar_lado_b, m.exportar_furos, m.exportar_rebaixos, m.exportar_usinagens,
            m.usar_ponto_decimal, m.casas_decimais, m.comentario_prefixo, m.troca_ferramenta_cmd, m.spindle_on_cmd, m.spindle_off_cmd,
            m.usar_onion_skin ?? 1, m.onion_skin_espessura ?? 0.5, m.onion_skin_area_max ?? 500,
            m.usar_tabs ?? 0, m.tab_largura ?? 4, m.tab_altura ?? 1.5, m.tab_qtd ?? 2, m.tab_area_max ?? 800,
            m.usar_lead_in ?? 0, m.lead_in_tipo || 'arco', m.lead_in_raio ?? 5,
            m.feed_rate_pct_pequenas ?? 50, m.feed_rate_area_max ?? 500,
            m.z_origin || 'mesa', m.z_aproximacao ?? 2.0, m.direcao_corte || 'climb',
            m.usar_n_codes ?? 1, m.n_code_incremento ?? 10, m.dwell_spindle ?? 1.0,
            m.usar_rampa ?? 1, m.rampa_angulo ?? 3.0, m.vel_mergulho ?? 1500,
            m.z_aproximacao_rapida ?? 5.0, m.ordenar_contornos || 'menor_primeiro',
            m.padrao ?? 0, m.ativo ?? 1, req.params.id);
    res.json({ ok: true });
});

router.delete('/maquinas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_maquinas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// Duplicar máquina (com ferramentas)
router.post('/maquinas/:id/duplicar', requireAuth, (req, res) => {
    const original = db.prepare('SELECT * FROM cnc_maquinas WHERE id = ?').get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Máquina não encontrada' });

    const r = db.prepare(`INSERT INTO cnc_maquinas (user_id, nome, fabricante, modelo, tipo_pos, extensao_arquivo,
        x_max, y_max, z_max, gcode_header, gcode_footer,
        z_seguro, vel_vazio, vel_corte, vel_aproximacao, rpm_padrao, profundidade_extra,
        coordenada_zero, eixo_x_invertido, eixo_y_invertido,
        exportar_lado_a, exportar_lado_b, exportar_furos, exportar_rebaixos, exportar_usinagens,
        usar_ponto_decimal, casas_decimais, comentario_prefixo, troca_ferramenta_cmd, spindle_on_cmd, spindle_off_cmd,
        usar_onion_skin, onion_skin_espessura, onion_skin_area_max, usar_tabs, tab_largura, tab_altura, tab_qtd, tab_area_max,
        usar_lead_in, lead_in_tipo, lead_in_raio, feed_rate_pct_pequenas, feed_rate_area_max,
        z_origin, z_aproximacao, direcao_corte, usar_n_codes, n_code_incremento, dwell_spindle,
        usar_rampa, rampa_angulo, vel_mergulho, z_aproximacao_rapida, ordenar_contornos,
        padrao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
        .run(req.user.id, `${original.nome} (cópia)`, original.fabricante, original.modelo, original.tipo_pos, original.extensao_arquivo,
            original.x_max, original.y_max, original.z_max, original.gcode_header, original.gcode_footer,
            original.z_seguro, original.vel_vazio, original.vel_corte, original.vel_aproximacao, original.rpm_padrao, original.profundidade_extra,
            original.coordenada_zero, original.eixo_x_invertido, original.eixo_y_invertido,
            original.exportar_lado_a, original.exportar_lado_b, original.exportar_furos, original.exportar_rebaixos, original.exportar_usinagens,
            original.usar_ponto_decimal, original.casas_decimais, original.comentario_prefixo, original.troca_ferramenta_cmd, original.spindle_on_cmd, original.spindle_off_cmd,
            original.usar_onion_skin, original.onion_skin_espessura, original.onion_skin_area_max,
            original.usar_tabs, original.tab_largura, original.tab_altura, original.tab_qtd, original.tab_area_max,
            original.usar_lead_in, original.lead_in_tipo, original.lead_in_raio,
            original.feed_rate_pct_pequenas, original.feed_rate_area_max,
            original.z_origin || 'mesa', original.z_aproximacao ?? 2.0, original.direcao_corte || 'climb',
            original.usar_n_codes ?? 1, original.n_code_incremento ?? 10, original.dwell_spindle ?? 1.0,
            original.usar_rampa ?? 1, original.rampa_angulo ?? 3.0, original.vel_mergulho ?? 1500,
            original.z_aproximacao_rapida ?? 5.0, original.ordenar_contornos || 'menor_primeiro');

    const newId = Number(r.lastInsertRowid);
    // Duplicate tools
    const tools = db.prepare('SELECT * FROM cnc_ferramentas WHERE maquina_id = ?').all(original.id);
    const ins = db.prepare('INSERT INTO cnc_ferramentas (user_id, maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const t of tools) {
        ins.run(req.user.id, newId, t.codigo, t.nome, t.tipo, t.diametro, t.profundidade_max, t.velocidade_corte, t.rpm, t.tool_code);
    }

    res.json({ id: newId });
});

// ═══════════════════════════════════════════════════════
// GRUPO 6B: CRUD Tipos de Usinagem (prioridades CNC)
// ═══════════════════════════════════════════════════════

router.get('/usinagem-tipos', requireAuth, (req, res) => {
    const tipos = db.prepare('SELECT * FROM cnc_usinagem_tipos ORDER BY prioridade, nome').all();
    res.json(tipos);
});

router.post('/usinagem-tipos', requireAuth, (req, res) => {
    const { codigo, nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao } = req.body;
    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
    const r = db.prepare(`INSERT INTO cnc_usinagem_tipos (user_id, codigo, nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, codigo, nome, categoria_match || '', diametro_match ?? null, prioridade ?? 5, fase || 'interna', tool_code_padrao || '', profundidade_padrao ?? null, largura_padrao ?? null);
    res.json({ ok: true, id: r.lastInsertRowid });
});

router.put('/usinagem-tipos/:id', requireAuth, (req, res) => {
    const { nome, categoria_match, diametro_match, prioridade, fase, tool_code_padrao, profundidade_padrao, largura_padrao, ativo } = req.body;
    const fields = [];
    const vals = [];
    if (nome !== undefined) { fields.push('nome = ?'); vals.push(nome); }
    if (categoria_match !== undefined) { fields.push('categoria_match = ?'); vals.push(categoria_match); }
    if (diametro_match !== undefined) { fields.push('diametro_match = ?'); vals.push(diametro_match); }
    if (prioridade !== undefined) { fields.push('prioridade = ?'); vals.push(prioridade); }
    if (fase !== undefined) { fields.push('fase = ?'); vals.push(fase); }
    if (tool_code_padrao !== undefined) { fields.push('tool_code_padrao = ?'); vals.push(tool_code_padrao); }
    if (profundidade_padrao !== undefined) { fields.push('profundidade_padrao = ?'); vals.push(profundidade_padrao); }
    if (largura_padrao !== undefined) { fields.push('largura_padrao = ?'); vals.push(largura_padrao); }
    if (ativo !== undefined) { fields.push('ativo = ?'); vals.push(ativo); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    vals.push(req.params.id);
    db.prepare(`UPDATE cnc_usinagem_tipos SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
});

router.delete('/usinagem-tipos/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_usinagem_tipos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════
// GRUPO 7: CRUD Chapas, Retalhos, Ferramentas, Config
// ═══════════════════════════════════════════════════════

// ─── Chapas ──────────────────────────────────────────
router.get('/chapas', requireAuth, (req, res) => {
    const chapas = db.prepare('SELECT * FROM cnc_chapas ORDER BY espessura_nominal, nome').all();
    res.json(chapas);
});

router.post('/chapas', requireAuth, (req, res) => {
    const { nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = db.prepare(`INSERT INTO cnc_chapas (user_id, nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, nome, material_code || '', espessura_nominal || 18, espessura_real || 18.5,
        comprimento || 2750, largura || 1850, refilo || 10, veio || 'sem_veio', preco || 0, kerf ?? 4);
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/chapas/:id', requireAuth, (req, res) => {
    const { nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf, ativo } = req.body;
    db.prepare(`UPDATE cnc_chapas SET nome=?, material_code=?, espessura_nominal=?, espessura_real=?, comprimento=?, largura=?, refilo=?, veio=?, preco=?, kerf=?, ativo=? WHERE id=?`)
        .run(nome, material_code, espessura_nominal, espessura_real, comprimento, largura, refilo, veio, preco, kerf ?? 4, ativo ?? 1, req.params.id);
    res.json({ ok: true });
});

router.delete('/chapas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_chapas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ─── Retalhos ──────────────────────────────────────────
router.get('/retalhos', requireAuth, (req, res) => {
    const retalhos = db.prepare('SELECT * FROM cnc_retalhos WHERE disponivel = 1 ORDER BY criado_em DESC').all();
    res.json(retalhos);
});

router.post('/retalhos', requireAuth, (req, res) => {
    const { nome, material_code, espessura_real, comprimento, largura } = req.body;
    const r = db.prepare(`INSERT INTO cnc_retalhos (user_id, nome, material_code, espessura_real, comprimento, largura)
        VALUES (?,?,?,?,?,?)`).run(req.user.id, nome || '', material_code || '', espessura_real || 0, comprimento || 0, largura || 0);
    res.json({ id: Number(r.lastInsertRowid) });
});

router.delete('/retalhos/:id', requireAuth, (req, res) => {
    db.prepare('UPDATE cnc_retalhos SET disponivel = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ─── Ferramentas (vinculadas a máquina) ──────────────────────────
router.get('/ferramentas', requireAuth, (req, res) => {
    const maquinaId = req.query.maquina_id;
    const sql = maquinaId
        ? 'SELECT f.*, m.nome as maquina_nome FROM cnc_ferramentas f LEFT JOIN cnc_maquinas m ON f.maquina_id = m.id WHERE f.maquina_id = ? ORDER BY f.codigo'
        : 'SELECT f.*, m.nome as maquina_nome FROM cnc_ferramentas f LEFT JOIN cnc_maquinas m ON f.maquina_id = m.id ORDER BY m.nome, f.codigo';
    const ferramentas = maquinaId ? db.prepare(sql).all(maquinaId) : db.prepare(sql).all();
    res.json(ferramentas);
});

router.post('/ferramentas', requireAuth, (req, res) => {
    const { maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code } = req.body;
    if (!codigo || !nome) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
    if (!maquina_id) return res.status(400).json({ error: 'Selecione uma máquina' });
    const r = db.prepare(`INSERT INTO cnc_ferramentas (user_id, maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, maquina_id, codigo, nome, tipo || 'broca', diametro || 0, profundidade_max || 30,
        velocidade_corte || 4000, rpm || 12000, tool_code || '');
    res.json({ id: Number(r.lastInsertRowid) });
});

router.put('/ferramentas/:id', requireAuth, (req, res) => {
    const { maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code, ativo } = req.body;
    db.prepare(`UPDATE cnc_ferramentas SET maquina_id=?, codigo=?, nome=?, tipo=?, diametro=?, profundidade_max=?, velocidade_corte=?, rpm=?, tool_code=?, ativo=? WHERE id=?`)
        .run(maquina_id, codigo, nome, tipo, diametro, profundidade_max, velocidade_corte, rpm, tool_code, ativo ?? 1, req.params.id);
    res.json({ ok: true });
});

router.delete('/ferramentas/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cnc_ferramentas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ─── Config (otimizador apenas) ──────────────────────────────────
router.get('/config', requireAuth, (req, res) => {
    const config = db.prepare('SELECT * FROM cnc_config WHERE id = 1').get();
    res.json(config || {});
});

router.put('/config', requireAuth, (req, res) => {
    const c = req.body;
    db.prepare(`UPDATE cnc_config SET
        espaco_pecas=?, peca_min_largura=?, peca_min_comprimento=?,
        considerar_sobra=?, sobra_min_largura=?, sobra_min_comprimento=?,
        kerf_padrao=?, usar_guilhotina=?, usar_retalhos=?, iteracoes_otimizador=?,
        atualizado_em=CURRENT_TIMESTAMP WHERE id=1`).run(
        c.espaco_pecas ?? 7,
        c.peca_min_largura ?? 200, c.peca_min_comprimento ?? 200,
        c.considerar_sobra ?? 1, c.sobra_min_largura ?? 300, c.sobra_min_comprimento ?? 600,
        c.kerf_padrao ?? 4, c.usar_guilhotina ?? 1, c.usar_retalhos ?? 1, c.iteracoes_otimizador ?? 300
    );
    res.json({ ok: true });
});

export default router;
