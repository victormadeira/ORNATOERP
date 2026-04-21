// Extraído automaticamente de ProducaoCNC.jsx (linhas 12662-13286).
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
import { CfgFerramentas } from './CfgFerramentas.jsx';

export function CfgMaquinas({ notify }) {
    const [maquinas, setMaquinas] = useState([]);
    const [modal, setModal] = useState(null);
    const [expandedId, setExpandedId] = useState(null);

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
        if (!confirm('Excluir esta máquina e desvincular as ferramentas?')) return;
        await api.del(`/cnc/maquinas/${id}`);
        notify('Máquina excluída');
        load();
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
                                        <CfgFerramentas maquinaId={m.id} notify={notify} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {modal && <MaquinaModal data={modal} onSave={save} onClose={() => setModal(null)} />}
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
        padrao: 0, ativo: 1,
        // Envio direto
        envio_tipo: '', envio_host: '', envio_porta: 21, envio_usuario: '', envio_senha: '', envio_pasta: '/',
    };
}

function MaquinaModal({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...newMaquinaDefaults(), ...data });
    const [secao, setSecao] = useState('geral');
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

    const secoes = [
        { id: 'geral', lb: 'Geral' },
        { id: 'gcode', lb: 'G-code / Pós-processador' },
        { id: 'velocidades', lb: 'Velocidades' },
        { id: 'estrategias', lb: 'Estratégias Usinagem' },
        { id: 'antiarrasto', lb: 'Anti-Arrasto' },
        { id: 'exportacao', lb: 'Exportação' },
        { id: 'formato', lb: 'Formato' },
        { id: 'envio', lb: 'Envio Direto' },
    ];

    return (
        <Modal title={f.id ? `Editar Máquina: ${f.nome}` : 'Nova Máquina CNC'} close={onClose} w={680}>
            {/* Section pills */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {secoes.map(s => (
                    <button key={s.id} onClick={() => setSecao(s.id)}
                        style={{
                            padding: '4px 12px', fontSize: 11, fontWeight: secao === s.id ? 700 : 500,
                            borderRadius: 20, cursor: 'pointer', transition: 'all .15s',
                            background: secao === s.id ? 'var(--primary)' : 'var(--bg-muted)',
                            color: secao === s.id ? '#fff' : 'var(--text-muted)',
                            border: 'none',
                        }}>
                        {s.lb}
                    </button>
                ))}
            </div>

            {secao === 'geral' && (
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
                    <div><label className={Z.lbl}>Área X (mm)</label><input type="number" value={f.x_max} onChange={e => upd('x_max', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Área Y (mm)</label><input type="number" value={f.y_max} onChange={e => upd('y_max', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Altura Z (mm)</label><input type="number" value={f.z_max} onChange={e => upd('z_max', Number(e.target.value))} className={Z.inp} /></div>
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
                            ? 'Z=0 no topo: profundidades serao negativas (ex: Z-15.7mm). Menos comum.'
                            : 'Z=0 na mesa: Z positivo = acima da mesa, corte passante = Z=0mm. Mais comum.'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.padrao === 1} onChange={e => upd('padrao', e.target.checked ? 1 : 0)} />
                            Máquina Padrão
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.trocar_eixos_xy === 1} onChange={e => upd('trocar_eixos_xy', e.target.checked ? 1 : 0)} />
                            X = comprimento (inverter padrao)
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.eixo_x_invertido === 1} onChange={e => upd('eixo_x_invertido', e.target.checked ? 1 : 0)} />
                            Eixo X invertido
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={f.eixo_y_invertido === 1} onChange={e => upd('eixo_y_invertido', e.target.checked ? 1 : 0)} />
                            Eixo Y invertido
                        </label>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: -6 }}>
                        {f.trocar_eixos_xy === 1
                            ? 'Modo alternativo: X = comprimento (maior), Y = largura (menor).'
                            : 'Padrao: X = largura (menor eixo), Y = comprimento (maior eixo). Mais comum em CNC.'}
                    </div>
                </div>
            )}

            {secao === 'gcode' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                        <div><label className={Z.lbl}>Cmd Troca Ferramenta</label><input value={f.troca_ferramenta_cmd} onChange={e => upd('troca_ferramenta_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Cmd Spindle ON</label><input value={f.spindle_on_cmd} onChange={e => upd('spindle_on_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Cmd Spindle OFF</label><input value={f.spindle_off_cmd} onChange={e => upd('spindle_off_cmd', e.target.value)} className={Z.inp} /></div>
                        <div><label className={Z.lbl}>Prefixo Comentário</label><input value={f.comentario_prefixo} onChange={e => upd('comentario_prefixo', e.target.value)} className={Z.inp} /></div>
                    </div>
                </div>
            )}

            {secao === 'velocidades' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label className={Z.lbl}>Z Seguro (mm)</label><input type="number" value={f.z_seguro} onChange={e => upd('z_seguro', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>RPM Padrão</label><input type="number" value={f.rpm_padrao} onChange={e => upd('rpm_padrao', Number(e.target.value))} className={Z.inp} /></div>
                    <div>
                        <label className={Z.lbl}>Vel. Vazio (mm/min)</label>
                        <input type="number" value={f.vel_vazio} onChange={e => upd('vel_vazio', Number(e.target.value))} className={Z.inp} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                            <input type="checkbox" checked={(f.g0_com_feed ?? 0) === 1} onChange={e => upd('g0_com_feed', e.target.checked ? 1 : 0)} />
                            Incluir F no G0 (vel. vazio)
                        </label>
                    </div>
                    <div><label className={Z.lbl}>Vel. Corte (mm/min)</label><input type="number" value={f.vel_corte} onChange={e => upd('vel_corte', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Vel. Aproximação (mm/min)</label><input type="number" value={f.vel_aproximacao} onChange={e => upd('vel_aproximacao', Number(e.target.value))} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Prof. Extra (mm)</label><input type="number" value={f.profundidade_extra} onChange={e => upd('profundidade_extra', Number(e.target.value))} className={Z.inp} step="0.01" /></div>
                    <div><label className={Z.lbl}>Z Aproximação (mm acima)</label><input type="number" value={f.z_aproximacao ?? 2} onChange={e => upd('z_aproximacao', Number(e.target.value))} className={Z.inp} step="0.5" min="0.5" /></div>
                    <div><label className={Z.lbl}>Dwell Spindle (s)</label><input type="number" value={f.dwell_spindle ?? 1} onChange={e => upd('dwell_spindle', Number(e.target.value))} className={Z.inp} step="0.5" min="0" /></div>
                    <div style={{ gridColumn: '1/-1', padding: '10px 14px', background: '#ef444415', borderRadius: 8, border: '1px solid #ef444440' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 14 }}>&#9888;</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>Proteção da Mesa de Sacrifício</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Limita a profundidade máxima de corte para não danificar a mesa de sacrifício.
                            Ex: chapa de 15mm com margem 0.5mm = profundidade máxima 15.5mm.
                            Qualquer operação que ultrapasse será automaticamente reduzida.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Margem além do material (mm)</label><input type="number" value={f.margem_mesa_sacrificio ?? 0.5} onChange={e => upd('margem_mesa_sacrificio', Number(e.target.value))} className={Z.inp} step="0.1" min="0" max="3" /></div>
                        </div>
                    </div>
                </div>
            )}

            {secao === 'estrategias' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        Configurações avançadas de estratégia de usinagem: como a fresa executa rebaixos, furos circulares, canais e rampas.
                    </p>

                    {/* Rampa */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Entrada em Rampa / Mergulho</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            <div>
                                <label className={Z.lbl}>Tipo de Rampa</label>
                                <select value={f.rampa_tipo || 'linear'} onChange={e => upd('rampa_tipo', e.target.value)} className={Z.inp}>
                                    <option value="linear">Linear (diagonal)</option>
                                    <option value="helicoidal">Helicoidal (espiral)</option>
                                    <option value="plunge">Plunge direto</option>
                                </select>
                            </div>
                            <div><label className={Z.lbl}>Vel. Rampa (mm/min)</label><input type="number" value={f.vel_rampa ?? 1500} onChange={e => upd('vel_rampa', Number(e.target.value))} className={Z.inp} step="100" min="100" /></div>
                            <div><label className={Z.lbl}>Diâmetro Hélice (%)</label><input type="number" value={f.rampa_diametro_pct ?? 80} onChange={e => upd('rampa_diametro_pct', Number(e.target.value))} className={Z.inp} step="5" min="30" max="100" /></div>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
                            <b>Linear</b>: fresa desce em diagonal (ideal para canais). <b>Helicoidal</b>: fresa desce em espiral (ideal para furos circulares). <b>Diâmetro Hélice</b>: % do diâmetro do furo usado para raio da espiral.
                        </p>
                    </div>

                    {/* Pocket / Rebaixo */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Rebaixo (Pocket)</div>
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={(f.pocket_acabamento ?? 1) === 1} onChange={e => upd('pocket_acabamento', e.target.checked ? 1 : 0)} />
                                    Passe de acabamento
                                </label>
                            </div>
                            <div><label className={Z.lbl}>Offset acabamento (mm)</label><input type="number" value={f.pocket_acabamento_offset ?? 0.2} onChange={e => upd('pocket_acabamento_offset', Number(e.target.value))} className={Z.inp} step="0.05" min="0.05" max="2" /></div>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
                            <b>Stepover</b>: espaçamento entre passadas = % do diâmetro da fresa. 60% é ideal para MDF.
                            <b>Passe de acabamento</b>: após o zigzag, faz uma passada final no contorno do pocket com velocidade reduzida para paredes limpas.
                        </p>
                    </div>

                    {/* Furos Circulares */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Furos Circulares (Interpolação)</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Quando não há broca do diâmetro exato, a fresa contorna o furo em círculo (G2/G3). Aplica-se a dobradiças (Ø35mm), minifix, etc.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Passes de acabamento</label><input type="number" value={f.circular_passes_acabamento ?? 1} onChange={e => upd('circular_passes_acabamento', Number(e.target.value))} className={Z.inp} min="0" max="5" /></div>
                            <div><label className={Z.lbl}>Offset desbaste (mm)</label><input type="number" value={f.circular_offset_desbaste ?? 0.3} onChange={e => upd('circular_offset_desbaste', Number(e.target.value))} className={Z.inp} step="0.05" min="0" max="2" /></div>
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
                            <b>Offset desbaste</b>: no desbaste, a fresa fica X mm afastada da parede final. O passe de acabamento remove esse material com velocidade reduzida para dimensão precisa.
                        </p>
                    </div>

                    {/* Compensação de Raio */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Compensação de Raio em Canais</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            A fresa tem diâmetro &gt; 0, então cantos de canais ficam arredondados. A compensação avança a fresa além do canto para que o espaço útil fique com cantos retos.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={(f.compensar_raio_canal ?? 1) === 1} onChange={e => upd('compensar_raio_canal', e.target.checked ? 1 : 0)} />
                                    Ativar compensação
                                </label>
                            </div>
                            <div>
                                <label className={Z.lbl}>Tipo</label>
                                <select value={f.compensacao_tipo || 'overcut'} onChange={e => upd('compensacao_tipo', e.target.value)} className={Z.inp}>
                                    <option value="overcut">Overcut (avanço do raio)</option>
                                    <option value="dogbone">Dog-bone (furo nos cantos)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {secao === 'antiarrasto' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        Estratégias para prevenir arrasto e deslocamento de peças pequenas durante o corte CNC.
                    </p>

                    {/* Direção de Corte */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Direção de Corte (Contorno Externo)</div>
                        <select value={f.direcao_corte || 'climb'} onChange={e => upd('direcao_corte', e.target.value)} className={Z.inp}>
                            <option value="climb">Climb Milling (CW) — Melhor acabamento em MDF</option>
                            <option value="convencional">Convencional (CCW) — Mais seguro com backlash</option>
                        </select>
                    </div>

                    {/* Onion-Skin */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            <input type="checkbox" checked={(f.usar_onion_skin ?? 1) === 1} onChange={e => upd('usar_onion_skin', e.target.checked ? 1 : 0)} />
                            Onion-Skin (2 passes de profundidade)
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Corta 95% da profundidade em todas as peças primeiro, depois volta e corta os últimos milímetros com velocidade reduzida. Mantém a chapa inteira durante o passe pesado.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Espessura skin (mm)</label><input type="number" value={f.onion_skin_espessura ?? 0.5} onChange={e => upd('onion_skin_espessura', Number(e.target.value))} className={Z.inp} step="0.1" min="0.1" max="3" /></div>
                            <div><label className={Z.lbl}>Área máx. para onion (cm²)</label><input type="number" value={f.onion_skin_area_max ?? 500} onChange={e => upd('onion_skin_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            <input type="checkbox" checked={(f.usar_tabs ?? 0) === 1} onChange={e => upd('usar_tabs', e.target.checked ? 1 : 0)} />
                            Tabs / Micro-juntas
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Deixa pequenas pontes de material que seguram fisicamente a peça. Precisam ser lixadas depois do corte.
                            <br /><span style={{ color: 'var(--warning)', fontWeight: 600 }}>Aviso: Nao recomendado para MDF melaminico -- as tabs podem quebrar a melamina ao serem removidas.</span>
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Largura tab (mm)</label><input type="number" value={f.tab_largura ?? 4} onChange={e => upd('tab_largura', Number(e.target.value))} className={Z.inp} step="0.5" /></div>
                            <div><label className={Z.lbl}>Altura tab (mm)</label><input type="number" value={f.tab_altura ?? 1.5} onChange={e => upd('tab_altura', Number(e.target.value))} className={Z.inp} step="0.1" /></div>
                            <div><label className={Z.lbl}>Qtd tabs/peça</label><input type="number" value={f.tab_qtd ?? 2} onChange={e => upd('tab_qtd', Number(e.target.value))} className={Z.inp} min={1} max={8} /></div>
                            <div><label className={Z.lbl}>Área máx. (cm²)</label><input type="number" value={f.tab_area_max ?? 800} onChange={e => upd('tab_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>

                    {/* Lead-in */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            <input type="checkbox" checked={(f.usar_lead_in ?? 1) === 1} onChange={e => upd('usar_lead_in', e.target.checked ? 1 : 0)} />
                            Lead-in / Lead-out (entrada em arco)
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Nunca mergulha direto na linha de corte — entra pela área de desperdício com arco tangente.
                        </p>
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
                    </div>

                    {/* Ramping */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                            <input type="checkbox" checked={(f.usar_rampa ?? 1) === 1} onChange={e => upd('usar_rampa', e.target.checked ? 1 : 0)} />
                            Entrada em Rampa (Ramp Entry)
                        </label>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Em vez de mergulhar (plunge) direto no material, a fresa desce em ângulo ao longo da trajetória.
                            Preserva a vida útil da ferramenta e evita marcas de entrada no acabamento.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Ângulo da rampa (°)</label><input type="number" value={f.rampa_angulo ?? 3} onChange={e => upd('rampa_angulo', Number(e.target.value))} className={Z.inp} step="0.5" min="1" max="15" /></div>
                            <div><label className={Z.lbl}>Vel. Mergulho (mm/min)</label><input type="number" value={f.vel_mergulho ?? 1500} onChange={e => upd('vel_mergulho', Number(e.target.value))} className={Z.inp} step="100" min="100" /></div>
                        </div>
                    </div>

                    {/* Ordenação de Contornos */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Ordenação de Contornos (Fixação)</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Define a ordem de corte dos contornos das peças. O algoritmo calcula um <b>Índice de Risco de Vácuo</b>
                            combinando a área da peça (60%) e a distância das bordas da chapa (40%).
                        </p>
                        <select value={f.ordenar_contornos || 'menor_primeiro'} onChange={e => upd('ordenar_contornos', e.target.value)} className={Z.inp}>
                            <option value="menor_primeiro">Menor primeiro (+ risco de vácuo) — Recomendado</option>
                            <option value="maior_primeiro">Maior primeiro</option>
                            <option value="proximidade">Proximidade (menor G0) — Menos trocas de posição</option>
                        </select>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 8 }}>
                            <div><label className={Z.lbl}>Z Aproximação Rápida (mm acima - entre ops próximas)</label><input type="number" value={f.z_aproximacao_rapida ?? 5} onChange={e => upd('z_aproximacao_rapida', Number(e.target.value))} className={Z.inp} step="1" min="2" /></div>
                        </div>
                    </div>

                    {/* Feed Rate Reduction */}
                    <div style={{ padding: '12px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Redução de Feed Rate</div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Reduz a velocidade de corte para peças pequenas, diminuindo a força lateral que causa arrasto.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><label className={Z.lbl}>Feed rate peças pequenas (%)</label><input type="number" value={f.feed_rate_pct_pequenas ?? 50} onChange={e => upd('feed_rate_pct_pequenas', Number(e.target.value))} className={Z.inp} min={10} max={100} /></div>
                            <div><label className={Z.lbl}>Área máx. p/ redução (cm²)</label><input type="number" value={f.feed_rate_area_max ?? 500} onChange={e => upd('feed_rate_area_max', Number(e.target.value))} className={Z.inp} /></div>
                        </div>
                    </div>
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
