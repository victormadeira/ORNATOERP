// NÃO USADO — mantido pra histórico. Nunca foi renderizado no JSX.
// Extraído automaticamente de ProducaoCNC.jsx (linhas 10448-10678).
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

export function TabMateriais({ notify }) {
    const [materiais, setMateriais] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [editando, setEditando] = useState(null); // null=fechado, {}=novo, {...}=editar
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { setMateriais(await api.get('/cnc/materiais?ativo=1')); }
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
        try {
            await api.del(`/cnc/materiais/${id}`);
            notify?.('Material desativado');
            load();
        } catch (err) {
            notify?.('Erro ao desativar material: ' + (err.message || ''), 'error');
        }
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
    const VEIO_LABELS = { sem_veio: 'Sem veio', com_veio: 'Com veio', horizontal: 'Com veio', vertical: 'Com veio' };

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
                                    { v: 'sem_veio', l: 'Sem veio (permite rotação)' },
                                    { v: 'com_veio', l: 'Com veio (não rotaciona)' },
                                ]} />
                                <EF label="Melamina" field="melamina" opts={[
                                    { v: 'ambos', l: '● Ambos os lados' },
                                    { v: 'face_a', l: '▲ Apenas Face A (topo)' },
                                    { v: 'face_b', l: '▼ Apenas Face B (fundo)' },
                                    { v: 'cru', l: '□ Cru (sem melamina)' },
                                ]} />
                                <EF label="Cor / Acabamento" field="cor" />
                                <EF label="Rotação" field="permitir_rotacao" opts={[
                                    { v: -1, l: '↺ Automático (com veio=não, sem veio=sim)' },
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

