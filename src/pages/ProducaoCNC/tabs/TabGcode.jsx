// Extraído automaticamente de ProducaoCNC.jsx (linhas 11601-11869).
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
import { BarcodeSVG } from '../shared/BarcodeSVG.jsx';

export function TabGcode({ lotes, loteAtual, setLoteAtual, notify }) {
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
// TAB RETALHOS — Gerenciamento completo de retalhos
// ═══════════════════════════════════════════════════════
