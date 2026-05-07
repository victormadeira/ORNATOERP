// Constantes compartilhadas entre as tabs da Produção CNC.
// Mantidas aqui pra evitar import circular entre tabs e o shell principal.
import { Upload, Package, BarChart3, Box, Settings, Layers, Scissors, Cpu, Workflow, Wrench, DollarSign } from 'lucide-react';
import { STATUS_COLORS as THEME_STATUS } from '../../../theme';

// Nível 1 — sempre visível na topbar
export const TABS_MAIN = [
    { id: 'importar', lb: 'Importar', ic: Upload },
    { id: 'lotes', lb: 'Lotes', ic: Package },
    { id: 'dashboard', lb: 'Dashboard', ic: BarChart3 },
    { id: 'retalhos', lb: 'Retalhos', ic: Box },
    { id: 'fila', lb: 'Fila de Máquinas', ic: Workflow },
    { id: 'config', lb: 'Configurações', ic: Settings },
];

// Nível 2 — só aparece com lote selecionado
export const TABS_LOTE = [
    { id: 'pecas',     lb: 'Peças',          ic: Layers,     step: 1 },
    { id: 'plano',     lb: 'Plano de Corte', ic: Scissors,   step: 2 },
    { id: 'usinagens', lb: 'Usinagens',       ic: Wrench,     step: 3 },
    { id: 'gcode',     lb: 'G-code / CNC',   ic: Cpu,        step: 4 },
    { id: 'custos',    lb: 'Custos',          ic: DollarSign, step: 5 },
];

// Paleta de status de lote — re-exporta de theme.js como mapa de cores (backward compat)
export const STATUS_COLORS = {
    importado: THEME_STATUS.importado?.color || '#3b82f6',
    otimizado: THEME_STATUS.otimizado?.color || '#22c55e',
    produzindo: THEME_STATUS.produzindo?.color || '#f59e0b',
    concluido: THEME_STATUS.concluido?.color  || 'var(--success)',
};
