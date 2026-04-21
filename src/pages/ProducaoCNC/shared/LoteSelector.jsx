// Extraído automaticamente de ProducaoCNC.jsx (linhas 362-386).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';

export function LoteSelector({ lotes, loteAtual, setLoteAtual }) {
    return (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Lote:</span>
            <select
                value={loteAtual?.id || ''}
                onChange={e => {
                    const l = lotes.find(x => x.id === Number(e.target.value));
                    setLoteAtual(l || null);
                }}
                className={Z.inp}
                style={{ minWidth: 260, fontSize: 13 }}
            >
                <option value="">Selecione um lote...</option>
                {lotes.map(l => (
                    <option key={l.id} value={l.id}>#{l.id} — {l.nome} ({l.total_pecas} pç) [{l.status}]</option>
                ))}
            </select>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ABA 1: IMPORTAR
// ═══════════════════════════════════════════════════════
