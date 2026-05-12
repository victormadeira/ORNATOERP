import { useState, useEffect, useRef, Fragment } from 'react';
import { MapPin, Phone, Mail, Calendar, MessageSquare, Lock, CheckCircle2, Printer, PauseCircle, Clock, Play, AlertCircle, Send, User, Camera, X, ChevronLeft, ChevronRight, ZoomIn, Ruler, ClipboardCheck, ShoppingCart, Factory, Paintbrush, Truck, Wrench, ListChecks, Scissors, Layers, FileText, Download, DollarSign, Activity, Bell } from 'lucide-react';
import { initClarity, identifyClarity, setClarityTag } from '../utils/clarity';

const dtFmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const timeFmt = (s) => {
    if (!s) return '';
    const d = new Date(s + 'Z');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const mkStatusEtapa = (accent) => ({
    nao_iniciado: { label: 'Não iniciado', color: 'var(--muted)', Icon: PauseCircle },
    pendente:     { label: 'Pendente',     color: 'var(--muted)', Icon: Clock },
    em_andamento: { label: 'Em andamento', color: accent, Icon: Play },
    concluida:    { label: 'Concluída',    color: 'var(--success)', Icon: CheckCircle2 },
    atrasada:     { label: 'Atrasada',     color: 'var(--danger)', Icon: AlertCircle },
});

const mkStatusProj = (accent) => ({
    nao_iniciado: { label: 'Não iniciado', color: 'var(--muted)' },
    em_andamento: { label: 'Em andamento', color: accent },
    atrasado:     { label: 'Atrasado',     color: 'var(--danger)' },
    concluido:    { label: 'Concluído',    color: 'var(--success)' },
    suspenso:     { label: 'Suspenso',     color: 'var(--warning)' },
});

// ─── Helpers para o Gantt Premium ──────────────────────
const calcProgresso = (etapa) => {
    if (etapa.status === 'concluida') return 100;
    if (etapa.status === 'nao_iniciado' || etapa.status === 'pendente') return 0;
    // Usar progresso manual definido no sistema (slider 0-100)
    if (etapa.progresso != null) return Math.min(etapa.progresso, 100);
    // Fallback: estimar por datas apenas se nunca definiram progresso
    if (!etapa.data_inicio || !etapa.data_vencimento) return 0;
    const s = new Date(etapa.data_inicio + 'T12:00:00').getTime();
    const e = new Date(etapa.data_vencimento + 'T12:00:00').getTime();
    const now = Date.now();
    if (now <= s) return 0;
    if (now >= e) return 100;
    return Math.round(((now - s) / (e - s)) * 100);
};

const getEtapaIcon = (nome) => {
    const n = (nome || '').toLowerCase();
    if (/medi|levantamento/.test(n)) return Ruler;
    if (/aprova/.test(n)) return ClipboardCheck;
    if (/compra|material/.test(n)) return ShoppingCart;
    if (/produ|fabrica/.test(n)) return Factory;
    if (/acabamento|pintura/.test(n)) return Paintbrush;
    if (/entrega/.test(n)) return Truck;
    if (/instala|montagem/.test(n)) return Wrench;
    return ListChecks;
};

const getEtapaDesc = (nome) => {
    const n = (nome || '').toLowerCase();
    if (/medi|levantamento/.test(n)) return 'Nosso técnico está realizando as medições precisas no local.';
    if (/aprova/.test(n)) return 'O projeto está sendo revisado para garantir tudo perfeito.';
    if (/compra|material/.test(n)) return 'Estamos adquirindo os materiais de alta qualidade para seu projeto.';
    if (/produ|fabrica/.test(n)) return 'Seus móveis estão sendo fabricados com cuidado na nossa marcenaria.';
    if (/acabamento|pintura/.test(n)) return 'Aplicando acabamentos finais para garantir qualidade e beleza.';
    if (/entrega/.test(n)) return 'Seus móveis serão entregues e instalados por nossa equipe.';
    if (/instala|montagem/.test(n)) return 'Nossa equipe está montando tudo com atenção aos detalhes.';
    return 'Etapa em andamento no seu projeto.';
};

const calcDiasRestantes = (etapa) => {
    if (!etapa.data_vencimento) return null;
    const end = new Date(etapa.data_vencimento + 'T12:00:00').getTime();
    const dias = Math.ceil((end - Date.now()) / 86400000);
    if (dias < 0) return { texto: `${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? 's' : ''} atrasado`, atrasado: true };
    if (dias === 0) return { texto: 'Vence hoje', atrasado: false };
    return { texto: `${dias} dia${dias !== 1 ? 's' : ''} restante${dias !== 1 ? 's' : ''}`, atrasado: false };
};

function AnimatedCounter({ value, duration = 1000 }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        if (value <= 0) { setDisplay(0); return; }
        let start = 0;
        const step = value / (duration / 16);
        const id = setInterval(() => {
            start += step;
            if (start >= value) { setDisplay(value); clearInterval(id); }
            else setDisplay(Math.round(start));
        }, 16);
        return () => clearInterval(id);
    }, [value]);
    return display;
}

const GANTT_STYLES = `
@keyframes ganttShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes ganttPulseGlow { 0%, 100% { box-shadow: 0 0 4px 1px rgba(239,68,68,0.3); } 50% { box-shadow: 0 0 10px 3px rgba(239,68,68,0.55); } }
@keyframes ganttTodayPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
@keyframes ganttSlideIn { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
@keyframes ganttCheckPop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 1; } }
@keyframes ganttDashMove { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -20; } }
@keyframes ganttProgressFill { from { width: 0%; } }
@keyframes ganttBarShine { 0% { left: -40%; } 100% { left: 140%; } }
.gantt-progress-active { position: relative; overflow: hidden; }
.gantt-progress-active::after {
  content: ''; position: absolute; top: 0; left: -40%; width: 30%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
  animation: ganttBarShine 2.4s ease-in-out infinite;
}
.gantt-bar:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important; }
@keyframes ganttDiamondPulse { 0%, 100% { transform: rotate(45deg) scale(1); } 50% { transform: rotate(45deg) scale(1.15); } }
.gantt-diamond:hover { transform: rotate(45deg) scale(1.35) !important; filter: brightness(1.1); }
.gantt-tooltip { opacity: 0; pointer-events: none; transition: opacity 0.2s; }
.gantt-bar:hover + .gantt-tooltip, .gantt-bar:hover ~ .gantt-tooltip { opacity: 1; }
`;

// ─── Gantt Premium para o portal público ──────────
function GanttPublic({ etapas, primary = '#1B2A4A', accent = '#B7654A' }) {
    const [hoveredIdx, setHoveredIdx] = useState(null);
    const timelineRef = useRef(null);

    if (!etapas || etapas.length === 0) return null;

    const dts = etapas.flatMap(e => [e.data_inicio, e.data_vencimento].filter(Boolean));
    if (dts.length < 2) return null;

    const toMs = d => new Date(d + 'T12:00:00').getTime();
    const DAY = 86400000;
    const rawMin = Math.min(...dts.map(toMs));
    const rawMax = Math.max(...dts.map(toMs));
    const minMs = rawMin - 2 * DAY;
    const maxMs = rawMax + 7 * DAY;
    const totalMs = Math.max(maxMs - minMs, DAY);

    const today = Date.now();
    const todayPct = ((today - minMs) / totalMs) * 100;
    const showToday = todayPct >= -2 && todayPct <= 102;

    const spanDays = (rawMax - rawMin) / DAY;
    const gridLines = [];
    if (spanDays <= 60) {
        let d = new Date(minMs);
        d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
        while (d.getTime() <= maxMs) {
            const pct = (d.getTime() - minMs) / totalMs * 100;
            if (pct > 0 && pct < 100) gridLines.push({ pct, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) });
            d.setDate(d.getDate() + 7);
        }
    } else {
        let d = new Date(minMs); d.setDate(1); d.setMonth(d.getMonth() + 1);
        while (d.getTime() <= maxMs) {
            const pct = (d.getTime() - minMs) / totalMs * 100;
            if (pct > 0 && pct < 100) gridLines.push({ pct, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) });
            d.setMonth(d.getMonth() + 1);
        }
    }

    const months = [];
    { let cur = new Date(minMs); cur.setDate(1);
      while (cur.getTime() <= maxMs) {
          const pct = (cur.getTime() - minMs) / totalMs * 100;
          months.push({ label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), pct: Math.max(0, pct) });
          cur.setMonth(cur.getMonth() + 1);
      }
    }

    const STATUS = mkStatusEtapa(accent);
    const ROW_H = 48;

    // Etapa atual e previsão
    const currentEtapa = etapas.find(e => e.status === 'em_andamento' || e.status === 'atrasada') || etapas.find(e => e.status !== 'concluida') || etapas[etapas.length - 1];
    const lastEtapa = [...etapas].reverse().find(e => e.data_vencimento) || etapas[etapas.length - 1];
    const globalProg = Math.round(etapas.reduce((sum, e) => sum + calcProgresso(e), 0) / etapas.length);

    const getBarStyle = (status) => {
        // No portal: atrasada mascarada como em_andamento
        const effectiveStatus = status === 'atrasada' ? 'em_andamento' : status;
        const base = { position: 'absolute', height: 30, borderRadius: 4, display: 'flex', alignItems: 'center', overflow: 'hidden', zIndex: 2, transition: 'transform 0.2s, box-shadow 0.2s' };
        switch (effectiveStatus) {
            case 'em_andamento':
                return { ...base, background: `linear-gradient(90deg, ${accent}, ${accent}bb, ${accent})`, backgroundSize: '200% 100%', animation: 'ganttShimmer 2.5s ease-in-out infinite', boxShadow: `0 3px 10px ${accent}40` };
            case 'concluida':
                return { ...base, background: 'linear-gradient(135deg, var(--success), var(--success-hover))', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' };
            case 'nao_iniciado': case 'pendente':
                return { ...base, background: 'var(--bg-muted)', border: 'none' };
            default:
                return { ...base, background: 'var(--muted)' };
        }
    };

    // Detectar mobile
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 640);
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ── Mobile: Cards verticais (timeline simplificada) ──
    const renderMobile = () => (
        <div>
            <style>{GANTT_STYLES}</style>

            {/* Context Header */}
            <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: `linear-gradient(135deg, ${primary}08, ${accent}08)`, border: `1px solid ${primary}15` }}>
                <div style={{ fontSize: 13, color: '#334155', marginBottom: 3 }}>
                    Etapa atual: <strong style={{ color: primary }}>{currentEtapa.nome}</strong>
                </div>
                {lastEtapa.data_vencimento && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                        Previsão: <strong style={{ color: '#0f172a' }}>{dtFmt(lastEtapa.data_vencimento)}</strong>
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div className={globalProg < 100 ? 'gantt-progress-active' : ''} style={{ width: `${globalProg}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, ${primary})`, borderRadius: 4, animation: 'ganttProgressFill 1.2s ease-out' }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 14, color: accent, minWidth: 38, textAlign: 'right', fontFamily: 'SF Mono, Monaco, monospace', fontVariantNumeric: 'tabular-nums' }}>
                        <AnimatedCounter value={globalProg} />%
                    </span>
                </div>
            </div>

            {/* Etapas como cards verticais */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {etapas.map((e, i) => {
                    const effectiveStatus = e.status === 'atrasada' ? 'em_andamento' : e.status;
                    const st = STATUS[effectiveStatus] || STATUS.nao_iniciado;
                    const Ic = getEtapaIcon(e.nome);
                    const prog = calcProgresso(e);
                    const isActive = e.status === 'em_andamento' || e.status === 'atrasada';
                    const diasInfo = calcDiasRestantes(e);
                    const isLast = i === etapas.length - 1;

                    return (
                        <div key={e.id} style={{ display: 'flex', gap: 0, animation: `ganttSlideIn 0.4s ease ${i * 80}ms both` }}>
                            {/* Timeline vertical line + dot */}
                            <div style={{ width: 36, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{
                                    width: effectiveStatus === 'concluida' ? 28 : isActive ? 30 : 24,
                                    height: effectiveStatus === 'concluida' ? 28 : isActive ? 30 : 24,
                                    borderRadius: 6,
                                    background: effectiveStatus === 'concluida' ? 'var(--success)' : isActive ? accent : 'var(--bg-muted)',
                                    border: effectiveStatus === 'nao_iniciado' || effectiveStatus === 'pendente' ? '2px dashed #cbd5e1' : `2px solid ${st.color}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    boxShadow: isActive ? `0 0 12px ${accent}40` : 'none',
                                    transition: 'all 0.3s',
                                }}>
                                    {effectiveStatus === 'concluida'
                                        ? <CheckCircle2 size={14} color="#fff" style={{ animation: 'ganttCheckPop 0.5s ease both' }} />
                                        : <Ic size={12} color={isActive ? '#fff' : st.color} />
                                    }
                                </div>
                                {!isLast && (
                                    <div style={{ width: 2, flex: 1, minHeight: 16, background: effectiveStatus === 'concluida' ? 'var(--success)' : '#e2e8f0' }} />
                                )}
                            </div>

                            {/* Card content */}
                            <div style={{
                                flex: 1, paddingBottom: isLast ? 0 : 12, paddingLeft: 10, minWidth: 0,
                            }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 2 }}>{e.nome}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
                                    {e.data_inicio && e.data_vencimento
                                        ? `${dtFmt(e.data_inicio).slice(0, 5)} → ${dtFmt(e.data_vencimento).slice(0, 5)}`
                                        : e.data_vencimento ? dtFmt(e.data_vencimento).slice(0, 5) : ''}
                                    {diasInfo && e.status !== 'concluida' && (
                                        <span style={{ marginLeft: 6, color: diasInfo.atrasado ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                                            {diasInfo.texto}
                                        </span>
                                    )}
                                </div>
                                {/* Progress bar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ flex: 1, background: 'var(--muted-bg)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                                        <div className={isActive ? 'gantt-progress-active' : ''} style={{ width: `${prog}%`, height: '100%', background: st.color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: st.color, minWidth: 28, fontFamily: 'SF Mono, Monaco, monospace', fontVariantNumeric: 'tabular-nums' }}>{prog}%</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // ── Desktop: Gantt horizontal original ──
    const renderDesktop = () => (
        <div>
            <style>{GANTT_STYLES}</style>

            {/* ── Context Header ── */}
            <div style={{ marginBottom: 20, padding: '18px 22px', borderRadius: 6, background: `linear-gradient(135deg, ${primary}08, ${accent}08)`, border: `1px solid ${primary}15` }}>
                <div style={{ fontSize: 15, color: '#334155', marginBottom: 4 }}>
                    Seu projeto está na etapa: <strong style={{ color: primary }}>{currentEtapa.nome}</strong>
                </div>
                {lastEtapa.data_vencimento && (
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
                        Previsão de entrega: <strong style={{ color: '#0f172a' }}>{dtFmt(lastEtapa.data_vencimento)}</strong>
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                        <div className={globalProg < 100 ? 'gantt-progress-active' : ''} style={{ width: `${globalProg}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, ${primary})`, borderRadius: 4, animation: 'ganttProgressFill 1.2s ease-out' }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 16, color: accent, minWidth: 44, textAlign: 'right', fontFamily: 'SF Mono, Monaco, monospace', fontVariantNumeric: 'tabular-nums' }}>
                        <AnimatedCounter value={globalProg} />%
                    </span>
                </div>
            </div>

            {/* ── Split Layout: Sidebar + Timeline ── */}
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#fff' }}>

                {/* Sidebar */}
                <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#fafbfc' }}>
                    {/* Sidebar header */}
                    <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>Etapas</span>
                    </div>
                    {/* Sidebar rows */}
                    {etapas.map((e, i) => {
                        const effectiveStatus = e.status === 'atrasada' ? 'em_andamento' : e.status;
                        const st = STATUS[effectiveStatus] || STATUS.nao_iniciado;
                        const Ic = getEtapaIcon(e.nome);
                        const prog = calcProgresso(e);
                        const isActive = e.status === 'em_andamento' || e.status === 'atrasada';
                        return (
                            <div key={e.id} style={{
                                height: ROW_H, display: 'flex', alignItems: 'center', gap: 8,
                                padding: '0 14px', borderBottom: i < etapas.length - 1 ? '1px solid #f1f5f9' : 'none',
                                animation: `ganttSlideIn 0.4s ease ${i * 100}ms both`,
                                background: isActive ? `${accent}06` : 'var(--bg-muted)',
                                borderLeft: `3px solid ${st.color}`,
                            }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: 4,
                                    background: `${st.color}12`, color: st.color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    fontFamily: 'SF Mono, Monaco, monospace', fontSize: 11, fontWeight: 700,
                                }}>
                                    {effectiveStatus === 'concluida'
                                        ? <CheckCircle2 size={15} style={{ animation: 'ganttCheckPop 0.5s ease both', animationDelay: `${i * 100 + 300}ms` }} />
                                        : <span>{String(i + 1).padStart(2, '0')}</span>
                                    }
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.nome}>
                                        {e.nome}
                                    </div>
                                    <div style={{ fontSize: 10, color: st.color, fontWeight: 600, marginTop: 1, fontFamily: 'SF Mono, Monaco, monospace', fontVariantNumeric: 'tabular-nums' }}>
                                        <AnimatedCounter value={prog} />%
                                    </div>
                                </div>
                                <div style={{ width: 8, height: 8, borderRadius: 3, background: st.color, flexShrink: 0, boxShadow: isActive ? `0 0 6px ${st.color}50` : 'none' }} />
                            </div>
                        );
                    })}
                </div>

                {/* Timeline Area */}
                <div style={{ flex: 1, overflowX: 'auto' }} ref={timelineRef}>
                    {/* Timeline header */}
                    <div style={{ minWidth: 500 }}>
                        {/* Meses */}
                        <div style={{ position: 'relative', height: 24, background: primary }}>
                            {months.map((m, i) => {
                                const nextPct = i < months.length - 1 ? months[i + 1].pct : 100;
                                const mWidth = nextPct - Math.max(0, m.pct);
                                return (
                                    <div key={`m${i}`} style={{
                                        position: 'absolute', left: `${Math.max(0, m.pct)}%`, width: `${mWidth}%`,
                                        fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 700, letterSpacing: '0.03em',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        lineHeight: '24px', paddingLeft: 10, boxSizing: 'border-box',
                                        borderRight: i < months.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none',
                                    }}>{m.label}</div>
                                );
                            })}
                        </div>
                        {/* Semanas */}
                        <div style={{ position: 'relative', height: 18, background: `${primary}ee`, borderBottom: '1px solid #e2e8f0' }}>
                            {gridLines.map((g, i) => (
                                <div key={`g${i}`} style={{
                                    position: 'absolute', left: `${g.pct}%`, top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 600, whiteSpace: 'nowrap',
                                }}>{g.label}</div>
                            ))}
                        </div>
                    </div>

                    {/* Bars container */}
                    <div style={{ position: 'relative', minWidth: 500 }}>
                        {/* Grid lines */}
                        {gridLines.map((g, i) => (
                            <div key={`gl${i}`} style={{ position: 'absolute', left: `${g.pct}%`, top: 0, bottom: 0, width: 1, background: '#e2e8f0', opacity: 0.5, zIndex: 0 }} />
                        ))}

                        {/* Today line */}
                        {showToday && (
                            <div style={{
                                position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0,
                                width: 2, background: 'var(--danger)', zIndex: 10,
                                animation: 'ganttTodayPulse 2s ease-in-out infinite',
                                boxShadow: '0 0 8px rgba(239,68,68,0.4)',
                            }}>
                                <div style={{
                                    position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                                    background: 'var(--danger)', color: '#fff', fontSize: 8, fontWeight: 800,
                                    padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap', letterSpacing: '0.1em',
                                }}>HOJE</div>
                            </div>
                        )}

                        {/* Bars */}
                        {etapas.map((e, i) => {
                            if (!e.data_inicio && !e.data_vencimento) {
                                return <div key={e.id} style={{ height: ROW_H, borderBottom: i < etapas.length - 1 ? '1px solid #f1f5f9' : 'none' }} />;
                            }
                            const s = e.data_inicio ? toMs(e.data_inicio) : toMs(e.data_vencimento);
                            const f = e.data_vencimento ? toMs(e.data_vencimento) : toMs(e.data_inicio);
                            const durationDays = (f - s) / DAY;
                            const isMilestone = durationDays < 1;
                            const isShort = !isMilestone && durationDays <= 2;
                            const left = Math.max(0, (s - minMs) / totalMs * 100);
                            const width = isMilestone ? 0 : Math.max(isShort ? 4.5 : 2, (Math.max(f, s + DAY) - s) / totalMs * 100);
                            const effectiveStatus = e.status === 'atrasada' ? 'em_andamento' : e.status;
                            const barStyle = getBarStyle(e.status);
                            const prog = calcProgresso(e);
                            const diasInfo = calcDiasRestantes(e);
                            const isHovered = hoveredIdx === i;
                            const milestoneColor = effectiveStatus === 'concluida' ? 'var(--success)' : effectiveStatus === 'em_andamento' ? accent : 'var(--muted)';

                            return (
                                <div key={e.id} style={{
                                    position: 'relative', height: ROW_H,
                                    borderBottom: i < etapas.length - 1 ? '1px solid #f1f5f9' : 'none',
                                    display: 'flex', alignItems: 'center',
                                }}>
                                    {/* Bar or Milestone Diamond */}
                                    {isMilestone ? (
                                        <div style={{ position: 'absolute', left: `${left}%`, top: 0, bottom: 0, display: 'flex', alignItems: 'center', zIndex: 3, animation: `ganttSlideIn 0.5s ease ${i * 100}ms both` }}>
                                            <div
                                                className="gantt-diamond"
                                                onMouseEnter={() => setHoveredIdx(i)}
                                                onMouseLeave={() => setHoveredIdx(null)}
                                                style={{
                                                    width: 22, height: 22, marginLeft: -11,
                                                    background: milestoneColor === 'var(--muted)'
                                                        ? 'var(--bg-muted)'
                                                        : `linear-gradient(135deg, ${milestoneColor}, ${milestoneColor}cc)`,
                                                    border: milestoneColor === 'var(--muted)' ? '2px dashed #cbd5e1' : `2px solid ${milestoneColor}`,
                                                    borderRadius: 5,
                                                    animation: 'ganttDiamondPulse 3s ease-in-out infinite',
                                                    boxShadow: milestoneColor !== 'var(--muted)' ? `0 3px 12px ${milestoneColor}35` : 'none',
                                                    cursor: 'default',
                                                    transition: 'filter 0.2s, box-shadow 0.2s',
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="gantt-bar"
                                            onMouseEnter={() => setHoveredIdx(i)}
                                            onMouseLeave={() => setHoveredIdx(null)}
                                            style={{
                                                ...barStyle,
                                                left: `${left}%`, width: `${width}%`,
                                                animation: `${barStyle.animation || ''}, ganttSlideIn 0.5s ease ${i * 100}ms both`.replace(/^,\s*/, ''),
                                                cursor: 'default',
                                            }}
                                        >
                                            {(effectiveStatus === 'nao_iniciado' || effectiveStatus === 'pendente') && (
                                                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 4 }}>
                                                    <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="3"
                                                        fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 4"
                                                        style={{ animation: 'ganttDashMove 2s linear infinite' }} />
                                                </svg>
                                            )}
                                            {effectiveStatus === 'em_andamento' && prog > 0 && prog < 100 && (
                                                <div style={{
                                                    position: 'absolute', left: 0, top: 0, bottom: 0,
                                                    width: `${prog}%`, background: 'rgba(255,255,255,0.2)',
                                                    borderRadius: '4px 0 0 4px',
                                                }} />
                                            )}
                                            {width > 10 && (
                                                <span style={{
                                                    position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 700,
                                                    color: (effectiveStatus === 'nao_iniciado' || effectiveStatus === 'pendente') ? 'var(--muted)' : '#fff',
                                                    padding: '0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    {dtFmt(e.data_inicio).slice(0, 5)} → {dtFmt(e.data_vencimento).slice(0, 5)}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Tooltip */}
                                    {isHovered && (
                                        <div style={{
                                            position: 'absolute',
                                            left: `${Math.min(left + width / 2, 70)}%`,
                                            top: ROW_H - 2,
                                            transform: 'translateX(-50%)',
                                            background: '#fff', border: '1px solid #e2e8f0',
                                            borderRadius: 6, padding: '14px 18px', zIndex: 50,
                                            boxShadow: '0 8px 30px rgba(0,0,0,0.12)', minWidth: 220, maxWidth: 300,
                                            pointerEvents: 'none',
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6 }}>{e.nome}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                                                {dtFmt(e.data_inicio)} → {dtFmt(e.data_vencimento)}
                                            </div>
                                            {diasInfo && e.status !== 'concluida' && (
                                                <div style={{ fontSize: 12, color: diasInfo.atrasado ? 'var(--danger)' : 'var(--success)', fontWeight: 600, marginBottom: 6 }}>
                                                    {diasInfo.texto}
                                                </div>
                                            )}
                                            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8, lineHeight: 1.5, fontStyle: 'italic' }}>
                                                {e.status === 'concluida' ? 'Esta etapa foi concluída com sucesso!' : getEtapaDesc(e.nome)}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, background: 'var(--muted-bg)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                                                    <div style={{ width: `${prog}%`, height: '100%', background: STATUS[effectiveStatus]?.color || 'var(--muted)', borderRadius: 4 }} />
                                                </div>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', fontFamily: 'SF Mono, Monaco, monospace', fontVariantNumeric: 'tabular-nums' }}>{prog}%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[
                    { label: 'Concluída', color: 'var(--success)', style: {} },
                    { label: 'Em andamento', color: accent, style: {} },
                    { label: 'Não iniciado', color: 'var(--muted)', style: { border: '1.5px dashed #94a3b8', background: 'transparent' } },
                ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                        <div style={{ width: 20, height: 10, background: l.color, borderRadius: 4, ...l.style }} />
                        {l.label}
                    </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                    <div style={{ width: 10, height: 10, background: accent, borderRadius: 2, transform: 'rotate(45deg)' }} />
                    Marco
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                    <div style={{ width: 2, height: 12, background: 'var(--danger)', borderRadius: 1, boxShadow: '0 0 4px rgba(239,68,68,0.5)' }} />
                    Hoje
                </div>
            </div>
        </div>
    );

    return isMobile ? renderMobile() : renderDesktop();
}

// ─── Chat de mensagens do portal ──────────────
function PortalChat({ token, mensagens: initialMsgs, accent, primary, clienteNome, msgNaoLidas = 0 }) {
    const [msgs, setMsgs] = useState(initialMsgs || []);
    const [text, setText] = useState('');
    const [nome, setNome] = useState(() => localStorage.getItem(`portal_nome_${token}`) || clienteNome || '');
    const [sending, setSending] = useState(false);
    const [editandoNome, setEditandoNome] = useState(false);
    const chatRef = useRef(null);

    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, [msgs]);

    // Poll for new messages every 15 seconds
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/projetos/portal/${token}`);
                const data = await res.json();
                if (data?.projeto?.mensagens) setMsgs(data.projeto.mensagens);
            } catch { /* silently fail */ }
        }, 15000);
        return () => clearInterval(interval);
    }, [token]);

    const enviar = async () => {
        if (!text.trim()) return;
        if (!nome.trim()) return;

        // Salvar nome específico por projeto
        localStorage.setItem(`portal_nome_${token}`, nome.trim());

        setSending(true);
        try {
            const res = await fetch(`/api/projetos/portal/${token}/mensagens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autor_nome: nome.trim() || clienteNome || 'Cliente', conteudo: text.trim() })
            });
            const msg = await res.json();
            if (msg.id) {
                setMsgs(prev => [...prev, msg]);
                setText('');
            }
        } catch { /* error */ }
        finally { setSending(false); }
    };

    return (
        <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <MessageSquare size={16} style={{ color: accent }} /> Mensagens
                    {msgNaoLidas > 0 && (
                        <span style={{
                            background: 'var(--danger)', color: '#fff', fontSize: 11, fontWeight: 700,
                            padding: '2px 8px', borderRadius: 99, marginLeft: 4,
                        }}>
                            {msgNaoLidas} nova{msgNaoLidas > 1 ? 's' : ''}
                        </span>
                    )}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 24 }}>Concierge do Projeto — Seu consultor direto</span>
            </div>

            {/* Chat area */}
            <div ref={chatRef} style={{
                maxHeight: 360, minHeight: 120, overflowY: 'auto',
                background: 'var(--bg-muted)', borderRadius: 12,
                padding: 16, marginBottom: 16,
                border: '1px solid #e2e8f0'
            }}>
                {msgs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>
                        <MessageSquare size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                        <p>Envie uma mensagem para a equipe</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {msgs.map(m => {
                            const isEquipe = m.autor_tipo === 'equipe';
                            return (
                                <div key={m.id} style={{
                                    display: 'flex',
                                    justifyContent: isEquipe ? 'flex-start' : 'flex-end',
                                }}>
                                    <div style={{
                                        maxWidth: '75%',
                                        background: isEquipe ? '#fff' : `${accent}15`,
                                        border: isEquipe ? '1px solid #e2e8f0' : `1px solid ${accent}30`,
                                        borderRadius: isEquipe ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                                        padding: '10px 14px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <div style={{
                                                width: 20, height: 20, borderRadius: '50%',
                                                background: isEquipe ? `${primary}15` : `${accent}20`,
                                                color: isEquipe ? primary : accent,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 9, fontWeight: 700, flexShrink: 0
                                            }}>
                                                {isEquipe ? (m.autor_nome || 'E')[0].toUpperCase() : <User size={10} />}
                                            </div>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: isEquipe ? primary : accent }}>
                                                {m.autor_nome || (isEquipe ? 'Equipe' : 'Você')}
                                            </span>
                                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{timeFmt(m.criado_em)}</span>
                                        </div>
                                        <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                                            {m.conteudo}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Nome do remetente */}
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                {editandoNome ? (
                    <input
                        type="text"
                        value={nome}
                        onChange={e => setNome(e.target.value)}
                        onBlur={() => { if (nome.trim()) setEditandoNome(false); }}
                        onKeyDown={e => { if (e.key === 'Enter' && nome.trim()) setEditandoNome(false); }}
                        placeholder="Seu nome..."
                        autoFocus
                        style={{
                            flex: 1, padding: '8px 12px',
                            border: '1px solid #e2e8f0', borderRadius: 8,
                            fontSize: 12, outline: 'none', background: '#fff',
                            boxSizing: 'border-box'
                        }}
                        onFocus={e => e.target.style.borderColor = accent}
                    />
                ) : (
                    <button
                        onClick={() => setEditandoNome(true)}
                        style={{
                            background: 'none', border: '1px dashed #cbd5e1', borderRadius: 8,
                            padding: '6px 12px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        <User size={12} /> {nome || 'Definir nome'} <span style={{ fontSize: 10, color: 'var(--muted)' }}>(clique para alterar)</span>
                    </button>
                )}
            </div>

            {/* Message input */}
            <div style={{ display: 'flex', gap: 8 }}>
                <input
                    type="text"
                    aria-label="Mensagem para a marcenaria"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                    placeholder="Escreva sua dúvida ou solicitação..."
                    disabled={sending}
                    style={{
                        flex: 1, padding: '10px 14px',
                        border: '1px solid #e2e8f0', borderRadius: 10,
                        fontSize: 13, outline: 'none', background: '#fff',
                    }}
                    onFocus={e => e.target.style.borderColor = accent}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
                <button
                    onClick={enviar}
                    disabled={sending || !text.trim()}
                    style={{
                        background: accent, color: '#fff', border: 'none',
                        padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                        opacity: (sending || !text.trim()) ? 0.5 : 1,
                    }}
                >
                    <Send size={14} /> Enviar
                </button>
            </div>
        </div>
    );
}

// ─── Documentos do portal ──────────────────────
function PortalDocumentos({ token, accent }) {
    const [arquivos, setArquivos] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/projetos/portal/${token}/arquivos`)
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) setArquivos(d); })
            .catch(e => console.error('Erro ao carregar documentos:', e))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) return null;
    if (arquivos.length === 0) return (
        <div style={{ background: '#fff', padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${accent}12`, border: `1px solid ${accent}30`, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={24} style={{ color: accent }} aria-hidden="true" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0E1116', marginBottom: 6 }}>Ainda não há documentos</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 360, margin: '0 auto' }}>
                Quando a marcenaria disponibilizar projetos, contratos ou desenhos, eles aparecerão aqui para download.
            </div>
        </div>
    );

    const fmtSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
    const isImage = (tipo) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(tipo);
    const getFileIcon = (tipo) => {
        if (['pdf'].includes(tipo)) return { bg: 'var(--danger-bg)', color: 'var(--danger)', label: 'PDF' };
        if (['doc', 'docx'].includes(tipo)) return { bg: 'var(--info-bg)', color: 'var(--info)', label: 'DOC' };
        if (['xls', 'xlsx', 'csv'].includes(tipo)) return { bg: 'var(--success-bg)', color: 'var(--success)', label: 'XLS' };
        if (['dxf', 'dwg'].includes(tipo)) return { bg: 'var(--warning-bg)', color: 'var(--warning)', label: 'CAD' };
        if (isImage(tipo)) return { bg: 'var(--info-bg)', color: 'var(--info)', label: 'IMG' };
        return { bg: 'var(--muted-bg)', color: 'var(--muted)', label: (tipo || '?').toUpperCase().slice(0, 3) };
    };

    return (
        <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} style={{ color: accent }} /> Documentos
            </h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                {arquivos.length} documento{arquivos.length !== 1 ? 's' : ''} disponíve{arquivos.length !== 1 ? 'is' : 'l'}
            </p>

            <div style={{ display: 'grid', gap: 8 }}>
                {arquivos.map(f => {
                    const fi = getFileIcon(f.tipo);
                    return (
                        <a
                            key={f.id}
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 16px', borderRadius: 10,
                                background: 'var(--bg-muted)', border: '1px solid #e2e8f0',
                                textDecoration: 'none', color: 'inherit',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted-bg)'; e.currentTarget.style.borderColor = accent + '50'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-muted)'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                        >
                            {isImage(f.tipo) ? (
                                <img src={f.url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0', flexShrink: 0 }} />
                            ) : (
                                <div style={{
                                    width: 44, height: 44, borderRadius: 8,
                                    background: fi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 700, color: fi.color, flexShrink: 0,
                                }}>{fi.label}</div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                    {fmtSize(f.tamanho)} · {new Date(f.data).toLocaleDateString('pt-BR')}
                                </div>
                            </div>
                            <Download size={16} style={{ color: accent, flexShrink: 0 }} />
                        </a>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Galeria de fotos do portal ──────────────
function PortalGaleria({ token, accent, primary }) {
    const [fotos, setFotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lightbox, setLightbox] = useState(null);
    const [filtroAmb, setFiltroAmb] = useState('');

    useEffect(() => {
        fetch(`/api/projetos/portal/${token}/fotos`)
            .then(r => r.json())
            .then(d => { if (Array.isArray(d)) setFotos(d); })
            .catch(e => console.error('Erro ao carregar fotos:', e))
            .finally(() => setLoading(false));
    }, [token]);

    // Lista de ambientes únicos
    const ambientes = [...new Set(fotos.map(f => f.ambiente || 'Geral').filter(Boolean))];

    // Fotos filtradas pelo ambiente selecionado
    const fotosFiltradas = filtroAmb
        ? fotos.filter(f => (f.ambiente || 'Geral') === filtroAmb)
        : fotos;

    // Navegação do lightbox (navega dentro das filtradas)
    const navLightbox = (dir) => {
        if (lightbox === null) return;
        const next = lightbox + dir;
        if (next >= 0 && next < fotosFiltradas.length) setLightbox(next);
    };

    // Fechar com Escape, navegar com setas
    useEffect(() => {
        if (lightbox === null) return;
        const handler = (e) => {
            if (e.key === 'Escape') setLightbox(null);
            if (e.key === 'ArrowLeft') navLightbox(-1);
            if (e.key === 'ArrowRight') navLightbox(1);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [lightbox, fotosFiltradas.length]);

    if (loading) return null;
    if (fotos.length === 0) return (
        <div style={{ background: '#fff', padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${accent}12`, border: `1px solid ${accent}30`, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={24} style={{ color: accent }} aria-hidden="true" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0E1116', marginBottom: 6 }}>Nenhuma foto ainda</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 380, margin: '0 auto' }}>
                Conforme a montagem avançar, nossa equipe vai postar aqui fotos de cada ambiente para você acompanhar.
            </div>
        </div>
    );

    return (
        <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Camera size={16} style={{ color: accent }} /> Fotos da Montagem
            </h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                {fotosFiltradas.length} foto{fotosFiltradas.length !== 1 ? 's' : ''}
                {filtroAmb ? ` em ${filtroAmb}` : ` registrada${fotos.length !== 1 ? 's' : ''}`}
            </p>

            {/* Filtro por ambiente (tabs) */}
            {ambientes.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setFiltroAmb('')}
                        style={{
                            padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                            border: `1.5px solid ${!filtroAmb ? accent : '#e2e8f0'}`,
                            background: !filtroAmb ? `${accent}15` : '#fff',
                            color: !filtroAmb ? accent : 'var(--muted)',
                            cursor: 'pointer', transition: 'all 0.15s',
                        }}
                    >
                        Todos ({fotos.length})
                    </button>
                    {ambientes.map(amb => {
                        const count = fotos.filter(f => (f.ambiente || 'Geral') === amb).length;
                        const active = filtroAmb === amb;
                        return (
                            <button
                                key={amb}
                                onClick={() => setFiltroAmb(active ? '' : amb)}
                                style={{
                                    padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                                    border: `1.5px solid ${active ? accent : '#e2e8f0'}`,
                                    background: active ? `${accent}15` : '#fff',
                                    color: active ? accent : 'var(--muted)',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                            >
                                {amb} ({count})
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Grid de fotos */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 10,
            }}>
                {fotosFiltradas.map((f, idx) => (
                    <div
                        key={f.id}
                        onClick={() => setLightbox(idx)}
                        style={{
                            position: 'relative',
                            paddingBottom: '100%',
                            borderRadius: 10,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            background: 'var(--muted-bg)',
                            border: '1px solid #e2e8f0',
                        }}
                    >
                        <img
                            src={f.url}
                            alt={f.ambiente || 'Foto'}
                            loading="lazy"
                            style={{
                                position: 'absolute',
                                top: 0, left: 0,
                                width: '100%', height: '100%',
                                objectFit: 'cover',
                                transition: 'transform 0.2s',
                            }}
                            onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                        />
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
                            padding: '18px 8px 6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <span style={{ fontSize: 10, color: '#fff', opacity: 0.9, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <ZoomIn size={10} />
                                {new Date(f.criado_em + 'Z').toLocaleDateString('pt-BR')}
                            </span>
                            {!filtroAmb && f.ambiente && (
                                <span style={{ fontSize: 9, color: '#fff', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: 6, fontWeight: 600 }}>
                                    {f.ambiente}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── Lightbox fullscreen ──────────── */}
            {lightbox !== null && fotosFiltradas[lightbox] && (
                <div
                    onClick={() => setLightbox(null)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.92)',
                        zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {/* Fechar */}
                    <button
                        onClick={() => setLightbox(null)}
                        style={{
                            position: 'absolute', top: 16, right: 16,
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            color: '#fff', borderRadius: '50%', width: 40, height: 40,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 10,
                        }}
                    >
                        <X size={20} />
                    </button>

                    {/* Navegação anterior */}
                    {lightbox > 0 && (
                        <button
                            onClick={e => { e.stopPropagation(); navLightbox(-1); }}
                            style={{
                                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                                background: 'rgba(255,255,255,0.15)', border: 'none',
                                color: '#fff', borderRadius: '50%', width: 44, height: 44,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <ChevronLeft size={24} />
                        </button>
                    )}

                    {/* Foto */}
                    <img
                        src={fotosFiltradas[lightbox].url}
                        alt=""
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '90vw', maxHeight: '85vh',
                            objectFit: 'contain', borderRadius: 8,
                            boxShadow: '0 4px 30px rgba(0,0,0,0.5)',
                        }}
                    />

                    {/* Navegação próxima */}
                    {lightbox < fotosFiltradas.length - 1 && (
                        <button
                            onClick={e => { e.stopPropagation(); navLightbox(1); }}
                            style={{
                                position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                                background: 'rgba(255,255,255,0.15)', border: 'none',
                                color: '#fff', borderRadius: '50%', width: 44, height: 44,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <ChevronRight size={24} />
                        </button>
                    )}

                    {/* Info da foto */}
                    <div style={{
                        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.6)', borderRadius: 10,
                        padding: '8px 18px', color: '#fff', fontSize: 12,
                        display: 'flex', alignItems: 'center', gap: 12,
                        whiteSpace: 'nowrap',
                    }}>
                        <span style={{ fontWeight: 700 }}>{lightbox + 1} / {fotosFiltradas.length}</span>
                        {fotosFiltradas[lightbox].ambiente && (
                            <span style={{ opacity: 0.7 }}>{fotosFiltradas[lightbox].ambiente}</span>
                        )}
                        {fotosFiltradas[lightbox].nome_montador && (
                            <span style={{ opacity: 0.7 }}>por {fotosFiltradas[lightbox].nome_montador}</span>
                        )}
                        <span style={{ opacity: 0.5 }}>
                            {new Date(fotosFiltradas[lightbox].criado_em + 'Z').toLocaleDateString('pt-BR')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Página pública do Portal do Cliente ──────────────
export default function PortalCliente({ token, isPreview = false }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chatOpen, setChatOpen] = useState(false);

    useEffect(() => {
        const authToken = localStorage.getItem('erp_token');
        const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
        const endpoint = isPreview ? `/api/projetos/portal-preview/${token}` : `/api/projetos/portal/${token}`;
        fetch(endpoint, { headers })
            .then(r => r.json())
            .then(d => {
                if (d.error) setError(d.error);
                else setData(d);
            })
            .catch(() => setError('Não foi possível carregar o projeto'))
            .finally(() => setLoading(false));

        // Microsoft Clarity (skipa preview e localhost)
        if (!isPreview) {
            initClarity();
            setClarityTag('page', 'portal-cliente');
            if (token) identifyClarity(token, '', '', `Portal ${token.slice(0, 8)}`);
        }

        // Solicitar geolocalização (apenas acesso público, não preview)
        if (!isPreview && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    fetch(`/api/projetos/portal/${token}/localizacao`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                    }).catch(() => {});
                },
                () => {}, // Usuário negou ou erro — silencioso
                { timeout: 10000, maximumAge: 300000 }
            );
        }
    }, [token, isPreview]);

    // Clarity: enriquece tags quando data carrega (cliente, projeto)
    useEffect(() => {
        if (isPreview || !data) return;
        if (data.cliente?.nome) setClarityTag('cliente', data.cliente.nome);
        if (data.projeto?.nome) setClarityTag('projeto', data.projeto.nome);
        if (data.projeto?.numero) setClarityTag('projeto_numero', data.projeto.numero);
    }, [data, isPreview]);

    // Identidade Ornato: cobre é hero, grafite é base (default quando empresa não customiza)
    const primary = data?.empresa?.proposta_cor_primaria || '#0E1116';   // grafite profundo
    const accent  = data?.empresa?.proposta_cor_accent  || '#C9A96E';   // cobre / rose gold
    const ink   = '#0E1116';  // texto display (headings)
    const paper = '#FAFAF8';  // off-white warm
    const font = "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    if (loading) return (
        <div style={{ minHeight: '100vh', background: paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font }}>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 20px' }}>
                    <div style={{ position: 'absolute', inset: 0, border: `2px solid ${accent}22`, borderTopColor: accent, borderRadius: '50%', animation: 'spinPortal 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite' }} />
                    <div style={{ position: 'absolute', inset: 8, border: `2px solid ${accent}15`, borderRightColor: accent, borderRadius: '50%', animation: 'spinPortal 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite reverse' }} />
                </div>
                <p style={{ fontSize: 13, color: ink, fontWeight: 600, letterSpacing: '0.02em' }}>Carregando seu portal</p>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, letterSpacing: '0.04em' }}>um instante…</p>
            </div>
            <style>{`@keyframes spinPortal { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (error) return (
        <div style={{ minHeight: '100vh', background: paper, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font }}>
            <div style={{ textAlign: 'center', maxWidth: 420, padding: 40, background: '#fff', borderRadius: 16, border: `1px solid ${accent}25`, borderTop: `3px solid ${accent}` }}>
                <div style={{ width: 64, height: 64, background: `${accent}12`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: accent, border: `1.5px solid ${accent}40` }}><Lock size={28} aria-hidden="true" /></div>
                <h2 style={{ color: ink, marginBottom: 8, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Link inválido ou expirado</h2>
                <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{error}</p>
            </div>
        </div>
    );

    const { projeto, empresa } = data;
    const etapas = projeto.etapas || [];
    const ocorrencias = projeto.ocorrencias || [];
    const mensagens = projeto.mensagens || [];
    const pagamento = projeto.pagamento || null;
    const atividades = projeto.atividades || [];
    const msgNaoLidas = projeto.msgNaoLidas || 0;
    const concluidasPct = etapas.length
        ? Math.round(etapas.filter(e => e.status === 'concluida').length / etapas.length * 100)
        : 0;

    const STATUS_ETAPA = mkStatusEtapa(accent);
    const STATUS_PROJ = mkStatusProj(accent);
    // No portal, "atrasado" aparece como "em andamento" para o cliente
    const portalStatus = projeto.status === 'atrasado' ? 'em_andamento' : projeto.status;
    const statusProj = STATUS_PROJ[portalStatus] || STATUS_PROJ.nao_iniciado;

    return (
        <div style={{ minHeight: '100vh', background: paper, fontFamily: font, padding: '32px 16px' }}>
            <style>{`
                @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes ganttBarShine { 0% { left: -40%; } 100% { left: 140%; } }
                @keyframes pulseDot { 0%, 100% { box-shadow: 0 0 0 0 ${accent}55; } 50% { box-shadow: 0 0 0 6px ${accent}00; } }
                @keyframes progressDraw { from { stroke-dashoffset: 377; } }
                .gantt-progress-active { position: relative; overflow: hidden; }
                .gantt-progress-active::after {
                    content: ''; position: absolute; top: 0; left: -40%; width: 30%; height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
                    animation: ganttBarShine 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
                .portal-card { animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1); max-width: 820px; margin: 0 auto; }
                .portal-card button { border: 0; box-shadow: none; }
                .portal-card button:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; border-radius: 6px; }
                .portal-card a:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; border-radius: 6px; }
                @media (max-width: 600px) {
                    .portal-card > div { padding-left: 18px !important; padding-right: 18px !important; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .portal-card, .gantt-progress-active::after { animation: none !important; }
                }
                @media print { body { background: white !important; } .no-print { display: none !important; } }
            `}</style>

            {/* Banner de preview */}
            {isPreview && (
                <div className="no-print" style={{
                    background: 'linear-gradient(90deg, var(--warning), var(--warning-hover))', color: '#fff',
                    padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700,
                    borderRadius: 10, marginBottom: 16, maxWidth: 800, margin: '0 auto 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                    PREVIEW INTERNO — Notificações não são enviadas
                </div>
            )}

            <div className="portal-card">

                {/* ─── Cabeçalho editorial ───────────────────── */}
                <div style={{
                    background: '#fff', borderRadius: '16px 16px 0 0',
                    padding: '28px 32px 26px', borderBottom: `1px solid ${accent}20`,
                    position: 'relative', overflow: 'hidden',
                }}>
                    {/* Top stripe cobre — detalhe editorial */}
                    <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accent} 0%, ${accent}cc 50%, ${accent} 100%)` }} />

                    {/* Logo + kicker */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 22 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {empresa.logo_header_path ? (
                                <img src={empresa.logo_header_path} alt={empresa.nome || 'Logo'} style={{ height: 40, maxWidth: 160, objectFit: 'contain' }} />
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                        width: 38, height: 38, background: `${accent}15`, color: accent, borderRadius: 10,
                                        border: `1.5px solid ${accent}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em',
                                    }} aria-hidden="true">{(empresa.nome || 'M')[0]}</div>
                                    <span style={{ fontWeight: 700, fontSize: 15, color: ink, letterSpacing: '-0.01em' }}>{empresa.nome || 'Marcenaria'}</span>
                                </div>
                            )}
                        </div>
                        {/* Kicker editorial — só aparece em telas >= 500px */}
                        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: accent }}>
                            <span aria-hidden="true" style={{ width: 16, height: 1, background: accent, opacity: 0.6 }} />
                            Portal do Cliente
                        </div>
                    </div>

                    {/* Hero split: saudação à esquerda + progresso ring à direita */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                            <h1 style={{ color: ink, fontSize: 26, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
                                Olá, {(projeto.cliente_nome || '').trim() || 'Cliente'}
                            </h1>
                            <p style={{ color: '#475569', fontSize: 13.5, margin: 0, lineHeight: 1.5, maxWidth: 420 }}>
                                {concluidasPct >= 100 ? 'Seu projeto foi concluído! Um prazer trabalhar com você.' :
                                 concluidasPct > 0 ? `Seu projeto está em andamento — ${concluidasPct}% concluído.` :
                                 'Acompanhe aqui todas as etapas do seu projeto.'}
                            </p>
                        </div>

                        {/* Progresso ring SVG — momento hero */}
                        <div style={{ flexShrink: 0 }} role="img" aria-label={`Progresso geral: ${concluidasPct}%`}>
                            <div style={{ position: 'relative', width: 120, height: 120 }}>
                                <svg width="120" height="120" viewBox="0 0 140 140" aria-hidden="true">
                                    <circle cx="70" cy="70" r="60" fill="none" stroke={`${accent}18`} strokeWidth="8" />
                                    <circle cx="70" cy="70" r="60" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round" strokeDasharray={377} strokeDashoffset={377 - (377 * concluidasPct / 100)} transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                                </svg>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ fontSize: 30, fontWeight: 800, color: ink, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{concluidasPct}<span style={{ fontSize: 14, color: accent, fontWeight: 700 }}>%</span></div>
                                    <div style={{ fontSize: 8.5, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 4 }}>concluído</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Info grid — sempre 3 cards, refinados */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 22 }}>
                        <div style={{ background: paper, borderRadius: 10, padding: '11px 14px', border: `1px solid ${accent}18`, borderLeft: `3px solid ${accent}` }}>
                            <div style={{ fontSize: 9.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4, fontWeight: 700 }}>Projeto</div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{projeto.nome || '—'}</div>
                        </div>
                        <div style={{ background: paper, borderRadius: 10, padding: '11px 14px', border: `1px solid ${accent}18` }}>
                            <div style={{ fontSize: 9.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4, fontWeight: 700 }}>Status</div>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                background: `${statusProj.color}12`, color: statusProj.color,
                                fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                                border: `1px solid ${statusProj.color}33`,
                            }}>
                                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: statusProj.color }} />
                                {statusProj.label}
                            </span>
                        </div>
                        {projeto.data_inicio ? (
                            <div style={{ background: paper, borderRadius: 10, padding: '11px 14px', border: `1px solid ${accent}18` }}>
                                <div style={{ fontSize: 9.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4, fontWeight: 700 }}>Período</div>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: ink, fontVariantNumeric: 'tabular-nums' }}>
                                    {dtFmt(projeto.data_inicio)} <span style={{ color: accent, margin: '0 2px' }}>→</span> {dtFmt(projeto.data_vencimento)}
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: paper, borderRadius: 10, padding: '11px 14px', border: `1px solid ${accent}18` }}>
                                <div style={{ fontSize: 9.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4, fontWeight: 700 }}>Etapas</div>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: ink, fontVariantNumeric: 'tabular-nums' }}>
                                    {etapas.filter(e => e.status === 'concluida').length}<span style={{ color: '#94a3b8', fontWeight: 500 }}>/{etapas.length}</span> <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>concluídas</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ─── Banner última atualização (opção B) ─────── */}
                {(() => {
                    // Encontrar a atividade ou etapa concluída mais recente
                    const ultimaAtividade = atividades.length > 0 ? atividades[0] : null;
                    const ultimaEtapaConcluida = etapas.find(e => e.status === 'concluida' && e.data_fim);
                    const ultimaData = ultimaAtividade?.criado_em || ultimaEtapaConcluida?.data_fim;
                    if (!ultimaData) return null;

                    const agora = new Date();
                    const dataUlt = new Date(ultimaData);
                    const diasAtras = Math.floor((agora - dataUlt) / (1000 * 60 * 60 * 24));

                    // Opção B: < 7 dias = destaque verde, 7-30 dias = neutro, > 30 dias = não mostra
                    if (diasAtras > 30) return null;

                    const isRecente = diasAtras >= 0 && diasAtras < 7;
                    const texto = ultimaAtividade?.descricao || `Etapa "${ultimaEtapaConcluida?.nome}" foi concluída`;
                    const tempoLabel = diasAtras < 0 ? 'Hoje' : diasAtras === 0 ? 'Hoje' : diasAtras === 1 ? 'Ontem' : `Há ${diasAtras} dias`;

                    return (
                        <div style={{
                            background: isRecente ? `${accent}10` : 'var(--bg-muted)',
                            padding: '12px 32px',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: isRecente ? 'var(--success)' : 'var(--muted)',
                                flexShrink: 0,
                                ...(isRecente ? { animation: 'pulse 2s infinite' } : {}),
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>
                                    <strong style={{ color: isRecente ? accent : 'var(--muted)' }}>{tempoLabel}:</strong>{' '}
                                    {texto.length > 80 ? texto.slice(0, 80) + '…' : texto}
                                </span>
                            </div>
                        </div>
                    );
                })()}

                {/* ─── Seção: Cronograma ───────────────────────── */}
                {/* ─── Etapas / Cronograma ────────────────────── */}
                <div style={{ background: '#fff', padding: '24px 32px' }}>
                    <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}><Calendar size={16} style={{ color: accent }} /> Cronograma</h2>

                    <GanttPublic etapas={etapas} primary={accent} accent={primary} />

                </div>

                {/* ─── Ambientes do Projeto ──────────────────── */}
                {projeto.ambientes && projeto.ambientes.length > 0 && (() => {
                    const AMB_COMPAT = { corte: 'producao', acabamento: 'expedicao' };
                    const AMB_ST = [
                        { key: 'aguardando', label: 'Aguardando', color: 'var(--muted)', icon: Clock },
                        { key: 'producao', label: 'Produção', color: '#f97316', icon: Factory },
                        { key: 'expedicao', label: 'Expedição', color: 'var(--info)', icon: Truck },
                        { key: 'instalacao', label: 'Instalação', color: 'var(--info)', icon: Wrench },
                        { key: 'concluido', label: 'Concluído', color: 'var(--success)', icon: CheckCircle2 },
                    ];
                    const stMap = Object.fromEntries(AMB_ST.map(s => [s.key, s]));
                    const stIdx = (k) => AMB_ST.findIndex(s => s.key === (AMB_COMPAT[k] || k));
                    const total = projeto.ambientes.length;
                    const done = projeto.ambientes.filter(a => a.status === 'concluido').length;
                    // Migrar status antigos
                    const ambs = projeto.ambientes.map(a => ({ ...a, status: AMB_COMPAT[a.status] || a.status }));

                    return (
                        <div style={{ background: '#fff', padding: '24px 32px', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                    <Layers size={16} style={{ color: accent }} /> Ambientes
                                </h2>
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{done}/{total} concluídos</span>
                            </div>

                            {/* Barra de progresso geral */}
                            <div style={{ background: 'var(--muted-bg)', borderRadius: 6, overflow: 'hidden', height: 6, marginBottom: 18 }}>
                                <div style={{ height: '100%', width: `${total > 0 ? (done / total) * 100 : 0}%`, background: accent, borderRadius: 6, transition: 'width 0.3s' }} />
                            </div>

                            <div style={{ display: 'grid', gap: 12 }}>
                                {ambs.map((amb, i) => {
                                    const st = stMap[amb.status] || stMap.aguardando;
                                    const StIcon = st.icon;
                                    const currentIdx = stIdx(amb.status);
                                    const pct = Math.round((currentIdx / (AMB_ST.length - 1)) * 100);

                                    return (
                                        <div key={amb.id || i} style={{
                                            padding: '16px 20px', borderRadius: 12,
                                            background: amb.status === 'concluido' ? 'var(--success-bg)' : '#fff',
                                            border: '1px solid #f1f5f9',
                                            borderLeft: `3px solid ${st.color}`,
                                            boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
                                            transition: 'box-shadow 0.2s, transform 0.2s',
                                        }}>
                                            {/* Top row: icon + name + status pill + percentage */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                                                {/* Status icon with circular background */}
                                                <div style={{
                                                    width: 38, height: 38, borderRadius: '50%',
                                                    background: st.color + '15',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}>
                                                    <StIcon size={20} style={{ color: st.color }} />
                                                </div>

                                                {/* Name and number */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span style={{
                                                            background: accent, color: 'white', borderRadius: 6,
                                                            padding: '1px 7px', fontSize: 10, fontWeight: 700,
                                                            lineHeight: '18px', minWidth: 22, textAlign: 'center',
                                                        }}>{String(i + 1).padStart(2, '0')}</span>
                                                        <span style={{
                                                            fontWeight: 600, fontSize: 14, color: '#0f172a',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}>{amb.nome}</span>
                                                    </div>
                                                </div>

                                                {/* Percentage */}
                                                <span style={{
                                                    fontSize: 13, fontWeight: 700, color: st.color,
                                                    minWidth: 38, textAlign: 'right', flexShrink: 0,
                                                }}>{pct}%</span>

                                                {/* Status pill */}
                                                <span style={{
                                                    fontSize: 11, padding: '4px 12px', borderRadius: 20,
                                                    background: st.color + '14', color: st.color, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    whiteSpace: 'nowrap', flexShrink: 0,
                                                }}>
                                                    <StIcon size={11} /> {st.label}
                                                </span>
                                            </div>

                                            {/* Mini pipeline — dots + lines row, labels row */}
                                            <div>
                                                {/* Track: dots connected by lines */}
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    {AMB_ST.map((s, si) => {
                                                        const isActive = si <= currentIdx;
                                                        const isCurrent = si === currentIdx;
                                                        const isLast = si === AMB_ST.length - 1;
                                                        const nextActive = (si + 1) <= currentIdx;
                                                        return (
                                                            <Fragment key={s.key}>
                                                                <div style={{
                                                                    width: 12, height: 12, borderRadius: '50%',
                                                                    background: isActive ? st.color : '#d1d5db',
                                                                    border: isCurrent ? '2.5px solid #fff' : 'none',
                                                                    boxShadow: isCurrent ? `0 0 0 2.5px ${st.color}` : 'none',
                                                                    flexShrink: 0,
                                                                }} />
                                                                {!isLast && (
                                                                    <div style={{ flex: 1, height: 2, background: nextActive ? st.color : '#e2e8f0', borderRadius: 1 }} />
                                                                )}
                                                            </Fragment>
                                                        );
                                                    })}
                                                </div>
                                                {/* Labels row */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                                    {AMB_ST.map((s, si) => {
                                                        const isActive = si <= currentIdx;
                                                        const isCurrent = si === currentIdx;
                                                        return (
                                                            <span key={s.key} style={{
                                                                fontSize: 9, color: isActive ? st.color : '#cbd5e1',
                                                                fontWeight: isCurrent ? 700 : 400,
                                                                textAlign: si === 0 ? 'left' : si === AMB_ST.length - 1 ? 'right' : 'center',
                                                                width: si === 0 || si === AMB_ST.length - 1 ? 'auto' : 0,
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {s.label}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                {/* ─── Comunicados (collapsible, dentro do Cronograma) ── */}
                {ocorrencias.length > 0 && (
                    <div style={{ background: '#fff', padding: '24px 32px', borderTop: '1px solid #f1f5f9' }}>
                        <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={16} style={{ color: accent }} /> Comunicados</h2>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {ocorrencias.map(oc => (
                                <div key={oc.id} style={{
                                    padding: '14px 18px', borderRadius: 10,
                                    background: oc.status === 'resolvido' ? 'var(--success-bg)' : 'var(--bg-muted)',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{oc.assunto}</div>
                                        {oc.status === 'resolvido' && (
                                            <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Resolvido</span>
                                        )}
                                    </div>
                                    {oc.descricao && (
                                        <p style={{ fontSize: 13, color: '#334155', margin: '6px 0 0', lineHeight: 1.6 }}>{oc.descricao}</p>
                                    )}
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                                        {oc.autor} · {new Date(oc.criado_em).toLocaleDateString('pt-BR')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── Seção: Fotos ────────────────────────────── */}
                <PortalGaleria token={token} accent={accent} primary={primary} />

                {/* ─── Seção: Documentos ───────────────────────── */}
                <PortalDocumentos token={token} accent={accent} />

                {/* ─── Seção: Financeiro ───────────────────────── */}
                {pagamento && (
                    <div style={{ background: '#fff', padding: '24px 32px', borderTop: '1px solid #f1f5f9' }}>
                        <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <DollarSign size={16} style={{ color: accent }} /> Financeiro
                        </h2>
                        {/* Barra de progresso */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                                <span style={{ color: 'var(--muted)' }}>Pago: <strong style={{ color: 'var(--success)' }}>R$ {(pagamento.totalPago || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                                <span style={{ color: 'var(--muted)' }}>Total: <strong style={{ color: '#0f172a' }}>R$ {(pagamento.totalGeral || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                            </div>
                            <div style={{ background: '#e2e8f0', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                                <div style={{
                                    width: `${pagamento.totalGeral > 0 ? Math.round((pagamento.totalPago / pagamento.totalGeral) * 100) : 0}%`,
                                    height: '100%', background: 'linear-gradient(90deg, var(--success), var(--success-hover))', borderRadius: 99, transition: 'width 0.5s',
                                }} />
                            </div>
                        </div>
                        {/* Lista de parcelas */}
                        <div style={{ display: 'grid', gap: 8 }}>
                            {pagamento.contas.map(c => {
                                const vencida = c.status === 'pendente' && c.data_vencimento && new Date(c.data_vencimento + 'T12:00:00') < new Date();
                                const paga = c.status === 'pago';
                                return (
                                    <div key={c.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 14px', borderRadius: 8,
                                        background: paga ? 'var(--success-bg)' : vencida ? 'var(--danger-bg)' : 'var(--bg-muted)',
                                        border: `1px solid ${paga ? '#bbf7d0' : vencida ? 'var(--danger-border)' : '#e2e8f0'}`,
                                    }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{c.descricao || 'Parcela'}</div>
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                                Vence: {dtFmt(c.data_vencimento)}
                                                {paga && c.data_pagamento ? ` · Pago em ${dtFmt(c.data_pagamento)}` : ''}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: paga ? 'var(--success)' : vencida ? 'var(--danger)' : '#0f172a' }}>
                                                R$ {(c.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </div>
                                            <div style={{
                                                fontSize: 10, fontWeight: 700, marginTop: 2,
                                                color: paga ? 'var(--success)' : vencida ? 'var(--danger)' : 'var(--muted)',
                                            }}>
                                                {paga ? '✓ PAGO' : vencida ? 'VENCIDA' : 'PENDENTE'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ─── Rodapé ─────────────────────────────────── */}
                <div style={{
                    background: '#fff', padding: '20px 32px',
                    borderRadius: '0 0 16px 16px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: 12
                }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        {empresa.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={11} /> {empresa.email}</span>}
                        {empresa.telefone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {empresa.telefone}</span>}
                    </div>
                    <button
                        className="no-print"
                        onClick={() => window.print()}
                        style={{
                            background: primary, color: '#fff', border: 'none',
                            padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6
                        }}
                    >
                        <Printer size={13} /> Imprimir
                    </button>
                </div>

                <div style={{ textAlign: 'center', marginTop: 20, marginBottom: 80, fontSize: 12, color: 'var(--muted)' }}>
                    Portal gerado pelo sistema Ornato ERP
                </div>
            </div>

            {/* ─── Chat FAB ────────────────────────────────── */}
            <button
                className="no-print"
                onClick={() => setChatOpen(true)}
                aria-label={msgNaoLidas > 0 ? `Abrir mensagens (${msgNaoLidas} nova${msgNaoLidas > 1 ? 's' : ''})` : 'Abrir mensagens'}
                style={{
                    position: 'fixed', bottom: 20, right: 20, zIndex: 100,
                    width: 58, height: 58, borderRadius: '50%',
                    background: accent, color: '#fff', border: 'none',
                    boxShadow: '0 10px 28px rgba(15,23,42,0.25), 0 4px 8px rgba(15,23,42,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'transform 0.18s, box-shadow 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
                <MessageSquare size={24} aria-hidden="true" />
                {msgNaoLidas > 0 && (
                    <span aria-hidden="true" style={{
                        position: 'absolute', top: -3, right: -3,
                        background: 'var(--danger)', color: '#fff',
                        minWidth: 22, height: 22, borderRadius: 11,
                        fontSize: 11, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 6px', border: '2px solid #fff',
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        {msgNaoLidas > 9 ? '9+' : msgNaoLidas}
                    </span>
                )}
            </button>

            {/* ─── Chat Drawer ─────────────────────────────── */}
            {chatOpen && (
                <div
                    className="no-print"
                    onClick={() => setChatOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Mensagens"
                    style={{
                        position: 'fixed', inset: 0, zIndex: 200,
                        background: 'rgba(15,23,42,0.55)',
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                        animation: 'portalChatFade 0.2s ease-out',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: '100%', maxWidth: 520,
                            background: '#fff',
                            borderRadius: '16px 16px 0 0',
                            maxHeight: '88vh',
                            display: 'flex', flexDirection: 'column',
                            overflow: 'hidden',
                            animation: 'portalChatSlide 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                        }}
                    >
                        <div style={{
                            padding: '12px 16px', borderBottom: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            flexShrink: 0,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: ink, fontSize: 15 }}>
                                <MessageSquare size={16} style={{ color: accent }} aria-hidden="true" /> Mensagens
                            </div>
                            <button
                                onClick={() => setChatOpen(false)}
                                aria-label="Fechar mensagens"
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    padding: 8, color: 'var(--muted)', borderRadius: 6,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                            <PortalChat
                                token={token}
                                mensagens={mensagens}
                                accent={accent}
                                primary={primary}
                                clienteNome={projeto.cliente_nome}
                                msgNaoLidas={msgNaoLidas}
                            />
                        </div>
                    </div>
                    <style>{`
                        @keyframes portalChatFade { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes portalChatSlide { from { transform: translateY(100%); } to { transform: translateY(0); } }
                    `}</style>
                </div>
            )}
        </div>
    );
}
