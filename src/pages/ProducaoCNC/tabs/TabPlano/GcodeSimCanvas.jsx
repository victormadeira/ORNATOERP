// GcodeSimCanvas — canvas-based CNC toolpath viewer used inside TabPlano modal.
// Same professional CAM visual as GcodeSimWrapper (dark slate + warm MDF + grid).
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { parseGcodeForSim, getOpCat, feedHeatColor } from './parseGcode.js';

export function GcodeSimCanvas({ gcode, chapa }) {
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

        // Dark warm charcoal — machine table
        ctx.fillStyle = '#151210'; ctx.fillRect(0, 0, W, H);

        if (!gcode) {
            ctx.fillStyle = '#8a6030'; ctx.font = '13px sans-serif';
            ctx.fillText('G-Code não disponível', W / 2 - 80, H / 2);
            return;
        }
        if (allMoves.length === 0) {
            ctx.fillStyle = '#8a6030'; ctx.font = '13px sans-serif';
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
            ctx.shadowColor = 'rgba(0,0,0,0.75)';
            ctx.shadowBlur = 16;
            ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 5;
            ctx.fillStyle = '#b89860';
            ctx.fillRect(shX, shY, shW, shH);
            ctx.restore();

            // ── Sheet base — real MDF/MDP natural color ──────────────────────
            ctx.fillStyle = '#c8a86a';
            ctx.fillRect(shX, shY, shW, shH);

            // ── Wood fiber texture (horizontal bands) ────────────────────────
            const grain = ctx.createLinearGradient(shX, shY, shX, shY + shH);
            grain.addColorStop(0,    'rgba(255,235,180,0.18)');
            grain.addColorStop(0.15, 'rgba(255,215,155,0.06)');
            grain.addColorStop(0.32, 'rgba(255,230,175,0.12)');
            grain.addColorStop(0.5,  'rgba(225,185,125,0.04)');
            grain.addColorStop(0.68, 'rgba(250,220,162,0.10)');
            grain.addColorStop(0.85, 'rgba(215,175,115,0.06)');
            grain.addColorStop(1,    'rgba(195,155,95,0.15)');
            ctx.fillStyle = grain;
            ctx.fillRect(shX, shY, shW, shH);

            // ── Ambient lighting ─────────────────────────────────────────────
            const amb = ctx.createRadialGradient(
                shX + shW * 0.2, shY + shH * 0.15, 0,
                shX + shW * 0.7, shY + shH * 0.7, Math.max(shW, shH) * 0.9
            );
            amb.addColorStop(0,   'rgba(255,245,215,0.18)');
            amb.addColorStop(0.5, 'rgba(200,160,100,0.00)');
            amb.addColorStop(1,   'rgba(60,35,10,0.15)');
            ctx.fillStyle = amb;
            ctx.fillRect(shX, shY, shW, shH);

            // ── Grid — 500mm only (clean) ────────────────────────────────────
            ctx.lineWidth = 0.7;
            for (let gx = 500; gx < cw; gx += 500) {
                ctx.globalAlpha = 0.11; ctx.strokeStyle = '#4a2c0a';
                ctx.beginPath(); ctx.moveTo(tx(gx), shY); ctx.lineTo(tx(gx), shY + shH); ctx.stroke();
            }
            for (let gy = 500; gy < cl; gy += 500) {
                ctx.globalAlpha = 0.11; ctx.strokeStyle = '#4a2c0a';
                ctx.beginPath(); ctx.moveTo(shX, ty(gy)); ctx.lineTo(shX + shW, ty(gy)); ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // ── Sheet border ─────────────────────────────────────────────────
            ctx.strokeStyle = 'rgba(65,38,12,0.80)'; ctx.lineWidth = 1.5;
            ctx.strokeRect(shX, shY, shW, shH);

            // ── Dimension labels ─────────────────────────────────────────────
            ctx.save();
            ctx.fillStyle = 'rgba(200,170,105,0.95)'; ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${cw} mm`, shX + shW / 2, shY - 6);
            ctx.save();
            ctx.translate(shX - 10, shY + shH / 2);
            ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
            ctx.fillText(`${cl} mm`, 0, 0);
            ctx.restore();
            ctx.textAlign = 'left';
            ctx.restore();

            // ── Origin marker — TOP-LEFT (Y down = plano de corte convention) ─
            const ox = tx(0), oy = ty(0);
            const axLen = Math.min(36, shW * 0.05, shH * 0.05);
            ctx.globalAlpha = 0.90;
            ctx.strokeStyle = '#e03030'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + axLen, oy); ctx.stroke();
            ctx.fillStyle = '#e03030';
            ctx.beginPath(); ctx.moveTo(ox + axLen, oy); ctx.lineTo(ox + axLen - 4, oy - 2.5); ctx.lineTo(ox + axLen - 4, oy + 2.5); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#30a030'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + axLen); ctx.stroke();
            ctx.fillStyle = '#30a030';
            ctx.beginPath(); ctx.moveTo(ox, oy + axLen); ctx.lineTo(ox - 2.5, oy + axLen - 4); ctx.lineTo(ox + 2.5, oy + axLen - 4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(40,22,6,0.92)'; ctx.globalAlpha = 0.95;
            ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.82; ctx.font = 'bold 8px monospace';
            ctx.fillStyle = '#e03030'; ctx.fillText('X', ox + axLen + 3, oy + 3);
            ctx.fillStyle = '#30a030'; ctx.fillText('Y', ox - 10, oy + axLen + 2);
            ctx.fillStyle = 'rgba(220,190,130,0.88)'; ctx.font = '7px monospace';
            ctx.fillText('0,0', ox + 3, oy - 3);
            ctx.globalAlpha = 1;

            // ── Pieces — subtle warm tints on MDF ───────────────────────────
            if (chapa.pecas) {
                const ref = chapa.refilo || 10;
                const pColors = [
                    'rgba( 40,  80, 180, 0.13)', 'rgba( 40, 130,  70, 0.13)',
                    'rgba(160,  60,  20, 0.11)', 'rgba(110,  40, 160, 0.11)',
                    'rgba(150, 110,   0, 0.12)', 'rgba( 10, 120, 130, 0.12)',
                    'rgba(160,  30,  80, 0.11)', 'rgba( 70, 140,  30, 0.12)',
                ];
                const pBorders = [
                    'rgba( 30, 60,140,0.45)', 'rgba( 20,100, 50,0.45)',
                    'rgba(130, 40, 10,0.40)', 'rgba( 85, 25,130,0.40)',
                    'rgba(120, 85,  0,0.42)', 'rgba(  5, 90,100,0.42)',
                    'rgba(130, 20, 60,0.40)', 'rgba( 50,110, 20,0.42)',
                ];
                for (let i = 0; i < chapa.pecas.length; i++) {
                    const p = chapa.pecas[i];
                    const px = tx(ref + p.x), py = ty(ref + p.y), pw2 = p.w * sc, ph2 = p.h * sc;
                    ctx.fillStyle = pColors[i % pColors.length];
                    ctx.fillRect(px, py, pw2, ph2);
                    ctx.strokeStyle = pBorders[i % pBorders.length]; ctx.lineWidth = 1;
                    ctx.strokeRect(px, py, pw2, ph2);
                    if (p.nome && pw2 > 20 && ph2 > 12) {
                        ctx.fillStyle = 'rgba(40,24,8,0.85)';
                        ctx.font = `600 ${Math.min(10, pw2 / 6)}px sans-serif`;
                        ctx.fillText(p.nome, px + 3, py + 11, pw2 - 6);
                        if (ph2 > 22) {
                            ctx.fillStyle = 'rgba(65,40,12,0.60)';
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
                    ctx.strokeStyle = 'rgba(20,110,55,0.55)'; ctx.lineWidth = 1;
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
                        // Shadow
                        ctx.save();
                        ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = hR * 0.7;
                        ctx.fillStyle = '#0e0602'; ctx.globalAlpha = 0.22;
                        ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();
                        // Dark interior
                        ctx.fillStyle = isThrough ? '#060302' : '#180a02';
                        ctx.globalAlpha = 0.95;
                        ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();
                        // Depth gradient
                        const ihG = ctx.createRadialGradient(hCx - hR*0.35, hCy - hR*0.35, 0, hCx, hCy, hR);
                        ihG.addColorStop(0, 'rgba(255,225,165,0.07)');
                        ihG.addColorStop(0.4, 'rgba(20,8,2,0.22)');
                        ihG.addColorStop(1, 'rgba(0,0,0,0.88)');
                        ctx.fillStyle = ihG; ctx.globalAlpha = 1;
                        ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();
                        // MDF rim
                        ctx.strokeStyle = 'rgba(195,152,72,0.88)'; ctx.lineWidth = Math.max(1, hR * 0.10);
                        ctx.globalAlpha = 0.90;
                        ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.stroke();
                        // Op color inner ring
                        const hInner = hR - Math.max(1.2, hR * 0.12);
                        if (hInner > 0.5) {
                            ctx.strokeStyle = cat.color; ctx.lineWidth = Math.max(0.6, hR * 0.05);
                            ctx.globalAlpha = 0.55;
                            ctx.beginPath(); ctx.arc(hCx, hCy, hInner, 0, Math.PI * 2); ctx.stroke();
                        }
                        ctx.globalAlpha = 1;
                    }
                }
                continue;
            }

            if (m.type === 'G0') {
                if (!m.isZOnly) {
                    ctx.strokeStyle = 'rgba(70,52,25,0.38)'; ctx.lineWidth = 0.7;
                    ctx.setLineDash([3, 4]);
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                    ctx.setLineDash([]);
                }
                rapidDist += dist;
            } else if (m.isZOnly) {
                const depthRatio = Math.min(Math.max((espReal - m.z2) / espReal, 0), 1);
                if (depthRatio > 0.02) {
                    const r = Math.max(3 * sc, 1);
                    const isThrough = depthRatio > 0.9;
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = r * 0.7;
                    ctx.fillStyle = '#100602'; ctx.globalAlpha = 0.22;
                    ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                    ctx.fillStyle = isThrough ? '#060302' : '#1a0a02';
                    ctx.globalAlpha = 0.92;
                    ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();
                    const ihG2 = ctx.createRadialGradient(x2 - r*0.35, y2 - r*0.35, 0, x2, y2, r);
                    ihG2.addColorStop(0, 'rgba(255,220,160,0.06)');
                    ihG2.addColorStop(1, 'rgba(0,0,0,0.88)');
                    ctx.fillStyle = ihG2; ctx.globalAlpha = 1;
                    ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = 'rgba(195,152,72,0.85)'; ctx.lineWidth = Math.max(0.8, r * 0.12);
                    ctx.globalAlpha = 0.88;
                    ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                cutDist += Math.abs(m.z2 - m.z1);
            } else {
                // ── 2.5D groove — dark on light MDF ─────────────────────────
                const depthRatio = Math.min(Math.max((espReal - m.z2) / espReal, 0), 1);
                const kerfW = Math.max(6 * sc * 0.88, 1.2);
                const isPassante = depthRatio > 0.9;

                ctx.strokeStyle = isPassante ? '#100800' : `rgba(26,12,2,${0.72 + depthRatio * 0.25})`;
                ctx.globalAlpha = 0.90 + depthRatio * 0.10;
                ctx.lineWidth = kerfW; ctx.lineCap = 'round'; ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

                const ddx = x2 - x1, ddy = y2 - y1;
                const dlen = Math.sqrt(ddx * ddx + ddy * ddy);
                if (dlen > 0.5 && kerfW > 1.5) {
                    const nx = -ddy / dlen, ny = ddx / dlen;
                    const edgeOff = kerfW * 0.43;
                    // Lit edge
                    ctx.strokeStyle = 'rgba(245,210,148,0.80)';
                    ctx.globalAlpha = 0.38 + depthRatio * 0.32;
                    ctx.lineWidth = Math.max(0.7, kerfW * 0.11); ctx.lineCap = 'butt';
                    ctx.beginPath();
                    ctx.moveTo(x1 + nx * edgeOff, y1 + ny * edgeOff);
                    ctx.lineTo(x2 + nx * edgeOff, y2 + ny * edgeOff);
                    ctx.stroke();
                    // Shadow edge
                    ctx.strokeStyle = 'rgba(0,0,0,0.92)';
                    ctx.globalAlpha = 0.48 + depthRatio * 0.38;
                    ctx.lineWidth = Math.max(0.5, kerfW * 0.07);
                    ctx.beginPath();
                    ctx.moveTo(x1 - nx * edgeOff, y1 - ny * edgeOff);
                    ctx.lineTo(x2 - nx * edgeOff, y2 - ny * edgeOff);
                    ctx.stroke();
                    ctx.lineCap = 'round';
                }
                // Op color stripe — categoria ou heatmap de feed rate
                const stripeColor = heatmapMode ? feedHeatColor(m.feed, minFeed, maxFeed) : cat.color;
                ctx.strokeStyle = stripeColor;
                ctx.globalAlpha = (isPassante ? 0.80 : 0.60) * (0.5 + depthRatio * 0.5);
                ctx.lineWidth = Math.max(kerfW * (heatmapMode ? 0.35 : 0.20), 0.8); ctx.lineCap = 'round';
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
                    ctx.fillStyle = '#f9e2af'; ctx.globalAlpha = 0.6;
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
                ctx.strokeStyle = curCat.color + '40'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 7, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = curCat.color; ctx.beginPath();
                ctx.arc(tx(cur.x2), ty(cur.y2), 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = curCat.color + '60'; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(tx(cur.x2) - 12, ty(cur.y2)); ctx.lineTo(tx(cur.x2) + 12, ty(cur.y2)); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(tx(cur.x2), ty(cur.y2) - 12); ctx.lineTo(tx(cur.x2), ty(cur.y2) + 12); ctx.stroke();
                ctx.fillStyle = curCat.color; ctx.font = '9px monospace';
                ctx.fillText(`X${cur.x2.toFixed(1)} Y${cur.y2.toFixed(1)} Z${cur.z2.toFixed(1)}`, tx(cur.x2) + 9, ty(cur.y2) - 7);
            } else if (moveLimit < 0) {
                const last = allMoves[allMoves.length - 1];
                ctx.fillStyle = '#ef4444'; ctx.beginPath();
                ctx.arc(tx(last.x2), ty(last.y2), 4, 0, Math.PI * 2); ctx.fill();
            }
        }

        // ── HUD ──────────────────────────────────────────────────────────────
        if (moveLimit >= 0) {
            const { tool, op } = getActiveEventsAt(moveLimit);
            const cat = getOpCat(op);
            const hudH = (tool ? 16 : 0) + (op ? 16 : 0) + 10;
            ctx.fillStyle = 'rgba(10,5,2,0.84)'; ctx.fillRect(4, 28, 280, hudH);
            let hy = 44;
            if (tool) { ctx.fillStyle = 'rgba(215,170,95,0.95)'; ctx.font = 'bold 10px monospace'; ctx.fillText(`Tool: ${tool}`, 10, hy); hy += 16; }
            if (op) { ctx.fillStyle = cat.color; ctx.font = 'bold 10px sans-serif'; ctx.fillText(`${cat.label}: ${op}`, 10, hy); }
        }

        // ── Bottom status bar ─────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(10,5,2,0.75)'; ctx.fillRect(0, H - 20, W, 20);
        if (moveLimit >= 0) {
            const pct = allMoves.length > 0 ? (moveLimit + 1) / allMoves.length : 0;
            ctx.fillStyle = 'rgba(195,135,38,0.22)'; ctx.fillRect(0, H - 20, W * pct, 20);
            for (const ev of allEvents) {
                if (ev.type === 'tool') {
                    ctx.fillStyle = 'rgba(215,170,95,0.75)';
                    ctx.fillRect(W * (ev.moveIdx / allMoves.length) - 1, H - 20, 2, 20);
                }
            }
            ctx.fillStyle = 'rgba(215,185,130,0.88)'; ctx.font = '9px monospace';
            ctx.fillText(`Move ${moveLimit + 1}/${allMoves.length}  ·  Rápido: ${(rapidDist / 1000).toFixed(1)}m  ·  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10, H - 5);
        } else {
            ctx.fillStyle = 'rgba(195,165,110,0.72)'; ctx.font = '9px monospace';
            ctx.fillText(`${allMoves.length} movimentos  ·  Rápido: ${(rapidDist / 1000).toFixed(1)}m  ·  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10, H - 5);
        }
    }, [gcode, chapa, allMoves, allEvents, getActiveEventsAt, zoom, panOff, espReal, heatmapMode, minFeed, maxFeed]);

    useEffect(() => { renderCanvas(curMove); }, [curMove, renderCanvas]);

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
        borderRadius: 4, border: '1px solid #3a2010',
        background: '#241808', color: '#c8a870',
        display: 'flex', alignItems: 'center', gap: 3, lineHeight: 1, whiteSpace: 'nowrap',
    };
    const btnAct = { ...btnSt, background: '#c87020', color: '#fff', borderColor: '#c87020' };
    const sepSt = { width: 1, height: 15, background: 'rgba(100,55,15,0.28)', flexShrink: 0, alignSelf: 'center' };

    return (
        <div style={{ position: 'relative' }}>
            {/* Canvas — no floating overlays */}
            <canvas ref={canvasRef} width={760} height={400}
                style={{
                    borderRadius: '8px 8px 0 0', border: '1px solid #2e1c0a',
                    borderBottom: 'none', cursor: panRef.current ? 'grabbing' : 'grab',
                    display: 'block', width: '100%',
                }}
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            />

            {/* Transport + view controls unified bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#1a100a', border: '1px solid #2e1c0a', borderTop: 'none' }}>
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
                    style={{ flex: 1, height: 4, accentColor: '#c87020', cursor: 'pointer' }} />
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                    style={{ ...btnSt, padding: '2px 4px', fontSize: 10 }}>
                    {[0.5,1,2,5,10,20,50].map(v => <option key={v} value={v}>{v}x</option>)}
                </select>
                <span style={{ fontSize: 10, color: '#8a6030', whiteSpace: 'nowrap', minWidth: 68, textAlign: 'right', fontFamily: 'monospace' }}>
                    {curMove >= 0 ? `${curMove + 1}/${allMoves.length}` : `${allMoves.length} mov`}
                </span>
                <div style={sepSt} />
                {/* Zoom controls */}
                <button onClick={() => setZoom(z => Math.max(0.3, z - 0.3))} style={{ ...btnSt, padding: '2px 5px' }}>−</button>
                <span style={{ fontSize: 10, color: '#c8a870', minWidth: 30, textAlign: 'center', fontFamily: 'monospace' }}>{(zoom * 100).toFixed(0)}%</span>
                <button onClick={() => setZoom(z => Math.min(5, z + 0.3))} style={{ ...btnSt, padding: '2px 5px' }}>+</button>
                <button onClick={() => { setZoom(1); setPanOff({ x: 0, y: 0 }); }} style={{ ...btnSt, padding: '2px 6px' }} title="Encaixar (F)">⊡</button>
                {/* Feed heatmap toggle */}
                <button onClick={() => setHeatmapMode(h => !h)}
                    style={{
                        ...btnSt, fontWeight: 700,
                        background: heatmapMode ? 'linear-gradient(90deg,#c03020,#d4a020,#1890d0)' : '#241808',
                        color: heatmapMode ? '#fff' : '#8a6030',
                        border: heatmapMode ? '1px solid #c87020' : '1px solid #3a2010',
                    }}
                    title="Heatmap de velocidade de avanço">Feed</button>
            </div>

            {/* Legend bar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '3px 10px',
                background: '#140c06', borderRadius: '0 0 8px 8px',
                border: '1px solid #2e1c0a', borderTop: 'none', flexWrap: 'wrap',
            }}>
                {heatmapMode ? (
                    <>
                        <span style={{ fontSize: 10, color: '#7a5830' }}>Feed:</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 9, color: '#c03020', fontFamily: 'monospace' }}>{minFeed.toFixed(0)}</span>
                            <span style={{ width: 48, height: 5, borderRadius: 2, background: 'linear-gradient(90deg,#dc3c1e,#dcb41e,#16a050,#1464c0)', display: 'inline-block' }} />
                            <span style={{ fontSize: 9, color: '#1464c0', fontFamily: 'monospace' }}>{maxFeed.toFixed(0)} mm/min</span>
                        </span>
                        <span style={{ fontSize: 10, color: '#c03020', opacity: 0.85 }}>● Rampa</span>
                        <span style={{ fontSize: 10, color: '#d4a020', opacity: 0.85 }}>● Médio</span>
                        <span style={{ fontSize: 10, color: '#16a050', opacity: 0.85 }}>● Corte</span>
                        <span style={{ fontSize: 10, color: '#1464c0', opacity: 0.85 }}>● Rápido</span>
                    </>
                ) : (
                    <>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#7a6040', opacity: 0.65 }}>
                            <span style={{ width: 12, height: 0, borderTop: '1px dashed #7a6040', display: 'inline-block' }} />
                            Rápido
                        </span>
                        {foundOps.map(cat => {
                            const isActive = activeOp && getOpCat(activeOp).key === cat.key;
                            return (
                                <span key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: isActive ? cat.color : '#7a5830', fontWeight: isActive ? 700 : 400, transition: 'all 0.15s' }}>
                                    <span style={{ width: 8, height: 3, borderRadius: 1, background: cat.color, display: 'inline-block', opacity: isActive ? 1 : 0.5 }} />
                                    {cat.label}
                                </span>
                            );
                        })}
                        {foundOps.length === 0 && <span style={{ fontSize: 10, color: '#6a4820' }}>Sem operações</span>}
                    </>
                )}
                {activeTool && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#d4a860', fontWeight: 600 }}>◈ {activeTool}</span>}
            </div>
        </div>
    );
}
