// Tab "Dashboard" — estatísticas de produção CNC.
// Refatorado em Fase B: tokens do sistema + tabela compartilhada.

import { useState, useEffect, Fragment } from 'react';
import api from '../../../api';
import { Z, Spinner } from '../../../ui';
import { BarChart3, Layers, Package } from 'lucide-react';
import { STATUS_COLORS } from '../shared/constants.js';

// Devolve uma cor semântica (via design tokens) conforme aproveitamento.
// >=80% = sucesso; >=60% = alerta; senão perigo.
const aprovColor = (v) =>
    v >= 80 ? 'var(--success)' : v >= 60 ? 'var(--warning)' : 'var(--danger)';

// Cor da faixa de desperdício (inverso do aproveitamento).
const wasteStyle = (v) => {
    if (v <= 20) return { bg: 'var(--success-bg)', fg: 'var(--success)' };
    if (v <= 40) return { bg: 'var(--warning-bg)', fg: 'var(--warning)' };
    return { bg: 'var(--danger-bg)', fg: 'var(--danger)' };
};

export function TabDashboard({ notify }) {
    const [stats, setStats] = useState(null);
    const [materiais, setMateriais] = useState([]);
    const [eficiencia, setEficiencia] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            api.get('/cnc/dashboard/stats').catch(() => null),
            api.get('/cnc/dashboard/materiais').catch(() => []),
            api.get('/cnc/dashboard/eficiencia?days=30').catch(() => []),
        ]).then(([s, m, e]) => {
            setStats(s);
            setMateriais(Array.isArray(m) ? m : []);
            setEficiencia(Array.isArray(e) ? e : []);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Spinner />
            <div style={{ marginTop: 12, fontSize: 13 }}>Carregando dashboard…</div>
        </div>
    );
    if (!stats) return (
        <div className="glass-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Sem dados de produção disponíveis.
        </div>
    );

    const chartDays = eficiencia.slice(-14);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ── Cards de resumo ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <KpiCard label="Chapas Cortadas" value={stats.totalChapas || 0} />
                <KpiCard label="Peças Produzidas" value={stats.totalPecas || 0} />
                <KpiCard
                    label="Aproveitamento Médio"
                    value={`${stats.avgAproveitamento || 0}%`}
                    valueColor={aprovColor(stats.avgAproveitamento || 0)}
                />
                <KpiCard
                    label="Lotes Concluídos"
                    value={stats.lotesConcluidos || 0}
                    suffix={` / ${stats.totalLotes || 0}`}
                />
            </div>

            {/* ── Eficiência diária (SVG bar chart) ── */}
            {chartDays.length > 0 && (
                <div className="glass-card" style={{ padding: 16 }}>
                    <SectionHeader icon={BarChart3} title={`Eficiência — últimos ${chartDays.length} dias`} />
                    <div style={{ overflowX: 'auto', paddingTop: 8 }}>
                        <EfficiencyChart days={chartDays} />
                    </div>
                </div>
            )}

            {/* ── Ranking de materiais ── */}
            {materiais.length > 0 && (
                <div className="glass-card" style={{ padding: 16 }}>
                    <SectionHeader icon={Layers} title="Ranking de Materiais" />
                    <TableWrap>
                        <thead>
                            <tr>
                                {['Material', 'Chapas', 'Área Total (m²)', 'Desperdício Médio'].map(h => (
                                    <th key={h} className={Z.th} style={thStyle}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {materiais.map((m, i) => {
                                const w = wasteStyle(m.desperdicio_medio || 0);
                                return (
                                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
                                        <td style={{ ...tdStyle, fontWeight: 600 }}>{m.material}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>{m.chapas_usadas}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{m.area_total}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <Pill bg={w.bg} fg={w.fg}>{m.desperdicio_medio}%</Pill>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </TableWrap>
                </div>
            )}

            {/* ── Lotes recentes ── */}
            {(stats.recentLotes || []).length > 0 && (
                <div className="glass-card" style={{ padding: 16 }}>
                    <SectionHeader icon={Package} title="Lotes Recentes" />
                    <TableWrap>
                        <thead>
                            <tr>
                                {['Nome', 'Cliente', 'Data', 'Chapas', 'Peças', 'Aprov.', 'Status'].map(h => (
                                    <th key={h} className={Z.th} style={thStyle}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {stats.recentLotes.map((l, i) => {
                                const statusColor = STATUS_COLORS[l.status] || 'var(--info)';
                                return (
                                    <tr key={l.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
                                        <td style={{
                                            ...tdStyle, fontWeight: 600, maxWidth: 200,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {l.nome}
                                        </td>
                                        <td style={tdStyle}>{l.cliente || '—'}</td>
                                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                                            {l.criado_em ? new Date(l.criado_em).toLocaleDateString('pt-BR') : '—'}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>{l.total_chapas || '—'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>{l.total_pecas || '—'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            {l.aproveitamento ? `${l.aproveitamento}%` : '—'}
                                        </td>
                                        <td style={tdStyle}>
                                            <Pill
                                                bg={statusColor + '1A'}
                                                fg={statusColor}
                                                border={statusColor + '40'}
                                                uppercase
                                            >
                                                {l.status || 'importado'}
                                            </Pill>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </TableWrap>
                </div>
            )}
        </div>
    );
}

// ═══ Subcomponents ═══════════════════════════════════════

function KpiCard({ label, value, suffix, valueColor }) {
    return (
        <div className="glass-card" style={{
            padding: '18px 20px', textAlign: 'center',
            display: 'flex', flexDirection: 'column', gap: 6,
        }}>
            <div style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: 0.5, color: 'var(--text-muted)',
            }}>
                {label}
            </div>
            <div style={{
                fontSize: 28, fontWeight: 800,
                color: valueColor || 'var(--text-primary)',
                lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
            }}>
                {value}
                {suffix && (
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>
                        {suffix}
                    </span>
                )}
            </div>
        </div>
    );
}

function SectionHeader({ icon: Icon, title }) {
    return (
        <h3 style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
            margin: 0, marginBottom: 12,
        }}>
            <Icon size={16} style={{ color: 'var(--primary)' }} />
            {title}
        </h3>
    );
}

function TableWrap({ children }) {
    return (
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
                {children}
            </table>
        </div>
    );
}

function Pill({ bg, fg, border, uppercase, children }) {
    return (
        <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 10,
            fontSize: 11, fontWeight: 700,
            background: bg, color: fg,
            border: border ? `1px solid ${border}` : 'none',
            textTransform: uppercase ? 'uppercase' : 'none',
            letterSpacing: uppercase ? 0.4 : 0,
        }}>
            {children}
        </span>
    );
}

function EfficiencyChart({ days }) {
    const width = Math.max(days.length * 50, 320);
    const height = 210;
    const barW = 28;
    const baseY = 175;
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
            {/* Grid */}
            {[0, 20, 40, 60, 80, 100].map(v => {
                const y = baseY - v * 1.5;
                return (
                    <Fragment key={v}>
                        <line
                            x1={30} y1={y} x2={width - 6} y2={y}
                            stroke="var(--border)"
                            strokeWidth={0.5}
                            strokeDasharray={v > 0 ? '3 3' : '0'}
                        />
                        <text x={26} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">{v}%</text>
                    </Fragment>
                );
            })}
            {/* Bars */}
            {days.map((d, i) => {
                const barH = Math.max(2, (d.avgAprov || 0) * 1.5);
                const barY = baseY - barH;
                const bx = 35 + i * 50;
                const color = aprovColor(d.avgAprov || 0);
                const dayLabel = d.date ? d.date.slice(5) : '';
                return (
                    <Fragment key={i}>
                        <rect x={bx} y={barY} width={barW} height={barH} fill={color} rx={4} opacity={0.88} />
                        <text x={bx + barW / 2} y={barY - 4} textAnchor="middle" fontSize={10} fill="var(--text-primary)" fontWeight={700}>
                            {d.avgAprov}%
                        </text>
                        <text x={bx + barW / 2} y={192} textAnchor="middle" fontSize={9} fill="var(--text-muted)">{dayLabel}</text>
                        <text x={bx + barW / 2} y={204} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{d.chapas}ch</text>
                    </Fragment>
                );
            })}
        </svg>
    );
}

// ── Shared cell styles ──
const thStyle = {
    padding: '10px 12px', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600,
    textAlign: 'left', color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: 0.3,
    borderBottom: '1px solid var(--border)',
};

const tdStyle = {
    padding: '10px 12px', fontSize: 13,
    borderBottom: '1px solid var(--border)',
};
