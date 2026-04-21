// Extraído automaticamente de ProducaoCNC.jsx (linhas 1325-2128).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../../../components/EditorEtiquetas';
import PecaViewer3D from '../../../components/PecaViewer3D';
import PecaEditor from '../../../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../components/ToolpathSimulator';
import GcodeSimWrapper from '../../../components/GcodeSimWrapper';
import SlidePanel from '../../../components/SlidePanel';
import ToolbarDropdown from '../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../shared/constants.js';
import { InfoCard } from '../shared/InfoCard.jsx';

export function TabPecas({ lotes, loteAtual, setLoteAtual, notify, setTab, onOpen3DCSG }) {
    const [pecas, setPecas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filtroMat, setFiltroMat] = useState('');
    const [filtroMod, setFiltroMod] = useState('');
    const [busca, setBusca] = useState('');
    const [pecaSel, setPecaSel] = useState(null);
    const [viewMode, setViewMode] = useState('3d'); // '3d' | '2d'
    const [editorPeca, setEditorPeca] = useState(undefined); // undefined=closed, null=new, object=edit
    const [criarLoteModal, setCriarLoteModal] = useState(false);
    const [templateLib, setTemplateLib] = useState(false); // show template library modal
    const [templateApplyTarget, setTemplateApplyTarget] = useState(null); // peca to apply template to

    // DXF Machining Import state
    const [dxfUsiTarget, setDxfUsiTarget] = useState(null); // peca to import DXF machining into
    const [dxfUsiPreview, setDxfUsiPreview] = useState(null); // parsed DXF preview data
    const [dxfUsiLoading, setDxfUsiLoading] = useState(false);
    const [dxfUsiDepth, setDxfUsiDepth] = useState(10);
    const [dxfUsiLayerMap, setDxfUsiLayerMap] = useState({}); // layer → type override
    const dxfFileRef = useRef(null);

    const handleDxfUsiImport = async (peca) => {
        setDxfUsiTarget(peca);
        setDxfUsiDepth(peca.espessura || 10);
        setDxfUsiPreview(null);
        setDxfUsiLayerMap({});
        // Trigger file picker
        if (dxfFileRef.current) dxfFileRef.current.click();
    };

    const handleDxfUsiFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !dxfUsiTarget) return;
        e.target.value = '';
        setDxfUsiLoading(true);
        try {
            const text = await file.text();
            const r = await api.post(`/cnc/pecas/${dxfUsiTarget.id}/importar-usinagem-dxf`, { dxfContent: text, defaultDepth: dxfUsiDepth });
            setDxfUsiPreview(r);
            // Init layer map from detected layers
            const map = {};
            for (const l of (r.layers || [])) { map[l.name] = l.inferredType || 'auto'; }
            setDxfUsiLayerMap(map);
        } catch (err) {
            notify('Erro ao parsear DXF: ' + (err.error || err.message));
            setDxfUsiTarget(null);
        } finally {
            setDxfUsiLoading(false);
        }
    };

    const handleDxfUsiConfirm = async () => {
        if (!dxfUsiTarget || !dxfUsiPreview) return;
        setDxfUsiLoading(true);
        try {
            // Apply depth override and layer mapping
            const ops = dxfUsiPreview.preview.map(op => ({ ...op, depth: dxfUsiDepth }));
            await api.post(`/cnc/pecas/${dxfUsiTarget.id}/confirmar-usinagem-dxf`, {
                operations: ops,
                layerMapping: dxfUsiLayerMap,
                defaultDepth: dxfUsiDepth,
                merge: false,
            });
            notify(`${ops.length} usinagem(s) importada(s) com sucesso`);
            setDxfUsiTarget(null);
            setDxfUsiPreview(null);
            load();
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setDxfUsiLoading(false);
        }
    };

    const load = useCallback(() => {
        if (!loteAtual) return;
        setLoading(true);
        api.get(`/cnc/lotes/${loteAtual.id}`).then(d => {
            setPecas(d.pecas || []);
            setPecaSel(null);
        }).catch(e => notify(e.error || 'Erro ao carregar peças')).finally(() => setLoading(false));
    }, [loteAtual]);

    useEffect(() => { load(); }, [load]);

    const materiais = [...new Set(pecas.map(p => p.material_code).filter(Boolean))];
    const modulos = [...new Set(pecas.map(p => p.modulo_desc).filter(Boolean))];

    const filtered = pecas.filter(p => {
        if (filtroMat && p.material_code !== filtroMat) return false;
        if (filtroMod && p.modulo_desc !== filtroMod) return false;
        if (busca) {
            const q = busca.toLowerCase();
            return (p.descricao || '').toLowerCase().includes(q) ||
                (p.material || '').toLowerCase().includes(q) ||
                (p.upmcode || '').toLowerCase().includes(q) ||
                (p.modulo_desc || '').toLowerCase().includes(q);
        }
        return true;
    });

    const totalInst = filtered.reduce((s, p) => s + p.quantidade, 0);
    const areaTot = filtered.reduce((s, p) => s + (p.comprimento * p.largura * p.quantidade) / 1e6, 0);

    // Parse machining workers for detail panel
    const parseMach = (mj) => {
        if (!mj) return [];
        try { const d = typeof mj === 'string' ? JSON.parse(mj) : mj; return Array.isArray(d) ? d : d.workers ? (Array.isArray(d.workers) ? d.workers : Object.values(d.workers)) : []; } catch { return []; }
    };

    const handleSavePeca = async (data) => {
        if (editorPeca && editorPeca.id) {
            await api.put(`/cnc/pecas/${editorPeca.id}`, data);
            notify('Peça atualizada');
        } else {
            await api.post(`/cnc/pecas/${loteAtual.id}`, data);
            notify('Peça criada');
        }
        setEditorPeca(undefined);
        load();
    };

    const handleDeletePeca = async (p) => {
        if (!confirm(`Excluir peça "${p.descricao || p.upmcode || 'sem nome'}"?`)) return;
        await api.del(`/cnc/pecas/${p.id}`);
        notify('Peça excluída');
        if (pecaSel?.id === p.id) setPecaSel(null);
        load();
    };

    const handleDuplicarPeca = async (p) => {
        await api.post(`/cnc/pecas/${p.id}/duplicar`);
        notify('Peça duplicada');
        load();
    };

    const handleCriarLote = async (nome) => {
        const r = await api.post('/cnc/lotes/manual', { nome });
        notify('Lote criado');
        setCriarLoteModal(false);
        // Reload lotes list and select new one
        const novosLotes = await api.get('/cnc/lotes');
        if (typeof window.__setCncLotes === 'function') window.__setCncLotes(novosLotes);
        setLoteAtual(novosLotes.find(l => l.id === r.id) || null);
    };

    return (
        <div>
            {/* Piece Editor Modal */}
            {editorPeca !== undefined && (
                <PecaEditor
                    peca={editorPeca}
                    loteId={loteAtual?.id}
                    onSave={handleSavePeca}
                    onClose={() => setEditorPeca(undefined)}
                    materiais={materiais}
                />
            )}

            {loading ? (
                <Spinner text="Carregando peças..." />
            ) : (
                <>
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <InfoCard label="Total Peças" value={filtered.length} highlight />
                        <InfoCard label="Total Instâncias" value={totalInst} />
                        <InfoCard label="Materiais" value={materiais.length} />
                        <InfoCard label="Módulos" value={modulos.length} />
                        <InfoCard label="Área Total" value={`${areaTot.toFixed(2)} m²`} />
                    </div>

                    {/* 3D Detail Panel — viewer + info sidebar */}
                    {pecaSel && (
                        <div className="glass-card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', minHeight: 460 }}>
                                {/* Viewer — preenche todo espaço à esquerda da sidebar (210px + bordas) */}
                                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                    <PecaViewer3D peca={pecaSel} width={Math.max(300, window.innerWidth - 48 - 212)} height={460} force2d={viewMode === '2d'} />
                                </div>

                                {/* Info sidebar direita */}
                                <div style={{
                                    width: 210, flexShrink: 0, padding: '12px 14px',
                                    borderLeft: '1px solid var(--border, #e5e7eb)',
                                    background: 'var(--bg-card, #fff)',
                                    display: 'flex', flexDirection: 'column', gap: 10,
                                    overflowY: 'auto',
                                }}>
                                    {/* Header + toggle + close */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
                                                {pecaSel.descricao || pecaSel.upmcode || 'Peça'}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                                {pecaSel.modulo_desc || ''}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                            {/* Toggle 2D/3D */}
                                            <div style={{
                                                display: 'flex', borderRadius: 5, overflow: 'hidden',
                                                border: '1px solid var(--border)',
                                            }}>
                                                <button onClick={() => setViewMode('3d')} title="Vista 3D" style={{
                                                    background: viewMode === '3d' ? 'var(--primary, #1379F0)' : 'var(--bg-muted)',
                                                    border: 'none', cursor: 'pointer',
                                                    color: viewMode === '3d' ? '#fff' : 'var(--text-muted)',
                                                    padding: '3px 7px', fontSize: 10, fontWeight: 600,
                                                }}>3D</button>
                                                <button onClick={() => setViewMode('2d')} title="Vista 2D (planta)" style={{
                                                    background: viewMode === '2d' ? 'var(--primary, #1379F0)' : 'var(--bg-muted)',
                                                    border: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border)',
                                                    color: viewMode === '2d' ? '#fff' : 'var(--text-muted)',
                                                    padding: '3px 7px', fontSize: 10, fontWeight: 600,
                                                }}>2D</button>
                                            </div>
                                            <button
                                                onClick={() => onOpen3DCSG?.(pecaSel)}
                                                title="Abrir em 3D CSG (furos reais + toolpath)"
                                                style={{
                                                    background: 'var(--accent, #C9A574)', border: 'none',
                                                    cursor: 'pointer', color: '#fff',
                                                    borderRadius: 5, padding: '3px 7px', display: 'flex', alignItems: 'center', gap: 3,
                                                    fontSize: 10, fontWeight: 600,
                                                }}
                                            ><Maximize size={12} /> CSG</button>
                                            <button onClick={() => setPecaSel(null)} title="Fechar" style={{
                                                background: 'var(--bg-muted)', border: '1px solid var(--border)',
                                                cursor: 'pointer', color: 'var(--text-muted)',
                                                borderRadius: 5, padding: '3px 5px', display: 'flex', alignItems: 'center',
                                            }}><X size={13} /></button>
                                        </div>
                                    </div>

                                    {/* Dimensões */}
                                    <div>
                                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Dimensões</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                                            {[
                                                [pecaSel.comprimento, 'Comp'],
                                                [pecaSel.largura, 'Larg'],
                                                [pecaSel.espessura, 'Esp'],
                                            ].map(([v, l]) => (
                                                <div key={l} style={{ textAlign: 'center', padding: '4px 2px', background: 'var(--bg-muted, #f3f4f6)', borderRadius: 4 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{v}</div>
                                                    <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{l}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Material */}
                                    <div>
                                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Material</div>
                                        <div style={{ fontSize: 11, fontWeight: 500 }}>{pecaSel.material_code || pecaSel.material || '-'}</div>
                                    </div>

                                    {/* Bordas */}
                                    <div>
                                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Bordas</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, fontSize: 10 }}>
                                            {[
                                                ['Frontal', pecaSel.borda_frontal],
                                                ['Traseira', pecaSel.borda_traseira],
                                                ['Direita', pecaSel.borda_dir],
                                                ['Esquerda', pecaSel.borda_esq],
                                            ].map(([label, val]) => (
                                                <div key={label} style={{
                                                    display: 'flex', justifyContent: 'space-between', padding: '2px 5px',
                                                    borderRadius: 3, background: val && val !== '-' ? 'rgba(59,130,246,0.08)' : 'transparent',
                                                }}>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>{label}</span>
                                                    <span style={{ fontWeight: 600, color: val && val !== '-' ? '#3b82f6' : 'var(--text-muted)', fontSize: 9 }}>{val || '-'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Usinagens */}
                                    {(() => {
                                        const workers = parseMach(pecaSel.machining_json);
                                        if (!workers.length) return (
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem usinagens</div>
                                        );
                                        return (
                                            <div style={{ flex: 1, minHeight: 0 }}>
                                                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                                                    Usinagens ({workers.length})
                                                </div>
                                                <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 9 }}>
                                                    {workers.map((w, wi) => {
                                                        const cat = (w.category || '').replace(/_/g, ' ');
                                                        const isHole = /hole|furo/i.test(cat);
                                                        return (
                                                            <div key={wi} style={{
                                                                padding: '3px 0', borderBottom: '1px solid var(--border, #eee)',
                                                                display: 'flex', flexDirection: 'column', gap: 1,
                                                            }}>
                                                                <div style={{ fontWeight: 600, textTransform: 'capitalize', fontSize: 10 }}>{cat}</div>
                                                                <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 9 }}>
                                                                    {w.face || 'top'} · {isHole ? `⌀${w.diameter || '?'}` : `${w.length || '?'}×${w.width || '?'}`} · prof {w.depth || '?'}mm
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Extra info */}
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 'auto' }}>
                                        <span style={{ ...tagStyle('blue'), fontSize: 9, padding: '2px 6px' }}>Qtd: {pecaSel.quantidade}</span>
                                        {pecaSel.grain && pecaSel.grain !== 'sem_veio' && (
                                            <span style={{ ...tagStyle('amber'), fontSize: 9, padding: '2px 6px' }}>Veio: {pecaSel.grain}</span>
                                        )}
                                        {pecaSel.acabamento && (
                                            <span style={{ ...tagStyle('gray'), fontSize: 9, padding: '2px 6px' }}>{pecaSel.acabamento}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Filters + Actions */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar peça..."
                            className={Z.inp} style={{ width: 200, fontSize: 12 }} />
                        <select value={filtroMat} onChange={e => setFiltroMat(e.target.value)}
                            className={Z.inp} style={{ width: 180, fontSize: 12 }}>
                            <option value="">Todos materiais</option>
                            {materiais.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select value={filtroMod} onChange={e => setFiltroMod(e.target.value)}
                            className={Z.inp} style={{ width: 180, fontSize: 12 }}>
                            <option value="">Todos módulos</option>
                            {modulos.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                            <button onClick={() => {
                                if (!filtered.length) return notify('Nenhuma peça para exportar');
                                const BOM = '\uFEFF';
                                const sep = ';';
                                const header = ['#', 'Descrição', 'Ambiente/Módulo', 'Comprimento', 'Largura', 'Espessura', 'Material', 'Veio', 'Borda Frontal', 'Borda Traseira', 'Borda Dir', 'Borda Esq', 'Rotação'].join(sep);
                                const rows = filtered.map((p, i) => [
                                    i + 1,
                                    (p.descricao || '').replace(/;/g, ','),
                                    (p.modulo_desc || '').replace(/;/g, ','),
                                    p.comprimento || '',
                                    p.largura || '',
                                    p.espessura || '',
                                    (p.material_code || p.material || '').replace(/;/g, ','),
                                    p.grain || 'sem_veio',
                                    p.borda_frontal || '-',
                                    p.borda_traseira || '-',
                                    p.borda_dir || '-',
                                    p.borda_esq || '-',
                                    p.grain && p.grain !== 'sem_veio' ? 'Com veio' : 'Livre',
                                ].join(sep));
                                const csv = BOM + header + '\n' + rows.join('\n');
                                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `pecas_${loteAtual.nome || loteAtual.id}.csv`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                                notify('CSV exportado com sucesso');
                            }} className={Z.btn2}
                                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <FileDown size={14} /> Exportar CSV
                            </button>
                            <button onClick={() => setTemplateLib(true)} className={Z.btn2}
                                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Star size={14} /> Biblioteca Usinagens
                            </button>
                            <button onClick={() => setEditorPeca(null)} className={Z.btn}
                                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary)', color: '#fff' }}>
                                <Plus size={14} /> Nova Peça
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="glass-card" style={{ overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11, whiteSpace: 'nowrap' }}>
                                <thead>
                                    <tr>
                                        {['#', 'Qtd', 'Material', 'Comp', 'Larg', 'Esp', 'B.Dir', 'B.Esq', 'B.Front', 'B.Tras', 'Acab.', 'Descrição', 'Módulo', 'UsiA', 'UsiB', 'Obs', ''].map(h => (
                                            <th key={h || 'actions'} className={Z.th} style={{ padding: '6px 8px', fontSize: 10 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((p, i) => {
                                        const sel = pecaSel?.id === p.id;
                                        return (
                                            <tr key={p.id} onClick={() => setPecaSel(sel ? null : p)}
                                                style={{
                                                    background: sel ? 'rgba(59,130,246,0.12)' : i % 2 === 0 ? 'transparent' : 'var(--bg-muted)',
                                                    cursor: 'pointer', transition: 'background .1s',
                                                    borderLeft: sel ? '3px solid var(--primary)' : '3px solid transparent',
                                                }}>
                                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{i + 1}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600 }}>{p.quantidade}</td>
                                                <td style={{ padding: '6px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.material_code || p.material}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.comprimento}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.largura}</td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.espessura}</td>
                                                <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.borda_dir || '-'}</td>
                                                <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.borda_esq || '-'}</td>
                                                <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.borda_frontal || '-'}</td>
                                                <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.borda_traseira || '-'}</td>
                                                <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.acabamento || '-'}</td>
                                                <td style={{ padding: '6px 8px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.descricao}</td>
                                                <td style={{ padding: '6px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.modulo_desc}</td>
                                                <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.usi_a || '-'}</td>
                                                <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.usi_b || '-'}</td>
                                                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{p.observacao || '-'}</td>
                                                <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                                                        <button onClick={() => setPecaSel(sel ? null : p)} title="Ver 3D (preview)"
                                                            style={{
                                                                background: sel ? 'var(--primary)' : 'none',
                                                                border: sel ? 'none' : '1px solid var(--border)',
                                                                cursor: 'pointer',
                                                                color: sel ? '#fff' : 'var(--primary)',
                                                                padding: '2px 5px', borderRadius: 4,
                                                                display: 'flex', alignItems: 'center',
                                                            }}>
                                                            <Eye size={13} />
                                                        </button>
                                                        <button onClick={() => onOpen3DCSG?.(p)} title="Abrir 3D CSG (furos reais + G-Code)"
                                                            style={{
                                                                background: 'none', border: '1px solid var(--accent, #C9A574)',
                                                                cursor: 'pointer', color: 'var(--accent, #C9A574)',
                                                                padding: '2px 5px', borderRadius: 4,
                                                                display: 'flex', alignItems: 'center',
                                                            }}>
                                                            <Maximize size={13} />
                                                        </button>
                                                        <button onClick={() => setEditorPeca(p)} title="Editar"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 2 }}>
                                                            <Edit size={13} />
                                                        </button>
                                                        <button onClick={() => handleDuplicarPeca(p)} title="Duplicar"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                                                            <Copy size={13} />
                                                        </button>
                                                        <button onClick={() => handleDxfUsiImport(p)} title="Importar DXF Usinagem"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', padding: 2 }}>
                                                            <FileUp size={13} />
                                                        </button>
                                                        <button onClick={() => setTemplateApplyTarget(p)} title="Aplicar Template"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b5cf6', padding: 2 }}>
                                                            <Zap size={13} />
                                                        </button>
                                                        <button onClick={async () => {
                                                            const nome = prompt('Nome do template:', `Template de ${p.descricao || 'Peça'}`);
                                                            if (!nome) return;
                                                            const cat = prompt('Categoria (Dobradiça, Minifix, Puxador, Corrediça, Geral):', 'Geral');
                                                            try {
                                                                await api.post(`/cnc/machining-templates/from-peca/${p.id}`, { nome, categoria: cat || 'Geral' });
                                                                notify('Template criado com sucesso');
                                                            } catch (err) { notify('Erro: ' + (err.error || err.message), 'error'); }
                                                        }} title="Salvar como Template"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f59e0b', padding: 2 }}>
                                                            <Star size={13} />
                                                        </button>
                                                        <button onClick={() => handleDeletePeca(p)} title="Excluir"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Hidden DXF file input */}
            <input type="file" ref={dxfFileRef} accept=".dxf" style={{ display: 'none' }} onChange={handleDxfUsiFileSelect} />

            {/* DXF Machining Preview Modal */}
            {dxfUsiPreview && dxfUsiTarget && (
                <Modal onClose={() => { setDxfUsiTarget(null); setDxfUsiPreview(null); }} wide>
                    <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Importar Usinagem DXF - {dxfUsiTarget.descricao || 'Peca'}</h3>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                        {dxfUsiPreview.entities_count} operacao(es) detectada(s)
                    </p>

                    {/* Default depth input */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                        <label style={{ fontSize: 11, fontWeight: 600 }}>Profundidade padrao (mm):</label>
                        <input type="number" value={dxfUsiDepth} onChange={e => setDxfUsiDepth(Number(e.target.value))}
                            className={Z.inp} style={{ width: 80, fontSize: 12, padding: '4px 8px' }} min={0.5} max={50} step={0.5} />
                    </div>

                    {/* Layer mapping */}
                    {dxfUsiPreview.layers?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Mapeamento de Layers:</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {dxfUsiPreview.layers.map(l => (
                                    <div key={l.name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
                                        <span style={{ fontWeight: 500, minWidth: 80 }}>{l.name}</span>
                                        <span style={{ color: 'var(--text-muted)', minWidth: 30 }}>({l.count})</span>
                                        <select value={dxfUsiLayerMap[l.name] || 'auto'}
                                            onChange={e => setDxfUsiLayerMap(prev => ({ ...prev, [l.name]: e.target.value }))}
                                            className={Z.inp} style={{ fontSize: 11, padding: '2px 6px' }}>
                                            <option value="auto">Auto</option>
                                            <option value="hole">Furo</option>
                                            <option value="groove">Rasgo/Canal</option>
                                            <option value="pocket">Rebaixo/Pocket</option>
                                            <option value="contour">Contorno</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 2D Preview */}
                    <div style={{ background: '#f8f8f8', border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 12, maxHeight: 300, overflow: 'auto' }}>
                        <svg viewBox={`-5 -5 ${(dxfUsiPreview.peca?.comprimento || 600) + 10} ${(dxfUsiPreview.peca?.largura || 400) + 10}`}
                            style={{ width: '100%', maxHeight: 260, background: '#fff' }}>
                            {/* Piece outline */}
                            <rect x={0} y={0} width={dxfUsiPreview.peca?.comprimento || 600} height={dxfUsiPreview.peca?.largura || 400}
                                fill="none" stroke="#333" strokeWidth={1} />
                            {/* Operations */}
                            {dxfUsiPreview.preview.map((op, i) => {
                                const opType = (dxfUsiLayerMap[op.layer] && dxfUsiLayerMap[op.layer] !== 'auto') ? dxfUsiLayerMap[op.layer] : op.type;
                                const color = opType === 'hole' ? '#ef4444' : opType === 'groove' ? '#3b82f6' : opType === 'pocket' ? '#f59e0b' : '#22c55e';
                                if (op.entity_type === 'CIRCLE') {
                                    return <circle key={i} cx={op.x} cy={op.y} r={op.diameter / 2} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={0.8} />;
                                } else if (op.entity_type === 'LINE') {
                                    return <line key={i} x1={op.x} y1={op.y} x2={op.x2} y2={op.y2} stroke={color} strokeWidth={1.5} />;
                                } else if (op.vertices) {
                                    const pts = op.vertices.map(v => `${v.x},${v.y}`).join(' ');
                                    return op.closed
                                        ? <polygon key={i} points={pts} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={0.8} />
                                        : <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={1.2} />;
                                } else if (op.w) {
                                    return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={0.8} />;
                                }
                                return null;
                            })}
                        </svg>
                    </div>

                    {/* Operations list */}
                    <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 10, marginBottom: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>#</th>
                                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Tipo</th>
                                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Layer</th>
                                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>X</th>
                                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Y</th>
                                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Dims</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dxfUsiPreview.preview.map((op, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--bg-muted)' }}>
                                        <td style={{ padding: '3px 6px' }}>{i + 1}</td>
                                        <td style={{ padding: '3px 6px' }}>
                                            <span style={{
                                                padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                                                background: op.type === 'hole' ? '#fef2f2' : op.type === 'groove' ? '#eff6ff' : '#fffbeb',
                                                color: op.type === 'hole' ? '#991b1b' : op.type === 'groove' ? '#1e40af' : '#92400e',
                                            }}>
                                                {op.type === 'hole' ? 'Furo' : op.type === 'groove' ? 'Rasgo' : op.type === 'pocket' ? 'Rebaixo' : 'Contorno'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '3px 6px', color: 'var(--text-muted)' }}>{op.layer}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{op.x}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{op.y}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                                            {op.diameter ? `d${op.diameter}` : op.w ? `${op.w}x${op.h}` : op.length ? `L${op.length}` : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setDxfUsiTarget(null); setDxfUsiPreview(null); }}
                            className={Z.btn} style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)' }}>
                            Cancelar
                        </button>
                        <button onClick={handleDxfUsiConfirm} disabled={dxfUsiLoading}
                            className={Z.btn} style={{ background: 'var(--primary)', color: '#fff' }}>
                            {dxfUsiLoading ? 'Salvando...' : `Confirmar ${dxfUsiPreview.entities_count} operacao(es)`}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Template Library Modal */}
            {templateLib && <MachiningTemplateLibrary notify={notify} onClose={() => setTemplateLib(false)} onApply={(tpl) => {
                setTemplateLib(false);
                if (templateApplyTarget) {
                    // Direct apply — ask for mirror
                    const espelhar = confirm('Espelhar usinagens? (para peças par esquerda/direita)');
                    api.post(`/cnc/machining-templates/${tpl.id}/aplicar`, { peca_id: templateApplyTarget.id, espelhar }).then(() => {
                        notify('Template aplicado com sucesso');
                        setTemplateApplyTarget(null);
                        load();
                    }).catch(err => notify('Erro: ' + (err.error || err.message), 'error'));
                }
            }} />}

            {/* Apply Template Modal (triggered from piece action button) */}
            {templateApplyTarget && !templateLib && <MachiningTemplateLibrary notify={notify} onClose={() => setTemplateApplyTarget(null)} applyMode pecaTarget={templateApplyTarget} onApply={(tpl) => {
                const espelhar = confirm('Espelhar usinagens? (para peças par esquerda/direita)');
                api.post(`/cnc/machining-templates/${tpl.id}/aplicar`, { peca_id: templateApplyTarget.id, espelhar }).then(() => {
                    notify('Template aplicado com sucesso');
                    setTemplateApplyTarget(null);
                    load();
                }).catch(err => notify('Erro: ' + (err.error || err.message), 'error'));
            }} />}

            {/* Next step — go to optimization */}
            {loteAtual && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button onClick={() => setTab('plano')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 24px', borderRadius: 8,
                            background: 'var(--primary)', color: '#fff',
                            border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 700,
                        }}>
                        Próxima: Otimizar Plano de Corte <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// Machining Template Library Modal
// ═══════════════════════════════════════════════════════
const TEMPLATE_CATEGORIES = ['Dobradiça', 'Minifix', 'Puxador', 'Corrediça', 'Geral'];

function MachiningTemplateLibrary({ notify, onClose, onApply, applyMode, pecaTarget }) {
    const [templates, setTemplates] = useState([]);
    const [filtro, setFiltro] = useState('');
    const [catFiltro, setCatFiltro] = useState('');
    const [modal, setModal] = useState(null); // edit/create modal

    const load = useCallback(() => {
        const params = new URLSearchParams();
        if (catFiltro) params.set('categoria', catFiltro);
        if (filtro) params.set('q', filtro);
        api.get(`/cnc/machining-templates?${params}`).then(setTemplates).catch(e => notify(e.error || 'Erro'));
    }, [catFiltro, filtro]);

    useEffect(() => { load(); }, [load]);

    const del = async (id) => {
        if (!confirm('Excluir este template?')) return;
        await api.del(`/cnc/machining-templates/${id}`);
        notify('Template excluído');
        load();
    };

    const save = async (data) => {
        try {
            if (data.id) {
                await api.put(`/cnc/machining-templates/${data.id}`, data);
                notify('Template atualizado');
            } else {
                await api.post('/cnc/machining-templates', data);
                notify('Template criado');
            }
            setModal(null);
            load();
        } catch (err) { notify('Erro: ' + (err.error || err.message), 'error'); }
    };

    const catIcons = { 'Dobradiça': '⌀', 'Minifix': '⊕', 'Puxador': '◧', 'Corrediça': '◫', 'Geral': '◈' };

    return (
        <Modal title={applyMode ? `Aplicar Template em "${pecaTarget?.descricao || 'Peça'}"` : 'Biblioteca de Usinagens'} close={onClose} w={700}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar template..."
                    className={Z.inp} style={{ width: 200, fontSize: 12 }} />
                <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} className={Z.inp} style={{ width: 160, fontSize: 12 }}>
                    <option value="">Todas categorias</option>
                    {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {!applyMode && (
                    <button onClick={() => setModal({ nome: '', descricao: '', categoria: 'Geral', machining_json: '{}', espelhavel: 0 })}
                        className={Z.btn} style={{ fontSize: 11, padding: '5px 12px', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Plus size={12} /> Novo Template
                    </button>
                )}
            </div>

            {templates.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    Nenhum template encontrado
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
                    {templates.map(t => {
                        let workerCount = 0;
                        try { const mj = JSON.parse(t.machining_json || '{}'); const w = mj.workers; workerCount = w ? (Array.isArray(w) ? w.length : Object.keys(w).length) : 0; } catch {}
                        return (
                            <div key={t.id} style={{
                                padding: 12, borderRadius: 8, border: '1px solid var(--border)',
                                background: 'var(--bg-card)', cursor: applyMode ? 'pointer' : 'default',
                                transition: 'all .15s',
                            }}
                                onClick={applyMode ? () => onApply(t) : undefined}
                                onMouseEnter={applyMode ? e => e.currentTarget.style.borderColor = 'var(--primary)' : undefined}
                                onMouseLeave={applyMode ? e => e.currentTarget.style.borderColor = 'var(--border)' : undefined}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t.nome}</div>
                                    <span style={{ fontSize: 16 }}>{catIcons[t.categoria] || '◈'}</span>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{t.descricao || ''}</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, marginBottom: 6 }}>
                                    <span style={{ ...tagStyle('blue'), padding: '1px 6px' }}>{t.categoria || 'Geral'}</span>
                                    <span style={{ ...tagStyle('gray'), padding: '1px 6px' }}>{workerCount} op.</span>
                                    <span style={{ ...tagStyle('green'), padding: '1px 6px' }}>{t.uso_count || 0}x usado</span>
                                </div>
                                {!applyMode && (
                                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                        <button onClick={() => setModal(t)} className={Z.btn2} style={{ padding: '2px 6px', fontSize: 10 }}><Edit size={10} /></button>
                                        <button onClick={() => del(t.id)} className={Z.btnD} style={{ padding: '2px 6px', fontSize: 10 }}><Trash2 size={10} /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {modal && <MachiningTemplateModal data={modal} onSave={save} onClose={() => setModal(null)} />}
        </Modal>
    );
}

function MachiningTemplateModal({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...data });
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
    return (
        <Modal title={f.id ? 'Editar Template' : 'Novo Template'} close={onClose} w={480}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                    <label className={Z.lbl}>Nome</label>
                    <input value={f.nome} onChange={e => upd('nome', e.target.value)} className={Z.inp} />
                </div>
                <div>
                    <label className={Z.lbl}>Categoria</label>
                    <select value={f.categoria} onChange={e => upd('categoria', e.target.value)} className={Z.inp}>
                        {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className={Z.lbl}>Espelhável</label>
                    <select value={f.espelhavel ? '1' : '0'} onChange={e => upd('espelhavel', e.target.value === '1')} className={Z.inp}>
                        <option value="0">Não</option>
                        <option value="1">Sim</option>
                    </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                    <label className={Z.lbl}>Descrição</label>
                    <input value={f.descricao} onChange={e => upd('descricao', e.target.value)} className={Z.inp} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                    <label className={Z.lbl}>Machining JSON</label>
                    <textarea value={typeof f.machining_json === 'string' ? f.machining_json : JSON.stringify(f.machining_json, null, 2)}
                        onChange={e => upd('machining_json', e.target.value)}
                        className={Z.inp} style={{ fontFamily: 'monospace', fontSize: 10, minHeight: 120 }} />
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                <button onClick={() => onSave(f)} className={Z.btn}>Salvar</button>
            </div>
        </Modal>
    );
}

// ─── Print / PDF function ────────────────────────────
