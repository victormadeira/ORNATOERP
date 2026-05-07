/**
 * ScanPeca3D — Identificacao de Peca para Montador.
 * Operador escaneia QR/barcode da etiqueta -> ve peca em 3D com contexto de montagem.
 *
 * Rota: /scan/:token  ou  /scan?peca=ID
 * - token = persistent_id ou controle da peca
 * - Tambem aceita digitacao manual do codigo
 * - Camera scanner via BarcodeDetector API
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import PecaViewer3D from '../components/PecaViewer3D';
import {
    Package, Scan, Camera, CheckCircle2, AlertCircle,
    ChevronRight, Layers, Box, Ruler, Palette, Eye, ArrowLeft,
    Wrench, ListChecks, ChevronDown, ChevronUp, X,
} from 'lucide-react';

const API_BASE = '/api';

async function fetchPeca(codigo) {
    const res = await fetch(`${API_BASE}/cnc/scan/${encodeURIComponent(codigo)}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Peca nao encontrada (${res.status})`);
    }
    return res.json();
}

async function fetchLotePecas(loteId) {
    const res = await fetch(`${API_BASE}/cnc/lotes/${encodeURIComponent(loteId)}`);
    if (!res.ok) return { pecas: [] };
    return res.json();
}

function parseMach(mj) {
    if (!mj) return [];
    try {
        const d = typeof mj === 'string' ? JSON.parse(mj) : mj;
        return Array.isArray(d) ? d : d.workers ? (Array.isArray(d.workers) ? d.workers : Object.values(d.workers)) : [];
    } catch { return []; }
}

/* ---- Edge Banding Diagram ---- */
function EdgeDiagram({ peca }) {
    const edges = {
        top:    { label: 'Frontal',  code: peca.borda_frontal,  color: peca.borda_cor_frontal },
        bottom: { label: 'Traseira', code: peca.borda_traseira, color: peca.borda_cor_traseira },
        right:  { label: 'Direita',  code: peca.borda_dir,      color: peca.borda_cor_dir },
        left:   { label: 'Esquerda', code: peca.borda_esq,      color: peca.borda_cor_esq },
    };

    const isActive = (code) => code && code !== '-' && code !== '';

    const edgeStyle = (active, edgeColor) => ({
        background: active ? (edgeColor || 'var(--success)') : '#333',
        opacity: active ? 1 : 0.4,
    });

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: 320, margin: '0 auto', padding: '36px 56px' }}>
            {/* The rectangle (piece top-down view) */}
            <div style={{
                width: '100%', aspectRatio: '1.6 / 1',
                background: 'rgba(255,255,255,0.06)',
                border: '2px solid rgba(255,255,255,0.15)',
                borderRadius: 6,
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#666',
            }}>
                <span>{peca.comprimento} x {peca.largura}</span>

                {/* Top edge (Frontal) */}
                <div style={{
                    position: 'absolute', top: -5, left: 8, right: 8, height: 5, borderRadius: '3px 3px 0 0',
                    ...edgeStyle(isActive(edges.top.code), edges.top.color),
                }} />
                {/* Bottom edge (Traseira) */}
                <div style={{
                    position: 'absolute', bottom: -5, left: 8, right: 8, height: 5, borderRadius: '0 0 3px 3px',
                    ...edgeStyle(isActive(edges.bottom.code), edges.bottom.color),
                }} />
                {/* Left edge (Esquerda) */}
                <div style={{
                    position: 'absolute', left: -5, top: 8, bottom: 8, width: 5, borderRadius: '3px 0 0 3px',
                    ...edgeStyle(isActive(edges.left.code), edges.left.color),
                }} />
                {/* Right edge (Direita) */}
                <div style={{
                    position: 'absolute', right: -5, top: 8, bottom: 8, width: 5, borderRadius: '0 3px 3px 0',
                    ...edgeStyle(isActive(edges.right.code), edges.right.color),
                }} />
            </div>

            {/* Labels */}
            {/* Top label (Frontal) */}
            <div style={{ position: 'absolute', top: 4, left: 0, right: 0, textAlign: 'center' }}>
                <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: isActive(edges.top.code) ? 'var(--success)' : '#555',
                }}>
                    {edges.top.label} {isActive(edges.top.code) ? `(${edges.top.code})` : ''}
                </span>
            </div>
            {/* Bottom label (Traseira) */}
            <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center' }}>
                <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: isActive(edges.bottom.code) ? 'var(--success)' : '#555',
                }}>
                    {edges.bottom.label} {isActive(edges.bottom.code) ? `(${edges.bottom.code})` : ''}
                </span>
            </div>
            {/* Left label (Esquerda) */}
            <div style={{
                position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%) rotate(-90deg)',
                transformOrigin: 'center',
            }}>
                <span style={{
                    fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                    color: isActive(edges.left.code) ? 'var(--success)' : '#555',
                }}>
                    {edges.left.label} {isActive(edges.left.code) ? `(${edges.left.code})` : ''}
                </span>
            </div>
            {/* Right label (Direita) */}
            <div style={{
                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%) rotate(90deg)',
                transformOrigin: 'center',
            }}>
                <span style={{
                    fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                    color: isActive(edges.right.code) ? 'var(--success)' : '#555',
                }}>
                    {edges.right.label} {isActive(edges.right.code) ? `(${edges.right.code})` : ''}
                </span>
            </div>
        </div>
    );
}

/* ---- Camera Scanner Modal ---- */
function CameraScanner({ onDetect, onClose }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [error, setError] = useState('');
    const [scanning, setScanning] = useState(true);

    useEffect(() => {
        if (!('BarcodeDetector' in window)) {
            setError('BarcodeDetector API nao suportada neste navegador. Use Chrome 83+ ou Edge 83+.');
            return;
        }

        let cancelled = false;
        const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'] });

        async function startCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                streamRef.current = stream;
                if (videoRef.current && !cancelled) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    detectLoop(detector);
                }
            } catch (e) {
                setError('Nao foi possivel acessar a camera: ' + e.message);
            }
        }

        async function detectLoop(det) {
            if (cancelled || !videoRef.current) return;
            try {
                const barcodes = await det.detect(videoRef.current);
                if (barcodes.length > 0 && !cancelled) {
                    setScanning(false);
                    onDetect(barcodes[0].rawValue);
                    return;
                }
            } catch { /* ignore detection errors */ }
            if (!cancelled) requestAnimationFrame(() => detectLoop(det));
        }

        startCamera();

        return () => {
            cancelled = true;
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, [onDetect]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                position: 'relative', width: '90vw', maxWidth: 500,
                borderRadius: 16, overflow: 'hidden', background: '#111',
            }}>
                {error ? (
                    <div style={{ padding: 32, textAlign: 'center' }}>
                        <AlertCircle size={40} color="#ef4444" style={{ marginBottom: 12 }} />
                        <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>
                    </div>
                ) : (
                    <>
                        <video ref={videoRef} style={{ width: '100%', display: 'block' }} playsInline muted />
                        {scanning && (
                            <div style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <div style={{
                                    width: 200, height: 200, border: '3px solid rgba(59,130,246,0.7)',
                                    borderRadius: 16, animation: 'pulse-border 1.5s ease-in-out infinite',
                                }} />
                            </div>
                        )}
                    </>
                )}
            </div>
            <button onClick={onClose} style={{
                marginTop: 20, padding: '12px 32px', fontSize: 15, fontWeight: 600,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 10, color: '#fff', cursor: 'pointer',
            }}>
                Fechar Camera
            </button>
        </div>
    );
}

/* ---- Piece type heuristics for exploded view ---- */
function classifyPiece(desc) {
    if (!desc) return 'other';
    const d = desc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/lateral\s*dir|lateral\s*direita/.test(d)) return 'lateral_dir';
    if (/lateral\s*esq|lateral\s*esquerda/.test(d)) return 'lateral_esq';
    if (/^base|fundo\s*inf/.test(d)) return 'base';
    if (/tampo|topo/.test(d)) return 'tampo';
    if (/traseira/.test(d) || (/fundo/.test(d) && !/inf/.test(d))) return 'traseira';
    if (/prateleira|shelf/.test(d)) return 'prateleira';
    if (/porta|door/.test(d)) return 'porta';
    if (/frente.*gaveta|drawer.*front/.test(d)) return 'gaveta';
    if (/divisoria|divis/.test(d)) return 'divisoria';
    return 'other';
}

const PIECE_COLORS = {
    lateral_dir: 'var(--info)', lateral_esq: 'var(--info)',
    base: 'var(--success)', tampo: 'var(--primary)',
    traseira: 'var(--muted)', prateleira: '#06b6d4',
    porta: 'var(--warning)', gaveta: 'var(--warning)',
    divisoria: '#ec4899', other: 'var(--muted)',
};

const PIECE_LABELS = {
    lateral_dir: 'Lat. Dir.', lateral_esq: 'Lat. Esq.',
    base: 'Base', tampo: 'Tampo',
    traseira: 'Traseira', prateleira: 'Prateleira',
    porta: 'Porta', gaveta: 'Frente Gaveta',
    divisoria: 'Divisoria', other: 'Peca',
};

/* exploded position offsets (translateX, translateY, translateZ, rotateX, rotateY) */
function getExplodedTransform(type, idx, exploded) {
    const s = exploded ? 1 : 0;
    const stagger = idx * 4 * s;
    const transforms = {
        lateral_dir: `translateX(${110 * s}px) translateZ(${stagger}px)`,
        lateral_esq:  `translateX(${-110 * s}px) translateZ(${stagger}px)`,
        base:         `translateY(${90 * s}px) translateZ(${stagger}px)`,
        tampo:        `translateY(${-90 * s}px) translateZ(${stagger}px)`,
        traseira:     `translateZ(${-80 * s + stagger}px)`,
        prateleira:   `translateY(${20 * s}px) translateZ(${30 * s + stagger}px)`,
        porta:        `translateZ(${100 * s + stagger}px)`,
        gaveta:       `translateZ(${100 * s + stagger}px) translateY(${30 * s}px)`,
        divisoria:    `translateX(${20 * s}px) translateZ(${stagger}px)`,
        other:        `translateZ(${40 * s + stagger}px)`,
    };
    return transforms[type] || transforms.other;
}

function getCompactSize(type) {
    switch (type) {
        case 'lateral_dir': case 'lateral_esq': return { w: 20, h: 90 };
        case 'base': case 'tampo': return { w: 100, h: 20 };
        case 'traseira': return { w: 96, h: 86 };
        case 'prateleira': return { w: 80, h: 14 };
        case 'porta': case 'gaveta': return { w: 46, h: 70 };
        case 'divisoria': return { w: 12, h: 80 };
        default: return { w: 40, h: 40 };
    }
}

/* ---- ModuleExplodedView ---- */
function ModuleExplodedView({ allPieces, highlightId, onClose }) {
    const [exploded, setExploded] = useState(true);
    const [hoveredId, setHoveredId] = useState(null);

    const classified = allPieces.map((p, i) => {
        const type = classifyPiece(p.descricao);
        return { ...p, _type: type, _idx: i };
    });

    // Count by type for stagger offset
    const typeCounters = {};
    classified.forEach(p => {
        typeCounters[p._type] = (typeCounters[p._type] || 0);
        p._typeIdx = typeCounters[p._type]++;
    });

    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)', padding: 20, marginBottom: 20,
            position: 'relative',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{
                    margin: 0, fontSize: 14, fontWeight: 700, color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <Layers size={16} color="#60a5fa" />
                    Vista do Modulo ({allPieces.length} pecas)
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setExploded(!exploded)} style={{
                        padding: '6px 14px', fontSize: 11, fontWeight: 700,
                        background: exploded ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.08)',
                        border: `1px solid ${exploded ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.12)'}`,
                        borderRadius: 8, color: exploded ? '#60a5fa' : '#aaa', cursor: 'pointer',
                        textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                        {exploded ? 'Compacto' : 'Explodido'}
                    </button>
                    <button onClick={onClose} style={{
                        width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.06)', color: '#888', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* 3D Scene */}
            <div style={{
                perspective: 600, perspectiveOrigin: '50% 40%',
                width: '100%', height: 320, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
            }}>
                <div style={{
                    transformStyle: 'preserve-3d',
                    transform: 'rotateX(-15deg) rotateY(-25deg)',
                    position: 'relative', width: 240, height: 200,
                }}>
                    {classified.map((p) => {
                        const type = p._type;
                        const color = PIECE_COLORS[type];
                        const isHighlighted = p.id === highlightId;
                        const isHovered = p.id === hoveredId;
                        const size = getCompactSize(type);
                        const transform = getExplodedTransform(type, p._typeIdx, exploded);

                        return (
                            <div
                                key={p.id}
                                onMouseEnter={() => setHoveredId(p.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                style={{
                                    position: 'absolute',
                                    left: '50%', top: '50%',
                                    width: size.w, height: size.h,
                                    marginLeft: -size.w / 2, marginTop: -size.h / 2,
                                    background: `${color}${isHighlighted ? '55' : '30'}`,
                                    border: `2px solid ${isHighlighted ? '#60a5fa' : isHovered ? '#fff' : color + '60'}`,
                                    borderRadius: 4,
                                    transform,
                                    transition: 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1), border-color 0.2s, box-shadow 0.2s',
                                    boxShadow: isHighlighted
                                        ? '0 0 20px rgba(59,130,246,0.5), inset 0 0 10px rgba(59,130,246,0.15)'
                                        : isHovered ? '0 0 12px rgba(255,255,255,0.15)' : 'none',
                                    animation: isHighlighted ? 'exploded-pulse 2s ease-in-out infinite' : 'none',
                                    cursor: 'default',
                                    zIndex: isHighlighted ? 10 : isHovered ? 5 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <span style={{
                                    fontSize: 8, fontWeight: 700, color: '#fff',
                                    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    maxWidth: size.w - 4, textAlign: 'center',
                                    opacity: (isHovered || isHighlighted) ? 1 : 0.7,
                                }}>
                                    {p.descricao || PIECE_LABELS[type]}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
                {[...new Set(classified.map(p => p._type))].map(type => (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#888' }}>
                        <span style={{
                            width: 10, height: 10, borderRadius: 2,
                            background: PIECE_COLORS[type], flexShrink: 0,
                        }} />
                        {PIECE_LABELS[type]}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ---- MontageChecklist ---- */
function MontageChecklist({ allPieces, currentPeca }) {
    const [checkedIds, setCheckedIds] = useState({});
    const [collapsed, setCollapsed] = useState(false);

    // Build montage order
    const ORDER_PRIORITY = {
        base: 1, lateral_esq: 2, lateral_dir: 3, divisoria: 4,
        prateleira: 5, traseira: 6, tampo: 7, porta: 8, gaveta: 9, other: 10,
    };

    const pieces = allPieces.map(p => ({
        ...p, _type: classifyPiece(p.descricao),
    })).sort((a, b) => (ORDER_PRIORITY[a._type] || 10) - (ORDER_PRIORITY[b._type] || 10));

    const checkedCount = Object.values(checkedIds).filter(Boolean).length;

    // Hardware inference from machining_json
    const allWorkers = allPieces.flatMap(p => parseMach(p.machining_json));
    let hinges = 0, minifix = 0, cavilhas = 0, grooves = 0;
    allWorkers.forEach(w => {
        const d = parseFloat(w.diameter) || 0;
        const cat = (w.category || '').toLowerCase();
        const isHole = /hole|furo/i.test(cat);
        const isGroove = /groove|rasgo|canal|saw/i.test(cat);
        if (isHole && d >= 33 && d <= 37) hinges++;
        else if (isHole && d >= 14 && d <= 16) minifix++;
        else if (isHole && d >= 7 && d <= 9) cavilhas++;
        if (isGroove) grooves++;
    });

    const toggle = (id) => setCheckedIds(prev => ({ ...prev, [id]: !prev[id] }));

    const statusIcon = (p) => {
        const scanned = p.scanned || p.expedida;
        if (scanned) return { icon: <CheckCircle2 size={14} color="#22c55e" />, label: 'Conferida' };
        return { icon: <Box size={14} color="#666" />, label: 'Pendente' };
    };

    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)', marginBottom: 20,
            overflow: 'hidden',
        }}>
            {/* Header */}
            <button onClick={() => setCollapsed(!collapsed)} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ListChecks size={16} color="#f59e0b" />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                        Checklist de Montagem
                    </span>
                    <span style={{
                        fontSize: 11, fontWeight: 600, color: '#888',
                        padding: '2px 8px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.06)',
                    }}>
                        {checkedCount}/{pieces.length} pecas
                    </span>
                </div>
                {collapsed ? <ChevronDown size={18} color="#888" /> : <ChevronUp size={18} color="#888" />}
            </button>

            {!collapsed && (
                <div style={{ padding: '0 20px 20px' }}>
                    {/* Progress bar */}
                    <div style={{
                        height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)',
                        marginBottom: 16, overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%', borderRadius: 2,
                            background: 'linear-gradient(90deg, #f59e0b, #22c55e)',
                            width: `${pieces.length > 0 ? (checkedCount / pieces.length) * 100 : 0}%`,
                            transition: 'width 0.3s ease',
                        }} />
                    </div>

                    {/* Suggested order header */}
                    <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontWeight: 600 }}>
                        Ordem sugerida de montagem
                    </div>

                    {/* Pieces list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {pieces.map((p, i) => {
                            const st = statusIcon(p);
                            const isCurrent = p.id === currentPeca?.id;
                            return (
                                <label key={p.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                                    background: isCurrent ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${isCurrent ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.04)'}`,
                                    transition: 'background 0.15s',
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={!!checkedIds[p.id]}
                                        onChange={() => toggle(p.id)}
                                        style={{ accentColor: 'var(--warning)', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                                    />
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: '#555',
                                        width: 20, textAlign: 'center', flexShrink: 0,
                                    }}>
                                        {i + 1}.
                                    </span>
                                    {st.icon}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 12, fontWeight: 600,
                                            color: checkedIds[p.id] ? '#666' : '#ddd',
                                            textDecoration: checkedIds[p.id] ? 'line-through' : 'none',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {p.descricao || `Peca #${p.id}`}
                                            {isCurrent && <span style={{ color: '#60a5fa', fontSize: 10, marginLeft: 6 }}>(atual)</span>}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
                                            {p.comprimento}x{p.largura}x{p.espessura}mm
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                                        background: `${PIECE_COLORS[classifyPiece(p.descricao)]}20`,
                                        color: PIECE_COLORS[classifyPiece(p.descricao)],
                                        fontWeight: 600, whiteSpace: 'nowrap',
                                    }}>
                                        {PIECE_LABELS[classifyPiece(p.descricao)]}
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    {/* Hardware summary */}
                    {(hinges > 0 || minifix > 0 || cavilhas > 0 || grooves > 0) && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{
                                fontSize: 10, color: '#666', textTransform: 'uppercase',
                                letterSpacing: 0.5, marginBottom: 8, fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                <Wrench size={12} color="#888" />
                                Ferragens estimadas
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {hinges > 0 && (
                                    <div style={{
                                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--danger)',
                                    }}>
                                        {hinges} dobradica{hinges > 1 ? 's' : ''}
                                    </div>
                                )}
                                {minifix > 0 && (
                                    <div style={{
                                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                        background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--info)',
                                    }}>
                                        {minifix} minifix
                                    </div>
                                )}
                                {cavilhas > 0 && (
                                    <div style={{
                                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                        background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: 'var(--success)',
                                    }}>
                                        ~{cavilhas} cavilha{cavilhas > 1 ? 's' : ''}
                                    </div>
                                )}
                                {grooves > 0 && (
                                    <div style={{
                                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--warning)',
                                    }}>
                                        {grooves} canal{grooves > 1 ? '/rasgos' : '/rasgo'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ---- Main Component ---- */
export default function ScanPeca3D({ codigo: initialCodigo }) {
    const [codigo, setCodigo] = useState(initialCodigo || '');
    const [peca, setPeca] = useState(null);
    const [lote, setLote] = useState(null);
    const [scans, setScans] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scanHistory, setScanHistory] = useState([]);
    const [showCamera, setShowCamera] = useState(false);
    const [modulePecas, setModulePecas] = useState([]);
    const [loadingModule, setLoadingModule] = useState(false);
    const [showModuleView, setShowModuleView] = useState(false);
    const [showChecklist, setShowChecklist] = useState(false);
    const inputRef = useRef(null);

    const buscar = useCallback(async (cod) => {
        if (!cod || !cod.trim()) return;
        setLoading(true);
        setError('');
        setModulePecas([]);
        setShowModuleView(false);
        setShowChecklist(false);
        try {
            const data = await fetchPeca(cod);
            setPeca(data.peca);
            setLote(data.lote);
            setScans(data.scans || []);
            setScanHistory(prev => {
                const next = [{ codigo: cod, peca: data.peca, timestamp: Date.now() }, ...prev];
                return next.slice(0, 20);
            });

            // Fetch module pieces
            if (data.lote?.id && data.peca?.modulo_desc) {
                setLoadingModule(true);
                try {
                    const loteData = await fetchLotePecas(data.lote.id);
                    const siblings = (loteData.pecas || []).filter(
                        p => p.modulo_desc === data.peca.modulo_desc && p.id !== data.peca.id
                    );
                    setModulePecas(siblings);
                } catch { setModulePecas([]); }
                finally { setLoadingModule(false); }
            }
        } catch (err) {
            setError(err.message);
            setPeca(null);
            setLote(null);
            setScans([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialCodigo) buscar(initialCodigo);
    }, [initialCodigo, buscar]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        buscar(codigo.trim());
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscar(codigo.trim());
        }
    };

    const handleCameraDetect = (value) => {
        setShowCamera(false);
        setCodigo(value);
        buscar(value);
    };

    const workers = parseMach(peca?.machining_json);
    const bordas = [
        peca?.borda_frontal && peca.borda_frontal !== '-' ? 'Frontal' : null,
        peca?.borda_traseira && peca.borda_traseira !== '-' ? 'Traseira' : null,
        peca?.borda_dir && peca.borda_dir !== '-' ? 'Direita' : null,
        peca?.borda_esq && peca.borda_esq !== '-' ? 'Esquerda' : null,
    ].filter(Boolean);

    const wasScanned = scans.length > 0;
    const lastScan = wasScanned ? scans[scans.length - 1] : null;

    return (
        <div style={{
            minHeight: '100vh', background: '#0f0f1a', color: '#e0e0e0',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            {/* Camera Modal */}
            {showCamera && (
                <CameraScanner
                    onDetect={handleCameraDetect}
                    onClose={() => setShowCamera(false)}
                />
            )}

            {/* Header */}
            <header style={{
                padding: '16px 20px', background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'linear-gradient(135deg, var(--primary), #0891b2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <Package size={20} color="#fff" />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                    <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>
                        Identificacao de Peca — Montador
                    </h1>
                    <p style={{ margin: 0, fontSize: 11, color: '#888' }}>
                        Escaneie a etiqueta para identificar a peca e ver instrucoes de montagem
                    </p>
                </div>
                {lote && (
                    <div style={{
                        textAlign: 'right', padding: '6px 14px',
                        background: 'rgba(96,165,250,0.1)', borderRadius: 8,
                        border: '1px solid rgba(96,165,250,0.2)',
                    }}>
                        <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Lote</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa' }}>{lote.nome}</div>
                    </div>
                )}
            </header>

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px 40px' }}>
                {/* Search bar + Camera button */}
                <form onSubmit={handleSubmit} style={{
                    display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
                }}>
                    <div style={{ flex: '1 1 250px', position: 'relative' }}>
                        <Scan size={18} color="#555" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            ref={inputRef}
                            value={codigo}
                            onChange={e => setCodigo(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Escaneie ou digite o codigo..."
                            autoFocus
                            style={{
                                width: '100%', padding: '14px 16px 14px 42px', fontSize: 17, fontFamily: 'monospace',
                                fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.1)',
                                borderRadius: 10, color: '#fff', outline: 'none', transition: 'border .2s',
                                letterSpacing: 1, boxSizing: 'border-box',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--info)'}
                            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                        />
                        {loading && (
                            <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }}>
                                <div style={{
                                    width: 20, height: 20, border: '2px solid var(--primary)', borderTopColor: 'transparent',
                                    borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                                }} />
                            </div>
                        )}
                    </div>
                    <button type="button" onClick={() => setShowCamera(true)} style={{
                        padding: '14px 18px', fontSize: 14, fontWeight: 600,
                        background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                        border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                    }}>
                        <Camera size={18} /> Camera
                    </button>
                    <button type="submit" disabled={loading} style={{
                        padding: '14px 24px', fontSize: 15, fontWeight: 700,
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                        border: 'none', borderRadius: 10, cursor: 'pointer',
                        opacity: loading ? 0.6 : 1, transition: 'opacity .2s',
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <Scan size={16} /> Buscar
                    </button>
                </form>

                {/* Error */}
                {error && (
                    <div style={{
                        padding: '14px 18px', background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
                        color: 'var(--danger)', fontSize: 14, marginBottom: 20, fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}

                {/* Piece detail */}
                {peca && (
                    <>
                        {/* ===== STATUS BADGE ===== */}
                        {wasScanned && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 16px', marginBottom: 16, borderRadius: 10,
                                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                            }}>
                                <CheckCircle2 size={20} color="#22c55e" />
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>Peca ja escaneada / expedida</div>
                                    {lastScan && (
                                        <div style={{ fontSize: 11, color: '#888' }}>
                                            Ultimo scan: {new Date(lastScan.created_at || lastScan.timestamp).toLocaleString('pt-BR')}
                                            {lastScan.usuario ? ` por ${lastScan.usuario}` : ''}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ===== MODULE BADGE - VERY PROMINENT ===== */}
                        {(peca.modulo_desc || peca.produto_final) && (
                            <div style={{
                                padding: '20px 24px', marginBottom: 20, borderRadius: 14,
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                                border: '2px solid rgba(96,165,250,0.3)',
                                textAlign: 'center',
                            }}>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                    marginBottom: 6,
                                }}>
                                    <Layers size={20} color="#60a5fa" />
                                    <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#888', fontWeight: 600 }}>
                                        Modulo / Produto
                                    </span>
                                </div>
                                <h2 style={{
                                    margin: 0, fontSize: 24, fontWeight: 800, color: '#fff',
                                    lineHeight: 1.3,
                                }}>
                                    {peca.produto_final || ''}
                                    {peca.produto_final && peca.modulo_desc ? ' — ' : ''}
                                    {peca.modulo_desc || ''}
                                </h2>
                                {/* Ver no Modulo button */}
                                {(modulePecas.length > 0 || peca.modulo_desc) && (
                                    <button
                                        onClick={() => setShowModuleView(v => !v)}
                                        style={{
                                            marginTop: 12, padding: '8px 20px', fontSize: 12, fontWeight: 700,
                                            background: showModuleView ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.08)',
                                            border: `1px solid ${showModuleView ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.15)'}`,
                                            borderRadius: 8, color: showModuleView ? '#60a5fa' : '#ccc',
                                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <Layers size={14} />
                                        {showModuleView ? 'Fechar Vista do Modulo' : 'Ver no Modulo'}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* #33 — Exploded Module View */}
                        {showModuleView && peca.modulo_desc && (
                            <ModuleExplodedView
                                allPieces={[peca, ...modulePecas]}
                                highlightId={peca.id}
                                onClose={() => setShowModuleView(false)}
                            />
                        )}

                        {/* #34 — Montage Checklist */}
                        {showModuleView && peca.modulo_desc && (
                            <MontageChecklist
                                allPieces={[peca, ...modulePecas]}
                                currentPeca={peca}
                            />
                        )}

                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>

                            {/* ===== LEFT COLUMN: 3D + Edge Diagram ===== */}
                            <div style={{ flex: '1 1 400px', minWidth: 300 }}>

                                {/* 3D Viewer */}
                                <div style={{
                                    borderRadius: 12, overflow: 'hidden',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    background: '#1a1a2e', marginBottom: 16,
                                }}>
                                    <PecaViewer3D peca={peca} width={Math.min(560, window.innerWidth - 60)} height={360} />
                                </div>
                                <p style={{ fontSize: 11, color: '#555', marginTop: -8, marginBottom: 16, textAlign: 'center' }}>
                                    Arraste para rotacionar -- Scroll para zoom
                                </p>

                                {/* ===== EDGE BANDING VISUAL DIAGRAM ===== */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                                    border: '1px solid rgba(255,255,255,0.08)', padding: 16, marginBottom: 16,
                                }}>
                                    <h3 style={{
                                        margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#fff',
                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                        display: 'flex', alignItems: 'center', gap: 8,
                                    }}>
                                        <Palette size={15} color="#22c55e" />
                                        Bordas / Fitagem — Diagrama
                                    </h3>
                                    <p style={{ margin: '0 0 8px', fontSize: 11, color: '#666' }}>
                                        Verde = fitar &nbsp; Cinza = sem fita
                                    </p>
                                    <EdgeDiagram peca={peca} />
                                    {bordas.length > 0 && (
                                        <div style={{
                                            marginTop: 8, textAlign: 'center',
                                            fontSize: 12, color: 'var(--success)', fontWeight: 700,
                                        }}>
                                            Fitar: {bordas.join(', ')}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ===== RIGHT COLUMN: Info Cards ===== */}
                            <div style={{ flex: '1 1 300px', minWidth: 280 }}>

                                {/* Main info card */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                                    border: '1px solid rgba(255,255,255,0.08)', padding: 20, marginBottom: 16,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                                        <Box size={18} color="#60a5fa" style={{ marginTop: 2, flexShrink: 0 }} />
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
                                                {peca.descricao || peca.upmcode || 'Peca'}
                                            </h2>
                                            {peca.upmcode && peca.descricao && (
                                                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#666', fontFamily: 'monospace' }}>
                                                    {peca.upmcode}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Dimensions */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                                        {[
                                            ['Comp.', peca.comprimento, '#60a5fa'],
                                            ['Larg.', peca.largura, '#34d399'],
                                            ['Esp.', peca.espessura, '#fbbf24'],
                                        ].map(([label, val, color]) => (
                                            <div key={label} style={{
                                                textAlign: 'center', padding: '10px 6px', borderRadius: 8,
                                                background: `${color}10`, border: `1px solid ${color}30`,
                                            }}>
                                                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color }}>{val}</div>
                                                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{label} (mm)</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Material + Qty tags */}
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <Tag color="#3b82f6" label="Material" value={peca.material_code || peca.material || '-'} />
                                        <Tag color="#f59e0b" label="Qtd" value={peca.quantidade} />
                                        {peca.grain && peca.grain !== 'sem_veio' && (
                                            <Tag color="#f97316" label="Veio" value={peca.grain} />
                                        )}
                                    </div>
                                </div>

                                {/* ===== ASSEMBLY CONTEXT CARD ===== */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                                    border: '1px solid rgba(255,255,255,0.08)', padding: 16, marginBottom: 16,
                                }}>
                                    <h3 style={{
                                        margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#fff',
                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                        display: 'flex', alignItems: 'center', gap: 8,
                                    }}>
                                        <Eye size={15} color="#a78bfa" />
                                        Contexto de Montagem
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {peca.observacao && (
                                            <InfoRow label="Observacao" value={peca.observacao} highlight />
                                        )}
                                        {peca.usi_a && (
                                            <InfoRow label="USI A" value={peca.usi_a} />
                                        )}
                                        {peca.usi_b && (
                                            <InfoRow label="USI B" value={peca.usi_b} />
                                        )}
                                        {peca.upmdraw && (
                                            <InfoRow label="Desenho" value={peca.upmdraw} />
                                        )}
                                        {!peca.observacao && !peca.usi_a && !peca.usi_b && !peca.upmdraw && (
                                            <p style={{ fontSize: 12, color: '#555', margin: 0 }}>
                                                Nenhuma informacao adicional de montagem.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Edges detail card */}
                                <div style={{
                                    background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                                    border: '1px solid rgba(255,255,255,0.08)', padding: 16, marginBottom: 16,
                                }}>
                                    <h3 style={{
                                        margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#fff',
                                        textTransform: 'uppercase', letterSpacing: 0.5,
                                        display: 'flex', alignItems: 'center', gap: 8,
                                    }}>
                                        <Ruler size={15} color="#f59e0b" />
                                        Bordas — Detalhe
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                        {[
                                            ['Frontal', peca.borda_frontal, peca.borda_cor_frontal],
                                            ['Traseira', peca.borda_traseira, peca.borda_cor_traseira],
                                            ['Direita', peca.borda_dir, peca.borda_cor_dir],
                                            ['Esquerda', peca.borda_esq, peca.borda_cor_esq],
                                        ].map(([label, val, cor]) => {
                                            const active = val && val !== '-';
                                            return (
                                                <div key={label} style={{
                                                    display: 'flex', flexDirection: 'column', gap: 2,
                                                    padding: '8px 10px', borderRadius: 8,
                                                    background: active ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                                                    border: active ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.05)',
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
                                                        {active && cor && (
                                                            <span style={{
                                                                width: 10, height: 10, borderRadius: 2,
                                                                background: cor, border: '1px solid rgba(255,255,255,0.2)',
                                                                flexShrink: 0,
                                                            }} />
                                                        )}
                                                    </div>
                                                    <span style={{
                                                        fontSize: 12, fontWeight: 600,
                                                        color: active ? 'var(--success)' : '#444',
                                                    }}>
                                                        {active ? val : 'Sem fita'}
                                                    </span>
                                                    {active && cor && (
                                                        <span style={{ fontSize: 10, color: '#666' }}>Cor: {cor}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Machining card */}
                                {workers.length > 0 && (
                                    <div style={{
                                        background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.08)', padding: 16, marginBottom: 16,
                                    }}>
                                        <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            Usinagens ({workers.length})
                                        </h3>
                                        {workers.map((w, i) => {
                                            const cat = (w.category || '').replace(/_/g, ' ');
                                            const isHole = /hole|furo/i.test(cat);
                                            const isGroove = /groove|rasgo|canal|saw/i.test(cat);
                                            const color = isHole ? '#e11d48' : isGroove ? 'var(--warning)' : 'var(--info)';
                                            return (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '6px 0', borderBottom: i < workers.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                                }}>
                                                    <span style={{ width: 8, height: 8, borderRadius: isHole ? '50%' : 2, background: color, flexShrink: 0 }} />
                                                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize', color: '#ddd' }}>{cat}</span>
                                                    <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto', fontFamily: 'monospace' }}>
                                                        {w.face} {isHole ? `D${w.diameter}` : `${w.length}x${w.width}`} {w.depth}mm
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Position info */}
                                {peca.chapa_idx != null && peca.chapa_idx >= 0 && (
                                    <div style={{
                                        background: 'rgba(34,197,94,0.08)', borderRadius: 12,
                                        border: '1px solid rgba(34,197,94,0.2)', padding: 16, marginBottom: 16,
                                    }}>
                                        <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                                            Posicao no Plano de Corte
                                        </h3>
                                        <div style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>
                                            Chapa #{peca.chapa_idx + 1} -- X: {peca.pos_x}mm -- Y: {peca.pos_y}mm
                                            {peca.rotacionada ? ' -- Rotacionada 90deg' : ''}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ===== MODULE PIECES NAVIGATION ===== */}
                        {peca.modulo_desc && (
                            <div style={{ marginTop: 24 }}>
                                <h3 style={{
                                    fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    <Layers size={16} color="#60a5fa" />
                                    Outras pecas deste modulo
                                    <span style={{
                                        fontSize: 11, color: '#888', fontWeight: 400,
                                    }}>
                                        ({peca.modulo_desc})
                                    </span>
                                </h3>
                                {loadingModule ? (
                                    <div style={{ padding: 20, textAlign: 'center', color: '#666', fontSize: 13 }}>
                                        Carregando pecas do modulo...
                                    </div>
                                ) : modulePecas.length === 0 ? (
                                    <div style={{
                                        padding: '16px 20px', textAlign: 'center', color: '#555', fontSize: 13,
                                        background: 'rgba(255,255,255,0.02)', borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.05)',
                                    }}>
                                        Nenhuma outra peca encontrada neste modulo.
                                    </div>
                                ) : (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                                        gap: 8,
                                    }}>
                                        {modulePecas.map((mp) => {
                                            const mpScanned = mp.scanned || mp.expedida;
                                            return (
                                                <button
                                                    key={mp.id}
                                                    onClick={() => {
                                                        const c = mp.persistent_id || mp.controle || mp.id;
                                                        setCodigo(String(c));
                                                        buscar(String(c));
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 10,
                                                        padding: '12px 14px', textAlign: 'left',
                                                        background: 'rgba(255,255,255,0.04)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        borderRadius: 10, color: '#ddd', cursor: 'pointer',
                                                        transition: 'background .15s, border-color .15s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(96,165,250,0.3)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                                                >
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                                        background: mpScanned ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        {mpScanned
                                                            ? <CheckCircle2 size={16} color="#22c55e" />
                                                            : <Box size={16} color="#666" />
                                                        }
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            fontSize: 13, fontWeight: 600, color: '#e0e0e0',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}>
                                                            {mp.descricao || mp.upmcode || `Peca #${mp.id}`}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
                                                            {mp.comprimento}x{mp.largura}x{mp.espessura}mm
                                                        </div>
                                                    </div>
                                                    <ChevronRight size={16} color="#555" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Empty state */}
                {!peca && !error && !loading && (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#555' }}>
                        <div style={{
                            width: 80, height: 80, borderRadius: 20, margin: '0 auto 20px',
                            background: 'rgba(59,130,246,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Scan size={36} color="#3b82f6" style={{ opacity: 0.5 }} />
                        </div>
                        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600, color: '#888' }}>
                            Pronto para escanear
                        </h2>
                        <p style={{ fontSize: 14, color: '#666', maxWidth: 400, margin: '0 auto' }}>
                            Aponte o leitor de codigo de barras para a etiqueta da peca,
                            use a camera, ou digite o codigo manualmente.
                        </p>
                    </div>
                )}

                {/* Scan history */}
                {scanHistory.length > 1 && (
                    <div style={{ marginTop: 32 }}>
                        <h3 style={{
                            fontSize: 13, fontWeight: 700, color: '#888',
                            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <ArrowLeft size={14} />
                            Historico de scans
                        </h3>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {scanHistory.slice(1).map((s, i) => (
                                <button key={i} onClick={() => { setCodigo(s.codigo); buscar(s.codigo); }}
                                    style={{
                                        padding: '8px 14px', fontSize: 12, fontFamily: 'monospace',
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 8, color: '#aaa', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        transition: 'background .15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                >
                                    <Package size={12} />
                                    {s.peca?.descricao || s.codigo}
                                    <span style={{ color: '#555' }}>
                                        {new Date(s.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Animations */}
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse-border {
                    0%, 100% { border-color: rgba(59,130,246,0.7); }
                    50% { border-color: rgba(59,130,246,0.2); }
                }
                @keyframes exploded-pulse {
                    0%, 100% { box-shadow: 0 0 15px rgba(59,130,246,0.4), inset 0 0 8px rgba(59,130,246,0.1); }
                    50% { box-shadow: 0 0 25px rgba(59,130,246,0.7), inset 0 0 15px rgba(59,130,246,0.25); }
                }
            `}</style>
        </div>
    );
}

/* ---- Helper Components ---- */

function Tag({ color, label, value }) {
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 6,
            background: `${color}15`, border: `1px solid ${color}30`,
            fontSize: 11,
        }}>
            <span style={{ color: '#888' }}>{label}:</span>
            <span style={{ fontWeight: 700, color }}>{value}</span>
        </div>
    );
}

function InfoRow({ label, value, highlight }) {
    return (
        <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: highlight ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.02)',
            border: highlight ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(255,255,255,0.05)',
        }}>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                {label}
            </div>
            <div style={{
                fontSize: 13, color: highlight ? '#fbbf24' : '#ccc', fontWeight: 500,
                wordBreak: 'break-word',
            }}>
                {value}
            </div>
        </div>
    );
}
