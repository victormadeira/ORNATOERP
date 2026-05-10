// ═══════════════════════════════════════════════════════
// Admin — Telemetria do Plugin (installs ativos por versão/dia/OS)
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { Z, PageHeader, Spinner, EmptyState } from '../../ui';
import { BarChart3, RefreshCw, ChevronLeft, Activity } from 'lucide-react';

function token() { return localStorage.getItem('erp_token'); }

async function fetchTelemetry(group_by, since) {
    const qs = new URLSearchParams({ group_by, since }).toString();
    const r = await fetch(`/api/plugin/telemetry?${qs}`, {
        headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw data.error || 'Erro';
    return data;
}

// Bar chart simples em SVG (sem dep externa — chart.js não está no package.json)
function BarChart({ rows, xKey, yKey, height = 220, color = 'var(--primary)' }) {
    if (!rows || rows.length === 0) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>(sem dados)</div>;
    const max = Math.max(...rows.map(r => r[yKey] || 0), 1);
    const W = Math.max(rows.length * 60, 480);
    const padL = 40, padB = 60, padT = 10, padR = 10;
    const innerH = height - padB - padT;
    const innerW = W - padL - padR;
    const barW = Math.max(innerW / rows.length - 8, 12);

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${height}`} style={{ overflow: 'visible' }}>
            {/* Y axis grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
                const y = padT + innerH * (1 - p);
                return (
                    <g key={i}>
                        <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeDasharray="2 2" />
                        <text x={padL - 6} y={y + 3} fontSize="10" fill="var(--text-muted)" textAnchor="end">
                            {Math.round(max * p)}
                        </text>
                    </g>
                );
            })}
            {rows.map((r, i) => {
                const v = r[yKey] || 0;
                const h = (v / max) * innerH;
                const x = padL + i * (innerW / rows.length) + 4;
                const y = padT + innerH - h;
                return (
                    <g key={i}>
                        <rect x={x} y={y} width={barW} height={h} fill={color} rx={4}>
                            <title>{r[xKey]}: {v}</title>
                        </rect>
                        <text x={x + barW / 2} y={y - 4} fontSize="11" fill="var(--text-primary)" textAnchor="middle" fontWeight="600">
                            {v}
                        </text>
                        <text x={x + barW / 2} y={height - padB + 14} fontSize="10" fill="var(--text-muted)"
                            textAnchor="middle" transform={`rotate(-25 ${x + barW / 2} ${height - padB + 14})`}>
                            {String(r[xKey] || '?').slice(0, 14)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

export default function PluginTelemetry({ notify, onNav }) {
    const [byVersion, setByVersion] = useState([]);
    const [byDay, setByDay] = useState([]);
    const [byOs, setByOs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    const reload = useCallback(async () => {
        setLoading(true);
        const since = new Date(Date.now() - days * 86400_000).toISOString();
        try {
            const [v, d, o] = await Promise.all([
                fetchTelemetry('version', since),
                fetchTelemetry('day', since),
                fetchTelemetry('os', since),
            ]);
            setByVersion(v.rows || []);
            setByDay(d.rows || []);
            setByOs(o.rows || []);
        } catch (e) {
            notify?.(typeof e === 'string' ? e : 'Erro ao carregar telemetria');
        } finally { setLoading(false); }
    }, [days, notify]);

    useEffect(() => { reload(); }, [reload]);

    const totalInstalls = byVersion.reduce((s, r) => s + (r.installs || 0), 0);

    return (
        <div className={Z.pg}>
            <PageHeader
                icon={BarChart3}
                title="Telemetria do Plugin"
                subtitle={`Installs ativos nos últimos ${days} dias (anonimizado por install_id)`}
                accent="accent"
            >
                <button className={Z.btn2Sm} onClick={() => onNav?.('plugin_releases')}>
                    <ChevronLeft size={14} /> Releases
                </button>
                <select className={Z.inp} style={{ width: 110 }} value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
                    <option value="7">7 dias</option>
                    <option value="30">30 dias</option>
                    <option value="90">90 dias</option>
                </select>
                <button className={Z.btn2Sm} onClick={reload}><RefreshCw size={14} /></button>
            </PageHeader>

            {loading && <div className="flex justify-center p-8"><Spinner /></div>}

            {!loading && totalInstalls === 0 && (
                <EmptyState icon={Activity} title="Sem dados de telemetria"
                    description={`Nenhum plugin reportou nos últimos ${days} dias.`} />
            )}

            {!loading && totalInstalls > 0 && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
                        <div className="glass-card p-4">
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Installs únicos</div>
                            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{totalInstalls}</div>
                        </div>
                        <div className="glass-card p-4">
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Versões ativas</div>
                            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{byVersion.length}</div>
                        </div>
                        <div className="glass-card p-4">
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>OSes distintos</div>
                            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{byOs.length}</div>
                        </div>
                    </div>

                    <div className="glass-card p-4 mb-4">
                        <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Installs por versão</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <BarChart rows={byVersion} xKey="version" yKey="installs" color="var(--primary)" />
                        </div>
                    </div>

                    <div className="glass-card p-4 mb-4">
                        <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Installs por dia</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <BarChart rows={byDay} xKey="day" yKey="installs" color="var(--accent, #C9A96E)" />
                        </div>
                    </div>

                    <div className="glass-card p-4">
                        <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Installs por OS</h3>
                        <table className="w-full text-sm">
                            <thead><tr><th className={Z.th}>OS</th><th className={Z.th}>Installs</th></tr></thead>
                            <tbody>
                                {byOs.map((r, i) => (
                                    <tr key={i}>
                                        <td>{r.os || '(desconhecido)'}</td>
                                        <td>{r.installs}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
