// CncSim/Sim2D.jsx — Professional dark-theme 2D G-code canvas simulator
// Highlights: dark CAM background, path-width rendering (actual tool diameter),
// animated glowing tool, color-coded operation categories, pan/zoom, side A/B awareness.

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { getOpCat, getToolDiameter, OP_CATS } from './parseGcode.js';

// ─── Theme ────────────────────────────────────────────────────────────────────
const THEME = {
    bg:         '#111722', // dark blue-black machine enclosure
    sheet:      '#1e2a1a', // very dark green (machined area will be warmer)
    sheetMdf:   '#c2a46a', // uncut MDF — used for piece fills
    sheetStroke:'#3a5040', // sheet border
    grid:       'rgba(255,255,255,0.04)',
    refilo:     'rgba(80,130,100,0.50)',
    rapid:      'rgba(220,60,50,0.60)',  // G0 (thin dashed)
    above:      'rgba(20,120,150,0.55)', // G1 above Z0
    cut:        null,  // G1 cutting — per-op color (see getOpColor)
    toolBody:   '#e2e8f0',
    toolGlow:   '#fde047',
    toolRing:   '#fde047',
    text:       '#9ba8b8',
    textMuted:  '#546270',
};

function fmtTime(s) {
    if (!s || s < 0) return '0:00.0';
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function Sim2D({ parsed, chapa, playing, speed = 1, curTime, totalTime, onTimeChange }) {
    const canvasRef  = useRef(null);
    const wrapRef    = useRef(null);
    const animRef    = useRef(null);
    const pbRef      = useRef({ time: 0, playing: false, speed: 1, lastAt: 0 });

    const [dims,     setDims]     = useState({ w: 800, h: 560 });
    const [zoom,     setZoom]     = useState(1);
    const [panOff,   setPanOff]   = useState({ x: 0, y: 0 });
    const [hoverPiece, setHoverPiece] = useState(null);
    const [showRapids,  setShowRapids]  = useState(false);
    const [heatmap,     setHeatmap]     = useState(false);
    const [showOps,     setShowOps]     = useState(true);
    const [hiddenOps,   setHiddenOps]   = useState(() => new Set());
    const [sideFilter,  setSideFilter]  = useState('all'); // 'all'|'A'|'B'
    const [autoOrient,  setAutoOrient]  = useState(true);

    // Pan interaction refs (avoid re-renders)
    const panRef = useRef(null);
    const touchRef = useRef({ lastDist: 0, lastCenter: null });

    const moves  = parsed?.moves    ?? [];
    const events = parsed?.events   ?? [];
    const minFeed = parsed?.minFeed ?? 0;
    const maxFeed = parsed?.maxFeed ?? 1;
    const allTotalTime = parsed?.totalTime ?? 0;

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

    // ── Resize observer ────────────────────────────────────────────────────────
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const { width } = entries[0].contentRect;
            if (width > 0) {
                const capH = Math.max(300, Math.round(window.innerHeight * 0.52));
                setDims({ w: width, h: Math.min(capH, Math.max(300, Math.round(width * 0.60))) });
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

        // Background
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

        // Auto-orient: rotate if sheet is portrait
        const doRotate = autoOrient && Boolean(chapa) && cl > cw;
        const fitX = doRotate ? rangeY : rangeX;
        const fitY = doRotate ? rangeX : rangeY;
        const pad = 28 * dpr;
        const sc = Math.min((W - pad * 2) / fitX, (H - pad * 2) / fitY) * zoom;

        const panX = panOff.x * dpr;
        const panY = panOff.y * dpr;
        const offX = pad + panX + ((W - pad * 2) - fitX * sc) / 2;
        const offY = pad + panY + ((H - pad * 2) - fitY * sc) / 2;

        // Coordinate transform functions
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

            // Sheet shadow
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = 18 * dpr;
            ctx.shadowOffsetX = 6 * dpr;
            ctx.shadowOffsetY = 8 * dpr;
            ctx.fillStyle = 'rgba(30,42,26,0.01)';
            ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
            ctx.restore();

            // Sheet base — dark green like a CNC vacuum bed / spoilboard
            ctx.fillStyle = '#1c2820';
            ctx.fillRect(sx, sy, sw, sh);

            // Subtle crosshatch pattern (vacuum table look)
            ctx.save();
            ctx.globalAlpha = 0.06;
            ctx.strokeStyle = '#50a070';
            ctx.lineWidth = 0.5 * dpr;
            const step = Math.max(20 * dpr, 100 * sc);
            for (let gx = 0; gx < sw; gx += step) {
                ctx.beginPath(); ctx.moveTo(sx + gx, sy); ctx.lineTo(sx + gx, sy + sh); ctx.stroke();
            }
            for (let gy = 0; gy < sh; gy += step) {
                ctx.beginPath(); ctx.moveTo(sx, sy + gy); ctx.lineTo(sx + sw, sy + gy); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.restore();

            // Sheet border
            ctx.strokeStyle = THEME.sheetStroke;
            ctx.lineWidth = 1.5 * dpr;
            ctx.strokeRect(sx, sy, sw, sh);

            // Dimension labels
            ctx.save();
            ctx.fillStyle = 'rgba(80,120,90,0.9)';
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

            // ── Refilo rectangle ─────────────────────────────────────────
            const ref = chapa.refilo ?? 10;
            if (ref > 0) {
                ctx.strokeStyle = THEME.refilo;
                ctx.lineWidth = 1 * dpr;
                ctx.setLineDash([5 * dpr, 3 * dpr]);
                ctx.strokeRect(tx(ref), ty(cl - ref), (cw - 2 * ref) * sc, (cl - 2 * ref) * sc);
                ctx.setLineDash([]);
            }

            // ── Pieces ────────────────────────────────────────────────────
            if (chapa.pecas) {
                for (let pi = 0; pi < chapa.pecas.length; pi++) {
                    const p = chapa.pecas[pi];
                    const lado = p.lado_ativo || 'A';
                    const isB = lado === 'B';
                    const filtered = sideFilter !== 'all' && sideFilter !== lado;

                    ctx.globalAlpha = filtered ? 0.20 : 1;
                    const px = tx(ref + p.x);
                    const py = Math.min(ty(ref + p.y), ty(ref + p.y + p.h));
                    const pw = p.w * sc, ph = p.h * sc;

                    // Piece fill — warm tan for A, cooler for B
                    ctx.fillStyle = isB
                        ? 'rgba(60,100,180,0.18)'
                        : `rgba(194,164,106,${0.18 + (pi % 3) * 0.03})`;
                    ctx.fillRect(px, py, pw, ph);

                    // Piece border
                    ctx.strokeStyle = isB ? 'rgba(80,130,220,0.65)' : 'rgba(200,168,100,0.55)';
                    ctx.lineWidth = (hoverPiece === p ? 2.2 : 1.0) * dpr;
                    ctx.strokeRect(px, py, pw, ph);

                    // Name
                    if (pw > 28 * dpr && ph > 14 * dpr) {
                        ctx.fillStyle = isB ? 'rgba(120,170,255,0.88)' : 'rgba(200,175,115,0.92)';
                        ctx.font = `600 ${Math.min(10 * dpr, pw / 5)}px sans-serif`;
                        ctx.textAlign = 'left';
                        if (p.nome) ctx.fillText(p.nome, px + 4 * dpr, py + 12 * dpr, pw - 8 * dpr);
                        if (ph > 24 * dpr) {
                            ctx.fillStyle = isB ? 'rgba(100,150,240,0.60)' : 'rgba(160,130,70,0.60)';
                            ctx.font = `${Math.min(8 * dpr, pw / 7)}px monospace`;
                            ctx.fillText(`${Math.round(p.w)}×${Math.round(p.h)}`, px + 4 * dpr, py + 22 * dpr, pw - 8 * dpr);
                        }
                    }

                    // Side badge
                    if (pw > 16 * dpr && ph > 10 * dpr && !filtered) {
                        const bw = 12 * dpr, bh = 10 * dpr;
                        const bx = px + pw - bw - 2 * dpr, by = py + 2 * dpr;
                        ctx.fillStyle = isB ? 'rgba(50,90,200,0.85)' : 'rgba(30,90,55,0.82)';
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 2 * dpr);
                        else ctx.rect(bx, by, bw, bh);
                        ctx.fill();
                        ctx.fillStyle = '#fff';
                        ctx.font = `bold ${7 * dpr}px monospace`;
                        ctx.textAlign = 'center';
                        ctx.fillText(lado, bx + bw / 2, by + 7.5 * dpr);
                        ctx.textAlign = 'left';
                    }

                    ctx.globalAlpha = 1;
                }
            }

            // ── Origin axes ───────────────────────────────────────────────
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

        // ── Toolpath — find current move index by time ───────────────────────
        let curIdx = -1;
        let toolX = moves[0].x1, toolY = moves[0].y1;
        if (allTotalTime > 0 && timeSec >= 0) {
            let lo = 0, hi = moves.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >>> 1;
                const m = moves[mid];
                if (timeSec < m.tStart) hi = mid - 1;
                else if (timeSec > m.tEnd) lo = mid + 1;
                else {
                    curIdx = mid;
                    const u = m.duration > 0 ? (timeSec - m.tStart) / m.duration : 1;
                    toolX = m.x1 + (m.x2 - m.x1) * u;
                    toolY = m.y1 + (m.y2 - m.y1) * u;
                    break;
                }
            }
            if (curIdx < 0 && timeSec >= allTotalTime) {
                curIdx = moves.length - 1;
                toolX = moves[curIdx].x2;
                toolY = moves[curIdx].y2;
            }
        }

        const drawLimit = curIdx >= 0 ? curIdx : (timeSec <= 0 ? -1 : moves.length - 1);

        // ── Draw pending moves (grey/faint, full path preview) ───────────────
        ctx.save();
        ctx.globalAlpha = 0.25;
        for (let i = drawLimit + 1; i < moves.length; i++) {
            const m = moves[i];
            if (m.type === 'G0') continue;
            if (m.z2 > 0.1) continue;
            if (hiddenOps.has(m.op)) continue;
            const cat = getOpCat(m.op);
            const diam = moveToolDiam[i] ?? 6;
            const lw = Math.max(1.5, diam * sc * 0.5);
            ctx.strokeStyle = cat.color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(tx(m.x1), ty(m.y1));
            ctx.lineTo(tx(m.x2), ty(m.y2));
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // ── Draw executed moves ───────────────────────────────────────────────
        // Batch by op category for efficiency
        if (drawLimit >= 0) {
            // Rapid moves (G0) — thin dashed red
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

            // Above-surface moves (G1, z > 0) — thin cyan
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
            // Group by op category for batched fills
            const catGroups = new Map();
            for (let i = 0; i <= drawLimit; i++) {
                const m = moves[i];
                if (m.type === 'G0' || m.isZOnly || m.z2 > 0.1) continue;
                if (hiddenOps.has(m.op)) continue;
                const cat = getOpCat(m.op);
                if (!catGroups.has(cat.key)) catGroups.set(cat.key, { cat, segs: [] });
                catGroups.get(cat.key).segs.push({ m, diam: moveToolDiam[i] ?? 6 });
            }

            for (const { cat, segs } of catGroups.values()) {
                // Outer glow pass
                ctx.save();
                ctx.strokeStyle = cat.glow;
                ctx.globalAlpha = 0.18;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for (const { m, diam } of segs) {
                    const lw = Math.max(3, diam * sc * 1.5);
                    ctx.lineWidth = lw;
                    ctx.beginPath();
                    ctx.moveTo(tx(m.x1), ty(m.y1));
                    ctx.lineTo(tx(m.x2), ty(m.y2));
                    ctx.stroke();
                }
                ctx.restore();

                // Core path
                ctx.save();
                ctx.strokeStyle = cat.color;
                ctx.globalAlpha = 0.92;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                for (const { m, diam } of segs) {
                    const lw = Math.max(1.5, diam * sc * 0.75);
                    ctx.lineWidth = lw;
                    ctx.beginPath();
                    ctx.moveTo(tx(m.x1), ty(m.y1));
                    ctx.lineTo(tx(m.x2), ty(m.y2));
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        // ── Animated tool circle ─────────────────────────────────────────────
        if (curIdx >= 0 && allTotalTime > 0 && timeSec < allTotalTime) {
            const tx_ = tx(toolX), ty_ = ty(toolY);
            const curM = moves[curIdx];
            const diam = moveToolDiam[curIdx] ?? 6;
            const r = Math.max(4 * dpr, diam / 2 * sc);
            const isCutting = curM && curM.type !== 'G0' && curM.z2 <= 0.1;
            const cat = curM ? getOpCat(curM.op) : { color: '#fde047', glow: '#fde047' };

            // Outer glow
            const grad = ctx.createRadialGradient(tx_, ty_, r * 0.4, tx_, ty_, r * 2.5);
            grad.addColorStop(0, `${isCutting ? cat.glow : THEME.toolGlow}55`);
            grad.addColorStop(1, `${isCutting ? cat.glow : THEME.toolGlow}00`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(tx_, ty_, r * 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Tool body ring
            ctx.save();
            ctx.strokeStyle = isCutting ? cat.color : THEME.toolRing;
            ctx.lineWidth = 1.8 * dpr;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(tx_, ty_, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Center dot
            ctx.fillStyle = isCutting ? cat.color : THEME.toolGlow;
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(tx_, ty_, 2.5 * dpr, 0, Math.PI * 2);
            ctx.fill();

            // Direction indicator — arrow along current move direction
            if (curM && (curM.x2 !== curM.x1 || curM.y2 !== curM.y1)) {
                const dx = curM.x2 - curM.x1, dy = curM.y2 - curM.y1;
                const len = Math.hypot(dx, dy);
                const nx = dx / len, ny = -dy / len; // normalized, Y flipped for canvas
                const arrowLen = r * 1.6;
                const ex = tx_ + nx * arrowLen, ey = ty_ + ny * arrowLen;
                ctx.strokeStyle = isCutting ? cat.glow : THEME.toolGlow;
                ctx.lineWidth = 1.5 * dpr;
                ctx.globalAlpha = 0.75;
                ctx.beginPath();
                ctx.moveTo(tx_, ty_);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        if (doRotate) ctx.restore();
    }, [moves, chapa, dims, zoom, panOff, showRapids, hiddenOps, heatmap, sideFilter, autoOrient, moveToolDiam, allTotalTime, hoverPiece]);

    // ── Sync external time → render ───────────────────────────────────────────
    useEffect(() => {
        renderCanvas(curTime ?? 0);
    }, [renderCanvas, curTime]);

    // ── Mouse pan ────────────────────────────────────────────────────────────
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

    // ── Keyboard ──────────────────────────────────────────────────────────────
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
        <div style={{ display: 'flex', flexDirection: 'column', background: '#0c1018' }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
                padding: '6px 12px', background: '#111722',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
                {/* Reset view */}
                <button onClick={() => { setZoom(1); setPanOff({ x: 0, y: 0 }); }} style={btnStyle()}>
                    Fit [F]
                </button>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                {/* Show rapids */}
                <button onClick={() => setShowRapids(p => !p)} style={btnStyle(showRapids, '#e44444')}>
                    G0 Rápido
                </button>

                {/* Auto orient */}
                <button onClick={() => setAutoOrient(p => !p)} style={btnStyle(autoOrient)}>
                    Auto girar
                </button>

                {/* Side filter */}
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

                {/* Move counter */}
                {moves.length > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#546270', fontFamily: 'monospace' }}>
                        {moves.length} movimentos
                    </span>
                )}
            </div>

            {/* Canvas + ops sidebar */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }} ref={wrapRef}>
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
                        width: 180, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)',
                        background: '#0d1219', overflow: 'auto', padding: '8px 0',
                        display: 'flex', flexDirection: 'column', gap: 1,
                    }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#546270', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px 5px' }}>
                            Operações
                        </div>
                        {opList.map(op => {
                            const hidden = hiddenOps.has(op.label);
                            return (
                                <button key={op.label} onClick={() => toggleOp(op.label)} style={{
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    padding: '5px 10px', cursor: 'pointer',
                                    background: 'transparent', border: 'none',
                                    textAlign: 'left', opacity: hidden ? 0.38 : 1,
                                    transition: 'opacity 0.15s',
                                }}>
                                    <span style={{
                                        width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                                        background: op.cat.color,
                                        boxShadow: hidden ? 'none' : `0 0 5px ${op.cat.glow}88`,
                                    }} />
                                    <span style={{
                                        fontSize: 10, color: hidden ? '#546270' : '#9ba8b8',
                                        fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap', maxWidth: 138,
                                    }}>
                                        {op.label.replace(/^=+\s*|\s*=+$/g, '').slice(0, 30)}
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
