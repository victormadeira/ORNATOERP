'use client'

/**
 * Hefesto SketchUp Plugin — Prototype UI
 * Fase 1: estrutura (topbar, sidebar dual-mode, submenu contextual,
 * área principal, painel de propriedades, status bar com alertas).
 *
 * Densidade: Linear/Notion (8px grid, 4px em áreas densas).
 * Tipografia: Inter, base 13px (compacto para plugin).
 * Cores: branco/grafite, laranja (#d95f18) só como ação/destaque.
 *
 * Fonte canônica: SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/prototypes/.
 * Cópia em sistemapesca/apps/web/src/app/sketchup-plugin-ui é só preview em localhost:3100.
 */

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Box,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Command,
  Download,
  Drill,
  FileBarChart,
  FileText,
  Focus,
  Folder,
  Frame,
  Hammer,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Minimize2,
  MousePointer2,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'

/* ═══════════════════════ SVGs personalizados Ornato ═══════════════════════ */
/*  Linha 1.5px, viewBox 24x24, currentColor — coeso com Lucide  */

type IconProps = { className?: string; style?: React.CSSProperties }

/** Logo Ornato - O tecnico com veio de madeira */
function OrnatoLogo({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden>
      <path
        d="M12 3.2C7.1 3.2 3.2 7.1 3.2 12s3.9 8.8 8.8 8.8 8.8-3.9 8.8-8.8S16.9 3.2 12 3.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M7.8 9.2c1.4-1.1 2.8-1.1 4.2 0s2.8 1.1 4.2 0M7.8 12c1.4-1.1 2.8-1.1 4.2 0s2.8 1.1 4.2 0M8.8 14.8c1-.6 2-.6 3 0s2 .6 3 0"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Detalhes - ficha do projeto com cliente, medidas e lapis */
function IconDetalhes({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M6 4.5h8.5L18 8v11.5H6z" />
      <path d="M14.5 4.5V8H18" fill="currentColor" fillOpacity="0.12" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="M12 10h3.2M8 14h7.5M8 17h5.2" />
      <path d="M16 15.6l2.4-2.4 1.4 1.4-2.4 2.4-1.9.5z" fill="currentColor" fillOpacity="0.12" />
    </svg>
  )
}

/** Ambiente - planta baixa com parede, janela e ponto eletrico */
function IconAmbiente({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M4 20V4h16v16" />
      <path d="M4 9h5V4M15 4v6h5M9 20v-5h6v5" />
      <path d="M11 15v5M6.2 12.8h2.6" />
      <circle cx="7.5" cy="15.5" r="1.1" />
      <path d="M6.7 15.5h1.6" />
    </svg>
  )
}

/** Biblioteca - estante de modulos prontos */
function IconBiblioteca({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M4 5.5h16v14H4z" />
      <path d="M4 10h16M4 14.5h16M9.3 5.5v14M14.7 5.5v14" />
      <path d="M6.2 7.2h1.8M11.2 12.2h1.6M16.3 16.8h1.5" />
      <path d="M3 19.5h18" strokeWidth="1.8" />
    </svg>
  )
}

/** Internos - armario aberto com portas, gavetas e prateleira */
function IconInternos({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M5 4.5h14v15H5z" />
      <path d="M12 4.5v15M5 10h14" />
      <path d="M7 12.5h3.2v4.8H7zM13.8 12.5H17v4.8h-3.2z" fill="currentColor" fillOpacity="0.1" />
      <path d="M8.6 14.2h.1M15.4 14.2h.1M7 7.2h3M14 7.2h3" />
    </svg>
  )
}

/** Acabamentos - chapas, fita de borda e amostra de veio */
function IconAcabamentos({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <rect x="4.5" y="5" width="10" height="13.5" rx="1" />
      <path d="M14.5 7.2h3.2a1.8 1.8 0 0 1 1.8 1.8v7.7a1.8 1.8 0 0 1-1.8 1.8h-3.2" />
      <path d="M7 8.2c1.2-.8 2.4-.8 3.6 0s2 .8 2.7.2M7 11.5c1.2-.8 2.4-.8 3.6 0s2 .8 2.7.2M7 14.8c1.2-.8 2.4-.8 3.6 0s2 .8 2.7.2" />
      <path d="M17 9.5v6.3" strokeWidth="2.2" />
    </svg>
  )
}

/** Ferragens - conjunto dobradica + trilho de corredica */
function IconFerragens({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M4 7h5.5v7H4zM14.5 7H20v7h-5.5z" />
      <path d="M9.5 10.5h5M12 8.6v3.8" />
      <circle cx="6.8" cy="9.2" r="0.65" fill="currentColor" />
      <circle cx="6.8" cy="11.8" r="0.65" fill="currentColor" />
      <circle cx="17.2" cy="9.2" r="0.65" fill="currentColor" />
      <circle cx="17.2" cy="11.8" r="0.65" fill="currentColor" />
      <path d="M4 18h16M6.5 16.2h10.8M17.3 16.2l2.7 1.8-2.7 1.8" />
    </svg>
  )
}

/** Usinagens - spindle CNC, fresa e caminho de usinagem */
function IconSpindleCNC({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M7 3.5h10v3H7z" />
      <path d="M8.3 6.5h7.4v5.2H8.3z" fill="currentColor" fillOpacity="0.1" />
      <path d="M9.5 8.2h5M9.5 10h5" strokeWidth="1" />
      <path d="M10.2 11.7h3.6l-.8 2.1h-2z" />
      <path d="M11 13.8v5.2M13 13.8v5.2M11 16l2 .8M11 18l2 .8" />
      <path d="M5 20h14" strokeWidth="1.8" />
      <path d="M6.5 17.2c1.8-1.4 3.2-1.4 4.8 0 1.5 1.3 3 1.3 5.2 0" strokeDasharray="1.2 1.4" />
      <circle cx="7" cy="20" r="0.7" fill="currentColor" />
      <circle cx="17" cy="20" r="0.7" fill="currentColor" />
    </svg>
  )
}

/** Validacao - check tecnico com alerta de tolerancia */
function IconValidacao({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M4.5 6h10.5l4.5 4.5V18H4.5z" />
      <path d="M15 6v4.5h4.5" fill="currentColor" fillOpacity="0.1" />
      <path d="M7.5 13.2l2.2 2.2 4.4-5" strokeWidth="1.8" />
      <path d="M16.4 14.2h.1M16.4 16.4h.1" strokeWidth="2.2" />
      <path d="M6.5 19.8h11" strokeWidth="1.8" />
    </svg>
  )
}

/** Relatorios - lista de corte, etiqueta e QR */
function IconRelatorios({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M5 4h14v16H5z" />
      <path d="M8 7h7M8 10h5M8 13h4" />
      <rect x="13.5" y="13.5" width="3.8" height="3.8" rx="0.3" />
      <path d="M15.4 13.5v3.8M13.5 15.4h3.8" strokeWidth="1" />
      <path d="M7.3 16.5h3.5" strokeWidth="2" />
      <path d="M5 20h14" strokeWidth="1.8" />
    </svg>
  )
}

/** Producao - ordem de fabrica com serra e etiqueta */
function IconProducao({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="M4 5h8.5l2 2H20v13H4z" />
      <circle cx="9.5" cy="13" r="3.1" />
      <circle cx="9.5" cy="13" r="0.8" fill="currentColor" />
      <path d="M9.5 9.9l.6-1 .4 1.1M12.6 13h1.1l-.9.7M9.5 16.1l-.6 1-.4-1.1M6.4 13H5.3l.9-.7" />
      <path d="M15 11h3M15 14h3M15 17h2" />
    </svg>
  )
}

/** SketchUp Cursor — para empty state do Inspector (cursor + cubo wire) */
function IconSketchupSelect({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      {/* Cubo isométrico wire */}
      <path d="M8 8 L16 4 L24 8 L24 18 L16 22 L8 18 Z" />
      <path d="M8 8 L16 12 L24 8" />
      <path d="M16 12 L16 22" />
      {/* Cursor sobre o cubo */}
      <path d="M19 14 L24 20 L21.5 20 L23 23 L21 24 L19.5 21 L17.5 22.5 Z" fill="currentColor" fillOpacity="0.15" />
    </svg>
  )
}

/* ───────────────────────── Types ───────────────────────── */

type TabId =
  | 'detalhes'
  | 'ambiente'
  | 'biblioteca'
  | 'internos'
  | 'acabamentos'
  | 'ferragens'
  | 'usinagens'
  | 'validacao'
  | 'relatorios'
  | 'producao'

type SyncStatus = 'online' | 'offline' | 'syncing' | 'error'

type SubmenuItem = { id: string; label: string; count?: number; badge?: 'new' | 'beta' }
type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>
type MainTab = { id: TabId; label: string; icon: IconComponent; hotkey: string; submenu: SubmenuItem[] }

type Conflict = {
  id: string
  severity: 'warn' | 'error'
  title: string
  detail: string
}

/* ─────────────────────── Mock data ─────────────────────── */

/** 10 tabs — fluxo de jornada de projeto, do setup até produção.
 *  Configurações foi movido para a engrenagem da topbar (drawer lateral). */
const tabs: MainTab[] = [
  {
    id: 'detalhes',
    label: 'Detalhes',
    icon: IconDetalhes,
    hotkey: '1',
    submenu: [
      { id: 'cliente', label: 'Cliente' },
      { id: 'ambiente-info', label: 'Identificação do ambiente' },
      { id: 'medidas', label: 'Medidas e tolerâncias' },
      { id: 'observacoes', label: 'Observações' },
      { id: 'anexos', label: 'Anexos', count: 3 },
    ],
  },
  {
    id: 'ambiente',
    label: 'Ambiente',
    icon: IconAmbiente,
    hotkey: '2',
    submenu: [
      { id: 'paredes', label: 'Paredes' },
      { id: 'piso', label: 'Piso' },
      { id: 'teto', label: 'Teto' },
      { id: 'janelas', label: 'Janelas' },
      { id: 'portas-amb', label: 'Portas do ambiente' },
      { id: 'tomadas', label: 'Tomadas e pontos' },
      { id: 'vigas', label: 'Vigas e obstáculos' },
      { id: 'iluminacao-fixa', label: 'Iluminação fixa' },
      { id: 'sugerir', label: 'Sugerir modulação', badge: 'new' },
    ],
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    icon: IconBiblioteca,
    hotkey: '3',
    submenu: [
      { id: 'ambientes', label: 'Ambientes', count: 12 },
      { id: 'cozinha', label: 'Cozinha', count: 31 },
      { id: 'dormitorio', label: 'Dormitório', count: 24 },
      { id: 'banheiro', label: 'Banheiro', count: 14 },
      { id: 'escritorio', label: 'Escritório', count: 9 },
      { id: 'avulsos', label: 'Avulsos', count: 18 },
      { id: 'parceiros', label: 'Parceiros', count: 7 },
      { id: 'favoritos', label: 'Favoritos', count: 5 },
      { id: 'recentes', label: 'Recentes', count: 8 },
    ],
  },
  {
    id: 'internos',
    label: 'Internos',
    icon: IconInternos,
    hotkey: '4',
    submenu: [
      { id: 'gavetas', label: 'Gavetas' },
      { id: 'prateleiras', label: 'Prateleiras' },
      { id: 'portas-mob', label: 'Portas' },
      { id: 'divisorias', label: 'Divisórias' },
      { id: 'cestos', label: 'Cestos aramados' },
      { id: 'cabideiros', label: 'Cabideiros' },
      { id: 'acessorios-int', label: 'Acessórios internos' },
    ],
  },
  {
    id: 'acabamentos',
    label: 'Acabamentos',
    icon: IconAcabamentos,
    hotkey: '5',
    submenu: [
      { id: 'mdf', label: 'MDF' },
      { id: 'laminados', label: 'Laminados' },
      { id: 'vidros', label: 'Vidros' },
      { id: 'metais', label: 'Metais' },
      { id: 'fitas', label: 'Fitas de borda' },
      { id: 'texturas', label: 'Texturas' },
      { id: 'favoritos', label: 'Favoritos' },
      { id: 'aplicar-sel', label: 'Aplicar em selecionados', badge: 'new' },
      { id: 'subst-massa', label: 'Substituir em massa' },
    ],
  },
  {
    id: 'ferragens',
    label: 'Ferragens',
    icon: IconFerragens,
    hotkey: '6',
    submenu: [
      { id: 'dobradicas', label: 'Dobradiças' },
      { id: 'corredicas', label: 'Corrediças' },
      { id: 'puxadores', label: 'Puxadores' },
      { id: 'pes', label: 'Pés e niveladores' },
      { id: 'dispositivos', label: 'Dispositivos' },
      { id: 'iluminacao', label: 'Iluminação' },
      { id: 'acessorios', label: 'Acessórios' },
    ],
  },
  {
    id: 'usinagens',
    label: 'Usinagens',
    icon: IconSpindleCNC,
    hotkey: '7',
    submenu: [
      { id: 'furacao', label: 'Furação' },
      { id: 'rebaixos', label: 'Rebaixos' },
      { id: 'encaixes', label: 'Encaixes' },
      { id: 'cavilhas', label: 'Cavilhas' },
      { id: 'rasgos', label: 'Rasgos e canais' },
      { id: 'cnc-ops', label: 'Operações CNC' },
      { id: 'padroes', label: 'Padrões salvos', count: 6 },
    ],
  },
  {
    id: 'validacao',
    label: 'Validação',
    icon: IconValidacao,
    hotkey: '8',
    submenu: [
      { id: 'resumo-val', label: 'Resumo de checagem' },
      { id: 'conflitos', label: 'Conflitos', count: 2 },
      { id: 'tolerancias', label: 'Tolerâncias' },
      { id: 'folgas', label: 'Folgas' },
      { id: 'viabilidade', label: 'Viabilidade de produção' },
      { id: 'sugestoes', label: 'Sugestões automáticas' },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: IconRelatorios,
    hotkey: '9',
    submenu: [
      { id: 'lista-pecas', label: 'Lista de peças' },
      { id: 'lista-compras', label: 'Lista de compras' },
      { id: 'plano-corte', label: 'Plano de corte' },
      { id: 'etiquetas', label: 'Etiquetas' },
      { id: 'usinagens-rel', label: 'Usinagens' },
      { id: 'mapa-montagem', label: 'Mapa de montagem' },
      { id: 'exportacoes', label: 'Exportações' },
    ],
  },
  {
    id: 'producao',
    label: 'Produção',
    icon: IconProducao,
    hotkey: '0',
    submenu: [
      { id: 'orcamento', label: 'Orçamento' },
      { id: 'ordens', label: 'Ordens de produção' },
      { id: 'compras', label: 'Compras' },
      { id: 'cnc', label: 'CNC' },
      { id: 'etiquetas-prod', label: 'Etiquetas' },
      { id: 'apresentacao', label: 'Apresentação ao cliente' },
      { id: 'historico', label: 'Histórico' },
    ],
  },
]

const conflictsMock: Conflict[] = [
  { id: 'c1', severity: 'warn', title: 'Furação conflitante', detail: 'Módulo M-014 e M-015 têm furação na mesma face.' },
  { id: 'c2', severity: 'error', title: 'Material ausente', detail: 'Painel "Lateral cozinha" sem material atribuído.' },
]

const projectMock = {
  cliente: 'Família Silva',
  pieces: 42,
  area: 8.3,
  valor: 4280,
}

/* Múltiplos ambientes por projeto. O cliente Silva tem cozinha + dormitórios + ... */
type Ambiente = { id: string; label: string; pieces: number; valor: number }
const ambientesMock: Ambiente[] = [
  { id: 'cozinha', label: 'Cozinha', pieces: 42, valor: 4280 },
  { id: 'dorm-casal', label: 'Dormitório casal', pieces: 28, valor: 3120 },
  { id: 'dorm-filhos', label: 'Dormitório filhos', pieces: 18, valor: 1980 },
  { id: 'banheiro', label: 'Banheiro suíte', pieces: 12, valor: 1450 },
  { id: 'gourmet', label: 'Área gourmet', pieces: 22, valor: 2860 },
]

// Mock: representa o que está selecionado no SketchUp.
// O plugin escuta a seleção via Ruby bridge e atualiza esse estado.
const sketchupSelectionMock = {
  count: 1,
  label: 'Módulo inferior 2 portas',
}

/* Ação primária contextual por tab — espelha o fluxo dos plugins de marcenaria
 * (UPMobb/DinaBox/Gabster). Cada tab tem uma ação dominante que muda. */
type PrimaryAction = { label: string; icon: LucideIcon; tone?: 'primary' | 'dark' }

const primaryActionByTab: Record<TabId, PrimaryAction> = {
  detalhes: { label: 'Salvar dados', icon: CheckCircle2, tone: 'dark' },
  ambiente: { label: 'Sugerir modulação', icon: Lightbulb, tone: 'primary' },
  biblioteca: { label: 'Inserir', icon: Plus, tone: 'primary' },
  internos: { label: 'Adicionar', icon: Plus, tone: 'primary' },
  acabamentos: { label: 'Aplicar', icon: Paintbrush, tone: 'primary' },
  ferragens: { label: 'Atribuir', icon: Plus, tone: 'dark' },
  usinagens: { label: 'Configurar', icon: Settings, tone: 'dark' },
  validacao: { label: 'Validar projeto', icon: ShieldCheck, tone: 'primary' },
  relatorios: { label: 'Exportar', icon: Download, tone: 'primary' },
  producao: { label: 'Enviar p/ produção', icon: Send, tone: 'primary' },
}

/* ─────────────────────── Utilities ─────────────────────── */

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

/* ───────────────── Window-size simulator (dev only) ───────────────── */

function DevSizePanel(props: {
  width: number
  height: number
  fullscreen: boolean
  onWidth: (n: number) => void
  onHeight: (n: number) => void
  onFullscreen: (v: boolean) => void
}) {
  const presets = [
    { label: '360×720', w: 360, h: 720 },
    { label: '420×760', w: 420, h: 760 },
    { label: '520×820', w: 520, h: 820 },
    { label: '720×900', w: 720, h: 900 },
  ]
  return (
    <div className="rounded-lg border border-[#e4e7eb] bg-white px-3 py-2 text-[12px] shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
          Simulador SketchUp
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => props.onFullscreen(false)}
            className={cn(
              'h-7 rounded px-2 text-[11px] font-semibold transition-colors',
              !props.fullscreen
                ? 'bg-[#fff1e8] text-[#a24510] ring-1 ring-[#d95f18]'
                : 'text-[#4b5565] hover:bg-[#f3f5f8]',
            )}
          >
            Janela
          </button>
          <button
            type="button"
            onClick={() => props.onFullscreen(true)}
            className={cn(
              'h-7 rounded px-2 text-[11px] font-semibold transition-colors',
              props.fullscreen
                ? 'bg-[#fff1e8] text-[#a24510] ring-1 ring-[#d95f18]'
                : 'text-[#4b5565] hover:bg-[#f3f5f8]',
            )}
          >
            Tela cheia
          </button>
        </div>
        <div className="flex items-center gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                props.onWidth(p.w)
                props.onHeight(p.h)
              }}
              className={cn(
                'h-7 rounded border px-2 text-[11px] font-semibold transition-colors',
                props.width === p.w && props.height === p.h && !props.fullscreen
                  ? 'border-[#d95f18] bg-[#fff1e8] text-[#a24510]'
                  : 'border-[#e4e7eb] bg-white text-[#4b5565] hover:bg-[#f3f5f8]',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <span className="text-[11px] text-[#64748b]">L</span>
          <input
            type="range"
            min={320}
            max={900}
            value={props.width}
            onChange={(e) => props.onWidth(Number(e.target.value))}
            className="h-1 w-32 accent-[#d95f18]"
          />
          <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-[#334155]">{props.width}</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[11px] text-[#64748b]">A</span>
          <input
            type="range"
            min={500}
            max={960}
            value={props.height}
            onChange={(e) => props.onHeight(Number(e.target.value))}
            className="h-1 w-28 accent-[#d95f18]"
          />
          <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-[#334155]">{props.height}</span>
        </label>
      </div>
    </div>
  )
}

/* ───────────────────── Topbar ───────────────────── */

function Topbar(props: {
  width: number
  sync: SyncStatus
  ambiente: Ambiente
  onAmbienteChange: (id: string) => void
  onCommandPalette: () => void
  onToggleFocus: () => void
  onOpenConfig: () => void
  focusMode: boolean
}) {
  const compact = props.width < 520
  const ultraCompact = props.width < 420
  const showLabel = !compact
  const [ambPickerOpen, setAmbPickerOpen] = useState(false)
  const ambRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ambPickerOpen) return
    function onClick(e: MouseEvent) {
      if (ambRef.current && !ambRef.current.contains(e.target as Node)) setAmbPickerOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [ambPickerOpen])

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[#e4e7eb] bg-white px-2.5">
      {/* Brand — Ornato */}
      <div className="flex items-center gap-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1a1f29]">
          <OrnatoLogo className="h-4 w-4 text-[#d95f18]" />
        </div>
        {!ultraCompact && (
          <span className="text-[13px] font-semibold tracking-tight text-[#1a1f29]">Ornato</span>
        )}
      </div>

      {/* Breadcrumb projeto + ambiente picker */}
      {!compact && (
        <div className="ml-1 flex min-w-0 items-center gap-1">
          <button
            type="button"
            className="flex h-7 items-center gap-1 rounded px-1.5 text-[12px] hover:bg-[#f3f5f8]"
            title={`Projeto: ${projectMock.cliente}`}
          >
            <span className="truncate font-medium text-[#1a1f29]">{projectMock.cliente}</span>
          </button>
          <ChevronRight className="h-3 w-3 shrink-0 text-[#cbd5e1]" />
          <div className="relative" ref={ambRef}>
            <button
              type="button"
              onClick={() => setAmbPickerOpen((v) => !v)}
              className="flex h-7 items-center gap-1 rounded bg-[#fff1e8] px-1.5 text-[12px] font-semibold text-[#a24510] hover:bg-[#ffe2cd]"
              title="Trocar de ambiente"
            >
              <span className="truncate">{props.ambiente.label}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', ambPickerOpen && 'rotate-180')} />
            </button>
            {ambPickerOpen && (
              <AmbientePickerPopover
                ambientes={ambientesMock}
                active={props.ambiente.id}
                onPick={(id) => {
                  props.onAmbienteChange(id)
                  setAmbPickerOpen(false)
                }}
              />
            )}
          </div>
        </div>
      )}
      {compact && (
        <div className="relative" ref={ambRef}>
          <button
            type="button"
            onClick={() => setAmbPickerOpen((v) => !v)}
            title={`${projectMock.cliente} · ${props.ambiente.label}`}
            className="ml-0.5 flex h-6 items-center gap-0.5 rounded bg-[#fff1e8] px-1.5 text-[10px] font-semibold text-[#a24510] hover:bg-[#ffe2cd]"
          >
            <span className="max-w-[80px] truncate">{props.ambiente.label}</span>
            <ChevronDown className="h-2.5 w-2.5" />
          </button>
          {ambPickerOpen && (
            <AmbientePickerPopover
              ambientes={ambientesMock}
              active={props.ambiente.id}
              onPick={(id) => {
                props.onAmbienteChange(id)
                setAmbPickerOpen(false)
              }}
            />
          )}
        </div>
      )}

      {/* Direita: utilitários globais */}
      <div className="ml-auto flex items-center gap-1">
        <SyncDot status={props.sync} compact={compact} />

        <IconButton title="Atualizar do projeto SketchUp (R)" icon={RefreshCw} />

        <IconButton
          title={props.focusMode ? 'Sair do modo Foco (F)' : 'Modo Foco (F)'}
          icon={props.focusMode ? Minimize2 : Focus}
          onClick={props.onToggleFocus}
          active={props.focusMode}
        />

        {/* Configurações globais (engrenagem) */}
        <IconButton title="Configurações globais (⌘,)" icon={Settings} onClick={props.onOpenConfig} />

        <span className="mx-0.5 h-5 w-px bg-[#e4e7eb]" />

        <button
          type="button"
          onClick={props.onCommandPalette}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md border border-[#e4e7eb] bg-[#fafbfc] text-[11px] text-[#64748b] transition-colors hover:border-[#d8dde4] hover:bg-white hover:text-[#1a1f29]',
            showLabel ? 'px-2' : 'px-1.5',
          )}
          title="Buscar módulos, acabamentos, comandos (⌘K)"
        >
          <Search className="h-3 w-3" />
          {showLabel && <span>Buscar</span>}
          <kbd className="rounded bg-[#eef1f4] px-1 py-0.5 text-[9px] font-semibold text-[#64748b]">⌘K</kbd>
        </button>
      </div>
    </header>
  )
}

/* Popover de troca de ambiente (multi-ambientes por projeto) */
function AmbientePickerPopover(props: {
  ambientes: Ambiente[]
  active: string
  onPick: (id: string) => void
}) {
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-[260px] rounded-lg border border-[#e4e7eb] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      <div className="border-b border-[#eef1f4] px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">
          Ambientes do projeto
        </span>
      </div>
      <div className="max-h-[280px] overflow-y-auto py-1">
        {props.ambientes.map((a) => {
          const isActive = props.active === a.id
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => props.onPick(a.id)}
              className={cn(
                'flex h-9 w-full items-center gap-2 px-3 text-left text-[12px] transition-colors',
                isActive
                  ? 'bg-[#fff1e8] font-semibold text-[#a24510]'
                  : 'text-[#334155] hover:bg-[#f7f9fc]',
              )}
            >
              <Frame className={cn('h-3.5 w-3.5', isActive ? 'text-[#d95f18]' : 'text-[#94a3b8]')} />
              <span className="flex-1 truncate">{a.label}</span>
              <span className={cn('text-[10px] tabular-nums', isActive ? 'text-[#a24510]' : 'text-[#94a3b8]')}>
                {a.pieces} peças
              </span>
            </button>
          )
        })}
      </div>
      <div className="border-t border-[#eef1f4] py-1">
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 px-3 text-left text-[12px] text-[#d95f18] hover:bg-[#fff1e8]"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="font-semibold">Adicionar ambiente</span>
        </button>
      </div>
    </div>
  )
}

/* SyncDot — chip mais slim que SyncChip, só pontinho em compact */
function SyncDot({ status, compact }: { status: SyncStatus; compact: boolean }) {
  const map: Record<SyncStatus, { color: string; bg: string; label: string; icon: LucideIcon }> = {
    online: { color: '#0d9488', bg: '#ecfdf5', label: 'Sincronizado', icon: CheckCircle2 },
    offline: { color: '#6b7280', bg: '#f3f4f6', label: 'Offline', icon: CloudOff },
    syncing: { color: '#2563eb', bg: '#eff6ff', label: 'Sincronizando', icon: Cloud },
    error: { color: '#dc2626', bg: '#fee2e2', label: 'Erro de sync', icon: AlertTriangle },
  }
  const info = map[status]
  if (compact) {
    return (
      <span
        title={info.label}
        className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{ background: info.bg }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: info.color }} />
      </span>
    )
  }
  const Icon = info.icon
  return (
    <span
      className="flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-semibold"
      style={{ background: info.bg, color: info.color }}
      title={info.label}
    >
      <Icon className="h-3 w-3" />
      <span>{info.label}</span>
    </span>
  )
}

function IconButton(props: {
  title: string
  icon: LucideIcon
  onClick?: () => void
  active?: boolean
  danger?: boolean
}) {
  const Icon = props.icon
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        props.active
          ? 'bg-[#fff1e8] text-[#a24510]'
          : props.danger
            ? 'text-[#dc2626] hover:bg-[#fee2e2]'
            : 'text-[#4b5565] hover:bg-[#f3f5f8] hover:text-[#1a1f29]',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

function SyncChip({ status, compact }: { status: SyncStatus; compact: boolean }) {
  const map: Record<SyncStatus, { icon: LucideIcon; label: string; color: string; bg: string }> = {
    online: { icon: CheckCircle2, label: 'Sincronizado', color: '#0d9488', bg: '#ecfdf5' },
    offline: { icon: CloudOff, label: 'Offline', color: '#6b7280', bg: '#f3f4f6' },
    syncing: { icon: Cloud, label: 'Sincronizando…', color: '#2563eb', bg: '#eff6ff' },
    error: { icon: AlertTriangle, label: 'Erro de sync', color: '#dc2626', bg: '#fee2e2' },
  }
  const info = map[status]
  const Icon = info.icon
  return (
    <div
      className="flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-semibold"
      style={{ background: info.bg, color: info.color }}
      title={info.label}
    >
      <Icon className="h-3 w-3" />
      {!compact && <span>{info.label}</span>}
    </div>
  )
}

/* ───────────────────── Sidebar (nav principal) ───────────────────── */

function NavSidebar(props: {
  active: TabId
  expanded: boolean
  onPick: (id: TabId) => void
  onToggleExpand: () => void
}) {
  return (
    <nav
      className={cn(
        'flex shrink-0 flex-col gap-0.5 border-r border-[#e4e7eb] bg-[#fafbfc] py-1.5 transition-[width] duration-150',
        props.expanded ? 'w-[180px] px-1.5' : 'w-[48px] px-1',
      )}
    >
      {tabs.map((t) => {
        const isActive = props.active === t.id
        const Icon = t.icon
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => props.onPick(t.id)}
            title={!props.expanded ? `${t.label} (${t.hotkey})` : undefined}
            className={cn(
              'group flex h-8 items-center gap-2 rounded px-1.5 text-[12px] font-medium transition-colors',
              isActive
                ? 'bg-white text-[#1a1f29] shadow-[inset_0_0_0_1px_#e4e7eb]'
                : 'text-[#4b5565] hover:bg-white/70 hover:text-[#1a1f29]',
              !props.expanded && 'justify-center',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 shrink-0 transition-colors',
                isActive ? 'text-[#d95f18]' : 'text-[#64748b] group-hover:text-[#1a1f29]',
              )}
            />
            {props.expanded && (
              <>
                <span className="flex-1 truncate text-left">{t.label}</span>
                <kbd
                  className={cn(
                    'rounded bg-[#eef1f4] px-1 text-[9px] font-semibold text-[#94a3b8]',
                    isActive && 'bg-[#fff1e8] text-[#a24510]',
                  )}
                >
                  {t.hotkey}
                </kbd>
              </>
            )}
          </button>
        )
      })}

      <div className="mt-auto px-0.5 pt-1">
        <button
          type="button"
          onClick={props.onToggleExpand}
          title={props.expanded ? 'Recolher menu' : 'Expandir menu'}
          className="flex h-7 w-full items-center justify-center rounded text-[#94a3b8] hover:bg-white/70 hover:text-[#1a1f29]"
        >
          {props.expanded ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
        </button>
      </div>
    </nav>
  )
}

/* ──────────────── Submenu contextual (sidebar) ──────────────── */

function Submenu(props: {
  tab: MainTab
  active: string | null
  onPick: (id: string) => void
}) {
  return (
    <aside className="flex w-[180px] shrink-0 flex-col border-r border-[#e4e7eb] bg-white">
      <div className="flex h-9 items-center justify-between border-b border-[#eef1f4] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">{props.tab.label}</span>
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-[#94a3b8] hover:bg-[#f3f5f8] hover:text-[#1a1f29]"
          title="Mais opções"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5">
        {props.tab.submenu.map((item) => {
          const isActive = props.active === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onPick(item.id)}
              className={cn(
                'relative flex h-7 w-full items-center gap-2 px-3 text-left text-[12px] transition-colors',
                isActive
                  ? 'bg-[#fff1e8] font-semibold text-[#a24510]'
                  : 'text-[#334155] hover:bg-[#f7f9fc]',
              )}
            >
              {isActive && <span className="absolute left-0 top-1 h-5 w-0.5 rounded-r bg-[#d95f18]" />}
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && (
                <span className="rounded bg-[#dbeafe] px-1 text-[9px] font-semibold uppercase text-[#1d4ed8]">
                  {item.badge}
                </span>
              )}
              {typeof item.count === 'number' && (
                <span className={cn('text-[10px] tabular-nums', isActive ? 'text-[#a24510]' : 'text-[#94a3b8]')}>
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </aside>
  )
}


/* ──────────────── Inspector (placeholder) ──────────────── */

/* ─── Inspector dinâmico — 3 modos baseados na seleção do SketchUp ───
 *  - 0 selecionados: resumo do ambiente atual
 *  - 1 selecionado: propriedades do módulo
 *  - N selecionados: ações em massa
 */
function Inspector(props: { onClose: () => void; selectionCount: number; ambiente: Ambiente; onOpenComposicao: () => void }) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-[#e4e7eb] bg-white">
      <div className="flex h-9 items-center justify-between border-b border-[#eef1f4] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">
          {props.selectionCount === 0
            ? 'Resumo do ambiente'
            : props.selectionCount === 1
              ? 'Propriedades'
              : `${props.selectionCount} selecionados`}
        </span>
        <button
          type="button"
          onClick={props.onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-[#94a3b8] hover:bg-[#f3f5f8] hover:text-[#1a1f29]"
          title="Recolher inspector"
        >
          <PanelRightClose className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {props.selectionCount === 0 && <InspectorEmpty ambiente={props.ambiente} />}
        {props.selectionCount === 1 && <InspectorModule onOpenComposicao={props.onOpenComposicao} />}
        {props.selectionCount > 1 && <InspectorMultiple count={props.selectionCount} onOpenComposicao={props.onOpenComposicao} />}
      </div>
    </aside>
  )
}

function InspectorEmpty({ ambiente }: { ambiente: Ambiente }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="rounded-lg border border-[#e4e7eb] bg-[#fafbfc] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Ambiente atual</p>
        <p className="mt-0.5 text-[14px] font-semibold text-[#1a1f29]">{ambiente.label}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-[#e4e7eb] bg-white p-2.5">
          <p className="text-[9px] font-semibold uppercase text-[#94a3b8]">Peças</p>
          <p className="text-[16px] font-bold tabular-nums text-[#1a1f29]">{ambiente.pieces}</p>
        </div>
        <div className="rounded-lg border border-[#e4e7eb] bg-white p-2.5">
          <p className="text-[9px] font-semibold uppercase text-[#94a3b8]">Custo est.</p>
          <p className="text-[16px] font-bold tabular-nums text-[#1a1f29]">{formatCurrency(ambiente.valor)}</p>
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-[#d8dde4] bg-[#fafbfc] p-4 text-center">
        <IconSketchupSelect className="mx-auto h-10 w-10 text-[#94a3b8]" />
        <p className="mt-2 text-[11px] font-semibold text-[#334155]">Selecione um módulo no SketchUp</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-[#64748b]">
          O painel mostra propriedades, internos, ferragens e custo do que está selecionado.
        </p>
      </div>
      <SectionHeader title="Atalhos rápidos" />
      <div className="flex flex-col gap-1">
        {[
          { label: 'Inserir módulo', icon: Plus },
          { label: 'Aplicar acabamento em massa', icon: Paintbrush },
          { label: 'Validar projeto', icon: ShieldCheck },
          { label: 'Gerar plano de corte', icon: Drill },
        ].map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.label}
              type="button"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[#334155] hover:bg-[#f7f9fc]"
            >
              <Icon className="h-3.5 w-3.5 text-[#94a3b8]" />
              <span className="flex-1">{a.label}</span>
              <ChevronRight className="h-3 w-3 text-[#cbd5e1]" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function InspectorModule({ onOpenComposicao }: { onOpenComposicao: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <ModulePreviewSwatch preview="base" />
        <p className="mt-2 text-[13px] font-semibold text-[#1a1f29]">Módulo inferior 2 portas</p>
        <p className="text-[10px] tabular-nums text-[#64748b]">M-002 · Cozinha</p>
      </div>
      <div>
        <SectionHeader title="Dimensões" />
        <div className="grid grid-cols-3 gap-1.5 text-[11px] tabular-nums">
          {[
            { label: 'L', value: 800 },
            { label: 'A', value: 720 },
            { label: 'P', value: 560 },
          ].map((d) => (
            <div key={d.label} className="rounded-md border border-[#e4e7eb] bg-white px-2 py-1.5">
              <p className="text-[9px] uppercase text-[#94a3b8]">{d.label}</p>
              <p className="font-semibold text-[#1a1f29]">{d.value}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <SectionHeader title="Acabamento" />
        <button className="flex w-full items-center gap-2 rounded-md border border-[#e4e7eb] bg-white p-2 hover:border-[#d95f18]">
          <span className="h-6 w-6 rounded border border-[#e4e7eb] bg-[#fafafa]" />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-[11px] font-semibold text-[#1a1f29]">Branco TX</p>
            <p className="text-[9px] text-[#94a3b8]">Duratex · BR-TX</p>
          </div>
          <ChevronDown className="h-3 w-3 text-[#94a3b8]" />
        </button>
      </div>
      <div>
        <SectionHeader title="Internos" hint="2 itens" />
        <div className="flex flex-col gap-1 text-[11px]">
          <div className="flex items-center gap-2 rounded-md bg-[#fafbfc] px-2 py-1.5">
            <Boxes className="h-3 w-3 text-[#94a3b8]" />
            <span className="flex-1 text-[#334155]">2 portas com dobradiça</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-[#fafbfc] px-2 py-1.5">
            <Layers className="h-3 w-3 text-[#94a3b8]" />
            <span className="flex-1 text-[#334155]">1 prateleira interna</span>
          </div>
        </div>
      </div>
      <div>
        <SectionHeader title="Ferragens" hint="3 itens" />
        <div className="flex flex-col gap-1 text-[11px]">
          <div className="flex items-center gap-2 rounded-md bg-[#fafbfc] px-2 py-1.5">
            <Wrench className="h-3 w-3 text-[#94a3b8]" />
            <span className="flex-1 text-[#334155]">2× Clip Top Blumotion</span>
            <span className="tabular-nums text-[#94a3b8]">R$ 37</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-[#fafbfc] px-2 py-1.5">
            <Wrench className="h-3 w-3 text-[#94a3b8]" />
            <span className="flex-1 text-[#334155]">1× Puxador Cava</span>
            <span className="tabular-nums text-[#94a3b8]">R$ 14</span>
          </div>
        </div>
      </div>
      <div className="rounded-lg border-2 border-[#1a1f29] bg-[#1a1f29] p-2.5">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-[#94a3b8]">Custo estimado</p>
        <p className="text-[16px] font-bold tabular-nums text-white">R$ 312,40</p>
      </div>
      {/* Botão Composição — destaque, é o fluxo principal de edição */}
      <button
        type="button"
        onClick={onOpenComposicao}
        className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#d95f18] text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#c24c14]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Abrir Composição
        <ChevronRight className="h-3 w-3" />
      </button>
      <div className="flex gap-1.5">
        <button className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-[#e4e7eb] bg-white text-[11px] font-semibold text-[#4b5565] hover:bg-[#f7f9fc]">
          <Pencil className="h-3 w-3" /> Renomear
        </button>
        <button className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-[#e4e7eb] bg-white text-[11px] font-semibold text-[#4b5565] hover:bg-[#f7f9fc]">
          <Paintbrush className="h-3 w-3" /> Só acabamento
        </button>
      </div>
    </div>
  )
}

function InspectorMultiple({ count, onOpenComposicao }: { count: number; onOpenComposicao: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="rounded-lg border border-[#fdba74] bg-[#fff7ed] p-3 text-center">
        <p className="text-[24px] font-bold text-[#9a3412]">{count}</p>
        <p className="text-[11px] text-[#9a3412]">módulos selecionados</p>
      </div>
      {/* Botão de destaque pro Composição em lote */}
      <button
        type="button"
        onClick={onOpenComposicao}
        className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#d95f18] text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#c24c14]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Composição em lote
        <ChevronRight className="h-3 w-3" />
      </button>
      <SectionHeader title="Outras ações em massa" />
      <div className="flex flex-col gap-1">
        {[
          { label: 'Aplicar acabamento', icon: Paintbrush },
          { label: 'Trocar ferragem', icon: Wrench },
          { label: 'Atribuir material', icon: Sparkles },
          { label: 'Aplicar usinagem padrão', icon: IconSpindleCNC },
          { label: 'Selecionar similares', icon: MousePointer2 },
          { label: 'Duplicar selecionados', icon: Plus },
        ].map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.label}
              type="button"
              className="flex items-center gap-2 rounded-md border border-[#e4e7eb] bg-white px-2.5 py-2 text-left text-[12px] font-semibold text-[#334155] transition-colors hover:bg-[#f7f9fc]"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="flex-1">{a.label}</span>
              <ChevronRight className="h-3 w-3 text-[#cbd5e1]" />
            </button>
          )
        })}
      </div>
      <SectionHeader title="Resumo" />
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="rounded-md border border-[#e4e7eb] bg-white p-2">
          <p className="text-[9px] uppercase text-[#94a3b8]">Custo soma</p>
          <p className="font-semibold tabular-nums text-[#1a1f29]">R$ 1.847</p>
        </div>
        <div className="rounded-md border border-[#e4e7eb] bg-white p-2">
          <p className="text-[9px] uppercase text-[#94a3b8]">Peças totais</p>
          <p className="font-semibold tabular-nums text-[#1a1f29]">{count * 8}</p>
        </div>
      </div>
    </div>
  )
}

/* ───────────────── Status bar ───────────────── */

function StatusBar(props: {
  sync: SyncStatus
  conflicts: Conflict[]
  onConflictsClick: () => void
  onOrcamentoClick: () => void
  ambiente: Ambiente
  width: number
}) {
  const compact = props.width < 520
  const errors = props.conflicts.filter((c) => c.severity === 'error').length
  const warns = props.conflicts.filter((c) => c.severity === 'warn').length
  const total = errors + warns

  const sel = sketchupSelectionMock

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-[#e4e7eb] bg-[#fafbfc] px-3 text-[11px] tabular-nums text-[#4b5565]">
      {/* Indicador de seleção do SketchUp */}
      <button
        type="button"
        title={sel.count > 0 ? `Selecionado no SketchUp: ${sel.label}` : 'Nada selecionado no SketchUp'}
        className={cn(
          'flex h-5 items-center gap-1 rounded px-1.5 transition-colors',
          sel.count > 0
            ? 'bg-[#fff1e8] text-[#a24510] hover:bg-[#ffe2cd]'
            : 'text-[#94a3b8] hover:bg-[#f3f5f8]',
        )}
      >
        <MousePointer2 className="h-3 w-3" />
        {sel.count > 0 ? (
          compact ? (
            <span className="font-semibold">{sel.count}</span>
          ) : (
            <>
              <span className="font-semibold">{sel.count}</span>
              <span className="max-w-[140px] truncate font-normal">{sel.label}</span>
            </>
          )
        ) : (
          !compact && <span>nada selecionado</span>
        )}
      </button>

      <Sep />
      <Stat label="peças" value={props.ambiente.pieces} />
      {!compact && (
        <>
          <Sep />
          <Stat label="m²" value={projectMock.area.toFixed(1)} />
        </>
      )}
      <Sep />
      {/* Orçamento clicável — sempre visível, abre Produção > Orçamento */}
      <button
        type="button"
        onClick={props.onOrcamentoClick}
        title="Abrir orçamento (em Produção)"
        className="flex h-5 items-center gap-1 rounded px-1.5 text-[#1a1f29] transition-colors hover:bg-[#fff1e8] hover:text-[#a24510]"
      >
        <span className="text-[10px] uppercase tracking-wider text-[#94a3b8] group-hover:text-[#a24510]">orç.</span>
        <span className="font-semibold">{formatCurrency(props.ambiente.valor)}</span>
        <ChevronRight className="h-3 w-3 text-[#cbd5e1]" />
      </button>
      {!compact && (
        <>
          <Sep />
          <button
            type="button"
            onClick={props.onConflictsClick}
            className={cn(
              'flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors',
              total > 0 ? 'text-[#b45309] hover:bg-[#fef3c7]' : 'text-[#94a3b8]',
            )}
          >
            <AlertTriangle className={cn('h-3 w-3', total === 0 && 'opacity-40')} />
            {total > 0 ? (
              <span>
                <span className="font-semibold">{total}</span> {total === 1 ? 'conflito' : 'conflitos'}
              </span>
            ) : (
              <span>sem conflitos</span>
            )}
          </button>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {!compact && (
          <span className="text-[10px] uppercase tracking-wider text-[#94a3b8]">v0.4.0 · Ornato · SketchUp Plugin</span>
        )}
        <SyncChip status={props.sync} compact={compact} />
      </div>
    </footer>
  )
}

function Stat({ label, value, bold }: { label: string; value: string | number; bold?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={cn(bold ? 'text-[#1a1f29] font-semibold' : 'text-[#334155]')}>{value}</span>
      {label && <span className="text-[#94a3b8]">{label}</span>}
    </span>
  )
}

function Sep() {
  return <span className="h-3 w-px bg-[#e4e7eb]" />
}

/* ───────────────── Conflicts drawer ───────────────── */

function ConflictsDrawer(props: { open: boolean; conflicts: Conflict[]; onClose: () => void }) {
  if (!props.open) return null
  return (
    <div className="absolute inset-x-0 bottom-7 z-40 flex justify-end p-2">
      <div className="w-[360px] max-w-full rounded-lg border border-[#e4e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
        <div className="flex items-center justify-between border-b border-[#eef1f4] px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-[#b45309]" />
            <span className="text-[12px] font-semibold text-[#1a1f29]">Conflitos do projeto</span>
            <span className="rounded bg-[#fef3c7] px-1.5 py-0.5 text-[10px] font-semibold text-[#b45309]">
              {props.conflicts.length}
            </span>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="flex h-5 w-5 items-center justify-center rounded text-[#94a3b8] hover:bg-[#f3f5f8] hover:text-[#1a1f29]"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <ul className="max-h-[280px] overflow-y-auto py-1">
          {props.conflicts.map((c) => (
            <li key={c.id} className="flex gap-2 px-3 py-2 hover:bg-[#fafbfc]">
              <span
                className={cn(
                  'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                  c.severity === 'error' ? 'bg-[#dc2626]' : 'bg-[#f59e0b]',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[#1a1f29]">{c.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#64748b]">{c.detail}</p>
              </div>
              <button
                type="button"
                className="self-start rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#d95f18] hover:bg-[#fff1e8]"
              >
                ver
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ───────────────── Command palette (placeholder Fase 4) ───────────────── */

function CommandPalette(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-8" onClick={props.onClose}>
      <div
        className="w-full max-w-[520px] rounded-xl border border-[#e4e7eb] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#eef1f4] px-3 py-2.5">
          <Search className="h-4 w-4 text-[#94a3b8]" />
          <input
            autoFocus
            placeholder="Buscar módulo, acabamento, comando..."
            className="flex-1 bg-transparent text-[14px] text-[#1a1f29] outline-none placeholder:text-[#94a3b8]"
          />
          <kbd className="rounded bg-[#eef1f4] px-1.5 py-0.5 text-[10px] font-semibold text-[#64748b]">esc</kbd>
        </div>
        <div className="px-3 py-8 text-center">
          <Command className="mx-auto h-6 w-6 text-[#cbd5e1]" />
          <p className="mt-2 text-[12px] text-[#64748b]">
            Command Palette virá na Fase 4 — busca global, comandos, atalhos.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ───────────────── Main content header ─────────────────
 * Único header da área principal. Em modo compacto (<520px),
 * o nome do submenu vira dropdown clicável que abre uma lista popover.
 * Em ≥520px, a sidebar lateral já cumpre esse papel — header só breadcrumb + ações.
 */

function MainContent(props: {
  tab: MainTab
  submenu: string | null
  width: number
  onPickSubmenu: (id: string) => void
}) {
  const Icon = props.tab.icon
  const subItem = props.tab.submenu.find((s) => s.id === props.submenu)
  const compact = props.width < 520
  const ultraCompact = props.width < 420
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Fecha popover ao clicar fora
  useEffect(() => {
    if (!pickerOpen) return
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [pickerOpen])

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* HEADER UNIFICADO — substitui chip rail + sub-header */}
      <div className="relative flex h-11 shrink-0 items-center gap-2 border-b border-[#eef1f4] bg-white px-3">
        {/* Esquerda: ícone + título do submenu (dropdown em compact) */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#fff1e8]">
            <Icon className="h-3.5 w-3.5 text-[#d95f18]" />
          </div>

          {compact ? (
            <div className="relative min-w-0 flex-1" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                title={`${props.tab.label} · ${subItem?.label ?? ''}`}
                className="flex h-7 w-full items-center gap-1 rounded px-1 text-left hover:bg-[#f7f9fc]"
              >
                {/* Sem "BIBLIOTECA >" — ícone laranja à esquerda + sidebar já comunicam a tab */}
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#1a1f29]">
                  {subItem?.label ?? '—'}
                </span>
                {typeof subItem?.count === 'number' && (
                  <span className="shrink-0 rounded bg-[#f3f5f8] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#64748b]">
                    {subItem.count}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    'h-3 w-3 shrink-0 text-[#94a3b8] transition-transform',
                    pickerOpen && 'rotate-180',
                  )}
                />
              </button>
              {pickerOpen && (
                <div className="absolute left-0 top-full z-30 mt-1 w-[240px] rounded-lg border border-[#e4e7eb] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                  <div className="border-b border-[#eef1f4] px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                      {props.tab.label}
                    </span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto py-1">
                    {props.tab.submenu.map((item) => {
                      const isActive = props.submenu === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            props.onPickSubmenu(item.id)
                            setPickerOpen(false)
                          }}
                          className={cn(
                            'flex h-7 w-full items-center gap-2 px-3 text-left text-[12px] transition-colors',
                            isActive
                              ? 'bg-[#fff1e8] font-semibold text-[#a24510]'
                              : 'text-[#334155] hover:bg-[#f7f9fc]',
                          )}
                        >
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <span className="rounded bg-[#dbeafe] px-1 text-[9px] font-semibold uppercase text-[#1d4ed8]">
                              {item.badge}
                            </span>
                          )}
                          {typeof item.count === 'number' && (
                            <span className="text-[10px] tabular-nums text-[#94a3b8]">{item.count}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // ≥520: só nome do submenu (já tem sidebar lateral mostrando a tab)
            <div className="flex min-w-0 items-baseline gap-2 truncate" title={`${props.tab.label} · ${subItem?.label ?? ''}`}>
              {subItem && (
                <>
                  <span className="truncate text-[15px] font-semibold text-[#1a1f29]">{subItem.label}</span>
                  {typeof subItem.count === 'number' && (
                    <span className="text-[11px] font-medium tabular-nums text-[#94a3b8]">
                      {subItem.count} {subItem.count === 1 ? 'item' : 'itens'}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Direita: ações contextuais por tab */}
        <div className="flex shrink-0 items-center gap-1">
          {!ultraCompact && (
            <button
              type="button"
              title="Filtros"
              className="flex h-7 items-center gap-1 rounded-md border border-[#e4e7eb] bg-white px-2 text-[11px] font-medium text-[#4b5565] hover:bg-[#f7f9fc]"
            >
              <Layers className="h-3 w-3" />
              {!compact && <span>Filtros</span>}
            </button>
          )}
          {(() => {
            const action = primaryActionByTab[props.tab.id]
            const Icon = action.icon
            const isPrimary = action.tone === 'primary'
            return (
              <button
                type="button"
                title={action.label}
                className={cn(
                  'flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-colors',
                  isPrimary
                    ? 'bg-[#d95f18] text-white hover:bg-[#c24c14]'
                    : 'bg-[#1a1f29] text-white hover:bg-[#0f1219]',
                )}
              >
                <Icon className="h-3 w-3" />
                {!ultraCompact && <span>{action.label}</span>}
              </button>
            )
          })()}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <TabContentRouter tab={props.tab} sub={subItem ?? null} width={props.width} />
      </div>
    </main>
  )
}

/* ═════════════════════════════════════════════════════════════
 *  FASE 2 — Conteúdo de cada tab (mocks ricos)
 * ═════════════════════════════════════════════════════════════ */

/* ───── Mocks de domínio ───── */

type ModuleCard = {
  id: string
  name: string
  cat: string
  dims: string
  material: string
  status: 'local' | 'cloud' | 'updated' | 'pending'
  preview: 'base' | 'tower' | 'corner' | 'shelf' | 'panel' | 'door'
  badge?: string
}

const modulesMock: ModuleCard[] = [
  { id: 'm-001', name: 'Módulo inferior 2 portas', cat: 'cozinha', dims: '800 × 720 × 560', material: 'Branco TX', status: 'updated', preview: 'base' },
  { id: 'm-002', name: 'Torre forno e micro', cat: 'cozinha', dims: '700 × 2200 × 580', material: 'Carvalho Natural', status: 'cloud', preview: 'tower' },
  { id: 'm-003', name: 'Aéreo basculante', cat: 'cozinha', dims: '900 × 420 × 330', material: 'Branco TX', status: 'local', preview: 'panel' },
  { id: 'm-004', name: 'Canto superior reto', cat: 'cozinha', dims: '720 × 680 × 350', material: 'Branco TX', status: 'local', preview: 'corner' },
  { id: 'm-005', name: 'Inferior 3 gavetas', cat: 'cozinha', dims: '600 × 720 × 560', material: 'Carvalho Natural', status: 'updated', preview: 'base' },
  { id: 'm-006', name: 'Torre despenseiro', cat: 'cozinha', dims: '600 × 2200 × 580', material: 'Branco TX', status: 'cloud', preview: 'tower', badge: 'Novo' },
  { id: 'm-007', name: 'Inferior 1 porta', cat: 'cozinha', dims: '400 × 720 × 560', material: 'Carvalho Natural', status: 'local', preview: 'door' },
  { id: 'm-008', name: 'Aéreo 2 portas vidro', cat: 'cozinha', dims: '800 × 720 × 330', material: 'Vidro temperado', status: 'pending', preview: 'panel' },
  { id: 'm-009', name: 'Prateleira nicho', cat: 'cozinha', dims: '600 × 360 × 300', material: 'Branco TX', status: 'local', preview: 'shelf' },
]

type Finish = { id: string; name: string; code: string; supplier: string; type: 'mdf' | 'laminado' | 'vidro' | 'metal'; color: string; pattern?: string }
const finishesMock: Finish[] = [
  { id: 'f-1', name: 'Branco TX', code: 'BR-TX', supplier: 'Duratex', type: 'mdf', color: '#fafafa' },
  { id: 'f-2', name: 'Carvalho Natural', code: 'CV-NT', supplier: 'Eucatex', type: 'mdf', color: '#c9a36b', pattern: 'wood' },
  { id: 'f-3', name: 'Preto TX', code: 'PR-TX', supplier: 'Duratex', type: 'mdf', color: '#1c1c1c' },
  { id: 'f-4', name: 'Cinza Cristal', code: 'CN-CR', supplier: 'Masisa', type: 'mdf', color: '#9ca3af' },
  { id: 'f-5', name: 'Nogueira', code: 'NG-RJ', supplier: 'Duratex', type: 'mdf', color: '#6f4e37', pattern: 'wood' },
  { id: 'f-6', name: 'Branco Real', code: 'BR-RL', supplier: 'Eucatex', type: 'laminado', color: '#ffffff' },
  { id: 'f-7', name: 'Areia', code: 'AR-CL', supplier: 'Duratex', type: 'laminado', color: '#d2b48c' },
  { id: 'f-8', name: 'Vidro Fumê', code: 'VD-FM', supplier: 'Vidraçaria SP', type: 'vidro', color: '#3f4854' },
  { id: 'f-9', name: 'Inox Escovado', code: 'IX-ES', supplier: 'Aços Brasil', type: 'metal', color: '#aab2bd' },
  { id: 'f-10', name: 'Cobre', code: 'CB-RG', supplier: 'Aços Brasil', type: 'metal', color: '#b87333' },
]

type Hardware = { id: string; name: string; brand: string; model: string; price: number; type: 'dobradica' | 'corredica' | 'puxador' | 'pe' }
const hardwareMock: Hardware[] = [
  { id: 'h-1', name: 'Dobradiça Clip Top Blumotion', brand: 'Blum', model: 'CT-110-BLM', price: 18.50, type: 'dobradica' },
  { id: 'h-2', name: 'Dobradiça Soft Close', brand: 'Hettich', model: 'SH-95', price: 12.80, type: 'dobradica' },
  { id: 'h-3', name: 'Dobradiça Caneco 35mm', brand: 'FGV', model: 'FGV-C35', price: 4.90, type: 'dobradica' },
  { id: 'h-4', name: 'Corrediça Tandem 500mm', brand: 'Blum', model: 'TD-500', price: 89.00, type: 'corredica' },
  { id: 'h-5', name: 'Corrediça Telescópica', brand: 'Hettich', model: 'TS-450', price: 32.00, type: 'corredica' },
  { id: 'h-6', name: 'Puxador Cava Black', brand: 'Esquadrias', model: 'CV-128', price: 14.50, type: 'puxador' },
  { id: 'h-7', name: 'Pé Cromado 100mm', brand: 'FGV', model: 'PE-100C', price: 7.80, type: 'pe' },
]

type Piece = { code: string; name: string; material: string; thickness: string; dim: string; qty: number; edges: string }
const piecesMock: Piece[] = [
  { code: 'GAV-01-LAT', name: 'Lateral gaveta esq.', material: 'MDF Branco TX', thickness: '15mm', dim: '500 × 120', qty: 4, edges: '2L' },
  { code: 'GAV-01-FUN', name: 'Fundo gaveta', material: 'Eucalipto', thickness: '6mm', dim: '470 × 540', qty: 4, edges: '—' },
  { code: 'POR-12', name: 'Porta inferior 2P', material: 'MDF Branco TX', thickness: '18mm', dim: '700 × 380', qty: 2, edges: '4F' },
  { code: 'PRT-04', name: 'Prateleira interna', material: 'MDF Branco TX', thickness: '15mm', dim: '764 × 520', qty: 12, edges: '1F' },
  { code: 'LAT-08-T', name: 'Lateral torre', material: 'MDF Carvalho', thickness: '18mm', dim: '2200 × 580', qty: 2, edges: '2F' },
  { code: 'BAS-02', name: 'Base inferior', material: 'MDF Branco TX', thickness: '18mm', dim: '764 × 540', qty: 6, edges: '2F' },
  { code: 'TPO-03', name: 'Tampo torre', material: 'MDF Carvalho', thickness: '18mm', dim: '600 × 580', qty: 1, edges: '4F' },
]

type Validation = { id: string; status: 'ok' | 'warn' | 'error'; label: string; detail?: string }
const validationsMock: Validation[] = [
  { id: 'v-1', status: 'ok', label: 'Todas as peças têm material atribuído' },
  { id: 'v-2', status: 'ok', label: 'Todas as gavetas cabem nas caixas' },
  { id: 'v-3', status: 'ok', label: 'Tolerâncias de fitas dentro do limite' },
  { id: 'v-4', status: 'warn', label: 'Furação conflitante', detail: '2 módulos com furação na mesma face (M-014, M-015)' },
  { id: 'v-5', status: 'error', label: 'Material ausente', detail: 'Painel "Lateral cozinha" sem material atribuído' },
  { id: 'v-6', status: 'ok', label: 'Todas as ferragens compatíveis com módulos' },
  { id: 'v-7', status: 'warn', label: 'Otimização de chapa abaixo de 80%', detail: 'Aproveitamento estimado: 73% — 6 chapas necessárias' },
  { id: 'v-8', status: 'ok', label: 'Plano de corte gerado' },
]

const machiningMock = [
  { id: 'mc-1', name: 'Furação 5mm cavilha', icon: 'circle-dot', params: 'Ø 5mm · prof 25mm' },
  { id: 'mc-2', name: 'Furação 8mm cavilha', icon: 'circle-dot', params: 'Ø 8mm · prof 30mm' },
  { id: 'mc-3', name: 'Furação 35mm caneco', icon: 'circle', params: 'Ø 35mm · prof 13mm' },
  { id: 'mc-4', name: 'Rebaixo dobradiça', icon: 'square', params: '45 × 45 × 13mm' },
  { id: 'mc-5', name: 'Encaixe corrediça', icon: 'square', params: 'L 45mm · h 12mm' },
  { id: 'mc-6', name: 'Cavilha auto', icon: 'circle-dot', params: 'Ø 8mm · auto-detect' },
]

const ambienteFeatures = [
  { id: 'pa', label: 'Paredes', count: 4, icon: Frame },
  { id: 'ja', label: 'Janelas', count: 2, icon: Frame },
  { id: 'po', label: 'Portas', count: 1, icon: Frame },
  { id: 'tm', label: 'Tomadas', count: 8, icon: Frame },
  { id: 'vg', label: 'Vigas', count: 1, icon: Frame },
  { id: 'il', label: 'Pontos de luz', count: 3, icon: Lightbulb },
]

/* ───── Componentes auxiliares ───── */

function SectionHeader({ title, action, hint }: { title: string; action?: ReactNodeAction; hint?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#94a3b8]">{title}</h3>
        {hint && <span className="text-[10px] text-[#94a3b8]">{hint}</span>}
      </div>
      {action}
    </div>
  )
}
type ReactNodeAction = JSX.Element | null

function StatusPill({ status }: { status: ModuleCard['status'] }) {
  const map = {
    local: { label: 'local', color: '#475569', bg: '#e2e8f0' },
    cloud: { label: 'nuvem', color: '#1d4ed8', bg: '#dbeafe' },
    updated: { label: 'atualizado', color: '#047857', bg: '#d1fae5' },
    pending: { label: 'pendente', color: '#b45309', bg: '#fef3c7' },
  } as const
  const info = map[status]
  return (
    <span
      className="inline-flex h-4 items-center rounded px-1.5 text-[9px] font-semibold uppercase tracking-wider"
      style={{ background: info.bg, color: info.color }}
    >
      {info.label}
    </span>
  )
}

function ModulePreviewSwatch({ preview }: { preview: ModuleCard['preview'] }) {
  // SVG simples representativo do tipo de módulo
  return (
    <div className="relative flex h-20 w-full items-center justify-center overflow-hidden rounded-md border border-[#e4e7eb] bg-gradient-to-br from-[#fefcf9] to-[#f3ece1]">
      <svg viewBox="0 0 80 60" className="h-14 w-14 text-[#a47c4b]">
        {preview === 'base' && (
          <g fill="currentColor" opacity="0.85">
            <rect x="6" y="14" width="68" height="40" rx="2" fill="#d4b58a" />
            <line x1="40" y1="14" x2="40" y2="54" stroke="#8a6a3e" strokeWidth="1.2" />
            <rect x="10" y="18" width="26" height="32" rx="1" fill="#e8c89a" />
            <rect x="44" y="18" width="26" height="32" rx="1" fill="#e8c89a" />
          </g>
        )}
        {preview === 'tower' && (
          <g fill="currentColor">
            <rect x="22" y="4" width="36" height="52" rx="2" fill="#d4b58a" />
            <rect x="26" y="8" width="28" height="14" fill="#bfa477" />
            <rect x="26" y="26" width="28" height="14" fill="#e8c89a" />
            <rect x="26" y="44" width="28" height="8" fill="#e8c89a" />
          </g>
        )}
        {preview === 'corner' && (
          <g fill="currentColor">
            <path d="M6 14 L74 14 L74 34 L34 34 L34 54 L6 54 Z" fill="#d4b58a" />
          </g>
        )}
        {preview === 'shelf' && (
          <g fill="currentColor">
            <rect x="8" y="20" width="64" height="6" fill="#d4b58a" />
            <rect x="8" y="34" width="64" height="6" fill="#d4b58a" />
            <rect x="8" y="48" width="64" height="6" fill="#d4b58a" />
          </g>
        )}
        {preview === 'panel' && (
          <g fill="currentColor">
            <rect x="6" y="14" width="68" height="40" rx="2" fill="#d4b58a" />
            <rect x="10" y="18" width="60" height="32" rx="1" fill="#e8c89a" />
          </g>
        )}
        {preview === 'door' && (
          <g fill="currentColor">
            <rect x="14" y="6" width="52" height="48" rx="2" fill="#d4b58a" />
            <rect x="18" y="10" width="44" height="40" fill="#e8c89a" />
            <circle cx="58" cy="30" r="2" fill="#8a6a3e" />
          </g>
        )}
      </svg>
    </div>
  )
}

function ToolbarSearch(props: { placeholder?: string; chips?: Array<{ id: string; label: string; active?: boolean }>; trailing?: ReactNodeAction }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-8 flex-1 items-center gap-2 rounded-md border border-[#e4e7eb] bg-white px-2.5">
        <Search className="h-3.5 w-3.5 text-[#94a3b8]" />
        <input
          placeholder={props.placeholder ?? 'Buscar…'}
          className="flex-1 bg-transparent text-[12px] text-[#1a1f29] outline-none placeholder:text-[#94a3b8]"
        />
      </div>
      {props.chips && (
        <div className="flex items-center gap-1">
          {props.chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                'h-7 rounded-md border px-2 text-[11px] font-medium transition-colors',
                c.active
                  ? 'border-[#d95f18] bg-[#fff1e8] text-[#a24510]'
                  : 'border-[#e4e7eb] bg-white text-[#4b5565] hover:bg-[#f7f9fc]',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {props.trailing}
    </div>
  )
}

/* ───── Tab views ───── */

function LibraryView({ width, sub }: { width: number; sub: SubmenuItem | null }) {
  const cols = width < 460 ? 1 : width < 720 ? 2 : 3
  return (
    <div className="flex flex-col">
      <ToolbarSearch
        placeholder="Buscar módulo na biblioteca…"
        chips={[
          { id: 'all', label: 'Todos', active: true },
          { id: 'fav', label: 'Favoritos' },
          { id: 'rec', label: 'Recentes' },
        ]}
      />
      <SectionHeader title={sub?.label ?? 'Módulos'} hint={`${modulesMock.length} resultados`} />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {modulesMock.map((m) => (
          <button
            key={m.id}
            type="button"
            className="group relative flex flex-col gap-1.5 rounded-lg border border-[#e4e7eb] bg-white p-2 text-left transition-all hover:border-[#d95f18] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)]"
          >
            {m.badge && (
              <span className="absolute right-1.5 top-1.5 z-10 rounded bg-[#d95f18] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white shadow-sm">
                {m.badge}
              </span>
            )}
            <ModulePreviewSwatch preview={m.preview} />
            <div className="flex items-start justify-between gap-1">
              <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-[#1a1f29]">{m.name}</p>
              <StatusPill status={m.status} />
            </div>
            <p className="text-[10px] tabular-nums text-[#64748b]">{m.dims} mm</p>
            <p className="text-[10px] text-[#94a3b8]">{m.material}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function FinishesView({ width }: { width: number; sub: SubmenuItem | null }) {
  const cols = width < 460 ? 3 : width < 720 ? 4 : 6
  return (
    <div className="flex flex-col">
      <ToolbarSearch
        placeholder="Buscar acabamento…"
        chips={[
          { id: 'all', label: 'Todos', active: true },
          { id: 'mdf', label: 'MDF' },
          { id: 'lam', label: 'Laminados' },
          { id: 'vid', label: 'Vidros' },
        ]}
      />
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#fdba74] bg-[#fff7ed] p-2.5 text-[11px]">
        <Paintbrush className="h-3.5 w-3.5 text-[#d95f18]" />
        <span className="text-[#9a3412]">
          <strong>1 módulo selecionado</strong> no SketchUp · clique em um swatch para aplicar
        </span>
      </div>
      <SectionHeader title="Acabamentos" hint={`${finishesMock.length} disponíveis`} />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {finishesMock.map((f) => (
          <button
            key={f.id}
            type="button"
            className="group flex flex-col gap-1 rounded-lg border border-[#e4e7eb] bg-white p-1.5 text-left transition-all hover:border-[#d95f18] hover:shadow-[0_4px_12px_rgba(15,23,42,0.08)]"
          >
            <div
              className="aspect-square w-full rounded-md border border-[#e4e7eb]"
              style={{
                background: f.color,
                backgroundImage:
                  f.pattern === 'wood'
                    ? 'repeating-linear-gradient(110deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 9px)'
                    : undefined,
              }}
            />
            <p className="truncate text-[11px] font-semibold text-[#1a1f29]">{f.name}</p>
            <p className="truncate text-[9px] tabular-nums text-[#94a3b8]">
              {f.code} · {f.supplier}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

function HardwareView({ sub }: { width: number; sub: SubmenuItem | null }) {
  const grouped = {
    dobradica: hardwareMock.filter((h) => h.type === 'dobradica'),
    corredica: hardwareMock.filter((h) => h.type === 'corredica'),
    puxador: hardwareMock.filter((h) => h.type === 'puxador'),
    pe: hardwareMock.filter((h) => h.type === 'pe'),
  }
  return (
    <div className="flex flex-col gap-3">
      <ToolbarSearch placeholder="Buscar ferragem por marca, modelo ou nome…" />
      {(['dobradica', 'corredica', 'puxador', 'pe'] as const).map((type) => {
        const items = grouped[type]
        if (items.length === 0) return null
        const titles = { dobradica: 'Dobradiças', corredica: 'Corrediças', puxador: 'Puxadores', pe: 'Pés e niveladores' }
        return (
          <div key={type}>
            <SectionHeader title={titles[type]} hint={`${items.length} ${items.length === 1 ? 'item' : 'itens'}`} />
            <div className="flex flex-col rounded-lg border border-[#e4e7eb] bg-white">
              {items.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[#fafbfc]',
                    i > 0 && 'border-t border-[#eef1f4]',
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f3f5f8]">
                    <Wrench className="h-4 w-4 text-[#4b5565]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-[#1a1f29]">{h.name}</p>
                    <p className="text-[10px] text-[#64748b]">
                      {h.brand} · <span className="tabular-nums">{h.model}</span>
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold tabular-nums text-[#1a1f29]">
                    {formatCurrency(h.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MachiningView() {
  return (
    <div className="flex flex-col gap-3">
      {/* Hero — destaque pro spindle CNC */}
      <div className="flex items-center gap-3 rounded-lg border border-[#e4e7eb] bg-gradient-to-br from-[#1a1f29] to-[#0f1219] p-3 text-white">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#d95f18]/20 ring-1 ring-[#d95f18]/40">
          <IconSpindleCNC className="h-7 w-7 text-[#d95f18]" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#d95f18]">Spindle CNC</p>
          <p className="text-[13px] font-semibold">Operações de usinagem</p>
          <p className="text-[10px] text-[#94a3b8]">
            Configure furação, rebaixos e encaixes em módulos selecionados
          </p>
        </div>
      </div>

      <ToolbarSearch placeholder="Buscar operação ou padrão…" />
      <SectionHeader
        title="Operações disponíveis"
        hint="Aplicar em módulo selecionado"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {machiningMock.map((op) => (
          <button
            key={op.id}
            type="button"
            className="flex items-center gap-3 rounded-lg border border-[#e4e7eb] bg-white p-2.5 text-left transition-all hover:border-[#d95f18] hover:shadow-sm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#fff1e8]">
              <IconSpindleCNC className="h-5 w-5 text-[#d95f18]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[#1a1f29]">{op.name}</p>
              <p className="text-[10px] tabular-nums text-[#64748b]">{op.params}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-dashed border-[#d8dde4] bg-[#fafbfc] p-4 text-center">
        <p className="text-[12px] font-semibold text-[#334155]">Padrões salvos</p>
        <p className="mt-1 text-[11px] text-[#64748b]">
          Salve combinações de operações por tipo de módulo (ex: gaveta padrão, porta com puxador cava)
        </p>
        <button
          type="button"
          className="mt-2 rounded-md bg-[#1a1f29] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0f1219]"
        >
          + Criar padrão
        </button>
      </div>
    </div>
  )
}

function ValidationView() {
  const ok = validationsMock.filter((v) => v.status === 'ok').length
  const warn = validationsMock.filter((v) => v.status === 'warn').length
  const error = validationsMock.filter((v) => v.status === 'error').length
  const ready = error === 0
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border p-3',
          ready ? 'border-[#a7f3d0] bg-[#ecfdf5]' : 'border-[#fdba74] bg-[#fff7ed]',
        )}
      >
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            ready ? 'bg-[#10b981]' : 'bg-[#f59e0b]',
          )}
        >
          {ready ? <CheckCircle2 className="h-5 w-5 text-white" /> : <AlertTriangle className="h-5 w-5 text-white" />}
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-[#1a1f29]">
            {ready ? 'Projeto pronto para produção' : 'Projeto precisa de atenção antes de produzir'}
          </p>
          <p className="mt-0.5 text-[11px] text-[#64748b]">
            <span className="font-semibold text-[#047857]">{ok} ok</span>
            {warn > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-[#b45309]">{warn} {warn === 1 ? 'aviso' : 'avisos'}</span>
              </>
            )}
            {error > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-[#dc2626]">{error} {error === 1 ? 'erro' : 'erros'}</span>
              </>
            )}
          </p>
        </div>
      </div>
      <SectionHeader title="Checagens" hint={`${validationsMock.length} verificações`} />
      <div className="flex flex-col rounded-lg border border-[#e4e7eb] bg-white">
        {validationsMock.map((v, i) => {
          const colors = {
            ok: { dot: '#10b981', bg: '#ecfdf5', icon: CheckCircle2 },
            warn: { dot: '#f59e0b', bg: '#fff7ed', icon: AlertTriangle },
            error: { dot: '#dc2626', bg: '#fee2e2', icon: AlertTriangle },
          }[v.status]
          const Icon = colors.icon
          return (
            <div
              key={v.id}
              className={cn('flex items-start gap-3 px-3 py-2.5', i > 0 && 'border-t border-[#eef1f4]')}
            >
              <div
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ background: colors.bg }}
              >
                <Icon className="h-3 w-3" style={{ color: colors.dot }} />
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-semibold text-[#1a1f29]">{v.label}</p>
                {v.detail && <p className="mt-0.5 text-[11px] text-[#64748b]">{v.detail}</p>}
              </div>
              {v.status !== 'ok' && (
                <button
                  type="button"
                  className="self-start rounded-md px-2 py-1 text-[10px] font-semibold text-[#d95f18] hover:bg-[#fff1e8]"
                >
                  Ver
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReportsView({ sub }: { width: number; sub: SubmenuItem | null }) {
  const totalQty = piecesMock.reduce((acc, p) => acc + p.qty, 0)
  return (
    <div className="flex flex-col gap-3">
      <ToolbarSearch
        placeholder="Buscar peça por código, material…"
        chips={[
          { id: 'all', label: 'Todas', active: true },
          { id: 'cor', label: 'Para corte' },
          { id: 'cnc', label: 'CNC' },
        ]}
      />
      <SectionHeader
        title={sub?.label ?? 'Lista de peças'}
        hint={`${piecesMock.length} tipos · ${totalQty} unidades · 8.3 m²`}
      />
      <div className="overflow-hidden rounded-lg border border-[#e4e7eb] bg-white">
        <div className="grid grid-cols-[80px_1fr_70px_70px_50px] gap-2 border-b border-[#e4e7eb] bg-[#fafbfc] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">
          <span>Código</span>
          <span>Peça · Material</span>
          <span>Esp.</span>
          <span>Dim. (mm)</span>
          <span className="text-right">Qtd</span>
        </div>
        {piecesMock.map((p, i) => (
          <div
            key={p.code}
            className={cn(
              'grid grid-cols-[80px_1fr_70px_70px_50px] gap-2 px-3 py-2 text-[12px] hover:bg-[#fafbfc]',
              i > 0 && 'border-t border-[#eef1f4]',
            )}
          >
            <span className="truncate font-mono text-[10px] tabular-nums text-[#64748b]">{p.code}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-[#1a1f29]">{p.name}</p>
              <p className="truncate text-[10px] text-[#94a3b8]">{p.material}</p>
            </div>
            <span className="text-[11px] tabular-nums text-[#4b5565]">{p.thickness}</span>
            <span className="text-[11px] tabular-nums text-[#4b5565]">{p.dim}</span>
            <span className="text-right font-semibold tabular-nums text-[#1a1f29]">{p.qty}</span>
          </div>
        ))}
        <div className="border-t-2 border-[#e4e7eb] bg-[#fafbfc] px-3 py-2 text-[11px] font-semibold text-[#1a1f29]">
          Total: {totalQty} peças · 8.3 m²
        </div>
      </div>
    </div>
  )
}

function ProductionView({ sub }: { width: number; sub: SubmenuItem | null }) {
  if (sub?.id === 'orcamento') {
    return <BudgetView />
  }
  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title={sub?.label ?? 'Produção'} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          { label: 'Orçamento', value: 'R$ 4.280', desc: 'Aguardando aprovação', icon: FileText, tone: 'orange' as const },
          { label: 'Ordens de produção', value: '0 abertas', desc: 'Nenhuma enviada', icon: Hammer, tone: 'gray' as const },
          { label: 'Compras', value: '12 itens', desc: 'Lista pronta', icon: Boxes, tone: 'gray' as const },
          { label: 'CNC', value: '6 chapas', desc: 'G-code gerado', icon: Drill, tone: 'gray' as const },
        ].map((c) => {
          const Icon = c.icon
          return (
            <div
              key={c.label}
              className={cn(
                'rounded-lg border bg-white p-3',
                c.tone === 'orange' ? 'border-[#fdba74]' : 'border-[#e4e7eb]',
              )}
            >
              <div className="flex items-start gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                    c.tone === 'orange' ? 'bg-[#fff1e8]' : 'bg-[#f3f5f8]',
                  )}
                >
                  <Icon className={cn('h-4 w-4', c.tone === 'orange' ? 'text-[#d95f18]' : 'text-[#4b5565]')} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">{c.label}</p>
                  <p className="text-[14px] font-semibold text-[#1a1f29]">{c.value}</p>
                  <p className="text-[10px] text-[#64748b]">{c.desc}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BudgetView() {
  const lines = [
    { label: 'Materiais (chapas + bordas)', value: 1820 },
    { label: 'Ferragens (dobradiças, corrediças, puxadores)', value: 640 },
    { label: 'Vidros e metais', value: 280 },
    { label: 'Mão de obra (montagem)', value: 880 },
    { label: 'Usinagem CNC', value: 420 },
    { label: 'Frete e instalação', value: 240 },
  ]
  const subtotal = lines.reduce((a, l) => a + l.value, 0)
  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Orçamento · Cozinha" hint="Família Silva" action={
        <button type="button" className="flex h-7 items-center gap-1 rounded-md bg-[#d95f18] px-2.5 text-[11px] font-semibold text-white hover:bg-[#c24c14]">
          <Download className="h-3 w-3" /> Gerar PDF
        </button>
      } />
      <div className="rounded-lg border border-[#e4e7eb] bg-white">
        {lines.map((l, i) => (
          <div
            key={l.label}
            className={cn('flex items-center justify-between px-3 py-2.5 text-[12px]', i > 0 && 'border-t border-[#eef1f4]')}
          >
            <span className="text-[#334155]">{l.label}</span>
            <span className="font-semibold tabular-nums text-[#1a1f29]">{formatCurrency(l.value)}</span>
          </div>
        ))}
        <div className="border-t-2 border-[#e4e7eb] bg-[#fafbfc] px-3 py-2.5 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#64748b]">Subtotal</span>
            <span className="font-semibold tabular-nums text-[#1a1f29]">{formatCurrency(subtotal)}</span>
          </div>
        </div>
        <div className="border-t border-[#eef1f4] px-3 py-2 text-[11px]">
          <div className="flex items-center justify-between text-[#64748b]">
            <span>Margem (20%)</span>
            <span className="tabular-nums">{formatCurrency(subtotal * 0.2)}</span>
          </div>
        </div>
        <div className="border-t-2 border-[#1a1f29] bg-[#1a1f29] px-3 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">Total ao cliente</span>
            <span className="text-[18px] font-bold tabular-nums text-white">{formatCurrency(subtotal * 1.2)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailsView() {
  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Cliente" />
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-[#e4e7eb] bg-white p-3 sm:grid-cols-2">
        <FormField label="Nome" value="Família Silva" />
        <FormField label="Telefone" value="(11) 98765-4321" />
        <FormField label="Email" value="silva@email.com" />
        <FormField label="Endereço" value="Rua das Flores, 123 — São Paulo/SP" />
      </div>
      <SectionHeader title="Projeto" />
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-[#e4e7eb] bg-white p-3 sm:grid-cols-2">
        <FormField label="Tipo de obra" value="Cozinha planejada" />
        <FormField label="Prazo de entrega" value="45 dias úteis" />
        <FormField label="Vendedor" value="Carlos Mendes" />
        <FormField label="Status" value="Em projeto" pill />
      </div>
      <SectionHeader title="Observações" />
      <textarea
        className="min-h-[80px] rounded-lg border border-[#e4e7eb] bg-white p-2.5 text-[12px] outline-none focus:border-[#d95f18]"
        defaultValue="Cliente prefere acabamento Branco TX. Atenção à viga oculta na parede sul."
      />
    </div>
  )
}

function FormField({ label, value, pill }: { label: string; value: string; pill?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">{label}</span>
      {pill ? (
        <span className="inline-flex w-fit rounded-full bg-[#dbeafe] px-2 py-0.5 text-[11px] font-semibold text-[#1d4ed8]">
          {value}
        </span>
      ) : (
        <span className="truncate text-[12px] text-[#1a1f29]">{value}</span>
      )}
    </div>
  )
}

function EnvironmentView() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-[#fdba74] bg-gradient-to-br from-[#fff7ed] to-[#fff1e8] p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#d95f18]">
            <Lightbulb className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#1a1f29]">Sugerir modulação automática</p>
            <p className="mt-0.5 text-[11px] text-[#64748b]">
              A partir das paredes do ambiente, sugerimos uma combinação de módulos que se encaixa.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md bg-[#d95f18] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#c24c14]"
          >
            Sugerir
          </button>
        </div>
      </div>
      <SectionHeader title="Elementos do ambiente" hint="extraídos do modelo SketchUp" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ambienteFeatures.map((f) => {
          const Icon = f.icon
          return (
            <div key={f.id} className="rounded-lg border border-[#e4e7eb] bg-white p-2.5">
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-[#94a3b8]" />
                <span className="text-[11px] font-semibold text-[#1a1f29]">{f.label}</span>
              </div>
              <p className="mt-1 text-[18px] font-bold tabular-nums text-[#1a1f29]">{f.count}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InternalsView() {
  const types = [
    { id: 'gav', label: 'Gaveta padrão', desc: '500 × 500 mm · MDF 15mm', icon: Boxes },
    { id: 'gav-pq', label: 'Gaveta pequena', desc: '500 × 200 mm · MDF 15mm', icon: Boxes },
    { id: 'pra-fixa', label: 'Prateleira fixa', desc: 'Apoio em cavilha', icon: Layers },
    { id: 'pra-mov', label: 'Prateleira móvel', desc: 'Suporte regulável', icon: Layers },
    { id: 'div', label: 'Divisória vertical', desc: 'Separa interior do módulo', icon: Frame },
    { id: 'cab', label: 'Cabideiro', desc: 'Tubo metálico Ø 25mm', icon: Wrench },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-[#fdba74] bg-[#fff7ed] p-2.5 text-[11px]">
        <MousePointer2 className="h-3.5 w-3.5 text-[#d95f18]" />
        <span className="text-[#9a3412]">
          <strong>1 módulo selecionado</strong> — escolha um interno para adicionar
        </span>
      </div>
      <SectionHeader title="Internos disponíveis" hint="6 tipos" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {types.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              className="flex items-center gap-3 rounded-lg border border-[#e4e7eb] bg-white p-2.5 text-left hover:border-[#d95f18] hover:shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#fff1e8]">
                <Icon className="h-4 w-4 text-[#d95f18]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[#1a1f29]">{t.label}</p>
                <p className="truncate text-[10px] text-[#64748b]">{t.desc}</p>
              </div>
              <Plus className="h-3.5 w-3.5 text-[#94a3b8]" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ───── Router que escolhe a view ───── */

function TabContentRouter({ tab, sub, width }: { tab: MainTab; sub: SubmenuItem | null; width: number }) {
  switch (tab.id) {
    case 'detalhes':
      return <DetailsView />
    case 'ambiente':
      return <EnvironmentView />
    case 'biblioteca':
      return <LibraryView width={width} sub={sub} />
    case 'internos':
      return <InternalsView />
    case 'acabamentos':
      return <FinishesView width={width} sub={sub} />
    case 'ferragens':
      return <HardwareView width={width} sub={sub} />
    case 'usinagens':
      return <MachiningView />
    case 'validacao':
      return <ValidationView />
    case 'relatorios':
      return <ReportsView width={width} sub={sub} />
    case 'producao':
      return <ProductionView width={width} sub={sub} />
    default:
      return null
  }
}

/* ───────────────── Plugin window (combina tudo) ───────────────── */

function PluginWindow(props: { width: number }) {
  const [activeTab, setActiveTab] = useState<TabId>('biblioteca')
  const [submenuByTab, setSubmenuByTab] = useState<Record<TabId, string | null>>({
    detalhes: 'cliente',
    ambiente: 'paredes',
    biblioteca: 'cozinha',
    internos: 'gavetas',
    acabamentos: 'mdf',
    ferragens: 'dobradicas',
    usinagens: 'furacao',
    validacao: 'resumo-val',
    relatorios: 'lista-pecas',
    producao: 'orcamento',
  })
  const [activeAmbiente, setActiveAmbiente] = useState('cozinha')
  const [configOpen, setConfigOpen] = useState(false)
  const [composicaoOpen, setComposicaoOpen] = useState(false)

  // Breakpoints de UI:
  //   <420  : ultra-compacto (sem submenu lateral nem chip rail; só nav + main)
  //   420-520: chip rail horizontal acima do main
  //   520-720: submenu lateral, nav só ícones, sem inspector
  //   720+   : tudo aberto, nav expandido
  const ultraCompact = props.width < 420
  const useSidebarSubmenu = props.width >= 520
  const showInspectorByDefault = props.width >= 720
  const navExpandedByDefault = props.width >= 720

  const [navExpanded, setNavExpanded] = useState(navExpandedByDefault)
  const [showInspector, setShowInspector] = useState(showInspectorByDefault)
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [sync] = useState<SyncStatus>('online')

  // Auto-defaults ao trocar breakpoint (sem desfazer toggle manual dentro do mesmo breakpoint)
  useEffect(() => {
    setNavExpanded(navExpandedByDefault)
    setShowInspector(showInspectorByDefault)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navExpandedByDefault, showInspectorByDefault])

  // Atalhos: 1..9 para tabs, Cmd+K palette, F foco, Esc fecha
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target && /input|textarea|select/i.test(target.tagName)) return
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setConflictsOpen(false)
        setConfigOpen(false)
        setComposicaoOpen(false)
        return
      }
      // E = abre Composição (se há seleção)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'e' && sketchupSelectionMock.count > 0) {
        e.preventDefault()
        setComposicaoOpen(true)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setConfigOpen(true)
        return
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = tabs.find((tt) => tt.hotkey === e.key)
        if (t) {
          setActiveTab(t.id)
          return
        }
        if (e.key.toLowerCase() === 'f') {
          setFocusMode((v) => !v)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[1]

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white">
      {!focusMode && (
        <Topbar
          width={props.width}
          sync={sync}
          ambiente={ambientesMock.find((a) => a.id === activeAmbiente) ?? ambientesMock[0]}
          onAmbienteChange={setActiveAmbiente}
          onCommandPalette={() => setPaletteOpen(true)}
          onToggleFocus={() => setFocusMode(true)}
          onOpenConfig={() => setConfigOpen(true)}
          focusMode={focusMode}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {!focusMode && (
          <NavSidebar
            active={activeTab}
            expanded={navExpanded && navExpandedByDefault}
            onPick={(id) => setActiveTab(id)}
            onToggleExpand={() => setNavExpanded((v) => !v)}
          />
        )}

        {!focusMode && useSidebarSubmenu && (
          <Submenu
            tab={currentTab}
            active={submenuByTab[activeTab]}
            onPick={(id) => setSubmenuByTab((m) => ({ ...m, [activeTab]: id }))}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {focusMode && (
            <div className="flex h-8 items-center justify-between border-b border-[#e4e7eb] bg-[#fafbfc] px-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Modo foco</span>
              <button
                type="button"
                onClick={() => setFocusMode(false)}
                className="flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-semibold text-[#d95f18] hover:bg-[#fff1e8]"
              >
                <Minimize2 className="h-3 w-3" />
                Sair
              </button>
            </div>
          )}
          <MainContent
            tab={currentTab}
            submenu={submenuByTab[activeTab]}
            width={props.width}
            onPickSubmenu={(id) => setSubmenuByTab((m) => ({ ...m, [activeTab]: id }))}
          />
        </div>

        {!focusMode && showInspector && showInspectorByDefault && (
          <Inspector
            onClose={() => setShowInspector(false)}
            selectionCount={sketchupSelectionMock.count}
            ambiente={ambientesMock.find((a) => a.id === activeAmbiente) ?? ambientesMock[0]}
            onOpenComposicao={() => setComposicaoOpen(true)}
          />
        )}

        {!focusMode && showInspectorByDefault && !showInspector && (
          <button
            type="button"
            onClick={() => setShowInspector(true)}
            title="Mostrar propriedades"
            className="flex w-7 shrink-0 items-center justify-center border-l border-[#e4e7eb] bg-[#fafbfc] text-[#94a3b8] hover:bg-[#f3f5f8] hover:text-[#1a1f29]"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <StatusBar
        sync={sync}
        conflicts={conflictsMock}
        onConflictsClick={() => setConflictsOpen((v) => !v)}
        onOrcamentoClick={() => {
          setActiveTab('producao')
          setSubmenuByTab((m) => ({ ...m, producao: 'orcamento' }))
        }}
        ambiente={ambientesMock.find((a) => a.id === activeAmbiente) ?? ambientesMock[0]}
        width={props.width}
      />

      <ConflictsDrawer
        open={conflictsOpen}
        conflicts={conflictsMock}
        onClose={() => setConflictsOpen(false)}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} />
      <ComposicaoDrawer
        open={composicaoOpen}
        onClose={() => setComposicaoOpen(false)}
        selectionCount={sketchupSelectionMock.count}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
 *  COMPOSIÇÃO — Drawer contextual de configuração de módulo
 *  Trigger: botão "Composição" no InspectorModule (1 selecionado)
 *           ou InspectorMultiple (N selecionados — modo lote)
 * ═══════════════════════════════════════════════════════════════ */

/* Mocks de variantes compatíveis por componente */
type VariantOption = {
  id: string
  name: string
  detail: string
  price?: number
  color?: string
  pattern?: 'wood' | 'glass'
  active?: boolean
}

const variantsMock = {
  caixa: [
    { id: 'cx-1', name: 'MDF Branco TX 18mm', detail: 'Duratex · BR-TX', color: '#fafafa', active: true },
    { id: 'cx-2', name: 'MDF Carvalho 18mm', detail: 'Eucatex · CV-NT', color: '#c9a36b', pattern: 'wood' as const },
    { id: 'cx-3', name: 'MDF Preto TX 18mm', detail: 'Duratex · PR-TX', color: '#1c1c1c' },
    { id: 'cx-4', name: 'MDF Branco TX 15mm', detail: 'Duratex · BR-TX (mais leve)', color: '#fafafa' },
  ],
  porta: [
    { id: 'p-1', name: 'Branco TX', detail: 'MDF 18mm · liso', color: '#fafafa', active: true },
    { id: 'p-2', name: 'Carvalho Natural', detail: 'MDF 18mm · veio horizontal', color: '#c9a36b', pattern: 'wood' as const },
    { id: 'p-3', name: 'Preto TX', detail: 'MDF 18mm · liso', color: '#1c1c1c' },
    { id: 'p-4', name: 'Vidro temperado fumê', detail: 'Esquadria alumínio', color: '#3f4854', pattern: 'glass' as const, price: 180 },
    { id: 'p-5', name: 'Branco lacca brilho', detail: 'Pintado · 18mm', color: '#ffffff', price: 120 },
    { id: 'p-6', name: 'Painel ripado', detail: 'Carvalho · ripa 4mm', color: '#a47c4b', pattern: 'wood' as const, price: 220 },
    { id: 'p-7', name: 'Sem porta', detail: 'Módulo aberto · livre', color: '#fafbfc' },
  ],
  dobradica: [
    { id: 'd-1', name: 'Clip Top Blumotion', detail: 'Blum · soft-close 110°', price: 18.5, active: true },
    { id: 'd-2', name: 'Soft Close', detail: 'Hettich · SH-95 · 95°', price: 12.8 },
    { id: 'd-3', name: 'Caneco 35mm', detail: 'FGV · sem amortecimento', price: 4.9 },
    { id: 'd-4', name: 'Push to Open', detail: 'Blum · sem puxador', price: 24.0 },
  ],
  puxador: [
    { id: 'pu-1', name: 'Cava Black', detail: 'Esquadrias · 128mm · alumínio', price: 14.5, active: true },
    { id: 'pu-2', name: 'Alça embutida', detail: 'Linear · 320mm', price: 22.0 },
    { id: 'pu-3', name: 'Botão metálico', detail: 'Inox escovado · Ø 25mm', price: 8.0 },
    { id: 'pu-4', name: 'Perfil J', detail: 'Sem puxador aparente', price: 32.0 },
    { id: 'pu-5', name: 'Sem puxador', detail: 'Push to Open obrigatório', price: 0 },
  ],
  prateleira: [
    { id: 'pr-1', name: 'Fixa MDF 15mm', detail: 'Apoio em cavilha', active: true },
    { id: 'pr-2', name: 'Móvel MDF 15mm', detail: 'Suporte regulável Ø5mm' },
    { id: 'pr-3', name: 'Vidro temperado 8mm', detail: 'Suporte cromado', price: 65 },
    { id: 'pr-4', name: 'Sem prateleira', detail: 'Espaço livre' },
  ],
} as const

/* Composição do módulo selecionado (mock baseado no Módulo inferior 2 portas) */
type ComposicaoItem = {
  id: string
  category: 'estrutura' | 'frente' | 'ferragem' | 'interno'
  label: string
  qty: number
  current: VariantOption
  variants: ReadonlyArray<VariantOption>
}

const composicaoModuloMock: ComposicaoItem[] = [
  { id: 'cmp-cx', category: 'estrutura', label: 'Caixa do módulo', qty: 1, current: variantsMock.caixa[0], variants: variantsMock.caixa },
  { id: 'cmp-p1', category: 'frente', label: 'Porta esquerda', qty: 1, current: variantsMock.porta[0], variants: variantsMock.porta },
  { id: 'cmp-p2', category: 'frente', label: 'Porta direita', qty: 1, current: variantsMock.porta[0], variants: variantsMock.porta },
  { id: 'cmp-d1', category: 'ferragem', label: 'Dobradiças', qty: 4, current: variantsMock.dobradica[0], variants: variantsMock.dobradica },
  { id: 'cmp-pu', category: 'ferragem', label: 'Puxadores', qty: 2, current: variantsMock.puxador[0], variants: variantsMock.puxador },
  { id: 'cmp-pr', category: 'interno', label: 'Prateleira interna', qty: 1, current: variantsMock.prateleira[0], variants: variantsMock.prateleira },
]

function ComposicaoDrawer(props: { open: boolean; onClose: () => void; selectionCount: number }) {
  const [picker, setPicker] = useState<string | null>(null) // id do item com picker aberto
  const [appliedTo, setAppliedTo] = useState<Record<string, string>>({}) // id_item -> id_variant
  const [showSaveAs, setShowSaveAs] = useState(false)

  if (!props.open) return null

  const hasChanges = Object.keys(appliedTo).length > 0
  const isLote = props.selectionCount > 1

  function pickVariant(itemId: string, variantId: string) {
    setAppliedTo((m) => ({ ...m, [itemId]: variantId }))
    setPicker(null)
  }

  // Calcular custo atualizado simples
  function getCurrentVariantOf(item: ComposicaoItem) {
    const overrideId = appliedTo[item.id]
    if (overrideId) return item.variants.find((v) => v.id === overrideId) ?? item.current
    return item.current
  }

  return (
    <div className="fixed inset-0 z-50 flex" onClick={props.onClose}>
      <div className="flex-1 bg-black/40" />
      <div
        className="flex h-full w-[520px] max-w-full flex-col border-l border-[#e4e7eb] bg-white shadow-[0_-2px_24px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#e4e7eb] bg-gradient-to-r from-[#fff7ed] to-white px-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#d95f18]">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#a24510]">
              Composição
              {isLote && <span className="ml-1.5 rounded bg-[#d95f18] px-1 text-[9px] font-semibold text-white">LOTE · {props.selectionCount}</span>}
            </p>
            <p className="truncate text-[13px] font-semibold text-[#1a1f29]">
              {isLote ? `${props.selectionCount} módulos selecionados` : 'Módulo inferior 2 portas'}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-[#94a3b8] hover:bg-white hover:text-[#1a1f29]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {isLote && (
            <div className="mb-3 rounded-lg border border-[#fdba74] bg-[#fff7ed] p-2.5 text-[11px] text-[#9a3412]">
              <strong>Modo lote:</strong> alterações serão aplicadas aos {props.selectionCount} módulos selecionados.
              Componentes incompatíveis serão ignorados.
            </div>
          )}

          {/* Preview */}
          {!isLote && (
            <div className="mb-3 flex gap-3 rounded-lg border border-[#e4e7eb] bg-[#fafbfc] p-3">
              <div className="h-20 w-28 shrink-0">
                <ModulePreviewSwatch preview="base" />
              </div>
              <div className="flex flex-col justify-center text-[11px]">
                <p className="font-semibold text-[#1a1f29]">800 × 720 × 560 mm</p>
                <p className="text-[#64748b]">M-002 · Cozinha · base inferior</p>
                <p className="mt-1 text-[10px] text-[#94a3b8]">{composicaoModuloMock.length} componentes editáveis</p>
              </div>
            </div>
          )}

          {/* Sections */}
          <ComposicaoSection title="Estrutura" items={composicaoModuloMock.filter((i) => i.category === 'estrutura')}
            getCurrent={getCurrentVariantOf} pickerOpen={picker} onTogglePicker={setPicker} onPick={pickVariant} />
          <ComposicaoSection title="Frentes" items={composicaoModuloMock.filter((i) => i.category === 'frente')}
            getCurrent={getCurrentVariantOf} pickerOpen={picker} onTogglePicker={setPicker} onPick={pickVariant}
            extraAction="Trocar todas em massa" />
          <ComposicaoSection title="Ferragens" items={composicaoModuloMock.filter((i) => i.category === 'ferragem')}
            getCurrent={getCurrentVariantOf} pickerOpen={picker} onTogglePicker={setPicker} onPick={pickVariant} />
          <ComposicaoSection title="Internos" items={composicaoModuloMock.filter((i) => i.category === 'interno')}
            getCurrent={getCurrentVariantOf} pickerOpen={picker} onTogglePicker={setPicker} onPick={pickVariant}
            extraAction="+ Adicionar interno" />

          {/* Custo */}
          <div className="mt-3 rounded-lg border-2 border-[#1a1f29] bg-[#1a1f29] p-3 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[#94a3b8]">
                  {hasChanges ? 'Custo após mudanças' : 'Custo estimado'}
                </p>
                <p className="text-[16px] font-bold tabular-nums">
                  {hasChanges ? formatCurrency(312 + Object.keys(appliedTo).length * 18) : 'R$ 312,40'}
                </p>
              </div>
              {hasChanges && (
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-wider text-[#fbbf24]">Variação</p>
                  <p className="text-[12px] font-semibold text-[#fbbf24]">
                    +{formatCurrency(Object.keys(appliedTo).length * 18)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[#e4e7eb] bg-[#fafbfc] px-3 py-2.5">
          <button
            type="button"
            onClick={props.onClose}
            className="h-8 rounded-md border border-[#e4e7eb] bg-white px-3 text-[12px] font-medium text-[#4b5565] hover:bg-[#f7f9fc]"
          >
            Cancelar
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSaveAs(true)}
              disabled={!hasChanges}
              className={cn(
                'h-8 rounded-md border px-3 text-[12px] font-medium',
                hasChanges
                  ? 'border-[#e4e7eb] bg-white text-[#4b5565] hover:bg-[#f7f9fc]'
                  : 'cursor-not-allowed border-[#e4e7eb] bg-[#fafbfc] text-[#cbd5e1]',
              )}
            >
              Salvar como variação
            </button>
            <button
              type="button"
              disabled={!hasChanges}
              className={cn(
                'flex h-8 items-center gap-1 rounded-md px-3 text-[12px] font-semibold',
                hasChanges
                  ? 'bg-[#d95f18] text-white hover:bg-[#c24c14]'
                  : 'cursor-not-allowed bg-[#fafbfc] text-[#cbd5e1]',
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isLote ? `Aplicar nos ${props.selectionCount}` : 'Aplicar mudanças'}
            </button>
          </div>
        </div>

        {/* Sub-modal: salvar como variação */}
        {showSaveAs && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSaveAs(false)}>
            <div className="w-full max-w-[400px] rounded-xl border border-[#e4e7eb] bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)]" onClick={(e) => e.stopPropagation()}>
              <p className="text-[13px] font-semibold text-[#1a1f29]">Salvar como variação na biblioteca</p>
              <p className="mt-1 text-[11px] text-[#64748b]">A variação fica disponível em Biblioteca › Favoritos para reutilizar.</p>
              <input
                autoFocus
                placeholder="Ex: Inferior 2 portas · Carvalho · Soft Close"
                className="mt-3 h-9 w-full rounded-md border border-[#e4e7eb] bg-white px-2.5 text-[12px] outline-none focus:border-[#d95f18]"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setShowSaveAs(false)} className="h-7 rounded-md border border-[#e4e7eb] px-2.5 text-[11px] font-medium text-[#4b5565] hover:bg-[#f7f9fc]">
                  Cancelar
                </button>
                <button className="h-7 rounded-md bg-[#1a1f29] px-2.5 text-[11px] font-semibold text-white hover:bg-[#0f1219]">
                  Salvar variação
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ComposicaoSection(props: {
  title: string
  items: ComposicaoItem[]
  getCurrent: (item: ComposicaoItem) => VariantOption
  pickerOpen: string | null
  onTogglePicker: (id: string | null) => void
  onPick: (itemId: string, variantId: string) => void
  extraAction?: string
}) {
  if (props.items.length === 0) return null
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94a3b8]">
          {props.title} <span className="ml-1 text-[#cbd5e1]">· {props.items.length}</span>
        </span>
        {props.extraAction && (
          <button className="text-[10px] font-semibold text-[#d95f18] hover:underline">{props.extraAction}</button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-[#e4e7eb] bg-white">
        {props.items.map((item, i) => {
          const current = props.getCurrent(item)
          const isOpen = props.pickerOpen === item.id
          const wasChanged = current.id !== item.current.id
          return (
            <div key={item.id} className={cn(i > 0 && 'border-t border-[#eef1f4]')}>
              <div className="flex items-center gap-2.5 px-3 py-2">
                <ComposicaoSwatch variant={current} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[12px] font-semibold text-[#1a1f29]">
                      {item.qty > 1 && <span className="mr-1 tabular-nums text-[#64748b]">{item.qty}×</span>}
                      {item.label}
                    </p>
                    {wasChanged && (
                      <span className="rounded bg-[#fff1e8] px-1 text-[9px] font-semibold uppercase text-[#a24510]">alterado</span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-[#64748b]">
                    {current.name} · <span className="text-[#94a3b8]">{current.detail}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => props.onTogglePicker(isOpen ? null : item.id)}
                  className={cn(
                    'flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition-colors',
                    isOpen
                      ? 'border-[#d95f18] bg-[#fff1e8] text-[#a24510]'
                      : 'border-[#e4e7eb] bg-white text-[#4b5565] hover:bg-[#f7f9fc]',
                  )}
                >
                  trocar
                  <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-[#eef1f4] bg-[#fafbfc] p-2">
                  <div className="grid grid-cols-1 gap-1">
                    {item.variants.map((v) => {
                      const isCurrent = v.id === current.id
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => props.onPick(item.id, v.id)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-md border px-2 py-1.5 text-left transition-colors',
                            isCurrent
                              ? 'border-[#d95f18] bg-[#fff1e8]'
                              : 'border-transparent bg-white hover:border-[#e4e7eb]',
                          )}
                        >
                          <ComposicaoSwatch variant={v} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold text-[#1a1f29]">{v.name}</p>
                            <p className="truncate text-[9px] text-[#94a3b8]">{v.detail}</p>
                          </div>
                          {typeof v.price === 'number' && (
                            <span className="text-[10px] tabular-nums text-[#94a3b8]">
                              {v.price > 0 ? `+${formatCurrency(v.price)}` : 'incluso'}
                            </span>
                          )}
                          {isCurrent && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#d95f18]" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ComposicaoSwatch({ variant }: { variant: VariantOption }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#e4e7eb]"
      style={{
        background: variant.color ?? '#f3f5f8',
        backgroundImage:
          variant.pattern === 'wood'
            ? 'repeating-linear-gradient(110deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 9px)'
            : variant.pattern === 'glass'
              ? 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(0,0,0,0.1) 100%)'
              : undefined,
      }}
    >
      {variant.color === undefined && <Wrench className="h-3.5 w-3.5 text-[#94a3b8]" />}
    </div>
  )
}

/* ─────────── Drawer Configurações Globais ─────────── */
function ConfigDrawer(props: { open: boolean; onClose: () => void }) {
  if (!props.open) return null
  const sections: Array<{ id: string; label: string; desc: string; icon: IconComponent }> = [
    { id: 'ferragens', label: 'Padrões de ferragens', desc: 'Dobradiças, corrediças, puxadores e pés padrão', icon: Wrench },
    { id: 'tolerancias', label: 'Tolerâncias e folgas', desc: 'Folgas entre peças, expansão de material', icon: Layers },
    { id: 'chapa', label: 'Chapas e materiais', desc: 'Espessuras e fornecedores padrão', icon: Sparkles },
    { id: 'cnc', label: 'Calibração CNC', desc: 'Máquina, fresa, velocidades, formato G-code', icon: IconSpindleCNC },
    { id: 'etiquetas', label: 'Etiquetas', desc: 'Layout, código de barras, QR e numeração', icon: FileText },
    { id: 'orcamento', label: 'Orçamento', desc: 'Margens, mão de obra, formato de proposta', icon: FileBarChart },
    { id: 'integracoes', label: 'Integrações', desc: 'ERP Ornato, marketplace de peças, nuvem', icon: Cloud },
    { id: 'conta', label: 'Conta e licença', desc: 'Plano, equipe, faturamento', icon: Settings },
  ]
  return (
    <div className="fixed inset-0 z-50 flex" onClick={props.onClose}>
      <div className="flex-1 bg-black/30" />
      <div
        className="flex h-full w-[440px] max-w-full flex-col border-l border-[#e4e7eb] bg-white shadow-[0_-2px_24px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[#e4e7eb] px-3">
          <Settings className="h-4 w-4 text-[#d95f18]" />
          <span className="text-[13px] font-semibold text-[#1a1f29]">Configurações globais</span>
          <span className="text-[10px] text-[#94a3b8]">aplicadas a todos os projetos</span>
          <button
            type="button"
            onClick={props.onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-[#94a3b8] hover:bg-[#f3f5f8] hover:text-[#1a1f29]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sections.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                className="flex w-full items-start gap-3 border-b border-[#eef1f4] px-3 py-3 text-left transition-colors hover:bg-[#fafbfc]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f3f5f8]">
                  <Icon className="h-4 w-4 text-[#4b5565]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#1a1f29]">{s.label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#64748b]">{s.desc}</p>
                </div>
                <ChevronRight className="mt-2 h-3.5 w-3.5 shrink-0 text-[#cbd5e1]" />
              </button>
            )
          })}
        </div>
        <div className="flex h-9 shrink-0 items-center justify-between border-t border-[#e4e7eb] bg-[#fafbfc] px-3 text-[10px] uppercase tracking-wider text-[#94a3b8]">
          <span>Versão 0.4.0 — Plugin Ornato</span>
          <span>SketchUp 2017+ · Win/Mac</span>
        </div>
      </div>
    </div>
  )
}

/* ───────────────── Page (com simulador) ───────────────── */

export default function HefestoPluginPage() {
  const [w, setW] = useState(420)
  const [h, setH] = useState(760)
  const [fs, setFs] = useState(false)

  const effectiveWidth = fs ? Math.max(720, w) : w

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-[#eef2f6] p-3 text-[#1a1f29]">
      <DevSizePanel width={w} height={h} fullscreen={fs} onWidth={setW} onHeight={setH} onFullscreen={setFs} />

      <div className={cn('flex flex-1 min-h-0', fs ? 'items-stretch justify-stretch' : 'items-start justify-center')}>
        <div
          key={`${w}-${h}-${fs ? 'fs' : 'win'}`}
          className="overflow-hidden rounded-lg border border-[#d8dde4] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.18)]"
          style={
            fs
              ? { width: '100%', minHeight: 'calc(100vh - 140px)' }
              : {
                  width: `${w}px`,
                  height: `${h}px`,
                  minWidth: `${w}px`,
                  maxWidth: `${w}px`,
                }
          }
        >
          <div className="flex h-6 items-center gap-1.5 border-b border-[#e4e7eb] bg-[#f3f5f8] px-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6058]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#fec02e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27c83f]" />
            <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-[#94a3b8]">
              Ornato · Plugin SketchUp
            </span>
          </div>

          <div className="h-[calc(100%-24px)]">
            <PluginWindow width={effectiveWidth} />
          </div>
        </div>
      </div>
    </main>
  )
}
