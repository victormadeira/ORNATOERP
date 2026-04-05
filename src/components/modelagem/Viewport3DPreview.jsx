import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Viewport3DPreview — mini 3D preview that extrudes a 2D silhouette in real-time.
 * Reuses the global WebGL renderer singleton from PecaViewer3D.
 */

let _renderer = null;
function getRenderer() {
    if (_renderer) return _renderer;
    try {
        const r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
        r.setPixelRatio(1);
        r.shadowMap.enabled = false;
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.domElement.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
        document.body.appendChild(r.domElement);
        _renderer = r;
        return r;
    } catch { return null; }
}

function commandsToPoints(commands, heightMm) {
    if (!commands?.length) return [];
    const pts = [];
    let cx = 0, cy = 0, startX = 0, startY = 0;
    for (const cmd of commands) {
        const c = (cmd.cmd || '').toUpperCase();
        if (c === 'M') { cx = cmd.x || 0; cy = cmd.y || 0; startX = cx; startY = cy; pts.push([cx, cy]); }
        else if (c === 'L') { cx = cmd.x || 0; cy = cmd.y || 0; pts.push([cx, cy]); }
        else if (c === 'C') {
            const x0 = cx, y0 = cy;
            for (let t = 0.05; t <= 1.001; t += 0.05) {
                const mt = 1 - t;
                const x = mt ** 3 * x0 + 3 * mt ** 2 * t * (cmd.x1 || 0) + 3 * mt * t ** 2 * (cmd.x2 || 0) + t ** 3 * (cmd.x || 0);
                const y = mt ** 3 * y0 + 3 * mt ** 2 * t * (cmd.y1 || 0) + 3 * mt * t ** 2 * (cmd.y2 || 0) + t ** 3 * (cmd.y || 0);
                pts.push([x, y]);
            }
            cx = cmd.x || 0; cy = cmd.y || 0;
        }
        else if (c === 'Q') {
            const x0 = cx, y0 = cy;
            for (let t = 0.05; t <= 1.001; t += 0.05) {
                const mt = 1 - t;
                const x = mt ** 2 * x0 + 2 * mt * t * (cmd.x1 || 0) + t ** 2 * (cmd.x || 0);
                const y = mt ** 2 * y0 + 2 * mt * t * (cmd.y1 || 0) + t ** 2 * (cmd.y || 0);
                pts.push([x, y]);
            }
            cx = cmd.x || 0; cy = cmd.y || 0;
        }
        else if (c === 'Z') { pts.push([startX, startY]); cx = startX; cy = startY; }
    }
    return pts;
}

export default function Viewport3DPreview({ commands, espessura = 18, materialCor = '#C4A672', width = 280, height = 220 }) {
    const canvasRef = useRef(null);
    const stateRef = useRef({ disposed: false, raf: null, ctrl: null, scene: null });
    const [ok, setOk] = useState(true);

    const build = useCallback(() => {
        const s = stateRef.current;
        // Cleanup previous
        s.disposed = true;
        if (s.raf) cancelAnimationFrame(s.raf);
        if (s.ctrl) { s.ctrl.dispose(); s.ctrl = null; }
        if (s.scene) {
            s.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.dispose()); } });
            s.scene = null;
        }
        s.disposed = false;

        const renderer = getRenderer();
        if (!renderer || !canvasRef.current) { setOk(false); return; }

        const pts = commandsToPoints(commands);
        if (pts.length < 3) { setOk(false); return; }
        setOk(true);

        // Normalize to scene units
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const bw = maxX - minX || 1, bh = maxY - minY || 1;
        const sc = 100 / Math.max(bw, bh, espessura * 4);
        const SX = bw * sc, SZ = bh * sc, SY = espessura * sc;

        // Create shape
        const shape = new THREE.Shape();
        const p0 = pts[0];
        shape.moveTo((p0[0] - minX) * sc, (p0[1] - minY) * sc);
        for (let i = 1; i < pts.length; i++) {
            shape.lineTo((pts[i][0] - minX) * sc, (pts[i][1] - minY) * sc);
        }
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, { depth: SY, bevelEnabled: false });
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(materialCor), roughness: 0.5, metalness: 0 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, 0, SZ);

        // Scene
        const scene = new THREE.Scene();
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = 2; bgCanvas.height = 128;
        const bgCtx = bgCanvas.getContext('2d');
        const bgG = bgCtx.createLinearGradient(0, 0, 0, 128);
        bgG.addColorStop(0, '#f1f5f9'); bgG.addColorStop(1, '#e2e8f0');
        bgCtx.fillStyle = bgG; bgCtx.fillRect(0, 0, 2, 128);
        scene.background = new THREE.CanvasTexture(bgCanvas);
        s.scene = scene;

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const key = new THREE.DirectionalLight(0xffffff, 0.8);
        key.position.set(SX * 2, SY * 10, SZ * 1.5);
        scene.add(key);
        scene.add(mesh);

        // Edges
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.3 }));
        edges.rotation.copy(mesh.rotation);
        edges.position.copy(mesh.position);
        scene.add(edges);

        // Grid
        const gridSz = Math.max(SX, SZ) * 1.3;
        const grid = new THREE.GridHelper(gridSz, Math.round(gridSz / 8), 0xcbd5e1, 0xe2e8f0);
        grid.position.set(SX / 2, -0.3, SZ / 2);
        grid.material.transparent = true; grid.material.opacity = 0.35;
        scene.add(grid);

        // Camera
        const cam = new THREE.PerspectiveCamera(30, width / height, 0.1, 500);
        cam.position.set(SX * 0.8, Math.max(SY, SZ) * 0.6, SZ * 1.1);
        cam.lookAt(SX / 2, SY / 2, SZ / 2);

        // Controls
        const ctrl = new OrbitControls(cam, canvasRef.current);
        ctrl.enableDamping = true; ctrl.dampingFactor = 0.08;
        ctrl.target.set(SX / 2, SY / 2, SZ / 2);
        s.ctrl = ctrl;

        // Render
        const dpr = Math.min(window.devicePixelRatio, 2);
        const rW = Math.round(width * dpr), rH = Math.round(height * dpr);
        renderer.setSize(rW, rH);
        const ctx2d = canvasRef.current.getContext('2d');
        let needsRender = true;
        let dampFrames = 0;
        ctrl.addEventListener('change', () => { needsRender = true; dampFrames = 20; });

        const animate = () => {
            if (s.disposed) return;
            s.raf = requestAnimationFrame(animate);
            ctrl.update();
            if (dampFrames > 0) { dampFrames--; needsRender = true; }
            if (needsRender) {
                needsRender = false;
                renderer.setSize(rW, rH);
                renderer.render(scene, cam);
                try { ctx2d.clearRect(0, 0, rW, rH); ctx2d.drawImage(renderer.domElement, 0, 0, rW, rH); } catch {}
            }
        };
        needsRender = true;
        animate();
    }, [commands, espessura, materialCor, width, height]);

    useEffect(() => {
        if (canvasRef.current) {
            const dpr = Math.min(window.devicePixelRatio, 2);
            canvasRef.current.width = Math.round(width * dpr);
            canvasRef.current.height = Math.round(height * dpr);
            canvasRef.current.style.width = width + 'px';
            canvasRef.current.style.height = height + 'px';
        }
        build();
        return () => {
            const s = stateRef.current;
            s.disposed = true;
            if (s.raf) cancelAnimationFrame(s.raf);
            if (s.ctrl) s.ctrl.dispose();
        };
    }, [build, width, height]);

    if (!ok || !commands?.length || commands.length < 2) {
        return (
            <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: 8, color: '#94a3b8', fontSize: 12 }}>
                Desenhe a silhueta para ver o 3D
            </div>
        );
    }

    return <canvas ref={canvasRef} style={{ borderRadius: 8, display: 'block', cursor: 'grab' }} />;
}
