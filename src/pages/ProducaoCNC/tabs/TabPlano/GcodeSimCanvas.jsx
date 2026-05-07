// GcodeSimCanvas — CNC 3D Toolpath Simulator
// Three.js WebGL viewport: orbit camera, Z-up, colored toolpath segments,
// animated tool head, stock material, time-based playback.
// External API: playing/speed/onPlayEnd/onMoveChange props + forwardRef.
import {
    useEffect, useRef, useState, useMemo, forwardRef,
    useImperativeHandle, useCallback,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseGcodeForSim, getOpCat, feedHeatColor } from './parseGcode.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const RAPID_FEED_MM_MIN = 20000;   // assumed rapid feed for time calculation
const STOCK_THICKNESS   = 15.5;    // default MDF thickness (mm)

// Segment colors (pending / executed / current)
const COL = {
    rapidPending:  0xd29922,  // orange (dim)
    rapidExec:     0xf0883e,  // orange (bright)
    cutPending:    0x1a5e9e,  // dark blue (dim)
    cutExec:       0x58a6ff,  // bright blue
    abovePending:  0x145e30,  // dark green (dim)
    aboveExec:     0x56d364,  // bright green
    current:       0xffffff,  // white for active segment
    toolBody:      0xf78166,
    toolTip:       0xff4444,
    grid:          0x1f2933,
    axisX:         0xff5555,
    axisY:         0x55ff55,
    axisZ:         0x5599ff,
    stock:         0xc8a878,  // MDF areia
    stockEdge:     0x8b6f47,
};

// ─── Parse G-code with timing ────────────────────────────────────────────────
// Extends parseGcodeForSim output with .duration / .tStart / .tEnd / .dist per move
function parse3D(gcode) {
    const result = parseGcodeForSim(gcode || '');
    let acc = 0;
    for (const m of result.moves) {
        const dist = Math.hypot(m.x2 - m.x1, m.y2 - m.y1, m.z2 - m.z1);
        const effFeed = m.type === 'G0' ? RAPID_FEED_MM_MIN : (m.feed || 1000);
        m.dist     = dist;
        m.duration = dist / (effFeed / 60); // seconds
        m.tStart   = acc;
        acc       += m.duration;
        m.tEnd     = acc;
    }
    return { ...result, totalTime: acc };
}

// ─── Helper: clear group geometry/materials ───────────────────────────────────
function clearGroup(group) {
    while (group.children.length) {
        const c = group.children[0];
        group.remove(c);
        c.geometry?.dispose();
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material?.dispose();
    }
}

// ─── Component ───────────────────────────────────────────────────────────────
export const GcodeSimCanvas = forwardRef(function GcodeSimCanvas(
    { gcode, chapa, playing: playingProp, speed: speedProp = 1,
      onPlayEnd, onMoveChange, heatmapMode: heatmapProp },
    ref
) {
    const containerRef = useRef(null);
    // All Three.js objects live in this ref to avoid React re-renders
    const three = useRef({
        renderer: null, scene: null, camera: null, controls: null,
        pathGroup: null, toolGroup: null, stockGroup: null, gridGroup: null,
        segments: [],   // { line, move, executed }
        rafId: null,
    });
    // Playback state in ref (not React state — updates every frame)
    const pb = useRef({ time: 0, playing: false, speed: 1, lastAt: 0, totalTime: 0 });

    // React state only for overlay data (X Y Z F + current move)
    const [toolPos, setToolPos] = useState({ x: 0, y: 0, z: 0, f: 0 });
    const [curMoveIdx, setCurMoveIdx] = useState(-1);
    const [activeView, setActiveView] = useState('iso');
    const [heatmap, setHeatmap] = useState(false);
    const heatmapMode = heatmapProp !== undefined ? heatmapProp : heatmap;

    // Parse
    const program = useMemo(() => parse3D(gcode), [gcode]);
    const { moves, totalTime } = program;

    // ── Three.js setup (mount once) ───────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x0d1117, 1);
        renderer.domElement.style.width  = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
        el.appendChild(renderer.domElement);

        // Scene
        const scene = new THREE.Scene();

        // Camera (Z-up convention)
        const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 60000);
        camera.up.set(0, 0, 1);
        camera.position.set(2000, -2000, 2000);
        camera.lookAt(0, 0, 0);

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(500, -800, 1500);
        scene.add(dir);

        // OrbitControls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.screenSpacePanning = false;
        controls.up0 = new THREE.Vector3(0, 0, 1);

        // Groups
        const stockGroup = new THREE.Group();
        const pathGroup  = new THREE.Group();
        const toolGroup  = new THREE.Group();
        const gridGroup  = new THREE.Group();
        scene.add(gridGroup, stockGroup, pathGroup, toolGroup);

        // Tool mesh — cylinder body + sphere tip
        const toolMat = new THREE.MeshStandardMaterial({
            color: COL.toolBody, metalness: 0.6, roughness: 0.3,
        });
        const toolBody = new THREE.Mesh(
            new THREE.CylinderGeometry(5, 5, 50, 16),
            toolMat
        );
        toolBody.rotation.x = Math.PI / 2;
        toolBody.position.z = 25; // so tip is at Z=0
        toolGroup.add(toolBody);

        const toolTipMesh = new THREE.Mesh(
            new THREE.SphereGeometry(4, 16, 16),
            new THREE.MeshStandardMaterial({ color: COL.toolTip, emissive: 0x661111 })
        );
        toolGroup.add(toolTipMesh);

        three.current = {
            renderer, scene, camera, controls,
            pathGroup, stockGroup, toolGroup, gridGroup,
            segments: [], rafId: null,
        };

        // ── Resize observer ─────────────────────────────────────────────────
        const ro = new ResizeObserver(() => {
            const w = el.clientWidth, h = el.clientHeight;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        });
        ro.observe(el);

        // ── Render loop ──────────────────────────────────────────────────────
        function tick(now) {
            three.current.rafId = requestAnimationFrame(tick);
            const dt = (now - pb.current.lastAt) / 1000;
            pb.current.lastAt = now;

            if (pb.current.playing && pb.current.totalTime > 0) {
                const nextT = pb.current.time + dt * pb.current.speed;
                if (nextT >= pb.current.totalTime) {
                    setTimeInternal(pb.current.totalTime);
                    pb.current.playing = false;
                    onPlayEnd?.();
                } else {
                    setTimeInternal(nextT);
                }
            }
            controls.update();
            renderer.render(scene, camera);
        }
        three.current.rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(three.current.rafId);
            ro.disconnect();
            controls.dispose();
            renderer.dispose();
            if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── setTimeInternal — update Three.js objects + React state ──────────────
    const setTimeInternal = useCallback((t) => {
        const { segments } = three.current;
        if (!moves.length) return;

        const safeT = Math.max(0, Math.min(pb.current.totalTime, t));
        pb.current.time = safeT;

        // Find current move by binary-ish search
        let curIdx = -1;
        let toolX = moves[0].x1, toolY = moves[0].y1, toolZ = moves[0].z1;
        let curFeed = 0;

        for (let i = 0; i < moves.length; i++) {
            const m = moves[i];
            if (safeT >= m.tStart && safeT <= m.tEnd) {
                curIdx = i;
                const u = m.duration > 0 ? (safeT - m.tStart) / m.duration : 1;
                toolX = m.x1 + (m.x2 - m.x1) * u;
                toolY = m.y1 + (m.y2 - m.y1) * u;
                toolZ = m.z1 + (m.z2 - m.z1) * u;
                curFeed = m.feed || 0;
                break;
            }
        }
        if (curIdx < 0) {
            if (safeT >= pb.current.totalTime) {
                curIdx = moves.length - 1;
                toolX = moves[curIdx].x2; toolY = moves[curIdx].y2;
                toolZ = moves[curIdx].z2; curFeed = moves[curIdx].feed || 0;
            }
        }

        // Update segment colors
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const shouldExec = i < curIdx;
            const isCurrent  = i === curIdx;
            let targetColor, targetOpacity;
            if (isCurrent) {
                targetColor   = COL.current;
                targetOpacity = 1.0;
            } else if (shouldExec) {
                targetColor   = seg.execColor;
                targetOpacity = seg.isRapid ? 0.22 : 1.0;
            } else {
                targetColor   = seg.pendingColor;
                targetOpacity = seg.isRapid ? 0.40 : 0.55;
            }
            if (seg.executed !== shouldExec || seg.isCurrent !== isCurrent) {
                seg.line.material.color.setHex(targetColor);
                seg.line.material.opacity = targetOpacity;
                seg.line.material.needsUpdate = true;
                seg.executed  = shouldExec;
                seg.isCurrent = isCurrent;
            }
        }

        // Move tool mesh
        const { toolGroup } = three.current;
        if (toolGroup) toolGroup.position.set(toolX, toolY, toolZ);

        // Update React overlays (batched)
        setToolPos({ x: toolX, y: toolY, z: toolZ, f: curFeed });
        setCurMoveIdx(prev => {
            if (prev !== curIdx) {
                const lineIdx = curIdx >= 0 ? (moves[curIdx]?.lineIdx ?? -1) : -1;
                onMoveChange?.(curIdx, lineIdx);
            }
            return curIdx;
        });
    }, [moves, onMoveChange]);

    // ── Rebuild scene when gcode changes ─────────────────────────────────────
    useEffect(() => {
        const t = three.current;
        if (!t.renderer) return;
        const { stockGroup, pathGroup, gridGroup, camera, controls } = t;

        clearGroup(stockGroup);
        clearGroup(pathGroup);
        clearGroup(gridGroup);
        t.segments = [];

        pb.current.time = 0;
        pb.current.totalTime = totalTime;

        if (!moves.length) return;

        // Bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const m of moves) {
            for (const [x, y, z] of [[m.x1,m.y1,m.z1],[m.x2,m.y2,m.z2]]) {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
            }
        }

        // Stock box (use chapa dims if available, else from bbox)
        const pieceW = chapa?.comprimento || Math.max(250, maxX + 10);
        const pieceH = chapa?.largura    || Math.max(250, maxY + 10);
        const sx = Math.min(0, minX) - 3, ex = Math.max(pieceW, maxX) + 3;
        const sy = Math.min(0, minY) - 3, ey = Math.max(pieceH, maxY) + 3;
        const thick = chapa?.espessura || STOCK_THICKNESS;

        const stockGeom = new THREE.BoxGeometry(ex - sx, ey - sy, thick);
        const stockMat = new THREE.MeshStandardMaterial({
            color: COL.stock, transparent: true, opacity: 0.30,
            roughness: 0.85, metalness: 0,
        });
        const stockMesh = new THREE.Mesh(stockGeom, stockMat);
        stockMesh.position.set((sx + ex) / 2, (sy + ey) / 2, -thick / 2);
        stockGroup.add(stockMesh);

        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(stockGeom),
            new THREE.LineBasicMaterial({ color: COL.stockEdge, transparent: true, opacity: 0.6 })
        );
        edges.position.copy(stockMesh.position);
        stockGroup.add(edges);

        // Grid (XY plane at Z=-thick)
        const tableSize = Math.max(ex - sx, ey - sy) * 1.5;
        const grid = new THREE.GridHelper(tableSize, Math.min(80, Math.round(tableSize / 100)), COL.grid, COL.grid);
        grid.rotation.x = Math.PI / 2;
        grid.position.set((sx + ex) / 2, (sy + ey) / 2, -thick - 0.5);
        gridGroup.add(grid);

        // Axes at origin
        const makeAxis = (a, b, color) => {
            const g = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(...a), new THREE.Vector3(...b),
            ]);
            return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
        };
        const axLen = 80;
        gridGroup.add(makeAxis([0,0,0],[axLen,0,0],COL.axisX));
        gridGroup.add(makeAxis([0,0,0],[0,axLen,0],COL.axisY));
        gridGroup.add(makeAxis([0,0,0],[0,0,axLen],COL.axisZ));

        // Toolpath segments
        for (const m of moves) {
            const pts = [
                new THREE.Vector3(m.x1, m.y1, m.z1),
                new THREE.Vector3(m.x2, m.y2, m.z2),
            ];
            const geom = new THREE.BufferGeometry().setFromPoints(pts);

            const isRapid  = m.type === 'G0';
            const isCutting = !isRapid && m.z2 <= 0;

            const pendingColor = isRapid
                ? COL.rapidPending
                : (isCutting ? COL.cutPending : COL.abovePending);
            const execColor = isRapid
                ? COL.rapidExec
                : (isCutting ? COL.cutExec : COL.aboveExec);

            let mat;
            if (isRapid) {
                mat = new THREE.LineDashedMaterial({
                    color: pendingColor, dashSize: 8, gapSize: 5,
                    transparent: true, opacity: 0.40,
                });
            } else {
                mat = new THREE.LineBasicMaterial({
                    color: pendingColor, transparent: true, opacity: 0.55,
                });
            }
            const line = new THREE.Line(geom, mat);
            if (isRapid) line.computeLineDistances();
            pathGroup.add(line);

            t.segments.push({
                line, move: m, isRapid, isCutting,
                pendingColor, execColor,
                executed: false, isCurrent: false,
            });
        }

        // Position camera to fit scene
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 200);

        controls.target.set(cx, cy, cz);
        camera.position.set(
            cx + span * 0.8,
            cy - span * 1.0,
            cz + span * 0.9
        );
        camera.up.set(0, 0, 1);
        camera.lookAt(cx, cy, cz);
        controls.update();

        setTimeInternal(0);
    }, [gcode, chapa, moves, totalTime, setTimeInternal]);

    // ── Sync external playing/speed → internal playback ref ──────────────────
    useEffect(() => {
        pb.current.playing = playingProp || false;
    }, [playingProp]);

    useEffect(() => {
        pb.current.speed = speedProp || 1;
    }, [speedProp]);

    // ── Imperative API ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset: () => {
            pb.current.playing = false;
            setTimeInternal(0);
        },
        seekTo: (idx) => {
            const i = Math.max(0, Math.min(moves.length - 1, idx));
            const t = moves[i]?.tStart ?? 0;
            setTimeInternal(t);
        },
        getTotalMoves: () => moves.length,
        getCurMove:    () => curMoveIdx,
    }), [moves, curMoveIdx, setTimeInternal]);

    // ── View presets ──────────────────────────────────────────────────────────
    const setView = useCallback((name) => {
        const { camera, controls } = three.current;
        if (!camera) return;
        const tgt = controls.target.clone();
        const span = camera.position.distanceTo(tgt);
        let pos;
        switch (name) {
            case 'top':   pos = new THREE.Vector3(tgt.x, tgt.y, tgt.z + span); break;
            case 'front': pos = new THREE.Vector3(tgt.x, tgt.y - span, tgt.z + span * 0.1); break;
            case 'side':  pos = new THREE.Vector3(tgt.x + span, tgt.y, tgt.z + span * 0.1); break;
            default:      pos = new THREE.Vector3(tgt.x + span*0.6, tgt.y - span*0.8, tgt.z + span*0.7);
        }
        camera.position.copy(pos);
        camera.up.set(0, 0, 1);
        camera.lookAt(tgt);
        controls.target.copy(tgt);
        controls.update();
        setActiveView(name);
    }, []);

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#0d1117' }}>
            {/* Three.js canvas attached here */}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

            {/* ── Position readout — top left ─────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 10, left: 10,
                background: 'rgba(22,27,34,0.88)', backdropFilter: 'blur(6px)',
                border: '1px solid #30363d', borderRadius: 6,
                padding: '8px 12px',
                fontFamily: '"JetBrains Mono","Fira Code",monospace',
                fontSize: 11, lineHeight: 1.7,
                pointerEvents: 'none',
            }}>
                {[
                    { ax: 'X', val: toolPos.x.toFixed(2), color: '#ff5555' },
                    { ax: 'Y', val: toolPos.y.toFixed(2), color: '#55ff55' },
                    { ax: 'Z', val: toolPos.z.toFixed(2), color: '#5599ff' },
                    { ax: 'F', val: toolPos.f ? Math.round(toolPos.f) : '—', color: '#8b949e' },
                ].map(r => (
                    <div key={r.ax} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                        <span style={{ color: r.color, minWidth: 14, fontWeight: 700 }}>{r.ax}</span>
                        <span style={{ color: '#79c0ff', minWidth: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.val}</span>
                    </div>
                ))}
            </div>

            {/* ── View presets — top right ────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 10, right: 10,
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
            }}>
                {[
                    { id: 'iso',   label: 'ISO' },
                    { id: 'top',   label: 'TOPO' },
                    { id: 'front', label: 'FRENTE' },
                    { id: 'side',  label: 'LADO' },
                ].map(v => (
                    <button
                        key={v.id}
                        onClick={() => setView(v.id)}
                        style={{
                            background: activeView === v.id ? '#1f6feb' : 'rgba(22,27,34,0.85)',
                            backdropFilter: 'blur(6px)',
                            color: '#e6edf3',
                            border: `1px solid ${activeView === v.id ? '#58a6ff' : '#30363d'}`,
                            borderRadius: 5,
                            padding: '5px 10px',
                            fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                            fontFamily: '"JetBrains Mono", monospace',
                            letterSpacing: '0.04em',
                        }}
                    >
                        {v.label}
                    </button>
                ))}
            </div>

            {/* ── Legend — bottom left ────────────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 14, left: 12,
                background: 'rgba(22,27,34,0.85)', backdropFilter: 'blur(6px)',
                border: '1px solid #30363d', borderRadius: 6,
                padding: '8px 12px',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10.5, pointerEvents: 'none',
            }}>
                {[
                    { color: '#f0883e', label: 'G0 — Rápido',      dashed: true },
                    { color: '#56d364', label: 'G1 — Corte (acima)',dashed: false },
                    { color: '#58a6ff', label: 'G1 — Corte (Z−)',   dashed: false },
                    { color: '#f78166', label: 'Ferramenta',         dashed: false },
                ].map(l => (
                    <div key={l.label} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 3, color: l.color,
                    }}>
                        <svg width={18} height={4} style={{ flexShrink: 0 }}>
                            {l.dashed
                                ? <line x1={0} y1={2} x2={18} y2={2} stroke={l.color} strokeWidth={2} strokeDasharray="4 3" />
                                : <line x1={0} y1={2} x2={18} y2={2} stroke={l.color} strokeWidth={2} />
                            }
                        </svg>
                        <span>{l.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Hint — bottom right ─────────────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 14, right: 12,
                fontSize: 9.5, color: 'rgba(139,148,158,0.50)',
                fontFamily: '"JetBrains Mono", monospace',
                pointerEvents: 'none',
            }}>
                Orbit · Scroll zoom · Shift+drag pan
            </div>
        </div>
    );
});
