// Extraído automaticamente de ProducaoCNC.jsx (linhas 7463-7620).
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

export function GcodePreviewModal({ data, onDownload, onSendToMachine, onClose, onSimulate }) {
    const { gcode, filename, stats, alertas, chapaIdx, contorno_tool } = data;
    const lines = (gcode || '').split('\n');
    const lineCount = lines.length;
    const sizeKB = new Blob([gcode]).size / 1024;
    const [showFull, setShowFull] = useState(false);
    const [abaPreview, setAbaPreview] = useState('sim2d');
    const previewLines = showFull ? lines : lines.slice(0, 80);
    const textareaRef = useRef(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(gcode).then(() => {}).catch(() => {
            if (textareaRef.current) { textareaRef.current.select(); document.execCommand('copy'); }
        });
    };

    // Extrair chapa data se disponível
    const chapaData = data.chapa || null;

    return (
        <Modal title={`Preview G-Code — Chapa ${chapaIdx + 1}`} close={onClose} w={820}>
            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6, marginBottom: 10 }}>
                {[
                    { lb: 'Tempo Est.', val: stats.tempo_estimado_min ? `${stats.tempo_estimado_min} min` : '—', color: '#e67e22' },
                    { lb: 'Operacoes', val: stats.total_operacoes ?? 0, color: '#3b82f6' },
                    { lb: 'Trocas Ferr.', val: stats.trocas_ferramenta ?? 0, color: stats.trocas_ferramenta > 3 ? '#f59e0b' : '#22c55e' },
                    { lb: 'Contornos', val: (stats.contornos_peca ?? 0) + (stats.contornos_sobra ?? 0), color: '#8b5cf6' },
                    { lb: 'Dist. Corte', val: stats.dist_corte_m ? `${stats.dist_corte_m}m` : '—', color: '#a6e3a1' },
                    { lb: 'Dist. Rapido', val: stats.dist_rapido_m ? `${stats.dist_rapido_m}m` : '—', color: '#f38ba8' },
                    { lb: 'Linhas', val: lineCount, color: 'var(--text-muted)' },
                    { lb: 'Tamanho', val: `${sizeKB.toFixed(1)} KB`, color: 'var(--text-muted)' },
                ].map(s => (
                    <div key={s.lb} style={{ padding: '6px 8px', background: 'var(--bg-muted)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.val}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.lb}</div>
                    </div>
                ))}
            </div>

            {contorno_tool && (
                <div style={{ fontSize: 11, padding: '5px 10px', background: '#f0fdf4', borderRadius: 6, marginBottom: 6, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={12} style={{ color: '#16a34a' }} />
                    <span>Contorno: <b>{contorno_tool.nome || contorno_tool.codigo}</b> (D{contorno_tool.diametro}mm)</span>
                </div>
            )}

            {alertas.length > 0 && (
                <div style={{ marginBottom: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {alertas.map((a, i) => {
                        const isCrit = (a.tipo || '').includes('erro') || (a.tipo || '').includes('critico');
                        return (
                            <div key={i} style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 6, marginBottom: 2,
                                background: isCrit ? '#fef2f2' : '#fefce8',
                                border: `1px solid ${isCrit ? '#fecaca' : '#fef08a'}`,
                                display: 'flex', alignItems: 'center', gap: 6,
                                color: isCrit ? '#991b1b' : '#854d0e',
                                fontWeight: isCrit ? 600 : 400,
                            }}>
                                <AlertTriangle size={12} /> {a.msg || a}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Tabs: Codigo | Simulador */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                {[{ id: 'sim2d', lb: 'Simulador' }, { id: 'codigo', lb: 'Código' }].map(t => (
                    <button key={t.id} onClick={() => setAbaPreview(t.id)} style={{
                        padding: '5px 16px', fontSize: 11, fontWeight: abaPreview === t.id ? 700 : 500,
                        borderRadius: '6px 6px 0 0', cursor: 'pointer', transition: 'all .15s',
                        background: abaPreview === t.id ? '#1e1e2e' : 'var(--bg-muted)',
                        color: abaPreview === t.id ? '#cdd6f4' : 'var(--text-muted)',
                        border: abaPreview === t.id ? '1px solid var(--border)' : '1px solid transparent',
                        borderBottom: abaPreview === t.id ? '1px solid #1e1e2e' : '1px solid var(--border)',
                    }}>{t.lb}</button>
                ))}
                <div style={{ flex: 1, borderBottom: '1px solid var(--border)' }} />
            </div>

            {abaPreview === 'codigo' && (
                <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                            {showFull ? `Todas ${lineCount} linhas` : `Primeiras ${Math.min(80, lineCount)} de ${lineCount} linhas`}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {lineCount > 80 && (
                                <button onClick={() => setShowFull(!showFull)} className={Z.btn2} style={{ fontSize: 10, padding: '2px 8px' }}>
                                    {showFull ? 'Menos' : `Ver tudo (${lineCount})`}
                                </button>
                            )}
                            <button onClick={handleCopy} className={Z.btn2} style={{ fontSize: 10, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Copy size={10} /> Copiar
                            </button>
                        </div>
                    </div>
                    <pre ref={textareaRef} style={{
                        fontFamily: 'monospace', fontSize: 10, lineHeight: 1.5,
                        background: '#1e1e2e', color: '#cdd6f4', padding: 12, borderRadius: 8,
                        maxHeight: 340, overflow: 'auto', whiteSpace: 'pre', margin: 0,
                        border: '1px solid var(--border)',
                    }}>
                        {previewLines.map((line, i) => {
                            let color = '#cdd6f4';
                            const stripped = line.replace(/^N\d+\s*/, '');
                            if (stripped.startsWith('(') || stripped.startsWith(';')) color = '#6c7086';
                            else if (/^(N\d+\s+)?G0[0 ]/.test(line)) color = '#f38ba8';
                            else if (/^(N\d+\s+)?G0?1[ ]/.test(line)) color = '#a6e3a1';
                            else if (/^(N\d+\s+)?G[23]/.test(line)) color = '#89b4fa';
                            else if (/^(N\d+\s+)?[MS]/.test(line)) color = '#fab387';
                            else if (/^(N\d+\s+)?T/.test(line)) color = '#f9e2af';
                            else if (/^(N\d+\s+)?G4/.test(line)) color = '#cba6f7';
                            return <span key={i} style={{ color }}>{`${String(i + 1).padStart(4)} | ${line}\n`}</span>;
                        })}
                        {!showFull && lineCount > 80 && <span style={{ color: '#6c7086' }}>     | ... ({lineCount - 80} linhas restantes) ...\n</span>}
                    </pre>
                </div>
            )}

            {abaPreview === 'sim2d' && (
                <GcodeSimWrapper gcode={gcode} chapa={chapaData} />
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={onClose} className={Z.btn2} style={{ padding: '8px 20px' }}>Fechar</button>
                {gcode && onSimulate && (
                    <button onClick={() => onSimulate(gcode, chapaData)} className={Z.btn2}
                        style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <Play size={14} /> Simular Percurso
                    </button>
                )}
                {gcode && (
                    <button onClick={onDownload} className={Z.btn} style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 6, background: '#e67e22', fontSize: 13, fontWeight: 700 }}>
                        <Download size={15} /> Baixar {filename}
                    </button>
                )}
                {gcode && onSendToMachine && (
                    <button onClick={onSendToMachine} className={Z.btn2} style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                        <Send size={14} /> Enviar p/ Maquina
                    </button>
                )}
                {!gcode && data.ferramentas_faltando?.length > 0 && (
                    <div style={{ padding: '8px 16px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', fontSize: 12, color: '#991b1b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={14} /> Adicione as ferramentas faltantes para gerar o G-Code
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ─── Build piece outline incorporating open passante millings ──
// Removes waste (refugo) from the piece contour so only the real piece shape is shown.
// Algorithm: walk rectangle CCW, replace waste arc with milling path.
