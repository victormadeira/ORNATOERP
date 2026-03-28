import { useState, useEffect, useMemo, useRef } from 'react';
import {
    Factory, Clock, PlayCircle, CheckCircle2, AlertTriangle, Search,
    ChevronDown, ChevronRight, BarChart3, Timer, Pause, Play, Square,
    Package, Filter, RefreshCw, Users, Calendar, ClipboardCheck,
    GripVertical, Maximize2, Minimize2, Smartphone
} from 'lucide-react';

const ETAPAS = [
    { id: 'aguardando', label: 'Aguardando', color: '#94a3b8', icon: Clock },
    { id: 'corte', label: 'Corte', color: '#3b82f6', icon: Factory },
    { id: 'usinagem', label: 'Usinagem', color: '#8b5cf6', icon: Factory },
    { id: 'colagem_borda', label: 'Borda', color: '#f59e0b', icon: Factory },
    { id: 'furacao', label: 'Furação', color: '#06b6d4', icon: Factory },
    { id: 'montagem', label: 'Montagem', color: '#ec4899', icon: Factory },
    { id: 'acabamento', label: 'Acabamento', color: '#14b8a6', icon: Factory },
    { id: 'embalagem', label: 'Embalagem', color: '#22c55e', icon: Package },
    { id: 'concluido', label: 'Concluído', color: '#10b981', icon: CheckCircle2 },
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
    let urgColor = '#22c55e', urgLabel = '';
    if (proj.data_entrega) {
        const diff = Math.ceil((new Date(proj.data_entrega + 'T12:00:00') - new Date()) / 86400000);
        if (diff < 0) { urgColor = '#ef4444'; urgLabel = `${Math.abs(diff)}d atrasado`; }
        else if (diff <= 5) { urgColor = '#f59e0b'; urgLabel = `${diff}d`; }
        else { urgLabel = `${diff}d`; }
    }

    const fontSize = tabletMode ? 16 : 13;
    const padding = tabletMode ? '14px 16px' : '10px 12px';

    return (
        <div
            style={{
                background: 'var(--bg-card)', borderRadius: 10, padding,
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${urgColor}`,
                cursor: 'grab', transition: 'box-shadow 0.15s, transform 0.15s',
                marginBottom: tabletMode ? 10 : 6,
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                <div style={{ fontSize, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {proj.nome}
                </div>
                {urgLabel && (
                    <span style={{
                        fontSize: tabletMode ? 12 : 10, fontWeight: 700, color: urgColor, whiteSpace: 'nowrap',
                        padding: '1px 6px', borderRadius: 4, background: `${urgColor}15`,
                    }}>
                        {urgLabel}
                    </span>
                )}
            </div>
            <div style={{ fontSize: tabletMode ? 13 : 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                {proj.cliente}
            </div>
            <ProgressBar value={pct} color={pct >= 100 ? '#22c55e' : pct >= 60 ? 'var(--primary)' : '#f59e0b'} h={tabletMode ? 8 : 5} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: tabletMode ? 12 : 10, color: 'var(--text-muted)' }}>
                    {proj.modulos_concluidos || 0}/{proj.modulos_total || 0} mód
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                    {onMovePrev && (
                        <button onClick={(e) => { e.stopPropagation(); onMovePrev(); }}
                            style={{
                                width: tabletMode ? 32 : 22, height: tabletMode ? 32 : 22, borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg-card)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: 'var(--text-muted)', fontSize: tabletMode ? 14 : 11,
                            }}
                            title="Voltar etapa"
                        >←</button>
                    )}
                    {onMoveNext && (
                        <button onClick={(e) => { e.stopPropagation(); onMoveNext(); }}
                            style={{
                                width: tabletMode ? 32 : 22, height: tabletMode ? 32 : 22, borderRadius: 6,
                                border: 'none', background: 'var(--primary)', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', fontSize: tabletMode ? 14 : 11,
                            }}
                            title="Avançar etapa"
                        >→</button>
                    )}
                </div>
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

    return (
        <div style={{
            flex: tabletMode ? '0 0 280px' : '1 1 0',
            minWidth: tabletMode ? 280 : 160,
            maxWidth: tabletMode ? 280 : 320,
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-muted)', borderRadius: 12,
            overflow: 'hidden',
        }}>
            {/* Column Header */}
            <div style={{
                padding: tabletMode ? '12px 14px' : '8px 10px',
                borderBottom: `3px solid ${eInfo.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--bg-card)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                        width: tabletMode ? 10 : 8, height: tabletMode ? 10 : 8,
                        borderRadius: '50%', background: eInfo.color,
                    }} />
                    <span style={{
                        fontSize: tabletMode ? 14 : 12, fontWeight: 700,
                        color: 'var(--text-primary)',
                    }}>
                        {eInfo.label}
                    </span>
                </div>
                <span style={{
                    fontSize: tabletMode ? 13 : 11, fontWeight: 700,
                    padding: '1px 8px', borderRadius: 10,
                    background: count > 0 ? `${eInfo.color}20` : 'var(--bg-muted)',
                    color: count > 0 ? eInfo.color : 'var(--text-muted)',
                }}>
                    {count}
                </span>
            </div>

            {/* Column Body */}
            <div style={{
                flex: 1, padding: tabletMode ? '10px 10px' : '6px 6px',
                overflowY: 'auto', minHeight: 100,
                scrollbarWidth: 'thin',
            }}>
                {projetos.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '20px 8px',
                        color: 'var(--text-muted)', fontSize: tabletMode ? 13 : 11,
                        opacity: 0.6,
                    }}>
                        Nenhum projeto
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
function ListView({ projetos, onMove, tabletMode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Header */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 120px 120px 160px 80px 70px',
                alignItems: 'center', gap: 12, padding: '6px 16px',
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
                <span>Projeto</span>
                <span>Etapa</span>
                <span>Prazo</span>
                <span>Progresso</span>
                <span style={{ textAlign: 'center' }}>Mód.</span>
                <span style={{ textAlign: 'center' }}>Ação</span>
            </div>
            {projetos.map(p => {
                const eInfo = ETAPA_MAP[p.etapa_atual] || { label: p.etapa_atual || 'Aguardando', color: '#94a3b8' };
                const pct = p.progresso_modulos || 0;
                let urgColor = '#22c55e', urgLabel = 'No prazo';
                if (p.data_entrega) {
                    const diff = Math.ceil((new Date(p.data_entrega + 'T12:00:00') - new Date()) / 86400000);
                    if (diff < 0) { urgColor = '#ef4444'; urgLabel = `${Math.abs(diff)}d atrasado`; }
                    else if (diff <= 5) { urgColor = '#f59e0b'; urgLabel = `${diff}d`; }
                    else { urgLabel = `${diff}d`; }
                } else { urgColor = '#94a3b8'; urgLabel = 'Sem prazo'; }

                const etapaIdx = ETAPAS.findIndex(e => e.id === p.etapa_atual);

                return (
                    <div key={p.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr 120px 120px 160px 80px 70px',
                        alignItems: 'center', gap: 12, padding: '10px 16px',
                        background: 'var(--bg-card)', borderRadius: 10,
                        border: '1px solid var(--border)',
                    }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.nome}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.cliente}</div>
                        </div>
                        <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                            background: `${eInfo.color}18`, color: eInfo.color, whiteSpace: 'nowrap',
                            display: 'inline-block', textAlign: 'center',
                        }}>{eInfo.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: urgColor }} />
                            <span style={{ fontSize: 11, color: urgColor, fontWeight: 600 }}>{urgLabel}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ProgressBar value={pct} color={pct >= 100 ? '#22c55e' : 'var(--primary)'} />
                            <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{Math.round(pct)}%</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                            {p.modulos_concluidos || 0}/{p.modulos_total || 0}
                        </span>
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                            {etapaIdx > 0 && (
                                <button onClick={() => onMove(p.id, p.etapa_atual, 'prev')} style={miniBtn('var(--border)')}>←</button>
                            )}
                            {etapaIdx < ETAPAS.length - 1 && (
                                <button onClick={() => onMove(p.id, p.etapa_atual, 'next')} style={miniBtn('var(--primary)', '#fff')}>→</button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

const miniBtn = (bg, color) => ({
    width: 24, height: 24, borderRadius: 6, border: 'none',
    background: bg, color: color || 'var(--text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: 12, fontWeight: 700,
});

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

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, color: 'var(--text-muted)' }}>
                <RefreshCw size={20} className="spin" /> Carregando...
            </div>
        );
    }

    return (
        <div style={{ padding: tabletMode ? '16px' : '24px 32px', maxWidth: view === 'list' ? 1200 : '100%', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'var(--primary-gradient)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Factory size={22} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            Acompanhamento
                        </h1>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                            Chão de fábrica — {view === 'kanban' ? 'visão Kanban' : 'visão lista'}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {/* View toggle */}
                    <div style={{
                        display: 'flex', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden',
                    }}>
                        {[
                            { id: 'kanban', label: 'Kanban', icon: BarChart3 },
                            { id: 'list', label: 'Lista', icon: ClipboardCheck },
                        ].map(v => (
                            <button key={v.id} onClick={() => setView(v.id)} style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                                border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                background: view === v.id ? 'var(--primary)' : 'var(--bg-card)',
                                color: view === v.id ? '#fff' : 'var(--text-muted)',
                                transition: 'all 0.15s',
                            }}>
                                <v.icon size={14} /> {v.label}
                            </button>
                        ))}
                    </div>
                    {/* Tablet mode */}
                    <button onClick={() => setTabletMode(!tabletMode)} style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                        borderRadius: 8, border: '1px solid var(--border)',
                        background: tabletMode ? 'var(--primary)' : 'var(--bg-card)',
                        color: tabletMode ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}>
                        <Smartphone size={14} /> Tablet
                    </button>
                    <button onClick={load} style={{
                        display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                        borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                        color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}>
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Stats strip */}
            <div style={{
                display: 'flex', gap: tabletMode ? 12 : 16, marginBottom: 16, overflowX: 'auto',
                paddingBottom: 4,
            }}>
                {[
                    { label: 'Ativos', value: stats.ativos, color: 'var(--primary)', icon: Package },
                    { label: 'Em Produção', value: stats.emAndamento, color: '#f59e0b', icon: PlayCircle },
                    { label: 'Atrasados', value: stats.atrasados, color: '#ef4444', icon: AlertTriangle },
                    { label: 'Módulos', value: `${stats.concluidos}/${stats.modulosTotal || 0}`, color: '#22c55e', icon: CheckCircle2 },
                ].map(s => (
                    <div key={s.label} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: tabletMode ? '12px 18px' : '8px 14px',
                        background: 'var(--bg-card)', borderRadius: 10,
                        border: '1px solid var(--border)', whiteSpace: 'nowrap', flex: '0 0 auto',
                    }}>
                        <s.icon size={tabletMode ? 20 : 16} style={{ color: s.color }} />
                        <div>
                            <div style={{ fontSize: tabletMode ? 11 : 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{s.label}</div>
                            <div style={{ fontSize: tabletMode ? 22 : 18, fontWeight: 800, color: 'var(--text-primary)' }}>{s.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 16, maxWidth: view === 'list' ? '100%' : 400 }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar projeto ou cliente..."
                    style={{
                        width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--bg-input)',
                        color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                    }}
                />
            </div>

            {/* Content */}
            {view === 'kanban' ? (
                <div
                    ref={scrollRef}
                    style={{
                        display: 'flex', gap: 10, overflowX: 'auto',
                        paddingBottom: 16,
                        scrollbarWidth: 'thin',
                        minHeight: 400,
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
                    <div style={{
                        textAlign: 'center', padding: 48, color: 'var(--text-muted)',
                        background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)',
                    }}>
                        <Package size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
                        <div style={{ fontSize: 15, fontWeight: 600 }}>Nenhum projeto em produção</div>
                    </div>
                ) : (
                    <ListView projetos={filteredList} onMove={handleMove} tabletMode={tabletMode} />
                )
            )}
        </div>
    );
}
