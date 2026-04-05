import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PageHeader, Z, Ic, Modal, Spinner, EmptyState, tagStyle } from '../ui';
import PecaViewer3D from '../components/PecaViewer3D';
import EditorSilhueta2D from '../components/modelagem/EditorSilhueta2D';
import Viewport3DPreview from '../components/modelagem/Viewport3DPreview';
import {
    Layers, Plus, ArrowLeft, Link2, Unlink, Copy, Trash2, X, ChevronDown,
    CheckCircle2, AlertTriangle, XCircle, Calculator, Upload, ExternalLink,
    Box, FileText, Send, RotateCcw, Package, Eye, PenTool, Save
} from 'lucide-react';

const STATUS_COLORS = {
    rascunho: { bg: '#f1f5f9', text: '#64748b', label: 'Rascunho' },
    em_revisao: { bg: '#fef3c7', text: '#92400e', label: 'Em Revisao' },
    aguardando_aprovacao: { bg: '#dbeafe', text: '#1e40af', label: 'Aguardando Aprovacao' },
    aprovado: { bg: '#dcfce7', text: '#166534', label: 'Aprovado' },
    em_producao: { bg: '#f3e8ff', text: '#6b21a8', label: 'Em Producao' },
    concluido: { bg: '#d1fae5', text: '#065f46', label: 'Concluido' },
    cancelado: { bg: '#fee2e2', text: '#991b1b', label: 'Cancelado' },
};

function InfoCard({ label, value, highlight }) {
    return (
        <div className="glass-card" style={{ padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: highlight ? 'var(--primary)' : 'var(--text-primary)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
        </div>
    );
}

const PROCESSOS = [
    { value: 'corte_2d', label: 'Corte 2D' },
    { value: 'kerf_bending', label: 'Kerf Bending' },
    { value: 'laminacao_vacuo', label: 'Laminacao Vacuo' },
    { value: 'fresagem_3d', label: 'Fresagem 3D' },
    { value: 'stacking', label: 'Stacking' },
    { value: 'manual', label: 'Manual' },
];

export default function Modelagem({ api, notify }) {
    const [projetos, setProjetos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [projetoSel, setProjetoSel] = useState(null); // full project with pecas
    const [materiais, setMateriais] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');

    // Modals
    const [showNovo, setShowNovo] = useState(false);
    const [showKerf, setShowKerf] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [showEditor, setShowEditor] = useState(false);
    const [editorCommands, setEditorCommands] = useState([]);
    const autoSaveTimer = useRef(null);
    const widthMmEditor = 1000;
    const heightMmEditor = 600;
    const [showLink, setShowLink] = useState(null); // { token, expira_em }

    // Peca editor
    const [pecaSel, setPecaSel] = useState(null);
    const [showNovaPeca, setShowNovaPeca] = useState(false);

    // ── Load data ──
    const loadProjetos = useCallback(() => {
        setLoading(true);
        api.get('/modelagem/projetos')
            .then(r => setProjetos(Array.isArray(r) ? r : r.data || []))
            .catch(e => notify(e.error || 'Erro ao carregar projetos'))
            .finally(() => setLoading(false));
    }, [api, notify]);

    const loadMateriais = useCallback(() => {
        api.get('/modelagem/materiais').then(r => setMateriais(r)).catch(() => {});
    }, [api]);

    const loadClientes = useCallback(() => {
        api.get('/clientes').then(r => setClientes(Array.isArray(r) ? r : [])).catch(() => {});
    }, [api]);

    useEffect(() => { loadProjetos(); loadMateriais(); loadClientes(); }, [loadProjetos, loadMateriais, loadClientes]);

    const loadProjeto = useCallback((id) => {
        api.get(`/modelagem/projetos/${id}`)
            .then(r => { setProjetoSel(r); setPecaSel(null); })
            .catch(e => notify(e.error || 'Erro ao carregar projeto'));
    }, [api, notify]);

    // ── Filtered list ──
    const filtered = useMemo(() => {
        let list = projetos;
        if (filtroStatus) list = list.filter(p => p.status === filtroStatus);
        if (busca) {
            const q = busca.toLowerCase();
            list = list.filter(p => (p.nome || '').toLowerCase().includes(q) || (p.codigo || '').toLowerCase().includes(q) || (p.cliente_nome || '').toLowerCase().includes(q));
        }
        return list;
    }, [projetos, filtroStatus, busca]);

    // ── Stats ──
    const stats = useMemo(() => ({
        total: projetos.length,
        rascunho: projetos.filter(p => p.status === 'rascunho').length,
        aguardando: projetos.filter(p => p.status === 'aguardando_aprovacao').length,
        aprovado: projetos.filter(p => p.status === 'aprovado').length,
    }), [projetos]);

    // ── Handlers ──
    const criarProjeto = (data) => {
        api.post('/modelagem/projetos', data)
            .then(r => { notify('Projeto criado!'); setShowNovo(false); loadProjetos(); loadProjeto(r.id); })
            .catch(e => notify(e.error || 'Erro ao criar'));
    };

    const deletarProjeto = (id) => {
        if (!confirm('Cancelar este projeto?')) return;
        api.delete(`/modelagem/projetos/${id}`)
            .then(() => { notify('Projeto cancelado'); setProjetoSel(null); loadProjetos(); })
            .catch(e => notify(e.error || 'Erro'));
    };

    const gerarLink = (id) => {
        api.post(`/modelagem/projetos/${id}/link`)
            .then(r => { setShowLink(r); loadProjeto(id); notify('Link gerado!'); })
            .catch(e => notify(e.error || 'Erro ao gerar link'));
    };

    const desativarLink = (id) => {
        api.delete(`/modelagem/projetos/${id}/link`)
            .then(() => { notify('Link desativado'); loadProjeto(id); })
            .catch(e => notify(e.error || 'Erro'));
    };

    const criarPeca = (data) => {
        api.post(`/modelagem/projetos/${projetoSel.id}/pecas`, data)
            .then(r => { notify('Peca criada!'); setShowNovaPeca(false); loadProjeto(projetoSel.id); setPecaSel(r); })
            .catch(e => notify(e.error || 'Erro ao criar peca'));
    };

    const atualizarPeca = (id, data) => {
        api.put(`/modelagem/pecas/${id}`, data)
            .then(r => { setPecaSel(r); loadProjeto(projetoSel.id); })
            .catch(e => notify(e.error || 'Erro ao atualizar'));
    };

    const deletarPeca = (id) => {
        if (!confirm('Excluir esta peca?')) return;
        api.delete(`/modelagem/pecas/${id}`)
            .then(() => { notify('Peca excluida'); setPecaSel(null); loadProjeto(projetoSel.id); })
            .catch(e => notify(e.error || 'Erro'));
    };

    const duplicarPeca = (id) => {
        api.post(`/modelagem/pecas/${id}/duplicar`)
            .then(r => { notify('Peca duplicada!'); loadProjeto(projetoSel.id); setPecaSel(r); })
            .catch(e => notify(e.error || 'Erro'));
    };

    // ════════════════════════════════════════════
    // RENDER — Project Detail / Editor
    // ════════════════════════════════════════════
    if (projetoSel) {
        const st = STATUS_COLORS[projetoSel.status] || STATUS_COLORS.rascunho;
        const pecas = projetoSel.pecas || [];

        // Build a fake "peca" for 3D preview from pecaSel
        const peca3d = pecaSel ? {
            comprimento: pecaSel.bounding_box_x || 600,
            largura: pecaSel.bounding_box_y || 400,
            espessura: pecaSel.espessura || 18,
            material_code: pecaSel.material_nome || '',
            machining_json: null,
            grain: 'sem_veio',
        } : null;

        let fab = { valido: true, problemas: [], avisos: [] };
        try { fab = typeof pecaSel?.fabricabilidade === 'string' ? JSON.parse(pecaSel.fabricabilidade) : (pecaSel?.fabricabilidade || fab); } catch {}

        return (
            <div className={Z.pg}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <button onClick={() => { setProjetoSel(null); loadProjetos(); }} className={Z.btn2Sm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ArrowLeft size={14} /> Voltar
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{projetoSel.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {projetoSel.codigo} · {projetoSel.cliente_nome || 'Sem cliente'}
                        </div>
                    </div>
                    <span style={{ ...tagStyle(st.text === '#166534' ? 'green' : st.text === '#1e40af' ? 'blue' : st.text === '#6b21a8' ? 'purple' : 'gray'), padding: '4px 10px', fontSize: 11 }}>{st.label}</span>

                    <div style={{ display: 'flex', gap: 6 }}>
                        {projetoSel.link_ativo ? (
                            <button onClick={() => desativarLink(projetoSel.id)} className={Z.btn2Sm} title="Desativar link"><Unlink size={14} /></button>
                        ) : (
                            <button onClick={() => gerarLink(projetoSel.id)} className={Z.btnSm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Link2 size={14} /> Gerar Link
                            </button>
                        )}
                        {projetoSel.link_ativo && (
                            <button onClick={() => {
                                const url = `${window.location.origin}/aprovacao/${projetoSel.link_token}`;
                                navigator.clipboard.writeText(url);
                                notify('Link copiado!');
                            }} className={Z.btn2Sm} title="Copiar link"><Copy size={14} /></button>
                        )}
                        <button onClick={() => deletarProjeto(projetoSel.id)} className={Z.btnDSm} title="Cancelar projeto"><Trash2 size={14} /></button>
                    </div>
                </div>

                {/* Comentarios do cliente (se existir) */}
                {projetoSel.comentarios_cliente && (
                    <div className="glass-card" style={{ padding: '10px 14px', marginBottom: 16, borderLeft: '3px solid #f59e0b', background: '#fefce8' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>Comentario do Cliente</div>
                        <div style={{ fontSize: 12, color: '#78350f' }}>{projetoSel.comentarios_cliente}</div>
                    </div>
                )}

                {/* Two-panel layout */}
                <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
                    {/* Left — 3D Viewer */}
                    <div className="glass-card" style={{ flex: 1, minWidth: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Eye size={14} /> Preview 3D
                            {pecaSel && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — {pecaSel.nome}</span>}
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-muted)', minHeight: 350 }}>
                            {peca3d ? (
                                <PecaViewer3D peca={peca3d} width={500} height={350} />
                            ) : (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                                    <Box size={48} strokeWidth={1} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                                    <div style={{ fontSize: 13 }}>Selecione uma peca para visualizar em 3D</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right — Pieces + Properties */}
                    <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Piece list */}
                        <div className="glass-card" style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>Pecas ({pecas.length})</div>
                                <button onClick={() => setShowNovaPeca(true)} className={Z.btn2Sm} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Plus size={12} /> Adicionar
                                </button>
                            </div>
                            {pecas.length === 0 ? (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>Nenhuma peca ainda. Adicione a primeira.</div>
                            ) : (
                                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    {pecas.map(p => {
                                        let pfab = { valido: true };
                                        try { pfab = typeof p.fabricabilidade === 'string' ? JSON.parse(p.fabricabilidade) : p.fabricabilidade; } catch {}
                                        return (
                                            <div key={p.id} onClick={() => setPecaSel(p)} style={{
                                                padding: '8px 10px', cursor: 'pointer', borderRadius: 6, marginBottom: 4,
                                                background: pecaSel?.id === p.id ? 'rgba(19,121,240,0.08)' : 'transparent',
                                                border: pecaSel?.id === p.id ? '1px solid rgba(19,121,240,0.3)' : '1px solid transparent',
                                                transition: 'all 0.15s',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{
                                                        width: 8, height: 8, borderRadius: '50%',
                                                        background: pfab.valido ? '#22c55e' : '#ef4444',
                                                        flexShrink: 0
                                                    }} />
                                                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                                                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{p.material_nome || ''}</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, marginLeft: 14 }}>
                                                    {p.bounding_box_x ? `${Math.round(p.bounding_box_x)}x${Math.round(p.bounding_box_y)}` : '?'} x {p.espessura}mm
                                                    · {PROCESSOS.find(pr => pr.value === p.processo_fabricacao)?.label || p.processo_fabricacao}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Piece properties */}
                        {pecaSel && (
                            <div className="glass-card" style={{ padding: '10px 14px', flex: 1, overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>Propriedades</div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => duplicarPeca(pecaSel.id)} className={Z.btn2Sm} title="Duplicar"><Copy size={12} /></button>
                                        <button onClick={() => deletarPeca(pecaSel.id)} className={Z.btnDSm} title="Excluir"><Trash2 size={12} /></button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
                                    <div>
                                        <label className={Z.lbl}>Nome</label>
                                        <input className={Z.inp} value={pecaSel.nome} onChange={e => setPecaSel({ ...pecaSel, nome: e.target.value })}
                                            onBlur={() => atualizarPeca(pecaSel.id, { nome: pecaSel.nome })} style={{ fontSize: 12 }} />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                        <div>
                                            <label className={Z.lbl}>Material</label>
                                            <select className={Z.inp} value={pecaSel.material_id || ''} onChange={e => atualizarPeca(pecaSel.id, { material_id: parseInt(e.target.value) || null })} style={{ fontSize: 11 }}>
                                                <option value="">-- Selecione --</option>
                                                {materiais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={Z.lbl}>Espessura (mm)</label>
                                            <input className={Z.inp} type="number" value={pecaSel.espessura} onChange={e => setPecaSel({ ...pecaSel, espessura: parseFloat(e.target.value) || 18 })}
                                                onBlur={() => atualizarPeca(pecaSel.id, { espessura: pecaSel.espessura })} style={{ fontSize: 12 }} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={Z.lbl}>Processo</label>
                                        <select className={Z.inp} value={pecaSel.processo_fabricacao} onChange={e => atualizarPeca(pecaSel.id, { processo_fabricacao: e.target.value })} style={{ fontSize: 11 }}>
                                            {PROCESSOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                    </div>

                                    {/* Kerf calculator inline */}
                                    {pecaSel.processo_fabricacao === 'kerf_bending' && (
                                        <KerfPanel api={api} materialId={pecaSel.material_id} espessura={pecaSel.espessura} />
                                    )}

                                    {/* Fabricabilidade */}
                                    <div style={{
                                        padding: '8px 10px', borderRadius: 6,
                                        background: fab.valido ? (fab.avisos?.length ? '#fefce8' : '#f0fdf4') : '#fef2f2',
                                        border: `1px solid ${fab.valido ? (fab.avisos?.length ? '#fde68a' : '#bbf7d0') : '#fecaca'}`,
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                                            {fab.valido ? <CheckCircle2 size={13} color="#16a34a" /> : <XCircle size={13} color="#dc2626" />}
                                            Fabricabilidade: {fab.valido ? 'OK' : 'Problemas'}
                                        </div>
                                        {(fab.problemas || []).map((p, i) => (
                                            <div key={i} style={{ fontSize: 10, color: '#dc2626', display: 'flex', gap: 4, alignItems: 'flex-start', marginTop: 2 }}>
                                                <XCircle size={10} style={{ flexShrink: 0, marginTop: 1 }} /> {p.descricao}
                                            </div>
                                        ))}
                                        {(fab.avisos || []).map((a, i) => (
                                            <div key={i} style={{ fontSize: 10, color: '#92400e', display: 'flex', gap: 4, alignItems: 'flex-start', marginTop: 2 }}>
                                                <AlertTriangle size={10} style={{ flexShrink: 0, marginTop: 1 }} /> {a.descricao}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Dimensions info */}
                                    {pecaSel.area_real > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                            {[
                                                [`${Math.round(pecaSel.bounding_box_x || 0)}mm`, 'Largura'],
                                                [`${Math.round(pecaSel.bounding_box_y || 0)}mm`, 'Altura'],
                                                [`${(pecaSel.area_real / 1000000).toFixed(4)}m2`, 'Area'],
                                            ].map(([v, l]) => (
                                                <div key={l} style={{ textAlign: 'center', padding: '4px 2px', background: 'var(--bg-muted)', borderRadius: 4 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>{v}</div>
                                                    <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{l}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Editor silhueta button */}
                                    <button onClick={() => {
                                        let cmds = [];
                                        try {
                                            const geo = typeof pecaSel.geometria_silhueta === 'string' ? JSON.parse(pecaSel.geometria_silhueta) : pecaSel.geometria_silhueta;
                                            cmds = geo?.commands || [];
                                        } catch {}
                                        setEditorCommands(cmds);
                                        setShowEditor(true);
                                    }} className={Z.btn} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                                        <PenTool size={13} /> Editar Silhueta
                                    </button>

                                    <button onClick={() => setShowImport(true)} className={Z.btn2} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                                        <Upload size={13} /> Importar JSON
                                    </button>

                                    <div>
                                        <label className={Z.lbl}>Notas do Operador</label>
                                        <textarea className={Z.inp} rows={2} value={pecaSel.notas_operador || ''} onChange={e => setPecaSel({ ...pecaSel, notas_operador: e.target.value })}
                                            onBlur={() => atualizarPeca(pecaSel.id, { notas_operador: pecaSel.notas_operador })} style={{ fontSize: 11, resize: 'vertical' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Nova Peca Modal */}
                {showNovaPeca && <NovaPecaModal materiais={materiais} onSave={criarPeca} onClose={() => setShowNovaPeca(false)} />}

                {/* Import Geometry Modal */}
                {showImport && pecaSel && <ImportGeometriaModal pecaId={pecaSel.id} onSave={(geo) => { atualizarPeca(pecaSel.id, { geometria_silhueta: geo }); setShowImport(false); }} onClose={() => setShowImport(false)} />}

                {/* ═══ FULLSCREEN EDITOR MODAL ═══ */}
                {showEditor && pecaSel && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000,
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div style={{
                            width: '95vw', height: '90vh', background: '#fff', borderRadius: 12,
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                        }}>
                            {/* Header */}
                            <div style={{
                                padding: '10px 16px', borderBottom: '1px solid #e2e8f0',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: '#f8fafc',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <PenTool size={16} color="#1379F0" />
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>Editor de Silhueta</span>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>— {pecaSel.nome}</span>
                                    <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                                        {pecaSel.bounding_box_x ? `${Math.round(pecaSel.bounding_box_x)}x${Math.round(pecaSel.bounding_box_y)}` : `${widthMmEditor}x${heightMmEditor}`}mm
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <button onClick={() => {
                                        const geo = { type: 'path', width_mm: widthMmEditor, height_mm: heightMmEditor, commands: editorCommands };
                                        atualizarPeca(pecaSel.id, { geometria_silhueta: geo });
                                        notify('Silhueta salva!');
                                    }} className={Z.btnSm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Save size={13} /> Salvar
                                    </button>
                                    <button onClick={() => {
                                        // Save before closing
                                        if (editorCommands.length > 0) {
                                            const geo = { type: 'path', width_mm: widthMmEditor, height_mm: heightMmEditor, commands: editorCommands };
                                            atualizarPeca(pecaSel.id, { geometria_silhueta: geo });
                                        }
                                        setShowEditor(false);
                                    }} className={Z.btn2Sm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <X size={13} /> Fechar
                                    </button>
                                </div>
                            </div>

                            {/* Body: Editor + 3D Preview */}
                            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                                {/* 2D Editor */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <EditorSilhueta2D
                                        commands={editorCommands}
                                        widthMm={widthMmEditor}
                                        heightMm={heightMmEditor}
                                        onChange={(cmds) => {
                                            setEditorCommands(cmds);
                                            // Auto-save debounce 2s
                                            clearTimeout(autoSaveTimer.current);
                                            autoSaveTimer.current = setTimeout(() => {
                                                const geo = { type: 'path', width_mm: widthMmEditor, height_mm: heightMmEditor, commands: cmds };
                                                atualizarPeca(pecaSel.id, { geometria_silhueta: geo });
                                            }, 2000);
                                        }}
                                    />
                                </div>

                                {/* 3D Preview sidebar */}
                                <div style={{
                                    width: 300, flexShrink: 0, borderLeft: '1px solid #e2e8f0',
                                    display: 'flex', flexDirection: 'column', background: '#f8fafc',
                                }}>
                                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, color: '#475569' }}>
                                        Preview 3D
                                    </div>
                                    <div style={{ padding: 8 }}>
                                        <Viewport3DPreview
                                            commands={editorCommands}
                                            espessura={pecaSel.espessura || 18}
                                            materialCor={pecaSel.material_cor || '#C4A672'}
                                            width={280}
                                            height={200}
                                        />
                                    </div>
                                    <div style={{ padding: '8px 12px', fontSize: 10, color: '#64748b' }}>
                                        <div><b>Material:</b> {pecaSel.material_nome || '-'}</div>
                                        <div><b>Espessura:</b> {pecaSel.espessura}mm</div>
                                        <div><b>Pontos:</b> {editorCommands.filter(c => c.cmd !== 'Z').length}</div>
                                        <div style={{ marginTop: 6, fontSize: 9, color: '#94a3b8' }}>
                                            Clique = reta · Arraste = curva · V=selecionar · P=caneta · G=snap · Ctrl+Z=desfazer
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Link Modal */}
                {showLink && (
                    <Modal title="Link para Aprovacao do Cliente" close={() => setShowLink(null)}>
                        <div style={{ fontSize: 12, marginBottom: 12 }}>Compartilhe este link com o cliente para visualizar e aprovar o projeto em 3D:</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            <input className={Z.inp} readOnly value={`${window.location.origin}/aprovacao/${showLink.token}`} style={{ flex: 1, fontSize: 11, fontFamily: 'monospace' }} />
                            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/aprovacao/${showLink.token}`); notify('Link copiado!'); }} className={Z.btnSm}>Copiar</button>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Expira em: {new Date(showLink.expira_em).toLocaleDateString('pt-BR')}</div>
                    </Modal>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════
    // RENDER — Project List
    // ════════════════════════════════════════════
    if (loading) return <Spinner text="Carregando projetos..." />;

    return (
        <div className={Z.pg}>
            <PageHeader icon={Layers} title="Modelagem 3D" subtitle="Projetos de pecas organicas e curvas">
                <button onClick={() => setShowNovo(true)} className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Novo Projeto
                </button>
            </PageHeader>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                <InfoCard label="Total Projetos" value={stats.total} highlight />
                <InfoCard label="Rascunho" value={stats.rascunho} />
                <InfoCard label="Aguardando" value={stats.aguardando} />
                <InfoCard label="Aprovados" value={stats.aprovado} />
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar projeto..." className={Z.inp} style={{ width: 220, fontSize: 12 }} />
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className={Z.inp} style={{ width: 180, fontSize: 12 }}>
                    <option value="">Todos os status</option>
                    {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
            </div>

            {/* Project table */}
            {filtered.length === 0 ? (
                <EmptyState icon={Layers} title="Nenhum projeto de modelagem" description="Crie seu primeiro projeto para comecar a modelar pecas organicas" action={<button onClick={() => setShowNovo(true)} className={Z.btn}>Novo Projeto</button>} />
            ) : (
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr>
                                <th className="th-glass">Codigo</th>
                                <th className="th-glass">Nome</th>
                                <th className="th-glass">Cliente</th>
                                <th className="th-glass">Status</th>
                                <th className="th-glass" style={{ textAlign: 'center' }}>Pecas</th>
                                <th className="th-glass">Criado em</th>
                                <th className="th-glass" style={{ textAlign: 'center' }}>Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => {
                                const st = STATUS_COLORS[p.status] || STATUS_COLORS.rascunho;
                                return (
                                    <tr key={p.id} onClick={() => loadProjeto(p.id)} style={{ cursor: 'pointer' }} className="tr-hover">
                                        <td className="td-glass" style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11 }}>{p.codigo}</td>
                                        <td className="td-glass" style={{ fontWeight: 600 }}>{p.nome}</td>
                                        <td className="td-glass" style={{ color: 'var(--text-muted)' }}>{p.cliente_nome || '-'}</td>
                                        <td className="td-glass">
                                            <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: st.bg, color: st.text }}>{st.label}</span>
                                        </td>
                                        <td className="td-glass" style={{ textAlign: 'center' }}>{p.num_pecas || 0}</td>
                                        <td className="td-glass" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.criado_em ? new Date(p.criado_em).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td className="td-glass" style={{ textAlign: 'center' }}>
                                            <button onClick={e => { e.stopPropagation(); deletarProjeto(p.id); }} className={Z.btnDSm} title="Cancelar" style={{ padding: '2px 6px' }}><Trash2 size={12} /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Novo Projeto Modal */}
            {showNovo && <NovoProjetoModal clientes={clientes} onSave={criarProjeto} onClose={() => setShowNovo(false)} />}

            {/* Kerf Calculator standalone */}
            {showKerf && <KerfModal api={api} materiais={materiais} onClose={() => setShowKerf(false)} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════

function NovoProjetoModal({ clientes, onSave, onClose }) {
    const [nome, setNome] = useState('');
    const [descricao, setDescricao] = useState('');
    const [clienteId, setClienteId] = useState('');
    return (
        <Modal title="Novo Projeto de Modelagem" close={onClose}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label className={Z.lbl}>Nome *</label><input className={Z.inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Balcao curvo recepcao" autoFocus /></div>
                <div><label className={Z.lbl}>Descricao</label><textarea className={Z.inp} value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} /></div>
                <div><label className={Z.lbl}>Cliente</label>
                    <select className={Z.inp} value={clienteId} onChange={e => setClienteId(e.target.value)}>
                        <option value="">-- Opcional --</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                    <button onClick={() => { if (!nome.trim()) return; onSave({ nome, descricao, cliente_id: clienteId ? parseInt(clienteId) : null }); }} className={Z.btn} disabled={!nome.trim()}>Criar Projeto</button>
                </div>
            </div>
        </Modal>
    );
}

function NovaPecaModal({ materiais, onSave, onClose }) {
    const [nome, setNome] = useState('');
    const [matId, setMatId] = useState(materiais[0]?.id || '');
    const [esp, setEsp] = useState(18);
    const [processo, setProcesso] = useState('corte_2d');
    return (
        <Modal title="Nova Peca" close={onClose}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><label className={Z.lbl}>Nome *</label><input className={Z.inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Lateral curva" autoFocus /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><label className={Z.lbl}>Material</label>
                        <select className={Z.inp} value={matId} onChange={e => setMatId(e.target.value)}>
                            {materiais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                    </div>
                    <div><label className={Z.lbl}>Espessura (mm)</label><input className={Z.inp} type="number" value={esp} onChange={e => setEsp(parseFloat(e.target.value) || 18)} /></div>
                </div>
                <div><label className={Z.lbl}>Processo</label>
                    <select className={Z.inp} value={processo} onChange={e => setProcesso(e.target.value)}>
                        {PROCESSOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                    <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                    <button onClick={() => { if (!nome.trim()) return; onSave({ nome, material_id: parseInt(matId) || null, espessura: esp, processo_fabricacao: processo }); }} className={Z.btn} disabled={!nome.trim()}>Criar Peca</button>
                </div>
            </div>
        </Modal>
    );
}

function ImportGeometriaModal({ pecaId, onSave, onClose }) {
    const [json, setJson] = useState('');
    const [error, setError] = useState('');
    const importar = () => {
        try {
            const data = JSON.parse(json);
            // Accept either { commands: [...] } or full machining JSON with positions
            if (data.commands) {
                onSave(data);
            } else if (data.workers || data.positions) {
                // Convert from machining_json format
                onSave({ type: 'path', width_mm: 1000, height_mm: 600, commands: [], raw_machining: data });
            } else {
                onSave({ type: 'path', width_mm: data.width_mm || 1000, height_mm: data.height_mm || 600, commands: data.commands || [] });
            }
        } catch (e) {
            setError('JSON invalido: ' + e.message);
        }
    };
    return (
        <Modal title="Importar Geometria" close={onClose} w={600}>
            <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>
                Cole o JSON da geometria (formato SVG-like com commands M/L/C/Q/Z ou machining_json do SketchUp plugin):
            </div>
            <textarea className={Z.inp} value={json} onChange={e => { setJson(e.target.value); setError(''); }} rows={12} placeholder='{"type":"path","width_mm":1000,"height_mm":600,"commands":[{"cmd":"M","x":0,"y":0},{"cmd":"L","x":1000,"y":0},{"cmd":"C","x1":1000,"y1":300,"x2":800,"y2":600,"x":0,"y":600},{"cmd":"Z"}]}' style={{ fontFamily: 'monospace', fontSize: 11, width: '100%' }} />
            {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 6 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                <button onClick={importar} className={Z.btn} disabled={!json.trim()}>Importar</button>
            </div>
        </Modal>
    );
}

function KerfPanel({ api, materialId, espessura }) {
    const [raio, setRaio] = useState(400);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const calcular = () => {
        setLoading(true);
        api.post('/modelagem/kerf-calculator', { material_id: materialId, espessura_mm: espessura, raio_desejado_mm: raio })
            .then(r => setResult(r))
            .catch(() => setResult({ viavel: false, erro: 'Erro de calculo' }))
            .finally(() => setLoading(false));
    };

    return (
        <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calculator size={12} /> Kerf Bending
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 9, color: 'var(--text-muted)' }}>Raio desejado (mm)</label>
                    <input className={Z.inp} type="number" value={raio} onChange={e => setRaio(parseFloat(e.target.value) || 0)} style={{ fontSize: 11 }} />
                </div>
                <button onClick={calcular} className={Z.btnSm} disabled={loading} style={{ fontSize: 10 }}>
                    {loading ? '...' : 'Calcular'}
                </button>
            </div>
            {result && (
                <div style={{ marginTop: 8, fontSize: 10, padding: '6px 8px', borderRadius: 4, background: result.viavel ? '#f0fdf4' : '#fef2f2', border: `1px solid ${result.viavel ? '#bbf7d0' : '#fecaca'}` }}>
                    {result.viavel ? (
                        <>
                            <div style={{ color: '#16a34a', fontWeight: 700, marginBottom: 3 }}>Viavel!</div>
                            <div>Espacamento: <b>{result.espacamento_cortes_mm}mm</b></div>
                            <div>Profundidade: <b>{result.profundidade_corte_mm}mm</b></div>
                            <div>Cortes estimados: <b>{result.numero_cortes_estimado}</b> (por metro)</div>
                            <div>Lado: <b>{result.lado_kerf}</b></div>
                        </>
                    ) : (
                        <div style={{ color: '#dc2626', fontWeight: 600 }}>{result.erro}</div>
                    )}
                </div>
            )}
        </div>
    );
}

function KerfModal({ api, materiais, onClose }) {
    const [matId, setMatId] = useState(materiais[0]?.id || '');
    const [esp, setEsp] = useState(18);
    const [raio, setRaio] = useState(400);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    const calcular = () => {
        setLoading(true);
        api.post('/modelagem/kerf-calculator', { material_id: parseInt(matId) || null, espessura_mm: esp, raio_desejado_mm: raio })
            .then(r => setResult(r))
            .catch(() => setResult({ viavel: false, erro: 'Erro' }))
            .finally(() => setLoading(false));
    };

    return (
        <Modal title="Calculadora Kerf Bending" close={onClose} w={420}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><label className={Z.lbl}>Material</label>
                    <select className={Z.inp} value={matId} onChange={e => setMatId(e.target.value)}>
                        {materiais.map(m => <option key={m.id} value={m.id}>{m.nome} ({m.tipo})</option>)}
                    </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div><label className={Z.lbl}>Espessura (mm)</label><input className={Z.inp} type="number" value={esp} onChange={e => setEsp(parseFloat(e.target.value) || 18)} /></div>
                    <div><label className={Z.lbl}>Raio desejado (mm)</label><input className={Z.inp} type="number" value={raio} onChange={e => setRaio(parseFloat(e.target.value) || 0)} /></div>
                </div>
                <button onClick={calcular} className={Z.btn} disabled={loading}>{loading ? 'Calculando...' : 'Calcular Kerf'}</button>
                {result && (
                    <div style={{ padding: '10px 12px', borderRadius: 6, background: result.viavel ? '#f0fdf4' : '#fef2f2', border: `1px solid ${result.viavel ? '#bbf7d0' : '#fecaca'}` }}>
                        {result.viavel ? (
                            <div style={{ fontSize: 12 }}>
                                <div style={{ color: '#16a34a', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Viavel!</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                    <div>Raio minimo: <b>{result.raio_minimo_mm}mm</b></div>
                                    <div>Espacamento: <b>{result.espacamento_cortes_mm}mm</b></div>
                                    <div>Profundidade: <b>{result.profundidade_corte_mm}mm</b></div>
                                    <div>Cortes/metro: <b>{result.numero_cortes_estimado}</b></div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ color: '#dc2626', fontWeight: 600, fontSize: 13 }}>{result.erro}</div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}
