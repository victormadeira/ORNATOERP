// NÃO USADO — mantido pra histórico. Nunca foi renderizado no JSX.
// Extraído automaticamente de ProducaoCNC.jsx (linhas 10679-10899).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../../../components/EditorEtiquetas';
import PecaViewer3D from '../../../components/PecaViewer3D';
import PecaEditor from '../../../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../components/ToolpathSimulator';
import GcodeSimWrapper from '../../../components/GcodeSimWrapper';
import SlidePanel from '../../../components/SlidePanel';
import ToolbarDropdown from '../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../shared/constants.js';

const USIN_LABELS = {
    'Transfer_vertical_saw_cut': { label: 'Rasgo/Canal', icon: '━', color: '#eab308' },
    'transfer_pocket': { label: 'Rebaixo', icon: '▬', color: '#a855f7' },
    'transfer_slot': { label: 'Fresa/Slot', icon: '◆', color: '#06b6d4' },
    'transfer_hole_blind': { label: 'Furo cego', icon: '◐', color: '#f97316' },
    'transfer_hole': { label: 'Furo passante', icon: '●', color: '#dc2626' },
};

function usinInfo(cat) {
    return USIN_LABELS[cat] || { label: cat || '?', icon: '?', color: '#888' };
}

export function TabUsinagens({ lotes, loteAtual, setLoteAtual, notify }) {
    const [pecas, setPecas] = useState([]);
    const [overrides, setOverrides] = useState([]);
    const [faceCNC, setFaceCNC] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!loteAtual?.id) return;
        setLoading(true);
        try {
            const [p, o, f] = await Promise.all([
                api.get(`/cnc/pecas/${loteAtual.id}`),
                api.get(`/cnc/lotes/${loteAtual.id}/overrides`),
                api.get(`/cnc/lotes/${loteAtual.id}/face-cnc`),
            ]);
            setPecas(p);
            setOverrides(o);
            setFaceCNC(f);
        } catch { notify?.('Erro ao carregar usinagens', 'error'); }
        setLoading(false);
    }, [loteAtual?.id, notify]);

    useEffect(() => { load(); }, [load]);

    const parseMach = (mj) => {
        if (!mj) return [];
        try { const d = typeof mj === 'string' ? JSON.parse(mj) : mj; return Array.isArray(d) ? d : d.workers || []; } catch { return []; }
    };

    const isDisabled = (pid, idx) => {
        return overrides.some(o => o.peca_persistent_id === pid && o.worker_index === idx && !o.ativo);
    };

    const toggleWorker = async (pid, idx, currentlyActive) => {
        setSaving(true);
        try {
            await api.post(`/cnc/lotes/${loteAtual.id}/overrides`, {
                peca_persistent_id: pid,
                worker_index: idx,
                ativo: currentlyActive ? 0 : 1,
                motivo: currentlyActive ? 'Desativado manualmente' : '',
            });
            await load();
        } catch { notify?.('Erro', 'error'); }
        setSaving(false);
    };

    const disableAll = async (pid) => {
        const workers = parseMach(pecas.find(p => p.persistent_id === pid)?.machining_json);
        const bulk = workers.map((_, i) => ({ peca_persistent_id: pid, worker_index: i, ativo: 0, motivo: 'Desativado em lote' }));
        await api.post(`/cnc/lotes/${loteAtual.id}/overrides/bulk`, { overrides: bulk });
        load();
        notify?.('Todas usinagens desativadas');
    };

    const enableAll = async (pid) => {
        const workers = parseMach(pecas.find(p => p.persistent_id === pid)?.machining_json);
        const bulk = workers.map((_, i) => ({ peca_persistent_id: pid, worker_index: i, ativo: 1 }));
        await api.post(`/cnc/lotes/${loteAtual.id}/overrides/bulk`, { overrides: bulk });
        load();
        notify?.('Todas usinagens ativadas');
    };

    // Contar totais
    let totalOps = 0, totalAtivas = 0;
    pecas.forEach(p => {
        const ws = parseMach(p.machining_json);
        totalOps += ws.length;
        ws.forEach((_, i) => { if (!isDisabled(p.persistent_id, i)) totalAtivas++; });
    });

    return (
        <div>
            <LoteSelector lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} />

            {!loteAtual ? (
                <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Selecione um lote para gerenciar usinagens
                </div>
            ) : loading ? <Spinner /> : (
                <div>
                    {/* Resumo Face CNC */}
                    {faceCNC && (
                        <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>◈ Algoritmo de Face CNC</h4>
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4,
                                    background: faceCNC.melamina === 'ambos' ? '#dcfce7' : '#fef3c7',
                                    color: faceCNC.melamina === 'ambos' ? '#166534' : '#92400e',
                                }}>Melamina: {faceCNC.melamina}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(faceCNC.faces || []).map(f => (
                                    <div key={f.peca_id} style={{
                                        padding: '6px 10px', borderRadius: 6, fontSize: 11,
                                        border: '1px solid var(--border)', background: 'var(--bg-muted)',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                        <span style={{
                                            padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: 10,
                                            background: f.face_cnc === 'A' ? '#dbeafe' : '#fce7f3',
                                            color: f.face_cnc === 'A' ? '#1e40af' : '#9d174d',
                                        }}>Face {f.face_cnc}</span>
                                        <span style={{ fontWeight: 600 }}>{f.descricao || `Peça ${f.peca_id}`}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                                            A:{f.score_a.toFixed(0)} vs B:{f.score_b.toFixed(0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Resumo */}
                    <div className="glass-card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div>
                            <span style={{ fontSize: 24, fontWeight: 700 }}>{totalAtivas}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> / {totalOps} usinagens ativas</span>
                        </div>
                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)' }}>
                            <div style={{ width: totalOps > 0 ? `${(totalAtivas / totalOps * 100)}%` : '0%', height: '100%', borderRadius: 4, background: 'var(--primary)', transition: 'width .3s' }} />
                        </div>
                        <span style={{ fontSize: 11, color: totalAtivas < totalOps ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                            {totalAtivas < totalOps ? `${totalOps - totalAtivas} desativada(s)` : 'Todas ativas'}
                        </span>
                    </div>

                    {/* Lista por peça */}
                    {pecas.map(p => {
                        const workers = parseMach(p.machining_json);
                        if (!workers.length) return null;
                        const pid = p.persistent_id || `peca_${p.id}`;
                        const fInfo = faceCNC?.faces?.find(f => f.peca_id === p.id);

                        return (
                            <div key={p.id} className="glass-card" style={{ padding: 12, marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13 }}>{p.descricao || p.upmcode || `Peça #${p.id}`}</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                        {p.comprimento}×{p.largura}×{p.espessura}mm · {p.modulo_desc || ''}
                                    </span>
                                    {fInfo && (
                                        <span style={{
                                            padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                                            background: fInfo.face_cnc === 'A' ? '#dbeafe' : '#fce7f3',
                                            color: fInfo.face_cnc === 'A' ? '#1e40af' : '#9d174d',
                                        }}>CNC: Face {fInfo.face_cnc}</span>
                                    )}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                        <button onClick={() => enableAll(pid)}
                                            style={{ fontSize: 9, padding: '2px 6px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 4, cursor: 'pointer', color: '#166534' }}>
                                            ✓ Ativar tudo
                                        </button>
                                        <button onClick={() => disableAll(pid)}
                                            style={{ fontSize: 9, padding: '2px 6px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', color: '#991b1b' }}>
                                            ✕ Desativar tudo
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {workers.map((w, i) => {
                                        const info = usinInfo(w.category);
                                        const disabled = isDisabled(pid, i);
                                        const isHole = /hole|furo/i.test(w.category || '');
                                        const faceLabel = { top: 'Face A', bottom: 'Face B', front: 'Frontal', back: 'Traseira', left: 'Esquerda', right: 'Direita' }[w.face] || w.face;

                                        return (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                                                borderRadius: 5, background: disabled ? 'var(--bg-muted)' : 'transparent',
                                                opacity: disabled ? 0.5 : 1, transition: 'all .2s',
                                            }}>
                                                <input type="checkbox" checked={!disabled} onChange={() => toggleWorker(pid, i, !disabled)}
                                                    style={{ cursor: 'pointer', accentColor: info.color }} disabled={saving} />
                                                <span style={{ width: 20, height: 20, borderRadius: 5, background: `${info.color}18`, color: info.color,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                                                    {info.icon}
                                                </span>
                                                <span style={{ fontSize: 11, fontWeight: 600, minWidth: 100 }}>{info.label}</span>
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{faceLabel}</span>
                                                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                    {isHole ? `⌀${w.diameter || 8}mm` : `${w.length || 0}×${w.width || 0}mm`}
                                                    {' · prof. '}
                                                    {w.depth || 0}mm
                                                </span>
                                                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                                    x:{w.x} y:{w.y}
                                                </span>
                                                {disabled && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 600 }}>MANUAL</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {pecas.every(p => !parseMach(p.machining_json).length) && (
                        <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            Nenhuma peça neste lote tem usinagens definidas.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

