// ═══════════════════════════════════════════════════════
// GcodeSimWrapper — CNC Simulator 2D — professional CAM style
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, Square, ChevronLeft, ChevronRight, Wrench } from 'lucide-react';

// ─── Gcode parser with arc interpolation + helicoidal hole detection ──────────
export function parseGcodeForSim(text) {
    const moves = [];
    const events = [];
    const ops = [];
    let x = 0, y = 0, z = 0, mode = 'G0';
    let curTool = '', curOp = '', curFeed = 0;
    let curOpMeta = null;
    // Track arc sequences for helicoidal hole detection
    let arcRunStart = -1; // index into moves[] where a G2/G3 run started
    let arcRunCx = 0, arcRunCy = 0, arcRunR = 0; // approx center/radius of the run

    const flushArcRun = (endIdx) => {
        if (arcRunStart < 0 || endIdx - arcRunStart < 3) { arcRunStart = -1; return; }
        // Check if this arc run forms a closed (or near-closed) path — helicoidal hole
        const first = moves[arcRunStart];
        const last = moves[endIdx - 1];
        const closeGap = Math.sqrt((last.x2 - first.x1) ** 2 + (last.y2 - first.y1) ** 2);
        const zDescends = last.z2 < first.z1 - 0.5; // Z went down by at least 0.5mm
        // A helicoidal hole: multiple arcs, roughly same center, Z decreases, path nearly closed
        if (zDescends && closeGap < arcRunR * 0.6 + 2 && arcRunR > 1) {
            const holeDiam = arcRunR * 2;
            for (let i = arcRunStart; i < endIdx; i++) {
                moves[i].isHelicalHole = true;
                moves[i].holeCx = arcRunCx;
                moves[i].holeCy = arcRunCy;
                moves[i].holeDiam = holeDiam;
            }
        }
        arcRunStart = -1;
    };

    for (const raw of text.split('\n')) {
        const cmtMatch = raw.match(/[;(]\s*(.+?)\s*\)?$/);
        const comment = cmtMatch ? cmtMatch[1] : '';

        // ── Structured metadata comment: [OP type=furo diam=X prof=Y cx=CX cy=CY] ──
        const opMetaMatch = comment.match(/\[OP\s+([^\]]+)\]/);
        if (opMetaMatch) {
            const meta = {};
            for (const pair of opMetaMatch[1].matchAll(/(\w+)=([^\s]+)/g)) meta[pair[1]] = pair[2];
            for (const [key, value] of Object.entries(meta)) {
                if (/^-?\d+(\.\d+)?$/.test(value)) meta[key] = Number(value);
            }
            if (meta.type) {
                if (curOpMeta) curOpMeta.moveEnd = moves.length;
                curOp = `${meta.type}${meta.diam ? ` D${meta.diam}` : ''}${meta.peca ? ` ${decodeURIComponent(meta.peca)}` : ''}`;
                curOpMeta = { ...meta, peca: meta.peca ? decodeURIComponent(meta.peca) : '', moveStart: moves.length, moveEnd: moves.length };
                ops.push(curOpMeta);
                events.push({ moveIdx: moves.length, type: 'op', label: curOp, meta: curOpMeta });
            }
        }

        if (/troca|ferramenta|tool/i.test(comment)) {
            curTool = comment.replace(/^(Troca:\s*|Ferramenta:\s*|Tool:\s*)/i, '').trim();
            events.push({ moveIdx: moves.length, type: 'tool', label: curTool });
        }
        // Extended op detection: added chanfro, recorte, passa.fio, helicoidal, circular, op:
        if (/===|contorno|furo|rebaixo|canal|pocket|usinagem|rasgo|gola|fresagem|sobra|chanfro|recorte|passa.?fio|helicoidal|circular|pocket_/i.test(comment) && !/troca|ferramenta/i.test(comment)) {
            const newOp = comment.replace(/^=+\s*|\s*=+$/g, '').trim();
            if (newOp !== curOp) {
                curOp = newOp;
                events.push({ moveIdx: moves.length, type: 'op', label: curOp });
            }
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
        const fM = cmd.match(/F([+-]?[\d.]+)/i);
        if (fM) curFeed = parseFloat(fM[1]);
        const newX = xM ? parseFloat(xM[1]) : x, newY = yM ? parseFloat(yM[1]) : y, newZ = zM ? parseFloat(zM[1]) : z;

        // Flush arc run when mode changes away from G2/G3
        if (mode !== 'G2' && mode !== 'G3' && arcRunStart >= 0) {
            flushArcRun(moves.length);
        }

        if (xM || yM || zM) {
            const isZOnly = !xM && !yM && zM;
            if ((mode === 'G2' || mode === 'G3') && (iM || jM)) {
                const ci = iM ? parseFloat(iM[1]) : 0, cj = jM ? parseFloat(jM[1]) : 0;
                const cx2 = x + ci, cy2 = y + cj;
                const r = Math.sqrt(ci * ci + cj * cj);
                let startA = Math.atan2(y - cy2, x - cx2);
                let endA = Math.atan2(newY - cy2, newX - cx2);
                const cw = mode === 'G2';
                const dx = newX - x, dy = newY - y;
                const isFullCircle = Math.sqrt(dx * dx + dy * dy) < 0.1;
                if (isFullCircle) {
                    endA = cw ? startA - Math.PI * 2 : startA + Math.PI * 2;
                } else {
                    if (cw && endA >= startA) endA -= Math.PI * 2;
                    if (!cw && endA <= startA) endA += Math.PI * 2;
                }
                const totalAngle = Math.abs(endA - startA);
                const steps = Math.max(Math.round(totalAngle / (Math.PI / 18)), 4);

                // Track arc run for helicoidal hole detection
                if (arcRunStart < 0) {
                    arcRunStart = moves.length;
                    arcRunCx = cx2; arcRunCy = cy2; arcRunR = r;
                } else {
                    // Weighted average center for multi-arc sequences
                    arcRunCx = (arcRunCx + cx2) / 2; arcRunCy = (arcRunCy + cy2) / 2;
                    arcRunR = (arcRunR + r) / 2;
                }

                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const a = startA + (endA - startA) * t;
                    const sx = cx2 + r * Math.cos(a), sy = cy2 + r * Math.sin(a);
                    const sz = z + (newZ - z) * t;
                    moves.push({ type: mode, x1: s === 1 ? x : moves[moves.length - 1].x2, y1: s === 1 ? y : moves[moves.length - 1].y2, z1: s === 1 ? z : moves[moves.length - 1].z2, x2: sx, y2: sy, z2: sz, tool: curTool, op: curOp, opMeta: curOpMeta, isZOnly: false, isArc: true, arcCx: cx2, arcCy: cy2, arcR: r, feed: curFeed });
                }
            } else {
                if (arcRunStart >= 0) flushArcRun(moves.length);
                moves.push({ type: mode, x1: x, y1: y, z1: z, x2: newX, y2: newY, z2: newZ, tool: curTool, op: curOp, opMeta: curOpMeta, isZOnly, feed: curFeed });
            }
        }
        x = newX; y = newY; z = newZ;
    }
    if (arcRunStart >= 0) flushArcRun(moves.length);
    if (curOpMeta) curOpMeta.moveEnd = moves.length;
    const feeds = moves.filter(m => m.type !== 'G0' && m.feed > 0).map(m => m.feed);
    const minFeed = feeds.length ? Math.min(...feeds) : 0;
    const maxFeed = feeds.length ? Math.max(...feeds) : 1;
    return { moves, events, ops, minFeed, maxFeed };
}

/** Heatmap de velocidade de avanço: vermelho=lento, amarelo=médio, verde=corte, azul=rápido */
function feedHeatColor(feed, minFeed, maxFeed) {
    if (!feed || maxFeed <= minFeed) return '#a6adc8';
    const t = Math.max(0, Math.min(1, (feed - minFeed) / (maxFeed - minFeed)));
    if (t < 0.33) {
        const f = t / 0.33;
        return `rgb(${220},${Math.round(60 + f * 160)},${30})`;
    } else if (t < 0.66) {
        const f = (t - 0.33) / 0.33;
        return `rgb(${Math.round(220 - f * 140)},${Math.round(220 - f * 30)},${30})`;
    } else {
        const f = (t - 0.66) / 0.34;
        return `rgb(${Math.round(80 - f * 60)},${Math.round(190 + f * 30)},${Math.round(30 + f * 180)})`;
    }
}

// ─── Operation categories — professional CAM palette (not neon) ────────────
export const OP_CATS = [
    { key: 'contorno', pat: /contorno/i,                    color: '#d48820', glow: '#e09830', label: 'Contorno' },
    { key: 'rebaixo',  pat: /rebaixo/i,                     color: '#2878c0', glow: '#3890d8', label: 'Rebaixo' },
    { key: 'canal',    pat: /canal/i,                       color: '#8050a8', glow: '#9862c0', label: 'Canal' },
    { key: 'furo',     pat: /furo|hole|helicoidal|circular/i, color: '#c03020', glow: '#d84030', label: 'Furo' },
    { key: 'pocket',   pat: /pocket|rebaixo_pocket/i,       color: '#c06010', glow: '#d87020', label: 'Pocket' },
    { key: 'rasgo',    pat: /rasgo/i,                       color: '#189080', glow: '#20a890', label: 'Rasgo' },
    { key: 'gola',     pat: /gola/i,                        color: '#906808', glow: '#a88010', label: 'Gola' },
    { key: 'chanfro',  pat: /chanfro|chamfer/i,             color: '#b05820', glow: '#c87030', label: 'Chanfro' },
    { key: 'recorte',  pat: /recorte|passa.?fio/i,          color: '#5858a8', glow: '#7070c0', label: 'Recorte' },
    { key: 'fresagem', pat: /fresagem|milling/i,            color: '#2088b0', glow: '#30a0c8', label: 'Fresagem' },
];
export function getOpCat(op) {
    const lo = (op || '').toLowerCase();
    for (const c of OP_CATS) { if (c.pat.test(lo)) return c; }
    return { key: 'outro', color: '#a6adc8', glow: '#a6adc8', label: 'Outro' };
}

export function getToolDiameterFromName(name) {
    const m = name.match(/(\d+)\s*mm/i);
    return m ? parseInt(m[1]) : 6;
}

// ─── Event color by type/category ─────────────────────────────────────────
function getEventColor(ev) {
    if (ev.type === 'tool') return '#f9e2af';
    if (ev.type === 'spindle') return '#888';
    if (ev.type === 'op') {
        const cat = getOpCat(ev.label);
        return cat.color;
    }
    return '#a6adc8';
}

function getEventIcon(ev) {
    if (ev.type === 'tool') return '⌖';
    if (ev.type === 'op') return '▶';
    if (ev.label === 'Spindle ON') return '⚙';
    if (ev.label === 'Spindle OFF') return '⏹';
    return '•';
}

// ─── Shared control bar styles — neutral graphite CAM ───────────────────────
const CTRL = {
    bar: {
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
        padding: '7px 12px', background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
    },
    bar2: {
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '6px 12px', background: 'var(--bg-elevated)',
        borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
        borderTop: '1px solid var(--border)', flexWrap: 'wrap',
    },
    btn: {
        padding: '5px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        borderRadius: 6, border: '1px solid var(--border)',
        background: 'var(--bg-muted)', color: 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', gap: 3,
        transition: 'all 0.15s', lineHeight: 1, whiteSpace: 'nowrap',
    },
    btnAct: {
        padding: '5px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        borderRadius: 6, border: '1px solid var(--primary)',
        background: 'var(--primary)', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 3,
        transition: 'all 0.15s', lineHeight: 1, whiteSpace: 'nowrap',
    },
    sep: { width: 1, height: 18, background: 'var(--border)', flexShrink: 0, alignSelf: 'center' },
};

// ═════════════════════════════════════════════════════════════════════════════
// High-res 2D Canvas Simulator — professional CAM style
// ═════════════════════════════════════════════════════════════════════════════
export default function GcodeSimWrapper({ gcode, chapa }) {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const [dims, setDims] = useState({ w: 900, h: 620 });
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

    // ─── State variables ───────────────────────────────────────────────────
    const [showTimeline, setShowTimeline] = useState(false);
    const [hiddenCats, setHiddenCats] = useState(new Set());
    const [showRapids, setShowRapids] = useState(true);
    const [showStats, setShowStats] = useState(false);
    const [heatmapMode, setHeatmapMode] = useState(false);
    // Side A/B filter: 'all' | 'A' | 'B'
    const [sideFilter, setSideFilter] = useState('all');
    const [autoOrient, setAutoOrient] = useState(true);

    const parsed = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const allMoves = parsed.moves;
    const allEvents = parsed.events;
    const minFeed = parsed.minFeed ?? 0;
    const maxFeed = parsed.maxFeed ?? 1;
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

    // ─── Tool events for jump buttons ─────────────────────────────────────
    const toolEvents = useMemo(() => allEvents.filter(ev => ev.type === 'tool'), [allEvents]);

    // ─── Active timeline event index ──────────────────────────────────────
    const activeTimelineIdx = useMemo(() => {
        if (curMove < 0) return -1;
        let active = -1;
        for (let i = 0; i < allEvents.length; i++) {
            if (allEvents[i].moveIdx <= curMove) active = i;
            else break;
        }
        return active;
    }, [allEvents, curMove]);

    // ─── Active tool event index ──────────────────────────────────────────
    const activeToolIdx = useMemo(() => {
        if (curMove < 0) return -1;
        let active = -1;
        for (let i = 0; i < toolEvents.length; i++) {
            if (toolEvents[i].moveIdx <= curMove) active = i;
            else break;
        }
        return active;
    }, [toolEvents, curMove]);

    // ─── Statistics ───────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const catCounts = {};
        let cutMoves = 0, rapidMoves = 0, cutDist = 0, rapidDist = 0;
        for (const m of allMoves) {
            const dist = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
            if (m.type === 'G0') {
                if (!m.isZOnly) { rapidMoves++; rapidDist += dist; }
            } else {
                if (m.isZOnly) {
                    cutMoves++;
                    cutDist += Math.abs(m.z2 - m.z1);
                } else {
                    cutMoves++;
                    cutDist += dist;
                }
                const cat = getOpCat(m.op);
                catCounts[cat.key] = (catCounts[cat.key] || 0) + 1;
            }
        }
        return {
            total: allMoves.length,
            cutMoves,
            rapidMoves,
            catCounts,
            cutDistM: (cutDist / 1000).toFixed(2),
            rapidDistM: (rapidDist / 1000).toFixed(2),
        };
    }, [allMoves]);

    const operationBlocks = useMemo(() => {
        const opEvents = allEvents.filter(ev => ev.type === 'op');
        const blocks = [];
        if (opEvents.length) {
            for (let i = 0; i < opEvents.length; i++) {
                const ev = opEvents[i];
                const start = Math.max(0, Math.min(ev.moveIdx, allMoves.length - 1));
                const end = Math.max(start, Math.min((opEvents[i + 1]?.moveIdx ?? allMoves.length) - 1, allMoves.length - 1));
                const moves = allMoves.slice(start, end + 1);
                const cat = getOpCat(ev.label);
                let cut = 0, rapid = 0, cutDist = 0, rapidDist = 0;
                for (const m of moves) {
                    const d = Math.hypot((m.x2 || 0) - (m.x1 || 0), (m.y2 || 0) - (m.y1 || 0));
                    if (m.type === 'G0') {
                        if (!m.isZOnly) { rapid++; rapidDist += d; }
                    } else {
                        cut++;
                        cutDist += m.isZOnly ? Math.abs((m.z2 || 0) - (m.z1 || 0)) : d;
                    }
                }
                let tool = '';
                for (const toolEv of allEvents) {
                    if (toolEv.moveIdx > start) break;
                    if (toolEv.type === 'tool') tool = toolEv.label;
                }
                blocks.push({
                    id: `${start}-${i}`,
                    label: ev.label || cat.label,
                    start,
                    end,
                    cat,
                    tool,
                    moves: moves.length,
                    cut,
                    rapid,
                    cutM: cutDist / 1000,
                    rapidM: rapidDist / 1000,
                });
            }
        } else {
            const grouped = new Map();
            allMoves.forEach((m, idx) => {
                if (m.type === 'G0') return;
                const label = m.op || 'Usinagem sem metadado';
                if (!grouped.has(label)) {
                    grouped.set(label, { label, start: idx, end: idx, moves: [] });
                }
                const g = grouped.get(label);
                g.end = idx;
                g.moves.push(m);
            });
            for (const [label, g] of grouped) {
                const cat = getOpCat(label);
                blocks.push({
                    id: `${g.start}-${label}`,
                    label,
                    start: g.start,
                    end: g.end,
                    cat,
                    tool: '',
                    moves: g.moves.length,
                    cut: g.moves.length,
                    rapid: 0,
                    cutM: g.moves.reduce((s, m) => s + Math.hypot((m.x2 || 0) - (m.x1 || 0), (m.y2 || 0) - (m.y1 || 0)), 0) / 1000,
                    rapidM: 0,
                });
            }
        }
        return blocks.filter(b => b.moves > 0);
    }, [allEvents, allMoves]);

    const getPieceAt = useCallback((x, y) => {
        if (!chapa?.pecas?.length || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        const ref = chapa.refilo || 10;
        for (let i = chapa.pecas.length - 1; i >= 0; i--) {
            const p = chapa.pecas[i];
            if (x >= ref + p.x && x <= ref + p.x + p.w && y >= ref + p.y && y <= ref + p.y + p.h) return p;
        }
        return null;
    }, [chapa]);

    // ─── Dynamic resolution ───────────────────────────────────────────────
    useEffect(() => {
        if (fullscreen) {
            const update = () => setDims({
                w: Math.max(520, window.innerWidth - 320),
                h: window.innerHeight - 92,
            });
            update();
            window.addEventListener('resize', update);
            return () => window.removeEventListener('resize', update);
        } else {
            const el = wrapRef.current;
            if (!el) return;
            const ro = new ResizeObserver(entries => {
                const { width } = entries[0].contentRect;
                const viewportCap = Math.max(320, Math.round(window.innerHeight * 0.54));
                if (width > 0) setDims({
                    w: width,
                    h: Math.max(320, Math.min(620, viewportCap, Math.round(width * 0.62))),
                });
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

    // ─── Keyboard shortcuts ───────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.target.isContentEditable) return;
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    if (playing) {
                        setPlaying(false);
                    } else {
                        setCurMove(prev => {
                            if (prev >= allMoves.length - 1 || prev < 0) return 0;
                            return prev;
                        });
                        setPlaying(true);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    setPlaying(false);
                    setCurMove(prev => Math.min(allMoves.length - 1, (prev < 0 ? 0 : prev) + 1));
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    setPlaying(false);
                    setCurMove(prev => Math.max(0, (prev < 0 ? 0 : prev) - 1));
                    break;
                case 'f': case 'F':
                    if (!e.ctrlKey && !e.metaKey) { setZoom(1); setPanOff({ x: 0, y: 0 }); }
                    break;
                case 'Escape':
                    if (!fullscreen) { setPlaying(false); setCurMove(-1); }
                    break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [playing, allMoves.length, fullscreen]);

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
        // Light warm machine table / vacuum bed
        ctx.fillStyle = '#efe9df'; ctx.fillRect(0, 0, W, H);

        if (!gcode || allMoves.length === 0) {
            ctx.fillStyle = '#8a6a42'; ctx.font = `${14 * dpr}px sans-serif`;
            ctx.fillText(gcode ? 'Nenhum movimento detectado' : 'G-Code não disponível', W / 2 - 120 * dpr, H / 2);
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
        const viewRotated = autoOrient && Boolean(chapa) && cl > cw;
        const fitRangeX = viewRotated ? rangeY : rangeX;
        const fitRangeY = viewRotated ? rangeX : rangeY;
        const pad = 24 * dpr;
        const sc = Math.min((W - pad * 2) / fitRangeX, (H - pad * 2) / fitRangeY) * zoom;
        const panScaleX = panOff.x * dpr, panScaleY = panOff.y * dpr;
        const offX = pad + panScaleX + ((W - pad * 2) - fitRangeX * sc) / 2;
        const offY = pad + panScaleY + ((H - pad * 2) - fitRangeY * sc) / 2;
        // ── Coordinate transforms ───────────────────────────────────────────────
        // Machine coordinates. When "Girar visual" is active, the whole view is
        // rotated as a camera/image transform; coordinates are not mirrored.
        const tx = viewRotated ? (v) => (v - minX) * sc : (v) => offX + (v - minX) * sc;
        const ty = viewRotated ? (v) => -(v - minY) * sc : (v) => offY + (maxY - v) * sc;

        if (viewRotated) {
            ctx.save();
            ctx.translate(offX, offY);
            ctx.rotate(Math.PI / 2);
        }

        const shX = tx(0);
        const shY = Math.min(ty(0), ty(cl));
        const shW = cw * sc;
        const shH = cl * sc;

        const isUsinagem = simMode === 'usinagem';
        const activePieceInCanvas = moveLimit >= 0 && allMoves[moveLimit]
            ? getPieceAt(allMoves[moveLimit].x2, allMoves[moveLimit].y2)
            : null;

        // ── Sheet ──────────────────────────────────────────────────────────────
        if (chapa) {
            // ── Elevation shadow — draw OUTSIDE canvas via offscreen rect ──
            // (shadow drawn separately from rect to avoid ghost duplicate)
            ctx.save();
            ctx.shadowColor = 'rgba(90,70,46,0.34)';
            ctx.shadowBlur = 14 * dpr;
            ctx.shadowOffsetX = 5 * dpr;
            ctx.shadowOffsetY = 7 * dpr;
            // Draw a 1px transparent rect just outside the sheet to generate shadow only
            ctx.fillStyle = 'rgba(90,70,46,0.01)';
            ctx.fillRect(shX - 1, shY - 1, shW + 2, shH + 2);
            ctx.restore();

            // ── Sheet base — real MDF/MDP natural color (light warm sandy) ──
            ctx.fillStyle = '#c8a86a';
            ctx.fillRect(shX, shY, shW, shH);

            // ── Wood fiber texture — subtle horizontal gradient bands ────
            // MDF has compressed wood fibers with a slightly mottled appearance
            const grain1 = ctx.createLinearGradient(shX, shY, shX, shY + shH);
            grain1.addColorStop(0,    'rgba(255,235,180,0.18)');
            grain1.addColorStop(0.12, 'rgba(255,220,160,0.06)');
            grain1.addColorStop(0.28, 'rgba(255,235,180,0.12)');
            grain1.addColorStop(0.45, 'rgba(230,190,130,0.04)');
            grain1.addColorStop(0.62, 'rgba(255,225,165,0.10)');
            grain1.addColorStop(0.8,  'rgba(220,180,120,0.07)');
            grain1.addColorStop(1,    'rgba(200,160,100,0.15)');
            ctx.fillStyle = grain1;
            ctx.fillRect(shX, shY, shW, shH);

            // ── Ambient light — brighter top-left (light source), darker bottom-right ──
            const ambientGrad = ctx.createRadialGradient(
                shX + shW * 0.2, shY + shH * 0.15, 0,
                shX + shW * 0.7, shY + shH * 0.7, Math.max(shW, shH) * 0.9
            );
            ambientGrad.addColorStop(0,   'rgba(255,245,215,0.20)');
            ambientGrad.addColorStop(0.5, 'rgba(200,160,100,0.00)');
            ambientGrad.addColorStop(1,   'rgba(80, 50, 20, 0.15)');
            ctx.fillStyle = ambientGrad;
            ctx.fillRect(shX, shY, shW, shH);

            // ── Grid — 500mm major intervals only (clean, minimal) ─────────
            ctx.save();
            ctx.lineWidth = 0.7 * dpr;
            for (let gx = 500; gx < cw; gx += 500) {
                ctx.globalAlpha = 0.12;
                ctx.strokeStyle = '#5c3a10';
                ctx.beginPath(); ctx.moveTo(tx(gx), shY); ctx.lineTo(tx(gx), shY + shH); ctx.stroke();
            }
            for (let gy = 500; gy < cl; gy += 500) {
                ctx.globalAlpha = 0.12;
                ctx.strokeStyle = '#5c3a10';
                ctx.beginPath(); ctx.moveTo(shX, ty(gy)); ctx.lineTo(shX + shW, ty(gy)); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.restore();

            // ── Sheet border — dark warm edge (like the real edge of MDF board) ──
            ctx.strokeStyle = 'rgba(70,42,14,0.75)'; ctx.lineWidth = 1.5 * dpr;
            ctx.strokeRect(shX, shY, shW, shH);

            // ── Sheet dimension labels — dark text above/left of sheet ──────
            ctx.save();
            ctx.fillStyle = 'rgba(200,175,110,0.95)';
            ctx.font = `bold ${9 * dpr}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(`${cw} mm`, shX + shW / 2, shY - 6 * dpr);
            ctx.save();
            ctx.translate(shX - 10 * dpr, shY + shH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.fillText(`${cl} mm`, 0, 0);
            ctx.restore();
            ctx.textAlign = 'left';
            ctx.restore();

            // ── X0 Y0 origin marker — follows the same visual rotation as the sheet.
            const ox = tx(0);
            const oy = ty(0);
            const axLen = Math.min(44 * dpr, shW * 0.07, shH * 0.07);
            ctx.globalAlpha = 0.9;

            // X axis → right in machine space. In rotated visual mode it rotates with the sheet.
            ctx.strokeStyle = '#e03030'; ctx.lineWidth = 1.8 * dpr;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + axLen, oy); ctx.stroke();
            ctx.fillStyle = '#e03030';
            ctx.beginPath(); ctx.moveTo(ox + axLen, oy); ctx.lineTo(ox + axLen - 5 * dpr, oy - 3 * dpr); ctx.lineTo(ox + axLen - 5 * dpr, oy + 3 * dpr); ctx.closePath(); ctx.fill();

            // Y axis → up in machine space. In rotated visual mode it rotates with the sheet.
            ctx.strokeStyle = '#30a030'; ctx.lineWidth = 1.8 * dpr;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - axLen); ctx.stroke();
            ctx.fillStyle = '#30a030';
            ctx.beginPath(); ctx.moveTo(ox, oy - axLen); ctx.lineTo(ox - 3 * dpr, oy - axLen + 5 * dpr); ctx.lineTo(ox + 3 * dpr, oy - axLen + 5 * dpr); ctx.closePath(); ctx.fill();

            // Origin dot
            ctx.fillStyle = 'rgba(40,22,6,0.95)'; ctx.globalAlpha = 0.95;
            ctx.beginPath(); ctx.arc(ox, oy, 3 * dpr, 0, Math.PI * 2); ctx.fill();

            // Labels
            ctx.globalAlpha = 0.85;
            ctx.font = `bold ${9 * dpr}px monospace`;
            ctx.fillStyle = '#e03030'; ctx.fillText('X', ox + axLen + 4 * dpr, oy + 3 * dpr);
            ctx.fillStyle = '#30a030'; ctx.fillText('Y', ox - 14 * dpr, oy - axLen);
            ctx.fillStyle = 'rgba(220,190,130,0.90)';
            ctx.font = `${8 * dpr}px monospace`;
            ctx.fillText('0,0', ox + 5 * dpr, oy + 12 * dpr);
            ctx.globalAlpha = 1;

            // ── Pieces — with Side A/B awareness ──────────────────────────
            if (chapa.pecas) {
                const ref = chapa.refilo || 10;
                // Side A: warm blue-slate tints | Side B: cooler blue-violet tints
                const pColorsA = [
                    'rgba( 40,  80, 180, 0.12)', 'rgba( 40, 130,  70, 0.12)',
                    'rgba(160,  60,  20, 0.10)', 'rgba(110,  40, 160, 0.10)',
                    'rgba(150, 110,   0, 0.11)', 'rgba( 10, 120, 130, 0.11)',
                    'rgba(160,  30,  80, 0.10)', 'rgba( 70, 140,  30, 0.11)',
                ];
                const pBordersA = [
                    'rgba( 30,  60, 140, 0.42)', 'rgba( 20, 100,  50, 0.42)',
                    'rgba(130,  40,  10, 0.38)', 'rgba( 85,  25, 130, 0.38)',
                    'rgba(120,  85,   0, 0.40)', 'rgba(  5,  90, 100, 0.40)',
                    'rgba(130,  20,  60, 0.38)', 'rgba( 50, 110,  20, 0.40)',
                ];
                // Side B gets a distinct blue-violet fill + border
                const pColorsB  = 'rgba( 60, 100, 220, 0.16)';
                const pBordersB = 'rgba( 50,  80, 200, 0.55)';

                for (let i = 0; i < chapa.pecas.length; i++) {
                    const p = chapa.pecas[i];
                    const isActivePiece = activePieceInCanvas === p;
                    const lado = p.lado_ativo || 'A';
                    const isB = lado === 'B';

                    // Apply sideFilter — dim pieces that don't match
                    const filtered = sideFilter !== 'all' && sideFilter !== lado;

                    const px = tx(ref + p.x);
                    const py = Math.min(ty(ref + p.y), ty(ref + p.y + p.h));
                    const pw2 = p.w * sc, ph2 = p.h * sc;

                    ctx.globalAlpha = filtered ? 0.25 : 1;

                    // Fill tint — different for Side B
                    ctx.fillStyle = isB ? pColorsB : pColorsA[i % pColorsA.length];
                    ctx.fillRect(px, py, pw2, ph2);

                    // Active highlight
                    if (isActivePiece && !filtered) {
                        ctx.fillStyle = 'rgba(37,99,235,0.11)';
                        ctx.fillRect(px, py, pw2, ph2);
                    }

                    // Border
                    ctx.strokeStyle = isActivePiece
                        ? '#2563eb'
                        : isB ? pBordersB : pBordersA[i % pBordersA.length];
                    ctx.lineWidth = (isActivePiece ? 2.2 : isB ? 1.4 : 1.0) * dpr;
                    ctx.strokeRect(px, py, pw2, ph2);

                    // Name label
                    if (pw2 > 30 * dpr && ph2 > 14 * dpr) {
                        ctx.fillStyle = isB ? 'rgba(30,50,120,0.88)' : 'rgba(45,28,10,0.85)';
                        ctx.font = `600 ${Math.min(10 * dpr, pw2 / 5)}px sans-serif`;
                        if (p.nome) ctx.fillText(p.nome, px + 4 * dpr, py + 13 * dpr, pw2 - 8 * dpr);
                        if (ph2 > 24 * dpr) {
                            ctx.fillStyle = isB ? 'rgba(50,80,160,0.55)' : 'rgba(70,45,15,0.60)';
                            ctx.font = `${Math.min(8 * dpr, pw2 / 7)}px monospace`;
                            ctx.fillText(`${Math.round(p.w)}×${Math.round(p.h)}`, px + 4 * dpr, py + 23 * dpr, pw2 - 8 * dpr);
                        }
                    }

                    // ── Side badge (A or B) — top-right corner of piece ──────
                    if (pw2 > 18 * dpr && ph2 > 12 * dpr && !filtered) {
                        const badgeW = 14 * dpr, badgeH = 11 * dpr;
                        const bx = px + pw2 - badgeW - 2 * dpr;
                        const by = py + 2 * dpr;
                        // Badge background
                        ctx.fillStyle = isB ? 'rgba(50,80,200,0.82)' : 'rgba(30,90,50,0.78)';
                        ctx.beginPath();
                        ctx.roundRect?.(bx, by, badgeW, badgeH, 2 * dpr) || ctx.rect(bx, by, badgeW, badgeH);
                        ctx.fill();
                        // Badge text
                        ctx.fillStyle = '#ffffff';
                        ctx.font = `bold ${8 * dpr}px monospace`;
                        ctx.textAlign = 'center';
                        ctx.fillText(lado, bx + badgeW / 2, by + 8 * dpr);
                        ctx.textAlign = 'left';
                        // Small dot on badge if piece has both sides
                        if (p.has_b && !isB) {
                            ctx.fillStyle = 'rgba(80,130,255,0.90)';
                            ctx.beginPath();
                            ctx.arc(bx + badgeW - 2 * dpr, by + 2 * dpr, 2.5 * dpr, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }

                    ctx.globalAlpha = 1;
                }
            }
            // ── Scraps (retalhos) — dashed green outline ───────────────────
            if (chapa.retalhos) {
                const ref = chapa.refilo || 10;
                ctx.setLineDash([5 * dpr, 3 * dpr]);
                for (const r of chapa.retalhos) {
                    const rx = tx(ref + r.x), ry = Math.min(ty(ref + r.y), ty(ref + r.y + r.h));
                    ctx.strokeStyle = 'rgba(20,120,60,0.55)'; ctx.lineWidth = 1 * dpr;
                    ctx.strokeRect(rx, ry, r.w * sc, r.h * sc);
                }
                ctx.setLineDash([]);
            }
        }

        // ── Moves ──────────────────────────────────────────────────────
        const drawCount = moveLimit < 0 ? allMoves.length : Math.min(moveLimit + 1, allMoves.length);
        // ─── Pre-pass: collect helicoidal holes to draw as circles ────────
        // Only draw each helicoidal hole ONCE (at the last segment of the group)
        const helicalHoleDrawn = new Set();
        const drawHelicalHole = (m, cat) => {
            const hCx = tx(m.holeCx), hCy = ty(m.holeCy);
            const hR = Math.max((m.holeDiam / 2) * sc, 2 * dpr);
            const depth = espReal - m.z2;
            const depthRatio = Math.min(Math.max(depth / espReal, 0), 1);
            const neonColor = cat.glow;
            const isThrough = depthRatio > 0.85;
            ctx.globalAlpha = 1;
            if (isUsinagem) {
                // ── Furo helicoidal 3D — warm recessed hole on MDF ──────────────
                // Interior escuro (material removido), borda com reflexo MDF, sombra de profundidade

                // Outer shadow ring — casts shadow on sheet surface
                ctx.save();
                ctx.shadowColor = 'rgba(58,36,20,0.45)';
                ctx.shadowBlur = hR * 0.8;
                ctx.fillStyle = '#5a351c';
                ctx.globalAlpha = 0.3;
                ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Recessed interior — deep MDF brown for depth without a black UI feel
                ctx.fillStyle = isThrough ? '#3a2414' : '#5a351c';
                ctx.globalAlpha = 0.88;
                ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();

                // 3D depth gradient — tiny highlight near top-left, dark rim
                const depthGrad = ctx.createRadialGradient(
                    hCx - hR * 0.35, hCy - hR * 0.35, 0,
                    hCx, hCy, hR
                );
                depthGrad.addColorStop(0,    'rgba(255,230,180,0.08)'); // tiny MDF highlight
                depthGrad.addColorStop(0.35, 'rgba(92,58,28,0.20)');
                depthGrad.addColorStop(0.7,  'rgba(70,42,22,0.48)');
                depthGrad.addColorStop(1,    'rgba(48,30,18,0.82)');
                ctx.fillStyle = depthGrad;
                ctx.globalAlpha = 1;
                ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();

                // Rim — warm MDF edge color (real machined rim)
                const rimColor = 'rgba(200,158,78,0.90)';
                ctx.strokeStyle = rimColor;
                ctx.lineWidth = Math.max(1.2 * dpr, hR * 0.10);
                ctx.globalAlpha = 0.90;
                ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.stroke();

                // Operation color thin overlay on rim
                const hInnerR = hR - Math.max(1.5 * dpr, hR * 0.12);
                if (hInnerR > 0.5) {
                    ctx.strokeStyle = neonColor;
                    ctx.lineWidth = Math.max(0.7 * dpr, hR * 0.05);
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath(); ctx.arc(hCx, hCy, hInnerR, 0, Math.PI * 2); ctx.stroke();
                }

                // Cross for through-holes (center lines)
                if (isThrough && hR > 4 * dpr) {
                    ctx.strokeStyle = 'rgba(200,158,78,0.35)';
                    ctx.lineWidth = 0.7 * dpr;
                    ctx.globalAlpha = 0.55;
                    const cr = hR * 0.48;
                    ctx.beginPath(); ctx.moveTo(hCx - cr, hCy); ctx.lineTo(hCx + cr, hCy); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(hCx, hCy - cr); ctx.lineTo(hCx, hCy + cr); ctx.stroke();
                }
            } else {
                ctx.fillStyle = neonColor; ctx.globalAlpha = 0.15;
                ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = cat.color; ctx.lineWidth = Math.max(1 * dpr, hR * 0.15); ctx.globalAlpha = 0.75;
                ctx.beginPath(); ctx.arc(hCx, hCy, hR, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        };

        for (let i = 0; i < drawCount; i++) {
            const m = allMoves[i];
            const x1 = tx(m.x1), y1 = ty(m.y1), x2 = tx(m.x2), y2 = ty(m.y2);
            const toolD = moveToolDiams[i];

            // ── Helicoidal hole: skip individual arc lines, draw circle at last segment ──
            if (m.isHelicalHole) {
                const cat = getOpCat(m.op);
                if (hiddenCats.has(cat.key)) continue;
                // Check if next move is also in the same helicoidal group
                const nextIsHelical = i + 1 < drawCount && allMoves[i + 1].isHelicalHole &&
                    Math.abs(allMoves[i + 1].holeCx - m.holeCx) < 1 && Math.abs(allMoves[i + 1].holeCy - m.holeCy) < 1;
                if (!nextIsHelical) {
                    // Last segment of this helicoidal group — draw the circle
                    const hKey = `${m.holeCx.toFixed(1)}_${m.holeCy.toFixed(1)}`;
                    if (!helicalHoleDrawn.has(hKey)) {
                        helicalHoleDrawn.add(hKey);
                        drawHelicalHole(m, cat);
                    }
                }
                continue;
            }

            if (m.type === 'G0') {
                // Rapids — blue-gray dashed lines (visible in both modes)
                if (!m.isZOnly) {
                    if (!showRapids) continue;
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
                    ctx.strokeStyle = isUsinagem ? 'rgba(80,60,30,0.35)' : 'rgba(80,120,200,0.50)';
                    ctx.lineWidth = (isUsinagem ? 0.6 : 1.0) * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]);
                    ctx.stroke(); ctx.setLineDash([]);
                }
            } else if (m.isZOnly) {
                // ── Furo (hole) — real diameter circle, proportional ──
                const cat = getOpCat(m.op);
                // Filter by hidden categories
                if (hiddenCats.has(cat.key)) continue;
                const depth = espReal - m.z2;
                const depthRatio = Math.min(Math.max(depth / espReal, 0), 1);
                if (depthRatio > 0.02) {
                    const r = Math.max((toolD / 2) * sc, 1 * dpr);
                    const neonColor = cat.glow;
                    const isThrough = depthRatio > 0.9;
                    // Fill intensity scales with depth — deeper = more opaque fill
                    const fillAlpha = 0.15 + depthRatio * 0.45; // 0.15..0.60
                    if (isUsinagem) {
                        // ── Furo vertical 3D — warm recessed mark on light MDF ─────────
                        ctx.save();
                        ctx.shadowColor = 'rgba(58,36,20,0.38)';
                        ctx.shadowBlur = r * 0.7;
                        ctx.fillStyle = '#5a351c'; ctx.globalAlpha = 0.22;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();

                        ctx.fillStyle = isThrough ? '#3a2414' : '#5a351c';
                        ctx.globalAlpha = 0.86;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();

                        const ihGrad = ctx.createRadialGradient(x2 - r * 0.35, y2 - r * 0.35, 0, x2, y2, r);
                        ihGrad.addColorStop(0,    'rgba(255,225,170,0.07)');
                        ihGrad.addColorStop(0.4,  'rgba(92,58,28,0.24)');
                        ihGrad.addColorStop(1,    'rgba(58,36,20,0.78)');
                        ctx.fillStyle = ihGrad; ctx.globalAlpha = 1;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.fill();

                        // Warm MDF rim
                        ctx.strokeStyle = 'rgba(200,158,78,0.88)';
                        ctx.lineWidth = Math.max(1.0 * dpr, r * 0.12);
                        ctx.globalAlpha = 0.88;
                        ctx.beginPath(); ctx.arc(x2, y2, r, 0, Math.PI * 2); ctx.stroke();
                        const innerR2 = r - Math.max(1.2 * dpr, r * 0.13);
                        if (innerR2 > 0.5) {
                            ctx.strokeStyle = neonColor;
                            ctx.lineWidth = Math.max(0.6 * dpr, r * 0.06);
                            ctx.globalAlpha = 0.60;
                            ctx.beginPath(); ctx.arc(x2, y2, innerR2, 0, Math.PI * 2); ctx.stroke();
                        }

                        if (isThrough && r > 3 * dpr) {
                            ctx.strokeStyle = 'rgba(200,158,78,0.32)';
                            ctx.lineWidth = 0.6 * dpr; ctx.globalAlpha = 0.5;
                            const cr = r * 0.48;
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
            } else {
                // ── Corte (cut) ──
                const cat = getOpCat(m.op);
                // Filter by hidden categories
                if (hiddenCats.has(cat.key)) continue;
                const depth = espReal - m.z2;
                const depthRatio = Math.min(Math.max(depth / espReal, 0), 1);
                const neonColor = cat.glow;
                const toolW = Math.max(toolD * sc * 0.7, 1.2 * dpr);
                // Passante (contorno) = full intensity, parcial (rebaixo) = softer
                const isPassante = depthRatio > 0.9;
                if (isUsinagem && depthRatio > 0.01) {
                    // ── 2.5D KERF / GROOVE SIMULATION ──────────────────────────────────
                    // Visualização realista: sulco escuro fresado na chapa clara de MDF.
                    //   • Interior escuro  = material removido (madeira/MDF interior)
                    //   • Borda esquerda clara = reflexo de luz lateral
                    //   • Borda direita escura = sombra profunda
                    //   • Faixa colorida central = identificação do tipo de operação

                    const kerfW = Math.max(toolD * sc * 0.90, 1.6 * dpr);

                    // 1. Groove interior — dark warm brown (exposed MDF fiber, not black)
                    //    Through-cuts = very dark; shallow = medium dark brown
                    const grooveDark = isPassante ? '#3a2414' : `rgba(86,52,26,${0.66 + depthRatio * 0.20})`;
                    ctx.strokeStyle = grooveDark;
                    ctx.globalAlpha = 0.88 + depthRatio * 0.12;
                    ctx.lineWidth = kerfW;
                    ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

                    // 2. Lateral edge lighting — 3D groove illusion
                    const ddx = x2 - x1, ddy = y2 - y1;
                    const dlen = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (dlen > 0.5 * dpr && kerfW > 1.8 * dpr) {
                        const nx = -ddy / dlen, ny = ddx / dlen; // left-normal
                        const edgeOff = kerfW * 0.43;
                        const edgeW = Math.max(0.9 * dpr, kerfW * 0.12);

                        // Lit edge (top-left light source) — warm cream shimmer
                        ctx.strokeStyle = 'rgba(245,210,150,0.85)';
                        ctx.globalAlpha = 0.40 + depthRatio * 0.30;
                        ctx.lineWidth = edgeW;
                        ctx.lineCap = 'butt';
                        ctx.beginPath();
                        ctx.moveTo(x1 + nx * edgeOff, y1 + ny * edgeOff);
                        ctx.lineTo(x2 + nx * edgeOff, y2 + ny * edgeOff);
                        ctx.stroke();

                        // Shadow edge (bottom-right) — warm recessed MDF shadow
                        ctx.strokeStyle = 'rgba(58,36,20,0.72)';
                        ctx.globalAlpha = 0.44 + depthRatio * 0.25;
                        ctx.lineWidth = Math.max(0.6 * dpr, kerfW * 0.08);
                        ctx.beginPath();
                        ctx.moveTo(x1 - nx * edgeOff, y1 - ny * edgeOff);
                        ctx.lineTo(x2 - nx * edgeOff, y2 - ny * edgeOff);
                        ctx.stroke();
                        ctx.lineCap = 'round';
                    }

                    // 3. Color identification stripe at center — operation type or feed heatmap
                    const stripeColor = heatmapMode ? feedHeatColor(m.feed, minFeed, maxFeed) : neonColor;
                    ctx.strokeStyle = stripeColor;
                    ctx.globalAlpha = (isPassante ? 0.82 : 0.62) * (0.5 + depthRatio * 0.5);
                    ctx.lineWidth = Math.max(kerfW * (heatmapMode ? 0.32 : 0.20), 0.7 * dpr);
                    ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

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
                ctx.fillStyle = 'var(--success)'; ctx.beginPath();
                ctx.arc(tx(first.x1), ty(first.y1), 4 * dpr, 0, Math.PI * 2); ctx.fill();
                const last = allMoves[allMoves.length - 1];
                ctx.fillStyle = 'var(--danger)'; ctx.beginPath();
                ctx.arc(tx(last.x2), ty(last.y2), 4 * dpr, 0, Math.PI * 2); ctx.fill();
            } else if (moveLimit < allMoves.length) {
                const cur = allMoves[moveLimit];
                const curCat = getOpCat(cur.op);
                const isCutting = cur.type !== 'G0' && (espReal - cur.z2) > 0.5;
                const spindleColor = isCutting ? curCat.glow : '#2563eb';

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

        if (viewRotated) ctx.restore();
    }, [gcode, chapa, allMoves, allEvents, zoom, panOff, espReal, dims, simMode, moveToolDiams, hiddenCats, showRapids, heatmapMode, minFeed, maxFeed, autoOrient, getPieceAt, sideFilter]);

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
        const viewRotated = autoOrient && cl > cw;
        const pad = 24 * dpr;
        const fitW = viewRotated ? cl : cw;
        const fitH = viewRotated ? cw : cl;
        const sc = Math.min((W - 2 * pad) / fitW, (H - 2 * pad) / fitH) * zoom;
        const offX = pad + panOff.x * dpr + ((W - pad * 2) - fitW * sc) / 2;
        const offY = pad + panOff.y * dpr + ((H - pad * 2) - fitH * sc) / 2;
        // Convert mouse to sheet coords (accounting for dpr)
        const localX = mx * dpr - offX;
        const localY = my * dpr - offY;
        const sheetX = viewRotated ? localY / sc : localX / sc;
        const sheetY = viewRotated ? localX / sc : cl - (localY / sc);
        const found = getPieceAt(sheetX, sheetY);
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

    // ─── Filter helpers ───────────────────────────────────────────────────
    const toggleCat = (key) => {
        setHiddenCats(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };
    const hasActiveFilters = hiddenCats.size > 0 || !showRapids;

    // ─── Next/Prev tool jump ──────────────────────────────────────────────
    const jumpNextTool = () => {
        const next = toolEvents.find(ev => ev.moveIdx > curMove);
        if (next) { setPlaying(false); setCurMove(next.moveIdx); }
    };
    const jumpPrevTool = () => {
        const prev = [...toolEvents].reverse().find(ev => ev.moveIdx < curMove);
        if (prev) { setPlaying(false); setCurMove(prev.moveIdx); }
    };

    const currentMove = curMove >= 0 && curMove < allMoves.length ? allMoves[curMove] : null;
    const activePiece = currentMove ? getPieceAt(currentMove.x2, currentMove.y2) : null;
    const isPortraitSheet = Boolean(chapa) && (chapa.largura || 1850) > (chapa.comprimento || 2750);
    const progressPct = allMoves.length ? Math.round(((curMove < 0 ? allMoves.length : curMove + 1) / allMoves.length) * 100) : 0;
    const { tool: activeTool, op: activeOp } = curMove >= 0 ? getActiveEventsAt(curMove) : { tool: '', op: '' };
    const activeCat = activeOp ? getOpCat(activeOp) : null;
    const activeFeed = currentMove?.feed || 0;
    const activeZ = Number.isFinite(currentMove?.z2) ? currentMove.z2 : null;
    const nextTool = toolEvents.find(ev => ev.moveIdx > curMove);
    const activeOperationBlock = curMove >= 0
        ? operationBlocks.find(op => curMove >= op.start && curMove <= op.end)
        : null;
    const jumpToOperation = (op, focus = false) => {
        setPlaying(false);
        setCurMove(op.start);
        if (focus) {
            setZoom(z => Math.max(z, 1.35));
            setPanOff({ x: 0, y: 0 });
        }
    };
    const activeLineLabel = currentMove
        ? `${currentMove.type}${currentMove.x2 != null ? ` X${currentMove.x2.toFixed(1)}` : ''}${currentMove.y2 != null ? ` Y${currentMove.y2.toFixed(1)}` : ''}${activeZ != null ? ` Z${activeZ.toFixed(2)}` : ''}`
        : 'Visão geral do percurso';

    const renderMiniMetric = ({ label, value, tone = '#2f2a24' }) => (
        <div style={{
            padding: '8px 10px',
            borderRadius: 7,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            minWidth: 0,
        }}>
            <div style={{ color: tone, fontSize: 15, lineHeight: 1, fontWeight: 850, fontFamily: 'JetBrains Mono, Consolas, monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {value}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 8, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 5 }}>
                {label}
            </div>
        </div>
    );

    const renderLayerButton = ({ active, label, color, onClick, dashed }) => (
        <button
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                width: '100%',
                padding: '7px 9px',
                borderRadius: 7,
                border: `1px solid ${active ? 'var(--border)' : 'var(--bg-muted)'}`,
                background: active ? 'var(--bg-card)' : 'var(--bg-muted)',
                color: active ? '#2f2a24' : '#9a8f83',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 11,
                fontWeight: 750,
            }}
        >
            <span style={{
                width: 18,
                height: dashed ? 0 : 8,
                borderRadius: dashed ? 0 : 99,
                borderTop: dashed ? `2px dashed ${color}` : 'none',
                background: dashed ? 'transparent' : color,
                opacity: active ? 1 : 0.35,
                flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </button>
    );

    const simContent = (isFS) => {
        const hasToolRow = toolEvents.length >= 2;
        const br = isFS ? 0 : '0 0 8px 8px';
        const sideW = isFS ? 320 : Math.min(260, Math.max(210, Math.round(dims.w * 0.30)));

        return (
            <div style={isFS
                ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99999, background: '#f4f1ea', display: 'flex', flexDirection: 'column' }
                : { position: 'relative' }
            }>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `minmax(0, 1fr) ${sideW}px`,
                    minHeight: 0,
                    borderTop: isFS ? 'none' : '1px solid var(--border)',
                    borderRight: isFS ? 'none' : '1px solid var(--border)',
                    borderBottom: 'none',
                    borderLeft: isFS ? 'none' : '1px solid var(--border)',
                    borderRadius: isFS ? 0 : '8px 8px 0 0',
                    overflow: 'hidden',
                    background: '#f4f1ea',
                }}>
                    {/* ── Canvas — clean CAM viewport ── */}
                    <div ref={isFS ? undefined : wrapRef} style={{ position: 'relative', minWidth: 0, background: '#efe9df' }}>
                        <canvas ref={canvasRef}
                            style={{
                                cursor: panRef.current ? 'grabbing' : 'grab', display: 'block',
                                width: dims.w, height: dims.h, touchAction: 'none',
                            }}
                            onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp(); setHoverInfo(null); }}
                            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                        />

                        {/* Timeline panel overlay — slides in from right */}
                        {showTimeline && allEvents.length > 0 && (
                            <div style={{
                                position: 'absolute', top: 0, right: 0,
                                height: '100%', width: 240, zIndex: 10,
                                overflowY: 'auto', background: 'var(--bg-card)',
                                borderLeft: '1px solid var(--border)',
                                backdropFilter: 'blur(6px)',
                            }}>
                                <div style={{ padding: '10px 12px 6px', fontSize: 10, fontWeight: 850, color: 'var(--text-muted)', letterSpacing: 1, borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>EVENTOS</span>
                                    <button onClick={() => setShowTimeline(false)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                                        title="Fechar">x</button>
                                </div>
                                {allEvents.map((ev, idx) => {
                                    const isActive = idx === activeTimelineIdx;
                                    const pct = allMoves.length > 0 ? ((ev.moveIdx / allMoves.length) * 100).toFixed(0) : '0';
                                    const evColor = getEventColor(ev);
                                    return (
                                        <div key={idx}
                                            onClick={() => { setPlaying(false); setCurMove(ev.moveIdx); }}
                                            style={{
                                                padding: '7px 10px', fontSize: 10,
                                                borderBottom: '1px solid var(--border)',
                                                cursor: 'pointer',
                                                background: isActive ? 'rgba(37,99,235,0.10)' : 'transparent',
                                                borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                transition: 'background 0.1s',
                                            }}>
                                            <span style={{ fontSize: 11, flexShrink: 0 }}>{getEventIcon(ev)}</span>
                                            <span style={{ color: evColor, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.label}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: 9, flexShrink: 0 }}>{pct}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Piece tooltip on hover */}
                        {hoverInfo && hoverInfo.piece && (
                            <div style={{
                                position: 'absolute', left: hoverInfo.x, top: hoverInfo.y,
                                pointerEvents: 'none', zIndex: 50,
                                background: 'var(--bg-card)', border: '1px solid rgba(120,120,120,0.20)',
                                borderRadius: 6, padding: '6px 10px', maxWidth: 220,
                                boxShadow: '0 4px 16px rgba(70,50,25,0.18)',
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#5f4931', marginBottom: 2 }}>{hoverInfo.piece.nome || 'Peça'}</div>
                                <div style={{ fontSize: 10, color: '#8a6a42' }}>{Math.round(hoverInfo.piece.w)} × {Math.round(hoverInfo.piece.h)} mm</div>
                            </div>
                        )}
                    </div>

                    <aside style={{
                        minWidth: 0,
                        borderLeft: '1px solid var(--border)',
                        background: '#fbf8f2',
                        color: '#2f2a24',
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        overflowY: 'auto',
                        height: dims.h,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div>
                                <div style={{ color: '#2f2a24', fontSize: 13, fontWeight: 850 }}>Painel técnico</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>Simulação 2D CAM</div>
                            </div>
                            <span style={{
                                padding: '4px 8px',
                                borderRadius: 999,
                                background: playing ? 'rgba(22,163,74,0.12)' : 'rgba(37,99,235,0.10)',
                                border: `1px solid ${playing ? 'rgba(22,163,74,0.30)' : 'rgba(37,99,235,0.25)'}`,
                                color: playing ? '#15803d' : '#2563eb',
                                fontSize: 10,
                                fontWeight: 850,
                            }}>
                                {playing ? 'Rodando' : curMove >= 0 ? 'Pausado' : 'Pronto'}
                            </span>
                        </div>

                        <div style={{ height: 7, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div style={{ width: `${progressPct}%`, height: '100%', background: playing ? '#22c55e' : '#2563eb' }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                            {renderMiniMetric({ label: 'Mov.', value: curMove >= 0 ? `${curMove + 1}/${allMoves.length}` : allMoves.length, tone: '#2563eb' })}
                            {renderMiniMetric({ label: 'Zoom', value: `${(zoom * 100).toFixed(0)}%`, tone: '#2f2a24' })}
                            {renderMiniMetric({ label: 'Feed', value: activeFeed ? `${activeFeed.toFixed(0)}` : '—', tone: 'var(--primary)' })}
                            {renderMiniMetric({ label: 'Z atual', value: activeZ != null ? activeZ.toFixed(2) : '—', tone: activeZ != null && activeZ < 0 ? '#b91c1c' : '#2f2a24' })}
                        </div>

                        <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Ferramenta atual</div>
                            <div style={{ color: activeTool ? 'var(--primary)' : 'var(--text-muted)', fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>
                                {activeTool || 'Aguardando início'}
                            </div>
                            {nextTool && (
                                <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 7 }}>
                                    Próxima: <span style={{ color: '#2f2a24' }}>{nextTool.label}</span>
                                </div>
                            )}
                        </div>

                        <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Operação</div>
                            <div style={{ color: activeCat?.glow || '#2f2a24', fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>
                                {activeOp || (curMove >= 0 ? 'Sem metadado de operação' : 'Visão geral')}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 7, fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
                                {activeLineLabel}
                            </div>
                            {activePiece && (
                                <div style={{ color: '#2563eb', fontSize: 10, marginTop: 7, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Peça: {activePiece.nome || activePiece.descricao || 'sem nome'}
                                </div>
                            )}
                            {activeOperationBlock && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                                    <span style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--bg-muted)', overflow: 'hidden' }}>
                                        <span style={{
                                            display: 'block',
                                            width: `${Math.max(3, Math.min(100, ((curMove - activeOperationBlock.start + 1) / Math.max(1, activeOperationBlock.end - activeOperationBlock.start + 1)) * 100))}%`,
                                            height: '100%',
                                            background: activeOperationBlock.cat.glow,
                                        }} />
                                    </span>
                                    <button
                                        onClick={() => jumpToOperation(activeOperationBlock, true)}
                                        style={{ ...CTRL.btn, padding: '4px 7px', fontSize: 9 }}
                                        title="Centralizar e ampliar a operação atual"
                                    >
                                        Focar
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                            {renderMiniMetric({ label: 'Corte', value: `${stats.cutDistM}m`, tone: '#15803d' })}
                            {renderMiniMetric({ label: 'Rápido', value: `${stats.rapidDistM}m`, tone: '#c2410c' })}
                        </div>

                        {operationBlocks.length > 0 && (
                            <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Sequência operacional
                                    </div>
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 750 }}>
                                        {operationBlocks.length} etapas
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', paddingRight: 2 }}>
                                    {operationBlocks.map((op, idx) => {
                                        const isActive = curMove >= op.start && curMove <= op.end;
                                        const opProgress = isActive
                                            ? Math.max(3, Math.min(100, ((curMove - op.start + 1) / Math.max(1, op.end - op.start + 1)) * 100))
                                            : 0;
                                        return (
                                            <button
                                                key={op.id}
                                                ref={isActive ? el => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) : undefined}
                                                onClick={() => jumpToOperation(op)}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '3px 18px minmax(0,1fr) auto',
                                                    gap: 6,
                                                    alignItems: 'center',
                                                    padding: '6px 7px 6px 0',
                                                    borderRadius: 7,
                                                    border: `1px solid ${isActive ? op.cat.glow : 'var(--bg-muted)'}`,
                                                    background: isActive ? `color-mix(in srgb, ${op.cat.glow} 10%, #fbf8f2)` : '#fbf8f2',
                                                    color: '#2f2a24',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    overflow: 'hidden',
                                                    transition: 'background 0.2s, border-color 0.2s',
                                                    boxShadow: isActive ? `0 0 0 1.5px ${op.cat.glow}40` : 'none',
                                                }}
                                            >
                                                {/* Active stripe */}
                                                <span style={{
                                                    display: 'block', width: 3, height: '100%', minHeight: 28,
                                                    background: isActive ? op.cat.glow : 'transparent',
                                                    borderRadius: '4px 0 0 4px',
                                                    transition: 'background 0.2s',
                                                    marginLeft: 0,
                                                    alignSelf: 'stretch',
                                                }} />
                                                <span style={{
                                                    width: 16, height: 16, borderRadius: 999,
                                                    background: isActive ? op.cat.glow : '#e5ddd2',
                                                    color: isActive ? '#fff' : 'var(--text-muted)',
                                                    display: 'grid', placeItems: 'center',
                                                    fontSize: 8, fontWeight: 900, flexShrink: 0,
                                                    transition: 'background 0.2s',
                                                }}>
                                                    {idx + 1}
                                                </span>
                                                <span style={{ minWidth: 0 }}>
                                                    <span style={{ display: 'block', fontSize: 10, fontWeight: isActive ? 900 : 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isActive ? '#1a1614' : '#2f2a24' }}>
                                                        {op.label}
                                                    </span>
                                                    <span style={{ display: 'block', fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {op.tool || op.cat.label}
                                                    </span>
                                                    {isActive && (
                                                        <span style={{ display: 'block', height: 2, borderRadius: 999, background: 'var(--bg-muted)', marginTop: 3, overflow: 'hidden' }}>
                                                            <span style={{ display: 'block', height: '100%', width: `${opProgress}%`, background: op.cat.glow, transition: 'width 0.15s' }} />
                                                        </span>
                                                    )}
                                                </span>
                                                <span style={{ fontSize: 9, color: isActive ? op.cat.glow : 'var(--text-muted)', fontFamily: 'JetBrains Mono, Consolas, monospace', whiteSpace: 'nowrap', fontWeight: isActive ? 800 : 400, paddingRight: 4 }}>
                                                    {op.cutM.toFixed(1)}m
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div style={{ padding: 10, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Camadas</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {renderLayerButton({ active: showRapids, label: 'Movimentos rápidos', color: '#8a7050', dashed: true, onClick: () => setShowRapids(r => !r) })}
                                {foundOps.map(cat => (
                                    <span key={cat.key}>
                                        {renderLayerButton({ active: !hiddenCats.has(cat.key), label: cat.label, color: cat.glow, onClick: () => toggleCat(cat.key) })}
                                    </span>
                                ))}
                                {hasActiveFilters && (
                                    <button onClick={() => { setHiddenCats(new Set()); setShowRapids(true); }} style={{
                                        marginTop: 2,
                                        padding: '7px 9px',
                                        borderRadius: 7,
                                        border: '1px solid #d7cbbb',
                                        background: 'var(--bg-card)',
                                        color: '#2563eb',
                                        cursor: 'pointer',
                                        fontSize: 11,
                                        fontWeight: 800,
                                    }}>
                                        Restaurar camadas
                                    </button>
                                )}
                            </div>
                        </div>
                    </aside>
                </div>

                {/* ── Stats panel (collapsible) ── */}
                {showStats && (
                    <div style={{ background: '#fbf8f2', border: '1px solid var(--border)', borderTop: 'none', padding: '7px 10px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {[
                                { label: 'Movimentos', value: stats.total },
                                { label: 'Cortes', value: stats.cutMoves },
                                { label: 'Rápidos', value: stats.rapidMoves },
                                { label: 'Dist. Corte', value: `${stats.cutDistM}m` },
                                { label: 'Dist. Rápido', value: `${stats.rapidDistM}m` },
                                ...Object.entries(stats.catCounts).map(([key, count]) => {
                                    const cat = OP_CATS.find(c => c.key === key) || { label: key, glow: '#c8a870' };
                                    return { label: cat.label, value: count, color: cat.glow };
                                }),
                            ].map((tile, i) => (
                                <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', minWidth: 68, textAlign: 'center' }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: tile.color || 'var(--text-muted)', fontFamily: 'monospace' }}>{tile.value}</div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{tile.label}</div>
                                </div>
                            ))}
                        </div>
                        {/* Side A/B breakdown */}
                        {chapa?.pecas?.length > 0 && (() => {
                            const cA = chapa.pecas.filter(p => (p.lado_ativo || 'A') === 'A').length;
                            const cB = chapa.pecas.filter(p => p.lado_ativo === 'B').length;
                            const cAB = chapa.pecas.filter(p => p.has_b).length;
                            return (cA + cB > 0) ? (
                                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lados:</span>
                                    {cA > 0 && <span style={{ fontSize: 10, background: '#dcfce7', border: '1px solid #166534', color: '#166534', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>A: {cA} peças</span>}
                                    {cB > 0 && <span style={{ fontSize: 10, background: '#dbeafe', border: '1px solid #3b52c4', color: '#3b52c4', borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>B: {cB} peças</span>}
                                    {cAB > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>· {cAB} peça(s) com 2 lados</span>}
                                </div>
                            ) : null;
                        })()}
                    </div>
                )}

                {/* ── Row 1: Transport bar ── */}
                <div style={CTRL.bar}>
                    {/* Primary play/pause — larger, color-coded */}
                    {!playing
                        ? <button onClick={handlePlay} style={{
                            ...CTRL.btnAct,
                            padding: '6px 14px', fontSize: 11, fontWeight: 700, gap: 6,
                            background: 'var(--success, #16a34a)', borderColor: 'var(--success, #15803d)',
                          }} title="Reproduzir simulação (Espaço)">
                            <Play size={12} /> {curMove >= allMoves.length - 1 && curMove >= 0 ? 'Reiniciar' : 'Reproduzir'}
                          </button>
                        : <button onClick={handlePause} style={{
                            ...CTRL.btnAct,
                            padding: '6px 14px', fontSize: 11, fontWeight: 700, gap: 6,
                            background: 'var(--warning)', borderColor: 'var(--warning)',
                            animation: 'simPulse 1.4s ease-in-out infinite',
                          }} title="Pausar simulação (Espaço)">
                            <Pause size={12} /> Pausar
                          </button>
                    }
                    <button onClick={handleStop} style={{ ...CTRL.btn }} title="Parar (Esc)">
                        <Square size={11} />
                    </button>
                    <div style={CTRL.sep} />
                    <button onClick={() => handleStep(-1)} style={CTRL.btn} title="Movimento anterior (←)">
                        <ChevronLeft size={13} /> Ant
                    </button>
                    <button onClick={() => handleStep(1)} style={CTRL.btn} title="Próximo movimento (→)">
                        Próx <ChevronRight size={13} />
                    </button>
                    {toolEvents.length > 0 && <>
                        <div style={CTRL.sep} />
                        <button onClick={jumpPrevTool} style={CTRL.btn} title="Ferramenta anterior">
                            <Wrench size={11} /> <ChevronLeft size={11} />
                        </button>
                        <button onClick={jumpNextTool} style={CTRL.btn} title="Próxima ferramenta">
                            <Wrench size={11} /> <ChevronRight size={11} />
                        </button>
                    </>}
                    <input type="range" min={0} max={Math.max(0, allMoves.length - 1)} value={curMove < 0 ? 0 : curMove}
                        onChange={handleSlider} style={{ flex: '1 1 170px', minWidth: 140, height: 4, accentColor: playing ? 'var(--success)' : 'var(--primary)', cursor: 'pointer' }} />
                    <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                        style={{ ...CTRL.btn, padding: '2px 6px', fontSize: 10 }}>
                        {[0.5,1,2,5,10,20,50,100,200].map(v => <option key={v} value={v}>{v}x</option>)}
                    </select>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', minWidth: 76, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {curMove >= 0 ? `${curMove + 1}/${allMoves.length}` : `${allMoves.length} mov`}
                    </span>
                    <style>{`@keyframes simPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,112,0,0.35); } 50% { box-shadow: 0 0 0 5px rgba(220,112,0,0); } }`}</style>
                </div>

                {/* ── Row 2: View controls — 3 zones: Visualização | Filtros | Painéis ── */}
                <div style={{
                    ...CTRL.bar2,
                    borderLeft: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    borderTop: 'none',
                    borderRadius: hasToolRow ? 0 : br,
                    justifyContent: 'space-between',
                }}>
                    {/* Zone 1: Visualização */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.3))} style={CTRL.btn} title="Diminuir zoom">−</button>
                        <span style={{ fontSize: 10, color: 'var(--text-primary)', minWidth: 32, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{(zoom * 100).toFixed(0)}%</span>
                        <button onClick={() => setZoom(z => Math.min(8, z + 0.3))} style={CTRL.btn} title="Aumentar zoom">+</button>
                        <button onClick={() => { setZoom(1); setPanOff({ x: 0, y: 0 }); }} style={CTRL.btn} title="Encaixar na tela (F)">Encaixar</button>
                        <div style={CTRL.sep} />
                        {/* Mode segmented */}
                        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #d7cbbb' }}>
                            {[['usinagem', 'CAM'], ['trajetoria', 'Percurso']].map(([m, lbl]) => (
                                <button key={m} onClick={() => setSimMode(m)} style={{
                                    padding: '4px 9px', fontSize: 10, fontWeight: 800, cursor: 'pointer', border: 'none',
                                    background: simMode === m ? '#2563eb' : 'var(--bg-card)',
                                    color: simMode === m ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s',
                                }}>{lbl}</button>
                            ))}
                        </div>
                        {isPortraitSheet && (
                            <>
                                <div style={CTRL.sep} />
                                <button onClick={() => { setAutoOrient(v => !v); setPanOff({ x: 0, y: 0 }); setZoom(1); setHoverInfo(null); }}
                                    style={autoOrient ? { ...CTRL.btnAct, padding: '4px 8px', fontSize: 10 } : { ...CTRL.btn, padding: '4px 8px', fontSize: 10 }}
                                    title={autoOrient ? 'Voltar orientação original' : 'Girar visualização para ocupar melhor o canvas'}>
                                    ↻ {autoOrient ? 'Vertical' : 'Girar'}
                                </button>
                            </>
                        )}
                    </div>

                    {/* Zone 2: Filtros */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        {chapa?.pecas?.length > 0 && (() => {
                            const countA = chapa.pecas.filter(p => (p.lado_ativo || 'A') === 'A').length;
                            const countB = chapa.pecas.filter(p => p.lado_ativo === 'B').length;
                            return countB > 0 ? (
                                <>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>Lado:</span>
                                    <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid #d7cbbb' }}>
                                        {[['all', 'A+B'], ['A', `A(${countA})`], ['B', `B(${countB})`]].map(([v, lbl]) => (
                                            <button key={v} onClick={() => setSideFilter(v)} style={{
                                                padding: '3px 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
                                                background: sideFilter === v ? (v === 'B' ? '#3b52c4' : v === 'A' ? '#166534' : '#2563eb') : 'var(--bg-card)',
                                                color: sideFilter === v ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s',
                                            }}>{lbl}</button>
                                        ))}
                                    </div>
                                    <div style={CTRL.sep} />
                                </>
                            ) : null;
                        })()}
                        <button onClick={() => setHeatmapMode(h => !h)}
                            style={{
                                ...CTRL.btn, fontWeight: 700, fontSize: 10,
                                background: heatmapMode ? 'linear-gradient(90deg,#c03020 0%,#d4a020 50%,#1890d0 100%)' : 'var(--bg-card)',
                                color: heatmapMode ? '#fff' : 'var(--text-muted)',
                                border: heatmapMode ? '1px solid var(--primary)' : undefined,
                            }}
                            title="Colorir por velocidade de avanço">🌡 Feed</button>
                    </div>

                    {/* Zone 3: Painéis + Tela cheia */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => setShowStats(s => !s)}
                            style={{ ...( showStats ? CTRL.btnAct : CTRL.btn), fontSize: 10, padding: '4px 8px' }}
                            title="Estatísticas gerais">📊</button>
                        <button onClick={() => setShowTimeline(t => !t)}
                            style={{ ...(showTimeline ? CTRL.btnAct : CTRL.btn), fontSize: 10, padding: '4px 8px' }}
                            title="Painel de eventos">📋</button>
                        <div style={CTRL.sep} />
                        {/* Fullscreen — destaque próprio, canto direito */}
                        <button onClick={() => setFullscreen(f => !f)}
                            style={{
                                ...CTRL.btn, padding: '4px 9px', fontWeight: 800,
                                background: isFS ? '#2563eb' : 'var(--bg-card)',
                                color: isFS ? '#fff' : 'var(--text-primary)',
                                border: isFS ? '1px solid #2563eb' : undefined,
                            }}
                            title={isFS ? 'Sair tela cheia (ESC)' : 'Tela cheia'}>
                            {isFS ? '⊠ Sair' : '⛶ Expandir'}
                        </button>
                    </div>
                </div>

                {/* ── Legend bar — dedicated row, only when not in heatmap ── */}
                {!heatmapMode && foundOps.length > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    padding: '4px 12px', background: '#f7f4ef',
                    borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                    borderBottom: hasToolRow ? 'none' : '1px solid var(--border)',
                    borderTop: 'none',
                    borderRadius: hasToolRow ? 0 : br,
                    minHeight: 28,
                }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Camadas:</span>
                    <span onClick={() => setShowRapids(r => !r)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                            color: '#8a7050', opacity: showRapids ? 0.8 : 0.35,
                            cursor: 'pointer', userSelect: 'none',
                            textDecoration: showRapids ? 'none' : 'line-through' }}>
                        <span style={{ width: 14, height: 0, borderTop: '1.5px dashed #8a7050', display: 'inline-block' }} />
                        Rápido
                    </span>
                    {foundOps.map(cat => {
                        const isActive = activeOp && getOpCat(activeOp).key === cat.key;
                        const isHidden = hiddenCats.has(cat.key);
                        const isFuro = cat.key === 'furo';
                        return (
                            <span key={cat.key} onClick={() => toggleCat(cat.key)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                                    color: isActive ? cat.glow : 'var(--text-muted)',
                                    fontWeight: isActive ? 800 : 500, transition: 'all 0.15s',
                                    opacity: isHidden ? 0.3 : 1,
                                    textDecoration: isHidden ? 'line-through' : 'none',
                                    cursor: 'pointer', userSelect: 'none' }}>
                                <span style={{
                                    width: isFuro ? 7 : 10, height: isFuro ? 7 : 4,
                                    borderRadius: isFuro ? '50%' : 2, display: 'inline-block',
                                    background: isFuro ? 'transparent' : cat.glow,
                                    border: isFuro ? `1.5px solid ${cat.glow}` : 'none',
                                    opacity: isHidden ? 0.3 : isActive ? 1 : 0.6,
                                    boxShadow: isActive ? `0 0 4px ${cat.glow}` : 'none',
                                    flexShrink: 0,
                                }} />
                                {cat.label}
                            </span>
                        );
                    })}
                    {hasActiveFilters && (
                        <button onClick={() => { setHiddenCats(new Set()); setShowRapids(true); }}
                            style={{ fontSize: 9, padding: '2px 7px', cursor: 'pointer',
                                borderRadius: 4, border: '1px solid #d7cbbb', background: 'var(--bg-card)',
                                color: '#2563eb', lineHeight: 1.4, fontWeight: 700 }}>
                            Restaurar
                        </button>
                    )}
                    {/* Heatmap scale — shown in legend bar when heatmap active */}
                    {heatmapMode && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                            <span style={{ fontSize: 9, color: '#c03020', fontFamily: 'monospace' }}>{minFeed.toFixed(0)}</span>
                            <span style={{ width: 48, height: 5, borderRadius: 2, background: 'linear-gradient(90deg,#dc3c1e,#dcb41e,#16a050,#1464c0)', display: 'inline-block' }} />
                            <span style={{ fontSize: 9, color: '#1464c0', fontFamily: 'monospace' }}>{maxFeed.toFixed(0)} mm/min</span>
                        </span>
                    )}
                    {activeTool && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--primary)', fontWeight: 700, flexShrink: 0 }}>
                            ◈ {activeTool}
                        </span>
                    )}
                </div>
                )}

                {/* ── Row 3: Tool jump buttons (only when ≥2 tools) ── */}
                {hasToolRow && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 0,
                        padding: '6px 14px', background: '#fbf8f2',
                        border: '1px solid var(--border)', borderTop: 'none',
                        borderRadius: br, overflowX: 'auto',
                    }}>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 10 }}>
                            Sequência
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1 }}>
                            {toolEvents.map((ev, i) => {
                                const isActiveTool = i === activeToolIdx;
                                const isPast = i < activeToolIdx;
                                const isLast = i === toolEvents.length - 1;
                                const circleColor = isActiveTool ? 'var(--primary)' : isPast ? '#7c6a58' : '#c4bdb5';
                                const circleBg = isActiveTool ? '#ffe4b8' : isPast ? '#f0ebe5' : '#fbf8f2';
                                const circleBorder = isActiveTool ? 'var(--primary)' : isPast ? '#b5a898' : 'var(--border)';
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                        <button
                                            title={ev.label}
                                            onClick={() => { setPlaying(false); setCurMove(ev.moveIdx); }}
                                            style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                            }}>
                                            <div style={{
                                                width: isActiveTool ? 22 : 18,
                                                height: isActiveTool ? 22 : 18,
                                                borderRadius: '50%',
                                                background: circleBg,
                                                border: `2px solid ${circleBorder}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: isActiveTool ? 9 : 8,
                                                fontWeight: 800, color: circleColor,
                                                transition: 'all 0.2s',
                                                boxShadow: isActiveTool ? `0 0 0 3px ${circleColor}20` : 'none',
                                            }}>
                                                {i + 1}
                                            </div>
                                            <span style={{
                                                fontSize: 8, color: circleColor, fontWeight: isActiveTool ? 700 : 500,
                                                maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                lineHeight: 1.2,
                                            }}>
                                                {ev.label.replace(/^T[0-9]+\s*/, '').slice(0, 8)}
                                            </span>
                                        </button>
                                        {!isLast && (
                                            <div style={{
                                                width: 18, height: 2,
                                                background: isPast ? '#b5a898' : 'var(--border)',
                                                flexShrink: 0, margin: '0 0 10px',
                                            }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

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
