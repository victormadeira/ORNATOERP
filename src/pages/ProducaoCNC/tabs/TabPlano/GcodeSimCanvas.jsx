// GcodeSimCanvas — CNC 3D Toolpath Simulator
// Sprint 1: paleta técnica, 3 camadas de linha, sem flicker.
// Sprint 2: modos Operador/Técnico/Inspeção, câmera com limites, fit + duplo clique.
// Sprint 3: paleta premium, stock mesh 3D, G0 dashed, tool glow PointLight.
// Sprint 4: stale-closure corrigido via ref, React updates throttled a 20fps.
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

// Sprint 3 CAM palette — premium dark industrial look.
const COL = {
    // Pending — barely visible ghost. Functional, not decoration.
    cutPending:    0x0a1525,  // deep navy-black
    rapidPending:  0x0f1520,  // near-invisible gray
    abovePending:  0x0a1510,  // near-invisible green-gray

    // Executed — calm, readable, not saturated.
    cutExec:       0xE5E7EB,  // gray-200 — white-gray executed cuts
    rapidExec:     0x64748B,  // slate-500 — neutral G0
    aboveExec:     0x94A3B8,  // slate-400 — above-zero

    // Active progress — bright highlight on current segment.
    cutActive:     0xBFE7FF,  // sky-200 — active cut line
    aboveActive:   0x93C5FD,  // blue-300

    // Tool
    toolBody:      0xD1D5DB,  // gray-300 — stainless look
    toolTip:       0x60A5FA,  // blue-400 — active glow tip

    // Stock mesh
    stockFace:     0x1E2933,  // dark graphite sheet surface
    stockEdge:     0x9CA3AF,  // gray-400 edge highlight
    stockSide:     0x111820,  // near-invisible sides

    // Grid / axes
    axisX: 0xef4444, axisY: 0x22c55e, axisZ: 0x3b82f6,
};

// Pending opacity per view mode
const PENDING_OPACITY = {
    operator:   { rapid: 0.00, cut: 0.04 },  // rapid invisible, cuts barely there
    technical:  { rapid: 0.05, cut: 0.07 },  // standard ghost
    inspection: { rapid: 0.18, cut: 0.32 },  // more visible for plan review
};

// ─── Parse G-code with per-segment timing ────────────────────────────────────
function parse3D(gcode) {
    const result = parseGcodeForSim(gcode || '');
    let acc = 0;
    for (const m of result.moves) {
        const dist = Math.hypot(m.x2 - m.x1, m.y2 - m.y1, m.z2 - m.z1);
        const effFeed = m.type === 'G0' ? RAPID_FEED_MM_MIN : (m.feed || 1000);
        m.dist     = dist;
        m.duration = dist / (effFeed / 60);
        m.tStart   = acc;
        acc       += m.duration;
        m.tEnd     = acc;
    }
    return { ...result, totalTime: acc };
}

function fmtTime(s) {
    if (!s || s < 0) return '0:00.0';
    const m = Math.floor(s / 60);
    const sec = (s - m * 60).toFixed(1).padStart(4, '0');
    return `${m}:${sec}`;
}

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

    // All Three.js objects — never trigger re-renders
    const three = useRef({
        renderer: null, scene: null, camera: null, controls: null,
        pathGroup: null, toolGroup: null, stockGroup: null, gridGroup: null,
        progressLine: null, progressGeom: null, progressMat: null,
        segments: [], lineMaterials: [], rafId: null,
        bbox: null,  // { cx, cy, cz, span } — for fit/dblclick
    });
    const pb  = useRef({ time: 0, playing: false, speed: 1, lastAt: 0, totalTime: 0 });

    // Refs to avoid stale closures in animation loop and effects
    const setTimeInternalRef = useRef(null);
    const viewModeRef        = useRef('technical');
    const lastHudRef         = useRef(0);   // throttle React re-renders
    const lastIdxRef         = useRef(-1);  // fire onMoveChange immediately on idx change

    // React state — HUD overlays only
    const [toolPos,    setToolPos]    = useState({ x: 0, y: 0, z: 0, f: 0, op: '' });
    const [curMoveIdx, setCurMoveIdx] = useState(-1);
    const [curTime,    setCurTime]    = useState(0);
    const [activeView, setActiveView] = useState('iso');
    const [viewMode,   setViewMode]   = useState('technical'); // operator|technical|inspection
    const [showGrid,   setShowGrid]   = useState(false);

    const program = useMemo(() => parse3D(gcode), [gcode]);
    const { moves, totalTime } = program;

    // ── One-time Three.js setup ───────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x070A0F, 1); // Sprint 3: deep navy-black background
        renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();

        // Camera — Z-up (Z = height, X/Y = machining plane)
        const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 60000);
        camera.up.set(0, 0, 1);
        camera.position.set(2000, -2000, 2000);
        camera.lookAt(0, 0, 0);

        // Lighting — hemisphere + directional for 3D depth
        scene.add(new THREE.HemisphereLight(0xddeeff, 0x111827, 0.75));
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(500, 800, 1500);
        scene.add(dir);
        const rim = new THREE.DirectionalLight(0x4466aa, 0.25);
        rim.position.set(-600, -400, 400);
        scene.add(rim);

        // OrbitControls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.screenSpacePanning = true;
        // Distance limits set per-scene in rebuild, but set safe defaults
        controls.minDistance = 50;
        controls.maxDistance = 50000;

        // Groups
        const stockGroup = new THREE.Group();
        const pathGroup  = new THREE.Group();
        const toolGroup  = new THREE.Group();
        const gridGroup  = new THREE.Group();
        scene.add(gridGroup, stockGroup, pathGroup, toolGroup);

        // Tool mesh — stainless body + glowing blue tip (Sprint 3)
        const toolBodyMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(6, 6, 60, 32),
            new THREE.MeshStandardMaterial({
                color: COL.toolBody, metalness: 0.85, roughness: 0.15,
                emissive: 0x1a2a3a, emissiveIntensity: 0.4,
            })
        );
        toolBodyMesh.rotation.x = Math.PI / 2;
        toolBodyMesh.position.z = 30;
        toolGroup.add(toolBodyMesh);

        const toolTipMesh = new THREE.Mesh(
            new THREE.SphereGeometry(5, 32, 16),
            new THREE.MeshStandardMaterial({
                color: COL.toolTip,
                emissive: 0x1a5aba, emissiveIntensity: 2.0,  // Sprint 3: bright glow
                metalness: 0.9, roughness: 0.05,
            })
        );
        toolGroup.add(toolTipMesh);

        // PointLight contact glow — follows tool tip (Sprint 3)
        const toolGlow = new THREE.PointLight(0x60A5FA, 80, 200);
        toolGlow.position.set(0, 0, 0);
        toolGroup.add(toolGlow);

        // Active progress line — persistent (not in pathGroup, survives rebuilds)
        const progressGeom = new LineGeometry();
        progressGeom.setPositions([0, 0, 0, 0.001, 0, 0]);
        const progressMat = new LineMaterial({
            color: COL.cutActive, linewidth: 3,
            transparent: true, opacity: 1.0,
            resolution: new THREE.Vector2(el.clientWidth || 800, el.clientHeight || 600),
        });
        const progressLine = new Line2(progressGeom, progressMat);
        progressLine.visible = false;
        progressLine.renderOrder = 2;
        scene.add(progressLine);

        three.current = {
            renderer, scene, camera, controls,
            pathGroup, stockGroup, toolGroup, gridGroup,
            progressLine, progressGeom, progressMat,
            segments: [], lineMaterials: [progressMat], rafId: null,
            bbox: null,
        };

        // Resize: update renderer + camera + LineMaterial resolutions
        const ro = new ResizeObserver(() => {
            const w = el.clientWidth, h = el.clientHeight;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            const res = new THREE.Vector2(w, h);
            for (const mat of three.current.lineMaterials) mat.resolution.copy(res);
        });
        ro.observe(el);

        // Double-click → fit camera to bbox
        const handleDblClick = () => {
            const t = three.current;
            if (!t.bbox || !t.camera) return;
            const { cx, cy, cz, span } = t.bbox;
            t.controls.target.set(cx, cy, cz);
            t.camera.position.set(cx + span * 0.8, cy - span * 1.0, cz + span * 0.9);
            t.camera.up.set(0, 0, 1);
            t.camera.lookAt(cx, cy, cz);
            t.controls.update();
        };
        renderer.domElement.addEventListener('dblclick', handleDblClick);

        // Render loop — uses setTimeInternalRef to avoid stale closure
        function tick(now) {
            three.current.rafId = requestAnimationFrame(tick);
            const dt = Math.min((now - pb.current.lastAt) / 1000, 0.1);
            pb.current.lastAt = now;
            if (pb.current.playing && pb.current.totalTime > 0) {
                const nextT = pb.current.time + dt * pb.current.speed;
                if (nextT >= pb.current.totalTime) {
                    setTimeInternalRef.current?.(pb.current.totalTime);
                    pb.current.playing = false;
                    onPlayEnd?.();
                } else {
                    setTimeInternalRef.current?.(nextT);
                }
            }
            controls.update();
            renderer.render(scene, camera);
        }
        three.current.rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(three.current.rafId);
            ro.disconnect();
            renderer.domElement.removeEventListener('dblclick', handleDblClick);
            controls.dispose();
            renderer.dispose();
            if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Core: advance time → update Three.js (never blocked by React) ─────────
    const setTimeInternal = useCallback((t) => {
        const { segments } = three.current;
        if (!moves.length) return;

        const safeT = Math.max(0, Math.min(pb.current.totalTime, t));
        pb.current.time = safeT;

        // Binary search — O(log n), critical for large G-code files
        let curIdx = -1;
        let toolX = moves[0].x1, toolY = moves[0].y1, toolZ = moves[0].z1;
        let curFeed = 0, curOp = '';

        let lo = 0, hi = moves.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const m = moves[mid];
            if (safeT < m.tStart)    { hi = mid - 1; }
            else if (safeT > m.tEnd) { lo = mid + 1; }
            else {
                curIdx = mid;
                const u = m.duration > 0 ? (safeT - m.tStart) / m.duration : 1;
                toolX = m.x1 + (m.x2 - m.x1) * u;
                toolY = m.y1 + (m.y2 - m.y1) * u;
                toolZ = m.z1 + (m.z2 - m.z1) * u;
                curFeed = m.feed || 0;
                curOp   = m.op   || '';
                break;
            }
        }
        if (curIdx < 0 && safeT >= pb.current.totalTime && moves.length) {
            curIdx = moves.length - 1;
            const last = moves[curIdx];
            toolX = last.x2; toolY = last.y2; toolZ = last.z2;
            curFeed = last.feed || 0; curOp = last.op || '';
        }

        const isFinished = safeT >= pb.current.totalTime && pb.current.totalTime > 0;
        const mode = viewModeRef.current;
        const opa  = PENDING_OPACITY[mode] || PENDING_OPACITY.technical;

        // Segment color state machine — no white, no flicker
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const shouldExec = isFinished || i < curIdx;
            const targetColor   = shouldExec ? seg.execColor   : seg.pendingColor;
            const targetOpacity = shouldExec
                ? (seg.isRapid ? 0.45 : 1.0)
                : (seg.isRapid ? opa.rapid : opa.cut);

            if (seg.executed !== shouldExec) {
                seg.line.material.color.setHex(targetColor);
                seg.line.material.opacity = targetOpacity;
                seg.line.material.needsUpdate = true;
                seg.executed = shouldExec;
            }
        }

        // Active progress line — from segment start to current tool position.
        // Hidden for G0 (no Line2 dashing available) and when finished.
        const { progressLine, progressGeom, progressMat } = three.current;
        if (progressLine) {
            const showProgress = !isFinished
                && curIdx >= 0 && curIdx < moves.length
                && moves[curIdx].type !== 'G0';
            if (showProgress) {
                const m = moves[curIdx];
                const isCut = m.z2 <= 0;
                progressMat.color.setHex(isCut ? COL.cutActive : COL.aboveActive);
                progressGeom.setPositions([m.x1, m.y1, m.z1, toolX, toolY, toolZ]);
                progressLine.visible = true;
            } else {
                progressLine.visible = false;
            }
        }

        // Move tool — immediate, no React
        if (three.current.toolGroup) {
            three.current.toolGroup.position.set(toolX, toolY, toolZ);
        }

        // Fire onMoveChange immediately when segment index changes (G-code sync)
        if (curIdx !== lastIdxRef.current) {
            lastIdxRef.current = curIdx;
            const lineIdx = curIdx >= 0 ? (moves[curIdx]?.lineIdx ?? -1) : -1;
            onMoveChange?.(curIdx, lineIdx, safeT);
        }

        // Throttle React state updates to ~20fps — animation loop runs at 60fps
        // but the HUD doesn't need to re-render every frame
        const now = performance.now();
        if (now - lastHudRef.current > 50) {
            lastHudRef.current = now;
            setToolPos({ x: toolX, y: toolY, z: toolZ, f: curFeed, op: curOp });
            setCurTime(safeT);
            setCurMoveIdx(curIdx);
        }
    }, [moves, onMoveChange]);

    // Keep ref in sync — solves stale closure in render loop tick()
    setTimeInternalRef.current = setTimeInternal;

    // ── Scene rebuild when G-code / chapa changes ─────────────────────────────
    useEffect(() => {
        const t = three.current;
        if (!t.renderer) return;
        const { stockGroup, pathGroup, gridGroup, camera, controls } = t;

        clearGroup(stockGroup);
        clearGroup(pathGroup);
        clearGroup(gridGroup);
        t.segments = [];
        t.lineMaterials = t.progressMat ? [t.progressMat] : [];
        if (t.progressLine) t.progressLine.visible = false;
        lastIdxRef.current = -1;

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

        const pieceW = chapa?.comprimento || Math.max(250, maxX + 10);
        const pieceH = chapa?.largura    || Math.max(250, maxY + 10);
        const sx = Math.min(0, minX) - 3, ex = Math.max(pieceW, maxX) + 3;
        const sy = Math.min(0, minY) - 3, ey = Math.max(pieceH, maxY) + 3;
        const thick = chapa?.espessura || STOCK_THICKNESS;

        // Store bbox for fit/dblclick — world-space bounding box of part
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
        const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 200);
        t.bbox = { cx, cy, cz, span };

        // ── Stock mesh (Sprint 3) — BoxGeometry with opaque face + edge highlight
        const sheetW = ex - sx, sheetH = ey - sy;
        const sheetMesh = new THREE.Mesh(
            new THREE.BoxGeometry(sheetW, sheetH, thick),
            new THREE.MeshStandardMaterial({
                color: COL.stockFace,
                roughness: 0.7, metalness: 0.1,
                transparent: true, opacity: 0.55,
                depthWrite: false,   // avoid z-fighting with toolpath at z=0
            })
        );
        sheetMesh.position.set(
            (sx + ex) / 2,
            (sy + ey) / 2,
            -thick / 2  // bottom of sheet at z=-thick, top at z=0
        );
        sheetMesh.renderOrder = 0;
        stockGroup.add(sheetMesh);

        // Edge highlight — top face outline only
        const edgeGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(sheetW, sheetH, thick));
        const edgeMesh = new THREE.LineSegments(
            edgeGeom,
            new THREE.LineBasicMaterial({ color: COL.stockEdge, transparent: true, opacity: 0.35 })
        );
        edgeMesh.position.copy(sheetMesh.position);
        edgeMesh.renderOrder = 1;
        stockGroup.add(edgeMesh);

        // (mkLine removed — stock now uses BoxGeometry; axes use mkAxis below)

        // ── Grid — off by default; shows in technical/inspection when toggled
        const tableSize = Math.max(ex - sx, ey - sy) * 1.6;
        const grid = new THREE.GridHelper(tableSize, 8, 0x1a2330, 0x1a2330);
        grid.rotation.x = Math.PI / 2;
        grid.position.set((sx + ex) / 2, (sy + ey) / 2, -thick - 1);
        gridGroup.add(grid);
        gridGroup.visible = false; // off by default

        // ── Axes
        const mkAxis = (a, b, color) => new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(...a), new THREE.Vector3(...b),
            ]),
            new THREE.LineBasicMaterial({ color })
        );
        const axLen = Math.max(60, (maxX - minX) * 0.08);
        gridGroup.add(mkAxis([0,0,0],[axLen,0,0], COL.axisX));
        gridGroup.add(mkAxis([0,0,0],[0,axLen,0], COL.axisY));
        gridGroup.add(mkAxis([0,0,0],[0,0,axLen], COL.axisZ));

        // ── Viewport size for LineMaterial
        const el    = containerRef.current;
        const vpRes = new THREE.Vector2(el?.clientWidth || 800, el?.clientHeight || 600);

        // ── Toolpath segments
        for (const m of moves) {
            const isRapid   = m.type === 'G0';
            const isCutting = !isRapid && m.z2 <= 0;

            const pendingColor = isRapid ? COL.rapidPending
                : (isCutting ? COL.cutPending : COL.abovePending);
            const execColor = isRapid ? COL.rapidExec
                : (isCutting ? COL.cutExec : COL.aboveExec);

            let line;
            if (isRapid) {
                // G0: dashed LineDashedMaterial — discrete visual language from cuts (Sprint 3)
                const geomG0 = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(m.x1, m.y1, m.z1),
                    new THREE.Vector3(m.x2, m.y2, m.z2),
                ]);
                geomG0.computeBoundingSphere();
                line = new THREE.Line(
                    geomG0,
                    new THREE.LineDashedMaterial({
                        color: pendingColor, transparent: true, opacity: 0.08,
                        dashSize: 12, gapSize: 8, scale: 1,
                    })
                );
                line.computeLineDistances(); // required for dashes to render
            } else {
                // G1: Line2 for pixel-width thickness
                const geom = new LineGeometry();
                geom.setPositions([m.x1, m.y1, m.z1, m.x2, m.y2, m.z2]);
                const mat = new LineMaterial({
                    color: pendingColor,
                    linewidth: isCutting ? 2.0 : 1.4,
                    transparent: true, opacity: 0.07,
                    resolution: vpRes.clone(),
                });
                line = new Line2(geom, mat);
                t.lineMaterials.push(mat);
            }

            pathGroup.add(line);
            t.segments.push({
                line, move: m, isRapid, isCutting,
                pendingColor, execColor, executed: false,
            });
        }

        // ── Camera fit with bbox-based distance limits
        controls.minDistance = span * 0.25;
        controls.maxDistance = span * 10;
        controls.target.set(cx, cy, cz);
        camera.position.set(cx + span * 0.8, cy - span * 1.0, cz + span * 0.9);
        camera.up.set(0, 0, 1);
        camera.lookAt(cx, cy, cz);
        controls.update();

        setTimeInternal(0);
    }, [gcode, chapa, moves, totalTime, setTimeInternal]);

    // ── Sync external props ───────────────────────────────────────────────────
    useEffect(() => { pb.current.playing = playingProp || false; }, [playingProp]);
    useEffect(() => { pb.current.speed   = speedProp   || 1;    }, [speedProp]);

    // ── View mode → keep viewModeRef in sync + apply visibility side-effects ──
    useEffect(() => {
        viewModeRef.current = viewMode;
        const t = three.current;
        if (!t.stockGroup) return;

        // Stock visibility
        t.stockGroup.visible = viewMode !== 'operator';

        // Grid: respect showGrid toggle, but force off in operator mode
        if (t.gridGroup) t.gridGroup.visible = showGrid && viewMode !== 'operator';

        // Inspection: auto-pause + refresh pending opacity immediately
        if (viewMode === 'inspection') {
            pb.current.playing = false;
            const opa = PENDING_OPACITY.inspection;
            t.segments.forEach(seg => {
                if (!seg.executed) {
                    seg.line.material.opacity = seg.isRapid ? opa.rapid : opa.cut;
                    seg.line.material.needsUpdate = true;
                }
            });
        }
    }, [viewMode, showGrid]);

    // ── Grid toggle (outside mode effect to avoid double-trigger) ────────────
    useEffect(() => {
        const t = three.current;
        if (t.gridGroup) t.gridGroup.visible = showGrid && viewModeRef.current !== 'operator';
    }, [showGrid]);

    // ── Fit camera ────────────────────────────────────────────────────────────
    const fitCamera = useCallback(() => {
        const t = three.current;
        if (!t.bbox || !t.camera) return;
        const { cx, cy, cz, span } = t.bbox;
        t.controls.target.set(cx, cy, cz);
        t.camera.position.set(cx + span * 0.8, cy - span * 1.0, cz + span * 0.9);
        t.camera.up.set(0, 0, 1);
        t.camera.lookAt(cx, cy, cz);
        t.controls.update();
        setActiveView('iso');
    }, []);

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

    // ── Camera angle presets ──────────────────────────────────────────────────
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

    // ── Human-readable operation labels ──────────────────────────────────────
    const moveLabel = useMemo(() => {
        if (curMoveIdx < 0 || curMoveIdx >= moves.length) return '';
        const m = moves[curMoveIdx];
        if (m.type === 'G0') return 'Movimento rápido';
        return m.z2 <= 0 ? 'Corte' : 'Aproximação';
    }, [curMoveIdx, moves]);

    const opLabel = useMemo(() => {
        const op = (toolPos.op || '').trim().replace(/^=+\s*|\s*=+$/g, '');
        if (!op) return '';
        if (/contorno/i.test(op))             return 'Cortando contorno';
        if (/furo|helicoidal|circular/i.test(op)) return 'Furação';
        if (/rebaixo/i.test(op))              return 'Rebaixo';
        if (/canal/i.test(op))               return 'Canal';
        if (/pocket/i.test(op))              return 'Pocket';
        if (/rasgo/i.test(op))               return 'Rasgo';
        if (/gola/i.test(op))                return 'Gola';
        if (/chanfro|chamfer/i.test(op))      return 'Chanfro';
        return op.slice(0, 30);
    }, [toolPos.op]);

    // ─── Render ───────────────────────────────────────────────────────────────
    const mono = '"JetBrains Mono","Fira Code",Consolas,monospace';
    const hudSectionLabel = {
        fontSize: 9, fontWeight: 700, color: '#21262d',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: 4, fontFamily: 'system-ui,sans-serif',
    };
    const hudDivider = { borderTop: '1px solid #1e2733', marginTop: 7, paddingTop: 7 };

    return (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#0d1117' }}>
            {/* Three.js canvas target */}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

            {/* ── HUD — top left ────────────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 10, left: 10,
                background: 'rgba(13,17,23,0.93)', backdropFilter: 'blur(8px)',
                border: '1px solid #1e2733', borderRadius: 7,
                padding: '9px 12px', pointerEvents: 'none',
                fontFamily: mono, minWidth: 152,
            }}>
                {/* Position */}
                <div style={hudSectionLabel}>Posição</div>
                {[
                    { ax: 'X', val: toolPos.x.toFixed(2), color: '#ef4444' },
                    { ax: 'Y', val: toolPos.y.toFixed(2), color: '#22c55e' },
                    { ax: 'Z', val: toolPos.z.toFixed(2), color: '#3b82f6' },
                ].map(r => (
                    <div key={r.ax} style={{ display: 'flex', gap: 10, alignItems: 'baseline', lineHeight: 1.7 }}>
                        <span style={{ color: r.color, minWidth: 12, fontWeight: 700, fontSize: 10 }}>{r.ax}</span>
                        <span style={{ color: '#79c0ff', minWidth: 68, textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{r.val}</span>
                    </div>
                ))}

                {/* Feed */}
                {toolPos.f > 0 && (
                    <div style={hudDivider}>
                        <div style={hudSectionLabel}>Feed</div>
                        <div style={{ fontSize: 11, color: '#79c0ff', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(toolPos.f)} <span style={{ fontSize: 9, color: '#30363d' }}>mm/min</span>
                        </div>
                    </div>
                )}

                {/* Operation */}
                {(moveLabel || opLabel) && (
                    <div style={hudDivider}>
                        <div style={hudSectionLabel}>Operação</div>
                        {moveLabel && (
                            <div style={{ fontSize: 10, color: '#38bdf8', lineHeight: 1.4 }}>{moveLabel}</div>
                        )}
                        {opLabel && opLabel !== moveLabel && (
                            <div style={{ fontSize: 9, color: '#8b949e', marginTop: 1, lineHeight: 1.3 }}>{opLabel}</div>
                        )}
                    </div>
                )}

                {/* Time */}
                {totalTime > 0 && (
                    <div style={hudDivider}>
                        <div style={hudSectionLabel}>Tempo</div>
                        <div style={{ fontSize: 11, color: '#79c0ff', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {fmtTime(curTime)} <span style={{ color: '#21262d' }}>/</span> {fmtTime(totalTime)}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Controls — top right ──────────────────────────────────────── */}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>

                {/* Camera angle presets */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    {[
                        { id: 'iso', label: 'ISO' }, { id: 'top', label: 'TOPO' },
                        { id: 'front', label: 'FRENTE' }, { id: 'side', label: 'LADO' },
                    ].map(v => (
                        <button key={v.id} onClick={() => setView(v.id)} style={{
                            background: activeView === v.id ? '#1f6feb' : 'rgba(13,17,23,0.90)',
                            backdropFilter: 'blur(6px)',
                            color: activeView === v.id ? '#ffffff' : '#6e7681',
                            border: `1px solid ${activeView === v.id ? '#388bfd' : '#1e2733'}`,
                            borderRadius: 5, padding: '5px 10px',
                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            fontFamily: mono, letterSpacing: '0.04em',
                        }}>{v.label}</button>
                    ))}
                </div>

                {/* Fit */}
                <button onClick={fitCamera}
                    title="Encaixar na peça — duplo clique no canvas também funciona"
                    style={{
                        background: 'rgba(13,17,23,0.90)', backdropFilter: 'blur(6px)',
                        color: '#6e7681', border: '1px solid #1e2733',
                        borderRadius: 5, padding: '5px 10px',
                        fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        fontFamily: mono, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 5,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#e6edf3'; e.currentTarget.style.borderColor = '#30363d'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#1e2733'; }}
                >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                    </svg>
                    Encaixar
                </button>

                {/* View modes — Operator / Technical / Inspection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                    <div style={{ fontSize: 9, color: '#21262d', fontFamily: mono, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'right', marginBottom: 1 }}>Modo</div>
                    {[
                        { id: 'operator',   label: 'Operador',  title: 'Ferramenta, corte e caminho atual apenas' },
                        { id: 'technical',  label: 'Técnico',   title: 'G0, eixos, chapa, grid disponível' },
                        { id: 'inspection', label: 'Inspeção',  title: 'Pausa automática — camadas mais visíveis' },
                    ].map(m => (
                        <button key={m.id} onClick={() => setViewMode(m.id)} title={m.title} style={{
                            background: viewMode === m.id ? 'rgba(56,189,248,0.10)' : 'rgba(13,17,23,0.90)',
                            backdropFilter: 'blur(6px)',
                            color: viewMode === m.id ? '#38bdf8' : '#6e7681',
                            border: `1px solid ${viewMode === m.id ? 'rgba(56,189,248,0.30)' : '#1e2733'}`,
                            borderRadius: 5, padding: '5px 12px',
                            fontSize: 10, fontWeight: viewMode === m.id ? 700 : 500,
                            cursor: 'pointer', fontFamily: mono, textAlign: 'left',
                        }}>{m.label}</button>
                    ))}
                </div>

                {/* Grid toggle — only in technical/inspection */}
                {viewMode !== 'operator' && (
                    <button onClick={() => setShowGrid(v => !v)}
                        title="Mostrar/ocultar grade de referência"
                        style={{
                            background: showGrid ? 'rgba(56,189,248,0.08)' : 'rgba(13,17,23,0.90)',
                            backdropFilter: 'blur(6px)',
                            color: showGrid ? '#38bdf8' : '#6e7681',
                            border: `1px solid ${showGrid ? 'rgba(56,189,248,0.25)' : '#1e2733'}`,
                            borderRadius: 5, padding: '5px 12px',
                            fontSize: 10, fontWeight: showGrid ? 600 : 400,
                            cursor: 'pointer', fontFamily: mono, textAlign: 'left',
                        }}
                    >
                        {showGrid ? '▣' : '□'} Grade
                    </button>
                )}
            </div>

            {/* ── Legend — bottom left ──────────────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 14, left: 12,
                background: 'rgba(13,17,23,0.90)', backdropFilter: 'blur(6px)',
                border: '1px solid #1e2733', borderRadius: 6,
                padding: '8px 12px', pointerEvents: 'none',
                fontFamily: mono, fontSize: 10,
            }}>
                {[
                    { color: '#64748B', label: 'G0 — Rápido',   thick: false, dashed: true },
                    { color: '#94A3B8', label: 'G1 — Acima Z0', thick: true  },
                    { color: '#E5E7EB', label: 'G1 — Corte',    thick: true  },
                    { color: '#BFE7FF', label: 'Ativo agora',   thick: true  },
                ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, color: l.color }}>
                        <svg width={18} height={5} style={{ flexShrink: 0 }}>
                            <line x1={0} y1={2.5} x2={18} y2={2.5} stroke={l.color}
                                strokeWidth={l.thick ? 3 : 1.5}
                                strokeDasharray={l.dashed ? '4 3' : undefined} />
                        </svg>
                        <span>{l.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Hint — bottom right ───────────────────────────────────────── */}
            <div style={{
                position: 'absolute', bottom: 14, right: 12,
                fontSize: 9, color: 'rgba(110,118,129,0.40)',
                fontFamily: mono, pointerEvents: 'none',
                lineHeight: 1.7, textAlign: 'right',
            }}>
                Orbit · Scroll zoom<br />Duplo clique encaixa
            </div>
        </div>
    );
});
