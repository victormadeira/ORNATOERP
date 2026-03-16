import { useState, useEffect, useRef } from 'react';
import { MapPin, Phone, Mail, Calendar, MessageSquare, Lock, CheckCircle2, Printer, PauseCircle, Clock, Play, AlertCircle, Send, User, Camera, X, ChevronLeft, ChevronRight, ZoomIn, Ruler, ClipboardCheck, ShoppingCart, Factory, Paintbrush, Truck, Wrench, ListChecks, Scissors, Layers, FileText, Download } from 'lucide-react';

const dtFmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const timeFmt = (s) => {
    if (!s) return '';
    const d = new Date(s + 'Z');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const mkStatusEtapa = (accent) => ({
    nao_iniciado: { label: 'Não iniciado', color: '#94a3b8', Icon: PauseCircle },
    pendente:     { label: 'Pendente',     color: '#94a3b8', Icon: Clock },
    em_andamento: { label: 'Em andamento', color: accent, Icon: Play },
    concluida:    { label: 'Concluída',    color: '#22c55e', Icon: CheckCircle2 },
    atrasada:     { label: 'Atrasada',     color: '#ef4444', Icon: AlertCircle },
});

const mkStatusProj = (accent) => ({
    nao_iniciado: { label: 'Não iniciado', color: '#94a3b8' },
    em_andamento: { label: 'Em andamento', color: accent },
    atrasado:     { label: 'Atrasado',     color: '#ef4444' },
    concluido:    { label: 'Concluído',    color: '#22c55e' },
    suspenso:     { label: 'Suspenso',     color: '#f59e0b' },
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
        const base = { position: 'absolute', height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', overflow: 'hidden', zIndex: 2, transition: 'transform 0.2s, box-shadow 0.2s' };
        switch (effectiveStatus) {
            case 'em_andamento':
                return { ...base, background: `linear-gradient(90deg, ${accent}, ${accent}bb, ${accent})`, backgroundSize: '200% 100%', animation: 'ganttShimmer 2.5s ease-in-out infinite', boxShadow: `0 3px 10px ${accent}40` };
            case 'concluida':
                return { ...base, background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' };
            case 'nao_iniciado': case 'pendente':
                return { ...base, background: '#f8fafc', border: 'none' };
            default:
                return { ...base, background: '#94a3b8' };
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
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                        Previsão: <strong style={{ color: '#0f172a' }}>{dtFmt(lastEtapa.data_vencimento)}</strong>
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                        <div className={globalProg < 100 ? 'gantt-progress-active' : ''} style={{ width: `${globalProg}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, ${primary})`, borderRadius: 99, animation: 'ganttProgressFill 1.2s ease-out' }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 14, color: accent, minWidth: 38, textAlign: 'right' }}>
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
                                    borderRadius: '50%',
                                    background: effectiveStatus === 'concluida' ? '#22c55e' : isActive ? accent : '#f1f5f9',
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
                                    <div style={{ width: 2, flex: 1, minHeight: 16, background: effectiveStatus === 'concluida' ? '#22c55e' : '#e2e8f0' }} />
                                )}
                            </div>

                            {/* Card content */}
                            <div style={{
                                flex: 1, paddingBottom: isLast ? 0 : 12, paddingLeft: 10, minWidth: 0,
                            }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 2 }}>{e.nome}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                                    {e.data_inicio && e.data_vencimento
                                        ? `${dtFmt(e.data_inicio).slice(0, 5)} → ${dtFmt(e.data_vencimento).slice(0, 5)}`
                                        : e.data_vencimento ? dtFmt(e.data_vencimento).slice(0, 5) : ''}
                                    {diasInfo && e.status !== 'concluida' && (
                                        <span style={{ marginLeft: 6, color: diasInfo.atrasado ? '#ef4444' : '#22c55e', fontWeight: 600 }}>
                                            {diasInfo.texto}
                                        </span>
                                    )}
                                </div>
                                {/* Progress bar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                                        <div className={isActive ? 'gantt-progress-active' : ''} style={{ width: `${prog}%`, height: '100%', background: st.color, borderRadius: 99, transition: 'width 0.6s ease' }} />
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: st.color, minWidth: 28 }}>{prog}%</span>
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
            <div style={{ marginBottom: 20, padding: '18px 22px', borderRadius: 14, background: `linear-gradient(135deg, ${primary}08, ${accent}08)`, border: `1px solid ${primary}15` }}>
                <div style={{ fontSize: 15, color: '#334155', marginBottom: 4 }}>
                    Seu projeto está na etapa: <strong style={{ color: primary }}>{currentEtapa.nome}</strong>
                </div>
                {lastEtapa.data_vencimento && (
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                        Previsão de entrega: <strong style={{ color: '#0f172a' }}>{dtFmt(lastEtapa.data_vencimento)}</strong>
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                        <div className={globalProg < 100 ? 'gantt-progress-active' : ''} style={{ width: `${globalProg}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, ${primary})`, borderRadius: 99, animation: 'ganttProgressFill 1.2s ease-out' }} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 16, color: accent, minWidth: 44, textAlign: 'right' }}>
                        <AnimatedCounter value={globalProg} />%
                    </span>
                </div>
            </div>

            {/* ── Split Layout: Sidebar + Timeline ── */}
            <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#fff' }}>

                {/* Sidebar */}
                <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #e2e8f0', background: '#fafbfc' }}>
                    {/* Sidebar header */}
                    <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>Etapas</span>
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
                                background: isActive ? `${accent}06` : 'transparent',
                                borderLeft: isActive ? `3px solid ${accent}` : '3px solid transparent',
                            }}>
                                <div style={{
                                    width: 30, height: 30, borderRadius: 8,
                                    background: `${st.color}12`, color: st.color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    {effectiveStatus === 'concluida'
                                        ? <CheckCircle2 size={15} style={{ animation: 'ganttCheckPop 0.5s ease both', animationDelay: `${i * 100 + 300}ms` }} />
                                        : <Ic size={14} />
                                    }
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.nome}>
                                        {e.nome}
                                    </div>
                                    <div style={{ fontSize: 10, color: st.color, fontWeight: 600, marginTop: 1 }}>
                                        <AnimatedCounter value={prog} />%
                                    </div>
                                </div>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0, boxShadow: isActive ? `0 0 6px ${st.color}50` : 'none' }} />
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
                                width: 2, background: '#ef4444', zIndex: 10,
                                animation: 'ganttTodayPulse 2s ease-in-out infinite',
                                boxShadow: '0 0 8px rgba(239,68,68,0.4)',
                            }}>
                                <div style={{
                                    position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                                    background: '#ef4444', color: '#fff', fontSize: 8, fontWeight: 800,
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
                            const milestoneColor = effectiveStatus === 'concluida' ? '#22c55e' : effectiveStatus === 'em_andamento' ? accent : '#94a3b8';

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
                                                    background: milestoneColor === '#94a3b8'
                                                        ? '#f8fafc'
                                                        : `linear-gradient(135deg, ${milestoneColor}, ${milestoneColor}cc)`,
                                                    border: milestoneColor === '#94a3b8' ? '2px dashed #cbd5e1' : `2px solid ${milestoneColor}`,
                                                    borderRadius: 5,
                                                    animation: 'ganttDiamondPulse 3s ease-in-out infinite',
                                                    boxShadow: milestoneColor !== '#94a3b8' ? `0 3px 12px ${milestoneColor}35` : 'none',
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
                                                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 10 }}>
                                                    <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="9"
                                                        fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="6 4"
                                                        style={{ animation: 'ganttDashMove 2s linear infinite' }} />
                                                </svg>
                                            )}
                                            {effectiveStatus === 'em_andamento' && prog > 0 && prog < 100 && (
                                                <div style={{
                                                    position: 'absolute', left: 0, top: 0, bottom: 0,
                                                    width: `${prog}%`, background: 'rgba(255,255,255,0.2)',
                                                    borderRadius: '10px 0 0 10px',
                                                }} />
                                            )}
                                            {width > 10 && (
                                                <span style={{
                                                    position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 700,
                                                    color: (effectiveStatus === 'nao_iniciado' || effectiveStatus === 'pendente') ? '#94a3b8' : '#fff',
                                                    padding: '0 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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
                                            borderRadius: 12, padding: '14px 18px', zIndex: 50,
                                            boxShadow: '0 8px 30px rgba(0,0,0,0.12)', minWidth: 220, maxWidth: 300,
                                            pointerEvents: 'none',
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 6 }}>{e.nome}</div>
                                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                                                {dtFmt(e.data_inicio)} → {dtFmt(e.data_vencimento)}
                                            </div>
                                            {diasInfo && e.status !== 'concluida' && (
                                                <div style={{ fontSize: 12, color: diasInfo.atrasado ? '#ef4444' : '#22c55e', fontWeight: 600, marginBottom: 6 }}>
                                                    {diasInfo.texto}
                                                </div>
                                            )}
                                            <div style={{ fontSize: 12, color: '#475569', marginBottom: 8, lineHeight: 1.5, fontStyle: 'italic' }}>
                                                {e.status === 'concluida' ? 'Esta etapa foi concluída com sucesso!' : getEtapaDesc(e.nome)}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                                                    <div style={{ width: `${prog}%`, height: '100%', background: STATUS[effectiveStatus]?.color || '#94a3b8', borderRadius: 99 }} />
                                                </div>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{prog}%</span>
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
                    { label: 'Concluída', color: '#22c55e', style: {} },
                    { label: 'Em andamento', color: accent, style: {} },
                    { label: 'Não iniciado', color: '#94a3b8', style: { border: '1.5px dashed #94a3b8', background: 'transparent' } },
                ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
                        <div style={{ width: 20, height: 10, background: l.color, borderRadius: 4, ...l.style }} />
                        {l.label}
                    </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
                    <div style={{ width: 10, height: 10, background: accent, borderRadius: 2, transform: 'rotate(45deg)' }} />
                    Marco
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
                    <div style={{ width: 2, height: 12, background: '#ef4444', borderRadius: 1, boxShadow: '0 0 4px rgba(239,68,68,0.5)' }} />
                    Hoje
                </div>
            </div>
        </div>
    );

    return isMobile ? renderMobile() : renderDesktop();
}

// ─── Chat de mensagens do portal ──────────────
function PortalChat({ token, mensagens: initialMsgs, accent, primary, clienteNome }) {
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
            <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={16} style={{ color: accent }} /> Mensagens
            </h2>

            {/* Chat area */}
            <div ref={chatRef} style={{
                maxHeight: 360, minHeight: 120, overflowY: 'auto',
                background: '#f8fafc', borderRadius: 12,
                padding: 16, marginBottom: 16,
                border: '1px solid #e2e8f0'
            }}>
                {msgs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
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
                                            <span style={{ fontSize: 10, color: '#94a3b8' }}>{timeFmt(m.criado_em)}</span>
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
                            padding: '6px 12px', fontSize: 12, color: '#64748b', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        <User size={12} /> {nome || 'Definir nome'} <span style={{ fontSize: 10, color: '#94a3b8' }}>(clique para alterar)</span>
                    </button>
                )}
            </div>

            {/* Message input */}
            <div style={{ display: 'flex', gap: 8 }}>
                <input
                    type="text"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
                    placeholder="Digite sua mensagem..."
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
    if (arquivos.length === 0) return null;

    const fmtSize = (bytes) => bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
    const isImage = (tipo) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(tipo);
    const getFileIcon = (tipo) => {
        if (['pdf'].includes(tipo)) return { bg: '#fee2e2', color: '#ef4444', label: 'PDF' };
        if (['doc', 'docx'].includes(tipo)) return { bg: '#dbeafe', color: '#3b82f6', label: 'DOC' };
        if (['xls', 'xlsx', 'csv'].includes(tipo)) return { bg: '#dcfce7', color: '#22c55e', label: 'XLS' };
        if (['dxf', 'dwg'].includes(tipo)) return { bg: '#fef3c7', color: '#f59e0b', label: 'CAD' };
        if (isImage(tipo)) return { bg: '#ede9fe', color: '#8b5cf6', label: 'IMG' };
        return { bg: '#f1f5f9', color: '#64748b', label: (tipo || '?').toUpperCase().slice(0, 3) };
    };

    return (
        <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={16} style={{ color: accent }} /> Documentos
            </h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
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
                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                textDecoration: 'none', color: 'inherit',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.borderColor = accent + '50'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
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
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
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
    if (fotos.length === 0) return null;

    return (
        <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Camera size={16} style={{ color: accent }} /> Fotos da Montagem
            </h2>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
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
                            color: !filtroAmb ? accent : '#64748b',
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
                                    color: active ? accent : '#64748b',
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
                            background: '#f1f5f9',
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

    const primary = data?.empresa?.proposta_cor_primaria || '#1B2A4A';
    const accent = data?.empresa?.proposta_cor_accent || '#C9A96E';
    const font = 'system-ui, -apple-system, sans-serif';

    if (loading) return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font }}>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
                <div style={{ width: 40, height: 40, border: `3px solid #e2e8f0`, borderTopColor: primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p>Carregando portal do cliente...</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    if (error) return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font }}>
            <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
                <div style={{ width: 64, height: 64, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#ef4444' }}><Lock size={28} /></div>
                <h2 style={{ color: '#1e293b', marginBottom: 8 }}>Link inválido ou expirado</h2>
                <p style={{ color: '#64748b', fontSize: 14 }}>{error}</p>
            </div>
        </div>
    );

    const { projeto, empresa } = data;
    const etapas = projeto.etapas || [];
    const ocorrencias = projeto.ocorrencias || [];
    const mensagens = projeto.mensagens || [];
    const concluidasPct = etapas.length
        ? Math.round(etapas.filter(e => e.status === 'concluida').length / etapas.length * 100)
        : 0;

    const STATUS_ETAPA = mkStatusEtapa(accent);
    const STATUS_PROJ = mkStatusProj(accent);
    // No portal, "atrasado" aparece como "em andamento" para o cliente
    const portalStatus = projeto.status === 'atrasado' ? 'em_andamento' : projeto.status;
    const statusProj = STATUS_PROJ[portalStatus] || STATUS_PROJ.nao_iniciado;

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: font, padding: '32px 16px' }}>
            <style>{`
                @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes ganttBarShine { 0% { left: -40%; } 100% { left: 140%; } }
                .gantt-progress-active { position: relative; overflow: hidden; }
                .gantt-progress-active::after {
                    content: ''; position: absolute; top: 0; left: -40%; width: 30%; height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
                    animation: ganttBarShine 2.4s ease-in-out infinite;
                }
                .portal-card { animation: fadeUp 0.4s ease; max-width: 800px; margin: 0 auto; }
                @media print { body { background: white !important; } .no-print { display: none !important; } }
            `}</style>

            {/* Banner de preview */}
            {isPreview && (
                <div className="no-print" style={{
                    background: 'linear-gradient(90deg, #f59e0b, #d97706)', color: '#fff',
                    padding: '10px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700,
                    borderRadius: 10, marginBottom: 16, maxWidth: 800, margin: '0 auto 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                    PREVIEW INTERNO — Notificações não são enviadas
                </div>
            )}

            <div className="portal-card">

                {/* ─── Cabeçalho empresa ──────────────────────── */}
                <div style={{
                    background: '#fff',
                    borderRadius: '16px 16px 0 0', padding: '28px 32px',
                    borderBottom: `3px solid ${primary}`,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            {empresa.logo_header_path ? (
                                <>
                                    <img src={empresa.logo_header_path} alt={empresa.nome} style={{ height: 52, maxWidth: 180, objectFit: 'contain', flexShrink: 0 }} />
                                    {(empresa.cidade || empresa.telefone) && (
                                        <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderLeft: '1px solid #e2e8f0', paddingLeft: 14 }}>
                                            {empresa.cidade && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {empresa.cidade}{empresa.estado ? `, ${empresa.estado}` : ''}</span>}
                                            {empresa.telefone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {empresa.telefone}</span>}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div style={{
                                        width: 48, height: 48, background: `${primary}12`,
                                        borderRadius: 12, display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', fontWeight: 800, fontSize: 22, flexShrink: 0, color: primary,
                                        border: `1.5px solid ${primary}30`,
                                    }}>
                                        {(empresa.nome || 'M')[0]}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 20, color: '#1e293b' }}>{empresa.nome || 'Marcenaria'}</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                            {empresa.cidade && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {empresa.cidade}{empresa.estado ? `, ${empresa.estado}` : ''}</span>}
                                            {empresa.telefone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {empresa.telefone}</span>}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                                color: accent, marginBottom: 6,
                            }}>
                                Portal do Cliente
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: primary }}>{projeto.nome}</div>
                        </div>
                    </div>
                </div>

                {/* ─── Info do projeto ─────────────────────────── */}
                <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 20 }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Cliente</div>
                            <div style={{ fontWeight: 700, fontSize: 17, color: '#0f172a' }}>{projeto.cliente_nome || '—'}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Status</div>
                            <span style={{
                                background: `${statusProj.color}15`, color: statusProj.color,
                                border: `1px solid ${statusProj.color}40`,
                                fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99
                            }}>{statusProj.label}</span>
                        </div>
                        {projeto.data_inicio && (
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Período</div>
                                <div style={{ fontSize: 14, color: '#334155' }}>
                                    {dtFmt(projeto.data_inicio)} → {dtFmt(projeto.data_vencimento)}
                                </div>
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Progresso</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                                    <div className={concluidasPct < 100 ? 'gantt-progress-active' : ''} style={{ width: `${concluidasPct}%`, height: '100%', background: accent, borderRadius: 99, transition: 'width 0.5s' }} />
                                </div>
                                <span style={{ fontWeight: 700, color: accent, fontSize: 14 }}>{concluidasPct}%</span>
                            </div>
                        </div>
                    </div>

                </div>

                {/* ─── Etapas / Cronograma ────────────────────── */}
                <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
                    <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}><Calendar size={16} style={{ color: accent }} /> Cronograma</h2>

                    <GanttPublic etapas={etapas} primary={primary} accent={accent} />

                </div>

                {/* ─── Ambientes do Projeto ──────────────────── */}
                {projeto.ambientes && projeto.ambientes.length > 0 && (() => {
                    const AMB_COMPAT = { corte: 'producao', acabamento: 'expedicao' };
                    const AMB_ST = [
                        { key: 'aguardando', label: 'Aguardando', color: '#94a3b8', icon: Clock },
                        { key: 'producao', label: 'Produção', color: '#f97316', icon: Factory },
                        { key: 'expedicao', label: 'Expedição', color: '#3b82f6', icon: Truck },
                        { key: 'instalacao', label: 'Instalação', color: '#8b5cf6', icon: Wrench },
                        { key: 'concluido', label: 'Concluído', color: '#22c55e', icon: CheckCircle2 },
                    ];
                    const stMap = Object.fromEntries(AMB_ST.map(s => [s.key, s]));
                    const stIdx = (k) => AMB_ST.findIndex(s => s.key === (AMB_COMPAT[k] || k));
                    const total = projeto.ambientes.length;
                    const done = projeto.ambientes.filter(a => a.status === 'concluido').length;
                    // Migrar status antigos
                    const ambs = projeto.ambientes.map(a => ({ ...a, status: AMB_COMPAT[a.status] || a.status }));

                    return (
                        <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                    <Layers size={16} style={{ color: accent }} /> Ambientes
                                </h2>
                                <span style={{ fontSize: 12, color: '#64748b' }}>{done}/{total} concluídos</span>
                            </div>

                            {/* Barra de progresso geral */}
                            <div style={{ background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', height: 6, marginBottom: 18 }}>
                                <div style={{ height: '100%', width: `${total > 0 ? (done / total) * 100 : 0}%`, background: accent, borderRadius: 6, transition: 'width 0.3s' }} />
                            </div>

                            <div style={{ display: 'grid', gap: 10 }}>
                                {ambs.map((amb, i) => {
                                    const st = stMap[amb.status] || stMap.aguardando;
                                    const StIcon = st.icon;
                                    const currentIdx = stIdx(amb.status);

                                    return (
                                        <div key={amb.id || i} style={{
                                            padding: '14px 18px', borderRadius: 10,
                                            background: amb.status === 'concluido' ? '#f0fdf4' : '#f8fafc',
                                            border: `1px solid ${st.color}30`,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <span style={{
                                                        background: primary, color: 'white', borderRadius: 6,
                                                        padding: '2px 8px', fontSize: 11, fontWeight: 700, minWidth: 24, textAlign: 'center',
                                                    }}>{String(i + 1).padStart(2, '0')}</span>
                                                    <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{amb.nome}</span>
                                                </div>
                                                <span style={{
                                                    fontSize: 11, padding: '3px 10px', borderRadius: 20,
                                                    background: st.color + '18', color: st.color, fontWeight: 600,
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                }}>
                                                    <StIcon size={12} /> {st.label}
                                                </span>
                                            </div>

                                            {/* Mini pipeline visual */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                {AMB_ST.map((s, si) => (
                                                    <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                        <div style={{
                                                            height: 4, width: '100%', borderRadius: 2,
                                                            background: si <= currentIdx ? st.color : '#e2e8f0',
                                                            transition: 'background 0.2s',
                                                        }} />
                                                        <span style={{ fontSize: 9, color: si <= currentIdx ? st.color : '#cbd5e1', marginTop: 3, whiteSpace: 'nowrap' }}>
                                                            {s.label}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                {/* ─── Ocorrências (apenas públicas) ──────────── */}
                {ocorrencias.length > 0 && (
                    <div style={{ background: '#fff', padding: '24px 32px', borderBottom: '1px solid #e2e8f0' }}>
                        <h2 style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={16} style={{ color: accent }} /> Comunicados</h2>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {ocorrencias.map(oc => (
                                <div key={oc.id} style={{
                                    padding: '14px 18px', borderRadius: 10,
                                    background: oc.status === 'resolvido' ? '#f0fdf4' : '#f8fafc',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{oc.assunto}</div>
                                        {oc.status === 'resolvido' && (
                                            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Resolvido</span>
                                        )}
                                    </div>
                                    {oc.descricao && (
                                        <p style={{ fontSize: 13, color: '#334155', margin: '6px 0 0', lineHeight: 1.6 }}>{oc.descricao}</p>
                                    )}
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                                        {oc.autor} · {new Date(oc.criado_em).toLocaleDateString('pt-BR')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── Chat de Mensagens (Portal v2) ──────────── */}
                <div className="no-print">
                    <PortalChat
                        token={token}
                        mensagens={mensagens}
                        accent={accent}
                        primary={primary}
                        clienteNome={projeto.cliente_nome}
                    />
                </div>

                {/* ─── Galeria de Fotos ──────────────────────── */}
                <PortalGaleria token={token} accent={accent} primary={primary} />

                {/* ─── Documentos ────────────────────────────── */}
                <PortalDocumentos token={token} accent={accent} />

                {/* ─── Rodapé ─────────────────────────────────── */}
                <div style={{
                    background: '#fff', padding: '20px 32px',
                    borderRadius: '0 0 16px 16px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexWrap: 'wrap', gap: 12
                }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
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

                <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#94a3b8' }}>
                    Portal gerado pelo sistema Ornato ERP
                </div>
            </div>
        </div>
    );
}
