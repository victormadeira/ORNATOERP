import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../api';
import { Ic, Z, Spinner, PageHeader, EmptyState, ProgressBar as PBarUI } from '../ui';
import { Scissors, Printer, ArrowLeft, ChevronDown, ChevronUp, Search, RefreshCw, RotateCw, Settings, Eye, Package, Layers, BarChart3, AlertTriangle, CheckCircle2, ZoomIn, ZoomOut } from 'lucide-react';

// Cores por ambiente
const AMB_COLORS = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];

const N = (v, d = 2) => (v || 0).toFixed(d);
const R = (v) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PlanoCorte({ notify }) {
    const [step, setStep] = useState('selecao'); // selecao | pecas | resultado
    const [orcamentos, setOrcamentos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    // Selecionado
    const [orcSelecionado, setOrcSelecionado] = useState(null);
    const [pecasData, setPecasData] = useState(null);

    // Configuração
    const [kerf, setKerf] = useState(4);
    const [refilo, setRefilo] = useState(10);
    const [permitirRotacao, setPermitirRotacao] = useState(true);
    const [modo, setModo] = useState('guilhotina');
    const [direcaoCorte, setDirecaoCorte] = useState('auto');
    const [considerarSobra, setConsiderarSobra] = useState(true);
    const [sobraMinW, setSobraMinW] = useState(300);
    const [sobraMinH, setSobraMinH] = useState(600);

    // Resultado
    const [plano, setPlano] = useState(null);
    const [chapaIdx, setChapaIdx] = useState(0);
    const [zoom, setZoom] = useState(0.28);
    const [optimizing, setOptimizing] = useState(false);

    // ── Carregar orçamentos ──
    useEffect(() => {
        setLoading(true);
        api.get('/plano-corte/orcamentos')
            .then(setOrcamentos)
            .catch(e => notify(e.error || 'Erro ao carregar orçamentos'))
            .finally(() => setLoading(false));
    }, []);

    // ── Selecionar orçamento ──
    const selecionarOrc = useCallback(async (orc) => {
        setOrcSelecionado(orc);
        setLoading(true);
        try {
            const data = await api.get(`/plano-corte/orcamento/${orc.id}/pecas`);
            setPecasData(data);
            setStep('pecas');
        } catch (e) {
            notify(e.error || 'Erro ao extrair peças');
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Otimizar ──
    const otimizar = useCallback(async () => {
        if (!orcSelecionado) return;
        setOptimizing(true);
        try {
            const data = await api.post('/plano-corte/otimizar', {
                orcamento_id: orcSelecionado.id,
                config: {
                    kerf, refilo, permitir_rotacao: permitirRotacao, modo,
                    direcao_corte: direcaoCorte, considerar_sobra: considerarSobra,
                    sobra_min_largura: sobraMinW, sobra_min_comprimento: sobraMinH,
                },
            });
            setPlano(data);
            setChapaIdx(0);
            setStep('resultado');
        } catch (e) {
            notify(e.error || 'Erro ao otimizar');
        } finally {
            setOptimizing(false);
        }
    }, [orcSelecionado, kerf, refilo, permitirRotacao, modo, direcaoCorte, considerarSobra, sobraMinW, sobraMinH]);

    // ── Voltar ──
    const voltar = () => {
        if (step === 'resultado') { setStep('pecas'); setPlano(null); }
        else if (step === 'pecas') { setStep('selecao'); setOrcSelecionado(null); setPecasData(null); }
    };

    // ── Mapa de cores por ambiente ──
    const ambColorMap = useMemo(() => {
        if (!plano) return {};
        const map = {};
        let ci = 0;
        for (const ch of plano.plano.chapas) {
            for (const p of ch.pecas) {
                if (p.ambiente && !map[p.ambiente]) {
                    map[p.ambiente] = AMB_COLORS[ci % AMB_COLORS.length];
                    ci++;
                }
            }
        }
        return map;
    }, [plano]);

    // ── Imprimir ──
    const imprimir = useCallback(() => {
        if (!plano) return;
        const orc = plano.orcamento;
        const resumo = plano.resumo;
        const chapas = plano.plano.chapas;

        const chapasSvg = chapas.map((ch, ci) => {
            const scale = 0.22;
            const svgW = ch.comprimento * scale + 20;
            const svgH = ch.largura * scale + 20;

            const pecasSvg = ch.pecas.map((p, pi) => {
                const color = ambColorMap[p.ambiente] || '#94a3b8';
                return `
                    <rect x="${p.x * scale + 10}" y="${p.y * scale + 10}" width="${p.w * scale}" height="${p.h * scale}"
                        fill="${color}22" stroke="${color}" stroke-width="1" />
                    <text x="${p.x * scale + 10 + p.w * scale / 2}" y="${p.y * scale + 10 + p.h * scale / 2}"
                        text-anchor="middle" dominant-baseline="central"
                        font-size="8" fill="#333" font-family="Arial">
                        ${p.nome.length > 18 ? p.nome.slice(0, 16) + '..' : p.nome}
                    </text>
                    <text x="${p.x * scale + 10 + p.w * scale / 2}" y="${p.y * scale + 10 + p.h * scale / 2 + 10}"
                        text-anchor="middle" dominant-baseline="central"
                        font-size="7" fill="#666" font-family="Arial">
                        ${p.w}x${p.h}${p.rotated ? ' R' : ''}
                    </text>`;
            }).join('');

            const retalhosSvg = (ch.retalhos || []).map(r => `
                <rect x="${r.x * scale + 10}" y="${r.y * scale + 10}" width="${r.w * scale}" height="${r.h * scale}"
                    fill="#fef3c7" stroke="#f59e0b" stroke-width="0.5" stroke-dasharray="3 2" />
                <text x="${r.x * scale + 10 + r.w * scale / 2}" y="${r.y * scale + 10 + r.h * scale / 2}"
                    text-anchor="middle" dominant-baseline="central"
                    font-size="7" fill="#b45309" font-family="Arial">${r.w}x${r.h}</text>
            `).join('');

            return `
                <div style="page-break-inside: avoid; margin-bottom: 16px;">
                    <h3 style="margin: 8px 0 4px; font-size: 12px;">Chapa ${ci + 1} — ${ch.material} (${ch.espessura}mm) — ${ch.comprimento}x${ch.largura}mm — Aprov. ${ch.aproveitamento}%</h3>
                    <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
                        <rect x="10" y="10" width="${ch.comprimento * scale}" height="${ch.largura * scale}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1"/>
                        ${ch.refilo > 0 ? `<rect x="${10 + ch.refilo * scale}" y="${10 + ch.refilo * scale}" width="${(ch.comprimento - 2 * ch.refilo) * scale}" height="${(ch.largura - 2 * ch.refilo) * scale}" fill="none" stroke="#ddd" stroke-width="0.5" stroke-dasharray="4 2"/>` : ''}
                        ${pecasSvg}
                        ${retalhosSvg}
                    </svg>
                    <div style="font-size: 10px; color: #666; margin-top: 2px;">
                        ${ch.pecas.length} peças — R$ ${ch.preco?.toFixed(2) || '0.00'}/chapa
                    </div>
                </div>`;
        }).join('');

        // Tabela de peças
        const pecasTable = chapas.flatMap((ch, ci) =>
            ch.pecas.map(p => `<tr>
                <td style="padding:2px 6px;font-size:10px;">${ci + 1}</td>
                <td style="padding:2px 6px;font-size:10px;">${p.nome}</td>
                <td style="padding:2px 6px;font-size:10px;">${p.ambiente}</td>
                <td style="padding:2px 6px;font-size:10px;">${p.modulo}</td>
                <td style="padding:2px 6px;font-size:10px;">${p.w}x${p.h}</td>
                <td style="padding:2px 6px;font-size:10px;">${p.rotated ? 'Sim' : ''}</td>
            </tr>`)
        ).join('');

        const html = `<!DOCTYPE html><html><head><title>Plano de Corte - ORC #${orc.numero}</title>
            <style>body{font-family:Arial,sans-serif;margin:20px;font-size:12px;}
            h2{margin:0 0 4px;font-size:16px;}table{border-collapse:collapse;width:100%;}
            th,td{border:1px solid #ddd;text-align:left;}th{background:#f1f5f9;font-size:10px;padding:3px 6px;}
            @media print{.no-print{display:none}}</style></head>
            <body>
                <h2>Plano de Corte Otimizado</h2>
                <div style="color:#666;margin-bottom:12px;">
                    ORC #${orc.numero} — ${orc.cliente_nome} — ${orc.ambiente || ''}
                    <br/>Total: ${resumo.total_pecas} peças / ${resumo.total_chapas} chapas — Aproveitamento: ${resumo.aproveitamento}% — Custo: R$ ${resumo.custo_chapas.toFixed(2)}
                </div>
                ${chapasSvg}
                <div style="page-break-before: always;">
                    <h3 style="margin: 8px 0 4px; font-size: 13px;">Lista de Peças</h3>
                    <table><thead><tr><th>Chapa</th><th>Peça</th><th>Ambiente</th><th>Módulo</th><th>Dim (mm)</th><th>Rotação</th></tr></thead>
                    <tbody>${pecasTable}</tbody></table>
                </div>
                <div style="margin-top:16px;font-size:9px;color:#999;text-align:center;">Gerado por Ornato ERP</div>
            </body></html>`;

        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        w.onload = () => { w.print(); };
    }, [plano, ambColorMap]);

    // ═══ RENDER ═══

    if (loading && step === 'selecao') {
        return <div className={Z.pg}><Spinner /></div>;
    }

    return (
        <div className={Z.pg}>
            {/* Header */}
            <PageHeader icon={Scissors} title="Plano de Corte" subtitle={
                step === 'selecao' ? 'Selecione um orçamento para gerar o plano de corte otimizado'
                : step === 'pecas' ? `ORC #${orcSelecionado?.numero} — ${orcSelecionado?.cliente_nome}`
                : `ORC #${plano?.orcamento?.numero} — ${plano?.orcamento?.cliente_nome}`
            }>
                {step !== 'selecao' && (
                    <button onClick={voltar} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 12px' }}>
                        <ArrowLeft size={14} /> Voltar
                    </button>
                )}
            </PageHeader>

            {step === 'selecao' && <StepSelecao orcamentos={orcamentos} search={search} setSearch={setSearch} onSelect={selecionarOrc} loading={loading} />}
            {step === 'pecas' && <StepPecas pecasData={pecasData} loading={loading}
                config={{ kerf, refilo, permitirRotacao, modo, direcaoCorte, considerarSobra, sobraMinW, sobraMinH }}
                setConfig={{ setKerf, setRefilo, setPermitirRotacao, setModo, setDirecaoCorte, setConsiderarSobra, setSobraMinW, setSobraMinH }}
                onOtimizar={otimizar} optimizing={optimizing} />}
            {step === 'resultado' && <StepResultado plano={plano} chapaIdx={chapaIdx} setChapaIdx={setChapaIdx}
                zoom={zoom} setZoom={setZoom} ambColorMap={ambColorMap} onImprimir={imprimir} onReotimizar={() => setStep('pecas')} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 1: Seleção de Orçamento
// ═══════════════════════════════════════════════════════
function StepSelecao({ orcamentos, search, setSearch, onSelect, loading }) {
    const filtered = useMemo(() => {
        if (!search) return orcamentos;
        const s = search.toLowerCase();
        return orcamentos.filter(o =>
            (o.numero + '').includes(s) ||
            (o.cliente_nome || '').toLowerCase().includes(s) ||
            (o.ambiente || '').toLowerCase().includes(s)
        );
    }, [orcamentos, search]);

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className={Z.inp} value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por número, cliente ou ambiente..."
                        style={{ paddingLeft: 32, width: '100%' }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} orçamentos</span>
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }} className="table-stagger">
                    <thead>
                        <tr>
                            <th className="th-glass">#</th>
                            <th className="th-glass">Cliente</th>
                            <th className="th-glass">Ambiente</th>
                            <th className="th-glass" style={{ textAlign: 'center' }}>Módulos</th>
                            <th className="th-glass">Status</th>
                            <th className="th-glass">Valor</th>
                            <th className="th-glass" style={{ width: 90 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(o => {
                            const status = o.projeto_status || o.kb_col || '-';
                            return (
                                <tr key={o.id} onClick={() => onSelect(o)} style={{ cursor: 'pointer' }}>
                                    <td className="td-glass" style={{ fontWeight: 600, color: 'var(--primary)' }}>#{o.numero}</td>
                                    <td className="td-glass">{o.cliente_nome}</td>
                                    <td className="td-glass" style={{ color: 'var(--text-muted)' }}>{o.ambiente || '-'}</td>
                                    <td className="td-glass" style={{ textAlign: 'center' }}>
                                        <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600 }}>
                                            {o.n_ambientes} amb / {o.n_modulos} mód
                                        </span>
                                    </td>
                                    <td className="td-glass" style={{ fontSize: 12 }}>{status}</td>
                                    <td className="td-glass" style={{ fontWeight: 600 }}>{o.valor_venda ? R(o.valor_venda) : '-'}</td>
                                    <td className="td-glass">
                                        <button className="btn-primary btn-sm" style={{ fontSize: 11, padding: '4px 12px' }}>Selecionar</button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr><td colSpan={7}>
                                <EmptyState icon={Package} title={loading ? 'Carregando...' : 'Nenhum orçamento com módulos encontrado'} />
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 2: Peças + Configuração
// ═══════════════════════════════════════════════════════
function StepPecas({ pecasData, config, setConfig, onOtimizar, optimizing }) {
    const [showConfig, setShowConfig] = useState(false);

    if (!pecasData) return <Spinner />;

    const { materiais, totalPecas } = pecasData;

    return (
        <div>
            {/* Resumo rápido */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatCard icon={<Layers size={16} />} label="Peças" value={totalPecas} color="var(--primary)" />
                <StatCard icon={<Package size={16} />} label="Materiais" value={materiais.length} color="#22c55e" />
            </div>

            {/* Tabela por material */}
            {materiais.map(mat => (
                <div key={mat.matId} className={Z.card} style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: 'var(--bg-hover)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong style={{ fontSize: 13 }}>{mat.matNome}</strong>
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                                {mat.espessura}mm — Chapa {mat.chapaLarg}x{mat.chapaAlt}mm — {R(mat.preco)}/un
                            </span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{mat.totalPecas} peças</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th className={Z.th} style={{ padding: '5px 10px', fontSize: 10 }}>Peça</th>
                                <th className={Z.th} style={{ padding: '5px 10px', fontSize: 10 }}>Ambiente</th>
                                <th className={Z.th} style={{ padding: '5px 10px', fontSize: 10 }}>Módulo</th>
                                <th className={Z.th} style={{ padding: '5px 10px', fontSize: 10, textAlign: 'center' }}>Dimensões</th>
                                <th className={Z.th} style={{ padding: '5px 10px', fontSize: 10, textAlign: 'center' }}>Qtd</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mat.pecas.slice(0, 30).map((p, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '4px 10px', fontSize: 11 }}>{p.nome}</td>
                                    <td style={{ padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{p.ambiente}</td>
                                    <td style={{ padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{p.modulo}</td>
                                    <td style={{ padding: '4px 10px', fontSize: 11, textAlign: 'center', fontFamily: 'monospace' }}>{p.largura} x {p.altura}</td>
                                    <td style={{ padding: '4px 10px', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>{p.qtd}</td>
                                </tr>
                            ))}
                            {mat.pecas.length > 30 && (
                                <tr><td colSpan={5} style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                                    ... e mais {mat.pecas.length - 30} linhas
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ))}

            {/* Configuração */}
            <div className={Z.card} style={{ marginBottom: 16 }}>
                <button onClick={() => setShowConfig(!showConfig)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)', width: '100%', padding: 0 }}>
                    <Settings size={14} />
                    Configuração de Otimização
                    {showConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showConfig && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
                        <div>
                            <label className={Z.lbl}>Serra (kerf) mm</label>
                            <input type="number" className={Z.inp} value={config.kerf} onChange={e => setConfig.setKerf(+e.target.value)} min={0} max={10} step={0.5} />
                        </div>
                        <div>
                            <label className={Z.lbl}>Refilo (borda) mm</label>
                            <input type="number" className={Z.inp} value={config.refilo} onChange={e => setConfig.setRefilo(+e.target.value)} min={0} max={30} step={1} />
                        </div>
                        <div>
                            <label className={Z.lbl}>Modo de corte</label>
                            <select className={Z.inp} value={config.modo} onChange={e => setConfig.setModo(e.target.value)}>
                                <option value="guilhotina">Guilhotina</option>
                                <option value="maxrects">Livre (MaxRects)</option>
                            </select>
                        </div>
                        <div>
                            <label className={Z.lbl}>Direção</label>
                            <select className={Z.inp} value={config.direcaoCorte} onChange={e => setConfig.setDirecaoCorte(e.target.value)}>
                                <option value="auto">Automático (SLA)</option>
                                <option value="horizontal">Horizontal</option>
                                <option value="vertical">Vertical</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={config.permitirRotacao} onChange={e => setConfig.setPermitirRotacao(e.target.checked)} id="rot" />
                            <label htmlFor="rot" style={{ fontSize: 12 }}>Permitir rotação</label>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={config.considerarSobra} onChange={e => setConfig.setConsiderarSobra(e.target.checked)} id="sobra" />
                            <label htmlFor="sobra" style={{ fontSize: 12 }}>Identificar sobras</label>
                        </div>
                        {config.considerarSobra && <>
                            <div>
                                <label className={Z.lbl}>Sobra mín. largura (mm)</label>
                                <input type="number" className={Z.inp} value={config.sobraMinW} onChange={e => setConfig.setSobraMinW(+e.target.value)} min={100} step={50} />
                            </div>
                            <div>
                                <label className={Z.lbl}>Sobra mín. comprimento (mm)</label>
                                <input type="number" className={Z.inp} value={config.sobraMinH} onChange={e => setConfig.setSobraMinH(+e.target.value)} min={100} step={50} />
                            </div>
                        </>}
                    </div>
                )}
            </div>

            {/* Botão otimizar */}
            <button onClick={onOtimizar} disabled={optimizing} className={Z.btn}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '12px 32px' }}>
                {optimizing ? <><Spinner style={{ width: 16, height: 16 }} /> Otimizando...</> :
                    <><Scissors size={16} /> Gerar Plano de Corte Otimizado</>}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 3: Resultado
// ═══════════════════════════════════════════════════════
function StepResultado({ plano, chapaIdx, setChapaIdx, zoom, setZoom, ambColorMap, onImprimir, onReotimizar }) {
    if (!plano) return null;
    const { resumo, plano: pl } = plano;
    const chapas = pl.chapas || [];
    const chapaAtual = chapas[chapaIdx];

    return (
        <div>
            {/* Resumo geral */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatCard icon={<Layers size={16} />} label="Peças" value={resumo.total_pecas} color="var(--primary)" />
                <StatCard icon={<Package size={16} />} label="Chapas" value={resumo.total_chapas} color="#22c55e" />
                <StatCard icon={<BarChart3 size={16} />} label="Aproveitamento" value={`${resumo.aproveitamento}%`}
                    color={resumo.aproveitamento >= 80 ? '#22c55e' : resumo.aproveitamento >= 60 ? '#f59e0b' : '#ef4444'} />
                <StatCard icon={<Scissors size={16} />} label="Custo Chapas" value={R(resumo.custo_chapas)} color="#8b5cf6" />
                <StatCard icon={<AlertTriangle size={16} />} label="Desperdício" value={`${N(resumo.desperdicio_m2)} m2`} color="#f59e0b" />
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={onImprimir} className={Z.btn2Sm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Printer size={14} /> Imprimir
                </button>
                <button onClick={onReotimizar} className={Z.btn2Sm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={14} /> Re-otimizar
                </button>
            </div>

            {/* Layout: thumbnails + detalhe */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Thumbnails */}
                <div style={{ minWidth: 180, maxWidth: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>CHAPAS ({chapas.length})</div>
                    {chapas.map((ch, ci) => (
                        <button key={ci} onClick={() => setChapaIdx(ci)}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                padding: 8, borderRadius: 8, cursor: 'pointer',
                                border: ci === chapaIdx ? '2px solid var(--primary)' : '1px solid var(--border)',
                                background: ci === chapaIdx ? 'var(--primary-light)' : 'var(--bg)',
                                width: '100%',
                            }}>
                            <ChapaThumb chapa={ch} ambColorMap={ambColorMap} />
                            <div style={{ fontSize: 10, textAlign: 'center' }}>
                                <div style={{ fontWeight: 600 }}>{ch.material}</div>
                                <div style={{ color: 'var(--text-muted)' }}>{ch.pecas.length} pç — {ch.aproveitamento}%</div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Detalhe */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {chapaAtual && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>Chapa {chapaIdx + 1}</span>
                                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                        {chapaAtual.material} — {chapaAtual.comprimento}x{chapaAtual.largura}mm — {chapaAtual.espessura}mm
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <button onClick={() => setZoom(z => Math.max(0.1, z - 0.05))} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}>
                                        <ZoomOut size={14} />
                                    </button>
                                    <span style={{ fontSize: 11, minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                                    <button onClick={() => setZoom(z => Math.min(1, z + 0.05))} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}>
                                        <ZoomIn size={14} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                <span style={{
                                    background: chapaAtual.aproveitamento >= 80 ? '#f0fdf4' : chapaAtual.aproveitamento >= 60 ? '#fffbeb' : '#fef2f2',
                                    color: chapaAtual.aproveitamento >= 80 ? '#16a34a' : chapaAtual.aproveitamento >= 60 ? '#d97706' : '#dc2626',
                                    padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                                }}>
                                    {chapaAtual.aproveitamento}% aproveitamento
                                </span>
                                <span style={{ background: 'var(--bg-hover)', padding: '2px 10px', borderRadius: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                                    {chapaAtual.pecas.length} peças
                                </span>
                                {chapaAtual.retalhos?.length > 0 && (
                                    <span style={{ background: '#fef3c7', padding: '2px 10px', borderRadius: 10, fontSize: 11, color: '#b45309' }}>
                                        {chapaAtual.retalhos.length} sobras
                                    </span>
                                )}
                            </div>

                            <div className={Z.card} style={{ overflow: 'auto', maxHeight: '65vh', padding: 12 }}>
                                <ChapaView chapa={chapaAtual} scale={zoom} ambColorMap={ambColorMap} />
                            </div>

                            {/* Legenda ambientes */}
                            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                {Object.entries(ambColorMap).map(([amb, color]) => (
                                    <div key={amb} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                        <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                                        <span>{amb}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Resumo por material */}
            <div className={Z.card} style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Resumo por Material</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th className={Z.th} style={{ fontSize: 10, padding: '5px 8px' }}>Material</th>
                            <th className={Z.th} style={{ fontSize: 10, padding: '5px 8px', textAlign: 'center' }}>Esp.</th>
                            <th className={Z.th} style={{ fontSize: 10, padding: '5px 8px', textAlign: 'center' }}>Peças</th>
                            <th className={Z.th} style={{ fontSize: 10, padding: '5px 8px', textAlign: 'center' }}>Chapas</th>
                            <th className={Z.th} style={{ fontSize: 10, padding: '5px 8px', textAlign: 'center' }}>Aprov.</th>
                            <th className={Z.th} style={{ fontSize: 10, padding: '5px 8px', textAlign: 'right' }}>Custo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.values(pl.materiais).map((m, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '5px 8px', fontSize: 12, fontWeight: 500 }}>{m.material}</td>
                                <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'center' }}>{m.espessura}mm</td>
                                <td style={{ padding: '5px 8px', fontSize: 12, textAlign: 'center', fontWeight: 600 }}>{m.total_pecas}</td>
                                <td style={{ padding: '5px 8px', fontSize: 12, textAlign: 'center', fontWeight: 600, color: 'var(--primary)' }}>{m.total_chapas}</td>
                                <td style={{ padding: '5px 8px', fontSize: 12, textAlign: 'center', fontWeight: 600,
                                    color: m.aproveitamento >= 80 ? '#16a34a' : m.aproveitamento >= 60 ? '#d97706' : '#dc2626',
                                }}>{N(m.aproveitamento, 1)}%</td>
                                <td style={{ padding: '5px 8px', fontSize: 12, textAlign: 'right', fontWeight: 600 }}>{R(m.custo_total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// SVG: Visualização de Chapa (estático)
// ═══════════════════════════════════════════════════════
function ChapaView({ chapa, scale, ambColorMap }) {
    const { comprimento, largura, refilo, pecas, retalhos, cortes } = chapa;
    const svgW = comprimento * scale;
    const svgH = largura * scale;

    return (
        <svg width={svgW + 4} height={svgH + 4} viewBox={`-2 -2 ${svgW + 4} ${svgH + 4}`}
            style={{ display: 'block' }}>
            {/* Fundo da chapa */}
            <rect x={0} y={0} width={svgW} height={svgH} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} />

            {/* Refilo */}
            {refilo > 0 && (
                <rect x={refilo * scale} y={refilo * scale}
                    width={(comprimento - 2 * refilo) * scale}
                    height={(largura - 2 * refilo) * scale}
                    fill="none" stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="4 2" />
            )}

            {/* Cortes */}
            {(cortes || []).map((c, i) => {
                if (c.dir === 'Horizontal') {
                    return <line key={`c${i}`} x1={0} y1={c.pos * scale} x2={svgW} y2={c.pos * scale}
                        stroke="#cbd5e1" strokeWidth={0.5} strokeDasharray="6 3" />;
                }
                return <line key={`c${i}`} x1={c.pos * scale} y1={0} x2={c.pos * scale} y2={svgH}
                    stroke="#cbd5e1" strokeWidth={0.5} strokeDasharray="6 3" />;
            })}

            {/* Sobras */}
            {(retalhos || []).map((r, i) => (
                <g key={`s${i}`}>
                    <rect x={r.x * scale} y={r.y * scale} width={r.w * scale} height={r.h * scale}
                        fill="#fef3c7" fillOpacity={0.6} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="3 2" />
                    {r.w * scale > 40 && r.h * scale > 16 && (
                        <text x={r.x * scale + r.w * scale / 2} y={r.y * scale + r.h * scale / 2}
                            textAnchor="middle" dominantBaseline="central"
                            fontSize={Math.max(7, Math.min(10, r.w * scale / 8))} fill="#b45309" fontFamily="Arial">
                            {r.w}x{r.h}
                        </text>
                    )}
                </g>
            ))}

            {/* Peças */}
            {pecas.map((p, i) => {
                const color = ambColorMap[p.ambiente] || '#94a3b8';
                const pw = p.w * scale;
                const ph = p.h * scale;
                const minDim = Math.min(pw, ph);
                const showLabel = minDim > 20;
                const showDims = minDim > 30;

                return (
                    <g key={`p${i}`}>
                        <rect x={p.x * scale} y={p.y * scale} width={pw} height={ph}
                            fill={color + '22'} stroke={color} strokeWidth={1} rx={1} />
                        {showLabel && (
                            <text x={p.x * scale + pw / 2} y={p.y * scale + ph / 2 + (showDims ? -5 : 0)}
                                textAnchor="middle" dominantBaseline="central"
                                fontSize={Math.max(7, Math.min(11, pw / 10))} fill="#1e293b" fontFamily="Arial">
                                {p.nome.length > Math.floor(pw / 6) ? p.nome.slice(0, Math.floor(pw / 6) - 1) + '..' : p.nome}
                            </text>
                        )}
                        {showDims && (
                            <text x={p.x * scale + pw / 2} y={p.y * scale + ph / 2 + 8}
                                textAnchor="middle" dominantBaseline="central"
                                fontSize={Math.max(6, Math.min(9, pw / 12))} fill="#64748b" fontFamily="Arial">
                                {p.w}x{p.h}{p.rotated ? ' R' : ''}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

// ═══════════════════════════════════════════════════════
// SVG: Thumbnail de chapa (sidebar)
// ═══════════════════════════════════════════════════════
function ChapaThumb({ chapa, ambColorMap }) {
    const scale = 0.05;
    const w = chapa.comprimento * scale;
    const h = chapa.largura * scale;

    return (
        <svg width={w + 2} height={h + 2} viewBox={`-1 -1 ${w + 2} ${h + 2}`} style={{ display: 'block' }}>
            <rect x={0} y={0} width={w} height={h} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.5} />
            {chapa.pecas.map((p, i) => {
                const color = ambColorMap[p.ambiente] || '#94a3b8';
                return <rect key={i} x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
                    fill={color + '44'} stroke={color} strokeWidth={0.3} />;
            })}
        </svg>
    );
}

// ═══════════════════════════════════════════════════════
// Stat Card
// ═══════════════════════════════════════════════════════
function StatCard({ icon, label, value, color }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 16px', minWidth: 120,
        }}>
            <div style={{ color, opacity: 0.8 }}>{icon}</div>
            <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1.3 }}>{value}</div>
            </div>
        </div>
    );
}
