import { useState, useEffect, useCallback } from 'react';
import { Z, Modal } from '../ui';
import api from '../api';
import { R$, N } from '../engine';
import {
    Layers, Package, Scissors, Ruler, ArrowLeft, ClipboardList,
    AlertTriangle, ShoppingCart, ChevronDown, ChevronRight, Printer, Download
} from 'lucide-react';

// ═══════════════════════════════════════════════════════
// ORDEM DE PRODUÇÃO
// ═══════════════════════════════════════════════════════

const TAB_STYLE = (active) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: 600,
    border: 'none', cursor: 'pointer', borderRadius: 8,
    background: active ? 'var(--primary)' : 'var(--bg-muted)',
    color: active ? '#fff' : 'var(--text-muted)',
    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
});

export default function OrdemProducao({ nav, editProjeto }) {
    const [projetos, setProjetos] = useState([]);
    const [projetoId, setProjetoId] = useState(editProjeto?.id || null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState('corte');
    const [expandedMat, setExpandedMat] = useState({});

    // Carregar lista de projetos
    useEffect(() => {
        api.get('/producao').then(setProjetos).catch(() => {});
    }, []);

    // Carregar dados de produção do projeto selecionado
    const loadProducao = useCallback(async (pid) => {
        if (!pid) return;
        setLoading(true);
        try {
            const d = await api.get(`/producao/${pid}`);
            setData(d);
        } catch (e) {
            console.error('Erro ao carregar produção:', e);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (projetoId) loadProducao(projetoId);
    }, [projetoId, loadProducao]);

    // ── Agrupar peças por material ──
    const pecasPorMaterial = {};
    (data?.pecas || []).forEach(p => {
        const key = p.matId || 'sem_material';
        if (!pecasPorMaterial[key]) pecasPorMaterial[key] = { matNome: p.matNome, esp: p.espessura, pecas: [] };
        pecasPorMaterial[key].pecas.push(p);
    });

    // ── Seletor de Projeto ──
    if (!projetoId) {
        return (
            <div className={Z.pg}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Scissors size={20} color="#fff" />
                    </div>
                    <div>
                        <h1 className={Z.h1} style={{ margin: 0 }}>Ordem de Produção</h1>
                        <p className={Z.sub} style={{ margin: 0 }}>Selecione um projeto para gerar a ordem</p>
                    </div>
                </div>

                {projetos.length === 0 && (
                    <div className={Z.card} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                        <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                        <p>Nenhum projeto encontrado.</p>
                        <p style={{ fontSize: 12 }}>Aprove um orçamento para criar um projeto.</p>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {projetos.map(p => (
                        <div
                            key={p.id}
                            className={Z.card}
                            onClick={() => setProjetoId(p.id)}
                            style={{
                                padding: 16, cursor: 'pointer', transition: 'all 0.15s',
                                borderLeft: `4px solid ${p.status === 'concluido' ? '#22c55e' : p.status === 'em_andamento' ? '#3b82f6' : '#f59e0b'}`,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {p.cliente_nome} — {p.ambiente}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {p.numero} · {p.nome}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>
                                        {R$(p.valor_venda)}
                                    </div>
                                    <span style={{
                                        fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                                        background: p.status === 'concluido' ? '#22c55e20' : p.status === 'em_andamento' ? '#3b82f620' : '#f59e0b20',
                                        color: p.status === 'concluido' ? '#22c55e' : p.status === 'em_andamento' ? '#3b82f6' : '#f59e0b',
                                    }}>
                                        {p.status === 'concluido' ? 'Concluído' : p.status === 'em_andamento' ? 'Em andamento' : 'Não iniciado'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Loading ──
    if (loading || !data) {
        return (
            <div className={Z.pg} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ width: 32, height: 32, border: '3px solid #ddd', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        );
    }

    const { projeto, resumo, chapas, ferragens, fita, bom, pecas } = data;

    return (
        <div className={Z.pg}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => setProjetoId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Scissors size={20} color="#fff" />
                    </div>
                    <div>
                        <h1 className={Z.h1} style={{ margin: 0, fontSize: 18 }}>
                            Ordem de Produção
                        </h1>
                        <p className={Z.sub} style={{ margin: 0 }}>
                            {projeto.cliente_nome} — {projeto.orc_ambiente} · {projeto.orc_numero}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => window.print()}
                    className={Z.btn}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                    <Printer size={14} /> Imprimir
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                    { label: 'Peças', value: resumo.total_pecas, icon: <Layers size={16} />, color: '#3b82f6' },
                    { label: 'Chapas', value: resumo.total_chapas, icon: <Package size={16} />, color: '#22c55e' },
                    { label: 'Ferragens', value: resumo.total_ferragens, icon: <ClipboardList size={16} />, color: '#f59e0b' },
                    { label: 'Fita (m)', value: N(resumo.total_fita_m, 1), icon: <Ruler size={16} />, color: '#8b5cf6' },
                    { label: 'Custo Material', value: R$(resumo.custo_total), icon: <ShoppingCart size={16} />, color: '#ef4444' },
                ].map(kpi => (
                    <div key={kpi.label} className={Z.card} style={{ padding: 14, textAlign: 'center' }}>
                        <div style={{ color: kpi.color, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{kpi.icon}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{kpi.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{kpi.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                    { id: 'corte', label: 'Lista de Corte', icon: <Scissors size={14} /> },
                    { id: 'chapas', label: 'Chapas', icon: <Package size={14} /> },
                    { id: 'ferragens', label: 'Ferragens', icon: <ClipboardList size={14} /> },
                    { id: 'bom', label: 'Lista de Compras', icon: <ShoppingCart size={14} /> },
                ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={TAB_STYLE(tab === t.id)}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* ═══ Tab: Lista de Corte ═══ */}
            {tab === 'corte' && (
                <div>
                    {Object.entries(pecasPorMaterial).length === 0 && (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <Scissors size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p>Nenhuma peça encontrada.</p>
                            <p style={{ fontSize: 12 }}>Verifique se o orçamento possui módulos com templates configurados.</p>
                        </div>
                    )}

                    {Object.entries(pecasPorMaterial).map(([matId, group]) => {
                        const isExpanded = expandedMat[matId] !== false;
                        return (
                            <div key={matId} className={Z.card} style={{ marginBottom: 12, overflow: 'hidden' }}>
                                <div
                                    onClick={() => setExpandedMat(prev => ({ ...prev, [matId]: !isExpanded }))}
                                    style={{
                                        padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        background: 'var(--bg-muted)', borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {group.matNome}
                                        </span>
                                        {group.esp > 0 && (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({group.esp}mm)</span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                                        {group.pecas.length} peça(s)
                                    </span>
                                </div>

                                {isExpanded && (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                            <thead>
                                                <tr style={{ background: 'var(--bg-muted)' }}>
                                                    <th style={thStyle}>Peça</th>
                                                    <th style={thStyle}>Ambiente</th>
                                                    <th style={thStyle}>Módulo</th>
                                                    <th style={{ ...thStyle, textAlign: 'right' }}>Largura</th>
                                                    <th style={{ ...thStyle, textAlign: 'right' }}>Altura</th>
                                                    <th style={{ ...thStyle, textAlign: 'right' }}>Qtd</th>
                                                    <th style={{ ...thStyle, textAlign: 'right' }}>Fita (m)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.pecas.map((p, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={tdStyle}>
                                                            {p.nome}
                                                            {p.aditivo && <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 4 }}>({p.aditivo})</span>}
                                                        </td>
                                                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{p.ambiente}</td>
                                                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{p.modulo}</td>
                                                        <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{p.largura} mm</td>
                                                        <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{p.altura} mm</td>
                                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{p.qtd}</td>
                                                        <td style={{ ...tdStyle, textAlign: 'right' }}>{N(p.fita, 2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══ Tab: Chapas ═══ */}
            {tab === 'chapas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {chapas.map(c => (
                        <div key={c.id} className={Z.card} style={{ padding: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.nome}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {c.esp}mm · {c.larg}×{c.alt}mm · Perda: {c.perda_pct}%
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>{c.qtdChapas}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>chapa(s)</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Área peças: </span>
                                    <span style={{ fontWeight: 600 }}>{N(c.areaPecas, 3)} m²</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Área útil/chapa: </span>
                                    <span style={{ fontWeight: 600 }}>{N(c.areaUtil, 3)} m²</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Custo: </span>
                                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{R$(c.qtdChapas * c.preco)}</span>
                                </div>
                            </div>
                            {/* Barra de uso */}
                            <div style={{ marginTop: 8 }}>
                                <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-muted)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', borderRadius: 3,
                                        width: `${Math.min(100, (c.areaPecas / (c.areaUtil * c.qtdChapas)) * 100)}%`,
                                        background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                                    }} />
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: 'right' }}>
                                    Aproveitamento: {N((c.areaPecas / (c.areaUtil * c.qtdChapas)) * 100, 1)}%
                                </div>
                            </div>
                        </div>
                    ))}

                    {chapas.length === 0 && (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <Package size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p>Nenhuma chapa calculada.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Tab: Ferragens ═══ */}
            {tab === 'ferragens' && (
                <div>
                    {ferragens.length === 0 && (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <ClipboardList size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p>Nenhuma ferragem encontrada.</p>
                        </div>
                    )}

                    <div style={{ overflowX: 'auto' }}>
                        {ferragens.length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-muted)' }}>
                                        <th style={thStyle}>Ferragem</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Qtd</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Unidade</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Preço Unit.</th>
                                        <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                                        <th style={thStyle}>Origem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ferragens.map((f, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ ...tdStyle, fontWeight: 600 }}>{f.nome}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>{f.qtd}</td>
                                            <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>{f.un}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>{R$(f.preco)}</td>
                                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{R$(f.qtd * f.preco)}</td>
                                            <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {[...new Set(f.orig || [])].join(', ')}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr style={{ background: 'var(--bg-muted)', fontWeight: 700 }}>
                                        <td style={tdStyle}>TOTAL</td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>{ferragens.reduce((s, f) => s + f.qtd, 0)}</td>
                                        <td colSpan={2} />
                                        <td style={{ ...tdStyle, textAlign: 'right', color: '#ef4444' }}>
                                            {R$(ferragens.reduce((s, f) => s + f.qtd * f.preco, 0))}
                                        </td>
                                        <td />
                                    </tr>
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ Tab: Lista de Compras (BOM) ═══ */}
            {tab === 'bom' && (
                <div>
                    {bom.length === 0 && (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <ShoppingCart size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                            <p>Nenhum item na lista de compras.</p>
                        </div>
                    )}

                    {/* Itens que precisam comprar */}
                    {bom.filter(b => b.comprar > 0).length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={14} /> Itens a Comprar
                            </h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ background: '#fef2f2' }}>
                                            <th style={thStyle}>Item</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>Tipo</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>Necessário</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>Em Estoque</th>
                                            <th style={{ ...thStyle, textAlign: 'center', color: '#ef4444' }}>Comprar</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Custo Est.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bom.filter(b => b.comprar > 0).map((b, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ ...tdStyle, fontWeight: 600 }}>{b.nome}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 700,
                                                        background: b.tipo === 'chapa' ? '#3b82f620' : b.tipo === 'ferragem' ? '#f59e0b20' : '#8b5cf620',
                                                        color: b.tipo === 'chapa' ? '#3b82f6' : b.tipo === 'ferragem' ? '#f59e0b' : '#8b5cf6',
                                                    }}>
                                                        {b.tipo}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>{b.necessario} {b.un}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center', color: b.em_estoque > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                                                    {b.em_estoque} {b.un}
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#ef4444', fontSize: 15 }}>
                                                    {b.comprar} {b.un}
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                                                    {R$(b.comprar * b.custo_unitario)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Todos os itens */}
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ClipboardList size={14} /> BOM Completo
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-muted)' }}>
                                    <th style={thStyle}>Item</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Tipo</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Necessário</th>
                                    <th style={{ ...thStyle, textAlign: 'center' }}>Estoque</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Preço Unit.</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bom.map((b, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: b.comprar > 0 ? '#fef2f208' : 'transparent' }}>
                                        <td style={{ ...tdStyle, fontWeight: 600 }}>{b.nome}</td>
                                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                                            <span style={{
                                                fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 700,
                                                background: b.tipo === 'chapa' ? '#3b82f620' : b.tipo === 'ferragem' ? '#f59e0b20' : '#8b5cf620',
                                                color: b.tipo === 'chapa' ? '#3b82f6' : b.tipo === 'ferragem' ? '#f59e0b' : '#8b5cf6',
                                            }}>
                                                {b.tipo}
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{b.necessario} {b.un}</td>
                                        <td style={{
                                            ...tdStyle, textAlign: 'center', fontWeight: 600,
                                            color: b.em_estoque >= b.necessario ? '#22c55e' : b.em_estoque > 0 ? '#f59e0b' : '#ef4444',
                                        }}>
                                            {b.em_estoque} {b.un}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>{R$(b.custo_unitario)}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{R$(b.custo_total)}</td>
                                    </tr>
                                ))}
                                <tr style={{ background: 'var(--bg-muted)', fontWeight: 700 }}>
                                    <td colSpan={5} style={tdStyle}>CUSTO TOTAL MATERIAIS</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', color: '#ef4444', fontSize: 15 }}>
                                        {R$(resumo.custo_total)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

const thStyle = { padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 12px', whiteSpace: 'nowrap' };
