// Extraído automaticamente de ProducaoCNC.jsx (linhas 10405-10447).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';

export function BarcodeSVG({ value, width = 120, height = 28 }) {
    // Gera barras pseudo-aleatórias baseadas no valor para visual de code128
    const bars = [];
    const str = String(value);
    let x = 0;
    // Start pattern
    bars.push({ x, w: 2, fill: true }); x += 3;
    bars.push({ x, w: 1, fill: true }); x += 2;
    bars.push({ x, w: 1, fill: true }); x += 2;
    bars.push({ x, w: 2, fill: true }); x += 3;
    // Encode each char
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        const widths = [(c % 3) + 1, ((c >> 2) % 2) + 1, ((c >> 4) % 3) + 1, ((c >> 1) % 2) + 1];
        for (let j = 0; j < widths.length; j++) {
            bars.push({ x, w: widths[j], fill: j % 2 === 0 });
            x += widths[j] + 0.5;
        }
        x += 1;
    }
    // Stop pattern
    bars.push({ x, w: 2, fill: true }); x += 3;
    bars.push({ x, w: 3, fill: true }); x += 4;
    bars.push({ x, w: 1, fill: true }); x += 2;

    const totalW = x;
    const scale = width / totalW;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {bars.filter(b => b.fill).map((b, i) => (
                <rect key={i} x={b.x * scale} y={0} width={Math.max(b.w * scale, 1)} height={height - 8} fill="#000" />
            ))}
            <text x={width / 2} y={height - 1} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="#000">
                {value}
            </text>
        </svg>
    );
}

// ═══════════════════════════════════════════════════════
// ABA: MATERIAIS — Cadastro completo
// ═══════════════════════════════════════════════════════
