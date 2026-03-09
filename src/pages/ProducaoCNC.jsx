import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass } from '../ui';
import { colorBg, colorBorder } from '../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../components/EditorEtiquetas';
// GcodeSim3D removido — simulador 2D com cores por operação é suficiente

const TABS = [
    { id: 'importar', lb: 'Importar', ic: Upload },
    { id: 'pecas', lb: 'Peças', ic: Layers },
    { id: 'plano', lb: 'Plano de Corte', ic: Scissors },
    { id: 'etiquetas', lb: 'Etiquetas', ic: TagIcon },
    { id: 'gcode', lb: 'G-code / CNC', ic: Settings },
    { id: 'config', lb: 'Configurações', ic: Settings },
];

const STATUS_COLORS = {
    importado: '#3b82f6',
    otimizado: '#22c55e',
    produzindo: '#f59e0b',
    concluido: '#8b5cf6',
};

export default function ProducaoCNC({ notify }) {
    const [tab, setTab] = useState('importar');
    const [lotes, setLotes] = useState([]);
    const [loteAtual, setLoteAtual] = useState(null);
    const [loading, setLoading] = useState(false);
    const [editorMode, setEditorMode] = useState(false);
    const [editorTemplateId, setEditorTemplateId] = useState(null);
    const [configSection, setConfigSection] = useState('maquinas');

    const loadLotes = useCallback(() => {
        api.get('/cnc/lotes').then(setLotes).catch(e => notify(e.error || 'Erro ao carregar lotes'));
    }, []);

    useEffect(() => { loadLotes(); }, [loadLotes]);

    // ── MODO EDITOR FULL-SCREEN ──────────────────────────
    if (editorMode) {
        return (
            <div className={Z.pg} style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <EditorEtiquetas
                        api={api}
                        notify={notify}
                        initialTemplateId={editorTemplateId}
                        onBack={() => { setEditorMode(false); setEditorTemplateId(null); setConfigSection('etiquetas'); }}
                    />
                </div>
            </div>
        );
    }

    // ── MODO NORMAL ───────────────────────────────────────
    return (
        <div className={Z.pg}>
            <h1 className={Z.h1}>Produção CNC</h1>
            <p className={Z.sub}>Importar JSON, otimizar corte, etiquetas e G-code</p>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 20, overflowX: 'auto', borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
                {TABS.map(t => {
                    const active = tab === t.id;
                    const I = t.ic;
                    return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                                fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
                                color: active ? 'var(--primary)' : 'var(--text-muted)',
                                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                                background: 'none', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid',
                                marginBottom: -2, whiteSpace: 'nowrap', transition: 'all .15s',
                            }}>
                            <I size={15} />
                            <span className="hidden sm:inline">{t.lb}</span>
                        </button>
                    );
                })}
            </div>

            {tab === 'importar' && <TabImportar lotes={lotes} loadLotes={loadLotes} notify={notify} setLoteAtual={setLoteAtual} setTab={setTab} />}
            {tab === 'pecas' && <TabPecas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />}
            {tab === 'plano' && <TabPlano lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} loadLotes={loadLotes} />}
            {tab === 'etiquetas' && <TabEtiquetas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />}
            {tab === 'gcode' && <TabGcode lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />}
            {tab === 'config' && <TabConfig notify={notify} setEditorMode={setEditorMode} setEditorTemplateId={setEditorTemplateId} initialSection={configSection} setConfigSection={setConfigSection} />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// Seletor de Lote reutilizável
// ═══════════════════════════════════════════════════════
function LoteSelector({ lotes, loteAtual, setLoteAtual }) {
    return (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Lote:</span>
            <select
                value={loteAtual?.id || ''}
                onChange={e => {
                    const l = lotes.find(x => x.id === Number(e.target.value));
                    setLoteAtual(l || null);
                }}
                className={Z.inp}
                style={{ minWidth: 260, fontSize: 13 }}
            >
                <option value="">Selecione um lote...</option>
                {lotes.map(l => (
                    <option key={l.id} value={l.id}>#{l.id} — {l.nome} ({l.total_pecas} pç) [{l.status}]</option>
                ))}
            </select>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 1: IMPORTAR
// ═══════════════════════════════════════════════════════
function TabImportar({ lotes, loadLotes, notify, setLoteAtual, setTab }) {
    const [dragging, setDragging] = useState(false);
    const [preview, setPreview] = useState(null);
    const [jsonData, setJsonData] = useState(null);
    const [nome, setNome] = useState('');
    const [importing, setImporting] = useState(false);
    const [selectedLotes, setSelectedLotes] = useState(new Set());
    const [multiOptimizing, setMultiOptimizing] = useState(false);
    const fileRef = useRef(null);

    const toggleLoteSelection = (id) => {
        setSelectedLotes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAllLotes = () => {
        if (selectedLotes.size === lotes.length) setSelectedLotes(new Set());
        else setSelectedLotes(new Set(lotes.map(l => l.id)));
    };
    const doMultiOptimize = async () => {
        if (selectedLotes.size < 2) { notify('Selecione pelo menos 2 lotes'); return; }
        setMultiOptimizing(true);
        try {
            const r = await api.post('/cnc/otimizar-multi', {
                loteIds: [...selectedLotes],
                espaco_pecas: espacoPecas, refilo, permitir_rotacao: permitirRotacao,
                modo, kerf, usar_retalhos: usarRetalhos, iteracoes,
                considerar_sobra: considerarSobra, sobra_min_largura: sobraMinW,
                sobra_min_comprimento: sobraMinH, direcao_corte: direcaoCorte,
            });
            const mats = Object.values(r.plano?.materiais || {});
            const minTeorico = mats.reduce((s, m) => s + (m.min_teorico_chapas || 0), 0);
            const eficiencia = minTeorico > 0 ? Math.round(minTeorico / r.total_chapas * 100) : 100;
            notify(`Multi-Projeto otimizado: ${r.total_chapas} chapa(s), ${r.aproveitamento}% aproveitamento (mín.teórico: ${minTeorico}, eficiência: ${eficiencia}%) — ${r.lotes.length} projetos combinados`);
            loadLotes();
            setSelectedLotes(new Set());
            // Navegar para o plano do primeiro lote
            if (r.lotes?.[0]) {
                setLoteAtual({ id: r.lotes[0].id, ...r.lotes[0] });
                setTab('plano');
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setMultiOptimizing(false);
        }
    };

    const handleFile = (file) => {
        if (!file || !file.name.endsWith('.json')) {
            notify('Selecione um arquivo .json');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                setJsonData(data);
                const det = data.details_project || {};
                const ents = data.model_entities || {};
                let totalPecas = 0;
                const materiais = new Set();
                const modulos = new Set();
                for (const mIdx of Object.keys(ents)) {
                    const mod = ents[mIdx];
                    if (!mod?.entities) continue;
                    if (mod.upmmasterdescription) modulos.add(mod.upmmasterdescription);
                    for (const eIdx of Object.keys(mod.entities)) {
                        const ent = mod.entities[eIdx];
                        if (ent?.upmpiece) {
                            totalPecas++;
                            if (ent.entities) {
                                for (const sIdx of Object.keys(ent.entities)) {
                                    const sub = ent.entities[sIdx];
                                    if (sub?.upmfeedstockpanel && sub.upmmaterialcode) materiais.add(sub.upmmaterialcode);
                                }
                            }
                        }
                    }
                }
                setPreview({
                    cliente: det.client_name || det.cliente || '',
                    projeto: det.project_name || det.projeto || '',
                    codigo: det.project_code || det.codigo || '',
                    vendedor: det.seller_name || det.vendedor || '',
                    totalPecas,
                    totalModulos: modulos.size,
                    materiais: [...materiais],
                    modulos: [...modulos],
                });
                setNome(det.project_name || det.projeto || file.name.replace('.json', ''));
            } catch (err) {
                notify('Erro ao ler JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    const doImport = async () => {
        if (!jsonData) return;
        setImporting(true);
        try {
            const r = await api.post('/cnc/lotes/importar', { json: jsonData, nome });
            notify(`Lote importado: ${r.total_pecas} peças`);
            setPreview(null);
            setJsonData(null);
            setNome('');
            loadLotes();
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setImporting(false);
        }
    };

    const deleteLote = async (id) => {
        if (!confirm('Excluir este lote e todas as peças?')) return;
        try {
            await api.del(`/cnc/lotes/${id}`);
            notify('Lote excluído');
            loadLotes();
        } catch (err) {
            notify('Erro ao excluir');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Drop zone */}
            <div className="glass-card"
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
                style={{
                    padding: 40, textAlign: 'center', cursor: 'pointer',
                    border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                    background: dragging ? 'var(--primary-bg, rgba(230,126,34,0.05))' : 'transparent',
                    borderRadius: 12, transition: 'all .2s',
                }}>
                <Upload size={36} style={{ color: dragging ? 'var(--primary)' : 'var(--text-muted)', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    Arraste o arquivo JSON ou clique para selecionar
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    JSON exportado pelo Plugin Ornato SketchUp
                </div>
                <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }}
                    onChange={e => handleFile(e.target.files?.[0])} />
            </div>

            {/* Preview */}
            {preview && (
                <div className="glass-card p-4">
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                        <Eye size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                        Preview do JSON
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                        <InfoCard label="Cliente" value={preview.cliente} />
                        <InfoCard label="Projeto" value={preview.projeto} />
                        <InfoCard label="Código" value={preview.codigo} />
                        <InfoCard label="Vendedor" value={preview.vendedor} />
                        <InfoCard label="Total Peças" value={preview.totalPecas} highlight />
                        <InfoCard label="Módulos" value={preview.totalModulos} />
                        <InfoCard label="Materiais" value={preview.materiais.join(', ') || 'N/A'} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do lote"
                            className={Z.inp} style={{ flex: 1, minWidth: 200 }} />
                        <button onClick={doImport} disabled={importing} className={Z.btn} style={{ padding: '8px 24px' }}>
                            {importing ? 'Importando...' : 'Importar Lote'}
                        </button>
                        <button onClick={() => { setPreview(null); setJsonData(null); }} className={Z.btn2} style={{ padding: '8px 16px' }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Lotes list */}
            <div className="glass-card p-4">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        <Package size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                        Lotes Importados ({lotes.length})
                    </h3>
                    <button onClick={loadLotes} className={Z.btn2} style={{ padding: '4px 10px', fontSize: 11 }}>
                        <RefreshCw size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                        Atualizar
                    </button>
                </div>

                {/* Multi-projeto action bar */}
                {selectedLotes.size >= 2 && (
                    <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <Zap size={16} style={{ color: '#3b82f6' }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {selectedLotes.size} lotes selecionados
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {lotes.filter(l => selectedLotes.has(l.id)).reduce((s, l) => s + l.total_pecas, 0)} peças total
                        </span>
                        <button onClick={doMultiOptimize} disabled={multiOptimizing}
                            className={Z.btn} style={{ padding: '6px 18px', fontSize: 12, marginLeft: 'auto', background: '#3b82f6' }}>
                            {multiOptimizing ? <><Spinner size={12} /> Otimizando...</> : <><Zap size={13} style={{ marginRight: 4 }} /> Otimizar Juntos</>}
                        </button>
                        <button onClick={() => setSelectedLotes(new Set())} className={Z.btn2} style={{ padding: '6px 12px', fontSize: 11 }}>
                            Limpar
                        </button>
                    </div>
                )}

                {lotes.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        Nenhum lote importado ainda
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                            <thead>
                                <tr>
                                    <th className={Z.th} style={{ padding: '8px 6px', width: 32 }}>
                                        <input type="checkbox" checked={selectedLotes.size === lotes.length && lotes.length > 0}
                                            onChange={toggleAllLotes} style={{ cursor: 'pointer' }} />
                                    </th>
                                    {['#', 'Nome', 'Cliente', 'Projeto', 'Peças', 'Chapas', 'Aprov.', 'Status', 'Data', 'Ações'].map(h => (
                                        <th key={h} className={Z.th} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {lotes.map((l, i) => (
                                    <tr key={l.id} style={{
                                        background: selectedLotes.has(l.id) ? 'rgba(59,130,246,0.06)' : i % 2 === 0 ? 'transparent' : 'var(--bg-muted)',
                                        transition: 'background .15s',
                                    }}>
                                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                            <input type="checkbox" checked={selectedLotes.has(l.id)}
                                                onChange={() => toggleLoteSelection(l.id)} style={{ cursor: 'pointer' }} />
                                        </td>
                                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{l.id}</td>
                                        <td style={{ padding: '8px 10px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</td>
                                        <td style={{ padding: '8px 10px' }}>{l.cliente || '-'}</td>
                                        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{l.projeto || '-'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.total_pecas}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.total_chapas || '-'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.aproveitamento ? `${l.aproveitamento}%` : '-'}</td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span className={tagClass} style={tagStyle(STATUS_COLORS[l.status])}>
                                                    {l.status}
                                                </span>
                                                {l.grupo_otimizacao && (
                                                    <span title="Otimizado em grupo" style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 600 }}>
                                                        MULTI
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                            {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button onClick={() => { setLoteAtual(l); setTab('pecas'); }}
                                                    title="Ver peças" className={Z.btn2} style={{ padding: '3px 8px', fontSize: 11 }}>
                                                    <Eye size={12} />
                                                </button>
                                                <button onClick={() => { setLoteAtual(l); setTab('plano'); }}
                                                    title="Plano de corte" className={Z.btn2} style={{ padding: '3px 8px', fontSize: 11 }}>
                                                    <Scissors size={12} />
                                                </button>
                                                <button onClick={() => deleteLote(l.id)}
                                                    title="Excluir" className={Z.btnD} style={{ padding: '3px 8px', fontSize: 11 }}>
                                                    <Trash2 size={12} />
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
        </div>
    );
}

function InfoCard({ label, value, highlight }) {
    return (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--primary)' : 'var(--text-primary)' }}>
                {value || '-'}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 2: PEÇAS
// ═══════════════════════════════════════════════════════
function TabPecas({ lotes, loteAtual, setLoteAtual, notify }) {
    const [pecas, setPecas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filtroMat, setFiltroMat] = useState('');
    const [filtroMod, setFiltroMod] = useState('');
    const [busca, setBusca] = useState('');

    const load = useCallback(() => {
        if (!loteAtual) return;
        setLoading(true);
        api.get(`/cnc/lotes/${loteAtual.id}`).then(d => {
            setPecas(d.pecas || []);
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

    return (
        <div>
            <LoteSelector lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} />

            {!loteAtual ? (
                <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Selecione um lote para ver as peças
                </div>
            ) : loading ? (
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

                    {/* Filters */}
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
                    </div>

                    {/* Table */}
                    <div className="glass-card" style={{ overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11, whiteSpace: 'nowrap' }}>
                                <thead>
                                    <tr>
                                        {['#', 'Qtd', 'Material', 'Comp', 'Larg', 'Esp', 'B.Dir', 'B.Esq', 'B.Front', 'B.Tras', 'Acab.', 'Descrição', 'Módulo', 'UsiA', 'UsiB', 'Obs'].map(h => (
                                            <th key={h} className={Z.th} style={{ padding: '6px 8px', fontSize: 10 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((p, i) => (
                                        <tr key={p.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
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
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Print / PDF function ────────────────────────────
function printPlano(plano, pecasMap, loteAtual, getModColor) {
    const modColors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'];
    const isMulti = plano?.multi_lote && plano?.lotes_info?.length > 1;
    const getColor = (pecaId, pecaObj) => {
        if (isMulti && pecaObj?.cor) return pecaObj.cor;
        const piece = pecasMap[pecaId];
        if (!piece) return modColors[0];
        return modColors[(piece.modulo_id || 0) % modColors.length];
    };

    let chapasHtml = '';
    for (let ci = 0; ci < plano.chapas.length; ci++) {
        const ch = plano.chapas[ci];
        const maxPrintW = 700;
        const sc = Math.min(maxPrintW / ch.comprimento, 400 / ch.largura);
        const sw = ch.comprimento * sc;
        const sh = ch.largura * sc;
        const ref = ch.refilo || 0;

        let pecasSvg = '';
        for (let pi = 0; pi < ch.pecas.length; pi++) {
            const p = ch.pecas[pi];
            const px = (p.x + ref) * sc, py = (p.y + ref) * sc, pw = p.w * sc, ph = p.h * sc;
            const c = getColor(p.pecaId, p);
            const piece = pecasMap[p.pecaId];
            const hasBorda = piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira);
            pecasSvg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${c}20" stroke="${c}" stroke-width="1" rx="1"/>`;
            if (pw > 30 && ph > 14) pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2 - (pw > 40 && ph > 24 ? 4 : 0)}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(9, Math.min(pw / 8, ph / 3))}" fill="${c}" font-weight="600">${(piece?.descricao || `P${pi + 1}`).substring(0, Math.floor(pw / 5.5))}</text>`;
            if (pw > 40 && ph > 24) pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2 + 6}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(7, pw / 10)}" fill="${c}" opacity="0.7">${Math.round(p.w)} x ${Math.round(p.h)}</text>`;
            if (p.rotated && pw > 14 && ph > 14) pecasSvg += `<text x="${px + 6}" y="${py + 8}" font-size="6" fill="${c}" font-weight="700">R</text>`;
            if (hasBorda) {
                if (piece.borda_frontal) pecasSvg += `<line x1="${px}" y1="${py}" x2="${px + pw}" y2="${py}" stroke="#ff6b35" stroke-width="2"/>`;
                if (piece.borda_traseira) pecasSvg += `<line x1="${px}" y1="${py + ph}" x2="${px + pw}" y2="${py + ph}" stroke="#ff6b35" stroke-width="2"/>`;
                if (piece.borda_esq) pecasSvg += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py + ph}" stroke="#ff6b35" stroke-width="2"/>`;
                if (piece.borda_dir) pecasSvg += `<line x1="${px + pw}" y1="${py}" x2="${px + pw}" y2="${py + ph}" stroke="#ff6b35" stroke-width="2"/>`;
            }
            // Machining (usinagens) for print — clamped within piece bounds + clipPath
            if (piece?.machining_json && piece.machining_json !== '{}') {
                try {
                    const mach = JSON.parse(piece.machining_json);
                    if (mach.workers) {
                        const sX = pw / p.w, sY = ph / p.h;
                        const cX = v => Math.max(0, Math.min(v, pw));
                        const cY = v => Math.max(0, Math.min(v, ph));
                        const clipId = `pc${pi}`;
                        pecasSvg += `<defs><clipPath id="${clipId}"><rect x="${px}" y="${py}" width="${pw}" height="${ph}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
                        for (const [wk, w] of Object.entries(mach.workers)) {
                            if (w.position_x == null && !w.pos_start_for_line) continue;
                            let wx = 0, wy = 0;
                            if (w.position_x != null) {
                                if (p.rotated) { wx = cX(w.position_y * sX); wy = cY((p.w - w.position_x) * sY); }
                                else { wx = cX(w.position_x * sX); wy = cY(w.position_y * sY); }
                            }
                            if (w.category === 'Transfer_vertical_saw_cut' && w.pos_start_for_line) {
                                let sx2, sy2, ex2, ey2;
                                if (p.rotated) { sx2 = cX(w.pos_start_for_line.position_y * sX); sy2 = cY((p.w - w.pos_start_for_line.position_x) * sY); ex2 = cX(w.pos_end_for_line.position_y * sX); ey2 = cY((p.w - w.pos_end_for_line.position_x) * sY); }
                                else { sx2 = cX(w.pos_start_for_line.position_x * sX); sy2 = cY(w.pos_start_for_line.position_y * sY); ex2 = cX(w.pos_end_for_line.position_x * sX); ey2 = cY(w.pos_end_for_line.position_y * sY); }
                                pecasSvg += `<line x1="${px + sx2}" y1="${py + sy2}" x2="${px + ex2}" y2="${py + ey2}" stroke="#e11d48" stroke-width="${Math.max(0.8, (w.width_line || 3) * sY)}" opacity="0.45"/>`;
                            } else if (w.diameter && (w.quadrant === 'top' || w.quadrant === 'bottom')) {
                                const r2 = Math.max(1, (w.diameter / 2) * Math.min(sX, sY));
                                pecasSvg += `<circle cx="${px + wx}" cy="${py + wy}" r="${r2}" fill="${w.quadrant === 'top' ? '#e11d48' : '#7c3aed'}" opacity="0.5" stroke="${w.quadrant === 'top' ? '#be123c' : '#6d28d9'}" stroke-width="0.4"/>`;
                            }
                        }
                        pecasSvg += '</g>';
                    }
                } catch {}
            }
        }

        let retSvg = '';
        for (const r of (ch.retalhos || [])) {
            const rx = (r.x + ref) * sc, ry = (r.y + ref) * sc, rw = r.w * sc, rh = r.h * sc;
            retSvg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#22c55e08" stroke="#22c55e" stroke-width="1" stroke-dasharray="4 2" opacity="0.6"/>`;
            if (rw > 30 && rh > 12) retSvg += `<text x="${rx + rw / 2}" y="${ry + rh / 2}" text-anchor="middle" dominant-baseline="central" font-size="6" fill="#22c55e" opacity="0.7">${Math.round(r.w)}x${Math.round(r.h)}</text>`;
        }

        // Piece table
        let peçaRows = '';
        for (let pi = 0; pi < ch.pecas.length; pi++) {
            const p = ch.pecas[pi];
            const piece = pecasMap[p.pecaId];
            const hasBorda = piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira);
            peçaRows += `<tr><td>${pi + 1}</td><td>${piece?.descricao || '#' + p.pecaId}</td><td>${piece?.modulo_desc || '-'}</td><td style="text-align:right;font-family:monospace">${Math.round(p.w)} x ${Math.round(p.h)}</td><td style="text-align:center">${p.rotated ? '90°' : '-'}</td><td style="text-align:center">${hasBorda ? '●' : '-'}</td></tr>`;
        }

        chapasHtml += `
            <div class="page-break">
                <h3>Chapa ${ci + 1}: ${ch.material} <span style="font-weight:400;color:#888">(${ch.comprimento} x ${ch.largura} mm)</span></h3>
                <div style="display:flex;gap:12px;margin-bottom:8px;font-size:11px">
                    <span><b>Aproveitamento:</b> ${ch.aproveitamento.toFixed(1)}%</span>
                    <span><b>Peças:</b> ${ch.pecas.length}</span>
                    <span><b>Retalhos:</b> ${(ch.retalhos?.length || 0)}</span>
                    ${ch.veio && ch.veio !== 'sem_veio' ? `<span style="color:#8b5cf6"><b>Veio:</b> ${ch.veio === 'horizontal' ? '━ Horizontal' : '┃ Vertical'}</span>` : ''}
                    ${ch.preco > 0 ? `<span><b>Preço:</b> R$${ch.preco.toFixed(2)}</span>` : ''}
                </div>
                <svg width="${sw + 4}" height="${sh + 4}" viewBox="-2 -2 ${sw + 4} ${sh + 4}" style="border:1px solid #ddd;border-radius:4px;background:#fafafa">
                    <rect x="0" y="0" width="${sw}" height="${sh}" fill="#fff" stroke="#ccc" stroke-width="1"/>
                    ${ref > 0 ? `<rect x="${ref * sc}" y="${ref * sc}" width="${sw - 2 * ref * sc}" height="${sh - 2 * ref * sc}" fill="none" stroke="#ccc" stroke-width="0.5" stroke-dasharray="3 2"/>` : ''}
                    ${pecasSvg}${retSvg}
                </svg>
                <table class="pt"><thead><tr><th>#</th><th>Peça</th><th>Módulo</th><th>C x L (mm)</th><th>Rot.</th><th>Borda</th></tr></thead><tbody>${peçaRows}</tbody></table>
                ${ch.cortes?.length ? `<div style="margin-top:6px;font-size:10px;color:#666"><b>Sequência de Cortes:</b> ${ch.cortes.map(c => `${c.seq}. ${c.dir === 'Horizontal' ? '━' : '┃'} ${c.pos}mm`).join(' · ')}</div>` : ''}
            </div>`;
    }

    // Cost summary
    const byMat = {};
    for (const ch of plano.chapas) {
        const key = ch.material_code || ch.material;
        if (!byMat[key]) byMat[key] = { nome: ch.material, count: 0, preco: ch.preco || 0 };
        byMat[key].count++;
    }
    const mats = Object.values(byMat);
    const totalCost = mats.reduce((s, m) => s + m.count * m.preco, 0);
    let costHtml = '';
    if (totalCost > 0) {
        costHtml = `<div class="page-break"><h3>Resumo de Custos</h3><table class="pt"><thead><tr><th>Material</th><th>Qtd</th><th>Preço/Un</th><th>Subtotal</th></tr></thead><tbody>`;
        for (const m of mats) {
            costHtml += `<tr><td>${m.nome}</td><td style="text-align:center">${m.count}</td><td style="text-align:right">R$${m.preco.toFixed(2)}</td><td style="text-align:right;font-weight:600">R$${(m.count * m.preco).toFixed(2)}</td></tr>`;
        }
        costHtml += `<tr style="border-top:2px solid #333"><td colspan="3" style="font-weight:700">TOTAL</td><td style="text-align:right;font-weight:700;font-size:14px">R$ ${totalCost.toFixed(2)}</td></tr></tbody></table></div>`;
    }

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Plano de Corte — ${loteAtual.nome || 'Lote #' + loteAtual.id}</title>
    <style>
        body { font-family: -apple-system, Arial, sans-serif; margin: 20px; color: #333; font-size: 12px; }
        h2 { margin-bottom: 4px; } h3 { margin: 16px 0 6px; font-size: 14px; }
        .summary { display: flex; gap: 16px; margin-bottom: 16px; font-size: 13px; }
        .summary b { color: #e67e22; }
        .page-break { page-break-inside: avoid; margin-bottom: 20px; }
        .pt { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 8px; }
        .pt th, .pt td { border: 1px solid #ddd; padding: 3px 6px; text-align: left; }
        .pt th { background: #f5f5f5; font-weight: 600; }
        .pt tr:nth-child(even) { background: #fafafa; }
        @media print { body { margin: 10px; } .no-print { display: none; } }
    </style></head><body>
    <div class="no-print" style="margin-bottom:16px"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e67e22;color:#fff;border:none;border-radius:6px">Imprimir</button></div>
    <h2>Plano de Corte — ${loteAtual.nome || 'Lote #' + loteAtual.id}</h2>
    <div class="summary">
        <span><b>${plano.chapas.length}</b> chapas</span>
        <span><b>${plano.chapas.reduce((s, c) => s + c.pecas.length, 0)}</b> peças</span>
        <span>Aproveitamento: <b>${(plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / plano.chapas.length).toFixed(1)}%</b></span>
        ${totalCost > 0 ? `<span>Custo: <b>R$ ${totalCost.toFixed(2)}</b></span>` : ''}
    </div>
    ${chapasHtml}${costHtml}
    <div style="margin-top:20px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:6px">
        Gerado por Ornato ERP · ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
    </div>
    </body></html>`);
    win.document.close();
}

// ═══════════════════════════════════════════════════════
// ABA 3: PLANO DE CORTE (com painel de configuração)
// ═══════════════════════════════════════════════════════
function TabPlano({ lotes, loteAtual, setLoteAtual, notify, loadLotes }) {
    const [plano, setPlano] = useState(null);
    const [loading, setLoading] = useState(false);
    const [otimizando, setOtimizando] = useState(false);
    const [pecasMap, setPecasMap] = useState({});
    const [showConfig, setShowConfig] = useState(true);
    const [selectedChapa, setSelectedChapa] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    // Transfer area + undo/redo + selection
    const [transferArea, setTransferArea] = useState([]);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [selectedPieces, setSelectedPieces] = useState([]); // pecaIdx list for active sheet

    // Config overrides (loaded from cnc_config defaults)
    const [cfgLoaded, setCfgLoaded] = useState(false);
    const [espacoPecas, setEspacoPecas] = useState(7);
    const [refilo, setRefilo] = useState(10);
    const [permitirRotacao, setPermitirRotacao] = useState(true);
    const [modo, setModo] = useState('guilhotina');
    const [kerf, setKerf] = useState(4);
    const [usarRetalhos, setUsarRetalhos] = useState(true);
    const [iteracoes, setIteracoes] = useState(300);
    const [considerarSobra, setConsiderarSobra] = useState(true);
    const [sobraMinW, setSobraMinW] = useState(300);
    const [sobraMinH, setSobraMinH] = useState(600);
    const [direcaoCorte, setDirecaoCorte] = useState('misto');

    // Classificação de peças
    const [limiarPequena, setLimiarPequena] = useState(400);
    const [limiarSuperPequena, setLimiarSuperPequena] = useState(200);
    const [colorMode, setColorMode] = useState('modulo'); // 'modulo' | 'classificacao'

    // Load config defaults from API
    useEffect(() => {
        api.get('/cnc/config').then(cfg => {
            setEspacoPecas(cfg.espaco_pecas ?? 7);
            setKerf(cfg.kerf_padrao ?? 4);
            setModo(cfg.usar_guilhotina !== 0 ? 'guilhotina' : 'maxrects');
            setUsarRetalhos(cfg.usar_retalhos !== 0);
            setIteracoes(cfg.iteracoes_otimizador ?? 300);
            setConsiderarSobra(cfg.considerar_sobra !== 0);
            setSobraMinW(cfg.sobra_min_largura ?? 300);
            setSobraMinH(cfg.sobra_min_comprimento ?? 600);
            setCfgLoaded(true);
        }).catch(() => setCfgLoaded(true));
    }, []);

    const loadPlano = useCallback(() => {
        if (!loteAtual) return;
        setLoading(true);
        api.get(`/cnc/lotes/${loteAtual.id}`).then(async (d) => {
            let parsedPlano = null;
            if (d.plano_json) {
                try {
                    parsedPlano = JSON.parse(d.plano_json);
                    setPlano(parsedPlano);
                    setTransferArea(parsedPlano.transferencia || []);
                } catch (_) { setPlano(null); setTransferArea([]); }
            } else {
                setPlano(null);
                setTransferArea([]);
            }
            const map = {};
            for (const p of (d.pecas || [])) map[p.id] = p;

            // Multi-lote: load pecas from ALL lotes in the group so machining/names are available
            if (parsedPlano?.multi_lote && parsedPlano?.lote_ids?.length > 1) {
                const otherIds = parsedPlano.lote_ids.filter(id => id !== loteAtual.id);
                await Promise.all(otherIds.map(async (lid) => {
                    try {
                        const other = await api.get(`/cnc/lotes/${lid}`);
                        for (const p of (other.pecas || [])) {
                            if (!map[p.id]) map[p.id] = p;
                        }
                    } catch {}
                }));
            }

            setPecasMap(map);
        }).catch(e => notify(e.error || 'Erro ao carregar plano')).finally(() => setLoading(false));
    }, [loteAtual]);

    useEffect(() => { loadPlano(); }, [loadPlano]);
    useEffect(() => { setSelectedChapa(0); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }, [plano]);

    const otimizar = async () => {
        if (!loteAtual) return;
        setOtimizando(true);
        try {
            const r = await api.post(`/cnc/otimizar/${loteAtual.id}`, {
                espaco_pecas: espacoPecas,
                refilo,
                permitir_rotacao: permitirRotacao,
                modo,
                kerf,
                usar_retalhos: usarRetalhos,
                iteracoes,
                considerar_sobra: considerarSobra,
                sobra_min_largura: sobraMinW,
                sobra_min_comprimento: sobraMinH,
                direcao_corte: direcaoCorte,
                limiar_pequena: limiarPequena,
                limiar_super_pequena: limiarSuperPequena,
            });
            if (r.ok) {
                setPlano(r.plano);
                setPendingChanges(0); // Reset pending changes after fresh optimization
                setUndoStack([]); setRedoStack([]);
                const mats = Object.values(r.plano?.materiais || {});
                const minTeorico = mats.reduce((s, m) => s + (m.min_teorico_chapas || 0), 0);
                const eficiencia = minTeorico > 0 ? Math.round(minTeorico / r.total_chapas * 100) : 100;
                notify(`Otimizado: ${r.total_chapas} chapa(s), ${r.aproveitamento}% aproveitamento (mín. teórico: ${minTeorico} chapas, eficiência: ${eficiencia}%)`);
                loadLotes();
                const d = await api.get(`/cnc/lotes/${loteAtual.id}`);
                const map = {};
                for (const p of (d.pecas || [])) map[p.id] = p;
                setPecasMap(map);
                setLoteAtual(d);
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setOtimizando(false);
        }
    };

    const cfgInput = (label, value, setter, opts = {}) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</label>
            <input type="number" value={value} onChange={e => setter(Number(e.target.value))}
                className={Z.inp} style={{ width: opts.w || 90, fontSize: 12, padding: '5px 8px' }}
                min={opts.min ?? 0} max={opts.max} step={opts.step ?? 1} />
        </div>
    );

    const cfgToggle = (label, value, setter, tip) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setter(!value)} title={tip}>
            <div style={{
                width: 36, height: 20, borderRadius: 10, padding: 2, transition: 'all .2s',
                background: value ? 'var(--primary)' : 'var(--bg-muted)',
                border: `1px solid ${value ? 'var(--primary)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center',
            }}>
                <div style={{
                    width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'all .2s',
                    transform: value ? 'translateX(16px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        </div>
    );

    // Zoom handlers for detail view
    const handleWheel = (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            setZoomLevel(z => Math.max(0.3, Math.min(5, z + delta)));
        }
    };
    const handlePanStart = (e) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            setIsPanning(true);
            setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        }
    };
    const handlePanMove = (e) => {
        if (!isPanning) return;
        setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    };
    const handlePanEnd = () => setIsPanning(false);
    const resetView = () => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); };

    // Module color palette
    const modColorPalette = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'];
    const isMultiLote = plano?.multi_lote && plano?.lotes_info?.length > 1;

    // Classification colors: green=normal, yellow=pequena, red=super_pequena
    const classColors = { normal: '#22c55e', pequena: '#f59e0b', super_pequena: '#ef4444' };
    const classLabels = { normal: 'Normal', pequena: 'Pequena', super_pequena: 'Super Pequena' };

    // Client-side classification helper (for realtime preview when thresholds change)
    const classifyLocal = (w, h) => {
        const minDim = Math.min(w, h);
        if (minDim < limiarSuperPequena) return 'super_pequena';
        if (minDim < limiarPequena) return 'pequena';
        return 'normal';
    };

    const getModColor = (pecaId, pecaObj) => {
        // Classification mode: color by piece size
        if (colorMode === 'classificacao' && pecaObj) {
            const cls = pecaObj.classificacao || classifyLocal(pecaObj.w, pecaObj.h);
            return classColors[cls] || classColors.normal;
        }
        // Multi-lote: colorir por projeto (cada lote = cor diferente)
        if (isMultiLote && pecaObj?.cor) return pecaObj.cor;
        if (isMultiLote && pecaObj?.loteId && plano.lotes_info) {
            const info = plano.lotes_info.find(l => l.id === pecaObj.loteId);
            if (info?.cor) return info.cor;
        }
        const piece = pecasMap[pecaId];
        if (!piece) return modColorPalette[0];
        const modId = piece.modulo_id || 0;
        return modColorPalette[modId % modColorPalette.length];
    };

    // Collect legend: classification mode or module mode
    const moduleLegend = plano ? (() => {
        if (colorMode === 'classificacao') {
            // Classification legend — show counts per class
            const stats = plano.classificacao?.stats || {};
            const total = (stats.normal || 0) + (stats.pequena || 0) + (stats.super_pequena || 0);
            // Also compute client-side counts (if thresholds changed after optimization)
            let clientStats = { normal: 0, pequena: 0, super_pequena: 0 };
            for (const ch of plano.chapas) {
                for (const p of ch.pecas) {
                    const cls = classifyLocal(p.w, p.h);
                    clientStats[cls]++;
                }
            }
            return [
                { name: `Normal (≥${limiarPequena}mm) — ${clientStats.normal} pç`, color: classColors.normal },
                { name: `Pequena (<${limiarPequena}mm) — ${clientStats.pequena} pç`, color: classColors.pequena },
                { name: `Super Pequena (<${limiarSuperPequena}mm) — ${clientStats.super_pequena} pç`, color: classColors.super_pequena },
            ].filter(l => {
                const count = parseInt(l.name.match(/— (\d+)/)?.[1] || '0');
                return count > 0;
            });
        }
        if (isMultiLote) {
            return plano.lotes_info.map(l => ({
                name: `${l.cliente || l.projeto || l.nome}${l.projeto && l.cliente ? ' — ' + l.projeto : ''}`,
                color: l.cor,
            }));
        }
        const mods = {};
        for (const ch of plano.chapas) {
            for (const p of ch.pecas) {
                const piece = pecasMap[p.pecaId];
                if (piece?.modulo_desc) {
                    const modId = piece.modulo_id || 0;
                    mods[modId] = { name: piece.modulo_desc, color: modColorPalette[modId % modColorPalette.length] };
                }
            }
        }
        return Object.values(mods);
    })() : [];

    // Material cost summary
    const costSummary = plano ? (() => {
        const byMat = {};
        for (const ch of plano.chapas) {
            const key = ch.material_code || ch.material;
            if (!byMat[key]) byMat[key] = { nome: ch.material, count: 0, preco: ch.preco || 0, area: 0 };
            byMat[key].count++;
            byMat[key].area += (ch.comprimento * ch.largura) / 1e6;
        }
        return Object.values(byMat);
    })() : [];

    const totalCost = costSummary.reduce((s, m) => s + m.count * m.preco, 0);

    // Pending changes counter (unsaved adjustments)
    const [pendingChanges, setPendingChanges] = useState(0);

    // Handle manual adjustments — zero-refresh: update local state, sync to server silently
    // ═══ Gerar G-Code por chapa ═══
    const [gcodeLoading, setGcodeLoading] = useState(null); // chapaIdx sendo gerado
    const [gcodePreview, setGcodePreview] = useState(null); // { gcode, filename, stats, alertas, chapaIdx, contorno_tool, ferramentas_faltando }
    const handleGerarGcode = async (chapaIdx) => {
        if (!loteAtual) return;
        setGcodeLoading(chapaIdx);
        try {
            const r = await api.post(`/cnc/gcode/${loteAtual.id}/chapa/${chapaIdx}`, {});
            if (r.ok) {
                // Pegar dados da chapa do plano para o simulador 2D
                const chapaInfo = plano?.chapas?.[chapaIdx] || null;
                setGcodePreview({
                    gcode: r.gcode,
                    filename: r.filename || `chapa_${chapaIdx + 1}.nc`,
                    stats: r.stats || {},
                    alertas: r.alertas || [],
                    chapaIdx,
                    contorno_tool: r.contorno_tool || null,
                    chapa: chapaInfo ? {
                        comprimento: chapaInfo.comprimento,
                        largura: chapaInfo.largura,
                        refilo: chapaInfo.refilo ?? 10,
                        espessura: chapaInfo.espessura_real || chapaInfo.espessura || 18.5,
                        material_code: chapaInfo.material_code || '',
                        pecas: (chapaInfo.pecas || []).map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, nome: p.nome })),
                        retalhos: chapaInfo.retalhos || [],
                    } : null,
                });
            } else {
                notify(r.error || 'Erro ao gerar G-Code', 'error');
                if (r.ferramentas_faltando?.length > 0) {
                    notify(`Ferramentas faltando: ${r.ferramentas_faltando.join(', ')}`, 'error');
                }
            }
        } catch (err) {
            notify('Erro ao gerar G-Code: ' + err.message, 'error');
        } finally {
            setGcodeLoading(null);
        }
    };

    const handleDownloadGcode = () => {
        if (!gcodePreview) return;
        const blob = new Blob([gcodePreview.gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = gcodePreview.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify(`GCode baixado: ${gcodePreview.filename}`);
        setGcodePreview(null);
    };

    const handleAdjust = async (params) => {
        if (!loteAtual || !plano) return;
        // Save snapshot for undo before action
        setUndoStack(prev => [...prev.slice(-49), JSON.stringify(plano)]);
        setRedoStack([]);

        // ═══ Optimistic local update for move/rotate — no scroll jump ═══
        if (params.action === 'move' && params.chapaIdx != null && params.pecaIdx != null) {
            setPlano(prev => {
                if (!prev?.chapas) return prev;
                const chapas = prev.chapas.map((ch, ci) => {
                    if (ci !== params.chapaIdx) return ch;
                    const pecas = ch.pecas.map((p, pi) => {
                        if (pi !== params.pecaIdx) return p;
                        return { ...p, x: params.x, y: params.y };
                    });
                    return { ...ch, pecas };
                });
                return { ...prev, chapas };
            });
            setPendingChanges(prev => prev + 1);
            // Sync to server in background (no await, no re-render from response)
            api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params).catch(err => {
                if (err.collision) notify('Colisão detectada no servidor — desfazendo.');
                else notify('Erro ao salvar posição: ' + (err.error || err.message));
                // Revert on server error
                setUndoStack(prev => {
                    const last = prev[prev.length - 1];
                    if (last) setPlano(JSON.parse(last));
                    return prev.slice(0, -1);
                });
            });
            return;
        }

        if (params.action === 'rotate' && params.chapaIdx != null && params.pecaIdx != null) {
            setPlano(prev => {
                if (!prev?.chapas) return prev;
                const chapas = prev.chapas.map((ch, ci) => {
                    if (ci !== params.chapaIdx) return ch;
                    const pecas = ch.pecas.map((p, pi) => {
                        if (pi !== params.pecaIdx) return p;
                        return { ...p, w: p.h, h: p.w, rotated: !p.rotated };
                    });
                    return { ...ch, pecas };
                });
                return { ...prev, chapas };
            });
            setPendingChanges(prev => prev + 1);
            api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params).catch(() => {
                setUndoStack(prev => {
                    const last = prev[prev.length - 1];
                    if (last) setPlano(JSON.parse(last));
                    return prev.slice(0, -1);
                });
            });
            return;
        }

        // ═══ Non-move actions: keep server round-trip with scroll preservation ═══
        const mainEl = document.querySelector('main');
        const savedScroll = mainEl?.scrollTop ?? 0;
        const restoreScroll = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (mainEl) mainEl.scrollTop = savedScroll;
                    });
                });
            });
        };

        try {
            const r = await api.put(`/cnc/plano/${loteAtual.id}/ajustar`, params);
            if (r.ok) {
                setPlano(r.plano);
                setTransferArea(r.plano.transferencia || []);
                setPendingChanges(prev => prev + 1);
                if (r.aproveitamento != null) {
                    setLoteAtual(prev => prev ? { ...prev, aproveitamento: r.aproveitamento, total_chapas: r.plano?.chapas?.length || prev.total_chapas } : prev);
                }
                restoreScroll();
            }
        } catch (err) {
            setUndoStack(prev => prev.slice(0, -1));
            if (err.locked) {
                notify(err.error || 'Chapa travada — destrave para editar.');
            } else if (err.collision) {
                notify('Colisão! Peça não pode ser colocada nesta posição.');
            } else if (err.materialMismatch) {
                notify(err.error || 'Material incompatível entre chapas.');
            } else {
                notify('Erro: ' + (err.error || err.message));
            }
            restoreScroll();
        }
    };

    // Undo — zero-refresh: restore local state, sync in background
    const handleUndo = async () => {
        if (undoStack.length === 0 || !loteAtual) return;
        const mainEl = document.querySelector('main');
        const savedScroll = mainEl?.scrollTop ?? 0;
        const prevState = undoStack[undoStack.length - 1];
        setRedoStack(prev => [...prev, JSON.stringify(plano)]);
        setUndoStack(prev => prev.slice(0, -1));
        const restored = JSON.parse(prevState);
        setPlano(restored);
        setTransferArea(restored.transferencia || []);
        setPendingChanges(prev => prev + 1);
        requestAnimationFrame(() => { requestAnimationFrame(() => { if (mainEl) mainEl.scrollTop = savedScroll; }); });
        // Sync to server silently (no re-fetch)
        try {
            await api.put(`/cnc/plano/${loteAtual.id}/ajustar`, { action: 'restore', planoData: prevState });
        } catch (_) {}
    };

    // Redo — zero-refresh
    const handleRedo = async () => {
        if (redoStack.length === 0 || !loteAtual) return;
        const mainEl = document.querySelector('main');
        const savedScroll = mainEl?.scrollTop ?? 0;
        const nextState = redoStack[redoStack.length - 1];
        setUndoStack(prev => [...prev, JSON.stringify(plano)]);
        setRedoStack(prev => prev.slice(0, -1));
        const restored = JSON.parse(nextState);
        setPlano(restored);
        requestAnimationFrame(() => { requestAnimationFrame(() => { if (mainEl) mainEl.scrollTop = savedScroll; }); });
        setTransferArea(restored.transferencia || []);
        setPendingChanges(prev => prev + 1);
        // Sync to server silently (no re-fetch)
        try {
            await api.put(`/cnc/plano/${loteAtual.id}/ajustar`, { action: 'restore', planoData: nextState });
        } catch (_) {}
    };

    // Piece selection handler
    const handleSelectPiece = (pecaIdx, toggle) => {
        if (toggle) {
            setSelectedPieces(prev => prev.includes(pecaIdx) ? prev.filter(i => i !== pecaIdx) : [...prev, pecaIdx]);
        } else {
            setSelectedPieces([pecaIdx]);
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
            if (e.key === 'Escape') setSelectedPieces([]);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });

    // Reset selection when switching sheets
    useEffect(() => { setSelectedPieces([]); }, [selectedChapa]);

    return (
        <div>
            <LoteSelector lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} />

            {!loteAtual ? (
                <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Selecione um lote para ver o plano de corte
                </div>
            ) : loading ? (
                <Spinner text="Carregando plano..." />
            ) : (
                <>
                    {/* CONFIG PANEL */}
                    <div className="glass-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
                        <button onClick={() => setShowConfig(!showConfig)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                borderBottom: showConfig ? '1px solid var(--border)' : 'none',
                            }}>
                            <Settings size={15} />
                            Configurar Otimizador
                            <ChevronDown size={14} style={{ marginLeft: 'auto', transition: 'transform .2s', transform: showConfig ? 'rotate(180deg)' : '' }} />
                        </button>

                        {showConfig && (
                            <div style={{ padding: '16px' }}>
                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Modo</label>
                                        <select value={modo} onChange={e => setModo(e.target.value)}
                                            className={Z.inp} style={{ width: 200, fontSize: 12, padding: '5px 8px' }}>
                                            <option value="guilhotina">Guilhotina (esquadrejadeira)</option>
                                            <option value="maxrects">MaxRects (CNC livre)</option>
                                            <option value="shelf">Shelf (faixas horizontais)</option>
                                        </select>
                                        {modo === 'guilhotina' && <p style={{ fontSize: 10, color: '#d97706', margin: '2px 0 0' }}>Cortes de ponta a ponta — aproveitamento típico 5-15% menor que CNC livre</p>}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Direção de corte</label>
                                        <select value={direcaoCorte} onChange={e => setDirecaoCorte(e.target.value)}
                                            className={Z.inp} style={{ width: 190, fontSize: 12, padding: '5px 8px' }}>
                                            <option value="misto">Misto (livre)</option>
                                            <option value="horizontal">Horizontal (faixas)</option>
                                            <option value="vertical">Vertical (colunas)</option>
                                        </select>
                                    </div>
                                    {cfgInput('Espaçamento (mm)', espacoPecas, setEspacoPecas, { min: 0, max: 30, step: 0.5 })}
                                    {cfgInput('Refilo (mm)', refilo, setRefilo, { min: 0, max: 50 })}
                                    {(modo === 'guilhotina' || modo === 'shelf') && cfgInput('Kerf serra (mm)', kerf, setKerf, { min: 1, max: 10, step: 0.5 })}
                                    {cfgInput('Iterações R&R', iteracoes, setIteracoes, { min: 0, max: 2000, step: 50, w: 100 })}
                                </div>

                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                                    {cfgToggle('Permitir rotação 90°', permitirRotacao, setPermitirRotacao, 'Materiais com veio ignoram esta opção')}
                                    {cfgToggle('Usar retalhos', usarRetalhos, setUsarRetalhos)}
                                    {cfgToggle('Gerar sobras', considerarSobra, setConsiderarSobra)}
                                </div>

                                {considerarSobra && (
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end',
                                        padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', alignSelf: 'center' }}>
                                            Sobra mínima:
                                        </span>
                                        {cfgInput('Largura (mm)', sobraMinW, setSobraMinW, { min: 50, max: 1000 })}
                                        {cfgInput('Comprimento (mm)', sobraMinH, setSobraMinH, { min: 50, max: 2000 })}
                                    </div>
                                )}

                                {/* Classificação de peças */}
                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12,
                                    padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', alignSelf: 'center' }}>
                                        Classificação de peças:
                                    </span>
                                    {cfgInput('Pequena < (mm)', limiarPequena, setLimiarPequena, { min: 100, max: 800, step: 50 })}
                                    {cfgInput('Super pequena < (mm)', limiarSuperPequena, setLimiarSuperPequena, { min: 50, max: 400, step: 25 })}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Colorir por</label>
                                        <select value={colorMode} onChange={e => setColorMode(e.target.value)}
                                            className={Z.inp} style={{ width: 180, fontSize: 12, padding: '5px 8px' }}>
                                            <option value="modulo">Módulo</option>
                                            <option value="classificacao">Classificação (tamanho)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* OPTIMIZE BUTTON */}
                    <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={otimizar} disabled={otimizando} className={Z.btn}
                            style={{ padding: '12px 28px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                            {otimizando ? <><RotateCw size={16} className="animate-spin" /> Otimizando...</> : <><Scissors size={16} /> Otimizar Corte</>}
                        </button>
                        {plano && plano.chapas?.length > 0 && (
                            <button onClick={() => printPlano(plano, pecasMap, loteAtual, getModColor)} className={Z.btn2}
                                style={{ padding: '10px 20px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Printer size={14} /> Imprimir / PDF
                            </button>
                        )}
                        {loteAtual.status === 'otimizado' && (
                            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                                <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                                Otimizado
                            </span>
                        )}
                        {otimizando && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Testando {modo === 'guilhotina' ? 'guilhotina' : modo === 'shelf' ? 'shelf' : 'MaxRects'} · Todos os algoritmos · {iteracoes} iterações R&R...
                            </span>
                        )}
                        {/* Action buttons for manual adjustments */}
                        {plano && plano.chapas?.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', alignItems: 'center' }}>
                                <button onClick={handleUndo} disabled={undoStack.length === 0} className={Z.btn2}
                                    title="Desfazer (Ctrl+Z)" style={{ padding: '6px 8px', fontSize: 11, opacity: undoStack.length === 0 ? 0.4 : 1 }}>
                                    <Undo2 size={14} />
                                </button>
                                <button onClick={handleRedo} disabled={redoStack.length === 0} className={Z.btn2}
                                    title="Refazer (Ctrl+Y)" style={{ padding: '6px 8px', fontSize: 11, opacity: redoStack.length === 0 ? 0.4 : 1 }}>
                                    <Redo2 size={14} />
                                </button>
                                {/* Pending changes badge */}
                                {pendingChanges > 0 && (
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: colorBg('#f59e0b'), color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
                                        title={`${pendingChanges} alteração(ões) salvas automaticamente`}>
                                        <Edit size={10} /> {pendingChanges}
                                    </span>
                                )}
                                <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
                                <button onClick={() => handleAdjust({ action: 'compact', chapaIdx: selectedChapa })} className={Z.btn2}
                                    title="Compactar peças" style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Maximize2 size={13} /> Compactar
                                </button>
                                <button onClick={() => handleAdjust({ action: 're_optimize', chapaIdx: selectedChapa })} className={Z.btn2}
                                    disabled={plano?.chapas?.[selectedChapa]?.locked}
                                    title={plano?.chapas?.[selectedChapa]?.locked ? 'Chapa travada — destrave para reotimizar' : 'Re-otimizar chapa'}
                                    style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, opacity: plano?.chapas?.[selectedChapa]?.locked ? 0.4 : 1 }}>
                                    <Zap size={13} /> Re-otimizar
                                </button>
                                <button onClick={() => {
                                    const mat = plano.chapas[selectedChapa]?.material;
                                    if (mat) handleAdjust({ action: 'add_sheet', material: mat });
                                }} className={Z.btn2}
                                    title="Adicionar chapa" style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Plus size={13} /> Chapa
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RESULTS */}
                    {plano && plano.chapas && plano.chapas.length > 0 ? (
                        <>
                            {/* Summary cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
                                <InfoCard label="Chapas" value={plano.chapas.length} highlight />
                                <InfoCard label="Aproveitamento" value={`${loteAtual.aproveitamento || (plano.chapas.reduce((s, c) => s + c.aproveitamento, 0) / plano.chapas.length).toFixed(1)}%`} />
                                <InfoCard label="Total Peças" value={plano.chapas.reduce((s, c) => s + c.pecas.length, 0)} />
                                <InfoCard label="Retalhos" value={plano.chapas.reduce((s, c) => s + (c.retalhos?.length || 0), 0)} />
                                {plano.materiais && (() => {
                                    const mats = Object.values(plano.materiais);
                                    const minTeorico = mats.reduce((s, m) => s + (m.min_teorico_chapas || 0), 0);
                                    return minTeorico > 0 ? (
                                        <InfoCard label="Mín. Teórico" value={`${minTeorico} chapa${minTeorico > 1 ? 's' : ''}`} />
                                    ) : null;
                                })()}
                                <InfoCard label="Kerf" value={`${plano.chapas[0]?.kerf || 4}mm`} />
                                {totalCost > 0 && <InfoCard label="Custo Chapas" value={`R$ ${totalCost.toFixed(2)}`} />}
                            </div>

                            {/* Classification stats bar */}
                            {plano.classificacao?.ativo && (() => {
                                let stats = { normal: 0, pequena: 0, super_pequena: 0 };
                                for (const ch of plano.chapas) {
                                    for (const p of ch.pecas) {
                                        const cls = classifyLocal(p.w, p.h);
                                        stats[cls]++;
                                    }
                                }
                                const total = stats.normal + stats.pequena + stats.super_pequena;
                                if (stats.pequena === 0 && stats.super_pequena === 0) return null;
                                return (
                                    <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                        <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>Atenção: peças especiais</span>
                                        {stats.pequena > 0 && (
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f59e0b', color: '#fff', fontWeight: 700 }}>
                                                {stats.pequena} pequena{stats.pequena > 1 ? 's' : ''} (&lt;{limiarPequena}mm)
                                            </span>
                                        )}
                                        {stats.super_pequena > 0 && (
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#ef4444', color: '#fff', fontWeight: 700 }}>
                                                {stats.super_pequena} super pequena{stats.super_pequena > 1 ? 's' : ''} (&lt;{limiarSuperPequena}mm)
                                            </span>
                                        )}
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                            Corte especial: velocidade reduzida, múltiplos passes, tabs/microjuntas
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* Multi-projeto banner */}
                            {isMultiLote && (
                                <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <Zap size={14} style={{ color: '#3b82f6' }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>Otimização Multi-Projeto</span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {plano.lotes_info.length} projetos combinados
                                    </span>
                                </div>
                            )}

                            {/* Legend: projetos (multi) ou módulos (single) */}
                            {moduleLegend.length > 1 && (
                                <div style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '6px 12px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        {isMultiLote ? 'Projetos:' : 'Módulos:'}
                                    </span>
                                    {moduleLegend.map((m, i) => (
                                        <span key={i} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-primary)' }}>
                                            <span style={{ width: 10, height: 10, borderRadius: 2, background: m.color, border: `1px solid ${m.color}`, display: 'inline-block' }} />
                                            {m.name}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* ═══ LAYOUT LADO A LADO: Thumbnails + Detalhe ═══ */}
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                                {/* LEFT: Thumbnail list */}
                                <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: 4 }}>
                                    {plano.chapas.map((chapa, ci) => {
                                        const isActive = ci === selectedChapa;
                                        const thumbScale = Math.min(180 / chapa.comprimento, 80 / chapa.largura);
                                        const thumbW = chapa.comprimento * thumbScale;
                                        const thumbH = chapa.largura * thumbScale;
                                        return (
                                            <div key={ci}
                                                onClick={() => { setSelectedChapa(ci); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                                                style={{
                                                    padding: 8, borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                                                    background: isActive ? 'var(--primary-bg, rgba(230,126,34,0.08))' : chapa.locked ? 'rgba(59,130,246,0.05)' : 'var(--bg-card)',
                                                    border: `2px solid ${chapa.locked ? '#3b82f6' : isActive ? 'var(--primary)' : 'var(--border)'}`,
                                                    boxShadow: isActive ? '0 0 0 1px var(--primary)' : 'none',
                                                }}>
                                                {/* Mini SVG */}
                                                <svg width={thumbW} height={thumbH} viewBox={`0 0 ${chapa.comprimento} ${chapa.largura}`}
                                                    style={{ display: 'block', margin: '0 auto 6px', background: 'var(--bg-body)', borderRadius: 3, border: '1px solid var(--border)' }}>
                                                    {chapa.pecas.map((p, pi) => (
                                                        <rect key={pi}
                                                            x={p.x + (chapa.refilo || 0)} y={p.y + (chapa.refilo || 0)}
                                                            width={p.w} height={p.h}
                                                            fill={`${getModColor(p.pecaId, p)}30`}
                                                            stroke={getModColor(p.pecaId, p)} strokeWidth={Math.max(1, 2 / thumbScale)} />
                                                    ))}
                                                    {(chapa.retalhos || []).map((r, ri) => (
                                                        <rect key={`s${ri}`}
                                                            x={r.x + (chapa.refilo || 0)} y={r.y + (chapa.refilo || 0)}
                                                            width={r.w} height={r.h}
                                                            fill="#22c55e08" stroke="#22c55e" strokeWidth={Math.max(1, 2 / thumbScale)} strokeDasharray="8 4" opacity={0.5} />
                                                    ))}
                                                </svg>
                                                {/* Info */}
                                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Box size={11} />
                                                    Chapa {ci + 1}
                                                    {chapa.is_retalho && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: colorBg('#06b6d4'), color: '#06b6d4', fontWeight: 700 }}>RET</span>}
                                                    {chapa.veio && chapa.veio !== 'sem_veio' && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: colorBg('#8b5cf6'), color: '#8b5cf6', fontWeight: 700 }}>VEIO</span>}
                                                    <button onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (chapa.locked && !confirm('Destravar esta chapa? Ela poderá ser editada e reotimizada.')) return;
                                                        handleAdjust({ action: chapa.locked ? 'unlock_sheet' : 'lock_sheet', chapaIdx: ci });
                                                    }} title={chapa.locked ? 'Destravar chapa' : 'Travar chapa'}
                                                    style={{ marginLeft: 'auto', padding: '1px 4px', borderRadius: 4, border: 'none', cursor: 'pointer', background: chapa.locked ? '#3b82f6' : 'transparent', color: chapa.locked ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                                        {chapa.locked ? <Lock size={10} /> : <Unlock size={10} />}
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {chapa.pecas.length} pç · {chapa.aproveitamento.toFixed(1)}%
                                                    {chapa.preco > 0 && ` · R$${chapa.preco.toFixed(2)}`}
                                                </div>
                                                {/* Occupancy bar */}
                                                <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: 'var(--bg-muted)', overflow: 'hidden' }}>
                                                    <div style={{
                                                        height: '100%', borderRadius: 2, transition: 'width .3s',
                                                        width: `${Math.min(100, chapa.aproveitamento)}%`,
                                                        background: chapa.aproveitamento >= 80 ? '#22c55e' : chapa.aproveitamento >= 60 ? '#f59e0b' : '#ef4444',
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Material cost summary */}
                                    {costSummary.length > 0 && totalCost > 0 && (
                                        <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Custo Material</div>
                                            {costSummary.map((m, i) => (
                                                <div key={i} style={{ fontSize: 10, display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                                    <span style={{ color: 'var(--text-primary)' }}>{m.count}x {m.nome?.substring(0, 18)}</span>
                                                    <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)' }}>R${(m.count * m.preco).toFixed(2)}</span>
                                                </div>
                                            ))}
                                            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4, fontSize: 11, fontWeight: 700, display: 'flex', justifyContent: 'space-between', color: 'var(--primary)' }}>
                                                <span>Total</span>
                                                <span>R$ {totalCost.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    )}
                                    {/* ═══ BANDEJA DE TRANSFERÊNCIA ═══ */}
                                    <div style={{
                                        marginTop: 8, padding: 8, borderRadius: 8, position: 'sticky', bottom: 0, zIndex: 2,
                                        background: transferArea.length > 0 ? 'var(--bg-card)' : 'var(--bg-muted)',
                                        border: `2px ${transferArea.length > 0 ? 'solid' : 'dashed'} ${transferArea.length > 0 ? '#f59e0b' : 'var(--border)'}`,
                                        transition: 'all .2s',
                                    }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: transferArea.length > 0 ? '#f59e0b' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: transferArea.length > 0 ? 6 : 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <ArrowLeftRight size={11} /> Transferência {transferArea.length > 0 ? `(${transferArea.length})` : ''}
                                        </div>
                                        {transferArea.length === 0 && (
                                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                                                Clique direito em uma peça → "Mover para transferência"
                                            </div>
                                        )}
                                        {transferArea.map((tp, ti) => {
                                            const piece = pecasMap[tp.pecaId];
                                            const targetChapa = plano.chapas[selectedChapa];
                                            const tpMat = tp.fromMaterial;
                                            const isCompatible = !tpMat || !targetChapa?.material_code || tpMat === (targetChapa.material_code || targetChapa.material);
                                            const compatibleChapas = plano.chapas
                                                .map((ch, ci) => ({ idx: ci, material_code: ch.material_code || ch.material, material: ch.material, nome: ch.nome }))
                                                .filter(ch => !tpMat || tpMat === ch.material_code);

                                            return (
                                                <div key={ti} style={{
                                                    padding: '5px 7px', marginBottom: 4, borderRadius: 5, fontSize: 9,
                                                    background: isCompatible ? 'var(--bg-muted)' : '#fef2f233',
                                                    border: `1px solid ${isCompatible ? '#f59e0b44' : '#ef444466'}`,
                                                    transition: 'all .15s',
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 10 }}>
                                                            {piece?.descricao?.substring(0, 18) || tp.nome?.substring(0, 18) || `#${tp.pecaId}`}
                                                        </div>
                                                        <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3,
                                                            background: '#f59e0b22', color: '#f59e0b', fontWeight: 600 }}>
                                                            {Math.round(tp.w)}x{Math.round(tp.h)}
                                                        </span>
                                                    </div>
                                                    {tpMat && (
                                                        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>
                                                            {tpMat} {tp.espessura ? `· ${tp.espessura}mm` : ''}
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                                                        {compatibleChapas.map(ch => (
                                                            <button key={ch.idx}
                                                                onClick={() => handleAdjust({ action: 'from_transfer', transferIdx: ti, targetChapaIdx: ch.idx })}
                                                                className={Z.btn2}
                                                                style={{
                                                                    padding: '2px 6px', fontSize: 8, fontWeight: 600,
                                                                    background: ch.idx === selectedChapa ? '#f59e0b' : undefined,
                                                                    color: ch.idx === selectedChapa ? '#fff' : '#f59e0b',
                                                                    border: '1px solid #f59e0b44', borderRadius: 3,
                                                                }}>
                                                                → Ch {ch.idx + 1}
                                                            </button>
                                                        ))}
                                                        {compatibleChapas.length === 0 && (
                                                            <span style={{ fontSize: 8, color: '#ef4444', fontStyle: 'italic' }}>
                                                                Nenhuma chapa compatível
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* RIGHT: Detail view */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {plano.chapas[selectedChapa] && (
                                        <ChapaViz
                                            chapa={plano.chapas[selectedChapa]}
                                            idx={selectedChapa}
                                            pecasMap={pecasMap}
                                            modo={plano.modo}
                                            zoomLevel={zoomLevel}
                                            setZoomLevel={setZoomLevel}
                                            panOffset={panOffset}
                                            onWheel={handleWheel}
                                            onPanStart={handlePanStart}
                                            onPanMove={handlePanMove}
                                            onPanEnd={handlePanEnd}
                                            resetView={resetView}
                                            getModColor={getModColor}
                                            onAdjust={handleAdjust}
                                            selectedPieces={selectedPieces}
                                            onSelectPiece={handleSelectPiece}
                                            kerfSize={kerf}
                                            allChapas={plano.chapas}
                                            classifyLocal={classifyLocal}
                                            classColors={classColors}
                                            classLabels={classLabels}
                                            onGerarGcode={handleGerarGcode}
                                            gcodeLoading={gcodeLoading}
                                        />
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Scissors size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                            <div>Clique em "Otimizar Corte" para gerar o plano</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>Ajuste as configurações acima antes de otimizar</div>
                        </div>
                    )}
                </>
            )}

            {/* ═══ Modal Preview G-Code ═══ */}
            {gcodePreview && (
                <GcodePreviewModal
                    data={gcodePreview}
                    onDownload={handleDownloadGcode}
                    onClose={() => setGcodePreview(null)}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MODAL PREVIEW G-CODE — visualiza stats + código antes de baixar
// ═══════════════════════════════════════════════════════
// ─── G-Code Parser para simulador 2D (com eventos de ferramenta/operação) ───
function parseGcodeForSim(text) {
    const moves = [];
    const events = []; // { moveIdx, type: 'tool'|'op'|'spindle', label }
    let x = 0, y = 0, z = 0, mode = 'G0';
    let curTool = '', curOp = '';
    for (const raw of text.split('\n')) {
        // Extrair comentários antes de removê-los
        const cmtMatch = raw.match(/[;(]\s*(.+?)\s*\)?$/);
        const comment = cmtMatch ? cmtMatch[1] : '';
        // Detectar troca de ferramenta via comentário (ex: "; Troca: Fresa 6mm" ou "( Ferramenta: ... )")
        if (/troca|ferramenta|tool/i.test(comment)) {
            curTool = comment.replace(/^(Troca:\s*|Ferramenta:\s*|Tool:\s*)/i, '').trim();
            events.push({ moveIdx: moves.length, type: 'tool', label: curTool });
        }
        // Detectar operação via comentário (ex: "; === Contorno Peca: Lateral Direita ===" ou "; Furo ...")
        if (/===|contorno|furo|rebaixo|canal|pocket|usinagem/i.test(comment) && !/troca|ferramenta/i.test(comment)) {
            curOp = comment.replace(/^=+\s*|\s*=+$/g, '').trim();
            events.push({ moveIdx: moves.length, type: 'op', label: curOp });
        }
        // Detectar spindle
        if (/M3\b|M03\b/i.test(raw) && !/M30/i.test(raw)) {
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle ON' });
        }
        if (/M5\b|M05\b/i.test(raw)) {
            events.push({ moveIdx: moves.length, type: 'spindle', label: 'Spindle OFF' });
        }
        const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim();
        if (!line) continue;
        const cmd = line.replace(/^N\d+\s*/, '');
        const gMatch = cmd.match(/G([0-3])\b/i);
        if (gMatch) mode = `G${gMatch[1]}`;
        const xM = cmd.match(/X([+-]?[\d.]+)/i), yM = cmd.match(/Y([+-]?[\d.]+)/i), zM = cmd.match(/Z([+-]?[\d.]+)/i);
        const newX = xM ? parseFloat(xM[1]) : x, newY = yM ? parseFloat(yM[1]) : y, newZ = zM ? parseFloat(zM[1]) : z;
        if (xM || yM) { moves.push({ type: mode, x1: x, y1: y, z1: z, x2: newX, y2: newY, z2: newZ, tool: curTool, op: curOp }); }
        x = newX; y = newY; z = newZ;
    }
    return { moves, events };
}

// ─── Categorias de operação CNC (cores por tipo) ───────────────────────────
const OP_CATS = [
    { key: 'contorno', pat: /contorno/i, color: '#a6e3a1', label: 'Contorno' },
    { key: 'rebaixo',  pat: /rebaixo/i,  color: '#89b4fa', label: 'Rebaixo' },
    { key: 'canal',    pat: /canal/i,    color: '#cba6f7', label: 'Canal' },
    { key: 'furo',     pat: /furo/i,     color: '#f9e2af', label: 'Furo' },
    { key: 'pocket',   pat: /pocket/i,   color: '#f38ba8', label: 'Pocket' },
    { key: 'rasgo',    pat: /rasgo/i,    color: '#94e2d5', label: 'Rasgo' },
    { key: 'gola',     pat: /gola/i,     color: '#fab387', label: 'Gola' },
    { key: 'fresagem', pat: /fresagem/i, color: '#74c7ec', label: 'Fresagem' },
];
function getOpCat(op) {
    const lo = (op || '').toLowerCase();
    for (const c of OP_CATS) { if (c.pat.test(lo)) return c; }
    return { key: 'outro', color: '#a6adc8', label: 'Outro' };
}

// ─── Simulador 2D Canvas com Animação + Cores por Operação ───
function GcodeSimCanvas({ gcode, chapa }) {
    const canvasRef = useRef(null);
    const [zoom, setZoom] = useState(1);
    const [panOff, setPanOff] = useState({ x: 0, y: 0 });
    const panRef = useRef(null);
    // Animação
    const [playing, setPlaying] = useState(false);
    const [curMove, setCurMove] = useState(-1); // -1 = mostrar tudo (estático)
    const [speed, setSpeed] = useState(1);
    const animRef = useRef(null);
    const parsed = useMemo(() => parseGcodeForSim(gcode || ''), [gcode]);
    const allMoves = parsed.moves;
    const allEvents = parsed.events;

    // Achar evento ativo no curMove atual
    const getActiveEventsAt = useCallback((moveIdx) => {
        let tool = '', op = '';
        for (const ev of allEvents) {
            if (ev.moveIdx > moveIdx && moveIdx >= 0) break;
            if (ev.type === 'tool') tool = ev.label;
            if (ev.type === 'op') op = ev.label;
        }
        return { tool, op };
    }, [allEvents]);

    // Categorias de operação encontradas (para legenda)
    const foundOps = useMemo(() => {
        const map = new Map();
        for (const m of allMoves) {
            if (m.type === 'G0') continue;
            const cat = getOpCat(m.op);
            if (!map.has(cat.key)) map.set(cat.key, cat);
        }
        return [...map.values()];
    }, [allMoves]);

    // (toolColors removido — agora usamos cores por operação via getOpCat)

    // Renderizar canvas
    const renderCanvas = useCallback((moveLimit) => {
        const canvas = canvasRef.current;
        if (!canvas || !gcode) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#181825'; ctx.fillRect(0, 0, W, H);

        if (allMoves.length === 0) {
            ctx.fillStyle = '#6c7086'; ctx.font = '13px sans-serif';
            ctx.fillText('Nenhum movimento detectado no G-Code', W / 2 - 140, H / 2);
            return;
        }

        // Calcular bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const m of allMoves) {
            minX = Math.min(minX, m.x1, m.x2); minY = Math.min(minY, m.y1, m.y2);
            maxX = Math.max(maxX, m.x1, m.x2); maxY = Math.max(maxY, m.y1, m.y2);
        }
        if (chapa) { minX = 0; minY = 0; maxX = Math.max(maxX, chapa.comprimento || 2750); maxY = Math.max(maxY, chapa.largura || 1850); }
        const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
        const pad = 30;
        const sc = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY) * zoom;
        const offX = pad + panOff.x + ((W - pad * 2) - rangeX * sc) / 2;
        const offY = pad + panOff.y + ((H - pad * 2) - rangeY * sc) / 2;
        const tx = (v) => offX + (v - minX) * sc;
        const ty = (v) => offY + (v - minY) * sc;

        // Fundo: chapa
        if (chapa) {
            ctx.fillStyle = '#313244'; ctx.strokeStyle = '#585b70'; ctx.lineWidth = 1;
            ctx.fillRect(tx(0), ty(0), (chapa.comprimento || 2750) * sc, (chapa.largura || 1850) * sc);
            ctx.strokeRect(tx(0), ty(0), (chapa.comprimento || 2750) * sc, (chapa.largura || 1850) * sc);
            if (chapa.pecas) {
                const ref = chapa.refilo || 10;
                for (const p of chapa.pecas) {
                    const px = tx(ref + p.x), py = ty(ref + p.y), pw2 = p.w * sc, ph2 = p.h * sc;
                    ctx.fillStyle = '#45475a'; ctx.strokeStyle = '#89b4fa50';
                    ctx.fillRect(px, py, pw2, ph2); ctx.strokeRect(px, py, pw2, ph2);
                    if (p.nome && pw2 > 20 && ph2 > 12) {
                        ctx.fillStyle = '#89b4fa60'; ctx.font = `${Math.min(10, pw2 / 8)}px sans-serif`;
                        ctx.fillText(p.nome, px + 3, py + 11, pw2 - 6);
                    }
                }
            }
            if (chapa.retalhos) {
                const ref = chapa.refilo || 10;
                ctx.setLineDash([4, 3]);
                for (const r of chapa.retalhos) {
                    ctx.strokeStyle = '#22c55e80'; ctx.lineWidth = 1;
                    ctx.strokeRect(tx(ref + r.x), ty(ref + r.y), r.w * sc, r.h * sc);
                }
                ctx.setLineDash([]);
            }
        }

        // Determinar quantos moves desenhar
        const drawCount = moveLimit < 0 ? allMoves.length : Math.min(moveLimit + 1, allMoves.length);
        let rapidDist = 0, cutDist = 0;

        // Desenhar moves até o limite (colorido por OPERAÇÃO + espessura por profundidade)
        for (let i = 0; i < drawCount; i++) {
            const m = allMoves[i];
            const x1 = tx(m.x1), y1 = ty(m.y1), x2 = tx(m.x2), y2 = ty(m.y2);
            const dist = Math.sqrt((m.x2 - m.x1) ** 2 + (m.y2 - m.y1) ** 2);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            if (m.type === 'G0') {
                ctx.strokeStyle = '#f38ba825'; ctx.lineWidth = 0.4; ctx.setLineDash([2, 4]);
                rapidDist += dist;
            } else {
                const cat = getOpCat(m.op);
                const depth = Math.abs(m.z2);
                const depthRatio = Math.min(depth / 20, 1);
                // Intensidade: mais profundo = mais brilhante e mais grosso
                const alpha = Math.round((0.5 + depthRatio * 0.5) * 255).toString(16).padStart(2, '0');
                ctx.strokeStyle = cat.color + alpha;
                ctx.lineWidth = 0.8 + depthRatio * 2.2; // 0.8px → 3px
                ctx.setLineDash([]);
                cutDist += dist;
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Marcadores de troca de ferramenta (diamantes)
        if (moveLimit < 0) {
            for (const ev of allEvents) {
                if (ev.type === 'tool' && ev.moveIdx < allMoves.length) {
                    const m = allMoves[ev.moveIdx] || allMoves[0];
                    const cx = tx(m?.x1 ?? 0), cy = ty(m?.y1 ?? 0);
                    ctx.fillStyle = '#f9e2af'; ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 3, cy);
                    ctx.closePath(); ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
        }

        // Marcadores: ponto inicial (verde) e tool head / ponto final
        if (allMoves.length > 0) {
            const first = allMoves[0];
            ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(tx(first.x1), ty(first.y1), 4, 0, Math.PI * 2); ctx.fill();

            if (moveLimit >= 0 && moveLimit < allMoves.length) {
                const cur = allMoves[moveLimit];
                // Trail glow
                ctx.strokeStyle = '#fab38740'; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 8, 0, Math.PI * 2); ctx.stroke();
                // Head
                ctx.fillStyle = '#fab387'; ctx.beginPath(); ctx.arc(tx(cur.x2), ty(cur.y2), 4, 0, Math.PI * 2); ctx.fill();
                // Crosshair
                ctx.strokeStyle = '#fab38780'; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(tx(cur.x2) - 12, ty(cur.y2)); ctx.lineTo(tx(cur.x2) + 12, ty(cur.y2)); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(tx(cur.x2), ty(cur.y2) - 12); ctx.lineTo(tx(cur.x2), ty(cur.y2) + 12); ctx.stroke();
                // Coords overlay
                ctx.fillStyle = '#fab387'; ctx.font = '10px monospace';
                ctx.fillText(`X${cur.x2.toFixed(1)} Y${cur.y2.toFixed(1)} Z${cur.z2.toFixed(1)}`, tx(cur.x2) + 10, ty(cur.y2) - 8);
            } else if (moveLimit < 0) {
                const last = allMoves[allMoves.length - 1];
                ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(tx(last.x2), ty(last.y2), 4, 0, Math.PI * 2); ctx.fill();
            }
        }

        // HUD: info da ferramenta e operação atual
        if (moveLimit >= 0) {
            const { tool, op } = getActiveEventsAt(moveLimit);
            const cat = getOpCat(op);
            const hudY = 30;
            ctx.fillStyle = '#181825dd'; ctx.fillRect(4, hudY, 280, (tool ? 16 : 0) + (op ? 16 : 0) + 8);
            let hy = hudY + 14;
            if (tool) {
                ctx.fillStyle = '#f9e2af'; ctx.font = 'bold 10px sans-serif';
                ctx.fillText(`🔧 ${tool}`, 10, hy); hy += 16;
            }
            if (op) {
                ctx.fillStyle = cat.color; ctx.font = 'bold 10px sans-serif';
                ctx.fillText(`● ${cat.label}: ${op}`, 10, hy);
            }
        }

        // Barra de progresso no fundo do canvas
        if (moveLimit >= 0) {
            const pct = allMoves.length > 0 ? (moveLimit + 1) / allMoves.length : 0;
            ctx.fillStyle = '#11111b'; ctx.fillRect(0, H - 24, W, 24);
            ctx.fillStyle = '#fab38730'; ctx.fillRect(0, H - 24, W * pct, 24);
            // Marcadores de troca de operação na barra de progresso
            for (const ev of allEvents) {
                if (ev.type === 'op') {
                    const evPct = ev.moveIdx / allMoves.length;
                    const cat = getOpCat(ev.label);
                    ctx.fillStyle = cat.color + '80'; ctx.fillRect(W * evPct - 1, H - 24, 2, 24);
                }
                if (ev.type === 'tool') {
                    const evPct = ev.moveIdx / allMoves.length;
                    ctx.fillStyle = '#f9e2af'; ctx.fillRect(W * evPct - 1, H - 24, 2, 24);
                }
            }
            ctx.fillStyle = '#cdd6f4'; ctx.font = '10px monospace';
            ctx.fillText(`Move ${moveLimit + 1}/${allMoves.length}  |  Rapido: ${(rapidDist / 1000).toFixed(1)}m  |  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10, H - 8);
        } else {
            ctx.fillStyle = '#cdd6f4'; ctx.font = '11px monospace';
            ctx.fillText(`Movimentos: ${allMoves.length}  |  Rapido: ${(rapidDist / 1000).toFixed(1)}m  |  Corte: ${(cutDist / 1000).toFixed(1)}m`, 10, H - 10);
        }
    }, [gcode, chapa, allMoves, allEvents, getActiveEventsAt, zoom, panOff]);

    // Renderizar quando muda curMove, zoom ou pan
    useEffect(() => { renderCanvas(curMove); }, [curMove, renderCanvas]);

    // Loop de animação
    useEffect(() => {
        if (!playing) { if (animRef.current) clearInterval(animRef.current); return; }
        const interval = Math.max(10, 80 / speed);
        animRef.current = setInterval(() => {
            setCurMove(prev => {
                const next = prev + 1;
                if (next >= allMoves.length) { setPlaying(false); return allMoves.length - 1; }
                return next;
            });
        }, interval);
        return () => { if (animRef.current) clearInterval(animRef.current); };
    }, [playing, speed, allMoves.length]);

    // Controles
    const handlePlay = () => {
        if (curMove >= allMoves.length - 1 || curMove < 0) setCurMove(0);
        setPlaying(true);
    };
    const handlePause = () => setPlaying(false);
    const handleStop = () => { setPlaying(false); setCurMove(-1); };
    const handleStep = (dir) => {
        setPlaying(false);
        setCurMove(prev => {
            const p = prev < 0 ? 0 : prev;
            return Math.max(0, Math.min(allMoves.length - 1, p + dir));
        });
    };
    const handleSlider = (e) => { setPlaying(false); setCurMove(parseInt(e.target.value)); };

    // Zoom com scroll
    const handleWheel = useCallback((e) => {
        e.preventDefault();
        setZoom(z => Math.max(0.3, Math.min(5, z + (e.deltaY < 0 ? 0.15 : -0.15))));
    }, []);

    // Pan com drag
    const handleMouseDown = (e) => { panRef.current = { startX: e.clientX - panOff.x, startY: e.clientY - panOff.y }; };
    const handleMouseMove = (e) => { if (panRef.current) setPanOff({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY }); };
    const handleMouseUp = () => { panRef.current = null; };

    const { tool: activeTool, op: activeOp } = curMove >= 0 ? getActiveEventsAt(curMove) : { tool: '', op: '' };

    const btnSt = { padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 4, border: '1px solid #585b70', background: '#313244', color: '#cdd6f4', display: 'flex', alignItems: 'center', gap: 3 };
    const btnAct = { ...btnSt, background: '#fab387', color: '#1e1e2e', borderColor: '#fab387' };

    return (
        <div style={{ position: 'relative' }}>
            <canvas ref={canvasRef} width={760} height={400}
                style={{ borderRadius: '8px 8px 0 0', border: '1px solid var(--border)', borderBottom: 'none', cursor: panRef.current ? 'grabbing' : 'grab', display: 'block', width: '100%' }}
                onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />
            {/* Controles de zoom (top-right) */}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                <button onClick={() => setZoom(z => Math.min(5, z + 0.3))} style={btnSt}>+</button>
                <button onClick={() => setZoom(z => Math.max(0.3, z - 0.3))} style={btnSt}>−</button>
                <button onClick={() => { setZoom(1); setPanOff({ x: 0, y: 0 }); }} style={btnSt}>Reset</button>
            </div>
            {/* Zoom info (top-left) */}
            <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, color: '#a6adc8', background: '#181825cc', padding: '2px 8px', borderRadius: 4 }}>
                Zoom: {(zoom * 100).toFixed(0)}% | Scroll=zoom, Drag=pan
            </div>
            {/* Barra de controles de animação */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#1e1e2e', border: '1px solid var(--border)', borderTop: 'none' }}>
                {!playing ? (
                    <button onClick={handlePlay} style={btnAct} title="Play (simular)">▶</button>
                ) : (
                    <button onClick={handlePause} style={btnAct} title="Pausar">⏸</button>
                )}
                <button onClick={handleStop} style={btnSt} title="Parar e voltar ao estático">⏹</button>
                <button onClick={() => handleStep(-1)} style={btnSt} title="Voltar 1 move">⏮</button>
                <button onClick={() => handleStep(1)} style={btnSt} title="Avançar 1 move">⏭</button>
                <input type="range" min={0} max={Math.max(0, allMoves.length - 1)} value={curMove < 0 ? 0 : curMove}
                    onChange={handleSlider}
                    style={{ flex: 1, height: 4, accentColor: '#fab387', cursor: 'pointer' }} />
                <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                    style={{ ...btnSt, padding: '2px 4px', fontSize: 10, cursor: 'pointer' }}>
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={5}>5x</option>
                    <option value={10}>10x</option>
                    <option value={20}>20x</option>
                </select>
                <span style={{ fontSize: 10, color: '#a6adc8', whiteSpace: 'nowrap', minWidth: 80, textAlign: 'right' }}>
                    {curMove >= 0 ? `${curMove + 1}/${allMoves.length}` : `${allMoves.length} moves`}
                </span>
            </div>
            {/* Legenda de operações + ferramenta ativa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', background: '#1e1e2e', borderRadius: '0 0 8px 8px', border: '1px solid var(--border)', borderTop: 'none', flexWrap: 'wrap' }}>
                {/* Rapid sempre aparece */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#f38ba8', opacity: 0.6 }}>
                    <span style={{ width: 12, height: 0, borderTop: '1px dashed #f38ba8', display: 'inline-block' }} />
                    Rápido
                </span>
                {foundOps.map(cat => {
                    const isActive = activeOp && getOpCat(activeOp).key === cat.key;
                    return (
                        <span key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: isActive ? cat.color : '#6c7086', fontWeight: isActive ? 700 : 400, transition: 'all 0.2s' }}>
                            <span style={{ width: 8, height: 3, borderRadius: 1, background: cat.color, display: 'inline-block', opacity: isActive ? 1 : 0.5 }} />
                            {cat.label}
                        </span>
                    );
                })}
                {foundOps.length === 0 && <span style={{ fontSize: 10, color: '#6c7086' }}>Sem operações identificadas</span>}
                {activeTool && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f9e2af', fontWeight: 600 }}>🔧 {activeTool}</span>}
            </div>
        </div>
    );
}

function GcodePreviewModal({ data, onDownload, onClose }) {
    const { gcode, filename, stats, alertas, chapaIdx, contorno_tool } = data;
    const lines = (gcode || '').split('\n');
    const lineCount = lines.length;
    const sizeKB = new Blob([gcode]).size / 1024;
    const [showFull, setShowFull] = useState(false);
    const [abaPreview, setAbaPreview] = useState('sim2d');
    const previewLines = showFull ? lines : lines.slice(0, 80);
    const textareaRef = useRef(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(gcode).then(() => {}).catch(() => {
            if (textareaRef.current) { textareaRef.current.select(); document.execCommand('copy'); }
        });
    };

    // Extrair chapa data se disponível
    const chapaData = data.chapa || null;

    return (
        <Modal title={`Preview G-Code — Chapa ${chapaIdx + 1}`} close={onClose} w={820}>
            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 6, marginBottom: 10 }}>
                {[
                    { lb: 'Operacoes', val: stats.total_operacoes ?? 0, color: '#3b82f6' },
                    { lb: 'Trocas Ferr.', val: stats.trocas_ferramenta ?? 0, color: stats.trocas_ferramenta > 3 ? '#f59e0b' : '#22c55e' },
                    { lb: 'Contornos', val: (stats.contornos_peca ?? 0) + (stats.contornos_sobra ?? 0), color: '#8b5cf6' },
                    { lb: 'Onion Skin', val: stats.onion_skin_ops ?? 0, color: '#e67e22' },
                    { lb: 'Linhas', val: lineCount, color: 'var(--text-muted)' },
                    { lb: 'Tamanho', val: `${sizeKB.toFixed(1)} KB`, color: 'var(--text-muted)' },
                ].map(s => (
                    <div key={s.lb} style={{ padding: '6px 8px', background: 'var(--bg-muted)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.val}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.lb}</div>
                    </div>
                ))}
            </div>

            {contorno_tool && (
                <div style={{ fontSize: 11, padding: '5px 10px', background: '#f0fdf4', borderRadius: 6, marginBottom: 6, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={12} style={{ color: '#16a34a' }} />
                    <span>Contorno: <b>{contorno_tool.nome || contorno_tool.codigo}</b> (D{contorno_tool.diametro}mm)</span>
                </div>
            )}

            {alertas.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                    {alertas.map((a, i) => (
                        <div key={i} style={{ fontSize: 11, padding: '4px 10px', background: '#fefce8', borderRadius: 6, marginBottom: 2, border: '1px solid #fef08a', display: 'flex', alignItems: 'center', gap: 6, color: '#854d0e' }}>
                            <AlertTriangle size={12} /> {a.msg || a}
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs: Codigo | Simulador */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                {[{ id: 'sim2d', lb: 'Simulador' }, { id: 'codigo', lb: 'Código' }].map(t => (
                    <button key={t.id} onClick={() => setAbaPreview(t.id)} style={{
                        padding: '5px 16px', fontSize: 11, fontWeight: abaPreview === t.id ? 700 : 500,
                        borderRadius: '6px 6px 0 0', cursor: 'pointer', transition: 'all .15s',
                        background: abaPreview === t.id ? '#1e1e2e' : 'var(--bg-muted)',
                        color: abaPreview === t.id ? '#cdd6f4' : 'var(--text-muted)',
                        border: abaPreview === t.id ? '1px solid var(--border)' : '1px solid transparent',
                        borderBottom: abaPreview === t.id ? '1px solid #1e1e2e' : '1px solid var(--border)',
                    }}>{t.lb}</button>
                ))}
                <div style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
            </div>

            {abaPreview === 'codigo' && (
                <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                            {showFull ? `Todas ${lineCount} linhas` : `Primeiras ${Math.min(80, lineCount)} de ${lineCount} linhas`}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {lineCount > 80 && (
                                <button onClick={() => setShowFull(!showFull)} className={Z.btn2} style={{ fontSize: 10, padding: '2px 8px' }}>
                                    {showFull ? 'Menos' : `Ver tudo (${lineCount})`}
                                </button>
                            )}
                            <button onClick={handleCopy} className={Z.btn2} style={{ fontSize: 10, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Copy size={10} /> Copiar
                            </button>
                        </div>
                    </div>
                    <pre ref={textareaRef} style={{
                        fontFamily: 'monospace', fontSize: 10, lineHeight: 1.5,
                        background: '#1e1e2e', color: '#cdd6f4', padding: 12, borderRadius: 8,
                        maxHeight: 340, overflow: 'auto', whiteSpace: 'pre', margin: 0,
                        border: '1px solid var(--border)',
                    }}>
                        {previewLines.map((line, i) => {
                            let color = '#cdd6f4';
                            const stripped = line.replace(/^N\d+\s*/, '');
                            if (stripped.startsWith('(') || stripped.startsWith(';')) color = '#6c7086';
                            else if (/^(N\d+\s+)?G0[0 ]/.test(line)) color = '#f38ba8';
                            else if (/^(N\d+\s+)?G0?1[ ]/.test(line)) color = '#a6e3a1';
                            else if (/^(N\d+\s+)?G[23]/.test(line)) color = '#89b4fa';
                            else if (/^(N\d+\s+)?[MS]/.test(line)) color = '#fab387';
                            else if (/^(N\d+\s+)?T/.test(line)) color = '#f9e2af';
                            else if (/^(N\d+\s+)?G4/.test(line)) color = '#cba6f7';
                            return <span key={i} style={{ color }}>{`${String(i + 1).padStart(4)} | ${line}\n`}</span>;
                        })}
                        {!showFull && lineCount > 80 && <span style={{ color: '#6c7086' }}>     | ... ({lineCount - 80} linhas restantes) ...\n</span>}
                    </pre>
                </div>
            )}

            {abaPreview === 'sim2d' && (
                <GcodeSimCanvas gcode={gcode} chapa={chapaData} />
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={onClose} className={Z.btn2} style={{ padding: '8px 20px' }}>Fechar</button>
                <button onClick={onDownload} className={Z.btn} style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 6, background: '#e67e22', fontSize: 13, fontWeight: 700 }}>
                    <Download size={15} /> Baixar {filename}
                </button>
            </div>
        </Modal>
    );
}

// ─── Render machining operations (usinagens) on piece SVG ──
let _machClipId = 0;
function renderMachining(piece, px, py, pw, ph, scale, rotated, pieceW, pieceH) {
    if (!piece?.machining_json || piece.machining_json === '{}') return null;
    let mach;
    try { mach = JSON.parse(piece.machining_json); } catch { return null; }
    if (!mach.workers) return null;

    const elements = [];
    const scX = pw / pieceW; // scale from piece mm to SVG px
    const scY = ph / pieceH;
    const clipId = `mach-clip-${piece.id || (++_machClipId)}`;

    // Clamp helper: keep coordinates within piece boundaries (0..pieceW, 0..pieceH)
    const clampX = (v) => Math.max(0, Math.min(v, pw));
    const clampY = (v) => Math.max(0, Math.min(v, ph));

    for (const [k, w] of Object.entries(mach.workers)) {
        if (w.position_x == null && !w.pos_start_for_line) continue;

        // Transform coordinates based on rotation
        let wx, wy;
        if (w.position_x != null) {
            if (rotated) {
                wx = clampX(w.position_y * scX);
                wy = clampY((pieceW - w.position_x) * scY);
            } else {
                wx = clampX(w.position_x * scX);
                wy = clampY(w.position_y * scY);
            }
        }

        if (w.category === 'Transfer_vertical_saw_cut' || w.tool === 'r_f') {
            // Groove/Rasgo — render as thin rectangle (clamped to piece bounds)
            if (w.pos_start_for_line && w.pos_end_for_line) {
                let sx, sy, ex, ey, gw;
                if (rotated) {
                    sx = clampX(w.pos_start_for_line.position_y * scX);
                    sy = clampY((pieceW - w.pos_start_for_line.position_x) * scY);
                    ex = clampX(w.pos_end_for_line.position_y * scX);
                    ey = clampY((pieceW - w.pos_end_for_line.position_x) * scY);
                    gw = (w.width_line || w.width || 3) * scY;
                } else {
                    sx = clampX(w.pos_start_for_line.position_x * scX);
                    sy = clampY(w.pos_start_for_line.position_y * scY);
                    ex = clampX(w.pos_end_for_line.position_x * scX);
                    ey = clampY(w.pos_end_for_line.position_y * scY);
                    gw = (w.width_line || w.width || 3) * scY;
                }
                elements.push(
                    <line key={`g${k}`} x1={px + sx} y1={py + sy} x2={px + ex} y2={py + ey}
                        stroke="#e11d48" strokeWidth={Math.max(1, gw)} opacity={0.45} strokeLinecap="butt" />
                );
            }
        } else if (w.diameter) {
            // Hole/Furo — render as circle
            const r = Math.max(1.5, (w.diameter / 2) * Math.min(scX, scY));
            const isTopFace = w.quadrant === 'top' || w.quadrant === 'bottom';
            const isSide = w.quadrant === 'right' || w.quadrant === 'left';

            if (isTopFace) {
                elements.push(
                    <circle key={`h${k}`} cx={px + wx} cy={py + wy} r={r}
                        fill={w.quadrant === 'top' ? '#e11d48' : '#7c3aed'} opacity={0.55}
                        stroke={w.quadrant === 'top' ? '#be123c' : '#6d28d9'} strokeWidth={0.5} />
                );
            } else if (isSide) {
                // Furo lateral — small triangle on piece edge
                const edgeSize = Math.max(2, r * 0.8);
                if (w.quadrant === 'right') {
                    elements.push(
                        <polygon key={`h${k}`}
                            points={`${px + pw},${py + wy - edgeSize} ${px + pw - edgeSize * 1.5},${py + wy} ${px + pw},${py + wy + edgeSize}`}
                            fill="#2563eb" opacity={0.6} />
                    );
                } else {
                    elements.push(
                        <polygon key={`h${k}`}
                            points={`${px},${py + wy - edgeSize} ${px + edgeSize * 1.5},${py + wy} ${px},${py + wy + edgeSize}`}
                            fill="#2563eb" opacity={0.6} />
                    );
                }
            }
        }
    }

    if (elements.length === 0) return null;

    // Wrap in clipPath to ensure nothing renders outside the piece boundary
    return (
        <g className="machining" style={{ pointerEvents: 'none' }}>
            <defs>
                <clipPath id={clipId}>
                    <rect x={px} y={py} width={pw} height={ph} />
                </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>{elements}</g>
        </g>
    );
}

// ─── SVG visualization with collision detection, magnetic snap, kerf, lock, context menu ──
function ChapaViz({ chapa, idx, pecasMap, modo, zoomLevel, setZoomLevel, panOffset, onWheel, onPanStart, onPanMove, onPanEnd, resetView, getModColor, onAdjust, selectedPieces = [], onSelectPiece, kerfSize = 4, allChapas = [], classifyLocal, classColors = {}, classLabels = {}, onGerarGcode, gcodeLoading }) {
    const [hovered, setHovered] = useState(null);
    const [showCuts, setShowCuts] = useState(false);
    const [showMachining, setShowMachining] = useState(true);
    const [dragging, setDragging] = useState(null);
    const [dragCollision, setDragCollision] = useState(false);
    const [snapGuides, setSnapGuides] = useState([]);
    const [ctxMenu, setCtxMenu] = useState(null);
    const [sobraCtxMenu, setSobraCtxMenu] = useState(null);
    const [sobraDrag, setSobraDrag] = useState(null);
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const maxW = 900;
    const marginDim = 30;
    const scale = Math.min((maxW - marginDim * 2) / chapa.comprimento, 450 / chapa.largura);
    const svgW = chapa.comprimento * scale;
    const svgH = chapa.largura * scale;
    const refilo = (chapa.refilo || 0) * scale;
    const refiloVal = chapa.refilo || 0;
    const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
    const kerfPx = (kerfSize / 2) * scale;

    // ─── Client-side AABB collision check (com kerf, igual ao backend) ───
    const isColliding = useCallback((tx, ty, tw, th, exIdx) => {
        const k = chapa.kerf || 0; // Expansão por kerf (largura do disco)
        for (let i = 0; i < chapa.pecas.length; i++) {
            if (i === exIdx) continue;
            const b = chapa.pecas[i];
            // Expandir a peça testada por kerf em todos os lados (mesma lógica do backend checkCollision)
            if (tx - k < b.x + b.w && tx + tw + k > b.x && ty - k < b.y + b.h && ty + th + k > b.y) return true;
        }
        return false;
    }, [chapa.pecas, chapa.kerf]);

    // ─── Magnetic snap to adjacent edges ───
    const magneticSnap = useCallback((tx, ty, tw, th, exIdx) => {
        // Snap threshold adaptivo ao zoom: quanto mais zoom-out, mais tolerante (em mm)
        const k = chapa.kerf || kerfSize || 0; // Usa kerf real da chapa (mesmo valor que isColliding/backend)
        const S = Math.max(8, Math.min(25, 12 / (zoomLevel || 1)));
        const ref = chapa.refilo || 0;
        const uW = chapa.comprimento - 2 * ref, uH = chapa.largura - 2 * ref;
        let sx = tx, sy = ty;
        const guides = [];
        // Sheet edges
        if (Math.abs(tx) < S) { sx = 0; guides.push({ t: 'v', p: 0 }); }
        if (Math.abs(ty) < S) { sy = 0; guides.push({ t: 'h', p: 0 }); }
        if (Math.abs(tx + tw - uW) < S) { sx = uW - tw; guides.push({ t: 'v', p: uW }); }
        if (Math.abs(ty + th - uH) < S) { sy = uH - th; guides.push({ t: 'h', p: uH }); }
        // Adjacent piece edges (with kerf gap)
        for (let i = 0; i < chapa.pecas.length; i++) {
            if (i === exIdx) continue;
            const o = chapa.pecas[i];
            const overlapY = ty < o.y + o.h && ty + th > o.y;
            const overlapX = tx < o.x + o.w && tx + tw > o.x;
            if (overlapY && Math.abs(tx - (o.x + o.w + k)) < S) { sx = o.x + o.w + k; guides.push({ t: 'v', p: o.x + o.w }); }
            if (overlapY && Math.abs(tx + tw + k - o.x) < S) { sx = o.x - tw - k; guides.push({ t: 'v', p: o.x }); }
            if (overlapX && Math.abs(ty - (o.y + o.h + k)) < S) { sy = o.y + o.h + k; guides.push({ t: 'h', p: o.y + o.h }); }
            if (overlapX && Math.abs(ty + th + k - o.y) < S) { sy = o.y - th - k; guides.push({ t: 'h', p: o.y }); }
            // Align edges (same x or y start/end)
            if (Math.abs(tx - o.x) < S && overlapY) { sx = o.x; guides.push({ t: 'v', p: o.x }); }
            if (Math.abs(tx + tw - (o.x + o.w)) < S && overlapY) { sx = o.x + o.w - tw; guides.push({ t: 'v', p: o.x + o.w }); }
            if (Math.abs(ty - o.y) < S && overlapX) { sy = o.y; guides.push({ t: 'h', p: o.y }); }
            if (Math.abs(ty + th - (o.y + o.h)) < S && overlapX) { sy = o.y + o.h - th; guides.push({ t: 'h', p: o.y + o.h }); }
        }
        return { x: sx, y: sy, guides };
    }, [chapa.pecas, chapa.refilo, chapa.comprimento, chapa.largura, chapa.kerf, kerfSize, zoomLevel]);

    // ─── Pixel to MM ───
    const pixelToMM = (clientX, clientY) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        const mmX = ((clientX - rect.left) / rect.width) * (chapa.comprimento + 2 * refiloVal + marginDim * 2 / scale) - marginDim / scale - refiloVal;
        const mmY = ((clientY - rect.top) / rect.height) * (chapa.largura + refiloVal + 20 / scale + 14 / scale) - 14 / scale - refiloVal;
        return { x: Math.max(0, mmX), y: Math.max(0, mmY) };
    };

    // ─── Drag handlers with collision + snap ───
    const handleDragStart = (e, pecaIdx) => {
        if (e.button !== 0 || e.altKey) return;
        if (chapa.pecas[pecaIdx]?.locked) return;
        e.stopPropagation();
        const p = chapa.pecas[pecaIdx];
        const mm = pixelToMM(e.clientX, e.clientY);
        setDragging({ pecaIdx, startX: mm.x, startY: mm.y, origX: p.x, origY: p.y, newX: p.x, newY: p.y });
        setDragCollision(false);
        setSnapGuides([]);
        setCtxMenu(null);
    };

    const handleDragMove = (e) => {
        if (!dragging) return;
        const mm = pixelToMM(e.clientX, e.clientY);
        const p = chapa.pecas[dragging.pecaIdx];
        const ref = chapa.refilo || 0;
        let rx = Math.max(0, Math.min(chapa.comprimento - 2 * ref - p.w, dragging.origX + (mm.x - dragging.startX)));
        let ry = Math.max(0, Math.min(chapa.largura - 2 * ref - p.h, dragging.origY + (mm.y - dragging.startY)));
        // Magnetic snap
        const snap = magneticSnap(rx, ry, p.w, p.h, dragging.pecaIdx);
        rx = Math.max(0, Math.min(chapa.comprimento - 2 * ref - p.w, snap.x));
        ry = Math.max(0, Math.min(chapa.largura - 2 * ref - p.h, snap.y));
        setSnapGuides(snap.guides);
        // Collision check
        const collision = isColliding(rx, ry, p.w, p.h, dragging.pecaIdx);
        setDragCollision(collision);
        // DOM update for performance
        const g = svgRef.current?.querySelector(`[data-pidx="${dragging.pecaIdx}"]`);
        if (g) {
            const px = (rx + refiloVal) * scale, py = (ry + refiloVal) * scale;
            g.setAttribute('transform', `translate(${px - (p.x + refiloVal) * scale}, ${py - (p.y + refiloVal) * scale})`);
        }
        setDragging(prev => ({ ...prev, newX: rx, newY: ry }));
    };

    const handleDragEnd = () => {
        if (!dragging || dragging.newX == null) { setDragging(null); setDragCollision(false); setSnapGuides([]); return; }
        const g = svgRef.current?.querySelector(`[data-pidx="${dragging.pecaIdx}"]`);
        if (g) g.removeAttribute('transform');
        // If collision → revert (don't move)
        if (dragCollision) {
            setDragging(null); setDragCollision(false); setSnapGuides([]);
            return;
        }
        const p = chapa.pecas[dragging.pecaIdx];
        const sx = Math.round(dragging.newX / 2) * 2, sy = Math.round(dragging.newY / 2) * 2;
        // Re-check colisão na posição arredondada (evita desync com backend)
        if (p && isColliding(sx, sy, p.w, p.h, dragging.pecaIdx)) {
            setDragging(null); setDragCollision(false); setSnapGuides([]);
            return;
        }
        if (onAdjust && (Math.abs(sx - dragging.origX) > 1 || Math.abs(sy - dragging.origY) > 1)) {
            onAdjust({ action: 'move', chapaIdx: idx, pecaIdx: dragging.pecaIdx, x: sx, y: sy });
        }
        setDragging(null); setDragCollision(false); setSnapGuides([]);
    };

    const handleRotate = (pecaIdx) => {
        if (hasVeio || chapa.pecas[pecaIdx]?.locked) return;
        if (onAdjust) onAdjust({ action: 'rotate', chapaIdx: idx, pecaIdx });
    };

    // ─── Right-click context menu ───
    const handleCtxMenu = (e, pecaIdx) => {
        e.preventDefault();
        e.stopPropagation();
        const r = containerRef.current?.getBoundingClientRect();
        setCtxMenu({ x: e.clientX - (r?.left || 0), y: e.clientY - (r?.top || 0), pecaIdx });
    };

    useEffect(() => {
        if (!ctxMenu) return;
        const close = () => setCtxMenu(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [ctxMenu]);

    useEffect(() => {
        if (!sobraCtxMenu) return;
        const close = () => setSobraCtxMenu(null);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [sobraCtxMenu]);

    // ─── Drag de sobras adjacentes (mousemove/mouseup global) ───
    useEffect(() => {
        if (!sobraDrag || !sobraDrag.startMouse) return;
        const handleMove = (e) => {
            // Visual feedback é no SVG inline, mas precisamos do delta em mm
            // Será tratado no mouseUp para simplicidade
        };
        const handleUp = (e) => {
            const ch = allChapas[sobraDrag.chapaIdx];
            const rets = ch?.retalhos;
            if (!rets) { setSobraDrag(null); return; }
            const s1 = rets[sobraDrag.idx1], s2 = rets[sobraDrag.idx2];
            if (!s1 || !s2) { setSobraDrag(null); return; }
            const maxW2 = 900, marg = 30;
            const sc = Math.min((maxW2 - marg * 2) / ch.comprimento, 450 / ch.largura);
            const deltaPx = sobraDrag.axis === 'x' ? e.clientX - sobraDrag.startMouse : e.clientY - sobraDrag.startMouse;
            const deltaMM = deltaPx / sc;
            if (Math.abs(deltaMM) < 5) { setSobraDrag(null); return; }
            let n1 = { ...s1 }, n2 = { ...s2 };
            if (sobraDrag.axis === 'x') {
                n1.w = Math.max(50, s1.w + deltaMM);
                n2.x = s2.x + deltaMM;
                n2.w = Math.max(0, s2.w - deltaMM);
            } else {
                n1.h = Math.max(50, s1.h + deltaMM);
                n2.y = s2.y + deltaMM;
                n2.h = Math.max(0, s2.h - deltaMM);
            }
            onAdjust({
                action: 'ajustar_sobra', chapaIdx: sobraDrag.chapaIdx,
                retalhoIdx: sobraDrag.idx1, novoX: n1.x, novoY: n1.y, novoW: n1.w, novoH: n1.h,
                retalho2Idx: sobraDrag.idx2, novo2X: n2.x, novo2Y: n2.y, novo2W: n2.w, novo2H: n2.h,
            });
            setSobraDrag(null);
        };
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        return () => { document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleUp); };
    }, [sobraDrag, allChapas, onAdjust]);

    // ─── Piece click (select) ───
    const handlePieceClick = (e, pecaIdx) => {
        if (dragging) return;
        if (onSelectPiece) onSelectPiece(pecaIdx, e.ctrlKey || e.metaKey);
    };

    return (
        <div className="glass-card p-4" ref={containerRef} style={{ position: 'relative' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Box size={15} />
                    Chapa {idx + 1}: {chapa.material}
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>
                        ({chapa.comprimento} x {chapa.largura} mm)
                    </span>
                </h4>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={tagClass} style={tagStyle(chapa.aproveitamento >= 80 ? '#22c55e' : chapa.aproveitamento >= 60 ? '#f59e0b' : '#ef4444')}>
                        {chapa.aproveitamento.toFixed(1)}%
                    </span>
                    {chapa.is_retalho && <span className={tagClass} style={tagStyle('#06b6d4')}>RETALHO</span>}
                    {hasVeio && (
                        <span className={tagClass} style={tagStyle('#8b5cf6')}>
                            {chapa.veio === 'horizontal' ? '━ Veio Horiz.' : '┃ Veio Vert.'}
                        </span>
                    )}
                    {onGerarGcode && (
                        <button
                            onClick={() => onGerarGcode(idx)}
                            disabled={gcodeLoading === idx}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                background: gcodeLoading === idx ? 'var(--bg-muted)' : '#e67e22',
                                color: '#fff', border: 'none', cursor: gcodeLoading === idx ? 'wait' : 'pointer',
                                transition: 'all .15s',
                            }}
                            title="Gerar e baixar G-Code desta chapa"
                        >
                            <Download size={12} />
                            {gcodeLoading === idx ? 'Gerando...' : 'G-Code'}
                        </button>
                    )}
                </div>
            </div>

            {/* Zoom controls */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                <button onClick={() => setZoomLevel(Math.max(0.3, zoomLevel - 0.2))} className={Z.btn2} style={{ padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>−</button>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', minWidth: 40, textAlign: 'center' }}>{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(Math.min(5, zoomLevel + 0.2))} className={Z.btn2} style={{ padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>+</button>
                <button onClick={resetView} className={Z.btn2} style={{ padding: '3px 8px', fontSize: 10 }}>Reset</button>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>Ctrl+Scroll=Zoom · Alt+Drag=Pan · DblClick=Rotacionar · Direito=Menu</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button onClick={() => setShowMachining(!showMachining)} className={Z.btn2}
                        style={{ padding: '3px 10px', fontSize: 10, fontWeight: 600,
                            background: showMachining ? '#e11d48' : undefined, color: showMachining ? '#fff' : undefined }}>
                        {showMachining ? '⊙ Usinagens' : '○ Usinagens'}
                    </button>
                    {chapa.cortes && chapa.cortes.length > 0 && (
                        <button onClick={() => setShowCuts(!showCuts)} className={Z.btn2}
                            style={{ padding: '3px 10px', fontSize: 10, fontWeight: 600,
                                background: showCuts ? 'var(--primary)' : undefined, color: showCuts ? '#fff' : undefined }}>
                            {showCuts ? 'Ocultar Cortes' : 'Mostrar Cortes'}
                        </button>
                    )}
                </div>
            </div>

            {/* SVG Canvas with zoom/pan */}
            <div style={{ overflow: 'hidden', borderRadius: 8, border: `2px solid ${dragCollision ? '#ef4444' : dragging ? '#22c55e' : 'var(--border)'}`, background: 'var(--bg-muted)', position: 'relative', cursor: dragging ? 'grabbing' : isPanningCursor(zoomLevel), transition: 'border-color .15s' }}
                onWheel={onWheel}
                onMouseDown={dragging ? undefined : onPanStart}
                onMouseMove={dragging ? handleDragMove : onPanMove}
                onMouseUp={dragging ? handleDragEnd : onPanEnd}
                onMouseLeave={dragging ? handleDragEnd : onPanEnd}
                onContextMenu={(e) => { if (!dragging) return; e.preventDefault(); }}>
                <div style={{
                    transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                    transformOrigin: 'top left', transition: zoomLevel === 1 ? 'transform .2s' : 'none',
                }}>
                    <svg ref={svgRef} width={svgW + marginDim * 2 + 2} height={svgH + marginDim + 20}
                        viewBox={`-${marginDim} -14 ${svgW + marginDim * 2 + 2} ${svgH + marginDim + 20}`}
                        style={{ display: 'block', userSelect: 'none' }}>

                        {/* Defs: grain pattern */}
                        <defs>
                            <pattern id={`grain-h-${idx}`} patternUnits="userSpaceOnUse" width={svgW} height="6" patternTransform="rotate(0)">
                                <line x1="0" y1="3" x2={svgW} y2="3" stroke="#8b5cf6" strokeWidth="0.3" opacity="0.2" />
                            </pattern>
                            <pattern id={`grain-v-${idx}`} patternUnits="userSpaceOnUse" width="6" height={svgH} patternTransform="rotate(0)">
                                <line x1="3" y1="0" x2="3" y2={svgH} stroke="#8b5cf6" strokeWidth="0.3" opacity="0.2" />
                            </pattern>
                        </defs>

                        {/* Dimension label: width (top) */}
                        <line x1={0} y1={-1} x2={svgW} y2={-1} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <line x1={0} y1={-6} x2={0} y2={3} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <line x1={svgW} y1={-6} x2={svgW} y2={3} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <text x={svgW / 2} y={-5} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontWeight={600}>
                            {chapa.comprimento} mm
                        </text>

                        {/* Grain direction arrow (top) */}
                        {hasVeio && (
                            <g>
                                {chapa.veio === 'horizontal' ? (
                                    <>
                                        <line x1={svgW * 0.2} y1={-12} x2={svgW * 0.8} y2={-12} stroke="#8b5cf6" strokeWidth={1.5} markerEnd={`url(#arrow-${idx})`} />
                                        <text x={svgW * 0.5} y={-13} textAnchor="middle" fontSize={7} fill="#8b5cf6" fontWeight={700}>VEIO</text>
                                    </>
                                ) : (
                                    <text x={svgW + marginDim + 5} y={svgH * 0.5} textAnchor="middle" fontSize={7} fill="#8b5cf6" fontWeight={700}
                                        transform={`rotate(90, ${svgW + marginDim + 5}, ${svgH * 0.5})`}>VEIO ↓</text>
                                )}
                                <defs>
                                    <marker id={`arrow-${idx}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                                        <polygon points="0 0, 6 2, 0 4" fill="#8b5cf6" />
                                    </marker>
                                </defs>
                            </g>
                        )}

                        {/* Dimension label: height (left) */}
                        <line x1={-1} y1={0} x2={-1} y2={svgH} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <line x1={-6} y1={0} x2={3} y2={0} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <line x1={-6} y1={svgH} x2={3} y2={svgH} stroke="var(--text-muted)" strokeWidth={0.5} />
                        <text x={-4} y={svgH / 2} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontWeight={600}
                            transform={`rotate(-90, -4, ${svgH / 2})`}>
                            {chapa.largura} mm
                        </text>

                        {/* Sheet background */}
                        <rect x={0} y={0} width={svgW} height={svgH} fill="var(--bg-body)" stroke="var(--border)" strokeWidth={1} />

                        {/* Grain pattern overlay on sheet */}
                        {hasVeio && (
                            <rect x={0} y={0} width={svgW} height={svgH}
                                fill={`url(#grain-${chapa.veio === 'horizontal' ? 'h' : 'v'}-${idx})`} />
                        )}

                        {/* Refilo area (border trim) */}
                        {refiloVal > 0 && <>
                            <rect x={0} y={0} width={svgW} height={refilo} fill="rgba(120,120,120,0.12)" />
                            <rect x={0} y={svgH - refilo} width={svgW} height={refilo} fill="rgba(120,120,120,0.12)" />
                            <rect x={0} y={0} width={refilo} height={svgH} fill="rgba(120,120,120,0.12)" />
                            <rect x={svgW - refilo} y={0} width={refilo} height={svgH} fill="rgba(120,120,120,0.12)" />
                            {refilo > 6 && (
                                <text x={refilo / 2} y={svgH / 2} textAnchor="middle" fontSize={Math.min(7, refilo * 0.7)} fill="rgba(120,120,120,0.5)"
                                    transform={`rotate(-90, ${refilo / 2}, ${svgH / 2})`}>
                                    refilo {refiloVal}mm
                                </text>
                            )}
                        </>}

                        {/* Useful area border */}
                        {refiloVal > 0 && (
                            <rect x={refilo} y={refilo} width={svgW - 2 * refilo} height={svgH - 2 * refilo}
                                fill="none" stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 2" opacity={0.5} />
                        )}

                        {/* ══ KERF visualization ══ */}
                        {kerfSize > 0 && chapa.pecas.map((p, pi) => {
                            if (dragging?.pecaIdx === pi) return null;
                            const kx = (p.x + refiloVal) * scale - kerfPx;
                            const ky = (p.y + refiloVal) * scale - kerfPx;
                            const kw = p.w * scale + kerfPx * 2;
                            const kh = p.h * scale + kerfPx * 2;
                            return <rect key={`kerf-${pi}`} x={kx} y={ky} width={kw} height={kh}
                                fill="none" stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="2 2" opacity={0.25} />;
                        })}

                        {/* ══ Snap guide lines ══ */}
                        {snapGuides.map((sg, i) => (
                            sg.t === 'v'
                                ? <line key={`sg${i}`} x1={(sg.p + refiloVal) * scale} y1={0} x2={(sg.p + refiloVal) * scale} y2={svgH} stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" opacity={0.6} />
                                : <line key={`sg${i}`} x1={0} y1={(sg.p + refiloVal) * scale} x2={svgW} y2={(sg.p + refiloVal) * scale} stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 2" opacity={0.6} />
                        ))}

                        {/* ══ Ghost outline (original position during drag) ══ */}
                        {dragging && (() => {
                            const p = chapa.pecas[dragging.pecaIdx];
                            return <rect x={(p.x + refiloVal) * scale} y={(p.y + refiloVal) * scale}
                                width={p.w * scale} height={p.h * scale}
                                fill="none" stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 4" opacity={0.35} />;
                        })()}

                        {/* Cut lines (toggle) — formato GuillotineBin: {dir, x, y, length} */}
                        {showCuts && chapa.cortes && chapa.cortes.map((c, ci) => {
                            const isH = c.dir === 'Horizontal';
                            // GuillotineBin format: x, y, length (position within usable area)
                            const cx = (c.x != null ? c.x : 0) + refiloVal;
                            const cy = (c.y != null ? c.y : (c.pos || 0)) + refiloVal;
                            const len = c.length || (isH ? chapa.comprimento - 2 * refiloVal : chapa.largura - 2 * refiloVal);
                            return (
                                <g key={`cut${ci}`}>
                                    {isH ? (
                                        <line x1={cx * scale} y1={cy * scale}
                                            x2={(cx + len) * scale} y2={cy * scale}
                                            stroke="#ef444480" strokeWidth={1.5} strokeDasharray="6 3" />
                                    ) : (
                                        <line x1={cx * scale} y1={cy * scale}
                                            x2={cx * scale} y2={(cy + len) * scale}
                                            stroke="#f59e0b80" strokeWidth={1.5} strokeDasharray="6 3" />
                                    )}
                                    <text x={isH ? cx * scale + 3 : cx * scale + 2}
                                        y={isH ? cy * scale - 2 : cy * scale + 10}
                                        fontSize={7} fill={isH ? '#ef4444' : '#f59e0b'} fontWeight={700}>
                                        {c.seq || (ci + 1)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* ══ Sheet locked overlay ══ */}
                        {chapa.locked && (
                            <rect x={refilo} y={refilo}
                                width={(chapa.comprimento - 2 * refiloVal) * scale}
                                height={(chapa.largura - 2 * refiloVal) * scale}
                                fill="rgba(59,130,246,0.06)" pointerEvents="none" />
                        )}

                        {/* ══ PIECES with collision feedback, lock, selection ══ */}
                        {chapa.pecas.map((p, pi) => {
                            const px = (p.x + refiloVal) * scale;
                            const py = (p.y + refiloVal) * scale;
                            const pw = p.w * scale;
                            const ph = p.h * scale;
                            const color = getModColor(p.pecaId, p);
                            const isHovered = hovered === pi;
                            const piece = pecasMap[p.pecaId];
                            const isSelected = selectedPieces.includes(pi);
                            const isDragging = dragging?.pecaIdx === pi;
                            const isLocked = p.locked || chapa.locked;

                            // Dynamic colors during drag
                            let fillColor = color, fillOp = isHovered ? '40' : '25', strokeClr = color, strokeW = isHovered ? 2.5 : 1;
                            if (isDragging) {
                                fillColor = dragCollision ? '#ef4444' : '#22c55e';
                                fillOp = '30';
                                strokeClr = dragCollision ? '#ef4444' : '#22c55e';
                                strokeW = 2.5;
                            }
                            if (isSelected && !isDragging) strokeW = 2.5;

                            return (
                                <g key={pi} data-pidx={pi}
                                    onMouseEnter={() => !dragging && setHovered(pi)}
                                    onMouseLeave={() => !dragging && setHovered(null)}
                                    onMouseDown={(e) => handleDragStart(e, pi)}
                                    onClick={(e) => handlePieceClick(e, pi)}
                                    onDoubleClick={() => handleRotate(pi)}
                                    onContextMenu={(e) => handleCtxMenu(e, pi)}
                                    style={{ cursor: isLocked ? 'not-allowed' : dragging ? 'grabbing' : 'grab' }}>

                                    {/* Piece rect */}
                                    <rect x={px} y={py} width={pw} height={ph}
                                        fill={`${fillColor}${fillOp}`}
                                        stroke={strokeClr} strokeWidth={strokeW}
                                        rx={1} />

                                    {/* Selection border */}
                                    {isSelected && !isDragging && (
                                        <rect x={px - 2} y={py - 2} width={pw + 4} height={ph + 4}
                                            fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 2" rx={2} />
                                    )}

                                    {/* Grain lines on piece (subtle) */}
                                    {hasVeio && pw > 20 && ph > 20 && (
                                        <g opacity={0.12}>
                                            {chapa.veio === 'horizontal' ? (
                                                Array.from({ length: Math.floor(ph / 5) }, (_, i) => (
                                                    <line key={i} x1={px + 1} y1={py + i * 5 + 2.5} x2={px + pw - 1} y2={py + i * 5 + 2.5}
                                                        stroke={color} strokeWidth={0.5} />
                                                ))
                                            ) : (
                                                Array.from({ length: Math.floor(pw / 5) }, (_, i) => (
                                                    <line key={i} x1={px + i * 5 + 2.5} y1={py + 1} x2={px + i * 5 + 2.5} y2={py + ph - 1}
                                                        stroke={color} strokeWidth={0.5} />
                                                ))
                                            )}
                                        </g>
                                    )}

                                    {/* Piece name */}
                                    {pw > 35 && ph > 16 && (
                                        <text x={px + pw / 2} y={py + ph / 2 - (pw > 50 && ph > 28 ? 5 : 0)}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.min(10, Math.min(pw / 8, ph / 3))} fill={color} fontWeight={600}
                                            style={{ pointerEvents: 'none' }}>
                                            {piece ? piece.descricao?.substring(0, Math.floor(pw / 6)) : `P${pi + 1}`}
                                        </text>
                                    )}
                                    {/* Piece dimensions */}
                                    {pw > 50 && ph > 28 && (
                                        <text x={px + pw / 2} y={py + ph / 2 + 7}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.min(8, pw / 10)} fill={color} opacity={0.7}
                                            style={{ pointerEvents: 'none' }}>
                                            {Math.round(p.w)} x {Math.round(p.h)}
                                        </text>
                                    )}
                                    {/* Rotation indicator */}
                                    {p.rotated && pw > 18 && ph > 18 && (
                                        <g style={{ pointerEvents: 'none' }}>
                                            <rect x={px + 2} y={py + 2} width={12} height={10} rx={2}
                                                fill={color} opacity={0.15} />
                                            <text x={px + 8} y={py + 9} textAnchor="middle" fontSize={7} fill={color} fontWeight={700}>R</text>
                                        </g>
                                    )}

                                    {/* Classification badge (pequena/super_pequena) */}
                                    {classifyLocal && pw > 18 && ph > 18 && (() => {
                                        const cls = p.classificacao || classifyLocal(p.w, p.h);
                                        if (cls === 'normal') return null;
                                        const clsC = classColors[cls] || '#f59e0b';
                                        const label = cls === 'super_pequena' ? 'SP' : 'P';
                                        return (
                                            <g transform={`translate(${px + 2}, ${py + ph - 14})`} style={{ pointerEvents: 'none' }}>
                                                <rect width={cls === 'super_pequena' ? 16 : 12} height={11} rx={3} fill={clsC} opacity={0.9} />
                                                <text x={cls === 'super_pequena' ? 8 : 6} y={8} textAnchor="middle" fontSize={7} fill="#fff" fontWeight={800}>{label}</text>
                                            </g>
                                        );
                                    })()}

                                    {/* Edge band indicators (fita borda) */}
                                    {piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira) && pw > 20 && ph > 20 && (
                                        <g style={{ pointerEvents: 'none' }}>
                                            {piece.borda_frontal && <line x1={px} y1={py} x2={px + pw} y2={py} stroke="#ff6b35" strokeWidth={2.5} />}
                                            {piece.borda_traseira && <line x1={px} y1={py + ph} x2={px + pw} y2={py + ph} stroke="#ff6b35" strokeWidth={2.5} />}
                                            {piece.borda_esq && <line x1={px} y1={py} x2={px} y2={py + ph} stroke="#ff6b35" strokeWidth={2.5} />}
                                            {piece.borda_dir && <line x1={px + pw} y1={py} x2={px + pw} y2={py + ph} stroke="#ff6b35" strokeWidth={2.5} />}
                                        </g>
                                    )}

                                    {/* Machining operations (usinagens) */}
                                    {showMachining && piece && pw > 25 && ph > 25 &&
                                        renderMachining(piece, px, py, pw, ph, scale, p.rotated, p.w, p.h)
                                    }

                                    {/* ══ Lock icon ══ */}
                                    {isLocked && pw > 18 && ph > 18 && (
                                        <g transform={`translate(${px + pw - 16}, ${py + 3})`} style={{ pointerEvents: 'none' }}>
                                            <rect width={13} height={12} rx={2} fill="rgba(0,0,0,0.5)" />
                                            <rect x={2} y={5} width={9} height={6} rx={1} fill="#fbbf24" />
                                            <path d="M4 5 V3.5 A2.5 2.5 0 0 1 9 3.5 V5" fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeLinecap="round" />
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {/* Scraps (green dashed) */}
                        {(chapa.retalhos || []).map((r, ri) => {
                            const rx = (r.x + refiloVal) * scale;
                            const ry = (r.y + refiloVal) * scale;
                            const rw = r.w * scale;
                            const rh = r.h * scale;
                            return (
                                <g key={`s${ri}`} style={{ cursor: 'context-menu' }}
                                    onContextMenu={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        const cr = containerRef.current?.getBoundingClientRect();
                                        setSobraCtxMenu({ x: e.clientX - (cr?.left || 0), y: e.clientY - (cr?.top || 0), retalhoIdx: ri, chapaIdx: idx });
                                        setCtxMenu(null);
                                    }}>
                                    <rect x={rx} y={ry} width={rw} height={rh}
                                        fill="#22c55e08" stroke="#22c55e" strokeWidth={1} strokeDasharray="4 2" opacity={0.6} />
                                    {rw > 40 && rh > 16 && (
                                        <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="central"
                                            fontSize={7} fill="#22c55e" opacity={0.7} style={{ pointerEvents: 'none' }}>
                                            {Math.round(r.w)}x{Math.round(r.h)}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                        {/* Drag handles para sobras adjacentes */}
                        {sobraDrag && sobraDrag.chapaIdx === idx && (() => {
                            const rets = chapa.retalhos || [];
                            const handles = [];
                            for (let i = 0; i < rets.length; i++) {
                                for (let j = i + 1; j < rets.length; j++) {
                                    const a = rets[i], b = rets[j];
                                    const tol = 2;
                                    // Adjacente horizontal: a.x+a.w ≈ b.x
                                    if (Math.abs((a.x + a.w) - b.x) < tol && a.y < b.y + b.h && b.y < a.y + a.h) {
                                        const oy1 = Math.max(a.y, b.y), oy2 = Math.min(a.y + a.h, b.y + b.h);
                                        const hx = (a.x + a.w + refiloVal) * scale - 2;
                                        const hy = (oy1 + refiloVal) * scale;
                                        const hh = (oy2 - oy1) * scale;
                                        handles.push(<rect key={`dh${i}-${j}`} x={hx} y={hy} width={4} height={hh}
                                            fill="#f59e0b" opacity={0.8} rx={1} cursor="col-resize" style={{ pointerEvents: 'all' }}
                                            onMouseDown={(e) => { e.stopPropagation(); setSobraDrag({ chapaIdx: idx, idx1: i, idx2: j, axis: 'x', startVal: a.x + a.w, startMouse: e.clientX }); }} />);
                                    }
                                    // Adjacente vertical: a.y+a.h ≈ b.y
                                    if (Math.abs((a.y + a.h) - b.y) < tol && a.x < b.x + b.w && b.x < a.x + a.w) {
                                        const ox1 = Math.max(a.x, b.x), ox2 = Math.min(a.x + a.w, b.x + b.w);
                                        const hx = (ox1 + refiloVal) * scale;
                                        const hy = (a.y + a.h + refiloVal) * scale - 2;
                                        const hw = (ox2 - ox1) * scale;
                                        handles.push(<rect key={`dv${i}-${j}`} x={hx} y={hy} width={hw} height={4}
                                            fill="#f59e0b" opacity={0.8} rx={1} cursor="row-resize" style={{ pointerEvents: 'all' }}
                                            onMouseDown={(e) => { e.stopPropagation(); setSobraDrag({ chapaIdx: idx, idx1: i, idx2: j, axis: 'y', startVal: a.y + a.h, startMouse: e.clientY }); }} />);
                                    }
                                    // Adjacente reverso: b.x+b.w ≈ a.x
                                    if (Math.abs((b.x + b.w) - a.x) < tol && a.y < b.y + b.h && b.y < a.y + a.h) {
                                        const oy1 = Math.max(a.y, b.y), oy2 = Math.min(a.y + a.h, b.y + b.h);
                                        const hx = (b.x + b.w + refiloVal) * scale - 2;
                                        const hy = (oy1 + refiloVal) * scale;
                                        const hh = (oy2 - oy1) * scale;
                                        handles.push(<rect key={`dhr${i}-${j}`} x={hx} y={hy} width={4} height={hh}
                                            fill="#f59e0b" opacity={0.8} rx={1} cursor="col-resize" style={{ pointerEvents: 'all' }}
                                            onMouseDown={(e) => { e.stopPropagation(); setSobraDrag({ chapaIdx: idx, idx1: j, idx2: i, axis: 'x', startVal: b.x + b.w, startMouse: e.clientX }); }} />);
                                    }
                                    // Adjacente reverso vertical: b.y+b.h ≈ a.y
                                    if (Math.abs((b.y + b.h) - a.y) < tol && a.x < b.x + b.w && b.x < a.x + a.w) {
                                        const ox1 = Math.max(a.x, b.x), ox2 = Math.min(a.x + a.w, b.x + b.w);
                                        const hx = (ox1 + refiloVal) * scale;
                                        const hy = (b.y + b.h + refiloVal) * scale - 2;
                                        const hw = (ox2 - ox1) * scale;
                                        handles.push(<rect key={`dvr${i}-${j}`} x={hx} y={hy} width={hw} height={4}
                                            fill="#f59e0b" opacity={0.8} rx={1} cursor="row-resize" style={{ pointerEvents: 'all' }}
                                            onMouseDown={(e) => { e.stopPropagation(); setSobraDrag({ chapaIdx: idx, idx1: j, idx2: i, axis: 'y', startVal: b.y + b.h, startMouse: e.clientY }); }} />);
                                    }
                                }
                            }
                            return handles;
                        })()}
                    </svg>
                </div>

                {/* Tooltip — Rich details panel */}
                {hovered !== null && !dragging && chapa.pecas[hovered] && (() => {
                    const p = chapa.pecas[hovered];
                    const piece = pecasMap[p.pecaId];
                    const cls = p.classificacao || classifyLocal(p.w, p.h);
                    const clsColor = classColors[cls];
                    const clsLabel = classLabels[cls];
                    const area = (p.w * p.h / 1e6).toFixed(4);
                    const minDim = Math.min(p.w, p.h);
                    return (
                        <div style={{
                            position: 'absolute', top: 8, right: 8,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, padding: '10px 14px', fontSize: 11,
                            boxShadow: '0 4px 16px rgba(0,0,0,.18)', zIndex: 10,
                            minWidth: 250, lineHeight: 1.6,
                        }}>
                            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {piece?.descricao || `Peça #${p.pecaId}`}
                                {p.locked && <Lock size={10} style={{ color: '#fbbf24' }} />}
                            </div>
                            {/* Classification badge */}
                            <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                                    borderRadius: 10, fontSize: 10, fontWeight: 700, color: '#fff',
                                    background: clsColor,
                                }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', opacity: 0.6 }} />
                                    {clsLabel}
                                </span>
                                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                                    min. {Math.round(minDim)}mm
                                </span>
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>
                                <b>Dimensões:</b> {Math.round(p.w)} x {Math.round(p.h)} mm ({area} m²)
                                {p.rotated && <span style={{ color: '#f59e0b', fontWeight: 600 }}> (rotacionada 90°)</span>}<br />
                                <b>Posição:</b> x={Math.round(p.x)}, y={Math.round(p.y)}<br />
                                <b>Módulo:</b> {piece?.modulo_desc || '-'}<br />
                                <b>Material:</b> {piece?.material_code || '-'}<br />
                                {piece?.quantidade > 1 && <><b>Instância:</b> {(p.instancia || 0) + 1} de {piece.quantidade}<br /></>}
                                {piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira) && (
                                    <><b>Fita borda:</b> {[
                                        piece.borda_frontal && 'Frontal',
                                        piece.borda_traseira && 'Traseira',
                                        piece.borda_esq && 'Esquerda',
                                        piece.borda_dir && 'Direita',
                                    ].filter(Boolean).join(', ')}<br /></>
                                )}
                                {piece?.acabamento && <><b>Acabamento:</b> {piece.acabamento}<br /></>}
                            </div>
                            {/* Special cut rules */}
                            {p.corte && (
                                <div style={{ marginTop: 6, padding: '4px 8px', borderRadius: 6, fontSize: 10,
                                    background: cls === 'super_pequena' ? '#fef2f215' : '#fef9c315',
                                    border: `1px solid ${clsColor}30` }}>
                                    <div style={{ fontWeight: 700, color: clsColor, marginBottom: 2 }}>Regras especiais de corte</div>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                        Passes: {p.corte.passes} · Velocidade: {p.corte.velocidade}
                                        {p.corte.tabs && <> · Tabs: {p.corte.tabCount}x {p.corte.tabSize}mm</>}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ══ Context Menu ══ */}
                {ctxMenu && (() => {
                    const p = chapa.pecas[ctxMenu.pecaIdx];
                    if (!p) return null;
                    const isLocked = p.locked;
                    const compatibleSheets = allChapas.map((ch, ci) => ({ ch, ci })).filter(({ ch, ci }) => ci !== idx && ch.material === chapa.material);
                    const ctxSt = (extra) => ({
                        padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12, color: 'var(--text-primary)', transition: 'background .1s', ...extra
                    });
                    return (
                        <div style={{
                            position: 'absolute', left: Math.min(ctxMenu.x, 300), top: ctxMenu.y,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.25)', zIndex: 100,
                            minWidth: 200, padding: '4px 0', overflow: 'hidden',
                        }} onClick={e => e.stopPropagation()}>
                            <div style={ctxSt()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { onAdjust({ action: isLocked ? 'unlock' : 'lock', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx }); setCtxMenu(null); }}>
                                {isLocked ? <><Unlock size={13} /> Desbloquear posição</> : <><Lock size={13} /> Bloquear posição</>}
                            </div>
                            {!hasVeio && !isLocked && (
                                <div style={ctxSt()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => { handleRotate(ctxMenu.pecaIdx); setCtxMenu(null); }}>
                                    <RotateCw size={13} /> Rotacionar 90°
                                </div>
                            )}
                            <div style={ctxSt()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { onAdjust({ action: 'to_transfer', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx }); setCtxMenu(null); }}>
                                <ArrowLeftRight size={13} /> Enviar p/ Transferência
                            </div>
                            {compatibleSheets.length > 0 && (
                                <>
                                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                                    <div style={{ padding: '4px 14px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mover para chapa</div>
                                    {compatibleSheets.map(({ ci }) => (
                                        <div key={ci} style={ctxSt()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            onClick={() => { onAdjust({ action: 'move_to_sheet', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx, targetChapaIdx: ci }); setCtxMenu(null); }}>
                                            <Box size={13} /> Chapa {ci + 1}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    );
                })()}

                {/* ══ Context Menu Sobras ══ */}
                {sobraCtxMenu && sobraCtxMenu.chapaIdx === idx && (() => {
                    const r = (chapa.retalhos || [])[sobraCtxMenu.retalhoIdx];
                    if (!r) return null;
                    // Verificar se tem adjacente
                    const rets = chapa.retalhos || [];
                    const tol = 2;
                    const hasAdj = rets.some((b, bi) => {
                        if (bi === sobraCtxMenu.retalhoIdx) return false;
                        return (Math.abs((r.x + r.w) - b.x) < tol || Math.abs((b.x + b.w) - r.x) < tol ||
                                Math.abs((r.y + r.h) - b.y) < tol || Math.abs((b.y + b.h) - r.y) < tol);
                    });
                    const ctxSt2 = (extra) => ({
                        padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12, color: 'var(--text-primary)', transition: 'background .1s', ...extra
                    });
                    return (
                        <div style={{
                            position: 'absolute', left: Math.min(sobraCtxMenu.x, 300), top: sobraCtxMenu.y,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.25)', zIndex: 100,
                            minWidth: 200, padding: '4px 0', overflow: 'hidden',
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '4px 14px 6px', fontSize: 10, fontWeight: 700, color: '#22c55e' }}>
                                Sobra {Math.round(r.w)}x{Math.round(r.h)}mm
                            </div>
                            <div style={ctxSt2()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { onAdjust({ action: 'marcar_refugo', chapaIdx: idx, retalhoIdx: sobraCtxMenu.retalhoIdx }); setSobraCtxMenu(null); }}>
                                <Trash2 size={13} color="#ef4444" /> Marcar como Refugo
                            </div>
                            {hasAdj && (
                                <div style={ctxSt2()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => {
                                        setSobraDrag({ chapaIdx: idx, active: true });
                                        setSobraCtxMenu(null);
                                    }}>
                                    <Maximize2 size={13} color="#f59e0b" /> Ajustar Corte de Sobra
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Drag collision feedback bar */}
                {dragging && (
                    <div style={{
                        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                        padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: dragCollision ? colorBg('#ef4444') : colorBg('#22c55e'),
                        color: dragCollision ? '#ef4444' : '#22c55e',
                        border: `1px solid ${dragCollision ? colorBorder('#ef4444') : colorBorder('#22c55e')}`,
                        zIndex: 10, whiteSpace: 'nowrap',
                    }}>
                        {dragCollision ? 'Colisao! Solte para cancelar' : 'Posicao valida'}
                    </div>
                )}
            </div>

            {/* Info bar below sheet */}
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{chapa.pecas.length} peça(s)</span>
                {chapa.pecas.filter(p => p.locked).length > 0 && (
                    <span style={{ color: '#fbbf24', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={11} /> {chapa.pecas.filter(p => p.locked).length} travada(s)</span>
                )}
                {(chapa.retalhos?.length || 0) > 0 && <span style={{ color: '#22c55e' }}>{chapa.retalhos.length} retalho(s)</span>}
                {chapa.kerf > 0 && <span>Kerf: {chapa.kerf}mm</span>}
                {refiloVal > 0 && <span>Refilo: {refiloVal}mm</span>}
                {hasVeio && <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Veio: {chapa.veio === 'horizontal' ? '━ Horizontal' : '┃ Vertical'}</span>}
                {/* Per-sheet classification counts */}
                {classifyLocal && (() => {
                    const sheetCls = { normal: 0, pequena: 0, super_pequena: 0 };
                    for (const p of chapa.pecas) sheetCls[p.classificacao || classifyLocal(p.w, p.h)]++;
                    return (
                        <>
                            {sheetCls.pequena > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}>{sheetCls.pequena} peq.</span>}
                            {sheetCls.super_pequena > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>{sheetCls.super_pequena} s.peq.</span>}
                        </>
                    );
                })()}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
                    Área útil: {((chapa.comprimento - 2 * refiloVal) * (chapa.largura - 2 * refiloVal) / 1000000).toFixed(2)} m²
                </span>
            </div>

            {/* Piece list (expandable) */}
            <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                    Lista de Peças ({chapa.pecas.length})
                </summary>
                <div style={{ marginTop: 6, maxHeight: 250, overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>#</th>
                                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Peça</th>
                                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Módulo</th>
                                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>C x L (mm)</th>
                                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>Posição</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Rot.</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Borda</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Class.</th>
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Lock</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chapa.pecas.map((p, pi) => {
                                const piece = pecasMap[p.pecaId];
                                const hasBorda = piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira);
                                return (
                                    <tr key={pi} style={{ borderBottom: '1px solid var(--border)', background: hovered === pi ? `${getModColor(p.pecaId, p)}15` : selectedPieces.includes(pi) ? '#3b82f610' : pi % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}
                                        onMouseEnter={() => setHovered(pi)} onMouseLeave={() => setHovered(null)}>
                                        <td style={{ padding: '3px 6px', color: 'var(--text-muted)' }}>{pi + 1}</td>
                                        <td style={{ padding: '3px 6px', fontWeight: 500 }}>{piece?.descricao || `#${p.pecaId}`}</td>
                                        <td style={{ padding: '3px 6px', fontSize: 9, color: 'var(--text-muted)' }}>{piece?.modulo_desc || '-'}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{Math.round(p.w)} x {Math.round(p.h)}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{Math.round(p.x)},{Math.round(p.y)}</td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                                            {p.rotated ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>90°</span> : '-'}
                                        </td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                                            {hasBorda ? <span style={{ color: '#ff6b35', fontWeight: 600 }}>●</span> : '-'}
                                        </td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                                            {(() => {
                                                const cls = p.classificacao || (classifyLocal ? classifyLocal(p.w, p.h) : 'normal');
                                                if (cls === 'normal') return <span style={{ color: '#22c55e', fontWeight: 600 }}>N</span>;
                                                if (cls === 'pequena') return <span style={{ color: '#f59e0b', fontWeight: 700 }}>P</span>;
                                                return <span style={{ color: '#ef4444', fontWeight: 700 }}>SP</span>;
                                            })()}
                                        </td>
                                        <td style={{ padding: '3px 6px', textAlign: 'center', cursor: 'pointer' }}
                                            onClick={() => onAdjust({ action: p.locked ? 'unlock' : 'lock', chapaIdx: idx, pecaIdx: pi })}>
                                            {p.locked ? <Lock size={10} color="#fbbf24" /> : <span style={{ opacity: 0.2 }}>-</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </details>

            {/* Cutting sequence (guillotine mode) */}
            {chapa.cortes && chapa.cortes.length > 0 && (
                <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
                        Sequência de Cortes ({chapa.cortes.length} cortes)
                    </summary>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {chapa.cortes.map((c, ci) => (
                            <span key={ci} style={{
                                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                                background: c.dir === 'Horizontal' ? colorBg('#3b82f6') : colorBg('#f59e0b'),
                                border: `1px solid ${c.dir === 'Horizontal' ? colorBorder('#3b82f6') : colorBorder('#f59e0b')}`,
                                color: c.dir === 'Horizontal' ? '#3b82f6' : '#f59e0b',
                                fontWeight: 600,
                            }}>
                                {c.seq}. {c.dir === 'Horizontal' ? '━' : '┃'} {c.pos}mm ({c.len}mm)
                            </span>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}

function isPanningCursor(zoom) { return zoom > 1 ? 'grab' : 'default'; }

// ═══════════════════════════════════════════════════════
// ABA 4: ETIQUETAS (com personalização completa)
// ═══════════════════════════════════════════════════════

const FORMATOS_ETIQUETA = {
    '100x70': { w: 100, h: 70, nome: '100 × 70 mm' },
    '100x50': { w: 100, h: 50, nome: '100 × 50 mm' },
    '90x60':  { w: 90, h: 60, nome: '90 × 60 mm' },
    '80x50':  { w: 80, h: 50, nome: '80 × 50 mm' },
    '70x40':  { w: 70, h: 40, nome: '70 × 40 mm (compacta)' },
    'a7':     { w: 105, h: 74, nome: 'A7 (105 × 74 mm)' },
};

const FONTES_TAMANHO = {
    'pequeno': { body: 9, label: 8, title: 10, ctrl: 14 },
    'medio':   { body: 11, label: 10, title: 12, ctrl: 18 },
    'grande':  { body: 13, label: 11, title: 14, ctrl: 22 },
};

// SVG Barcode simples (Code128-style visual)
function BarcodeSVG({ value, width = 120, height = 28 }) {
    // Gera barras pseudo-aleatórias baseadas no valor para visual de code128
    const bars = [];
    const str = String(value);
    let x = 0;
    // Start pattern
    bars.push({ x, w: 2, fill: true }); x += 3;
    bars.push({ x, w: 1, fill: true }); x += 2;
    bars.push({ x, w: 1, fill: true }); x += 2;
    bars.push({ x, w: 2, fill: true }); x += 3;
    // Encode each char
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        const widths = [(c % 3) + 1, ((c >> 2) % 2) + 1, ((c >> 4) % 3) + 1, ((c >> 1) % 2) + 1];
        for (let j = 0; j < widths.length; j++) {
            bars.push({ x, w: widths[j], fill: j % 2 === 0 });
            x += widths[j] + 0.5;
        }
        x += 1;
    }
    // Stop pattern
    bars.push({ x, w: 2, fill: true }); x += 3;
    bars.push({ x, w: 3, fill: true }); x += 4;
    bars.push({ x, w: 1, fill: true }); x += 2;

    const totalW = x;
    const scale = width / totalW;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {bars.filter(b => b.fill).map((b, i) => (
                <rect key={i} x={b.x * scale} y={0} width={Math.max(b.w * scale, 1)} height={height - 8} fill="#000" />
            ))}
            <text x={width / 2} y={height - 1} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="#000">
                {value}
            </text>
        </svg>
    );
}

function TabEtiquetas({ lotes, loteAtual, setLoteAtual, notify }) {
    const [etiquetas, setEtiquetas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cfg, setCfg] = useState(null);
    const [cfgLoading, setCfgLoading] = useState(true);
    const [filtroModulo, setFiltroModulo] = useState('');
    const [filtroMaterial, setFiltroMaterial] = useState('');
    const [templatePadrao, setTemplatePadrao] = useState(null);
    const [templateLoading, setTemplateLoading] = useState(false);
    const [usarTemplate, setUsarTemplate] = useState(true); // toggle template vs legacy

    // Carregar config de etiquetas
    const loadCfg = useCallback(() => {
        setCfgLoading(true);
        api.get('/cnc/etiqueta-config').then(c => setCfg(c)).catch(() => {
            setCfg({ formato: '100x70', orientacao: 'paisagem', colunas_impressao: 2, fonte_tamanho: 'medio',
                mostrar_usia: 1, mostrar_usib: 1, mostrar_material: 1, mostrar_espessura: 1,
                mostrar_cliente: 1, mostrar_projeto: 1, mostrar_codigo: 1, mostrar_modulo: 1,
                mostrar_peca: 1, mostrar_dimensoes: 1, mostrar_bordas_diagrama: 1, mostrar_fita_resumo: 1,
                mostrar_acabamento: 1, mostrar_id_modulo: 1, mostrar_controle: 1, mostrar_produto_final: 0,
                mostrar_observacao: 1, mostrar_codigo_barras: 1, empresa_nome: '', cor_borda_fita: '#22c55e', cor_controle: '',
                margem_pagina: 8, gap_etiquetas: 4 });
        }).finally(() => setCfgLoading(false));
    }, []);

    useEffect(() => { loadCfg(); }, [loadCfg]);

    const load = useCallback(() => {
        if (!loteAtual) return;
        setLoading(true);
        api.get(`/cnc/etiquetas/${loteAtual.id}`).then(setEtiquetas).catch(e => notify(e.error || 'Erro ao carregar etiquetas')).finally(() => setLoading(false));
    }, [loteAtual]);

    useEffect(() => { load(); }, [load]);

    // Carregar template padrão para preview
    const loadTemplatePadrao = useCallback(async () => {
        setTemplateLoading(true);
        try {
            const resp = await api.get('/cnc/etiqueta-templates');
            const lista = resp.data || resp;
            if (Array.isArray(lista) && lista.length > 0) {
                const def = lista.find(t => t.padrao) || lista[0];
                const full = await api.get(`/cnc/etiqueta-templates/${def.id}`);
                const tmpl = full.data || full;
                if (typeof tmpl.elementos === 'string') tmpl.elementos = JSON.parse(tmpl.elementos);
                setTemplatePadrao(tmpl);
            }
        } catch (e) { console.error('Erro ao carregar template:', e); }
        setTemplateLoading(false);
    }, []);

    useEffect(() => { loadTemplatePadrao(); }, [loadTemplatePadrao]);

    // Imprimir com template SVG
    const imprimirTemplate = () => {
        if (!templatePadrao) return imprimirLegacy();
        const cols = templatePadrao.colunas_impressao || 2;
        const margem = templatePadrao.margem_pagina || 8;
        const gap = templatePadrao.gap_etiquetas || 4;
        const wMm = templatePadrao.largura || 100;
        const hMm = templatePadrao.altura || 70;
        const styleId = 'etiqueta-print-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            @media print {
                body * { visibility: hidden !important; }
                .print-area, .print-area * { visibility: visible !important; }
                .print-area {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    display: grid !important;
                    grid-template-columns: repeat(${cols}, ${wMm}mm) !important;
                    gap: ${gap}mm !important;
                    padding: 0 !important;
                }
                .print-area .etiqueta-svg-wrap {
                    width: ${wMm}mm !important;
                    height: ${hMm}mm !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                .print-area .etiqueta-svg-wrap svg {
                    width: ${wMm}mm !important;
                    height: ${hMm}mm !important;
                }
                .no-print { display: none !important; }
                @page {
                    margin: ${margem}mm !important;
                    size: A4 !important;
                }
            }
        `;
        window.print();
    };

    // Imprimir legado (EtiquetaCard)
    const imprimirLegacy = () => {
        const cols = cfg?.colunas_impressao || 2;
        const fmt = FORMATOS_ETIQUETA[cfg?.formato] || FORMATOS_ETIQUETA['100x70'];
        const gap = cfg?.gap_etiquetas || 4;
        const margem = cfg?.margem_pagina || 8;
        const styleId = 'etiqueta-print-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            @media print {
                .etiqueta-grid {
                    display: grid !important;
                    grid-template-columns: repeat(${cols}, 1fr) !important;
                    gap: ${gap}mm !important;
                    padding: 0 !important;
                }
                .etiqueta-card-print {
                    width: ${fmt.w}mm !important;
                    min-height: ${fmt.h}mm !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    border: 0.5pt solid #ccc !important;
                }
                @page {
                    margin: ${margem}mm !important;
                    size: A4 !important;
                }
            }
        `;
        window.print();
    };

    const imprimir = () => {
        if (usarTemplate && templatePadrao) imprimirTemplate();
        else imprimirLegacy();
    };

    // Filtrar etiquetas
    const modulos = [...new Set(etiquetas.map(e => e.modulo_desc).filter(Boolean))];
    const materiais = [...new Set(etiquetas.map(e => e.material || e.material_code).filter(Boolean))];
    const etiquetasFiltradas = etiquetas.filter(e => {
        if (filtroModulo && e.modulo_desc !== filtroModulo) return false;
        if (filtroMaterial && (e.material || e.material_code) !== filtroMaterial) return false;
        return true;
    });

    if (cfgLoading) return <Spinner text="Carregando configurações..." />;

    const fontes = FONTES_TAMANHO[cfg?.fonte_tamanho] || FONTES_TAMANHO.medio;
    const corFita = cfg?.cor_borda_fita || '#22c55e';
    const corCtrl = cfg?.cor_controle || 'var(--primary)';

    // ═══════════════════════════════════════════════════════
    // PREVIEW — Visualização e impressão de etiquetas
    // ═══════════════════════════════════════════════════════
    return (
        <div>
            <LoteSelector lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} />

            {!loteAtual ? (
                <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Selecione um lote para ver as etiquetas
                </div>
            ) : loading ? (
                <Spinner text="Carregando etiquetas..." />
            ) : (
                <>
                    {/* Barra de ações */}
                    <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={imprimir} className={Z.btn} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
                            <Printer size={14} /> Imprimir Etiquetas
                        </button>
                        {/* Toggle template vs legacy */}
                        {templatePadrao && (
                            <label className="no-print" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                <input type="checkbox" checked={usarTemplate} onChange={e => setUsarTemplate(e.target.checked)} />
                                Usar template personalizado
                            </label>
                        )}

                        {/* Filtros */}
                        {modulos.length > 1 && (
                            <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}
                                className={Z.inp} style={{ width: 160, fontSize: 11, padding: '6px 8px' }}>
                                <option value="">Todos os módulos</option>
                                {modulos.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        )}
                        {materiais.length > 1 && (
                            <select value={filtroMaterial} onChange={e => setFiltroMaterial(e.target.value)}
                                className={Z.inp} style={{ width: 180, fontSize: 11, padding: '6px 8px' }}>
                                <option value="">Todos os materiais</option>
                                {materiais.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        )}

                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {etiquetasFiltradas.length} de {etiquetas.length} etiqueta(s)
                            {templatePadrao && usarTemplate && <span style={{ color: 'var(--primary)', fontWeight: 600, marginLeft: 6 }}>| Template: {templatePadrao.nome}</span>}
                        </span>
                    </div>

                    {/* Template info bar */}
                    {templatePadrao && usarTemplate && (
                        <div className="no-print" style={{ marginBottom: 12, padding: '8px 14px', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                            <PenTool size={13} style={{ color: 'var(--primary)' }} />
                            <span style={{ fontWeight: 600 }}>Template ativo: <span style={{ color: 'var(--primary)' }}>{templatePadrao.nome}</span></span>
                            <span style={{ color: 'var(--text-muted)' }}>|</span>
                            <span style={{ color: 'var(--text-muted)' }}>{templatePadrao.largura}×{templatePadrao.altura}mm</span>
                            <span style={{ color: 'var(--text-muted)' }}>|</span>
                            <span style={{ color: 'var(--text-muted)' }}>{templatePadrao.elementos?.length || 0} elementos</span>
                            <span style={{ color: 'var(--text-muted)' }}>|</span>
                            <span style={{ color: 'var(--text-muted)' }}>{templatePadrao.colunas_impressao || 2} colunas</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                (Configurações → Etiquetas para editar layout)
                            </span>
                        </div>
                    )}

                    {/* Grid de etiquetas */}
                    {usarTemplate && templatePadrao ? (
                        /* ─── Template-based rendering (EtiquetaSVG) ─── */
                        <div className="print-area" style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(280, (templatePadrao.largura || 100) * 3.5)}px, 1fr))`,
                            gap: templatePadrao.gap_etiquetas ? `${templatePadrao.gap_etiquetas * 2}px` : '8px',
                        }}>
                            {etiquetasFiltradas.map((et, i) => (
                                <div key={i} className="etiqueta-svg-wrap" style={{
                                    background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb',
                                    overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                    transition: 'box-shadow 0.15s',
                                }}>
                                    <EtiquetaSVG template={templatePadrao} etiqueta={et} cfg={cfg} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* ─── Legacy rendering (EtiquetaCard) ─── */
                        <div className="print-area etiqueta-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(280, 320)}px, 1fr))`,
                            gap: cfg?.gap_etiquetas ? `${cfg.gap_etiquetas * 2}px` : '8px',
                        }}>
                            {etiquetasFiltradas.map((et, i) => (
                                <EtiquetaCard key={i} et={et} cfg={cfg} fontes={fontes} corFita={corFita} corCtrl={corCtrl} />
                            ))}
                        </div>
                    )}

                    {etiquetasFiltradas.length === 0 && (
                        <div className="glass-card p-6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            Nenhuma etiqueta encontrada com os filtros selecionados
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function EtiquetaCard({ et, cfg, fontes, corFita, corCtrl }) {
    const sh = (key) => cfg?.[key] !== 0; // mostrar campo (default = true exceto produto_final)
    const borderColor = (has) => has ? corFita : '#d1d5db';
    const fs = fontes || FONTES_TAMANHO.medio;

    return (
        <div className="etiqueta-card-print" style={{
            padding: '10px 12px', fontSize: fs.body, lineHeight: 1.5,
            pageBreakInside: 'avoid', breakInside: 'avoid',
            border: '1px solid var(--border)', borderRadius: 8,
            background: 'var(--bg-card)',
        }}>
            {/* Empresa + Controle header */}
            {(cfg?.empresa_nome || sh('mostrar_controle')) && (
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 6, paddingBottom: 5, borderBottom: '2px solid var(--border)',
                }}>
                    {cfg?.empresa_nome ? (
                        <span style={{ fontSize: fs.title, fontWeight: 800, color: 'var(--primary)', letterSpacing: 0.5 }}>
                            {cfg.empresa_nome}
                        </span>
                    ) : <span />}
                    {sh('mostrar_controle') && (
                        <div style={{
                            background: corCtrl, color: '#fff',
                            padding: '2px 10px', borderRadius: 6,
                            fontSize: fs.ctrl, fontWeight: 800, lineHeight: 1.2,
                            minWidth: 40, textAlign: 'center',
                        }}>
                            {et.controle}
                        </div>
                    )}
                </div>
            )}

            {/* UsiA / UsiB */}
            {(sh('mostrar_usia') || sh('mostrar_usib')) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed var(--border)' }}>
                    {sh('mostrar_usia') && (
                        <div>
                            <span style={{ fontWeight: 700, fontSize: fs.label, color: 'var(--text-muted)' }}>UsiA: </span>
                            <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: fs.body }}>{et.usi_a || '-'}</span>
                        </div>
                    )}
                    {sh('mostrar_usib') && (
                        <div>
                            <span style={{ fontWeight: 700, fontSize: fs.label, color: 'var(--text-muted)' }}>UsiB: </span>
                            <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: fs.body }}>{et.usi_b || '-'}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Corpo principal - dados da peça */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 10px', marginBottom: 6 }}>
                {sh('mostrar_material') && (
                    <div style={{ gridColumn: '1/-1' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Material: </span>
                        <b>{et.material || et.material_code}</b>
                    </div>
                )}
                {sh('mostrar_espessura') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Espessura: </span><b>{et.espessura}mm</b></div>
                )}
                {sh('mostrar_cliente') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Cliente: </span><b>{et.cliente}</b></div>
                )}
                {sh('mostrar_projeto') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Projeto: </span>{et.projeto}</div>
                )}
                {sh('mostrar_codigo') && et.codigo && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Código: </span>{et.codigo}</div>
                )}
                {sh('mostrar_modulo') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Módulo: </span><b>{et.modulo_desc}</b></div>
                )}
                {sh('mostrar_peca') && (
                    <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Peça: </span><b style={{ color: 'var(--primary)' }}>{et.descricao}</b></div>
                )}
                {sh('mostrar_dimensoes') && (
                    <>
                        <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Comp: </span><b>{et.comprimento}mm</b></div>
                        <div><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Larg: </span><b>{et.largura}mm</b></div>
                    </>
                )}
                {sh('mostrar_produto_final') && et.produto_final && (
                    <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Produto: </span>{et.produto_final}</div>
                )}
                {sh('mostrar_observacao') && et.observacao && (
                    <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-muted)', fontSize: fs.label }}>Obs: </span><i>{et.observacao}</i></div>
                )}
            </div>

            {/* Rodapé: diagrama + fita + barcode */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                {/* Diagrama de bordas SVG */}
                {sh('mostrar_bordas_diagrama') && (
                    <div style={{ flexShrink: 0 }}>
                        <svg width={56} height={46} viewBox="0 0 56 46">
                            <rect x={8} y={3} width={40} height={40} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} rx={2} />
                            {/* Setas/labels nos lados com fita */}
                            <line x1={8} y1={3} x2={48} y2={3} stroke={borderColor(et.diagrama.top)} strokeWidth={3.5} strokeLinecap="round" />
                            <line x1={8} y1={43} x2={48} y2={43} stroke={borderColor(et.diagrama.bottom)} strokeWidth={3.5} strokeLinecap="round" />
                            <line x1={8} y1={3} x2={8} y2={43} stroke={borderColor(et.diagrama.left)} strokeWidth={3.5} strokeLinecap="round" />
                            <line x1={48} y1={3} x2={48} y2={43} stroke={borderColor(et.diagrama.right)} strokeWidth={3.5} strokeLinecap="round" />
                            {/* Labels nos lados */}
                            {et.diagrama.top && <text x={28} y={15} textAnchor="middle" fontSize={6} fill={corFita} fontWeight="700">F</text>}
                            {et.diagrama.bottom && <text x={28} y={38} textAnchor="middle" fontSize={6} fill={corFita} fontWeight="700">T</text>}
                            {et.diagrama.left && <text x={16} y={25} textAnchor="middle" fontSize={6} fill={corFita} fontWeight="700">E</text>}
                            {et.diagrama.right && <text x={40} y={25} textAnchor="middle" fontSize={6} fill={corFita} fontWeight="700">D</text>}
                        </svg>
                    </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                    {sh('mostrar_fita_resumo') && (
                        <div style={{ fontSize: fs.label, color: 'var(--text-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                            <span style={{ fontWeight: 700 }}>Fita:</span> {et.fita_resumo}
                        </div>
                    )}
                    {sh('mostrar_acabamento') && (
                        <div style={{ fontSize: fs.label, color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 700 }}>Acab:</span> {et.acabamento || '-'}
                        </div>
                    )}
                    {sh('mostrar_id_modulo') && (
                        <div style={{ fontSize: fs.label, color: 'var(--text-muted)' }}>
                            <span style={{ fontWeight: 700 }}>ID Mod:</span> {et.modulo_id}
                        </div>
                    )}

                    {/* Código de barras */}
                    {sh('mostrar_codigo_barras') && (
                        <div style={{ marginTop: 3 }}>
                            <BarcodeSVG value={et.controle} width={100} height={22} />
                        </div>
                    )}
                </div>

                {/* Número de controle grande (se não estiver no header) */}
                {!cfg?.empresa_nome && sh('mostrar_controle') && (
                    <div style={{
                        width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                        background: corCtrl, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: fs.ctrl, fontWeight: 800,
                    }}>
                        {et.controle}
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// CONFIG: Etiquetas (seção dentro de TabConfig)
// ═══════════════════════════════════════════════════════
function CfgEtiquetas({ notify, setEditorMode, setEditorTemplateId }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/cnc/etiqueta-templates').then(data => {
            const list = Array.isArray(data) ? data : (data.data || []);
            // Load full template data (with elementos) for previews
            Promise.all(list.map(t =>
                api.get(`/cnc/etiqueta-templates/${t.id}`).then(resp => {
                    const d = resp.data || resp;
                    if (typeof d.elementos === 'string') d.elementos = JSON.parse(d.elementos);
                    return d;
                }).catch(() => t)
            )).then(full => { setTemplates(full); setLoading(false); });
        }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { load(); }, [load]);

    const openEditor = (templateId) => {
        setEditorTemplateId?.(templateId || null);
        setEditorMode?.(true);
    };

    const criarNovo = async () => {
        try {
            const resp = await api.post('/cnc/etiqueta-templates', { nome: 'Nova Etiqueta', largura: 100, altura: 70, elementos: '[]' });
            const newId = resp?.id || resp?.data?.id;
            if (newId) openEditor(newId);
            else { load(); notify('Template criado'); }
        } catch { notify('Erro ao criar template'); }
    };

    const duplicar = async (id) => {
        try {
            await api.post(`/cnc/etiqueta-templates/${id}/duplicar`);
            load();
            notify('Template duplicado');
        } catch { notify('Erro ao duplicar'); }
    };

    const excluir = async (id) => {
        try {
            await api.del(`/cnc/etiqueta-templates/${id}`);
            setConfirmDelete(null);
            load();
            notify('Template excluído');
        } catch (e) { notify(e?.message || 'Erro ao excluir'); }
    };

    const definirPadrao = async (id) => {
        try {
            await api.put(`/cnc/etiqueta-templates/${id}/padrao`);
            load();
            notify('Template definido como padrão');
        } catch { notify('Erro ao definir padrão'); }
    };

    if (loading) return <Spinner text="Carregando templates..." />;

    return (
        <div className="glass-card p-4">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <TagIcon size={18} style={{ color: 'var(--primary)' }} />
                    Templates de Etiquetas
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>({templates.length})</span>
                </h3>
                <button onClick={criarNovo}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px',
                        background: 'linear-gradient(135deg, var(--primary), #e67e22)', color: '#fff',
                        border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', boxShadow: '0 3px 12px rgba(230, 126, 34, 0.3)',
                        transition: 'all .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    <Plus size={15} />
                    Criar Nova Etiqueta
                </button>
            </div>

            {/* Template cards */}
            {templates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <TagIcon size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nenhum template criado</div>
                    <div style={{ fontSize: 11 }}>Clique em "Criar Nova Etiqueta" para começar</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {templates.map(t => {
                        const isPadrao = !!t.padrao;
                        const elCount = Array.isArray(t.elementos) ? t.elementos.length : 0;
                        const parsedEls = Array.isArray(t.elementos) ? t.elementos : [];
                        return (
                            <div key={t.id} style={{
                                display: 'flex', gap: 14, padding: '12px 14px',
                                background: isPadrao ? 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(59,130,246,0.08))' : 'var(--bg-muted)',
                                border: '1px solid', borderColor: isPadrao ? 'rgba(59,130,246,0.25)' : 'var(--border)',
                                borderRadius: 10, transition: 'all .15s', position: 'relative',
                            }}>
                                {/* Mini SVG preview */}
                                <div style={{
                                    width: 120, minHeight: 80, flexShrink: 0,
                                    background: '#fff', borderRadius: 6, border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', cursor: 'pointer',
                                }} onClick={() => openEditor(t.id)}>
                                    {parsedEls.length > 0 ? (
                                        <EtiquetaSVG template={{ ...t, elementos: parsedEls }} etiqueta={null} cfg={{}} width={110} />
                                    ) : (
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                                            Vazio
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.nome || 'Sem nome'}
                                        </span>
                                        {isPadrao && (
                                            <span style={{
                                                fontSize: 9, fontWeight: 700, padding: '2px 7px',
                                                background: 'var(--primary)', color: '#fff', borderRadius: 20,
                                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                            }}>Padrão</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span>{t.largura || 100} × {t.altura || 70} mm</span>
                                        <span>·</span>
                                        <span>{elCount} elemento{elCount !== 1 ? 's' : ''}</span>
                                        <span>·</span>
                                        <span>{t.colunas_impressao || 2} col.</span>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                        <button onClick={() => openEditor(t.id)}
                                            className={Z.btn}
                                            style={{ fontSize: 11, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <PenTool size={11} /> Editar
                                        </button>
                                        <button onClick={() => duplicar(t.id)}
                                            className={Z.btn2}
                                            style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Copy size={11} /> Duplicar
                                        </button>
                                        {!isPadrao && (
                                            <button onClick={() => definirPadrao(t.id)}
                                                className={Z.btn2}
                                                style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Star size={11} /> Definir Padrão
                                            </button>
                                        )}
                                        {!isPadrao && (
                                            <button onClick={() => setConfirmDelete(t.id)}
                                                style={{
                                                    fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4,
                                                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                                                    color: '#ef4444', cursor: 'pointer',
                                                }}>
                                                <Trash2 size={11} /> Excluir
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Confirm delete modal */}
            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                    onClick={() => setConfirmDelete(null)}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, minWidth: 340, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}
                        onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Excluir Template?</h3>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                            Esta ação não pode ser desfeita. O template será permanentemente removido.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className={Z.btn2} onClick={() => setConfirmDelete(null)} style={{ fontSize: 12 }}>Cancelar</button>
                            <button onClick={() => excluir(confirmDelete)}
                                style={{
                                    padding: '6px 16px', background: '#ef4444', color: '#fff', border: 'none',
                                    borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                }}>
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 5: G-CODE
// ═══════════════════════════════════════════════════════
function TabGcode({ lotes, loteAtual, setLoteAtual, notify }) {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [gerando, setGerando] = useState(false);
    const [maquinas, setMaquinas] = useState([]);
    const [maquinaId, setMaquinaId] = useState('');

    // Carregar máquinas disponíveis
    useEffect(() => {
        api.get('/cnc/maquinas').then(ms => {
            setMaquinas(ms);
            // Selecionar padrão
            const padrao = ms.find(m => m.padrao);
            if (padrao) setMaquinaId(String(padrao.id));
            else if (ms.length > 0) setMaquinaId(String(ms[0].id));
        }).catch(e => notify(e.error || 'Erro ao carregar máquinas'));
    }, []);

    const maquinaSel = maquinas.find(m => String(m.id) === maquinaId);

    const gerar = async () => {
        if (!loteAtual) return;
        setGerando(true);
        try {
            const body = maquinaId ? { maquina_id: Number(maquinaId) } : {};
            const r = await api.post(`/cnc/gcode/${loteAtual.id}`, body);
            setResult(r);
            if (r.ok) {
                notify(`G-code gerado: ${r.total_operacoes} operações`);
            } else if (r.error) {
                notify(r.error);
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setGerando(false);
        }
    };

    const downloadGcode = () => {
        if (!result?.gcode) return;
        const ext = result.extensao || '.nc';
        const blob = new Blob([result.gcode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${loteAtual?.nome || 'lote'}${ext}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <LoteSelector lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} />

            {!loteAtual ? (
                <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Selecione um lote para gerar G-code
                </div>
            ) : (
                <>
                    {/* Machine selector */}
                    <div className="glass-card p-4" style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Monitor size={16} style={{ color: 'var(--primary)' }} />
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Máquina CNC:</span>
                            </div>
                            <select
                                value={maquinaId}
                                onChange={e => { setMaquinaId(e.target.value); setResult(null); }}
                                className={Z.inp}
                                style={{ minWidth: 260, fontSize: 13 }}
                            >
                                {maquinas.length === 0 && <option value="">Nenhuma máquina cadastrada</option>}
                                {maquinas.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.nome} {m.fabricante ? `(${m.fabricante} ${m.modelo})` : ''} {m.padrao ? '[Padrao]' : ''} [{m.total_ferramentas} ferr.]
                                    </option>
                                ))}
                            </select>
                            {maquinaSel && (
                                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                                    <span>Ext: <b>{maquinaSel.extensao_arquivo || '.nc'}</b></span>
                                    <span>Tipo: <b>{maquinaSel.tipo_pos || 'generic'}</b></span>
                                    <span>Área: <b>{maquinaSel.x_max}x{maquinaSel.y_max}mm</b></span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Validation */}
                    {result?.validacao && (
                        <div className="glass-card p-4" style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Validação de Ferramentas
                                </h3>
                                {result.validacao.maquina && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        Máquina: <b>{result.validacao.maquina.nome}</b>
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {(result.validacao.ferramentas_necessarias || []).map((f, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                        {f.ok
                                            ? <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                                            : <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                                        }
                                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{f.tool_code}</span>
                                        <span style={{ color: f.ok ? '#22c55e' : '#ef4444' }}>
                                            {f.ok ? f.ferramenta : 'Não cadastrada!'}
                                        </span>
                                    </div>
                                ))}
                                {(result.validacao.ferramentas_necessarias || []).length === 0 && (
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        Nenhuma operação de usinagem encontrada nas peças
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={gerar} disabled={gerando || maquinas.length === 0} className={Z.btn}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                            {gerando ? 'Gerando...' : 'Gerar G-code'}
                        </button>
                        {result?.ok && (
                            <button onClick={downloadGcode} className={Z.btn2}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                                <Download size={14} /> Baixar {result.extensao || '.nc'}
                            </button>
                        )}
                        {result?.ok && (
                            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                                {result.total_pecas} peça(s), {result.total_operacoes} operação(ões)
                                {result.onion_skin_ops > 0 && ` (${result.onion_skin_ops} onion-skin)`}
                            </span>
                        )}
                    </div>

                    {/* G-code preview */}
                    {result?.gcode && (
                        <div className="glass-card" style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                                Preview G-code ({result.gcode.split('\n').length} linhas)
                            </div>
                            <pre style={{
                                margin: 0, padding: 12, maxHeight: 500, overflowY: 'auto',
                                fontSize: 11, fontFamily: 'JetBrains Mono, Consolas, monospace',
                                lineHeight: 1.6, background: 'var(--bg-muted)',
                                color: 'var(--text-primary)', whiteSpace: 'pre',
                            }}>
                                {result.gcode.split('\n').map((line, i) => {
                                    let color = 'inherit';
                                    if (line.startsWith(';') || line.startsWith('(')) color = '#6b7280';
                                    else if (/^G0\b/.test(line)) color = '#3b82f6';
                                    else if (/^G1\b/.test(line)) color = '#22c55e';
                                    else if (/^T\d/.test(line)) color = '#f59e0b';
                                    else if (/^[SM]\d/.test(line)) color = '#8b5cf6';
                                    return (
                                        <span key={i}>
                                            <span style={{ color: '#9ca3af', userSelect: 'none', display: 'inline-block', width: 40, textAlign: 'right', marginRight: 12 }}>
                                                {i + 1}
                                            </span>
                                            <span style={{ color }}>{line}</span>{'\n'}
                                        </span>
                                    );
                                })}
                            </pre>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 6: CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════
function TabConfig({ notify, setEditorMode, setEditorTemplateId, initialSection, setConfigSection }) {
    const [activeSection, setActiveSection] = useState(initialSection || 'maquinas');
    const handleSection = (id) => { setActiveSection(id); setConfigSection?.(id); };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Section tabs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                    { id: 'maquinas', lb: 'Máquinas CNC', ic: Monitor },
                    { id: 'chapas', lb: 'Chapas', ic: Layers },
                    { id: 'usinagem', lb: 'Tipos de Usinagem', ic: PenTool },
                    { id: 'parametros', lb: 'Parâmetros Otimizador', ic: Settings },
                    { id: 'etiquetas', lb: 'Etiquetas', ic: TagIcon },
                    { id: 'retalhos', lb: 'Retalhos', ic: Package },
                ].map(s => {
                    const SIc = s.ic;
                    return (
                        <button key={s.id} onClick={() => handleSection(s.id)}
                            className={activeSection === s.id ? Z.btn : Z.btn2}
                            style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <SIc size={13} />
                            {s.lb}
                        </button>
                    );
                })}
            </div>

            {activeSection === 'maquinas' && <CfgMaquinas notify={notify} />}
            {activeSection === 'chapas' && <CfgChapas notify={notify} />}
            {activeSection === 'usinagem' && <CfgUsinagem notify={notify} />}
            {activeSection === 'parametros' && <CfgParametros notify={notify} />}
            {activeSection === 'etiquetas' && <CfgEtiquetas notify={notify} setEditorMode={setEditorMode} setEditorTemplateId={setEditorTemplateId} />}
            {activeSection === 'retalhos' && <CfgRetalhos notify={notify} />}
        </div>
    );
}

// Chapas CRUD
function CfgChapas({ notify }) {
    const [chapas, setChapas] = useState([]);
    const [modal, setModal] = useState(null);
    const load = () => api.get('/cnc/chapas').then(setChapas).catch(e => notify(e.error || 'Erro ao carregar chapas'));
    useEffect(() => { load(); }, []);

    const save = async (data) => {
        try {
            if (data.id) {
                await api.put(`/cnc/chapas/${data.id}`, data);
                notify('Chapa atualizada');
            } else {
                await api.post('/cnc/chapas', data);
                notify('Chapa criada');
            }
            setModal(null);
            load();
        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
    };

    const del = async (id) => {
        if (!confirm('Excluir esta chapa?')) return;
        await api.del(`/cnc/chapas/${id}`);
        notify('Chapa excluída');
        load();
    };

    return (
        <div className="glass-card p-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>Chapas Cadastradas</h3>
                <button onClick={() => setModal({ nome: '', material_code: '', espessura_nominal: 18, espessura_real: 18.5, comprimento: 2750, largura: 1850, refilo: 10, veio: 'sem_veio', preco: 0, kerf: 4, ativo: 1 })}
                    className={Z.btn} style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Nova Chapa
                </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                    <thead>
                        <tr>
                            {['Nome', 'Código', 'Esp.Nom', 'Esp.Real', 'Comp', 'Larg', 'Refilo', 'Kerf', 'Veio', 'Preço', 'Ações'].map(h => (
                                <th key={h} className={Z.th} style={{ padding: '6px 8px' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {chapas.map((c, i) => (
                            <tr key={c.id} style={{ background: i % 2 ? 'var(--bg-muted)' : 'transparent' }}>
                                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.nome}</td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 10 }}>{c.material_code}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{c.espessura_nominal}mm</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{c.espessura_real}mm</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{c.comprimento}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{c.largura}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{c.refilo}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{c.kerf ?? 4}mm</td>
                                <td style={{ padding: '6px 8px' }}>
                                    {c.veio === 'sem_veio' ? <span style={{ color: 'var(--text-muted)' }}>—</span> :
                                     c.veio === 'horizontal' ? <span style={{ color: '#3b82f6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>━━ Horiz.</span> :
                                     c.veio === 'vertical' ? <span style={{ color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>┃ Vert.</span> :
                                     c.veio}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>R${(c.preco || 0).toFixed(2)}</td>
                                <td style={{ padding: '6px 8px' }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button onClick={() => setModal(c)} className={Z.btn2} style={{ padding: '2px 6px' }}><Edit size={12} /></button>
                                        <button onClick={() => del(c.id)} className={Z.btnD} style={{ padding: '2px 6px' }}><Trash2 size={12} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modal && <ChapaModal data={modal} onSave={save} onClose={() => setModal(null)} />}
        </div>
    );
}

function ChapaModal({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...data });
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
    return (
        <Modal title={f.id ? 'Editar Chapa' : 'Nova Chapa'} close={onClose} w={480}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                    <label className={Z.lbl}>Nome</label>
                    <input value={f.nome} onChange={e => upd('nome', e.target.value)} className={Z.inp} />
                </div>
                <div>
                    <label className={Z.lbl}>Código Material</label>
                    <input value={f.material_code} onChange={e => upd('material_code', e.target.value)} className={Z.inp} />
                </div>
                <div>
                    <label className={Z.lbl}>Veio (sentido da fibra)</label>
                    <select value={f.veio} onChange={e => upd('veio', e.target.value)} className={Z.inp}>
                        <option value="sem_veio">Sem veio (permite rotação)</option>
                        <option value="horizontal">━ Horizontal (comprimento)</option>
                        <option value="vertical">┃ Vertical (largura)</option>
                    </select>
                </div>
                <div><label className={Z.lbl}>Esp. Nominal (mm)</label><input type="number" value={f.espessura_nominal} onChange={e => upd('espessura_nominal', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Esp. Real (mm)</label><input type="number" value={f.espessura_real} onChange={e => upd('espessura_real', Number(e.target.value))} className={Z.inp} step="0.1" /></div>
                <div><label className={Z.lbl}>Comprimento (mm)</label><input type="number" value={f.comprimento} onChange={e => upd('comprimento', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Largura (mm)</label><input type="number" value={f.largura} onChange={e => upd('largura', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Refilo (mm)</label><input type="number" value={f.refilo} onChange={e => upd('refilo', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Kerf - largura serra (mm)</label><input type="number" value={f.kerf ?? 4} onChange={e => upd('kerf', Number(e.target.value))} className={Z.inp} step="0.5" /></div>
                <div><label className={Z.lbl}>Preço (R$)</label><input type="number" value={f.preco} onChange={e => upd('preco', Number(e.target.value))} className={Z.inp} step="0.01" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                <button onClick={() => onSave(f)} className={Z.btn}>Salvar</button>
            </div>
        </Modal>
    );
}

// Ferramentas CRUD (vinculadas a máquina)
function CfgFerramentas({ maquinaId, notify }) {
    const [ferramentas, setFerramentas] = useState([]);
    const [modal, setModal] = useState(null);
    const load = useCallback(() => {
        const url = maquinaId ? `/cnc/ferramentas?maquina_id=${maquinaId}` : '/cnc/ferramentas';
        api.get(url).then(setFerramentas).catch(e => notify(e.error || 'Erro ao carregar ferramentas'));
    }, [maquinaId]);
    useEffect(() => { load(); }, [load]);

    const save = async (data) => {
        try {
            if (data.id) {
                await api.put(`/cnc/ferramentas/${data.id}`, data);
                notify('Ferramenta atualizada');
            } else {
                await api.post('/cnc/ferramentas', { ...data, maquina_id: maquinaId });
                notify('Ferramenta criada');
            }
            setModal(null);
            load();
        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
    };

    const del = async (id) => {
        if (!confirm('Excluir esta ferramenta?')) return;
        await api.del(`/cnc/ferramentas/${id}`);
        notify('Ferramenta excluída');
        load();
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wrench size={14} /> Magazine de Ferramentas ({ferramentas.length})
                </h4>
                <button onClick={() => setModal({ codigo: '', nome: '', tipo: 'broca', diametro: 0, profundidade_max: 30, velocidade_corte: 4000, rpm: 12000, tool_code: '', maquina_id: maquinaId, ativo: 1, doc: null, profundidade_extra: null, tipo_corte: 'broca', comprimento_util: 25 })}
                    className={Z.btn} style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={11} /> Ferramenta
                </button>
            </div>

            {ferramentas.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, background: 'var(--bg-muted)', borderRadius: 8 }}>
                    Nenhuma ferramenta cadastrada para esta máquina
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
                        <thead>
                            <tr>
                                {['Código', 'Nome', 'Tipo Corte', 'Ø mm', 'Tool Code', 'RPM', 'Vel.Corte', 'Prof.Max', 'DOC', 'Prof.Extra', 'Ações'].map(h => (
                                    <th key={h} className={Z.th} style={{ padding: '5px 6px', fontSize: 10 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {ferramentas.map((f, i) => (
                                <tr key={f.id} style={{ background: i % 2 ? 'var(--bg-muted)' : 'transparent' }}>
                                    <td style={{ padding: '5px 6px', fontWeight: 700, fontFamily: 'monospace' }}>{f.codigo}</td>
                                    <td style={{ padding: '5px 6px' }}>{f.nome}</td>
                                    <td style={{ padding: '5px 6px' }}>
                                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4,
                                            background: (f.tipo_corte || f.tipo || '').includes('fresa') ? '#dbeafe' :
                                                        (f.tipo_corte || f.tipo || '').includes('serra') ? '#fef3c7' : '#f3e8ff',
                                            color: (f.tipo_corte || f.tipo || '').includes('fresa') ? '#1d4ed8' :
                                                   (f.tipo_corte || f.tipo || '').includes('serra') ? '#92400e' : '#6b21a8',
                                            fontWeight: 600 }}>
                                            {(f.tipo_corte || f.tipo || 'broca').replace(/_/g, ' ')}
                                        </span>
                                    </td>
                                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>{f.diametro}</td>
                                    <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontSize: 10 }}>{f.tool_code}</td>
                                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>{f.rpm}</td>
                                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>{f.velocidade_corte}</td>
                                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>{f.profundidade_max}</td>
                                    <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 600, color: f.doc ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                        {f.doc ? `${f.doc}mm` : '—'}
                                    </td>
                                    <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 600, color: f.profundidade_extra ? '#e67e22' : 'var(--text-muted)' }}>
                                        {f.profundidade_extra ? `${f.profundidade_extra}mm` : '—'}
                                    </td>
                                    <td style={{ padding: '5px 6px' }}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => setModal(f)} className={Z.btn2} style={{ padding: '2px 6px' }}><Edit size={11} /></button>
                                            <button onClick={() => del(f.id)} className={Z.btnD} style={{ padding: '2px 6px' }}><Trash2 size={11} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && <FerramentaModal data={modal} onSave={save} onClose={() => setModal(null)} />}
        </div>
    );
}

function FerramentaModal({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...data });
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
    return (
        <Modal title={f.id ? 'Editar Ferramenta' : 'Nova Ferramenta'} close={onClose} w={600}>
            {/* Identificação */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Identificação</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div><label className={Z.lbl}>Código (T01...)</label><input value={f.codigo} onChange={e => upd('codigo', e.target.value)} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Nome</label><input value={f.nome} onChange={e => upd('nome', e.target.value)} className={Z.inp} /></div>
                <div>
                    <label className={Z.lbl}>Tipo de Corte</label>
                    <select value={f.tipo_corte || f.tipo || 'broca'} onChange={e => { upd('tipo_corte', e.target.value); upd('tipo', e.target.value.includes('fresa') ? 'fresa' : e.target.value.includes('serra') ? 'serra' : 'broca'); }} className={Z.inp}>
                        <option value="broca">Broca</option>
                        <option value="fresa_reta">Fresa Reta</option>
                        <option value="fresa_compressao">Fresa Compressão</option>
                        <option value="fresa_helicoidal">Fresa Helicoidal</option>
                        <option value="serra">Serra / Disco</option>
                    </select>
                </div>
                <div><label className={Z.lbl}>Diâmetro (mm)</label><input type="number" value={f.diametro} onChange={e => upd('diametro', Number(e.target.value))} className={Z.inp} step="0.1" /></div>
                <div><label className={Z.lbl}>Tool Code (plugin)</label><input value={f.tool_code} onChange={e => upd('tool_code', e.target.value)} className={Z.inp} placeholder="f_8mm_cavilha" /></div>
            </div>

            {/* Velocidades */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Velocidades</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div><label className={Z.lbl}>RPM</label><input type="number" value={f.rpm} onChange={e => upd('rpm', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Vel. Corte (mm/min)</label><input type="number" value={f.velocidade_corte} onChange={e => upd('velocidade_corte', Number(e.target.value))} className={Z.inp} /></div>
            </div>

            {/* Profundidades */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Profundidades</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                <div>
                    <label className={Z.lbl}>Prof. Max (mm)</label>
                    <input type="number" value={f.profundidade_max} onChange={e => upd('profundidade_max', Number(e.target.value))} className={Z.inp} step="0.5" />
                </div>
                <div>
                    <label className={Z.lbl}>DOC (mm/passada)</label>
                    <input type="number" value={f.doc ?? ''} onChange={e => upd('doc', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="0.5" placeholder="Auto" />
                </div>
                <div>
                    <label className={Z.lbl}>Prof. Extra (mm)</label>
                    <input type="number" value={f.profundidade_extra ?? ''} onChange={e => upd('profundidade_extra', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="0.05" placeholder="Máquina" />
                </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 14, padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                <b>DOC</b> = Profundidade máxima por passada. Deixe vazio para cortar em passada única.
                <b>Prof. Extra</b> = Profundidade além da espessura da chapa (garante corte completo). Deixe vazio para usar o valor padrão da máquina.
            </div>

            {/* Geometria */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Geometria</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
                <div>
                    <label className={Z.lbl}>Comp. Útil (mm)</label>
                    <input type="number" value={f.comprimento_util ?? 25} onChange={e => upd('comprimento_util', Number(e.target.value))} className={Z.inp} step="0.5" />
                </div>
                <div>
                    <label className={Z.lbl}>Nº de Cortes</label>
                    <input type="number" value={f.num_cortes ?? 2} onChange={e => upd('num_cortes', Number(e.target.value))} className={Z.inp} min="1" max="8" />
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                <button onClick={() => onSave(f)} className={Z.btn}>Salvar</button>
            </div>
        </Modal>
    );
}

// Parâmetros do Otimizador
function CfgParametros({ notify }) {
    const [cfg, setCfg] = useState(null);
    const load = () => api.get('/cnc/config').then(setCfg).catch(e => notify(e.error || 'Erro ao carregar configurações'));
    useEffect(() => { load(); }, []);

    const save = async () => {
        try {
            await api.put('/cnc/config', cfg);
            notify('Parâmetros salvos');
        } catch (err) { notify('Erro ao salvar'); }
    };

    if (!cfg) return <Spinner text="Carregando..." />;

    const upd = (k, v) => setCfg(p => ({ ...p, [k]: v }));

    return (
        <div className="glass-card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Parâmetros do Otimizador de Corte</h3>

            {/* Modo do otimizador */}
            <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Modo do Otimizador</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '6px 10px', background: 'var(--bg-body)', borderRadius: 6 }}>
                        <input type="checkbox" checked={(cfg.usar_guilhotina ?? 1) === 1} onChange={e => upd('usar_guilhotina', e.target.checked ? 1 : 0)} />
                        Modo Guilhotina (esquadrejadeira)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '6px 10px', background: 'var(--bg-body)', borderRadius: 6 }}>
                        <input type="checkbox" checked={(cfg.usar_retalhos ?? 1) === 1} onChange={e => upd('usar_retalhos', e.target.checked ? 1 : 0)} />
                        Usar retalhos existentes
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '6px 10px', background: 'var(--bg-body)', borderRadius: 6 }}>
                        <input type="checkbox" checked={(cfg.considerar_sobra ?? 1) === 1} onChange={e => upd('considerar_sobra', e.target.checked ? 1 : 0)} />
                        Gerar retalhos (considerar sobras)
                    </label>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                    O otimizador testa automaticamente os 3 algoritmos (Guilhotina, MaxRects, Shelf) e escolhe o melhor resultado.
                    Guilhotina: cortes ponta-a-ponta (para esquadrejadeira). MaxRects: posicionamento livre (CNC). Shelf: faixas horizontais (híbrido).
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div><label className={Z.lbl}>Espaço entre peças (mm)</label><input type="number" value={cfg.espaco_pecas} onChange={e => upd('espaco_pecas', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Kerf padrão - largura serra (mm)</label><input type="number" value={cfg.kerf_padrao ?? 4} onChange={e => upd('kerf_padrao', Number(e.target.value))} className={Z.inp} step="0.5" /></div>
                <div><label className={Z.lbl}>Iterações otimizador (R&R)</label><input type="number" value={cfg.iteracoes_otimizador ?? 300} onChange={e => upd('iteracoes_otimizador', Number(e.target.value))} className={Z.inp} min={0} max={2000} /></div>
                <div><label className={Z.lbl}>Peça mín. largura (mm)</label><input type="number" value={cfg.peca_min_largura} onChange={e => upd('peca_min_largura', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Peça mín. comprimento (mm)</label><input type="number" value={cfg.peca_min_comprimento} onChange={e => upd('peca_min_comprimento', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Sobra mín. largura (mm)</label><input type="number" value={cfg.sobra_min_largura} onChange={e => upd('sobra_min_largura', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Sobra mín. comprimento (mm)</label><input type="number" value={cfg.sobra_min_comprimento} onChange={e => upd('sobra_min_comprimento', Number(e.target.value))} className={Z.inp} /></div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                Iterações R&R: mais iterações = melhor resultado, porém mais lento. 300 é um bom balanço. 0 = desabilita meta-heurística.
            </div>
            <div style={{ marginTop: 16 }}>
                <button onClick={save} className={Z.btn}>Salvar Parâmetros</button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MÁQUINAS CNC — CRUD completo com pós-processador
// ═══════════════════════════════════════════════════════
function CfgMaquinas({ notify }) {
    const [maquinas, setMaquinas] = useState([]);
    const [modal, setModal] = useState(null);
    const [expandedId, setExpandedId] = useState(null);

    const load = () => api.get('/cnc/maquinas').then(setMaquinas).catch(e => notify(e.error || 'Erro ao carregar máquinas'));
    useEffect(() => { load(); }, []);

    const save = async (data) => {
        try {
            if (data.id) {
                await api.put(`/cnc/maquinas/${data.id}`, data);
                notify('Máquina atualizada');
            } else {
                await api.post('/cnc/maquinas', data);
                notify('Máquina criada');
            }
            setModal(null);
            load();
        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
    };

    const del = async (id) => {
        if (!confirm('Excluir esta máquina e desvincular as ferramentas?')) return;
        await api.del(`/cnc/maquinas/${id}`);
        notify('Máquina excluída');
        load();
    };

    const duplicar = async (id) => {
        try {
            const r = await api.post(`/cnc/maquinas/${id}/duplicar`);
            notify('Máquina duplicada');
            load();
        } catch (err) { notify('Erro ao duplicar'); }
    };

    const editMaquina = async (id) => {
        try {
            const full = await api.get(`/cnc/maquinas/${id}`);
            setModal(full);
        } catch (err) { notify('Erro ao carregar máquina'); }
    };

    return (
        <div className="glass-card p-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Monitor size={18} style={{ color: 'var(--primary)' }} />
                    Máquinas CNC ({maquinas.length})
                </h3>
                <button onClick={() => setModal(newMaquinaDefaults())}
                    className={Z.btn} style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Nova Máquina
                </button>
            </div>

            {maquinas.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Nenhuma máquina cadastrada. Adicione sua primeira CNC.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {maquinas.map(m => (
                        <div key={m.id} className="glass-card" style={{ border: m.padrao ? '2px solid var(--primary)' : '1px solid var(--border)', padding: 0, overflow: 'hidden' }}>
                            {/* Machine header */}
                            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
                                    <Cpu size={20} style={{ color: m.padrao ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {m.nome}
                                            {m.padrao ? (
                                                <span style={{ fontSize: 9, background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>PADRÃO</span>
                                            ) : null}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {m.fabricante} {m.modelo} • {m.tipo_pos} • {m.extensao_arquivo}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)' }}>
                                    <span>Área: <b>{m.x_max}x{m.y_max}</b>mm</span>
                                    <span>Ferramentas: <b>{m.total_ferramentas}</b></span>
                                    <span>RPM: <b>{m.rpm_padrao}</b></span>
                                </div>

                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                                        title="Ver ferramentas" className={Z.btn2} style={{ padding: '4px 10px', fontSize: 11 }}>
                                        <Wrench size={12} style={{ marginRight: 3 }} /> {m.total_ferramentas}
                                    </button>
                                    <button onClick={() => editMaquina(m.id)}
                                        title="Editar" className={Z.btn2} style={{ padding: '4px 10px', fontSize: 11 }}>
                                        <Edit size={12} />
                                    </button>
                                    <button onClick={() => duplicar(m.id)}
                                        title="Duplicar" className={Z.btn2} style={{ padding: '4px 10px', fontSize: 11 }}>
                                        <Copy size={12} />
                                    </button>
                                    <button onClick={() => del(m.id)}
                                        title="Excluir" className={Z.btnD} style={{ padding: '4px 10px', fontSize: 11 }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded: ferramentas */}
                            {expandedId === m.id && (
                                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                                    <div style={{ paddingTop: 12 }}>
                                        <CfgFerramentas maquinaId={m.id} notify={notify} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {modal && <MaquinaModal data={modal} onSave={save} onClose={() => setModal(null)} />}
        </div>
    );
}

function newMaquinaDefaults() {
    return {
        nome: '', fabricante: '', modelo: '', tipo_pos: 'generic', extensao_arquivo: '.nc',
        x_max: 2800, y_max: 1900, z_max: 200,
        gcode_header: '%\nG90 G54 G17',
        gcode_footer: 'G0 Z200.000\nM5\nM30\n%',
        z_seguro: 30, vel_vazio: 20000, vel_corte: 4000, vel_aproximacao: 8000,
        rpm_padrao: 12000, profundidade_extra: 0.20,
        coordenada_zero: 'canto_esq_inf', eixo_x_invertido: 0, eixo_y_invertido: 0,
        // G-Code v2
        z_origin: 'mesa', z_aproximacao: 2.0, direcao_corte: 'climb',
        usar_n_codes: 1, n_code_incremento: 10, dwell_spindle: 1.0,
        // G-Code v3 — Ramping, Lead-in, Velocidade mergulho, Ordenação
        usar_rampa: 1, rampa_angulo: 3.0, vel_mergulho: 1500,
        z_aproximacao_rapida: 5.0, ordenar_contornos: 'menor_primeiro',
        //
        exportar_lado_a: 1, exportar_lado_b: 1, exportar_furos: 1, exportar_rebaixos: 1, exportar_usinagens: 1,
        usar_ponto_decimal: 1, casas_decimais: 3,
        comentario_prefixo: ';', troca_ferramenta_cmd: 'M6', spindle_on_cmd: 'M3', spindle_off_cmd: 'M5',
        // Anti-arrasto
        usar_onion_skin: 1, onion_skin_espessura: 0.5, onion_skin_area_max: 500,
        usar_tabs: 0, tab_largura: 4, tab_altura: 1.5, tab_qtd: 2, tab_area_max: 800,
        usar_lead_in: 0, lead_in_tipo: 'arco', lead_in_raio: 5,
        feed_rate_pct_pequenas: 50, feed_rate_area_max: 500,
        padrao: 0, ativo: 1,
    };
}

function MaquinaModal({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...newMaquinaDefaults(), ...data });
    const [secao, setSecao] = useState('geral');
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

    const secoes = [
        { id: 'geral', lb: 'Geral' },
        { id: 'gcode', lb: 'G-code / Pós-processador' },
        { id: 'velocidades', lb: 'Velocidades' },
        { id: 'antiarrasto', lb: 'Anti-Arrasto' },
        { id: 'exportacao', lb: 'Exportação' },
        { id: 'formato', lb: 'Formato' },
    ];

    return (
        <Modal title={f.id ? `Editar Máquina: ${f.nome}` : 'Nova Máquina CNC'} close={onClose} w={680}>
            {/* Section pills */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {secoes.map(s => (
                    <button key={s.id} onClick={() => setSecao(s.id)}
                        style={{
                            padding: '4px 12px', fontSize: 11, fontWeight: secao === s.id ? 700 : 500,
                            borderRadius: 20, cursor: 'pointer', transition: 'all .15s',
                            background: secao === s.id ? 'var(--primary)' : 'var(--bg-muted)',
                            color: secao === s.id ? '#fff' : 'var(--text-muted)',
                            border: 'none',
                        }}>
                        {s.lb}
                    </button>
                ))}
            </div>

            {secao === 'geral' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: '1/-1' }}><label className={Z.lbl}>Nome da Máquina *</label><input value={f.nome} onChange={e => upd('nome', e.target.value)} className={Z.inp} placeholder="CNC Principal" /></div>
                    <div><label className={Z.lbl}>Fabricante</label><input value={f.fabricante} onChange={e => upd('fabricante', e.target.value)} className={Z.inp} placeholder="Biesse, SCM, Homag..." /></div>
                    <div><label className={Z.lbl}>Modelo</label><input value={f.modelo} onChange={e => upd('modelo', e.target.value)} className={Z.inp} placeholder="Rover A, Morbidelli..." /></div>
                    <div>
                        <label className={Z.lbl}>Tipo Pós-processador</label>
                        <select value={f.tipo_pos} onChange={e => upd('tipo_pos', e.target.value)} className={Z.inp}>
                            <option value="generic">Genérico</option>
                            <option value="biesse">Biesse</option>
                            <option value="scm">SCM</option>
                            <option value="homag">Homag</option>
                            <option value="weeke">Weeke</option>
                            <option value="morbidelli">Morbidelli</option>
                            <option value="custom">Personalizado</option>
                        </select>
                    </div>
                    <div><label className={Z.lbl}>Extensão Arquivo</label><input value={f.extensao_arquivo} onChange={e => upd('extensao_arquivo', e.target.value)} className={Z.inp} placeholder=".nc" /></div>
                    <div><label className={Z.lbl}>Área X (mm)</label><input type="number" value={f.x_max} onChange={e => upd('x_max', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Área Y (mm)</label><input type="number" value={f.y_max} onChange={e => upd('y_max', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Altura Z (mm)</label><input type="number" value={f.z_max} onChange={e => upd('z_max', Number(e.target.value))} className={Z.inp} /></div>
                    <div>
                        <label className={Z.lbl}>Coordenada Zero XY</label>
                        <select value={f.coordenada_zero} onChange={e => upd('coordenada_zero', e.target.value)} className={Z.inp}>
                            <option value="canto_esq_inf">Canto esq. inferior</option>
                            <option value="canto_dir_inf">Canto dir. inferior</option>
                            <option value="canto_esq_sup">Canto esq. superior</option>
                            <option value="canto_dir_sup">Canto dir. superior</option>
                            <option value="centro">Centro</option>
                        </select>
                    </div>
                    <div>
                        <label className={Z.lbl}>Origem Z (altura)</label>
                        <select value={f.z_origin || 'mesa'} onChange={e => upd('z_origin', e.target.value)} className={Z.inp}>
                            <option value="mesa">Z=0 na mesa de sacrifício</option>
                            <option value="material">Z=0 no topo do material</option>
                        </select>
                    </div>
                    <div style={{ gridColumn: '1/-1', padding: '6px 10px', background: '#3b82f615', borderRadius: 6, fontSize: 11, color: '#60a5fa', lineHeight: 1.5 }}>
                        {f.z_origin === 'material'
                            ? 'Z=0 no topo: profundidades serao negativas (ex: Z-15.7mm). Menos comum.'
                            : 'Z=0 na mesa: Z positivo = acima da mesa, corte passante = Z=0mm. Mais comum.'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.padrao === 1} onChange={e => upd('padrao', e.target.checked ? 1 : 0)} />
                            Máquina Padrão
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.eixo_x_invertido === 1} onChange={e => upd('eixo_x_invertido', e.target.checked ? 1 : 0)} />
                            Eixo X invertido
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.eixo_y_invertido === 1} onChange={e => upd('eixo_y_invertido', e.target.checked ? 1 : 0)} />
                            Eixo Y invertido
                        </label>
                    </div>
                </div>
            )}

            {secao === 'gcode' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label className={Z.lbl}>Instruções Iniciais (Header)</label>
                            <textarea value={f.gcode_header} onChange={e => upd('gcode_header', e.target.value)}
                                className={Z.inp} style={{ height: 130, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11 }} />
                        </div>
                        <div>
                            <label className={Z.lbl}>Instruções Finais (Footer)</label>
                            <textarea value={f.gcode_footer} onChange={e => upd('gcode_footer', e.target.value)}
                                className={Z.inp} style={{ height: 130, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11 }} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <div><label className={Z.lbl}>Cmd Troca Ferramenta</label><input value={f.troca_ferramenta_cmd} onChange={e => upd('troca_ferramenta_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Cmd Spindle ON</label><input value={f.spindle_on_cmd} onChange={e => upd('spindle_on_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Cmd Spindle OFF</label><input value={f.spindle_off_cmd} onChange={e => upd('spindle_off_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Prefixo Comentário</label><input value={f.comentario_prefixo} onChange={e => upd('comentario_prefixo', e.target.value)} className={Z.inp} /></div>
                    </div>
                </div>
            )}

            {secao === 'velocidades' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label className={Z.lbl}>Z Seguro (mm)</label><input type="number" value={f.z_seguro} onChange={e => upd('z_seguro', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>RPM Padrão</label><input type="number" value={f.rpm_padrao} onChange={e => upd('rpm_padrao', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Vel. Vazio (mm/min)</label><input type="number" value={f.vel_vazio} onChange={e => upd('vel_vazio', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Vel. Corte (mm/min)</label><input type="number" value={f.vel_corte} onChange={e => upd('vel_corte', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Vel. Aproximação (mm/min)</label><input type="number" value={f.vel_aproximacao} onChange={e => upd('vel_aproximacao', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Prof. Extra (mm)</label><input type="number" value={f.profundidade_extra} onChange={e => upd('profundidade_extra', Number(e.target.value))} className={Z.inp} step="0.01" /></div>
                    <div><label className={Z.lbl}>Z Aproximação (mm acima)</label><input type="number" value={f.z_aproximacao ?? 2} onChange={e => upd('z_aproximacao', Number(e.target.value))} className={Z.inp} step="0.5" min="0.5" /></div>
                    <div><label className={Z.lbl}>Dwell Spindle (s)</label><input type="number" value={f.dwell_spindle ?? 1} onChange={e => upd('dwell_spindle', Number(e.target.value))} className={Z.inp} step="0.5" min="0" /></div>
                </div>
            )}

            {secao === 'antiarrasto' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        Estratégias para prevenir arrasto e deslocamento de peças pequenas durante o corte CNC.
                    </p>

                    {/* Direção de Corte */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Direção de Corte (Contorno Externo)</div>
                        <select value={f.direcao_corte || 'climb'} onChange={e => upd('direcao_corte', e.target.value)} className={Z.inp}>
                            <option value="climb">Climb Milling (CW) — Melhor acabamento em MDF</option>
                            <option value="convencional">Convencional (CCW) — Mais seguro com backlash</option>
                        </select>
                    </div>

                    {/* Onion-Skin */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            <input type="checkbox" checked={(f.usar_onion_skin ?? 1) === 1} onChange={e => upd('usar_onion_skin', e.target.checked ? 1 : 0)} />
                            Onion-Skin (2 passes de profundidade)
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Corta 95% da profundidade em todas as peças primeiro, depois volta e corta os últimos milímetros com velocidade reduzida. Mantém a chapa inteira durante o passe pesado.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Espessura skin (mm)</label><input type="number" value={f.onion_skin_espessura ?? 0.5} onChange={e => upd('onion_skin_espessura', Number(e.target.value))} className={Z.inp} step="0.1" min="0.1" max="3" /></div>
                            <div><label className={Z.lbl}>Área máx. para onion (cm²)</label><input type="number" value={f.onion_skin_area_max ?? 500} onChange={e => upd('onion_skin_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            <input type="checkbox" checked={(f.usar_tabs ?? 0) === 1} onChange={e => upd('usar_tabs', e.target.checked ? 1 : 0)} />
                            Tabs / Micro-juntas
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Deixa pequenas pontes de material que seguram fisicamente a peça. Precisam ser lixadas depois do corte.
                            <br /><span style={{ color: 'var(--warning)', fontWeight: 600 }}>Aviso: Nao recomendado para MDF melaminico -- as tabs podem quebrar a melamina ao serem removidas.</span>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Largura tab (mm)</label><input type="number" value={f.tab_largura ?? 4} onChange={e => upd('tab_largura', Number(e.target.value))} className={Z.inp} step="0.5" /></div>
                            <div><label className={Z.lbl}>Altura tab (mm)</label><input type="number" value={f.tab_altura ?? 1.5} onChange={e => upd('tab_altura', Number(e.target.value))} className={Z.inp} step="0.1" /></div>
                            <div><label className={Z.lbl}>Qtd tabs/peça</label><input type="number" value={f.tab_qtd ?? 2} onChange={e => upd('tab_qtd', Number(e.target.value))} className={Z.inp} min={1} max={8} /></div>
                            <div><label className={Z.lbl}>Área máx. (cm²)</label><input type="number" value={f.tab_area_max ?? 800} onChange={e => upd('tab_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>

                    {/* Lead-in */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            <input type="checkbox" checked={(f.usar_lead_in ?? 1) === 1} onChange={e => upd('usar_lead_in', e.target.checked ? 1 : 0)} />
                            Lead-in / Lead-out (entrada em arco)
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Nunca mergulha direto na linha de corte — entra pela área de desperdício com arco tangente.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                                <label className={Z.lbl}>Tipo lead-in</label>
                                <select value={f.lead_in_tipo || 'arco'} onChange={e => upd('lead_in_tipo', e.target.value)} className={Z.inp}>
                                    <option value="arco">Arco (G2/G3)</option>
                                    <option value="linear">Linear</option>
                                </select>
                            </div>
                            <div><label className={Z.lbl}>Raio lead-in (mm)</label><input type="number" value={f.lead_in_raio ?? 5} onChange={e => upd('lead_in_raio', Number(e.target.value))} className={Z.inp} step="0.5" /></div>
                        </div>
                    </div>

                    {/* Ramping */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            <input type="checkbox" checked={(f.usar_rampa ?? 1) === 1} onChange={e => upd('usar_rampa', e.target.checked ? 1 : 0)} />
                            Entrada em Rampa (Ramp Entry)
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Em vez de mergulhar (plunge) direto no material, a fresa desce em ângulo ao longo da trajetória.
                            Preserva a vida útil da ferramenta e evita marcas de entrada no acabamento.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Ângulo da rampa (°)</label><input type="number" value={f.rampa_angulo ?? 3} onChange={e => upd('rampa_angulo', Number(e.target.value))} className={Z.inp} step="0.5" min="1" max="15" /></div>
                            <div><label className={Z.lbl}>Vel. Mergulho (mm/min)</label><input type="number" value={f.vel_mergulho ?? 1500} onChange={e => upd('vel_mergulho', Number(e.target.value))} className={Z.inp} step="100" min="100" /></div>
                        </div>
                    </div>

                    {/* Ordenação de Contornos */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ordenação de Contornos (Fixação)</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Define a ordem de corte dos contornos das peças. O algoritmo calcula um <b>Índice de Risco de Vácuo</b>
                            combinando a área da peça (60%) e a distância das bordas da chapa (40%).
                        </p>
                        <select value={f.ordenar_contornos || 'menor_primeiro'} onChange={e => upd('ordenar_contornos', e.target.value)} className={Z.inp}>
                            <option value="menor_primeiro">Menor primeiro (+ risco de vácuo) — Recomendado</option>
                            <option value="maior_primeiro">Maior primeiro</option>
                            <option value="proximidade">Proximidade (menor G0) — Menos trocas de posição</option>
                        </select>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 8 }}>
                            <div><label className={Z.lbl}>Z Aproximação Rápida (mm acima - entre ops próximas)</label><input type="number" value={f.z_aproximacao_rapida ?? 5} onChange={e => upd('z_aproximacao_rapida', Number(e.target.value))} className={Z.inp} step="1" min="2" /></div>
                        </div>
                    </div>

                    {/* Feed Rate Reduction */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Redução de Feed Rate</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Reduz a velocidade de corte para peças pequenas, diminuindo a força lateral que causa arrasto.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Feed rate peças pequenas (%)</label><input type="number" value={f.feed_rate_pct_pequenas ?? 50} onChange={e => upd('feed_rate_pct_pequenas', Number(e.target.value))} className={Z.inp} min={10} max={100} /></div>
                            <div><label className={Z.lbl}>Área máx. p/ redução (cm²)</label><input type="number" value={f.feed_rate_area_max ?? 500} onChange={e => upd('feed_rate_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>
                </div>
            )}

            {secao === 'exportacao' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        Selecione quais tipos de operações serão exportados no G-code:
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                            ['exportar_lado_a', 'Exportar Lado A'],
                            ['exportar_lado_b', 'Exportar Lado B'],
                            ['exportar_furos', 'Exportar Furos'],
                            ['exportar_rebaixos', 'Exportar Rebaixos'],
                            ['exportar_usinagens', 'Exportar Usinagens'],
                        ].map(([k, lb]) => (
                            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                                <input type="checkbox" checked={f[k] === 1} onChange={e => upd(k, e.target.checked ? 1 : 0)} />
                                {lb}
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {secao === 'formato' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1/-1' }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.usar_ponto_decimal === 1} onChange={e => upd('usar_ponto_decimal', e.target.checked ? 1 : 0)} />
                            Usar ponto decimal (senão vírgula)
                        </label>
                    </div>
                    <div><label className={Z.lbl}>Casas Decimais</label><input type="number" value={f.casas_decimais} onChange={e => upd('casas_decimais', Number(e.target.value))} className={Z.inp} min={0} max={6} /></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1/-1' }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={(f.usar_n_codes ?? 1) === 1} onChange={e => upd('usar_n_codes', e.target.checked ? 1 : 0)} />
                            Numeração de linhas (N-codes)
                        </label>
                    </div>
                    {(f.usar_n_codes ?? 1) === 1 && (
                        <div><label className={Z.lbl}>Incremento N</label><input type="number" value={f.n_code_incremento ?? 10} onChange={e => upd('n_code_incremento', Number(e.target.value))} className={Z.inp} min={1} max={100} /></div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                <button onClick={() => onSave(f)} disabled={!f.nome} className={Z.btn}>
                    {f.id ? 'Salvar Alterações' : 'Criar Máquina'}
                </button>
            </div>
        </Modal>
    );
}

// ═══════════════════════════════════════════════════════
// TIPOS DE USINAGEM — Gerenciamento de prioridades/fases
// ═══════════════════════════════════════════════════════
function CfgUsinagem({ notify }) {
    const [tipos, setTipos] = useState([]);
    const [modal, setModal] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = () => {
        setLoading(true);
        api.get('/cnc/usinagem-tipos').then(d => { setTipos(d); setLoading(false); }).catch(() => setLoading(false));
    };
    useEffect(() => { load(); }, []);

    const save = async (data) => {
        try {
            if (data.id) {
                await api.put(`/cnc/usinagem-tipos/${data.id}`, data);
                notify('Tipo de usinagem atualizado');
            } else {
                await api.post('/cnc/usinagem-tipos', data);
                notify('Tipo de usinagem criado');
            }
            setModal(null);
            load();
        } catch (err) { notify('Erro: ' + (err.error || err.message), 'error'); }
    };

    const del = async (id) => {
        if (!confirm('Excluir este tipo de usinagem?')) return;
        await api.del(`/cnc/usinagem-tipos/${id}`);
        notify('Tipo excluído');
        load();
    };

    const moverPrioridade = async (tipo, dir) => {
        const newPri = tipo.prioridade + dir;
        if (newPri < 0) return;
        try {
            await api.put(`/cnc/usinagem-tipos/${tipo.id}`, { ...tipo, prioridade: newPri });
            load();
        } catch (err) { notify('Erro ao reordenar', 'error'); }
    };

    const faseLabel = (f) => {
        if (f === 'interna') return { text: 'Interna', bg: '#dbeafe', color: '#1d4ed8' };
        if (f === 'contorno') return { text: 'Contorno', bg: '#fef3c7', color: '#92400e' };
        return { text: f || '?', bg: '#f3e8ff', color: '#6b21a8' };
    };

    const sorted = [...tipos].sort((a, b) => (a.prioridade || 0) - (b.prioridade || 0));

    return (
        <div className="glass-card p-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PenTool size={18} style={{ color: 'var(--primary)' }} />
                    Tipos de Usinagem ({tipos.length})
                </h3>
                <button onClick={() => setModal({ codigo: '', nome: '', categoria_match: '', diametro_match: null, prioridade: tipos.length, fase: 'interna', tool_code_padrao: '', profundidade_padrao: null, largura_padrao: null, ativo: 1 })}
                    className={Z.btn} style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Novo Tipo
                </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 8, lineHeight: 1.5 }}>
                Define como cada operação de usinagem do plugin é classificada e priorizada.
                <b> Prioridade menor = executa primeiro.</b> Fase <b>Interna</b> = furos/rasgos (antes do contorno). Fase <b>Contorno</b> = corte da peça (depois de tudo).
                O <b>Categoria Match</b> mapeia categorias do JSON do plugin para este tipo.
            </div>

            {loading ? <Spinner text="Carregando tipos..." /> : sorted.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Nenhum tipo cadastrado. Os tipos padrão serão criados automaticamente ao reiniciar o servidor.
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
                        <thead>
                            <tr>
                                {['Prio', '↕', 'Código', 'Nome', 'Fase', 'Categoria Match', 'Ø Match', 'Tool Padrão', 'Prof.', 'Larg.', 'Ações'].map(h => (
                                    <th key={h} className={Z.th} style={{ padding: '5px 6px', fontSize: 10 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((t, i) => {
                                const fl = faseLabel(t.fase);
                                return (
                                    <tr key={t.id} style={{ background: i % 2 ? 'var(--bg-muted)' : 'transparent', opacity: t.ativo ? 1 : 0.4 }}>
                                        <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 800, fontSize: 13, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                            {t.prioridade}
                                        </td>
                                        <td style={{ padding: '2px 2px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <button onClick={() => moverPrioridade(t, -1)} className={Z.btn2}
                                                    style={{ padding: '1px 4px', fontSize: 9, lineHeight: 1 }}
                                                    disabled={t.prioridade === 0} title="Subir prioridade">
                                                    <ChevronUp size={10} />
                                                </button>
                                                <button onClick={() => moverPrioridade(t, 1)} className={Z.btn2}
                                                    style={{ padding: '1px 4px', fontSize: 9, lineHeight: 1 }}
                                                    title="Descer prioridade">
                                                    <ChevronDown size={10} />
                                                </button>
                                            </div>
                                        </td>
                                        <td style={{ padding: '5px 6px', fontWeight: 700, fontFamily: 'monospace', fontSize: 10 }}>{t.codigo}</td>
                                        <td style={{ padding: '5px 6px', fontWeight: 600 }}>{t.nome}</td>
                                        <td style={{ padding: '5px 6px' }}>
                                            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: fl.bg, color: fl.color, fontWeight: 600 }}>
                                                {fl.text}
                                            </span>
                                        </td>
                                        <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontSize: 9, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                            title={t.categoria_match}>
                                            {t.categoria_match || '—'}
                                        </td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                            {t.diametro_match != null ? `${t.diametro_match}mm` : '—'}
                                        </td>
                                        <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontSize: 10 }}>{t.tool_code_padrao || '—'}</td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>{t.profundidade_padrao != null ? `${t.profundidade_padrao}mm` : '—'}</td>
                                        <td style={{ padding: '5px 6px', textAlign: 'center' }}>{t.largura_padrao != null ? `${t.largura_padrao}mm` : '—'}</td>
                                        <td style={{ padding: '5px 6px' }}>
                                            <div style={{ display: 'flex', gap: 3 }}>
                                                <button onClick={() => setModal(t)} className={Z.btn2} style={{ padding: '2px 6px' }}><Edit size={11} /></button>
                                                <button onClick={() => del(t.id)} className={Z.btnD} style={{ padding: '2px 6px' }}><Trash2 size={11} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && <UsinagemTipoModal data={modal} onSave={save} onClose={() => setModal(null)} />}
        </div>
    );
}

function UsinagemTipoModal({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...data });
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
    return (
        <Modal title={f.id ? 'Editar Tipo de Usinagem' : 'Novo Tipo de Usinagem'} close={onClose} w={560}>
            {/* Identificação */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Identificação</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                    <label className={Z.lbl}>Código (único)</label>
                    <input value={f.codigo} onChange={e => upd('codigo', e.target.value)} className={Z.inp} placeholder="rasgo_fundo" />
                </div>
                <div>
                    <label className={Z.lbl}>Nome</label>
                    <input value={f.nome} onChange={e => upd('nome', e.target.value)} className={Z.inp} placeholder="Rasgo de Fundo" />
                </div>
            </div>

            {/* Classificação */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Classificação</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                    <label className={Z.lbl}>Prioridade</label>
                    <input type="number" value={f.prioridade ?? 5} onChange={e => upd('prioridade', Number(e.target.value))} className={Z.inp} min="0" max="20" />
                </div>
                <div>
                    <label className={Z.lbl}>Fase</label>
                    <select value={f.fase || 'interna'} onChange={e => upd('fase', e.target.value)} className={Z.inp}>
                        <option value="interna">Interna (furos/rasgos)</option>
                        <option value="contorno">Contorno (corte peça)</option>
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={f.ativo !== 0} onChange={e => upd('ativo', e.target.checked ? 1 : 0)} />
                        Ativo
                    </label>
                </div>
            </div>

            {/* Matching */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Match (mapeamento do plugin)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 8 }}>
                <div>
                    <label className={Z.lbl}>Categoria Match (CSV)</label>
                    <input value={f.categoria_match || ''} onChange={e => upd('categoria_match', e.target.value)} className={Z.inp}
                        placeholder="hole,transfer_hole" />
                </div>
                <div>
                    <label className={Z.lbl}>Diâmetro Match (mm)</label>
                    <input type="number" value={f.diametro_match ?? ''} onChange={e => upd('diametro_match', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp}
                        step="0.5" placeholder="Qualquer" />
                </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 14, padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                <b>Categoria Match</b>: lista de categorias (separadas por vírgula) do JSON do plugin que mapeiam para este tipo.
                Ex: <code>hole,transfer_hole</code>. <b>Diâmetro Match</b>: se preenchido, só mapeia operações com este diâmetro (±1mm).
            </div>

            {/* Padrões */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Valores Padrão</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 6 }}>
                <div>
                    <label className={Z.lbl}>Tool Code Padrão</label>
                    <input value={f.tool_code_padrao || ''} onChange={e => upd('tool_code_padrao', e.target.value)} className={Z.inp}
                        placeholder="f_8mm_cavilha" />
                </div>
                <div>
                    <label className={Z.lbl}>Prof. Padrão (mm)</label>
                    <input type="number" value={f.profundidade_padrao ?? ''} onChange={e => upd('profundidade_padrao', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp}
                        step="0.5" placeholder="Do JSON" />
                </div>
                <div>
                    <label className={Z.lbl}>Largura Padrão (mm)</label>
                    <input type="number" value={f.largura_padrao ?? ''} onChange={e => upd('largura_padrao', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp}
                        step="0.5" placeholder="Do JSON" />
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                <button onClick={() => onSave(f)} className={Z.btn}>Salvar</button>
            </div>
        </Modal>
    );
}

// Retalhos
function CfgRetalhos({ notify }) {
    const [retalhos, setRetalhos] = useState([]);
    const load = () => api.get('/cnc/retalhos').then(setRetalhos).catch(e => notify(e.error || 'Erro ao carregar retalhos'));
    useEffect(() => { load(); }, []);

    const del = async (id) => {
        if (!confirm('Marcar este retalho como indisponível?')) return;
        await api.del(`/cnc/retalhos/${id}`);
        notify('Retalho removido');
        load();
    };

    return (
        <div className="glass-card p-4">
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Retalhos Disponíveis</h3>
            {retalhos.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Nenhum retalho disponível. Retalhos são gerados automaticamente ao otimizar cortes.
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                        <thead>
                            <tr>
                                {['Nome', 'Material', 'Espessura', 'Comprimento', 'Largura', 'Origem', 'Data', 'Ações'].map(h => (
                                    <th key={h} className={Z.th} style={{ padding: '6px 8px' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {retalhos.map((r, i) => (
                                <tr key={r.id} style={{ background: i % 2 ? 'var(--bg-muted)' : 'transparent' }}>
                                    <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.nome}</td>
                                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 10 }}>{r.material_code}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.espessura_real}mm</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.comprimento}mm</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.largura}mm</td>
                                    <td style={{ padding: '6px 8px' }}>Lote #{r.origem_lote || '-'}</td>
                                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        {r.criado_em ? new Date(r.criado_em).toLocaleDateString('pt-BR') : '-'}
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>
                                        <button onClick={() => del(r.id)} className={Z.btnD} style={{ padding: '2px 6px' }}>
                                            <Trash2 size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
