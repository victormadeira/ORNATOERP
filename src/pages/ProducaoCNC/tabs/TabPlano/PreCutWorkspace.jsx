// ══════════════════════════════════════════════════════════════
// PreCutWorkspace — CNC Cockpit de Liberação Pré-Corte
// Dark CAM aesthetic: transport bar, G-code viewer sincronizado,
// checklist de liberação, painel técnico com live position.
// ══════════════════════════════════════════════════════════════
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
    ArrowLeft, Download, Send, Play, Pause, RotateCcw, Cpu,
    AlertTriangle, CheckCircle2, X, ChevronRight, Clock,
    Wrench, FlipVertical2, Shield, BarChart2,
    ZapOff, Zap, Maximize2, Tag as TagIcon,
    SkipBack, SkipForward, ChevronLeft, ChevronRight as ChevronRightIcon,
    Activity, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import { Spinner } from '../../../../ui';
import Sim2D from '../../../../components/CncSim/Sim2D.jsx';
import { Sim3D } from '../../../../components/CncSim/Sim3D.jsx';
import { parseGcode as parseGcodeForSim, getOpCat, OP_CATS, buildOperations } from '../../../../components/CncSim/parseGcode.js';
import { analyzeGcodeOperational, formatMeters, formatMinutes } from '../../shared/operationalMetrics.js';
import { useCockpitFullscreen } from '../../shared/useCockpitFullscreen.js';
import api from '../../../../api';

// ─── Cockpit design tokens — Sprint 3 premium palette ────────────────────────
const C = {
    bg:       '#070A0F',   // main background — deep navy-black
    panel:    '#0D1117',   // sidebars & header panels
    panel2:   '#111820',   // inner panel elements
    border:   '#1E2733',   // all borders
    text:     '#E6EDF3',   // primary text
    muted:    '#7D8794',   // secondary text
    blue:     '#2F81F7',   // primary action / active
    blueHi:   '#58A6FF',   // highlights & active text
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

// Compat: aceita `ok` boolean (legado) ou `state` ('ok' | 'pending' | 'error').
// pending = aguardando ação real (gerar g-code, etc) — cinza, não assustador.
function CheckItem({ label, ok, state, detail }) {
    const resolved = state || (ok ? 'ok' : 'error');
    const tone = resolved === 'ok'
        ? { bg: 'rgba(46,160,67,0.14)', border: 'rgba(46,160,67,0.4)', color: C.success, Icon: CheckCircle2 }
        : resolved === 'error'
            ? { bg: 'rgba(248,81,73,0.12)', border: 'rgba(248,81,73,0.35)', color: C.danger, Icon: AlertTriangle }
            : { bg: 'rgba(139,148,158,0.10)', border: 'rgba(139,148,158,0.28)', color: C.muted, Icon: Clock };
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 9,
            padding: '9px 12px',
            borderBottom: `1px solid ${C.border}`,
        }}>
            <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color,
            }}>
                <tone.Icon size={10} strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>{label}</div>
                {detail && (
                    <div style={{ fontSize: 10.5, color: tone.color, marginTop: 2, lineHeight: 1.3, opacity: resolved === 'pending' ? 0.85 : 1 }}>
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
        generation_error = '', generation_blocked = false,
    } = data || {};

    // ── Fullscreen cockpit: hide ERP topbar + bottom-nav ─────────────────────
    useCockpitFullscreen(true);

    // ── Playback state (single source of truth) ──────────────────────────────
    const [simPlaying, setSimPlaying]   = useState(false);
    const [simSpeed,   setSimSpeed]     = useState(1);
    const [curMove,    setCurMove]      = useState(-1);
    const [totalMoves, setTotalMoves]   = useState(0);
    const [curSimTime,  setCurSimTime]  = useState(0);

    // ── UI state ──────────────────────────────────────────────────────────────
    const [faceAtiva,      setFaceAtiva]      = useState('A');
    const [sending,        setSending]        = useState(false);
    const [sidebarTab,     setSidebarTab]     = useState('gcode'); // 'gcode' | 'dados' | 'usinagens'
    const [currentLineIdx, setCurrentLineIdx] = useState(-1);
    const [leftCollapsed,  setLeftCollapsed]  = useState(false); // checklist sidebar
    const [rightCollapsed, setRightCollapsed] = useState(false); // HUD sidebar
    const [simView,        setSimView]        = useState('2d');

    // ── G-code filter ─────────────────────────────────────────────────────────
    const [filterType, setFilterType] = useState('all');

    const simRef          = useRef(null);
    const gcodeViewerRef  = useRef(null);
    const currentLineRef  = useRef(null);
    const filterFirstRef  = useRef(null); // first matching line (for auto-scroll on filter change)
    const scrollTimerRef  = useRef(null); // debounce scroll during fast playback

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

    // ── 2D time change callback (Sim2D RAF loop → parent) ────────────────────
    const handle2DTimeChange = useCallback((t) => {
        setCurSimTime(t);
        // Derive move index from time
        const moves_ = parsedPreview.moves;
        if (!moves_.length) return;
        let lo = 0, hi = moves_.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const m = moves_[mid];
            if (t < m.tStart) hi = mid - 1;
            else if (t > m.tEnd) lo = mid + 1;
            else {
                setCurMove(mid);
                setCurrentLineIdx(m.lineIdx ?? -1);
                return;
            }
        }
    }, [parsedPreview.moves]);
    const gcodeCutMoves = parsedPreview.moves.filter(m => m.type !== 'G0').length;
    const hasParsedMoves = parsedPreview.moves.length > 0;
    const operational   = useMemo(() => analyzeGcodeOperational({
        gcode, chapa: chapaData, stats, alertas, parsed: parsedPreview,
    }), [gcode, chapaData, stats, alertas, parsedPreview]);

    // ── Sync total moves once canvas mounts (or gcode changes) ───────────────
    useEffect(() => {
        if (simView !== '3d') {
            setTotalMoves(parsedPreview.moves.length);
            return;
        }
        const frame = requestAnimationFrame(() => {
            const t = simRef.current?.getTotalMoves?.() ?? parsedPreview.moves.length;
            setTotalMoves(t);
        });
        return () => cancelAnimationFrame(frame);
    }, [gcode, simView, parsedPreview.moves.length]);

    useEffect(() => {
        if (simView !== '3d') setSimPlaying(false);
    }, [simView]);

    const operationSummary = useMemo(() => {
        const counts = new Map();
        for (const m of parsedPreview.moves) {
            if (m.type === 'G0') continue;
            const cat = getOpCat(m.op);
            counts.set(cat.key, { ...cat, count: (counts.get(cat.key)?.count || 0) + 1 });
        }
        return OP_CATS.map(cat => counts.get(cat.key)).filter(Boolean);
    }, [parsedPreview.moves]);

    // Sprint 0: structured operations list for Usinagens tab
    const operationBlocks = useMemo(() => buildOperations(parsedPreview), [parsedPreview]);

    // ── Filter: which lines match the active filter chip ─────────────────────
    const { matchingLineSet, firstMatchLine } = useMemo(() => {
        if (filterType === 'all') return { matchingLineSet: null, firstMatchLine: -1 };
        const set = new Set();
        const lm = parsedPreview.lineToMoveIdx || {};
        for (const liStr of Object.keys(lm)) {
            const m = parsedPreview.moves[lm[liStr]];
            if (!m) continue;
            let ok = false;
            if      (filterType === 'rapid')    ok = m.type === 'G0';
            else if (filterType === 'cut')      ok = m.type !== 'G0' && m.z2 <= 0;
            else if (filterType === 'furo')     ok = /furo|hole|helicoidal|circular/i.test(m.op);
            else if (filterType === 'contorno') ok = /contorno/i.test(m.op);
            else if (filterType === 'rebaixo')  ok = /rebaixo/i.test(m.op);
            if (ok) set.add(parseInt(liStr));
        }
        const firstMatchLine = set.size > 0 ? Math.min(...set) : -1;
        return { matchingLineSet: set, firstMatchLine };
    }, [filterType, parsedPreview.lineToMoveIdx, parsedPreview.moves]);

    // ── Op blocks: per-line time badge (startLine → { label, color, duration }) ─
    const opBlockMap = useMemo(() => {
        const RAPID_F = 20000;
        const map = new Map();
        let lastOp;
        let cur = null;
        for (const m of parsedPreview.moves) {
            const op = m.op || '';
            if (op !== lastOp) {
                if (cur) map.set(cur.startLine, cur);
                const cat = getOpCat(op);
                cur = { label: cat.label, color: cat.color, startLine: m.lineIdx, duration: 0 };
                lastOp = op;
            }
            if (cur) {
                const dist = Math.hypot(m.x2 - m.x1, m.y2 - m.y1, m.z2 - m.z1);
                const f = m.type === 'G0' ? RAPID_F : (m.feed || 1000);
                cur.duration += dist / (f / 60);
            }
        }
        if (cur) map.set(cur.startLine, cur);
        return map;
    }, [parsedPreview.moves]);

    const lines  = gcode ? gcode.split('\n') : [];
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

    const alertText = (alert) => alert?.msg || alert?.message || String(alert || '');
    const criticalAlerts = alertas.filter(a => {
        const t = String(a?.tipo || '').toLowerCase();
        return t.includes('erro') || t.includes('critico');
    });

    // ── Etiqueta status ───────────────────────────────────────────────────────
    const totalPecasChapa = pecasPersistentIds.length;
    const impressasCount  = pecasPersistentIds.filter(pid => printStatusMap[pid]).length;
    const etiquetasOk     = totalPecasChapa === 0 || impressasCount === totalPecasChapa;

    const hasBackendBlocker = generation_blocked || criticalAlerts.length > 0;
    const hasExecutableGcode = Boolean(gcode) && gcodeCutMoves > 0;
    const hasSimulatablePath = Boolean(gcode) && gcodeCutMoves > 0;
    const releaseReady = hasExecutableGcode
        && Boolean(contorno_tool)
        && !hasBackendBlocker
        && operational.critical.length === 0;
    const hasBlocking = !releaseReady;

    const blockingReasons = (() => {
        const items = [];
        const add = (title, detail) => {
            const clean = String(detail || '').trim();
            if (!clean) return;
            if (items.some(i => i.detail === clean)) return;
            items.push({ title, detail: clean });
        };
        if (generation_error) add('Geração bloqueada', generation_error);
        if (!gcode) add('Arquivo CNC', 'Nenhum arquivo executável foi liberado pelo servidor.');
        if (!contorno_tool) {
            add(
                'Ferramenta de contorno',
                `Configure uma fresa de contorno${maquinaInfo?.nome ? ` na ${maquinaInfo.nome}` : ''} antes de gerar novamente.`
            );
        }
        if (gcode && gcodeCutMoves === 0) {
            add('Movimentos de corte', 'O arquivo atual não contém movimentos G1/G2/G3 de corte para simular.');
        }
        criticalAlerts.forEach(a => add('Alerta crítico', alertText(a)));
        operational.critical.forEach(a => add('Validação operacional', alertText(a)));
        return items;
    })();

    // ── Checklist (tri-state: ok/pending/error) ───────────────────────────────
    // pending = aguardando gerar g-code (cinza, não erro)
    // error   = bloqueio real (vermelho)
    // ok      = validado (verde)
    const hasGcode = Boolean(gcode);
    const checklist = [
        {
            label: 'Arquivo CNC executável',
            state: !hasGcode ? 'pending' : (hasBackendBlocker ? 'error' : 'ok'),
            detail: hasGcode
                ? (hasBackendBlocker ? 'Gerado, mas bloqueado por validação crítica' : (filename || 'Arquivo sem nome'))
                : 'Aguardando geração — clique em "Gerar G-code"',
        },
        {
            label: 'Máquina selecionada',
            state: maquinaInfo?.nome ? 'ok' : 'error',
            detail: maquinaInfo?.nome || 'Cadastre uma máquina em Produção CNC → Config → Máquinas',
        },
        {
            label: 'Ferramenta de contorno',
            state: contorno_tool ? 'ok' : (hasGcode ? 'error' : 'pending'),
            detail: contorno_tool
                ? `${contorno_tool.nome || contorno_tool.codigo} Ø${contorno_tool.diametro}mm`
                : (hasGcode ? 'Cadastre ou atribua uma fresa de contorno' : 'Será identificada ao gerar'),
        },
        {
            label: 'Pendências críticas',
            state: !hasGcode ? 'pending' : (criticalAlerts.length === 0 ? 'ok' : 'error'),
            detail: !hasGcode
                ? 'Aguardando geração'
                : (criticalAlerts.length ? `${criticalAlerts.length} bloqueio(s) do backend` : 'Sem bloqueios'),
        },
        {
            label: 'Validação do percurso',
            state: !hasGcode ? 'pending' : (operational.critical.length === 0 ? 'ok' : 'error'),
            detail: !hasGcode
                ? 'Aguardando geração'
                : (operational.critical.length
                    ? `${operational.critical.length} bloqueio(s)`
                    : (operational.warning.length ? `${operational.warning.length} atenção(ões)` : 'Sem risco crítico')),
        },
        {
            label: 'Movimentos de corte',
            state: !hasGcode ? 'pending' : (gcodeCutMoves > 0 ? 'ok' : 'error'),
            detail: hasGcode ? `${gcodeCutMoves} movimento(s) G1/G2/G3` : 'Sem arquivo para simular',
        },
        {
            label: 'Simulação do percurso',
            state: !hasGcode ? 'pending' : (hasSimulatablePath ? 'ok' : 'error'),
            detail: hasSimulatablePath ? 'Disponível no modo 2D/3D' : (hasGcode ? 'Indisponível — percurso inválido' : 'Aguardando geração'),
        },
        ...(totalPecasChapa > 0 ? [{
            label: 'Etiquetas impressas',
            state: etiquetasOk ? 'ok' : 'error',
            detail: etiquetasOk
                ? `${impressasCount}/${totalPecasChapa} etiqueta(s) confirmadas`
                : `${impressasCount}/${totalPecasChapa} — imprima antes de cortar`,
        }] : []),
    ];

    const scoreColor   = operational.score >= 85 ? C.success : operational.score >= 70 ? C.warning : C.danger;

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleDownload = useCallback(() => {
        if (!gcode || hasBlocking) {
            notify?.('G-code bloqueado. Corrija as pendências e gere novamente antes de baixar.', 'error');
            return;
        }
        const blob = new Blob([gcode], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = filename || `chapa_${chapaIdx + 1}.nc`;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify?.(`G-code baixado: ${filename || `chapa_${chapaIdx + 1}.nc`}`, 'success');
    }, [gcode, hasBlocking, filename, chapaIdx, notify]);

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
    // Sprint 0: helpers for 2D seek (by time) vs 3D seek (by move index)
    const seekByTime = useCallback((t) => {
        setCurSimTime(t);
        const mv = parsedPreview.moves;
        if (!mv.length) return;
        let lo = 0, hi = mv.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (t < mv[mid].tStart) hi = mid - 1;
            else if (t > mv[mid].tEnd) lo = mid + 1;
            else { setCurMove(mid); setCurrentLineIdx(mv[mid].lineIdx ?? -1); return; }
        }
        if (t >= totalSimTime) { setCurMove(mv.length - 1); }
    }, [parsedPreview.moves, totalSimTime]);

    const handlePlay = useCallback(() => {
        if (simView === '2d') {
            if (curSimTime >= totalSimTime && totalSimTime > 0) {
                seekByTime(0);
            }
        } else {
            if (curMove >= (parsedPreview.moves.length - 1)) {
                simRef.current?.reset?.();
            }
        }
        setSimPlaying(true);
    }, [simView, curSimTime, totalSimTime, curMove, parsedPreview.moves.length, seekByTime]);

    const handlePause = useCallback(() => setSimPlaying(false), []);

    const handleReset = useCallback(() => {
        setSimPlaying(false);
        if (simView === '3d') simRef.current?.reset?.();
        setCurSimTime(0);
        setCurMove(-1);
        setCurrentLineIdx(-1);
    }, [simView]);

    const handleStep = useCallback((dir) => {
        setSimPlaying(false);
        if (simView === '3d') {
            const next = Math.max(-1, Math.min((parsedPreview.moves.length - 1), (curMove < 0 ? 0 : curMove) + dir));
            simRef.current?.seekTo?.(next);
        } else {
            const base = curMove < 0 ? 0 : curMove;
            const next = Math.max(0, Math.min(parsedPreview.moves.length - 1, base + dir));
            const t = parsedPreview.moves[next]?.tStart ?? 0;
            seekByTime(t);
            setCurMove(next);
        }
    }, [simView, curMove, parsedPreview.moves, seekByTime]);

    const handleSeekFirst = useCallback(() => {
        setSimPlaying(false);
        if (simView === '3d') simRef.current?.seekTo?.(0);
        else seekByTime(0);
    }, [simView, seekByTime]);

    const handleSeekLast = useCallback(() => {
        setSimPlaying(false);
        if (simView === '3d') simRef.current?.seekTo?.(parsedPreview.moves.length - 1);
        else seekByTime(totalSimTime);
    }, [simView, parsedPreview.moves.length, seekByTime, totalSimTime]);

    const handleSlider = useCallback((e) => {
        setSimPlaying(false);
        if (simView === '3d') simRef.current?.seekTo?.(parseInt(e.target.value));
        else seekByTime((parseInt(e.target.value) / Math.max(1, parsedPreview.moves.length - 1)) * totalSimTime);
    }, [simView, parsedPreview.moves.length, seekByTime, totalSimTime]);

    // ── Keyboard shortcuts — Sprint 0: work for both 2D and 3D ──────────────
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
    }, [simView, simPlaying, handlePlay, handlePause, handleStep, handleSeekFirst, handleSeekLast]);

    // ── Auto-scroll G-code viewer — debounced so fast playback doesn't stutter ─
    useEffect(() => {
        if (sidebarTab !== 'gcode' || !currentLineRef.current) return;
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
            currentLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
    }, [currentLineIdx, sidebarTab]);

    // ── Auto-scroll to first matching line on filter change ───────────────────
    useEffect(() => {
        if (filterType === 'all' || firstMatchLine < 0) return;
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
            filterFirstRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
    }, [filterType, firstMatchLine]);

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
                parts.push(<span key={i} style={{ color: '#64748B', fontWeight: 700 }}>{tok}</span>);  // Sprint 3 slate G0
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
            height: '100vh',        // Fullscreen: topbar hidden via useCockpitFullscreen
            background: C.bg,
            overflow: 'hidden',
            fontFamily: 'var(--font-sans)',
        }}>

            {/* ══ TOPBAR ════════════════════════════════════════════════════ */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 12px', height: 46, flexShrink: 0,
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
                        fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-sans)',
                        flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.text; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.muted; }}
                >
                    <ArrowLeft size={12} strokeWidth={2.5} /> Plano
                </button>

                <div style={{ width: 1, height: 20, background: C.border, flexShrink: 0 }} />

                {/* Lote + Chapa identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: 5, flexShrink: 0,
                        background: hasBlocking ? 'rgba(248,81,73,0.15)' : 'rgba(47,129,247,0.18)',
                        border: `1px solid ${hasBlocking ? 'rgba(248,81,73,0.4)' : 'rgba(47,129,247,0.35)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: hasBlocking ? C.danger : C.blueHi,
                    }}>
                        <Cpu size={12} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {loteAtual?.nome || `Lote #${loteAtual?.id}`}
                        </div>
                    </div>

                    {/* Status chips */}
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            background: 'rgba(30,39,51,0.8)', border: `1px solid ${C.border}`,
                            color: C.muted, fontFamily: '"JetBrains Mono", monospace',
                            whiteSpace: 'nowrap',
                        }}>
                            Chapa {chapaIdx + 1}
                            {chapaData && ` · ${chapaData.comprimento || 2750}×${chapaData.largura || 1850}`}
                        </span>
                        {maquinaInfo?.nome && (
                            <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                background: 'rgba(47,129,247,0.10)', border: '1px solid rgba(47,129,247,0.25)',
                                color: C.blueHi, fontFamily: '"JetBrains Mono", monospace',
                                whiteSpace: 'nowrap',
                            }}>
                                {maquinaInfo.nome}
                            </span>
                        )}
                    </div>
                </div>

                <StatusPill hasBlocking={hasBlocking} />

                {/* Collapse buttons */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 4 }}>
                    <button
                        onClick={() => setLeftCollapsed(v => !v)}
                        title={leftCollapsed ? 'Mostrar checklist' : 'Ocultar checklist'}
                        style={{
                            width: 28, height: 28, borderRadius: 5, cursor: 'pointer',
                            background: leftCollapsed ? 'rgba(47,129,247,0.14)' : C.panel2,
                            border: `1px solid ${leftCollapsed ? 'rgba(47,129,247,0.35)' : C.border}`,
                            color: leftCollapsed ? C.blueHi : C.muted,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        {leftCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
                    </button>
                    <button
                        onClick={() => setRightCollapsed(v => !v)}
                        title={rightCollapsed ? 'Mostrar HUD técnico' : 'Ocultar HUD técnico'}
                        style={{
                            width: 28, height: 28, borderRadius: 5, cursor: 'pointer',
                            background: rightCollapsed ? 'rgba(47,129,247,0.14)' : C.panel2,
                            border: `1px solid ${rightCollapsed ? 'rgba(47,129,247,0.35)' : C.border}`,
                            color: rightCollapsed ? C.blueHi : C.muted,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        {rightCollapsed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
                    </button>
                </div>
            </div>

            {/* ══ CORPO: 3 COLUNAS + TRANSPORT FULL-WIDTH ══════════════ */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

                {/* ── Row: 3 colunas ─────────────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

                {/* ── Coluna esquerda: Checklist ──────────────────────────── */}
                {!leftCollapsed && (
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
                        {hasBlocking ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {blockingReasons.slice(0, 4).map((b, i) => (
                                    <div key={`${b.title}-${i}`} style={{ fontSize: 10, color: C.danger, lineHeight: 1.35 }}>
                                        <strong>{b.title}:</strong> {b.detail}
                                    </div>
                                ))}
                                {blockingReasons.length > 4 && (
                                    <div style={{ fontSize: 10, color: C.danger, opacity: 0.75 }}>
                                        +{blockingReasons.length - 4} outro(s) bloqueio(s) nos alertas.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ fontSize: 10, color: C.success, lineHeight: 1.4 }}>
                                Todos os itens verificados.
                            </div>
                        )}
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
                )} {/* end leftCollapsed */}

                {/* ── Centro: Simulador ───────────────────────────────────── */}
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    minWidth: 0, background: C.bg, overflow: 'hidden',
                }}>
                    {/* ── Header rico: contexto + operação atual + controles ── */}
                    {(() => {
                        // Operação atualmente sendo simulada
                        const curOpBlock = curMove >= 0
                            ? operationBlocks.find(op => curMove >= op.startMove && curMove <= op.endMove)
                            : null;
                        return (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '0 10px', height: 38,
                                background: C.panel, borderBottom: `1px solid ${C.border}`,
                                flexShrink: 0,
                            }}>
                                {/* Contexto chapa */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, color: C.text,
                                        fontFamily: '"JetBrains Mono", monospace',
                                    }}>
                                        Chapa {chapaIdx + 1}
                                    </span>
                                    {chapaData && (
                                        <span style={{ fontSize: 10, color: C.muted, fontFamily: '"JetBrains Mono", monospace' }}>
                                            {chapaData.comprimento}×{chapaData.largura}
                                        </span>
                                    )}
                                    {chapaData?.pecas?.length > 0 && (
                                        <span style={{ fontSize: 10, color: C.muted }}>
                                            · {chapaData.pecas.length} peça{chapaData.pecas.length !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                    {operationBlocks.length > 0 && (
                                        <span style={{ fontSize: 10, color: C.muted }}>
                                            · {operationBlocks.length} ops
                                        </span>
                                    )}
                                </div>

                                {/* Divisor */}
                                <div style={{ width: 1, height: 18, background: C.border, flexShrink: 0 }} />

                                {/* Operação atual — aparece durante simulação */}
                                {curOpBlock ? (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '3px 8px', borderRadius: 5,
                                        background: `${curOpBlock.cat.color}18`,
                                        border: `1px solid ${curOpBlock.cat.color}45`,
                                        flexShrink: 1, minWidth: 0, overflow: 'hidden',
                                    }}>
                                        <span style={{
                                            width: 7, height: 7, borderRadius: '50%',
                                            background: curOpBlock.cat.color,
                                            boxShadow: `0 0 6px ${curOpBlock.cat.glow}`,
                                            flexShrink: 0,
                                        }} />
                                        <span style={{
                                            fontSize: 10.5, fontWeight: 700, color: curOpBlock.cat.color,
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            maxWidth: 200,
                                        }}>
                                            {curOpBlock.label}
                                        </span>
                                        {curOpBlock.depth > 0.1 && (
                                            <span style={{ fontSize: 9, color: curOpBlock.cat.color, opacity: 0.75, fontFamily: 'monospace', flexShrink: 0 }}>
                                                ↓{curOpBlock.depth.toFixed(1)}mm
                                            </span>
                                        )}
                                    </div>
                                ) : hasSimulatablePath ? (
                                    <span style={{ fontSize: 10, color: C.muted }}>
                                        {simPlaying ? '▶ simulando...' : 'pronto'}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 10, color: C.danger, fontWeight: 600 }}>
                                        {gcode && gcodeCutMoves === 0 ? 'sem movimentos de corte' : '⚠ G-code não gerado'}
                                    </span>
                                )}

                                <div style={{ flex: 1 }} />

                                {/* Alertas inline */}
                                {gcode && !hasParsedMoves && (
                                    <span style={{ fontSize: 10, color: C.warning, padding: '2px 6px', borderRadius: 4, background: 'rgba(210,153,34,0.12)', border: '1px solid rgba(210,153,34,0.30)', whiteSpace: 'nowrap' }}>
                                        sem movimentos XY
                                    </span>
                                )}

                                {/* Preview Final */}
                                {hasSimulatablePath && totalSimTime > 0 && (
                                    <button
                                        onClick={() => { setSimPlaying(false); seekByTime(totalSimTime); }}
                                        title="Avançar para o resultado final instantaneamente"
                                        style={{
                                            padding: '3px 9px', height: 24, borderRadius: 5,
                                            background: 'rgba(255,255,255,0.06)',
                                            border: `1px solid ${C.border}`,
                                            color: C.muted, cursor: 'pointer',
                                            fontSize: 10, fontWeight: 700,
                                            fontFamily: '"JetBrains Mono", monospace',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.1s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.blueHi; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
                                    >
                                        ⟫ Preview Final
                                    </button>
                                )}

                                {/* 2D / 3D toggle */}
                                {hasSimulatablePath && (
                                    <div style={{ display: 'flex', padding: 2, borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, flexShrink: 0 }}>
                                        {['2d', '3d'].map(id => {
                                            const active = simView === id;
                                            return (
                                                <button key={id} onClick={() => setSimView(id)} style={{
                                                    height: 20, minWidth: 30, padding: '0 8px',
                                                    border: 'none', borderRadius: 3,
                                                    background: active ? C.blue : 'transparent',
                                                    color: active ? '#fff' : C.muted,
                                                    fontSize: 10, fontWeight: 800, cursor: 'pointer',
                                                    fontFamily: '"JetBrains Mono", monospace',
                                                }}>
                                                    {id.toUpperCase()}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* File info */}
                                <span style={{ fontSize: 9.5, color: '#3d4852', fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'nowrap' }}>
                                    {gcode ? `${lines.length}ln · ${sizeKB.toFixed(1)}KB` : '—'}
                                </span>
                            </div>
                        );
                    })()}

                    {/* Canvas */}
                    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                        {hasSimulatablePath ? (
                            simView === '2d' ? (
                                <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                                    {/* Sprint 0: 2D now has real playback — pass curSimTime + onTimeChange */}
                                    <Sim2D
                                        parsed={parsedPreview}
                                        chapa={chapaData}
                                        playing={simPlaying}
                                        speed={simSpeed}
                                        curTime={curSimTime}
                                        totalTime={totalSimTime}
                                        onTimeChange={handle2DTimeChange}
                                    />
                                </div>
                            ) : (
                                <Sim3D
                                    ref={simRef}
                                    parsed={parsedPreview}
                                    chapa={chapaData}
                                    playing={simPlaying}
                                    speed={simSpeed}
                                    onPlayEnd={() => setSimPlaying(false)}
                                    onMoveChange={handleMoveChange}
                                />
                            )
                        ) : (
                            <div style={{
                                flex: 1, display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                gap: 12, color: C.muted,
                                padding: 24,
                            }}>
                                <div style={{
                                    width: 52, height: 52, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: hasBlocking ? 'rgba(248,81,73,0.10)' : 'rgba(47,129,247,0.10)',
                                    border: `1px solid ${hasBlocking ? 'rgba(248,81,73,0.35)' : 'rgba(47,129,247,0.35)'}`,
                                    color: hasBlocking ? C.danger : C.blueHi,
                                }}>
                                    <ZapOff size={24} />
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 800, color: hasBlocking ? C.danger : C.text }}>
                                    {gcode && gcodeCutMoves === 0
                                        ? 'G-code sem percurso para simular'
                                        : hasBlocking ? 'G-code não liberado para corte' : 'G-code não gerado'
                                    }
                                </span>
                                <span style={{ fontSize: 12, opacity: 0.82, textAlign: 'center', maxWidth: 520, lineHeight: 1.45 }}>
                                    {gcode && gcodeCutMoves === 0
                                        ? 'O arquivo recebido não contém movimentos de corte G1/G2/G3. O simulador precisa desses movimentos para desenhar o percurso da ferramenta.'
                                        : hasBlocking
                                        ? 'O servidor bloqueou a liberação porque ainda existem pendências técnicas. Corrija os itens abaixo e gere o G-code novamente.'
                                        : 'Gere o G-code no plano de corte antes de revisar.'
                                    }
                                </span>
                                {hasBlocking && blockingReasons.length > 0 && (
                                    <div style={{
                                        width: 'min(640px, 92%)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 7,
                                        marginTop: 4,
                                    }}>
                                        {blockingReasons.slice(0, 6).map((b, i) => (
                                            <div key={`${b.title}-${i}`} style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: 8,
                                                padding: '9px 11px',
                                                borderRadius: 6,
                                                background: 'rgba(248,81,73,0.08)',
                                                border: '1px solid rgba(248,81,73,0.28)',
                                                color: C.danger,
                                                fontSize: 11.5,
                                                lineHeight: 1.35,
                                            }}>
                                                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                                                <div>
                                                    <div style={{ fontWeight: 800, marginBottom: 2 }}>{b.title}</div>
                                                    <div>{b.detail}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>

                {/* ── Coluna direita: Sidebar técnica ─────────────────────── */}
                {!rightCollapsed && (
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
                            { id: 'usinagens', label: 'Usinagens' },
                            { id: 'gcode',     label: 'G-code' },
                            { id: 'dados',     label: 'Dados' },
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

                    {/* ══ Tab: Usinagens — Sprint 0 ════════════════════════ */}
                    {sidebarTab === 'usinagens' && (
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                            {operationBlocks.length === 0 ? (
                                <div style={{ padding: 20, color: C.muted, fontSize: 12, textAlign: 'center' }}>
                                    {hasParsedMoves
                                        ? 'G-code sem comentários [OP] estruturados. Gere novamente para obter lista detalhada.'
                                        : 'Nenhuma usinagem detectada.'}
                                </div>
                            ) : (
                                <>
                                    <div style={{ padding: '6px 12px 4px', fontSize: 9, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        {operationBlocks.length} operaç{operationBlocks.length === 1 ? 'ão' : 'ões'}
                                    </div>
                                    {operationBlocks.map((op, i) => {
                                        const isCurrent = curMove >= op.startMove && curMove <= op.endMove;
                                        const isDob  = op.type === 'dobradica';
                                        const isOnion = op.type === 'onion_skin';
                                        const dur = op.duration;
                                        const fmtDur = (s) => {
                                            if (!s || s <= 0) return '';
                                            if (s < 60) return `${s.toFixed(0)}s`;
                                            return `${Math.floor(s/60)}m${(s%60).toFixed(0).padStart(2,'0')}s`;
                                        };
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => {
                                                    setSimPlaying(false);
                                                    if (simView === '3d') {
                                                        simRef.current?.seekTo?.(op.startMove);
                                                    } else {
                                                        const t = parsedPreview.moves[op.startMove]?.tStart ?? 0;
                                                        setCurSimTime(t);
                                                        setCurMove(op.startMove);
                                                        setCurrentLineIdx(op.startLine);
                                                    }
                                                    setSidebarTab('usinagens');
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                                    padding: '7px 12px',
                                                    borderLeft: isCurrent ? `3px solid ${op.cat.color}` : '3px solid transparent',
                                                    background: isCurrent ? `${op.cat.color}12` : 'transparent',
                                                    borderBottom: `1px solid ${C.border}`,
                                                    cursor: 'pointer',
                                                    transition: 'background 0.1s',
                                                }}
                                                onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = `${C.border}55`; }}
                                                onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                {/* Category dot/ring */}
                                                <div style={{
                                                    width: isDob ? 13 : 9, height: isDob ? 13 : 9,
                                                    borderRadius: isDob ? '50%' : 2,
                                                    flexShrink: 0, marginTop: 3,
                                                    border: isDob ? `2px solid ${op.cat.color}` : 'none',
                                                    background: isDob ? 'transparent' : op.cat.color,
                                                    boxShadow: `0 0 4px ${op.cat.glow}66`,
                                                    position: 'relative',
                                                }}>
                                                    {isDob && (
                                                        <span style={{
                                                            position: 'absolute', top: '50%', left: '50%',
                                                            transform: 'translate(-50%,-50%)',
                                                            width: 3, height: 3, borderRadius: '50%',
                                                            background: op.cat.color,
                                                        }} />
                                                    )}
                                                </div>

                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    {/* Label */}
                                                    <div style={{
                                                        fontSize: 10.5, fontWeight: isDob || isOnion ? 700 : 600,
                                                        color: isCurrent ? C.text : '#9ba8b8',
                                                        lineHeight: 1.25,
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>
                                                        {op.label.slice(0, 36)}
                                                    </div>

                                                    {/* Meta row: peca + depth + time */}
                                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
                                                        {op.pecaDesc && (
                                                            <span style={{ fontSize: 9, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                                                                {op.pecaDesc.slice(0, 20)}
                                                            </span>
                                                        )}
                                                        {op.depth > 0.1 && (
                                                            <span style={{
                                                                fontSize: 9, fontWeight: 700,
                                                                color: op.depth > 20 ? C.danger : C.muted,
                                                                fontFamily: '"JetBrains Mono", monospace',
                                                            }}>
                                                                ↓{op.depth.toFixed(1)}mm
                                                            </span>
                                                        )}
                                                        {op.diameter > 0 && (
                                                            <span style={{
                                                                fontSize: 9,
                                                                color: isDob ? '#f59e0b' : C.muted,
                                                                fontFamily: '"JetBrains Mono", monospace',
                                                                fontWeight: isDob ? 700 : 400,
                                                            }}>
                                                                Ø{op.diameter}
                                                            </span>
                                                        )}
                                                        {dur > 0.5 && (
                                                            <span style={{ fontSize: 9, color: C.muted, fontFamily: '"JetBrains Mono", monospace', marginLeft: 'auto' }}>
                                                                {fmtDur(dur)}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Warnings */}
                                                    {op.warnings.length > 0 && (
                                                        <div style={{ marginTop: 3 }}>
                                                            {op.warnings.slice(0, 2).map((w, wi) => (
                                                                <div key={wi} style={{ fontSize: 9, color: C.warning, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                                    <AlertTriangle size={8} style={{ flexShrink: 0 }} /> {w.slice(0, 40)}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}

                    {/* ══ Tab: G-code viewer ══════════════════════════════ */}
                    {sidebarTab === 'gcode' && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

                            {/* Filter chips */}
                            <div style={{
                                display: 'flex', gap: 3, flexWrap: 'wrap',
                                padding: '5px 8px', flexShrink: 0,
                                borderBottom: `1px solid ${C.border}`,
                                background: C.bg,
                            }}>
                                {[
                                    { id: 'all',      label: 'Todos',    color: C.muted   },
                                    { id: 'rapid',    label: 'G0',       color: '#64748B' },  // Sprint 3 slate
                                    { id: 'cut',      label: 'Corte',    color: '#E5E7EB' },  // Sprint 3 white-gray
                                    { id: 'furo',     label: 'Furos',    color: '#F59E0B' },  // Sprint 3 warning amber
                                    { id: 'contorno', label: 'Contorno', color: '#BFE7FF' },  // Sprint 3 active blue
                                    { id: 'rebaixo',  label: 'Rebaixo',  color: '#94A3B8' },  // Sprint 3 slate-400
                                ].map(fc => {
                                    const active = filterType === fc.id;
                                    return (
                                        <button key={fc.id} onClick={() => setFilterType(fc.id)} style={{
                                            padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                                            fontSize: 10, fontWeight: active ? 700 : 500,
                                            fontFamily: '"JetBrains Mono", monospace',
                                            border: `1px solid ${active ? fc.color + '55' : C.border}`,
                                            background: active ? fc.color + '18' : 'transparent',
                                            color: active ? fc.color : C.muted,
                                            transition: 'all 0.1s',
                                        }}>{fc.label}</button>
                                    );
                                })}
                                {matchingLineSet && (
                                    <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.muted, alignSelf: 'center', fontFamily: '"JetBrains Mono", monospace' }}>
                                        {matchingLineSet.size} linhas
                                    </span>
                                )}
                            </div>

                            {/* Lines */}
                            <div ref={gcodeViewerRef} style={{
                                flex: 1, overflowY: 'auto', overflowX: 'auto',
                                background: '#0D1117',
                                fontFamily: '"JetBrains Mono","Fira Code",Consolas,monospace',
                                fontSize: 11,
                            }}>
                                {(parsedPreview.rawLines || []).map((rawLine, li) => {
                                    const isCurrent    = li === currentLineIdx;
                                    const isExecuted   = currentLineIdx >= 0 && li < currentLineIdx;
                                    const moveIdx      = parsedPreview.lineToMoveIdx?.[li];
                                    const isClickable  = moveIdx !== undefined;
                                    const inFilter     = !matchingLineSet || matchingLineSet.has(li);
                                    const isFirstMatch = li === firstMatchLine;
                                    const opBlock      = opBlockMap.get(li);

                                    return (
                                        <div
                                            key={li}
                                            ref={node => {
                                                if (isCurrent)    currentLineRef.current = node;
                                                if (isFirstMatch) filterFirstRef.current = node;
                                            }}
                                            onClick={() => {
                                                if (isClickable) { setSimPlaying(false); simRef.current?.seekTo?.(moveIdx); }
                                            }}
                                            style={{
                                                display: 'flex', alignItems: 'center',
                                                padding: '1px 8px 1px 0',
                                                borderLeft: isCurrent
                                                    ? `3px solid ${C.blueHi}`
                                                    : '3px solid transparent',
                                                background: isCurrent ? 'rgba(47,129,247,0.16)' : 'transparent',
                                                opacity: isExecuted ? 0.28 : (!inFilter ? 0.12 : 1),
                                                cursor: isClickable ? 'pointer' : 'default',
                                                minHeight: 18,
                                                transition: 'background 0.08s, opacity 0.1s',
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
                                                color: isCurrent ? '#e6edf3' : '#8B949E',
                                            }}>
                                                {gcodeTokenize(rawLine)}
                                            </span>
                                            {/* Mini time badge at operation boundaries */}
                                            {opBlock && (
                                                <span title={`${opBlock.label} — tempo estimado`} style={{
                                                    marginLeft: 4, fontSize: 9,
                                                    color: opBlock.color,
                                                    fontFamily: '"JetBrains Mono", monospace',
                                                    flexShrink: 0, lineHeight: '18px',
                                                    whiteSpace: 'nowrap', opacity: 0.80,
                                                }}>
                                                    {fmtSimTime(opBlock.duration)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                                {!parsedPreview.rawLines?.length && (
                                    <div style={{ padding: 24, color: C.muted, fontSize: 12, textAlign: 'center' }}>
                                        G-code não disponível
                                    </div>
                                )}
                            </div>
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
                )} {/* end rightCollapsed */}

                </div> {/* end 3-column row */}

                {/* ══ OPERATION TIMELINE BAR — Sprint 1 ════════════════════════ */}
                {hasSimulatablePath && totalSimTime > 0 && operationBlocks.length > 0 && (() => {
                    const moves_ = parsedPreview.moves;
                    return (
                        <div
                            style={{
                                height: 22, flexShrink: 0,
                                background: '#06090e',
                                borderTop: `1px solid ${C.border}`,
                                position: 'relative',
                                cursor: 'crosshair',
                                overflow: 'hidden',
                                userSelect: 'none',
                            }}
                            onClick={e => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                setSimPlaying(false);
                                seekByTime(pct * totalSimTime);
                            }}
                            title="Timeline de usinagens — clique para navegar"
                        >
                            {/* Track background */}
                            <div style={{
                                position: 'absolute', left: 0, right: 0, top: 8, height: 6,
                                background: 'rgba(255,255,255,0.04)', borderRadius: 3,
                            }} />

                            {/* Operation segments */}
                            {operationBlocks.map((op, i) => {
                                const opStart = moves_[op.startMove]?.tStart ?? 0;
                                const opEnd   = moves_[op.endMove]?.tEnd ?? moves_[op.endMove]?.tStart ?? opStart;
                                const left  = (opStart / totalSimTime) * 100;
                                const width = Math.max(0.25, ((opEnd - opStart) / totalSimTime) * 100);
                                const isCurrent = curMove >= op.startMove && curMove <= op.endMove;
                                const isRapid = op.type === 'rapid' || op.cat?.key === 'rapid';
                                if (isRapid) return null; // skip rapid-only blocks
                                const fmtS = (s) => s < 60 ? `${s.toFixed(0)}s` : `${Math.floor(s/60)}m${(s%60).toFixed(0).padStart(2,'0')}s`;
                                return (
                                    <div
                                        key={i}
                                        title={`${op.label}${op.pecaDesc ? ` · ${op.pecaDesc}` : ''}${op.duration > 0.5 ? ` · ${fmtS(op.duration)}` : ''}`}
                                        style={{
                                            position: 'absolute',
                                            left:  `${left}%`,
                                            width: `${width}%`,
                                            top:    isCurrent ? 3 : 7,
                                            height: isCurrent ? 16 : 8,
                                            background: op.cat?.color ?? C.muted,
                                            opacity:    isCurrent ? 1 : 0.45,
                                            borderRadius: 2,
                                            boxShadow: isCurrent ? `0 0 6px ${op.cat?.glow ?? op.cat?.color}88` : 'none',
                                            transition: 'top 0.12s, height 0.12s, opacity 0.12s, box-shadow 0.12s',
                                        }}
                                    />
                                );
                            })}

                            {/* Executed overlay */}
                            {curSimTime > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    left: 0, top: 7,
                                    width: `${(curSimTime / totalSimTime) * 100}%`,
                                    height: 8,
                                    background: 'rgba(255,255,255,0.07)',
                                    pointerEvents: 'none',
                                    borderRadius: '3px 0 0 3px',
                                }} />
                            )}

                            {/* Playhead */}
                            <div style={{
                                position: 'absolute',
                                left: `${(curSimTime / totalSimTime) * 100}%`,
                                top: 0, width: 2, height: '100%',
                                background: '#ffffff',
                                opacity: 0.85,
                                pointerEvents: 'none',
                                transform: 'translateX(-50%)',
                                boxShadow: '0 0 5px rgba(255,255,255,0.5)',
                            }} />

                            {/* Op label tooltip on the active segment */}
                            {(() => {
                                const curOp = curMove >= 0
                                    ? operationBlocks.find(op => curMove >= op.startMove && curMove <= op.endMove)
                                    : null;
                                if (!curOp) return null;
                                const opStart = moves_[curOp.startMove]?.tStart ?? 0;
                                const opEnd   = moves_[curOp.endMove]?.tEnd ?? opStart;
                                const midPct  = ((opStart + opEnd) / 2 / totalSimTime) * 100;
                                return (
                                    <div style={{
                                        position: 'absolute',
                                        left: `${midPct}%`, top: 2,
                                        transform: 'translateX(-50%)',
                                        fontSize: 8, fontWeight: 700, whiteSpace: 'nowrap',
                                        color: curOp.cat?.color ?? C.text,
                                        pointerEvents: 'none',
                                        textShadow: '0 1px 3px #000',
                                        letterSpacing: '0.04em',
                                        maxWidth: 120,
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {curOp.label.split(' ').slice(0, 3).join(' ')}
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })()}

                {/* ══ TRANSPORT BAR — Sprint 0: visible for both 2D and 3D ══ */}
                {hasSimulatablePath && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '0 16px', height: 48, flexShrink: 0,
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

                        {/* Divider */}
                        <div style={{ width: 1, height: 20, background: C.border, marginLeft: 4 }} />

                        {/* Sprint 0: Slider is time-based for 2D, move-based for 3D */}
                        {simView === '2d' ? (
                            <input
                                type="range"
                                min={0} max={100} step={0.05}
                                value={totalSimTime > 0 ? (curSimTime / totalSimTime) * 100 : 0}
                                onChange={e => {
                                    setSimPlaying(false);
                                    const t = (parseFloat(e.target.value) / 100) * totalSimTime;
                                    setCurSimTime(t);
                                    // Derive move index from time
                                    const mv = parsedPreview.moves;
                                    let lo = 0, hi = mv.length - 1;
                                    while (lo <= hi) {
                                        const mid = (lo + hi) >>> 1;
                                        if (t < mv[mid].tStart) hi = mid - 1;
                                        else if (t > mv[mid].tEnd) lo = mid + 1;
                                        else { setCurMove(mid); setCurrentLineIdx(mv[mid].lineIdx ?? -1); break; }
                                    }
                                }}
                                style={{ flex: 1, height: 3, accentColor: C.blue, cursor: 'pointer', minWidth: 80 }}
                            />
                        ) : (
                            <input
                                type="range"
                                min={0}
                                max={Math.max(0, displayTotal - 1)}
                                value={curMove < 0 ? 0 : curMove}
                                onChange={handleSlider}
                                style={{ flex: 1, height: 3, accentColor: C.blue, cursor: 'pointer', minWidth: 80 }}
                            />
                        )}

                        {/* Time display */}
                        <span style={{
                            fontSize: 11,
                            color: curSimTime > 0 ? C.blueHi : C.muted,
                            fontFamily: '"JetBrains Mono", monospace',
                            fontVariantNumeric: 'tabular-nums',
                            minWidth: 110, textAlign: 'center',
                            whiteSpace: 'nowrap',
                        }}>
                            {fmtSimTime(curSimTime)} / {fmtSimTime(totalSimTime)}
                        </span>

                        <div style={{ width: 1, height: 20, background: C.border }} />

                        {/* Speed chips */}
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
                    </div>
                )}

            </div> {/* end body flex column */}

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
                    disabled={!gcode || hasBlocking}
                    title={hasBlocking ? 'Corrija os bloqueios antes de baixar o G-code executável' : 'Baixar G-code'}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '0 14px', height: 34, borderRadius: 6,
                        background: C.panel2, border: `1px solid ${C.border}`,
                        color: gcode && !hasBlocking ? C.text : C.muted,
                        cursor: gcode && !hasBlocking ? 'pointer' : 'not-allowed',
                        opacity: gcode && !hasBlocking ? 1 : 0.5,
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
