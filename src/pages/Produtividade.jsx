import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, Clock, Users, TrendingUp, RefreshCw, Calendar,
    ChevronDown, Award, Timer, Zap
} from 'lucide-react';
import { PageHeader, KpiCard, Spinner, EmptyState, RankBadge, ProgressBar } from '../ui';

function api(url) {
    const token = localStorage.getItem('erp_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { headers }).then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status}`);
        return r.json();
    });
}

function BarH({ value, max, color, label, sub }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
                <span style={{ color: 'var(--text-muted)' }}>{sub}</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: 'var(--bg-muted)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 5, background: color, transition: 'width 0.5s ease' }} />
            </div>
        </div>
    );
}

export default function Produtividade({ notify }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [periodo, setPeriodo] = useState('30');
    const [capacidade, setCapacidade] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const [prod, cap] = await Promise.all([
                api(`/api/producao-av/produtividade?periodo=${periodo}`),
                api('/api/producao-av/capacidade').catch(() => null),
            ]);
            setData(Array.isArray(prod) ? prod : []);
            setCapacidade(cap);
        } catch (err) {
            console.error('Erro produtividade:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [periodo]);

    // Agrupar por colaborador
    const porColaborador = useMemo(() => {
        const map = {};
        data.forEach(row => {
            if (!map[row.id]) map[row.id] = { nome: row.nome, etapas: [], totalMin: 0, totalTarefas: 0 };
            map[row.id].etapas.push({ etapa: row.etapa, tarefas: row.tarefas, minutos: row.minutos_total, media: Math.round(row.media_min) });
            map[row.id].totalMin += row.minutos_total || 0;
            map[row.id].totalTarefas += row.tarefas || 0;
        });
        return Object.entries(map).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.totalMin - a.totalMin);
    }, [data]);

    // Agrupar por etapa
    const porEtapa = useMemo(() => {
        const map = {};
        data.forEach(row => {
            if (!map[row.etapa]) map[row.etapa] = { tarefas: 0, minutos: 0 };
            map[row.etapa].tarefas += row.tarefas || 0;
            map[row.etapa].minutos += row.minutos_total || 0;
        });
        return Object.entries(map).map(([etapa, v]) => ({ etapa, ...v, media: v.tarefas > 0 ? Math.round(v.minutos / v.tarefas) : 0 })).sort((a, b) => b.minutos - a.minutos);
    }, [data]);

    const maxMinColab = Math.max(...porColaborador.map(c => c.totalMin), 1);
    const maxMinEtapa = Math.max(...porEtapa.map(e => e.minutos), 1);
    const totalHoras = data.reduce((s, r) => s + (r.minutos_total || 0), 0) / 60;
    const totalTarefas = data.reduce((s, r) => s + (r.tarefas || 0), 0);

    const ETAPA_COLORS = {
        corte: '#3b82f6', usinagem: '#8b5cf6', colagem_borda: '#f59e0b', furacao: '#ef4444',
        montagem: '#22c55e', acabamento: '#06b6d4', embalagem: '#ec4899',
    };

    return (
        <div className="page-enter" style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <PageHeader icon={BarChart3} title="Produtividade" subtitle="Desempenho da equipe por colaborador e etapa">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="input-glass" style={{
                        padding: '7px 12px', width: 'auto', fontSize: 13, cursor: 'pointer',
                    }}>
                        <option value="7">Últimos 7 dias</option>
                        <option value="15">Últimos 15 dias</option>
                        <option value="30">Últimos 30 dias</option>
                        <option value="60">Últimos 60 dias</option>
                        <option value="90">Últimos 90 dias</option>
                    </select>
                    <button onClick={load} className="btn-secondary" style={{ padding: '7px 12px', minHeight: 0 }}>
                        <RefreshCw size={14} />
                    </button>
                </div>
            </PageHeader>

            {loading ? (
                <Spinner text="Carregando produtividade..." />
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12, marginBottom: 24 }}>
                        <KpiCard icon={Clock} label="Horas Trabalhadas" value={`${Math.round(totalHoras * 10) / 10}h`} accent="#3b82f6" />
                        <KpiCard icon={Zap} label="Tarefas Concluídas" value={totalTarefas} accent="#22c55e" />
                        <KpiCard icon={Users} label="Colaboradores" value={porColaborador.length} accent="#8b5cf6" />
                        <KpiCard icon={Timer} label="Capacidade Mensal" value={capacidade ? `${capacidade.capacidadeMensal}h` : '--'} accent="#f59e0b" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
                        {/* Por Colaborador */}
                        <div className="glass-card" style={{ overflow: 'hidden' }}>
                            <div className="section-card-header">
                                <div className="section-card-header-title">
                                    <div className="section-card-header-icon" style={{ background: '#8b5cf612' }}>
                                        <Users size={15} style={{ color: '#8b5cf6' }} />
                                    </div>
                                    Por Colaborador
                                </div>
                                {porColaborador.length > 0 && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{porColaborador.length} pessoas</span>
                                )}
                            </div>
                            <div style={{ padding: '16px 20px' }}>
                                {porColaborador.length === 0 ? (
                                    <EmptyState icon={Users} title="Nenhum apontamento" description="Nenhum apontamento registrado no período selecionado." />
                                ) : porColaborador.map((c, i) => (
                                    <div key={c.id} style={{ marginBottom: 14 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <RankBadge rank={i + 1} />
                                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.nome}</span>
                                            </div>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                                                <strong style={{ color: 'var(--text-secondary)' }}>{Math.round(c.totalMin / 60)}h</strong> · {c.totalTarefas} tarefas
                                            </span>
                                        </div>
                                        <ProgressBar value={c.totalMin} max={maxMinColab} color={i === 0 ? '#8b5cf6' : i === 1 ? '#3b82f6' : '#94a3b8'} height={7} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Por Etapa */}
                        <div className="glass-card" style={{ overflow: 'hidden' }}>
                            <div className="section-card-header">
                                <div className="section-card-header-title">
                                    <div className="section-card-header-icon" style={{ background: '#3b82f612' }}>
                                        <BarChart3 size={15} style={{ color: '#3b82f6' }} />
                                    </div>
                                    Por Etapa
                                </div>
                                {porEtapa.length > 0 && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{porEtapa.length} etapas</span>
                                )}
                            </div>
                            <div style={{ padding: '16px 20px' }}>
                                {porEtapa.length === 0 ? (
                                    <EmptyState icon={BarChart3} title="Nenhum apontamento" description="Nenhum apontamento registrado no período selecionado." />
                                ) : porEtapa.map(e => {
                                    const c = ETAPA_COLORS[e.etapa] || '#64748b';
                                    return (
                                        <div key={e.etapa} style={{ marginBottom: 14 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{
                                                        width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0,
                                                        boxShadow: `0 0 6px ${c}40`,
                                                    }} />
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{e.etapa.replace(/_/g, ' ')}</span>
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                                                    <strong style={{ color: 'var(--text-secondary)' }}>{Math.round(e.minutos / 60)}h</strong> · {e.tarefas} tarefas · ~{e.media}min
                                                </span>
                                            </div>
                                            <ProgressBar value={e.minutos} max={maxMinEtapa} color={c} height={7} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Detail table */}
                    {data.length > 0 && (
                        <div className="glass-card" style={{ overflow: 'hidden' }}>
                            <div className="section-card-header">
                                <div className="section-card-header-title">
                                    <div className="section-card-header-icon" style={{ background: '#22c55e12' }}>
                                        <TrendingUp size={14} style={{ color: '#22c55e' }} />
                                    </div>
                                    Detalhamento
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{data.length} registros</span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }} className="table-stagger">
                                    <thead>
                                        <tr>
                                            <th className="th-glass" style={{ textAlign: 'left' }}>Colaborador</th>
                                            <th className="th-glass" style={{ textAlign: 'left' }}>Etapa</th>
                                            <th className="th-glass" style={{ textAlign: 'center' }}>Tarefas</th>
                                            <th className="th-glass" style={{ textAlign: 'center' }}>Total (min)</th>
                                            <th className="th-glass" style={{ textAlign: 'center' }}>Média (min)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.map((row, i) => (
                                            <tr key={i}>
                                                <td className="td-glass" style={{ fontWeight: 600 }}>{row.nome}</td>
                                                <td className="td-glass">
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                                                        background: `${ETAPA_COLORS[row.etapa] || '#64748b'}12`,
                                                        color: ETAPA_COLORS[row.etapa] || '#64748b',
                                                        border: `1px solid ${ETAPA_COLORS[row.etapa] || '#64748b'}25`,
                                                        textTransform: 'capitalize',
                                                    }}>
                                                        {row.etapa?.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="td-glass" style={{ textAlign: 'center' }}>{row.tarefas}</td>
                                                <td className="td-glass" style={{ textAlign: 'center' }}>{row.minutos_total}</td>
                                                <td className="td-glass" style={{ textAlign: 'center' }}>{Math.round(row.media_min)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
