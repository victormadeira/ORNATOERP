// TabFilaMaquinas.jsx — Kanban de fila de produção por máquina.
// Mostra chapas em fila agrupadas por máquina + status (aguardando, em produção, concluído).

import { useState, useEffect, useCallback } from 'react';
import api from '../../../api';
import { Spinner, EmptyState, SectionHeader, Modal } from '../../../ui';
import {
    Monitor, Play, CheckCircle2, Clock, Trash2, Plus, RefreshCw,
    ArrowUp, ArrowDown, AlertTriangle, Package, Layers, Zap,
    GripVertical, Send,
} from 'lucide-react';

const STATUS_CONFIG = {
    aguardando:   { label: 'Aguardando',   color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
    em_producao:  { label: 'Em produção',  color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    pausado:      { label: 'Pausado',      color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    concluido:    { label: 'Concluído',    color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
};

export function TabFilaMaquinas({ lotes, loteAtual, notify }) {
    const [fila, setFila] = useState([]);
    const [maquinas, setMaquinas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addModal, setAddModal] = useState(false); // abrir modal de adicionar chapas à fila
    const [addLoteId, setAddLoteId] = useState('');
    const [addPrioridade, setAddPrioridade] = useState(0);
    const [adding, setAdding] = useState(false);
    const [filterMaquina, setFilterMaquina] = useState(''); // '' = todas

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [f, m] = await Promise.all([
                api.get('/cnc/fila-producao'),
                api.get('/cnc/maquinas'),
            ]);
            setFila(Array.isArray(f) ? f : []);
            setMaquinas(Array.isArray(m) ? m.filter(m => m.ativo) : []);
        } catch (err) {
            notify(err.error || 'Erro ao carregar fila');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const updateStatus = async (id, status) => {
        // P13: confirmação antes de mudanças críticas de status
        const item = fila.find(f => f.id === id);
        const loteLabel = item ? (item.lote_nome || `Lote #${item.lote_id}`) + ` · Chapa ${(item.chapa_idx ?? 0) + 1}` : '';
        if (status === 'em_producao') {
            if (!confirm(`Iniciar produção de ${loteLabel}?`)) return;
        } else if (status === 'concluido') {
            if (!confirm(`Marcar como concluída: ${loteLabel}?`)) return;
        }
        try {
            await api.put(`/cnc/fila-producao/${id}`, { status });
            setFila(prev => prev.map(f => f.id === id ? { ...f, status } : f));
            notify(`Status atualizado: ${STATUS_CONFIG[status]?.label || status}`);
        } catch (err) { notify(err.error || 'Erro ao atualizar status'); }
    };

    const atribuirMaquina = async (id, maquinaId) => {
        try {
            await api.put(`/cnc/fila-producao/${id}`, { maquina_id: maquinaId ? Number(maquinaId) : null });
            const maq = maquinas.find(m => m.id === Number(maquinaId));
            setFila(prev => prev.map(f => {
                if (f.id !== id) return f;
                return { ...f, maquina_id: maquinaId ? Number(maquinaId) : null, maquina_nome: maq?.nome || null };
            }));
            // P14: feedback ao atribuir máquina
            notify(maq ? `Máquina atribuída: ${maq.nome}` : 'Máquina removida');
        } catch (err) { notify(err.error || 'Erro ao atribuir máquina'); }
    };

    const remover = async (id) => {
        if (!confirm('Remover da fila?')) return;
        try {
            await api.del(`/cnc/fila-producao/${id}`);
            setFila(prev => prev.filter(f => f.id !== id));
            notify('Removido da fila');
        } catch (err) { notify(err.error || 'Erro ao remover'); }
    };

    const adicionarLote = async () => {
        if (!addLoteId) { notify('Selecione um lote'); return; }
        setAdding(true);
        try {
            const r = await api.post(`/cnc/fila-producao/lote/${addLoteId}`, { prioridade: addPrioridade });
            notify(`${r.added} chapa(s) adicionada(s) à fila`);
            setAddModal(false);
            setAddLoteId('');
            load();
        } catch (err) { notify(err.error || 'Erro ao adicionar lote'); }
        finally { setAdding(false); }
    };

    // Agrupar por máquina para o kanban
    const filaFiltrada = filterMaquina
        ? fila.filter(f => String(f.maquina_id) === filterMaquina)
        : fila;

    const semMaquina = filaFiltrada.filter(f => !f.maquina_id);
    const porMaquina = {};
    for (const m of maquinas) porMaquina[m.id] = { maquina: m, items: [] };
    for (const f of filaFiltrada) {
        if (f.maquina_id && porMaquina[f.maquina_id]) {
            porMaquina[f.maquina_id].items.push(f);
        }
    }

    // P12: minHeight garante que colunas vazias não colapsam o layout
    const KanbanColumn = ({ title, icon: Icon, items, color, emptyMsg }) => (
        <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 380, minHeight: 320 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                padding: '8px 12px', borderRadius: 8,
                background: color + '20', border: `1px solid ${color}40`,
            }}>
                <Icon size={14} style={{ color }} />
                <span style={{ fontWeight: 700, fontSize: 12, color }}>{title}</span>
                <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 7px',
                    borderRadius: 10, background: color + '30', color,
                }}>
                    {items.length}
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.length === 0 && (
                    <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 11,
                        color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>
                        {emptyMsg || 'Vazio'}
                    </div>
                )}
                {items.map(f => <FilaCard key={f.id} item={f} onStatus={updateStatus} onMaquina={atribuirMaquina} onRemove={remover} maquinas={maquinas} />)}
            </div>
        </div>
    );

    if (loading) return <Spinner text="Carregando fila..." />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setAddModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
                        fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'var(--primary)', color: '#fff' }}>
                    <Plus size={15} /> Adicionar Lote à Fila
                </button>
                <button onClick={load}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                        fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
                        background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                    <RefreshCw size={13} /> Atualizar
                </button>
                {maquinas.length > 1 && (
                    <select value={filterMaquina} onChange={e => setFilterMaquina(e.target.value)}
                        style={{ padding: '7px 12px', fontSize: 12, borderRadius: 8,
                            border: '1px solid var(--border)', background: 'var(--bg-muted)',
                            color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <option value="">Todas as máquinas</option>
                        {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {fila.filter(f => f.status === 'em_producao').length} em produção · {fila.filter(f => f.status === 'aguardando').length} aguardando
                </span>
            </div>

            {/* Kanban por status */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <KanbanColumn
                    title="Aguardando"
                    icon={Clock}
                    color="#64748b"
                    items={filaFiltrada.filter(f => f.status === 'aguardando')}
                    emptyMsg="Nenhuma chapa aguardando"
                />
                <KanbanColumn
                    title="Em Produção"
                    icon={Play}
                    color="#2563eb"
                    items={filaFiltrada.filter(f => f.status === 'em_producao')}
                    emptyMsg="Nenhuma chapa em produção"
                />
                <KanbanColumn
                    title="Concluído (24h)"
                    icon={CheckCircle2}
                    color="#16a34a"
                    items={filaFiltrada.filter(f => f.status === 'concluido')}
                    emptyMsg="Nenhuma concluída hoje"
                />
            </div>

            {/* Seção sem máquina */}
            {semMaquina.length > 0 && !filterMaquina && (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <SectionHeader icon={AlertTriangle} title={`${semMaquina.length} chapa(s) sem máquina atribuída`} accent="var(--warning)" />
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {semMaquina.map(f => (
                            <FilaCard key={f.id} item={f} onStatus={updateStatus} onMaquina={atribuirMaquina} onRemove={remover} maquinas={maquinas} highlight />
                        ))}
                    </div>
                </div>
            )}

            {fila.length === 0 && (
                <EmptyState icon={Send} title="Fila vazia"
                    description="Adicione um lote otimizado à fila para iniciar a produção."
                    action={{ label: 'Adicionar Lote', onClick: () => setAddModal(true) }}
                />
            )}

            {/* Modal adicionar lote */}
            {addModal && (
                <Modal title="Adicionar Lote à Fila" close={() => setAddModal(false)} w={480}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                                Lote
                            </label>
                            <select value={addLoteId} onChange={e => setAddLoteId(e.target.value)}
                                style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
                                    border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                <option value="">Selecione um lote...</option>
                                {(lotes || []).filter(l => l.status === 'otimizado' || l.status === 'em_producao').map(l => (
                                    <option key={l.id} value={l.id}>
                                        {l.nome} — {l.total_chapas || '?'} chapas {l.cliente ? `(${l.cliente})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                                Prioridade (0 = normal, 10 = urgente)
                            </label>
                            <input type="number" min={0} max={10} value={addPrioridade} onChange={e => setAddPrioridade(Number(e.target.value))}
                                style={{ width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
                                    border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setAddModal(false)}
                                style={{ padding: '9px 18px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Cancelar
                            </button>
                            <button onClick={adicionarLote} disabled={adding || !addLoteId}
                                style={{ padding: '9px 24px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer',
                                    background: 'var(--primary)', color: '#fff', opacity: adding || !addLoteId ? 0.6 : 1 }}>
                                {adding ? 'Adicionando...' : 'Adicionar à Fila'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function FilaCard({ item, onStatus, onMaquina, onRemove, maquinas, highlight }) {
    const s = STATUS_CONFIG[item.status] || STATUS_CONFIG.aguardando;
    const fmt = (dt) => dt ? new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

    return (
        <div style={{
            padding: '10px 14px', borderRadius: 10, background: 'var(--bg-card)',
            border: `1px solid ${highlight ? 'var(--warning-border)' : 'var(--border)'}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
            {/* Header: lote + chapa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <GripVertical size={13} style={{ color: 'var(--text-muted)', cursor: 'grab', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', truncate: true, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.lote_observacoes || undefined}>
                        {item.lote_nome || `Lote #${item.lote_id}`}
                        {item.lote_observacoes && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>💬</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
                        <span>Chapa {item.chapa_idx + 1}</span>
                        {item.lote_cliente && <span>· {item.lote_cliente}</span>}
                        {item.prioridade > 0 && (
                            <span style={{ padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#d97706', fontWeight: 700, fontSize: 9 }}>
                                P{item.prioridade}
                            </span>
                        )}
                        {/* Prioridade do lote */}
                        {(item.lote_prioridade || 0) >= 2 && (
                            <span style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 800, fontSize: 9, border: '1px solid var(--danger-border)' }}>
                                🔴 URGENTE
                            </span>
                        )}
                        {(item.lote_prioridade || 0) === 1 && (
                            <span style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--warning-bg)', color: 'var(--warning)', fontWeight: 800, fontSize: 9, border: '1px solid var(--warning-border)' }}>
                                🟡 ALTA
                            </span>
                        )}
                        {/* Data de entrega */}
                        {item.lote_data_entrega && (() => {
                            const diff = Math.ceil((new Date(item.lote_data_entrega + 'T12:00:00') - new Date()) / 86400000);
                            const isLate = diff < 0, isUrgent = diff >= 0 && diff <= 3;
                            if (!isLate && !isUrgent) return null;
                            return (
                                <span style={{ color: isLate ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, fontSize: 9 }}>
                                    {isLate ? `⚠ ${Math.abs(diff)}d atr.` : `⏰ ${diff}d`}
                                </span>
                            );
                        })()}
                    </div>
                </div>
                {/* Status badge */}
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                    background: s.bg, color: s.color, border: `1px solid ${s.border}`, flexShrink: 0 }}>
                    {s.label}
                </span>
            </div>

            {/* Timestamps */}
            {(item.inicio_em || item.fim_em) && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {item.inicio_em && <span>▶ {fmt(item.inicio_em)}</span>}
                    {item.fim_em && <span style={{ marginLeft: 8 }}>✓ {fmt(item.fim_em)}</span>}
                </div>
            )}

            {/* Atribuição de máquina */}
            <div style={{ marginBottom: 8 }}>
                <select
                    value={item.maquina_id || ''}
                    onChange={e => onMaquina(item.id, e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', fontSize: 11, borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)' }}>
                    <option value="">Sem máquina</option>
                    {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
            </div>

            {/* Ações rápidas */}
            <div style={{ display: 'flex', gap: 5 }}>
                {item.status === 'aguardando' && (
                    <button onClick={() => onStatus(item.id, 'em_producao')}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px 8px',
                            fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: '#eff6ff', color: '#2563eb' }}>
                        <Play size={11} /> Iniciar
                    </button>
                )}
                {item.status === 'em_producao' && (
                    <button onClick={() => onStatus(item.id, 'concluido')}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px 8px',
                            fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: '#f0fdf4', color: '#16a34a' }}>
                        <CheckCircle2 size={11} /> Concluir
                    </button>
                )}
                {item.status === 'concluido' && (
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10,
                        color: '#16a34a', fontWeight: 700 }}>
                        <CheckCircle2 size={11} /> Concluído
                    </span>
                )}
                <button onClick={() => onRemove(item.id)}
                    style={{ padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: '#fef2f2', color: '#ef4444' }}>
                    <Trash2 size={11} />
                </button>
            </div>
        </div>
    );
}
