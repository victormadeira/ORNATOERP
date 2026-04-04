import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar } from '../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../components/EditorEtiquetas';
import PecaViewer3D from '../components/PecaViewer3D';
import PecaEditor from '../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../components/ToolpathSimulator';
import GcodeSimWrapper from '../components/GcodeSimWrapper';
import SlidePanel from '../components/SlidePanel';
import ToolbarDropdown from '../components/ToolbarDropdown';
import { Search as SearchIcon, Grid, List, LayoutGrid, Tv } from 'lucide-react';
import useWebSocket from '../hooks/useWebSocket';

// Nível 1 — sempre visível
const TABS_MAIN = [
    { id: 'importar', lb: 'Importar', ic: Upload },
    { id: 'lotes', lb: 'Lotes', ic: Package },
    { id: 'dashboard', lb: 'Dashboard', ic: BarChart3 },
    { id: 'config', lb: 'Configurações', ic: Settings },
];

// Nível 2 — só aparece com lote selecionado
const TABS_LOTE = [
    { id: 'pecas', lb: 'Peças', ic: Layers, step: 1 },
    { id: 'plano', lb: 'Plano de Corte', ic: Scissors, step: 2 },
    { id: 'gcode', lb: 'G-code / CNC', ic: Cpu, step: 3 },
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
    const [toolAlerts, setToolAlerts] = useState([]);
    const [materialAlerts, setMaterialAlerts] = useState([]);
    const [materialAlertsDismissed, setMaterialAlertsDismissed] = useState(false);
    const [sugestoes, setSugestoes] = useState([]);
    const [sugestoesOpen, setSugestoesOpen] = useState(false);

    // WebSocket real-time (#23) + Push Notifications (#35)
    const { connected: wsConnected } = useWebSocket(useCallback((msg) => {
        if (msg.type === 'fila_update' || msg.type === 'fila_remove') {
            if (showFila) loadFila?.();
        }
        if (msg.type === 'conferencia_update') {
            if (showConferencia) loadConferencia?.();
        }
        if (msg.type === 'gcode_complete' && msg.data?.message) {
            notify?.(msg.data.message, 'success');
            // Browser push notification (#35)
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Ornato CNC', { body: msg.data.message, icon: '/favicon.ico' });
            }
        }
        if (msg.type === 'entrega_update' && msg.data) {
            notify?.(`Entrega: ${msg.data.tipo} — Lote #${msg.data.lote_id}`, 'success');
        }
    }, []));

    const loadLotes = useCallback(() => {
        api.get('/cnc/lotes').then(setLotes).catch(e => notify(e.error || 'Erro ao carregar lotes'));
    }, []);

    const loadToolAlerts = useCallback(() => {
        api.get('/cnc/ferramentas/alertas').then(setToolAlerts).catch(() => {});
    }, []);

    useEffect(() => { loadLotes(); loadToolAlerts(); }, [loadLotes, loadToolAlerts]);

    // Abrir lote = entrar no workspace do lote
    const abrirLote = useCallback((lote, aba = 'pecas') => {
        setLoteAtual(lote);
        setTab(aba);
        setMaterialAlertsDismissed(false);
        // Fetch material alerts for this lote
        api.get(`/cnc/alertas-material?lote_id=${lote.id}`).then(r => {
            const alerts = (r.alertas || []).filter(a => a.chapas_necessarias > (a.estoque_chapas + a.retalhos_disponiveis));
            setMaterialAlerts(alerts);
        }).catch(() => setMaterialAlerts([]));
        // Fetch grouping suggestions
        api.get(`/cnc/sugestao-agrupamento/${lote.id}`).then(r => {
            setSugestoes(r.sugestoes || []);
        }).catch(() => setSugestoes([]));
    }, []);

    // Voltar para lista de lotes
    const voltarLotes = useCallback(() => {
        setLoteAtual(null);
        setTab('lotes');
        setMaterialAlerts([]);
        setSugestoes([]);
        setSugestoesOpen(false);
    }, []);

    // Determina se estamos no nível 2 (dentro de um lote)
    const isInsideLote = loteAtual && ['pecas', 'plano', 'etiquetas', 'gcode'].includes(tab);

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
            <PageHeader icon={Cpu} title="Produção CNC" subtitle="Importar JSON, otimizar corte, etiquetas e G-code" />

            {/* Alerta global de desgaste de ferramentas */}
            {toolAlerts.length > 0 && (
                <div className="alert-banner alert-banner-error" style={{ marginBottom: 12 }}>
                    <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ flex: 1 }}>
                        <b>{toolAlerts.length} ferramenta(s)</b> com desgaste acima de 80%:
                        {' '}{toolAlerts.slice(0, 3).map(t => `${t.nome} (${t.percentage}%)`).join(', ')}
                        {toolAlerts.length > 3 && ` e mais ${toolAlerts.length - 3}...`}
                    </span>
                    <button onClick={() => { setTab('config'); setConfigSection('maquinas'); }}
                        className="btn-secondary" style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap', minHeight: 0 }}>
                        Ver Ferramentas
                    </button>
                </div>
            )}

            {/* Nível 1 — Tab bar principal */}
            <TabBar
                tabs={TABS_MAIN.map(t => ({ id: t.id, label: t.lb, icon: t.ic }))}
                active={!isInsideLote ? tab : null}
                onChange={(id) => { setTab(id); if (id !== 'config') setLoteAtual(null); }}
            />

            {/* Nível 2 — Workspace do lote (aparece só com lote aberto) */}
            {isInsideLote && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 0,
                    borderBottom: '2px solid var(--border)', marginBottom: 20,
                    background: 'var(--bg-muted)',
                    borderRadius: '8px 8px 0 0',
                }}>
                    {/* Botão voltar + nome do lote */}
                    <button onClick={voltarLotes}
                        className="btn-secondary" style={{
                            borderRadius: '8px 0 0 0', border: 'none', borderRight: '1px solid var(--border)',
                            padding: '8px 14px', fontSize: 12, gap: 6, minHeight: 0,
                        }}>
                        <ArrowLeft size={14} />
                        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {loteAtual.nome || `Lote #${loteAtual.id}`}
                        </span>
                    </button>

                    {/* Tabs do lote com step numbers */}
                    {TABS_LOTE.map((t, idx) => {
                        const active = tab === t.id;
                        const I = t.ic;
                        const stepIdx = TABS_LOTE.findIndex(x => x.id === tab);
                        const isDone = idx < stepIdx;
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                                    fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                                    color: active ? 'var(--primary)' : isDone ? '#22c55e' : 'var(--text-muted)',
                                    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                                    background: 'none', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid',
                                    marginBottom: -2, whiteSpace: 'nowrap', transition: 'all .15s',
                                    fontFamily: 'var(--font-sans)',
                                }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                                    background: active ? 'var(--primary)' : isDone ? '#22c55e' : 'transparent',
                                    color: (active || isDone) ? '#fff' : 'var(--text-muted)',
                                    border: `1.5px solid ${active ? 'var(--primary)' : isDone ? '#22c55e' : 'var(--border)'}`,
                                    flexShrink: 0, transition: 'all .2s',
                                }}>{isDone ? '\u2713' : t.step}</span>
                                <I size={13} />
                                <span>{t.lb}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Material stock alert banner */}
            {isInsideLote && materialAlerts.length > 0 && !materialAlertsDismissed && (
                <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {materialAlerts.map((a, i) => {
                        const noStock = a.estoque_chapas === 0 && a.retalhos_disponiveis === 0;
                        return (
                            <div key={i} className={`alert-banner ${noStock ? 'alert-banner-error' : 'alert-banner-warning'}`}>
                                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                                <span style={{ flex: 1 }}>
                                    <b>{a.material || a.material_code}</b>
                                    {' — precisa de '}<b>{a.chapas_necessarias}</b>{' chapa(s), '}
                                    {a.estoque_chapas > 0
                                        ? <>estoque: <b>{a.estoque_chapas}</b></>
                                        : <span style={{ fontWeight: 700 }}>sem estoque</span>}
                                    {a.retalhos_disponiveis > 0 && <>, retalhos: <b>{a.retalhos_disponiveis}</b></>}
                                    {noStock && <span style={{ fontWeight: 700, marginLeft: 6 }}>MATERIAL INDISPONIVEL</span>}
                                </span>
                                {i === 0 && (
                                    <button onClick={() => setMaterialAlertsDismissed(true)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.6 }}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Grouping suggestions */}
            {isInsideLote && sugestoes.length > 0 && (
                <div className="glass-card" style={{ marginBottom: 12, overflow: 'hidden' }}>
                    <button onClick={() => setSugestoesOpen(!sugestoesOpen)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                            borderBottom: sugestoesOpen ? '1px solid var(--border)' : 'none',
                        }}>
                        <GitCompare size={14} style={{ color: '#8b5cf6' }} />
                        <span>Sugestoes de Agrupamento</span>
                        <span style={{ marginLeft: 4, fontSize: 10, color: '#8b5cf6', fontWeight: 700 }}>
                            {sugestoes.length} lote{sugestoes.length > 1 ? 's' : ''}
                        </span>
                        <ChevronDown size={13} style={{ marginLeft: 'auto', transition: 'transform .2s', transform: sugestoesOpen ? 'rotate(180deg)' : '' }} />
                    </button>
                    {sugestoesOpen && (
                        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                                Lotes que usam os mesmos materiais e podem ser otimizados juntos para reduzir desperdicio:
                            </p>
                            {sugestoes.map((s, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                                    background: 'var(--bg-muted)', borderRadius: 6, border: '1px solid var(--border)',
                                }}>
                                    <Package size={13} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s.lote_nome}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                            {s.pecas_count} peca(s) em comum
                                            {s.material_codes.length > 0 && ` — ${s.material_codes.join(', ')}`}
                                        </div>
                                    </div>
                                    {s.economia_estimada_pct > 0 && (
                                        <span style={{
                                            fontSize: 10, fontWeight: 700, color: '#16a34a',
                                            background: '#f0fdf4', padding: '2px 6px', borderRadius: 4,
                                            whiteSpace: 'nowrap',
                                        }}>
                                            -{s.economia_estimada_pct}% desperdicio
                                        </span>
                                    )}
                                    <span style={{
                                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                                        background: STATUS_COLORS[s.lote_status] || '#888', color: '#fff',
                                        fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap',
                                    }}>
                                        {s.lote_status}
                                    </span>
                                    <button onClick={() => abrirLote({ id: s.lote_id, nome: s.lote_nome }, 'plano')}
                                        style={{
                                            fontSize: 10, padding: '3px 8px', borderRadius: 4,
                                            border: '1px solid var(--border)', background: '#fff', cursor: 'pointer',
                                            color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap',
                                        }}>
                                        Abrir
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === 'importar' && !isInsideLote && <TabImportar lotes={lotes} loadLotes={loadLotes} notify={notify} setLoteAtual={abrirLote} setTab={setTab} />}
            {tab === 'lotes' && !isInsideLote && <TabLotes lotes={lotes} loadLotes={loadLotes} notify={notify} abrirLote={abrirLote} />}
            {tab === 'dashboard' && !isInsideLote && <TabDashboard notify={notify} />}
            {tab === 'pecas' && isInsideLote && <TabPecas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} setTab={setTab} />}
            {tab === 'plano' && isInsideLote && <TabPlano lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} loadLotes={loadLotes} setTab={setTab} />}
            {tab === 'etiquetas' && isInsideLote && <TabEtiquetas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />}
            {tab === 'gcode' && isInsideLote && <TabGcode lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />}
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
    const [lastImportedLote, setLastImportedLote] = useState(null);
    const [matCheck, setMatCheck] = useState(null); // { cadastrados, nao_cadastrados }
    const [matEdits, setMatEdits] = useState({}); // edits to suggested chapas
    const [checkingMats, setCheckingMats] = useState(false);
    const fileRef = useRef(null);

    const handleFile = (file) => {
        if (!file) return;
        const isDxf = file.name.toLowerCase().endsWith('.dxf');
        const isJson = file.name.toLowerCase().endsWith('.json');
        if (!isDxf && !isJson) {
            notify('Selecione um arquivo .json ou .dxf');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (isDxf) {
                // DXF import — send content to backend for parsing
                setJsonData({ _isDxf: true, dxfContent: e.target.result });
                setPreview({
                    cliente: '', projeto: '', codigo: '', vendedor: '',
                    totalPecas: '(será calculado)', totalModulos: '-',
                    materiais: [], modulos: [],
                    _isDxf: true, fileName: file.name,
                });
                setNome(file.name.replace(/\.dxf$/i, ''));
                return;
            }
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

                // Verificar materiais não cadastrados
                if (materiais.size > 0) {
                    const matList = [...materiais].map(mc => {
                        // Tentar extrair espessura do material_code
                        const m = mc.match(/_(\d+(?:\.\d+)?)_/);
                        return { material_code: mc, espessura: m ? parseFloat(m[1]) : 0 };
                    });
                    api.post('/cnc/chapas/verificar-materiais', { materiais: matList })
                        .then(result => {
                            if (result.nao_cadastrados?.length > 0) {
                                setMatCheck(result);
                                setMatEdits({});
                            } else {
                                setMatCheck(null);
                            }
                        })
                        .catch(() => {}); // silently ignore
                }
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
            let r;
            if (jsonData._isDxf) {
                r = await api.post('/cnc/lotes/importar-dxf', { dxfContent: jsonData.dxfContent, nome });
                if (r.warnings?.length) notify(`Avisos: ${r.warnings.join(', ')}`);
            } else {
                r = await api.post('/cnc/lotes/importar', { json: jsonData, nome });
            }
            notify(`Lote importado: ${r.total_pecas} peças`);
            setPreview(null);
            setJsonData(null);
            setNome('');
            setLastImportedLote(r);
            loadLotes();
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setImporting(false);
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
                    Arraste o arquivo JSON ou DXF, ou clique para selecionar
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    JSON (Plugin SketchUp) ou DXF (Promob, AutoCAD, etc.)
                </div>
                <input ref={fileRef} type="file" accept=".json,.dxf" style={{ display: 'none' }}
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
                    {/* ═══ MATERIAIS NÃO CADASTRADOS ═══ */}
                    {matCheck?.nao_cadastrados?.length > 0 && (
                        <div style={{
                            marginBottom: 16, padding: 12, borderRadius: 8,
                            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                                <AlertTriangle size={14} color="#f59e0b" />
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                                    {matCheck.nao_cadastrados.length} material(is) não cadastrado(s)
                                </span>
                                <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 'auto', fontWeight: 600 }}>
                                    Sem cadastrar, materiais diferentes serão otimizados juntos!
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {matCheck.nao_cadastrados.map((mat, i) => {
                                    const edit = matEdits[i] || mat.sugestao;
                                    const updateField = (k, v) => setMatEdits(prev => ({
                                        ...prev, [i]: { ...(prev[i] || mat.sugestao), [k]: v },
                                    }));
                                    return (
                                        <div key={mat.material_code} style={{
                                            padding: 10, background: 'var(--bg-card)', borderRadius: 6,
                                            border: '1px solid var(--border)',
                                        }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                                                {mat.material_code}
                                                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: 10 }}>
                                                    esp: {mat.espessura || '?'}mm
                                                </span>
                                            </div>
                                            {mat.fallback_chapa && (
                                                <div style={{ fontSize: 10, color: '#dc2626', marginBottom: 4, fontStyle: 'italic' }}>
                                                    Atualmente usando "{mat.fallback_chapa.nome}" por fallback — materiais misturados na otimização!
                                                </div>
                                            )}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
                                                <div>
                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Nome</label>
                                                    <input value={edit.nome} onChange={e => updateField('nome', e.target.value)}
                                                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Comp. (mm)</label>
                                                    <input type="number" value={edit.comprimento} onChange={e => updateField('comprimento', Number(e.target.value))}
                                                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Larg. (mm)</label>
                                                    <input type="number" value={edit.largura} onChange={e => updateField('largura', Number(e.target.value))}
                                                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }} />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Esp. Real</label>
                                                    <input type="number" value={edit.espessura_real} onChange={e => updateField('espessura_real', Number(e.target.value))}
                                                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }} step="0.1" />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Veio</label>
                                                    <select value={edit.veio} onChange={e => updateField('veio', e.target.value)}
                                                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }}>
                                                        <option value="sem_veio">Sem veio</option>
                                                        <option value="horizontal">━ Horizontal</option>
                                                        <option value="vertical">┃ Vertical</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Dir. Corte</label>
                                                    <select value={edit.direcao_corte} onChange={e => updateField('direcao_corte', e.target.value)}
                                                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }}>
                                                        <option value="herdar">Herdar (global)</option>
                                                        <option value="misto">Misto</option>
                                                        <option value="horizontal">Horizontal</option>
                                                        <option value="vertical">Vertical</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Kerf (mm)</label>
                                                    <input type="number" value={edit.kerf} onChange={e => updateField('kerf', Number(e.target.value))}
                                                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }} step="0.5" />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Preço (R$)</label>
                                                    <input type="number" value={edit.preco} onChange={e => updateField('preco', Number(e.target.value))}
                                                        className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }} step="0.01" />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                disabled={checkingMats}
                                onClick={async () => {
                                    setCheckingMats(true);
                                    try {
                                        const chapas = matCheck.nao_cadastrados.map((mat, i) => ({
                                            ...(matEdits[i] || mat.sugestao),
                                            material_code: mat.material_code,
                                            espessura_nominal: mat.espessura || (matEdits[i] || mat.sugestao).espessura_nominal,
                                        }));
                                        const r = await api.post('/cnc/chapas/bulk', { chapas });
                                        notify(`${r.total} chapa(s) cadastrada(s) com sucesso!`);
                                        setMatCheck(null);
                                        setMatEdits({});
                                    } catch (err) {
                                        notify('Erro: ' + (err.error || err.message));
                                    } finally {
                                        setCheckingMats(false);
                                    }
                                }}
                                className={Z.btn}
                                style={{ marginTop: 10, padding: '8px 20px', fontSize: 12, background: '#f59e0b', border: 'none' }}
                            >
                                {checkingMats ? 'Cadastrando...' : `Cadastrar ${matCheck.nao_cadastrados.length} Material(is)`}
                            </button>
                        </div>
                    )}

                    {matCheck?.cadastrados?.length > 0 && matCheck.cadastrados.some(c => c.match_type === 'fallback_espessura') && (
                        <div style={{
                            marginBottom: 12, padding: '8px 12px', borderRadius: 6,
                            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
                            fontSize: 11, color: '#1e40af',
                        }}>
                            <strong>Info:</strong> {matCheck.cadastrados.filter(c => c.match_type === 'fallback_espessura').length} material(is)
                            resolvido(s) por espessura (fallback), não por código exato.
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do lote"
                            className={Z.inp} style={{ flex: 1, minWidth: 200 }} />
                        <button onClick={doImport} disabled={importing} className={Z.btn} style={{ padding: '8px 24px' }}>
                            {importing ? 'Importando...' : 'Importar Lote'}
                        </button>
                        <button onClick={() => { setPreview(null); setJsonData(null); setMatCheck(null); }} className={Z.btn2} style={{ padding: '8px 16px' }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Next step prompt — shown after a successful import */}
            {lastImportedLote && (
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(19,121,240,0.08)', border: '1px solid rgba(19,121,240,0.25)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle2 size={16} color="var(--primary)" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            Lote importado com sucesso — {lastImportedLote.total_pecas} peças
                        </span>
                    </div>
                    <button onClick={() => setLoteAtual(lastImportedLote, 'pecas')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 24px', borderRadius: 8,
                            background: 'var(--primary)', color: '#fff',
                            border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 700,
                        }}>
                        Abrir Lote <ChevronRight size={16} />
                    </button>
                </div>
            )}

            {/* Resumo dos lotes existentes */}
            {lotes.length > 0 && !preview && (
                <div style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: 'var(--bg-muted)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        <Package size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
                        {lotes.length} lote(s) importado(s)
                    </span>
                    <button onClick={() => setTab('lotes')}
                        className={Z.btn2} style={{ padding: '6px 14px', fontSize: 12 }}>
                        Ver Lotes <ChevronRight size={14} style={{ display: 'inline', marginLeft: 4, verticalAlign: -2 }} />
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA: LOTES (lista completa + multi-otimização)
// ═══════════════════════════════════════════════════════
function TabLotes({ lotes, loadLotes, notify, abrirLote }) {
    const [selectedLotes, setSelectedLotes] = useState(new Set());

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
                                {['#', 'Nome', 'Cliente', 'Projeto', 'Peças', 'Chapas', 'Aprov.', 'Status', 'Data', ''].map(h => (
                                    <th key={h} className={Z.th} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lotes.map((l, i) => (
                                <tr key={l.id}
                                    onClick={() => abrirLote(l)}
                                    style={{
                                        background: selectedLotes.has(l.id) ? 'rgba(59,130,246,0.06)' : i % 2 === 0 ? 'transparent' : 'var(--bg-muted)',
                                        transition: 'background .15s', cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => { if (!selectedLotes.has(l.id)) e.currentTarget.style.background = 'rgba(19,121,240,0.04)'; }}
                                    onMouseLeave={e => { if (!selectedLotes.has(l.id)) e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--bg-muted)'; }}
                                >
                                    <td style={{ padding: '8px 6px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
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
                                    <td style={{ padding: '8px 10px' }} onClick={e => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => abrirLote(l, 'pecas')}
                                                title="Ver peças" className={Z.btn2} style={{ padding: '3px 8px', fontSize: 11 }}>
                                                <Eye size={12} />
                                            </button>
                                            <button onClick={() => abrirLote(l, 'plano')}
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
    );
}

// ═══════════════════════════════════════════════════════
// DASHBOARD — Production Statistics
// ═══════════════════════════════════════════════════════
function TabDashboard({ notify }) {
    const [stats, setStats] = useState(null);
    const [materiais, setMateriais] = useState([]);
    const [eficiencia, setEficiencia] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            api.get('/cnc/dashboard/stats').catch(() => null),
            api.get('/cnc/dashboard/materiais').catch(() => []),
            api.get('/cnc/dashboard/eficiencia?days=30').catch(() => []),
        ]).then(([s, m, e]) => {
            setStats(s);
            setMateriais(Array.isArray(m) ? m : []);
            setEficiencia(Array.isArray(e) ? e : []);
        }).finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /> Carregando dashboard...</div>;
    if (!stats) return <div className="glass-card p-4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Sem dados de producao disponveis.</div>;

    // Last 14 days for efficiency chart
    const chartDays = eficiencia.slice(-14);
    const maxChapas = Math.max(1, ...chartDays.map(d => d.chapas || 1));

    const cardStyle = {
        flex: '1 1 200px', padding: '16px 20px', borderRadius: 10,
        background: 'var(--bg-card, #fff)', border: '1px solid var(--border)',
        textAlign: 'center', minWidth: 160,
    };
    const cardLabel = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 6 };
    const cardValue = { fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Summary Cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={cardStyle}>
                    <div style={cardLabel}>Chapas Cortadas</div>
                    <div style={cardValue}>{stats.totalChapas || 0}</div>
                </div>
                <div style={cardStyle}>
                    <div style={cardLabel}>Pecas Produzidas</div>
                    <div style={cardValue}>{stats.totalPecas || 0}</div>
                </div>
                <div style={cardStyle}>
                    <div style={cardLabel}>Aproveitamento Medio</div>
                    <div style={{ ...cardValue, color: (stats.avgAproveitamento || 0) >= 80 ? '#16a34a' : (stats.avgAproveitamento || 0) >= 60 ? '#ca8a04' : '#dc2626' }}>
                        {stats.avgAproveitamento || 0}%
                    </div>
                </div>
                <div style={cardStyle}>
                    <div style={cardLabel}>Lotes Concluidos</div>
                    <div style={cardValue}>{stats.lotesConcluidos || 0}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}> / {stats.totalLotes || 0}</span></div>
                </div>
            </div>

            {/* Efficiency Chart (inline SVG bar chart) */}
            {chartDays.length > 0 && (
                <div className="glass-card p-4">
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                        <BarChart3 size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                        Eficiencia - Ultimos {chartDays.length} dias
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <svg width={Math.max(chartDays.length * 50, 300)} height={200} viewBox={`0 0 ${Math.max(chartDays.length * 50, 300)} 200`} style={{ display: 'block' }}>
                            {/* Grid lines */}
                            {[0, 20, 40, 60, 80, 100].map(v => {
                                const y = 170 - v * 1.5;
                                return <Fragment key={v}>
                                    <line x1={30} y1={y} x2={chartDays.length * 50 + 10} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray={v > 0 ? "3 3" : "0"} />
                                    <text x={26} y={y + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">{v}%</text>
                                </Fragment>;
                            })}
                            {/* Bars */}
                            {chartDays.map((d, i) => {
                                const barH = Math.max(2, d.avgAprov * 1.5);
                                const barY = 170 - barH;
                                const barW = 28;
                                const bx = 35 + i * 50;
                                const color = d.avgAprov >= 80 ? '#16a34a' : d.avgAprov >= 60 ? '#ca8a04' : '#dc2626';
                                const dayLabel = d.date ? d.date.slice(5) : '';
                                return <Fragment key={i}>
                                    <rect x={bx} y={barY} width={barW} height={barH} fill={color} rx={3} opacity={0.85} />
                                    <text x={bx + barW / 2} y={barY - 4} textAnchor="middle" fontSize={8} fill="var(--text-primary)" fontWeight={600}>{d.avgAprov}%</text>
                                    <text x={bx + barW / 2} y={185} textAnchor="middle" fontSize={7} fill="var(--text-muted)">{dayLabel}</text>
                                    <text x={bx + barW / 2} y={194} textAnchor="middle" fontSize={6} fill="var(--text-muted)">{d.chapas}ch</text>
                                </Fragment>;
                            })}
                        </svg>
                    </div>
                </div>
            )}

            {/* Material Ranking */}
            {materiais.length > 0 && (
                <div className="glass-card p-4">
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                        <Layers size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                        Ranking de Materiais
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                            <thead>
                                <tr>
                                    {['Material', 'Chapas', 'Area Total (m2)', 'Desperdicio Medio'].map(h => (
                                        <th key={h} className={Z.th} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {materiais.map((m, i) => (
                                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
                                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{m.material}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{m.chapas_usadas}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{m.area_total}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                                background: m.desperdicio_medio <= 20 ? '#dcfce7' : m.desperdicio_medio <= 40 ? '#fef9c3' : '#fee2e2',
                                                color: m.desperdicio_medio <= 20 ? '#166534' : m.desperdicio_medio <= 40 ? '#854d0e' : '#991b1b',
                                            }}>
                                                {m.desperdicio_medio}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Recent Lotes */}
            {(stats.recentLotes || []).length > 0 && (
                <div className="glass-card p-4">
                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                        <Package size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                        Lotes Recentes
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                            <thead>
                                <tr>
                                    {['Nome', 'Cliente', 'Data', 'Chapas', 'Pecas', 'Aprov.', 'Status'].map(h => (
                                        <th key={h} className={Z.th} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentLotes.map((l, i) => {
                                    const statusColor = l.status === 'concluido' ? '#8b5cf6' : l.status === 'otimizado' ? '#22c55e' : l.status === 'produzindo' ? '#f59e0b' : '#3b82f6';
                                    return (
                                        <tr key={l.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nome}</td>
                                            <td style={{ padding: '8px 10px' }}>{l.cliente || '-'}</td>
                                            <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)' }}>{l.criado_em ? new Date(l.criado_em).toLocaleDateString('pt-BR') : '-'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.total_chapas || '-'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.total_pecas || '-'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{l.aproveitamento ? `${l.aproveitamento}%` : '-'}</td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{
                                                    padding: '2px 10px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                                                    background: statusColor + '18', color: statusColor, border: `1px solid ${statusColor}40`,
                                                }}>
                                                    {l.status || 'importado'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
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
// RELATÓRIO DE DESPERDÍCIO
// ═══════════════════════════════════════════════════════
function RelatorioDesperdicio({ loteId, notify }) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [historico, setHistorico] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showHistorico, setShowHistorico] = useState(false);

    const load = useCallback(() => {
        if (!loteId) return;
        setLoading(true);
        api.get(`/cnc/relatorio-desperdicio/${loteId}`)
            .then(setData)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [loteId]);

    const loadHistorico = useCallback(() => {
        api.get('/cnc/relatorio-desperdicio-historico')
            .then(setHistorico)
            .catch(() => {});
    }, []);

    useEffect(() => { if (open && !data) load(); }, [open, data, load]);
    useEffect(() => { if (showHistorico && !historico) loadHistorico(); }, [showHistorico, historico, loadHistorico]);

    const aprovColor = (pct) => pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';

    const fmt = (v) => typeof v === 'number' ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

    const renderSummary = (resumo) => {
        if (!resumo) return null;
        const cards = [
            { label: 'Total Chapas', value: resumo.total_chapas ?? '-', highlight: true },
            { label: 'Total Peças', value: resumo.total_pecas ?? '-' },
            { label: 'Aproveitamento Médio', value: resumo.aproveitamento_medio != null ? `${fmt(resumo.aproveitamento_medio)}%` : '-', color: aprovColor(resumo.aproveitamento_medio || 0) },
            { label: 'Custo Total', value: resumo.custo_total != null ? `R$ ${fmt(resumo.custo_total)}` : '-' },
            { label: 'Custo Desperdício', value: resumo.custo_desperdicio != null ? `R$ ${fmt(resumo.custo_desperdicio)}` : '-', color: '#ef4444' },
        ];
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                {cards.map((c, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{c.label}</div>
                        <div style={{ fontSize: 14, fontWeight: c.highlight ? 700 : 600, color: c.color || (c.highlight ? 'var(--primary)' : 'var(--text-primary)') }}>
                            {c.value}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderMateriais = (materiais) => {
        if (!materiais || materiais.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>Nenhum material encontrado</div>;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {materiais.map((m, i) => {
                    const aprov = m.aproveitamento ?? 0;
                    const aColor = aprovColor(aprov);
                    const areaUsada = m.area_usada ?? 0;
                    const areaDesperdicio = m.area_desperdicio ?? 0;
                    const areaTotal = areaUsada + areaDesperdicio || 1;
                    const pctUsada = (areaUsada / areaTotal) * 100;
                    return (
                        <div key={i} style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{m.material || 'Sem material'}</div>
                                    {m.codigo && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.codigo}</div>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.chapas ?? '-'} chapa{(m.chapas ?? 0) !== 1 ? 's' : ''}</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: aColor }}>{fmt(aprov)}%</span>
                                </div>
                            </div>
                            {/* Usage bar */}
                            <div style={{ height: 8, borderRadius: 4, background: '#ef444430', overflow: 'hidden', marginBottom: 6 }}>
                                <div style={{ height: '100%', borderRadius: 4, background: aColor, width: `${pctUsada}%`, transition: 'width .3s' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                                <span>Usado: {fmt(areaUsada / 1e6)} m²</span>
                                <span>Desperdício: {fmt(areaDesperdicio / 1e6)} m²</span>
                            </div>
                            {(m.custo_material != null || m.custo_desperdicio != null) && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                    <span>Custo material: R$ {fmt(m.custo_material ?? 0)}</span>
                                    <span style={{ color: '#ef4444' }}>Custo desp.: R$ {fmt(m.custo_desperdicio ?? 0)}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="glass-card" style={{ marginTop: 16, overflow: 'hidden' }}>
            <button onClick={() => setOpen(!open)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                    borderBottom: open ? '1px solid var(--border)' : 'none',
                }}>
                <BarChart3 size={15} />
                Relatório de Desperdício
                <ChevronDown size={14} style={{ marginLeft: 'auto', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : '' }} />
            </button>

            {open && (
                <div style={{ padding: 16 }}>
                    {loading ? (
                        <Spinner text="Carregando relatório..." />
                    ) : data ? (
                        <>
                            {renderSummary(data.resumo)}
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Por Material</div>
                            {renderMateriais(data.por_material)}

                            {/* Toggle histórico */}
                            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                <button onClick={() => setShowHistorico(!showHistorico)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                                        padding: '6px 12px', cursor: 'pointer',
                                        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                                    }}>
                                    <BarChart3 size={13} />
                                    {showHistorico ? 'Ocultar Histórico Geral' : 'Ver Histórico Geral (todos os lotes)'}
                                    <ChevronDown size={12} style={{ transition: 'transform .2s', transform: showHistorico ? 'rotate(180deg)' : '' }} />
                                </button>

                                {showHistorico && (
                                    <div style={{ marginTop: 12 }}>
                                        {!historico ? (
                                            <Spinner text="Carregando histórico..." />
                                        ) : (
                                            <>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Agregado — Todos os Lotes</div>
                                                {renderSummary(historico.resumo)}
                                                {renderMateriais(historico.por_material)}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                            Nenhum dado disponível. Otimize o plano para gerar o relatório.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 2: PEÇAS
// ═══════════════════════════════════════════════════════
function TabPecas({ lotes, loteAtual, setLoteAtual, notify, setTab }) {
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
                                                        <button onClick={() => setPecaSel(sel ? null : p)} title="Ver 3D"
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

        // Piece table — grouped by ambiente
        const ambGroupsPlano = new Map();
        for (let pi = 0; pi < ch.pecas.length; pi++) {
            const p = ch.pecas[pi];
            const piece = pecasMap[p.pecaId];
            const amb = piece?.ambiente || piece?.modulo_desc || 'Sem Ambiente';
            if (!ambGroupsPlano.has(amb)) ambGroupsPlano.set(amb, []);
            ambGroupsPlano.get(amb).push({ p, pi, piece });
        }

        let peçaRows = '';
        let gNum = 0;
        for (const [amb, items] of ambGroupsPlano) {
            const clientLabel = items[0].p.loteNome || items[0].p.cliente || loteAtual?.cliente || '';
            peçaRows += `<tr><td colspan="7" style="background:#f0f0f0;font-weight:700;font-size:10px;padding:4px 6px;border-top:2px solid #999;color:#333">▸ ${amb}${clientLabel ? ` <span style="font-weight:400;color:#888;font-size:9px">— ${clientLabel}</span>` : ''}</td></tr>`;
            for (const { p, piece } of items) {
                gNum++;
                const hasBorda = piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira);
                const bordas = [];
                if (piece?.borda_frontal) bordas.push(`F:${piece.borda_frontal}`);
                if (piece?.borda_traseira) bordas.push(`T:${piece.borda_traseira}`);
                if (piece?.borda_dir) bordas.push(`D:${piece.borda_dir}`);
                if (piece?.borda_esq) bordas.push(`E:${piece.borda_esq}`);
                const upmCode = piece?.upmcode || '';
                peçaRows += `<tr><td>${gNum}</td><td>${piece?.descricao || '#' + p.pecaId}${upmCode ? `<br><span style="font-size:8px;color:#999;font-family:monospace">${upmCode}</span>` : ''}</td><td style="font-size:9px">${piece?.modulo_desc || '-'}</td><td style="text-align:right;font-family:monospace">${Math.round(p.w)} x ${Math.round(p.h)}${piece?.espessura ? ' x ' + piece.espessura : ''}</td><td style="text-align:center">${p.rotated ? '90°' : '-'}</td><td style="text-align:center;font-size:9px;color:#92400e">${bordas.length > 0 ? bordas.join(' ') : '-'}</td></tr>`;
            }
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
                <table class="pt"><thead><tr><th>#</th><th>Peça</th><th>Módulo</th><th>C x L x E (mm)</th><th>Rot.</th><th>Bordas</th></tr></thead><tbody>${peçaRows}</tbody></table>
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

// ─── Folha de Produção CNC (per-chapa print — enhanced operator report) ────────────────
function printFolhaProducao(chapa, chapaIdx, pecasMap, loteAtual, getModColor, kerf, refilo, totalChapas) {
    const modColors = ['#5b7fa6', '#8b6e4e', '#6a8e6e', '#9e7b5c', '#7a8999', '#a67c52', '#6b8f8b', '#8a7d6d', '#5f7d8a', '#7d6b5e'];
    const getColor = (pecaId) => {
        const piece = pecasMap[pecaId];
        if (!piece) return modColors[0];
        return modColors[(piece.modulo_id || 0) % modColors.length];
    };

    const nPecas = chapa.pecas.length;
    const ref = chapa.refilo || refilo || 0;
    const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
    const totalCh = totalChapas || '?';

    // ─── Build SVG (high-res for print ~170mm on A4) ───
    const maxSvgW = 640;
    const maxSvgH = nPecas <= 12 ? 280 : 360;
    const sc = Math.min(maxSvgW / chapa.comprimento, maxSvgH / chapa.largura);
    const sw = Math.round(chapa.comprimento * sc);
    const sh = Math.round(chapa.largura * sc);

    let pecasSvg = '';
    for (let pi = 0; pi < nPecas; pi++) {
        const p = chapa.pecas[pi];
        const px = (p.x + ref) * sc, py = (p.y + ref) * sc, pw = p.w * sc, ph = p.h * sc;
        const c = getColor(p.pecaId);
        const piece = pecasMap[p.pecaId];
        const num = pi + 1;

        pecasSvg += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${c}25" stroke="#1a1a1a" stroke-width="0.8"/>`;

        // Dimension labels on pieces
        if (pw > 35 && ph > 14) {
            pecasSvg += `<text x="${px + pw / 2}" y="${py + ph - 3}" text-anchor="middle" font-size="5.5" fill="#555" font-family="monospace">${Math.round(p.w)}x${Math.round(p.h)}</text>`;
        }

        // Borders as colored lines
        if (piece?.borda_frontal) pecasSvg += `<line x1="${px}" y1="${py}" x2="${px + pw}" y2="${py}" stroke="#d97706" stroke-width="2.5"/>`;
        if (piece?.borda_traseira) pecasSvg += `<line x1="${px}" y1="${py + ph}" x2="${px + pw}" y2="${py + ph}" stroke="#d97706" stroke-width="2.5"/>`;
        if (piece?.borda_esq) pecasSvg += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py + ph}" stroke="#d97706" stroke-width="2.5"/>`;
        if (piece?.borda_dir) pecasSvg += `<line x1="${px + pw}" y1="${py}" x2="${px + pw}" y2="${py + ph}" stroke="#d97706" stroke-width="2.5"/>`;

        // Number circle — for small pieces, show number as tiny label above
        const numR = Math.min(12, Math.min(pw, ph) * 0.3);
        if (numR >= 5) {
            pecasSvg += `<circle cx="${px + pw / 2}" cy="${py + ph / 2}" r="${numR}" fill="#1a1a1a" opacity="0.85"/>`;
            pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(10, numR * 1.3)}" fill="#fff" font-weight="700">${num}</text>`;
        } else if (pw >= 8 && ph >= 8) {
            // Small piece — tiny number without circle
            pecasSvg += `<text x="${px + pw / 2}" y="${py + ph / 2}" text-anchor="middle" dominant-baseline="central" font-size="4" fill="#1a1a1a" font-weight="800">${num}</text>`;
        }

        // Rotation indicator
        if (p.rotated && pw > 18 && ph > 18) {
            pecasSvg += `<text x="${px + 4}" y="${py + 9}" font-size="6" fill="#1a1a1a" font-weight="700" opacity="0.6">R</text>`;
        }
    }

    // Retalhos (remnants)
    let retSvg = '';
    for (const r of (chapa.retalhos || [])) {
        const rx = (r.x + ref) * sc, ry = (r.y + ref) * sc, rw = r.w * sc, rh = r.h * sc;
        retSvg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="none" stroke="#9ca3af" stroke-width="0.8" stroke-dasharray="4 2" opacity="0.5"/>`;
        if (rw > 30 && rh > 12) retSvg += `<text x="${rx + rw / 2}" y="${ry + rh / 2}" text-anchor="middle" dominant-baseline="central" font-size="6" fill="#9ca3af" opacity="0.7">${Math.round(r.w)}x${Math.round(r.h)}</text>`;
    }

    // Grain direction arrow
    let grainSvg = '';
    if (hasVeio) {
        const gx = sw - 50, gy = sh + 14;
        if (chapa.veio === 'horizontal') {
            grainSvg = `<g transform="translate(${gx},${gy})"><line x1="0" y1="0" x2="30" y2="0" stroke="#555" stroke-width="1.2"/><polygon points="30,-3 36,0 30,3" fill="#555"/><text x="18" y="-5" text-anchor="middle" font-size="6" fill="#555">VEIO</text></g>`;
        } else {
            grainSvg = `<g transform="translate(${gx},${gy - 20})"><line x1="0" y1="0" x2="0" y2="20" stroke="#555" stroke-width="1.2"/><polygon points="-3,20 0,26 3,20" fill="#555"/><text x="8" y="12" font-size="6" fill="#555">VEIO</text></g>`;
        }
    }

    // Scale bar (100mm reference)
    const scaleBarPx = 100 * sc;
    const scaleBarSvg = `<g transform="translate(4,${sh + 10})"><line x1="0" y1="0" x2="${scaleBarPx}" y2="0" stroke="#333" stroke-width="1"/><line x1="0" y1="-3" x2="0" y2="3" stroke="#333" stroke-width="0.8"/><line x1="${scaleBarPx}" y1="-3" x2="${scaleBarPx}" y2="3" stroke="#333" stroke-width="0.8"/><text x="${scaleBarPx / 2}" y="9" text-anchor="middle" font-size="6" fill="#555">100mm</text></g>`;

    const svgBlock = `<svg width="${sw + 4}" height="${sh + 28}" viewBox="-2 -2 ${sw + 4} ${sh + 28}" style="border:1px solid #ccc;background:#fff">
        <rect x="0" y="0" width="${sw}" height="${sh}" fill="#eae5dc" stroke="#8a7d6d" stroke-width="1"/>
        ${ref > 0 ? `<rect x="${ref * sc}" y="${ref * sc}" width="${sw - 2 * ref * sc}" height="${sh - 2 * ref * sc}" fill="none" stroke="#b5a99a" stroke-width="0.5" stroke-dasharray="3 2"/>` : ''}
        ${pecasSvg}${retSvg}${grainSvg}${scaleBarSvg}
    </svg>`;

    // ─── Build piece table rows grouped by ambiente ───
    const bdCell = (val) => val ? `<td class="bd-yes">${val}</td>` : `<td class="bd-no">-</td>`;

    // Group pieces by ambiente for separator headers
    const groupedPieces = [];
    let currentAmbiente = null;
    const sortedPieces = chapa.pecas.map((p, idx) => ({ ...p, _origIdx: idx }));

    // Build groups
    const ambienteGroups = new Map();
    for (const p of sortedPieces) {
        const piece = pecasMap[p.pecaId];
        const amb = piece?.ambiente || piece?.modulo_desc || 'Sem Ambiente';
        if (!ambienteGroups.has(amb)) ambienteGroups.set(amb, []);
        ambienteGroups.get(amb).push(p);
    }

    let tableRows = '';
    let globalNum = 0;
    for (const [amb, pieces] of ambienteGroups) {
        const firstPiece = pecasMap[pieces[0].pecaId];
        const clientLabel = pieces[0].loteNome || pieces[0].cliente || loteAtual?.cliente || '';

        // Ambiente separator header
        tableRows += `<tr class="amb-header">
            <td colspan="9" style="background:#f0ede8;padding:5px 8px;font-weight:700;font-size:10px;color:#1a1a1a;border-top:2px solid #8a7d6d;letter-spacing:0.3px">
                <span style="color:#5b7fa6">▸</span> ${amb}${clientLabel ? ` <span style="font-weight:400;color:#888;font-size:9px">— ${clientLabel}</span>` : ''}
            </td>
        </tr>`;

        for (let pi = 0; pi < pieces.length; pi++) {
            const p = pieces[pi];
            globalNum++;
            const piece = pecasMap[p.pecaId];
            const bg = pi % 2 === 0 ? '#fff' : '#f8f7f5';
            const esp = piece?.espessura || '-';
            const upmCode = piece?.upmcode || '';
            tableRows += `<tr style="background:${bg}">
                <td style="text-align:center;font-weight:700;color:#1a1a1a">${globalNum}</td>
                <td>${piece?.descricao || '#' + p.pecaId}${upmCode ? `<br><span style="font-size:7px;color:#999;font-family:monospace">${upmCode}</span>` : ''}</td>
                <td style="font-size:9px;color:#666">${piece?.modulo_desc || '-'}</td>
                <td style="text-align:right;font-family:monospace;font-size:10px">${Math.round(p.w)} x ${Math.round(p.h)} x ${esp}</td>
                <td style="text-align:center">${p.rotated ? '90°' : '-'}</td>
                ${bdCell(piece?.borda_frontal)}
                ${bdCell(piece?.borda_traseira)}
                ${bdCell(piece?.borda_dir)}
                ${bdCell(piece?.borda_esq)}
            </tr>`;
        }
    }

    const tableBlock = `<table class="ft">
        <thead><tr><th style="width:28px">#</th><th>Descricao</th><th>Modulo</th><th style="width:88px">C x L x E</th><th style="width:36px">Rot.</th><th class="bh">F</th><th class="bh">T</th><th class="bh">D</th><th class="bh">E</th></tr></thead>
        <tbody>${tableRows}</tbody>
    </table>`;

    // ─── Machining operations summary ───
    let opFuros = 0, opRasgos = 0, opRebaixos = 0, opOutros = 0;
    const toolSet = new Map();
    for (let pi = 0; pi < nPecas; pi++) {
        const p = chapa.pecas[pi];
        const piece = pecasMap[p.pecaId];
        if (!piece) continue;
        let mach = {};
        try { mach = JSON.parse(piece.machining_json || '{}'); } catch { /* skip */ }
        const workers = mach.workers ? (Array.isArray(mach.workers) ? mach.workers : Object.values(mach.workers)) : [];
        for (const w of workers) {
            const cat = (w.category || w.tipo || '').toLowerCase();
            if (cat.includes('furo') || cat.includes('drill') || cat.includes('hole')) opFuros++;
            else if (cat.includes('rasgo') || cat.includes('slot') || cat.includes('groove')) opRasgos++;
            else if (cat.includes('rebaixo') || cat.includes('pocket') || cat.includes('recess')) opRebaixos++;
            else opOutros++;
            const tk = w.tool_code || w.ferramenta || cat || 'geral';
            if (!toolSet.has(tk)) toolSet.set(tk, { code: tk, tipo: w.category || w.tipo || '-', diametro: w.diameter || w.diametro || 0, rpm: w.rpm || 0, count: 0 });
            toolSet.get(tk).count++;
        }
    }
    const totalOps = opFuros + opRasgos + opRebaixos + opOutros;
    const estTime = Math.round((nPecas * 3 + totalOps * 1) / 60 * 10) / 10;

    // Tool setup table
    let toolTableHtml = '';
    if (toolSet.size > 0) {
        let toolRows = '';
        let ti = 0;
        for (const [, t] of toolSet) {
            ti++;
            const bg = ti % 2 === 0 ? '#fff' : '#f8f7f5';
            toolRows += `<tr style="background:${bg}"><td style="text-align:center;font-weight:700">T${String(ti).padStart(2, '0')}</td><td>${t.tipo}</td><td style="text-align:center">${t.diametro || '-'}</td><td style="text-align:center">${t.rpm || '-'}</td><td style="text-align:center;font-weight:600">${t.count}</td></tr>`;
        }
        toolTableHtml = `<div style="margin-top:10px"><div style="font-size:10px;font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;color:#555">Ferramentas</div><table class="ft"><thead><tr><th style="width:40px">Pos.</th><th>Tipo</th><th style="width:50px">Diam.</th><th style="width:50px">RPM</th><th style="width:40px">Ops</th></tr></thead><tbody>${toolRows}</tbody></table></div>`;
    }

    // Operations summary
    let opSummaryHtml = '';
    if (totalOps > 0) {
        opSummaryHtml = `<div style="margin-top:8px;display:flex;gap:16px;font-size:10px;flex-wrap:wrap;padding:6px 8px;border:1px solid #e5e5e5;border-radius:4px;background:#fafaf8">
            <span style="font-weight:700;color:#555">USINAGENS:</span>
            ${opFuros > 0 ? `<span>Furos: <b>${opFuros}</b></span>` : ''}
            ${opRasgos > 0 ? `<span>Rasgos: <b>${opRasgos}</b></span>` : ''}
            ${opRebaixos > 0 ? `<span>Rebaixos: <b>${opRebaixos}</b></span>` : ''}
            ${opOutros > 0 ? `<span>Outros: <b>${opOutros}</b></span>` : ''}
            <span style="margin-left:auto;color:#555">Tempo est.: <b>${estTime} min</b></span>
        </div>`;
    }

    // ─── Header info ───
    const headerHtml = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #1a1a1a">
            <div>
                <h2 style="margin:0 0 2px;font-size:16px;color:#1a1a1a;letter-spacing:0.5px">FOLHA DE PRODUCAO CNC</h2>
                <div style="font-size:11px;color:#666">${loteAtual?.nome || 'Lote #' + (loteAtual?.id || '')}${loteAtual?.cliente ? ' | ' + loteAtual.cliente : ''}</div>
            </div>
            <div style="text-align:right;font-size:11px;color:#444">
                <div style="font-weight:700;font-size:13px">Chapa ${chapaIdx + 1} / ${totalCh}</div>
                <div>${chapa.material}</div>
                <div style="font-family:monospace">${chapa.comprimento} x ${chapa.largura} mm</div>
                <div style="font-size:9px;color:#888">${new Date().toLocaleDateString('pt-BR')}</div>
            </div>
        </div>
        <div style="display:flex;gap:16px;margin-bottom:10px;font-size:10px;flex-wrap:wrap">
            <span><b>Pecas:</b> ${nPecas}</span>
            <span><b>Aproveitamento:</b> ${(chapa.aproveitamento || 0).toFixed(1)}%</span>
            ${hasVeio ? `<span><b>Veio:</b> ${chapa.veio === 'horizontal' ? 'Horizontal' : 'Vertical'}</span>` : ''}
            ${kerf ? `<span><b>Kerf:</b> ${kerf}mm</span>` : ''}
            ${ref > 0 ? `<span><b>Refilo:</b> ${ref}mm</span>` : ''}
            ${chapa.is_retalho ? '<span style="color:#0e7490;font-weight:700">RETALHO</span>' : ''}
        </div>`;

    // ─── Footer ───
    const footerHtml = `<div style="margin-top:12px;padding-top:6px;border-top:1px solid #ddd;font-size:8px;color:#999;display:flex;justify-content:space-between">
        <span>${chapa.material} | ${chapa.comprimento}x${chapa.largura}mm | Aprov. ${(chapa.aproveitamento || 0).toFixed(1)}%</span>
        <span>Ornato ERP</span>
        <span>${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>`;

    // ─── Borda legend ───
    const bordaLegend = `<div style="margin-top:4px;font-size:8px;color:#92400e;display:flex;gap:10px;align-items:center">
        <span style="display:inline-block;width:14px;height:2px;background:#d97706;vertical-align:middle;margin-right:2px"></span> Fita de borda
        <span style="color:#666;margin-left:4px">F=Frontal T=Traseira D=Direita E=Esquerda</span>
    </div>`;

    // ─── Build page layout ───
    const needsPageBreak = nPecas > 12;
    let bodyHtml = `
        ${headerHtml}
        <div style="text-align:center;margin-bottom:6px">${svgBlock}</div>
        ${bordaLegend}
        ${opSummaryHtml}
        ${needsPageBreak ? '<div style="page-break-before:always;padding-top:8px">' : '<div style="margin-top:8px">'}
            ${needsPageBreak ? `<div style="font-size:11px;font-weight:700;margin-bottom:6px;color:#1a1a1a">Lista de Pecas - Chapa ${chapaIdx + 1}: ${chapa.material}</div>` : ''}
            ${tableBlock}
        </div>
        ${toolTableHtml}
        ${footerHtml}`;

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Folha de Producao CNC - Chapa ${chapaIdx + 1}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, 'Inter', Arial, sans-serif; margin: 16px; color: #333; font-size: 11px; }
        @page { size: A4 portrait; margin: 10mm; }
        .ft { width: 100%; border-collapse: collapse; font-size: 10px; }
        .ft th, .ft td { border: 1px solid #ddd; padding: 3px 5px; text-align: left; }
        .ft th { background: #f0ede8; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: #555; }
        .ft tr:hover { background: #f5f3ef !important; }
        .bh { text-align: center; width: 52px; background: #fef3c7 !important; color: #92400e; }
        .bd-yes { text-align: center; font-size: 9px; color: #92400e; font-weight: 600; background: #fffbeb; }
        .bd-no { text-align: center; font-size: 9px; color: #d1d5db; }
        .amb-header td { page-break-after: avoid; }
        .no-print { margin-bottom: 12px; }
        @media print {
            .no-print { display: none; }
            body { margin: 8px; }
            svg { max-width: 170mm !important; }
            .ft { page-break-inside: auto; }
            .ft tr { page-break-inside: avoid; }
        }
    </style></head><body>
    <div class="no-print">
        <button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer;background:#1e40af;color:#fff;border:none;border-radius:4px;font-weight:600">Imprimir</button>
        <span style="margin-left:12px;font-size:11px;color:#888">Chapa ${chapaIdx + 1}/${totalCh} | ${nPecas} pecas | ${totalOps} usinagens | A4 Retrato</span>
    </div>
    ${bodyHtml}
    </body></html>`);
    win.document.close();
}

// ═══════════════════════════════════════════════════════
// ABA 3: PLANO DE CORTE (com painel de configuração)
// ═══════════════════════════════════════════════════════
function TabPlano({ lotes, loteAtual, setLoteAtual, notify, loadLotes, setTab }) {
    const [plano, setPlano] = useState(null);
    const [loading, setLoading] = useState(false);
    const [otimizando, setOtimizando] = useState(false);
    const [pecasMap, setPecasMap] = useState({});
    const [showConfig, setShowConfig] = useState(true);
    const [selectedChapa, setSelectedChapa] = useState(0);
    const [chapaViewMode, setChapaViewMode] = useState('list'); // 'list' | 'grid'
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    // Transfer area + undo/redo + selection
    const [transferArea, setTransferArea] = useState([]);
    const [transferOpen, setTransferOpen] = useState(false);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [selectedPieces, setSelectedPieces] = useState([]); // pecaIdx list for active sheet

    // Corte status (quais peças já foram cortadas)
    const [cortadasSet, setCortadasSet] = useState(new Set());
    const [markingChapa, setMarkingChapa] = useState(null); // chapaIdx being marked

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

    // 3D modal + label print from context menu
    const [view3dPeca, setView3dPeca] = useState(null); // piece object for 3D modal
    const [printLabelPeca, setPrintLabelPeca] = useState(null); // piece for label printing

    // Keyboard shortcuts help panel
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

    // ═══ Chapa Status (multi-state) ═══
    const [chapaStatuses, setChapaStatuses] = useState({});
    const loadChapaStatuses = useCallback(() => {
        if (!loteAtual) return;
        api.get(`/cnc/chapa-status/${loteAtual.id}`).then(rows => {
            const map = {};
            for (const r of rows) map[r.chapa_idx] = r;
            setChapaStatuses(map);
        }).catch(() => {});
    }, [loteAtual]);
    useEffect(() => { loadChapaStatuses(); }, [loadChapaStatuses]);
    const updateChapaStatus = async (chapaIdx, status) => {
        try {
            await api.post(`/cnc/chapa-status/${loteAtual.id}`, { chapa_idx: chapaIdx, status });
            loadChapaStatuses();
            notify(`Chapa ${chapaIdx + 1}: ${status.replace('_', ' ')}`, 'success');
        } catch (err) { notify(err.error || 'Erro ao atualizar status'); }
    };

    // ═══ Review Checklist ═══
    const [reviewData, setReviewData] = useState(null);
    const [showReview, setShowReview] = useState(false);
    const loadReview = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/review/${loteAtual.id}`);
            setReviewData(data);
            setShowReview(true);
        } catch (err) { notify(err.error || 'Erro no review'); }
    };

    // ═══ Material Report ═══
    const [materialReport, setMaterialReport] = useState(null);
    const [showMaterialReport, setShowMaterialReport] = useState(false);
    const loadMaterialReport = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/relatorio-materiais/${loteAtual.id}`);
            setMaterialReport(data);
            setShowMaterialReport(true);
        } catch (err) { notify(err.error || 'Erro ao carregar relatório'); }
    };

    // ═══ G-Code History ═══
    const [gcodeHistory, setGcodeHistory] = useState([]);
    const [showGcodeHistory, setShowGcodeHistory] = useState(false);
    const loadGcodeHistory = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/gcode-historico/${loteAtual.id}`);
            setGcodeHistory(data);
            setShowGcodeHistory(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Conferência pós-corte ═══
    const [conferencia, setConferencia] = useState([]);
    const [showConferencia, setShowConferencia] = useState(false);
    const loadConferencia = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/conferencia/${loteAtual.id}`);
            setConferencia(data);
            setShowConferencia(true);
        } catch (err) { notify(err.error || 'Erro ao carregar conferência'); }
    };
    const conferirPeca = async (chapaIdx, pecaIdx, pecaDesc, status, defeitoTipo, defeitoObs) => {
        try {
            await api.post(`/cnc/conferencia/${loteAtual.id}`, {
                chapa_idx: chapaIdx, peca_idx: pecaIdx, peca_desc: pecaDesc,
                status, defeito_tipo: defeitoTipo || '', defeito_obs: defeitoObs || '',
                conferente: '',
            });
            setConferencia(prev => {
                const idx = prev.findIndex(c => c.chapa_idx === chapaIdx && c.peca_idx === pecaIdx);
                const newItem = { chapa_idx: chapaIdx, peca_idx: pecaIdx, peca_desc: pecaDesc, status, defeito_tipo: defeitoTipo || '', defeito_obs: defeitoObs || '' };
                if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], ...newItem }; return n; }
                return [...prev, newItem];
            });
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const conferirChapaOk = async (chapaIdx) => {
        if (!plano?.chapas[chapaIdx]) return;
        const pecas = plano.chapas[chapaIdx].pecas.map((p, pi) => ({ peca_idx: pi, peca_desc: p.desc || '' }));
        try {
            await api.post(`/cnc/conferencia/${loteAtual.id}/chapa/${chapaIdx}/ok`, { pecas });
            loadConferencia();
            notify(`Chapa ${chapaIdx + 1} conferida OK`, 'success');
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Fila de Produção ═══
    const [filaProducao, setFilaProducao] = useState([]);
    const [showFila, setShowFila] = useState(false);
    const loadFila = async () => {
        try {
            const data = await api.get('/cnc/fila-producao');
            setFilaProducao(data);
            setShowFila(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const enviarParaFila = async () => {
        if (!loteAtual) return;
        try {
            const r = await api.post(`/cnc/fila-producao/lote/${loteAtual.id}`, {});
            notify(`${r.added} chapas adicionadas à fila`, 'success');
            loadFila();
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const atualizarFila = async (id, updates) => {
        try {
            await api.put(`/cnc/fila-producao/${id}`, updates);
            loadFila();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Custeio Automático ═══
    const [custeioData, setCusteioData] = useState(null);
    const [showCusteio, setShowCusteio] = useState(false);
    const [custeioLoading, setCusteioLoading] = useState(false);
    const calcularCusteio = async () => {
        if (!loteAtual) return;
        setCusteioLoading(true);
        try {
            const data = await api.post(`/cnc/custeio/${loteAtual.id}`, {});
            setCusteioData(data);
            setShowCusteio(true);
        } catch (err) { notify(err.error || 'Erro ao calcular custeio'); }
        finally { setCusteioLoading(false); }
    };

    // ═══ Estoque de Chapas ═══
    const [estoqueChapas, setEstoqueChapas] = useState([]);
    const [showEstoque, setShowEstoque] = useState(false);
    const [estoqueAlertas, setEstoqueAlertas] = useState([]);
    const loadEstoque = async () => {
        try {
            const [chapas, alertas] = await Promise.all([
                api.get('/cnc/estoque-chapas'),
                api.get('/cnc/estoque-alertas'),
            ]);
            setEstoqueChapas(chapas);
            setEstoqueAlertas(alertas);
            setShowEstoque(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const movimentarEstoque = async (chapaId, tipo, qtd, motivo) => {
        try {
            const r = await api.post(`/cnc/estoque-chapas/${chapaId}/movimentacao`, { tipo, quantidade: qtd, motivo, lote_id: loteAtual?.id });
            notify(`Estoque atualizado: ${r.novo_estoque} un.`, 'success');
            loadEstoque();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Batch G-Code (#18) ═══
    const [batchGcodeLoading, setBatchGcodeLoading] = useState(false);
    const handleBatchGcode = async () => {
        if (!loteAtual) return;
        setBatchGcodeLoading(true);
        try {
            const data = await api.post(`/cnc/gcode-batch/${loteAtual.id}`, {
                maquina_id: maquinaGcode || null,
            });
            if (data.files) {
                notify(`${data.files.length} arquivos G-Code gerados`, 'success');
                if (data.combined) {
                    const blob = new Blob([data.combined], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url;
                    a.download = `gcode_lote_${loteAtual.id}_batch.nc`;
                    a.click(); URL.revokeObjectURL(url);
                }
            }
        } catch (err) { notify(err.error || 'Erro ao gerar G-Code em lote'); }
        finally { setBatchGcodeLoading(false); }
    };

    // ═══ SVG Export (#21) ═══
    const handleExportSVG = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/export-svg/${loteAtual.id}`);
            if (data.svgs) {
                data.svgs.forEach((svg, i) => {
                    const blob = new Blob([svg.svg], { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url;
                    a.download = `plano_chapa_${i + 1}.svg`;
                    a.click(); URL.revokeObjectURL(url);
                });
                notify(`${data.svgs.length} SVG(s) exportados`, 'success');
            }
        } catch (err) { notify(err.error || 'Erro ao exportar SVG'); }
    };

    // ═══ PDF Export (#17) ═══
    const handleExportPDF = async () => {
        if (!loteAtual || !plano) return;
        const win = window.open('', '_blank');
        const chapasHtml = plano.chapas.map((ch, ci) => {
            const totalPecas = ch.pecas?.length || 0;
            const aprovPct = ch.aproveitamento ? (ch.aproveitamento * 100).toFixed(1) : '-';
            const pecasRows = (ch.pecas || []).map((p, pi) => `
                <tr><td>${pi + 1}</td><td>${p.desc || '-'}</td><td>${Math.round(p.w)}×${Math.round(p.h)}</td><td>${p.rotacionada ? 'Sim' : '-'}</td></tr>
            `).join('');
            return `
                <div class="chapa-section">
                    <h3>Chapa ${ci + 1} — ${ch.material || 'Material'} (${ch.w}×${ch.h}mm)</h3>
                    <div class="stats">
                        <span>Peças: ${totalPecas}</span>
                        <span>Aproveitamento: ${aprovPct}%</span>
                    </div>
                    <table><thead><tr><th>#</th><th>Peça</th><th>Dimensões</th><th>Rot.</th></tr></thead>
                    <tbody>${pecasRows}</tbody></table>
                </div>`;
        }).join('');
        win.document.write(`<!DOCTYPE html><html><head><title>Plano de Corte — Lote ${loteAtual.nome || loteAtual.id}</title>
        <style>
            body{font-family:Inter,sans-serif;padding:30px;color:#1a1a2e}
            h2{color:#1379F0;border-bottom:2px solid #1379F0;padding-bottom:8px}
            .chapa-section{margin:20px 0;padding:16px;border:1px solid #ddd;border-radius:8px}
            h3{margin:0 0 8px;color:#333}
            .stats{display:flex;gap:20px;font-size:13px;color:#666;margin-bottom:12px}
            table{width:100%;border-collapse:collapse;font-size:12px}
            th,td{padding:6px 10px;border:1px solid #e0e0e0;text-align:left}
            th{background:#f0f4ff;font-weight:600}
            @media print{body{padding:10px}.chapa-section{break-inside:avoid}}
        </style></head><body>
        <h2>Plano de Corte — ${loteAtual.nome || 'Lote ' + loteAtual.id}</h2>
        <p style="color:#666;font-size:12px">${new Date().toLocaleDateString('pt-BR')} · ${plano.chapas?.length || 0} chapas · ${plano.chapas?.reduce((s, c) => s + (c.pecas?.length || 0), 0) || 0} peças</p>
        ${chapasHtml}
        <script>setTimeout(()=>window.print(),500)</script></body></html>`);
        win.document.close();
    };

    // ═══ Tool Prediction (#20) ═══
    const [toolPrediction, setToolPrediction] = useState(null);
    const [showToolPrediction, setShowToolPrediction] = useState(false);
    const loadToolPrediction = async () => {
        try {
            const data = await api.get('/cnc/tool-prediction');
            setToolPrediction(data);
            setShowToolPrediction(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Tool Maintenance (#27) ═══
    const [toolMaintenance, setToolMaintenance] = useState([]);
    const [showToolMaint, setShowToolMaint] = useState(false);
    const loadToolMaintenance = async () => {
        try {
            const data = await api.get('/cnc/tool-manutencao');
            setToolMaintenance(data);
            setShowToolMaint(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Material Audit (#25) ═══
    const [materialAudit, setMaterialAudit] = useState([]);
    const [showMaterialAudit, setShowMaterialAudit] = useState(false);
    const loadMaterialAudit = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/material-consumo/${loteAtual.id}`);
            setMaterialAudit(data);
            setShowMaterialAudit(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Material Reservation (#29) ═══
    const [reservations, setReservations] = useState([]);
    const [showReservations, setShowReservations] = useState(false);
    const loadReservations = async () => {
        try {
            const data = await api.get(`/cnc/reserva-material${loteAtual ? '?lote_id=' + loteAtual.id : ''}`);
            setReservations(data);
            setShowReservations(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const criarReserva = async (chapaId, qtd) => {
        if (!loteAtual) return;
        try {
            await api.post('/cnc/reserva-material', { lote_id: loteAtual.id, chapa_id: chapaId, quantidade: qtd });
            notify('Reserva criada', 'success');
            loadReservations();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Backup (#28) ═══
    const [backups, setBackups] = useState([]);
    const [showBackups, setShowBackups] = useState(false);
    const loadBackups = async () => {
        try {
            const data = await api.get('/cnc/backups');
            setBackups(data);
            setShowBackups(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };
    const criarBackup = async () => {
        try {
            const r = await api.post('/cnc/backups', {});
            notify(`Backup criado: ${r.filename}`, 'success');
            loadBackups();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Machine Performance (#31) ═══
    const [machinePerf, setMachinePerf] = useState(null);
    const [showMachinePerf, setShowMachinePerf] = useState(false);
    const loadMachinePerf = async () => {
        try {
            const data = await api.get('/cnc/maquina-performance');
            setMachinePerf(data);
            setShowMachinePerf(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Financeiro Integration (#22) ═══
    const handleFinanceiroSync = async () => {
        if (!loteAtual) return;
        try {
            const r = await api.post(`/cnc/financeiro-sync/${loteAtual.id}`, {});
            notify(`Sincronizado: ${r.total_items} itens → R$${r.total_valor?.toFixed(2) || '0.00'}`, 'success');
        } catch (err) { notify(err.error || 'Erro ao sincronizar financeiro'); }
    };

    // ═══ Label Preview (#26) ═══
    const [labelPreviewData, setLabelPreviewData] = useState(null);
    const [showLabelPreview, setShowLabelPreview] = useState(false);
    const loadLabelPreview = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/label-preview/${loteAtual.id}`);
            setLabelPreviewData(data);
            setShowLabelPreview(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Optimization Comparison (#36) ═══
    const [comparisonData, setComparisonData] = useState(null);
    const [showComparison, setShowComparison] = useState(false);
    const loadComparison = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.post(`/cnc/plano/${loteAtual.id}/comparar`, {});
            setComparisonData(data);
            setShowComparison(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Waste Dashboard (#39) ═══
    const [wasteData, setWasteData] = useState(null);
    const [showWaste, setShowWaste] = useState(false);
    const loadWasteDashboard = async () => {
        try {
            const data = await api.get('/cnc/dashboard/desperdicio?meses=6');
            setWasteData(data);
            setShowWaste(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Grouping Suggestion (#40) ═══
    const [groupingSuggestions, setGroupingSuggestions] = useState([]);
    const [showGrouping, setShowGrouping] = useState(false);
    const loadGroupingSuggestions = async () => {
        try {
            const data = await api.get('/cnc/sugestao-agrupamento');
            setGroupingSuggestions(data.suggestions || []);
            setShowGrouping(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Smart Remnants (#42) ═══
    const [remnantsData, setRemnantsData] = useState(null);
    const [showRemnants, setShowRemnants] = useState(false);
    const loadRemnants = async () => {
        try {
            const data = await api.get('/cnc/retalhos-aproveitaveis');
            setRemnantsData(data);
            setShowRemnants(true);
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Client Report (#46) ═══
    const handleClientReport = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/relatorio-cliente/${loteAtual.id}`);
            const win = window.open('', '_blank');
            const modulosHtml = data.modulos.map(m => `
                <div style="margin:16px 0;padding:16px;border:1px solid #ddd;border-radius:8px">
                    <h3 style="margin:0 0 8px">${m.nome}</h3>
                    <div style="display:flex;gap:20px;font-size:13px;color:#666">
                        <span>Peças: ${m.total}</span>
                        <span>Conferidas: ${m.conferidas}</span>
                        <span>Progresso: ${m.progresso_pct.toFixed(0)}%</span>
                    </div>
                    <div style="height:6px;background:#eee;border-radius:3px;margin-top:8px;overflow:hidden">
                        <div style="height:100%;width:${m.progresso_pct}%;background:#22c55e;border-radius:3px"></div>
                    </div>
                </div>`).join('');
            win.document.write(`<!DOCTYPE html><html><head><title>Relatório — ${data.lote.nome}</title>
            <style>body{font-family:Inter,sans-serif;padding:30px;color:#1a1a2e}h2{color:#1379F0}
            @media print{body{padding:10px}}</style></head><body>
            <h2>Relatório de Produção — ${data.lote.nome}</h2>
            <p style="color:#666">${new Date().toLocaleDateString('pt-BR')} · ${data.total_pecas} peças · ${data.total_conferidas} conferidas</p>
            ${modulosHtml}
            <script>setTimeout(()=>window.print(),500)</script></body></html>`);
            win.document.close();
        } catch (err) { notify(err.error || 'Erro'); }
    };

    // ═══ Push Notifications (#35) ═══
    const requestNotifPermission = useCallback(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);
    useEffect(() => { requestNotifPermission(); }, [requestNotifPermission]);

    // ═══ Piece Labels ═══
    const [showLabels, setShowLabels] = useState(false);
    const printLabels = async () => {
        if (!loteAtual) return;
        try {
            const data = await api.get(`/cnc/etiquetas/${loteAtual.id}`);
            const win = window.open('', '_blank');
            const labelsHtml = data.labels.map(l => `
                <div class="label">
                    <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(l.qr_data || l.codigo_scan)}" width="70" height="70"/></div>
                    <div class="info">
                        <div class="desc">${l.descricao || l.upmcode}</div>
                        <div class="mod">${l.modulo || ''}</div>
                        <div class="dim">${l.dimensoes}</div>
                        ${l.bordas ? `<div class="borda">${l.bordas}</div>` : ''}
                        <div class="meta">${l.cliente} · Ch.${l.chapa?.idx || '?'}</div>
                        <div class="code">${l.codigo_scan}</div>
                    </div>
                </div>
            `).join('');
            win.document.write(`<!DOCTYPE html><html><head><title>Etiquetas — ${data.lote.nome}</title>
            <style>
                * { box-sizing: border-box; margin: 0; }
                body { font-family: Arial, sans-serif; }
                .label { display: inline-flex; width: 90mm; height: 38mm; border: 1px dashed #ccc; padding: 3mm; margin: 1mm; gap: 3mm; page-break-inside: avoid; align-items: center; }
                .qr { flex-shrink: 0; }
                .info { flex: 1; overflow: hidden; }
                .desc { font-size: 11px; font-weight: 700; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
                .mod { font-size: 9px; color: #666; }
                .dim { font-size: 10px; font-family: monospace; font-weight: 600; margin-top: 2px; }
                .borda { font-size: 8px; color: #92400e; margin-top: 1px; }
                .meta { font-size: 8px; color: #999; margin-top: 2px; }
                .code { font-size: 7px; font-family: monospace; color: #aaa; margin-top: 1px; }
                @media print { .no-print { display: none; } body { margin: 0; } .label { border: 1px solid #eee; } }
            </style></head><body>
            <div class="no-print" style="padding:10px"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e67e22;color:#fff;border:none;border-radius:6px">Imprimir Etiquetas</button>
            <span style="margin-left:12px;font-size:12px;color:#888">${data.labels.length} etiquetas · ${data.lote.nome}</span></div>
            ${labelsHtml}
            </body></html>`);
            win.document.close();
        } catch (err) { notify(err.error || 'Erro ao gerar etiquetas'); }
    };

    // ═══ Relatório de Bordas ═══
    const [bordasData, setBordasData] = useState(null);
    const [bordasLoading, setBordasLoading] = useState(false);
    const [showBordas, setShowBordas] = useState(false);
    const [bordasExpanded, setBordasExpanded] = useState({});
    const loadBordas = async () => {
        if (!loteAtual) return;
        setBordasLoading(true);
        try {
            const data = await api.get(`/cnc/relatorio-bordas/${loteAtual.id}`);
            setBordasData({ bordas: data.bordas || [] });
            setShowBordas(true);
        } catch (err) {
            notify('Erro ao carregar bordas: ' + (err.error || err.message));
        } finally { setBordasLoading(false); }
    };

    // ═══ Timer de corte por chapa ═══
    const [chapaTimers, setChapaTimers] = useState(() => {
        // Restore all timers from localStorage on mount
        const timers = {};
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('chapa_timer_')) {
                    timers[key] = JSON.parse(localStorage.getItem(key));
                }
            }
        } catch (_) {}
        return timers;
    });

    const getTimerKey = useCallback((chapaIdx) => {
        return `chapa_timer_${loteAtual?.id}_${chapaIdx}`;
    }, [loteAtual]);

    const startTimer = useCallback((chapaIdx) => {
        const key = getTimerKey(chapaIdx);
        const existing = chapaTimers[key];
        const now = Date.now();
        const timerData = {
            running: true,
            startedAt: now,
            elapsed: existing?.elapsed || 0, // accumulated seconds before this start
        };
        localStorage.setItem(key, JSON.stringify(timerData));
        setChapaTimers(prev => ({ ...prev, [key]: timerData }));
    }, [getTimerKey, chapaTimers]);

    const stopTimer = useCallback((chapaIdx) => {
        const key = getTimerKey(chapaIdx);
        const existing = chapaTimers[key];
        if (!existing) return;
        const now = Date.now();
        const elapsed = existing.elapsed + (existing.running ? Math.floor((now - existing.startedAt) / 1000) : 0);
        const timerData = { running: false, startedAt: null, elapsed };
        localStorage.setItem(key, JSON.stringify(timerData));
        setChapaTimers(prev => ({ ...prev, [key]: timerData }));
    }, [getTimerKey, chapaTimers]);

    const resetTimer = useCallback((chapaIdx) => {
        const key = getTimerKey(chapaIdx);
        localStorage.removeItem(key);
        setChapaTimers(prev => { const n = { ...prev }; delete n[key]; return n; });
    }, [getTimerKey]);

    // Tick running timers every second
    const [timerTick, setTimerTick] = useState(0);
    useEffect(() => {
        const hasRunning = Object.values(chapaTimers).some(t => t.running);
        if (!hasRunning) return;
        const iv = setInterval(() => setTimerTick(t => t + 1), 1000);
        return () => clearInterval(iv);
    }, [chapaTimers]);

    const getTimerElapsed = useCallback((chapaIdx) => {
        const key = getTimerKey(chapaIdx);
        const t = chapaTimers[key];
        if (!t) return 0;
        if (t.running) return t.elapsed + Math.floor((Date.now() - t.startedAt) / 1000);
        return t.elapsed || 0;
    }, [getTimerKey, chapaTimers, timerTick]);

    const formatTimer = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    // Cache de stats reais do G-code por chapa (preenchido após gerar G-code)
    const [chapaRealStats, setChapaRealStats] = useState({}); // { chapaIdx: { tempo_estimado_min, dist_corte_m, ... } }

    const getEstimatedTime = useCallback((chapa, chapaIdx) => {
        // Se temos stats reais do G-code, usar elas
        if (chapaIdx !== undefined && chapaRealStats[chapaIdx]?.tempo_estimado_min) {
            return chapaRealStats[chapaIdx].tempo_estimado_min;
        }
        // Fallback: estimativa heurística
        const nPecas = chapa.pecas?.length || 0;
        let totalOps = 0;
        for (const p of (chapa.pecas || [])) {
            const pid = p.pecaId;
            const dbp = pecasMap[pid];
            if (!dbp) continue;
            let mach = {};
            try { mach = JSON.parse(dbp.machining_json || '{}'); } catch (_) {}
            for (const face of Object.values(mach)) {
                if (Array.isArray(face)) totalOps += face.length;
            }
        }
        return Math.round((nPecas * 3 + totalOps * 1) / 60 * 10) / 10; // minutes
    }, [pecasMap, chapaRealStats]);

    // Fullscreen for chapa visualization
    const chapaVizContainerRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Multi-Machine state
    const [multiMaqMode, setMultiMaqMode] = useState(false);
    const [maquinas, setMaquinas] = useState([]);
    const [machineAssignments, setMachineAssignments] = useState({}); // chapaIdx → { maquina_id, maquina_nome }

    const loadMaquinas = useCallback(() => {
        api.get('/cnc/maquinas').then(setMaquinas).catch(() => {});
    }, []);

    const loadMachineAssignments = useCallback(() => {
        if (!loteAtual) return;
        api.get(`/cnc/machine-assignments/${loteAtual.id}`).then(list => {
            const map = {};
            for (const a of list) map[a.chapa_idx] = { maquina_id: a.maquina_id, maquina_nome: a.maquina_nome };
            setMachineAssignments(map);
            if (list.length > 0) setMultiMaqMode(true);
        }).catch(() => {});
    }, [loteAtual]);

    useEffect(() => { loadMaquinas(); }, [loadMaquinas]);
    useEffect(() => { loadMachineAssignments(); }, [loadMachineAssignments]);

    const assignMachine = async (chapaIdx, maquina_id) => {
        const newMap = { ...machineAssignments };
        if (maquina_id) {
            const maq = maquinas.find(m => m.id === Number(maquina_id));
            newMap[chapaIdx] = { maquina_id: Number(maquina_id), maquina_nome: maq?.nome || '' };
        } else {
            delete newMap[chapaIdx];
        }
        setMachineAssignments(newMap);
        try {
            await api.post(`/cnc/machine-assignments/${loteAtual.id}`, {
                assignments: [{ chapaIdx, maquina_id: maquina_id ? Number(maquina_id) : null }],
            });
        } catch (err) { notify('Erro ao salvar atribuicao: ' + (err.error || err.message)); }
    };

    const autoAssignMachines = async () => {
        if (!loteAtual) return;
        try {
            const r = await api.post(`/cnc/machine-assignments/${loteAtual.id}/auto`);
            if (r.ok && r.assignments) {
                const map = {};
                for (const a of r.assignments) map[a.chapaIdx] = { maquina_id: a.maquina_id, maquina_nome: a.maquina_nome };
                setMachineAssignments(map);
                notify(`Auto-atribuicao: ${r.assignments.length} chapa(s) distribuida(s)`);
            }
        } catch (err) { notify('Erro: ' + (err.error || err.message)); }
    };

    // Machine color palette for border coding
    const machineColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const getMachineColor = (maquinaId) => {
        if (!maquinaId) return null;
        const idx = maquinas.findIndex(m => m.id === maquinaId);
        return machineColors[idx % machineColors.length];
    };

    // Load config defaults from API
    useEffect(() => {
        api.get('/cnc/config').then(cfg => {
            setEspacoPecas(cfg.espaco_pecas ?? 7);
            setKerf(cfg.kerf_padrao ?? 4);
            // modo_otimizador tem prioridade; fallback para usar_guilhotina
            setModo(cfg.modo_otimizador || (cfg.usar_guilhotina !== 0 ? 'guilhotina' : 'maxrects'));
            setRefilo(cfg.refilo ?? 10);
            setPermitirRotacao(cfg.permitir_rotacao !== 0);
            setDirecaoCorte(cfg.direcao_corte || 'misto');
            setUsarRetalhos(cfg.usar_retalhos !== 0);
            setIteracoes(cfg.iteracoes_otimizador ?? 300);
            setConsiderarSobra(cfg.considerar_sobra !== 0);
            setSobraMinW(cfg.sobra_min_largura ?? 300);
            setSobraMinH(cfg.sobra_min_comprimento ?? 600);
            setCfgLoaded(true);
        }).catch(() => setCfgLoaded(true));
    }, []);

    // Auto-save config quando parâmetros do otimizador mudam
    const cfgSaveTimer = useRef(null);
    useEffect(() => {
        if (!cfgLoaded) return;
        if (cfgSaveTimer.current) clearTimeout(cfgSaveTimer.current);
        cfgSaveTimer.current = setTimeout(() => {
            api.put('/cnc/config', {
                espaco_pecas: espacoPecas, kerf_padrao: kerf,
                modo_otimizador: modo,
                usar_guilhotina: modo === 'guilhotina' ? 1 : 0,
                refilo,
                permitir_rotacao: permitirRotacao ? 1 : 0,
                direcao_corte: direcaoCorte,
                usar_retalhos: usarRetalhos ? 1 : 0,
                iteracoes_otimizador: iteracoes,
                considerar_sobra: considerarSobra ? 1 : 0,
                sobra_min_largura: sobraMinW,
                sobra_min_comprimento: sobraMinH,
            }).catch(() => {});
        }, 1500);
        return () => { if (cfgSaveTimer.current) clearTimeout(cfgSaveTimer.current); };
    }, [cfgLoaded, espacoPecas, kerf, modo, refilo, permitirRotacao, direcaoCorte, usarRetalhos, iteracoes, considerarSobra, sobraMinW, sobraMinH]);

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

    // Load corte status
    const loadCorteStatus = useCallback(() => {
        if (!loteAtual) { setCortadasSet(new Set()); return; }
        api.get(`/cnc/expedicao/corte-status/${loteAtual.id}`).then(data => {
            setCortadasSet(new Set(data.cortadas || []));
        }).catch(() => setCortadasSet(new Set()));
    }, [loteAtual]);
    useEffect(() => { loadCorteStatus(); }, [loadCorteStatus]);

    // Mark chapa as cut
    const marcarChapaCortada = useCallback(async (chapaIdx) => {
        if (!plano || !loteAtual) return;
        const chapa = plano.chapas[chapaIdx];
        if (!chapa) return;

        const pecaIds = chapa.pecas.map(p => p.pecaId).filter(Boolean);
        if (pecaIds.length === 0) { notify('Nenhuma peça com ID nesta chapa'); return; }

        setMarkingChapa(chapaIdx);
        try {
            const data = await api.post('/cnc/expedicao/marcar-chapa', {
                lote_id: loteAtual.id,
                chapa_idx: chapaIdx,
                peca_ids: pecaIds,
            });
            if (data.ok) {
                notify(`Chapa ${chapaIdx + 1} marcada — ${data.registrados} peça(s) registradas${data.skipped > 0 ? ` (${data.skipped} já cortadas)` : ''}`);
                setCortadasSet(prev => {
                    const next = new Set(prev);
                    for (const id of pecaIds) next.add(id);
                    return next;
                });
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setMarkingChapa(null);
        }
    }, [plano, loteAtual, notify]);

    // Desmarcar chapa cortada
    const desmarcarChapaCortada = useCallback(async (chapaIdx) => {
        if (!plano || !loteAtual) return;
        const chapa = plano.chapas[chapaIdx];
        if (!chapa) return;

        const pecaIds = chapa.pecas.map(p => p.pecaId).filter(Boolean);
        if (pecaIds.length === 0) return;

        setMarkingChapa(chapaIdx);
        try {
            const data = await api.post('/cnc/expedicao/desmarcar-chapa', {
                lote_id: loteAtual.id,
                peca_ids: pecaIds,
            });
            if (data.ok) {
                notify(`Chapa ${chapaIdx + 1} desmarcada — ${data.removed} registro(s) removidos`);
                setCortadasSet(prev => {
                    const next = new Set(prev);
                    for (const id of pecaIds) next.delete(id);
                    return next;
                });
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message));
        } finally {
            setMarkingChapa(null);
        }
    }, [plano, loteAtual, notify]);

    const planoIdRef = useRef(null); // rastreia se é um plano NOVO ou atualização do mesmo
    useEffect(() => {
        const newId = plano ? `${plano.chapas?.length}_${plano.modo}_${plano.timestamp || ''}` : null;
        const isNewPlan = planoIdRef.current !== newId && planoIdRef.current !== null;
        planoIdRef.current = newId;
        if (isNewPlan) {
            // Plano novo (re-otimização) → volta pra chapa 0
            setSelectedChapa(0); setZoomLevel(1); setPanOffset({ x: 0, y: 0 });
        } else if (plano) {
            // Mesmo plano atualizado (edição) → mantém chapa atual, só garante que é válida
            setSelectedChapa(prev => Math.min(prev, (plano.chapas?.length || 1) - 1));
        }
    }, [plano]);

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
    const modColorPalette = ['#5b7fa6', '#8b6e4e', '#6a8e6e', '#9e7b5c', '#7a8999', '#a67c52', '#6b8f8b', '#8a7d6d', '#5f7d8a', '#7d6b5e'];
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
        // Color by ambiente/environment (more useful than module)
        const piece = pecasMap[pecaId];
        if (!piece) return modColorPalette[0];
        const ambienteName = piece.ambiente || piece.modulo || '';
        if (ambienteName) {
            // Generate consistent color from ambiente name hash
            let hash = 0;
            for (let i = 0; i < ambienteName.length; i++) hash = ((hash << 5) - hash + ambienteName.charCodeAt(i)) | 0;
            return modColorPalette[Math.abs(hash) % modColorPalette.length];
        }
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

    // ═══ Validation state ═══
    const [validationResult, setValidationResult] = useState(null); // { conflicts: [] }
    const [validating, setValidating] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const validarUsinagens = async () => {
        if (!loteAtual) return;
        setValidating(true);
        try {
            const r = await api.get(`/cnc/validar-usinagens/${loteAtual.id}`);
            setValidationResult(r);
            setShowValidation(true);
            if (r.conflicts?.length === 0) notify('Nenhum conflito encontrado.');
            else notify(`${r.conflicts.length} conflito(s) detectado(s).`);
        } catch (err) {
            notify('Erro ao validar: ' + (err.error || err.message));
        } finally { setValidating(false); }
    };

    // Handle manual adjustments — zero-refresh: update local state, sync to server silently
    // ═══ Feature 1: Per-piece costing ═══
    const [custosData, setCustosData] = useState(null);
    const [custosLoading, setCustosLoading] = useState(false);
    const [showCustos, setShowCustos] = useState(false);
    const [custosExpanded, setCustosExpanded] = useState({});
    const loadCustos = async () => {
        if (!loteAtual) return;
        setCustosLoading(true);
        try {
            const data = await api.get(`/cnc/custos/${loteAtual.id}`);
            setCustosData(data);
            setShowCustos(true);
        } catch (err) {
            notify('Erro ao carregar custos: ' + (err.error || err.message));
        } finally { setCustosLoading(false); }
    };

    // ═══ Feature 2: Multi-format export ═══
    const [showExportMenu, setShowExportMenu] = useState(false);
    useEffect(() => {
        if (!showExportMenu) return;
        const close = () => setShowExportMenu(false);
        setTimeout(() => document.addEventListener('click', close), 0);
        return () => document.removeEventListener('click', close);
    }, [showExportMenu]);
    const handleExport = async (format) => {
        if (!loteAtual) return;
        setShowExportMenu(false);
        try {
            const token = localStorage.getItem('erp_token');
            const resp = await fetch(`/api/cnc/export/${loteAtual.id}/${format}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!resp.ok) throw new Error('Erro ao exportar');
            const blob = await resp.blob();
            const contentType = resp.headers.get('content-type') || '';
            if (format === 'resumo') {
                // Open HTML in new tab
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            } else {
                // Download file
                const ext = format === 'csv' ? '.csv' : '.json';
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `plano_${loteAtual.nome || loteAtual.id}${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
            notify(`Exportado: ${format.toUpperCase()}`);
        } catch (err) {
            notify('Erro ao exportar: ' + err.message);
        }
    };

    // ═══ Feature 3: Toolpath Simulator ═══
    const [toolpathOpen, setToolpathOpen] = useState(false);
    const [toolpathMoves, setToolpathMoves] = useState([]);
    const [toolpathChapa, setToolpathChapa] = useState(null);

    // ═══ Feature 4: Version diff ═══
    const [showVersions, setShowVersions] = useState(false);
    const [versions, setVersions] = useState([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [diffV1, setDiffV1] = useState(null);
    const [diffV2, setDiffV2] = useState(null);
    const [diffResult, setDiffResult] = useState(null);
    const [diffLoading, setDiffLoading] = useState(false);
    const loadVersions = async () => {
        if (!loteAtual) return;
        setVersionsLoading(true);
        try {
            const r = await api.get(`/cnc/plano/${loteAtual.id}/versions`);
            setVersions(r.versions || []);
            setShowVersions(true);
        } catch (err) {
            notify('Erro ao carregar versões: ' + (err.error || err.message));
        } finally { setVersionsLoading(false); }
    };
    const loadDiff = async () => {
        if (!diffV1 || !diffV2 || !loteAtual) return;
        setDiffLoading(true);
        try {
            const r = await api.get(`/cnc/plano/${loteAtual.id}/versions/diff/${diffV1}/${diffV2}`);
            setDiffResult(r);
        } catch (err) {
            notify('Erro ao comparar versões: ' + (err.error || err.message));
        } finally { setDiffLoading(false); }
    };

    // ═══ Gerar G-Code por chapa ═══
    const [gcodeLoading, setGcodeLoading] = useState(null); // chapaIdx sendo gerado
    const [gcodePreview, setGcodePreview] = useState(null); // { gcode, filename, stats, alertas, chapaIdx, contorno_tool, ferramentas_faltando }
    const [inlineSimData, setInlineSimData] = useState(null); // { gcode, chapa } for inline simulator in Plano de Corte
    const [toolPanel, setToolPanel] = useState(null);
    const [toolPanelOpen, setToolPanelOpen] = useState(false);
    const [toolPanelLoading, setToolPanelLoading] = useState(false);
    const [toolPanelDirty, setToolPanelDirty] = useState(false);
    // Máquina selecionada para geração de G-code (global, pode ser overridden por assignment de chapa)
    const [maquinaGcode, setMaquinaGcode] = useState('');
    const selectedMachineArea = useMemo(() => {
        if (!maquinaGcode) return null;
        const m = maquinas.find(m => m.id === Number(maquinaGcode));
        return m ? { x_max: m.x_max || 2800, y_max: m.y_max || 1900, nome: m.nome } : null;
    }, [maquinaGcode, maquinas]);

    const handleGerarGcode = async (chapaIdx) => {
        if (!loteAtual) return;
        setGcodeLoading(chapaIdx);
        try {
            // Prioridade: assignment da chapa > seleção global > padrão do servidor
            const assignedMaq = machineAssignments[chapaIdx]?.maquina_id;
            const maqId = assignedMaq || (maquinaGcode ? Number(maquinaGcode) : undefined);
            const body = maqId ? { maquina_id: maqId } : {};
            const r = await api.post(`/cnc/gcode/${loteAtual.id}/chapa/${chapaIdx}`, body);
            if (r.ok) {
                // Pegar dados da chapa do plano para o simulador 2D
                const chapaInfo = plano?.chapas?.[chapaIdx] || null;
                const chapaSimData = chapaInfo ? (() => {
                        // Máquina padrão: X=largura, Y=comprimento (eixos trocados)
                        // Se trocar_eixos_xy=1, mantém original (X=comprimento, Y=largura)
                        const maqUsada = maquinas.find(m => m.id === maqId) || maquinas.find(m => m.padrao) || {};
                        const swapOff = maqUsada.trocar_eixos_xy === 1;
                        const cw = swapOff ? chapaInfo.comprimento : chapaInfo.largura;
                        const cl = swapOff ? chapaInfo.largura : chapaInfo.comprimento;
                        return {
                            comprimento: cw,
                            largura: cl,
                            refilo: chapaInfo.refilo ?? 10,
                            espessura: chapaInfo.espessura_real || chapaInfo.espessura || 18.5,
                            material_code: chapaInfo.material_code || '',
                            pecas: (chapaInfo.pecas || []).map(p => ({
                                x: swapOff ? p.x : p.y, y: swapOff ? p.y : p.x,
                                w: swapOff ? p.w : p.h, h: swapOff ? p.h : p.w,
                                nome: p.nome,
                            })),
                            retalhos: (chapaInfo.retalhos || []).map(r => ({
                                x: swapOff ? r.x : r.y, y: swapOff ? r.y : r.x,
                                w: swapOff ? r.w : r.h, h: swapOff ? r.h : r.w,
                            })),
                        };
                    })() : null;
                // Cache real stats from G-code generation
                if (r.stats) setChapaRealStats(prev => ({ ...prev, [chapaIdx]: r.stats }));
                // Store inline sim data for Plano de Corte view
                setInlineSimData(chapaSimData ? { gcode: r.gcode, chapa: chapaSimData, chapaIdx } : null);
                setGcodePreview({
                    gcode: r.gcode,
                    filename: r.filename || `chapa_${chapaIdx + 1}.nc`,
                    stats: r.stats || {},
                    alertas: r.alertas || [],
                    chapaIdx,
                    contorno_tool: r.contorno_tool || null,
                    chapa: chapaSimData,
                });
            } else if (r.ferramentas_faltando?.length > 0) {
                // Mostrar detalhes de ferramentas faltantes no preview modal (sem G-code)
                setGcodePreview({
                    gcode: '', filename: '', stats: r.stats || {}, chapaIdx,
                    contorno_tool: r.contorno_tool || null, chapa: null,
                    alertas: [
                        { tipo: 'erro_critico', msg: `BLOQUEADO: ${r.ferramentas_faltando.length} ferramenta(s) faltando no magazine da máquina` },
                        ...(r.ferramentas_faltando_detalhes || []).map(d =>
                            ({ tipo: 'erro_critico', msg: `Ferramenta "${d.tool_code}" necessária para ${d.operacao} na peça "${d.peca}"` })
                        ),
                        ...(r.alertas || []),
                    ],
                    ferramentas_faltando: r.ferramentas_faltando,
                });
                notify(`G-Code bloqueado: ${r.ferramentas_faltando.length} ferramenta(s) faltando`, 'error');
            } else {
                // Show error in modal with details instead of just a toast
                setGcodePreview({
                    gcode: '', filename: '', stats: r.stats || {}, chapaIdx,
                    contorno_tool: null, chapa: null,
                    alertas: [{ tipo: 'erro_critico', msg: r.error || 'Erro desconhecido ao gerar G-Code' }, ...(r.alertas || [])],
                    ferramentas_faltando: [],
                });
                notify(r.error || 'Erro ao gerar G-Code', 'error');
            }
        } catch (err) {
            // Network/server error — show in modal too
            const errMsg = err.error || err.message || 'Erro de rede ou servidor indisponível';
            setGcodePreview({
                gcode: '', filename: '', stats: {}, chapaIdx,
                contorno_tool: null, chapa: null,
                alertas: [{ tipo: 'erro_critico', msg: errMsg }],
                ferramentas_faltando: [],
            });
            notify('Erro ao gerar G-Code: ' + errMsg, 'error');
        } finally {
            setGcodeLoading(null);
        }
    };

    // G-code de peça avulsa
    const handleGerarGcodePeca = async (chapaIdx, pecaIdx) => {
        if (!loteAtual) return;
        setGcodeLoading(chapaIdx);
        try {
            const assignedMaq = machineAssignments[chapaIdx]?.maquina_id;
            const maqId = assignedMaq || (maquinaGcode ? Number(maquinaGcode) : undefined);
            const body = maqId ? { maquina_id: maqId } : {};
            const r = await api.post(`/cnc/gcode/${loteAtual.id}/chapa/${chapaIdx}/peca/${pecaIdx}`, body);
            if (r.ok) {
                setGcodePreview({
                    gcode: r.gcode,
                    filename: r.filename || `peca_${pecaIdx + 1}.nc`,
                    stats: r.stats || {},
                    alertas: r.alertas || [],
                    chapaIdx,
                    contorno_tool: r.contorno_tool || null,
                    chapa: null, // single piece doesn't need full chapa sim
                });
                notify(`G-Code gerado para peça ${pecaIdx + 1}`);
            } else {
                setGcodePreview({
                    gcode: '', filename: '', stats: r.stats || {}, chapaIdx,
                    contorno_tool: null, chapa: null,
                    alertas: [{ tipo: 'erro_critico', msg: r.error || 'Erro' }, ...(r.alertas || [])],
                    ferramentas_faltando: r.ferramentas_faltando || [],
                });
                notify(r.error || 'Erro ao gerar G-Code da peça', 'error');
            }
        } catch (err) {
            notify('Erro: ' + (err.error || err.message), 'error');
        } finally {
            setGcodeLoading(null);
        }
    };

    const handleOpenToolPanel = async () => {
        if (!loteAtual) return;
        setToolPanelLoading(true);
        try {
            const r = await api.get(`/cnc/lotes/${loteAtual.id}/operacoes-scan`);
            setToolPanel(r);
            setToolPanelOpen(true);
            setToolPanelDirty(false);
        } catch (err) {
            notify(err.error || 'Erro ao escanear operações', 'error');
        } finally {
            setToolPanelLoading(false);
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

    const handleSendToMachine = async () => {
        if (!gcodePreview || !loteAtual) return;
        try {
            const r = await api.post(`/cnc/enviar-gcode/${loteAtual.id}/chapa/${gcodePreview.chapaIdx}`, {});
            if (r.ok) {
                notify(`Enviado: ${r.filename} → ${r.msg || r.path}`, 'success');
            } else {
                notify(r.error || 'Erro ao enviar', 'error');
            }
        } catch (err) {
            notify(err.error || 'Erro ao enviar para máquina', 'error');
        }
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

        if (params.action === 'flip' && params.chapaIdx != null && params.pecaIdx != null) {
            setPlano(prev => {
                if (!prev?.chapas) return prev;
                const chapas = prev.chapas.map((ch, ci) => {
                    if (ci !== params.chapaIdx) return ch;
                    const pecas = ch.pecas.map((p, pi) => {
                        if (pi !== params.pecaIdx) return p;
                        return { ...p, lado_ativo: (p.lado_ativo === 'B') ? 'A' : 'B' };
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
            // Use setTimeout to wait for React re-render cycle to complete
            const doRestore = () => { if (mainEl) mainEl.scrollTop = savedScroll; };
            requestAnimationFrame(() => {
                setTimeout(doRestore, 50);
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
            // Ignore when typing in inputs
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

            // Ctrl+Z / Ctrl+Y — undo/redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }

            // Escape — clear selection
            if (e.key === 'Escape') { setSelectedPieces([]); setShowShortcutsHelp(false); return; }

            // Number keys 1-9 — select chapa by index
            if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const idx = Number(e.key) - 1;
                if (plano && plano.chapas && idx < plano.chapas.length) {
                    setSelectedChapa(idx);
                }
                return;
            }

            // Left/Right arrows — navigate chapas
            if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setSelectedChapa(prev => Math.max(0, prev - 1));
                return;
            }
            if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (plano && plano.chapas) setSelectedChapa(prev => Math.min(plano.chapas.length - 1, prev + 1));
                return;
            }

            // R — rotate selected piece(s)
            if (e.key === 'r' || e.key === 'R') {
                if (selectedPieces.length > 0 && plano) {
                    for (const pecaIdx of selectedPieces) {
                        handleAdjust({ action: 'rotate', chapaIdx: selectedChapa, pecaIdx });
                    }
                }
                return;
            }

            // Space — toggle marcar/desmarcar chapa cortada
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                if (plano && plano.chapas[selectedChapa] && markingChapa === null) {
                    const chapa = plano.chapas[selectedChapa];
                    const pecaIds = chapa.pecas.map(p => p.pecaId).filter(Boolean);
                    const allCut = pecaIds.length > 0 && pecaIds.every(id => cortadasSet.has(id));
                    if (allCut) desmarcarChapaCortada(selectedChapa);
                    else marcarChapaCortada(selectedChapa);
                }
                return;
            }

            // F — toggle fullscreen for chapa visualization
            if (e.key === 'f' || e.key === 'F') {
                if (chapaVizContainerRef.current) {
                    if (!document.fullscreenElement) {
                        chapaVizContainerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
                    } else {
                        document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
                    }
                }
                return;
            }

            // G — gerar G-code da chapa selecionada
            if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
                if (plano && plano.chapas[selectedChapa]) {
                    handleGerarGcode(selectedChapa);
                }
                return;
            }

            // E — ir para etiquetas
            if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey) {
                setTab('gcode');
                return;
            }

            // P — imprimir folha de produção
            if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
                if (plano && plano.chapas[selectedChapa]) {
                    printFolhaProducao(plano.chapas[selectedChapa], selectedChapa, pecasMap, loteAtual, getModColor, kerf, refilo, plano.chapas.length);
                }
                return;
            }

            // D — ir para dashboard
            if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
                setTab('dashboard');
                return;
            }

            // ? — toggle shortcuts help
            if (e.key === '?') {
                setShowShortcutsHelp(prev => !prev);
                return;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });

    // Listen for fullscreen exit via Esc (browser-native)
    useEffect(() => {
        const onFsChange = () => { if (!document.fullscreenElement) setIsFullscreen(false); };
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    // Reset selection when switching sheets
    useEffect(() => { setSelectedPieces([]); }, [selectedChapa]);

    return (
        <div>
            {loading ? (
                <Spinner text="Carregando plano..." />
            ) : (
                <>
                    {/* Config info bar — parâmetros vêm de Configurações > Parâmetros Otimizador */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '8px 14px',
                        background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <Settings size={13} />
                        <span><b>{modo === 'guilhotina' ? 'Guilhotina' : modo === 'maxrects' ? 'MaxRects' : 'Shelf'}</b></span>
                        <span>Espaço: {espacoPecas}mm</span>
                        <span>Refilo: {refilo}mm</span>
                        {(modo === 'guilhotina' || modo === 'shelf') && <span>Kerf: {kerf}mm</span>}
                        {permitirRotacao && <span>Rotação 90°</span>}
                        {usarRetalhos && <span>Retalhos</span>}
                        {considerarSobra && <span>Sobras ≥{sobraMinW}×{sobraMinH}mm</span>}
                        <span>Dir: {direcaoCorte}</span>
                    </div>

                    {/* TOOLBAR — grouped into dropdowns */}
                    <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Primary action */}
                        <button onClick={otimizar} disabled={otimizando} className={Z.btn}
                            style={{ padding: '10px 24px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                            {otimizando ? <><RotateCw size={15} className="animate-spin" /> Otimizando...</> : <><Scissors size={15} /> Otimizar</>}
                        </button>

                        {plano && plano.chapas?.length > 0 && (<>
                            {/* Arquivo dropdown */}
                            <ToolbarDropdown label="Arquivo" icon={FileText} items={[
                                { id: 'print', label: 'Imprimir / PDF', icon: Printer, onClick: () => printPlano(plano, pecasMap, loteAtual, getModColor) },
                                { divider: true },
                                { id: 'csv', label: 'Exportar CSV (Excel)', icon: FileText, onClick: () => handleExport('csv') },
                                { id: 'json', label: 'Exportar JSON', icon: FileDown, onClick: () => handleExport('json') },
                                { id: 'resumo', label: 'Exportar Resumo HTML', icon: Printer, onClick: () => handleExport('resumo') },
                                { id: 'pdf', label: 'Exportar PDF Plano', icon: FileText, onClick: handleExportPDF },
                                { id: 'svg', label: 'Exportar SVG', icon: FileDown, onClick: handleExportSVG },
                                { id: 'batchgcode', label: batchGcodeLoading ? 'Gerando...' : 'G-Code em Lote', icon: Cpu, onClick: handleBatchGcode, disabled: batchGcodeLoading },
                                { divider: true },
                                { id: 'dup', label: 'Duplicar Plano', icon: Copy, onClick: async () => {
                                    try {
                                        const r = await api.post(`/cnc/plano/${loteAtual.id}/duplicar`);
                                        if (r.ok) notify('Plano duplicado como nova versão (v' + r.version_id + ')');
                                        else notify(r.error || 'Erro ao duplicar plano');
                                    } catch (err) { notify('Erro ao duplicar plano: ' + (err.error || err.message)); }
                                }},
                                { id: 'hist', label: 'Histórico de Versões', icon: Clock, onClick: loadVersions, disabled: versionsLoading },
                            ]} />

                            {/* Relatórios dropdown */}
                            <ToolbarDropdown label="Relatórios" icon={BarChart3} items={[
                                { id: 'custos', label: custosLoading ? 'Calculando...' : 'Custos', icon: DollarSign, onClick: loadCustos, disabled: custosLoading },
                                { id: 'bordas', label: bordasLoading ? 'Carregando...' : 'Rel. Bordas', icon: PenTool, onClick: loadBordas, disabled: bordasLoading },
                                { id: 'material', label: 'Lista Material', icon: Package, onClick: loadMaterialReport },
                                { id: 'review', label: 'Review', icon: ClipboardCheck, onClick: loadReview, danger: reviewData?.allOk === false },
                                { divider: true },
                                { id: 'glog', label: 'G-Code Log', icon: History, onClick: loadGcodeHistory },
                                { divider: true },
                                { id: 'perf', label: 'Performance Máquina', icon: Monitor, onClick: loadMachinePerf },
                                { id: 'audit', label: 'Auditoria Material', icon: ClipboardCheck, onClick: loadMaterialAudit },
                                { id: 'financ', label: 'Sincronizar Financeiro', icon: DollarSign, onClick: handleFinanceiroSync },
                                { divider: true },
                                { id: 'comparar', label: 'Comparar Otimização', icon: GitCompare, onClick: loadComparison },
                                { id: 'desperdicio', label: 'Dashboard Desperdício', icon: BarChart3, onClick: loadWasteDashboard },
                                { id: 'agrupamento', label: 'Sugestão Agrupamento', icon: Layers, onClick: loadGroupingSuggestions },
                                { id: 'retalhos', label: 'Retalhos Aproveitáveis', icon: Scissors, onClick: loadRemnants },
                                { id: 'relcliente', label: 'Relatório Cliente', icon: FileText, onClick: handleClientReport },
                            ]} />

                            {/* Ferramentas dropdown */}
                            <ToolbarDropdown label="Ferramentas" icon={Wrench} items={[
                                { id: 'etiq', label: 'Etiquetas', icon: TagIcon, onClick: printLabels },
                                { id: 'toolpanel', label: toolPanelLoading ? 'Escaneando...' : 'Painel Ferramentas', icon: Wrench, onClick: handleOpenToolPanel, disabled: toolPanelLoading },
                                { id: 'validar', label: validating ? 'Validando...' : 'Validar Usinagens', icon: ShieldAlert, onClick: validarUsinagens, disabled: validating,
                                    danger: validationResult?.conflicts?.length > 0 },
                                { divider: true },
                                { id: 'conferencia', label: 'Conferência Pós-Corte', icon: ClipboardCheck, onClick: loadConferencia },
                                { id: 'fila', label: 'Fila de Produção', icon: Send, onClick: loadFila },
                                { id: 'custeio', label: custeioLoading ? 'Calculando...' : 'Custeio por Peça', icon: DollarSign, onClick: calcularCusteio, disabled: custeioLoading },
                                { id: 'estoque', label: 'Estoque Chapas', icon: Package, onClick: loadEstoque },
                                { divider: true },
                                { id: 'toolpred', label: 'Predição Ferramentas', icon: Clock, onClick: loadToolPrediction },
                                { id: 'toolmaint', label: 'Manutenção Programada', icon: Settings, onClick: loadToolMaintenance },
                                { id: 'reserva', label: 'Reserva Material', icon: Lock, onClick: loadReservations },
                                { id: 'labelpreview', label: 'Preview Etiquetas', icon: TagIcon, onClick: loadLabelPreview },
                                { id: 'backup', label: 'Backup', icon: Server, onClick: loadBackups },
                                { divider: true },
                                { id: 'operador', label: 'Modo Operador (TV)', icon: Tv, onClick: () => window.open('/operador-cnc', '_blank') },
                            ]} />

                            {/* Machine selector */}
                            {maquinas.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-muted)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                    <Monitor size={13} style={{ color: 'var(--text-muted)' }} />
                                    <select value={maquinaGcode} onChange={e => setMaquinaGcode(e.target.value)}
                                        className={Z.inp} style={{ fontSize: 11, padding: '5px 8px', minWidth: 160, border: 'none', background: 'transparent' }}>
                                        <option value="">Máquina padrão</option>
                                        {maquinas.filter(m => m.ativo).map(m => (
                                            <option key={m.id} value={m.id}>{m.nome} ({m.total_ferramentas} ferr.)</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </>)}

                        {loteAtual.status === 'otimizado' && (
                            <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                                <CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                                Otimizado
                            </span>
                        )}
                        {otimizando && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Testando {modo === 'guilhotina' ? 'guilhotina' : modo === 'shelf' ? 'shelf' : 'MaxRects'} · Todos os algoritmos · Otimizando...
                            </span>
                        )}

                        {/* Edit actions — right aligned */}
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

                    {/* Validation conflicts modal */}
                    {showValidation && validationResult?.conflicts?.length > 0 && (
                        <div className="glass-card p-4" style={{ marginBottom: 16, borderLeft: '3px solid #ef4444' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertTriangle size={15} /> Conflitos de Usinagem ({validationResult.conflicts.length})
                                </h3>
                                <button onClick={() => setShowValidation(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {validationResult.conflicts.map((c, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 8px',
                                        background: c.severidade === 'erro' ? '#fef2f210' : '#fefce810',
                                        borderRadius: 4, border: `1px solid ${c.severidade === 'erro' ? '#ef444430' : '#eab30830'}`,
                                    }}>
                                        <AlertTriangle size={12} style={{ color: c.severidade === 'erro' ? '#ef4444' : '#eab308', flexShrink: 0 }} />
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 100 }}>
                                            Ch{c.chapaIdx + 1} P{c.pecaIdx + 1} - {c.pecaDesc}
                                        </span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{c.mensagem}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

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

                            {/* Legend: projetos (multi) ou módulos (single) — colapsável quando muitos */}
                            {moduleLegend.length > 1 && (() => {
                                const MAX_VISIBLE = 8;
                                const isLong = moduleLegend.length > MAX_VISIBLE;
                                return (
                                    <details style={{ marginBottom: 12 }} open={!isLong}>
                                        <summary style={{
                                            fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                                            cursor: 'pointer', padding: '6px 12px', background: 'var(--bg-muted)', borderRadius: 8,
                                            border: '1px solid var(--border)', userSelect: 'none', listStyle: 'none',
                                            display: 'flex', alignItems: 'center', gap: 6,
                                        }}>
                                            <span style={{ fontSize: 10 }}>{isLong ? '▶' : '▼'}</span>
                                            {isMultiLote ? 'Projetos' : 'Módulos'}: {moduleLegend.length}
                                            {isLong && <span style={{ fontWeight: 400, marginLeft: 4 }}>(clique para expandir)</span>}
                                        </summary>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '6px 12px', background: 'var(--bg-muted)', borderRadius: '0 0 8px 8px', borderTop: 'none' }}>
                                            {moduleLegend.map((m, i) => (
                                                <span key={i} style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-primary)' }}>
                                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, display: 'inline-block', flexShrink: 0 }} />
                                                    {m.name}
                                                </span>
                                            ))}
                                        </div>
                                    </details>
                                );
                            })()}

                            {/* Multi-Maquina section */}
                            {maquinas.length > 1 && (
                                <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setMultiMaqMode(!multiMaqMode)}>
                                        <div style={{
                                            width: 36, height: 20, borderRadius: 10, padding: 2, transition: 'all .2s',
                                            background: multiMaqMode ? 'var(--primary)' : 'var(--bg-muted)',
                                            border: `1px solid ${multiMaqMode ? 'var(--primary)' : 'var(--border)'}`,
                                            display: 'flex', alignItems: 'center',
                                        }}>
                                            <div style={{
                                                width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'all .2s',
                                                transform: multiMaqMode ? 'translateX(16px)' : 'translateX(0)',
                                                boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                                            }} />
                                        </div>
                                        <Server size={14} style={{ color: multiMaqMode ? 'var(--primary)' : 'var(--text-muted)' }} />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: multiMaqMode ? 'var(--primary)' : 'var(--text-primary)' }}>Modo Multi-Maquina</span>
                                    </div>
                                    {multiMaqMode && (
                                        <>
                                            <button onClick={autoAssignMachines} className={Z.btn2}
                                                style={{ padding: '4px 10px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Zap size={12} /> Auto-Atribuir
                                            </button>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                {maquinas.filter(m => m.ativo !== 0).map(m => {
                                                    const color = getMachineColor(m.id);
                                                    const count = Object.values(machineAssignments).filter(a => a.maquina_id === m.id).length;
                                                    return (
                                                        <span key={m.id} style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
                                                            {m.nome} {count > 0 && <span style={{ fontWeight: 700 }}>({count})</span>}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ═══ STEPPER: Navegação compacta das chapas ═══ */}
                            {plano && plano.chapas.length > 1 && (
                                plano.chapas.length <= 15 ? (
                                    /* Stepper circular — só para poucos chapas */
                                    <div style={{ display: 'flex', gap: 0, alignItems: 'center', marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
                                        {plano.chapas.map((ch, ci) => {
                                            const isActive = ci === selectedChapa;
                                            const st = chapaStatuses[ci];
                                            const statusColor = !st || st.status === 'pendente' ? '#9ca3af' : st.status === 'em_corte' ? '#f59e0b' : st.status === 'cortada' ? '#22c55e' : '#3b82f6';
                                            const statusIcon = !st || st.status === 'pendente' ? '○' : st.status === 'em_corte' ? '◐' : st.status === 'cortada' ? '●' : '✓';
                                            return (
                                                <Fragment key={ci}>
                                                    {ci > 0 && <div style={{ width: 16, height: 2, background: chapaStatuses[ci - 1]?.status === 'cortada' || chapaStatuses[ci - 1]?.status === 'conferida' ? '#22c55e' : 'var(--border)', flexShrink: 0 }} />}
                                                    <button
                                                        onClick={() => { setSelectedChapa(ci); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                                                        title={`Chapa ${ci + 1}: ${ch.material} · ${ch.aproveitamento.toFixed(1)}% · ${st?.status || 'pendente'}`}
                                                        style={{
                                                            flexShrink: 0, width: 32, height: 32, borderRadius: '50%', border: `2px solid ${isActive ? 'var(--primary)' : statusColor}`,
                                                            background: isActive ? 'var(--primary)' : 'var(--bg-card)', color: isActive ? '#fff' : statusColor,
                                                            fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            transition: 'all .15s', boxShadow: isActive ? '0 0 0 3px rgba(230,126,34,0.2)' : 'none',
                                                        }}
                                                    >
                                                        {isActive ? ci + 1 : statusIcon}
                                                    </button>
                                                </Fragment>
                                            );
                                        })}
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 9, color: 'var(--text-muted)', alignItems: 'center', flexShrink: 0, paddingLeft: 12 }}>
                                            <span>○ Pendente</span><span style={{ color: '#f59e0b' }}>◐ Em corte</span><span style={{ color: '#22c55e' }}>● Cortada</span><span style={{ color: '#3b82f6' }}>✓ Conferida</span>
                                        </div>
                                    </div>
                                ) : (
                                    /* Barra compacta com mini-blocos — para muitas chapas (>15) */
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginBottom: 6 }}>
                                            {plano.chapas.map((ch, ci) => {
                                                const isActive = ci === selectedChapa;
                                                const st = chapaStatuses[ci];
                                                const statusColor = !st || st.status === 'pendente' ? '#d1d5db' : st.status === 'em_corte' ? '#f59e0b' : st.status === 'cortada' ? '#22c55e' : '#3b82f6';
                                                const aprov = ch.aproveitamento || 0;
                                                const aprovColor = aprov >= 80 ? '#22c55e' : aprov >= 60 ? '#f59e0b' : '#ef4444';
                                                return (
                                                    <button key={ci}
                                                        onClick={() => { setSelectedChapa(ci); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                                                        title={`Chapa ${ci + 1}: ${ch.material} · ${aprov.toFixed(1)}% · ${ch.pecas.length}pç · ${st?.status || 'pendente'}`}
                                                        style={{
                                                            width: 24, height: 18, borderRadius: 3, cursor: 'pointer', fontSize: 8, fontWeight: 700,
                                                            border: isActive ? '2px solid var(--primary)' : `1px solid ${statusColor}`,
                                                            background: isActive ? 'var(--primary)' : 'var(--bg-card)',
                                                            color: isActive ? '#fff' : 'var(--text-muted)',
                                                            position: 'relative', overflow: 'hidden', padding: 0,
                                                            boxShadow: isActive ? '0 0 0 2px rgba(230,126,34,0.25)' : 'none',
                                                            transition: 'all .12s',
                                                        }}>
                                                        {ci + 1}
                                                        <div style={{
                                                            position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                                                            background: isActive ? '#fff' : aprovColor, opacity: isActive ? 0.7 : 0.6,
                                                        }} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'var(--text-muted)', alignItems: 'center' }}>
                                            <span>Chapa <b>{selectedChapa + 1}</b> de <b>{plano.chapas.length}</b></span>
                                            <span style={{ flex: 1 }} />
                                            <span>○ Pendente</span><span style={{ color: '#f59e0b' }}>◐ Em corte</span><span style={{ color: '#22c55e' }}>● Cortada</span><span style={{ color: '#3b82f6' }}>✓ Conferida</span>
                                        </div>
                                    </div>
                                )
                            )}

                            {/* View mode toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    {plano.chapas.length} chapa{plano.chapas.length !== 1 ? 's' : ''}
                                </span>
                                <span style={{ flex: 1 }} />
                                <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 6, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
                                    <button onClick={() => setChapaViewMode('list')} title="Lista"
                                        style={{ padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                            background: chapaViewMode === 'list' ? 'var(--bg-card)' : 'transparent',
                                            color: chapaViewMode === 'list' ? 'var(--primary)' : 'var(--text-muted)',
                                            boxShadow: chapaViewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        }}><List size={13} /></button>
                                    <button onClick={() => setChapaViewMode('grid')} title="Grade"
                                        style={{ padding: '4px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                            background: chapaViewMode === 'grid' ? 'var(--bg-card)' : 'transparent',
                                            color: chapaViewMode === 'grid' ? 'var(--primary)' : 'var(--text-muted)',
                                            boxShadow: chapaViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        }}><LayoutGrid size={13} /></button>
                                </div>
                            </div>

                            {/* ═══ GRID VIEW ═══ */}
                            {chapaViewMode === 'grid' && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
                                    {plano.chapas.map((chapa, ci) => {
                                        const isActive = ci === selectedChapa;
                                        const gridScale = Math.min(180 / chapa.comprimento, 100 / chapa.largura);
                                        const gW = chapa.comprimento * gridScale;
                                        const gH = chapa.largura * gridScale;
                                        const aprov = chapa.aproveitamento || 0;
                                        const aprovColor = aprov >= 80 ? '#22c55e' : aprov >= 60 ? '#f59e0b' : '#ef4444';
                                        return (
                                            <div key={ci} onClick={() => { setSelectedChapa(ci); setChapaViewMode('list'); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                                                style={{
                                                    padding: 10, borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
                                                    background: isActive ? 'var(--primary-bg, rgba(230,126,34,0.08))' : 'var(--bg-card)',
                                                    border: `2px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                                                    boxShadow: isActive ? '0 0 0 1px var(--primary)' : '0 1px 4px rgba(0,0,0,0.06)',
                                                    position: 'relative', overflow: 'hidden',
                                                }}>
                                                {/* Utilization overlay bar at top */}
                                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--bg-muted)' }}>
                                                    <div style={{ height: '100%', width: `${Math.min(100, aprov)}%`, background: aprovColor, transition: 'width .3s' }} />
                                                </div>
                                                {/* Mini SVG */}
                                                <svg width={gW} height={gH} viewBox={`0 0 ${chapa.comprimento} ${chapa.largura}`}
                                                    style={{ display: 'block', margin: '6px auto 8px', background: 'var(--bg-body)', borderRadius: 3, border: '1px solid var(--border)' }}>
                                                    {chapa.pecas.map((p, pi) => {
                                                        const ref = chapa.refilo || 0;
                                                        const col = getModColor(p.pecaId, p);
                                                        if (p.contour && p.contour.length >= 3) {
                                                            const pts = p.contour.map(v => `${p.x + ref + (v.x / p.w) * p.w},${p.y + ref + (v.y / p.h) * p.h}`).join(' ');
                                                            return <polygon key={pi} points={pts} fill={`${col}30`} stroke={col} strokeWidth={Math.max(1, 2 / gridScale)} />;
                                                        }
                                                        return <rect key={pi} x={p.x + ref} y={p.y + ref} width={p.w} height={p.h}
                                                            fill={`${col}30`} stroke={col} strokeWidth={Math.max(1, 2 / gridScale)} />;
                                                    })}
                                                    {(chapa.retalhos || []).map((r, ri) => (
                                                        <rect key={`s${ri}`} x={r.x + (chapa.refilo || 0)} y={r.y + (chapa.refilo || 0)}
                                                            width={r.w} height={r.h}
                                                            fill="none" stroke="#9ca3af" strokeWidth={Math.max(1, 2 / gridScale)} strokeDasharray="6 3" opacity={0.5} />
                                                    ))}
                                                </svg>
                                                {/* Info row */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                                                        Chapa {ci + 1}
                                                        {chapa.is_retalho && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: colorBg('#06b6d4'), color: '#06b6d4', fontWeight: 700, marginLeft: 4 }}>RET</span>}
                                                    </span>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: aprovColor }}>{aprov.toFixed(0)}%</span>
                                                </div>
                                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {chapa.pecas.length} pç · {chapa.comprimento}×{chapa.largura}mm
                                                    {chapa.locked && <Lock size={9} style={{ display: 'inline', verticalAlign: -1, marginLeft: 4, color: '#3b82f6' }} />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ═══ LIST VIEW: LAYOUT LADO A LADO: Thumbnails + Detalhe ═══ */}
                            {chapaViewMode === 'list' && <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                                {/* LEFT: Thumbnail list — agrupado por material/espessura */}
                                <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: 4 }}>
                                    {plano.chapas.map((chapa, ci) => {
                                        const isActive = ci === selectedChapa;
                                        const thumbScale = Math.min(180 / chapa.comprimento, 80 / chapa.largura);
                                        const thumbW = chapa.comprimento * thumbScale;
                                        const thumbH = chapa.largura * thumbScale;
                                        // Material group header
                                        const matKey = `${chapa.material_code || chapa.material || '?'}${(chapa.espessura_real || chapa.espessura) ? ` ${chapa.espessura_real || chapa.espessura}mm` : ''}`;
                                        const prevMatKey = ci > 0 ? `${plano.chapas[ci-1].material_code || plano.chapas[ci-1].material || '?'}${(plano.chapas[ci-1].espessura_real || plano.chapas[ci-1].espessura) ? ` ${plano.chapas[ci-1].espessura_real || plano.chapas[ci-1].espessura}mm` : ''}` : '';
                                        const matKeys = [...new Set(plano.chapas.map(c => `${c.material_code || c.material || '?'}${(c.espessura_real || c.espessura) ? ` ${c.espessura_real || c.espessura}mm` : ''}`))];
                                        const showMatHeader = matKeys.length > 1 && matKey !== prevMatKey;
                                        const matColors = ['#3b82f6', '#e67e22', '#8b5cf6', '#22c55e', '#ef4444', '#06b6d4', '#ec4899'];
                                        const matColor = matColors[matKeys.indexOf(matKey) % matColors.length];
                                        const matCount = plano.chapas.filter(c => `${c.material_code || c.material || '?'}${(c.espessura_real || c.espessura) ? ` ${c.espessura_real || c.espessura}mm` : ''}` === matKey).length;
                                        return (
                                            <Fragment key={ci}>
                                            {showMatHeader && (
                                                <div style={{
                                                    fontSize: 9, fontWeight: 700, color: matColor,
                                                    textTransform: 'uppercase', letterSpacing: 0.5,
                                                    padding: '4px 8px', marginTop: ci > 0 ? 6 : 0,
                                                    background: `${matColor}10`,
                                                    borderRadius: 4, borderLeft: `3px solid ${matColor}`,
                                                }}>
                                                    {matKey} ({matCount} chapa{matCount > 1 ? 's' : ''})
                                                </div>
                                            )}
                                            <div
                                                onClick={() => { setSelectedChapa(ci); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                                                style={{
                                                    padding: 8, borderRadius: 8, cursor: 'pointer', transition: 'all .15s',
                                                    background: isActive ? 'var(--primary-bg, rgba(230,126,34,0.08))' : chapa.locked ? 'rgba(59,130,246,0.05)' : 'var(--bg-card)',
                                                    border: `2px solid ${multiMaqMode && machineAssignments[ci] ? getMachineColor(machineAssignments[ci].maquina_id) : chapa.locked ? '#3b82f6' : isActive ? 'var(--primary)' : 'var(--border)'}`,
                                                    boxShadow: isActive ? '0 0 0 1px var(--primary)' : 'none',
                                                }}>
                                                {/* Mini SVG */}
                                                <svg width={thumbW} height={thumbH} viewBox={`0 0 ${chapa.comprimento} ${chapa.largura}`}
                                                    style={{ display: 'block', margin: '0 auto 6px', background: 'var(--bg-body)', borderRadius: 3, border: '1px solid var(--border)' }}>
                                                    {chapa.pecas.map((p, pi) => {
                                                        const ref = chapa.refilo || 0;
                                                        const col = getModColor(p.pecaId, p);
                                                        if (p.contour && p.contour.length >= 3) {
                                                            const pts = p.contour.map(v => `${p.x + ref + (v.x / p.w) * p.w},${p.y + ref + (v.y / p.h) * p.h}`).join(' ');
                                                            return <polygon key={pi} points={pts} fill={`${col}30`} stroke={col} strokeWidth={Math.max(1, 2 / thumbScale)} />;
                                                        }
                                                        return <rect key={pi} x={p.x + ref} y={p.y + ref} width={p.w} height={p.h}
                                                            fill={`${col}30`} stroke={col} strokeWidth={Math.max(1, 2 / thumbScale)} />;
                                                    })}
                                                    {(chapa.retalhos || []).map((r, ri) => (
                                                        <rect key={`s${ri}`}
                                                            x={r.x + (chapa.refilo || 0)} y={r.y + (chapa.refilo || 0)}
                                                            width={r.w} height={r.h}
                                                            fill="none" stroke="#9ca3af" strokeWidth={Math.max(1, 2 / thumbScale)} strokeDasharray="6 3" opacity={0.5} />
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
                                                        background: chapa.aproveitamento >= 80 ? '#2563eb' : chapa.aproveitamento >= 60 ? '#d97706' : '#dc2626',
                                                    }} />
                                                </div>
                                                {/* Machine assignment */}
                                                {multiMaqMode && (
                                                    <div style={{ marginTop: 4 }} onClick={e => e.stopPropagation()}>
                                                        <select value={machineAssignments[ci]?.maquina_id || ''}
                                                            onChange={e => assignMachine(ci, e.target.value)}
                                                            style={{
                                                                width: '100%', fontSize: 9, padding: '2px 4px', borderRadius: 4,
                                                                border: `1px solid ${machineAssignments[ci] ? getMachineColor(machineAssignments[ci].maquina_id) || 'var(--border)' : 'var(--border)'}`,
                                                                background: machineAssignments[ci] ? `${getMachineColor(machineAssignments[ci].maquina_id)}10` : 'var(--bg-card)',
                                                                color: 'var(--text-primary)', cursor: 'pointer',
                                                            }}>
                                                            <option value="">Sem maquina</option>
                                                            {maquinas.filter(m => m.ativo !== 0).map(m => (
                                                                <option key={m.id} value={m.id}>{m.nome}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                                {/* Machine badge when assigned and not in multi-machine mode */}
                                                {!multiMaqMode && machineAssignments[ci] && (
                                                    <div style={{
                                                        marginTop: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                                        background: `${getMachineColor(machineAssignments[ci].maquina_id)}15`,
                                                        color: getMachineColor(machineAssignments[ci].maquina_id),
                                                        display: 'inline-block',
                                                    }}>
                                                        {machineAssignments[ci].maquina_nome}
                                                    </div>
                                                )}
                                                {/* Tempo estimado */}
                                                {(() => {
                                                    const realSt = chapaRealStats[ci];
                                                    const estMin = getEstimatedTime(chapa, ci);
                                                    if (!estMin || estMin <= 0) return null;
                                                    const isReal = !!realSt?.tempo_estimado_min;
                                                    return (
                                                        <div style={{
                                                            marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
                                                            fontSize: 9, fontFamily: 'monospace',
                                                            color: isReal ? '#22c55e' : 'var(--text-muted)',
                                                        }}>
                                                            <Clock size={9} />
                                                            <span>{isReal ? '' : '~'}{estMin}min{isReal ? '' : ' est.'}</span>
                                                            {isReal && realSt.dist_corte_m > 0 && (
                                                                <span style={{ color: 'var(--text-muted)' }}>({realSt.dist_corte_m}m corte)</span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                                {/* Status selector (multi-state) */}
                                                {(() => {
                                                    const st = chapaStatuses[ci];
                                                    const status = st?.status || 'pendente';
                                                    const statusOpts = [
                                                        { val: 'pendente', label: 'Pendente', color: '#9ca3af', icon: '○' },
                                                        { val: 'em_corte', label: 'Em Corte', color: '#f59e0b', icon: '◐' },
                                                        { val: 'cortada', label: 'Cortada', color: '#22c55e', icon: '●' },
                                                        { val: 'conferida', label: 'Conferida', color: '#3b82f6', icon: '✓' },
                                                    ];
                                                    const cur = statusOpts.find(s => s.val === status) || statusOpts[0];
                                                    return (
                                                        <select
                                                            value={status}
                                                            onClick={e => e.stopPropagation()}
                                                            onChange={e => { e.stopPropagation(); updateChapaStatus(ci, e.target.value); marcarChapaCortada(ci); }}
                                                            style={{
                                                                marginTop: 5, width: '100%', padding: '4px 6px', borderRadius: 5,
                                                                fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                                                border: `1px solid ${cur.color}40`,
                                                                background: `${cur.color}10`,
                                                                color: cur.color,
                                                                textAlign: 'center',
                                                            }}
                                                        >
                                                            {statusOpts.map(s => <option key={s.val} value={s.val}>{s.icon} {s.label}</option>)}
                                                        </select>
                                                    );
                                                })()}
                                            </div>
                                            </Fragment>
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
                                </div>

                                {/* RIGHT: Detail view + Transfer panel */}
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 0 }}>
                                <div ref={chapaVizContainerRef} style={{ flex: 1, minWidth: 0, position: 'relative', background: isFullscreen ? 'var(--bg-primary)' : undefined }}>
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
                                            espacoPecas={espacoPecas}
                                            allChapas={plano.chapas}
                                            classifyLocal={classifyLocal}
                                            classColors={classColors}
                                            classLabels={classLabels}
                                            onGerarGcode={handleGerarGcode}
                                            onGerarGcodePeca={handleGerarGcodePeca}
                                            gcodeLoading={gcodeLoading}
                                            onView3D={(piece) => setView3dPeca(piece)}
                                            onPrintLabel={(chapaIdx) => {
                                                // Navigate to etiquetas tab with chapa filter
                                                setTab('etiquetas');
                                            }}
                                            onPrintSingleLabel={(piece) => setPrintLabelPeca(piece)}
                                            sobraMinW={sobraMinW}
                                            sobraMinH={sobraMinH}
                                            onPrintFolha={(chapaIdx) => printFolhaProducao(plano.chapas[chapaIdx], chapaIdx, pecasMap, loteAtual, getModColor, kerf, refilo, plano.chapas.length)}
                                            onSaveRetalhos={async (chapaIdx, retalhos, refugos) => {
                                                try {
                                                    const ch = plano.chapas[chapaIdx];
                                                    let saved = 0;
                                                    for (const r of retalhos) {
                                                        await api.post('/cnc/retalhos', {
                                                            nome: `Chapa ${chapaIdx + 1} — ${Math.round(r.w)}×${Math.round(r.h)}`,
                                                            material_code: ch.material_code || ch.material || '',
                                                            espessura_real: ch.espessura || 18,
                                                            comprimento: Math.round(r.w),
                                                            largura: Math.round(r.h),
                                                        });
                                                        saved++;
                                                    }
                                                    notify(`${saved} retalho(s) salvos no estoque, ${refugos.length} refugo(s) descartados`);
                                                } catch (e) {
                                                    notify(e.error || 'Erro ao salvar retalhos');
                                                }
                                            }}
                                            setTab={setTab}
                                            validationConflicts={validationResult?.conflicts || []}
                                            machineArea={selectedMachineArea}
                                            timerInfo={null && {
                                                elapsed: getTimerElapsed(selectedChapa),
                                                running: chapaTimers[getTimerKey(selectedChapa)]?.running || false,
                                                hasTimer: !!chapaTimers[getTimerKey(selectedChapa)],
                                                estMin: getEstimatedTime(plano.chapas[selectedChapa], selectedChapa),
                                                formatTimer,
                                                onStart: () => startTimer(selectedChapa),
                                                onStop: () => stopTimer(selectedChapa),
                                                onReset: () => resetTimer(selectedChapa),
                                            }}
                                        />
                                    )}

                                    {/* Keyboard shortcuts "?" button */}
                                    <button
                                        onClick={() => setShowShortcutsHelp(prev => !prev)}
                                        title="Atalhos de teclado (?)"
                                        style={{
                                            position: 'absolute', bottom: 12, right: 12, zIndex: 20,
                                            width: 28, height: 28, borderRadius: '50%',
                                            background: showShortcutsHelp ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.5)',
                                            color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
                                            cursor: 'pointer', fontSize: 14, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all .2s',
                                        }}
                                    >?</button>

                                    {/* Keyboard shortcuts help panel */}
                                    {showShortcutsHelp && (
                                        <div style={{
                                            position: 'absolute', bottom: 48, right: 12, zIndex: 25,
                                            background: 'rgba(0,0,0,0.85)', color: '#fff',
                                            borderRadius: 10, padding: '12px 16px',
                                            fontSize: 11, lineHeight: 1.8, minWidth: 220,
                                            backdropFilter: 'blur(8px)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                        }}>
                                            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: '#93c5fd' }}>Atalhos de Teclado</div>
                                            {[
                                                ['1-9', 'Selecionar chapa'],
                                                ['\u2190 \u2192', 'Chapa anterior / pr\u00f3xima'],
                                                ['R', 'Rotacionar pe\u00e7a selecionada'],
                                                ['G', 'Gerar G-Code da chapa'],
                                                ['E', 'Ir para G-Code/Etiquetas'],
                                                ['P', 'Imprimir folha de produ\u00e7\u00e3o'],
                                                ['D', 'Ir para Dashboard'],
                                                ['Espa\u00e7o', 'Marcar/desmarcar chapa cortada'],
                                                ['F', 'Tela cheia'],
                                                ['Esc', 'Limpar sele\u00e7\u00e3o'],
                                                ['Ctrl+Z', 'Desfazer'],
                                                ['Ctrl+Y', 'Refazer'],
                                                ['?', 'Mostrar/ocultar atalhos'],
                                            ].map(([key, desc], i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                                    <kbd style={{
                                                        background: 'rgba(255,255,255,0.15)', borderRadius: 4,
                                                        padding: '1px 6px', fontSize: 10, fontFamily: 'monospace',
                                                        fontWeight: 600, whiteSpace: 'nowrap',
                                                    }}>{key}</kbd>
                                                    <span style={{ color: 'rgba(255,255,255,0.8)' }}>{desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ═══ SIMULADOR INLINE ═══ */}
                                {inlineSimData && inlineSimData.chapaIdx === selectedChapa && (
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
                                        height: 280, background: 'var(--bg-card)', borderTop: '2px solid var(--primary)',
                                        display: 'flex', flexDirection: 'column',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Play size={12} /> Simulador CNC — Chapa {selectedChapa + 1}
                                            </span>
                                            <button onClick={() => setInlineSimData(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div style={{ flex: 1, minHeight: 0 }}>
                                            <GcodeSimWrapper
                                                gcode={inlineSimData.gcode}
                                                chapa={inlineSimData.chapa}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* ═══ PAINEL DE TRANSFERÊNCIA (inline à direita da chapa) ═══ */}
                                {transferArea.length > 0 && plano && (() => {
                                    const currentChapa = plano.chapas[selectedChapa];
                                    const currentMat = currentChapa?.material_code || currentChapa?.material || '';
                                    const currentEsp = currentChapa?.espessura || 0;
                                    const currentVeio = currentChapa?.veio || 'sem_veio';

                                    const compatItems = transferArea.map((tp, ti) => {
                                        const tpMat = tp.fromMaterial || '';
                                        const tpEsp = tp.espessura || 0;
                                        const tpVeio = tp.veio || 'sem_veio';
                                        const compatible = tpMat === currentMat
                                            && Math.abs(tpEsp - currentEsp) <= 0.1
                                            && (tpVeio === 'sem_veio' || currentVeio === 'sem_veio' || tpVeio === currentVeio);
                                        return { ...tp, _idx: ti, _compatible: compatible };
                                    });
                                    const compatCount = compatItems.filter(c => c._compatible).length;
                                    const incompatCount = transferArea.length - compatCount;

                                    return (
                                        <div style={{
                                            width: transferOpen ? 220 : 36,
                                            minWidth: transferOpen ? 220 : 36,
                                            transition: 'width .2s, min-width .2s',
                                            borderLeft: '1px solid var(--border)',
                                            background: 'var(--bg-card)',
                                            display: 'flex', flexDirection: 'column',
                                            overflow: 'hidden', borderRadius: '0 8px 8px 0',
                                        }}>
                                            {!transferOpen ? (
                                                <button
                                                    onClick={() => setTransferOpen(true)}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        padding: '12px 0', display: 'flex', flexDirection: 'column',
                                                        alignItems: 'center', gap: 6, color: 'var(--text-muted)',
                                                    }}
                                                    title="Abrir painel de transferência"
                                                >
                                                    <ArrowLeftRight size={14} />
                                                    <span style={{
                                                        background: compatCount > 0 ? '#1e40af' : '#64748b',
                                                        color: '#fff', borderRadius: 10,
                                                        padding: '1px 6px', fontSize: 9, fontWeight: 800,
                                                        minWidth: 16, textAlign: 'center',
                                                    }}>{transferArea.length}</span>
                                                    {compatCount > 0 && (
                                                        <span style={{ fontSize: 8, color: '#16a34a', fontWeight: 700 }}>
                                                            {compatCount}✓
                                                        </span>
                                                    )}
                                                </button>
                                            ) : (
                                                <>
                                                    <div style={{
                                                        padding: '8px 10px', borderBottom: '1px solid var(--border)',
                                                        background: '#1e293b', color: '#fff',
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                    }}>
                                                        <ArrowLeftRight size={12} />
                                                        <span style={{ fontSize: 10, fontWeight: 700, flex: 1 }}>
                                                            Transferência
                                                        </span>
                                                        <button onClick={() => setTransferOpen(false)}
                                                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2, display: 'flex' }}
                                                            title="Minimizar">
                                                            <X size={13} />
                                                        </button>
                                                    </div>

                                                    <div style={{
                                                        padding: '4px 10px', fontSize: 9, color: 'var(--text-muted)',
                                                        background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)',
                                                    }}>
                                                        {compatCount > 0 ? (
                                                            <span><b style={{ color: '#16a34a' }}>{compatCount}</b> compatíve{compatCount === 1 ? 'l' : 'is'} c/ esta chapa</span>
                                                        ) : (
                                                            <span style={{ color: '#dc2626' }}>Nenhuma compatível c/ esta chapa</span>
                                                        )}
                                                        {incompatCount > 0 && (
                                                            <span style={{ marginLeft: 4, color: '#94a3b8' }}>
                                                                · {incompatCount} outra{incompatCount > 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
                                                        {compatItems.filter(c => c._compatible).map(tp => {
                                                            const piece = pecasMap[tp.pecaId];
                                                            return (
                                                                <div key={tp._idx} style={{
                                                                    padding: 6, marginBottom: 4, background: '#f0f9ff',
                                                                    border: '1px solid #bae6fd', borderRadius: 4, fontSize: 10,
                                                                }}>
                                                                    <div style={{ fontWeight: 700, fontSize: 10, color: '#0c4a6e', marginBottom: 1 }}>
                                                                        {piece?.descricao?.substring(0, 22) || `#${tp.pecaId}`}
                                                                    </div>
                                                                    <div style={{ color: '#64748b', fontSize: 9, marginBottom: 4 }}>
                                                                        {Math.round(tp.w)}×{Math.round(tp.h)}mm
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleAdjust({ action: 'from_transfer', transferIdx: tp._idx, targetChapaIdx: selectedChapa })}
                                                                        style={{
                                                                            padding: '3px 10px', fontSize: 9, fontWeight: 700, borderRadius: 4,
                                                                            background: '#1e40af', color: '#fff',
                                                                            border: 'none', cursor: 'pointer', width: '100%',
                                                                        }}>
                                                                        ↓ Colocar nesta chapa
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                        {compatItems.filter(c => !c._compatible).length > 0 && (
                                                            <div style={{ fontSize: 9, color: '#94a3b8', padding: '6px 2px 3px', fontWeight: 600, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                                                                Incompatíveis (cor/espessura)
                                                            </div>
                                                        )}
                                                        {compatItems.filter(c => !c._compatible).map(tp => {
                                                            const piece = pecasMap[tp.pecaId];
                                                            return (
                                                                <div key={tp._idx} style={{
                                                                    padding: 5, marginBottom: 3, background: 'var(--bg-muted)',
                                                                    border: '1px solid var(--border)', borderRadius: 4, fontSize: 10,
                                                                    opacity: 0.5,
                                                                }}>
                                                                    <div style={{ fontWeight: 600, fontSize: 9, color: 'var(--text-muted)' }}>
                                                                        {piece?.descricao?.substring(0, 22) || `#${tp.pecaId}`}
                                                                    </div>
                                                                    <div style={{ color: '#94a3b8', fontSize: 8 }}>
                                                                        {Math.round(tp.w)}×{Math.round(tp.h)}mm · {tp.fromMaterial || '?'} · {tp.espessura || '?'}mm
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })()}
                                </div>
                            </div>}

                            {/* ═══ Relatório de Desperdício ═══ */}
                            <RelatorioDesperdicio loteId={loteAtual?.id} notify={notify} />
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

            {/* ═══ Modal Painel de Ferramentas ═══ */}
            {toolPanelOpen && toolPanel && (
                <ToolPanelModal
                    data={toolPanel}
                    loteId={loteAtual?.id}
                    onClose={() => setToolPanelOpen(false)}
                    onSave={() => { setToolPanelOpen(false); setToolPanelDirty(false); notify('Configurações salvas!', 'success'); }}
                />
            )}

            {/* ═══ Modal Preview G-Code ═══ */}
            {gcodePreview && (
                <GcodePreviewModal
                    data={gcodePreview}
                    onDownload={handleDownloadGcode}
                    onSendToMachine={handleSendToMachine}
                    onClose={() => setGcodePreview(null)}
                    onSimulate={(gcodeText, chapaData) => {
                        const moves = parseGcodeToMoves(gcodeText);
                        setToolpathMoves(moves);
                        setToolpathChapa(chapaData);
                        setToolpathOpen(true);
                        setGcodePreview(null);
                    }}
                />
            )}

            {/* Transferência movida para inline à direita da chapa */}

            {/* ═══ Modal Custos (Feature 1) ═══ */}
            {showCustos && custosData && (
                <Modal title="Custos Detalhados" close={() => setShowCustos(false)} w={800}>
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>R$ {custosData.total_geral?.toFixed(2)}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Custo Total</div>
                        </div>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e', fontFamily: 'monospace' }}>
                                R$ {custosData.chapas?.length > 0 ? (custosData.chapas.reduce((s, c) => s + c.custo_material, 0)).toFixed(2) : '0.00'}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Material</div>
                        </div>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6', fontFamily: 'monospace' }}>
                                R$ {custosData.chapas?.length > 0 ? (custosData.chapas.reduce((s, c) => s + c.custo_usinagem, 0)).toFixed(2) : '0.00'}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Usinagem</div>
                        </div>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
                                R$ {custosData.chapas?.length > 0 ? (custosData.chapas.reduce((s, c) => s + c.custo_bordas, 0)).toFixed(2) : '0.00'}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Bordas</div>
                        </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
                        Config: R$ {custosData.config?.custo_hora_maquina}/h maquina, R$ {custosData.config?.custo_troca_ferramenta}/troca
                    </div>

                    {/* Per-sheet breakdown */}
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {custosData.chapas?.map((ch, ci) => (
                            <div key={ci} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                                <div
                                    onClick={() => setCustosExpanded(prev => ({ ...prev, [ci]: !prev[ci] }))}
                                    style={{
                                        padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'var(--bg-muted)', borderBottom: custosExpanded[ci] ? '1px solid var(--border)' : 'none',
                                    }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Box size={13} style={{ color: 'var(--primary)' }} />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Chapa {ch.chapaIdx + 1} — {ch.material}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            Mat: R${ch.custo_material.toFixed(2)} | Usin: R${ch.custo_usinagem.toFixed(2)} | Borda: R${ch.custo_bordas.toFixed(2)} | Desp: R${ch.custo_desperdicio.toFixed(2)}
                                        </span>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>R$ {ch.custo_total.toFixed(2)}</span>
                                        {custosExpanded[ci] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                    </div>
                                </div>
                                {custosExpanded[ci] && (
                                    <div style={{ padding: '8px 14px' }}>
                                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>#</th>
                                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Descricao</th>
                                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Material</th>
                                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Usinagem</th>
                                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Bordas</th>
                                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ch.pecas.map((p, pi) => (
                                                    <tr key={pi} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{p.pecaIdx + 1}</td>
                                                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>{p.desc}</td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>R$ {p.custo_material.toFixed(2)}</td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>R$ {p.custo_usinagem.toFixed(2)}</td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>R$ {p.custo_bordas.toFixed(2)}</td>
                                                        <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>R$ {p.custo_total.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            {/* ═══ Modal Relatório de Bordas ═══ */}
            {showBordas && bordasData && (
                <Modal title="Relatorio de Bordas / Fitagem" close={() => setShowBordas(false)} w={800}>
                    {!bordasData.bordas || bordasData.bordas.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                            Nenhuma borda/fita encontrada neste lote.
                        </div>
                    ) : (<>
                        {/* Summary */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                    {bordasData.bordas.reduce((s, b) => s + b.metros, 0).toFixed(1)}m
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Metros</div>
                            </div>
                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' }}>
                                    {bordasData.bordas.length}
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Tipos de Borda</div>
                            </div>
                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6', fontFamily: 'monospace' }}>
                                    {bordasData.bordas.reduce((s, b) => s + b.quantidade_pecas, 0)}
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Pecas c/ Borda</div>
                            </div>
                        </div>

                        {/* Table per borda type */}
                        <div style={{ maxHeight: 450, overflowY: 'auto' }}>
                            {bordasData.bordas.map((b, bi) => (
                                <div key={bi} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                                    <div
                                        onClick={() => setBordasExpanded(prev => ({ ...prev, [bi]: !prev[bi] }))}
                                        style={{
                                            padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            background: 'var(--bg-muted)', borderBottom: bordasExpanded[bi] ? '1px solid var(--border)' : 'none',
                                        }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <PenTool size={13} style={{ color: '#f59e0b' }} />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{b.tipo}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.quantidade_pecas} peca(s)</span>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>{b.metros.toFixed(2)}m</span>
                                            {bordasExpanded[bi] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </div>
                                    </div>
                                    {bordasExpanded[bi] && (
                                        <div style={{ padding: '8px 14px' }}>
                                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Peca</th>
                                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Modulo</th>
                                                        <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Lado</th>
                                                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Comp. (mm)</th>
                                                        <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Qtd</th>
                                                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Metros</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {b.detalhes.map((d, di) => (
                                                        <tr key={di} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '4px 6px', fontWeight: 600 }}>{d.descricao || `#${d.peca_id}`}</td>
                                                            <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{d.modulo}</td>
                                                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>{d.lado}</td>
                                                            <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{d.comprimento_mm}</td>
                                                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>{d.quantidade}</td>
                                                            <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{d.metros.toFixed(3)}m</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>)}
                </Modal>
            )}

            {/* ═══ Modal Historico / Diff (Feature 4) ═══ */}
            {showVersions && (
                <Modal title="Historico de Versoes" close={() => { setShowVersions(false); setDiffResult(null); setDiffV1(null); setDiffV2(null); }} w={700}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                        Selecione duas versoes para comparar
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Versao A (anterior)</label>
                            <select value={diffV1 || ''} onChange={e => setDiffV1(e.target.value || null)} className={Z.inp} style={{ width: '100%', fontSize: 12, marginTop: 4 }}>
                                <option value="">Selecionar...</option>
                                {versions.map(v => (
                                    <option key={v.id} value={v.id}>#{v.id} — {v.acao_origem} — {new Date(v.criado_em).toLocaleString('pt-BR')}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Versao B (posterior)</label>
                            <select value={diffV2 || ''} onChange={e => setDiffV2(e.target.value || null)} className={Z.inp} style={{ width: '100%', fontSize: 12, marginTop: 4 }}>
                                <option value="">Selecionar...</option>
                                {versions.map(v => (
                                    <option key={v.id} value={v.id}>#{v.id} — {v.acao_origem} — {new Date(v.criado_em).toLocaleString('pt-BR')}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button onClick={loadDiff} disabled={!diffV1 || !diffV2 || diffLoading} className={Z.btn}
                                style={{ padding: '8px 20px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <GitCompare size={13} /> {diffLoading ? 'Comparando...' : 'Comparar'}
                            </button>
                        </div>
                    </div>

                    {diffResult && (
                        <>
                            {/* Summary */}
                            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                                    Resumo: {diffResult.changes?.length || 0} alteracao(es)
                                </div>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11 }}>
                                    {diffResult.summary?.movido > 0 && <span style={{ color: '#3b82f6' }}>{diffResult.summary.movido} movida(s)</span>}
                                    {diffResult.summary?.rotacionado > 0 && <span style={{ color: '#8b5cf6' }}>{diffResult.summary.rotacionado} rotacionada(s)</span>}
                                    {diffResult.summary?.transferido > 0 && <span style={{ color: '#f59e0b' }}>{diffResult.summary.transferido} transferida(s)</span>}
                                    {diffResult.summary?.adicionado > 0 && <span style={{ color: '#22c55e' }}>{diffResult.summary.adicionado} adicionada(s)</span>}
                                    {diffResult.summary?.removido > 0 && <span style={{ color: '#ef4444' }}>{diffResult.summary.removido} removida(s)</span>}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Chapas: {diffResult.chapas_v1} → {diffResult.chapas_v2}
                                </div>
                            </div>

                            {/* Changes table */}
                            {diffResult.changes?.length > 0 && (
                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Tipo</th>
                                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Peca</th>
                                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Chapa</th>
                                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Detalhes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {diffResult.changes.map((c, i) => {
                                                const typeColors = { movido: '#3b82f6', rotacionado: '#8b5cf6', transferido: '#f59e0b', adicionado: '#22c55e', removido: '#ef4444' };
                                                return (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '4px 6px' }}>
                                                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${typeColors[c.tipo] || '#6b7280'}15`, color: typeColors[c.tipo] || '#6b7280' }}>
                                                                {c.tipo}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '4px 6px', fontWeight: 600 }}>{c.pecaDesc}</td>
                                                        <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>
                                                            {c.tipo === 'transferido' ? `Ch${c.de?.chapaIdx + 1} → Ch${c.para?.chapaIdx + 1}` : `Ch${c.chapaIdx + 1}`}
                                                        </td>
                                                        <td style={{ padding: '4px 6px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 10 }}>
                                                            {c.de && c.para && c.tipo !== 'transferido' && `(${c.de.x},${c.de.y}) → (${c.para.x},${c.para.y})`}
                                                            {c.tipo === 'transferido' && c.de && c.para && `(${c.de.x},${c.de.y}) → (${c.para.x},${c.para.y})`}
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

                    {/* Versions list */}
                    {!diffResult && (
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>#</th>
                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Acao</th>
                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Data</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {versions.map(v => (
                                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '4px 6px', fontWeight: 600 }}>{v.id}</td>
                                            <td style={{ padding: '4px 6px' }}>{v.acao_origem}</td>
                                            <td style={{ padding: '4px 6px', color: 'var(--text-muted)' }}>{new Date(v.criado_em).toLocaleString('pt-BR')}</td>
                                        </tr>
                                    ))}
                                    {versions.length === 0 && (
                                        <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma versao salva ainda</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Modal>
            )}

            {/* ═══ Toolpath Simulator (Feature 3) ═══ */}
            <ToolpathSimulator
                chapData={toolpathChapa}
                operations={toolpathMoves}
                isOpen={toolpathOpen}
                onClose={() => { setToolpathOpen(false); setToolpathMoves([]); setToolpathChapa(null); }}
            />

            {/* ══ Modal 3D flutuante ══ */}
            {/* ══ 3D Viewer SlidePanel ══ */}
            <SlidePanel isOpen={!!view3dPeca} onClose={() => setView3dPeca(null)} title={view3dPeca?.descricao || 'Visualização 3D'} width={560}>
                {view3dPeca && (<>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                        {view3dPeca.comprimento} × {view3dPeca.largura} × {view3dPeca.espessura} mm · {view3dPeca.material_code}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 12, background: '#1a1a2e', borderRadius: 10, marginBottom: 16 }}>
                        <PecaViewer3D peca={view3dPeca} width={Math.min(500, window.innerWidth - 120)} height={380} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {view3dPeca.borda_frontal && (
                            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Frontal: {view3dPeca.borda_cor_frontal || view3dPeca.borda_frontal}
                            </span>
                        )}
                        {view3dPeca.borda_traseira && (
                            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Traseira: {view3dPeca.borda_cor_traseira || view3dPeca.borda_traseira}
                            </span>
                        )}
                        {view3dPeca.borda_esq && (
                            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Esquerda: {view3dPeca.borda_cor_esq || view3dPeca.borda_esq}
                            </span>
                        )}
                        {view3dPeca.borda_dir && (
                            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                                Direita: {view3dPeca.borda_cor_dir || view3dPeca.borda_dir}
                            </span>
                        )}
                        {(() => {
                            const ops = (() => { try { const d = typeof view3dPeca.machining_json === 'string' ? JSON.parse(view3dPeca.machining_json) : view3dPeca.machining_json; return d?.workers || []; } catch { return []; } })();
                            return ops.length > 0 && (
                                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: '#e11d4815', color: '#e11d48', fontWeight: 600 }}>
                                    {ops.length} usinagem{ops.length > 1 ? 'ns' : ''}
                                </span>
                            );
                        })()}
                    </div>
                </>)}
            </SlidePanel>

            {/* ══ Print label SlidePanel ══ */}
            <SlidePanel isOpen={!!printLabelPeca} onClose={() => setPrintLabelPeca(null)} title="Imprimir Etiqueta" width={420}>
                {printLabelPeca && (<>
                    <div className="glass-card" style={{ padding: 14, marginBottom: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{printLabelPeca.descricao}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            {printLabelPeca.comprimento} × {printLabelPeca.largura} × {printLabelPeca.espessura} mm · {printLabelPeca.material_code}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            Módulo: {printLabelPeca.modulo_desc} · Qtd: {printLabelPeca.quantidade}
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button onClick={() => {
                            setPrintLabelPeca(null);
                            if (setTab) setTab('etiquetas');
                        }} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '12px 20px', borderRadius: 8,
                            background: 'var(--primary)', color: '#fff',
                            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        }}>
                            <TagIcon size={15} /> Abrir Etiquetas
                        </button>
                        <button onClick={() => {
                            const win = window.open('', '_blank', 'width=400,height=300');
                            if (win) {
                                const p = printLabelPeca;
                                const bordas = ['frontal','traseira','esq','dir'].map(s => {
                                    const v = p[`borda_${s}`];
                                    const c = p[`borda_cor_${s}`];
                                    return v ? `${s}: ${c || v}` : null;
                                }).filter(Boolean).join(' | ');
                                win.document.write(`<html><head><style>
                                    body { font-family: Arial, sans-serif; padding: 10px; margin: 0; }
                                    .label { border: 1px solid #000; padding: 8px; width: 95mm; }
                                    .name { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
                                    .dims { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
                                    .info { font-size: 10px; color: #555; margin-bottom: 2px; }
                                    @media print { body { padding: 0; } }
                                </style></head><body onload="window.print();window.close()">
                                    <div class="label">
                                        <div class="name">${p.descricao}</div>
                                        <div class="dims">${p.comprimento} × ${p.largura} × ${p.espessura} mm</div>
                                        <div class="info">${p.material || ''} · ${p.modulo_desc || ''}</div>
                                        <div class="info">Qtd: ${p.quantidade} · ${p.persistent_id || p.upmcode || ''}</div>
                                        ${bordas ? `<div class="info">Fitas: ${bordas}</div>` : ''}
                                    </div>
                                </body></html>`);
                                win.document.close();
                            }
                            setPrintLabelPeca(null);
                        }} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            padding: '12px 20px', borderRadius: 8,
                            background: 'var(--bg-muted)', color: 'var(--text-primary)',
                            border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}>
                            <Printer size={15} /> Imprimir Rápido
                        </button>
                    </div>
                </>)}
            </SlidePanel>

            {/* ═══ Modal Review Checklist ═══ */}
            {showReview && reviewData && (
                <Modal title="Review Pre-Corte" close={() => setShowReview(false)} w={600}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                        {reviewData.passed}/{reviewData.total} verificações OK
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {reviewData.checks.map(c => (
                            <div key={c.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                                background: c.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                                border: `1px solid ${c.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                            }}>
                                <span style={{ fontSize: 16 }}>{c.ok ? '✓' : '✗'}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: c.ok ? '#22c55e' : '#ef4444' }}>{c.label}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.detail}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {reviewData.allOk && (
                        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                            <CheckCircle2 size={24} style={{ color: '#22c55e' }} />
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', marginTop: 6 }}>Pronto para cortar!</div>
                        </div>
                    )}
                </Modal>
            )}

            {/* ═══ Modal Material Report ═══ */}
            {showMaterialReport && materialReport && (
                <Modal title="Relatorio de Materiais — Lista de Compras" close={() => setShowMaterialReport(false)} w={800}>
                    {/* Materiais */}
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Chapas</div>
                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 16 }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Material</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Qtd</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Dimensao</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Area m2</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Aprov.</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Custo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materialReport.materiais.map((m, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '6px', fontWeight: 600 }}>{m.material}{m.chapas_retalho > 0 && <span style={{ fontSize: 9, color: '#06b6d4', marginLeft: 4 }}>({m.chapas_retalho} ret.)</span>}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{m.chapas}</td>
                                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 10 }}>{m.dim_chapa}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{m.area_total_m2}</td>
                                    <td style={{ textAlign: 'center', color: m.aproveitamento_medio >= 80 ? '#22c55e' : m.aproveitamento_medio >= 60 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>{m.aproveitamento_medio}%</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{m.custo_total > 0 ? `R$ ${m.custo_total.toFixed(2)}` : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ borderTop: '2px solid var(--text-primary)' }}>
                                <td style={{ padding: '6px', fontWeight: 700 }}>TOTAL</td>
                                <td style={{ textAlign: 'center', fontWeight: 700 }}>{materialReport.resumo.total_chapas}</td>
                                <td />
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{materialReport.resumo.area_total_m2.toFixed(2)} m2</td>
                                <td />
                                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{materialReport.resumo.custo_total > 0 ? `R$ ${materialReport.resumo.custo_total.toFixed(2)}` : '-'}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Bordas */}
                    {materialReport.bordas.length > 0 && (
                        <>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Fitas de Borda</div>
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Tipo/Cor</th>
                                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Metros</th>
                                        <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Pecas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {materialReport.bordas.map((b, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '6px', fontWeight: 600 }}>{b.tipo}</td>
                                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{b.metros} m</td>
                                            <td style={{ textAlign: 'right' }}>{b.pecas}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}

                    {/* Print button */}
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                        <button onClick={() => {
                            const win = window.open('', '_blank');
                            const mr = materialReport;
                            win.document.write(`<!DOCTYPE html><html><head><title>Lista de Materiais</title>
                            <style>body{font-family:Arial,sans-serif;margin:20px;font-size:12px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}th{background:#f5f5f5;font-weight:700}h2{margin:0 0 10px}@media print{.no-print{display:none}}</style></head><body>
                            <div class="no-print" style="margin-bottom:12px"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;background:#e67e22;color:#fff;border:none;border-radius:6px">Imprimir</button></div>
                            <h2>Lista de Materiais — ${loteAtual?.nome || ''}</h2>
                            <table><tr><th>Material</th><th>Qtd Chapas</th><th>Dimensao</th><th>Area m2</th><th>Aprov.</th><th>Custo</th></tr>
                            ${mr.materiais.map(m => `<tr><td>${m.material}</td><td style="text-align:center">${m.chapas}</td><td>${m.dim_chapa}</td><td style="text-align:right">${m.area_total_m2}</td><td style="text-align:center">${m.aproveitamento_medio}%</td><td style="text-align:right">${m.custo_total > 0 ? 'R$ ' + m.custo_total.toFixed(2) : '-'}</td></tr>`).join('')}
                            <tr style="border-top:2px solid #333"><td><b>TOTAL</b></td><td style="text-align:center"><b>${mr.resumo.total_chapas}</b></td><td></td><td style="text-align:right"><b>${mr.resumo.area_total_m2.toFixed(2)} m2</b></td><td></td><td style="text-align:right"><b>${mr.resumo.custo_total > 0 ? 'R$ ' + mr.resumo.custo_total.toFixed(2) : '-'}</b></td></tr></table>
                            ${mr.bordas.length > 0 ? `<h3>Fitas de Borda</h3><table><tr><th>Tipo</th><th>Metros</th><th>Pecas</th></tr>${mr.bordas.map(b => `<tr><td>${b.tipo}</td><td style="text-align:right">${b.metros} m</td><td style="text-align:right">${b.pecas}</td></tr>`).join('')}</table>` : ''}
                            <div style="margin-top:12px;font-size:9px;color:#999">Ornato ERP · ${new Date().toLocaleDateString('pt-BR')}</div>
                            </body></html>`);
                            win.document.close();
                        }} className={Z.btn2} style={{ padding: '10px 24px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Printer size={14} /> Imprimir Lista
                        </button>
                    </div>
                </Modal>
            )}

            {/* ═══ Modal G-Code History ═══ */}
            {showGcodeHistory && (
                <Modal title="Historico de Geracao G-Code" close={() => setShowGcodeHistory(false)} w={700}>
                    {gcodeHistory.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma geração registrada.</div>
                    ) : (
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Data</th>
                                    <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Chapa</th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Maquina</th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Arquivo</th>
                                    <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10 }}>Ops</th>
                                    <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Tempo</th>
                                    <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Gerado por</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gcodeHistory.map((h, i) => (
                                    <tr key={h.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-body)' }}>
                                        <td style={{ padding: '5px 6px', fontSize: 10, color: 'var(--text-muted)' }}>{new Date(h.criado_em).toLocaleString('pt-BR')}</td>
                                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{(h.chapa_idx ?? -1) + 1}</td>
                                        <td style={{ padding: '5px 6px' }}>{h.maquina_nome || '-'}</td>
                                        <td style={{ padding: '5px 6px', fontFamily: 'monospace', fontSize: 10 }}>{h.filename || '-'}</td>
                                        <td style={{ textAlign: 'center' }}>{h.total_operacoes}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{h.tempo_estimado_min > 0 ? `${h.tempo_estimado_min}m` : '-'}</td>
                                        <td style={{ padding: '5px 6px', fontSize: 10, color: 'var(--text-muted)' }}>{h.user_nome || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </Modal>
            )}

            {/* ═══ SlidePanel Conferência Pós-Corte ═══ */}
            <SlidePanel isOpen={showConferencia} onClose={() => setShowConferencia(false)} title="Conferência Pós-Corte" width={580}>
                {plano && plano.chapas && (<div>
                    {/* Resumo */}
                    {(() => {
                        const total = plano.chapas.reduce((s, c) => s + (c.pecas?.length || 0), 0);
                        const ok = conferencia.filter(c => c.status === 'ok').length;
                        const def = conferencia.filter(c => c.status === 'defeito').length;
                        const pend = total - ok - def;
                        return (
                            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>{ok}</div>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: '#22c55e' }}>OK</div>
                                </div>
                                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#ef4444' }}>{def}</div>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: '#ef4444' }}>Defeito</div>
                                </div>
                                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-muted)' }}>{pend}</div>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Pendente</div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Por chapa */}
                    {plano.chapas.map((chapa, ci) => {
                        const confMap = {};
                        for (const c of conferencia) { if (c.chapa_idx === ci) confMap[c.peca_idx] = c; }
                        const allOk = chapa.pecas.every((_, pi) => confMap[pi]?.status === 'ok');
                        return (
                            <div key={ci} style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: allOk ? 'rgba(34,197,94,0.06)' : 'var(--bg-muted)', border: `1px solid ${allOk ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` }}>
                                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                                        {allOk && <Check size={13} style={{ color: '#22c55e', marginRight: 4, verticalAlign: -2 }} />}
                                        Chapa {ci + 1} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({chapa.pecas.length} peças)</span>
                                    </span>
                                    {!allOk && (
                                        <button onClick={() => conferirChapaOk(ci)} style={{
                                            fontSize: 10, padding: '4px 12px', borderRadius: 6,
                                            background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700,
                                        }}>Tudo OK</button>
                                    )}
                                </div>
                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {chapa.pecas.map((p, pi) => {
                                        const conf = confMap[pi];
                                        const st = conf?.status || 'pendente';
                                        return (
                                            <div key={pi} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                                                borderRadius: 6, fontSize: 11, background: st === 'defeito' ? 'rgba(239,68,68,0.05)' : 'transparent',
                                            }}>
                                                <span style={{
                                                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                                    background: st === 'ok' ? '#22c55e' : st === 'defeito' ? '#ef4444' : '#9ca3af',
                                                }} />
                                                <span style={{ flex: 1, fontWeight: 500 }}>{p.desc || `Peça ${pi + 1}`}</span>
                                                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                    {p.w}×{p.h}
                                                </span>
                                                {st === 'pendente' && (<>
                                                    <button onClick={() => conferirPeca(ci, pi, p.desc, 'ok')} style={{
                                                        fontSize: 9, padding: '2px 8px', borderRadius: 4,
                                                        background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)',
                                                        cursor: 'pointer', fontWeight: 700,
                                                    }}>OK</button>
                                                    <button onClick={() => {
                                                        const obs = prompt('Descreva o defeito:');
                                                        if (obs !== null) conferirPeca(ci, pi, p.desc, 'defeito', 'outro', obs);
                                                    }} style={{
                                                        fontSize: 9, padding: '2px 8px', borderRadius: 4,
                                                        background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                                                        cursor: 'pointer', fontWeight: 700,
                                                    }}>Defeito</button>
                                                </>)}
                                                {st === 'ok' && <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 700 }}>✓</span>}
                                                {st === 'defeito' && (
                                                    <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 600 }} title={conf?.defeito_obs || ''}>
                                                        ✗ {conf?.defeito_tipo || 'defeito'}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>)}
            </SlidePanel>

            {/* ═══ SlidePanel Fila de Produção ═══ */}
            <SlidePanel isOpen={showFila} onClose={() => setShowFila(false)} title="Fila de Produção" width={620}>
                <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                    <button onClick={enviarParaFila} className={Z.btn}
                        style={{ fontSize: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Send size={13} /> Enviar Lote para Fila
                    </button>
                </div>
                {filaProducao.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Fila vazia. Envie chapas para começar.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {filaProducao.map(item => {
                            const stColor = item.status === 'em_producao' ? '#f59e0b' : item.status === 'concluido' ? '#22c55e' : '#9ca3af';
                            return (
                                <div key={item.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                    borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                                }}>
                                    <div style={{ width: 4, height: 36, borderRadius: 2, background: stColor, flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700 }}>
                                            {item.lote_nome || `Lote ${item.lote_id}`} — Chapa {item.chapa_idx + 1}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                            {item.lote_cliente || ''} · Máq: {item.maquina_nome || 'Não atribuída'}
                                            {item.operador && ` · Op: ${item.operador}`}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {item.prioridade > 0 && (
                                            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                                                P{item.prioridade}
                                            </span>
                                        )}
                                        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: `${stColor}18`, color: stColor, fontWeight: 700 }}>
                                            {item.status === 'aguardando' ? 'Aguardando' : item.status === 'em_producao' ? 'Em Produção' : 'Concluído'}
                                        </span>
                                    </div>
                                    {item.status === 'aguardando' && (
                                        <button onClick={() => atualizarFila(item.id, { status: 'em_producao' })}
                                            style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                                            Iniciar
                                        </button>
                                    )}
                                    {item.status === 'em_producao' && (
                                        <button onClick={() => atualizarFila(item.id, { status: 'concluido' })}
                                            style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                                            Concluir
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Custeio Automático ═══ */}
            <SlidePanel isOpen={showCusteio} onClose={() => setShowCusteio(false)} title="Custeio por Peça" width={640}>
                {custeioData && (<div>
                    {/* Totais */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                        {[
                            { label: 'Material', val: custeioData.totais.material, color: '#3b82f6' },
                            { label: 'Máquina', val: custeioData.totais.maquina, color: '#f59e0b' },
                            { label: 'Borda', val: custeioData.totais.borda, color: '#8b5cf6' },
                            { label: 'Total', val: custeioData.totais.total, color: '#22c55e' },
                        ].map(t => (
                            <div key={t.label} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: `${t.color}08`, border: `1px solid ${t.color}30`, textAlign: 'center' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: t.color }}>R${t.val.toFixed(2)}</div>
                                <div style={{ fontSize: 9, fontWeight: 600, color: t.color, opacity: 0.8 }}>{t.label}</div>
                            </div>
                        ))}
                    </div>
                    {/* Parâmetros */}
                    {custeioData.params && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', gap: 12 }}>
                            <span>Material: R${custeioData.params.custo_m2}/m²</span>
                            <span>Máquina: R${custeioData.params.custo_maquina_min}/min</span>
                            <span>Borda: R${custeioData.params.custo_borda_m}/m</span>
                        </div>
                    )}
                    {/* Tabela de peças */}
                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10 }}>Peça</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Área m²</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Material</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Máquina</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10 }}>Borda</th>
                                <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, fontWeight: 700 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {custeioData.pecas.map((p, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '5px 6px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.peca_desc || `#${p.peca_id}`}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace', fontSize: 10 }}>{p.area_m2.toFixed(4)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace' }}>R${p.custo_material.toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace' }}>R${p.custo_maquina.toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace' }}>R${p.custo_borda.toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', padding: '5px 6px', fontFamily: 'monospace', fontWeight: 700 }}>R${p.custo_total.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>)}
            </SlidePanel>

            {/* ═══ SlidePanel Estoque de Chapas ═══ */}
            <SlidePanel isOpen={showEstoque} onClose={() => setShowEstoque(false)} title="Estoque de Chapas" width={560}>
                {/* Alertas de estoque baixo */}
                {estoqueAlertas.length > 0 && (
                    <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>
                            <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                            {estoqueAlertas.length} chapa(s) com estoque baixo
                        </div>
                        {estoqueAlertas.map(a => (
                            <div key={a.id} style={{ fontSize: 10, color: '#ef4444', padding: '2px 0' }}>
                                {a.nome}: {a.estoque_qtd || 0} un. (mín: {a.estoque_minimo})
                            </div>
                        ))}
                    </div>
                )}
                {/* Lista de chapas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {estoqueChapas.map(ch => (
                        <div key={ch.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>{ch.nome}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {ch.comprimento}×{ch.largura}mm · {ch.espessura_nominal}mm · {ch.material_code || '-'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', minWidth: 60 }}>
                                <div style={{
                                    fontSize: 18, fontWeight: 800,
                                    color: (ch.estoque_minimo > 0 && (ch.estoque_qtd || 0) <= ch.estoque_minimo) ? '#ef4444' : 'var(--text-primary)',
                                }}>{ch.estoque_qtd || 0}</div>
                                <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>un.</div>
                            </div>
                            {ch.custo_unitario > 0 && (
                                <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', minWidth: 70 }}>
                                    R${ch.custo_unitario.toFixed(2)}/un
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => {
                                    const qtd = prompt(`Entrada de ${ch.nome} — quantidade:`);
                                    if (qtd && Number(qtd) > 0) movimentarEstoque(ch.id, 'entrada', Number(qtd), 'Entrada manual');
                                }} style={{
                                    fontSize: 9, padding: '4px 8px', borderRadius: 4,
                                    background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)',
                                    cursor: 'pointer', fontWeight: 700,
                                }}>+</button>
                                <button onClick={() => {
                                    const qtd = prompt(`Saída de ${ch.nome} — quantidade:`);
                                    if (qtd && Number(qtd) > 0) movimentarEstoque(ch.id, 'saida', Number(qtd), 'Saída manual');
                                }} style={{
                                    fontSize: 9, padding: '4px 8px', borderRadius: 4,
                                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                                    cursor: 'pointer', fontWeight: 700,
                                }}>-</button>
                            </div>
                        </div>
                    ))}
                    {estoqueChapas.length === 0 && (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            Nenhuma chapa cadastrada. Cadastre em Configurações → Chapas.
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* ═══ SlidePanel Tool Prediction ═══ */}
            <SlidePanel isOpen={showToolPrediction} onClose={() => setShowToolPrediction(false)} title="Predição de Ferramentas" width={560}>
                {toolPrediction && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(toolPrediction.predictions || []).map((p, i) => {
                            const pct = p.vida_restante_pct || 0;
                            const color = pct < 20 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#22c55e';
                            return (
                                <div key={i} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700 }}>{p.ferramenta_nome || `Ferramenta #${p.ferramenta_id}`}</span>
                                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${color}20`, color, fontWeight: 700 }}>
                                            {pct.toFixed(0)}% vida
                                        </span>
                                    </div>
                                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-muted)', overflow: 'hidden', marginBottom: 6 }}>
                                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-muted)' }}>
                                        <span>Horas uso: {(p.horas_uso || 0).toFixed(1)}h</span>
                                        <span>Vida total: {(p.ciclo_vida_horas || 0).toFixed(0)}h</span>
                                        {p.previsao_troca && <span style={{ color: '#f59e0b' }}>Troca em: {p.previsao_troca}</span>}
                                    </div>
                                </div>
                            );
                        })}
                        {(!toolPrediction.predictions || toolPrediction.predictions.length === 0) && (
                            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                                Nenhuma ferramenta com dados de desgaste registrados.
                            </div>
                        )}
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Tool Maintenance ═══ */}
            <SlidePanel isOpen={showToolMaint} onClose={() => setShowToolMaint(false)} title="Manutenção Programada" width={600}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button onClick={async () => {
                        const nome = prompt('Nome da manutenção:');
                        if (!nome) return;
                        try {
                            await api.post('/cnc/tool-manutencao', { tipo: 'preventiva', descricao: nome, data_programada: new Date().toISOString().split('T')[0] });
                            loadToolMaintenance();
                            notify('Manutenção agendada', 'success');
                        } catch (err) { notify(err.error || 'Erro'); }
                    }} className={Z.btn} style={{ fontSize: 11, padding: '6px 14px' }}>
                        <Plus size={12} style={{ marginRight: 4 }} /> Nova Manutenção
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {toolMaintenance.map((m, i) => (
                        <div key={m.id || i} style={{
                            padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                            borderLeft: `3px solid ${m.status === 'concluida' ? '#22c55e' : m.status === 'atrasada' ? '#ef4444' : '#f59e0b'}`,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>{m.descricao || m.tipo}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10,
                                    background: m.status === 'concluida' ? 'rgba(34,197,94,0.1)' : m.status === 'atrasada' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                    color: m.status === 'concluida' ? '#22c55e' : m.status === 'atrasada' ? '#ef4444' : '#f59e0b',
                                    fontWeight: 600 }}>{m.status || 'pendente'}</span>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                {m.ferramenta_nome && <span>Ferramenta: {m.ferramenta_nome} · </span>}
                                Programada: {m.data_programada || '-'}
                                {m.data_realizada && <span> · Realizada: {m.data_realizada}</span>}
                            </div>
                            {m.status !== 'concluida' && (
                                <button onClick={async () => {
                                    try {
                                        await api.put(`/cnc/tool-manutencao/${m.id}`, { status: 'concluida', data_realizada: new Date().toISOString().split('T')[0] });
                                        loadToolMaintenance();
                                        notify('Manutenção concluída', 'success');
                                    } catch (err) { notify(err.error || 'Erro'); }
                                }} style={{ marginTop: 6, fontSize: 10, padding: '3px 10px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer' }}>
                                    <Check size={10} style={{ marginRight: 3 }} /> Concluir
                                </button>
                            )}
                        </div>
                    ))}
                    {toolMaintenance.length === 0 && (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            Nenhuma manutenção programada.
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* ═══ SlidePanel Material Audit ═══ */}
            <SlidePanel isOpen={showMaterialAudit} onClose={() => setShowMaterialAudit(false)} title="Auditoria de Consumo" width={620}>
                {materialAudit.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-muted)', borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '8px 6px', textAlign: 'left' }}>Material</th>
                                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Área Total (m²)</th>
                                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Usado (m²)</th>
                                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Sobra (m²)</th>
                                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Desperdício</th>
                                </tr>
                            </thead>
                            <tbody>
                                {materialAudit.map((a, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px', fontWeight: 600 }}>{a.material || a.chapa_nome || '-'}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>{(a.area_total_m2 || 0).toFixed(3)}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>{(a.area_usada_m2 || 0).toFixed(3)}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>{(a.area_sobra_m2 || 0).toFixed(3)}</td>
                                        <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace', color: (a.desperdicio_pct || 0) > 30 ? '#ef4444' : '#22c55e' }}>
                                            {(a.desperdicio_pct || 0).toFixed(1)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Nenhum registro de consumo para este lote.
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Reservations ═══ */}
            <SlidePanel isOpen={showReservations} onClose={() => setShowReservations(false)} title="Reserva de Material" width={560}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {reservations.map((r, i) => (
                        <div key={r.id || i} style={{
                            padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                            opacity: r.status === 'expirada' ? 0.5 : 1,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, fontWeight: 700 }}>{r.chapa_nome || `Chapa #${r.chapa_id}`}</span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10,
                                    background: r.status === 'ativa' ? 'rgba(34,197,94,0.1)' : r.status === 'expirada' ? 'rgba(239,68,68,0.1)' : 'rgba(100,100,100,0.1)',
                                    color: r.status === 'ativa' ? '#22c55e' : r.status === 'expirada' ? '#ef4444' : '#888',
                                    fontWeight: 600 }}>{r.status || 'ativa'}</span>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                Qtd: {r.quantidade} · Lote: {r.lote_nome || r.lote_id}
                                {r.expira_em && <span> · Expira: {new Date(r.expira_em).toLocaleString('pt-BR')}</span>}
                            </div>
                            {r.status === 'ativa' && (
                                <button onClick={async () => {
                                    try {
                                        await api.put(`/cnc/reserva-material/${r.id}`, { status: 'cancelada' });
                                        loadReservations();
                                        notify('Reserva cancelada', 'success');
                                    } catch (err) { notify(err.error || 'Erro'); }
                                }} style={{ marginTop: 6, fontSize: 10, padding: '3px 10px', borderRadius: 4, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>
                                    Cancelar Reserva
                                </button>
                            )}
                        </div>
                    ))}
                    {reservations.length === 0 && (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            Nenhuma reserva ativa. Use o estoque para reservar material.
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* ═══ SlidePanel Backup ═══ */}
            <SlidePanel isOpen={showBackups} onClose={() => setShowBackups(false)} title="Backups" width={500}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button onClick={criarBackup} className={Z.btn} style={{ fontSize: 11, padding: '6px 14px' }}>
                        <Plus size={12} style={{ marginRight: 4 }} /> Criar Backup
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {backups.map((b, i) => (
                        <div key={b.id || i} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
                        }}>
                            <Server size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 600 }}>{b.filename || b.nome}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    {b.created_at ? new Date(b.created_at).toLocaleString('pt-BR') : '-'}
                                    {b.size_mb && <span> · {b.size_mb.toFixed(1)} MB</span>}
                                </div>
                            </div>
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                                {b.status || 'ok'}
                            </span>
                        </div>
                    ))}
                    {backups.length === 0 && (
                        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                            Nenhum backup realizado.
                        </div>
                    )}
                </div>
            </SlidePanel>

            {/* ═══ SlidePanel Machine Performance ═══ */}
            <SlidePanel isOpen={showMachinePerf} onClose={() => setShowMachinePerf(false)} title="Performance da Máquina" width={640}>
                {machinePerf ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Summary cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {[
                                { label: 'Tempo Médio/Chapa', value: `${(machinePerf.avg_tempo_min || 0).toFixed(1)} min`, color: '#3b82f6' },
                                { label: 'Peças/Hora', value: (machinePerf.pecas_hora || 0).toFixed(1), color: '#22c55e' },
                                { label: 'Aproveit. Médio', value: `${(machinePerf.avg_aproveitamento || 0).toFixed(1)}%`, color: '#f59e0b' },
                            ].map((c, i) => (
                                <div key={i} style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
                                </div>
                            ))}
                        </div>
                        {/* Recent logs */}
                        {machinePerf.logs && machinePerf.logs.length > 0 && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Últimas Operações</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {machinePerf.logs.slice(0, 20).map((l, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-muted)', fontSize: 10, alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, minWidth: 80 }}>{l.maquina_nome || '-'}</span>
                                            <span style={{ flex: 1 }}>{l.lote_nome || `Lote #${l.lote_id}`}</span>
                                            <span style={{ fontFamily: 'monospace' }}>{(l.tempo_min || 0).toFixed(1)} min</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '-'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Carregando dados de performance...
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Label Preview ═══ */}
            <SlidePanel isOpen={showLabelPreview} onClose={() => setShowLabelPreview(false)} title="Preview Etiquetas" width={520}>
                {labelPreviewData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                            {labelPreviewData.total || 0} etiquetas · Template: {labelPreviewData.template_nome || 'Padrão'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
                            {(labelPreviewData.previews || []).slice(0, 20).map((p, i) => (
                                <div key={i} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>{p.descricao || p.peca_desc || `Peça #${i + 1}`}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {p.dimensoes || '-'} · {p.material || '-'} · {p.modulo || '-'}
                                    </div>
                                    {p.qr_data && (
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            QR: {p.qr_data.substring(0, 60)}...
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Carregando preview...
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Comparação Otimização (#36) ═══ */}
            <SlidePanel isOpen={showComparison} onClose={() => setShowComparison(false)} title="Comparação da Otimização" width={600}>
                {comparisonData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {[
                                { label: 'Chapas', value: comparisonData.total_chapas, color: '#3b82f6' },
                                { label: 'Peças', value: comparisonData.total_pecas, color: '#22c55e' },
                                { label: 'Aproveit. Médio', value: `${((comparisonData.aproveitamento_medio || 0) * 100).toFixed(1)}%`, color: '#f59e0b' },
                            ].map((c, i) => (
                                <div key={i} style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Área Total</div>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>{(comparisonData.area_total_m2 || 0).toFixed(3)} m²</div>
                            </div>
                            <div style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Área Utilizada</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{(comparisonData.area_usada_m2 || 0).toFixed(3)} m²</div>
                            </div>
                        </div>
                        {comparisonData.por_chapa && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Por Chapa</div>
                                {comparisonData.por_chapa.map((ch, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-muted)', marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, minWidth: 60 }}>Chapa {ch.idx + 1}</span>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>{ch.material} · {ch.pecas} pç</span>
                                        <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(ch.aproveitamento || 0) * 100}%`, background: (ch.aproveitamento || 0) > 0.7 ? '#22c55e' : (ch.aproveitamento || 0) > 0.5 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                                        </div>
                                        <span style={{ fontSize: 10, fontFamily: 'monospace', minWidth: 40, textAlign: 'right' }}>{((ch.aproveitamento || 0) * 100).toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {comparisonData.sobras?.length > 0 && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Sobras Reutilizáveis ({comparisonData.sobras.length})</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {comparisonData.sobras.slice(0, 10).map((s, i) => (
                                        <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                                            Ch{s.chapa + 1}: {Math.round(s.w)}×{Math.round(s.h)}mm
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Carregando...</div>}
            </SlidePanel>

            {/* ═══ SlidePanel Dashboard Desperdício (#39) ═══ */}
            <SlidePanel isOpen={showWaste} onClose={() => setShowWaste(false)} title="Dashboard de Desperdício" width={660}>
                {wasteData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                            Últimos 6 meses · {wasteData.total_lotes} lotes analisados
                        </div>
                        {/* By month */}
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Por Mês</div>
                            {Object.entries(wasteData.por_mes || {}).sort().reverse().map(([mes, d]) => (
                                <div key={mes} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-muted)', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 60 }}>{mes}</span>
                                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${100 - (d.desperdicio_pct || 0)}%`, background: (d.desperdicio_pct || 0) < 25 ? '#22c55e' : (d.desperdicio_pct || 0) < 40 ? '#f59e0b' : '#ef4444', borderRadius: 4 }} />
                                    </div>
                                    <span style={{ fontSize: 10, fontFamily: 'monospace', minWidth: 50, textAlign: 'right', color: (d.desperdicio_pct || 0) > 35 ? '#ef4444' : 'var(--text-muted)' }}>
                                        {(d.desperdicio_pct || 0).toFixed(1)}% desp.
                                    </span>
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 40 }}>{d.chapas} ch.</span>
                                </div>
                            ))}
                        </div>
                        {/* By material */}
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Por Material</div>
                            {Object.entries(wasteData.por_material || {}).sort((a, b) => b[1].area_total - a[1].area_total).map(([mat, d]) => (
                                <div key={mat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-muted)', marginBottom: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mat}</span>
                                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{d.area_total.toFixed(2)}m²</span>
                                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: (d.desperdicio_pct || 0) > 35 ? '#ef4444' : '#22c55e' }}>{(d.desperdicio_pct || 0).toFixed(1)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Carregando...</div>}
            </SlidePanel>

            {/* ═══ SlidePanel Sugestão Agrupamento (#40) ═══ */}
            <SlidePanel isOpen={showGrouping} onClose={() => setShowGrouping(false)} title="Sugestão de Agrupamento" width={580}>
                {groupingSuggestions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.15)' }}>
                            Lotes com materiais em comum que podem ser otimizados juntos para reduzir desperdício.
                        </div>
                        {groupingSuggestions.map((s, i) => (
                            <div key={i} style={{ padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700 }}>{s.material}</span>
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 700 }}>
                                        ~{s.economia_estimada} economia
                                    </span>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                                    {s.total_pecas} peças · {s.total_area_m2.toFixed(2)} m² · {s.lotes.length} lotes
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {s.lotes.map((l, li) => (
                                        <span key={li} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                                            {l.lote_nome || `Lote #${l.lote_id}`} ({l.qty} pç)
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Nenhuma sugestão de agrupamento encontrada. Todos os lotes usam materiais diferentes.
                    </div>
                )}
            </SlidePanel>

            {/* ═══ SlidePanel Retalhos Aproveitáveis (#42) ═══ */}
            <SlidePanel isOpen={showRemnants} onClose={() => setShowRemnants(false)} title="Retalhos Aproveitáveis" width={620}>
                {remnantsData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6 }}>
                            {remnantsData.total_retalhos} retalhos disponíveis · {remnantsData.matches?.length || 0} com peças que cabem
                        </div>
                        {(remnantsData.matches || []).length > 0 && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#22c55e' }}>Matches Encontrados</div>
                                {remnantsData.matches.map((m, i) => (
                                    <div key={i} style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700 }}>
                                                Retalho {Math.round(m.retalho.w)}×{Math.round(m.retalho.h)}mm
                                            </span>
                                            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>
                                                {m.pecas_que_cabem} peça(s) cabem!
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                                            Material: {m.retalho.material} · Lote #{m.retalho.lote_id}
                                        </div>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {(m.pecas || []).map((p, pi) => (
                                                <span key={pi} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                                                    {p.desc} ({p.dims})
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {(remnantsData.remnants || []).length > 0 && (
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Todos os Retalhos</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                                    {remnantsData.remnants.map((r, i) => (
                                        <div key={i} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 10 }}>
                                            <div style={{ fontWeight: 700 }}>{Math.round(r.w)}×{Math.round(r.h)}mm</div>
                                            <div style={{ color: 'var(--text-muted)' }}>{r.material}</div>
                                            <div style={{ color: 'var(--text-muted)' }}>{r.area_m2.toFixed(3)} m²</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Carregando...</div>}
            </SlidePanel>
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
        if (!canvas) return;
        if (!gcode) {
            const ctx = canvas.getContext('2d');
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#181825'; ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#6c7086'; ctx.font = '13px sans-serif';
            ctx.fillText('G-Code não disponível — verifique os alertas acima', W / 2 - 180, H / 2);
            return;
        }
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
                ctx.fillText(`[${tool}]`, 10, hy); hy += 16;
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
                    <button onClick={handlePause} style={btnAct} title="Pausar">‖</button>
                )}
                <button onClick={handleStop} style={btnSt} title="Parar e voltar ao estático">■</button>
                <button onClick={() => handleStep(-1)} style={btnSt} title="Voltar 1 move">«</button>
                <button onClick={() => handleStep(1)} style={btnSt} title="Avançar 1 move">»</button>
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
                {activeTool && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f9e2af', fontWeight: 600 }}>◈ {activeTool}</span>}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// Painel de Ferramentas — Modal
// ═══════════════════════════════════════════════════════════════════════

const METHOD_LABELS = {
    drill: 'Furação direta',
    helical: 'Helicoidal',
    circular: 'Interpolação circular',
    pocket_zigzag: 'Pocket zigzag',
    pocket_espiral: 'Pocket espiral',
    groove: 'Rasgo linear',
    multi_pass: 'Multi-passada',
    desativado: 'Desativado',
};

const CATEGORIA_ICON = { hole: Circle, pocket: Square, groove: Minus, generic: Settings };
const CATEGORIA_COLOR = { hole: '#7c3aed', pocket: '#2563eb', groove: '#d97706', generic: '#6b7280' };

function ToolPanelModal({ data, loteId, onClose, onSave }) {
    const { operacoes = [], overrides: savedOverrides = {}, overrides_peca: savedOverridesPeca = {}, ferramentas_compativeis = {}, maquina, total_operacoes = 0, total_grupos = 0 } = data;
    const [localOverrides, setLocalOverrides] = useState(() => {
        const init = {};
        operacoes.forEach(op => {
            const saved = savedOverrides[op.op_key] || {};
            init[op.op_key] = {
                ativo: saved.ativo !== undefined ? saved.ativo : true,
                metodo: saved.metodo || op.metodos_disponiveis?.[0] || 'drill',
                ferramenta_id: saved.ferramenta_id || op.tool?.id || null,
                diametro_override: saved.diametro_override ?? null,
                profundidade_override: saved.profundidade_override ?? null,
                rpm_override: saved.rpm_override ?? null,
                feed_override: saved.feed_override ?? null,
            };
        });
        return init;
    });
    const [localPecaOverrides, setLocalPecaOverrides] = useState(() => {
        const init = {};
        operacoes.forEach(op => {
            (op.pecas || []).forEach(p => {
                const key = `${op.op_key}__${p.peca_id}`;
                const saved = savedOverridesPeca[key] || {};
                init[key] = {
                    ativo: saved.ativo !== undefined ? saved.ativo : true,
                    profundidade_override: saved.profundidade_override ?? null,
                    diametro_override: saved.diametro_override ?? null,
                };
            });
        });
        return init;
    });
    const [expanded, setExpanded] = useState({});
    const [expandedPecas, setExpandedPecas] = useState({});
    const [saving, setSaving] = useState(false);
    const [filter, setFilter] = useState('');
    const [dirty, setDirty] = useState(false);

    const updateOverride = (opKey, field, value) => {
        setLocalOverrides(prev => ({ ...prev, [opKey]: { ...prev[opKey], [field]: value } }));
        setDirty(true);
    };

    const updatePecaOverride = (opKey, pecaId, field, value) => {
        const key = `${opKey}__${pecaId}`;
        setLocalPecaOverrides(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
        setDirty(true);
    };

    const toggleExpand = (opKey) => setExpanded(prev => ({ ...prev, [opKey]: !prev[opKey] }));
    const toggleExpandPecas = (opKey) => setExpandedPecas(prev => ({ ...prev, [opKey]: !prev[opKey] }));

    const handleSave = async () => {
        setSaving(true);
        try {
            const overridesList = Object.entries(localOverrides).map(([op_key, ov]) => ({ op_key, ...ov }));
            await api.post(`/cnc/lotes/${loteId}/operacoes-overrides-bulk`, { overrides: overridesList });

            // Save per-piece overrides that differ from defaults
            const pecaPromises = [];
            operacoes.forEach(op => {
                (op.pecas || []).forEach(p => {
                    const key = `${op.op_key}__${p.peca_id}`;
                    const pov = localPecaOverrides[key];
                    if (pov && (pov.ativo === false || pov.profundidade_override != null || pov.diametro_override != null)) {
                        pecaPromises.push(
                            api.post(`/cnc/lotes/${loteId}/operacoes-override-peca`, {
                                op_key: op.op_key, peca_id: p.peca_id, ...pov,
                            })
                        );
                    }
                });
            });
            if (pecaPromises.length > 0) await Promise.all(pecaPromises);

            setDirty(false);
            onSave();
        } catch (err) {
            console.error('Erro ao salvar overrides:', err);
        } finally {
            setSaving(false);
        }
    };

    const filteredOps = filter
        ? operacoes.filter(op => op.tipo_label?.toLowerCase().includes(filter.toLowerCase()) || op.op_key?.toLowerCase().includes(filter.toLowerCase()) || op.tool?.nome?.toLowerCase().includes(filter.toLowerCase()))
        : operacoes;

    const ativos = Object.values(localOverrides).filter(o => o.ativo).length;
    const desativados = operacoes.length - ativos;

    const sty = {
        card: { background: 'var(--bg-muted)', borderRadius: 8, padding: '10px 14px', marginBottom: 6, border: '1px solid var(--border)', transition: 'border-color .15s' },
        cardDisabled: { opacity: 0.45, filter: 'grayscale(0.5)' },
        label: { fontSize: 12, fontWeight: 600, color: 'var(--text)' },
        detail: { fontSize: 10, color: 'var(--text-muted)' },
        input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 11, color: 'var(--text)', width: 70, fontFamily: 'monospace' },
        select: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 11, color: 'var(--text)', cursor: 'pointer' },
        methodBtn: (active) => ({
            padding: '3px 8px', fontSize: 10, borderRadius: 4, border: '1px solid',
            borderColor: active ? '#7c3aed' : 'var(--border)',
            background: active ? '#7c3aed' : 'transparent',
            color: active ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all .15s', fontWeight: active ? 600 : 400,
        }),
        toggleOn: { width: 32, height: 18, borderRadius: 9, background: '#7c3aed', position: 'relative', cursor: 'pointer', transition: 'background .15s', flexShrink: 0 },
        toggleOff: { width: 32, height: 18, borderRadius: 9, background: '#4a4a5a', position: 'relative', cursor: 'pointer', transition: 'background .15s', flexShrink: 0 },
        toggleKnob: (on) => ({ width: 14, height: 14, borderRadius: 7, background: '#fff', position: 'absolute', top: 2, left: on ? 16 : 2, transition: 'left .15s' }),
    };

    return (
        <Modal title={`Painel de Ferramentas — Lote #${loteId}`} close={onClose} w={880}>
            {/* Header stats */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#7c3aed22', borderRadius: 6, fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                    <Wrench size={12} /> {total_operacoes} operações em {total_grupos} grupos
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-muted)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Check size={12} color="#22c55e" /> {ativos} ativos
                </div>
                {desativados > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#ef444422', borderRadius: 6, fontSize: 11, color: '#ef4444' }}>
                        <X size={12} /> {desativados} desativados
                    </div>
                )}
                {maquina && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-muted)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                        <Cpu size={12} /> {maquina.nome || maquina.modelo}
                    </div>
                )}
                <div style={{ flex: 1 }} />
                <input
                    type="text" placeholder="Filtrar operações..." value={filter} onChange={e => setFilter(e.target.value)}
                    style={{ ...sty.input, width: 180, fontSize: 11 }}
                />
            </div>

            {/* Operation groups */}
            <div style={{ maxHeight: 'calc(80vh - 180px)', overflowY: 'auto', paddingRight: 4 }}>
                {filteredOps.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>
                        {filter ? 'Nenhuma operação encontrada para o filtro' : 'Nenhuma operação detectada neste lote'}
                    </div>
                )}
                {filteredOps.map(op => {
                    const ov = localOverrides[op.op_key] || {};
                    const isActive = ov.ativo !== false;
                    const isExpanded = expanded[op.op_key];
                    const isPecasExpanded = expandedPecas[op.op_key];
                    const CatIcon = CATEGORIA_ICON[op.categoria] || Settings;
                    const catColor = CATEGORIA_COLOR[op.categoria] || '#6b7280';
                    const compatTools = ferramentas_compativeis[op.op_key] || [];

                    return (
                        <div key={op.op_key} style={{ ...sty.card, ...(isActive ? {} : sty.cardDisabled), borderColor: isActive ? catColor + '44' : 'var(--border)' }}>
                            {/* Main row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {/* Toggle */}
                                <div
                                    style={isActive ? sty.toggleOn : sty.toggleOff}
                                    onClick={() => updateOverride(op.op_key, 'ativo', !isActive)}
                                >
                                    <div style={sty.toggleKnob(isActive)} />
                                </div>

                                {/* Icon + label */}
                                <CatIcon size={16} color={catColor} style={{ flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={sty.label}>
                                        {op.tipo_label}{op.diametro ? ` Ø${op.diametro}mm` : ''}
                                    </div>
                                    <div style={sty.detail}>
                                        {op.count} operações em {op.total_pecas} peças
                                        {op.profundidade_media ? ` · prof. média ${op.profundidade_media.toFixed(1)}mm` : ''}
                                        {op.tool_code ? ` · ${op.tool_code}` : ''}
                                    </div>
                                </div>

                                {/* Tool assignment */}
                                {compatTools.length > 0 ? (
                                    <select
                                        value={ov.ferramenta_id || ''}
                                        onChange={e => updateOverride(op.op_key, 'ferramenta_id', e.target.value ? Number(e.target.value) : null)}
                                        style={{ ...sty.select, maxWidth: 160 }}
                                    >
                                        <option value="">Auto</option>
                                        {compatTools.map(t => (
                                            <option key={t.id} value={t.id}>{t.codigo} — {t.nome} (Ø{t.diametro})</option>
                                        ))}
                                    </select>
                                ) : op.tool ? (
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg)', borderRadius: 4 }}>
                                        {op.tool.codigo || op.tool.nome}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 10, color: '#ef4444', padding: '2px 8px', background: '#ef444422', borderRadius: 4 }}>
                                        <AlertTriangle size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Sem ferramenta
                                    </span>
                                )}

                                {/* Expand button */}
                                <div
                                    onClick={() => toggleExpand(op.op_key)}
                                    style={{ cursor: 'pointer', padding: '4px', borderRadius: 4, color: 'var(--text-muted)' }}
                                >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </div>
                            </div>

                            {/* Method selector */}
                            {isActive && op.metodos_disponiveis?.length > 1 && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                                    {op.metodos_disponiveis.map(m => (
                                        <button
                                            key={m}
                                            style={sty.methodBtn(ov.metodo === m)}
                                            onClick={() => updateOverride(op.op_key, 'metodo', m)}
                                        >
                                            {METHOD_LABELS[m] || m}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Expanded overrides */}
                            {isExpanded && (
                                <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Settings size={11} /> Overrides
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Diâmetro (mm)</label>
                                            <input
                                                type="number" step="0.1"
                                                value={ov.diametro_override ?? ''}
                                                placeholder={op.diametro || '-'}
                                                onChange={e => updateOverride(op.op_key, 'diametro_override', e.target.value ? parseFloat(e.target.value) : null)}
                                                style={sty.input}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Profundidade (mm)</label>
                                            <input
                                                type="number" step="0.1"
                                                value={ov.profundidade_override ?? ''}
                                                placeholder={op.profundidade_max ? op.profundidade_max.toFixed(1) : '-'}
                                                onChange={e => updateOverride(op.op_key, 'profundidade_override', e.target.value ? parseFloat(e.target.value) : null)}
                                                style={sty.input}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>RPM</label>
                                            <input
                                                type="number" step="100"
                                                value={ov.rpm_override ?? ''}
                                                placeholder="Auto"
                                                onChange={e => updateOverride(op.op_key, 'rpm_override', e.target.value ? parseInt(e.target.value) : null)}
                                                style={sty.input}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Avanço (mm/min)</label>
                                            <input
                                                type="number" step="50"
                                                value={ov.feed_override ?? ''}
                                                placeholder="Auto"
                                                onChange={e => updateOverride(op.op_key, 'feed_override', e.target.value ? parseInt(e.target.value) : null)}
                                                style={sty.input}
                                            />
                                        </div>
                                    </div>

                                    {/* Per-piece details */}
                                    {op.pecas?.length > 0 && (
                                        <div style={{ marginTop: 10 }}>
                                            <div
                                                onClick={() => toggleExpandPecas(op.op_key)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}
                                            >
                                                {isPecasExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                {op.pecas.length} peças com esta operação
                                            </div>
                                            {isPecasExpanded && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {op.pecas.map(p => {
                                                        const pecaKey = `${op.op_key}__${p.peca_id}`;
                                                        const pov = localPecaOverrides[pecaKey] || {};
                                                        const pecaAtivo = pov.ativo !== false;
                                                        return (
                                                            <div key={p.peca_id} style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                                                                background: 'var(--bg-muted)', borderRadius: 4, fontSize: 10,
                                                                opacity: pecaAtivo ? 1 : 0.4,
                                                            }}>
                                                                <div
                                                                    style={pecaAtivo ? { ...sty.toggleOn, width: 24, height: 14, borderRadius: 7 } : { ...sty.toggleOff, width: 24, height: 14, borderRadius: 7 }}
                                                                    onClick={() => updatePecaOverride(op.op_key, p.peca_id, 'ativo', !pecaAtivo)}
                                                                >
                                                                    <div style={{ width: 10, height: 10, borderRadius: 5, background: '#fff', position: 'absolute', top: 2, left: pecaAtivo ? 12 : 2, transition: 'left .15s' }} />
                                                                </div>
                                                                <span style={{ flex: 1, fontWeight: 500, color: 'var(--text)' }}>
                                                                    {p.descricao || `Peça #${p.peca_id}`}
                                                                    {p.modulo ? <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({p.modulo})</span> : null}
                                                                </span>
                                                                <span style={{ color: 'var(--text-muted)' }}>{p.count}x</span>
                                                                {p.profundidades && (
                                                                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                                        prof: {[...new Set(p.profundidades)].join(', ')}mm
                                                                    </span>
                                                                )}
                                                                <input
                                                                    type="number" step="0.1"
                                                                    value={pov.profundidade_override ?? ''}
                                                                    placeholder="prof."
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={e => updatePecaOverride(op.op_key, p.peca_id, 'profundidade_override', e.target.value ? parseFloat(e.target.value) : null)}
                                                                    style={{ ...sty.input, width: 50, fontSize: 10 }}
                                                                    title="Override profundidade para esta peça"
                                                                />
                                                                <input
                                                                    type="number" step="0.1"
                                                                    value={pov.diametro_override ?? ''}
                                                                    placeholder="diam."
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={e => updatePecaOverride(op.op_key, p.peca_id, 'diametro_override', e.target.value ? parseFloat(e.target.value) : null)}
                                                                    style={{ ...sty.input, width: 50, fontSize: 10 }}
                                                                    title="Override diâmetro para esta peça"
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {dirty && <span style={{ color: '#f59e0b', fontWeight: 600 }}>Alterações não salvas</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onClose} className={Z.btn2} style={{ padding: '8px 16px', fontSize: 12 }}>
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave} disabled={saving || !dirty}
                        className={Z.btn} style={{
                            padding: '8px 20px', fontSize: 12, background: '#7c3aed', color: '#fff', border: 'none',
                            opacity: (saving || !dirty) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        {saving ? <Spinner size={12} /> : <Check size={12} />}
                        {saving ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function GcodePreviewModal({ data, onDownload, onSendToMachine, onClose, onSimulate }) {
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6, marginBottom: 10 }}>
                {[
                    { lb: 'Tempo Est.', val: stats.tempo_estimado_min ? `${stats.tempo_estimado_min} min` : '—', color: '#e67e22' },
                    { lb: 'Operacoes', val: stats.total_operacoes ?? 0, color: '#3b82f6' },
                    { lb: 'Trocas Ferr.', val: stats.trocas_ferramenta ?? 0, color: stats.trocas_ferramenta > 3 ? '#f59e0b' : '#22c55e' },
                    { lb: 'Contornos', val: (stats.contornos_peca ?? 0) + (stats.contornos_sobra ?? 0), color: '#8b5cf6' },
                    { lb: 'Dist. Corte', val: stats.dist_corte_m ? `${stats.dist_corte_m}m` : '—', color: '#a6e3a1' },
                    { lb: 'Dist. Rapido', val: stats.dist_rapido_m ? `${stats.dist_rapido_m}m` : '—', color: '#f38ba8' },
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
                <div style={{ marginBottom: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {alertas.map((a, i) => {
                        const isCrit = (a.tipo || '').includes('erro') || (a.tipo || '').includes('critico');
                        return (
                            <div key={i} style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 6, marginBottom: 2,
                                background: isCrit ? '#fef2f2' : '#fefce8',
                                border: `1px solid ${isCrit ? '#fecaca' : '#fef08a'}`,
                                display: 'flex', alignItems: 'center', gap: 6,
                                color: isCrit ? '#991b1b' : '#854d0e',
                                fontWeight: isCrit ? 600 : 400,
                            }}>
                                <AlertTriangle size={12} /> {a.msg || a}
                            </div>
                        );
                    })}
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
                <GcodeSimWrapper gcode={gcode} chapa={chapaData} />
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={onClose} className={Z.btn2} style={{ padding: '8px 20px' }}>Fechar</button>
                {gcode && onSimulate && (
                    <button onClick={() => onSimulate(gcode, chapaData)} className={Z.btn2}
                        style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <Play size={14} /> Simular Percurso
                    </button>
                )}
                {gcode && (
                    <button onClick={onDownload} className={Z.btn} style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 6, background: '#e67e22', fontSize: 13, fontWeight: 700 }}>
                        <Download size={15} /> Baixar {filename}
                    </button>
                )}
                {gcode && onSendToMachine && (
                    <button onClick={onSendToMachine} className={Z.btn2} style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                        <Send size={14} /> Enviar p/ Maquina
                    </button>
                )}
                {!gcode && data.ferramentas_faltando?.length > 0 && (
                    <div style={{ padding: '8px 16px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', fontSize: 12, color: '#991b1b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={14} /> Adicione as ferramentas faltantes para gerar o G-Code
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ─── Render machining operations (usinagens) on piece SVG ──
// Usa exatamente a mesma lógica do gerador de G-code para transformar coordenadas.
// machining_json coords: x = eixo comprimento original, y = eixo largura original
// No plano: se NÃO rotated → p.w=comprimento, p.h=largura
//           se rotated     → p.w=largura,      p.h=comprimento
// Rotação (igual ao backend): transformRotated(wx,wy,compOrig) → {x: wy, y: compOrig - wx}
let _machClipId = 0;
function renderMachining(piece, px, py, pw, ph, scale, rotated, pieceW, pieceH, ladoAtivo) {
    const isSideB = ladoAtivo === 'B';
    // If side B has dedicated machining data, use it; otherwise use normal machining_json
    let machSource = piece?.machining_json;
    if (isSideB && piece?.machining_json_b) machSource = piece.machining_json_b;
    if (!machSource || machSource === '{}') return null;
    let mach;
    try { mach = typeof machSource === 'string' ? JSON.parse(machSource) : machSource; } catch { return null; }
    if (!mach.workers) return null;

    const elements = [];
    const clipId = `mach-clip-${piece.id || (++_machClipId)}`;

    // Dimensões originais da peça do DB
    const compOrig = Number(piece.comprimento || pieceW);
    const largOrig = Number(piece.largura || pieceH);

    // Detectar rotação REAL comparando dimensões do plano com originais do DB
    // Não confiar apenas no flag rotated — pode estar incorreto (bug do otimizador)
    const wMatchesComp = Math.abs(pieceW - compOrig) <= 1;
    const wMatchesLarg = Math.abs(pieceW - largOrig) <= 1;
    const isRotated = (wMatchesLarg && !wMatchesComp) ? true : (wMatchesComp && !wMatchesLarg) ? false : rotated;

    // Transforma coordenadas do machining (relativas à peça original: x=comprimento, y=largura)
    // para posição SVG na peça colocada (pieceW × pieceH px)
    // Idêntico ao backend: transformRotated(wx,wy,compOrig) → {x: wy, y: compOrig - wx}
    function toSvg(mx, my) {
        // Mirror X for Side B (flip piece)
        let effX = isSideB ? compOrig - mx : mx;
        let lx, ly;
        if (isRotated) {
            lx = my;
            ly = compOrig - effX;
        } else {
            lx = effX;
            ly = my;
        }
        const sx = (lx / pieceW) * pw;
        const sy = (ly / pieceH) * ph;
        return { sx: Math.max(0, Math.min(sx, pw)), sy: Math.max(0, Math.min(sy, ph)) };
    }

    // Collect all workers (workers + side_a + side_b)
    const allWorkers = [];
    if (mach.workers) {
        const wArr = Array.isArray(mach.workers) ? mach.workers : Object.entries(mach.workers);
        for (const entry of wArr) {
            const [k, w] = Array.isArray(entry) ? entry : [allWorkers.length, entry];
            if (w && typeof w === 'object') allWorkers.push([k, w]);
        }
    }

    for (const [k, w] of allWorkers) {
        const face = w.quadrant || w.face || 'top';
        const cat = (w.category || w.type || '').toLowerCase();

        // ── Extrair coordenadas locais (mesma lógica do backend) ──
        let mx, my, mx2, my2;
        if (w.pos_start_for_line) {
            mx = Number(w.pos_start_for_line.position_x ?? w.pos_start_for_line.x ?? 0);
            my = Number(w.pos_start_for_line.position_y ?? w.pos_start_for_line.y ?? 0);
            mx2 = Number(w.pos_end_for_line?.position_x ?? w.pos_end_for_line?.x ?? mx);
            my2 = Number(w.pos_end_for_line?.position_y ?? w.pos_end_for_line?.y ?? my);
        } else {
            mx = Number(w.x ?? w.position_x ?? 0);
            my = Number(w.y ?? w.position_y ?? 0);
            mx2 = w.x2 != null ? Number(w.x2) : undefined;
            my2 = w.y2 != null ? Number(w.y2) : undefined;
        }

        let p1 = toSvg(mx, my);

        // ── Rasgos / Canais (saw cut, grooves) ──
        if (cat.includes('saw_cut') || w.tool === 'r_f') {
            const grooveW = (w.width_line || w.width || 3) * (pw / pieceW);
            let p2;
            if (w.pos_start_for_line && w.pos_end_for_line) {
                // Formato com start/end explícitos
                p2 = toSvg(mx2, my2);
            } else if (w.length) {
                // Formato simples: x/y + length (rasgo corre ao longo do eixo X = comprimento)
                // Detectar se x é centro (x+length > comprimento) ou início
                const grooveLen = Number(w.length);
                let startX, endX;
                if (mx + grooveLen > compOrig + 1) {
                    // x é CENTRO do rasgo
                    startX = mx - grooveLen / 2;
                    endX = mx + grooveLen / 2;
                } else {
                    // x é INÍCIO do rasgo
                    startX = mx;
                    endX = mx + grooveLen;
                }
                p1 = toSvg(startX, my);
                p2 = toSvg(endX, my);
            } else {
                continue; // sem dados suficientes
            }
            elements.push(
                <line key={`g${k}`} x1={px + p1.sx} y1={py + p1.sy} x2={px + p2.sx} y2={py + p2.sy}
                    stroke="#eab308" strokeWidth={Math.max(1.5, grooveW)} opacity={0.6} strokeLinecap="round" />
            );

        // ── Rebaixos / Pockets ──
        } else if (cat.includes('pocket') || cat.includes('rebaixo')) {
            const rw = (w.pocket_width || w.width || 20) * (pw / pieceW);
            const rh = (w.pocket_height || w.height || 20) * (ph / pieceH);
            elements.push(
                <rect key={`p${k}`} x={px + p1.sx - rw / 2} y={py + p1.sy - rh / 2} width={rw} height={rh}
                    fill="#a855f7" opacity={0.3} stroke="#7c3aed" strokeWidth={0.8} strokeDasharray="2,1" rx={1} />
            );

        // ── Slots / Fresagens ──
        } else if (cat.includes('slot') || cat.includes('fresa')) {
            const slotLen = (w.slot_length || w.length || 20) * (pw / pieceW);
            const slotW = (w.slot_width || w.width || w.diameter || 6) * (ph / pieceH);
            elements.push(
                <rect key={`s${k}`} x={px + p1.sx} y={py + p1.sy - slotW / 2} width={slotLen} height={slotW}
                    fill="#06b6d4" opacity={0.35} stroke="#0891b2" strokeWidth={0.6} rx={slotW / 2} />
            );

        // ── Furos (holes, boreholes) ──
        } else if (w.diameter) {
            const r = Math.max(1.5, (w.diameter / 2) * Math.min(pw / pieceW, ph / pieceH));
            const isTopFace = face === 'top' || face === 'bottom';
            const isSide = face === 'right' || face === 'left';
            const isBlind = cat.includes('blind');

            if (isTopFace || (!isSide)) {
                const fillColor = face === 'bottom' ? '#7c3aed' : '#e11d48';
                const strokeColor = face === 'bottom' ? '#6d28d9' : '#be123c';
                elements.push(
                    <circle key={`h${k}`} cx={px + p1.sx} cy={py + p1.sy} r={r}
                        fill={fillColor} opacity={0.55}
                        stroke={strokeColor} strokeWidth={0.5} />
                );
                if (isBlind) {
                    elements.push(
                        <circle key={`hb${k}`} cx={px + p1.sx} cy={py + p1.sy} r={Math.max(1, r * 0.35)}
                            fill="none" stroke={strokeColor} strokeWidth={0.6} opacity={0.7} />
                    );
                }
            } else if (isSide) {
                const edgeSize = Math.max(2, r * 0.8);
                if (face === 'right') {
                    elements.push(
                        <polygon key={`h${k}`}
                            points={`${px + pw},${py + p1.sy - edgeSize} ${px + pw - edgeSize * 1.5},${py + p1.sy} ${px + pw},${py + p1.sy + edgeSize}`}
                            fill="#2563eb" opacity={0.6} />
                    );
                } else {
                    elements.push(
                        <polygon key={`h${k}`}
                            points={`${px},${py + p1.sy - edgeSize} ${px + edgeSize * 1.5},${py + p1.sy} ${px},${py + p1.sy + edgeSize}`}
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
function ChapaViz({ chapa, idx, pecasMap, modo, zoomLevel, setZoomLevel, panOffset, onWheel, onPanStart, onPanMove, onPanEnd, resetView, getModColor, onAdjust, selectedPieces = [], onSelectPiece, kerfSize = 4, espacoPecas = 7, allChapas = [], classifyLocal, classColors = {}, classLabels = {}, onGerarGcode, onGerarGcodePeca, gcodeLoading, onView3D, onPrintLabel, onPrintSingleLabel, onPrintFolha, onSaveRetalhos, setTab, sobraMinW = 300, sobraMinH = 600, validationConflicts = [], machineArea, timerInfo }) {
    const [hovered, setHovered] = useState(null);
    const [showCuts, setShowCuts] = useState(false);
    const [showMachining, setShowMachining] = useState(true);
    const [dragging, setDragging] = useState(null);
    const [dragCollision, setDragCollision] = useState(false);
    const [snapGuides, setSnapGuides] = useState([]);
    const [ctxMenu, setCtxMenu] = useState(null);
    const [sobraCtxMenu, setSobraCtxMenu] = useState(null);
    const [sobraDrag, setSobraDrag] = useState(null);
    // ─── Retalhos management mode ───
    const [retMode, setRetMode] = useState(false);
    const [retDefs, setRetDefs] = useState([]); // [{x,y,w,h,type:'retalho'|'refugo'|null}]
    const [retSelected, setRetSelected] = useState(null); // index
    const [retSplitPreview, setRetSplitPreview] = useState(null); // {retIdx, axis:'h'|'v', pos}
    const containerRef = useRef(null);
    const svgRef = useRef(null);
    const [containerW, setContainerW] = useState(0);
    const marginDim = 30;

    // Medir container real para adaptar o SVG
    useEffect(() => {
        if (!containerRef.current) return;
        const measure = () => {
            const w = containerRef.current?.clientWidth || 0;
            if (w > 0) setContainerW(w);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Escala adaptada ao container — a chapa é o elemento principal, deve ocupar bem o espaço
    const maxW = containerW > 100 ? containerW - 40 : 800;
    const maxH = Math.min(window.innerHeight * 0.58, 720);
    const scale = Math.min((maxW - marginDim * 2) / chapa.comprimento, (maxH - marginDim) / chapa.largura);

    // Edge band color — based on color name (hash) or type fallback
    // Paleta fixa de cores para fitas — mais distinta que hash HSL
    const FITA_PALETTE = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a',
        '#ff5722', '#607d8b', '#795548', '#3f51b5', '#009688',
    ];
    const fitaColorCache = useRef({});
    let fitaColorIdx = useRef(0);
    const edgeColorGlobal = (val, corVal) => {
        if (!val) return null;
        const key = corVal || val;
        if (fitaColorCache.current[key]) return fitaColorCache.current[key];
        // Tentar match por padrão conhecido
        let color = null;
        const upper = (val + ' ' + (corVal || '')).toUpperCase();
        if (upper.includes('BRANCO') || upper.includes('WHITE')) color = '#78909c';
        else if (upper.includes('PRETO') || upper.includes('BLACK')) color = '#37474f';
        else if (upper.includes('FREIJO') || upper.includes('CARVALHO') || upper.includes('NOGUEIRA') || upper.includes('NOGAL')) color = '#8d6e47';
        else if (upper.includes('CANELA') || upper.includes('AMENDOA')) color = '#a1887f';
        else if (upper.includes('CINZA') || upper.includes('GRAFITE')) color = '#90a4ae';
        else {
            // Cor única por fita — pegar próxima da paleta
            color = FITA_PALETTE[fitaColorIdx.current % FITA_PALETTE.length];
            fitaColorIdx.current++;
        }
        fitaColorCache.current[key] = color;
        return color;
    };
    const svgW = chapa.comprimento * scale;
    const svgH = chapa.largura * scale;
    const refilo = (chapa.refilo || 0) * scale;
    const refiloVal = chapa.refilo || 0;
    const hasVeio = chapa.veio && chapa.veio !== 'sem_veio';
    const kerfPx = (kerfSize / 2) * scale;

    // ─── Client-side AABB collision check (com kerf, igual ao backend) ───
    const isColliding = useCallback((tx, ty, tw, th, exIdx) => {
        const k = Math.max(chapa.kerf || kerfSize || 0, espacoPecas || 0); // Usar o MAIOR entre kerf e espaço entre peças
        for (let i = 0; i < chapa.pecas.length; i++) {
            if (i === exIdx) continue;
            const b = chapa.pecas[i];
            // Expandir a peça testada por espaçamento em todos os lados (mesma lógica do backend compactBin)
            if (tx - k < b.x + b.w && tx + tw + k > b.x && ty - k < b.y + b.h && ty + th + k > b.y) return true;
        }
        return false;
    }, [chapa.pecas, chapa.kerf, kerfSize, espacoPecas]);

    // ─── Magnetic snap to adjacent edges (durante arrasto) ───
    const magneticSnap = useCallback((tx, ty, tw, th, exIdx) => {
        const k = Math.max(chapa.kerf || kerfSize || 0, espacoPecas || 0);
        const ref = chapa.refilo || 0;
        const uW = chapa.comprimento - 2 * ref, uH = chapa.largura - 2 * ref;
        // Limites: área útil completa
        const maxPosX = uW - tw, maxPosY = uH - th;
        const guides = [];

        // SEMPRE coletar todos os snaps — sem threshold de distância
        const snapsX = [];
        const snapsY = [];

        // Paredes (sempre disponíveis)
        snapsX.push({ pos: 0, guide: { t: 'v', p: 0 }, dist: Math.abs(tx) });
        snapsX.push({ pos: maxPosX, guide: { t: 'v', p: uW }, dist: Math.abs(tx - maxPosX) });
        snapsY.push({ pos: 0, guide: { t: 'h', p: 0 }, dist: Math.abs(ty) });
        snapsY.push({ pos: maxPosY, guide: { t: 'h', p: uH }, dist: Math.abs(ty - maxPosY) });

        // Bordas de TODAS as peças vizinhas (sem filtro de overlap — snap global)
        for (let i = 0; i < chapa.pecas.length; i++) {
            if (i === exIdx) continue;
            const o = chapa.pecas[i];
            // Snap X: encostar com kerf, alinhar bordas
            snapsX.push({ pos: o.x + o.w + k, guide: { t: 'v', p: o.x + o.w }, dist: Math.abs(tx - (o.x + o.w + k)) });
            snapsX.push({ pos: o.x - tw - k, guide: { t: 'v', p: o.x }, dist: Math.abs(tx + tw + k - o.x) });
            snapsX.push({ pos: o.x, guide: { t: 'v', p: o.x }, dist: Math.abs(tx - o.x) });
            snapsX.push({ pos: o.x + o.w - tw, guide: { t: 'v', p: o.x + o.w }, dist: Math.abs(tx + tw - (o.x + o.w)) });
            // Snap Y: encostar com kerf, alinhar bordas
            snapsY.push({ pos: o.y + o.h + k, guide: { t: 'h', p: o.y + o.h }, dist: Math.abs(ty - (o.y + o.h + k)) });
            snapsY.push({ pos: o.y - th - k, guide: { t: 'h', p: o.y }, dist: Math.abs(ty + th + k - o.y) });
            snapsY.push({ pos: o.y, guide: { t: 'h', p: o.y }, dist: Math.abs(ty - o.y) });
            snapsY.push({ pos: o.y + o.h - th, guide: { t: 'h', p: o.y + o.h }, dist: Math.abs(ty + th - (o.y + o.h)) });
        }

        // Threshold: snap ATIVO quando dentro de S mm. FORA de S, usa posição arredondada para inteiro.
        const S = Math.max(20, Math.min(50, 30 / (zoomLevel || 1)));

        let sx = Math.round(tx), sy = Math.round(ty);
        snapsX.sort((a, b) => a.dist - b.dist);
        snapsY.sort((a, b) => a.dist - b.dist);
        // Sempre snap ao mais próximo se dentro de S — senão arredonda para inteiro (nunca decimal)
        if (snapsX.length > 0 && snapsX[0].dist < S) { sx = Math.round(snapsX[0].pos); guides.push(snapsX[0].guide); }
        if (snapsY.length > 0 && snapsY[0].dist < S) { sy = Math.round(snapsY[0].pos); guides.push(snapsY[0].guide); }

        return { x: sx, y: sy, guides };
    }, [chapa.pecas, chapa.refilo, chapa.comprimento, chapa.largura, chapa.kerf, kerfSize, espacoPecas, zoomLevel]);

    // ─── Pixel to MM ───
    const pixelToMM = (clientX, clientY) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        // viewBox: -marginDim, -14, svgW+marginDim*2+2, svgH+marginDim+20
        const vbW = svgW + marginDim * 2 + 2;
        const vbH = svgH + marginDim + 20;
        // pixel → SVG coord
        const svgX = -marginDim + ((clientX - rect.left) / rect.width) * vbW;
        const svgY = -14 + ((clientY - rect.top) / rect.height) * vbH;
        // SVG coord → usable mm (pieces render at (x + refilo) * scale)
        const mmX = svgX / scale - refiloVal;
        const mmY = svgY / scale - refiloVal;
        return { x: mmX, y: mmY };
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
        // Limites: área útil completa (0 a binW-pw). Colisão com kerf cuida do espaçamento.
        const maxX = chapa.comprimento - 2 * ref - p.w;
        const maxY = chapa.largura - 2 * ref - p.h;
        let rx = Math.max(0, Math.min(maxX, dragging.origX + (mm.x - dragging.startX)));
        let ry = Math.max(0, Math.min(maxY, dragging.origY + (mm.y - dragging.startY)));
        // Magnetic snap
        const snap = magneticSnap(rx, ry, p.w, p.h, dragging.pecaIdx);
        // Round to integer mm and clamp STRICTLY within usable area
        rx = Math.round(Math.max(0, Math.min(maxX, snap.x)));
        ry = Math.round(Math.max(0, Math.min(maxY, snap.y)));
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

    // ─── Force-snap: peça DEVE sempre encostar em parede ou outra peça ───
    // Gera todas as posições válidas de encaixe e retorna a mais próxima sem colisão
    const forceSnap = useCallback((tx, ty, tw, th, exIdx) => {
        const k = Math.max(chapa.kerf || kerfSize || 0, espacoPecas || 0);
        const ref = chapa.refilo || 0;
        const uW = chapa.comprimento - 2 * ref, uH = chapa.largura - 2 * ref;
        // Limites: área útil completa (mesma que o otimizador + compactBin)
        const maxPosX = Math.round(uW - tw);
        const maxPosY = Math.round(uH - th);

        // Coletar TODAS as âncoras possíveis em X e Y (arredondadas para inteiro)
        // Âncora X = posição onde o left da peça pode ir (ou right - tw)
        const anchorsX = [0, maxPosX]; // paredes esquerda e direita (com kerf)
        const anchorsY = [0, maxPosY]; // paredes topo e base (com kerf)

        for (let i = 0; i < chapa.pecas.length; i++) {
            if (i === exIdx) continue;
            const o = chapa.pecas[i];
            // Âncoras X: encostar à direita da peça vizinha, ou à esquerda
            anchorsX.push(Math.round(o.x + o.w + k));      // left da peça = right do vizinho + kerf
            anchorsX.push(Math.round(o.x - tw - k));        // right da peça = left do vizinho - kerf
            // Alinhar bordas (mesma posição X)
            anchorsX.push(Math.round(o.x));                  // left alinhado
            anchorsX.push(Math.round(o.x + o.w - tw));       // right alinhado
            // Âncoras Y: encostar abaixo da peça vizinha, ou acima
            anchorsY.push(Math.round(o.y + o.h + k));
            anchorsY.push(Math.round(o.y - th - k));
            anchorsY.push(Math.round(o.y));
            anchorsY.push(Math.round(o.y + o.h - th));
        }

        // Filtrar âncoras ESTRITAMENTE dentro da área útil (nunca no refilo nem além do kerf da borda)
        const validX = [...new Set(anchorsX.map(x => Math.round(x)))].filter(x => x >= 0 && x <= maxPosX + 0.1).map(x => Math.max(0, Math.min(maxPosX, x)));
        const validY = [...new Set(anchorsY.map(y => Math.round(y)))].filter(y => y >= 0 && y <= maxPosY + 0.1).map(y => Math.max(0, Math.min(maxPosY, y)));

        // Verificar que a posição toca pelo menos uma parede ou peça em cada eixo
        const touchesX = (fx) => {
            if (Math.abs(fx) < 1 || Math.abs(fx + tw - uW) < 1) return true;
            for (let i = 0; i < chapa.pecas.length; i++) {
                if (i === exIdx) continue;
                const o = chapa.pecas[i];
                if (Math.abs(fx - (o.x + o.w + k)) < 1 || Math.abs(fx + tw + k - o.x) < 1) return true;
            }
            return false;
        };
        const touchesY = (fy) => {
            if (Math.abs(fy) < 1 || Math.abs(fy + th - uH) < 1) return true;
            for (let i = 0; i < chapa.pecas.length; i++) {
                if (i === exIdx) continue;
                const o = chapa.pecas[i];
                if (Math.abs(fy - (o.y + o.h + k)) < 1 || Math.abs(fy + th + k - o.y) < 1) return true;
            }
            return false;
        };

        // Gerar todas as combinações (X, Y) e ordenar por distância ao ponto de drop
        // Prioridade: toca em ambos eixos > toca em 1 eixo > nenhum toque
        const candidates = [];
        for (const ax of validX) {
            const tx_ = touchesX(ax);
            for (const ay of validY) {
                const ty_ = touchesY(ay);
                if (!tx_ && !ty_) continue; // pelo menos 1 eixo deve tocar
                const priority = (tx_ && ty_) ? 0 : 1; // ambos tocam = melhor
                const dist = Math.hypot(ax - tx, ay - ty);
                candidates.push({ x: Math.round(ax), y: Math.round(ay), dist, priority });
            }
        }
        candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);

        // Retornar a candidata mais próxima que não colide
        for (const c of candidates) {
            if (!isColliding(c.x, c.y, tw, th, exIdx)) {
                return { x: c.x, y: c.y, valid: true };
            }
        }

        // Fallback: nenhuma posição alinhada disponível → tentar apenas snap por eixo mais próximo
        const sortedX = validX.map(x => ({ x: Math.round(x), d: Math.abs(x - tx) })).sort((a, b) => a.d - b.d);
        const sortedY = validY.map(y => ({ y: Math.round(y), d: Math.abs(y - ty) })).sort((a, b) => a.d - b.d);
        for (const sx of sortedX) {
            for (const sy of sortedY) {
                if (!isColliding(sx.x, sy.y, tw, th, exIdx)) {
                    return { x: sx.x, y: sy.y, valid: true };
                }
            }
        }

        // Nenhuma posição válida — reverter
        return { x: tx, y: ty, valid: false };
    }, [chapa.pecas, chapa.refilo, chapa.comprimento, chapa.largura, chapa.kerf, kerfSize, espacoPecas, isColliding]);

    const handleDragEnd = () => {
        if (!dragging || dragging.newX == null) { setDragging(null); setDragCollision(false); setSnapGuides([]); return; }
        const g = svgRef.current?.querySelector(`[data-pidx="${dragging.pecaIdx}"]`);
        if (g) g.removeAttribute('transform');
        const p = chapa.pecas[dragging.pecaIdx];
        if (!p) { setDragging(null); setDragCollision(false); setSnapGuides([]); return; }

        // Force-snap: encontrar melhor posição alinhada sem colisão
        const snapped = forceSnap(dragging.newX, dragging.newY, p.w, p.h, dragging.pecaIdx);

        if (!snapped.valid) {
            // Nenhuma posição válida → reverter ao original
            setDragging(null); setDragCollision(false); setSnapGuides([]);
            return;
        }

        const sx = snapped.x, sy = snapped.y;
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
        const close = (e) => {
            // Don't close if clicking inside the context menu itself
            const menu = document.querySelector('[data-ctx-menu="piece"]');
            if (menu && menu.contains(e.target)) return;
            setCtxMenu(null);
        };
        // Delay listener to avoid Ctrl+click release on Mac closing the menu instantly
        const timer = setTimeout(() => document.addEventListener('mousedown', close), 50);
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
    }, [ctxMenu]);

    useEffect(() => {
        if (!sobraCtxMenu) return;
        const close = (e) => {
            const menu = document.querySelector('[data-ctx-menu="sobra"]');
            if (menu && menu.contains(e.target)) return;
            setSobraCtxMenu(null);
        };
        const timer = setTimeout(() => document.addEventListener('mousedown', close), 50);
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', close); };
    }, [sobraCtxMenu]);

    // (Drag de sobras removido — agora é por clique na barra "CORTAR")

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
                    <span className={tagClass} style={tagStyle(chapa.aproveitamento >= 80 ? '#2563eb' : chapa.aproveitamento >= 60 ? '#d97706' : '#dc2626')}>
                        {chapa.aproveitamento.toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{chapa.pecas.length} pç</span>
                    {chapa.is_retalho && <span className={tagClass} style={tagStyle('#0e7490')}>RETALHO</span>}
                    {hasVeio && (
                        <span className={tagClass} style={tagStyle('#7c3aed')}>
                            {chapa.veio === 'horizontal' ? '━ Veio H' : '┃ Veio V'}
                        </span>
                    )}
                    {/* Timer de corte */}
                    {timerInfo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: timerInfo.running ? 'rgba(34,197,94,0.08)' : 'var(--bg-muted)', border: `1px solid ${timerInfo.running ? 'rgba(34,197,94,0.3)' : 'var(--border)'}` }}>
                            <Clock size={11} style={{ color: timerInfo.running ? '#22c55e' : 'var(--text-muted)' }} />
                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: timerInfo.running ? '#22c55e' : 'var(--text-primary)' }}>
                                {timerInfo.formatTimer(timerInfo.elapsed)}
                            </span>
                            {timerInfo.estMin > 0 && (
                                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>/ {timerInfo.estMin}m</span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); timerInfo.running ? timerInfo.onStop() : timerInfo.onStart(); }}
                                style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: timerInfo.running ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', color: timerInfo.running ? '#ef4444' : '#22c55e' }}>
                                {timerInfo.running ? 'Pausar' : 'Iniciar'}
                            </button>
                            {timerInfo.hasTimer && !timerInfo.running && timerInfo.elapsed > 0 && (
                                <button onClick={(e) => { e.stopPropagation(); if (confirm('Resetar timer?')) timerInfo.onReset(); }}
                                    style={{ padding: '1px 4px', borderRadius: 4, fontSize: 9, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}
                                    title="Resetar timer">
                                    <Undo2 size={9} />
                                </button>
                            )}
                        </div>
                    )}
                    {onPrintLabel && (
                        <button onClick={() => onPrintLabel(idx)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                border: '1px solid var(--border)', cursor: 'pointer',
                            }}
                            title="Etiquetas desta chapa">
                            <TagIcon size={11} /> Etiquetas
                        </button>
                    )}
                    {onPrintFolha && (
                        <button onClick={() => onPrintFolha(idx)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                background: 'var(--bg-muted)', color: 'var(--text-primary)',
                                border: '1px solid var(--border)', cursor: 'pointer',
                            }}
                            title="Folha de Produção desta chapa">
                            <FileText size={11} /> Folha
                        </button>
                    )}
                    {/* Recalcular Sobras — detecta espaço livre SEM sobreposição */}
                    <button onClick={() => {
                        const ref = chapa.refilo || 0;
                        const uW = chapa.comprimento - 2 * ref;
                        const uH = chapa.largura - 2 * ref;
                        const pecas = chapa.pecas || [];
                        if (pecas.length === 0) return;

                        // ── Helper: recortar retângulo A removendo área de B ──
                        const clipRect = (a, b) => {
                            // Se não se tocam, A fica inteiro
                            if (a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h) return [a];
                            const result = [];
                            // Faixa acima de B
                            if (a.y < b.y) result.push({ x: a.x, y: a.y, w: a.w, h: b.y - a.y });
                            // Faixa abaixo de B
                            if (a.y + a.h > b.y + b.h) result.push({ x: a.x, y: b.y + b.h, w: a.w, h: (a.y + a.h) - (b.y + b.h) });
                            // Faixa à esquerda (só na zona de overlap Y)
                            const oy1 = Math.max(a.y, b.y), oy2 = Math.min(a.y + a.h, b.y + b.h);
                            if (oy2 > oy1) {
                                if (a.x < b.x) result.push({ x: a.x, y: oy1, w: b.x - a.x, h: oy2 - oy1 });
                                if (a.x + a.w > b.x + b.w) result.push({ x: b.x + b.w, y: oy1, w: (a.x + a.w) - (b.x + b.w), h: oy2 - oy1 });
                            }
                            return result.filter(r => r.w > 1 && r.h > 1);
                        };

                        // ── 1. Criar grade de células livres ──
                        const xsSet = new Set([0, uW]);
                        const ysSet = new Set([0, uH]);
                        for (const p of pecas) {
                            xsSet.add(Math.max(0, Math.min(uW, p.x)));
                            xsSet.add(Math.max(0, Math.min(uW, p.x + p.w)));
                            ysSet.add(Math.max(0, Math.min(uH, p.y)));
                            ysSet.add(Math.max(0, Math.min(uH, p.y + p.h)));
                        }
                        const xs = [...xsSet].sort((a, b) => a - b);
                        const ys = [...ysSet].sort((a, b) => a - b);
                        const nx = xs.length - 1, ny = ys.length - 1;
                        if (nx <= 0 || ny <= 0) return;

                        const occ = Array.from({ length: nx }, () => Array(ny).fill(false));
                        for (const p of pecas) {
                            for (let ci = 0; ci < nx; ci++) {
                                if (xs[ci + 1] <= p.x + 0.5 || xs[ci] >= p.x + p.w - 0.5) continue;
                                for (let cj = 0; cj < ny; cj++) {
                                    if (ys[cj + 1] <= p.y + 0.5 || ys[cj] >= p.y + p.h - 0.5) continue;
                                    occ[ci][cj] = true;
                                }
                            }
                        }

                        // ── 2. Histograma → retângulos maximais ──
                        const height = Array.from({ length: nx }, () => Array(ny).fill(0));
                        for (let ci = 0; ci < nx; ci++) {
                            for (let cj = 0; cj < ny; cj++) {
                                height[ci][cj] = occ[ci][cj] ? 0 : (cj > 0 ? height[ci][cj - 1] + 1 : 1);
                            }
                        }
                        const allRects = [];
                        for (let cj = 0; cj < ny; cj++) {
                            const stack = [];
                            for (let ci = 0; ci <= nx; ci++) {
                                const h = ci < nx ? height[ci][cj] : 0;
                                let start = ci;
                                while (stack.length && stack[stack.length - 1][1] > h) {
                                    const [sci, sh] = stack.pop();
                                    const rx = xs[sci], rw = (ci < xs.length ? xs[ci] : xs[xs.length - 1]) - rx;
                                    const ry = ys[cj - sh + 1], rh = ys[cj + 1] - ry;
                                    if (rw > 5 && rh > 5) allRects.push({ x: rx, y: ry, w: rw, h: rh, area: rw * rh });
                                    start = sci;
                                }
                                stack.push([start, h]);
                            }
                        }
                        // Deduplicar exatos
                        const seen = new Set();
                        const uniqueRects = allRects.filter(r => {
                            const key = `${r.x.toFixed(1)}_${r.y.toFixed(1)}_${r.w.toFixed(1)}_${r.h.toFixed(1)}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                        uniqueRects.sort((a, b) => b.area - a.area);

                        // ── 3. Seleção gulosa SEM sobreposição ──
                        // Pegar o maior, recortar todos os outros contra ele, repetir
                        const minW = sobraMinW, minH = sobraMinH;
                        const isValid = (r) => { const s = Math.min(r.w, r.h), l = Math.max(r.w, r.h); return s >= minW && l >= minH; };

                        const selected = [];
                        let candidates = uniqueRects.filter(r => isValid(r));

                        for (let iter = 0; iter < 20 && candidates.length > 0; iter++) {
                            // Pegar o maior candidato
                            candidates.sort((a, b) => (b.w * b.h) - (a.w * a.h));
                            const best = candidates.shift();
                            selected.push(best);

                            // Recortar todos os restantes contra o selecionado
                            const nextCandidates = [];
                            for (const c of candidates) {
                                const clipped = clipRect(c, best);
                                for (const piece of clipped) {
                                    piece.area = piece.w * piece.h;
                                    if (isValid(piece)) nextCandidates.push(piece);
                                }
                            }
                            candidates = nextCandidates;
                        }

                        // ── 4. Tentar merge adjacente dos selecionados ──
                        let rects = selected;
                        let merged = true;
                        while (merged) {
                            merged = false;
                            const next = [];
                            const skip = new Set();
                            for (let i = 0; i < rects.length; i++) {
                                if (skip.has(i)) continue;
                                let { x: rx, y: ry, w: rw, h: rh } = rects[i];
                                for (let j = i + 1; j < rects.length; j++) {
                                    if (skip.has(j)) continue;
                                    const o = rects[j];
                                    const T = 1;
                                    if (Math.abs(ry - o.y) < T && Math.abs(rh - o.h) < T && Math.abs(rx + rw - o.x) < T) { rw += o.w; skip.add(j); merged = true; }
                                    else if (Math.abs(ry - o.y) < T && Math.abs(rh - o.h) < T && Math.abs(o.x + o.w - rx) < T) { rx = o.x; rw += o.w; skip.add(j); merged = true; }
                                    else if (Math.abs(rx - o.x) < T && Math.abs(rw - o.w) < T && Math.abs(ry + rh - o.y) < T) { rh += o.h; skip.add(j); merged = true; }
                                    else if (Math.abs(rx - o.x) < T && Math.abs(rw - o.w) < T && Math.abs(o.y + o.h - ry) < T) { ry = o.y; rh += o.h; skip.add(j); merged = true; }
                                }
                                next.push({ x: rx, y: ry, w: rw, h: rh });
                            }
                            rects = next;
                        }

                        const remnants = rects
                            .filter(r => isValid(r))
                            .map(r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }));

                        if (onAdjust) {
                            onAdjust({ action: 'recalc_sobras', chapaIdx: idx, retalhos: remnants });
                        }
                    }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: 'var(--bg-muted)', color: 'var(--text-primary)',
                            border: '1px solid var(--border)', cursor: 'pointer',
                        }}
                        title="Detectar espaço livre e gerar retalhos baseado na posição atual das peças">
                        <RefreshCw size={11} /> Recalcular Sobras
                    </button>
                    {(chapa.retalhos?.length > 0) && (
                        <button onClick={() => {
                            if (!retMode) {
                                setRetDefs((chapa.retalhos || []).map(r => ({ ...r, type: null })));
                                setRetSelected(null);
                                setRetSplitPreview(null);
                            }
                            setRetMode(!retMode);
                        }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                background: retMode ? '#059669' : 'var(--bg-muted)',
                                color: retMode ? '#fff' : 'var(--text-primary)',
                                border: retMode ? '1px solid #059669' : '1px solid var(--border)', cursor: 'pointer',
                            }}
                            title="Definir retalhos e refugos">
                            <Scissors size={11} /> {retMode ? 'Editando Sobras' : 'Definir Sobras'}
                        </button>
                    )}
                    {onGerarGcode && (
                        <button
                            onClick={() => onGerarGcode(idx)}
                            disabled={gcodeLoading === idx}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                background: gcodeLoading === idx ? 'var(--bg-muted)' : '#1e40af',
                                color: '#fff', border: 'none', cursor: gcodeLoading === idx ? 'wait' : 'pointer',
                            }}
                            title="Gerar e baixar G-Code desta chapa"
                        >
                            <Download size={11} />
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

            {/* Edge band legend — dynamic from actual piece data */}
            {(() => {
                const fitaSet = new Map();
                chapa.pecas.forEach(p => {
                    const pc = pecasMap[p.pecaId];
                    if (!pc) return;
                    ['frontal','traseira','esq','dir'].forEach(side => {
                        const tipo = pc[`borda_${side}`];
                        const cor = pc[`borda_cor_${side}`];
                        if (tipo) {
                            const key = cor || tipo;
                            if (!fitaSet.has(key)) fitaSet.set(key, edgeColorGlobal(tipo, cor));
                        }
                    });
                });
                if (fitaSet.size === 0) return null;
                return (
                    <div style={{ display: 'flex', gap: 10, padding: '3px 8px', fontSize: 9, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700 }}>Fitas:</span>
                        {[...fitaSet.entries()].map(([name, color]) => (
                            <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ width: 14, height: 3, borderRadius: 1, background: color, display: 'inline-block' }} />
                                {name.replace(/_/g, ' ')}
                            </span>
                        ))}
                    </div>
                );
            })()}

            {/* SVG Canvas with zoom/pan */}
            <div style={{ overflow: 'hidden', border: `2px solid ${dragCollision ? '#ef4444' : dragging ? '#2563eb' : 'var(--border)'}`, background: '#f8f7f5', position: 'relative', cursor: dragging ? 'grabbing' : isPanningCursor(zoomLevel), transition: 'border-color .15s' }}
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

                        {/* Defs: grain pattern + text shadow filter */}
                        <defs>
                            <pattern id={`grain-h-${idx}`} patternUnits="userSpaceOnUse" width={svgW} height="6" patternTransform="rotate(0)">
                                <line x1="0" y1="3" x2={svgW} y2="3" stroke="#a08060" strokeWidth="0.4" opacity="0.3" />
                            </pattern>
                            <pattern id={`grain-v-${idx}`} patternUnits="userSpaceOnUse" width="6" height={svgH} patternTransform="rotate(0)">
                                <line x1="3" y1="0" x2="3" y2={svgH} stroke="#a08060" strokeWidth="0.4" opacity="0.3" />
                            </pattern>
                            <filter id={`ts-${idx}`} x="-5%" y="-5%" width="110%" height="110%">
                                <feDropShadow dx="0" dy="0.5" stdDeviation="0.8" floodColor="#000" floodOpacity="0.6"/>
                            </filter>
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
                                        <line x1={svgW * 0.2} y1={-12} x2={svgW * 0.8} y2={-12} stroke="#a08060" strokeWidth={1.5} markerEnd={`url(#arrow-${idx})`} />
                                        <text x={svgW * 0.5} y={-13} textAnchor="middle" fontSize={7} fill="#a08060" fontWeight={700}>VEIO</text>
                                    </>
                                ) : (
                                    <text x={svgW + marginDim + 5} y={svgH * 0.5} textAnchor="middle" fontSize={7} fill="#a08060" fontWeight={700}
                                        transform={`rotate(90, ${svgW + marginDim + 5}, ${svgH * 0.5})`}>VEIO ↓</text>
                                )}
                                <defs>
                                    <marker id={`arrow-${idx}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                                        <polygon points="0 0, 6 2, 0 4" fill="#a08060" />
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

                        {/* Sheet background — cor baseada no material */}
                        <rect x={0} y={0} width={svgW} height={svgH}
                            fill={(() => {
                                const mat = (chapa.material || '').toUpperCase();
                                if (mat.includes('BRANCO') || mat.includes('WHITE') || mat.includes('BP_BR')) return '#f5f0e8';
                                if (mat.includes('PRETO') || mat.includes('BLACK')) return '#a09890';
                                if (mat.includes('CINZA') || mat.includes('GRAFITE')) return '#c8c0b8';
                                if (mat.includes('FREIJO') || mat.includes('CARVALHO')) return '#d4a76a';
                                if (mat.includes('NOGUEIRA') || mat.includes('NOGAL')) return '#b8906a';
                                if (mat.includes('CANELA')) return '#c49a6c';
                                if (mat.includes('AMENDOA')) return '#d4b896';
                                if (mat.includes('RUSTICO') || mat.includes('DEMOLICAO')) return '#b8956a';
                                return '#eae5dc';
                            })()} stroke="#8a7d6d" strokeWidth={1.5} />

                        {/* Grain pattern overlay on sheet */}
                        {hasVeio && (
                            <rect x={0} y={0} width={svgW} height={svgH}
                                fill={`url(#grain-${chapa.veio === 'horizontal' ? 'h' : 'v'}-${idx})`} />
                        )}

                        {/* Machine work area boundary overlay */}
                        {machineArea && (chapa.comprimento > machineArea.x_max || chapa.largura > machineArea.y_max) && (
                            <g>
                                <rect x={0} y={0}
                                    width={Math.min(machineArea.x_max, chapa.comprimento) * scale}
                                    height={Math.min(machineArea.y_max, chapa.largura) * scale}
                                    fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="8,4" opacity={0.7} />
                                <text x={Math.min(machineArea.x_max, chapa.comprimento) * scale - 4} y={12}
                                    textAnchor="end" fontSize={8} fill="#3b82f6" fontWeight={700} opacity={0.8}>
                                    Área máq: {machineArea.x_max}×{machineArea.y_max}mm
                                </text>
                                {/* Danger zone beyond machine limits */}
                                {chapa.comprimento > machineArea.x_max && (
                                    <rect x={machineArea.x_max * scale} y={0}
                                        width={(chapa.comprimento - machineArea.x_max) * scale} height={svgH}
                                        fill="rgba(239,68,68,0.1)" stroke="none" />
                                )}
                                {chapa.largura > machineArea.y_max && (
                                    <rect x={0} y={machineArea.y_max * scale}
                                        width={svgW} height={(chapa.largura - machineArea.y_max) * scale}
                                        fill="rgba(239,68,68,0.1)" stroke="none" />
                                )}
                            </g>
                        )}

                        {/* Refilo area (border trim) — zona proibida com hachura */}
                        {refiloVal > 0 && <>
                            <defs>
                                <pattern id={`refilo-hatch-${idx}`} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
                                    <line x1={0} y1={0} x2={0} y2={4} stroke="rgba(200,60,60,0.35)" strokeWidth={0.8} />
                                </pattern>
                            </defs>
                            <rect x={0} y={0} width={svgW} height={refilo} fill={`url(#refilo-hatch-${idx})`} />
                            <rect x={0} y={svgH - refilo} width={svgW} height={refilo} fill={`url(#refilo-hatch-${idx})`} />
                            <rect x={0} y={refilo} width={refilo} height={svgH - 2 * refilo} fill={`url(#refilo-hatch-${idx})`} />
                            <rect x={svgW - refilo} y={refilo} width={refilo} height={svgH - 2 * refilo} fill={`url(#refilo-hatch-${idx})`} />
                            {refilo > 6 && (
                                <text x={refilo / 2} y={svgH / 2} textAnchor="middle" fontSize={Math.min(7, refilo * 0.7)} fill="rgba(180,50,50,0.6)"
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
                                fill="none" stroke="#d4a053" strokeWidth={0.5} strokeDasharray="2 2" opacity={0.35} />;
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
                            const isRet = c.tipo === 'separacao_retalho';
                            // GuillotineBin format: x, y, length (position within usable area)
                            const cx = (c.x != null ? c.x : 0) + refiloVal;
                            const cy = (c.y != null ? c.y : (c.pos || 0)) + refiloVal;
                            const len = c.length || c.len || (isH ? chapa.comprimento - 2 * refiloVal : chapa.largura - 2 * refiloVal);
                            const color = isRet ? '#059669' : (isH ? '#ef4444' : '#f59e0b');
                            return (
                                <g key={`cut${ci}`}>
                                    {isH ? (
                                        <line x1={cx * scale} y1={cy * scale}
                                            x2={(cx + len) * scale} y2={cy * scale}
                                            stroke={`${color}80`} strokeWidth={isRet ? 2 : 1.5} strokeDasharray={isRet ? '8 4' : '6 3'} />
                                    ) : (
                                        <line x1={cx * scale} y1={cy * scale}
                                            x2={cx * scale} y2={(cy + len) * scale}
                                            stroke={`${color}80`} strokeWidth={isRet ? 2 : 1.5} strokeDasharray={isRet ? '8 4' : '6 3'} />
                                    )}
                                    <text x={isH ? cx * scale + 3 : cx * scale + 2}
                                        y={isH ? cy * scale - 2 : cy * scale + 10}
                                        fontSize={7} fill={color} fontWeight={700}>
                                        {isRet ? `R${c.seq || ''}` : (c.seq || (ci + 1))}
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

                        {/* Scraps — diagonal hatch, neutral (rendered BEFORE pieces so pieces stay on top and draggable) */}
                        {(chapa.retalhos || []).map((r, ri) => {
                            const srx = (r.x + refiloVal) * scale;
                            const sry = (r.y + refiloVal) * scale;
                            const srw = r.w * scale;
                            const srh = r.h * scale;
                            const hatchId = `hatch-${idx}-${ri}`;
                            return (
                                <g key={`s${ri}`} style={{ cursor: 'context-menu' }}
                                    onContextMenu={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        const cr = containerRef.current?.getBoundingClientRect();
                                        setSobraCtxMenu({ x: e.clientX - (cr?.left || 0), y: e.clientY - (cr?.top || 0), retalhoIdx: ri, chapaIdx: idx });
                                        setCtxMenu(null);
                                    }}>
                                    <defs>
                                        <pattern id={hatchId} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
                                            <line x1={0} y1={0} x2={0} y2={6} stroke="#9ca3af" strokeWidth={0.6} />
                                        </pattern>
                                    </defs>
                                    <rect x={srx} y={sry} width={srw} height={srh}
                                        fill={`url(#${hatchId})`} stroke="#9ca3af" strokeWidth={0.8} opacity={0.6} />
                                    {srw > 40 && srh > 16 && (
                                        <text x={srx + srw / 2} y={sry + srh / 2} textAnchor="middle" dominantBaseline="central"
                                            fontSize={7} fill="#6b7280" fontWeight={600}
                                            stroke="#fff" strokeWidth={2} paintOrder="stroke"
                                            style={{ pointerEvents: 'none' }}>
                                            {Math.round(r.w)}×{Math.round(r.h)}
                                        </text>
                                    )}
                                </g>
                            );
                        })}

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
                            let fillColor = color, strokeClr = color, strokeW = isHovered ? 2.5 : 1;
                            if (isDragging) {
                                fillColor = dragCollision ? '#ef4444' : '#2563eb';
                                strokeClr = dragCollision ? '#ef4444' : '#2563eb';
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

                                    {/* Piece fill — contour polygon or rectangle */}
                                    {p.contour && p.contour.length >= 3 ? (
                                        <polygon
                                            points={p.contour.map(v => `${px + (v.x / p.w) * pw},${py + (v.y / p.h) * ph}`).join(' ')}
                                            fill={fillColor} fillOpacity={isDragging ? 0.3 : isHovered ? 0.85 : 0.7}
                                            stroke={isDragging ? strokeClr : '#1a1a1a'} strokeWidth={isDragging ? strokeW : isHovered ? 1.5 : 0.8} />
                                    ) : (
                                        <rect x={px} y={py} width={pw} height={ph}
                                            fill={fillColor} fillOpacity={isDragging ? 0.3 : isHovered ? 0.85 : 0.7}
                                            stroke={isDragging ? strokeClr : '#1a1a1a'} strokeWidth={isDragging ? strokeW : isHovered ? 1.5 : 0.8} />
                                    )}

                                    {/* Selection border */}
                                    {isSelected && !isDragging && (
                                        <rect x={px - 2} y={py - 2} width={pw + 4} height={ph + 4}
                                            fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 2" />
                                    )}

                                    {/* Grain lines on piece (subtle warm) */}
                                    {hasVeio && pw > 20 && ph > 20 && (
                                        <g opacity={0.22}>
                                            {chapa.veio === 'horizontal' ? (
                                                Array.from({ length: Math.floor(ph / 5) }, (_, i) => (
                                                    <line key={i} x1={px + 1} y1={py + i * 5 + 2.5} x2={px + pw - 1} y2={py + i * 5 + 2.5}
                                                        stroke="#a08060" strokeWidth={0.5} />
                                                ))
                                            ) : (
                                                Array.from({ length: Math.floor(pw / 5) }, (_, i) => (
                                                    <line key={i} x1={px + i * 5 + 2.5} y1={py + 1} x2={px + i * 5 + 2.5} y2={py + ph - 1}
                                                        stroke="#a08060" strokeWidth={0.5} />
                                                ))
                                            )}
                                        </g>
                                    )}

                                    {/* Piece name */}
                                    {pw > 35 && ph > 16 && (
                                        <text x={px + pw / 2} y={py + ph / 2 - (pw > 50 && ph > 28 ? 5 : 0)}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.min(10, Math.min(pw / 8, ph / 3))} fill="#1a1a1a" fontWeight={700}
                                            stroke="#fff" strokeWidth={2.5} paintOrder="stroke"
                                            style={{ pointerEvents: 'none' }}>
                                            {piece ? piece.descricao?.substring(0, Math.floor(pw / 6)) : `P${pi + 1}`}
                                        </text>
                                    )}
                                    {/* Piece dimensions */}
                                    {pw > 50 && ph > 28 && (
                                        <text x={px + pw / 2} y={py + ph / 2 + 7}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.min(8, pw / 10)} fill="#333" fontWeight={600}
                                            stroke="#fff" strokeWidth={2} paintOrder="stroke"
                                            style={{ pointerEvents: 'none' }}>
                                            {Math.round(p.w)} × {Math.round(p.h)}
                                        </text>
                                    )}
                                    {/* Rotation indicator */}
                                    {p.rotated && pw > 18 && ph > 18 && (
                                        <g style={{ pointerEvents: 'none' }}>
                                            <rect x={px + 2} y={py + 2} width={14} height={11}
                                                fill="rgba(0,0,0,0.5)" />
                                            <text x={px + 9} y={py + 10} textAnchor="middle" fontSize={8} fill="#fff" fontWeight={700}>R</text>
                                        </g>
                                    )}

                                    {/* Side B indicator (flip) */}
                                    {p.lado_ativo === 'B' && pw > 18 && ph > 18 && (
                                        <g style={{ pointerEvents: 'none' }}>
                                            <rect x={px + pw - 18} y={py + ph - 15} width={16} height={13}
                                                fill="rgba(14,165,233,0.85)" rx={2} />
                                            <text x={px + pw - 10} y={py + ph - 5} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={800}>B</text>
                                        </g>
                                    )}
                                    {/* Side B overlay tint */}
                                    {p.lado_ativo === 'B' && (
                                        <rect x={px} y={py} width={pw} height={ph}
                                            fill="#0ea5e9" fillOpacity={0.08}
                                            style={{ pointerEvents: 'none' }} />
                                    )}

                                    {/* Classification badge (pequena/super_pequena) */}
                                    {classifyLocal && pw > 18 && ph > 18 && (() => {
                                        const cls = p.classificacao || classifyLocal(p.w, p.h);
                                        if (cls === 'normal') return null;
                                        const clsC = classColors[cls] || '#f59e0b';
                                        const label = cls === 'super_pequena' ? 'SP' : 'P';
                                        return (
                                            <g transform={`translate(${px + 2}, ${py + ph - 14})`} style={{ pointerEvents: 'none' }}>
                                                <rect width={cls === 'super_pequena' ? 16 : 12} height={11} fill={clsC} opacity={0.9} />
                                                <text x={cls === 'super_pequena' ? 8 : 6} y={8} textAnchor="middle" fontSize={7} fill="#fff" fontWeight={800}>{label}</text>
                                            </g>
                                        );
                                    })()}

                                    {/* Edge band indicators (fita borda) — follows contour for irregular pieces */}
                                    {piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira) && pw > 12 && ph > 12 && (() => {
                                        if (p.contour && p.contour.length >= 3) {
                                            // For contour pieces, draw edge band as a polyline along the contour
                                            const anyBorda = piece.borda_frontal || piece.borda_traseira || piece.borda_dir || piece.borda_esq;
                                            const c = edgeColorGlobal(anyBorda, piece.borda_cor_frontal || piece.borda_cor_dir || piece.borda_cor_esq || piece.borda_cor_traseira);
                                            const pts = p.contour.map(v => `${px + (v.x / p.w) * pw},${py + (v.y / p.h) * ph}`).join(' ');
                                            return (
                                                <g style={{ pointerEvents: 'none' }}>
                                                    <polygon points={pts} fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" />
                                                </g>
                                            );
                                        }
                                        const t = 2.5, inset = 0.5;
                                        const edges = [
                                            piece.borda_frontal && { x1: px + inset, y1: py + t/2, x2: px + pw - inset, y2: py + t/2, c: edgeColorGlobal(piece.borda_frontal, piece.borda_cor_frontal) },
                                            piece.borda_traseira && { x1: px + inset, y1: py + ph - t/2, x2: px + pw - inset, y2: py + ph - t/2, c: edgeColorGlobal(piece.borda_traseira, piece.borda_cor_traseira) },
                                            piece.borda_esq && { x1: px + t/2, y1: py + inset, x2: px + t/2, y2: py + ph - inset, c: edgeColorGlobal(piece.borda_esq, piece.borda_cor_esq) },
                                            piece.borda_dir && { x1: px + pw - t/2, y1: py + inset, x2: px + pw - t/2, y2: py + ph - inset, c: edgeColorGlobal(piece.borda_dir, piece.borda_cor_dir) },
                                        ].filter(Boolean);
                                        return edges.length > 0 && (
                                            <g style={{ pointerEvents: 'none' }}>
                                                {edges.map((e, i) => (
                                                    <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                                                        stroke={e.c} strokeWidth={t} strokeLinecap="round" />
                                                ))}
                                            </g>
                                        );
                                    })()}

                                    {/* Machining operations (usinagens) */}
                                    {showMachining && piece && pw > 25 && ph > 25 &&
                                        renderMachining(piece, px, py, pw, ph, scale, p.rotated, p.w, p.h, p.lado_ativo)
                                    }

                                    {/* ══ Lock icon ══ */}
                                    {isLocked && pw > 18 && ph > 18 && (
                                        <g transform={`translate(${px + pw - 16}, ${py + 3})`} style={{ pointerEvents: 'none' }}>
                                            <rect width={13} height={12} rx={2} fill="rgba(0,0,0,0.5)" />
                                            <rect x={2} y={5} width={9} height={6} rx={1} fill="#fbbf24" />
                                            <path d="M4 5 V3.5 A2.5 2.5 0 0 1 9 3.5 V5" fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeLinecap="round" />
                                        </g>
                                    )}

                                    {/* Validation conflict warning */}
                                    {validationConflicts.some(c => c.chapaIdx === idx && c.pecaIdx === pi) && pw > 18 && ph > 18 && (
                                        <g style={{ pointerEvents: 'none' }}>
                                            <polygon
                                                points={`${px + pw / 2 - 7},${py + 2 + 12} ${px + pw / 2},${py + 2} ${px + pw / 2 + 7},${py + 2 + 12}`}
                                                fill="#ef4444" opacity={0.9} stroke="#fff" strokeWidth={0.5} />
                                            <text x={px + pw / 2} y={py + 2 + 10} textAnchor="middle" fontSize={8} fill="#fff" fontWeight={900}>!</text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {/* ══ Retalhos Mode Overlay ══ */}
                        {retMode && retDefs.map((rd, ri) => {
                            const rx = (rd.x + refiloVal) * scale;
                            const ry = (rd.y + refiloVal) * scale;
                            const rw = rd.w * scale;
                            const rh = rd.h * scale;
                            const isSelected = retSelected === ri;
                            const fillColor = rd.type === 'retalho' ? '#059669' : rd.type === 'refugo' ? '#dc2626' : '#3b82f6';
                            const fillOpacity = rd.type ? 0.25 : 0.1;
                            const strokeColor = isSelected ? '#fff' : fillColor;
                            return (
                                <g key={`rm${ri}`} style={{ cursor: 'pointer' }}
                                    onClick={(e) => { e.stopPropagation(); setRetSelected(isSelected ? null : ri); setRetSplitPreview(null); }}>
                                    <rect x={rx} y={ry} width={rw} height={rh}
                                        fill={fillColor} fillOpacity={fillOpacity}
                                        stroke={strokeColor} strokeWidth={isSelected ? 2 : 1}
                                        strokeDasharray={isSelected ? '6 3' : rd.type ? 'none' : '4 2'} />
                                    {/* Label */}
                                    <text x={rx + rw / 2} y={ry + rh / 2 - (rh > 30 ? 7 : 0)}
                                        textAnchor="middle" dominantBaseline="central"
                                        fontSize={Math.min(11, rw / 8)} fontWeight={700}
                                        fill={fillColor} stroke="#fff" strokeWidth={2.5} paintOrder="stroke"
                                        style={{ pointerEvents: 'none' }}>
                                        {Math.round(rd.w)}×{Math.round(rd.h)}
                                    </text>
                                    {rh > 30 && (
                                        <text x={rx + rw / 2} y={ry + rh / 2 + 8}
                                            textAnchor="middle" dominantBaseline="central"
                                            fontSize={Math.min(9, rw / 10)} fontWeight={600}
                                            fill={fillColor} stroke="#fff" strokeWidth={2} paintOrder="stroke"
                                            style={{ pointerEvents: 'none' }}>
                                            {rd.type === 'retalho' ? '✓ RETALHO' : rd.type === 'refugo' ? '✗ REFUGO' : 'Clique p/ definir'}
                                        </text>
                                    )}
                                    {/* Split preview line */}
                                    {retSplitPreview && retSplitPreview.retIdx === ri && (() => {
                                        const sp = retSplitPreview;
                                        if (sp.axis === 'h') {
                                            const ly = (sp.pos + refiloVal) * scale;
                                            return <line x1={rx} y1={ly} x2={rx + rw} y2={ly}
                                                stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" />;
                                        } else {
                                            const lx = (sp.pos + refiloVal) * scale;
                                            return <line x1={lx} y1={ry} x2={lx} y2={ry + rh}
                                                stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" />;
                                        }
                                    })()}
                                </g>
                            );
                        })}

                        {/* Barra clicável na divisa entre sobras — clique = cortar a linha (toggle) */}
                        {(chapa.retalhos?.length >= 2) && (() => {
                            const rets = chapa.retalhos;
                            const handles = [];
                            const tol = 5;
                            const pecas = chapa.pecas || [];
                            const ref = chapa.refilo || 0;
                            const uW = chapa.comprimento - 2 * ref;
                            const uH = chapa.largura - 2 * ref;
                            const noOverlap = (r) => !pecas.some(p => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);

                            // Função: cortar a linha — a menor sobra atravessa, a maior é cortada
                            const cutLine = (e, i, j, axis) => {
                                e.stopPropagation();
                                const a = rets[i], b = rets[j];
                                // Determinar qual é a menor (ela atravessa)
                                const aArea = a.w * a.h, bArea = b.w * b.h;
                                let extending, clipped;

                                if (axis === 'y') {
                                    // Divisa horizontal — sobras empilhadas
                                    // A menor atravessa verticalmente (ganha altura total)
                                    if (aArea <= bArea) {
                                        extending = { x: a.x, y: Math.min(a.y, b.y), w: a.w, h: a.h + b.h };
                                        // B perde a coluna de A
                                        if (a.x >= b.x) {
                                            clipped = { x: b.x, y: b.y, w: a.x - b.x, h: b.h };
                                        } else {
                                            clipped = { x: a.x + a.w, y: b.y, w: (b.x + b.w) - (a.x + a.w), h: b.h };
                                        }
                                    } else {
                                        extending = { x: b.x, y: Math.min(a.y, b.y), w: b.w, h: a.h + b.h };
                                        if (b.x >= a.x) {
                                            clipped = { x: a.x, y: a.y, w: b.x - a.x, h: a.h };
                                        } else {
                                            clipped = { x: b.x + b.w, y: a.y, w: (a.x + a.w) - (b.x + b.w), h: a.h };
                                        }
                                    }
                                } else {
                                    // Divisa vertical — sobras lado a lado
                                    if (aArea <= bArea) {
                                        extending = { x: Math.min(a.x, b.x), y: a.y, w: a.w + b.w, h: a.h };
                                        if (a.y >= b.y) {
                                            clipped = { x: b.x, y: b.y, w: b.w, h: a.y - b.y };
                                        } else {
                                            clipped = { x: b.x, y: a.y + a.h, w: b.w, h: (b.y + b.h) - (a.y + a.h) };
                                        }
                                    } else {
                                        extending = { x: Math.min(a.x, b.x), y: b.y, w: a.w + b.w, h: b.h };
                                        if (b.y >= a.y) {
                                            clipped = { x: a.x, y: a.y, w: a.w, h: b.y - a.y };
                                        } else {
                                            clipped = { x: a.x, y: b.y + b.h, w: a.w, h: (a.y + a.h) - (b.y + b.h) };
                                        }
                                    }
                                }

                                // Arredondar e validar
                                [extending, clipped].forEach(r => { r.x = Math.round(r.x); r.y = Math.round(r.y); r.w = Math.round(r.w); r.h = Math.round(r.h); });
                                // Preservar sobras não envolvidas no corte
                                const newRetalhos = rets.filter((_, idx2) => idx2 !== i && idx2 !== j);
                                if (extending.w > 50 && extending.h > 50 && noOverlap(extending)) newRetalhos.push(extending);
                                // Sobra cortada: só incluir se atende dimensões mínimas do config
                                const cShort = Math.min(clipped.w, clipped.h), cLong = Math.max(clipped.w, clipped.h);
                                if (cShort >= sobraMinW && cLong >= sobraMinH && noOverlap(clipped)) newRetalhos.push(clipped);

                                if (newRetalhos.length === 0) {
                                    // Ambas sobras falharam na validação — avisar usuário em vez de sumir silenciosamente
                                    if (typeof notify === 'function') notify('Não foi possível unir: as sobras resultantes são menores que o mínimo configurado.', 'warning');
                                    return;
                                }
                                if (onAdjust) {
                                    onAdjust({ action: 'recalc_sobras', chapaIdx: idx, retalhos: newRetalhos });
                                }
                            };

                            const seen = new Set();
                            for (let i = 0; i < rets.length; i++) {
                                for (let j = i + 1; j < rets.length; j++) {
                                    const a = rets[i], b = rets[j];
                                    // Verificar adjacência e renderizar barra clicável
                                    const checkAdj = (ax, ay, aw, ah, bx, by, bw, bh, axis, key) => {
                                        if (seen.has(key)) return;
                                        if (axis === 'y') {
                                            // a.bottom ≈ b.top — divisa horizontal
                                            if (Math.abs((ay + ah) - by) < tol) {
                                                const ox1 = Math.max(ax, bx), ox2 = Math.min(ax + aw, bx + bw);
                                                if (ox2 - ox1 > 10) {
                                                    seen.add(key);
                                                    const hx = (ox1 + refiloVal) * scale;
                                                    const hy = (ay + ah + refiloVal) * scale - 4;
                                                    const hw = (ox2 - ox1) * scale;
                                                    handles.push(
                                                        <g key={key} style={{ cursor: 'pointer' }} onClick={(e) => cutLine(e, i, j, 'y')}>
                                                            <rect x={hx} y={hy + 1} width={hw} height={12}
                                                                fill="transparent" style={{ pointerEvents: 'all' }} />
                                                            <line x1={hx} y1={hy + 1.5} x2={hx + hw} y2={hy + 1.5}
                                                                stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7} style={{ pointerEvents: 'none' }} />
                                                        </g>
                                                    );
                                                }
                                            }
                                        } else {
                                            // a.right ≈ b.left — divisa vertical
                                            if (Math.abs((ax + aw) - bx) < tol) {
                                                const oy1 = Math.max(ay, by), oy2 = Math.min(ay + ah, by + bh);
                                                if (oy2 - oy1 > 10) {
                                                    seen.add(key);
                                                    const hx2 = (ax + aw + refiloVal) * scale - 4;
                                                    const hy2 = (oy1 + refiloVal) * scale;
                                                    const hh2 = (oy2 - oy1) * scale;
                                                    handles.push(
                                                        <g key={key} style={{ cursor: 'pointer' }} onClick={(e) => cutLine(e, i, j, 'x')}>
                                                            <rect x={hx2} y={hy2} width={12} height={hh2}
                                                                fill="transparent" style={{ pointerEvents: 'all' }} />
                                                            <line x1={hx2 + 1.5} y1={hy2} x2={hx2 + 1.5} y2={hy2 + hh2}
                                                                stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7} style={{ pointerEvents: 'none' }} />
                                                        </g>
                                                    );
                                                }
                                            }
                                        }
                                    };
                                    // Testar ambas as direções
                                    checkAdj(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h, 'y', `cv${i}-${j}`);
                                    checkAdj(b.x, b.y, b.w, b.h, a.x, a.y, a.w, a.h, 'y', `cv${j}-${i}`);
                                    checkAdj(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h, 'x', `ch${i}-${j}`);
                                    checkAdj(b.x, b.y, b.w, b.h, a.x, a.y, a.w, a.h, 'x', `ch${j}-${i}`);
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
                                {piece && (piece.borda_dir || piece.borda_esq || piece.borda_frontal || piece.borda_traseira) && (() => {
                                    const sides = [
                                        piece.borda_frontal && { l: 'Frontal', v: piece.borda_frontal, cor: piece.borda_cor_frontal, c: edgeColorGlobal(piece.borda_frontal, piece.borda_cor_frontal) },
                                        piece.borda_traseira && { l: 'Traseira', v: piece.borda_traseira, cor: piece.borda_cor_traseira, c: edgeColorGlobal(piece.borda_traseira, piece.borda_cor_traseira) },
                                        piece.borda_esq && { l: 'Esquerda', v: piece.borda_esq, cor: piece.borda_cor_esq, c: edgeColorGlobal(piece.borda_esq, piece.borda_cor_esq) },
                                        piece.borda_dir && { l: 'Direita', v: piece.borda_dir, cor: piece.borda_cor_dir, c: edgeColorGlobal(piece.borda_dir, piece.borda_cor_dir) },
                                    ].filter(Boolean);
                                    return <><b>Fita borda:</b><br />{sides.map((s, i) => (
                                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8 }}>
                                            <span style={{ width: 8, height: 3, borderRadius: 1, background: s.c, display: 'inline-block' }} />
                                            {s.l}: {s.cor ? `${s.cor.replace(/_/g, ' ')} (${s.v.replace(/_/g, ' ')})` : s.v.replace(/_/g, ' ')}
                                        </span>
                                    ))}</>;
                                })()}
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

                {/* ══ Context Menu — Rich actions ══ */}
                {ctxMenu && (() => {
                    const p = chapa.pecas[ctxMenu.pecaIdx];
                    if (!p) return null;
                    const piece = pecasMap[p.pecaId];
                    const isLocked = p.locked;
                    const compatibleSheets = allChapas.map((ch, ci) => ({ ch, ci })).filter(({ ch, ci }) => ci !== idx && ch.material === chapa.material);
                    const MI = ({ icon: Icon, label, color, onClick, disabled }) => (
                        <div style={{
                            padding: '7px 14px', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                            fontSize: 12, color: disabled ? 'var(--text-muted)' : 'var(--text-primary)', transition: 'background .1s',
                            opacity: disabled ? 0.5 : 1,
                        }}
                            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--bg-muted)'; }}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            onClick={() => { if (!disabled) { onClick(); setCtxMenu(null); } }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 5, background: color ? `${color}18` : 'var(--bg-muted)' }}>
                                <Icon size={13} style={{ color: color || 'var(--text-secondary)' }} />
                            </span>
                            {label}
                        </div>
                    );
                    const Sep = ({ label }) => (
                        <>
                            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                            {label && <div style={{ padding: '3px 14px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>}
                        </>
                    );
                    return (
                        <div ref={el => {
                            // Viewport-aware positioning after render
                            if (el) {
                                const rect = el.getBoundingClientRect();
                                const parent = el.parentElement?.getBoundingClientRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
                                const maxX = parent.width - rect.width - 8;
                                const maxY = parent.height - rect.height - 8;
                                const newLeft = Math.max(0, Math.min(ctxMenu.x, maxX));
                                const newTop = Math.max(0, Math.min(ctxMenu.y, maxY));
                                if (parseInt(el.style.left) !== Math.round(newLeft) || parseInt(el.style.top) !== Math.round(newTop)) {
                                    el.style.left = newLeft + 'px';
                                    el.style.top = newTop + 'px';
                                }
                            }
                        }} data-ctx-menu="piece" style={{
                            position: 'absolute', left: ctxMenu.x, top: ctxMenu.y,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 10, boxShadow: 'var(--shadow-lg)', zIndex: 100,
                            minWidth: 230, padding: '6px 0', overflow: 'hidden',
                        }} onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div style={{ padding: '6px 14px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: getModColor(p.pecaId, p) }} />
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{piece?.descricao || `Peça #${p.pecaId}`}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                        {Math.round(p.w)} × {Math.round(p.h)} mm{p.rotated ? ' (R)' : ''}
                                        {p.lado_ativo === 'B' ? <span style={{ color: '#0ea5e9', fontWeight: 700, marginLeft: 4 }}>Lado B</span> : ' Lado A'}
                                    </div>
                                </div>
                            </div>

                            {/* Ações rápidas */}
                            {!hasVeio && !isLocked && (
                                <MI icon={RotateCw} label="Rotacionar 90°" color="#8b5cf6" onClick={() => handleRotate(ctxMenu.pecaIdx)} />
                            )}
                            {!isLocked && (
                                <MI icon={FlipVertical2} label={`Inverter → Lado ${(p.lado_ativo === 'B') ? 'A' : 'B'}`} color="#0ea5e9"
                                    onClick={() => onAdjust({ action: 'flip', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx })} />
                            )}
                            <MI icon={Eye} label="Ver Peça 3D" color="#3b82f6" onClick={() => onView3D && onView3D(piece)} />
                            <MI icon={Printer} label="Imprimir Etiqueta" color="#d97706" onClick={() => onPrintSingleLabel && onPrintSingleLabel(piece)} />
                            <MI icon={Cpu} label="G-Code desta Peça" color="#1e40af" onClick={() => onGerarGcodePeca && onGerarGcodePeca(idx, ctxMenu.pecaIdx)} />

                            <Sep label="Organização" />
                            <MI icon={isLocked ? Unlock : Lock} label={isLocked ? 'Desbloquear posição' : 'Bloquear posição'} color="#fbbf24"
                                onClick={() => onAdjust({ action: isLocked ? 'unlock' : 'lock', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx })} />
                            <MI icon={ArrowLeftRight} label="Enviar p/ Transferência" color="#06b6d4"
                                onClick={() => onAdjust({ action: 'to_transfer', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx })} />

                            {/* Navegação */}
                            <Sep label="Navegação" />
                            <MI icon={Layers} label="Ver no Lote (Peças)" color="#22c55e"
                                onClick={() => setTab && setTab('pecas')} />

                            {/* Mover para outra chapa */}
                            {compatibleSheets.length > 0 && (
                                <>
                                    <Sep label="Mover para chapa" />
                                    {compatibleSheets.map(({ ci }) => (
                                        <MI key={ci} icon={Box} label={`Chapa ${ci + 1}`} color="#64748b"
                                            onClick={() => onAdjust({ action: 'move_to_sheet', chapaIdx: idx, pecaIdx: ctxMenu.pecaIdx, targetChapaIdx: ci })} />
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
                    const rets = chapa.retalhos || [];
                    const tol = 5;
                    const hasAdj = rets.length >= 2;
                    const ctxSt2 = (extra) => ({
                        padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12, color: 'var(--text-primary)', transition: 'background .1s', ...extra
                    });

                    // Função para alternar orientação do corte do L
                    const toggleCutOrientation = () => {
                        const ref = chapa.refilo || 0;
                        const uW = chapa.comprimento - 2 * ref;
                        const uH = chapa.largura - 2 * ref;
                        const pecas = chapa.pecas || [];
                        let maxPecaX = 0, maxPecaY = 0;
                        for (const p of pecas) {
                            if (p.x + p.w > maxPecaX) maxPecaX = p.x + p.w;
                            if (p.y + p.h > maxPecaY) maxPecaY = p.y + p.h;
                        }
                        const noOverlap = (rr) => !pecas.some(p => rr.x < p.x + p.w && rr.x + rr.w > p.x && rr.y < p.y + p.h && rr.y + rr.h > p.y);
                        const isOk = (rr) => { const s = Math.min(rr.w, rr.h), l = Math.max(rr.w, rr.h); return s >= sobraMinW && l >= sobraMinH && noOverlap(rr); };

                        // Detectar orientação atual: se a sobra clicada tem altura total = vertical, senão = horizontal
                        const isCurrentlyVertical = Math.abs(r.h - uH) < 5 || Math.abs(r.w - uW) < 5;

                        let newRetalhos;
                        if (isCurrentlyVertical || r.h > r.w) {
                            // Mudar para horizontal: faixa inferior larga + faixa direita curta
                            const bottom = { x: 0, y: Math.round(maxPecaY), w: Math.round(uW), h: Math.round(uH - maxPecaY) };
                            const right = { x: Math.round(maxPecaX), y: 0, w: Math.round(uW - maxPecaX), h: Math.round(maxPecaY) };
                            newRetalhos = [bottom, right].filter(isOk);
                        } else {
                            // Mudar para vertical: faixa direita alta + faixa inferior curta
                            const right = { x: Math.round(maxPecaX), y: 0, w: Math.round(uW - maxPecaX), h: Math.round(uH) };
                            const bottom = { x: 0, y: Math.round(maxPecaY), w: Math.round(maxPecaX), h: Math.round(uH - maxPecaY) };
                            newRetalhos = [right, bottom].filter(isOk);
                        }

                        if (onAdjust) onAdjust({ action: 'recalc_sobras', chapaIdx: idx, retalhos: newRetalhos });
                        setSobraCtxMenu(null);
                    };

                    return (
                        <div data-ctx-menu="sobra" style={{
                            position: 'absolute', left: Math.min(sobraCtxMenu.x, 300), top: sobraCtxMenu.y,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.25)', zIndex: 100,
                            minWidth: 220, padding: '4px 0', overflow: 'hidden',
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '4px 14px 6px', fontSize: 10, fontWeight: 700, color: '#22c55e' }}>
                                Sobra {Math.round(r.w)}×{Math.round(r.h)}mm ({(r.w * r.h / 1e6).toFixed(3)} m²)
                            </div>
                            <div style={ctxSt2()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                onClick={() => { onAdjust({ action: 'marcar_refugo', chapaIdx: idx, retalhoIdx: sobraCtxMenu.retalhoIdx }); setSobraCtxMenu(null); }}>
                                <Trash2 size={13} color="#ef4444" /> Marcar como Refugo
                            </div>
                            {hasAdj && (
                                <>
                                    <div style={{ height: 1, background: 'var(--border)', margin: '2px 10px' }} />
                                    <div style={ctxSt2()} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={toggleCutOrientation}>
                                        <ArrowLeftRight size={13} color="#f59e0b" /> Alternar Corte (trocar orientação)
                                    </div>
                                    <div style={{ padding: '2px 14px', fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        Arraste a barra ⇔ para cortar a linha e redistribuir
                                    </div>
                                </>
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
                        color: dragCollision ? '#ef4444' : '#2563eb',
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

            {/* ══ Retalhos Mode Toolbar ══ */}
            {retMode && (
                <div style={{
                    marginTop: 10, padding: 12, background: 'var(--bg-muted)',
                    border: '1px solid var(--border)', borderRadius: 8,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Scissors size={14} /> Definir Sobras — Chapa {idx + 1}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setRetDefs((chapa.retalhos || []).map(r => ({ ...r, type: null }))); setRetSelected(null); setRetSplitPreview(null); }}
                                style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                                <Undo2 size={10} /> Reset
                            </button>
                            {onSaveRetalhos && (
                                <button onClick={() => {
                                    const retalhos = retDefs.filter(r => r.type === 'retalho');
                                    const refugos = retDefs.filter(r => r.type === 'refugo');
                                    onSaveRetalhos(idx, retalhos, refugos);
                                    setRetMode(false);
                                }}
                                    style={{ padding: '4px 14px', fontSize: 10, fontWeight: 700, background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                                    Salvar ({retDefs.filter(r => r.type === 'retalho').length} retalhos)
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Summary row */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 10, flexWrap: 'wrap' }}>
                        <span style={{ color: '#059669', fontWeight: 600 }}>
                            ✓ Retalhos: {retDefs.filter(r => r.type === 'retalho').length}
                            {retDefs.filter(r => r.type === 'retalho').length > 0 && ` (${(retDefs.filter(r => r.type === 'retalho').reduce((s, r) => s + r.w * r.h, 0) / 1000000).toFixed(3)} m²)`}
                        </span>
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                            ✗ Refugos: {retDefs.filter(r => r.type === 'refugo').length}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                            Sem definição: {retDefs.filter(r => !r.type).length}
                        </span>
                    </div>

                    {/* Selected retalho actions */}
                    {retSelected != null && retDefs[retSelected] && (() => {
                        const rd = retDefs[retSelected];
                        const canSplitH = rd.h > 100; // min 100mm para dividir H
                        const canSplitV = rd.w > 100; // min 100mm para dividir V
                        return (
                            <div style={{
                                padding: 10, background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginRight: 4 }}>
                                    Sobra #{retSelected + 1}: {Math.round(rd.w)}×{Math.round(rd.h)}mm
                                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                                        ({(rd.w * rd.h / 1000000).toFixed(3)} m²)
                                    </span>
                                </span>
                                <button onClick={() => { const n = [...retDefs]; n[retSelected] = { ...rd, type: 'retalho' }; setRetDefs(n); }}
                                    style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                                        background: rd.type === 'retalho' ? '#059669' : 'transparent',
                                        color: rd.type === 'retalho' ? '#fff' : '#059669',
                                        border: '1px solid #059669' }}>
                                    ✓ Retalho
                                </button>
                                <button onClick={() => { const n = [...retDefs]; n[retSelected] = { ...rd, type: 'refugo' }; setRetDefs(n); }}
                                    style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                                        background: rd.type === 'refugo' ? '#dc2626' : 'transparent',
                                        color: rd.type === 'refugo' ? '#fff' : '#dc2626',
                                        border: '1px solid #dc2626' }}>
                                    ✗ Refugo
                                </button>
                                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>│</span>
                                {canSplitH && (
                                    <button onClick={() => {
                                        const midY = rd.y + rd.h / 2;
                                        setRetSplitPreview({ retIdx: retSelected, axis: 'h', pos: midY });
                                    }}
                                        style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
                                            background: retSplitPreview?.axis === 'h' ? '#f59e0b' : 'transparent',
                                            color: retSplitPreview?.axis === 'h' ? '#fff' : '#f59e0b',
                                            border: '1px solid #f59e0b' }}>
                                        ━ Dividir H
                                    </button>
                                )}
                                {canSplitV && (
                                    <button onClick={() => {
                                        const midX = rd.x + rd.w / 2;
                                        setRetSplitPreview({ retIdx: retSelected, axis: 'v', pos: midX });
                                    }}
                                        style={{ padding: '4px 10px', fontSize: 10, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
                                            background: retSplitPreview?.axis === 'v' ? '#f59e0b' : 'transparent',
                                            color: retSplitPreview?.axis === 'v' ? '#fff' : '#f59e0b',
                                            border: '1px solid #f59e0b' }}>
                                        ┃ Dividir V
                                    </button>
                                )}
                                {retSplitPreview && retSplitPreview.retIdx === retSelected && (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <input type="range"
                                                min={retSplitPreview.axis === 'h' ? Math.round(rd.y + 50) : Math.round(rd.x + 50)}
                                                max={retSplitPreview.axis === 'h' ? Math.round(rd.y + rd.h - 50) : Math.round(rd.x + rd.w - 50)}
                                                value={Math.round(retSplitPreview.pos)}
                                                onChange={(e) => setRetSplitPreview({ ...retSplitPreview, pos: Number(e.target.value) })}
                                                style={{ width: 120 }}
                                            />
                                            <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace', minWidth: 45 }}>
                                                {retSplitPreview.axis === 'h'
                                                    ? `${Math.round(retSplitPreview.pos - rd.y)} / ${Math.round(rd.y + rd.h - retSplitPreview.pos)}`
                                                    : `${Math.round(retSplitPreview.pos - rd.x)} / ${Math.round(rd.x + rd.w - retSplitPreview.pos)}`
                                                }
                                            </span>
                                        </div>
                                        <button onClick={() => {
                                            const sp = retSplitPreview;
                                            const r = retDefs[sp.retIdx];
                                            const newDefs = [...retDefs];
                                            newDefs.splice(sp.retIdx, 1);
                                            if (sp.axis === 'h') {
                                                newDefs.push({ x: r.x, y: r.y, w: r.w, h: sp.pos - r.y, type: null });
                                                newDefs.push({ x: r.x, y: sp.pos, w: r.w, h: r.y + r.h - sp.pos, type: null });
                                            } else {
                                                newDefs.push({ x: r.x, y: r.y, w: sp.pos - r.x, h: r.h, type: null });
                                                newDefs.push({ x: sp.pos, y: r.y, w: r.w - (sp.pos - r.x), h: r.h, type: null });
                                            }
                                            setRetDefs(newDefs);
                                            setRetSplitPreview(null);
                                            setRetSelected(null);
                                        }}
                                            style={{ padding: '4px 12px', fontSize: 10, fontWeight: 700, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                                            Cortar
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    })()}

                    {/* List of all retalho defs */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {retDefs.map((rd, ri) => (
                            <div key={ri} onClick={() => { setRetSelected(ri); setRetSplitPreview(null); }}
                                style={{
                                    padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                                    background: retSelected === ri ? 'var(--bg-card)' : 'transparent',
                                    border: `1px solid ${rd.type === 'retalho' ? '#059669' : rd.type === 'refugo' ? '#dc2626' : 'var(--border)'}`,
                                    color: rd.type === 'retalho' ? '#059669' : rd.type === 'refugo' ? '#dc2626' : 'var(--text-muted)',
                                }}>
                                {rd.type === 'retalho' ? '✓' : rd.type === 'refugo' ? '✗' : '○'} {Math.round(rd.w)}×{Math.round(rd.h)}
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                                <th style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 600 }}>Lado</th>
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
                                            {p.lado_ativo === 'B'
                                                ? <span style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 9 }}>B</span>
                                                : <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>A</span>}
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
                        {chapa.cortes.map((c, ci) => {
                            const isRet = c.tipo === 'separacao_retalho';
                            const clr = isRet ? '#059669' : (c.dir === 'Horizontal' ? '#3b82f6' : '#f59e0b');
                            return (
                                <span key={ci} style={{
                                    fontSize: 10, padding: '3px 8px', borderRadius: 4,
                                    background: colorBg(clr), border: `1px solid ${colorBorder(clr)}`,
                                    color: clr, fontWeight: 600,
                                }}>
                                    {c.seq || ci + 1}. {c.dir === 'Horizontal' ? '━' : '┃'} {c.pos}mm
                                    {c.len ? ` (${c.len}mm)` : ''}
                                    {isRet ? ' ✂ RET' : ''}
                                </span>
                            );
                        })}
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

// ═══════════════════════════════════════════════════════
// ABA: MATERIAIS — Cadastro completo
// ═══════════════════════════════════════════════════════
function TabMateriais({ notify }) {
    const [materiais, setMateriais] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [editando, setEditando] = useState(null); // null=fechado, {}=novo, {...}=editar
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { setMateriais(await api.get('/cnc/materiais')); }
        catch { notify?.('Erro ao carregar materiais', 'error'); }
        setLoading(false);
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const filtered = materiais.filter(m => {
        if (!busca) return true;
        const q = busca.toLowerCase();
        return (m.nome || '').toLowerCase().includes(q) ||
            (m.codigo || '').toLowerCase().includes(q) ||
            (m.cor || '').toLowerCase().includes(q) ||
            (m.fornecedor || '').toLowerCase().includes(q);
    });

    const handleSave = async () => {
        if (!editando?.nome) return;
        setSaving(true);
        try {
            if (editando.id) {
                await api.put(`/cnc/materiais/${editando.id}`, editando);
                notify?.('Material atualizado');
            } else {
                await api.post('/cnc/materiais', editando);
                notify?.('Material criado');
            }
            setEditando(null);
            load();
        } catch (err) {
            notify?.('Erro ao salvar: ' + (err.message || ''), 'error');
        }
        setSaving(false);
    };

    const handleDelete = async (id) => {
        if (!confirm('Desativar este material?')) return;
        await api.del(`/cnc/materiais/${id}`);
        notify?.('Material desativado');
        load();
    };

    const handleDuplicar = async (id) => {
        await api.post(`/cnc/materiais/${id}/duplicar`);
        notify?.('Material duplicado');
        load();
    };

    const novoMaterial = () => setEditando({
        nome: '', codigo: '', espessura: 18, comprimento_chapa: 2750, largura_chapa: 1830,
        veio: 'sem_veio', melamina: 'ambos', cor: '', acabamento: '', fornecedor: '',
        custo_m2: 0, refilo: 10, kerf: 4, ativo: 1, permitir_rotacao: -1,
    });

    const EF = ({ label, field, type = 'text', opts, w }) => (
        <div style={{ flex: w || 1 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</label>
            {opts ? (
                <select value={editando[field] ?? ''} onChange={e => {
                    const v = e.target.value;
                    // Converter para número se o valor original das options é numérico
                    const isNum = opts.some(o => typeof o.v === 'number');
                    setEditando(f => ({ ...f, [field]: isNum ? Number(v) : v }));
                }} className={Z.inp} style={{ fontSize: 12, padding: '6px 8px' }}>
                    {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
            ) : (
                <input type={type} value={editando[field] ?? ''} onChange={e => setEditando(f => ({ ...f, [field]: type === 'number' ? +e.target.value : e.target.value }))}
                    className={Z.inp} style={{ fontSize: 12, padding: '6px 8px', fontFamily: type === 'number' ? 'monospace' : 'inherit' }} />
            )}
        </div>
    );

    const MELAMINA_LABELS = { ambos: '● Ambos os lados', face_a: '▲ Só Face A', face_b: '▼ Só Face B', cru: '□ Cru (sem melamina)' };
    const VEIO_LABELS = { sem_veio: 'Sem veio', horizontal: 'Horizontal →', vertical: 'Vertical ↓' };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>
                    Cadastro de Materiais <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>({materiais.length})</span>
                </h3>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar material..."
                    className={Z.inp} style={{ width: 220, fontSize: 12 }} />
                <button onClick={novoMaterial} className={Z.btn}
                    style={{ background: 'var(--primary)', color: '#fff', fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={14} /> Novo Material
                </button>
            </div>

            {/* Tabela */}
            {loading ? <Spinner /> : (
                <div className="glass-card" style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                                {['Código', 'Nome', 'Esp.', 'Chapa', 'Veio', 'Melamina', 'Cor', 'Fornecedor', 'R$/m²', 'Ações'].map(h => (
                                    <th key={h} style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(m => (
                                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)', opacity: m.ativo ? 1 : 0.5 }}>
                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{m.codigo || '—'}</td>
                                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{m.nome}</td>
                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{m.espessura}mm</td>
                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11 }}>{m.comprimento_chapa}×{m.largura_chapa}</td>
                                    <td style={{ padding: '6px 10px' }}>{VEIO_LABELS[m.veio] || m.veio}</td>
                                    <td style={{ padding: '6px 10px' }}>
                                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                            background: m.melamina === 'ambos' ? '#dcfce7' : m.melamina === 'cru' ? '#f3f4f6' : '#fef3c7',
                                            color: m.melamina === 'ambos' ? '#166534' : m.melamina === 'cru' ? '#666' : '#92400e',
                                        }}>{MELAMINA_LABELS[m.melamina] || m.melamina}</span>
                                    </td>
                                    <td style={{ padding: '6px 10px' }}>{m.cor || '—'}</td>
                                    <td style={{ padding: '6px 10px' }}>{m.fornecedor || '—'}</td>
                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{m.custo_m2 > 0 ? `R$ ${m.custo_m2.toFixed(2)}` : '—'}</td>
                                    <td style={{ padding: '6px 10px' }}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button onClick={() => setEditando({ ...m })} title="Editar"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 2 }}>
                                                <Edit size={13} />
                                            </button>
                                            <button onClick={() => handleDuplicar(m.id)} title="Duplicar"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                                                <Copy size={13} />
                                            </button>
                                            <button onClick={() => handleDelete(m.id)} title="Desativar"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {busca ? 'Nenhum material encontrado' : 'Nenhum material cadastrado. Clique em "+ Novo Material" para começar.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal de edição */}
            {editando && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', background: 'rgba(0,0,0,0.5)' }}
                    onClick={e => { if (e.target === e.currentTarget) setEditando(null); }}>
                    <div style={{ margin: 'auto', width: '95vw', maxWidth: 700, background: 'var(--bg-card)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.25)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                                {editando.id ? 'Editar Material' : '+ Novo Material'}
                            </h3>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={handleSave} disabled={saving || !editando.nome}
                                    className={Z.btn} style={{ background: 'var(--primary)', color: '#fff', fontSize: 12, padding: '6px 14px' }}>
                                    <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
                                </button>
                                <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div style={{ padding: 16 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <EF label="Código" field="codigo" />
                                <EF label="Nome *" field="nome" w={2} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <EF label="Espessura (mm)" field="espessura" type="number" />
                                <EF label="Comp. Chapa (mm)" field="comprimento_chapa" type="number" />
                                <EF label="Larg. Chapa (mm)" field="largura_chapa" type="number" />
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <EF label="Veio" field="veio" opts={[
                                    { v: 'sem_veio', l: 'Sem veio' },
                                    { v: 'horizontal', l: 'Horizontal →' },
                                    { v: 'vertical', l: 'Vertical ↓' },
                                ]} />
                                <EF label="Melamina" field="melamina" opts={[
                                    { v: 'ambos', l: '● Ambos os lados' },
                                    { v: 'face_a', l: '▲ Apenas Face A (topo)' },
                                    { v: 'face_b', l: '▼ Apenas Face B (fundo)' },
                                    { v: 'cru', l: '□ Cru (sem melamina)' },
                                ]} />
                                <EF label="Cor / Acabamento" field="cor" />
                                <EF label="Rotação" field="permitir_rotacao" opts={[
                                    { v: -1, l: '↺ Automático (segue veio)' },
                                    { v: 1, l: '✓ Sempre permitir' },
                                    { v: 0, l: '✗ Nunca permitir' },
                                ]} />
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <EF label="Fornecedor" field="fornecedor" />
                                <EF label="Custo R$/m²" field="custo_m2" type="number" />
                                <EF label="Refilo (mm)" field="refilo" type="number" />
                                <EF label="Kerf (mm)" field="kerf" type="number" />
                            </div>
                            {editando.melamina && editando.melamina !== 'ambos' && (
                                <div style={{ padding: '8px 12px', borderRadius: 6, background: '#fef3c7', border: '1px solid #fcd34d', fontSize: 11, color: '#92400e', marginTop: 8 }}>
                                    ⚠️ <strong>Melamina em {editando.melamina === 'face_a' ? 'apenas Face A' : editando.melamina === 'face_b' ? 'apenas Face B' : 'nenhum lado'}:</strong> O algoritmo de face CNC levará isso em conta automaticamente para orientar a peça na máquina.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA: USINAGENS — Gestão por lote + Face CNC
// ═══════════════════════════════════════════════════════

const USIN_LABELS = {
    'Transfer_vertical_saw_cut': { label: 'Rasgo/Canal', icon: '━', color: '#eab308' },
    'transfer_pocket': { label: 'Rebaixo', icon: '▬', color: '#a855f7' },
    'transfer_slot': { label: 'Fresa/Slot', icon: '◆', color: '#06b6d4' },
    'transfer_hole_blind': { label: 'Furo cego', icon: '◐', color: '#f97316' },
    'transfer_hole': { label: 'Furo passante', icon: '●', color: '#dc2626' },
};

function usinInfo(cat) {
    return USIN_LABELS[cat] || { label: cat || '?', icon: '?', color: '#888' };
}

function TabUsinagens({ lotes, loteAtual, setLoteAtual, notify }) {
    const [pecas, setPecas] = useState([]);
    const [overrides, setOverrides] = useState([]);
    const [faceCNC, setFaceCNC] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!loteAtual?.id) return;
        setLoading(true);
        try {
            const [p, o, f] = await Promise.all([
                api.get(`/cnc/pecas/${loteAtual.id}`),
                api.get(`/cnc/lotes/${loteAtual.id}/overrides`),
                api.get(`/cnc/lotes/${loteAtual.id}/face-cnc`),
            ]);
            setPecas(p);
            setOverrides(o);
            setFaceCNC(f);
        } catch { notify?.('Erro ao carregar usinagens', 'error'); }
        setLoading(false);
    }, [loteAtual?.id, notify]);

    useEffect(() => { load(); }, [load]);

    const parseMach = (mj) => {
        if (!mj) return [];
        try { const d = typeof mj === 'string' ? JSON.parse(mj) : mj; return Array.isArray(d) ? d : d.workers || []; } catch { return []; }
    };

    const isDisabled = (pid, idx) => {
        return overrides.some(o => o.peca_persistent_id === pid && o.worker_index === idx && !o.ativo);
    };

    const toggleWorker = async (pid, idx, currentlyActive) => {
        setSaving(true);
        try {
            await api.post(`/cnc/lotes/${loteAtual.id}/overrides`, {
                peca_persistent_id: pid,
                worker_index: idx,
                ativo: currentlyActive ? 0 : 1,
                motivo: currentlyActive ? 'Desativado manualmente' : '',
            });
            await load();
        } catch { notify?.('Erro', 'error'); }
        setSaving(false);
    };

    const disableAll = async (pid) => {
        const workers = parseMach(pecas.find(p => p.persistent_id === pid)?.machining_json);
        const bulk = workers.map((_, i) => ({ peca_persistent_id: pid, worker_index: i, ativo: 0, motivo: 'Desativado em lote' }));
        await api.post(`/cnc/lotes/${loteAtual.id}/overrides/bulk`, { overrides: bulk });
        load();
        notify?.('Todas usinagens desativadas');
    };

    const enableAll = async (pid) => {
        const workers = parseMach(pecas.find(p => p.persistent_id === pid)?.machining_json);
        const bulk = workers.map((_, i) => ({ peca_persistent_id: pid, worker_index: i, ativo: 1 }));
        await api.post(`/cnc/lotes/${loteAtual.id}/overrides/bulk`, { overrides: bulk });
        load();
        notify?.('Todas usinagens ativadas');
    };

    // Contar totais
    let totalOps = 0, totalAtivas = 0;
    pecas.forEach(p => {
        const ws = parseMach(p.machining_json);
        totalOps += ws.length;
        ws.forEach((_, i) => { if (!isDisabled(p.persistent_id, i)) totalAtivas++; });
    });

    return (
        <div>
            <LoteSelector lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} />

            {!loteAtual ? (
                <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Selecione um lote para gerenciar usinagens
                </div>
            ) : loading ? <Spinner /> : (
                <div>
                    {/* Resumo Face CNC */}
                    {faceCNC && (
                        <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>◈ Algoritmo de Face CNC</h4>
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4,
                                    background: faceCNC.melamina === 'ambos' ? '#dcfce7' : '#fef3c7',
                                    color: faceCNC.melamina === 'ambos' ? '#166534' : '#92400e',
                                }}>Melamina: {faceCNC.melamina}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {(faceCNC.faces || []).map(f => (
                                    <div key={f.peca_id} style={{
                                        padding: '6px 10px', borderRadius: 6, fontSize: 11,
                                        border: '1px solid var(--border)', background: 'var(--bg-muted)',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                        <span style={{
                                            padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: 10,
                                            background: f.face_cnc === 'A' ? '#dbeafe' : '#fce7f3',
                                            color: f.face_cnc === 'A' ? '#1e40af' : '#9d174d',
                                        }}>Face {f.face_cnc}</span>
                                        <span style={{ fontWeight: 600 }}>{f.descricao || `Peça ${f.peca_id}`}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                                            A:{f.score_a.toFixed(0)} vs B:{f.score_b.toFixed(0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Resumo */}
                    <div className="glass-card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div>
                            <span style={{ fontSize: 24, fontWeight: 700 }}>{totalAtivas}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> / {totalOps} usinagens ativas</span>
                        </div>
                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--border)' }}>
                            <div style={{ width: totalOps > 0 ? `${(totalAtivas / totalOps * 100)}%` : '0%', height: '100%', borderRadius: 4, background: 'var(--primary)', transition: 'width .3s' }} />
                        </div>
                        <span style={{ fontSize: 11, color: totalAtivas < totalOps ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                            {totalAtivas < totalOps ? `${totalOps - totalAtivas} desativada(s)` : 'Todas ativas'}
                        </span>
                    </div>

                    {/* Lista por peça */}
                    {pecas.map(p => {
                        const workers = parseMach(p.machining_json);
                        if (!workers.length) return null;
                        const pid = p.persistent_id || `peca_${p.id}`;
                        const fInfo = faceCNC?.faces?.find(f => f.peca_id === p.id);

                        return (
                            <div key={p.id} className="glass-card" style={{ padding: 12, marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span style={{ fontWeight: 700, fontSize: 13 }}>{p.descricao || p.upmcode || `Peça #${p.id}`}</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                        {p.comprimento}×{p.largura}×{p.espessura}mm · {p.modulo_desc || ''}
                                    </span>
                                    {fInfo && (
                                        <span style={{
                                            padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                                            background: fInfo.face_cnc === 'A' ? '#dbeafe' : '#fce7f3',
                                            color: fInfo.face_cnc === 'A' ? '#1e40af' : '#9d174d',
                                        }}>CNC: Face {fInfo.face_cnc}</span>
                                    )}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                        <button onClick={() => enableAll(pid)}
                                            style={{ fontSize: 9, padding: '2px 6px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 4, cursor: 'pointer', color: '#166534' }}>
                                            ✓ Ativar tudo
                                        </button>
                                        <button onClick={() => disableAll(pid)}
                                            style={{ fontSize: 9, padding: '2px 6px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', color: '#991b1b' }}>
                                            ✕ Desativar tudo
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {workers.map((w, i) => {
                                        const info = usinInfo(w.category);
                                        const disabled = isDisabled(pid, i);
                                        const isHole = /hole|furo/i.test(w.category || '');
                                        const faceLabel = { top: 'Face A', bottom: 'Face B', front: 'Frontal', back: 'Traseira', left: 'Esquerda', right: 'Direita' }[w.face] || w.face;

                                        return (
                                            <div key={i} style={{
                                                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                                                borderRadius: 5, background: disabled ? 'var(--bg-muted)' : 'transparent',
                                                opacity: disabled ? 0.5 : 1, transition: 'all .2s',
                                            }}>
                                                <input type="checkbox" checked={!disabled} onChange={() => toggleWorker(pid, i, !disabled)}
                                                    style={{ cursor: 'pointer', accentColor: info.color }} disabled={saving} />
                                                <span style={{ width: 20, height: 20, borderRadius: 5, background: `${info.color}18`, color: info.color,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                                                    {info.icon}
                                                </span>
                                                <span style={{ fontSize: 11, fontWeight: 600, minWidth: 100 }}>{info.label}</span>
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{faceLabel}</span>
                                                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                    {isHole ? `⌀${w.diameter || 8}mm` : `${w.length || 0}×${w.width || 0}mm`}
                                                    {' · prof. '}
                                                    {w.depth || 0}mm
                                                </span>
                                                <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                                    x:{w.x} y:{w.y}
                                                </span>
                                                {disabled && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 600 }}>MANUAL</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {pecas.every(p => !parseMach(p.machining_json).length) && (
                        <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            Nenhuma peça neste lote tem usinagens definidas.
                        </div>
                    )}
                </div>
            )}
        </div>
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

    // (impressão e ZPL agora são por chapa — definidos após filtros)

    // Filtrar etiquetas
    const modulos = [...new Set(etiquetas.map(e => e.modulo_desc).filter(Boolean))];
    const materiais = [...new Set(etiquetas.map(e => e.material || e.material_code).filter(Boolean))];
    const etiquetasFiltradas = etiquetas.filter(e => {
        if (filtroModulo && e.modulo_desc !== filtroModulo) return false;
        if (filtroMaterial && (e.material || e.material_code) !== filtroMaterial) return false;
        return true;
    });

    // Agrupar etiquetas por chapa
    const chapaGroups = useMemo(() => {
        const groups = {};
        for (const et of etiquetasFiltradas) {
            const key = et.chapa_idx != null && et.chapa_idx >= 0 ? et.chapa_idx : 'sem_chapa';
            if (!groups[key]) groups[key] = { chapa_idx: key, etiquetas: [], material: et.material || et.material_code || '', chapa: et.chapa };
            groups[key].etiquetas.push(et);
        }
        // Ordenar: chapas numéricas primeiro, 'sem_chapa' por último
        return Object.values(groups).sort((a, b) => {
            if (a.chapa_idx === 'sem_chapa') return 1;
            if (b.chapa_idx === 'sem_chapa') return -1;
            return a.chapa_idx - b.chapa_idx;
        });
    }, [etiquetasFiltradas]);

    const totalChapas = chapaGroups.filter(g => g.chapa_idx !== 'sem_chapa').length;

    // Imprimir uma chapa específica
    const imprimirChapa = (chapaIdx) => {
        // Esconder todas as etiquetas que NÃO são desta chapa antes de imprimir
        const styleId = 'etiqueta-print-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        if (usarTemplate && templatePadrao) {
            const cols = templatePadrao.colunas_impressao || 2;
            const margem = templatePadrao.margem_pagina || 8;
            const gap = templatePadrao.gap_etiquetas || 4;
            const wMm = templatePadrao.largura || 100;
            const hMm = templatePadrao.altura || 70;
            styleEl.textContent = `
                @media print {
                    body * { visibility: hidden !important; }
                    .print-chapa-${chapaIdx}, .print-chapa-${chapaIdx} * { visibility: visible !important; }
                    .print-chapa-${chapaIdx} {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        display: grid !important;
                        grid-template-columns: repeat(${cols}, ${wMm}mm) !important;
                        gap: ${gap}mm !important;
                        padding: 0 !important;
                    }
                    .print-chapa-${chapaIdx} .etiqueta-svg-wrap {
                        width: ${wMm}mm !important;
                        height: ${hMm}mm !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .print-chapa-${chapaIdx} .etiqueta-svg-wrap svg {
                        width: ${wMm}mm !important;
                        height: ${hMm}mm !important;
                    }
                    .no-print { display: none !important; }
                    @page { margin: ${margem}mm !important; size: A4 !important; }
                }
            `;
        } else {
            const cols = cfg?.colunas_impressao || 2;
            const fmt = FORMATOS_ETIQUETA[cfg?.formato] || FORMATOS_ETIQUETA['100x70'];
            const gap = cfg?.gap_etiquetas || 4;
            const margem = cfg?.margem_pagina || 8;
            styleEl.textContent = `
                @media print {
                    body * { visibility: hidden !important; }
                    .print-chapa-${chapaIdx}, .print-chapa-${chapaIdx} * { visibility: visible !important; }
                    .print-chapa-${chapaIdx} {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
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
                    .no-print { display: none !important; }
                    @page { margin: ${margem}mm !important; size: A4 !important; }
                }
            `;
        }
        window.print();
    };

    // ZPL por chapa
    const exportarZPLChapa = async (chapaEtiquetas) => {
        if (!templatePadrao || chapaEtiquetas.length === 0) {
            notify('Configure um template e selecione etiquetas');
            return;
        }
        try {
            const { generateZPLBatch } = await import('../utils/zplGenerator.js');
            const zpl = generateZPLBatch(
                templatePadrao.elementos || [],
                chapaEtiquetas,
                cfg,
                { largura: templatePadrao.largura || 100, altura: templatePadrao.altura || 70 }
            );
            const blob = new Blob([zpl], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `etiquetas_chapa.zpl`;
            a.click();
            URL.revokeObjectURL(url);
            notify(`ZPL exportado: ${chapaEtiquetas.length} etiqueta(s)`);
        } catch (err) {
            notify('Erro ao gerar ZPL: ' + err.message);
        }
    };

    if (cfgLoading) return <Spinner text="Carregando configurações..." />;

    const fontes = FONTES_TAMANHO[cfg?.fonte_tamanho] || FONTES_TAMANHO.medio;
    const corFita = cfg?.cor_borda_fita || '#22c55e';
    const corCtrl = cfg?.cor_controle || 'var(--primary)';

    // ═══════════════════════════════════════════════════════
    // PREVIEW — Etiquetas agrupadas por chapa
    // ═══════════════════════════════════════════════════════
    return (
        <div>
            {loading ? (
                <Spinner text="Carregando etiquetas..." />
            ) : (
                <>
                    {/* Barra de ações global */}
                    <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Toggle template vs legacy */}
                        {templatePadrao && (
                            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '6px 10px', background: 'var(--bg-muted)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                <input type="checkbox" checked={usarTemplate} onChange={e => setUsarTemplate(e.target.checked)} />
                                Usar template personalizado
                            </label>
                        )}

                        {/* Filtros */}
                        {materiais.length > 1 && (
                            <select value={filtroMaterial} onChange={e => setFiltroMaterial(e.target.value)}
                                className={Z.inp} style={{ width: 180, fontSize: 11, padding: '6px 8px' }}>
                                <option value="">Todos os materiais</option>
                                {materiais.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        )}

                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            {etiquetasFiltradas.length} etiqueta(s) em {totalChapas} chapa(s)
                            {templatePadrao && usarTemplate && <span style={{ color: 'var(--primary)', fontWeight: 600, marginLeft: 6 }}>| {templatePadrao.nome}</span>}
                        </span>
                    </div>

                    {/* Grupos por chapa */}
                    {chapaGroups.map((group) => {
                        const isNoChapa = group.chapa_idx === 'sem_chapa';
                        const chapaLabel = isNoChapa ? 'Sem chapa atribuída' : `Chapa ${group.chapa_idx + 1} de ${totalChapas}`;
                        const chapaW = group.chapa?.w || 0;
                        const chapaH = group.chapa?.h || 0;
                        const printClass = `print-chapa-${group.chapa_idx}`;

                        return (
                            <div key={group.chapa_idx} style={{ marginBottom: 20 }}>
                                {/* Cabeçalho da chapa */}
                                <div className="no-print" style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                    background: isNoChapa ? 'var(--bg-muted)' : 'linear-gradient(135deg, var(--primary), #1a6ad4)',
                                    borderRadius: '10px 10px 0 0', flexWrap: 'wrap',
                                }}>
                                    <Layers size={16} style={{ color: isNoChapa ? 'var(--text-muted)' : '#fff' }} />
                                    <span style={{ fontWeight: 700, fontSize: 14, color: isNoChapa ? 'var(--text-primary)' : '#fff' }}>
                                        {chapaLabel}
                                    </span>
                                    {!isNoChapa && (
                                        <>
                                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
                                                {group.material}
                                            </span>
                                            {chapaW > 0 && (
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 4 }}>
                                                    {chapaW}×{chapaH}mm
                                                </span>
                                            )}
                                        </>
                                    )}
                                    <span style={{
                                        fontSize: 11, fontWeight: 600,
                                        color: isNoChapa ? 'var(--text-muted)' : 'rgba(255,255,255,0.9)',
                                        background: isNoChapa ? 'var(--border)' : 'rgba(255,255,255,0.2)',
                                        padding: '2px 10px', borderRadius: 10,
                                    }}>
                                        {group.etiquetas.length} peça(s)
                                    </span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                        <button onClick={() => imprimirChapa(group.chapa_idx)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px',
                                                fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                                                background: isNoChapa ? 'var(--primary)' : 'rgba(255,255,255,0.95)',
                                                color: isNoChapa ? '#fff' : 'var(--primary)',
                                            }}>
                                            <Printer size={12} /> Imprimir
                                        </button>
                                        {templatePadrao && (
                                            <button onClick={() => exportarZPLChapa(group.etiquetas)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                                    fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                                                    background: isNoChapa ? 'var(--bg-muted)' : 'rgba(255,255,255,0.2)',
                                                    color: isNoChapa ? 'var(--text-primary)' : '#fff',
                                                }}>
                                                <Download size={12} /> ZPL
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Grid de etiquetas desta chapa */}
                                <div className={printClass} style={{
                                    padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    borderTop: 'none', borderRadius: '0 0 10px 10px',
                                    display: 'grid',
                                    gridTemplateColumns: usarTemplate && templatePadrao
                                        ? `repeat(auto-fill, minmax(${Math.max(280, (templatePadrao.largura || 100) * 3.5)}px, 1fr))`
                                        : `repeat(auto-fill, minmax(${Math.max(280, 320)}px, 1fr))`,
                                    gap: (usarTemplate && templatePadrao ? templatePadrao.gap_etiquetas : cfg?.gap_etiquetas || 4) * 2 + 'px',
                                }}>
                                    {group.etiquetas.map((et, i) => (
                                        usarTemplate && templatePadrao ? (
                                            <div key={i} className="etiqueta-svg-wrap" style={{
                                                background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb',
                                                overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                            }}>
                                                <EtiquetaSVG template={templatePadrao} etiqueta={et} cfg={cfg} />
                                            </div>
                                        ) : (
                                            <EtiquetaCard key={i} et={et} cfg={cfg} fontes={fontes} corFita={corFita} corCtrl={corCtrl} />
                                        )
                                    ))}
                                </div>
                            </div>
                        );
                    })}

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
    const [gcodeSubTab, setGcodeSubTab] = useState('gcode'); // 'gcode' | 'etiquetas'
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [gerando, setGerando] = useState(false);
    const [maquinas, setMaquinas] = useState([]);
    const [maquinaId, setMaquinaId] = useState('');
    const [gcodeValidation, setGcodeValidation] = useState(null);
    const [showGcodeConflicts, setShowGcodeConflicts] = useState(false);
    const [toolpathOpen, setToolpathOpen] = useState(false);
    const [toolpathMoves, setToolpathMoves] = useState([]);
    const [toolpathChapa, setToolpathChapa] = useState(null);

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
        // Auto-validate before generating
        try {
            const val = await api.get(`/cnc/validar-usinagens/${loteAtual.id}`);
            setGcodeValidation(val);
            const erros = (val.conflicts || []).filter(c => c.severidade === 'erro');
            if (erros.length > 0) {
                setShowGcodeConflicts(true);
                const proceed = window.confirm(
                    `${erros.length} erro(s) de usinagem detectado(s):\n\n` +
                    erros.slice(0, 5).map(c => `- ${c.pecaDesc}: ${c.mensagem}`).join('\n') +
                    (erros.length > 5 ? `\n...e mais ${erros.length - 5}` : '') +
                    '\n\nDeseja gerar o G-code mesmo assim?'
                );
                if (!proceed) return;
            }
        } catch (_) { /* validation failed, proceed anyway */ }

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
            {/* Sub-tabs: G-code | Etiquetas */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
                {[
                    { id: 'gcode', lb: 'G-code / CNC', ic: Cpu },
                    { id: 'etiquetas', lb: 'Etiquetas', ic: TagIcon },
                ].map(st => (
                    <button key={st.id} onClick={() => setGcodeSubTab(st.id)}
                        style={{
                            padding: '8px 18px', fontSize: 12, fontWeight: gcodeSubTab === st.id ? 700 : 400,
                            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            borderBottom: gcodeSubTab === st.id ? '2px solid var(--primary)' : '2px solid transparent',
                            marginBottom: -2, background: 'transparent',
                            color: gcodeSubTab === st.id ? 'var(--primary)' : 'var(--text-muted)',
                            transition: 'all .15s',
                        }}>
                        <st.ic size={14} /> {st.lb}
                    </button>
                ))}
            </div>

            {/* Etiquetas sub-tab */}
            {gcodeSubTab === 'etiquetas' && (
                <TabEtiquetas lotes={lotes} loteAtual={loteAtual} setLoteAtual={setLoteAtual} notify={notify} />
            )}

            {/* G-code sub-tab */}
            {gcodeSubTab === 'gcode' && <>
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

                    {/* Pre-generation validation warnings */}
                    {showGcodeConflicts && gcodeValidation?.conflicts?.length > 0 && (
                        <div className="glass-card p-4" style={{ marginBottom: 16, borderLeft: '3px solid #ef4444' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertTriangle size={14} /> Conflitos detectados ({gcodeValidation.conflicts.length})
                                </span>
                                <button onClick={() => setShowGcodeConflicts(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={13} />
                                </button>
                            </div>
                            <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {gcodeValidation.conflicts.map((c, i) => (
                                    <div key={i} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, color: c.severidade === 'erro' ? '#ef4444' : '#eab308' }}>
                                        <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                                        <span style={{ fontWeight: 600 }}>{c.pecaDesc}</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{c.mensagem}</span>
                                    </div>
                                ))}
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
                        {result?.ok && result?.gcode && (
                            <button onClick={() => {
                                const moves = parseGcodeToMoves(result.gcode);
                                setToolpathMoves(moves);
                                setToolpathChapa(null);
                                setToolpathOpen(true);
                            }} className={Z.btn2}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                                <Play size={14} /> Simular Percurso
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

                    {/* Toolpath Simulator */}
                    <ToolpathSimulator
                        chapData={toolpathChapa}
                        operations={toolpathMoves}
                        isOpen={toolpathOpen}
                        onClose={() => { setToolpathOpen(false); setToolpathMoves([]); setToolpathChapa(null); }}
                    />
            </>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 6: CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════
function TabConfig({ notify, setEditorMode, setEditorTemplateId, initialSection, setConfigSection }) {
    const [activeSection, setActiveSection] = useState(initialSection || 'maquinas');
    const [cfgSearch, setCfgSearch] = useState('');
    const handleSection = (id) => { setActiveSection(id); setConfigSection?.(id); setCfgSearch(''); };

    const CONFIG_SECTIONS = [
        { id: 'maquinas', lb: 'Máquinas CNC', ic: Monitor, desc: 'Cadastro de máquinas CNC, ferramentas, origens' },
        { id: 'chapas', lb: 'Chapas', ic: Layers, desc: 'Chapas de MDF, MDP, compensado, dimensões' },
        { id: 'usinagem', lb: 'Tipos de Usinagem', ic: PenTool, desc: 'Furos, rebaixos, canais, contornos, profundidade' },
        { id: 'parametros', lb: 'Parâmetros', ic: Settings, desc: 'Algoritmo otimizador, margem, kerf, rotação' },
        { id: 'etiquetas', lb: 'Etiquetas', ic: TagIcon, desc: 'Templates de etiquetas, formato, campos' },
        { id: 'retalhos', lb: 'Retalhos', ic: Package, desc: 'Estoque de retalhos, aproveitamento, sobras' },
    ];

    const filteredSections = cfgSearch
        ? CONFIG_SECTIONS.filter(s => s.lb.toLowerCase().includes(cfgSearch.toLowerCase()) || s.desc.toLowerCase().includes(cfgSearch.toLowerCase()))
        : CONFIG_SECTIONS;

    return (
        <div style={{ display: 'flex', gap: 0, minHeight: 500 }}>
            {/* Sidebar */}
            <div style={{
                width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
                borderRight: '1px solid var(--border)', background: 'var(--bg-muted)',
                borderRadius: '10px 0 0 10px', overflow: 'hidden',
            }}>
                {/* Search */}
                <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ position: 'relative' }}>
                        <SearchIcon size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input value={cfgSearch} onChange={e => setCfgSearch(e.target.value)}
                            placeholder="Buscar config..."
                            className={Z.inp} style={{ fontSize: 11, padding: '6px 8px 6px 28px', width: '100%' }} />
                    </div>
                </div>
                {/* Section list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                    {filteredSections.map(s => {
                        const SIc = s.ic;
                        const isActive = activeSection === s.id;
                        return (
                            <button key={s.id} onClick={() => handleSection(s.id)}
                                style={{
                                    width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                                    background: isActive ? 'var(--bg-card)' : 'transparent',
                                    color: isActive ? 'var(--primary)' : 'var(--text-primary)',
                                    fontWeight: isActive ? 700 : 400,
                                    borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                                    transition: 'all .15s',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.03))'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                                <SIc size={15} style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }} />
                                <div style={{ textAlign: 'left' }}>
                                    <div>{s.lb}</div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginTop: 1 }}>{s.desc.split(',')[0]}</div>
                                </div>
                            </button>
                        );
                    })}
                    {filteredSections.length === 0 && (
                        <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                            Nenhuma seção encontrada
                        </div>
                    )}
                </div>
            </div>
            {/* Content */}
            <div style={{ flex: 1, padding: 16, minWidth: 0 }}>
                {activeSection === 'maquinas' && <CfgMaquinas notify={notify} />}
                {activeSection === 'chapas' && <CfgChapas notify={notify} />}
                {activeSection === 'usinagem' && <CfgUsinagem notify={notify} />}
                {activeSection === 'parametros' && <CfgParametros notify={notify} />}
                {activeSection === 'etiquetas' && <CfgEtiquetas notify={notify} setEditorMode={setEditorMode} setEditorTemplateId={setEditorTemplateId} />}
                {activeSection === 'retalhos' && <CfgRetalhos notify={notify} />}
            </div>
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
                <button onClick={() => setModal({ nome: '', material_code: '', espessura_nominal: 18, espessura_real: 18.5, comprimento: 2750, largura: 1850, refilo: 10, veio: 'sem_veio', preco: 0, kerf: 4, ativo: 1, direcao_corte: 'herdar', modo_corte: 'herdar' })}
                    className={Z.btn} style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Nova Chapa
                </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                    <thead>
                        <tr>
                            {['Nome', 'Código', 'Esp.Nom', 'Esp.Real', 'Comp', 'Larg', 'Refilo', 'Kerf', 'Veio', 'Dir.Corte', 'Modo', 'Preço', 'Ações'].map(h => (
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
                                <td style={{ padding: '6px 8px', fontSize: 10 }}>
                                    {(!c.direcao_corte || c.direcao_corte === 'herdar') ? <span style={{ color: 'var(--text-muted)' }}>Global</span> :
                                     c.direcao_corte === 'misto' ? <span style={{ color: '#22c55e' }}>Misto</span> :
                                     c.direcao_corte === 'horizontal' ? <span style={{ color: '#3b82f6' }}>━ Horiz</span> :
                                     <span style={{ color: '#f59e0b' }}>┃ Vert</span>}
                                </td>
                                <td style={{ padding: '6px 8px', fontSize: 10 }}>
                                    {(!c.modo_corte || c.modo_corte === 'herdar') ? <span style={{ color: 'var(--text-muted)' }}>Global</span> :
                                     <span style={{ fontWeight: 600 }}>{c.modo_corte === 'maxrects' ? 'MaxRects' : c.modo_corte === 'guilhotina' ? 'Guilhotina' : 'Shelf'}</span>}
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
                <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)' }}>Otimização por Material (opcional)</div>
                </div>
                <div>
                    <label className={Z.lbl}>Direção de Corte</label>
                    <select value={f.direcao_corte || 'herdar'} onChange={e => upd('direcao_corte', e.target.value)} className={Z.inp}>
                        <option value="herdar">Herdar (usa config global)</option>
                        <option value="misto">Misto (automático)</option>
                        <option value="horizontal">━ Horizontal</option>
                        <option value="vertical">┃ Vertical</option>
                    </select>
                </div>
                <div>
                    <label className={Z.lbl}>Modo de Corte</label>
                    <select value={f.modo_corte || 'herdar'} onChange={e => upd('modo_corte', e.target.value)} className={Z.inp}>
                        <option value="herdar">Herdar (usa config global)</option>
                        <option value="guilhotina">Guilhotina</option>
                        <option value="maxrects">MaxRects (CNC livre)</option>
                        <option value="shelf">Shelf</option>
                    </select>
                </div>
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
                                {['Código', 'Nome', 'Tipo Corte', 'Ø mm', 'Tool Code', 'RPM', 'Vel.Corte', 'Prof.Max', 'DOC', 'Prof.Extra', 'Desgaste', 'Ações'].map(h => (
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
                                    <td style={{ padding: '5px 6px', minWidth: 100 }}>
                                        {(() => {
                                            const acum = f.metros_acumulados || 0;
                                            const limite = f.metros_limite || 5000;
                                            const pct = limite > 0 ? Math.min(100, (acum / limite) * 100) : 0;
                                            const barColor = pct < 50 ? '#22c55e' : pct < 80 ? '#f59e0b' : '#ef4444';
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <div style={{ flex: 1, height: 6, background: 'var(--bg-muted)', borderRadius: 3, overflow: 'hidden', minWidth: 40 }}>
                                                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width .3s' }} />
                                                    </div>
                                                    <span style={{ fontSize: 9, fontWeight: 600, color: barColor, whiteSpace: 'nowrap' }}>
                                                        {acum.toFixed(0)}m
                                                    </span>
                                                    {pct >= 80 && (
                                                        <button onClick={async () => { await api.post(`/cnc/ferramentas/${f.id}/reset-desgaste`); notify('Desgaste resetado'); load(); }}
                                                            title="Resetar desgaste (troca de ferramenta)"
                                                            className={Z.btn2} style={{ padding: '1px 4px', fontSize: 9, whiteSpace: 'nowrap' }}>
                                                            <RotateCw size={9} /> Reset
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()}
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: '6px 10px', background: 'var(--bg-body)', borderRadius: 6 }}>
                        <input type="checkbox" checked={(cfg.otimizar_trocas_ferramenta ?? 1) === 1} onChange={e => upd('otimizar_trocas_ferramenta', e.target.checked ? 1 : 0)} />
                        Otimizar trocas de ferramenta
                    </label>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                    O otimizador testa automaticamente os 3 algoritmos (Guilhotina, MaxRects, Shelf) e escolhe o melhor resultado.
                    Guilhotina: cortes ponta-a-ponta (para esquadrejadeira). MaxRects: posicionamento livre (CNC). Shelf: faixas horizontais (híbrido).
                    Trocas de ferramenta: agrupa operações por ferramenta dentro de cada fase para minimizar M6.
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div><label className={Z.lbl}>Espaço entre peças (mm)</label><input type="number" value={cfg.espaco_pecas} onChange={e => upd('espaco_pecas', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Kerf padrão - largura serra (mm)</label><input type="number" value={cfg.kerf_padrao ?? 4} onChange={e => upd('kerf_padrao', Number(e.target.value))} className={Z.inp} step="0.5" /></div>
                {/* Iterações R&R: otimizado automaticamente pelo backend — não precisa configurar */}
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
        coordenada_zero: 'canto_esq_inf', trocar_eixos_xy: 0, eixo_x_invertido: 0, eixo_y_invertido: 0,
        // G-Code v2
        z_origin: 'mesa', z_aproximacao: 2.0, direcao_corte: 'climb',
        usar_n_codes: 1, n_code_incremento: 10, dwell_spindle: 1.0,
        // G-Code v3 — Ramping, Lead-in, Velocidade mergulho, Ordenação
        usar_rampa: 1, rampa_angulo: 3.0, vel_mergulho: 1500,
        z_aproximacao_rapida: 5.0, ordenar_contornos: 'menor_primeiro',
        // G-Code v4 — Estratégias avançadas
        rampa_tipo: 'linear', vel_rampa: 1500, rampa_diametro_pct: 80,
        stepover_pct: 60, pocket_acabamento: 1, pocket_acabamento_offset: 0.2, pocket_direcao: 'auto',
        compensar_raio_canal: 1, compensacao_tipo: 'overcut',
        circular_passes_acabamento: 1, circular_offset_desbaste: 0.3, vel_acabamento_pct: 80,
        //
        exportar_lado_a: 1, exportar_lado_b: 1, exportar_furos: 1, exportar_rebaixos: 1, exportar_usinagens: 1,
        usar_ponto_decimal: 1, casas_decimais: 3,
        comentario_prefixo: ';', troca_ferramenta_cmd: 'M6', spindle_on_cmd: 'M3', spindle_off_cmd: 'M5',
        // Anti-arrasto
        usar_onion_skin: 1, onion_skin_espessura: 0.5, onion_skin_area_max: 500,
        usar_tabs: 0, tab_largura: 4, tab_altura: 1.5, tab_qtd: 2, tab_area_max: 800,
        usar_lead_in: 0, lead_in_tipo: 'arco', lead_in_raio: 5,
        feed_rate_pct_pequenas: 50, feed_rate_area_max: 500,
        margem_mesa_sacrificio: 0.5,
        g0_com_feed: 0,
        padrao: 0, ativo: 1,
        // Envio direto
        envio_tipo: '', envio_host: '', envio_porta: 21, envio_usuario: '', envio_senha: '', envio_pasta: '/',
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
        { id: 'estrategias', lb: 'Estratégias Usinagem' },
        { id: 'antiarrasto', lb: 'Anti-Arrasto' },
        { id: 'exportacao', lb: 'Exportação' },
        { id: 'formato', lb: 'Formato' },
        { id: 'envio', lb: 'Envio Direto' },
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
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.trocar_eixos_xy === 1} onChange={e => upd('trocar_eixos_xy', e.target.checked ? 1 : 0)} />
                            X = comprimento (inverter padrao)
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.eixo_x_invertido === 1} onChange={e => upd('eixo_x_invertido', e.target.checked ? 1 : 0)} />
                            Eixo X invertido
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.eixo_y_invertido === 1} onChange={e => upd('eixo_y_invertido', e.target.checked ? 1 : 0)} />
                            Eixo Y invertido
                        </label>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: -6 }}>
                        {f.trocar_eixos_xy === 1
                            ? 'Modo alternativo: X = comprimento (maior), Y = largura (menor).'
                            : 'Padrao: X = largura (menor eixo), Y = comprimento (maior eixo). Mais comum em CNC.'}
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
                    <div>
                        <label className={Z.lbl}>Vel. Vazio (mm/min)</label>
                        <input type="number" value={f.vel_vazio} onChange={e => upd('vel_vazio', Number(e.target.value))} className={Z.inp} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                            <input type="checkbox" checked={(f.g0_com_feed ?? 0) === 1} onChange={e => upd('g0_com_feed', e.target.checked ? 1 : 0)} />
                            Incluir F no G0 (vel. vazio)
                        </label>
                    </div>
                    <div><label className={Z.lbl}>Vel. Corte (mm/min)</label><input type="number" value={f.vel_corte} onChange={e => upd('vel_corte', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Vel. Aproximação (mm/min)</label><input type="number" value={f.vel_aproximacao} onChange={e => upd('vel_aproximacao', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Prof. Extra (mm)</label><input type="number" value={f.profundidade_extra} onChange={e => upd('profundidade_extra', Number(e.target.value))} className={Z.inp} step="0.01" /></div>
                    <div><label className={Z.lbl}>Z Aproximação (mm acima)</label><input type="number" value={f.z_aproximacao ?? 2} onChange={e => upd('z_aproximacao', Number(e.target.value))} className={Z.inp} step="0.5" min="0.5" /></div>
                    <div><label className={Z.lbl}>Dwell Spindle (s)</label><input type="number" value={f.dwell_spindle ?? 1} onChange={e => upd('dwell_spindle', Number(e.target.value))} className={Z.inp} step="0.5" min="0" /></div>
                    <div style={{ gridColumn: '1/-1', padding: '10px 14px', background: '#ef444415', borderRadius: 8, border: '1px solid #ef444440' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 14 }}>&#9888;</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>Proteção da Mesa de Sacrifício</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Limita a profundidade máxima de corte para não danificar a mesa de sacrifício.
                            Ex: chapa de 15mm com margem 0.5mm = profundidade máxima 15.5mm.
                            Qualquer operação que ultrapasse será automaticamente reduzida.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Margem além do material (mm)</label><input type="number" value={f.margem_mesa_sacrificio ?? 0.5} onChange={e => upd('margem_mesa_sacrificio', Number(e.target.value))} className={Z.inp} step="0.1" min="0" max="3" /></div>
                        </div>
                    </div>
                </div>
            )}

            {secao === 'estrategias' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        Configurações avançadas de estratégia de usinagem: como a fresa executa rebaixos, furos circulares, canais e rampas.
                    </p>

                    {/* Rampa */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Entrada em Rampa / Mergulho</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <div>
                                <label className={Z.lbl}>Tipo de Rampa</label>
                                <select value={f.rampa_tipo || 'linear'} onChange={e => upd('rampa_tipo', e.target.value)} className={Z.inp}>
                                    <option value="linear">Linear (diagonal)</option>
                                    <option value="helicoidal">Helicoidal (espiral)</option>
                                    <option value="plunge">Plunge direto</option>
                                </select>
                            </div>
                            <div><label className={Z.lbl}>Vel. Rampa (mm/min)</label><input type="number" value={f.vel_rampa ?? 1500} onChange={e => upd('vel_rampa', Number(e.target.value))} className={Z.inp} step="100" min="100" /></div>
                            <div><label className={Z.lbl}>Diâmetro Hélice (%)</label><input type="number" value={f.rampa_diametro_pct ?? 80} onChange={e => upd('rampa_diametro_pct', Number(e.target.value))} className={Z.inp} step="5" min="30" max="100" /></div>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
                            <b>Linear</b>: fresa desce em diagonal (ideal para canais). <b>Helicoidal</b>: fresa desce em espiral (ideal para furos circulares). <b>Diâmetro Hélice</b>: % do diâmetro do furo usado para raio da espiral.
                        </p>
                    </div>

                    {/* Pocket / Rebaixo */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Rebaixo (Pocket)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Stepover (%)</label><input type="number" value={f.stepover_pct ?? 60} onChange={e => upd('stepover_pct', Number(e.target.value))} className={Z.inp} step="5" min="20" max="90" /></div>
                            <div>
                                <label className={Z.lbl}>Direção Zigzag</label>
                                <select value={f.pocket_direcao || 'auto'} onChange={e => upd('pocket_direcao', e.target.value)} className={Z.inp}>
                                    <option value="auto">Auto (eixo mais longo)</option>
                                    <option value="x">Sempre X</option>
                                    <option value="y">Sempre Y</option>
                                </select>
                            </div>
                            <div><label className={Z.lbl}>Vel. Acabamento (%)</label><input type="number" value={f.vel_acabamento_pct ?? 80} onChange={e => upd('vel_acabamento_pct', Number(e.target.value))} className={Z.inp} step="5" min="30" max="100" /></div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={(f.pocket_acabamento ?? 1) === 1} onChange={e => upd('pocket_acabamento', e.target.checked ? 1 : 0)} />
                                    Passe de acabamento
                                </label>
                            </div>
                            <div><label className={Z.lbl}>Offset acabamento (mm)</label><input type="number" value={f.pocket_acabamento_offset ?? 0.2} onChange={e => upd('pocket_acabamento_offset', Number(e.target.value))} className={Z.inp} step="0.05" min="0.05" max="2" /></div>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
                            <b>Stepover</b>: espaçamento entre passadas = % do diâmetro da fresa. 60% é ideal para MDF.
                            <b>Passe de acabamento</b>: após o zigzag, faz uma passada final no contorno do pocket com velocidade reduzida para paredes limpas.
                        </p>
                    </div>

                    {/* Furos Circulares */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Furos Circulares (Interpolação)</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Quando não há broca do diâmetro exato, a fresa contorna o furo em círculo (G2/G3). Aplica-se a dobradiças (Ø35mm), minifix, etc.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Passes de acabamento</label><input type="number" value={f.circular_passes_acabamento ?? 1} onChange={e => upd('circular_passes_acabamento', Number(e.target.value))} className={Z.inp} min="0" max="5" /></div>
                            <div><label className={Z.lbl}>Offset desbaste (mm)</label><input type="number" value={f.circular_offset_desbaste ?? 0.3} onChange={e => upd('circular_offset_desbaste', Number(e.target.value))} className={Z.inp} step="0.05" min="0" max="2" /></div>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
                            <b>Offset desbaste</b>: no desbaste, a fresa fica X mm afastada da parede final. O passe de acabamento remove esse material com velocidade reduzida para dimensão precisa.
                        </p>
                    </div>

                    {/* Compensação de Raio */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Compensação de Raio em Canais</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            A fresa tem diâmetro &gt; 0, então cantos de canais ficam arredondados. A compensação avança a fresa além do canto para que o espaço útil fique com cantos retos.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={(f.compensar_raio_canal ?? 1) === 1} onChange={e => upd('compensar_raio_canal', e.target.checked ? 1 : 0)} />
                                    Ativar compensação
                                </label>
                            </div>
                            <div>
                                <label className={Z.lbl}>Tipo</label>
                                <select value={f.compensacao_tipo || 'overcut'} onChange={e => upd('compensacao_tipo', e.target.value)} className={Z.inp}>
                                    <option value="overcut">Overcut (avanço do raio)</option>
                                    <option value="dogbone">Dog-bone (furo nos cantos)</option>
                                </select>
                            </div>
                        </div>
                    </div>
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

            {secao === 'envio' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: '1/-1', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        Configure o envio direto do G-Code para a máquina via rede ou pasta compartilhada.
                    </div>
                    <div>
                        <label className={Z.lbl}>Tipo de Envio</label>
                        <select value={f.envio_tipo || ''} onChange={e => upd('envio_tipo', e.target.value)} className={Z.inp}>
                            <option value="">Desativado</option>
                            <option value="pasta">Pasta / Volume de Rede</option>
                            <option value="ftp">FTP</option>
                        </select>
                    </div>
                    {f.envio_tipo === 'ftp' && (
                        <>
                            <div><label className={Z.lbl}>Host / IP</label><input value={f.envio_host || ''} onChange={e => upd('envio_host', e.target.value)} className={Z.inp} placeholder="192.168.1.100" /></div>
                            <div><label className={Z.lbl}>Porta</label><input type="number" value={f.envio_porta || 21} onChange={e => upd('envio_porta', Number(e.target.value))} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Usuario</label><input value={f.envio_usuario || ''} onChange={e => upd('envio_usuario', e.target.value)} className={Z.inp} /></div>
                            <div><label className={Z.lbl}>Senha</label><input type="password" value={f.envio_senha || ''} onChange={e => upd('envio_senha', e.target.value)} className={Z.inp} /></div>
                        </>
                    )}
                    {(f.envio_tipo === 'pasta' || f.envio_tipo === 'ftp') && (
                        <div style={{ gridColumn: '1/-1' }}>
                            <label className={Z.lbl}>Pasta Destino</label>
                            <input value={f.envio_pasta || '/'} onChange={e => upd('envio_pasta', e.target.value)} className={Z.inp} placeholder="/home/cnc/programas" style={{ width: '100%' }} />
                        </div>
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

    // Parse estrategias JSON
    const [estrategias, setEstrategias] = useState(() => {
        try { return JSON.parse(data.estrategias || '[]'); } catch { return []; }
    });
    const addEst = () => setEstrategias(p => [...p, { nome: '', metodo: 'drill', tool_match: '', diam_match: false, diam_min: null, diam_max: null }]);
    const updEst = (i, k, v) => setEstrategias(p => p.map((e, j) => j === i ? { ...e, [k]: v } : e));
    const delEst = (i) => setEstrategias(p => p.filter((_, j) => j !== i));
    const moveEst = (i, dir) => setEstrategias(p => {
        const arr = [...p]; const ni = i + dir;
        if (ni < 0 || ni >= arr.length) return arr;
        [arr[i], arr[ni]] = [arr[ni], arr[i]]; return arr;
    });
    // Sync estrategias to f on every change
    useEffect(() => { upd('estrategias', JSON.stringify(estrategias)); }, [estrategias]);
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

            {/* Estratégias de Execução */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Estratégias de Execução (ordem de preferência)
            </div>
            <div style={{ padding: '8px 10px', background: 'var(--bg-muted)', borderRadius: 6, fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                Defina como executar esta operação. O sistema tenta a 1ª estratégia; se a ferramenta não existir, tenta a 2ª, e assim por diante.
                Ex: furo Ø35 → 1) broca 35mm (drill) → 2) fresa 8mm (helicoidal) → 3) fresa 6mm (pocket circular).
            </div>
            {estrategias.map((est, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 120px 120px 70px 70px 60px', gap: 6, alignItems: 'end', marginBottom: 4, fontSize: 11 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button onClick={() => moveEst(i, -1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>▲</button>
                        <span style={{ textAlign: 'center', fontWeight: 700, fontSize: 10, color: 'var(--text-muted)' }}>{i + 1}</span>
                        <button onClick={() => moveEst(i, 1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>▼</button>
                    </div>
                    <div>
                        {i === 0 && <label className={Z.lbl} style={{ fontSize: 9 }}>Nome</label>}
                        <input value={est.nome || ''} onChange={e => updEst(i, 'nome', e.target.value)} className={Z.inp} placeholder="broca_35mm" style={{ fontSize: 11 }} />
                    </div>
                    <div>
                        {i === 0 && <label className={Z.lbl} style={{ fontSize: 9 }}>Método</label>}
                        <select value={est.metodo || 'drill'} onChange={e => updEst(i, 'metodo', e.target.value)} className={Z.inp} style={{ fontSize: 11 }}>
                            <option value="drill">Furação direta</option>
                            <option value="helical">Helicoidal</option>
                            <option value="circular">Circular (G2/G3)</option>
                            <option value="pocket_zigzag">Rebaixo zigzag</option>
                            <option value="pocket_spiral">Rebaixo espiral</option>
                            <option value="groove">Rasgo linear</option>
                        </select>
                    </div>
                    <div>
                        {i === 0 && <label className={Z.lbl} style={{ fontSize: 9 }}>Tipo ferramenta</label>}
                        <select value={est.tool_match || ''} onChange={e => updEst(i, 'tool_match', e.target.value)} className={Z.inp} style={{ fontSize: 11 }}>
                            <option value="">Qualquer</option>
                            <option value="broca">Broca</option>
                            <option value="fresa">Fresa</option>
                            <option value="fresa_compressao">Fresa Compressão</option>
                        </select>
                    </div>
                    <div>
                        {i === 0 && <label className={Z.lbl} style={{ fontSize: 9 }}>Ø Min</label>}
                        <input type="number" value={est.diam_min ?? ''} onChange={e => updEst(i, 'diam_min', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} style={{ fontSize: 11 }} step="0.5" placeholder="-" />
                    </div>
                    <div>
                        {i === 0 && <label className={Z.lbl} style={{ fontSize: 9 }}>Ø Max</label>}
                        <input type="number" value={est.diam_max ?? ''} onChange={e => updEst(i, 'diam_max', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} style={{ fontSize: 11 }} step="0.5" placeholder="-" />
                    </div>
                    <div>
                        {i === 0 && <label className={Z.lbl} style={{ fontSize: 9 }}>&nbsp;</label>}
                        <button onClick={() => delEst(i)} className={Z.btn2} style={{ fontSize: 10, padding: '3px 8px', color: '#ef4444' }}>✕</button>
                    </div>
                </div>
            ))}
            <button onClick={addEst} className={Z.btn2} style={{ fontSize: 11, marginTop: 4 }}>+ Adicionar estratégia</button>

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
