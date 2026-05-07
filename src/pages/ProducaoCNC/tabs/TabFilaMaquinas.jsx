// TabFilaMaquinas.jsx — Kanban de fila de produção por máquina.
// Mostra chapas em fila agrupadas por máquina + status (aguardando, em produção, concluído).

import { useState, useEffect, useCallback } from 'react';
import api from '../../../api';
import { Spinner, EmptyState, SectionHeader, Modal, ConfirmModal } from '../../../ui';
import {
    Monitor, Play, CheckCircle2, Clock, Trash2, Plus, RefreshCw,
    ArrowUp, ArrowDown, AlertTriangle, Package, Layers, Zap,
    GripVertical, Send, MessageSquare, Check, LayoutGrid, List,
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
    const [viewMode, setViewMode] = useState('status'); // 'status' | 'maquina'
    const [cncConfirm, setCncConfirm] = useState(null); // { msg, title?, onOk }

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
        const doUpdate = async () => {
            try {
                await api.put(`/cnc/fila-producao/${id}`, { status });
                setFila(prev => prev.map(f => f.id === id ? { ...f, status } : f));
                notify(`Status atualizado: ${STATUS_CONFIG[status]?.label || status}`);
            } catch (err) { notify(err.error || 'Erro ao atualizar status'); }
        };
        if (status === 'em_producao') {
            setCncConfirm({ msg: `Iniciar produção de ${loteLabel}?`, onOk: doUpdate });
            return;
        } else if (status === 'concluido') {
            setCncConfirm({ msg: `Marcar como concluída: ${loteLabel}?`, onOk: doUpdate });
            return;
        }
        doUpdate();
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
        setCncConfirm({ msg: 'Remover da fila?', onOk: async () => {
            try {
                await api.del(`/cnc/fila-producao/${id}`);
                setFila(prev => prev.filter(f => f.id !== id));
                notify('Removido da fila');
            } catch (err) { notify(err.error || 'Erro ao remover'); }
        }});
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
                {maquinas.length > 1 && viewMode === 'status' && (
                    <select value={filterMaquina} onChange={e => setFilterMaquina(e.target.value)}
                        style={{ padding: '7px 12px', fontSize: 12, borderRadius: 8,
                            border: '1px solid var(--border)', background: 'var(--bg-muted)',
                            color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <option value="">Todas as máquinas</option>
                        {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </select>
                )}
                {/* View toggle — Por status / Por máquina */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 0, background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
                    {[
                        { id: 'status', label: 'Por status', Icon: List },
                        { id: 'maquina', label: 'Por máquina', Icon: LayoutGrid },
                    ].map(({ id, label, Icon }) => (
                        <button key={id} onClick={() => setViewMode(id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                                borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                                fontFamily: 'var(--font-sans)',
                                background: viewMode === id ? 'var(--bg-card)' : 'transparent',
                                color: viewMode === id ? 'var(--text-primary)' : 'var(--text-muted)',
                                boxShadow: viewMode === id ? '0 1px 3px rgba(0,0,0,.2)' : 'none',
                                transition: 'all var(--transition-fast)',
                            }}>
                            <Icon size={12} /> {label}
                        </button>
                    ))}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {fila.filter(f => f.status === 'em_producao').length} em produção · {fila.filter(f => f.status === 'aguardando').length} aguardando
                </span>
            </div>

            {/* Kanban por status */}
            {viewMode === 'status' && (
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
            )}

            {/* Vista por máquina (item #13) */}
            {viewMode === 'maquina' && (
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8 }}>
                {maquinas.map(m => {
                    const itens = fila.filter(f => f.maquina_id === m.id);
                    const emProducao = itens.find(f => f.status === 'em_producao');
                    const aguardando = itens.filter(f => f.status === 'aguardando');
                    return (
                        <div key={m.id} style={{ flex: '0 0 280px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                            {/* Machine header */}
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Monitor size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                                        background: emProducao ? 'var(--success-bg)' : 'var(--bg-muted)',
                                        color: emProducao ? 'var(--success)' : 'var(--text-muted)',
                                        border: `1px solid ${emProducao ? 'var(--success-border)' : 'var(--border)'}`,
                                    }}>
                                        {emProducao ? '● EM PRODUÇÃO' : '○ LIVRE'}
                                    </span>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                                    {aguardando.length} na fila · {itens.filter(f => f.status === 'concluido').length} concluídas hoje
                                </div>
                            </div>
                            {/* Chapa atual */}
                            {emProducao ? (
                                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--success-bg)' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--success)', marginBottom: 4 }}>Em produção agora</div>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {emProducao.lote_nome} · Chapa {(emProducao.chapa_idx ?? 0) + 1}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                        <button onClick={() => updateStatus(emProducao.id, 'concluido')}
                                            style={{ flex: 1, padding: '6px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <Check size={12} /> Concluir
                                        </button>
                                        <button onClick={() => updateStatus(emProducao.id, 'pausado')}
                                            style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                                            Pausar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '10px 14px', borderBottom: itens.length > 0 ? '1px solid var(--border)' : 'none', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
                                    Sem chapa em produção
                                </div>
                            )}
                            {/* Fila */}
                            {aguardando.length > 0 && (
                                <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Fila ({aguardando.length})</div>
                                    {aguardando.slice(0, 3).map(f => (
                                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-muted)', borderRadius: 7, cursor: 'pointer' }}
                                            onClick={() => updateStatus(f.id, 'em_producao')}>
                                            <Play size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                            <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {f.lote_nome} · Ch.{(f.chapa_idx ?? 0) + 1}
                                            </span>
                                            <span style={{ fontSize: 10, color: 'var(--primary)', whiteSpace: 'nowrap' }}>Iniciar</span>
                                        </div>
                                    ))}
                                    {aguardando.length > 3 && (
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>+ {aguardando.length - 3} mais na fila</div>
                                    )}
                                </div>
                            )}
                            {itens.length === 0 && (
                                <div style={{ padding: '14px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>Máquina livre</div>
                            )}
                        </div>
                    );
                })}
                {/* Sem máquina */}
                {semMaquina.length > 0 && (
                    <div style={{ flex: '0 0 280px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--warning-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>Sem máquina ({semMaquina.length})</span>
                            </div>
                        </div>
                        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {semMaquina.slice(0, 5).map(f => <FilaCard key={f.id} item={f} onStatus={updateStatus} onMaquina={atribuirMaquina} onRemove={remover} maquinas={maquinas} highlight />)}
                        </div>
                    </div>
                )}
            </div>
            )}

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

            {cncConfirm && (
                <ConfirmModal title={cncConfirm.title || 'Confirmar'}
                    message={cncConfirm.msg}
                    onConfirm={() => { const fn = cncConfirm.onOk; setCncConfirm(null); fn(); }}
                    onCancel={() => setCncConfirm(null)} />
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
                        {item.lote_observacoes && <MessageSquare size={10} style={{ color: 'var(--text-muted)', marginLeft: 4 }} />}
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
                                URGENTE
                            </span>
                        )}
                        {(item.lote_prioridade || 0) === 1 && (
                            <span style={{ padding: '1px 6px', borderRadius: 4, background: 'var(--warning-bg)', color: 'var(--warning)', fontWeight: 800, fontSize: 9, border: '1px solid var(--warning-border)' }}>
                                ALTA
                            </span>
                        )}
                        {/* Data de entrega */}
                        {item.lote_data_entrega && (() => {
                            const diff = Math.ceil((new Date(item.lote_data_entrega + 'T12:00:00') - new Date()) / 86400000);
                            const isLate = diff < 0, isUrgent = diff >= 0 && diff <= 3;
                            if (!isLate && !isUrgent) return null;
                            return (
                                <span style={{ color: isLate ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                    {isLate ? <><AlertTriangle size={9} />{Math.abs(diff)}d atr.</> : <><Clock size={9} />{diff}d</>}
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
                    {item.fim_em && <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}><Check size={11} style={{ display: 'inline', marginRight: 2 }} />{fmt(item.fim_em)}</span>}
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
