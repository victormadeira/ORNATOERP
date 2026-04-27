// Extraído automaticamente de ProducaoCNC.jsx (linhas 10405-10447).
import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';

// ─── Code128-B encoder — barcode real, lido por scanners industriais ─────────
// Tabela de padrões Code128 (índices 0-102): cada símbolo = 6 módulos bar/espaço
// Fonte: ISO/IEC 15417. Índice = valor do símbolo; ASCII Code-B = charCode - 32.
const _C128 = [
    [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2], // 0-4
    [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3], // 5-9
    [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1], // 10-14
    [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2], // 15-19
    [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2], // 20-24
    [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1], // 25-29
    [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3], // 30-34
    [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3], // 35-39
    [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1], // 40-44
    [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1], // 45-49
    [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3], // 50-54
    [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1], // 55-59
    [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2], // 60-64
    [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4], // 65-69
    [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1], // 70-74
    [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1], // 75-79
    [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2], // 80-84
    [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1], // 85-89
    [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1], // 90-94
    [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1], // 95-99
    [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],                              // 100-102
];
const _C128_START_B = [2,1,1,2,1,4]; // símbolo 104
const _C128_STOP    = [2,3,3,1,1,1,2]; // terminador (7 módulos)

function encodeCode128B(str) {
    // Sanitiza: apenas ASCII imprimível (32-126)
    const safe = String(str).replace(/[^\x20-\x7E]/g, '?');
    const dataVals = [];
    for (let i = 0; i < safe.length; i++) {
        const v = safe.charCodeAt(i) - 32;
        if (v >= 0 && v <= 94) dataVals.push(v); // 0-94 = ' ' até '~'
    }
    // Checksum = (104 + Σ i*val_i) mod 103  (i começa em 1 para primeiro dado)
    let check = 104;
    for (let i = 0; i < dataVals.length; i++) check += (i + 1) * dataVals[i];
    check = check % 103;

    // Montar sequência de módulos: start + dados + check + stop
    const modules = [..._C128_START_B];
    for (const v of dataVals) for (const m of _C128[v]) modules.push(m);
    for (const m of _C128[check])  modules.push(m);
    for (const m of _C128_STOP)    modules.push(m);
    return modules;
}

export function BarcodeSVG({ value, width = 120, height = 28 }) {
    const modules = encodeCode128B(String(value));
    const totalUnits = modules.reduce((s, m) => s + m, 0);
    const quietZone = 2; // px de zona quieta em cada lado
    const unitW = (width - quietZone * 2) / totalUnits;

    const rects = [];
    let x = quietZone;
    for (let i = 0; i < modules.length; i++) {
        const w = modules[i] * unitW;
        if (i % 2 === 0) { // módulos pares = barra escura
            rects.push(<rect key={i} x={x} y={0} width={Math.max(w, 0.5)} height={height - 8} fill="#000" />);
        }
        x += w;
    }

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <rect x={0} y={0} width={width} height={height} fill="#fff" />
            {rects}
            <text x={width / 2} y={height - 1} textAnchor="middle" fontSize={7} fontFamily="monospace" fill="#000">
                {value}
            </text>
        </svg>
    );
}

// ═══════════════════════════════════════════════════════
// ABA: MATERIAIS — Cadastro completo
// ═══════════════════════════════════════════════════════
