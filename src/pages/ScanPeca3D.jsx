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
        background: active ? (edgeColor || '#22c55e') : '#333',
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
                    color: isActive(edges.top.code) ? '#22c55e' : '#555',
                }}>
                    {edges.top.label} {isActive(edges.top.code) ? `(${edges.top.code})` : ''}
                </span>
            </div>
            {/* Bottom label (Traseira) */}
            <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center' }}>
                <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: isActive(edges.bottom.code) ? '#22c55e' : '#555',
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
                    color: isActive(edges.left.code) ? '#22c55e' : '#555',
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
                    color: isActive(edges.right.code) ? '#22c55e' : '#555',
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
                        <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>
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
    const inputRef = useRef(null);

    const buscar = useCallback(async (cod) => {
        if (!cod || !cod.trim()) return;
        setLoading(true);
        setError('');
        setModulePecas([]);
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
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
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
                            onFocus={e => e.target.style.borderColor = '#3b82f6'}
                            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                        />
                        {loading && (
                            <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)' }}>
                                <div style={{
                                    width: 20, height: 20, border: '2px solid #3b82f6', borderTopColor: 'transparent',
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
                        color: '#ef4444', fontSize: 14, marginBottom: 20, fontWeight: 500,
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
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Peca ja escaneada / expedida</div>
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
                            </div>
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
                                            fontSize: 12, color: '#22c55e', fontWeight: 700,
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
                                                        color: active ? '#22c55e' : '#444',
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
                                            const color = isHole ? '#e11d48' : isGroove ? '#f59e0b' : '#8b5cf6';
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
                                        <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
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
