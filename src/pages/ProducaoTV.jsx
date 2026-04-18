import { useState, useEffect, useRef } from 'react';
import {
    Factory, Clock, AlertTriangle, CheckCircle2, Timer,
    TrendingUp, Gauge, Package, Wrench, ArrowRight,
    BarChart3, Users, Calendar, Zap, AlertCircle
} from 'lucide-react';

const REFRESH_INTERVAL = 30000;

const COLORS = {
    bg: '#0f172a',
    card: '#1e293b',
    cardBorder: '#334155',
    text: 'var(--bg-muted)',
    textMuted: 'var(--muted)',
    textDim: 'var(--muted)',
    green: 'var(--success)',
    greenDim: 'var(--success-hover)',
    yellow: '#eab308',
    yellowDim: 'var(--warning-hover)',
    red: 'var(--danger)',
    redDim: 'var(--danger-hover)',
    blue: 'var(--info)',
    blueDim: 'var(--info-hover)',
    purple: '#a855f7',
    cyan: '#06b6d4',
};

function getUrgencyColor(projeto) {
    if (!projeto.data_entrega) return { bg: COLORS.blue, border: COLORS.blue, label: 'Sem prazo' };
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const entrega = new Date(projeto.data_entrega + 'T12:00:00');
    const diff = Math.ceil((entrega - hoje) / 86400000);
    if (diff < 0) return { bg: COLORS.redDim, border: COLORS.red, label: `${Math.abs(diff)}d atrasado` };
    if (diff <= 5) return { bg: COLORS.yellowDim, border: COLORS.yellow, label: `${diff}d restante` };
    return { bg: COLORS.greenDim, border: COLORS.green, label: `${diff}d restante` };
}

function getUrgencyDot(projeto) {
    if (!projeto.data_entrega) return COLORS.blue;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const entrega = new Date(projeto.data_entrega + 'T12:00:00');
    const diff = Math.ceil((entrega - hoje) / 86400000);
    if (diff < 0) return COLORS.red;
    if (diff <= 5) return COLORS.yellow;
    return COLORS.green;
}

function ProgressBar({ value, color, height = 12 }) {
    const pct = Math.min(100, Math.max(0, value || 0));
    return (
        <div style={{
            width: '100%', height, borderRadius: height / 2,
            background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
            <div style={{
                width: `${pct}%`, height: '100%', borderRadius: height / 2,
                background: color || COLORS.blue,
                transition: 'width 0.6s ease',
            }} />
        </div>
    );
}

function TVClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    const horas = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const data = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return (
        <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: COLORS.text, letterSpacing: 2, lineHeight: 1 }}>
                {horas}
            </div>
            <div style={{ fontSize: 16, color: COLORS.textMuted, textTransform: 'capitalize', marginTop: 4 }}>
                {data}
            </div>
        </div>
    );
}

function CountdownBar({ refreshIn, total }) {
    const pct = (refreshIn / total) * 100;
    return (
        <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, height: 4,
            background: 'rgba(255,255,255,0.05)', zIndex: 100,
        }}>
            <div style={{
                width: `${pct}%`, height: '100%',
                background: COLORS.blue, transition: 'width 1s linear',
            }} />
        </div>
    );
}

function StatCard({ icon: Icon, label, value, sub, color }) {
    return (
        <div style={{
            background: COLORS.card, borderRadius: 16, padding: '20px 24px',
            border: `1px solid ${COLORS.cardBorder}`, display: 'flex', alignItems: 'center', gap: 16,
            minWidth: 0,
        }}>
            <div style={{
                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={26} color={color} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {label}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: COLORS.text, lineHeight: 1.1, marginTop: 2 }}>
                    {value}
                </div>
                {sub && <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 2 }}>{sub}</div>}
            </div>
        </div>
    );
}

function ProjectCard({ projeto }) {
    const urgency = getUrgencyColor(projeto);
    const pct = projeto.progresso_modulos || 0;
    const etapa = projeto.etapa_atual || 'Sem etapa';
    const cliente = projeto.cliente || 'Sem cliente';
    const modulos = projeto.modulos_total || 0;
    const modulosConcluidos = projeto.modulos_concluidos || 0;

    return (
        <div style={{
            background: COLORS.card, borderRadius: 16, padding: '20px 24px',
            borderLeft: `5px solid ${urgency.border}`,
            border: `1px solid ${COLORS.cardBorder}`,
            borderLeftWidth: 5, borderLeftColor: urgency.border,
            display: 'flex', flexDirection: 'column', gap: 12,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                        fontSize: 22, fontWeight: 800, color: COLORS.text, lineHeight: 1.2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {projeto.nome}
                    </div>
                    <div style={{ fontSize: 15, color: COLORS.textMuted, marginTop: 2 }}>
                        {cliente}
                    </div>
                </div>
                <div style={{
                    padding: '4px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    background: urgency.bg, color: urgency.border, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                    {urgency.label}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    background: `${COLORS.blue}25`, color: COLORS.blue,
                }}>
                    {etapa}
                </div>
                {projeto.data_entrega && (
                    <div style={{ fontSize: 13, color: COLORS.textDim, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={13} />
                        {new Date(projeto.data_entrega + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </div>
                )}
            </div>

            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: COLORS.textMuted }}>
                        {modulosConcluidos}/{modulos} modulos
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: pct >= 100 ? COLORS.green : COLORS.text }}>
                        {Math.round(pct)}%
                    </span>
                </div>
                <ProgressBar
                    value={pct}
                    color={pct >= 100 ? COLORS.green : pct >= 60 ? COLORS.blue : COLORS.yellow}
                    height={10}
                />
            </div>
        </div>
    );
}

function BottleneckCard({ gargalos }) {
    if (!gargalos || gargalos.length === 0) {
        return (
            <div style={{
                background: COLORS.card, borderRadius: 16, padding: '20px 24px',
                border: `1px solid ${COLORS.cardBorder}`, height: '100%',
                display: 'flex', flexDirection: 'column',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <Zap size={22} color={COLORS.green} />
                    <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>Gargalos</span>
                </div>
                <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 8,
                }}>
                    <CheckCircle2 size={40} color={COLORS.green} />
                    <span style={{ fontSize: 16, color: COLORS.green, fontWeight: 600 }}>
                        Nenhum gargalo detectado
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            background: COLORS.card, borderRadius: 16, padding: '20px 24px',
            border: `1px solid ${COLORS.cardBorder}`, height: '100%',
            display: 'flex', flexDirection: 'column',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <AlertTriangle size={22} color={COLORS.yellow} />
                <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>Gargalos</span>
                <span style={{
                    fontSize: 12, fontWeight: 700, background: `${COLORS.red}25`, color: COLORS.red,
                    padding: '2px 10px', borderRadius: 10,
                }}>
                    {gargalos.length}
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflow: 'auto' }}>
                {gargalos.map((g, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px', borderRadius: 12,
                        background: `${COLORS.red}10`, border: `1px solid ${COLORS.red}30`,
                    }}>
                        <AlertCircle size={20} color={COLORS.red} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>
                                {g.estacao || g.nome}
                            </div>
                            <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                                {g.motivo || `${g.projetos_aguardando || 0} projetos aguardando`}
                            </div>
                        </div>
                        {g.tempo_medio && (
                            <div style={{
                                fontSize: 14, fontWeight: 700, color: COLORS.yellow,
                                whiteSpace: 'nowrap',
                            }}>
                                {g.tempo_medio}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function CapacityCard({ capacidade }) {
    if (!capacidade) return null;
    const usado = capacidade.horas_usadas || 0;
    const disponivel = capacidade.horas_disponiveis || 40;
    const pct = disponivel > 0 ? Math.round((usado / disponivel) * 100) : 0;
    const porEstacao = capacidade.por_estacao || [];

    let barColor = COLORS.green;
    if (pct >= 90) barColor = COLORS.red;
    else if (pct >= 70) barColor = COLORS.yellow;

    return (
        <div style={{
            background: COLORS.card, borderRadius: 16, padding: '20px 24px',
            border: `1px solid ${COLORS.cardBorder}`, height: '100%',
            display: 'flex', flexDirection: 'column',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Gauge size={22} color={COLORS.cyan} />
                <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>Capacidade Semanal</span>
            </div>

            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: barColor, lineHeight: 1 }}>
                    {pct}%
                </div>
                <div style={{ fontSize: 15, color: COLORS.textMuted, marginTop: 4 }}>
                    {usado}h / {disponivel}h utilizadas
                </div>
            </div>

            <ProgressBar value={pct} color={barColor} height={14} />

            {porEstacao.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'auto' }}>
                    {porEstacao.map((e, i) => {
                        const ePct = e.horas_disponiveis > 0 ? Math.round((e.horas_usadas / e.horas_disponiveis) * 100) : 0;
                        let eColor = COLORS.green;
                        if (ePct >= 90) eColor = COLORS.red;
                        else if (ePct >= 70) eColor = COLORS.yellow;
                        return (
                            <div key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 13, color: COLORS.textMuted }}>{e.nome}</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: eColor }}>
                                        {e.horas_usadas}h / {e.horas_disponiveis}h
                                    </span>
                                </div>
                                <ProgressBar value={ePct} color={eColor} height={6} />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const CAROUSEL_INTERVAL = 15000; // 15s per view
const CAROUSEL_VIEWS = ['painel', 'projetos', 'capacidade'];

export default function ProducaoTV() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshIn, setRefreshIn] = useState(REFRESH_INTERVAL / 1000);
    const [logo, setLogo] = useState(null);
    const [carouselActive, setCarouselActive] = useState(false);
    const [carouselView, setCarouselView] = useState(0);
    const timerRef = useRef(null);
    const carouselRef = useRef(null);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('erp_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch('/api/producao-av/painel', { headers });
            if (!res.ok) throw new Error(`Erro ${res.status}`);
            const json = await res.json();
            setData(json);
            setError(null);
        } catch (err) {
            console.error('ProducaoTV fetch error:', err);
            setError(err.message || 'Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    };

    const fetchLogo = async () => {
        try {
            const token = localStorage.getItem('erp_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const res = await fetch('/api/config/empresa', { headers });
            if (res.ok) {
                const cfg = await res.json();
                if (cfg.logo_header_path) setLogo(cfg.logo_header_path);
                else if (cfg.logo_sistema) setLogo(cfg.logo_sistema);
            }
        } catch (e) {
            // silently fail
        }
    };

    useEffect(() => {
        fetchData();
        fetchLogo();
    }, []);

    useEffect(() => {
        const countdown = setInterval(() => {
            setRefreshIn(prev => {
                if (prev <= 1) {
                    fetchData();
                    return REFRESH_INTERVAL / 1000;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(countdown);
    }, []);

    // Carousel auto-rotation
    useEffect(() => {
        if (!carouselActive) {
            if (carouselRef.current) clearInterval(carouselRef.current);
            return;
        }
        carouselRef.current = setInterval(() => {
            setCarouselView(v => (v + 1) % CAROUSEL_VIEWS.length);
        }, CAROUSEL_INTERVAL);
        return () => clearInterval(carouselRef.current);
    }, [carouselActive]);

    const projetos = data?.projetos || [];
    const capacidade = data?.capacidade || null;
    const gargalos = data?.gargalos || [];
    const resumo = data?.resumo || {};

    const totalProjetos = projetos.length;
    const projetosAtrasados = projetos.filter(p => {
        if (!p.data_entrega) return false;
        const diff = Math.ceil((new Date(p.data_entrega + 'T12:00:00') - new Date()) / 86400000);
        return diff < 0;
    }).length;
    const projetosNoPrazo = totalProjetos - projetosAtrasados;
    const modulosTotalGeral = projetos.reduce((s, p) => s + (p.modulos_total || 0), 0);
    const modulosConcluidosGeral = projetos.reduce((s, p) => s + (p.modulos_concluidos || 0), 0);

    if (loading) {
        return (
            <div style={{
                width: '100vw', height: '100vh', background: COLORS.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 16,
            }}>
                <Factory size={64} color={COLORS.blue} />
                <div style={{ fontSize: 24, color: COLORS.text, fontWeight: 700 }}>Carregando painel...</div>
            </div>
        );
    }

    return (
        <div style={{
            width: '100vw', height: '100vh', background: COLORS.bg,
            overflow: 'hidden', fontFamily: "'Inter', system-ui, sans-serif",
            display: 'flex', flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 32px', borderBottom: `1px solid ${COLORS.cardBorder}`,
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {logo ? (
                        <img src={logo} alt="Logo" style={{ height: 44, objectFit: 'contain' }} />
                    ) : (
                        <Factory size={36} color={COLORS.blue} />
                    )}
                    <div>
                        <div style={{ fontSize: 26, fontWeight: 900, color: COLORS.text, lineHeight: 1 }}>
                            TV Fabrica
                        </div>
                        <div style={{ fontSize: 13, color: COLORS.textDim }}>
                            Painel de Producao em Tempo Real
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    {error && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 14px', borderRadius: 8,
                            background: `${COLORS.red}20`, color: COLORS.red, fontSize: 13, fontWeight: 600,
                        }}>
                            <AlertCircle size={15} />
                            {error}
                        </div>
                    )}
                    {/* Carousel toggle */}
                    <button
                        onClick={() => { setCarouselActive(c => !c); setCarouselView(0); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 16px', borderRadius: 8, border: 'none',
                            background: carouselActive ? `${COLORS.green}30` : `${COLORS.textDim}30`,
                            color: carouselActive ? COLORS.green : COLORS.textMuted,
                            cursor: 'pointer', fontSize: 13, fontWeight: 700,
                            transition: 'all 0.3s',
                        }}
                    >
                        <ArrowRight size={14} style={{ transform: carouselActive ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.3s' }} />
                        Carrossel {carouselActive ? 'ON' : 'OFF'}
                    </button>
                    {carouselActive && (
                        <div style={{ display: 'flex', gap: 6 }}>
                            {CAROUSEL_VIEWS.map((v, i) => (
                                <div key={v} style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: i === carouselView ? COLORS.blue : COLORS.textDim,
                                    transition: 'background 0.3s',
                                }} />
                            ))}
                        </div>
                    )}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 13, color: COLORS.textDim,
                    }}>
                        <Timer size={14} />
                        Atualiza em {refreshIn}s
                    </div>
                    <TVClock />
                </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: '20px 32px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* View: Painel (default / carousel[0]) */}
                {(!carouselActive || CAROUSEL_VIEWS[carouselView] === 'painel') && !carouselActive && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gridTemplateRows: 'auto 1fr', gap: 20, flex: 1, overflow: 'hidden' }}>
                        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                            <StatCard icon={Package} label="Projetos Ativos" value={resumo.projetos_ativos ?? totalProjetos} sub={`${projetosNoPrazo} no prazo`} color={COLORS.blue} />
                            <StatCard icon={AlertTriangle} label="Atrasados" value={resumo.projetos_atrasados ?? projetosAtrasados} sub="requerem atenção" color={COLORS.red} />
                            <StatCard icon={CheckCircle2} label="Modulos Prontos" value={`${resumo.modulos_concluidos ?? modulosConcluidosGeral}/${resumo.modulos_total ?? modulosTotalGeral}`} sub={modulosTotalGeral > 0 ? `${Math.round((modulosConcluidosGeral / modulosTotalGeral) * 100)}% concluido` : ''} color={COLORS.green} />
                            <StatCard icon={TrendingUp} label="Produtividade" value={resumo.produtividade ? `${resumo.produtividade}%` : '--'} sub={resumo.produtividade_label || 'esta semana'} color={COLORS.purple} />
                        </div>
                        <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 8, scrollbarWidth: 'thin', scrollbarColor: `${COLORS.cardBorder} transparent` }}>
                            {projetos.length === 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
                                    <Package size={48} color={COLORS.textDim} />
                                    <span style={{ fontSize: 18, color: COLORS.textDim }}>Nenhum projeto em producao</span>
                                </div>
                            ) : projetos.map((p, i) => <ProjectCard key={p.id || i} projeto={p} />)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto', scrollbarWidth: 'thin', scrollbarColor: `${COLORS.cardBorder} transparent` }}>
                            <CapacityCard capacidade={capacidade} />
                            <BottleneckCard gargalos={gargalos} />
                        </div>
                    </div>
                )}

                {/* Carousel: Stats overview */}
                {carouselActive && CAROUSEL_VIEWS[carouselView] === 'painel' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24, justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 2 }}>Resumo Geral</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
                            <StatCard icon={Package} label="Projetos Ativos" value={resumo.projetos_ativos ?? totalProjetos} sub={`${projetosNoPrazo} no prazo`} color={COLORS.blue} />
                            <StatCard icon={AlertTriangle} label="Atrasados" value={resumo.projetos_atrasados ?? projetosAtrasados} sub="requerem atenção" color={COLORS.red} />
                            <StatCard icon={CheckCircle2} label="Modulos Prontos" value={`${resumo.modulos_concluidos ?? modulosConcluidosGeral}/${resumo.modulos_total ?? modulosTotalGeral}`} sub={modulosTotalGeral > 0 ? `${Math.round((modulosConcluidosGeral / modulosTotalGeral) * 100)}% concluido` : ''} color={COLORS.green} />
                            <StatCard icon={TrendingUp} label="Produtividade" value={resumo.produtividade ? `${resumo.produtividade}%` : '--'} sub={resumo.produtividade_label || 'esta semana'} color={COLORS.purple} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            <CapacityCard capacidade={capacidade} />
                            <BottleneckCard gargalos={gargalos} />
                        </div>
                    </div>
                )}

                {/* Carousel: Projects detail */}
                {carouselActive && CAROUSEL_VIEWS[carouselView] === 'projetos' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
                        <div style={{ textAlign: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 2 }}>Projetos em Produção</div>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: projetos.length > 4 ? 'repeat(2, 1fr)' : '1fr', gap: 16 }}>
                            {projetos.length === 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, gridColumn: '1 / -1' }}>
                                    <Package size={64} color={COLORS.textDim} />
                                    <span style={{ fontSize: 22, color: COLORS.textDim }}>Nenhum projeto em producao</span>
                                </div>
                            ) : projetos.map((p, i) => <ProjectCard key={p.id || i} projeto={p} />)}
                        </div>
                    </div>
                )}

                {/* Carousel: Capacity & Bottlenecks */}
                {carouselActive && CAROUSEL_VIEWS[carouselView] === 'capacidade' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
                        <div style={{ textAlign: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 2 }}>Capacidade & Gargalos</div>
                        </div>
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, overflow: 'auto' }}>
                            <CapacityCard capacidade={capacidade} />
                            <BottleneckCard gargalos={gargalos} />
                        </div>
                    </div>
                )}
            </div>

            <CountdownBar refreshIn={refreshIn} total={REFRESH_INTERVAL / 1000} />
        </div>
    );
}
