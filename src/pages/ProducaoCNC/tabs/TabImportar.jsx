// Extraído automaticamente de ProducaoCNC.jsx (linhas 387-843).
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

export function TabImportar({ lotes, loadLotes, notify, setLoteAtual, setTab }) {
    const [dragging, setDragging] = useState(false);
    const [preview, setPreview] = useState(null);
    const [jsonData, setJsonData] = useState(null);
    const [nome, setNome] = useState('');
    const [importing, setImporting] = useState(false);
    const [lastImportedLote, setLastImportedLote] = useState(null);
    const [matCheck, setMatCheck] = useState(null); // { cadastrados, nao_cadastrados }
    const [matEdits, setMatEdits] = useState({}); // edits to suggested chapas
    const [matActions, setMatActions] = useState({}); // { [i]: 'vincular' | 'cadastrar' }
    const [matVinculos, setMatVinculos] = useState({}); // { [i]: chapa_id }
    const [matConfirmados, setMatConfirmados] = useState({}); // { [i]: true } materiais já confirmados
    const [chapasDisponiveis, setChapasDisponiveis] = useState([]);
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

                // Verificar materiais não cadastrados (async mas com feedback)
                if (materiais.size > 0) {
                    setCheckingMats(true);
                    const matList = [...materiais].map(mc => {
                        const m = mc.match(/_(\d+(?:\.\d+)?)_/);
                        return { material_code: mc, espessura: m ? parseFloat(m[1]) : 0 };
                    });
                    Promise.all([
                        api.post('/cnc/chapas/verificar-materiais', { materiais: matList }),
                        api.get('/cnc/chapas'),
                    ]).then(([result, chapas]) => {
                            console.log('[MatCheck]', result);
                            setChapasDisponiveis(chapas.filter(c => c.ativo !== 0));
                            if (result.nao_cadastrados?.length > 0) {
                                setMatCheck(result);
                                setMatEdits({});
                                setMatActions({});
                                setMatVinculos({});
                                setMatConfirmados({});
                            } else {
                                setMatCheck(null);
                            }
                        })
                        .catch(err => {
                            console.warn('[MatCheck] Erro:', err);
                            setMatCheck(null);
                        })
                        .finally(() => setCheckingMats(false));
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
                                    {matCheck.nao_cadastrados.length} material(is) não reconhecido(s)
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                    Vincule a uma chapa existente ou cadastre uma nova
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {matCheck.nao_cadastrados.map((mat, i) => {
                                    const action = matActions[i] || 'vincular';
                                    const edit = matEdits[i] || mat.sugestao;
                                    const updateField = (k, v) => setMatEdits(prev => ({
                                        ...prev, [i]: { ...(prev[i] || mat.sugestao), [k]: v },
                                    }));

                                    // Filtrar chapas pela espessura similar
                                    const espMat = mat.espessura || 0;
                                    const chapasFiltradas = espMat
                                        ? chapasDisponiveis.filter(c => Math.abs((c.espessura_real || c.espessura_nominal) - espMat) <= 2)
                                        : chapasDisponiveis;
                                    const chapasOutras = espMat
                                        ? chapasDisponiveis.filter(c => Math.abs((c.espessura_real || c.espessura_nominal) - espMat) > 2)
                                        : [];

                                    const confirmado = matConfirmados[i];
                                    return (
                                        <div key={mat.material_code} style={{
                                            padding: 10, borderRadius: 6,
                                            background: confirmado ? 'rgba(34,197,94,0.06)' : 'var(--bg-card)',
                                            border: confirmado ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border)',
                                            opacity: confirmado ? 0.7 : 1,
                                        }}>
                                            {/* Header */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: confirmado ? 0 : 6, flexWrap: 'wrap' }}>
                                                {confirmado && <Check size={14} style={{ color: '#22c55e' }} />}
                                                <span style={{ fontSize: 12, fontWeight: 700, color: confirmado ? '#16a34a' : 'var(--text-primary)' }}>
                                                    {mat.material_code.replace(/_/g, ' ')}
                                                </span>
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '1px 6px', borderRadius: 4 }}>
                                                    {mat.espessura || '?'}mm
                                                </span>
                                                {mat.fallback_chapa && (
                                                    <span style={{ fontSize: 10, color: '#dc2626', fontStyle: 'italic' }}>
                                                        usando "{mat.fallback_chapa.nome}" por fallback
                                                    </span>
                                                )}
                                            </div>

                                            {/* Toggle: Vincular vs Cadastrar */}
                                            {!confirmado && <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                                                <button onClick={() => setMatActions(p => ({ ...p, [i]: 'vincular' }))}
                                                    style={{
                                                        fontSize: 11, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                                                        border: '1px solid var(--border)', fontWeight: action === 'vincular' ? 700 : 400,
                                                        background: action === 'vincular' ? 'var(--primary)' : 'transparent',
                                                        color: action === 'vincular' ? '#fff' : 'var(--text-secondary)',
                                                    }}>
                                                    Vincular a chapa existente
                                                </button>
                                                <button onClick={() => setMatActions(p => ({ ...p, [i]: 'cadastrar' }))}
                                                    style={{
                                                        fontSize: 11, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                                                        border: '1px solid var(--border)', fontWeight: action === 'cadastrar' ? 700 : 400,
                                                        background: action === 'cadastrar' ? '#f59e0b' : 'transparent',
                                                        color: action === 'cadastrar' ? '#fff' : 'var(--text-secondary)',
                                                    }}>
                                                    Cadastrar nova chapa
                                                </button>
                                            </div>}

                                            {/* Vincular */}
                                            {!confirmado && action === 'vincular' && (
                                                <div>
                                                    <select
                                                        value={matVinculos[i] || ''}
                                                        onChange={e => setMatVinculos(p => ({ ...p, [i]: Number(e.target.value) }))}
                                                        className={Z.inp}
                                                        style={{ fontSize: 12, padding: '6px 8px', width: '100%' }}
                                                    >
                                                        <option value="">Selecione a chapa...</option>
                                                        {chapasFiltradas.length > 0 && (
                                                            <optgroup label={`Mesma espessura (~${espMat}mm)`}>
                                                                {chapasFiltradas.map(c => (
                                                                    <option key={c.id} value={c.id}>
                                                                        {c.nome} — {c.espessura_real || c.espessura_nominal}mm ({c.comprimento}x{c.largura})
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        )}
                                                        {chapasOutras.length > 0 && (
                                                            <optgroup label="Outras espessuras">
                                                                {chapasOutras.map(c => (
                                                                    <option key={c.id} value={c.id}>
                                                                        {c.nome} — {c.espessura_real || c.espessura_nominal}mm ({c.comprimento}x{c.largura})
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        )}
                                                    </select>
                                                    {matVinculos[i] && (
                                                        <div style={{ fontSize: 10, color: '#16a34a', marginTop: 4 }}>
                                                            "{mat.material_code.replace(/_/g, ' ')}" sera tratado como a chapa selecionada na otimizacao
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Cadastrar nova */}
                                            {!confirmado && action === 'cadastrar' && (
                                                <div>
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
                                                            <select value={edit.veio === 'horizontal' || edit.veio === 'vertical' || edit.veio === 'com_veio' ? 'com_veio' : 'sem_veio'} onChange={e => updateField('veio', e.target.value)}
                                                                className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }}>
                                                                <option value="sem_veio">Sem veio</option>
                                                                <option value="com_veio">Com veio</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block' }}>Preco (R$)</label>
                                                            <input type="number" value={edit.preco} onChange={e => updateField('preco', Number(e.target.value))}
                                                                className={Z.inp} style={{ fontSize: 11, padding: '4px 6px' }} step="0.01" />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Botão confirmar individual */}
                                            {!matConfirmados[i] && (
                                                <button
                                                    disabled={checkingMats || (action === 'vincular' && !matVinculos[i])}
                                                    onClick={async () => {
                                                        setCheckingMats(true);
                                                        try {
                                                            if (action === 'vincular' && matVinculos[i]) {
                                                                await api.post('/cnc/chapa-aliases', {
                                                                    material_code_importado: mat.material_code,
                                                                    chapa_id: matVinculos[i],
                                                                });
                                                                notify(`"${mat.material_code.replace(/_/g, ' ')}" vinculado`);
                                                            } else if (action === 'cadastrar') {
                                                                const chapaData = {
                                                                    ...(matEdits[i] || mat.sugestao),
                                                                    material_code: mat.material_code,
                                                                    espessura_nominal: mat.espessura || (matEdits[i] || mat.sugestao).espessura_nominal,
                                                                };
                                                                const r = await api.post('/cnc/chapas', chapaData);
                                                                // Adicionar chapa recem-criada na lista para os outros materiais usarem
                                                                const novaChapa = { id: r.id, ...chapaData, ativo: 1 };
                                                                setChapasDisponiveis(prev => [...prev, novaChapa]);
                                                                notify(`Chapa "${chapaData.nome}" cadastrada`);
                                                            }
                                                            setMatConfirmados(prev => ({ ...prev, [i]: true }));
                                                        } catch (err) {
                                                            notify('Erro: ' + (err.error || err.message));
                                                        } finally {
                                                            setCheckingMats(false);
                                                        }
                                                    }}
                                                    style={{
                                                        marginTop: 8, padding: '5px 16px', fontSize: 11, fontWeight: 600,
                                                        borderRadius: 4, cursor: 'pointer', border: 'none',
                                                        background: action === 'vincular' ? 'var(--primary)' : '#f59e0b',
                                                        color: '#fff', opacity: (action === 'vincular' && !matVinculos[i]) ? 0.4 : 1,
                                                    }}
                                                >
                                                    {action === 'vincular' ? 'Vincular' : 'Cadastrar Chapa'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
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
                        <button onClick={doImport} disabled={importing || checkingMats} className={Z.btn} style={{ padding: '8px 24px' }}>
                            {importing ? 'Importando...' : checkingMats ? 'Verificando materiais...' : 'Importar Lote'}
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
