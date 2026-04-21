// Extraído automaticamente de ProducaoCNC.jsx (linhas 12243-12392).
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

export function CfgChapas({ notify }) {
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
        try {
            await api.del(`/cnc/chapas/${id}`);
            notify('Chapa excluída');
            load();
        } catch (err) {
            notify('Erro ao excluir chapa: ' + (err.message || err.error || ''), 'error');
        }
    };

    return (
        <div className="glass-card p-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700 }}>Chapas Cadastradas</h3>
                <button onClick={() => setModal({ nome: '', material_code: '', espessura_nominal: 18, espessura_real: 18, comprimento: 2750, largura: 1850, refilo: 10, veio: 'sem_veio', preco: 0, ativo: 1, direcao_corte: 'herdar', modo_corte: 'herdar' })}
                    className={Z.btn} style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Nova Chapa
                </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                    <thead>
                        <tr>
                            {['Nome', 'Código', 'Esp.Nom', 'Esp.Real', 'Comp', 'Larg', 'Refilo', 'Veio', 'Dir.Corte', 'Modo', 'Preço', 'Ações'].map(h => (
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
                                <td style={{ padding: '6px 8px' }}>
                                    {c.veio === 'sem_veio' || !c.veio ? <span style={{ color: 'var(--text-muted)' }}>—</span> :
                                     <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Com veio</span>}
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
                    <label className={Z.lbl}>Veio (fibra)</label>
                    <select value={f.veio === 'horizontal' || f.veio === 'vertical' || f.veio === 'com_veio' ? 'com_veio' : 'sem_veio'} onChange={e => upd('veio', e.target.value)} className={Z.inp}>
                        <option value="sem_veio">Sem veio (permite rotação)</option>
                        <option value="com_veio">Com veio (não rotaciona)</option>
                    </select>
                </div>
                <div><label className={Z.lbl}>Esp. Nominal (mm)</label><input type="number" value={f.espessura_nominal} onChange={e => upd('espessura_nominal', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Esp. Real (mm)</label><input type="number" value={f.espessura_real} onChange={e => upd('espessura_real', Number(e.target.value))} className={Z.inp} step="0.1" /></div>
                <div><label className={Z.lbl}>Comprimento (mm)</label><input type="number" value={f.comprimento} onChange={e => upd('comprimento', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Largura (mm)</label><input type="number" value={f.largura} onChange={e => upd('largura', Number(e.target.value))} className={Z.inp} /></div>
                <div><label className={Z.lbl}>Refilo (mm)</label><input type="number" value={f.refilo} onChange={e => upd('refilo', Number(e.target.value))} className={Z.inp} /></div>
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
