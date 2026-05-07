// GcodeSimCanvas — canvas-based CNC toolpath viewer used inside TabPlano modal.
// Same professional CAM visual as GcodeSimWrapper (dark slate + warm MDF + grid).
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { parseGcodeForSim, getOpCat, feedHeatColor } from './parseGcode.js';

export function GcodeSimCanvas({ gcode, chapa, onMoveChange }) {
    const canvasRef = useRef(null);
    const [zoom, setZoom] = useState(1);
    const [panOff, setPanOff] = useState({ x: 0, y: 0 });
    const panRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [curMove, setCurMove] = useState(-1);
    const [speed, setSpeed] = useState(1);
    const animRef = useRef(null);
    const [heatmapMode, setHeatmapMode] = useState(false);
    const parsed = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const allMoves = parsed.moves;
    const allEvents = parsed.events;
    const minFeed = parsed.minFeed ?? 0;
    const maxFeed = parsed.maxFeed ?? 1;
    const espReal = chapa?.espessura || 18.5;

    const getActiveEventsAt = useCallback((moveIdx) => {
        let tool = '', op = '';
        for (const ev of allEvents) {
            if (ev.moveIdx > moveIdx && moveIdx >= 0) break;
            if (ev.type === 'tool') tool = ev.label;
            if (ev.type === 'op') op = ev.label;
        }
        return { tool, op };
    }, [allEvents]);

    const foundOps = useMemo(() => {
        const map = new Map();
        for (const m of allMoves) {
            if (m.type === 'G0') continue;
            const cat = getOpCat(m.op);
            if (!map.has(cat.key)) map.set(cat.key, cat);
        }
        return [...map.values()];
    }, [allMoves]);

    const renderCanvas = useCallback((moveLimit, _heatmap) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // ── Dark technical background (CAD/CAM style) ─────────────────────────
        ctx.fillStyle = '#0f1117'; ctx.fillRect(0, 0, W, H);

        // Subtle dot-grid
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        const gridStep = 20;
        for (let gx = 0; gx < W; gx += gridStep)
            for (let gy = 0; gy < H; gy += gridStep)
                ctx.fillRect(gx, gy, 1, 1);

        if (!gcode) {
            ctx.fillStyle = 'rgba(148,163,184,0.6)'; ctx.font = '13px sans-serif';
            ctx.fillText('G-Code não disponível', W / 2 - 80, H / 2);
            return;
        }
        if (allMoves.length === 0) {
            ctx.fillStyle = 'rgba(148,163,184,0.6)'; ctx.font = '13px sans-serif';
            ctx.fillText('Nenhum movimento detectado no G-Code', W / 2 - 140, H / 2);
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of allMoves) {
            minX = Math.min(minX, m.x1, m.x2); minY = Math.min(minY, m.y1, m.y2);
            maxX = Math.max(maxX, m.x1, m.x2); maxY = Math.max(maxY, m.y1, m.y2);
        }
        const cw = chapa?.comprimento || 2750, cl = chapa?.largura || 1850;
        if (chapa) { minX = 0; minY = 0; maxX = Math.max(maxX, cw); maxY = Math.max(maxY, cl); }
        const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
        const pad = 30;
        const sc = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY) * zoom;
        const offX = pad + panOff.x + ((W - pad * 2) - rangeX * sc) / 2;
        const offY = pad + panOff.y + ((H - pad * 2) - rangeY * sc) / 2;
        const tx = (v) => offX + (v - minX) * sc;
        const ty = (v) => offY + (v - minY) * sc;

        if (chapa) {
            const shX = tx(0), shY = ty(0), shW = cw * sc, shH = cl * sc;

            // ── Elevation shadow ─────────────────────────────────────────────
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.65)';
            ctx.shadowBlur = 18;
            ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 6;
            ctx.fillStyle = '#1e2535';
            ctx.fillRect(shX, shY, shW, shH);
            ctx.restore();

            // ── Sheet base — clean light engineering paper / aluminum ─────────
            ctx.fillStyle = '#e8edf5';
            ctx.fillRect(shX, shY, shW, shH);

            // ── Subtle paper-white gradient ───────────────────────────────────
            const sheetGrad = ctx.createLinearGradient(shX, shY, shX + shW, shY + shH);
            sheetGrad.addColorStop(0,   'rgba(255,255,255,0.30)');
            sheetGrad.addColorStop(0.4, 'rgba(255,255,255,0.08)');
            sheetGrad.addColorStop(1,   'rgba(180,190,210,0.15)');
            ctx.fillStyle = sheetGrad;
            ctx.fillRect(shX, shY, shW, shH);

            // ── Grid lines — every 100mm (minor) and 500mm (major) ───────────
            ctx.lineWidth = 0.5;
            for (let gx = 100; gx < cw; gx += 100) {
                const isMaj = gx % 500 === 0;
                ctx.globalAlpha = isMaj ? 0.18 : 0.07;
                ctx.strokeStyle = isMaj ? '#3b82f6' : '#64748b';
                ctx.beginPath(); ctx.moveTo(tx(gx), shY); ctx.lineTo(tx(gx), shY + shH); ctx.stroke();
            }
            for (let gy = 100; gy < cl; gy += 100) {
                const isMaj = gy % 500 === 0;
                ctx.globalAlpha = isMaj ? 0.18 : 0.07;
                ctx.strokeStyle = isMaj ? '#3b82f6' : '#64748b';
                ctx.beginPath(); ctx.moveTo(shX, ty(gy)); ctx.lineTo(shX + shW, ty(gy)); ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // ── Sheet border (blue tech style) ───────────────────────────────
            ctx.strokeStyle = 'rgba(59,130,246,0.55)'; ctx.lineWidth = 1.5;
            ctx.strokeRect(shX, shY, shW, shH);

            // ── Dimension labels ─────────────────────────────────────────────
            ctx.save();
            ctx.fillStyle = 'rgba(71,105,167,0.92)'; ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${cw} mm`, shX + shW / 2, shY - 6);
            ctx.save();
            ctx.translate(shX - 10, shY + shH / 2);
            ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
            ctx.fillText(`${cl} mm`, 0, 0);
            ctx.restore();
            ctx.textAlign = 'left';
            ctx.restore();

            // ── Origin marker — TOP-LEFT ──────────────────────────────────────
            const ox = tx(0), oy = ty(0);
            const axLen = Math.min(36, shW * 0.05, shH * 0.05);
            ctx.globalAlpha = 0.90;
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + axLen, oy); ctx.stroke();
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.moveTo(ox + axLen, oy); ctx.lineTo(ox + axLen - 4, oy - 2.5); ctx.lineTo(ox + axLen - 4, oy + 2.5); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + axLen); ctx.stroke();
            ctx.fillStyle = '#22c55e';
            ctx.beginPath(); ctx.moveTo(ox, oy + axLen); ctx.lineTo(ox - 2.5, oy + axLen - 4); ctx.lineTo(ox + 2.5, oy + axLen - 4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(30,37,53,0.88)'; ctx.globalAlpha = 0.95;
            ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.82; ctx.font = 'bold 8px monospace';
            ctx.fillStyle = '#ef4444'; ctx.fillText('X', ox + axLen + 3, oy + 3);
            ctx.fillStyle = '#22c55e'; ctx.fillText('Y', ox - 10, oy + axLen + 2);
            ctx.fillStyle = 'rgba(71,105,167,0.88)'; ctx.font = '7px monospace';
            ctx.fillText('0,0', ox + 3, oy - 3);
            ctx.globalAlpha = 1;

            // ── Pieces — clean tinted rectangles on light sheet ──────────────
            if (chapa.pecas) {
                const ref = chapa.refilo || 10;
                const pColors = [
                    'rgba( 59,130,246,0.10)', 'rgba( 34,197, 94,0.10)',
                    'rgba(249,115, 22,0.09)', 'rgba(168, 85,247,0.09)',
                    'rgba(234,179,  8,0.09)', 'rgba( 20,184,166,0.09)',
                    'rgba(239, 68, 68,0.09)', 'rgba( 99,102,241,0.09)',
                ];
                const pBorders = [
                    'rgba( 59,130,246,0.40)', 'rgba( 34,197, 94,0.40)',
                    'rgba(249,115, 22,0.38)', 'rgba(168, 85,247,0.38)',
                    'rgba(234,179,  8,0.38)', 'rgba( 20,184,166,0.38)',
                    'rgba(239, 68, 68,0.38)', 'rgba( 99,102,241,0.38)',
                ];
                for (let i = 0; i < chapa.pecas.length; i++) {
                    const p = chapa.pecas[i];
                    const px = tx(ref + p.x), py = ty(ref + p.y), pw2 = p.w * sc, ph2 = p.h * sc;
                    ctx.fillStyle = pColors[i % pColors.length];
                    ctx.fillRect(px, py, pw2, ph2);
                    ctx.strokeStyle = pBorders[i % pBorders.length]; ctx.lineWidth = 1;
                    ctx.strokeRect(px, py, pw2, ph2);
                    if (p.nome && pw2 > 20 && ph2 > 12) {
                        ctx.fillStyle = 'rgba(30,42,75,0.82)';
                        ctx.font = `600 ${Math.min(10, pw2 / 6)}px sans-serif`;
                        ctx.fillText(p.nome, px + 3, py + 11, pw2 - 6);
                        if (ph2 > 22) {
                            ctx.fillStyle = 'rgba(71,105,167,0.65)';
                            ctx.font = `${Math.min(8, pw2 / 8)}px monospace`;
                            ctx.fillText(`${Math.round(p.w)}×${Math.round(p.h)}`, px + 3, py + 21, pw2 - 6);
                        }
                    }
                }
            }
            // ── Retalhos ────────────────────────────────────────────────────
            if (chapa.retalhos) {
                const ref = chapa.refilo || 10;
                ctx.setLineDash([4, 3]);
                for (const r of chapa.retalhos) {
                    ctx.strokeStyle = 'rgba(34,197,94,0.50)'; ctx.lineWidth = 1;
                    ctx.strokeRect(tx(ref + r.x), ty(ref + r.y), r.w * sc, r.h * sc);
                }
                ctx.setLineDash([]);
            }
        }

        const drawCount = moveLimit < 0 ? allMoves.length : Math.min(moveLimit + 1, allMoves.length);
        let rapidDist = 0, cutDist = 0;
        const helicalHoleDrawn = new Set();

        for (let i = 0; i < drawCount; i++) {
            const m = allMoves[i];
            const x1 = tx(m.x1), y1 = ty(m.y1), x2 = tx(m.x2), y2 = ty(m.y2);
            const dist = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
            const cat = getOpCat(m.op);

            // ── Helicoidal holes ─────────────────────────────────────────────
            if (m.isHelicalHole) {
                cutDist += dist;
                const nextIsHelical = i + 1 < drawCount && allMoves[i + 1].isHelicalHole &&
                    Math.abs(allMoves[i + 1].holeCx - m.holeCx) < 1 && Math.abs(allMoves[i + 1].holeCy - m.holeCy) < 1;
                if (!nextIsHelical) {
                    const hKey = `${m.holeCx.toFixed(1)}_${m.holeCy.toFixed(1)}`;
                    if (!helicalHoleDrawn.has(hKey)) {
                        helicalHoleDrawn.add(hKey);
                        const hCx = tx(m.holeCx), hCy = ty(m.holeCy);
                        const hR = Math.max((m.holeDiam / 2) * sc, 1.5);
                        const isThrough = (espReal - m.z2) / espReal > 0.85;
                        // Hole — dark opening on light sheet
                        ctx.save();
                        ctx.shadowColor = 'rgba(0,0,0,0.50)'; ctx.shadowBlur = hR * 0.8;
                        ctx.fillStyle = isThrough ? '#0a0c11' : '#1a2030'; ctx.globalAlpha = 0.92;
                        ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();
                        // Depth gradient
                        const ihG = ctx.createRadialGradient(hCx - hR*0.32, hCy - hR*0.32, 0, hCx, hCy, hR);
                        ihG.addColorStop(0, 'rgba(180,210,255,0.06)');
                        ihG.addColorStop(0.5, 'rgba(10,15,30,0.25)');
                        ihG.addColorStop(1, 'rgba(0,0,0,0.90)');
                        ctx.fillStyle = ihG; ctx.globalAlpha = 1;
                        ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();
                        // Blue tech rim
                        ctx.strokeStyle = 'rgba(59,130,246,0.65)'; ctx.lineWidth = Math.max(1, hR * 0.10);
                        ctx.globalAlpha = 0.88;
                        ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.stroke();
                        // Op color inner ring
                        const hInner = hR - Math.max(1.2, hR * 0.14);
                        if (hInner > 0.5) {
                            ctx.strokeStyle = cat.color; ctx.lineWidth = Math.max(0.6, hR * 0.05);
                            ctx.globalAlpha = 0.60;
                            ctx.beginPath(); ctx.arc(hCx, hCy, hInner, 0, Math.PI * 2); ctx.stroke();
                        }
                        ctx.globalAlpha = 1;
                    }
                }
                continue;
            }

            if (m.type === 'G0') {
                if (!m.isZOnly) {
                    // Rapid move — thin cyan dashed (CAD style)
                    ctx.strokeStyle = 'rgba(34,211,238,0.35)'; ctx.lineWidth = 0.8;
                    ctx.setLineDash([4, 5]);
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                    ctx.setLineDash([]);
                }
                rapidDist += dist;
            } else if (m.isZOnly) {
                const depthRatio = Math.min(Math.max((espReal - m.z2) / espReal, 0), 1);
                if (depthRatio > 0.02) {
                    const r = Math.max(3 * sc, 1);
                    const isThrough = depthRatio > 0.9;
                    // Plunge point — dark circle on light sheet
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = r * 0.8;
                    ctx.fillStyle = isThrough ? '#0f1117' : '#1e2535'; ctx.globalAlpha = 0.90;
                    ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    ctx.strokeStyle = 'rgba(59,130,246,0.65)'; ctx.lineWidth = Math.max(0.8, r * 0.14);
                    ctx.globalAlpha = 0.85;
                    ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                cutDist += Math.abs(m.z2 - m.z1);
            } else {
                // ── Cut move — crisp CAD blue lines on light sheet ────────────
                const depthRatio = Math.min(Math.max((espReal - m.z2) / espReal, 0), 1);
                const kerfW = Math.max(6 * sc * 0.88, 1.2);
                const isPassante = depthRatio > 0.9;

                // Kerf shadow — dark slot cut into the sheet
                ctx.strokeStyle = isPassante
                    ? 'rgba(15,17,23,0.78)'
                    : `rgba(30,37,53,${0.55 + depthRatio * 0.30})`;
                ctx.globalAlpha = 0.88 + depthRatio * 0.12;
                ctx.lineWidth = kerfW; ctx.lineCap = 'round'; ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

                // Kerf edge highlight (subtle light on one side)
                const ddx = x2 - x1, ddy = y2 - y1;
                const dlen = Math.sqrt(ddx * ddx + ddy * ddy);
                if (dlen > 0.5 && kerfW > 1.5) {
                    const nx = -ddy / dlen, ny = ddx / dlen;
                    const edgeOff = kerfW * 0.42;
                    ctx.strokeStyle = 'rgba(200,220,255,0.55)';
                    ctx.globalAlpha = 0.22 + depthRatio * 0.20;
                    ctx.lineWidth = Math.max(0.6, kerfW * 0.10); ctx.lineCap = 'butt';
                    ctx.beginPath();
                    ctx.moveTo(x1 + nx * edgeOff, y1 + ny * edgeOff);
                    ctx.lineTo(x2 + nx * edgeOff, y2 + ny * edgeOff);
                    ctx.stroke();
                    ctx.lineCap = 'round';
                }

                // Op color stripe — categoria ou heatmap
                const stripeColor = heatmapMode ? feedHeatColor(m.feed, minFeed, maxFeed) : cat.color;
                ctx.strokeStyle = stripeColor;
                ctx.globalAlpha = (isPassante ? 0.92 : 0.72) * (0.45 + depthRatio * 0.55);
                ctx.lineWidth = Math.max(kerfW * (heatmapMode ? 0.38 : 0.22), 0.8); ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                ctx.globalAlpha = 1;
                cutDist += dist;
            }
        }
        ctx.setLineDash([]);

        // Tool change markers
        if (moveLimit < 0) {
            for (const ev of allEvents) {
                if (ev.type === 'tool' && ev.moveIdx < allMoves.length) {
                    const m = allMoves[ev.moveIdx] || allMoves[0];
                    const cx = tx(m?.x1 ?? 0), cy = ty(m?.y1 ?? 0);
                    ctx.fillStyle = '#fbbf24'; ctx.globalAlpha = 0.75;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 3, cy);
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
        }

        // Start/end/current markers
        if (allMoves.length > 0) {
            const first = allMoves[0];
            ctx.fillStyle = '#22c55e'; ctx.beginPath();
            ctx.arc(tx(first.x1), ty(first.y1), 4, 0, Math.PI * 2); ctx.fill();

            if (moveLimit >= 0 && moveLimit < allMoves.length) {
                const cur = allMoves[moveLimit];
                const curCat = getOpCat(cur.op);
                ctx.strokeStyle = curCat.color + '40'; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 7, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = curCat.color; ctx.beginPath();
                ctx.arc(tx(cur.x2), ty(cur.y2), 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = curCat.color + '70'; ctx.lineWidth = 0.6;
                ctx.beginPath(); ctx.moveTo(tx(cur.x2) - 12, ty(cur.y2)); ctx.lineTo(tx(cur.x2) + 12, ty(cur.y2)); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(tx(cur.x2), ty(cur.y2) - 12); ctx.lineTo(tx(cur.x2), ty(cur.y2) + 12); ctx.stroke();
                // Coord label — dark pill on canvas
                ctx.fillStyle = 'rgba(15,17,23,0.82)';
                const label = `X${cur.x2.toFixed(1)} Y${cur.y2.toFixed(1)} Z${cur.z2.toFixed(1)}`;
                const lw = label.length * 5.5 + 8;
                ctx.fillRect(tx(cur.x2) + 9, ty(cur.y2) - 16, lw, 13);
                ctx.fillStyle = curCat.color; ctx.font = '9px monospace';
                ctx.fillText(label, tx(cur.x2) + 13, ty(cur.y2) - 6);
            } else if (moveLimit < 0) {
                const last = allMoves[allMoves.length - 1];
                ctx.fillStyle = '#ef4444'; ctx.beginPath();
                ctx.arc(tx(last.x2), ty(last.y2), 4, 0, Math.PI * 2); ctx.fill();
            }
        }

        // ── HUD — dark pill in top-left ───────────────────────────────────────
        if (moveLimit >= 0) {
            const { tool, op } = getActiveEventsAt(moveLimit);
            const cat = getOpCat(op);
            const hudH = (tool ? 16 : 0) + (op ? 16 : 0) + 10;
            ctx.fillStyle = 'rgba(15,17,23,0.88)';
            ctx.beginPath();
            const hudW = 300, rx = 6;
            ctx.roundRect ? ctx.roundRect(4, 28, hudW, hudH, rx) : ctx.rect(4, 28, hudW, hudH);
            ctx.fill();
            let hy = 44;
            if (tool) { ctx.fillStyle = 'rgba(251,191,36,0.95)'; ctx.font = 'bold 10px monospace'; ctx.fillText(`◈ ${tool}`, 12, hy); hy += 16; }
            if (op) { ctx.fillStyle = cat.color; ctx.font = 'bold 10px sans-serif'; ctx.fillText(`${cat.label}: ${op}`, 12, hy); }
        }

        // ── Bottom status bar ─────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(15,17,23,0.80)'; ctx.fillRect(0, H - 20, W, 20);
        if (moveLimit >= 0) {
            const pct = allMoves.length > 0 ? (moveLimit + 1) / allMoves.length : 0;
            ctx.fillStyle = 'rgba(59,130,246,0.20)'; ctx.fillRect(0, H - 20, W * pct, 20);
            for (const ev of allEvents) {
                if (ev.type === 'tool') {
                    ctx.fillStyle = 'rgba(251,191,36,0.70)';
                    ctx.fillRect(W * (ev.moveIdx / allMoves.length) - 1, H - 20, 2, 20);
                }
            }
            ctx.fillStyle = 'rgba(148,163,184,0.88)'; ctx.font = '9px monospace';
            ctx.fillText(`Move ${moveLimit + 1}/${allMoves.length}  ·  Rápido: ${(rapidDist / 1000).toFixed(1)}m  ·  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10, H - 5);
        } else {
            ctx.fillStyle = 'rgba(100,116,139,0.72)'; ctx.font = '9px monospace';
            ctx.fillText(`${allMoves.length} movimentos  ·  Rápido: ${(rapidDist / 1000).toFixed(1)}m  ·  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10, H - 5);
        }
    }, [gcode, chapa, allMoves, allEvents, getActiveEventsAt, zoom, panOff, espReal, heatmapMode, minFeed, maxFeed]);

    useEffect(() => { renderCanvas(curMove); }, [curMove, renderCanvas]);

    // Notifica parent do move atual para sincronizar G-code viewer
    useEffect(() => {
        if (onMoveChange) {
            const lineIdx = curMove >= 0 ? (allMoves[curMove]?.lineIdx ?? -1) : -1;
            onMoveChange(curMove, lineIdx);
        }
    }, [curMove, onMoveChange, allMoves]);

    useEffect(() => {
        if (!playing) { if (animRef.current) clearInterval(animRef.current); return; }
        const interval = Math.max(10, 80 / speed);
        animRef.current = setInterval(() => {
            setCurMove(prev => {
                const next = prev + 1;
                if (next >= allMoves.length) { setPlaying(false); return allMoves.length - 1; }
                return next;
            });
        }, interval);
        return () => { if (animRef.current) clearInterval(animRef.current); };
    }, [playing, speed, allMoves.length]);

    // Keyboard shortcuts
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.key) {
                case ' ': e.preventDefault();
                    if (playing) setPlaying(false);
                    else { if (curMove >= allMoves.length - 1 || curMove < 0) setCurMove(0); setPlaying(true); }
                    break;
                case 'ArrowRight': e.preventDefault(); setPlaying(false); setCurMove(p => Math.min(allMoves.length - 1, (p < 0 ? 0 : p) + 1)); break;
                case 'ArrowLeft': e.preventDefault(); setPlaying(false); setCurMove(p => Math.max(0, (p < 0 ? 0 : p) - 1)); break;
                case 'f': case 'F': if (!e.ctrlKey && !e.metaKey) { setZoom(1); setPanOff({ x: 0, y: 0 }); } break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [playing, curMove, allMoves.length]);

    const handlePlay = () => { if (curMove >= allMoves.length - 1 || curMove < 0) setCurMove(0); setPlaying(true); };
    const handlePause = () => setPlaying(false);
    const handleStop = () => { setPlaying(false); setCurMove(-1); };
    const handleStep = (dir) => { setPlaying(false); setCurMove(p => Math.max(0, Math.min(allMoves.length - 1, (p < 0 ? 0 : p) + dir))); };
    const handleSlider = (e) => { setPlaying(false); setCurMove(parseInt(e.target.value)); };
    const handleWheel = useCallback((e) => { e.preventDefault(); setZoom(z => Math.max(0.3, Math.min(5, z + (e.deltaY < 0 ? 0.15 : -0.15)))); }, []);
    const handleMouseDown = (e) => { panRef.current = { startX: e.clientX - panOff.x, startY: e.clientY - panOff.y }; };
    const handleMouseMove = (e) => { if (panRef.current) setPanOff({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY }); };
    const handleMouseUp = () => { panRef.current = null; };

    const { tool: activeTool, op: activeOp } = curMove >= 0 ? getActiveEventsAt(curMove) : { tool: '', op: '' };

    const btnSt = {
        padding: '3px 7px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        borderRadius: 4, border: '1px solid var(--border)',
        background: 'var(--surface-2)', color: 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', gap: 3, lineHeight: 1, whiteSpace: 'nowrap',
    };
    const btnAct = { ...btnSt, background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' };
    const sepSt = { width: 1, height: 15, background: 'var(--border)', flexShrink: 0, alignSelf: 'center' };

    return (
        <div style={{ position: 'relative' }}>
            {/* Canvas */}
            <canvas ref={canvasRef} width={760} height={400}
                style={{
                    borderRadius: '8px 8px 0 0', border: '1px solid var(--border)',
                    borderBottom: 'none', cursor: panRef.current ? 'grabbing' : 'grab',
                    display: 'block', width: '100%',
                }}
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            />

            {/* Transport + view controls unified bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderTop: 'none' }}>
                {!playing
                    ? <button onClick={handlePlay} style={btnAct} title="Play (Espaço)">▶</button>
                    : <button onClick={handlePause} style={btnAct} title="Pausar">⏸</button>
                }
                <button onClick={handleStop} style={btnSt} title="Parar">⏹</button>
                <div style={sepSt} />
                <button onClick={() => handleStep(-1)} style={btnSt} title="Voltar (←)">⏮</button>
                <button onClick={() => handleStep(1)} style={btnSt} title="Avançar (→)">⏭</button>
                <input type="range" min={0} max={Math.max(0, allMoves.length - 1)}
                    value={curMove < 0 ? 0 : curMove} onChange={handleSlider}
                    style={{ flex: 1, height: 4, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                    style={{ ...btnSt, padding: '2px 4px', fontSize: 10 }}>
                    {[0.5,1,2,5,10,20,50].map(v => <option key={v} value={v}>{v}x</option>)}
                </select>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 68, textAlign: 'right', fontFamily: 'monospace' }}>
                    {curMove >= 0 ? `${curMove + 1}/${allMoves.length}` : `${allMoves.length} mov`}
                </span>
                <div style={sepSt} />
                {/* Zoom controls */}
                <button onClick={() => setZoom(z => Math.max(0.3, z - 0.3))} style={{ ...btnSt, padding: '2px 5px' }}>−</button>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', minWidth: 30, textAlign: 'center', fontFamily: 'monospace' }}>{(zoom * 100).toFixed(0)}%</span>
                <button onClick={() => setZoom(z => Math.min(5, z + 0.3))} style={{ ...btnSt, padding: '2px 5px' }}>+</button>
                <button onClick={() => { setZoom(1); setPanOff({ x: 0, y: 0 }); }} style={{ ...btnSt, padding: '2px 6px' }} title="Encaixar (F)">⊡</button>
                {/* Feed heatmap toggle */}
                <button onClick={() => setHeatmapMode(h => !h)}
                    style={{
                        ...btnSt, fontWeight: 700,
                        background: heatmapMode ? 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#3b82f6)' : 'var(--surface-2)',
                        color: heatmapMode ? '#fff' : 'var(--text-muted)',
                        border: heatmapMode ? '1px solid var(--primary)' : '1px solid var(--border)',
                    }}
                    title="Heatmap de velocidade de avanço">Feed</button>
            </div>

            {/* Legend bar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '3px 10px',
                background: 'var(--surface)', borderRadius: '0 0 8px 8px',
                border: '1px solid var(--border)', borderTop: 'none', flexWrap: 'wrap',
            }}>
                {heatmapMode ? (
                    <>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Feed:</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 9, color: '#ef4444', fontFamily: 'monospace' }}>{minFeed.toFixed(0)}</span>
                            <span style={{ width: 48, height: 5, borderRadius: 2, background: 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#3b82f6)', display: 'inline-block' }} />
                            <span style={{ fontSize: 9, color: '#3b82f6', fontFamily: 'monospace' }}>{maxFeed.toFixed(0)} mm/min</span>
                        </span>
                        <span style={{ fontSize: 10, color: '#ef4444', opacity: 0.85 }}>● Lento</span>
                        <span style={{ fontSize: 10, color: '#f59e0b', opacity: 0.85 }}>● Médio</span>
                        <span style={{ fontSize: 10, color: '#22c55e', opacity: 0.85 }}>● Corte</span>
                        <span style={{ fontSize: 10, color: '#3b82f6', opacity: 0.85 }}>● Rápido</span>
                    </>
                ) : (
                    <>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', opacity: 0.65 }}>
                            <span style={{ width: 12, height: 0, borderTop: '1px dashed rgba(34,211,238,0.55)', display: 'inline-block' }} />
                            Rápido
                        </span>
                        {foundOps.map(cat => {
                            const isActive = activeOp && getOpCat(activeOp).key === cat.key;
                            return (
                                <span key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: isActive ? cat.color : 'var(--text-muted)', fontWeight: isActive ? 700 : 400, transition: 'all 0.15s' }}>
                                    <span style={{ width: 8, height: 3, borderRadius: 1, background: cat.color, display: 'inline-block', opacity: isActive ? 1 : 0.55 }} />
                                    {cat.label}
                                </span>
                            );
                        })}
                        {foundOps.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sem operações</span>}
                    </>
                )}
                {activeTool && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#fbbf24', fontWeight: 600 }}>◈ {activeTool}</span>}
            </div>
        </div>
    );
}
