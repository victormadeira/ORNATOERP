// Extraído automaticamente de ProducaoCNC.jsx (linhas 6747-7075).
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
import { parseGcodeForSim, getOpCat } from './parseGcode.js';

export function GcodeSimCanvas({ gcode, chapa }) {
    const canvasRef = useRef(null);
    const [zoom, setZoom] = useState(1);
    const [panOff, setPanOff] = useState({ x: 0, y: 0 });
    const panRef = useRef(null);
    // Animação
    const [playing, setPlaying] = useState(false);
    const [curMove, setCurMove] = useState(-1); // -1 = mostrar tudo (estático)
    const [speed, setSpeed] = useState(1);
    const animRef = useRef(null);
    const parsed = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const allMoves = parsed.moves;
    const allEvents = parsed.events;

    // Achar evento ativo no curMove atual
    const getActiveEventsAt = useCallback((moveIdx) => {
        let tool = '', op = '';
        for (const ev of allEvents) {
            if (ev.moveIdx > moveIdx && moveIdx >= 0) break;
            if (ev.type === 'tool') tool = ev.label;
            if (ev.type === 'op') op = ev.label;
        }
        return { tool, op };
    }, [allEvents]);

    // Categorias de operação encontradas (para legenda)
    const foundOps = useMemo(() => {
        const map = new Map();
        for (const m of allMoves) {
            if (m.type === 'G0') continue;
            const cat = getOpCat(m.op);
            if (!map.has(cat.key)) map.set(cat.key, cat);
        }
        return [...map.values()];
    }, [allMoves]);

    // (toolColors removido — agora usamos cores por operação via getOpCat)

    // Renderizar canvas
    const renderCanvas = useCallback((moveLimit) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (!gcode) {
            const ctx = canvas.getContext('2d');
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#181825'; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#6c7086'; ctx.font = '13px sans-serif';
            ctx.fillText('G-Code não disponível — verifique os alertas acima', W / 2 - 180, H / 2);
            return;
        }
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#181825'; ctx.fillRect(0, 0, W, H);

        if (allMoves.length === 0) {
            ctx.fillStyle = '#6c7086'; ctx.font = '13px sans-serif';
            ctx.fillText('Nenhum movimento detectado no G-Code', W / 2 - 140, H / 2);
            return;
        }

        // Calcular bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of allMoves) {
            minX = Math.min(minX, m.x1, m.x2); minY = Math.min(minY, m.y1, m.y2);
            maxX = Math.max(maxX, m.x1, m.x2); maxY = Math.max(maxY, m.y1, m.y2);
        }
        if (chapa) { minX = 0; minY = 0; maxX = Math.max(maxX, chapa.comprimento || 2750); maxY = Math.max(maxY, chapa.largura || 1850); }
        const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
        const pad = 30;
        const sc = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY) * zoom;
        const offX = pad + panOff.x + ((W - pad * 2) - rangeX * sc) / 2;
        const offY = pad + panOff.y + ((H - pad * 2) - rangeY * sc) / 2;
        const tx = (v) => offX + (v - minX) * sc;
        const ty = (v) => offY + (v - minY) * sc;

        // Fundo: chapa
        if (chapa) {
            ctx.fillStyle = '#313244'; ctx.strokeStyle = '#585b70'; ctx.lineWidth = 1;
            ctx.fillRect(tx(0), ty(0), (chapa.comprimento || 2750) * sc, (chapa.largura || 1850) * sc);
            ctx.strokeRect(tx(0), ty(0), (chapa.comprimento || 2750) * sc, (chapa.largura || 1850) * sc);
            if (chapa.pecas) {
                const ref = chapa.refilo || 10;
                for (const p of chapa.pecas) {
                    const px = tx(ref + p.x), py = ty(ref + p.y), pw2 = p.w * sc, ph2 = p.h * sc;
                    ctx.fillStyle = '#45475a'; ctx.strokeStyle = '#89b4fa50';
                    ctx.fillRect(px, py, pw2, ph2); ctx.strokeRect(px, py, pw2, ph2);
                    if (p.nome && pw2 > 20 && ph2 > 12) {
                        ctx.fillStyle = '#89b4fa60'; ctx.font = `${Math.min(10, pw2 / 8)}px sans-serif`;
                        ctx.fillText(p.nome, px + 3, py + 11, pw2 - 6);
                    }
                }
            }
            if (chapa.retalhos) {
                const ref = chapa.refilo || 10;
                ctx.setLineDash([4, 3]);
                for (const r of chapa.retalhos) {
                    ctx.strokeStyle = '#22c55e80'; ctx.lineWidth = 1;
                    ctx.strokeRect(tx(ref + r.x), ty(ref + r.y), r.w * sc, r.h * sc);
                }
                ctx.setLineDash([]);
            }
        }

        // Determinar quantos moves desenhar
        const drawCount = moveLimit < 0 ? allMoves.length : Math.min(moveLimit + 1, allMoves.length);
        let rapidDist = 0, cutDist = 0;

        // Desenhar moves até o limite (colorido por OPERAÇÃO + espessura por profundidade)
        for (let i = 0; i < drawCount; i++) {
            const m = allMoves[i];
            const x1 = tx(m.x1), y1 = ty(m.y1), x2 = tx(m.x2), y2 = ty(m.y2);
            const dist = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            if (m.type === 'G0') {
                ctx.strokeStyle = '#f38ba825'; ctx.lineWidth = 0.4; ctx.setLineDash([2, 4]);
                rapidDist += dist;
            } else {
                const cat = getOpCat(m.op);
                const depth = Math.abs(m.z2);
                const depthRatio = Math.min(depth / 20, 1);
                // Intensidade: mais profundo = mais brilhante e mais grosso
                const alpha = Math.round((0.5 + depthRatio * 0.5) * 255).toString(16).padStart(2, '0');
                ctx.strokeStyle = cat.color + alpha;
                ctx.lineWidth = 0.8 + depthRatio * 2.2; // 0.8px → 3px
                ctx.setLineDash([]);
                cutDist += dist;
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Marcadores de troca de ferramenta (diamantes)
        if (moveLimit < 0) {
            for (const ev of allEvents) {
                if (ev.type === 'tool' && ev.moveIdx < allMoves.length) {
                    const m = allMoves[ev.moveIdx] || allMoves[0];
                    const cx = tx(m?.x1 ?? 0), cy = ty(m?.y1 ?? 0);
                    ctx.fillStyle = '#f9e2af'; ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 3, cy);
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
        }

        // Marcadores: ponto inicial (verde) e tool head / ponto final
        if (allMoves.length > 0) {
            const first = allMoves[0];
            ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(tx(first.x1), ty(first.y1), 4, 0, Math.PI * 2); ctx.fill();

            if (moveLimit >= 0 && moveLimit < allMoves.length) {
                const cur = allMoves[moveLimit];
                // Trail glow
                ctx.strokeStyle = '#fab38740'; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 8, 0, Math.PI * 2); ctx.stroke();
                // Head
                ctx.fillStyle = '#fab387'; ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 4, 0, Math.PI * 2); ctx.fill();
                // Crosshair
                ctx.strokeStyle = '#fab38780'; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(tx(cur.x2) - 12, ty(cur.y2)); ctx.lineTo(tx(cur.x2) + 12, ty(cur.y2)); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(tx(cur.x2), ty(cur.y2) - 12); ctx.lineTo(tx(cur.x2), ty(cur.y2) + 12); ctx.stroke();
                // Coords overlay
                ctx.fillStyle = '#fab387'; ctx.font = '10px monospace';
                ctx.fillText(`X${cur.x2.toFixed(1)} Y${cur.y2.toFixed(1)} Z${cur.z2.toFixed(1)}`, tx(cur.x2) + 10, ty(cur.y2) - 8);
            } else if (moveLimit < 0) {
                const last = allMoves[allMoves.length - 1];
                ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(tx(last.x2), ty(last.y2), 4, 0, Math.PI * 2); ctx.fill();
            }
        }

        // HUD: info da ferramenta e operação atual
        if (moveLimit >= 0) {
            const { tool, op } = getActiveEventsAt(moveLimit);
            const cat = getOpCat(op);
            const hudY = 30;
            ctx.fillStyle = '#181825dd'; ctx.fillRect(4, hudY, 280, (tool ? 16 : 0) + (op ? 16 : 0) + 8);
            let hy = hudY + 14;
            if (tool) {
                ctx.fillStyle = '#f9e2af'; ctx.font = 'bold 10px sans-serif';
                ctx.fillText(`[${tool}]`, 10, hy); hy += 16;
            }
            if (op) {
                ctx.fillStyle = cat.color; ctx.font = 'bold 10px sans-serif';
                ctx.fillText(`● ${cat.label}: ${op}`, 10, hy);
            }
        }

        // Barra de progresso no fundo do canvas
        if (moveLimit >= 0) {
            const pct = allMoves.length > 0 ? (moveLimit + 1) / allMoves.length : 0;
            ctx.fillStyle = '#11111b'; ctx.fillRect(0, H - 24, W, 24);
            ctx.fillStyle = '#fab38730'; ctx.fillRect(0, H - 24, W * pct, 24);
            // Marcadores de troca de operação na barra de progresso
            for (const ev of allEvents) {
                if (ev.type === 'op') {
                    const evPct = ev.moveIdx / allMoves.length;
                    const cat = getOpCat(ev.label);
                    ctx.fillStyle = cat.color + '80'; ctx.fillRect(W * evPct - 1, H - 24, 2, 24);
                }
                if (ev.type === 'tool') {
                    const evPct = ev.moveIdx / allMoves.length;
                    ctx.fillStyle = '#f9e2af'; ctx.fillRect(W * evPct - 1, H - 24, 2, 24);
                }
            }
            ctx.fillStyle = '#cdd6f4'; ctx.font = '10px monospace';
            ctx.fillText(`Move ${moveLimit + 1}/${allMoves.length}  |  Rapido: ${(rapidDist / 1000).toFixed(1)}m  |  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10, H - 8);
        } else {
            ctx.fillStyle = '#cdd6f4'; ctx.font = '11px monospace';
            ctx.fillText(`Movimentos: ${allMoves.length}  |  Rapido: ${(rapidDist / 1000).toFixed(1)}m  |  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10, H - 10);
        }
    }, [gcode, chapa, allMoves, allEvents, getActiveEventsAt, zoom, panOff]);

    // Renderizar quando muda curMove, zoom ou pan
    useEffect(() => { renderCanvas(curMove); }, [curMove, renderCanvas]);

    // Loop de animação
    useEffect(() => {
        if (!playing) { if (animRef.current) clearInterval(animRef.current); return; }
        const interval = Math.max(10, 80 / speed);
        animRef.current = setInterval(() => {
            setCurMove(prev => {
                const next = prev + 1;
                if (next >= allMoves.length) { setPlaying(false); return allMoves.length - 1; }
                return next;
            });
        }, interval);
        return () => { if (animRef.current) clearInterval(animRef.current); };
    }, [playing, speed, allMoves.length]);

    // Controles
    const handlePlay = () => {
        if (curMove >= allMoves.length - 1 || curMove < 0) setCurMove(0);
        setPlaying(true);
    };
    const handlePause = () => setPlaying(false);
    const handleStop = () => { setPlaying(false); setCurMove(-1); };
    const handleStep = (dir) => {
        setPlaying(false);
        setCurMove(prev => {
            const p = prev < 0 ? 0 : prev;
            return Math.max(0, Math.min(allMoves.length - 1, p + dir));
        });
    };
    const handleSlider = (e) => { setPlaying(false); setCurMove(parseInt(e.target.value)); };

    // Zoom com scroll
    const handleWheel = useCallback((e) => {
        e.preventDefault();
        setZoom(z => Math.max(0.3, Math.min(5, z + (e.deltaY < 0 ? 0.15 : -0.15))));
    }, []);

    // Pan com drag
    const handleMouseDown = (e) => { panRef.current = { startX: e.clientX - panOff.x, startY: e.clientY - panOff.y }; };
    const handleMouseMove = (e) => { if (panRef.current) setPanOff({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY }); };
    const handleMouseUp = () => { panRef.current = null; };

    const { tool: activeTool, op: activeOp } = curMove >= 0 ? getActiveEventsAt(curMove) : { tool: '', op: '' };

    const btnSt = { padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 4, border: '1px solid #585b70', background: '#313244', color: '#cdd6f4', display: 'flex', alignItems: 'center', gap: 3 };
    const btnAct = { ...btnSt, background: '#fab387', color: '#1e1e2e', borderColor: '#fab387' };

    return (
        <div style={{ position: 'relative' }}>
            <canvas ref={canvasRef} width={760} height={400}
                style={{ borderRadius: '8px 8px 0 0', border: '1px solid var(--border)', borderBottom: 'none', cursor: panRef.current ? 'grabbing' : 'grab', display: 'block', width: '100%' }}
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />
            {/* Controles de zoom (top-right) */}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                <button onClick={() => setZoom(z => Math.min(5, z + 0.3))} style={btnSt}>+</button>
                <button onClick={() => setZoom(z => Math.max(0.3, z - 0.3))} style={btnSt}>−</button>
                <button onClick={() => { setZoom(1); setPanOff({ x: 0, y: 0 }); }} style={btnSt}>Reset</button>
            </div>
            {/* Zoom info (top-left) */}
            <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, color: '#a6adc8', background: '#181825cc', padding: '2px 8px', borderRadius: 4 }}>
                Zoom: {(zoom * 100).toFixed(0)}% | Scroll=zoom, Drag=pan
            </div>
            {/* Barra de controles de animação */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#1e1e2e', border: '1px solid var(--border)', borderTop: 'none' }}>
                {!playing ? (
                    <button onClick={handlePlay} style={btnAct} title="Play (simular)">▶</button>
                ) : (
                    <button onClick={handlePause} style={btnAct} title="Pausar">‖</button>
                )}
                <button onClick={handleStop} style={btnSt} title="Parar e voltar ao estático">■</button>
                <button onClick={() => handleStep(-1)} style={btnSt} title="Voltar 1 move">«</button>
                <button onClick={() => handleStep(1)} style={btnSt} title="Avançar 1 move">»</button>
                <input type="range" min={0} max={Math.max(0, allMoves.length - 1)} value={curMove < 0 ? 0 : curMove}
                    onChange={handleSlider}
                    style={{ flex: 1, height: 4, accentColor: '#fab387', cursor: 'pointer' }} />
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                    style={{ ...btnSt, padding: '2px 4px', fontSize: 10, cursor: 'pointer' }}>
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={5}>5x</option>
                    <option value={10}>10x</option>
                    <option value={20}>20x</option>
                </select>
                <span style={{ fontSize: 10, color: '#a6adc8', whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right' }}>
                    {curMove >= 0 ? `${curMove + 1}/${allMoves.length}` : `${allMoves.length} moves`}
                </span>
            </div>
            {/* Legenda de operações + ferramenta ativa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: '#1e1e2e', borderRadius: '0 0 8px 8px', border: '1px solid var(--border)', borderTop: 'none', flexWrap: 'wrap' }}>
                {/* Rapid sempre aparece */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#f38ba8', opacity: 0.6 }}>
                    <span style={{ width: 12, height: 0, borderTop: '1px dashed #f38ba8', display: 'inline-block' }} />
                    Rápido
                </span>
                {foundOps.map(cat => {
                    const isActive = activeOp && getOpCat(activeOp).key === cat.key;
                    return (
                        <span key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: isActive ? cat.color : '#6c7086', fontWeight: isActive ? 700 : 400, transition: 'all 0.2s' }}>
                            <span style={{ width: 8, height: 3, borderRadius: 1, background: cat.color, display: 'inline-block', opacity: isActive ? 1 : 0.5 }} />
                            {cat.label}
                        </span>
                    );
                })}
                {foundOps.length === 0 && <span style={{ fontSize: 10, color: '#6c7086' }}>Sem operações identificadas</span>}
                {activeTool && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f9e2af', fontWeight: 600 }}>◈ {activeTool}</span>}
            </div>
        </div>
    );
}

