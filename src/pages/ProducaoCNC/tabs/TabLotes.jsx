// Tab "Lotes" — lista dos lotes importados (CRUD + quick-actions).
// Refatorado visual em Fase B para alinhar com o design system Ornato.

import { useState } from 'react';
import api from '../../../api';
import { Z, tagStyle, tagClass } from '../../../ui';
import { Package, RefreshCw, Eye, Scissors, Trash2 } from 'lucide-react';
import { STATUS_COLORS } from '../shared/constants.js';

export function TabLotes({ lotes, loadLotes, notify, abrirLote }) {
    const [selectedLotes, setSelectedLotes] = useState(new Set());

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

    const deleteLote = async (id) => {
        if (!confirm('Excluir este lote e todas as peças?')) return;
        try {
            await api.del(`/cnc/lotes/${id}`);
            notify('Lote excluído');
            loadLotes();
        } catch (err) {
            notify('Erro ao excluir lote: ' + (err.message || ''), 'error');
        }
    };

    return (
        <div className="glass-card" style={{ padding: 16 }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 16, gap: 12,
            }}>
                <h3 style={{
                    fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
                    display: 'flex', alignItems: 'center', gap: 8, margin: 0,
                }}>
                    <Package size={16} style={{ color: 'var(--primary)' }} />
                    Lotes Importados
                    <span style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
                        background: 'var(--bg-muted)', padding: '2px 8px', borderRadius: 8,
                    }}>
                        {lotes.length}
                    </span>
                </h3>
                <button onClick={loadLotes} className="btn-secondary" style={{ fontSize: 12, gap: 6 }}>
                    <RefreshCw size={13} />
                    Atualizar
                </button>
            </div>

            {lotes.length === 0 ? (
                <div style={{
                    padding: 32, textAlign: 'center', color: 'var(--text-muted)',
                    fontSize: 13, background: 'var(--bg-muted)', borderRadius: 8,
                    border: '1px dashed var(--border)',
                }}>
                    <Package size={24} style={{ opacity: 0.4, marginBottom: 8 }} />
                    <div>Nenhum lote importado ainda</div>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
                        <thead>
                            <tr>
                                <th className={Z.th} style={thStyle({ width: 32 })}>
                                    <input
                                        type="checkbox"
                                        checked={selectedLotes.size === lotes.length && lotes.length > 0}
                                        onChange={toggleAllLotes}
                                        style={{ cursor: 'pointer' }}
                                    />
                                </th>
                                {['#', 'Nome', 'Cliente', 'Projeto', 'Peças', 'Chapas', 'Aprov.', 'Status', 'Data', ''].map(h => (
                                    <th key={h} className={Z.th} style={thStyle()}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lotes.map((l, i) => {
                                const isSelected = selectedLotes.has(l.id);
                                return (
                                    <tr
                                        key={l.id}
                                        onClick={() => abrirLote(l)}
                                        style={{
                                            background: isSelected
                                                ? 'var(--primary-alpha)'
                                                : i % 2 === 0 ? 'transparent' : 'var(--bg-muted)',
                                            transition: 'background .15s', cursor: 'pointer',
                                        }}
                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--primary-alpha)'; }}
                                        onMouseLeave={e => {
                                            if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-muted)';
                                        }}
                                    >
                                        <td style={tdStyle({ textAlign: 'center' })} onClick={e => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleLoteSelection(l.id)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={tdStyle({ fontWeight: 600 })}>{l.id}</td>
                                        <td style={tdStyle({
                                            fontWeight: 600, maxWidth: 220,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        })}>
                                            {l.nome}
                                        </td>
                                        <td style={tdStyle()}>{l.cliente || '—'}</td>
                                        <td style={tdStyle({ color: 'var(--text-muted)' })}>{l.projeto || '—'}</td>
                                        <td style={tdStyle({ textAlign: 'center' })}>{l.total_pecas}</td>
                                        <td style={tdStyle({ textAlign: 'center' })}>{l.total_chapas || '—'}</td>
                                        <td style={tdStyle({ textAlign: 'center' })}>
                                            {l.aproveitamento ? `${l.aproveitamento}%` : '—'}
                                        </td>
                                        <td style={tdStyle()}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className={tagClass} style={tagStyle(STATUS_COLORS[l.status])}>
                                                    {l.status}
                                                </span>
                                                {l.grupo_otimizacao && (
                                                    <span
                                                        title="Otimizado em grupo"
                                                        style={{
                                                            fontSize: 10, padding: '2px 6px', borderRadius: 6,
                                                            background: 'var(--primary-alpha)', color: 'var(--primary)',
                                                            fontWeight: 700, letterSpacing: 0.3,
                                                        }}
                                                    >
                                                        MULTI
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={tdStyle({ whiteSpace: 'nowrap', color: 'var(--text-muted)' })}>
                                            {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td style={tdStyle()} onClick={e => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button
                                                    onClick={() => abrirLote(l, 'pecas')}
                                                    title="Ver peças"
                                                    className="btn-secondary"
                                                    style={actBtnStyle}
                                                >
                                                    <Eye size={13} />
                                                </button>
                                                <button
                                                    onClick={() => abrirLote(l, 'plano')}
                                                    title="Plano de corte"
                                                    className="btn-secondary"
                                                    style={actBtnStyle}
                                                >
                                                    <Scissors size={13} />
                                                </button>
                                                <button
                                                    onClick={() => deleteLote(l.id)}
                                                    title="Excluir"
                                                    className={Z.btnD}
                                                    style={actBtnStyle}
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
            )}
        </div>
    );
}

// ── Helpers locais pra style consistency ──
const thStyle = (extra = {}) => ({
    padding: '10px 12px', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600,
    textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: 0.3, borderBottom: '1px solid var(--border)',
    ...extra,
});

const tdStyle = (extra = {}) => ({
    padding: '10px 12px', fontSize: 13,
    borderBottom: '1px solid var(--border)',
    ...extra,
});

const actBtnStyle = { padding: '5px 10px', minHeight: 0, fontSize: 12 };
