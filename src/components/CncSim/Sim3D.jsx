// CncSim/Sim3D.jsx — Three.js 3D simulator with real material removal
// Material removal: CanvasTexture painted progressively as tool cuts (no geometry deformation needed)
// Z-up convention matches CNC machine axes.

import {
    useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle, useCallback,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { getOpCat, getToolDiameter } from './parseGcode.js';

// ─── Texture resolution for material removal canvas ──────────────────────────
const MAT_TEX_SIZE = 1024; // pixels; higher = sharper cuts but more memory

// ─── Scene colors ─────────────────────────────────────────────────────────────
const MDF_TOP_COLOR   = '#c2a46a'; // uncut MDF surface (tan)
const MDF_SIDE_COLOR  = 0x8b6030; // MDF edge cross-section (darker brown)
const MDF_BOTTOM      = 0x6b4820; // MDF bottom face (darkest)
const SCENE_BG        = 0x0c1018; // very dark blue-black, like a CNC enclosure
const RAPID_COLOR     = 0xe44444; // G0 rapid — red dashed
const RAPID_EXEC      = 0x996666; // G0 executed

function fmtTime(s) {
    if (!s || s < 0) return '0:00.0';
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

// ─── MDF wood grain on canvas ────────────────────────────────────────────────
function paintMdfBase(ctx, w, h) {
    // Base warm sand
    ctx.fillStyle = MDF_TOP_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Subtle fiber bands (compressed wood fiber appearance)
    ctx.save();
    for (let i = 0; i < 80; i++) {
        const yy = Math.random() * h;
        const ht = 1 + Math.random() * 3;
        const alpha = 0.04 + Math.random() * 0.07;
        const lighter = Math.random() > 0.5;
        ctx.fillStyle = lighter
            ? `rgba(255,235,180,${alpha})`
            : `rgba(140,90,30,${alpha})`;
        ctx.fillRect(0, yy, w, ht);
    }
    // Vignette — slightly darker at edges
    const vgr = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    vgr.addColorStop(0, 'rgba(0,0,0,0)');
    vgr.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = vgr;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
}

/** Draw one cut move on the material canvas. Returns true if anything was drawn. */
function paintCutMove(ctx, m, chapaW, chapaH, texW, texH, toolDiam) {
    if (m.type === 'G0') return false;
    const depth = Math.max(0, -Math.min(m.z1, m.z2)); // how deep below surface
    if (depth < 0.02) return false; // tool not cutting

    const scaleX = texW / chapaW;
    const scaleY = texH / chapaH;
    const lw = Math.max(1.5, toolDiam * Math.min(scaleX, scaleY));

    // Depth-based color: light brown (shallow) → dark brown → near black (full depth)
    const ratio  = Math.min(1, depth / 18); // normalized 0-1 over 18mm
    const light  = Math.round(55 - ratio * 35); // hsl lightness: 55→20
    ctx.strokeStyle = `hsl(22, 38%, ${light}%)`;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Flip Y: G-code Y=0 is bottom-left; canvas Y=0 is top-left
    const px1 = m.x1 * scaleX;
    const py1 = texH - m.y1 * scaleY;
    const px2 = m.x2 * scaleX;
    const py2 = texH - m.y2 * scaleY;

    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();
    return true;
}

function clearGroup(group) {
    while (group.children.length) {
        const c = group.children[0];
        group.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else if (c.material) c.material.dispose();
    }
}

// ─── Main Sim3D component ─────────────────────────────────────────────────────
export const Sim3D = forwardRef(function Sim3D(
    { parsed, chapa, playing: playingProp, speed: speedProp = 1, onPlayEnd, onMoveChange },
    ref
) {
    const containerRef = useRef(null);
    const three = useRef({
        renderer: null, scene: null, camera: null, controls: null,
        stockGroup: null, pathGroup: null, toolGroup: null, gridGroup: null,
        matCanvas: null, matCtx: null, matTexture: null,
        progressGeom: null, progressMat: null, progressLine: null,
        segments: [], lineMats: [],
        bbox: null,
    });
    const pb = useRef({ time: 0, playing: false, speed: 1, lastAt: 0, totalTime: 0 });
    const setTimeRef = useRef(null);
    const lastHudRef = useRef(0);
    const lastIdxRef = useRef(-1);
    const lastCutIdx = useRef(-1);
    const lastCanvasUpdate = useRef(0);

    // React state — HUD only (no re-render from animation loop)
    const [toolPos,    setToolPos]    = useState({ x: 0, y: 0, z: 0, f: 0, op: '' });
    const [curTime,    setCurTime]    = useState(0);
    const [curMoveIdx, setCurMoveIdx] = useState(-1);
    const [activeView, setActiveView] = useState('iso');
    const [showRapids, setShowRapids] = useState(false);
    const [viewMode,   setViewMode]   = useState('cutting'); // 'cutting' | 'full'
    const viewModeRef   = useRef('cutting');
    const showRapidsRef = useRef(false); // mirror of showRapids — avoids stale closure in setTimeInternal

    const moves     = parsed?.moves    ?? [];
    const totalTime = parsed?.totalTime ?? 0;

    // ── Material canvas helpers (called from animation loop — no React) ───────
    const matCanvasRef = useRef(null); // mirrors three.current.matCanvas for closure access

    const rebuildMatCanvas = useCallback((upToIdx, chapaW, chapaH) => {
        const tc = three.current;
        if (!tc.matCanvas || !tc.matCtx || !tc.matTexture) return;
        const { texW, texH } = tc.matDims || {};
        if (!texW) return;

        paintMdfBase(tc.matCtx, texW, texH);
        let curDiam = 6;
        let dirty = false;
        for (let i = 0; i <= upToIdx && i < moves.length; i++) {
            const m = moves[i];
            // Update tool diameter from events
            for (const ev of (parsed?.events ?? [])) {
                if (ev.moveIdx === i && ev.type === 'tool') curDiam = getToolDiameter(ev.label);
            }
            if (paintCutMove(tc.matCtx, m, chapaW, chapaH, texW, texH, curDiam)) dirty = true;
        }
        if (dirty || upToIdx >= 0) tc.matTexture.needsUpdate = true;
        lastCutIdx.current = upToIdx;
    }, [moves, parsed?.events]);

    const incrementalMatCanvas = useCallback((fromIdx, toIdx, chapaW, chapaH) => {
        const tc = three.current;
        if (!tc.matCanvas || !tc.matCtx || !tc.matTexture) return;
        const { texW, texH } = tc.matDims || {};
        if (!texW) return;

        let curDiam = 6;
        // Walk events to find tool at fromIdx
        for (const ev of (parsed?.events ?? [])) {
            if (ev.moveIdx >= fromIdx) break;
            if (ev.type === 'tool') curDiam = getToolDiameter(ev.label);
        }

        let dirty = false;
        for (let i = fromIdx; i <= toIdx && i < moves.length; i++) {
            const m = moves[i];
            for (const ev of (parsed?.events ?? [])) {
                if (ev.moveIdx === i && ev.type === 'tool') curDiam = getToolDiameter(ev.label);
            }
            if (paintCutMove(tc.matCtx, m, chapaW, chapaH, texW, texH, curDiam)) dirty = true;
        }
        if (dirty) tc.matTexture.needsUpdate = true;
        lastCutIdx.current = toIdx;
    }, [moves, parsed?.events]);

    // ── One-time Three.js setup ───────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(SCENE_BG, 1);
        renderer.shadowMap.enabled = false;
        renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();

        // Z-up camera
        const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.01, 200000);
        camera.up.set(0, 0, 1);
        camera.position.set(3000, -3000, 3000);
        camera.lookAt(0, 0, 0);

        // Lighting — studio 3-point setup
        scene.add(new THREE.AmbientLight(0x203040, 0.9));
        const sun = new THREE.DirectionalLight(0xfff8f0, 1.2);
        sun.position.set(800, 600, 2000);
        scene.add(sun);
        const fill = new THREE.DirectionalLight(0x4080c0, 0.35);
        fill.position.set(-600, -800, 400);
        scene.add(fill);
        const back = new THREE.DirectionalLight(0x203050, 0.2);
        back.position.set(0, 2000, -500);
        scene.add(back);

        // OrbitControls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.screenSpacePanning = true;
        controls.minDistance = 10;
        controls.maxDistance = 300000;

        // Groups
        const stockGroup = new THREE.Group();
        const pathGroup  = new THREE.Group();
        const toolGroup  = new THREE.Group();
        const gridGroup  = new THREE.Group();
        scene.add(stockGroup, pathGroup, toolGroup, gridGroup);

        // Tool model — milling cutter: shank cylinder + tip cone + glow
        const shankMat = new THREE.MeshStandardMaterial({
            color: 0xd0d8e0, metalness: 0.9, roughness: 0.08,
            emissive: 0x101820, emissiveIntensity: 0.5,
        });
        const tipMat = new THREE.MeshStandardMaterial({
            color: 0xffd060, metalness: 0.95, roughness: 0.05,
            emissive: 0xd08000, emissiveIntensity: 1.8,
        });
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 60, 24), shankMat);
        shank.rotation.x = Math.PI / 2;
        shank.position.z = 32;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 24), tipMat);
        tip.rotation.x = -Math.PI / 2;
        tip.position.z = -5;
        const glow = new THREE.PointLight(0xffaa30, 120, 180);
        glow.position.z = -2;
        toolGroup.add(shank, tip, glow);

        // Progress line (active cut segment)
        const progressGeom = new LineGeometry();
        progressGeom.setPositions([0, 0, 0, 0.001, 0.001, 0.001]);
        const progressMat = new LineMaterial({
            color: 0xfde047, linewidth: 3, transparent: true, opacity: 1,
            resolution: new THREE.Vector2(el.clientWidth || 800, el.clientHeight || 600),
        });
        const progressLine = new Line2(progressGeom, progressMat);
        progressLine.visible = false;
        progressLine.renderOrder = 5;
        scene.add(progressLine);

        three.current = {
            ...three.current,
            renderer, scene, camera, controls,
            stockGroup, pathGroup, toolGroup, gridGroup,
            progressGeom, progressMat, progressLine,
            segments: [], lineMats: [progressMat],
        };

        // Resize observer
        const ro = new ResizeObserver(() => {
            const w = el.clientWidth, h = el.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            const res = new THREE.Vector2(w, h);
            for (const mat of three.current.lineMats) mat.resolution.copy(res);
        });
        ro.observe(el);

        // Double-click → fit to bbox
        const onDblClick = () => {
            const { bbox, camera: cam, controls: ctrl } = three.current;
            if (!bbox) return;
            ctrl.target.set(bbox.cx, bbox.cy, bbox.cz);
            cam.position.set(bbox.cx + bbox.span * 0.9, bbox.cy - bbox.span * 1.1, bbox.cz + bbox.span * 0.85);
            cam.up.set(0, 0, 1);
            cam.lookAt(bbox.cx, bbox.cy, bbox.cz);
            ctrl.update();
        };
        renderer.domElement.addEventListener('dblclick', onDblClick);

        // Animation loop
        function tick(now) {
            three.current.rafId = requestAnimationFrame(tick);
            const dt = Math.min((now - pb.current.lastAt) / 1000, 0.12);
            pb.current.lastAt = now;
            if (pb.current.playing && pb.current.totalTime > 0) {
                const next = pb.current.time + dt * pb.current.speed;
                if (next >= pb.current.totalTime) {
                    setTimeRef.current?.(pb.current.totalTime);
                    pb.current.playing = false;
                    onPlayEnd?.();
                } else {
                    setTimeRef.current?.(next);
                }
            }
            controls.update();
            renderer.render(scene, camera);
        }
        three.current.rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(three.current.rafId);
            ro.disconnect();
            renderer.domElement.removeEventListener('dblclick', onDblClick);
            controls.dispose();
            renderer.dispose();
            if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Core: advance time → update scene (no React re-render) ───────────────
    const setTimeInternal = useCallback((t) => {
        if (!moves.length) return;
        const safeT = Math.max(0, Math.min(pb.current.totalTime, t));
        pb.current.time = safeT;

        // Binary search current move index
        let curIdx = -1;
        let toolX = moves[0].x1, toolY = moves[0].y1, toolZ = moves[0].z1;
        let curFeed = 0, curOp = '';
        let lo = 0, hi = moves.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const m = moves[mid];
            if (safeT < m.tStart) hi = mid - 1;
            else if (safeT > m.tEnd) lo = mid + 1;
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
        const atEnd = safeT >= pb.current.totalTime && pb.current.totalTime > 0;
        if (curIdx < 0 && atEnd && moves.length) {
            curIdx = moves.length - 1;
            const last = moves[curIdx];
            toolX = last.x2; toolY = last.y2; toolZ = last.z2;
            curFeed = last.feed || 0; curOp = last.op || '';
        }

        // ── Segment colors ────────────────────────────────────────────────
        const { segments } = three.current;
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const done = atEnd || i <= curIdx;
            if (seg.done !== done) {
                seg.line.material.color.setHex(done ? seg.execColor : seg.pendColor);
                seg.line.material.opacity = done
                    ? (seg.isRapid ? 0.4 : 0.8)
                    : (seg.isRapid ? (showRapidsRef.current ? 0.25 : 0.0) : (viewModeRef.current === 'full' ? 0.55 : 0.12));
                seg.line.material.needsUpdate = true;
                seg.done = done;
            }
        }

        // ── Progress line ─────────────────────────────────────────────────
        const { progressLine, progressGeom, progressMat } = three.current;
        if (progressLine && curIdx >= 0 && curIdx < moves.length && !atEnd) {
            const m = moves[curIdx];
            if (m.type !== 'G0') {
                const isCut = m.z2 <= 0.1;
                const opCat = getOpCat(m.op);
                progressMat.color.set(isCut ? opCat.color : '#fde047');
                progressGeom.setPositions([m.x1, m.y1, m.z1, toolX, toolY, toolZ]);
                progressLine.visible = true;
            } else {
                progressLine.visible = false;
            }
        } else if (progressLine) {
            progressLine.visible = false;
        }

        // ── Tool position ─────────────────────────────────────────────────
        if (three.current.toolGroup) {
            three.current.toolGroup.position.set(toolX, toolY, toolZ);
        }

        // ── Material removal canvas — update at most 20fps ────────────────
        const now = performance.now();
        if (curIdx >= 0 && (now - lastCanvasUpdate.current > 48 || !pb.current.playing)) {
            const chW = chapa?.comprimento ?? three.current.chapaW ?? 2750;
            const chH = chapa?.largura    ?? three.current.chapaH ?? 1850;
            if (curIdx < lastCutIdx.current) {
                // Seeking backwards — rebuild from scratch
                rebuildMatCanvas(curIdx, chW, chH);
            } else if (curIdx > lastCutIdx.current) {
                incrementalMatCanvas(lastCutIdx.current + 1, curIdx, chW, chH);
            }
            lastCanvasUpdate.current = now;
        }

        // ── Notify G-code editor (debounced by index change) ─────────────
        if (curIdx !== lastIdxRef.current) {
            lastIdxRef.current = curIdx;
            const lineIdx = curIdx >= 0 ? (moves[curIdx]?.lineIdx ?? -1) : -1;
            onMoveChange?.(curIdx, lineIdx, safeT);
        }

        // ── HUD (throttled to 20fps) ──────────────────────────────────────
        if (now - lastHudRef.current > 50) {
            lastHudRef.current = now;
            setToolPos({ x: toolX, y: toolY, z: toolZ, f: curFeed, op: curOp });
            setCurTime(safeT);
            setCurMoveIdx(curIdx);
        }
    }, [moves, chapa, rebuildMatCanvas, incrementalMatCanvas, onMoveChange]); // showRapids via ref

    setTimeRef.current = setTimeInternal;

    // ── Scene rebuild on G-code / chapa change ────────────────────────────────
    useEffect(() => {
        const tc = three.current;
        if (!tc.renderer) return;
        const { stockGroup, pathGroup, gridGroup, camera, controls } = tc;

        clearGroup(stockGroup);
        clearGroup(pathGroup);
        clearGroup(gridGroup);
        tc.segments = [];
        tc.lineMats = tc.progressMat ? [tc.progressMat] : [];
        if (tc.progressLine) tc.progressLine.visible = false;
        lastIdxRef.current = -1;
        lastCutIdx.current = -1;
        lastCanvasUpdate.current = 0;

        pb.current.time = 0;
        pb.current.totalTime = totalTime;

        if (!moves.length) return;

        // Bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const m of moves) {
            for (const [vx, vy, vz] of [[m.x1, m.y1, m.z1], [m.x2, m.y2, m.z2]]) {
                if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
                if (vy < minY) minY = vy; if (vy > maxY) maxY = vy;
                if (vz < minZ) minZ = vz; if (vz > maxZ) maxZ = vz;
            }
        }

        const chapaW = chapa?.comprimento ?? Math.max(300, maxX + 20);
        const chapaH = chapa?.largura    ?? Math.max(300, maxY + 20);
        const thick  = chapa?.espessura  ?? 18;
        tc.chapaW = chapaW; tc.chapaH = chapaH;

        const cx = chapaW / 2, cy = chapaH / 2, cz = -thick / 2;
        const span = Math.max(chapaW, chapaH, maxX - minX, maxY - minY) * 1.4;
        tc.bbox = { cx, cy, cz, span };

        // ── Material removal canvas ──────────────────────────────────────
        const aspect = chapaH / chapaW;
        const texW   = MAT_TEX_SIZE;
        const texH   = Math.max(64, Math.round(MAT_TEX_SIZE * aspect));
        tc.matDims   = { texW, texH };

        const matCanvas = document.createElement('canvas');
        matCanvas.width  = texW;
        matCanvas.height = texH;
        const matCtx = matCanvas.getContext('2d');
        paintMdfBase(matCtx, texW, texH);

        const matTexture = new THREE.CanvasTexture(matCanvas);
        matTexture.generateMipmaps = true;
        matTexture.minFilter = THREE.LinearMipmapLinearFilter;
        matTexture.magFilter = THREE.LinearFilter;
        matTexture.anisotropy = tc.renderer.capabilities.getMaxAnisotropy();

        tc.matCanvas  = matCanvas;
        tc.matCtx     = matCtx;
        tc.matTexture = matTexture;

        // ── MDF stock — top face (with canvas texture) ───────────────────
        // PlaneGeometry lies in XY, normal +Z — perfect for Z-up convention
        const topGeom = new THREE.PlaneGeometry(chapaW, chapaH, 1, 1);
        const topMat  = new THREE.MeshStandardMaterial({
            map: matTexture, roughness: 0.82, metalness: 0.0, side: THREE.FrontSide,
        });
        const topMesh = new THREE.Mesh(topGeom, topMat);
        topMesh.position.set(cx, cy, 0.2); // 0.2mm above body to avoid Z-fighting
        stockGroup.add(topMesh);

        // ── MDF body — BoxGeometry for 5 side faces ──────────────────────
        const sideMat = new THREE.MeshStandardMaterial({ color: MDF_SIDE_COLOR, roughness: 0.92, metalness: 0 });
        const btmMat  = new THREE.MeshStandardMaterial({ color: MDF_BOTTOM,     roughness: 0.95, metalness: 0 });
        // BoxGeometry material array: [+x, -x, +y, -y, +z, -z]
        // In Z-up, +z = top. We cover it with the PlaneGeometry above.
        const boxMats = [sideMat, sideMat, sideMat, btmMat, sideMat, sideMat];
        const bodyGeom = new THREE.BoxGeometry(chapaW, chapaH, thick);
        const bodyMesh = new THREE.Mesh(bodyGeom, boxMats);
        bodyMesh.position.set(cx, cy, -thick / 2);
        stockGroup.add(bodyMesh);

        // Sheet outline — thin bright edge
        const edgeGeom = new THREE.EdgesGeometry(bodyGeom);
        const edgeMesh = new THREE.LineSegments(
            edgeGeom,
            new THREE.LineBasicMaterial({ color: 0xc8a470, transparent: true, opacity: 0.45 })
        );
        edgeMesh.position.copy(bodyMesh.position);
        stockGroup.add(edgeMesh);

        // ── Refilo rectangle ─────────────────────────────────────────────
        const ref = chapa?.refilo ?? 10;
        if (ref > 0) {
            const rpts = [
                [ref, ref, 0.5], [chapaW - ref, ref, 0.5],
                [chapaW - ref, chapaH - ref, 0.5], [ref, chapaH - ref, 0.5], [ref, ref, 0.5],
            ].map(([rx, ry, rz]) => new THREE.Vector3(rx, ry, rz));
            const rGeom = new THREE.BufferGeometry().setFromPoints(rpts);
            const rLine = new THREE.Line(rGeom, new THREE.LineBasicMaterial({ color: 0x507090, transparent: true, opacity: 0.5 }));
            stockGroup.add(rLine);
        }

        // ── Origin axes ───────────────────────────────────────────────────
        const axLen = Math.min(80, chapaW * 0.06);
        const mkAx = (a, b, col) => {
            const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
            return new THREE.Line(g, new THREE.LineBasicMaterial({ color: col }));
        };
        stockGroup.add(mkAx([0,0,0],[axLen,0,0.5], 0xef4444));
        stockGroup.add(mkAx([0,0,0],[0,axLen,0.5], 0x22c55e));
        stockGroup.add(mkAx([0,0,0],[0,0,axLen  ], 0x3b82f6));

        // ── Grid ──────────────────────────────────────────────────────────
        const gridSize = Math.max(chapaW, chapaH) * 1.6;
        const grid = new THREE.GridHelper(gridSize, 10, 0x1a2540, 0x1a2540);
        grid.rotation.x = Math.PI / 2;
        grid.position.set(cx, cy, -thick - 2);
        gridGroup.add(grid);
        gridGroup.visible = false;

        // ── Toolpath segments ─────────────────────────────────────────────
        const el = containerRef.current;
        const vpRes = new THREE.Vector2(el?.clientWidth || 800, el?.clientHeight || 600);
        const initOpa = viewModeRef.current === 'full' ? 0.55 : 0.12;

        for (const m of moves) {
            const isRapid  = m.type === 'G0';
            const isCut    = !isRapid && m.z2 <= 0.1;
            const opColor  = getOpCat(m.op).color;

            const pendColor = isRapid ? RAPID_COLOR : (isCut ? parseInt(opColor.replace('#', ''), 16) : 0x0e7490);
            const execColor = isRapid ? RAPID_EXEC  : (isCut ? parseInt(opColor.replace('#', ''), 16) : 0x22d3ee);

            let line;
            if (isRapid) {
                const g0geom = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(m.x1, m.y1, m.z1),
                    new THREE.Vector3(m.x2, m.y2, m.z2),
                ]);
                g0geom.computeBoundingSphere();
                line = new THREE.Line(g0geom, new THREE.LineDashedMaterial({
                    color: pendColor, transparent: true, opacity: 0, dashSize: 10, gapSize: 7,
                }));
                line.computeLineDistances();
            } else {
                const geom = new LineGeometry();
                geom.setPositions([m.x1, m.y1, m.z1, m.x2, m.y2, m.z2]);
                const mat = new LineMaterial({
                    color: pendColor, linewidth: isCut ? 1.8 : 1.2,
                    transparent: true, opacity: initOpa, resolution: vpRes.clone(),
                });
                line = new Line2(geom, mat);
                tc.lineMats.push(mat);
            }
            pathGroup.add(line);
            tc.segments.push({ line, isRapid, isCut, pendColor, execColor, done: false });
        }

        // ── Camera fit ────────────────────────────────────────────────────
        controls.minDistance = span * 0.12;
        controls.maxDistance = span * 8;
        controls.target.set(cx, cy, 0);
        camera.position.set(cx + span * 0.7, cy - span * 0.9, span * 0.75);
        camera.up.set(0, 0, 1);
        camera.lookAt(cx, cy, 0);
        controls.update();

        setTimeRef.current?.(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parsed, chapa]); // moves/totalTime/setTimeInternal derived from parsed; called via ref

    // ── Sync external props ───────────────────────────────────────────────────
    useEffect(() => { pb.current.playing  = playingProp || false; }, [playingProp]);
    useEffect(() => { pb.current.speed    = speedProp   || 1;    }, [speedProp]);

    // ── View mode → refresh opacity ───────────────────────────────────────────
    useEffect(() => {
        viewModeRef.current = viewMode;
        const newOpa = viewMode === 'full' ? 0.55 : 0.12;
        for (const seg of three.current.segments) {
            if (!seg.done && !seg.isRapid) {
                seg.line.material.opacity = newOpa;
                seg.line.material.needsUpdate = true;
            }
        }
    }, [viewMode]);

    // ── Rapid visibility ──────────────────────────────────────────────────────
    useEffect(() => {
        showRapidsRef.current = showRapids;
        for (const seg of three.current.segments) {
            if (seg.isRapid) {
                seg.line.material.opacity = seg.done ? 0.4 : (showRapids ? 0.25 : 0);
                seg.line.material.needsUpdate = true;
            }
        }
    }, [showRapids]);

    // ── Imperative API ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset: () => { pb.current.playing = false; setTimeInternal(0); lastCutIdx.current = -1; },
        seekTo: (idx) => {
            const i = Math.max(0, Math.min(moves.length - 1, idx));
            setTimeInternal(moves[i]?.tStart ?? 0);
        },
        seekToTime: (t) => setTimeInternal(t),
        getTotalMoves:  () => moves.length,
        getCurMove:     () => curMoveIdx,
        getCurrentTime: () => pb.current.time,
        getTotalTime:   () => pb.current.totalTime,
    }), [moves, curMoveIdx, setTimeInternal]);

    // ── Camera presets ────────────────────────────────────────────────────────
    const setView = useCallback((name) => {
        const { camera: cam, controls: ctrl, bbox } = three.current;
        if (!cam || !bbox) return;
        const { cx, cy, cz, span } = bbox;
        let pos;
        switch (name) {
            case 'top':   pos = [cx, cy, cz + span * 1.4]; break;
            case 'front': pos = [cx, cy - span * 1.3, cz + span * 0.2]; break;
            case 'side':  pos = [cx + span * 1.3, cy, cz + span * 0.2]; break;
            default:      pos = [cx + span * 0.7, cy - span * 0.9, cz + span * 0.75]; break;
        }
        ctrl.target.set(cx, cy, name === 'iso' ? 0 : cz);
        cam.position.set(...pos);
        cam.up.set(0, 0, 1);
        cam.lookAt(ctrl.target.x, ctrl.target.y, ctrl.target.z);
        ctrl.update();
        setActiveView(name);
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    const mono = '"JetBrains Mono","Fira Code",Consolas,monospace';
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0c1018' }}>
            {/* Three.js mount */}
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

            {/* ── HUD — top left ───────────────────────────────────────── */}
            <div style={{
                position: 'absolute', top: 10, left: 10, pointerEvents: 'none',
                background: 'rgba(10,15,25,0.90)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8,
                padding: '9px 12px', fontFamily: mono, minWidth: 155,
            }}>
                <div style={{ fontSize: 9, color: '#546270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Posição</div>
                {[['X', toolPos.x, '#ef4444'], ['Y', toolPos.y, '#22c55e'], ['Z', toolPos.z, '#3b82f6']].map(([ax, v, c]) => (
                    <div key={ax} style={{ display: 'flex', gap: 8, lineHeight: 1.75 }}>
                        <span style={{ color: c, minWidth: 12, fontWeight: 700, fontSize: 10 }}>{ax}</span>
                        <span style={{ color: '#79c0ff', minWidth: 70, textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(2)}</span>
                    </div>
                ))}
                {toolPos.f > 0 && (
                    <>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 6 }}>
                            <div style={{ fontSize: 9, color: '#546270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Feed</div>
                            <div style={{ fontSize: 11, color: '#79c0ff', fontVariantNumeric: 'tabular-nums' }}>
                                {Math.round(toolPos.f)} <span style={{ fontSize: 9, color: '#546270' }}>mm/min</span>
                            </div>
                        </div>
                    </>
                )}
                {totalTime > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 6 }}>
                        <div style={{ fontSize: 9, color: '#546270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Tempo</div>
                        <div style={{ fontSize: 10, color: '#79c0ff', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtTime(curTime)} / {fmtTime(totalTime)}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Controls — top right ─────────────────────────────────── */}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Camera presets */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    {[['iso', 'ISO'], ['top', 'TOPO'], ['front', 'FRENTE'], ['side', 'LADO']].map(([id, lb]) => (
                        <button key={id} onClick={() => setView(id)} style={{
                            padding: '5px 6px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                            borderRadius: 5, border: activeView === id ? '1px solid #4d8cf6' : '1px solid rgba(255,255,255,0.12)',
                            background: activeView === id ? 'rgba(77,140,246,0.25)' : 'rgba(10,15,25,0.85)',
                            color: activeView === id ? '#79c0ff' : '#7890a8', fontFamily: mono,
                        }}>{lb}</button>
                    ))}
                </div>

                {/* Rapid toggle */}
                <button onClick={() => setShowRapids(p => !p)} style={{
                    padding: '5px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                    borderRadius: 5, border: showRapids ? '1px solid #e44444' : '1px solid rgba(255,255,255,0.12)',
                    background: showRapids ? 'rgba(228,68,68,0.18)' : 'rgba(10,15,25,0.85)',
                    color: showRapids ? '#e44444' : '#7890a8', fontFamily: mono, whiteSpace: 'nowrap',
                }}>G0 Rápido</button>

                {/* Path visibility */}
                <button onClick={() => setViewMode(p => p === 'full' ? 'cutting' : 'full')} style={{
                    padding: '5px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                    borderRadius: 5, border: viewMode === 'full' ? '1px solid #4d8cf6' : '1px solid rgba(255,255,255,0.12)',
                    background: viewMode === 'full' ? 'rgba(77,140,246,0.18)' : 'rgba(10,15,25,0.85)',
                    color: viewMode === 'full' ? '#79c0ff' : '#7890a8', fontFamily: mono, whiteSpace: 'nowrap',
                }}>Trajetória</button>
            </div>

            {/* ── Empty state ────────────────────────────────────────────── */}
            {Boolean(parsed) && moves.length === 0 && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(10,14,22,0.75)', color: '#7890a8',
                    fontFamily: 'system-ui,sans-serif', textAlign: 'center', pointerEvents: 'none',
                }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Nenhum movimento detectado</div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>Confira se o G-code contém linhas G0/G1 com coordenadas XY.</div>
                    </div>
                </div>
            )}
        </div>
    );
});
