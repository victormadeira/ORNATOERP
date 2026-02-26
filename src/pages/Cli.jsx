import { useState, useEffect, useCallback } from 'react';
import { Z, Ic, Modal } from '../ui';
import api from '../api';
import {
    User, Phone, Mail, MapPin, Building2, Calendar, FileText, MessageCircle,
    TrendingUp, DollarSign, Target, Clock, ChevronRight, ArrowLeft,
    Pin, PinOff, Briefcase, Eye, BarChart3, Sparkles, Plus, Edit, Trash2,
    Star, Hash, Send, ExternalLink
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────
const N = (v) => Number(v || 0);
const R$ = (v) => N(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dtFmt = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};
const dtFmtFull = (s) => {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};
const timeSince = (s) => {
    if (!s) return '';
    const d = new Date(s);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'agora mesmo';
    if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d atrás`;
    return dtFmt(s);
};

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function maskCPF(v) { return v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'); }
function maskCNPJ(v) { return v.replace(/\D/g,'').slice(0,14).replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2'); }
function maskCEP(v) { return v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d{1,3})$/,'$1-$2'); }
function maskTel(v) {
    const d = v.replace(/\D/g,'').slice(0,11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3');
}

const EMPTY = {
    nome: '', tel: '', email: '', arq: '', cidade: '',
    tipo_pessoa: 'fisica', cpf: '', cnpj: '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '', estado: '', obs: '',
    origem: 'manual', indicado_por: '', data_nascimento: ''
};

const KB_LABELS = {
    lead: 'Lead', orc: 'Orçamento', env: 'Enviado', neg: 'Negociação',
    ok: 'Aprovado', prod: 'Produção', mont: 'Montagem',
    arq: 'Arquivo', perdido: 'Perdido'
};
const KB_COLORS = {
    lead: '#94a3b8', orc: '#3b82f6', env: '#8b5cf6', neg: '#f59e0b',
    ok: '#22c55e', prod: '#06b6d4', mont: '#ec4899',
    arq: '#64748b', perdido: '#ef4444'
};

const TIMELINE_ICONS = {
    orcamento: { icon: <FileText size={14} />, color: '#3b82f6', label: 'Orçamento' },
    projeto: { icon: <Briefcase size={14} />, color: '#8b5cf6', label: 'Projeto' },
    nota: { icon: <Edit size={14} />, color: '#f59e0b', label: 'Nota' },
    whatsapp: { icon: <MessageCircle size={14} />, color: '#22c55e', label: 'WhatsApp' },
    followup: { icon: <Sparkles size={14} />, color: '#ec4899', label: 'Follow-up' },
    ligacao: { icon: <Phone size={14} />, color: '#06b6d4', label: 'Ligação' },
    reuniao: { icon: <Calendar size={14} />, color: '#f97316', label: 'Reunião' },
    visita: { icon: <MapPin size={14} />, color: '#14b8a6', label: 'Visita' },
    email: { icon: <Mail size={14} />, color: '#6366f1', label: 'E-mail' },
};

const ORIGENS = {
    manual: 'Cadastro Manual',
    landing_page: 'Landing Page',
    facebook: 'Facebook',
    instagram: 'Instagram',
    indicacao: 'Indicação',
    whatsapp: 'WhatsApp',
};

const NOTE_COLORS = [
    '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#64748b'
];

// ─── Metric Card ─────────────────────────────────
function MetricCard({ icon, label, value, sub, color }) {
    return (
        <div className="glass-card p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${color}15`, color }}>
                {icon}
            </div>
            <div className="min-w-0">
                <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
                {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
            </div>
        </div>
    );
}

// ─── Client Detail Page ──────────────────────────
function ClienteDetalhe({ clienteId, onBack, notify, nav }) {
    const [cli, setCli] = useState(null);
    const [timeline, setTimeline] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('resumo');
    const [showNotaModal, setShowNotaModal] = useState(false);
    const [editNota, setEditNota] = useState(null);
    const [notaForm, setNotaForm] = useState({ titulo: '', conteudo: '', cor: '#3b82f6' });
    const [showInterModal, setShowInterModal] = useState(false);
    const [interForm, setInterForm] = useState({ tipo: 'ligacao', descricao: '', data: '' });
    const [tlFilter, setTlFilter] = useState('todos');

    const loadCliente = useCallback(async () => {
        try {
            const data = await api.get(`/clientes/${clienteId}`);
            setCli(data);
        } catch { notify('Erro ao carregar cliente'); }
    }, [clienteId]);

    const loadTimeline = useCallback(async () => {
        try {
            const data = await api.get(`/clientes/${clienteId}/timeline`);
            setTimeline(data);
        } catch { /* silently fail */ }
    }, [clienteId]);

    useEffect(() => {
        setLoading(true);
        Promise.all([loadCliente(), loadTimeline()]).finally(() => setLoading(false));
    }, [loadCliente, loadTimeline]);

    // ── Notes CRUD ──
    const salvarNota = async () => {
        if (!notaForm.conteudo.trim()) { notify('Conteúdo obrigatório'); return; }
        try {
            if (editNota) {
                await api.put(`/clientes/${clienteId}/notas/${editNota.id}`, notaForm);
            } else {
                await api.post(`/clientes/${clienteId}/notas`, notaForm);
            }
            notify(editNota ? 'Nota atualizada!' : 'Nota criada!');
            setShowNotaModal(false);
            setEditNota(null);
            setNotaForm({ titulo: '', conteudo: '', cor: '#3b82f6' });
            loadCliente();
            loadTimeline();
        } catch { notify('Erro ao salvar nota'); }
    };

    const deletarNota = async (notaId) => {
        try {
            await api.del(`/clientes/${clienteId}/notas/${notaId}`);
            notify('Nota removida');
            loadCliente();
            loadTimeline();
        } catch { notify('Erro ao remover nota'); }
    };

    const toggleFixarNota = async (nota) => {
        try {
            await api.put(`/clientes/${clienteId}/notas/${nota.id}`, { ...nota, fixado: nota.fixado ? 0 : 1 });
            loadCliente();
        } catch { notify('Erro ao fixar nota'); }
    };

    // ── Interactions ──
    const salvarInteracao = async () => {
        if (!interForm.descricao.trim()) { notify('Descrição obrigatória'); return; }
        try {
            await api.post(`/clientes/${clienteId}/interacoes`, interForm);
            notify('Interação registrada!');
            setShowInterModal(false);
            setInterForm({ tipo: 'ligacao', descricao: '', data: '' });
            loadTimeline();
        } catch { notify('Erro ao registrar interação'); }
    };

    if (loading) return (
        <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        </div>
    );

    if (!cli) return (
        <div className="text-center py-24" style={{ color: 'var(--text-muted)' }}>
            <p>Cliente não encontrado</p>
            <button onClick={onBack} className={`${Z.btn} mt-4`}>Voltar</button>
        </div>
    );

    const m = cli.metricas || {};
    const orcs = cli.orcamentos || [];
    const projs = cli.projetos || [];
    const notas = cli.notas || [];
    const conversas = cli.conversas_wa || [];
    const followups = cli.followups || [];

    const filteredTimeline = tlFilter === 'todos'
        ? timeline
        : timeline.filter(e => e.tipo === tlFilter);

    const TABS = [
        { id: 'resumo', label: 'Resumo', icon: <BarChart3 size={14} /> },
        { id: 'timeline', label: 'Timeline', icon: <Clock size={14} /> },
        { id: 'notas', label: 'Notas', icon: <Edit size={14} />, count: notas.length },
        { id: 'orcamentos', label: 'Orçamentos', icon: <FileText size={14} />, count: orcs.length },
        { id: 'projetos', label: 'Projetos', icon: <Briefcase size={14} />, count: projs.length },
    ];

    return (
        <div>
            {/* Back Button + Header */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={onBack} className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}>
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{cli.nome}</h1>
                        {cli.tipo_pessoa === 'juridica' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                style={{ background: '#8b5cf615', color: '#8b5cf6', border: '1px solid #8b5cf630' }}>
                                PJ
                            </span>
                        )}
                        {cli.origem && cli.origem !== 'manual' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                style={{ background: '#06b6d415', color: '#06b6d4', border: '1px solid #06b6d430' }}>
                                {ORIGENS[cli.origem] || cli.origem}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                        {cli.tel && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <Phone size={11} /> {cli.tel}
                            </span>
                        )}
                        {cli.email && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <Mail size={11} /> {cli.email}
                            </span>
                        )}
                        {(cli.cidade || cli.estado) && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <MapPin size={11} /> {[cli.cidade, cli.estado].filter(Boolean).join(', ')}
                            </span>
                        )}
                        {cli.arq && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <User size={11} /> Arq: {cli.arq}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <MetricCard
                    icon={<DollarSign size={20} />}
                    label="Total Faturado"
                    value={R$(m.total_faturado)}
                    sub={`${m.total_recebido ? 'Recebido: ' + R$(m.total_recebido) : ''}`}
                    color="#22c55e"
                />
                <MetricCard
                    icon={<FileText size={20} />}
                    label="Orçamentos"
                    value={m.total_orcamentos || 0}
                    sub={`${m.orcamentos_aprovados || 0} aprovados`}
                    color="#3b82f6"
                />
                <MetricCard
                    icon={<Target size={20} />}
                    label="Taxa Conversão"
                    value={`${m.taxa_conversao || 0}%`}
                    sub={m.total_orcamentos > 0 ? `${m.orcamentos_aprovados}/${m.total_orcamentos}` : 'Sem dados'}
                    color="#8b5cf6"
                />
                <MetricCard
                    icon={<Briefcase size={20} />}
                    label="Projetos"
                    value={m.total_projetos || 0}
                    sub={projs.filter(p => p.status === 'em_andamento').length > 0
                        ? `${projs.filter(p => p.status === 'em_andamento').length} em andamento`
                        : 'Nenhum ativo'
                    }
                    color="#f59e0b"
                />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-5 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--bg-muted)' }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${tab === t.id ? 'text-white' : 'hover:bg-[var(--bg-hover)]'}`}
                        style={tab === t.id ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-secondary)' }}>
                        {t.icon} {t.label}
                        {t.count !== undefined && t.count > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ background: tab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-hover)', color: tab === t.id ? '#fff' : 'var(--text-muted)' }}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ═══ Tab: Resumo ═══ */}
            {tab === 'resumo' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Col 1+2: Info + Recent activity */}
                    <div className="lg:col-span-2 space-y-5">
                        {/* Client Info Card */}
                        <div className="glass-card p-5">
                            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Informações</h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                {cli.tipo_pessoa === 'juridica' && cli.cnpj && (
                                    <div><span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>CNPJ</span><p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{cli.cnpj}</p></div>
                                )}
                                {cli.tipo_pessoa !== 'juridica' && cli.cpf && (
                                    <div><span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>CPF</span><p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{cli.cpf}</p></div>
                                )}
                                {cli.data_nascimento && (
                                    <div><span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Data Nascimento</span><p className="mt-0.5" style={{ color: 'var(--text-primary)' }}>{dtFmtFull(cli.data_nascimento)}</p></div>
                                )}
                                {(cli.endereco || cli.cep) && (
                                    <div className="col-span-2">
                                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Endereço</span>
                                        <p className="mt-0.5" style={{ color: 'var(--text-primary)' }}>
                                            {[cli.endereco, cli.numero && `nº ${cli.numero}`, cli.complemento].filter(Boolean).join(', ')}
                                            {cli.bairro && <><br />{cli.bairro}</>}
                                            {(cli.cidade || cli.estado) && <><br />{[cli.cidade, cli.estado].filter(Boolean).join(' - ')}</>}
                                            {cli.cep && <><br />CEP: {cli.cep}</>}
                                        </p>
                                    </div>
                                )}
                                {cli.indicado_por && (
                                    <div><span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Indicado por</span><p className="mt-0.5" style={{ color: 'var(--text-primary)' }}>{cli.indicado_por}</p></div>
                                )}
                                {cli.obs && (
                                    <div className="col-span-2">
                                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Observações</span>
                                        <p className="mt-0.5 text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{cli.obs}</p>
                                    </div>
                                )}
                                <div><span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Cadastrado em</span><p className="mt-0.5" style={{ color: 'var(--text-primary)' }}>{dtFmtFull(cli.criado_em)}</p></div>
                                {cli.criado_por && (
                                    <div><span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Cadastrado por</span><p className="mt-0.5" style={{ color: 'var(--text-primary)' }}>{cli.criado_por}</p></div>
                                )}
                            </div>
                        </div>

                        {/* Recent Orçamentos */}
                        {orcs.length > 0 && (
                            <div className="glass-card p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Últimos Orçamentos</h3>
                                    {orcs.length > 3 && (
                                        <button onClick={() => setTab('orcamentos')} className="text-xs font-medium flex items-center gap-1 cursor-pointer"
                                            style={{ color: 'var(--primary)' }}>
                                            Ver todos <ChevronRight size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {orcs.slice(0, 3).map(o => (
                                        <div key={o.id} className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-[var(--bg-muted)]"
                                            style={{ border: '1px solid var(--border)' }}>
                                            <div className="w-2 h-8 rounded-full shrink-0" style={{ background: KB_COLORS[o.kb_col] || '#94a3b8' }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                        {o.numero || `#${o.id}`}
                                                    </span>
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                                        style={{ background: `${KB_COLORS[o.kb_col] || '#94a3b8'}15`, color: KB_COLORS[o.kb_col] || '#94a3b8', border: `1px solid ${KB_COLORS[o.kb_col] || '#94a3b8'}30` }}>
                                                        {KB_LABELS[o.kb_col] || o.kb_col}
                                                    </span>
                                                    {o.tipo === 'aditivo' && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                                            style={{ background: '#f59e0b15', color: '#f59e0b', border: '1px solid #f59e0b30' }}>
                                                            Aditivo
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                    {o.ambiente || 'Sem ambiente'} · {dtFmt(o.criado_em)}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                                    {R$(o.valor_venda)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recent Projetos */}
                        {projs.length > 0 && (
                            <div className="glass-card p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Projetos</h3>
                                    {projs.length > 3 && (
                                        <button onClick={() => setTab('projetos')} className="text-xs font-medium flex items-center gap-1 cursor-pointer"
                                            style={{ color: 'var(--primary)' }}>
                                            Ver todos <ChevronRight size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {projs.slice(0, 3).map(p => {
                                        const statusMap = {
                                            nao_iniciado: { label: 'Não iniciado', color: '#94a3b8' },
                                            em_andamento: { label: 'Em andamento', color: '#1379F0' },
                                            atrasado: { label: 'Atrasado', color: '#ef4444' },
                                            concluido: { label: 'Concluído', color: '#22c55e' },
                                            suspenso: { label: 'Suspenso', color: '#f59e0b' },
                                        };
                                        const st = statusMap[p.status] || { label: p.status, color: '#94a3b8' };
                                        return (
                                            <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-[var(--bg-muted)]"
                                                style={{ border: '1px solid var(--border)' }}>
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                                    style={{ background: `${st.color}15`, color: st.color }}>
                                                    <Briefcase size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{p.nome}</span>
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                                            style={{ background: `${st.color}15`, color: st.color, border: `1px solid ${st.color}30` }}>
                                                            {st.label}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                        {p.orc_numero && `Orc: ${p.orc_numero} · `}{dtFmt(p.data_inicio)} → {dtFmt(p.data_vencimento)}
                                                    </p>
                                                </div>
                                                {p.valor_venda > 0 && (
                                                    <div className="text-sm font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>{R$(p.valor_venda)}</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Col 3: Sidebar — Pinned Notes + WhatsApp + Follow-ups */}
                    <div className="space-y-5">
                        {/* Pinned Notes */}
                        {notas.filter(n => n.fixado).length > 0 && (
                            <div className="glass-card p-4">
                                <h4 className="text-xs font-bold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                                    <Pin size={12} /> NOTAS FIXADAS
                                </h4>
                                <div className="space-y-2">
                                    {notas.filter(n => n.fixado).map(n => (
                                        <div key={n.id} className="p-3 rounded-lg text-sm" style={{ background: `${n.cor || '#3b82f6'}10`, borderLeft: `3px solid ${n.cor || '#3b82f6'}` }}>
                                            {n.titulo && <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{n.titulo}</div>}
                                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                                {n.conteudo.length > 120 ? n.conteudo.slice(0, 120) + '...' : n.conteudo}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* WhatsApp Conversations */}
                        {conversas.length > 0 && (
                            <div className="glass-card p-4">
                                <h4 className="text-xs font-bold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                                    <MessageCircle size={12} /> CONVERSAS WHATSAPP
                                </h4>
                                <div className="space-y-2">
                                    {conversas.map(c => (
                                        <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--bg-muted)] transition-colors"
                                            style={{ border: '1px solid var(--border)' }}>
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                                                style={{ background: '#22c55e15', color: '#22c55e' }}>
                                                <MessageCircle size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                                    {c.wa_name || c.wa_phone}
                                                </div>
                                                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                    {timeSince(c.ultimo_msg_em)}
                                                </div>
                                            </div>
                                            {c.nao_lidas > 0 && (
                                                <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full" style={{ background: '#22c55e' }}>
                                                    {c.nao_lidas}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Follow-ups */}
                        {followups.length > 0 && (
                            <div className="glass-card p-4">
                                <h4 className="text-xs font-bold mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                                    <Sparkles size={12} /> FOLLOW-UPS IA
                                </h4>
                                <div className="space-y-2">
                                    {followups.slice(0, 5).map(f => (
                                        <div key={f.id} className="p-2 rounded-lg text-xs" style={{ background: 'var(--bg-muted)' }}>
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{f.tipo}</span>
                                                {f.orc_numero && <span style={{ color: 'var(--text-muted)' }}>· Orc {f.orc_numero}</span>}
                                            </div>
                                            <p style={{ color: 'var(--text-secondary)' }}>
                                                {(f.mensagem || '').length > 80 ? (f.mensagem || '').slice(0, 80) + '...' : f.mensagem}
                                            </p>
                                            <div className="mt-1" style={{ color: 'var(--text-muted)' }}>{timeSince(f.criado_em)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quick Actions */}
                        <div className="glass-card p-4">
                            <h4 className="text-xs font-bold mb-3" style={{ color: 'var(--text-muted)' }}>AÇÕES RÁPIDAS</h4>
                            <div className="space-y-2">
                                <button onClick={() => { setNotaForm({ titulo: '', conteudo: '', cor: '#3b82f6' }); setEditNota(null); setShowNotaModal(true); }}
                                    className="w-full flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-muted)] cursor-pointer"
                                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                    <Plus size={14} /> Adicionar Nota
                                </button>
                                <button onClick={() => { setInterForm({ tipo: 'ligacao', descricao: '', data: '' }); setShowInterModal(true); }}
                                    className="w-full flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-muted)] cursor-pointer"
                                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                    <Phone size={14} /> Registrar Interação
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Tab: Timeline ═══ */}
            {tab === 'timeline' && (
                <div>
                    {/* Filters + Actions */}
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <div className="flex gap-1 flex-wrap">
                            {[
                                { id: 'todos', label: 'Todos' },
                                { id: 'orcamento', label: 'Orçamentos' },
                                { id: 'projeto', label: 'Projetos' },
                                { id: 'nota', label: 'Notas' },
                                { id: 'whatsapp', label: 'WhatsApp' },
                                { id: 'followup', label: 'Follow-ups' },
                            ].map(f => (
                                <button key={f.id} onClick={() => setTlFilter(f.id)}
                                    className="px-3 py-1.5 text-[11px] font-semibold rounded-full transition-colors cursor-pointer"
                                    style={tlFilter === f.id
                                        ? { background: 'var(--primary)', color: '#fff' }
                                        : { background: 'var(--bg-muted)', color: 'var(--text-secondary)' }
                                    }>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { setInterForm({ tipo: 'ligacao', descricao: '', data: '' }); setShowInterModal(true); }}
                                className={Z.btn2} style={{ fontSize: 12 }}>
                                <Plus size={12} /> Interação
                            </button>
                            <button onClick={() => { setNotaForm({ titulo: '', conteudo: '', cor: '#3b82f6' }); setEditNota(null); setShowNotaModal(true); }}
                                className={Z.btn} style={{ fontSize: 12 }}>
                                <Plus size={12} /> Nota
                            </button>
                        </div>
                    </div>

                    {/* Timeline */}
                    {filteredTimeline.length === 0 ? (
                        <div className="glass-card p-12 text-center" style={{ color: 'var(--text-muted)' }}>
                            <Clock size={32} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm">Nenhum evento na timeline</p>
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Vertical line */}
                            <div className="absolute left-[19px] top-0 bottom-0 w-px" style={{ background: 'var(--border)' }} />

                            <div className="space-y-1">
                                {filteredTimeline.map((ev, idx) => {
                                    const cfg = TIMELINE_ICONS[ev.tipo] || { icon: <Hash size={14} />, color: '#94a3b8', label: ev.tipo };
                                    return (
                                        <div key={idx} className="relative flex gap-3 py-3 pl-1">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10"
                                                style={{ background: `${cfg.color}15`, color: cfg.color, border: `2px solid ${cfg.color}30` }}>
                                                {cfg.icon}
                                            </div>
                                            <div className="flex-1 min-w-0 glass-card p-3" style={{ border: '1px solid var(--border)' }}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                                                style={{ background: `${cfg.color}15`, color: cfg.color }}>
                                                                {cfg.label}
                                                            </span>
                                                            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                                {ev.titulo}
                                                            </span>
                                                        </div>
                                                        {ev.descricao && (
                                                            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                                                {ev.descricao}
                                                            </p>
                                                        )}
                                                        {ev.autor && (
                                                            <span className="text-[10px] mt-1 inline-block" style={{ color: 'var(--text-muted)' }}>
                                                                por {ev.autor}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        {ev.valor > 0 && (
                                                            <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>
                                                                {R$(ev.valor)}
                                                            </div>
                                                        )}
                                                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                            {timeSince(ev.data)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Tab: Notas ═══ */}
            {tab === 'notas' && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                            {notas.length} {notas.length === 1 ? 'nota' : 'notas'}
                        </h3>
                        <button onClick={() => { setNotaForm({ titulo: '', conteudo: '', cor: '#3b82f6' }); setEditNota(null); setShowNotaModal(true); }}
                            className={Z.btn} style={{ fontSize: 12 }}>
                            <Plus size={12} /> Nova Nota
                        </button>
                    </div>

                    {notas.length === 0 ? (
                        <div className="glass-card p-12 text-center" style={{ color: 'var(--text-muted)' }}>
                            <Edit size={32} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm">Nenhuma nota registrada</p>
                            <button onClick={() => { setNotaForm({ titulo: '', conteudo: '', cor: '#3b82f6' }); setEditNota(null); setShowNotaModal(true); }}
                                className={`${Z.btn2} mt-3`} style={{ fontSize: 12 }}>
                                Criar primeira nota
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {notas.map(n => (
                                <div key={n.id} className="glass-card p-4 relative group"
                                    style={{ borderTop: `3px solid ${n.cor || '#3b82f6'}` }}>
                                    {/* Pin + Actions */}
                                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => toggleFixarNota(n)}
                                            className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                                            style={{ color: n.fixado ? '#f59e0b' : 'var(--text-muted)' }} title={n.fixado ? 'Desafixar' : 'Fixar'}>
                                            {n.fixado ? <PinOff size={12} /> : <Pin size={12} />}
                                        </button>
                                        <button onClick={() => { setEditNota(n); setNotaForm({ titulo: n.titulo, conteudo: n.conteudo, cor: n.cor }); setShowNotaModal(true); }}
                                            className="p-1 rounded hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                                            style={{ color: 'var(--text-muted)' }} title="Editar">
                                            <Edit size={12} />
                                        </button>
                                        <button onClick={() => deletarNota(n.id)}
                                            className="p-1 rounded hover:bg-red-500/10 cursor-pointer transition-colors"
                                            style={{ color: '#ef4444' }} title="Excluir">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>

                                    {n.fixado && (
                                        <Pin size={10} className="absolute top-3 left-3" style={{ color: '#f59e0b' }} />
                                    )}

                                    {n.titulo && (
                                        <h4 className="text-sm font-bold mb-2 pr-16" style={{ color: 'var(--text-primary)' }}>{n.titulo}</h4>
                                    )}
                                    <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                                        {n.conteudo}
                                    </p>
                                    <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                            {n.autor_nome || 'Sistema'} · {timeSince(n.criado_em)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Tab: Orçamentos ═══ */}
            {tab === 'orcamentos' && (
                <div>
                    <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                        {orcs.length} {orcs.length === 1 ? 'orçamento' : 'orçamentos'}
                    </h3>
                    {orcs.length === 0 ? (
                        <div className="glass-card p-12 text-center" style={{ color: 'var(--text-muted)' }}>
                            <FileText size={32} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm">Nenhum orçamento vinculado</p>
                        </div>
                    ) : (
                        <div className="glass-card !p-0 overflow-hidden">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr>
                                        {['Número', 'Ambiente', 'Status', 'Tipo', 'Valor', 'Data'].map(h => (
                                            <th key={h} className={Z.th}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {orcs.map(o => (
                                        <tr key={o.id} className="hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
                                            onClick={() => nav && nav('novo', { id: o.id })}>
                                            <td className="td-glass">
                                                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                    {o.numero || `#${o.id}`}
                                                </span>
                                            </td>
                                            <td className="td-glass text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                {o.ambiente || '—'}
                                            </td>
                                            <td className="td-glass">
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                                    style={{ background: `${KB_COLORS[o.kb_col] || '#94a3b8'}15`, color: KB_COLORS[o.kb_col] || '#94a3b8', border: `1px solid ${KB_COLORS[o.kb_col] || '#94a3b8'}30` }}>
                                                    {KB_LABELS[o.kb_col] || o.kb_col}
                                                </span>
                                            </td>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>
                                                {o.tipo === 'aditivo' ? 'Aditivo' : 'Original'}
                                            </td>
                                            <td className="td-glass text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                {R$(o.valor_venda)}
                                            </td>
                                            <td className="td-glass text-xs" style={{ color: 'var(--text-muted)' }}>
                                                {dtFmt(o.criado_em)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Tab: Projetos ═══ */}
            {tab === 'projetos' && (
                <div>
                    <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                        {projs.length} {projs.length === 1 ? 'projeto' : 'projetos'}
                    </h3>
                    {projs.length === 0 ? (
                        <div className="glass-card p-12 text-center" style={{ color: 'var(--text-muted)' }}>
                            <Briefcase size={32} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm">Nenhum projeto vinculado</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {projs.map(p => {
                                const statusMap = {
                                    nao_iniciado: { label: 'Não iniciado', color: '#94a3b8', bg: '#f1f5f9' },
                                    em_andamento: { label: 'Em andamento', color: '#1379F0', bg: '#eff6ff' },
                                    atrasado: { label: 'Atrasado', color: '#ef4444', bg: '#fef2f2' },
                                    concluido: { label: 'Concluído', color: '#22c55e', bg: '#f0fdf4' },
                                    suspenso: { label: 'Suspenso', color: '#f59e0b', bg: '#fffbeb' },
                                };
                                const st = statusMap[p.status] || { label: p.status, color: '#94a3b8', bg: '#f1f5f9' };
                                return (
                                    <div key={p.id} className="glass-card p-4 flex items-center gap-4 hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
                                        onClick={() => nav && nav('proj')}>
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ background: st.bg, color: st.color }}>
                                            <Briefcase size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{p.nome}</span>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                                    style={{ background: `${st.color}15`, color: st.color, border: `1px solid ${st.color}30` }}>
                                                    {st.label}
                                                </span>
                                            </div>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                {p.orc_numero && `Orc: ${p.orc_numero} · `}
                                                {dtFmt(p.data_inicio)} → {dtFmt(p.data_vencimento)}
                                            </p>
                                        </div>
                                        {p.valor_venda > 0 && (
                                            <div className="text-sm font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>{R$(p.valor_venda)}</div>
                                        )}
                                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Modal: Nova Nota ═══ */}
            {showNotaModal && (
                <Modal title={editNota ? 'Editar Nota' : 'Nova Nota'} close={() => { setShowNotaModal(false); setEditNota(null); }} w={500}>
                    <div className="space-y-4">
                        <div>
                            <label className={Z.lbl}>Título (opcional)</label>
                            <input value={notaForm.titulo} onChange={e => setNotaForm({ ...notaForm, titulo: e.target.value })}
                                className={Z.inp} placeholder="Ex: Preferência de acabamento" />
                        </div>
                        <div>
                            <label className={Z.lbl}>Conteúdo *</label>
                            <textarea value={notaForm.conteudo} onChange={e => setNotaForm({ ...notaForm, conteudo: e.target.value })}
                                className={`${Z.inp} resize-none`} rows={5}
                                placeholder="Escreva a nota sobre o cliente..." />
                        </div>
                        <div>
                            <label className={Z.lbl}>Cor</label>
                            <div className="flex gap-2">
                                {NOTE_COLORS.map(c => (
                                    <button key={c} onClick={() => setNotaForm({ ...notaForm, cor: c })}
                                        className="w-7 h-7 rounded-full transition-transform cursor-pointer hover:scale-110"
                                        style={{
                                            background: c,
                                            border: notaForm.cor === c ? '3px solid var(--text-primary)' : '2px solid transparent',
                                            boxShadow: notaForm.cor === c ? `0 0 0 2px ${c}40` : 'none'
                                        }} />
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button onClick={() => { setShowNotaModal(false); setEditNota(null); }} className={Z.btn2}>Cancelar</button>
                            <button onClick={salvarNota} className={Z.btn}>
                                {editNota ? 'Atualizar' : 'Salvar Nota'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* ═══ Modal: Registrar Interação ═══ */}
            {showInterModal && (
                <Modal title="Registrar Interação" close={() => setShowInterModal(false)} w={480}>
                    <div className="space-y-4">
                        <div>
                            <label className={Z.lbl}>Tipo</label>
                            <select value={interForm.tipo} onChange={e => setInterForm({ ...interForm, tipo: e.target.value })} className={Z.inp}>
                                <option value="ligacao">Ligação</option>
                                <option value="reuniao">Reunião</option>
                                <option value="visita">Visita</option>
                                <option value="email">E-mail</option>
                                <option value="nota">Nota</option>
                            </select>
                        </div>
                        <div>
                            <label className={Z.lbl}>Descrição *</label>
                            <textarea value={interForm.descricao} onChange={e => setInterForm({ ...interForm, descricao: e.target.value })}
                                className={`${Z.inp} resize-none`} rows={4}
                                placeholder="Descreva a interação com o cliente..." />
                        </div>
                        <div>
                            <label className={Z.lbl}>Data (opcional)</label>
                            <input type="datetime-local" value={interForm.data}
                                onChange={e => setInterForm({ ...interForm, data: e.target.value })}
                                className={Z.inp} />
                        </div>
                        <div className="flex justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button onClick={() => setShowInterModal(false)} className={Z.btn2}>Cancelar</button>
                            <button onClick={salvarInteracao} className={Z.btn}>Registrar</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT — Lista + Detalhe
// ═══════════════════════════════════════════════════════
export default function Cli({ clis, reload, notify, nav }) {
    const [f, sf] = useState(EMPTY);
    const [ed, se] = useState(null);
    const [mo, sm] = useState(false);
    const [sr, ssr] = useState('');
    const [tab, setTab] = useState('basico');
    const [confirmDel, setConfirmDel] = useState(null);
    const [cepLoading, setCepLoading] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    const fl = clis.filter(c =>
        c.nome.toLowerCase().includes(sr.toLowerCase()) ||
        (c.tel || '').includes(sr) ||
        (c.email || '').toLowerCase().includes(sr.toLowerCase())
    );

    // Busca CEP na ViaCEP
    const buscarCEP = async (cep) => {
        const digits = cep.replace(/\D/g, '');
        if (digits.length !== 8) return;
        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
            const data = await res.json();
            if (!data.erro) {
                sf(prev => ({
                    ...prev,
                    endereco: data.logradouro || prev.endereco,
                    bairro: data.bairro || prev.bairro,
                    cidade: data.localidade || prev.cidade,
                    estado: data.uf || prev.estado,
                }));
            } else { notify('CEP não encontrado'); }
        } catch { notify('Erro ao buscar CEP'); }
        finally { setCepLoading(false); }
    };

    const abrirModal = (cli = null) => {
        if (cli) { sf({ ...EMPTY, ...cli }); se(cli.id); }
        else { sf(EMPTY); se(null); }
        setTab('basico');
        sm(true);
    };

    const sv = async () => {
        if (!f.nome.trim()) { notify('Nome é obrigatório'); return; }
        try {
            if (ed) { await api.put(`/clientes/${ed}`, f); }
            else { await api.post('/clientes', f); }
            notify(ed ? 'Cliente atualizado!' : 'Cliente criado!');
            sm(false);
            reload();
        } catch (ex) { notify(ex.error || 'Erro ao salvar'); }
    };

    const del = async () => {
        if (!confirmDel) return;
        try {
            await api.del(`/clientes/${confirmDel}`);
            notify('Cliente removido');
            setConfirmDel(null);
            reload();
        } catch (ex) { notify(ex.error || 'Erro ao excluir'); }
    };

    const tabCls = (t) => `px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${tab === t ? 'text-white' : 'hover:bg-[var(--bg-hover)]'}`;
    const tabStyle = (t) => tab === t ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-secondary)' };

    // ── If a client is selected, show detail view ──
    if (selectedId) {
        return (
            <div className={Z.pg}>
                <ClienteDetalhe
                    clienteId={selectedId}
                    onBack={() => setSelectedId(null)}
                    notify={notify}
                    nav={nav}
                />
            </div>
        );
    }

    // ── List view ──
    return (
        <div className={Z.pg}>
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className={Z.h1}>Clientes</h1>
                    <p className={Z.sub}>{clis.length} registros cadastrados</p>
                </div>
                <button onClick={() => abrirModal()} className={Z.btn}>
                    <Ic.Plus /> Novo Cliente
                </button>
            </div>

            {/* Search */}
            <div className="mb-6 max-w-sm relative">
                <input
                    placeholder="Buscar por nome, telefone ou e-mail..."
                    value={sr} onChange={e => ssr(e.target.value)}
                    className={`${Z.inp} !pl-9`}
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                    <Ic.Search />
                </div>
            </div>

            {/* Table */}
            <div className={`${Z.card} !p-0 overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                        <thead>
                            <tr>
                                {['Nome / Empresa', 'Contato', 'Localização', 'Arq./Designer', 'Origem', 'Ações'].map(h => (
                                    <th key={h} className={Z.th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {fl.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="py-12 text-center text-[var(--text-muted)] text-sm">
                                        Nenhum cliente encontrado
                                    </td>
                                </tr>
                            ) : fl.map(c => (
                                <tr key={c.id} className="group hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
                                    onClick={() => setSelectedId(c.id)}>
                                    <td className="td-glass">
                                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.nome}</div>
                                        {(c.cpf || c.cnpj) && (
                                            <div className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                                                {c.tipo_pessoa === 'juridica' ? c.cnpj : c.cpf}
                                            </div>
                                        )}
                                    </td>
                                    <td className="td-glass">
                                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{c.tel || '—'}</div>
                                        {c.email && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.email}</div>}
                                    </td>
                                    <td className="td-glass">
                                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            {[c.cidade, c.estado].filter(Boolean).join(', ') || '—'}
                                        </div>
                                        {c.bairro && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.bairro}</div>}
                                    </td>
                                    <td className="td-glass text-sm" style={{ color: 'var(--text-secondary)' }}>{c.arq || '—'}</td>
                                    <td className="td-glass">
                                        {c.origem && c.origem !== 'manual' ? (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                                style={{ background: '#06b6d415', color: '#06b6d4', border: '1px solid #06b6d430' }}>
                                                {ORIGENS[c.origem] || c.origem}
                                            </span>
                                        ) : (
                                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Manual</span>
                                        )}
                                    </td>
                                    <td className="td-glass" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => abrirModal(c)}
                                                className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                                                style={{ color: 'var(--text-secondary)' }} title="Editar">
                                                <Ic.Edit />
                                            </button>
                                            <button onClick={() => setConfirmDel(c.id)}
                                                className="p-1.5 rounded-md transition-colors bg-red-500/10 hover:bg-red-500/20"
                                                style={{ color: '#ef4444' }} title="Excluir">
                                                <Ic.Trash />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Confirm Delete Modal */}
            {confirmDel && (
                <Modal title="Confirmar Exclusão" close={() => setConfirmDel(null)} w={420}>
                    <div className="flex flex-col gap-5">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: '#FEE2E2' }}>
                                <span style={{ color: '#DC2626' }}><Ic.Alert /></span>
                            </div>
                            <div>
                                <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                    Excluir cliente permanentemente?
                                </p>
                                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                    Esta ação não pode ser desfeita. Os orçamentos vinculados continuarão existindo.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button onClick={() => setConfirmDel(null)} className={Z.btn2}>Cancelar</button>
                            <button onClick={del} className={Z.btnD}>Excluir</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Create/Edit Modal */}
            {mo && (
                <Modal title={ed ? 'Editar Cliente' : 'Novo Cliente'} close={() => sm(false)} w={620}>
                    {/* Tabs */}
                    <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
                        {[
                            { id: 'basico', label: 'Dados Básicos', icon: <Ic.Usr /> },
                            { id: 'endereco', label: 'Endereço', icon: <Ic.MapPin /> },
                            { id: 'obs', label: 'Observações', icon: <Ic.File /> },
                        ].map(t => (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 ${tabCls(t.id)}`}
                                style={tabStyle(t.id)}>
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab: Dados Básicos */}
                    {tab === 'basico' && (
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                {['fisica', 'juridica'].map(tp => (
                                    <button key={tp} onClick={() => sf({ ...f, tipo_pessoa: tp })}
                                        className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${f.tipo_pessoa === tp ? 'border-[var(--primary)] text-white' : 'border-[var(--border)]'}`}
                                        style={f.tipo_pessoa === tp ? { background: 'var(--primary)' } : { color: 'var(--text-secondary)' }}>
                                        {tp === 'fisica' ? <><Ic.Usr /> Pessoa Física</> : <><Ic.Building /> Pessoa Jurídica</>}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label className={Z.lbl}>Nome Completo / Razão Social *</label>
                                <input value={f.nome} onChange={e => sf({ ...f, nome: e.target.value })}
                                    className={Z.inp} placeholder="Ex: João da Silva" autoFocus />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={Z.lbl}>{f.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF'}</label>
                                    <input
                                        value={f.tipo_pessoa === 'juridica' ? f.cnpj : f.cpf}
                                        onChange={e => {
                                            const v = f.tipo_pessoa === 'juridica' ? maskCNPJ(e.target.value) : maskCPF(e.target.value);
                                            sf({ ...f, [f.tipo_pessoa === 'juridica' ? 'cnpj' : 'cpf']: v });
                                        }}
                                        className={Z.inp} placeholder={f.tipo_pessoa === 'juridica' ? '00.000.000/0001-00' : '000.000.000-00'}
                                    />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Telefone / WhatsApp</label>
                                    <input value={f.tel} onChange={e => sf({ ...f, tel: maskTel(e.target.value) })}
                                        className={Z.inp} placeholder="(11) 90000-0000" />
                                </div>
                            </div>
                            <div>
                                <label className={Z.lbl}>E-mail</label>
                                <input type="email" value={f.email} onChange={e => sf({ ...f, email: e.target.value })}
                                    className={Z.inp} placeholder="cliente@email.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={Z.lbl}>Arquiteto / Designer</label>
                                    <input value={f.arq} onChange={e => sf({ ...f, arq: e.target.value })}
                                        className={Z.inp} placeholder="Nome do parceiro" />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Data de Nascimento</label>
                                    <input type="date" value={f.data_nascimento || ''} onChange={e => sf({ ...f, data_nascimento: e.target.value })}
                                        className={Z.inp} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={Z.lbl}>Origem</label>
                                    <select value={f.origem || 'manual'} onChange={e => sf({ ...f, origem: e.target.value })} className={Z.inp}>
                                        {Object.entries(ORIGENS).map(([k, v]) => (
                                            <option key={k} value={k}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Indicado por</label>
                                    <input value={f.indicado_por || ''} onChange={e => sf({ ...f, indicado_por: e.target.value })}
                                        className={Z.inp} placeholder="Nome de quem indicou" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab: Endereço */}
                    {tab === 'endereco' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1">
                                    <label className={Z.lbl}>CEP</label>
                                    <div className="relative">
                                        <input value={f.cep}
                                            onChange={e => {
                                                const v = maskCEP(e.target.value);
                                                sf({ ...f, cep: v });
                                                if (v.replace(/\D/g, '').length === 8) buscarCEP(v);
                                            }}
                                            className={Z.inp} placeholder="00000-000" maxLength={9} />
                                        {cepLoading && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <label className={Z.lbl}>Logradouro</label>
                                    <input value={f.endereco} onChange={e => sf({ ...f, endereco: e.target.value })}
                                        className={Z.inp} placeholder="Rua, Av., Alameda..." />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className={Z.lbl}>Número</label>
                                    <input value={f.numero} onChange={e => sf({ ...f, numero: e.target.value })}
                                        className={Z.inp} placeholder="123" />
                                </div>
                                <div className="col-span-2">
                                    <label className={Z.lbl}>Complemento</label>
                                    <input value={f.complemento} onChange={e => sf({ ...f, complemento: e.target.value })}
                                        className={Z.inp} placeholder="Apto 12, Bloco B..." />
                                </div>
                            </div>
                            <div>
                                <label className={Z.lbl}>Bairro</label>
                                <input value={f.bairro} onChange={e => sf({ ...f, bairro: e.target.value })}
                                    className={Z.inp} placeholder="Bairro" />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className={Z.lbl}>Cidade</label>
                                    <input value={f.cidade} onChange={e => sf({ ...f, cidade: e.target.value })}
                                        className={Z.inp} placeholder="São Paulo" />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Estado</label>
                                    <select value={f.estado} onChange={e => sf({ ...f, estado: e.target.value })} className={Z.inp}>
                                        <option value="">UF</option>
                                        {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab: Observações */}
                    {tab === 'obs' && (
                        <div>
                            <label className={Z.lbl}>Observações internas sobre o cliente</label>
                            <textarea value={f.obs} onChange={e => sf({ ...f, obs: e.target.value })}
                                className={`${Z.inp} resize-none`} rows={6}
                                placeholder="Preferências, histórico, notas importantes..." />
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex gap-1">
                            {['basico', 'endereco', 'obs'].map((t) => (
                                <div key={t} className="w-2 h-2 rounded-full transition-colors cursor-pointer"
                                    onClick={() => setTab(t)}
                                    style={{ background: tab === t ? 'var(--primary)' : 'var(--border)' }} />
                            ))}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => sm(false)} className={Z.btn2}>Cancelar</button>
                            <button onClick={sv} className={Z.btn}>
                                {ed ? 'Atualizar' : 'Salvar Cliente'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
