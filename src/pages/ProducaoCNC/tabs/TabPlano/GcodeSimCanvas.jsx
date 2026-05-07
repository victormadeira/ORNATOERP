// GcodeSimCanvas — CNC Cockpit CAM Simulator
// Dark technical viewport, externally controlled playback, forwardRef API.
// Visual: dark #0B0F14 bg, aluminum sheet, blue cut lines, monospace HUD.
import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { parseGcodeForSim, getOpCat, feedHeatColor } from './parseGcode.js';

// ─── CAM color palette (canvas can't use CSS vars) ─────────────────────────
const CAM = {
    bg:        '#0B0F14',
    sheet:     '#1A2332',
    sheetHi:   '#1F2B40',
    gridMinor: 'rgba(47,129,247,0.055)',
    gridMaj:   'rgba(47,129,247,0.14)',
    border:    'rgba(47,129,247,0.55)',
    axisX:     '#F85149',
    axisY:     '#2EA043',
    start:     '#2EA043',
    rapid:     'rgba(139,148,158,0.38)',
    cut:       '#58A6FF',
    cutGlow:   'rgba(88,166,255,0.14)',
    tool:      '#E6EDF3',
    toolGlow:  'rgba(47,129,247,0.38)',
    hud:       'rgba(9,13,20,0.92)',
    text:      '#E6EDF3',
    textDim:   '#7D8794',
    textBlue:  '#79C0FF',
    yellow:    '#D29922',
    dimLabel:  'rgba(121,192,255,0.70)',
    pieceFill: 'rgba(47,129,247,0.06)',
    pieceBdr:  'rgba(88,166,255,0.22)',
    retalho:   'rgba(46,160,67,0.28)',
};

export const GcodeSimCanvas = forwardRef(function GcodeSimCanvas(
    { gcode, chapa, playing: playingProp, speed: speedProp = 1, onPlayEnd, onMoveChange, heatmapMode: heatmapProp },
    ref
) {
    const canvasRef     = useRef(null);
    const animRef       = useRef(null);
    const panRef        = useRef(null);
    const containerRef  = useRef(null);

    const [curMove, setCurMove]   = useState(-1);
    const [zoom, setZoom]         = useState(1);
    const [panOff, setPanOff]     = useState({ x: 0, y: 0 });
    const [heatmap, setHeatmap]   = useState(false);

    const heatmapMode = heatmapProp !== undefined ? heatmapProp : heatmap;

    const parsed   = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const allMoves = parsed.moves;
    const allEvents = parsed.events;
    const minFeed  = parsed.minFeed ?? 0;
    const maxFeed  = parsed.maxFeed ?? 1;
    const espReal  = chapa?.espessura || 18.5;

    // ── Expose control API via ref ──────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset:        () => setCurMove(-1),
        seekTo:       (idx) => setCurMove(Math.max(-1, Math.min(allMoves.length - 1, idx))),
        getTotalMoves: () => allMoves.length,
        getCurMove:   () => curMove,
    }), [allMoves.length, curMove]);

    // ── Animation loop driven by external playing / speed props ─────────────
    useEffect(() => {
        if (animRef.current) clearInterval(animRef.current);
        if (!playingProp) return;
        const interval = Math.max(8, 80 / Math.max(0.1, speedProp));
        animRef.current = setInterval(() => {
            setCurMove(prev => {
                const next = prev < 0 ? 0 : prev + 1;
                if (next >= allMoves.length) {
                    clearInterval(animRef.current);
                    onPlayEnd?.();
                    return allMoves.length - 1;
                }
                return next;
            });
        }, interval);
        return () => clearInterval(animRef.current);
    }, [playingProp, speedProp, allMoves.length, onPlayEnd]);

    // ── Notify parent of move change ────────────────────────────────────────
    useEffect(() => {
        if (!onMoveChange) return;
        const lineIdx = curMove >= 0 ? (allMoves[curMove]?.lineIdx ?? -1) : -1;
        onMoveChange(curMove, lineIdx);
    }, [curMove, onMoveChange, allMoves]);

    // ── Get active events at a given move ───────────────────────────────────
    const getActiveEventsAt = useCallback((moveIdx) => {
        let tool = '', op = '', feed = 0;
        for (const ev of allEvents) {
            if (ev.moveIdx > moveIdx && moveIdx >= 0) break;
            if (ev.type === 'tool') tool = ev.label;
            if (ev.type === 'op') op = ev.label;
        }
        if (moveIdx >= 0 && allMoves[moveIdx]) feed = allMoves[moveIdx].feed || 0;
        return { tool, op, feed };
    }, [allEvents, allMoves]);

    // ── Found ops for legend ────────────────────────────────────────────────
    const foundOps = useMemo(() => {
        const map = new Map();
        for (const m of allMoves) {
            if (m.type === 'G0') continue;
            const cat = getOpCat(m.op);
            if (!map.has(cat.key)) map.set(cat.key, cat);
        }
        return [...map.values()];
    }, [allMoves]);

    // ── Canvas resize observer ──────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width  = el.clientWidth;
            canvas.height = el.clientHeight;
            renderCanvas(curMove);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);// eslint-disable-line react-hooks/exhaustive-deps

    // ── Render ──────────────────────────────────────────────────────────────
    const renderCanvas = useCallback((moveLimit) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width || 800, H = canvas.height || 500;
        ctx.clearRect(0, 0, W, H);

        // ── Dark cockpit background ─────────────────────────────────────────
        ctx.fillStyle = CAM.bg;
        ctx.fillRect(0, 0, W, H);

        // Subtle dot grid on background
        ctx.fillStyle = 'rgba(255,255,255,0.018)';
        const dotStep = 24;
        for (let gx = dotStep / 2; gx < W; gx += dotStep)
            for (let gy = dotStep / 2; gy < H; gy += dotStep)
                ctx.fillRect(gx, gy, 1, 1);

        if (!gcode || allMoves.length === 0) {
            ctx.fillStyle = CAM.textDim;
            ctx.font = '13px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(
                gcode ? 'Nenhum movimento detectado no G-code' : 'G-code não disponível',
                W / 2, H / 2
            );
            ctx.textAlign = 'left';
            return;
        }

        // ── Coordinate space ────────────────────────────────────────────────
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of allMoves) {
            minX = Math.min(minX, m.x1, m.x2); minY = Math.min(minY, m.y1, m.y2);
            maxX = Math.max(maxX, m.x1, m.x2); maxY = Math.max(maxY, m.y1, m.y2);
        }
        const cw = chapa?.comprimento || 2750, cl = chapa?.largura || 1850;
        if (chapa) { minX = 0; minY = 0; maxX = Math.max(maxX, cw); maxY = Math.max(maxY, cl); }
        const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
        const pad = 40;
        const sc = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY) * zoom;
        const offX = pad + panOff.x + ((W - pad * 2) - rangeX * sc) / 2;
        const offY = pad + panOff.y + ((H - pad * 2) - rangeY * sc) / 2;
        const tx = (v) => offX + (v - minX) * sc;
        const ty = (v) => offY + (v - minY) * sc;

        // ── Sheet ───────────────────────────────────────────────────────────
        if (chapa) {
            const shX = tx(0), shY = ty(0), shW = cw * sc, shH = cl * sc;

            // Drop shadow
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = 20;
            ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 6;
            ctx.fillStyle = CAM.sheet;
            ctx.fillRect(shX, shY, shW, shH);
            ctx.restore();

            // Sheet gradient (subtle top-left highlight)
            const sg = ctx.createLinearGradient(shX, shY, shX + shW * 0.6, shY + shH * 0.6);
            sg.addColorStop(0, 'rgba(50,80,130,0.14)');
            sg.addColorStop(1, 'rgba(10,15,25,0.12)');
            ctx.fillStyle = sg;
            ctx.fillRect(shX, shY, shW, shH);

            // Grid lines — minor every 100mm, major every 500mm
            ctx.lineWidth = 0.5;
            for (let gx = 100; gx < cw; gx += 100) {
                const isMaj = gx % 500 === 0;
                ctx.globalAlpha = isMaj ? 1 : 1;
                ctx.strokeStyle = isMaj ? CAM.gridMaj : CAM.gridMinor;
                ctx.lineWidth = isMaj ? 0.6 : 0.4;
                ctx.beginPath(); ctx.moveTo(tx(gx), shY); ctx.lineTo(tx(gx), shY + shH); ctx.stroke();
            }
            for (let gy = 100; gy < cl; gy += 100) {
                const isMaj = gy % 500 === 0;
                ctx.strokeStyle = isMaj ? CAM.gridMaj : CAM.gridMinor;
                ctx.lineWidth = isMaj ? 0.6 : 0.4;
                ctx.beginPath(); ctx.moveTo(shX, ty(gy)); ctx.lineTo(shX + shW, ty(gy)); ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // Sheet border (blue technical)
            ctx.strokeStyle = CAM.border; ctx.lineWidth = 1.2;
            ctx.strokeRect(shX, shY, shW, shH);

            // Dimension labels
            ctx.save();
            ctx.fillStyle = CAM.dimLabel;
            ctx.font = 'bold 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${cw} mm`, shX + shW / 2, shY - 8);
            ctx.translate(shX - 12, shY + shH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`${cl} mm`, 0, 0);
            ctx.restore();

            // Origin axes
            const ox = tx(0), oy = ty(0);
            const axLen = Math.min(40, shW * 0.06, shH * 0.06);
            ctx.globalAlpha = 0.85;
            // X axis — red
            ctx.strokeStyle = CAM.axisX; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + axLen, oy); ctx.stroke();
            ctx.fillStyle = CAM.axisX;
            ctx.beginPath(); ctx.moveTo(ox + axLen, oy); ctx.lineTo(ox + axLen - 5, oy - 3); ctx.lineTo(ox + axLen - 5, oy + 3); ctx.closePath(); ctx.fill();
            // Y axis — green
            ctx.strokeStyle = CAM.axisY; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + axLen); ctx.stroke();
            ctx.fillStyle = CAM.axisY;
            ctx.beginPath(); ctx.moveTo(ox, oy + axLen); ctx.lineTo(ox - 3, oy + axLen - 5); ctx.lineTo(ox + 3, oy + axLen - 5); ctx.closePath(); ctx.fill();
            // Origin dot
            ctx.fillStyle = CAM.text; ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, Math.PI * 2); ctx.fill();
            // Axis labels
            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.fillStyle = CAM.axisX; ctx.fillText('X', ox + axLen + 4, oy + 4);
            ctx.fillStyle = CAM.axisY; ctx.fillText('Y', ox - 11, oy + axLen + 4);
            ctx.font = '7px "JetBrains Mono", monospace';
            ctx.fillStyle = CAM.dimLabel; ctx.fillText('0,0', ox + 4, oy - 4);
            ctx.globalAlpha = 1;

            // Pieces layout
            if (chapa.pecas?.length) {
                const ref = chapa.refilo || 10;
                for (let i = 0; i < chapa.pecas.length; i++) {
                    const p = chapa.pecas[i];
                    const px = tx(ref + p.x), py = ty(ref + p.y), pw = p.w * sc, ph = p.h * sc;
                    ctx.fillStyle = CAM.pieceFill;
                    ctx.fillRect(px, py, pw, ph);
                    ctx.strokeStyle = CAM.pieceBdr; ctx.lineWidth = 0.8;
                    ctx.strokeRect(px, py, pw, ph);
                    if (p.nome && pw > 22 && ph > 14) {
                        ctx.fillStyle = CAM.dimLabel;
                        ctx.font = `500 ${Math.min(9.5, pw / 6)}px "JetBrains Mono", monospace`;
                        ctx.fillText(p.nome, px + 3, py + 11, pw - 6);
                        if (ph > 24) {
                            ctx.fillStyle = 'rgba(88,166,255,0.45)';
                            ctx.font = `${Math.min(8, pw / 8)}px monospace`;
                            ctx.fillText(`${Math.round(p.w)}×${Math.round(p.h)}`, px + 3, py + 21, pw - 6);
                        }
                    }
                }
            }

            // Retalhos
            if (chapa.retalhos?.length) {
                const ref = chapa.refilo || 10;
                ctx.setLineDash([5, 4]);
                for (const r of chapa.retalhos) {
                    ctx.strokeStyle = CAM.retalho; ctx.lineWidth = 1;
                    ctx.strokeRect(tx(ref + r.x), ty(ref + r.y), r.w * sc, r.h * sc);
                }
                ctx.setLineDash([]);
            }
        }

        // ── Draw moves ──────────────────────────────────────────────────────
        const drawCount = moveLimit < 0 ? allMoves.length : Math.min(moveLimit + 1, allMoves.length);
        let rapidDist = 0, cutDist = 0;

        for (let i = 0; i < drawCount; i++) {
            const m = allMoves[i];
            const x1 = tx(m.x1), y1 = ty(m.y1), x2 = tx(m.x2), y2 = ty(m.y2);
            const dist = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
            const cat = getOpCat(m.op);
            const isActive = (i === moveLimit && moveLimit >= 0);

            if (m.type === 'G0') {
                // Rapid — dashed gray
                ctx.strokeStyle = CAM.rapid; ctx.lineWidth = 0.8;
                ctx.setLineDash([4, 5]);
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                ctx.setLineDash([]);
                rapidDist += dist;
            } else {
                // Cut move
                const depthRatio = Math.min(1, Math.max(0, (espReal - m.z2) / espReal));
                const isThrough = depthRatio > 0.88;
                const kerfPx = Math.max(sc * 0.004, 1.0); // thin CAM line, not fat kerf
                const alpha = 0.55 + depthRatio * 0.45;

                // Glow shadow pass
                ctx.strokeStyle = CAM.cutGlow;
                ctx.lineWidth = kerfPx * 4;
                ctx.globalAlpha = 0.35 + depthRatio * 0.25;
                ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

                // Main line — category color or heatmap
                const lineColor = heatmapMode
                    ? feedHeatColor(m.feed, minFeed, maxFeed)
                    : (isThrough ? cat.color : cat.color + 'BB');
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = Math.max(kerfPx, 1.1);
                ctx.globalAlpha = alpha;
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                ctx.globalAlpha = 1;

                // Active move highlight
                if (isActive) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = Math.max(kerfPx * 0.5, 0.8);
                    ctx.globalAlpha = 0.35;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                    ctx.globalAlpha = 1;
                }

                cutDist += dist;
            }
        }
        ctx.setLineDash([]);
        ctx.lineCap = 'round';

        // ── Tool change markers (full view) ─────────────────────────────────
        if (moveLimit < 0) {
            for (const ev of allEvents) {
                if (ev.type !== 'tool' || ev.moveIdx >= allMoves.length) continue;
                const m = allMoves[ev.moveIdx] || allMoves[0];
                const cx = tx(m?.x1 ?? 0), cy = ty(m?.y1 ?? 0);
                ctx.fillStyle = CAM.yellow; ctx.globalAlpha = 0.75;
                ctx.beginPath();
                ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 3, cy);
                ctx.closePath(); ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        // ── Start marker ────────────────────────────────────────────────────
        if (allMoves.length > 0) {
            const first = allMoves[0];
            ctx.fillStyle = CAM.start;
            ctx.beginPath(); ctx.arc(tx(first.x1), ty(first.y1), 3.5, 0, Math.PI * 2); ctx.fill();
        }

        // ── Tool head (current position) ────────────────────────────────────
        if (moveLimit >= 0 && moveLimit < allMoves.length) {
            const cur = allMoves[moveLimit];
            const cx = tx(cur.x2), cy = ty(cur.y2);

            // Outer glow ring
            ctx.strokeStyle = CAM.toolGlow; ctx.lineWidth = 5; ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
            // Blue ring
            ctx.strokeStyle = '#2F81F7'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
            // White center
            ctx.fillStyle = CAM.tool; ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
            // Crosshair
            ctx.strokeStyle = CAM.tool; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.45;
            ctx.beginPath();
            ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
            ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Coord pill
            const coordLabel = `X${cur.x2.toFixed(2)}  Y${cur.y2.toFixed(2)}  Z${cur.z2.toFixed(2)}`;
            ctx.font = '9px "JetBrains Mono", monospace';
            const lw = ctx.measureText(coordLabel).width + 14;
            const lx = Math.min(cx + 12, W - lw - 6);
            const ly = cy - 18 < 12 ? cy + 14 : cy - 18;
            ctx.fillStyle = CAM.hud;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(lx, ly, lw, 14, 3) : ctx.rect(lx, ly, lw, 14);
            ctx.fill();
            ctx.fillStyle = CAM.textBlue;
            ctx.fillText(coordLabel, lx + 7, ly + 10);
        } else if (moveLimit < 0 && allMoves.length > 0) {
            // End marker when fully rendered
            const last = allMoves[allMoves.length - 1];
            ctx.fillStyle = '#F85149';
            ctx.beginPath(); ctx.arc(tx(last.x2), ty(last.y2), 3.5, 0, Math.PI * 2); ctx.fill();
        }

        // ── HUD — top-left (tool + op + stats) ──────────────────────────────
        const { tool, op, feed } = getActiveEventsAt(Math.max(0, moveLimit));
        const cat = getOpCat(op);
        const hudLines = [];
        if (moveLimit >= 0) {
            if (tool) hudLines.push({ text: `◈  ${tool}`, color: CAM.yellow });
            if (op) hudLines.push({ text: `▶  ${cat.label}: ${op}`, color: cat.color || CAM.cut });
            if (feed > 0) hudLines.push({ text: `F  ${feed.toFixed(0)} mm/min`, color: CAM.textDim });
        }
        if (hudLines.length > 0) {
            const hudH = hudLines.length * 16 + 10;
            ctx.fillStyle = CAM.hud;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(6, 32, 260, hudH, 5) : ctx.rect(6, 32, 260, hudH);
            ctx.fill();
            ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
            let hy = 47;
            for (const ln of hudLines) {
                ctx.fillStyle = ln.color;
                ctx.fillText(ln.text, 14, hy, 246);
                hy += 16;
            }
        }

        // ── Progress bar at very bottom of canvas ───────────────────────────
        if (moveLimit >= 0 && allMoves.length > 0) {
            const pct = (moveLimit + 1) / allMoves.length;
            const bh = 3;
            ctx.fillStyle = 'rgba(47,129,247,0.15)'; ctx.fillRect(0, H - bh, W, bh);
            ctx.fillStyle = '#2F81F7'; ctx.fillRect(0, H - bh, W * pct, bh);
            // Tool change ticks on the bar
            for (const ev of allEvents) {
                if (ev.type !== 'tool') continue;
                const bx = W * (ev.moveIdx / allMoves.length);
                ctx.fillStyle = CAM.yellow; ctx.fillRect(bx - 1, H - bh, 2, bh);
            }
        }

    }, [gcode, chapa, allMoves, allEvents, getActiveEventsAt, zoom, panOff, espReal, heatmapMode, minFeed, maxFeed]);

    useEffect(() => { renderCanvas(curMove); }, [curMove, renderCanvas]);

    // ── Pan / Zoom ──────────────────────────────────────────────────────────
    const handleWheel = useCallback((e) => {
        e.preventDefault();
        setZoom(z => Math.max(0.25, Math.min(8, z + (e.deltaY < 0 ? 0.18 : -0.18))));
    }, []);
    const handleMouseDown = useCallback((e) => {
        panRef.current = { sx: e.clientX - panOff.x, sy: e.clientY - panOff.y };
    }, [panOff]);
    const handleMouseMove = useCallback((e) => {
        if (!panRef.current) return;
        setPanOff({ x: e.clientX - panRef.current.sx, y: e.clientY - panRef.current.sy });
    }, []);
    const handleMouseUp = useCallback(() => { panRef.current = null; }, []);

    // ── Keyboard ────────────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'f' || e.key === 'F') {
                if (!e.ctrlKey && !e.metaKey) { setZoom(1); setPanOff({ x: 0, y: 0 }); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── Active cat for legend ───────────────────────────────────────────────
    const { op: activeOp } = curMove >= 0 ? getActiveEventsAt(curMove) : { op: '' };

    return (
        <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: CAM.bg }}>
            <canvas
                ref={canvasRef}
                style={{ flex: 1, display: 'block', cursor: panRef.current ? 'grabbing' : 'crosshair', width: '100%', height: '100%' }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />

            {/* ── Legend chips ─────────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(9,13,20,0.82)', borderRadius: 8,
                border: '1px solid rgba(47,129,247,0.18)',
                padding: '5px 10px', backdropFilter: 'blur(4px)',
                flexWrap: 'wrap', maxWidth: '90%',
            }}>
                {/* Rapid chip */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, color: '#8B949E', fontFamily: '"JetBrains Mono", monospace',
                }}>
                    <svg width={18} height={6}>
                        <line x1={0} y1={3} x2={18} y2={3} stroke="#8B949E" strokeWidth={1} strokeDasharray="4 3" />
                    </svg>
                    Rápido
                </div>
                {foundOps.map(cat => {
                    const isAct = activeOp && getOpCat(activeOp).key === cat.key;
                    return (
                        <div key={cat.key} style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
                            color: isAct ? cat.color : 'rgba(180,190,210,0.55)',
                            fontWeight: isAct ? 700 : 400,
                            transition: 'color 0.15s',
                        }}>
                            <div style={{
                                width: 8, height: 3, borderRadius: 1,
                                background: cat.color, opacity: isAct ? 1 : 0.45,
                            }} />
                            {cat.label}
                        </div>
                    );
                })}
                {foundOps.length === 0 && (
                    <span style={{ fontSize: 10, color: '#7D8794', fontFamily: 'monospace' }}>
                        Aguardando simulação
                    </span>
                )}
            </div>

            {/* ── Zoom hint ────────────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 8, right: 10,
                fontSize: 9.5, color: 'rgba(121,192,255,0.45)',
                fontFamily: '"JetBrains Mono", monospace',
                background: 'rgba(9,13,20,0.70)', padding: '3px 7px', borderRadius: 4,
            }}>
                {(zoom * 100).toFixed(0)}% · scroll=zoom · F=fit
            </div>
        </div>
    );
});
