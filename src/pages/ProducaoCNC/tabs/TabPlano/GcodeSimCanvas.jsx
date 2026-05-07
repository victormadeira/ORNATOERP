// GcodeSimCanvas — CNC 3D Toolpath Simulator
// Three.js WebGL: orbit camera, Z-up, Line2 (thick toolpath), time-based playback.
// Improvements: bright pending colors, Line2 for G1, HemisphereLight, time HUD.
import {
    useEffect, useRef, useState, useMemo, forwardRef,
    useImperativeHandle, useCallback,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { parseGcodeForSim } from './parseGcode.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const RAPID_FEED_MM_MIN = 20000;
const STOCK_THICKNESS   = 15.5;

// Colors — bright like professional CAM reference (not dim pending!)
const COL = {
    rapidPending:  0xf0883e,  // orange  (was 0xd29922 — much dimmer)
    rapidExec:     0xffaa55,  // lighter orange when executed (fades behind)
    cutPending:    0x58a6ff,  // bright blue  (was 0x1a5e9e — nearly invisible!)
    cutExec:       0x79c0ff,  // lighter blue
    abovePending:  0x56d364,  // bright green (was 0x145e30 — barely visible)
    aboveExec:     0x7ee787,  // lighter green
    current:       0xffffff,  // white for active segment
    toolBody:      0xf78166,
    toolTip:       0xff4444,
    grid:          0x1e2733,
    axisX:         0xff5555,
    axisY:         0x55ff55,
    axisZ:         0x5599ff,
    stock:         0xc8a878,
    stockEdge:     0x8b6f47,
};

// ─── Parse G-code with per-segment timing ────────────────────────────────────
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

// ─── Time formatter  MM:SS.s ─────────────────────────────────────────────────
function fmtTime(s) {
    if (!s || s < 0) return '0:00.0';
    const m = Math.floor(s / 60);
    const sec = (s - m * 60).toFixed(1).padStart(4, '0');
    return `${m}:${sec}`;
}

// ─── Clear Three.js group ────────────────────────────────────────────────────
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
      onPlayEnd, onMoveChange },
    ref
) {
    const containerRef = useRef(null);

    // All Three.js objects live in refs (not React state)
    const three = useRef({
        renderer: null, scene: null, camera: null, controls: null,
        pathGroup: null, toolGroup: null, stockGroup: null, gridGroup: null,
        segments: [],
        lineMaterials: [], // Line2 materials need resolution updates on resize
        rafId: null,
    });
    const pb = useRef({ time: 0, playing: false, speed: 1, lastAt: 0, totalTime: 0 });

    // React state — overlay only (updated via setTimeInternal)
    const [toolPos,    setToolPos]    = useState({ x: 0, y: 0, z: 0, f: 0 });
    const [curMoveIdx, setCurMoveIdx] = useState(-1);
    const [curTime,    setCurTime]    = useState(0);
    const [activeView, setActiveView] = useState('iso');

    const program = useMemo(() => parse3D(gcode), [gcode]);
    const { moves, totalTime } = program;

    // ── Three.js one-time setup ────────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x0d1117, 1);
        renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();

        // Camera — Z-up convention (Z = height, X/Y = machining plane)
        const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 60000);
        camera.up.set(0, 0, 1);
        camera.position.set(2000, -2000, 2000);
        camera.lookAt(0, 0, 0);

        // Lighting — HemisphereLight for sky/ground gradient + directional for 3D depth
        const hemi = new THREE.HemisphereLight(0xddeeff, 0x111827, 0.75);
        scene.add(hemi);
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(500, 800, 1500);
        scene.add(dir);
        const rim = new THREE.DirectionalLight(0x4466aa, 0.25); // subtle rim light
        rim.position.set(-600, -400, 400);
        scene.add(rim);

        // OrbitControls (Z-up aware)
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.screenSpacePanning = true;

        // Groups
        const stockGroup = new THREE.Group();
        const pathGroup  = new THREE.Group();
        const toolGroup  = new THREE.Group();
        const gridGroup  = new THREE.Group();
        scene.add(gridGroup, stockGroup, pathGroup, toolGroup);

        // Tool mesh — 32 segments for smooth cylinder, emissive tip glow
        const toolBodyMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(6, 6, 60, 32),
            new THREE.MeshStandardMaterial({
                color: COL.toolBody, metalness: 0.8, roughness: 0.2,
                emissive: 0x221100, emissiveIntensity: 0.3,
            })
        );
        toolBodyMesh.rotation.x = Math.PI / 2;
        toolBodyMesh.position.z = 30; // center so tip is at Z=0
        toolGroup.add(toolBodyMesh);

        const toolTipMesh = new THREE.Mesh(
            new THREE.SphereGeometry(5, 32, 16),
            new THREE.MeshStandardMaterial({
                color: COL.toolTip,
                emissive: 0x880000, emissiveIntensity: 0.6,
                metalness: 0.9, roughness: 0.1,
            })
        );
        toolGroup.add(toolTipMesh);

        three.current = {
            renderer, scene, camera, controls,
            pathGroup, stockGroup, toolGroup, gridGroup,
            segments: [], lineMaterials: [], rafId: null,
        };

        // ResizeObserver — also updates Line2 material resolutions
        const ro = new ResizeObserver(() => {
            const w = el.clientWidth, h = el.clientHeight;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            const res = new THREE.Vector2(w, h);
            for (const mat of three.current.lineMaterials) {
                mat.resolution.copy(res);
            }
        });
        ro.observe(el);

        // Render loop — time advances only when pb.playing
        function tick(now) {
            three.current.rafId = requestAnimationFrame(tick);
            const dt = Math.min((now - pb.current.lastAt) / 1000, 0.1); // cap dt
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

    // ── Core: advance playback time → update colors + tool position ───────────
    const setTimeInternal = useCallback((t) => {
        const { segments } = three.current;
        if (!moves.length) return;

        const safeT = Math.max(0, Math.min(pb.current.totalTime, t));
        pb.current.time = safeT;

        // Interpolate tool position along current segment
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
        if (curIdx < 0 && safeT >= pb.current.totalTime && moves.length) {
            curIdx = moves.length - 1;
            const last = moves[curIdx];
            toolX = last.x2; toolY = last.y2; toolZ = last.z2;
            curFeed = last.feed || 0;
        }

        // Update segment colors: executed (bright/faded) → pending (bright) → current (white)
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
                targetOpacity = seg.isRapid ? 0.18 : 1.0;
            } else {
                targetColor   = seg.pendingColor;
                targetOpacity = seg.isRapid ? 0.45 : (seg.isCutting ? 0.65 : 0.55);
            }

            if (seg.executed !== shouldExec || seg.wasCurrent !== isCurrent) {
                seg.line.material.color.setHex(targetColor);
                seg.line.material.opacity = targetOpacity;
                seg.line.material.needsUpdate = true;
                seg.executed   = shouldExec;
                seg.wasCurrent = isCurrent;
            }
        }

        // Move tool
        if (three.current.toolGroup) {
            three.current.toolGroup.position.set(toolX, toolY, toolZ);
        }

        // Update React overlays
        setToolPos({ x: toolX, y: toolY, z: toolZ, f: curFeed });
        setCurTime(safeT);
        setCurMoveIdx(prev => {
            if (prev !== curIdx) {
                const lineIdx = curIdx >= 0 ? (moves[curIdx]?.lineIdx ?? -1) : -1;
                onMoveChange?.(curIdx, lineIdx, safeT);
            }
            return curIdx;
        });
    }, [moves, onMoveChange]);

    // ── Rebuild Three.js scene whenever gcode changes ─────────────────────────
    useEffect(() => {
        const t = three.current;
        if (!t.renderer) return;
        const { stockGroup, pathGroup, gridGroup, camera, controls } = t;

        clearGroup(stockGroup);
        clearGroup(pathGroup);
        clearGroup(gridGroup);
        t.segments = [];
        t.lineMaterials = [];

        pb.current.time = 0;
        pb.current.totalTime = totalTime;

        if (!moves.length) return;

        // Bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const m of moves) {
            for (const [x, y, z] of [[m.x1, m.y1, m.z1], [m.x2, m.y2, m.z2]]) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
        }

        // Stock geometry from chapa data or bbox
        const pieceW = chapa?.comprimento || Math.max(250, maxX + 10);
        const pieceH = chapa?.largura    || Math.max(250, maxY + 10);
        const sx = Math.min(0, minX) - 3, ex = Math.max(pieceW, maxX) + 3;
        const sy = Math.min(0, minY) - 3, ey = Math.max(pieceH, maxY) + 3;
        const thick = chapa?.espessura || STOCK_THICKNESS;

        // Stock — semi-transparent MDF
        const stockGeom = new THREE.BoxGeometry(ex - sx, ey - sy, thick);
        const stockMesh = new THREE.Mesh(stockGeom, new THREE.MeshStandardMaterial({
            color: COL.stock, transparent: true, opacity: 0.30,
            roughness: 0.85, metalness: 0,
        }));
        stockMesh.position.set((sx + ex) / 2, (sy + ey) / 2, -thick / 2);
        stockGroup.add(stockMesh);

        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(stockGeom),
            new THREE.LineBasicMaterial({ color: COL.stockEdge, transparent: true, opacity: 0.7 })
        );
        edges.position.copy(stockMesh.position);
        stockGroup.add(edges);

        // Grid at table surface
        const tableSize = Math.max(ex - sx, ey - sy) * 1.5;
        const grid = new THREE.GridHelper(
            tableSize,
            Math.min(80, Math.round(tableSize / 100)),
            COL.grid, COL.grid
        );
        grid.rotation.x = Math.PI / 2;
        grid.position.set((sx + ex) / 2, (sy + ey) / 2, -thick - 0.5);
        gridGroup.add(grid);

        // Colored axes at part origin
        const mkAxis = (a, b, color) => {
            const g = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(...a), new THREE.Vector3(...b),
            ]);
            return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
        };
        const axLen = Math.max(60, (maxX - minX) * 0.08);
        gridGroup.add(mkAxis([0, 0, 0], [axLen, 0, 0], COL.axisX));
        gridGroup.add(mkAxis([0, 0, 0], [0, axLen, 0], COL.axisY));
        gridGroup.add(mkAxis([0, 0, 0], [0, 0, axLen], COL.axisZ));

        // Viewport size for LineMaterial
        const el    = containerRef.current;
        const vpW   = el?.clientWidth  || 800;
        const vpH   = el?.clientHeight || 600;
        const vpRes = new THREE.Vector2(vpW, vpH);

        // Build toolpath segments
        for (const m of moves) {
            const isRapid   = m.type === 'G0';
            const isCutting = !isRapid && m.z2 <= 0;

            const pendingColor = isRapid ? COL.rapidPending
                : (isCutting ? COL.cutPending : COL.abovePending);
            const execColor = isRapid ? COL.rapidExec
                : (isCutting ? COL.cutExec : COL.aboveExec);

            let line;

            if (isRapid) {
                // G0 rapids — dashed thin line (LineDashedMaterial, Line2 doesn't support dashing)
                const geom = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(m.x1, m.y1, m.z1),
                    new THREE.Vector3(m.x2, m.y2, m.z2),
                ]);
                const mat = new THREE.LineDashedMaterial({
                    color: pendingColor, dashSize: 8, gapSize: 5,
                    transparent: true, opacity: 0.45,
                });
                line = new THREE.Line(geom, mat);
                line.computeLineDistances();
            } else {
                // G1 cuts — Line2 for thick, high-visibility lines
                const geom = new LineGeometry();
                geom.setPositions([m.x1, m.y1, m.z1, m.x2, m.y2, m.z2]);
                const mat = new LineMaterial({
                    color:      pendingColor,
                    linewidth:  isCutting ? 2.5 : 1.8, // pixels (not world units)
                    transparent: true,
                    opacity:    isCutting ? 0.65 : 0.55,
                    resolution: vpRes.clone(),
                });
                line = new Line2(geom, mat);
                t.lineMaterials.push(mat); // track for resize updates
            }

            pathGroup.add(line);
            t.segments.push({
                line, move: m, isRapid, isCutting,
                pendingColor, execColor,
                executed: false, wasCurrent: false,
            });
        }

        // Fit camera to scene
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 200);
        controls.target.set(cx, cy, cz);
        camera.position.set(cx + span * 0.8, cy - span * 1.0, cz + span * 0.9);
        camera.up.set(0, 0, 1);
        camera.lookAt(cx, cy, cz);
        controls.update();

        setTimeInternal(0);
    }, [gcode, chapa, moves, totalTime, setTimeInternal]);

    // ── Sync external props → internal playback ref ───────────────────────────
    useEffect(() => { pb.current.playing = playingProp || false; }, [playingProp]);
    useEffect(() => { pb.current.speed   = speedProp   || 1;    }, [speedProp]);

    // ── Imperative API ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset:          () => { pb.current.playing = false; setTimeInternal(0); },
        seekTo:         (idx) => {
            const i = Math.max(0, Math.min(moves.length - 1, idx));
            setTimeInternal(moves[i]?.tStart ?? 0);
        },
        getTotalMoves:  () => moves.length,
        getCurMove:     () => curMoveIdx,
        getCurrentTime: () => pb.current.time,
        getTotalTime:   () => pb.current.totalTime,
    }), [moves, curMoveIdx, setTimeInternal]);

    // ── View presets ──────────────────────────────────────────────────────────
    const setView = useCallback((name) => {
        const { camera, controls } = three.current;
        if (!camera) return;
        const tgt  = controls.target.clone();
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
            {/* Three.js canvas target */}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

            {/* ── X/Y/Z/F + Time readout — top left ──────────────────────── */}
            <div style={{
                position: 'absolute', top: 10, left: 10,
                background: 'rgba(13,17,23,0.90)', backdropFilter: 'blur(8px)',
                border: '1px solid #30363d', borderRadius: 6,
                padding: '8px 12px',
                fontFamily: '"JetBrains Mono","Fira Code",monospace',
                fontSize: 11, lineHeight: 1.75,
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
                        <span style={{
                            color: '#79c0ff', minWidth: 68, textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                        }}>{r.val}</span>
                    </div>
                ))}
                {/* Time row — visible once we have a program */}
                {totalTime > 0 && (
                    <div style={{
                        marginTop: 5, paddingTop: 5,
                        borderTop: '1px solid rgba(48,54,61,0.55)',
                        display: 'flex', gap: 10, alignItems: 'baseline',
                    }}>
                        <span style={{ color: '#8b949e', minWidth: 14, fontWeight: 700, fontSize: 10 }}>T</span>
                        <span style={{
                            color: '#79c0ff', fontSize: 10,
                            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                        }}>
                            {fmtTime(curTime)} / {fmtTime(totalTime)}
                        </span>
                    </div>
                )}
            </div>

            {/* ── View presets — top right ─────────────────────────────────── */}
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
                            background: activeView === v.id ? '#1f6feb' : 'rgba(13,17,23,0.88)',
                            backdropFilter: 'blur(6px)',
                            color: '#e6edf3',
                            border: `1px solid ${activeView === v.id ? '#58a6ff' : '#30363d'}`,
                            borderRadius: 5, padding: '5px 10px',
                            fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                            fontFamily: '"JetBrains Mono", monospace',
                            letterSpacing: '0.04em',
                        }}
                    >{v.label}</button>
                ))}
            </div>

            {/* ── Legend — bottom left ─────────────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 14, left: 12,
                background: 'rgba(13,17,23,0.88)', backdropFilter: 'blur(6px)',
                border: '1px solid #30363d', borderRadius: 6,
                padding: '8px 12px',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 10.5, pointerEvents: 'none',
            }}>
                {[
                    { color: '#f0883e', label: 'G0 — Rápido',    dashed: true,  thick: false },
                    { color: '#56d364', label: 'G1 — Acima Z0',  dashed: false, thick: true  },
                    { color: '#58a6ff', label: 'G1 — Corte',     dashed: false, thick: true  },
                    { color: '#f78166', label: 'Ferramenta',      dashed: false, thick: false },
                ].map(l => (
                    <div key={l.label} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 3, color: l.color,
                    }}>
                        <svg width={18} height={5} style={{ flexShrink: 0 }}>
                            {l.dashed
                                ? <line x1={0} y1={2.5} x2={18} y2={2.5} stroke={l.color} strokeWidth={1.5} strokeDasharray="4 3" />
                                : <line x1={0} y1={2.5} x2={18} y2={2.5} stroke={l.color} strokeWidth={l.thick ? 3 : 1.5} />
                            }
                        </svg>
                        <span>{l.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Controls hint — bottom right ─────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 14, right: 12,
                fontSize: 9.5, color: 'rgba(139,148,158,0.45)',
                fontFamily: '"JetBrains Mono", monospace',
                pointerEvents: 'none', lineHeight: 1.6,
                textAlign: 'right',
            }}>
                Orbit · Scroll zoom<br />Shift+drag pan
            </div>
        </div>
    );
});
