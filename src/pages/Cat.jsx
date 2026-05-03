import { useState, useEffect, useMemo, useRef } from 'react';
import { Z, Ic, PageHeader, TabBar, EmptyState, ConfirmModal } from '../ui';
import { R$, N } from '../engine';
import api from '../api';
import { Plus, Trash2, Edit2, X, Check, Search, Package, Wrench, Layers, PaintBucket, AlertCircle, Square, Sofa, RectangleHorizontal, GlassWater, Shapes, Download, Upload } from 'lucide-react';

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

export default function Cat({ notify }) {
    const [items, setItems] = useState([]);
    const [tab, setTab] = useState('material');
    const [search, setSearch] = useState('');
    const [catFiltro, setCatFiltro] = useState('');
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ ...emptyItem });
    const [showForm, setShowForm] = useState(false);
    const [confirmDelId, setConfirmDelId] = useState(null);
    const [confirmImport, setConfirmImport] = useState(null); // { arr, tiposNoArquivo }

    const load = () => api.get('/biblioteca').then(setItems).catch(e => console.error('Erro ao carregar biblioteca:', e));
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
        const defaults = { material: { unidade: 'chapa', perda_pct: 15 }, acabamento: { unidade: 'm²' }, ferragem: { unidade: 'un' }, acessorio: { unidade: 'un' }, espelho: { unidade: 'm²' }, estofado: { unidade: 'm²' }, aluminio: { unidade: 'm' }, vidro: { unidade: 'm²' } };
        setForm({ ...emptyItem, tipo: tab, ...(defaults[tab] || {}) });
        setEditId(null); setShowForm(true);
    };
    const openEdit = (item) => { setForm({ ...item }); setEditId(item.id); setShowForm(true); };
    const save = async () => {
        if (!form.nome) return;
        try {
            // Fase 5: auto-set data de atualização do preço
            const payload = { ...form, preco_atualizado_em: new Date().toISOString().slice(0, 10) };
            if (editId) await api.put(`/biblioteca/${editId}`, payload);
            else await api.post('/biblioteca', payload);
            setShowForm(false); load();
        } catch (ex) { console.error(ex); }
    };
    const del = async (id) => setConfirmDelId(id);
    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const importRef = useRef(null);

    // ── Export: JSON da aba atual ─────────────────────────────────────────────
    const exportBiblioteca = () => {
        const data = items.filter(i => i.tipo === tab);
        if (!data.length) return notify('Nenhum item para exportar nesta aba.');
        const clean = data.map(({ id, ativo, criado_em, atualizado_em, ...rest }) => rest);
        const json = JSON.stringify(clean, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `biblioteca-${tab}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Import: JSON → POST sequencial ───────────────────────────────────────
    const importBiblioteca = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            const arr = JSON.parse(text);
            if (!Array.isArray(arr) || !arr.length) return notify('Arquivo vazio ou formato inválido. Esperado: array JSON.');
            const invalidos = arr.filter(i => !i.nome);
            if (invalidos.length) return notify(`${invalidos.length} item(ns) sem nome. Todos os itens precisam ter o campo "nome".`);
            const tiposNoArquivo = [...new Set(arr.map(i => i.tipo))].join(', ');
            setConfirmImport({ arr, tiposNoArquivo });
        } catch { notify('Erro ao ler arquivo. Verifique se é um JSON válido.'); }
    };
    const executarImport = async ({ arr }) => {
        setConfirmImport(null);
        let ok = 0, erros = 0;
            for (const item of arr) {
                try {
                    await api.post('/biblioteca', {
                        tipo: item.tipo || tab,
                        cod: item.cod || '',
                        nome: item.nome,
                        descricao: item.descricao || '',
                        unidade: item.unidade || 'un',
                        preco: Number(item.preco) || 0,
                        espessura: Number(item.espessura) || 0,
                        largura: Number(item.largura) || 0,
                        altura: Number(item.altura) || 0,
                        perda_pct: Number(item.perda_pct) || 15,
                        preco_m2: Number(item.preco_m2) || 0,
                        fita_preco: Number(item.fita_preco) || 0,
                        categoria: item.categoria || '',
                    });
                    ok++;
                } catch { erros++; }
            }
            load();
            notify(`Importação concluída: ${ok} de ${arr.length} item(ns) importados.${erros ? ` ${erros} erro(s).` : ''}`);
    };

    const tabs = [
        { id: 'material', label: 'Materiais', icon: Package },
        { id: 'acabamento', label: 'Acabamentos', icon: PaintBucket },
        { id: 'ferragem', label: 'Ferragens', icon: Wrench },
        { id: 'acessorio', label: 'Acessórios', icon: Layers },
        { id: 'espelho', label: 'Espelhos', icon: Square },
        { id: 'estofado', label: 'Estofados', icon: Sofa },
        { id: 'aluminio', label: 'Alumínio', icon: RectangleHorizontal },
        { id: 'vidro', label: 'Vidros', icon: GlassWater },
    ];
    const activeTab = tabs.find(t => t.id === tab);

    return (
        <div className={Z.pg}>
            <PageHeader icon={Shapes} title="Biblioteca" subtitle="Materiais, Ferragens e Acessórios — cadastro centralizado">
                <button onClick={exportBiblioteca} className={`${Z.btn2} flex items-center gap-1 text-xs`} title="Exportar aba atual">
                    <Download size={13} /> Exportar
                </button>
                <button onClick={() => importRef.current?.click()} className={`${Z.btn2} flex items-center gap-1 text-xs`} title="Importar JSON">
                    <Upload size={13} /> Importar
                </button>
                <button onClick={openNew} className={`${Z.btn} flex items-center gap-2`}>
                    <Plus size={14} /> Novo {activeTab?.label.slice(0, -1) || 'Item'}
                </button>
            </PageHeader>
            <input ref={importRef} type="file" accept=".json" onChange={importBiblioteca} className="hidden" />

            {/* Tabs */}
            <TabBar
                tabs={tabs.map(t => ({ ...t, badge: items.filter(i => i.tipo === t.id).length || undefined }))}
                active={tab}
                onChange={v => { setTab(v); setSearch(''); setCatFiltro(''); setShowForm(false); }}
            />

            {/* Sub-filtro de categorias (só na aba Ferragens) */}
            {tab === 'ferragem' && categoriasFerragem.length > 0 && (
                <div className="flex gap-1.5 mb-3 flex-wrap">
                    <button
                        onClick={() => setCatFiltro('')}
                        className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                        style={!catFiltro ? { background: 'color-mix(in srgb, var(--warning) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 37%, transparent)', color: 'var(--warning)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                        Todas
                    </button>
                    {categoriasFerragem.map(cat => (
                        <button key={cat}
                            onClick={() => setCatFiltro(cat === catFiltro ? '' : cat)}
                            className="px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize"
                            style={catFiltro === cat ? { background: 'color-mix(in srgb, var(--warning) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--warning) 37%, transparent)', color: 'var(--warning)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            {/* Search */}
            <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar ${activeTab?.label || ''}...`} className={`${Z.inp} !pl-9`} />
            </div>

            {/* Inline Form */}
            {showForm && (
                <div className={`${Z.card} mb-4`} style={{ borderLeft: '3px solid var(--primary)' }}>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{editId ? 'Editar' : 'Novo'} {activeTab?.label.slice(0, -1)}</h3>
                        <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-[var(--bg-hover)]" title="Fechar"><X size={14} /></button>
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

                    {(tab === 'ferragem' || tab === 'acessorio') && (
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

                    {['espelho', 'estofado', 'vidro'].includes(tab) && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <div><label className={Z.lbl}>Preço por m² (R$)</label><input type="number" step="0.01" value={form.preco_m2 || form.preco} onChange={e => { setF('preco_m2', +e.target.value); setF('preco', +e.target.value); }} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Descrição</label><input value={form.descricao} onChange={e => setF('descricao', e.target.value)} className={Z.inp} placeholder="Ex: Bisotê 4mm, Suede premium..." /></div>
                        </div>
                    )}

                    {tab === 'aluminio' && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                            <div><label className={Z.lbl}>Preço por metro linear (R$)</label><input type="number" step="0.01" value={form.preco} onChange={e => setF('preco', +e.target.value)} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Cor/Acabamento</label><input value={form.categoria || ''} onChange={e => setF('categoria', e.target.value)} className={Z.inp} placeholder="Ex: Preto anodizado" /></div>
                            <div><label className={Z.lbl}>Descrição</label><input value={form.descricao} onChange={e => setF('descricao', e.target.value)} className={Z.inp} placeholder="Ex: Perfil 40x20mm" /></div>
                        </div>
                    )}

                    <div className="flex gap-2 mt-4">
                        <button onClick={save} className={`${Z.btn} flex items-center gap-1 text-xs`}><Check size={13} /> {editId ? 'Atualizar' : 'Cadastrar'}</button>
                        <button onClick={() => setShowForm(false)} className={`${Z.btn2} text-xs`}>Cancelar</button>
                    </div>
                </div>
            )}

            {/* Items Table */}
            {(
                <div className={Z.card + " !p-0 overflow-hidden"}>
                    {filtered.length === 0 ? (
                        <EmptyState icon={AlertCircle} title="Nenhum item encontrado" description={`Nenhum resultado para a busca em ${activeTab?.label || 'itens'}`} />
                    ) : (
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    <th className={Z.th}>Código</th>
                                    <th className={Z.th}>Nome</th>
                                    {tab === 'material' && <><th className={Z.th}>Esp.</th><th className={Z.th}>Dimensões</th><th className={Z.th}>Perda</th><th className={Z.th + " text-right"}>R$/Chapa</th><th className={Z.th + " text-right"}>R$/m²</th><th className={Z.th + " text-right"}>Fita R$/m</th><th className={Z.th + " text-center"}>Idade</th></>}
                                    {tab === 'acabamento' && <><th className={Z.th + " text-right"}>R$/m²</th></>}
                                    {tab === 'ferragem' && <><th className={Z.th}>Categoria</th><th className={Z.th}>Un</th><th className={Z.th + " text-right"}>Preço</th></>}
                                    {tab === 'acessorio' && <><th className={Z.th}>Un</th><th className={Z.th + " text-right"}>Preço</th></>}
                                    {['espelho', 'estofado', 'vidro'].includes(tab) && <><th className={Z.th + " text-right"}>R$/m²</th><th className={Z.th}>Descrição</th></>}
                                    {tab === 'aluminio' && <><th className={Z.th}>Cor/Acab.</th><th className={Z.th + " text-right"}>R$/ml</th><th className={Z.th}>Descrição</th></>}
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
                                            <td className="td-glass text-right text-xs" style={{ color: item.fita_preco > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{item.fita_preco > 0 ? R$(item.fita_preco) + '/m' : '—'}</td>
                                            <td className="td-glass text-center text-[9px]">
                                                {(() => {
                                                    if (!item.preco_atualizado_em) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                                                    const dias = Math.floor((Date.now() - new Date(item.preco_atualizado_em).getTime()) / 86400000);
                                                    const validade = item.preco_validade_dias || 90;
                                                    const vencido = dias > validade;
                                                    return <span style={{ color: vencido ? 'var(--danger)' : dias > validade * 0.8 ? 'var(--warning)' : 'var(--text-muted)' }}
                                                        title={`Atualizado em ${item.preco_atualizado_em} — ${dias}d atrás`}>
                                                        {dias}d {vencido && '!'}
                                                    </span>;
                                                })()}
                                            </td>
                                        </>}

                                        {tab === 'acabamento' && <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{item.preco > 0 ? R$(item.preco) + '/m²' : 'Incluso'}</td>}

                                        {tab === 'ferragem' && <>
                                            <td className="td-glass text-xs capitalize" style={{ color: item.categoria ? 'var(--warning)' : 'var(--text-muted)' }}>{item.categoria || '—'}</td>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>{item.unidade}</td>
                                            <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(item.preco)}</td>
                                        </>}

                                        {tab === 'acessorio' && <>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>{item.unidade}</td>
                                            <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(item.preco)}</td>
                                        </>}

                                        {['espelho', 'estofado', 'vidro'].includes(tab) && <>
                                            <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(item.preco_m2 || item.preco)}/m²</td>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>{item.descricao || '—'}</td>
                                        </>}

                                        {tab === 'aluminio' && <>
                                            <td className="td-glass text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>{item.categoria || '—'}</td>
                                            <td className="td-glass text-right font-bold text-xs" style={{ color: 'var(--primary)' }}>{R$(item.preco)}/ml</td>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>{item.descricao || '—'}</td>
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
                <span>Total: {items.length} itens em {tabs.length} categorias</span>
            </div>

            {confirmDelId && (
                <ConfirmModal
                    title="Excluir item"
                    message="Tem certeza que deseja excluir este item do catálogo? Esta ação não pode ser desfeita."
                    confirmLabel="Excluir"
                    danger
                    onConfirm={async () => { await api.del(`/biblioteca/${confirmDelId}`); setConfirmDelId(null); load(); }}
                    onCancel={() => setConfirmDelId(null)}
                />
            )}
            {confirmImport && (
                <ConfirmModal
                    title="Importar itens"
                    message={`Importar ${confirmImport.arr.length} item(ns) (${confirmImport.tiposNoArquivo})? Itens existentes não serão alterados.`}
                    confirmLabel="Importar"
                    onConfirm={() => executarImport(confirmImport)}
                    onCancel={() => setConfirmImport(null)}
                />
            )}
        </div>
    );
}
