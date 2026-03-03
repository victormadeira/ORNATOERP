import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { Z, Ic, Spinner, Badge, KpiCard, SectionHeader } from '../ui';
import { STATUS_PROJ, CAT_COLOR, CAT_LABEL, colorBg, colorBorder } from '../theme';
import { R$, N } from '../engine';
import {
    TrendingUp, TrendingDown, AlertTriangle, Clock, DollarSign,
    Briefcase, FileText, CreditCard, User as UserIcon, ArrowRight,
    Calendar, Eye, ChevronRight, Activity, BarChart3, Wallet,
    CheckCircle2, XCircle, PauseCircle, Zap, PieChart, ArrowUpRight,
    ArrowDownRight, Receipt, Plus, Trash2, Edit3, Check, X
} from 'lucide-react';

const greet = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

// ── EmptyState ───────────────────────────────────────────
function EmptyState({ icon: Icon, msg, cta, onClick }) {
    return (
        <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
                <Icon size={32} style={{ opacity: 0.35 }} />
            </div>
            <p style={{ fontSize: 13, marginBottom: cta ? 12 : 0 }}>{msg}</p>
            {cta && (
                <button onClick={onClick} className={`${Z.btn} text-xs`}>
                    <Ic.Plus /> {cta}
                </button>
            )}
        </div>
    );
}

// ── HeadlineMes ──────────────────────────────────────────
function HeadlineMes({ data }) {
    if (!data) return null;
    const up = data.pct_variacao >= 0;
    return (
        <div className="glass-card" style={{
            padding: '22px 28px', marginBottom: 16,
            background: 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
        }}>
            <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Faturamento em {data.mes_atual}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
                    {R$(data.faturamento_mes)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    {data.qtd_fechados} negocio{data.qtd_fechados !== 1 ? 's' : ''} fechado{data.qtd_fechados !== 1 ? 's' : ''}
                </div>
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 14px', borderRadius: 20,
                    background: up ? colorBg('#22c55e') : colorBg('#ef4444'),
                    color: up ? '#16a34a' : '#ef4444',
                    fontWeight: 700, fontSize: 14,
                    border: `1px solid ${up ? colorBorder('#22c55e') : colorBorder('#ef4444')}`,
                }}>
                    {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    {up && '+'}{data.pct_variacao}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    vs {data.mes_anterior} ({R$(data.faturamento_anterior)})
                </div>
            </div>
        </div>
    );
}

// ── FilaAtencao ──────────────────────────────────────────
function FilaAtencao({ data, nav }) {
    if (!data || (data.total_parados === 0 && data.total_vencidas === 0)) return null;

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{
                padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: '1px solid var(--border)', background: '#f59e0b08',
            }}>
                <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b' }}>Fila de Atencao</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {data.total_parados > 0 && `${data.total_parados} orc. parado${data.total_parados > 1 ? 's' : ''}`}
                    {data.total_parados > 0 && data.total_vencidas > 0 && ' · '}
                    {data.total_vencidas > 0 && `${data.total_vencidas} conta${data.total_vencidas > 1 ? 's' : ''} vencida${data.total_vencidas > 1 ? 's' : ''} (${R$(data.valor_vencido)})`}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: data.total_parados > 0 && data.total_vencidas > 0 ? '1fr 1fr' : '1fr', minHeight: 0 }}>
                {/* Orcamentos parados */}
                {data.total_parados > 0 && (
                    <div style={{ borderRight: data.total_vencidas > 0 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                            <Clock size={10} style={{ display: 'inline', marginRight: 4 }} /> Orcamentos Parados ({'>'}7 dias)
                        </div>
                        {data.orcamentos_parados.map(o => (
                            <div key={o.id} onClick={() => nav('novo', o)}
                                style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                                className="hover:bg-[var(--bg-hover)] transition-colors">
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.cliente_nome}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.ambiente || '—'} · {R$(o.valor_venda)}</div>
                                </div>
                                <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                    background: o.dias_parado > 30 ? '#ef444418' : '#f59e0b18',
                                    color: o.dias_parado > 30 ? '#ef4444' : '#f59e0b',
                                    whiteSpace: 'nowrap', flexShrink: 0,
                                }}>{o.dias_parado}d</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Contas vencidas */}
                {data.total_vencidas > 0 && (
                    <div>
                        <div style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                            <XCircle size={10} style={{ display: 'inline', marginRight: 4, color: '#ef4444' }} /> Contas Vencidas
                        </div>
                        {data.contas_vencidas.map(c => (
                            <div key={c.id} onClick={() => nav('financeiro')}
                                style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                                className="hover:bg-[var(--bg-hover)] transition-colors">
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descricao}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.projeto_nome}</div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{R$(c.valor)}</div>
                                    <div style={{ fontSize: 10, color: '#ef4444' }}>{c.dias_atraso}d atraso</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── PipelineVisual (Funil de Vendas) ─────────────────────
function PipelineVisual({ data, total, nav }) {
    if (!data || data.length === 0) return null;
    const totalQtd = data.reduce((s, d) => s + d.qtd, 0);
    const firstQtd = data[0]?.qtd || 1;

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={PieChart} title="Funil de Vendas">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalQtd} propostas</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{R$(total)}</span>
                </div>
            </SectionHeader>
            <div style={{ padding: '16px 20px' }}>
                {data.map((s, i) => {
                    const funnelPct = firstQtd > 0 ? Math.max((s.qtd / firstQtd) * 100, s.qtd > 0 ? 15 : 5) : 5;
                    const convRate = i > 0 && data[i - 1].qtd > 0 ? ((s.qtd / data[i - 1].qtd) * 100).toFixed(0) : null;
                    return (
                        <div key={s.id} style={{ animation: `chartFadeIn 0.4s ease ${i * 80}ms both` }}>
                            {i > 0 && convRate !== null && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 20, margin: '2px 0' }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: Number(convRate) >= 50 ? '#22c55e' : Number(convRate) >= 25 ? '#f59e0b' : '#ef4444', display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <ArrowDownRight size={10} /> {convRate}%
                                    </div>
                                </div>
                            )}
                            <div onClick={() => nav('kb')}
                                style={{
                                    display: 'flex', alignItems: 'center', cursor: 'pointer',
                                    padding: '10px 14px', borderRadius: 10, marginBottom: 2, position: 'relative', overflow: 'hidden',
                                    background: `linear-gradient(90deg, ${s.cor}15, transparent ${funnelPct}%)`,
                                    transition: 'background 0.2s',
                                }}
                                className="hover:opacity-80 transition-opacity">
                                <div style={{
                                    position: 'absolute', left: 0, top: 0, bottom: 0,
                                    width: `${funnelPct}%`, borderRadius: 10,
                                    background: `linear-gradient(90deg, ${s.cor}25, ${s.cor}08)`,
                                    animation: `chartSlideRight 0.6s ease ${i * 80 + 100}ms both`,
                                    transformOrigin: 'left',
                                }} />
                                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                    background: `${s.cor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    position: 'relative', zIndex: 1,
                                }}>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: s.cor }}>{s.qtd}</span>
                                </div>
                                <div style={{ marginLeft: 12, flex: 1, position: 'relative', zIndex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{s.nome}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{R$(s.valor)}</div>
                                </div>
                                <div style={{ position: 'relative', zIndex: 1, textAlign: 'right' }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        {total > 0 ? ((s.valor / total) * 100).toFixed(0) : 0}%
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>do total</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Resumo do funil */}
            {data.length >= 2 && (
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {(() => {
                        const leads = data[0]?.qtd || 0;
                        const aprovados = data.find(d => d.id === 'ok')?.qtd || 0;
                        const txConv = leads > 0 ? ((aprovados / leads) * 100).toFixed(1) : '0';
                        const ticketMedio = totalQtd > 0 ? total / totalQtd : 0;
                        return (<>
                            <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>{txConv}%</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Taxa de Conversão</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{R$(ticketMedio)}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ticket Médio</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: '#8b5cf6' }}>{totalQtd}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total no Pipeline</div>
                            </div>
                        </>);
                    })()}
                </div>
            )}
        </div>
    );
}

// ── FluxoCaixa ───────────────────────────────────────────
function FluxoCaixa({ data }) {
    if (!data) return null;
    const items = [
        { label: 'Recebido este mes', value: data.recebido_mes, color: '#22c55e', icon: CheckCircle2 },
        { label: 'A receber (30d)', value: data.entradas_30d, color: '#1379F0', icon: Calendar },
        { label: 'A receber (60d)', value: data.entradas_60d, color: '#7e7ec8', icon: Calendar },
        { label: 'Vencido (a receber)', value: data.entradas_vencidas, color: '#ef4444', icon: AlertTriangle },
    ];
    const maxVal = Math.max(...items.map(i => i.value), 1);

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={Wallet} title="Fluxo de Caixa" />
            <div style={{ padding: '14px 20px' }}>
                {items.map((it, i) => {
                    const Icon = it.icon;
                    const pct = Math.max((it.value / maxVal) * 100, it.value > 0 ? 4 : 0);
                    return (
                        <div key={i} style={{ marginBottom: i < items.length - 1 ? 14 : 0, animation: `chartFadeIn 0.35s ease ${i * 70}ms both` }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Icon size={12} style={{ color: it.color }} /> {it.label}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: it.color }}>{R$(it.value)}</span>
                            </div>
                            <div style={{ background: 'var(--bg-muted)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                                <div style={{
                                    width: `${pct}%`, height: '100%', borderRadius: 99,
                                    background: `linear-gradient(90deg, ${it.color}, ${it.color}dd)`,
                                    boxShadow: `0 1px 6px ${it.color}30`,
                                    transformOrigin: 'left',
                                    animation: `chartSlideRight 0.5s ease ${i * 70 + 100}ms both`,
                                }} />
                            </div>
                        </div>
                    );
                })}

                {/* Saídas */}
                {(data.saidas_30d > 0 || data.saidas_vencidas > 0 || data.pago_mes > 0) && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>Saídas (Contas a Pagar)</div>
                        {[
                            { label: 'Pago este mês', value: data.pago_mes, color: '#64748b', icon: CheckCircle2 },
                            { label: 'A pagar (30d)', value: data.saidas_30d, color: '#f97316', icon: Calendar },
                            { label: 'Vencido (a pagar)', value: data.saidas_vencidas, color: '#dc2626', icon: AlertTriangle },
                        ].filter(it => it.value > 0).map((it, i) => {
                            const Icon = it.icon;
                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, animation: `chartFadeIn 0.3s ease ${i * 60 + 300}ms both` }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <Icon size={12} style={{ color: it.color }} /> {it.label}
                                    </span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: it.color }}>{R$(it.value)}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── ProjetosAtivos ───────────────────────────────────────
function ProjetosAtivos({ data, total, nav }) {
    if (!data || data.length === 0) {
        return (
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={Briefcase} title="Projetos Ativos" />
                <EmptyState icon={Briefcase} msg="Nenhum projeto ativo" cta="Ver projetos" onClick={() => nav('proj')} />
            </div>
        );
    }

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <SectionHeader icon={Briefcase} title={<>Projetos Ativos <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>({total})</span></>}>
                <button onClick={() => nav('proj')} className={`${Z.btn2} text-xs py-1.5 px-3`}>Ver todos</button>
            </SectionHeader>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 0 }}>
                {data.map(p => {
                    const color = (STATUS_PROJ[p.status]?.color || '#94a3b8');
                    const pct = p.progresso_pct || 0;
                    const diasLabel = p.dias_restantes > 0
                        ? `${p.dias_restantes}d restantes`
                        : p.dias_restantes === 0 ? 'Vence hoje'
                        : `${Math.abs(p.dias_restantes)}d atrasado`;
                    const diasColor = p.dias_restantes < 0 ? '#ef4444' : p.dias_restantes <= 7 ? '#f59e0b' : 'var(--text-muted)';

                    return (
                        <div key={p.id} onClick={() => nav('proj')}
                            style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)', cursor: 'pointer' }}
                            className="hover:bg-[var(--bg-hover)] transition-colors">

                            {/* Header: nome + status badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                                    {p.cliente_nome && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                            <UserIcon size={10} /> {p.cliente_nome}
                                        </div>
                                    )}
                                </div>
                                <Badge label={STATUS_PROJ[p.status]?.label || p.status} color={color} />
                            </div>

                            {/* Progress bar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <div style={{ flex: 1, background: 'var(--bg-muted)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${pct}%`, height: '100%', borderRadius: 99,
                                        background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                                        boxShadow: `0 1px 4px ${color}25`,
                                        transformOrigin: 'left',
                                        animation: 'chartSlideRight 0.6s ease 0.1s both',
                                    }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                            </div>

                            {/* Mini financial + deadline */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
                                        <DollarSign size={10} style={{ display: 'inline', marginRight: 2 }} />
                                        {R$(p.recebido)}
                                    </span>
                                    {p.pendente > 0 && (
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            pendente: {R$(p.pendente)}
                                        </span>
                                    )}
                                </div>
                                <span style={{ fontSize: 10, color: diasColor, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Calendar size={10} /> {diasLabel}
                                </span>
                            </div>

                            {/* Alerts */}
                            {(p.ocorrencias_abertas > 0 || p.contas_vencidas > 0) && (
                                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                    {p.ocorrencias_abertas > 0 && (
                                        <span style={{ fontSize: 10, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <AlertTriangle size={10} /> {p.ocorrencias_abertas} ocorrencia{p.ocorrencias_abertas > 1 ? 's' : ''}
                                        </span>
                                    )}
                                    {p.contas_vencidas > 0 && (
                                        <span style={{ fontSize: 10, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <XCircle size={10} /> {p.contas_vencidas} conta{p.contas_vencidas > 1 ? 's' : ''} vencida{p.contas_vencidas > 1 ? 's' : ''}
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

// ── TimelineRecente (Log Real de Atividades) ────────────
const ACAO_CONFIG = {
    criar:               { icon: Plus,      color: '#22c55e', label: 'Criou' },
    aprovar:             { icon: Check,     color: '#22c55e', label: 'Aprovou' },
    mover_pipeline:      { icon: ArrowRight,color: '#3b82f6', label: 'Moveu' },
    atualizar_status:    { icon: Activity,  color: '#8b5cf6', label: 'Status' },
    editar:              { icon: Edit3,     color: '#3b82f6', label: 'Editou' },
    pagar:               { icon: DollarSign,color: '#22c55e', label: 'Pagou' },
    receber_pagamento:   { icon: DollarSign,color: '#16a34a', label: 'Recebeu' },
    registrar_despesa:   { icon: DollarSign,color: '#f59e0b', label: 'Despesa' },
    criar_conta_pagar:   { icon: DollarSign,color: '#ef4444', label: 'Conta' },
    consumir_material:   { icon: Briefcase, color: '#f59e0b', label: 'Consumo' },
    entrada_estoque:     { icon: Plus,      color: '#3b82f6', label: 'Entrada' },
    excluir_movimentacao:{ icon: Trash2,    color: '#ef4444', label: 'Excluiu' },
};

function tempoRelativo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'Agora';
    if (min < 60) return `Há ${min}min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `Há ${hrs}h`;
    const dias = Math.floor(hrs / 24);
    if (dias === 1) return 'Ontem';
    if (dias < 30) return `Há ${dias}d`;
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function TimelineRecente({ data, nav }) {
    if (!data || data.length === 0) return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={Activity} title="Atividade Recente" />
            <EmptyState icon={Activity} msg="Nenhuma atividade registrada ainda" />
        </div>
    );

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={Activity} title="Atividade Recente" />
            <div style={{ padding: '4px 0' }}>
                {data.map((ev, i) => {
                    const cfg = ACAO_CONFIG[ev.acao] || { icon: Activity, color: 'var(--primary)', label: ev.acao };
                    const Icon = cfg.icon;
                    const inicial = (ev.user_nome || '?')[0].toUpperCase();

                    const clickTarget = () => {
                        if (ev.referencia_tipo === 'orcamento') nav('orcs');
                        else if (ev.referencia_tipo === 'projeto') nav('proj');
                        else if (ev.referencia_tipo === 'estoque') nav('estoque');
                        else nav('dash');
                    };

                    return (
                        <div key={ev.id || `${ev.acao}-${i}`} onClick={clickTarget}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 20px', cursor: 'pointer',
                                borderBottom: i < data.length - 1 ? '1px solid var(--border)' : 'none',
                            }}
                            className="hover:bg-[var(--bg-hover)] transition-colors">
                            {/* Avatar com inicial do usuário */}
                            <div style={{
                                width: 32, height: 32, borderRadius: '50%',
                                background: `${cfg.color}18`, color: cfg.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                fontSize: 13, fontWeight: 800,
                            }}>
                                {inicial}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                                    {ev.descricao}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                                    <span style={{
                                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                        background: `${cfg.color}15`, color: cfg.color,
                                    }}>{cfg.label}</span>
                                    <span>{ev.user_nome}</span>
                                    <span>·</span>
                                    <span>{tempoRelativo(ev.criado_em)}</span>
                                </div>
                            </div>
                            <Icon size={14} style={{ color: cfg.color, flexShrink: 0, opacity: 0.6 }} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD FINANCEIRO — Componentes
// ═══════════════════════════════════════════════════════════

function FinanceiroKPI({ data }) {
    if (!data) return null;
    const cards = [
        { label: 'Receita do Mês', value: data.receita_mes, color: '#22c55e', icon: ArrowUpRight, prefix: '' },
        { label: 'Despesas do Mês', value: data.despesa_mes, color: '#ef4444', icon: ArrowDownRight, prefix: '-' },
        { label: 'Lucro do Mês', value: data.lucro_mes, color: data.lucro_mes >= 0 ? '#16a34a' : '#dc2626', icon: DollarSign, prefix: '' },
        { label: 'Margem', value: null, display: `${data.margem_pct}%`, color: data.margem_pct >= 20 ? '#16a34a' : data.margem_pct >= 0 ? '#f59e0b' : '#dc2626', icon: PieChart, prefix: '' },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {cards.map((c, i) => {
                const Icon = c.icon;
                return <KpiCard key={i} label={c.label} value={c.display || `${c.prefix}${R$(Math.abs(c.value))}`} color={c.color} icon={Icon} />;
            })}
        </div>
    );
}

function GraficoBarras6Meses({ data }) {
    if (!data || data.length === 0) return null;
    const maxVal = Math.max(...data.map(d => Math.max(d.receita, d.despesa)), 1);

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={BarChart3} title="Receita vs Despesas (6 meses)">
                <div style={{ display: 'flex', gap: 12, fontSize: 10, fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'linear-gradient(0deg, #22c55e, #4ade80)', display: 'inline-block' }} /> Receita</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'linear-gradient(0deg, #ef4444, #f87171)', display: 'inline-block' }} /> Despesas</span>
                </div>
            </SectionHeader>
            <div style={{ padding: '20px', display: 'flex', alignItems: 'flex-end', gap: 12, height: 220, position: 'relative' }}>
                {/* Grid lines */}
                {[0, 25, 50, 75].map(pct => (
                    <div key={pct} style={{ position: 'absolute', left: 0, right: 0, bottom: `${pct + 14}%`, borderTop: '1px dashed var(--border)', opacity: 0.5, pointerEvents: 'none' }} />
                ))}
                {data.map((m, i) => {
                    const rPct = Math.max((m.receita / maxVal) * 100, m.receita > 0 ? 4 : 0);
                    const dPct = Math.max((m.despesa / maxVal) * 100, m.despesa > 0 ? 4 : 0);
                    return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', zIndex: 1 }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flex: 1, width: '100%' }}>
                                <div style={{
                                    flex: 1, borderRadius: '6px 6px 0 0', minHeight: m.receita > 0 ? 4 : 0,
                                    height: `${rPct}%`,
                                    background: 'linear-gradient(0deg, #16a34a, #22c55e)',
                                    boxShadow: '0 -2px 8px rgba(34,197,94,0.25)',
                                    transformOrigin: 'bottom',
                                    animation: `chartGrowUp 0.5s ease ${i * 80}ms both`,
                                }} title={`Receita: ${R$(m.receita)}`} />
                                <div style={{
                                    flex: 1, borderRadius: '6px 6px 0 0', minHeight: m.despesa > 0 ? 4 : 0,
                                    height: `${dPct}%`,
                                    background: 'linear-gradient(0deg, #dc2626, #ef4444)',
                                    boxShadow: '0 -2px 8px rgba(239,68,68,0.25)',
                                    transformOrigin: 'bottom',
                                    animation: `chartGrowUp 0.5s ease ${i * 80 + 50}ms both`,
                                }} title={`Despesas: ${R$(m.despesa)}`} />
                            </div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{m.label}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function GraficoPizzaDespesas({ data }) {
    if (!data || data.length === 0) return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={PieChart} title="Despesas por Categoria" />
            <EmptyState icon={PieChart} msg="Sem despesas no período" />
        </div>
    );

    const total = data.reduce((s, d) => s + d.total, 0);

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={PieChart} title="Despesas por Categoria">
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>{R$(total)}</span>
            </SectionHeader>
            <div style={{ padding: '14px 20px' }}>
                {data.map((d, i) => {
                    const pct = total > 0 ? Math.round((d.total / total) * 100) : 0;
                    const color = CAT_COLOR[d.categoria] || '#94a3b8';
                    return (
                        <div key={i} style={{ marginBottom: 10, animation: `chartFadeIn 0.35s ease ${i * 50}ms both` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 3, display: 'inline-block',
                                        background: color, boxShadow: `0 1px 4px ${color}40` }} />
                                    {CAT_LABEL[d.categoria] || d.categoria}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{R$(d.total)} ({pct}%)</span>
                            </div>
                            <div style={{ background: 'var(--bg-muted)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                                <div style={{
                                    width: `${pct}%`, height: '100%', borderRadius: 99,
                                    background: `linear-gradient(90deg, ${color}, ${color}dd)`,
                                    boxShadow: `0 1px 6px ${color}30`,
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
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={Briefcase} title="Top Projetos por Lucro" />
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', padding: '8px 20px', borderBottom: '1px solid var(--border)', letterSpacing: '0.04em' }}>
                <span>Projeto</span><span style={{ textAlign: 'right' }}>Valor</span><span style={{ textAlign: 'right' }}>Despesas</span><span style={{ textAlign: 'right' }}>Lucro</span><span style={{ textAlign: 'center' }}>Margem</span>
            </div>
            {data.map((p, i) => (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', padding: '10px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.cliente_nome}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{R$(p.valor_venda)}</div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: '#ef4444' }}>{R$(p.despesas)}</div>
                    <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: p.lucro >= 0 ? '#16a34a' : '#dc2626' }}>{R$(p.lucro)}</div>
                    <div style={{ textAlign: 'center' }}>
                        <Badge label={`${p.margem}%`} color={p.margem >= 20 ? '#16a34a' : p.margem >= 0 ? '#f59e0b' : '#ef4444'} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function FluxoProjetado({ data }) {
    if (!data || data.length === 0) return null;

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={Wallet} title="Fluxo de Caixa Projetado (90 dias)" />
            <div style={{ padding: '14px 20px' }}>
                {data.map((m, i) => {
                    const accentColor = m.saldo >= 0 ? '#22c55e' : '#ef4444';
                    const totalFlux = (m.entradas || 1) + (m.saidas || 1);
                    return (
                        <div key={i} style={{
                            marginBottom: i < data.length - 1 ? 16 : 0, padding: 12, borderRadius: 10,
                            background: 'var(--bg-muted)', borderLeft: `3px solid ${accentColor}`,
                            animation: `chartFadeIn 0.35s ease ${i * 80}ms both`,
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, textTransform: 'capitalize', color: 'var(--text-primary)' }}>{m.label}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                                <span style={{ color: '#22c55e', fontWeight: 600 }}>Entradas: {R$(m.entradas)}</span>
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>Saídas: {R$(m.saidas)}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 3, marginBottom: 4, height: 8, borderRadius: 99, overflow: 'hidden', background: 'var(--bg-card)' }}>
                                <div style={{
                                    width: `${((m.entradas || 1) / totalFlux) * 100}%`, height: '100%',
                                    background: 'linear-gradient(90deg, #16a34a, #22c55e)',
                                    borderRadius: 99, boxShadow: '0 1px 6px rgba(34,197,94,0.25)',
                                    transformOrigin: 'left',
                                    animation: `chartSlideRight 0.5s ease ${i * 80 + 100}ms both`,
                                }} />
                                <div style={{
                                    width: `${((m.saidas || 1) / totalFlux) * 100}%`, height: '100%',
                                    background: 'linear-gradient(90deg, #dc2626, #ef4444)',
                                    borderRadius: 99, boxShadow: '0 1px 6px rgba(239,68,68,0.25)',
                                    transformOrigin: 'left',
                                    animation: `chartSlideRight 0.5s ease ${i * 80 + 150}ms both`,
                                }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: m.saldo >= 0 ? '#16a34a' : '#dc2626' }}>
                                Saldo: {m.saldo >= 0 ? '+' : ''}{R$(m.saldo)}
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
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={Receipt} title="Contas a Pagar" />
            <EmptyState icon={Receipt} msg="Nenhuma conta a pagar pendente" />
        </div>
    );

    return (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={Receipt} title="Contas a Pagar">
                {vencidas && vencidas.qtd > 0 && (
                    <Badge label={`${vencidas.qtd} vencida${vencidas.qtd > 1 ? 's' : ''} (${R$(vencidas.total)})`} color="#ef4444" />
                )}
            </SectionHeader>
            {data.map((c, i) => {
                const isVencida = c.dias_ate < 0;
                const isProxima = c.dias_ate >= 0 && c.dias_ate <= 7;
                const color = isVencida ? '#ef4444' : isProxima ? '#f59e0b' : 'var(--text-muted)';
                return (
                    <div key={c.id} style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descricao}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                {c.fornecedor && `${c.fornecedor} · `}{CAT_LABEL[c.categoria] || c.categoria}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color }}>{R$(c.valor)}</div>
                            <div style={{ fontSize: 10, color }}>
                                {isVencida ? `${Math.abs(c.dias_ate)}d atraso` : c.dias_ate === 0 ? 'Vence hoje' : `em ${c.dias_ate}d`}
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
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <SectionHeader icon={UserIcon} title="Top Clientes por Faturamento" />
            {data.map((c, i) => (
                <div key={i} style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, background: i === 0 ? '#f59e0b22' : 'var(--bg-muted)', color: i === 0 ? '#f59e0b' : 'var(--text-muted)',
                        }}>{i + 1}</span>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.cliente_nome}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.total_projetos} projeto{c.total_projetos > 1 ? 's' : ''}</div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{R$(c.valor_total)}</div>
                        <div style={{ fontSize: 10, color: '#22c55e' }}>recebido: {R$(c.recebido)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// DASH — Componente principal
// ═══════════════════════════════════════════════════════════
export default function Dash({ nav, notify, user }) {
    const [data, setData] = useState(null);
    const [finData, setFinData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(false);
    const isVendedor = user?.role === 'vendedor';
    const [tab, setTab] = useState('geral'); // 'geral' | 'financeiro'
    const [finLoading, setFinLoading] = useState(false);
    const [atividades, setAtividades] = useState([]);

    const load = useCallback(() => {
        api.get('/dashboard').then(d => {
            setData(d);
            setErr(false);
        }).catch(() => {
            setErr(true);
        }).finally(() => setLoading(false));
        // Carregar log real de atividades
        api.get('/atividades?limit=10').then(setAtividades).catch(() => {});
    }, []);

    const loadFin = useCallback(() => {
        setFinLoading(true);
        api.get('/dashboard/financeiro').then(d => {
            setFinData(d);
        }).catch(() => {}).finally(() => setFinLoading(false));
    }, []);

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

    // Shortcuts grid
    const shortcuts = [
        { lb: 'Clientes', ic: Ic.Usr, pg: 'cli' },
        { lb: 'Orcamentos', ic: Ic.File, pg: 'orcs' },
        { lb: 'Pipeline CRM', ic: Ic.Kb, pg: 'kb' },
        { lb: 'Projetos', ic: Ic.Briefcase, pg: 'proj' },
        { lb: 'Biblioteca', ic: Ic.Box, pg: 'cat' },
        { lb: 'Configuracoes', ic: Ic.Gear, pg: 'cfg' },
    ];

    if (loading) {
        return (
            <div className={Z.pg}>
                <div className="mb-6">
                    <h1 className={Z.h1}>{greet()}, bem-vindo!</h1>
                    <p className={Z.sub}>{today}</p>
                </div>
                <Spinner text="Carregando dashboard..." />
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
                <div className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
                    <AlertTriangle size={32} style={{ color: '#f59e0b', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>Erro ao carregar dashboard</p>
                    <button onClick={load} className={`${Z.btn} text-xs`}>Tentar novamente</button>
                </div>
            </div>
        );
    }

    return (
        <div className={Z.pg}>
            {/* ── Header + Tabs ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <h1 className={Z.h1}>{greet()}, bem-vindo!</h1>
                    <p className={Z.sub} style={{ marginBottom: 0 }}>{today}</p>
                </div>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-muted)', borderRadius: 10, padding: 3 }}>
                    {[
                        { id: 'geral', label: 'Visão Geral', icon: Activity },
                        ...(!isVendedor ? [{ id: 'financeiro', label: 'Financeiro', icon: DollarSign }] : []),
                    ].map(t => {
                        const Icon = t.icon;
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                style={{
                                    padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                                    background: tab === t.id ? 'var(--bg-card)' : 'transparent',
                                    color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                                    boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                                    display: 'flex', alignItems: 'center', gap: 5,
                                }}>
                                <Icon size={13} /> {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══ TAB GERAL ═══ */}
            {tab === 'geral' && (
                <>
                    {!isVendedor && <HeadlineMes data={data.headline} />}

                    {/* Métricas do vendedor */}
                    {isVendedor && data.vendedor && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'Orçamentos no mês', value: data.vendedor.orcs_mes, sub: R$(data.vendedor.orcs_valor_mes), icon: FileText, color: '#3b82f6' },
                                { label: 'Aprovados no mês', value: data.vendedor.aprovados_mes, sub: R$(data.vendedor.aprovados_valor_mes), icon: CheckCircle2, color: '#22c55e' },
                                { label: 'Taxa de conversão', value: `${data.vendedor.taxa_conversao}%`, sub: 'orçamentos → aprovados', icon: TrendingUp, color: '#8b5cf6' },
                                { label: 'Novos clientes', value: data.vendedor.novos_clientes_mes, sub: 'neste mês', icon: UserIcon, color: '#f59e0b' },
                            ].map((m, i) => {
                                const MIcon = m.icon;
                                return (
                                    <div key={i} className="glass-card" style={{ padding: '16px 18px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${m.color}15`, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <MIcon size={16} />
                                            </div>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{m.label}</span>
                                        </div>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{m.value}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{m.sub}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!isVendedor ? (
                        <FilaAtencao data={data.atencao} nav={nav} />
                    ) : data.atencao?.total_parados > 0 && (
                        <FilaAtencao data={{ ...data.atencao, total_vencidas: 0, contas_vencidas: [], valor_vencido: 0 }} nav={nav} />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: isVendedor ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <PipelineVisual data={data.pipeline} total={data.pipeline_total} nav={nav} />
                        {!isVendedor && <FluxoCaixa data={data.fluxo_caixa} />}
                    </div>
                    <ProjetosAtivos data={data.projetos_ativos} total={data.total_projetos_ativos} nav={nav} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
                        {shortcuts.filter(s => !(isVendedor && s.pg === 'cfg')).map((s, i) => {
                            const I = s.ic;
                            return (
                                <button key={i} onClick={() => nav(s.pg)}
                                    className="glass-card flex flex-col items-center gap-2 py-4 cursor-pointer hover:shadow-lg transition-all">
                                    <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <I />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.3 }}>{s.lb}</span>
                                </button>
                            );
                        })}
                    </div>
                    <TimelineRecente data={atividades} nav={nav} />
                </>
            )}

            {/* ═══ TAB FINANCEIRO ═══ */}
            {tab === 'financeiro' && (
                finLoading && !finData ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                        <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                    </div>
                ) : finData ? (
                    <>
                        <FinanceiroKPI data={finData.resumo} />

                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 16 }}>
                            <GraficoBarras6Meses data={finData.ultimos_6_meses} />
                            <GraficoPizzaDespesas data={finData.despesas_por_categoria} />
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <TabelaTopProjetos data={finData.top_projetos} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            <FluxoProjetado data={finData.fluxo_projetado} />
                            <ContasPagarProximas data={finData.contas_pagar_proximas} vencidas={finData.pagar_vencidas} />
                        </div>

                        <TopClientes data={finData.top_clientes} />
                    </>
                ) : (
                    <div className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
                        <AlertTriangle size={32} style={{ color: '#f59e0b', margin: '0 auto 12px' }} />
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>Erro ao carregar dados financeiros</p>
                        <button onClick={loadFin} className={`${Z.btn} text-xs`}>Tentar novamente</button>
                    </div>
                )
            )}
        </div>
    );
}
