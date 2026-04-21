// Extraído automaticamente de ProducaoCNC.jsx (linhas 844-966).
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

export function TabLotes({ lotes, loadLotes, notify, abrirLote }) {
    const [selectedLotes, setSelectedLotes] = useState(new Set());

    const toggleLoteSelection = (id) => {
        setSelectedLotes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAllLotes = () => {
        if (selectedLotes.size === lotes.length) setSelectedLotes(new Set());
        else setSelectedLotes(new Set(lotes.map(l => l.id)));
    };

    const deleteLote = async (id) => {
        if (!confirm('Excluir este lote e todas as peças?')) return;
        try {
            await api.del(`/cnc/lotes/${id}`);
            notify('Lote excluído');
            loadLotes();
        } catch (err) {
            notify('Erro ao excluir lote: ' + (err.message || ''), 'error');
        }
    };

    return (
        <div className="glass-card p-4">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    <Package size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                    Lotes Importados ({lotes.length})
                </h3>
                <button onClick={loadLotes} className={Z.btn2} style={{ padding: '4px 10px', fontSize: 11 }}>
                    <RefreshCw size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                    Atualizar
                </button>
            </div>

            {lotes.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Nenhum lote importado ainda
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                        <thead>
                            <tr>
                                <th className={Z.th} style={{ padding: '8px 6px', width: 32 }}>
                                    <input type="checkbox" checked={selectedLotes.size === lotes.length && lotes.length > 0}
                                        onChange={toggleAllLotes} style={{ cursor: 'pointer' }} />
                                </th>
                                {['#', 'Nome', 'Cliente', 'Projeto', 'Peças', 'Chapas', 'Aprov.', 'Status', 'Data', ''].map(h => (
                                    <th key={h} className={Z.th} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lotes.map((l, i) => (
                                <tr key={l.id}
                                    onClick={() => abrirLote(l)}
                                    style={{
                                        background: selectedLotes.has(l.id) ? 'rgba(59,130,246,0.06)' : i % 2 === 0 ? 'transparent' : 'var(--bg-muted)',
                                        transition: 'background .15s', cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => { if (!selectedLotes.has(l.id)) e.currentTarget.style.background = 'rgba(19,121,240,0.04)'; }}
                                    onMouseLeave={e => { if (!selectedLotes.has(l.id)) e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-muted)'; }}
                                >
                                    <td style={{ padding: '8px 6px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                        <input type="checkbox" checked={selectedLotes.has(l.id)}
                                            onChange={() => toggleLoteSelection(l.id)} style={{ cursor: 'pointer' }} />
                                    </td>
                                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{l.id}</td>
                                    <td style={{ padding: '8px 10px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</td>
                                    <td style={{ padding: '8px 10px' }}>{l.cliente || '-'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{l.projeto || '-'}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.total_pecas}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.total_chapas || '-'}</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.aproveitamento ? `${l.aproveitamento}%` : '-'}</td>
                                    <td style={{ padding: '8px 10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span className={tagClass} style={tagStyle(STATUS_COLORS[l.status])}>
                                                {l.status}
                                            </span>
                                            {l.grupo_otimizacao && (
                                                <span title="Otimizado em grupo" style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 600 }}>
                                                    MULTI
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                        {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td style={{ padding: '8px 10px' }} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => abrirLote(l, 'pecas')}
                                                title="Ver peças" className={Z.btn2} style={{ padding: '3px 8px', fontSize: 11 }}>
                                                <Eye size={12} />
                                            </button>
                                            <button onClick={() => abrirLote(l, 'plano')}
                                                title="Plano de corte" className={Z.btn2} style={{ padding: '3px 8px', fontSize: 11 }}>
                                                <Scissors size={12} />
                                            </button>
                                            <button onClick={() => deleteLote(l.id)}
                                                title="Excluir" className={Z.btnD} style={{ padding: '3px 8px', fontSize: 11 }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// DASHBOARD — Production Statistics
// ═══════════════════════════════════════════════════════
