// Extraído automaticamente de ProducaoCNC.jsx (linhas 11389-11600).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize, Sparkles, Download as DownloadIcon, Factory } from 'lucide-react';

// Mapa de ícones por iconKey usado em PRESET_DESCRICOES
const PRESET_ICONS = {
    industrial: Factory,
    expedicao: Package,
    producao: Wrench,
    controle: ClipboardCheck,
};
import EditorEtiquetas, { EtiquetaSVG } from '../../../../components/EditorEtiquetas';
import { ETIQUETA_PRESETS, PRESET_DESCRICOES } from '../../shared/etiquetaPresets.js';
import PecaViewer3D from '../../../../components/PecaViewer3D';
import PecaEditor from '../../../../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../../components/ToolpathSimulator';
import GcodeSimWrapper from '../../../../components/GcodeSimWrapper';
import SlidePanel from '../../../../components/SlidePanel';
import ToolbarDropdown from '../../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../../shared/constants.js';


const FORMATOS_ETIQUETA = {
    '100x70': { w: 100, h: 70, nome: '100 × 70 mm' },
    '100x50': { w: 100, h: 50, nome: '100 × 50 mm' },
    '90x60':  { w: 90, h: 60, nome: '90 × 60 mm' },
    '80x50':  { w: 80, h: 50, nome: '80 × 50 mm' },
    '70x40':  { w: 70, h: 40, nome: '70 × 40 mm (compacta)' },
    'a7':     { w: 105, h: 74, nome: 'A7 (105 × 74 mm)' },
};

const FONTES_TAMANHO = {
    'pequeno': { body: 9, label: 8, title: 10, ctrl: 14 },
    'medio':   { body: 11, label: 10, title: 12, ctrl: 18 },
    'grande':  { body: 13, label: 11, title: 14, ctrl: 22 },
};

export function CfgEtiquetas({ notify, setEditorMode, setEditorTemplateId }) {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [importingPreset, setImportingPreset] = useState(null); // índice do preset sendo importado
    const [showPresets, setShowPresets] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/cnc/etiqueta-templates').then(data => {
            const list = Array.isArray(data) ? data : (data.data || []);
            // Load full template data (with elementos) for previews
            Promise.all(list.map(t =>
                api.get(`/cnc/etiqueta-templates/${t.id}`).then(resp => {
                    const d = resp.data || resp;
                    if (typeof d.elementos === 'string') d.elementos = JSON.parse(d.elementos);
                    return d;
                }).catch(() => t)
            )).then(full => { setTemplates(full); setLoading(false); });
        }).catch(() => setLoading(false));
    }, []);
    useEffect(() => { load(); }, [load]);

    const openEditor = (templateId) => {
        setEditorTemplateId?.(templateId || null);
        setEditorMode?.(true);
    };

    const criarNovo = async () => {
        try {
            const resp = await api.post('/cnc/etiqueta-templates', { nome: 'Nova Etiqueta', largura: 100, altura: 70, elementos: [] });
            const newId = resp?.id || resp?.data?.id;
            if (newId) openEditor(newId);
            else { load(); notify('Template criado'); }
        } catch { notify('Erro ao criar template'); }
    };

    const duplicar = async (id) => {
        try {
            await api.post(`/cnc/etiqueta-templates/${id}/duplicar`);
            load();
            notify('Template duplicado');
        } catch { notify('Erro ao duplicar'); }
    };

    const excluir = async (id) => {
        try {
            await api.del(`/cnc/etiqueta-templates/${id}`);
            setConfirmDelete(null);
            load();
            notify('Template excluído');
        } catch (e) { notify(e?.message || 'Erro ao excluir'); }
    };

    const definirPadrao = async (id) => {
        try {
            await api.put(`/cnc/etiqueta-templates/${id}/padrao`);
            load();
            notify('Template definido como padrão');
        } catch { notify('Erro ao definir padrão'); }
    };

    const importarPreset = async (idx) => {
        setImportingPreset(idx);
        try {
            const preset = ETIQUETA_PRESETS[idx];
            const resp = await api.post('/cnc/etiqueta-templates', {
                nome: preset.nome,
                largura: preset.largura,
                altura: preset.altura,
                colunas_impressao: preset.colunas_impressao,
                margem_pagina: preset.margem_pagina,
                gap_etiquetas: preset.gap_etiquetas,
                elementos: preset.elementos,
            });
            const newId = resp?.id || resp?.data?.id;
            notify(`Modelo "${preset.nome}" importado com sucesso`);
            load();
            if (newId) {
                // Abrir editor automaticamente após import
                setTimeout(() => {
                    setEditorTemplateId?.(newId);
                    setEditorMode?.(true);
                }, 400);
            }
        } catch (e) {
            notify('Erro ao importar modelo: ' + (e?.message || ''));
        } finally {
            setImportingPreset(null);
        }
    };

    if (loading) return <Spinner text="Carregando templates..." />;

    return (
        <div className="glass-card p-4">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <TagIcon size={18} style={{ color: 'var(--primary)' }} />
                    Templates de Etiquetas
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>({templates.length})</span>
                </h3>
                <button onClick={criarNovo}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px',
                        background: 'linear-gradient(135deg, var(--primary), #e67e22)', color: '#fff',
                        border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', boxShadow: '0 3px 12px rgba(230, 126, 34, 0.3)',
                        transition: 'all .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    <Plus size={15} />
                    Criar Nova Etiqueta
                </button>
            </div>

            {/* ── Modelos Profissionais (Presets) ────────────────── */}
            <div style={{ marginBottom: 20 }}>
                {/* Cabeçalho da seção */}
                <button
                    onClick={() => setShowPresets(s => !s)}
                    style={{
                        width: '100%', textAlign: 'left', border: 'none', background: 'none',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 0', marginBottom: showPresets ? 12 : 0,
                    }}
                >
                    <Sparkles size={14} color="#f59e0b" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                        Modelos Profissionais
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {showPresets ? 'Ocultar' : 'Mostrar'} ({ETIQUETA_PRESETS.length} modelos)
                    </span>
                    {showPresets ? <ChevronUp size={13} color="var(--text-muted)" /> : <ChevronDown size={13} color="var(--text-muted)" />}
                </button>

                {showPresets && (
                    <>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, padding: '6px 10px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6 }}>
                            Clique em <b>Usar modelo</b> para importar um template pré-configurado e editá-lo no editor visual.
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                            {ETIQUETA_PRESETS.map((preset, idx) => {
                                const meta = PRESET_DESCRICOES[idx] || {};
                                const isImporting = importingPreset === idx;
                                return (
                                    <div key={idx} style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: 10, overflow: 'hidden',
                                        background: 'var(--bg-elevated)',
                                        transition: 'box-shadow .15s',
                                        display: 'flex', flexDirection: 'column',
                                    }}>
                                        {/* Preview SVG */}
                                        <div style={{
                                            height: 120, background: '#f8f8f8', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            borderBottom: '1px solid var(--border)', padding: 8, position: 'relative',
                                        }}>
                                            <EtiquetaSVG
                                                template={{ ...preset, elementos: preset.elementos }}
                                                etiqueta={null}
                                                cfg={{}}
                                                width={Math.min(220, preset.largura * (100 / preset.altura))}
                                            />
                                            {/* Badge */}
                                            <div style={{
                                                position: 'absolute', top: 6, left: 6,
                                                fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                                                background: meta.badgeColor || '#888', color: '#fff',
                                                letterSpacing: '0.05em',
                                            }}>
                                                {meta.badge}
                                            </div>
                                            {(() => {
                                                const IconCmp = PRESET_ICONS[meta.iconKey];
                                                return IconCmp ? (
                                                    <div style={{ position: 'absolute', top: 6, right: 6, color: 'var(--text-muted)' }}>
                                                        <IconCmp size={16} />
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>

                                        {/* Info */}
                                        <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {preset.nome}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                                {meta.descricao}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                                                <span>📐 {preset.largura}×{preset.altura}mm</span>
                                                <span>·</span>
                                                <span>{preset.elementos.length} elementos</span>
                                                <span>·</span>
                                                <span>{preset.colunas_impressao} col.</span>
                                            </div>
                                            {meta.uso && (
                                                <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>
                                                    Uso: {meta.uso}
                                                </div>
                                            )}
                                        </div>

                                        {/* Ação */}
                                        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                                            <button
                                                onClick={() => importarPreset(idx)}
                                                disabled={isImporting}
                                                style={{
                                                    width: '100%', padding: '7px 12px',
                                                    background: isImporting ? 'var(--bg-muted)' : 'linear-gradient(135deg, #f59e0b, #e67e22)',
                                                    color: isImporting ? 'var(--text-muted)' : '#fff',
                                                    border: 'none', borderRadius: 7, fontSize: 11,
                                                    fontWeight: 700, cursor: isImporting ? 'not-allowed' : 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                    transition: 'all .15s',
                                                }}
                                            >
                                                {isImporting
                                                    ? <><RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> Importando...</>
                                                    : <><DownloadIcon size={11} /> Usar este modelo</>
                                                }
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* ── Divisória ─────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Meus Templates ({templates.length})
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Template cards */}
            {templates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)', background: 'var(--bg-muted)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                    <TagIcon size={36} style={{ opacity: 0.25, marginBottom: 10 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nenhum template criado ainda</div>
                    <div style={{ fontSize: 11 }}>Use um modelo acima ou clique em "Criar Nova Etiqueta"</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {templates.map(t => {
                        const isPadrao = !!t.padrao;
                        const elCount = Array.isArray(t.elementos) ? t.elementos.length : 0;
                        const parsedEls = Array.isArray(t.elementos) ? t.elementos : [];
                        return (
                            <div key={t.id} style={{
                                display: 'flex', gap: 14, padding: '12px 14px',
                                background: isPadrao ? 'linear-gradient(135deg, rgba(59,130,246,0.04), rgba(59,130,246,0.08))' : 'var(--bg-muted)',
                                border: '1px solid', borderColor: isPadrao ? 'rgba(59,130,246,0.25)' : 'var(--border)',
                                borderRadius: 10, transition: 'all .15s', position: 'relative',
                            }}>
                                {/* Mini SVG preview */}
                                <div style={{
                                    width: 120, minHeight: 80, flexShrink: 0,
                                    background: '#fff', borderRadius: 6, border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', cursor: 'pointer',
                                }} onClick={() => openEditor(t.id)}>
                                    {parsedEls.length > 0 ? (
                                        <EtiquetaSVG template={{ ...t, elementos: parsedEls }} etiqueta={null} cfg={{}} width={110} />
                                    ) : (
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
                                            Vazio
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.nome || 'Sem nome'}
                                        </span>
                                        {isPadrao && (
                                            <span style={{
                                                fontSize: 9, fontWeight: 700, padding: '2px 7px',
                                                background: 'var(--primary)', color: '#fff', borderRadius: 20,
                                                textTransform: 'uppercase', letterSpacing: '0.04em',
                                            }}>Padrão</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span>{t.largura || 100} × {t.altura || 70} mm</span>
                                        <span>·</span>
                                        <span>{elCount} elemento{elCount !== 1 ? 's' : ''}</span>
                                        <span>·</span>
                                        <span>{t.colunas_impressao || 2} col.</span>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                                        <button onClick={() => openEditor(t.id)}
                                            className={Z.btn}
                                            style={{ fontSize: 11, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <PenTool size={11} /> Editar
                                        </button>
                                        <button onClick={() => duplicar(t.id)}
                                            className={Z.btn2}
                                            style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Copy size={11} /> Duplicar
                                        </button>
                                        {!isPadrao && (
                                            <button onClick={() => definirPadrao(t.id)}
                                                className={Z.btn2}
                                                style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Star size={11} /> Definir Padrão
                                            </button>
                                        )}
                                        {!isPadrao && (
                                            <button onClick={() => setConfirmDelete(t.id)}
                                                style={{
                                                    fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4,
                                                    background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                                                    color: '#ef4444', cursor: 'pointer',
                                                }}>
                                                <Trash2 size={11} /> Excluir
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Confirm delete modal */}
            {confirmDelete && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                    onClick={() => setConfirmDelete(null)}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, minWidth: 340, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}
                        onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Excluir Template?</h3>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                            Esta ação não pode ser desfeita. O template será permanentemente removido.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className={Z.btn2} onClick={() => setConfirmDelete(null)} style={{ fontSize: 12 }}>Cancelar</button>
                            <button onClick={() => excluir(confirmDelete)}
                                style={{
                                    padding: '6px 16px', background: '#ef4444', color: '#fff', border: 'none',
                                    borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                }}>
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 5: G-CODE
// ═══════════════════════════════════════════════════════
