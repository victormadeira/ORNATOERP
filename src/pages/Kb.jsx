import { useState } from 'react';
import { Z, Ic } from '../ui';
import { R$, KCOLS, KCOLS_ARCHIVE } from '../engine';
import { Archive, XCircle, RotateCcw, Search, Filter, Calendar, GripVertical } from 'lucide-react';
import api from '../api';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';

// ── Status labels para arquivo ──
const STATUS_LABEL = { arquivo: 'Arquivado', perdido: 'Perdido' };
const STATUS_COLOR = { arquivo: '#64748b', perdido: '#dc2626' };

// ── Componente Card Arrastável ──
function DraggableCard({ o, col, move, nav, KCOLS: kcols }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `orc-${o.id}`,
        data: { orcId: o.id, fromCol: col.id },
    });

    const isDone = col.id === 'done';

    const style = {
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.3 : 1,
        transition: isDragging ? undefined : 'opacity 0.15s',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--border-hover)] hover:bg-[var(--bg-muted)] transition-all cursor-grab group"
        >
            {/* Drag handle + título */}
            <div className="flex items-start gap-1.5">
                <div {...listeners} {...attributes} className="mt-0.5 cursor-grab active:cursor-grabbing text-[var(--text-muted)] opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0">
                    <GripVertical size={14} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--text-primary)] font-semibold mb-0.5 flex items-center gap-1.5">
                        {o.tipo === 'aditivo' && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', flexShrink: 0 }}>
                                {o.numero?.match(/-A\d+$/)?.[0]?.replace('-', '') || 'ADT'}
                            </span>
                        )}
                        {o.cliente_nome}
                    </div>
                    <div className="text-[10px] text-[var(--text-primary)]">{o.ambiente}</div>
                    <div className="text-sm font-bold mt-2" style={{ color: 'var(--primary)' }}>{R$(o.valor_venda)}</div>
                </div>
            </div>

            {/* Botoes de movimentacao (fallback) */}
            <div className="flex gap-1 mt-2.5 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity items-center">
                {nav && (
                    <button onClick={() => nav('whatsapp')}
                        className="text-[8px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer font-semibold"
                        style={{ borderColor: '#22c55e30', color: '#22c55e' }}
                        title="Abrir chat WhatsApp">
                        Chat
                    </button>
                )}
                {kcols.filter(c => c.id !== col.id).slice(0, 3).map(c => (
                    <button key={c.id} onClick={() => move(o.id, c.id)}
                        className="text-[8px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer font-semibold"
                        style={{ borderColor: `${c.c}30`, color: c.c }}>
                        {c.nm.split(" ")[0]}
                    </button>
                ))}

                {/* Arquivar (aparece em "Entregue") */}
                {isDone && (
                    <button onClick={() => move(o.id, 'arquivo')}
                        className="text-[8px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer font-semibold"
                        style={{ borderColor: '#64748b30', color: '#64748b' }}
                        title="Arquivar">
                        <Archive size={8} style={{ display: 'inline', marginRight: 2 }} /> Arquivar
                    </button>
                )}

                {/* Perdido (aparece em lead, orc, env, neg) */}
                {['lead', 'orc', 'env', 'neg'].includes(col.id) && (
                    <button onClick={() => move(o.id, 'perdido')}
                        className="text-[8px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer font-semibold"
                        style={{ borderColor: '#dc262630', color: '#dc2626' }}
                        title="Marcar como perdido">
                        <XCircle size={8} style={{ display: 'inline', marginRight: 2 }} /> Perdido
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Componente Coluna Droppable ──
function DroppableColumn({ col, children }) {
    const { isOver, setNodeRef } = useDroppable({
        id: `col-${col.id}`,
        data: { colId: col.id },
    });

    return (
        <div
            ref={setNodeRef}
            className="p-2.5 flex flex-col gap-2 min-h-[120px] transition-all duration-150"
            style={{
                background: isOver ? `${col.c}08` : undefined,
                borderRadius: isOver ? 8 : undefined,
                outline: isOver ? `2px dashed ${col.c}50` : undefined,
                outlineOffset: -2,
            }}
        >
            {children}
        </div>
    );
}

// ── Card de overlay (durante arrasto) ──
function DragOverlayCard({ o }) {
    if (!o) return null;
    return (
        <div className="bg-[var(--bg-card)] border-2 rounded-lg p-3 shadow-2xl" style={{ borderColor: 'var(--primary)', width: 200, opacity: 0.92 }}>
            <div className="text-sm text-[var(--text-primary)] font-semibold mb-0.5 flex items-center gap-1.5">
                {o.tipo === 'aditivo' && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                        {o.numero?.match(/-A\d+$/)?.[0]?.replace('-', '') || 'ADT'}
                    </span>
                )}
                {o.cliente_nome}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{o.ambiente}</div>
            <div className="text-sm font-bold mt-1" style={{ color: 'var(--primary)' }}>{R$(o.valor_venda)}</div>
        </div>
    );
}

export default function Kb({ orcs, reload, notify, nav }) {
    const [tab, setTab] = useState('pipeline'); // 'pipeline' | 'arquivo'
    const [filtroArquivo, setFiltroArquivo] = useState('todos'); // 'todos' | 'arquivo' | 'perdido'
    const [busca, setBusca] = useState('');
    const [activeId, setActiveId] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 }, // previne cliques acidentais
        })
    );

    const move = async (orcId, col) => {
        try {
            const result = await api.put(`/orcamentos/${orcId}/kanban`, { kb_col: col });
            reload();
            if (result.projeto_criado) notify('Projeto criado automaticamente!');
            if (col === 'arquivo') notify('Orcamento arquivado');
            if (col === 'perdido') notify('Orcamento marcado como perdido');
        } catch (ex) { notify(ex.error || "Erro"); }
    };

    const restaurar = async (orcId, col) => {
        try {
            await api.put(`/orcamentos/${orcId}/kanban`, { kb_col: col });
            reload();
            notify('Orcamento restaurado ao pipeline');
        } catch (ex) { notify(ex.error || "Erro"); }
    };

    // Separar orcs ativos vs arquivados
    const orcsAtivos = orcs.filter(o => !['arquivo', 'perdido'].includes(o.kb_col));
    const orcsArquivados = orcs.filter(o => ['arquivo', 'perdido'].includes(o.kb_col));

    // Filtro do arquivo
    const arquivoFiltrado = orcsArquivados
        .filter(o => filtroArquivo === 'todos' || o.kb_col === filtroArquivo)
        .filter(o => {
            if (!busca) return true;
            const b = busca.toLowerCase();
            return (o.cliente_nome || '').toLowerCase().includes(b) ||
                   (o.ambiente || '').toLowerCase().includes(b) ||
                   (o.numero || '').toLowerCase().includes(b);
        });

    // Drag handlers
    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over) return;

        const orcId = active.data?.current?.orcId;
        const fromCol = active.data?.current?.fromCol;

        // Droppou em uma coluna
        let toCol = over.data?.current?.colId;
        // Ou droppou em cima de outro card (pegar a coluna dele)
        if (!toCol && over.id?.toString().startsWith('orc-')) {
            const targetOrc = orcs.find(o => `orc-${o.id}` === over.id);
            if (targetOrc) toCol = targetOrc.kb_col || 'lead';
        }

        if (toCol && toCol !== fromCol && orcId) {
            move(orcId, toCol);
        }
    };

    const handleDragCancel = () => setActiveId(null);

    const activeOrc = activeId ? orcs.find(o => `orc-${o.id}` === activeId) : null;

    return (
        <div className={Z.pg}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <h1 className={Z.h1}>Pipeline CRM</h1>
                    <p className={Z.sub} style={{ marginBottom: 0 }}>Arraste os cards entre etapas ou use os botoes</p>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-muted)', borderRadius: 10, padding: 3 }}>
                    <button onClick={() => setTab('pipeline')}
                        style={{
                            padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                            background: tab === 'pipeline' ? 'var(--bg-card)' : 'transparent',
                            color: tab === 'pipeline' ? 'var(--primary)' : 'var(--text-muted)',
                            boxShadow: tab === 'pipeline' ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                        }}>
                        Pipeline ({orcsAtivos.length})
                    </button>
                    <button onClick={() => setTab('arquivo')}
                        style={{
                            padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                            background: tab === 'arquivo' ? 'var(--bg-card)' : 'transparent',
                            color: tab === 'arquivo' ? 'var(--text-primary)' : 'var(--text-muted)',
                            boxShadow: tab === 'arquivo' ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                        }}>
                        <Archive size={12} style={{ display: 'inline', marginRight: 4 }} />
                        Arquivo ({orcsArquivados.length})
                    </button>
                </div>
            </div>

            {/* PIPELINE TAB */}
            {tab === 'pipeline' && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                >
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none">
                        {KCOLS.map(col => {
                            const items = orcsAtivos.filter(o => (o.kb_col || "lead") === col.id);
                            return (
                                <div key={col.id} className="min-w-[200px] flex-1 glass-card !rounded-xl overflow-hidden">
                                    {/* Column Header */}
                                    <div className="px-4 py-3 flex justify-between items-center border-b" style={{ borderColor: `${col.c}30` }}>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.c }}></div>
                                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: col.c }}>{col.nm}</span>
                                        </div>
                                        <span className="text-[10px] text-[var(--text-primary)] bg-[var(--bg-muted)] px-2 py-0.5 rounded-full font-semibold">{items.length}</span>
                                    </div>

                                    {/* Column Body (Droppable) */}
                                    <DroppableColumn col={col}>
                                        {items.map(o => (
                                            <DraggableCard key={o.id} o={o} col={col} move={move} nav={nav} KCOLS={KCOLS} />
                                        ))}
                                        {items.length === 0 && (
                                            <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs py-8">Vazio</div>
                                        )}
                                    </DroppableColumn>
                                </div>
                            );
                        })}
                    </div>

                    <DragOverlay>
                        <DragOverlayCard o={activeOrc} />
                    </DragOverlay>
                </DndContext>
            )}

            {/* ARQUIVO TAB */}
            {tab === 'arquivo' && (
                <div>
                    {/* Filtros */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                        {/* Busca */}
                        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text" placeholder="Buscar cliente, ambiente..."
                                value={busca} onChange={e => setBusca(e.target.value)}
                                className={Z.inp} style={{ paddingLeft: 32, fontSize: 12 }}
                            />
                        </div>

                        {/* Filtro status */}
                        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-muted)', borderRadius: 8, padding: 3 }}>
                            {[
                                { id: 'todos', label: 'Todos', count: orcsArquivados.length },
                                { id: 'arquivo', label: 'Arquivados', count: orcsArquivados.filter(o => o.kb_col === 'arquivo').length, color: '#64748b' },
                                { id: 'perdido', label: 'Perdidos', count: orcsArquivados.filter(o => o.kb_col === 'perdido').length, color: '#dc2626' },
                            ].map(f => (
                                <button key={f.id} onClick={() => setFiltroArquivo(f.id)}
                                    style={{
                                        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                                        background: filtroArquivo === f.id ? 'var(--bg-card)' : 'transparent',
                                        color: filtroArquivo === f.id ? (f.color || 'var(--text-primary)') : 'var(--text-muted)',
                                        boxShadow: filtroArquivo === f.id ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                                    }}>
                                    {f.label} ({f.count})
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Lista */}
                    {arquivoFiltrado.length === 0 ? (
                        <div className="glass-card" style={{ textAlign: 'center', padding: 40 }}>
                            <Archive size={32} style={{ color: 'var(--text-muted)', opacity: 0.35, margin: '0 auto 12px' }} />
                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                {orcsArquivados.length === 0 ? 'Nenhum orcamento arquivado ainda' : 'Nenhum resultado para o filtro'}
                            </p>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                            {/* Header tabela */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 140px 120px 100px 80px',
                                padding: '10px 20px', borderBottom: '1px solid var(--border)',
                                fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                            }}>
                                <span>Cliente / Ambiente</span>
                                <span>Numero</span>
                                <span style={{ textAlign: 'right' }}>Valor</span>
                                <span style={{ textAlign: 'center' }}>Status</span>
                                <span style={{ textAlign: 'center' }}>Acoes</span>
                            </div>

                            {arquivoFiltrado.map(o => {
                                const isPerdido = o.kb_col === 'perdido';
                                const color = isPerdido ? '#dc2626' : '#64748b';
                                return (
                                    <div key={o.id}
                                        style={{
                                            display: 'grid', gridTemplateColumns: '1fr 140px 120px 100px 80px',
                                            padding: '12px 20px', borderBottom: '1px solid var(--border)',
                                            alignItems: 'center',
                                        }}
                                        className="hover:bg-[var(--bg-hover)] transition-colors">
                                        {/* Cliente */}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {o.cliente_nome}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {o.ambiente || '—'}
                                            </div>
                                        </div>

                                        {/* Numero */}
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                            {o.numero || '—'}
                                        </div>

                                        {/* Valor */}
                                        <div style={{ fontSize: 13, fontWeight: 700, color: isPerdido ? '#dc262680' : 'var(--primary)', textAlign: 'right', textDecoration: isPerdido ? 'line-through' : 'none' }}>
                                            {R$(o.valor_venda)}
                                        </div>

                                        {/* Status badge */}
                                        <div style={{ textAlign: 'center' }}>
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                                                background: `${color}15`, color, border: `1px solid ${color}30`,
                                            }}>
                                                {isPerdido ? 'Perdido' : 'Arquivado'}
                                            </span>
                                        </div>

                                        {/* Restaurar */}
                                        <div style={{ textAlign: 'center' }}>
                                            <button onClick={() => restaurar(o.id, 'lead')}
                                                style={{
                                                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                                                    padding: '4px 8px', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                                                    color: 'var(--text-muted)', transition: 'all 0.15s',
                                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                                }}
                                                className="hover:border-[var(--primary)] hover:text-[var(--primary)]"
                                                title="Restaurar ao pipeline">
                                                <RotateCcw size={10} /> Restaurar
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Resumo */}
                    {orcsArquivados.length > 0 && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 16, justifyContent: 'center' }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                                <Archive size={10} style={{ display: 'inline', marginRight: 4 }} />
                                {orcsArquivados.filter(o => o.kb_col === 'arquivo').length} arquivados ({R$(orcsArquivados.filter(o => o.kb_col === 'arquivo').reduce((s, o) => s + (o.valor_venda || 0), 0))})
                            </span>
                            <span style={{ fontSize: 11, color: '#dc2626' }}>
                                <XCircle size={10} style={{ display: 'inline', marginRight: 4 }} />
                                {orcsArquivados.filter(o => o.kb_col === 'perdido').length} perdidos ({R$(orcsArquivados.filter(o => o.kb_col === 'perdido').reduce((s, o) => s + (o.valor_venda || 0), 0))})
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
