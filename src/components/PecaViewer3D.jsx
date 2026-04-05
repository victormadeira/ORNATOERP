import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';

/**
 * PecaViewer3D — Visualizador 3D CSG para pecas CNC.
 *
 * Pipeline: JSON -> Parse -> ExtrudeGeometry (contorno) -> CSG subtract (furos/rebaixos) -> Render
 * Renderer WebGL global unico (evita esgotar contextos).
 * Renderiza off-screen e copia via drawImage para canvas local.
 */

// ═══════════════════════════════════════════════════════════
// RENDERER GLOBAL SINGLETON
// ═══════════════════════════════════════════════════════════
let _renderer = null;
let _rendererOk = true;

function getRenderer() {
    if (_renderer) return _renderer;
    if (!_rendererOk) return null;
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) { _rendererOk = false; return null; }

        const r = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true,
        });
        r.setPixelRatio(1);
        r.shadowMap.enabled = false;
        r.toneMapping = THREE.NoToneMapping;
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.domElement.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
        document.body.appendChild(r.domElement);
        _renderer = r;
        return r;
    } catch {
        _rendererOk = false;
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// CSG EVALUATOR SINGLETON
// ═══════════════════════════════════════════════════════════
let _csgEvaluator = null;
function getCSGEvaluator() {
    if (!_csgEvaluator) {
        _csgEvaluator = new Evaluator();
        _csgEvaluator.attributes = ['position', 'normal'];
    }
    return _csgEvaluator;
}

// ═══════════════════════════════════════════════════════════
// CORES E MATERIAIS
// ═══════════════════════════════════════════════════════════
function getMaterialColor(material) {
    const m = (material || '').toLowerCase();
    if (/branco|blanc|white/.test(m)) return 0xF0EBE0;
    if (/preto|black/.test(m)) return 0x3a3a3a;
    if (/cinza|gris/.test(m)) return 0x9E9E9E;
    if (/cru/.test(m)) return 0xD4C9A8;
    if (/areal|carvalho|nogal|natur|rustic|amendoa|teca|tabaco|canela|oak|walnut|castanho/.test(m)) return 0xC4A672;
    return 0xC4A672;
}

function hasGrain(mat) {
    if (!mat) return false;
    const m = mat.toLowerCase();
    return /areal|carvalho|nogal|natur|rustic|amendoa|teca|tabaco|canela|oak|walnut|amend|castanho/i.test(m)
        && !/branco|blanc|white|cru|preto|black|cinza|gris|fendi|titanio/i.test(m);
}

// ═══════════════════════════════════════════════════════════
// TEXTURAS
// ═══════════════════════════════════════════════════════════
function createWoodTexture(grain, comp, larg) {
    const cv = document.createElement('canvas');
    const sz = 1024;
    cv.width = sz; cv.height = sz;
    const cx = cv.getContext('2d');
    const isV = grain === 'vertical';

    const g = cx.createLinearGradient(0, 0, isV ? 0 : sz, isV ? sz : 0);
    g.addColorStop(0, '#dbb07a');
    g.addColorStop(0.25, '#d1a46e');
    g.addColorStop(0.5, '#c99860');
    g.addColorStop(0.75, '#d1a46e');
    g.addColorStop(1, '#dbb07a');
    cx.fillStyle = g;
    cx.fillRect(0, 0, sz, sz);

    cx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 80; i++) {
        cx.beginPath();
        const offset = Math.random() * sz;
        const wavelength = 8 + Math.random() * 25;
        const amplitude = 1.5 + Math.random() * 4;
        for (let t = 0; t < sz; t += 2) {
            const x = isV ? offset + Math.sin(t / wavelength) * amplitude : t;
            const y = isV ? t : offset + Math.sin(t / wavelength) * amplitude;
            t === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
        }
        cx.globalAlpha = 0.015 + Math.random() * 0.04;
        cx.strokeStyle = Math.random() > 0.6 ? '#8a6832' : '#a07840';
        cx.lineWidth = 0.3 + Math.random() * 1.8;
        cx.stroke();
    }
    cx.globalCompositeOperation = 'source-over';
    cx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    tex.repeat.set(comp / 500, larg / 500);
    return tex;
}

// ═══════════════════════════════════════════════════════════
// PARSING MACHINING JSON
// ═══════════════════════════════════════════════════════════
function parseMachining(mj) {
    if (!mj) return [];
    try {
        const d = typeof mj === 'string' ? JSON.parse(mj) : mj;
        let workers = [];
        if (Array.isArray(d)) workers = d;
        else if (d.workers) workers = Array.isArray(d.workers) ? d.workers : Object.values(d.workers);
        return workers.filter(w => w && typeof w === 'object').map(w => {
            const n = { ...w };
            if (n.position_x !== undefined && n.x === undefined) n.x = n.position_x;
            if (n.position_y !== undefined && n.y === undefined) n.y = n.position_y;
            if (n.position_z !== undefined && n.z === undefined) n.z = n.position_z;
            if (n.quadrant && !n.face) n.face = n.quadrant;
            if (n.width_tool && !n.diameter) n.diameter = n.width_tool;
            if (n.width_line && !n.width) n.width = n.width_line;
            if (n.usedepth && (!n.depth || n.depth === 0)) n.depth = n.usedepth;
            return n;
        });
    } catch { return []; }
}

function classifyWorker(cat) {
    const c = (cat || '').toLowerCase();
    if (/transfer_hole$/.test(c)) return { type: 'holeThrough', label: 'Furo passante' };
    if (/hole_blind|blind/.test(c)) return { type: 'holeBlind', label: 'Furo cego' };
    if (/groove|rasgo|canal|saw_cut/.test(c)) return { type: 'groove', label: 'Rasgo/Canal' };
    if (/pocket|rebaixo/.test(c)) return { type: 'pocket', label: 'Rebaixo' };
    if (/milling|fresa/.test(c)) return { type: 'milling', label: 'Fresagem' };
    if (/hole|furo/.test(c)) return { type: 'holeThrough', label: 'Furo' };
    return { type: 'other', label: 'Usinagem' };
}

function getToolLabel(toolCode) {
    if (!toolCode) return null;
    const t = toolCode.toLowerCase();
    if (t.includes('35mm_dob') || t.includes('35_dob')) return 'DOB';
    if (t.includes('tambor_min') || t.includes('15mm_tambor')) return 'MFX';
    if (t.includes('eixo_tambor')) return 'MFX';
    if (t.includes('cavilha')) return 'CAV';
    if (t.includes('twister')) return 'TWS';
    if (t.includes('uniblock')) return 'UNI';
    if (t.includes('chanfro')) return 'CHF';
    return null;
}

// ═══════════════════════════════════════════════════════════
// CSG PIPELINE — Build piece with boolean operations
// ═══════════════════════════════════════════════════════════

/**
 * Extract milling path points from a worker, scaled by sc.
 * Returns array of [x, y] pairs in shape coords.
 */
function extractMillingPts(w, sc) {
    let pts = [];
    if (w.positions && typeof w.positions === 'object' && !Array.isArray(w.positions)) {
        const keys = Object.keys(w.positions).sort((a, b) => Number(a) - Number(b));
        pts = keys.map(k => {
            const p = w.positions[k];
            if (Array.isArray(p)) return [p[0] * sc, p[1] * sc];
            return [Number(p.x ?? p.position_x ?? 0) * sc, Number(p.y ?? p.position_y ?? 0) * sc];
        });
    } else if (w.path && Array.isArray(w.path)) {
        pts = w.path.map(p => [Number(p.x ?? 0) * sc, Number(p.y ?? 0) * sc]);
    }
    return pts;
}

/**
 * Snap a point to the nearest edge of the rectangle [0,0]-[SX,SZ].
 * Returns { x, y, t } where t is the perimeter parameter (CCW from [0,0]).
 */
function snapToRectEdge(px, py, SX, SZ) {
    const edges = [
        { x0: 0, y0: 0, x1: SX, y1: 0, t0: 0 },           // bottom
        { x0: SX, y0: 0, x1: SX, y1: SZ, t0: SX },          // right
        { x0: SX, y0: SZ, x1: 0, y1: SZ, t0: SX + SZ },     // top
        { x0: 0, y0: SZ, x1: 0, y1: 0, t0: 2 * SX + SZ },   // left
    ];
    let best = { dist: Infinity, x: 0, y: 0, t: 0 };
    for (const e of edges) {
        const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        const proj = Math.max(0, Math.min(1, ((px - e.x0) * dx + (py - e.y0) * dy) / (len * len)));
        const sx = e.x0 + proj * dx, sy = e.y0 + proj * dy;
        const d = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2);
        if (d < best.dist) {
            best = { dist: d, x: sx, y: sy, t: e.t0 + proj * len };
        }
    }
    return best;
}

/**
 * Build the outline of the piece incorporating open milling cuts.
 * Returns array of [x,y] points forming the piece contour (CCW).
 *
 * Algorithm:
 * 1. Start with rectangle corners in CCW order
 * 2. For each open milling path:
 *    a. Snap endpoints to rectangle edges
 *    b. Determine "waste" arc (the side with the corner being cut)
 *    c. Replace that arc with the milling path
 */
function buildOutlineWithCuts(SX, SZ, openPaths) {
    if (openPaths.length === 0) return [[0, 0], [SX, 0], [SX, SZ], [0, SZ]];

    const perim = 2 * (SX + SZ);
    const corners = [[0, 0], [SX, 0], [SX, SZ], [0, SZ]];
    const cornerT = [0, SX, SX + SZ, 2 * SX + SZ];

    // Check if t is in CCW arc from a to b
    function inArc(t, a, b) {
        a = ((a % perim) + perim) % perim;
        b = ((b % perim) + perim) % perim;
        t = ((t % perim) + perim) % perim;
        if (a <= b) return t > a + 0.01 && t < b - 0.01;
        return t > a + 0.01 || t < b - 0.01;
    }

    // Process one open path at a time
    // Start with full rectangle, apply each cut
    let currentOutline = corners.map(c => [...c]);
    let currentCornerFlags = [true, true, true, true]; // which original corners remain

    for (const pts of openPaths) {
        if (pts.length < 2) continue;

        const first = snapToRectEdge(pts[0][0], pts[0][1], SX, SZ);
        const last = snapToRectEdge(pts[pts.length - 1][0], pts[pts.length - 1][1], SX, SZ);

        // Find closest corner to milling path center -> that's the waste corner
        const midIdx = Math.floor(pts.length / 2);
        const midX = pts[midIdx][0], midY = pts[midIdx][1];
        let closestCI = 0, closestDist = Infinity;
        for (let i = 0; i < 4; i++) {
            const d = Math.hypot(corners[i][0] - midX, corners[i][1] - midY);
            if (d < closestDist) { closestDist = d; closestCI = i; }
        }

        // Waste arc is the one containing the closest corner
        const wasteIsFirstToLast = inArc(cornerT[closestCI], first.t, last.t);

        // Determine which corners are in the waste arc (to be skipped)
        const skipCorner = [false, false, false, false];
        for (let i = 0; i < 4; i++) {
            if (wasteIsFirstToLast) {
                if (inArc(cornerT[i], first.t, last.t)) skipCorner[i] = true;
            } else {
                if (inArc(cornerT[i], last.t, first.t)) skipCorner[i] = true;
            }
        }

        // Build new outline: walk kept arc + milling path
        const result = [];

        if (wasteIsFirstToLast) {
            // Kept arc: last.t -> first.t (CCW). Then milling forward.
            result.push([last.x, last.y]);
            // Corners in kept arc, sorted by distance from last.t going CCW
            const keptCorners = [];
            for (let i = 0; i < 4; i++) {
                if (skipCorner[i] || !currentCornerFlags[i]) continue;
                if (inArc(cornerT[i], last.t, first.t)) {
                    let rel = cornerT[i] - last.t;
                    if (rel < 0) rel += perim;
                    keptCorners.push({ idx: i, rel });
                }
            }
            keptCorners.sort((a, b) => a.rel - b.rel);
            for (const kc of keptCorners) result.push([...corners[kc.idx]]);
            result.push([first.x, first.y]);
            // Milling path forward (first to last)
            for (const p of pts) result.push([p[0], p[1]]);
        } else {
            // Kept arc: first.t -> last.t (CCW). Then milling reversed.
            result.push([first.x, first.y]);
            const keptCorners = [];
            for (let i = 0; i < 4; i++) {
                if (skipCorner[i] || !currentCornerFlags[i]) continue;
                if (inArc(cornerT[i], first.t, last.t)) {
                    let rel = cornerT[i] - first.t;
                    if (rel < 0) rel += perim;
                    keptCorners.push({ idx: i, rel });
                }
            }
            keptCorners.sort((a, b) => a.rel - b.rel);
            for (const kc of keptCorners) result.push([...corners[kc.idx]]);
            result.push([last.x, last.y]);
            // Milling path reversed (last to first)
            for (let i = pts.length - 1; i >= 0; i--) result.push([pts[i][0], pts[i][1]]);
        }

        currentOutline = result;
        // Update corner flags
        for (let i = 0; i < 4; i++) {
            if (skipCorner[i]) currentCornerFlags[i] = false;
        }
    }

    return currentOutline;
}

/**
 * Build the base 3D shape of the piece.
 * Uses ExtrudeGeometry from the piece contour.
 * - Open passante millings: incorporated directly into outline (waste removed)
 * - Closed passante millings: added as holes (internal cutouts)
 *
 * Shape is defined in XY plane (X=comp, Y=larg), extruded along Z (espessura).
 */
function buildBaseShape(comp, larg, esp, workersA, sc) {
    const SX = comp * sc;
    const SZ = larg * sc;
    const SY = esp * sc;

    // Separate passante millings into open and closed
    const openPaths = [];
    const closedPaths = [];

    for (const w of workersA) {
        const cat = (w.category || '').toLowerCase();
        if (!cat.includes('milling')) continue;
        const depth = w.depth || w.usedepth || 0;
        if (depth < esp * 0.9) continue;

        const pts = extractMillingPts(w, sc);
        if (pts.length < 2) continue;

        const isClosed = String(w.close) === '1';
        if (isClosed && pts.length >= 3) {
            closedPaths.push(pts);
        } else {
            openPaths.push(pts);
        }
    }

    // Build outline incorporating open paths (waste removed from contour)
    const outlinePts = buildOutlineWithCuts(SX, SZ, openPaths);

    const shape = new THREE.Shape();
    shape.moveTo(outlinePts[0][0], outlinePts[0][1]);
    for (let i = 1; i < outlinePts.length; i++) {
        shape.lineTo(outlinePts[i][0], outlinePts[i][1]);
    }
    shape.closePath();

    // Add closed paths as internal holes
    for (const cp of closedPaths) {
        if (cp.length < 3) continue;
        const holePath = new THREE.Path();
        holePath.moveTo(cp[0][0], cp[0][1]);
        for (let i = 1; i < cp.length; i++) holePath.lineTo(cp[i][0], cp[i][1]);
        holePath.closePath();
        shape.holes.push(holePath);
    }

    // Extrude along Z (will be rotated to Y = espessura)
    return new THREE.ExtrudeGeometry(shape, { depth: SY, bevelEnabled: false });
}

/**
 * Build a Brush for a hole (cylinder) subtraction.
 */
function buildHoleBrush(w, comp, larg, esp, sc, material) {
    const SY = esp * sc;
    const face = (w.face || 'top').toLowerCase();
    const d = w.diameter || 8;
    const radius = (d / 2) * sc;
    const depthMm = w.depth || w.usedepth || esp;
    const depth = Math.min(depthMm * sc, SY * 2);
    const isThrough = depthMm >= esp * 0.95;
    const segments = Math.max(12, Math.min(32, Math.round(d)));

    const rawX = Number(w.x ?? w.position_x ?? 0) * sc;
    const rawY = Number(w.y ?? w.position_y ?? 0) * sc;

    const isTop = face === 'top' || face === 'side_a';
    const isBot = face === 'bottom' || face === 'side_b';
    const isLat = !isTop && !isBot;

    // CylinderGeometry: axis = Y by default
    const cylH = isThrough ? SY + 0.5 : depth + 0.1;
    const cylGeo = new THREE.CylinderGeometry(radius, radius, cylH, segments);
    const brush = new Brush(cylGeo, material);

    if (isLat) {
        // Lateral holes
        const penetration = Math.min(depthMm * sc, (face === 'front' || face === 'rear' || face === 'back') ? larg * sc : comp * sc);

        if (face === 'left') {
            // left = x=LENGTH in SketchUp, drill enters from right side (+X) going -X
            brush.rotation.z = Math.PI / 2;
            brush.position.set(comp * sc - penetration / 2 + 0.05, rawY, SY / 2);
        } else if (face === 'right') {
            brush.rotation.z = Math.PI / 2;
            brush.position.set(penetration / 2 - 0.05, rawY, SY / 2);
        } else if (face === 'front') {
            // front = y=0, drill enters going +Y
            brush.position.set(rawX, penetration / 2 - 0.05, SY / 2);
        } else if (face === 'rear' || face === 'back') {
            brush.position.set(rawX, larg * sc - penetration / 2 + 0.05, SY / 2);
        }
    } else {
        // Top/Bottom holes — cylinder axis along Z (espessura)
        brush.rotation.x = Math.PI / 2;

        if (isThrough) {
            brush.position.set(rawX, rawY, SY / 2);
        } else if (isTop) {
            brush.position.set(rawX, rawY, SY - depth / 2 + 0.05);
        } else {
            brush.position.set(rawX, rawY, depth / 2 - 0.05);
        }
    }

    brush.updateMatrixWorld(true);
    return brush;
}

/**
 * Build a Brush for a saw_cut / groove / rebaixo subtraction.
 */
function buildGrooveBrush(w, comp, larg, esp, sc, material) {
    const SY = esp * sc;
    const face = (w.face || 'top').toLowerCase();
    const depthMm = w.depth || w.usedepth || 0;
    if (depthMm <= 0) return null;
    const depth = Math.min(depthMm * sc, SY + 0.1);

    // Method 1: pos_corners (rectangular area)
    if (w.pos_corners && Array.isArray(w.pos_corners) && w.pos_corners.length >= 4) {
        const corners = w.pos_corners;
        const xs = corners.map(c => (c.point ? c.point[0] : (c.x || 0)) * sc);
        const ys = corners.map(c => (c.point ? c.point[1] : (c.y || 0)) * sc);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const gw = maxX - minX, gh = maxY - minY;
        if (gw < 0.01 || gh < 0.01) return null;

        const boxGeo = new THREE.BoxGeometry(gw, gh, depth + 0.1);
        const brush = new Brush(boxGeo, material);
        const cx = minX + gw / 2, cy = minY + gh / 2;
        const isTop = face === 'top' || face === 'side_a';
        const cz = isTop ? SY - depth / 2 + 0.05 : depth / 2 - 0.05;
        brush.position.set(cx, cy, cz);
        brush.updateMatrixWorld(true);
        return brush;
    }

    // Method 2: pos_start_for_line + pos_end_for_line (line groove)
    if (w.pos_start_for_line && w.pos_end_for_line) {
        const sx = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0) * sc;
        const sy = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0) * sc;
        const ex = Number(w.pos_end_for_line.position_x ?? w.pos_end_for_line.x ?? 0) * sc;
        const ey = Number(w.pos_end_for_line.position_y ?? w.pos_end_for_line.y ?? 0) * sc;
        const dx = ex - sx, dy = ey - sy;
        const lineLen = Math.sqrt(dx * dx + dy * dy);
        if (lineLen < 0.01) return null;

        const grooveW = Math.max((w.width_line || w.width || 3) * sc, 0.3);
        const boxGeo = new THREE.BoxGeometry(lineLen + 0.1, grooveW, depth + 0.1);
        const brush = new Brush(boxGeo, material);
        const cx = (sx + ex) / 2, cy = (sy + ey) / 2;
        const isTop = face === 'top' || face === 'side_a';
        const cz = isTop ? SY - depth / 2 + 0.05 : depth / 2 - 0.05;
        brush.position.set(cx, cy, cz);
        if (Math.abs(dx) > 0.01 && Math.abs(dy) > 0.01) {
            brush.rotation.z = Math.atan2(dy, dx);
        } else if (Math.abs(dx) < 0.01) {
            brush.rotation.z = Math.PI / 2;
        }
        brush.updateMatrixWorld(true);
        return brush;
    }

    // Method 3: simple length + position (fallback)
    if (w.length) {
        const rawX = Number(w.x ?? w.position_x ?? 0) * sc;
        const rawY = Number(w.y ?? w.position_y ?? 0) * sc;
        const grooveLen = Number(w.length) * sc;
        const grooveW = Math.max((w.width_line || w.width || 3) * sc, 0.3);
        const boxGeo = new THREE.BoxGeometry(grooveLen, grooveW, depth + 0.1);
        const brush = new Brush(boxGeo, material);
        const isTop = face === 'top' || face === 'side_a';
        const cz = isTop ? SY - depth / 2 + 0.05 : depth / 2 - 0.05;
        brush.position.set(rawX + grooveLen / 2, rawY, cz);
        brush.updateMatrixWorld(true);
        return brush;
    }

    return null;
}

/**
 * Build a Brush for a non-passante milling with positions dict.
 */
function buildMillingPocketBrush(w, comp, larg, esp, sc, material) {
    const SY = esp * sc;
    const face = (w.face || 'top').toLowerCase();
    const depthMm = w.depth || w.usedepth || 0;
    if (depthMm <= 0) return null;
    const depth = Math.min(depthMm * sc, SY + 0.1);

    let pts = [];
    if (w.positions && typeof w.positions === 'object' && !Array.isArray(w.positions)) {
        const keys = Object.keys(w.positions).sort((a, b) => Number(a) - Number(b));
        pts = keys.map(k => {
            const p = w.positions[k];
            if (Array.isArray(p)) return [p[0] * sc, p[1] * sc];
            return [Number(p.x ?? p.position_x ?? 0) * sc, Number(p.y ?? p.position_y ?? 0) * sc];
        });
    } else if (w.path && Array.isArray(w.path)) {
        pts = w.path.map(p => [Number(p.x ?? 0) * sc, Number(p.y ?? 0) * sc]);
    }
    if (pts.length < 2) return null;

    const toolW = (w.width_tool || w.diameter || 6) * sc;
    const halfW = toolW / 2;

    // Build fat polygon around path
    const outer = [], inner = [];
    for (let i = 0; i < pts.length; i++) {
        const curr = pts[i];
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const dx = next[0] - prev[0], dy = next[1] - prev[1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len, ny = dx / len;
        outer.push([curr[0] + nx * halfW, curr[1] + ny * halfW]);
        inner.push([curr[0] - nx * halfW, curr[1] - ny * halfW]);
    }

    const shape = new THREE.Shape();
    shape.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
    for (let i = inner.length - 1; i >= 0; i--) shape.lineTo(inner[i][0], inner[i][1]);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: depth + 0.2, bevelEnabled: false });
    const brush = new Brush(geo, material);
    const isTop = face === 'top' || face === 'side_a';
    brush.position.set(0, 0, isTop ? SY - depth : -0.1);
    brush.updateMatrixWorld(true);
    return brush;
}

// ═══════════════════════════════════════════════════════════
// FULL CSG BUILD
// ═══════════════════════════════════════════════════════════
const CSG_MAX_OPS = 60;

function buildCSGPiece(peca, sc) {
    const comp = peca.comprimento || 600;
    const larg = peca.largura || 400;
    const esp = peca.espessura || 18;

    const workersA = parseMachining(peca.machining_json);
    const workersB = parseMachining(peca.machining_json_b);

    // Material for the piece surface
    const grainType = peca.grain || 'sem_veio';
    const matColor = getMaterialColor(peca.material_code || peca.material);
    const surfaceMat = new THREE.MeshStandardMaterial({
        color: matColor,
        roughness: 0.5,
        metalness: 0,
    });

    // Material for cut surfaces (MDF core)
    const cutMat = new THREE.MeshStandardMaterial({
        color: 0x9E8060,
        roughness: 0.85,
        metalness: 0,
    });

    // Build base geometry (with closed passante millings as holes)
    const baseGeo = buildBaseShape(comp, larg, esp, workersA, sc);

    // Create the base Brush
    let resultBrush = new Brush(baseGeo, surfaceMat);
    resultBrush.updateMatrixWorld(true);

    // Collect all subtraction brushes
    const subtractions = [];
    const allWorkers = [
        ...workersA.map(w => ({ ...w, _side: 'A', face: w.face || w.quadrant || 'top' })),
        ...workersB.map(w => ({ ...w, _side: 'B', face: w.face || w.quadrant || 'bottom' })),
    ];

    for (const w of allWorkers) {
        try {
            const cat = (w.category || '').toLowerCase();
            const face = (w.face || 'top').toLowerCase();
            const depth = w.depth || w.usedepth || 0;

            // Skip lateral operations for CSG (we'll add visual indicators)
            const isLat = !['top', 'bottom', 'side_a', 'side_b'].includes(face);

            // 1. Transfer holes (top/bottom and lateral)
            if (/hole|furo/.test(cat)) {
                const brush = buildHoleBrush(w, comp, larg, esp, sc, cutMat);
                if (brush) subtractions.push({ brush, worker: w, type: 'hole' });
                continue;
            }

            // 2. Saw cuts / grooves / rebaixos (top/bottom only for CSG)
            if ((/saw_cut|groove|rasgo|canal/.test(cat) || (w.tool_code || w.tool || '').toLowerCase() === 'r_f') && !isLat) {
                const brush = buildGrooveBrush(w, comp, larg, esp, sc, cutMat);
                if (brush) subtractions.push({ brush, worker: w, type: 'groove' });
                continue;
            }

            // 3. Pockets / rebaixos (milling-based)
            if (/pocket|rebaixo/.test(cat) && !isLat) {
                const brush = buildGrooveBrush(w, comp, larg, esp, sc, cutMat);
                if (brush) subtractions.push({ brush, worker: w, type: 'pocket' });
                continue;
            }

            // 4. Milling operations
            if (cat.includes('milling') && !isLat) {
                // Skip passante millings — already incorporated into base shape contour
                if (depth >= esp * 0.9 && (w.positions || w.path)) continue;
                // Non-passante milling with positions/path -> CSG subtract
                if (w.positions || w.path) {
                    const brush = buildMillingPocketBrush(w, comp, larg, esp, sc, cutMat);
                    if (brush) subtractions.push({ brush, worker: w, type: 'milling' });
                }
                continue;
            }
        } catch (e) {
            console.warn('CSG brush build failed for worker:', w, e);
        }
    }

    // Apply CSG subtractions
    const evaluator = getCSGEvaluator();
    let opsCount = 0;
    const failedWorkers = [];

    // Batch: union all subtractions first, then single subtract
    // This is faster for many operations
    if (subtractions.length > 3) {
        // Group by proximity and batch union
        let batchBrush = null;
        for (const { brush, worker } of subtractions) {
            if (opsCount >= CSG_MAX_OPS) {
                failedWorkers.push(worker);
                continue;
            }
            try {
                if (!batchBrush) {
                    batchBrush = brush;
                } else {
                    const merged = evaluator.evaluate(batchBrush, brush, ADDITION);
                    batchBrush.geometry.dispose();
                    brush.geometry.dispose();
                    batchBrush = merged;
                    batchBrush.material = cutMat;
                }
                opsCount++;
            } catch (e) {
                console.warn('CSG union failed, skipping worker', e);
                failedWorkers.push(worker);
                brush.geometry.dispose();
            }
        }

        if (batchBrush) {
            try {
                batchBrush.material = cutMat;
                batchBrush.updateMatrixWorld(true);
                const finalResult = evaluator.evaluate(resultBrush, batchBrush, SUBTRACTION);
                resultBrush.geometry.dispose();
                batchBrush.geometry.dispose();
                resultBrush = finalResult;
            } catch (e) {
                console.warn('CSG final subtraction failed, falling back to individual ops', e);
                batchBrush.geometry.dispose();
                // Try individual subtractions as fallback
                for (const { brush: b, worker: w2 } of subtractions) {
                    failedWorkers.push(w2);
                }
            }
        }
    } else {
        // Few operations: subtract individually
        for (const { brush, worker } of subtractions) {
            if (opsCount >= CSG_MAX_OPS) {
                failedWorkers.push(worker);
                brush.geometry.dispose();
                continue;
            }
            try {
                brush.material = cutMat;
                brush.updateMatrixWorld(true);
                const newResult = evaluator.evaluate(resultBrush, brush, SUBTRACTION);
                resultBrush.geometry.dispose();
                brush.geometry.dispose();
                resultBrush = newResult;
                opsCount++;
            } catch (e) {
                console.warn('CSG subtraction failed for worker:', worker, e);
                failedWorkers.push(worker);
                brush.geometry.dispose();
            }
        }
    }

    return {
        geometry: resultBrush.geometry,
        surfaceMat,
        cutMat,
        failedWorkers,
        allWorkers,
    };
}


// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function PecaViewer3D({ peca, width = 400, height = 300, style, force2d = false }) {
    const canvasRef = useRef(null);
    const stateRef = useRef({ scene: null, cam: null, ctrl: null, raf: null, disposed: false });
    const [error, setError] = useState(false);

    const disposeScene = useCallback(() => {
        const s = stateRef.current;
        s.disposed = true;
        if (s.raf) cancelAnimationFrame(s.raf);
        if (s.ctrl) { s.ctrl.dispose(); s.ctrl = null; }
        if (s.scene) {
            s.scene.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
                }
            });
            s.scene = null;
        }
        s.cam = null;
    }, []);

    const build = useCallback(() => {
        if (!canvasRef.current || !peca) return;
        disposeScene();
        stateRef.current.disposed = false;
        setError(false);

        const renderer = getRenderer();
        if (!renderer) { setError(true); return; }

        const dpr = Math.min(window.devicePixelRatio, 2);
        const W = width, H = height;
        const rW = Math.round(W * dpr), rH = Math.round(H * dpr);

        // Dimensoes da peca em mm
        const comp = peca.comprimento || 600;
        const larg = peca.largura || 400;
        const esp = peca.espessura || 18;

        // Scale: normalize to ~100 units on longest axis
        const maxDim = Math.max(comp, larg, esp * 6);
        const sc = 100 / maxDim;
        const SX = comp * sc;
        const SY = esp * sc;
        const SZ = larg * sc;

        // ── Scene ──
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);
        stateRef.current.scene = scene;

        // ── Camera ──
        const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 800);
        const camDist = Math.max(SX, SZ) * 1.8;
        cam.position.set(SX * 0.8, camDist * 0.5, SZ * 1.0);
        cam.lookAt(SX / 2, SY / 2, SZ / 2);
        stateRef.current.cam = cam;

        // ── Controls ──
        const localCanvas = canvasRef.current;
        const ctrl = new OrbitControls(cam, localCanvas);
        ctrl.enableDamping = true;
        ctrl.dampingFactor = 0.08;
        ctrl.minDistance = 10;
        ctrl.maxDistance = 400;
        ctrl.target.set(SX / 2, SY / 2, SZ / 2);
        ctrl.maxPolarAngle = Math.PI * 0.85;
        stateRef.current.ctrl = ctrl;

        // ── Lighting ──
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
        keyLight.position.set(SX * 2, SY * 20, SZ * 1.5);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
        fillLight.position.set(-SX * 2.5, SY * 8, -SZ * 2);
        scene.add(fillLight);
        const bottomLight = new THREE.DirectionalLight(0xffffff, 0.2);
        bottomLight.position.set(0, -SY * 15, 0);
        scene.add(bottomLight);

        // ═══════════════════════════════════════════════════
        // CSG BUILD
        // ═══════════════════════════════════════════════════
        let csgResult;
        try {
            csgResult = buildCSGPiece(peca, sc);
        } catch (e) {
            console.error('CSG build failed entirely:', e);
            setError(true);
            return;
        }

        const { geometry: pieceGeo, surfaceMat, cutMat, failedWorkers, allWorkers } = csgResult;

        // The geometry is in shape space: X=comp, Y=larg, Z=espessura (extrude direction)
        // We need to rotate so that Y=espessura (vertical in scene)
        // Rotation: swap Y and Z -> rotation around X by -90deg
        // Shape X -> World X, Shape Y -> World -Z (flip), Shape Z(extrude) -> World Y
        // Actually: ExtrudeGeometry is in XY plane extruded along Z.
        // Our shape: X = comp [0..SX], Y = larg [0..SZ-worth], Z = extrude = esp [0..SY]
        // We want in scene: X = comp, Y = esp (up), Z = larg
        // So: scene_X = shape_X, scene_Y = shape_Z (extrude), scene_Z = shape_Y
        // This is rotation.x = -PI/2

        // Create multi-material mesh
        const pieceMesh = new THREE.Mesh(pieceGeo, [surfaceMat, cutMat]);
        pieceMesh.rotation.x = -Math.PI / 2;
        // After rotation: shape origin (0,0,0) maps to world (0, 0, 0) with rotation
        // shape (x, y, z) -> world (x, -z, y) after rotation around X
        // Wait: rotation.x = -PI/2:
        //   x' = x
        //   y' = y*cos(-PI/2) - z*sin(-PI/2) = z
        //   z' = y*sin(-PI/2) + z*cos(-PI/2) = -y
        // So: shape(x, y, z) -> world(x, z, -y)
        // Shape extruded along Z [0..SY] -> world Y [0..SY] -> correct (espessura up)
        // Shape Y [0..SZ] -> world Z [0..-SZ] -> need to shift Z
        pieceMesh.position.set(0, 0, SZ);
        // Now: world X = [0..SX], Y = [0..SY], Z = [SZ..0] which means Z is reversed
        // Fix: negate Z by using rotation differently.
        // Actually let's just set position to compensate. The piece now goes from Z=SZ to Z=0.
        // The center is at (SX/2, SY/2, SZ/2) which matches our camera target. Good.

        scene.add(pieceMesh);

        // Wireframe edges
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(pieceGeo, 15),
            new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.25 })
        );
        edges.rotation.copy(pieceMesh.rotation);
        edges.position.copy(pieceMesh.position);
        scene.add(edges);

        // ── Edge bands (visual strips on piece edges) ──
        const hasEB = (code) => code && code !== '-' && code !== '';
        const ebMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
        const ebThick = Math.max(SY * 0.15, 0.35);

        const addEB = (pos, rotY, w, h) => {
            const geo = new THREE.PlaneGeometry(w, h);
            const m = new THREE.Mesh(geo, ebMat);
            m.position.copy(pos);
            if (rotY) m.rotation.y = rotY;
            scene.add(m);
        };
        // Edge band positions (in world coords, piece centered at SX/2, SY/2, SZ/2)
        if (hasEB(peca.borda_frontal))  addEB(new THREE.Vector3(SX / 2, SY / 2, 0 - 0.04), 0, SX, ebThick);
        if (hasEB(peca.borda_traseira)) addEB(new THREE.Vector3(SX / 2, SY / 2, SZ + 0.04), 0, SX, ebThick);
        if (hasEB(peca.borda_dir))      addEB(new THREE.Vector3(SX + 0.04, SY / 2, SZ / 2), Math.PI / 2, SZ, ebThick);
        if (hasEB(peca.borda_esq))      addEB(new THREE.Vector3(-0.04, SY / 2, SZ / 2), Math.PI / 2, SZ, ebThick);

        // ── Visual indicators for lateral holes (not CSG, just visual markers) ──
        const latIndicatorMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        const latIndicatorMatGreen = new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });

        for (const w of allWorkers) {
            const cat = (w.category || '').toLowerCase();
            if (!/hole|furo/.test(cat)) continue;
            const face = (w.face || '').toLowerCase();
            const isLat = ['left', 'right', 'front', 'rear', 'back'].includes(face);
            if (!isLat) continue;

            const d = w.diameter || 8;
            const r = Math.max((d / 2) * sc, 0.3);
            const rawX = Number(w.x ?? w.position_x ?? 0) * sc;
            const rawY = Number(w.y ?? w.position_y ?? 0) * sc;
            const isFB = face === 'front' || face === 'rear' || face === 'back';
            const mat = isFB ? latIndicatorMatGreen : latIndicatorMat;

            // Ring indicator on the entry face
            const ringGeo = new THREE.RingGeometry(r * 0.6, r, 24);
            const ring = new THREE.Mesh(ringGeo, mat);

            if (face === 'left') {
                ring.rotation.y = -Math.PI / 2;
                ring.position.set(SX + 0.05, SY / 2, SZ - rawY);
            } else if (face === 'right') {
                ring.rotation.y = Math.PI / 2;
                ring.position.set(-0.05, SY / 2, SZ - rawY);
            } else if (face === 'front') {
                ring.position.set(rawX, SY / 2, SZ + 0.05);
            } else {
                ring.rotation.y = Math.PI;
                ring.position.set(rawX, SY / 2, -0.05);
            }
            scene.add(ring);
        }

        // ── Grain arrow ──
        if (peca.grain && peca.grain !== 'sem_veio') {
            const dir = peca.grain === 'horizontal' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
            const len = (peca.grain === 'horizontal' ? SX : SZ) * 0.3;
            const orig = new THREE.Vector3(
                peca.grain === 'horizontal' ? SX / 2 - len / 2 : SX / 2,
                SY + 0.5,
                peca.grain === 'vertical' ? SZ / 2 - len / 2 : SZ / 2,
            );
            scene.add(new THREE.ArrowHelper(dir, orig, len, 0xff6b35, len * 0.12, len * 0.06));
        }

        // ═══════════════════════════════════════════════════
        // TOOLTIP via raycasting
        // ═══════════════════════════════════════════════════
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const onMouseMove = (e) => {
            const rect = localCanvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, cam);
            const hits = raycaster.intersectObject(pieceMesh, false);

            if (hits.length > 0 && stateRef.current.tooltipEl) {
                const hit = hits[0];
                const el = stateRef.current.tooltipEl;
                // Show hit point info
                const wp = hit.point;
                // Convert world point to piece coords
                const invMatrix = new THREE.Matrix4().copy(pieceMesh.matrixWorld).invert();
                const local = wp.clone().applyMatrix4(invMatrix);
                const pieceX = (local.x / sc).toFixed(1);
                const pieceY = (local.y / sc).toFixed(1);
                const faceIdx = hit.face ? hit.face.materialIndex : -1;
                const isCutFace = faceIdx === 1;
                const faceLabel = isCutFace ? 'Corte (MDF)' : 'Superficie';

                const lines = [
                    `${faceLabel}`,
                    `X: ${pieceX}mm`,
                    `Y: ${pieceY}mm`,
                ];
                el.innerHTML = lines.join('<br>');
                el.style.display = 'block';
                const tx = Math.min(e.clientX - rect.left + 12, rect.width - 160);
                el.style.left = tx + 'px';
                el.style.top = Math.max(e.clientY - rect.top - 40, 5) + 'px';
                localCanvas.style.cursor = 'crosshair';
            } else if (stateRef.current.tooltipEl) {
                stateRef.current.tooltipEl.style.display = 'none';
                localCanvas.style.cursor = 'grab';
            }
        };
        localCanvas.addEventListener('mousemove', onMouseMove);
        localCanvas.addEventListener('mouseleave', () => {
            if (stateRef.current.tooltipEl) stateRef.current.tooltipEl.style.display = 'none';
            localCanvas.style.cursor = 'grab';
        });
        stateRef.current._onMouseMove = onMouseMove;

        // ═══════════════════════════════════════════════════
        // RENDER LOOP
        // ═══════════════════════════════════════════════════
        renderer.setSize(rW, rH);
        const ctx2d = localCanvas.getContext('2d');
        let needsRender = true;
        ctrl.addEventListener('change', () => { needsRender = true; });

        const animate = () => {
            if (stateRef.current.disposed) return;
            stateRef.current.raf = requestAnimationFrame(animate);
            ctrl.update();
            if (needsRender) {
                needsRender = false;
                renderer.setSize(rW, rH);
                renderer.render(scene, cam);
                try {
                    ctx2d.clearRect(0, 0, rW, rH);
                    ctx2d.drawImage(renderer.domElement, 0, 0, rW, rH);
                } catch {}
            }
        };
        needsRender = true;
        const dampingInterval = setInterval(() => { needsRender = true; }, 50);
        stateRef.current._dampingInterval = dampingInterval;
        animate();

    }, [peca, width, height, disposeScene]);

    const tooltipRef = useRef(null);

    useEffect(() => {
        if (canvasRef.current) {
            const dpr = Math.min(window.devicePixelRatio, 2);
            const rW = Math.round(width * dpr);
            const rH = Math.round(height * dpr);
            canvasRef.current.width = rW;
            canvasRef.current.height = rH;
            canvasRef.current.style.width = width + 'px';
            canvasRef.current.style.height = height + 'px';
        }
        stateRef.current.tooltipEl = tooltipRef.current;
        build();
        return () => {
            if (stateRef.current._dampingInterval) clearInterval(stateRef.current._dampingInterval);
            if (canvasRef.current && stateRef.current._onMouseMove) {
                canvasRef.current.removeEventListener('mousemove', stateRef.current._onMouseMove);
            }
            disposeScene();
        };
    }, [build, disposeScene, width, height]);

    if (!peca) return null;
    if (error || force2d) return <Fallback2D peca={peca} width={width} height={height} style={style} />;

    return (
        <div style={{ position: 'relative', width, height, ...style }}>
            <canvas
                ref={canvasRef}
                style={{ borderRadius: 4, display: 'block', cursor: 'grab', background: '#fff', width: '100%', height: '100%' }}
            />
            <div
                ref={tooltipRef}
                style={{
                    display: 'none', position: 'absolute', pointerEvents: 'none',
                    background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)',
                    color: '#fff', fontSize: 11, fontFamily: 'monospace',
                    padding: '6px 10px', borderRadius: 6, lineHeight: 1.5,
                    maxWidth: 200, zIndex: 10,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                }}
            />
        </div>
    );
}


// ═══════════════════════════════════════════════════════════
// FALLBACK 2D — Visualizacao profissional de peca usinada
// ═══════════════════════════════════════════════════════════
const MAT_COM_VEIO = { base: '#C4A672', rebaixo: '#8B7345', furo: '#3D2E15', stroke: '#9E8050' };
const MAT_SEM_VEIO = { base: '#F0EBE0', rebaixo: '#C4B99E', furo: '#3D3529', stroke: '#B8AE98' };

function extractContourPaths(machJson, espessura) {
    if (!machJson) return { closed: [], open: [], toolWidths: [] };
    let mach;
    try { mach = typeof machJson === 'string' ? JSON.parse(machJson) : machJson; } catch { return { closed: [], open: [], toolWidths: [] }; }
    if (!mach.workers) return { closed: [], open: [], toolWidths: [] };

    const workers = Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers);
    const closed = [], open = [], toolWidths = [];

    for (const w of workers) {
        if (!w) continue;
        const cat = (w.category || '').toLowerCase();
        if (!cat.includes('milling')) continue;
        const depth = w.depth || w.usedepth || 0;
        if (depth < espessura * 0.9) continue;

        const positions = w.positions;
        if (!positions || typeof positions !== 'object') continue;

        const keys = Object.keys(positions).sort((a, b) => Number(a) - Number(b));
        if (keys.length < 2) continue;

        const pts = keys.map(k => {
            const p = positions[k];
            if (Array.isArray(p)) return { x: p[0], y: p[1] };
            return { x: Number(p.x ?? p.position_x ?? 0), y: Number(p.y ?? p.position_y ?? 0) };
        });

        const isClosed = String(w.close) === '1';
        toolWidths.push(w.width_tool || 5);
        if (isClosed) closed.push(pts);
        else open.push(pts);
    }
    return { closed, open, toolWidths };
}

function Fallback2D({ peca, width, height, style }) {
    const comp = peca.comprimento || 600;
    const larg = peca.largura || 400;
    const esp = peca.espessura || 18;
    const workersA = parseMachining(peca.machining_json);
    const workersB = parseMachining(peca.machining_json_b);
    const workers = [
        ...workersA.map(w => ({ ...w, _side: 'A' })),
        ...workersB.map(w => ({ ...w, _side: 'B' })),
    ];
    const hasEB = (c) => c && c !== '-' && c !== '';
    const [tip, setTip] = useState(null);

    const grain = hasGrain(peca.material_code || peca.material);
    const M = grain ? MAT_COM_VEIO : MAT_SEM_VEIO;

    const cotaMargin = 30;
    const pad = 12;
    const availW = width - pad * 2 - cotaMargin;
    const availH = height - pad * 2 - cotaMargin;
    const scale = Math.min(availW / comp, availH / larg);
    const pw = comp * scale;
    const ph = larg * scale;
    const ox = pad + (availW - pw) / 2;
    const oy = pad + (availH - ph) / 2;

    const ebColor = '#3b82f6';

    const workerTip = (w, e) => {
        const info = classifyWorker(w.category);
        const isHole = /hole|furo/i.test(w.category || '');
        const rect = e.currentTarget.closest('div').getBoundingClientRect();
        const toolLbl = getToolLabel(w.tool_code);
        const lines = [toolLbl ? `${info.label} [${toolLbl}]` : info.label];
        if (isHole && w.diameter) lines.push(`\u2300${w.diameter}mm`);
        if (!isHole && w.length) lines.push(`${w.length}\u00d7${w.width}mm`);
        lines.push(`Prof: ${w.depth || esp}mm`);
        const fLabel = { top: 'Topo', bottom: 'Fundo', left: 'Lat. dir', right: 'Lat. esq', front: 'Frontal', rear: 'Traseira' }[(w.face || 'top').toLowerCase()] || w.face;
        lines.push(`Face: ${fLabel}`);
        lines.push(`Pos: ${(w.x || 0).toFixed(1)}, ${(w.y || 0).toFixed(1)}`);
        if (w.tool_code) lines.push(`Ferr: ${w.tool_code}`);
        if ((w.depth || 0) >= esp) lines.push('(passante)');
        const tipH = lines.length * 18 + 16;
        const mouseY = e.clientY - rect.top;
        const flipUp = mouseY + tipH + 10 > height;
        setTip({
            x: Math.min(e.clientX - rect.left + 12, width - 180),
            y: flipUp ? Math.max(mouseY - tipH - 5, 5) : Math.max(mouseY - 10, 5),
            lines,
        });
    };

    const uid = `pv2d_${(peca.id || Math.random()).toString(36).slice(-6)}`;
    const contourData = extractContourPaths(peca.machining_json, esp);
    const hasContourCut = contourData.closed.length > 0 || contourData.open.length > 0;

    return (
        <div style={{
            width, height, overflow: 'hidden', border: 'none',
            background: '#ffffff', fontFamily: 'Inter, system-ui, sans-serif',
            position: 'relative', ...style,
        }} onMouseLeave={() => setTip(null)}>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <defs>
                    {grain && (
                        <pattern id={`${uid}_grain`} patternUnits="userSpaceOnUse" width="60" height="60">
                            <rect width="60" height="60" fill={M.base} />
                            <line x1="0" y1="6" x2="60" y2="6.5" stroke="#b8914a" strokeWidth="0.5" opacity="0.18" />
                            <line x1="0" y1="13" x2="60" y2="12.5" stroke="#a07e3a" strokeWidth="0.8" opacity="0.12" />
                            <line x1="0" y1="21" x2="60" y2="21.5" stroke="#b8914a" strokeWidth="0.4" opacity="0.15" />
                            <line x1="0" y1="28" x2="60" y2="27" stroke="#a07e3a" strokeWidth="0.6" opacity="0.10" />
                            <line x1="0" y1="36" x2="60" y2="36.5" stroke="#b8914a" strokeWidth="0.5" opacity="0.18" />
                            <line x1="0" y1="43" x2="60" y2="43.5" stroke="#a07e3a" strokeWidth="0.7" opacity="0.08" />
                            <line x1="0" y1="51" x2="60" y2="50.5" stroke="#b8914a" strokeWidth="0.4" opacity="0.14" />
                        </pattern>
                    )}
                    <filter id={`${uid}_shadow`}>
                        <feDropShadow dx="1" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.12" />
                    </filter>
                    {(() => {
                        if (!hasContourCut) return null;
                        let clipD = `M ${ox},${oy} L ${ox + pw},${oy} L ${ox + pw},${oy + ph} L ${ox},${oy + ph} Z`;
                        for (const cp of contourData.closed) {
                            if (cp.length < 3) continue;
                            const pts = cp.map(pt => ({ x: ox + (pt.x / comp) * pw, y: oy + (1 - pt.y / larg) * ph }));
                            clipD += ` M ${pts[0].x},${pts[0].y}`;
                            for (let pi = 1; pi < pts.length; pi++) clipD += ` L ${pts[pi].x},${pts[pi].y}`;
                            clipD += ' Z';
                        }
                        for (const op of contourData.open) {
                            if (op.length < 2) continue;
                            const pts = op.map(pt => ({ x: ox + (pt.x / comp) * pw, y: oy + (1 - pt.y / larg) * ph }));
                            const snapX = (p) => p.x < ox + pw * 0.1 ? ox : p.x > ox + pw * 0.9 ? ox + pw : p.x;
                            const snapY = (p) => p.y < oy + ph * 0.1 ? oy : p.y > oy + ph * 0.9 ? oy + ph : p.y;
                            const first = pts[0], last = pts[pts.length - 1];
                            clipD += ` M ${snapX(first)},${snapY(first)}`;
                            for (const p of pts) clipD += ` L ${p.x},${p.y}`;
                            clipD += ` L ${snapX(last)},${snapY(last)} Z`;
                        }
                        return <clipPath id={`${uid}_contour`}><path d={clipD} clipRule="evenodd" /></clipPath>;
                    })()}
                </defs>

                {/* 1. PECA BASE */}
                <rect x={ox} y={oy} width={pw} height={ph}
                    fill={grain ? `url(#${uid}_grain)` : M.base}
                    stroke={M.stroke} strokeWidth="1.5"
                    filter={`url(#${uid}_shadow)`}
                    clipPath={hasContourCut ? `url(#${uid}_contour)` : undefined} />
                {hasContourCut && contourData.closed.map((cp, ci) => {
                    if (cp.length < 3) return null;
                    const pts = cp.map(pt => `${ox + (pt.x / comp) * pw},${oy + (1 - pt.y / larg) * ph}`).join(' ');
                    return <polygon key={`cc${ci}`} points={pts} fill="none" stroke={M.stroke} strokeWidth="1" strokeDasharray="4,2" opacity="0.6" />;
                })}
                {hasContourCut && contourData.open.map((op, oi) => {
                    if (op.length < 2) return null;
                    const pts = op.map(pt => `${ox + (pt.x / comp) * pw},${oy + (1 - pt.y / larg) * ph}`).join(' ');
                    return <polyline key={`co${oi}`} points={pts} fill="none" stroke={M.stroke} strokeWidth="1" strokeDasharray="4,2" opacity="0.6" />;
                })}

                {/* 2. REBAIXOS (saw_cut) */}
                {workers.map((w, i) => {
                    const cat = (w.category || '').toLowerCase();
                    const wFace = (w.face || w.quadrant || 'top').toLowerCase();
                    if (!cat.includes('saw_cut') && (w.tool_code || w.tool || '').toLowerCase() !== 'r_f') return null;
                    if (['front', 'rear', 'back', 'left', 'right'].includes(wFace)) return null;

                    const depth = w.depth || 0;
                    const depthRatio = Math.min(depth / esp, 1);
                    const darkness = wFace === 'bottom'
                        ? `rgba(255,255,255,${0.15 + depthRatio * 0.25})`
                        : `rgba(0,0,0,${0.08 + depthRatio * 0.35})`;

                    if (w.pos_start_for_line && w.pos_end_for_line) {
                        const sx = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0);
                        const sy = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0);
                        const ex = Number(w.pos_end_for_line.position_x ?? w.pos_end_for_line.x ?? 0);
                        const ey = Number(w.pos_end_for_line.position_y ?? w.pos_end_for_line.y ?? 0);
                        const grooveW = Math.max((w.width_line || w.width || 3) * scale, 2);
                        const x1 = ox + sx / comp * pw, y1 = oy + (1 - sy / larg) * ph;
                        const x2 = ox + ex / comp * pw, y2 = oy + (1 - ey / larg) * ph;
                        return (
                            <g key={`reb${i}`} style={{ cursor: 'pointer' }}
                                onMouseEnter={(e) => workerTip(w, e)} onMouseMove={(e) => workerTip(w, e)} onMouseLeave={() => setTip(null)}>
                                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={darkness} strokeWidth={grooveW + 1} strokeLinecap="round" />
                                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={M.rebaixo} strokeWidth={grooveW} strokeLinecap="round" opacity={0.5 + depthRatio * 0.3} />
                                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={Math.max(grooveW + 8, 12)} />
                            </g>
                        );
                    }

                    if (w.length) {
                        let rawX2p = Number(w.x ?? w.position_x ?? 0);
                        let rawY2p = Number(w.y ?? w.position_y ?? 0);
                        const grooveLen = Number(w.length);
                        const grooveW = Math.max((w.width_line || w.width || 3) * scale, 2);
                        const x1 = ox + rawX2p / comp * pw;
                        const x2 = ox + (rawX2p + grooveLen) / comp * pw;
                        const yy = oy + (1 - rawY2p / larg) * ph;
                        return (
                            <g key={`reb${i}`} style={{ cursor: 'pointer' }}
                                onMouseEnter={(e) => workerTip(w, e)} onMouseMove={(e) => workerTip(w, e)} onMouseLeave={() => setTip(null)}>
                                <line x1={x1} y1={yy} x2={x2} y2={yy} stroke={darkness} strokeWidth={grooveW + 1} strokeLinecap="round" />
                                <line x1={x1} y1={yy} x2={x2} y2={yy} stroke={M.rebaixo} strokeWidth={grooveW} strokeLinecap="round" opacity={0.5 + depthRatio * 0.3} />
                                <line x1={x1} y1={yy} x2={x2} y2={yy} stroke="transparent" strokeWidth={Math.max(grooveW + 8, 12)} />
                            </g>
                        );
                    }

                    if (w.path && Array.isArray(w.path) && w.path.length >= 2) {
                        const grooveW = Math.max((w.width_line || w.width || w.diameter || 3) * scale, 2);
                        const pts = w.path.map(pt => `${ox + Number(pt.x ?? 0) / comp * pw},${oy + (1 - Number(pt.y ?? 0) / larg) * ph}`).join(' ');
                        return (
                            <g key={`reb${i}`} style={{ cursor: 'pointer' }}
                                onMouseEnter={(e) => workerTip(w, e)} onMouseMove={(e) => workerTip(w, e)} onMouseLeave={() => setTip(null)}>
                                <polyline points={pts} fill="none" stroke={M.rebaixo} strokeWidth={grooveW} strokeLinecap="round" strokeLinejoin="round" opacity={0.5 + depthRatio * 0.3} />
                                <polyline points={pts} fill="none" stroke="transparent" strokeWidth={Math.max(grooveW + 8, 12)} />
                            </g>
                        );
                    }
                    return null;
                })}

                {/* 3. REBAIXOS / POCKETS (milling, pocket) */}
                {workers.map((w, i) => {
                    const cat = (w.category || '').toLowerCase();
                    const wFace = (w.face || w.quadrant || 'top').toLowerCase();
                    const isPocket = cat.includes('pocket') || cat.includes('rebaixo') || cat.includes('milling');
                    if (!isPocket) return null;
                    if (['front', 'rear', 'back', 'left', 'right'].includes(wFace)) return null;
                    const wDepth = w.depth || w.usedepth || 0;
                    if (cat.includes('milling') && wDepth >= esp * 0.9 && (w.positions || w.path)) return null;

                    let rawX2p = Number(w.x ?? w.position_x ?? 0);
                    let rawY2p = Number(w.y ?? w.position_y ?? 0);
                    const cx2 = ox + rawX2p / comp * pw;
                    const cy2 = oy + (1 - rawY2p / larg) * ph;
                    const rw = Math.max((w.pocket_width || w.width || w.length || 20) * scale, 6);
                    const rh = Math.max((w.pocket_height || w.height || 20) * scale, 6);
                    const depthRatio = Math.min((w.depth || 0) / esp, 1);
                    const darkness = wFace === 'bottom'
                        ? `rgba(255,255,255,${0.1 + depthRatio * 0.2})`
                        : `rgba(0,0,0,${0.06 + depthRatio * 0.3})`;
                    const faceIcon = wFace === 'bottom' ? '\u25BC' : '\u25B2';

                    return (
                        <g key={`pkt${i}`} style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => workerTip(w, e)} onMouseMove={(e) => workerTip(w, e)} onMouseLeave={() => setTip(null)}>
                            <rect x={cx2 - rw / 2} y={cy2 - rh / 2} width={rw} height={rh}
                                fill={darkness} stroke={M.rebaixo} strokeWidth={1} strokeDasharray="3,1.5" rx={1} />
                            {rw > 12 && rh > 12 && (
                                <text x={cx2 - rw / 2 + 3} y={cy2 - rh / 2 + 9}
                                    fontSize="7" fill={wFace === 'bottom' ? '#6366f1' : '#dc2626'} fontWeight="700" opacity="0.6">{faceIcon}</text>
                            )}
                            <rect x={cx2 - rw / 2 - 4} y={cy2 - rh / 2 - 4} width={rw + 8} height={rh + 8} fill="transparent" />
                        </g>
                    );
                })}

                {/* 4. FUROS face (top/bottom) */}
                {workers.map((w, i) => {
                    const cat = (w.category || '').toLowerCase();
                    if (!/hole|furo/.test(cat)) return null;
                    const wFace = (w.face || w.quadrant || 'top').toLowerCase();
                    if (['front', 'rear', 'back', 'left', 'right'].includes(wFace)) return null;

                    const rawX2p = Number(w.x ?? w.position_x ?? 0);
                    const rawY2p = Number(w.y ?? w.position_y ?? 0);
                    const cx2 = ox + rawX2p / comp * pw;
                    const cy2 = oy + (1 - rawY2p / larg) * ph;
                    const d = w.diameter || 8;
                    const r = Math.max(1.5, (d / 2) * scale);
                    const hitR = Math.max(r + 3, 8);
                    const isThrough = /transfer_hole$/.test(cat) || (w.depth || 0) >= esp;
                    const isBottom = wFace === 'bottom';
                    const toolLbl = getToolLabel(w.tool_code);

                    return (
                        <g key={`hole${i}`} style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => workerTip(w, e)} onMouseMove={(e) => workerTip(w, e)} onMouseLeave={() => setTip(null)}>
                            <circle cx={cx2 + 0.5} cy={cy2 + 0.5} r={r + 0.5} fill="#000" opacity="0.1" />
                            <circle cx={cx2} cy={cy2} r={r}
                                fill={isBottom ? '#94a3b8' : M.furo}
                                stroke={isThrough ? M.furo : M.rebaixo} strokeWidth={isThrough ? 1.5 : 0.8} />
                            {isBottom && r > 2.5 && (
                                <>
                                    <line x1={cx2 - r * 0.5} y1={cy2 - r * 0.5} x2={cx2 + r * 0.5} y2={cy2 + r * 0.5} stroke={M.furo} strokeWidth={1} opacity="0.7" />
                                    <line x1={cx2 + r * 0.5} y1={cy2 - r * 0.5} x2={cx2 - r * 0.5} y2={cy2 + r * 0.5} stroke={M.furo} strokeWidth={1} opacity="0.7" />
                                </>
                            )}
                            {!isThrough && !isBottom && r > 3 && (
                                <circle cx={cx2} cy={cy2} r={Math.max(0.8, r * 0.15)} fill={M.base} opacity="0.5" />
                            )}
                            {toolLbl && r > 5 && (
                                <text x={cx2} y={cy2 + r + 8} textAnchor="middle" fontSize={Math.min(8, r * 0.8)} fill={M.furo} fontWeight="700" opacity="0.65">{toolLbl}</text>
                            )}
                            <circle cx={cx2} cy={cy2} r={hitR} fill="transparent" />
                        </g>
                    );
                })}

                {/* 5. FUROS LATERAIS — semicirculos na borda */}
                {workers.map((w, i) => {
                    const cat = (w.category || '').toLowerCase();
                    if (!/hole|furo/.test(cat)) return null;
                    const wFace = (w.face || w.quadrant || '').toLowerCase();
                    const isLeftRight = wFace === 'left' || wFace === 'right';
                    const isFrontRear = wFace === 'front' || wFace === 'rear' || wFace === 'back';
                    if (!isLeftRight && !isFrontRear) return null;

                    const rawY2p = Number(w.y ?? w.position_y ?? 0);
                    const rawX2p = Number(w.x ?? w.position_x ?? 0);
                    const d = w.diameter || 8;
                    const r = Math.max(2.5, (d / 2) * scale);
                    const depth = w.depth || 0;
                    const depthPx = Math.min((depth / comp) * pw, pw * 0.15);
                    const toolLbl = getToolLabel(w.tool_code);
                    const color = isFrontRear ? '#16a34a' : '#2563eb';
                    const colorDark = isFrontRear ? '#15803d' : '#1d4ed8';

                    if (isLeftRight) {
                        const atRight = wFace === 'left';
                        const edgeY = oy + (1 - rawY2p / larg) * ph;
                        const edgeX = atRight ? ox + pw : ox;
                        const dir = atRight ? -1 : 1;
                        const semiPath = atRight
                            ? `M ${edgeX},${edgeY - r} A ${r},${r} 0 0,0 ${edgeX},${edgeY + r}`
                            : `M ${edgeX},${edgeY - r} A ${r},${r} 0 0,1 ${edgeX},${edgeY + r}`;
                        return (
                            <g key={`lat${i}`} style={{ cursor: 'pointer' }}
                                onMouseEnter={(e) => workerTip(w, e)} onMouseMove={(e) => workerTip(w, e)} onMouseLeave={() => setTip(null)}>
                                <line x1={edgeX} y1={edgeY} x2={edgeX + dir * depthPx} y2={edgeY}
                                    stroke={color} strokeWidth={Math.max(1.5, r * 0.3)} opacity="0.25" strokeLinecap="round" />
                                <path d={semiPath} fill={color} opacity="0.6" stroke={colorDark} strokeWidth="0.5" />
                                {r > 3.5 && <text x={edgeX + dir * (r + 4)} y={edgeY + 3}
                                    fontSize={Math.min(8, r * 0.9)} fill={color} fontWeight="600"
                                    textAnchor={atRight ? 'end' : 'start'}>{'\u2300'}{d}</text>}
                                {toolLbl && r > 4 && <text x={edgeX + dir * (r + 4)} y={edgeY + 12}
                                    fontSize="7" fill={color} fontWeight="700" opacity="0.6"
                                    textAnchor={atRight ? 'end' : 'start'}>{toolLbl}</text>}
                                <circle cx={edgeX + dir * r * 0.3} cy={edgeY} r={Math.max(r + 4, 10)} fill="transparent" />
                            </g>
                        );
                    }

                    if (isFrontRear) {
                        const atBottom = wFace === 'front';
                        const edgeX2 = ox + rawX2p / comp * pw;
                        const edgeY2 = atBottom ? oy + ph : oy;
                        const dir = atBottom ? -1 : 1;
                        const semiPath = atBottom
                            ? `M ${edgeX2 - r},${edgeY2} A ${r},${r} 0 0,0 ${edgeX2 + r},${edgeY2}`
                            : `M ${edgeX2 - r},${edgeY2} A ${r},${r} 0 0,1 ${edgeX2 + r},${edgeY2}`;
                        return (
                            <g key={`lat${i}`} style={{ cursor: 'pointer' }}
                                onMouseEnter={(e) => workerTip(w, e)} onMouseMove={(e) => workerTip(w, e)} onMouseLeave={() => setTip(null)}>
                                <line x1={edgeX2} y1={edgeY2} x2={edgeX2} y2={edgeY2 + dir * depthPx}
                                    stroke={color} strokeWidth={Math.max(1.5, r * 0.3)} opacity="0.25" strokeLinecap="round" />
                                <path d={semiPath} fill={color} opacity="0.6" stroke={colorDark} strokeWidth="0.5" />
                                {r > 3.5 && <text x={edgeX2 + r + 4} y={edgeY2 + dir * (r + 2)}
                                    fontSize={Math.min(8, r * 0.9)} fill={color} fontWeight="600">{'\u2300'}{d}</text>}
                                <circle cx={edgeX2} cy={edgeY2 + dir * r * 0.3} r={Math.max(r + 4, 10)} fill="transparent" />
                            </g>
                        );
                    }
                    return null;
                })}

                {/* 6. FITAS DE BORDA */}
                {hasEB(peca.borda_frontal) && <line x1={ox} y1={oy + ph} x2={ox + pw} y2={oy + ph} stroke={ebColor} strokeWidth="3.5" />}
                {hasEB(peca.borda_traseira) && <line x1={ox} y1={oy} x2={ox + pw} y2={oy} stroke={ebColor} strokeWidth="3.5" />}
                {hasEB(peca.borda_dir) && <line x1={ox + pw} y1={oy} x2={ox + pw} y2={oy + ph} stroke={ebColor} strokeWidth="3.5" />}
                {hasEB(peca.borda_esq) && <line x1={ox} y1={oy} x2={ox} y2={oy + ph} stroke={ebColor} strokeWidth="3.5" />}
                {!hasEB(peca.borda_frontal) && <line x1={ox} y1={oy + ph} x2={ox + pw} y2={oy + ph} stroke="#c0bbb0" strokeWidth="0.5" />}
                {!hasEB(peca.borda_traseira) && <line x1={ox} y1={oy} x2={ox + pw} y2={oy} stroke="#c0bbb0" strokeWidth="0.5" />}
                {!hasEB(peca.borda_dir) && <line x1={ox + pw} y1={oy} x2={ox + pw} y2={oy + ph} stroke="#c0bbb0" strokeWidth="0.5" />}
                {!hasEB(peca.borda_esq) && <line x1={ox} y1={oy} x2={ox} y2={oy + ph} stroke="#c0bbb0" strokeWidth="0.5" />}

                {/* 7. COTAS EXTERNAS */}
                <g>
                    <line x1={ox} y1={oy + ph + 4} x2={ox} y2={oy + ph + 20} stroke="#64748b" strokeWidth="0.5" />
                    <line x1={ox + pw} y1={oy + ph + 4} x2={ox + pw} y2={oy + ph + 20} stroke="#64748b" strokeWidth="0.5" />
                    <line x1={ox + 2} y1={oy + ph + 14} x2={ox + pw - 2} y2={oy + ph + 14} stroke="#64748b" strokeWidth="0.8" />
                    <polygon points={`${ox},${oy + ph + 14} ${ox + 5},${oy + ph + 12} ${ox + 5},${oy + ph + 16}`} fill="#64748b" />
                    <polygon points={`${ox + pw},${oy + ph + 14} ${ox + pw - 5},${oy + ph + 12} ${ox + pw - 5},${oy + ph + 16}`} fill="#64748b" />
                    <text x={ox + pw / 2} y={oy + ph + 24} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600" fontFamily="Inter, sans-serif">{comp}</text>
                </g>
                <g>
                    <line x1={ox + pw + 4} y1={oy} x2={ox + pw + 20} y2={oy} stroke="#64748b" strokeWidth="0.5" />
                    <line x1={ox + pw + 4} y1={oy + ph} x2={ox + pw + 20} y2={oy + ph} stroke="#64748b" strokeWidth="0.5" />
                    <line x1={ox + pw + 14} y1={oy + 2} x2={ox + pw + 14} y2={oy + ph - 2} stroke="#64748b" strokeWidth="0.8" />
                    <polygon points={`${ox + pw + 14},${oy} ${ox + pw + 12},${oy + 5} ${ox + pw + 16},${oy + 5}`} fill="#64748b" />
                    <polygon points={`${ox + pw + 14},${oy + ph} ${ox + pw + 12},${oy + ph - 5} ${ox + pw + 16},${oy + ph - 5}`} fill="#64748b" />
                    <text x={ox + pw + 24} y={oy + ph / 2 + 4} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600" fontFamily="Inter, sans-serif"
                        transform={`rotate(-90, ${ox + pw + 24}, ${oy + ph / 2 + 4})`}>{larg}</text>
                </g>

                {/* 8. BADGE */}
                <text x={ox + 4} y={oy - 4} fontSize="9" fill="#64748b" fontWeight="600">
                    {peca.descricao || `P#${peca.id}`} {'\u2014'} {comp}{'\u00d7'}{larg}{'\u00d7'}{esp}mm
                </text>
            </svg>

            {tip && (
                <div style={{
                    position: 'absolute', left: tip.x, top: tip.y, pointerEvents: 'none',
                    background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(8px)',
                    color: '#fff', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif',
                    padding: '8px 12px', borderRadius: 8, lineHeight: 1.6, maxWidth: 220, zIndex: 10,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                }}>
                    {tip.lines.map((l, li) => (
                        <div key={li} style={{ fontWeight: li === 0 ? 700 : 400, fontSize: li === 0 ? 12 : 11 }}>{l}</div>
                    ))}
                </div>
            )}
        </div>
    );
}
