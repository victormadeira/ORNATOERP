import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../api';
import { Ic, Z, Spinner, PageHeader, EmptyState, ProgressBar as PBarUI } from '../ui';
import { Scissors, Printer, ArrowLeft, ChevronDown, ChevronUp, Search, RefreshCw, RotateCw, Settings, Eye, Package, Layers, BarChart3, AlertTriangle, CheckCircle2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Grid3X3, XCircle } from 'lucide-react';

// Presets de material para configuração rápida
const MATERIAL_PRESETS = {
    'mdf_15': { label: 'MDF 15mm', kerf: 4, refilo: 10, sobra_min_w: 150, sobra_min_h: 150 },
    'mdf_18': { label: 'MDF 18mm', kerf: 4, refilo: 10, sobra_min_w: 150, sobra_min_h: 150 },
    'mdf_25': { label: 'MDF 25mm', kerf: 4.5, refilo: 12, sobra_min_w: 180, sobra_min_h: 180 },
    'comp_15': { label: 'Compensado 15mm', kerf: 3.5, refilo: 8, sobra_min_w: 120, sobra_min_h: 120 },
    'vidro': { label: 'Vidro Temperado', kerf: 3, refilo: 15, sobra_min_w: 200, sobra_min_h: 200 },
    'mdf_cru': { label: 'MDF Cru', kerf: 4, refilo: 10, sobra_min_w: 150, sobra_min_h: 150 },
    'custom': { label: 'Personalizado' },
};

// Cores por ambiente (mais vibrantes e distintas)
const AMB_COLORS = [
    'var(--info)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--info)',
    '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
    '#84cc16', '#a855f7', '#0ea5e9', '#f43f5e', '#d946ef',
];

// Cores de fundo para chapas baseado no tipo de material
const MAT_BG_COLORS = {
    // MDF - tons amadeirados
    mdf: { bg: '#F5E6D3', stroke: '#C4A882' },
    // MDP - tons mais claros
    mdp: { bg: '#F0E4D0', stroke: '#D4BC9A' },
    // BP Branco - branco real
    'bp branco': { bg: '#FAFAFA', stroke: '#D0D0D0' },
    'bp_branco': { bg: '#FAFAFA', stroke: '#D0D0D0' },
    branco: { bg: '#FAFAFA', stroke: '#D0D0D0' },
    white: { bg: '#FAFAFA', stroke: '#D0D0D0' },
    // BP cores
    'bp cinza': { bg: '#E8E8E8', stroke: '#AAAAAA' },
    cinza: { bg: '#E8E8E8', stroke: '#AAAAAA' },
    grafite: { bg: '#9E9E9E', stroke: '#666666' },
    preto: { bg: '#4A4A4A', stroke: '#2A2A2A' },
    black: { bg: '#4A4A4A', stroke: '#2A2A2A' },
    // Madeirados
    freijo: { bg: '#D4A76A', stroke: '#A07840' },
    carvalho: { bg: '#C9A368', stroke: '#96733C' },
    nogal: { bg: '#A07040', stroke: '#6E4C2C' },
    nogueira: { bg: '#A07040', stroke: '#6E4C2C' },
    amendoa: { bg: '#D4B896', stroke: '#B09070' },
    canela: { bg: '#C49A6C', stroke: '#9A7048' },
    teca: { bg: '#C8A060', stroke: '#A08040' },
    imbuia: { bg: '#7A5230', stroke: '#5A3820' },
    cedro: { bg: '#C08050', stroke: '#906038' },
    rustico: { bg: '#B8956A', stroke: '#907040' },
    demolicao: { bg: '#A08060', stroke: '#705840' },
    // Lacados
    laca: { bg: '#F0F0F0', stroke: '#CCCCCC' },
    // Composto
    comp: { bg: '#F5E0C0', stroke: '#D4B890' },
    // Fallback
    _default: { bg: '#F5E6D3', stroke: '#C4A882' },
};

// Cores para fitas de borda (cada tipo de fita ganha uma cor distinta)
const FITA_COLORS = [
    'var(--info-hover)', // azul
    'var(--danger-hover)', // vermelho
    'var(--success-hover)', // verde
    'var(--warning-hover)', // amber
    'var(--info)', // violeta
    '#db2777', // pink
    '#0891b2', // cyan
    '#ea580c', // laranja
    '#4f46e5', // indigo
    '#059669', // esmeralda
];

function getMatBg(materialName) {
    if (!materialName) return MAT_BG_COLORS._default;
    const name = materialName.toLowerCase().trim();
    // Tentar match exato primeiro
    if (MAT_BG_COLORS[name]) return MAT_BG_COLORS[name];
    // Tentar match parcial
    for (const [key, val] of Object.entries(MAT_BG_COLORS)) {
        if (key !== '_default' && name.includes(key)) return val;
    }
    return MAT_BG_COLORS._default;
}

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
    const [preset, setPreset] = useState('custom');

    // Resultado
    const [plano, setPlano] = useState(null);
    const [chapaIdx, setChapaIdx] = useState(0);
    const [zoom, setZoom] = useState(0.28);
    const [optimizing, setOptimizing] = useState(false);
    const abortRef = useRef(null);

    // ── Aplicar preset de material ──
    const applyPreset = useCallback((key) => {
        setPreset(key);
        const p = MATERIAL_PRESETS[key];
        if (p && key !== 'custom') {
            setKerf(p.kerf);
            setRefilo(p.refilo);
            setSobraMinW(p.sobra_min_w);
            setSobraMinH(p.sobra_min_h);
        }
    }, []);

    // ── Handler para mudança manual de campo (auto-switch para Personalizado) ──
    const manualSet = useCallback((setter) => (val) => {
        setter(val);
        setPreset('custom');
    }, []);

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
        const controller = new AbortController();
        abortRef.current = controller;
        setOptimizing(true);
        try {
            const data = await api.post('/plano-corte/otimizar', {
                orcamento_id: orcSelecionado.id,
                config: {
                    kerf, refilo, permitir_rotacao: permitirRotacao, modo,
                    direcao_corte: direcaoCorte, considerar_sobra: considerarSobra,
                    sobra_min_largura: sobraMinW, sobra_min_comprimento: sobraMinH,
                },
            }, { signal: controller.signal });
            setPlano(data);
            setChapaIdx(0);
            setStep('resultado');
        } catch (e) {
            if (e.name === 'AbortError' || controller.signal.aborted) {
                notify('Otimização cancelada');
            } else {
                const msg = e.error || e.message || String(e);
                console.error('Otimizar erro:', e);
                notify(`Erro ao otimizar: ${msg.includes('Load failed') || msg.includes('Failed to fetch') ? 'Servidor não respondeu. Verifique se o deploy foi feito.' : msg}`);
            }
        } finally {
            setOptimizing(false);
            abortRef.current = null;
        }
    }, [orcSelecionado, kerf, refilo, permitirRotacao, modo, direcaoCorte, considerarSobra, sobraMinW, sobraMinH]);

    // ── Cancelar otimização ──
    const cancelarOtimizacao = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
    }, []);

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
            const matBg = getMatBg(ch.material);

            const pecasSvg = ch.pecas.map((p, pi) => {
                const color = ambColorMap[p.ambiente] || 'var(--muted)';
                return `
                    <rect x="${p.x * scale + 10}" y="${p.y * scale + 10}" width="${p.w * scale}" height="${p.h * scale}"
                        fill="${color}30" stroke="${color}" stroke-width="1" />
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
                        <rect x="10" y="10" width="${ch.comprimento * scale}" height="${ch.largura * scale}" fill="${matBg.bg}" stroke="${matBg.stroke}" stroke-width="1.5" rx="2"/>
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
                config={{ kerf, refilo, permitirRotacao, modo, direcaoCorte, considerarSobra, sobraMinW, sobraMinH, preset }}
                setConfig={{ setKerf: manualSet(setKerf), setRefilo: manualSet(setRefilo), setPermitirRotacao: manualSet(setPermitirRotacao), setModo: manualSet(setModo), setDirecaoCorte: manualSet(setDirecaoCorte), setConsiderarSobra: manualSet(setConsiderarSobra), setSobraMinW: manualSet(setSobraMinW), setSobraMinH: manualSet(setSobraMinH) }}
                applyPreset={applyPreset}
                onOtimizar={otimizar} onCancelar={cancelarOtimizacao} optimizing={optimizing} />}
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
function StepPecas({ pecasData, config, setConfig, applyPreset, onOtimizar, onCancelar, optimizing }) {
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
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className={Z.lbl}>Preset de Material</label>
                            <select className={Z.inp} value={config.preset} onChange={e => applyPreset(e.target.value)}
                                style={{ maxWidth: 280 }}>
                                {Object.entries(MATERIAL_PRESETS).map(([key, p]) => (
                                    <option key={key} value={key}>{p.label}</option>
                                ))}
                            </select>
                        </div>
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

            {/* Botão otimizar + cancelar */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={onOtimizar} disabled={optimizing} className={Z.btn}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '12px 32px' }}>
                    {optimizing ? <><Spinner style={{ width: 16, height: 16 }} /> Otimizando...</> :
                        <><Scissors size={16} /> Gerar Plano de Corte Otimizado</>}
                </button>
                {optimizing && (
                    <button onClick={onCancelar} className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '10px 20px', color: 'var(--danger-hover)', borderColor: 'var(--danger-hover)' }}>
                        <XCircle size={16} /> Cancelar
                    </button>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// STEP 3: Resultado (redesenhado - navegação compacta)
// ═══════════════════════════════════════════════════════
function StepResultado({ plano, chapaIdx, setChapaIdx, zoom, setZoom, ambColorMap, onImprimir, onReotimizar }) {
    const [matFilter, setMatFilter] = useState('all');
    const [showGrid, setShowGrid] = useState(false);

    if (!plano) return null;
    const { resumo, plano: pl } = plano;
    const chapas = pl.chapas || [];
    const chapaAtual = chapas[chapaIdx];

    // Agrupar chapas por material para navegação inteligente
    const matGroups = useMemo(() => {
        const groups = {};
        chapas.forEach((ch, idx) => {
            const key = ch.material_code || ch.material;
            if (!groups[key]) groups[key] = { nome: ch.material, espessura: ch.espessura, chapas: [], indices: [] };
            groups[key].chapas.push(ch);
            groups[key].indices.push(idx);
        });
        return groups;
    }, [chapas]);

    // Chapas filtradas pelo material selecionado
    const filteredIndices = useMemo(() => {
        if (matFilter === 'all') return chapas.map((_, i) => i);
        return matGroups[matFilter]?.indices || [];
    }, [matFilter, matGroups, chapas]);

    const currentPosInFilter = filteredIndices.indexOf(chapaIdx);
    const canPrev = currentPosInFilter > 0;
    const canNext = currentPosInFilter < filteredIndices.length - 1;
    const goPrev = () => canPrev && setChapaIdx(filteredIndices[currentPosInFilter - 1]);
    const goNext = () => canNext && setChapaIdx(filteredIndices[currentPosInFilter + 1]);

    // Extrair fitas únicas para legenda
    const fitaTypes = useMemo(() => {
        if (!chapaAtual) return [];
        const types = new Set();
        chapaAtual.pecas.forEach(p => {
            if (p.fita_info) {
                Object.entries(p.fita_info).forEach(([lado, tipo]) => {
                    if (tipo) types.add(tipo);
                });
            }
        });
        return [...types];
    }, [chapaAtual]);

    return (
        <div>
            {/* Resumo geral */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatCard icon={<Layers size={16} />} label="Peças" value={resumo.total_pecas} color="var(--primary)" />
                <StatCard icon={<Package size={16} />} label="Chapas" value={resumo.total_chapas} color="#22c55e" />
                <StatCard icon={<BarChart3 size={16} />} label="Aproveitamento" value={`${resumo.aproveitamento}%`}
                    color={resumo.aproveitamento >= 80 ? 'var(--success)' : resumo.aproveitamento >= 60 ? 'var(--warning)' : 'var(--danger)'} />
                <StatCard icon={<Scissors size={16} />} label="Custo Chapas" value={R(resumo.custo_chapas)} color="var(--info)" />
                <StatCard icon={<AlertTriangle size={16} />} label="Desperdício" value={`${N(resumo.desperdicio_m2)} m2`} color="#f59e0b" />
            </div>

            {/* Barra de ações + navegação compacta */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={onImprimir} className={Z.btn2Sm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Printer size={14} /> Imprimir
                </button>
                <button onClick={onReotimizar} className={Z.btn2Sm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RefreshCw size={14} /> Re-otimizar
                </button>

                <div style={{ flex: 1 }} />

                {/* Filtro por material */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Material:</span>
                    <select className={Z.inp} value={matFilter} onChange={e => {
                        setMatFilter(e.target.value);
                        const indices = e.target.value === 'all' ? [0] : (matGroups[e.target.value]?.indices || [0]);
                        if (indices.length > 0) setChapaIdx(indices[0]);
                    }} style={{ fontSize: 11, padding: '4px 8px', minWidth: 140, maxWidth: 220 }}>
                        <option value="all">Todos ({chapas.length} chapas)</option>
                        {Object.entries(matGroups).map(([key, g]) => (
                            <option key={key} value={key}>
                                {g.nome} {g.espessura}mm ({g.chapas.length} ch)
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Navegação de chapas — barra compacta */}
            <div className={Z.card} style={{ padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Setas + contador */}
                <button onClick={goPrev} disabled={!canPrev}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: canPrev ? 'pointer' : 'default', opacity: canPrev ? 1 : 0.3 }}>
                    <ChevronLeft size={16} />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                    {/* Dropdown de chapa atual */}
                    <select className={Z.inp} value={chapaIdx} onChange={e => setChapaIdx(+e.target.value)}
                        style={{ fontSize: 12, padding: '4px 8px', fontWeight: 600, minWidth: 180, maxWidth: 320 }}>
                        {filteredIndices.map((ci, pos) => {
                            const ch = chapas[ci];
                            return <option key={ci} value={ci}>
                                Chapa {ci + 1}/{chapas.length} — {ch.material} — {ch.pecas.length}pç — {ch.aproveitamento}%
                            </option>;
                        })}
                    </select>

                    {/* Info da chapa atual */}
                    {chapaAtual && (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            {/* Cor do material preview */}
                            <div style={{
                                width: 20, height: 20, borderRadius: 4,
                                background: getMatBg(chapaAtual.material).bg,
                                border: `1.5px solid ${getMatBg(chapaAtual.material).stroke}`,
                            }} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {chapaAtual.comprimento}x{chapaAtual.largura}mm — {chapaAtual.espessura}mm
                            </span>
                            <span style={{
                                background: chapaAtual.aproveitamento >= 80 ? 'var(--success-bg)' : chapaAtual.aproveitamento >= 60 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                                color: chapaAtual.aproveitamento >= 80 ? 'var(--success-hover)' : chapaAtual.aproveitamento >= 60 ? 'var(--warning-hover)' : 'var(--danger-hover)',
                                padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                            }}>
                                {chapaAtual.aproveitamento}%
                            </span>
                            <span style={{ background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 10, fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {chapaAtual.pecas.length} peças
                            </span>
                            {chapaAtual.retalhos?.length > 0 && (
                                <span style={{ background: 'var(--warning-bg)', padding: '2px 8px', borderRadius: 10, fontSize: 10, color: 'var(--warning-hover)', whiteSpace: 'nowrap' }}>
                                    {chapaAtual.retalhos.length} sobras
                                </span>
                            )}
                            {chapaAtual.linhas_comuns_pares > 0 && (
                                <span title={`${chapaAtual.linhas_comuns_pares} par(es) de corte em linha comum — economia ~${Math.round(chapaAtual.economia_kerf_mm2 / 100) / 10} cm²`}
                                    style={{ background: 'rgba(34,197,94,0.15)', padding: '2px 8px', borderRadius: 10, fontSize: 10, color: '#4ade80', whiteSpace: 'nowrap', cursor: 'help' }}>
                                    ✂ {chapaAtual.linhas_comuns_pares} comum{chapaAtual.linhas_comuns_pares > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <button onClick={goNext} disabled={!canNext}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: canNext ? 'pointer' : 'default', opacity: canNext ? 1 : 0.3 }}>
                    <ChevronRight size={16} />
                </button>

                {/* Zoom */}
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 8, display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={() => setZoom(z => Math.max(0.1, z - 0.05))} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}>
                        <ZoomOut size={14} />
                    </button>
                    <span style={{ fontSize: 11, minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(1, z + 0.05))} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}>
                        <ZoomIn size={14} />
                    </button>
                </div>

                {/* Toggle grid view */}
                <button onClick={() => setShowGrid(!showGrid)}
                    style={{
                        background: showGrid ? 'var(--primary-light)' : 'var(--bg-hover)',
                        border: showGrid ? '1px solid var(--primary)' : '1px solid var(--border)',
                        borderRadius: 4, padding: '3px 6px', cursor: 'pointer',
                        color: showGrid ? 'var(--primary)' : 'var(--text-muted)',
                    }}
                    title="Ver todas as chapas em grid">
                    <Grid3X3 size={14} />
                </button>
            </div>

            {/* Visualização */}
            {showGrid ? (
                /* Grid de todas as chapas filtradas */
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 12, marginBottom: 16,
                }}>
                    {filteredIndices.map(ci => {
                        const ch = chapas[ci];
                        const isSelected = ci === chapaIdx;
                        return (
                            <div key={ci} onClick={() => { setChapaIdx(ci); setShowGrid(false); }}
                                className={Z.card} style={{
                                    padding: 8, cursor: 'pointer', transition: 'all 0.15s',
                                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    background: isSelected ? 'var(--primary-light)' : undefined,
                                }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700 }}>#{ci + 1} {ch.material}</span>
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                                        background: ch.aproveitamento >= 80 ? 'var(--success-bg)' : ch.aproveitamento >= 60 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                                        color: ch.aproveitamento >= 80 ? 'var(--success-hover)' : ch.aproveitamento >= 60 ? 'var(--warning-hover)' : 'var(--danger-hover)',
                                    }}>{ch.aproveitamento}%</span>
                                </div>
                                <ChapaThumb chapa={ch} ambColorMap={ambColorMap} />
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                    {ch.pecas.length} pç — {ch.comprimento}x{ch.largura}mm
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Vista de detalhe da chapa selecionada */
                chapaAtual && (
                    <div className={Z.card} style={{ overflow: 'auto', maxHeight: '65vh', padding: 12, marginBottom: 12 }}>
                        <ChapaView chapa={chapaAtual} scale={zoom} ambColorMap={ambColorMap} />
                    </div>
                )
            )}

            {/* Legenda — Ambientes + Fitas (quando existirem) */}
            {chapaAtual && (
                <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
                    {/* Legenda ambientes */}
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>AMBIENTES</div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {Object.entries(ambColorMap).map(([amb, color]) => (
                                <div key={amb} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                                    <span>{amb}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Legenda fitas de borda */}
                    {fitaTypes.length > 0 && (
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>FITAS DE BORDA</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {fitaTypes.map((tipo, i) => (
                                    <div key={tipo} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                        <div style={{ width: 14, height: 4, borderRadius: 1, background: FITA_COLORS[i % FITA_COLORS.length] }} />
                                        <span>{tipo}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Legenda geral */}
                    <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>OUTROS</div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--warning-bg)', border: '1px dashed #f59e0b' }} />
                                <span>Sobra</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: getMatBg(chapaAtual?.material).bg, border: `1px solid ${getMatBg(chapaAtual?.material).stroke}` }} />
                                <span>Chapa</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mini-grid rápida de material (quando tem mais de 8 chapas) */}
            {filteredIndices.length > 1 && !showGrid && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                        NAVEGAÇÃO RÁPIDA — {matFilter === 'all' ? 'Todas' : matGroups[matFilter]?.nome} ({filteredIndices.length} chapas)
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {filteredIndices.map((ci, pos) => {
                            const ch = chapas[ci];
                            const isActive = ci === chapaIdx;
                            const apColor = ch.aproveitamento >= 80 ? 'var(--success)' : ch.aproveitamento >= 60 ? 'var(--warning)' : 'var(--danger)';
                            return (
                                <button key={ci} onClick={() => setChapaIdx(ci)}
                                    title={`Chapa ${ci + 1}: ${ch.material} — ${ch.pecas.length}pç — ${ch.aproveitamento}%`}
                                    style={{
                                        width: 28, height: 20, borderRadius: 4, cursor: 'pointer', fontSize: 9, fontWeight: 700,
                                        border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        background: isActive ? 'var(--primary)' : 'var(--bg)',
                                        color: isActive ? '#fff' : 'var(--text-muted)',
                                        position: 'relative', overflow: 'hidden',
                                    }}>
                                    {ci + 1}
                                    {/* Barra de aproveitamento */}
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                                        background: apColor, opacity: isActive ? 0.9 : 0.5,
                                    }} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Resumo por material */}
            <div className={Z.card} style={{ marginTop: 0 }}>
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
                        {Object.entries(pl.materiais).map(([matId, m], i) => (
                            <tr key={i} style={{
                                borderBottom: '1px solid var(--border)',
                                cursor: 'pointer', background: matFilter === matId ? 'var(--primary-light)' : undefined,
                            }} onClick={() => {
                                setMatFilter(matId);
                                const indices = matGroups[matId]?.indices || [];
                                if (indices.length > 0) setChapaIdx(indices[0]);
                            }}>
                                <td style={{ padding: '5px 8px', fontSize: 12, fontWeight: 500 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{
                                            width: 14, height: 14, borderRadius: 3,
                                            background: getMatBg(m.material).bg,
                                            border: `1px solid ${getMatBg(m.material).stroke}`,
                                            flexShrink: 0,
                                        }} />
                                        {m.material}
                                    </div>
                                </td>
                                <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'center' }}>{m.espessura}mm</td>
                                <td style={{ padding: '5px 8px', fontSize: 12, textAlign: 'center', fontWeight: 600 }}>{m.total_pecas}</td>
                                <td style={{ padding: '5px 8px', fontSize: 12, textAlign: 'center', fontWeight: 600, color: 'var(--primary)' }}>{m.total_chapas}</td>
                                <td style={{ padding: '5px 8px', fontSize: 12, textAlign: 'center', fontWeight: 600,
                                    color: m.aproveitamento >= 80 ? 'var(--success-hover)' : m.aproveitamento >= 60 ? 'var(--warning-hover)' : 'var(--danger-hover)',
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
// SVG: Visualização de Chapa (com cor do material + fitas de borda)
// ═══════════════════════════════════════════════════════
function ChapaView({ chapa, scale, ambColorMap }) {
    const { comprimento, largura, refilo, pecas, retalhos, cortes, material } = chapa;
    const svgW = comprimento * scale;
    const svgH = largura * scale;
    const matBg = getMatBg(material);
    const FITA_W = Math.max(2, 3 * scale / 0.28); // espessura visual da fita de borda

    return (
        <svg width={svgW + 4} height={svgH + 4} viewBox={`-2 -2 ${svgW + 4} ${svgH + 4}`}
            style={{ display: 'block' }}>
            {/* Fundo da chapa — cor do material real */}
            <rect x={0} y={0} width={svgW} height={svgH} fill={matBg.bg} stroke={matBg.stroke} strokeWidth={1.5} rx={2} />

            {/* Refilo */}
            {refilo > 0 && (
                <rect x={refilo * scale} y={refilo * scale}
                    width={(comprimento - 2 * refilo) * scale}
                    height={(largura - 2 * refilo) * scale}
                    fill="none" stroke={matBg.stroke} strokeWidth={0.5} strokeDasharray="4 2" strokeOpacity={0.4} />
            )}

            {/* Cortes */}
            {(cortes || []).map((c, i) => {
                if (c.dir === 'Horizontal') {
                    return <line key={`c${i}`} x1={0} y1={c.pos * scale} x2={svgW} y2={c.pos * scale}
                        stroke={matBg.stroke} strokeWidth={0.5} strokeDasharray="6 3" strokeOpacity={0.3} />;
                }
                return <line key={`c${i}`} x1={c.pos * scale} y1={0} x2={c.pos * scale} y2={svgH}
                    stroke={matBg.stroke} strokeWidth={0.5} strokeDasharray="6 3" strokeOpacity={0.3} />;
            })}

            {/* Sobras */}
            {(retalhos || []).map((r, i) => (
                <g key={`s${i}`}>
                    <rect x={r.x * scale} y={r.y * scale} width={r.w * scale} height={r.h * scale}
                        fill="#fef3c7" fillOpacity={0.5} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="3 2" />
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
                const color = ambColorMap[p.ambiente] || 'var(--muted)';
                const px = p.x * scale;
                const py = p.y * scale;
                const pw = p.w * scale;
                const ph = p.h * scale;
                const minDim = Math.min(pw, ph);
                const showLabel = minDim > 20;
                const showDims = minDim > 30;

                // Fitas de borda — renderizar como linhas coloridas nos lados da peça
                const fita = p.fita_info || p.fita || null;
                const fitaEdges = [];
                if (fita) {
                    // fita pode ser array ['f','b','t'] ou objeto {top:'MDF',bottom:'BP',...}
                    if (Array.isArray(fita)) {
                        fita.forEach(s => {
                            if (s === 'f' || s === 'front' || s === 'all') fitaEdges.push('bottom');
                            if (s === 'b' || s === 'back' || s === 'all') fitaEdges.push('top');
                            if (s === 'l' || s === 'left' || s === 'all') fitaEdges.push('left');
                            if (s === 'r' || s === 'right' || s === 'all') fitaEdges.push('right');
                            if (s === 't') fitaEdges.push('bottom'); // 't' geralmente é a frente
                        });
                    } else if (typeof fita === 'object') {
                        Object.entries(fita).forEach(([lado, tipo]) => {
                            if (tipo) fitaEdges.push(lado.toLowerCase());
                        });
                    }
                }

                return (
                    <g key={`p${i}`}>
                        {/* Fundo da peça */}
                        <rect x={px} y={py} width={pw} height={ph}
                            fill={color + '30'} stroke={color} strokeWidth={1} rx={1} />

                        {/* Fitas de borda como barras coloridas nos lados */}
                        {fitaEdges.includes('top') && (
                            <rect x={px} y={py} width={pw} height={FITA_W} fill={color} fillOpacity={0.7} rx={0.5} />
                        )}
                        {fitaEdges.includes('bottom') && (
                            <rect x={px} y={py + ph - FITA_W} width={pw} height={FITA_W} fill={color} fillOpacity={0.7} rx={0.5} />
                        )}
                        {fitaEdges.includes('left') && (
                            <rect x={px} y={py} width={FITA_W} height={ph} fill={color} fillOpacity={0.7} rx={0.5} />
                        )}
                        {fitaEdges.includes('right') && (
                            <rect x={px + pw - FITA_W} y={py} width={FITA_W} height={ph} fill={color} fillOpacity={0.7} rx={0.5} />
                        )}

                        {/* Nome da peça */}
                        {showLabel && (
                            <text x={px + pw / 2} y={py + ph / 2 + (showDims ? -5 : 0)}
                                textAnchor="middle" dominantBaseline="central"
                                fontSize={Math.max(7, Math.min(11, pw / 10))} fill="#1e293b" fontFamily="Arial"
                                fontWeight={500}>
                                {p.nome.length > Math.floor(pw / 6) ? p.nome.slice(0, Math.floor(pw / 6) - 1) + '..' : p.nome}
                            </text>
                        )}
                        {/* Dimensões */}
                        {showDims && (
                            <text x={px + pw / 2} y={py + ph / 2 + 8}
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
// SVG: Thumbnail de chapa (com cor do material)
// ═══════════════════════════════════════════════════════
function ChapaThumb({ chapa, ambColorMap }) {
    const scale = 0.05;
    const w = chapa.comprimento * scale;
    const h = chapa.largura * scale;
    const matBg = getMatBg(chapa.material);

    return (
        <svg width={w + 2} height={h + 2} viewBox={`-1 -1 ${w + 2} ${h + 2}`} style={{ display: 'block' }}>
            <rect x={0} y={0} width={w} height={h} fill={matBg.bg} stroke={matBg.stroke} strokeWidth={0.5} rx={1} />
            {chapa.pecas.map((p, i) => {
                const color = ambColorMap[p.ambiente] || 'var(--muted)';
                return <rect key={i} x={p.x * scale} y={p.y * scale} width={p.w * scale} height={p.h * scale}
                    fill={color + '55'} stroke={color} strokeWidth={0.3} />;
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
