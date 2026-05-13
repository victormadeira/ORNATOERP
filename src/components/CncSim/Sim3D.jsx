// CncSim/Sim3D.jsx — v5, reescrita do zero
// Princípio: ZERO closures no RAF loop. Todo estado em $.current.
// Animação por índice de move: +1 a cada (60/speed) ms.
// $.current.playing = playing durante render → RAF lê o valor correto sempre.

import {
    useEffect, useRef, useMemo, forwardRef, useImperativeHandle, useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 }        from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { getOpCat, getToolDiameter } from './parseGcode.js';

// ── Constantes ────────────────────────────────────────────────────────────────
const BG       = 0x0c1018;
const MDF_TOP  = '#c2a46a';
const MDF_SIDE = 0x8b6030;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(s) {
    if (!s || s <= 0) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

function clearGroup(g) {
    while (g.children.length) {
        const c = g.children[0]; g.remove(c);
        c.geometry?.dispose();
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material?.dispose();
    }
}

function makeMdfCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = MDF_TOP; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
        const y  = Math.random() * h;
        const ht = 1 + Math.random() * 3;
        const a  = 0.04 + Math.random() * 0.07;
        ctx.fillStyle = Math.random() > 0.5
            ? `rgba(255,235,180,${a})`
            : `rgba(140,90,30,${a})`;
        ctx.fillRect(0, y, w, ht);
    }
    return c;
}

function paintMdfMove(ctx, m, cW, cH, texW, texH, toolDiam) {
    if (m.type === 'G0') return false;
    const depth = Math.max(0, -Math.min(m.z1, m.z2));
    if (depth < 0.02) return false;
    const scX = texW / cW, scY = texH / cH;
    const lw  = Math.max(2, toolDiam * Math.min(scX, scY));
    const ratio = Math.min(1, depth / 18);
    const light = Math.round(55 - ratio * 35);
    ctx.strokeStyle = `hsl(22, 38%, ${light}%)`;
    ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x1 * scX, texH - m.y1 * scY);
    ctx.lineTo(m.x2 * scX, texH - m.y2 * scY);
    ctx.stroke();
    return true;
}

// ── Componente ────────────────────────────────────────────────────────────────
export const Sim3D = forwardRef(function Sim3D(
    { parsed, chapa, playing, speed, onPlayEnd, onMoveChange },
    ref
) {
    const mountRef = useRef(null);

    // ── ÚNICO objeto de estado — o RAF loop lê daqui diretamente ─────────────
    const $ = useRef({
        renderer: null, scene: null, camera: null, controls: null,
        stockGroup: null, pathGroup: null, toolGroup: null,
        segments: [], lineMats: [],
        matCtx: null, matTexture: null, matDims: { texW: 0, texH: 0 },
        chapaW: 2750, chapaH: 1850,
        toolDiamByMove: [],
        bbox: null, rafId: null,
        // Animação
        playing: false, speed: 1,
        curMove: -1, simTime: 0, lastTick: 0,
        lastPainted: -1, lastReported: -1, lastHudTs: 0, lastMdfTs: 0,
        // Dados (sync durante render)
        moves: [], totalTime: 0,
        // Callbacks (sync durante render)
        onPlayEnd: null, onMoveChange: null,
        // Funções (set no setup effect)
        renderAt: null, updateHud: null,
    });

    // ── Sync props → $.current DURANTE O RENDER (seguro — ref não causa re-render) ──
    const s = $.current;
    s.playing      = playing || false;
    s.speed        = speed   || 1;
    s.moves        = parsed?.moves    ?? [];
    s.totalTime    = parsed?.totalTime ?? 0;
    s.onPlayEnd    = onPlayEnd;
    s.onMoveChange = onMoveChange;

    // ── Memoiza chapa por valores (não por referência) ────────────────────────
    const chapaKey = `${chapa?.comprimento}|${chapa?.largura}|${chapa?.espessura}|${chapa?.refilo}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const chapaStable = useMemo(() => chapa, [chapaKey]);

    // ── HUD (React state, throttled, só pra display) ──────────────────────────
    const [hud, setHud]           = useState({ x: 0, y: 0, z: 0, f: 0, t: 0 });
    const [activeView, setActiveView] = useState('iso');
    s.updateHud = setHud; // RAF chama sem closure

    // ── Setup Three.js (UMA VEZ) ──────────────────────────────────────────────
    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(BG);
        renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
        el.appendChild(renderer.domElement);

        // Scene / Camera
        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200000);
        camera.up.set(0, 0, 1);
        scene.add(new THREE.AmbientLight(0x203040, 0.9));
        const sun = new THREE.DirectionalLight(0xfff8f0, 1.2);
        sun.position.set(800, 600, 2000); scene.add(sun);
        const fill = new THREE.DirectionalLight(0x4080c0, 0.35);
        fill.position.set(-600, -800, 400); scene.add(fill);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping   = true;
        controls.dampingFactor   = 0.07;
        controls.screenSpacePanning = true;
        controls.minDistance     = 10;
        controls.maxDistance     = 300000;
        controls.zoomToCursor    = true;

        // Groups
        const stockGroup = new THREE.Group();
        const pathGroup  = new THREE.Group();
        const toolGroup  = new THREE.Group();
        scene.add(stockGroup, pathGroup, toolGroup);

        // Tool mesh
        const shankMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 0.9, roughness: 0.08 });
        const tipMat   = new THREE.MeshStandardMaterial({ color: 0xffd060, metalness: 0.95, roughness: 0.05, emissive: 0xd08000, emissiveIntensity: 1.8 });
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 60, 16), shankMat);
        shank.rotation.x = Math.PI / 2; shank.position.z = 32;
        const tip   = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 16), tipMat);
        tip.rotation.x = -Math.PI / 2;  tip.position.z = -5;
        toolGroup.add(shank, tip);
        toolGroup.visible = false;

        Object.assign(s, { renderer, scene, camera, controls, stockGroup, pathGroup, toolGroup, segments: [], lineMats: [] });

        // Resize observer
        const ro = new ResizeObserver(() => {
            const w = el.clientWidth, h = el.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h; camera.updateProjectionMatrix();
            const res = new THREE.Vector2(w, h);
            for (const mat of s.lineMats) mat.resolution.copy(res);
        });
        ro.observe(el);

        // Double-click → fit
        renderer.domElement.addEventListener('dblclick', () => {
            const { bbox } = s;
            if (!bbox) return;
            controls.target.set(bbox.cx, bbox.cy, 0);
            camera.position.set(bbox.cx + bbox.span * 0.7, bbox.cy - bbox.span * 0.9, bbox.span * 0.75);
            camera.up.set(0, 0, 1); camera.lookAt(bbox.cx, bbox.cy, 0); controls.update();
        });

        // ── renderAt: lê tudo de s, sem closures ─────────────────────────────
        function renderAt(idx) {
            const mvs = s.moves;
            if (!s.renderer) return;
            const clamped = mvs.length === 0 ? -1 : Math.max(-1, Math.min(mvs.length - 1, idx));

            // Cores dos segmentos
            for (let i = 0; i < s.segments.length; i++) {
                const seg  = s.segments[i];
                const done = clamped >= 0 && i <= clamped;
                if (seg.done !== done) {
                    seg.mat.color.setHex(done ? seg.execColor : seg.pendColor);
                    seg.mat.opacity = done
                        ? (seg.isRapid ? 0.45 : 0.9)
                        : (seg.isRapid ? 0    : 0.35);
                    seg.mat.needsUpdate = true;
                    seg.done = done;
                }
            }

            // Ferramenta: oculta em G0 (posicionamento rápido)
            if (clamped >= 0) {
                const m = mvs[clamped];
                s.toolGroup.visible = m.type !== 'G0';
                s.toolGroup.position.set(m.x2, m.y2, m.z2);
            } else {
                s.toolGroup.visible = false;
            }

            // MDF canvas (incremental ou full rebuild)
            const now = performance.now();
            if (!s.playing || now - s.lastMdfTs > 50) {
                if (s.matCtx && s.matTexture && s.matDims.texW > 0) {
                    const { texW, texH } = s.matDims;
                    if (clamped < s.lastPainted) {
                        // Seek para trás: rebuild total
                        s.matCtx.clearRect(0, 0, texW, texH);
                        s.matCtx.fillStyle = MDF_TOP; s.matCtx.fillRect(0, 0, texW, texH);
                        for (let i = 0; i <= clamped; i++) {
                            const diam = s.toolDiamByMove[i] ?? 6;
                            paintMdfMove(s.matCtx, mvs[i], s.chapaW, s.chapaH, texW, texH, diam);
                        }
                        s.lastPainted = clamped;
                        s.matTexture.needsUpdate = true;
                        s.lastMdfTs = now;
                    } else if (clamped > s.lastPainted) {
                        // Incremental
                        for (let i = s.lastPainted + 1; i <= clamped; i++) {
                            const diam = s.toolDiamByMove[i] ?? 6;
                            paintMdfMove(s.matCtx, mvs[i], s.chapaW, s.chapaH, texW, texH, diam);
                        }
                        s.lastPainted = clamped;
                        s.matTexture.needsUpdate = true;
                        s.lastMdfTs = now;
                    }
                }
            }

            // Notifica parent apenas quando muda
            if (clamped !== s.lastReported) {
                s.lastReported = clamped;
                const m = clamped >= 0 ? mvs[clamped] : null;
                s.onMoveChange?.(clamped, m?.lineIdx ?? -1, m?.tEnd ?? 0);
            }

            // HUD throttled a 20fps
            if (now - s.lastHudTs > 50 || !s.playing) {
                s.lastHudTs = now;
                const m = clamped >= 0 ? mvs[clamped] : null;
                s.updateHud?.({
                    x: m?.x2 ?? 0, y: m?.y2 ?? 0, z: m?.z2 ?? 0,
                    f: m?.feed ?? 0, t: m?.tEnd ?? 0,
                });
            }
        }
        s.renderAt = renderAt;

        // ── RAF loop — animação baseada em tempo G-code ─────────────────────
        // speed=1 → tempo real, speed=10 → 10× mais rápido, etc.
        function tick(now) {
            s.rafId = requestAnimationFrame(tick);

            if (s.playing && s.moves.length > 0) {
                const dt        = Math.min(now - s.lastTick, 200); // ms, cap anti-salto
                s.simTime      += dt * s.speed / 1000;             // avança tempo G-code (s)
                const totalTime = s.moves[s.moves.length - 1]?.tEnd ?? 0;

                // Avança curMove até simTime atual
                let moved = false;
                while (s.curMove < s.moves.length - 1 &&
                       (s.moves[s.curMove + 1]?.tStart ?? Infinity) <= s.simTime) {
                    s.curMove++;
                    moved = true;
                }

                if (moved) renderAt(s.curMove);

                if (s.simTime >= totalTime && totalTime > 0) {
                    s.simTime = totalTime;
                    s.playing = false;
                    s.onPlayEnd?.();
                }
            }

            s.lastTick = now;
            controls.update();
            renderer.render(scene, camera);
        }
        s.lastTick = performance.now();
        s.rafId    = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(s.rafId);
            ro.disconnect();
            controls.dispose();
            renderer.dispose();
            if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Rebuild de cena — só quando parsed ou chapaStable mudam ─────────────
    useEffect(() => {
        if (!s.renderer) return;

        clearGroup(s.stockGroup);
        clearGroup(s.pathGroup);
        s.segments     = []; s.lineMats = [];
        s.curMove      = -1; s.simTime  = 0;
        s.lastPainted  = -1; s.lastReported = -1;
        s.toolDiamByMove = [];

        const moves = s.moves;
        if (!moves.length) { s.renderAt?.(-1); return; }

        const cW    = chapaStable?.comprimento ?? 2750;
        const cH    = chapaStable?.largura     ?? 1850;
        const thick = chapaStable?.espessura   ?? 18;
        s.chapaW = cW; s.chapaH = cH;

        // Bounding box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const m of moves) {
            minX = Math.min(minX, m.x1, m.x2); maxX = Math.max(maxX, m.x1, m.x2);
            minY = Math.min(minY, m.y1, m.y2); maxY = Math.max(maxY, m.y1, m.y2);
        }
        const cx   = cW / 2, cy = cH / 2;
        const span = Math.max(cW, cH, maxX - minX, maxY - minY) * 1.4;
        s.bbox = { cx, cy, cz: -thick / 2, span };

        // Pré-computa diâmetro por move
        const evts = parsed?.events ?? [];
        let curDiam = 6;
        for (let i = 0; i < moves.length; i++) {
            for (const ev of evts) {
                if (ev.moveIdx === i && ev.type === 'tool') curDiam = getToolDiameter(ev.label);
            }
            s.toolDiamByMove[i] = curDiam;
        }

        // Canvas MDF
        const texW = 1024, texH = Math.max(64, Math.round(1024 * cH / cW));
        s.matDims = { texW, texH };
        const matCanvas  = makeMdfCanvas(texW, texH);
        const matCtx     = matCanvas.getContext('2d');
        const matTexture = new THREE.CanvasTexture(matCanvas);
        matTexture.generateMipmaps = true;
        matTexture.minFilter = THREE.LinearMipmapLinearFilter;
        matTexture.magFilter = THREE.LinearFilter;
        Object.assign(s, { matCtx, matTexture });

        // Chapa MDF — topo
        const topMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(cW, cH),
            new THREE.MeshStandardMaterial({ map: matTexture, roughness: 0.82, metalness: 0 })
        );
        topMesh.position.set(cx, cy, 0.2);
        s.stockGroup.add(topMesh);

        // Chapa MDF — corpo
        const sideMat = new THREE.MeshStandardMaterial({ color: MDF_SIDE, roughness: 0.92, metalness: 0 });
        const bodyGeom = new THREE.BoxGeometry(cW, cH, thick);
        const bodyMesh = new THREE.Mesh(bodyGeom, sideMat);
        bodyMesh.position.set(cx, cy, -thick / 2);
        s.stockGroup.add(bodyMesh);
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(bodyGeom),
            new THREE.LineBasicMaterial({ color: 0xc8a470, transparent: true, opacity: 0.4 })
        );
        edges.position.copy(bodyMesh.position);
        s.stockGroup.add(edges);

        // Refilo
        const r = chapaStable?.refilo ?? 10;
        if (r > 0) {
            const pts = [[r, r], [cW-r, r], [cW-r, cH-r], [r, cH-r], [r, r]]
                .map(([x, y]) => new THREE.Vector3(x, y, 0.5));
            s.stockGroup.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: 0x507090, transparent: true, opacity: 0.5 })
            ));
        }

        // Eixos
        const ax = Math.min(80, cW * 0.06);
        [[ax,0,0,0xef4444],[0,ax,0,0x22c55e],[0,0,ax,0x3b82f6]].forEach(([x,y,z,c]) =>
            s.stockGroup.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(x,y,z)]),
                new THREE.LineBasicMaterial({ color: c })
            ))
        );

        // Segmentos de toolpath
        const vpW   = s.renderer?.domElement.clientWidth  || 800;
        const vpH   = s.renderer?.domElement.clientHeight || 600;
        const vpRes = new THREE.Vector2(vpW, vpH);

        for (const m of moves) {
            const isRapid   = m.type === 'G0';
            const catColor  = getOpCat(m.op).color;
            const colorHex  = parseInt(catColor.replace('#', ''), 16);
            const pendColor = isRapid ? 0xe44444 : colorHex;
            const execColor = isRapid ? 0x996666 : colorHex;

            let line, mat;
            if (isRapid) {
                mat = new THREE.LineDashedMaterial({
                    color: pendColor, transparent: true, opacity: 0,
                    dashSize: 10, gapSize: 7,
                });
                line = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(m.x1, m.y1, m.z1),
                        new THREE.Vector3(m.x2, m.y2, m.z2),
                    ]),
                    mat
                );
                line.computeLineDistances();
            } else {
                const geom = new LineGeometry();
                geom.setPositions([m.x1, m.y1, m.z1, m.x2, m.y2, m.z2]);
                mat = new LineMaterial({
                    color: pendColor, linewidth: 1.8,
                    transparent: true, opacity: 0.35,
                    resolution: vpRes.clone(),
                });
                line = new Line2(geom, mat);
                s.lineMats.push(mat);
            }
            s.pathGroup.add(line);
            s.segments.push({ line, mat, isRapid, pendColor, execColor, done: false });
        }

        // Câmera inicial
        s.controls.minDistance = span * 0.12;
        s.controls.maxDistance = span * 8;
        s.controls.target.set(cx, cy, 0);
        s.camera.position.set(cx + span * 0.7, cy - span * 0.9, span * 0.75);
        s.camera.up.set(0, 0, 1); s.camera.lookAt(cx, cy, 0); s.controls.update();

        s.renderAt?.(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parsed, chapaStable]);

    // ── API imperativa ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset: () => {
            s.curMove = -1; s.simTime = 0; s.lastPainted = -1;
            s.renderAt?.(-1);
        },
        seekTo: (idx) => {
            const i = Math.max(-1, Math.min(s.moves.length - 1, idx));
            s.curMove = i;
            s.simTime = i >= 0 ? (s.moves[i]?.tStart ?? 0) : 0;
            s.renderAt?.(i);
        },
        seekToTime: (t) => {
            if (!s.moves.length) return;
            let i = 0;
            while (i < s.moves.length - 1 && t > s.moves[i].tEnd) i++;
            s.curMove = i; s.simTime = t; s.renderAt?.(i);
        },
        getTotalMoves:  () => s.moves.length,
        getCurMove:     () => s.curMove,
        getTotalTime:   () => s.totalTime,
        getCurrentTime: () => s.curMove >= 0 ? (s.moves[s.curMove]?.tEnd ?? 0) : 0,
    }));

    // ── Preset de câmera ──────────────────────────────────────────────────────
    const setView = (name) => {
        const { camera: cam, controls: ctrl, bbox } = s;
        if (!cam || !bbox) return;
        const { cx, cy, span } = bbox;
        const views = {
            top:   [cx, cy,          span * 1.4],
            front: [cx, cy - span * 1.3, span * 0.2],
            side:  [cx + span * 1.3, cy,  span * 0.2],
            iso:   [cx + span * 0.7, cy - span * 0.9, span * 0.75],
        };
        ctrl.target.set(cx, cy, 0);
        cam.position.set(...(views[name] ?? views.iso));
        cam.up.set(0, 0, 1); cam.lookAt(cx, cy, 0); ctrl.update();
        setActiveView(name);
    };

    // ── Render JSX ────────────────────────────────────────────────────────────
    const mono = '"JetBrains Mono",monospace';
    const hudPanel = {
        position: 'absolute', pointerEvents: 'none',
        background: 'rgba(10,15,25,0.90)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8,
        fontFamily: mono,
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0c1018' }}>
            <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

            {/* HUD — posição da ferramenta */}
            <div style={{ ...hudPanel, top: 10, left: 10, padding: '8px 12px', minWidth: 130 }}>
                <div style={{ fontSize: 9, color: '#546270', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Posição</div>
                {[['X', hud.x, '#ef4444'], ['Y', hud.y, '#22c55e'], ['Z', hud.z, '#3b82f6']].map(([a, v, c]) => (
                    <div key={a} style={{ display: 'flex', gap: 8, lineHeight: 1.75 }}>
                        <span style={{ color: c, fontWeight: 700, minWidth: 12, fontSize: 10 }}>{a}</span>
                        <span style={{ color: '#79c0ff', minWidth: 70, textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(2)}</span>
                    </div>
                ))}
                {hud.f > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 5, paddingTop: 5, fontSize: 10, color: '#79c0ff' }}>
                        F {Math.round(hud.f)} <span style={{ fontSize: 9, color: '#546270' }}>mm/min</span>
                    </div>
                )}
                {s.totalTime > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 5, paddingTop: 5, fontSize: 10, color: '#79c0ff', whiteSpace: 'nowrap' }}>
                        {fmtTime(hud.t)} / {fmtTime(s.totalTime)}
                    </div>
                )}
            </div>

            {/* Controles de câmera */}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                    {[['iso','ISO'],['top','TOPO'],['front','FRENTE'],['side','LADO']].map(([id, lb]) => (
                        <button key={id} onClick={() => setView(id)} style={{
                            padding: '5px 6px', fontSize: 9, fontWeight: 700, cursor: 'pointer', borderRadius: 5,
                            border:      activeView === id ? '1px solid #4d8cf6' : '1px solid rgba(255,255,255,0.12)',
                            background:  activeView === id ? 'rgba(77,140,246,0.25)' : 'rgba(10,15,25,0.85)',
                            color:       activeView === id ? '#79c0ff' : '#7890a8',
                            fontFamily: mono,
                        }}>{lb}</button>
                    ))}
                </div>
                <div style={{ fontSize: 9, color: '#3d4852', textAlign: 'center', fontFamily: mono }}>
                    2×clique: encaixar
                </div>
            </div>

            {/* Empty state */}
            {s.moves.length === 0 && (
                <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#546270', fontSize: 14, fontWeight: 600,
                }}>
                    Nenhum G-code carregado
                </div>
            )}
        </div>
    );
});

export default Sim3D;
