// Tab "Lotes" — lista dos lotes importados (CRUD + quick-actions).
// Fase C: usa SectionHeader + StatusBadge + EmptyState + ConfirmModal do design system.

import { useState } from 'react';
import api from '../../../api';
import {
    SectionHeader, StatusBadge, EmptyState, ConfirmModal,
} from '../../../ui';
import {
    Package, RefreshCw, Eye, Scissors, Trash2, Layers, AlertTriangle, Edit2, X, Check, Clock,
} from 'lucide-react';

// Checar urgência de entrega: negativo = atrasado, 0-3 = urgente
const calcDiasRestantes = (dataEntrega) => {
    if (!dataEntrega) return null;
    const hoje = new Date();
    const entrega = new Date(dataEntrega + 'T12:00:00');
    return Math.ceil((entrega - hoje) / 86400000);
};

// Modal de edição rápida de lote (entrega, prioridade, nome, cliente, projeto)
function EditLoteModal({ lote, onSave, onCancel, notify }) {
    const [form, setForm] = useState({
        nome: lote.nome || '',
        cliente: lote.cliente || '',
        projeto: lote.projeto || '',
        data_entrega: lote.data_entrega || '',
        prioridade: lote.prioridade ?? 0,
        observacoes: lote.observacoes || '',
    });
    const [saving, setSaving] = useState(false);
    const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const save = async () => {
        if (!form.nome.trim()) { notify('Nome é obrigatório', 'error'); return; }
        setSaving(true);
        try {
            await api.put(`/cnc/lotes/${lote.id}`, form);
            notify('Lote atualizado');
            onSave();
        } catch (e) {
            notify('Erro ao salvar: ' + (e.error || e.message || ''), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => e.target === e.currentTarget && onCancel()}>
            <div className="glass-card" style={{ width: 480, maxWidth: '95vw', padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>Editar Lote</div>
                    <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <X size={18} />
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nome *</label>
                        <input value={form.nome} onChange={e => upd('nome', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 13 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Cliente</label>
                            <input value={form.cliente} onChange={e => upd('cliente', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 13 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Projeto</label>
                            <input value={form.projeto} onChange={e => upd('projeto', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 13 }} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Data de Entrega</label>
                            <input type="date" value={form.data_entrega} onChange={e => upd('data_entrega', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 13 }} />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Prioridade</label>
                            <select value={form.prioridade} onChange={e => upd('prioridade', Number(e.target.value))} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 13 }}>
                                <option value={0}>Normal</option>
                                <option value={1}>Alta</option>
                                <option value={2}>Urgente</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Observações</label>
                        <textarea value={form.observacoes} onChange={e => upd('observacoes', e.target.value)} rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical' }} />
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                    <button onClick={onCancel} className="btn-secondary" style={{ padding: '9px 20px', fontSize: 13 }}>Cancelar</button>
                    <button onClick={save} disabled={saving} className="btn-primary" style={{ padding: '9px 20px', fontSize: 13, gap: 8 }}>
                        <Check size={14} />
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Computes the next recommended action for a lote
const getNextAction = (l) => {
    const status = l.status || 'importado';
    if (status === 'concluido') return { label: 'Concluído', color: 'var(--success)', tab: null, done: true };
    if (status === 'produzindo') return { label: 'Acompanhar produção', color: 'var(--warning)', tab: 'gcode' };
    if (status === 'otimizado') return { label: 'Abrir G-code', color: 'var(--primary)', tab: 'gcode' };
    if (l.aproveitamento > 0 && status === 'importado') return { label: 'Ver plano de corte', color: 'var(--info)', tab: 'plano' };
    if (l.total_pecas > 0 && !l.aproveitamento) return { label: 'Otimizar corte', color: '#8B5CF6', tab: 'plano' };
    return { label: 'Ver peças', color: 'var(--text-muted)', tab: 'pecas' };
};

export function TabLotes({ lotes, loadLotes, notify, abrirLote }) {
    const [selectedLotes, setSelectedLotes] = useState(new Set());
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);

    const toggleLoteSelection = (id) => {
        setSelectedLotes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAllLotes = () => {
        if (selectedLotes.size === lotes.length) setSelectedLotes(new Set());
        else setSelectedLotes(new Set(lotes.map(l => l.id)));
    };

    // Prioridade label e cor
    const PRIORIDADE = {
        2: { label: 'Urgente', color: 'var(--danger)', bg: 'var(--danger-bg)', border: 'var(--danger-border)' },
        1: { label: 'Alta',    color: 'var(--warning)', bg: 'var(--warning-bg)', border: 'var(--warning-border)' },
        0: null, // Normal — não exibe badge
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await api.del(`/cnc/lotes/${deleteTarget.id}`);
            notify('Lote excluído');
            loadLotes();
        } catch (err) {
            notify('Erro ao excluir lote: ' + (err.message || ''), 'error');
        } finally {
            setDeleteTarget(null);
        }
    };

    if (lotes.length === 0) {
        return (
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <SectionHeader icon={Package} title="Lotes Importados" accent="var(--primary)" />
                <EmptyState
                    icon={Package}
                    title="Nenhum lote importado"
                    description="Importe um arquivo JSON (SketchUp) ou DXF na aba Importar para começar."
                />
            </div>
        );
    }

    const atrasados = lotes.filter(l => {
        const d = calcDiasRestantes(l.data_entrega);
        return d !== null && d < 0 && l.status !== 'concluido';
    }).length;
    const urgentes = lotes.filter(l => {
        const d = calcDiasRestantes(l.data_entrega);
        return d !== null && d >= 0 && d <= 3 && l.status !== 'concluido';
    }).length;

    return (
        <>
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <SectionHeader
                    icon={Package}
                    title="Lotes Importados"
                    accent="var(--primary)"
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {atrasados > 0 && (
                            <span style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                fontSize: 11, fontWeight: 800, color: 'var(--danger)',
                                background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
                                padding: '3px 10px', borderRadius: 20,
                            }}>
                                <AlertTriangle size={11} />
                                {atrasados} atrasado{atrasados > 1 ? 's' : ''}
                            </span>
                        )}
                        {urgentes > 0 && (
                            <span style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                fontSize: 11, fontWeight: 700, color: 'var(--warning)',
                                background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                                padding: '3px 10px', borderRadius: 20,
                            }}>
                                ⏰ {urgentes} urgente{urgentes > 1 ? 's' : ''}
                            </span>
                        )}
                        <span style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                            {lotes.length} {lotes.length === 1 ? 'lote' : 'lotes'}
                        </span>
                        <button
                            onClick={loadLotes}
                            className="btn-secondary btn-sm"
                            style={{ fontSize: 12, gap: 6 }}
                            aria-label="Atualizar lista"
                        >
                            <RefreshCw size={13} />
                            Atualizar
                        </button>
                    </div>
                </SectionHeader>

                <div style={{ overflowX: 'auto' }}>
                    <table className="table-stagger" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th className="th-glass" style={{ width: 40, textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedLotes.size === lotes.length && lotes.length > 0}
                                        onChange={toggleAllLotes}
                                        style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                                        aria-label="Selecionar todos os lotes"
                                    />
                                </th>
                                <th className="th-glass" style={{ width: 50 }}>#</th>
                                <th className="th-glass">Nome</th>
                                <th className="th-glass">Cliente</th>
                                <th className="th-glass">Projeto</th>
                                <th className="th-glass" style={{ textAlign: 'center' }}>Peças</th>
                                <th className="th-glass" style={{ textAlign: 'center' }}>Chapas</th>
                                <th className="th-glass" style={{ textAlign: 'center' }}>Aprov.</th>
                                <th className="th-glass">Status</th>
                                <th className="th-glass" style={{ whiteSpace: 'nowrap' }}>Próxima ação</th>
                                <th className="th-glass" style={{ whiteSpace: 'nowrap' }}>Criado</th>
                                <th className="th-glass" style={{ whiteSpace: 'nowrap' }}>Entrega</th>
                                <th className="th-glass" style={{ width: 160 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lotes.map(l => {
                                const isSelected = selectedLotes.has(l.id);
                                const diasRestantes = calcDiasRestantes(l.data_entrega);
                                const isAtrasado = diasRestantes !== null && diasRestantes < 0 && l.status !== 'concluido';
                                const isUrgente = diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 3 && l.status !== 'concluido';
                                const nextAction = getNextAction(l);
                                return (
                                    <tr
                                        key={l.id}
                                        className="group transition-colors"
                                        onClick={() => abrirLote(l)}
                                        style={{
                                            cursor: 'pointer',
                                            background: isSelected
                                                ? 'var(--primary-alpha)'
                                                : isAtrasado
                                                ? 'rgba(239,68,68,0.04)'
                                                : isUrgente
                                                ? 'rgba(251,191,36,0.04)'
                                                : undefined,
                                            transition: 'background .15s', // P35
                                        }}
                                    >
                                        <td
                                            className="td-glass"
                                            style={{ textAlign: 'center' }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleLoteSelection(l.id)}
                                                style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                                                aria-label={`Selecionar lote ${l.nome}`}
                                            />
                                        </td>
                                        <td className="td-glass" style={{
                                            fontWeight: 700, color: 'var(--text-muted)',
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {l.id}
                                        </td>
                                        <td className="td-glass" style={{
                                            fontWeight: 600, maxWidth: 220,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {l.nome}
                                        </td>
                                        <td className="td-glass">{l.cliente || '—'}</td>
                                        <td className="td-glass" style={{ color: 'var(--text-muted)' }}>
                                            {l.projeto || '—'}
                                        </td>
                                        <td className="td-glass" style={{
                                            textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {l.total_pecas}
                                        </td>
                                        <td className="td-glass" style={{
                                            textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            {l.total_chapas || '—'}
                                        </td>
                                        <td className="td-glass" style={{
                                            textAlign: 'center', fontWeight: 700,
                                            fontVariantNumeric: 'tabular-nums',
                                            color: l.aproveitamento
                                                ? (l.aproveitamento >= 80 ? 'var(--success)'
                                                   : l.aproveitamento >= 60 ? 'var(--warning)'
                                                   : 'var(--danger)')
                                                : 'var(--text-muted)',
                                        }}>
                                            {l.aproveitamento ? `${l.aproveitamento}%` : '—'}
                                        </td>
                                        {/* P16: flex-wrap para badges não truncarem em colunas estreitas */}
                                        <td className="td-glass">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                                <StatusBadge status={l.status || 'importado'} size="sm" />
                                                {l.grupo_otimizacao && (
                                                    <span
                                                        title="Otimizado em grupo com outros lotes"
                                                        style={{
                                                            fontSize: 9, padding: '2px 6px', borderRadius: 6,
                                                            background: 'var(--primary-alpha)',
                                                            color: 'var(--primary)',
                                                            border: '1px solid var(--primary)',
                                                            fontWeight: 800, letterSpacing: 0.3,
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        MULTI
                                                    </span>
                                                )}
                                                {PRIORIDADE[l.prioridade] && (
                                                    <span
                                                        title={`Prioridade: ${PRIORIDADE[l.prioridade].label}`}
                                                        style={{
                                                            fontSize: 9, padding: '2px 6px', borderRadius: 6,
                                                            background: PRIORIDADE[l.prioridade].bg,
                                                            color: PRIORIDADE[l.prioridade].color,
                                                            border: `1px solid ${PRIORIDADE[l.prioridade].border}`,
                                                            fontWeight: 800, letterSpacing: 0.3,
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {PRIORIDADE[l.prioridade].label}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="td-glass" onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{
                                                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                                                    background: nextAction.done ? 'var(--success-bg)' : `${nextAction.color}18`,
                                                    color: nextAction.done ? 'var(--success)' : nextAction.color,
                                                    border: `1px solid ${nextAction.done ? 'var(--success-border)' : `${nextAction.color}30`}`,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {nextAction.done ? '✓ ' : ''}{nextAction.label}
                                                </span>
                                                {nextAction.tab && (
                                                    <button
                                                        onClick={() => abrirLote(l, nextAction.tab)}
                                                        style={{
                                                            background: `${nextAction.color}14`, border: `1px solid ${nextAction.color}28`,
                                                            color: nextAction.color, borderRadius: 6, padding: '3px 8px',
                                                            fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                                        }}
                                                        title={`Ir para: ${nextAction.label}`}
                                                    >
                                                        Abrir →
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="td-glass" style={{
                                            color: 'var(--text-muted)',
                                            fontVariantNumeric: 'tabular-nums',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="td-glass" style={{ whiteSpace: 'nowrap' }}
                                            onClick={e => { e.stopPropagation(); setEditTarget(l); }}
                                            title="Clique para editar prazo e prioridade"
                                        >
                                            {l.data_entrega ? (() => {
                                                const hoje = new Date();
                                                const entrega = new Date(l.data_entrega + 'T12:00:00');
                                                const diff = Math.ceil((entrega - hoje) / 86400000);
                                                const color = diff < 0 ? 'var(--danger)' : diff <= 3 ? 'var(--warning)' : 'var(--success)';
                                                return (
                                                    <span style={{ fontSize: 11, color, fontWeight: diff < 0 ? 800 : 600, cursor: 'pointer', textDecoration: 'underline dotted' }}
                                                        title={diff < 0 ? `Atrasado ${Math.abs(diff)} dias — clique para editar` : `${diff} dias restantes — clique para editar`}>
                                                        {entrega.toLocaleDateString('pt-BR')}
                                                        {diff <= 3 && <span style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center' }}>{diff < 0 ? <AlertTriangle size={11} /> : <Clock size={11} />}</span>}
                                                    </span>
                                                );
                                            })() : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline dotted' }}
                                                    title="Clique para definir data de entrega">
                                                    + prazo
                                                </span>
                                            )}
                                        </td>
                                        <td className="td-glass" onClick={e => e.stopPropagation()}>
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ display: 'flex', gap: 4 }}>
                                                <button
                                                    onClick={() => abrirLote(l, 'pecas')}
                                                    title="Ver peças"
                                                    aria-label={`Ver peças de ${l.nome}`}
                                                    className="btn-secondary btn-sm"
                                                    style={actBtn}
                                                >
                                                    <Layers size={13} />
                                                </button>
                                                <button
                                                    onClick={() => abrirLote(l, 'plano')}
                                                    title="Plano de corte"
                                                    aria-label={`Plano de corte de ${l.nome}`}
                                                    className="btn-secondary btn-sm"
                                                    style={actBtn}
                                                >
                                                    <Scissors size={13} />
                                                </button>
                                                <button
                                                    onClick={() => setEditTarget(l)}
                                                    title="Editar lote (entrega, prioridade...)"
                                                    aria-label={`Editar ${l.nome}`}
                                                    className="btn-secondary btn-sm"
                                                    style={actBtn}
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(l)}
                                                    title="Excluir"
                                                    aria-label={`Excluir ${l.nome}`}
                                                    className="btn-danger btn-sm"
                                                    style={actBtn}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {deleteTarget && (
                <ConfirmModal
                    danger
                    title="Excluir lote"
                    message={`Isto remove o lote "${deleteTarget.nome}" e todas as suas peças, chapas e operações. Esta ação não pode ser desfeita.`}
                    confirmLabel="Excluir"
                    cancelLabel="Cancelar"
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}

            {editTarget && (
                <EditLoteModal
                    lote={editTarget}
                    notify={notify}
                    onSave={() => { setEditTarget(null); loadLotes(); }}
                    onCancel={() => setEditTarget(null)}
                />
            )}
        </>
    );
}

const actBtn = { padding: '6px 10px', minHeight: 0, fontSize: 12 };
