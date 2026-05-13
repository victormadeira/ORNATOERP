import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Calendar, MessageCircle, Lock, CheckCircle2, Clock, Play,
    AlertCircle, Send, User, Camera, X, ChevronLeft, ChevronRight,
    Ruler, ClipboardCheck, ShoppingCart, Factory, Paintbrush, Truck,
    Wrench, ListChecks, Layers, FileText, Download, ArrowDownToLine,
    ArrowUpRight, Sparkle,
} from 'lucide-react';
import { initClarity, identifyClarity, setClarityTag } from '../utils/clarity';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dtFmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—';
const dtFmtFull = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const moneyFmt = (n) => `R$ ${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeAgo = (s) => {
    if (!s) return '';
    const d = new Date(s.includes('Z') || s.includes('T') ? s : s + 'Z');
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)} d`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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

// Contador animado — easing exponencial pra parecer "natural"
function useCountUp(target, duration = 1400) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!target) { setVal(0); return; }
        const start = performance.now();
        let raf;
        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 4);
            setVal(Math.round(target * eased));
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);
    return val;
}

// Hook genérico de scroll reveal
function useReveal() {
    const ref = useRef(null);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        if (!ref.current || shown) return;
        const io = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) { setShown(true); io.disconnect(); }
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
        io.observe(ref.current);
        return () => io.disconnect();
    }, [shown]);
    return [ref, shown];
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────
function Reveal({ delay = 0, children, as: Tag = 'div', ...rest }) {
    const [ref, shown] = useReveal();
    return (
        <Tag ref={ref} {...rest} style={{
            ...rest.style,
            opacity: shown ? 1 : 0,
            transform: shown ? 'translateY(0)' : 'translateY(16px)',
            transition: `opacity 720ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform 720ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        }}>
            {children}
        </Tag>
    );
}

function SectionLabel({ children }) {
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--v2-ink-3)',
            fontFamily: 'var(--v2-mono)',
        }}>
            {children}
        </div>
    );
}

function StatusDot({ tone = 'neutral', pulse = false }) {
    const colors = {
        active: 'var(--v2-cobre)',
        done: 'oklch(0.7 0.13 155)',
        late: 'oklch(0.62 0.18 27)',
        neutral: 'var(--v2-ink-3)',
    };
    return (
        <span aria-hidden="true" style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: colors[tone] || colors.neutral,
            boxShadow: pulse ? `0 0 0 4px color-mix(in oklch, ${colors[tone]} 22%, transparent)` : 'none',
            animation: pulse ? 'v2Pulse 2.2s ease-out infinite' : 'none',
            flexShrink: 0,
        }} />
    );
}

function ProgressRing({ value, size = 168, stroke = 6 }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const animated = useCountUp(value, 1800);
    const offset = c - (c * animated) / 100;
    const cx = size / 2;
    const cy = size / 2;
    // Posição do endpoint do arco (final do progresso)
    const angle = (animated / 100) * 2 * Math.PI - Math.PI / 2;
    const endX = cx + r * Math.cos(angle);
    const endY = cy + r * Math.sin(angle);

    return (
        <div className="v2-ring-wrap" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="v2-ring-svg">
                <defs>
                    <linearGradient id="v2RingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="color-mix(in oklch, var(--v2-cobre) 60%, white)" />
                        <stop offset="100%" stopColor="var(--v2-cobre)" />
                    </linearGradient>
                    <filter id="v2RingGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                {/* Trilho */}
                <circle cx={cx} cy={cy} r={r} fill="none"
                        stroke="color-mix(in oklch, var(--v2-cobre) 14%, transparent)"
                        strokeWidth={stroke} />
                {/* Arco principal */}
                <circle cx={cx} cy={cy} r={r} fill="none"
                        stroke="url(#v2RingGrad)" strokeWidth={stroke}
                        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
                        transform={`rotate(-90 ${cx} ${cy})`}
                        style={{ transition: 'stroke-dashoffset 240ms linear' }} />
                {/* Sweep luminoso percorrendo o arco */}
                {animated > 0 && (
                    <circle cx={cx} cy={cy} r={r} fill="none"
                            stroke="color-mix(in oklch, white 75%, var(--v2-cobre))"
                            strokeWidth={stroke * 0.55} strokeLinecap="round"
                            strokeDasharray={`${c * 0.08} ${c * 0.92}`}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            className="v2-ring-sweep"
                            style={{ filter: 'blur(2px)' }} />
                )}
                {/* Endpoint glow — bolinha cobre brilhante no fim do progresso */}
                {animated > 0 && animated < 100 && (
                    <>
                        <circle cx={endX} cy={endY} r={stroke * 0.9} fill="var(--v2-cobre)" filter="url(#v2RingGlow)" className="v2-ring-endpoint" />
                        <circle cx={endX} cy={endY} r={stroke * 0.45} fill="white" />
                    </>
                )}
            </svg>
            <div className="v2-ring-center">
                <div style={{
                    fontFamily: 'var(--v2-mono)', fontVariantNumeric: 'tabular-nums',
                    fontSize: Math.round(size * 0.32), fontWeight: 500,
                    color: 'var(--v2-ink)', letterSpacing: '-0.04em', lineHeight: 1,
                }}>{animated}<span style={{ color: 'var(--v2-cobre)', fontSize: '0.45em', marginLeft: 1 }}>%</span></div>
                <div style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: 'var(--v2-ink-3)',
                    fontFamily: 'var(--v2-mono)', marginTop: 8,
                }}>concluído</div>
            </div>
        </div>
    );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ projeto, empresa, concluidasPct, etapas }) {
    const currentEtapa = etapas.find(e => e.status === 'em_andamento' || e.status === 'atrasada')
        || etapas.find(e => e.status === 'pendente' || e.status === 'nao_iniciado')
        || etapas[etapas.length - 1];

    const ultimaEntrega = etapas.length ? etapas[etapas.length - 1] : null;

    return (
        <header className="v2-hero">
            <div className="v2-hero-grid">
                <div className="v2-hero-left">
                    <Reveal delay={0}>
                        <SectionLabel>Projeto · {projeto.numero ? `Nº ${projeto.numero}` : 'em andamento'}</SectionLabel>
                    </Reveal>

                    <Reveal delay={80} as="h1" className="v2-hero-title" style={{
                        margin: '18px 0 0', fontFamily: 'var(--v2-display-condensed)',
                        fontSize: 'clamp(2.75rem, 7.2vw, 4.75rem)', fontWeight: 400,
                        letterSpacing: '-0.01em', lineHeight: 1.0,
                        color: 'var(--v2-ink)',
                    }}>
                        Olá, <span className="v2-hero-name">{(() => {
                            const nome = (projeto.cliente_nome || 'Cliente').trim();
                            // Casal ("Diego e Tamara Silva") → mantém os dois primeiros nomes
                            const casal = nome.match(/^([^\s]+)\s+e\s+([^\s]+)/i);
                            return casal ? `${casal[1]} e ${casal[2]}` : nome.split(' ')[0];
                        })()}</span>.
                    </Reveal>

                    <Reveal delay={140} as="p" style={{
                        margin: '14px 0 0', maxWidth: '38ch',
                        fontSize: 'clamp(1rem, 1.6vw, 1.125rem)', lineHeight: 1.55,
                        color: 'var(--v2-ink-2)',
                    }}>
                        Estamos cuidando do seu projeto.{' '}
                        {concluidasPct >= 100
                            ? 'Tudo entregue — foi um prazer.'
                            : currentEtapa
                                ? <>Agora na fase de <strong style={{ color: 'var(--v2-ink)', fontWeight: 600 }}>{currentEtapa.nome?.toLowerCase()}</strong>.</>
                                : 'Em breve mais atualizações.'}
                    </Reveal>

                    <Reveal delay={200} style={{ marginTop: 28 }}>
                        <div className="v2-hero-meta">
                            {ultimaEntrega?.data_vencimento && (
                                <div className="v2-hero-meta-item">
                                    <div className="v2-meta-label">Previsão</div>
                                    <div className="v2-meta-value">{dtFmt(ultimaEntrega.data_vencimento)}</div>
                                </div>
                            )}
                            <div className="v2-hero-meta-item">
                                <div className="v2-meta-label">Etapas</div>
                                <div className="v2-meta-value">
                                    <span style={{ color: 'var(--v2-ink)' }}>
                                        {etapas.filter(e => e.status === 'concluida').length}
                                    </span>
                                    <span style={{ color: 'var(--v2-ink-3)' }}>/{etapas.length}</span>
                                </div>
                            </div>
                            <div className="v2-hero-meta-item">
                                <div className="v2-meta-label">Status</div>
                                <div className="v2-meta-value" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.95em' }}>
                                    <StatusDot tone={concluidasPct >= 100 ? 'done' : 'active'} pulse={concluidasPct < 100 && concluidasPct > 0} />
                                    <span style={{ color: 'var(--v2-ink)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                                        {concluidasPct >= 100 ? 'Concluído' : 'Em andamento'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Reveal>
                </div>

                <Reveal delay={240} className="v2-hero-right">
                    <ProgressRing value={concluidasPct} />
                </Reveal>
            </div>
        </header>
    );
}

// ─── Gantt horizontal (desktop) ───────────────────────────────────────────────
function GanttChart({ etapas }) {
    const range = useMemo(() => {
        const dates = etapas.flatMap(e => [e.data_inicio, e.data_vencimento])
            .filter(Boolean)
            .map(d => new Date(d + 'T12:00:00').getTime());
        if (dates.length < 2) return null;
        let minD = Math.min(...dates);
        let maxD = Math.max(...dates);
        const span = maxD - minD;
        if (span <= 0) return null;
        // Padding 5% nas pontas pra respirar
        const pad = span * 0.05;
        minD -= pad; maxD += pad;
        return { minD, maxD, totalMs: maxD - minD };
    }, [etapas]);

    if (!range) return null;

    const { minD, maxD, totalMs } = range;
    const now = Date.now();
    const todayPct = Math.max(0, Math.min(100, ((now - minD) / totalMs) * 100));

    // Gerar markers de mês
    const monthMarkers = useMemo(() => {
        const out = [];
        const start = new Date(minD);
        const end = new Date(maxD);
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor <= end) {
            const t = cursor.getTime();
            if (t >= minD && t <= maxD) {
                out.push({
                    label: cursor.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
                    pct: ((t - minD) / totalMs) * 100,
                });
            }
            cursor.setMonth(cursor.getMonth() + 1);
        }
        return out;
    }, [minD, maxD, totalMs]);

    const [revealRef, shown] = useReveal();

    return (
        <div className="v2-gantt" ref={revealRef} style={{ opacity: shown ? 1 : 0, transition: 'opacity 600ms ease-out' }}>
            {/* Eixo de meses */}
            <div className="v2-gantt-axis">
                {monthMarkers.map((m, i) => (
                    <div key={i} className="v2-gantt-month" style={{ left: `${m.pct}%` }}>
                        <div className="v2-gantt-month-label">{m.label}</div>
                    </div>
                ))}
            </div>

            {/* Linhas de grade verticais */}
            <div className="v2-gantt-grid">
                {monthMarkers.map((m, i) => (
                    <div key={i} className="v2-gantt-gridline" style={{ left: `${m.pct}%` }} />
                ))}
                {/* Linha "hoje" */}
                {todayPct > 0 && todayPct < 100 && (
                    <div className="v2-gantt-today" style={{ left: `${todayPct}%` }}>
                        <div className="v2-gantt-today-line" />
                        <div className="v2-gantt-today-label">HOJE</div>
                    </div>
                )}
            </div>

            {/* Barras */}
            <div className="v2-gantt-bars">
                {etapas.map((e, i) => {
                    if (!e.data_inicio || !e.data_vencimento) {
                        // Etapa sem datas — mostra placeholder sutil
                        return (
                            <div key={e.id || i} className="v2-gantt-row">
                                <div className="v2-gantt-row-name">{e.nome}</div>
                                <div className="v2-gantt-row-track">
                                    <div className="v2-gantt-bar v2-gantt-bar-empty">sem datas</div>
                                </div>
                            </div>
                        );
                    }
                    const start = new Date(e.data_inicio + 'T12:00:00').getTime();
                    const end = new Date(e.data_vencimento + 'T12:00:00').getTime();
                    const leftPct = ((start - minD) / totalMs) * 100;
                    const widthPct = Math.max(2, ((end - start) / totalMs) * 100);

                    // Status explícito vence — quando vier vazio, infere pela data atual
                    const isDone = e.status === 'concluida';
                    const isExplicitActive = e.status === 'em_andamento' || e.status === 'atrasada';
                    const containsToday = start <= now && now <= end;
                    const isImplicitActive = !isDone && !isExplicitActive && containsToday;
                    const isPastImplicit = !isDone && !isExplicitActive && end < now;
                    const isActive = isExplicitActive || isImplicitActive;
                    const tone = isDone ? 'done' : isActive ? 'active' : isPastImplicit ? 'past' : 'neutral';
                    const progresso = isDone
                        ? 100
                        : (e.progresso ?? (isActive ? Math.max(5, Math.min(95, ((now - start) / Math.max(1, end - start)) * 100)) : 0));

                    return (
                        <div key={e.id || i} className="v2-gantt-row" style={{ animationDelay: `${i * 80}ms` }}>
                            <div className="v2-gantt-row-name">{String(i + 1).padStart(2, '0')} <span>{e.nome}</span></div>
                            <div className="v2-gantt-row-track">
                                <div
                                    className={`v2-gantt-bar v2-gantt-bar-${tone} ${shown ? 'v2-gantt-bar-shown' : ''}`}
                                    style={{
                                        left: `${leftPct}%`,
                                        width: `${widthPct}%`,
                                        transitionDelay: `${300 + i * 100}ms`,
                                    }}
                                    title={`${e.nome} · ${dtFmt(e.data_inicio)} → ${dtFmt(e.data_vencimento)}`}
                                >
                                    <div className="v2-gantt-bar-fill" style={{ width: `${progresso}%`, transitionDelay: `${600 + i * 100}ms` }} />
                                    {isActive && <div className="v2-gantt-bar-pulse" />}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Cronograma ───────────────────────────────────────────────────────────────
function Cronograma({ etapas }) {
    if (!etapas || etapas.length === 0) {
        return (
            <Section title="Cronograma" number={1} eyebrow="Linha do tempo">
                <Empty
                    icon={<Calendar size={20} />}
                    title="Sem etapas cadastradas ainda"
                    sub="Em breve a equipe vai definir a linha do tempo do seu projeto."
                />
            </Section>
        );
    }

    return (
        <Section title="Cronograma" number={1} eyebrow="Linha do tempo">
            {/* Gantt horizontal — só desktop */}
            <GanttChart etapas={etapas} />

            <ol className="v2-timeline">
                {etapas.map((e, i) => {
                    const Icon = getEtapaIcon(e.nome);
                    const isDone = e.status === 'concluida';
                    const isActive = e.status === 'em_andamento' || e.status === 'atrasada';
                    const isLate = e.status === 'atrasada';
                    const tone = isDone ? 'done' : isActive ? 'active' : 'neutral';
                    const progresso = e.progresso ?? (isDone ? 100 : 0);

                    return (
                        <Reveal key={e.id || i} delay={i * 60} as="li" className="v2-timeline-item">
                            <div className="v2-timeline-node">
                                <div className={`v2-timeline-icon v2-tone-${tone}`}>
                                    {isDone ? <CheckCircle2 size={14} strokeWidth={2.2} /> : <Icon size={14} strokeWidth={2} />}
                                </div>
                                {i < etapas.length - 1 && <div className={`v2-timeline-line ${isDone ? 'v2-timeline-line-done' : ''} ${isActive ? 'v2-timeline-line-active' : ''}`} />}
                            </div>

                            <div className="v2-timeline-body">
                                <div className="v2-timeline-row">
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="v2-timeline-num">{String(i + 1).padStart(2, '0')}</div>
                                        <div className="v2-timeline-name">{e.nome}</div>
                                        {e.data_inicio || e.data_vencimento ? (
                                            <div className="v2-timeline-meta">
                                                {e.data_inicio && <span>{dtFmt(e.data_inicio)}</span>}
                                                {e.data_inicio && e.data_vencimento && <span style={{ color: 'var(--v2-ink-3)' }}>→</span>}
                                                {e.data_vencimento && <span>{dtFmt(e.data_vencimento)}</span>}
                                            </div>
                                        ) : null}
                                    </div>
                                    <StatusPill tone={tone} label={
                                        isDone ? 'Concluída' : isLate ? 'Em andamento' : isActive ? 'Em andamento' : e.status === 'pendente' ? 'Pendente' : 'Aguardando'
                                    } pulse={isActive} />
                                </div>

                                {isActive && (
                                    <div className="v2-progress-bar" aria-label={`Progresso: ${progresso}%`}>
                                        <div className="v2-progress-fill" style={{ width: `${progresso}%` }} />
                                    </div>
                                )}
                            </div>
                        </Reveal>
                    );
                })}
            </ol>
        </Section>
    );
}

function StatusPill({ tone = 'neutral', label, pulse = false }) {
    return (
        <span className={`v2-status-pill v2-tone-${tone}`}>
            <StatusDot tone={tone} pulse={pulse} />
            {label}
        </span>
    );
}

// ─── Ambientes ────────────────────────────────────────────────────────────────
function Ambientes({ ambientes }) {
    if (!ambientes || ambientes.length === 0) return null;

    const AMB_COMPAT = { corte: 'producao', acabamento: 'expedicao' };
    const AMB_ST = [
        { key: 'aguardando', label: 'Aguardando', tone: 'neutral' },
        { key: 'producao', label: 'Produção', tone: 'active' },
        { key: 'expedicao', label: 'Expedição', tone: 'active' },
        { key: 'instalacao', label: 'Instalação', tone: 'active' },
        { key: 'concluido', label: 'Concluído', tone: 'done' },
    ];
    const stMap = Object.fromEntries(AMB_ST.map(s => [s.key, s]));
    const stIdx = (k) => AMB_ST.findIndex(s => s.key === (AMB_COMPAT[k] || k));
    const ambs = ambientes.map(a => ({ ...a, status: AMB_COMPAT[a.status] || a.status }));

    return (
        <Section title="Ambientes" number={2} eyebrow="Por cômodo">
            <div className="v2-ambientes">
                {ambs.map((amb, i) => {
                    const st = stMap[amb.status] || stMap.aguardando;
                    const pct = Math.round((stIdx(amb.status) / (AMB_ST.length - 1)) * 100);
                    return (
                        <Reveal key={amb.id || i} delay={i * 50} className="v2-ambiente">
                            <div className="v2-ambiente-head">
                                <div className="v2-ambiente-name">{amb.nome}</div>
                                <StatusPill tone={st.tone} label={st.label} pulse={st.tone === 'active' && amb.status !== 'concluido'} />
                            </div>
                            <div className="v2-progress-bar v2-progress-bar-thin">
                                <div className="v2-progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="v2-ambiente-foot">
                                <span>{pct}%</span>
                                <span style={{ color: 'var(--v2-ink-3)' }}>·</span>
                                <span>{AMB_ST.slice(stIdx(amb.status) + 1).length} fase{AMB_ST.slice(stIdx(amb.status) + 1).length !== 1 ? 's' : ''} restante{AMB_ST.slice(stIdx(amb.status) + 1).length !== 1 ? 's' : ''}</span>
                            </div>
                        </Reveal>
                    );
                })}
            </div>
        </Section>
    );
}

// ─── Fotos ────────────────────────────────────────────────────────────────────
function Fotos({ token }) {
    const [fotos, setFotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lightbox, setLightbox] = useState(null);

    useEffect(() => {
        fetch(`/api/projetos/portal/${token}/fotos`)
            .then(r => r.json())
            .then(d => setFotos(Array.isArray(d) ? d.filter(f => f.visivel_portal) : []))
            .catch(() => setFotos([]))
            .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => {
        if (!lightbox) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setLightbox(null);
            if (e.key === 'ArrowLeft') setLightbox(prev => {
                const i = fotos.findIndex(f => f.id === prev?.id);
                return fotos[(i - 1 + fotos.length) % fotos.length];
            });
            if (e.key === 'ArrowRight') setLightbox(prev => {
                const i = fotos.findIndex(f => f.id === prev?.id);
                return fotos[(i + 1) % fotos.length];
            });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightbox, fotos]);

    if (loading) return (
        <Section title="Fotos" number={3} eyebrow="Da obra">
            <div className="v2-skel-grid">
                {[1, 2, 3].map(i => <div key={i} className="v2-skel-img" />)}
            </div>
        </Section>
    );

    if (fotos.length === 0) return (
        <Section title="Fotos" number={3} eyebrow="Da obra">
            <Empty
                icon={<Camera size={20} />}
                title="Ainda sem fotos"
                sub="Quando a equipe registrar o progresso, as fotos aparecem aqui."
            />
        </Section>
    );

    return (
        <>
            <Section title="Fotos" number={3} eyebrow={`${fotos.length} registro${fotos.length > 1 ? 's' : ''}`}>
                <div className="v2-foto-grid">
                    {fotos.map((f, i) => (
                        <Reveal key={f.id} delay={i * 40} className="v2-foto-cell" as="button"
                                onClick={() => setLightbox(f)}>
                            <img src={f.thumb_url || f.url} alt={f.descricao || `Foto ${i + 1}`} loading="lazy" />
                            <div className="v2-foto-overlay">
                                <ArrowUpRight size={14} strokeWidth={2.2} />
                            </div>
                        </Reveal>
                    ))}
                </div>
            </Section>
            {lightbox && (
                <div className="v2-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
                    <img src={lightbox.url} alt={lightbox.descricao || ''} onClick={e => e.stopPropagation()} />
                    <button className="v2-lightbox-close" onClick={() => setLightbox(null)} aria-label="Fechar">
                        <X size={22} />
                    </button>
                </div>
            )}
        </>
    );
}

// ─── Documentos ───────────────────────────────────────────────────────────────
function Documentos({ token }) {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/projetos/portal/${token}/arquivos`)
            .then(r => r.json())
            .then(d => setDocs(Array.isArray(d) ? d : []))
            .catch(() => setDocs([]))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) return (
        <Section title="Documentos" number={4} eyebrow="Arquivos do projeto">
            <div className="v2-skel-list">
                {[1, 2].map(i => <div key={i} className="v2-skel-row" />)}
            </div>
        </Section>
    );

    if (docs.length === 0) return (
        <Section title="Documentos" number={4} eyebrow="Arquivos do projeto">
            <Empty
                icon={<FileText size={20} />}
                title="Nenhum documento disponível"
                sub="Contratos, projetos 3D e desenhos técnicos aparecem aqui assim que liberados."
            />
        </Section>
    );

    return (
        <Section title="Documentos" number={4} eyebrow={`${docs.length} arquivo${docs.length > 1 ? 's' : ''}`}>
            <ul className="v2-doc-list">
                {docs.map((d, i) => (
                    <Reveal key={d.id || i} delay={i * 40} as="li" className="v2-doc-row">
                        <a href={d.url} target="_blank" rel="noopener noreferrer" download>
                            <div className="v2-doc-icon"><FileText size={16} strokeWidth={1.8} /></div>
                            <div className="v2-doc-info">
                                <div className="v2-doc-name">{d.nome || 'Documento'}</div>
                                <div className="v2-doc-meta">
                                    {d.tipo && <span>{d.tipo}</span>}
                                    {d.tipo && d.criado_em && <span aria-hidden="true">·</span>}
                                    {d.criado_em && <span>{timeAgo(d.criado_em)}</span>}
                                </div>
                            </div>
                            <div className="v2-doc-action">
                                <ArrowDownToLine size={14} strokeWidth={2} />
                            </div>
                        </a>
                    </Reveal>
                ))}
            </ul>
        </Section>
    );
}

// ─── Financeiro ───────────────────────────────────────────────────────────────
function Financeiro({ pagamento }) {
    const pct = pagamento.totalGeral > 0
        ? Math.round((pagamento.totalPago / pagamento.totalGeral) * 100)
        : 0;
    const animatedPct = useCountUp(pct, 1400);
    const restante = (pagamento.totalGeral || 0) - (pagamento.totalPago || 0);

    return (
        <Section title="Financeiro" number={5} eyebrow="Pagamentos">
            <Reveal className="v2-fin-summary">
                <div className="v2-fin-stat">
                    <div className="v2-fin-stat-label">Pago</div>
                    <div className="v2-fin-stat-value v2-fin-paid">{moneyFmt(pagamento.totalPago)}</div>
                </div>
                <div className="v2-fin-stat">
                    <div className="v2-fin-stat-label">Restante</div>
                    <div className="v2-fin-stat-value">{moneyFmt(restante)}</div>
                </div>
                <div className="v2-fin-stat v2-fin-stat-total">
                    <div className="v2-fin-stat-label">Total</div>
                    <div className="v2-fin-stat-value">{moneyFmt(pagamento.totalGeral)}</div>
                </div>
            </Reveal>

            <div className="v2-fin-bar-wrap">
                <div className="v2-fin-bar">
                    <div className="v2-fin-bar-fill" style={{ width: `${animatedPct}%` }} />
                </div>
                <div className="v2-fin-bar-label">
                    <span style={{ fontFamily: 'var(--v2-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: 'var(--v2-ink)' }}>{animatedPct}%</span>
                    <span style={{ color: 'var(--v2-ink-3)' }}>pago</span>
                </div>
            </div>

            <ul className="v2-parcela-list">
                {pagamento.contas.map((c, i) => {
                    const vencida = c.status === 'pendente' && c.data_vencimento && new Date(c.data_vencimento + 'T12:00:00') < new Date();
                    const paga = c.status === 'pago';
                    const tone = paga ? 'done' : vencida ? 'late' : 'neutral';
                    return (
                        <Reveal key={c.id} delay={i * 40} as="li" className="v2-parcela-row">
                            <div className="v2-parcela-left">
                                <div className="v2-parcela-desc">{c.descricao || `Parcela ${i + 1}`}</div>
                                <div className="v2-parcela-date">
                                    {paga
                                        ? <>Pago em {dtFmtFull(c.data_pagamento)}</>
                                        : <>Vence {dtFmtFull(c.data_vencimento)}</>}
                                </div>
                            </div>
                            <div className="v2-parcela-right">
                                <div className="v2-parcela-value" style={{ color: paga ? 'oklch(0.55 0.14 155)' : vencida ? 'oklch(0.55 0.18 27)' : 'var(--v2-ink)' }}>
                                    {moneyFmt(c.valor)}
                                </div>
                                <StatusPill tone={tone} label={paga ? 'Pago' : vencida ? 'Vencida' : 'Pendente'} />
                            </div>
                        </Reveal>
                    );
                })}
            </ul>
        </Section>
    );
}

// ─── Chat FAB + Drawer ────────────────────────────────────────────────────────
function ChatFAB({ token, mensagens: initialMsgs = [], clienteNome, msgNaoLidas = 0 }) {
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState(initialMsgs);
    const [text, setText] = useState('');
    const [nome, setNome] = useState(localStorage.getItem('portal_v2_nome') || clienteNome || '');
    const [sending, setSending] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => { setMsgs(initialMsgs); }, [initialMsgs]);
    useEffect(() => {
        if (open && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [open, msgs]);
    useEffect(() => {
        if (nome) localStorage.setItem('portal_v2_nome', nome);
    }, [nome]);

    const send = async () => {
        if (!text.trim() || sending) return;
        setSending(true);
        try {
            const r = await fetch(`/api/projetos/portal/${token}/mensagens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autor_nome: nome || 'Cliente', conteudo: text.trim() }),
            });
            if (r.ok) {
                const msg = await r.json();
                setMsgs(prev => [...prev, msg]);
                setText('');
            }
        } finally { setSending(false); }
    };

    return (
        <>
            <button className="v2-fab no-print" onClick={() => setOpen(true)}
                    aria-label={msgNaoLidas > 0 ? `Abrir conversa (${msgNaoLidas} nova${msgNaoLidas > 1 ? 's' : ''})` : 'Abrir conversa'}>
                <MessageCircle size={22} strokeWidth={2} />
                {msgNaoLidas > 0 && <span className="v2-fab-badge">{msgNaoLidas > 9 ? '9+' : msgNaoLidas}</span>}
            </button>

            {open && (
                <div className="v2-drawer-scrim no-print" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Conversa com a equipe">
                    <div className="v2-drawer" onClick={e => e.stopPropagation()}>
                        <header className="v2-drawer-head">
                            <div>
                                <div className="v2-drawer-title">Conversa</div>
                                <div className="v2-drawer-sub">com a equipe Ornato · resposta em até 1 dia útil</div>
                            </div>
                            <button onClick={() => setOpen(false)} aria-label="Fechar" className="v2-drawer-close">
                                <X size={18} />
                            </button>
                        </header>

                        <div ref={scrollRef} className="v2-drawer-msgs">
                            {msgs.length === 0 ? (
                                <div className="v2-drawer-empty">
                                    <div className="v2-drawer-empty-icon"><Sparkle size={18} /></div>
                                    <p>Mande sua primeira mensagem. Estamos por aqui.</p>
                                </div>
                            ) : msgs.map(m => {
                                const isEquipe = m.autor_tipo === 'equipe';
                                return (
                                    <div key={m.id} className={`v2-msg ${isEquipe ? 'v2-msg-team' : 'v2-msg-me'}`}>
                                        <div className="v2-msg-meta">
                                            <span>{m.autor_nome || (isEquipe ? 'Equipe Ornato' : 'Você')}</span>
                                            <span style={{ color: 'var(--v2-ink-3)' }}>·</span>
                                            <span>{timeAgo(m.criado_em)}</span>
                                        </div>
                                        <div className="v2-msg-bubble">{m.conteudo}</div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="v2-drawer-input">
                            <input
                                type="text"
                                placeholder="Seu nome"
                                value={nome}
                                onChange={e => setNome(e.target.value)}
                                className="v2-drawer-name"
                            />
                            <div className="v2-drawer-send-row">
                                <input
                                    type="text"
                                    placeholder="Mensagem para a equipe..."
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                                    className="v2-drawer-text"
                                />
                                <button onClick={send} disabled={!text.trim() || sending} className="v2-drawer-send">
                                    <Send size={16} strokeWidth={2} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, eyebrow, number, children }) {
    return (
        <section className="v2-section">
            <Reveal className="v2-section-head">
                {eyebrow && <SectionLabel>{eyebrow}</SectionLabel>}
                <div className="v2-section-title-row">
                    {number && <span className="v2-section-num">{String(number).padStart(2, '0')}</span>}
                    <h2>{title}</h2>
                </div>
            </Reveal>
            {children}
        </section>
    );
}

function Empty({ icon, title, sub }) {
    return (
        <div className="v2-empty">
            <div className="v2-empty-icon">{icon}</div>
            <div className="v2-empty-title">{title}</div>
            <div className="v2-empty-sub">{sub}</div>
        </div>
    );
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ projeto, etapas, atividades, ocorrencias }) {
    // Pega o mais recente entre nota manual (ocorrência) e atividade auto-gerada
    const ultimaOc = ocorrencias?.[0];
    const ultimaAt = atividades?.[0];
    const tsOc = ultimaOc?.criado_em ? new Date(ultimaOc.criado_em).getTime() : 0;
    const tsAt = ultimaAt?.criado_em ? new Date(ultimaAt.criado_em).getTime() : 0;

    let fonte = null;
    if (tsOc > 0 && tsOc >= tsAt) {
        fonte = { criado_em: ultimaOc.criado_em, descricao: ultimaOc.assunto || ultimaOc.descricao, manual: true };
    } else if (tsAt > 0) {
        fonte = { criado_em: ultimaAt.criado_em, descricao: ultimaAt.descricao, manual: false };
    } else {
        const ultEtapa = etapas?.find(e => e.status === 'concluida' && e.data_fim);
        if (ultEtapa) fonte = { criado_em: ultEtapa.data_fim, descricao: `Etapa "${ultEtapa.nome}" concluída`, manual: false };
    }

    if (!fonte) return null;
    const descr = fonte.descricao || 'última atualização';

    return (
        <div className="v2-statusbar">
            <StatusDot tone="active" pulse />
            <span className="v2-statusbar-text">
                <strong>Atualizado {timeAgo(fonte.criado_em)}</strong>
                {descr !== 'última atualização' && (
                    <> · {descr.length > 70 ? descr.slice(0, 70) + '…' : descr}</>
                )}
            </span>
        </div>
    );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function PortalClienteV2({ token }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Injeta fonts uma vez
        const id = 'v2-fonts';
        if (!document.getElementById(id)) {
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Oswald:wght@300;400;500;600&display=swap';
            document.head.appendChild(link);
        }
    }, []);

    useEffect(() => {
        const authToken = localStorage.getItem('erp_token');
        const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
        fetch(`/api/projetos/portal/${token}`, { headers })
            .then(r => r.json())
            .then(d => { if (d.error) setError(d.error); else setData(d); })
            .catch(() => setError('Não foi possível carregar o projeto'))
            .finally(() => setLoading(false));

        initClarity();
        setClarityTag('page', 'portal-cliente-v2');
        if (token) identifyClarity(token, '', '', `Portal V2 ${token.slice(0, 8)}`);
    }, [token]);

    if (loading) return (
        <div className="v2-shell v2-state">
            <style>{V2_STYLES}</style>
            <div className="v2-loader">
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="color-mix(in oklch, var(--v2-cobre) 16%, transparent)" strokeWidth="2.5" />
                    <circle cx="20" cy="20" r="16" fill="none" stroke="var(--v2-cobre)" strokeWidth="2.5"
                            strokeLinecap="round" strokeDasharray="30 70"
                            style={{ transformOrigin: 'center', animation: 'v2Spin 1s linear infinite' }} />
                </svg>
                <div className="v2-loader-text">Carregando seu portal</div>
            </div>
        </div>
    );

    if (error) return (
        <div className="v2-shell v2-state">
            <style>{V2_STYLES}</style>
            <div className="v2-error">
                <div className="v2-error-icon"><Lock size={22} /></div>
                <h2>Link indisponível</h2>
                <p>{error}</p>
            </div>
        </div>
    );

    const { projeto, empresa } = data;
    const etapas = projeto.etapas || [];
    const ambientes = projeto.ambientes || [];
    const mensagens = projeto.mensagens || [];
    const pagamento = projeto.pagamento || null;
    const atividades = projeto.atividades || [];
    const ocorrencias = projeto.ocorrencias || [];
    const msgNaoLidas = projeto.msgNaoLidas || 0;
    // Backend agora calcula com pesos por categoria. Fallback pro modelo antigo
    // se a API for antiga (compat com versões anteriores do portal).
    const concluidasPct = projeto.progresso_calculado != null
        ? projeto.progresso_calculado
        : (etapas.length
            ? Math.round(etapas.filter(e => e.status === 'concluida').length / etapas.length * 100)
            : 0);

    return (
        <div className="v2-shell">
            <style>{V2_STYLES}</style>

            {/* Background brand — papel quente + vignette sienna + diagonais + watermark do símbolo */}
            <div className="v2-bg" aria-hidden="true">
                <div className="v2-bg-vignette" />
                <div className="v2-bg-diagonals" />
                {/* Símbolo da marca como watermark centralizado (fallback: grafismo SVG paralelogramo) */}
                {empresa.logo_watermark_path ? (
                    <img
                        className="v2-bg-watermark"
                        src={empresa.logo_watermark_path}
                        alt=""
                        style={{ opacity: empresa.logo_watermark_opacity ?? 0.04 }}
                    />
                ) : (
                    <svg className="v2-bg-grafismo" viewBox="0 0 100 100" fill="none">
                        <path d="M 30 10 L 70 10 L 60 50 L 20 50 Z" fill="var(--v2-cobre-deep)" />
                        <path d="M 40 50 L 80 50 L 70 90 L 30 90 Z" fill="var(--v2-cobre-deep)" />
                    </svg>
                )}
            </div>

            {/* Topo: logo + experimento ribbon */}
            <div className="v2-topbar">
                <div className="v2-topbar-inner">
                    {empresa.logo_header_path ? (
                        <img src={empresa.logo_header_path} alt={empresa.nome || 'Ornato'} className="v2-logo" />
                    ) : (
                        <span className="v2-logo-text">{empresa.nome || 'Ornato'}</span>
                    )}
                    <span className="v2-topbar-label">Portal do Cliente</span>
                </div>
            </div>

            <main className="v2-main">
                <Hero projeto={projeto} empresa={empresa} concluidasPct={concluidasPct} etapas={etapas} />
                <StatusBar projeto={projeto} etapas={etapas} atividades={atividades} ocorrencias={ocorrencias} />
                <Cronograma etapas={etapas} />
                <Ambientes ambientes={ambientes} />
                <Fotos token={token} />
                <Documentos token={token} />
                {pagamento && <Financeiro pagamento={pagamento} />}

                <footer className="v2-footer">
                    <div className="v2-footer-contact">
                        {empresa.email && <span>{empresa.email}</span>}
                        {empresa.email && empresa.telefone && <span aria-hidden="true">·</span>}
                        {empresa.telefone && <span>{empresa.telefone}</span>}
                    </div>
                    <div className="v2-footer-meta">Portal Ornato · {new Date().getFullYear()}</div>
                </footer>
            </main>

            <ChatFAB token={token} mensagens={mensagens} clienteNome={projeto.cliente_nome} msgNaoLidas={msgNaoLidas} />
        </div>
    );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const V2_STYLES = `
.v2-shell {
    /* Tipografia da marca: Oswald-condensed pros títulos grandes (lembra o lettering ORNATO em CAPS),
       Geist pra body + títulos médios, Geist Mono pros numéricos */
    --v2-display-condensed: 'Oswald', 'Geist', system-ui, sans-serif;
    --v2-display: 'Geist', system-ui, -apple-system, sans-serif;
    --v2-body: 'Geist', system-ui, -apple-system, sans-serif;
    --v2-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
    /* Paleta da marca Ornato (do Manual de Identidade Visual): bege #DDD2CC, sienna #93614C, cinza quente #847974, preto quente #1E1917 */
    --v2-paper: #FAF7F2;
    --v2-surface: #ffffff;
    --v2-surface-2: #F2EDE5;
    --v2-ink: #1A1614;
    --v2-ink-2: #5C544E;
    --v2-ink-3: #847974;
    --v2-border: #E5DED5;
    --v2-border-soft: #EDE8DF;
    --v2-cobre: #B7654A; /* sienna brand — variável mantém nome "cobre" por compat interna */
    --v2-cobre-deep: #93614C; /* sienna profundo do manual */
    --v2-cobre-soft: color-mix(in oklch, var(--v2-cobre) 12%, transparent);

    min-height: 100vh;
    background: var(--v2-paper);
    color: var(--v2-ink);
    font-family: var(--v2-body);
    font-feature-settings: 'cv11', 'ss01', 'ss03';
    -webkit-font-smoothing: antialiased;
    position: relative;
    overflow-x: hidden;
}

.v2-shell * { box-sizing: border-box; }

@keyframes v2Pulse { 0%, 100% { box-shadow: 0 0 0 4px color-mix(in oklch, var(--v2-cobre) 22%, transparent); } 50% { box-shadow: 0 0 0 7px color-mix(in oklch, var(--v2-cobre) 6%, transparent); } }
@keyframes v2Spin { to { transform: rotate(360deg); } }
@keyframes v2Shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes v2RingBreath { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.012); } }
@keyframes v2RingSweep { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -1000; } }
@keyframes v2RingEndpointPulse { 0%, 100% { opacity: 1; transform-origin: center; } 50% { opacity: 0.5; } }
@keyframes v2FabBreathe { 0%, 100% { box-shadow: 0 12px 32px -8px color-mix(in oklch, var(--v2-cobre) 50%, transparent), 0 0 0 0 color-mix(in oklch, var(--v2-cobre) 30%, transparent); } 50% { box-shadow: 0 12px 32px -8px color-mix(in oklch, var(--v2-cobre) 60%, transparent), 0 0 0 12px color-mix(in oklch, var(--v2-cobre) 0%, transparent); } }
@keyframes v2DrawerIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes v2ScrimIn { from { opacity: 0; } to { opacity: 1; } }

/* ── Background editorial — vignette sienna + diagonais sutis (grafismo da marca) ── */
.v2-bg { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.v2-bg-vignette {
    position: absolute; top: -20%; left: 50%; transform: translateX(-50%);
    width: 140vw; height: 70vh; max-height: 700px;
    background: radial-gradient(ellipse at center top, color-mix(in oklch, var(--v2-cobre) 8%, transparent) 0%, transparent 55%);
    filter: blur(24px);
}
.v2-bg-diagonals {
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(
        62deg,
        transparent 0,
        transparent 88px,
        color-mix(in oklch, var(--v2-ink) 3.5%, transparent) 88px,
        color-mix(in oklch, var(--v2-ink) 3.5%, transparent) 89px
    );
    opacity: 0.9;
    mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 85%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 85%, transparent 100%);
}
.v2-bg-grafismo {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-12deg);
    width: 540px; height: 540px; opacity: 0.045;
}
.v2-bg-watermark {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 540px; max-width: 80vw; height: auto;
    mix-blend-mode: multiply;
    user-select: none; pointer-events: none;
}

/* ── Ring de progresso ── */
.v2-ring-wrap {
    position: relative;
    animation: v2RingBreath 4.2s ease-in-out infinite;
}
.v2-ring-svg { display: block; }
.v2-ring-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
}
.v2-ring-sweep {
    animation: v2RingSweep 6s linear infinite;
    opacity: 0.85;
}
.v2-ring-endpoint {
    animation: v2RingEndpointPulse 2.6s ease-in-out infinite;
}

/* ── Topbar ── */
.v2-topbar { position: relative; z-index: 2; }
.v2-topbar-inner {
    max-width: 880px; margin: 0 auto;
    padding: 40px 24px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.v2-logo { height: 32px; max-width: 160px; object-fit: contain; }
.v2-logo-text { font-family: var(--v2-display-condensed); font-weight: 500; font-size: 22px; letter-spacing: 0.04em; color: var(--v2-ink); text-transform: uppercase; }
.v2-topbar-label {
    font-family: var(--v2-mono); font-size: 11px; font-weight: 500;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--v2-ink-3);
}

/* ── Main ── */
.v2-main {
    position: relative; z-index: 1;
    max-width: 880px; margin: 0 auto;
    padding: 56px 24px 120px;
}

/* ── Hero ── */
.v2-hero { margin-bottom: 64px; }
.v2-hero-grid {
    display: grid; grid-template-columns: 1fr; gap: 48px; align-items: center;
}
@media (min-width: 720px) {
    .v2-hero-grid { grid-template-columns: 1.4fr 1fr; gap: 64px; }
}
.v2-hero-right { display: flex; justify-content: center; }
.v2-hero-title .v2-hero-name {
    position: relative;
    color: var(--v2-ink);
    display: inline-block;
}
.v2-hero-title .v2-hero-name::after {
    content: '';
    position: absolute;
    left: 2%; right: 2%;
    /* Posicionada abaixo dos descenders (g, j, p, q, y) — não corta a letra */
    bottom: -0.18em;
    height: 0.06em;
    background: var(--v2-cobre);
    border-radius: 2px;
    transform: scaleX(0); transform-origin: left center;
    animation: v2NameUnderline 900ms cubic-bezier(0.22, 1, 0.36, 1) 420ms forwards;
}
@keyframes v2NameUnderline { to { transform: scaleX(1); } }

.v2-hero-meta {
    display: grid; gap: 24px 32px;
    grid-template-columns: repeat(auto-fit, minmax(120px, max-content));
}
.v2-hero-meta-item { min-width: 0; }
.v2-hero-meta-item .v2-meta-value { white-space: nowrap; }
.v2-meta-label {
    font-family: var(--v2-mono); font-size: 10.5px; font-weight: 500;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--v2-ink-3);
    margin-bottom: 8px;
}
.v2-meta-value {
    font-family: var(--v2-mono); font-variant-numeric: tabular-nums;
    font-size: 18px; font-weight: 500; color: var(--v2-ink); letter-spacing: -0.02em;
    line-height: 1.2;
}

/* ── Statusbar (não sticky — banner discreto) ── */
.v2-statusbar {
    display: inline-flex; align-items: center; gap: 12px;
    padding: 10px 16px; margin-bottom: 56px;
    background: var(--v2-surface); border: 1px solid var(--v2-border);
    border-radius: 999px; font-size: 13px;
    box-shadow: 0 1px 3px color-mix(in oklch, var(--v2-ink) 4%, transparent);
}
.v2-statusbar-text { color: var(--v2-ink-2); }
.v2-statusbar-text strong { color: var(--v2-ink); font-weight: 500; }

/* ── Section ── */
.v2-section { margin-bottom: 80px; }
.v2-section-head { margin-bottom: 32px; }
.v2-section-title-row {
    margin-top: 14px;
    display: flex; align-items: baseline; gap: 16px;
}
.v2-section-num {
    font-family: var(--v2-mono); font-variant-numeric: tabular-nums;
    font-size: 1.5rem; font-weight: 500; color: var(--v2-cobre);
    letter-spacing: -0.02em; line-height: 1;
    opacity: 0.85;
}
.v2-section h2 {
    margin: 0; font-family: var(--v2-display-condensed);
    font-size: clamp(1.875rem, 3.4vw, 2.5rem);
    font-weight: 500; letter-spacing: -0.005em; color: var(--v2-ink); line-height: 1.0;
}

/* ── Status pill ── */
.v2-status-pill {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 4px 10px 4px 9px; border-radius: 999px;
    font-family: var(--v2-mono); font-size: 11px; font-weight: 500;
    letter-spacing: 0.02em; white-space: nowrap;
    background: var(--v2-surface-2); border: 1px solid var(--v2-border-soft);
    color: var(--v2-ink-2);
}
.v2-status-pill.v2-tone-active { color: var(--v2-ink); background: color-mix(in oklch, var(--v2-cobre) 8%, var(--v2-surface)); border-color: color-mix(in oklch, var(--v2-cobre) 22%, var(--v2-border)); }
.v2-status-pill.v2-tone-done { color: oklch(0.42 0.13 155); background: oklch(0.97 0.04 155); border-color: oklch(0.88 0.06 155); }
.v2-status-pill.v2-tone-late { color: oklch(0.45 0.18 27); background: oklch(0.97 0.04 27); border-color: oklch(0.88 0.08 27); }

/* ── Gantt horizontal ── */
.v2-gantt { display: none; }
@media (min-width: 720px) {
    .v2-gantt {
        display: block; position: relative;
        background: var(--v2-surface);
        border: 1px solid var(--v2-border); border-radius: 16px;
        padding: 18px 22px 22px; margin-bottom: 36px;
        overflow: hidden;
    }
}
.v2-gantt-axis {
    position: relative; height: 22px; margin-left: 180px; margin-bottom: 14px;
    border-bottom: 1px solid var(--v2-border-soft);
}
.v2-gantt-month {
    position: absolute; bottom: -1px; transform: translateX(-50%);
    height: 8px; width: 1px; background: var(--v2-border);
}
.v2-gantt-month-label {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    font-family: var(--v2-mono); font-size: 10px; font-weight: 600;
    letter-spacing: 0.12em; color: var(--v2-ink-3);
    white-space: nowrap;
}
.v2-gantt-grid {
    position: absolute; top: 40px; bottom: 22px; left: calc(22px + 180px); right: 22px;
    pointer-events: none;
}
.v2-gantt-gridline {
    position: absolute; top: 0; bottom: 0; width: 1px;
    background: color-mix(in oklch, var(--v2-ink) 4%, transparent);
}
.v2-gantt-today {
    position: absolute; top: -8px; bottom: -4px;
    transform: translateX(-50%);
    pointer-events: none; z-index: 2;
}
.v2-gantt-today-line {
    width: 1.5px; height: 100%;
    background: linear-gradient(to bottom, color-mix(in oklch, var(--v2-cobre) 80%, transparent), color-mix(in oklch, var(--v2-cobre) 30%, transparent));
    animation: v2RingEndpointPulse 2.4s ease-in-out infinite;
}
.v2-gantt-today-label {
    position: absolute; top: -2px; left: 50%; transform: translateX(-50%);
    font-family: var(--v2-mono); font-size: 9px; font-weight: 700;
    letter-spacing: 0.16em; color: var(--v2-cobre);
    padding: 2px 6px; background: var(--v2-surface);
    border: 1px solid color-mix(in oklch, var(--v2-cobre) 40%, var(--v2-border));
    border-radius: 4px; white-space: nowrap;
}
.v2-gantt-bars { position: relative; display: grid; gap: 8px; }
.v2-gantt-row {
    display: grid; grid-template-columns: 180px 1fr; align-items: center;
    height: 30px;
}
.v2-gantt-row-name {
    font-family: var(--v2-mono); font-size: 11px; color: var(--v2-ink-3);
    letter-spacing: 0.04em; padding-right: 14px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.v2-gantt-row-name span {
    font-family: var(--v2-display); font-size: 13px; color: var(--v2-ink);
    font-weight: 500; letter-spacing: -0.01em; margin-left: 4px;
    text-transform: none;
}
.v2-gantt-row-track {
    position: relative; height: 100%;
    background: var(--v2-surface-2);
    border-radius: 6px; overflow: hidden;
}
.v2-gantt-bar {
    position: absolute; top: 4px; bottom: 4px;
    border-radius: 5px;
    transform-origin: left center;
    transform: scaleX(0); opacity: 0;
    transition: transform 800ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms ease-out;
    overflow: hidden;
}
.v2-gantt-bar-shown { transform: scaleX(1); opacity: 1; }
.v2-gantt-bar-neutral {
    background: color-mix(in oklch, var(--v2-ink) 8%, transparent);
    border: 1px solid color-mix(in oklch, var(--v2-ink) 12%, transparent);
}
/* past: etapa cuja data já passou mas equipe ainda não marcou status. Sutilmente "feita" — cinza mais escuro. */
.v2-gantt-bar-past {
    background: color-mix(in oklch, var(--v2-ink) 14%, transparent);
    border: 1px solid color-mix(in oklch, var(--v2-ink) 20%, transparent);
    opacity: 0.85;
}
.v2-gantt-bar-active {
    background: color-mix(in oklch, var(--v2-cobre) 18%, var(--v2-surface));
    border: 1px solid color-mix(in oklch, var(--v2-cobre) 50%, var(--v2-border));
}
.v2-gantt-bar-done {
    background: color-mix(in oklch, oklch(0.65 0.13 155) 18%, var(--v2-surface));
    border: 1px solid color-mix(in oklch, oklch(0.55 0.14 155) 40%, var(--v2-border));
}
.v2-gantt-bar-empty {
    position: absolute; top: 4px; bottom: 4px; left: 0; right: 0;
    background: transparent; border: 1px dashed var(--v2-border);
    border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--v2-mono); font-size: 10px; color: var(--v2-ink-3);
    letter-spacing: 0.08em; text-transform: uppercase;
    transform: none; opacity: 0.7;
}
.v2-gantt-bar-fill {
    position: absolute; top: 0; bottom: 0; left: 0;
    width: 0;
    background: linear-gradient(90deg, color-mix(in oklch, var(--v2-cobre) 80%, white) 0%, var(--v2-cobre) 100%);
    transition: width 1000ms cubic-bezier(0.22, 1, 0.36, 1);
}
.v2-gantt-bar-done .v2-gantt-bar-fill {
    background: linear-gradient(90deg, oklch(0.65 0.13 155) 0%, oklch(0.55 0.14 155) 100%);
}
.v2-gantt-bar-pulse {
    position: absolute; top: 0; right: 0; bottom: 0; width: 60%;
    background: linear-gradient(90deg, transparent, color-mix(in oklch, white 50%, transparent), transparent);
    background-size: 200% 100%;
    animation: v2Shimmer 2.4s ease-in-out infinite;
}

/* ── Timeline ── */
.v2-timeline { list-style: none; padding: 0; margin: 0; }
.v2-timeline-item { display: grid; grid-template-columns: 36px 1fr; gap: 16px; padding-bottom: 28px; }
.v2-timeline-node { display: flex; flex-direction: column; align-items: center; padding-top: 2px; }
.v2-timeline-icon {
    width: 28px; height: 28px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: var(--v2-surface); border: 1px solid var(--v2-border);
    color: var(--v2-ink-2); flex-shrink: 0;
    transition: all 240ms ease-out;
}
.v2-timeline-icon.v2-tone-done { background: oklch(0.97 0.05 155); border-color: oklch(0.85 0.1 155); color: oklch(0.45 0.14 155); }
.v2-timeline-icon.v2-tone-active { background: color-mix(in oklch, var(--v2-cobre) 12%, var(--v2-surface)); border-color: color-mix(in oklch, var(--v2-cobre) 35%, var(--v2-border)); color: oklch(0.50 0.085 70); box-shadow: 0 0 0 4px color-mix(in oklch, var(--v2-cobre) 8%, transparent); }
.v2-timeline-line { width: 1px; flex: 1; min-height: 28px; margin: 8px 0 -8px; background: var(--v2-border); }
.v2-timeline-line-done { background: oklch(0.85 0.08 155); }
.v2-timeline-line-active { background: linear-gradient(to bottom, color-mix(in oklch, var(--v2-cobre) 60%, transparent), var(--v2-border) 80%); }

.v2-timeline-body { min-width: 0; padding-top: 2px; }
.v2-timeline-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.v2-timeline-num {
    font-family: var(--v2-mono); font-size: 10.5px; font-weight: 500;
    letter-spacing: 0.14em; color: var(--v2-ink-3); margin-bottom: 3px;
}
.v2-timeline-name {
    font-family: var(--v2-display); font-size: 16px; font-weight: 500;
    color: var(--v2-ink); letter-spacing: -0.015em; line-height: 1.35;
}
.v2-timeline-meta {
    margin-top: 6px; display: flex; align-items: center; gap: 6px;
    font-family: var(--v2-mono); font-variant-numeric: tabular-nums;
    font-size: 12px; color: var(--v2-ink-2);
}

/* ── Progress bar reusável ── */
.v2-progress-bar {
    margin-top: 14px; height: 4px; border-radius: 999px;
    background: var(--v2-border-soft); overflow: hidden;
}
.v2-progress-bar-thin { height: 3px; margin-top: 10px; }
.v2-progress-fill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, color-mix(in oklch, var(--v2-cobre) 65%, white) 0%, var(--v2-cobre) 100%);
    transition: width 720ms cubic-bezier(0.22, 1, 0.36, 1);
    position: relative; overflow: hidden;
}
.v2-progress-fill::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent, color-mix(in oklch, white 50%, transparent), transparent);
    background-size: 200% 100%; animation: v2Shimmer 2.6s ease-in-out infinite;
}

/* ── Ambientes ── */
.v2-ambientes {
    display: grid; gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}
.v2-ambiente {
    padding: 18px 20px; background: var(--v2-surface);
    border: 1px solid var(--v2-border); border-radius: 14px;
    transition: border-color 200ms, transform 200ms, box-shadow 200ms;
}
.v2-ambiente:hover {
    border-color: color-mix(in oklch, var(--v2-cobre) 30%, var(--v2-border));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px -4px color-mix(in oklch, var(--v2-ink) 8%, transparent);
}
.v2-ambiente-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.v2-ambiente-name { font-family: var(--v2-display); font-size: 15px; font-weight: 500; color: var(--v2-ink); letter-spacing: -0.015em; }
.v2-ambiente-foot {
    margin-top: 10px; display: flex; align-items: center; gap: 8px;
    font-family: var(--v2-mono); font-variant-numeric: tabular-nums;
    font-size: 11.5px; color: var(--v2-ink-2);
}

/* ── Fotos grid ── */
.v2-foto-grid {
    display: grid; gap: 8px;
    grid-template-columns: repeat(2, 1fr);
}
@media (min-width: 540px) {
    .v2-foto-grid { grid-template-columns: repeat(3, 1fr); gap: 12px; }
}
.v2-foto-cell {
    position: relative; aspect-ratio: 1; overflow: hidden;
    border-radius: 12px; border: 1px solid var(--v2-border);
    background: var(--v2-surface-2); cursor: pointer;
    padding: 0; transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.v2-foto-cell img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
}
.v2-foto-cell:hover img { transform: scale(1.05); }
.v2-foto-overlay {
    position: absolute; top: 8px; right: 8px;
    width: 28px; height: 28px; border-radius: 8px;
    background: color-mix(in oklch, white 90%, transparent);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    color: var(--v2-ink); opacity: 0; transition: opacity 200ms;
}
.v2-foto-cell:hover .v2-foto-overlay { opacity: 1; }

/* ── Skeletons ── */
.v2-skel-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.v2-skel-img { aspect-ratio: 1; border-radius: 12px; background: linear-gradient(90deg, var(--v2-surface-2) 0%, var(--v2-border-soft) 50%, var(--v2-surface-2) 100%); background-size: 200% 100%; animation: v2Shimmer 1.6s ease-in-out infinite; }
.v2-skel-list { display: grid; gap: 8px; }
.v2-skel-row { height: 56px; border-radius: 10px; background: linear-gradient(90deg, var(--v2-surface-2) 0%, var(--v2-border-soft) 50%, var(--v2-surface-2) 100%); background-size: 200% 100%; animation: v2Shimmer 1.6s ease-in-out infinite; }

/* ── Documentos ── */
.v2-doc-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.v2-doc-row a {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; background: var(--v2-surface);
    border: 1px solid var(--v2-border); border-radius: 12px;
    color: inherit; text-decoration: none;
    transition: border-color 180ms, transform 180ms, box-shadow 180ms;
}
.v2-doc-row a:hover {
    border-color: color-mix(in oklch, var(--v2-cobre) 30%, var(--v2-border));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px -4px color-mix(in oklch, var(--v2-ink) 8%, transparent);
}
.v2-doc-icon {
    width: 36px; height: 36px; border-radius: 8px;
    background: var(--v2-surface-2); border: 1px solid var(--v2-border-soft);
    display: flex; align-items: center; justify-content: center;
    color: var(--v2-ink-2); flex-shrink: 0;
}
.v2-doc-info { flex: 1; min-width: 0; }
.v2-doc-name {
    font-family: var(--v2-display); font-size: 14.5px; font-weight: 500;
    color: var(--v2-ink); letter-spacing: -0.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.v2-doc-meta {
    margin-top: 3px; display: flex; align-items: center; gap: 6px;
    font-family: var(--v2-mono); font-size: 11.5px; color: var(--v2-ink-3);
}
.v2-doc-action {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--v2-surface-2); display: flex; align-items: center; justify-content: center;
    color: var(--v2-ink-2); flex-shrink: 0;
    transition: background 200ms, color 200ms;
}
.v2-doc-row a:hover .v2-doc-action { background: var(--v2-cobre); color: white; }

/* ── Financeiro ── */
.v2-fin-summary {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
    padding: 24px; background: var(--v2-surface);
    border: 1px solid var(--v2-border); border-radius: 16px;
    margin-bottom: 24px;
}
.v2-fin-stat-label {
    font-family: var(--v2-mono); font-size: 10.5px; font-weight: 500;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--v2-ink-3);
    margin-bottom: 8px;
}
.v2-fin-stat-value {
    font-family: var(--v2-mono); font-variant-numeric: tabular-nums;
    font-size: clamp(1.05rem, 2.4vw, 1.375rem); font-weight: 500;
    color: var(--v2-ink); letter-spacing: -0.02em;
}
.v2-fin-paid { color: oklch(0.50 0.13 155); }
.v2-fin-stat-total { padding-left: 16px; border-left: 1px solid var(--v2-border-soft); }

.v2-fin-bar-wrap { margin-bottom: 24px; }
.v2-fin-bar {
    height: 6px; border-radius: 999px;
    background: var(--v2-border-soft); overflow: hidden;
}
.v2-fin-bar-fill {
    height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, oklch(0.65 0.12 155) 0%, oklch(0.55 0.14 155) 100%);
    transition: width 720ms cubic-bezier(0.22, 1, 0.36, 1);
}
.v2-fin-bar-label {
    margin-top: 8px; display: flex; align-items: center; gap: 6px;
    font-family: var(--v2-mono); font-size: 12px; color: var(--v2-ink-2);
}

.v2-parcela-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
.v2-parcela-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 14px 16px; border-radius: 10px;
    transition: background 180ms;
}
.v2-parcela-row:hover { background: var(--v2-surface-2); }
.v2-parcela-desc {
    font-family: var(--v2-display); font-size: 14px; font-weight: 500;
    color: var(--v2-ink); letter-spacing: -0.01em;
}
.v2-parcela-date {
    margin-top: 2px; font-family: var(--v2-mono); font-size: 11.5px; color: var(--v2-ink-3);
}
.v2-parcela-right { display: flex; align-items: center; gap: 14px; }
.v2-parcela-value {
    font-family: var(--v2-mono); font-variant-numeric: tabular-nums;
    font-size: 14.5px; font-weight: 500; letter-spacing: -0.01em;
}

/* ── Empty state ── */
.v2-empty {
    padding: 32px 24px; text-align: center;
    background: var(--v2-surface); border: 1px dashed var(--v2-border);
    border-radius: 14px;
}
.v2-empty-icon {
    width: 44px; height: 44px; border-radius: 12px;
    background: var(--v2-surface-2); border: 1px solid var(--v2-border-soft);
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--v2-ink-3); margin-bottom: 14px;
}
.v2-empty-title { font-family: var(--v2-display); font-size: 15px; font-weight: 500; color: var(--v2-ink); letter-spacing: -0.015em; }
.v2-empty-sub { margin-top: 6px; font-size: 13.5px; color: var(--v2-ink-2); max-width: 38ch; margin-left: auto; margin-right: auto; line-height: 1.55; }

/* ── Footer ── */
.v2-footer {
    margin-top: 72px; padding-top: 32px;
    border-top: 1px solid var(--v2-border);
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 12px;
    font-family: var(--v2-mono); font-size: 11.5px; color: var(--v2-ink-3);
}
.v2-footer-contact { display: flex; gap: 10px; align-items: center; }

/* ── FAB ── */
.v2-fab {
    position: fixed; bottom: 24px; right: 24px; z-index: 50;
    width: 56px; height: 56px; border-radius: 18px;
    background: var(--v2-cobre); color: white; border: none;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; animation: v2FabBreathe 3.4s ease-in-out infinite;
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.v2-fab:hover { transform: translateY(-2px) scale(1.04); }
.v2-fab-badge {
    position: absolute; top: -4px; right: -4px;
    min-width: 22px; height: 22px; padding: 0 6px;
    border-radius: 12px; background: oklch(0.58 0.2 27);
    color: white; font-family: var(--v2-mono); font-size: 11px; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--v2-paper);
    font-variant-numeric: tabular-nums;
}

/* ── Drawer ── */
.v2-drawer-scrim {
    position: fixed; inset: 0; z-index: 100;
    background: color-mix(in oklch, var(--v2-ink) 50%, transparent);
    backdrop-filter: blur(6px) saturate(110%);
    display: flex; align-items: flex-end; justify-content: center;
    animation: v2ScrimIn 240ms ease-out;
}
.v2-drawer {
    width: 100%; max-width: 540px; background: var(--v2-paper);
    border-radius: 20px 20px 0 0; max-height: 88vh;
    display: flex; flex-direction: column;
    box-shadow: 0 -12px 40px -8px color-mix(in oklch, var(--v2-ink) 20%, transparent);
    animation: v2DrawerIn 320ms cubic-bezier(0.22, 1, 0.36, 1);
    overflow: hidden;
}
.v2-drawer-head {
    padding: 18px 20px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    border-bottom: 1px solid var(--v2-border);
}
.v2-drawer-title { font-family: var(--v2-display); font-size: 17px; font-weight: 600; color: var(--v2-ink); letter-spacing: -0.02em; }
.v2-drawer-sub { font-family: var(--v2-mono); font-size: 11.5px; color: var(--v2-ink-3); margin-top: 2px; }
.v2-drawer-close { background: none; border: none; cursor: pointer; padding: 6px; color: var(--v2-ink-2); border-radius: 8px; transition: background 180ms; }
.v2-drawer-close:hover { background: var(--v2-surface-2); }

.v2-drawer-msgs { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.v2-msg { display: flex; flex-direction: column; max-width: 80%; }
.v2-msg-me { align-self: flex-end; align-items: flex-end; }
.v2-msg-team { align-self: flex-start; align-items: flex-start; }
.v2-msg-meta {
    display: flex; align-items: center; gap: 6px;
    font-family: var(--v2-mono); font-size: 10.5px; color: var(--v2-ink-3);
    margin-bottom: 4px;
}
.v2-msg-bubble {
    padding: 10px 14px; border-radius: 14px;
    font-size: 14px; line-height: 1.45; color: var(--v2-ink);
    white-space: pre-wrap; word-break: break-word;
}
.v2-msg-me .v2-msg-bubble { background: var(--v2-cobre-soft); border: 1px solid color-mix(in oklch, var(--v2-cobre) 30%, var(--v2-border)); border-top-right-radius: 4px; }
.v2-msg-team .v2-msg-bubble { background: var(--v2-surface); border: 1px solid var(--v2-border); border-top-left-radius: 4px; }

.v2-drawer-empty { padding: 40px 24px; text-align: center; color: var(--v2-ink-2); }
.v2-drawer-empty-icon { width: 40px; height: 40px; border-radius: 50%; background: var(--v2-cobre-soft); color: var(--v2-cobre); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 10px; }
.v2-drawer-empty p { font-size: 13.5px; margin: 0; }

.v2-drawer-input {
    padding: 16px 20px 20px; border-top: 1px solid var(--v2-border);
    background: var(--v2-paper); display: grid; gap: 8px;
}
.v2-drawer-name {
    padding: 8px 12px; font-size: 12.5px; font-family: var(--v2-mono);
    border: 1px solid var(--v2-border); border-radius: 8px;
    background: var(--v2-surface); color: var(--v2-ink-2);
    outline: none; transition: border-color 180ms;
}
.v2-drawer-name:focus { border-color: color-mix(in oklch, var(--v2-cobre) 50%, var(--v2-border)); }
.v2-drawer-send-row { display: flex; gap: 8px; }
.v2-drawer-text {
    flex: 1; padding: 11px 14px; font-size: 14px;
    border: 1px solid var(--v2-border); border-radius: 10px;
    background: var(--v2-surface); color: var(--v2-ink);
    outline: none; transition: border-color 180ms;
    font-family: inherit;
}
.v2-drawer-text:focus { border-color: color-mix(in oklch, var(--v2-cobre) 50%, var(--v2-border)); }
.v2-drawer-send {
    width: 42px; height: 42px; border-radius: 10px;
    background: var(--v2-cobre); color: white; border: none;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: opacity 180ms, transform 180ms;
}
.v2-drawer-send:disabled { opacity: 0.4; cursor: not-allowed; }
.v2-drawer-send:not(:disabled):hover { transform: scale(1.05); }

/* ── Lightbox ── */
.v2-lightbox {
    position: fixed; inset: 0; z-index: 200;
    background: color-mix(in oklch, var(--v2-ink) 90%, black);
    display: flex; align-items: center; justify-content: center;
    padding: 24px; animation: v2ScrimIn 240ms ease-out;
}
.v2-lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 10px; }
.v2-lightbox-close { position: fixed; top: 20px; right: 20px; width: 40px; height: 40px; border-radius: 12px; background: color-mix(in oklch, white 12%, transparent); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); }

/* ── Estados de page ── */
.v2-state { display: flex; align-items: center; justify-content: center; padding: 32px; }
.v2-loader { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.v2-loader-text { font-family: var(--v2-mono); font-size: 12px; letter-spacing: 0.06em; color: var(--v2-ink-2); }
.v2-error { max-width: 380px; padding: 36px 28px; background: var(--v2-surface); border: 1px solid var(--v2-border); border-radius: 16px; text-align: center; }
.v2-error-icon { width: 48px; height: 48px; border-radius: 14px; background: var(--v2-cobre-soft); color: var(--v2-cobre); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; }
.v2-error h2 { margin: 0 0 6px; font-family: var(--v2-display); font-size: 18px; font-weight: 600; color: var(--v2-ink); letter-spacing: -0.02em; }
.v2-error p { margin: 0; color: var(--v2-ink-2); font-size: 13.5px; line-height: 1.55; }

@media (prefers-reduced-motion: reduce) {
    .v2-shell *, .v2-shell *::before, .v2-shell *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
`;
