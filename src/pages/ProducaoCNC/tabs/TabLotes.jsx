// Tab "Lotes" — lista dos lotes importados (CRUD + quick-actions).
// Fase C: usa SectionHeader + StatusBadge + EmptyState + ConfirmModal do design system.

import { useState } from 'react';
import api from '../../../api';
import {
    SectionHeader, StatusBadge, EmptyState, ConfirmModal,
} from '../../../ui';
import {
    Package, RefreshCw, Eye, Scissors, Trash2, Layers,
} from 'lucide-react';

export function TabLotes({ lotes, loadLotes, notify, abrirLote }) {
    const [selectedLotes, setSelectedLotes] = useState(new Set());
    const [deleteTarget, setDeleteTarget] = useState(null);

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

    return (
        <>
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <SectionHeader
                    icon={Package}
                    title="Lotes Importados"
                    accent="var(--primary)"
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                                <th className="th-glass" style={{ whiteSpace: 'nowrap' }}>Data</th>
                                <th className="th-glass" style={{ width: 130 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lotes.map(l => {
                                const isSelected = selectedLotes.has(l.id);
                                return (
                                    <tr
                                        key={l.id}
                                        onClick={() => abrirLote(l)}
                                        style={{
                                            cursor: 'pointer',
                                            background: isSelected ? 'var(--primary-alpha)' : undefined,
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
                                        <td className="td-glass">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <StatusBadge status={l.status || 'importado'} size="sm" />
                                                {l.grupo_otimizacao && (
                                                    <span
                                                        title="Otimizado em grupo"
                                                        style={{
                                                            fontSize: 9, padding: '2px 6px', borderRadius: 6,
                                                            background: 'var(--primary-alpha)',
                                                            color: 'var(--primary)',
                                                            border: '1px solid var(--primary)',
                                                            fontWeight: 800, letterSpacing: 0.3,
                                                        }}
                                                    >
                                                        MULTI
                                                    </span>
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
                                        <td className="td-glass" onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: 4 }}>
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
        </>
    );
}

const actBtn = { padding: '6px 10px', minHeight: 0, fontSize: 12 };
