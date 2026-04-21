// Extraído automaticamente de ProducaoCNC.jsx (linhas 1148-1161).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';

export function InfoCard({ label, value, highlight }) {
    return (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--primary)' : 'var(--text-primary)' }}>
                {value || '-'}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// RELATÓRIO DE DESPERDÍCIO
// ═══════════════════════════════════════════════════════
