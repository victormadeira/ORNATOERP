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
            {/* Custos e tempo de corte */}
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                    Custos e Tempo de Corte (Tab Custos)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <div>
                        <label className={Z.lbl}>Vel. corte contorno (mm/min)</label>
                        <input type="number" value={cfg.velocidade_corte ?? 8000} onChange={e => upd('velocidade_corte', Number(e.target.value))} className={Z.inp} step="500" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Vel. usinagem interna (mm/min)</label>
                        <input type="number" value={cfg.velocidade_usinagem ?? 3000} onChange={e => upd('velocidade_usinagem', Number(e.target.value))} className={Z.inp} step="200" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Velocidade rápido (mm/min)</label>
                        <input type="number" value={cfg.velocidade_rapido ?? 20000} onChange={e => upd('velocidade_rapido', Number(e.target.value))} className={Z.inp} step="1000" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Setup por chapa (min)</label>
                        <input type="number" value={cfg.tempo_setup_chapa ?? 3} onChange={e => upd('tempo_setup_chapa', Number(e.target.value))} className={Z.inp} step="0.5" min="0" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Custo/hora máquina (R$)</label>
                        <input type="number" value={cfg.custo_hora_maquina ?? 80} onChange={e => upd('custo_hora_maquina', Number(e.target.value))} className={Z.inp} step="5" min="0" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Custo troca ferramenta (R$)</label>
                        <input type="number" value={cfg.custo_troca_ferramenta ?? 5} onChange={e => upd('custo_troca_ferramenta', Number(e.target.value))} className={Z.inp} step="1" min="0" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Fita de borda (R$/m linear)</label>
                        <input type="number" value={cfg.custo_borda_linear ?? 0.5} onChange={e => upd('custo_borda_linear', Number(e.target.value))} className={Z.inp} step="0.1" min="0" />
                    </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                    Velocidades usadas na estimativa de tempo da aba Custos. A velocidade real pode variar — configure com base nos parâmetros da sua máquina.
                    Setup inclui tempo de fixação, referenciamento e troca de material.
                </div>
            </div>

            {/* Estratégia de Face */}
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Estratégia de Face (qual lado fica voltado para cima na CNC)</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Define qual face da peça a CNC usina primeiro. Afeta a qualidade do corte, aderência ao vácuo e o resultado visual das faces A e B.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                        { value: 'auto', label: 'Auto — Sistema decide', desc: 'A face maior (em área de usinagem) fica para cima. Comportamento padrão.' },
                        { value: 'sempre_a', label: 'Sempre Face A para cima', desc: 'Face A (principal, geralmente a mais nobre) sempre virada para a fresa.' },
                        { value: 'sempre_b', label: 'Sempre Face B para cima', desc: 'Face B sempre virada para a fresa. Útil quando o verso tem mais operações.' },
                        { value: 'mais_usinagens', label: 'Face com mais operações para cima', desc: 'O lado com mais furos/rebaixos fica para cima — maior área de contato com o vácuo na face oposta.' },
                        { value: 'menos_usinagens', label: 'Face com menos operações para cima', desc: 'O lado mais plano fica para cima — corte mais limpo na face inferior (saída da fresa).' },
                        { value: 'menor_profundidade', label: 'Face com menor profundidade de corte para cima', desc: 'O lado com usinagens mais rasas fica para cima — reduz esforço da fresa e lascamento na entrada.' },
                    ].map(opt => (
                        <label key={opt.value} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
                            background: (cfg.estrategia_face ?? 'auto') === opt.value ? 'var(--bg-body)' : 'transparent',
                            borderRadius: 6, cursor: 'pointer',
                            border: (cfg.estrategia_face ?? 'auto') === opt.value ? '1px solid var(--primary, #1379F0)' : '1px solid transparent',
                            transition: 'background 0.15s, border-color 0.15s',
                        }}>
                            <input
                                type="radio"
                                name="estrategia_face"
                                value={opt.value}
                                checked={(cfg.estrategia_face ?? 'auto') === opt.value}
                                onChange={() => upd('estrategia_face', opt.value)}
                                style={{ marginTop: 2, flexShrink: 0 }}
                            />
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                            </div>
                        </label>
                    ))}
                </div>
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
