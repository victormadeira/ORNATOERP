// Constantes compartilhadas entre as tabs da Produção CNC.
// Mantidas aqui pra evitar import circular entre tabs e o shell principal.
import { Upload, Package, BarChart3, Box, Settings, Layers, Scissors, Cpu } from 'lucide-react';

// Nível 1 — sempre visível na topbar
export const TABS_MAIN = [
    { id: 'importar', lb: 'Importar', ic: Upload },
    { id: 'lotes', lb: 'Lotes', ic: Package },
    { id: 'dashboard', lb: 'Dashboard', ic: BarChart3 },
    { id: 'retalhos', lb: 'Retalhos', ic: Box },
    { id: 'config', lb: 'Configurações', ic: Settings },
];

// Nível 2 — só aparece com lote selecionado
export const TABS_LOTE = [
    { id: 'pecas', lb: 'Peças', ic: Layers, step: 1 },
    { id: 'plano', lb: 'Plano de Corte', ic: Scissors, step: 2 },
    { id: 'gcode', lb: 'G-code / CNC', ic: Cpu, step: 3 },
];

// Paleta de status de lote (TODO Fase B: migrar pra getStatus() em theme.js).
export const STATUS_COLORS = {
    importado: '#3b82f6',
    otimizado: '#22c55e',
    produzindo: '#f59e0b',
    concluido: '#8b5cf6',
};
