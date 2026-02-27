import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { Ic, Z, Modal, Spinner } from '../ui';
import { R$, N } from '../engine';
import { useAuth } from '../auth';
import {
    Package, PlusCircle, ArrowUpCircle, ArrowDownCircle, AlertTriangle,
    Search, Filter, RefreshCw, MapPin, Sliders, History, TrendingDown,
    TrendingUp, BarChart3, ChevronDown, CheckCircle2, Users, Clock,
    UserPlus, Trash2, Edit2, Phone, Briefcase, DollarSign
} from 'lucide-react';

// ─── Constantes ─────────────────────────────
const TIPOS = { material: 'Material', ferragem: 'Ferragem', acessorio: 'Acessório' };

const STATUS_COR = (qtd, min) => {
    if (qtd <= 0) return { label: 'Zerado', color: '#ef4444', bg: '#fef2f2' };
    if (min > 0 && qtd < min) return { label: 'Baixo', color: '#f59e0b', bg: '#fffbeb' };
    return { label: 'OK', color: '#22c55e', bg: '#f0fdf4' };
};

// ─── Modal de Movimentação ─────────────────
function MovModal({ tipo, materiais, projetos, onClose, onSave }) {
    const [materialId, setMaterialId] = useState('');
    const [quantidade, setQuantidade] = useState('');
    const [valorUnit, setValorUnit] = useState('');
    const [projetoId, setProjetoId] = useState('');
    const [descricao, setDescricao] = useState('');
    const [saving, setSaving] = useState(false);
    const [searchMat, setSearchMat] = useState('');

    const title = tipo === 'entrada' ? 'Registrar Entrada' : tipo === 'saida' ? 'Registrar Saída' : 'Ajuste de Inventário';
    const icon = tipo === 'entrada' ? <ArrowDownCircle size={16} color="#22c55e" /> : tipo === 'saida' ? <ArrowUpCircle size={16} color="#ef4444" /> : <RefreshCw size={16} color="#1379F0" />;

    const filteredMat = materiais.filter(m => {
        const q = searchMat.toLowerCase();
        return !q || m.nome.toLowerCase().includes(q) || (m.cod || '').toLowerCase().includes(q);
    });

    const handleSave = async () => {
        if (!materialId || !quantidade) return;
        setSaving(true);
        try {
            if (tipo === 'entrada') {
                await onSave('/estoque/entrada', { material_id: parseInt(materialId), quantidade: parseFloat(quantidade), valor_unitario: parseFloat(valorUnit) || 0, descricao });
            } else if (tipo === 'saida') {
                await onSave('/estoque/saida', { material_id: parseInt(materialId), quantidade: parseFloat(quantidade), projeto_id: projetoId ? parseInt(projetoId) : null, descricao });
            } else {
                await onSave('/estoque/ajuste', { material_id: parseInt(materialId), quantidade_real: parseFloat(quantidade), descricao });
            }
            onClose();
        } catch { } finally { setSaving(false); }
    };

    return (
        <Modal title={title} close={onClose} w={520}>
            <div style={{ display: 'grid', gap: 14 }}>
                <div>
                    <label className={Z.lbl}>Material *</label>
                    <input className={Z.inp} placeholder="Buscar material..." value={searchMat} onChange={e => setSearchMat(e.target.value)} style={{ marginBottom: 6, fontSize: 13 }} />
                    <select className={Z.inp} style={{ fontSize: 13 }} value={materialId} onChange={e => setMaterialId(e.target.value)} size={Math.min(6, filteredMat.length + 1)}>
                        <option value="">— Selecionar —</option>
                        {filteredMat.map(m => (
                            <option key={m.id} value={m.id}>{m.nome} ({m.unidade}) — Estoque: {N(m.quantidade, 1)}</option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: tipo === 'entrada' ? '1fr 1fr' : '1fr', gap: 12 }}>
                    <div>
                        <label className={Z.lbl}>{tipo === 'ajuste' ? 'Quantidade Real *' : 'Quantidade *'}</label>
                        <input type="number" step="0.01" className={Z.inp} style={{ fontSize: 13 }} value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder={tipo === 'ajuste' ? 'Qtd real no inventário' : '0'} />
                    </div>
                    {tipo === 'entrada' && (
                        <div>
                            <label className={Z.lbl}>Valor Unitário (R$)</label>
                            <input type="number" step="0.01" className={Z.inp} style={{ fontSize: 13 }} value={valorUnit} onChange={e => setValorUnit(e.target.value)} placeholder="0,00" />
                        </div>
                    )}
                </div>
                {tipo === 'saida' && (
                    <div>
                        <label className={Z.lbl}>Projeto (opcional)</label>
                        <select className={Z.inp} style={{ fontSize: 13 }} value={projetoId} onChange={e => setProjetoId(e.target.value)}>
                            <option value="">— Sem projeto —</option>
                            {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                    </div>
                )}
                <div>
                    <label className={Z.lbl}>Descrição</label>
                    <input className={Z.inp} style={{ fontSize: 13 }} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Observação..." />
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button className={Z.btn2} onClick={onClose}>Cancelar</button>
                <button className={Z.btn} onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {icon} {saving ? 'Salvando...' : 'Confirmar'}
                </button>
            </div>
        </Modal>
    );
}

// ─── Modal de Configuração (mínimo + localização) ────
function ConfigModal({ material, onClose, onSave }) {
    const [min, setMin] = useState(material.quantidade_minima || 0);
    const [loc, setLoc] = useState(material.localizacao || '');
    const [saving, setSaving] = useState(false);

    const handle = async () => {
        setSaving(true);
        try { await onSave(material.id, { quantidade_minima: parseFloat(min) || 0, localizacao: loc }); onClose(); }
        catch { } finally { setSaving(false); }
    };

    return (
        <Modal title={`Configurar: ${material.nome}`} close={onClose} w={420}>
            <div style={{ display: 'grid', gap: 14 }}>
                <div>
                    <label className={Z.lbl}>Quantidade Mínima</label>
                    <input type="number" step="0.01" className={Z.inp} style={{ fontSize: 13 }} value={min} onChange={e => setMin(e.target.value)} placeholder="0 = sem mínimo" />
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Alerta quando o estoque ficar abaixo deste valor</p>
                </div>
                <div>
                    <label className={Z.lbl}>Localização</label>
                    <input className={Z.inp} style={{ fontSize: 13 }} value={loc} onChange={e => setLoc(e.target.value)} placeholder="Ex: Prateleira A3, Galpão 2..." />
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button className={Z.btn2} onClick={onClose}>Cancelar</button>
                <button className={Z.btn} onClick={handle} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
        </Modal>
    );
}

// ─── Página Principal ────────────────────────
export default function Estoque({ notify }) {
    const { isGerente } = useAuth();
    const [materiais, setMateriais] = useState([]);
    const [movs, setMovs] = useState([]);
    const [alertas, setAlertas] = useState([]);
    const [projetos, setProjetos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [movModal, setMovModal] = useState(null);    // 'entrada' | 'saida' | 'ajuste'
    const [configModal, setConfigModal] = useState(null); // material object
    const [tab, setTab] = useState('estoque');          // 'estoque' | 'movimentacoes' | 'mao_de_obra' | 'colaboradores'

    // Mão de obra / Colaboradores state
    const [colaboradores, setColaboradores] = useState([]);
    const [apontamentos, setApontamentos] = useState([]);
    const [colabForm, setColabForm] = useState(null);
    const [apontForm, setApontForm] = useState(null);
    const [dashMO, setDashMO] = useState({ colaboradores_ativos: 0, horas_mes: 0, custo_mao_obra_mes: 0 });

    const loadColaboradores = () => api.get('/recursos/colaboradores?todos=1').then(setColaboradores).catch(() => {});
    const loadApontamentos = () => api.get('/recursos/apontamentos?limit=200').then(setApontamentos).catch(() => {});
    const loadDashMO = () => api.get('/recursos/dashboard').then(setDashMO).catch(() => {});

    const loadAll = useCallback(() => {
        setLoading(true);
        Promise.all([
            api.get('/estoque').catch(() => []),
            api.get('/estoque/movimentacoes?limit=200').catch(() => []),
            api.get('/estoque/alertas').catch(() => []),
            api.get('/projetos').catch(() => []),
        ]).then(([mat, mov, alert, proj]) => {
            setMateriais(mat);
            setMovs(mov);
            setAlertas(alert);
            setProjetos(proj);
            setLoading(false);
        });
        loadColaboradores();
        loadApontamentos();
        loadDashMO();
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleMov = async (url, payload) => {
        await api.post(url, payload);
        loadAll();
        notify(url.includes('entrada') ? 'Entrada registrada' : url.includes('saida') ? 'Saída registrada' : 'Ajuste realizado');
    };

    const handleConfig = async (materialId, payload) => {
        await api.put(`/estoque/config/${materialId}`, payload);
        loadAll();
        notify('Configuração salva');
    };

    // Filtros
    const filtered = materiais.filter(m => {
        const q = search.toLowerCase();
        const matchQ = !q || m.nome.toLowerCase().includes(q) || (m.cod || '').toLowerCase().includes(q);
        const matchTipo = !filterTipo || m.tipo === filterTipo;
        const matchStatus = !filterStatus || (() => {
            const s = STATUS_COR(m.quantidade, m.quantidade_minima);
            if (filterStatus === 'baixo') return s.label === 'Baixo' || s.label === 'Zerado';
            if (filterStatus === 'ok') return s.label === 'OK';
            return true;
        })();
        return matchQ && matchTipo && matchStatus;
    });

    // Estatísticas
    const totalItens = materiais.length;
    const totalBaixo = materiais.filter(m => { const s = STATUS_COR(m.quantidade, m.quantidade_minima); return s.label === 'Baixo' || s.label === 'Zerado'; }).length;
    const totalValor = materiais.reduce((s, m) => s + (m.quantidade * (m.preco || 0)), 0);

    return (
        <div className={Z.pg}>
            {/* Modais */}
            {movModal && <MovModal tipo={movModal} materiais={materiais} projetos={projetos} onClose={() => setMovModal(null)} onSave={handleMov} />}
            {configModal && <ConfigModal material={configModal} onClose={() => setConfigModal(null)} onSave={handleConfig} />}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className={Z.h1}>Gestão de Recursos</h1>
                    <p className={Z.sub}>Materiais, mão de obra e custos do projeto</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setMovModal('entrada')} className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#22c55e' }}>
                        <ArrowDownCircle size={14} /> Entrada
                    </button>
                    <button onClick={() => setMovModal('saida')} className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ef4444' }}>
                        <ArrowUpCircle size={14} /> Saída
                    </button>
                    <button onClick={() => setMovModal('ajuste')} className={Z.btn2} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RefreshCw size={14} /> Ajuste
                    </button>
                </div>
            </div>

            {/* Cards de Resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div className={Z.card} style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Package size={16} color="#1379F0" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Total de Itens</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#1379F0' }}>{totalItens}</div>
                </div>
                <div className={Z.card} style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <AlertTriangle size={16} color={totalBaixo > 0 ? '#ef4444' : '#22c55e'} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Alertas</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: totalBaixo > 0 ? '#ef4444' : '#22c55e' }}>{totalBaixo}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>item(ns) abaixo do mínimo</div>
                </div>
                <div className={Z.card} style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <BarChart3 size={16} color="#8b5cf6" />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Valor em Estoque</span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5cf6' }}>{R$(totalValor)}</div>
                </div>
            </div>

            {/* Alertas */}
            {alertas.length > 0 && (
                <div style={{ marginBottom: 20, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 18px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#ef4444', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={14} /> Materiais abaixo do mínimo
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {alertas.map(a => (
                            <span key={a.id} style={{ fontSize: 12, background: '#fff', padding: '4px 10px', borderRadius: 20, border: '1px solid #fecaca', color: '#dc2626', fontWeight: 600 }}>
                                {a.nome}: {N(a.quantidade, 1)} / {N(a.quantidade_minima, 1)} {a.unidade}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
                {[
                    { id: 'estoque', label: 'Materiais', icon: <Package size={14} /> },
                    { id: 'movimentacoes', label: 'Movimentações', icon: <History size={14} /> },
                    { id: 'mao_de_obra', label: 'Mão de Obra', icon: <Clock size={14} /> },
                    { id: 'colaboradores', label: 'Colaboradores', icon: <Users size={14} /> },
                ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                        padding: '10px 18px', fontSize: 13, fontWeight: 600,
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        background: tab === t.id ? 'var(--primary)' : 'transparent',
                        color: tab === t.id ? '#fff' : 'var(--text-muted)',
                        borderRadius: '8px 8px 0 0', transition: 'all 0.15s',
                    }}>{t.icon} {t.label}</button>
                ))}
            </div>

            {tab === 'estoque' && (
                <>
                    {/* Filtros */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}><Search size={16} /></span>
                            <input className={Z.inp} style={{ paddingLeft: 34 }} placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <select className={Z.inp} style={{ width: 'auto', minWidth: 140, fontSize: 13 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
                            <option value="">Todos os tipos</option>
                            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <select className={Z.inp} style={{ width: 'auto', minWidth: 140, fontSize: 13 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="">Todos os status</option>
                            <option value="baixo">Baixo / Zerado</option>
                            <option value="ok">Estoque OK</option>
                        </select>
                    </div>

                    {/* Tabela de Materiais */}
                    {loading ? (
                        <Spinner text="Carregando materiais..." />
                    ) : filtered.length === 0 ? (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 48 }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>
                                {materiais.length === 0 ? 'Nenhum material cadastrado na biblioteca.' : 'Nenhum resultado para os filtros selecionados.'}
                            </p>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ overflow: 'hidden', overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['Material', 'Tipo', 'Estoque', 'Mínimo', 'Status', 'Localização', 'Valor Unit.', ''].map(h => (
                                            <th key={h} className={Z.th} style={{ fontSize: 11 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((m, i) => {
                                        const st = STATUS_COR(m.quantidade, m.quantidade_minima);
                                        return (
                                            <tr key={m.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.nome}</div>
                                                    {m.cod && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{m.cod}</div>}
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--bg-muted)', padding: '2px 8px', borderRadius: 12, color: 'var(--text-muted)' }}>
                                                        {TIPOS[m.tipo] || m.tipo}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 15 }}>
                                                    {N(m.quantidade, 1)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{m.unidade}</span>
                                                </td>
                                                <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
                                                    {m.quantidade_minima > 0 ? `${N(m.quantidade_minima, 1)} ${m.unidade}` : '—'}
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                                                        background: st.bg, color: st.color, border: `1px solid ${st.color}30`
                                                    }}>{st.label}</span>
                                                </td>
                                                <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                                                    {m.localizacao ? (
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {m.localizacao}</span>
                                                    ) : '—'}
                                                </td>
                                                <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                                                    {m.preco ? R$(m.preco) : '—'}
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <button onClick={() => setConfigModal(m)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}
                                                        title="Configurar mínimo e localização">
                                                        <Sliders size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {tab === 'movimentacoes' && (
                <>
                    {movs.length === 0 ? (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 48 }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Nenhuma movimentação registrada.</p>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ overflow: 'hidden', overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: 650, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['Data', 'Tipo', 'Material', 'Quantidade', 'Projeto', 'Descrição', 'Usuário'].map(h => (
                                            <th key={h} className={Z.th} style={{ fontSize: 11 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {movs.map((m, i) => {
                                        const tipoInfo = m.tipo === 'entrada'
                                            ? { label: '↓ Entrada', color: '#22c55e', bg: '#f0fdf4' }
                                            : m.tipo === 'saida'
                                                ? { label: '↑ Saída', color: '#ef4444', bg: '#fef2f2' }
                                                : { label: '↻ Ajuste', color: '#1379F0', bg: '#eff6ff' };
                                        return (
                                            <tr key={m.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                                                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {new Date(m.criado_em).toLocaleDateString('pt-BR')}
                                                    <div style={{ fontSize: 10 }}>{new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                                </td>
                                                <td style={{ padding: '10px 14px' }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: tipoInfo.bg, color: tipoInfo.color }}>
                                                        {tipoInfo.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 14 }}>{m.material_nome}</td>
                                                <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 14 }}>
                                                    <span style={{ color: m.tipo === 'entrada' ? '#22c55e' : m.tipo === 'saida' ? '#ef4444' : '#1379F0' }}>
                                                        {m.tipo === 'entrada' ? '+' : m.tipo === 'saida' ? '-' : ''}{N(Math.abs(m.quantidade), 1)}
                                                    </span>
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{m.unidade}</span>
                                                </td>
                                                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{m.projeto_nome || '—'}</td>
                                                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{m.descricao || '—'}</td>
                                                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{m.usuario_nome || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ─── Tab: Mão de Obra ─────────────────────── */}
            {tab === 'mao_de_obra' && (
                <>
                    {/* Dashboard cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                        <div className={Z.card} style={{ padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <Clock size={16} color="#1379F0" />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Total Horas Mês</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#1379F0' }}>{N(dashMO.horas_mes, 1)}</div>
                        </div>
                        <div className={Z.card} style={{ padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <DollarSign size={16} color="#8b5cf6" />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Custo Mão de Obra Mês</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5cf6' }}>{R$(dashMO.custo_mao_obra_mes)}</div>
                        </div>
                        <div className={Z.card} style={{ padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <Users size={16} color="#22c55e" />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Colaboradores Ativos</span>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{dashMO.colaboradores_ativos}</div>
                        </div>
                    </div>

                    {/* Botão novo apontamento */}
                    {isGerente && (
                        <div style={{ marginBottom: 16 }}>
                            <button className={Z.btn} onClick={() => setApontForm({ colaborador_id: '', projeto_id: '', data: new Date().toISOString().slice(0, 10), horas: '', descricao: '' })} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <PlusCircle size={14} /> Novo Apontamento
                            </button>
                        </div>
                    )}

                    {/* Form novo apontamento */}
                    {apontForm && (
                        <div className={Z.card} style={{ padding: 20, marginBottom: 20 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Novo Apontamento de Horas</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className={Z.lbl}>Colaborador *</label>
                                    <select className={Z.inp} style={{ fontSize: 13 }} value={apontForm.colaborador_id} onChange={e => setApontForm({ ...apontForm, colaborador_id: e.target.value })}>
                                        <option value="">— Selecionar —</option>
                                        {colaboradores.filter(c => c.ativo !== false).map(c => (
                                            <option key={c.id} value={c.id}>{c.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Projeto *</label>
                                    <select className={Z.inp} style={{ fontSize: 13 }} value={apontForm.projeto_id} onChange={e => setApontForm({ ...apontForm, projeto_id: e.target.value })}>
                                        <option value="">— Selecionar —</option>
                                        {projetos.map(p => (
                                            <option key={p.id} value={p.id}>{p.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Data *</label>
                                    <input type="date" className={Z.inp} style={{ fontSize: 13 }} value={apontForm.data} onChange={e => setApontForm({ ...apontForm, data: e.target.value })} />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Horas *</label>
                                    <input type="number" step="0.5" min="0" className={Z.inp} style={{ fontSize: 13 }} value={apontForm.horas} onChange={e => setApontForm({ ...apontForm, horas: e.target.value })} placeholder="Ex: 8" />
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className={Z.lbl}>Descrição</label>
                                    <textarea className={Z.inp} style={{ fontSize: 13, minHeight: 60, resize: 'vertical' }} value={apontForm.descricao} onChange={e => setApontForm({ ...apontForm, descricao: e.target.value })} placeholder="Atividades realizadas..." />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                                <button className={Z.btn2} onClick={() => setApontForm(null)}>Cancelar</button>
                                <button className={Z.btn} onClick={async () => {
                                    if (!apontForm.colaborador_id || !apontForm.projeto_id || !apontForm.horas) return;
                                    try {
                                        await api.post('/recursos/apontamentos', {
                                            colaborador_id: parseInt(apontForm.colaborador_id),
                                            projeto_id: parseInt(apontForm.projeto_id),
                                            data: apontForm.data,
                                            horas: parseFloat(apontForm.horas),
                                            descricao: apontForm.descricao,
                                        });
                                        setApontForm(null);
                                        loadApontamentos();
                                        loadDashMO();
                                        notify('Apontamento registrado');
                                    } catch { }
                                }}>Salvar</button>
                            </div>
                        </div>
                    )}

                    {/* Tabela de apontamentos */}
                    {apontamentos.length === 0 ? (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 48 }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Nenhum apontamento registrado.</p>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ overflow: 'hidden', overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: 650, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['Data', 'Colaborador', 'Projeto', 'Horas', 'Valor (R$)', 'Descrição', ''].map(h => (
                                            <th key={h} className={Z.th} style={{ fontSize: 11 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {apontamentos.map((a, i) => (
                                        <tr key={a.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>{a.colaborador_nome || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>{a.projeto_nome || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 14, color: '#1379F0' }}>{N(a.horas, 1)}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, color: '#8b5cf6' }}>{R$(a.valor)}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{a.descricao || '—'}</td>
                                            <td style={{ padding: '10px 14px' }}>
                                                {isGerente && (
                                                    <button onClick={async () => {
                                                        if (!confirm('Excluir este apontamento?')) return;
                                                        try {
                                                            await api.del(`/recursos/apontamentos/${a.id}`);
                                                            loadApontamentos();
                                                            loadDashMO();
                                                            notify('Apontamento excluído');
                                                        } catch { }
                                                    }} className={Z.btnD} title="Excluir" style={{ padding: '4px 8px' }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* ─── Tab: Colaboradores ─────────────────────── */}
            {tab === 'colaboradores' && (
                <>
                    {/* Botão novo colaborador */}
                    {isGerente && (
                        <div style={{ marginBottom: 16 }}>
                            <button className={Z.btn} onClick={() => setColabForm({ nome: '', funcao: '', valor_hora: '', telefone: '' })} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <UserPlus size={14} /> Novo Colaborador
                            </button>
                        </div>
                    )}

                    {/* Form criar/editar colaborador */}
                    {colabForm && (
                        <div className={Z.card} style={{ padding: 20, marginBottom: 20 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{colabForm.id ? 'Editar Colaborador' : 'Novo Colaborador'}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className={Z.lbl}>Nome *</label>
                                    <input className={Z.inp} style={{ fontSize: 13 }} value={colabForm.nome} onChange={e => setColabForm({ ...colabForm, nome: e.target.value })} placeholder="Nome completo" />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Função / Cargo</label>
                                    <input className={Z.inp} style={{ fontSize: 13 }} value={colabForm.funcao} onChange={e => setColabForm({ ...colabForm, funcao: e.target.value })} placeholder="Ex: Marceneiro, Montador..." />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Valor / Hora (R$)</label>
                                    <input type="number" step="0.01" min="0" className={Z.inp} style={{ fontSize: 13 }} value={colabForm.valor_hora} onChange={e => setColabForm({ ...colabForm, valor_hora: e.target.value })} placeholder="0,00" />
                                </div>
                                <div>
                                    <label className={Z.lbl}>Telefone</label>
                                    <input className={Z.inp} style={{ fontSize: 13 }} value={colabForm.telefone} onChange={e => setColabForm({ ...colabForm, telefone: e.target.value })} placeholder="(00) 00000-0000" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                                <button className={Z.btn2} onClick={() => setColabForm(null)}>Cancelar</button>
                                <button className={Z.btn} onClick={async () => {
                                    if (!colabForm.nome) return;
                                    try {
                                        const payload = {
                                            nome: colabForm.nome,
                                            funcao: colabForm.funcao,
                                            valor_hora: parseFloat(colabForm.valor_hora) || 0,
                                            telefone: colabForm.telefone,
                                        };
                                        if (colabForm.id) {
                                            await api.put(`/recursos/colaboradores/${colabForm.id}`, payload);
                                            notify('Colaborador atualizado');
                                        } else {
                                            await api.post('/recursos/colaboradores', payload);
                                            notify('Colaborador cadastrado');
                                        }
                                        setColabForm(null);
                                        loadColaboradores();
                                        loadDashMO();
                                    } catch { }
                                }}>Salvar</button>
                            </div>
                        </div>
                    )}

                    {/* Tabela de colaboradores */}
                    {colaboradores.length === 0 ? (
                        <div className={Z.card} style={{ textAlign: 'center', padding: 48 }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Nenhum colaborador cadastrado.</p>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ overflow: 'hidden', overflowX: 'auto' }}>
                            <table style={{ width: '100%', minWidth: 550, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['Nome', 'Função', 'Valor/Hora (R$)', 'Telefone', 'Status', ''].map(h => (
                                            <th key={h} className={Z.th} style={{ fontSize: 11 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...colaboradores].sort((a, b) => (b.ativo === false ? 0 : 1) - (a.ativo === false ? 0 : 1) || a.nome.localeCompare(b.nome)).map((c, i) => (
                                        <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', opacity: c.ativo === false ? 0.55 : 1 }}>
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nome}</div>
                                            </td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                                                {c.funcao || '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, color: '#8b5cf6' }}>
                                                {c.valor_hora ? R$(c.valor_hora) : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                                                {c.telefone ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {c.telefone}</span> : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                                                    background: c.ativo === false ? '#fef2f2' : '#f0fdf4',
                                                    color: c.ativo === false ? '#ef4444' : '#22c55e',
                                                    border: `1px solid ${c.ativo === false ? '#ef444430' : '#22c55e30'}`,
                                                }}>{c.ativo === false ? 'Inativo' : 'Ativo'}</span>
                                            </td>
                                            <td style={{ padding: '10px 14px' }}>
                                                {isGerente && (
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        <button onClick={() => setColabForm({ id: c.id, nome: c.nome, funcao: c.funcao || '', valor_hora: c.valor_hora || '', telefone: c.telefone || '' })}
                                                            className={Z.btn2} title="Editar" style={{ padding: '4px 8px', fontSize: 12 }}>
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <button onClick={async () => {
                                                            try {
                                                                await api.del(`/recursos/colaboradores/${c.id}`);
                                                                loadColaboradores();
                                                                loadDashMO();
                                                                notify(c.ativo === false ? 'Colaborador reativado' : 'Colaborador desativado');
                                                            } catch { }
                                                        }} className={Z.btn2} title={c.ativo === false ? 'Reativar' : 'Desativar'}
                                                            style={{ padding: '4px 8px', fontSize: 12, color: c.ativo === false ? '#22c55e' : '#ef4444' }}>
                                                            {c.ativo === false ? <CheckCircle2 size={13} /> : <Trash2 size={13} />}
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
