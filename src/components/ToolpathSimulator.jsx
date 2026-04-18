import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Modal, Z } from '../ui';
import { Play, Pause, RotateCcw, ChevronRight, ChevronLeft } from 'lucide-react';

// ─── Parse G-code text into structured moves ────────────────────────
export function parseGcodeToMoves(gcodeText) {
    const moves = [];
    let x = 0, y = 0, z = 0, mode = 'G0', tool = 0, f = 0;
    for (const raw of (gcodeText || '').split('\n')) {
        const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
        if (!line) continue;
        const cmd = line.replace(/^N\d+\s*/, '');

        // Tool change
        const tMatch = cmd.match(/^T(\d+)/i);
        if (tMatch) { tool = parseInt(tMatch[1]); continue; }

        const gMatch = cmd.match(/G([0-3])\b/i);
        if (gMatch) mode = `G${gMatch[1]}`;

        const xM = cmd.match(/X([+-]?[\d.]+)/i);
        const yM = cmd.match(/Y([+-]?[\d.]+)/i);
        const zM = cmd.match(/Z([+-]?[\d.]+)/i);
        const fM = cmd.match(/F([+-]?[\d.]+)/i);

        if (fM) f = parseFloat(fM[1]);
        const newX = xM ? parseFloat(xM[1]) : x;
        const newY = yM ? parseFloat(yM[1]) : y;
        const newZ = zM ? parseFloat(zM[1]) : z;

        if (xM || yM || zM) {
            moves.push({ type: mode, x1: x, y1: y, z1: z, x2: newX, y2: newY, z2: newZ, f, tool });
        }
        x = newX; y = newY; z = newZ;
    }
    return moves;
}

// ─── Detect tool changes in moves ───────────────────────────────────
function getToolChanges(moves) {
    const changes = [];
    let lastTool = -1;
    for (let i = 0; i < moves.length; i++) {
        if (moves[i].tool !== lastTool) {
            changes.push({ idx: i, tool: moves[i].tool, x: moves[i].x1, y: moves[i].y1 });
            lastTool = moves[i].tool;
        }
    }
    return changes;
}

// ─── Compute stats from moves ───────────────────────────────────────
function computeStats(moves) {
    let totalDist = 0, cutDist = 0, rapidDist = 0;
    const toolSet = new Set();
    for (const m of moves) {
        const d = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
        totalDist += d;
        if (m.type === 'G0') rapidDist += d;
        else cutDist += d;
        toolSet.add(m.tool);
    }
    // Estimate time: rapid at 60m/min, cut at ~10m/min average
    const timeSec = (rapidDist / 1000) / (60 / 60) + (cutDist / 1000) / (10 / 60);
    return {
        totalDist: Math.round(totalDist),
        cutDist: Math.round(cutDist),
        rapidDist: Math.round(rapidDist),
        toolChanges: toolSet.size - 1,
        estimatedTime: Math.round(timeSec),
    };
}

export default function ToolpathSimulator({ chapData, operations, isOpen, onClose }) {
    const [playing, setPlaying] = useState(false);
    const [progress, setProgress] = useState(-1); // -1 = show all
    const [speed, setSpeed] = useState(1);
    const animRef = useRef(null);
    const svgRef = useRef(null);

    const moves = useMemo(() => {
        if (operations && operations.length > 0) return operations;
        return [];
    }, [operations]);

    const toolChanges = useMemo(() => getToolChanges(moves), [moves]);
    const stats = useMemo(() => computeStats(moves), [moves]);

    // Compute SVG viewBox from sheet/moves
    const bounds = useMemo(() => {
        let maxX = chapData?.comprimento || 2750;
        let maxY = chapData?.largura || 1850;
        for (const m of moves) {
            maxX = Math.max(maxX, m.x2);
            maxY = Math.max(maxY, m.y2);
        }
        return { w: maxX, h: maxY };
    }, [moves, chapData]);

    // Playback animation
    useEffect(() => {
        if (!playing || moves.length === 0) return;
        const step = Math.max(1, Math.floor(speed));
        animRef.current = setInterval(() => {
            setProgress(prev => {
                const next = prev + step;
                if (next >= moves.length - 1) {
                    setPlaying(false);
                    return moves.length - 1;
                }
                return next;
            });
        }, 16);
        return () => clearInterval(animRef.current);
    }, [playing, speed, moves.length]);

    const reset = () => { setPlaying(false); setProgress(-1); };
    const togglePlay = () => {
        if (progress >= moves.length - 1) setProgress(0);
        setPlaying(!playing);
    };

    const formatTime = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    if (!isOpen) return null;

    const drawCount = progress < 0 ? moves.length : Math.min(progress + 1, moves.length);
    const pad = 20;
    const viewW = bounds.w + pad * 2;
    const viewH = bounds.h + pad * 2;

    return (
        <Modal title="Simulador de Percurso" close={onClose} w={900}>
            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 6, marginBottom: 10 }}>
                {[
                    { lb: 'Dist. Total', val: `${(stats.totalDist / 1000).toFixed(1)}m`, color: 'var(--info)' },
                    { lb: 'Dist. Corte', val: `${(stats.cutDist / 1000).toFixed(1)}m`, color: 'var(--success)' },
                    { lb: 'Dist. Rápido', val: `${(stats.rapidDist / 1000).toFixed(1)}m`, color: 'var(--danger)' },
                    { lb: 'Trocas Ferr.', val: stats.toolChanges, color: 'var(--warning)' },
                    { lb: 'Tempo Est.', val: formatTime(stats.estimatedTime), color: '#8b5cf6' },
                ].map(s => (
                    <div key={s.lb} style={{ padding: '6px 8px', background: 'var(--bg-muted)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.val}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{s.lb}</div>
                    </div>
                ))}
            </div>

            {/* SVG Viewport */}
            <div style={{ background: '#181825', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
                <svg
                    ref={svgRef}
                    viewBox={`${-pad} ${-pad} ${viewW} ${viewH}`}
                    width="100%"
                    style={{ display: 'block', maxHeight: 450 }}
                    preserveAspectRatio="xMidYMid meet"
                >
                    {/* Sheet background */}
                    <rect x={0} y={0} width={bounds.w} height={bounds.h}
                        fill="#313244" stroke="#585b70" strokeWidth={2} />

                    {/* Pieces */}
                    {chapData?.pecas?.map((p, i) => {
                        const ref = chapData.refilo || 10;
                        return (
                            <g key={i}>
                                <rect
                                    x={ref + p.x} y={ref + p.y}
                                    width={p.w} height={p.h}
                                    fill="#45475a" stroke="#89b4fa" strokeWidth={1} opacity={0.5}
                                />
                                {p.nome && (
                                    <text x={ref + p.x + 4} y={ref + p.y + 14}
                                        fill="#89b4fa" fontSize={Math.min(12, p.w / 6)} opacity={0.6}>
                                        {p.nome}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {/* Tool paths */}
                    {moves.slice(0, drawCount).map((m, i) => {
                        if (m.type === 'G0') {
                            return (
                                <line key={i}
                                    x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2}
                                    stroke="#f38ba8" strokeWidth={0.5} strokeDasharray="4 4" opacity={0.3}
                                />
                            );
                        }
                        // Cut moves: color by type, thickness based on depth
                        const depth = Math.abs(m.z2);
                        const depthRatio = Math.min(depth / 20, 1);
                        const sw = 1 + depthRatio * 2;
                        let color = '#a6e3a1'; // G1
                        if (m.type === 'G2' || m.type === 'G3') color = '#89b4fa';
                        return (
                            <line key={i}
                                x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2}
                                stroke={color} strokeWidth={sw} opacity={0.5 + depthRatio * 0.5}
                            />
                        );
                    })}

                    {/* Tool change markers */}
                    {toolChanges.filter(tc => progress < 0 || tc.idx < drawCount).map((tc, i) => (
                        <circle key={`tc${i}`} cx={tc.x} cy={tc.y} r={6}
                            fill="#f9e2af" opacity={0.7} />
                    ))}

                    {/* Start point */}
                    {moves.length > 0 && (
                        <circle cx={moves[0].x1} cy={moves[0].y1} r={5} fill="#22c55e" />
                    )}

                    {/* Current position (during animation) */}
                    {progress >= 0 && progress < moves.length && (
                        <>
                            <circle cx={moves[progress].x2} cy={moves[progress].y2} r={6}
                                fill="#fab387" stroke="#fab387" strokeWidth={2} opacity={0.8} />
                            <circle cx={moves[progress].x2} cy={moves[progress].y2} r={12}
                                fill="none" stroke="#fab38740" strokeWidth={2} />
                        </>
                    )}
                </svg>

                {/* Legend overlay */}
                <div style={{
                    position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 10,
                    padding: '4px 10px', background: 'rgba(24,24,37,0.85)', borderRadius: 6,
                    fontSize: 10, color: '#cdd6f4',
                }}>
                    <span><span style={{ color: '#f38ba8' }}>---</span> Rápido (G0)</span>
                    <span><span style={{ color: '#a6e3a1' }}>---</span> Corte (G1)</span>
                    <span><span style={{ color: '#89b4fa' }}>---</span> Arco (G2/G3)</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f9e2af' }} />
                        Troca ferr.
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
                        Início
                    </span>
                </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button onClick={togglePlay} className={Z.btn}
                    style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {playing ? <><Pause size={13} /> Pausa</> : <><Play size={13} /> Play</>}
                </button>
                <button onClick={reset} className={Z.btn2}
                    style={{ padding: '6px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RotateCcw size={13} /> Reset
                </button>

                {/* Speed selector */}
                <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
                    {[1, 2, 5, 10].map(s => (
                        <button key={s} onClick={() => setSpeed(s)}
                            style={{
                                padding: '3px 8px', fontSize: 10, fontWeight: speed === s ? 700 : 400,
                                borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)',
                                background: speed === s ? 'var(--primary)' : 'var(--bg-muted)',
                                color: speed === s ? '#fff' : 'var(--text-secondary)',
                            }}>
                            {s}x
                        </button>
                    ))}
                </div>

                {/* Progress bar */}
                <div style={{ flex: 1, marginLeft: 10 }}>
                    <input
                        type="range" min={0} max={Math.max(0, moves.length - 1)}
                        value={progress < 0 ? moves.length - 1 : progress}
                        onChange={e => { setPlaying(false); setProgress(parseInt(e.target.value)); }}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>
                        {progress < 0 ? `Todos ${moves.length} movimentos` : `${progress + 1} / ${moves.length}`}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
