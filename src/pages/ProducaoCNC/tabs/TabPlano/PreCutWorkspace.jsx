// ══════════════════════════════════════════════════════════════
// PreCutWorkspace — Cabine de comando pré-corte
// Layout fullscreen: topbar + checklist | simulador | sidebar + footer
// Substitui GcodePreviewModal (modal) por tela operacional dedicada
// ══════════════════════════════════════════════════════════════

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
    ArrowLeft, Download, Send, Play, Pause, RotateCcw, Cpu,
    AlertTriangle, CheckCircle2, Circle, X, ChevronDown, ChevronUp,
    FileText, Package, Wrench, FlipVertical2, Layers, Shield,
    Clock, BarChart2, ZapOff, Zap, Box, Maximize2, Minimize2,
    Tag as TagIcon,
} from 'lucide-react';
import { Spinner } from '../../../../ui';
import { GcodeSimCanvas } from './GcodeSimCanvas.jsx';
import { parseGcodeForSim, getOpCat, OP_CATS } from './parseGcode.js';
import { analyzeGcodeOperational, formatMeters, formatMinutes } from '../../shared/operationalMetrics.js';
import api from '../../../../api';

// ─── Helpers ────────────────────────────────────────────────
function StatusPill({ hasBlocking }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6,
            fontSize: 11, fontWeight: 800, letterSpacing: 0.02,
            background: hasBlocking ? 'var(--danger-bg)' : 'var(--success-bg)',
            color: hasBlocking ? 'var(--danger)' : 'var(--success)',
            border: `1px solid ${hasBlocking ? 'var(--danger-border)' : 'var(--success-border)'}`,
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
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
        }}>
            <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: ok ? 'var(--success-bg)' : 'var(--danger-bg)',
                border: `1px solid ${ok ? 'var(--success-border)' : 'var(--danger-border)'}`,
                color: ok ? 'var(--success)' : 'var(--danger)',
            }}>
                {ok ? <CheckCircle2 size={11} strokeWidth={2.5} /> : <AlertTriangle size={11} strokeWidth={2.5} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>{label}</div>
                {detail && (
                    <div style={{ fontSize: 10.5, color: ok ? 'var(--text-muted)' : 'var(--danger)', marginTop: 2, lineHeight: 1.3 }}>
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
            padding: '9px 12px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-subtle)',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-muted)',
        }}>
            {Icon && <Icon size={11} />} {label}
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

    const [simPlaying, setSimPlaying] = useState(false);
    const [simSpeed, setSimSpeed] = useState(1);
    const [faceAtiva, setFaceAtiva] = useState('A');
    const [sending, setSending] = useState(false);
    const [sidebarTab, setSidebarTab] = useState('dados'); // 'dados' | 'gcode'
    const [currentMoveIdx, setCurrentMoveIdx] = useState(-1);
    const simRef = useRef(null);
    const gcodeViewerRef = useRef(null);
    const currentLineRef = useRef(null);

    // Callback do canvas: sincroniza move atual → linha do G-code
    const handleMoveChange = useCallback((moveIdx) => {
        setCurrentMoveIdx(moveIdx);
    }, []);

    // ── Análise do G-code ────────────────────────────────────
    const parsedPreview = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const gcodeCutMoves = parsedPreview.moves.filter(m => m.type !== 'G0').length;
    const operational = useMemo(() => analyzeGcodeOperational({
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

    const lines = (gcode || '').split('\n');
    const sizeKB = new Blob([gcode]).size / 1024;

    const criticalAlerts = alertas.filter(a => {
        const t = String(a?.tipo || '').toLowerCase();
        return t.includes('erro') || t.includes('critico');
    });

    // Etiqueta status para esta chapa
    const totalPecasChapa = pecasPersistentIds.length;
    const impressasCount = pecasPersistentIds.filter(pid => printStatusMap[pid]).length;
    const etiquetasOk = totalPecasChapa === 0 || impressasCount === totalPecasChapa;

    const checklist = [
        { label: 'G-code gerado',          ok: Boolean(gcode),               detail: filename || 'Arquivo pendente' },
        { label: 'Máquina selecionada',     ok: Boolean(maquinaInfo?.nome),   detail: maquinaInfo?.nome || 'Padrão do servidor' },
        { label: 'Ferramenta de contorno',  ok: Boolean(contorno_tool),        detail: contorno_tool ? `${contorno_tool.nome || contorno_tool.codigo} Ø${contorno_tool.diametro}mm` : 'Não identificada' },
        { label: 'Alertas críticos',        ok: criticalAlerts.length === 0,  detail: criticalAlerts.length ? `${criticalAlerts.length} pendência(s)` : 'Sem bloqueios' },
        { label: 'Validação operacional',   ok: operational.critical.length === 0, detail: operational.warning.length ? `${operational.warning.length} atenção(ões)` : 'Sem risco crítico' },
        { label: 'Movimentos de corte',     ok: gcodeCutMoves > 0,            detail: `${gcodeCutMoves} movimento(s)` },
        ...(totalPecasChapa > 0 ? [{
            label: 'Etiquetas impressas',
            ok: etiquetasOk,
            detail: etiquetasOk
                ? `${impressasCount}/${totalPecasChapa} etiqueta(s) confirmadas`
                : `${impressasCount}/${totalPecasChapa} — imprima todas antes de cortar`,
        }] : []),
    ];

    const hasBlocking = operational.critical.length > 0 || !gcode || gcodeCutMoves === 0;
    const scoreColor = operational.score >= 85 ? 'var(--success)' : operational.score >= 70 ? 'var(--warning)' : 'var(--danger)';

    // ── Ações ────────────────────────────────────────────────
    const handleDownload = useCallback(() => {
        if (!gcode) return;
        const blob = new Blob([gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `chapa_${chapaIdx + 1}.nc`;
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

    // ── G-code viewer: linha atual derivada do move atual ────
    const currentLineIdx = currentMoveIdx >= 0
        ? (parsedPreview.moves[currentMoveIdx]?.lineIdx ?? -1)
        : -1;

    // Auto-scroll para linha atual quando muda (apenas na aba gcode)
    useEffect(() => {
        if (sidebarTab !== 'gcode') return;
        if (currentLineRef.current) {
            currentLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentLineIdx, sidebarTab]);

    // Syntax highlight simples para G-code
    const gcodeTokenize = useCallback((lineStr) => {
        if (!lineStr || !lineStr.trim()) return <span style={{ color: 'var(--text-muted)' }}>{lineStr || ' '}</span>;
        // Comentário puro
        const fullComment = lineStr.match(/^\s*[;(]/);
        if (fullComment) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{lineStr}</span>;
        // Tokenizar segmento por segmento
        const parts = [];
        let rest = lineStr;
        // Extrai comentário do fim
        let comment = '';
        const ci = rest.indexOf('(');
        if (ci !== -1) { comment = rest.slice(ci); rest = rest.slice(0, ci); }
        const si = rest.indexOf(';');
        if (si !== -1) { comment = rest.slice(si) + comment; rest = rest.slice(0, si); }
        // Tokenize codes
        const tokens = rest.split(/(\s+)/);
        tokens.forEach((tok, i) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { parts.push(<span key={i}>{tok}</span>); return; }
            if (/^G0+0?\b/i.test(tok) || /^G0(?!\d)/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#FBBF24', fontWeight: 700 }}>{tok}</span>);
            } else if (/^G0*1\b/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#34D399', fontWeight: 700 }}>{tok}</span>);
            } else if (/^G\d+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#60A5FA', fontWeight: 600 }}>{tok}</span>);
            } else if (/^M\d+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{tok}</span>);
            } else if (/^T\d+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{tok}</span>);
            } else if (/^[XYZIJKR]-?[\d.]+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#93C5FD' }}>{tok}</span>);
            } else if (/^[FS]-?[\d.]+/i.test(tok)) {
                parts.push(<span key={i} style={{ color: '#A5B4FC' }}>{tok}</span>);
            } else {
                parts.push(<span key={i} style={{ color: 'var(--text-secondary)' }}>{tok}</span>);
            }
        });
        if (comment) parts.push(<span key="cmt" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{comment}</span>);
        return parts;
    }, []);

    // ── Layout ───────────────────────────────────────────────
    // Ocupa toda a área disponível abaixo da topbar (100vh - 56px topbar)
    // O ProducaoCNC.jsx remove o padding quando tab === 'preCorte'
    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: 'calc(100vh - 56px)', // 56px = altura da topbar
            background: 'var(--bg-body)',
            overflow: 'hidden',
        }}>

            {/* ══ TOPBAR OPERACIONAL ══════════════════════════ */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0 16px', height: 52, flexShrink: 0,
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border)',
            }}>
                <button
                    onClick={onVoltar}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px 5px 8px', borderRadius: 6,
                        background: 'var(--bg-muted)', border: '1px solid var(--border)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)',
                        transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                    <ArrowLeft size={13} strokeWidth={2.5} /> Plano de Corte
                </button>

                {/* Divider */}
                <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

                {/* Contexto */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                            background: hasBlocking ? 'var(--danger-bg)' : 'var(--primary)',
                            border: hasBlocking ? '1px solid var(--danger-border)' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: hasBlocking ? 'var(--danger)' : '#fff',
                        }}>
                            <Cpu size={14} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {loteAtual?.nome || `Lote #${loteAtual?.id}`}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1 }}>
                                Chapa {chapaIdx + 1}
                                {chapaData && ` · ${chapaData.comprimento || 2750}×${chapaData.largura || 1850}mm`}
                                {maquinaInfo?.nome && ` · ${maquinaInfo.nome}`}
                            </div>
                        </div>
                    </div>
                </div>

                <StatusPill hasBlocking={hasBlocking} />
            </div>

            {/* ══ CORPO: 3 COLUNAS ════════════════════════════ */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

                {/* ── Coluna esquerda: Checklist de liberação ── */}
                <div style={{
                    width: 236, flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--bg-card)',
                    borderRight: '1px solid var(--border)',
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
                        padding: '12px',
                        borderTop: '1px solid var(--border)',
                        background: hasBlocking ? 'var(--danger-bg)' : 'var(--success-bg)',
                    }}>
                        <div style={{
                            fontSize: 11, fontWeight: 700,
                            color: hasBlocking ? 'var(--danger)' : 'var(--success)',
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                        }}>
                            {hasBlocking
                                ? <><ZapOff size={12} /> Corte bloqueado</>
                                : <><Zap size={12} /> Liberado para cortar</>
                            }
                        </div>
                        {hasBlocking ? (
                            <div style={{ fontSize: 10.5, color: 'var(--danger)', lineHeight: 1.4 }}>
                                {checklist.filter(c => !c.ok).map(c => c.label).join(' · ')}
                            </div>
                        ) : (
                            <div style={{ fontSize: 10.5, color: 'var(--success)', lineHeight: 1.4 }}>
                                Todos os itens verificados. Pode enviar para a máquina.
                            </div>
                        )}
                    </div>

                    {/* Score operacional */}
                    <div style={{
                        padding: '12px', borderTop: '1px solid var(--border)',
                        background: 'var(--bg-subtle)',
                    }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>
                            Score operacional
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 28, fontWeight: 700, color: scoreColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                {operational.score}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor, textTransform: 'uppercase' }}>
                                {operational.status}
                            </span>
                        </div>
                        <div style={{ height: 5, borderRadius: 99, background: 'var(--bg-muted)', overflow: 'hidden' }}>
                            <div style={{ width: `${operational.score}%`, height: '100%', background: scoreColor, borderRadius: 99, transition: 'width 0.5s' }} />
                        </div>
                    </div>
                </div>

                {/* ── Centro: Simulador ───────────────────────── */}
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    minWidth: 0, background: 'var(--bg-operational, var(--bg-body))',
                    overflow: 'hidden',
                }}>
                    {/* Toolbar do simulador */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 14px', borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-card)', flexShrink: 0,
                    }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Simulador
                        </span>
                        <div style={{ flex: 1 }} />
                        {/* Velocidade */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {[0.5, 1, 2, 4].map(s => (
                                <button key={s}
                                    onClick={() => setSimSpeed(s)}
                                    style={{
                                        padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
                                        fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                        fontFamily: 'var(--font-sans)',
                                        background: simSpeed === s ? 'var(--primary)' : 'var(--bg-muted)',
                                        color: simSpeed === s ? '#fff' : 'var(--text-muted)',
                                    }}
                                >{s}×</button>
                            ))}
                        </div>
                        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {filename || `chapa_${chapaIdx + 1}.nc`}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {lines.length} linhas · {sizeKB.toFixed(1)} KB
                        </span>
                    </div>

                    {/* Canvas do simulador */}
                    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {gcode ? (
                            <GcodeSimCanvas
                                ref={simRef}
                                gcode={gcode}
                                chapa={chapaData}
                                playing={simPlaying}
                                speed={simSpeed}
                                onPlayEnd={() => setSimPlaying(false)}
                                onMoveChange={handleMoveChange}
                            />
                        ) : (
                            <div style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                height: '100%', gap: 12,
                                color: 'var(--text-muted)',
                            }}>
                                <ZapOff size={32} />
                                <span style={{ fontSize: 13, fontWeight: 600 }}>G-code não gerado</span>
                                <span style={{ fontSize: 11 }}>Gere o G-code no plano de corte antes de revisar</span>
                            </div>
                        )}
                    </div>

                    {/* Controles de playback */}
                    {gcode && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '8px 14px', borderTop: '1px solid var(--border)',
                            background: 'var(--bg-card)', flexShrink: 0,
                        }}>
                            <button
                                onClick={() => simRef.current?.reset?.()}
                                style={{ ...btnIconStyle }}
                                title="Reiniciar"
                            >
                                <RotateCcw size={14} />
                            </button>
                            <button
                                onClick={() => setSimPlaying(v => !v)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    padding: '7px 18px', borderRadius: 6,
                                    background: 'var(--primary)', color: '#fff',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: 12.5, fontWeight: 700,
                                    fontFamily: 'var(--font-sans)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,.22)',
                                    transition: 'all var(--transition-fast)',
                                }}
                            >
                                {simPlaying ? <Pause size={14} /> : <Play size={14} />}
                                {simPlaying ? 'Pausar' : 'Simular'}
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Coluna direita: Sidebar técnica ─────────── */}
                <div style={{
                    width: 280, flexShrink: 0,
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--bg-card)',
                    borderLeft: '1px solid var(--border)',
                    overflow: 'hidden',
                }}>
                    {/* Tab switcher */}
                    <div style={{
                        display: 'flex', borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-subtle)', flexShrink: 0,
                    }}>
                        {[
                            { id: 'dados', label: 'Dados' },
                            { id: 'gcode', label: 'G-code' },
                        ].map(t => (
                            <button key={t.id} onClick={() => setSidebarTab(t.id)} style={{
                                flex: 1, padding: '8px 0', background: 'none', border: 'none',
                                borderBottom: sidebarTab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                                color: sidebarTab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontSize: 11.5, fontWeight: sidebarTab === t.id ? 700 : 500,
                                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                                transition: 'all var(--transition-fast)',
                            }}>{t.label}</button>
                        ))}
                    </div>

                    {/* ══ Tab: G-code viewer ══════════════════════ */}
                    {sidebarTab === 'gcode' && (
                        <div ref={gcodeViewerRef} style={{
                            flex: 1, overflowY: 'auto', overflowX: 'auto',
                            background: 'var(--bg-operational, #0E0E11)',
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
                                            if (isClickable) setCurrentMoveIdx(moveIdx);
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start',
                                            padding: '1px 8px 1px 0',
                                            borderLeft: isCurrent
                                                ? '2px solid var(--primary)'
                                                : '2px solid transparent',
                                            background: isCurrent
                                                ? 'rgba(19,121,240,0.12)'
                                                : 'transparent',
                                            opacity: isExecuted ? 0.38 : 1,
                                            cursor: isClickable ? 'pointer' : 'default',
                                            transition: 'background 0.1s',
                                            minHeight: 18,
                                        }}
                                        onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                        onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        {/* Line number */}
                                        <span style={{
                                            minWidth: 36, textAlign: 'right',
                                            color: isCurrent ? 'var(--primary)' : 'var(--text-muted)',
                                            fontSize: 10, paddingRight: 8, flexShrink: 0,
                                            userSelect: 'none', lineHeight: '18px',
                                            fontWeight: isCurrent ? 700 : 400,
                                        }}>
                                            {li + 1}
                                        </span>
                                        {/* Content */}
                                        <span style={{ flex: 1, lineHeight: '18px', whiteSpace: 'pre', color: 'var(--text-secondary)' }}>
                                            {gcodeTokenize(rawLine)}
                                        </span>
                                    </div>
                                );
                            })}
                            {(!parsedPreview.rawLines?.length) && (
                                <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                                    G-code não disponível
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══ Tab: Dados técnicos ═════════════════════ */}
                    {sidebarTab === 'dados' && (
                    <div style={{ flex: 1, overflowY: 'auto' }}>

                    {/* Face A/B toggle */}
                    <SectionHead label="Face da peça" icon={FlipVertical2} />
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                            {['A', 'B'].map(f => (
                                <button key={f}
                                    onClick={() => setFaceAtiva(f)}
                                    style={{
                                        flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)',
                                        cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                        fontFamily: 'var(--font-sans)',
                                        background: faceAtiva === f ? 'var(--primary)' : 'var(--bg-muted)',
                                        color: faceAtiva === f ? '#fff' : 'var(--text-muted)',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    Face {f}
                                </button>
                            ))}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            Face ativa: <strong style={{ color: 'var(--text-secondary)' }}>{faceAtiva}</strong>
                            {' · '}G-code atual refere-se à face {faceAtiva}
                        </div>
                    </div>

                    {/* Estatísticas */}
                    <SectionHead label="Estatísticas" icon={BarChart2} />
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {[
                                { lb: 'Tempo est.', val: formatMinutes(stats.tempo_estimado_min), color: 'var(--text-primary)' },
                                { lb: 'Operações',  val: stats.total_operacoes ?? 0, color: 'var(--text-primary)' },
                                { lb: 'Trocas ferr.', val: stats.trocas_ferramenta ?? 0, color: stats.trocas_ferramenta > 3 ? 'var(--warning)' : 'var(--text-primary)' },
                                { lb: 'Corte total', val: formatMeters(operational.metrics?.distCutM), color: 'var(--text-primary)' },
                                { lb: 'Rápido', val: formatMeters(operational.metrics?.distRapidM), color: 'var(--text-secondary)' },
                                { lb: 'Linhas', val: lines.length, color: 'var(--text-secondary)' },
                            ].map(s => (
                                <div key={s.lb} style={{
                                    padding: '7px 8px', borderRadius: 6,
                                    background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                                }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{s.val}</div>
                                    <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.lb}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Operações */}
                    <SectionHead label="Usinagens no G-code" icon={Wrench} />
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        {operationSummary.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {operationSummary.map(op => (
                                    <span key={op.key} style={{
                                        padding: '4px 8px', borderRadius: 4,
                                        border: `1px solid ${op.color}28`,
                                        background: `${op.color}12`,
                                        color: op.color,
                                        fontSize: 11, fontWeight: 700,
                                    }}>
                                        {op.label} <span style={{ opacity: 0.7 }}>{op.count}</span>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: 11.5, color: 'var(--danger)', fontWeight: 600 }}>
                                Nenhuma usinagem de corte no arquivo.
                            </div>
                        )}
                    </div>

                    {/* Alertas */}
                    {operational.issues.length > 0 && (
                        <>
                            <SectionHead label={`Alertas (${operational.issues.length})`} icon={AlertTriangle} />
                            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {operational.issues.map((a, i) => {
                                    const isCrit = a.severity === 'critical';
                                    return (
                                        <div key={i} style={{
                                            padding: '7px 10px', borderRadius: 6,
                                            background: isCrit ? 'var(--danger-bg)' : 'var(--warning-bg)',
                                            border: `1px solid ${isCrit ? 'var(--danger-border)' : 'var(--warning-border)'}`,
                                            color: isCrit ? 'var(--danger)' : 'var(--warning)',
                                            fontSize: 11, fontWeight: 500, lineHeight: 1.35,
                                            display: 'flex', alignItems: 'flex-start', gap: 6,
                                        }}>
                                            <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
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
                                        display: 'flex', alignItems: 'flex-start', gap: 7,
                                        fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.35,
                                    }}>
                                        <CheckCircle2 size={12} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} />
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

            {/* ══ FOOTER FIXO ═════════════════════════════════ */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 20px', height: 56, flexShrink: 0,
                background: 'var(--bg-card)',
                borderTop: '1px solid var(--border)',
                boxShadow: '0 -2px 8px rgba(0,0,0,.06)',
            }}>
                <button
                    onClick={onVoltar}
                    className="btn-secondary"
                    style={{ fontSize: 13, gap: 7 }}
                >
                    <ArrowLeft size={14} /> Voltar ao plano
                </button>

                <div style={{ flex: 1 }} />

                {/* Legenda do arquivo */}
                {filename && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {filename}
                    </span>
                )}

                <button
                    onClick={handleDownload}
                    disabled={!gcode}
                    className="btn-secondary"
                    style={{ fontSize: 13, gap: 7 }}
                >
                    <Download size={14} /> Baixar G-code
                </button>

                <button
                    onClick={handleSendToMachine}
                    disabled={hasBlocking || sending}
                    title={hasBlocking ? 'Resolva os bloqueios antes de enviar' : 'Enviar G-code para a fila da máquina'}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '0 20px', height: 38, borderRadius: 6,
                        fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sans)',
                        border: 'none', cursor: hasBlocking ? 'not-allowed' : 'pointer',
                        background: hasBlocking ? 'var(--bg-muted)' : 'var(--success)',
                        color: hasBlocking ? 'var(--text-muted)' : '#fff',
                        opacity: hasBlocking ? 0.6 : 1,
                        transition: 'all var(--transition-fast)',
                        boxShadow: hasBlocking ? 'none' : '0 1px 3px rgba(0,0,0,.22)',
                    }}
                >
                    {sending ? <Spinner size={14} /> : <Send size={14} />}
                    Enviar para CNC
                </button>
            </div>
        </div>
    );
}

// ─── Estilos de botão ícone ──────────────────────────────────
const btnIconStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 6,
    background: 'var(--bg-muted)', border: '1px solid var(--border)',
    color: 'var(--text-muted)', cursor: 'pointer',
    transition: 'all var(--transition-fast)',
};
