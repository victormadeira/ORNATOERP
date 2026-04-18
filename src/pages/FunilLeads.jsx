import { useState, useEffect, useCallback } from 'react';
import { Z, Ic, PageHeader, Modal } from '../ui';
import { colorBg, colorBorder } from '../theme';
import api from '../api';
import { useAuth } from '../auth';
import {
    GripVertical, Search, Plus, Phone, MessageCircle, MapPin, Calendar,
    Clock, AlertTriangle, TrendingUp, Users, Target, ArrowRight,
    MoreVertical, Trash2, Edit3, Eye, X, Filter, Settings,
    ChevronDown, ExternalLink, BarChart3, PieChart,
    Flame, Snowflake, Droplets, ThermometerSun, Mail,
    FileText, Link2, PlusCircle
} from 'lucide-react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, pointerWithin } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';

// ═══════════════════════════════════════════════════════
// FUNIL DE LEADS — Kanban + Métricas
// ═══════════════════════════════════════════════════════

// Animação do fogo SVG
const fireStyle = document.getElementById('fire-anim-style') || (() => {
    const s = document.createElement('style');
    s.id = 'fire-anim-style';
    s.textContent = `@keyframes fireFlicker { 0%,100%{transform:scale(1)} 25%{transform:scale(1.15) rotate(-3deg)} 50%{transform:scale(1.05)} 75%{transform:scale(1.2) rotate(3deg)} } .fire-icon{animation:fireFlicker 0.6s ease-in-out infinite;transform-origin:bottom center;display:inline-flex}`;
    document.head.appendChild(s);
    return s;
})();

const ORIGENS_LABEL = {
    instagram: 'Instagram', google: 'Google', indicacao: 'Indicação',
    facebook: 'Facebook', arquiteto: 'Arquiteto', site: 'Site',
    whatsapp: 'WhatsApp', outro: 'Outro', '': 'Não informado',
};
const ORIGENS_COLOR = {
    instagram: '#E1306C', google: '#4285F4', indicacao: '#22c55e',
    facebook: '#1877F2', arquiteto: '#8b5cf6', site: '#06b6d4',
    whatsapp: '#25D366', outro: '#64748b', '': '#94a3b8',
};
const TEMP_CONFIG = {
    muito_quente: { icon: Flame,          color: '#ef4444', bg: '#fef2f2', text: 'Muito quente', animated: true },
    quente:       { icon: ThermometerSun,  color: '#f97316', bg: '#fff7ed', text: 'Quente', animated: true },
    morno:        { icon: Droplets,        color: '#eab308', bg: '#fefce8', text: 'Morno' },
    frio:         { icon: Snowflake,       color: '#64748b', bg: '#f1f5f9', text: 'Frio' },
};

function TempIcon({ temp, size = 13 }) {
    const tc = TEMP_CONFIG[temp] || TEMP_CONFIG.frio;
    const IconComp = tc.icon;
    if (tc.animated) {
        return <span className="fire-icon"><IconComp size={size} style={{ color: tc.color }} /></span>;
    }
    return <IconComp size={size} style={{ color: tc.color }} />;
}

function getTemperatura(lead) {
    const dados = typeof lead.dados === 'string' ? JSON.parse(lead.dados || '{}') : (lead.dados || {});
    if (dados.temperatura) return dados.temperatura;
    const s = lead.score || 0;
    if (s >= 76) return 'muito_quente';
    if (s >= 51) return 'quente';
    if (s >= 26) return 'morno';
    return 'frio';
}

function getNotas(lead) {
    const dados = typeof lead.dados === 'string' ? JSON.parse(lead.dados || '{}') : (lead.dados || {});
    return dados.notas || '';
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
}

// ── Card arrastável ──
function DraggableCard({ lead, onEdit, onOpen, nav, onNewOrc, onLinkOrc }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `lead-${lead.id}`,
        data: { leadId: lead.id, fromCol: lead.coluna_id },
    });

    const style = {
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.3 : 1,
        transition: isDragging ? undefined : 'opacity 0.15s',
    };

    const diasParado = lead.dias_parado || 0;
    const alertColor = diasParado >= 7 ? '#ef4444' : diasParado >= 3 ? '#f59e0b' : null;
    const origemColor = ORIGENS_COLOR[lead.origem] || ORIGENS_COLOR[''];

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg p-3 hover:border-[var(--border-hover)] transition-all cursor-grab group"
        >
            <div className="flex items-start gap-1.5">
                <div {...listeners} {...attributes} className="mt-0.5 cursor-grab active:cursor-grabbing text-[var(--text-muted)] opacity-60 md:opacity-0 md:group-hover:opacity-60 transition-opacity flex-shrink-0">
                    <GripVertical size={14} />
                </div>
                <div className="flex-1 min-w-0">
                    {(() => {
                        const temp = getTemperatura(lead);
                        const tc = TEMP_CONFIG[temp] || TEMP_CONFIG.frio;
                        const notas = getNotas(lead);
                        const dados = typeof lead.dados === 'string' ? JSON.parse(lead.dados || '{}') : (lead.dados || {});
                        return (<>
                            {/* Nome + Temperatura + Score */}
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span title={tc.text} style={{ flexShrink: 0 }}><TempIcon temp={temp} /></span>
                                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{lead.nome || 'Sem nome'}</span>
                                </div>
                                {lead.score > 0 && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{
                                        background: tc.bg, color: tc.color,
                                    }}>
                                        {lead.score}pts
                                    </span>
                                )}
                            </div>

                            {/* Projeto */}
                            {lead.projeto && (
                                <div className="text-[11px] text-[var(--text-primary)] mb-1 truncate">{lead.projeto}</div>
                            )}

                            {/* Contato: telefone + email */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1 text-[10px] text-[var(--text-muted)]">
                                {lead.telefone && (
                                    <span className="flex items-center gap-1"><Phone size={8} style={{ opacity: 0.5 }} />{lead.telefone}</span>
                                )}
                                {lead.email && (
                                    <span className="flex items-center gap-1"><Mail size={8} style={{ opacity: 0.5 }} />{lead.email}</span>
                                )}
                            </div>

                            {/* Dados extras (tipo_imovel, urgencia) */}
                            {(dados.tipo_imovel || dados.urgencia || dados.num_ambientes) && (
                                <div className="text-[9px] text-[var(--text-muted)] mb-1 flex flex-wrap gap-x-2">
                                    {dados.tipo_imovel && <span>{dados.tipo_imovel}</span>}
                                    {dados.num_ambientes && <span>{dados.num_ambientes} amb.</span>}
                                    {dados.urgencia && <span style={{ color: dados.urgencia === 'alta' ? '#ef4444' : undefined }}>{dados.urgencia}</span>}
                                </div>
                            )}

                            {/* Notas da IA */}
                            {notas && (
                                <div className="text-[9px] text-[var(--text-muted)] mb-1 truncate italic flex items-center gap-1" title={notas}>
                                    <Eye size={8} style={{ flexShrink: 0, opacity: 0.5 }} />{notas}
                                </div>
                            )}

                            {/* Tags: Temperatura + Origem + Cidade */}
                            <div className="flex flex-wrap gap-1 mb-1.5">
                                <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5" style={{
                                    background: tc.bg, color: tc.color,
                                }}>
                                    <TempIcon temp={temp} size={8} /> {tc.text}
                                </span>
                                {lead.origem && (
                                    <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{
                                        background: colorBg(origemColor), color: origemColor,
                                    }}>
                                        {ORIGENS_LABEL[lead.origem] || lead.origem}
                                    </span>
                                )}
                                {(lead.bairro || lead.cidade) && (
                                    <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{
                                        background: 'var(--bg-card)', color: 'var(--text-muted)',
                                    }}>
                                        <MapPin size={7} className="inline mr-0.5" style={{ verticalAlign: 'middle' }} />{lead.bairro || lead.cidade}
                                    </span>
                                )}
                            </div>

                            {/* Orçamento vinculado */}
                            {lead.orc_id && (
                                <div className="text-[9px] mb-1.5 flex items-center gap-1 px-1.5 py-1 rounded" style={{ background: colorBg('#3b82f6'), color: '#3b82f6' }}>
                                    <FileText size={9} />
                                    <span className="font-semibold">Orç. {lead.orc_numero || `#${lead.orc_id}`}</span>
                                    {lead.orc_valor > 0 && <span className="ml-auto font-bold">R$ {Number(lead.orc_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                                </div>
                            )}

                            {/* Footer: tempo + ações */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                                    {alertColor && (
                                        <span style={{ color: alertColor, display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
                                            <AlertTriangle size={9} />{diasParado}d
                                        </span>
                                    )}
                                    {!alertColor && (
                                        <span><Clock size={9} className="inline" style={{ verticalAlign: 'middle' }} /> {timeAgo(lead.atualizado_em)}</span>
                                    )}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {lead.conversa_id && (
                                        <button onClick={(e) => { e.stopPropagation(); nav?.('mensagens'); }} className="p-1 rounded hover:bg-[var(--bg-card)]" title="Abrir conversa">
                                            <MessageCircle size={11} style={{ color: '#25D366' }} />
                                        </button>
                                    )}
                                    {!lead.orc_id && (
                                        <button onClick={(e) => { e.stopPropagation(); onNewOrc?.(lead); }} className="p-1 rounded hover:bg-[var(--bg-card)]" title="Criar orçamento">
                                            <PlusCircle size={11} style={{ color: '#3b82f6' }} />
                                        </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); onEdit(lead); }} className="p-1 rounded hover:bg-[var(--bg-card)]" title="Editar">
                                        <Edit3 size={11} style={{ color: 'var(--text-muted)' }} />
                                    </button>
                                </div>
                            </div>
                        </>);
                    })()}
                </div>
            </div>
        </div>
    );
}

// ── Overlay durante drag ──
function DragOverlayCard({ lead }) {
    if (!lead) return null;
    return (
        <div className="bg-[var(--bg-card)] border-2 border-[var(--primary)] rounded-lg p-3 shadow-xl w-[240px] opacity-90">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{lead.nome || 'Sem nome'}</div>
            {lead.projeto && <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{lead.projeto}</div>}
        </div>
    );
}

// ── Coluna droppable ──
function DroppableColumn({ coluna, leads, children }) {
    const { setNodeRef, isOver } = useDroppable({
        id: `col-${coluna.id}`,
        data: { colunaId: coluna.id },
    });

    return (
        <div
            ref={setNodeRef}
            className="flex flex-col rounded-xl transition-all"
            style={{
                minWidth: 260, maxWidth: 300, flex: '1 0 260px',
                background: isOver ? colorBg(coluna.cor) : 'transparent',
                outline: isOver ? `2px dashed ${coluna.cor}` : 'none',
                outlineOffset: -2,
            }}
        >
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: coluna.cor, flexShrink: 0 }} />
                    <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">{coluna.nome}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg-muted)] text-[var(--text-muted)]">
                    {leads.length}
                </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2" style={{ maxHeight: 'calc(100vh - 300px)', minHeight: 80 }}>
                {children}
                {leads.length === 0 && (
                    <div className="text-center text-[11px] text-[var(--text-muted)] py-8 opacity-50">
                        Arraste leads aqui
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Mini Dashboard ──
function MetricsDash({ metricas }) {
    if (!metricas) return null;
    const m = metricas;

    const cards = [
        { label: 'Total Leads', value: m.totalLeads, icon: Users, color: '#3b82f6' },
        { label: 'Convertidos', value: m.convertidos, icon: Target, color: '#22c55e' },
        { label: 'Taxa Conversão', value: `${m.taxaConversao}%`, icon: TrendingUp, color: '#8b5cf6' },
        { label: 'Esta Semana', value: m.estaSemana, icon: Calendar, color: '#06b6d4', sub: m.semanaPassada > 0 ? `vs ${m.semanaPassada} sem. ant.` : null },
        { label: 'Tempo Médio', value: `${m.tempoMedioConversao}d`, icon: Clock, color: '#f59e0b' },
        { label: 'Atrasados', value: m.followupAtrasado + m.parados, icon: AlertTriangle, color: m.followupAtrasado + m.parados > 0 ? '#ef4444' : '#64748b' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {/* Metric Cards */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {cards.map((c, i) => (
                    <div key={i} className="glass-card" style={{
                        flex: '1 1 140px', minWidth: 130, padding: '10px 14px',
                        display: 'flex', alignItems: 'center', gap: 10,
                        borderLeft: `3px solid ${c.color}`,
                    }}>
                        <c.icon size={18} style={{ color: c.color, flexShrink: 0 }} />
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{c.value}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
                            {c.sub && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{c.sub}</div>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Origens mini */}
            {m.porOrigem && m.porOrigem.length > 0 && (
                <div className="glass-card" style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        <PieChart size={10} className="inline" style={{ verticalAlign: 'middle', marginRight: 4 }} />Leads por Origem
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {m.porOrigem.map((o, i) => {
                            const cor = ORIGENS_COLOR[o.origem] || ORIGENS_COLOR[''];
                            return (
                                <span key={i} style={{
                                    fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                                    background: colorBg(cor), color: cor,
                                }}>
                                    {ORIGENS_LABEL[o.origem] || o.origem} {o.total}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════
export default function FunilLeads({ notify, nav }) {
    const { user } = useAuth();
    const [colunas, setColunas] = useState([]);
    const [leads, setLeads] = useState([]);
    const [metricas, setMetricas] = useState(null);
    const [search, setSearch] = useState('');
    const [activeId, setActiveId] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editLead, setEditLead] = useState(null);
    const [showMetrics, setShowMetrics] = useState(true);
    const [showColConfig, setShowColConfig] = useState(false);
    const [colForm, setColForm] = useState({ nome: '', cor: '#64748b' });
    const [editColId, setEditColId] = useState(null);
    const [editColForm, setEditColForm] = useState({ nome: '', cor: '' });
    const [showLinkOrc, setShowLinkOrc] = useState(null); // lead para vincular orçamento
    const [orcsDisponiveis, setOrcsDisponiveis] = useState([]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    // ── Carregar dados ──
    const loadAll = useCallback(async () => {
        try {
            const [colsData, leadsData, metData] = await Promise.all([
                api.get('/leads/colunas'),
                api.get('/leads'),
                api.get('/leads/metricas/dashboard'),
            ]);
            setColunas(Array.isArray(colsData) ? colsData : []);
            setLeads(Array.isArray(leadsData) ? leadsData : []);
            setMetricas(metData || {});
        } catch (e) {
            notify?.('Erro ao carregar funil');
        }
    }, [notify]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Polling a cada 30s
    useEffect(() => {
        const interval = setInterval(loadAll, 30000);
        return () => clearInterval(interval);
    }, [loadAll]);

    // ── Drag handlers ──
    const handleDragStart = (event) => setActiveId(event.active.id);

    const handleDragEnd = async (event) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over) return;

        const leadId = active.data.current?.leadId;
        const fromCol = active.data.current?.fromCol;
        const toCol = over.data.current?.colunaId;
        if (!leadId || !toCol || fromCol === toCol) return;

        // Optimistic update
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, coluna_id: toCol, atualizado_em: new Date().toISOString() } : l));

        // Verificar se é a coluna "Convertido" — perguntar se quer criar orçamento
        const targetCol = colunas.find(c => c.id === toCol);
        const isConvertido = targetCol?.nome?.toLowerCase().includes('convertido');
        const isPerdido = targetCol?.nome?.toLowerCase().includes('perdido');

        if (isPerdido) {
            const motivo = prompt('Motivo da perda (opcional):');
            try {
                await api.put(`/leads/${leadId}/mover`, { coluna_id: toCol, motivo_perda: motivo || '' });
                loadAll();
            } catch { notify?.('Erro ao mover lead'); loadAll(); }
            return;
        }

        try {
            await api.put(`/leads/${leadId}/mover`, { coluna_id: toCol });
            if (isConvertido) {
                const lead = leads.find(l => l.id === leadId);
                if (lead && window.confirm(`Lead "${lead.nome}" convertido! Deseja criar um orçamento agora?`)) {
                    nav?.('novo');
                }
            }
            loadAll();
        } catch {
            notify?.('Erro ao mover lead');
            loadAll();
        }
    };

    // ── CRUD Lead ──
    const saveLead = async (data) => {
        try {
            if (data.id) {
                await api.put(`/leads/${data.id}`, data);
            } else {
                await api.post('/leads', data);
            }
            setShowModal(false);
            setEditLead(null);
            loadAll();
            notify?.('Lead salvo!');
        } catch { notify?.('Erro ao salvar lead'); }
    };

    const deleteLead = async (id) => {
        if (!window.confirm('Excluir este lead?')) return;
        try {
            await api.del(`/leads/${id}`);
            loadAll();
            notify?.('Lead excluído');
        } catch { notify?.('Erro ao excluir'); }
    };

    const addColumn = async () => {
        if (!colForm.nome?.trim()) { notify?.('Digite o nome da coluna'); return; }
        try {
            await api.post('/leads/colunas', { ...colForm, nome: colForm.nome.trim() });
            setColForm({ nome: '', cor: '#64748b' });
            loadAll();
            notify?.('Coluna criada!');
        } catch (err) { notify?.(err?.error || 'Erro ao criar coluna'); }
    };

    const startEditColumn = (col) => {
        setEditColId(col.id);
        setEditColForm({ nome: col.nome, cor: col.cor });
    };

    const saveEditColumn = async () => {
        if (!editColForm.nome?.trim()) { notify?.('Nome obrigatório'); return; }
        try {
            await api.put(`/leads/colunas/${editColId}`, { nome: editColForm.nome.trim(), cor: editColForm.cor });
            setEditColId(null);
            loadAll();
            notify?.('Coluna atualizada!');
        } catch (err) { notify?.(err?.error || 'Erro ao editar coluna'); }
    };

    const deleteColumn = async (id) => {
        if (!window.confirm('Desativar esta coluna? Os leads serão movidos para a primeira coluna.')) return;
        try {
            await api.del(`/leads/colunas/${id}`);
            loadAll();
            notify?.('Coluna removida');
        } catch (err) { notify?.(err?.error || 'Erro ao remover coluna'); }
    };

    // ── Orçamento ──
    const handleNewOrc = (lead) => {
        // Navegar para criar orçamento com dados do lead pré-preenchidos
        // Salvamos o lead_id para vincular depois
        sessionStorage.setItem('orc_from_lead', JSON.stringify({ lead_id: lead.id, cliente_nome: lead.nome, cliente_id: lead.cliente_id }));
        nav?.('novo');
    };

    const handleOpenLinkOrc = async (lead) => {
        setShowLinkOrc(lead);
        try {
            const orcs = await api.get('/leads/orcamentos-disponiveis');
            setOrcsDisponiveis(Array.isArray(orcs) ? orcs : []);
        } catch { setOrcsDisponiveis([]); }
    };

    const handleLinkOrc = async (orcId) => {
        if (!showLinkOrc) return;
        try {
            await api.put(`/leads/${showLinkOrc.id}/vincular-orcamento`, { orcamento_id: orcId });
            setShowLinkOrc(null);
            loadAll();
            notify?.('Orçamento vinculado!');
        } catch { notify?.('Erro ao vincular'); }
    };

    const handleUnlinkOrc = async (leadId) => {
        if (!window.confirm('Desvincular orçamento deste lead?')) return;
        try {
            await api.del(`/leads/${leadId}/vincular-orcamento`);
            loadAll();
            notify?.('Orçamento desvinculado');
        } catch { notify?.('Erro ao desvincular'); }
    };

    // ── Filtro ──
    const q = search.toLowerCase();
    const filteredLeads = q
        ? leads.filter(l => (l.nome || '').toLowerCase().includes(q) || (l.projeto || '').toLowerCase().includes(q) || (l.cidade || '').toLowerCase().includes(q) || (l.telefone || '').includes(q))
        : leads;

    const draggedLead = activeId ? leads.find(l => `lead-${l.id}` === activeId) : null;

    return (
        <div className={Z.pg}>
            <PageHeader title="Funil de Leads" subtitle="Gestão de leads e pipeline de vendas">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                        onClick={() => setShowMetrics(v => !v)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-muted)] transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <BarChart3 size={12} className="inline mr-1" style={{ verticalAlign: 'middle' }} />
                        {showMetrics ? 'Ocultar' : 'Métricas'}
                    </button>
                    <button
                        onClick={() => setShowColConfig(v => !v)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-muted)] transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <Settings size={12} className="inline mr-1" style={{ verticalAlign: 'middle' }} />
                        Colunas
                    </button>
                    <button
                        onClick={() => { setEditLead(null); setShowModal(true); }}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
                        style={{ background: 'var(--primary)', color: '#fff' }}
                    >
                        <Plus size={12} className="inline mr-1" style={{ verticalAlign: 'middle' }} />
                        Novo Lead
                    </button>
                </div>
            </PageHeader>

            {/* Métricas */}
            {showMetrics && <MetricsDash metricas={metricas} />}

            {/* Config de colunas */}
            {showColConfig && (
                <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Configurar Colunas do Funil</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {colunas.map(c => (
                            <div key={c.id} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 10px', borderRadius: 8,
                                background: colorBg(c.cor), border: `1px solid ${colorBorder(c.cor)}`,
                            }}>
                                {editColId === c.id ? (
                                    <>
                                        <input
                                            type="color" value={editColForm.cor}
                                            onChange={e => setEditColForm(p => ({ ...p, cor: e.target.value }))}
                                            style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
                                        />
                                        <input
                                            value={editColForm.nome}
                                            onChange={e => setEditColForm(p => ({ ...p, nome: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && saveEditColumn()}
                                            className={Z.inp}
                                            style={{ fontSize: 12, padding: '3px 8px', flex: 1 }}
                                            autoFocus
                                            disabled={c.protegida}
                                        />
                                        <button onClick={saveEditColumn} className="text-[10px] px-2 py-1 rounded font-semibold" style={{ background: 'var(--primary)', color: '#fff', whiteSpace: 'nowrap' }}>
                                            Salvar
                                        </button>
                                        <button onClick={() => setEditColId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                            <X size={12} style={{ color: 'var(--text-muted)' }} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ width: 10, height: 10, borderRadius: 3, background: c.cor, flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, fontWeight: 600, color: c.cor, flex: 1 }}>{c.nome}</span>
                                        {c.protegida && <span title="Coluna fixa — entrada automática de leads" style={{ opacity: 0.4 }}><Settings size={10} /></span>}
                                        {!c.protegida && (
                                            <button onClick={() => startEditColumn(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} title="Editar">
                                                <Edit3 size={11} style={{ color: c.cor, opacity: 0.6 }} />
                                            </button>
                                        )}
                                        {c.protegida ? (
                                            <button onClick={() => startEditColumn(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} title="Editar cor">
                                                <Edit3 size={11} style={{ color: c.cor, opacity: 0.4 }} />
                                            </button>
                                        ) : (
                                            <button onClick={() => deleteColumn(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }} title="Remover">
                                                <Trash2 size={11} style={{ color: '#ef4444', opacity: 0.5 }} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                    {/* Adicionar nova coluna */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                        <input
                            type="color" value={colForm.cor}
                            onChange={e => setColForm({ ...colForm, cor: e.target.value })}
                            style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
                        />
                        <input
                            value={colForm.nome}
                            onChange={e => setColForm({ ...colForm, nome: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && addColumn()}
                            placeholder="Nova coluna..."
                            className={Z.inp}
                            style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
                        />
                        <button onClick={addColumn} className="text-xs px-3 py-1 rounded font-semibold" style={{ background: 'var(--primary)', color: '#fff', whiteSpace: 'nowrap' }}>
                            <Plus size={11} className="inline mr-0.5" style={{ verticalAlign: 'middle' }} />Adicionar
                        </button>
                    </div>
                </div>
            )}

            {/* Busca */}
            <div style={{ marginBottom: 12, maxWidth: 320 }}>
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar lead..."
                        className={Z.inp}
                        style={{ paddingLeft: 30, fontSize: 12 }}
                    />
                </div>
            </div>

            {/* Kanban */}
            <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, WebkitOverflowScrolling: 'touch' }}>
                    {colunas.map(col => {
                        const colLeads = filteredLeads.filter(l => l.coluna_id === col.id);
                        return (
                            <DroppableColumn key={col.id} coluna={col} leads={colLeads}>
                                {colLeads.map(lead => (
                                    <DraggableCard
                                        key={lead.id}
                                        lead={lead}
                                        onEdit={(l) => { setEditLead(l); setShowModal(true); }}
                                        onOpen={() => {}}
                                        nav={nav}
                                        onNewOrc={handleNewOrc}
                                        onLinkOrc={handleOpenLinkOrc}
                                    />
                                ))}
                            </DroppableColumn>
                        );
                    })}
                </div>
                <DragOverlay modifiers={[snapCenterToCursor]}>
                    <DragOverlayCard lead={draggedLead} />
                </DragOverlay>
            </DndContext>

            {/* Modal criar/editar lead */}
            {showModal && (
                <LeadModal
                    lead={editLead}
                    colunas={colunas}
                    onSave={saveLead}
                    onDelete={editLead?.id ? () => { deleteLead(editLead.id); setShowModal(false); setEditLead(null); } : null}
                    onClose={() => { setShowModal(false); setEditLead(null); }}
                    onNewOrc={handleNewOrc}
                    onLinkOrc={handleOpenLinkOrc}
                    onUnlinkOrc={handleUnlinkOrc}
                />
            )}

            {/* Modal vincular orçamento existente */}
            {showLinkOrc && (
                <Modal close={() => setShowLinkOrc(null)} title={`Vincular orçamento — ${showLinkOrc.nome}`} w={480}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {orcsDisponiveis.length === 0 ? (
                            <div className="text-sm text-[var(--text-muted)] text-center py-6">
                                Nenhum orçamento disponível para vincular.
                            </div>
                        ) : (
                            orcsDisponiveis.map(o => (
                                <button key={o.id} onClick={() => handleLinkOrc(o.id)}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--bg-muted)] transition-all text-left"
                                >
                                    <FileText size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                                            {o.numero || `#${o.id}`} — {o.cliente_nome || 'Sem cliente'}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-muted)]">
                                            {o.ambiente || 'Sem ambiente'} · R$ {Number(o.valor_venda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <Link2 size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                </button>
                            ))
                        )}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                            <button onClick={() => { setShowLinkOrc(null); handleNewOrc(showLinkOrc); }}
                                className="w-full text-xs px-3 py-2 rounded-lg font-semibold flex items-center justify-center gap-2"
                                style={{ background: 'var(--primary)', color: '#fff' }}
                            >
                                <PlusCircle size={13} /> Criar novo orçamento
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MODAL DE LEAD
// ═══════════════════════════════════════════════════════
function LeadModal({ lead, colunas, onSave, onDelete, onClose, onNewOrc, onLinkOrc, onUnlinkOrc }) {
    const dados = lead?.dados ? (typeof lead.dados === 'string' ? JSON.parse(lead.dados || '{}') : lead.dados) : {};
    const temp = lead ? getTemperatura(lead) : 'frio';
    const tc = TEMP_CONFIG[temp] || TEMP_CONFIG.frio;

    const [form, setForm] = useState({
        nome: lead?.nome || '',
        telefone: lead?.telefone || '',
        email: lead?.email || '',
        cidade: lead?.cidade || '',
        bairro: lead?.bairro || '',
        projeto: lead?.projeto || '',
        origem: lead?.origem || '',
        coluna_id: lead?.coluna_id || colunas[0]?.id || '',
        score: lead?.score || 0,
        proximo_followup_em: lead?.proximo_followup_em?.slice(0, 16) || '',
        motivo_perda: lead?.motivo_perda || '',
        id: lead?.id || null,
    });

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    return (
        <Modal close={onClose} title={lead?.id ? 'Editar Lead' : 'Novo Lead'} w={560}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Painel de inteligência (só para leads existentes com dados da IA) */}
                {lead?.id && lead?.score > 0 && (
                    <div style={{
                        display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10,
                        background: tc.bg, border: `1px solid ${tc.color}22`,
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 52 }}>
                            <span style={{ fontSize: 22 }}><TempIcon temp={temp} /></span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: tc.color }}>{lead.score}</span>
                            <span style={{ fontSize: 8, fontWeight: 600, color: tc.color, textTransform: 'uppercase' }}>{tc.text}</span>
                        </div>
                        <div style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {dados.tipo_imovel && <div><strong>Imóvel:</strong> {dados.tipo_imovel}</div>}
                            {dados.fase_obra && <div><strong>Fase:</strong> {dados.fase_obra}</div>}
                            {dados.num_ambientes && <div><strong>Ambientes:</strong> {dados.num_ambientes}</div>}
                            {dados.urgencia && <div><strong>Urgência:</strong> {dados.urgencia}</div>}
                            {dados.prazo && <div><strong>Prazo:</strong> {dados.prazo}</div>}
                            {dados.indicacao_de && <div><strong>Indicação:</strong> {dados.indicacao_de}</div>}
                            {dados.notas && <div style={{ marginTop: 2, fontStyle: 'italic', color: tc.color }}>Nota: {dados.notas}</div>}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Nome *</label>
                        <input value={form.nome} onChange={e => set('nome', e.target.value)} className={Z.inp} style={{ fontSize: 13 }} placeholder="Nome do lead" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Telefone</label>
                        <input value={form.telefone} onChange={e => set('telefone', e.target.value)} className={Z.inp} style={{ fontSize: 13 }} placeholder="(98) 99999-9999" />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Email</label>
                        <input value={form.email} onChange={e => set('email', e.target.value)} className={Z.inp} style={{ fontSize: 13 }} placeholder="email@exemplo.com" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Origem</label>
                        <select value={form.origem} onChange={e => set('origem', e.target.value)} className={Z.inp} style={{ fontSize: 13 }}>
                            <option value="">Selecionar...</option>
                            <option value="instagram">Instagram</option>
                            <option value="google">Google</option>
                            <option value="indicacao">Indicação</option>
                            <option value="facebook">Facebook</option>
                            <option value="arquiteto">Arquiteto</option>
                            <option value="site">Site</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="outro">Outro</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Cidade</label>
                        <input value={form.cidade} onChange={e => set('cidade', e.target.value)} className={Z.inp} style={{ fontSize: 13 }} placeholder="São Luís" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Bairro</label>
                        <input value={form.bairro} onChange={e => set('bairro', e.target.value)} className={Z.inp} style={{ fontSize: 13 }} placeholder="Renascença" />
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Projeto</label>
                    <input value={form.projeto} onChange={e => set('projeto', e.target.value)} className={Z.inp} style={{ fontSize: 13 }} placeholder="Cozinha, closet, casa completa..." />
                </div>

                {/* Score manual */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Score (0-100)</label>
                        <input type="number" min="0" max="100" value={form.score} onChange={e => set('score', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} className={Z.inp} style={{ fontSize: 13 }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Temperatura</label>
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            {Object.entries(TEMP_CONFIG).map(([key, cfg]) => {
                                const isActive = (() => {
                                    const s = form.score;
                                    if (key === 'muito_quente') return s >= 76;
                                    if (key === 'quente') return s >= 51 && s < 76;
                                    if (key === 'morno') return s >= 26 && s < 51;
                                    return s < 26;
                                })();
                                return (
                                    <button key={key} onClick={() => {
                                        const scores = { frio: 10, morno: 35, quente: 60, muito_quente: 85 };
                                        set('score', scores[key]);
                                    }} title={cfg.text} style={{
                                        flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                                        background: isActive ? cfg.bg : 'var(--bg-muted)',
                                        border: isActive ? `2px solid ${cfg.color}` : '2px solid transparent',
                                        fontWeight: isActive ? 700 : 400,
                                    }}>
                                        <TempIcon temp={key} /> <span style={{ fontSize: 9 }}>{cfg.text}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Coluna</label>
                        <select value={form.coluna_id} onChange={e => set('coluna_id', parseInt(e.target.value))} className={Z.inp} style={{ fontSize: 13 }}>
                            {colunas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Próximo Follow-up</label>
                        <input type="datetime-local" value={form.proximo_followup_em} onChange={e => set('proximo_followup_em', e.target.value)} className={Z.inp} style={{ fontSize: 13 }} />
                    </div>
                </div>

                {lead?.id && (
                    <div>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Motivo da Perda</label>
                        <input value={form.motivo_perda} onChange={e => set('motivo_perda', e.target.value)} className={Z.inp} style={{ fontSize: 13 }} placeholder="Se perdido, por quê?" />
                    </div>
                )}

                {/* Seção orçamento */}
                {lead?.id && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                        <label className="text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-2 block">Orçamento</label>
                        {lead.orc_id ? (
                            <div className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: colorBg('#3b82f6'), border: `1px solid ${colorBorder('#3b82f6')}` }}>
                                <FileText size={16} style={{ color: '#3b82f6', flexShrink: 0 }} />
                                <div className="flex-1">
                                    <div className="text-xs font-semibold text-[var(--text-primary)]">{lead.orc_numero || `#${lead.orc_id}`}</div>
                                    {lead.orc_valor > 0 && <div className="text-[10px] text-[var(--text-muted)]">R$ {Number(lead.orc_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
                                </div>
                                <button onClick={() => onUnlinkOrc?.(lead.id)} className="text-[10px] px-2 py-1 rounded" style={{ color: '#ef4444', background: colorBg('#ef4444') }} title="Desvincular">
                                    <X size={10} className="inline" /> Desvincular
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={() => { onClose(); onNewOrc?.(lead); }} className="flex-1 text-[11px] px-3 py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 border border-[var(--border)] hover:bg-[var(--bg-muted)] transition-colors" style={{ color: 'var(--text-primary)' }}>
                                    <PlusCircle size={12} style={{ color: 'var(--primary)' }} /> Criar orçamento
                                </button>
                                <button onClick={() => { onClose(); onLinkOrc?.(lead); }} className="flex-1 text-[11px] px-3 py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 border border-[var(--border)] hover:bg-[var(--bg-muted)] transition-colors" style={{ color: 'var(--text-primary)' }}>
                                    <Link2 size={12} style={{ color: '#8b5cf6' }} /> Vincular existente
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    {onDelete ? (
                        <button onClick={onDelete} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: colorBg('#ef4444'), color: '#ef4444', border: `1px solid ${colorBorder('#ef4444')}` }}>
                            <Trash2 size={11} className="inline mr-1" style={{ verticalAlign: 'middle' }} />Excluir
                        </button>
                    ) : <div />}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} className="text-xs px-4 py-1.5 rounded-lg border border-[var(--border)]" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
                        <button onClick={() => onSave(form)} className="text-xs px-4 py-1.5 rounded-lg font-semibold" style={{ background: 'var(--primary)', color: '#fff' }}>
                            {lead?.id ? 'Salvar' : 'Criar Lead'}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
