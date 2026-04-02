/**
 * Expedicao.jsx — Página de expedição com scanner + marcação manual para tablet.
 * Interface full-screen otimizada para iPad/Android landscape.
 * Suporta: scan por código de barras + seleção manual de peças (ripados, sem etiqueta).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../api';
import PecaViewer3D from '../components/PecaViewer3D';
import {
    Package, CheckCircle, AlertCircle, Scan, ChevronDown, User,
    Truck, BarChart2, Clock, X, RefreshCw, Award, Circle,
    CheckSquare, Square, Hand, Filter, Search,
} from 'lucide-react';

// ─── Constantes ─────────────────────────────────────────────────────────────

const CHECKPOINT_DEFAULT = 'Expedição';
const LS_OPERADOR = 'expedicao_operador';
const LS_CHECKPOINT = 'expedicao_checkpoint';

// ─── Mini Cutting Plan SVG ───────────────────────────────────────────────────

function MiniChapaMap({ plano, pecaId }) {
    if (!plano || !plano.chapas || plano.chapas.length === 0) return null;

    let targetChapa = null;
    let targetPeca = null;
    for (const chapa of plano.chapas) {
        const found = (chapa.pecas || []).find(p => p.id === pecaId || p.peca_id === pecaId);
        if (found) { targetChapa = chapa; targetPeca = found; break; }
    }
    if (!targetChapa) targetChapa = plano.chapas[0];

    const W_SVG = 280;
    const H_SVG = 178;
    const PAD = 8;

    const chapaW = targetChapa.largura || targetChapa.width || 2750;
    const chapaH = targetChapa.comprimento || targetChapa.height || 1850;

    const scaleX = (W_SVG - PAD * 2) / chapaW;
    const scaleY = (H_SVG - PAD * 2) / chapaH;
    const scale = Math.min(scaleX, scaleY);

    const drawW = chapaW * scale;
    const drawH = chapaH * scale;
    const offX = PAD + (W_SVG - PAD * 2 - drawW) / 2;
    const offY = PAD + (H_SVG - PAD * 2 - drawH) / 2;

    const pecas = targetChapa.pecas || [];
    const chapaIdx = targetChapa.idx ?? targetChapa.index ?? 0;

    return (
        <div>
            <div style={{
                fontSize: 10, color: 'var(--text-muted)', marginBottom: 4,
                fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
            }}>
                Chapa #{chapaIdx + 1} — {chapaW}×{chapaH}mm
            </div>
            <svg
                width={W_SVG} height={H_SVG}
                style={{
                    borderRadius: 8,
                    background: 'var(--bg-body)',
                    border: '1px solid var(--border-hover)',
                    display: 'block',
                }}
            >
                <rect
                    x={offX} y={offY} width={drawW} height={drawH}
                    fill="var(--bg-muted)" stroke="var(--border-hover)" strokeWidth={1} rx={2}
                />
                {pecas.map((p, i) => {
                    const isTarget = p.id === pecaId || p.peca_id === pecaId;
                    const pw = Math.max(2, ((p.rotacionada
                        ? (p.largura || p.w)
                        : (p.comprimento || p.l || p.w)) || 60) * scale);
                    const ph = Math.max(2, ((p.rotacionada
                        ? (p.comprimento || p.l || p.w)
                        : (p.largura || p.w)) || 40) * scale);
                    const px = offX + (p.pos_x || p.x || 0) * scale;
                    const py = offY + (p.pos_y || p.y || 0) * scale;

                    return (
                        <g key={i}>
                            <rect
                                x={px} y={py} width={pw} height={ph}
                                fill={isTarget ? 'rgba(34,197,94,0.35)' : 'rgba(19,121,240,0.12)'}
                                stroke={isTarget ? '#22c55e' : 'rgba(19,121,240,0.3)'}
                                strokeWidth={isTarget ? 1.5 : 0.5} rx={1}
                            />
                            {isTarget && pw > 12 && ph > 8 && (
                                <text
                                    x={px + pw / 2} y={py + ph / 2 + 3}
                                    textAnchor="middle" fill="#22c55e"
                                    fontSize={Math.min(8, pw / 3)} fontWeight="bold"
                                >✓</text>
                            )}
                        </g>
                    );
                })}
                {targetPeca && (() => {
                    const pw = Math.max(2, ((targetPeca.rotacionada
                        ? (targetPeca.largura || targetPeca.w)
                        : (targetPeca.comprimento || targetPeca.l || targetPeca.w)) || 60) * scale);
                    const ph = Math.max(2, ((targetPeca.rotacionada
                        ? (targetPeca.comprimento || targetPeca.l || targetPeca.w)
                        : (targetPeca.largura || targetPeca.w)) || 40) * scale);
                    const px = offX + (targetPeca.pos_x || targetPeca.x || 0) * scale;
                    const py = offY + (targetPeca.pos_y || targetPeca.y || 0) * scale;
                    return (
                        <rect
                            x={px - 1} y={py - 1} width={pw + 2} height={ph + 2}
                            fill="none" stroke="#4ade80" strokeWidth={2}
                            strokeDasharray="3 2" rx={2}
                            style={{ filter: 'drop-shadow(0 0 4px #22c55e)' }}
                        />
                    );
                })()}
                <text x={offX + drawW - 2} y={H_SVG - 3} textAnchor="end"
                    fill="var(--text-muted)" fontSize={8}>
                    {chapaW}×{chapaH} mm
                </text>
            </svg>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BordaBadge({ label, value }) {
    const active = value && value !== '-' && value !== '';
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '6px 8px', borderRadius: 8, flex: 1,
            background: active ? 'var(--primary-alpha)' : 'var(--bg-muted)',
            border: `1px solid ${active ? 'var(--border-glow)' : 'var(--border)'}`,
        }}>
            <span style={{
                fontSize: 9, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
            }}>
                {label}
            </span>
            <span style={{
                fontSize: 11, fontWeight: 700,
                color: active ? 'var(--primary)' : 'var(--border-hover)',
                fontFamily: 'monospace',
            }}>
                {active ? value : '—'}
            </span>
        </div>
    );
}

function DimBox({ label, value, color }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '8px 10px', borderRadius: 8, flex: 1,
            background: `${color}10`, border: `1px solid ${color}30`,
        }}>
            <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color, lineHeight: 1 }}>
                {value ?? '—'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{label} mm</span>
        </div>
    );
}

function Pill({ color, label, value }) {
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: `${color}15`, border: `1px solid ${color}30`,
            fontSize: 11,
        }}>
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ fontWeight: 700, color }}>{value}</span>
        </div>
    );
}

function SpinIcon({ size = 18 }) {
    return (
        <div style={{
            width: size, height: size,
            border: `2px solid var(--primary-alpha)`,
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
            flexShrink: 0,
            display: 'inline-block',
        }} />
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Expedicao() {
    // Lotes & checkpoints
    const [lotes, setLotes] = useState([]);
    const [selectedLoteId, setSelectedLoteId] = useState('');
    const [checkpoints, setCheckpoints] = useState([]);
    const [activeCheckpoint, setActiveCheckpoint] = useState(
        () => localStorage.getItem(LS_CHECKPOINT) || CHECKPOINT_DEFAULT
    );

    // Operador
    const [operador, setOperador] = useState(() => localStorage.getItem(LS_OPERADOR) || '');
    const [editingOperador, setEditingOperador] = useState(false);

    // Scan state
    const [scanInput, setScanInput] = useState('');
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [scanMessage, setScanMessage] = useState('');
    const scanInputRef = useRef(null);
    const resultTimerRef = useRef(null);

    // Data
    const [lastScan, setLastScan] = useState(null);
    const [lotePecas, setLotePecas] = useState([]);
    const [loteInfo, setLoteInfo] = useState(null);
    const [loteProgress, setLoteProgress] = useState({});
    const [scanLog, setScanLog] = useState([]);
    const [loadingLote, setLoadingLote] = useState(false);

    // Selection state
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkMarking, setBulkMarking] = useState(false);

    // Filters
    const [filterModulo, setFilterModulo] = useState('__all__');
    const [filterStatus, setFilterStatus] = useState('all'); // all | pending | done
    const [searchText, setSearchText] = useState('');

    // Celebration
    const [celebrating, setCelebrating] = useState(false);

    // ── Load lotes on mount ──────────────────────────────────────────────────

    useEffect(() => {
        api.get('/cnc/lotes').then(data => {
            const list = Array.isArray(data) ? data : (data.lotes || []);
            setLotes(list);
            const active = list.find(l => l.status === 'produzindo' || l.status === 'otimizado') || list[0];
            if (active) setSelectedLoteId(String(active.id));
        }).catch(() => {});
    }, []);

    // ── Load checkpoints ─────────────────────────────────────────────────────

    useEffect(() => {
        api.get('/cnc/checkpoints').then(data => {
            const list = Array.isArray(data) ? data : (data.checkpoints || []);
            setCheckpoints(list);
        }).catch(() => {
            setCheckpoints([
                { id: 1, nome: 'Corte' },
                { id: 2, nome: 'Fitagem' },
                { id: 3, nome: 'Usinagem' },
                { id: 4, nome: 'Expedição' },
            ]);
        });
    }, []);

    // ── Load lote data when selected ────────────────────────────────────────

    const loadLoteData = useCallback((loteId) => {
        if (!loteId) return;
        setLoadingLote(true);
        setLotePecas([]);
        setLoteInfo(null);
        setLoteProgress({});
        setScanLog([]);
        setLastScan(null);
        setSelectedIds(new Set());
        setFilterModulo('__all__');
        setFilterStatus('all');
        setSearchText('');

        Promise.all([
            api.get(`/cnc/lotes/${loteId}`),
            api.get(`/cnc/expedicao/status/${loteId}`).catch(() => null),
        ]).then(([loteData, statusData]) => {
            setLoteInfo(loteData.lote || loteData);
            const pecas = loteData.pecas || loteData.lote?.pecas || [];
            setLotePecas(pecas);
            if (statusData) {
                setLoteProgress(statusData.progress || {});
                setScanLog(statusData.scans || []);
            }
        }).catch(() => {}).finally(() => setLoadingLote(false));
    }, []);

    useEffect(() => { loadLoteData(selectedLoteId); }, [selectedLoteId, loadLoteData]);

    // ── Persist preferences ──────────────────────────────────────────────────

    useEffect(() => { localStorage.setItem(LS_OPERADOR, operador); }, [operador]);
    useEffect(() => { localStorage.setItem(LS_CHECKPOINT, activeCheckpoint); }, [activeCheckpoint]);

    // ── Auto-focus scan input ────────────────────────────────────────────────

    useEffect(() => {
        if (!editingOperador) {
            const t = setTimeout(() => scanInputRef.current?.focus(), 120);
            return () => clearTimeout(t);
        }
    }, [editingOperador, selectedLoteId]);

    // ── Scan handler ─────────────────────────────────────────────────────────

    const handleScan = useCallback(async (rawCode) => {
        const codigo = rawCode.trim();
        if (!codigo || codigo.length < 2) return;

        if (!selectedLoteId) {
            setScanResult('error');
            setScanMessage('Selecione um lote antes de escanear.');
            clearTimeout(resultTimerRef.current);
            resultTimerRef.current = setTimeout(() => setScanResult(null), 3000);
            return;
        }

        setScanning(true);
        setScanResult(null);
        clearTimeout(resultTimerRef.current);

        const cp = checkpoints.find(c => c.nome === activeCheckpoint);
        const checkpoint_id = cp?.id ?? null;

        try {
            const data = await api.post('/cnc/expedicao/scan', {
                codigo,
                checkpoint_id,
                lote_id: parseInt(selectedLoteId),
                metodo: 'scan',
                ...(operador ? { operador } : {}),
            });

            const peca = data.peca;
            const plano = data.plano || null;

            setLastScan({ peca, plano, timestamp: Date.now() });
            setScanResult('success');
            setScanMessage(peca?.descricao || 'Peca registrada com sucesso!');

            setScanLog(prev => [{
                peca_id: peca?.id,
                codigo,
                descricao: peca?.descricao,
                timestamp: new Date().toISOString(),
                checkpoint: activeCheckpoint,
                metodo: 'scan',
            }, ...prev]);

            if (checkpoint_id !== null) {
                setLoteProgress(prev => {
                    const cur = prev[checkpoint_id] || { scanned: 0, total: lotePecas.length };
                    const newScanned = cur.scanned + 1;
                    const newProg = { ...prev, [checkpoint_id]: { ...cur, scanned: newScanned } };
                    if (cur.total > 0 && newScanned >= cur.total) {
                        setTimeout(() => { setCelebrating(true); setTimeout(() => setCelebrating(false), 5000); }, 700);
                    }
                    return newProg;
                });
            }

            resultTimerRef.current = setTimeout(() => setScanResult(null), 3000);

        } catch (err) {
            const msg = err.error || err.message || 'Erro ao registrar scan.';
            const isDuplicate = /já.*scan|duplicado|already/i.test(msg);
            setScanResult(isDuplicate ? 'duplicate' : 'error');
            setScanMessage(msg);
            if (err.peca) setLastScan({ peca: err.peca, plano: null, timestamp: Date.now() });
            resultTimerRef.current = setTimeout(() => setScanResult(null), isDuplicate ? 4500 : 3500);
        } finally {
            setScanning(false);
            setScanInput('');
            setTimeout(() => scanInputRef.current?.focus(), 100);
        }
    }, [selectedLoteId, activeCheckpoint, checkpoints, operador, lotePecas.length]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleScan(scanInput);
        }
    }, [scanInput, handleScan]);

    // ── Bulk manual mark ─────────────────────────────────────────────────────

    const handleBulkMark = useCallback(async () => {
        if (selectedIds.size === 0) return;

        const cp = checkpoints.find(c => c.nome === activeCheckpoint);
        if (!cp) return;

        setBulkMarking(true);
        try {
            const data = await api.post('/cnc/expedicao/scan-bulk', {
                peca_ids: Array.from(selectedIds),
                checkpoint_id: cp.id,
                operador: operador || null,
                observacao: 'Marcação manual — conferência visual',
                metodo: 'manual',
            });

            const count = data.registrados || 0;
            const skippedCount = (data.skipped || []).length;

            setScanResult('success');
            setScanMessage(`${count} peça(s) marcadas manualmente${skippedCount > 0 ? ` (${skippedCount} já registradas)` : ''}`);
            clearTimeout(resultTimerRef.current);
            resultTimerRef.current = setTimeout(() => setScanResult(null), 4000);

            // Add to scan log
            for (const s of (data.scans || [])) {
                const peca = lotePecas.find(p => p.id === s.peca_id);
                setScanLog(prev => [{
                    peca_id: s.peca_id,
                    codigo: peca?.upmcode || String(s.peca_id),
                    descricao: peca?.descricao || '',
                    timestamp: new Date().toISOString(),
                    checkpoint: activeCheckpoint,
                    metodo: 'manual',
                }, ...prev]);
            }

            // Update progress
            if (count > 0) {
                setLoteProgress(prev => {
                    const cur = prev[cp.id] || { scanned: 0, total: lotePecas.length };
                    const newScanned = cur.scanned + count;
                    const newProg = { ...prev, [cp.id]: { ...cur, scanned: newScanned } };
                    if (cur.total > 0 && newScanned >= cur.total) {
                        setTimeout(() => { setCelebrating(true); setTimeout(() => setCelebrating(false), 5000); }, 700);
                    }
                    return newProg;
                });
            }

            setSelectedIds(new Set());
        } catch (err) {
            setScanResult('error');
            setScanMessage(err.error || err.message || 'Erro ao marcar peças');
            clearTimeout(resultTimerRef.current);
            resultTimerRef.current = setTimeout(() => setScanResult(null), 3500);
        } finally {
            setBulkMarking(false);
        }
    }, [selectedIds, checkpoints, activeCheckpoint, operador, lotePecas]);

    // ── Selection helpers ────────────────────────────────────────────────────

    const toggleSelect = useCallback((id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const selectModulePecas = useCallback((modPecas, selectAll) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            for (const p of modPecas) {
                if (selectAll) next.add(p.id);
                else next.delete(p.id);
            }
            return next;
        });
    }, []);

    const selectAllFiltered = useCallback((filteredPecas, selectAll) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            for (const p of filteredPecas) {
                if (selectAll) next.add(p.id);
                else next.delete(p.id);
            }
            return next;
        });
    }, []);

    // ── Reload lote ──────────────────────────────────────────────────────────

    const reloadLote = useCallback(() => {
        loadLoteData(selectedLoteId);
    }, [selectedLoteId, loadLoteData]);

    // ── Derived data ─────────────────────────────────────────────────────────

    const scannedIds = useMemo(() => new Set(scanLog.map(s => s.peca_id)), [scanLog]);

    const scanMethodMap = useMemo(() => {
        const map = {};
        for (const s of scanLog) {
            if (!map[s.peca_id]) map[s.peca_id] = s;
        }
        return map;
    }, [scanLog]);

    const modulos = useMemo(() => {
        const set = new Set();
        for (const p of lotePecas) {
            set.add(p.modulo_desc || p.ambiente || 'Geral');
        }
        return Array.from(set).sort();
    }, [lotePecas]);

    const filteredPecas = useMemo(() => {
        return lotePecas.filter(p => {
            const mod = p.modulo_desc || p.ambiente || 'Geral';
            if (filterModulo !== '__all__' && mod !== filterModulo) return false;
            if (filterStatus === 'pending' && scannedIds.has(p.id)) return false;
            if (filterStatus === 'done' && !scannedIds.has(p.id)) return false;
            if (searchText) {
                const q = searchText.toLowerCase();
                const haystack = [p.descricao, p.upmcode, p.material_code, mod,
                    `${p.comprimento}x${p.largura}`].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [lotePecas, filterModulo, filterStatus, scannedIds, searchText]);

    const pecasPorModulo = useMemo(() => {
        const map = {};
        for (const p of filteredPecas) {
            const mod = p.modulo_desc || p.ambiente || 'Geral';
            if (!map[mod]) map[mod] = [];
            map[mod].push(p);
        }
        return map;
    }, [filteredPecas]);

    const pendingSelectedCount = useMemo(() => {
        let count = 0;
        for (const id of selectedIds) {
            if (!scannedIds.has(id)) count++;
        }
        return count;
    }, [selectedIds, scannedIds]);

    const cp = checkpoints.find(c => c.nome === activeCheckpoint);
    const cpProgress = cp
        ? (loteProgress[cp.id] || { scanned: 0, total: lotePecas.length })
        : { scanned: 0, total: lotePecas.length };
    const progressPct = cpProgress.total > 0
        ? Math.min(100, Math.round((cpProgress.scanned / cpProgress.total) * 100))
        : 0;

    const peca = lastScan?.peca;
    const plano = lastScan?.plano;

    const scanBorderColor = scanResult === 'success' ? '#22c55e'
        : (scanResult === 'error' || scanResult === 'duplicate') ? '#ef4444'
        : 'var(--border)';
    const scanBg = scanResult === 'success' ? 'rgba(34,197,94,0.08)'
        : (scanResult === 'error' || scanResult === 'duplicate') ? 'rgba(239,68,68,0.08)'
        : 'var(--bg-muted)';

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div style={{
            height: '100vh',
            background: 'var(--bg-body)',
            color: 'var(--text-primary)',
            fontFamily: "'Inter', -apple-system, sans-serif",
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            userSelect: 'none',
        }}>

            {/* ═══ HEADER ═══ */}
            <header style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px',
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0, zIndex: 10,
                boxShadow: 'var(--shadow-sm)',
            }}>

                {/* Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 6, flexShrink: 0 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Truck size={18} color="#fff" />
                    </div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>Expedição</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Scanner + Marcação Manual</div>
                    </div>
                </div>

                {/* Lote selector */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <select
                        value={selectedLoteId}
                        onChange={e => setSelectedLoteId(e.target.value)}
                        style={{
                            padding: '7px 32px 7px 12px', fontSize: 13, fontWeight: 600,
                            background: 'var(--bg-muted)', border: '1px solid var(--border-hover)',
                            borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer',
                            appearance: 'none', minWidth: 180, outline: 'none',
                        }}
                    >
                        <option value="">— Selecionar lote —</option>
                        {lotes.map(l => (
                            <option key={l.id} value={l.id}>
                                {l.nome || `Lote #${l.id}`}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={14} color="var(--text-muted)" style={{
                        position: 'absolute', right: 10, top: '50%',
                        transform: 'translateY(-50%)', pointerEvents: 'none',
                    }} />
                </div>

                {/* Checkpoint selector */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <select
                        value={activeCheckpoint}
                        onChange={e => setActiveCheckpoint(e.target.value)}
                        style={{
                            padding: '7px 32px 7px 12px', fontSize: 13, fontWeight: 600,
                            background: 'var(--primary-alpha)', border: '1px solid var(--border-glow)',
                            borderRadius: 8, color: 'var(--primary)', cursor: 'pointer',
                            appearance: 'none', minWidth: 130, outline: 'none',
                        }}
                    >
                        {checkpoints.length > 0 ? checkpoints.map(c => (
                            <option key={c.id} value={c.nome}>{c.nome}</option>
                        )) : (
                            <option value={activeCheckpoint}>{activeCheckpoint}</option>
                        )}
                    </select>
                    <ChevronDown size={14} color="var(--primary)" style={{
                        position: 'absolute', right: 10, top: '50%',
                        transform: 'translateY(-50%)', pointerEvents: 'none',
                    }} />
                </div>

                {/* Progress pill */}
                {selectedLoteId && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 14px', borderRadius: 20,
                        background: 'var(--bg-muted)', border: '1px solid var(--border)',
                        flexShrink: 0,
                    }}>
                        <BarChart2 size={13} color={progressPct === 100 ? '#22c55e' : 'var(--primary)'} />
                        <div style={{ width: 72, height: 5, borderRadius: 3, background: 'var(--border-hover)' }}>
                            <div style={{
                                height: '100%', borderRadius: 3,
                                width: `${progressPct}%`,
                                transition: 'width .5s ease',
                                background: progressPct === 100
                                    ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                                    : 'linear-gradient(90deg, var(--primary), #60a5fa)',
                            }} />
                        </div>
                        <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: progressPct === 100 ? '#22c55e' : 'var(--primary)',
                            fontFamily: 'monospace', minWidth: 50,
                        }}>
                            {cpProgress.scanned}/{cpProgress.total}
                        </span>
                    </div>
                )}

                <div style={{ flex: 1 }} />

                {/* Operador */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <User size={13} color="var(--text-muted)" />
                    {editingOperador ? (
                        <input
                            value={operador}
                            onChange={e => setOperador(e.target.value)}
                            onBlur={() => setEditingOperador(false)}
                            onKeyDown={e => e.key === 'Enter' && setEditingOperador(false)}
                            placeholder="Nome..."
                            autoFocus
                            style={{
                                padding: '5px 10px', fontSize: 12, background: 'var(--bg-muted)',
                                border: '1px solid var(--primary)', borderRadius: 6,
                                color: 'var(--text-primary)', outline: 'none', width: 140,
                            }}
                        />
                    ) : (
                        <button
                            onClick={() => setEditingOperador(true)}
                            style={{
                                padding: '5px 10px', fontSize: 12, fontWeight: 600,
                                background: 'transparent', border: '1px solid var(--border)',
                                borderRadius: 6,
                                color: operador ? 'var(--text-primary)' : 'var(--text-muted)',
                                cursor: 'pointer',
                            }}
                        >
                            {operador || 'Operador'}
                        </button>
                    )}
                </div>

                {/* Reload button */}
                {selectedLoteId && (
                    <button
                        onClick={reloadLote}
                        title="Recarregar dados do lote"
                        style={{
                            width: 32, height: 32, borderRadius: 8, background: 'transparent',
                            border: '1px solid var(--border)', color: 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <RefreshCw size={14} />
                    </button>
                )}
            </header>

            {/* ═══ MAIN CONTENT ═══ */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* ── LEFT — SCAN AREA (60%) ── */}
                <div style={{
                    flex: '0 0 60%', display: 'flex', flexDirection: 'column',
                    padding: '16px 16px 16px 20px', gap: 14, overflow: 'hidden',
                    borderRight: '1px solid var(--border)',
                }}>

                    {/* Scan input */}
                    <div style={{ flexShrink: 0 }}>
                        <div style={{
                            position: 'relative', borderRadius: 14,
                            background: scanBg,
                            border: `2px solid ${scanBorderColor}`,
                            transition: 'all .25s ease',
                            boxShadow: scanResult === 'success'
                                ? '0 0 36px rgba(34,197,94,0.18)'
                                : (scanResult === 'error' || scanResult === 'duplicate')
                                    ? '0 0 28px rgba(239,68,68,0.15)'
                                    : 'none',
                            animation: (scanResult === 'error' || scanResult === 'duplicate') ? 'shake .35s ease' : 'none',
                        }}>
                            <div style={{
                                position: 'absolute', left: 18, top: '50%',
                                transform: 'translateY(-50%)',
                                color: scanning ? 'var(--primary)'
                                    : scanResult === 'success' ? '#22c55e'
                                    : (scanResult === 'error' || scanResult === 'duplicate') ? '#ef4444'
                                    : 'var(--text-muted)',
                                transition: 'color .2s',
                                display: 'flex', alignItems: 'center',
                            }}>
                                {scanning
                                    ? <SpinIcon size={24} />
                                    : scanResult === 'success'
                                        ? <CheckCircle size={26} />
                                        : (scanResult === 'error' || scanResult === 'duplicate')
                                            ? <AlertCircle size={26} />
                                            : <Scan size={26} />
                                }
                            </div>

                            <input
                                ref={scanInputRef}
                                value={scanInput}
                                onChange={e => setScanInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Escanear peca..."
                                disabled={scanning}
                                style={{
                                    width: '100%', padding: '18px 56px 18px 60px',
                                    fontSize: 22, fontFamily: 'monospace', fontWeight: 700,
                                    letterSpacing: 2, background: 'transparent',
                                    border: 'none', color: 'var(--text-primary)', outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />

                            {scanInput && !scanning && (
                                <button
                                    onClick={() => { setScanInput(''); scanInputRef.current?.focus(); }}
                                    style={{
                                        position: 'absolute', right: 14, top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'transparent', border: 'none',
                                        color: 'var(--text-muted)', cursor: 'pointer', padding: 6, borderRadius: 6,
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        {/* Feedback message */}
                        {scanResult && (
                            <div style={{
                                marginTop: 8, padding: '8px 14px', borderRadius: 8,
                                fontSize: 13, fontWeight: 600,
                                background: scanResult === 'success'
                                    ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                color: scanResult === 'success' ? '#4ade80' : '#f87171',
                                border: `1px solid ${scanResult === 'success'
                                    ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                                display: 'flex', alignItems: 'center', gap: 8,
                                animation: 'fadeSlideIn .2s ease',
                            }}>
                                {scanResult === 'success'
                                    ? <CheckCircle size={15} />
                                    : <AlertCircle size={15} />
                                }
                                <span style={{ flex: 1 }}>{scanMessage}</span>
                                {scanResult === 'duplicate' && (
                                    <span style={{ fontSize: 11, opacity: 0.65 }}>já escaneado</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Last scanned piece */}
                    {peca ? (
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 14 }}>

                            {/* Column A: 3D viewer + chapa map */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                                <div style={{
                                    borderRadius: 12, overflow: 'hidden',
                                    border: '1px solid var(--border-hover)',
                                    background: 'var(--bg-card)', position: 'relative',
                                }}>
                                    <PecaViewer3D peca={peca} width={220} height={160} />
                                    {scanResult === 'success' && (
                                        <div style={{
                                            position: 'absolute', inset: 0,
                                            background: 'rgba(34,197,94,0.2)',
                                            pointerEvents: 'none',
                                            animation: 'flashGreen .7s ease forwards',
                                            borderRadius: 12,
                                        }} />
                                    )}
                                </div>

                                {plano && <MiniChapaMap plano={plano} pecaId={peca.id} />}
                                {!plano && peca.chapa_idx != null && peca.chapa_idx >= 0 && (
                                    <div style={{
                                        padding: '7px 12px', borderRadius: 8,
                                        background: 'rgba(34,197,94,0.07)',
                                        border: '1px solid rgba(34,197,94,0.2)',
                                        fontSize: 11, color: '#6ee7b7', fontFamily: 'monospace',
                                    }}>
                                        Chapa #{peca.chapa_idx + 1} · X:{peca.pos_x} Y:{peca.pos_y}
                                        {peca.rotacionada ? ' · ↺90°' : ''}
                                    </div>
                                )}
                            </div>

                            {/* Column B: piece details */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', minWidth: 0 }}>

                                <div>
                                    <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15, marginBottom: 3 }}>
                                        {peca.descricao || peca.upmcode || 'Peca'}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        {[peca.modulo_desc, peca.produto_final, peca.ambiente]
                                            .filter(Boolean).join(' · ')}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 7 }}>
                                    <DimBox label="Comp" value={peca.comprimento} color="#60a5fa" />
                                    <DimBox label="Larg" value={peca.largura} color="#34d399" />
                                    <DimBox label="Esp" value={peca.espessura} color="#fbbf24" />
                                </div>

                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {peca.material_code && (
                                        <Pill color="var(--primary)" label="Material" value={peca.material_code} />
                                    )}
                                    {(peca.quantidade || 1) > 1 && (
                                        <Pill color="#f59e0b" label="Qtd" value={`×${peca.quantidade}`} />
                                    )}
                                    {peca.grain && peca.grain !== 'sem_veio' && (
                                        <Pill color="#f97316" label="Veio" value={peca.grain} />
                                    )}
                                </div>

                                <div>
                                    <div style={{
                                        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                                        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
                                    }}>
                                        Bordas / Fitagem
                                    </div>
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        <BordaBadge label="Frontal" value={peca.borda_frontal} />
                                        <BordaBadge label="Traseira" value={peca.borda_traseira} />
                                        <BordaBadge label="Dir" value={peca.borda_dir} />
                                        <BordaBadge label="Esq" value={peca.borda_esq} />
                                    </div>

                                    {[peca.borda_cor_frontal, peca.borda_cor_traseira, peca.borda_cor_dir, peca.borda_cor_esq].some(Boolean) && (
                                        <div style={{ marginTop: 7, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {[
                                                ['F', peca.borda_cor_frontal],
                                                ['T', peca.borda_cor_traseira],
                                                ['D', peca.borda_cor_dir],
                                                ['E', peca.borda_cor_esq],
                                            ].filter(([, v]) => v && v !== '-').map(([side, cor]) => (
                                                <div key={side} style={{
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    padding: '3px 8px', borderRadius: 6,
                                                    background: 'rgba(139,92,246,0.1)',
                                                    border: '1px solid rgba(139,92,246,0.25)',
                                                    fontSize: 11,
                                                }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>{side}:</span>
                                                    <span style={{ color: '#c4b5fd', fontWeight: 600 }}>{cor}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {lastScan?.timestamp && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        fontSize: 11, color: 'var(--text-muted)', marginTop: 'auto',
                                    }}>
                                        <Clock size={12} />
                                        {new Date(lastScan.timestamp).toLocaleTimeString('pt-BR', {
                                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                                        })}
                                        {operador && (
                                            <> · <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{operador}</span></>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 14,
                        }}>
                            <div style={{
                                width: 88, height: 88, borderRadius: 22,
                                background: 'var(--primary-alpha)',
                                border: '2px dashed var(--border-glow)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Scan size={38} color="var(--primary)" style={{ opacity: 0.4 }} />
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                    Pronto para escanear
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 300 }}>
                                    {selectedLoteId
                                        ? 'Aponte o leitor para a etiqueta, digite o código acima, ou selecione peças na lista para marcar manualmente.'
                                        : 'Selecione um lote no cabeçalho para começar.'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── RIGHT — PROGRESS + PIECE LIST (40%) ── */}
                <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {!selectedLoteId ? (
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexDirection: 'column', gap: 10, color: 'var(--text-muted)',
                        }}>
                            <Package size={42} color="var(--text-muted)" style={{ opacity: 0.2 }} />
                            <span style={{ fontSize: 14 }}>Nenhum lote selecionado</span>
                        </div>
                    ) : loadingLote ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                            <SpinIcon size={32} />
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando lote...</span>
                        </div>
                    ) : (
                        <>
                            {/* Lote summary + checkpoints */}
                            <div style={{
                                padding: '14px 18px',
                                background: 'var(--bg-card)',
                                borderBottom: '1px solid var(--border)',
                                flexShrink: 0,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 16, fontWeight: 800, color: 'var(--text-primary)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {loteInfo?.nome || `Lote #${selectedLoteId}`}
                                        </div>
                                        {loteInfo?.cliente && (
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                                                {loteInfo.cliente}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                        <div style={{
                                            fontSize: 26, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1,
                                            color: progressPct === 100 ? '#22c55e' : 'var(--primary)',
                                        }}>
                                            {progressPct}%
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                            {cpProgress.scanned}/{cpProgress.total} pecas
                                        </div>
                                    </div>
                                </div>

                                {/* Checkpoint progress bars */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                    {checkpoints.map(c => {
                                        const prog = loteProgress[c.id] || { scanned: 0, total: lotePecas.length };
                                        const pct = prog.total > 0
                                            ? Math.min(100, Math.round((prog.scanned / prog.total) * 100))
                                            : 0;
                                        const isActive = c.nome === activeCheckpoint;
                                        const isDone = pct === 100;
                                        return (
                                            <div key={c.id} style={{ opacity: isActive ? 1 : 0.5 }}>
                                                <div style={{
                                                    display: 'flex', justifyContent: 'space-between',
                                                    marginBottom: 3,
                                                }}>
                                                    <span style={{
                                                        fontSize: 11,
                                                        fontWeight: isActive ? 700 : 400,
                                                        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                    }}>
                                                        {isActive && (
                                                            <span style={{ color: 'var(--primary)', fontSize: 9 }}>▶</span>
                                                        )}
                                                        {isDone && !isActive && (
                                                            <CheckCircle size={10} color="#22c55e" />
                                                        )}
                                                        {c.nome}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 11, fontFamily: 'monospace',
                                                        color: isDone ? '#22c55e' : isActive ? 'var(--primary)' : 'var(--text-muted)',
                                                        fontWeight: isActive ? 700 : 400,
                                                    }}>
                                                        {prog.scanned}/{prog.total}
                                                    </span>
                                                </div>
                                                <div style={{ height: isActive ? 5 : 3, borderRadius: 3, background: 'var(--border-hover)' }}>
                                                    <div style={{
                                                        height: '100%', borderRadius: 3,
                                                        width: `${pct}%`, transition: 'width .5s ease',
                                                        background: isDone ? '#22c55e'
                                                            : isActive ? 'var(--primary)'
                                                            : 'var(--border-hover)',
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Filter bar + bulk actions ── */}
                            <div style={{
                                padding: '10px 14px',
                                background: 'var(--bg-card)',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex', flexDirection: 'column', gap: 8,
                                flexShrink: 0,
                            }}>
                                {/* Filters row */}
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {/* Search */}
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Search size={12} color="var(--text-muted)" style={{
                                            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                                        }} />
                                        <input
                                            value={searchText}
                                            onChange={e => setSearchText(e.target.value)}
                                            placeholder="Buscar peca..."
                                            style={{
                                                width: '100%', padding: '5px 8px 5px 26px', fontSize: 11,
                                                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                                borderRadius: 6, color: 'var(--text-primary)', outline: 'none',
                                                boxSizing: 'border-box',
                                            }}
                                        />
                                    </div>

                                    {/* Module filter */}
                                    <select
                                        value={filterModulo}
                                        onChange={e => setFilterModulo(e.target.value)}
                                        style={{
                                            padding: '5px 8px', fontSize: 11, fontWeight: 600,
                                            background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                            borderRadius: 6, color: 'var(--text-primary)',
                                            cursor: 'pointer', appearance: 'none', maxWidth: 130,
                                        }}
                                    >
                                        <option value="__all__">Todos modulos</option>
                                        {modulos.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>

                                    {/* Status filter */}
                                    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                        {[
                                            { v: 'all', l: 'Todos' },
                                            { v: 'pending', l: 'Pendentes' },
                                            { v: 'done', l: 'Feitos' },
                                        ].map(f => (
                                            <button
                                                key={f.v}
                                                onClick={() => setFilterStatus(f.v)}
                                                style={{
                                                    padding: '4px 9px', fontSize: 10, fontWeight: 600,
                                                    border: 'none', cursor: 'pointer',
                                                    background: filterStatus === f.v ? 'var(--primary)' : 'var(--bg-muted)',
                                                    color: filterStatus === f.v ? '#fff' : 'var(--text-muted)',
                                                }}
                                            >
                                                {f.l}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Bulk actions row */}
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {/* Select all filtered */}
                                    <button
                                        onClick={() => {
                                            const allFilteredIds = new Set(filteredPecas.filter(p => !scannedIds.has(p.id)).map(p => p.id));
                                            const allSelected = [...allFilteredIds].every(id => selectedIds.has(id));
                                            selectAllFiltered(filteredPecas.filter(p => !scannedIds.has(p.id)), !allSelected);
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            padding: '4px 10px', fontSize: 10, fontWeight: 600,
                                            background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                            borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer',
                                        }}
                                    >
                                        <CheckSquare size={12} />
                                        Selecionar pendentes
                                    </button>

                                    {/* Clear selection */}
                                    {selectedIds.size > 0 && (
                                        <button
                                            onClick={() => setSelectedIds(new Set())}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                padding: '4px 10px', fontSize: 10, fontWeight: 600,
                                                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                                borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer',
                                            }}
                                        >
                                            <X size={12} />
                                            Limpar ({selectedIds.size})
                                        </button>
                                    )}

                                    <div style={{ flex: 1 }} />

                                    {/* Bulk mark button */}
                                    {pendingSelectedCount > 0 && (
                                        <button
                                            onClick={handleBulkMark}
                                            disabled={bulkMarking}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 5,
                                                padding: '6px 14px', fontSize: 11, fontWeight: 700,
                                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                                border: 'none', borderRadius: 8,
                                                color: '#fff', cursor: bulkMarking ? 'wait' : 'pointer',
                                                boxShadow: '0 2px 8px rgba(245,158,11,0.3)',
                                                opacity: bulkMarking ? 0.7 : 1,
                                            }}
                                        >
                                            {bulkMarking ? <SpinIcon size={13} /> : <Hand size={13} />}
                                            Marcar {pendingSelectedCount} peca(s)
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Piece list grouped by module */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 16px' }}>
                                {Object.entries(pecasPorModulo).map(([modulo, pecas]) => {
                                    const modScanned = pecas.filter(p => scannedIds.has(p.id)).length;
                                    const allDone = modScanned === pecas.length && pecas.length > 0;
                                    const pendingInMod = pecas.filter(p => !scannedIds.has(p.id));
                                    const allModPendingSelected = pendingInMod.length > 0 &&
                                        pendingInMod.every(p => selectedIds.has(p.id));

                                    return (
                                        <div key={modulo} style={{ marginBottom: 14 }}>
                                            {/* Module header */}
                                            <div
                                                style={{
                                                    display: 'flex', alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '6px 10px', borderRadius: 8, marginBottom: 4,
                                                    background: allDone
                                                        ? 'rgba(34,197,94,0.07)'
                                                        : 'var(--bg-muted)',
                                                    border: `1px solid ${allDone ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
                                                    cursor: pendingInMod.length > 0 ? 'pointer' : 'default',
                                                }}
                                                onClick={() => {
                                                    if (pendingInMod.length > 0) {
                                                        selectModulePecas(pendingInMod, !allModPendingSelected);
                                                    }
                                                }}
                                                title={pendingInMod.length > 0 ? 'Clique para selecionar/deselecionar modulo' : ''}
                                            >
                                                <span style={{
                                                    fontSize: 12, fontWeight: 700,
                                                    color: allDone ? '#86efac' : '#c4b5fd',
                                                    display: 'flex', alignItems: 'center', gap: 5,
                                                }}>
                                                    {!allDone && pendingInMod.length > 0 && (
                                                        allModPendingSelected
                                                            ? <CheckSquare size={13} color="#f59e0b" />
                                                            : <Square size={13} color="var(--text-muted)" />
                                                    )}
                                                    {modulo}
                                                </span>
                                                <span style={{
                                                    fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
                                                    color: allDone ? '#22c55e' : 'var(--text-muted)',
                                                }}>
                                                    {modScanned}/{pecas.length}
                                                    {allDone && ' ✓'}
                                                </span>
                                            </div>

                                            {/* Piece rows */}
                                            {pecas.map(p => {
                                                const isScanned = scannedIds.has(p.id);
                                                const isLastScanned = lastScan?.peca?.id === p.id;
                                                const isSelected = selectedIds.has(p.id);
                                                const logEntry = scanMethodMap[p.id];
                                                const isManual = logEntry?.metodo === 'manual';

                                                return (
                                                    <div
                                                        key={p.id}
                                                        onClick={() => { if (!isScanned) toggleSelect(p.id); }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 9,
                                                            padding: '7px 10px', borderRadius: 7, marginBottom: 2,
                                                            cursor: isScanned ? 'default' : 'pointer',
                                                            background: isLastScanned
                                                                ? 'rgba(34,197,94,0.09)'
                                                                : isSelected
                                                                    ? 'rgba(245,158,11,0.08)'
                                                                    : isScanned
                                                                        ? 'rgba(34,197,94,0.04)'
                                                                        : 'var(--bg-muted)',
                                                            border: `1px solid ${
                                                                isLastScanned ? 'rgba(34,197,94,0.3)'
                                                                : isSelected ? 'rgba(245,158,11,0.35)'
                                                                : isScanned ? 'rgba(34,197,94,0.12)'
                                                                : 'var(--border)'
                                                            }`,
                                                            transition: 'all .2s ease',
                                                        }}
                                                    >
                                                        {/* Checkbox / Status icon */}
                                                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                                            {isScanned ? (
                                                                isManual ? (
                                                                    <Hand size={15} color="#f59e0b" />
                                                                ) : (
                                                                    <CheckCircle size={15} color="#22c55e" />
                                                                )
                                                            ) : isSelected ? (
                                                                <CheckSquare size={15} color="#f59e0b" />
                                                            ) : (
                                                                <Square size={15} color="var(--border-hover)" />
                                                            )}
                                                        </div>

                                                        {/* Info */}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{
                                                                fontSize: 12,
                                                                fontWeight: isScanned ? 600 : 400,
                                                                color: isScanned ? '#d1fae5' : 'var(--text-primary)',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {p.descricao || p.upmcode || `Peca ${p.id}`}
                                                            </div>
                                                            <div style={{
                                                                fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace',
                                                            }}>
                                                                {p.comprimento}×{p.largura}×{p.espessura}
                                                                {p.material_code ? ` · ${p.material_code}` : ''}
                                                            </div>
                                                        </div>

                                                        {/* Method badge + Timestamp */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                            {isScanned && isManual && (
                                                                <span style={{
                                                                    fontSize: 9, fontWeight: 700, padding: '2px 6px',
                                                                    borderRadius: 4,
                                                                    background: 'rgba(245,158,11,0.15)',
                                                                    color: '#fbbf24',
                                                                    textTransform: 'uppercase', letterSpacing: 0.3,
                                                                }}>
                                                                    manual
                                                                </span>
                                                            )}
                                                            {logEntry?.timestamp && (
                                                                <div style={{
                                                                    fontSize: 10, color: '#6ee7b7',
                                                                    fontFamily: 'monospace',
                                                                }}>
                                                                    {new Date(logEntry.timestamp).toLocaleTimeString('pt-BR', {
                                                                        hour: '2-digit', minute: '2-digit',
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}

                                {filteredPecas.length === 0 && lotePecas.length > 0 && (
                                    <div style={{
                                        textAlign: 'center', padding: '30px 20px',
                                        color: 'var(--text-muted)', fontSize: 13,
                                    }}>
                                        Nenhuma peca encontrada com esses filtros.
                                    </div>
                                )}

                                {lotePecas.length === 0 && (
                                    <div style={{
                                        textAlign: 'center', padding: '40px 20px',
                                        color: 'var(--text-muted)', fontSize: 13,
                                    }}>
                                        Nenhuma peca encontrada neste lote.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ═══ CELEBRATION OVERLAY ═══ */}
            {celebrating && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(4px)',
                    animation: 'fadeIn .3s ease',
                }}>
                    <div style={{
                        textAlign: 'center', padding: '52px 72px', borderRadius: 24,
                        background: 'var(--bg-card)',
                        border: '2px solid rgba(34,197,94,0.5)',
                        boxShadow: '0 0 100px rgba(34,197,94,0.15), var(--shadow-xl)',
                        animation: 'scaleIn .4s cubic-bezier(.34,1.56,.64,1)',
                    }}>
                        <Award
                            size={60} color="#22c55e"
                            style={{ marginBottom: 18, filter: 'drop-shadow(0 0 24px #22c55e)' }}
                        />
                        <div style={{ fontSize: 34, fontWeight: 900, color: '#4ade80', marginBottom: 8 }}>
                            Lote Completo!
                        </div>
                        <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 28 }}>
                            Todas as {lotePecas.length} pecas de "{loteInfo?.nome || 'lote'}" foram expedidas.
                        </div>
                        <button
                            onClick={() => setCelebrating(false)}
                            style={{
                                padding: '13px 36px', borderRadius: 10,
                                fontSize: 14, fontWeight: 700,
                                background: '#22c55e', border: 'none',
                                color: '#052e16', cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
                            }}
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Global Styles ── */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes flashGreen {
                    0%   { opacity: 1; }
                    70%  { opacity: 0.5; }
                    100% { opacity: 0; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.82); }
                    to   { opacity: 1; transform: scale(1); }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20%      { transform: translateX(-7px); }
                    40%      { transform: translateX(7px); }
                    60%      { transform: translateX(-4px); }
                    80%      { transform: translateX(4px); }
                }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: var(--border-hover); border-radius: 2px; }
                ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
                select option { background: var(--bg-muted); color: var(--text-primary); }
            `}</style>
        </div>
    );
}
