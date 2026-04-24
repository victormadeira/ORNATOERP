import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { Z, Ic, Badge, SectionHeader, TabBar, Sparkline, Skeleton, SkeletonCard } from '../ui';
import { STATUS_PROJ, CAT_COLOR, CAT_LABEL } from '../theme';
import { R$, N } from '../engine';
import {
    TrendingUp, TrendingDown, AlertTriangle, Clock, DollarSign,
    Briefcase, FileText, CreditCard, User as UserIcon, ArrowRight,
    Calendar, Eye, ChevronRight, Activity, BarChart3, Wallet,
    CheckCircle2, XCircle, PauseCircle, Zap, PieChart, ArrowUpRight,
    ArrowDownRight, Receipt, Plus, Trash2, Edit3, Check, X,
    Factory, Truck, Package, Wrench, ChevronDown, RefreshCw,
    Sparkles, LayoutGrid, Target, Users, Flame, Layers, ArrowUp, ArrowDown,
    Minus, MessageCircle, Phone, MapPin, Bell
} from 'lucide-react';

const greet = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

// ══════════════════════════════════════════════════════════════════
// HERO — saudação premium com aurora + faturamento destacado
// ══════════════════════════════════════════════════════════════════
function HeroCard({ user, headline, today, refreshing, onRefresh }) {
    const up = headline?.pct_variacao > 0;
    const down = headline?.pct_variacao < 0;
    const nome = (user?.nome || '').split(' ')[0] || '';
    const dateMain = today.split(',')[0];
    const dateRest = today.split(',').slice(1).join(',').trim();

    return (
        <div className="hero-card animate-fade-up" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap' }}>
                {/* Left — saudação */}
                <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '5px 11px', borderRadius: 99,
                        background: 'rgba(201, 169, 110, 0.14)',
                        border: '1px solid rgba(201, 169, 110, 0.30)',
                        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
                        color: '#D4B47C', marginBottom: 18,
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D4B47C', boxShadow: '0 0 8px #D4B47C' }} />
                        {dateMain}
                    </div>
                    <h1 className="hero-card-title">
                        {greet()}{nome ? ',' : ''}
                        {nome && <span className="text-gradient-accent" style={{ marginLeft: 12 }}>{nome}</span>}
                    </h1>
                    <p className="hero-card-subtitle">{dateRest}</p>
                </div>

                {/* Right — faturamento stat */}
                {headline && (
                    <div className="hero-stat-block" style={{ flex: '1 1 260px', minWidth: 0 }}>
                        <div className="hero-stat-label">
                            Faturamento · {headline.mes_atual}
                        </div>
                        <div className="hero-stat-value">{R$(headline.faturamento_mes)}</div>
                        <div className="hero-stat-meta" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 99,
                                background: up ? 'rgba(159, 191, 126, 0.18)' : down ? 'rgba(217, 117, 96, 0.18)' : 'rgba(244,236,219,0.10)',
                                color: up ? '#B6CF98' : down ? '#E5907D' : 'rgba(244,236,219,0.8)',
                                fontWeight: 700, fontSize: 12,
                                border: `1px solid ${up ? 'rgba(159, 191, 126, 0.30)' : down ? 'rgba(217, 117, 96, 0.30)' : 'rgba(244,236,219,0.16)'}`,
                            }}>
                                {up ? <TrendingUp size={13} /> : down ? <TrendingDown size={13} /> : <Minus size={13} />}
                                {up && '+'}{headline.pct_variacao}%
                            </span>
                            <span style={{ fontSize: 11.5, color: 'rgba(244, 236, 219, 0.55)', fontWeight: 500 }}>
                                {headline.qtd_fechados} fechado{headline.qtd_fechados !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom — live feed + refresh */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginTop: 26, paddingTop: 20, borderTop: '1px solid rgba(244, 236, 219, 0.08)',
                gap: 16, flexWrap: 'wrap',
            }}>
                <div style={{ fontSize: 11.5, color: 'rgba(244, 236, 219, 0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9FBF7E', boxShadow: '0 0 8px #9FBF7E' }} />
                    Dados em tempo real · sincronização a cada 60s
                </div>
                <button
                    onClick={onRefresh}
                    aria-label={refreshing ? 'Atualizando…' : 'Atualizar dados'}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 10,
                        background: 'rgba(244, 236, 219, 0.08)', border: '1px solid rgba(244, 236, 219, 0.12)',
                        color: 'rgba(244, 236, 219, 0.85)', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 180ms var(--ease-out)', touchAction: 'manipulation',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244, 236, 219, 0.14)'; e.currentTarget.style.borderColor = 'rgba(201, 169, 110, 0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(244, 236, 219, 0.08)'; e.currentTarget.style.borderColor = 'rgba(244, 236, 219, 0.12)'; }}
                >
                    <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
                    {refreshing ? 'Atualizando…' : 'Atualizar'}
                </button>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// KPI STRIP — 4 cards horizontais com trend + sparkline
// ══════════════════════════════════════════════════════════════════
function TrendChip({ value, suffix = '%' }) {
    if (value === undefined || value === null) return null;
    const up = value > 0;
    const down = value < 0;
    const cls = up ? 'trend-up' : down ? 'trend-down' : 'trend-flat';
    const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
    return (
        <span className={`trend-chip ${cls}`}>
            <Icon size={11} strokeWidth={2.6} />
            {up && '+'}{value}{suffix}
        </span>
    );
}

function KpiProCard({ label, value, icon: Icon, sub, trend, spark, sparkColor = 'var(--accent)', onClick }) {
    return (
        <div
            className="kpi-pro animate-fade-up"
            onClick={onClick}
            style={onClick ? { cursor: 'pointer' } : undefined}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
        >
            <div className="kpi-pro-head">
                <span className="kpi-pro-label">{label}</span>
                <span className="kpi-pro-icon" aria-hidden="true">
                    <Icon size={15} strokeWidth={2.2} />
                </span>
            </div>
            <div className="kpi-pro-value">{value}</div>
            <div className="kpi-pro-foot">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {trend !== undefined && trend !== null && <TrendChip value={trend} />}
                    {sub && <span className="kpi-pro-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
                </div>
                {spark && spark.length > 1 && (
                    <Sparkline data={spark} width={64} height={22} color={sparkColor} />
                )}
            </div>
        </div>
    );
}

function KpiStrip({ data, isVendedor, nav }) {
    const h = data?.headline;
    const pipeTotal = data?.pipeline_total || 0;
    const pipelineQtd = (data?.pipeline || []).reduce((s, d) => s + (d.qtd || 0), 0);
    const projAtivos = data?.total_projetos_ativos || 0;
    const fc = data?.fluxo_caixa || {};
    const aRec = (fc.entradas_30d || 0);
    const recebidoMes = fc.recebido_mes || 0;

    // Sparkline — últimos 6 meses de faturamento (mock para preview se ausente)
    const spark = (data?.historico_faturamento || []).slice(-8);

    // Taxa de conversão (pipeline): ok/total
    const aprovados = (data?.pipeline || []).find(d => d.id === 'ok')?.qtd || 0;
    const txConv = pipelineQtd > 0 ? Math.round((aprovados / pipelineQtd) * 100) : 0;

    const cards = isVendedor && data?.vendedor ? [
        { label: 'Orçamentos no mês', value: String(data.vendedor.orcs_mes), icon: FileText, sub: R$(data.vendedor.orcs_valor_mes), onClick: () => nav('orcs') },
        { label: 'Aprovados no mês', value: String(data.vendedor.aprovados_mes), icon: CheckCircle2, sub: R$(data.vendedor.aprovados_valor_mes), onClick: () => nav('orcs') },
        { label: 'Conversão', value: `${data.vendedor.taxa_conversao}%`, icon: Target, sub: 'orçamentos → aprovados' },
        { label: 'Novos clientes', value: String(data.vendedor.novos_clientes_mes), icon: Users, sub: 'neste mês', onClick: () => nav('cli') },
    ] : [
        {
            label: 'Faturamento mês',
            value: R$(h?.faturamento_mes || 0),
            icon: Flame,
            trend: h?.pct_variacao,
            sub: `${h?.qtd_fechados || 0} fechados`,
            spark,
            sparkColor: 'var(--accent)',
            onClick: () => nav('orcs'),
        },
        {
            label: 'Pipeline ativo',
            value: R$(pipeTotal),
            icon: Layers,
            sub: `${pipelineQtd} propostas`,
            onClick: () => nav('kb'),
        },
        {
            label: 'Conversão',
            value: `${txConv}%`,
            icon: Target,
            sub: `${aprovados} aprovados`,
            onClick: () => nav('kb'),
        },
        {
            label: 'Projetos ativos',
            value: String(projAtivos),
            icon: Briefcase,
            sub: data?.producao_resumo?.projetos_atrasados > 0
                ? `${data.producao_resumo.projetos_atrasados} atrasado${data.producao_resumo.projetos_atrasados > 1 ? 's' : ''}`
                : 'todos no prazo',
            onClick: () => nav('proj'),
        },
    ];

    return (
        <div className="stagger-children" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginBottom: 20,
        }}>
            {cards.map((c, i) => <KpiProCard key={i} {...c} />)}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// QUICK ACTIONS — command bar com pills
// ══════════════════════════════════════════════════════════════════
function QuickActions({ nav, isVendedor }) {
    const actions = [
        { label: 'Novo orçamento', icon: FileText, pg: 'orcs', primary: true },
        { label: 'Novo cliente', icon: UserIcon, pg: 'cli' },
        ...(!isVendedor ? [{ label: 'Novo projeto', icon: Briefcase, pg: 'proj' }] : []),
        { label: 'Pipeline CRM', icon: LayoutGrid, pg: 'kb' },
        ...(!isVendedor ? [{ label: 'Financeiro', icon: Wallet, pg: 'financeiro' }] : []),
        { label: 'Biblioteca', icon: Package, pg: 'cat' },
    ];
    return (
        <div className="command-bar" role="toolbar" aria-label="Ações rápidas">
            {actions.map((a, i) => {
                const Icon = a.icon;
                return (
                    <button
                        key={i}
                        onClick={() => nav(a.pg)}
                        className={`quick-pill ${a.primary ? 'quick-pill-primary' : ''}`}
                    >
                        <span className="quick-pill-icon"><Icon size={13} strokeWidth={2.4} /></span>
                        {a.label}
                    </button>
                );
            })}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// FILA DE ATENÇÃO — cards de alerta lado a lado
// ══════════════════════════════════════════════════════════════════
function FilaAtencao({ data, nav }) {
    if (!data || (data.total_parados === 0 && data.total_vencidas === 0)) return null;

    return (
        <div className="chart-card-pro animate-fade-up" style={{ marginBottom: 20 }}>
            <div className="chart-card-pro-head" style={{
                background: 'linear-gradient(180deg, rgba(176, 120, 32, 0.06), transparent)',
            }}>
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon" style={{
                        background: 'rgba(176, 120, 32, 0.10)',
                        borderColor: 'rgba(176, 120, 32, 0.25)',
                        color: 'var(--warning)',
                    }}>
                        <AlertTriangle size={15} strokeWidth={2.2} />
                    </span>
                    <h3>Fila de atenção</h3>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>
                    {data.total_parados > 0 && `${data.total_parados} orçamento${data.total_parados > 1 ? 's' : ''} parado${data.total_parados > 1 ? 's' : ''}`}
                    {data.total_parados > 0 && data.total_vencidas > 0 && ' · '}
                    {data.total_vencidas > 0 && `${data.total_vencidas} conta${data.total_vencidas > 1 ? 's' : ''} vencida${data.total_vencidas > 1 ? 's' : ''}`}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: data.total_parados > 0 && data.total_vencidas > 0 ? '1fr 1fr' : '1fr' }}>
                {data.total_parados > 0 && (
                    <div style={{ borderRight: data.total_vencidas > 0 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ padding: '10px 22px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={11} strokeWidth={2.4} /> Orçamentos parados (&gt;7 dias)
                        </div>
                        {data.orcamentos_parados.slice(0, 5).map((o, i) => {
                            const urgency = o.dias_parado > 14 ? { color: 'var(--danger)', bg: 'rgba(160,71,58,0.12)', border: 'rgba(160,71,58,0.28)' }
                                : o.dias_parado >= 7 ? { color: 'var(--warning)', bg: 'rgba(176,120,32,0.12)', border: 'rgba(176,120,32,0.28)' }
                                    : { color: 'var(--text-muted)', bg: 'var(--bg-muted)', border: 'var(--border)' };
                            return (
                                <div
                                    key={o.id}
                                    onClick={() => nav('orcs')}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav('orcs'); } }}
                                    role="button" tabIndex={0}
                                    aria-label={`Orçamento de ${o.cliente_nome}, ${o.dias_parado} dias parado`}
                                    style={{
                                        padding: '12px 22px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                                        animation: `stagger-in 0.25s ease ${i * 40}ms both`,
                                        transition: 'background 150ms var(--ease-out)',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{o.cliente_nome}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{o.ambiente || '—'} · <span className="font-tabular">{R$(o.valor_venda)}</span></div>
                                    </div>
                                    <span style={{
                                        fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                                        background: urgency.bg, color: urgency.color,
                                        border: `1px solid ${urgency.border}`,
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>{o.dias_parado}d</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {data.total_vencidas > 0 && (
                    <div>
                        <div style={{ padding: '10px 22px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.10em', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <XCircle size={11} strokeWidth={2.4} style={{ color: 'var(--danger)' }} /> Contas vencidas · <span className="font-tabular" style={{ color: 'var(--danger)' }}>{R$(data.valor_vencido)}</span>
                        </div>
                        {data.contas_vencidas.slice(0, 5).map((c, i) => (
                            <div
                                key={c.id}
                                onClick={() => nav('financeiro')}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav('financeiro'); } }}
                                role="button" tabIndex={0}
                                aria-label={`Conta vencida: ${c.descricao}, ${c.dias_atraso} dias atraso, ${R$(c.valor)}`}
                                style={{
                                    padding: '12px 22px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                                    animation: `stagger-in 0.25s ease ${i * 40}ms both`,
                                    transition: 'background 150ms var(--ease-out)',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{c.descricao}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.projeto_nome}</div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div className="font-display font-tabular" style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', letterSpacing: '-0.02em' }}>{R$(c.valor)}</div>
                                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{c.dias_atraso}d atraso</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// PRODUÇÃO RESUME — stat tiles com ícone accent
// ══════════════════════════════════════════════════════════════════
function ProducaoResume({ data, nav }) {
    if (!data) return null;
    const items = [
        { icon: Factory, label: 'Em produção', value: data.projetos_ativos, color: 'var(--primary)', sub: data.projetos_atrasados > 0 ? `${data.projetos_atrasados} atrasado${data.projetos_atrasados > 1 ? 's' : ''}` : 'no prazo' },
        { icon: Clock, label: 'Horas/semana', value: `${data.horas_semana}h`, color: 'var(--accent)', sub: 'apontadas' },
        { icon: Truck, label: 'Entregas', value: data.entregas_semana, color: 'var(--warning)', sub: 'esta semana' },
        { icon: Wrench, label: 'Instalações', value: data.instalacoes_semana, color: 'var(--success)', sub: 'esta semana' },
    ];

    return (
        <div className="chart-card-pro animate-fade-up" style={{ marginBottom: 20 }}>
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Factory size={15} strokeWidth={2.2} /></span>
                    <h3>Produção &amp; Expedição</h3>
                </div>
                <button onClick={() => nav('producao_fabrica')} className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
                    Ver detalhes <ChevronRight size={14} />
                </button>
            </div>
            <div className="chart-card-pro-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                    {items.map((it, i) => {
                        const I = it.icon;
                        return (
                            <div key={i} className="hover-lift" style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '14px 16px', borderRadius: 12,
                                background: 'var(--bg-subtle)',
                                border: '1px solid var(--border)',
                                animation: `stagger-in 0.3s ease ${i * 50}ms both`,
                            }}>
                                <div style={{
                                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                                    background: `${it.color}14`,
                                    border: `1px solid ${it.color}22`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 8px ${it.color}18`,
                                }}>
                                    <I size={20} style={{ color: it.color }} strokeWidth={2.2} />
                                </div>
                                <div>
                                    <div className="font-display font-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.025em' }}>{it.value}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{it.label} · {it.sub}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {data.gargalos?.length > 0 && (
                    <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {data.gargalos.map((g, i) => {
                            const severity = g.qtd >= 8 ? { bg: 'rgba(160,71,58,0.10)', color: 'var(--danger)', border: 'rgba(160,71,58,0.25)', pulse: true }
                                : g.qtd >= 4 ? { bg: 'rgba(176,120,32,0.10)', color: 'var(--warning)', border: 'rgba(176,120,32,0.25)', pulse: false }
                                    : { bg: 'rgba(176,120,32,0.06)', color: 'var(--warning)', border: 'rgba(176,120,32,0.15)', pulse: false };
                            return (
                                <span key={i} style={{
                                    fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                                    background: severity.bg, color: severity.color,
                                    border: `1px solid ${severity.border}`,
                                    animation: severity.pulse ? 'pulse 2s ease-in-out infinite' : 'none',
                                }}>
                                    {g.etapa}: {g.qtd}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// PIPELINE VISUAL — funil horizontal premium
// ══════════════════════════════════════════════════════════════════
function PipelineVisual({ data, total, nav }) {
    if (!data || data.length === 0) return null;
    const totalQtd = data.reduce((s, d) => s + d.qtd, 0);
    const firstQtd = data[0]?.qtd || 1;
    const aprovados = data.find(d => d.id === 'ok')?.qtd || 0;
    const txConv = totalQtd > 0 ? ((aprovados / totalQtd) * 100).toFixed(1) : '0';
    const ticketMedio = totalQtd > 0 ? total / totalQtd : 0;

    return (
        <div className="chart-card-pro animate-fade-up">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><LayoutGrid size={15} strokeWidth={2.2} /></span>
                    <h3>Funil de vendas</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>{totalQtd} propostas</span>
                    <span className="font-display font-tabular" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{R$(total)}</span>
                </div>
            </div>
            <div className="chart-card-pro-body" style={{ paddingTop: 8 }}>
                {data.map((s, i) => {
                    const funnelPct = firstQtd > 0 ? Math.max((s.qtd / firstQtd) * 100, s.qtd > 0 ? 6 : 2) : 2;
                    const pctTotal = total > 0 ? ((s.valor / total) * 100).toFixed(0) : 0;
                    return (
                        <div key={s.id} className="funnel-row" onClick={() => nav('kb')}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav('kb'); } }}
                            role="button" tabIndex={0}
                            style={{ animation: `stagger-in 0.35s ease ${i * 60}ms both` }}
                            aria-label={`${s.nome}: ${s.qtd} propostas, ${R$(s.valor)}`}
                        >
                            <div className="funnel-row-count">{s.qtd}</div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
                                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.005em' }}>{s.nome}</span>
                                    <span className="font-tabular" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{R$(s.valor)}</span>
                                </div>
                                <div className="funnel-row-bar">
                                    <div className="funnel-row-bar-fill" style={{
                                        width: `${funnelPct}%`,
                                        background: `linear-gradient(90deg, ${s.cor}, ${s.cor}cc)`,
                                        animationDelay: `${i * 60 + 100}ms`,
                                    }} />
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', minWidth: 42 }}>
                                <div className="font-tabular" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{pctTotal}%</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>do total</div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{
                padding: '14px 12px', borderTop: '1px solid var(--border)',
                display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8,
                background: 'var(--bg-subtle)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="font-display font-tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>{txConv}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Conversão</div>
                </div>
                <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                    <div className="font-display font-tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.025em' }}>{R$(ticketMedio)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Ticket médio</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div className="font-display font-tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>{totalQtd}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>Total</div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// FLUXO DE CAIXA — segmented bar + stat list
// ══════════════════════════════════════════════════════════════════
function FluxoCaixa({ data }) {
    if (!data) return null;
    const totalEntradas = (data.recebido_mes || 0) + (data.entradas_30d || 0) + (data.entradas_vencidas || 0);
    const totalSaidas = (data.pago_mes || 0) + (data.saidas_30d || 0) + (data.saidas_vencidas || 0);
    const saldoMes = (data.recebido_mes || 0) - (data.pago_mes || 0);
    const totalFlux = Math.max(totalEntradas + totalSaidas, 1);
    const pctEntrada = (totalEntradas / totalFlux) * 100;
    const pctSaida = (totalSaidas / totalFlux) * 100;

    const entradas = [
        { label: 'Recebido no mês', value: data.recebido_mes || 0, color: 'var(--success)', icon: CheckCircle2 },
        { label: 'A receber (30d)', value: data.entradas_30d || 0, color: 'var(--primary)', icon: Calendar },
        { label: 'A receber (60d)', value: data.entradas_60d || 0, color: 'var(--text-muted)', icon: Calendar },
        ...(data.entradas_vencidas > 0 ? [{ label: 'Vencido a receber', value: data.entradas_vencidas, color: 'var(--danger)', icon: AlertTriangle }] : []),
    ];
    const saidas = [
        ...(data.pago_mes > 0 ? [{ label: 'Pago no mês', value: data.pago_mes, color: 'var(--text-muted)', icon: CheckCircle2 }] : []),
        ...(data.saidas_30d > 0 ? [{ label: 'A pagar (30d)', value: data.saidas_30d, color: 'var(--text-secondary)', icon: Calendar }] : []),
        ...(data.saidas_vencidas > 0 ? [{ label: 'Vencido a pagar', value: data.saidas_vencidas, color: 'var(--danger)', icon: AlertTriangle }] : []),
    ];

    return (
        <div className="chart-card-pro animate-fade-up">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Wallet size={15} strokeWidth={2.2} /></span>
                    <h3>Fluxo de caixa</h3>
                </div>
                <span className={`trend-chip ${saldoMes >= 0 ? 'trend-up' : 'trend-down'}`}>
                    {saldoMes >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                    Saldo mês: {R$(saldoMes)}
                </span>
            </div>
            <div className="chart-card-pro-body">
                {/* Segmented bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11, fontWeight: 600 }}>
                    <span style={{ color: 'var(--success)' }}>
                        <ArrowUpRight size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                        Entradas · <span className="font-tabular">{R$(totalEntradas)}</span>
                    </span>
                    <span style={{ color: 'var(--danger)' }}>
                        Saídas · <span className="font-tabular">{R$(totalSaidas)}</span>
                        <ArrowDownRight size={11} style={{ display: 'inline', marginLeft: 3, verticalAlign: 'middle' }} />
                    </span>
                </div>
                <div className="segmented-bar" style={{ marginBottom: 18 }}>
                    <span style={{ width: `${pctEntrada}%`, background: 'linear-gradient(90deg, #7A9F5E, #5C7B43)' }} />
                    <span style={{ width: `${pctSaida}%`, background: 'linear-gradient(90deg, #A0473A, #8A3C30)', animationDelay: '150ms' }} />
                </div>

                {/* Entradas list */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>Entradas</div>
                    <div className="stat-bar-mini">
                        {entradas.map((it, i) => {
                            const Icon = it.icon;
                            return (
                                <div key={i} className="stat-bar-mini-row" style={{ animation: `stagger-in 0.3s ease ${i * 50}ms both` }}>
                                    <span className="stat-bar-mini-label">
                                        <Icon size={12} style={{ color: it.color }} strokeWidth={2.4} /> {it.label}
                                    </span>
                                    <span className="stat-bar-mini-value" style={{ color: it.color }}>{R$(it.value)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Saidas list */}
                {saidas.length > 0 && (
                    <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>Saídas</div>
                        <div className="stat-bar-mini">
                            {saidas.map((it, i) => {
                                const Icon = it.icon;
                                return (
                                    <div key={i} className="stat-bar-mini-row" style={{ animation: `stagger-in 0.3s ease ${i * 50 + 200}ms both` }}>
                                        <span className="stat-bar-mini-label">
                                            <Icon size={12} style={{ color: it.color }} strokeWidth={2.4} /> {it.label}
                                        </span>
                                        <span className="stat-bar-mini-value" style={{ color: it.color }}>{R$(it.value)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// PROJETOS ATIVOS — grid de cards premium
// ══════════════════════════════════════════════════════════════════
function ProjetosAtivos({ data, total, nav }) {
    if (!data || data.length === 0) {
        return (
            <div className="chart-card-pro" style={{ marginBottom: 20 }}>
                <div className="chart-card-pro-head">
                    <div className="chart-card-pro-title">
                        <span className="kpi-pro-icon"><Briefcase size={15} strokeWidth={2.2} /></span>
                        <h3>Projetos ativos</h3>
                    </div>
                </div>
                <div style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <p style={{ fontSize: 13 }}>Nenhum projeto ativo</p>
                    <button onClick={() => nav('proj')} className="btn-ghost" style={{ marginTop: 12 }}>
                        <Plus size={14} /> Ver projetos
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="chart-card-pro animate-fade-up" style={{ marginBottom: 20 }}>
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Briefcase size={15} strokeWidth={2.2} /></span>
                    <h3>Projetos ativos <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>({total})</span></h3>
                </div>
                <button onClick={() => nav('proj')} className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
                    Ver todos <ChevronRight size={14} />
                </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {data.map((p, idx) => {
                    const color = STATUS_PROJ[p.status]?.color || 'var(--muted)';
                    const pct = p.progresso_pct || 0;
                    const diasLabel = p.dias_restantes > 0 ? `${p.dias_restantes}d restantes`
                        : p.dias_restantes === 0 ? 'Vence hoje'
                            : `${Math.abs(p.dias_restantes)}d atrasado`;
                    const diasColor = p.dias_restantes < 0 ? 'var(--danger)' : p.dias_restantes <= 7 ? 'var(--warning)' : 'var(--text-muted)';

                    return (
                        <div
                            key={p.id}
                            onClick={() => nav('proj')}
                            className="project-card-pro"
                            style={{
                                '--status-color': color,
                                animation: `stagger-in 0.3s ease ${idx * 50}ms both`,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div className="font-display" style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>{p.nome}</div>
                                    {p.cliente_nome && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                            <UserIcon size={10} /> {p.cliente_nome}
                                        </div>
                                    )}
                                </div>
                                <Badge label={STATUS_PROJ[p.status]?.label || p.status} color={color} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <div style={{ flex: 1, background: 'var(--bg-muted)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${pct}%`, height: '100%', borderRadius: 99,
                                        background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                                        transformOrigin: 'left',
                                        animation: 'chartSlideRight 0.6s ease 0.1s both',
                                    }} />
                                </div>
                                <span className="font-tabular" style={{ fontSize: 11.5, fontWeight: 700, color, minWidth: 34, textAlign: 'right' }}>{pct}%</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    <span className="font-tabular" style={{ fontSize: 11.5, color: 'var(--success)', fontWeight: 600 }}>
                                        <DollarSign size={11} style={{ display: 'inline', marginRight: 2, verticalAlign: '-1px' }} strokeWidth={2.4} />
                                        {R$(p.recebido)}
                                    </span>
                                    {p.pendente > 0 && (
                                        <span className="font-tabular" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            pendente: {R$(p.pendente)}
                                        </span>
                                    )}
                                </div>
                                <span style={{ fontSize: 10.5, color: diasColor, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Calendar size={10} /> {diasLabel}
                                </span>
                            </div>

                            {(p.ocorrencias_abertas > 0 || p.contas_vencidas > 0) && (
                                <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                                    {p.ocorrencias_abertas > 0 && (
                                        <span style={{ fontSize: 10.5, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                            <AlertTriangle size={11} /> {p.ocorrencias_abertas} ocorrência{p.ocorrencias_abertas > 1 ? 's' : ''}
                                        </span>
                                    )}
                                    {p.contas_vencidas > 0 && (
                                        <span style={{ fontSize: 10.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                            <XCircle size={11} /> {p.contas_vencidas} conta{p.contas_vencidas > 1 ? 's' : ''} vencida{p.contas_vencidas > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// TIMELINE — activity feed com avatar pro
// ══════════════════════════════════════════════════════════════════
const ACAO_CONFIG = {
    criar: { icon: Plus, color: 'var(--primary)', label: 'Criou' },
    aprovar: { icon: Check, color: 'var(--success)', label: 'Aprovou' },
    mover_pipeline: { icon: ArrowRight, color: 'var(--primary)', label: 'Moveu' },
    atualizar_status: { icon: Activity, color: 'var(--primary)', label: 'Status' },
    editar: { icon: Edit3, color: 'var(--primary)', label: 'Editou' },
    pagar: { icon: DollarSign, color: 'var(--success)', label: 'Pagou' },
    receber_pagamento: { icon: DollarSign, color: 'var(--success)', label: 'Recebeu' },
    registrar_despesa: { icon: DollarSign, color: 'var(--text-muted)', label: 'Despesa' },
    criar_conta_pagar: { icon: DollarSign, color: 'var(--text-muted)', label: 'Conta' },
    consumir_material: { icon: Briefcase, color: 'var(--text-muted)', label: 'Consumo' },
    entrada_estoque: { icon: Plus, color: 'var(--primary)', label: 'Entrada' },
    excluir_movimentacao: { icon: Trash2, color: 'var(--text-muted)', label: 'Excluiu' },
};

function tempoRelativo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min}min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h`;
    const dias = Math.floor(hrs / 24);
    if (dias === 1) return 'ontem';
    if (dias < 30) return `${dias}d`;
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function TimelineRecente({ data, nav }) {
    if (!data || data.length === 0) return (
        <div className="chart-card-pro">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Activity size={15} strokeWidth={2.2} /></span>
                    <h3>Atividade recente</h3>
                </div>
            </div>
            <div style={{ padding: '36px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Nenhuma atividade registrada ainda
            </div>
        </div>
    );

    return (
        <div className="chart-card-pro animate-fade-up">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Activity size={15} strokeWidth={2.2} /></span>
                    <h3>Atividade recente</h3>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    <span className="live-dot" /> Live
                </span>
            </div>
            <div style={{ padding: '6px 0' }}>
                {data.map((ev, i) => {
                    const cfg = ACAO_CONFIG[ev.acao] || { icon: Activity, color: 'var(--text-muted)', label: ev.acao };
                    const Icon = cfg.icon;
                    const inicial = (ev.user_nome || '?')[0].toUpperCase();
                    const isAccent = i === 0;

                    const clickTarget = () => {
                        if (ev.referencia_tipo === 'orcamento') nav('orcs');
                        else if (ev.referencia_tipo === 'projeto') nav('proj');
                        else if (ev.referencia_tipo === 'estoque') nav('estoque');
                        else nav('dash');
                    };

                    return (
                        <div key={ev.id || `${ev.acao}-${i}`}
                            onClick={clickTarget}
                            role="button" tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickTarget(); } }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 14,
                                padding: '12px 22px', cursor: 'pointer',
                                borderBottom: i < data.length - 1 ? '1px solid var(--border)' : 'none',
                                animation: `stagger-in 0.25s ease ${i * 30}ms both`,
                                transition: 'background 150ms var(--ease-out)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                        >
                            <div className={`activity-avatar ${isAccent ? 'activity-avatar-accent' : ''}`}>
                                {inicial}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4, color: 'var(--text-primary)' }}>
                                    {ev.descricao}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                                    <span style={{
                                        fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                                        background: `${cfg.color}14`,
                                        color: cfg.color,
                                        border: `1px solid ${cfg.color}22`,
                                        letterSpacing: '0.02em',
                                    }}>{cfg.label}</span>
                                    <span>{ev.user_nome}</span>
                                    <span style={{ opacity: 0.35 }}>·</span>
                                    <span>{tempoRelativo(ev.criado_em)}</span>
                                </div>
                            </div>
                            <Icon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.45 }} strokeWidth={2.2} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// TAB FINANCEIRO
// ══════════════════════════════════════════════════════════════════
function FinanceiroKPI({ data }) {
    if (!data) return null;
    const lucro = data.lucro_mes || 0;
    const margem = data.margem_pct || 0;
    const cards = [
        { label: 'Receita do mês', value: R$(data.receita_mes), icon: ArrowUpRight },
        { label: 'Despesas do mês', value: R$(data.despesa_mes), icon: ArrowDownRight },
        { label: 'Lucro do mês', value: R$(lucro), icon: DollarSign, trend: lucro >= 0 ? Math.abs(margem) : -Math.abs(margem) },
        { label: 'Margem', value: `${margem}%`, icon: Target },
    ];

    return (
        <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
            {cards.map((c, i) => <KpiProCard key={i} {...c} />)}
        </div>
    );
}

// Simple SVG area chart for revenue vs expense (6 months)
function GraficoAreaSix({ data }) {
    if (!data || data.length === 0) return null;
    const W = 100, H = 100;
    const maxVal = Math.max(...data.map(d => Math.max(d.receita, d.despesa)), 1);
    const xStep = W / Math.max(data.length - 1, 1);
    const toY = v => H - (v / maxVal) * H;
    const toX = i => i * xStep;

    const rPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.receita)}`).join(' ');
    const rArea = `${rPath} L ${toX(data.length - 1)} ${H} L 0 ${H} Z`;
    const dPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.despesa)}`).join(' ');

    return (
        <div className="chart-card-pro animate-fade-up">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><BarChart3 size={15} strokeWidth={2.2} /></span>
                    <h3>Receita vs despesas (6 meses)</h3>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
                        <span style={{ width: 10, height: 3, borderRadius: 2, background: 'var(--primary)' }} /> Receita
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
                        <span style={{ width: 10, height: 3, borderRadius: 2, background: 'var(--danger)' }} /> Despesas
                    </span>
                </div>
            </div>
            <div className="chart-card-pro-body" style={{ paddingTop: 16 }}>
                <div className="chart-area-responsive" style={{ position: 'relative' }}>
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                        <defs>
                            <linearGradient id="areaR" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {[0, 25, 50, 75, 100].map(p => (
                            <line key={p} x1="0" y1={p} x2={W} y2={p} stroke="var(--border)" strokeWidth="0.2" strokeDasharray="0.8 0.8" />
                        ))}
                        <path d={rArea} fill="url(#areaR)" vectorEffect="non-scaling-stroke" />
                        <path d={rPath} stroke="var(--primary)" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={dPath} stroke="var(--danger)" strokeWidth="1.6" strokeDasharray="3 2" fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                        {data.map((d, i) => (
                            <g key={i}>
                                <circle cx={toX(i)} cy={toY(d.receita)} r="1.4" fill="var(--primary)" vectorEffect="non-scaling-stroke" />
                                <circle cx={toX(i)} cy={toY(d.despesa)} r="1.2" fill="var(--danger)" vectorEffect="non-scaling-stroke" />
                            </g>
                        ))}
                    </svg>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, marginTop: 10, gap: 4 }}>
                    {data.map((m, i) => (
                        <div key={i} style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize', letterSpacing: '0.02em' }}>{m.label}</div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function GraficoPizzaDespesas({ data }) {
    if (!data || data.length === 0) return (
        <div className="chart-card-pro">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><PieChart size={15} strokeWidth={2.2} /></span>
                    <h3>Despesas por categoria</h3>
                </div>
            </div>
            <div style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sem despesas no período</div>
        </div>
    );

    const total = data.reduce((s, d) => s + d.total, 0);

    return (
        <div className="chart-card-pro animate-fade-up">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><PieChart size={15} strokeWidth={2.2} /></span>
                    <h3>Despesas por categoria</h3>
                </div>
                <span className="font-display font-tabular" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{R$(total)}</span>
            </div>
            <div className="chart-card-pro-body">
                {data.map((d, i) => {
                    const pct = total > 0 ? Math.round((d.total / total) * 100) : 0;
                    const color = CAT_COLOR[d.categoria] || 'var(--muted)';
                    return (
                        <div key={i} style={{ marginBottom: 12, animation: `stagger-in 0.35s ease ${i * 50}ms both` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 3, background: color, boxShadow: `0 0 8px ${color}44` }} />
                                    {CAT_LABEL[d.categoria] || d.categoria}
                                </span>
                                <span className="font-tabular" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{R$(d.total)} · {pct}%</span>
                            </div>
                            <div style={{ background: 'var(--bg-muted)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                                <div style={{
                                    width: `${pct}%`, height: '100%', borderRadius: 99,
                                    background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                                    transformOrigin: 'left',
                                    animation: `chartSlideRight 0.5s ease ${i * 50 + 80}ms both`,
                                }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function TabelaTopProjetos({ data }) {
    if (!data || data.length === 0) return null;
    return (
        <div className="chart-card-pro animate-fade-up table-stagger">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Briefcase size={15} strokeWidth={2.2} /></span>
                    <h3>Top projetos por lucro</h3>
                </div>
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                        <tr>
                            <th className="th-glass" style={{ textAlign: 'left' }}>Projeto</th>
                            <th className="th-glass" style={{ textAlign: 'right' }}>Valor</th>
                            <th className="th-glass" style={{ textAlign: 'right' }}>Despesas</th>
                            <th className="th-glass" style={{ textAlign: 'right' }}>Lucro</th>
                            <th className="th-glass" style={{ textAlign: 'center', width: 72 }}>Margem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((p) => (
                            <tr key={p.id}>
                                <td className="td-glass">
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.nome}</div>
                                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{p.cliente_nome}</div>
                                </td>
                                <td className="td-glass font-tabular" style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 600 }}>{R$(p.valor_venda)}</td>
                                <td className="td-glass font-tabular" style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--danger)' }}>{R$(p.despesas)}</td>
                                <td className="td-glass font-tabular" style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: p.lucro >= 0 ? 'var(--success)' : 'var(--danger)' }}>{R$(p.lucro)}</td>
                                <td className="td-glass" style={{ textAlign: 'center' }}>
                                    <Badge label={`${p.margem}%`} color={p.margem >= 20 ? 'var(--success)' : p.margem >= 0 ? 'var(--warning)' : 'var(--danger)'} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function FluxoProjetado({ data }) {
    if (!data || data.length === 0) return null;
    return (
        <div className="chart-card-pro animate-fade-up">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Wallet size={15} strokeWidth={2.2} /></span>
                    <h3>Fluxo projetado (90 dias)</h3>
                </div>
            </div>
            <div className="chart-card-pro-body">
                {data.map((m, i) => {
                    const positive = m.saldo >= 0;
                    const totalFlux = Math.max((m.entradas || 0) + (m.saidas || 0), 1);
                    const pctIn = ((m.entradas || 0) / totalFlux) * 100;
                    const pctOut = ((m.saidas || 0) / totalFlux) * 100;
                    return (
                        <div key={i} style={{
                            marginBottom: i < data.length - 1 ? 14 : 0,
                            padding: 14, borderRadius: 12,
                            background: positive ? 'linear-gradient(135deg, rgba(92,123,67,0.06), var(--bg-subtle) 60%)' : 'linear-gradient(135deg, rgba(160,71,58,0.06), var(--bg-subtle) 60%)',
                            border: `1px solid ${positive ? 'rgba(92,123,67,0.18)' : 'rgba(160,71,58,0.18)'}`,
                            animation: `stagger-in 0.35s ease ${i * 80}ms both`,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <span className="font-display" style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>{m.label}</span>
                                <span className={`trend-chip ${positive ? 'trend-up' : 'trend-down'}`}>
                                    Saldo: {positive ? '+' : ''}{R$(m.saldo)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                                <span className="font-tabular" style={{ color: 'var(--success)', fontWeight: 600 }}>Entradas: {R$(m.entradas)}</span>
                                <span className="font-tabular" style={{ color: 'var(--danger)', fontWeight: 600 }}>Saídas: {R$(m.saidas)}</span>
                            </div>
                            <div className="segmented-bar">
                                <span style={{ width: `${pctIn}%`, background: 'linear-gradient(90deg, #7A9F5E, #5C7B43)', animationDelay: `${i * 80 + 100}ms` }} />
                                <span style={{ width: `${pctOut}%`, background: 'linear-gradient(90deg, #A0473A, #8A3C30)', animationDelay: `${i * 80 + 150}ms` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ContasPagarProximas({ data, vencidas }) {
    if (!data || data.length === 0) return (
        <div className="chart-card-pro">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Receipt size={15} strokeWidth={2.2} /></span>
                    <h3>Contas a pagar</h3>
                </div>
            </div>
            <div style={{ padding: '36px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma conta a pagar pendente</div>
        </div>
    );

    return (
        <div className="chart-card-pro animate-fade-up">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><Receipt size={15} strokeWidth={2.2} /></span>
                    <h3>Contas a pagar</h3>
                </div>
                {vencidas && vencidas.qtd > 0 && (
                    <Badge label={`${vencidas.qtd} vencida${vencidas.qtd > 1 ? 's' : ''} (${R$(vencidas.total)})`} color="var(--danger)" pulse />
                )}
            </div>
            {data.map((c, i) => {
                const isVencida = c.dias_ate < 0;
                const isProxima = c.dias_ate >= 0 && c.dias_ate <= 7;
                const color = isVencida ? 'var(--danger)' : isProxima ? 'var(--warning)' : 'var(--text-muted)';
                return (
                    <div key={c.id} style={{
                        padding: '12px 22px', borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        animation: `stagger-in 0.25s ease ${i * 40}ms both`,
                        transition: 'background 150ms var(--ease-out)',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{c.descricao}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                {c.fornecedor && `${c.fornecedor} · `}{CAT_LABEL[c.categoria] || c.categoria}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div className="font-display font-tabular" style={{ fontSize: 13.5, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{R$(c.valor)}</div>
                            <div style={{ fontSize: 10.5, color, marginTop: 2, fontWeight: 500 }}>
                                {isVencida ? `${Math.abs(c.dias_ate)}d atraso` : c.dias_ate === 0 ? 'vence hoje' : `em ${c.dias_ate}d`}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function TopClientes({ data }) {
    if (!data || data.length === 0) return null;
    return (
        <div className="chart-card-pro animate-fade-up">
            <div className="chart-card-pro-head">
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon"><UserIcon size={15} strokeWidth={2.2} /></span>
                    <h3>Top clientes por faturamento</h3>
                </div>
            </div>
            {data.map((c, i) => {
                const isFirst = i === 0;
                return (
                    <div key={i} style={{
                        padding: '12px 22px', borderBottom: i < data.length - 1 ? '1px solid var(--border)' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        animation: `stagger-in 0.25s ease ${i * 40}ms both`,
                        transition: 'background 150ms var(--ease-out)',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span className={`activity-avatar ${isFirst ? 'activity-avatar-accent' : ''}`} style={{ fontSize: 12 }}>
                                {isFirst ? <Sparkles size={15} strokeWidth={2.4} /> : i + 1}
                            </span>
                            <div>
                                <div className="font-display" style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{c.cliente_nome}</div>
                                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{c.total_projetos} projeto{c.total_projetos > 1 ? 's' : ''}</div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div className="font-display font-tabular" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{R$(c.valor_total)}</div>
                            <div className="font-tabular" style={{ fontSize: 10.5, color: 'var(--success)', marginTop: 2, fontWeight: 500 }}>recebido: {R$(c.recebido)}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// ORIGEM DO TRÁFEGO — funil visita → lead → venda por canal
// ══════════════════════════════════════════════════════════════════
function OrigemTrafegoWidget() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dias, setDias] = useState(30);

    useEffect(() => {
        setLoading(true);
        api.get(`/landing/origens?dias=${dias}`).then(d => {
            setData(d);
        }).catch(() => {
            setData(null);
        }).finally(() => setLoading(false));
    }, [dias]);

    if (loading || !data) return null;
    if ((data.totais?.visitas || 0) === 0) return null;

    const { totais, por_origem } = data;
    const maxVisitas = Math.max(...por_origem.map(o => o.visitas), 1);

    const ORIGEM_COR = {
        direto: '#94A3B8', google: '#4285F4', facebook: '#1877F2', instagram: '#E1306C',
        fb: '#1877F2', ig: '#E1306C', whatsapp: '#25D366', email: '#F59E0B',
    };
    const corDe = (o) => ORIGEM_COR[String(o).toLowerCase()] || '#C9A96E';

    return (
        <div className="chart-card-pro animate-fade-up" style={{ marginBottom: 20 }}>
            <div className="chart-card-pro-head" style={{
                background: 'linear-gradient(180deg, rgba(201, 169, 110, 0.06), transparent)',
            }}>
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon" style={{
                        background: 'rgba(201, 169, 110, 0.10)',
                        borderColor: 'rgba(201, 169, 110, 0.25)',
                        color: '#C9A96E',
                    }}>
                        <BarChart3 size={15} strokeWidth={2.2} />
                    </span>
                    <h3>Origem do tráfego</h3>
                </div>
                <div style={{ display: 'flex', gap: 4, padding: 2, background: 'var(--bg-muted)', borderRadius: 8 }}>
                    {[7, 30, 90].map(d => (
                        <button
                            key={d}
                            onClick={() => setDias(d)}
                            style={{
                                padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
                                background: dias === d ? 'var(--bg-card)' : 'transparent',
                                color: dias === d ? 'var(--text-primary)' : 'var(--text-muted)',
                                border: dias === d ? '1px solid var(--border)' : '1px solid transparent',
                                cursor: 'pointer',
                            }}
                        >{d}d</button>
                    ))}
                </div>
            </div>

            {/* Totais */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '14px 18px', background: 'var(--bg-card)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Visitas</div>
                    <div className="font-display font-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 2 }}>{N(totais.visitas)}</div>
                </div>
                <div style={{ padding: '14px 18px', background: 'var(--bg-card)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Leads</div>
                    <div className="font-display font-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 2 }}>
                        {N(totais.leads_unicos)} <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>{totais.taxa_lead}%</span>
                    </div>
                </div>
                <div style={{ padding: '14px 18px', background: 'var(--bg-card)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fechados</div>
                    <div className="font-display font-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 2 }}>
                        {N(totais.fechados)} <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>{totais.taxa_fechamento}%</span>
                    </div>
                </div>
                <div style={{ padding: '14px 18px', background: 'var(--bg-card)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Faturamento</div>
                    <div className="font-display font-tabular" style={{ fontSize: 18, fontWeight: 700, color: '#C9A96E', letterSpacing: '-0.02em', marginTop: 2 }}>{R$(totais.faturamento)}</div>
                </div>
            </div>

            {/* Por origem — barras */}
            <div style={{ padding: '6px 22px 18px' }}>
                <div style={{ padding: '10px 0', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Por canal
                </div>
                {por_origem.map((o, i) => {
                    const cor = corDe(o.origem);
                    const pct = (o.visitas / maxVisitas) * 100;
                    return (
                        <div key={o.origem} style={{
                            padding: '10px 0', borderBottom: i < por_origem.length - 1 ? '1px solid var(--border)' : 'none',
                            animation: `stagger-in 0.25s ease ${i * 40}ms both`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 3, background: cor, flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{o.origem}</span>
                                </div>
                                <div className="font-tabular" style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    <span>{N(o.visitas)} visitas</span>
                                    <span>{N(o.leads_unicos)} leads</span>
                                    <span>{N(o.fechados)} fechados</span>
                                    <span style={{ color: '#C9A96E', fontWeight: 700 }}>{R$(o.faturamento)}</span>
                                </div>
                            </div>
                            <div style={{ position: 'relative', height: 6, background: 'var(--bg-muted)', borderRadius: 99, overflow: 'hidden' }}>
                                <div style={{
                                    position: 'absolute', inset: 0, width: `${pct}%`, background: cor,
                                    borderRadius: 99, transition: 'width 400ms var(--ease-out)',
                                }} />
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 14 }}>
                                <span>visita→lead: <b style={{ color: 'var(--text-primary)' }}>{o.taxa_lead}%</b></span>
                                <span>lead→venda: <b style={{ color: 'var(--text-primary)' }}>{o.taxa_fechamento}%</b></span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// FOLLOW-UPS WIDGET — tarefas de contato pendentes
// ══════════════════════════════════════════════════════════════════
function FollowUpsWidget({ nav, notify }) {
    const [rows, setRows] = useState([]);
    const [cont, setCont] = useState({ atrasados: 0, hoje: 0, total_pendentes: 0 });
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(() => {
        Promise.all([
            api.get('/follow-ups/hoje').catch(() => []),
            api.get('/follow-ups/contagem').catch(() => ({ atrasados: 0, hoje: 0, total_pendentes: 0 })),
        ]).then(([list, c]) => {
            setRows(Array.isArray(list) ? list : []);
            setCont(c || { atrasados: 0, hoje: 0, total_pendentes: 0 });
        }).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
        const iv = setInterval(load, 60000);
        return () => clearInterval(iv);
    }, [load]);

    const marcarFeito = async (id) => {
        setBusyId(id);
        try {
            await api.put(`/follow-ups/${id}/feito`, { motivo_conclusao: 'concluido' });
            notify && notify('Follow-up concluído');
            load();
        } catch (e) {
            notify && notify(e.error || 'Erro ao concluir');
        } finally { setBusyId(null); }
    };

    const adiar = async (id, horas) => {
        setBusyId(id);
        try {
            await api.put(`/follow-ups/${id}/reagendar`, { horas_adiar: horas });
            notify && notify('Reagendado');
            load();
        } catch (e) {
            notify && notify(e.error || 'Erro ao reagendar');
        } finally { setBusyId(null); }
    };

    if (loading) return null;
    if (cont.total_pendentes === 0 && rows.length === 0) return null;

    const fmtDue = (due) => {
        if (!due) return '';
        const d = new Date(due.includes('T') ? due : due.replace(' ', 'T'));
        const now = new Date();
        const diffMin = Math.round((d - now) / 60000);
        const absMin = Math.abs(diffMin);
        if (diffMin < -60 * 24) return `${Math.round(absMin / (60 * 24))}d atrás`;
        if (diffMin < -60) return `${Math.round(absMin / 60)}h atrás`;
        if (diffMin < 0) return `${absMin}min atrás`;
        if (diffMin < 60) return `em ${diffMin}min`;
        if (diffMin < 60 * 24) return `em ${Math.round(diffMin / 60)}h`;
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    };

    const tipoIcon = (tipo) => {
        if (tipo === 'ligacao' || tipo === 'telefone') return <Phone size={12} strokeWidth={2.4} />;
        if (tipo === 'visita') return <MapPin size={12} strokeWidth={2.4} />;
        return <MessageCircle size={12} strokeWidth={2.4} />;
    };

    return (
        <div className="chart-card-pro animate-fade-up" style={{ marginBottom: 20 }}>
            <div className="chart-card-pro-head" style={{
                background: 'linear-gradient(180deg, rgba(201, 169, 110, 0.06), transparent)',
            }}>
                <div className="chart-card-pro-title">
                    <span className="kpi-pro-icon" style={{
                        background: 'rgba(201, 169, 110, 0.10)',
                        borderColor: 'rgba(201, 169, 110, 0.25)',
                        color: '#C9A96E',
                    }}>
                        <Bell size={15} strokeWidth={2.2} />
                    </span>
                    <h3>Follow-ups</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {cont.atrasados > 0 && (
                        <span style={{
                            fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                            background: 'rgba(160,71,58,0.12)', color: 'var(--danger)',
                            border: '1px solid rgba(160,71,58,0.28)', fontVariantNumeric: 'tabular-nums',
                        }}>{cont.atrasados} atrasado{cont.atrasados > 1 ? 's' : ''}</span>
                    )}
                    {cont.hoje > 0 && (
                        <span style={{
                            fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                            background: 'rgba(176,120,32,0.12)', color: 'var(--warning)',
                            border: '1px solid rgba(176,120,32,0.28)', fontVariantNumeric: 'tabular-nums',
                        }}>{cont.hoje} hoje</span>
                    )}
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>
                        {cont.total_pendentes} pendente{cont.total_pendentes > 1 ? 's' : ''} no total
                    </span>
                </div>
            </div>

            {rows.length === 0 ? (
                <div style={{ padding: '22px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                    Nenhum follow-up para hoje · <span style={{ color: 'var(--success)', fontWeight: 600 }}>em dia!</span>
                </div>
            ) : (
                <>
                    {rows.slice(0, 5).map((f, i) => {
                        const atrasado = !!f.atrasado;
                        const urg = atrasado
                            ? { color: 'var(--danger)', bg: 'rgba(160,71,58,0.12)', border: 'rgba(160,71,58,0.28)' }
                            : { color: 'var(--warning)', bg: 'rgba(176,120,32,0.12)', border: 'rgba(176,120,32,0.28)' };
                        return (
                            <div
                                key={f.id}
                                style={{
                                    padding: '12px 22px', borderBottom: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                    animation: `stagger-in 0.25s ease ${i * 40}ms both`,
                                    transition: 'background 150ms var(--ease-out)',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                            >
                                <div
                                    onClick={() => nav('leads')}
                                    role="button" tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav('leads'); } }}
                                    style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 22, height: 22, borderRadius: 6,
                                            background: urg.bg, color: urg.color, border: `1px solid ${urg.border}`,
                                            flexShrink: 0,
                                        }}>{tipoIcon(f.tipo)}</span>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {f.lead_nome || 'Lead'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, marginLeft: 30, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {f.coluna_nome && <span>{f.coluna_nome} · </span>}
                                        <span style={{ color: urg.color, fontWeight: 600 }}>{fmtDue(f.due_at)}</span>
                                        {f.notas && <span> · {f.notas}</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); marcarFeito(f.id); }}
                                        disabled={busyId === f.id}
                                        title="Marcar como feito"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '6px 10px', fontSize: 11, fontWeight: 600,
                                            borderRadius: 8, border: '1px solid rgba(131,165,98,0.3)',
                                            background: 'rgba(131,165,98,0.10)', color: 'var(--success)',
                                            cursor: busyId === f.id ? 'not-allowed' : 'pointer',
                                            opacity: busyId === f.id ? 0.5 : 1,
                                        }}
                                    >
                                        <Check size={12} strokeWidth={2.6} /> Feito
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); adiar(f.id, 72); }}
                                        disabled={busyId === f.id}
                                        title="Adiar 3 dias"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            padding: '6px 10px', fontSize: 11, fontWeight: 600,
                                            borderRadius: 8, border: '1px solid var(--border)',
                                            background: 'var(--bg-muted)', color: 'var(--text-muted)',
                                            cursor: busyId === f.id ? 'not-allowed' : 'pointer',
                                            opacity: busyId === f.id ? 0.5 : 1,
                                        }}
                                    >
                                        <Clock size={12} strokeWidth={2.4} /> +3d
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {rows.length > 5 && (
                        <div
                            onClick={() => nav('leads')}
                            role="button" tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav('leads'); } }}
                            style={{
                                padding: '10px 22px', textAlign: 'center', cursor: 'pointer',
                                fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                                transition: 'background 150ms var(--ease-out)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                            Ver todos os {rows.length} follow-ups <ArrowRight size={11} strokeWidth={2.4} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════
// DASH — Componente principal
// ══════════════════════════════════════════════════════════════════
export default function Dash({ nav, notify, user }) {
    const [data, setData] = useState(null);
    const [finData, setFinData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(false);
    const isVendedor = user?.role === 'vendedor';
    const [tab, setTab] = useState('geral');
    const [finLoading, setFinLoading] = useState(false);
    const [atividades, setAtividades] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback((manual) => {
        if (manual) setRefreshing(true);
        api.get('/dashboard').then(d => {
            setData(d);
            setErr(false);
        }).catch(() => {
            setErr(true);
        }).finally(() => { setLoading(false); setRefreshing(false); });
        api.get('/atividades?limit=12').then(setAtividades).catch(err => console.error('Dash atividades:', err));
    }, []);

    const loadFin = useCallback(() => {
        setFinLoading(true);
        api.get('/dashboard/financeiro').then(d => {
            setFinData(d);
        }).catch(e => notify(e.error || 'Erro ao carregar financeiro')).finally(() => setFinLoading(false));
    }, [notify]);

    useEffect(() => {
        load();
        const interval = setInterval(load, 60000);
        return () => clearInterval(interval);
    }, [load]);

    useEffect(() => {
        if (tab === 'financeiro' && !finData) loadFin();
    }, [tab, finData, loadFin]);

    const todayRaw = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);

    if (loading) {
        return (
            <div className={Z.pg}>
                <div className="hero-card" style={{ marginBottom: 24, minHeight: 180 }}>
                    <Skeleton width={220} height={18} />
                    <div style={{ height: 12 }} />
                    <Skeleton width={320} height={38} />
                </div>
                <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
                    <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    <div className="skeleton skeleton-card" style={{ height: 320 }} />
                    <div className="skeleton skeleton-card" style={{ height: 320 }} />
                </div>
            </div>
        );
    }

    if (err || !data) {
        return (
            <div className={Z.pg}>
                <div className="mb-6">
                    <h1 className={Z.h1}>{greet()}, bem-vindo!</h1>
                    <p className={Z.sub}>{today}</p>
                </div>
                <div className="chart-card-pro animate-fade-up" style={{ textAlign: 'center', padding: 40 }}>
                    <div className="empty-state-icon">
                        <AlertTriangle size={28} style={{ color: 'var(--warning)' }} />
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>Erro ao carregar dashboard</p>
                    <button onClick={load} className={`${Z.btn} text-xs`}>Tentar novamente</button>
                </div>
            </div>
        );
    }

    return (
        <div className={Z.pg}>
            <HeroCard
                user={user}
                headline={!isVendedor ? data.headline : null}
                today={today}
                refreshing={refreshing}
                onRefresh={() => load(true)}
            />

            <KpiStrip data={data} isVendedor={isVendedor} nav={nav} />

            <QuickActions nav={nav} isVendedor={isVendedor} />

            <TabBar
                tabs={[
                    { id: 'geral', label: 'Visão geral', icon: Activity },
                    ...(!isVendedor ? [{ id: 'financeiro', label: 'Financeiro', icon: DollarSign }] : []),
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === 'geral' && (
                <>
                    {/* Fila de atenção — topo por urgência */}
                    {!isVendedor ? (
                        <FilaAtencao data={data.atencao} nav={nav} />
                    ) : data.atencao?.total_parados > 0 && (
                        <FilaAtencao data={{ ...data.atencao, total_vencidas: 0, contas_vencidas: [], valor_vencido: 0 }} nav={nav} />
                    )}

                    <FollowUpsWidget nav={nav} notify={notify} />

                    {!isVendedor && <OrigemTrafegoWidget />}

                    {!isVendedor && data.producao_resumo && (
                        <ProducaoResume data={data.producao_resumo} nav={nav} />
                    )}

                    <div className="dash-split" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>
                        <PipelineVisual data={data.pipeline} total={data.pipeline_total} nav={nav} />
                        {!isVendedor && <FluxoCaixa data={data.fluxo_caixa} />}
                    </div>

                    <ProjetosAtivos data={data.projetos_ativos} total={data.total_projetos_ativos} nav={nav} />

                    <TimelineRecente data={atividades} nav={nav} />
                </>
            )}

            {tab === 'financeiro' && (
                finLoading && !finData ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                        <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                    </div>
                ) : finData ? (
                    <>
                        <FinanceiroKPI data={finData.resumo} />

                        <div className="dash-split-even" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>
                            <GraficoAreaSix data={finData.ultimos_6_meses} />
                            <GraficoPizzaDespesas data={finData.despesas_por_categoria} />
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <TabelaTopProjetos data={finData.top_projetos} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
                            <FluxoProjetado data={finData.fluxo_projetado} />
                            <ContasPagarProximas data={finData.contas_pagar_proximas} vencidas={finData.pagar_vencidas} />
                        </div>

                        <TopClientes data={finData.top_clientes} />
                    </>
                ) : (
                    <div className="chart-card-pro animate-fade-up" style={{ textAlign: 'center', padding: 40 }}>
                        <div className="empty-state-icon">
                            <AlertTriangle size={28} style={{ color: 'var(--warning)' }} />
                        </div>
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>Erro ao carregar dados financeiros</p>
                        <button onClick={loadFin} className={`${Z.btn} text-xs`}>Tentar novamente</button>
                    </div>
                )
            )}
        </div>
    );
}
