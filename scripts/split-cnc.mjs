#!/usr/bin/env node
// One-shot script pra dividir src/pages/ProducaoCNC.jsx em subarquivos.
// Uso: node scripts/split-cnc.mjs
// Idempotente — sobrescreve os arquivos alvo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// SRC aponta pro backup original (antes do split) — a página nova já foi reescrita
const SRC = process.env.CNC_SRC || '/tmp/ProducaoCNC.backup.jsx';
const OUT_DIR = path.join(ROOT, 'src/pages/ProducaoCNC');

const source = fs.readFileSync(SRC, 'utf8');
const lines = source.split('\n'); // 1-indexed semantically below via l-1

// Helper: extrai linhas [startLine, endLine) inclusivo-exclusivo (1-indexed, exclusive end)
const slice = (startLine, endLine) => lines.slice(startLine - 1, endLine - 1).join('\n');

// Import template usado por tabs (depth: ProducaoCNC/tabs/X.jsx → ../../api)
const TAB_IMPORTS = `import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
import EditorEtiquetas, { EtiquetaSVG } from '../../../components/EditorEtiquetas';
import PecaViewer3D from '../../../components/PecaViewer3D';
import PecaEditor from '../../../components/PecaEditor';
import ToolpathSimulator, { parseGcodeToMoves } from '../../../components/ToolpathSimulator';
import GcodeSimWrapper from '../../../components/GcodeSimWrapper';
import SlidePanel from '../../../components/SlidePanel';
import ToolbarDropdown from '../../../components/ToolbarDropdown';
import { STATUS_COLORS } from '../shared/constants.js';
`;

// Variante pra subfolder (ex: tabs/TabConfig/CfgX.jsx → ../../../../api)
const TAB_IMPORTS_DEEP = TAB_IMPORTS
    .replaceAll('../../../', '../../../../')
    .replaceAll("'../shared/", "'../../shared/");

// Import template pra helpers no shared/ (depth: ProducaoCNC/shared/X.jsx)
const SHARED_IMPORTS = `import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import api from '../../../api';
import { Ic, Z, Modal, Spinner, tagStyle, tagClass, PageHeader, TabBar, EmptyState, StatusBadge, ToolbarButton, ToolbarDivider, ProgressBar as PBar, SearchableSelect } from '../../../ui';
import { colorBg, colorBorder, getStatus, STATUS_COLORS as GLOBAL_STATUS } from '../../../theme';
import { Upload, Download, Printer, FileText, RefreshCw, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, Trash2, Plus, Edit, Settings, Eye, BarChart3, Tag as TagIcon, Layers, Package, Box, Scissors, RotateCw, Copy, Monitor, Cpu, Wrench, Server, PenTool, ArrowLeft, Star, Lock, Unlock, ArrowLeftRight, Maximize2, Undo2, Redo2, Zap, ArrowUp, ArrowDown, GripVertical, X, FlipVertical2, ShieldAlert, DollarSign, Clock, FileDown, Play, GitCompare, FileUp, ClipboardCheck, History, Send, Circle, Square, Minus, Check, Search as SearchIcon, Grid, List, LayoutGrid, Tv, QrCode, Maximize } from 'lucide-react';
`;

// ─── MAPA DE EXTRAÇÃO ─────────────────────────────────────────
// Cada entrada: { path, startLine, endLine, imports, namedExports }
const EXTRACTIONS = [
    // --- Shared components ---
    {
        path: 'shared/LoteSelector.jsx',
        start: 362, end: 387,
        imports: SHARED_IMPORTS,
        exports: ['LoteSelector'],
    },
    {
        path: 'shared/InfoCard.jsx',
        start: 1148, end: 1162,
        imports: SHARED_IMPORTS,
        exports: ['InfoCard'],
    },
    {
        path: 'shared/BarcodeSVG.jsx',
        start: 10405, end: 10448,
        imports: SHARED_IMPORTS,
        exports: ['BarcodeSVG'],
    },
    {
        path: 'shared/printing/printPlano.js',
        start: 2129, end: 2306,
        imports: '',
        exports: ['printPlano'],
    },
    {
        path: 'shared/printing/printFolhaProducao.js',
        start: 2306, end: 2580,
        imports: '',
        exports: ['printFolhaProducao'],
    },

    // --- Tabs principais ---
    {
        path: 'tabs/TabImportar.jsx',
        start: 387, end: 844,
        imports: TAB_IMPORTS + `import { InfoCard } from '../shared/InfoCard.jsx';\n`,
        exports: ['TabImportar'],
    },
    {
        path: 'tabs/TabLotes.jsx',
        start: 844, end: 967,
        imports: TAB_IMPORTS,
        exports: ['TabLotes'],
    },
    {
        path: 'tabs/TabDashboard.jsx',
        start: 967, end: 1148, // TabDashboard
        imports: TAB_IMPORTS + `import { InfoCard } from '../shared/InfoCard.jsx';\nimport { RelatorioDesperdicio } from './_RelatorioDesperdicio.jsx';\n`,
        exports: ['TabDashboard'],
    },
    {
        path: 'tabs/_RelatorioDesperdicio.jsx',
        start: 1162, end: 1325,
        imports: TAB_IMPORTS,
        exports: ['RelatorioDesperdicio'],
    },
    {
        path: 'tabs/TabPecas.jsx',
        // TabPecas (1325) + MachiningTemplateLibrary (1985) + MachiningTemplateModal (2086-2129)
        start: 1325, end: 2129,
        imports: TAB_IMPORTS + `import { InfoCard } from '../shared/InfoCard.jsx';\n`,
        exports: ['TabPecas'],
    },
    {
        path: 'tabs/TabRetalhos.jsx',
        start: 11870, end: 12161,
        imports: TAB_IMPORTS,
        exports: ['TabRetalhos'],
    },
    {
        path: 'tabs/TabGcode.jsx',
        start: 11601, end: 11870,
        imports: TAB_IMPORTS + `import { BarcodeSVG } from '../shared/BarcodeSVG.jsx';\n`,
        exports: ['TabGcode'],
    },
    {
        path: 'tabs/TabEtiquetas.jsx',
        // TabEtiquetas (10900) + EtiquetaCard (11230-11389)
        // Inclui prepend com FORMATOS_ETIQUETA/FONTES_TAMANHO (órfãos de 10389-10403)
        start: 10900, end: 11389,
        imports: TAB_IMPORTS + `import { BarcodeSVG } from '../shared/BarcodeSVG.jsx';\n`,
        exports: ['TabEtiquetas'],
        extraPrepend: `
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

`,
    },
    {
        path: 'tabs/TabConfig/CfgEtiquetas.jsx',
        // CfgEtiquetas (11389-11601)
        // Inclui prepend com FORMATOS_ETIQUETA/FONTES_TAMANHO caso também use
        start: 11389, end: 11601,
        imports: TAB_IMPORTS_DEEP,
        exports: ['CfgEtiquetas'],
        extraPrepend: `
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

`,
    },

    // --- TabPlano (MEGA — 4110 linhas) + helpers ---
    {
        path: 'tabs/TabPlano/index.jsx',
        start: 2580, end: 6690,
        imports: TAB_IMPORTS_DEEP
            + `import { printPlano } from '../../shared/printing/printPlano.js';\n`
            + `import { printFolhaProducao } from '../../shared/printing/printFolhaProducao.js';\n`
            + `import { parseGcodeForSim, getOpCat } from './parseGcode.js';\n`
            + `import { GcodeSimCanvas } from './GcodeSimCanvas.jsx';\n`
            + `import { ToolPanelModal } from './ToolPanelModal.jsx';\n`
            + `import { GcodePreviewModal } from './GcodePreviewModal.jsx';\n`
            + `import { buildMillingOutline } from './buildMillingOutline.js';\n`
            + `import { renderMachining, ChapaViz } from './renderMachining.jsx';\n`
            + `import { isPanningCursor } from './_utils.js';\n`
            + `import { RelatorioDesperdicio } from '../_RelatorioDesperdicio.jsx';\n`,
        exports: ['TabPlano'],
        // TabPlano file tem STATUS_COLORS local que agora vem do constants.js — precisamos não duplicar
        stripLocalConstants: true,
    },
    {
        path: 'tabs/TabPlano/parseGcode.js',
        // parseGcodeForSim (6690) + OP_CATS (6730) + getOpCat (6740)
        start: 6690, end: 6747,
        imports: '',
        exports: ['parseGcodeForSim', 'getOpCat'],
    },
    {
        path: 'tabs/TabPlano/GcodeSimCanvas.jsx',
        // GcodeSimCanvas termina em 7074; 7076-7079 é comentário-título do próximo bloco
        start: 6747, end: 7076,
        imports: TAB_IMPORTS_DEEP + `import { parseGcodeForSim, getOpCat } from './parseGcode.js';\n`,
        exports: ['GcodeSimCanvas'],
    },
    {
        path: 'tabs/TabPlano/ToolPanelModal.jsx',
        // 7076-7092 = comentário + METHOD_LABELS + CATEGORIA_ICON + CATEGORIA_COLOR (usados dentro do modal)
        start: 7076, end: 7463,
        imports: TAB_IMPORTS_DEEP,
        exports: ['ToolPanelModal'],
    },
    {
        path: 'tabs/TabPlano/GcodePreviewModal.jsx',
        start: 7463, end: 7621,
        imports: TAB_IMPORTS_DEEP,
        exports: ['GcodePreviewModal'],
    },
    {
        path: 'tabs/TabPlano/buildMillingOutline.js',
        start: 7621, end: 7719,
        imports: '',
        exports: ['buildMillingOutline'],
    },
    {
        path: 'tabs/TabPlano/renderMachining.jsx',
        // Contém também ChapaViz (linha 8077) — precisa ser exportado pro TabPlano/index
        start: 7719, end: 10383,
        imports: TAB_IMPORTS_DEEP
            + `import { buildMillingOutline } from './buildMillingOutline.js';\n`
            + `import { isPanningCursor } from './_utils.js';\n`,
        exports: ['renderMachining', 'ChapaViz'],
    },
    {
        path: 'tabs/TabPlano/_utils.js',
        // só isPanningCursor; FORMATOS_ETIQUETA e FONTES_TAMANHO movidos pra TabEtiquetas
        start: 10383, end: 10389,
        imports: '',
        exports: ['isPanningCursor'],
    },

    // --- TabConfig (shell) + subseções ---
    {
        path: 'tabs/TabConfig/index.jsx',
        start: 12161, end: 12243,
        imports: TAB_IMPORTS_DEEP
            + `import { CfgChapas } from './CfgChapas.jsx';\n`
            + `import { CfgMaquinas } from './CfgMaquinas.jsx';\n`
            + `import { CfgUsinagem } from './CfgUsinagem.jsx';\n`
            + `import { CfgParametros } from './CfgParametros.jsx';\n`
            + `import { CfgEtiquetas } from './CfgEtiquetas.jsx';\n`
            + `import { CfgRetalhos } from './CfgRetalhos.jsx';\n`,
        exports: ['TabConfig'],
    },
    {
        path: 'tabs/TabConfig/CfgChapas.jsx',
        // CfgChapas (12243) + ChapaModal (12335-12393)
        start: 12243, end: 12393,
        imports: TAB_IMPORTS_DEEP,
        exports: ['CfgChapas'],
    },
    {
        path: 'tabs/TabConfig/CfgFerramentas.jsx',
        // CfgFerramentas (12393) + FerramentaModal (12518-12592)
        start: 12393, end: 12592,
        imports: TAB_IMPORTS_DEEP,
        exports: ['CfgFerramentas'],
    },
    {
        path: 'tabs/TabConfig/CfgParametros.jsx',
        start: 12592, end: 12662,
        imports: TAB_IMPORTS_DEEP,
        exports: ['CfgParametros'],
    },
    {
        path: 'tabs/TabConfig/CfgMaquinas.jsx',
        // CfgMaquinas (12662) + newMaquinaDefaults (12788) + MaquinaModal (12825-13287)
        start: 12662, end: 13287,
        imports: TAB_IMPORTS_DEEP + `import { CfgFerramentas } from './CfgFerramentas.jsx';\n`,
        exports: ['CfgMaquinas'],
    },
    {
        path: 'tabs/TabConfig/CfgUsinagem.jsx',
        // CfgUsinagem (13287) + UsinagemTipoModal (13427-13585)
        start: 13287, end: 13585,
        imports: TAB_IMPORTS_DEEP,
        exports: ['CfgUsinagem'],
    },
    {
        path: 'tabs/TabConfig/CfgRetalhos.jsx',
        start: 13585, end: 13639 + 1,
        imports: TAB_IMPORTS_DEEP,
        exports: ['CfgRetalhos'],
    },
    // CfgEtiquetas definido acima junto com TabEtiquetas (ambos precisam de FORMATOS_ETIQUETA)

    // --- Deprecated (não usado na UI, mas preservado) ---
    {
        path: '_deprecated/TabMateriais.jsx',
        start: 10448, end: 10679, // TabMateriais puro (USIN_LABELS/usinInfo movidos pra TabUsinagens)
        imports: TAB_IMPORTS.replaceAll('../../../', '../../../'),
        exports: ['TabMateriais'],
        note: 'NÃO USADO — mantido pra histórico. Nunca foi renderizado no JSX.',
    },
    {
        path: '_deprecated/TabUsinagens.jsx',
        // Inclui USIN_LABELS (10679) + usinInfo (10687) que só é usado aqui
        start: 10679, end: 10900,
        imports: TAB_IMPORTS,
        exports: ['TabUsinagens'],
        note: 'NÃO USADO — mantido pra histórico. Nunca foi renderizado no JSX.',
    },
];

// ─── EXECUÇÃO ─────────────────────────────────────────────────
for (const e of EXTRACTIONS) {
    const full = path.join(OUT_DIR, e.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    let body = slice(e.start, e.end);

    // Converte `function Foo(` pra `export function Foo(` pros exports declarados
    for (const name of e.exports || []) {
        const re = new RegExp(`(^|\\n)function\\s+${name}\\s*\\(`, 'g');
        body = body.replace(re, `$1export function ${name}(`);
    }

    // Remove STATUS_COLORS local duplicado se já vem de constants.js
    if (e.stripLocalConstants) {
        body = body.replace(/const STATUS_COLORS = \{[^}]*\};?\n?/g, '');
    }

    // Ajusta paths relativos que ficavam "../xxx" (src/pages → src/xxx)
    // Agora estão em src/pages/ProducaoCNC/{tabs|shared|_deprecated}/ — precisam "../../../xxx"
    // OU em src/pages/ProducaoCNC/tabs/TabPlano|TabConfig/ — precisam "../../../../xxx"
    const depth = e.path.split('/').length; // 2 = shared/X, 3 = tabs/X ou _deprecated/X ou shared/printing/X, 4 = tabs/TabPlano/X
    const prefix = depth >= 3 ? '../../../../' : '../../../';
    // Transform usados DENTRO de function bodies (ex: await import('../utils/..')):
    // Matches `'../xxx'` or `"../xxx"` that are NOT at the start of a line (imports ja foram substituidos acima)
    body = body.replace(/(await\s+import\(\s*['"])\.\.\/(?!\.\.)/g, `$1${prefix}`);

    const header = e.note
        ? `// ${e.note}\n// Extraído automaticamente de ProducaoCNC.jsx (linhas ${e.start}-${e.end - 1}).\n`
        : `// Extraído automaticamente de ProducaoCNC.jsx (linhas ${e.start}-${e.end - 1}).\n`;

    const final = header + e.imports + '\n' + (e.extraPrepend || '') + body + (e.extraAppend || '') + '\n';
    fs.writeFileSync(full, final, 'utf8');
    console.log(`✓ ${e.path} (${(e.end - e.start).toLocaleString()} linhas, exports: ${(e.exports || []).join(', ')})`);
}

console.log(`\n✅ Split concluído. ${EXTRACTIONS.length} arquivos criados.`);
