import { useMemo, useState } from 'react';
import { Box, Layers, Package, Plus, Search, SlidersHorizontal } from 'lucide-react';
import './QuoteCatalogBrowser.css';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const currency = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const TABS = [{ id: 'caixas', label: 'Caixas', Icon: Box }, { id: 'componentes', label: 'Componentes', Icon: Layers }, { id: 'ferragens', label: 'Ferragens e puxadores', Icon: Package }, { id: 'modelos', label: 'Modelos prontos', Icon: SlidersHorizontal }];

function CatalogDrawing({ name, type }) {
    const text = normalize(name);
    if (type === 'ferragens') return <span className="oqc-product-symbol" aria-hidden="true">{text.includes('puxador') ? <svg viewBox="0 0 48 48"><path d="M9 30V19h30v11M14 29v-5h20v5" /></svg> : <Package size={29} strokeWidth={1.1} />}</span>;
    const tall = /alta|torre|roupeiro/.test(text);
    const drawer = /gavet/.test(text);
    const shelf = /prateleira|divis/.test(text);
    return <svg className="oqc-drawing" viewBox="0 0 52 52" aria-hidden="true"><rect x={tall ? 14 : 6} y={tall ? 3 : 10} width={tall ? 24 : 40} height={tall ? 46 : 32} rx="1" />{drawer ? <><path d="M6 20h40M6 31h40M22 15h8M22 25h8M22 36h8" /></> : shelf ? <path d="M7 25h38M7 28h38" /> : type === 'componentes' ? <><path d="M26 11v30M21 24v7M31 24v7" /></> : <><path className="oqc-dashed" d={tall ? 'M17 6h18v40H17Z' : 'M9 13h34v26H9Z'} /><path d={tall ? 'M14 25h24' : 'M6 10h40M6 42h40'} /></>}</svg>;
}

export default function QuoteCatalogBrowser({ catalog, presets, bibItems, selectedItem, items, onSelectItem, onAddBox, onAddPreset, onAddComponent, onAddHardware }) {
    const [tab, setTab] = useState('caixas');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [boxDims, setBoxDims] = useState({ l: 600, a: 720, p: 550 });
    const [page, setPage] = useState(0);
    const source = useMemo(() => {
        if (tab === 'caixas') return (catalog.caixas || []).map(entry => ({ ...entry, key: entry.db_id, label: entry.nome, category: entry.cat || 'Caixaria' }));
        if (tab === 'componentes') return (catalog.componentes || []).map(entry => ({ ...entry, key: entry.db_id, label: entry.nome, category: entry.cat || 'Componentes' }));
        if (tab === 'ferragens') return (bibItems || []).filter(entry => ['ferragem', 'acessorio'].includes(entry.tipo)).map(entry => ({ ...entry, key: entry.cod || `bib_${entry.id}`, label: entry.nome, category: entry.categoria || 'Outros' }));
        return presets.map(entry => ({ ...entry, key: entry.id, label: entry.label, category: entry.group === 'lower' ? 'Inferiores' : 'Aéreos' }));
    }, [tab, catalog, bibItems, presets]);
    const categories = [...new Set(source.map(entry => entry.category))].sort();
    const filtered = source.filter(entry => (!category || entry.category === category) && normalize(`${entry.label} ${entry.category} ${entry.descricao || ''}`).includes(normalize(query)));
    const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
    const visible = filtered.slice(Math.min(page, pageCount - 1) * 6, Math.min(page + 1, pageCount) * 6);
    const needsTarget = ['componentes', 'ferragens'].includes(tab);
    const validDims = ['l', 'a', 'p'].every(key => Number(boxDims[key]) > 0);
    const add = entry => {
        if (tab === 'caixas') onAddBox(entry, Object.fromEntries(Object.entries(boxDims).map(([key, value]) => [key, Number(value)])));
        else if (tab === 'componentes') onAddComponent(entry);
        else if (tab === 'ferragens') onAddHardware(entry);
        else onAddPreset(entry);
    };
    return <section className="oqc-library" aria-label="Biblioteca do Ornato">
        <header className="oqc-header"><div><span className="oqc-eyebrow">CATÁLOGO DO ORNATO</span><h3>Monte o móvel do seu jeito</h3></div><span className="oqc-catalog-count">{catalog.caixas.length} caixas · {catalog.componentes.length} componentes</span></header>
        <div className="oqc-tabs" role="tablist" aria-label="Tipo de item da biblioteca">{TABS.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setCategory(''); setQuery(''); setPage(0); }}><Icon size={16} />{label}</button>)}</div>
        <div className="oqc-search-row"><label className="oqc-search"><Search size={16} /><input aria-label="Buscar no catálogo" placeholder={tab === 'ferragens' ? 'Buscar puxador, dobradiça, corrediça…' : 'Buscar no catálogo…'} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label><select aria-label="Filtrar categoria" value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}><option value="">Todas as categorias</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        {tab === 'caixas' && <div className="oqc-dimension-strip"><span>Medidas da nova caixa <small>em milímetros</small></span>{[['Largura', 'l'], ['Altura', 'a'], ['Profundidade', 'p']].map(([label, key]) => <label key={key}><span>{label}</span><input type="number" min="1" step="1" value={boxDims[key]} onChange={event => setBoxDims(prev => ({ ...prev, [key]: event.target.value }))} /></label>)}</div>}
        {needsTarget && <div className="oqc-target"><div><span>Adicionar ao móvel</span><select aria-label="Móvel que recebe o componente ou ferragem" value={selectedItem?.id || ''} onChange={event => onSelectItem(event.target.value)}><option value="">Selecione um móvel</option>{items.filter(item => item.quick?.group !== 'extras' && item.composition?.group !== 'extras').map(item => <option key={item.id} value={item.id}>{item.nome || item.caixaDef?.nome}</option>)}</select></div><p>{selectedItem ? 'A quantidade adicionada é por unidade deste móvel.' : 'Adicione uma caixa ou selecione um móvel na lista abaixo.'}</p></div>}
        <div className="oqc-grid">{visible.map(entry => {
            const unavailable = (tab === 'modelos' && !entry.available) || (needsTarget && !selectedItem) || (tab === 'caixas' && !validDims);
            return <button key={entry.key} type="button" className="oqc-card" disabled={unavailable} onClick={() => add(entry)} title={tab === 'modelos' && !entry.available ? (entry.missing || []).join(', ') : `Adicionar ${entry.label}`}>
                <CatalogDrawing name={entry.label} type={tab} /><span className="oqc-card-copy"><strong>{entry.label}</strong><small>{tab === 'ferragens' ? `${currency(entry.preco)} / ${entry.unidade || 'un'}` : tab === 'modelos' ? entry.available ? `${entry.defaultDims.l} × ${entry.defaultDims.a} × ${entry.defaultDims.p} mm` : 'Receita indisponível' : tab === 'caixas' ? `${(entry.pecas || []).length} tipos de peça · composição livre` : `${(entry.sub_itens || []).length} ferragens na receita`}</small><em>{entry.category}</em></span><Plus className="oqc-add" size={18} />
            </button>;
        })}</div>
        {!filtered.length && <p className="oqc-empty">Nenhum item encontrado. Confira os filtros e os cadastros da biblioteca.</p>}
        <footer className="oqc-footer"><span>{filtered.length} {filtered.length === 1 ? 'item disponível' : 'itens disponíveis'}{tab === 'caixas' ? ' · portas e ferragens são adicionadas na composição' : ''}</span>{pageCount > 1 && <div><button type="button" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))}>Anterior</button><span>{page + 1} / {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(value => value + 1)}>Próxima</button></div>}</footer>
    </section>;
}
