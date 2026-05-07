import { useState } from 'react';
import { Z, Ic, PageHeader, TabBar, EmptyState } from '../ui';
import { R$, KCOLS, KCOLS_ARCHIVE } from '../engine';
import { Archive, XCircle, RotateCcw, Search, Filter, Calendar, GripVertical, Kanban } from 'lucide-react';
import api from '../api';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';

// ── Status labels para arquivo ──
const STATUS_LABEL = { arquivo: 'Arquivado', perdido: 'Perdido' };
const STATUS_COLOR = { arquivo: 'var(--muted)', perdido: 'var(--danger-hover)' };

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
            style={{
                ...style,
                borderLeft: `3px solid ${col.c}`,
            }}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-2.5 hover:border-[var(--border-hover)] hover:shadow-md transition-all cursor-grab group"
        >
            {/* Drag handle + título */}
            <div className="flex items-start gap-1.5">
                <div {...listeners} {...attributes} className="mt-0.5 cursor-grab active:cursor-grabbing text-[var(--text-muted)] opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0">
                    <GripVertical size={13} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        {o.tipo === 'aditivo' && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)' }}>
                                {o.numero?.match(/-A\d+$/)?.[0]?.replace('-', '') || 'ADT'}
                            </span>
                        )}
                        <span className="text-[10px] text-[var(--text-muted)] font-mono truncate">{o.numero}</span>
                    </div>
                    <div className="text-[13px] text-[var(--text-primary)] font-semibold leading-tight mb-0.5 truncate">{o.cliente_nome}</div>
                    {o.ambiente && <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{o.ambiente}</div>}
                    <div className="text-[13px] font-bold mt-1.5" style={{ color: col.c }}>{R$(o.valor_venda)}</div>
                </div>
            </div>

            {/* Botoes de movimentacao (fallback) */}
            <div className="flex gap-1 mt-2.5 flex-wrap md:opacity-0 md:group-hover:opacity-100 transition-opacity items-center">
                {nav && (
                    <button onClick={() => nav('whatsapp')}
                        className="text-[8px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer font-semibold"
                        style={{ borderColor: 'var(--success-border)', color: 'var(--success)' }}
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
                        style={{ borderColor: 'var(--muted)', color: 'var(--muted)' }}
                        title="Arquivar">
                        <Archive size={8} style={{ display: 'inline', marginRight: 2 }} /> Arquivar
                    </button>
                )}

                {/* Perdido (aparece em lead, orc, env, neg) */}
                {['lead', 'orc', 'env', 'neg'].includes(col.id) && (
                    <button onClick={() => move(o.id, 'perdido')}
                        className="text-[8px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer font-semibold"
                        style={{ borderColor: 'var(--danger-border)', color: 'var(--danger-hover)' }}
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
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--info)' }}>
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
    const [buscaPipeline, setBuscaPipeline] = useState('');
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
            if (result?.projeto_criado) notify('Projeto criado automaticamente!');
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
    const orcsAtivos = orcs.filter(o => {
        if (['arquivo', 'perdido'].includes(o.kb_col)) return false;
        if (!buscaPipeline) return true;
        const b = buscaPipeline.toLowerCase();
        return (o.cliente_nome || '').toLowerCase().includes(b) ||
               (o.ambiente || '').toLowerCase().includes(b) ||
               (o.numero || '').toLowerCase().includes(b);
    });
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
            <PageHeader icon={Kanban} title="Pipeline CRM" subtitle="Arraste os cards entre etapas ou use os botoes" />

            {/* Tabs */}
            <TabBar
                tabs={[
                    { id: 'pipeline', label: `Pipeline (${orcsAtivos.length})` },
                    { id: 'arquivo', label: `Arquivo (${orcsArquivados.length})`, icon: Archive },
                ]}
                active={tab}
                onChange={setTab}
            />

            {/* PIPELINE TAB */}
            {tab === 'pipeline' && (
                <>
                {/* Pipeline search bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ position: 'relative', maxWidth: 300 }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            type="text" placeholder="Filtrar pipeline..."
                            value={buscaPipeline} onChange={e => setBuscaPipeline(e.target.value)}
                            style={{
                                width: '100%', height: 34, paddingLeft: 32, paddingRight: 10,
                                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                borderRadius: 8, fontSize: 12, color: 'var(--text-primary)',
                                outline: 'none', fontFamily: 'inherit',
                                transition: 'border-color var(--transition-fast)',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                    </div>
                    {buscaPipeline && (
                        <button onClick={() => setBuscaPipeline('')}
                            style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <XCircle size={13} /> Limpar
                        </button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                        {orcsAtivos.length} de {orcs.filter(o => !['arquivo','perdido'].includes(o.kb_col)).length} orçamentos
                    </span>
                </div>

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
                            const totalVal = items.reduce((s, o) => s + (o.valor_venda || 0), 0);
                            return (
                                <div key={col.id} className="min-w-[200px] flex-1 glass-card !rounded-xl overflow-hidden">
                                    {/* Column Header */}
                                    <div className="px-3 py-2.5 border-b" style={{ borderColor: `${col.c}25`, background: `${col.c}06` }}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.c }}></div>
                                                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: col.c }}>{col.nm}</span>
                                            </div>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${col.c}18`, color: col.c }}>{items.length}</span>
                                        </div>
                                        {totalVal > 0 && (
                                            <div className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(totalVal)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Column Body (Droppable) */}
                                    <DroppableColumn col={col}>
                                        {items.map(o => (
                                            <DraggableCard key={o.id} o={o} col={col} move={move} nav={nav} KCOLS={KCOLS} />
                                        ))}
                                        {items.length === 0 && (
                                            <div className="flex-1 flex items-center justify-center py-8" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                                {buscaPipeline ? 'Nenhum resultado' : 'Arraste aqui'}
                                            </div>
                                        )}
                                    </DroppableColumn>
                                </div>
                            );
                        })}
                    </div>

                    <DragOverlay modifiers={[snapCenterToCursor]}>
                        <DragOverlayCard o={activeOrc} />
                    </DragOverlay>
                </DndContext>
                </>
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
                                { id: 'arquivo', label: 'Arquivados', count: orcsArquivados.filter(o => o.kb_col === 'arquivo').length, color: 'var(--muted)' },
                                { id: 'perdido', label: 'Perdidos', count: orcsArquivados.filter(o => o.kb_col === 'perdido').length, color: 'var(--danger-hover)' },
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
                        <EmptyState
                            icon={Archive}
                            title={orcsArquivados.length === 0 ? 'Nenhum orcamento arquivado ainda' : 'Nenhum resultado para o filtro'}
                            description="Orcamentos arquivados ou perdidos aparecem aqui"
                        />
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
                                const color = isPerdido ? 'var(--danger-hover)' : 'var(--muted)';
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
                                        <div style={{ fontSize: 13, fontWeight: 700, color: isPerdido ? 'var(--danger-border)' : 'var(--primary)', textAlign: 'right', textDecoration: isPerdido ? 'line-through' : 'none' }}>
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
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                <Archive size={10} style={{ display: 'inline', marginRight: 4 }} />
                                {orcsArquivados.filter(o => o.kb_col === 'arquivo').length} arquivados ({R$(orcsArquivados.filter(o => o.kb_col === 'arquivo').reduce((s, o) => s + (o.valor_venda || 0), 0))})
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--danger)' }}>
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
