// Tab "Dashboard" — estatísticas de produção CNC.
// Fase C: usa KpiCard/SectionHeader/DataTable do design system (ui.jsx)
// em vez de reimplementações locais. Consistência com o resto do sistema.

import { useState, useEffect, Fragment } from 'react';
import api from '../../../api';
import {
    KpiCard, SectionHeader, Spinner, EmptyState, StatusBadge,
} from '../../../ui';
import {
    BarChart3, Layers, Package, Scissors, CheckCircle2, Target,
    DollarSign, TrendingDown, TrendingUp, AlertTriangle,
} from 'lucide-react';

// Cor semântica de aproveitamento.
const aprovColor = (v) =>
    v >= 80 ? 'var(--success)' : v >= 60 ? 'var(--warning)' : 'var(--danger)';

// Cor da faixa de desperdício (inverso do aproveitamento).
const wasteTone = (v) => {
    if (v <= 20) return { bg: 'var(--success-bg)', fg: 'var(--success)', border: 'var(--success-border)' };
    if (v <= 40) return { bg: 'var(--warning-bg)', fg: 'var(--warning)', border: 'var(--warning-border)' };
    return { bg: 'var(--danger-bg)', fg: 'var(--danger)', border: 'var(--danger-border)' };
};

export function TabDashboard({ notify }) {
    const [stats, setStats] = useState(null);
    const [materiais, setMateriais] = useState([]);
    const [eficiencia, setEficiencia] = useState([]);
    const [custos, setCustos] = useState(null); // { resumo, por_material }
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        Promise.all([
            api.get('/cnc/dashboard/stats').catch(() => null),
            api.get('/cnc/dashboard/materiais').catch(() => []),
            api.get('/cnc/dashboard/eficiencia?days=30').catch(() => []),
            api.get('/cnc/relatorio-desperdicio-historico').catch(() => null),
        ]).then(([s, m, e, c]) => {
            setStats(s);
            setMateriais(Array.isArray(m) ? m : []);
            setEficiencia(Array.isArray(e) ? e : []);
            setCustos(c);
        }).finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    if (loading) {
        return <Spinner size={32} text="Carregando dashboard…" />;
    }

    if (!stats) {
        return (
            <EmptyState
                icon={BarChart3}
                title="Sem dados de produção"
                description="Quando você importar e processar lotes, as métricas aparecerão aqui."
            />
        );
    }

    const chartDays = eficiencia.slice(-14);
    const sparkAprov = chartDays.map(d => d.avgAprov || 0);
    const sparkChapas = chartDays.map(d => d.chapas || 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ── KPIs ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
            }}>
                <KpiCard
                    label="Chapas Cortadas"
                    value={stats.totalChapas || 0}
                    icon={Scissors}
                    accent="var(--primary)"
                    sparkData={sparkChapas.length > 1 ? sparkChapas : null}
                    sub={chartDays.length > 0 ? `últimos ${chartDays.length} dias` : null}
                />
                <KpiCard
                    label="Peças Produzidas"
                    value={stats.totalPecas || 0}
                    icon={Package}
                    accent="var(--accent)"
                />
                <KpiCard
                    label="Aproveitamento Médio"
                    value={`${stats.avgAproveitamento || 0}%`}
                    icon={Target}
                    accent={aprovColor(stats.avgAproveitamento || 0)}
                    sparkData={sparkAprov.length > 1 ? sparkAprov : null}
                    sub={
                        stats.avgAproveitamento >= 80 ? 'Excelente'
                        : stats.avgAproveitamento >= 60 ? 'Razoável'
                        : 'Abaixo do ideal'
                    }
                />
                <KpiCard
                    label="Lotes Concluídos"
                    value={`${stats.lotesConcluidos || 0}/${stats.totalLotes || 0}`}
                    icon={CheckCircle2}
                    accent="var(--success)"
                    sub={
                        stats.totalLotes
                            ? `${Math.round(((stats.lotesConcluidos || 0) / stats.totalLotes) * 100)}% completos`
                            : null
                    }
                />
                {custos?.resumo?.custo_total != null && (
                    <KpiCard
                        label="Custo Total Material"
                        value={`R$ ${(custos.resumo.custo_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        icon={DollarSign}
                        accent="var(--primary)"
                        sub="todos os lotes"
                    />
                )}
                {custos?.resumo?.custo_desperdicio_total != null && (
                    <KpiCard
                        label="Custo Desperdício"
                        value={`R$ ${(custos.resumo.custo_desperdicio_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        icon={TrendingDown}
                        accent="var(--danger)"
                        sub={custos.resumo.custo_total > 0
                            ? `${Math.round((custos.resumo.custo_desperdicio_total / custos.resumo.custo_total) * 100)}% do custo total`
                            : 'material descartado'}
                    />
                )}
            </div>

            {/* ── Alerta de desperdício alto ── */}
            {custos?.resumo?.custo_desperdicio_total > 500 && (
                <div style={{
                    padding: '10px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                    color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <AlertTriangle size={14} />
                    Alto custo de desperdício detectado: R$ {(custos.resumo.custo_desperdicio_total || 0).toFixed(2)}.
                    Considere usar o modo <strong>Máximo</strong> na próxima otimização para melhorar o aproveitamento.
                </div>
            )}

            {/* ── Eficiência diária ── */}
            {chartDays.length > 0 && (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <SectionHeader
                        icon={BarChart3}
                        title={`Eficiência — últimos ${chartDays.length} dias`}
                        accent="var(--primary)"
                    />
                    <div style={{ overflowX: 'auto', padding: '16px 20px' }}>
                        <EfficiencyChart days={chartDays} />
                    </div>
                </div>
            )}

            {/* ── Ranking de materiais ── */}
            {materiais.length > 0 && (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <SectionHeader
                        icon={Layers}
                        title="Ranking de Materiais"
                        accent="var(--accent)"
                    />
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Material', 'Chapas', 'Área Total (m²)', 'Desperdício', 'Custo Desp.'].map((h, i) => (
                                        <th key={h} className="th-glass" style={{
                                            textAlign: i === 0 ? 'left' : 'center',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {materiais.map((m, i) => {
                                    const w = wasteTone(m.desperdicio_medio || 0);
                                    // Cruzar com dados de custo do relatorio-desperdicio-historico
                                    const custoMat = custos?.por_material?.find(c =>
                                        c.material === m.material || c.codigo === m.material
                                    );
                                    return (
                                        <tr key={i}>
                                            <td className="td-glass" style={{ fontWeight: 600 }}>
                                                {m.material}
                                            </td>
                                            <td className="td-glass" style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                                {m.chapas_usadas}
                                            </td>
                                            <td className="td-glass" style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                                {m.area_total}
                                            </td>
                                            <td className="td-glass" style={{ textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-block', padding: '3px 10px',
                                                    borderRadius: 20, fontSize: 11, fontWeight: 700,
                                                    background: w.bg, color: w.fg,
                                                    border: `1px solid ${w.border}`,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    {m.desperdicio_medio}%
                                                </span>
                                            </td>
                                            <td className="td-glass" style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                                {custoMat?.custo_desperdicio != null
                                                    ? <span style={{ fontWeight: 700, color: custoMat.custo_desperdicio > 200 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                                        R$ {custoMat.custo_desperdicio.toFixed(2)}
                                                      </span>
                                                    : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Lotes recentes ── */}
            {(stats.recentLotes || []).length > 0 && (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <SectionHeader
                        icon={Package}
                        title="Lotes Recentes"
                        accent="var(--primary)"
                    />
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {['Nome', 'Cliente', 'Data', 'Chapas', 'Peças', 'Aprov.', 'Status'].map((h, i) => (
                                        <th key={h} className="th-glass" style={{
                                            textAlign: (i >= 3 && i <= 5) ? 'center' : 'left',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentLotes.map(l => (
                                    <tr key={l.id}>
                                        <td className="td-glass" style={{
                                            fontWeight: 600, maxWidth: 240,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {l.nome}
                                        </td>
                                        <td className="td-glass" style={{ color: 'var(--text-secondary)' }}>
                                            {l.cliente || '—'}
                                        </td>
                                        <td className="td-glass" style={{
                                            color: 'var(--text-muted)',
                                            fontVariantNumeric: 'tabular-nums',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {l.criado_em ? new Date(l.criado_em).toLocaleDateString('pt-BR') : '—'}
                                        </td>
                                        <td className="td-glass" style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                            {l.total_chapas || '—'}
                                        </td>
                                        <td className="td-glass" style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                            {l.total_pecas || '—'}
                                        </td>
                                        <td className="td-glass" style={{
                                            textAlign: 'center',
                                            fontWeight: 700,
                                            color: l.aproveitamento ? aprovColor(l.aproveitamento) : 'var(--text-muted)',
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {l.aproveitamento ? `${l.aproveitamento}%` : '—'}
                                        </td>
                                        <td className="td-glass">
                                            <StatusBadge status={l.status || 'importado'} size="sm" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══ SVG bar chart — eficiência diária com linha de meta ═══
function EfficiencyChart({ days }) {
    const width = Math.max(days.length * 56, 360);
    const height = 230;
    const barW = 32;
    const baseY = 185;
    const META = 80; // meta de aproveitamento industrial

    return (
        <svg
            width={width} height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: 'block' }}
            aria-label="Gráfico de eficiência diária"
        >
            {/* Grid */}
            {[0, 20, 40, 60, 80, 100].map(v => {
                const y = baseY - v * 1.7;
                const isMeta = v === META;
                return (
                    <Fragment key={v}>
                        <line
                            x1={32} y1={y} x2={width - 6} y2={y}
                            stroke={isMeta ? '#22c55e' : 'var(--border)'}
                            strokeWidth={isMeta ? 1.5 : 0.5}
                            strokeDasharray={isMeta ? '6 3' : (v > 0 ? '3 3' : '0')}
                            opacity={isMeta ? 0.7 : 1}
                        />
                        <text x={28} y={y + 3} textAnchor="end" fontSize={10}
                            fill={isMeta ? '#22c55e' : 'var(--text-muted)'}
                            fontWeight={isMeta ? 700 : 400}>
                            {v}%
                        </text>
                        {isMeta && (
                            <text x={width - 4} y={y - 3} textAnchor="end" fontSize={9}
                                fill="#22c55e" fontWeight={700}>
                                meta
                            </text>
                        )}
                    </Fragment>
                );
            })}
            {/* Bars */}
            {days.map((d, i) => {
                const val = d.avgAprov || 0;
                const barH = Math.max(2, val * 1.7);
                const barY = baseY - barH;
                const bx = 40 + i * 56;
                const color = aprovColor(val);
                const aboveMeta = val >= META;
                const dayLabel = d.date ? d.date.slice(5) : '';
                return (
                    <Fragment key={i}>
                        <rect
                            x={bx} y={barY} width={barW} height={barH}
                            fill={color} rx={6} opacity={0.88}
                        >
                            <title>{`${dayLabel}: ${val}% aproveit. — ${d.chapas} chapas, ${d.pecas || 0} peças`}</title>
                        </rect>
                        {/* Indicador acima/abaixo da meta */}
                        {d.chapas > 0 && (
                            <text x={bx + barW / 2} y={barY - 8}
                                textAnchor="middle" fontSize={10}
                                fill={color} fontWeight={700}>
                                {val}%
                            </text>
                        )}
                        {d.chapas > 0 && !aboveMeta && (
                            <text x={bx + barW / 2} y={barY - 19}
                                textAnchor="middle" fontSize={8} fill="#ef4444">
                                ▼
                            </text>
                        )}
                        <text x={bx + barW / 2} y={203}
                            textAnchor="middle" fontSize={9}
                            fill="var(--text-secondary)" fontWeight={500}>
                            {dayLabel}
                        </text>
                        <text x={bx + barW / 2} y={215}
                            textAnchor="middle" fontSize={8} fill="var(--text-muted)">
                            {d.chapas > 0 ? `${d.chapas}ch` : '—'}
                        </text>
                    </Fragment>
                );
            })}
        </svg>
    );
}

// ═══ Mini sparkline de custo semanal ═══
function CostSparkline({ days }) {
    if (!days || days.length === 0) return null;
    const maxV = Math.max(...days.map(d => d.custo_desperdicio || 0), 1);
    const w = days.length * 28;
    const h = 48;
    const pts = days.map((d, i) => {
        const x = 4 + i * 28;
        const y = h - 4 - ((d.custo_desperdicio || 0) / maxV) * (h - 8);
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
            <polyline points={pts} fill="none" stroke="var(--danger)" strokeWidth={2} strokeLinejoin="round" />
            {days.map((d, i) => {
                const x = 4 + i * 28;
                const y = h - 4 - ((d.custo_desperdicio || 0) / maxV) * (h - 8);
                return <circle key={i} cx={x} cy={y} r={3} fill="var(--danger)" opacity={0.8}>
                    <title>R$ {(d.custo_desperdicio || 0).toFixed(2)}</title>
                </circle>;
            })}
        </svg>
    );
}
