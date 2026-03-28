import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, Clock, Users, TrendingUp, RefreshCw, Calendar,
    ChevronDown, Award, Timer, Zap
} from 'lucide-react';

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
        <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <BarChart3 size={22} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Produtividade</h1>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Desempenho da equipe por colaborador e etapa</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{
                        padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13,
                    }}>
                        <option value="7">Últimos 7 dias</option>
                        <option value="15">Últimos 15 dias</option>
                        <option value="30">Últimos 30 dias</option>
                        <option value="60">Últimos 60 dias</option>
                        <option value="90">Últimos 90 dias</option>
                    </select>
                    <button onClick={load} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, color: 'var(--text-muted)' }}>
                    <RefreshCw size={20} className="spin" /> Carregando...
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                        {[
                            { icon: Clock, label: 'Horas Trabalhadas', value: `${Math.round(totalHoras * 10) / 10}h`, color: '#3b82f6' },
                            { icon: Zap, label: 'Tarefas Concluídas', value: totalTarefas, color: '#22c55e' },
                            { icon: Users, label: 'Colaboradores', value: porColaborador.length, color: '#8b5cf6' },
                            { icon: Timer, label: 'Capacidade Mensal', value: capacidade ? `${capacidade.capacidadeMensal}h` : '--', color: '#f59e0b' },
                        ].map((kpi, i) => {
                            const I = kpi.icon;
                            return (
                                <div key={i} style={{
                                    background: 'var(--bg-card)', borderRadius: 12, padding: '16px 20px',
                                    border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14,
                                }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                                        background: `${kpi.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <I size={20} style={{ color: kpi.color }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</div>
                                        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{kpi.value}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                        {/* Por Colaborador */}
                        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <Users size={18} style={{ color: '#8b5cf6' }} />
                                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Por Colaborador</span>
                            </div>
                            {porColaborador.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                                    <Users size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                                    <div style={{ fontSize: 13 }}>Nenhum apontamento no período</div>
                                </div>
                            ) : porColaborador.map((c, i) => (
                                <BarH
                                    key={c.id}
                                    value={c.totalMin}
                                    max={maxMinColab}
                                    color={i === 0 ? '#8b5cf6' : i === 1 ? '#3b82f6' : '#64748b'}
                                    label={`${i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}${c.nome}`}
                                    sub={`${Math.round(c.totalMin / 60)}h · ${c.totalTarefas} tarefas`}
                                />
                            ))}
                        </div>

                        {/* Por Etapa */}
                        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <BarChart3 size={18} style={{ color: '#3b82f6' }} />
                                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Por Etapa</span>
                            </div>
                            {porEtapa.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                                    <BarChart3 size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                                    <div style={{ fontSize: 13 }}>Nenhum apontamento no período</div>
                                </div>
                            ) : porEtapa.map((e, i) => (
                                <BarH
                                    key={e.etapa}
                                    value={e.minutos}
                                    max={maxMinEtapa}
                                    color={ETAPA_COLORS[e.etapa] || '#64748b'}
                                    label={e.etapa}
                                    sub={`${Math.round(e.minutos / 60)}h · ${e.tarefas} tarefas · ~${e.media}min/tarefa`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Detail table */}
                    {data.length > 0 && (
                        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <TrendingUp size={18} style={{ color: '#22c55e' }} />
                                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Detalhamento</span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Colaborador</th>
                                            <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Etapa</th>
                                            <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Tarefas</th>
                                            <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Total (min)</th>
                                            <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>Média (min)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.map((row, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.nome}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                                        background: `${ETAPA_COLORS[row.etapa] || '#64748b'}15`,
                                                        color: ETAPA_COLORS[row.etapa] || '#64748b',
                                                    }}>
                                                        {row.etapa}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>{row.tarefas}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>{row.minutos_total}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>{Math.round(row.media_min)}</td>
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
