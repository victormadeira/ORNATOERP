// Extraído automaticamente de ProducaoCNC.jsx (linhas 12662-13286).
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
import { CfgFerramentas } from './CfgFerramentas.jsx';

export function CfgMaquinas({ notify }) {
    const [maquinas, setMaquinas] = useState([]);
    const [modal, setModal] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [cncConfirm, setCncConfirm] = useState(null); // { msg, title?, onOk }

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
        setCncConfirm({ msg: 'Excluir esta máquina e desvincular as ferramentas?', onOk: async () => {
            await api.del(`/cnc/maquinas/${id}`);
            notify('Máquina excluída');
            load();
        }});
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
                                        <CfgFerramentas maquinaId={m.id} maquina={m} notify={notify} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {modal && <MaquinaModal data={modal} onSave={save} onClose={() => setModal(null)} />}
            {cncConfirm && (
                <ConfirmModal title={cncConfirm.title || 'Confirmar'}
                    message={cncConfirm.msg}
                    onConfirm={() => { const fn = cncConfirm.onOk; setCncConfirm(null); fn(); }}
                    onCancel={() => setCncConfirm(null)} />
            )}
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
        capacidade_magazine: 35,
        operador: '',
        // Estratégia de face e tipo de máquina
        tipo: 'router', pode_virar: 0, estrategia_face: 'mais_usinagens',
        padrao: 0, ativo: 1,
        // Envio direto
        envio_tipo: '', envio_host: '', envio_porta: 21, envio_usuario: '', envio_senha: '', envio_pasta: '/',
    };
}

function MaquinaModal({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...newMaquinaDefaults(), ...data });
    const [secao, setSecao] = useState('geral');
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

    // ── Shared UI micro-components (used across múltiplas seções) ─────────────
    const GH = ({ icon, label }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 2 }}>
            <span style={{ fontSize: 13 }}>{icon}</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)', marginLeft: 4 }} />
        </div>
    );
    const StatusPill = ({ on }) => (
        <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
            letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
            background: on ? 'rgba(22,163,74,0.12)' : 'rgba(100,100,100,0.08)',
            border: `1px solid ${on ? 'rgba(22,163,74,0.35)' : 'rgba(100,100,100,0.20)'}`,
            color: on ? '#15803d' : 'var(--text-muted)',
            transition: 'all 0.15s',
        }}>
            {on ? 'Ativo' : 'Inativo'}
        </span>
    );
    const StrategyCard = ({ title, desc, checked, onChange, children }) => (
        <div style={{
            borderRadius: 8, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
            background: checked ? 'color-mix(in srgb, var(--primary) 5%, var(--bg-muted))' : 'var(--bg-muted)',
            overflow: 'hidden', transition: 'border-color 0.15s, background 0.15s',
        }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={onChange} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
                <StatusPill on={checked} />
            </label>
            {desc && (
                <div style={{ padding: '0 14px', paddingBottom: children ? 0 : 10 }}>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{desc}</p>
                </div>
            )}
            {children && (
                <div style={{
                    padding: '10px 14px 12px',
                    opacity: checked ? 1 : 0.45,
                    pointerEvents: checked ? 'auto' : 'none',
                    transition: 'opacity 0.15s',
                }}>
                    {children}
                </div>
            )}
        </div>
    );
    const InfoNote = ({ children }) => (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(100,100,100,0.06)', border: '1px dashed var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {children}
        </div>
    );
    const SectionLabel = ({ children }) => (
        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6, marginTop: 4 }}>
            {children}
        </div>
    );

    const secoes = [
        { id: 'geral',       lb: 'Geral',        ic: '🖥' },
        { id: 'gcode',       lb: 'G-code',        ic: '📄' },
        { id: 'velocidades', lb: 'Velocidades',   ic: '⚡' },
        { id: 'estrategias', lb: 'Estratégias',   ic: '⚙️' },
        { id: 'antiarrasto', lb: 'Anti-Arrasto',  ic: '🔒' },
        { id: 'exportacao',  lb: 'Exportação',    ic: '📤' },
        { id: 'formato',     lb: 'Formato',       ic: '📋' },
        { id: 'envio',       lb: 'Envio',         ic: '📡' },
    ];

    return (
        <Modal title={f.id ? `Editar Máquina: ${f.nome}` : 'Nova Máquina CNC'} close={onClose} w={680}>
            {/* Section pills with icons */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {secoes.map(s => (
                    <button key={s.id} onClick={() => setSecao(s.id)}
                        style={{
                            padding: '4px 12px', fontSize: 11, fontWeight: secao === s.id ? 700 : 500,
                            borderRadius: 20, cursor: 'pointer', transition: 'all .15s',
                            background: secao === s.id ? 'var(--primary)' : 'var(--bg-muted)',
                            color: secao === s.id ? '#fff' : 'var(--text-muted)',
                            border: 'none', display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                        <span style={{ fontSize: 12 }}>{s.ic}</span>
                        {s.lb}
                    </button>
                ))}
            </div>

            {secao === 'geral' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* ── Identificação ── */}
                    <GH icon="🏷" label="Identificação" />
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
                        <div><label className={Z.lbl}>Operador Padrão <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({'{operador}'} no pós-proc.)</span></label><input value={f.operador || ''} onChange={e => upd('operador', e.target.value)} className={Z.inp} placeholder="Nome do operador" /></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input type="checkbox" checked={f.padrao === 1} onChange={e => upd('padrao', e.target.checked ? 1 : 0)} />
                                Máquina Padrão
                            </label>
                        </div>
                    </div>

                    {/* ── Área útil e magazine ── */}
                    <GH icon="📐" label="Área Útil e Magazine" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                        <div><label className={Z.lbl}>Área X (mm)</label><input type="number" value={f.x_max} onChange={e => upd('x_max', Number(e.target.value))} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Área Y (mm)</label><input type="number" value={f.y_max} onChange={e => upd('y_max', Number(e.target.value))} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Altura Z (mm)</label><input type="number" value={f.z_max} onChange={e => upd('z_max', Number(e.target.value))} className={Z.inp} /></div>
                        <div>
                            <label className={Z.lbl}>Magazine (slots)</label>
                            <input type="number" value={f.capacidade_magazine ?? 35} onChange={e => upd('capacidade_magazine', Math.max(1, Number(e.target.value)))} className={Z.inp} min="1" max="200" step="1" />
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Nº de ferramentas no carrossel</div>
                        </div>
                    </div>

                    {/* ── Tipo e face ── */}
                    <GH icon="🔀" label="Tipo e Roteamento" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label className={Z.lbl}>Tipo de Máquina</label>
                            <select value={f.tipo || 'router'} onChange={e => upd('tipo', e.target.value)} className={Z.inp}>
                                <option value="router">CNC Router (nesting)</option>
                                <option value="centro_furacao">Centro de Furação</option>
                                <option value="router_furacao">Router + Furação combinada</option>
                                <option value="beam_saw">Beam Saw (serra)</option>
                            </select>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Define como peças são roteadas pra essa máquina</div>
                        </div>
                        <div>
                            <label className={Z.lbl}>Estratégia de Face</label>
                            <select value={f.estrategia_face || 'mais_usinagens'} onChange={e => upd('estrategia_face', e.target.value)} className={Z.inp}>
                                <option value="mais_usinagens">Lado com mais usinagens p/ cima</option>
                                <option value="menos_usinagens">Lado com menos usinagens p/ cima</option>
                                <option value="priorizar_furos">Priorizar furos (centro de furação)</option>
                                <option value="face_a_fixa">Sempre Face A</option>
                                <option value="face_b_fixa">Sempre Face B</option>
                            </select>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Qual face fica voltada para cima na CNC</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1/-1' }}>
                            <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input type="checkbox" checked={f.pode_virar === 1} onChange={e => upd('pode_virar', e.target.checked ? 1 : 0)} />
                                Operador vira a peça (faz os 2 lados)
                            </label>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Se desligado, usinagens do lado oposto são alertadas no plano</span>
                        </div>
                    </div>

                    {/* ── Origem e eixos ── */}
                    <GH icon="📍" label="Origem e Eixos" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
                                ? 'Z=0 no topo: profundidades serão negativas (ex: Z-15.7mm). Menos comum.'
                                : 'Z=0 na mesa: Z positivo = acima da mesa, corte passante = Z=0mm. Mais comum.'}
                        </div>
                        <div style={{ gridColumn: '1/-1', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input type="checkbox" checked={f.trocar_eixos_xy === 1} onChange={e => upd('trocar_eixos_xy', e.target.checked ? 1 : 0)} />
                                X = comprimento (inverter padrão)
                            </label>
                            <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input type="checkbox" checked={f.eixo_x_invertido === 1} onChange={e => upd('eixo_x_invertido', e.target.checked ? 1 : 0)} />
                                Eixo X invertido
                            </label>
                            <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input type="checkbox" checked={f.eixo_y_invertido === 1} onChange={e => upd('eixo_y_invertido', e.target.checked ? 1 : 0)} />
                                Eixo Y invertido
                            </label>
                        </div>
                        <div style={{ gridColumn: '1/-1', fontSize: 10, color: 'var(--text-muted)' }}>
                            {f.trocar_eixos_xy === 1
                                ? 'Modo alternativo: X = comprimento (maior), Y = largura (menor).'
                                : 'Padrão: X = largura (menor eixo), Y = comprimento (maior eixo). Mais comum em CNC.'}
                        </div>
                    </div>

                </div>
            )}

            {secao === 'gcode' && (() => {
                const [showVars, setShowVars] = useState(false);
                return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Variable hint box — collapsible */}
                    <div style={{ background: '#1e3a5f10', border: '1px solid #1e3a5f30', borderRadius: 8, overflow: 'hidden' }}>
                        <button
                            onClick={() => setShowVars(v => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                                cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--primary)',
                                textAlign: 'left', gap: 8,
                            }}>
                            <span>Variáveis disponíveis nos templates</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, transition: 'transform 0.2s', display: 'inline-block', transform: showVars ? 'rotate(180deg)' : 'none' }}>▼</span>
                        </button>
                        {showVars && (
                            <div style={{ padding: '0 12px 10px', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.8, borderTop: '1px solid #1e3a5f20' }}>
                                {[
                                    ['{chapa}', 'nº da chapa'], ['{material}', 'material'],
                                    ['{data}', ''], ['{hora}', ''], ['{maquina}', ''],
                                ].map(([v, d]) => (
                                    <span key={v}><span style={{ fontFamily: 'monospace', background: 'var(--bg-muted)', borderRadius: 3, padding: '0 4px', border: '1px solid var(--border)' }}>{v}</span>{d ? ` ${d}` : ''}&nbsp;&nbsp;</span>
                                ))}
                                <span style={{ color: 'var(--text-muted)' }}>— No comando de troca:&nbsp;</span>
                                {['{t}', '{rpm}', '{diametro}', '{nome}'].map(v => (
                                    <span key={v}><span style={{ fontFamily: 'monospace', background: 'var(--bg-muted)', borderRadius: 3, padding: '0 4px', border: '1px solid var(--border)' }}>{v}</span>&nbsp;&nbsp;</span>
                                ))}
                            </div>
                        )}
                    </div>
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
                        <div>
                            <label className={Z.lbl}>Troca Ferramenta <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(ex: <code>{'{t} M6'}</code> ou <code>M6</code>)</span></label>
                            <input value={f.troca_ferramenta_cmd} onChange={e => upd('troca_ferramenta_cmd', e.target.value)} className={Z.inp} placeholder="M6" />
                        </div>
                        <div>
                            <label className={Z.lbl}>Spindle ON <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(ex: <code>M3</code>, <code>M3 S{'{rpm}'}</code>)</span></label>
                            <input value={f.spindle_on_cmd} onChange={e => upd('spindle_on_cmd', e.target.value)} className={Z.inp} placeholder="M3" />
                        </div>
                        <div>
                            <label className={Z.lbl}>Spindle OFF</label>
                            <input value={f.spindle_off_cmd} onChange={e => upd('spindle_off_cmd', e.target.value)} className={Z.inp} placeholder="M5" />
                        </div>
                        <div><label className={Z.lbl}>Prefixo Comentário</label><input value={f.comentario_prefixo} onChange={e => upd('comentario_prefixo', e.target.value)} className={Z.inp} /></div>
                    </div>
                </div>
                );
            })()}

            {secao === 'velocidades' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* ── Movimento ── */}
                    <GH icon="🔄" label="Movimento" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div>
                            <label className={Z.lbl}>Vel. Vazio — G0 (mm/min)</label>
                            <input type="number" value={f.vel_vazio} onChange={e => upd('vel_vazio', Number(e.target.value))} className={Z.inp} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                                <input type="checkbox" checked={(f.g0_com_feed ?? 0) === 1} onChange={e => upd('g0_com_feed', e.target.checked ? 1 : 0)} />
                                Incluir F no G0 (vel. vazio)
                            </label>
                        </div>
                        <div><label className={Z.lbl}>RPM Padrão</label><input type="number" value={f.rpm_padrao} onChange={e => upd('rpm_padrao', Number(e.target.value))} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Dwell Spindle (s)</label><input type="number" value={f.dwell_spindle ?? 1} onChange={e => upd('dwell_spindle', Number(e.target.value))} className={Z.inp} step="0.5" min="0" /></div>
                    </div>

                    {/* ── Corte ── */}
                    <GH icon="✂️" label="Corte" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div><label className={Z.lbl}>Vel. Corte — G1 (mm/min)</label><input type="number" value={f.vel_corte} onChange={e => upd('vel_corte', Number(e.target.value))} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Vel. Aproximação (mm/min)</label><input type="number" value={f.vel_aproximacao} onChange={e => upd('vel_aproximacao', Number(e.target.value))} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Prof. Extra além do material (mm)</label><input type="number" value={f.profundidade_extra} onChange={e => upd('profundidade_extra', Number(e.target.value))} className={Z.inp} step="0.01" /></div>
                    </div>

                    {/* ── Alturas Z ── */}
                    <GH icon="📏" label="Alturas Z" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div><label className={Z.lbl}>Z Seguro — retração (mm)</label><input type="number" value={f.z_seguro} onChange={e => upd('z_seguro', Number(e.target.value))} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Z Aproximação (mm acima)</label><input type="number" value={f.z_aproximacao ?? 2} onChange={e => upd('z_aproximacao', Number(e.target.value))} className={Z.inp} step="0.5" min="0.5" /></div>
                    </div>

                    {/* ── Proteção da Mesa ── */}
                    <GH icon="🛡️" label="Proteção da Mesa de Sacrifício" />
                    <div style={{ padding: '10px 14px', background: '#ef444410', borderRadius: 8, border: '1px solid #ef444430' }}>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                            Limita a profundidade máxima de corte para não danificar a mesa de sacrifício.
                            Ex: chapa de 15mm com margem 0.5mm → profundidade máxima 15.5mm.
                            Qualquer operação que ultrapasse será automaticamente reduzida.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Margem além do material (mm)</label><input type="number" value={f.margem_mesa_sacrificio ?? 0.5} onChange={e => upd('margem_mesa_sacrificio', Number(e.target.value))} className={Z.inp} step="0.1" min="0" max="3" /></div>
                        </div>
                    </div>
                </div>
            )}

            {secao === 'estrategias' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* ── Entrada / Mergulho ── */}
                    <GH icon="↘️" label="Entrada e Mergulho" />

                    <div style={{ padding: '11px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Tipo de Rampa de Entrada</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <div>
                                <label className={Z.lbl}>Tipo</label>
                                <select value={f.rampa_tipo || 'linear'} onChange={e => upd('rampa_tipo', e.target.value)} className={Z.inp}>
                                    <option value="linear">Linear (diagonal)</option>
                                    <option value="helicoidal">Helicoidal (espiral)</option>
                                    <option value="plunge">Plunge direto</option>
                                </select>
                            </div>
                            <div><label className={Z.lbl}>Vel. Rampa (mm/min)</label><input type="number" value={f.vel_rampa ?? 1500} onChange={e => upd('vel_rampa', Number(e.target.value))} className={Z.inp} step="100" min="100" /></div>
                            <div><label className={Z.lbl}>Diâmetro Hélice (%)</label><input type="number" value={f.rampa_diametro_pct ?? 80} onChange={e => upd('rampa_diametro_pct', Number(e.target.value))} className={Z.inp} step="5" min="30" max="100" /></div>
                        </div>
                        <InfoNote>
                            <b>Linear</b>: desce em diagonal (canais). <b>Helicoidal</b>: desce em espiral (furos circulares). <b>Diâmetro Hélice</b>: % do diâmetro do furo para raio da espiral.
                        </InfoNote>
                    </div>

                    {/* ── Rebaixo / Pocket ── */}
                    <GH icon="⬛" label="Rebaixo (Pocket)" />

                    <div style={{ padding: '11px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
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
                        <StrategyCard
                            title="Passe de Acabamento no Pocket"
                            desc="Após o zigzag, faz uma passada final no contorno com velocidade reduzida para paredes limpas."
                            checked={(f.pocket_acabamento ?? 1) === 1}
                            onChange={e => upd('pocket_acabamento', e.target.checked ? 1 : 0)}
                        >
                            <div><label className={Z.lbl}>Offset acabamento (mm)</label><input type="number" value={f.pocket_acabamento_offset ?? 0.2} onChange={e => upd('pocket_acabamento_offset', Number(e.target.value))} className={Z.inp} step="0.05" min="0.05" max="2" /></div>
                        </StrategyCard>
                        <InfoNote>
                            <b>Stepover</b>: espaçamento entre passadas = % do diâmetro da fresa. 60% é ideal para MDF.
                        </InfoNote>
                    </div>

                    {/* ── Furos Circulares ── */}
                    <GH icon="⭕" label="Furos Circulares" />

                    <div style={{ padding: '11px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                            Quando não há broca do diâmetro exato, a fresa contorna o furo em círculo (G2/G3). Aplica-se a dobradiças (Ø35mm), minifix, etc.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Passes de acabamento</label><input type="number" value={f.circular_passes_acabamento ?? 1} onChange={e => upd('circular_passes_acabamento', Number(e.target.value))} className={Z.inp} min="0" max="5" /></div>
                            <div><label className={Z.lbl}>Offset desbaste (mm)</label><input type="number" value={f.circular_offset_desbaste ?? 0.3} onChange={e => upd('circular_offset_desbaste', Number(e.target.value))} className={Z.inp} step="0.05" min="0" max="2" /></div>
                        </div>
                        <InfoNote>
                            <b>Offset desbaste</b>: a fresa fica X mm afastada da parede final no desbaste. O passe de acabamento remove esse material com velocidade reduzida para dimensão precisa.
                        </InfoNote>
                    </div>

                    {/* ── Canais e Compensação ── */}
                    <GH icon="〰️" label="Canais e Compensação" />

                    <StrategyCard
                        title="Compensação de Raio em Canais"
                        desc="A fresa tem diâmetro > 0, então cantos de canais ficam arredondados. A compensação avança a fresa além do canto para que o espaço útil fique com cantos retos."
                        checked={(f.compensar_raio_canal ?? 1) === 1}
                        onChange={e => upd('compensar_raio_canal', e.target.checked ? 1 : 0)}
                    >
                        <div>
                            <label className={Z.lbl}>Tipo de Compensação</label>
                            <select value={f.compensacao_tipo || 'overcut'} onChange={e => upd('compensacao_tipo', e.target.value)} className={Z.inp}>
                                <option value="overcut">Overcut (avanço do raio)</option>
                                <option value="dogbone">Dog-bone (furo nos cantos)</option>
                            </select>
                        </div>
                    </StrategyCard>

                </div>
            )}

            {secao === 'antiarrasto' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* ── Parâmetros base ───────────────────────────────── */}
                    <GH icon="⚙️" label="Parâmetros Base" />

                    {/* Direção de Corte */}
                    <div style={{ padding: '11px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 7, color: 'var(--text-primary)' }}>Direção de Corte (Contorno Externo)</div>
                        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1.5px solid var(--border)' }}>
                            {[
                                { v: 'climb', label: 'Climb (CW)', sub: 'Melhor acabamento em MDF' },
                                { v: 'convencional', label: 'Convencional (CCW)', sub: 'Mais seguro com backlash' },
                            ].map(({ v, label, sub }) => {
                                const sel = (f.direcao_corte || 'climb') === v;
                                return (
                                    <button key={v} onClick={() => upd('direcao_corte', v)} style={{
                                        flex: 1, padding: '8px 10px', border: 'none', cursor: 'pointer',
                                        background: sel ? 'var(--primary)' : 'var(--bg)',
                                        color: sel ? '#fff' : 'var(--text-muted)',
                                        transition: 'all 0.15s',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                    }}>
                                        <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
                                        <span style={{ fontSize: 10, opacity: 0.75 }}>{sub}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Redução de Feed para peças pequenas */}
                    <div style={{ padding: '11px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Redução de Feed em Peças Pequenas</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Diminui a velocidade de corte para peças com área abaixo do limite, reduzindo a força lateral que causa arrasto.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Feed em peças pequenas (%)</label><input type="number" value={f.feed_rate_pct_pequenas ?? 50} onChange={e => upd('feed_rate_pct_pequenas', Number(e.target.value))} className={Z.inp} min={10} max={100} /></div>
                            <div><label className={Z.lbl}>Área máx. para redução (cm²)</label><input type="number" value={f.feed_rate_area_max ?? 500} onChange={e => upd('feed_rate_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>

                    {/* ── Fixação da peça ──────────────────────────────── */}
                    <GH icon="🔒" label="Fixação da Peça" />

                    {/* Onion-Skin */}
                    <StrategyCard
                        title="Onion-Skin (2 Passes de Profundidade)"
                        desc="Corta 95% da profundidade em todas as peças primeiro, depois volta e corta os últimos milímetros com velocidade reduzida. Mantém a chapa inteira durante o passe pesado."
                        checked={(f.usar_onion_skin ?? 1) === 1}
                        onChange={e => upd('usar_onion_skin', e.target.checked ? 1 : 0)}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div><label className={Z.lbl}>Espessura skin (mm)</label><input type="number" value={f.onion_skin_espessura ?? 0.5} onChange={e => upd('onion_skin_espessura', Number(e.target.value))} className={Z.inp} step="0.1" min="0.1" max="3" /></div>
                            <div><label className={Z.lbl}>Área máx. para onion (cm²)</label><input type="number" value={f.onion_skin_area_max ?? 500} onChange={e => upd('onion_skin_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                        <SectionLabel>Modo breakthrough</SectionLabel>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[
                                { v: 'diferido', label: 'Diferido', desc: 'Desbaste de todas → breakthrough no final' },
                                { v: 'por_peca', label: 'Por peça', desc: 'Desbaste + breakthrough imediato peça a peça' },
                            ].map(({ v, label, desc }) => {
                                const sel = (f.onion_skin_modo || 'diferido') === v;
                                return (
                                    <button key={v} onClick={() => upd('onion_skin_modo', v)} style={{
                                        flex: 1, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                                        border: `1.5px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                                        background: sel ? 'color-mix(in srgb, var(--primary) 10%, var(--bg))' : 'var(--bg)',
                                        display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
                                        transition: 'all 0.15s',
                                    }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: sel ? 'var(--primary)' : 'var(--text)' }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`, background: sel ? 'var(--primary)' : 'transparent', flexShrink: 0 }} />
                                            {label}
                                        </span>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, textAlign: 'left' }}>{desc}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </StrategyCard>

                    {/* Ordenação de Contornos */}
                    <div style={{ padding: '11px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>Ordenação de Contornos</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            O algoritmo combina área (60%) + distância das bordas (40%) para calcular o <b>Índice de Risco de Vácuo</b> e ordenar os cortes.
                        </p>
                        <select value={f.ordenar_contornos || 'menor_primeiro'} onChange={e => upd('ordenar_contornos', e.target.value)} className={Z.inp}>
                            <option value="menor_primeiro">Menor primeiro (+ risco de vácuo) — Recomendado</option>
                            <option value="maior_primeiro">Maior primeiro</option>
                            <option value="proximidade">Proximidade (menor G0) — Menos trocas de posição</option>
                        </select>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" style={{ marginTop: 2 }} checked={(f.ordenar_borda_primeiro ?? 0) === 1} onChange={e => upd('ordenar_borda_primeiro', e.target.checked ? 1 : 0)} />
                            <span>
                                <span style={{ fontWeight: 600 }}>Borda primeiro (critério secundário)</span>
                                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>
                                    Dentro do mesmo grupo de tamanho, peças mais próximas da borda são cortadas antes — as peças do centro ficam presas no vácuo mais tempo.
                                </span>
                            </span>
                        </label>
                        <div style={{ marginTop: 10 }}>
                            <div><label className={Z.lbl}>Z Aproximação Rápida entre operações próximas (mm acima)</label><input type="number" value={f.z_aproximacao_rapida ?? 5} onChange={e => upd('z_aproximacao_rapida', Number(e.target.value))} className={Z.inp} step="1" min="2" /></div>
                        </div>
                    </div>

                    {/* Entrada pelo interior */}
                    <StrategyCard
                        title="Entrada pelo Interior da Chapa"
                        desc="O contorno de cada peça sempre começa pelo canto mais próximo do centro da chapa. Ex: uma ripa na borda esquerda inicia pelo lado direito — a peça fica presa no vácuo até o último momento. Desative se a sua máquina exige ponto de entrada fixo."
                        checked={(f.entrada_pelo_interior ?? 1) === 1}
                        onChange={e => upd('entrada_pelo_interior', e.target.checked ? 1 : 0)}
                    />

                    {/* ── Entrada e saída da ferramenta ───────────────── */}
                    <GH icon="↪️" label="Entrada e Saída da Ferramenta" />

                    {/* Entrada em rampa */}
                    <StrategyCard
                        title="Entrada em Rampa (Ramp Entry)"
                        desc="Em vez de mergulhar direto no material, a fresa desce em ângulo ao longo da trajetória. Preserva a vida útil da ferramenta e evita marcas de entrada no acabamento."
                        checked={(f.usar_rampa ?? 1) === 1}
                        onChange={e => upd('usar_rampa', e.target.checked ? 1 : 0)}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Ângulo da rampa (°)</label><input type="number" value={f.rampa_angulo ?? 3} onChange={e => upd('rampa_angulo', Number(e.target.value))} className={Z.inp} step="0.5" min="1" max="15" /></div>
                            <div><label className={Z.lbl}>Vel. Mergulho (mm/min)</label><input type="number" value={f.vel_mergulho ?? 1500} onChange={e => upd('vel_mergulho', Number(e.target.value))} className={Z.inp} step="100" min="100" /></div>
                        </div>
                    </StrategyCard>

                    {/* Lead-in */}
                    <StrategyCard
                        title="Lead-in (Entrada Tangente)"
                        desc="Nunca mergulha direto na linha de corte — entra pela área de desperdício com arco tangente. Elimina marcas de entrada no contorno."
                        checked={(f.usar_lead_in ?? 1) === 1}
                        onChange={e => upd('usar_lead_in', e.target.checked ? 1 : 0)}
                    >
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
                    </StrategyCard>

                    {/* Lead-out */}
                    <StrategyCard
                        title="Lead-out Tangencial (Saída Suave)"
                        desc="Após fechar o contorno, a fresa sai tangencialmente antes de retrair — elimina a marca de dwell no ponto de fechamento."
                        checked={(f.usar_lead_out ?? 0) === 1}
                        onChange={e => upd('usar_lead_out', e.target.checked ? 1 : 0)}
                    >
                        <div><label className={Z.lbl}>Distância de saída (mm)</label><input type="number" value={f.lead_out_raio ?? 3} onChange={e => upd('lead_out_raio', Number(e.target.value))} className={Z.inp} step="0.5" min="1" max="20" /></div>
                    </StrategyCard>

                    {/* ── Cantos e acabamento ──────────────────────────── */}
                    <GH icon="🔲" label="Cantos e Acabamento" />

                    {/* Feed adaptativo em cantos */}
                    <StrategyCard
                        title="Feed Adaptativo em Cantos"
                        desc="Reduz o feed nos últimos milímetros antes de cada canto de 90°, evitando micro-pausa do bloco look-ahead e irregularidade nas quinas."
                        checked={(f.usar_feed_cantos ?? 0) === 1}
                        onChange={e => upd('usar_feed_cantos', e.target.checked ? 1 : 0)}
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Feed nos cantos (%)</label><input type="number" value={f.feed_cantos_pct ?? 60} onChange={e => upd('feed_cantos_pct', Number(e.target.value))} className={Z.inp} step="5" min="20" max="90" /></div>
                            <div><label className={Z.lbl}>Distância antes do canto (mm)</label><input type="number" value={f.feed_cantos_dist ?? 8} onChange={e => upd('feed_cantos_dist', Number(e.target.value))} className={Z.inp} step="1" min="2" max="30" /></div>
                        </div>
                    </StrategyCard>

                    {/* Arc blending em cantos */}
                    <StrategyCard
                        title="Arc Blending em Cantos (G2/G3)"
                        desc="Substitui os cantos de 90° por pequenos arcos G2/G3 — elimina vibração por mudança brusca de direção e melhora o acabamento de superfície, especialmente em MDF."
                        checked={(f.usar_arc_corners ?? 0) === 1}
                        onChange={e => upd('usar_arc_corners', e.target.checked ? 1 : 0)}
                    >
                        <div><label className={Z.lbl}>Raio do arco de canto (mm)</label><input type="number" value={f.arc_corners_raio ?? 0.8} onChange={e => upd('arc_corners_raio', Number(e.target.value))} className={Z.inp} step="0.1" min="0.2" max="5" /></div>
                    </StrategyCard>

                    {/* Tabs note */}
                    <InfoNote>
                        <b>Tabs / Micro-juntas</b> desativadas para MDF melamínico — quebrar tabs pode lascar a face e gerar retrabalho. As estratégias acima (small-first, onion-skin, feed reduzido) substituem as pontes com melhor resultado.
                    </InfoNote>

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
