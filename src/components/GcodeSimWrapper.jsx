// ═══════════════════════════════════════════════════════
// GcodeSimWrapper — CNC Simulator 2D com efeito neon
// ═══════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

// ─── Gcode parser with arc interpolation ───────────────────────────────────
function parseGcodeForSim(text) {
    const moves = [];
    const events = [];
    let x = 0, y = 0, z = 0, mode = 'G0';
    let curTool = '', curOp = '';
    for (const raw of text.split('\n')) {
        const cmtMatch = raw.match(/[;(]\s*(.+?)\s*\)?$/);
        const comment = cmtMatch ? cmtMatch[1] : '';
        if (/troca|ferramenta|tool/i.test(comment)) {
            curTool = comment.replace(/^(Troca:\s*|Ferramenta:\s*|Tool:\s*)/i, '').trim();
            events.push({ moveIdx: moves.length, type: 'tool', label: curTool });
        }
        if (/===|contorno|furo|rebaixo|canal|pocket|usinagem|rasgo|gola|fresagem|sobra/i.test(comment) && !/troca|ferramenta/i.test(comment)) {
            curOp = comment.replace(/^=+\s*|\s*=+$/g, '').trim();
            events.push({ moveIdx: moves.length, type: 'op', label: curOp });
        }
        if (/M3\b|M03\b/i.test(raw) && !/M30/i.test(raw))
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle ON' });
        if (/M5\b|M05\b/i.test(raw))
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle OFF' });
        const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
        if (!line) continue;
        const cmd = line.replace(/^N\d+\s*/, '');
        const gMatch = cmd.match(/G([0-3])\b/i);
        if (gMatch) mode = `G${gMatch[1]}`;
        const xM = cmd.match(/X([+-]?[\d.]+)/i), yM = cmd.match(/Y([+-]?[\d.]+)/i), zM = cmd.match(/Z([+-]?[\d.]+)/i);
        const iM = cmd.match(/I([+-]?[\d.]+)/i), jM = cmd.match(/J([+-]?[\d.]+)/i);
        const newX = xM ? parseFloat(xM[1]) : x, newY = yM ? parseFloat(yM[1]) : y, newZ = zM ? parseFloat(zM[1]) : z;
        if (xM || yM || zM) {
            const isZOnly = !xM && !yM && zM;
            if ((mode === 'G2' || mode === 'G3') && (iM || jM)) {
                // Interpolate arc into line segments
                const ci = iM ? parseFloat(iM[1]) : 0, cj = jM ? parseFloat(jM[1]) : 0;
                const cx = x + ci, cy = y + cj;
                const r = Math.sqrt(ci * ci + cj * cj);
                let startA = Math.atan2(y - cy, x - cx);
                let endA = Math.atan2(newY - cy, newX - cx);
                const cw = mode === 'G2'; // clockwise
                // Full circle detection: start ≈ end
                const dx = newX - x, dy = newY - y;
                const isFullCircle = Math.sqrt(dx * dx + dy * dy) < 0.1;
                if (isFullCircle) {
                    endA = cw ? startA - Math.PI * 2 : startA + Math.PI * 2;
                } else {
                    if (cw && endA >= startA) endA -= Math.PI * 2;
                    if (!cw && endA <= startA) endA += Math.PI * 2;
                }
                const totalAngle = Math.abs(endA - startA);
                const steps = Math.max(Math.round(totalAngle / (Math.PI / 18)), 4); // ~10° per step
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const a = startA + (endA - startA) * t;
                    const sx = cx + r * Math.cos(a), sy = cy + r * Math.sin(a);
                    const sz = z + (newZ - z) * t;
                    moves.push({ type: mode, x1: s === 1 ? x : moves[moves.length - 1].x2, y1: s === 1 ? y : moves[moves.length - 1].y2, z1: s === 1 ? z : moves[moves.length - 1].z2, x2: sx, y2: sy, z2: sz, tool: curTool, op: curOp, isZOnly: false, isArc: true });
                }
            } else {
                moves.push({ type: mode, x1: x, y1: y, z1: z, x2: newX, y2: newY, z2: newZ, tool: curTool, op: curOp, isZOnly });
            }
        }
        x = newX; y = newY; z = newZ;
    }
    return { moves, events };
}

// ─── Operation categories with neon colors ─────────────────────────────────
const OP_CATS = [
    { key: 'contorno', pat: /contorno/i, color: '#39ff14', glow: '#39ff14', label: 'Contorno' },
    { key: 'rebaixo',  pat: /rebaixo/i,  color: '#00bfff', glow: '#00bfff', label: 'Rebaixo' },
    { key: 'canal',    pat: /canal/i,    color: '#bf5af2', glow: '#bf5af2', label: 'Canal' },
    { key: 'furo',     pat: /furo/i,     color: '#ff3b30', glow: '#ff3b30', label: 'Furo' },
    { key: 'pocket',   pat: /pocket/i,   color: '#ff9f0a', glow: '#ff9f0a', label: 'Pocket' },
    { key: 'rasgo',    pat: /rasgo/i,    color: '#30d5c8', glow: '#30d5c8', label: 'Rasgo' },
    { key: 'gola',     pat: /gola/i,     color: '#ffcc02', glow: '#ffcc02', label: 'Gola' },
    { key: 'fresagem', pat: /fresagem/i, color: '#64d2ff', glow: '#64d2ff', label: 'Fresagem' },
];
function getOpCat(op) {
    const lo = (op || '').toLowerCase();
    for (const c of OP_CATS) { if (c.pat.test(lo)) return c; }
    return { key: 'outro', color: '#a6adc8', glow: '#a6adc8', label: 'Outro' };
}

function getToolDiameterFromName(name) {
    const m = name.match(/(\d+)\s*mm/i);
    return m ? parseInt(m[1]) : 6;
}

// ─── Shared control bar styles ──────────────────────────────────────────────
const CTRL = {
    bar: {
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px', background: 'var(--bg-card, #1e1e2e)',
        borderLeft: '1px solid var(--border, #333)', borderRight: '1px solid var(--border, #333)',
    },
    btn: {
        padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        borderRadius: 5, border: '1px solid var(--border, #444)',
        background: 'var(--bg-muted, #2a2a3a)', color: 'var(--text-primary, #cdd6f4)',
        display: 'flex', alignItems: 'center', gap: 3,
        transition: 'all 0.15s', lineHeight: 1,
    },
    btnAct: {
        padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        borderRadius: 5, border: '1px solid #1379F0',
        background: '#1379F0', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 3,
        transition: 'all 0.15s', lineHeight: 1,
    },
    legend: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 12px', background: 'var(--bg-card, #1e1e2e)',
        borderRadius: '0 0 8px 8px',
        border: '1px solid var(--border, #333)', borderTop: 'none',
        flexWrap: 'wrap',
    },
};

// ═════════════════════════════════════════════════════════════════════════════
// High-res 2D Canvas Simulator with neon lightsaber cuts
// ═════════════════════════════════════════════════════════════════════════════
export default function GcodeSimWrapper({ gcode, chapa }) {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const [dims, setDims] = useState({ w: 900, h: 520 });
    const [zoom, setZoom] = useState(1);
    const [panOff, setPanOff] = useState({ x: 0, y: 0 });
    const panRef = useRef(null);
    const touchRef = useRef({ lastDist: 0, lastCenter: null, touching: false });
    const [playing, setPlaying] = useState(false);
    const [curMove, setCurMove] = useState(-1);
    const [speed, setSpeed] = useState(1);
    const [simMode, setSimMode] = useState('usinagem');
    const [fullscreen, setFullscreen] = useState(false);
    const [hoverInfo, setHoverInfo] = useState(null); // { x, y, piece }
    const animRef = useRef(null);
    const parsed = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const allMoves = parsed.moves;
    const allEvents = parsed.events;
    const espReal = chapa?.espessura || 18.5;

    // Tool diameters per move
    const moveToolDiams = useMemo(() => {
        const diams = [];
        let curDiam = 6;
        for (let i = 0; i < allMoves.length; i++) {
            for (const ev of allEvents) {
                if (ev.moveIdx === i && ev.type === 'tool') {
                    curDiam = getToolDiameterFromName(ev.label);
                }
            }
            diams.push(curDiam);
        }
        return diams;
    }, [allMoves, allEvents]);

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

    // ─── Dynamic resolution ───────────────────────────────────────────────
    useEffect(() => {
        if (fullscreen) {
            const update = () => setDims({ w: window.innerWidth, h: window.innerHeight - 90 });
            update();
            window.addEventListener('resize', update);
            return () => window.removeEventListener('resize', update);
        } else {
            const el = wrapRef.current;
            if (!el) return;
            const ro = new ResizeObserver(entries => {
                const { width } = entries[0].contentRect;
                if (width > 0) setDims({ w: width, h: Math.round(width * 0.55) });
            });
            ro.observe(el);
            return () => ro.disconnect();
        }
    }, [fullscreen]);

    // ESC to exit fullscreen
    useEffect(() => {
        if (!fullscreen) return;
        const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    // ─── Render ───────────────────────────────────────────────────────────
    const renderCanvas = useCallback((moveLimit) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const W = Math.round(dims.w * dpr);
        const H = Math.round(dims.h * dpr);
        canvas.width = W;
        canvas.height = H;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        // Dark background with subtle grain
        ctx.fillStyle = '#0d0d15'; ctx.fillRect(0, 0, W, H);

        if (!gcode || allMoves.length === 0) {
            ctx.fillStyle = '#6c7086'; ctx.font = `${14 * dpr}px sans-serif`;
            ctx.fillText(gcode ? 'Nenhum movimento detectado' : 'G-Code nao disponivel', W / 2 - 120 * dpr, H / 2);
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
        const pad = 24 * dpr;
        const sc = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY) * zoom;
        const panScaleX = panOff.x * dpr, panScaleY = panOff.y * dpr;
        const offX = pad + panScaleX + ((W - pad * 2) - rangeX * sc) / 2;
        const offY = pad + panScaleY + ((H - pad * 2) - rangeY * sc) / 2;
        const tx = (v) => offX + (v - minX) * sc;
        const ty = (v) => offY + (v - minY) * sc;

        const isUsinagem = simMode === 'usinagem';

        // ── Sheet ──────────────────────────────────────────────────────
        if (chapa) {
            // Sheet surface — wood-like dark
            const shX = tx(0), shY = ty(0), shW = cw * sc, shH = cl * sc;
            ctx.fillStyle = '#1a1a28';
            ctx.fillRect(shX, shY, shW, shH);
            // Subtle inner shadow
            const shGrad = ctx.createLinearGradient(shX, shY, shX, shY + shH);
            shGrad.addColorStop(0, 'rgba(255,255,255,0.03)');
            shGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
            ctx.fillStyle = shGrad;
            ctx.fillRect(shX, shY, shW, shH);
            // Border
            ctx.strokeStyle = '#333355'; ctx.lineWidth = 1.5 * dpr;
            ctx.strokeRect(shX, shY, shW, shH);

            // ── X0 Y0 origin marker (bottom-left of sheet) ──
            const ox = tx(0), oy = ty(0);
            const axLen = Math.min(40 * dpr, shW * 0.06, shH * 0.06);
            // X axis arrow (horizontal)
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5 * dpr; ctx.globalAlpha = 0.8;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + axLen, oy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ox + axLen, oy); ctx.lineTo(ox + axLen - 4 * dpr, oy - 3 * dpr); ctx.lineTo(ox + axLen - 4 * dpr, oy + 3 * dpr); ctx.closePath();
            ctx.fillStyle = '#ef4444'; ctx.fill();
            // Y axis arrow (vertical)
            ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.5 * dpr;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + axLen); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ox, oy + axLen); ctx.lineTo(ox - 3 * dpr, oy + axLen - 4 * dpr); ctx.lineTo(ox + 3 * dpr, oy + axLen - 4 * dpr); ctx.closePath();
            ctx.fillStyle = '#22c55e'; ctx.fill();
            // Origin dot
            ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.arc(ox, oy, 3 * dpr, 0, Math.PI * 2); ctx.fill();
            // Labels
            ctx.globalAlpha = 0.7;
            ctx.font = `bold ${9 * dpr}px monospace`;
            ctx.fillStyle = '#ef4444'; ctx.fillText('X', ox + axLen + 3 * dpr, oy + 4 * dpr);
            ctx.fillStyle = '#22c55e'; ctx.fillText('Y', ox - 4 * dpr, oy + axLen + 12 * dpr);
            ctx.fillStyle = '#888'; ctx.font = `${8 * dpr}px monospace`;
            ctx.fillText('0,0', ox + 5 * dpr, oy - 5 * dpr);
            ctx.globalAlpha = 1;

            // Pieces
            if (chapa.pecas) {
                const ref = chapa.refilo || 10;
                const pColors = ['#1e2a45', '#1e3530', '#2e281e', '#281e38', '#1e2e35', '#2e281e', '#1e2840', '#2a1e20'];
                for (let i = 0; i < chapa.pecas.length; i++) {
                    const p = chapa.pecas[i];
                    const px = tx(ref + p.x), py = ty(ref + p.y), pw2 = p.w * sc, ph2 = p.h * sc;
                    ctx.fillStyle = pColors[i % pColors.length];
                    ctx.fillRect(px, py, pw2, ph2);
                    // Top highlight
                    ctx.fillStyle = 'rgba(255,255,255,0.025)';
                    ctx.fillRect(px, py, pw2, Math.min(ph2, 3 * dpr));
                    // Border
                    ctx.strokeStyle = 'rgba(80,130,220,0.25)'; ctx.lineWidth = 0.8 * dpr;
                    ctx.strokeRect(px, py, pw2, ph2);
                    if (p.nome && pw2 > 40 * dpr && ph2 > 16 * dpr) {
                        ctx.fillStyle = 'rgba(130,170,250,0.35)'; ctx.font = `${Math.min(11 * dpr, pw2 / 6)}px sans-serif`;
                        ctx.fillText(p.nome, px + 4 * dpr, py + 14 * dpr, pw2 - 8 * dpr);
                    }
                }
            }
            // Scraps
            if (chapa.retalhos) {
                const ref = chapa.refilo || 10;
                ctx.setLineDash([5 * dpr, 4 * dpr]);
                for (const r of chapa.retalhos) {
                    ctx.strokeStyle = 'rgba(34,197,94,0.4)'; ctx.lineWidth = 1 * dpr;
                    ctx.strokeRect(tx(ref + r.x), ty(ref + r.y), r.w * sc, r.h * sc);
                }
                ctx.setLineDash([]);
            }
        }

        // ── Moves ──────────────────────────────────────────────────────
        const drawCount = moveLimit < 0 ? allMoves.length : Math.min(moveLimit + 1, allMoves.length);
        let rapidDist = 0, cutDist = 0;

        for (let i = 0; i < drawCount; i++) {
            const m = allMoves[i];
            const x1 = tx(m.x1), y1 = ty(m.y1), x2 = tx(m.x2), y2 = ty(m.y2);
            const dist = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
            const toolD = moveToolDiams[i];

            if (m.type === 'G0') {
                // Rapids — dashed yellow lines (visible in both modes)
                if (!m.isZOnly) {
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
                    ctx.strokeStyle = isUsinagem ? 'rgba(255,200,100,0.3)' : 'rgba(255,200,100,0.55)';
                    ctx.lineWidth = (isUsinagem ? 0.6 : 1.0) * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
                    ctx.stroke(); ctx.setLineDash([]);
                }
                rapidDist += dist;
            } else if (m.isZOnly) {
                // ── Furo (hole) — real diameter circle, proportional ──
                const cat = getOpCat(m.op);
                const depth = espReal - m.z2;
                const depthRatio = Math.min(Math.max(depth / espReal, 0), 1);
                if (depthRatio > 0.02) {
                    const r = Math.max((toolD / 2) * sc, 1 * dpr);
                    const neonColor = cat.glow;
                    const isThrough = depthRatio > 0.9;
                    // Fill intensity scales with depth — deeper = more opaque fill
                    const fillAlpha = 0.15 + depthRatio * 0.45; // 0.15..0.60
                    if (isUsinagem) {
                        // Solid color fill — uses operation color so rebaixo=cyan, furo=red, etc.
                        ctx.fillStyle = neonColor;
                        ctx.globalAlpha = fillAlpha;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();
                        // Solid ring border
                        ctx.strokeStyle = neonColor;
                        ctx.lineWidth = Math.max(1.2 * dpr, r * 0.25);
                        ctx.globalAlpha = 0.8 + depthRatio * 0.2;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.stroke();
                        // Glow
                        ctx.save();
                        ctx.shadowColor = neonColor;
                        ctx.shadowBlur = 8 * dpr * depthRatio;
                        ctx.strokeStyle = neonColor;
                        ctx.lineWidth = 0.5 * dpr;
                        ctx.globalAlpha = 0.4 * depthRatio;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.stroke();
                        ctx.restore();
                        // Cross marker for through-holes
                        if (isThrough && r > 2 * dpr) {
                            ctx.strokeStyle = '#fff';
                            ctx.lineWidth = 0.8 * dpr;
                            ctx.globalAlpha = 0.6;
                            const cr = r * 0.45;
                            ctx.beginPath(); ctx.moveTo(x2 - cr, y2); ctx.lineTo(x2 + cr, y2); ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(x2, y2 - cr); ctx.lineTo(x2, y2 + cr); ctx.stroke();
                        }
                        ctx.globalAlpha = 1;
                    } else {
                        // Trajetoria mode — colored fill with border
                        ctx.fillStyle = neonColor;
                        ctx.globalAlpha = fillAlpha * 0.7;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();
                        ctx.strokeStyle = cat.color;
                        ctx.lineWidth = Math.max(1 * dpr, r * 0.2);
                        ctx.globalAlpha = 0.7 + depthRatio * 0.3;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.stroke();
                        ctx.globalAlpha = 1;
                    }
                }
                cutDist += Math.abs(m.z2 - m.z1);
            } else {
                // ── Corte (cut) ──
                const cat = getOpCat(m.op);
                const depth = espReal - m.z2;
                const depthRatio = Math.min(Math.max(depth / espReal, 0), 1);
                const neonColor = cat.glow;
                const toolW = Math.max(toolD * sc * 0.7, 1.2 * dpr);
                // Passante (contorno) = full intensity, parcial (rebaixo) = softer
                const isPassante = depthRatio > 0.9;
                const intensity = isPassante ? 1.0 : 0.6;

                if (isUsinagem && depthRatio > 0.01) {
                    // ── NEON LIGHTSABER EFFECT ──
                    // Layer 1: Wide outer glow (bloom)
                    ctx.save();
                    ctx.shadowColor = neonColor;
                    ctx.shadowBlur = 14 * dpr * depthRatio * intensity;
                    ctx.strokeStyle = neonColor;
                    ctx.globalAlpha = 0.12 * depthRatio * intensity;
                    ctx.lineWidth = toolW * 3;
                    ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                    ctx.restore();

                    // Layer 2: Medium glow
                    ctx.strokeStyle = neonColor;
                    ctx.globalAlpha = 0.3 * depthRatio * intensity;
                    ctx.lineWidth = toolW * 1.6;
                    ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

                    // Layer 3: Core — bright saturated color
                    ctx.strokeStyle = neonColor;
                    ctx.globalAlpha = (0.7 + depthRatio * 0.3) * (isPassante ? 1 : 0.8);
                    ctx.lineWidth = toolW * 0.8;
                    ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

                    // Layer 4: White-hot center (only for passante cuts)
                    if (isPassante) {
                        ctx.strokeStyle = '#ffffff';
                        ctx.globalAlpha = 0.4 * depthRatio;
                        ctx.lineWidth = Math.max(toolW * 0.25, 0.6 * dpr);
                        ctx.lineCap = 'round';
                        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                    }

                    ctx.globalAlpha = 1;
                } else {
                    // Trajetoria mode — simpler colored lines
                    const alpha = 0.5 + depthRatio * 0.5;
                    ctx.strokeStyle = cat.color;
                    ctx.globalAlpha = alpha;
                    ctx.lineWidth = Math.max(1 * dpr, toolW * 0.5);
                    ctx.lineCap = 'round';
                    ctx.setLineDash([]);
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                cutDist += dist;
            }
        }
        ctx.setLineDash([]);

        // ── Tool change markers (trajetoria only) ──
        if (!isUsinagem && moveLimit < 0) {
            for (const ev of allEvents) {
                if (ev.type === 'tool' && ev.moveIdx < allMoves.length) {
                    const m = allMoves[ev.moveIdx] || allMoves[0];
                    const cx2 = tx(m?.x1 ?? 0), cy2 = ty(m?.y1 ?? 0);
                    ctx.fillStyle = '#f9e2af'; ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(cx2, cy2 - 6 * dpr); ctx.lineTo(cx2 + 4 * dpr, cy2);
                    ctx.lineTo(cx2, cy2 + 6 * dpr); ctx.lineTo(cx2 - 4 * dpr, cy2);
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
        }

        // ── Spindle / cursor marker ──
        if (allMoves.length > 0) {
            if (moveLimit < 0) {
                // Start + end markers
                const first = allMoves[0];
                ctx.fillStyle = '#22c55e'; ctx.beginPath();
                ctx.arc(tx(first.x1), ty(first.y1), 4 * dpr, 0, Math.PI * 2); ctx.fill();
                const last = allMoves[allMoves.length - 1];
                ctx.fillStyle = '#ef4444'; ctx.beginPath();
                ctx.arc(tx(last.x2), ty(last.y2), 4 * dpr, 0, Math.PI * 2); ctx.fill();
            } else if (moveLimit < allMoves.length) {
                const cur = allMoves[moveLimit];
                const curCat = getOpCat(cur.op);
                const isCutting = cur.type !== 'G0' && (espReal - cur.z2) > 0.5;
                const spindleColor = isCutting ? curCat.glow : '#1379F0';

                // Glow halo when cutting
                if (isCutting && isUsinagem) {
                    ctx.save();
                    ctx.shadowColor = spindleColor;
                    ctx.shadowBlur = 20 * dpr;
                    ctx.fillStyle = spindleColor;
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 10 * dpr, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }

                // Crosshair
                ctx.strokeStyle = spindleColor; ctx.lineWidth = 1 * dpr; ctx.globalAlpha = 0.5;
                ctx.beginPath(); ctx.moveTo(tx(cur.x2) - 14 * dpr, ty(cur.y2)); ctx.lineTo(tx(cur.x2) + 14 * dpr, ty(cur.y2)); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(tx(cur.x2), ty(cur.y2) - 14 * dpr); ctx.lineTo(tx(cur.x2), ty(cur.y2) + 14 * dpr); ctx.stroke();
                ctx.globalAlpha = 1;

                // Outer ring
                ctx.strokeStyle = spindleColor; ctx.lineWidth = 2 * dpr;
                ctx.globalAlpha = 0.6;
                ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 7 * dpr, 0, Math.PI * 2); ctx.stroke();
                // Center dot
                ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9;
                ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 2.5 * dpr, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;

                // Coord label
                ctx.fillStyle = '#8ab4f8'; ctx.font = `${10 * dpr}px monospace`;
                ctx.fillText(`X${cur.x2.toFixed(1)} Y${cur.y2.toFixed(1)} Z${cur.z2.toFixed(1)}`, tx(cur.x2) + 12 * dpr, ty(cur.y2) - 10 * dpr);
            }
        }

        // ── HUD ──
        if (moveLimit >= 0) {
            const { tool, op } = getActiveEventsAt(moveLimit);
            const cat = getOpCat(op);
            const hudH = (tool ? 18 * dpr : 0) + (op ? 18 * dpr : 0) + 10 * dpr;
            ctx.fillStyle = '#0d0d15dd'; ctx.fillRect(4 * dpr, 30 * dpr, 300 * dpr, hudH);
            let hy = 46 * dpr;
            if (tool) { ctx.fillStyle = '#f9e2af'; ctx.font = `bold ${10 * dpr}px sans-serif`; ctx.fillText(tool, 10 * dpr, hy); hy += 18 * dpr; }
            if (op) { ctx.fillStyle = cat.glow; ctx.font = `bold ${10 * dpr}px sans-serif`; ctx.fillText(`${cat.label}: ${op}`, 10 * dpr, hy); }
        }

        // ── Bottom progress bar ──
        if (moveLimit >= 0) {
            const pct = (moveLimit + 1) / allMoves.length;
            ctx.fillStyle = '#0a0a12'; ctx.fillRect(0, H - 26 * dpr, W, 26 * dpr);
            ctx.fillStyle = '#1379F018'; ctx.fillRect(0, H - 26 * dpr, W * pct, 26 * dpr);
            for (const ev of allEvents) {
                if (ev.type === 'tool') {
                    ctx.fillStyle = '#f9e2af'; ctx.fillRect(W * (ev.moveIdx / allMoves.length) - 1, H - 26 * dpr, 2 * dpr, 26 * dpr);
                }
            }
            ctx.fillStyle = '#cdd6f4'; ctx.font = `${10 * dpr}px monospace`;
            ctx.fillText(`Move ${moveLimit + 1}/${allMoves.length}  |  Rapido: ${(rapidDist / 1000).toFixed(1)}m  |  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10 * dpr, H - 9 * dpr);
        } else {
            ctx.fillStyle = '#cdd6f4'; ctx.font = `${11 * dpr}px monospace`;
            ctx.fillText(`${allMoves.length} movimentos  |  Rapido: ${(rapidDist / 1000).toFixed(1)}m  |  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10 * dpr, H - 10 * dpr);
        }
    }, [gcode, chapa, allMoves, allEvents, getActiveEventsAt, zoom, panOff, espReal, dims, simMode, moveToolDiams]);

    useEffect(() => { renderCanvas(curMove); }, [curMove, renderCanvas]);

    // ─── Animation ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!playing) { if (animRef.current) cancelAnimationFrame(animRef.current); return; }
        let lastTime = performance.now();
        const step = (now) => {
            const dt = now - lastTime;
            const interval = Math.max(5, 60 / speed);
            if (dt >= interval) {
                lastTime = now;
                setCurMove(prev => {
                    const next = prev + 1;
                    if (next >= allMoves.length) { setPlaying(false); return allMoves.length - 1; }
                    return next;
                });
            }
            animRef.current = requestAnimationFrame(step);
        };
        animRef.current = requestAnimationFrame(step);
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, [playing, speed, allMoves.length]);

    // ─── Controls ─────────────────────────────────────────────────────────
    const handlePlay = () => { if (curMove >= allMoves.length - 1 || curMove < 0) setCurMove(0); setPlaying(true); };
    const handlePause = () => setPlaying(false);
    const handleStop = () => { setPlaying(false); setCurMove(-1); };
    const handleStep = (dir) => {
        setPlaying(false);
        setCurMove(prev => Math.max(0, Math.min(allMoves.length - 1, (prev < 0 ? 0 : prev) + dir)));
    };
    const handleSlider = (e) => { setPlaying(false); setCurMove(parseInt(e.target.value)); };
    const handleWheel = useCallback((e) => { e.preventDefault(); setZoom(z => Math.max(0.3, Math.min(8, z + (e.deltaY < 0 ? 0.15 : -0.15)))); }, []);
    const handleMouseDown = (e) => { panRef.current = { startX: e.clientX - panOff.x, startY: e.clientY - panOff.y }; };
    const handleMouseMove = (e) => {
        if (panRef.current) {
            setPanOff({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY });
            setHoverInfo(null);
            return;
        }
        // Hit-test pieces for tooltip
        if (!chapa?.pecas?.length || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const dpr = window.devicePixelRatio || 1;
        const W = dims.w * dpr;
        const H = dims.h * dpr;
        const cw = chapa.comprimento || 2750, cl = chapa.largura || 1850;
        const pad = 30 * dpr;
        const sc = Math.min((W - 2 * pad) / cw, (H - 2 * pad) / cl) * zoom;
        const offX = (W - cw * sc) / 2 + panOff.x * dpr;
        const offY = (H - cl * sc) / 2 + panOff.y * dpr;
        // Convert mouse to sheet coords (accounting for dpr)
        const sheetX = (mx * dpr - offX) / sc;
        const sheetY = (my * dpr - offY) / sc;
        const ref = chapa.refilo || 10;
        let found = null;
        for (let i = chapa.pecas.length - 1; i >= 0; i--) {
            const p = chapa.pecas[i];
            if (sheetX >= ref + p.x && sheetX <= ref + p.x + p.w && sheetY >= ref + p.y && sheetY <= ref + p.y + p.h) {
                found = p;
                break;
            }
        }
        if (found) {
            setHoverInfo({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 10, piece: found });
        } else {
            setHoverInfo(null);
        }
    };
    const handleMouseUp = () => { panRef.current = null; };

    // ─── Touch handlers (mobile/tablet) ──────────────────────────────────
    const getTouchDist = (t0, t1) => Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const getTouchCenter = (t0, t1) => ({ x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 });

    const handleTouchStart = (e) => {
        e.preventDefault();
        const touches = e.touches;
        if (touches.length === 1) {
            touchRef.current = { lastDist: 0, lastCenter: null, touching: true };
            panRef.current = { startX: touches[0].clientX - panOff.x, startY: touches[0].clientY - panOff.y };
        } else if (touches.length === 2) {
            panRef.current = null;
            const dist = getTouchDist(touches[0], touches[1]);
            const center = getTouchCenter(touches[0], touches[1]);
            touchRef.current = { lastDist: dist, lastCenter: center, touching: true };
        }
    };

    const handleTouchMove = (e) => {
        e.preventDefault();
        const touches = e.touches;
        if (touches.length === 1 && panRef.current) {
            setPanOff({ x: touches[0].clientX - panRef.current.startX, y: touches[0].clientY - panRef.current.startY });
            setHoverInfo(null);
        } else if (touches.length === 2 && touchRef.current.lastDist) {
            const dist = getTouchDist(touches[0], touches[1]);
            const scale = dist / touchRef.current.lastDist;
            setZoom(z => Math.max(0.3, Math.min(8, z * scale)));
            touchRef.current.lastDist = dist;
        }
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();
        if (e.touches.length === 0) {
            panRef.current = null;
            touchRef.current = { lastDist: 0, lastCenter: null, touching: false };
        } else if (e.touches.length === 1) {
            // Went from 2 fingers to 1 — start panning from current position
            panRef.current = { startX: e.touches[0].clientX - panOff.x, startY: e.touches[0].clientY - panOff.y };
            touchRef.current = { lastDist: 0, lastCenter: null, touching: true };
        }
    };

    const { tool: activeTool, op: activeOp } = curMove >= 0 ? getActiveEventsAt(curMove) : { tool: '', op: '' };

    const simContent = (isFS) => (
        <div ref={isFS ? undefined : wrapRef} style={isFS
            ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999, background: '#0d0d15', display: 'flex', flexDirection: 'column' }
            : { position: 'relative' }
        }>
            <canvas ref={canvasRef}
                style={{
                    borderRadius: isFS ? 0 : '8px 8px 0 0',
                    border: isFS ? 'none' : '1px solid var(--border)', borderBottom: 'none',
                    cursor: panRef.current ? 'grabbing' : 'grab', display: 'block',
                    width: dims.w, height: dims.h, touchAction: 'none',
                }}
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp(); setHoverInfo(null); }}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} />

            {/* Piece tooltip on hover */}
            {hoverInfo && hoverInfo.piece && (
                <div style={{
                    position: 'absolute', left: hoverInfo.x, top: hoverInfo.y,
                    pointerEvents: 'none', zIndex: 50,
                    background: 'rgba(15,15,25,0.92)', border: '1px solid rgba(100,140,255,0.3)',
                    borderRadius: 6, padding: '6px 10px', maxWidth: 220,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e0e6ff', marginBottom: 2 }}>
                        {hoverInfo.piece.nome || 'Peça'}
                    </div>
                    <div style={{ fontSize: 10, color: '#8890b0' }}>
                        {Math.round(hoverInfo.piece.w)} × {Math.round(hoverInfo.piece.h)} mm
                    </div>
                </div>
            )}

            {/* Overlay controls */}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                <button onClick={() => setZoom(z => Math.min(8, z + 0.3))} style={CTRL.btn}>+</button>
                <button onClick={() => setZoom(z => Math.max(0.3, z - 0.3))} style={CTRL.btn}>-</button>
                <button onClick={() => { setZoom(1); setPanOff({ x: 0, y: 0 }); }} style={CTRL.btn}>Reset</button>
                <button onClick={() => setFullscreen(f => !f)} style={CTRL.btn} title={fullscreen ? 'Sair tela cheia (ESC)' : 'Tela cheia'}>
                    {fullscreen ? '\u2716' : '\u26F6'}
                </button>
            </div>
            <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4 }}>
                <div style={{ display: 'flex', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border, #444)' }}>
                    <button onClick={() => setSimMode('usinagem')} style={{
                        padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none',
                        background: simMode === 'usinagem' ? '#1379F0' : 'rgba(30,30,50,0.8)',
                        color: simMode === 'usinagem' ? '#fff' : '#888', transition: 'all 0.15s',
                    }}>Usinagem</button>
                    <button onClick={() => setSimMode('trajetoria')} style={{
                        padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none',
                        background: simMode === 'trajetoria' ? '#1379F0' : 'rgba(30,30,50,0.8)',
                        color: simMode === 'trajetoria' ? '#fff' : '#888', transition: 'all 0.15s',
                    }}>Trajetoria</button>
                </div>
                <span style={{ fontSize: 9, color: '#666', background: 'rgba(13,13,21,0.8)', padding: '3px 8px', borderRadius: 5, backdropFilter: 'blur(4px)', alignSelf: 'center' }}>
                    Zoom: {(zoom * 100).toFixed(0)}%
                </span>
            </div>

            {/* Transport bar */}
            <div style={CTRL.bar}>
                {!playing
                    ? <button onClick={handlePlay} style={CTRL.btnAct} title="Play">&#9654;</button>
                    : <button onClick={handlePause} style={CTRL.btnAct} title="Pausar">&#9208;</button>
                }
                <button onClick={handleStop} style={CTRL.btn} title="Parar">&#9209;</button>
                <button onClick={() => handleStep(-1)} style={CTRL.btn} title="Voltar">&#9198;</button>
                <button onClick={() => handleStep(1)} style={CTRL.btn} title="Avancar">&#9197;</button>
                <input type="range" min={0} max={Math.max(0, allMoves.length - 1)} value={curMove < 0 ? 0 : curMove}
                    onChange={handleSlider} style={{ flex: 1, height: 4, accentColor: '#1379F0', cursor: 'pointer' }} />
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                    style={{ ...CTRL.btn, padding: '3px 6px', fontSize: 10 }}>
                    <option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option>
                    <option value={5}>5x</option><option value={10}>10x</option><option value={20}>20x</option>
                    <option value={50}>50x</option>
                </select>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right', fontFamily: 'monospace' }}>
                    {curMove >= 0 ? `${curMove + 1}/${allMoves.length}` : `${allMoves.length} moves`}
                </span>
            </div>

            {/* Legend */}
            <div style={CTRL.legend}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ffc864', opacity: 0.7 }}>
                    <span style={{ width: 12, height: 0, borderTop: '1.5px dashed #ffc864', display: 'inline-block' }} /> Rapido
                </span>
                {foundOps.map(cat => {
                    const isActive = activeOp && getOpCat(activeOp).key === cat.key;
                    const isFuro = cat.key === 'furo';
                    return (
                        <span key={cat.key} style={{
                            display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                            color: isActive ? cat.glow : 'var(--text-muted)',
                            fontWeight: isActive ? 700 : 400, transition: 'all 0.2s',
                            textShadow: isActive ? `0 0 8px ${cat.glow}` : 'none',
                        }}>
                            <span style={{
                                width: isFuro ? 8 : 10, height: isFuro ? 8 : 3,
                                borderRadius: isFuro ? '50%' : 2, display: 'inline-block',
                                background: isFuro ? 'transparent' : cat.glow,
                                border: isFuro ? `1.5px solid ${cat.glow}` : 'none',
                                opacity: isActive ? 1 : 0.4,
                                boxShadow: isActive ? `0 0 6px ${cat.glow}` : 'none',
                            }} />
                            {cat.label}
                        </span>
                    );
                })}
                {activeTool && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f9e2af', fontWeight: 600 }}>{activeTool}</span>}
            </div>
        </div>
    );

    if (fullscreen) {
        return (
            <>
                <div ref={wrapRef} style={{ position: 'relative', height: 0 }} />
                {createPortal(simContent(true), document.body)}
            </>
        );
    }
    return simContent(false);
}
