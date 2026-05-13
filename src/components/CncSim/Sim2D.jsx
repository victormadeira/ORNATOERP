// CncSim/Sim2D.jsx — Professional dark-theme 2D G-code canvas simulator  v2 (Sprint 0)
// Highlights: dark CAM background, path-width rendering (actual tool diameter),
// animated glowing tool, color-coded operation categories, pan/zoom, side A/B awareness.
// Sprint 0 additions:
//   • Internal RAF playback loop (playing/speed props are now actually used)
//   • Plunge (↓) and Retract (↑) visual markers distinct from cutting moves
//   • Dobradiça / Onion-skin visual distinction from regular furos

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { getOpCat, getToolDiameter, OP_CATS } from './parseGcode.js';

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEME = {
    bg:          '#090d14',          // deeper navy-black (matches cockpit)
    sheet:       '#2a1f12',          // warm MDF brown
    sheetFill:   '#231a0e',          // base MDF fill (darker)
    sheetMdf:    '#c2a46a',          // MDF golden accent (labels)
    sheetStroke: '#4a3520',          // MDF edge border
    sheetGrain:  'rgba(180,130,70,0.04)', // subtle wood grain
    grid:        'rgba(255,255,255,0.025)',
    refilo:      'rgba(180,130,70,0.35)',
    rapid:       'rgba(200,50,40,0.55)',
    above:       'rgba(20,100,160,0.45)',
    plunge:      'rgba(60,220,120,0.90)',
    retract:     'rgba(80,160,240,0.75)',
    toolBody:    '#e2e8f0',
    toolGlow:    '#fde047',
    toolRing:    '#fde047',
    text:        '#9ba8b8',
    textMuted:   '#546270',
};

function fmtTime(s) {
    if (!s || s < 0) return '0:00.0';
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function Sim2D({
    parsed,
    chapa,
    playing = false,
    speed = 1,
    curTime,         // controlled: parent sets position (seek / sync from 3D)
    totalTime,       // controlled: for display + end detection
    onTimeChange,    // (seconds) → called by internal RAF loop or on seek
    onMoveChange,    // (moveIdx, lineIdx, time) → optional, called on each frame
}) {
    const canvasRef  = useRef(null);
    const wrapRef    = useRef(null);
    const animRef    = useRef(null);

    // Playback state lives in a ref (not state) to avoid re-render on each frame
    const pbRef = useRef({ time: 0, playing: false, speed: 1, lastAt: 0, totalTime: 0 });

    const [dims,     setDims]     = useState({ w: 800, h: 560 });
    const [zoom,     setZoom]     = useState(1);
    const [panOff,   setPanOff]   = useState({ x: 0, y: 0 });
    const [hoverPiece, setHoverPiece] = useState(null);
    const [showRapids,  setShowRapids]  = useState(false);
    const [showPlunge,  setShowPlunge]  = useState(true);   // Sprint 0
    const [showOps,     setShowOps]     = useState(true);
    const [hiddenOps,   setHiddenOps]   = useState(() => new Set());
    const [sideFilter,  setSideFilter]  = useState('all');
    const [autoOrient,  setAutoOrient]  = useState(true);

    const panRef   = useRef(null);
    const touchRef = useRef({ lastDist: 0, lastCenter: null });

    const moves      = parsed?.moves    ?? [];
    const events     = parsed?.events   ?? [];
    const minFeed    = parsed?.minFeed  ?? 0;
    const maxFeed    = parsed?.maxFeed  ?? 1;
    const parsedTotal = parsed?.totalTime ?? 0;

    // Resolve effective totalTime: prop or from parsed
    const effectiveTotal = (totalTime != null && totalTime > 0) ? totalTime : parsedTotal;

    // ── Tool diameter per move ────────────────────────────────────────────────
    const moveToolDiam = useMemo(() => {
        const out = new Array(moves.length).fill(6);
        let cur = 6;
        let evIdx = 0;
        for (let i = 0; i < moves.length; i++) {
            while (evIdx < events.length && events[evIdx].moveIdx <= i) {
                if (events[evIdx].type === 'tool') cur = getToolDiameter(events[evIdx].label);
                evIdx++;
            }
            out[i] = cur;
        }
        return out;
    }, [moves, events]);

    // ── Operation list (for sidebar) ─────────────────────────────────────────
    const opList = useMemo(() => {
        const seen = new Map();
        for (const ev of events) {
            if (ev.type === 'op' && ev.label && !seen.has(ev.label)) {
                seen.set(ev.label, { label: ev.label, moveIdx: ev.moveIdx, cat: getOpCat(ev.label) });
            }
        }
        return [...seen.values()];
    }, [events]);

    // ── Resize observer — fills the actual container height ───────────────────
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            if (width > 0) {
                // Use actual container height when available (flex fill), else aspect ratio
                const h = height > 60 ? height : Math.max(300, Math.round(width * 0.62));
                setDims({ w: width, h });
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Canvas rendering ──────────────────────────────────────────────────────
    const renderCanvas = useCallback((timeSec) => {
        const canvas = canvasRef.current;
        if (!canvas || !moves.length) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.round(dims.w * dpr), H = Math.round(dims.h * dpr);
        if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = THEME.bg;
        ctx.fillRect(0, 0, W, H);

        if (!moves.length) {
            ctx.fillStyle = THEME.text;
            ctx.font = `${13 * dpr}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('Nenhum movimento detectado', W / 2, H / 2);
            return;
        }

        // Bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of moves) {
            minX = Math.min(minX, m.x1, m.x2); minY = Math.min(minY, m.y1, m.y2);
            maxX = Math.max(maxX, m.x1, m.x2); maxY = Math.max(maxY, m.y1, m.y2);
        }

        const cw = chapa?.comprimento ?? 2750;
        const cl = chapa?.largura    ?? 1850;
        if (chapa) { minX = 0; minY = 0; maxX = Math.max(maxX, cw); maxY = Math.max(maxY, cl); }
        const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;

        const doRotate = autoOrient && Boolean(chapa) && cl > cw;
        const fitX = doRotate ? rangeY : rangeX;
        const fitY = doRotate ? rangeX : rangeY;
        const pad = 28 * dpr;
        const sc = Math.min((W - pad * 2) / fitX, (H - pad * 2) / fitY) * zoom;

        const panX = panOff.x * dpr;
        const panY = panOff.y * dpr;
        const offX = pad + panX + ((W - pad * 2) - fitX * sc) / 2;
        const offY = pad + panY + ((H - pad * 2) - fitY * sc) / 2;

        let tx, ty;
        if (doRotate) {
            ctx.save();
            ctx.translate(offX, offY);
            ctx.rotate(Math.PI / 2);
            tx = (v) => (v - minX) * sc;
            ty = (v) => -(v - minY) * sc;
        } else {
            tx = (v) => offX + (v - minX) * sc;
            ty = (v) => offY + (maxY - v) * sc;
        }

        // ── Sheet ────────────────────────────────────────────────────────────
        if (chapa) {
            const sx = tx(0), sy = Math.min(ty(0), ty(cl));
            const sw = cw * sc, sh = cl * sc;

            // Drop shadow behind sheet
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.70)';
            ctx.shadowBlur = 22 * dpr;
            ctx.shadowOffsetX = 5 * dpr;
            ctx.shadowOffsetY = 7 * dpr;
            ctx.fillStyle = 'rgba(0,0,0,0.01)';
            ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
            ctx.restore();

            // MDF base fill — warm brown gradient
            const sheetGrad = ctx.createLinearGradient(sx, sy, sx + sw * 0.5, sy + sh);
            sheetGrad.addColorStop(0,   '#2e2010');
            sheetGrad.addColorStop(0.5, '#271c0d');
            sheetGrad.addColorStop(1,   '#1e1508');
            ctx.fillStyle = sheetGrad;
            ctx.fillRect(sx, sy, sw, sh);

            // Subtle horizontal wood-grain lines
            ctx.save();
            ctx.globalAlpha = 0.032;
            ctx.strokeStyle = '#c8954e';
            ctx.lineWidth = 0.6 * dpr;
            const grainStep = Math.max(8 * dpr, 28 * sc);
            for (let gy = 0; gy < sh; gy += grainStep) {
                ctx.beginPath(); ctx.moveTo(sx, sy + gy); ctx.lineTo(sx + sw, sy + gy); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.restore();

            // Grid overlay (very subtle)
            ctx.save();
            ctx.globalAlpha = 0.04;
            ctx.strokeStyle = '#d4a060';
            ctx.lineWidth = 0.4 * dpr;
            const step = Math.max(20 * dpr, 100 * sc);
            for (let gx = 0; gx < sw; gx += step) {
                ctx.beginPath(); ctx.moveTo(sx + gx, sy); ctx.lineTo(sx + gx, sy + sh); ctx.stroke();
            }
            for (let gy = 0; gy < sh; gy += step) {
                ctx.beginPath(); ctx.moveTo(sx, sy + gy); ctx.lineTo(sx + sw, sy + gy); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.restore();

            // Sheet border — warm amber
            ctx.save();
            ctx.strokeStyle = '#5c3c1a';
            ctx.lineWidth = 2 * dpr;
            ctx.shadowColor = 'rgba(180,110,40,0.20)';
            ctx.shadowBlur = 5 * dpr;
            ctx.strokeRect(sx, sy, sw, sh);
            ctx.restore();

            // Dimension labels
            ctx.save();
            ctx.fillStyle = 'rgba(160,110,55,0.80)';
            ctx.font = `bold ${9 * dpr}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(`${cw} mm`, sx + sw / 2, sy - 5 * dpr);
            ctx.save();
            ctx.translate(sx - 11 * dpr, sy + sh / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.fillText(`${cl} mm`, 0, 0);
            ctx.restore();
            ctx.restore();

            const ref = chapa.refilo ?? 10;
            if (ref > 0) {
                ctx.save();
                ctx.strokeStyle = 'rgba(180,120,50,0.40)';
                ctx.lineWidth = 1.2 * dpr;
                ctx.setLineDash([6 * dpr, 4 * dpr]);
                ctx.strokeRect(tx(ref), ty(cl - ref), (cw - 2 * ref) * sc, (cl - 2 * ref) * sc);
                ctx.setLineDash([]);
                ctx.restore();
            }

            // ── Pieces ────────────────────────────────────────────────────────
            if (chapa.pecas) {
                for (let pi = 0; pi < chapa.pecas.length; pi++) {
                    const p = chapa.pecas[pi];
                    const lado = p.lado_ativo || 'A';
                    const isB = lado === 'B';
                    const filtered = sideFilter !== 'all' && sideFilter !== lado;

                    ctx.globalAlpha = filtered ? 0.18 : 1;
                    const px = tx(ref + p.x);
                    const py = Math.min(ty(ref + p.y), ty(ref + p.y + p.h));
                    const pw = p.w * sc, ph = p.h * sc;

                    // Piece fill: warm amber tint on MDF, blue on face B
                    ctx.fillStyle = isB
                        ? 'rgba(50,90,180,0.22)'
                        : `rgba(200,155,70,${0.22 + (pi % 4) * 0.02})`;
                    ctx.fillRect(px, py, pw, ph);

                    // Piece border
                    ctx.strokeStyle = isB
                        ? `rgba(80,130,240,${hoverPiece === p ? 0.90 : 0.55})`
                        : `rgba(210,160,70,${hoverPiece === p ? 0.95 : 0.60})`;
                    ctx.lineWidth = (hoverPiece === p ? 2.0 : 1.2) * dpr;
                    ctx.strokeRect(px, py, pw, ph);

                    // Piece label (name)
                    if (pw > 28 * dpr && ph > 14 * dpr) {
                        ctx.fillStyle = isB ? 'rgba(130,180,255,0.92)' : 'rgba(215,175,105,0.95)';
                        const fSize = Math.min(10 * dpr, Math.max(7 * dpr, pw / 8));
                        ctx.font = `600 ${fSize}px sans-serif`;
                        ctx.textAlign = 'left';
                        if (p.nome) ctx.fillText(p.nome, px + 4 * dpr, py + fSize + 2 * dpr, pw - 8 * dpr);
                        if (ph > fSize * 2.4) {
                            ctx.fillStyle = isB ? 'rgba(100,150,240,0.55)' : 'rgba(170,130,65,0.60)';
                            ctx.font = `${Math.min(8 * dpr, pw / 9)}px monospace`;
                            ctx.fillText(`${Math.round(p.w)}×${Math.round(p.h)}`, px + 4 * dpr, py + fSize * 2.4, pw - 8 * dpr);
                        }
                    }

                    // Face badge (A/B)
                    if (pw > 16 * dpr && ph > 10 * dpr && !filtered) {
                        const bw = 14 * dpr, bh = 10 * dpr;
                        const bx = px + pw - bw - 2 * dpr, by = py + 2 * dpr;
                        ctx.fillStyle = isB ? 'rgba(40,80,200,0.88)' : 'rgba(120,80,20,0.75)';
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 2 * dpr);
                        else ctx.rect(bx, by, bw, bh);
                        ctx.fill();
                        ctx.fillStyle = isB ? '#c0d8ff' : '#e8c880';
                        ctx.font = `bold ${7 * dpr}px monospace`;
                        ctx.textAlign = 'center';
                        ctx.fillText(lado, bx + bw / 2, by + 7.5 * dpr);
                        ctx.textAlign = 'left';
                    }

                    ctx.globalAlpha = 1;
                }
            }

            // ── Origin axes ────────────────────────────────────────────────────
            const ox = tx(0), oy = ty(0);
            const al = Math.min(40 * dpr, sw * 0.06, sh * 0.06);
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.lineWidth = 1.8 * dpr;

            ctx.strokeStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + al, oy); ctx.stroke();
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.moveTo(ox + al, oy); ctx.lineTo(ox + al - 5*dpr, oy - 3*dpr); ctx.lineTo(ox + al - 5*dpr, oy + 3*dpr); ctx.closePath(); ctx.fill();

            ctx.strokeStyle = '#22c55e'; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - al); ctx.stroke();
            ctx.fillStyle = '#22c55e';
            ctx.beginPath(); ctx.moveTo(ox, oy - al); ctx.lineTo(ox - 3*dpr, oy - al + 5*dpr); ctx.lineTo(ox + 3*dpr, oy - al + 5*dpr); ctx.closePath(); ctx.fill();

            ctx.fillStyle = 'rgba(60,80,60,0.9)';
            ctx.beginPath(); ctx.arc(ox, oy, 3 * dpr, 0, Math.PI * 2); ctx.fill();

            ctx.font = `bold ${8 * dpr}px monospace`;
            ctx.fillStyle = '#ef4444'; ctx.fillText('X', ox + al + 3*dpr, oy + 3*dpr);
            ctx.fillStyle = '#22c55e'; ctx.fillText('Y', ox - 13*dpr, oy - al);
            ctx.globalAlpha = 1;
            ctx.restore();
        }

        // ── Find current move index by time (binary search) ──────────────────
        let curIdx = -1;
        let toolX = moves[0].x1, toolY = moves[0].y1;
        const resolvedTime = timeSec ?? pbRef.current.time;
        if (effectiveTotal > 0 && resolvedTime >= 0) {
            let lo = 0, hi = moves.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >>> 1;
                const m = moves[mid];
                if (resolvedTime < m.tStart) hi = mid - 1;
                else if (resolvedTime > m.tEnd) lo = mid + 1;
                else {
                    curIdx = mid;
                    const u = m.duration > 0 ? (resolvedTime - m.tStart) / m.duration : 1;
                    toolX = m.x1 + (m.x2 - m.x1) * u;
                    toolY = m.y1 + (m.y2 - m.y1) * u;
                    break;
                }
            }
            if (curIdx < 0 && resolvedTime >= effectiveTotal) {
                curIdx = moves.length - 1;
                toolX = moves[curIdx].x2;
                toolY = moves[curIdx].y2;
            }
        }

        const drawLimit = curIdx >= 0 ? curIdx : (resolvedTime <= 0 ? -1 : moves.length - 1);

        // ── Pending moves (ghosted preview of what's still to cut) ───────────
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = drawLimit + 1; i < moves.length; i++) {
            const m = moves[i];
            if (m.type === 'G0' || m.isZOnly) continue;
            if (m.z2 > 0.1) continue;
            if (hiddenOps.has(m.op)) continue;
            const cat = getOpCat(m.op);
            const diam = moveToolDiam[i] ?? 6;
            ctx.strokeStyle = cat.color;
            ctx.lineWidth = Math.max(1.0, diam * sc * 0.55);
            ctx.beginPath();
            ctx.moveTo(tx(m.x1), ty(m.y1));
            ctx.lineTo(tx(m.x2), ty(m.y2));
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // ── Executed moves ────────────────────────────────────────────────────
        if (drawLimit >= 0) {
            // G0 rapids
            if (showRapids) {
                ctx.save();
                ctx.strokeStyle = THEME.rapid;
                ctx.lineWidth = 0.8 * dpr;
                ctx.setLineDash([6 * dpr, 4 * dpr]);
                for (let i = 0; i <= drawLimit; i++) {
                    const m = moves[i];
                    if (m.type !== 'G0' || m.isZOnly) continue;
                    ctx.beginPath();
                    ctx.moveTo(tx(m.x1), ty(m.y1));
                    ctx.lineTo(tx(m.x2), ty(m.y2));
                    ctx.stroke();
                }
                ctx.setLineDash([]);
                ctx.restore();
            }

            // Sprint 0: plunge arrows (green ↓) and retract markers (blue ↑)
            if (showPlunge) {
                for (let i = 0; i <= drawLimit; i++) {
                    const m = moves[i];
                    if (!m.isZOnly) continue;
                    const px_ = tx(m.x2), py_ = ty(m.y2);
                    const r = 4 * dpr;
                    if (m.isPlunge) {
                        // Green downward arrow
                        ctx.save();
                        ctx.strokeStyle = THEME.plunge;
                        ctx.lineWidth = 1.5 * dpr;
                        ctx.globalAlpha = 0.85;
                        ctx.beginPath();
                        ctx.moveTo(px_, py_ - r); ctx.lineTo(px_, py_ + r);
                        ctx.moveTo(px_ - r * 0.6, py_ + r * 0.3); ctx.lineTo(px_, py_ + r);
                        ctx.lineTo(px_ + r * 0.6, py_ + r * 0.3);
                        ctx.stroke();
                        ctx.restore();
                    } else if (m.isRetract) {
                        // Blue upward tick
                        ctx.save();
                        ctx.strokeStyle = THEME.retract;
                        ctx.lineWidth = 1.2 * dpr;
                        ctx.globalAlpha = 0.60;
                        ctx.beginPath();
                        ctx.moveTo(px_, py_ + r * 0.7); ctx.lineTo(px_, py_ - r * 0.7);
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }

            // Above-surface moves (G1, z > 0)
            ctx.save();
            ctx.strokeStyle = THEME.above;
            ctx.lineWidth = 0.8 * dpr;
            for (let i = 0; i <= drawLimit; i++) {
                const m = moves[i];
                if (m.type === 'G0' || m.isZOnly || m.z2 <= 0.1) continue;
                ctx.beginPath();
                ctx.moveTo(tx(m.x1), ty(m.y1));
                ctx.lineTo(tx(m.x2), ty(m.y2));
                ctx.stroke();
            }
            ctx.restore();

            // Cutting moves — colored by op, linewidth = tool diameter
            // Sprint 0: dobradica gets its own visual (circle + cross instead of line)
            const catGroups = new Map();
            const dobradicaMarkers = [];

            for (let i = 0; i <= drawLimit; i++) {
                const m = moves[i];
                if (m.type === 'G0' || m.isZOnly || m.z2 > 0.1) continue;
                if (hiddenOps.has(m.op)) continue;

                // Dobradiça: accumulate center markers from hole metadata
                if (m.isHole && m.isDobradica) {
                    // Only draw once per unique hole center
                    const key = `${m.holeCx?.toFixed(1)}_${m.holeCy?.toFixed(1)}`;
                    if (!dobradicaMarkers.find(d => d.key === key)) {
                        dobradicaMarkers.push({ key, cx: m.holeCx, cy: m.holeCy, diam: m.holeDiam });
                    }
                    continue; // will be rendered as hole symbol, not lines
                }

                const cat = getOpCat(m.op);
                if (!catGroups.has(cat.key)) catGroups.set(cat.key, { cat, segs: [] });
                catGroups.get(cat.key).segs.push({ m, diam: moveToolDiam[i] ?? 6 });
            }

            // Draw regular toolpath categories
            for (const { cat, segs } of catGroups.values()) {
                // Wide glow pass (bloom)
                ctx.save();
                ctx.strokeStyle = cat.glow;
                ctx.globalAlpha = 0.14;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for (const { m, diam } of segs) {
                    ctx.lineWidth = Math.max(4, diam * sc * 2.0);
                    ctx.beginPath();
                    ctx.moveTo(tx(m.x1), ty(m.y1));
                    ctx.lineTo(tx(m.x2), ty(m.y2));
                    ctx.stroke();
                }
                ctx.restore();

                // Tight glow pass
                ctx.save();
                ctx.strokeStyle = cat.glow;
                ctx.globalAlpha = 0.28;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for (const { m, diam } of segs) {
                    ctx.lineWidth = Math.max(2, diam * sc * 1.1);
                    ctx.beginPath();
                    ctx.moveTo(tx(m.x1), ty(m.y1));
                    ctx.lineTo(tx(m.x2), ty(m.y2));
                    ctx.stroke();
                }
                ctx.restore();

                // Core path — crisp, full opacity
                ctx.save();
                ctx.strokeStyle = cat.color;
                ctx.globalAlpha = 1.0;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for (const { m, diam } of segs) {
                    ctx.lineWidth = Math.max(1.8, diam * sc * 0.80);
                    ctx.beginPath();
                    ctx.moveTo(tx(m.x1), ty(m.y1));
                    ctx.lineTo(tx(m.x2), ty(m.y2));
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Sprint 0: Draw dobradiça holes as distinctive circle + cross symbols
            const dobCat = { color: '#f59e0b', glow: '#fbbf24' }; // matches OP_CATS dobradica
            for (const { cx, cy, diam } of dobradicaMarkers) {
                if (cx == null || cy == null) continue;
                const px_ = tx(cx), py_ = ty(cy);
                const r = Math.max(4 * dpr, (diam / 2) * sc);

                // Outer glow ring
                ctx.save();
                ctx.strokeStyle = dobCat.glow;
                ctx.lineWidth = 2.5 * dpr;
                ctx.globalAlpha = 0.30;
                ctx.beginPath(); ctx.arc(px_, py_, r, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();

                // Main ring (amber — unique to dobradiça)
                ctx.save();
                ctx.strokeStyle = dobCat.color;
                ctx.lineWidth = 1.8 * dpr;
                ctx.globalAlpha = 0.92;
                ctx.beginPath(); ctx.arc(px_, py_, r, 0, Math.PI * 2); ctx.stroke();

                // Cross inside the hole (distinctive marker)
                ctx.lineWidth = 1.2 * dpr;
                ctx.globalAlpha = 0.70;
                const cr = r * 0.55;
                ctx.beginPath();
                ctx.moveTo(px_ - cr, py_); ctx.lineTo(px_ + cr, py_);
                ctx.moveTo(px_, py_ - cr); ctx.lineTo(px_, py_ + cr);
                ctx.stroke();

                // Center dot
                ctx.fillStyle = dobCat.color;
                ctx.globalAlpha = 0.85;
                ctx.beginPath(); ctx.arc(px_, py_, 2.5 * dpr, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        }

        // ── Animated tool circle ─────────────────────────────────────────────
        if (curIdx >= 0 && effectiveTotal > 0 && resolvedTime < effectiveTotal) {
            const tx_ = tx(toolX), ty_ = ty(toolY);
            const curM = moves[curIdx];
            const diam = moveToolDiam[curIdx] ?? 6;
            const r = Math.max(4 * dpr, diam / 2 * sc);
            const isCutting = curM && curM.type !== 'G0' && curM.z2 <= 0.1;
            const isPlungingNow = curM?.isPlunge;
            const isRetractingNow = curM?.isRetract;
            const cat = curM ? getOpCat(curM.op) : { color: '#fde047', glow: '#fde047' };

            const toolColor = isPlungingNow ? THEME.plunge
                : isRetractingNow ? THEME.retract
                : isCutting ? cat.color : THEME.toolGlow;
            const toolGlow  = isPlungingNow ? '#88ffbb'
                : isRetractingNow ? '#aaddff'
                : isCutting ? cat.glow : THEME.toolGlow;

            const grad = ctx.createRadialGradient(tx_, ty_, r * 0.4, tx_, ty_, r * 2.5);
            grad.addColorStop(0, `${toolGlow}55`);
            grad.addColorStop(1, `${toolGlow}00`);
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(tx_, ty_, r * 2.5, 0, Math.PI * 2); ctx.fill();

            ctx.save();
            ctx.strokeStyle = toolColor;
            ctx.lineWidth = 1.8 * dpr;
            ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.arc(tx_, ty_, r, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();

            ctx.fillStyle = toolColor;
            ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(tx_, ty_, 2.5 * dpr, 0, Math.PI * 2); ctx.fill();

            if (curM && !curM.isZOnly && (curM.x2 !== curM.x1 || curM.y2 !== curM.y1)) {
                const dx = curM.x2 - curM.x1, dy = curM.y2 - curM.y1;
                const len = Math.hypot(dx, dy);
                const nx = dx / len, ny = -dy / len;
                const arrowLen = r * 1.6;
                const ex = tx_ + nx * arrowLen, ey = ty_ + ny * arrowLen;
                ctx.strokeStyle = toolGlow;
                ctx.lineWidth = 1.5 * dpr;
                ctx.globalAlpha = 0.75;
                ctx.beginPath(); ctx.moveTo(tx_, ty_); ctx.lineTo(ex, ey); ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // Plunge indicator: downward chevron above tool
            if (isPlungingNow) {
                ctx.save();
                ctx.strokeStyle = THEME.plunge;
                ctx.lineWidth = 1.8 * dpr;
                ctx.globalAlpha = 0.9;
                const chevY = ty_ - r * 2.2;
                ctx.beginPath();
                ctx.moveTo(tx_ - r * 0.5, chevY - r * 0.4);
                ctx.lineTo(tx_, chevY);
                ctx.lineTo(tx_ + r * 0.5, chevY - r * 0.4);
                ctx.stroke();
                ctx.restore();
            }
        }

        if (doRotate) ctx.restore();
    }, [moves, chapa, dims, zoom, panOff, showRapids, showPlunge, hiddenOps, sideFilter, autoOrient, moveToolDiam, effectiveTotal, hoverPiece]);

    // ── RAF playback loop ─────────────────────────────────────────────────────
    useEffect(() => {
        pbRef.current.playing  = playing;
        pbRef.current.speed    = speed;
        pbRef.current.totalTime = effectiveTotal;
        if (playing) pbRef.current.lastAt = performance.now();
    }, [playing, speed, effectiveTotal]);

    // Sync external curTime to pbRef so seek works correctly
    useEffect(() => {
        if (curTime != null) pbRef.current.time = curTime;
    }, [curTime]);

    useEffect(() => {
        if (!playing) return;
        let rafId;
        const tick = (now) => {
            if (!pbRef.current.playing) return;
            const dt   = Math.min((now - pbRef.current.lastAt) / 1000, 0.1); // cap 100ms
            pbRef.current.lastAt = now;
            const next = pbRef.current.time + dt * pbRef.current.speed;
            const total = pbRef.current.totalTime;

            if (total > 0 && next >= total) {
                pbRef.current.time = total;
                pbRef.current.playing = false;
                onTimeChange?.(total);
                renderCanvas(total);
                return; // stop loop — parent will set playing=false
            }

            pbRef.current.time = next;
            onTimeChange?.(next);
            renderCanvas(next);
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafId);
    }, [playing, renderCanvas, onTimeChange]);

    // ── Sync external curTime → re-render when paused ────────────────────────
    useEffect(() => {
        if (!playing) renderCanvas(curTime ?? pbRef.current.time);
    }, [playing, renderCanvas, curTime]);

    // ── Mouse pan ─────────────────────────────────────────────────────────────
    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        panRef.current = { startX: e.clientX - panOff.x, startY: e.clientY - panOff.y };
    };
    const onMouseMove = (e) => {
        if (!panRef.current) return;
        setPanOff({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY });
    };
    const onMouseUp = () => { panRef.current = null; };

    // ── Scroll zoom ───────────────────────────────────────────────────────────
    const onWheel = useCallback((e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.88 : 1.14;
        setZoom(z => Math.max(0.3, Math.min(40, z * delta)));
    }, []);
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [onWheel]);

    // ── Touch zoom/pan ────────────────────────────────────────────────────────
    const onTouchStart = (e) => {
        if (e.touches.length === 2) {
            touchRef.current.lastDist = Math.hypot(
                e.touches[1].clientX - e.touches[0].clientX,
                e.touches[1].clientY - e.touches[0].clientY
            );
        } else if (e.touches.length === 1) {
            panRef.current = { startX: e.touches[0].clientX - panOff.x, startY: e.touches[0].clientY - panOff.y };
        }
    };
    const onTouchMove = (e) => {
        if (e.touches.length === 2) {
            const d = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
            if (touchRef.current.lastDist > 0) {
                const ratio = d / touchRef.current.lastDist;
                setZoom(z => Math.max(0.3, Math.min(40, z * ratio)));
            }
            touchRef.current.lastDist = d;
        } else if (e.touches.length === 1 && panRef.current) {
            setPanOff({ x: e.touches[0].clientX - panRef.current.startX, y: e.touches[0].clientY - panRef.current.startY });
        }
    };
    const onTouchEnd = () => { panRef.current = null; touchRef.current.lastDist = 0; };

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
            if (e.key === 'f' || e.key === 'F') { setZoom(1); setPanOff({ x: 0, y: 0 }); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // ── Operation sidebar ─────────────────────────────────────────────────────
    const toggleOp = useCallback((label) => {
        setHiddenOps(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label); else next.add(label);
            return next;
        });
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: '#090d14', height: '100%', minHeight: 0 }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
                padding: '5px 10px', background: '#0d1219',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
            }}>
                <button onClick={() => { setZoom(1); setPanOff({ x: 0, y: 0 }); }} style={btnStyle()}>
                    Fit [F]
                </button>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                <button onClick={() => setShowRapids(p => !p)} style={btnStyle(showRapids, '#e44444')}>
                    G0 Rápido
                </button>

                {/* Sprint 0: plunge/retract toggle */}
                <button onClick={() => setShowPlunge(p => !p)} style={btnStyle(showPlunge, '#3ddc84')}>
                    Plunge ↓↑
                </button>

                <button onClick={() => setAutoOrient(p => !p)} style={btnStyle(autoOrient)}>
                    Auto girar
                </button>

                {chapa?.pecas?.some(p => p.lado_ativo) && (
                    <>
                        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
                        {['all', 'A', 'B'].map(s => (
                            <button key={s} onClick={() => setSideFilter(s)} style={btnStyle(sideFilter === s)}>
                                {s === 'all' ? 'Todos' : `Lado ${s}`}
                            </button>
                        ))}
                    </>
                )}

                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
                <button onClick={() => setShowOps(p => !p)} style={btnStyle(showOps)}>
                    Ops
                </button>

                {moves.length > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#546270', fontFamily: 'monospace' }}>
                        {moves.length} movimentos
                        {effectiveTotal > 0 && ` · ${fmtTime(effectiveTotal)}`}
                    </span>
                )}
            </div>

            {/* Canvas + ops sidebar */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }} ref={wrapRef}>
                <canvas
                    ref={canvasRef}
                    style={{
                        width: dims.w, height: dims.h,
                        cursor: panRef.current ? 'grabbing' : 'crosshair',
                        display: 'block', flex: 1,
                        touchAction: 'none',
                    }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                />

                {/* Operations sidebar */}
                {showOps && opList.length > 0 && (
                    <div style={{
                        width: 185, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)',
                        background: '#0d1219', overflow: 'auto', padding: '8px 0',
                        display: 'flex', flexDirection: 'column', gap: 1,
                    }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#546270', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px 5px' }}>
                            Operações
                        </div>
                        {opList.map(op => {
                            const hidden = hiddenOps.has(op.label);
                            // Sprint 0: dobradiça gets a special icon
                            const isDobr = op.cat.key === 'dobradica';
                            const isOnion = op.cat.key === 'onion_skin';
                            return (
                                <button key={op.label} onClick={() => toggleOp(op.label)} style={{
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    padding: '5px 10px', cursor: 'pointer',
                                    background: 'transparent', border: 'none',
                                    textAlign: 'left', opacity: hidden ? 0.38 : 1,
                                    transition: 'opacity 0.15s',
                                }}>
                                    {/* Category indicator */}
                                    <span style={{
                                        width: isDobr ? 10 : 8,
                                        height: isDobr ? 10 : 8,
                                        borderRadius: isDobr ? '50%' : 2,
                                        flexShrink: 0,
                                        border: isDobr ? `2px solid ${op.cat.color}` : 'none',
                                        background: isDobr ? 'transparent' : op.cat.color,
                                        boxShadow: hidden ? 'none' : `0 0 5px ${op.cat.glow}88`,
                                        position: 'relative',
                                    }}>
                                        {isDobr && (
                                            <span style={{
                                                position: 'absolute', top: '50%', left: '50%',
                                                transform: 'translate(-50%,-50%)',
                                                width: 3, height: 3,
                                                borderRadius: '50%',
                                                background: op.cat.color,
                                            }} />
                                        )}
                                    </span>
                                    <span style={{
                                        fontSize: 10, color: hidden ? '#546270' : '#9ba8b8',
                                        fontWeight: isDobr || isOnion ? 700 : 600,
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap', maxWidth: 138,
                                    }}>
                                        {op.label.replace(/^=+\s*|\s*=+$/g, '').slice(0, 32)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function btnStyle(active = false, activeColor = '#4d8cf6') {
    return {
        padding: '4px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
        borderRadius: 5, border: active ? `1px solid ${activeColor}` : '1px solid rgba(255,255,255,0.12)',
        background: active ? `${activeColor}25` : 'rgba(255,255,255,0.05)',
        color: active ? activeColor : '#7890a8',
        lineHeight: 1.4, whiteSpace: 'nowrap', transition: 'all 0.12s',
    };
}
