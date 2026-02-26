import { useReducer, useState } from 'react';
import { Z, Ic, tagStyle, tagClass } from '../ui';
import { builderReducer, initialBuilderState, evalRule } from '../hooks/useModuleBuilder';
import { DB_FERRAGENS } from '../engine';
import api from '../api';

// Nomes amigáveis para as partes
const PARTES_LABELS = {
    topo: { nome: 'Topo (Chapéu)', desc: 'Peça horizontal superior', icon: '⬆' },
    base: { nome: 'Base', desc: 'Peça horizontal inferior', icon: '⬇' },
    fundo: { nome: 'Fundo (Costas)', desc: 'Painel traseiro', icon: '◻' },
    laterais: { nome: 'Laterais', desc: 'Peças verticais (Esq+Dir)', icon: '◧' },
    prateleiras: { nome: 'Prateleiras', desc: 'Divisórias horizontais internas', icon: '≡' }
};

const FACES_LABELS = {
    topo: 'Topo',
    base: 'Base',
    lateralEsquerda: 'Lat. Esquerda',
    lateralDireita: 'Lat. Direita',
    frente: 'Frente',
    fundo: 'Fundo'
};

export default function ModuleBuilder({ close, defaultType = 'modulo_pai' }) {
    const [state, dispatch] = useReducer(builderReducer, initialBuilderState);
    const [testVars, setTestVars] = useState({ L: 1000, A: 2200, P: 600 });
    const [viewJson, setViewJson] = useState(false);
    const [tipoItem, setTipoItem] = useState(defaultType);
    const [saving, setSaving] = useState(false);

    const handleTestVar = (k, v) => setTestVars(p => ({ ...p, [k]: Number(v) || 0 }));
    const formatRes = (formula) => {
        const res = evalRule(formula, testVars);
        return res === 0 ? "—" : res;
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const payload = { ...state, tipo_item: tipoItem };
            await api.post('/catalogo', payload);
            alert("Gabarito salvo com sucesso na Biblioteca!");
            if (close) close();
        } catch (err) {
            console.error(err);
            alert("Erro ao salvar o gabarito.");
        } finally {
            setSaving(false);
        }
    };

    // Calcular preview das peças que serão geradas
    const previewPecas = () => {
        const { L, A, P } = testVars;
        const pecas = [];
        const pp = state.possuiPartes;
        if (pp.topo.tem && pp.topo.quantidade > 0) {
            for (let i = 0; i < pp.topo.quantidade; i++) pecas.push({ nome: `Topo${pp.topo.quantidade > 1 ? ` ${i + 1}` : ''}`, dims: `${L} × ${P}`, area: ((L * P) / 1e6).toFixed(3) });
        }
        if (pp.base.tem && pp.base.quantidade > 0) {
            for (let i = 0; i < pp.base.quantidade; i++) pecas.push({ nome: `Base${pp.base.quantidade > 1 ? ` ${i + 1}` : ''}`, dims: `${L} × ${P}`, area: ((L * P) / 1e6).toFixed(3) });
        }
        if (pp.fundo.tem && pp.fundo.quantidade > 0) {
            for (let i = 0; i < pp.fundo.quantidade; i++) pecas.push({ nome: `Fundo${pp.fundo.quantidade > 1 ? ` ${i + 1}` : ''}`, dims: `${L} × ${A}`, area: ((L * A) / 1e6).toFixed(3) });
        }
        if (pp.laterais.tem && pp.laterais.quantidade > 0) {
            for (let i = 0; i < pp.laterais.quantidade; i++) {
                const label = pp.laterais.quantidade === 2 ? (i === 0 ? 'Lat. Esquerda' : 'Lat. Direita') : `Lateral ${i + 1}`;
                pecas.push({ nome: label, dims: `${P} × ${A}`, area: ((P * A) / 1e6).toFixed(3) });
            }
        }
        if (pp.prateleiras.tem && pp.prateleiras.quantidade > 0) {
            for (let i = 0; i < pp.prateleiras.quantidade; i++) pecas.push({ nome: `Prateleira ${i + 1}`, dims: `${L} × ${P}`, area: ((L * P) / 1e6).toFixed(3) });
        }
        return pecas;
    };

    const areaTotal = previewPecas().reduce((s, p) => s + parseFloat(p.area), 0);

    return (
        <div className="flex flex-col h-full overflow-hidden text-[var(--text-muted)] font-sans p-6 animation-fade-in max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--primary)] tracking-tight">Engenharia de Gabarito</h1>
                    <p className="text-sm text-[var(--text-muted)]">Defina a estrutura, e o material será escolhido no orçamento</p>
                </div>
                <div className="flex gap-2 items-center">
                    <button onClick={() => setViewJson(!viewJson)} className={Z.btn2}>
                        <Ic.File /> {viewJson ? 'Ver Builder' : 'Ver JSON'}
                    </button>
                    <button onClick={handleSave} disabled={saving} className={`${Z.btn} bg-green-600/90 text-[var(--text-primary)] hover:bg-green-500`}>
                        <Ic.Box /> {saving ? 'Salvando...' : 'Salvar Gabarito'}
                    </button>
                    {close && <button onClick={close} className={Z.btn2}><Ic.X /> Voltar</button>}
                </div>
            </div>

            {viewJson ? (
                <div className="glass-card p-6 flex-1 overflow-auto rounded-xl">
                    <pre className="text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap">{JSON.stringify(state, null, 2)}</pre>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">

                    {/* ── COLUNA 1: Identidade + Regras de Engenharia ── */}
                    <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">

                        {/* Identidade */}
                        <div className="glass-card p-5">
                            <h3 className="font-bold text-sm text-[var(--text-primary)] border-b border-[var(--border-hover)] pb-2 mb-4 flex items-center gap-1.5"><Ic.Ruler /> Identidade do Gabarito</h3>
                            <div className="flex flex-col gap-3">
                                <label className={Z.lbl}>Nome do Gabarito</label>
                                <input value={state.nome} onChange={e => dispatch({ type: 'SET_HEADER', field: 'nome', value: e.target.value })} className={Z.inp} />
                                <label className={Z.lbl}>Categoria DRE</label>
                                <select value={state.categoria} onChange={e => dispatch({ type: 'SET_HEADER', field: 'categoria', value: e.target.value })} className={Z.inp}>
                                    <option value="caixaria">Caixaria Padrão</option>
                                    <option value="frentes">Frentes (Portas/Gavetas)</option>
                                    <option value="especial">Especial (Ripado/Painel)</option>
                                </select>
                                <label className={Z.lbl}>Coeficiente de Dificuldade</label>
                                <input type="number" step="0.05" min="0.5" max="3.0" value={state.coeficienteDificuldade} onChange={e => dispatch({ type: 'SET_HEADER', field: 'coeficienteDificuldade', value: parseFloat(e.target.value) || 1.0 })} className={Z.inp} />
                            </div>
                        </div>

                        {/* Dimensões Permitidas */}
                        <div className="glass-card p-5">
                            <h3 className="font-bold text-sm text-amber-500 border-b border-[var(--border-hover)] pb-2 mb-4 flex items-center gap-1.5"><Ic.Sliders /> Dimensões no Orçamento</h3>
                            <p className="text-xs text-[var(--text-muted)] mb-3">Quais eixos o projetista pode alterar?</p>
                            <div className="flex flex-col gap-2">
                                {[
                                    { key: 'comprimento', label: 'Comprimento (L)', desc: 'Largura do módulo' },
                                    { key: 'altura', label: 'Altura (A)', desc: 'Pé-direito do módulo' },
                                    { key: 'profundidade', label: 'Profundidade (P)', desc: 'Profundidade do corpo' }
                                ].map(d => (
                                    <label key={d.key} className="flex items-center gap-3 cursor-pointer text-sm text-[var(--text-muted)] p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors">
                                        <input type="checkbox" checked={state.possuiDimensoes[d.key]} onChange={() => dispatch({ type: 'TOGGLE_DIMENSAO', field: d.key })} className="accent-[var(--primary)] w-4 h-4" />
                                        <div>
                                            <span className="font-medium">{d.label}</span>
                                            <span className="block text-[10px] text-[var(--text-muted)]">{d.desc}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Simulador */}
                        <div className="glass-card p-5">
                            <h3 className="font-bold text-sm text-[var(--text-primary)] border-b border-[var(--border-hover)] pb-2 mb-4 flex justify-between">
                                Simulador de Teste
                                <span style={tagStyle("#7eb8c8")} className={tagClass}>Preview</span>
                            </h3>
                            <div className="flex flex-col gap-3">
                                {['L', 'A', 'P'].map(v => (
                                    <div key={v} className="flex flex-col">
                                        <label className={Z.lbl}>{v === 'L' ? 'Comp.' : v === 'A' ? 'Altura' : 'Prof.'} {v} (mm)</label>
                                        <input type="number" value={testVars[v]} onChange={e => handleTestVar(v, e.target.value)} className={Z.inp} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── COLUNA 2+3: Engenharia Estrutural ── */}
                    <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">

                        {/* ── PEÇAS ESTRUTURAIS (possuiPartes) ── */}
                        <div className="glass-card p-0 overflow-hidden">
                            <div className="p-4 bg-[var(--bg-muted)] border-b border-[var(--border)]">
                                <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-sm bg-[var(--primary)]"></span> Peças Estruturais (possuiPartes)
                                </h3>
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Ative/desative as peças que esse módulo possui. O material será definido no orçamento.</p>
                            </div>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(PARTES_LABELS).map(([key, info]) => {
                                    const parte = state.possuiPartes[key];
                                    return (
                                        <div key={key} className={`p-3 rounded-lg border transition-all ${parte.tem ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30' : 'bg-[var(--bg-muted)] border-[var(--border)] opacity-60'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                                                    <input type="checkbox" checked={parte.tem} onChange={() => dispatch({ type: 'TOGGLE_PARTE', parte: key })} className="accent-[var(--primary)] w-4 h-4" />
                                                    <span className="text-lg mr-1">{info.icon}</span>
                                                    {info.nome}
                                                </label>
                                                {parte.tem && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] text-[var(--text-muted)]">Qtd:</span>
                                                        <input type="number" min="1" max="20" value={parte.quantidade} onChange={e => dispatch({ type: 'UPDATE_PARTE_QTD', parte: key, value: e.target.value })} className="w-12 bg-[var(--bg-muted)] border border-[var(--border-hover)] rounded px-2 py-1 text-xs text-center text-[var(--text-primary)]" />
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-[var(--text-muted)]">{info.desc}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── FACES EXTERNAS (Tamponamento) ── */}
                        <div className="glass-card p-0 overflow-hidden">
                            <div className="p-4 bg-[var(--bg-muted)] border-b border-[var(--border)]">
                                <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-sm bg-[#7eb8c8]"></span> Faces Externas (Tamponamento)
                                </h3>
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Quais faces recebem acabamento externo? O material externo será escolhido no orçamento.</p>
                            </div>
                            <div className="p-4 grid grid-cols-3 gap-2">
                                {Object.entries(FACES_LABELS).map(([key, label]) => (
                                    <label key={key} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all text-xs ${state.facesExternas[key] ? 'bg-[#7eb8c8]/10 border-[#7eb8c8]/30 text-[#7eb8c8]' : 'bg-[var(--bg-muted)] border-[var(--border)] text-[var(--text-muted)]'}`}>
                                        <input type="checkbox" checked={state.facesExternas[key]} onChange={() => dispatch({ type: 'TOGGLE_FACE_EXTERNA', face: key })} className="accent-[#7eb8c8] w-3.5 h-3.5" />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* ── PREVIEW DE PEÇAS GERADAS ── */}
                        <div className="glass-card p-0 overflow-hidden">
                            <div className="p-4 bg-[var(--bg-muted)] border-b border-[var(--border)] flex justify-between items-center">
                                <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span> Preview: Peças que serão geradas
                                </h3>
                                <span className="text-xs text-[var(--text-muted)]">Área total: <span className="text-[var(--text-primary)] font-mono">{areaTotal.toFixed(3)} m²</span></span>
                            </div>
                            <div className="p-4">
                                {previewPecas().length === 0 ? (
                                    <p className="text-center text-xs text-[var(--text-muted)] py-4">Nenhuma peça ativada.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {previewPecas().map((p, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 bg-[var(--bg-muted)] rounded border border-[var(--border)] text-xs">
                                                <span className="text-[var(--text-muted)] font-medium">{p.nome}</span>
                                                <div className="flex gap-3">
                                                    <span className="text-[var(--text-muted)] font-mono">{p.dims} mm</span>
                                                    <span className="text-[var(--primary)] font-mono">{p.area} m²</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── SUB-ITENS (Componentes opcionais) ── */}
                        <div className="glass-card p-0 overflow-hidden flex flex-col">
                            <div className="p-4 bg-[var(--bg-muted)] border-b border-[var(--border)] flex justify-between items-center">
                                <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full border border-green-500/50"></span>
                                    Sub-itens (Portas / Gavetas / Acessórios)
                                </h3>
                                <button onClick={() => dispatch({ type: 'ADD_SUB_ITEM' })} className="text-xs bg-[var(--bg-hover)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] px-3 py-1.5 rounded-md transition-colors font-semibold">
                                    + Componente
                                </button>
                            </div>

                            <div className="p-4 flex flex-col gap-4">
                                {state.sub_itens.length === 0 && <p className="text-center text-xs text-[var(--text-muted)] py-4">Nenhum sub-item pré-definido. Componentes podem ser adicionados no orçamento.</p>}

                                {state.sub_itens.map(sub => (
                                    <div key={sub.id} className="bg-gradient-to-br from-white/[0.04] to-transparent border border-[var(--border-hover)] p-4 rounded-xl flex flex-col gap-4 relative group">
                                        <button onClick={() => dispatch({ type: 'REMOVE_SUB_ITEM', id: sub.id })} className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Ic.Trash /></button>

                                        <div className="grid grid-cols-12 gap-3">
                                            <div className="col-span-3">
                                                <label className={Z.lbl}>Categoria</label>
                                                <select value={sub.categoria} onChange={e => dispatch({ type: 'UPDATE_SUB_ITEM', id: sub.id, field: 'categoria', value: e.target.value })} className={Z.inp}>
                                                    <option value="marcenaria">Marcenaria</option>
                                                    <option value="vidracaria">Vidraçaria</option>
                                                    <option value="serralheria">Serralheria</option>
                                                    <option value="estofaria">Estofaria</option>
                                                </select>
                                            </div>
                                            <div className="col-span-9">
                                                <label className={Z.lbl}>Nome do Componente</label>
                                                <input value={sub.nome} onChange={e => dispatch({ type: 'UPDATE_SUB_ITEM', id: sub.id, field: 'nome', value: e.target.value })} className={Z.inp} placeholder="Ex: Porta Central" />
                                            </div>
                                        </div>

                                        {/* Fórmulas */}
                                        <div className="grid grid-cols-2 gap-3 bg-[var(--bg-muted)] p-3 rounded-md border border-[var(--border)]">
                                            <div>
                                                <label className={Z.lbl}>Fórmula Largura (X)</label>
                                                <div className="flex items-center gap-2">
                                                    <input value={sub.formulas.largura} onChange={e => dispatch({ type: 'UPDATE_SUB_ITEM_FORMULA', id: sub.id, dimension: 'largura', value: e.target.value })} className={`${Z.inp} font-mono`} placeholder="Ex: (L / 2) - 15" />
                                                    <span className="text-xs text-[var(--text-muted)] min-w-10 text-right font-mono">= {formatRes(sub.formulas.largura)}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className={Z.lbl}>Fórmula Altura (Y)</label>
                                                <div className="flex items-center gap-2">
                                                    <input value={sub.formulas.comprimento} onChange={e => dispatch({ type: 'UPDATE_SUB_ITEM_FORMULA', id: sub.id, dimension: 'comprimento', value: e.target.value })} className={`${Z.inp} font-mono`} placeholder="Ex: A - 160" />
                                                    <span className="text-xs text-[var(--text-muted)] min-w-10 text-right font-mono">= {formatRes(sub.formulas.comprimento)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Regras de Ferragem */}
                                        <div className="border border-yellow-900/40 bg-yellow-900/10 rounded-lg p-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="text-xs font-bold text-[#c8a97e] uppercase tracking-wide flex items-center gap-1"><Ic.Gear /> Ferragens Condicionais</h4>
                                                <button onClick={() => dispatch({ type: 'ADD_REGRA_FERRAGEM', subItemId: sub.id })} className="text-[10px] bg-yellow-900/40 text-[#c8a97e] hover:bg-yellow-900 px-2 py-1 rounded transition-colors">+ Regra IF</button>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                {sub.regras_ferragens.length === 0 && <div className="text-[10px] text-[var(--text-muted)] italic">Ex: IF A {'<='} 1600 THEN 3× Dobradiça 110°</div>}
                                                {sub.regras_ferragens.map(rf => (
                                                    <div key={rf.id} className="flex gap-2 items-center text-xs bg-[var(--bg-muted)] p-2 rounded border border-[var(--border)] group/rule">
                                                        <span className="text-blue-400 font-mono font-bold">IF</span>
                                                        <input value={rf.condicao} onChange={e => dispatch({ type: 'UPDATE_REGRA_FERRAGEM', subItemId: sub.id, ruleId: rf.id, field: 'condicao', value: e.target.value })} className={`${Z.inp} !py-1 !text-[10px] font-mono w-32`} placeholder="A > 1600" />
                                                        <span className={`min-w-6 text-center text-[10px] font-bold ${evalRule(rf.condicao, testVars) === true ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                                                            {evalRule(rf.condicao, testVars) === true ? '(V)' : '(F)'}
                                                        </span>
                                                        <span className="text-yellow-500 font-mono font-bold">THEN</span>
                                                        <input type="number" value={rf.resultado_qtd} onChange={e => dispatch({ type: 'UPDATE_REGRA_FERRAGEM', subItemId: sub.id, ruleId: rf.id, field: 'resultado_qtd', value: Number(e.target.value) })} className={`${Z.inp} !py-1 !w-12 !text-[10px]`} />
                                                        <span className="text-[var(--text-muted)]">×</span>
                                                        <select value={rf.ferragem_id} onChange={e => dispatch({ type: 'UPDATE_REGRA_FERRAGEM', subItemId: sub.id, ruleId: rf.id, field: 'ferragem_id', value: e.target.value })} className={`${Z.inp} !py-1 !text-[10px]`}>
                                                            {DB_FERRAGENS.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                                                        </select>
                                                        <button onClick={() => dispatch({ type: 'REMOVE_REGRA_FERRAGEM', subItemId: sub.id, ruleId: rf.id })} className="text-[var(--text-muted)] hover:text-red-400 p-1 opacity-0 group-hover/rule:opacity-100 transition-opacity"><Ic.X /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
