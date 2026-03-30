import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { Z, PageHeader, Modal, TabBar, EmptyState } from '../ui';
import { R$, N } from '../engine';
import {
    BarChart3, TrendingUp, TrendingDown, DollarSign, Calendar,
    Truck, Users, Star, Wrench, PieChart, ArrowUpCircle, ArrowDownCircle,
    Clock, CheckCircle2, AlertTriangle, Package, Plus, Trash2, Edit,
    ChevronDown, ChevronRight, Search, Filter, Download, RefreshCw,
    Smile, Frown, Meh, ThumbsUp, ThumbsDown, UserCheck, CalendarDays,
    Timer, MapPin, Phone, Mail, MessageSquare, Settings, Activity,
    Gauge, Target, Percent, Receipt, CreditCard, Banknote, Landmark,
    ClipboardList, ShieldCheck, Palmtree, AlertCircle, Check, X as XIcon
} from 'lucide-react';

const dtFmt = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '--';
const dtInput = (s) => s ? s.slice(0, 10) : '';
const mesLabel = (s) => {
    if (!s) return '';
    const [y, m] = s.split('-');
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[parseInt(m) - 1]}/${y}`;
};

function MiniBar({ value, max, color = 'var(--primary)', height = 8 }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return (
        <div style={{ width: '100%', height, borderRadius: height / 2, background: 'var(--bg-muted)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, background: color, transition: 'width 0.4s' }} />
        </div>
    );
}

function KPI({ icon: Icon, label, value, sub, color = 'var(--primary)' }) {
    return (
        <div className={Z.card} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon size={22} style={{ color }} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {value}
                </div>
                {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, opacity: 0.7, fontStyle: 'italic' }}>vs. mes anterior</div>
            </div>
        </div>
    );
}

function LoadingSpinner() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
            <RefreshCw size={28} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
    );
}

// ============================================================
// TAB 1: DRE
// ============================================================
function TabDRE() {
    const [periodo, setPeriodo] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/gestao/relatorios/dre?periodo=mes&data=${periodo}`);
            setData(res);
        } catch (e) {
            console.error('DRE error:', e);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [periodo]);

    useEffect(() => { load(); }, [load]);

    const prevMonth = () => {
        const [y, m] = periodo.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        setPeriodo(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };
    const nextMonth = () => {
        const [y, m] = periodo.split('-').map(Number);
        const d = new Date(y, m, 1);
        setPeriodo(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    if (loading) return <LoadingSpinner />;
    if (!data) return <EmptyState icon={BarChart3} title="Sem dados DRE" description="Nenhum dado encontrado para este periodo." />;

    const receitas = data.receitas || [];
    const despesas = data.despesas || [];
    const totalReceita = data.total_receitas ?? receitas.reduce((s, r) => s + (r.valor || 0), 0);
    const totalDespesa = data.total_despesas ?? despesas.reduce((s, d) => s + (d.valor || 0), 0);
    const lucro = data.lucro ?? (totalReceita - totalDespesa);
    const margem = data.margem ?? (totalReceita > 0 ? (lucro / totalReceita) * 100 : 0);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button className={Z.btn2Sm} onClick={prevMonth}>&larr;</button>
                <span style={{ fontSize: 16, fontWeight: 700, minWidth: 100, textAlign: 'center' }}>
                    {mesLabel(periodo)}
                </span>
                <button className={Z.btn2Sm} onClick={nextMonth}>&rarr;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                <KPI icon={ArrowUpCircle} label="Receitas" value={R$(totalReceita)} color="#22c55e" />
                <KPI icon={ArrowDownCircle} label="Despesas" value={R$(totalDespesa)} color="#ef4444" />
                <KPI icon={DollarSign} label="Lucro Liquido" value={R$(lucro)} color={lucro >= 0 ? '#22c55e' : '#ef4444'} />
                <KPI icon={Percent} label="Margem" value={`${N(margem, 1)}%`} color={margem >= 0 ? '#22c55e' : '#ef4444'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Receitas */}
                <div className={Z.card}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ArrowUpCircle size={18} style={{ color: '#22c55e' }} /> Receitas
                    </h3>
                    {receitas.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma receita registrada</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {receitas.map((r, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 600 }}>{r.descricao || r.categoria || 'Receita'}</div>
                                        {r.projeto && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.projeto}</div>}
                                    </div>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{R$(r.valor)}</span>
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontWeight: 800, fontSize: 15 }}>
                                <span>Total</span>
                                <span style={{ color: '#22c55e' }}>{R$(totalReceita)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Despesas */}
                <div className={Z.card}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ArrowDownCircle size={18} style={{ color: '#ef4444' }} /> Despesas
                    </h3>
                    {despesas.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma despesa registrada</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {despesas.map((d, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 600 }}>{d.descricao || d.categoria || 'Despesa'}</div>
                                        {d.projeto && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.projeto}</div>}
                                    </div>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>{R$(d.valor)}</span>
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontWeight: 800, fontSize: 15 }}>
                                <span>Total</span>
                                <span style={{ color: '#ef4444' }}>{R$(totalDespesa)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================
// TAB 2: RENTABILIDADE
// ============================================================
function TabRentabilidade() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/gestao/relatorios/rentabilidade');
                setData(res.projetos || res || []);
            } catch (e) {
                console.error('Rentabilidade error:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <LoadingSpinner />;
    if (!data.length) return <EmptyState icon={TrendingUp} title="Sem dados de rentabilidade" description="Nenhum projeto com dados financeiros." />;

    const maxReceita = Math.max(...data.map(p => p.receita || p.valor_total || 0), 1);

    return (
        <div>
            <div className={Z.card} style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr>
                            <th className={Z.th} style={{ minWidth: 200 }}>Projeto</th>
                            <th className={Z.th} style={{ textAlign: 'right' }}>Receita</th>
                            <th className={Z.th} style={{ textAlign: 'right' }}>Custo</th>
                            <th className={Z.th} style={{ textAlign: 'right' }}>Lucro</th>
                            <th className={Z.th} style={{ textAlign: 'right' }}>Margem</th>
                            <th className={Z.th} style={{ minWidth: 120 }}>Rentabilidade</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.sort((a, b) => (b.margem || 0) - (a.margem || 0)).map((p, i) => {
                            const receita = p.receita || p.valor_total || 0;
                            const custo = p.custo || p.custo_total || 0;
                            const lucro = p.lucro ?? (receita - custo);
                            const margem = p.margem ?? (receita > 0 ? (lucro / receita) * 100 : 0);
                            const margemColor = margem >= 30 ? '#22c55e' : margem >= 15 ? '#eab308' : '#ef4444';

                            return (
                                <tr key={p.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                                        {p.nome || p.projeto}
                                        {p.cliente && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{p.cliente}</div>}
                                    </td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{R$(receita)}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{R$(custo)}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: lucro >= 0 ? '#22c55e' : '#ef4444' }}>{R$(lucro)}</td>
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: margemColor }}>
                                        {N(margem, 1)}%
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <MiniBar value={receita} max={maxReceita} color={margemColor} />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ============================================================
// TAB 3: PREVISAO DE CAIXA
// ============================================================
function TabPrevisaoCaixa() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/gestao/relatorios/previsao-caixa');
                setData(res);
            } catch (e) {
                console.error('Previsao caixa error:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <LoadingSpinner />;
    if (!data) return <EmptyState icon={DollarSign} title="Sem previsao de caixa" description="Nenhum dado de fluxo de caixa disponivel." />;

    const saldoAtual = data.saldo_atual ?? 0;
    const periodos = data.periodos || [];
    const aReceber = data.a_receber ?? 0;
    const aPagar = data.a_pagar ?? 0;

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                <KPI icon={Landmark} label="Saldo Atual" value={R$(saldoAtual)} color={saldoAtual >= 0 ? '#22c55e' : '#ef4444'} />
                <KPI icon={ArrowUpCircle} label="A Receber" value={R$(aReceber)} color="#3b82f6" />
                <KPI icon={ArrowDownCircle} label="A Pagar" value={R$(aPagar)} color="#f59e0b" />
                <KPI icon={Target} label="Saldo Projetado" value={R$(saldoAtual + aReceber - aPagar)} color="#a855f7" />
            </div>

            <div className={Z.card}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Projecao 30 / 60 / 90 dias</h3>
                {periodos.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {[
                            { label: '30 dias', receber: data.receber_30 ?? 0, pagar: data.pagar_30 ?? 0 },
                            { label: '60 dias', receber: data.receber_60 ?? 0, pagar: data.pagar_60 ?? 0 },
                            { label: '90 dias', receber: data.receber_90 ?? 0, pagar: data.pagar_90 ?? 0 },
                        ].map((p, i) => {
                            const saldo = saldoAtual + p.receber - p.pagar;
                            return (
                                <div key={i} style={{
                                    display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr',
                                    gap: 16, alignItems: 'center', padding: '12px 0',
                                    borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                                }}>
                                    <span style={{ fontSize: 15, fontWeight: 700 }}>{p.label}</span>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Entradas</div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>{R$(p.receber)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Saidas</div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>{R$(p.pagar)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Saldo Projetado</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: saldo >= 0 ? '#22c55e' : '#ef4444' }}>{R$(saldo)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {periodos.map((p, i) => {
                            const saldo = p.saldo_projetado ?? (saldoAtual + (p.entradas || 0) - (p.saidas || 0));
                            return (
                                <div key={i} style={{
                                    display: 'grid', gridTemplateColumns: '120px 1fr 1fr 1fr',
                                    gap: 16, alignItems: 'center', padding: '12px 0',
                                    borderBottom: i < periodos.length - 1 ? '1px solid var(--border)' : 'none',
                                }}>
                                    <span style={{ fontSize: 14, fontWeight: 700 }}>{p.label || p.periodo}</span>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Entradas</div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>{R$(p.entradas || 0)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Saidas</div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>{R$(p.saidas || 0)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Saldo</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: saldo >= 0 ? '#22c55e' : '#ef4444' }}>{R$(saldo)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// TAB 4: ENTREGAS
// ============================================================
function TabEntregas() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ projeto_id: '', data_entrega: '', endereco: '', observacoes: '', status: 'pendente' });
    const [editId, setEditId] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get('/gestao/entregas');
            setData(res.entregas || res || []);
        } catch (e) {
            console.error('Entregas error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        try {
            if (editId) {
                await api.put(`/gestao/entregas/${editId}`, form);
            } else {
                await api.post('/gestao/entregas', form);
            }
            setShowModal(false);
            setEditId(null);
            setForm({ projeto_id: '', data_entrega: '', endereco: '', observacoes: '', status: 'pendente' });
            load();
        } catch (e) {
            alert(e.error || 'Erro ao salvar entrega');
        }
    };

    const openEdit = (item) => {
        setEditId(item.id);
        setForm({
            projeto_id: item.projeto_id || '',
            data_entrega: dtInput(item.data_entrega),
            endereco: item.endereco || '',
            observacoes: item.observacoes || '',
            status: item.status || 'pendente',
        });
        setShowModal(true);
    };

    if (loading) return <LoadingSpinner />;

    const statusColors = {
        pendente: { bg: '#fef3c7', color: '#d97706', label: 'Pendente' },
        agendada: { bg: '#dbeafe', color: '#2563eb', label: 'Agendada' },
        em_transito: { bg: '#e0e7ff', color: '#7c3aed', label: 'Em transito' },
        entregue: { bg: '#dcfce7', color: '#16a34a', label: 'Entregue' },
        cancelada: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelada' },
    };

    const grouped = {};
    data.forEach(e => {
        const dt = e.data_entrega || 'sem_data';
        if (!grouped[dt]) grouped[dt] = [];
        grouped[dt].push(e);
    });

    const sortedDates = Object.keys(grouped).sort((a, b) => {
        if (a === 'sem_data') return 1;
        if (b === 'sem_data') return -1;
        return a.localeCompare(b);
    });

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{data.length} entregas</span>
                <button className={Z.btnSm} onClick={() => { setEditId(null); setForm({ projeto_id: '', data_entrega: '', endereco: '', observacoes: '', status: 'pendente' }); setShowModal(true); }}>
                    <Plus size={14} /> Nova Entrega
                </button>
            </div>

            {data.length === 0 ? (
                <EmptyState icon={Truck} title="Nenhuma entrega" description="Cadastre entregas para acompanhar o calendario." />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {sortedDates.map(dt => (
                        <div key={dt}>
                            <div style={{
                                fontSize: 14, fontWeight: 700, color: 'var(--text-muted)',
                                padding: '6px 0', marginBottom: 8,
                                borderBottom: '2px solid var(--border)',
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                <Calendar size={15} />
                                {dt === 'sem_data' ? 'Sem data definida' : dtFmt(dt)}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {grouped[dt].map((e, i) => {
                                    const st = statusColors[e.status] || statusColors.pendente;
                                    return (
                                        <div key={e.id || i} className={Z.card} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                                            cursor: 'pointer',
                                        }} onClick={() => openEdit(e)}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                                                <Truck size={20} style={{ color: st.color, flexShrink: 0 }} />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {e.projeto_nome || e.projeto || `Projeto #${e.projeto_id}`}
                                                    </div>
                                                    {e.endereco && (
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <MapPin size={11} /> {e.endereco}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <span style={{
                                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                                background: st.bg, color: st.color, whiteSpace: 'nowrap',
                                            }}>
                                                {st.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <Modal title={editId ? 'Editar Entrega' : 'Nova Entrega'} close={() => setShowModal(false)} w={480}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <label className={Z.lbl}>
                            ID do Projeto
                            <input className={Z.inp} value={form.projeto_id} onChange={e => setForm(f => ({ ...f, projeto_id: e.target.value }))} placeholder="ID do projeto" />
                        </label>
                        <label className={Z.lbl}>
                            Data de Entrega
                            <input className={Z.inp} type="date" value={form.data_entrega} onChange={e => setForm(f => ({ ...f, data_entrega: e.target.value }))} />
                        </label>
                        <label className={Z.lbl}>
                            Endereco
                            <input className={Z.inp} value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Endereco de entrega" />
                        </label>
                        <label className={Z.lbl}>
                            Status
                            <select className={Z.inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                                <option value="pendente">Pendente</option>
                                <option value="agendada">Agendada</option>
                                <option value="em_transito">Em transito</option>
                                <option value="entregue">Entregue</option>
                                <option value="cancelada">Cancelada</option>
                            </select>
                        </label>
                        <label className={Z.lbl}>
                            Observacoes
                            <textarea className={Z.inp} rows={3} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Observacoes..." />
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                            <button className={Z.btn2Sm} onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className={Z.btnSm} onClick={save}>Salvar</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ============================================================
// TAB 5: EQUIPE (Ponto + Ferias)
// ============================================================
function TabEquipe() {
    const [subTab, setSubTab] = useState('ponto');
    const [pontos, setPontos] = useState([]);
    const [ferias, setFerias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showPontoModal, setShowPontoModal] = useState(false);
    const [showFeriasModal, setShowFeriasModal] = useState(false);
    const [pontoForm, setPontoForm] = useState({ funcionario: '', data: dtInput(new Date().toISOString()), entrada: '', saida: '', observacoes: '' });
    const [feriasForm, setFeriasForm] = useState({ funcionario: '', data_inicio: '', data_fim: '', tipo: 'ferias', status: 'pendente' });

    const loadPonto = useCallback(async () => {
        try {
            const res = await api.get('/gestao/ponto');
            setPontos(res.registros || res || []);
        } catch (e) {
            console.error('Ponto error:', e);
        }
    }, []);

    const loadFerias = useCallback(async () => {
        try {
            const res = await api.get('/gestao/ferias');
            setFerias(res.registros || res || []);
        } catch (e) {
            console.error('Ferias error:', e);
        }
    }, []);

    useEffect(() => {
        Promise.all([loadPonto(), loadFerias()]).finally(() => setLoading(false));
    }, [loadPonto, loadFerias]);

    const savePonto = async () => {
        try {
            await api.post('/gestao/ponto', pontoForm);
            setShowPontoModal(false);
            setPontoForm({ funcionario: '', data: dtInput(new Date().toISOString()), entrada: '', saida: '', observacoes: '' });
            loadPonto();
        } catch (e) {
            alert(e.error || 'Erro ao salvar ponto');
        }
    };

    const saveFerias = async () => {
        try {
            await api.post('/gestao/ferias', feriasForm);
            setShowFeriasModal(false);
            setFeriasForm({ funcionario: '', data_inicio: '', data_fim: '', tipo: 'ferias', status: 'pendente' });
            loadFerias();
        } catch (e) {
            alert(e.error || 'Erro ao salvar ferias');
        }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className={subTab === 'ponto' ? Z.btnSm : Z.btn2Sm} onClick={() => setSubTab('ponto')}>
                    <Clock size={14} /> Controle de Ponto
                </button>
                <button className={subTab === 'ferias' ? Z.btnSm : Z.btn2Sm} onClick={() => setSubTab('ferias')}>
                    <Palmtree size={14} /> Ferias / Ausencias
                </button>
            </div>

            {subTab === 'ponto' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <button className={Z.btnSm} onClick={() => setShowPontoModal(true)}>
                            <Plus size={14} /> Registrar Ponto
                        </button>
                    </div>

                    {pontos.length === 0 ? (
                        <EmptyState icon={Clock} title="Nenhum registro" description="Registre os pontos dos funcionarios." />
                    ) : (
                        <div className={Z.card} style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        <th className={Z.th}>Funcionario</th>
                                        <th className={Z.th}>Data</th>
                                        <th className={Z.th}>Entrada</th>
                                        <th className={Z.th}>Saida</th>
                                        <th className={Z.th}>Horas</th>
                                        <th className={Z.th}>Obs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pontos.map((p, i) => {
                                        let horas = '--';
                                        if (p.entrada && p.saida) {
                                            const [eh, em] = p.entrada.split(':').map(Number);
                                            const [sh, sm] = p.saida.split(':').map(Number);
                                            const diff = (sh * 60 + sm) - (eh * 60 + em);
                                            if (diff > 0) horas = `${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, '0')}`;
                                        }
                                        return (
                                            <tr key={p.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.funcionario || p.nome}</td>
                                                <td style={{ padding: '10px 12px' }}>{dtFmt(p.data)}</td>
                                                <td style={{ padding: '10px 12px' }}>{p.entrada || '--'}</td>
                                                <td style={{ padding: '10px 12px' }}>{p.saida || '--'}</td>
                                                <td style={{ padding: '10px 12px', fontWeight: 700 }}>{horas}</td>
                                                <td style={{ padding: '10px 12px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.observacoes || ''}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {showPontoModal && (
                        <Modal title="Registrar Ponto" close={() => setShowPontoModal(false)} w={420}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <label className={Z.lbl}>
                                    Funcionario
                                    <input className={Z.inp} value={pontoForm.funcionario} onChange={e => setPontoForm(f => ({ ...f, funcionario: e.target.value }))} placeholder="Nome" />
                                </label>
                                <label className={Z.lbl}>
                                    Data
                                    <input className={Z.inp} type="date" value={pontoForm.data} onChange={e => setPontoForm(f => ({ ...f, data: e.target.value }))} />
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <label className={Z.lbl}>
                                        Entrada
                                        <input className={Z.inp} type="time" value={pontoForm.entrada} onChange={e => setPontoForm(f => ({ ...f, entrada: e.target.value }))} />
                                    </label>
                                    <label className={Z.lbl}>
                                        Saida
                                        <input className={Z.inp} type="time" value={pontoForm.saida} onChange={e => setPontoForm(f => ({ ...f, saida: e.target.value }))} />
                                    </label>
                                </div>
                                <label className={Z.lbl}>
                                    Observacoes
                                    <input className={Z.inp} value={pontoForm.observacoes} onChange={e => setPontoForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Opcional" />
                                </label>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                    <button className={Z.btn2Sm} onClick={() => setShowPontoModal(false)}>Cancelar</button>
                                    <button className={Z.btnSm} onClick={savePonto}>Salvar</button>
                                </div>
                            </div>
                        </Modal>
                    )}
                </div>
            )}

            {subTab === 'ferias' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <button className={Z.btnSm} onClick={() => setShowFeriasModal(true)}>
                            <Plus size={14} /> Nova Solicitacao
                        </button>
                    </div>

                    {ferias.length === 0 ? (
                        <EmptyState icon={Palmtree} title="Nenhuma solicitacao" description="Registre ferias e ausencias da equipe." />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {ferias.map((f, i) => {
                                const statusMap = {
                                    pendente: { color: '#d97706', bg: '#fef3c7', label: 'Pendente' },
                                    aprovada: { color: '#16a34a', bg: '#dcfce7', label: 'Aprovada' },
                                    rejeitada: { color: '#dc2626', bg: '#fee2e2', label: 'Rejeitada' },
                                };
                                const tipoMap = {
                                    ferias: 'Ferias',
                                    folga: 'Folga',
                                    licenca: 'Licenca',
                                    atestado: 'Atestado',
                                };
                                const st = statusMap[f.status] || statusMap.pendente;
                                return (
                                    <div key={f.id || i} className={Z.card} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                            <UserCheck size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700 }}>{f.funcionario || f.nome}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                    {tipoMap[f.tipo] || f.tipo} - {dtFmt(f.data_inicio)} a {dtFmt(f.data_fim)}
                                                </div>
                                            </div>
                                        </div>
                                        <span style={{
                                            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                            background: st.bg, color: st.color,
                                        }}>
                                            {st.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {showFeriasModal && (
                        <Modal title="Nova Solicitacao" close={() => setShowFeriasModal(false)} w={420}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <label className={Z.lbl}>
                                    Funcionario
                                    <input className={Z.inp} value={feriasForm.funcionario} onChange={e => setFeriasForm(f => ({ ...f, funcionario: e.target.value }))} placeholder="Nome" />
                                </label>
                                <label className={Z.lbl}>
                                    Tipo
                                    <select className={Z.inp} value={feriasForm.tipo} onChange={e => setFeriasForm(f => ({ ...f, tipo: e.target.value }))}>
                                        <option value="ferias">Ferias</option>
                                        <option value="folga">Folga</option>
                                        <option value="licenca">Licenca</option>
                                        <option value="atestado">Atestado</option>
                                    </select>
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <label className={Z.lbl}>
                                        Data Inicio
                                        <input className={Z.inp} type="date" value={feriasForm.data_inicio} onChange={e => setFeriasForm(f => ({ ...f, data_inicio: e.target.value }))} />
                                    </label>
                                    <label className={Z.lbl}>
                                        Data Fim
                                        <input className={Z.inp} type="date" value={feriasForm.data_fim} onChange={e => setFeriasForm(f => ({ ...f, data_fim: e.target.value }))} />
                                    </label>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                    <button className={Z.btn2Sm} onClick={() => setShowFeriasModal(false)}>Cancelar</button>
                                    <button className={Z.btnSm} onClick={saveFerias}>Salvar</button>
                                </div>
                            </div>
                        </Modal>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================
// TAB 6: NPS
// ============================================================
function TabNPS() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/gestao/nps');
                setData(res);
            } catch (e) {
                console.error('NPS error:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <LoadingSpinner />;
    if (!data) return <EmptyState icon={Star} title="Sem dados NPS" description="Nenhuma avaliacao registrada." />;

    const score = data.score ?? data.nps ?? 0;
    const total = data.total_respostas ?? data.total ?? 0;
    const promotores = data.promotores ?? 0;
    const neutros = data.neutros ?? 0;
    const detratores = data.detratores ?? 0;
    const avaliacoes = data.avaliacoes || data.respostas || [];

    let scoreColor = '#22c55e';
    let scoreLabel = 'Excelente';
    if (score < 0) { scoreColor = '#ef4444'; scoreLabel = 'Critico'; }
    else if (score < 50) { scoreColor = '#eab308'; scoreLabel = 'Razoavel'; }
    else if (score < 75) { scoreColor = '#3b82f6'; scoreLabel = 'Bom'; }

    const ScoreIcon = score >= 50 ? Smile : score >= 0 ? Meh : Frown;

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                <div className={Z.card} style={{ textAlign: 'center', padding: 24 }}>
                    <ScoreIcon size={40} style={{ color: scoreColor, margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 48, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: scoreColor, marginTop: 4 }}>{scoreLabel}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{total} respostas</div>
                </div>
                <KPI icon={ThumbsUp} label="Promotores (9-10)" value={promotores} sub={total > 0 ? `${Math.round((promotores / total) * 100)}%` : ''} color="#22c55e" />
                <KPI icon={Meh} label="Neutros (7-8)" value={neutros} sub={total > 0 ? `${Math.round((neutros / total) * 100)}%` : ''} color="#eab308" />
                <KPI icon={ThumbsDown} label="Detratores (0-6)" value={detratores} sub={total > 0 ? `${Math.round((detratores / total) * 100)}%` : ''} color="#ef4444" />
            </div>

            {avaliacoes.length > 0 && (
                <div className={Z.card}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Avaliacoes Recentes</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {avaliacoes.map((a, i) => {
                            const noteColor = a.nota >= 9 ? '#22c55e' : a.nota >= 7 ? '#eab308' : '#ef4444';
                            return (
                                <div key={a.id || i} style={{
                                    display: 'flex', gap: 12, padding: '12px 0',
                                    borderBottom: i < avaliacoes.length - 1 ? '1px solid var(--border)' : 'none',
                                }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                                        background: `${noteColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 18, fontWeight: 900, color: noteColor,
                                    }}>
                                        {a.nota}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 600 }}>{a.cliente || a.nome || 'Cliente'}</div>
                                        {a.projeto && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.projeto}</div>}
                                        {a.comentario && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{a.comentario}</div>}
                                        {a.data && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{dtFmt(a.data)}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// TAB 7: MANUTENCAO
// ============================================================
function TabManutencao() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ maquina: '', tipo: 'preventiva', data_prevista: '', descricao: '', responsavel: '', status: 'pendente' });
    const [editId, setEditId] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await api.get('/gestao/manutencao');
            setData(res.manutencoes || res || []);
        } catch (e) {
            console.error('Manutencao error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        try {
            if (editId) {
                await api.put(`/gestao/manutencao/${editId}`, form);
            } else {
                await api.post('/gestao/manutencao', form);
            }
            setShowModal(false);
            setEditId(null);
            setForm({ maquina: '', tipo: 'preventiva', data_prevista: '', descricao: '', responsavel: '', status: 'pendente' });
            load();
        } catch (e) {
            alert(e.error || 'Erro ao salvar manutencao');
        }
    };

    const openEdit = (item) => {
        setEditId(item.id);
        setForm({
            maquina: item.maquina || '',
            tipo: item.tipo || 'preventiva',
            data_prevista: dtInput(item.data_prevista),
            descricao: item.descricao || '',
            responsavel: item.responsavel || '',
            status: item.status || 'pendente',
        });
        setShowModal(true);
    };

    if (loading) return <LoadingSpinner />;

    const statusMap = {
        pendente: { color: '#d97706', bg: '#fef3c7', label: 'Pendente' },
        em_andamento: { color: '#2563eb', bg: '#dbeafe', label: 'Em andamento' },
        concluida: { color: '#16a34a', bg: '#dcfce7', label: 'Concluida' },
        cancelada: { color: '#dc2626', bg: '#fee2e2', label: 'Cancelada' },
    };

    const tipoMap = {
        preventiva: { color: '#3b82f6', label: 'Preventiva' },
        corretiva: { color: '#ef4444', label: 'Corretiva' },
        preditiva: { color: '#a855f7', label: 'Preditiva' },
    };

    const pendentes = data.filter(m => m.status === 'pendente' || m.status === 'em_andamento');
    const atrasadas = data.filter(m => {
        if (m.status === 'concluida' || m.status === 'cancelada') return false;
        if (!m.data_prevista) return false;
        return new Date(m.data_prevista + 'T12:00:00') < new Date();
    });

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                <KPI icon={Wrench} label="Total" value={data.length} color="#3b82f6" />
                <KPI icon={Clock} label="Pendentes" value={pendentes.length} color="#d97706" />
                <KPI icon={AlertTriangle} label="Atrasadas" value={atrasadas.length} color="#ef4444" />
                <KPI icon={CheckCircle2} label="Concluidas" value={data.filter(m => m.status === 'concluida').length} color="#22c55e" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className={Z.btnSm} onClick={() => { setEditId(null); setForm({ maquina: '', tipo: 'preventiva', data_prevista: '', descricao: '', responsavel: '', status: 'pendente' }); setShowModal(true); }}>
                    <Plus size={14} /> Nova Manutencao
                </button>
            </div>

            {data.length === 0 ? (
                <EmptyState icon={Wrench} title="Nenhuma manutencao" description="Cadastre as manutencoes das maquinas." />
            ) : (
                <div className={Z.card} style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                <th className={Z.th}>Maquina</th>
                                <th className={Z.th}>Tipo</th>
                                <th className={Z.th}>Data Prevista</th>
                                <th className={Z.th}>Responsavel</th>
                                <th className={Z.th}>Status</th>
                                <th className={Z.th} style={{ width: 50 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((m, i) => {
                                const st = statusMap[m.status] || statusMap.pendente;
                                const tp = tipoMap[m.tipo] || tipoMap.preventiva;
                                const isAtrasada = m.status !== 'concluida' && m.status !== 'cancelada' && m.data_prevista && new Date(m.data_prevista + 'T12:00:00') < new Date();
                                return (
                                    <tr key={m.id || i} style={{ borderBottom: '1px solid var(--border)', background: isAtrasada ? '#fef2f215' : 'transparent' }}>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ fontWeight: 700 }}>{m.maquina}</div>
                                            {m.descricao && <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descricao}</div>}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: tp.color }}>{tp.label}</span>
                                        </td>
                                        <td style={{ padding: '10px 12px', color: isAtrasada ? '#ef4444' : 'inherit', fontWeight: isAtrasada ? 700 : 400 }}>
                                            {dtFmt(m.data_prevista)}
                                            {isAtrasada && <AlertTriangle size={12} style={{ marginLeft: 4, color: '#ef4444' }} />}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>{m.responsavel || '--'}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{
                                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                                background: st.bg, color: st.color,
                                            }}>
                                                {st.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <button onClick={() => openEdit(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                                <Edit size={14} style={{ color: 'var(--text-muted)' }} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <Modal title={editId ? 'Editar Manutencao' : 'Nova Manutencao'} close={() => setShowModal(false)} w={480}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <label className={Z.lbl}>
                            Maquina
                            <input className={Z.inp} value={form.maquina} onChange={e => setForm(f => ({ ...f, maquina: e.target.value }))} placeholder="Nome da maquina" />
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <label className={Z.lbl}>
                                Tipo
                                <select className={Z.inp} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                                    <option value="preventiva">Preventiva</option>
                                    <option value="corretiva">Corretiva</option>
                                    <option value="preditiva">Preditiva</option>
                                </select>
                            </label>
                            <label className={Z.lbl}>
                                Data Prevista
                                <input className={Z.inp} type="date" value={form.data_prevista} onChange={e => setForm(f => ({ ...f, data_prevista: e.target.value }))} />
                            </label>
                        </div>
                        <label className={Z.lbl}>
                            Responsavel
                            <input className={Z.inp} value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Nome" />
                        </label>
                        <label className={Z.lbl}>
                            Descricao
                            <textarea className={Z.inp} rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva o servico..." />
                        </label>
                        <label className={Z.lbl}>
                            Status
                            <select className={Z.inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                                <option value="pendente">Pendente</option>
                                <option value="em_andamento">Em andamento</option>
                                <option value="concluida">Concluida</option>
                                <option value="cancelada">Cancelada</option>
                            </select>
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                            <button className={Z.btn2Sm} onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className={Z.btnSm} onClick={save}>Salvar</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ============================================================
// MAIN PAGE
// ============================================================
const TABS = [
    { id: 'dre', label: 'DRE', icon: BarChart3 },
    { id: 'rentabilidade', label: 'Rentabilidade', icon: TrendingUp },
    { id: 'previsao', label: 'Previsao de Caixa', icon: DollarSign },
    { id: 'entregas', label: 'Entregas', icon: Truck },
    { id: 'equipe', label: 'Equipe', icon: Users },
    { id: 'nps', label: 'NPS', icon: Star },
    { id: 'manutencao', label: 'Manutencao', icon: Wrench },
];

export default function GestaoAvancada() {
    const [tab, setTab] = useState('dre');

    return (
        <div className={Z.pg}>
            <PageHeader icon={PieChart} title="Gestao Avancada" subtitle="Financeiro, equipe, entregas e indicadores" />

            <TabBar tabs={TABS} active={tab} onChange={setTab} />

            {tab === 'dre' && <TabDRE />}
            {tab === 'rentabilidade' && <TabRentabilidade />}
            {tab === 'previsao' && <TabPrevisaoCaixa />}
            {tab === 'entregas' && <TabEntregas />}
            {tab === 'equipe' && <TabEquipe />}
            {tab === 'nps' && <TabNPS />}
            {tab === 'manutencao' && <TabManutencao />}
        </div>
    );
}
