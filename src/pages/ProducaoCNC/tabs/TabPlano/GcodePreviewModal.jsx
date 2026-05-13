// Extraído automaticamente de ProducaoCNC.jsx (linhas 7463-7620).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../../../../components/EditorEtiquetas';
import PecaViewer3D from '../../../../components/PecaViewer3D';
import PecaEditor from '../../../../components/PecaEditor';
import { CncSim } from '../../../../components/CncSim/index.jsx';
import { parseGcode as parseGcodeForSim, getOpCat, OP_CATS } from '../../../../components/CncSim/parseGcode.js';
import SlidePanel from '../../../../components/SlidePanel';
import ToolbarDropdown from '../../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../../shared/constants.js';
import { analyzeGcodeOperational, formatMeters, formatMinutes } from '../../shared/operationalMetrics.js';

/* ─── Syntax highlight por token (estilo IDE) ─────────────────────────────── */
function syntaxTokenize(line) {
    const toks = [];
    if (!line) return toks;

    // Separar comentário
    let code = line, comment = '';
    const pi = line.indexOf('('), si = line.indexOf(';');
    const ci = pi >= 0 && si >= 0 ? Math.min(pi, si) : pi >= 0 ? pi : si;
    if (ci >= 0) { code = line.slice(0, ci); comment = line.slice(ci); }

    const push = (text, color, bold, italic) => toks.push({ text, color, bold, italic });

    // Tokenizar parte de código
    const re = /([GMSTNO])(\d+(?:\.\d+)?)|([XYZFIJKABP])(-?[\d.]+)|(%)|(\S)/g;
    let m, last = 0;
    while ((m = re.exec(code)) !== null) {
        if (m.index > last) push(code.slice(last, m.index), '#6e7681');
        if (m[1]) {                              // G M S T N O + número
            const L = m[1].toUpperCase(), n = parseFloat(m[2]);
            if      (L === 'G') {
                const c = n === 0 ? '#f97316' : n === 1 ? '#4ade80' : n <= 3 ? '#60a5fa' : '#93c5fd';
                push(m[1] + m[2], c, true);
            } else if (L === 'M') push(m[1] + m[2], '#c084fc', true);
            else if  (L === 'T') push(m[1] + m[2], '#fde68a', true);
            else if  (L === 'S') { push(m[1], '#94a3b8'); push(m[2], '#79c0ff'); }
            else if  (L === 'N') push(m[1] + m[2], '#3d4451'); // número de linha — dim
            else                 push(m[0], '#e6edf3');
        } else if (m[3]) {                        // eixos + número
            const L = m[3].toUpperCase();
            const axC = L === 'X' ? '#ef4444' : L === 'Y' ? '#22c55e' : L === 'Z' ? '#3b82f6' : '#94a3b8';
            push(m[3], axC, true); push(m[4], '#79c0ff');
        } else if (m[5]) push('%', '#64748b');
        else             push(m[0], '#e6edf3');
        last = m.index + m[0].length;
    }
    if (last < code.length) push(code.slice(last), '#6e7681');
    if (comment) push(comment, '#64748b', false, true);
    return toks;
}

function fmtSecs(s) {
    if (!s || s < 0) return '0:00.0';
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

export function GcodePreviewModal({ data, onDownload, onSendToMachine, onClose, loteId, onSimulate }) {
    const { gcode, filename, stats = {}, alertas = [], chapaIdx, contorno_tool } = data;
    const maquinaInfo = data.maquina || null;

    // ── Simulator state ──────────────────────────────────────────────────────
    const [abaPreview, setAbaPreview] = useState('simulador'); // 'simulador' | 'codigo'
    const simRef = useRef(null);

    const handleExportDxf = () => {
        const url = `/api/cnc/export-dxf/${loteId}/chapa/${chapaIdx}`;
        const a = document.createElement('a');
        a.href = url; a.download = `chapa_${chapaIdx + 1}.dxf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    const lines = (gcode || '').split('\n');
    const lineCount = lines.length;
    const sizeKB = new Blob([gcode]).size / 1024;
    const [showFull, setShowFull] = useState(false);
    const previewLines = showFull ? lines : lines.slice(0, 80);
    const textareaRef = useRef(null);
    const criticalAlerts = alertas.filter(a => {
        const tipo = String(a?.tipo || '').toLowerCase();
        return tipo.includes('erro') || tipo.includes('critico');
    });

    const parsedPreview = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const operational = useMemo(() => analyzeGcodeOperational({
        gcode,
        chapa: data.chapa || null,
        stats,
        alertas,
        parsed: parsedPreview,
    }), [gcode, data.chapa, stats, alertas, parsedPreview]);
    const gcodeCutMoves = parsedPreview.moves.filter(m => m.type !== 'G0').length;
    const operationSummary = useMemo(() => {
        const counts = new Map();
        for (const m of parsedPreview.moves) {
            if (m.type === 'G0') continue;
            const cat = getOpCat(m.op);
            counts.set(cat.key, { ...cat, count: (counts.get(cat.key)?.count || 0) + 1 });
        }
        return OP_CATS
            .map(cat => counts.get(cat.key))
            .filter(Boolean);
    }, [parsedPreview.moves]);

    const hasBlockingIssues = operational.critical.length > 0 || !gcode || gcodeCutMoves === 0;
    const chapaData = data.chapa || null;
    const scoreColor = operational.score >= 85 ? 'var(--success)' : operational.score >= 70 ? '#d97706' : 'var(--danger)';
    const sheetChecks = [
        { label: 'Máquina', value: maquinaInfo?.nome || 'Máquina padrão' },
        { label: 'Dimensão', value: chapaData ? `${chapaData.comprimento || 2750} x ${chapaData.largura || 1850} mm` : 'Não informada' },
        { label: 'Refilo', value: `${chapaData?.refilo ?? 10} mm` },
        { label: 'Origem', value: 'X0 Y0 no canto inferior esquerdo' },
        { label: 'Peças', value: `${chapaData?.pecas?.length || 0} peça(s)` },
    ];

    const checklist = [
        { label: 'G-code gerado', ok: Boolean(gcode), detail: filename || 'Arquivo pendente' },
        { label: 'Máquina selecionada', ok: Boolean(maquinaInfo?.nome), detail: maquinaInfo?.nome || 'Padrão do servidor' },
        { label: 'Ferramenta de contorno', ok: Boolean(contorno_tool), detail: contorno_tool ? `${contorno_tool.nome || contorno_tool.codigo} D${contorno_tool.diametro}mm` : 'Não identificada' },
        { label: 'Alertas críticos', ok: criticalAlerts.length === 0, detail: criticalAlerts.length ? `${criticalAlerts.length} pendência(s)` : 'Sem bloqueios' },
        { label: 'Validação operacional', ok: operational.critical.length === 0, detail: operational.warning.length ? `${operational.warning.length} atenção(ões)` : 'Sem risco crítico' },
        { label: 'Movimentos de corte', ok: gcodeCutMoves > 0, detail: `${gcodeCutMoves} movimento(s)` },
    ];

    const workflowSteps = [
        { label: 'Validar', ok: checklist.every(item => item.ok), active: true },
        { label: 'Simular', ok: abaPreview === 'simulador' && gcodeCutMoves > 0, active: abaPreview === 'simulador' },
        { label: 'Baixar', ok: !hasBlockingIssues, active: false },
        { label: 'Máquina', ok: !hasBlockingIssues && Boolean(onSendToMachine), active: false },
    ];

    const handleCopy = () => {
        navigator.clipboard.writeText(gcode).then(() => {}).catch(() => {
            if (textareaRef.current) { textareaRef.current.select(); document.execCommand('copy'); }
        });
    };

    return (
        <Modal title={`Pré-corte CNC — Chapa ${chapaIdx + 1}`} close={onClose} w={1320}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'linear-gradient(180deg, var(--bg-muted), var(--bg-card))',
                    display: 'grid',
                    gap: 10,
                }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            background: criticalAlerts.length ? 'var(--danger)' : '#2563eb',
                            flexShrink: 0,
                        }}>
                            <Cpu size={16} />
                        </div>
                        <div style={{ minWidth: 220, flex: '1 1 300px' }}>
                            <div style={{ fontSize: 16, fontWeight: 850, color: 'var(--text-primary)', lineHeight: 1.15 }}>
                                Conferência antes de cortar
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                Simule a trajetória, confira ferramentas e baixe o arquivo somente após validar a chapa.
                            </div>
                        </div>
                        <span style={{
                            padding: '5px 9px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 850,
                            color: criticalAlerts.length ? 'var(--danger)' : 'var(--success)',
                            background: criticalAlerts.length ? 'var(--danger-bg)' : 'var(--success-bg)',
                            border: `1px solid ${criticalAlerts.length ? 'var(--danger-border)' : 'var(--success-border)'}`,
                            whiteSpace: 'nowrap',
                        }}>
                            {criticalAlerts.length ? `${criticalAlerts.length} alerta(s) crítico(s)` : 'Pronto para revisar'}
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))', gap: 6 }}>
                        {workflowSteps.map((step, idx) => (
                            <div key={step.label} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                padding: '7px 9px',
                                borderRadius: 8,
                                border: `1px solid ${step.ok ? 'var(--success-border)' : step.active ? 'var(--primary)' : 'var(--border)'}`,
                                background: step.ok ? 'var(--success-bg)' : step.active ? 'rgba(37,99,235,0.08)' : 'var(--bg-card)',
                                color: step.ok ? 'var(--success)' : step.active ? 'var(--primary)' : 'var(--text-muted)',
                                minWidth: 0,
                            }}>
                                <span style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 99,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 10,
                                    fontWeight: 900,
                                    border: '1px solid currentColor',
                                    flexShrink: 0,
                                }}>
                                    {step.ok ? <Check size={11} strokeWidth={3} /> : idx + 1}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.label}</span>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 6 }}>
                        {[
                            { lb: 'Score', val: operational.score, color: scoreColor },
                            { lb: 'Tempo', val: formatMinutes(stats.tempo_estimado_min), color: '#e67e22' },
                            { lb: 'Operações', val: stats.total_operacoes ?? 0, color: '#2563eb' },
                            { lb: 'Trocas', val: stats.trocas_ferramenta ?? 0, color: stats.trocas_ferramenta > 3 ? '#f59e0b' : '#16a34a' },
                            { lb: 'Contornos', val: (stats.contornos_peca ?? 0) + (stats.contornos_sobra ?? 0), color: 'var(--primary)' },
                            { lb: 'Corte', val: formatMeters(operational.metrics.distCutM), color: '#0f766e' },
                            { lb: 'Rápido', val: formatMeters(operational.metrics.distRapidM), color: '#be123c' },
                            { lb: 'Economia rota', val: operational.metrics.routeSavedM ? formatMeters(operational.metrics.routeSavedM) : '—', color: '#16a34a' },
                            { lb: 'Linhas', val: lineCount, color: 'var(--text-secondary)' },
                            { lb: 'Arquivo', val: `${sizeKB.toFixed(1)} KB`, color: 'var(--text-secondary)' },
                        ].map(s => (
                            <div key={s.lb} style={{
                                padding: '7px 8px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 7,
                                minWidth: 0,
                            }}>
                                <div style={{ fontSize: 14, fontWeight: 850, color: s.color, fontFamily: 'monospace', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.val}</div>
                                <div style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{s.lb}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                        gap: 6,
                    }}>
                        {checklist.map(item => (
                            <div key={item.label} style={{
                                display: 'grid',
                                gridTemplateColumns: '16px minmax(0, 1fr)',
                                gap: 7,
                                alignItems: 'center',
                                padding: '6px 8px',
                                borderRadius: 7,
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                            }}>
                                {item.ok
                                    ? <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                                    : <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
                                }
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15 }}>{item.label}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{item.detail}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                        <div style={{
                            padding: 9,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-card)',
                            minWidth: 0,
                        }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                                Usinagens no G-code
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                {operationSummary.length > 0 ? operationSummary.map(op => (
                                    <span key={op.key} style={{
                                        padding: '4px 7px',
                                        borderRadius: 999,
                                        border: `1px solid ${op.glow}`,
                                        background: `${op.glow}18`,
                                        color: op.color,
                                        fontSize: 10,
                                        fontWeight: 850,
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {op.label}: {op.count}
                                    </span>
                                )) : (
                                    <span style={{ color: 'var(--danger)', fontSize: 11, fontWeight: 750 }}>
                                        Nenhuma usinagem de corte encontrada no arquivo.
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{
                            padding: 9,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-card)',
                            minWidth: 0,
                        }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                                Chapa e limites
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 5 }}>
                                {sheetChecks.map(item => (
                                    <div key={item.label} style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase' }}>{item.label}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(180px, 0.7fr) minmax(260px, 1.3fr)',
                        gap: 8,
                    }}>
                        <div style={{
                            padding: 10,
                            borderRadius: 8,
                            border: `1px solid ${scoreColor}`,
                            background: operational.score >= 85 ? 'var(--success-bg)' : operational.score >= 70 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                            minWidth: 0,
                        }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Score operacional
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                                <span style={{ fontSize: 30, lineHeight: 1, fontWeight: 900, color: scoreColor, fontFamily: 'monospace' }}>
                                    {operational.score}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 850, color: scoreColor, textTransform: 'uppercase' }}>
                                    {operational.status}
                                </span>
                            </div>
                            <div style={{ height: 7, borderRadius: 999, background: 'rgba(0,0,0,0.10)', overflow: 'hidden', marginTop: 8 }}>
                                <div style={{ width: `${operational.score}%`, height: '100%', background: scoreColor }} />
                            </div>
                        </div>

                        <div style={{
                            padding: 10,
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg-card)',
                            minWidth: 0,
                        }}>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                                Recomendações para economizar tempo e reduzir risco
                            </div>
                            <div style={{ display: 'grid', gap: 4 }}>
                                {operational.recommendations.slice(0, 4).map((rec, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                                        <CheckCircle2 size={13} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
                                        <span>{rec}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {operational.issues.length > 0 && (
                    <div style={{
                        maxHeight: 76,
                        overflowY: 'auto',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: 6,
                    }}>
                        {operational.issues.map((a, i) => {
                            const isCrit = a.severity === 'critical';
                            const isWarn = a.severity === 'warning';
                            return (
                                <div key={i} style={{
                                    fontSize: 11,
                                    padding: '7px 10px',
                                    borderRadius: 7,
                                    background: isCrit ? 'var(--danger-bg)' : isWarn ? 'var(--warning-bg)' : 'var(--success-bg)',
                                    border: `1px solid ${isCrit ? 'var(--danger-border)' : isWarn ? 'var(--warning-border)' : 'var(--success-border)'}`,
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 7,
                                    color: isCrit ? 'var(--danger)' : isWarn ? 'var(--warning)' : 'var(--success)',
                                    fontWeight: isCrit ? 700 : 500,
                                }}>
                                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>{a.msg || a.message || a}</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: 'var(--bg-card)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                        <div style={{ display: 'flex', flex: 1 }}>
                            {[{ id: 'simulador', lb: 'Simulador CNC', icon: Play }, { id: 'codigo', lb: 'Código', icon: FileText }].map(t => {
                                const Icon = t.icon;
                                const active = abaPreview === t.id;
                                return (
                                    <button key={t.id} onClick={() => setAbaPreview(t.id)} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '12px 18px',
                                        fontSize: 12,
                                        fontWeight: active ? 800 : 600,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: active ? 'var(--bg-card)' : 'transparent',
                                        color: active ? 'var(--primary)' : 'var(--text-muted)',
                                        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                                    }}>
                                        <Icon size={14} />
                                        {t.lb}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ padding: '0 14px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {filename || `chapa_${chapaIdx + 1}.nc`}
                        </div>
                    </div>

                    {abaPreview === 'codigo' && (
                        <div style={{ position: 'relative', padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                                    {showFull ? `Todas ${lineCount} linhas` : `Primeiras ${Math.min(80, lineCount)} de ${lineCount} linhas`}
                                </span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {lineCount > 80 && (
                                        <button onClick={() => setShowFull(!showFull)} className={Z.btn2} style={{ fontSize: 11, padding: '4px 10px' }}>
                                            {showFull ? 'Ver menos' : `Ver tudo (${lineCount})`}
                                        </button>
                                    )}
                                    <button onClick={handleCopy} className={Z.btn2} style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Copy size={12} /> Copiar
                                    </button>
                                </div>
                            </div>
                            {/* Syntax highlight por token — estilo IDE */}
                            <div ref={textareaRef} style={{
                                fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                                fontSize: 11,
                                lineHeight: 1.6,
                                background: '#0d1117',
                                padding: '10px 0',
                                borderRadius: 8,
                                maxHeight: '58vh',
                                overflow: 'auto',
                                border: '1px solid #21262d',
                            }}>
                                {previewLines.map((line, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'baseline',
                                        padding: '0 14px 0 0',
                                        minHeight: '1.6em',
                                    }}>
                                        {/* Número de linha */}
                                        <span style={{
                                            color: '#3d4451', minWidth: 44, textAlign: 'right',
                                            marginRight: 14, userSelect: 'none', flexShrink: 0,
                                            fontSize: 10, paddingTop: 1,
                                        }}>
                                            {i + 1}
                                        </span>
                                        {/* Tokens coloridos */}
                                        <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                            {syntaxTokenize(line).map((tok, ti) => (
                                                <span key={ti} style={{
                                                    color: tok.color,
                                                    fontStyle: tok.italic ? 'italic' : 'normal',
                                                    fontWeight: tok.bold ? 700 : 400,
                                                }}>
                                                    {tok.text}
                                                </span>
                                            ))}
                                            {/* Linha em branco = zero height se sem tokens */}
                                            {!line && ' '}
                                        </span>
                                    </div>
                                ))}
                                {!showFull && lineCount > 80 && (
                                    <div style={{ padding: '4px 14px 4px 58px', color: '#64748b', fontSize: 10 }}>
                                        … {lineCount - 80} linhas restantes …
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {abaPreview === 'simulador' && (
                        <CncSim
                            ref={simRef}
                            gcode={gcode}
                            chapa={chapaData}
                            initialTab="2d"
                            height={480}
                            onSimulate={onSimulate}
                        />
                    )}

                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 11, color: hasBlockingIssues ? 'var(--danger)' : 'var(--success)', fontWeight: 800 }}>
                        {hasBlockingIssues ? 'Resolva as pendências antes de liberar para produção.' : 'Arquivo validado para liberação operacional.'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={onClose} className={Z.btn2} style={{ padding: '9px 18px' }}>Fechar</button>
                    <button onClick={() => setAbaPreview('simulador')} className={Z.btn2} style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                        <Play size={14} /> Simular
                    </button>
                    {gcode && loteId && (
                        <button onClick={handleExportDxf} className={Z.btn2}
                            style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}
                            title="Exportar DXF com camadas de usinagem para Aspire/VCarve">
                            <FileDown size={14} /> DXF Aspire
                        </button>
                    )}
                    {gcode && onSendToMachine && (
                        <button onClick={onSendToMachine} disabled={hasBlockingIssues} className={Z.btn2} style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, opacity: hasBlockingIssues ? 0.45 : 1, cursor: hasBlockingIssues ? 'not-allowed' : 'pointer' }}>
                            <Send size={14} /> Enviar p/ Máquina
                        </button>
                    )}
                    {gcode && (
                        <button onClick={hasBlockingIssues ? undefined : onDownload} disabled={hasBlockingIssues} className={Z.btn} title={hasBlockingIssues ? 'Download bloqueado por pendências críticas.' : 'Baixar arquivo validado'} style={{
                            padding: '10px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            background: criticalAlerts.length ? 'var(--danger)' : '#2563eb',
                            fontSize: 13,
                            fontWeight: 800,
                            opacity: hasBlockingIssues ? 0.48 : 1,
                            cursor: hasBlockingIssues ? 'not-allowed' : 'pointer',
                        }}>
                            <Download size={15} /> Baixar G-code
                        </button>
                    )}
                    {!gcode && data.ferramentas_faltando?.length > 0 && (
                        <div style={{ padding: '9px 16px', background: 'var(--danger-bg)', borderRadius: 8, border: '1px solid var(--danger-border)', fontSize: 12, color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlertTriangle size={14} /> Adicione as ferramentas faltantes para gerar o G-code
                        </div>
                    )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

// ─── Build piece outline incorporating open passante millings ──
// Removes waste (refugo) from the piece contour so only the real piece shape is shown.
// Algorithm: walk rectangle CCW, replace waste arc with milling path.
