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

// ── Ícone visual de ferramenta por tipo ──────────────────────────
function ToolIcon({ tipoCorte, size = 28 }) {
    const tc = (tipoCorte || '').toLowerCase();
    const isFresa = tc.includes('fresa') || tc.includes('slot');
    const isSerra = tc.includes('serra') || tc.includes('disco');
    const color = isFresa ? '#3b82f6' : isSerra ? '#f59e0b' : '#a855f7';
    const bg = isFresa ? '#dbeafe' : isSerra ? '#fef3c7' : '#f3e8ff';
    return (
        <div style={{
            width: size, height: size, borderRadius: 6,
            background: bg, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
        }}>
            <Wrench size={size * 0.55} color={color} />
        </div>
    );
}

// ── Barra de desgaste ────────────────────────────────────────────
function WearBar({ ferramenta, onReset }) {
    const acum = ferramenta.metros_acumulados || 0;
    const limite = ferramenta.metros_limite || 5000;
    const pct = limite > 0 ? Math.min(100, (acum / limite) * 100) : 0;
    const barColor = pct < 50 ? '#22c55e' : pct < 80 ? '#f59e0b' : '#ef4444';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width .3s', borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: barColor, whiteSpace: 'nowrap' }}>
                {acum.toFixed(0)}/{limite}m
            </span>
            {pct >= 80 && (
                <button
                    onClick={onReset}
                    title="Resetar desgaste (troca realizada)"
                    style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                >
                    <RotateCw size={9} /> Reset
                </button>
            )}
        </div>
    );
}

// ── Card de ferramenta ───────────────────────────────────────────
function ToolCard({ f, onEdit, onDel, onReset }) {
    const tc = (f.tipo_corte || f.tipo || 'broca').replace(/_/g, ' ');
    const hasRampa = f.rampa_tipo && f.rampa_tipo !== 'herdar';
    const acum = f.metros_acumulados || 0;
    const limite = f.metros_limite || 5000;
    const wearPct = limite > 0 ? Math.min(100, (acum / limite) * 100) : 0;
    const wearColor = wearPct < 50 ? '#22c55e' : wearPct < 80 ? '#f59e0b' : '#ef4444';

    return (
        <div style={{
            border: `1px solid ${wearPct >= 80 ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
            borderRadius: 10, padding: '12px 14px',
            background: 'var(--bg-elevated)',
            display: 'flex', alignItems: 'flex-start', gap: 12,
            transition: 'border-color .15s',
        }}>
            <ToolIcon tipoCorte={f.tipo_corte || f.tipo} size={36} />

            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Nome + código */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{f.nome}</span>
                    <code style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '1px 5px', borderRadius: 4 }}>{f.codigo}</code>
                    {f.tool_code && (
                        <code style={{ fontSize: 9, color: 'var(--primary)', background: 'rgba(var(--primary-rgb),0.1)', padding: '1px 5px', borderRadius: 4 }}>{f.tool_code}</code>
                    )}
                    {hasRampa && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', fontWeight: 700 }}>
                            rampa: {f.rampa_tipo}
                        </span>
                    )}
                    {!f.ativo && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>INATIVA</span>
                    )}
                </div>

                {/* Parâmetros inline */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Ø{f.diametro}mm</span>
                    <span>{tc}</span>
                    <span>{f.rpm?.toLocaleString()} RPM</span>
                    <span>✂ {f.velocidade_corte} mm/min</span>
                    <span>↓ {f.profundidade_max}mm max</span>
                    {f.doc && <span>DOC {f.doc}mm</span>}
                    {f.comprimento_util && <span>Lc {f.comprimento_util}mm</span>}
                </div>

                {/* Desgaste */}
                <WearBar ferramenta={f} onReset={onReset} />
            </div>

            {/* Ações */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={onEdit} className={Z.btn2} style={{ padding: '5px 8px' }} title="Editar">
                    <Edit size={12} />
                </button>
                <button onClick={onDel} className={Z.btnD} style={{ padding: '5px 8px' }} title="Excluir">
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
    );
}

export function CfgFerramentas({ maquinaId, maquina: maquinaProp, notify }) {
    const [ferramentas, setFerramentas] = useState([]);
    // Usa prop passada pelo pai (sempre fresca após save) ou faz fetch próprio como fallback
    const [maquinaLocal, setMaquinaLocal] = useState(null);
    const maquina = maquinaProp ?? maquinaLocal;
    const [modal, setModal] = useState(null);
    const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
    const load = useCallback(() => {
        const url = maquinaId ? `/cnc/ferramentas?maquina_id=${maquinaId}` : '/cnc/ferramentas';
        api.get(url).then(setFerramentas).catch(e => notify(e.error || 'Erro ao carregar ferramentas'));
        // Só busca máquina se não foi passada como prop
        if (maquinaId && !maquinaProp) {
            api.get(`/cnc/maquinas/${maquinaId}`).then(setMaquinaLocal).catch(() => {});
        }
    }, [maquinaId, maquinaProp]);
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

    const BLANK = {
        codigo: '', nome: '', tipo: 'broca', tipo_corte: 'broca', diametro: 0,
        profundidade_max: 30, velocidade_corte: 4000, rpm: 12000,
        tool_code: '', maquina_id: maquinaId, ativo: 1,
        doc: null, profundidade_extra: null, comprimento_util: 25, num_cortes: 2,
        rampa_tipo: null, rampa_angulo: null, vel_rampa: null, vel_plunge: null,
        rampa_diametro_pct: null, velocidade_acabamento: null, passes_acabamento: 0,
    };

    // Agrupar por tipo
    const grupos = ferramentas.reduce((acc, f) => {
        const g = (f.tipo_corte || f.tipo || 'broca').includes('fresa') ? 'Fresas'
                : (f.tipo_corte || f.tipo || '').includes('serra') ? 'Serras'
                : 'Brocas';
        (acc[g] = acc[g] || []).push(f);
        return acc;
    }, {});

    // Capacidade do magazine
    const capacidade = maquina?.capacidade_magazine ?? 35;
    const ativas = ferramentas.filter(f => f.ativo !== 0).length;
    const magazineCheia = ativas >= capacidade;
    const magazinePct = Math.min(100, (ativas / capacidade) * 100);
    const magazineColor = magazinePct < 60 ? '#22c55e' : magazinePct < 90 ? '#f59e0b' : '#ef4444';

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                    <Wrench size={14} /> Magazine
                </h4>
                <div style={{ flex: 1 }} />
                {/* View toggle */}
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {[['cards', Grid], ['table', List]].map(([mode, Icon]) => (
                        <button key={mode} onClick={() => setViewMode(mode)} style={{
                            padding: '4px 8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                            background: viewMode === mode ? 'var(--primary)' : 'var(--bg-muted)',
                            color: viewMode === mode ? '#fff' : 'var(--text-muted)',
                        }}>
                            <Icon size={13} />
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => {
                        if (magazineCheia) {
                            notify(`Magazine cheio! Capacidade máxima: ${capacidade} ferramentas ativas. Desative ou exclua uma ferramenta primeiro.`);
                            return;
                        }
                        setModal({ ...BLANK });
                    }}
                    className={Z.btn}
                    style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, background: magazineCheia ? '#6b7280' : undefined }}
                    title={magazineCheia ? `Magazine cheio (${ativas}/${capacidade})` : 'Adicionar ferramenta'}
                >
                    <Plus size={11} /> Ferramenta
                </button>
            </div>

            {/* Barra de capacidade do magazine */}
            <div style={{
                padding: '8px 12px', marginBottom: 12, borderRadius: 7,
                border: `1px solid ${magazineCheia ? 'rgba(239,68,68,0.4)' : magazinePct >= 90 ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                background: magazineCheia ? 'rgba(239,68,68,0.05)' : 'var(--bg-muted)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Slots do magazine
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: magazineColor }}>
                        {ativas}/{capacidade}
                    </span>
                    {magazineCheia && (
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>
                            CHEIO
                        </span>
                    )}
                    {!magazineCheia && magazinePct >= 80 && (
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#fef9c3', color: '#854d0e', fontWeight: 700 }}>
                            QUASE CHEIO
                        </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {capacidade - ativas} livre{capacidade - ativas !== 1 ? 's' : ''}
                    </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{
                        width: `${magazinePct}%`, height: '100%', borderRadius: 3,
                        background: magazineColor, transition: 'width .3s',
                    }} />
                </div>
                {magazineCheia && (
                    <div style={{ fontSize: 10, color: '#dc2626', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={10} />
                        Magazine cheio. Para adicionar uma nova ferramenta, desative ou exclua uma existente.
                    </div>
                )}
            </div>

            {ferramentas.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, background: 'var(--bg-muted)', borderRadius: 8 }}>
                    Nenhuma ferramenta cadastrada para esta máquina.<br />
                    <span style={{ fontSize: 10 }}>Clique em "+ Ferramenta" para adicionar.</span>
                </div>
            ) : viewMode === 'cards' ? (
                // ── CARDS agrupados por tipo ──
                Object.entries(grupos).map(([grupo, tools]) => (
                    <div key={grupo} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: grupo === 'Fresas' ? '#3b82f6' : grupo === 'Serras' ? '#f59e0b' : '#a855f7',
                                display: 'inline-block',
                            }} />
                            {grupo} ({tools.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {tools.map(f => (
                                <ToolCard
                                    key={f.id}
                                    f={f}
                                    onEdit={() => setModal(f)}
                                    onDel={() => del(f.id)}
                                    onReset={async () => { await api.post(`/cnc/ferramentas/${f.id}/reset-desgaste`); notify('Desgaste resetado'); load(); }}
                                />
                            ))}
                        </div>
                    </div>
                ))
            ) : (
                // ── TABELA compacta ──
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
                        <thead>
                            <tr>
                                {['Cód', 'Nome', 'Tipo', 'Ø', 'Tool Code', 'RPM', 'Feed', 'Prof', 'DOC', 'Rampa', 'Desgaste', ''].map(h => (
                                    <th key={h} className={Z.th} style={{ padding: '5px 6px', fontSize: 10 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {ferramentas.map((f, i) => {
                                const acum = f.metros_acumulados || 0;
                                const limite = f.metros_limite || 5000;
                                const pct = Math.min(100, (acum / limite) * 100);
                                const bC = pct < 50 ? '#22c55e' : pct < 80 ? '#f59e0b' : '#ef4444';
                                return (
                                    <tr key={f.id} style={{ background: i % 2 ? 'var(--bg-muted)' : 'transparent' }}>
                                        <td style={{ padding: '4px 6px', fontWeight: 700, fontFamily: 'monospace' }}>{f.codigo}</td>
                                        <td style={{ padding: '4px 6px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</td>
                                        <td style={{ padding: '4px 6px', fontSize: 9, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{(f.tipo_corte || f.tipo || '').replace(/_/g, ' ')}</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>{f.diametro}</td>
                                        <td style={{ padding: '4px 6px', fontFamily: 'monospace', fontSize: 9, color: 'var(--primary)' }}>{f.tool_code || '—'}</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>{f.rpm}</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>{f.velocidade_corte}</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>{f.profundidade_max}</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center', color: f.doc ? 'var(--text-primary)' : 'var(--text-muted)' }}>{f.doc ?? '—'}</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center', fontSize: 9 }}>
                                            {f.rampa_tipo
                                                ? <span style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', padding: '1px 4px', borderRadius: 3, fontWeight: 700 }}>{f.rampa_tipo}</span>
                                                : <span style={{ color: 'var(--text-muted)' }}>herdar</span>}
                                        </td>
                                        <td style={{ padding: '4px 6px', minWidth: 80 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: bC, borderRadius: 3 }} />
                                                </div>
                                                <span style={{ fontSize: 9, color: bC, fontWeight: 600 }}>{acum.toFixed(0)}m</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '4px 6px' }}>
                                            <div style={{ display: 'flex', gap: 3 }}>
                                                <button onClick={() => setModal(f)} className={Z.btn2} style={{ padding: '2px 5px' }}><Edit size={10} /></button>
                                                <button onClick={() => del(f.id)} className={Z.btnD} style={{ padding: '2px 5px' }}><Trash2 size={10} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {modal && <FerramentaModal data={modal} onSave={save} onClose={() => setModal(null)} />}
        </div>
    );
}

// Seção colapsável do modal
function Section({ title, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ marginBottom: 14 }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', textAlign: 'left', border: 'none', background: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 0', marginBottom: open ? 8 : 0,
                }}
            >
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>{title}</span>
                {open ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
            </button>
            {open && children}
        </div>
    );
}

// Chip de estratégia de rampa
const RAMPA_OPCOES = [
    { value: null,          label: 'Herdar da máquina', sub: 'usa configuração global',  color: 'var(--text-muted)',  bg: 'var(--bg-muted)' },
    { value: 'plunge',      label: 'Plunge direto',      sub: 'descida vertical Z (brocas)', color: '#a855f7', bg: '#f3e8ff' },
    { value: 'linear',      label: 'Rampa linear',       sub: 'desce ao longo do 1º segmento', color: '#3b82f6', bg: '#dbeafe' },
    { value: 'helicoidal',  label: 'Helicoidal',         sub: 'entrada circular descendente (bolsos)', color: '#22c55e', bg: '#dcfce7' },
];

function FerramentaModal({ data, onSave, onClose }) {
    const [f, setF] = useState({ ...data });
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

    const rampaSel = RAMPA_OPCOES.find(r => r.value === (f.rampa_tipo ?? null)) || RAMPA_OPCOES[0];
    const isFresa = (f.tipo_corte || f.tipo || '').includes('fresa');

    // Sugestão automática de rampa baseada no tipo
    const rampaSugerida = isFresa
        ? (f.tipo_corte?.includes('helicoidal') ? 'helicoidal' : 'linear')
        : 'plunge';

    return (
        <Modal title={f.id ? `Editar — ${f.nome || 'Ferramenta'}` : 'Nova Ferramenta'} close={onClose} w={640}>
            {/* Identificação */}
            <Section title="Identificação">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label className={Z.lbl}>Código (T01, T02...)</label><input value={f.codigo} onChange={e => upd('codigo', e.target.value)} className={Z.inp} /></div>
                    <div><label className={Z.lbl}>Nome</label><input value={f.nome} onChange={e => upd('nome', e.target.value)} className={Z.inp} /></div>
                    <div>
                        <label className={Z.lbl}>Tipo de Corte</label>
                        <select
                            value={f.tipo_corte || f.tipo || 'broca'}
                            onChange={e => { upd('tipo_corte', e.target.value); upd('tipo', e.target.value.includes('fresa') ? 'fresa' : e.target.value.includes('serra') ? 'serra' : 'broca'); }}
                            className={Z.inp}
                        >
                            <option value="broca">Broca (furos passantes/cegos)</option>
                            <option value="broca_forstner">Broca Forstner (furos rasos Ø≥25mm)</option>
                            <option value="fresa_reta">Fresa Reta (rasgos, bolsos)</option>
                            <option value="fresa_compressao">Fresa Compressão (contornos — sem lascas)</option>
                            <option value="fresa_helicoidal">Fresa Helicoidal (bolsos com entrada helicoidal)</option>
                            <option value="fresa_chanfro">Fresa Chanfro (45°)</option>
                            <option value="serra">Serra / Disco (rasgos largos)</option>
                        </select>
                    </div>
                    <div>
                        <label className={Z.lbl}>Diâmetro (mm)</label>
                        <input type="number" value={f.diametro} onChange={e => upd('diametro', Number(e.target.value))} className={Z.inp} step="0.1" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Tool Code (mapeamento plugin)</label>
                        <input value={f.tool_code || ''} onChange={e => upd('tool_code', e.target.value)} className={Z.inp} placeholder="f_8mm_cavilha, usi_line..." />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                            <input type="checkbox" checked={(f.ativo ?? 1) === 1} onChange={e => upd('ativo', e.target.checked ? 1 : 0)} style={{ accentColor: 'var(--primary)' }} />
                            Ferramenta ativa
                        </label>
                    </div>
                </div>
            </Section>

            {/* Velocidades e feeds */}
            <Section title="Velocidades e Feeds">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                        <label className={Z.lbl}>RPM</label>
                        <input type="number" value={f.rpm || 0} onChange={e => upd('rpm', Number(e.target.value))} className={Z.inp} step="500" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Feed corte (mm/min)</label>
                        <input type="number" value={f.velocidade_corte || 0} onChange={e => upd('velocidade_corte', Number(e.target.value))} className={Z.inp} step="100" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Feed acabamento (mm/min)</label>
                        <input type="number" value={f.velocidade_acabamento ?? ''} onChange={e => upd('velocidade_acabamento', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="100" placeholder="= feed corte" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Passes de acabamento</label>
                        <input type="number" value={f.passes_acabamento ?? 0} onChange={e => upd('passes_acabamento', Number(e.target.value))} className={Z.inp} min="0" max="5" step="1" />
                    </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, padding: '5px 8px', background: 'var(--bg-muted)', borderRadius: 5 }}>
                    Feed acabamento: velocidade no último passe (mais lento = melhor acabamento). Passes de acabamento: passadas extras com offset pequeno.
                </div>
            </Section>

            {/* Profundidades */}
            <Section title="Profundidades e Geometria">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                    <div>
                        <label className={Z.lbl}>Prof. Máx (mm)</label>
                        <input type="number" value={f.profundidade_max || 30} onChange={e => upd('profundidade_max', Number(e.target.value))} className={Z.inp} step="0.5" />
                    </div>
                    <div>
                        <label className={Z.lbl}>DOC (mm/passada)</label>
                        <input type="number" value={f.doc ?? ''} onChange={e => upd('doc', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="0.5" placeholder="Passada única" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Prof. Extra (mm)</label>
                        <input type="number" value={f.profundidade_extra ?? ''} onChange={e => upd('profundidade_extra', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="0.1" placeholder="Padrão máq." />
                    </div>
                    <div>
                        <label className={Z.lbl}>Comp. Útil (mm)</label>
                        <input type="number" value={f.comprimento_util ?? 25} onChange={e => upd('comprimento_util', Number(e.target.value))} className={Z.inp} step="0.5" />
                    </div>
                    <div>
                        <label className={Z.lbl}>Nº de Cortes (arestas)</label>
                        <input type="number" value={f.num_cortes ?? 2} onChange={e => upd('num_cortes', Number(e.target.value))} className={Z.inp} min="1" max="8" />
                    </div>
                </div>
            </Section>

            {/* ═══ RAMPA — seção principal ═══ */}
            <Section title="Estratégia de Entrada (Rampa)" defaultOpen={true}>
                {/* Chips de seleção de estratégia */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {RAMPA_OPCOES.map(op => (
                        <button
                            key={String(op.value)}
                            onClick={() => upd('rampa_tipo', op.value)}
                            style={{
                                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                                border: `2px solid ${(f.rampa_tipo ?? null) === op.value ? op.color : 'var(--border)'}`,
                                background: (f.rampa_tipo ?? null) === op.value ? op.bg : 'var(--bg-elevated)',
                                transition: 'all .15s', flex: '1 1 140px', minWidth: 130,
                            }}
                        >
                            <div style={{ fontSize: 11, fontWeight: 700, color: (f.rampa_tipo ?? null) === op.value ? op.color : 'var(--text-primary)', marginBottom: 2 }}>{op.label}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.3 }}>{op.sub}</div>
                        </button>
                    ))}
                </div>

                {/* Sugestão baseada no tipo de ferramenta */}
                {(f.rampa_tipo ?? null) === null && (
                    <div style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(var(--primary-rgb),0.06)', border: '1px solid rgba(var(--primary-rgb),0.15)', fontSize: 11, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text-muted)' }}>💡 Sugerido para <b>{(f.tipo_corte || f.tipo || 'broca').replace(/_/g, ' ')}</b>:</span>
                        <button
                            onClick={() => upd('rampa_tipo', rampaSugerida)}
                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Aplicar {rampaSugerida}
                        </button>
                    </div>
                )}

                {/* Parâmetros específicos da rampa selecionada */}
                {(f.rampa_tipo ?? null) !== null && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${rampaSel.color}33`, background: `${rampaSel.bg}` }}>
                        {/* LINEAR: ângulo + feed */}
                        {f.rampa_tipo === 'linear' && (
                            <div>
                                <label className={Z.lbl}>Ângulo rampa (°)</label>
                                <input type="number" value={f.rampa_angulo ?? ''} onChange={e => upd('rampa_angulo', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="0.5" min="0.5" max="15" placeholder="Máquina" />
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>3° (suave) → 5° (agressivo)</div>
                            </div>
                        )}
                        {/* LINEAR + HELICOIDAL: feed de entrada */}
                        {(f.rampa_tipo === 'linear' || f.rampa_tipo === 'helicoidal') && (
                            <div>
                                <label className={Z.lbl}>Feed entrada rampa (mm/min)</label>
                                <input type="number" value={f.vel_rampa ?? ''} onChange={e => upd('vel_rampa', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="100" placeholder="Herdar máquina" />
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Velocidade durante a descida</div>
                            </div>
                        )}
                        {/* HELICOIDAL: raio da hélice */}
                        {f.rampa_tipo === 'helicoidal' && (
                            <div>
                                <label className={Z.lbl}>Raio hélice (% do Ø)</label>
                                <input type="number" value={f.rampa_diametro_pct ?? ''} onChange={e => upd('rampa_diametro_pct', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="5" min="20" max="95" placeholder="80%" />
                                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>80% = hélice Ø (0.8 × Ø ferr.)</div>
                            </div>
                        )}
                        {/* PLUNGE: feed vertical + feed lento final */}
                        {f.rampa_tipo === 'plunge' && (
                            <>
                                <div>
                                    <label className={Z.lbl}>Feed plunge Z (mm/min)</label>
                                    <input type="number" value={f.vel_rampa ?? ''} onChange={e => upd('vel_rampa', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="100" placeholder="Herdar máquina" />
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Velocidade de descida principal</div>
                                </div>
                                <div>
                                    <label className={Z.lbl}>Feed plunge lento (mm/min)</label>
                                    <input type="number" value={f.vel_plunge ?? ''} onChange={e => upd('vel_plunge', e.target.value === '' ? null : Number(e.target.value))} className={Z.inp} step="50" placeholder="= feed plunge" />
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Últimos 2mm — proteção de ferramenta</div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                    <b>Plunge:</b> Entrada vertical (brocas). <b>Rampa linear:</b> Desce ao longo do 1º segmento (fresas de contorno).
                    <b> Helicoidal:</b> Espiral descendente antes de iniciar o bolso (fresas helicoidais). Parâmetros vazios herdam da máquina.
                </div>
            </Section>

            {/* ═══ CALCULADORA DE PARÂMETROS ═══ */}
            <CalculadoraParametros
                tipoCorte={f.tipo_corte || f.tipo || 'fresa_reta'}
                diametro={Number(f.diametro) || 6}
                numCortes={Number(f.num_cortes) || 2}
                onApply={(rpm, feed) => { upd('rpm', rpm); upd('velocidade_corte', feed); }}
            />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={onClose} className={Z.btn2}>Cancelar</button>
                <button onClick={() => onSave(f)} className={Z.btn}>Salvar Ferramenta</button>
            </div>
        </Modal>
    );
}

// ─── Tabela de parâmetros de corte (tipo × material) ──────────────────────────
// Vc em m/min, fz em mm/dente (base para Ø6mm carbide), doc_max_D = profundidade máx em × diâmetro
const CUTTING_PARAMS = {
    fresa_reta: {
        mdf:        { Vc_min: 200, Vc_max: 350, fz_min: 0.10, fz_max: 0.25, doc_max_D: 0.8, notes: 'MDF absorve calor — fz conservador reduz queima' },
        mdp:        { Vc_min: 200, Vc_max: 350, fz_min: 0.12, fz_max: 0.28, doc_max_D: 0.7, notes: 'Resina dura — desgaste moderado' },
        compensado: { Vc_min: 180, Vc_max: 300, fz_min: 0.08, fz_max: 0.20, doc_max_D: 0.6, notes: 'Camadas cruzadas — fz menor evita lascamento' },
        pinus:      { Vc_min: 250, Vc_max: 450, fz_min: 0.14, fz_max: 0.35, doc_max_D: 1.2, notes: 'Madeira macia — tolera fz alto' },
        eucalipto:  { Vc_min: 150, Vc_max: 280, fz_min: 0.06, fz_max: 0.15, doc_max_D: 0.5, notes: 'Madeira dura — Vc menor, fz conservador' },
        carvalho:   { Vc_min: 120, Vc_max: 240, fz_min: 0.05, fz_max: 0.12, doc_max_D: 0.4, notes: 'Madeira muito dura — parâmetros conservadores' },
        teca:       { Vc_min: 130, Vc_max: 250, fz_min: 0.05, fz_max: 0.13, doc_max_D: 0.45, notes: 'Sílica na madeira desgasta rápido' },
    },
    fresa_compressao: {
        mdf:        { Vc_min: 250, Vc_max: 450, fz_min: 0.12, fz_max: 0.28, doc_max_D: 1.0, notes: 'Ideal para MDF — bordas limpas nos dois lados' },
        mdp:        { Vc_min: 250, Vc_max: 450, fz_min: 0.14, fz_max: 0.30, doc_max_D: 1.0, notes: 'Excelente acabamento em MDP laminado' },
        compensado: { Vc_min: 220, Vc_max: 380, fz_min: 0.10, fz_max: 0.24, doc_max_D: 0.9, notes: 'Melhor que fresa reta em compensado multilayer' },
        pinus:      { Vc_min: 280, Vc_max: 480, fz_min: 0.16, fz_max: 0.36, doc_max_D: 1.3, notes: 'Alta performance em pinus' },
        eucalipto:  { Vc_min: 180, Vc_max: 320, fz_min: 0.08, fz_max: 0.18, doc_max_D: 0.6, notes: 'Reduzir fz para evitar vibração' },
        carvalho:   { Vc_min: 150, Vc_max: 280, fz_min: 0.06, fz_max: 0.14, doc_max_D: 0.5, notes: 'Compressão distribui forças — melhor que reta em madeira dura' },
        teca:       { Vc_min: 160, Vc_max: 290, fz_min: 0.07, fz_max: 0.15, doc_max_D: 0.5, notes: '' },
    },
    fresa_helicoidal: {
        mdf:        { Vc_min: 220, Vc_max: 380, fz_min: 0.11, fz_max: 0.26, doc_max_D: 0.9, notes: 'Hélice melhora evacuação de cavaco em MDF' },
        mdp:        { Vc_min: 220, Vc_max: 380, fz_min: 0.12, fz_max: 0.28, doc_max_D: 0.8, notes: '' },
        compensado: { Vc_min: 200, Vc_max: 340, fz_min: 0.09, fz_max: 0.22, doc_max_D: 0.7, notes: '' },
        pinus:      { Vc_min: 270, Vc_max: 460, fz_min: 0.15, fz_max: 0.34, doc_max_D: 1.2, notes: '' },
        eucalipto:  { Vc_min: 160, Vc_max: 300, fz_min: 0.07, fz_max: 0.16, doc_max_D: 0.55, notes: '' },
        carvalho:   { Vc_min: 130, Vc_max: 260, fz_min: 0.05, fz_max: 0.13, doc_max_D: 0.45, notes: '' },
        teca:       { Vc_min: 140, Vc_max: 270, fz_min: 0.06, fz_max: 0.14, doc_max_D: 0.48, notes: '' },
    },
    fresa_chanfro: {
        mdf:        { Vc_min: 150, Vc_max: 280, fz_min: 0.06, fz_max: 0.14, doc_max_D: 0.3, notes: 'Velocidade reduzida para acabamento limpo' },
        mdp:        { Vc_min: 150, Vc_max: 280, fz_min: 0.06, fz_max: 0.14, doc_max_D: 0.3, notes: '' },
        compensado: { Vc_min: 130, Vc_max: 240, fz_min: 0.05, fz_max: 0.12, doc_max_D: 0.25, notes: '' },
        pinus:      { Vc_min: 180, Vc_max: 320, fz_min: 0.08, fz_max: 0.18, doc_max_D: 0.4, notes: '' },
        eucalipto:  { Vc_min: 100, Vc_max: 200, fz_min: 0.04, fz_max: 0.10, doc_max_D: 0.2, notes: '' },
        carvalho:   { Vc_min:  90, Vc_max: 180, fz_min: 0.03, fz_max: 0.09, doc_max_D: 0.2, notes: '' },
        teca:       { Vc_min:  95, Vc_max: 190, fz_min: 0.04, fz_max: 0.10, doc_max_D: 0.2, notes: '' },
    },
    broca: {
        mdf:        { Vc_min: 60, Vc_max: 120, fz_min: 0.04, fz_max: 0.12, doc_max_D: 10, notes: 'Furação axial — fz = avanço por volta' },
        mdp:        { Vc_min: 60, Vc_max: 120, fz_min: 0.04, fz_max: 0.12, doc_max_D: 10, notes: '' },
        compensado: { Vc_min: 50, Vc_max: 100, fz_min: 0.03, fz_max: 0.10, doc_max_D: 10, notes: '' },
        pinus:      { Vc_min: 80, Vc_max: 150, fz_min: 0.05, fz_max: 0.15, doc_max_D: 10, notes: '' },
        eucalipto:  { Vc_min: 40, Vc_max: 90,  fz_min: 0.03, fz_max: 0.08, doc_max_D: 8,  notes: '' },
        carvalho:   { Vc_min: 30, Vc_max: 70,  fz_min: 0.02, fz_max: 0.07, doc_max_D: 6,  notes: '' },
        teca:       { Vc_min: 35, Vc_max: 75,  fz_min: 0.02, fz_max: 0.08, doc_max_D: 7,  notes: '' },
    },
    broca_forstner: {
        mdf:        { Vc_min: 30, Vc_max: 80, fz_min: 0.02, fz_max: 0.08, doc_max_D: 1.5, notes: 'RPM baixo para Forstner — evitar queima' },
        mdp:        { Vc_min: 30, Vc_max: 80, fz_min: 0.02, fz_max: 0.08, doc_max_D: 1.5, notes: '' },
        compensado: { Vc_min: 25, Vc_max: 70, fz_min: 0.02, fz_max: 0.07, doc_max_D: 1.2, notes: '' },
        pinus:      { Vc_min: 40, Vc_max: 90, fz_min: 0.03, fz_max: 0.10, doc_max_D: 2.0, notes: '' },
        eucalipto:  { Vc_min: 20, Vc_max: 60, fz_min: 0.01, fz_max: 0.06, doc_max_D: 1.0, notes: '' },
        carvalho:   { Vc_min: 15, Vc_max: 50, fz_min: 0.01, fz_max: 0.05, doc_max_D: 0.8, notes: '' },
        teca:       { Vc_min: 18, Vc_max: 55, fz_min: 0.01, fz_max: 0.06, doc_max_D: 0.9, notes: '' },
    },
    serra: {
        mdf:        { Vc_min: 40, Vc_max: 100, fz_min: 0.05, fz_max: 0.20, doc_max_D: 0.5, notes: 'Serra disco — velocidade periférica alta' },
        mdp:        { Vc_min: 40, Vc_max: 100, fz_min: 0.05, fz_max: 0.20, doc_max_D: 0.5, notes: '' },
        compensado: { Vc_min: 35, Vc_max: 90,  fz_min: 0.04, fz_max: 0.18, doc_max_D: 0.4, notes: '' },
        pinus:      { Vc_min: 50, Vc_max: 120, fz_min: 0.06, fz_max: 0.24, doc_max_D: 0.6, notes: '' },
        eucalipto:  { Vc_min: 30, Vc_max: 80,  fz_min: 0.03, fz_max: 0.15, doc_max_D: 0.3, notes: '' },
        carvalho:   { Vc_min: 25, Vc_max: 70,  fz_min: 0.03, fz_max: 0.12, doc_max_D: 0.25, notes: '' },
        teca:       { Vc_min: 28, Vc_max: 75,  fz_min: 0.03, fz_max: 0.13, doc_max_D: 0.28, notes: '' },
    },
};

const MATERIAIS = [
    { value: 'mdf',        label: 'MDF' },
    { value: 'mdp',        label: 'MDP / Aglomerado' },
    { value: 'compensado', label: 'Compensado / Plywood' },
    { value: 'pinus',      label: 'Pinus (madeira macia)' },
    { value: 'eucalipto',  label: 'Eucalipto / Jatobá' },
    { value: 'carvalho',   label: 'Carvalho / Ipê (dura)' },
    { value: 'teca',       label: 'Teca / Cumaru (oleosa)' },
];

// Ajuste de fz por diâmetro: fz escala com sqrt(D/D_ref) — ferramenta maior tolera mais cavaco
function scaleFz(fz_ref, diametro, d_ref = 6) {
    return fz_ref * Math.sqrt(diametro / d_ref);
}

function CalculadoraParametros({ tipoCorte, diametro, numCortes, onApply }) {
    const [mat, setMat] = useState('mdf');
    const [modo, setModo] = useState(1); // 0=conservador, 1=normal, 2=agressivo
    const [open, setOpen] = useState(false);

    const tipo = tipoCorte || 'fresa_reta';
    const D = diametro || 6;
    const nZ = numCortes || 2;

    const tbl = (CUTTING_PARAMS[tipo] || CUTTING_PARAMS.fresa_reta)[mat] || null;

    // Interpola entre min e max baseado no modo (0→min, 1→mid, 2→max)
    const lerp = (a, b, t) => a + (b - a) * t;
    const t = modo / 2; // 0, 0.5, 1

    const Vc = tbl ? Math.round(lerp(tbl.Vc_min, tbl.Vc_max, t)) : 0;
    const fz_ref = tbl ? lerp(tbl.fz_min, tbl.fz_max, t) : 0;
    const fz = scaleFz(fz_ref, D);
    const RPM = D > 0 ? Math.round(Vc * 1000 / (Math.PI * D)) : 0;
    const Feed = Math.round(RPM * fz * nZ);
    const doc_mm = tbl ? +(tbl.doc_max_D * D).toFixed(1) : 0;

    // Cores para modo
    const modeColors = ['#22c55e', '#3b82f6', '#f59e0b'];
    const modeLabels = ['Conservador', 'Normal', 'Agressivo'];
    const modeColor = modeColors[modo];

    return (
        <div style={{ marginBottom: 14 }}>
            {/* Cabeçalho clicável */}
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', textAlign: 'left', border: 'none', background: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 0', marginBottom: open ? 10 : 0,
                }}
            >
                <Zap size={12} color="#f59e0b" />
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                    Calculadora de Parâmetros de Corte
                </span>
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700 }}>
                    NOVO
                </span>
                {open ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
            </button>

            {open && (
                <div style={{
                    padding: 14, borderRadius: 10,
                    border: '1px solid rgba(245,158,11,0.25)',
                    background: 'rgba(245,158,11,0.04)',
                }}>
                    {/* Linha 1: Material + Modo */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 14, alignItems: 'start' }}>
                        <div>
                            <label className={Z.lbl} style={{ fontSize: 9, marginBottom: 4, display: 'block' }}>Material a usinado</label>
                            <select
                                value={mat}
                                onChange={e => setMat(e.target.value)}
                                className={Z.inp}
                                style={{ fontSize: 12 }}
                            >
                                {MATERIAIS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={Z.lbl} style={{ fontSize: 9, marginBottom: 4, display: 'block', textAlign: 'center' }}>Modo</label>
                            <div style={{ display: 'flex', gap: 3 }}>
                                {modeLabels.map((lb, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setModo(i)}
                                        style={{
                                            padding: '5px 9px', fontSize: 10, fontWeight: modo === i ? 700 : 500,
                                            borderRadius: 6, cursor: 'pointer', border: `1.5px solid ${modo === i ? modeColors[i] : 'var(--border)'}`,
                                            background: modo === i ? `${modeColors[i]}18` : 'var(--bg-elevated)',
                                            color: modo === i ? modeColors[i] : 'var(--text-muted)',
                                            transition: 'all .12s',
                                        }}
                                    >{lb}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {tbl ? (
                        <>
                            {/* Cards de resultado */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                                {[
                                    { lb: 'RPM',       val: RPM.toLocaleString(),     unit: 'rpm',    color: '#3b82f6', tip: `Vc=${Vc} m/min` },
                                    { lb: 'Feed',      val: Feed.toLocaleString(),     unit: 'mm/min', color: '#22c55e', tip: `${nZ} dentes × ${fz.toFixed(3)} mm/dente` },
                                    { lb: 'Chip Load', val: fz.toFixed(3),             unit: 'mm/z',   color: '#8b5cf6', tip: `fz ref: ${fz_ref.toFixed(3)} (Ø6)` },
                                    { lb: 'DOC Máx',   val: doc_mm,                    unit: 'mm',     color: '#f59e0b', tip: `${tbl.doc_max_D}× diâmetro` },
                                ].map(s => (
                                    <div key={s.lb} title={s.tip} style={{
                                        padding: '8px 10px', borderRadius: 8, textAlign: 'center',
                                        border: `1.5px solid ${s.color}30`,
                                        background: `${s.color}0d`,
                                        cursor: 'help',
                                    }}>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: 'monospace', lineHeight: 1 }}>{s.val}</div>
                                        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>{s.unit}</div>
                                        <div style={{ fontSize: 9, color: s.color, fontWeight: 700, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.lb}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Fórmulas */}
                            <div style={{
                                display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10,
                                padding: '6px 10px', borderRadius: 6, background: 'var(--bg-muted)', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace',
                            }}>
                                <span>Vc = {Vc} m/min</span>
                                <span>·</span>
                                <span>RPM = Vc×1000 / (π×{D}) = {RPM.toLocaleString()}</span>
                                <span>·</span>
                                <span>Feed = {RPM.toLocaleString()} × {fz.toFixed(3)} × {nZ} = {Feed.toLocaleString()} mm/min</span>
                            </div>

                            {/* Nota do material */}
                            {tbl.notes && (
                                <div style={{ fontSize: 10, color: '#854d0e', background: '#fef9c3', border: '1px solid #fef08a', borderRadius: 6, padding: '5px 10px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <AlertTriangle size={10} /> {tbl.notes}
                                </div>
                            )}

                            {/* Botão aplicar */}
                            <button
                                onClick={() => onApply(RPM, Feed)}
                                style={{
                                    width: '100%', padding: '9px 0', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 12,
                                    border: `1.5px solid ${modeColor}`, background: `${modeColor}15`, color: modeColor,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = `${modeColor}30`; }}
                                onMouseLeave={e => { e.currentTarget.style.background = `${modeColor}15`; }}
                            >
                                <Check size={14} /> Aplicar à Ferramenta — {RPM.toLocaleString()} RPM / {Feed.toLocaleString()} mm/min
                            </button>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 11 }}>
                            Sem dados para {tipo} + {mat}
                        </div>
                    )}

                    {/* Aviso informativo */}
                    <div style={{ marginTop: 10, fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        ℹ️ Valores calculados para fresas carbide com refrigeração a ar. fz ajustado para Ø{D}mm (referência Ø6mm).
                        Modo <b>{modeLabels[modo]}</b>: Vc = {Vc} m/min · fz = {fz.toFixed(3)} mm/dente.
                        Confirme com dados do fabricante antes de usar em produção.
                    </div>
                </div>
            )}
        </div>
    );
}

// Parâmetros do Otimizador
