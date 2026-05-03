// Extraído automaticamente de ProducaoCNC.jsx (linhas 1162-1324).
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

export function RelatorioDesperdicio({ loteId, notify }) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [historico, setHistorico] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showHistorico, setShowHistorico] = useState(false);

    const load = useCallback(() => {
        if (!loteId) return;
        setLoading(true);
        api.get(`/cnc/relatorio-desperdicio/${loteId}`)
            .then(setData)
            .catch(() => { notify?.('Erro ao carregar relatório de desperdício', 'error'); })
            .finally(() => setLoading(false));
    }, [loteId]);

    const loadHistorico = useCallback(() => {
        api.get('/cnc/relatorio-desperdicio-historico')
            .then(setHistorico)
            .catch(() => { notify?.('Erro ao carregar histórico', 'error'); });
    }, []);

    useEffect(() => { if (open && !data) load(); }, [open, data, load]);
    useEffect(() => { if (showHistorico && !historico) loadHistorico(); }, [showHistorico, historico, loadHistorico]);

    const aprovColor = (pct) => pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

    const fmt = (v) => typeof v === 'number' ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

    const renderSummary = (resumo) => {
        if (!resumo) return null;
        const cards = [
            { label: 'Total Chapas', value: resumo.total_chapas ?? '-', highlight: true },
            { label: 'Total Peças', value: resumo.total_pecas ?? '-' },
            { label: 'Aproveitamento Médio', value: resumo.aproveitamento_medio != null ? `${fmt(resumo.aproveitamento_medio)}%` : '-', color: aprovColor(resumo.aproveitamento_medio || 0) },
            { label: 'Custo Total', value: resumo.custo_total != null ? `R$ ${fmt(resumo.custo_total)}` : '-' },
            { label: 'Custo Desperdício', value: resumo.custo_desperdicio != null ? `R$ ${fmt(resumo.custo_desperdicio)}` : '-', color: '#ef4444' },
        ];
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                {cards.map((c, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontSize: 14, fontWeight: c.highlight ? 700 : 600, color: c.color || (c.highlight ? 'var(--primary)' : 'var(--text-primary)') }}>
                            {c.value}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderMateriais = (materiais) => {
        if (!materiais || materiais.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>Nenhum material encontrado</div>;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {materiais.map((m, i) => {
                    const aprov = m.aproveitamento ?? 0;
                    const aColor = aprovColor(aprov);
                    const areaUsada = m.area_usada ?? 0;
                    const areaDesperdicio = m.area_desperdicio ?? 0;
                    const areaTotal = areaUsada + areaDesperdicio || 1;
                    const pctUsada = (areaUsada / areaTotal) * 100;
                    return (
                        <div key={i} style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{m.material || 'Sem material'}</div>
                                    {m.codigo && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.codigo}</div>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.chapas ?? '-'} chapa{(m.chapas ?? 0) !== 1 ? 's' : ''}</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: aColor }}>{fmt(aprov)}%</span>
                                </div>
                            </div>
                            {/* Usage bar */}
                            <div style={{ height: 8, borderRadius: 4, background: '#ef444430', overflow: 'hidden', marginBottom: 6 }}>
                                <div style={{ height: '100%', borderRadius: 4, background: aColor, width: `${pctUsada}%`, transition: 'width .3s' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                                <span>Usado: {fmt(areaUsada / 1e6)} m²</span>
                                <span>Desperdício: {fmt(areaDesperdicio / 1e6)} m²</span>
                            </div>
                            {(m.custo_material != null || m.custo_desperdicio != null) && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                    <span>Custo material: R$ {fmt(m.custo_material ?? 0)}</span>
                                    <span style={{ color: '#ef4444' }}>Custo desp.: R$ {fmt(m.custo_desperdicio ?? 0)}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="glass-card" style={{ marginTop: 16, overflow: 'hidden' }}>
            <button onClick={() => setOpen(!open)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                    borderBottom: open ? '1px solid var(--border)' : 'none',
                }}>
                <BarChart3 size={15} />
                Relatório de Desperdício
                <ChevronDown size={14} style={{ marginLeft: 'auto', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : '' }} />
            </button>

            {open && (
                <div style={{ padding: 16 }}>
                    {loading ? (
                        <Spinner text="Carregando relatório..." />
                    ) : data ? (
                        <>
                            {renderSummary(data.resumo)}
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Por Material</div>
                            {renderMateriais(data.por_material)}

                            {/* Toggle histórico */}
                            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                <button onClick={() => setShowHistorico(!showHistorico)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                                        padding: '6px 12px', cursor: 'pointer',
                                        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                                    }}>
                                    <BarChart3 size={13} />
                                    {showHistorico ? 'Ocultar Histórico Geral' : 'Ver Histórico Geral (todos os lotes)'}
                                    <ChevronDown size={12} style={{ transition: 'transform .2s', transform: showHistorico ? 'rotate(180deg)' : '' }} />
                                </button>

                                {showHistorico && (
                                    <div style={{ marginTop: 12 }}>
                                        {!historico ? (
                                            <Spinner text="Carregando histórico..." />
                                        ) : (
                                            <>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Agregado — Todos os Lotes</div>
                                                {renderSummary(historico.resumo)}
                                                {renderMateriais(historico.por_material)}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                            Nenhum dado disponível. Otimize o plano para gerar o relatório.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 2: PEÇAS
// ═══════════════════════════════════════════════════════
