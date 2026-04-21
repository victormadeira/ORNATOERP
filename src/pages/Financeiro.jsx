import { useState, useEffect, useCallback, useRef } from 'react';
import {
    DollarSign, Plus, Trash2, AlertTriangle, Clock, Check, Search,
    Building2, Filter, X, Repeat, Paperclip, FileText, Image, Upload,
    Eye, RefreshCw, TrendingUp, TrendingDown, Copy, ChevronRight,
    BarChart2, Archive, Receipt, ArrowDownCircle, ArrowUpCircle,
    History, RotateCcw, Download, Calendar, Trophy,
} from 'lucide-react';
import { R$ } from '../engine';
import { Z, Modal, ConfirmModal, Spinner, Badge, KpiCard, PageHeader, TabBar } from '../ui';
import { CATEGORIAS, CAT_MAP, colorBg, colorBorder } from '../theme';
import api from '../api';

// ─── Constantes ─────────────────────────────────────────────────────
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

// ─── Helper: semana atual (seg-dom) ────────────────────────────────
function getWeekRange() {
    const now = new Date();
    const day = now.getDay(); // 0=dom
    const diffMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(now); mon.setDate(now.getDate() + diffMon); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    return { start: mon.toISOString().slice(0,10), end: sun.toISOString().slice(0,10) };
}

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

function getStatusPagar(cp) {
    if (cp.status === 'pago') return { label: 'Pago',    color: '#5B8C6B', bg: 'var(--success-bg)', icon: Check };
    if (cp.vencida || (cp.data_vencimento && cp.data_vencimento < new Date().toISOString().slice(0, 10)))
        return { label: 'Vencida', color: '#B86565', bg: 'var(--danger-bg)', icon: AlertTriangle };
    if (cp.data_vencimento) {
        const dias = Math.ceil((new Date(cp.data_vencimento + 'T12:00:00') - new Date()) / 86400000);
        if (dias <= 7) return { label: `${dias}d`, color: '#C4924C', bg: 'var(--warning-bg)', icon: Clock };
    }
    return { label: 'Pendente', color: 'var(--muted)', bg: '#f9fafb', icon: Clock };
}

function getStatusReceber(cr) {
    if (cr.status === 'pago') return { label: 'Recebido', color: '#5B8C6B', bg: 'var(--success-bg)', icon: Check };
    if (cr.vencida || (cr.data_vencimento && cr.data_vencimento < new Date().toISOString().slice(0, 10)))
        return { label: 'Vencida', color: '#B86565', bg: 'var(--danger-bg)', icon: AlertTriangle };
    if (cr.data_vencimento) {
        const dias = Math.ceil((new Date(cr.data_vencimento + 'T12:00:00') - new Date()) / 86400000);
        if (dias <= 7) return { label: `${dias}d`, color: '#C4924C', bg: 'var(--warning-bg)', icon: Clock };
    }
    return { label: 'Pendente', color: 'var(--muted)', bg: '#f9fafb', icon: Clock };
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
                {Math.abs(soma - (valorTotal || 0)) > 0.02 && <span style={{ color: 'var(--danger)' }}>Diferença do total!</span>}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO: CONTAS A PAGAR
// ═══════════════════════════════════════════════════════════════
function SecaoPagar({ notify, projetos, user }) {
    const [contas, setContas]     = useState([]);
    const [resumo, setResumo]     = useState(null);
    const [loading, setLoading]   = useState(true);
    const [aba, setAba]           = useState('pendentes');
    const [fCategoria, setFCat]   = useState('');
    const [fProjeto, setFProj]    = useState('');
    const [fBusca, setFBusca]     = useState('');
    const [fSemana, setFSemana]   = useState(false);
    const [showForm, setShowForm] = useState(false);
    const emptyForm = { descricao: '', valor: '', data_vencimento: '', categoria: 'outros', fornecedor: '', meio_pagamento: '', codigo_barras: '', projeto_id: '', observacao: '', nf_numero: '', nf_chave: '', recorrente: false, frequencia: 'mensal', parcelado: false, num_parcelas: 2, tipo_intervalo: 'mensal', intervalo_dias: 30 };
    const [form, setForm]         = useState(emptyForm);
    const [parcelas, setParcelas] = useState([]);
    const [anexoModal, setAnexoModal] = useState(null);
    const [anexos, setAnexos]     = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef(null);
    const [historicoId, setHistoricoId] = useState(null);
    const [confirmDel, setConfirmDel] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    const canDelete = user?.role === 'admin' || user?.role === 'gerente';
    const canViewHistory = user?.role === 'admin' || user?.role === 'gerente';

    const load = useCallback(() => {
        const p = new URLSearchParams({ status: aba === 'pagos' ? 'pago' : 'pendente' });
        if (fCategoria) p.append('categoria', fCategoria);
        if (fProjeto)   p.append('projeto_id', fProjeto);
        setLoading(true);
        api.get(`/financeiro/pagar?${p}`).then(setContas).catch(() => setContas([])).finally(() => setLoading(false));
        api.get('/financeiro/pagar/resumo').then(setResumo).catch(e => notify(e.error || 'Erro ao carregar resumo'));
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
        api.del(`/financeiro/pagar/anexos/${id}`).then(() => { setAnexos(prev => prev.filter(a => a.id !== id)); load(); notify('Anexo excluído'); });
    };

    const copiarCodigo = (texto) => {
        navigator.clipboard.writeText(texto).then(() => notify('Código copiado!'));
    };

    const filtradas = contas.filter(c => {
        if (fSemana && c.data_vencimento) {
            const wk = getWeekRange();
            if (c.data_vencimento < wk.start || c.data_vencimento > wk.end) return false;
        }
        if (!fBusca) return true;
        const b = fBusca.toLowerCase();
        return (c.descricao || '').toLowerCase().includes(b)
            || (c.fornecedor || '').toLowerCase().includes(b)
            || (c.projeto_nome || '').toLowerCase().includes(b)
            || (c.nf_numero || '').toLowerCase().includes(b)
            || (c.codigo_barras || '').includes(b);
    });

    const allVisibleIds = filtradas.filter(c => c.status !== 'pago').map(c => c.id);
    const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));

    const toggleSelect = (id) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(allVisibleIds));
    };

    const bulkMarkPago = () => {
        if (selectedIds.size === 0) return;
        setBulkLoading(true);
        api.put('/financeiro/pagar/bulk-status', { ids: [...selectedIds], status: 'pago', data_pagamento: new Date().toISOString().slice(0,10) })
            .then(() => { load(); setSelectedIds(new Set()); notify(`${selectedIds.size} conta(s) marcadas como pagas`); })
            .catch(e => notify(e.error || 'Erro ao atualizar em lote'))
            .finally(() => setBulkLoading(false));
    };

    const exportCsv = () => {
        window.open('/api/financeiro/pagar/export-csv', '_blank');
    };

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
                    <KpiCard label="Pendente"   value={R$(resumo.pendente)}     color="var(--primary)" />
                    <KpiCard label="Vencido"    value={R$(resumo.vencido)}      color="var(--primary)" sub={resumo.qtd_vencidas > 0 ? `${resumo.qtd_vencidas} conta(s)` : null} />
                    <KpiCard label="Vence 7d"   value={R$(resumo.vencer_7d || 0)} color="var(--primary)" sub={resumo.qtd_vencer_7d > 0 ? `${resumo.qtd_vencer_7d} conta(s)` : null} />
                    <KpiCard label="Pago (mês)" value={R$(resumo.pago_mes || 0)} color="var(--primary)" />
                </div>
            )}

            {/* Formulário */}
            {showForm && (
                <div className={Z.card} style={{ padding: 20, marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Nova Conta a Pagar</div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
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
            <div style={{ display: 'flex', marginBottom: 12, overflowX: 'auto' }}>
                {['pendentes', 'pagos'].map((t, i) => (
                    <button key={t} onClick={() => setAba(t)} style={{
                        padding: '8px 20px', fontSize: 12, fontWeight: 600,
                        border: '1px solid var(--border)',
                        background: aba === t ? 'var(--primary)' : 'var(--bg-card)',
                        color: aba === t ? '#fff' : 'var(--text-secondary)',
                        borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0', cursor: 'pointer',
                        whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                        {t === 'pendentes' ? 'Pendentes' : 'Pagos / Arquivo'}
                    </button>
                ))}
            </div>

            {/* Filtros */}
            <div className={Z.card} style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <button onClick={() => setFSemana(v => !v)}
                    style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        borderColor: fSemana ? 'var(--primary)' : 'var(--border)',
                        background: fSemana ? 'var(--primary)' : 'var(--bg-card)',
                        color: fSemana ? '#fff' : 'var(--text-secondary)',
                    }}>
                    <Calendar size={11} /> Esta semana
                </button>
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
                {(fCategoria || fProjeto || fBusca || fSemana) && (
                    <button onClick={() => { setFCat(''); setFProj(''); setFBusca(''); setFSemana(false); }}
                        style={{ fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <X size={11} /> Limpar
                    </button>
                )}
                <button onClick={exportCsv} title="Exportar CSV"
                    style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Download size={12} /> CSV
                </button>
            </div>

            {/* Tabela */}
            <div className={Z.card} style={{ overflow: 'hidden' }}>
                {loading ? <Spinner text="Carregando..." />
                : filtradas.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma conta encontrada.</div>
                : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '10px 8px', width: 32, textAlign: 'center' }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                                    </th>
                                    {['Status', 'Descrição', 'Fornecedor', 'Cat.', 'Projeto', 'Valor', 'Venc.', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 12px', textAlign: i === 5 ? 'right' : i >= 6 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(cp => {
                                    const st  = getStatusPagar(cp);
                                    const cat = CAT_MAP[cp.categoria];
                                    const isPago = cp.status === 'pago';
                                    return (
                                        <tr key={cp.id} style={{ borderBottom: '1px solid var(--border)', opacity: isPago ? 0.65 : 1, background: selectedIds.has(cp.id) ? 'rgba(19,121,240,0.06)' : !isPago && st.color === '#B86565' ? '#fef2f218' : 'transparent', borderLeft: !isPago && st.color === '#B86565' ? '3px solid var(--danger)' : 'none' }}>
                                            <td style={{ padding: '10px 8px', textAlign: 'center', width: 32 }}>
                                                {!isPago && <input type="checkbox" checked={selectedIds.has(cp.id)} onChange={() => toggleSelect(cp.id)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}><Badge label={st.label} color={st.color} icon={st.icon} /></td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ fontWeight: isPago ? 400 : 600, textDecoration: isPago ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                    {cp.descricao}
                                                    {cp.parcela_total > 0 && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: 'var(--info-bg)', color: 'var(--info-hover)', fontWeight: 600 }}>{cp.parcela_num}/{cp.parcela_total}</span>}
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
                                            <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 11 }}>{cp.fornecedor || '—'}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {cat ? <span style={{ fontSize: 9, fontWeight: 600, color: cat.color, background: cat.color + '18', padding: '2px 5px', borderRadius: 5, whiteSpace: 'nowrap' }}>{cat.label}</span>
                                                      : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cp.categoria}</span>}
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: 11, color: cp.projeto_nome ? 'var(--primary)' : 'var(--text-muted)' }}>{cp.projeto_nome || '—'}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: isPago ? '#5B8C6B' : st.color === '#B86565' ? '#B86565' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{R$(cp.valor)}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                {dtFmt(cp.data_vencimento)}
                                                {isPago && cp.data_pagamento && <div style={{ fontSize: 9, color: '#5B8C6B' }}>Pago {dtFmt(cp.data_pagamento)}</div>}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                                    <button onClick={() => togglePago(cp)} title={isPago ? 'Reabrir' : 'Marcar pago'}
                                                        style={{ width: 26, height: 26, borderRadius: 5, border: `2px solid ${isPago ? 'var(--primary)' : '#d1d5db'}`, background: isPago ? 'var(--primary)' : 'transparent', color: isPago ? '#fff' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                                        <Check size={14} />
                                                    </button>
                                                    <button onClick={() => openAnexos(cp.id)} title="Anexos"
                                                        style={{ width: 26, height: 26, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Paperclip size={14} />
                                                    </button>
                                                    {canViewHistory && (
                                                        <button onClick={() => setHistoricoId(cp.id)} title="Histórico"
                                                            style={{ width: 26, height: 26, borderRadius: 5, border: 'none', background: 'transparent', color: '#8b5cf6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}
                                                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                            onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                                                            <History size={14} />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button onClick={() => setConfirmDel({ id: cp.id, nome: cp.descricao, tipo: 'conta' })} title="Excluir"
                                                            style={{ width: 26, height: 26, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}
                                                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                            onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
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

            {/* Barra de ação em lote */}
            {selectedIds.size > 0 && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 20px',
                    display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</span>
                    <button className={Z.btn} onClick={bulkMarkPago} disabled={bulkLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 14px' }}>
                        <Check size={13} /> Marcar como Pago
                    </button>
                    <button className={Z.btn2} onClick={() => setSelectedIds(new Set())} style={{ fontSize: 12, padding: '6px 14px' }}>
                        Cancelar
                    </button>
                </div>
            )}

            {/* Resumo por Categoria */}
            {aba === 'pendentes' && resumo?.por_categoria?.length > 0 && (
                <div className={Z.card} style={{ padding: 18, marginTop: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={14} style={{ color: 'var(--text-muted)' }} /> Pendente por Categoria
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {resumo.por_categoria.map(pc => {
                            const cat = CAT_MAP[pc.categoria];
                            const pct = resumo.pendente > 0 ? (pc.total / resumo.pendente) * 100 : 0;
                            return (
                                <div key={pc.categoria} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ width: 90, fontSize: 11, fontWeight: 500, color: cat?.color || 'var(--text-secondary)' }}>{cat?.label || pc.categoria}</span>
                                    <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--border)' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: cat?.color || 'var(--muted)', transition: 'width 0.3s' }} />
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
                                        {isImg(a.filename) ? <Image size={18} style={{ color: 'var(--info)' }} /> : <FileText size={18} style={{ color: 'var(--danger)' }} />}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.tipo} · {(a.tamanho / 1024).toFixed(0)}KB · {dtFmt(a.criado_em?.slice(0, 10))}</div>
                                        </div>
                                        <a href={`/api/financeiro/pagar/anexo/${anexoModal}/${a.filename}`} target="_blank" rel="noreferrer"
                                            style={{ color: 'var(--primary)', display: 'flex' }} title="Abrir"><Eye size={15} /></a>
                                        <button onClick={() => setConfirmDel({ id: a.id, nome: a.nome, tipo: 'anexo' })} title="Excluir"
                                            style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', opacity: 0.6 }}
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

            {/* Modal Histórico */}
            {historicoId && (
                <HistoricoModal
                    tipo="pagar"
                    id={historicoId}
                    onClose={() => setHistoricoId(null)}
                    onReload={load}
                    notify={notify}
                    isAdmin={user?.role === 'admin'}
                />
            )}

            {confirmDel && (
                <ConfirmModal
                    title="Excluir"
                    message={`Tem certeza que deseja excluir "${confirmDel.nome}"? Esta ação não pode ser desfeita.`}
                    confirmLabel="Excluir"
                    danger
                    onConfirm={() => {
                        if (confirmDel.tipo === 'anexo') delAnexo(confirmDel.id);
                        else delConta(confirmDel.id);
                        setConfirmDel(null);
                    }}
                    onCancel={() => setConfirmDel(null)}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO: CONTAS A RECEBER
// ═══════════════════════════════════════════════════════════════
function SecaoReceber({ notify, projetos, user }) {
    const [contas, setContas]     = useState([]);
    const [resumo, setResumo]     = useState(null);
    const [loading, setLoading]   = useState(true);
    const [aba, setAba]           = useState('pendentes');
    const [fProjeto, setFProj]    = useState('');
    const [fBusca, setFBusca]     = useState('');
    const [fSemana, setFSemana]   = useState(false);
    const [showForm, setShowForm] = useState(false);
    const emptyForm = { descricao: '', valor: '', data_vencimento: '', meio_pagamento: '', codigo_barras: '', nf_numero: '', observacao: '', projeto_id: '', parcelado: false, num_parcelas: 2, tipo_intervalo: 'mensal', intervalo_dias: 30 };
    const [form, setForm]         = useState(emptyForm);
    const [parcelas, setParcelas] = useState([]);
    const [historicoId, setHistoricoId] = useState(null);
    const [confirmDel, setConfirmDel] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkLoading, setBulkLoading] = useState(false);

    const canDelete = user?.role === 'admin' || user?.role === 'gerente';
    const canViewHistory = user?.role === 'admin' || user?.role === 'gerente';

    const load = useCallback(() => {
        const p = new URLSearchParams({ status: aba === 'pagos' ? 'pago' : 'pendente' });
        if (fProjeto) p.append('projeto_id', fProjeto);
        setLoading(true);
        api.get(`/financeiro/receber?${p}`).then(setContas).catch(() => setContas([])).finally(() => setLoading(false));
        api.get('/financeiro/receber/resumo').then(setResumo).catch(e => notify(e.error || 'Erro ao carregar resumo'));
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
        api.del(`/financeiro/receber/${id}`).then(() => { load(); notify('Excluída'); }).catch(e => notify(e.error || 'Erro'));
    };

    const copiarCodigo = (texto) => navigator.clipboard.writeText(texto).then(() => notify('Código copiado!'));

    const filtradas = contas.filter(c => {
        if (fSemana && c.data_vencimento) {
            const wk = getWeekRange();
            if (c.data_vencimento < wk.start || c.data_vencimento > wk.end) return false;
        }
        if (!fBusca) return true;
        const b = fBusca.toLowerCase();
        return (c.descricao || '').toLowerCase().includes(b)
            || (c.projeto_nome || '').toLowerCase().includes(b)
            || (c.meio_pagamento || '').toLowerCase().includes(b);
    });

    const allVisibleIds = filtradas.filter(c => c.status !== 'pago').map(c => c.id);
    const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));

    const toggleSelect = (id) => setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(allVisibleIds));
    };

    const bulkMarkRecebido = () => {
        if (selectedIds.size === 0) return;
        setBulkLoading(true);
        api.put('/financeiro/receber/bulk-status', { ids: [...selectedIds], status: 'pago', data_pagamento: new Date().toISOString().slice(0,10) })
            .then(() => { load(); setSelectedIds(new Set()); notify(`${selectedIds.size} recebimento(s) marcados`); })
            .catch(e => notify(e.error || 'Erro ao atualizar em lote'))
            .finally(() => setBulkLoading(false));
    };

    const exportCsv = () => {
        window.open('/api/financeiro/receber/export-csv', '_blank');
    };

    // "Quem mais deve" — top 3 clientes/projetos com maior saldo pendente
    const topDevedores = (() => {
        const pendentes = contas.filter(c => c.status !== 'pago');
        const map = {};
        pendentes.forEach(c => {
            const key = c.projeto_nome || 'Sem projeto';
            map[key] = (map[key] || 0) + (c.valor || 0);
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([nome, total]) => ({ nome, total }));
    })();

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
                    <KpiCard label="A Receber"      value={R$(resumo.pendente)}      color="var(--primary)" />
                    <KpiCard label="Vencido"        value={R$(resumo.vencido)}       color="var(--primary)" sub={resumo.qtd_vencidas > 0 ? `${resumo.qtd_vencidas} conta(s)` : null} />
                    <KpiCard label="Recebido (mês)" value={R$(resumo.recebido_mes || 0)} color="var(--primary)" />
                    <KpiCard label="Total Recebido" value={R$(resumo.recebido || 0)} color="#8b5cf6" />
                </div>
            )}

            {/* Quem mais deve */}
            {aba === 'pendentes' && topDevedores.length > 0 && (
                <div className={Z.card} style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                        <Trophy size={13} style={{ color: '#C4924C' }} /> Maiores pendentes
                    </div>
                    {topDevedores.map((d, i) => (
                        <span key={i} style={{ fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontWeight: 600 }}>{d.nome}</span>
                            <span style={{ color: '#B86565', fontWeight: 700 }}>{R$(d.total)}</span>
                            {i < topDevedores.length - 1 && <span style={{ color: 'var(--border)', margin: '0 2px' }}>|</span>}
                        </span>
                    ))}
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
            <div style={{ display: 'flex', marginBottom: 12, overflowX: 'auto' }}>
                {['pendentes', 'pagos'].map((t, i) => (
                    <button key={t} onClick={() => setAba(t)} style={{
                        padding: '8px 20px', fontSize: 12, fontWeight: 600,
                        border: '1px solid var(--border)',
                        background: aba === t ? 'var(--primary)' : 'var(--bg-card)',
                        color: aba === t ? '#fff' : 'var(--text-secondary)',
                        borderRadius: i === 0 ? '8px 0 0 8px' : '0 8px 8px 0', cursor: 'pointer',
                        whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                        {t === 'pendentes' ? 'Pendentes' : 'Recebidos'}
                    </button>
                ))}
            </div>

            {/* Filtros */}
            <div className={Z.card} style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <button onClick={() => setFSemana(v => !v)}
                    style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: '1px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        borderColor: fSemana ? 'var(--primary)' : 'var(--border)',
                        background: fSemana ? 'var(--primary)' : 'var(--bg-card)',
                        color: fSemana ? '#fff' : 'var(--text-secondary)',
                    }}>
                    <Calendar size={11} /> Esta semana
                </button>
                <select className={Z.inp} style={{ width: 180, fontSize: 11 }} value={fProjeto} onChange={e => setFProj(e.target.value)}>
                    <option value="">Todos os projetos</option>
                    {projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <div style={{ position: 'relative', flex: 1, minWidth: 150 }}>
                    <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className={Z.inp} style={{ paddingLeft: 28, fontSize: 11, width: '100%' }}
                        placeholder="Buscar..." value={fBusca} onChange={e => setFBusca(e.target.value)} />
                </div>
                {(fProjeto || fBusca || fSemana) && (
                    <button onClick={() => { setFProj(''); setFBusca(''); setFSemana(false); }}
                        style={{ fontSize: 10, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <X size={11} /> Limpar
                    </button>
                )}
                <button onClick={exportCsv} title="Exportar CSV"
                    style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Download size={12} /> CSV
                </button>
            </div>

            {/* Tabela */}
            <div className={Z.card} style={{ overflow: 'hidden' }}>
                {loading ? <Spinner text="Carregando..." />
                : filtradas.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nenhum recebimento encontrado.</div>
                : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '10px 8px', width: 32, textAlign: 'center' }}>
                                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />
                                    </th>
                                    {['Status', 'Descrição', 'Projeto', 'Meio', 'Valor', 'Venc.', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 12px', textAlign: i === 4 ? 'right' : i >= 5 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(cr => {
                                    const st = getStatusReceber(cr);
                                    const isRecebido = cr.status === 'pago';
                                    return (
                                        <tr key={cr.id} style={{ borderBottom: '1px solid var(--border)', opacity: isRecebido ? 0.65 : 1, background: selectedIds.has(cr.id) ? 'rgba(19,121,240,0.06)' : !isRecebido && st.color === '#B86565' ? '#fef2f218' : 'transparent', borderLeft: !isRecebido && st.color === '#B86565' ? '3px solid var(--danger)' : 'none' }}>
                                            <td style={{ padding: '10px 8px', textAlign: 'center', width: 32 }}>
                                                {!isRecebido && <input type="checkbox" checked={selectedIds.has(cr.id)} onChange={() => toggleSelect(cr.id)} style={{ cursor: 'pointer', accentColor: 'var(--primary)' }} />}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}><Badge label={st.label} color={st.color} icon={st.icon} /></td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ fontWeight: isRecebido ? 400 : 600, textDecoration: isRecebido ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {cr.descricao}
                                                    {cr.parcela_total > 0 && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: 'var(--primary-alpha, rgba(19,121,240,0.08))', color: 'var(--primary)', fontWeight: 600 }}>{cr.parcela_num}/{cr.parcela_total}</span>}
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
                                            <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--primary)' }}>{cr.projeto_nome || '—'}</td>
                                            <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)' }}>{cr.meio_pagamento || '—'}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: isRecebido ? '#5B8C6B' : st.color === '#B86565' ? '#B86565' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{R$(cr.valor)}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                {dtFmt(cr.data_vencimento)}
                                                {isRecebido && cr.data_pagamento && <div style={{ fontSize: 9, color: '#5B8C6B' }}>Rec. {dtFmt(cr.data_pagamento)}</div>}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                                    <button onClick={() => toggleRecebido(cr)} title={isRecebido ? 'Reabrir' : 'Marcar recebido'}
                                                        style={{ width: 26, height: 26, borderRadius: 5, border: `2px solid ${isRecebido ? 'var(--primary)' : '#d1d5db'}`, background: isRecebido ? 'var(--primary)' : 'transparent', color: isRecebido ? '#fff' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                                        <Check size={14} />
                                                    </button>
                                                    {canViewHistory && (
                                                        <button onClick={() => setHistoricoId(cr.id)} title="Histórico"
                                                            style={{ width: 26, height: 26, borderRadius: 5, border: 'none', background: 'transparent', color: '#8b5cf6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}
                                                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                            onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                                                            <History size={14} />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button onClick={() => setConfirmDel({ id: cr.id, nome: cr.descricao })} title="Excluir"
                                                            style={{ width: 26, height: 26, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}
                                                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                            onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
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

            {/* Barra de ação em lote */}
            {selectedIds.size > 0 && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 20px',
                    display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</span>
                    <button className={Z.btn} onClick={bulkMarkRecebido} disabled={bulkLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '6px 14px' }}>
                        <Check size={13} /> Marcar como Recebido
                    </button>
                    <button className={Z.btn2} onClick={() => setSelectedIds(new Set())} style={{ fontSize: 12, padding: '6px 14px' }}>
                        Cancelar
                    </button>
                </div>
            )}

            {/* Modal Histórico */}
            {historicoId && (
                <HistoricoModal
                    tipo="receber"
                    id={historicoId}
                    onClose={() => setHistoricoId(null)}
                    onReload={load}
                    notify={notify}
                    isAdmin={user?.role === 'admin'}
                />
            )}

            {confirmDel && (
                <ConfirmModal
                    title="Excluir"
                    message={`Tem certeza que deseja excluir "${confirmDel.nome}"? Esta ação não pode ser desfeita.`}
                    confirmLabel="Excluir"
                    danger
                    onConfirm={() => { delConta(confirmDel.id); setConfirmDel(null); }}
                    onCancel={() => setConfirmDel(null)}
                />
            )}
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
                {loading ? <Spinner text="Carregando..." />
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
                                        <th key={i} style={{ padding: '10px 12px', textAlign: i === 4 ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
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
                                            <td style={{ padding: '8px 8px' }}><Badge label={st.label} color={st.color} icon={st.icon} /></td>
                                            <td style={{ padding: '8px 8px', maxWidth: 200 }}>
                                                {nf.nf_chave ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={nf.nf_chave}>{nf.nf_chave}</span>
                                                        <button onClick={() => copiarChave(nf.nf_chave, nf.id)} title="Copiar chave"
                                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: copiada === nf.id ? '#5B8C6B' : 'var(--primary)', padding: 0, display: 'flex', flexShrink: 0 }}>
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
        api.get('/financeiro/fluxo').then(setDados).catch(e => console.error('Erro ao carregar fluxo:', e)).finally(() => setLoading(false));
    }, []);

    if (loading) return <Spinner text="Carregando..." />;
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
                <div className={Z.card} style={{ padding: '14px 16px', borderLeft: '4px solid var(--primary)' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingUp size={11} /> Entradas (12m)
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)', marginTop: 2 }}>{R$(totalEntradas)}</div>
                </div>
                <div className={Z.card} style={{ padding: '14px 16px', borderLeft: '4px solid #94a3b8' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingDown size={11} /> Saídas (12m)
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)', marginTop: 2 }}>{R$(totalSaidas)}</div>
                </div>
                <div className={Z.card} style={{ padding: '14px 16px', borderLeft: `4px solid ${saldoTotal >= 0 ? 'var(--primary)' : '#B86565'}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Saldo Período</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: saldoTotal >= 0 ? 'var(--primary)' : '#B86565', marginTop: 2 }}>{R$(saldoTotal)}</div>
                </div>
            </div>

            {/* Gráfico de barras */}
            <div className={Z.card} style={{ padding: '18px 14px', marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart2 size={14} /> Histórico Mensal</span>
                    <div style={{ display: 'flex', gap: 14, fontSize: 10, fontWeight: 600 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--primary)', display: 'inline-block' }} />Entradas</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--muted)', display: 'inline-block' }} />Saídas</span>
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
                        {rows.map((r, ri) => (
                            <div key={r.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, position: 'relative' }}>
                                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 132 }}>
                                    <div title={`Entradas: ${R$(r.entradas)}`}
                                        style={{
                                            width: 12, height: `${Math.max(2, (r.entradas / maxVal) * 132)}px`,
                                            background: 'var(--primary)',
                                            borderRadius: '4px 4px 0 0', boxShadow: '0 -1px 6px rgba(19,121,240,0.2)',
                                            transformOrigin: 'bottom', cursor: 'default',
                                            animation: `chartGrowUp 0.5s ease ${ri * 60}ms both`,
                                        }} />
                                    <div title={`Saídas: ${R$(r.saidas)}`}
                                        style={{
                                            width: 12, height: `${Math.max(2, (r.saidas / maxVal) * 132)}px`,
                                            background: 'var(--muted)',
                                            borderRadius: '4px 4px 0 0', boxShadow: '0 -1px 6px rgba(148,163,184,0.2)',
                                            transformOrigin: 'bottom', cursor: 'default',
                                            animation: `chartGrowUp 0.5s ease ${ri * 60 + 30}ms both`,
                                        }} />
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
                                    <th key={i} style={{ padding: '8px 12px', textAlign: i > 0 ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.mes} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{mesFmt(r.mes)}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>{r.entradas > 0 ? R$(r.entradas) : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)', fontWeight: 600 }}>{r.saidas > 0 ? R$(r.saidas) : <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>—</span>}</td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: r.saldo >= 0 ? 'var(--primary)' : '#B86565' }}>{R$(r.saldo)}</td>
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
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--primary)' }}>
                                        <ArrowDownCircle size={12} /> {R$(ent)}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                                        <ArrowUpCircle size={12} /> {R$(sai)}
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, color: sal >= 0 ? 'var(--primary)' : '#B86565' }}>
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
// MODAL: HISTÓRICO DE ALTERAÇÕES
// ═══════════════════════════════════════════════════════════════
const LABEL_CAMPO = {
    descricao: 'Descrição', valor: 'Valor', data_vencimento: 'Vencimento', status: 'Status',
    data_pagamento: 'Dt. Pagamento', categoria: 'Categoria', fornecedor: 'Fornecedor',
    meio_pagamento: 'Meio Pgto', projeto_id: 'Projeto', observacao: 'Observação',
    nf_numero: 'Nº NF', nf_chave: 'Chave NFe', data: 'Data',
};

function HistoricoModal({ tipo, id, onClose, onReload, notify, isAdmin }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reverting, setReverting] = useState(null);
    const [confirmDel, setConfirmDel] = useState(null);

    useEffect(() => {
        setLoading(true);
        api.get(`/financeiro/historico/${tipo}/${id}`)
            .then(setEntries)
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, [tipo, id]);

    const reverter = (entryId) => {
        setReverting(entryId);
        api.post(`/financeiro/reverter/${tipo}/${id}`, { atividade_id: entryId })
            .then(() => {
                notify('Revertido com sucesso!');
                onReload();
                // Re-fetch history
                api.get(`/financeiro/historico/${tipo}/${id}`).then(setEntries).catch(e => notify(e.error || 'Erro ao recarregar histórico'));
            })
            .catch(e => notify(e.error || 'Erro ao reverter'))
            .finally(() => setReverting(null));
    };

    const fmtVal = (campo, val) => {
        if (val === null || val === undefined || val === '') return '—';
        if (campo === 'valor') return R$(parseFloat(val));
        if (campo === 'status') return val === 'pago' ? 'Pago' : 'Pendente';
        if (campo === 'data_vencimento' || campo === 'data_pagamento' || campo === 'data') return dtFmt(val);
        return String(val);
    };

    return (
        <Modal onClose={onClose} title={`Histórico — ${tipo === 'pagar' ? 'Conta a Pagar' : tipo === 'receber' ? 'Conta a Receber' : 'Despesa'} #${id}`}>
            <div style={{ width: 'min(420px, 95vw)', maxWidth: 'min(600px, 95vw)', maxHeight: '70vh', overflowY: 'auto' }}>
                {loading ? <Spinner text="Carregando histórico..." />
                : entries.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        <History size={24} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                        Nenhuma alteração registrada ainda.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {entries.map(e => {
                            let det = {};
                            try { det = typeof e.detalhes === 'string' ? JSON.parse(e.detalhes) : (e.detalhes || {}); } catch { det = {}; }
                            const campos = det.campos_alterados || [];
                            const isDelete = e.acao === 'deletar' || e.acao === 'excluir_financeiro';
                            const isRevert = e.acao === 'reverter_financeiro';
                            const isCreate = e.acao === 'criar' || e.acao === 'criar_financeiro';

                            return (
                                <div key={e.id} style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8, borderLeft: `3px solid ${isDelete ? '#B86565' : isRevert ? '#C4924C' : isCreate ? '#5B8C6B' : 'var(--primary)'}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {e.user_nome || 'Sistema'}
                                            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 10 }}>
                                                {e.acao === 'editar_financeiro' ? 'editou' : isDelete ? 'excluiu' : isRevert ? 'reverteu' : isCreate ? 'criou' : e.acao}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {e.criado_em ? new Date(e.criado_em).toLocaleString('pt-BR') : ''}
                                        </span>
                                    </div>

                                    {/* Diff de campos alterados */}
                                    {campos.length > 0 && det.antes && det.depois && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                                            {campos.map(c => (
                                                <div key={c} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: 80 }}>{LABEL_CAMPO[c] || c}</span>
                                                    <span style={{ color: '#B86565', textDecoration: 'line-through', fontSize: 10 }}>{fmtVal(c, det.antes[c])}</span>
                                                    <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />
                                                    <span style={{ color: '#5B8C6B', fontWeight: 600, fontSize: 10 }}>{fmtVal(c, det.depois[c])}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Snapshot de exclusão */}
                                    {isDelete && det.snapshot && (
                                        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                                            Excluído: {det.snapshot.descricao} — {R$(det.snapshot.valor)}
                                        </div>
                                    )}

                                    {/* Botão reverter (admin) */}
                                    {isAdmin && det.antes && !isCreate && (
                                        <button onClick={() => setConfirmDel({ id: e.id, acao: 'reverter' })} disabled={reverting === e.id}
                                            style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#C4924C', background: '#C4924C18', border: '1px solid #C4924C44', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                                            <RotateCcw size={10} /> {reverting === e.id ? 'Revertendo...' : 'Reverter para esta versão'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {confirmDel && (
                <ConfirmModal
                    title="Reverter"
                    message="Reverter para esta versão? Uma nova entrada será criada no histórico."
                    confirmLabel="Reverter"
                    onConfirm={() => { reverter(confirmDel.id); setConfirmDel(null); }}
                    onCancel={() => setConfirmDel(null)}
                />
            )}
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO: LIXEIRA (ADMIN ONLY)
// ═══════════════════════════════════════════════════════════════
function SecaoLixeira({ notify }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [subAba, setSubAba] = useState('pagar');
    const [confirmDel, setConfirmDel] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/financeiro/lixeira').then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const restaurar = (tipo, id) => {
        api.post(`/financeiro/restaurar/${tipo}/${id}`)
            .then(() => { load(); notify('Item restaurado!'); })
            .catch(e => notify(e.error || 'Erro ao restaurar'));
    };

    const excluirPermanente = (tipo, id) => {
        api.del(`/financeiro/lixeira/${tipo}/${id}`)
            .then(() => { load(); notify('Excluído permanentemente'); })
            .catch(e => notify(e.error || 'Erro ao excluir'));
    };

    const filtrados = items.filter(i => i._tipo === subAba);

    return (
        <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Itens excluídos — restaure ou exclua permanentemente
            </div>

            {/* Sub-abas */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                {[
                    { id: 'pagar',    label: 'Contas a Pagar', color: 'var(--primary)' },
                    { id: 'receber',  label: 'Contas a Receber', color: 'var(--primary)' },
                    { id: 'despesas', label: 'Despesas Projeto', color: 'var(--primary)' },
                ].map((t, i) => (
                    <button key={t.id} onClick={() => setSubAba(t.id)} style={{
                        padding: '6px 14px', fontSize: 11, fontWeight: 600,
                        border: '1px solid var(--border)',
                        background: subAba === t.id ? t.color : 'var(--bg-card)',
                        color: subAba === t.id ? '#fff' : 'var(--text-secondary)',
                        borderRadius: 6, cursor: 'pointer',
                    }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className={Z.card} style={{ overflow: 'hidden' }}>
                {loading ? <Spinner text="Carregando lixeira..." />
                : filtrados.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>
                        <Trash2 size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lixeira vazia</div>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 600, borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    {['Descrição', 'Valor', 'Excluído por', 'Data exclusão', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 12px', textAlign: i === 1 ? 'right' : i === 4 ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtrados.map(it => (
                                    <tr key={`${it._tipo}-${it.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '8px 8px', fontWeight: 500 }}>
                                            {it.descricao}
                                            {it.fornecedor && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{it.fornecedor}</div>}
                                        </td>
                                        <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>{R$(it.valor)}</td>
                                        <td style={{ padding: '8px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>{it.deletado_por_nome || '—'}</td>
                                        <td style={{ padding: '8px 8px', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {it.deletado_em ? new Date(it.deletado_em).toLocaleString('pt-BR') : '—'}
                                        </td>
                                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                                                <button onClick={() => setConfirmDel({ tipo: it._tipo, id: it.id, nome: it.descricao, acao: 'restaurar' })} title="Restaurar"
                                                    style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: '#5B8C6B', background: '#5B8C6B14', border: '1px solid #5B8C6B44', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                                                    <RotateCcw size={10} /> Restaurar
                                                </button>
                                                <button onClick={() => setConfirmDel({ tipo: it._tipo, id: it.id, nome: it.descricao, acao: 'excluir' })} title="Excluir permanentemente"
                                                    style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: '#B86565', background: '#B8656514', border: '1px solid #B8656544', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                                                    <Trash2 size={10} /> Permanente
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {confirmDel && (
                <ConfirmModal
                    title={confirmDel.acao === 'restaurar' ? 'Restaurar' : 'Excluir Permanentemente'}
                    message={confirmDel.acao === 'restaurar'
                        ? `Restaurar "${confirmDel.nome}"? Ele voltará a aparecer nas listagens normais.`
                        : `EXCLUIR "${confirmDel.nome}" PERMANENTEMENTE? Esta ação não pode ser desfeita!`}
                    confirmLabel={confirmDel.acao === 'restaurar' ? 'Restaurar' : 'Excluir'}
                    danger={confirmDel.acao === 'excluir'}
                    onConfirm={() => {
                        if (confirmDel.acao === 'restaurar') restaurar(confirmDel.tipo, confirmDel.id);
                        else excluirPermanente(confirmDel.tipo, confirmDel.id);
                        setConfirmDel(null);
                    }}
                    onCancel={() => setConfirmDel(null)}
                />
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
        { id: 'pagar',   label: 'A Pagar',        icon: ArrowUpCircle,   color: 'var(--primary)' },
        { id: 'receber', label: 'A Receber',       icon: ArrowDownCircle, color: 'var(--primary)' },
        { id: 'nfs',     label: 'Arquivo NF',      icon: Receipt,         color: 'var(--primary)' },
        { id: 'fluxo',   label: 'Fluxo de Caixa',  icon: BarChart2,       color: '#8b5cf6' },
        ...(user?.role === 'admin' ? [{ id: 'lixeira', label: 'Lixeira', icon: Trash2, color: 'var(--muted)' }] : []),
    ];

    return (
        <div style={{ padding: 'clamp(14px, 3vw, 24px) clamp(14px, 3vw, 32px)', maxWidth: 1280, margin: '0 auto' }}>
            {/* Header */}
            <PageHeader icon={DollarSign} title="Financeiro" subtitle="Controle de contas, recebimentos, notas fiscais e fluxo de caixa" />

            {/* Navegação por seção */}
            <TabBar
                tabs={SECOES.map(s => ({ id: s.id, label: s.label, icon: s.icon }))}
                active={secao}
                onChange={setSecao}
            />

            {/* Seção ativa */}
            {secao === 'pagar'   && <SecaoPagar   notify={notify} projetos={projetos} user={user} />}
            {secao === 'receber' && <SecaoReceber  notify={notify} projetos={projetos} user={user} />}
            {secao === 'nfs'     && <SecaoNFs      notify={notify} />}
            {secao === 'fluxo'   && <SecaoFluxo    />}
            {secao === 'lixeira' && <SecaoLixeira  notify={notify} />}
        </div>
    );
}
