// Extraído automaticamente de ProducaoCNC.jsx (linhas 967-1147).
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
import { InfoCard } from '../shared/InfoCard.jsx';
import { RelatorioDesperdicio } from './_RelatorioDesperdicio.jsx';

export function TabDashboard({ notify }) {
    const [stats, setStats] = useState(null);
    const [materiais, setMateriais] = useState([]);
    const [eficiencia, setEficiencia] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            api.get('/cnc/dashboard/stats').catch(() => null),
            api.get('/cnc/dashboard/materiais').catch(() => []),
            api.get('/cnc/dashboard/eficiencia?days=30').catch(() => []),
        ]).then(([s, m, e]) => {
            setStats(s);
            setMateriais(Array.isArray(m) ? m : []);
            setEficiencia(Array.isArray(e) ? e : []);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /> Carregando dashboard...</div>;
    if (!stats) return <div className="glass-card p-4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Sem dados de producao disponveis.</div>;

    // Last 14 days for efficiency chart
    const chartDays = eficiencia.slice(-14);
    const maxChapas = Math.max(1, ...chartDays.map(d => d.chapas || 1));

    const cardStyle = {
        flex: '1 1 200px', padding: '16px 20px', borderRadius: 10,
        background: 'var(--bg-card, #fff)', border: '1px solid var(--border)',
        textAlign: 'center', minWidth: 160,
    };
    const cardLabel = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 6 };
    const cardValue = { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Summary Cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={cardStyle}>
                    <div style={cardLabel}>Chapas Cortadas</div>
                    <div style={cardValue}>{stats.totalChapas || 0}</div>
                </div>
                <div style={cardStyle}>
                    <div style={cardLabel}>Pecas Produzidas</div>
                    <div style={cardValue}>{stats.totalPecas || 0}</div>
                </div>
                <div style={cardStyle}>
                    <div style={cardLabel}>Aproveitamento Medio</div>
                    <div style={{ ...cardValue, color: (stats.avgAproveitamento || 0) >= 80 ? '#16a34a' : (stats.avgAproveitamento || 0) >= 60 ? '#ca8a04' : '#dc2626' }}>
                        {stats.avgAproveitamento || 0}%
                    </div>
                </div>
                <div style={cardStyle}>
                    <div style={cardLabel}>Lotes Concluidos</div>
                    <div style={cardValue}>{stats.lotesConcluidos || 0}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}> / {stats.totalLotes || 0}</span></div>
                </div>
            </div>

            {/* Efficiency Chart (inline SVG bar chart) */}
            {chartDays.length > 0 && (
                <div className="glass-card p-4">
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                        <BarChart3 size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                        Eficiencia - Ultimos {chartDays.length} dias
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <svg width={Math.max(chartDays.length * 50, 300)} height={200} viewBox={`0 0 ${Math.max(chartDays.length * 50, 300)} 200`} style={{ display: 'block' }}>
                            {/* Grid lines */}
                            {[0, 20, 40, 60, 80, 100].map(v => {
                                const y = 170 - v * 1.5;
                                return <Fragment key={v}>
                                    <line x1={30} y1={y} x2={chartDays.length * 50 + 10} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray={v > 0 ? "3 3" : "0"} />
                                    <text x={26} y={y + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">{v}%</text>
                                </Fragment>;
                            })}
                            {/* Bars */}
                            {chartDays.map((d, i) => {
                                const barH = Math.max(2, d.avgAprov * 1.5);
                                const barY = 170 - barH;
                                const barW = 28;
                                const bx = 35 + i * 50;
                                const color = d.avgAprov >= 80 ? '#16a34a' : d.avgAprov >= 60 ? '#ca8a04' : '#dc2626';
                                const dayLabel = d.date ? d.date.slice(5) : '';
                                return <Fragment key={i}>
                                    <rect x={bx} y={barY} width={barW} height={barH} fill={color} rx={3} opacity={0.85} />
                                    <text x={bx + barW / 2} y={barY - 4} textAnchor="middle" fontSize={8} fill="var(--text-primary)" fontWeight={600}>{d.avgAprov}%</text>
                                    <text x={bx + barW / 2} y={185} textAnchor="middle" fontSize={7} fill="var(--text-muted)">{dayLabel}</text>
                                    <text x={bx + barW / 2} y={194} textAnchor="middle" fontSize={6} fill="var(--text-muted)">{d.chapas}ch</text>
                                </Fragment>;
                            })}
                        </svg>
                    </div>
                </div>
            )}

            {/* Material Ranking */}
            {materiais.length > 0 && (
                <div className="glass-card p-4">
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                        <Layers size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                        Ranking de Materiais
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                            <thead>
                                <tr>
                                    {['Material', 'Chapas', 'Area Total (m2)', 'Desperdicio Medio'].map(h => (
                                        <th key={h} className={Z.th} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {materiais.map((m, i) => (
                                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
                                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{m.material}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{m.chapas_usadas}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{m.area_total}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                                background: m.desperdicio_medio <= 20 ? '#dcfce7' : m.desperdicio_medio <= 40 ? '#fef9c3' : '#fee2e2',
                                                color: m.desperdicio_medio <= 20 ? '#166534' : m.desperdicio_medio <= 40 ? '#854d0e' : '#991b1b',
                                            }}>
                                                {m.desperdicio_medio}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Recent Lotes */}
            {(stats.recentLotes || []).length > 0 && (
                <div className="glass-card p-4">
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                        <Package size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                        Lotes Recentes
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                            <thead>
                                <tr>
                                    {['Nome', 'Cliente', 'Data', 'Chapas', 'Pecas', 'Aprov.', 'Status'].map(h => (
                                        <th key={h} className={Z.th} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentLotes.map((l, i) => {
                                    const statusColor = l.status === 'concluido' ? '#8b5cf6' : l.status === 'otimizado' ? '#22c55e' : l.status === 'produzindo' ? '#f59e0b' : '#3b82f6';
                                    return (
                                        <tr key={l.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</td>
                                            <td style={{ padding: '8px 10px' }}>{l.cliente || '-'}</td>
                                            <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{l.criado_em ? new Date(l.criado_em).toLocaleDateString('pt-BR') : '-'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.total_chapas || '-'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.total_pecas || '-'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.aproveitamento ? `${l.aproveitamento}%` : '-'}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                                                    background: statusColor + '18', color: statusColor, border: `1px solid ${statusColor}40`,
                                                }}>
                                                    {l.status || 'importado'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

