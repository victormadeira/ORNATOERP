import { useState, useEffect, useCallback, useRef } from 'react';
import {
    DollarSign, Plus, Trash2, AlertTriangle, Clock, Check, Search,
    Building2, Filter, X, Repeat, Paperclip, FileText, Image, Upload,
    Eye, RefreshCw, TrendingUp, TrendingDown, Copy, ChevronRight,
    BarChart2, Archive, Receipt, ArrowDownCircle, ArrowUpCircle,
} from 'lucide-react';
import { R$ } from '../engine';
import { Z, Modal } from '../ui';
import api from '../api';

// ─── Constantes ─────────────────────────────────────────────────────
const CATEGORIAS = [
    { id: 'material',    label: 'Material',    color: '#3b82f6' },
    { id: 'mao_de_obra', label: 'Mão de Obra', color: '#8b5cf6' },
    { id: 'aluguel',     label: 'Aluguel',     color: '#06b6d4' },
    { id: 'energia',     label: 'Energia',     color: '#eab308' },
    { id: 'agua',        label: 'Água',        color: '#0ea5e9' },
    { id: 'internet',    label: 'Internet',    color: '#6366f1' },
    { id: 'telefone',    label: 'Telefone',    color: '#a855f7' },
    { id: 'impostos',    label: 'Impostos',    color: '#ef4444' },
    { id: 'manutencao',  label: 'Manutenção',  color: '#f97316' },
    { id: 'transporte',  label: 'Transporte',  color: '#f59e0b' },
    { id: 'ferramentas', label: 'Ferramentas', color: '#14b8a6' },
    { id: 'terceirizado',label: 'Terceirizado',color: '#ec4899' },
    { id: 'marketing',   label: 'Marketing',   color: '#8b5cf6' },
    { id: 'software',    label: 'Software',    color: '#6366f1' },
    { id: 'outros',      label: 'Outros',      color: '#94a3b8' },
];
const catMap = {};
CATEGORIAS.forEach(c => { catMap[c.id] = c; });

const MEIOS = ['PIX', 'Boleto', 'TED', 'Transferência', 'Cartão Crédito', 'Cartão Débito', 'Dinheiro', 'Cheque'];
const FREQUENCIAS = [
    { id: 'semanal',    label: 'Semanal' },
    { id: 'quinzenal',  label: 'Quinzenal' },
    { id: 'mensal',     label: 'Mensal' },
    { id: 'bimestral',  label: 'Bimestral' },
    { id: 'trimestral', label: 'Trimestral' },
    { id: 'anual',      label: 'Anual' },
];

const dtFmt  = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const mesFmt = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m) - 1]}/${y.slice(2)}`;
};

// tipoIntervalo: 'mensal' | 'dias'
// intervaloDias: número de dias entre parcelas (usado quando tipoIntervalo === 'dias')
function gerarParcelas(valorTotal, numParcelas, primeiraData, tipoIntervalo = 'mensal', intervaloDias = 30) {
    const vp = Math.round((valorTotal / numParcelas) * 100) / 100;
    return Array.from({ length: numParcelas }, (_, i) => {
        const d = new Date(primeiraData + 'T12:00:00');
        if (tipoIntervalo === 'dias') {
            d.setDate(d.getDate() + intervaloDias * i);
        } else {
            d.setMonth(d.getMonth() + i);
        }
        return {
            valor: i < numParcelas - 1 ? vp : Math.round((valorTotal - vp * (numParcelas - 1)) * 100) / 100,
            data_vencimento: d.toISOString().slice(0, 10),
        };
    });
}

function StatusBadge({ st }) {
    const Icon = st.icon;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>
            <Icon size={10} />{st.label}
        </span>
    );
}

function getStatusPagar(cp) {
    if (cp.status === 'pago') return { label: 'Pago',    color: '#22c55e', bg: '#f0fdf4', icon: Check };
    if (cp.vencida || (cp.data_vencimento && cp.data_vencimento < new Date().toISOString().slice(0, 10)))
        return { label: 'Vencida', color: '#ef4444', bg: '#fef2f2', icon: AlertTriangle };
    if (cp.data_vencimento) {
        const dias = Math.ceil((new Date(cp.data_vencimento + 'T12:00:00') - new Date()) / 86400000);
        if (dias <= 7) return { label: `${dias}d`, color: '#f59e0b', bg: '#fffbeb', icon: Clock };
    }
    return { label: 'Pendente', color: '#6b7280', bg: '#f9fafb', icon: Clock };
}

function getStatusReceber(cr) {
    if (cr.status === 'pago') return { label: 'Recebido', color: '#22c55e', bg: '#f0fdf4', icon: Check };
    if (cr.vencida || (cr.data_vencimento && cr.data_vencimento < new Date().toISOString().slice(0, 10)))
        return { label: 'Vencida', color: '#ef4444', bg: '#fef2f2', icon: AlertTriangle };
    if (cr.data_vencimento) {
        const dias = Math.ceil((new Date(cr.data_vencimento + 'T12:00:00') - new Date()) / 86400000);
        if (dias <= 7) return { label: `${dias}d`, color: '#f59e0b', bg: '#fffbeb', icon: Clock };
    }
    return { label: 'Pendente', color: '#6b7280', bg: '#f9fafb', icon: Clock };
}

// ─── Cards de resumo ────────────────────────────────────────────────
function ResumoCard({ label, valor, color, sub }) {
    return (
        <div className={Z.card} style={{ padding: '14px 16px', borderLeft: `4px solid ${color}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{R$(valor)}</div>
            {sub && <div style={{ fontSize: 10, color, marginTop: 1 }}>{sub}</div>}
        </div>
    );
}

// ─── Tabela de Parcelas (Preview) ───────────────────────────────────
function PreviewParcelas({ parcelas, setParcelas, valorTotal }) {
    if (!parcelas.length) return null;
    const soma = parcelas.reduce((s, p) => s + (p.valor || 0), 0);
    return (
        <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                Preview: {parcelas.length} parcelas (edite valores/datas)
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {parcelas.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <span style={{ width: 48, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}/{parcelas.length}</span>
                        <input className={Z.inp} type="number" step="0.01" value={p.valor} style={{ width: 100, fontSize: 12 }}
                            onChange={e => {
                                const np = [...parcelas];
                                np[i] = { ...np[i], valor: parseFloat(e.target.value) || 0 };
                                setParcelas(np);
                            }} />
                        <input className={Z.inp} type="date" value={p.data_vencimento} style={{ width: 140, fontSize: 12 }}
                            onChange={e => {
                                const np = [...parcelas];
                                np[i] = { ...np[i], data_vencimento: e.target.value };
                                setParcelas(np);
                            }} />
                    </div>
                ))}
            </div>
            <div style={{ padding: '6px 12px', background: 'var(--bg-secondary)', fontSize: 11, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                <span>Soma: {R$(soma)}</span>
                {Math.abs(soma - (valorTotal || 0)) > 0.02 && <span style={{ color: '#ef4444' }}>Diferença do total!</span>}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO: CONTAS A PAGAR
// ═══════════════════════════════════════════════════════════════
function SecaoPagar({ notify, projetos }) {
    const [contas, setContas]     = useState([]);
    const [resumo, setResumo]     = useState(null);
    const [loading, setLoading]   = useState(true);
    const [aba, setAba]           = useState('pendentes');
    const [fCategoria, setFCat]   = useState('');
    const [fProjeto, setFProj]    = useState('');
    const [fBusca, setFBusca]     = useState('');
    const [showForm, setShowForm] = useState(false);
    const emptyForm = { descricao: '', valor: '', data_vencimento: '', categoria: 'outros', fornecedor: '', meio_pagamento: '', codigo_barras: '', projeto_id: '', observacao: '', nf_numero: '', nf_chave: '', recorrente: false, frequencia: 'mensal', parcelado: false, num_parcelas: 2, tipo_intervalo: 'mensal', intervalo_dias: 30 };
    const [form, setForm]         = useState(emptyForm);
    const [parcelas, setParcelas] = useState([]);
    const [anexoModal, setAnexoModal] = useState(null);
    const [anexos, setAnexos]     = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);

    const load = useCallback(() => {
        const p = new URLSearchParams({ status: aba === 'pagos' ? 'pago' : 'pendente' });
        if (fCategoria) p.append('categoria', fCategoria);
        if (fProjeto)   p.append('projeto_id', fProjeto);
        setLoading(true);
        api.get(`/financeiro/pagar?${p}`).then(setContas).catch(() => setContas([])).finally(() => setLoading(false));
        api.get('/financeiro/pagar/resumo').then(setResumo).catch(() => {});
    }, [aba, fCategoria, fProjeto]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (form.parcelado && form.valor && form.num_parcelas > 1 && form.data_vencimento)
            setParcelas(gerarParcelas(parseFloat(form.valor), parseInt(form.num_parcelas), form.data_vencimento, form.tipo_intervalo, parseInt(form.intervalo_dias) || 30));
        else setParcelas([]);
    }, [form.parcelado, form.valor, form.num_parcelas, form.data_vencimento, form.tipo_intervalo, form.intervalo_dias]);

    const addConta = () => {
        if (!form.descricao || !form.valor) return notify('Preencha descrição e valor');
        if (form.parcelado && parcelas.length > 1) {
            api.post('/financeiro/pagar/parcelado', {
                descricao: form.descricao, parcelas,
                categoria: form.categoria, fornecedor: form.fornecedor,
                meio_pagamento: form.meio_pagamento, codigo_barras: form.codigo_barras,
                projeto_id: form.projeto_id ? parseInt(form.projeto_id) : null,
                observacao: form.observacao, nf_numero: form.nf_numero, nf_chave: form.nf_chave,
            }).then(() => { load(); setShowForm(false); setForm(emptyForm); setParcelas([]); notify(`${parcelas.length} parcelas criadas`); })
              .catch(e => notify(e.error || 'Erro'));
        } else {
            api.post('/financeiro/pagar', {
                ...form, valor: parseFloat(form.valor),
                projeto_id: form.projeto_id ? parseInt(form.projeto_id) : null,
                recorrente: form.recorrente ? 1 : 0,
                frequencia: form.recorrente ? form.frequencia : '',
            }).then(() => { load(); setShowForm(false); setForm(emptyForm); notify('Conta registrada'); })
              .catch(e => notify(e.error || 'Erro'));
        }
    };

    const togglePago = (cp) => {
        const novoStatus = cp.status === 'pago' ? 'pendente' : 'pago';
        api.put(`/financeiro/pagar/${cp.id}`, {
            descricao: cp.descricao, valor: cp.valor, data_vencimento: cp.data_vencimento,
            status: novoStatus, data_pagamento: novoStatus === 'pago' ? new Date().toISOString().slice(0, 10) : null,
            categoria: cp.categoria, fornecedor: cp.fornecedor || '', meio_pagamento: cp.meio_pagamento || '',
            codigo_barras: cp.codigo_barras || '', projeto_id: cp.projeto_id || null,
            observacao: cp.observacao || '', nf_numero: cp.nf_numero || '', nf_chave: cp.nf_chave || '',
        }).then(() => { load(); notify(novoStatus === 'pago' ? 'Marcada como paga!' : 'Reaberta'); })
          .catch(e => notify(e.error || 'Erro'));
    };

    const delConta = (id) => {
        if (!window.confirm('Excluir esta conta?')) return;
        api.del(`/financeiro/pagar/${id}`).then(() => { load(); notify('Excluída'); }).catch(e => notify(e.error || 'Erro'));
    };

    const openAnexos = (id) => {
        setAnexoModal(id);
        api.get(`/financeiro/pagar/${id}/anexos`).then(setAnexos).catch(() => setAnexos([]));
    };

    const uploadAnexo = (e) => {
        const file = e.target.files?.[0];
        if (!file || !anexoModal) return;
        setUploading(true);
        const reader = new FileReader();
        reader.onload = () => {
            const tipo = file.name.toLowerCase().includes('nf') || file.name.toLowerCase().includes('nota') ? 'nota_fiscal'
                : file.type.includes('pdf') ? 'boleto' : 'comprovante';
            api.post(`/financeiro/pagar/${anexoModal}/anexos`, { arquivo: reader.result, nome: file.name, tipo })
               .then(() => { api.get(`/financeiro/pagar/${anexoModal}/anexos`).then(setAnexos); load(); notify('Anexo enviado'); })
               .catch(e => notify(e.error || 'Erro upload'))
               .finally(() => setUploading(false));
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const delAnexo = (id) => {
        if (!window.confirm('Excluir anexo?')) return;
        api.del(`/financeiro/pagar/anexos/${id}`).then(() => { setAnexos(prev => prev.filter(a => a.id !== id)); load(); notify('Anexo excluído'); });
    };

    const copiarCodigo = (texto) => {
        navigator.clipboard.writeText(texto).then(() => notify('Código copiado!'));
    };

    const filtradas = contas.filter(c => {
        if (!fBusca) return true;
        const b = fBusca.toLowerCase();
        return (c.descricao || '').toLowerCase().includes(b)
            || (c.fornecedor || '').toLowerCase().includes(b)
            || (c.projeto_nome || '').toLowerCase().includes(b)
            || (c.nf_numero || '').toLowerCase().includes(b)
            || (c.codigo_barras || '').includes(b);
    });

    const isImg = (n) => /\.(jpg|jpeg|png|gif|webp)$/i.test(n);

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Despesas, boletos e obrigações da empresa</div>
                <button onClick={() => setShowForm(!showForm)} className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Plus size={14} /> Nova Conta
                </button>
            </div>

            {/* Resumo */}
            {resumo && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <ResumoCard label="Pendente"   valor={resumo.pendente}     color="#3b82f6" />
                    <ResumoCard label="Vencido"    valor={resumo.vencido}      color="#ef4444" sub={resumo.qtd_vencidas > 0 ? `${resumo.qtd_vencidas} conta(s)` : null} />
                    <ResumoCard label="Vence 7d"   valor={resumo.vencer_7d || 0} color="#f59e0b" sub={resumo.qtd_vencer_7d > 0 ? `${resumo.qtd_vencer_7d} conta(s)` : null} />
                    <ResumoCard label="Pago (mês)" valor={resumo.pago_mes || 0} color="#22c55e" />
                </div>
            )}

            {/* Formulário */}
            {showForm && (
                <div className={Z.card} style={{ padding: 20, marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Nova Conta a Pagar</div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.parcelado} onChange={e => setForm({ ...form, parcelado: e.target.checked, recorrente: false })} />
                            <span style={{ fontWeight: 500 }}>Parcelado</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.recorrente} onChange={e => setForm({ ...form, recorrente: e.target.checked, parcelado: false })} />
                            <Repeat size={12} /><span style={{ fontWeight: 500 }}>Recorrente</span>
                        </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                        <div><label className={Z.lbl}>Descrição *</label>
                            <input className={Z.inp} placeholder="Ex: Aluguel galpão" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
                        <div><label className={Z.lbl}>{form.parcelado ? 'Valor Total *' : 'Valor *'}</label>
                            <input className={Z.inp} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} /></div>
                        <div><label className={Z.lbl}>{form.parcelado ? '1º Vencimento *' : 'Vencimento'}</label>
                            <input className={Z.inp} type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} /></div>
                        {form.parcelado && <div><label className={Z.lbl}>Nº Parcelas</label>
                            <input className={Z.inp} type="number" min="2" max="60" value={form.num_parcelas} onChange={e => setForm({ ...form, num_parcelas: parseInt(e.target.value) || 2 })} /></div>}
                        {form.parcelado && (
                            <div><label className={Z.lbl}>Intervalo entre Parcelas</label>
                                <select className={Z.inp} value={form.tipo_intervalo} onChange={e => setForm({ ...form, tipo_intervalo: e.target.value })}>
                                    <option value="mensal">Mensal (mês a mês)</option>
                                    <option value="dias">Por dias fixos</option>
                                </select>
                            </div>
                        )}
                        {form.parcelado && form.tipo_intervalo === 'dias' && (
                            <div><label className={Z.lbl}>Dias entre Parcelas</label>
                                <input className={Z.inp} type="number" min="1" max="365" value={form.intervalo_dias}
                                    onChange={e => setForm({ ...form, intervalo_dias: parseInt(e.target.value) || 30 })}
                                    placeholder="Ex: 24 → vence em 24, 48, 72 dias..." />
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                                    {form.data_vencimento && form.num_parcelas > 1 && (() => {
                                        const d = new Date(form.data_vencimento + 'T12:00:00');
                                        const ultima = new Date(form.data_vencimento + 'T12:00:00');
                                        ultima.setDate(ultima.getDate() + (parseInt(form.intervalo_dias) || 30) * (parseInt(form.num_parcelas) - 1));
                                        return `1ª: ${dtFmt(d.toISOString().slice(0,10))} · última: ${dtFmt(ultima.toISOString().slice(0,10))}`;
                                    })()}
                                </div>
                            </div>
                        )}
                        {form.recorrente && <div><label className={Z.lbl}>Frequência</label>
                            <select className={Z.inp} value={form.frequencia} onChange={e => setForm({ ...form, frequencia: e.target.value })}>
                                {FREQUENCIAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>}
                        <div><label className={Z.lbl}>Categoria</label>
                            <select className={Z.inp} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                                {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
                        <div><label className={Z.lbl}>Fornecedor</label>
                            <input className={Z.inp} placeholder="Nome do fornecedor" value={form.fornecedor} onChange={e => setForm({ ...form, fornecedor: e.target.value })} /></div>
                        <div><label className={Z.lbl}>Meio Pagamento</label>
                            <select className={Z.inp} value={form.meio_pagamento} onChange={e => setForm({ ...form, meio_pagamento: e.target.value })}>
                                <option value="">Selecionar...</option>
                                {MEIOS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                        <div><label className={Z.lbl}>Projeto (opcional)</label>
                            <select className={Z.inp} value={form.projeto_id} onChange={e => setForm({ ...form, projeto_id: e.target.value })}>
                                <option value="">Nenhum (geral)</option>
                                {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                        <div><label className={Z.lbl}>Cód. Barras / Boleto</label>
                            <input className={Z.inp} placeholder="Linha digitável" value={form.codigo_barras} onChange={e => setForm({ ...form, codigo_barras: e.target.value })} /></div>
                        <div><label className={Z.lbl}>Nº NF</label>
                            <input className={Z.inp} placeholder="Número da nota" value={form.nf_numero} onChange={e => setForm({ ...form, nf_numero: e.target.value })} /></div>
                        <div><label className={Z.lbl}>Chave NFe (44 dígitos)</label>
                            <input className={Z.inp} placeholder="44 dígitos" value={form.nf_chave} onChange={e => setForm({ ...form, nf_chave: e.target.value })} /></div>
                        <div><label className={Z.lbl}>Observação</label>
                            <input className={Z.inp} placeholder="Opcional" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} /></div>
                    </div>
                    <PreviewParcelas parcelas={parcelas} setParcelas={setParcelas} valorTotal={parseFloat(form.valor) || 0} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                        <button className={Z.btn2} onClick={() => { setShowForm(false); setForm(emptyForm); setParcelas([]); }}>Cancelar</button>
                        <button className={Z.btn} onClick={addConta}>
                            {form.parcelado && parcelas.length > 1 ? `Gerar ${parcelas.length} Parcelas` : 'Salvar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Aba Toggle */}
            <div style={{ display: 'flex', marginBottom: 12 }}>
                {['pendentes', 'pagos'].map((t, i) => (
                    <button key={t} onClick={() => setAba(t)} style={{
                        padding: '8px 20px', fontSize: 12, fontWeight: 600,
                        border: '1px solid var(--border)',
                        background: aba === t ? 'var(--primary)' : 'var(--bg-card)',
                        color: aba === t ? '#fff' : 'var(--text-secondary)',
                        borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0', cursor: 'pointer',
                    }}>
                        {t === 'pendentes' ? 'Pendentes' : 'Pagos / Arquivo'}
                    </button>
                ))}
            </div>

            {/* Filtros */}
            <div className={Z.card} style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <select className={Z.inp} style={{ width: 140, fontSize: 11 }} value={fCategoria} onChange={e => setFCat(e.target.value)}>
                    <option value="">Todas categorias</option>
                    {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select className={Z.inp} style={{ width: 160, fontSize: 11 }} value={fProjeto} onChange={e => setFProj(e.target.value)}>
                    <option value="">Todos projetos</option>
                    <option value="0">Geral (sem projeto)</option>
                    {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <div style={{ position: 'relative', flex: 1, minWidth: 150 }}>
                    <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className={Z.inp} style={{ paddingLeft: 28, fontSize: 11, width: '100%' }}
                        placeholder="Buscar..." value={fBusca} onChange={e => setFBusca(e.target.value)} />
                </div>
                {(fCategoria || fProjeto || fBusca) && (
                    <button onClick={() => { setFCat(''); setFProj(''); setFBusca(''); }}
                        style={{ fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <X size={11} /> Limpar
                    </button>
                )}
            </div>

            {/* Tabela */}
            <div className={Z.card} style={{ overflow: 'hidden' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
                : filtradas.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma conta encontrada.</div>
                : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    {['Status', 'Descrição', 'Fornecedor', 'Cat.', 'Projeto', 'Valor', 'Venc.', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '7px 6px', textAlign: i === 5 ? 'right' : i >= 6 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(cp => {
                                    const st  = getStatusPagar(cp);
                                    const cat = catMap[cp.categoria];
                                    const isPago = cp.status === 'pago';
                                    return (
                                        <tr key={cp.id} style={{ borderBottom: '1px solid var(--border)', opacity: isPago ? 0.65 : 1, background: !isPago && st.color === '#ef4444' ? '#fef2f218' : 'transparent' }}>
                                            <td style={{ padding: '7px 6px' }}><StatusBadge st={st} /></td>
                                            <td style={{ padding: '7px 6px' }}>
                                                <div style={{ fontWeight: isPago ? 400 : 600, textDecoration: isPago ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                    {cp.descricao}
                                                    {cp.parcela_total > 0 && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: '#dbeafe', color: '#2563eb', fontWeight: 600 }}>{cp.parcela_num}/{cp.parcela_total}</span>}
                                                    {cp.recorrente === 1 && <Repeat size={11} style={{ color: '#8b5cf6' }} />}
                                                    {(cp.anexos_count || 0) > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9, color: 'var(--text-muted)' }}><Paperclip size={9} />{cp.anexos_count}</span>}
                                                </div>
                                                {cp.nf_numero && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>NF: {cp.nf_numero}</div>}
                                                {cp.codigo_barras && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                                        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cp.codigo_barras}</span>
                                                        <button onClick={() => copiarCodigo(cp.codigo_barras)} title="Copiar código" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, display: 'flex' }}><Copy size={10} /></button>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '7px 6px', color: 'var(--text-secondary)', fontSize: 11 }}>{cp.fornecedor || '—'}</td>
                                            <td style={{ padding: '7px 6px' }}>
                                                {cat ? <span style={{ fontSize: 9, fontWeight: 600, color: cat.color, background: cat.color + '18', padding: '2px 5px', borderRadius: 5, whiteSpace: 'nowrap' }}>{cat.label}</span>
                                                      : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cp.categoria}</span>}
                                            </td>
                                            <td style={{ padding: '7px 6px', fontSize: 11, color: cp.projeto_nome ? 'var(--primary)' : 'var(--text-muted)' }}>{cp.projeto_nome || '—'}</td>
                                            <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: isPago ? '#22c55e' : st.color === '#ef4444' ? '#ef4444' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{R$(cp.valor)}</td>
                                            <td style={{ padding: '7px 6px', textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                {dtFmt(cp.data_vencimento)}
                                                {isPago && cp.data_pagamento && <div style={{ fontSize: 9, color: '#22c55e' }}>Pago {dtFmt(cp.data_pagamento)}</div>}
                                            </td>
                                            <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
                                                    <button onClick={() => togglePago(cp)} title={isPago ? 'Reabrir' : 'Marcar pago'}
                                                        style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${isPago ? '#22c55e' : '#d1d5db'}`, background: isPago ? '#22c55e' : 'transparent', color: isPago ? '#fff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                                        <Check size={11} />
                                                    </button>
                                                    <button onClick={() => openAnexos(cp.id)} title="Anexos"
                                                        style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Paperclip size={11} />
                                                    </button>
                                                    <button onClick={() => delConta(cp.id)} title="Excluir"
                                                        style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                                                        <Trash2 size={11} />
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

            {/* Resumo por Categoria */}
            {aba === 'pendentes' && resumo?.por_categoria?.length > 0 && (
                <div className={Z.card} style={{ padding: 18, marginTop: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={14} style={{ color: 'var(--text-muted)' }} /> Pendente por Categoria
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {resumo.por_categoria.map(pc => {
                            const cat = catMap[pc.categoria];
                            const pct = resumo.pendente > 0 ? (pc.total / resumo.pendente) * 100 : 0;
                            return (
                                <div key={pc.categoria} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ width: 90, fontSize: 11, fontWeight: 500, color: cat?.color || 'var(--text-secondary)' }}>{cat?.label || pc.categoria}</span>
                                    <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--border)' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: cat?.color || '#94a3b8', transition: 'width 0.3s' }} />
                                    </div>
                                    <span style={{ width: 85, textAlign: 'right', fontSize: 11, fontWeight: 600 }}>{R$(pc.total)}</span>
                                    <span style={{ width: 25, textAlign: 'right', fontSize: 10, color: 'var(--text-muted)' }}>{pc.qtd}x</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Modal Anexos */}
            {anexoModal && (
                <Modal onClose={() => setAnexoModal(null)} title="Anexos da Conta">
                    <div style={{ minWidth: 350, maxWidth: 500 }}>
                        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={uploadAnexo} style={{ display: 'none' }} />
                        <button className={Z.btn} onClick={() => fileRef.current?.click()} disabled={uploading}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 12, width: '100%', justifyContent: 'center' }}>
                            {uploading ? <><RefreshCw size={13} className="animate-spin" /> Enviando...</> : <><Upload size={13} /> Anexar Documento</>}
                        </button>
                        {anexos.length === 0
                            ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Nenhum anexo</div>
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {anexos.map(a => (
                                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                        {isImg(a.filename) ? <Image size={18} style={{ color: '#3b82f6' }} /> : <FileText size={18} style={{ color: '#ef4444' }} />}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.tipo} · {(a.tamanho / 1024).toFixed(0)}KB · {dtFmt(a.criado_em?.slice(0, 10))}</div>
                                        </div>
                                        <a href={`/api/financeiro/pagar/anexo/${anexoModal}/${a.filename}`} target="_blank" rel="noreferrer"
                                            style={{ color: 'var(--primary)', display: 'flex' }} title="Abrir"><Eye size={15} /></a>
                                        <button onClick={() => delAnexo(a.id)}
                                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', opacity: 0.6 }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                            onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        }
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO: CONTAS A RECEBER
// ═══════════════════════════════════════════════════════════════
function SecaoReceber({ notify, projetos }) {
    const [contas, setContas]     = useState([]);
    const [resumo, setResumo]     = useState(null);
    const [loading, setLoading]   = useState(true);
    const [aba, setAba]           = useState('pendentes');
    const [fProjeto, setFProj]    = useState('');
    const [fBusca, setFBusca]     = useState('');
    const [showForm, setShowForm] = useState(false);
    const emptyForm = { descricao: '', valor: '', data_vencimento: '', meio_pagamento: '', codigo_barras: '', nf_numero: '', observacao: '', projeto_id: '', parcelado: false, num_parcelas: 2, tipo_intervalo: 'mensal', intervalo_dias: 30 };
    const [form, setForm]         = useState(emptyForm);
    const [parcelas, setParcelas] = useState([]);

    const load = useCallback(() => {
        const p = new URLSearchParams({ status: aba === 'pagos' ? 'pago' : 'pendente' });
        if (fProjeto) p.append('projeto_id', fProjeto);
        setLoading(true);
        api.get(`/financeiro/receber?${p}`).then(setContas).catch(() => setContas([])).finally(() => setLoading(false));
        api.get('/financeiro/receber/resumo').then(setResumo).catch(() => {});
    }, [aba, fProjeto]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (form.parcelado && form.valor && form.num_parcelas > 1 && form.data_vencimento)
            setParcelas(gerarParcelas(parseFloat(form.valor), parseInt(form.num_parcelas), form.data_vencimento, form.tipo_intervalo, parseInt(form.intervalo_dias) || 30));
        else setParcelas([]);
    }, [form.parcelado, form.valor, form.num_parcelas, form.data_vencimento, form.tipo_intervalo, form.intervalo_dias]);

    const addConta = () => {
        if (!form.descricao || !form.valor || !form.projeto_id) return notify('Preencha descrição, valor e projeto');
        if (form.parcelado && parcelas.length > 1) {
            api.post('/financeiro/receber/parcelado', {
                descricao: form.descricao, parcelas,
                projeto_id: parseInt(form.projeto_id),
                meio_pagamento: form.meio_pagamento,
                nf_numero: form.nf_numero, observacao: form.observacao,
            }).then(() => { load(); setShowForm(false); setForm(emptyForm); setParcelas([]); notify(`${parcelas.length} parcelas criadas`); })
              .catch(e => notify(e.error || 'Erro'));
        } else {
            api.post('/financeiro/receber', {
                ...form, valor: parseFloat(form.valor),
                projeto_id: parseInt(form.projeto_id),
            }).then(() => { load(); setShowForm(false); setForm(emptyForm); notify('Conta registrada'); })
              .catch(e => notify(e.error || 'Erro'));
        }
    };

    const toggleRecebido = (cr) => {
        const novoStatus = cr.status === 'pago' ? 'pendente' : 'pago';
        api.put(`/financeiro/receber/${cr.id}`, {
            descricao: cr.descricao, valor: cr.valor, data_vencimento: cr.data_vencimento,
            status: novoStatus, data_pagamento: novoStatus === 'pago' ? new Date().toISOString().slice(0, 10) : null,
            meio_pagamento: cr.meio_pagamento || '', observacao: cr.observacao || '',
        }).then(() => { load(); notify(novoStatus === 'pago' ? 'Recebimento registrado!' : 'Reaberto'); })
          .catch(e => notify(e.error || 'Erro'));
    };

    const delConta = (id) => {
        if (!window.confirm('Excluir esta conta?')) return;
        api.del(`/financeiro/receber/${id}`).then(() => { load(); notify('Excluída'); }).catch(e => notify(e.error || 'Erro'));
    };

    const copiarCodigo = (texto) => navigator.clipboard.writeText(texto).then(() => notify('Código copiado!'));

    const filtradas = contas.filter(c => {
        if (!fBusca) return true;
        const b = fBusca.toLowerCase();
        return (c.descricao || '').toLowerCase().includes(b)
            || (c.projeto_nome || '').toLowerCase().includes(b)
            || (c.meio_pagamento || '').toLowerCase().includes(b);
    });

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Recebimentos de todos os projetos</div>
                <button onClick={() => setShowForm(!showForm)} className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <Plus size={14} /> Novo Recebimento
                </button>
            </div>

            {resumo && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <ResumoCard label="A Receber"      valor={resumo.pendente}      color="#3b82f6" />
                    <ResumoCard label="Vencido"        valor={resumo.vencido}       color="#ef4444" sub={resumo.qtd_vencidas > 0 ? `${resumo.qtd_vencidas} conta(s)` : null} />
                    <ResumoCard label="Recebido (mês)" valor={resumo.recebido_mes || 0} color="#22c55e" />
                    <ResumoCard label="Total Recebido" valor={resumo.recebido || 0} color="#8b5cf6" />
                </div>
            )}

            {showForm && (
                <div className={Z.card} style={{ padding: 20, marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Novo Recebimento</div>
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.parcelado} onChange={e => setForm({ ...form, parcelado: e.target.checked })} />
                            <span style={{ fontWeight: 500 }}>Parcelado</span>
                        </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                        <div><label className={Z.lbl}>Projeto *</label>
                            <select className={Z.inp} value={form.projeto_id} onChange={e => setForm({ ...form, projeto_id: e.target.value })}>
                                <option value="">Selecionar projeto...</option>
                                {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                        <div><label className={Z.lbl}>Descrição *</label>
                            <input className={Z.inp} placeholder="Ex: Entrada 50%" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
                        <div><label className={Z.lbl}>{form.parcelado ? 'Valor Total *' : 'Valor *'}</label>
                            <input className={Z.inp} type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} /></div>
                        <div><label className={Z.lbl}>{form.parcelado ? '1º Vencimento' : 'Vencimento'}</label>
                            <input className={Z.inp} type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} /></div>
                        {form.parcelado && <div><label className={Z.lbl}>Nº Parcelas</label>
                            <input className={Z.inp} type="number" min="2" max="60" value={form.num_parcelas} onChange={e => setForm({ ...form, num_parcelas: parseInt(e.target.value) || 2 })} /></div>}
                        {form.parcelado && (
                            <div><label className={Z.lbl}>Intervalo entre Parcelas</label>
                                <select className={Z.inp} value={form.tipo_intervalo} onChange={e => setForm({ ...form, tipo_intervalo: e.target.value })}>
                                    <option value="mensal">Mensal (mês a mês)</option>
                                    <option value="dias">Por dias fixos</option>
                                </select>
                            </div>
                        )}
                        {form.parcelado && form.tipo_intervalo === 'dias' && (
                            <div><label className={Z.lbl}>Dias entre Parcelas</label>
                                <input className={Z.inp} type="number" min="1" max="365" value={form.intervalo_dias}
                                    onChange={e => setForm({ ...form, intervalo_dias: parseInt(e.target.value) || 30 })}
                                    placeholder="Ex: 24 → vence em 24, 48, 72 dias..." />
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                                    {form.data_vencimento && form.num_parcelas > 1 && (() => {
                                        const d = new Date(form.data_vencimento + 'T12:00:00');
                                        const ultima = new Date(form.data_vencimento + 'T12:00:00');
                                        ultima.setDate(ultima.getDate() + (parseInt(form.intervalo_dias) || 30) * (parseInt(form.num_parcelas) - 1));
                                        return `1ª: ${dtFmt(d.toISOString().slice(0,10))} · última: ${dtFmt(ultima.toISOString().slice(0,10))}`;
                                    })()}
                                </div>
                            </div>
                        )}
                        <div><label className={Z.lbl}>Meio de Recebimento</label>
                            <select className={Z.inp} value={form.meio_pagamento} onChange={e => setForm({ ...form, meio_pagamento: e.target.value })}>
                                <option value="">Selecionar...</option>
                                {MEIOS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                        <div><label className={Z.lbl}>Cód. Boleto (se houver)</label>
                            <input className={Z.inp} placeholder="Linha digitável" value={form.codigo_barras} onChange={e => setForm({ ...form, codigo_barras: e.target.value })} /></div>
                        <div><label className={Z.lbl}>Nº NF</label>
                            <input className={Z.inp} placeholder="Número da nota" value={form.nf_numero} onChange={e => setForm({ ...form, nf_numero: e.target.value })} /></div>
                        <div><label className={Z.lbl}>Observação</label>
                            <input className={Z.inp} placeholder="Opcional" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} /></div>
                    </div>
                    <PreviewParcelas parcelas={parcelas} setParcelas={setParcelas} valorTotal={parseFloat(form.valor) || 0} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                        <button className={Z.btn2} onClick={() => { setShowForm(false); setForm(emptyForm); setParcelas([]); }}>Cancelar</button>
                        <button className={Z.btn} onClick={addConta}>
                            {form.parcelado && parcelas.length > 1 ? `Gerar ${parcelas.length} Parcelas` : 'Salvar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Abas */}
            <div style={{ display: 'flex', marginBottom: 12 }}>
                {['pendentes', 'pagos'].map((t, i) => (
                    <button key={t} onClick={() => setAba(t)} style={{
                        padding: '8px 20px', fontSize: 12, fontWeight: 600,
                        border: '1px solid var(--border)',
                        background: aba === t ? '#22c55e' : 'var(--bg-card)',
                        color: aba === t ? '#fff' : 'var(--text-secondary)',
                        borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0', cursor: 'pointer',
                    }}>
                        {t === 'pendentes' ? 'Pendentes' : 'Recebidos'}
                    </button>
                ))}
            </div>

            {/* Filtros */}
            <div className={Z.card} style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <select className={Z.inp} style={{ width: 180, fontSize: 11 }} value={fProjeto} onChange={e => setFProj(e.target.value)}>
                    <option value="">Todos os projetos</option>
                    {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <div style={{ position: 'relative', flex: 1, minWidth: 150 }}>
                    <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className={Z.inp} style={{ paddingLeft: 28, fontSize: 11, width: '100%' }}
                        placeholder="Buscar..." value={fBusca} onChange={e => setFBusca(e.target.value)} />
                </div>
                {(fProjeto || fBusca) && (
                    <button onClick={() => { setFProj(''); setFBusca(''); }}
                        style={{ fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <X size={11} /> Limpar
                    </button>
                )}
            </div>

            {/* Tabela */}
            <div className={Z.card} style={{ overflow: 'hidden' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
                : filtradas.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum recebimento encontrado.</div>
                : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    {['Status', 'Descrição', 'Projeto', 'Meio', 'Valor', 'Venc.', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '7px 6px', textAlign: i === 4 ? 'right' : i >= 5 ? 'center' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(cr => {
                                    const st = getStatusReceber(cr);
                                    const isRecebido = cr.status === 'pago';
                                    return (
                                        <tr key={cr.id} style={{ borderBottom: '1px solid var(--border)', opacity: isRecebido ? 0.65 : 1, background: !isRecebido && st.color === '#ef4444' ? '#fef2f218' : 'transparent' }}>
                                            <td style={{ padding: '7px 6px' }}><StatusBadge st={st} /></td>
                                            <td style={{ padding: '7px 6px' }}>
                                                <div style={{ fontWeight: isRecebido ? 400 : 600, textDecoration: isRecebido ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {cr.descricao}
                                                    {cr.parcela_total > 0 && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>{cr.parcela_num}/{cr.parcela_total}</span>}
                                                    {cr.auto_gerada === 1 && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed', fontWeight: 500 }}>Auto</span>}
                                                </div>
                                                {cr.nf_numero && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>NF: {cr.nf_numero}</div>}
                                                {cr.codigo_barras && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                                        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cr.codigo_barras}</span>
                                                        <button onClick={() => copiarCodigo(cr.codigo_barras)} title="Copiar" style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, display: 'flex' }}><Copy size={10} /></button>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '7px 6px', fontSize: 11, color: 'var(--primary)' }}>{cr.projeto_nome || '—'}</td>
                                            <td style={{ padding: '7px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>{cr.meio_pagamento || '—'}</td>
                                            <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: isRecebido ? '#22c55e' : st.color === '#ef4444' ? '#ef4444' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{R$(cr.valor)}</td>
                                            <td style={{ padding: '7px 6px', textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                {dtFmt(cr.data_vencimento)}
                                                {isRecebido && cr.data_pagamento && <div style={{ fontSize: 9, color: '#22c55e' }}>Rec. {dtFmt(cr.data_pagamento)}</div>}
                                            </td>
                                            <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
                                                    <button onClick={() => toggleRecebido(cr)} title={isRecebido ? 'Reabrir' : 'Marcar recebido'}
                                                        style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${isRecebido ? '#22c55e' : '#d1d5db'}`, background: isRecebido ? '#22c55e' : 'transparent', color: isRecebido ? '#fff' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                                        <Check size={11} />
                                                    </button>
                                                    <button onClick={() => delConta(cr.id)} title="Excluir"
                                                        style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                                                        <Trash2 size={11} />
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
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO: ARQUIVO DE NOTAS FISCAIS
// ═══════════════════════════════════════════════════════════════
function SecaoNFs({ notify }) {
    const [nfs, setNfs]         = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca]     = useState('');
    const [dtIni, setDtIni]     = useState('');
    const [dtFim, setDtFim]     = useState('');
    const [copiada, setCopiada] = useState(null);

    const load = useCallback(() => {
        const p = new URLSearchParams();
        if (busca)  p.append('busca', busca);
        if (dtIni)  p.append('periodo_inicio', dtIni);
        if (dtFim)  p.append('periodo_fim', dtFim);
        setLoading(true);
        api.get(`/financeiro/nfs?${p}`).then(setNfs).catch(() => setNfs([])).finally(() => setLoading(false));
    }, [busca, dtIni, dtFim]);

    useEffect(() => {
        const t = setTimeout(load, 400);
        return () => clearTimeout(t);
    }, [load]);

    const copiarChave = (chave, id) => {
        navigator.clipboard.writeText(chave).then(() => {
            setCopiada(id);
            setTimeout(() => setCopiada(null), 2000);
            notify('Chave NFe copiada!');
        });
    };

    return (
        <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Notas fiscais arquivadas das contas a pagar — visualize, busque e baixe documentos
            </div>

            {/* Filtros */}
            <div className={Z.card} style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                    <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className={Z.inp} style={{ paddingLeft: 28, fontSize: 11, width: '100%' }}
                        placeholder="Buscar por NF, chave, fornecedor..." value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
                <input className={Z.inp} type="date" style={{ width: 140, fontSize: 11 }} value={dtIni} onChange={e => setDtIni(e.target.value)} placeholder="Data início" />
                <input className={Z.inp} type="date" style={{ width: 140, fontSize: 11 }} value={dtFim} onChange={e => setDtFim(e.target.value)} placeholder="Data fim" />
                {(busca || dtIni || dtFim) && (
                    <button onClick={() => { setBusca(''); setDtIni(''); setDtFim(''); }}
                        style={{ fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <X size={11} /> Limpar
                    </button>
                )}
            </div>

            {/* Contagem */}
            {!loading && nfs.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    {nfs.length} nota{nfs.length !== 1 ? 's' : ''} encontrada{nfs.length !== 1 ? 's' : ''}
                    {' · Total: '}<strong style={{ color: 'var(--text-primary)' }}>{R$(nfs.reduce((s, n) => s + n.valor, 0))}</strong>
                </div>
            )}

            {/* Grid de NFs */}
            <div className={Z.card} style={{ overflow: 'hidden' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
                : nfs.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>
                        <Archive size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 10px', display: 'block' }} />
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma nota fiscal arquivada encontrada.</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Cadastre contas a pagar com número de NF ou anexe documentos tipo "nota_fiscal".</div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    {['Nº NF', 'Descrição / Fornecedor', 'Projeto', 'Data', 'Valor', 'Status', 'Chave NFe', 'Anexos'].map((h, i) => (
                                        <th key={i} style={{ padding: '7px 8px', textAlign: i === 4 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {nfs.map(nf => {
                                    const st = getStatusPagar({ ...nf, vencida: nf.data_vencimento < new Date().toISOString().slice(0, 10) && nf.status !== 'pago' });
                                    return (
                                        <tr key={nf.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '8px 8px' }}>
                                                {nf.nf_numero
                                                    ? <span style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace', fontSize: 13 }}>{nf.nf_numero}</span>
                                                    : <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>Só arquivo</span>}
                                            </td>
                                            <td style={{ padding: '8px 8px' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{nf.descricao}</div>
                                                {nf.fornecedor && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{nf.fornecedor}</div>}
                                            </td>
                                            <td style={{ padding: '8px 8px', fontSize: 11, color: 'var(--primary)' }}>{nf.projeto_nome || '—'}</td>
                                            <td style={{ padding: '8px 8px', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{dtFmt(nf.data_vencimento)}</td>
                                            <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{R$(nf.valor)}</td>
                                            <td style={{ padding: '8px 8px' }}><StatusBadge st={st} /></td>
                                            <td style={{ padding: '8px 8px', maxWidth: 200 }}>
                                                {nf.nf_chave ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={nf.nf_chave}>{nf.nf_chave}</span>
                                                        <button onClick={() => copiarChave(nf.nf_chave, nf.id)} title="Copiar chave"
                                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: copiada === nf.id ? '#22c55e' : 'var(--primary)', padding: 0, display: 'flex', flexShrink: 0 }}>
                                                            {copiada === nf.id ? <Check size={12} /> : <Copy size={12} />}
                                                        </button>
                                                    </div>
                                                ) : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                                {nf.qtd_nf_anexos > 0
                                                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
                                                        <FileText size={12} />{nf.qtd_nf_anexos}
                                                      </span>
                                                    : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO: FLUXO DE CAIXA
// ═══════════════════════════════════════════════════════════════
function SecaoFluxo() {
    const [dados, setDados]     = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/financeiro/fluxo').then(setDados).catch(() => {}).finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>;
    if (!dados) return null;

    // Montar meses dos últimos 12 meses
    const meses = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        meses.push(d.toISOString().slice(0, 7)); // YYYY-MM
    }

    const entMap  = Object.fromEntries(dados.entradas.map(e => [e.mes, e.total]));
    const saiMap  = Object.fromEntries(dados.saidas.map(e => [e.mes, e.total]));

    const rows = meses.map(mes => ({
        mes,
        entradas: entMap[mes] || 0,
        saidas:   saiMap[mes] || 0,
        saldo:    (entMap[mes] || 0) - (saiMap[mes] || 0),
    }));

    const maxVal = Math.max(...rows.map(r => Math.max(r.entradas, r.saidas)), 1);

    // Próximos 3 meses previstos
    const prevMeses = [];
    for (let i = 0; i <= 2; i++) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() + i);
        prevMeses.push(d.toISOString().slice(0, 7));
    }
    const prevEntMap = Object.fromEntries(dados.entradas_previstas.map(e => [e.mes, e.total]));
    const prevSaiMap = Object.fromEntries(dados.saidas_previstas.map(e => [e.mes, e.total]));

    const totalEntradas = rows.reduce((s, r) => s + r.entradas, 0);
    const totalSaidas   = rows.reduce((s, r) => s + r.saidas, 0);
    const saldoTotal    = totalEntradas - totalSaidas;

    return (
        <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Entradas e saídas realizadas nos últimos 12 meses</div>

            {/* Cards totais */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
                <div className={Z.card} style={{ padding: '14px 16px', borderLeft: '4px solid #22c55e' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingUp size={11} /> Entradas (12m)
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e', marginTop: 2 }}>{R$(totalEntradas)}</div>
                </div>
                <div className={Z.card} style={{ padding: '14px 16px', borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingDown size={11} /> Saídas (12m)
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444', marginTop: 2 }}>{R$(totalSaidas)}</div>
                </div>
                <div className={Z.card} style={{ padding: '14px 16px', borderLeft: `4px solid ${saldoTotal >= 0 ? '#3b82f6' : '#f97316'}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Saldo Período</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: saldoTotal >= 0 ? '#3b82f6' : '#f97316', marginTop: 2 }}>{R$(saldoTotal)}</div>
                </div>
            </div>

            {/* Gráfico de barras */}
            <div className={Z.card} style={{ padding: '18px 14px', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart2 size={14} /> Histórico Mensal</span>
                    <div style={{ display: 'flex', gap: 14, fontSize: 10, fontWeight: 600 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} />Entradas</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />Saídas</span>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, minWidth: 600, paddingBottom: 28, position: 'relative' }}>
                        {/* Linhas de grade */}
                        {[0, 0.25, 0.5, 0.75, 1].map(p => (
                            <div key={p} style={{ position: 'absolute', left: 0, right: 0, bottom: `calc(${p * 100}% * 132/160 + 28px)`, borderTop: `1px dashed var(--border)`, pointerEvents: 'none' }}>
                                <span style={{ position: 'absolute', left: 0, top: -8, fontSize: 8, color: 'var(--text-muted)' }}>{R$(maxVal * p)}</span>
                            </div>
                        ))}
                        {rows.map(r => (
                            <div key={r.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}>
                                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 132 }}>
                                    <div title={`Entradas: ${R$(r.entradas)}`}
                                        style={{ width: 12, height: `${Math.max(2, (r.entradas / maxVal) * 132)}px`, background: '#22c55e', borderRadius: '3px 3px 0 0', transition: 'height 0.3s', cursor: 'default' }} />
                                    <div title={`Saídas: ${R$(r.saidas)}`}
                                        style={{ width: 12, height: `${Math.max(2, (r.saidas / maxVal) * 132)}px`, background: '#ef4444', borderRadius: '3px 3px 0 0', transition: 'height 0.3s', cursor: 'default' }} />
                                </div>
                                <div style={{ position: 'absolute', bottom: 0, fontSize: 9, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', transform: 'rotate(-30deg)', transformOrigin: 'top center', marginTop: 4 }}>
                                    {mesFmt(r.mes)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tabela resumo mensal */}
            <div className={Z.card} style={{ overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Detalhamento Mensal</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {['Mês', 'Entradas', 'Saídas', 'Saldo'].map((h, i) => (
                                    <th key={i} style={{ padding: '8px 12px', textAlign: i > 0 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.mes} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{mesFmt(r.mes)}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{r.entradas > 0 ? R$(r.entradas) : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{r.saidas > 0 ? R$(r.saidas) : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: r.saldo >= 0 ? '#3b82f6' : '#f97316' }}>{R$(r.saldo)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Previsão */}
            {(dados.entradas_previstas.length > 0 || dados.saidas_previstas.length > 0) && (
                <div className={Z.card} style={{ padding: 18 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={14} style={{ color: 'var(--text-muted)' }} /> Previsão Próximos 3 Meses
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {prevMeses.map(mes => {
                            const ent = prevEntMap[mes] || 0;
                            const sai = prevSaiMap[mes] || 0;
                            const sal = ent - sai;
                            return (
                                <div key={mes} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                    <span style={{ width: 60, fontWeight: 600, fontSize: 12 }}>{mesFmt(mes)}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#22c55e' }}>
                                        <ArrowDownCircle size={12} /> {R$(ent)}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444' }}>
                                        <ArrowUpCircle size={12} /> {R$(sai)}
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, color: sal >= 0 ? '#3b82f6' : '#f97316' }}>
                                        {sal >= 0 ? '+' : ''}{R$(sal)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════
export default function Financeiro({ notify, user, nav }) {
    const [secao, setSecao]   = useState('pagar');
    const [projetos, setProjetos] = useState([]);

    useEffect(() => {
        api.get('/projetos').then(setProjetos).catch(() => setProjetos([]));
    }, []);

    const SECOES = [
        { id: 'pagar',   label: 'A Pagar',        icon: ArrowUpCircle,   color: '#ef4444' },
        { id: 'receber', label: 'A Receber',       icon: ArrowDownCircle, color: '#22c55e' },
        { id: 'nfs',     label: 'Arquivo NF',      icon: Receipt,         color: '#3b82f6' },
        { id: 'fluxo',   label: 'Fluxo de Caixa',  icon: BarChart2,       color: '#8b5cf6' },
    ];

    return (
        <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DollarSign size={22} style={{ color: 'var(--primary)' }} />
                    Financeiro
                </h1>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    Controle de contas, recebimentos, notas fiscais e fluxo de caixa
                </p>
            </div>

            {/* Navegação por seção */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
                {SECOES.map(s => {
                    const Icon = s.icon;
                    const ativo = secao === s.id;
                    return (
                        <button key={s.id} onClick={() => setSecao(s.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '9px 18px', fontSize: 13, fontWeight: 600,
                                borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                                border: ativo ? 'none' : '1px solid var(--border)',
                                background: ativo ? s.color : 'var(--bg-card)',
                                color: ativo ? '#fff' : 'var(--text-secondary)',
                                boxShadow: ativo ? `0 2px 8px ${s.color}44` : 'none',
                            }}>
                            <Icon size={14} /> {s.label}
                        </button>
                    );
                })}
            </div>

            {/* Seção ativa */}
            {secao === 'pagar'   && <SecaoPagar   notify={notify} projetos={projetos} />}
            {secao === 'receber' && <SecaoReceber  notify={notify} projetos={projetos} />}
            {secao === 'nfs'     && <SecaoNFs      notify={notify} />}
            {secao === 'fluxo'   && <SecaoFluxo    />}
        </div>
    );
}
