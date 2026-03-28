import { useState, useEffect, useMemo } from 'react';
import {
    Truck, ClipboardCheck, Package, MapPin, Plus, Calendar, Clock,
    CheckCircle2, AlertTriangle, Search, RefreshCw, X, ChevronDown,
    User, Phone, FileText, Wrench, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Modal } from '../ui';

const STATUS_ENTREGA = {
    agendada:    { label: 'Agendada', color: '#3b82f6', icon: Calendar },
    em_transito: { label: 'Em Trânsito', color: '#f59e0b', icon: Truck },
    entregue:    { label: 'Entregue', color: '#22c55e', icon: CheckCircle2 },
    cancelada:   { label: 'Cancelada', color: '#ef4444', icon: X },
};

const STATUS_INSTALACAO = {
    agendada:     { label: 'Agendada', color: '#3b82f6' },
    em_andamento: { label: 'Em Andamento', color: '#f59e0b' },
    concluida:    { label: 'Concluída', color: '#22c55e' },
    cancelada:    { label: 'Cancelada', color: '#ef4444' },
};

const TURNOS = { manha: 'Manhã', tarde: 'Tarde', integral: 'Dia Inteiro' };

function api(url, opts = {}) {
    const token = localStorage.getItem('erp_token');
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(url, { ...opts, headers }).then(r => {
        if (!r.ok) throw new Error(`Erro ${r.status}`);
        return r.json();
    });
}

function Badge({ label, color }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
            borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: `${color}18`, color,
        }}>
            {label}
        </span>
    );
}

function StatCard({ icon: Icon, label, value, color }) {
    return (
        <div style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: '16px 20px',
            border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14,
        }}>
            <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={20} style={{ color }} />
            </div>
            <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
            </div>
        </div>
    );
}

function EntregaCard({ entrega, onUpdate, onDelete }) {
    const st = STATUS_ENTREGA[entrega.status] || STATUS_ENTREGA.agendada;
    const dataFormatada = entrega.data_agendada
        ? new Date(entrega.data_agendada + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
        : 'Sem data';

    const isPassado = entrega.data_agendada && new Date(entrega.data_agendada + 'T23:59:59') < new Date() && entrega.status === 'agendada';

    return (
        <div style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: '16px 20px',
            border: `1px solid ${isPassado ? '#ef444440' : 'var(--border)'}`,
            borderLeft: `4px solid ${st.color}`,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entrega.projeto_nome || `Projeto #${entrega.projeto_id}`}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                        {entrega.cliente_nome || ''}
                    </div>
                </div>
                <Badge label={st.label} color={st.color} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                    <Calendar size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    {dataFormatada}
                    {isPassado && <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 11 }}>ATRASADA</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                    <Clock size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    {TURNOS[entrega.turno] || entrega.turno}
                </div>
                {entrega.motorista && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                        <User size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        {entrega.motorista}
                    </div>
                )}
                {entrega.endereco && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', gridColumn: 'span 2' }}>
                        <MapPin size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entrega.endereco}</span>
                    </div>
                )}
            </div>

            {entrega.obs && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {entrega.obs}
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {entrega.status === 'agendada' && (
                    <button onClick={() => onUpdate(entrega.id, { status: 'em_transito' })} style={btnStyle('#f59e0b')}>
                        <Truck size={13} /> Saiu p/ entrega
                    </button>
                )}
                {entrega.status === 'em_transito' && (
                    <button onClick={() => onUpdate(entrega.id, { status: 'entregue', checkout_hora: new Date().toISOString() })} style={btnStyle('#22c55e')}>
                        <CheckCircle2 size={13} /> Confirmar entrega
                    </button>
                )}
                {entrega.status !== 'entregue' && entrega.status !== 'cancelada' && (
                    <button onClick={() => onUpdate(entrega.id, { status: 'cancelada' })} style={btnStyle('#ef4444')}>
                        <X size={13} /> Cancelar
                    </button>
                )}
            </div>
        </div>
    );
}

const btnStyle = (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '5px 10px', borderRadius: 6, border: 'none',
    background: `${color}15`, color, cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
});

function InstalacaoCard({ inst, onUpdate }) {
    const st = STATUS_INSTALACAO[inst.status] || STATUS_INSTALACAO.agendada;
    const dataFormatada = inst.data_agendada
        ? new Date(inst.data_agendada + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
        : 'Sem data';

    return (
        <div style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: '16px 20px',
            border: '1px solid var(--border)', borderLeft: `4px solid ${st.color}`,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {inst.projeto_nome || `Projeto #${inst.projeto_id}`}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{inst.cliente_nome || ''}</div>
                </div>
                <Badge label={st.label} color={st.color} />
            </div>

            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={14} style={{ color: 'var(--text-muted)' }} /> {dataFormatada}
                </span>
                {inst.montador_nome && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Wrench size={14} style={{ color: 'var(--text-muted)' }} /> {inst.montador_nome}
                    </span>
                )}
                {inst.horas_reais > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={14} style={{ color: 'var(--text-muted)' }} /> {inst.horas_reais}h
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {inst.status === 'agendada' && (
                    <button onClick={() => onUpdate(inst.id, { status: 'em_andamento', data_inicio: new Date().toISOString() })} style={btnStyle('#f59e0b')}>
                        <Wrench size={13} /> Iniciar
                    </button>
                )}
                {inst.status === 'em_andamento' && (
                    <button onClick={() => onUpdate(inst.id, { status: 'concluida', data_fim: new Date().toISOString() })} style={btnStyle('#22c55e')}>
                        <CheckCircle2 size={13} /> Concluir
                    </button>
                )}
            </div>
        </div>
    );
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getWeekDays(baseDate) {
    const d = new Date(baseDate);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day + 1); // Monday
    const days = [];
    for (let i = 0; i < 7; i++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + i);
        days.push(dt);
    }
    return days;
}

function CalendarioSemanal({ entregas, instalacoes, onUpdateEntrega, onUpdateInstalacao }) {
    const [weekOffset, setWeekOffset] = useState(0);

    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + weekOffset * 7);
    const weekDays = getWeekDays(baseDate);

    const fmt = (d) => d.toISOString().split('T')[0];
    const hoje = fmt(new Date());

    const getEventsForDay = (dateStr) => {
        const ent = (entregas || []).filter(e => e.data_agendada === dateStr).map(e => ({ ...e, _tipo: 'entrega' }));
        const inst = (instalacoes || []).filter(i => i.data_agendada === dateStr).map(i => ({ ...i, _tipo: 'instalacao' }));
        return [...ent, ...inst];
    };

    const weekLabel = (() => {
        const s = weekDays[0];
        const e = weekDays[6];
        return `${s.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${e.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    })();

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <button onClick={() => setWeekOffset(w => w - 1)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>
                    <ChevronLeft size={16} /> Anterior
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={16} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{weekLabel}</span>
                    {weekOffset !== 0 && (
                        <button onClick={() => setWeekOffset(0)} style={{
                            padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)',
                            background: 'var(--bg-muted)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        }}>Hoje</button>
                    )}
                </div>
                <button onClick={() => setWeekOffset(w => w + 1)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>
                    Próxima <ChevronRight size={16} />
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, minHeight: 300 }}>
                {weekDays.map((day, idx) => {
                    const dateStr = fmt(day);
                    const isToday = dateStr === hoje;
                    const isWeekend = idx >= 5;
                    const events = getEventsForDay(dateStr);

                    return (
                        <div key={dateStr} style={{
                            background: isToday ? 'var(--primary-alpha)' : isWeekend ? 'var(--bg-muted)' : 'var(--bg-card)',
                            borderRadius: 12, border: isToday ? '2px solid var(--primary)' : '1px solid var(--border)',
                            padding: 10, display: 'flex', flexDirection: 'column', minHeight: 200,
                        }}>
                            <div style={{
                                fontSize: 12, fontWeight: 700, marginBottom: 8, textAlign: 'center',
                                color: isToday ? 'var(--primary)' : 'var(--text-muted)',
                            }}>
                                <div>{DIAS_SEMANA[day.getDay()]}</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: isToday ? 'var(--primary)' : 'var(--text-primary)', lineHeight: 1.2 }}>
                                    {day.getDate()}
                                </div>
                            </div>

                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
                                {events.length === 0 && (
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.5 }}>—</span>
                                    </div>
                                )}
                                {events.map((ev, i) => {
                                    const isEnt = ev._tipo === 'entrega';
                                    const st = isEnt ? (STATUS_ENTREGA[ev.status] || STATUS_ENTREGA.agendada) : (STATUS_INSTALACAO[ev.status] || STATUS_INSTALACAO.agendada);
                                    const isPast = ev.data_agendada && ev.data_agendada < hoje && (ev.status === 'agendada');
                                    return (
                                        <div key={`${ev._tipo}-${ev.id}-${i}`} style={{
                                            padding: '6px 8px', borderRadius: 8, fontSize: 11,
                                            background: `${st.color}12`, borderLeft: `3px solid ${st.color}`,
                                            cursor: 'default',
                                        }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {isEnt ? <Truck size={11} style={{ display: 'inline', marginRight: 3 }} /> : <Wrench size={11} style={{ display: 'inline', marginRight: 3 }} />}
                                                {ev.projeto_nome || `#${ev.projeto_id}`}
                                            </div>
                                            <div style={{ color: st.color, fontWeight: 600, marginTop: 2 }}>
                                                {st.label}
                                                {isPast && <span style={{ color: '#ef4444', marginLeft: 4 }}>!</span>}
                                            </div>
                                            {ev.motorista && <div style={{ color: 'var(--text-muted)', marginTop: 1 }}>{ev.motorista}</div>}
                                            {ev.montador_nome && <div style={{ color: 'var(--text-muted)', marginTop: 1 }}>{ev.montador_nome}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function Expedicao({ notify, user }) {
    const [tab, setTab] = useState('entregas'); // entregas | instalacoes | calendario
    const [entregas, setEntregas] = useState([]);
    const [instalacoes, setInstalacoes] = useState([]);
    const [projetos, setProjetos] = useState([]);
    const [colaboradores, setColaboradores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');
    const [showModal, setShowModal] = useState(null); // 'entrega' | 'instalacao' | null
    const [form, setForm] = useState({});

    const load = async () => {
        try {
            const [ent, inst, projs] = await Promise.all([
                api('/api/gestao/entregas'),
                api('/api/gestao/instalacoes'),
                api('/api/producao-av/painel').then(d => d.projetos || []).catch(() => []),
            ]);
            setEntregas(ent);
            setInstalacoes(inst);

            // Also get all projects for the dropdown
            try {
                const allProjs = await api('/api/producao');
                setProjetos(Array.isArray(allProjs) ? allProjs : []);
            } catch { setProjetos([]); }

            try {
                const cols = await api('/api/gestao/colaboradores');
                setColaboradores(Array.isArray(cols) ? cols : []);
            } catch {
                setColaboradores([]);
            }
        } catch (err) {
            console.error('Erro ao carregar expedição:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleUpdateEntrega = async (id, data) => {
        try {
            await api(`/api/gestao/entregas/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            notify?.('Entrega atualizada', 'success');
            load();
        } catch { notify?.('Erro ao atualizar entrega', 'error'); }
    };

    const handleUpdateInstalacao = async (id, data) => {
        try {
            await api(`/api/gestao/instalacoes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
            notify?.('Instalação atualizada', 'success');
            load();
        } catch { notify?.('Erro ao atualizar instalação', 'error'); }
    };

    const handleCreateEntrega = async () => {
        if (!form.projeto_id || !form.data_agendada) {
            notify?.('Selecione o projeto e a data', 'error');
            return;
        }
        try {
            await api('/api/gestao/entregas', { method: 'POST', body: JSON.stringify(form) });
            notify?.('Entrega agendada', 'success');
            setShowModal(null);
            setForm({});
            load();
        } catch { notify?.('Erro ao criar entrega', 'error'); }
    };

    const handleCreateInstalacao = async () => {
        if (!form.projeto_id || !form.data_agendada) {
            notify?.('Selecione o projeto e a data', 'error');
            return;
        }
        try {
            await api('/api/gestao/instalacoes', { method: 'POST', body: JSON.stringify(form) });
            notify?.('Instalação agendada', 'success');
            setShowModal(null);
            setForm({});
            load();
        } catch { notify?.('Erro ao criar instalação', 'error'); }
    };

    // Stats
    const entregasAgendadas = entregas.filter(e => e.status === 'agendada').length;
    const entregasTransito = entregas.filter(e => e.status === 'em_transito').length;
    const entregasConcluidas = entregas.filter(e => e.status === 'entregue').length;
    const instPendentes = instalacoes.filter(i => i.status === 'agendada' || i.status === 'em_andamento').length;

    // Filtered lists
    const filteredEntregas = useMemo(() => {
        let list = entregas;
        if (busca) {
            const q = busca.toLowerCase();
            list = list.filter(e => (e.projeto_nome || '').toLowerCase().includes(q) || (e.cliente_nome || '').toLowerCase().includes(q) || (e.motorista || '').toLowerCase().includes(q));
        }
        if (filtroStatus) list = list.filter(e => e.status === filtroStatus);
        return list;
    }, [entregas, busca, filtroStatus]);

    const filteredInstalacoes = useMemo(() => {
        let list = instalacoes;
        if (busca) {
            const q = busca.toLowerCase();
            list = list.filter(i => (i.projeto_nome || '').toLowerCase().includes(q) || (i.cliente_nome || '').toLowerCase().includes(q));
        }
        if (filtroStatus) list = list.filter(i => i.status === filtroStatus);
        return list;
    }, [instalacoes, busca, filtroStatus]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, color: 'var(--text-muted)' }}>
                <RefreshCw size={20} className="spin" /> Carregando...
            </div>
        );
    }

    return (
        <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: 'linear-gradient(135deg, #22c55e, #15803d)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Truck size={22} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Expedição</h1>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Entregas, instalações e rastreamento</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => { setShowModal(tab === 'instalacoes' ? 'instalacao' : 'entrega'); setForm({}); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                            borderRadius: 8, border: 'none', background: 'var(--primary)',
                            color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}
                    >
                        <Plus size={16} /> {tab === 'instalacoes' ? 'Nova Instalação' : 'Nova Entrega'}
                    </button>
                    <button
                        onClick={load}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                <StatCard icon={Calendar} label="Agendadas" value={entregasAgendadas} color="#3b82f6" />
                <StatCard icon={Truck} label="Em Trânsito" value={entregasTransito} color="#f59e0b" />
                <StatCard icon={CheckCircle2} label="Entregues" value={entregasConcluidas} color="#22c55e" />
                <StatCard icon={Wrench} label="Instalações Pendentes" value={instPendentes} color="#8b5cf6" />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 1 }}>
                {[
                    { id: 'entregas', label: 'Entregas', icon: Truck, count: entregas.length },
                    { id: 'instalacoes', label: 'Instalações', icon: Wrench, count: instalacoes.length },
                    { id: 'calendario', label: 'Calendário', icon: Calendar, count: entregas.length + instalacoes.length },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => { setTab(t.id); setFiltroStatus(''); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                            border: 'none', borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                            background: 'transparent', color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                            cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: 'all 0.2s',
                        }}
                    >
                        <t.icon size={16} />
                        {t.label}
                        <span style={{
                            fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                            background: tab === t.id ? 'var(--primary-light)' : 'var(--bg-muted)',
                            color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                        }}>
                            {t.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: tab === 'calendario' ? 'none' : 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar projeto, cliente ou motorista..."
                        style={{
                            width: '100%', padding: '9px 12px 9px 36px', borderRadius: 8,
                            border: '1px solid var(--border)', background: 'var(--bg-input)',
                            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                        }}
                    />
                </div>
                <select
                    value={filtroStatus}
                    onChange={e => setFiltroStatus(e.target.value)}
                    style={{
                        padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                    }}
                >
                    <option value="">Todos os status</option>
                    {Object.entries(tab === 'entregas' ? STATUS_ENTREGA : STATUS_INSTALACAO).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                    ))}
                </select>
            </div>

            {/* Content */}
            {tab === 'calendario' ? (
                <CalendarioSemanal
                    entregas={entregas}
                    instalacoes={instalacoes}
                    onUpdateEntrega={handleUpdateEntrega}
                    onUpdateInstalacao={handleUpdateInstalacao}
                />
            ) : tab === 'entregas' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                    {filteredEntregas.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: 48, color: 'var(--text-muted)', gridColumn: '1 / -1',
                            background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)',
                        }}>
                            <Truck size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
                            <div style={{ fontSize: 15, fontWeight: 600 }}>Nenhuma entrega encontrada</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>Clique em "Nova Entrega" para agendar</div>
                        </div>
                    ) : (
                        filteredEntregas.map(e => (
                            <EntregaCard key={e.id} entrega={e} onUpdate={handleUpdateEntrega} />
                        ))
                    )}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                    {filteredInstalacoes.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: 48, color: 'var(--text-muted)', gridColumn: '1 / -1',
                            background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)',
                        }}>
                            <Wrench size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
                            <div style={{ fontSize: 15, fontWeight: 600 }}>Nenhuma instalação encontrada</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>Clique em "Nova Instalação" para agendar</div>
                        </div>
                    ) : (
                        filteredInstalacoes.map(i => (
                            <InstalacaoCard key={i.id} inst={i} onUpdate={handleUpdateInstalacao} />
                        ))
                    )}
                </div>
            )}

            {/* Modal Nova Entrega */}
            {showModal === 'entrega' && (
                <Modal title="Nova Entrega" close={() => setShowModal(null)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Projeto *</label>
                            <select
                                value={form.projeto_id || ''}
                                onChange={e => setForm(f => ({ ...f, projeto_id: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                            >
                                <option value="">Selecione...</option>
                                {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Data *</label>
                                <input
                                    type="date"
                                    value={form.data_agendada || ''}
                                    onChange={e => setForm(f => ({ ...f, data_agendada: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Turno</label>
                                <select
                                    value={form.turno || 'manha'}
                                    onChange={e => setForm(f => ({ ...f, turno: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                                >
                                    {Object.entries(TURNOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Endereço</label>
                            <input
                                value={form.endereco || ''}
                                onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                                placeholder="Endereço de entrega"
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Motorista</label>
                                <input
                                    value={form.motorista || ''}
                                    onChange={e => setForm(f => ({ ...f, motorista: e.target.value }))}
                                    placeholder="Nome do motorista"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Veículo</label>
                                <input
                                    value={form.veiculo || ''}
                                    onChange={e => setForm(f => ({ ...f, veiculo: e.target.value }))}
                                    placeholder="Placa / descrição"
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Observações</label>
                            <textarea
                                value={form.obs || ''}
                                onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                                rows={2}
                                placeholder="Observações sobre a entrega..."
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn-ghost" onClick={() => setShowModal(null)}>Cancelar</button>
                            <button className="btn-primary" onClick={handleCreateEntrega}>Agendar Entrega</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Nova Instalação */}
            {showModal === 'instalacao' && (
                <Modal title="Nova Instalação" close={() => setShowModal(null)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Projeto *</label>
                            <select
                                value={form.projeto_id || ''}
                                onChange={e => setForm(f => ({ ...f, projeto_id: Number(e.target.value) }))}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                            >
                                <option value="">Selecione...</option>
                                {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Data *</label>
                            <input
                                type="date"
                                value={form.data_agendada || ''}
                                onChange={e => setForm(f => ({ ...f, data_agendada: e.target.value }))}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Observações</label>
                            <textarea
                                value={form.obs || ''}
                                onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                                rows={2}
                                placeholder="Observações..."
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical' }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn-ghost" onClick={() => setShowModal(null)}>Cancelar</button>
                            <button className="btn-primary" onClick={handleCreateInstalacao}>Agendar Instalação</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
