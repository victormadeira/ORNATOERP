// Extraído automaticamente de ProducaoCNC.jsx (linhas 12393-12591).
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

export function CfgFerramentas({ maquinaId, notify }) {
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
