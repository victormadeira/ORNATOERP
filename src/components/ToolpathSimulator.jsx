import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Modal, Z } from '../ui';
import {
    Play, Pause, RotateCcw, ChevronRight, ChevronLeft, Layers,
    Grid3X3, Route, Wrench, Timer, MousePointer2,
} from 'lucide-react';

// ─── Parse G-code text into structured moves ────────────────────────
export function parseGcodeToMoves(gcodeText) {
    const moves = [];
    let x = 0, y = 0, z = 0, mode = 'G0', tool = 0, toolName = '', f = 0;
    for (const raw of (gcodeText || '').split('\n')) {
        const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
        if (!line) continue;
        const cmd = line.replace(/^N\d+\s*/, '');

        // Tool change: pick up code and name from comment on same/next line
        const tMatch = cmd.match(/^([A-Z]\d+)\s+M6/i) || cmd.match(/^T(\d+)/i);
        if (tMatch) {
            tool = tMatch[1];
            // Try to extract name from next tokens or parens
            const nameM = cmd.match(/\(([^)]+)\)/);
            if (nameM) toolName = nameM[1];
            continue;
        }

        const gMatch = cmd.match(/G([0-3])\b/i);
        if (gMatch) mode = `G${gMatch[1]}`;

        const xM = cmd.match(/X([+-]?[\d.]+)/i);
        const yM = cmd.match(/Y([+-]?[\d.]+)/i);
        const zM = cmd.match(/Z([+-]?[\d.]+)/i);
        const iM = cmd.match(/I([+-]?[\d.]+)/i);
        const jM = cmd.match(/J([+-]?[\d.]+)/i);
        const fM = cmd.match(/F([+-]?[\d.]+)/i);

        if (fM) f = parseFloat(fM[1]);
        const newX = xM ? parseFloat(xM[1]) : x;
        const newY = yM ? parseFloat(yM[1]) : y;
        const newZ = zM ? parseFloat(zM[1]) : z;

        if (xM || yM || zM) {
            moves.push({
                type: mode,
                x1: x, y1: y, z1: z,
                x2: newX, y2: newY, z2: newZ,
                i: iM ? parseFloat(iM[1]) : 0,
                j: jM ? parseFloat(jM[1]) : 0,
                f, tool, toolName,
            });
        }
        x = newX; y = newY; z = newZ;
    }
    return moves;
}

// ─── Detect tool changes ──────────────────────────────────────────────
function getToolChanges(moves) {
    const changes = [];
    let lastTool = null;
    for (let i = 0; i < moves.length; i++) {
        if (moves[i].tool !== lastTool) {
            changes.push({ idx: i, tool: moves[i].tool, name: moves[i].toolName, x: moves[i].x1, y: moves[i].y1 });
            lastTool = moves[i].tool;
        }
    }
    return changes;
}

// ─── Compute stats ─────────────────────────────────────────────────────
function computeStats(moves) {
    let cutDist = 0, rapidDist = 0;
    const toolSet = new Set();
    for (const m of moves) {
        const d = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
        if (m.type === 'G0') rapidDist += d;
        else cutDist += d;
        toolSet.add(m.tool);
    }
    const timeSec = (rapidDist / 1000) / (60 / 60) + (cutDist / 1000) / (10 / 60);
    return {
        cutDist: Math.round(cutDist),
        rapidDist: Math.round(rapidDist),
        toolCount: toolSet.size,
        toolChanges: Math.max(0, toolSet.size - 1),
        estimatedTime: Math.round(timeSec),
    };
}

// ─── Grid helper ──────────────────────────────────────────────────────
function buildGrid(w, h, interval) {
    const lines = [];
    for (let xi = 0; xi <= w; xi += interval)
        lines.push({ x1: xi, y1: 0, x2: xi, y2: h, vertical: true });
    for (let yi = 0; yi <= h; yi += interval)
        lines.push({ x1: 0, y1: yi, x2: w, y2: yi, vertical: false });
    return lines;
}

const PANEL_BG = '#11111b';
const SURFACE_BG = '#1e1e2e';
const LINE_SOFT = '#313244';
const TEXT_DIM = '#6c7086';
const TEXT_MAIN = '#cdd6f4';

function formatMmDistance(mm) {
    if (!Number.isFinite(mm)) return '0m';
    return `${(mm / 1000).toFixed(mm >= 10000 ? 0 : 1)}m`;
}

function StatTile({ icon: Icon, label, value, tone }) {
    return (
        <div style={{
            minWidth: 0,
            padding: '10px 12px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))',
            border: `1px solid ${tone}35`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
        }}>
            <div style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `${tone}18`,
                color: tone,
                flexShrink: 0,
            }}>
                <Icon size={15} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: TEXT_MAIN,
                    fontFamily: 'JetBrains Mono, Consolas, monospace',
                    lineHeight: 1.1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {value}
                </div>
                <div style={{
                    fontSize: 9,
                    color: TEXT_DIM,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginTop: 3,
                    whiteSpace: 'nowrap',
                }}>
                    {label}
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────
export default function ToolpathSimulator({ chapData, operations, isOpen, onClose }) {
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(-1); // -1 = show all
    const [speed, setSpeed] = useState(2);
    const [showGrid, setShowGrid] = useState(true);
    const [hoverPos, setHoverPos] = useState(null);
    const animRef = useRef(null);
    const svgRef = useRef(null);

    const moves = useMemo(() => {
        if (operations && operations.length > 0) return operations;
        return [];
    }, [operations]);

    const toolChanges = useMemo(() => getToolChanges(moves), [moves]);
    const stats = useMemo(() => computeStats(moves), [moves]);

    // Which tool change section are we in?
    const currentToolChange = useMemo(() => {
        if (progress < 0) return toolChanges[toolChanges.length - 1] || null;
        let cur = toolChanges[0] || null;
        for (const tc of toolChanges) {
            if (tc.idx <= progress) cur = tc;
            else break;
        }
        return cur;
    }, [progress, toolChanges]);

    // Compute bounds from sheet/moves
    const bounds = useMemo(() => {
        let maxX = chapData?.comprimento || 2750;
        let maxY = chapData?.largura || 1850;
        for (const m of moves) {
            if (isFinite(m.x2)) maxX = Math.max(maxX, m.x2);
            if (isFinite(m.y2)) maxY = Math.max(maxY, m.y2);
        }
        return { w: maxX, h: maxY };
    }, [moves, chapData]);

    // Grid lines (100mm intervals)
    const gridInterval = bounds.w > 1500 ? 200 : 100;
    const gridLines = useMemo(() => showGrid ? buildGrid(bounds.w, bounds.h, gridInterval) : [], [showGrid, bounds, gridInterval]);

    // Playback
    useEffect(() => {
        if (!playing || moves.length === 0) return;
        const step = Math.max(1, Math.floor(speed));
        animRef.current = setInterval(() => {
            setProgress(prev => {
                if (prev < 0) return 0;
                const next = prev + step;
                if (next >= moves.length - 1) { setPlaying(false); return moves.length - 1; }
                return next;
            });
        }, 16);
        return () => clearInterval(animRef.current);
    }, [playing, speed, moves.length]);

    // Reset when closed
    useEffect(() => {
        if (!isOpen) { setPlaying(false); setProgress(-1); }
    }, [isOpen]);

    const reset = () => { setPlaying(false); setProgress(-1); };
    const togglePlay = () => {
        if (progress >= moves.length - 1) setProgress(0);
        setPlaying(p => !p);
    };
    const stepBack = () => { setPlaying(false); setProgress(p => Math.max(0, (p < 0 ? moves.length - 1 : p) - 1)); };
    const stepFwd = () => { setPlaying(false); setProgress(p => Math.min(moves.length - 1, (p < 0 ? moves.length - 1 : p) + 1)); };

    const formatTime = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const progressLabel = progress < 0
        ? `Todos os ${moves.length} movimentos`
        : `Movimento ${progress + 1} / ${moves.length}`;
    const progressPct = moves.length > 0
        ? Math.round(((progress < 0 ? moves.length : progress + 1) / moves.length) * 100)
        : 0;

    const handleMouseMove = useCallback((e) => {
        const svg = svgRef.current;
        if (!svg) return;
        try {
            const pt = svg.createSVGPoint();
            pt.x = e.clientX; pt.y = e.clientY;
            const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
            // In SVG space: Y increases down. In CNC space: Y increases up from origin at bottom-left.
            // The geometry is drawn inside a flip group: translate(0, bounds.h) scale(1,-1)
            // So SVG_y = bounds.h - cnc_y → cnc_y = bounds.h - svg_y
            const cncX = svgPt.x;
            const cncY = bounds.h - svgPt.y;
            setHoverPos({ x: Math.round(cncX * 10) / 10, y: Math.round(cncY * 10) / 10 });
        } catch { /* ignore */ }
    }, [bounds.h]);

    if (!isOpen) return null;

    const drawCount = progress < 0 ? moves.length : Math.min(progress + 1, moves.length);
    const pad = 40;
    const viewW = bounds.w + pad * 2;
    const viewH = bounds.h + pad * 2;

    // In SVG, the flip group transform maps CNC coords to SVG coords:
    // SVG_y = bounds.h - cnc_y  (achieved by translate(0, bounds.h) scale(1, -1))
    // So CNC origin (0,0) → SVG (0, bounds.h) = bottom-left of sheet ✓
    const flipTransform = `translate(0, ${bounds.h}) scale(1, -1)`;

    // Compute SVG Y for text labels (outside flip group)
    const toSvgY = (cncY) => bounds.h - cncY;

    const curMove = progress >= 0 && progress < moves.length ? moves[progress] : null;

    return (
        <Modal title="Simulador de Percurso CNC" close={onClose} w={1180}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Header + stats */}
                <div style={{
                    padding: 12,
                    borderRadius: 10,
                    background: PANEL_BG,
                    border: `1px solid ${LINE_SOFT}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: 9,
                            background: '#89b4fa18',
                            color: '#89b4fa',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}>
                            <Route size={18} />
                        </div>
                        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                            <div style={{ color: TEXT_MAIN, fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}>
                                Percurso da ferramenta
                            </div>
                            <div style={{ color: TEXT_DIM, fontSize: 11, marginTop: 2 }}>
                                {bounds.w} x {bounds.h}mm · {moves.length} movimentos · {progressLabel}
                            </div>
                        </div>
                        <div style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            border: '1px solid #89b4fa35',
                            background: '#89b4fa12',
                            color: '#89b4fa',
                            fontWeight: 800,
                            fontSize: 11,
                            fontFamily: 'JetBrains Mono, Consolas, monospace',
                        }}>
                            {progressPct}%
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                        gap: 8,
                    }}>
                        <StatTile icon={Route} label="Corte" value={formatMmDistance(stats.cutDist)} tone="#a6e3a1" />
                        <StatTile icon={MousePointer2} label="Rápido" value={formatMmDistance(stats.rapidDist)} tone="#f38ba8" />
                        <StatTile icon={Wrench} label="Ferramentas" value={stats.toolCount} tone="#f9e2af" />
                        <StatTile icon={Layers} label="Trocas" value={stats.toolChanges} tone="#cba6f7" />
                        <StatTile icon={Timer} label="Tempo Est." value={formatTime(stats.estimatedTime)} tone="#89b4fa" />
                    </div>
                </div>

            {/* SVG Viewport */}
            <div
                style={{
                    background: PANEL_BG,
                    borderRadius: 10,
                    border: `1px solid ${LINE_SOFT}`,
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: 'crosshair',
                    minHeight: 280,
                }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoverPos(null)}
            >
                <svg
                    ref={svgRef}
                    viewBox={`${-pad} ${-pad} ${viewW} ${viewH}`}
                    width="100%"
                    style={{ display: 'block', height: 'min(58vh, 560px)', minHeight: 280 }}
                    preserveAspectRatio="xMidYMid meet"
                >
                    {/* ── All geometry in FLIPPED group: CNC (0,0) → SVG bottom-left ── */}
                    <g transform={flipTransform}>
                        {/* Sheet background */}
                        <rect x={0} y={0} width={bounds.w} height={bounds.h}
                            fill={SURFACE_BG} stroke="#45475a" strokeWidth={2} />

                        {/* Grid lines */}
                        {gridLines.map((gl, i) => (
                            <line key={i} x1={gl.x1} y1={gl.y1} x2={gl.x2} y2={gl.y2}
                                stroke="#313244" strokeWidth={0.5} opacity={0.8} />
                        ))}

                        {/* X and Y axis lines (bold) at origin */}
                        <line x1={0} y1={0} x2={bounds.w} y2={0} stroke="#585b70" strokeWidth={1.2} />
                        <line x1={0} y1={0} x2={0} y2={bounds.h} stroke="#585b70" strokeWidth={1.2} />

                        {/* Pieces */}
                        {chapData?.pecas?.map((p, i) => {
                            const ref = chapData.refilo || 10;
                            return (
                                <rect key={i}
                                    x={ref + p.x} y={ref + p.y}
                                    width={p.w} height={p.h}
                                    fill="#313244" stroke="#585b70" strokeWidth={0.8} opacity={0.7}
                                />
                            );
                        })}

                        {/* Tool paths — grouped into polylines for performance */}
                        {(() => {
                            // Group consecutive same-type moves into runs → fewer SVG elements
                            const visibleMoves = moves.slice(0, drawCount);
                            if (visibleMoves.length === 0) return null;

                            // Separate by category: rapid (G0) vs cut-linear (G1) vs arc (G2/G3)
                            const rapidPts = [];    // [[x1,y1,x2,y2], ...] for dashed rapid lines
                            const cutRuns = [];     // [{pts, color, sw, opacity}]
                            let runPts = [visibleMoves[0].x1, visibleMoves[0].y1];
                            let runType = visibleMoves[0].type;

                            const flushRun = (endMove) => {
                                if (runPts.length < 4) return;
                                const isArc = runType === 'G2' || runType === 'G3';
                                if (runType === 'G0') {
                                    // Rapid moves: dashed individual segments (sparse)
                                    for (let k = 0; k < runPts.length - 2; k += 2) {
                                        rapidPts.push([runPts[k], runPts[k + 1], runPts[k + 2], runPts[k + 3]]);
                                    }
                                } else {
                                    const depth = Math.abs(endMove?.z2 || 0);
                                    const depthRatio = Math.min(depth / 20, 1);
                                    cutRuns.push({
                                        pts: runPts.join(' '),
                                        color: isArc ? '#89b4fa' : '#a6e3a1',
                                        sw: 0.8 + depthRatio * 1.8,
                                        opacity: 0.45 + depthRatio * 0.55,
                                    });
                                }
                            };

                            for (let i = 0; i < visibleMoves.length; i++) {
                                const m = visibleMoves[i];
                                const mType = (m.type === 'G2' || m.type === 'G3') ? 'arc' : m.type;
                                const curType = (runType === 'G2' || runType === 'G3') ? 'arc' : runType;
                                if (mType !== curType) {
                                    flushRun(visibleMoves[i - 1]);
                                    runPts = [m.x1, m.y1, m.x2, m.y2];
                                    runType = m.type;
                                } else {
                                    runPts.push(m.x2, m.y2);
                                }
                            }
                            flushRun(visibleMoves[visibleMoves.length - 1]);

                            return (
                                <>
                                    {/* Rapid moves (G0) — sparse dashed lines, sample 1 in 3 to reduce DOM */}
                                    {rapidPts.filter((_, i) => i % 3 === 0 || i === rapidPts.length - 1).map(([x1, y1, x2, y2], i) => (
                                        <line key={`r${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
                                            stroke="#f38ba8" strokeWidth={0.4} strokeDasharray="5 5" opacity={0.25} />
                                    ))}
                                    {/* Cut moves — polylines grouped by type */}
                                    {cutRuns.map((run, i) => (
                                        <polyline key={`c${i}`} points={run.pts}
                                            fill="none" stroke={run.color}
                                            strokeWidth={run.sw} opacity={run.opacity}
                                            strokeLinejoin="round" strokeLinecap="round"
                                        />
                                    ))}
                                </>
                            );
                        })()}

                        {/* Tool change markers */}
                        {toolChanges.filter(tc => progress < 0 || tc.idx < drawCount).map((tc, i) => (
                            <g key={`tc${i}`}>
                                <circle cx={tc.x} cy={tc.y} r={7} fill="#f9e2af" opacity={0.15} />
                                <circle cx={tc.x} cy={tc.y} r={3.5} fill="#f9e2af" opacity={0.85} />
                            </g>
                        ))}

                        {/* Start point (origin) */}
                        {moves.length > 0 && (
                            <g>
                                <circle cx={moves[0].x1} cy={moves[0].y1} r={7} fill="#22c55e" opacity={0.2} />
                                <circle cx={moves[0].x1} cy={moves[0].y1} r={3.5} fill="#22c55e" />
                            </g>
                        )}

                        {/* Current head position */}
                        {curMove && (
                            <>
                                {/* Cross-hair lines */}
                                <line x1={curMove.x2 - 15} y1={curMove.y2} x2={curMove.x2 + 15} y2={curMove.y2}
                                    stroke="#fab387" strokeWidth={1} opacity={0.6} />
                                <line x1={curMove.x2} y1={curMove.y2 - 15} x2={curMove.x2} y2={curMove.y2 + 15}
                                    stroke="#fab387" strokeWidth={1} opacity={0.6} />
                                <circle cx={curMove.x2} cy={curMove.y2} r={5} fill="#fab387" opacity={0.9} />
                                <circle cx={curMove.x2} cy={curMove.y2} r={12} fill="none" stroke="#fab38760" strokeWidth={1.5} />
                            </>
                        )}

                        {/* Origin crosshair */}
                        <circle cx={0} cy={0} r={4} fill="#cba6f7" opacity={0.9} />
                        <line x1={-6} y1={0} x2={6} y2={0} stroke="#cba6f7" strokeWidth={1} />
                        <line x1={0} y1={-6} x2={0} y2={6} stroke="#cba6f7" strokeWidth={1} />
                    </g>

                    {/* ── Text labels: OUTSIDE flip group, manual Y ── */}

                    {/* Piece names */}
                    {chapData?.pecas?.map((p, i) => {
                        const ref = chapData.refilo || 10;
                        const tx = ref + p.x + 4;
                        const ty = toSvgY(ref + p.y) - 4; // top of piece in SVG coords
                        const fontSize = Math.min(11, p.w / 6, p.h / 3);
                        if (fontSize < 4) return null;
                        return (
                            <text key={`lbl${i}`} x={tx} y={ty}
                                fill="#89b4fa" fontSize={fontSize} opacity={0.7}
                                fontFamily="monospace">
                                {p.nome || `P${i + 1}`}
                            </text>
                        );
                    })}

                    {/* Axis labels */}
                    <text x={bounds.w + 8} y={toSvgY(0) + 4} fill="#585b70" fontSize={11} fontWeight={700}>X</text>
                    <text x={-14} y={toSvgY(bounds.h) - 2} fill="#585b70" fontSize={11} fontWeight={700}>Y</text>
                    <text x={-pad + 2} y={toSvgY(0) + 4} fill="#45475a" fontSize={8} fontFamily="monospace">0</text>

                    {/* Grid labels on X axis */}
                    {showGrid && Array.from({ length: Math.floor(bounds.w / gridInterval) }, (_, i) => {
                        const v = (i + 1) * gridInterval;
                        if (v >= bounds.w) return null;
                        return (
                            <text key={`gx${i}`} x={v} y={toSvgY(0) + 12}
                                fill="#45475a" fontSize={8} textAnchor="middle" fontFamily="monospace">
                                {v}
                            </text>
                        );
                    })}
                    {/* Grid labels on Y axis */}
                    {showGrid && Array.from({ length: Math.floor(bounds.h / gridInterval) }, (_, i) => {
                        const v = (i + 1) * gridInterval;
                        if (v >= bounds.h) return null;
                        return (
                            <text key={`gy${i}`} x={-8} y={toSvgY(v) + 3}
                                fill="#45475a" fontSize={8} textAnchor="end" fontFamily="monospace">
                                {v}
                            </text>
                        );
                    })}

                    {/* Sheet dimensions */}
                    <text x={bounds.w / 2} y={toSvgY(0) + 22}
                        fill="#6c7086" fontSize={9} textAnchor="middle" fontFamily="monospace">
                        {bounds.w}mm
                    </text>
                    <text x={-pad + 12} y={toSvgY(bounds.h / 2)}
                        fill="#6c7086" fontSize={9} textAnchor="middle" fontFamily="monospace"
                        transform={`rotate(-90, ${-pad + 12}, ${toSvgY(bounds.h / 2)})`}>
                        {bounds.h}mm
                    </text>
                </svg>

                {/* Coordinate readout */}
                {hoverPos && (
                    <div style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'rgba(17,17,27,0.92)', border: '1px solid #45475a',
                        borderRadius: 5, padding: '3px 8px', fontSize: 10,
                        fontFamily: 'monospace', color: '#cdd6f4', pointerEvents: 'none',
                    }}>
                        X: {hoverPos.x.toFixed(1)} &nbsp; Y: {hoverPos.y.toFixed(1)}
                    </div>
                )}

                {/* Legend */}
                <div style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    right: 8,
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    padding: '6px 10px',
                    background: 'rgba(17,17,27,0.9)',
                    borderRadius: 7,
                    fontSize: 10,
                    color: TEXT_MAIN,
                    border: `1px solid ${LINE_SOFT}`,
                    backdropFilter: 'blur(8px)',
                }}>
                    <span><span style={{ color: '#f38ba8' }}>- -</span> Rápido (G0)</span>
                    <span><span style={{ color: '#a6e3a1' }}>───</span> Corte (G1)</span>
                    <span><span style={{ color: '#89b4fa' }}>───</span> Arco (G2/3)</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f9e2af', display: 'inline-block' }} />
                        Troca ferr.
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#cba6f7', display: 'inline-block' }} />
                        Origem XY
                    </span>
                </div>

                {/* Current tool badge */}
                {currentToolChange && (
                    <div style={{
                        position: 'absolute', top: 8, left: 8,
                        background: 'rgba(17,17,27,0.92)', border: '1px solid #f9e2af40',
                        borderRadius: 5, padding: '3px 9px', fontSize: 9,
                        color: '#f9e2af', pointerEvents: 'none',
                        display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f9e2af', display: 'inline-block' }} />
                        T: {currentToolChange.tool}
                        {currentToolChange.name ? ` — ${currentToolChange.name}` : ''}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div style={{
                padding: 12,
                borderRadius: 10,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}>
                {/* Transport bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={stepBack} className={Z.btn2}
                        style={{ padding: '7px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}
                        title="Passo anterior">
                        <ChevronLeft size={13} />
                    </button>
                    <button onClick={togglePlay} className={Z.btn}
                        style={{ padding: '7px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, minWidth: 90, justifyContent: 'center' }}>
                        {playing ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Play</>}
                    </button>
                    <button onClick={stepFwd} className={Z.btn2}
                        style={{ padding: '7px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}
                        title="Próximo passo">
                        <ChevronRight size={13} />
                    </button>
                    <button onClick={reset} className={Z.btn2}
                        style={{ padding: '7px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                        title="Reiniciar">
                        <RotateCcw size={12} /> Reset
                    </button>

                    {/* Speed */}
                    <div style={{
                        display: 'flex',
                        gap: 3,
                        marginLeft: 4,
                        padding: 3,
                        borderRadius: 8,
                        background: 'var(--bg-muted)',
                        border: '1px solid var(--border)',
                    }}>
                        {[1, 2, 5, 10, 20].map(s => (
                            <button key={s} onClick={() => setSpeed(s)}
                                style={{
                                    padding: '5px 8px', fontSize: 11, fontWeight: speed === s ? 800 : 600,
                                    borderRadius: 6, cursor: 'pointer', border: 'none',
                                    background: speed === s ? 'var(--primary)' : 'transparent',
                                    color: speed === s ? '#fff' : 'var(--text-secondary)',
                                    transition: 'all 0.15s',
                                }}>
                                {s}x
                            </button>
                        ))}
                    </div>

                    <div style={{ flex: 1 }} />

                    {/* Grid toggle */}
                    <button onClick={() => setShowGrid(g => !g)}
                        style={{
                            padding: '7px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5,
                            borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)',
                            background: showGrid ? 'var(--primary-alpha)' : 'var(--bg-muted)',
                            color: showGrid ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: 700,
                        }}
                        title="Mostrar/ocultar grade">
                        <Grid3X3 size={11} /> Grade
                    </button>

                    {/* Show all */}
                    <button onClick={reset}
                        style={{
                            padding: '7px 11px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5,
                            borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)',
                            background: progress < 0 ? 'var(--primary-alpha)' : 'var(--bg-muted)',
                            color: progress < 0 ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: 700,
                        }}
                        title="Mostrar todos os movimentos">
                        <Layers size={11} /> Ver Tudo
                    </button>
                </div>

                {/* Scrubber */}
                <div>
                    <input
                        type="range" min={0} max={Math.max(0, moves.length - 1)}
                        value={progress < 0 ? moves.length - 1 : progress}
                        onChange={e => { setPlaying(false); setProgress(parseInt(e.target.value)); }}
                        style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'JetBrains Mono, Consolas, monospace', flexWrap: 'wrap' }}>
                        <span>0</span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>
                            {progressLabel}
                        </span>
                        {curMove && (
                            <span style={{ color: '#89b4fa' }}>
                                X{curMove.x2.toFixed(1)} Y{curMove.y2.toFixed(1)} Z{curMove.z2.toFixed(1)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Tool change navigator */}
                {toolChanges.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 2, fontWeight: 700 }}>Ferramentas:</span>
                        {toolChanges.map((tc, i) => {
                            const isActive = currentToolChange?.tool === tc.tool;
                            return (
                                <button key={i}
                                    onClick={() => { setPlaying(false); setProgress(tc.idx); }}
                                    style={{
                                        padding: '2px 8px', fontSize: 9, borderRadius: 10,
                                        border: `1px solid ${isActive ? '#f9e2af' : '#313244'}`,
                                        background: isActive ? '#f9e2af20' : 'transparent',
                                        color: isActive ? '#f9e2af' : '#585b70',
                                        cursor: 'pointer', fontFamily: 'monospace',
                                        transition: 'all 0.15s',
                                    }}
                                    title={`Ir para troca de ${tc.tool}`}>
                                    T{i + 1}: {tc.tool}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            </div>
        </Modal>
    );
}
