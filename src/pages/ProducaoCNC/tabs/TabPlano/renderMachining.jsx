// Extraído automaticamente de ProducaoCNC.jsx (linhas 7719-10382).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../../../../components/EditorEtiquetas';
import PecaViewer3D from '../../../../components/PecaViewer3D';
import PecaEditor from '../../../../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../../components/ToolpathSimulator';
import GcodeSimWrapper from '../../../../components/GcodeSimWrapper';
import SlidePanel from '../../../../components/SlidePanel';
import ToolbarDropdown from '../../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../../shared/constants.js';
import { buildMillingOutline } from './buildMillingOutline.js';
import { isPanningCursor } from './_utils.js';

export function renderMachining(piece, px, py, pw, ph, scale, rotated, pieceW, pieceH, ladoAtivo, onMachHover) {
    const isSideB = ladoAtivo === 'B';
    // If side B has dedicated machining data, use it; otherwise use normal machining_json
    let machSource = piece?.machining_json;
    if (isSideB && piece?.machining_json_b) machSource = piece.machining_json_b;
    if (!machSource || machSource === '{}') return null;
    let mach;
    try { mach = typeof machSource === 'string' ? JSON.parse(machSource) : machSource; } catch { return null; }
    if (!mach.workers) return null;

    const elements = [];
    const ghostElements = []; // opposite side elements (rendered behind, ghost style)
    // Contador local — evita ReferenceError quando piece.id é falsy.
    // (O antigo `_machClipId` vivia em buildMillingOutline.js mas nunca era exportado.)
    if (typeof renderMachining._clipSeq !== 'number') renderMachining._clipSeq = 0;
    const clipId = `mach-clip-${piece.id || (++renderMachining._clipSeq)}`;
    const hitPad = 3; // extra hit area padding

    // Helper: wrap element with hover hit area for tooltip
    const wrapHover = (el, tipData, cx, cy, r) => {
        if (!onMachHover) return el;
        const hitR = Math.max(r + hitPad, 6);
        return (
            <g key={el.key + '_g'} style={{ cursor: 'crosshair' }}
                onMouseEnter={(e) => onMachHover({ ...tipData, clientX: e.clientX, clientY: e.clientY })}
                onMouseMove={(e) => onMachHover(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null)}
                onMouseLeave={() => onMachHover(null)}>
                {el}
                <circle cx={cx} cy={cy} r={hitR} fill="transparent" />
            </g>
        );
    };
    const wrapHoverRect = (el, tipData, rx, ry, rw, rh) => {
        if (!onMachHover) return el;
        return (
            <g key={el.key + '_g'} style={{ cursor: 'crosshair' }}
                onMouseEnter={(e) => onMachHover({ ...tipData, clientX: e.clientX, clientY: e.clientY })}
                onMouseMove={(e) => onMachHover(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null)}
                onMouseLeave={() => onMachHover(null)}>
                {el}
                <rect x={rx - hitPad} y={ry - hitPad} width={rw + hitPad * 2} height={rh + hitPad * 2} fill="transparent" />
            </g>
        );
    };
    const wrapHoverLine = (el, tipData, x1, y1, x2, y2, sw) => {
        if (!onMachHover) return el;
        return (
            <g key={el.key + '_g'} style={{ cursor: 'crosshair' }}
                onMouseEnter={(e) => onMachHover({ ...tipData, clientX: e.clientX, clientY: e.clientY })}
                onMouseMove={(e) => onMachHover(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null)}
                onMouseLeave={() => onMachHover(null)}>
                {el}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={Math.max(sw + hitPad * 2, 8)} />
            </g>
        );
    };

    // Dimensões originais da peça do DB
    const compOrig = Number(piece.comprimento || pieceW);
    const largOrig = Number(piece.largura || pieceH);

    // Detectar rotação REAL comparando dimensões do plano com originais do DB
    // Não confiar apenas no flag rotated — pode estar incorreto (bug do otimizador)
    const wMatchesComp = Math.abs(pieceW - compOrig) <= 1;
    const wMatchesLarg = Math.abs(pieceW - largOrig) <= 1;
    const isRotated = (wMatchesLarg && !wMatchesComp) ? true : (wMatchesComp && !wMatchesLarg) ? false : rotated;

    // Transforma coordenadas do machining (relativas à peça original: x=comprimento, y=largura)
    // para posição SVG na peça colocada (pieceW × pieceH px)
    // Idêntico ao backend: transformRotated(wx,wy,compOrig) → {x: wy, y: compOrig - wx}
    function toSvg(mx, my) {
        // Mirror X for Side B (flip piece)
        let effX = isSideB ? compOrig - mx : mx;
        let lx, ly;
        if (isRotated) {
            // Rotated 90° CW: WPS Y→screen X (same direction, no flip), WPS X→screen Y (inverted)
            lx = my;
            ly = compOrig - effX;
        } else {
            // Non-rotated: Y-axis flip (WPS Y=0 is bottom, SVG Y=0 is top)
            lx = effX;
            ly = largOrig - my;
        }
        const sx = (lx / pieceW) * pw;
        const sy = (ly / pieceH) * ph;
        return { sx: Math.max(0, Math.min(sx, pw)), sy: Math.max(0, Math.min(sy, ph)) };
    }

    // Collect all workers (workers + side_a + side_b)
    const allWorkers = [];
    if (mach.workers) {
        const wArr = Array.isArray(mach.workers) ? mach.workers : Object.entries(mach.workers);
        for (const entry of wArr) {
            const [k, w] = Array.isArray(entry) ? entry : [allWorkers.length, entry];
            if (w && typeof w === 'object') allWorkers.push([k, w]);
        }
    }

    for (const [k, w] of allWorkers) {
        const face = (w.quadrant || w.face || 'top').toLowerCase();
        const cat = (w.category || w.type || '').toLowerCase();

        // Skip back (alias for rear) but keep front/rear for semicircle indicators
        if (face === 'back') { /* treat as rear */ }
        if (w.is_edge_operation && !['left', 'right', 'front', 'rear', 'back'].includes(face)) continue;
        // Skip ghost workers (no position data — transfer_milling sem coordenadas)
        if (w._no_position) continue;
        // Skip passante milling (contour cuts) — already shown as piece shape
        // BUT keep closed contours (close='1') — interior cutouts like porta provençal
        const espVal = Number(piece.espessura) || 18;
        const isPassanteMilling = cat.includes('milling') && (w.depth || w.usedepth || 0) >= espVal * 0.9 && w.positions;
        const isClosedInterior = String(w.close) === '1';
        if (isPassanteMilling && !isClosedInterior) continue;

        // ── Determine if this worker is on the OPPOSITE side ──
        // Active side = what user is looking at. Opposite = the other face.
        // Side A active: top workers = active, bottom workers = opposite
        // Side B active: bottom workers = active, top workers = opposite
        const isTopFaceWorker = face === 'top';
        const isBottomFaceWorker = face === 'bottom';
        const isGhost = (isSideB && isTopFaceWorker) || (!isSideB && isBottomFaceWorker);
        // Ghost style: reduced opacity, dashed stroke, neutral color
        const ghostColor = '#64748b'; // slate gray for all ghost ops
        const ghostOpacity = 0.18;
        const ghostDash = '4,2';
        const targetArr = isGhost ? ghostElements : elements;

        // ── Extrair coordenadas locais (mesma lógica do backend) ──
        let mx, my, mx2, my2;
        if (w.pos_start_for_line) {
            mx = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0);
            my = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0);
            mx2 = Number(w.pos_end_for_line?.position_x ?? w.pos_end_for_line?.x ?? mx);
            my2 = Number(w.pos_end_for_line?.position_y ?? w.pos_end_for_line?.y ?? my);
        } else {
            mx = Number(w.x ?? w.position_x ?? 0);
            my = Number(w.y ?? w.position_y ?? 0);
            mx2 = w.x2 != null ? Number(w.x2) : undefined;
            my2 = w.y2 != null ? Number(w.y2) : undefined;
        }

        let p1 = toSvg(mx, my);

        // Tooltip data base
        const faceLabel = { top: 'Topo', bottom: 'Fundo', left: 'Lateral dir', right: 'Lateral esq', front: 'Frontal', rear: 'Traseira' }[face] || face;
        const toolLabel = w.tool_code || w.tool || '';
        const baseTip = { face: faceLabel, tool: toolLabel, posX: Math.round(mx * 10) / 10, posY: Math.round(my * 10) / 10, ghost: isGhost };

        // ── Rasgos / Canais (saw cut, grooves) ──
        if (cat.includes('saw_cut') || w.tool === 'r_f') {
            const grooveW = (w.width_line || w.width || 3) * (pw / pieceW);
            let p2;
            if (w.pos_start_for_line && w.pos_end_for_line) {
                p2 = toSvg(mx2, my2);
            } else if (w.length) {
                const grooveLen = Number(w.length);
                let startX, endX;
                if (mx + grooveLen > compOrig + 1) {
                    startX = mx - grooveLen / 2;
                    endX = mx + grooveLen / 2;
                } else {
                    startX = mx;
                    endX = mx + grooveLen;
                }
                p1 = toSvg(startX, my);
                p2 = toSvg(endX, my);
            } else {
                continue;
            }
            const tipData = { ...baseTip, tipo: 'Rasgo / Canal', largura: w.width_line || w.width || 3, comprimento: w.length || Math.round(Math.sqrt((mx2-mx)**2 + (my2-my)**2)), profundidade: w.depth || '-' };
            if (isGhost) {
                const lineEl = <line key={`g${k}`} x1={px + p1.sx} y1={py + p1.sy} x2={px + p2.sx} y2={py + p2.sy}
                        stroke={ghostColor} strokeWidth={Math.max(1.5, grooveW)} opacity={ghostOpacity} strokeLinecap="round" strokeDasharray={ghostDash} />;
                targetArr.push(wrapHoverLine(lineEl, tipData, px + p1.sx, py + p1.sy, px + p2.sx, py + p2.sy, Math.max(1.5, grooveW)));
            } else {
                const lineEl = <line key={`g${k}`} x1={px + p1.sx} y1={py + p1.sy} x2={px + p2.sx} y2={py + p2.sy}
                        stroke="#eab308" strokeWidth={Math.max(1.5, grooveW)} opacity={0.6} strokeLinecap="round" />;
                targetArr.push(wrapHoverLine(lineEl, tipData, px + p1.sx, py + p1.sy, px + p2.sx, py + p2.sy, Math.max(1.5, grooveW)));
            }

        // ── Contornos interiores fechados (porta provençal, cutouts) ──
        } else if (isPassanteMilling && isClosedInterior && w.positions) {
            const positions = w.positions;
            const keys = Object.keys(positions).sort((a, b) => Number(a) - Number(b));
            if (keys.length >= 2) {
                const svgPts = keys.map(ky => {
                    const pt = positions[ky];
                    const ptx = Array.isArray(pt) ? pt[0] : Number(pt.x ?? pt.position_x ?? 0);
                    const pty = Array.isArray(pt) ? pt[1] : Number(pt.y ?? pt.position_y ?? 0);
                    const s = toSvg(ptx, pty);
                    return `${px + s.sx},${py + s.sy}`;
                }).join(' ');
                const depth = w.depth || w.usedepth || 0;
                const isThrough = depth >= espVal * 0.9;
                const tipData = { ...baseTip, tipo: isThrough ? 'Contorno interior passante' : 'Contorno interior', profundidade: depth || '-', vertices: keys.length };
                if (isGhost) {
                    const pathEl = <polygon key={`ic${k}`} points={svgPts}
                        fill={ghostColor} fillOpacity={ghostOpacity * 0.5} stroke={ghostColor}
                        strokeWidth={1} strokeDasharray={ghostDash} />;
                    targetArr.push(pathEl);
                } else {
                    // Interior cutout: fundo escuro para indicar recorte vazado
                    const pathEl = <polygon key={`ic${k}`} points={svgPts}
                        fill="#1e293b" fillOpacity={isThrough ? 0.6 : 0.3}
                        stroke="#ef4444" strokeWidth={1.5}
                        strokeDasharray={isThrough ? 'none' : '4,2'} />;
                    targetArr.push(wrapHoverRect(pathEl, tipData, px, py, pw, ph));
                }
            }

        // ── Rebaixos / Pockets (simples — sem contorno complexo) ──
        } else if (cat.includes('pocket') || cat.includes('rebaixo') || cat.includes('milling')) {
            // Se tem positions com vértices, renderizar como polígono (pocket com forma)
            if (w.positions && typeof w.positions === 'object') {
                const positions = w.positions;
                const keys = Object.keys(positions).sort((a, b) => Number(a) - Number(b));
                if (keys.length >= 3) {
                    const svgPts = keys.map(ky => {
                        const pt = positions[ky];
                        const ptx = Array.isArray(pt) ? pt[0] : Number(pt.x ?? pt.position_x ?? 0);
                        const pty = Array.isArray(pt) ? pt[1] : Number(pt.y ?? pt.position_y ?? 0);
                        const s = toSvg(ptx, pty);
                        return `${px + s.sx},${py + s.sy}`;
                    }).join(' ');
                    const tipData = { ...baseTip, tipo: 'Rebaixo / Pocket', profundidade: w.depth || '-', vertices: keys.length };
                    if (isGhost) {
                        const pathEl = <polygon key={`p${k}`} points={svgPts}
                            fill={ghostColor} fillOpacity={ghostOpacity} stroke={ghostColor}
                            strokeWidth={0.8} strokeDasharray={ghostDash} />;
                        targetArr.push(pathEl);
                    } else {
                        const pathEl = <polygon key={`p${k}`} points={svgPts}
                            fill="#f97316" fillOpacity={0.3} stroke="#ea580c"
                            strokeWidth={1.2} strokeDasharray="3,1.5" />;
                        targetArr.push(wrapHoverRect(pathEl, tipData, px, py, pw, ph));
                    }
                } else {
                    // Poucos vértices — fallback para retângulo
                    const rw = (w.pocket_width || w.width || w.length || 20) * (pw / pieceW);
                    const rh = (w.pocket_height || w.height || 20) * (ph / pieceH);
                    const tipData = { ...baseTip, tipo: 'Rebaixo / Pocket', largura: w.pocket_width || w.width || w.length || 20, altura: w.pocket_height || w.height || 20, profundidade: w.depth || '-' };
                    const rectEl = <rect key={`p${k}`} x={px + p1.sx - rw / 2} y={py + p1.sy - rh / 2} width={rw} height={rh}
                            fill={isGhost ? ghostColor : '#f97316'} opacity={isGhost ? ghostOpacity : 0.35} stroke={isGhost ? ghostColor : '#ea580c'} strokeWidth={isGhost ? 1 : 1.2} strokeDasharray={isGhost ? ghostDash : '3,1.5'} rx={1} />;
                    targetArr.push(wrapHoverRect(rectEl, tipData, px + p1.sx - rw / 2, py + p1.sy - rh / 2, rw, rh));
                }
            } else {
                const rw = (w.pocket_width || w.width || w.length || 20) * (pw / pieceW);
                const rh = (w.pocket_height || w.height || 20) * (ph / pieceH);
                const tipData = { ...baseTip, tipo: 'Rebaixo / Pocket', largura: w.pocket_width || w.width || w.length || 20, altura: w.pocket_height || w.height || 20, profundidade: w.depth || '-' };
                if (isGhost) {
                    const rectEl = <rect key={`p${k}`} x={px + p1.sx - rw / 2} y={py + p1.sy - rh / 2} width={rw} height={rh}
                            fill={ghostColor} opacity={ghostOpacity} stroke={ghostColor} strokeWidth={1} strokeDasharray={ghostDash} rx={1} />;
                    targetArr.push(wrapHoverRect(rectEl, tipData, px + p1.sx - rw / 2, py + p1.sy - rh / 2, rw, rh));
                } else {
                    const rectEl = <rect key={`p${k}`} x={px + p1.sx - rw / 2} y={py + p1.sy - rh / 2} width={rw} height={rh}
                            fill="#f97316" opacity={0.35} stroke="#ea580c" strokeWidth={1.2} strokeDasharray="3,1.5" rx={1} />;
                    targetArr.push(wrapHoverRect(rectEl, tipData, px + p1.sx - rw / 2, py + p1.sy - rh / 2, rw, rh));
                }
            }

        // ── Slots / Fresagens ──
        } else if (cat.includes('slot') || cat.includes('fresa')) {
            const slotLen = (w.slot_length || w.length || 20) * (pw / pieceW);
            const slotW = (w.slot_width || w.width || w.diameter || 6) * (ph / pieceH);
            const tipData = { ...baseTip, tipo: 'Fresagem / Slot', comprimento: w.slot_length || w.length || 20, largura: w.slot_width || w.width || w.diameter || 6, profundidade: w.depth || '-' };
            if (isGhost) {
                const rectEl = <rect key={`s${k}`} x={px + p1.sx} y={py + p1.sy - slotW / 2} width={slotLen} height={slotW}
                        fill={ghostColor} opacity={ghostOpacity} stroke={ghostColor} strokeWidth={0.6} strokeDasharray={ghostDash} rx={slotW / 2} />;
                targetArr.push(wrapHoverRect(rectEl, tipData, px + p1.sx, py + p1.sy - slotW / 2, slotLen, slotW));
            } else {
                const rectEl = <rect key={`s${k}`} x={px + p1.sx} y={py + p1.sy - slotW / 2} width={slotLen} height={slotW}
                        fill="#06b6d4" opacity={0.35} stroke="#0891b2" strokeWidth={0.6} rx={slotW / 2} />;
                targetArr.push(wrapHoverRect(rectEl, tipData, px + p1.sx, py + p1.sy - slotW / 2, slotLen, slotW));
            }

        // ── Furos (holes, boreholes) — exclude milling ops that have diameter from width_tool ──
        } else if (w.diameter && !cat.includes('milling')) {
            const dScale = Math.min(pw / pieceW, ph / pieceH);
            const r = Math.max(0.8, (w.diameter / 2) * dScale);
            const isTopFace = face === 'top' || face === 'bottom';
            const isSide = face === 'right' || face === 'left';
            const isFrontRear = face === 'front' || face === 'rear' || face === 'back';
            const isBlind = cat.includes('blind');
            const isThrough = !isBlind && (w.depth || 0) >= (Number(piece.espessura) || 18);
            const tipData = { ...baseTip, tipo: isThrough ? 'Furo passante' : isBlind ? 'Furo cego' : 'Furo', diametro: w.diameter, profundidade: w.depth || '-', passante: isThrough };

            if (isTopFace || (!isSide && !isFrontRear)) {
                if (isGhost) {
                    const circEl = <circle key={`h${k}`} cx={px + p1.sx} cy={py + p1.sy} r={r}
                            fill="none" opacity={ghostOpacity + 0.12}
                            stroke={ghostColor} strokeWidth={1} strokeDasharray={ghostDash} />;
                    targetArr.push(wrapHover(circEl, tipData, px + p1.sx, py + p1.sy, r));
                } else {
                    const fillColor = face === 'bottom' ? '#7c3aed' : '#e11d48';
                    const strokeColor = face === 'bottom' ? '#6d28d9' : '#be123c';
                    const circEl = <circle key={`h${k}`} cx={px + p1.sx} cy={py + p1.sy} r={r}
                            fill={fillColor} opacity={0.55}
                            stroke={strokeColor} strokeWidth={0.5} />;
                    targetArr.push(wrapHover(circEl, tipData, px + p1.sx, py + p1.sy, r));
                    if (isBlind) {
                        targetArr.push(
                            <circle key={`hb${k}`} cx={px + p1.sx} cy={py + p1.sy} r={Math.max(1, r * 0.35)}
                                fill="none" stroke={strokeColor} strokeWidth={0.6} opacity={0.7} style={{ pointerEvents: 'none' }} />
                        );
                    }
                }
            } else if (isSide) {
                const edgeSize = Math.max(2, r * 0.8);
                const visualRight = face === 'left';
                const visualLeft = face === 'right';
                // Semicircle on edge (more realistic than triangle)
                if (visualRight) {
                    const semiD = `M ${px + pw},${py + p1.sy - edgeSize} A ${edgeSize},${edgeSize} 0 0,0 ${px + pw},${py + p1.sy + edgeSize}`;
                    const semiEl = <path key={`h${k}`} d={semiD}
                            fill="#2563eb" opacity={0.6} stroke="#1d4ed8" strokeWidth={0.5} />;
                    targetArr.push(wrapHover(semiEl, tipData, px + pw - edgeSize, py + p1.sy, edgeSize));
                } else if (visualLeft) {
                    const semiD = `M ${px},${py + p1.sy - edgeSize} A ${edgeSize},${edgeSize} 0 0,1 ${px},${py + p1.sy + edgeSize}`;
                    const semiEl = <path key={`h${k}`} d={semiD}
                            fill="#2563eb" opacity={0.6} stroke="#1d4ed8" strokeWidth={0.5} />;
                    targetArr.push(wrapHover(semiEl, tipData, px + edgeSize, py + p1.sy, edgeSize));
                }
            } else if (isFrontRear) {
                // Front/rear holes: semicircles on top/bottom edges (green)
                const edgeSize = Math.max(2, r * 0.8);
                const atBottom = face === 'front'; // front = y=0 = bottom edge in SVG (after Y-flip)
                if (atBottom) {
                    const semiD = `M ${px + p1.sx - edgeSize},${py + ph} A ${edgeSize},${edgeSize} 0 0,0 ${px + p1.sx + edgeSize},${py + ph}`;
                    const semiEl = <path key={`h${k}`} d={semiD}
                            fill="#16a34a" opacity={0.6} stroke="#15803d" strokeWidth={0.5} />;
                    targetArr.push(wrapHover(semiEl, tipData, px + p1.sx, py + ph - edgeSize, edgeSize));
                } else {
                    const semiD = `M ${px + p1.sx - edgeSize},${py} A ${edgeSize},${edgeSize} 0 0,1 ${px + p1.sx + edgeSize},${py}`;
                    const semiEl = <path key={`h${k}`} d={semiD}
                            fill="#16a34a" opacity={0.6} stroke="#15803d" strokeWidth={0.5} />;
                    targetArr.push(wrapHover(semiEl, tipData, px + p1.sx, py + edgeSize, edgeSize));
                }
            }
        }
    }

    if (elements.length === 0 && ghostElements.length === 0) return null;

    // Wrap in clipPath to ensure nothing renders outside the piece boundary
    // Ghost elements render BEHIND active elements
    return (
        <g className="machining" style={{ pointerEvents: onMachHover ? 'auto' : 'none' }}>
            <defs>
                <clipPath id={clipId}>
                    <rect x={px} y={py} width={pw} height={ph} />
                </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
                {ghostElements}
                {elements}
            </g>
        </g>
    );
}

// ─── SVG visualization with collision detection, magnetic snap, kerf, lock, context menu ──
export function ChapaViz({ chapa, idx, pecasMap, modo, zoomLevel, setZoomLevel, panOffset, onWheel, onPanStart, onPanMove, onPanEnd, resetView, getModColor, onAdjust, selectedPieces = [], onSelectPiece, kerfSize = 4, espacoPecas = 7, allChapas = [], classifyLocal, classColors = {}, classLabels = {}, onGerarGcode, onGerarGcodePeca, gcodeLoading, onView3D, onPrintLabel, onPrintSingleLabel, onPrintFolha, onSaveRetalhos, setTab, sobraMinW = 300, sobraMinH = 600, validationConflicts = [], machineArea, timerInfo, loteAtual, bandejaPieces = [], notify }) {
    const [hovered, setHovered] = useState(null);
    const [showCuts, setShowCuts] = useState(false);
    const [showMachining, setShowMachining] = useState(true);
    const [machTip, setMachTip] = useState(null);
    const [dragging, setDragging] = useState(null);
    const [draggingBandeja, setDraggingBandeja] = useState(null); // { bandejaIdx, materialKey, w, h, newX, newY }
    const [dragCollision, setDragCollision] = useState(false);
    const [snapGuides, setSnapGuides] = useState([]);
    const [ctxMenu, setCtxMenu] = useState(null);
    const [sobraCtxMenu, setSobraCtxMenu] = useState(null);
    const [sobraDrag, setSobraDrag] = useState(null);
    // ─── Retalhos management mode ───
    const [retMode, setRetMode] = useState(false);
    const [retDefs, setRetDefs] = useState([]); // [{x,y,w,h,type:'retalho'|'refugo'|null}]
    const [retSelected, setRetSelected] = useState(null); // index
    const [retSplitPreview, setRetSplitPreview] = useState(null); // {retIdx, axis:'h'|'v', pos}
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const wheelDivRef = useRef(null); // ref para o div do canvas — wheel não-passivo
    const onWheelRef = useRef(onWheel); // sempre aponta para o handler atual (evita closure stale)
    const [containerW, setContainerW] = useState(0);
    const marginDim = 30;

    // Mantém onWheelRef atualizado a cada render
    useEffect(() => { onWheelRef.current = onWheel; });

    // Fix passive wheel: React 17+ registra wheel passivo na raiz — previne preventDefault.
    // Registramos o listener diretamente no DOM com { passive: false }.
    useEffect(() => {
        const el = wheelDivRef.current;
        if (!el) return;
        const handler = (e) => onWheelRef.current?.(e);
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, []); // monta uma vez; onWheelRef sempre tem o handler atual

    // Medir container real para adaptar o SVG
    useEffect(() => {
        if (!containerRef.current) return;
        const measure = () => {
            const w = containerRef.current?.clientWidth || 0;
            if (w > 0) setContainerW(w);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Escala adaptada ao container — a chapa é o elemento principal, deve ocupar bem o espaço
    const maxW = containerW > 100 ? containerW - 40 : 800;
    const maxH = Math.min(window.innerHeight * 0.58, 720);
    const scale = Math.min((maxW - marginDim * 2) / chapa.comprimento, (maxH - marginDim) / chapa.largura);

    // Edge band color — based on color name (hash) or type fallback
    // Paleta fixa de cores para fitas — mais distinta que hash HSL
    const FITA_PALETTE = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
        '#ff5722', '#607d8b', '#795548', '#3f51b5', '#009688',
    ];
    const fitaColorCache = useRef({});
    let fitaColorIdx = useRef(0);
    const edgeColorGlobal = (val, corVal) => {
        if (!val) return null;
        const key = corVal || val;
        if (fitaColorCache.current[key]) return fitaColorCache.current[key];
        // Tentar match por padrão conhecido
        let color = null;
        const upper = (val + ' ' + (corVal || '')).toUpperCase();
        if (upper.includes('BRANCO') || upper.includes('WHITE')) color = '#78909c';
        else if (upper.includes('PRETO') || upper.includes('BLACK')) color = '#37474f';
        else if (upper.includes('FREIJO') || upper.includes('CARVALHO') || upper.includes('NOGUEIRA') || upper.includes('NOGAL')) color = '#8d6e47';
        else if (upper.includes('CANELA') || upper.includes('AMENDOA')) color = '#a1887f';
        else if (upper.includes('CINZA') || upper.includes('GRAFITE')) color = '#90a4ae';
        else {
            // Cor única por fita — pegar próxima da paleta
            color = FITA_PALETTE[fitaColorIdx.current % FITA_PALETTE.length];
            fitaColorIdx.current++;
        }
        fitaColorCache.current[key] = color;
        return color;
    };
    const svgW = chapa.comprimento * scale;
    const svgH = chapa.largura * scale;
    const refilo = (chapa.refilo || 0) * scale;
    const refiloVal = chapa.refilo || 0;
    const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
    const kerfPx = (kerfSize / 2) * scale;

    // ─── Transfer tray (bandeja) dimensions ───
    const trayGap = 24; // gap between sheet and tray
    const trayW = bandejaPieces.length > 0 ? 240 : 160; // wider when pieces present
    const trayX = svgW + trayGap; // X position of tray in SVG coords
    const [trayHover, setTrayHover] = useState(false);

    // ─── Client-side AABB collision check (com kerf, igual ao backend) ───
    const isColliding = useCallback((tx, ty, tw, th, exIdx) => {
        const k = Math.max(chapa.kerf || kerfSize || 0, espacoPecas || 0); // Usar o MAIOR entre kerf e espaço entre peças
        for (let i = 0; i < chapa.pecas.length; i++) {
            if (i === exIdx) continue;
            const b = chapa.pecas[i];
            // Expandir a peça testada por espaçamento em todos os lados (mesma lógica do backend compactBin)
            if (tx - k < b.x + b.w && tx + tw + k > b.x && ty - k < b.y + b.h && ty + th + k > b.y) return true;
        }
        return false;
    }, [chapa.pecas, chapa.kerf, kerfSize, espacoPecas]);

    // ─── Magnetic snap to adjacent edges (durante arrasto) ───
    const magneticSnap = useCallback((tx, ty, tw, th, exIdx) => {
        const k = Math.max(chapa.kerf || kerfSize || 0, espacoPecas || 0);
        const ref = chapa.refilo || 0;
        const uW = chapa.comprimento - 2 * ref, uH = chapa.largura - 2 * ref;
        // Limites: área útil completa
        const maxPosX = uW - tw, maxPosY = uH - th;
        const guides = [];

        // SEMPRE coletar todos os snaps — sem threshold de distância
        const snapsX = [];
        const snapsY = [];

        // Paredes (sempre disponíveis)
        snapsX.push({ pos: 0, guide: { t: 'v', p: 0 }, dist: Math.abs(tx) });
        snapsX.push({ pos: maxPosX, guide: { t: 'v', p: uW }, dist: Math.abs(tx - maxPosX) });
        snapsY.push({ pos: 0, guide: { t: 'h', p: 0 }, dist: Math.abs(ty) });
        snapsY.push({ pos: maxPosY, guide: { t: 'h', p: uH }, dist: Math.abs(ty - maxPosY) });

        // Bordas de TODAS as peças vizinhas (sem filtro de overlap — snap global)
        for (let i = 0; i < chapa.pecas.length; i++) {
            if (i === exIdx) continue;
            const o = chapa.pecas[i];
            // Snap X: encostar com kerf, alinhar bordas
            snapsX.push({ pos: o.x + o.w + k, guide: { t: 'v', p: o.x + o.w }, dist: Math.abs(tx - (o.x + o.w + k)) });
            snapsX.push({ pos: o.x - tw - k, guide: { t: 'v', p: o.x }, dist: Math.abs(tx + tw + k - o.x) });
            snapsX.push({ pos: o.x, guide: { t: 'v', p: o.x }, dist: Math.abs(tx - o.x) });
            snapsX.push({ pos: o.x + o.w - tw, guide: { t: 'v', p: o.x + o.w }, dist: Math.abs(tx + tw - (o.x + o.w)) });
            // Snap Y: encostar com kerf, alinhar bordas
            snapsY.push({ pos: o.y + o.h + k, guide: { t: 'h', p: o.y + o.h }, dist: Math.abs(ty - (o.y + o.h + k)) });
            snapsY.push({ pos: o.y - th - k, guide: { t: 'h', p: o.y }, dist: Math.abs(ty + th + k - o.y) });
            snapsY.push({ pos: o.y, guide: { t: 'h', p: o.y }, dist: Math.abs(ty - o.y) });
            snapsY.push({ pos: o.y + o.h - th, guide: { t: 'h', p: o.y + o.h }, dist: Math.abs(ty + th - (o.y + o.h)) });
        }

        // Threshold: snap ATIVO quando dentro de S mm. FORA de S, usa posição arredondada para inteiro.
        const S = Math.max(20, Math.min(50, 30 / (zoomLevel || 1)));

        let sx = Math.round(tx), sy = Math.round(ty);
        snapsX.sort((a, b) => a.dist - b.dist);
        snapsY.sort((a, b) => a.dist - b.dist);
        // Sempre snap ao mais próximo se dentro de S — senão arredonda para inteiro (nunca decimal)
        if (snapsX.length > 0 && snapsX[0].dist < S) { sx = Math.round(snapsX[0].pos); guides.push(snapsX[0].guide); }
        if (snapsY.length > 0 && snapsY[0].dist < S) { sy = Math.round(snapsY[0].pos); guides.push(snapsY[0].guide); }

        return { x: sx, y: sy, guides };
    }, [chapa.pecas, chapa.refilo, chapa.comprimento, chapa.largura, chapa.kerf, kerfSize, espacoPecas, zoomLevel]);

    // ─── Pixel to MM ───
    const pixelToMM = (clientX, clientY) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        // viewBox inclui toda a largura do SVG: chapa + margem + bandeja
        // vbW deve bater com o atributo viewBox do elemento SVG
        const vbW = svgW + marginDim * 2 + 2 + trayGap + trayW;
        const vbH = svgH + marginDim + 20;
        // pixel → SVG coord (getBoundingClientRect já corrige zoom/pan do CSS transform)
        const svgX = -marginDim + ((clientX - rect.left) / rect.width) * vbW;
        const svgY = -14 + ((clientY - rect.top) / rect.height) * vbH;
        // SVG coord → usable mm (pieces render at (x + refilo) * scale)
        const mmX = svgX / scale - refiloVal;
        const mmY = svgY / scale - refiloVal;
        return { x: mmX, y: mmY };
    };

    // ─── Drag handlers with collision + snap ───
    const handleDragStart = (e, pecaIdx) => {
        if (e.button !== 0 || e.altKey) return;
        if (chapa.pecas[pecaIdx]?.locked) return;
        e.stopPropagation();
        const p = chapa.pecas[pecaIdx];
        const mm = pixelToMM(e.clientX, e.clientY);
        setDragging({ pecaIdx, startX: mm.x, startY: mm.y, origX: p.x, origY: p.y, newX: p.x, newY: p.y });
        setDragCollision(false);
        setSnapGuides([]);
        setCtxMenu(null);
    };

    const handleDragMove = (e) => {
        if (!dragging) return;
        const mm = pixelToMM(e.clientX, e.clientY);
        const p = chapa.pecas[dragging.pecaIdx];
        const ref = chapa.refilo || 0;
        const rawX = dragging.origX + (mm.x - dragging.startX);
        const rawY = dragging.origY + (mm.y - dragging.startY);

        // Check if dragged to tray area (right of sheet)
        const inTray = rawX > chapa.comprimento - 2 * ref;
        setTrayHover(inTray);

        if (inTray) {
            // Let the piece visually move outside the sheet
            const g = svgRef.current?.querySelector(`[data-pidx="${dragging.pecaIdx}"]`);
            if (g) {
                const px = (rawX + refiloVal) * scale, py = Math.max(0, rawY + refiloVal) * scale;
                g.setAttribute('transform', `translate(${px - (p.x + refiloVal) * scale}, ${py - (p.y + refiloVal) * scale})`);
            }
            setDragCollision(false);
            setSnapGuides([]);
            setDragging(prev => ({ ...prev, newX: rawX, newY: Math.max(0, rawY) }));
            return;
        }

        // Limites: área útil completa (0 a binW-pw). Colisão com kerf cuida do espaçamento.
        const maxX = chapa.comprimento - 2 * ref - p.w;
        const maxY = chapa.largura - 2 * ref - p.h;
        let rx = Math.max(0, Math.min(maxX, rawX));
        let ry = Math.max(0, Math.min(maxY, rawY));
        // Magnetic snap
        const snap = magneticSnap(rx, ry, p.w, p.h, dragging.pecaIdx);
        // Round to integer mm and clamp STRICTLY within usable area
        rx = Math.round(Math.max(0, Math.min(maxX, snap.x)));
        ry = Math.round(Math.max(0, Math.min(maxY, snap.y)));
        setSnapGuides(snap.guides);
        // Collision check
        const collision = isColliding(rx, ry, p.w, p.h, dragging.pecaIdx);
        setDragCollision(collision);
        // DOM update for performance
        const g = svgRef.current?.querySelector(`[data-pidx="${dragging.pecaIdx}"]`);
        if (g) {
            const px = (rx + refiloVal) * scale, py = (ry + refiloVal) * scale;
            g.setAttribute('transform', `translate(${px - (p.x + refiloVal) * scale}, ${py - (p.y + refiloVal) * scale})`);
        }
        setDragging(prev => ({ ...prev, newX: rx, newY: ry }));
    };

    // ─── Force-snap: peça DEVE sempre encostar em parede ou outra peça ───
    // Gera todas as posições válidas de encaixe e retorna a mais próxima sem colisão
    const forceSnap = useCallback((tx, ty, tw, th, exIdx) => {
        const k = Math.max(chapa.kerf || kerfSize || 0, espacoPecas || 0);
        const ref = chapa.refilo || 0;
        const uW = chapa.comprimento - 2 * ref, uH = chapa.largura - 2 * ref;
        // Limites: área útil completa (mesma que o otimizador + compactBin)
        const maxPosX = Math.round(uW - tw);
        const maxPosY = Math.round(uH - th);

        // Coletar TODAS as âncoras possíveis em X e Y (arredondadas para inteiro)
        // Âncora X = posição onde o left da peça pode ir (ou right - tw)
        const anchorsX = [0, maxPosX]; // paredes esquerda e direita (com kerf)
        const anchorsY = [0, maxPosY]; // paredes topo e base (com kerf)

        for (let i = 0; i < chapa.pecas.length; i++) {
            if (i === exIdx) continue;
            const o = chapa.pecas[i];
            // Âncoras X: encostar à direita da peça vizinha, ou à esquerda
            anchorsX.push(Math.round(o.x + o.w + k));      // left da peça = right do vizinho + kerf
            anchorsX.push(Math.round(o.x - tw - k));        // right da peça = left do vizinho - kerf
            // Alinhar bordas (mesma posição X)
            anchorsX.push(Math.round(o.x));                  // left alinhado
            anchorsX.push(Math.round(o.x + o.w - tw));       // right alinhado
            // Âncoras Y: encostar abaixo da peça vizinha, ou acima
            anchorsY.push(Math.round(o.y + o.h + k));
            anchorsY.push(Math.round(o.y - th - k));
            anchorsY.push(Math.round(o.y));
            anchorsY.push(Math.round(o.y + o.h - th));
        }

        // Filtrar âncoras ESTRITAMENTE dentro da área útil (nunca no refilo nem além do kerf da borda)
        const validX = [...new Set(anchorsX.map(x => Math.round(x)))].filter(x => x >= 0 && x <= maxPosX + 0.1).map(x => Math.max(0, Math.min(maxPosX, x)));
        const validY = [...new Set(anchorsY.map(y => Math.round(y)))].filter(y => y >= 0 && y <= maxPosY + 0.1).map(y => Math.max(0, Math.min(maxPosY, y)));

        // Verificar que a posição toca pelo menos uma parede ou peça em cada eixo
        const touchesX = (fx) => {
            if (Math.abs(fx) < 1 || Math.abs(fx + tw - uW) < 1) return true;
            for (let i = 0; i < chapa.pecas.length; i++) {
                if (i === exIdx) continue;
                const o = chapa.pecas[i];
                if (Math.abs(fx - (o.x + o.w + k)) < 1 || Math.abs(fx + tw + k - o.x) < 1) return true;
            }
            return false;
        };
        const touchesY = (fy) => {
            if (Math.abs(fy) < 1 || Math.abs(fy + th - uH) < 1) return true;
            for (let i = 0; i < chapa.pecas.length; i++) {
                if (i === exIdx) continue;
                const o = chapa.pecas[i];
                if (Math.abs(fy - (o.y + o.h + k)) < 1 || Math.abs(fy + th + k - o.y) < 1) return true;
            }
            return false;
        };

        // Gerar todas as combinações (X, Y) e ordenar por distância ao ponto de drop
        // Prioridade: toca em ambos eixos > toca em 1 eixo > nenhum toque
        const candidates = [];
        for (const ax of validX) {
            const tx_ = touchesX(ax);
            for (const ay of validY) {
                const ty_ = touchesY(ay);
                if (!tx_ && !ty_) continue; // pelo menos 1 eixo deve tocar
                const priority = (tx_ && ty_) ? 0 : 1; // ambos tocam = melhor
                const dist = Math.hypot(ax - tx, ay - ty);
                candidates.push({ x: Math.round(ax), y: Math.round(ay), dist, priority });
            }
        }
        candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);

        // Retornar a candidata mais próxima que não colide
        for (const c of candidates) {
            if (!isColliding(c.x, c.y, tw, th, exIdx)) {
                return { x: c.x, y: c.y, valid: true };
            }
        }

        // Fallback: nenhuma posição alinhada disponível → tentar apenas snap por eixo mais próximo
        const sortedX = validX.map(x => ({ x: Math.round(x), d: Math.abs(x - tx) })).sort((a, b) => a.d - b.d);
        const sortedY = validY.map(y => ({ y: Math.round(y), d: Math.abs(y - ty) })).sort((a, b) => a.d - b.d);
        for (const sx of sortedX) {
            for (const sy of sortedY) {
                if (!isColliding(sx.x, sy.y, tw, th, exIdx)) {
                    return { x: sx.x, y: sy.y, valid: true };
                }
            }
        }

        // Nenhuma posição válida — reverter
        return { x: tx, y: ty, valid: false };
    }, [chapa.pecas, chapa.refilo, chapa.comprimento, chapa.largura, chapa.kerf, kerfSize, espacoPecas, isColliding]);

    const handleDragEnd = (e) => {
        if (!dragging || dragging.newX == null) { setDragging(null); setDragCollision(false); setSnapGuides([]); setTrayHover(false); return; }
        const g = svgRef.current?.querySelector(`[data-pidx="${dragging.pecaIdx}"]`);
        if (g) g.removeAttribute('transform');
        const p = chapa.pecas[dragging.pecaIdx];
        if (!p) { setDragging(null); setDragCollision(false); setSnapGuides([]); setTrayHover(false); return; }

        // Check if piece was dragged to the tray area (right of sheet)
        const draggedMM = dragging.newX;
        if (trayHover || draggedMM > chapa.comprimento) {
            // Dropped in tray → send to transfer
            if (onAdjust) onAdjust({ action: 'to_bandeja', chapaIdx: idx, pecaIdx: dragging.pecaIdx });
            setDragging(null); setDragCollision(false); setSnapGuides([]); setTrayHover(false);
            return;
        }

        // Force-snap: encontrar melhor posição alinhada sem colisão
        const snapped = forceSnap(dragging.newX, dragging.newY, p.w, p.h, dragging.pecaIdx);

        if (!snapped.valid) {
            // Nenhuma posição válida → reverter ao original
            setDragging(null); setDragCollision(false); setSnapGuides([]); setTrayHover(false);
            return;
        }

        const sx = snapped.x, sy = snapped.y;
        if (onAdjust && (Math.abs(sx - dragging.origX) > 1 || Math.abs(sy - dragging.origY) > 1)) {
            onAdjust({ action: 'move', chapaIdx: idx, pecaIdx: dragging.pecaIdx, x: sx, y: sy });
        }
        setDragging(null); setDragCollision(false); setSnapGuides([]); setTrayHover(false);
    };

    const handleRotate = (pecaIdx) => {
        if (hasVeio || chapa.pecas[pecaIdx]?.locked) return;
        if (onAdjust) onAdjust({ action: 'rotate', chapaIdx: idx, pecaIdx });
    };

    // ─── Bandeja drag: arrastar peça da bandeja de volta para a chapa ───
    // Ref para sempre ter acesso ao handleBandejaDragEnd mais recente no listener global.
    // Atualizado sincronamente no corpo do componente (abaixo de handleBandejaDragEnd).
    const bandejaDragEndRef = useRef(null);
    // Flag para garantir idempotência: o drop não executa duas vezes
    // (onMouseUp do div + window listener podem ambos disparar).
    const bandejaDragFiredRef = useRef(false);

    const handleBandejaDragStart = (e, bi, bp) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        const mm = pixelToMM(e.clientX, e.clientY);
        setDraggingBandeja({
            bandejaIdx: bi,
            materialKey: bp.fromMaterial || chapa.material_code || chapa.material,
            w: bp.w, h: bp.h, pecaId: bp.pecaId,
            mouseX: mm.x, mouseY: mm.y,
            newX: mm.x - bp.w / 2, newY: mm.y - bp.h / 2,
            inSheet: false,
        });
        setDragCollision(false);
        setSnapGuides([]);
        bandejaDragFiredRef.current = false; // reseta flag a cada novo drag

        // Listener global — captura mouseup mesmo quando o ponteiro sai do canvas.
        // O flag bandejaDragFiredRef impede dupla execução se onMouseUp do div também disparar.
        const onGlobalUp = () => {
            if (!bandejaDragFiredRef.current) {
                bandejaDragFiredRef.current = true;
                bandejaDragEndRef.current?.();
            }
            window.removeEventListener('mouseup', onGlobalUp);
        };
        window.addEventListener('mouseup', onGlobalUp);
    };

    const handleBandejaDragMove = (e) => {
        if (!draggingBandeja) return;
        const mm = pixelToMM(e.clientX, e.clientY);
        const ref = chapa.refilo || 0;
        const uW = chapa.comprimento - 2 * ref;
        const uH = chapa.largura - 2 * ref;
        const pw = draggingBandeja.w, ph = draggingBandeja.h;
        // Peça centralizada no mouse
        let rx = mm.x - pw / 2;
        let ry = mm.y - ph / 2;

        // Se o CENTRO da peça ainda está fora da chapa, mostrar ghost flutuante (sem snap/colisão)
        if (mm.x > uW) {
            setDraggingBandeja(prev => ({ ...prev, mouseX: mm.x, mouseY: mm.y, newX: rx, newY: ry, inSheet: false }));
            setDragCollision(false);
            setSnapGuides([]);
            return;
        }

        // Dentro da chapa — clamp, snap, collision
        const maxX = uW - pw, maxY = uH - ph;
        rx = Math.max(0, Math.min(maxX, rx));
        ry = Math.max(0, Math.min(maxY, ry));
        const snap = magneticSnap(rx, ry, pw, ph, -1);
        rx = Math.round(Math.max(0, Math.min(maxX, snap.x)));
        ry = Math.round(Math.max(0, Math.min(maxY, snap.y)));
        setSnapGuides(snap.guides);
        const collision = isColliding(rx, ry, pw, ph, -1);
        setDragCollision(collision);
        setDraggingBandeja(prev => ({ ...prev, mouseX: mm.x, mouseY: mm.y, newX: rx, newY: ry, inSheet: true }));
    };

    const handleBandejaDragEnd = () => {
        if (!draggingBandeja) return;
        // Flag de idempotência — evita dupla execução (div onMouseUp + window listener)
        if (bandejaDragFiredRef.current) return;
        bandejaDragFiredRef.current = true;
        const db = draggingBandeja;
        setDraggingBandeja(null);
        setDragCollision(false);
        setSnapGuides([]);

        // Se não está sobre a chapa, cancela
        if (!db.inSheet) return;

        // Force-snap para posição válida
        const snapped = forceSnap(db.newX, db.newY, db.w, db.h, -1);
        if (!snapped.valid) return;

        if (onAdjust) onAdjust({
            action: 'from_bandeja',
            materialKey: db.materialKey,
            bandejaIdx: db.bandejaIdx,
            targetChapaIdx: idx,
            x: snapped.x,
            y: snapped.y,
        });
    };
    // Atualiza ref sincronamente no render — o listener global de mouseup usa o closure mais recente
    bandejaDragEndRef.current = handleBandejaDragEnd;

    // ─── Right-click context menu ───
    const handleCtxMenu = (e, pecaIdx) => {
        e.preventDefault();
        e.stopPropagation();
        const r = containerRef.current?.getBoundingClientRect();
        setCtxMenu({ x: e.clientX - (r?.left || 0), y: e.clientY - (r?.top || 0), pecaIdx });
    };

    useEffect(() => {
        if (!ctxMenu) return;
        const close = (e) => {
            // Don't close if clicking inside the context menu itself
            const menu = document.querySelector('[data-ctx-menu="piece"]');
            if (menu && menu.contains(e.target)) return;
            setCtxMenu(null);
        };
        // Delay listener to avoid Ctrl+click release on Mac closing the menu instantly
        const timer = setTimeout(() => document.addEventListener('mousedown', close), 50);
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
    }, [ctxMenu]);

    useEffect(() => {
        if (!sobraCtxMenu) return;
        const close = (e) => {
            const menu = document.querySelector('[data-ctx-menu="sobra"]');
            if (menu && menu.contains(e.target)) return;
            setSobraCtxMenu(null);
        };
        const timer = setTimeout(() => document.addEventListener('mousedown', close), 50);
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
    }, [sobraCtxMenu]);

    // (Drag de sobras removido — agora é por clique na barra "CORTAR")

    // ─── Piece click (select) ───
    const handlePieceClick = (e, pecaIdx) => {
        if (dragging) return;
        if (onSelectPiece) onSelectPiece(pecaIdx, e.ctrlKey || e.metaKey);
    };

    return (
        <div className="glass-card p-4" ref={containerRef} style={{ position: 'relative' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Box size={15} />
                    Chapa {idx + 1}: {chapa.material}
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>
                        ({chapa.comprimento} x {chapa.largura} mm)
                    </span>
                </h4>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={tagClass} style={tagStyle(chapa.aproveitamento >= 80 ? '#2563eb' : chapa.aproveitamento >= 60 ? '#d97706' : '#dc2626')}>
                        {chapa.aproveitamento.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{chapa.pecas.length} pç</span>
                    {chapa.is_retalho && <span className={tagClass} style={tagStyle('#0e7490')}>RETALHO</span>}
                    {hasVeio && (
                        <span className={tagClass} style={tagStyle('#7c3aed')}>
                            ━ Com Veio
                        </span>
                    )}
                    {/* Timer de corte */}
                    {timerInfo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: timerInfo.running ? 'rgba(34,197,94,0.08)' : 'var(--bg-muted)', border: `1px solid ${timerInfo.running ? 'rgba(34,197,94,0.3)' : 'var(--border)'}` }}>
                            <Clock size={11} style={{ color: timerInfo.running ? '#22c55e' : 'var(--text-muted)' }} />
                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: timerInfo.running ? '#22c55e' : 'var(--text-primary)' }}>
                                {timerInfo.formatTimer(timerInfo.elapsed)}
                            </span>
                            {timerInfo.estMin > 0 && (
                                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>/ {timerInfo.estMin}m</span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); timerInfo.running ? timerInfo.onStop() : timerInfo.onStart(); }}
                                style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: timerInfo.running ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', color: timerInfo.running ? '#ef4444' : '#22c55e' }}>
                                {timerInfo.running ? 'Pausar' : 'Iniciar'}
                            </button>
                            {timerInfo.hasTimer && !timerInfo.running && timerInfo.elapsed > 0 && (
                                <button onClick={(e) => { e.stopPropagation(); if (confirm('Resetar timer?')) timerInfo.onReset(); }}
                                    style={{ padding: '1px 4px', borderRadius: 4, fontSize: 9, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}
                                    title="Resetar timer">
                                    <Undo2 size={9} />
                                </button>
                            )}
                        </div>
                    )}
                    {onPrintLabel && (
                        <button onClick={() => onPrintLabel(idx)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                border: '1px solid var(--border)', cursor: 'pointer',
                            }}
                            title="Etiquetas desta chapa">
                            <TagIcon size={11} /> Etiquetas
                        </button>
                    )}
                    {onPrintFolha && (
                        <button onClick={() => onPrintFolha(idx)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                border: '1px solid var(--border)', cursor: 'pointer',
                            }}
                            title="Folha de Produção desta chapa">
                            <FileText size={11} /> Folha
                        </button>
                    )}
                    {/* Recalcular Sobras — detecta espaço livre SEM sobreposição */}
                    <button onClick={() => {
                        const ref = chapa.refilo || 0;
                        const uW = chapa.comprimento - 2 * ref;
                        const uH = chapa.largura - 2 * ref;
                        const pecas = chapa.pecas || [];
                        if (pecas.length === 0) return;

                        // ── Helper: recortar retângulo A removendo área de B ──
                        const clipRect = (a, b) => {
                            // Se não se tocam, A fica inteiro
                            if (a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h) return [a];
                            const result = [];
                            // Faixa acima de B
                            if (a.y < b.y) result.push({ x: a.x, y: a.y, w: a.w, h: b.y - a.y });
                            // Faixa abaixo de B
                            if (a.y + a.h > b.y + b.h) result.push({ x: a.x, y: b.y + b.h, w: a.w, h: (a.y + a.h) - (b.y + b.h) });
                            // Faixa à esquerda (só na zona de overlap Y)
                            const oy1 = Math.max(a.y, b.y), oy2 = Math.min(a.y + a.h, b.y + b.h);
                            if (oy2 > oy1) {
                                if (a.x < b.x) result.push({ x: a.x, y: oy1, w: b.x - a.x, h: oy2 - oy1 });
                                if (a.x + a.w > b.x + b.w) result.push({ x: b.x + b.w, y: oy1, w: (a.x + a.w) - (b.x + b.w), h: oy2 - oy1 });
                            }
                            return result.filter(r => r.w > 1 && r.h > 1);
                        };

                        // ── 1. Criar grade de células livres ──
                        const xsSet = new Set([0, uW]);
                        const ysSet = new Set([0, uH]);
                        for (const p of pecas) {
                            xsSet.add(Math.max(0, Math.min(uW, p.x)));
                            xsSet.add(Math.max(0, Math.min(uW, p.x + p.w)));
                            ysSet.add(Math.max(0, Math.min(uH, p.y)));
                            ysSet.add(Math.max(0, Math.min(uH, p.y + p.h)));
                        }
                        const xs = [...xsSet].sort((a, b) => a - b);
                        const ys = [...ysSet].sort((a, b) => a - b);
                        const nx = xs.length - 1, ny = ys.length - 1;
                        if (nx <= 0 || ny <= 0) return;

                        const occ = Array.from({ length: nx }, () => Array(ny).fill(false));
                        for (const p of pecas) {
                            for (let ci = 0; ci < nx; ci++) {
                                if (xs[ci + 1] <= p.x + 0.5 || xs[ci] >= p.x + p.w - 0.5) continue;
                                for (let cj = 0; cj < ny; cj++) {
                                    if (ys[cj + 1] <= p.y + 0.5 || ys[cj] >= p.y + p.h - 0.5) continue;
                                    occ[ci][cj] = true;
                                }
                            }
                        }

                        // ── 2. Histograma → retângulos maximais ──
                        const height = Array.from({ length: nx }, () => Array(ny).fill(0));
                        for (let ci = 0; ci < nx; ci++) {
                            for (let cj = 0; cj < ny; cj++) {
                                height[ci][cj] = occ[ci][cj] ? 0 : (cj > 0 ? height[ci][cj - 1] + 1 : 1);
                            }
                        }
                        const allRects = [];
                        for (let cj = 0; cj < ny; cj++) {
                            const stack = [];
                            for (let ci = 0; ci <= nx; ci++) {
                                const h = ci < nx ? height[ci][cj] : 0;
                                let start = ci;
                                while (stack.length && stack[stack.length - 1][1] > h) {
                                    const [sci, sh] = stack.pop();
                                    const rx = xs[sci], rw = (ci < xs.length ? xs[ci] : xs[xs.length - 1]) - rx;
                                    const ry = ys[cj - sh + 1], rh = ys[cj + 1] - ry;
                                    if (rw > 5 && rh > 5) allRects.push({ x: rx, y: ry, w: rw, h: rh, area: rw * rh });
                                    start = sci;
                                }
                                stack.push([start, h]);
                            }
                        }
                        // Deduplicar exatos
                        const seen = new Set();
                        const uniqueRects = allRects.filter(r => {
                            const key = `${r.x.toFixed(1)}_${r.y.toFixed(1)}_${r.w.toFixed(1)}_${r.h.toFixed(1)}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                        uniqueRects.sort((a, b) => b.area - a.area);

                        // ── 3. Seleção gulosa SEM sobreposição ──
                        // Pegar o maior, recortar todos os outros contra ele, repetir
                        const minW = sobraMinW, minH = sobraMinH;
                        const isValid = (r) => { const s = Math.min(r.w, r.h), l = Math.max(r.w, r.h); return s >= minW && l >= minH; };

                        const selected = [];
                        let candidates = uniqueRects.filter(r => isValid(r));

                        for (let iter = 0; iter < 20 && candidates.length > 0; iter++) {
                            // Pegar o maior candidato
                            candidates.sort((a, b) => (b.w * b.h) - (a.w * a.h));
                            const best = candidates.shift();
                            selected.push(best);

                            // Recortar todos os restantes contra o selecionado
                            const nextCandidates = [];
                            for (const c of candidates) {
                                const clipped = clipRect(c, best);
                                for (const piece of clipped) {
                                    piece.area = piece.w * piece.h;
                                    if (isValid(piece)) nextCandidates.push(piece);
                                }
                            }
                            candidates = nextCandidates;
                        }

                        // ── 4. Tentar merge adjacente dos selecionados ──
                        let rects = selected;
                        let merged = true;
                        while (merged) {
                            merged = false;
                            const next = [];
                            const skip = new Set();
                            for (let i = 0; i < rects.length; i++) {
                                if (skip.has(i)) continue;
                                let { x: rx, y: ry, w: rw, h: rh } = rects[i];
                                for (let j = i + 1; j < rects.length; j++) {
                                    if (skip.has(j)) continue;
                                    const o = rects[j];
                                    const T = 1;
                                    if (Math.abs(ry - o.y) < T && Math.abs(rh - o.h) < T && Math.abs(rx + rw - o.x) < T) { rw += o.w; skip.add(j); merged = true; }
                                    else if (Math.abs(ry - o.y) < T && Math.abs(rh - o.h) < T && Math.abs(o.x + o.w - rx) < T) { rx = o.x; rw += o.w; skip.add(j); merged = true; }
                                    else if (Math.abs(rx - o.x) < T && Math.abs(rw - o.w) < T && Math.abs(ry + rh - o.y) < T) { rh += o.h; skip.add(j); merged = true; }
                                    else if (Math.abs(rx - o.x) < T && Math.abs(rw - o.w) < T && Math.abs(o.y + o.h - ry) < T) { ry = o.y; rh += o.h; skip.add(j); merged = true; }
                                }
                                next.push({ x: rx, y: ry, w: rw, h: rh });
                            }
                            rects = next;
                        }

                        const remnants = rects
                            .filter(r => isValid(r))
                            .map(r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }));

                        if (onAdjust) {
                            onAdjust({ action: 'recalc_sobras', chapaIdx: idx, retalhos: remnants });
                        }
                    }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: 'var(--bg-muted)', color: 'var(--text-primary)',
                            border: '1px solid var(--border)', cursor: 'pointer',
                        }}
                        title="Detectar espaço livre e gerar retalhos baseado na posição atual das peças">
                        <RefreshCw size={11} /> Recalcular Sobras
                    </button>
                    {(chapa.retalhos?.length > 0) && (
                        <button onClick={() => {
                            if (!retMode) {
                                setRetDefs((chapa.retalhos || []).map(r => ({ ...r, type: null })));
                                setRetSelected(null);
                                setRetSplitPreview(null);
                            }
                            setRetMode(!retMode);
                        }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                background: retMode ? '#059669' : 'var(--bg-muted)',
                                color: retMode ? '#fff' : 'var(--text-primary)',
                                border: retMode ? '1px solid #059669' : '1px solid var(--border)', cursor: 'pointer',
                            }}
                            title="Definir retalhos e refugos">
                            <Scissors size={11} /> {retMode ? 'Editando Sobras' : 'Definir Sobras'}
                        </button>
                    )}
                    {onGerarGcode && (
                        <button
                            onClick={() => onGerarGcode(idx)}
                            disabled={gcodeLoading === idx}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: 800,
                                background: gcodeLoading === idx ? 'var(--bg-muted)' : '#1e40af',
                                color: '#fff', border: 'none', cursor: gcodeLoading === idx ? 'wait' : 'pointer',
                                boxShadow: gcodeLoading === idx ? 'none' : '0 6px 14px rgba(30,64,175,0.18)',
                            }}
                            title="Gerar G-code e abrir pré-corte desta chapa"
                        >
                            <Cpu size={11} />
                            {gcodeLoading === idx ? 'Gerando...' : 'Pré-corte'}
                        </button>
                    )}
                </div>
            </div>

            {/* Zoom controls */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                <button onClick={() => setZoomLevel(Math.max(1, zoomLevel - 0.2))} className={Z.btn2} style={{ padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>−</button>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', minWidth: 40, textAlign: 'center' }}>{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(Math.min(5, zoomLevel + 0.2))} className={Z.btn2} style={{ padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>+</button>
                <button onClick={resetView} className={Z.btn2} style={{ padding: '3px 8px', fontSize: 10 }}>Reset</button>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>Ctrl+Scroll=Zoom · Alt+Drag=Pan · DblClick=Rotacionar · Direito=Menu</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button onClick={() => setShowMachining(!showMachining)} className={Z.btn2}
                        style={{ padding: '3px 10px', fontSize: 10, fontWeight: 600,
                            background: showMachining ? '#e11d48' : undefined, color: showMachining ? '#fff' : undefined }}>
                        {showMachining ? '⊙ Usinagens' : '○ Usinagens'}
                    </button>
                    {chapa.cortes && chapa.cortes.length > 0 && (
                        <button onClick={() => setShowCuts(!showCuts)} className={Z.btn2}
                            style={{ padding: '3px 10px', fontSize: 10, fontWeight: 600,
                                background: showCuts ? 'var(--primary)' : undefined, color: showCuts ? '#fff' : undefined }}>
                            {showCuts ? 'Ocultar Cortes' : 'Mostrar Cortes'}
                        </button>
                    )}
                </div>
            </div>

            {/* Edge band legend — dynamic from actual piece data */}
            {(() => {
                const fitaSet = new Map();
                chapa.pecas.forEach(p => {
                    const pc = pecasMap[p.pecaId];
                    if (!pc) return;
                    ['frontal','traseira','esq','dir'].forEach(side => {
                        const tipo = pc[`borda_${side}`];
                        const cor = pc[`borda_cor_${side}`];
                        if (tipo) {
                            const key = cor || tipo;
                            if (!fitaSet.has(key)) fitaSet.set(key, edgeColorGlobal(tipo, cor));
                        }
                    });
                });
                if (fitaSet.size === 0) return null;
                return (
                    <div style={{ display: 'flex', gap: 10, padding: '3px 8px', fontSize: 9, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700 }}>Fitas:</span>
                        {[...fitaSet.entries()].map(([name, color]) => (
                            <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ width: 14, height: 3, borderRadius: 1, background: color, display: 'inline-block' }} />
                                {name.replace(/_/g, ' ')}
                            </span>
                        ))}
                    </div>
                );
            })()}

            {/* Machining legend */}
            {showMachining && (
                <div style={{ display: 'flex', gap: 12, padding: '4px 8px', fontSize: 9, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 700, fontSize: 10 }}>Usinagens:</span>
                    {/* Furos topo */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="#e11d48" opacity="0.55" stroke="#be123c" strokeWidth="0.8"/></svg>
                        Furos (topo)
                    </span>
                    {/* Furos fundo */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="#7c3aed" opacity="0.55" stroke="#6d28d9" strokeWidth="0.8"/></svg>
                        Furos (fundo)
                    </span>
                    {/* Rasgos */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="18" height="12"><line x1="1" y1="6" x2="17" y2="6" stroke="#eab308" strokeWidth="3" opacity="0.7" strokeLinecap="round"/></svg>
                        Rasgos / Canais
                    </span>
                    {/* Rebaixos */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="16" height="12"><rect x="1" y="1" width="14" height="10" fill="#f97316" opacity="0.35" stroke="#ea580c" strokeWidth="1" strokeDasharray="2,1" rx="1"/></svg>
                        Rebaixos / Pockets
                    </span>
                    {/* Fresagens */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="16" height="12"><rect x="1" y="2" width="14" height="8" fill="#06b6d4" opacity="0.4" stroke="#0891b2" strokeWidth="1" rx="4"/></svg>
                        Fresagens / Slots
                    </span>
                    {/* Contorno */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="16" height="12"><polygon points="2,10 8,1 14,10" fill="none" stroke="#10b981" strokeWidth="1.2" strokeDasharray="2,1"/></svg>
                        Contorno
                    </span>
                    {/* Lado oposto */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4, borderLeft: '1px solid var(--border)', paddingLeft: 8 }}>
                        <svg width="16" height="12">
                            <circle cx="6" cy="6" r="4" fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="2,1.5" opacity="0.5"/>
                            <line x1="10" y1="2" x2="14" y2="10" stroke="#64748b" strokeWidth="1" strokeDasharray="2,1.5" opacity="0.5"/>
                        </svg>
                        <span style={{ fontStyle: 'italic' }}>Lado oposto</span>
                    </span>
                </div>
            )}

            {/* SVG Canvas with zoom/pan */}
            {/* ref={wheelDivRef}: wheel é registrado via addEventListener { passive: false } no useEffect */}
            <div ref={wheelDivRef} style={{ overflow: 'hidden', border: `2px solid ${dragCollision ? '#ef4444' : (dragging || draggingBandeja) ? '#2563eb' : 'var(--border)'}`, background: '#f8f7f5', position: 'relative', cursor: (dragging || draggingBandeja) ? 'grabbing' : isPanningCursor(zoomLevel), transition: 'border-color .15s' }}
                onMouseDown={(dragging || draggingBandeja) ? undefined : onPanStart}
                onMouseMove={draggingBandeja ? handleBandejaDragMove : dragging ? handleDragMove : onPanMove}
                onMouseUp={draggingBandeja ? handleBandejaDragEnd : dragging ? handleDragEnd : onPanEnd}
                onMouseLeave={draggingBandeja ? handleBandejaDragEnd : dragging ? handleDragEnd : onPanEnd}
                onContextMenu={(e) => { if (dragging || draggingBandeja) { e.preventDefault(); return; } }}>
                <div style={{
                    transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                    transformOrigin: 'top left', transition: zoomLevel === 1 ? 'transform .2s' : 'none',
                }}>
                    <svg ref={svgRef} width={svgW + marginDim * 2 + 2 + trayGap + trayW} height={svgH + marginDim + 20}
                        viewBox={`-${marginDim} -14 ${svgW + marginDim * 2 + 2 + trayGap + trayW} ${svgH + marginDim + 20}`}
                        draggable="false"
                        style={{ display: 'block', userSelect: 'none' }}>

                        {/* Defs: grain pattern + text shadow filter */}
                        <defs>
                            <pattern id={`grain-h-${idx}`} patternUnits="userSpaceOnUse" width={svgW} height="6" patternTransform="rotate(0)">
                                <line x1="0" y1="3" x2={svgW} y2="3" stroke="#a08060" strokeWidth="0.4" opacity="0.3" />
                            </pattern>
                            <pattern id={`grain-v-${idx}`} patternUnits="userSpaceOnUse" width="6" height={svgH} patternTransform="rotate(0)">
                                <line x1="3" y1="0" x2="3" y2={svgH} stroke="#a08060" strokeWidth="0.4" opacity="0.3" />
                            </pattern>
                            <filter id={`ts-${idx}`} x="-5%" y="-5%" width="110%" height="110%">
                                <feDropShadow dx="0" dy="0.5" stdDeviation="0.8" floodColor="#000" floodOpacity="0.6"/>
                            </filter>
                        </defs>

                        {/* Dimension label: width (top) */}
                        <line x1={0} y1={-1} x2={svgW} y2={-1} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <line x1={0} y1={-6} x2={0} y2={3} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <line x1={svgW} y1={-6} x2={svgW} y2={3} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <text x={svgW / 2} y={-5} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontWeight={600}>
                            {chapa.comprimento} mm
                        </text>

                        {/* Grain direction arrow (top) */}
                        {hasVeio && (
                            <g>
                                <line x1={svgW * 0.2} y1={-12} x2={svgW * 0.8} y2={-12} stroke="#a08060" strokeWidth={1.5} markerEnd={`url(#arrow-${idx})`} />
                                <text x={svgW * 0.5} y={-13} textAnchor="middle" fontSize={7} fill="#a08060" fontWeight={700}>VEIO</text>
                                <defs>
                                    <marker id={`arrow-${idx}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                                        <polygon points="0 0, 6 2, 0 4" fill="#a08060" />
                                    </marker>
                                </defs>
                            </g>
                        )}

                        {/* Dimension label: height (left) */}
                        <line x1={-1} y1={0} x2={-1} y2={svgH} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <line x1={-6} y1={0} x2={3} y2={0} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <line x1={-6} y1={svgH} x2={3} y2={svgH} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <text x={-4} y={svgH / 2} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontWeight={600}
                            transform={`rotate(-90, -4, ${svgH / 2})`}>
                            {chapa.largura} mm
                        </text>

                        {/* Sheet background — cor baseada no material */}
                        <rect x={0} y={0} width={svgW} height={svgH}
                            fill={(() => {
                                const mat = (chapa.material || '').toUpperCase();
                                if (mat.includes('BRANCO') || mat.includes('WHITE') || mat.includes('BP_BR')) return '#f5f0e8';
                                if (mat.includes('PRETO') || mat.includes('BLACK')) return '#a09890';
                                if (mat.includes('CINZA') || mat.includes('GRAFITE')) return '#c8c0b8';
                                if (mat.includes('FREIJO') || mat.includes('CARVALHO')) return '#d4a76a';
                                if (mat.includes('NOGUEIRA') || mat.includes('NOGAL')) return '#b8906a';
                                if (mat.includes('CANELA')) return '#c49a6c';
                                if (mat.includes('AMENDOA')) return '#d4b896';
                                if (mat.includes('RUSTICO') || mat.includes('DEMOLICAO')) return '#b8956a';
                                return '#eae5dc';
                            })()} stroke="#8a7d6d" strokeWidth={1.5} />

                        {/* Grain pattern overlay on sheet */}
                        {hasVeio && (
                            <rect x={0} y={0} width={svgW} height={svgH}
                                fill={`url(#grain-h-${idx})`} />
                        )}

                        {/* Machine work area boundary overlay */}
                        {machineArea && (chapa.comprimento > machineArea.x_max || chapa.largura > machineArea.y_max) && (
                            <g>
                                <rect x={0} y={0}
                                    width={Math.min(machineArea.x_max, chapa.comprimento) * scale}
                                    height={Math.min(machineArea.y_max, chapa.largura) * scale}
                                    fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="8,4" opacity={0.7} />
                                <text x={Math.min(machineArea.x_max, chapa.comprimento) * scale - 4} y={12}
                                    textAnchor="end" fontSize={8} fill="#3b82f6" fontWeight={700} opacity={0.8}>
                                    Área máq: {machineArea.x_max}×{machineArea.y_max}mm
                                </text>
                                {/* Danger zone beyond machine limits */}
                                {chapa.comprimento > machineArea.x_max && (
                                    <rect x={machineArea.x_max * scale} y={0}
                                        width={(chapa.comprimento - machineArea.x_max) * scale} height={svgH}
                                        fill="rgba(239,68,68,0.1)" stroke="none" />
                                )}
                                {chapa.largura > machineArea.y_max && (
                                    <rect x={0} y={machineArea.y_max * scale}
                                        width={svgW} height={(chapa.largura - machineArea.y_max) * scale}
                                        fill="rgba(239,68,68,0.1)" stroke="none" />
                                )}
                            </g>
                        )}

                        {/* Refilo area (border trim) — zona proibida com hachura */}
                        {refiloVal > 0 && <>
                            <defs>
                                <pattern id={`refilo-hatch-${idx}`} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
                                    <line x1={0} y1={0} x2={0} y2={4} stroke="rgba(200,60,60,0.35)" strokeWidth={0.8} />
                                </pattern>
                            </defs>
                            <rect x={0} y={0} width={svgW} height={refilo} fill={`url(#refilo-hatch-${idx})`} />
                            <rect x={0} y={svgH - refilo} width={svgW} height={refilo} fill={`url(#refilo-hatch-${idx})`} />
                            <rect x={0} y={refilo} width={refilo} height={svgH - 2 * refilo} fill={`url(#refilo-hatch-${idx})`} />
                            <rect x={svgW - refilo} y={refilo} width={refilo} height={svgH - 2 * refilo} fill={`url(#refilo-hatch-${idx})`} />
                            {refilo > 6 && (
                                <text x={refilo / 2} y={svgH / 2} textAnchor="middle" fontSize={Math.min(7, refilo * 0.7)} fill="rgba(180,50,50,0.6)"
                                    transform={`rotate(-90, ${refilo / 2}, ${svgH / 2})`}>
                                    refilo {refiloVal}mm
                                </text>
                            )}
                        </>}

                        {/* Useful area border */}
                        {refiloVal > 0 && (
                            <rect x={refilo} y={refilo} width={svgW - 2 * refilo} height={svgH - 2 * refilo}
                                fill="none" stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 2" opacity={0.5} />
                        )}

                        {/* ══ KERF visualization ══ */}
                        {kerfSize > 0 && chapa.pecas.map((p, pi) => {
                            if (dragging?.pecaIdx === pi) return null;
                            const kx = (p.x + refiloVal) * scale - kerfPx;
                            const ky = (p.y + refiloVal) * scale - kerfPx;
                            const kw = p.w * scale + kerfPx * 2;
                            const kh = p.h * scale + kerfPx * 2;
                            return <rect key={`kerf-${pi}`} x={kx} y={ky} width={kw} height={kh}
                                fill="none" stroke="#d4a053" strokeWidth={0.5} strokeDasharray="2 2" opacity={0.35} />;
                        })}

                        {/* ══ Snap guide lines ══ */}
                        {snapGuides.map((sg, i) => (
                            sg.t === 'v'
                                ? <line key={`sg${i}`} x1={(sg.p + refiloVal) * scale} y1={0} x2={(sg.p + refiloVal) * scale} y2={svgH} stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" opacity={0.6} />
                                : <line key={`sg${i}`} x1={0} y1={(sg.p + refiloVal) * scale} x2={svgW} y2={(sg.p + refiloVal) * scale} stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" opacity={0.6} />
                        ))}

                        {/* ══ Ghost outline (original position during drag) ══ */}
                        {dragging && (() => {
                            const p = chapa.pecas[dragging.pecaIdx];
                            return <rect x={(p.x + refiloVal) * scale} y={(p.y + refiloVal) * scale}
                                width={p.w * scale} height={p.h * scale}
                                fill="none" stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 4" opacity={0.35} />;
                        })()}

                        {/* Cut lines (toggle) — formato GuillotineBin: {dir, x, y, length} */}
                        {showCuts && chapa.cortes && chapa.cortes.map((c, ci) => {
                            const isH = c.dir === 'Horizontal';
                            const isRet = c.tipo === 'separacao_retalho';
                            // GuillotineBin format: x, y, length (position within usable area)
                            const cx = (c.x != null ? c.x : 0) + refiloVal;
                            const cy = (c.y != null ? c.y : (c.pos || 0)) + refiloVal;
                            const len = c.length || c.len || (isH ? chapa.comprimento - 2 * refiloVal : chapa.largura - 2 * refiloVal);
                            const color = isRet ? '#059669' : (isH ? '#ef4444' : '#f59e0b');
                            return (
                                <g key={`cut${ci}`}>
                                    {isH ? (
                                        <line x1={cx * scale} y1={cy * scale}
                                            x2={(cx + len) * scale} y2={cy * scale}
                                            stroke={`${color}80`} strokeWidth={isRet ? 2 : 1.5} strokeDasharray={isRet ? '8 4' : '6 3'} />
                                    ) : (
                                        <line x1={cx * scale} y1={cy * scale}
                                            x2={cx * scale} y2={(cy + len) * scale}
                                            stroke={`${color}80`} strokeWidth={isRet ? 2 : 1.5} strokeDasharray={isRet ? '8 4' : '6 3'} />
                                    )}
                                    <text x={isH ? cx * scale + 3 : cx * scale + 2}
                                        y={isH ? cy * scale - 2 : cy * scale + 10}
                                        fontSize={7} fill={color} fontWeight={700}>
                                        {isRet ? `R${c.seq || ''}` : (c.seq || (ci + 1))}
                                    </text>
                                </g>
                            );
                        })}

                        {/* ══ Sheet locked overlay ══ */}
                        {chapa.locked && (
                            <rect x={refilo} y={refilo}
                                width={(chapa.comprimento - 2 * refiloVal) * scale}
                                height={(chapa.largura - 2 * refiloVal) * scale}
                                fill="rgba(59,130,246,0.06)" pointerEvents="none" />
                        )}

                        {/* ══ Sobras/Retalhos — verde para aproveitáveis, cinza para refugo ══ */}
                        {(chapa.retalhos || []).map((r, ri) => {
                            const srx = (r.x + refiloVal) * scale;
                            const sry = (r.y + refiloVal) * scale;
                            const srw = r.w * scale;
                            const srh = r.h * scale;
                            const hatchId = `hatch-${idx}-${ri}`;
                            // Sobra aproveitável (>=200x200) = verde, senão = cinza
                            const isAproveitavel = Math.round(Math.max(r.w, r.h)) >= 200 && Math.round(Math.min(r.w, r.h)) >= 200;
                            const sobraColor = r.status === 'criado' ? '#059669' : isAproveitavel ? '#22c55e' : '#9ca3af';
                            const sobraLabel = r.status === 'criado' ? 'Retalho' : isAproveitavel ? 'Sobra' : 'Refugo';
                            return (
                                <g key={`s${ri}`} style={{ cursor: 'pointer' }}
                                    onContextMenu={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        const cr = containerRef.current?.getBoundingClientRect();
                                        setSobraCtxMenu({ x: e.clientX - (cr?.left || 0), y: e.clientY - (cr?.top || 0), retalhoIdx: ri, chapaIdx: idx });
                                        setCtxMenu(null);
                                    }}>
                                    <defs>
                                        <pattern id={hatchId} patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
                                            <line x1={0} y1={0} x2={0} y2={8} stroke={sobraColor} strokeWidth={0.8} opacity={0.5} />
                                        </pattern>
                                    </defs>
                                    <rect x={srx} y={sry} width={srw} height={srh}
                                        fill={isAproveitavel ? `${sobraColor}12` : `url(#${hatchId})`}
                                        stroke={sobraColor} strokeWidth={isAproveitavel ? 1.5 : 0.8}
                                        strokeDasharray={isAproveitavel ? '6 3' : 'none'}
                                        opacity={isAproveitavel ? 0.85 : 0.5} />
                                    {srw > 40 && srh > 16 && (
                                        <>
                                            <text x={srx + srw / 2} y={sry + srh / 2 - (srh > 30 ? 6 : 0)}
                                                textAnchor="middle" dominantBaseline="central"
                                                fontSize={Math.min(9, srw / 7)} fill={sobraColor} fontWeight={700}
                                                stroke="#fff" strokeWidth={2.5} paintOrder="stroke"
                                                style={{ pointerEvents: 'none' }}>
                                                {Math.round(r.w)}×{Math.round(r.h)}
                                            </text>
                                            {srh > 30 && (
                                                <text x={srx + srw / 2} y={sry + srh / 2 + 8}
                                                    textAnchor="middle" dominantBaseline="central"
                                                    fontSize={Math.min(7, srw / 9)} fill={sobraColor} fontWeight={600}
                                                    stroke="#fff" strokeWidth={2} paintOrder="stroke"
                                                    style={{ pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {sobraLabel}
                                                </text>
                                            )}
                                        </>
                                    )}
                                </g>
                            );
                        })}

                        {/* ══ PIECES with collision feedback, lock, selection ══ */}
                        {chapa.pecas.map((p, pi) => {
                            const px = (p.x + refiloVal) * scale;
                            const py = (p.y + refiloVal) * scale;
                            const pw = p.w * scale;
                            const ph = p.h * scale;
                            const color = getModColor(p.pecaId, p);
                            const isHovered = hovered === pi;
                            const piece = pecasMap[p.pecaId];
                            const isSelected = selectedPieces.includes(pi);
                            const isDragging = dragging?.pecaIdx === pi;
                            const isLocked = p.locked || chapa.locked;
                            const pieceClipId = `piece-clip-${idx}-${pi}`;

                            // Dynamic colors during drag
                            let fillColor = color, strokeClr = color, strokeW = isHovered ? 2.5 : 1;
                            if (isDragging) {
                                fillColor = dragCollision ? '#ef4444' : '#2563eb';
                                strokeClr = dragCollision ? '#ef4444' : '#2563eb';
                                strokeW = 2.5;
                            }
                            if (isSelected && !isDragging) strokeW = 2.5;

                            return (
                                <g key={pi} data-pidx={pi}
                                    onMouseEnter={() => !dragging && setHovered(pi)}
                                    onMouseLeave={() => !dragging && setHovered(null)}
                                    onMouseDown={(e) => handleDragStart(e, pi)}
                                    onClick={(e) => handlePieceClick(e, pi)}
                                    onDoubleClick={() => handleRotate(pi)}
                                    onContextMenu={(e) => handleCtxMenu(e, pi)}
                                    style={{ cursor: isLocked ? 'not-allowed' : dragging ? 'grabbing' : 'grab' }}>

                                    {/* Piece fill — contour polygon, passante milling outline, or rectangle */}
                                    {(() => {
                                        const fillOp = isDragging ? 0.3 : isHovered ? 0.85 : 0.7;
                                        const strokeC = isDragging ? strokeClr : '#1a1a1a';
                                        const strokeWW = isDragging ? strokeW : isHovered ? 1.5 : 0.8;
                                        const pieceClipId = `pclip-${idx}-${pi}`;

                                        // Case 1: nesting contour from optimizer
                                        if (p.contour && p.contour.length >= 3) {
                                            // Contour is in piece LOCAL coords: x=comprimento, y=largura (y=0 at bottom)
                                            const extX = Math.max(...p.contour.map(v => v.x)) || p.w;
                                            const extY = Math.max(...p.contour.map(v => v.y)) || p.h;
                                            // Detect rotation by comparing placed dims with contour extent
                                            const cRotMatchW = Math.abs(p.w - extY) <= 2;
                                            const cRotMatchH = Math.abs(p.w - extX) <= 2;
                                            const cIsRot = (cRotMatchW && !cRotMatchH) ? true : (cRotMatchH && !cRotMatchW) ? false : p.rotated;
                                            return (
                                                <>
                                                    <defs>
                                                        <clipPath id={pieceClipId}>
                                                            <rect x={px} y={py} width={pw} height={ph} />
                                                        </clipPath>
                                                    </defs>
                                                    <rect x={px} y={py} width={pw} height={ph}
                                                        fill={fillColor} fillOpacity={isDragging ? 0.15 : 0.25}
                                                        stroke="#999" strokeWidth={0.4} strokeDasharray="3 2" />
                                                    <polygon clipPath={`url(#${pieceClipId})`}
                                                        points={p.contour.map(v => {
                                                            if (cIsRot) {
                                                                // Rotation: swap axes + same transform as toSvg
                                                                // Contour Y → screen X, Contour X → screen Y (inverted)
                                                                return `${px + (v.y / extY) * pw},${py + (1 - v.x / extX) * ph}`;
                                                            }
                                                            // Non-rotated: Y-flip (contour Y=0 is bottom, SVG Y=0 is top)
                                                            return `${px + (v.x / extX) * pw},${py + (1 - v.y / extY) * ph}`;
                                                        }).join(' ')}
                                                        fill={fillColor} fillOpacity={isDragging ? 0.3 : isHovered ? 0.85 : 0.65}
                                                        stroke={strokeC} strokeWidth={isDragging ? strokeW : isHovered ? 2.5 : 2} />
                                                </>
                                            );
                                        }

                                        // Case 2: passante milling from machining_json → build real outline
                                        if (piece?.machining_json && piece.machining_json !== '{}') {
                                            try {
                                                const mach = typeof piece.machining_json === 'string' ? JSON.parse(piece.machining_json) : piece.machining_json;
                                                if (mach.workers) {
                                                    const wArr = Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers);
                                                    const espVal = Number(piece.espessura) || 18;
                                                    const compOrig = Number(piece.comprimento) || p.w;
                                                    const largOrig = Number(piece.largura) || p.h;
                                                    const openPaths = [];
                                                    for (const w of wArr) {
                                                        if (!w) continue;
                                                        const cat = (w.category || '').toLowerCase();
                                                        if (!cat.includes('milling')) continue;
                                                        const depth = w.depth || w.usedepth || 0;
                                                        if (depth < espVal * 0.9) continue;
                                                        if (String(w.close) === '1') continue; // closed = internal cutout, not edge
                                                        const positions = w.positions;
                                                        if (!positions || typeof positions !== 'object') continue;
                                                        const keys = Object.keys(positions).sort((a, b) => Number(a) - Number(b));
                                                        if (keys.length < 2) continue;
                                                        const pts = keys.map(k => {
                                                            const pt = positions[k];
                                                            if (Array.isArray(pt)) return [pt[0], pt[1]];
                                                            return [Number(pt.x ?? pt.position_x ?? 0), Number(pt.y ?? pt.position_y ?? 0)];
                                                        });
                                                        openPaths.push(pts);
                                                    }
                                                    if (openPaths.length > 0) {
                                                        // buildOutlineWithCuts works in shape space [0..SX, 0..SZ]
                                                        // Use piece original dimensions as shape space
                                                        const outline = buildMillingOutline(compOrig, largOrig, openPaths);
                                                        // Detect rotation by comparing placed dimensions with original
                                                        const wMatchC = Math.abs(p.w - compOrig) <= 1;
                                                        const wMatchL = Math.abs(p.w - largOrig) <= 1;
                                                        const isRot = (wMatchL && !wMatchC) ? true : (wMatchC && !wMatchL) ? false : p.rotated;
                                                        const svgPts = outline.map(pt => {
                                                            let svgX, svgY;
                                                            if (isRot) {
                                                                // Rotation: outline Y→screen X, outline X→screen Y (inverted)
                                                                // Same transform as toSvg: lx=my, ly=comp-mx
                                                                svgX = pt[1] * (pw / largOrig);
                                                                svgY = (compOrig - pt[0]) * (ph / compOrig);
                                                            } else {
                                                                // Non-rotated: Y-flip (outline Y=0 is bottom, SVG Y=0 is top)
                                                                svgX = pt[0] * (pw / compOrig);
                                                                svgY = (largOrig - pt[1]) * (ph / largOrig);
                                                            }
                                                            return `${px + svgX},${py + svgY}`;
                                                        }).join(' ');
                                                        return (
                                                            <>
                                                                <defs>
                                                                    <clipPath id={pieceClipId}>
                                                                        <rect x={px} y={py} width={pw} height={ph} />
                                                                    </clipPath>
                                                                </defs>
                                                                <rect x={px} y={py} width={pw} height={ph}
                                                                    fill={fillColor} fillOpacity={0.1}
                                                                    stroke="#999" strokeWidth={0.3} strokeDasharray="2 2" />
                                                                <polygon points={svgPts} clipPath={`url(#${pieceClipId})`}
                                                                    fill={fillColor} fillOpacity={fillOp}
                                                                    stroke={strokeC} strokeWidth={strokeWW} />
                                                            </>
                                                        );
                                                    }
                                                }
                                            } catch { /* fall through to rect */ }
                                        }

                                        // Case 3: simple rectangle
                                        return (
                                            <rect x={px} y={py} width={pw} height={ph}
                                                fill={fillColor} fillOpacity={fillOp}
                                                stroke={strokeC} strokeWidth={strokeWW} />
                                        );
                                    })()}

                                    {/* Selection border */}
                                    {isSelected && !isDragging && (
                                        <rect x={px - 2} y={py - 2} width={pw + 4} height={ph + 4}
                                            fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 2" />
                                    )}

                                    {/* Grain lines on piece — veio sempre horizontal */}
                                    {hasVeio && pw > 20 && ph > 20 && (
                                        <g opacity={0.22}>
                                            {Array.from({ length: Math.floor(ph / 5) }, (_, i) => (
                                                <line key={i} x1={px + 1} y1={py + i * 5 + 2.5} x2={px + pw - 1} y2={py + i * 5 + 2.5}
                                                    stroke="#a08060" strokeWidth={0.5} />
                                            ))}
                                        </g>
                                    )}

                                    {/* Piece label — peças grandes mostram nome + dimensão; médias só nome;
                                        pequenas (até ~14px) ainda mostram número da peça (P{n}) para
                                        rastrear na bancada. Garante que NENHUMA peça fique sem rótulo. */}
                                    {pw > 35 && ph > 16 ? (
                                        <text x={px + pw / 2} y={py + ph / 2 - (pw > 50 && ph > 28 ? 5 : 0)}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.min(10, Math.min(pw / 8, ph / 3))} fill="#1a1a1a" fontWeight={700}
                                            stroke="#fff" strokeWidth={2.5} paintOrder="stroke"
                                            style={{ pointerEvents: 'none' }}>
                                            {piece ? piece.descricao?.substring(0, Math.floor(pw / 6)) : `P${pi + 1}`}
                                        </text>
                                    ) : (pw > 14 && ph > 10) && (
                                        // Peça pequena: mostra apenas número, sem stroke pra economizar pixels
                                        <text x={px + pw / 2} y={py + ph / 2}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.max(6, Math.min(8, Math.min(pw / 3, ph / 2)))} fill="#1a1a1a" fontWeight={800}
                                            stroke="#fff" strokeWidth={1.5} paintOrder="stroke"
                                            style={{ pointerEvents: 'none' }}>
                                            {pi + 1}
                                        </text>
                                    )}
                                    {/* Piece dimensions */}
                                    {pw > 50 && ph > 28 && (
                                        <text x={px + pw / 2} y={py + ph / 2 + 7}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.min(8, pw / 10)} fill="#333" fontWeight={600}
                                            stroke="#fff" strokeWidth={2} paintOrder="stroke"
                                            style={{ pointerEvents: 'none' }}>
                                            {Math.round(p.w)} × {Math.round(p.h)}
                                        </text>
                                    )}
                                    {/* Rotation indicator */}
                                    {p.rotated && pw > 18 && ph > 18 && (
                                        <g style={{ pointerEvents: 'none' }}>
                                            <rect x={px + 2} y={py + 2} width={14} height={11}
                                                fill="rgba(0,0,0,0.5)" />
                                            <text x={px + 9} y={py + 10} textAnchor="middle" fontSize={8} fill="#fff" fontWeight={700}>R</text>
                                        </g>
                                    )}

                                    {/* Side B indicator (flip) */}
                                    {p.lado_ativo === 'B' && pw > 18 && ph > 18 && (
                                        <g style={{ pointerEvents: 'none' }}>
                                            <rect x={px + pw - 18} y={py + ph - 15} width={16} height={13}
                                                fill="rgba(14,165,233,0.85)" rx={2} />
                                            <text x={px + pw - 10} y={py + ph - 5} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={800}>B</text>
                                        </g>
                                    )}
                                    {/* Side B overlay tint */}
                                    {p.lado_ativo === 'B' && (
                                        <rect x={px} y={py} width={pw} height={ph}
                                            fill="#0ea5e9" fillOpacity={0.08}
                                            style={{ pointerEvents: 'none' }} />
                                    )}

                                    {/* Machining operations rendered by renderMachining() below with smart rotation detection */}

                                    {/* Lado ativo indicator — A↑ or B↑ */}
                                    {pw > 30 && ph > 22 && piece?.machining_json && piece.machining_json !== '{}' && (() => {
                                        const lado = p.lado_ativo || 'A';
                                        const isManual = p.lado_manual;
                                        const bgColor = lado === 'B' ? '#f59e0b' : '#2563eb';
                                        return (
                                            <g style={{ pointerEvents: 'none' }}
                                                transform={`translate(${px + pw - 20}, ${py + 2})`}>
                                                <rect width={18} height={12} rx={2}
                                                    fill={bgColor} opacity={0.85} />
                                                <text x={9} y={9} textAnchor="middle"
                                                    fontSize={7} fill="#fff" fontWeight={800}>
                                                    {lado}↑
                                                </text>
                                                {isManual && (
                                                    <rect x={-2} y={-2} width={22} height={16} rx={3}
                                                        fill="none" stroke="#fff" strokeWidth={0.8} />
                                                )}
                                            </g>
                                        );
                                    })()}

                                    {/* Classification badge (pequena/super_pequena) */}
                                    {classifyLocal && pw > 18 && ph > 18 && (() => {
                                        const cls = p.classificacao || classifyLocal(p.w, p.h);
                                        if (cls === 'normal') return null;
                                        const clsC = classColors[cls] || '#f59e0b';
                                        const label = cls === 'super_pequena' ? 'SP' : 'P';
                                        return (
                                            <g transform={`translate(${px + 2}, ${py + ph - 14})`} style={{ pointerEvents: 'none' }}>
                                                <rect width={cls === 'super_pequena' ? 16 : 12} height={11} fill={clsC} opacity={0.9} />
                                                <text x={cls === 'super_pequena' ? 8 : 6} y={8} textAnchor="middle" fontSize={7} fill="#fff" fontWeight={800}>{label}</text>
                                            </g>
                                        );
                                    })()}

                                    {/* Edge band indicators (fita borda) — follows contour for irregular pieces */}
                                    {piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira) && pw > 12 && ph > 12 && (() => {
                                        if (p.contour && p.contour.length >= 3) {
                                            // For contour pieces, draw edge band as a polyline along the contour
                                            const anyBorda = piece.borda_frontal || piece.borda_traseira || piece.borda_dir || piece.borda_esq;
                                            const c = edgeColorGlobal(anyBorda, piece.borda_cor_frontal || piece.borda_cor_dir || piece.borda_cor_esq || piece.borda_cor_traseira);
                                            const pts = p.contour.map(v => `${px + (v.x / p.w) * pw},${py + (v.y / p.h) * ph}`).join(' ');
                                            return (
                                                <g style={{ pointerEvents: 'none' }}>
                                                    <polygon points={pts} fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
                                                </g>
                                            );
                                        }
                                        const t = 1.8, inset = 0.5;
                                        const edges = [
                                            piece.borda_frontal && { x1: px + inset, y1: py + t/2, x2: px + pw - inset, y2: py + t/2, c: edgeColorGlobal(piece.borda_frontal, piece.borda_cor_frontal) },
                                            piece.borda_traseira && { x1: px + inset, y1: py + ph - t/2, x2: px + pw - inset, y2: py + ph - t/2, c: edgeColorGlobal(piece.borda_traseira, piece.borda_cor_traseira) },
                                            piece.borda_esq && { x1: px + t/2, y1: py + inset, x2: px + t/2, y2: py + ph - inset, c: edgeColorGlobal(piece.borda_esq, piece.borda_cor_esq) },
                                            piece.borda_dir && { x1: px + pw - t/2, y1: py + inset, x2: px + pw - t/2, y2: py + ph - inset, c: edgeColorGlobal(piece.borda_dir, piece.borda_cor_dir) },
                                        ].filter(Boolean);
                                        return edges.length > 0 && (
                                            <g style={{ pointerEvents: 'none' }}>
                                                {edges.map((e, i) => (
                                                    <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                                                        stroke={e.c} strokeWidth={t} strokeLinecap="round" />
                                                ))}
                                            </g>
                                        );
                                    })()}

                                    {/* Machining operations (usinagens) */}
                                    {showMachining && piece && pw > 25 && ph > 25 &&
                                        renderMachining(piece, px, py, pw, ph, scale, p.rotated, p.w, p.h, p.lado_ativo, setMachTip)
                                    }

                                    {/* ══ Lock icon ══ */}
                                    {isLocked && pw > 18 && ph > 18 && (
                                        <g transform={`translate(${px + pw - 16}, ${py + 3})`} style={{ pointerEvents: 'none' }}>
                                            <rect width={13} height={12} rx={2} fill="rgba(0,0,0,0.5)" />
                                            <rect x={2} y={5} width={9} height={6} rx={1} fill="#fbbf24" />
                                            <path d="M4 5 V3.5 A2.5 2.5 0 0 1 9 3.5 V5" fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeLinecap="round" />
                                        </g>
                                    )}

                                    {/* Validation conflict warning */}
                                    {validationConflicts.some(c => c.chapaIdx === idx && c.pecaIdx === pi) && pw > 18 && ph > 18 && (
                                        <g style={{ pointerEvents: 'none' }}>
                                            <polygon
                                                points={`${px + pw / 2 - 7},${py + 2 + 12} ${px + pw / 2},${py + 2} ${px + pw / 2 + 7},${py + 2 + 12}`}
                                                fill="#ef4444" opacity={0.9} stroke="#fff" strokeWidth={0.5} />
                                            <text x={px + pw / 2} y={py + 2 + 10} textAnchor="middle" fontSize={8} fill="#fff" fontWeight={900}>!</text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {/* ══ Retalhos Mode Overlay ══ */}
                        {retMode && retDefs.map((rd, ri) => {
                            const rx = (rd.x + refiloVal) * scale;
                            const ry = (rd.y + refiloVal) * scale;
                            const rw = rd.w * scale;
                            const rh = rd.h * scale;
                            const isSelected = retSelected === ri;
                            const fillColor = rd.type === 'retalho' ? '#059669' : rd.type === 'refugo' ? '#dc2626' : '#3b82f6';
                            const fillOpacity = rd.type ? 0.25 : 0.1;
                            const strokeColor = isSelected ? '#fff' : fillColor;
                            return (
                                <g key={`rm${ri}`} style={{ cursor: 'pointer' }}
                                    onClick={(e) => { e.stopPropagation(); setRetSelected(isSelected ? null : ri); setRetSplitPreview(null); }}>
                                    <rect x={rx} y={ry} width={rw} height={rh}
                                        fill={fillColor} fillOpacity={fillOpacity}
                                        stroke={strokeColor} strokeWidth={isSelected ? 2 : 1}
                                        strokeDasharray={isSelected ? '6 3' : rd.type ? 'none' : '4 2'} />
                                    {/* Label */}
                                    <text x={rx + rw / 2} y={ry + rh / 2 - (rh > 30 ? 7 : 0)}
                                        textAnchor="middle" dominantBaseline="central"
                                        fontSize={Math.min(11, rw / 8)} fontWeight={700}
                                        fill={fillColor} stroke="#fff" strokeWidth={2.5} paintOrder="stroke"
                                        style={{ pointerEvents: 'none' }}>
                                        {Math.round(rd.w)}×{Math.round(rd.h)}
                                    </text>
                                    {rh > 30 && (
                                        <text x={rx + rw / 2} y={ry + rh / 2 + 8}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.min(9, rw / 10)} fontWeight={600}
                                            fill={fillColor} stroke="#fff" strokeWidth={2} paintOrder="stroke"
                                            style={{ pointerEvents: 'none' }}>
                                            {rd.type === 'retalho' ? '✓ RETALHO' : rd.type === 'refugo' ? '✗ REFUGO' : 'Clique p/ definir'}
                                        </text>
                                    )}
                                    {/* Split preview line */}
                                    {retSplitPreview && retSplitPreview.retIdx === ri && (() => {
                                        const sp = retSplitPreview;
                                        if (sp.axis === 'h') {
                                            const ly = (sp.pos + refiloVal) * scale;
                                            return <line x1={rx} y1={ly} x2={rx + rw} y2={ly}
                                                stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" />;
                                        } else {
                                            const lx = (sp.pos + refiloVal) * scale;
                                            return <line x1={lx} y1={ry} x2={lx} y2={ry + rh}
                                                stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" />;
                                        }
                                    })()}
                                </g>
                            );
                        })}

                        {/* Barra clicável na divisa entre sobras — clique = cortar a linha (toggle) */}
                        {(chapa.retalhos?.length >= 2) && (() => {
                            const rets = chapa.retalhos;
                            const handles = [];
                            const tol = 5;
                            const pecas = chapa.pecas || [];
                            const ref = chapa.refilo || 0;
                            const uW = chapa.comprimento - 2 * ref;
                            const uH = chapa.largura - 2 * ref;
                            const noOverlap = (r) => !pecas.some(p => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);

                            // Função: cortar a linha — a menor sobra atravessa, a maior é cortada
                            const cutLine = (e, i, j, axis) => {
                                e.stopPropagation();
                                const a = rets[i], b = rets[j];
                                // Determinar qual é a menor (ela atravessa)
                                const aArea = a.w * a.h, bArea = b.w * b.h;
                                let extending, clipped;

                                if (axis === 'y') {
                                    // Divisa horizontal — sobras empilhadas
                                    // A menor atravessa verticalmente (ganha altura total)
                                    if (aArea <= bArea) {
                                        extending = { x: a.x, y: Math.min(a.y, b.y), w: a.w, h: a.h + b.h };
                                        // B perde a coluna de A
                                        if (a.x >= b.x) {
                                            clipped = { x: b.x, y: b.y, w: a.x - b.x, h: b.h };
                                        } else {
                                            clipped = { x: a.x + a.w, y: b.y, w: (b.x + b.w) - (a.x + a.w), h: b.h };
                                        }
                                    } else {
                                        extending = { x: b.x, y: Math.min(a.y, b.y), w: b.w, h: a.h + b.h };
                                        if (b.x >= a.x) {
                                            clipped = { x: a.x, y: a.y, w: b.x - a.x, h: a.h };
                                        } else {
                                            clipped = { x: b.x + b.w, y: a.y, w: (a.x + a.w) - (b.x + b.w), h: a.h };
                                        }
                                    }
                                } else {
                                    // Divisa vertical — sobras lado a lado
                                    if (aArea <= bArea) {
                                        extending = { x: Math.min(a.x, b.x), y: a.y, w: a.w + b.w, h: a.h };
                                        if (a.y >= b.y) {
                                            clipped = { x: b.x, y: b.y, w: b.w, h: a.y - b.y };
                                        } else {
                                            clipped = { x: b.x, y: a.y + a.h, w: b.w, h: (b.y + b.h) - (a.y + a.h) };
                                        }
                                    } else {
                                        extending = { x: Math.min(a.x, b.x), y: b.y, w: a.w + b.w, h: b.h };
                                        if (b.y >= a.y) {
                                            clipped = { x: a.x, y: a.y, w: a.w, h: b.y - a.y };
                                        } else {
                                            clipped = { x: a.x, y: b.y + b.h, w: a.w, h: (a.y + a.h) - (b.y + b.h) };
                                        }
                                    }
                                }

                                // Arredondar e validar
                                [extending, clipped].forEach(r => { r.x = Math.round(r.x); r.y = Math.round(r.y); r.w = Math.round(r.w); r.h = Math.round(r.h); });
                                // Preservar sobras não envolvidas no corte
                                const newRetalhos = rets.filter((_, idx2) => idx2 !== i && idx2 !== j);
                                if (extending.w > 50 && extending.h > 50 && noOverlap(extending)) newRetalhos.push(extending);
                                // Sobra cortada: só incluir se atende dimensões mínimas do config
                                const cShort = Math.min(clipped.w, clipped.h), cLong = Math.max(clipped.w, clipped.h);
                                if (cShort >= sobraMinW && cLong >= sobraMinH && noOverlap(clipped)) newRetalhos.push(clipped);

                                if (newRetalhos.length === 0) {
                                    // Ambas sobras falharam na validação — avisar usuário em vez de sumir silenciosamente
                                    if (typeof notify === 'function') notify('Não foi possível unir: as sobras resultantes são menores que o mínimo configurado.', 'warning');
                                    return;
                                }
                                if (onAdjust) {
                                    onAdjust({ action: 'recalc_sobras', chapaIdx: idx, retalhos: newRetalhos });
                                }
                            };

                            const seen = new Set();
                            for (let i = 0; i < rets.length; i++) {
                                for (let j = i + 1; j < rets.length; j++) {
                                    const a = rets[i], b = rets[j];
                                    // Verificar adjacência e renderizar barra clicável
                                    const checkAdj = (ax, ay, aw, ah, bx, by, bw, bh, axis, key) => {
                                        if (seen.has(key)) return;
                                        if (axis === 'y') {
                                            // a.bottom ≈ b.top — divisa horizontal
                                            if (Math.abs((ay + ah) - by) < tol) {
                                                const ox1 = Math.max(ax, bx), ox2 = Math.min(ax + aw, bx + bw);
                                                if (ox2 - ox1 > 10) {
                                                    seen.add(key);
                                                    const hx = (ox1 + refiloVal) * scale;
                                                    const hy = (ay + ah + refiloVal) * scale - 4;
                                                    const hw = (ox2 - ox1) * scale;
                                                    handles.push(
                                                        <g key={key} style={{ cursor: 'pointer' }} onClick={(e) => cutLine(e, i, j, 'y')}>
                                                            <rect x={hx} y={hy + 1} width={hw} height={12}
                                                                fill="transparent" style={{ pointerEvents: 'all' }} />
                                                            <line x1={hx} y1={hy + 1.5} x2={hx + hw} y2={hy + 1.5}
                                                                stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7} style={{ pointerEvents: 'none' }} />
                                                        </g>
                                                    );
                                                }
                                            }
                                        } else {
                                            // a.right ≈ b.left — divisa vertical
                                            if (Math.abs((ax + aw) - bx) < tol) {
                                                const oy1 = Math.max(ay, by), oy2 = Math.min(ay + ah, by + bh);
                                                if (oy2 - oy1 > 10) {
                                                    seen.add(key);
                                                    const hx2 = (ax + aw + refiloVal) * scale - 4;
                                                    const hy2 = (oy1 + refiloVal) * scale;
                                                    const hh2 = (oy2 - oy1) * scale;
                                                    handles.push(
                                                        <g key={key} style={{ cursor: 'pointer' }} onClick={(e) => cutLine(e, i, j, 'x')}>
                                                            <rect x={hx2} y={hy2} width={12} height={hh2}
                                                                fill="transparent" style={{ pointerEvents: 'all' }} />
                                                            <line x1={hx2 + 1.5} y1={hy2} x2={hx2 + 1.5} y2={hy2 + hh2}
                                                                stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7} style={{ pointerEvents: 'none' }} />
                                                        </g>
                                                    );
                                                }
                                            }
                                        }
                                    };
                                    // Testar ambas as direções
                                    checkAdj(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h, 'y', `cv${i}-${j}`);
                                    checkAdj(b.x, b.y, b.w, b.h, a.x, a.y, a.w, a.h, 'y', `cv${j}-${i}`);
                                    checkAdj(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h, 'x', `ch${i}-${j}`);
                                    checkAdj(b.x, b.y, b.w, b.h, a.x, a.y, a.w, a.h, 'x', `ch${j}-${i}`);
                                }
                            }
                            return handles;
                        })()}

                        {/* ═══ BANDEJA (tray) — peças ficam aqui visualmente ═══ */}
                        <g>
                            <rect x={trayX} y={0} width={trayW} height={svgH}
                                rx={6}
                                fill={trayHover ? 'rgba(37,99,235,0.08)' : 'rgba(148,163,184,0.04)'}
                                stroke={trayHover ? '#2563eb' : '#94a3b8'}
                                strokeWidth={trayHover ? 2 : 1}
                                strokeDasharray={trayHover ? 'none' : '6 3'}
                                style={{ transition: 'fill .15s, stroke .15s' }} />
                            {/* Tray label + count */}
                            <text x={trayX + trayW / 2} y={14} textAnchor="middle"
                                fontSize={9} fontWeight={700} fill={trayHover ? '#2563eb' : '#64748b'}>
                                Bandeja {bandejaPieces.length > 0 ? `(${bandejaPieces.length})` : ''}
                            </text>

                            {/* Empty state hint */}
                            {bandejaPieces.length === 0 && !trayHover && (
                                <text x={trayX + trayW / 2} y={svgH / 2} textAnchor="middle"
                                    fontSize={8} fill="#94a3b8" opacity={0.6}>
                                    <tspan x={trayX + trayW / 2} dy={0}>Arraste pecas</tspan>
                                    <tspan x={trayX + trayW / 2} dy={12}>aqui</tspan>
                                </text>
                            )}

                            {/* Drop indicator when hovering */}
                            {trayHover && (
                                <>
                                    <rect x={trayX + 4} y={20} width={trayW - 8} height={svgH - 28}
                                        rx={4} fill="none"
                                        stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.5} />
                                    <text x={trayX + trayW / 2} y={svgH / 2} textAnchor="middle"
                                        fontSize={10} fontWeight={700} fill="#2563eb">
                                        Solte aqui
                                    </text>
                                </>
                            )}

                            {/* ── Bandeja pieces — tamanho real proporcional ── */}
                            {bandejaPieces.length > 0 && (() => {
                                const pad = 6;
                                const gap = 5;
                                const availW = trayW - pad * 2;
                                // Calcular escala para caber peças proporcionalmente na bandeja
                                const maxPieceDim = Math.max(...bandejaPieces.map(bp => Math.max(bp.w, bp.h)), 1);
                                const trayScale = Math.min(availW / maxPieceDim, scale * 0.9);
                                let curY = 22;
                                const hasVeioChapa = chapa.veio && chapa.veio !== 'sem_veio';
                                return bandejaPieces.map((bp, bi) => {
                                    if (curY > svgH - 8) return null;
                                    const piece = pecasMap[bp.pecaId];
                                    const label = piece?.descricao?.substring(0, 18) || `#${bp.pecaId}`;
                                    const dims = `${Math.round(bp.w)}x${Math.round(bp.h)}`;
                                    // Escala proporcional real
                                    let rw = bp.w * trayScale;
                                    let rh = bp.h * trayScale;
                                    // Garantir mínimo visível
                                    if (rw < 20) { const f = 20 / rw; rw = 20; rh *= f; }
                                    if (rh < 16) { const f = 16 / rh; rh = 16; rw *= f; }
                                    // Limitar ao espaço disponível
                                    if (rw > availW) { const f = availW / rw; rw = availW; rh *= f; }
                                    const rx = trayX + pad + (availW - rw) / 2;
                                    const ry = curY;
                                    const itemH = rh + 14;
                                    curY += itemH + gap;
                                    const canRotate = !hasVeioChapa && (bp.veio === 'sem_veio' || !bp.veio);
                                    const isBeingDragged = draggingBandeja && draggingBandeja.bandejaIdx === bi;
                                    return (
                                        <g key={`bp-${bi}`}
                                            style={{ cursor: 'grab', opacity: isBeingDragged ? 0.3 : 1 }}
                                            onMouseDown={e => handleBandejaDragStart(e, bi, bp)}
                                            onDragStart={e => e.preventDefault()} /* impede drag nativo do navegador */>
                                            {/* Piece rect — cor mais forte */}
                                            <rect x={rx} y={ry} width={rw} height={rh}
                                                rx={3} fill="#bfdbfe" stroke="#2563eb" strokeWidth={1.2} />
                                            {/* Dimensões dentro do rect */}
                                            <text x={rx + rw / 2} y={ry + rh / 2 + 3} textAnchor="middle"
                                                fontSize={Math.min(9, rh * 0.45)} fill="#1e3a5f" fontWeight={700}>
                                                {dims}
                                            </text>
                                            {/* Label abaixo */}
                                            <text x={rx + rw / 2} y={ry + rh + 10} textAnchor="middle"
                                                fontSize={8} fontWeight={600} fill="#1e40af">
                                                {label}
                                            </text>
                                            {/* Rotation button for non-grain */}
                                            {canRotate && (
                                                <g onClick={e => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    if (onAdjust) onAdjust({
                                                        action: 'rotate_bandeja',
                                                        materialKey: bp.fromMaterial || chapa.material_code || chapa.material,
                                                        bandejaIdx: bi,
                                                    });
                                                }}
                                                onMouseDown={e => e.stopPropagation()}
                                                style={{ cursor: 'pointer' }}>
                                                    <circle cx={rx + rw - 5} cy={ry + 5} r={6}
                                                        fill="#7c3aed" opacity={0.9} />
                                                    <text x={rx + rw - 5} y={ry + 8} textAnchor="middle"
                                                        fontSize={7} fill="#fff" fontWeight={800}>R</text>
                                                </g>
                                            )}
                                            <title>{`${label} — ${dims}mm\nArraste para a chapa`}</title>
                                        </g>
                                    );
                                });
                            })()}

                            {/* Overflow indicator */}
                            {bandejaPieces.length > 0 && (() => {
                                const maxPieceDim = Math.max(...bandejaPieces.map(bp => Math.max(bp.w, bp.h)), 1);
                                const trayScale = Math.min((trayW - 12) / maxPieceDim, scale * 0.9);
                                let curY = 22;
                                let hidden = 0;
                                for (const bp of bandejaPieces) {
                                    let rh = bp.h * trayScale;
                                    if (rh < 16) rh = 16;
                                    curY += rh + 14 + 5;
                                    if (curY > svgH - 8) hidden++;
                                }
                                if (hidden > 0) return (
                                    <text x={trayX + trayW / 2} y={svgH - 4} textAnchor="middle"
                                        fontSize={8} fill="#94a3b8" fontWeight={600}>
                                        +{hidden} oculta(s)
                                    </text>
                                );
                                return null;
                            })()}
                        </g>

                        {/* ── Ghost piece: bandeja drag preview (sempre visível) ── */}
                        {draggingBandeja && (() => {
                            const gx = draggingBandeja.inSheet
                                ? (draggingBandeja.newX + refiloVal) * scale
                                : (draggingBandeja.newX + refiloVal) * scale;
                            const gy = draggingBandeja.inSheet
                                ? (draggingBandeja.newY + refiloVal) * scale
                                : (draggingBandeja.newY + refiloVal) * scale;
                            const gw = draggingBandeja.w * scale;
                            const gh = draggingBandeja.h * scale;
                            const inSheet = draggingBandeja.inSheet;
                            return (
                                <rect
                                    x={gx} y={gy} width={gw} height={gh}
                                    rx={2}
                                    fill={inSheet ? (dragCollision ? 'rgba(239,68,68,0.2)' : 'rgba(37,99,235,0.2)') : 'rgba(148,163,184,0.15)'}
                                    stroke={inSheet ? (dragCollision ? '#ef4444' : '#2563eb') : '#94a3b8'}
                                    strokeWidth={2}
                                    strokeDasharray="6 3"
                                    style={{ pointerEvents: 'none' }}
                                />
                            );
                        })()}
                    </svg>
                </div>

                {/* Tooltip — Rich details panel */}
                {hovered !== null && !dragging && chapa.pecas[hovered] && (() => {
                    const p = chapa.pecas[hovered];
                    const piece = pecasMap[p.pecaId];
                    const cls = p.classificacao || classifyLocal(p.w, p.h);
                    const clsColor = classColors[cls];
                    const clsLabel = classLabels[cls];
                    const area = (p.w * p.h / 1e6).toFixed(4);
                    const minDim = Math.min(p.w, p.h);
                    return (
                        <div style={{
                            position: 'absolute', top: 8, right: 8,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, padding: '10px 14px', fontSize: 11,
                            boxShadow: '0 4px 16px rgba(0,0,0,.18)', zIndex: 10,
                            minWidth: 270, lineHeight: 1.6,
                        }}>
                            {/* Title */}
                            <div style={{ fontWeight: 700, marginBottom: 2, color: 'var(--text-primary)', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Detalhes da peça
                                {p.locked && <Lock size={10} style={{ color: '#fbbf24' }} />}
                            </div>
                            {/* Classification badge */}
                            <div style={{ marginBottom: 6, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                                    borderRadius: 10, fontSize: 10, fontWeight: 700, color: '#fff',
                                    background: clsColor,
                                }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', opacity: 0.6 }} />
                                    {clsLabel}
                                </span>
                                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                    min. {Math.round(minDim)}mm
                                </span>
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>
                                <b>ID:</b> {piece?.id || p.pecaId}<br />
                                <b>Descrição peça:</b> {piece?.descricao || `Peça #${p.pecaId}`}<br />
                                <b>Rotacionada:</b> {p.rotated ? 'Sim' : 'Não'}<br />
                                <b>Comprimento:</b> {piece?.comprimento ? Number(piece.comprimento).toFixed(2) : Math.round(p.rotated ? p.h : p.w)}<br />
                                <b>Largura:</b> {piece?.largura ? Number(piece.largura).toFixed(2) : Math.round(p.rotated ? p.w : p.h)}<br />
                                <b>Área:</b> {area} m²<br />
                                {loteAtual?.cliente && <><b>Cliente:</b> {loteAtual.cliente}<br /></>}
                                <b>Id Master:</b> {piece?.modulo_id || '-'}<br />
                                <b>Módulo:</b> {piece?.modulo_desc || '-'}<br />
                                {piece?.persistent_id && <><b>Id Peça:</b> {piece.persistent_id}<br /></>}
                                {piece?.upmcode && <><b>Meu código:</b> {piece.upmcode}<br /></>}
                                {piece?.produto_final && <><b>Produto final:</b> {piece.produto_final}<br /></>}
                                <b>Material:</b> {piece?.material_code || '-'}<br />
                                {piece?.espessura > 0 && <><b>Espessura:</b> {piece.espessura}mm<br /></>}
                                <b>Posição:</b> x={Math.round(p.x)}, y={Math.round(p.y)}<br />
                                {piece?.quantidade > 1 && <><b>Instância:</b> {(p.instancia || 0) + 1} de {piece.quantidade}<br /></>}
                                {piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira) && (() => {
                                    const sides = [
                                        piece.borda_frontal && { l: 'Frontal', v: piece.borda_frontal, cor: piece.borda_cor_frontal, c: edgeColorGlobal(piece.borda_frontal, piece.borda_cor_frontal) },
                                        piece.borda_traseira && { l: 'Traseira', v: piece.borda_traseira, cor: piece.borda_cor_traseira, c: edgeColorGlobal(piece.borda_traseira, piece.borda_cor_traseira) },
                                        piece.borda_esq && { l: 'Esquerda', v: piece.borda_esq, cor: piece.borda_cor_esq, c: edgeColorGlobal(piece.borda_esq, piece.borda_cor_esq) },
                                        piece.borda_dir && { l: 'Direita', v: piece.borda_dir, cor: piece.borda_cor_dir, c: edgeColorGlobal(piece.borda_dir, piece.borda_cor_dir) },
                                    ].filter(Boolean);
                                    return <><b>Fita borda:</b><br />{sides.map((s, i) => (
                                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
                                            <span style={{ width: 8, height: 3, borderRadius: 1, background: s.c, display: 'inline-block' }} />
                                            {s.l}: {s.cor ? `${s.cor.replace(/_/g, ' ')} (${s.v.replace(/_/g, ' ')})` : s.v.replace(/_/g, ' ')}
                                        </span>
                                    ))}</>;
                                })()}
                                {piece?.acabamento && <><b>Acabamento:</b> {piece.acabamento}<br /></>}
                                {piece?.observacao && <><b>Obs:</b> {piece.observacao}<br /></>}
                            </div>
                            {/* Special cut rules */}
                            {p.corte && (
                                <div style={{ marginTop: 6, padding: '4px 8px', borderRadius: 6, fontSize: 10,
                                    background: cls === 'super_pequena' ? '#fef2f215' : '#fef9c315',
                                    border: `1px solid ${clsColor}30` }}>
                                    <div style={{ fontWeight: 700, color: clsColor, marginBottom: 2 }}>Regras especiais de corte</div>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                        Passes: {p.corte.passes} · Velocidade: {p.corte.velocidade}
                                        {p.corte.tabs && <> · Tabs: {p.corte.tabCount}x {p.corte.tabSize}mm</>}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ══ Machining Tooltip ══ */}
                {machTip && (
                    <div style={{
                        position: 'fixed', left: machTip.clientX + 14, top: machTip.clientY - 10,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '8px 12px', fontSize: 11,
                        boxShadow: '0 4px 16px rgba(0,0,0,.22)', zIndex: 50,
                        minWidth: 180, lineHeight: 1.7, pointerEvents: 'none',
                        maxWidth: 280,
                    }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                                background: machTip.ghost ? '#64748b'
                                    : machTip.tipo?.includes('Rasgo') ? '#eab308'
                                    : machTip.tipo?.includes('Rebaixo') ? '#f97316'
                                    : machTip.tipo?.includes('Fresa') ? '#06b6d4'
                                    : machTip.face === 'Fundo' ? '#7c3aed'
                                    : machTip.face?.includes('Lateral') ? '#2563eb'
                                    : '#e11d48',
                                border: machTip.ghost ? '1.5px dashed #94a3b8' : 'none',
                            }} />
                            {machTip.tipo || 'Usinagem'}
                            {machTip.ghost && <span style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>(lado oposto)</span>}
                        </div>
                        <div style={{ color: 'var(--text-muted)' }}>
                            <b>Face:</b> {machTip.face}<br />
                            <b>Posição:</b> X={machTip.posX}mm, Y={machTip.posY}mm<br />
                            {machTip.diametro && <><b>Diâmetro:</b> {machTip.diametro}mm<br /></>}
                            {machTip.largura && !machTip.diametro && <><b>Largura:</b> {machTip.largura}mm<br /></>}
                            {machTip.altura && <><b>Altura:</b> {machTip.altura}mm<br /></>}
                            {machTip.comprimento && <><b>Comprimento:</b> {machTip.comprimento}mm<br /></>}
                            {machTip.profundidade && machTip.profundidade !== '-' && <><b>Profundidade:</b> {machTip.profundidade}mm<br /></>}
                            {machTip.passante && <span style={{ color: '#ef4444', fontWeight: 600 }}>● Passante<br /></span>}
                            {machTip.tool && <><b>Ferramenta:</b> <code style={{ fontSize: 10, background: 'var(--bg-muted)', padding: '0 4px', borderRadius: 3 }}>{machTip.tool}</code></>}
                        </div>
                    </div>
                )}

                {/* ══ Context Menu — Rich actions ══ */}
                {ctxMenu && (() => {
                    const p = chapa.pecas[ctxMenu.pecaIdx];
                    if (!p) return null;
                    const piece = pecasMap[p.pecaId];
                    const isLocked = p.locked;
                    const MI = ({ icon: Icon, label, color, onClick, disabled }) => (
                        <div style={{
                            padding: '7px 14px', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                            fontSize: 12, color: disabled ? 'var(--text-muted)' : 'var(--text-primary)', transition: 'background .1s',
                            opacity: disabled ? 0.5 : 1,
                        }}
                            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--bg-muted)'; }}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            onClick={() => { if (!disabled) { onClick(); setCtxMenu(null); } }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 5, background: color ? `${color}18` : 'var(--bg-muted)' }}>
                                <Icon size={13} style={{ color: color || 'var(--text-secondary)' }} />
                            </span>
                            {label}
                        </div>
                    );
                    const Sep = ({ label }) => (
                        <>
                            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                            {label && <div style={{ padding: '3px 14px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>}
                        </>
                    );
                    return (
                        <div ref={el => {
                            // Viewport-aware positioning after render
                            if (el) {
                                const rect = el.getBoundingClientRect();
                                const parent = el.parentElement?.getBoundingClientRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
                                const maxX = parent.width - rect.width - 8;
                                const maxY = parent.height - rect.height - 8;
                                const newLeft = Math.max(0, Math.min(ctxMenu.x, maxX));
                                const newTop = Math.max(0, Math.min(ctxMenu.y, maxY));
                                if (parseInt(el.style.left) !== Math.round(newLeft) || parseInt(el.style.top) !== Math.round(newTop)) {
                                    el.style.left = newLeft + 'px';
                                    el.style.top = newTop + 'px';
                                }
                            }
                        }} data-ctx-menu="piece" style={{
                            position: 'absolute', left: ctxMenu.x, top: ctxMenu.y,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 100,
                            minWidth: 230, padding: '6px 0', overflow: 'hidden',
                        }} onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ padding: '6px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: getModColor(p.pecaId, p) }} />
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{piece?.descricao || `Peça #${p.pecaId}`}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                        {Math.round(p.w)} × {Math.round(p.h)} mm{p.rotated ? ' (R)' : ''}
                                        {p.lado_ativo === 'B' ? <span style={{ color: '#0ea5e9', fontWeight: 700, marginLeft: 4 }}>Lado B</span> : ' Lado A'}
                                    </div>
                                </div>
                            </div>

                            {/* Ações rápidas */}
                            {!hasVeio && !isLocked && (
                                <MI icon={RotateCw} label="Rotacionar 90°" color="#8b5cf6" onClick={() => handleRotate(ctxMenu.pecaIdx)} />
                            )}
                            {!isLocked && (
                                <MI icon={FlipVertical2} label={`Inverter → Lado ${(p.lado_ativo === 'B') ? 'A' : 'B'}`} color="#0ea5e9"
                                    onClick={() => onAdjust({ action: 'flip', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx })} />
                            )}
                            <MI icon={Eye} label="Ver Peça 3D" color="#3b82f6" onClick={() => onView3D && onView3D(piece)} />
                            <MI icon={Printer} label="Imprimir Etiqueta" color="#d97706" onClick={() => onPrintSingleLabel && onPrintSingleLabel(piece)} />
                            <MI icon={Cpu} label="G-Code desta Peça" color="#1e40af" onClick={() => onGerarGcodePeca && onGerarGcodePeca(idx, ctxMenu.pecaIdx)} />

                            <Sep label="Organização" />
                            <MI icon={isLocked ? Unlock : Lock} label={isLocked ? 'Desbloquear posição' : 'Bloquear posição'} color="#fbbf24"
                                onClick={() => onAdjust({ action: isLocked ? 'unlock' : 'lock', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx })} />
                            <MI icon={ArrowLeftRight} label="Enviar p/ Bandeja" color="#06b6d4"
                                onClick={() => onAdjust({ action: 'to_bandeja', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx })} />

                            {/* Navegação */}
                            <Sep label="Navegação" />
                            <MI icon={Layers} label="Ver no Lote (Peças)" color="#22c55e"
                                onClick={() => setTab && setTab('pecas')} />

                        </div>
                    );
                })()}

                {/* ══ Context Menu Sobras ══ */}
                {sobraCtxMenu && sobraCtxMenu.chapaIdx === idx && (() => {
                    const r = (chapa.retalhos || [])[sobraCtxMenu.retalhoIdx];
                    if (!r) return null;
                    const rets = chapa.retalhos || [];
                    const tol = 5;
                    const hasAdj = rets.length >= 2;
                    const ctxSt2 = (extra) => ({
                        padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12, color: 'var(--text-primary)', transition: 'background .1s', ...extra
                    });

                    // Função para alternar orientação do corte do L
                    const toggleCutOrientation = () => {
                        const ref = chapa.refilo || 0;
                        const uW = chapa.comprimento - 2 * ref;
                        const uH = chapa.largura - 2 * ref;
                        const pecas = chapa.pecas || [];
                        let maxPecaX = 0, maxPecaY = 0;
                        for (const p of pecas) {
                            if (p.x + p.w > maxPecaX) maxPecaX = p.x + p.w;
                            if (p.y + p.h > maxPecaY) maxPecaY = p.y + p.h;
                        }
                        const noOverlap = (rr) => !pecas.some(p => rr.x < p.x + p.w && rr.x + rr.w > p.x && rr.y < p.y + p.h && rr.y + rr.h > p.y);
                        const isOk = (rr) => { const s = Math.min(rr.w, rr.h), l = Math.max(rr.w, rr.h); return s >= sobraMinW && l >= sobraMinH && noOverlap(rr); };

                        // Detectar orientação atual: se a sobra clicada tem altura total = vertical, senão = horizontal
                        const isCurrentlyVertical = Math.abs(r.h - uH) < 5 || Math.abs(r.w - uW) < 5;

                        let newRetalhos;
                        if (isCurrentlyVertical || r.h > r.w) {
                            // Mudar para horizontal: faixa inferior larga + faixa direita curta
                            const bottom = { x: 0, y: Math.round(maxPecaY), w: Math.round(uW), h: Math.round(uH - maxPecaY) };
                            const right = { x: Math.round(maxPecaX), y: 0, w: Math.round(uW - maxPecaX), h: Math.round(maxPecaY) };
                            newRetalhos = [bottom, right].filter(isOk);
                        } else {
                            // Mudar para vertical: faixa direita alta + faixa inferior curta
                            const right = { x: Math.round(maxPecaX), y: 0, w: Math.round(uW - maxPecaX), h: Math.round(uH) };
                            const bottom = { x: 0, y: Math.round(maxPecaY), w: Math.round(maxPecaX), h: Math.round(uH - maxPecaY) };
                            newRetalhos = [right, bottom].filter(isOk);
                        }

                        if (onAdjust) onAdjust({ action: 'recalc_sobras', chapaIdx: idx, retalhos: newRetalhos });
                        setSobraCtxMenu(null);
                    };

                    return (
                        <div data-ctx-menu="sobra" style={{
                            position: 'absolute', left: Math.min(sobraCtxMenu.x, 300), top: sobraCtxMenu.y,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.25)', zIndex: 100,
                            minWidth: 220, padding: '4px 0', overflow: 'hidden',
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '4px 14px 6px', fontSize: 10, fontWeight: 700, color: '#22c55e' }}>
                                Sobra {Math.round(r.w)}×{Math.round(r.h)}mm ({(r.w * r.h / 1e6).toFixed(3)} m²)
                            </div>
                            <div style={ctxSt2()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { onAdjust({ action: 'marcar_refugo', chapaIdx: idx, retalhoIdx: sobraCtxMenu.retalhoIdx }); setSobraCtxMenu(null); }}>
                                <Trash2 size={13} color="#ef4444" /> Marcar como Refugo
                            </div>
                            {hasAdj && (
                                <>
                                    <div style={{ height: 1, background: 'var(--border)', margin: '2px 10px' }} />
                                    <div style={ctxSt2()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={toggleCutOrientation}>
                                        <ArrowLeftRight size={13} color="#f59e0b" /> Alternar Corte (trocar orientação)
                                    </div>
                                    <div style={{ padding: '2px 14px', fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        Arraste a barra ⇔ para cortar a linha e redistribuir
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })()}

                {/* Drag collision feedback bar */}
                {(dragging || draggingBandeja) && (
                    <div style={{
                        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                        padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: draggingBandeja
                            ? (draggingBandeja.inSheet ? (dragCollision ? colorBg('#ef4444') : colorBg('#22c55e')) : colorBg('#64748b'))
                            : (trayHover ? colorBg('#2563eb') : dragCollision ? colorBg('#ef4444') : colorBg('#22c55e')),
                        color: draggingBandeja
                            ? (draggingBandeja.inSheet ? (dragCollision ? '#ef4444' : '#16a34a') : '#64748b')
                            : (trayHover ? '#2563eb' : dragCollision ? '#ef4444' : '#16a34a'),
                        border: `1px solid ${draggingBandeja
                            ? (draggingBandeja.inSheet ? (dragCollision ? colorBorder('#ef4444') : colorBorder('#22c55e')) : colorBorder('#64748b'))
                            : (trayHover ? colorBorder('#2563eb') : dragCollision ? colorBorder('#ef4444') : colorBorder('#22c55e'))}`,
                        zIndex: 10, whiteSpace: 'nowrap',
                    }}>
                        {draggingBandeja
                            ? (draggingBandeja.inSheet
                                ? (dragCollision ? 'Colisao! Solte para cancelar' : 'Solte para posicionar')
                                : 'Arraste para a chapa')
                            : (trayHover ? 'Solte para enviar à bandeja' : dragCollision ? 'Colisao! Solte para cancelar' : 'Posicao valida')
                        }
                    </div>
                )}
            </div>

            {/* Info bar below sheet */}
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{chapa.pecas.length} peça(s)</span>
                {chapa.pecas.filter(p => p.locked).length > 0 && (
                    <span style={{ color: '#fbbf24', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={11} /> {chapa.pecas.filter(p => p.locked).length} travada(s)</span>
                )}
                {(chapa.retalhos?.length || 0) > 0 && <span style={{ color: '#22c55e' }}>{chapa.retalhos.length} retalho(s)</span>}
                {chapa.kerf > 0 && <span>Kerf: {chapa.kerf}mm</span>}
                {refiloVal > 0 && <span>Refilo: {refiloVal}mm</span>}
                {hasVeio && <span style={{ color: '#8b5cf6', fontWeight: 600 }}>━ Com Veio</span>}
                {/* Per-sheet classification counts */}
                {classifyLocal && (() => {
                    const sheetCls = { normal: 0, pequena: 0, super_pequena: 0 };
                    for (const p of chapa.pecas) sheetCls[p.classificacao || classifyLocal(p.w, p.h)]++;
                    return (
                        <>
                            {sheetCls.pequena > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>{sheetCls.pequena} peq.</span>}
                            {sheetCls.super_pequena > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>{sheetCls.super_pequena} s.peq.</span>}
                        </>
                    );
                })()}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
                    Área útil: {((chapa.comprimento - 2 * refiloVal) * (chapa.largura - 2 * refiloVal) / 1000000).toFixed(2)} m²
                </span>
            </div>

            {/* ══ Retalhos Mode Toolbar ══ */}
            {retMode && (
                <div style={{
                    marginTop: 10, padding: 12, background: 'var(--bg-muted)',
                    border: '1px solid var(--border)', borderRadius: 8,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Scissors size={14} /> Definir Sobras — Chapa {idx + 1}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setRetDefs((chapa.retalhos || []).map(r => ({ ...r, type: null }))); setRetSelected(null); setRetSplitPreview(null); }}
                                style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                                <Undo2 size={10} /> Reset
                            </button>
                            {onSaveRetalhos && (
                                <button onClick={() => {
                                    const retalhos = retDefs.filter(r => r.type === 'retalho');
                                    const refugos = retDefs.filter(r => r.type === 'refugo');
                                    onSaveRetalhos(idx, retalhos, refugos);
                                    setRetMode(false);
                                }}
                                    style={{ padding: '4px 14px', fontSize: 10, fontWeight: 700, background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                                    Salvar ({retDefs.filter(r => r.type === 'retalho').length} retalhos)
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Summary row */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 10, flexWrap: 'wrap' }}>
                        <span style={{ color: '#059669', fontWeight: 600 }}>
                            ✓ Retalhos: {retDefs.filter(r => r.type === 'retalho').length}
                            {retDefs.filter(r => r.type === 'retalho').length > 0 && ` (${(retDefs.filter(r => r.type === 'retalho').reduce((s, r) => s + r.w * r.h, 0) / 1000000).toFixed(3)} m²)`}
                        </span>
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                            ✗ Refugos: {retDefs.filter(r => r.type === 'refugo').length}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                            Sem definição: {retDefs.filter(r => !r.type).length}
                        </span>
                    </div>

                    {/* Selected retalho actions */}
                    {retSelected != null && retDefs[retSelected] && (() => {
                        const rd = retDefs[retSelected];
                        const canSplitH = rd.h > 100; // min 100mm para dividir H
                        const canSplitV = rd.w > 100; // min 100mm para dividir V
                        return (
                            <div style={{
                                padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginRight: 4 }}>
                                    Sobra #{retSelected + 1}: {Math.round(rd.w)}×{Math.round(rd.h)}mm
                                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                                        ({(rd.w * rd.h / 1000000).toFixed(3)} m²)
                                    </span>
                                </span>
                                <button onClick={() => { const n = [...retDefs]; n[retSelected] = { ...rd, type: 'retalho' }; setRetDefs(n); }}
                                    style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                                        background: rd.type === 'retalho' ? '#059669' : 'transparent',
                                        color: rd.type === 'retalho' ? '#fff' : '#059669',
                                        border: '1px solid #059669' }}>
                                    ✓ Retalho
                                </button>
                                <button onClick={() => { const n = [...retDefs]; n[retSelected] = { ...rd, type: 'refugo' }; setRetDefs(n); }}
                                    style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                                        background: rd.type === 'refugo' ? '#dc2626' : 'transparent',
                                        color: rd.type === 'refugo' ? '#fff' : '#dc2626',
                                        border: '1px solid #dc2626' }}>
                                    ✗ Refugo
                                </button>
                                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>│</span>
                                {canSplitH && (
                                    <button onClick={() => {
                                        const midY = rd.y + rd.h / 2;
                                        setRetSplitPreview({ retIdx: retSelected, axis: 'h', pos: midY });
                                    }}
                                        style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
                                            background: retSplitPreview?.axis === 'h' ? '#f59e0b' : 'transparent',
                                            color: retSplitPreview?.axis === 'h' ? '#fff' : '#f59e0b',
                                            border: '1px solid #f59e0b' }}>
                                        ━ Dividir H
                                    </button>
                                )}
                                {canSplitV && (
                                    <button onClick={() => {
                                        const midX = rd.x + rd.w / 2;
                                        setRetSplitPreview({ retIdx: retSelected, axis: 'v', pos: midX });
                                    }}
                                        style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
                                            background: retSplitPreview?.axis === 'v' ? '#f59e0b' : 'transparent',
                                            color: retSplitPreview?.axis === 'v' ? '#fff' : '#f59e0b',
                                            border: '1px solid #f59e0b' }}>
                                        ┃ Dividir V
                                    </button>
                                )}
                                {retSplitPreview && retSplitPreview.retIdx === retSelected && (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="range"
                                                min={retSplitPreview.axis === 'h' ? Math.round(rd.y + 50) : Math.round(rd.x + 50)}
                                                max={retSplitPreview.axis === 'h' ? Math.round(rd.y + rd.h - 50) : Math.round(rd.x + rd.w - 50)}
                                                value={Math.round(retSplitPreview.pos)}
                                                onChange={(e) => setRetSplitPreview({ ...retSplitPreview, pos: Number(e.target.value) })}
                                                style={{ width: 120 }}
                                            />
                                            <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace', minWidth: 45 }}>
                                                {retSplitPreview.axis === 'h'
                                                    ? `${Math.round(retSplitPreview.pos - rd.y)} / ${Math.round(rd.y + rd.h - retSplitPreview.pos)}`
                                                    : `${Math.round(retSplitPreview.pos - rd.x)} / ${Math.round(rd.x + rd.w - retSplitPreview.pos)}`
                                                }
                                            </span>
                                        </div>
                                        <button onClick={() => {
                                            const sp = retSplitPreview;
                                            const r = retDefs[sp.retIdx];
                                            const newDefs = [...retDefs];
                                            newDefs.splice(sp.retIdx, 1);
                                            if (sp.axis === 'h') {
                                                newDefs.push({ x: r.x, y: r.y, w: r.w, h: sp.pos - r.y, type: null });
                                                newDefs.push({ x: r.x, y: sp.pos, w: r.w, h: r.y + r.h - sp.pos, type: null });
                                            } else {
                                                newDefs.push({ x: r.x, y: r.y, w: sp.pos - r.x, h: r.h, type: null });
                                                newDefs.push({ x: sp.pos, y: r.y, w: r.w - (sp.pos - r.x), h: r.h, type: null });
                                            }
                                            setRetDefs(newDefs);
                                            setRetSplitPreview(null);
                                            setRetSelected(null);
                                        }}
                                            style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                                            Cortar
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    })()}

                    {/* List of all retalho defs */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {retDefs.map((rd, ri) => (
                            <div key={ri} onClick={() => { setRetSelected(ri); setRetSplitPreview(null); }}
                                style={{
                                    padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                                    background: retSelected === ri ? 'var(--bg-card)' : 'transparent',
                                    border: `1px solid ${rd.type === 'retalho' ? '#059669' : rd.type === 'refugo' ? '#dc2626' : 'var(--border)'}`,
                                    color: rd.type === 'retalho' ? '#059669' : rd.type === 'refugo' ? '#dc2626' : 'var(--text-muted)',
                                }}>
                                {rd.type === 'retalho' ? '✓' : rd.type === 'refugo' ? '✗' : '○'} {Math.round(rd.w)}×{Math.round(rd.h)}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Piece list (expandable) */}
            <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                    Lista de Peças ({chapa.pecas.length})
                </summary>
                <div style={{ marginTop: 6, maxHeight: 250, overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>#</th>
                                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Peça</th>
                                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Módulo</th>
                                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>C x L (mm)</th>
                                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Posição</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Rot.</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Lado</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Borda</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Class.</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Lock</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chapa.pecas.map((p, pi) => {
                                const piece = pecasMap[p.pecaId];
                                const hasBorda = piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira);
                                return (
                                    <tr key={pi} style={{ borderBottom: '1px solid var(--border)', background: hovered === pi ? `${getModColor(p.pecaId, p)}15` : selectedPieces.includes(pi) ? '#3b82f610' : pi % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}
                                        onMouseEnter={() => setHovered(pi)} onMouseLeave={() => setHovered(null)}>
                                        <td style={{ padding: '3px 6px', color: 'var(--text-muted)' }}>{pi + 1}</td>
                                        <td style={{ padding: '3px 6px', fontWeight: 500 }}>{piece?.descricao || `#${p.pecaId}`}</td>
                                        <td style={{ padding: '3px 6px', fontSize: 9, color: 'var(--text-muted)' }}>{piece?.modulo_desc || '-'}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{Math.round(p.w)} x {Math.round(p.h)}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{Math.round(p.x)},{Math.round(p.y)}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                                            {p.rotated ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>90°</span> : '-'}
                                        </td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                                            {p.lado_ativo === 'B'
                                                ? <span style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 9 }}>B</span>
                                                : <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>A</span>}
                                        </td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                                            {hasBorda ? <span style={{ color: '#ff6b35', fontWeight: 600 }}>●</span> : '-'}
                                        </td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                                            {(() => {
                                                const cls = p.classificacao || (classifyLocal ? classifyLocal(p.w, p.h) : 'normal');
                                                if (cls === 'normal') return <span style={{ color: '#22c55e', fontWeight: 600 }}>N</span>;
                                                if (cls === 'pequena') return <span style={{ color: '#f59e0b', fontWeight: 700 }}>P</span>;
                                                return <span style={{ color: '#ef4444', fontWeight: 700 }}>SP</span>;
                                            })()}
                                        </td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center', cursor: 'pointer' }}
                                            onClick={() => onAdjust({ action: p.locked ? 'unlock' : 'lock', chapaIdx: idx, pecaIdx: pi })}>
                                            {p.locked ? <Lock size={10} color="#fbbf24" /> : <span style={{ opacity: 0.2 }}>-</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </details>

            {/* Cutting sequence (guillotine mode) */}
            {chapa.cortes && chapa.cortes.length > 0 && (
                <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                        Sequência de Cortes ({chapa.cortes.length} cortes)
                    </summary>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {chapa.cortes.map((c, ci) => {
                            const isRet = c.tipo === 'separacao_retalho';
                            const clr = isRet ? '#059669' : (c.dir === 'Horizontal' ? '#3b82f6' : '#f59e0b');
                            return (
                                <span key={ci} style={{
                                    fontSize: 10, padding: '3px 8px', borderRadius: 4,
                                    background: colorBg(clr), border: `1px solid ${colorBorder(clr)}`,
                                    color: clr, fontWeight: 600,
                                }}>
                                    {c.seq || ci + 1}. {c.dir === 'Horizontal' ? '━' : '┃'} {c.pos}mm
                                    {c.len ? ` (${c.len}mm)` : ''}
                                    {isRet ? ' ✂ RET' : ''}
                                </span>
                            );
                        })}
                    </div>
                </details>
            )}
        </div>
    );
}
