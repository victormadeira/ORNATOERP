import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Factory, Clock, PlayCircle, CheckCircle2, AlertTriangle, Search,
    ChevronDown, ChevronRight, BarChart3, Timer, Pause, Play, Square,
    Package, Filter, RefreshCw, Users, Calendar, ClipboardCheck,
    GripVertical, Maximize2, Minimize2, Smartphone, Inbox
} from 'lucide-react';
import { PageHeader, Spinner, EmptyState, ProgressBar as PBar } from '../ui';

const ETAPAS = [
    { id: 'aguardando', label: 'Aguardando', color: 'var(--muted)', icon: Clock },
    { id: 'corte', label: 'Corte', color: 'var(--info)', icon: Factory },
    { id: 'usinagem', label: 'Usinagem', color: 'var(--info)', icon: Factory },
    { id: 'colagem_borda', label: 'Borda', color: 'var(--warning)', icon: Factory },
    { id: 'furacao', label: 'Furação', color: '#06b6d4', icon: Factory },
    { id: 'montagem', label: 'Montagem', color: '#ec4899', icon: Factory },
    { id: 'acabamento', label: 'Acabamento', color: '#14b8a6', icon: Factory },
    { id: 'embalagem', label: 'Embalagem', color: 'var(--success)', icon: Package },
    { id: 'concluido', label: 'Concluído', color: 'var(--success)', icon: CheckCircle2 },
];

const ETAPA_MAP = {};
ETAPAS.forEach(e => { ETAPA_MAP[e.id] = e; });

function api(url, opts = {}) {
    const token = localStorage.getItem('erp_token');
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { ...opts, headers }).then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status}`);
        return r.json();
    });
}

function ProgressBar({ value, color = 'var(--primary)', h = 6 }) {
    const pct = Math.min(100, Math.max(0, value || 0));
    return (
        <div style={{ width: '100%', height: h, borderRadius: h, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: h, background: color, transition: 'width 0.4s ease' }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// Kanban Card — um projeto na coluna
// ═══════════════════════════════════════════════════════════
function KanbanCard({ proj, onMoveNext, onMovePrev, tabletMode }) {
    const pct = proj.progresso_modulos || 0;

    // Urgência
    let urgColor = 'var(--success)', urgLabel = '', urgIcon = null;
    if (proj.data_entrega) {
        const diff = Math.ceil((new Date(proj.data_entrega + 'T12:00:00') - new Date()) / 86400000);
        if (diff < 0) { urgColor = 'var(--danger)'; urgLabel = `${Math.abs(diff)}d atrasado`; urgIcon = AlertTriangle; }
        else if (diff <= 5) { urgColor = 'var(--warning)'; urgLabel = `${diff}d`; urgIcon = Clock; }
        else { urgLabel = `${diff}d`; }
    }

    const isLate = urgColor === 'var(--danger)';

    return (
        <div className="prod-card prod-card-accent" style={{
            '--accent-color': urgColor,
            marginBottom: tabletMode ? 10 : 6,
            background: isLate ? `linear-gradient(135deg, var(--bg-card) 85%, ${urgColor}06 100%)` : undefined,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                <div style={{ fontSize: tabletMode ? 14 : 12.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {proj.nome}
                </div>
                {urgLabel && (
                    <span style={{
                        fontSize: 9, fontWeight: 700, color: urgColor, whiteSpace: 'nowrap',
                        padding: '2px 6px', borderRadius: 20, background: `${urgColor}12`,
                        border: `1px solid ${urgColor}25`,
                        display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                        {urgIcon && (() => { const I = urgIcon; return <I size={8} />; })()}
                        {urgLabel}
                    </span>
                )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users size={10} style={{ opacity: 0.5 }} />
                {proj.cliente || 'Sem cliente'}
            </div>
            <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{proj.modulos_concluidos || 0}/{proj.modulos_total || 0} módulos</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pct >= 100 ? 'var(--success)' : 'var(--text-muted)' }}>{Math.round(pct)}%</span>
                </div>
                <PBar value={pct} height={tabletMode ? 5 : 4} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3 }}>
                {onMovePrev && (
                    <button onClick={(e) => { e.stopPropagation(); onMovePrev(); }}
                        className="btn-secondary" style={{ width: 24, height: 24, padding: 0, fontSize: 11, minHeight: 0, borderRadius: 6 }}
                        title="Voltar etapa"
                    >←</button>
                )}
                {onMoveNext && (
                    <button onClick={(e) => { e.stopPropagation(); onMoveNext(); }}
                        className="btn-primary" style={{ width: 24, height: 24, padding: 0, fontSize: 11, minHeight: 0, borderRadius: 6 }}
                        title="Avançar etapa"
                    >→</button>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// Kanban Column
// ═══════════════════════════════════════════════════════════
function KanbanColumn({ etapa, projetos, onMove, tabletMode }) {
    const eInfo = ETAPA_MAP[etapa.id] || etapa;
    const count = projetos.length;
    const I = eInfo.icon || Factory;

    return (
        <div style={{
            flex: tabletMode ? '0 0 280px' : '1 1 0',
            minWidth: tabletMode ? 280 : 180,
            maxWidth: tabletMode ? 280 : 320,
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-muted)', borderRadius: 'var(--radius-lg)',
            overflow: 'hidden', border: '1px solid var(--border)',
        }}>
            {/* Column Header */}
            <div className="col-header" style={{ '--accent-color': eInfo.color }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: `${eInfo.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <I size={12} style={{ color: eInfo.color }} />
                    </div>
                    <span className="col-header-title">{eInfo.label}</span>
                </div>
                <span className="col-header-count" style={count > 0 ? { background: `${eInfo.color}15`, color: eInfo.color } : {}}>
                    {count}
                </span>
            </div>

            {/* Column Body */}
            <div style={{
                flex: 1, padding: 6,
                overflowY: 'auto', minHeight: 80,
                scrollbarWidth: 'thin',
            }}>
                {projetos.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '28px 12px',
                        color: 'var(--text-muted)',
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, margin: '0 auto 8px',
                            background: 'var(--bg-card)', border: '1px dashed var(--border-hover)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Inbox size={16} style={{ opacity: 0.35 }} />
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.5, fontWeight: 500 }}>Nenhum projeto</div>
                    </div>
                ) : (
                    projetos.map(p => (
                        <KanbanCard
                            key={p.id}
                            proj={p}
                            tabletMode={tabletMode}
                            onMoveNext={etapa.id !== 'concluido' ? () => onMove(p.id, etapa.id, 'next') : null}
                            onMovePrev={etapa.id !== 'aguardando' ? () => onMove(p.id, etapa.id, 'prev') : null}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// List View — tabela compacta (alternativa ao Kanban)
// ═══════════════════════════════════════════════════════════
function ListView({ projetos, onMove }) {
    return (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} className="table-stagger">
                <thead>
                    <tr>
                        <th className="th-glass" style={{ textAlign: 'left' }}>Projeto</th>
                        <th className="th-glass" style={{ textAlign: 'left' }}>Etapa</th>
                        <th className="th-glass" style={{ textAlign: 'left' }}>Prazo</th>
                        <th className="th-glass" style={{ textAlign: 'left', minWidth: 140 }}>Progresso</th>
                        <th className="th-glass" style={{ textAlign: 'center' }}>Mód.</th>
                        <th className="th-glass" style={{ textAlign: 'center', width: 80 }}>Ação</th>
                    </tr>
                </thead>
                <tbody>
                    {projetos.map(p => {
                        const eInfo = ETAPA_MAP[p.etapa_atual] || { label: p.etapa_atual || 'Aguardando', color: 'var(--muted)' };
                        const pct = p.progresso_modulos || 0;
                        let urgColor = 'var(--success)', urgLabel = 'No prazo';
                        if (p.data_entrega) {
                            const diff = Math.ceil((new Date(p.data_entrega + 'T12:00:00') - new Date()) / 86400000);
                            if (diff < 0) { urgColor = 'var(--danger)'; urgLabel = `${Math.abs(diff)}d atrasado`; }
                            else if (diff <= 5) { urgColor = 'var(--warning)'; urgLabel = `${diff}d`; }
                            else { urgLabel = `${diff}d`; }
                        } else { urgColor = 'var(--muted)'; urgLabel = 'Sem prazo'; }

                        const etapaIdx = ETAPAS.findIndex(e => e.id === p.etapa_atual);

                        return (
                            <tr key={p.id}>
                                <td className="td-glass">
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                                        {p.nome}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.cliente}</div>
                                </td>
                                <td className="td-glass">
                                    <span style={{
                                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                                        background: `${eInfo.color}12`, color: eInfo.color, whiteSpace: 'nowrap',
                                        border: `1px solid ${eInfo.color}25`,
                                    }}>{eInfo.label}</span>
                                </td>
                                <td className="td-glass">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: urgColor, flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, color: urgColor, fontWeight: 600 }}>{urgLabel}</span>
                                    </div>
                                </td>
                                <td className="td-glass">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ flex: 1 }}><PBar value={pct} height={4} /></div>
                                        <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{Math.round(pct)}%</span>
                                    </div>
                                </td>
                                <td className="td-glass" style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                                    {p.modulos_concluidos || 0}/{p.modulos_total || 0}
                                </td>
                                <td className="td-glass" style={{ textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                        {etapaIdx > 0 && (
                                            <button onClick={() => onMove(p.id, p.etapa_atual, 'prev')}
                                                className="btn-secondary" style={{ width: 26, height: 26, padding: 0, fontSize: 12, minHeight: 0 }}>←</button>
                                        )}
                                        {etapaIdx < ETAPAS.length - 1 && (
                                            <button onClick={() => onMove(p.id, p.etapa_atual, 'next')}
                                                className="btn-primary" style={{ width: 26, height: 26, padding: 0, fontSize: 12, minHeight: 0 }}>→</button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════
export default function ProducaoFabrica({ notify, user }) {
    const [projetos, setProjetos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [view, setView] = useState('kanban'); // kanban | list
    const [tabletMode, setTabletMode] = useState(false);
    const [stats, setStats] = useState({ ativos: 0, atrasados: 0, concluidos: 0, emAndamento: 0 });
    const scrollRef = useRef(null);

    const load = async () => {
        try {
            const data = await api('/api/producao-av/painel');
            const projs = data.projetos || [];
            setProjetos(projs);

            const atrasados = projs.filter(p => p.data_entrega && Math.ceil((new Date(p.data_entrega + 'T12:00:00') - new Date()) / 86400000) < 0).length;
            const emAndamento = projs.filter(p => (p.etapas_recentes || []).some(e => !e.fim)).length;
            setStats({
                ativos: projs.length,
                atrasados,
                concluidos: data.resumo?.modulos_concluidos || 0,
                emAndamento,
                modulosTotal: data.resumo?.modulos_total || 0,
            });
        } catch (err) {
            notify?.('Erro ao carregar dados de produção', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Move project to next/prev etapa
    const handleMove = async (projetoId, currentEtapa, direction) => {
        const idx = ETAPAS.findIndex(e => e.id === currentEtapa);
        const newIdx = direction === 'next' ? idx + 1 : idx - 1;
        if (newIdx < 0 || newIdx >= ETAPAS.length) return;

        const newEtapa = ETAPAS[newIdx].id;

        // If moving forward, finalize current and start new
        try {
            if (direction === 'next' && currentEtapa !== 'aguardando') {
                // Finalize current stage
                await api('/api/producao-av/apontar', {
                    method: 'POST',
                    body: JSON.stringify({ projeto_id: projetoId, etapa: currentEtapa, acao: 'finalizar', modulo_id: '' }),
                }).catch(() => {}); // may not have open apontamento
            }

            if (newEtapa !== 'concluido' && newEtapa !== 'aguardando') {
                // Start new stage
                await api('/api/producao-av/apontar', {
                    method: 'POST',
                    body: JSON.stringify({ projeto_id: projetoId, etapa: newEtapa, acao: 'iniciar', modulo_id: '' }),
                });
            }

            notify?.(`Projeto movido para ${ETAPAS[newIdx].label}`, 'success');
            load();
        } catch {
            notify?.('Erro ao mover projeto', 'error');
        }
    };

    // Group projects by etapa for Kanban
    const kanbanData = useMemo(() => {
        let filtered = projetos;
        if (busca) {
            const q = busca.toLowerCase();
            filtered = filtered.filter(p => p.nome.toLowerCase().includes(q) || (p.cliente || '').toLowerCase().includes(q));
        }

        const grouped = {};
        ETAPAS.forEach(e => { grouped[e.id] = []; });

        filtered.forEach(p => {
            const etapa = p.etapa_atual || 'aguardando';
            if (grouped[etapa]) grouped[etapa].push(p);
            else grouped['aguardando'].push(p);
        });

        return grouped;
    }, [projetos, busca]);

    const filteredList = useMemo(() => {
        if (!busca) return projetos;
        const q = busca.toLowerCase();
        return projetos.filter(p => p.nome.toLowerCase().includes(q) || (p.cliente || '').toLowerCase().includes(q));
    }, [projetos, busca]);

    if (loading) return <Spinner text="Carregando produção..." />;

    return (
        <div className="page-enter" style={{ padding: '24px 32px', maxWidth: view === 'list' ? 1200 : '100%', margin: '0 auto' }}>
            {/* Header */}
            <PageHeader icon={Factory} title="Acompanhamento" subtitle={`Chão de fábrica — ${view === 'kanban' ? 'visão Kanban' : 'visão lista'}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Segmented control — apenas modo de visualização */}
                    <div style={{
                        display: 'inline-flex', borderRadius: 8,
                        background: 'var(--bg-muted)', border: '1px solid var(--border)',
                        padding: 3, gap: 2,
                    }}>
                        {[
                            { id: 'kanban', icon: BarChart3, label: 'Kanban' },
                            { id: 'list',   icon: ClipboardCheck, label: 'Lista' },
                        ].map(({ id, icon: Icon, label }) => (
                            <button key={id} onClick={() => setView(id)} style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '4px 10px', borderRadius: 5, border: 'none',
                                cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                                transition: 'all 0.15s ease',
                                background: view === id ? 'var(--bg-card)' : 'transparent',
                                color: view === id ? 'var(--primary)' : 'var(--text-muted)',
                                boxShadow: view === id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                            }}>
                                <Icon size={13} /> {label}
                            </button>
                        ))}
                    </div>

                    {/* Modo tablet — visualmente separado: é um modo de operação, não de visualização */}
                    <button onClick={() => setTabletMode(v => !v)} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 11.5, fontWeight: 600,
                        border: `1px solid ${tabletMode ? 'var(--primary-ring)' : 'var(--border)'}`,
                        background: tabletMode ? 'var(--primary-light)' : 'var(--bg-muted)',
                        color: tabletMode ? 'var(--primary)' : 'var(--text-muted)',
                        transition: 'all 0.15s ease',
                    }} title={tabletMode ? 'Modo tablet ativo — clique para desativar' : 'Ativar modo tablet'}>
                        <Smartphone size={13} />
                        Tablet
                    </button>

                    {/* Refresh — ação utilitária, ícone discreto sem label */}
                    <button onClick={load} title="Atualizar dados" style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 30, height: 30, borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'transparent', color: 'var(--text-muted)',
                        cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>
            </PageHeader>

            {/* Stats strip */}
            <div className="stagger-children" style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 12, marginBottom: 16,
            }}>
                {[
                    { label: 'Ativos', value: stats.ativos, color: 'var(--primary)', icon: Package },
                    { label: 'Em Produção', value: stats.emAndamento, color: 'var(--warning)', icon: PlayCircle },
                    { label: 'Atrasados', value: stats.atrasados, color: 'var(--danger)', icon: AlertTriangle },
                    { label: 'Módulos', value: `${stats.concluidos}/${stats.modulosTotal || 0}`, color: 'var(--success)', icon: CheckCircle2 },
                ].map(s => (
                    <div key={s.label} className="glass-card hover-lift" style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                        borderLeft: `3px solid ${s.color}`,
                        position: 'relative', overflow: 'hidden',
                    }}>
                        <div style={{
                            position: 'absolute', top: 0, right: 0, width: 60, height: '100%',
                            background: `linear-gradient(135deg, transparent, ${s.color}08)`,
                            pointerEvents: 'none',
                        }} />
                        <div style={{
                            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                            background: `${s.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 2px 8px ${s.color}15`,
                        }}>
                            <s.icon size={17} style={{ color: s.color }} />
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{s.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 16, maxWidth: view === 'list' ? '100%' : 400 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar projeto ou cliente..."
                    className="input-glass"
                    style={{ paddingLeft: 36 }}
                />
            </div>

            {/* Content */}
            {view === 'kanban' ? (
                <div
                    ref={scrollRef}
                    style={{
                        display: 'flex', gap: 10, overflowX: 'auto',
                        paddingBottom: 16, scrollbarWidth: 'thin', minHeight: 400,
                    }}
                >
                    {ETAPAS.map(etapa => (
                        <KanbanColumn
                            key={etapa.id}
                            etapa={etapa}
                            projetos={kanbanData[etapa.id] || []}
                            onMove={handleMove}
                            tabletMode={tabletMode}
                        />
                    ))}
                </div>
            ) : (
                filteredList.length === 0 ? (
                    <EmptyState
                        icon={Package}
                        title="Nenhum projeto em produção"
                        description="Projetos aparecerão aqui quando forem movidos para a fase de produção."
                    />
                ) : (
                    <ListView projetos={filteredList} onMove={handleMove} />
                )
            )}
        </div>
    );
}
