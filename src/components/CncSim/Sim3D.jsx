// CncSim/Sim3D.jsx  — v4 (rewrite limpo)
// Animação move-a-move: sem interpolação de tempo, sem busca binária, sem edge cases.
// curMoveRef avança +1 por intervalo (igual ao GcodeSimWrapper que funciona).
// Three.js scene: MDF com canvas texture, toolpath colorido por operação, camera presets.

import {
    useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle, useCallback,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 }        from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { getOpCat, getToolDiameter } from './parseGcode.js';

// ─── Constantes ───────────────────────────────────────────────────────────────
const MAT_TEX_SIZE  = 1024;
const DEPTH_MAP_RES = 256;
const MDF_TOP_COLOR = '#c2a46a';
const MDF_SIDE_COLOR = 0x8b6030;
const MDF_BOTTOM     = 0x6b4820;
const SCENE_BG       = 0x0c1018;
const RAPID_COLOR    = 0xe44444;
const RAPID_EXEC     = 0x996666;

function fmtTime(s) {
    if (!s || s < 0) return '0:00.0';
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

// ─── MDF grain texture ────────────────────────────────────────────────────────
function paintMdfBase(ctx, w, h) {
    ctx.fillStyle = MDF_TOP_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    for (let i = 0; i < 80; i++) {
        const yy = Math.random() * h;
        const ht = 1 + Math.random() * 3;
        const alpha = 0.04 + Math.random() * 0.07;
        ctx.fillStyle = Math.random() > 0.5
            ? `rgba(255,235,180,${alpha})`
            : `rgba(140,90,30,${alpha})`;
        ctx.fillRect(0, yy, w, ht);
    }
    const vgr = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    vgr.addColorStop(0, 'rgba(0,0,0,0)');
    vgr.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = vgr;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
}

function updateDepthMap(heightmap, m, chapaW, chapaH, toolDiam) {
    if (m.type === 'G0') return false;
    const depth = Math.max(0, -Math.min(m.z1, m.z2));
    if (depth < 0.02) return false;
    const scaleX = DEPTH_MAP_RES / chapaW;
    const scaleY = DEPTH_MAP_RES / chapaH;
    const radius  = Math.max(0.5, toolDiam / 2);
    const px1 = m.x1 * scaleX, py1 = m.y1 * scaleY;
    const px2 = m.x2 * scaleX, py2 = m.y2 * scaleY;
    const dx = px2 - px1, dy = py2 - py1;
    const len = Math.hypot(dx, dy);
    const steps  = Math.max(1, Math.ceil(len * 2));
    const rCells = Math.max(1, Math.ceil(radius * Math.min(scaleX, scaleY)));
    let changed = false;
    for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cx = px1 + dx * t, cy = py1 + dy * t;
        const x0 = Math.max(0, Math.floor(cx - rCells));
        const x1 = Math.min(DEPTH_MAP_RES - 1, Math.ceil(cx + rCells));
        const y0 = Math.max(0, Math.floor(cy - rCells));
        const y1 = Math.min(DEPTH_MAP_RES - 1, Math.ceil(cy + rCells));
        for (let gx = x0; gx <= x1; gx++) {
            for (let gy = y0; gy <= y1; gy++) {
                if (Math.hypot(gx - cx, gy - cy) <= rCells) {
                    const idx = gy * DEPTH_MAP_RES + gx;
                    if (depth > heightmap[idx]) { heightmap[idx] = depth; changed = true; }
                }
            }
        }
    }
    return changed;
}

function paintCutMove(ctx, m, chapaW, chapaH, texW, texH, toolDiam, heightmap) {
    if (m.type === 'G0') return false;
    const depth = Math.max(0, -Math.min(m.z1, m.z2));
    if (depth < 0.02) return false;
    const scaleX = texW / chapaW, scaleY = texH / chapaH;
    const lw = Math.max(1.5, toolDiam * Math.min(scaleX, scaleY));
    let renderDepth = depth;
    if (heightmap) {
        const midX = (m.x1 + m.x2) / 2 * (DEPTH_MAP_RES / chapaW);
        const midY = (m.y1 + m.y2) / 2 * (DEPTH_MAP_RES / chapaH);
        const gx = Math.max(0, Math.min(DEPTH_MAP_RES - 1, Math.round(midX)));
        const gy = Math.max(0, Math.min(DEPTH_MAP_RES - 1, Math.round(midY)));
        const hmDepth = heightmap[gy * DEPTH_MAP_RES + gx];
        if (hmDepth > 0) renderDepth = hmDepth;
    }
    const ratio = Math.min(1, renderDepth / 18);
    const light = Math.round(55 - ratio * 35);
    ctx.strokeStyle = `hsl(22, 38%, ${light}%)`;
    ctx.lineWidth  = lw;
    ctx.lineCap    = 'round';
    ctx.lineJoin   = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x1 * scaleX, texH - m.y1 * scaleY);
    ctx.lineTo(m.x2 * scaleX, texH - m.y2 * scaleY);
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

// ─── Componente principal ──────────────────────────────────────────────────────
export const Sim3D = forwardRef(function Sim3D(
    { parsed, chapa, playing: playingProp, speed: speedProp = 1, onPlayEnd, onMoveChange },
    ref
) {
    const containerRef = useRef(null);
    const three = useRef({
        renderer: null, scene: null, camera: null, controls: null,
        stockGroup: null, pathGroup: null, toolGroup: null, gridGroup: null,
        matCanvas: null, matCtx: null, matTexture: null, matDims: null,
        chapaW: 2750, chapaH: 1850,
        depthMap: null,
        segments: [], lineMats: [],
        bbox: null,
        rafId: null,
    });

    // Memoiza chapa pelos valores reais — evita rebuild ao receber nova referência
    // com os mesmos dados (frequente com Zustand/WebSocket).
    const chapaKey = `${chapa?.comprimento}|${chapa?.largura}|${chapa?.espessura}|${chapa?.refilo}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const chapaStable = useMemo(() => chapa, [chapaKey]);

    const moves     = parsed?.moves    ?? [];
    const totalTime = parsed?.totalTime ?? 0;

    // ── Refs da animação (sem React state no loop) ────────────────────────────
    const curMoveRef   = useRef(-1);   // índice do move atual (-1 = antes do início)
    const accRef       = useRef(0);    // acumulador de tempo (ms) entre moves
    const playingRef   = useRef(false);
    const speedRef     = useRef(speedProp);
    const lastTickRef  = useRef(0);

    // Refs para callbacks/dados mutáveis no loop (evita closures stale)
    const movesRef         = useRef(moves);
    const onPlayEndRef     = useRef(onPlayEnd);
    const renderAtMoveRef  = useRef(null);
    movesRef.current       = moves;
    onPlayEndRef.current   = onPlayEnd;
    speedRef.current       = speedProp;

    // ── Refs de throttle ──────────────────────────────────────────────────────
    const lastHudRef        = useRef(0);
    const lastReportedRef   = useRef(-1);
    const lastCutIdx        = useRef(-1);
    const lastCanvasUpdate  = useRef(0);

    // ── React state (apenas HUD — 20fps) ─────────────────────────────────────
    const [toolPos,    setToolPos]    = useState({ x: 0, y: 0, z: 0, f: 0, op: '' });
    const [curTime,    setCurTime]    = useState(0);
    const [curMoveIdx, setCurMoveIdx] = useState(-1);
    const [activeView, setActiveView] = useState('iso');
    const [showRapids, setShowRapids] = useState(false);
    const [viewMode,   setViewMode]   = useState('full');
    const viewModeRef   = useRef('full');
    const showRapidsRef = useRef(false);

    // ── Canvas de remoção de material ──────────────────────────────────────────
    const rebuildMatCanvas = useCallback((upToIdx, chapaW, chapaH) => {
        const tc = three.current;
        if (!tc.matCanvas || !tc.matCtx || !tc.matTexture) return;
        const { texW, texH } = tc.matDims || {};
        if (!texW) return;
        const heightmap = new Float32Array(DEPTH_MAP_RES * DEPTH_MAP_RES);
        tc.depthMap = heightmap;
        paintMdfBase(tc.matCtx, texW, texH);
        let curDiam = 6, dirty = false;
        const evts = parsed?.events ?? [];
        for (let i = 0; i <= upToIdx && i < moves.length; i++) {
            for (const ev of evts) { if (ev.moveIdx === i && ev.type === 'tool') curDiam = getToolDiameter(ev.label); }
            updateDepthMap(heightmap, moves[i], chapaW, chapaH, curDiam);
            if (paintCutMove(tc.matCtx, moves[i], chapaW, chapaH, texW, texH, curDiam, heightmap)) dirty = true;
        }
        if (dirty || upToIdx >= 0) tc.matTexture.needsUpdate = true;
        lastCutIdx.current = upToIdx;
    }, [moves, parsed?.events]);

    const incrementalMatCanvas = useCallback((fromIdx, toIdx, chapaW, chapaH) => {
        const tc = three.current;
        if (!tc.matCanvas || !tc.matCtx || !tc.matTexture) return;
        const { texW, texH } = tc.matDims || {};
        if (!texW) return;
        if (!tc.depthMap) tc.depthMap = new Float32Array(DEPTH_MAP_RES * DEPTH_MAP_RES);
        const heightmap = tc.depthMap;
        let curDiam = 6;
        const evts = parsed?.events ?? [];
        for (const ev of evts) { if (ev.moveIdx >= fromIdx) break; if (ev.type === 'tool') curDiam = getToolDiameter(ev.label); }
        let dirty = false;
        for (let i = fromIdx; i <= toIdx && i < moves.length; i++) {
            for (const ev of evts) { if (ev.moveIdx === i && ev.type === 'tool') curDiam = getToolDiameter(ev.label); }
            updateDepthMap(heightmap, moves[i], chapaW, chapaH, curDiam);
            if (paintCutMove(tc.matCtx, moves[i], chapaW, chapaH, texW, texH, curDiam, heightmap)) dirty = true;
        }
        if (dirty) tc.matTexture.needsUpdate = true;
        lastCutIdx.current = toIdx;
    }, [moves, parsed?.events]);

    // ── Renderiza cena no índice idx ──────────────────────────────────────────
    // Esta função é chamada pelo loop de animação (via renderAtMoveRef).
    // Não usa React state — pura manipulação Three.js + throttled HUD.
    const renderAtMove = useCallback((idx) => {
        const tc  = three.current;
        const mvs = movesRef.current;
        if (!tc.renderer || !mvs.length) return;

        const clamped = Math.max(-1, Math.min(mvs.length - 1, idx));
        const atEnd   = clamped >= mvs.length - 1;

        // Posição da ferramenta
        let toolX = mvs[0].x1, toolY = mvs[0].y1, toolZ = mvs[0].z1;
        let curFeed = 0, curOp = '';
        if (clamped >= 0) {
            const m = mvs[clamped];
            toolX = m.x2; toolY = m.y2; toolZ = m.z2;
            curFeed = m.feed || 0; curOp = m.op || '';
        }

        // Cores dos segmentos (só atualiza o que mudou)
        const { segments } = tc;
        for (let i = 0; i < segments.length; i++) {
            const seg  = segments[i];
            const done = atEnd || i <= clamped;
            if (seg.done !== done) {
                seg.line.material.color.setHex(done ? seg.execColor : seg.pendColor);
                seg.line.material.opacity = done
                    ? (seg.isRapid ? 0.4 : 0.8)
                    : (seg.isRapid
                        ? (showRapidsRef.current ? 0.25 : 0.0)
                        : (viewModeRef.current === 'full' ? 0.55 : 0.12));
                seg.line.material.needsUpdate = true;
                seg.done = done;
            }
        }

        // Ferramenta: oculta durante G0 (rapids de posicionamento)
        if (tc.toolGroup) {
            const isRapid = clamped >= 0 && mvs[clamped]?.type === 'G0';
            tc.toolGroup.visible = clamped >= 0 && !isRapid;
            tc.toolGroup.position.set(toolX, toolY, toolZ);
        }

        // Canvas de remoção de material (throttled a 20fps)
        const now = performance.now();
        if (now - lastCanvasUpdate.current > 48 || !playingRef.current) {
            const chW = chapaStable?.comprimento ?? tc.chapaW ?? 2750;
            const chH = chapaStable?.largura    ?? tc.chapaH ?? 1850;
            if (clamped < lastCutIdx.current) {
                rebuildMatCanvas(clamped, chW, chH);
            } else if (clamped > lastCutIdx.current) {
                incrementalMatCanvas(lastCutIdx.current + 1, clamped, chW, chH);
            }
            lastCanvasUpdate.current = now;
        }

        // Notifica G-code editor (só quando muda)
        if (clamped !== lastReportedRef.current) {
            lastReportedRef.current = clamped;
            const lineIdx = clamped >= 0 ? (mvs[clamped]?.lineIdx ?? -1) : -1;
            const t       = clamped >= 0 ? (mvs[clamped]?.tEnd ?? 0) : 0;
            onMoveChange?.(clamped, lineIdx, t);
        }

        // HUD — throttled a 20fps
        if (now - lastHudRef.current > 50) {
            lastHudRef.current = now;
            setToolPos({ x: toolX, y: toolY, z: toolZ, f: curFeed, op: curOp });
            setCurTime(clamped >= 0 ? (mvs[clamped]?.tEnd ?? 0) : 0);
            setCurMoveIdx(clamped);
        }
    }, [chapaStable, rebuildMatCanvas, incrementalMatCanvas, onMoveChange]);

    // Mantém ref atualizada para o loop
    renderAtMoveRef.current = renderAtMove;

    // ── Setup Three.js (uma vez) ───────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(SCENE_BG, 1);
        renderer.shadowMap.enabled = false;
        renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
        el.appendChild(renderer.domElement);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.01, 200000);
        camera.up.set(0, 0, 1);
        camera.position.set(3000, -3000, 3000);
        camera.lookAt(0, 0, 0);

        scene.add(new THREE.AmbientLight(0x203040, 0.9));
        const sun  = new THREE.DirectionalLight(0xfff8f0, 1.2); sun.position.set(800, 600, 2000);  scene.add(sun);
        const fill = new THREE.DirectionalLight(0x4080c0, 0.35); fill.position.set(-600, -800, 400); scene.add(fill);
        const back = new THREE.DirectionalLight(0x203050, 0.2);  back.position.set(0, 2000, -500);  scene.add(back);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.screenSpacePanning = true;
        controls.minDistance = 10;
        controls.maxDistance = 300000;
        controls.zoomToCursor = true;

        const stockGroup = new THREE.Group();
        const pathGroup  = new THREE.Group();
        const toolGroup  = new THREE.Group();
        const gridGroup  = new THREE.Group();
        scene.add(stockGroup, pathGroup, toolGroup, gridGroup);

        // Modelo da ferramenta
        const shankMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 0.9, roughness: 0.08, emissive: 0x101820, emissiveIntensity: 0.5 });
        const tipMat   = new THREE.MeshStandardMaterial({ color: 0xffd060, metalness: 0.95, roughness: 0.05, emissive: 0xd08000, emissiveIntensity: 1.8 });
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 60, 24), shankMat);
        shank.rotation.x = Math.PI / 2; shank.position.z = 32;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 24), tipMat);
        tip.rotation.x = -Math.PI / 2; tip.position.z = -5;
        const glow = new THREE.PointLight(0xffaa30, 120, 180); glow.position.z = -2;
        toolGroup.add(shank, tip, glow);
        toolGroup.visible = false;

        three.current = {
            ...three.current,
            renderer, scene, camera, controls,
            stockGroup, pathGroup, toolGroup, gridGroup,
            segments: [], lineMats: [],
        };

        // Resize
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

        // Double-click → fit view
        const onDblClick = () => {
            const { bbox, camera: cam, controls: ctrl } = three.current;
            if (!bbox) return;
            ctrl.target.set(bbox.cx, bbox.cy, bbox.cz);
            cam.position.set(bbox.cx + bbox.span * 0.9, bbox.cy - bbox.span * 1.1, bbox.cz + bbox.span * 0.85);
            cam.up.set(0, 0, 1); cam.lookAt(bbox.cx, bbox.cy, bbox.cz); ctrl.update();
        };
        renderer.domElement.addEventListener('dblclick', onDblClick);

        // ── Loop de animação ─────────────────────────────────────────────────
        // Animação move-a-move: sem interpolação de tempo, sem busca binária.
        // interval = 60/speed ms por move (igual ao GcodeSimWrapper 2D que funciona bem).
        function tick(now) {
            three.current.rafId = requestAnimationFrame(tick);

            if (playingRef.current && movesRef.current.length > 0) {
                const spd      = speedRef.current;
                const interval = Math.max(1, 60 / spd);            // ms por move
                const dt       = Math.min(now - lastTickRef.current, 200); // cap em 200ms (tab oculta)
                accRef.current += dt;

                let advanced = false;
                while (accRef.current >= interval && curMoveRef.current < movesRef.current.length - 1) {
                    curMoveRef.current++;
                    accRef.current -= interval;
                    advanced = true;
                }

                if (advanced) {
                    renderAtMoveRef.current?.(curMoveRef.current);
                }

                if (curMoveRef.current >= movesRef.current.length - 1) {
                    playingRef.current = false;
                    onPlayEndRef.current?.();
                }
            }

            lastTickRef.current = now;
            controls.update();
            renderer.render(scene, camera);
        }
        lastTickRef.current = performance.now();
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

    // ── Rebuild de cena ao mudar G-code ou dimensões da chapa ─────────────────
    useEffect(() => {
        const tc = three.current;
        if (!tc.renderer) return;
        const { stockGroup, pathGroup, gridGroup, camera, controls } = tc;

        clearGroup(stockGroup); clearGroup(pathGroup); clearGroup(gridGroup);
        tc.segments = []; tc.lineMats = [];
        lastReportedRef.current  = -1;
        lastCutIdx.current       = -1;
        lastCanvasUpdate.current = 0;
        tc.depthMap = null;

        // Reset animação
        curMoveRef.current = -1;
        accRef.current     = 0;

        if (!moves.length) {
            renderAtMoveRef.current?.(-1);
            return;
        }

        // Bounding box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const m of moves) {
            if (m.x1 < minX) minX = m.x1; if (m.x2 < minX) minX = m.x2;
            if (m.x1 > maxX) maxX = m.x1; if (m.x2 > maxX) maxX = m.x2;
            if (m.y1 < minY) minY = m.y1; if (m.y2 < minY) minY = m.y2;
            if (m.y1 > maxY) maxY = m.y1; if (m.y2 > maxY) maxY = m.y2;
        }

        const chapaW = chapaStable?.comprimento ?? Math.max(300, maxX + 20);
        const chapaH = chapaStable?.largura    ?? Math.max(300, maxY + 20);
        const thick  = chapaStable?.espessura  ?? 18;
        tc.chapaW = chapaW; tc.chapaH = chapaH;

        const cx = chapaW / 2, cy = chapaH / 2;
        const span = Math.max(chapaW, chapaH, maxX - minX, maxY - minY) * 1.4;
        tc.bbox = { cx, cy, cz: -thick / 2, span };

        // Canvas texture para remoção de material
        const aspect = chapaH / chapaW;
        const texW   = MAT_TEX_SIZE;
        const texH   = Math.max(64, Math.round(MAT_TEX_SIZE * aspect));
        tc.matDims   = { texW, texH };
        const matCanvas = document.createElement('canvas');
        matCanvas.width = texW; matCanvas.height = texH;
        const matCtx = matCanvas.getContext('2d');
        paintMdfBase(matCtx, texW, texH);
        const matTexture = new THREE.CanvasTexture(matCanvas);
        matTexture.generateMipmaps = true;
        matTexture.minFilter = THREE.LinearMipmapLinearFilter;
        matTexture.magFilter = THREE.LinearFilter;
        matTexture.anisotropy = tc.renderer.capabilities.getMaxAnisotropy();
        tc.matCanvas = matCanvas; tc.matCtx = matCtx; tc.matTexture = matTexture;

        // Chapa MDF — topo com textura
        const topGeom = new THREE.PlaneGeometry(chapaW, chapaH, 1, 1);
        const topMat  = new THREE.MeshStandardMaterial({ map: matTexture, roughness: 0.82, metalness: 0 });
        const topMesh = new THREE.Mesh(topGeom, topMat);
        topMesh.position.set(cx, cy, 0.2);
        stockGroup.add(topMesh);

        // Chapa MDF — corpo (5 faces laterais)
        const sideMat  = new THREE.MeshStandardMaterial({ color: MDF_SIDE_COLOR, roughness: 0.92, metalness: 0 });
        const btmMat   = new THREE.MeshStandardMaterial({ color: MDF_BOTTOM,     roughness: 0.95, metalness: 0 });
        const bodyGeom = new THREE.BoxGeometry(chapaW, chapaH, thick);
        const bodyMesh = new THREE.Mesh(bodyGeom, [sideMat, sideMat, sideMat, btmMat, sideMat, sideMat]);
        bodyMesh.position.set(cx, cy, -thick / 2);
        stockGroup.add(bodyMesh);

        const edgeGeom = new THREE.EdgesGeometry(bodyGeom);
        const edgeMesh = new THREE.LineSegments(edgeGeom, new THREE.LineBasicMaterial({ color: 0xc8a470, transparent: true, opacity: 0.45 }));
        edgeMesh.position.copy(bodyMesh.position);
        stockGroup.add(edgeMesh);

        // Refilo
        const refilo = chapaStable?.refilo ?? 10;
        if (refilo > 0) {
            const rpts = [[refilo, refilo], [chapaW - refilo, refilo], [chapaW - refilo, chapaH - refilo], [refilo, chapaH - refilo], [refilo, refilo]]
                .map(([rx, ry]) => new THREE.Vector3(rx, ry, 0.5));
            const rGeom = new THREE.BufferGeometry().setFromPoints(rpts);
            stockGroup.add(new THREE.Line(rGeom, new THREE.LineBasicMaterial({ color: 0x507090, transparent: true, opacity: 0.5 })));
        }

        // Eixos de origem
        const axLen = Math.min(80, chapaW * 0.06);
        const mkAx = (a, b, col) => {
            const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
            return new THREE.Line(g, new THREE.LineBasicMaterial({ color: col }));
        };
        stockGroup.add(mkAx([0,0,0],[axLen,0,0.5], 0xef4444));
        stockGroup.add(mkAx([0,0,0],[0,axLen,0.5], 0x22c55e));
        stockGroup.add(mkAx([0,0,0],[0,0,axLen  ], 0x3b82f6));

        // Grid
        const gridSize = Math.max(chapaW, chapaH) * 1.6;
        const grid = new THREE.GridHelper(gridSize, 10, 0x1a2540, 0x1a2540);
        grid.rotation.x = Math.PI / 2; grid.position.set(cx, cy, -thick - 2);
        gridGroup.add(grid); gridGroup.visible = false;

        // Segmentos de toolpath
        const el    = containerRef.current;
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
                const g = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(m.x1, m.y1, m.z1),
                    new THREE.Vector3(m.x2, m.y2, m.z2),
                ]);
                g.computeBoundingSphere();
                line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: pendColor, transparent: true, opacity: 0, dashSize: 10, gapSize: 7 }));
                line.computeLineDistances();
            } else {
                const geom = new LineGeometry();
                geom.setPositions([m.x1, m.y1, m.z1, m.x2, m.y2, m.z2]);
                const mat = new LineMaterial({ color: pendColor, linewidth: isCut ? 1.8 : 1.2, transparent: true, opacity: initOpa, resolution: vpRes.clone() });
                line = new Line2(geom, mat);
                tc.lineMats.push(mat);
            }
            pathGroup.add(line);
            tc.segments.push({ line, isRapid, isCut, pendColor, execColor, done: false });
        }

        // Câmera inicial
        controls.minDistance = span * 0.12;
        controls.maxDistance = span * 8;
        controls.target.set(cx, cy, 0);
        camera.position.set(cx + span * 0.7, cy - span * 0.9, span * 0.75);
        camera.up.set(0, 0, 1); camera.lookAt(cx, cy, 0); controls.update();

        // Renderiza estado inicial (move -1 = nada executado)
        renderAtMoveRef.current?.(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parsed, chapaStable]);

    // ── Sync props → refs ─────────────────────────────────────────────────────
    useEffect(() => { playingRef.current = playingProp || false; }, [playingProp]);

    // ── View mode → atualiza opacidade dos segmentos pendentes ───────────────
    useEffect(() => {
        viewModeRef.current = viewMode;
        const opa = viewMode === 'full' ? 0.55 : 0.12;
        for (const seg of three.current.segments) {
            if (!seg.done && !seg.isRapid) { seg.line.material.opacity = opa; seg.line.material.needsUpdate = true; }
        }
    }, [viewMode]);

    // ── Rapid visibility ──────────────────────────────────────────────────────
    useEffect(() => {
        showRapidsRef.current = showRapids;
        for (const seg of three.current.segments) {
            if (seg.isRapid) { seg.line.material.opacity = seg.done ? 0.4 : (showRapids ? 0.25 : 0); seg.line.material.needsUpdate = true; }
        }
    }, [showRapids]);

    // ── API imperativa ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset: () => {
            playingRef.current = false;
            curMoveRef.current = -1;
            accRef.current     = 0;
            lastCutIdx.current = -1;
            renderAtMoveRef.current?.(-1);
        },
        seekTo: (idx) => {
            const i = Math.max(-1, Math.min(moves.length - 1, idx));
            curMoveRef.current = i;
            accRef.current     = 0;
            renderAtMoveRef.current?.(i);
        },
        seekToTime: (t) => {
            // Converte tempo → índice de move (busca linear forward)
            if (!moves.length) return;
            let i = 0;
            while (i < moves.length - 1 && t > moves[i].tEnd) i++;
            curMoveRef.current = i;
            accRef.current     = 0;
            renderAtMoveRef.current?.(i);
        },
        getTotalMoves:  () => moves.length,
        getCurMove:     () => curMoveRef.current,
        getCurrentTime: () => curMoveRef.current >= 0 ? (moves[curMoveRef.current]?.tEnd ?? 0) : 0,
        getTotalTime:   () => totalTime,
    }), [moves, totalTime]);

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
        cam.up.set(0, 0, 1); cam.lookAt(ctrl.target.x, ctrl.target.y, ctrl.target.z); ctrl.update();
        setActiveView(name);
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    const mono = '"JetBrains Mono","Fira Code",Consolas,monospace';
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0c1018' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

            {/* HUD — posição da ferramenta */}
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
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 6 }}>
                        <div style={{ fontSize: 9, color: '#546270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Feed</div>
                        <div style={{ fontSize: 11, color: '#79c0ff', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(toolPos.f)} <span style={{ fontSize: 9, color: '#546270' }}>mm/min</span>
                        </div>
                    </div>
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

            {/* Controles — câmera e opções */}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                <button onClick={() => setShowRapids(p => !p)} style={{
                    padding: '5px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                    borderRadius: 5, border: showRapids ? '1px solid #e44444' : '1px solid rgba(255,255,255,0.12)',
                    background: showRapids ? 'rgba(228,68,68,0.18)' : 'rgba(10,15,25,0.85)',
                    color: showRapids ? '#e44444' : '#7890a8', fontFamily: mono, whiteSpace: 'nowrap',
                }}>G0 Rápido</button>
                <button onClick={() => setViewMode(p => p === 'full' ? 'cutting' : 'full')} style={{
                    padding: '5px 8px', fontSize: 9, fontWeight: 700, cursor: 'pointer',
                    borderRadius: 5, border: viewMode === 'full' ? '1px solid #4d8cf6' : '1px solid rgba(255,255,255,0.12)',
                    background: viewMode === 'full' ? 'rgba(77,140,246,0.18)' : 'rgba(10,15,25,0.85)',
                    color: viewMode === 'full' ? '#79c0ff' : '#7890a8', fontFamily: mono, whiteSpace: 'nowrap',
                }}>Trajetória</button>
            </div>

            {/* Empty state */}
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
