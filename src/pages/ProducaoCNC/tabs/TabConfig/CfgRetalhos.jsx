// Extraído automaticamente de ProducaoCNC.jsx (linhas 13585-13639).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect, ConfirmModal } from '../../../../ui';
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

export function CfgRetalhos({ notify }) {
    const [retalhos, setRetalhos] = useState([]);
    const [cncConfirm, setCncConfirm] = useState(null); // { msg, title?, onOk }
    const load = () => api.get('/cnc/retalhos').then(setRetalhos).catch(e => notify(e.error || 'Erro ao carregar retalhos'));
    useEffect(() => { load(); }, []);

    const del = async (id) => {
        setCncConfirm({ msg: 'Marcar este retalho como indisponível?', onOk: async () => {
            await api.del(`/cnc/retalhos/${id}`);
            notify('Retalho removido');
            load();
        }});
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
            {cncConfirm && (
                <ConfirmModal title={cncConfirm.title || 'Confirmar'}
                    message={cncConfirm.msg}
                    onConfirm={() => { const fn = cncConfirm.onOk; setCncConfirm(null); fn(); }}
                    onCancel={() => setCncConfirm(null)} />
            )}
        </div>
    );
}
