// Tab "Retalhos" — gerenciamento de sobras reaproveitáveis de chapas.
// Fase C: usa SectionHeader + EmptyState + ConfirmModal + Modal do design system.

import { useState, useEffect, useRef } from 'react';
import api from '../../../api';
import {
    Z, Modal, Spinner, SearchableSelect, SectionHeader, EmptyState, ConfirmModal,
} from '../../../ui';
import {
    Trash2, Plus, Box, Search as SearchIcon,
    ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';

export function TabRetalhos({ notify }) {
    const [retalhos, setRetalhos] = useState([]);
    const [loading, setLoading] = useState(true);
    // P31: debounce na busca — evita re-render a cada keystroke
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const debounceRef = useRef(null);
    const handleSearchChange = (val) => {
        setSearchInput(val);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => setSearch(val), 220);
    };
    const [filterMaterial, setFilterMaterial] = useState('');
    const [filterEspessura, setFilterEspessura] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [showAddModal, setShowAddModal] = useState(false);
    const [novoRetalho, setNovoRetalho] = useState({
        nome: '', material_code: '', espessura_real: 15, comprimento: 0, largura: 0,
    });
    const [sortBy, setSortBy] = useState('criado_em');
    const [sortDir, setSortDir] = useState('desc');
    const [deleteTarget, setDeleteTarget] = useState(null); // { ids: Set|[id], label }

    const loadRetalhos = async () => {
        try {
            const data = await api.get('/cnc/retalhos');
            setRetalhos(data || []);
        } catch (err) { notify(err.error || 'Erro ao carregar retalhos'); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadRetalhos(); }, []);

    const materiais = [...new Set(retalhos.map(r => r.material_code).filter(Boolean))].sort();
    const espessuras = [...new Set(retalhos.map(r => r.espessura_real).filter(Boolean))].sort((a, b) => a - b);

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

    const sorted = [...filtered].sort((a, b) => {
        let va, vb;
        switch (sortBy) {
            case 'area': va = a.comprimento * a.largura; vb = b.comprimento * b.largura; break;
            case 'comprimento': va = a.comprimento; vb = b.comprimento; break;
            case 'largura': va = a.largura; vb = b.largura; break;
            case 'espessura': va = a.espessura_real; vb = b.espessura_real; break;
            case 'material':
                va = a.material_code || ''; vb = b.material_code || '';
                return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
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
        if (selected.size === sorted.length) setSelected(new Set());
        else setSelected(new Set(sorted.map(r => r.id)));
    };

    const confirmBulkDelete = async () => {
        const ids = [...selected];
        try {
            const results = await Promise.allSettled(ids.map(id => api.del(`/cnc/retalhos/${id}`)));
            const ok = results.filter(r => r.status === 'fulfilled').length;
            const fail = results.length - ok;
            if (fail > 0) {
                notify(`${ok} excluído(s), ${fail} falhou — recarregando lista`);
            } else {
                notify(`${ok} retalho(s) excluído(s)`);
            }
            setSelected(new Set());
            loadRetalhos();
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setDeleteTarget(null);
        }
    };

    const confirmSingleDelete = async () => {
        try {
            await api.del(`/cnc/retalhos/${deleteTarget.single}`);
            notify('Retalho excluído');
            setSelected(prev => { const n = new Set(prev); n.delete(deleteTarget.single); return n; });
            loadRetalhos();
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setDeleteTarget(null);
        }
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

    const SortIcon = ({ field }) => {
        if (sortBy !== field) return <ArrowUpDown size={11} style={{ opacity: 0.4 }} />;
        return sortDir === 'asc'
            ? <ArrowUp size={11} style={{ color: 'var(--primary)' }} />
            : <ArrowDown size={11} style={{ color: 'var(--primary)' }} />;
    };

    const sortTh = (label, field, width) => (
        <th
            className="th-glass"
            style={{ width, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => {
                if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                else { setSortBy(field); setSortDir('desc'); }
            }}
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {label} <SortIcon field={field} />
            </span>
        </th>
    );

    if (loading) return <Spinner size={32} text="Carregando retalhos…" />;

    return (
        <>
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <SectionHeader
                    icon={Box}
                    title="Retalhos"
                    accent="var(--accent)"
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                            {filtered.length} / {retalhos.length}
                        </span>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="btn-primary btn-sm"
                            style={{ fontSize: 12, gap: 6 }}
                        >
                            <Plus size={13} /> Adicionar
                        </button>
                    </div>
                </SectionHeader>

                {/* Toolbar de filtros */}
                <div style={{
                    display: 'flex', gap: 10, padding: '12px 20px', flexWrap: 'wrap',
                    alignItems: 'center', borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-subtle)',
                }}>
                    <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
                        <SearchIcon
                            size={14}
                            style={{
                                position: 'absolute', left: 12, top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-muted)',
                                pointerEvents: 'none',
                            }}
                        />
                        <input
                            value={searchInput}
                            onChange={e => handleSearchChange(e.target.value)}
                            placeholder="Buscar por nome, material ou dimensão…"
                            className={Z.inp}
                            style={{ paddingLeft: 34, fontSize: 13, width: '100%' }}
                            aria-label="Buscar retalho"
                        />
                    </div>
                    <SearchableSelect
                        value={filterMaterial}
                        onChange={v => setFilterMaterial(v)}
                        emptyOption="Todos os materiais"
                        options={materiais.map(m => ({ value: m, label: m.replace(/_/g, ' ') }))}
                        placeholder="Buscar material…"
                        className={Z.inp}
                        style={{ minWidth: 200 }}
                    />
                    <SearchableSelect
                        value={filterEspessura}
                        onChange={v => setFilterEspessura(v)}
                        emptyOption="Todas espessuras"
                        options={espessuras.map(e => ({ value: String(e), label: `${e}mm` }))}
                        placeholder="Buscar esp…"
                        className={Z.inp}
                        style={{ minWidth: 140 }}
                    />
                    {selected.size > 0 && (
                        <div style={{
                            display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto',
                            padding: '4px 10px', borderRadius: 8,
                            background: 'var(--primary-alpha)',
                            border: '1px solid var(--primary)',
                        }}>
                            <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>
                                {selected.size} selecionado(s)
                            </span>
                            <button
                                onClick={() => setDeleteTarget({ bulk: true })}
                                className="btn-danger btn-sm"
                                style={{ fontSize: 11, gap: 4, padding: '4px 10px' }}
                            >
                                <Trash2 size={12} /> Excluir
                            </button>
                        </div>
                    )}
                </div>

                {/* Tabela ou empty state */}
                {sorted.length === 0 ? (
                    <EmptyState
                        icon={Box}
                        title={
                            search || filterMaterial || filterEspessura
                                ? 'Nenhum retalho encontrado'
                                : 'Nenhum retalho disponível'
                        }
                        description={
                            search || filterMaterial || filterEspessura
                                ? 'Tente limpar os filtros ou buscar por outro termo.'
                                : 'Os retalhos gerados ao cortar lotes aparecem aqui, e também podem ser cadastrados manualmente.'
                        }
                        action={
                            !(search || filterMaterial || filterEspessura)
                                ? { label: 'Adicionar retalho', onClick: () => setShowAddModal(true) }
                                : null
                        }
                    />
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th className="th-glass" style={{ width: 40, textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={selected.size > 0 && selected.size === sorted.length}
                                            ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < sorted.length; }}
                                            onChange={selectAllFiltered}
                                            style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                                            aria-label="Selecionar todos"
                                        />
                                    </th>
                                    {sortTh('Nome', 'nome')}
                                    {sortTh('Material', 'material')}
                                    {sortTh('Esp.', 'espessura', 70)}
                                    {sortTh('Comp.', 'comprimento', 90)}
                                    {sortTh('Larg.', 'largura', 90)}
                                    {sortTh('Área', 'area', 90)}
                                    {sortTh('Data', 'criado_em', 100)}
                                    <th className="th-glass" style={{ width: 50 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map(r => (
                                    <tr
                                        key={r.id}
                                        style={{
                                            background: selected.has(r.id) ? 'var(--primary-alpha)' : undefined,
                                            transition: 'background .15s', // P35
                                        }}
                                    >
                                        <td className="td-glass" style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(r.id)}
                                                onChange={() => toggleSelect(r.id)}
                                                style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                                                aria-label={`Selecionar ${r.nome}`}
                                            />
                                        </td>
                                        <td className="td-glass" style={{ fontWeight: 600 }}>
                                            {r.nome || `Retalho ${r.comprimento}×${r.largura}`}
                                        </td>
                                        <td className="td-glass">
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '3px 8px', borderRadius: 6,
                                                background: 'var(--bg-muted)',
                                                fontSize: 11, color: 'var(--text-muted)',
                                                fontWeight: 500,
                                            }}>
                                                {(r.material_code || '—').replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="td-glass" style={{
                                            textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {r.espessura_real}mm
                                        </td>
                                        <td className="td-glass" style={{
                                            textAlign: 'right', fontWeight: 600,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {r.comprimento}
                                        </td>
                                        <td className="td-glass" style={{
                                            textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {r.largura}
                                        </td>
                                        <td className="td-glass" style={{
                                            textAlign: 'right', color: 'var(--text-muted)',
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {(r.comprimento * r.largura / 1000000).toFixed(3)} m²
                                        </td>
                                        <td className="td-glass" style={{
                                            color: 'var(--text-muted)',
                                            fontVariantNumeric: 'tabular-nums',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {r.criado_em ? new Date(r.criado_em).toLocaleDateString('pt-BR') : '—'}
                                        </td>
                                        <td className="td-glass">
                                            <button
                                                onClick={() => setDeleteTarget({ single: r.id, label: r.nome || `Retalho ${r.comprimento}×${r.largura}` })}
                                                title="Excluir"
                                                aria-label={`Excluir retalho ${r.nome || r.id}`}
                                                style={{
                                                    padding: 6, borderRadius: 6,
                                                    background: 'transparent', border: 'none',
                                                    color: 'var(--text-muted)', cursor: 'pointer',
                                                    transition: 'all .15s',
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.color = 'var(--danger)';
                                                    e.currentTarget.style.background = 'var(--danger-bg)';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.color = 'var(--text-muted)';
                                                    e.currentTarget.style.background = 'transparent';
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal adicionar retalho */}
            {showAddModal && (
                <Modal title="Adicionar Retalho" close={() => setShowAddModal(false)} w={480}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Field label="Nome (opcional)">
                            <input
                                value={novoRetalho.nome}
                                onChange={e => setNovoRetalho(p => ({ ...p, nome: e.target.value }))}
                                className={Z.inp}
                                placeholder="Ex: Sobra bancada cozinha"
                                style={{ width: '100%', fontSize: 13 }}
                            />
                        </Field>
                        <Field label="Código do material">
                            <input
                                value={novoRetalho.material_code}
                                onChange={e => setNovoRetalho(p => ({ ...p, material_code: e.target.value }))}
                                className={Z.inp}
                                placeholder="Ex: MDF_15.5_BRANCO_TX"
                                style={{ width: '100%', fontSize: 13 }}
                                list="materiais-list"
                            />
                            <datalist id="materiais-list">
                                {materiais.map(m => <option key={m} value={m} />)}
                            </datalist>
                        </Field>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <Field label="Espessura (mm)" flex={1}>
                                <input
                                    type="number"
                                    value={novoRetalho.espessura_real}
                                    onChange={e => setNovoRetalho(p => ({ ...p, espessura_real: Number(e.target.value) }))}
                                    className={Z.inp}
                                    style={{ width: '100%', fontSize: 13 }}
                                    min={0} step={0.5}
                                />
                            </Field>
                            <Field label="Comprimento (mm)" flex={1}>
                                <input
                                    type="number"
                                    value={novoRetalho.comprimento}
                                    onChange={e => setNovoRetalho(p => ({ ...p, comprimento: Number(e.target.value) }))}
                                    className={Z.inp}
                                    style={{ width: '100%', fontSize: 13 }}
                                    min={0}
                                />
                            </Field>
                            <Field label="Largura (mm)" flex={1}>
                                <input
                                    type="number"
                                    value={novoRetalho.largura}
                                    onChange={e => setNovoRetalho(p => ({ ...p, largura: Number(e.target.value) }))}
                                    className={Z.inp}
                                    style={{ width: '100%', fontSize: 13 }}
                                    min={0}
                                />
                            </Field>
                        </div>
                        <div style={{
                            display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4,
                        }}>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="btn-secondary"
                                style={{ padding: '8px 16px', fontSize: 13 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={addRetalho}
                                className="btn-primary"
                                style={{ padding: '8px 20px', fontSize: 13, gap: 6 }}
                            >
                                <Plus size={14} /> Adicionar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Confirmação de exclusão */}
            {deleteTarget?.single && (
                <ConfirmModal
                    danger
                    title="Excluir retalho"
                    message={`Deseja excluir permanentemente "${deleteTarget.label}"? Esta ação não pode ser desfeita.`}
                    confirmLabel="Excluir"
                    onConfirm={confirmSingleDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
            {deleteTarget?.bulk && (
                <ConfirmModal
                    danger
                    title="Excluir retalhos selecionados"
                    message={`Deseja excluir ${selected.size} retalho(s) permanentemente? Esta ação não pode ser desfeita.`}
                    confirmLabel={`Excluir ${selected.size}`}
                    onConfirm={confirmBulkDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </>
    );
}

// Campo de formulário com label padronizado.
function Field({ label, flex, children }) {
    return (
        <div style={{ flex }}>
            <label style={{
                display: 'block', marginBottom: 6,
                fontSize: 11, fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
            }}>
                {label}
            </label>
            {children}
        </div>
    );
}
