import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getMatColor, hexToThreeColor } from '../utils/matColors';

// ─── Parser (compartilhado com GcodeSimCanvas) ──────────────────────────────
function parseGcodeForSim(text) {
    const moves = [];
    const events = [];
    const contours = []; // Track per-piece contour ranges
    let x = 0, y = 0, z = 0, mode = 'G0';
    let curTool = '', curOp = '';
    let curContour = null;
    for (const raw of text.split('\n')) {
        const cmtMatch = raw.match(/[;(]\s*(.+?)\s*\)?$/);
        const comment = cmtMatch ? cmtMatch[1] : '';
        if (/troca|ferramenta|tool/i.test(comment)) {
            curTool = comment.replace(/^(Troca:\s*|Ferramenta:\s*|Tool:\s*)/i, '').trim();
            events.push({ moveIdx: moves.length, type: 'tool', label: curTool });
        }
        // Detect contour comments: "; Contorno: PieceName (Module)"
        const contourMatch = comment.match(/Contorno:\s*(.+?)(?:\s*\(|$)/);
        if (contourMatch) {
            // Close previous contour
            if (curContour) {
                curContour.endMoveIdx = moves.length - 1;
                if (curContour.endMoveIdx >= curContour.startMoveIdx) contours.push(curContour);
            }
            curContour = { name: contourMatch[1].trim(), startMoveIdx: moves.length, endMoveIdx: -1 };
        }
        if (/===|contorno|furo|rebaixo|canal|pocket|usinagem/i.test(comment) && !/troca|ferramenta/i.test(comment)) {
            curOp = comment.replace(/^=+\s*|\s*=+$/g, '').trim();
            events.push({ moveIdx: moves.length, type: 'op', label: curOp });
        }
        if (/M3\b|M03\b/i.test(raw) && !/M30/i.test(raw))
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle ON' });
        if (/M5\b|M05\b/i.test(raw))
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle OFF' });
        const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
        if (!line) continue;
        const cmd = line.replace(/^N\d+\s*/, '');
        const gMatch = cmd.match(/G([0-3])\b/i);
        if (gMatch) mode = `G${gMatch[1]}`;
        const xM = cmd.match(/X([+-]?[\d.]+)/i), yM = cmd.match(/Y([+-]?[\d.]+)/i), zM = cmd.match(/Z([+-]?[\d.]+)/i);
        const newX = xM ? parseFloat(xM[1]) : x, newY = yM ? parseFloat(yM[1]) : y, newZ = zM ? parseFloat(zM[1]) : z;
        if (xM || yM) moves.push({ type: mode, x1: x, y1: y, z1: z, x2: newX, y2: newY, z2: newZ, tool: curTool, op: curOp });
        x = newX; y = newY; z = newZ;
    }
    // Close last contour
    if (curContour) {
        curContour.endMoveIdx = moves.length - 1;
        if (curContour.endMoveIdx >= curContour.startMoveIdx) contours.push(curContour);
    }
    return { moves, events, contours };
}

// ─── Text sprite via CanvasTexture ──────────────────────────────────────────
function createTextSprite(text, maxW, maxD, scaleRef) {
    const canvas = document.createElement('canvas');
    const sz = 256;
    canvas.width = sz; canvas.height = sz;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, sz, sz);

    // Background pill
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const tw = Math.min(ctx.measureText(text).width + 30, sz - 10);
    ctx.beginPath();
    ctx.roundRect((sz - tw) / 2, sz / 2 - 18, tw, 36, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 80, 160, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#1a3050';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let display = text;
    while (ctx.measureText(display).width > sz - 30 && display.length > 3) display = display.slice(0, -1);
    ctx.fillText(display, sz / 2, sz / 2);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    const scale = Math.min(maxW, maxD) * 0.6;
    sprite.scale.set(scale, scale, 1);
    return sprite;
}

// ─── Z-scale config ─────────────────────────────────────────────────────────
// Real 18.5mm in 2750mm sheet = 0.67% - invisible. We exaggerate Z by this factor.
const Z_SCALE = 8;

// ─── CNC Feed Rates (mm/min) ────────────────────────────────────────────────
const RAPID_FEED = 40000;   // G0 rapid traverse ~40m/min
const CUT_FEED   = 6000;    // G1 default cut feed ~6m/min
const PLUNGE_FEED = 2000;   // Z-only plunge ~2m/min
const TOOL_CHANGE_TIME = 8; // seconds per tool change

function computeMoveTimes(moves, events) {
    const times = []; // seconds per move
    let totalTime = 0;
    let lastToolIdx = -1;
    for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        // Check for tool change at this move
        for (const ev of events) {
            if (ev.moveIdx === i && ev.type === 'tool' && lastToolIdx !== -1) {
                totalTime += TOOL_CHANGE_TIME;
            }
            if (ev.moveIdx === i && ev.type === 'tool') lastToolIdx = i;
        }
        const dx = m.x2 - m.x1, dy = m.y2 - m.y1, dz = m.z2 - m.z1;
        const distXY = Math.sqrt(dx * dx + dy * dy);
        const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

        let feed;
        if (m.type === 'G0') {
            feed = RAPID_FEED;
        } else if (distXY < 0.1 && Math.abs(dz) > 0.1) {
            // Pure plunge move
            feed = PLUNGE_FEED;
        } else {
            feed = CUT_FEED;
        }
        const t = dist3D > 0 ? (dist3D / feed) * 60 : 0; // seconds
        times.push(t);
        totalTime += t;
    }
    return { times, totalTime };
}

function formatTime(secs) {
    if (secs < 0) secs = 0;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Tool diameter from name ────────────────────────────────────────────────
function getToolDiameterFromName(name) {
    const m = name.match(/(\d+)\s*mm/i);
    return m ? parseInt(m[1]) : 6; // default 6mm
}

// ─── Paint groove on canvas — dramatic real kerf cut ────────────────────────
function paintGrooveMove(ctx, move, canvasW, canvasH, sheetW, sheetH, toolDiam) {
    if (move.type === 'G0') return;
    if (move.z2 >= -0.1) return; // not cutting

    const scX = canvasW / sheetW;
    const scY = canvasH / sheetH;
    // Tool kerf width + extra margin for visual impact
    const lw = Math.max((toolDiam + 2) * scX, 4);

    const depth = Math.abs(move.z2);
    const maxDepth = 20;
    const depthRatio = Math.min(depth / maxDepth, 1.0);

    // Layer 1: Outer glow — sawdust/burn edges
    ctx.strokeStyle = `rgba(80, 50, 20, ${0.3 + depthRatio * 0.3})`;
    ctx.lineWidth = lw * 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(move.x1 * scX, move.y1 * scY);
    ctx.lineTo(move.x2 * scX, move.y2 * scY);
    ctx.stroke();

    // Layer 2: Main kerf — dark cut through material
    ctx.strokeStyle = `rgba(20, 10, 5, ${0.8 + depthRatio * 0.2})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(move.x1 * scX, move.y1 * scY);
    ctx.lineTo(move.x2 * scX, move.y2 * scY);
    ctx.stroke();

    // Layer 3: Inner void — pure black center (looking through the cut)
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.7 + depthRatio * 0.3})`;
    ctx.lineWidth = lw * 0.55;
    ctx.beginPath();
    ctx.moveTo(move.x1 * scX, move.y1 * scY);
    ctx.lineTo(move.x2 * scX, move.y2 * scY);
    ctx.stroke();
}

// ─── Simulador 3D ───────────────────────────────────────────────────────────
export default function GcodeSim3D({ gcode, chapa }) {
    const containerRef = useRef(null);
    const threeRef = useRef(null);

    // Animacao
    const [playing, setPlaying] = useState(false);
    const [curMove, setCurMove] = useState(-1);
    const [speed, setSpeed] = useState(1);
    const [simMode, setSimMode] = useState('usinagem'); // 'trajetoria' | 'usinagem'

    const parsed = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const allMoves = parsed.moves;
    const allEvents = parsed.events;
    const allContours = parsed.contours;

    const { times: moveTimes, totalTime: estimatedTime } = useMemo(
        () => computeMoveTimes(allMoves, allEvents), [allMoves, allEvents]
    );

    // Cumulative time at each move (for elapsed display)
    const cumulativeTime = useMemo(() => {
        const cum = [];
        let t = 0;
        for (let i = 0; i < moveTimes.length; i++) {
            t += moveTimes[i];
            cum.push(t);
        }
        return cum;
    }, [moveTimes]);

    const getActiveEventsAt = useCallback((moveIdx) => {
        let tool = '', op = '';
        for (const ev of allEvents) {
            if (ev.moveIdx > moveIdx && moveIdx >= 0) break;
            if (ev.type === 'tool') tool = ev.label;
            if (ev.type === 'op') op = ev.label;
        }
        return { tool, op };
    }, [allEvents]);

    const toolColors = useMemo(() => {
        const colors = ['#e6b800', '#ff6b35', '#00b894', '#0984e3', '#d63031', '#6c5ce7', '#00cec9'];
        const map = {};
        let ci = 0;
        for (const ev of allEvents) {
            if (ev.type === 'tool' && !map[ev.label]) {
                map[ev.label] = colors[ci % colors.length];
                ci++;
            }
        }
        return map;
    }, [allEvents]);

    // Tool diameter at each move (for groove width)
    const moveToolDiams = useMemo(() => {
        const diams = [];
        let curDiam = 6;
        for (let i = 0; i < allMoves.length; i++) {
            for (const ev of allEvents) {
                if (ev.moveIdx === i && ev.type === 'tool') {
                    curDiam = getToolDiameterFromName(ev.label);
                }
            }
            diams.push(curDiam);
        }
        return diams;
    }, [allMoves, allEvents]);

    // ─── Build scene ────────────────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el || !gcode) return;

        const W = 760, H = 500;
        const cw = chapa?.comprimento || 2750;
        const cl = chapa?.largura || 1850;
        const espReal = chapa?.espessura || 18.5;
        const esp = espReal * Z_SCALE; // exaggerated thickness
        const ref = chapa?.refilo || 10;
        const maxDim = Math.max(cw, cl);

        // ── Renderer ─────────────────────────────────────────────────────
        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(W, H);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0xd0d4db);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.3;
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.borderRadius = '8px 8px 0 0';
        el.appendChild(renderer.domElement);

        // ── Scene ────────────────────────────────────────────────────────
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0xd0d4db, 0.00008);

        // ── Camera — lower angle to emphasize thickness ──────────────────
        const camera = new THREE.PerspectiveCamera(40, W / H, 1, maxDim * 6);
        // Position: front-right-above, looking at center, low angle to show side
        camera.position.set(cw * 1.1, maxDim * 0.45, cl * 1.3);
        camera.lookAt(cw / 2, 0, cl / 2);

        // ── Controls ─────────────────────────────────────────────────────
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(cw / 2, 0, cl / 2);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 300;
        controls.maxDistance = maxDim * 4;
        controls.maxPolarAngle = Math.PI / 2.02;
        controls.update();

        // ── Lighting — bright industrial ─────────────────────────────────
        // Strong ambient — well-lit factory
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));

        // Key light — bright overhead fluorescent feel
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(cw * 0.6, maxDim * 0.9, -cl * 0.2);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        const ss = maxDim;
        keyLight.shadow.camera.left = -ss; keyLight.shadow.camera.right = ss;
        keyLight.shadow.camera.top = ss; keyLight.shadow.camera.bottom = -ss;
        keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = maxDim * 4;
        keyLight.shadow.bias = -0.001;
        scene.add(keyLight);

        // Fill light — warm, opposite side
        const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
        fillLight.position.set(-cw * 0.5, maxDim * 0.4, cl * 0.8);
        scene.add(fillLight);

        // Back light — subtle edge definition
        const rimLight = new THREE.DirectionalLight(0xddeeff, 0.3);
        rimLight.position.set(cw * 0.3, maxDim * 0.2, -cl * 0.6);
        scene.add(rimLight);

        // Hemisphere — sky/ground bounce
        scene.add(new THREE.HemisphereLight(0xc0d0e0, 0x808070, 0.4));

        // ── Ground plane — factory floor ─────────────────────────────────
        const groundGeo = new THREE.PlaneGeometry(maxDim * 4, maxDim * 4);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x909498, roughness: 0.9, metalness: 0.1,
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(cw / 2, -esp - 1, cl / 2);
        ground.receiveShadow = true;
        scene.add(ground);

        // Grid — visible on light floor
        const grid = new THREE.GridHelper(maxDim * 2.5, 50, 0x70747a, 0x9a9ea4);
        grid.position.set(cw / 2, -esp - 0.5, cl / 2);
        scene.add(grid);

        // ── Chapa (sheet) — visible thickness ────────────────────────────
        const matColor = getMatColor(chapa?.material_code);
        const matHex = hexToThreeColor(matColor);

        // Top face — bright natural wood
        const topMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(matHex).multiplyScalar(1.2),
            roughness: 0.7,
            metalness: 0.02,
        });

        // Side faces — slightly darker, raw MDF edge look
        const sideColor = new THREE.Color(matHex).multiplyScalar(0.85);
        const sideMat = new THREE.MeshStandardMaterial({
            color: sideColor,
            roughness: 0.55,
            metalness: 0.05,
        });

        // Bottom face — darker
        const bottomMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(matHex).multiplyScalar(0.65),
            roughness: 0.85,
            metalness: 0.0,
        });

        // 6-material box: right, left, top, bottom, front, back
        const sheetGeo = new THREE.BoxGeometry(cw, esp, cl);
        const sheetMaterials = [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];
        const sheetMesh = new THREE.Mesh(sheetGeo, sheetMaterials);
        sheetMesh.position.set(cw / 2, -esp / 2, cl / 2);
        sheetMesh.receiveShadow = true;
        sheetMesh.castShadow = true;
        scene.add(sheetMesh);

        // Edge bevel lines on top of sheet
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x5a4030, transparent: true, opacity: 0.3 });
        const topEdge = [
            new THREE.Vector3(0, 0.1, 0),
            new THREE.Vector3(cw, 0.1, 0),
            new THREE.Vector3(cw, 0.1, cl),
            new THREE.Vector3(0, 0.1, cl),
            new THREE.Vector3(0, 0.1, 0),
        ];
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(topEdge), edgeMat));

        // Refilo border
        const refiloMat = new THREE.LineDashedMaterial({
            color: 0x444444, transparent: true, opacity: 0.5,
            dashSize: 15, gapSize: 10,
        });
        const refiloPoints = [
            new THREE.Vector3(ref, 0.3, ref),
            new THREE.Vector3(cw - ref, 0.3, ref),
            new THREE.Vector3(cw - ref, 0.3, cl - ref),
            new THREE.Vector3(ref, 0.3, cl - ref),
            new THREE.Vector3(ref, 0.3, ref),
        ];
        const refiloLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(refiloPoints), refiloMat);
        refiloLine.computeLineDistances();
        scene.add(refiloLine);

        // ── Groove overlay (usinagem mode) ────────────────────────────────
        const grooveCanvasW = 2048;
        const grooveCanvasH = Math.round(grooveCanvasW * (cl / cw));
        const grooveCanvas = document.createElement('canvas');
        grooveCanvas.width = grooveCanvasW;
        grooveCanvas.height = grooveCanvasH;
        const grooveCtx = grooveCanvas.getContext('2d');
        grooveCtx.clearRect(0, 0, grooveCanvasW, grooveCanvasH);

        const grooveTexture = new THREE.CanvasTexture(grooveCanvas);
        grooveTexture.minFilter = THREE.LinearFilter;
        grooveTexture.magFilter = THREE.LinearFilter;

        const groovePlane = new THREE.Mesh(
            new THREE.PlaneGeometry(cw, cl),
            new THREE.MeshBasicMaterial({
                map: grooveTexture,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
            })
        );
        groovePlane.rotation.x = -Math.PI / 2;
        groovePlane.position.set(cw / 2, 0.3, cl / 2);
        scene.add(groovePlane);

        // ── Pieces (trajetória mode only — overlays on cut plan) ──────
        const pieces = chapa?.pecas || [];
        const pieceH = esp * 0.25;
        const pieceObjects = []; // flat array for trajetória visibility toggle
        if (pieces.length > 0) {
            const pTopMat = new THREE.MeshStandardMaterial({
                color: 0xf0f0f0, roughness: 0.5, metalness: 0.05,
                transparent: true, opacity: 0.75,
            });
            const pSideMat = new THREE.MeshStandardMaterial({
                color: 0xdcdcdc, roughness: 0.4, metalness: 0.08,
                transparent: true, opacity: 0.8,
            });

            for (let i = 0; i < pieces.length; i++) {
                const p = pieces[i];
                const px = ref + p.x, pz = ref + p.y;

                const pieceGeo = new THREE.BoxGeometry(p.w - 1, pieceH, p.h - 1);
                const pieceMesh = new THREE.Mesh(pieceGeo, [pSideMat, pSideMat, pTopMat, pSideMat, pSideMat, pSideMat]);
                pieceMesh.position.set(px + p.w / 2, pieceH / 2 + 0.5, pz + p.h / 2);
                pieceMesh.castShadow = true;
                pieceMesh.receiveShadow = true;
                scene.add(pieceMesh);
                pieceObjects.push(pieceMesh);

                const pieceEdges = new THREE.EdgesGeometry(pieceGeo);
                const pieceWire = new THREE.LineSegments(pieceEdges, new THREE.LineBasicMaterial({
                    color: 0x2a5090, transparent: true, opacity: 0.6,
                }));
                pieceWire.position.copy(pieceMesh.position);
                scene.add(pieceWire);
                pieceObjects.push(pieceWire);

                if (p.nome && p.w > 60 && p.h > 40) {
                    const sprite = createTextSprite(p.nome, p.w, p.h);
                    sprite.position.set(px + p.w / 2, pieceH + 15, pz + p.h / 2);
                    scene.add(sprite);
                    pieceObjects.push(sprite);
                }
            }
        }

        // Contour matching not needed — usinagem is pure material removal now
        // (contour parsing kept in parser for future use)
        void allContours; // suppress unused warning

        // ── Scraps — glowing green wireframe ─────────────────────────────
        const scraps = chapa?.retalhos || [];
        for (const r of scraps) {
            const rx = ref + r.x, rz = ref + r.y;
            const scrapH = pieceH * 0.5;
            const scrapGeo = new THREE.BoxGeometry(r.w, scrapH, r.h);
            const edges = new THREE.EdgesGeometry(scrapGeo);
            const ln = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
                color: 0x16a34a, transparent: true, opacity: 0.5,
            }));
            ln.position.set(rx + r.w / 2, scrapH / 2 + 0.3, rz + r.h / 2);
            scene.add(ln);
        }

        // ── Toolpath lines ───────────────────────────────────────────────
        const toolSegments = {}; // toolName -> { points: [], moveCount, startMoveIdx }
        const rapidPoints = [];
        const rapidMoveIndices = [];
        let activeTool = '';

        for (let i = 0; i < allMoves.length; i++) {
            const m = allMoves[i];
            for (const ev of allEvents) {
                if (ev.moveIdx === i && ev.type === 'tool') activeTool = ev.label;
            }
            // Coords: X(gcode)->X(3D), Y(gcode)->Z(3D), Z(gcode)->-Y(3D) * Z_SCALE
            const x1 = m.x1, z1 = m.y1, y1 = Math.max(-m.z1 * Z_SCALE, 0.5);
            const x2 = m.x2, z2 = m.y2, y2 = Math.max(-m.z2 * Z_SCALE, 0.5);

            if (m.type === 'G0') {
                const safeH = esp + 30;
                rapidPoints.push(new THREE.Vector3(x1, Math.max(y1, safeH), z1));
                rapidPoints.push(new THREE.Vector3(x2, Math.max(y2, safeH), z2));
                rapidMoveIndices.push(i);
            } else {
                const key = activeTool || '__default__';
                if (!toolSegments[key]) toolSegments[key] = { points: [], moveCount: 0, startMoveIdx: i };
                toolSegments[key].points.push(new THREE.Vector3(x1, y1, z1));
                toolSegments[key].points.push(new THREE.Vector3(x2, y2, z2));
                toolSegments[key].moveCount++;
            }
        }

        // Build rapid lines
        let rapidLine = null;
        if (rapidPoints.length > 0) {
            const rGeo = new THREE.BufferGeometry().setFromPoints(rapidPoints);
            rapidLine = new THREE.LineSegments(rGeo, new THREE.LineDashedMaterial({
                color: 0xcc2222, dashSize: 15, gapSize: 12,
                transparent: true, opacity: 0.35,
            }));
            rapidLine.computeLineDistances();
            scene.add(rapidLine);
        }

        // Build per-tool cut lines — thicker with tube-like appearance
        const toolLines = [];
        for (const [toolName, seg] of Object.entries(toolSegments)) {
            const col = toolColors[toolName] || '#a6e3a1';
            const geo = new THREE.BufferGeometry().setFromPoints(seg.points);
            const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
                color: new THREE.Color(col),
                linewidth: 2,
            }));
            scene.add(line);

            // Glow line — wider, translucent
            const glowLine = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
                color: new THREE.Color(col),
                transparent: true,
                opacity: 0.2,
                linewidth: 4,
            }));
            scene.add(glowLine);

            toolLines.push({
                line,
                glowLine,
                toolName,
                startMoveIdx: seg.startMoveIdx,
                moveCount: seg.moveCount,
                totalPoints: seg.points.length,
            });
        }

        // ── Spindle/Router Assembly ──────────────────────────────────────
        // This is a big, substantial machine head
        const spindleGroup = new THREE.Group();

        const spindleScale = maxDim * 0.04; // ~4% of max dimension — very visible

        // Motor housing — large dark cylinder on top
        const motorGeo = new THREE.CylinderGeometry(
            spindleScale * 0.8, spindleScale * 0.9, spindleScale * 2.5, 24
        );
        const motorMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a40, roughness: 0.35, metalness: 0.6,
        });
        const motor = new THREE.Mesh(motorGeo, motorMat);
        motor.position.y = spindleScale * 2.8;
        motor.castShadow = true;
        spindleGroup.add(motor);

        // Motor top cap
        const capGeo = new THREE.CylinderGeometry(
            spindleScale * 0.5, spindleScale * 0.8, spindleScale * 0.3, 24
        );
        const capMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a30, roughness: 0.2, metalness: 0.8,
        });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = spindleScale * 4.15;
        spindleGroup.add(cap);

        // Motor band/ring accent — safety orange ring
        const ringGeo = new THREE.TorusGeometry(spindleScale * 0.85, spindleScale * 0.06, 8, 24);
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0xff6600, roughness: 0.3, metalness: 0.4,
            emissive: 0xff6600, emissiveIntensity: 0.15,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = spindleScale * 2.0;
        ring.rotation.x = Math.PI / 2;
        spindleGroup.add(ring);

        // Collet holder — tapered metal
        const colletGeo = new THREE.CylinderGeometry(
            spindleScale * 0.25, spindleScale * 0.55, spindleScale * 1.0, 16
        );
        const colletMat = new THREE.MeshStandardMaterial({
            color: 0xb0b0c0, roughness: 0.15, metalness: 0.85,
        });
        const collet = new THREE.Mesh(colletGeo, colletMat);
        collet.position.y = spindleScale * 1.0;
        collet.castShadow = true;
        spindleGroup.add(collet);

        // Collet nut — hexagonal feel via low-poly cylinder
        const nutGeo = new THREE.CylinderGeometry(
            spindleScale * 0.45, spindleScale * 0.45, spindleScale * 0.25, 6
        );
        const nutMat = new THREE.MeshStandardMaterial({
            color: 0x909090, roughness: 0.2, metalness: 0.9,
        });
        const nut = new THREE.Mesh(nutGeo, nutMat);
        nut.position.y = spindleScale * 0.6;
        spindleGroup.add(nut);

        // Router bit — the cutting tool (carbide silver)
        const bitGeo = new THREE.CylinderGeometry(
            spindleScale * 0.12, spindleScale * 0.12, spindleScale * 1.2, 12
        );
        const bitMat = new THREE.MeshStandardMaterial({
            color: 0xc0c0c8, roughness: 0.15, metalness: 0.85,
        });
        const bit = new THREE.Mesh(bitGeo, bitMat);
        bit.position.y = -spindleScale * 0.1;
        bit.castShadow = true;
        spindleGroup.add(bit);

        // Bit tip — slightly wider (carbide)
        const tipGeo = new THREE.CylinderGeometry(
            spindleScale * 0.18, spindleScale * 0.12, spindleScale * 0.3, 12
        );
        const tipMat = new THREE.MeshStandardMaterial({
            color: 0xa0a0a8, roughness: 0.2, metalness: 0.8,
        });
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.position.y = -spindleScale * 0.65;
        spindleGroup.add(tip);

        // Spindle glow light — illuminates the cut area
        const spindleGlow = new THREE.PointLight(0xffffee, 1.5, maxDim * 0.25);
        spindleGlow.position.y = -spindleScale * 0.5;
        spindleGroup.add(spindleGlow);

        // Stronger spot from above
        const spotLight = new THREE.SpotLight(0xffffff, 0.8, maxDim * 0.4, Math.PI / 6, 0.5);
        spotLight.position.y = spindleScale * 5;
        spindleGroup.add(spotLight);

        spindleGroup.visible = false;
        scene.add(spindleGroup);

        // ── Render loop + animation engine ───────────────────────────────
        let frameId;
        let time = 0;
        let lastFrameTime = performance.now();

        // Animation state (mutated from outside via threeRef)
        const animState = {
            playing: false,
            speed: 1,
            moveIdx: -1,       // current discrete move index
            moveFrac: 0,       // 0..1 fraction within current move
            moveAccum: 0,      // accumulated time (seconds) for current move
            onMoveChange: null, // callback to sync React state
        };

        function animate(now) {
            frameId = requestAnimationFrame(animate);
            const dt = Math.min((now - lastFrameTime) / 1000, 0.1); // cap at 100ms
            lastFrameTime = now;
            time += dt;
            controls.update();

            // Spindle spin (always when visible)
            if (spindleGroup.visible) {
                bit.rotation.y += dt * 15;
                tip.rotation.y += dt * 15;
                nut.rotation.y += dt * 10;
                ring.rotation.z = time * 2;
            }

            // Smooth animation advance
            if (animState.playing && animState.moveIdx >= 0) {
                const idx = animState.moveIdx;
                const moveDur = animState.moveTimes[idx] || 0.001;
                animState.moveAccum += dt * animState.speed;
                animState.moveFrac = Math.min(animState.moveAccum / moveDur, 1.0);

                // Interpolate spindle position within current move
                const m = animState.allMoves[idx];
                if (m) {
                    const frac = animState.moveFrac;
                    const ix = m.x1 + (m.x2 - m.x1) * frac;
                    const iz = m.y1 + (m.y2 - m.y1) * frac;
                    const rawY = m.z1 + (m.z2 - m.z1) * frac;
                    const iy = Math.max(-rawY * Z_SCALE, 0.5);
                    spindleGroup.position.set(ix, iy, iz);
                    spindleGroup.visible = true;
                }

                // Advance to next move when done
                if (animState.moveFrac >= 1.0) {
                    const nextIdx = idx + 1;
                    if (nextIdx >= animState.allMoves.length) {
                        animState.playing = false;
                        animState.moveFrac = 1.0;
                        if (animState.onMoveChange) animState.onMoveChange(idx, false);
                    } else {
                        animState.moveIdx = nextIdx;
                        animState.moveAccum = 0;
                        animState.moveFrac = 0;
                        if (animState.onMoveChange) animState.onMoveChange(nextIdx, true);
                    }
                }
            }

            renderer.render(scene, camera);
        }
        animate(performance.now());

        // Store refs for updates
        threeRef.current = {
            renderer, scene, camera, controls, frameId,
            spindle: spindleGroup, toolLines, rapidLine,
            rapidMoveIndices, allMovesLen: allMoves.length,
            cw, cl, esp, espReal, maxDim, spindleScale,
            animState,
            pieceObjects, groovePlane,
            grooveCtx, grooveTexture, grooveCanvas,
            grooveCanvasW, grooveCanvasH,
            lastPaintedMove: -1,
        };

        return () => {
            cancelAnimationFrame(frameId);
            controls.dispose();
            renderer.dispose();
            scene.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
            if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
            threeRef.current = null;
        };
    }, [gcode, chapa, allMoves, allEvents, toolColors]);

    // ─── Update draw ranges + groove painting based on curMove ──────────
    useEffect(() => {
        const t = threeRef.current;
        if (!t) return;

        const isUsinagem = simMode === 'usinagem';
        const showAll = curMove < 0;
        const limit = showAll ? t.allMovesLen : curMove + 1;

        // Update toolpath draw ranges (hidden in usinagem mode)
        for (const tl of t.toolLines) {
            tl.line.visible = !isUsinagem;
            tl.glowLine.visible = !isUsinagem;
            if (showAll) {
                tl.line.geometry.setDrawRange(0, tl.totalPoints);
                tl.glowLine.geometry.setDrawRange(0, tl.totalPoints);
            } else {
                let visiblePairs = 0;
                if (limit <= tl.startMoveIdx) {
                    visiblePairs = 0;
                } else {
                    visiblePairs = Math.min(tl.moveCount, limit - tl.startMoveIdx);
                    if (visiblePairs < 0) visiblePairs = 0;
                }
                tl.line.geometry.setDrawRange(0, visiblePairs * 2);
                tl.glowLine.geometry.setDrawRange(0, visiblePairs * 2);
            }
        }

        // Rapids — faded in usinagem
        if (t.rapidLine) {
            t.rapidLine.material.opacity = isUsinagem ? 0.15 : 0.35;
            if (showAll) {
                t.rapidLine.geometry.setDrawRange(0, Infinity);
            } else {
                let visibleRapids = 0;
                for (const mi of t.rapidMoveIndices) {
                    if (mi < limit) visibleRapids++;
                    else break;
                }
                t.rapidLine.geometry.setDrawRange(0, visibleRapids * 2);
            }
        }

        // Groove painting (usinagem mode) — pure material removal, no pieces
        if (isUsinagem && t.grooveCtx) {
            const targetMove = showAll ? allMoves.length - 1 : curMove;
            if (targetMove < t.lastPaintedMove) {
                // Scrubbed backward — clear and repaint from scratch
                t.grooveCtx.clearRect(0, 0, t.grooveCanvasW, t.grooveCanvasH);
                for (let j = 0; j <= targetMove; j++) {
                    paintGrooveMove(t.grooveCtx, allMoves[j], t.grooveCanvasW, t.grooveCanvasH, t.cw, t.cl, moveToolDiams[j]);
                }
                t.lastPaintedMove = targetMove;
                t.grooveTexture.needsUpdate = true;
            } else if (targetMove > t.lastPaintedMove) {
                // Forward — paint new grooves incrementally
                for (let j = t.lastPaintedMove + 1; j <= targetMove; j++) {
                    paintGrooveMove(t.grooveCtx, allMoves[j], t.grooveCanvasW, t.grooveCanvasH, t.cw, t.cl, moveToolDiams[j]);
                }
                t.lastPaintedMove = targetMove;
                t.grooveTexture.needsUpdate = true;
            }
        }

        // Spindle position (only for manual scrub / step — animation handles its own)
        if (!playing) {
            if (!showAll && curMove >= 0 && curMove < allMoves.length) {
                const m = allMoves[curMove];
                t.spindle.visible = true;
                const yPos = Math.max(-m.z2 * Z_SCALE, 0.5);
                t.spindle.position.set(m.x2, yPos, m.y2);
            } else {
                t.spindle.visible = false;
            }
        }
    }, [curMove, allMoves, playing, simMode, moveToolDiams]);

    // ─── Sync animState with React state ─────────────────────────────────
    // Throttle React state updates to ~15fps to avoid choking React renders
    const lastReactUpdate = useRef(0);
    useEffect(() => {
        const t = threeRef.current;
        if (!t) return;
        const as = t.animState;
        as.allMoves = allMoves;
        as.moveTimes = moveTimes;
        as.speed = speed;
        as.onMoveChange = (idx, stillPlaying) => {
            const now = performance.now();
            // Throttle: update React at most every 66ms (~15fps) during playback
            if (now - lastReactUpdate.current > 66 || !stillPlaying) {
                lastReactUpdate.current = now;
                setCurMove(idx);
            }
            if (!stillPlaying) setPlaying(false);
        };
    }, [allMoves, moveTimes, speed]);

    // ─── Start/stop animation engine ─────────────────────────────────────
    useEffect(() => {
        const t = threeRef.current;
        if (!t) return;
        const as = t.animState;
        if (playing) {
            as.playing = true;
            if (as.moveIdx < 0 || as.moveIdx >= allMoves.length - 1) {
                as.moveIdx = 0;
                as.moveAccum = 0;
                as.moveFrac = 0;
            } else {
                as.moveAccum = 0;
                as.moveFrac = 0;
            }
        } else {
            as.playing = false;
        }
    }, [playing, allMoves.length]);

    // ─── Toggle simMode: show/hide pieces, groove plane ──────────────────
    useEffect(() => {
        const t = threeRef.current;
        if (!t) return;
        const isUsinagem = simMode === 'usinagem';

        // Trajetória pieces: visible only in trajetória mode
        for (const obj of t.pieceObjects) {
            obj.visible = !isUsinagem;
        }

        // Groove plane: visible only in usinagem mode
        t.groovePlane.visible = isUsinagem;

        // Reset groove canvas when switching to usinagem
        if (isUsinagem && t.grooveCtx) {
            t.grooveCtx.clearRect(0, 0, t.grooveCanvasW, t.grooveCanvasH);
            t.lastPaintedMove = -1;
            t.grooveTexture.needsUpdate = true;
        }
    }, [simMode]);

    // ─── Controls ────────────────────────────────────────────────────────
    const handlePlay = () => {
        const t = threeRef.current;
        if (t) {
            const startIdx = (curMove >= allMoves.length - 1 || curMove < 0) ? 0 : curMove;
            t.animState.moveIdx = startIdx;
            t.animState.moveAccum = 0;
            t.animState.moveFrac = 0;
            if (startIdx === 0) setCurMove(0);
        }
        setPlaying(true);
    };
    const handlePause = () => setPlaying(false);
    const handleStop = () => {
        setPlaying(false);
        setCurMove(-1);
        const t = threeRef.current;
        if (t) {
            t.animState.moveIdx = -1;
            t.animState.playing = false;
            // Clear groove canvas on stop
            if (t.grooveCtx) {
                t.grooveCtx.clearRect(0, 0, t.grooveCanvasW, t.grooveCanvasH);
                t.lastPaintedMove = -1;
                t.grooveTexture.needsUpdate = true;
            }
        }
    };
    const handleStep = (dir) => {
        setPlaying(false);
        setCurMove(prev => {
            const p = prev < 0 ? 0 : prev;
            const next = Math.max(0, Math.min(allMoves.length - 1, p + dir));
            const t = threeRef.current;
            if (t) { t.animState.moveIdx = next; t.animState.moveFrac = 1; }
            return next;
        });
    };
    const handleSlider = (e) => {
        setPlaying(false);
        const val = parseInt(e.target.value);
        setCurMove(val);
        const t = threeRef.current;
        if (t) { t.animState.moveIdx = val; t.animState.moveFrac = 1; }
    };

    const resetCamera = useCallback(() => {
        const t = threeRef.current;
        if (!t) return;
        t.camera.position.set(t.cw * 1.1, t.maxDim * 0.45, t.cl * 1.3);
        t.controls.target.set(t.cw / 2, 0, t.cl / 2);
        t.controls.update();
    }, []);

    // Stats
    const toolEntries = Object.entries(toolColors);
    const { tool: activeTool, op: activeOp } = curMove >= 0 ? getActiveEventsAt(curMove) : { tool: '', op: '' };

    // Distances
    const { rapidDist, cutDist } = useMemo(() => {
        let rd = 0, cd = 0;
        const limit = curMove < 0 ? allMoves.length : curMove + 1;
        for (let i = 0; i < limit; i++) {
            const m = allMoves[i];
            const d = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
            if (m.type === 'G0') rd += d; else cd += d;
        }
        return { rapidDist: rd, cutDist: cd };
    }, [allMoves, curMove]);

    const btnSt = {
        padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        borderRadius: 5, border: '1px solid #bbb', background: '#f0f0f0',
        color: '#333', display: 'flex', alignItems: 'center', gap: 3,
        transition: 'all 0.15s',
    };
    const btnAct = { ...btnSt, background: '#ff6600', color: '#fff', borderColor: '#ff6600' };

    return (
        <div style={{ position: 'relative' }}>
            {/* Three.js canvas container */}
            <div ref={containerRef} style={{
                borderBottom: 'none',
                overflow: 'hidden', borderRadius: '8px 8px 0 0',
                background: '#d0d4db',
            }} />

            {/* HUD: info */}
            <div style={{
                position: 'absolute', top: 8, left: 8, fontSize: 10, color: '#555',
                background: 'rgba(255,255,255,0.85)', padding: '4px 12px', borderRadius: 6,
                pointerEvents: 'none', backdropFilter: 'blur(4px)',
                border: '1px solid #ccc',
            }}>
                3D | Scroll=zoom &middot; Drag=orbit &middot; Right=pan
            </div>

            {/* HUD: Tool/Op */}
            {curMove >= 0 && (
                <div style={{
                    position: 'absolute', top: 36, left: 8,
                    background: 'rgba(255,255,255,0.9)', padding: '5px 12px', borderRadius: 6,
                    pointerEvents: 'none', border: '1px solid #ccc',
                    backdropFilter: 'blur(4px)',
                }}>
                    {activeTool && <div style={{ fontSize: 11, color: toolColors[activeTool] || '#b8860b', fontWeight: 700 }}>{activeTool}</div>}
                    {activeOp && <div style={{ fontSize: 10, color: '#0066cc', marginTop: 1 }}>{activeOp}</div>}
                </div>
            )}

            {/* HUD: Mode toggle + Reset */}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                <div style={{
                    display: 'flex', borderRadius: 5, overflow: 'hidden',
                    border: '1px solid #bbb', background: '#f0f0f0',
                }}>
                    <button onClick={() => setSimMode('trajetoria')} style={{
                        padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        border: 'none', borderRight: '1px solid #bbb',
                        background: simMode === 'trajetoria' ? '#ff6600' : '#f0f0f0',
                        color: simMode === 'trajetoria' ? '#fff' : '#555',
                        transition: 'all 0.15s',
                    }}>
                        Trajetória
                    </button>
                    <button onClick={() => setSimMode('usinagem')} style={{
                        padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        border: 'none',
                        background: simMode === 'usinagem' ? '#ff6600' : '#f0f0f0',
                        color: simMode === 'usinagem' ? '#fff' : '#555',
                        transition: 'all 0.15s',
                    }}>
                        Usinagem
                    </button>
                </div>
                <button onClick={resetCamera} style={{
                    ...btnSt, fontSize: 10, padding: '3px 8px',
                }}>
                    Reset View
                </button>
            </div>

            {/* Progress bar overlay */}
            {curMove >= 0 && (
                <div style={{
                    position: 'absolute', bottom: 96, left: 0, right: 0, height: 22,
                    background: 'rgba(255,255,255,0.85)', pointerEvents: 'none',
                    backdropFilter: 'blur(4px)',
                }}>
                    <div style={{
                        height: '100%', width: `${((curMove + 1) / allMoves.length) * 100}%`,
                        background: 'linear-gradient(90deg, #ff660020, #ff660050)',
                    }} />
                    {allEvents.filter(e => e.type === 'tool').map((ev, i) => (
                        <div key={i} style={{
                            position: 'absolute', left: `${(ev.moveIdx / allMoves.length) * 100}%`,
                            top: 0, width: 2, height: '100%',
                            background: toolColors[ev.label] || '#f9e2af',
                        }} />
                    ))}
                    <span style={{
                        position: 'absolute', left: 10, top: 3, fontSize: 10,
                        color: '#444', fontFamily: 'monospace',
                    }}>
                        {formatTime(cumulativeTime[curMove] || 0)} / {formatTime(estimatedTime)} | Move {curMove + 1}/{allMoves.length} | Rapido: {(rapidDist / 1000).toFixed(1)}m | Corte: {(cutDist / 1000).toFixed(1)}m
                    </span>
                </div>
            )}

            {/* Control bar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', background: '#f5f5f5',
                border: '1px solid #ddd', borderTop: 'none',
            }}>
                {!playing ? (
                    <button onClick={handlePlay} style={btnAct} title="Play">&#9654;</button>
                ) : (
                    <button onClick={handlePause} style={btnAct} title="Pausar">&#9208;</button>
                )}
                <button onClick={handleStop} style={btnSt} title="Parar">&#9209;</button>
                <button onClick={() => handleStep(-1)} style={btnSt} title="Voltar 1">&#9198;</button>
                <button onClick={() => handleStep(1)} style={btnSt} title="Avancar 1">&#9197;</button>
                <input type="range" min={0} max={Math.max(0, allMoves.length - 1)} value={curMove < 0 ? 0 : curMove}
                    onChange={handleSlider}
                    style={{ flex: 1, height: 4, accentColor: '#ff6600', cursor: 'pointer' }} />
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                    style={{ ...btnSt, padding: '2px 6px', fontSize: 10 }}>
                    <option value={1}>1x (real)</option>
                    <option value={2}>2x</option>
                    <option value={5}>5x</option>
                    <option value={10}>10x</option>
                    <option value={25}>25x</option>
                    <option value={50}>50x</option>
                    <option value={100}>100x</option>
                </select>
                <span style={{ fontSize: 10, color: '#666', whiteSpace: 'nowrap', textAlign: 'right', fontFamily: 'monospace' }}>
                    {curMove >= 0
                        ? `${curMove + 1}/${allMoves.length} · ${formatTime(cumulativeTime[curMove] || 0)}/${formatTime(estimatedTime)}`
                        : `${allMoves.length} moves · ${formatTime(estimatedTime)}`
                    }
                </span>
            </div>

            {/* Tool legend */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '5px 12px', background: '#f5f5f5',
                borderRadius: '0 0 8px 8px',
                border: '1px solid #ddd', borderTop: 'none',
                flexWrap: 'wrap',
            }}>
                {toolEntries.length > 0 && toolEntries.map(([name, col]) => (
                    <span key={name} style={{
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                        color: activeTool === name ? '#222' : '#888',
                        fontWeight: activeTool === name ? 700 : 400,
                        transition: 'all 0.2s',
                    }}>
                        <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: col, display: 'inline-block',
                            opacity: activeTool === name ? 1 : 0.5,
                            boxShadow: activeTool === name ? `0 0 4px ${col}` : 'none',
                        }} />
                        {name}
                    </span>
                ))}
                {toolEntries.length === 0 && <span style={{ fontSize: 10, color: '#888' }}>Sem trocas de ferramenta</span>}
                {activeOp && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#0066cc', fontWeight: 600 }}>Op: {activeOp}</span>}
            </div>
        </div>
    );
}
