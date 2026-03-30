/**
 * ScanPeca3D — Página pública de expedição.
 * Operador escaneia QR/barcode da etiqueta → vê peça em 3D com todos os detalhes.
 *
 * Rota: /scan/:token  ou  /scan?peca=ID
 * - token = persistent_id ou controle da peça
 * - Também aceita digitação manual do código
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import PecaViewer3D from '../components/PecaViewer3D';

const API_BASE = '/api';

async function fetchPeca(codigo) {
    const res = await fetch(`${API_BASE}/cnc/scan/${encodeURIComponent(codigo)}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Peça não encontrada (${res.status})`);
    }
    return res.json();
}

function parseMach(mj) {
    if (!mj) return [];
    try { const d = typeof mj === 'string' ? JSON.parse(mj) : mj; return Array.isArray(d) ? d : d.workers ? (Array.isArray(d.workers) ? d.workers : Object.values(d.workers)) : []; } catch { return []; }
}

export default function ScanPeca3D({ codigo: initialCodigo }) {
    const [codigo, setCodigo] = useState(initialCodigo || '');
    const [peca, setPeca] = useState(null);
    const [lote, setLote] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scanHistory, setScanHistory] = useState([]);
    const inputRef = useRef(null);

    const buscar = useCallback(async (cod) => {
        if (!cod || !cod.trim()) return;
        setLoading(true);
        setError('');
        try {
            const data = await fetchPeca(cod);
            setPeca(data.peca);
            setLote(data.lote);
            setScanHistory(prev => {
                const next = [{ codigo: cod, peca: data.peca, timestamp: Date.now() }, ...prev];
                return next.slice(0, 20); // Keep last 20
            });
        } catch (err) {
            setError(err.message);
            setPeca(null);
            setLote(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-search on mount if codigo provided
    useEffect(() => {
        if (initialCodigo) buscar(initialCodigo);
    }, [initialCodigo, buscar]);

    // Focus input for barcode scanner
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        buscar(codigo.trim());
    };

    // Barcode scanner sends keystrokes ending with Enter
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscar(codigo.trim());
        }
    };

    const workers = parseMach(peca?.machining_json);
    const bordas = [
        peca?.borda_frontal && peca.borda_frontal !== '-' ? 'Frontal' : null,
        peca?.borda_traseira && peca.borda_traseira !== '-' ? 'Traseira' : null,
        peca?.borda_dir && peca.borda_dir !== '-' ? 'Direita' : null,
        peca?.borda_esq && peca.borda_esq !== '-' ? 'Esquerda' : null,
    ].filter(Boolean);

    return (
        <div style={{
            minHeight: '100vh', background: '#0f0f1a', color: '#e0e0e0',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            {/* Header */}
            <header style={{
                padding: '16px 24px', background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 16,
            }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff' }}>
                    3D
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>Expedição — Scanner de Peças</h1>
                    <p style={{ margin: 0, fontSize: 12, color: '#888' }}>Escaneie o código da etiqueta para visualizar a peça</p>
                </div>
                {lote && (
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#888' }}>Lote</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa' }}>{lote.nome}</div>
                    </div>
                )}
            </header>

            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
                {/* Search bar */}
                <form onSubmit={handleSubmit} style={{
                    display: 'flex', gap: 8, marginBottom: 24,
                }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input
                            ref={inputRef}
                            value={codigo}
                            onChange={e => setCodigo(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Escaneie ou digite o código da peça..."
                            autoFocus
                            style={{
                                width: '100%', padding: '14px 16px', fontSize: 18, fontFamily: 'monospace',
                                fontWeight: 600, background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.1)',
                                borderRadius: 10, color: '#fff', outline: 'none', transition: 'border .2s',
                                letterSpacing: 1,
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
                    <button type="submit" disabled={loading} style={{
                        padding: '14px 28px', fontSize: 15, fontWeight: 700,
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                        border: 'none', borderRadius: 10, cursor: 'pointer',
                        opacity: loading ? 0.6 : 1, transition: 'opacity .2s',
                    }}>
                        Buscar
                    </button>
                </form>

                {/* Error */}
                {error && (
                    <div style={{
                        padding: '14px 18px', background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
                        color: '#ef4444', fontSize: 14, marginBottom: 20, fontWeight: 500,
                    }}>
                        {error}
                    </div>
                )}

                {/* Piece detail */}
                {peca && (
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

                        {/* 3D Viewer */}
                        <div style={{ flex: '1 1 420px', minWidth: 320 }}>
                            <div style={{
                                borderRadius: 12, overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: '#1a1a2e',
                            }}>
                                <PecaViewer3D peca={peca} width={Math.min(560, window.innerWidth - 60)} height={400} />
                            </div>
                            <p style={{ fontSize: 11, color: '#666', marginTop: 6, textAlign: 'center' }}>
                                Arraste para rotacionar · Scroll para zoom
                            </p>
                        </div>

                        {/* Info panel */}
                        <div style={{ flex: '1 1 300px', minWidth: 280 }}>

                            {/* Main info card */}
                            <div style={{
                                background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.08)', padding: 20, marginBottom: 16,
                            }}>
                                <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#fff' }}>
                                    {peca.descricao || peca.upmcode || 'Peça'}
                                </h2>
                                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#888' }}>
                                    {peca.modulo_desc || ''} {peca.produto_final ? `· ${peca.produto_final}` : ''}
                                </p>

                                {/* Dimensions */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                                    {[
                                        ['Comprimento', peca.comprimento, '#60a5fa'],
                                        ['Largura', peca.largura, '#34d399'],
                                        ['Espessura', peca.espessura, '#fbbf24'],
                                    ].map(([label, val, color]) => (
                                        <div key={label} style={{
                                            textAlign: 'center', padding: '10px 8px', borderRadius: 8,
                                            background: `${color}10`, border: `1px solid ${color}30`,
                                        }}>
                                            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color }}>{val}</div>
                                            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{label} (mm)</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Material */}
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                    <Tag color="#3b82f6" label="Material" value={peca.material_code || peca.material || '-'} />
                                    <Tag color="#f59e0b" label="Qtd" value={peca.quantidade} />
                                    {peca.grain && peca.grain !== 'sem_veio' && (
                                        <Tag color="#f97316" label="Veio" value={peca.grain} />
                                    )}
                                </div>
                            </div>

                            {/* Edges card */}
                            <div style={{
                                background: 'rgba(255,255,255,0.04)', borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.08)', padding: 16, marginBottom: 16,
                            }}>
                                <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Bordas / Fitagem
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                    {[
                                        ['Frontal', peca.borda_frontal],
                                        ['Traseira', peca.borda_traseira],
                                        ['Direita', peca.borda_dir],
                                        ['Esquerda', peca.borda_esq],
                                    ].map(([label, val]) => {
                                        const active = val && val !== '-';
                                        return (
                                            <div key={label} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '6px 10px', borderRadius: 6,
                                                background: active ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.02)',
                                                border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.05)',
                                            }}>
                                                <span style={{ fontSize: 11, color: '#888' }}>{label}</span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600,
                                                    color: active ? '#60a5fa' : '#555',
                                                }}>
                                                    {active ? val : 'Sem'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                {bordas.length > 0 && (
                                    <div style={{ marginTop: 8, fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
                                        Fitar: {bordas.join(', ')}
                                    </div>
                                )}
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
                                                    {w.face} · {isHole ? `⌀${w.diameter}` : `${w.length}×${w.width}`} · {w.depth}mm
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Position info (if placed on sheet) */}
                            {peca.chapa_idx != null && peca.chapa_idx >= 0 && (
                                <div style={{
                                    background: 'rgba(34,197,94,0.08)', borderRadius: 12,
                                    border: '1px solid rgba(34,197,94,0.2)', padding: 16,
                                }}>
                                    <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
                                        Posição no Plano de Corte
                                    </h3>
                                    <div style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>
                                        Chapa #{peca.chapa_idx + 1} · X: {peca.pos_x}mm · Y: {peca.pos_y}mm
                                        {peca.rotacionada ? ' · Rotacionada 90°' : ''}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {!peca && !error && !loading && (
                    <div style={{
                        textAlign: 'center', padding: '80px 20px', color: '#555',
                    }}>
                        <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>📦</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600, color: '#888' }}>
                            Pronto para escanear
                        </h2>
                        <p style={{ fontSize: 14, color: '#666' }}>
                            Aponte o leitor de código de barras para a etiqueta da peça,<br />
                            ou digite o código manualmente no campo acima.
                        </p>
                    </div>
                )}

                {/* Scan history */}
                {scanHistory.length > 1 && (
                    <div style={{ marginTop: 32 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                            Histórico de scans
                        </h3>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {scanHistory.slice(1).map((s, i) => (
                                <button key={i} onClick={() => { setCodigo(s.codigo); buscar(s.codigo); }}
                                    style={{
                                        padding: '6px 12px', fontSize: 11, fontFamily: 'monospace',
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 6, color: '#aaa', cursor: 'pointer',
                                    }}>
                                    {s.peca?.descricao || s.codigo}
                                    <span style={{ color: '#555', marginLeft: 6 }}>
                                        {new Date(s.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Spinner animation */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function Tag({ color, label, value }) {
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 6,
            background: `${color}15`, border: `1px solid ${color}30`,
            fontSize: 11,
        }}>
            <span style={{ color: '#888' }}>{label}:</span>
            <span style={{ fontWeight: 700, color }}>{value}</span>
        </div>
    );
}
