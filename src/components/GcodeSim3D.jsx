import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getOpCat, getToolDiameterFromName, OP_CATS, parseGcodeForSim } from './GcodeSimWrapper.jsx';

const MDF = {
    base: 0xc8a86a,
    edge: 0x6f4a20,
    top: 0xd2b579,
    piece: 0xd8bf83,
};
const VOID_COLOR = 0xf4f1ea;

const VIEW_PRESETS = {
    iso: 'Isométrica',
    topo: 'Topo',
    frente: 'Frente',
};
const THROUGH_TOL_MM = 0.2;

function hexToThree(hex) {
    return new THREE.Color(hex || '#2563eb');
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function disposeObject(obj) {
    obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    });
}

function makeLabel(text, color = '#3f3426') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '700 28px Arial';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.8, 0.45, 1);
    return sprite;
}

function moveDistance(m) {
    return Math.hypot(Number(m.x2 || 0) - Number(m.x1 || 0), Number(m.y2 || 0) - Number(m.y1 || 0));
}

function detectZOrigin(gcode, moves) {
    const txt = String(gcode || '').toLowerCase();
    if (txt.includes('z0=material') || txt.includes('topo do material')) return 'material';
    if (txt.includes('z0=mesa') || txt.includes('mesa de sacrificio')) return 'mesa';
    return moves.some(m => m.type !== 'G0' && Number(m.z2 || 0) < -0.01) ? 'material' : 'mesa';
}

function moveDepthInfo(move, espessura, zOrigin) {
    const esp = Math.max(1, Number(espessura || 18));
    const z = Number(move?.z2 || 0);
    const depthMm = zOrigin === 'material'
        ? Math.max(0, -z)
        : Math.max(0, esp - z);
    return {
        depthMm,
        ratio: clamp(depthMm / esp, 0, 1),
        through: depthMm >= esp - THROUGH_TOL_MM,
    };
}

function buildOperationBlocks(moves, events) {
    const opEvents = events.filter(ev => ev.type === 'op');
    if (!opEvents.length) return [];
    return opEvents.map((ev, idx) => {
        const start = clamp(ev.moveIdx, 0, Math.max(0, moves.length - 1));
        const end = clamp((opEvents[idx + 1]?.moveIdx ?? moves.length) - 1, start, Math.max(0, moves.length - 1));
        const slice = moves.slice(start, end + 1);
        const cat = getOpCat(ev.label);
        return {
            id: `${start}-${idx}`,
            start,
            end,
            label: ev.label || cat.label,
            cat,
            cutM: slice.filter(m => m.type !== 'G0').reduce((s, m) => s + moveDistance(m), 0) / 1000,
            moves: slice.length,
        };
    }).filter(op => op.moves > 0);
}

export default function GcodeSim3D({ gcode, chapa }) {
    const hostRef = useRef(null);
    const stateRef = useRef({});
    const [dims, setDims] = useState({ w: 900, h: 560 });
    const [seek, setSeek] = useState(-1);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(5);
    const [view, setView] = useState('iso');
    const [showRapids, setShowRapids] = useState(false);
    const [showPieces, setShowPieces] = useState(true);
    const [showMachining, setShowMachining] = useState(true);
    const [showLabels, setShowLabels] = useState(false);
    const [hiddenCats, setHiddenCats] = useState(new Set());

    const parsed = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const moves = parsed.moves;
    const events = parsed.events;
    const operationBlocks = useMemo(() => buildOperationBlocks(moves, events), [moves, events]);
    const zOrigin = useMemo(() => detectZOrigin(gcode || '', moves), [gcode, moves]);

    const sheet = useMemo(() => {
        const comprimento = Number(chapa?.comprimento || chapa?.w || 2750);
        const largura = Number(chapa?.largura || chapa?.h || 1850);
        const espessura = Number(chapa?.espessura || chapa?.espessura_real || 18);
        const refilo = Number(chapa?.refilo ?? 10);
        const unit = 1 / Math.max(comprimento, largura, 1) * 34;
        const toWorld = (x, y, z = 0) => ({
            x: (Number(x || 0) - comprimento / 2) * unit,
            y: Number(z || 0) * unit,
            z: (Number(y || 0) - largura / 2) * unit,
        });
        return { comprimento, largura, espessura, refilo, unit, toWorld };
    }, [chapa]);

    const stats = useMemo(() => {
        const cut = moves.filter(m => m.type !== 'G0');
        const rapids = moves.filter(m => m.type === 'G0' && !m.isZOnly);
        const outOfBounds = moves.filter(m => (
            Number(m.x2) < -1 || Number(m.y2) < -1 ||
            Number(m.x2) > sheet.comprimento + 1 || Number(m.y2) > sheet.largura + 1
        )).length;
        return {
            cutMoves: cut.length,
            rapidMoves: rapids.length,
            cutM: cut.reduce((s, m) => s + moveDistance(m), 0) / 1000,
            rapidM: rapids.reduce((s, m) => s + moveDistance(m), 0) / 1000,
            outOfBounds,
        };
    }, [moves, sheet.comprimento, sheet.largura]);

    const setCameraView = useCallback((preset = view) => {
        const { camera, controls } = stateRef.current;
        if (!camera || !controls) return;
        const maxD = Math.max(sheet.comprimento, sheet.largura) * sheet.unit;
        if (preset === 'topo') {
            camera.position.set(0, maxD * 1.45, 0.001);
            camera.up.set(0, 0, -1);
        } else if (preset === 'frente') {
            camera.position.set(0, maxD * 0.38, -maxD * 1.35);
            camera.up.set(0, 1, 0);
        } else {
            camera.position.set(maxD * 0.82, maxD * 0.62, maxD * 0.92);
            camera.up.set(0, 1, 0);
        }
        controls.target.set(0, sheet.espessura * sheet.unit * 0.4, 0);
        controls.update();
    }, [sheet.comprimento, sheet.espessura, sheet.largura, sheet.unit, view]);

    const renderScene = useCallback(() => {
        const { renderer, scene, camera } = stateRef.current;
        if (!renderer || !scene || !camera) return;
        renderer.render(scene, camera);
    }, []);

    const rebuildScene = useCallback(() => {
        const { scene } = stateRef.current;
        if (!scene) return;
        if (stateRef.current.modelGroup) {
            scene.remove(stateRef.current.modelGroup);
            disposeObject(stateRef.current.modelGroup);
        }
        const group = new THREE.Group();
        stateRef.current.modelGroup = group;
        scene.add(group);

        const su = sheet.unit;
        const sx = sheet.comprimento * su;
        const sz = sheet.largura * su;
        const realSy = Math.max(sheet.espessura * su, 0.18);
        // Exagero visual controlado: MDF de 15-18mm em escala real fica fino
        // demais na cena e parece uma tampa. Mantemos a geometria do G-code em
        // mm, mas damos volume visual para a chapa ler como bloco macico.
        const sy = Math.max(realSy, 0.46);
        const topY = sy;

        const sheetMesh = new THREE.Mesh(
            new THREE.BoxGeometry(sx, sy, sz),
            [
                new THREE.MeshStandardMaterial({ color: MDF.edge, roughness: 0.78 }),
                new THREE.MeshStandardMaterial({ color: MDF.edge, roughness: 0.78 }),
                new THREE.MeshStandardMaterial({ color: MDF.top, roughness: 0.82, side: THREE.DoubleSide }),
                new THREE.MeshStandardMaterial({ color: 0x8a622e, roughness: 0.88, side: THREE.DoubleSide }),
                new THREE.MeshStandardMaterial({ color: MDF.edge, roughness: 0.78 }),
                new THREE.MeshStandardMaterial({ color: MDF.edge, roughness: 0.78 }),
            ]
        );
        sheetMesh.position.y = sy / 2;
        group.add(sheetMesh);

        const bottomPanel = new THREE.Mesh(
            new THREE.PlaneGeometry(sx, sz),
            new THREE.MeshStandardMaterial({ color: 0x8a622e, roughness: 0.9, side: THREE.DoubleSide })
        );
        bottomPanel.rotation.x = -Math.PI / 2;
        bottomPanel.position.y = -0.002;
        bottomPanel.renderOrder = 2;
        group.add(bottomPanel);

        const sideBandMat = new THREE.MeshStandardMaterial({ color: 0x74501f, roughness: 0.86 });
        const sideBands = [
            { w: sx, d: 0.055, x: 0, z: -sz / 2 - 0.027 },
            { w: sx, d: 0.055, x: 0, z: sz / 2 + 0.027 },
            { w: 0.055, d: sz, x: -sx / 2 - 0.027, z: 0 },
            { w: 0.055, d: sz, x: sx / 2 + 0.027, z: 0 },
        ];
        sideBands.forEach(b => {
            const band = new THREE.Mesh(new THREE.BoxGeometry(b.w, sy, b.d), sideBandMat);
            band.position.set(b.x, sy / 2, b.z);
            band.renderOrder = 3;
            group.add(band);
        });

        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(sheetMesh.geometry),
            new THREE.LineBasicMaterial({ color: 0x4f3718, transparent: true, opacity: 0.72 })
        );
        edges.position.copy(sheetMesh.position);
        group.add(edges);

        const ref = sheet.refilo;
        if (ref > 0) {
            const refPts = [
                sheet.toWorld(ref, ref, topY / su + 0.08),
                sheet.toWorld(sheet.comprimento - ref, ref, topY / su + 0.08),
                sheet.toWorld(sheet.comprimento - ref, sheet.largura - ref, topY / su + 0.08),
                sheet.toWorld(ref, sheet.largura - ref, topY / su + 0.08),
                sheet.toWorld(ref, ref, topY / su + 0.08),
            ];
            const geo = new THREE.BufferGeometry().setFromPoints(refPts.map(p => new THREE.Vector3(p.x, p.y, p.z)));
            group.add(new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xa64718, dashSize: 0.22, gapSize: 0.14, transparent: true, opacity: 0.8 })));
            group.children[group.children.length - 1].computeLineDistances();
        }

        if (showPieces && chapa?.pecas?.length) {
            const colors = [0x5f7fad, 0x6b9b62, 0xb57f45, 0x8d70ad, 0xa5a35e, 0x4d9b9a, 0xaa6686];
            chapa.pecas.forEach((p, idx) => {
                const w = Number(p.w || p.comprimento || 0) * su;
                const h = Number(p.h || p.largura || 0) * su;
                if (!w || !h) return;
                const pos = sheet.toWorld(sheet.refilo + Number(p.x || 0) + Number(p.w || 0) / 2, sheet.refilo + Number(p.y || 0) + Number(p.h || 0) / 2, sheet.espessura + 0.12);
                const piece = new THREE.Mesh(
                    new THREE.BoxGeometry(w, 0.055, h),
                    new THREE.MeshStandardMaterial({ color: colors[idx % colors.length], transparent: true, opacity: 0.32, roughness: 0.7 })
                );
                piece.position.set(pos.x, pos.y, pos.z);
                group.add(piece);
                const outline = new THREE.LineSegments(
                    new THREE.EdgesGeometry(piece.geometry),
                    new THREE.LineBasicMaterial({ color: colors[idx % colors.length], transparent: true, opacity: 0.85 })
                );
                outline.position.copy(piece.position);
                group.add(outline);
                if (showLabels && (p.nome || p.desc || p.descricao)) {
                    const label = makeLabel(String(p.nome || p.desc || p.descricao).slice(0, 18));
                    label.position.set(pos.x, pos.y + 0.28, pos.z);
                    group.add(label);
                }
            });
        }

        if (chapa?.retalhos?.length) {
            chapa.retalhos.forEach(r => {
                const w = Number(r.w || 0) * su;
                const h = Number(r.h || 0) * su;
                if (!w || !h) return;
                const pos = sheet.toWorld(sheet.refilo + Number(r.x || 0) + Number(r.w || 0) / 2, sheet.refilo + Number(r.y || 0) + Number(r.h || 0) / 2, sheet.espessura + 0.16);
                const scrap = new THREE.Mesh(
                    new THREE.BoxGeometry(w, 0.04, h),
                    new THREE.MeshStandardMaterial({ color: 0x22a061, transparent: true, opacity: 0.16, roughness: 0.75 })
                );
                scrap.position.set(pos.x, pos.y, pos.z);
                group.add(scrap);
                const outline = new THREE.LineSegments(
                    new THREE.EdgesGeometry(scrap.geometry),
                    new THREE.LineBasicMaterial({ color: 0x178048, transparent: true, opacity: 0.8 })
                );
                outline.position.copy(scrap.position);
                group.add(outline);
            });
        }

        // In simulation mode the initial state must be a full, uncut sheet.
        // The final/vazado appearance is built progressively as executed moves
        // are included by the seek/playhead.
        const limit = seek < 0 ? 0 : Math.min(seek + 1, moves.length);
        let toolDiam = 6;
        const toolByMove = new Map();
        for (const ev of events) {
            if (ev.type === 'tool') toolDiam = getToolDiameterFromName(ev.label || '');
            toolByMove.set(ev.moveIdx, toolDiam);
        }
        toolDiam = 6;

        const addLine = (m, color, width = 1, opacity = 1, yLift = 0.24) => {
            const p1 = sheet.toWorld(m.x1, m.y1, sheet.espessura + yLift);
            const p2 = sheet.toWorld(m.x2, m.y2, sheet.espessura + yLift);
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(p1.x, p1.y, p1.z),
                new THREE.Vector3(p2.x, p2.y, p2.z),
            ]);
            const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: width });
            const line = new THREE.Line(geo, mat);
            group.add(line);
            return line;
        };

        const addKerfSegment = ({ x1, y1, x2, y2, width, color = VOID_COLOR, opacity = 1 }) => {
            const distMm = Math.hypot(Number(x2 || 0) - Number(x1 || 0), Number(y2 || 0) - Number(y1 || 0));
            const dist = distMm * su;
            if (dist <= 0.02) return;
            const p1 = sheet.toWorld(x1, y1, sheet.espessura * 0.5);
            const p2 = sheet.toWorld(x2, y2, sheet.espessura * 0.5);
            const mid = new THREE.Vector3((p1.x + p2.x) / 2, sy / 2, (p1.z + p2.z) / 2);
            const dir = new THREE.Vector3(p2.x - p1.x, 0, p2.z - p1.z).normalize();
            const normal = new THREE.Vector3(-dir.z, 0, dir.x);
            const angle = -Math.atan2(dir.z, dir.x);
            const kerfW = Math.max(width * su, 0.045);
            const wallW = Math.max(0.012, kerfW * 0.16);

            const voidMesh = new THREE.Mesh(
                new THREE.BoxGeometry(dist, sy + 0.13, kerfW),
                new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
            );
            voidMesh.position.copy(mid);
            voidMesh.rotation.y = angle;
            voidMesh.renderOrder = 5;
            group.add(voidMesh);

            const leftWall = new THREE.Mesh(
                new THREE.BoxGeometry(dist, sy + 0.08, wallW),
                new THREE.MeshStandardMaterial({ color: 0xd6ad62, roughness: 0.76 })
            );
            leftWall.position.set(mid.x + normal.x * kerfW * 0.54, sy / 2, mid.z + normal.z * kerfW * 0.54);
            leftWall.rotation.y = angle;
            leftWall.renderOrder = 6;
            group.add(leftWall);

            const rightWall = new THREE.Mesh(
                new THREE.BoxGeometry(dist, sy + 0.08, wallW),
                new THREE.MeshStandardMaterial({ color: 0x4a2c15, roughness: 0.9 })
            );
            rightWall.position.set(mid.x - normal.x * kerfW * 0.54, sy / 2, mid.z - normal.z * kerfW * 0.54);
            rightWall.rotation.y = angle;
            rightWall.renderOrder = 6;
            group.add(rightWall);

        };

        const addCarvedHole = ({ cx, cy, diam, depthInfo, opColor }) => {
            const pos = sheet.toWorld(cx, cy, sheet.espessura + 0.045);
            const radius = Math.max((Number(diam || 6) / 2) * su, 0.045);
            const depthRatio = clamp(depthInfo?.ratio || 0.25, 0.08, 1);
            const isThrough = Boolean(depthInfo?.through);
            const dark = isThrough ? VOID_COLOR : 0x5b351a;
            const pocketVisualDepth = Math.max(0.028, sy * (0.04 + depthRatio * 0.12));

            // Dark exposed MDF bottom. This is intentionally opaque and warm,
            // so it reads as removed material instead of colored paint.
            const bottom = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, isThrough ? sy + 0.12 : pocketVisualDepth, 42),
                isThrough
                    ? new THREE.MeshBasicMaterial({ color: dark })
                    : new THREE.MeshStandardMaterial({ color: dark, roughness: 0.92, metalness: 0.0 })
            );
            bottom.position.set(pos.x, isThrough ? sy / 2 : sy + 0.026 - pocketVisualDepth * 0.22, pos.z);
            bottom.renderOrder = isThrough ? 5 : 0;
            group.add(bottom);

            const shadow = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, 0.018, 42),
                new THREE.MeshBasicMaterial({ color: 0x1f140b, transparent: true, opacity: 0.26 })
            );
            shadow.position.set(pos.x + radius * 0.10, sy + 0.031, pos.z - radius * 0.08);
            group.add(shadow);

            const rim = new THREE.Mesh(
                new THREE.TorusGeometry(radius, Math.max(0.012, radius * 0.12), 10, 42),
                new THREE.MeshStandardMaterial({ color: 0xd6ad62, roughness: 0.74, metalness: 0.0 })
            );
            rim.rotation.x = Math.PI / 2;
            rim.position.set(pos.x, sy + 0.052, pos.z);
            group.add(rim);

            const innerShadow = new THREE.Mesh(
                new THREE.TorusGeometry(radius * 0.78, Math.max(0.007, radius * 0.055), 8, 36),
                new THREE.MeshBasicMaterial({ color: 0x22150c, transparent: true, opacity: 0.55 })
            );
            innerShadow.rotation.x = Math.PI / 2;
            innerShadow.position.set(pos.x, sy + 0.061, pos.z);
            group.add(innerShadow);

            const opRing = new THREE.Mesh(
                new THREE.TorusGeometry(radius * 1.12, Math.max(0.006, radius * 0.04), 8, 42),
                new THREE.MeshBasicMaterial({ color: opColor, transparent: true, opacity: 0.85 })
            );
            opRing.rotation.x = Math.PI / 2;
            opRing.position.set(pos.x, sy + 0.072, pos.z);
            group.add(opRing);
        };

        const addCarvedGroove = (m, opColor, diam, depthInfo) => {
            const dist = moveDistance(m) * su;
            if (dist <= 0.02) return;
            const p1 = sheet.toWorld(m.x1, m.y1, sheet.espessura + 0.04);
            const p2 = sheet.toWorld(m.x2, m.y2, sheet.espessura + 0.04);
            const mid = new THREE.Vector3((p1.x + p2.x) / 2, sy + 0.035, (p1.z + p2.z) / 2);
            const dir = new THREE.Vector3(p2.x - p1.x, 0, p2.z - p1.z).normalize();
            const normal = new THREE.Vector3(-dir.z, 0, dir.x);
            const angle = -Math.atan2(dir.z, dir.x);
            const depthRatio = clamp(depthInfo?.ratio || 0.22, 0.06, 1);
            const channelW = Math.max(Number(diam || 6) * su * 0.88, 0.055);
            const floorW = channelW * 0.72;
            const edgeW = Math.max(0.012, channelW * 0.12);
            const isThrough = Boolean(depthInfo?.through);
            const grooveVisualDepth = Math.max(0.022, sy * (0.035 + depthRatio * 0.10));

            if (isThrough) {
                addKerfSegment({
                    x1: m.x1,
                    y1: m.y1,
                    x2: m.x2,
                    y2: m.y2,
                    width: Math.max(Number(diam || 6), Number(chapa?.kerf || 4)),
                });
                const stripe = new THREE.Mesh(
                    new THREE.BoxGeometry(dist, Math.max(0.010, sy * 0.016), Math.max(0.010, channelW * 0.10)),
                    new THREE.MeshBasicMaterial({ color: opColor, transparent: true, opacity: 0.72 })
                );
                stripe.position.set(mid.x, sy + 0.090, mid.z);
                stripe.rotation.y = angle;
                group.add(stripe);
                return;
            }

            const floor = new THREE.Mesh(
                new THREE.BoxGeometry(dist, grooveVisualDepth, floorW),
                new THREE.MeshStandardMaterial({
                    color: isThrough ? 0x2f1d10 : 0x5b351a,
                    roughness: 0.94,
                    metalness: 0,
                })
            );
            floor.position.set(mid.x, mid.y - grooveVisualDepth * 0.18, mid.z);
            floor.rotation.y = angle;
            group.add(floor);

            const shadow = new THREE.Mesh(
                new THREE.BoxGeometry(dist, Math.max(0.018, sy * 0.028), channelW * 0.94),
                new THREE.MeshBasicMaterial({ color: 0x21150b, transparent: true, opacity: isThrough ? 0.34 : 0.22 })
            );
            shadow.position.set(mid.x + normal.x * channelW * 0.08, sy + 0.048, mid.z + normal.z * channelW * 0.08);
            shadow.rotation.y = angle;
            group.add(shadow);

            const litEdge = new THREE.Mesh(
                new THREE.BoxGeometry(dist, Math.max(0.030, sy * 0.045), edgeW),
                new THREE.MeshStandardMaterial({ color: 0xe8c77a, roughness: 0.72 })
            );
            litEdge.position.set(mid.x + normal.x * channelW * 0.50, sy + 0.070, mid.z + normal.z * channelW * 0.50);
            litEdge.rotation.y = angle;
            group.add(litEdge);

            const darkEdge = new THREE.Mesh(
                new THREE.BoxGeometry(dist, Math.max(0.026, sy * 0.040), edgeW),
                new THREE.MeshStandardMaterial({ color: 0x3b2513, roughness: 0.88 })
            );
            darkEdge.position.set(mid.x - normal.x * channelW * 0.50, sy + 0.062, mid.z - normal.z * channelW * 0.50);
            darkEdge.rotation.y = angle;
            group.add(darkEdge);

            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(dist, Math.max(0.010, sy * 0.016), Math.max(0.010, channelW * 0.10)),
                new THREE.MeshBasicMaterial({ color: opColor, transparent: true, opacity: 0.88 })
            );
            stripe.position.set(mid.x, sy + 0.086, mid.z);
            stripe.rotation.y = angle;
            group.add(stripe);
        };

        if (showMachining) {
            for (let i = 0; i < limit; i++) {
                const m = moves[i];
                if (toolByMove.has(i)) toolDiam = toolByMove.get(i);
                if (m.type === 'G0') {
                    if (showRapids && !m.isZOnly) {
                        const line = addLine(m, 0x8a7050, 1, 0.34, 0.36);
                        line.material.depthTest = false;
                    }
                    continue;
                }
                const cat = getOpCat(m.op || '');
                if (hiddenCats.has(cat.key)) continue;
                const color = hexToThree(cat.glow || cat.color);
                const depthInfo = moveDepthInfo(m, sheet.espessura, zOrigin);

                if (m.isZOnly || m.isHelicalHole) {
                    const cx = m.isHelicalHole ? m.holeCx : m.x2;
                    const cy = m.isHelicalHole ? m.holeCy : m.y2;
                    const diam = m.isHelicalHole ? m.holeDiam : toolDiam;
                    addCarvedHole({ cx, cy, diam, depthInfo, opColor: color });
                    continue;
                }

                if (depthInfo.ratio > 0.02) {
                    addCarvedGroove(m, color, toolDiam, depthInfo);
                } else {
                    addLine(m, color, 1, 0.42, 0.18);
                }
            }
        }

        if (moves.length) {
            const cur = seek >= 0 ? moves[Math.min(seek, moves.length - 1)] : moves[0];
            const p = sheet.toWorld(cur.x2, cur.y2, sheet.espessura + 1.5);
            const tool = new THREE.Group();
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(0.12, 0.55, 28),
                new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.25 })
            );
            cone.rotation.x = Math.PI;
            cone.position.y = -0.20;
            tool.add(cone);
            const tip = new THREE.Mesh(
                new THREE.SphereGeometry(0.07, 24, 16),
                new THREE.MeshBasicMaterial({ color: cur.type === 'G0' ? 0x2563eb : hexToThree(getOpCat(cur.op).glow) })
            );
            tip.position.y = -0.52;
            tool.add(tip);
            tool.position.set(p.x, p.y, p.z);
            group.add(tool);
        }

        const origin = sheet.toWorld(0, 0, sheet.espessura + 0.28);
        const xEnd = sheet.toWorld(Math.min(300, sheet.comprimento * 0.16), 0, sheet.espessura + 0.28);
        const yEnd = sheet.toWorld(0, Math.min(300, sheet.largura * 0.16), sheet.espessura + 0.28);
        group.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshBasicMaterial({ color: 0x3f2a14 })));
        group.children[group.children.length - 1].position.set(origin.x, origin.y, origin.z);
        addLine({ x1: 0, y1: 0, x2: Math.min(300, sheet.comprimento * 0.16), y2: 0 }, 0xe03030, 2, 1, 0.28);
        addLine({ x1: 0, y1: 0, x2: 0, y2: Math.min(300, sheet.largura * 0.16) }, 0x30a030, 2, 1, 0.28);
        const xLabel = makeLabel('X', '#e03030');
        xLabel.position.set(xEnd.x + 0.35, xEnd.y, xEnd.z);
        group.add(xLabel);
        const yLabel = makeLabel('Y', '#30a030');
        yLabel.position.set(yEnd.x, yEnd.y, yEnd.z + 0.35);
        group.add(yLabel);
        const oLabel = makeLabel('0,0', '#5b4630');
        oLabel.scale.set(1.1, 0.28, 1);
        oLabel.position.set(origin.x + 0.45, origin.y, origin.z + 0.38);
        group.add(oLabel);

        renderScene();
    }, [chapa, events, hiddenCats, moves, renderScene, seek, sheet, showLabels, showMachining, showPieces, showRapids, zOrigin]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const ro = new ResizeObserver(entries => {
            const w = Math.max(420, Math.round(entries[0].contentRect.width));
            setDims({ w, h: Math.max(430, Math.min(650, Math.round(w * 0.62))) });
        });
        ro.observe(host);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = '';

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf4f1ea);
        const camera = new THREE.PerspectiveCamera(34, dims.w / dims.h, 0.05, 200);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(dims.w, dims.h);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = false;
        host.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.screenSpacePanning = true;
        controls.minDistance = 4;
        controls.maxDistance = 80;
        controls.addEventListener('change', renderScene);

        scene.add(new THREE.HemisphereLight(0xffffff, 0xd7c6aa, 1.35));
        const key = new THREE.DirectionalLight(0xfff3df, 1.15);
        key.position.set(16, 24, 18);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xbfd7ff, 0.45);
        fill.position.set(-18, 12, -16);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffffff, 0.55);
        rim.position.set(-10, 6, 22);
        scene.add(rim);

        const grid = new THREE.GridHelper(42, 14, 0xc8b89e, 0xdad0c1);
        grid.position.y = -0.02;
        scene.add(grid);

        stateRef.current = { scene, camera, renderer, controls };
        setCameraView(view);

        let frame = 0;
        const tick = () => {
            frame = requestAnimationFrame(tick);
            controls.update();
            renderer.render(scene, camera);
        };
        tick();

        return () => {
            cancelAnimationFrame(frame);
            controls.dispose();
            renderer.dispose();
            disposeObject(scene);
            if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
            stateRef.current = {};
        };
    }, [dims.h, dims.w, renderScene, setCameraView, view]);

    useEffect(() => {
        const { renderer, camera } = stateRef.current;
        if (!renderer || !camera) return;
        camera.aspect = dims.w / dims.h;
        camera.updateProjectionMatrix();
        renderer.setSize(dims.w, dims.h);
        setCameraView(view);
        rebuildScene();
    }, [dims, rebuildScene, setCameraView, view]);

    useEffect(() => { rebuildScene(); }, [rebuildScene]);

    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        let last = performance.now();
        const step = (now) => {
            if (now - last > Math.max(12, 140 / speed)) {
                last = now;
                setSeek(prev => {
                    const next = prev < 0 ? 0 : prev + 1;
                    if (next >= moves.length) {
                        setPlaying(false);
                        return Math.max(0, moves.length - 1);
                    }
                    return next;
                });
            }
            frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [moves.length, playing, speed]);

    const currentMove = seek >= 0 ? moves[Math.min(seek, moves.length - 1)] : null;
    const activeOp = currentMove?.op || 'Visão geral';
    const activeCat = getOpCat(activeOp);
    const currentDepthInfo = currentMove ? moveDepthInfo(currentMove, sheet.espessura, zOrigin) : null;

    const toggleCat = (key) => {
        setHiddenCats(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const controlsBtn = (active) => ({
        border: `1px solid ${active ? '#2563eb' : '#d7cbbb'}`,
        background: active ? '#2563eb' : '#fffaf2',
        color: active ? '#fff' : '#3f3426',
        borderRadius: 7,
        padding: '6px 9px',
        fontSize: 11,
        fontWeight: 800,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    });

    return (
        <div style={{ background: '#f4f1ea', border: '1px solid #ded6ca', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 280px',
                minHeight: 0,
            }}>
                <div ref={hostRef} style={{ position: 'relative', minHeight: dims.h, background: '#f4f1ea' }}>
                    <div style={{
                        position: 'absolute',
                        left: 12,
                        top: 12,
                        padding: '7px 10px',
                        borderRadius: 8,
                        background: 'rgba(255,250,242,0.92)',
                        border: '1px solid rgba(120,100,75,0.18)',
                        boxShadow: '0 8px 22px rgba(70,50,25,0.12)',
                        fontSize: 11,
                        color: '#5f4931',
                        fontWeight: 800,
                        pointerEvents: 'none',
                    }}>
                        Origem 0,0 no canto inferior esquerdo
                    </div>
                    {stats.outOfBounds > 0 && (
                        <div style={{
                            position: 'absolute',
                            left: 12,
                            bottom: 12,
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'var(--danger-bg)',
                            border: '1px solid var(--danger-border)',
                            color: 'var(--danger)',
                            fontSize: 11,
                            fontWeight: 850,
                        }}>
                            {stats.outOfBounds} movimento(s) fora da chapa
                        </div>
                    )}
                </div>

                <aside style={{
                    borderLeft: '1px solid #ded6ca',
                    background: '#fbf8f2',
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    minHeight: dims.h,
                    maxHeight: dims.h,
                    overflowY: 'auto',
                }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#2f2a24' }}>Simulação 3D técnica</div>
                        <div style={{ fontSize: 10, color: '#8a8176', marginTop: 2 }}>
                            Chapa {sheet.espessura.toFixed(1)}mm · Z0 {zOrigin === 'material' ? 'topo do material' : 'mesa'}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                        <_Metric label="Corte" value={`${stats.cutM.toFixed(1)}m`} tone="#15803d" />
                        <_Metric label="Rápido" value={`${stats.rapidM.toFixed(1)}m`} tone="#c2410c" />
                        <_Metric label="Mov." value={seek >= 0 ? `${seek + 1}/${moves.length}` : moves.length} tone="#2563eb" />
                        <_Metric label="Etapas" value={operationBlocks.length} tone="#7c3aed" />
                        <_Metric label="Esp." value={`${sheet.espessura.toFixed(1)}mm`} tone="#7a5425" />
                        <_Metric label="Z0" value={zOrigin === 'material' ? 'Topo' : 'Mesa'} tone="#4d6b8f" />
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {!playing
                            ? <button onClick={() => { setSeek(s => s < 0 ? 0 : s); setPlaying(true); }} style={controlsBtn(true)}>Reproduzir</button>
                            : <button onClick={() => setPlaying(false)} style={controlsBtn(true)}>Pausar</button>
                        }
                        <button onClick={() => { setPlaying(false); setSeek(-1); }} style={controlsBtn(false)}>Reset</button>
                        <select value={speed} onChange={e => setSpeed(Number(e.target.value))} style={controlsBtn(false)}>
                            {[1, 2, 5, 10, 20, 50].map(v => <option key={v} value={v}>{v}x</option>)}
                        </select>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={Math.max(0, moves.length - 1)}
                        value={seek < 0 ? 0 : seek}
                        onChange={e => { setPlaying(false); setSeek(Number(e.target.value)); }}
                        style={{ width: '100%', accentColor: '#2563eb' }}
                    />

                    <div style={{ padding: 10, border: '1px solid #ded6ca', borderRadius: 8, background: '#fffaf2' }}>
                        <div style={{ fontSize: 9, color: '#8a8176', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Operação atual</div>
                        <div style={{ fontSize: 12, fontWeight: 850, color: activeCat.glow || '#2f2a24', lineHeight: 1.35 }}>{activeOp}</div>
                        {currentMove && (
                            <div style={{ marginTop: 6, fontSize: 10, color: '#8a8176', fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
                                {currentMove.type} X{currentMove.x2.toFixed(1)} Y{currentMove.y2.toFixed(1)} Z{currentMove.z2.toFixed(2)}
                                {currentMove.type !== 'G0' && currentDepthInfo && (
                                    <span> · prof {currentDepthInfo.depthMm.toFixed(1)}mm {currentDepthInfo.through ? '· vazado' : '· parcial'}</span>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {Object.entries(VIEW_PRESETS).map(([key, label]) => (
                            <button key={key} onClick={() => { setView(key); setCameraView(key); }} style={controlsBtn(view === key)}>
                                {label}
                            </button>
                        ))}
                    </div>

                    <div style={{ padding: 10, border: '1px solid #ded6ca', borderRadius: 8, background: '#fffaf2' }}>
                        <div style={{ fontSize: 9, color: '#8a8176', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Camadas</div>
                        <_LayerToggle label="Peças" active={showPieces} onClick={() => setShowPieces(v => !v)} color="#5f7fad" />
                        <_LayerToggle label="Usinagens" active={showMachining} onClick={() => setShowMachining(v => !v)} color="#2563eb" />
                        <_LayerToggle label="Rápidos" active={showRapids} onClick={() => setShowRapids(v => !v)} color="#8a7050" dashed />
                        <_LayerToggle label="Rótulos" active={showLabels} onClick={() => setShowLabels(v => !v)} color="#5f4931" />
                    </div>

                    <div style={{ padding: 10, border: '1px solid #ded6ca', borderRadius: 8, background: '#fffaf2' }}>
                        <div style={{ fontSize: 9, color: '#8a8176', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Tipos de operação</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {OP_CATS.map(cat => (
                                <button key={cat.key} onClick={() => toggleCat(cat.key)} style={{
                                    padding: '4px 7px',
                                    borderRadius: 999,
                                    border: `1px solid ${cat.glow}`,
                                    background: hiddenCats.has(cat.key) ? '#f7f1e8' : `${cat.glow}22`,
                                    color: hiddenCats.has(cat.key) ? '#9a8f83' : cat.color,
                                    fontSize: 10,
                                    fontWeight: 850,
                                    cursor: 'pointer',
                                    textDecoration: hiddenCats.has(cat.key) ? 'line-through' : 'none',
                                }}>
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {operationBlocks.length > 0 && (
                        <div style={{ padding: 10, border: '1px solid #ded6ca', borderRadius: 8, background: '#fffaf2' }}>
                            <div style={{ fontSize: 9, color: '#8a8176', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sequência</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 170, overflowY: 'auto' }}>
                                {operationBlocks.map((op, idx) => {
                                    const active = seek >= op.start && seek <= op.end;
                                    return (
                                        <button key={op.id} onClick={() => { setPlaying(false); setSeek(op.start); }} style={{
                                            display: 'grid',
                                            gridTemplateColumns: '18px minmax(0,1fr) auto',
                                            gap: 7,
                                            alignItems: 'center',
                                            padding: '6px 7px',
                                            borderRadius: 7,
                                            border: `1px solid ${active ? op.cat.glow : '#eadfce'}`,
                                            background: active ? `${op.cat.glow}18` : '#fbf8f2',
                                            cursor: 'pointer',
                                            color: '#2f2a24',
                                            textAlign: 'left',
                                        }}>
                                            <span style={{ width: 16, height: 16, borderRadius: 99, background: op.cat.glow, color: '#fff', fontSize: 8, fontWeight: 900, display: 'grid', placeItems: 'center' }}>{idx + 1}</span>
                                            <span style={{ fontSize: 10, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.label}</span>
                                            <span style={{ fontSize: 9, color: '#6b5f52', fontFamily: 'monospace' }}>{op.cutM.toFixed(1)}m</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}

function _Metric({ label, value, tone }) {
    return (
        <div style={{ padding: '8px 9px', border: '1px solid #ded6ca', borderRadius: 8, background: '#fffaf2', minWidth: 0 }}>
            <div style={{ color: tone, fontSize: 15, fontWeight: 900, lineHeight: 1, fontFamily: 'JetBrains Mono, Consolas, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
            <div style={{ color: '#8a8176', fontSize: 8, fontWeight: 850, textTransform: 'uppercase', marginTop: 5 }}>{label}</div>
        </div>
    );
}

function _LayerToggle({ label, active, onClick, color, dashed }) {
    return (
        <button onClick={onClick} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            width: '100%',
            padding: '7px 8px',
            borderRadius: 7,
            border: '1px solid #eadfce',
            background: active ? '#fbf8f2' : '#f7f1e8',
            color: active ? '#2f2a24' : '#9a8f83',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 800,
            marginBottom: 5,
            textAlign: 'left',
        }}>
            <span style={{
                width: 18,
                height: dashed ? 0 : 8,
                borderRadius: 99,
                borderTop: dashed ? `2px dashed ${color}` : 'none',
                background: dashed ? 'transparent' : color,
                opacity: active ? 1 : 0.35,
                flexShrink: 0,
            }} />
            {label}
        </button>
    );
}
