// Tab "Retalhos" — gerenciamento de sobras reaproveitáveis de chapas.
// Refatorado em Fase B: imports enxutos + tokens do design system.
import { useState, useEffect } from 'react';
import api from '../../../api';
import { Z, Modal, Spinner, SearchableSelect } from '../../../ui';
import { Trash2, Plus, Minus, Check, Search as SearchIcon } from 'lucide-react';

export function TabRetalhos({ notify }) {
    const [retalhos, setRetalhos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterMaterial, setFilterMaterial] = useState('');
    const [filterEspessura, setFilterEspessura] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [showAddModal, setShowAddModal] = useState(false);
    const [novoRetalho, setNovoRetalho] = useState({ nome: '', material_code: '', espessura_real: 15, comprimento: 0, largura: 0 });
    const [sortBy, setSortBy] = useState('criado_em');
    const [sortDir, setSortDir] = useState('desc');

    const loadRetalhos = async () => {
        try {
            const data = await api.get('/cnc/retalhos');
            setRetalhos(data || []);
        } catch (err) { notify(err.error || 'Erro ao carregar retalhos'); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadRetalhos(); }, []);

    // Unique material codes and espessuras for filters
    const materiais = [...new Set(retalhos.map(r => r.material_code).filter(Boolean))].sort();
    const espessuras = [...new Set(retalhos.map(r => r.espessura_real).filter(Boolean))].sort((a, b) => a - b);

    // Filter + search
    const filtered = retalhos.filter(r => {
        if (filterMaterial && r.material_code !== filterMaterial) return false;
        if (filterEspessura && r.espessura_real !== Number(filterEspessura)) return false;
        if (search) {
            const s = search.toLowerCase();
            const match = (r.nome || '').toLowerCase().includes(s) ||
                (r.material_code || '').toLowerCase().includes(s) ||
                `${r.comprimento}x${r.largura}`.includes(s);
            if (!match) return false;
        }
        return true;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
        let va, vb;
        switch (sortBy) {
            case 'area': va = a.comprimento * a.largura; vb = b.comprimento * b.largura; break;
            case 'comprimento': va = a.comprimento; vb = b.comprimento; break;
            case 'largura': va = a.largura; vb = b.largura; break;
            case 'espessura': va = a.espessura_real; vb = b.espessura_real; break;
            case 'material': va = a.material_code || ''; vb = b.material_code || ''; return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            default: va = new Date(a.criado_em || 0).getTime(); vb = new Date(b.criado_em || 0).getTime();
        }
        return sortDir === 'asc' ? va - vb : vb - va;
    });

    const toggleSelect = (id) => setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const selectAllFiltered = () => {
        if (selected.size === sorted.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(sorted.map(r => r.id)));
        }
    };

    const deleteSelected = async () => {
        if (selected.size === 0) return;
        if (!confirm(`Excluir ${selected.size} retalho(s) permanentemente?`)) return;
        try {
            for (const id of selected) {
                await api.del(`/cnc/retalhos/${id}`);
            }
            notify(`${selected.size} retalho(s) excluído(s)`);
            setSelected(new Set());
            loadRetalhos();
        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
    };

    const addRetalho = async () => {
        if (!novoRetalho.comprimento || !novoRetalho.largura) {
            notify('Informe comprimento e largura'); return;
        }
        try {
            await api.post('/cnc/retalhos', novoRetalho);
            notify('Retalho adicionado');
            setShowAddModal(false);
            setNovoRetalho({ nome: '', material_code: '', espessura_real: 15, comprimento: 0, largura: 0 });
            loadRetalhos();
        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
    };

    const SortHeader = ({ label, field, w }) => (
        <th onClick={() => { if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(field); setSortDir('desc'); } }}
            style={{ cursor: 'pointer', padding: '10px 12px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)',
                letterSpacing: 0.3, textAlign: 'left', userSelect: 'none', width: w, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
            {label} {sortBy === field && (sortDir === 'asc' ? '↑' : '↓')}
        </th>
    );

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

    return (
        <div style={{ maxWidth: 1100 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Gerenciar Retalhos</h2>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{retalhos.length} retalhos disponíveis · {filtered.length} exibidos</div>
                </div>
                <button onClick={() => setShowAddModal(true)} className={Z.btn} style={{ padding: '8px 16px', fontSize: 12, gap: 6 }}>
                    <Plus size={14} /> Adicionar Retalho
                </button>
            </div>

            {/* Filters bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
                    <SearchIcon size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, material, dimensão..."
                        className={Z.inp} style={{ paddingLeft: 32, fontSize: 12, width: '100%' }} />
                </div>
                {/* Material filter — searchable */}
                <SearchableSelect
                    value={filterMaterial}
                    onChange={v => setFilterMaterial(v)}
                    emptyOption="Todos os materiais"
                    options={materiais.map(m => ({ value: m, label: m.replace(/_/g, ' ') }))}
                    placeholder="Buscar material..."
                    className={Z.inp}
                    style={{ minWidth: 200 }}
                />
                {/* Espessura filter — searchable */}
                <SearchableSelect
                    value={filterEspessura}
                    onChange={v => setFilterEspessura(v)}
                    emptyOption="Todas espessuras"
                    options={espessuras.map(e => ({ value: String(e), label: `${e}mm` }))}
                    placeholder="Buscar esp..."
                    className={Z.inp}
                    style={{ minWidth: 120 }}
                />
                {/* Bulk actions */}
                {selected.size > 0 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                        <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>{selected.size} selecionado(s)</span>
                        <button onClick={deleteSelected} className="btn-secondary"
                            style={{ padding: '5px 12px', fontSize: 12, color: 'var(--danger)', borderColor: 'var(--danger)', gap: 4 }}>
                            <Trash2 size={12} /> Excluir
                        </button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-muted)' }}>
                            <th style={{ width: 36, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                                <div onClick={selectAllFiltered}
                                    style={{
                                        width: 16, height: 16, borderRadius: 3, cursor: 'pointer',
                                        border: `2px solid ${selected.size > 0 && selected.size === sorted.length ? 'var(--primary)' : 'var(--border)'}`,
                                        background: selected.size > 0 && selected.size === sorted.length ? 'var(--primary)' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                    {selected.size > 0 && selected.size === sorted.length && <Check size={10} color="#fff" />}
                                    {selected.size > 0 && selected.size < sorted.length && <Minus size={10} color="var(--primary)" />}
                                </div>
                            </th>
                            <SortHeader label="Nome" field="nome" />
                            <SortHeader label="Material" field="material" />
                            <SortHeader label="Esp." field="espessura" w={60} />
                            <SortHeader label="Comprimento" field="comprimento" w={90} />
                            <SortHeader label="Largura" field="largura" w={80} />
                            <SortHeader label="Área" field="area" w={80} />
                            <SortHeader label="Data" field="criado_em" w={90} />
                            <th style={{ width: 50, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 ? (
                            <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                                {search || filterMaterial || filterEspessura ? 'Nenhum retalho encontrado com os filtros aplicados' : 'Nenhum retalho disponível'}
                            </td></tr>
                        ) : sorted.map(r => (
                            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                <td style={{ padding: '6px 10px' }}>
                                    <div onClick={() => toggleSelect(r.id)}
                                        style={{
                                            width: 16, height: 16, borderRadius: 3, cursor: 'pointer',
                                            border: `2px solid ${selected.has(r.id) ? 'var(--primary)' : 'var(--border)'}`,
                                            background: selected.has(r.id) ? 'var(--primary)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                        {selected.has(r.id) && <Check size={10} color="#fff" />}
                                    </div>
                                </td>
                                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{r.nome || `Retalho ${r.comprimento}x${r.largura}`}</td>
                                <td style={{ padding: '10px 12px', fontSize: 12 }}>
                                    <span style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', fontSize: 11, color: 'var(--text-muted)' }}>
                                        {(r.material_code || '').replace(/_/g, ' ')}
                                    </span>
                                </td>
                                <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{r.espessura_real}mm</td>
                                <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.comprimento}mm</td>
                                <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.largura}mm</td>
                                <td style={{ padding: '10px 12px', fontSize: 12, textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                    {(r.comprimento * r.largura / 1000000).toFixed(3)} m²
                                </td>
                                <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                                    {r.criado_em ? new Date(r.criado_em).toLocaleDateString('pt-BR') : '—'}
                                </td>
                                <td style={{ padding: '6px 10px' }}>
                                    <button onClick={async () => {
                                        if (!confirm('Excluir este retalho permanentemente?')) return;
                                        try {
                                            await api.del(`/cnc/retalhos/${r.id}`);
                                            notify('Retalho excluído');
                                            loadRetalhos();
                                            setSelected(prev => { const next = new Set(prev); next.delete(r.id); return next; });
                                        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
                                    }} style={{ padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 4 }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add Retalho Modal */}
            {showAddModal && (
                <Modal title="Adicionar Retalho" close={() => setShowAddModal(false)} w={450}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nome (opcional)</label>
                            <input value={novoRetalho.nome} onChange={e => setNovoRetalho(p => ({ ...p, nome: e.target.value }))}
                                className={Z.inp} placeholder="Ex: Sobra bancada cozinha" style={{ width: '100%', fontSize: 12 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Código do Material</label>
                            <input value={novoRetalho.material_code} onChange={e => setNovoRetalho(p => ({ ...p, material_code: e.target.value }))}
                                className={Z.inp} placeholder="Ex: MDF_15.5_BRANCO_TX" style={{ width: '100%', fontSize: 12 }}
                                list="materiais-list" />
                            <datalist id="materiais-list">
                                {materiais.map(m => <option key={m} value={m} />)}
                            </datalist>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Espessura (mm)</label>
                                <input type="number" value={novoRetalho.espessura_real} onChange={e => setNovoRetalho(p => ({ ...p, espessura_real: Number(e.target.value) }))}
                                    className={Z.inp} style={{ width: '100%', fontSize: 12 }} min={0} step={0.5} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Comprimento (mm)</label>
                                <input type="number" value={novoRetalho.comprimento} onChange={e => setNovoRetalho(p => ({ ...p, comprimento: Number(e.target.value) }))}
                                    className={Z.inp} style={{ width: '100%', fontSize: 12 }} min={0} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Largura (mm)</label>
                                <input type="number" value={novoRetalho.largura} onChange={e => setNovoRetalho(p => ({ ...p, largura: Number(e.target.value) }))}
                                    className={Z.inp} style={{ width: '100%', fontSize: 12 }} min={0} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                            <button onClick={() => setShowAddModal(false)} className="btn-secondary" style={{ padding: '8px 16px', fontSize: 12 }}>Cancelar</button>
                            <button onClick={addRetalho} className={Z.btn} style={{ padding: '8px 20px', fontSize: 12, fontWeight: 700 }}>
                                <Plus size={14} /> Adicionar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

