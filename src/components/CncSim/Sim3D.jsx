// CncSim/Sim3D.jsx — v6, reescrito no estilo do simulador de referência.
// Câmera-órbita própria (sem OrbitControls), THREE.Line simples (sem Line2),
// playback por tempo. Estado todo em $.current; zero closures no RAF loop.
// Drop-in: mesmas props { parsed, chapa, playing, speed, onMoveChange, onPlayEnd }
// e mesma API de ref { reset, seekTo, seekToTime, getTotalMoves, getCurMove,
// getTotalTime, getCurrentTime }.

import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import * as THREE from 'three';
import { getOpCat } from './parseGcode.js';

const BG       = 0x0d1117;
const MDF_TOP  = 0xc2a46a;
const MDF_SIDE = 0x8b6030;
const PIECE_PALETTE = [0x4a90d9, 0x50b888, 0xe0a13c, 0xc56bd6, 0xe07a5f, 0x5bc0be, 0xd98cb3, 0x8a8fd0, 0x6ab04c, 0xeb8f34];

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

export const Sim3D = forwardRef(function Sim3D(
    { parsed, chapa, playing, speed, onMoveChange, onPlayEnd },
    ref
) {
    const mountRef = useRef(null);

    // Chapa estável por valor (evita rebuild espúrio)
    const chapaKey = `${chapa?.comprimento}|${chapa?.largura}|${chapa?.espessura}|${chapa?.refilo}`;

    const $ = useRef({
        renderer: null, scene: null, camera: null,
        stockGroup: null, pathGroup: null, toolGroup: null,
        orbit: null,
        segments: [],          // { line, mat, isRapid, baseColor, doneColor, done }
        moves: [],
        totalTime: 0,
        curMove: -1, simTime: 0, lastTick: 0,
        lastReported: -2,
        playing: false, speed: 1,
        onMoveChange: null, onPlayEnd: null,
        renderAt: null, setHud: null, setActiveView: null,
        needsRender: true,
        rafId: null,
        bbox: null,
    });
    const s = $.current;
    s.playing      = playing || false;
    s.speed        = speed   || 1;
    s.onMoveChange = onMoveChange;
    s.onPlayEnd    = onPlayEnd;

    const [hud, setHud] = useState({ x: 0, y: 0, z: 0, f: 0, t: 0 });
    const [activeView, setActiveView] = useState('iso');
    s.setHud = setHud;
    s.setActiveView = setActiveView;

    // ── Setup (UMA VEZ) ───────────────────────────────────────────────────────
    useEffect(() => {
        const el = mountRef.current;
        if (!el) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(BG);
        renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
        el.appendChild(renderer.domElement);

        const scene  = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400000);
        camera.up.set(0, 0, 1);

        scene.add(new THREE.HemisphereLight(0xaec4dc, 0x14181f, 0.75));
        scene.add(new THREE.AmbientLight(0x404a58, 0.5));
        const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
        sun.position.set(800, 600, 2000); scene.add(sun);

        // ── Câmera-órbita própria (Z-up) ──────────────────────────────────────
        const orbit = {
            target: new THREE.Vector3(0, 0, 0),
            distance: 3000,
            theta: -Math.PI / 3,
            phi: Math.PI / 3.5,
            apply() {
                const { target: t, distance: d, phi, theta } = this;
                camera.position.set(
                    t.x + d * Math.sin(phi) * Math.cos(theta),
                    t.y + d * Math.sin(phi) * Math.sin(theta),
                    t.z + d * Math.cos(phi),
                );
                camera.up.set(0, 0, 1);
                camera.lookAt(t);
                s.needsRender = true;
            },
            setView(name) {
                if (name === 'top')        { this.theta = -Math.PI / 2; this.phi = 0.0001; }
                else if (name === 'front') { this.theta = -Math.PI / 2; this.phi = Math.PI / 2; }
                else if (name === 'side')  { this.theta = 0;            this.phi = Math.PI / 2; }
                else                       { this.theta = -Math.PI / 3; this.phi = Math.PI / 3.5; }
                this.apply();
                s.setActiveView?.(name);
            },
        };
        s.orbit = orbit;

        // ── Interação mouse (rotacionar / pan / zoom) ─────────────────────────
        let dragging = false, panning = false, lastX = 0, lastY = 0;
        const onDown = (e) => { dragging = true; panning = e.button === 2 || e.shiftKey; lastX = e.clientX; lastY = e.clientY; e.preventDefault(); };
        const onMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            if (panning) {
                const scale = orbit.distance * 0.0015;
                const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
                const right = dir.clone().cross(camera.up).normalize();
                const up = camera.up.clone();
                orbit.target.addScaledVector(right, -dx * scale);
                orbit.target.addScaledVector(up, dy * scale);
            } else {
                orbit.theta -= dx * 0.005;
                orbit.phi = Math.max(0.02, Math.min(Math.PI - 0.02, orbit.phi - dy * 0.005));
            }
            orbit.apply();
        };
        const onUp = () => { dragging = false; panning = false; };
        const onWheel = (e) => {
            e.preventDefault();
            orbit.distance = Math.max(50, Math.min(360000, orbit.distance * (e.deltaY > 0 ? 1.1 : 0.9)));
            orbit.apply();
        };
        const onCtx = (e) => e.preventDefault();
        const onDbl = () => { if (s.bbox) { orbit.target.set(s.bbox.cx, s.bbox.cy, 0); orbit.distance = s.bbox.span * 1.5; orbit.apply(); } };
        renderer.domElement.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
        renderer.domElement.addEventListener('contextmenu', onCtx);
        renderer.domElement.addEventListener('dblclick', onDbl);

        // Grupos
        const stockGroup = new THREE.Group();
        const pathGroup  = new THREE.Group();
        const toolGroup  = new THREE.Group();
        scene.add(stockGroup, pathGroup, toolGroup);

        // Ferramenta (fresa/broca) — escala ao diâmetro atual em runtime
        const shankMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 0.85, roughness: 0.15 });
        const tipMat   = new THREE.MeshStandardMaterial({ color: 0xf78166, emissive: 0xb03a1a, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.4 });
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 24), shankMat);
        shank.rotation.x = Math.PI / 2; shank.position.z = 33;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 24), tipMat);
        tip.rotation.x = -Math.PI / 2; tip.position.z = -1;
        toolGroup.add(shank, tip);
        toolGroup.visible = false;

        Object.assign(s, { renderer, scene, camera, stockGroup, pathGroup, toolGroup });

        // Resize (debounced)
        let resizeT = null;
        const ro = new ResizeObserver(() => {
            if (resizeT) return;
            resizeT = setTimeout(() => {
                resizeT = null;
                const w = el.clientWidth, h = el.clientHeight;
                if (!w || !h) return;
                renderer.setSize(w, h, false);
                camera.aspect = w / h; camera.updateProjectionMatrix();
                s.needsRender = true;
            }, 100);
        });
        ro.observe(el);

        // ── renderAt: atualiza cores executado/pendente + ferramenta + HUD ────
        function renderAt(idx) {
            const mvs = s.moves;
            const clamped = mvs.length === 0 ? -1 : Math.max(-1, Math.min(mvs.length - 1, idx));

            for (let i = 0; i < s.segments.length; i++) {
                const seg = s.segments[i];
                const done = clamped >= 0 && i <= clamped;
                if (seg.done !== done) {
                    seg.done = done;
                    seg.mat.color.setHex(done ? seg.doneColor : seg.baseColor);
                    seg.mat.opacity = seg.isRapid ? (done ? 0.18 : 0.4) : (done ? 1.0 : 0.4);
                }
            }
            // segmento atual em destaque branco
            if (clamped >= 0 && s.segments[clamped]) {
                s.segments[clamped].mat.color.setHex(0xffffff);
                s.segments[clamped].mat.opacity = 1.0;
                s.segments[clamped].done = null; // força refresh no próximo passo
            }

            // posição da ferramenta
            const m = clamped >= 0 ? mvs[clamped] : null;
            if (m) {
                s.toolGroup.visible = true;
                s.toolGroup.position.set(m.x2, m.y2, Math.max(m.z2, 0.5));
                // escala ao diâmetro real da operação (se conhecido)
                const d = m.toolDiam || 6;
                const sc = Math.max(0.4, d / 6);
                s.toolGroup.scale.set(sc, sc, 1);
            } else {
                s.toolGroup.visible = false;
            }

            // HUD (throttled)
            const now2 = s.lastTick || 0;
            if (!s.lastHud || now2 - s.lastHud > 60 || !s.playing) {
                s.lastHud = now2;
                s.setHud?.({ x: m?.x2 ?? 0, y: m?.y2 ?? 0, z: m?.z2 ?? 0, f: m?.feed ?? 0, t: m?.tEnd ?? 0 });
            }

            // reporta ao pai
            if (clamped !== s.lastReported) {
                s.lastReported = clamped;
                s.onMoveChange?.(clamped, m?.lineIdx ?? -1, m?.tEnd ?? 0);
            }
            s.needsRender = true;
        }
        s.renderAt = renderAt;

        // ── RAF loop ──────────────────────────────────────────────────────────
        function tick(now) {
            s.rafId = requestAnimationFrame(tick);
            if (s.playing && s.moves.length > 0) {
                const dt = Math.min(now - s.lastTick, 200);
                s.simTime += dt * s.speed / 1000;
                let moved = false;
                while (s.curMove < s.moves.length - 1 &&
                       (s.moves[s.curMove + 1]?.tStart ?? Infinity) <= s.simTime) {
                    s.curMove++; moved = true;
                }
                if (moved) renderAt(s.curMove);
                if (s.simTime >= s.totalTime && s.totalTime > 0) {
                    s.simTime = s.totalTime; s.playing = false; s.onPlayEnd?.();
                }
            }
            s.lastTick = now;
            if (s.playing || s.needsRender) {
                s.needsRender = false;
                renderer.render(scene, camera);
            }
        }
        s.lastTick = performance.now();
        s.rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(s.rafId);
            ro.disconnect();
            renderer.domElement.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            renderer.domElement.removeEventListener('wheel', onWheel);
            renderer.domElement.removeEventListener('contextmenu', onCtx);
            renderer.domElement.removeEventListener('dblclick', onDbl);
            clearGroup(stockGroup); clearGroup(pathGroup); clearGroup(toolGroup);
            renderer.dispose();
            if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Construção da geometria (quando muda parsed/chapa) ────────────────────
    useEffect(() => {
        if (!s.scene) return;
        const moves = parsed?.moves ?? [];
        s.moves = moves;
        s.totalTime = parsed?.totalTime ?? 0;
        s.curMove = -1; s.simTime = 0; s.lastReported = -2;
        s.segments = [];
        clearGroup(s.stockGroup); clearGroup(s.pathGroup);

        const cW = chapa?.comprimento ?? 2750;
        const cH = chapa?.largura     ?? 1850;
        const thick = chapa?.espessura ?? 18;
        const cx = cW / 2, cy = cH / 2;
        const span = Math.max(cW, cH) * 1.4;
        s.bbox = { cx, cy, span };

        // ── Chapa (corpo) ─────────────────────────────────────────────────────
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(cW, cH, thick),
            new THREE.MeshStandardMaterial({ color: MDF_TOP, roughness: 0.85, metalness: 0 })
        );
        body.position.set(cx, cy, -thick / 2);
        s.stockGroup.add(body);
        const sideEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(body.geometry),
            new THREE.LineBasicMaterial({ color: MDF_SIDE })
        );
        sideEdges.position.copy(body.position);
        s.stockGroup.add(sideEdges);

        // ── Mesa de vácuo + grade ─────────────────────────────────────────────
        const bedMargin = Math.max(cW, cH) * 0.15;
        const bed = new THREE.Mesh(
            new THREE.PlaneGeometry(cW + bedMargin * 2, cH + bedMargin * 2),
            new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.95 })
        );
        bed.position.set(cx, cy, -thick - 6);
        s.stockGroup.add(bed);
        const grid = new THREE.GridHelper(Math.max(cW, cH) * 1.3, Math.round(Math.max(cW, cH) / 250), 0x2e3a47, 0x222a33);
        grid.rotation.x = Math.PI / 2;
        grid.position.set(cx, cy, -thick - 5.5);
        s.stockGroup.add(grid);

        // ── Peças nestadas como painéis coloridos (item 1) ───────────────────
        const pcs = chapa?.pecas ?? [];
        const kerf2 = (chapa?.kerf ?? 4) / 2;
        pcs.forEach((p, i) => {
            if (!(p.w > 0 && p.h > 0)) return;
            const col = PIECE_PALETTE[i % PIECE_PALETTE.length];
            const w2 = Math.max(2, p.w - kerf2), h2 = Math.max(2, p.h - kerf2);
            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(w2, h2, 2),
                new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, transparent: true, opacity: 0.4 })
            );
            panel.position.set(p.x + p.w / 2, p.y + p.h / 2, 1.4);
            s.stockGroup.add(panel);
            const ol = new THREE.LineSegments(
                new THREE.EdgesGeometry(panel.geometry),
                new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.8 })
            );
            ol.position.copy(panel.position);
            s.stockGroup.add(ol);
        });

        // ── Sobras/retalhos (contorno verde tracejado) ───────────────────────
        (chapa?.retalhos ?? []).forEach(r => {
            if (!(r.w > 20 && r.h > 20)) return;
            const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y]]
                .map(([x, y]) => new THREE.Vector3(x, y, 0.6));
            const ln = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineDashedMaterial({ color: 0x3fb950, dashSize: 30, gapSize: 18, transparent: true, opacity: 0.7 })
            );
            ln.computeLineDistances();
            s.stockGroup.add(ln);
        });

        // ── Eixos ─────────────────────────────────────────────────────────────
        const ax = Math.min(120, cW * 0.08);
        [[ax, 0, 0, 0xff5555], [0, ax, 0, 0x55ff55], [0, 0, ax, 0x5599ff]].forEach(([x, y, z, c]) =>
            s.stockGroup.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z)]),
                new THREE.LineBasicMaterial({ color: c })
            ))
        );

        // ── Toolpath (uma THREE.Line por move — leve) ─────────────────────────
        for (const m of moves) {
            const isRapid  = m.type === 'G0';
            const isCut    = !isRapid && Math.min(m.z1, m.z2) <= 0;
            let base, done;
            if (isRapid)    { base = 0xf0883e; done = 0xffaa55; }
            else if (isCut) { const c = getOpCat(m.op); base = parseInt(c.color.replace('#', ''), 16); done = 0x79c0ff; }
            else            { base = 0x56d364; done = 0x7ee787; }

            const geom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(m.x1, m.y1, m.z1),
                new THREE.Vector3(m.x2, m.y2, m.z2),
            ]);
            const mat = isRapid
                ? new THREE.LineDashedMaterial({ color: base, dashSize: 14, gapSize: 9, transparent: true, opacity: 0.4 })
                : new THREE.LineBasicMaterial({ color: base, transparent: true, opacity: 0.4 });
            const line = new THREE.Line(geom, mat);
            if (isRapid) line.computeLineDistances();
            s.pathGroup.add(line);
            s.segments.push({ line, mat, isRapid, baseColor: base, doneColor: done, done: false });
        }

        // ── Câmera inicial ────────────────────────────────────────────────────
        s.orbit.target.set(cx, cy, 0);
        s.orbit.distance = span * 1.5;
        s.orbit.apply();
        s.renderAt?.(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chapaKey, parsed]);

    // ── API imperativa ────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
        reset: () => { s.curMove = -1; s.simTime = 0; s.renderAt?.(-1); },
        seekTo: (idx) => {
            const i = Math.max(-1, Math.min(s.moves.length - 1, idx));
            s.curMove = i; s.simTime = i >= 0 ? (s.moves[i]?.tStart ?? 0) : 0; s.renderAt?.(i);
        },
        seekToTime: (t) => {
            if (!s.moves.length) return;
            let i = 0; while (i < s.moves.length - 1 && t > s.moves[i].tEnd) i++;
            s.curMove = i; s.simTime = t; s.renderAt?.(i);
        },
        getTotalMoves:  () => s.moves.length,
        getCurMove:     () => s.curMove,
        getTotalTime:   () => s.totalTime,
        getCurrentTime: () => s.curMove >= 0 ? (s.moves[s.curMove]?.tEnd ?? 0) : 0,
    }));

    // ── Render ──────────────────────────────────────────────────────────────
    const mono = '"JetBrains Mono",monospace';
    const panel = {
        position: 'absolute', pointerEvents: 'none',
        background: 'rgba(22,27,34,0.85)', backdropFilter: 'blur(8px)',
        border: '1px solid #30363d', borderRadius: 6, fontFamily: mono,
    };
    const VIEWS = [['iso', 'ISO'], ['top', 'TOPO'], ['front', 'FRENTE'], ['side', 'LADO']];

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d1117' }}>
            <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

            {/* Posição da ferramenta */}
            <div style={{ ...panel, top: 10, left: 10, padding: '8px 12px' }}>
                {[['X', hud.x, '#ff5555'], ['Y', hud.y, '#55ff55'], ['Z', hud.z, '#5599ff'], ['F', hud.f, '#8b949e']].map(([a, v, c]) => (
                    <div key={a} style={{ display: 'flex', gap: 10, lineHeight: 1.7 }}>
                        <span style={{ color: c, fontWeight: 700, minWidth: 12, fontSize: 10 }}>{a}</span>
                        <span style={{ color: '#79c0ff', minWidth: 70, textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                            {a === 'F' ? Math.round(v) : v.toFixed(2)}
                        </span>
                    </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 5, paddingTop: 5, fontSize: 10, color: '#79c0ff' }}>
                    {fmtTime(hud.t)}
                </div>
            </div>

            {/* Presets de câmera */}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {VIEWS.map(([id, label]) => (
                    <button key={id} onClick={() => s.orbit?.setView(id)}
                        style={{
                            background: activeView === id ? '#1f6feb' : 'rgba(22,27,34,0.85)',
                            backdropFilter: 'blur(8px)', color: '#e6edf3',
                            border: `1px solid ${activeView === id ? '#58a6ff' : '#30363d'}`,
                            borderRadius: 6, padding: '5px 10px', fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', fontFamily: mono,
                        }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Dica */}
            <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 9, color: '#3d4852', fontFamily: mono, pointerEvents: 'none' }}>
                arrastar: girar · shift/direito: mover · scroll: zoom · 2× clique: ajustar
            </div>
        </div>
    );
});

export default Sim3D;
