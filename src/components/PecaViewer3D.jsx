import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * PecaViewer3D — Visualizador 3D de alta qualidade para peças CNC.
 *
 * Renderer WebGL global único (evita esgotar contextos).
 * Renderiza off-screen e copia via drawImage para canvas local.
 * Usinagens representadas como cortes subtrativo realistas.
 */

// ═══════════════════════════════════════════════════════════
// RENDERER GLOBAL SINGLETON
// ═══════════════════════════════════════════════════════════
let _renderer = null;
let _rendererOk = true;

function getRenderer() {
    if (_renderer) return _renderer;
    if (!_rendererOk) return null;
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) { _rendererOk = false; return null; }

        const r = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true,
        });
        r.setPixelRatio(1);
        r.shadowMap.enabled = true;
        r.shadowMap.type = THREE.PCFSoftShadowMap;
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.15;
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.domElement.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
        document.body.appendChild(r.domElement);
        _renderer = r;
        return r;
    } catch {
        _rendererOk = false;
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// CORES E CLASSIFICAÇÃO
// ═══════════════════════════════════════════════════════════
const COLORS = {
    holeThrough: 0xef4444,
    holeBlind:   0xf97316,
    groove:      0xeab308,
    pocket:      0xa855f7,
    slot:        0x06b6d4,
};

function classifyWorker(cat) {
    const c = (cat || '').toLowerCase();
    if (/transfer_hole$/.test(c))              return { type: 'holeThrough', label: 'Furo passante', color: COLORS.holeThrough };
    if (/hole_blind|blind/.test(c))            return { type: 'holeBlind',   label: 'Furo cego',     color: COLORS.holeBlind };
    if (/groove|rasgo|canal|saw_cut/.test(c))  return { type: 'groove',      label: 'Rasgo/Canal',   color: COLORS.groove };
    if (/pocket|rebaixo/.test(c))              return { type: 'pocket',      label: 'Rebaixo',       color: COLORS.pocket };
    if (/slot|fresa/.test(c))                  return { type: 'slot',        label: 'Fresa/Slot',    color: COLORS.slot };
    if (/hole|furo/.test(c))                   return { type: 'holeThrough', label: 'Furo',          color: COLORS.holeThrough };
    return { type: 'slot', label: 'Usinagem', color: COLORS.slot };
}

function parseMachining(mj) {
    if (!mj) return [];
    try {
        const d = typeof mj === 'string' ? JSON.parse(mj) : mj;
        if (Array.isArray(d)) return d;
        if (d.workers) return Array.isArray(d.workers) ? d.workers : Object.values(d.workers);
        return [];
    } catch { return []; }
}

// ═══════════════════════════════════════════════════════════
// TEXTURAS DE ALTA QUALIDADE
// ═══════════════════════════════════════════════════════════
function createWoodTexture(grain, comp, larg) {
    const cv = document.createElement('canvas');
    const sz = 1024;
    cv.width = sz; cv.height = sz;
    const cx = cv.getContext('2d');
    const isV = grain === 'vertical';

    // Base com gradiente sutil
    const g = cx.createLinearGradient(0, 0, isV ? 0 : sz, isV ? sz : 0);
    g.addColorStop(0, '#dbb07a');
    g.addColorStop(0.25, '#d1a46e');
    g.addColorStop(0.5, '#c99860');
    g.addColorStop(0.75, '#d1a46e');
    g.addColorStop(1, '#dbb07a');
    cx.fillStyle = g;
    cx.fillRect(0, 0, sz, sz);

    // Veios finos de madeira
    cx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 120; i++) {
        cx.beginPath();
        const offset = Math.random() * sz;
        const wavelength = 8 + Math.random() * 25;
        const amplitude = 1.5 + Math.random() * 4;
        for (let t = 0; t < sz; t += 1.5) {
            const x = isV ? offset + Math.sin(t / wavelength) * amplitude : t;
            const y = isV ? t : offset + Math.sin(t / wavelength) * amplitude;
            t === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
        }
        cx.globalAlpha = 0.015 + Math.random() * 0.04;
        cx.strokeStyle = Math.random() > 0.6 ? '#8a6832' : '#a07840';
        cx.lineWidth = 0.3 + Math.random() * 1.8;
        cx.stroke();
    }

    // Veios mais grossos espaçados
    for (let i = 0; i < 15; i++) {
        cx.beginPath();
        const offset = 40 + Math.random() * (sz - 80);
        for (let t = 0; t < sz; t += 1.5) {
            const x = isV ? offset + Math.sin(t / 30) * 6 : t;
            const y = isV ? t : offset + Math.sin(t / 30) * 6;
            t === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
        }
        cx.globalAlpha = 0.02 + Math.random() * 0.035;
        cx.strokeStyle = '#7a5828';
        cx.lineWidth = 1.5 + Math.random() * 3;
        cx.stroke();
    }

    cx.globalCompositeOperation = 'source-over';
    cx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.repeat.set(comp / 500, larg / 500);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

function createMDFCoreTexture() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#6b4226';
    cx.fillRect(0, 0, 128, 128);
    // Fibras de MDF
    for (let i = 0; i < 200; i++) {
        cx.fillStyle = Math.random() > 0.5 ? '#5a3520' : '#7a4e30';
        cx.globalAlpha = 0.15 + Math.random() * 0.2;
        cx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 4, 0.5 + Math.random());
    }
    cx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}


// ═══════════════════════════════════════════════════════════
// GEOMETRIAS DE CORTE
// ═══════════════════════════════════════════════════════════

/** Cria um cilindro de furo com borda chanfrada no topo */
function createHoleGeometry(radius, height, segments = 32) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, segments, 1, true);
    return geo;
}

/** Anel indicador na superfície */
function createRing(innerR, outerR, color, segments = 48) {
    const geo = new THREE.RingGeometry(innerR, outerR, segments);
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.6,
        side: THREE.DoubleSide, depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
}

/** Disco de fundo de furo (furo cego) */
function createCap(radius, color, segments = 32) {
    const geo = new THREE.CircleGeometry(radius, segments);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    return new THREE.Mesh(geo, mat);
}

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function PecaViewer3D({ peca, width = 400, height = 300, style, force2d = false }) {
    const canvasRef = useRef(null);
    const stateRef = useRef({ scene: null, cam: null, ctrl: null, raf: null, disposed: false });
    const [error, setError] = useState(false);

    const disposeScene = useCallback(() => {
        const s = stateRef.current;
        s.disposed = true;
        if (s.raf) cancelAnimationFrame(s.raf);
        if (s.ctrl) { s.ctrl.dispose(); s.ctrl = null; }
        if (s.scene) {
            s.scene.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
                }
            });
            s.scene = null;
        }
        s.cam = null;
    }, []);

    const build = useCallback(() => {
        if (!canvasRef.current || !peca) return;
        disposeScene();
        stateRef.current.disposed = false;
        setError(false);

        const renderer = getRenderer();
        if (!renderer) { setError(true); return; }

        const dpr = Math.min(window.devicePixelRatio, 2);
        const W = width, H = height;
        const rW = Math.round(W * dpr), rH = Math.round(H * dpr);

        // Dimensões da peça em mm
        const comp = peca.comprimento || 600;
        const larg = peca.largura || 400;
        const esp = peca.espessura || 18;

        // Normalizar para ~100 unidades 3D no eixo mais longo
        const maxDim = Math.max(comp, larg, esp * 6);
        const sc = 100 / maxDim;
        const SX = comp * sc;  // Three.js X = comprimento
        const SY = esp * sc;   // Three.js Y = espessura (vertical)
        const SZ = larg * sc;  // Three.js Z = largura

        // ── Scene ──
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xeaecf0);
        scene.fog = new THREE.Fog(0xeaecf0, 350, 600);
        stateRef.current.scene = scene;

        // ── Camera ──
        const cam = new THREE.PerspectiveCamera(32, W / H, 0.1, 800);
        const camDist = Math.max(SX, SZ) * 1.8;
        cam.position.set(SX * 0.9, camDist * 0.45, SZ * 1.1);
        cam.lookAt(0, 0, 0);
        stateRef.current.cam = cam;

        // ── Controls ──
        const localCanvas = canvasRef.current;
        const ctrl = new OrbitControls(cam, localCanvas);
        ctrl.enableDamping = true;
        ctrl.dampingFactor = 0.08;
        ctrl.minDistance = 10;
        ctrl.maxDistance = 400;
        ctrl.target.set(0, 0, 0);
        ctrl.maxPolarAngle = Math.PI * 0.85;
        stateRef.current.ctrl = ctrl;

        // ── Iluminação studio 3-point ──
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb0a090, 0.5);
        scene.add(hemiLight);

        const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.1);
        keyLight.position.set(SX * 2, SY * 20, SZ * 1.5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = camDist * 4;
        const shadowExtent = Math.max(SX, SZ) * 1.5;
        keyLight.shadow.camera.left = -shadowExtent;
        keyLight.shadow.camera.right = shadowExtent;
        keyLight.shadow.camera.top = shadowExtent;
        keyLight.shadow.camera.bottom = -shadowExtent;
        keyLight.shadow.bias = -0.001;
        keyLight.shadow.normalBias = 0.02;
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xc0d0f0, 0.35);
        fillLight.position.set(-SX * 2.5, SY * 8, -SZ * 2);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xffeedd, 0.2);
        rimLight.position.set(0, SY * 6, -SZ * 3.5);
        scene.add(rimLight);

        // ── Chão + Grid ──
        const floorY = -SY / 2 - 0.25;
        const floorGeo = new THREE.PlaneGeometry(500, 500);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xdfe2e8, roughness: 0.92, metalness: 0,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = floorY;
        floor.receiveShadow = true;
        scene.add(floor);

        const gridSize = Math.max(SX, SZ) * 3;
        const grid = new THREE.GridHelper(gridSize, Math.round(gridSize / 5), 0xc5c9d2, 0xd5d9e0);
        grid.position.y = floorY + 0.05;
        grid.material.opacity = 0.18;
        grid.material.transparent = true;
        scene.add(grid);

        // ═══════════════════════════════════════════════════
        // CORPO DA PEÇA
        // ═══════════════════════════════════════════════════
        const woodTex = createWoodTexture(peca.grain || 'sem_veio', comp, larg);
        const mdfCoreTex = createMDFCoreTexture();

        const hasEB = (code) => code && code !== '-' && code !== '';

        // Materiais por face
        const topMat = new THREE.MeshStandardMaterial({
            map: woodTex, color: 0xd4a56e, roughness: 0.4, metalness: 0,
        });
        const botMat = new THREE.MeshStandardMaterial({
            color: 0xc09050, roughness: 0.55, metalness: 0,
        });
        const makeEdgeFaceMat = (code) => {
            if (hasEB(code)) {
                return new THREE.MeshStandardMaterial({
                    color: 0x505860, roughness: 0.2, metalness: 0.05,
                });
            }
            return new THREE.MeshStandardMaterial({
                map: mdfCoreTex.clone(), color: 0xb8956a, roughness: 0.6,
            });
        };

        // BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
        const bodyMats = [
            makeEdgeFaceMat(peca.borda_dir),     // +X direita
            makeEdgeFaceMat(peca.borda_esq),     // -X esquerda
            topMat,                               // +Y topo (Face A)
            botMat,                               // -Y fundo (Face B)
            makeEdgeFaceMat(peca.borda_frontal), // +Z frontal
            makeEdgeFaceMat(peca.borda_traseira),// -Z traseira
        ];

        const body = new THREE.Mesh(new THREE.BoxGeometry(SX, SY, SZ), bodyMats);
        body.castShadow = true;
        body.receiveShadow = true;
        scene.add(body);

        // Wireframe sutil para definir arestas da peça
        const bodyEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(body.geometry),
            new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3 })
        );
        scene.add(bodyEdges);

        // Fitas de borda — filetes visuais
        const ebThick = Math.max(SY * 0.15, 0.35);
        const addEdgeBand = (pos, rotY, w, h) => {
            const geo = new THREE.PlaneGeometry(w, h);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x3b82f6, transparent: true, opacity: 0.55,
                side: THREE.DoubleSide, depthWrite: false,
            });
            const m = new THREE.Mesh(geo, mat);
            m.position.copy(pos);
            if (rotY) m.rotation.y = rotY;
            scene.add(m);
        };
        if (hasEB(peca.borda_frontal))  addEdgeBand(new THREE.Vector3(0, 0, SZ / 2 + 0.04), 0, SX, ebThick);
        if (hasEB(peca.borda_traseira)) addEdgeBand(new THREE.Vector3(0, 0, -SZ / 2 - 0.04), 0, SX, ebThick);
        if (hasEB(peca.borda_dir))      addEdgeBand(new THREE.Vector3(SX / 2 + 0.04, 0, 0), Math.PI / 2, SZ, ebThick);
        if (hasEB(peca.borda_esq))      addEdgeBand(new THREE.Vector3(-SX / 2 - 0.04, 0, 0), Math.PI / 2, SZ, ebThick);

        // ═══════════════════════════════════════════════════
        // USINAGENS
        // ═══════════════════════════════════════════════════
        const workers = parseMachining(peca.machining_json);

        // Materiais de corte (MDF exposto)
        const cutWallMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8, metalness: 0 });
        const cutBottomMat = new THREE.MeshStandardMaterial({ color: 0x3d220e, roughness: 0.95, metalness: 0 });
        const cutInnerMat = new THREE.MeshStandardMaterial({ color: 0x1a0e04, roughness: 0.95, metalness: 0 });

        // Escala mínima visual (furos de 5mm em peça de 720mm precisam ser visíveis)
        const minR = Math.max(SX, SZ) * 0.006;

        // Grupo para meshes de usinagem (para raycasting)
        const machiningGroup = new THREE.Group();
        machiningGroup.name = 'machining';
        scene.add(machiningGroup);

        for (const w of workers) {
            const info = classifyWorker(w.category);
            const face = (w.face || 'top').toLowerCase();
            const depthMm = w.depth || esp;
            const depthSc = (depthMm / esp) * SY;
            const isTop = face === 'top' || face === 'side_a';
            const isBot = face === 'bottom' || face === 'side_b';
            const isLat = !isTop && !isBot;

            // Posição 3D (centro da peça = 0,0,0)
            const px = ((w.x || 0) / comp - 0.5) * SX;
            const pz = ((w.y || 0) / larg - 0.5) * SZ;

            const isHole = info.type === 'holeThrough' || info.type === 'holeBlind';
            const isThrough = info.type === 'holeThrough' || (isHole && depthMm >= esp);

            // Info para tooltip
            const tooltipData = {
                tipo: info.label,
                face: face,
                x: w.x, y: w.y,
                profundidade: depthMm,
                diametro: isHole ? (w.diameter || 8) : null,
                comprimento: !isHole ? (w.length || null) : null,
                larguraOp: !isHole ? (w.width || null) : null,
                ferramenta: w.tool_code || null,
                passante: isThrough,
            };

            // Helper: adiciona mesh ao machiningGroup com tooltip
            const addMach = (mesh) => {
                mesh.userData.tooltip = tooltipData;
                machiningGroup.add(mesh);
            };

            if (isHole) {
                const d = w.diameter || 8;
                const r = Math.max((d / Math.max(comp, larg)) * Math.max(SX, SZ) * 0.5, minR, 0.4);

                if (isLat) {
                    const penetration = Math.min((depthMm / larg) * SZ, SZ);
                    const cylH = penetration + 0.08;
                    const wallGeo = createHoleGeometry(r, cylH);
                    const wall = new THREE.Mesh(wallGeo, cutWallMat);
                    const innerGeo = new THREE.CylinderGeometry(r * 0.75, r * 0.75, cylH + 0.02, 32);
                    const inner = new THREE.Mesh(innerGeo, cutInnerMat);
                    let mx = px, mz = pz;
                    if (face === 'front' || face === 'back') {
                        wall.rotation.x = Math.PI / 2; inner.rotation.x = Math.PI / 2;
                        mz = face === 'front' ? SZ / 2 - cylH / 2 : -SZ / 2 + cylH / 2;
                    } else {
                        wall.rotation.z = Math.PI / 2; inner.rotation.z = Math.PI / 2;
                        mx = face === 'left' ? -SX / 2 + cylH / 2 : SX / 2 - cylH / 2;
                    }
                    wall.position.set(mx, 0, mz); inner.position.set(mx, 0, mz);
                    addMach(wall); addMach(inner);
                    const bevel = new THREE.Mesh(
                        new THREE.RingGeometry(r, r * 1.15, 32),
                        new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.7, side: THREE.DoubleSide })
                    );
                    if (face === 'front')      { bevel.position.set(px, 0, SZ / 2 + 0.03); }
                    else if (face === 'back')  { bevel.rotation.y = Math.PI; bevel.position.set(px, 0, -SZ / 2 - 0.03); }
                    else if (face === 'left')  { bevel.rotation.y = Math.PI / 2; bevel.position.set(-SX / 2 - 0.03, 0, pz); }
                    else                       { bevel.rotation.y = -Math.PI / 2; bevel.position.set(SX / 2 + 0.03, 0, pz); }
                    addMach(bevel);
                    continue;
                }

                const h = isThrough ? SY + 0.3 : Math.min(depthSc, SY * 0.96);
                const py = isThrough ? 0 : (isTop ? SY / 2 - h / 2 + 0.04 : -SY / 2 + h / 2 - 0.04);
                const wallGeo = createHoleGeometry(r, h);
                const wall = new THREE.Mesh(wallGeo, cutWallMat);
                wall.position.set(px, py, pz);
                addMach(wall);
                const innerGeo = new THREE.CylinderGeometry(r * 0.7, r * 0.7, h + 0.02, 32);
                const inner = new THREE.Mesh(innerGeo, cutInnerMat);
                inner.position.set(px, py, pz);
                addMach(inner);
                if (!isThrough) {
                    const cap = createCap(r * 0.98, 0x3d220e);
                    cap.rotation.x = -Math.PI / 2;
                    cap.position.set(px, isTop ? SY / 2 - h + 0.06 : -SY / 2 + h - 0.06, pz);
                    addMach(cap);
                }
                const bevel = new THREE.Mesh(
                    new THREE.RingGeometry(r, r * 1.12, 32),
                    new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.7, side: THREE.DoubleSide })
                );
                bevel.rotation.x = -Math.PI / 2;
                bevel.position.set(px, isBot ? -SY / 2 - 0.02 : SY / 2 + 0.02, pz);
                addMach(bevel);
                if (isThrough) {
                    const bevel2 = new THREE.Mesh(
                        new THREE.RingGeometry(r, r * 1.12, 32),
                        new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.7, side: THREE.DoubleSide })
                    );
                    bevel2.rotation.x = -Math.PI / 2;
                    bevel2.position.set(px, isBot ? SY / 2 + 0.02 : -SY / 2 - 0.02, pz);
                    addMach(bevel2);
                }

            } else {
                const wLen = w.length || (info.type === 'pocket' ? 50 : 100);
                const wWid = w.width || (info.type === 'pocket' ? 50 : 6);
                const len = Math.max((wLen / comp) * SX, minR * 3, 0.5);
                const wid = Math.max((wWid / larg) * SZ, minR * 2, 0.3);
                const h = Math.min(depthSc, SY * 0.97);
                const py = isTop ? SY / 2 - h / 2 + 0.03 : -SY / 2 + h / 2 - 0.03;
                const boxGeo = new THREE.BoxGeometry(len, h + 0.1, wid);
                const box = new THREE.Mesh(boxGeo, cutWallMat);
                box.position.set(px, py, pz);
                addMach(box);
                const shrink = 0.85;
                const innerGeo = new THREE.BoxGeometry(len * shrink, h, wid * shrink);
                const inner = new THREE.Mesh(innerGeo, cutInnerMat);
                inner.position.set(px, py, pz);
                addMach(inner);
                const floorGeo2 = new THREE.PlaneGeometry(len * 0.96, wid * 0.96);
                const floorMesh2 = new THREE.Mesh(floorGeo2, cutBottomMat);
                floorMesh2.rotation.x = -Math.PI / 2;
                const floorY2 = isTop ? SY / 2 - h + 0.04 : -SY / 2 + h - 0.04;
                floorMesh2.position.set(px, floorY2, pz);
                addMach(floorMesh2);
                const edgeBevel = new THREE.Mesh(
                    new THREE.BoxGeometry(len + 0.08, 0.08, wid + 0.08),
                    new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.7 })
                );
                edgeBevel.position.set(px, isTop ? SY / 2 + 0.01 : -SY / 2 - 0.01, pz);
                addMach(edgeBevel);
            }
        }

        // ── Seta de veio ──
        if (peca.grain && peca.grain !== 'sem_veio') {
            const dir = peca.grain === 'horizontal' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
            const len = (peca.grain === 'horizontal' ? SX : SZ) * 0.3;
            const orig = new THREE.Vector3(
                peca.grain === 'horizontal' ? -len / 2 : 0,
                SY / 2 + 0.25,
                peca.grain === 'vertical' ? -len / 2 : 0,
            );
            scene.add(new THREE.ArrowHelper(dir, orig, len, 0xff6b35, len * 0.12, len * 0.06));
        }

        // ═══════════════════════════════════════════════════
        // RENDER LOOP
        // ═══════════════════════════════════════════════════
        renderer.setSize(rW, rH);

        const ctx2d = localCanvas.getContext('2d');
        let needsRender = true;

        ctrl.addEventListener('change', () => { needsRender = true; });

        // ── Raycasting para tooltip no hover ──
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        stateRef.current.machiningGroup = machiningGroup;
        stateRef.current.raycaster = raycaster;
        stateRef.current.mouse = mouse;
        stateRef.current.cam = cam;

        const onMouseMove = (e) => {
            const rect = localCanvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, cam);
            const hits = raycaster.intersectObjects(machiningGroup.children, false);
            const tooltip = hits.length > 0 ? hits[0].object.userData.tooltip : null;

            if (tooltip && stateRef.current.tooltipEl) {
                const el = stateRef.current.tooltipEl;
                const lines = [tooltip.tipo];
                if (tooltip.diametro) lines.push(`⌀${tooltip.diametro}mm`);
                if (tooltip.comprimento) lines.push(`${tooltip.comprimento}×${tooltip.larguraOp}mm`);
                lines.push(`Prof: ${tooltip.profundidade}mm`);
                lines.push(`Face: ${tooltip.face}`);
                lines.push(`Pos: ${tooltip.x?.toFixed(1)}, ${tooltip.y?.toFixed(1)}`);
                if (tooltip.ferramenta) lines.push(`Ferr: ${tooltip.ferramenta}`);
                if (tooltip.passante) lines.push('(passante)');
                el.innerHTML = lines.join('<br>');
                el.style.display = 'block';
                const tx = Math.min(e.clientX - rect.left + 12, rect.width - 160);
                const mouseY = e.clientY - rect.top;
                const tipH = lines.length * 18 + 16;
                const flipUp = mouseY + tipH + 10 > rect.height;
                const ty = flipUp ? Math.max(mouseY - tipH - 5, 5) : Math.max(mouseY - 10, 5);
                el.style.left = tx + 'px';
                el.style.top = ty + 'px';
                localCanvas.style.cursor = 'pointer';
            } else if (stateRef.current.tooltipEl) {
                stateRef.current.tooltipEl.style.display = 'none';
                localCanvas.style.cursor = 'grab';
            }
        };
        localCanvas.addEventListener('mousemove', onMouseMove);
        localCanvas.addEventListener('mouseleave', () => {
            if (stateRef.current.tooltipEl) stateRef.current.tooltipEl.style.display = 'none';
            localCanvas.style.cursor = 'grab';
        });
        stateRef.current._onMouseMove = onMouseMove;

        const animate = () => {
            if (stateRef.current.disposed) return;
            stateRef.current.raf = requestAnimationFrame(animate);
            ctrl.update();

            if (needsRender) {
                needsRender = false;
                renderer.setSize(rW, rH);
                renderer.render(scene, cam);
                try {
                    ctx2d.clearRect(0, 0, rW, rH);
                    ctx2d.drawImage(renderer.domElement, 0, 0, rW, rH);
                } catch {}
            }
        };

        needsRender = true;
        const dampingInterval = setInterval(() => { needsRender = true; }, 50);
        stateRef.current._dampingInterval = dampingInterval;

        animate();

    }, [peca, width, height, disposeScene]);

    const tooltipRef = useRef(null);

    useEffect(() => {
        if (canvasRef.current) {
            const dpr = Math.min(window.devicePixelRatio, 2);
            const rW = Math.round(width * dpr);
            const rH = Math.round(height * dpr);
            canvasRef.current.width = rW;
            canvasRef.current.height = rH;
            canvasRef.current.style.width = width + 'px';
            canvasRef.current.style.height = height + 'px';
        }
        stateRef.current.tooltipEl = tooltipRef.current;
        build();
        return () => {
            if (stateRef.current._dampingInterval) clearInterval(stateRef.current._dampingInterval);
            if (canvasRef.current && stateRef.current._onMouseMove) {
                canvasRef.current.removeEventListener('mousemove', stateRef.current._onMouseMove);
            }
            disposeScene();
        };
    }, [build, disposeScene, width, height]);

    if (!peca) return null;

    if (error || force2d) {
        return <Fallback2D peca={peca} width={width} height={height} style={style} />;
    }

    return (
        <div style={{ position: 'relative', width, height, ...style }}>
            <canvas
                ref={canvasRef}
                style={{
                    borderRadius: 4,
                    display: 'block',
                    cursor: 'grab',
                    background: '#eaecf0',
                    width: '100%',
                    height: '100%',
                }}
            />
            <div
                ref={tooltipRef}
                style={{
                    display: 'none',
                    position: 'absolute',
                    pointerEvents: 'none',
                    background: 'rgba(0,0,0,0.82)',
                    backdropFilter: 'blur(8px)',
                    color: '#fff',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    padding: '6px 10px',
                    borderRadius: 6,
                    lineHeight: 1.5,
                    maxWidth: 200,
                    zIndex: 10,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                }}
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// FALLBACK 2D (quando WebGL não disponível)
// ═══════════════════════════════════════════════════════════
function Fallback2D({ peca, width, height, style }) {
    const comp = peca.comprimento || 600;
    const larg = peca.largura || 400;
    const esp = peca.espessura || 18;
    const workers = parseMachining(peca.machining_json);
    const hasEB = (c) => c && c !== '-' && c !== '';
    const [tip, setTip] = useState(null); // { x, y, lines }

    // Fit-to-view: peça preenche o máximo do espaço
    const pad = 8;
    const scale = Math.min((width - pad * 2) / comp, (height - pad * 2) / larg);
    const pw = comp * scale;
    const ph = larg * scale;
    const ox = (width - pw) / 2;
    const oy = (height - ph) / 2;

    const cutColor = '#5a3520';
    const cutDark = '#3a1e0e';
    const ebColor = '#3b82f6';

    // Gera tooltip info para um worker
    const workerTip = (w, e) => {
        const info = classifyWorker(w.category);
        const isHole = /hole|furo/i.test(w.category || '');
        const rect = e.currentTarget.closest('div').getBoundingClientRect();
        const lines = [info.label];
        if (isHole && w.diameter) lines.push(`⌀${w.diameter}mm`);
        if (!isHole && w.length) lines.push(`${w.length}×${w.width}mm`);
        lines.push(`Prof: ${w.depth || esp}mm`);
        lines.push(`Face: ${w.face || 'top'}`);
        lines.push(`Pos: ${(w.x || 0).toFixed(1)}, ${(w.y || 0).toFixed(1)}`);
        if (w.tool_code) lines.push(`Ferr: ${w.tool_code}`);
        const tipH = lines.length * 18 + 16; // estimativa altura tooltip
        const mouseY = e.clientY - rect.top;
        const flipUp = mouseY + tipH + 10 > height; // se tooltip vai cortar embaixo, mostra acima
        setTip({
            x: Math.min(e.clientX - rect.left + 12, width - 160),
            y: flipUp ? Math.max(mouseY - tipH - 5, 5) : Math.max(mouseY - 10, 5),
            lines,
        });
    };

    return (
        <div style={{
            width, height, overflow: 'hidden', border: 'none',
            background: '#eaecf0', fontFamily: 'Inter, system-ui, sans-serif',
            position: 'relative', ...style,
        }} onMouseLeave={() => setTip(null)}>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <defs>
                    <pattern id="wood2d" patternUnits="userSpaceOnUse" width="40" height="40">
                        <rect width="40" height="40" fill="#d4a574" />
                        <line x1="0" y1="5" x2="40" y2="5" stroke="#c9985a" strokeWidth="0.5" opacity="0.3" />
                        <line x1="0" y1="15" x2="40" y2="14" stroke="#c9985a" strokeWidth="0.8" opacity="0.2" />
                        <line x1="0" y1="25" x2="40" y2="26" stroke="#b88844" strokeWidth="0.5" opacity="0.25" />
                        <line x1="0" y1="35" x2="40" y2="34" stroke="#c9985a" strokeWidth="0.6" opacity="0.15" />
                    </pattern>
                    <filter id="pieceShadow">
                        <feDropShadow dx="1" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.12" />
                    </filter>
                </defs>

                {/* Peça principal — cantos retos */}
                <rect x={ox} y={oy} width={pw} height={ph}
                    fill="url(#wood2d)" stroke="#a07040" strokeWidth="1.5"
                    filter="url(#pieceShadow)" />

                {/* Fitas de borda */}
                {hasEB(peca.borda_frontal) && <line x1={ox} y1={oy + ph} x2={ox + pw} y2={oy + ph} stroke={ebColor} strokeWidth="3" strokeLinecap="butt" />}
                {hasEB(peca.borda_traseira) && <line x1={ox} y1={oy} x2={ox + pw} y2={oy} stroke={ebColor} strokeWidth="3" strokeLinecap="butt" />}
                {hasEB(peca.borda_dir) && <line x1={ox + pw} y1={oy} x2={ox + pw} y2={oy + ph} stroke={ebColor} strokeWidth="3" strokeLinecap="butt" />}
                {hasEB(peca.borda_esq) && <line x1={ox} y1={oy} x2={ox} y2={oy + ph} stroke={ebColor} strokeWidth="3" strokeLinecap="butt" />}

                {/* Usinagens + hit areas para hover */}
                {workers.map((w, i) => {
                    const cx = ox + (w.x || 0) / comp * pw;
                    const cy = oy + (w.y || 0) / larg * ph;
                    const cat = (w.category || '').toLowerCase();
                    const isHole = /hole|furo/.test(cat);
                    const isThrough = /transfer_hole$/.test(cat) || (w.depth || 0) >= esp;

                    if (isHole) {
                        const d = w.diameter || 8;
                        const r = Math.max(d / 2 * scale, 2.5);
                        const hitR = Math.max(r + 3, 8); // hit area mínima de 8px
                        return (
                            <g key={i} style={{ cursor: 'pointer' }}
                                onMouseEnter={(e) => workerTip(w, e)}
                                onMouseMove={(e) => workerTip(w, e)}
                                onMouseLeave={() => setTip(null)}>
                                <circle cx={cx + 0.5} cy={cy + 0.5} r={r + 1} fill="#000" opacity="0.12" />
                                <circle cx={cx} cy={cy} r={r + 1} fill={cutColor} />
                                <circle cx={cx} cy={cy} r={r} fill={isThrough ? '#1a0a04' : cutDark} />
                                <circle cx={cx} cy={cy} r={r + 0.5} fill="none" stroke="#8b5e3c" strokeWidth="0.5" opacity="0.6" />
                                {!isThrough && r > 4 && <circle cx={cx} cy={cy} r={1} fill="#2a1508" />}
                                {/* Hit area transparente */}
                                <circle cx={cx} cy={cy} r={hitR} fill="transparent" />
                            </g>
                        );
                    }

                    const rw = Math.max((w.length || 50) * scale, 4);
                    const rh = Math.max((w.width || 6) * scale, 2);
                    const hitPad = 4;
                    return (
                        <g key={i} style={{ cursor: 'pointer' }}
                            onMouseEnter={(e) => workerTip(w, e)}
                            onMouseMove={(e) => workerTip(w, e)}
                            onMouseLeave={() => setTip(null)}>
                            <rect x={cx - rw / 2 + 0.5} y={cy - rh / 2 + 0.5} width={rw} height={rh} fill="#000" opacity="0.1" />
                            <rect x={cx - rw / 2} y={cy - rh / 2} width={rw} height={rh} fill={cutColor} stroke="#4a2510" strokeWidth="0.5" />
                            <rect x={cx - rw / 2 + 1} y={cy - rh / 2 + 0.5} width={Math.max(rw - 2, 1)} height={Math.max(rh - 1, 1)} fill={cutDark} />
                            {/* Hit area transparente */}
                            <rect x={cx - rw / 2 - hitPad} y={cy - rh / 2 - hitPad} width={rw + hitPad * 2} height={rh + hitPad * 2} fill="transparent" />
                        </g>
                    );
                })}

                {/* Cotas internas — comprimento */}
                <g>
                    <line x1={ox + 4} y1={oy + ph - 12} x2={ox + pw - 4} y2={oy + ph - 12} stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
                    <line x1={ox + 4} y1={oy + ph - 16} x2={ox + 4} y2={oy + ph - 8} stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
                    <line x1={ox + pw - 4} y1={oy + ph - 16} x2={ox + pw - 4} y2={oy + ph - 8} stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
                    <text x={ox + pw / 2} y={oy + ph - 15} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700"
                        stroke="#000" strokeWidth="3" paintOrder="stroke">{comp}</text>
                </g>

                {/* Cotas internas — largura */}
                <g>
                    <line x1={ox + pw - 12} y1={oy + 4} x2={ox + pw - 12} y2={oy + ph - 4} stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
                    <line x1={ox + pw - 16} y1={oy + 4} x2={ox + pw - 8} y2={oy + 4} stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
                    <line x1={ox + pw - 16} y1={oy + ph - 4} x2={ox + pw - 8} y2={oy + ph - 4} stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
                    <text x={ox + pw - 15} y={oy + ph / 2 + 4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700"
                        stroke="#000" strokeWidth="3" paintOrder="stroke"
                        transform={`rotate(-90, ${ox + pw - 15}, ${oy + ph / 2 + 4})`}>{larg}</text>
                </g>
            </svg>

            {/* Tooltip */}
            {tip && (
                <div style={{
                    position: 'absolute', left: tip.x, top: tip.y,
                    pointerEvents: 'none',
                    background: 'rgba(0,0,0,0.82)',
                    backdropFilter: 'blur(8px)',
                    color: '#fff', fontSize: 11, fontFamily: 'monospace',
                    padding: '6px 10px', borderRadius: 6, lineHeight: 1.5,
                    maxWidth: 200, zIndex: 10,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                }}>
                    {tip.lines.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            )}
        </div>
    );
}
