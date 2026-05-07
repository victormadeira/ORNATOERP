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
    DollarSign, TrendingDown, TrendingUp, AlertTriangle, Gauge, Calendar, Clock, Zap,
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
    const [producao, setProducao] = useState(null);
    const [aprendizado, setAprendizado] = useState(null);
    const [loading, setLoading] = useState(true);

    const [dataWarning, setDataWarning] = useState(false);

    const load = () => {
        setLoading(true);
        setDataWarning(false);
        const erros = { stats: false, materiais: false, eficiencia: false, custos: false, producao: false, aprendizado: false };
        Promise.all([
            api.get('/cnc/dashboard/stats').catch(() => { erros.stats = true; return null; }),
            api.get('/cnc/dashboard/materiais').catch(() => { erros.materiais = true; return []; }),
            api.get('/cnc/dashboard/eficiencia?days=30').catch(() => { erros.eficiencia = true; return []; }),
            api.get('/cnc/relatorio-desperdicio-historico').catch(() => { erros.custos = true; return null; }),
            api.get('/cnc/dashboard/producao').catch(() => {
                erros.producao = true;
                return { resumo: {}, maquinas: [], fila: [], alertas: [] };
            }),
            api.get('/cnc/dashboard/aprendizado').catch(() => {
                erros.aprendizado = true;
                return { resumo: {}, por_maquina: [], insights: ['Conclua chapas pela fila para alimentar o aprendizado operacional.'], recentes: [] };
            }),
        ]).then(([s, m, e, c, p, a]) => {
            setStats(s);
            setMateriais(Array.isArray(m) ? m : []);
            setEficiencia(Array.isArray(e) ? e : []);
            setCustos(c);
            setProducao(p);
            setAprendizado(a);
            // Avisar se alguma API falhou silenciosamente
            if (Object.values(erros).some(Boolean)) setDataWarning(true);
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
            {dataWarning && (
                <div style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                    color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <AlertTriangle size={13} />
                    Alguns dados do dashboard não puderam ser carregados. As métricas podem estar incompletas.
                    <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warning)', fontWeight: 700, fontSize: 12, padding: '2px 8px' }}>
                        Tentar novamente
                    </button>
                </div>
            )}
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
                    accent="var(--primary)"
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
                {(stats.pecasPorDia || 0) > 0 && (
                    <KpiCard
                        label="Peças / Dia"
                        value={stats.pecasPorDia}
                        icon={Gauge}
                        accent="var(--info)"
                        sub={stats.diasAtivos ? `${stats.diasAtivos} dias ativos no período` : null}
                    />
                )}
                {(stats.peakAproveitamento || 0) > 0 && (
                    <KpiCard
                        label="Pico de Aproveit."
                        value={`${stats.peakAproveitamento}%`}
                        icon={TrendingUp}
                        accent={aprovColor(stats.peakAproveitamento || 0)}
                        sub="melhor dia no período"
                    />
                )}
                {(stats.tempoMaquinaMin || 0) > 0 && (
                    <KpiCard
                        label="Horas de Máquina"
                        value={stats.tempoMaquinaMin >= 60
                            ? `${Math.floor(stats.tempoMaquinaMin / 60)}h ${Math.round(stats.tempoMaquinaMin % 60)}min`
                            : `${stats.tempoMaquinaMin}min`}
                        icon={Clock}
                        accent="#06b6d4"
                        sub={stats.distCorteTotal > 0 ? `${stats.distCorteTotal}m cortados` : 'tempo estimado de corte'}
                    />
                )}
                {(stats.trocasFerramenta || 0) > 0 && (
                    <KpiCard
                        label="Trocas Ferramenta"
                        value={stats.trocasFerramenta}
                        icon={Zap}
                        accent="#f59e0b"
                        sub="no período selecionado"
                    />
                )}
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

            {/* ── Chão de fábrica ── */}
            {producao && (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <SectionHeader
                        icon={Gauge}
                        title="Chão de Fábrica"
                        accent="var(--primary)"
                    />
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: 10,
                        }}>
                            {[
                                { label: 'Máquinas ativas', value: producao.resumo?.maquinas_ativas || 0, color: 'var(--primary)' },
                                { label: 'Em produção', value: producao.resumo?.em_producao || 0, color: '#f59e0b' },
                                { label: 'Aguardando', value: producao.resumo?.aguardando || 0, color: '#2563eb' },
                                { label: 'Sem máquina', value: producao.resumo?.sem_maquina || 0, color: producao.resumo?.sem_maquina ? 'var(--danger)' : 'var(--success)' },
                                { label: 'Alertas de fresa', value: producao.resumo?.alertas_ferramentas || 0, color: producao.resumo?.alertas_ferramentas ? 'var(--danger)' : 'var(--success)' },
                            ].map((kpi) => (
                                <div key={kpi.label} style={{
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-card)',
                                    borderRadius: 8,
                                    padding: '12px 14px',
                                }}>
                                    <div style={{ fontSize: 22, fontWeight: 850, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, fontWeight: 700 }}>{kpi.label}</div>
                                </div>
                            ))}
                        </div>

                        {(producao.maquinas || []).length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                                {producao.maquinas.map(m => {
                                    const busy = (m.fila?.em_producao || 0) > 0;
                                    const risk = (m.alertas_ferramentas || 0) > 0;
                                    return (
                                        <div key={m.id} style={{
                                            border: `1px solid ${risk ? 'var(--danger-border)' : busy ? 'var(--warning-border)' : 'var(--border)'}`,
                                            background: risk ? 'var(--danger-bg)' : busy ? 'var(--warning-bg)' : 'var(--bg-card)',
                                            borderRadius: 8,
                                            padding: 12,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 850, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                                        {m.operador || 'Sem operador'} · {Math.round(m.x_max || 0)}×{Math.round(m.y_max || 0)}mm
                                                    </div>
                                                </div>
                                                <span style={{
                                                    padding: '3px 8px',
                                                    borderRadius: 999,
                                                    fontSize: 10,
                                                    fontWeight: 800,
                                                    color: busy ? '#92400e' : 'var(--success)',
                                                    background: busy ? 'rgba(245,158,11,0.12)' : 'var(--success-bg)',
                                                    border: `1px solid ${busy ? 'var(--warning-border)' : 'var(--success-border)'}`,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {busy ? 'Cortando' : 'Disponível'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                                                <MiniCell label="Fila" value={m.fila?.total || 0} />
                                                <MiniCell label="Peças/h" value={m.performance?.pecas_hora || 0} />
                                                <MiniCell label="Eficiência" value={`${m.performance?.eficiencia || 0}%`} />
                                            </div>
                                            {risk && (
                                                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--danger)', fontWeight: 750, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AlertTriangle size={13} />
                                                    {m.alertas_ferramentas} alerta(s) de ferramenta nesta máquina
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {(producao.fila || []).length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            {['Fila', 'Máquina', 'Chapa', 'Cliente', 'Status'].map((h, i) => (
                                                <th key={h} className="th-glass" style={{ textAlign: i === 4 ? 'center' : 'left' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {producao.fila.slice(0, 8).map(f => (
                                            <tr key={f.id}>
                                                <td className="td-glass" style={{ fontWeight: 700 }}>{f.lote_nome || `Lote #${f.lote_id}`}</td>
                                                <td className="td-glass">{f.maquina_nome || <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Sem máquina</span>}</td>
                                                <td className="td-glass">Chapa {(f.chapa_idx || 0) + 1}</td>
                                                <td className="td-glass">{f.lote_cliente || '—'}</td>
                                                <td className="td-glass" style={{ textAlign: 'center' }}>
                                                    <StatusBadge status={f.status || 'aguardando'} size="sm" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Aprendizado operacional ── */}
            {aprendizado && (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <SectionHeader
                        icon={TrendingUp}
                        title="Histórico e Aprendizado"
                        accent="var(--info)"
                    />
                    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <MiniCell label="Amostras" value={aprendizado.resumo?.amostras || 0} strong />
                                <MiniCell label="Peças/h" value={aprendizado.resumo?.pecas_hora || 0} strong />
                                <MiniCell
                                    label="Erro estim."
                                    value={`${aprendizado.resumo?.erro_medio_pct || 0}%`}
                                    tone={Math.abs(aprendizado.resumo?.erro_medio_pct || 0) > 15 ? 'var(--warning)' : 'var(--success)'}
                                    strong
                                />
                                <MiniCell
                                    label="Defeitos"
                                    value={`${aprendizado.resumo?.taxa_defeito_pct || 0}%`}
                                    tone={(aprendizado.resumo?.taxa_defeito_pct || 0) > 2 ? 'var(--danger)' : 'var(--success)'}
                                    strong
                                />
                            </div>
                            <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: 11, fontWeight: 850, color: 'var(--text-secondary)', marginBottom: 8 }}>Sinais detectados</div>
                                {(aprendizado.insights || []).map((insight, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: i ? 7 : 0 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--info)', marginTop: 5, flexShrink: 0 }} />
                                        <span>{insight}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['Máquina', 'Chapas', 'Peças/h', 'Erro estim.', 'Defeitos'].map((h, i) => (
                                            <th key={h} className="th-glass" style={{ textAlign: i === 0 ? 'left' : 'center' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(aprendizado.por_maquina || []).slice(0, 8).map(m => (
                                        <tr key={m.maquina_id || m.maquina_nome}>
                                            <td className="td-glass" style={{ fontWeight: 700 }}>{m.maquina_nome}</td>
                                            <td className="td-glass" style={{ textAlign: 'center' }}>{m.chapas}</td>
                                            <td className="td-glass" style={{ textAlign: 'center' }}>{m.pecas_hora}</td>
                                            <td className="td-glass" style={{ textAlign: 'center', color: Math.abs(m.erro_estimativa_pct || 0) > 15 ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: 700 }}>
                                                {m.erro_estimativa_pct}%
                                            </td>
                                            <td className="td-glass" style={{ textAlign: 'center', color: (m.taxa_defeito_pct || 0) > 2 ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 700 }}>
                                                {m.taxa_defeito_pct}%
                                            </td>
                                        </tr>
                                    ))}
                                    {(!aprendizado.por_maquina || aprendizado.por_maquina.length === 0) && (
                                        <tr>
                                            <td className="td-glass" colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                                                Conclua chapas pela fila para alimentar o aprendizado operacional.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Tendência de desperdício (sparkline) ── */}
            {chartDays.length > 2 && chartDays.some(d => d.avgAprov > 0) && (
                <div className="glass-card" style={{ padding: '12px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <TrendingDown size={13} color="var(--danger)" />
                            Desperdício (%) — últimos {chartDays.length} dias
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            média {Math.round(chartDays.reduce((s, d) => s + (100 - (d.avgAprov || 0)), 0) / chartDays.length)}% desperdício
                        </span>
                    </div>
                    {/* Reutilizamos CostSparkline com desperdício % como custo_desperdicio */}
                    <CostSparkline days={chartDays.map(d => ({ custo_desperdicio: 100 - (d.avgAprov || 0), date: d.date }))} />
                </div>
            )}

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
                        accent="var(--primary)"
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
                                        {/* P7: badge com fundo semântico para melhor leitura */}
                                        <td className="td-glass" style={{ textAlign: 'center' }}>
                                            {l.aproveitamento ? (
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '2px 8px', borderRadius: 6,
                                                    fontSize: 11, fontWeight: 700,
                                                    fontVariantNumeric: 'tabular-nums',
                                                    background: aprovColor(l.aproveitamento) === 'var(--success)'
                                                        ? 'var(--success-bg)' : aprovColor(l.aproveitamento) === 'var(--warning)'
                                                        ? 'var(--warning-bg)' : 'var(--danger-bg)',
                                                    color: aprovColor(l.aproveitamento),
                                                    border: `1px solid ${aprovColor(l.aproveitamento) === 'var(--success)'
                                                        ? 'var(--success-border)' : aprovColor(l.aproveitamento) === 'var(--warning)'
                                                        ? 'var(--warning-border)' : 'var(--danger-border)'}`,
                                                }}>
                                                    {l.aproveitamento}%
                                                </span>
                                            ) : '—'}
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

function MiniCell({ label, value, tone = 'var(--text-primary)', strong = false }) {
    return (
        <div style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            borderRadius: 8,
            padding: strong ? '12px 10px' : '8px 9px',
            minWidth: 0,
        }}>
            <div style={{
                fontSize: strong ? 20 : 14,
                lineHeight: 1,
                fontWeight: 850,
                color: tone,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            }}>
                {value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {label}
            </div>
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
            {/* Grid (sem linha META aqui — renderizada depois das barras para ficar na frente) */}
            {[0, 20, 40, 60, 100].map(v => {
                const y = baseY - v * 1.7;
                return (
                    <Fragment key={v}>
                        <line
                            x1={32} y1={y} x2={width - 6} y2={y}
                            stroke="var(--border)" strokeWidth={0.5}
                            strokeDasharray={v > 0 ? '3 3' : '0'}
                        />
                        <text x={28} y={y + 3} textAnchor="end" fontSize={10}
                            fill="var(--text-muted)" fontWeight={400}>
                            {v}%
                        </text>
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
            {/* P5: linha META renderizada por último para ficar sempre na frente das barras */}
            {(() => {
                const metaY = baseY - META * 1.7;
                return (
                    <g>
                        <line
                            x1={32} y1={metaY} x2={width - 6} y2={metaY}
                            stroke="#22c55e" strokeWidth={1.5}
                            strokeDasharray="6 3" opacity={0.85}
                        />
                        <text x={28} y={metaY + 3} textAnchor="end" fontSize={10}
                            fill="#22c55e" fontWeight={700}>
                            {META}%
                        </text>
                        <text x={width - 4} y={metaY - 3} textAnchor="end" fontSize={9}
                            fill="#22c55e" fontWeight={700}>
                            meta
                        </text>
                    </g>
                );
            })()}
        </svg>
    );
}

// ═══ Mini sparkline de custo/desperdício semanal ═══
function CostSparkline({ days }) {
    if (!days || days.length === 0) return null;
    const maxV = Math.max(...days.map(d => d.custo_desperdicio || 0), 1);
    const minV = Math.min(...days.map(d => d.custo_desperdicio || 0));
    const step = 32;
    const w = days.length * step;
    const h = 56;
    const toX = i => 8 + i * step;
    const toY = v => h - 8 - ((v - minV) / Math.max(maxV - minV, 0.01)) * (h - 16);
    const pts = days.map((d, i) => `${toX(i)},${toY(d.custo_desperdicio || 0)}`).join(' ');
    const lastVal = days[days.length - 1]?.custo_desperdicio || 0;
    const firstVal = days[0]?.custo_desperdicio || 0;
    const trend = lastVal > firstVal ? 'var(--danger)' : 'var(--success)';
    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={Math.max(w, 200)} height={h} viewBox={`0 0 ${Math.max(w, 200)} ${h}`} style={{ display: 'block' }}>
                {/* Área preenchida */}
                <path
                    d={`M${toX(0)},${h - 4} ${days.map((d, i) => `${toX(i)},${toY(d.custo_desperdicio || 0)}`).join(' ')} ${toX(days.length - 1)},${h - 4} Z`}
                    fill={trend}
                    opacity={0.1}
                />
                <polyline points={pts} fill="none" stroke={trend} strokeWidth={1.5} strokeLinejoin="round" />
                {days.map((d, i) => {
                    const x = toX(i);
                    const y = toY(d.custo_desperdicio || 0);
                    const label = d.date ? d.date.slice(5) : `${i + 1}`;
                    return (
                        <g key={i}>
                            <circle cx={x} cy={y} r={3} fill={trend} opacity={0.9}>
                                <title>{label}: {(d.custo_desperdicio || 0).toFixed(1)}%</title>
                            </circle>
                            {i % Math.max(1, Math.floor(days.length / 7)) === 0 && (
                                <text x={x} y={h - 1} textAnchor="middle" fontSize={8} fill="var(--text-muted)">
                                    {label}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
