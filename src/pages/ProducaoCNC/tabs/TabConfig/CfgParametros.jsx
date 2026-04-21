// Extraído automaticamente de ProducaoCNC.jsx (linhas 12592-12661).
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

export function CfgParametros({ notify }) {
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
