// Extraído automaticamente de ProducaoCNC.jsx (linhas 12161-12242).
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
import { CfgChapas } from './CfgChapas.jsx';
import { CfgMaquinas } from './CfgMaquinas.jsx';
import { CfgUsinagem } from './CfgUsinagem.jsx';
import { CfgParametros } from './CfgParametros.jsx';
import { CfgEtiquetas } from './CfgEtiquetas.jsx';
import { CfgRetalhos } from './CfgRetalhos.jsx';

export function TabConfig({ notify, setEditorMode, setEditorTemplateId, initialSection, setConfigSection }) {
    const [activeSection, setActiveSection] = useState(initialSection || 'maquinas');
    const [cfgSearch, setCfgSearch] = useState('');
    const handleSection = (id) => { setActiveSection(id); setConfigSection?.(id); setCfgSearch(''); };

    const CONFIG_SECTIONS = [
        { id: 'maquinas', lb: 'Máquinas CNC', ic: Monitor, desc: 'Cadastro de máquinas CNC, ferramentas, origens' },
        { id: 'chapas', lb: 'Chapas', ic: Layers, desc: 'Chapas de MDF, MDP, compensado, dimensões' },
        { id: 'usinagem', lb: 'Tipos de Usinagem', ic: PenTool, desc: 'Furos, rebaixos, canais, contornos, profundidade' },
        { id: 'parametros', lb: 'Parâmetros', ic: Settings, desc: 'Algoritmo otimizador, margem, kerf, rotação' },
        { id: 'etiquetas', lb: 'Etiquetas', ic: TagIcon, desc: 'Templates de etiquetas, formato, campos' },
        { id: 'retalhos', lb: 'Retalhos', ic: Package, desc: 'Estoque de retalhos, aproveitamento, sobras' },
    ];

    const filteredSections = cfgSearch
        ? CONFIG_SECTIONS.filter(s => s.lb.toLowerCase().includes(cfgSearch.toLowerCase()) || s.desc.toLowerCase().includes(cfgSearch.toLowerCase()))
        : CONFIG_SECTIONS;

    return (
        <div style={{ display: 'flex', gap: 0, minHeight: 500 }}>
            {/* Sidebar */}
            <div style={{
                width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
                borderRight: '1px solid var(--border)', background: 'var(--bg-muted)',
                borderRadius: '10px 0 0 10px', overflow: 'hidden',
            }}>
                {/* Search */}
                <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ position: 'relative' }}>
                        <SearchIcon size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input value={cfgSearch} onChange={e => setCfgSearch(e.target.value)}
                            placeholder="Buscar config..."
                            className={Z.inp} style={{ fontSize: 11, padding: '6px 8px 6px 28px', width: '100%' }} />
                    </div>
                </div>
                {/* Section list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                    {filteredSections.map(s => {
                        const SIc = s.ic;
                        const isActive = activeSection === s.id;
                        return (
                            <button key={s.id} onClick={() => handleSection(s.id)}
                                style={{
                                    width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                                    background: isActive ? 'var(--bg-card)' : 'transparent',
                                    color: isActive ? 'var(--primary)' : 'var(--text-primary)',
                                    fontWeight: isActive ? 700 : 400,
                                    borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                                    transition: 'all .15s',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover, rgba(0,0,0,0.03))'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}>
                                <SIc size={15} style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }} />
                                <div style={{ textAlign: 'left' }}>
                                    <div>{s.lb}</div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginTop: 1 }}>{s.desc.split(',')[0]}</div>
                                </div>
                            </button>
                        );
                    })}
                    {filteredSections.length === 0 && (
                        <div style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                            Nenhuma seção encontrada
                        </div>
                    )}
                </div>
            </div>
            {/* Content */}
            <div style={{ flex: 1, padding: 16, minWidth: 0 }}>
                {activeSection === 'maquinas' && <CfgMaquinas notify={notify} />}
                {activeSection === 'chapas' && <CfgChapas notify={notify} />}
                {activeSection === 'usinagem' && <CfgUsinagem notify={notify} />}
                {activeSection === 'parametros' && <CfgParametros notify={notify} />}
                {activeSection === 'etiquetas' && <CfgEtiquetas notify={notify} setEditorMode={setEditorMode} setEditorTemplateId={setEditorTemplateId} />}
                {activeSection === 'retalhos' && <CfgRetalhos notify={notify} />}
            </div>
        </div>
    );
}

// Chapas CRUD
