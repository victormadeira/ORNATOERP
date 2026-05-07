// ══════════════════════════════════════════════════════════════
// PreCutWorkspace — CNC Cockpit de Liberação Pré-Corte
// Dark CAM aesthetic: transport bar, G-code viewer sincronizado,
// checklist de liberação, painel técnico com live position.
// ══════════════════════════════════════════════════════════════
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
    ArrowLeft, Download, Send, Play, Pause, RotateCcw, Cpu,
    AlertTriangle, CheckCircle2, X, ChevronRight,
    Wrench, FlipVertical2, Shield, BarChart2,
    ZapOff, Zap, Maximize2, Tag as TagIcon,
    SkipBack, SkipForward, ChevronLeft, ChevronRight as ChevronRightIcon,
    Activity, Thermometer,
} from 'lucide-react';
import { Spinner } from '../../../../ui';
import { GcodeSimCanvas } from './GcodeSimCanvas.jsx';
import { parseGcodeForSim, getOpCat, OP_CATS } from './parseGcode.js';
import { analyzeGcodeOperational, formatMeters, formatMinutes } from '../../shared/operationalMetrics.js';
import api from '../../../../api';

// ─── Cockpit design tokens (CSS vars might not apply to all elements) ───────
const C = {
    bg:       '#0B0F14',
    panel:    '#11161D',
    panel2:   '#151B23',
    border:   '#1E2733',
    text:     '#E6EDF3',
    muted:    '#7D8794',
    blue:     '#2F81F7',
    blueHi:   '#58A6FF',
    success:  '#2EA043',
    warning:  '#D29922',
    danger:   '#F85149',
    yellow:   '#D29922',
};

// ─── Primitives ──────────────────────────────────────────────────────────────
function StatusPill({ hasBlocking }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6,
            fontSize: 11, fontWeight: 800, letterSpacing: 0.02,
            background: hasBlocking ? 'rgba(248,81,73,0.12)' : 'rgba(46,160,67,0.12)',
            color: hasBlocking ? C.danger : C.success,
            border: `1px solid ${hasBlocking ? 'rgba(248,81,73,0.35)' : 'rgba(46,160,67,0.35)'}`,
        }}>
            {hasBlocking
                ? <><AlertTriangle size={11} /> BLOQUEADO</>
                : <><CheckCircle2 size={11} /> PRONTO PARA CORTAR</>
            }
        </span>
    );
}

function CheckItem({ label, ok, detail }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 9,
            padding: '9px 12px',
            borderBottom: `1px solid ${C.border}`,
        }}>
            <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: ok ? 'rgba(46,160,67,0.14)' : 'rgba(248,81,73,0.12)',
                border: `1px solid ${ok ? 'rgba(46,160,67,0.4)' : 'rgba(248,81,73,0.35)'}`,
                color: ok ? C.success : C.danger,
            }}>
                {ok
                    ? <CheckCircle2 size={10} strokeWidth={2.5} />
                    : <AlertTriangle size={10} strokeWidth={2.5} />
                }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{label}</div>
                {detail && (
                    <div style={{ fontSize: 10.5, color: ok ? C.muted : C.danger, marginTop: 2, lineHeight: 1.3 }}>
                        {detail}
                    </div>
                )}
            </div>
        </div>
    );
}

function SectionHead({ label, icon: Icon }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 12px', borderBottom: `1px solid ${C.border}`,
            background: C.bg,
            fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.09em', color: C.muted,
        }}>
            {Icon && <Icon size={10} />} {label}
        </div>
    );
}

// ── Transport button ─────────────────────────────────────────────────────────
function TBtn({ onClick, disabled, title, children, primary, wide }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: wide ? 6 : 0,
                padding: wide ? '0 14px' : '0',
                width: wide ? 'auto' : 32, height: 32,
                borderRadius: 6,
                border: primary ? 'none' : `1px solid ${C.border}`,
                background: primary ? C.blue : C.panel2,
                color: disabled ? C.muted : primary ? '#fff' : C.text,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                fontSize: 11.5, fontWeight: 700,
                fontFamily: '"JetBrains Mono", monospace',
                flexShrink: 0,
                transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => {
                if (disabled) return;
                e.currentTarget.style.background = primary ? '#3d8ef8' : C.border;
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = primary ? C.blue : C.panel2;
            }}
        >
            {children}
        </button>
    );
}

// ── Live metric tile ──────────────────────────────────────────────────────────
function MetricTile({ label, value, color }) {
    return (
        <div style={{
            padding: '7px 9px', borderRadius: 6,
            background: C.bg, border: `1px solid ${C.border}`,
        }}>
            <div style={{
                fontSize: 14, fontWeight: 700, color: color || C.text,
                fontFamily: '"JetBrains Mono", monospace',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            }}>{value}</div>
            <div style={{
                fontSize: 9, color: C.muted, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3,
            }}>{label}</div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
export function PreCutWorkspace({ data, loteAtual, onVoltar, notify }) {
    const {
        gcode = '', filename, stats = {}, alertas = [],
        chapaIdx = 0, contorno_tool, maquina: maquinaInfo = null,
        chapa: chapaData = null,
        printStatusMap = {}, pecasPersistentIds = [],
    } = data || {};

    // ── Playback state (single source of truth) ──────────────────────────────
    const [simPlaying, setSimPlaying]   = useState(false);
    const [simSpeed,   setSimSpeed]     = useState(1);
    const [curMove,    setCurMove]      = useState(-1);
    const [totalMoves, setTotalMoves]   = useState(0);
    const [heatmapMode, setHeatmapMode] = useState(false);
    const [curSimTime,  setCurSimTime]  = useState(0);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [faceAtiva,    setFaceAtiva]    = useState('A');
    const [sending,      setSending]      = useState(false);
    const [sidebarTab,   setSidebarTab]   = useState('gcode'); // default: G-code highlight visível
    const [currentLineIdx, setCurrentLineIdx] = useState(-1);

    const simRef         = useRef(null);
    const gcodeViewerRef = useRef(null);
    const currentLineRef = useRef(null);
    const scrollTimerRef = useRef(null); // debounce scroll during fast playback

    // ── Sync total moves once canvas mounts (or gcode changes) ───────────────
    useEffect(() => {
        const t = simRef.current?.getTotalMoves?.() ?? 0;
        setTotalMoves(t);
    }, [gcode]);

    // ── Move change callback (canvas → parent) ───────────────────────────────
    const handleMoveChange = useCallback((moveIdx, lineIdx, time) => {
        setCurMove(moveIdx);
        setCurrentLineIdx(lineIdx ?? -1);
        if (time !== undefined) setCurSimTime(time);
        // Update total lazily
        setTotalMoves(prev => {
            const t = simRef.current?.getTotalMoves?.() ?? prev;
            return t;
        });
    }, []);

    // ── G-code analysis ───────────────────────────────────────────────────────
    const parsedPreview = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const gcodeCutMoves = parsedPreview.moves.filter(m => m.type !== 'G0').length;
    const operational   = useMemo(() => analyzeGcodeOperational({
        gcode, chapa: chapaData, stats, alertas, parsed: parsedPreview,
    }), [gcode, chapaData, stats, alertas, parsedPreview]);

    const operationSummary = useMemo(() => {
        const counts = new Map();
        for (const m of parsedPreview.moves) {
            if (m.type === 'G0') continue;
            const cat = getOpCat(m.op);
            counts.set(cat.key, { ...cat, count: (counts.get(cat.key)?.count || 0) + 1 });
        }
        return OP_CATS.map(cat => counts.get(cat.key)).filter(Boolean);
    }, [parsedPreview.moves]);

    const lines  = (gcode || '').split('\n');
    const sizeKB = new Blob([gcode]).size / 1024;

    // ── Estimated total simulation time (mirrors parse3D logic) ──────────────
    const totalSimTime = useMemo(() => {
        const RAPID = 20000;
        let acc = 0;
        for (const m of parsedPreview.moves) {
            const dist = Math.hypot(m.x2 - m.x1, m.y2 - m.y1, m.z2 - m.z1);
            const f = m.type === 'G0' ? RAPID : (m.feed || 1000);
            acc += dist / (f / 60);
        }
        return acc;
    }, [parsedPreview.moves]);

    const fmtSimTime = (s) => {
        if (!s || s <= 0) return '0:00.0';
        const m = Math.floor(s / 60);
        const sec = (s - m * 60).toFixed(1).padStart(4, '0');
        return `${m}:${sec}`;
    };

    const criticalAlerts = alertas.filter(a => {
        const t = String(a?.tipo || '').toLowerCase();
        return t.includes('erro') || t.includes('critico');
    });

    // ── Etiqueta status ───────────────────────────────────────────────────────
    const totalPecasChapa = pecasPersistentIds.length;
    const impressasCount  = pecasPersistentIds.filter(pid => printStatusMap[pid]).length;
    const etiquetasOk     = totalPecasChapa === 0 || impressasCount === totalPecasChapa;

    // ── Checklist ─────────────────────────────────────────────────────────────
    const checklist = [
        { label: 'G-code gerado',          ok: Boolean(gcode),                    detail: filename || 'Arquivo pendente' },
        { label: 'Máquina selecionada',     ok: Boolean(maquinaInfo?.nome),        detail: maquinaInfo?.nome || 'Padrão do servidor' },
        { label: 'Ferramenta de contorno',  ok: Boolean(contorno_tool),            detail: contorno_tool ? `${contorno_tool.nome || contorno_tool.codigo} Ø${contorno_tool.diametro}mm` : 'Não identificada' },
        { label: 'Alertas críticos',        ok: criticalAlerts.length === 0,       detail: criticalAlerts.length ? `${criticalAlerts.length} pendência(s)` : 'Sem bloqueios' },
        { label: 'Validação operacional',   ok: operational.critical.length === 0, detail: operational.warning.length ? `${operational.warning.length} atenção(ões)` : 'Sem risco crítico' },
        { label: 'Movimentos de corte',     ok: gcodeCutMoves > 0,                detail: `${gcodeCutMoves} movimento(s)` },
        ...(totalPecasChapa > 0 ? [{
            label: 'Etiquetas impressas',
            ok: etiquetasOk,
            detail: etiquetasOk
                ? `${impressasCount}/${totalPecasChapa} etiqueta(s) confirmadas`
                : `${impressasCount}/${totalPecasChapa} — imprima antes de cortar`,
        }] : []),
    ];

    const hasBlocking  = operational.critical.length > 0 || !gcode || gcodeCutMoves === 0;
    const scoreColor   = operational.score >= 85 ? C.success : operational.score >= 70 ? C.warning : C.danger;

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleDownload = useCallback(() => {
        if (!gcode) return;
        const blob = new Blob([gcode], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = filename || `chapa_${chapaIdx + 1}.nc`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify?.(`G-code baixado: ${filename || `chapa_${chapaIdx + 1}.nc`}`, 'success');
    }, [gcode, filename, chapaIdx, notify]);

    const handleSendToMachine = useCallback(async () => {
        if (!loteAtual?.id || hasBlocking) return;
        setSending(true);
        try {
            await api.post(`/cnc/enviar-gcode/${loteAtual.id}/chapa/${chapaIdx}`, {});
            notify?.('G-code enviado para a máquina!', 'success');
            onVoltar?.();
        } catch (err) {
            notify?.(err.error || 'Erro ao enviar para a máquina', 'error');
        } finally { setSending(false); }
    }, [loteAtual, chapaIdx, hasBlocking, notify, onVoltar]);

    // ── Transport controls ────────────────────────────────────────────────────
    const handlePlay = useCallback(() => {
        if (curMove >= (parsedPreview.moves.length - 1)) {
            simRef.current?.reset?.();
        }
        setSimPlaying(true);
    }, [curMove, parsedPreview.moves.length]);

    const handlePause = useCallback(() => setSimPlaying(false), []);

    const handleReset = useCallback(() => {
        setSimPlaying(false);
        simRef.current?.reset?.();
    }, []);

    const handleStep = useCallback((dir) => {
        setSimPlaying(false);
        const next = Math.max(-1, Math.min((parsedPreview.moves.length - 1), (curMove < 0 ? 0 : curMove) + dir));
        simRef.current?.seekTo?.(next);
    }, [curMove, parsedPreview.moves.length]);

    const handleSeekFirst = useCallback(() => {
        setSimPlaying(false); simRef.current?.seekTo?.(0);
    }, []);

    const handleSeekLast = useCallback(() => {
        setSimPlaying(false); simRef.current?.seekTo?.(parsedPreview.moves.length - 1);
    }, [parsedPreview.moves.length]);

    const handleSlider = useCallback((e) => {
        setSimPlaying(false);
        simRef.current?.seekTo?.(parseInt(e.target.value));
    }, []);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    simPlaying ? handlePause() : handlePlay();
                    break;
                case 'ArrowRight':
                    e.preventDefault(); handleStep(1); break;
                case 'ArrowLeft':
                    e.preventDefault(); handleStep(-1); break;
                case 'Home':
                    e.preventDefault(); handleSeekFirst(); break;
                case 'End':
                    e.preventDefault(); handleSeekLast(); break;
                case '1': setSimSpeed(1); break;
                case '2': setSimSpeed(2); break;
                case '3': setSimSpeed(5); break;
                case '4': setSimSpeed(10); break;
                case '5': setSimSpeed(20); break;
                default: break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [simPlaying, handlePlay, handlePause, handleStep, handleSeekFirst, handleSeekLast]);

    // ── Auto-scroll G-code viewer — debounced so fast playback doesn't stutter ─
    useEffect(() => {
        if (sidebarTab !== 'gcode' || !currentLineRef.current) return;
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
            currentLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
    }, [currentLineIdx, sidebarTab]);

    // ── Live position from current move ──────────────────────────────────────
    const liveMove = curMove >= 0 ? parsedPreview.moves[curMove] : null;
    const liveFeed = liveMove?.feed ?? 0;

    // ── G-code syntax highlight ───────────────────────────────────────────────
    const gcodeTokenize = useCallback((lineStr) => {
        if (!lineStr?.trim()) return <span style={{ color: C.muted }}>{lineStr || ' '}</span>;
        if (/^\s*[;(]/.test(lineStr)) return <span style={{ color: C.muted, fontStyle: 'italic' }}>{lineStr}</span>;
        const parts = [];
        let rest = lineStr;
        let comment = '';
        const ci = rest.indexOf('(');
        if (ci !== -1) { comment = rest.slice(ci); rest = rest.slice(0, ci); }
        const si = rest.indexOf(';');
        if (si !== -1) { comment = rest.slice(si) + comment; rest = rest.slice(0, si); }
        rest.split(/(\s+)/).forEach((tok, i) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { parts.push(<span key={i}>{tok}</span>); return; }
            if (/^G0+0?\b/i.test(tok) || /^G0(?!\d)/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#D29922', fontWeight: 700 }}>{tok}</span>);
            } else if (/^G0*1\b/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#2EA043', fontWeight: 700 }}>{tok}</span>);
            } else if (/^G\d+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#58A6FF', fontWeight: 600 }}>{tok}</span>);
            } else if (/^M\d+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: C.muted, fontWeight: 600 }}>{tok}</span>);
            } else if (/^T\d+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#79C0FF', fontWeight: 600 }}>{tok}</span>);
            } else if (/^[XYZIJKR]-?[\d.]+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#79C0FF' }}>{tok}</span>);
            } else if (/^[FS]-?[\d.]+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#C9D1D9' }}>{tok}</span>);
            } else {
                parts.push(<span key={i} style={{ color: '#8B949E' }}>{tok}</span>);
            }
        });
        if (comment) parts.push(<span key="cmt" style={{ color: C.muted, fontStyle: 'italic' }}>{comment}</span>);
        return parts;
    }, []);

    // ── Total move count (sync from canvas ref on gcode change) ──────────────
    const totalFromParsed = parsedPreview.moves.length;
    const displayTotal = totalMoves || totalFromParsed;

    // ════════════════════════════════════════════════════════════════════════
    // Layout
    // ════════════════════════════════════════════════════════════════════════
    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: 'calc(100vh - 56px)',
            background: C.bg,
            overflow: 'hidden',
            fontFamily: 'var(--font-sans)',
        }}>

            {/* ══ TOPBAR ════════════════════════════════════════════════════ */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0 16px', height: 50, flexShrink: 0,
                background: C.panel,
                borderBottom: `1px solid ${C.border}`,
            }}>
                <button
                    onClick={onVoltar}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px 5px 8px', borderRadius: 6,
                        background: C.panel2, border: `1px solid ${C.border}`,
                        color: C.muted, cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.text; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
                >
                    <ArrowLeft size={13} strokeWidth={2.5} /> Plano de Corte
                </button>

                <div style={{ width: 1, height: 22, background: C.border }} />

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        background: hasBlocking ? 'rgba(248,81,73,0.15)' : C.blue,
                        border: hasBlocking ? '1px solid rgba(248,81,73,0.4)' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: hasBlocking ? C.danger : '#fff',
                    }}>
                        <Cpu size={13} />
                    </div>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>
                            {loteAtual?.nome || `Lote #${loteAtual?.id}`}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted, lineHeight: 1, fontFamily: '"JetBrains Mono", monospace' }}>
                            Chapa {chapaIdx + 1}
                            {chapaData && ` · ${chapaData.comprimento || 2750}×${chapaData.largura || 1850}mm`}
                            {maquinaInfo?.nome && ` · ${maquinaInfo.nome}`}
                        </div>
                    </div>
                </div>

                <StatusPill hasBlocking={hasBlocking} />
            </div>

            {/* ══ CORPO: 3 COLUNAS ══════════════════════════════════════════ */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

                {/* ── Coluna esquerda: Checklist ──────────────────────────── */}
                <div style={{
                    width: 228, flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                    background: C.panel,
                    borderRight: `1px solid ${C.border}`,
                    overflowY: 'auto',
                }}>
                    <SectionHead label="Checklist de liberação" icon={Shield} />

                    <div style={{ flex: 1 }}>
                        {checklist.map(item => (
                            <CheckItem key={item.label} {...item} />
                        ))}
                    </div>

                    {/* Gate de liberação */}
                    <div style={{
                        padding: '10px 12px',
                        borderTop: `1px solid ${C.border}`,
                        background: hasBlocking ? 'rgba(248,81,73,0.07)' : 'rgba(46,160,67,0.07)',
                    }}>
                        <div style={{
                            fontSize: 11, fontWeight: 700,
                            color: hasBlocking ? C.danger : C.success,
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
                        }}>
                            {hasBlocking
                                ? <><ZapOff size={11} /> Corte bloqueado</>
                                : <><Zap size={11} /> Liberado para cortar</>
                            }
                        </div>
                        <div style={{ fontSize: 10, color: hasBlocking ? C.danger : C.success, lineHeight: 1.4 }}>
                            {hasBlocking
                                ? checklist.filter(c => !c.ok).map(c => c.label).join(' · ')
                                : 'Todos os itens verificados.'
                            }
                        </div>
                    </div>

                    {/* Score operacional */}
                    <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: C.muted, marginBottom: 5 }}>
                            Score operacional
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                            <span style={{ fontSize: 26, fontWeight: 700, color: scoreColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1, fontFamily: '"JetBrains Mono", monospace' }}>
                                {operational.score}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, textTransform: 'uppercase' }}>
                                {operational.status}
                            </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: C.panel2, overflow: 'hidden' }}>
                            <div style={{ width: `${operational.score}%`, height: '100%', background: scoreColor, borderRadius: 99, transition: 'width 0.5s' }} />
                        </div>
                    </div>
                </div>

                {/* ── Centro: Simulador ───────────────────────────────────── */}
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    minWidth: 0, background: C.bg, overflow: 'hidden',
                }}>
                    {/* Slim info bar above canvas */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '5px 12px', borderBottom: `1px solid ${C.border}`,
                        background: C.panel, flexShrink: 0, height: 32,
                    }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Simulador CNC
                        </span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: C.muted, fontFamily: '"JetBrains Mono", monospace' }}>
                            {filename || `chapa_${chapaIdx + 1}.nc`}
                        </span>
                        <span style={{ fontSize: 10, color: C.muted, fontFamily: '"JetBrains Mono", monospace' }}>
                            {lines.length} ln · {sizeKB.toFixed(1)} KB
                        </span>
                        {/* Heatmap toggle */}
                        <button
                            onClick={() => setHeatmapMode(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '2px 8px', borderRadius: 4, border: `1px solid ${heatmapMode ? C.blue : C.border}`,
                                background: heatmapMode ? 'rgba(47,129,247,0.12)' : C.panel2,
                                color: heatmapMode ? C.blueHi : C.muted,
                                cursor: 'pointer', fontSize: 10, fontWeight: 700,
                            }}
                            title="Heatmap de velocidade de avanço"
                        >
                            <Thermometer size={10} /> Feed
                        </button>
                    </div>

                    {/* Canvas */}
                    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                        {gcode ? (
                            <GcodeSimCanvas
                                ref={simRef}
                                gcode={gcode}
                                chapa={chapaData}
                                playing={simPlaying}
                                speed={simSpeed}
                                onPlayEnd={() => setSimPlaying(false)}
                                onMoveChange={handleMoveChange}
                                heatmapMode={heatmapMode}
                            />
                        ) : (
                            <div style={{
                                flex: 1, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                gap: 10, color: C.muted,
                            }}>
                                <ZapOff size={32} style={{ opacity: 0.4 }} />
                                <span style={{ fontSize: 13, fontWeight: 600 }}>G-code não gerado</span>
                                <span style={{ fontSize: 11, opacity: 0.7 }}>Gere o G-code no plano de corte antes de revisar</span>
                            </div>
                        )}
                    </div>

                    {/* ── TRANSPORT BAR ──────────────────────────────────── */}
                    {gcode && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '0 12px', height: 50, flexShrink: 0,
                            background: C.panel,
                            borderTop: `1px solid ${C.border}`,
                        }}>
                            {/* Transport buttons */}
                            <TBtn onClick={handleSeekFirst} title="Início (Home)">
                                <SkipBack size={13} />
                            </TBtn>
                            <TBtn onClick={() => handleStep(-1)} title="Recuar (←)">
                                <ChevronLeft size={14} />
                            </TBtn>

                            {simPlaying
                                ? <TBtn onClick={handlePause} primary wide title="Pausar (Espaço)">
                                    <Pause size={13} /> Pausar
                                  </TBtn>
                                : <TBtn onClick={handlePlay} primary wide title="Simular (Espaço)">
                                    <Play size={13} /> Simular
                                  </TBtn>
                            }

                            <TBtn onClick={() => handleStep(1)} title="Avançar (→)">
                                <ChevronRightIcon size={14} />
                            </TBtn>
                            <TBtn onClick={handleSeekLast} title="Fim (End)">
                                <SkipForward size={13} />
                            </TBtn>
                            <TBtn onClick={handleReset} title="Reiniciar">
                                <RotateCcw size={12} />
                            </TBtn>

                            {/* Slider */}
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0, displayTotal - 1)}
                                value={curMove < 0 ? 0 : curMove}
                                onChange={handleSlider}
                                style={{ flex: 1, height: 4, accentColor: C.blue, cursor: 'pointer', minWidth: 60 }}
                            />

                            {/* Speed chips — 0.25× to 200× */}
                            <div style={{ display: 'flex', gap: 2 }}>
                                {[0.25, 0.5, 1, 2, 5, 10, 50, 200].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSimSpeed(s)}
                                        style={{
                                            padding: '3px 6px', borderRadius: 4,
                                            border: `1px solid ${simSpeed === s ? C.blue : C.border}`,
                                            background: simSpeed === s ? 'rgba(47,129,247,0.14)' : C.bg,
                                            color: simSpeed === s ? C.blueHi : C.muted,
                                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                            fontFamily: '"JetBrains Mono", monospace',
                                        }}
                                    >{s}×</button>
                                ))}
                            </div>

                            {/* Time display  0:32.1 / 1:45.0 */}
                            <span style={{
                                fontSize: 11,
                                color: curSimTime > 0 ? C.blueHi : C.muted,
                                fontFamily: '"JetBrains Mono", monospace',
                                fontVariantNumeric: 'tabular-nums',
                                minWidth: 108, textAlign: 'right',
                                whiteSpace: 'nowrap',
                            }}>
                                {fmtSimTime(curSimTime)} / {fmtSimTime(totalSimTime)}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Coluna direita: Sidebar técnica ─────────────────────── */}
                <div style={{
                    width: 272, flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                    background: C.panel,
                    borderLeft: `1px solid ${C.border}`,
                    overflow: 'hidden',
                }}>
                    {/* Tab switcher */}
                    <div style={{
                        display: 'flex', borderBottom: `1px solid ${C.border}`,
                        background: C.bg, flexShrink: 0,
                    }}>
                        {[
                            { id: 'dados',  label: 'Dados' },
                            { id: 'gcode',  label: 'G-code' },
                        ].map(t => (
                            <button key={t.id} onClick={() => setSidebarTab(t.id)} style={{
                                flex: 1, padding: '8px 0',
                                background: 'none', border: 'none',
                                borderBottom: sidebarTab === t.id ? `2px solid ${C.blue}` : '2px solid transparent',
                                color: sidebarTab === t.id ? C.text : C.muted,
                                fontSize: 11.5, fontWeight: sidebarTab === t.id ? 700 : 500,
                                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                            }}>
                                {t.label}
                                {/* dot animado quando simulando e na tab gcode */}
                                {t.id === 'gcode' && simPlaying && (
                                    <span style={{
                                        width: 5, height: 5, borderRadius: '50%',
                                        background: C.success,
                                        display: 'inline-block',
                                        animation: 'pulse 1s infinite',
                                    }} />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ══ Tab: G-code viewer ══════════════════════════════ */}
                    {sidebarTab === 'gcode' && (
                        <div ref={gcodeViewerRef} style={{
                            flex: 1, overflowY: 'auto', overflowX: 'auto',
                            background: '#0D1117',
                            fontFamily: '"JetBrains Mono","Fira Code",Consolas,monospace',
                            fontSize: 11,
                        }}>
                            {(parsedPreview.rawLines || []).map((rawLine, li) => {
                                const isCurrent = li === currentLineIdx;
                                const isExecuted = currentLineIdx >= 0 && li < currentLineIdx;
                                const moveIdx = parsedPreview.lineToMoveIdx?.[li];
                                const isClickable = moveIdx !== undefined;
                                return (
                                    <div
                                        key={li}
                                        ref={isCurrent ? currentLineRef : null}
                                        onClick={() => {
                                            if (isClickable) { setSimPlaying(false); simRef.current?.seekTo?.(moveIdx); }
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start',
                                            padding: '1px 8px 1px 0',
                                            borderLeft: isCurrent
                                                ? `3px solid ${C.blueHi}`
                                                : '3px solid transparent',
                                            background: isCurrent
                                                ? 'rgba(47,129,247,0.16)'
                                                : 'transparent',
                                            opacity: isExecuted ? 0.28 : 1,
                                            cursor: isClickable ? 'pointer' : 'default',
                                            minHeight: 18,
                                            transition: 'background 0.08s',
                                        }}
                                        onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'rgba(88,166,255,0.06)'; }}
                                        onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <span style={{
                                            minWidth: 36, textAlign: 'right',
                                            color: isCurrent ? C.blueHi : '#484F58',
                                            fontSize: 10, paddingRight: 8, flexShrink: 0,
                                            userSelect: 'none', lineHeight: '18px',
                                            fontWeight: isCurrent ? 700 : 400,
                                        }}>
                                            {li + 1}
                                        </span>
                                        <span style={{
                                            flex: 1, lineHeight: '18px', whiteSpace: 'pre',
                                            color: isCurrent ? '#e6edf3' : '#8B949E', // linha atual fica branca
                                        }}>
                                            {gcodeTokenize(rawLine)}
                                        </span>
                                    </div>
                                );
                            })}
                            {!parsedPreview.rawLines?.length && (
                                <div style={{ padding: 24, color: C.muted, fontSize: 12, textAlign: 'center' }}>
                                    G-code não disponível
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══ Tab: Dados técnicos ══════════════════════════════ */}
                    {sidebarTab === 'dados' && (
                        <div style={{ flex: 1, overflowY: 'auto' }}>

                        {/* Live position — só aparece quando simulando */}
                        {curMove >= 0 && liveMove && (
                            <>
                                <SectionHead label="Posição atual" icon={Activity} />
                                <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                                        <MetricTile label="X" value={liveMove.x2.toFixed(1)} color={C.blueHi} />
                                        <MetricTile label="Y" value={liveMove.y2.toFixed(1)} color={C.blueHi} />
                                        <MetricTile label="Z" value={liveMove.z2.toFixed(1)} color={C.blueHi} />
                                    </div>
                                    {liveFeed > 0 && (
                                        <div style={{ marginTop: 5 }}>
                                            <MetricTile label="Feed mm/min" value={liveFeed.toFixed(0)} color={C.warning} />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Face A/B toggle */}
                        <SectionHead label="Face da peça" icon={FlipVertical2} />
                        <div style={{ padding: '9px 12px', borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {['A', 'B'].map(f => (
                                    <button key={f}
                                        onClick={() => setFaceAtiva(f)}
                                        style={{
                                            flex: 1, padding: '6px 0', borderRadius: 6,
                                            border: `1px solid ${faceAtiva === f ? C.blue : C.border}`,
                                            cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                            fontFamily: 'var(--font-sans)',
                                            background: faceAtiva === f ? 'rgba(47,129,247,0.14)' : C.bg,
                                            color: faceAtiva === f ? C.blueHi : C.muted,
                                        }}
                                    >
                                        Face {f}
                                    </button>
                                ))}
                            </div>
                            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4, marginTop: 6 }}>
                                Face ativa: <strong style={{ color: C.text }}>{faceAtiva}</strong>
                                {' · '}G-code refere-se à face {faceAtiva}
                            </div>
                        </div>

                        {/* Estatísticas */}
                        <SectionHead label="Estatísticas" icon={BarChart2} />
                        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                                {[
                                    { lb: 'Tempo est.',    val: formatMinutes(stats.tempo_estimado_min), color: C.text },
                                    { lb: 'Operações',     val: stats.total_operacoes ?? 0,              color: C.text },
                                    { lb: 'Trocas ferr.',  val: stats.trocas_ferramenta ?? 0,            color: stats.trocas_ferramenta > 3 ? C.warning : C.text },
                                    { lb: 'Corte total',   val: formatMeters(operational.metrics?.distCutM), color: C.text },
                                    { lb: 'Rápido',        val: formatMeters(operational.metrics?.distRapidM), color: C.muted },
                                    { lb: 'Linhas G-code', val: lines.length,                             color: C.muted },
                                ].map(s => <MetricTile key={s.lb} label={s.lb} value={s.val} color={s.color} />)}
                            </div>
                        </div>

                        {/* Usinagens */}
                        <SectionHead label="Usinagens no G-code" icon={Wrench} />
                        <div style={{ padding: '9px 12px', borderBottom: `1px solid ${C.border}` }}>
                            {operationSummary.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {operationSummary.map(op => (
                                        <span key={op.key} style={{
                                            padding: '3px 8px', borderRadius: 4,
                                            border: `1px solid ${op.color}28`,
                                            background: `${op.color}12`,
                                            color: op.color,
                                            fontSize: 10.5, fontWeight: 700,
                                            fontFamily: '"JetBrains Mono", monospace',
                                        }}>
                                            {op.label} <span style={{ opacity: 0.65 }}>{op.count}</span>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, color: C.danger, fontWeight: 600 }}>
                                    Nenhuma usinagem de corte.
                                </div>
                            )}
                        </div>

                        {/* Alertas */}
                        {operational.issues.length > 0 && (
                            <>
                                <SectionHead label={`Alertas (${operational.issues.length})`} icon={AlertTriangle} />
                                <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {operational.issues.map((a, i) => {
                                        const isCrit = a.severity === 'critical';
                                        return (
                                            <div key={i} style={{
                                                padding: '6px 10px', borderRadius: 5,
                                                background: isCrit ? 'rgba(248,81,73,0.09)' : 'rgba(210,153,34,0.09)',
                                                border: `1px solid ${isCrit ? 'rgba(248,81,73,0.30)' : 'rgba(210,153,34,0.30)'}`,
                                                color: isCrit ? C.danger : C.warning,
                                                fontSize: 11, fontWeight: 500, lineHeight: 1.35,
                                                display: 'flex', alignItems: 'flex-start', gap: 6,
                                            }}>
                                                <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                                                {a.msg || a.message || String(a)}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Recomendações */}
                        {operational.recommendations?.length > 0 && (
                            <>
                                <SectionHead label="Recomendações" icon={Zap} />
                                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {operational.recommendations.slice(0, 4).map((rec, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 6,
                                            fontSize: 11, color: C.muted, lineHeight: 1.35,
                                        }}>
                                            <CheckCircle2 size={11} style={{ color: C.success, flexShrink: 0, marginTop: 1 }} />
                                            {rec}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        </div>
                    )}
                </div>
            </div>

            {/* ══ FOOTER FIXO ═══════════════════════════════════════════════ */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 20px', height: 54, flexShrink: 0,
                background: C.panel,
                borderTop: `1px solid ${C.border}`,
            }}>
                <button
                    onClick={onVoltar}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '0 14px', height: 34, borderRadius: 6,
                        background: C.panel2, border: `1px solid ${C.border}`,
                        color: C.muted, cursor: 'pointer',
                        fontSize: 12, fontWeight: 600,
                    }}
                >
                    <ArrowLeft size={13} /> Voltar ao plano
                </button>

                <div style={{ flex: 1 }} />

                {filename && (
                    <span style={{ fontSize: 10.5, color: C.muted, fontFamily: '"JetBrains Mono", monospace' }}>
                        {filename}
                    </span>
                )}

                <button
                    onClick={handleDownload}
                    disabled={!gcode}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '0 14px', height: 34, borderRadius: 6,
                        background: C.panel2, border: `1px solid ${C.border}`,
                        color: gcode ? C.text : C.muted,
                        cursor: gcode ? 'pointer' : 'not-allowed',
                        opacity: gcode ? 1 : 0.5,
                        fontSize: 12, fontWeight: 600,
                    }}
                >
                    <Download size={13} /> Baixar G-code
                </button>

                <button
                    onClick={handleSendToMachine}
                    disabled={hasBlocking || sending}
                    title={hasBlocking ? 'Resolva os bloqueios antes de enviar' : 'Enviar G-code para a fila da máquina'}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '0 20px', height: 36, borderRadius: 6,
                        fontSize: 13, fontWeight: 700,
                        border: 'none',
                        cursor: hasBlocking ? 'not-allowed' : 'pointer',
                        background: hasBlocking ? C.panel2 : C.success,
                        color: hasBlocking ? C.muted : '#fff',
                        opacity: hasBlocking ? 0.55 : 1,
                        boxShadow: hasBlocking ? 'none' : '0 1px 4px rgba(46,160,67,0.30)',
                    }}
                >
                    {sending ? <Spinner size={14} /> : <Send size={14} />}
                    Enviar para CNC
                </button>
            </div>
        </div>
    );
}
