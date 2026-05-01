// Extraído automaticamente de ProducaoCNC.jsx (linhas 13287-13584).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../../../../components/EditorEtiquetas';
import PecaViewer3D from '../../../../components/PecaViewer3D';
import PecaEditor from '../../../../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../../components/ToolpathSimulator';
import GcodeSimWrapper from '../../../../components/GcodeSimWrapper';
import SlidePanel from '../../../../components/SlidePanel';
import ToolbarDropdown from '../../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../../shared/constants.js';

export function CfgUsinagem({ notify }) {
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

// ═══════════════════════════════════════════════════════
// Catálogo de Usinagem por nome de componente (SketchUp)
// ═══════════════════════════════════════════════════════

export function CfgUsinagemCatalog({ notify }) {
    const [catalog, setCatalog] = useState([]);
    const [maquinas, setMaquinas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState(null);   // null | 'new' | entry_obj
    const [search, setSearch] = useState('');

    const load = () => {
        setLoading(true);
        api.get('/cnc/usinagem-catalog')
            .then(d => { setCatalog(d); setLoading(false); })
            .catch(() => setLoading(false));
    };
    useEffect(() => {
        load();
        api.get('/cnc/maquinas').then(d => setMaquinas(Array.isArray(d) ? d : [])).catch(() => setMaquinas([]));
    }, []);

    const save = async (data) => {
        try {
            if (data.id) {
                await api.put(`/cnc/usinagem-catalog/${data.id}`, data);
                notify('Entrada atualizada');
            } else {
                await api.post('/cnc/usinagem-catalog', data);
                notify('Entrada criada');
            }
            setModal(null);
            load();
        } catch (err) { notify(err.error || err.message || 'Erro ao salvar', 'error'); }
    };

    const del = async (id) => {
        if (!confirm('Excluir esta entrada do catálogo?')) return;
        try {
            await api.del(`/cnc/usinagem-catalog/${id}`);
            notify('Entrada excluída');
            load();
        } catch (err) { notify('Erro ao excluir', 'error'); }
    };

    const toggleAtivo = async (entry) => {
        try {
            await api.put(`/cnc/usinagem-catalog/${entry.id}`, { ativo: entry.ativo ? 0 : 1 });
            load();
        } catch (err) { notify('Erro', 'error'); }
    };

    const filtered = catalog.filter(e =>
        !search || e.component_name.toLowerCase().includes(search.toLowerCase()) ||
        (e.descricao || '').toLowerCase().includes(search.toLowerCase())
    );

    const newEntry = () => setModal({
        component_name: '',
        tem_padrao: 1,
        profundidade: '',
        profundidade_modo: 'fixa',
        profundidade_percentual: '',
        profundidade_extra: '',
        diametro: '',
        largura: '',
        metodo: '',
        material_match: '',
        maquina_id: '',
        face_match: '',
        tool_code: '',
        rpm: '',
        feed_rate: '',
        stepover_pct: '',
        passes_acabamento: '',
        borda_min: '',
        prioridade: 5,
        descricao: '',
        ativo: 1,
    });

    return (
        <div className="glass-card p-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={18} style={{ color: 'var(--primary)' }} />
                    Catálogo de Usinagem por Componente ({catalog.length})
                </h3>
                <button onClick={newEntry} className={Z.btn}
                    style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Nova Entrada
                </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 8, lineHeight: 1.6 }}>
                Mapeia o <b>nome do componente SketchUp</b> (<code>definition.name</code>) para parâmetros de usinagem CNC.
                Quando o plugin exporta um worker com <code>component_name</code>, o sistema busca aqui e aplica automaticamente
                profundidade, método, diâmetro, ferramenta, rpm/feed e filtros de máquina/material/face. <b>Tem padrão = Sim</b>: usa os valores do catálogo.
                <b> Não</b>: reconhece o componente mas usa a geometria do plugin como-está (rebaixo livre, etc.).
                Prioridade: <b>Painel de Overrides {'>'} Catálogo {'>'} geometria do plugin</b>.
            </div>

            {/* Busca */}
            <div style={{ marginBottom: 12, position: 'relative' }}>
                <SearchIcon size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    className={Z.inp}
                    placeholder="Buscar por nome de componente ou descrição..."
                    style={{ paddingLeft: 30, fontSize: 12 }}
                />
            </div>

            {loading ? <Spinner text="Carregando catálogo..." /> : filtered.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    {catalog.length === 0 ? (
                        <>
                            <Layers size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <div>Nenhuma entrada no catálogo.</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>
                                Crie entradas para mapear nomes de componentes SketchUp a parâmetros CNC.
                            </div>
                        </>
                    ) : <div>Nenhum resultado para "{search}"</div>}
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
                        <thead>
                            <tr>
                                {['Componente (SketchUp)', 'Padrão', 'Método', 'Prof.', 'Ø', 'Ferramenta', 'Máquina', 'Material', 'Prior.', 'Ativo', 'Ações'].map(h => (
                                    <th key={h} className={Z.th} style={{ padding: '5px 8px', fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((e, i) => (
                                <tr key={e.id} style={{ background: i % 2 ? 'var(--bg-muted)' : 'transparent', opacity: e.ativo ? 1 : 0.45 }}>
                                    <td style={{ padding: '5px 8px', fontWeight: 700, fontFamily: 'monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={e.component_name}>
                                        {e.component_name}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                        <span style={{
                                            fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                                            background: e.tem_padrao ? '#d1fae5' : '#fef3c7',
                                            color: e.tem_padrao ? '#065f46' : '#92400e',
                                        }}>
                                            {e.tem_padrao ? 'Sim' : 'Não'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace' }}>
                                        {e.metodo || 'auto'}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace' }}>
                                        {e.profundidade_modo === 'percentual_espessura'
                                            ? `${e.profundidade_percentual || '—'}%`
                                            : e.profundidade_modo === 'atravessar'
                                                ? 'atravessar'
                                                : e.profundidade_modo === 'nao_atravessar'
                                                    ? `${e.profundidade ?? 'auto'}mm máx.`
                                                    : e.profundidade != null ? `${e.profundidade}mm` : 'plugin'}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace' }}>
                                        {e.diametro != null ? `Ø${e.diametro}` : '—'}
                                    </td>
                                    <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 10 }}>
                                        {e.tool_code || '—'}
                                    </td>
                                    <td style={{ padding: '5px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {e.maquina_id ? (maquinas.find(m => Number(m.id) === Number(e.maquina_id))?.nome || `#${e.maquina_id}`) : 'Todas'}
                                    </td>
                                    <td style={{ padding: '5px 8px', color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={e.material_match || e.descricao}>
                                        {e.material_match || 'Todos'}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                        {e.prioridade ?? 5}
                                    </td>
                                    <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                        <button onClick={() => toggleAtivo(e)}
                                            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}
                                            title={e.ativo ? 'Desativar' : 'Ativar'}>
                                            {e.ativo
                                                ? <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                                                : <Circle size={14} style={{ color: 'var(--text-muted)' }} />}
                                        </button>
                                    </td>
                                    <td style={{ padding: '5px 8px' }}>
                                        <div style={{ display: 'flex', gap: 3 }}>
                                            <button onClick={() => setModal({ ...e })} className={Z.btn2} style={{ padding: '2px 6px' }}
                                                title="Editar"><Edit size={11} /></button>
                                            <button onClick={() => del(e.id)} className={Z.btnD} style={{ padding: '2px 6px' }}
                                                title="Excluir"><Trash2 size={11} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && (
                <CatalogModal
                    data={modal}
                    maquinas={maquinas}
                    onSave={save}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    );
}

function CatalogModal({ data, maquinas = [], onSave, onClose }) {
    const [f, setF] = useState({ ...data });
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
    const num = (v) => v === '' || v == null ? null : Number(v);

    const handleSave = () => {
        if (!f.component_name?.trim()) return alert('Nome do componente é obrigatório');
        onSave({
            ...f,
            profundidade: num(f.profundidade),
            profundidade_percentual: num(f.profundidade_percentual),
            profundidade_extra: num(f.profundidade_extra),
            diametro: num(f.diametro),
            largura: num(f.largura),
            maquina_id: num(f.maquina_id),
            rpm: num(f.rpm),
            feed_rate: num(f.feed_rate),
            stepover_pct: num(f.stepover_pct),
            passes_acabamento: num(f.passes_acabamento),
            borda_min: num(f.borda_min),
            prioridade: num(f.prioridade) ?? 5,
        });
    };

    return (
        <Modal title={f.id ? 'Editar Entrada do Catálogo' : 'Nova Entrada do Catálogo'} close={onClose} w={760}>
            {/* Nome do componente */}
            <div style={{ marginBottom: 14 }}>
                <label className={Z.lbl}>Nome do Componente SketchUp <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                    value={f.component_name || ''}
                    onChange={e => upd('component_name', e.target.value)}
                    className={Z.inp}
                    placeholder="Ex: Dobradiça 35mm, Cavilha 8x35, Rasgo Gaveta..."
                    autoFocus
                />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    Pode corresponder exatamente ao <code>definition.name</code> ou usar <code>*</code> como curinga. Ex: <code>Dobradiça*</code>.
                </div>
            </div>

            {/* Tem padrão */}
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!f.tem_padrao}
                        onChange={e => upd('tem_padrao', e.target.checked ? 1 : 0)}
                        style={{ marginTop: 2 }} />
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>Tem Padrão (usa parâmetros do catálogo)</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2 }}>
                            <b>Marcado:</b> os parâmetros abaixo substituem os do plugin (método, profundidade, diâmetro, ferramenta, rpm/feed).<br />
                            <b>Desmarcado:</b> o componente é reconhecido mas os parâmetros do plugin são usados como-estão
                            (ideal para rebaixos/fresagens livres que variam por projeto).
                        </div>
                    </div>
                </label>
            </div>

            {/* Parâmetros — só relevantes quando tem_padrao = true */}
            <div style={{ opacity: f.tem_padrao ? 1 : 0.5, pointerEvents: f.tem_padrao ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Parâmetros do Catálogo {!f.tem_padrao && <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(ignorados quando "Tem Padrão" está desmarcado)</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                        <label className={Z.lbl}>Método</label>
                        <select value={f.metodo || ''} onChange={e => upd('metodo', e.target.value)} className={Z.inp}>
                            <option value="">Automático</option>
                            <option value="drill">Furo direto</option>
                            <option value="helical">Furo helicoidal</option>
                            <option value="circular">Interpolação circular</option>
                            <option value="pocket_zigzag">Rebaixo zig-zag</option>
                            <option value="pocket_espiral">Rebaixo espiral</option>
                            <option value="groove">Rasgo/canal</option>
                            <option value="multi_pass">Rasgo multipasse</option>
                            <option value="milling_path">Caminho fresado</option>
                        </select>
                    </div>
                    <div>
                        <label className={Z.lbl}>Profundidade</label>
                        <select value={f.profundidade_modo || 'fixa'} onChange={e => upd('profundidade_modo', e.target.value)} className={Z.inp}>
                            <option value="fixa">Fixa em mm</option>
                            <option value="plugin">Usar plugin</option>
                            <option value="percentual_espessura">% da espessura</option>
                            <option value="nao_atravessar">Nunca vazar</option>
                            <option value="atravessar">Atravessar chapa</option>
                        </select>
                    </div>
                    <div>
                        <label className={Z.lbl}>Valor mm</label>
                        <input type="number" value={f.profundidade ?? ''} step="0.1" min="0"
                            onChange={e => upd('profundidade', e.target.value)}
                            className={Z.inp} placeholder="Ex: 13.0" />
                    </div>
                    <div>
                        <label className={Z.lbl}>% espessura</label>
                        <input type="number" value={f.profundidade_percentual ?? ''} step="1" min="0" max="120"
                            onChange={e => upd('profundidade_percentual', e.target.value)}
                            className={Z.inp} placeholder="Ex: 70" />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                        <label className={Z.lbl}>Diâmetro (mm)</label>
                        <input type="number" value={f.diametro ?? ''} step="0.5" min="0"
                            onChange={e => upd('diametro', e.target.value)}
                            className={Z.inp} placeholder="Ex: 35.0" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Largura (mm)</label>
                        <input type="number" value={f.largura ?? ''} step="0.5" min="0"
                            onChange={e => upd('largura', e.target.value)}
                            className={Z.inp} placeholder="Opcional" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Extra prof. (mm)</label>
                        <input type="number" value={f.profundidade_extra ?? ''} step="0.1"
                            onChange={e => upd('profundidade_extra', e.target.value)}
                            className={Z.inp} placeholder="Ex: 0.2" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Borda/fundo seg. (mm)</label>
                        <input type="number" value={f.borda_min ?? ''} step="0.1" min="0"
                            onChange={e => upd('borda_min', e.target.value)}
                            className={Z.inp} placeholder="Ex: 0.5" />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                        <label className={Z.lbl}>Ferramenta (tool_code)</label>
                        <input value={f.tool_code || ''}
                            onChange={e => upd('tool_code', e.target.value)}
                            className={Z.inp} placeholder="Ex: broca_35mm, fresa_8mm" />
                    </div>
                    <div>
                        <label className={Z.lbl}>RPM</label>
                        <input type="number" value={f.rpm ?? ''} step="100" min="0"
                            onChange={e => upd('rpm', e.target.value)}
                            className={Z.inp} placeholder="Ex: 8000" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Feed Rate (mm/min)</label>
                        <input type="number" value={f.feed_rate ?? ''} step="100" min="0"
                            onChange={e => upd('feed_rate', e.target.value)}
                            className={Z.inp} placeholder="Ex: 3000" />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                        <label className={Z.lbl}>Máquina</label>
                        <select value={f.maquina_id ?? ''} onChange={e => upd('maquina_id', e.target.value)} className={Z.inp}>
                            <option value="">Todas</option>
                            {maquinas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={Z.lbl}>Material</label>
                        <input value={f.material_match || ''}
                            onChange={e => upd('material_match', e.target.value)}
                            className={Z.inp} placeholder="Ex: MDF, TX, Freijó*" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Face/Lado</label>
                        <select value={f.face_match || ''} onChange={e => upd('face_match', e.target.value)} className={Z.inp}>
                            <option value="">Qualquer</option>
                            <option value="A,side_a,top">Face A / topo</option>
                            <option value="B,side_b,bottom">Face B / fundo</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                        <label className={Z.lbl}>Step-over (%)</label>
                        <input type="number" value={f.stepover_pct ?? ''} step="5" min="5" max="95"
                            onChange={e => upd('stepover_pct', e.target.value)}
                            className={Z.inp} placeholder="Máquina" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Passes acabamento</label>
                        <input type="number" value={f.passes_acabamento ?? ''} step="1" min="0"
                            onChange={e => upd('passes_acabamento', e.target.value)}
                            className={Z.inp} placeholder="Máquina" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Prioridade</label>
                        <input type="number" value={f.prioridade ?? 5} step="1" min="0"
                            onChange={e => upd('prioridade', e.target.value)}
                            className={Z.inp} placeholder="5" />
                    </div>
                </div>
            </div>

            {/* Descrição */}
            <div style={{ marginBottom: 14 }}>
                <label className={Z.lbl}>Descrição / Observações</label>
                <input value={f.descricao || ''}
                    onChange={e => upd('descricao', e.target.value)}
                    className={Z.inp} placeholder="Ex: Dobradiça Grass de 35mm — profundidade de copo padrão 13mm" />
            </div>

            {/* Ativo */}
            <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!f.ativo} onChange={e => upd('ativo', e.target.checked ? 1 : 0)} />
                    Entrada ativa (ignorada na geração de G-code se desativada)
                </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                <button onClick={handleSave} className={Z.btn}>Salvar</button>
            </div>
        </Modal>
    );
}

// Retalhos
