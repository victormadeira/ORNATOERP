// Extraído automaticamente de ProducaoCNC.jsx (linhas 7076-7462).
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

// ═══════════════════════════════════════════════════════════════════════
// Painel de Ferramentas — Modal
// ═══════════════════════════════════════════════════════════════════════

const METHOD_LABELS = {
    drill: 'Furação direta',
    helical: 'Helicoidal',
    circular: 'Interpolação circular',
    pocket_zigzag: 'Pocket zigzag',
    pocket_espiral: 'Pocket espiral',
    groove: 'Rasgo linear',
    multi_pass: 'Multi-passada',
    desativado: 'Desativado',
};

const CATEGORIA_ICON = { hole: Circle, pocket: Square, groove: Minus, generic: Settings };
const CATEGORIA_COLOR = { hole: '#7c3aed', pocket: '#2563eb', groove: '#d97706', generic: '#6b7280' };

export function ToolPanelModal({ data, loteId, onClose, onSave }) {
    const { operacoes = [], overrides: savedOverrides = {}, overrides_peca: savedOverridesPeca = {}, ferramentas_compativeis = {}, maquina, total_operacoes = 0, total_grupos = 0 } = data;
    const [localOverrides, setLocalOverrides] = useState(() => {
        const init = {};
        operacoes.forEach(op => {
            const saved = savedOverrides[op.op_key] || {};
            init[op.op_key] = {
                ativo: saved.ativo !== undefined ? saved.ativo : true,
                metodo: saved.metodo || op.metodos_disponiveis?.[0] || 'drill',
                ferramenta_id: saved.ferramenta_id || op.tool?.id || null,
                diametro_override: saved.diametro_override ?? null,
                profundidade_override: saved.profundidade_override ?? null,
                rpm_override: saved.rpm_override ?? null,
                feed_override: saved.feed_override ?? null,
            };
        });
        return init;
    });
    const [localPecaOverrides, setLocalPecaOverrides] = useState(() => {
        const init = {};
        operacoes.forEach(op => {
            (op.pecas || []).forEach(p => {
                const key = `${op.op_key}__${p.peca_id}`;
                const saved = savedOverridesPeca[key] || {};
                init[key] = {
                    ativo: saved.ativo !== undefined ? saved.ativo : true,
                    profundidade_override: saved.profundidade_override ?? null,
                    diametro_override: saved.diametro_override ?? null,
                };
            });
        });
        return init;
    });
    const [expanded, setExpanded] = useState({});
    const [expandedPecas, setExpandedPecas] = useState({});
    const [saving, setSaving] = useState(false);
    const [filter, setFilter] = useState('');
    const [dirty, setDirty] = useState(false);

    const updateOverride = (opKey, field, value) => {
        setLocalOverrides(prev => ({ ...prev, [opKey]: { ...prev[opKey], [field]: value } }));
        setDirty(true);
    };

    const updatePecaOverride = (opKey, pecaId, field, value) => {
        const key = `${opKey}__${pecaId}`;
        setLocalPecaOverrides(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
        setDirty(true);
    };

    const toggleExpand = (opKey) => setExpanded(prev => ({ ...prev, [opKey]: !prev[opKey] }));
    const toggleExpandPecas = (opKey) => setExpandedPecas(prev => ({ ...prev, [opKey]: !prev[opKey] }));

    const handleSave = async () => {
        setSaving(true);
        try {
            const overridesList = Object.entries(localOverrides).map(([op_key, ov]) => ({ op_key, ...ov }));
            await api.post(`/cnc/lotes/${loteId}/operacoes-overrides-bulk`, { overrides: overridesList });

            // Save per-piece overrides that differ from defaults
            const pecaPromises = [];
            operacoes.forEach(op => {
                (op.pecas || []).forEach(p => {
                    const key = `${op.op_key}__${p.peca_id}`;
                    const pov = localPecaOverrides[key];
                    if (pov && (pov.ativo === false || pov.profundidade_override != null || pov.diametro_override != null)) {
                        pecaPromises.push(
                            api.post(`/cnc/lotes/${loteId}/operacoes-override-peca`, {
                                op_key: op.op_key, peca_id: p.peca_id, ...pov,
                            })
                        );
                    }
                });
            });
            if (pecaPromises.length > 0) await Promise.all(pecaPromises);

            setDirty(false);
            onSave();
        } catch (err) {
            console.error('Erro ao salvar overrides:', err);
        } finally {
            setSaving(false);
        }
    };

    const filteredOps = filter
        ? operacoes.filter(op => op.tipo_label?.toLowerCase().includes(filter.toLowerCase()) || op.op_key?.toLowerCase().includes(filter.toLowerCase()) || op.tool?.nome?.toLowerCase().includes(filter.toLowerCase()))
        : operacoes;

    const ativos = Object.values(localOverrides).filter(o => o.ativo).length;
    const desativados = operacoes.length - ativos;

    const sty = {
        card: { background: 'var(--bg-muted)', borderRadius: 8, padding: '10px 14px', marginBottom: 6, border: '1px solid var(--border)', transition: 'border-color .15s' },
        cardDisabled: { opacity: 0.45, filter: 'grayscale(0.5)' },
        label: { fontSize: 12, fontWeight: 600, color: 'var(--text)' },
        detail: { fontSize: 10, color: 'var(--text-muted)' },
        input: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 11, color: 'var(--text)', width: 70, fontFamily: 'monospace' },
        select: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 11, color: 'var(--text)', cursor: 'pointer' },
        methodBtn: (active) => ({
            padding: '3px 8px', fontSize: 10, borderRadius: 4, border: '1px solid',
            borderColor: active ? '#7c3aed' : 'var(--border)',
            background: active ? '#7c3aed' : 'transparent',
            color: active ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all .15s', fontWeight: active ? 600 : 400,
        }),
        toggleOn: { width: 32, height: 18, borderRadius: 9, background: '#7c3aed', position: 'relative', cursor: 'pointer', transition: 'background .15s', flexShrink: 0 },
        toggleOff: { width: 32, height: 18, borderRadius: 9, background: '#4a4a5a', position: 'relative', cursor: 'pointer', transition: 'background .15s', flexShrink: 0 },
        toggleKnob: (on) => ({ width: 14, height: 14, borderRadius: 7, background: '#fff', position: 'absolute', top: 2, left: on ? 16 : 2, transition: 'left .15s' }),
    };

    return (
        <Modal title={`Painel de Ferramentas — Lote #${loteId}`} close={onClose} w={880}>
            {/* Header stats */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#7c3aed22', borderRadius: 6, fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                    <Wrench size={12} /> {total_operacoes} operações em {total_grupos} grupos
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-muted)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Check size={12} color="#22c55e" /> {ativos} ativos
                </div>
                {desativados > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#ef444422', borderRadius: 6, fontSize: 11, color: '#ef4444' }}>
                        <X size={12} /> {desativados} desativados
                    </div>
                )}
                {maquina && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg-muted)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                        <Cpu size={12} /> {maquina.nome || maquina.modelo}
                    </div>
                )}
                <div style={{ flex: 1 }} />
                <input
                    type="text" placeholder="Filtrar operações..." value={filter} onChange={e => setFilter(e.target.value)}
                    style={{ ...sty.input, width: 180, fontSize: 11 }}
                />
            </div>

            {/* Operation groups */}
            <div style={{ maxHeight: 'calc(80vh - 180px)', overflowY: 'auto', paddingRight: 4 }}>
                {filteredOps.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>
                        {filter ? 'Nenhuma operação encontrada para o filtro' : 'Nenhuma operação detectada neste lote'}
                    </div>
                )}
                {filteredOps.map(op => {
                    const ov = localOverrides[op.op_key] || {};
                    const isActive = ov.ativo !== false;
                    const isExpanded = expanded[op.op_key];
                    const isPecasExpanded = expandedPecas[op.op_key];
                    const CatIcon = CATEGORIA_ICON[op.categoria] || Settings;
                    const catColor = CATEGORIA_COLOR[op.categoria] || '#6b7280';
                    const compatTools = ferramentas_compativeis[op.op_key] || [];

                    return (
                        <div key={op.op_key} style={{ ...sty.card, ...(isActive ? {} : sty.cardDisabled), borderColor: isActive ? catColor + '44' : 'var(--border)' }}>
                            {/* Main row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {/* Toggle */}
                                <div
                                    style={isActive ? sty.toggleOn : sty.toggleOff}
                                    onClick={() => updateOverride(op.op_key, 'ativo', !isActive)}
                                >
                                    <div style={sty.toggleKnob(isActive)} />
                                </div>

                                {/* Icon + label */}
                                <CatIcon size={16} color={catColor} style={{ flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={sty.label}>
                                        {op.tipo_label}{op.diametro ? ` Ø${op.diametro}mm` : ''}
                                    </div>
                                    <div style={sty.detail}>
                                        {op.count} operações em {op.total_pecas} peças
                                        {op.profundidade_media ? ` · prof. média ${op.profundidade_media.toFixed(1)}mm` : ''}
                                        {op.tool_code ? ` · ${op.tool_code}` : ''}
                                    </div>
                                </div>

                                {/* Tool assignment */}
                                {compatTools.length > 0 ? (
                                    <select
                                        value={ov.ferramenta_id || ''}
                                        onChange={e => updateOverride(op.op_key, 'ferramenta_id', e.target.value ? Number(e.target.value) : null)}
                                        style={{ ...sty.select, maxWidth: 160 }}
                                    >
                                        <option value="">Auto</option>
                                        {compatTools.map(t => (
                                            <option key={t.id} value={t.id}>{t.codigo} — {t.nome} (Ø{t.diametro})</option>
                                        ))}
                                    </select>
                                ) : op.tool ? (
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg)', borderRadius: 4 }}>
                                        {op.tool.codigo || op.tool.nome}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 10, color: '#ef4444', padding: '2px 8px', background: '#ef444422', borderRadius: 4 }}>
                                        <AlertTriangle size={10} style={{ verticalAlign: -1, marginRight: 3 }} />Sem ferramenta
                                    </span>
                                )}

                                {/* Expand button */}
                                <div
                                    onClick={() => toggleExpand(op.op_key)}
                                    style={{ cursor: 'pointer', padding: '4px', borderRadius: 4, color: 'var(--text-muted)' }}
                                >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </div>
                            </div>

                            {/* Method selector */}
                            {isActive && op.metodos_disponiveis?.length > 1 && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                                    {op.metodos_disponiveis.map(m => (
                                        <button
                                            key={m}
                                            style={sty.methodBtn(ov.metodo === m)}
                                            onClick={() => updateOverride(op.op_key, 'metodo', m)}
                                        >
                                            {METHOD_LABELS[m] || m}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Expanded overrides */}
                            {isExpanded && (
                                <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Settings size={11} /> Overrides
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Diâmetro (mm)</label>
                                            <input
                                                type="number" step="0.1"
                                                value={ov.diametro_override ?? ''}
                                                placeholder={op.diametro || '-'}
                                                onChange={e => updateOverride(op.op_key, 'diametro_override', e.target.value ? parseFloat(e.target.value) : null)}
                                                style={sty.input}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Profundidade (mm)</label>
                                            <input
                                                type="number" step="0.1"
                                                value={ov.profundidade_override ?? ''}
                                                placeholder={op.profundidade_max ? op.profundidade_max.toFixed(1) : '-'}
                                                onChange={e => updateOverride(op.op_key, 'profundidade_override', e.target.value ? parseFloat(e.target.value) : null)}
                                                style={sty.input}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>RPM</label>
                                            <input
                                                type="number" step="100"
                                                value={ov.rpm_override ?? ''}
                                                placeholder="Auto"
                                                onChange={e => updateOverride(op.op_key, 'rpm_override', e.target.value ? parseInt(e.target.value) : null)}
                                                style={sty.input}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Avanço (mm/min)</label>
                                            <input
                                                type="number" step="50"
                                                value={ov.feed_override ?? ''}
                                                placeholder="Auto"
                                                onChange={e => updateOverride(op.op_key, 'feed_override', e.target.value ? parseInt(e.target.value) : null)}
                                                style={sty.input}
                                            />
                                        </div>
                                    </div>

                                    {/* Per-piece details */}
                                    {op.pecas?.length > 0 && (
                                        <div style={{ marginTop: 10 }}>
                                            <div
                                                onClick={() => toggleExpandPecas(op.op_key)}
                                                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}
                                            >
                                                {isPecasExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                {op.pecas.length} peças com esta operação
                                            </div>
                                            {isPecasExpanded && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {op.pecas.map(p => {
                                                        const pecaKey = `${op.op_key}__${p.peca_id}`;
                                                        const pov = localPecaOverrides[pecaKey] || {};
                                                        const pecaAtivo = pov.ativo !== false;
                                                        return (
                                                            <div key={p.peca_id} style={{
                                                                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                                                                background: 'var(--bg-muted)', borderRadius: 4, fontSize: 10,
                                                                opacity: pecaAtivo ? 1 : 0.4,
                                                            }}>
                                                                <div
                                                                    style={pecaAtivo ? { ...sty.toggleOn, width: 24, height: 14, borderRadius: 7 } : { ...sty.toggleOff, width: 24, height: 14, borderRadius: 7 }}
                                                                    onClick={() => updatePecaOverride(op.op_key, p.peca_id, 'ativo', !pecaAtivo)}
                                                                >
                                                                    <div style={{ width: 10, height: 10, borderRadius: 5, background: '#fff', position: 'absolute', top: 2, left: pecaAtivo ? 12 : 2, transition: 'left .15s' }} />
                                                                </div>
                                                                <span style={{ flex: 1, fontWeight: 500, color: 'var(--text)' }}>
                                                                    {p.descricao || `Peça #${p.peca_id}`}
                                                                    {p.modulo ? <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({p.modulo})</span> : null}
                                                                </span>
                                                                <span style={{ color: 'var(--text-muted)' }}>{p.count}x</span>
                                                                {p.profundidades && (
                                                                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                                                        prof: {[...new Set(p.profundidades)].join(', ')}mm
                                                                    </span>
                                                                )}
                                                                <input
                                                                    type="number" step="0.1"
                                                                    value={pov.profundidade_override ?? ''}
                                                                    placeholder="prof."
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={e => updatePecaOverride(op.op_key, p.peca_id, 'profundidade_override', e.target.value ? parseFloat(e.target.value) : null)}
                                                                    style={{ ...sty.input, width: 50, fontSize: 10 }}
                                                                    title="Override profundidade para esta peça"
                                                                />
                                                                <input
                                                                    type="number" step="0.1"
                                                                    value={pov.diametro_override ?? ''}
                                                                    placeholder="diam."
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={e => updatePecaOverride(op.op_key, p.peca_id, 'diametro_override', e.target.value ? parseFloat(e.target.value) : null)}
                                                                    style={{ ...sty.input, width: 50, fontSize: 10 }}
                                                                    title="Override diâmetro para esta peça"
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {dirty && <span style={{ color: '#f59e0b', fontWeight: 600 }}>Alterações não salvas</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onClose} className={Z.btn2} style={{ padding: '8px 16px', fontSize: 12 }}>
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave} disabled={saving || !dirty}
                        className={Z.btn} style={{
                            padding: '8px 20px', fontSize: 12, background: '#7c3aed', color: '#fff', border: 'none',
                            opacity: (saving || !dirty) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        {saving ? <Spinner size={12} /> : <Check size={12} />}
                        {saving ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

