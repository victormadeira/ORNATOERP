import { useState, useMemo, useEffect } from 'react';
import { Z } from '../ui';
import { R$, N } from '../engine';
import api from '../api';
import { Grid3x3, Layers, Ruler, AlertCircle, ChevronDown, ChevronRight, Info } from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

function calcPrecoM2(item) {
    if (item.largura > 0 && item.altura > 0 && item.preco > 0) {
        const area = (item.largura * item.altura) / 1e6;
        const util = area * (1 - (item.perda_pct || 15) / 100);
        return util > 0 ? item.preco / util : 0;
    }
    return item.preco_m2 || item.preco || 0;
}

function bestCut(chapaL, chapaW, ripaComp, ripaLarg) {
    // Returns max ripas per chapa considering two orientations
    const o1 = Math.floor(chapaL / ripaComp) * Math.floor(chapaW / ripaLarg);
    const o2 = Math.floor(chapaW / ripaComp) * Math.floor(chapaL / ripaLarg);
    return Math.max(o1, o2, 1);
}

function nRipas(dim, larg, espc) {
    // Number of ripas fitting in `dim` with `larg` width and `espc` spacing
    if (larg <= 0 || larg + espc <= 0) return 0;
    return Math.max(0, Math.floor((dim + espc) / (larg + espc)));
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Ripado({ embedded = false }) {
    // tipo
    const [tipo, setTipo] = useState('ripado'); // 'ripado' | 'muxarabi'

    // dimensões do painel
    const [L, setL] = useState(2400);
    const [A, setA] = useState(2200);

    // ripas verticais
    const [wV, setWV] = useState(40);    // largura (mm)
    const [eV, setEV] = useState(18);    // espessura (mm)
    const [sV, setSV] = useState(15);    // espaçamento (mm)

    // ripas horizontais (muxarabi)
    const [mesmasRipas, setMesmasRipas] = useState(true);
    const [wH, setWH] = useState(40);
    const [eH, setEH] = useState(18);
    const [sH, setSH] = useState(15);

    // substrato
    const [temSubstrato, setTemSubstrato] = useState(true);
    const [matSubstrato, setMatSubstrato] = useState('');

    // materiais
    const [matRipaV, setMatRipaV] = useState('');
    const [matRipaH, setMatRipaH] = useState('');

    // biblioteca
    const [bib, setBib] = useState([]);
    useEffect(() => { api.get('/biblioteca').then(setBib).catch(() => {}); }, []);

    const materiais = bib.filter(b => b.tipo === 'material');

    // ── cálculo ────────────────────────────────────────────────────────────────

    const calc = useMemo(() => {
        if (!L || !A || !wV || eV <= 0) return null;

        // Parâmetros horizontais
        const _wH = mesmasRipas ? wV : wH;
        const _eH = mesmasRipas ? eV : eH;
        const _sH = mesmasRipas ? sV : sH;

        // ── Ripas Verticais ──
        const nV = nRipas(L, wV, sV);
        const compV = A;                          // comprimento de cada ripa
        const mlV = nV * compV / 1000;            // metros lineares totais

        // Chapas para ripas V
        const matV = materiais.find(m => m.id == matRipaV || m.nome === matRipaV);
        const chapaLV = matV?.largura || 2750;
        const chapaWV = matV?.altura  || 1830;
        const rpcV = bestCut(chapaLV, chapaWV, compV, wV);
        const chapasV = Math.ceil(nV / rpcV);
        const custoRipasV = matV ? chapasV * (matV.preco || 0) : 0;

        // Fita das ripas V (2 bordas longas por ripa)
        const fitaRipasV = nV * 2 * compV / 1000;

        // ── Ripas Horizontais (muxarabi) ──
        let nH = 0, mlH = 0, chapasH = 0, custoRipasH = 0, fitaRipasH = 0;
        if (tipo === 'muxarabi' && _wH > 0) {
            nH = nRipas(A, _wH, _sH);
            const compH = L;
            mlH = nH * compH / 1000;

            const matH = mesmasRipas ? matV : materiais.find(m => m.id == matRipaH || m.nome === matRipaH);
            const chapaLH = matH?.largura || 2750;
            const chapaWH = matH?.altura  || 1830;
            const rpcH = bestCut(chapaLH, chapaWH, compH, _wH);
            chapasH = Math.ceil(nH / rpcH);
            custoRipasH = matH ? chapasH * (matH.preco || 0) : 0;
            fitaRipasH = nH * 2 * compH / 1000;
        }

        // ── Substrato ──
        const areaSubstrato = L * A / 1e6;  // m²
        const fitaSubstrato = 2 * (L + A) / 1000; // perimetro ml
        const matSub = temSubstrato ? materiais.find(m => m.id == matSubstrato || m.nome === matSubstrato) : null;
        let custoSubstrato = 0;
        let chapasSubstrato = 0;
        if (matSub) {
            const pm2 = calcPrecoM2(matSub);
            if (pm2 > 0) {
                custoSubstrato = areaSubstrato * pm2;
            } else if (matSub.largura && matSub.altura) {
                const areaChapa = matSub.largura * matSub.altura / 1e6;
                chapasSubstrato = Math.ceil(areaSubstrato / (areaChapa * (1 - (matSub.perda_pct || 15) / 100)));
                custoSubstrato = chapasSubstrato * (matSub.preco || 0);
            }
        }

        // ── Totais ──
        const mlTotal = mlV + mlH;
        const fitaTotal = fitaRipasV + fitaRipasH + (temSubstrato ? fitaSubstrato : 0);
        const custoMaterial = custoRipasV + custoRipasH + custoSubstrato;
        // Cobertura efetiva: descontando interseções (área coberta por ambas as camadas)
        const areaIntersecoes = tipo === 'muxarabi' ? (nV * wV * nH * _wH) / 1e6 : 0;
        const areaCoberta = (nV * wV * A + nH * _wH * L) / 1e6 - areaIntersecoes;
        const cobertura = Math.min(100, areaCoberta / (L * A / 1e6) * 100);
        const vazio = Math.max(0, 100 - cobertura);

        return {
            nV, mlV, chapasV, custoRipasV, fitaRipasV,
            nH, mlH, chapasH, custoRipasH, fitaRipasH,
            mlTotal, fitaTotal, fitaSubstrato,
            areaSubstrato, chapasSubstrato, custoSubstrato,
            custoMaterial, cobertura, vazio,
            // raw for display
            matV, matH: mesmasRipas ? matV : materiais.find(m => m.id == matRipaH || m.nome === matRipaH),
            matSub, _wH, _eH, _sH,
        };
    }, [tipo, L, A, wV, eV, sV, wH, eH, sH, mesmasRipas, temSubstrato, matRipaV, matRipaH, matSubstrato, materiais]);

    // ── helpers de UI ──────────────────────────────────────────────────────────

    const Num = ({ label, value, unit, color }) => (
        <div className="rounded-lg p-3 flex flex-col gap-0.5" style={{ background: 'var(--bg-muted)' }}>
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span className="text-xl font-bold" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
            {unit && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{unit}</span>}
        </div>
    );

    const Field = ({ label, value, onChange, min = 0, step = 1, unit }) => (
        <div>
            <label className={Z.lbl}>{label}{unit && <span className="ml-1 opacity-60">({unit})</span>}</label>
            <input type="number" min={min} step={step} value={value}
                onChange={e => onChange(+e.target.value)} className={Z.inp} />
        </div>
    );

    const MatSelect = ({ label, value, onChange }) => (
        <div>
            <label className={Z.lbl}>{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)} className={Z.inp}>
                <option value="">Sem custo / não selecionado</option>
                {materiais.map(m => (
                    <option key={m.id} value={m.id}>
                        {m.nome}{m.largura ? ` — ${m.largura}×${m.altura}mm` : ''}
                        {m.preco ? ` — ${R$(m.preco)}` : ''}
                    </option>
                ))}
            </select>
        </div>
    );

    // ── render ─────────────────────────────────────────────────────────────────

    return (
        <div className={embedded ? '' : Z.pg}>
            {/* Header */}
            <div className="mb-5 flex items-start justify-between">
                <div>
                    <h1 className={Z.h1}>Painéis Ripados & Muxarabi</h1>
                    <p className={Z.sub}>Calculadora de ripas, espaçamentos, fita de borda e custo de material</p>
                </div>
                {/* Tipo toggle */}
                <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    {[['ripado', <Layers size={14} />, 'Ripado'], ['muxarabi', <Grid3x3 size={14} />, 'Muxarabi']].map(([id, icon, lb]) => (
                        <button key={id} onClick={() => setTipo(id)}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all"
                            style={tipo === id
                                ? { background: 'var(--primary)', color: '#fff' }
                                : { background: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                            {icon} {lb}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* ── Coluna Esquerda: Configuração ── */}
                <div className="lg:col-span-1 flex flex-col gap-4">

                    {/* Dimensões do painel */}
                    <div className={Z.card}>
                        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                            <Ruler size={14} className="inline mr-1.5 mb-0.5" />Dimensões do Painel
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Largura" value={L} onChange={setL} min={100} unit="mm" />
                            <Field label="Altura" value={A} onChange={setA} min={100} unit="mm" />
                        </div>
                    </div>

                    {/* Ripas Verticais */}
                    <div className={Z.card} style={{ borderLeft: '3px solid var(--primary)' }}>
                        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                            Ripas {tipo === 'muxarabi' ? 'Verticais' : ''}
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            <Field label="Largura" value={wV} onChange={setWV} min={5} unit="mm" />
                            <Field label="Espessura" value={eV} onChange={setEV} min={3} unit="mm" />
                            <Field label="Espaçamento" value={sV} onChange={setSV} min={0} unit="mm" />
                        </div>
                        <div className="mt-3">
                            <MatSelect label="Material das Ripas" value={matRipaV} onChange={setMatRipaV} />
                        </div>
                        {calc && (
                            <div className="mt-3 flex gap-2 flex-wrap">
                                <span className="text-[11px] px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--primary)15', color: 'var(--primary)' }}>
                                    {calc.nV} ripas verticais
                                </span>
                                <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                    passo {wV + sV}mm
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Ripas Horizontais (muxarabi) */}
                    {tipo === 'muxarabi' && (
                        <div className={Z.card} style={{ borderLeft: '3px solid #f59e0b' }}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ripas Horizontais</h3>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                    <input type="checkbox" checked={mesmasRipas} onChange={e => setMesmasRipas(e.target.checked)}
                                        className="rounded" />
                                    Mesmas ripas
                                </label>
                            </div>
                            {!mesmasRipas && (
                                <>
                                    <div className="grid grid-cols-3 gap-3">
                                        <Field label="Largura" value={wH} onChange={setWH} min={5} unit="mm" />
                                        <Field label="Espessura" value={eH} onChange={setEH} min={3} unit="mm" />
                                        <Field label="Espaçamento" value={sH} onChange={setSH} min={0} unit="mm" />
                                    </div>
                                    <div className="mt-3">
                                        <MatSelect label="Material" value={matRipaH} onChange={setMatRipaH} />
                                    </div>
                                </>
                            )}
                            {mesmasRipas && (
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    Usando as mesmas especificações das ripas verticais.
                                </p>
                            )}
                            {calc && calc.nH > 0 && (
                                <div className="mt-3 flex gap-2 flex-wrap">
                                    <span className="text-[11px] px-2 py-1 rounded-full font-semibold" style={{ background: '#f59e0b15', color: '#f59e0b' }}>
                                        {calc.nH} ripas horizontais
                                    </span>
                                    <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                                        passo {(mesmasRipas ? wV + sV : wH + sH)}mm
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Substrato */}
                    <div className={Z.card}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Substrato (fundo)</h3>
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                                <input type="checkbox" checked={temSubstrato} onChange={e => setTemSubstrato(e.target.checked)} className="rounded" />
                                Incluir
                            </label>
                        </div>
                        {temSubstrato && (
                            <MatSelect label="Material do Substrato" value={matSubstrato} onChange={setMatSubstrato} />
                        )}
                        {!temSubstrato && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Painel sem substrato (ex: divisória de ripas soltas).</p>}
                    </div>
                </div>

                {/* ── Coluna Direita: Resultados ── */}
                <div className="lg:col-span-2 flex flex-col gap-4">

                    {!calc ? (
                        <div className={Z.card + ' flex items-center justify-center py-16'}>
                            <div className="text-center" style={{ color: 'var(--text-muted)' }}>
                                <AlertCircle size={28} className="mx-auto mb-2 opacity-40" />
                                <p className="text-sm">Preencha as dimensões para calcular</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Cards de resumo */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <Num label="Ripas Verticais" value={calc.nV} color="var(--primary)" />
                                {tipo === 'muxarabi' && <Num label="Ripas Horizontais" value={calc.nH} color="#f59e0b" />}
                                <Num label="ML Totais" value={N(calc.mlTotal)} unit="metros lineares" />
                                <Num label="Fita de Borda" value={N(calc.fitaTotal)} unit="metros lineares" />
                                <Num label="Cobertura" value={N(calc.cobertura, 1) + '%'} color={calc.cobertura > 80 ? '#ef4444' : calc.cobertura > 50 ? '#f59e0b' : '#10b981'} />
                                <Num label="Vazio" value={N(calc.vazio, 1) + '%'} />
                                {temSubstrato && <Num label="Área Substrato" value={N(calc.areaSubstrato)} unit="m²" />}
                                {calc.custoMaterial > 0 && <Num label="Custo Material" value={R$(calc.custoMaterial)} color="var(--primary)" />}
                            </div>

                            {/* Painel visual simples */}
                            <div className={Z.card}>
                                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                                    Visualização Esquemática
                                </h3>
                                <PanelPreview tipo={tipo} L={L} A={A} wV={wV} sV={sV}
                                    wH={calc._wH} sH={calc._sH} nV={calc.nV} nH={calc.nH} />
                            </div>

                            {/* BOM */}
                            <div className={Z.card + ' !p-0 overflow-hidden'}>
                                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Lista de Materiais (BOM)</h3>
                                </div>
                                <table className="w-full text-left text-xs">
                                    <thead>
                                        <tr>
                                            <th className={Z.th}>Item</th>
                                            <th className={Z.th}>Qtd</th>
                                            <th className={Z.th}>Dimensão</th>
                                            <th className={Z.th + ' text-right'}>Custo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* Ripas V */}
                                        <tr className="hover:bg-[var(--bg-hover)]">
                                            <td className="td-glass font-medium" style={{ color: 'var(--text-primary)' }}>
                                                Ripas Verticais{calc.matV ? ` — ${calc.matV.nome}` : ''}
                                            </td>
                                            <td className="td-glass">{calc.nV} un</td>
                                            <td className="td-glass" style={{ color: 'var(--text-muted)' }}>
                                                {wV} × {eV} × {A}mm
                                            </td>
                                            <td className="td-glass text-right font-bold" style={{ color: 'var(--primary)' }}>
                                                {calc.custoRipasV > 0 ? R$(calc.custoRipasV) : '—'}
                                            </td>
                                        </tr>
                                        {calc.chapasV > 0 && (
                                            <tr style={{ background: 'var(--bg-muted)' }}>
                                                <td className="td-glass pl-6 italic" style={{ color: 'var(--text-muted)' }}>↳ Chapas para ripas V</td>
                                                <td className="td-glass" style={{ color: 'var(--text-muted)' }}>{calc.chapasV} chapa{calc.chapasV > 1 ? 's' : ''}</td>
                                                <td className="td-glass" style={{ color: 'var(--text-muted)' }}>
                                                    {calc.matV?.largura || 2750} × {calc.matV?.altura || 1830} × {eV}mm
                                                </td>
                                                <td className="td-glass text-right" style={{ color: 'var(--text-muted)' }}>
                                                    {calc.matV ? R$(calc.custoRipasV) : '—'}
                                                </td>
                                            </tr>
                                        )}

                                        {/* Ripas H */}
                                        {tipo === 'muxarabi' && calc.nH > 0 && (<>
                                            <tr className="hover:bg-[var(--bg-hover)]">
                                                <td className="td-glass font-medium" style={{ color: 'var(--text-primary)' }}>
                                                    Ripas Horizontais{calc.matH ? ` — ${calc.matH.nome}` : ''}
                                                </td>
                                                <td className="td-glass">{calc.nH} un</td>
                                                <td className="td-glass" style={{ color: 'var(--text-muted)' }}>
                                                    {calc._wH} × {calc._eH} × {L}mm
                                                </td>
                                                <td className="td-glass text-right font-bold" style={{ color: 'var(--primary)' }}>
                                                    {calc.custoRipasH > 0 ? R$(calc.custoRipasH) : '—'}
                                                </td>
                                            </tr>
                                            {calc.chapasH > 0 && (
                                                <tr style={{ background: 'var(--bg-muted)' }}>
                                                    <td className="td-glass pl-6 italic" style={{ color: 'var(--text-muted)' }}>↳ Chapas para ripas H</td>
                                                    <td className="td-glass" style={{ color: 'var(--text-muted)' }}>{calc.chapasH} chapa{calc.chapasH > 1 ? 's' : ''}</td>
                                                    <td className="td-glass" style={{ color: 'var(--text-muted)' }}>{calc.matH?.largura || 2750} × {calc.matH?.altura || 1830} × {calc._eH}mm</td>
                                                    <td className="td-glass text-right" style={{ color: 'var(--text-muted)' }}>{calc.matH ? R$(calc.custoRipasH) : '—'}</td>
                                                </tr>
                                            )}
                                        </>)}

                                        {/* Substrato */}
                                        {temSubstrato && (
                                            <tr className="hover:bg-[var(--bg-hover)]">
                                                <td className="td-glass font-medium" style={{ color: 'var(--text-primary)' }}>
                                                    Substrato{calc.matSub ? ` — ${calc.matSub.nome}` : ''}
                                                </td>
                                                <td className="td-glass">1 painel</td>
                                                <td className="td-glass" style={{ color: 'var(--text-muted)' }}>
                                                    {L} × {A}mm = {N(calc.areaSubstrato)} m²
                                                </td>
                                                <td className="td-glass text-right font-bold" style={{ color: 'var(--primary)' }}>
                                                    {calc.custoSubstrato > 0 ? R$(calc.custoSubstrato) : '—'}
                                                </td>
                                            </tr>
                                        )}

                                        {/* Fita de borda */}
                                        <tr className="hover:bg-[var(--bg-hover)]">
                                            <td className="td-glass font-medium" style={{ color: 'var(--text-primary)' }}>Fita de Borda — Ripas</td>
                                            <td className="td-glass">{N(calc.fitaRipasV + calc.fitaRipasH)} ml</td>
                                            <td className="td-glass" style={{ color: 'var(--text-muted)' }}>bordas vistas das ripas</td>
                                            <td className="td-glass text-right" style={{ color: 'var(--text-muted)' }}>—</td>
                                        </tr>
                                        {temSubstrato && (
                                            <tr className="hover:bg-[var(--bg-hover)]">
                                                <td className="td-glass font-medium" style={{ color: 'var(--text-primary)' }}>Fita de Borda — Substrato</td>
                                                <td className="td-glass">{N(calc.fitaSubstrato)} ml</td>
                                                <td className="td-glass" style={{ color: 'var(--text-muted)' }}>perímetro {L}×{A}mm</td>
                                                <td className="td-glass text-right" style={{ color: 'var(--text-muted)' }}>—</td>
                                            </tr>
                                        )}

                                        {/* Total */}
                                        {calc.custoMaterial > 0 && (
                                            <tr style={{ background: 'var(--primary)08' }}>
                                                <td className="td-glass font-bold" style={{ color: 'var(--text-primary)' }}>Total Material</td>
                                                <td className="td-glass" />
                                                <td className="td-glass" />
                                                <td className="td-glass text-right font-bold text-base" style={{ color: 'var(--primary)' }}>
                                                    {R$(calc.custoMaterial)}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Informações técnicas */}
                            <div className={Z.card}>
                                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                                    <Info size={12} className="inline mr-1 mb-0.5" />Resumo Técnico
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                    <InfoLine label="Painel" value={`${L} × ${A} mm`} />
                                    <InfoLine label="Área total" value={`${N(L * A / 1e6)} m²`} />
                                    <InfoLine label="ML ripas V" value={`${N(calc.mlV)} m`} />
                                    {tipo === 'muxarabi' && <InfoLine label="ML ripas H" value={`${N(calc.mlH)} m`} />}
                                    <InfoLine label="ML total ripas" value={`${N(calc.mlTotal)} m`} />
                                    <InfoLine label="Fita total" value={`${N(calc.fitaTotal)} ml`} />
                                    <InfoLine label="Cobertura" value={`${N(calc.cobertura, 1)}% preenchido`} />
                                    <InfoLine label="Passo V" value={`${wV + sV} mm (${wV}ripa + ${sV}espc)`} />
                                    {tipo === 'muxarabi' && <InfoLine label="Passo H" value={`${calc._wH + calc._sH} mm`} />}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Visualização esquemática SVG ─────────────────────────────────────────────

function PanelPreview({ tipo, L, A, wV, sV, wH, sH, nV, nH }) {
    const maxW = 480, maxH = 280;
    const scale = Math.min(maxW / L, maxH / A);
    const pw = L * scale, ph = A * scale;
    const wVs = wV * scale, sVs = sV * scale;
    const wHs = (wH || wV) * scale, sHs = (sH || sV) * scale;

    // Vertical ripa positions
    const ripasV = [];
    for (let i = 0; i < nV; i++) {
        ripasV.push(i * (wVs + sVs));
    }
    // Horizontal ripa positions
    const ripasH = [];
    if (tipo === 'muxarabi') {
        for (let i = 0; i < nH; i++) {
            ripasH.push(i * (wHs + sHs));
        }
    }

    return (
        <div className="overflow-x-auto">
            <svg width={pw + 2} height={ph + 2} style={{ display: 'block' }}>
                {/* Background (vazio / substrato) */}
                <rect x={1} y={1} width={pw} height={ph} fill="var(--bg-muted)" stroke="var(--border)" strokeWidth={1} />

                {/* Ripas horizontais (atrás) */}
                {ripasH.map((y, i) => (
                    <rect key={`h${i}`} x={1} y={1 + y} width={pw} height={Math.max(1, wHs)}
                        fill="#f59e0b" opacity={0.5} />
                ))}

                {/* Ripas verticais (frente) */}
                {ripasV.map((x, i) => (
                    <rect key={`v${i}`} x={1 + x} y={1} width={Math.max(1, wVs)} height={ph}
                        fill="var(--primary)" opacity={0.75} />
                ))}

                {/* Borda do painel */}
                <rect x={1} y={1} width={pw} height={ph} fill="none" stroke="var(--border)" strokeWidth={1.5} />

                {/* Labels de dimensão */}
                <text x={pw / 2 + 1} y={ph + 16} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{L}mm</text>
                <text x={-ph / 2 - 1} y={-6} textAnchor="middle" fontSize={10} fill="var(--text-muted)"
                    transform="rotate(-90)">{A}mm</text>
            </svg>
            <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Escala ~1:{Math.round(1 / scale)} — azul = ripas verticais{tipo === 'muxarabi' ? ', laranja = ripas horizontais' : ''}
            </p>
        </div>
    );
}

function InfoLine({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>{value}</span>
        </div>
    );
}
