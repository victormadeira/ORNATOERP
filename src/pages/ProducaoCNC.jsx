// ═══════════════════════════════════════════════════════════════════════
// Produção CNC — Shell v2
// Estrutura: 4 áreas (Operação / Produção / Gestão / Administração)
// Workspace dedicado por lote com stepper de status real.
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import api from '../api';
import { PageHeader, Spinner } from '../ui';
import {
    Upload, Package, BarChart3, Box, Settings, Layers, Scissors, Cpu,
    ArrowLeft, AlertTriangle, GitCompare, ChevronDown, X, QrCode,
    Calendar, Clock, User, MessageSquare, Workflow, Wrench, DollarSign,
    ShieldAlert, CheckCircle2, Circle, AlertCircle, ChevronRight,
    Play, Zap,
} from 'lucide-react';
import useWebSocket from '../hooks/useWebSocket';
import EditorEtiquetas from '../components/EditorEtiquetas';
import { STATUS_COLORS } from './ProducaoCNC/shared/constants.js';

// ── Tabs lazy ───────────────────────────────────────────────
const TabImportar  = lazy(() => import('./ProducaoCNC/tabs/TabImportar.jsx').then(m => ({ default: m.TabImportar })));
const TabLotes     = lazy(() => import('./ProducaoCNC/tabs/TabLotes.jsx').then(m => ({ default: m.TabLotes })));
const TabDashboard = lazy(() => import('./ProducaoCNC/tabs/TabDashboard.jsx').then(m => ({ default: m.TabDashboard })));
const TabRetalhos  = lazy(() => import('./ProducaoCNC/tabs/TabRetalhos.jsx').then(m => ({ default: m.TabRetalhos })));
const TabPecas     = lazy(() => import('./ProducaoCNC/tabs/TabPecas.jsx').then(m => ({ default: m.TabPecas })));
const TabPlano     = lazy(() => import('./ProducaoCNC/tabs/TabPlano/index.jsx').then(m => ({ default: m.TabPlano })));
const TabEtiquetas = lazy(() => import('./ProducaoCNC/tabs/TabEtiquetas.jsx').then(m => ({ default: m.TabEtiquetas })));
const TabGcode        = lazy(() => import('./ProducaoCNC/tabs/TabGcode.jsx').then(m => ({ default: m.TabGcode })));
const TabUsinagens    = lazy(() => import('./ProducaoCNC/tabs/TabUsinagens.jsx').then(m => ({ default: m.TabUsinagens })));
const TabCustos       = lazy(() => import('./ProducaoCNC/tabs/TabCustos.jsx').then(m => ({ default: m.TabCustos })));
const TabFilaMaquinas = lazy(() => import('./ProducaoCNC/tabs/TabFilaMaquinas.jsx').then(m => ({ default: m.TabFilaMaquinas })));
const TabConfig       = lazy(() => import('./ProducaoCNC/tabs/TabConfig/index.jsx').then(m => ({ default: m.TabConfig })));
const Piece3DModal = lazy(() => import('../modules/digital-twin/components/modals/Piece3DModal.jsx').then(m => ({ default: m.Piece3DModal })));
const QRScanModal  = lazy(() => import('../modules/digital-twin/components/modals/QRScanModal.jsx').then(m => ({ default: m.QRScanModal })));

const TabFallback = () => (
    <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
        <Spinner size={24} />
    </div>
);

// ── Áreas de trabalho (item #2 do plano) ─────────────────────
const AREA_GROUPS = [
    {
        id: 'operacao', label: 'Operação',
        tabs: [
            { id: 'importar', lb: 'Importar', ic: Upload },
            { id: 'lotes',    lb: 'Lotes',    ic: Package },
        ],
    },
    {
        id: 'producao', label: 'Produção',
        tabs: [
            { id: 'fila', lb: 'Fila de Máquinas', ic: Workflow },
        ],
    },
    {
        id: 'gestao', label: 'Gestão',
        tabs: [
            { id: 'dashboard', lb: 'Dashboard', ic: BarChart3 },
            { id: 'retalhos',  lb: 'Retalhos',  ic: Box },
        ],
    },
    {
        id: 'admin', label: 'Administração',
        tabs: [
            { id: 'config', lb: 'Configurações CNC', ic: Settings },
        ],
    },
];

// Nível 2 — etapas do workspace de lote (com status computável)
const TABS_LOTE = [
    { id: 'pecas',     lb: 'Peças',          ic: Layers,     step: 1 },
    { id: 'plano',     lb: 'Plano de Corte', ic: Scissors,   step: 2 },
    { id: 'usinagens', lb: 'Usinagens',       ic: Wrench,     step: 3 },
    { id: 'gcode',     lb: 'G-code / CNC',   ic: Cpu,        step: 4 },
    { id: 'custos',    lb: 'Custos',          ic: DollarSign, step: 5 },
];

// ── Stepper status real por etapa (item #4) ──────────────────
function getStepStatus(stepId, lote, materialAlerts, toolAlerts) {
    if (!lote) return 'idle';
    switch (stepId) {
        case 'pecas':
            return lote.total_pecas > 0 ? 'ok' : 'pending';
        case 'plano':
            if (lote.total_pecas === 0) return 'blocked';
            if (materialAlerts.length > 0) return 'alert';
            return lote.aproveitamento > 0 ? 'ok' : 'pending';
        case 'usinagens':
            return lote.total_pecas > 0 ? (toolAlerts.length > 0 ? 'alert' : 'ok') : 'blocked';
        case 'gcode':
            if (lote.aproveitamento === 0) return 'blocked';
            return lote.status === 'otimizado' || lote.status === 'produzindo' || lote.status === 'concluido' ? 'ok' : 'pending';
        case 'custos':
            return lote.total_pecas > 0 ? 'ok' : 'blocked';
        default:
            return 'idle';
    }
}

const STEP_STATUS_STYLE = {
    ok:      { color: 'var(--success)',  bg: 'var(--success-bg)',  border: 'var(--success-border)', icon: <CheckCircle2 size={13} /> },
    pending: { color: 'var(--warning)',  bg: 'var(--warning-bg)',  border: 'var(--warning-border)', icon: <Clock size={13} /> },
    blocked: { color: 'var(--danger)',   bg: 'var(--danger-bg)',   border: 'var(--danger-border)',  icon: <AlertCircle size={13} /> },
    alert:   { color: 'var(--warning)',  bg: 'var(--warning-bg)',  border: 'var(--warning-border)', icon: <AlertTriangle size={13} /> },
    idle:    { color: 'var(--text-muted)', bg: 'var(--bg-muted)', border: 'var(--border)',          icon: <Circle size={13} /> },
};

// ── Painel de pendências agrupadas (item #5) ─────────────────
function PendingPanel({ materialAlerts, toolAlerts, onDismiss, onNavigate }) {
    const [open, setOpen] = useState(true);
    const groups = [];

    if (materialAlerts.length > 0) {
        groups.push({
            id: 'material',
            label: 'Materiais indisponíveis',
            count: materialAlerts.length,
            color: 'var(--danger)',
            bg: 'var(--danger-bg)',
            border: 'var(--danger-border)',
            icon: <Package size={13} />,
            action: { label: 'Ver plano de corte', tab: 'plano' },
            detail: materialAlerts.slice(0, 2).map(a => a.material || a.material_code).join(', ') +
                    (materialAlerts.length > 2 ? ` e mais ${materialAlerts.length - 2}` : ''),
        });
    }

    if (toolAlerts.length > 0) {
        groups.push({
            id: 'ferramenta',
            label: 'Ferramentas com desgaste',
            count: toolAlerts.length,
            color: 'var(--warning)',
            bg: 'var(--warning-bg)',
            border: 'var(--warning-border)',
            icon: <ShieldAlert size={13} />,
            action: { label: 'Ver ferramentas', tab: 'config' },
            detail: toolAlerts.slice(0, 2).map(t => `${t.nome} (${t.percentage}%)`).join(', ') +
                    (toolAlerts.length > 2 ? ` e mais ${toolAlerts.length - 2}` : ''),
        });
    }

    if (groups.length === 0) return null;

    const criticalCount = materialAlerts.length + toolAlerts.length;

    return (
        <div className="cnc-pending-panel">
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
                }}
            >
                <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                    Riscos operacionais
                </span>
                <span style={{
                    fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
                    background: 'var(--danger-bg)', color: 'var(--danger)',
                    border: '1px solid var(--danger-border)',
                }}>
                    {criticalCount} item{criticalCount > 1 ? 's' : ''}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, marginLeft: 4, flexShrink: 0 }}
                    title="Dispensar alertas"
                >
                    <X size={13} />
                </button>
                <ChevronDown size={13} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : '', transition: 'transform .2s', flexShrink: 0 }} />
            </button>

            {open && groups.map((g, i) => (
                <div key={g.id} className="cnc-pending-row" style={{ borderTop: i === 0 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: g.bg, border: `1px solid ${g.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: g.color,
                    }}>{g.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: g.color }}>
                            {g.count} {g.label}
                        </div>
                        {g.detail && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {g.detail}
                            </div>
                        )}
                    </div>
                    {g.action && (
                        <button
                            onClick={() => onNavigate?.(g.action.tab)}
                            className="cnc-next-action-btn"
                            style={{
                                background: `${g.color}14`, border: `1px solid ${g.border}`,
                                color: g.color,
                            }}
                        >
                            {g.action.label} <ChevronRight size={11} />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

// ── Workspace header do lote (item #3) ───────────────────────
function LoteWorkspaceHeader({ lote, tab, setTab, onVoltar, materialAlerts, toolAlerts }) {
    const diasRestantes = lote.data_entrega
        ? Math.ceil((new Date(lote.data_entrega + 'T12:00:00') - new Date()) / 86400000)
        : null;
    const prazoColor = diasRestantes === null ? 'var(--text-muted)'
        : diasRestantes < 0 ? 'var(--danger)'
        : diasRestantes <= 3 ? 'var(--warning)'
        : 'var(--success)';

    const totalAlerts = materialAlerts.length + toolAlerts.length;

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            marginBottom: 16,
        }}>
            {/* Breadcrumb + Meta bar */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                flexWrap: 'wrap',
            }}>
                {/* Breadcrumb */}
                <button
                    onClick={onVoltar}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px 4px 8px', borderRadius: 8,
                        background: 'var(--bg-muted)', border: '1px solid var(--border)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                        transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                    <ArrowLeft size={13} /> Lotes
                </button>
                <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
                    title={lote.nome || `Lote #${lote.id}`}>
                    {lote.nome || `Lote #${lote.id}`}
                </span>

                {/* Meta chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                    {lote.cliente && (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <User size={11} /> {lote.cliente}
                            {lote.projeto && <span style={{ color: 'var(--text-muted)' }}> / {lote.projeto}</span>}
                        </span>
                    )}
                    {diasRestantes !== null && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: prazoColor, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={11} />
                            {new Date(lote.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR')}
                            {diasRestantes < 0 ? <><AlertTriangle size={10} /> {Math.abs(diasRestantes)}d atrasado</> : diasRestantes <= 3 ? <><Clock size={10} /> {diasRestantes}d</> : null}
                        </span>
                    )}
                    {lote.prioridade > 0 && (
                        <span style={{
                            fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                            color: lote.prioridade === 2 ? 'var(--danger)' : 'var(--warning)',
                            background: lote.prioridade === 2 ? 'var(--danger-bg)' : 'var(--warning-bg)',
                            border: `1px solid ${lote.prioridade === 2 ? 'var(--danger-border)' : 'var(--warning-border)'}`,
                        }}>
                            {lote.prioridade === 2 ? '🔴 URGENTE' : '⚡ ALTA PRIORIDADE'}
                        </span>
                    )}
                    {totalAlerts > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
                            <AlertTriangle size={10} style={{ display: 'inline', marginRight: 3 }} />
                            {totalAlerts} pendência{totalAlerts > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            </div>

            {/* Stepper com status real (item #4) */}
            <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {TABS_LOTE.map((t, idx) => {
                    const active = tab === t.id;
                    const status = getStepStatus(t.id, lote, materialAlerts, toolAlerts);
                    const ss = STEP_STATUS_STYLE[status];
                    const isLast = idx === TABS_LOTE.length - 1;
                    const I = t.ic;

                    return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
                            <button
                                onClick={() => setTab(t.id)}
                                aria-current={active ? 'step' : undefined}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '11px 16px', border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: active ? 700 : 500,
                                    fontFamily: 'var(--font-sans)',
                                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                                    background: active ? 'var(--bg-elevated)' : 'transparent',
                                    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                                    transition: 'all var(--transition-fast)',
                                    whiteSpace: 'nowrap',
                                    position: 'relative',
                                }}
                                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
                                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                            >
                                {/* Step number / status icon */}
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                    fontSize: 10, fontWeight: 800,
                                    background: active ? 'var(--primary)' : (status === 'ok' ? ss.bg : 'var(--bg-muted)'),
                                    color: active ? '#fff' : ss.color,
                                    border: `1.5px solid ${active ? 'var(--primary)' : (status === 'idle' ? 'var(--border)' : ss.border)}`,
                                    transition: 'all .2s',
                                }}>
                                    {status === 'ok' && !active ? '✓' : t.step}
                                </span>
                                <I size={12} />
                                <span>{t.lb}</span>
                                {/* Status dot */}
                                {(status === 'pending' || status === 'blocked' || status === 'alert') && !active && (
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ss.color, flexShrink: 0 }} />
                                )}
                            </button>
                            {!isLast && (
                                <div style={{
                                    width: 1, alignSelf: 'stretch',
                                    background: 'var(--border)',
                                    flexShrink: 0,
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Shell principal ──────────────────────────────────────────
export default function ProducaoCNC({ notify }) {
    const [tab, setTab] = useState('lotes');
    const [lotes, setLotes] = useState([]);
    const [loteAtual, setLoteAtual] = useState(null);
    const [editorMode, setEditorMode] = useState(false);
    const [editorTemplateId, setEditorTemplateId] = useState(null);
    const [configSection, setConfigSection] = useState('maquinas');
    const [toolAlerts, setToolAlerts] = useState([]);
    const [materialAlerts, setMaterialAlerts] = useState([]);
    const [materialAlertsDismissed, setMaterialAlertsDismissed] = useState(false);
    const [sugestoes, setSugestoes] = useState([]);
    const [sugestoesOpen, setSugestoesOpen] = useState(false);
    const [modal3DPeca, setModal3DPeca] = useState(null);
    const [modalScanOpen, setModalScanOpen] = useState(false);

    // Área ativa derivada do tab (não precisa de estado separado)
    const activeArea = AREA_GROUPS.find(g => g.tabs.some(t => t.id === tab))?.id || 'operacao';

    useWebSocket(useCallback((msg) => {
        if (msg.type === 'gcode_complete' && msg.data?.message) {
            notify?.(msg.data.message, 'success');
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Ornato CNC', { body: msg.data.message, icon: '/favicon.ico' });
            }
        }
        if (msg.type === 'entrega_update' && msg.data) {
            notify?.(`Entrega: ${msg.data.tipo} — Lote #${msg.data.lote_id}`, 'success');
        }
    }, [notify]));

    const loadLotes = useCallback(() => {
        api.get('/cnc/lotes').then(data => {
            setLotes(data);
            setLoteAtual(prev => {
                if (!prev) return prev;
                const updated = data.find(l => l.id === prev.id);
                return updated || prev;
            });
        }).catch(e => notify?.(e.error || 'Erro ao carregar lotes'));
    }, [notify]);

    const loadToolAlerts = useCallback(() => {
        api.get('/cnc/ferramentas/alertas').then(setToolAlerts).catch(() => {});
    }, []);

    useEffect(() => { loadLotes(); loadToolAlerts(); }, [loadLotes, loadToolAlerts]);

    const abrirLote = useCallback((lote, aba = 'pecas') => {
        setLoteAtual(lote);
        setTab(aba);
        setMaterialAlertsDismissed(false);
        api.get(`/cnc/alertas-material?lote_id=${lote.id}`).then(r => {
            const alerts = (r.alertas || []).filter(a => a.chapas_necessarias > (a.estoque_chapas + a.retalhos_disponiveis));
            setMaterialAlerts(alerts);
        }).catch(() => setMaterialAlerts([]));
        api.get(`/cnc/sugestao-agrupamento/${lote.id}`).then(r => {
            setSugestoes(r.sugestoes || []);
        }).catch(() => setSugestoes([]));
    }, []);

    const voltarLotes = useCallback(() => {
        setLoteAtual(null);
        setTab('lotes');
        setMaterialAlerts([]);
        setSugestoes([]);
        setSugestoesOpen(false);
    }, []);

    const isInsideLote = loteAtual && ['pecas', 'plano', 'etiquetas', 'gcode', 'usinagens', 'custos'].includes(tab);

    // ── Modo editor etiquetas ─────────────────────────────────
    if (editorMode) {
        return (
            <div className="w-full page-enter" style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <EditorEtiquetas
                        api={api} notify={notify} lotes={lotes} loteAtual={loteAtual}
                        initialTemplateId={editorTemplateId}
                        onBack={() => { setEditorMode(false); setEditorTemplateId(null); setConfigSection('etiquetas'); }}
                    />
                </div>
            </div>
        );
    }

    // ── Alertas globais de ferramenta (fora do workspace de lote) ─
    const showGlobalToolAlert = toolAlerts.length > 0 && !isInsideLote;

    return (
        <div className="w-full page-enter" style={{ padding: '8px 12px 12px' }}>
            <PageHeader icon={Cpu} title="Produção CNC" subtitle="Importar, otimizar, G-code e rastrear">
                <button
                    onClick={() => setModalScanOpen(true)}
                    title="Escanear QR de uma peça"
                    className="btn-secondary"
                    style={{ fontSize: 13, fontWeight: 600, gap: 8 }}
                >
                    <QrCode size={16} /> Escanear
                </button>
            </PageHeader>

            {/* ── Alerta global de ferramentas (compacto, fora do lote) */}
            {showGlobalToolAlert && (
                <div className="alert-banner alert-banner-warning" style={{ marginBottom: 10 }}>
                    <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12 }}>
                        <b>{toolAlerts.length} ferramenta(s)</b> com desgaste acima de 80%.{' '}
                        {toolAlerts.slice(0, 2).map(t => `${t.nome} (${t.percentage}%)`).join(', ')}
                        {toolAlerts.length > 2 && ` e mais ${toolAlerts.length - 2}...`}
                    </span>
                    <button onClick={() => { setTab('config'); setConfigSection('maquinas'); }}
                        className="btn-secondary" style={{ fontSize: 11, padding: '3px 10px', minHeight: 0 }}>
                        Ver ferramentas
                    </button>
                </div>
            )}

            {/* ── Nav principal: 2 níveis (Área → Tabs) — só fora do workspace ── */}
            {!isInsideLote && (
                <div style={{ marginBottom: 12 }}>
                    {/* Nível 1 — Área (pills) */}
                    <div className="cnc-area-nav" style={{ marginBottom: 6 }}>
                        {AREA_GROUPS.map(area => (
                            <button
                                key={area.id}
                                className={`cnc-area-btn${activeArea === area.id ? ' active' : ''}`}
                                onClick={() => setTab(area.tabs[0].id)}
                            >
                                {area.label}
                            </button>
                        ))}
                    </div>

                    {/* Nível 2 — Tabs da área ativa */}
                    {(() => {
                        const currentAreaTabs = AREA_GROUPS.find(a => a.id === activeArea)?.tabs || [];
                        if (currentAreaTabs.length <= 1) return null; // única tab → sem barra
                        return (
                            <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
                                {currentAreaTabs.map(t => {
                                    const active = tab === t.id;
                                    const I = t.ic;
                                    return (
                                        <button key={t.id}
                                            onClick={() => setTab(t.id)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 7,
                                                padding: '8px 14px', border: 'none', cursor: 'pointer',
                                                fontSize: 12.5, fontWeight: active ? 700 : 500,
                                                fontFamily: 'var(--font-sans)',
                                                color: active ? 'var(--primary)' : 'var(--text-muted)',
                                                background: 'transparent',
                                                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                                                transition: 'all var(--transition-fast)',
                                                marginBottom: -1,
                                            }}
                                            onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                            onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; }}
                                        >
                                            <I size={13} />
                                            {t.lb}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ── Workspace do lote (substitui tabs globais) ── */}
            {isInsideLote && (
                <>
                    <LoteWorkspaceHeader
                        lote={loteAtual}
                        tab={tab}
                        setTab={setTab}
                        onVoltar={voltarLotes}
                        materialAlerts={materialAlerts}
                        toolAlerts={toolAlerts}
                    />

                    {/* Painel de pendências agrupadas */}
                    {!materialAlertsDismissed && (materialAlerts.length > 0 || toolAlerts.length > 0) && (
                        <PendingPanel
                            materialAlerts={materialAlerts}
                            toolAlerts={toolAlerts}
                            onDismiss={() => setMaterialAlertsDismissed(true)}
                            onNavigate={(t) => setTab(t)}
                        />
                    )}
                </>
            )}

            {/* Sugestões de agrupamento */}
            {isInsideLote && sugestoes.length > 0 && (
                <div className="glass-card" style={{ marginBottom: 12, overflow: 'hidden', padding: 0 }}>
                    <button
                        onClick={() => setSugestoesOpen(!sugestoesOpen)}
                        aria-expanded={sugestoesOpen}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                            padding: '10px 16px', background: 'none', border: 'none',
                            cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
                            borderBottom: sugestoesOpen ? '1px solid var(--border)' : 'none',
                            fontFamily: 'var(--font-sans)',
                        }}
                    >
                        <GitCompare size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        <span>Sugestões de agrupamento</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-alpha)', border: '1px solid var(--accent-ring)', padding: '2px 8px', borderRadius: 20 }}>
                            {sugestoes.length} LOTE{sugestoes.length > 1 ? 'S' : ''}
                        </span>
                        <ChevronDown size={13} style={{ marginLeft: 'auto', color: 'var(--text-muted)', transition: 'transform .2s', transform: sugestoesOpen ? 'rotate(180deg)' : '' }} />
                    </button>
                    {sugestoesOpen && (
                        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {sugestoes.map((s, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                                >
                                    <Package size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.lote_nome}</div>
                                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                                            {s.pecas_count} peça(s) em comum{s.material_codes.length > 0 && ` · ${s.material_codes.join(', ')}`}
                                        </div>
                                    </div>
                                    {s.economia_estimada_pct > 0 && (
                                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--success)', background: 'var(--success-bg)', border: '1px solid var(--success-border)', padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                                            −{s.economia_estimada_pct}% desperdício
                                        </span>
                                    )}
                                    <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, background: STATUS_COLORS[s.lote_status] || 'var(--text-muted)', color: '#fff', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                                        {s.lote_status}
                                    </span>
                                    <button onClick={() => abrirLote({ id: s.lote_id, nome: s.lote_nome }, 'plano')}
                                        className="btn-secondary btn-sm" style={{ fontSize: 11, gap: 4 }}>
                                        Abrir <ChevronRight size={11} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Conteúdo das tabs ═══ */}
            <Suspense fallback={<TabFallback />}>
                {tab === 'importar' && !isInsideLote && (
                    <TabImportar lotes={lotes} loadLotes={loadLotes} notify={notify} setLoteAtual={abrirLote} setTab={setTab} />
                )}
                {tab === 'lotes' && !isInsideLote && (
                    <TabLotes lotes={lotes} loadLotes={loadLotes} notify={notify} abrirLote={abrirLote} />
                )}
                {tab === 'dashboard' && !isInsideLote && (
                    <TabDashboard notify={notify} />
                )}
                {tab === 'retalhos' && !isInsideLote && (
                    <TabRetalhos notify={notify} />
                )}
                {tab === 'pecas' && isInsideLote && (
                    <TabPecas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} setTab={setTab} onOpen3DCSG={setModal3DPeca} />
                )}
                {tab === 'plano' && isInsideLote && (
                    <TabPlano lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} loadLotes={loadLotes} setTab={setTab} />
                )}
                {tab === 'etiquetas' && isInsideLote && (
                    <TabEtiquetas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />
                )}
                {tab === 'gcode' && isInsideLote && (
                    <TabGcode lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />
                )}
                {tab === 'usinagens' && isInsideLote && (
                    <TabUsinagens loteAtual={loteAtual} notify={notify} />
                )}
                {tab === 'custos' && isInsideLote && (
                    <TabCustos loteAtual={loteAtual} notify={notify} />
                )}
                {tab === 'fila' && !isInsideLote && (
                    <TabFilaMaquinas notify={notify} />
                )}
                {tab === 'config' && (
                    <TabConfig
                        notify={notify} setEditorMode={setEditorMode}
                        setEditorTemplateId={setEditorTemplateId}
                        initialSection={configSection}
                        setConfigSection={setConfigSection}
                    />
                )}
            </Suspense>

            {/* ═══ Modais 3D + QR ═══ */}
            {(modal3DPeca || modalScanOpen) && (
                <Suspense fallback={null}>
                    {modal3DPeca && <Piece3DModal peca={modal3DPeca} onClose={() => setModal3DPeca(null)} />}
                    {modalScanOpen && <QRScanModal onClose={() => setModalScanOpen(false)} notify={notify} />}
                </Suspense>
            )}
        </div>
    );
}
