import { useState, useEffect, useMemo } from 'react';
import { Z, Ic } from '../ui';
import { R$, N } from '../engine';
import api from '../api';
import { Plus, Trash2, Edit2, X, Check, Search, Package, Wrench, Layers, PaintBucket, AlertCircle } from 'lucide-react';

function calcPrecoM2(item) {
    if (item.largura > 0 && item.altura > 0 && item.preco > 0) {
        const area = (item.largura * item.altura) / 1e6;
        const util = area * (1 - (item.perda_pct || 15) / 100);
        return util > 0 ? item.preco / util : 0;
    }
    return item.preco_m2 || 0;
}

const emptyItem = { tipo: 'material', cod: '', nome: '', descricao: '', unidade: 'un', preco: 0, espessura: 0, largura: 0, altura: 0, perda_pct: 15, preco_m2: 0, fita_preco: 0, categoria: '' };

// Categorias fixas — as 3 primeiras são críticas para substituição global (não podem ter typo)
const CATS_FIXAS = ['dobradiça', 'corrediça', 'articulador', 'puxador', 'perfil', 'cabideiro'];

// Selector de categoria: opções fixas + "Outra..." que abre campo de texto livre
function CategoriaFerragem({ value, onChange, categoriasExtras }) {
    const todasOpcoes = [...new Set([...CATS_FIXAS, ...categoriasExtras])];
    const isCustom = value && !todasOpcoes.includes(value);
    const [outraMode, setOutraMode] = useState(isCustom);

    const selectVal = outraMode ? '__outra__' : (value || '');

    const handleSelect = (v) => {
        if (v === '__outra__') { setOutraMode(true); onChange(''); }
        else { setOutraMode(false); onChange(v); }
    };

    return (
        <div>
            <label className={Z.lbl}>Categoria</label>
            <select value={selectVal} onChange={e => handleSelect(e.target.value)} className={Z.inp}>
                <option value="">— selecione —</option>
                <optgroup label="Substituição global">
                    <option value="dobradiça">Dobradiça</option>
                    <option value="corrediça">Corrediça</option>
                    <option value="articulador">Articulador</option>
                </optgroup>
                <optgroup label="Outras">
                    {todasOpcoes.filter(c => !['dobradiça','corrediça','articulador'].includes(c)).map(c => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                    <option value="__outra__">Outra...</option>
                </optgroup>
            </select>
            {outraMode && (
                <input
                    value={value || ''}
                    onChange={e => onChange(e.target.value.toLowerCase())}
                    className={`${Z.inp} mt-1`}
                    placeholder="Digite a nova categoria..."
                    autoFocus
                />
            )}
        </div>
    );
}

export default function Cat() {
    const [items, setItems] = useState([]);
    const [tab, setTab] = useState('material');
    const [search, setSearch] = useState('');
    const [catFiltro, setCatFiltro] = useState('');
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ ...emptyItem });
    const [showForm, setShowForm] = useState(false);

    const load = () => api.get('/biblioteca').then(setItems).catch(() => { });
    useEffect(() => { load(); }, []);

    // Categorias existentes nas ferragens cadastradas (para o sub-filtro)
    const categoriasFerragem = useMemo(() => {
        const cats = items
            .filter(i => i.tipo === 'ferragem' && i.categoria)
            .map(i => i.categoria.toLowerCase())
            .filter((v, i, a) => a.indexOf(v) === i)
            .sort();
        return cats;
    }, [items]);

    const filtered = useMemo(() => {
        let f = items.filter(i => i.tipo === tab);
        if (tab === 'ferragem' && catFiltro) f = f.filter(i => (i.categoria || '').toLowerCase() === catFiltro);
        if (search) f = f.filter(i => i.nome.toLowerCase().includes(search.toLowerCase()) || (i.cod || '').toLowerCase().includes(search.toLowerCase()));
        return f;
    }, [items, tab, search, catFiltro]);

    const openNew = () => {
        const defaults = { material: { unidade: 'chapa', perda_pct: 15 }, acabamento: { unidade: 'm²' }, ferragem: { unidade: 'un' }, componente: { unidade: 'un' } };
        setForm({ ...emptyItem, tipo: tab, ...(defaults[tab] || {}) });
        setEditId(null); setShowForm(true);
    };
    const openEdit = (item) => { setForm({ ...item }); setEditId(item.id); setShowForm(true); };
    const save = async () => {
        if (!form.nome) return;
        try {
            if (editId) await api.put(`/biblioteca/${editId}`, form);
            else await api.post('/biblioteca', form);
            setShowForm(false); load();
        } catch (ex) { console.error(ex); }
    };
    const del = async (id) => { if (confirm('Excluir item?')) { await api.del(`/biblioteca/${id}`); load(); } };
    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const tabs = [
        { id: 'material', lb: 'Materiais', icon: Package, desc: 'Chapas MDF/MDP, compensados com controle de perda', color: '#3b82f6' },
        { id: 'acabamento', lb: 'Acabamentos', icon: PaintBucket, desc: 'BP, lâminas, lacas — preço por m²', color: '#8b5cf6' },
        { id: 'ferragem', lb: 'Ferragens', icon: Wrench, desc: 'Dobradiças, corrediças, puxadores — só preço e unidade', color: '#f59e0b' },
        { id: 'componente', lb: 'Componentes', icon: Layers, desc: 'Cabideiros, sapateiras, cestos aramados', color: '#10b981' },
    ];
    const activeTab = tabs.find(t => t.id === tab);

    return (
        <div className={Z.pg}>
            <div className="mb-5 flex justify-between items-start">
                <div>
                    <h1 className={Z.h1}>Biblioteca</h1>
                    <p className={Z.sub}>Materiais, Ferragens e Componentes — cadastro centralizado</p>
                </div>
                <button onClick={openNew} className={`${Z.btn} flex items-center gap-2`}>
                    <Plus size={14} /> Novo {activeTab?.lb.slice(0, -1) || 'Item'}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
                {tabs.map(t => {
                    const I = t.icon; const active = tab === t.id;
                    const count = items.filter(i => i.tipo === t.id).length;
                    return (
                        <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); setCatFiltro(''); setShowForm(false); }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${active ? 'shadow-sm' : 'hover:bg-[var(--bg-hover)]'}`}
                            style={active ? { background: `${t.color}15`, borderColor: `${t.color}40`, color: t.color } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                            <I size={15} /> {t.lb}
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: active ? `${t.color}20` : 'var(--bg-muted)' }}>{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* Sub-filtro de categorias (só na aba Ferragens) */}
            {tab === 'ferragem' && categoriasFerragem.length > 0 && (
                <div className="flex gap-1.5 mb-3 flex-wrap">
                    <button
                        onClick={() => setCatFiltro('')}
                        className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                        style={!catFiltro ? { background: '#f59e0b20', borderColor: '#f59e0b60', color: '#f59e0b' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                        Todas
                    </button>
                    {categoriasFerragem.map(cat => (
                        <button key={cat}
                            onClick={() => setCatFiltro(cat === catFiltro ? '' : cat)}
                            className="px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize"
                            style={catFiltro === cat ? { background: '#f59e0b20', borderColor: '#f59e0b60', color: '#f59e0b' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            {/* Search */}
            <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar ${activeTab?.lb || ''}...`} className={`${Z.inp} !pl-9`} />
            </div>

            {/* Inline Form */}
            {showForm && (
                <div className={`${Z.card} mb-4`} style={{ borderLeft: `3px solid ${activeTab?.color || 'var(--primary)'}` }}>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{editId ? 'Editar' : 'Novo'} {activeTab?.lb.slice(0, -1)}</h3>
                        <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-[var(--bg-hover)]"><X size={14} /></button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="col-span-2"><label className={Z.lbl}>Nome *</label><input value={form.nome} onChange={e => setF('nome', e.target.value)} className={Z.inp} placeholder="Ex: MDF 18mm" autoFocus /></div>
                        <div><label className={Z.lbl}>Código</label><input value={form.cod} onChange={e => setF('cod', e.target.value)} className={Z.inp} placeholder="mdf18" /></div>
                        <div><label className={Z.lbl}>Preço (R$)</label><input type="number" step="0.01" value={form.preco} onChange={e => setF('preco', +e.target.value)} className={Z.inp} /></div>
                    </div>

                    {tab === 'material' && form.unidade === 'chapa' && (
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-3">
                            <div><label className={Z.lbl}>Espessura (mm)</label><input type="number" value={form.espessura} onChange={e => setF('espessura', +e.target.value)} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Largura (mm)</label><input type="number" value={form.largura} onChange={e => setF('largura', +e.target.value)} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Altura (mm)</label><input type="number" value={form.altura} onChange={e => setF('altura', +e.target.value)} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Perda (%)</label><input type="number" value={form.perda_pct} onChange={e => setF('perda_pct', +e.target.value)} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Fita de Borda (R$/m)</label><input type="number" step="0.01" value={form.fita_preco || 0} onChange={e => setF('fita_preco', +e.target.value)} className={Z.inp} placeholder="0,00" /></div>
                            <div>
                                <label className={Z.lbl}>Preço/m² efetivo</label>
                                <div className="text-sm font-bold py-2 px-3 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--primary)' }}>
                                    {R$(calcPrecoM2(form))}
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'acabamento' && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <div><label className={Z.lbl}>Preço por m²</label><input type="number" step="0.01" value={form.preco_m2 || form.preco} onChange={e => { setF('preco_m2', +e.target.value); setF('preco', +e.target.value); }} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Descrição</label><input value={form.descricao} onChange={e => setF('descricao', e.target.value)} className={Z.inp} placeholder="Ex: Acabamento premium" /></div>
                        </div>
                    )}

                    {(tab === 'ferragem' || tab === 'componente') && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                            <div><label className={Z.lbl}>Unidade</label>
                                <select value={form.unidade} onChange={e => setF('unidade', e.target.value)} className={Z.inp}>
                                    <option value="un">Unidade (un)</option><option value="par">Par</option><option value="m">Metro (m)</option><option value="jogo">Jogo</option>
                                </select>
                            </div>
                            {tab === 'ferragem' && (
                                <CategoriaFerragem
                                    value={form.categoria || ''}
                                    onChange={v => setF('categoria', v)}
                                    categoriasExtras={categoriasFerragem}
                                />
                            )}
                            <div><label className={Z.lbl}>Descrição</label><input value={form.descricao} onChange={e => setF('descricao', e.target.value)} className={Z.inp} /></div>
                        </div>
                    )}

                    {tab === 'material' && (
                        <div className="mt-3">
                            <label className={Z.lbl}>Tipo de Material</label>
                            <div className="flex gap-2">
                                {[['chapa', 'Chapa (dimensões + perda)'], ['m²', 'Por m² (sem chapa)'], ['m', 'Por metro linear']].map(([un, lb]) => (
                                    <button key={un} onClick={() => setF('unidade', un)}
                                        className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${form.unidade === un ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}>
                                        {lb}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 mt-4">
                        <button onClick={save} className={`${Z.btn} flex items-center gap-1 text-xs`}><Check size={13} /> {editId ? 'Atualizar' : 'Cadastrar'}</button>
                        <button onClick={() => setShowForm(false)} className={`${Z.btn2} text-xs`}>Cancelar</button>
                    </div>
                </div>
            )}

            {/* ═══ Items Table ═══ */}
            {(
                <div className={Z.card + " !p-0 overflow-hidden"}>
                    {filtered.length === 0 ? (
                        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                            <AlertCircle size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Nenhum item encontrado</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    <th className={Z.th}>Código</th>
                                    <th className={Z.th}>Nome</th>
                                    {tab === 'material' && <><th className={Z.th}>Esp.</th><th className={Z.th}>Dimensões</th><th className={Z.th}>Perda</th><th className={Z.th + " text-right"}>R$/Chapa</th><th className={Z.th + " text-right"}>R$/m²</th><th className={Z.th + " text-right"}>Fita R$/m</th></>}
                                    {tab === 'acabamento' && <><th className={Z.th + " text-right"}>R$/m²</th></>}
                                    {tab === 'ferragem' && <><th className={Z.th}>Categoria</th><th className={Z.th}>Un</th><th className={Z.th + " text-right"}>Preço</th></>}
                                    {tab === 'componente' && <><th className={Z.th}>Un</th><th className={Z.th + " text-right"}>Preço</th></>}
                                    <th className={Z.th + " text-right w-20"}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(item => (
                                    <tr key={item.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                                        <td className="td-glass font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.cod || '—'}</td>
                                        <td className="td-glass font-medium" style={{ color: 'var(--text-primary)' }}>{item.nome}</td>

                                        {tab === 'material' && <>
                                            <td className="td-glass text-xs">{item.espessura > 0 ? `${item.espessura}mm` : '—'}</td>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>
                                                {item.largura > 0 ? `${item.largura}×${item.altura}mm` : item.unidade}
                                            </td>
                                            <td className="td-glass text-xs">{item.perda_pct > 0 ? `${item.perda_pct}%` : '—'}</td>
                                            <td className="td-glass text-right text-xs" style={{ color: 'var(--text-secondary)' }}>{R$(item.preco)}</td>
                                            <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(calcPrecoM2(item))}</td>
                                            <td className="td-glass text-right text-xs" style={{ color: item.fita_preco > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{item.fita_preco > 0 ? R$(item.fita_preco) + '/m' : '—'}</td>
                                        </>}

                                        {tab === 'acabamento' && <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{item.preco > 0 ? R$(item.preco) + '/m²' : 'Incluso'}</td>}

                                        {tab === 'ferragem' && <>
                                            <td className="td-glass text-xs capitalize" style={{ color: item.categoria ? '#f59e0b' : 'var(--text-muted)' }}>{item.categoria || '—'}</td>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>{item.unidade}</td>
                                            <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(item.preco)}</td>
                                        </>}

                                        {tab === 'componente' && <>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>{item.unidade}</td>
                                            <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(item.preco)}</td>
                                        </>}

                                        <td className="td-glass text-right">
                                            <div className="flex gap-1 justify-end">
                                                <button onClick={() => openEdit(item)} className="p-1 rounded hover:bg-[var(--bg-hover)]" title="Editar"><Edit2 size={12} style={{ color: 'var(--text-muted)' }} /></button>
                                                <button onClick={() => del(item.id)} className="p-1 rounded hover:bg-red-500/10 text-red-400/50 hover:text-red-400" title="Excluir"><Trash2 size={12} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Stats footer */}
            <div className="mt-4 flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                {tabs.map(t => (
                    <span key={t.id}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: t.color }} />{t.lb}: {items.filter(i => i.tipo === t.id).length}</span>
                ))}
            </div>
        </div>
    );
}
