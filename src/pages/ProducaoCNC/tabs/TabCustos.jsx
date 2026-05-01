// Tab "Custos" — análise financeira industrial do plano de corte.
// Mostra custo de material, desperdício (R$), usinagem, bordas e
// estimativa de tempo de corte por chapa.

import { useState, useEffect, useCallback } from 'react';
import api from '../../../api';
import { SectionHeader, EmptyState, Spinner } from '../../../ui';
import {
    DollarSign, Clock, TrendingDown, RefreshCw,
    ChevronDown, ChevronUp, AlertTriangle, Package,
    Layers, Scissors, BarChart3, Download,
} from 'lucide-react';

const fmt = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
const fmtMin = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

function KpiCard({ icon: Icon, label, value, sub, color, danger }) {
    return (
        <div style={{
            flex: 1, minWidth: 160,
            padding: '14px 16px',
            borderRadius: 10,
            background: danger ? 'rgba(239,68,68,0.07)' : 'var(--bg-elevated)',
            border: `1px solid ${danger ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: 12,
        }}>
            <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: `${color || 'var(--primary)'}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={18} color={color || 'var(--primary)'} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: 2 }}>
                    {label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
                    {value}
                </div>
                {sub && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>
                )}
            </div>
        </div>
    );
}

function ChapaRow({ ch, time, expanded, onToggle }) {
    const aprov = ch.aproveitamento || 0;
    const aprovColor = aprov >= 80 ? 'var(--success)' : aprov >= 60 ? 'var(--warning)' : 'var(--danger)';

    return (
        <div style={{
            border: '1px solid var(--border)', borderRadius: 8,
            overflow: 'hidden', background: 'var(--bg-elevated)',
        }}>
            {/* Cabeçalho da chapa */}
            <div
                onClick={onToggle}
                style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer',
                    background: expanded ? 'var(--bg-muted)' : undefined,
                    transition: 'background .15s',
                }}
            >
                <div style={{
                    fontSize: 11, fontWeight: 800, color: 'var(--text-muted)',
                    minWidth: 28, textAlign: 'right',
                }}>
                    #{ch.chapaIdx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, truncate: true }}>{ch.material}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ch.total_pecas} peças</div>
                </div>

                {/* Aproveitamento */}
                <div style={{ textAlign: 'right', minWidth: 52 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: aprovColor }}>{fmtPct(aprov)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>aprov.</div>
                </div>

                {/* Custo material */}
                <div style={{ textAlign: 'right', minWidth: 72 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(ch.custo_material)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>material</div>
                </div>

                {/* Desperdício */}
                <div style={{ textAlign: 'right', minWidth: 70 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: ch.custo_desperdicio > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {fmt(ch.custo_desperdicio)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>desperd.</div>
                </div>

                {/* Tempo */}
                {time && (
                    <div style={{ textAlign: 'right', minWidth: 64 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtMin(time.tempo_estimado_min)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{time.metros_corte}m corte</div>
                    </div>
                )}

                {/* Total */}
                <div style={{ textAlign: 'right', minWidth: 80 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{fmt(ch.custo_total)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>total</div>
                </div>

                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>

            {/* Detalhes expandidos */}
            {expanded && (
                <div style={{ padding: '0 14px 14px' }}>
                    {/* Barra de composição de custo */}
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Composição do custo</div>
                        <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 2 }}>
                            {ch.custo_total > 0 && [
                                { v: ch.custo_material, c: 'var(--primary)', l: 'Material' },
                                { v: ch.custo_desperdicio, c: 'var(--danger)', l: 'Desperdício' },
                                { v: ch.custo_usinagem, c: '#f59e0b', l: 'Usinagem' },
                                { v: ch.custo_bordas, c: '#22c55e', l: 'Bordas' },
                                { v: ch.custo_trocas || 0, c: '#8b5cf6', l: 'Trocas' },
                            ].map(({ v, c, l }) => v > 0 ? (
                                <div key={l} title={`${l}: ${fmt(v)}`} style={{
                                    height: '100%', borderRadius: 2,
                                    width: `${(v / ch.custo_total * 100)}%`,
                                    background: c,
                                }} />
                            ) : null)}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                            {[
                                { v: ch.custo_material, c: 'var(--primary)', l: 'Material' },
                                { v: ch.custo_desperdicio, c: 'var(--danger)', l: 'Desperdício' },
                                { v: ch.custo_usinagem, c: '#f59e0b', l: 'Usinagem' },
                                { v: ch.custo_bordas, c: '#22c55e', l: 'Bordas' },
                                { v: ch.custo_trocas || 0, c: '#8b5cf6', l: ch.trocas_ferramenta ? `Trocas (${ch.trocas_ferramenta}×)` : 'Trocas' },
                            ].filter(({ v }) => v > 0).map(({ v, c, l }) => (
                                <span key={l} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />
                                    {l}: <b>{fmt(v)}</b>
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Tabela de peças */}
                    {ch.pecas?.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                    <tr>
                                        {['Peça', 'Material', 'Usinagem', 'Bordas', 'Total'].map(h => (
                                            <th key={h} className="th-glass" style={{ fontSize: 10, padding: '4px 8px' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ch.pecas.map((p, i) => (
                                        <tr key={i}>
                                            <td className="td-glass" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                {p.desc}
                                            </td>
                                            <td className="td-glass" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.custo_material)}</td>
                                            <td className="td-glass" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.custo_usinagem > 0 ? '#f59e0b' : undefined }}>{fmt(p.custo_usinagem)}</td>
                                            <td className="td-glass" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.custo_bordas > 0 ? '#22c55e' : undefined }}>{fmt(p.custo_bordas)}</td>
                                            <td className="td-glass" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(p.custo_total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Timing por chapa */}
                    {time && (
                        <div style={{
                            marginTop: 10, padding: '8px 12px', borderRadius: 6,
                            background: 'var(--bg-muted)', border: '1px solid var(--border)',
                            display: 'flex', gap: 16, flexWrap: 'wrap',
                        }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                ⏱ Tempo estimado: <b style={{ color: 'var(--text-primary)' }}>{fmtMin(time.tempo_estimado_min)}</b>
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                ✂ Corte: <b>{time.metros_corte}m lineares</b>
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                ⚙ Usinagem: <b>{time.metros_usinagem}m</b>
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Exportar análise de custos para CSV (uso industrial)
function exportCustosCSV(custos, loteNome) {
    const rows = [['Chapa', 'Peça', 'Material (R$)', 'Usinagem (R$)', 'Bordas (R$)', 'Total (R$)']];
    for (const ch of (custos.chapas || [])) {
        // Linha da chapa
        rows.push([
            `Chapa ${ch.chapaIdx + 1} — ${ch.material}`,
            `${ch.total_pecas || ''} peças`,
            ch.custo_material.toFixed(2),
            ch.custo_usinagem.toFixed(2),
            ch.custo_bordas.toFixed(2),
            ch.custo_total.toFixed(2),
        ]);
        // Linhas das peças
        for (const p of (ch.pecas || [])) {
            rows.push([
                `Chapa ${ch.chapaIdx + 1}`,
                p.desc,
                p.custo_material.toFixed(2),
                p.custo_usinagem.toFixed(2),
                p.custo_bordas.toFixed(2),
                p.custo_total.toFixed(2),
            ]);
        }
    }
    rows.push([]);
    rows.push(['TOTAL', '', '', '', '', custos.total_geral.toFixed(2)]);

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM para Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custos_${(loteNome || 'lote').replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function TabCustos({ loteAtual, notify }) {
    const [custos, setCustos] = useState(null);
    const [tempo, setTempo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expandedChapas, setExpandedChapas] = useState(new Set([0]));

    const load = useCallback(async () => {
        if (!loteAtual?.id) return;
        setLoading(true);
        try {
            const [c, t] = await Promise.all([
                api.get(`/cnc/custos/${loteAtual.id}`),
                api.get(`/cnc/tempo-corte/${loteAtual.id}`).catch(() => null),
            ]);
            setCustos(c);
            setTempo(t);
        } catch (err) {
            notify('Erro ao carregar análise de custos: ' + (err.message || ''), 'error');
        } finally {
            setLoading(false);
        }
    }, [loteAtual?.id, notify]);

    useEffect(() => { load(); }, [load]);

    const toggleChapa = (idx) => {
        setExpandedChapas(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    if (!loteAtual) {
        return (
            <EmptyState icon={DollarSign} title="Nenhum lote selecionado" description="Selecione um lote para ver a análise de custos." />
        );
    }

    if (loading) {
        return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={24} /></div>;
    }

    if (!custos) return null;

    const totalDesperdicio = (custos.chapas || []).reduce((s, c) => s + (c.custo_desperdicio || 0), 0);
    const totalUsinagem = (custos.chapas || []).reduce((s, c) => s + (c.custo_usinagem || 0), 0);
    const totalBordas = (custos.chapas || []).reduce((s, c) => s + (c.custo_bordas || 0), 0);
    const totalMaterial = (custos.chapas || []).reduce((s, c) => s + (c.custo_material || 0), 0);
    const pctDesperdicio = custos.total_geral > 0 ? (totalDesperdicio / custos.total_geral * 100) : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={DollarSign} title="Análise de Custos Industrial" accent="var(--primary)">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {tempo?.maquina && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                ⚙ {tempo.maquina}
                            </span>
                        )}
                        <button
                            onClick={() => exportCustosCSV(custos, loteAtual?.nome)}
                            className="btn-secondary btn-sm"
                            style={{ fontSize: 12, gap: 6 }}
                            title="Exportar análise de custos para CSV (compatível com Excel)"
                        >
                            <Download size={13} />
                            CSV
                        </button>
                        <button
                            onClick={load}
                            className="btn-secondary btn-sm"
                            style={{ fontSize: 12, gap: 6 }}
                        >
                            <RefreshCw size={13} />
                            Atualizar
                        </button>
                    </div>
                </SectionHeader>

                {/* KPI cards */}
                <div style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <KpiCard
                        icon={DollarSign}
                        label="Custo Total"
                        value={fmt(custos.total_geral)}
                        sub={`${(custos.chapas || []).length} chapa(s)`}
                        color="var(--primary)"
                    />
                    <KpiCard
                        icon={Package}
                        label="Material"
                        value={fmt(totalMaterial)}
                        sub="Proporc. à área ocupada"
                        color="#6366f1"
                    />
                    <KpiCard
                        icon={TrendingDown}
                        label="Desperdício"
                        value={fmt(totalDesperdicio)}
                        sub={`${fmtPct(pctDesperdicio)} do custo total`}
                        color="var(--danger)"
                        danger={pctDesperdicio > 25}
                    />
                    {totalUsinagem > 0 && (
                        <KpiCard
                            icon={Layers}
                            label="Usinagem"
                            value={fmt(totalUsinagem)}
                            sub={`à R$${custos.config?.custo_hora_maquina}/h`}
                            color="#f59e0b"
                        />
                    )}
                    {totalBordas > 0 && (
                        <KpiCard
                            icon={Scissors}
                            label="Fita de Borda"
                            value={fmt(totalBordas)}
                            sub={custos.config?.custo_borda_linear ? `R$ ${custos.config.custo_borda_linear.toFixed(2).replace('.', ',')}/m` : 'metros lineares'}
                            color="#22c55e"
                        />
                    )}
                    {tempo && (
                        <KpiCard
                            icon={Clock}
                            label="Tempo Estimado"
                            value={fmtMin(tempo.tempo_total_min)}
                            sub={`${tempo.total_metros_corte}m lineares`}
                            color="#8b5cf6"
                        />
                    )}
                </div>

                {/* Alerta de desperdício alto */}
                {pctDesperdicio > 25 && (
                    <div style={{
                        margin: '0 16px 16px', padding: '10px 14px',
                        borderRadius: 8, background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: 12,
                    }}>
                        <AlertTriangle size={15} color="var(--danger)" />
                        <span>
                            <b>Desperdício elevado ({fmtPct(pctDesperdicio)}).</b> Reotimize o plano ou verifique se há retalhos disponíveis para reduzir o custo.
                        </span>
                    </div>
                )}

                {/* Velocidades usadas */}
                {tempo && (
                    <div style={{
                        margin: '0 16px 16px', padding: '8px 12px',
                        borderRadius: 6, background: 'var(--bg-muted)',
                        border: '1px solid var(--border)',
                        fontSize: 11, color: 'var(--text-muted)',
                        display: 'flex', gap: 16, flexWrap: 'wrap',
                    }}>
                        <span>✂ Velocidade corte: <b>{tempo.config.velocidade_corte} mm/min</b></span>
                        <span>⚙ Velocidade usinagem: <b>{tempo.config.velocidade_usinagem} mm/min</b></span>
                        <span>⏱ Setup/chapa: <b>{tempo.config.tempo_setup_chapa} min</b></span>
                    </div>
                )}
            </div>

            {/* Lista de chapas */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={BarChart3} title="Detalhamento por Chapa" accent="#6366f1" />
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(custos.chapas || []).map((ch) => (
                        <ChapaRow
                            key={ch.chapaIdx}
                            ch={ch}
                            time={tempo?.chapas?.find(t => t.chapaIdx === ch.chapaIdx)}
                            expanded={expandedChapas.has(ch.chapaIdx)}
                            onToggle={() => toggleChapa(ch.chapaIdx)}
                        />
                    ))}
                    {!custos.chapas?.length && (
                        <EmptyState icon={Package} title="Nenhuma chapa no plano" description="Otimize o corte primeiro." />
                    )}
                </div>
            </div>

            {/* Nota de rodapé */}
            <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                * Custos de material proporcionais à área da peça vs. chapa. Desperdício = área não ocupada × preço/m².
                Tempo baseado na velocidade de avanço da máquina padrão + setup configurado.
            </p>
        </div>
    );
}
