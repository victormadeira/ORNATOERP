import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Z, Ic, Modal, PageHeader, TabBar, EmptyState, Spinner, ConfirmModal } from '../ui';
import { R$, N } from '../engine';
import api from '../api';
import {
    Plus, Upload, FileText, Package, TrendingUp, TrendingDown, BarChart3,
    Search, Trash2, Edit2, Check, X, ChevronDown, AlertTriangle,
    Truck, ShoppingCart, ClipboardList, FileSpreadsheet, RefreshCw,
    ArrowUpDown, ArrowDown, ArrowUp, Copy, Eye, DollarSign, CheckCircle2
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const fmtCnpj = (v) => {
    if (!v) return '';
    const c = v.replace(/\D/g, '');
    if (c.length <= 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};
const pctDiff = (old_, new_) => {
    if (!old_ || old_ === 0) return null;
    return ((new_ - old_) / old_) * 100;
};

const STATUS_ORDEM = {
    rascunho: { label: 'Rascunho', color: 'var(--text-muted)' },
    pendente: { label: 'Pendente', color: 'var(--warning)' },
    aprovada: { label: 'Aprovada', color: 'var(--primary)' },
    recebida: { label: 'Recebida', color: 'var(--success)' },
    cancelada: { label: 'Cancelada', color: 'var(--danger)' },
};

const emptyFornecedor = { nome: '', cnpj: '', telefone: '', email: '', cidade: '', estado: '', contato: '', obs: '' };
const emptyOrdem = { fornecedor_id: '', projeto_id: '', obs: '', itens: [{ descricao: '', qtd: 1, valor_unit: 0 }] };

// ═══════════════════════════════════════════════════════════
// TAB 1 — Fornecedores
// ═══════════════════════════════════════════════════════════
function TabFornecedores({ notify }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ ...emptyFornecedor });
    const [saving, setSaving] = useState(false);
    const [confirmDelId, setConfirmDelId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get('/compras/fornecedores');
            setItems(Array.isArray(data) ? data : []);
        } catch (e) {
            notify?.('Erro ao carregar fornecedores', 'error');
            setItems([]);
        } finally { setLoading(false); }
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        if (!search) return items;
        const s = search.toLowerCase();
        return items.filter(f =>
            f.nome?.toLowerCase().includes(s) ||
            f.cnpj?.includes(s) ||
            f.cidade?.toLowerCase().includes(s) ||
            f.contato?.toLowerCase().includes(s)
        );
    }, [items, search]);

    const openNew = () => { setForm({ ...emptyFornecedor }); setEditId(null); setShowForm(true); };
    const openEdit = (item) => { setForm({ ...item }); setEditId(item.id); setShowForm(true); };
    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const save = async () => {
        if (!form.nome?.trim()) { notify?.('Nome do fornecedor obrigatorio', 'error'); return; }
        setSaving(true);
        try {
            if (editId) await api.put(`/compras/fornecedores/${editId}`, form);
            else await api.post('/compras/fornecedores', form);
            setShowForm(false);
            notify?.(editId ? 'Fornecedor atualizado' : 'Fornecedor criado', 'success');
            load();
        } catch (e) {
            notify?.(e.error || 'Erro ao salvar fornecedor', 'error');
        } finally { setSaving(false); }
    };

    const del = (id) => setConfirmDelId(id);
    const delConfirmado = async () => {
        const id = confirmDelId;
        setConfirmDelId(null);
        try {
            await api.del(`/compras/fornecedores/${id}`);
            notify?.('Fornecedor excluido', 'success');
            load();
        } catch (e) {
            notify?.(e.error || 'Erro ao excluir', 'error');
        }
    };

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 400 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className={Z.inp} placeholder="Buscar fornecedor..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: 32, width: '100%' }} />
                </div>
                <button className={Z.btn} onClick={openNew} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Novo Fornecedor
                </button>
            </div>

            {loading ? <Spinner text="Carregando fornecedores..." /> : filtered.length === 0 ? (
                <EmptyState icon={Truck} title="Nenhum fornecedor" description={search ? 'Nenhum resultado para a busca.' : 'Cadastre seu primeiro fornecedor.'} action={!search ? { label: 'Novo Fornecedor', onClick: openNew } : undefined} />
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                <th className={Z.th}>Nome</th>
                                <th className={Z.th}>CNPJ</th>
                                <th className={Z.th}>Telefone</th>
                                <th className={Z.th} style={{ display: 'none' }}>Cidade/UF</th>
                                <th className={Z.th}>Contato</th>
                                <th className={Z.th} style={{ width: 80 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(f => (
                                <tr key={f.id} className="tr-hover">
                                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{f.nome}</td>
                                    <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{fmtCnpj(f.cnpj)}</td>
                                    <td style={{ padding: '8px 10px' }}>{f.telefone || '—'}</td>
                                    <td style={{ padding: '8px 10px' }}>{[f.cidade, f.estado].filter(Boolean).join('/') || '—'}</td>
                                    <td style={{ padding: '8px 10px' }}>{f.contato || '—'}</td>
                                    <td style={{ padding: '8px 10px', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                        <button onClick={() => openEdit(f)} className={Z.btn2Sm} title="Editar"><Edit2 size={13} /></button>
                                        <button onClick={() => del(f.id)} className={Z.btnDSm} title="Excluir"><Trash2 size={13} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {confirmDelId && (
                <ConfirmModal
                    title="Excluir Fornecedor"
                    message="Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita."
                    onConfirm={delConfirmado}
                    onCancel={() => setConfirmDelId(null)}
                />
            )}

            {/* Modal Form */}
            {showForm && (
                <Modal title={editId ? 'Editar Fornecedor' : 'Novo Fornecedor'} close={() => setShowForm(false)} w={520}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <label className={Z.lbl}>Nome *</label>
                            <input className={Z.inp} value={form.nome} onChange={e => setF('nome', e.target.value)} placeholder="Razao social ou fantasia" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label className={Z.lbl}>CNPJ/CPF</label>
                                <input className={Z.inp} value={form.cnpj || ''} onChange={e => setF('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
                            </div>
                            <div>
                                <label className={Z.lbl}>Telefone</label>
                                <input className={Z.inp} value={form.telefone || ''} onChange={e => setF('telefone', e.target.value)} placeholder="(00) 00000-0000" />
                            </div>
                        </div>
                        <div>
                            <label className={Z.lbl}>Email</label>
                            <input className={Z.inp} value={form.email || ''} onChange={e => setF('email', e.target.value)} placeholder="email@fornecedor.com" type="email" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                            <div>
                                <label className={Z.lbl}>Cidade</label>
                                <input className={Z.inp} value={form.cidade || ''} onChange={e => setF('cidade', e.target.value)} />
                            </div>
                            <div>
                                <label className={Z.lbl}>Estado</label>
                                <input className={Z.inp} value={form.estado || ''} onChange={e => setF('estado', e.target.value)} maxLength={2} placeholder="SP" style={{ textTransform: 'uppercase' }} />
                            </div>
                        </div>
                        <div>
                            <label className={Z.lbl}>Contato (nome)</label>
                            <input className={Z.inp} value={form.contato || ''} onChange={e => setF('contato', e.target.value)} placeholder="Pessoa de contato" />
                        </div>
                        <div>
                            <label className={Z.lbl}>Observacoes</label>
                            <textarea className={Z.inp} value={form.obs || ''} onChange={e => setF('obs', e.target.value)} rows={2} style={{ resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                            <button className={Z.btn2} onClick={() => setShowForm(false)}>Cancelar</button>
                            <button className={Z.btn} onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                                {editId ? 'Salvar' : 'Cadastrar'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// TAB 2 — NF Entrada (XML)
// ═══════════════════════════════════════════════════════════
function TabNFEntrada({ notify }) {
    const [mode, setMode] = useState('upload'); // 'upload' | 'review' | 'historico'
    const [dragging, setDragging] = useState(false);
    const [xmlText, setXmlText] = useState('');
    const [uploading, setUploading] = useState(false);
    const [nfData, setNfData] = useState(null);
    const [acoes, setAcoes] = useState({});
    const [biblioteca, setBiblioteca] = useState([]);
    const [processando, setProcessando] = useState(false);
    const [nfList, setNfList] = useState([]);
    const [nfListLoading, setNfListLoading] = useState(false);
    const [viewNf, setViewNf] = useState(null);
    const fileRef = useRef(null);

    // Load biblioteca for matching dropdown
    useEffect(() => {
        api.get('/biblioteca').then(d => setBiblioteca(Array.isArray(d) ? d : [])).catch(() => {});
    }, []);

    const loadNfList = useCallback(async () => {
        setNfListLoading(true);
        try {
            const data = await api.get('/compras/nf');
            setNfList(Array.isArray(data) ? data : []);
        } catch { setNfList([]); }
        finally { setNfListLoading(false); }
    }, []);

    useEffect(() => { loadNfList(); }, [loadNfList]);

    // Handle XML upload (file or paste)
    const processXml = async (xmlContent) => {
        setUploading(true);
        try {
            const result = await api.post('/compras/xml-upload', { xml: xmlContent });
            setNfData(result);
            // Initialize acoes for each item
            const initial = {};
            (result.itens || []).forEach(item => {
                initial[item.id || item.idx] = {
                    acao: item.match_id ? 'atualizar' : 'ignorar',
                    biblioteca_id: item.match_id || '',
                };
            });
            setAcoes(initial);
            setMode('review');
            notify?.('XML processado com sucesso', 'success');
        } catch (e) {
            notify?.(e.error || 'Erro ao processar XML', 'error');
        } finally { setUploading(false); }
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.xml')) {
            notify?.('Selecione um arquivo XML', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => processXml(ev.target.result);
        reader.readAsText(file);
    };

    const handlePasteUpload = () => {
        if (!xmlText.trim()) { notify?.('Cole o conteudo XML', 'error'); return; }
        processXml(xmlText.trim());
    };

    const setItemAcao = (itemKey, field, value) => {
        setAcoes(prev => ({ ...prev, [itemKey]: { ...prev[itemKey], [field]: value } }));
    };

    const processarNf = async () => {
        if (!nfData?.nf_id) return;
        setProcessando(true);
        try {
            const acoesList = Object.entries(acoes).map(([item_id, data]) => ({
                item_id,
                acao: data.acao,
                biblioteca_id: data.biblioteca_id || null,
            }));
            await api.post('/compras/xml-processar', { nf_id: nfData.nf_id, acoes: acoesList });
            notify?.('NF processada com sucesso!', 'success');
            setMode('upload');
            setNfData(null);
            setAcoes({});
            setXmlText('');
            loadNfList();
        } catch (e) {
            notify?.(e.error || 'Erro ao processar NF', 'error');
        } finally { setProcessando(false); }
    };

    const viewNfDetails = async (id) => {
        try {
            const data = await api.get(`/compras/nf/${id}`);
            setViewNf(data);
        } catch (e) {
            notify?.(e.error || 'Erro ao carregar NF', 'error');
        }
    };

    // ── Upload Area ────────────────────────────────────────
    if (mode === 'upload') {
        return (
            <div>
                {/* Upload zone */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileRef.current?.click()}
                    style={{
                        border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 16,
                        padding: '40px 24px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all .2s',
                        background: dragging ? 'var(--primary-alpha, rgba(19,121,240,0.06))' : 'var(--bg-muted)',
                        marginBottom: 16,
                    }}
                >
                    <input ref={fileRef} type="file" accept=".xml" onChange={handleFileDrop} style={{ display: 'none' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: 16,
                            background: dragging ? 'var(--primary)' : 'var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all .2s',
                        }}>
                            <Upload size={24} style={{ color: dragging ? '#fff' : 'var(--text-muted)' }} />
                        </div>
                        <div>
                            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text-primary)' }}>
                                Arraste o XML da NF aqui
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                                ou clique para selecionar o arquivo
                            </p>
                        </div>
                    </div>
                </div>

                {/* OR paste */}
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600 }}>OU COLE O XML ABAIXO</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                    <textarea
                        className={Z.inp}
                        placeholder="Cole o conteudo completo do XML da NF-e aqui..."
                        value={xmlText}
                        onChange={e => setXmlText(e.target.value)}
                        rows={4}
                        style={{ flex: 1, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <button className={Z.btn} onClick={handlePasteUpload} disabled={uploading || !xmlText.trim()} style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {uploading ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
                        Processar
                    </button>
                </div>

                {uploading && (
                    <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-muted)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
                        Processando XML...
                    </div>
                )}

                {/* NF History */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>NFs importadas</h3>
                        <button className={Z.btn2Sm} onClick={loadNfList} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <RefreshCw size={12} /> Atualizar
                        </button>
                    </div>

                    {nfListLoading ? <Spinner text="Carregando..." /> : nfList.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                            Nenhuma NF importada ainda.
                        </p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr>
                                        <th className={Z.th}>Numero</th>
                                        <th className={Z.th}>Fornecedor</th>
                                        <th className={Z.th}>Data</th>
                                        <th className={Z.th}>Valor</th>
                                        <th className={Z.th}>Itens</th>
                                        <th className={Z.th} style={{ width: 60 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {nfList.map(nf => (
                                        <tr key={nf.id} className="tr-hover">
                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{nf.numero || '—'}</td>
                                            <td style={{ padding: '8px 10px' }}>{nf.fornecedor_nome || '—'}</td>
                                            <td style={{ padding: '8px 10px' }}>{fmtDate(nf.data_emissao)}</td>
                                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{R$(nf.valor_total)}</td>
                                            <td style={{ padding: '8px 10px' }}>{nf.qtd_itens ?? '—'}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <button className={Z.btn2Sm} onClick={() => viewNfDetails(nf.id)} title="Ver detalhes">
                                                    <Eye size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* View NF detail modal */}
                {viewNf && (
                    <Modal title={`NF ${viewNf.numero || ''}`} close={() => setViewNf(null)} w={700}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                                <div><strong>Fornecedor:</strong> {viewNf.fornecedor_nome || '—'}</div>
                                <div><strong>Data:</strong> {fmtDate(viewNf.data_emissao)}</div>
                                <div><strong>Valor Total:</strong> {R$(viewNf.valor_total)}</div>
                                <div><strong>Chave:</strong> <span style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>{viewNf.chave || '—'}</span></div>
                            </div>
                            {viewNf.itens?.length > 0 && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr>
                                                <th className={Z.th}>Descricao</th>
                                                <th className={Z.th}>NCM</th>
                                                <th className={Z.th}>Qtd</th>
                                                <th className={Z.th}>V.Unit</th>
                                                <th className={Z.th}>V.Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {viewNf.itens.map((it, i) => (
                                                <tr key={i}>
                                                    <td style={{ padding: '6px 8px' }}>{it.descricao}</td>
                                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>{it.ncm || '—'}</td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{N(it.qtd)}</td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{R$(it.valor_unit)}</td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{R$(it.valor_total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </Modal>
                )}
            </div>
        );
    }

    // ── Review Mode ────────────────────────────────────────
    if (mode === 'review' && nfData) {
        return (
            <div>
                {/* NF Header */}
                <div className={Z.card} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>NF-e {nfData.numero || ''}</h3>
                            <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                <span><strong>Fornecedor:</strong> {nfData.fornecedor_nome || '—'}</span>
                                <span><strong>Data:</strong> {fmtDate(nfData.data_emissao)}</span>
                                <span><strong>Valor:</strong> <strong style={{ color: 'var(--text-primary)' }}>{R$(nfData.valor_total)}</strong></span>
                            </div>
                        </div>
                        <button className={Z.btn2} onClick={() => { setMode('upload'); setNfData(null); setAcoes({}); }} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <X size={14} /> Cancelar
                        </button>
                    </div>
                </div>

                {/* Items table */}
                <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr>
                                <th className={Z.th} style={{ minWidth: 200 }}>Descricao</th>
                                <th className={Z.th}>NCM</th>
                                <th className={Z.th} style={{ textAlign: 'right' }}>Qtd</th>
                                <th className={Z.th} style={{ textAlign: 'right' }}>V.Unit NF</th>
                                <th className={Z.th} style={{ textAlign: 'right' }}>V.Total</th>
                                <th className={Z.th} style={{ minWidth: 180 }}>Match Biblioteca</th>
                                <th className={Z.th} style={{ textAlign: 'center' }}>Comparacao</th>
                                <th className={Z.th} style={{ minWidth: 150 }}>Acao</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(nfData.itens || []).map((item) => {
                                const key = item.id || item.idx;
                                const itemAcao = acoes[key] || { acao: 'ignorar', biblioteca_id: '' };
                                const matchedLib = itemAcao.biblioteca_id ? biblioteca.find(b => String(b.id) === String(itemAcao.biblioteca_id)) : null;
                                const diff = matchedLib ? pctDiff(matchedLib.preco, item.valor_unit) : null;

                                return (
                                    <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '8px 8px', fontWeight: 500 }}>{item.descricao}</td>
                                        <td style={{ padding: '8px 8px', fontFamily: 'monospace', fontSize: 11 }}>{item.ncm || '—'}</td>
                                        <td style={{ padding: '8px 8px', textAlign: 'right' }}>{N(item.qtd)}</td>
                                        <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{R$(item.valor_unit)}</td>
                                        <td style={{ padding: '8px 8px', textAlign: 'right' }}>{R$(item.valor_total)}</td>

                                        {/* Match dropdown */}
                                        <td style={{ padding: '8px 8px' }}>
                                            <select
                                                className={Z.inp}
                                                value={itemAcao.biblioteca_id || ''}
                                                onChange={e => setItemAcao(key, 'biblioteca_id', e.target.value)}
                                                style={{ fontSize: 12, padding: '4px 6px', maxWidth: 200 }}
                                            >
                                                <option value="">— Selecionar material —</option>
                                                <option value="__novo__">+ Novo Material</option>
                                                {biblioteca.map(b => (
                                                    <option key={b.id} value={b.id}>{b.nome} ({R$(b.preco)})</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Price comparison */}
                                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                            {matchedLib && diff !== null ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                                    {diff <= 0 ? (
                                                        <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                            <TrendingDown size={13} /> {N(Math.abs(diff), 1)}%
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>
                                                            <TrendingUp size={13} /> +{N(diff, 1)}%
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                        (atual: {R$(matchedLib.preco)})
                                                    </span>
                                                </div>
                                            ) : (
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                                            )}
                                        </td>

                                        {/* Action select */}
                                        <td style={{ padding: '8px 8px' }}>
                                            <select
                                                className={Z.inp}
                                                value={itemAcao.acao}
                                                onChange={e => setItemAcao(key, 'acao', e.target.value)}
                                                style={{ fontSize: 12, padding: '4px 6px' }}
                                            >
                                                <option value="ignorar">Ignorar</option>
                                                <option value="atualizar">Atualizar Preco</option>
                                                <option value="estoque">Entrada Estoque</option>
                                                <option value="ambos">Ambos</option>
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Bulk action buttons */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className={Z.btn2Sm} onClick={() => {
                            setAcoes(prev => {
                                const next = { ...prev };
                                Object.keys(next).forEach(k => { next[k] = { ...next[k], acao: 'ambos' }; });
                                return next;
                            });
                        }} style={{ fontSize: 12 }}>Todos: Ambos</button>
                        <button className={Z.btn2Sm} onClick={() => {
                            setAcoes(prev => {
                                const next = { ...prev };
                                Object.keys(next).forEach(k => { next[k] = { ...next[k], acao: 'atualizar' }; });
                                return next;
                            });
                        }} style={{ fontSize: 12 }}>Todos: Atualizar</button>
                        <button className={Z.btn2Sm} onClick={() => {
                            setAcoes(prev => {
                                const next = { ...prev };
                                Object.keys(next).forEach(k => { next[k] = { ...next[k], acao: 'ignorar' }; });
                                return next;
                            });
                        }} style={{ fontSize: 12 }}>Todos: Ignorar</button>
                    </div>
                    <button className={Z.btn} onClick={processarNf} disabled={processando} style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}>
                        {processando ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Processar NF
                    </button>
                </div>
            </div>
        );
    }

    return null;
}

// ═══════════════════════════════════════════════════════════
// TAB 3 — Ordens de Compra
// ═══════════════════════════════════════════════════════════
function TabOrdens({ notify }) {
    const [ordens, setOrdens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ ...emptyOrdem });
    const [saving, setSaving] = useState(false);
    const [fornecedores, setFornecedores] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get('/compras/ordens');
            setOrdens(Array.isArray(data) ? data : []);
        } catch { setOrdens([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        api.get('/compras/fornecedores').then(d => setFornecedores(Array.isArray(d) ? d : [])).catch(() => {});
    }, []);

    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const addItem = () => {
        setForm(p => ({ ...p, itens: [...p.itens, { descricao: '', qtd: 1, valor_unit: 0 }] }));
    };

    const updateItem = (idx, field, value) => {
        setForm(p => {
            const itens = [...p.itens];
            itens[idx] = { ...itens[idx], [field]: value };
            return { ...p, itens };
        });
    };

    const removeItem = (idx) => {
        setForm(p => ({ ...p, itens: p.itens.filter((_, i) => i !== idx) }));
    };

    const totalOrdem = useMemo(() => {
        return form.itens.reduce((sum, it) => sum + (parseFloat(it.qtd) || 0) * (parseFloat(it.valor_unit) || 0), 0);
    }, [form.itens]);

    const save = async () => {
        if (!form.fornecedor_id) { notify?.('Selecione um fornecedor', 'error'); return; }
        if (form.itens.length === 0 || !form.itens[0].descricao) { notify?.('Adicione ao menos um item', 'error'); return; }
        setSaving(true);
        try {
            await api.post('/compras/ordens', form);
            setShowForm(false);
            setForm({ ...emptyOrdem });
            notify?.('Ordem de compra criada', 'success');
            load();
        } catch (e) {
            notify?.(e.error || 'Erro ao criar ordem', 'error');
        } finally { setSaving(false); }
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'flex-end' }}>
                <button className={Z.btn} onClick={() => { setForm({ ...emptyOrdem }); setShowForm(true); }} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Nova Ordem
                </button>
            </div>

            {loading ? <Spinner text="Carregando ordens..." /> : ordens.length === 0 ? (
                <EmptyState icon={ClipboardList} title="Nenhuma ordem de compra" description="Crie sua primeira ordem de compra." action={{ label: 'Nova Ordem', onClick: () => { setForm({ ...emptyOrdem }); setShowForm(true); } }} />
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                <th className={Z.th}>Numero</th>
                                <th className={Z.th}>Fornecedor</th>
                                <th className={Z.th}>Projeto</th>
                                <th className={Z.th} style={{ textAlign: 'right' }}>Valor</th>
                                <th className={Z.th}>Status</th>
                                <th className={Z.th}>Data</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ordens.map(o => {
                                const st = STATUS_ORDEM[o.status] || STATUS_ORDEM.rascunho;
                                return (
                                    <tr key={o.id} className="tr-hover">
                                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>#{o.numero || o.id}</td>
                                        <td style={{ padding: '8px 10px' }}>{o.fornecedor_nome || '—'}</td>
                                        <td style={{ padding: '8px 10px' }}>{o.projeto_nome || '—'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{R$(o.valor_total)}</td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                                background: `${st.color}18`, color: st.color, display: 'inline-block',
                                            }}>{st.label}</span>
                                        </td>
                                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{fmtDate(o.criado_em)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Nova Ordem */}
            {showForm && (
                <Modal title="Nova Ordem de Compra" close={() => setShowForm(false)} w={700}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label className={Z.lbl}>Fornecedor *</label>
                                <select className={Z.inp} value={form.fornecedor_id} onChange={e => setF('fornecedor_id', e.target.value)}>
                                    <option value="">— Selecionar —</option>
                                    {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={Z.lbl}>Projeto (opcional)</label>
                                <input className={Z.inp} value={form.projeto_id || ''} onChange={e => setF('projeto_id', e.target.value)} placeholder="ID do projeto" />
                            </div>
                        </div>
                        <div>
                            <label className={Z.lbl}>Observacoes</label>
                            <textarea className={Z.inp} value={form.obs || ''} onChange={e => setF('obs', e.target.value)} rows={2} style={{ resize: 'vertical' }} />
                        </div>

                        {/* Items */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <label className={Z.lbl} style={{ margin: 0 }}>Itens</label>
                                <button className={Z.btn2Sm} onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                    <Plus size={12} /> Adicionar item
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {form.itens.map((it, i) => (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 32px', gap: 8, alignItems: 'center' }}>
                                        <input className={Z.inp} placeholder="Descricao do item" value={it.descricao} onChange={e => updateItem(i, 'descricao', e.target.value)} />
                                        <input className={Z.inp} placeholder="Qtd" type="number" min={1} value={it.qtd} onChange={e => updateItem(i, 'qtd', e.target.value)} style={{ textAlign: 'right' }} />
                                        <input className={Z.inp} placeholder="Valor unit." type="number" min={0} step="0.01" value={it.valor_unit} onChange={e => updateItem(i, 'valor_unit', e.target.value)} style={{ textAlign: 'right' }} />
                                        <button onClick={() => removeItem(i)} className={Z.btnDSm} style={{ padding: 4 }} disabled={form.itens.length <= 1}><Trash2 size={13} /></button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ textAlign: 'right', marginTop: 8, fontSize: 14, fontWeight: 700 }}>
                                Total: {R$(totalOrdem)}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                            <button className={Z.btn2} onClick={() => setShowForm(false)}>Cancelar</button>
                            <button className={Z.btn} onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                                Criar Ordem
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// TAB 4 — Relatorios
// ═══════════════════════════════════════════════════════════
function TabRelatorios({ notify }) {
    const [subTab, setSubTab] = useState('abc'); // 'abc' | 'historico'
    const [abcData, setAbcData] = useState(null);
    const [abcLoading, setAbcLoading] = useState(false);
    const [biblioteca, setBiblioteca] = useState([]);
    const [selectedMat, setSelectedMat] = useState('');
    const [histData, setHistData] = useState(null);
    const [histLoading, setHistLoading] = useState(false);

    useEffect(() => {
        api.get('/biblioteca').then(d => setBiblioteca(Array.isArray(d) ? d : [])).catch(() => {});
    }, []);

    const loadAbc = async () => {
        setAbcLoading(true);
        try {
            const data = await api.get('/compras/relatorios/abc');
            setAbcData(data);
        } catch (e) {
            notify?.(e.error || 'Erro ao carregar curva ABC', 'error');
        } finally { setAbcLoading(false); }
    };

    const loadHistorico = async (matId) => {
        if (!matId) return;
        setHistLoading(true);
        try {
            const data = await api.get(`/compras/relatorios/historico-preco/${matId}`);
            setHistData(data);
        } catch (e) {
            notify?.(e.error || 'Erro ao carregar historico', 'error');
        } finally { setHistLoading(false); }
    };

    return (
        <div>
            {/* Sub-tab selector */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                <button
                    className={subTab === 'abc' ? Z.btn : Z.btn2}
                    onClick={() => setSubTab('abc')}
                    style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <BarChart3 size={14} /> Curva ABC
                </button>
                <button
                    className={subTab === 'historico' ? Z.btn : Z.btn2}
                    onClick={() => setSubTab('historico')}
                    style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <TrendingUp size={14} /> Historico de Precos
                </button>
            </div>

            {/* ABC */}
            {subTab === 'abc' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                            Classificacao ABC de materiais por valor total de compras
                        </p>
                        <button className={Z.btn2} onClick={loadAbc} disabled={abcLoading} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {abcLoading ? <RefreshCw size={14} className="animate-spin" /> : <BarChart3 size={14} />}
                            {abcData ? 'Atualizar' : 'Gerar Curva ABC'}
                        </button>
                    </div>

                    {abcLoading && <Spinner text="Calculando curva ABC..." />}

                    {abcData && !abcLoading && (
                        <div>
                            {/* Summary cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                                {[
                                    { cls: 'A', color: 'var(--danger)', desc: '80% do valor', items: abcData.items?.filter(i => i.classe === 'A') || [] },
                                    { cls: 'B', color: 'var(--warning)', desc: '15% do valor', items: abcData.items?.filter(i => i.classe === 'B') || [] },
                                    { cls: 'C', color: 'var(--success)', desc: '5% do valor', items: abcData.items?.filter(i => i.classe === 'C') || [] },
                                ].map(g => (
                                    <div key={g.cls} style={{
                                        borderRadius: 12, padding: 16, border: `2px solid ${g.color}30`,
                                        background: `${g.color}08`, textAlign: 'center',
                                    }}>
                                        <div style={{ fontSize: 28, fontWeight: 800, color: g.color }}>{g.cls}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{g.items.length} itens</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.desc}</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                                            {R$(g.items.reduce((s, i) => s + (i.valor_total || 0), 0))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* ABC bar visualization */}
                            {(abcData.items || []).length > 0 && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr>
                                                <th className={Z.th}>Classe</th>
                                                <th className={Z.th}>Material</th>
                                                <th className={Z.th} style={{ textAlign: 'right' }}>Valor Total</th>
                                                <th className={Z.th} style={{ textAlign: 'right' }}>% Acum.</th>
                                                <th className={Z.th} style={{ minWidth: 120 }}>Participacao</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(abcData.items || []).map((item, i) => {
                                                const clsColor = item.classe === 'A' ? 'var(--danger)' : item.classe === 'B' ? 'var(--warning)' : 'var(--success)';
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                            <span style={{
                                                                fontWeight: 800, fontSize: 12, padding: '2px 8px',
                                                                borderRadius: 6, background: `${clsColor}18`, color: clsColor,
                                                            }}>{item.classe}</span>
                                                        </td>
                                                        <td style={{ padding: '6px 8px', fontWeight: 500 }}>{item.nome}</td>
                                                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{R$(item.valor_total)}</td>
                                                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{N(item.pct_acum, 1)}%</td>
                                                        <td style={{ padding: '6px 8px' }}>
                                                            <div style={{
                                                                height: 8, borderRadius: 4, background: 'var(--bg-muted)',
                                                                overflow: 'hidden',
                                                            }}>
                                                                <div style={{
                                                                    height: '100%', width: `${Math.min(item.pct || 0, 100)}%`,
                                                                    background: clsColor, borderRadius: 4, transition: 'width .3s',
                                                                }} />
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
                    )}

                    {!abcData && !abcLoading && (
                        <EmptyState icon={BarChart3} title="Curva ABC" description="Clique em 'Gerar Curva ABC' para visualizar a classificacao de materiais." />
                    )}
                </div>
            )}

            {/* Historico de precos */}
            {subTab === 'historico' && (
                <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 300px' }}>
                            <label className={Z.lbl}>Material</label>
                            <select
                                className={Z.inp}
                                value={selectedMat}
                                onChange={e => { setSelectedMat(e.target.value); setHistData(null); }}
                            >
                                <option value="">— Selecione um material —</option>
                                {biblioteca.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                            </select>
                        </div>
                        <button
                            className={Z.btn}
                            onClick={() => loadHistorico(selectedMat)}
                            disabled={!selectedMat || histLoading}
                            style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            {histLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                            Consultar
                        </button>
                    </div>

                    {histLoading && <Spinner text="Carregando historico..." />}

                    {histData && !histLoading && (
                        <div>
                            {(histData.registros || histData.items || []).length === 0 ? (
                                <EmptyState icon={TrendingUp} title="Sem historico" description="Nenhum registro de preco encontrado para este material." />
                            ) : (
                                <div>
                                    {/* Price trend visualization */}
                                    <div className={Z.card} style={{ marginBottom: 16 }}>
                                        <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
                                            Evolucao de Preco — {histData.material_nome || biblioteca.find(b => String(b.id) === selectedMat)?.nome || ''}
                                        </h4>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 120, padding: '0 4px' }}>
                                            {(histData.registros || histData.items || []).map((r, i, arr) => {
                                                const maxVal = Math.max(...arr.map(x => x.preco || x.valor || 0));
                                                const val = r.preco || r.valor || 0;
                                                const hPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                                                const prev = i > 0 ? (arr[i - 1].preco || arr[i - 1].valor || 0) : val;
                                                const isUp = val > prev;
                                                const isDown = val < prev;
                                                return (
                                                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ fontSize: 10, fontWeight: 600, color: isUp ? 'var(--danger)' : isDown ? 'var(--success)' : 'var(--text-muted)' }}>
                                                            {R$(val)}
                                                        </span>
                                                        <div style={{
                                                            width: '100%', maxWidth: 40, borderRadius: '4px 4px 0 0',
                                                            background: isUp ? 'var(--danger)' : isDown ? 'var(--success)' : 'var(--primary)',
                                                            height: `${Math.max(hPct, 8)}%`, minHeight: 6,
                                                            transition: 'height .3s', opacity: 0.8,
                                                        }} />
                                                        <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                            {fmtDate(r.data)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Table */}
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                            <thead>
                                                <tr>
                                                    <th className={Z.th}>Data</th>
                                                    <th className={Z.th}>Fornecedor</th>
                                                    <th className={Z.th} style={{ textAlign: 'right' }}>Preco</th>
                                                    <th className={Z.th} style={{ textAlign: 'center' }}>Variacao</th>
                                                    <th className={Z.th}>NF</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(histData.registros || histData.items || []).map((r, i, arr) => {
                                                    const val = r.preco || r.valor || 0;
                                                    const prev = i > 0 ? (arr[i - 1].preco || arr[i - 1].valor || 0) : null;
                                                    const diff = prev != null ? pctDiff(prev, val) : null;
                                                    return (
                                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '6px 8px' }}>{fmtDate(r.data)}</td>
                                                            <td style={{ padding: '6px 8px' }}>{r.fornecedor || '—'}</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{R$(val)}</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                                {diff != null ? (
                                                                    <span style={{
                                                                        color: diff > 0 ? 'var(--danger)' : diff < 0 ? 'var(--success)' : 'var(--text-muted)',
                                                                        fontWeight: 700, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 2,
                                                                    }}>
                                                                        {diff > 0 ? <ArrowUp size={11} /> : diff < 0 ? <ArrowDown size={11} /> : null}
                                                                        {diff > 0 ? '+' : ''}{N(diff, 1)}%
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '6px 8px', fontSize: 11 }}>{r.nf_numero || '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!histData && !histLoading && selectedMat && (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
                            Clique em "Consultar" para ver o historico de precos.
                        </p>
                    )}

                    {!selectedMat && !histLoading && (
                        <EmptyState icon={TrendingUp} title="Historico de Precos" description="Selecione um material para visualizar o historico de precos ao longo do tempo." />
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
const TABS = [
    { id: 'fornecedores', label: 'Fornecedores', icon: Truck },
    { id: 'nf', label: 'NF Entrada (XML)', icon: FileText },
    { id: 'ordens', label: 'Ordens de Compra', icon: ClipboardList },
    { id: 'relatorios', label: 'Relatorios', icon: BarChart3 },
];

export default function Compras({ notify }) {
    const [tab, setTab] = useState('fornecedores');

    return (
        <div className={Z.pg}>
            <PageHeader icon={ShoppingCart} title="Compras" subtitle="Fornecedores, notas fiscais, ordens de compra e relatorios">
            </PageHeader>

            <TabBar tabs={TABS} active={tab} onChange={setTab} />

            <div className={Z.card}>
                {tab === 'fornecedores' && <TabFornecedores notify={notify} />}
                {tab === 'nf' && <TabNFEntrada notify={notify} />}
                {tab === 'ordens' && <TabOrdens notify={notify} />}
                {tab === 'relatorios' && <TabRelatorios notify={notify} />}
            </div>
        </div>
    );
}
