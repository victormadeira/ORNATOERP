import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    MousePointer2, Pen, Square, Circle, Eraser, Undo2, Redo2, Grid3x3,
    ChevronDown, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// TEMPLATES — formas prontas de marcenaria
// ═══════════════════════════════════════════════════════
const TEMPLATES = {
    'Retangulo': (w, h) => [
        { cmd: 'M', x: 0, y: 0 }, { cmd: 'L', x: w, y: 0 },
        { cmd: 'L', x: w, y: h }, { cmd: 'L', x: 0, y: h }, { cmd: 'Z' }
    ],
    'Arco superior': (w, h) => [
        { cmd: 'M', x: 0, y: h }, { cmd: 'L', x: 0, y: h * 0.35 },
        { cmd: 'C', x1: 0, y1: 0, x2: w, y2: 0, x: w, y: h * 0.35 },
        { cmd: 'L', x: w, y: h }, { cmd: 'Z' }
    ],
    'Semicirculo': (w, h) => {
        const r = Math.min(w, h) / 2;
        const cx = w / 2;
        return [
            { cmd: 'M', x: 0, y: h }, { cmd: 'L', x: 0, y: h / 2 },
            { cmd: 'C', x1: 0, y1: h / 2 - r * 0.55, x2: cx - r * 0.55, y2: 0, x: cx, y: 0 },
            { cmd: 'C', x1: cx + r * 0.55, y1: 0, x2: w, y2: h / 2 - r * 0.55, x: w, y: h / 2 },
            { cmd: 'L', x: w, y: h }, { cmd: 'Z' }
        ];
    },
    'Ondulado': (w, h) => [
        { cmd: 'M', x: 0, y: h }, { cmd: 'L', x: 0, y: h * 0.4 },
        { cmd: 'C', x1: w * 0.15, y1: 0, x2: w * 0.35, y2: h * 0.3, x: w * 0.5, y: h * 0.15 },
        { cmd: 'C', x1: w * 0.65, y1: 0, x2: w * 0.85, y2: h * 0.3, x: w, y: h * 0.1 },
        { cmd: 'L', x: w, y: h }, { cmd: 'Z' }
    ],
    'Arco lateral': (w, h) => [
        { cmd: 'M', x: 0, y: 0 }, { cmd: 'L', x: w * 0.6, y: 0 },
        { cmd: 'C', x1: w, y1: 0, x2: w, y2: h, x: w * 0.6, y: h },
        { cmd: 'L', x: 0, y: h }, { cmd: 'Z' }
    ],
    'Gota': (w, h) => {
        const cx = w / 2;
        return [
            { cmd: 'M', x: cx, y: 0 },
            { cmd: 'C', x1: w * 0.9, y1: h * 0.15, x2: w, y2: h * 0.5, x: w * 0.85, y: h * 0.7 },
            { cmd: 'C', x1: w * 0.7, y1: h * 0.9, x2: cx + 20, y2: h, x: cx, y: h },
            { cmd: 'C', x1: cx - 20, y1: h, x2: w * 0.3, y2: h * 0.9, x: w * 0.15, y: h * 0.7 },
            { cmd: 'C', x1: 0, y1: h * 0.5, x2: w * 0.1, y2: h * 0.15, x: cx, y: 0 },
            { cmd: 'Z' }
        ];
    },
};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
const snap = (v, grid) => Math.round(v / grid) * grid;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

function commandsToSvgPath(cmds) {
    if (!cmds?.length) return '';
    return cmds.map(c => {
        switch (c.cmd) {
            case 'M': return `M ${c.x} ${c.y}`;
            case 'L': return `L ${c.x} ${c.y}`;
            case 'C': return `C ${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`;
            case 'Q': return `Q ${c.x1} ${c.y1} ${c.x} ${c.y}`;
            case 'Z': return 'Z';
            default: return '';
        }
    }).join(' ');
}

// Extract all anchor points and bezier handles from commands
function extractPoints(cmds) {
    if (!cmds?.length) return [];
    const pts = [];
    for (let i = 0; i < cmds.length; i++) {
        const c = cmds[i];
        if (c.cmd === 'Z') continue;
        pts.push({ idx: i, type: 'anchor', x: c.x, y: c.y });
        if (c.cmd === 'C') {
            pts.push({ idx: i, type: 'handle1', x: c.x1, y: c.y1, anchorIdx: i });
            pts.push({ idx: i, type: 'handle2', x: c.x2, y: c.y2, anchorIdx: i });
        }
        if (c.cmd === 'Q') {
            pts.push({ idx: i, type: 'handle1', x: c.x1, y: c.y1, anchorIdx: i });
        }
    }
    return pts;
}

// ═══════════════════════════════════════════════════════
// TOOLBAR BUTTON
// ═══════════════════════════════════════════════════════
function ToolBtn({ icon: Icon, label, active, onClick, title }) {
    return (
        <button
            onClick={onClick}
            title={title || label}
            style={{
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, border: active ? '1.5px solid #1379F0' : '1px solid rgba(0,0,0,0.1)',
                background: active ? 'rgba(19,121,240,0.12)' : 'rgba(255,255,255,0.9)',
                color: active ? '#1379F0' : '#64748b', cursor: 'pointer',
                transition: 'all 0.12s', flexShrink: 0,
            }}
        >
            <Icon size={16} />
        </button>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
export default function EditorSilhueta2D({ commands: initialCommands, widthMm = 1000, heightMm = 600, onChange }) {
    const svgRef = useRef(null);
    const [tool, setTool] = useState('pen');
    const [commands, setCommands] = useState(initialCommands?.length ? initialCommands : []);
    const [selected, setSelected] = useState(null); // { idx, type }
    const [dragging, setDragging] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 40, y: 40 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef(null);
    const [snapGrid, setSnapGrid] = useState(true);
    const [history, setHistory] = useState([]);
    const [historyIdx, setHistoryIdx] = useState(-1);
    const [showTemplates, setShowTemplates] = useState(false);
    const [penDrag, setPenDrag] = useState(null); // for bezier creation
    const gridSize = 10; // mm
    const gridMajor = 50; // mm

    // Sync with parent
    useEffect(() => {
        if (initialCommands?.length && commands.length === 0) {
            setCommands(initialCommands);
        }
    }, [initialCommands]);

    // Push to history
    const pushHistory = useCallback((newCmds) => {
        setHistory(h => {
            const trimmed = h.slice(0, historyIdx + 1);
            const next = [...trimmed, JSON.parse(JSON.stringify(newCmds))];
            if (next.length > 50) next.shift();
            return next;
        });
        setHistoryIdx(i => Math.min(i + 1, 49));
    }, [historyIdx]);

    const updateCommands = useCallback((newCmds) => {
        setCommands(newCmds);
        pushHistory(newCmds);
        onChange?.(newCmds);
    }, [pushHistory, onChange]);

    const undo = useCallback(() => {
        if (historyIdx > 0) {
            const prev = history[historyIdx - 1];
            setCommands(JSON.parse(JSON.stringify(prev)));
            setHistoryIdx(i => i - 1);
            onChange?.(prev);
        }
    }, [history, historyIdx, onChange]);

    const redo = useCallback(() => {
        if (historyIdx < history.length - 1) {
            const next = history[historyIdx + 1];
            setCommands(JSON.parse(JSON.stringify(next)));
            setHistoryIdx(i => i + 1);
            onChange?.(next);
        }
    }, [history, historyIdx, onChange]);

    // SVG coordinate conversion
    const screenToWorld = useCallback((clientX, clientY) => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const rect = svg.getBoundingClientRect();
        const sx = (clientX - rect.left - pan.x) / zoom;
        const sy = (clientY - rect.top - pan.y) / zoom;
        // Flip Y: SVG y goes down, we want y-up for mm
        const wx = sx;
        const wy = heightMm - sy;
        if (snapGrid) return { x: snap(wx, gridSize), y: snap(wy, gridSize) };
        return { x: Math.round(wx * 10) / 10, y: Math.round(wy * 10) / 10 };
    }, [zoom, pan, heightMm, snapGrid]);

    const worldToSvg = useCallback((wx, wy) => {
        return { x: wx, y: heightMm - wy };
    }, [heightMm]);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
            else if (e.key === 'g') setSnapGrid(v => !v);
            else if (e.key === 'v' || e.key === '1') setTool('select');
            else if (e.key === 'p' || e.key === '2') setTool('pen');
            else if (e.key === 'r' || e.key === '3') setTool('rect');
            else if (e.key === 'a' || e.key === '4') setTool('arc');
            else if (e.key === 'e' || e.key === '5') setTool('eraser');
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selected && tool === 'select') {
                    e.preventDefault();
                    const newCmds = commands.filter((_, i) => i !== selected.idx);
                    updateCommands(newCmds);
                    setSelected(null);
                }
            }
            else if (e.key === ' ') { e.preventDefault(); setIsPanning(true); }
        };
        const up = (e) => { if (e.key === ' ') setIsPanning(false); };
        window.addEventListener('keydown', handler);
        window.addEventListener('keyup', up);
        return () => { window.removeEventListener('keydown', handler); window.removeEventListener('keyup', up); };
    }, [undo, redo, selected, tool, commands, updateCommands]);

    // Zoom with scroll
    const onWheel = useCallback((e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => clamp(z * delta, 0.2, 5));
    }, []);

    // Mouse handlers
    const onMouseDown = useCallback((e) => {
        if (e.button === 1 || isPanning) {
            panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            setIsPanning(true);
            return;
        }

        const pt = screenToWorld(e.clientX, e.clientY);

        if (tool === 'select') {
            // Hit test: find nearest point
            const pts = extractPoints(commands);
            let best = null, bestDist = 12 / zoom;
            for (const p of pts) {
                const sp = worldToSvg(p.x, p.y);
                const svgRect = svgRef.current.getBoundingClientRect();
                const screenX = sp.x * zoom + pan.x + svgRect.left;
                const screenY = sp.y * zoom + pan.y + svgRect.top;
                const d = dist(e.clientX, e.clientY, screenX, screenY);
                if (d < bestDist) { bestDist = d; best = p; }
            }
            if (best) {
                setSelected({ idx: best.idx, type: best.type });
                setDragging(best);
            } else {
                setSelected(null);
            }
        }

        if (tool === 'pen') {
            setPenDrag({ start: pt, current: pt });
        }

        if (tool === 'eraser') {
            const pts = extractPoints(commands);
            let best = null, bestDist = 15 / zoom;
            for (const p of pts) {
                if (p.type !== 'anchor') continue;
                const sp = worldToSvg(p.x, p.y);
                const svgRect = svgRef.current.getBoundingClientRect();
                const screenX = sp.x * zoom + pan.x + svgRect.left;
                const screenY = sp.y * zoom + pan.y + svgRect.top;
                const d = dist(e.clientX, e.clientY, screenX, screenY);
                if (d < bestDist) { bestDist = d; best = p; }
            }
            if (best) {
                const newCmds = commands.filter((_, i) => i !== best.idx);
                updateCommands(newCmds);
            }
        }

        if (tool === 'rect') {
            const newCmds = TEMPLATES['Retangulo'](200, 150).map(c => ({
                ...c, x: c.x !== undefined ? c.x + pt.x : undefined, y: c.y !== undefined ? c.y + pt.y : undefined,
                x1: c.x1 !== undefined ? c.x1 + pt.x : undefined, y1: c.y1 !== undefined ? c.y1 + pt.y : undefined,
                x2: c.x2 !== undefined ? c.x2 + pt.x : undefined, y2: c.y2 !== undefined ? c.y2 + pt.y : undefined,
            }));
            updateCommands(newCmds);
        }

        if (tool === 'arc') {
            const newCmds = TEMPLATES['Arco superior'](300, 200).map(c => ({
                ...c, x: c.x !== undefined ? c.x + pt.x : undefined, y: c.y !== undefined ? c.y + pt.y : undefined,
                x1: c.x1 !== undefined ? c.x1 + pt.x : undefined, y1: c.y1 !== undefined ? c.y1 + pt.y : undefined,
                x2: c.x2 !== undefined ? c.x2 + pt.x : undefined, y2: c.y2 !== undefined ? c.y2 + pt.y : undefined,
            }));
            updateCommands(newCmds);
        }
    }, [tool, commands, isPanning, pan, zoom, screenToWorld, worldToSvg, updateCommands]);

    const onMouseMove = useCallback((e) => {
        if (isPanning && panStart.current) {
            setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
            return;
        }

        if (tool === 'select' && dragging) {
            const pt = screenToWorld(e.clientX, e.clientY);
            const newCmds = [...commands];
            const c = { ...newCmds[dragging.idx] };
            if (dragging.type === 'anchor') { c.x = pt.x; c.y = pt.y; }
            else if (dragging.type === 'handle1') { c.x1 = pt.x; c.y1 = pt.y; }
            else if (dragging.type === 'handle2') { c.x2 = pt.x; c.y2 = pt.y; }
            newCmds[dragging.idx] = c;
            setCommands(newCmds);
            onChange?.(newCmds);
        }

        if (tool === 'pen' && penDrag) {
            const pt = screenToWorld(e.clientX, e.clientY);
            setPenDrag(prev => ({ ...prev, current: pt }));
        }
    }, [tool, dragging, isPanning, commands, screenToWorld, onChange, penDrag]);

    const onMouseUp = useCallback((e) => {
        if (isPanning) { setIsPanning(false); panStart.current = null; return; }

        if (tool === 'select' && dragging) {
            pushHistory(commands);
            setDragging(null);
        }

        if (tool === 'pen' && penDrag) {
            const pt = screenToWorld(e.clientX, e.clientY);
            const dragDist = dist(penDrag.start.x, penDrag.start.y, pt.x, pt.y);
            const newCmds = [...commands];

            if (newCmds.length === 0) {
                // First point: create M
                newCmds.push({ cmd: 'M', x: penDrag.start.x, y: penDrag.start.y });
            }

            if (dragDist > 5) {
                // Dragged = bezier curve
                const prev = newCmds[newCmds.length - 1];
                const px = prev.x ?? 0, py = prev.y ?? 0;
                newCmds.push({
                    cmd: 'C',
                    x1: px + (pt.x - px) * 0.33, y1: py + (pt.y - py) * 0.33,
                    x2: penDrag.start.x + (pt.x - penDrag.start.x) * 0.66, y2: penDrag.start.y + (pt.y - penDrag.start.y) * 0.66,
                    x: pt.x, y: pt.y,
                });
            } else {
                // Click = straight line
                if (newCmds.length > 0 && newCmds[newCmds.length - 1].cmd === 'M' && newCmds.length === 1) {
                    // Already have M, skip duplicate
                } else {
                    newCmds.push({ cmd: 'L', x: penDrag.start.x, y: penDrag.start.y });
                }
            }
            updateCommands(newCmds);
            setPenDrag(null);
        }
    }, [tool, dragging, penDrag, commands, screenToWorld, pushHistory, updateCommands]);

    // Close path shortcut
    const closePath = useCallback(() => {
        if (commands.length < 2) return;
        const last = commands[commands.length - 1];
        if (last.cmd === 'Z') return;
        updateCommands([...commands, { cmd: 'Z' }]);
    }, [commands, updateCommands]);

    const applyTemplate = useCallback((name) => {
        const gen = TEMPLATES[name];
        if (!gen) return;
        updateCommands(gen(widthMm, heightMm));
        setShowTemplates(false);
    }, [widthMm, heightMm, updateCommands]);

    const resetView = useCallback(() => { setZoom(1); setPan({ x: 40, y: 40 }); }, []);

    // Build SVG path in SVG coordinates (y-flipped)
    const svgPath = useMemo(() => {
        if (!commands.length) return '';
        const flipped = commands.map(c => {
            const fc = { ...c };
            if (fc.y !== undefined) fc.y = heightMm - fc.y;
            if (fc.y1 !== undefined) fc.y1 = heightMm - fc.y1;
            if (fc.y2 !== undefined) fc.y2 = heightMm - fc.y2;
            return fc;
        });
        return commandsToSvgPath(flipped);
    }, [commands, heightMm]);

    // Points for rendering
    const points = useMemo(() => extractPoints(commands), [commands]);

    // Grid lines
    const gridLines = useMemo(() => {
        const lines = [];
        for (let x = 0; x <= widthMm; x += gridSize) {
            const isMajor = x % gridMajor === 0;
            lines.push(<line key={`gx${x}`} x1={x} y1={0} x2={x} y2={heightMm}
                stroke={isMajor ? '#cbd5e1' : '#e2e8f0'} strokeWidth={isMajor ? 0.5 : 0.25} />);
            if (isMajor && x > 0) {
                lines.push(<text key={`gxt${x}`} x={x} y={-4} fontSize={8 / zoom} fill="#94a3b8" textAnchor="middle">{x}</text>);
            }
        }
        for (let y = 0; y <= heightMm; y += gridSize) {
            const isMajor = y % gridMajor === 0;
            lines.push(<line key={`gy${y}`} x1={0} y1={y} x2={widthMm} y2={y}
                stroke={isMajor ? '#cbd5e1' : '#e2e8f0'} strokeWidth={isMajor ? 0.5 : 0.25} />);
            if (isMajor && y > 0) {
                lines.push(<text key={`gyt${y}`} x={-4} y={y + 3} fontSize={8 / zoom} fill="#94a3b8" textAnchor="end">{heightMm - y}</text>);
            }
        }
        return lines;
    }, [widthMm, heightMm, zoom]);

    const cursorStyle = tool === 'pen' ? 'crosshair' : tool === 'select' ? (dragging ? 'grabbing' : 'default') : tool === 'eraser' ? 'pointer' : 'crosshair';

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', background: '#f8fafc', borderRadius: 8, overflow: 'hidden' }}>
            {/* ── Toolbar ── */}
            <div style={{
                width: 48, flexShrink: 0, background: '#fff', borderRight: '1px solid #e2e8f0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 6px', gap: 4,
            }}>
                <ToolBtn icon={MousePointer2} label="Selecionar (V)" active={tool === 'select'} onClick={() => setTool('select')} />
                <ToolBtn icon={Pen} label="Caneta (P)" active={tool === 'pen'} onClick={() => setTool('pen')} />
                <ToolBtn icon={Square} label="Retangulo (R)" active={tool === 'rect'} onClick={() => setTool('rect')} />
                <ToolBtn icon={Circle} label="Arco (A)" active={tool === 'arc'} onClick={() => setTool('arc')} />
                <ToolBtn icon={Eraser} label="Apagar (E)" active={tool === 'eraser'} onClick={() => setTool('eraser')} />

                <div style={{ height: 1, width: '80%', background: '#e2e8f0', margin: '4px 0' }} />

                {/* Templates dropdown */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowTemplates(!showTemplates)} title="Templates"
                        style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', cursor: 'pointer', color: '#64748b', fontSize: 9, fontWeight: 700 }}>
                        <ChevronDown size={12} />
                    </button>
                    {showTemplates && (
                        <div style={{
                            position: 'absolute', left: 44, top: 0, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20, minWidth: 160, padding: 4,
                        }}>
                            {Object.keys(TEMPLATES).map(name => (
                                <button key={name} onClick={() => applyTemplate(name)} style={{
                                    display: 'block', width: '100%', padding: '6px 10px', fontSize: 11, textAlign: 'left',
                                    border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4,
                                    color: '#334155',
                                }}
                                    onMouseEnter={e => e.target.style.background = '#f1f5f9'}
                                    onMouseLeave={e => e.target.style.background = 'transparent'}
                                >{name}</button>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ height: 1, width: '80%', background: '#e2e8f0', margin: '4px 0' }} />

                <ToolBtn icon={Undo2} label="Desfazer (Ctrl+Z)" onClick={undo} />
                <ToolBtn icon={Redo2} label="Refazer (Ctrl+Shift+Z)" onClick={redo} />
                <ToolBtn icon={Grid3x3} label={`Snap Grid (G): ${snapGrid ? 'ON' : 'OFF'}`} active={snapGrid} onClick={() => setSnapGrid(v => !v)} />
                <ToolBtn icon={RotateCcw} label="Reset Zoom" onClick={resetView} />

                <div style={{ flex: 1 }} />

                {/* Close path button */}
                {commands.length >= 2 && commands[commands.length - 1]?.cmd !== 'Z' && (
                    <button onClick={closePath} title="Fechar forma" style={{
                        width: 36, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 6, border: '1px solid #16a34a', background: 'rgba(22,163,74,0.08)',
                        color: '#16a34a', cursor: 'pointer', fontSize: 9, fontWeight: 700,
                    }}>Z</button>
                )}

                {/* Zoom indicator */}
                <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
                    {Math.round(zoom * 100)}%
                </div>
            </div>

            {/* ── Canvas ── */}
            <svg
                ref={svgRef}
                style={{ flex: 1, cursor: isPanning ? 'grabbing' : cursorStyle, userSelect: 'none' }}
                onWheel={onWheel}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => { setDragging(null); setPenDrag(null); if (isPanning) { setIsPanning(false); panStart.current = null; } }}
            >
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {/* Grid */}
                    {gridLines}

                    {/* Canvas border */}
                    <rect x={0} y={0} width={widthMm} height={heightMm} fill="none" stroke="#94a3b8" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom},${4 / zoom}`} />

                    {/* Shape fill */}
                    {svgPath && (
                        <path d={svgPath} fill="rgba(19,121,240,0.06)" stroke="#1379F0" strokeWidth={2 / zoom} strokeLinejoin="round" />
                    )}

                    {/* Pen drag preview */}
                    {penDrag && commands.length > 0 && (() => {
                        const last = commands[commands.length - 1];
                        const fromX = last.x ?? 0, fromY = heightMm - (last.y ?? 0);
                        const toX = penDrag.current.x, toY = heightMm - penDrag.current.y;
                        return <line x1={fromX} y1={fromY} x2={toX} y2={toY} stroke="#1379F0" strokeWidth={1 / zoom} strokeDasharray={`${3 / zoom},${3 / zoom}`} />;
                    })()}

                    {/* Bezier handles */}
                    {points.filter(p => p.type !== 'anchor').map((p, i) => {
                        const anchor = commands[p.idx];
                        const ax = anchor.x ?? 0, ay = heightMm - (anchor.y ?? 0);
                        const hx = p.x, hy = heightMm - p.y;
                        return (
                            <g key={`h${i}`}>
                                <line x1={ax} y1={ay} x2={hx} y2={hy} stroke="#94a3b8" strokeWidth={0.8 / zoom} strokeDasharray={`${2 / zoom},${2 / zoom}`} />
                                <circle cx={hx} cy={hy} r={4 / zoom} fill="#fff" stroke="#64748b" strokeWidth={1 / zoom}
                                    style={{ cursor: 'pointer' }} />
                            </g>
                        );
                    })}

                    {/* Anchor points */}
                    {points.filter(p => p.type === 'anchor').map((p, i) => {
                        const sx = p.x, sy = heightMm - p.y;
                        const isSel = selected?.idx === p.idx && selected?.type === 'anchor';
                        return (
                            <g key={`a${i}`}>
                                <circle cx={sx} cy={sy} r={5 / zoom}
                                    fill={isSel ? '#1379F0' : '#fff'}
                                    stroke={isSel ? '#0B63D4' : '#475569'}
                                    strokeWidth={1.5 / zoom}
                                    style={{ cursor: 'pointer' }} />
                                {isSel && (
                                    <text x={sx + 8 / zoom} y={sy - 8 / zoom} fontSize={9 / zoom} fill="#1379F0" fontWeight="600">
                                        ({Math.round(p.x)}, {Math.round(p.y)})
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </g>

                {/* Instructions overlay */}
                {commands.length === 0 && (
                    <text x="50%" y="50%" textAnchor="middle" fill="#94a3b8" fontSize="14" fontFamily="Inter, sans-serif">
                        Clique para adicionar pontos · Arraste para curvas bezier · Templates no menu lateral
                    </text>
                )}
            </svg>
        </div>
    );
}
