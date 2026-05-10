/**
 * Registry das 10 tabs do plugin Ornato v2.
 * Cada tab pode opcionalmente importar um módulo com `render(container, ctx)`.
 * Por enquanto Fase 1.1: todas vazias (placeholder via empty-tab no main.js).
 *
 * Ordem na sidebar = jornada do projetista.
 */

import * as projeto     from './projeto.js'
import * as ambiente    from './ambiente.js'
import * as biblioteca  from './biblioteca.js'
import * as internos    from './internos.js'
import * as acabamentos from './acabamentos.js'
import * as ferragens   from './ferragens.js'
import * as usinagens   from './usinagens.js'
import * as validacao   from './validacao.js'
import * as producao    from './producao.js'

export const tabs = [
  {
    id: 'projeto',
    label: 'Projeto',
    icon: 'detalhes',
    hotkey: '1',
    module: projeto,
    submenu: [
      { id: 'cliente',     label: 'Cliente' },
      { id: 'ambiente',    label: 'Identificação do ambiente' },
      { id: 'medidas',     label: 'Medidas e tolerâncias' },
      { id: 'observacoes', label: 'Observações' },
      { id: 'anexos',      label: 'Anexos', count: 3 },
    ],
  },
  {
    id: 'ambiente',
    label: 'Ambiente',
    icon: 'ambiente',
    hotkey: '2',
    module: ambiente,
    submenu: [
      { id: 'paredes',         label: 'Paredes' },
      { id: 'piso',            label: 'Piso' },
      { id: 'teto',            label: 'Teto' },
      { id: 'janelas',         label: 'Janelas' },
      { id: 'portas-amb',      label: 'Portas do ambiente' },
      { id: 'tomadas',         label: 'Tomadas e pontos' },
      { id: 'vigas',           label: 'Vigas e obstáculos' },
      { id: 'iluminacao-fixa', label: 'Iluminação fixa' },
      { id: 'sugerir',         label: 'Sugerir modulação', badge: 'new' },
    ],
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    icon: 'biblioteca',
    hotkey: '3',
    module: biblioteca,
    submenu: [
      { id: 'ambientes',  label: 'Ambientes',  count: 12 },
      { id: 'cozinha',    label: 'Cozinha',    count: 31 },
      { id: 'dormitorio', label: 'Dormitório', count: 24 },
      { id: 'banheiro',   label: 'Banheiro',   count: 14 },
      { id: 'escritorio', label: 'Escritório', count: 9 },
      { id: 'avulsos',    label: 'Avulsos',    count: 18 },
      { id: 'parceiros',  label: 'Parceiros',  count: 7 },
      { id: 'favoritos',  label: 'Favoritos',  count: 5 },
      { id: 'recentes',   label: 'Recentes',   count: 8 },
    ],
  },
  {
    id: 'internos',
    label: 'Internos',
    icon: 'internos',
    hotkey: '4',
    module: internos,
    submenu: [
      { id: 'gavetas',         label: 'Gavetas' },
      { id: 'prateleiras',     label: 'Prateleiras' },
      { id: 'portas-mob',      label: 'Portas' },
      { id: 'divisorias',      label: 'Divisórias' },
      { id: 'cestos',          label: 'Cestos aramados' },
      { id: 'cabideiros',      label: 'Cabideiros' },
      { id: 'acessorios-int',  label: 'Acessórios internos' },
    ],
  },
  {
    id: 'acabamentos',
    label: 'Acabamentos',
    icon: 'acabamentos',
    hotkey: '5',
    module: acabamentos,
    submenu: [
      { id: 'mdf',          label: 'MDF' },
      { id: 'laminados',    label: 'Laminados' },
      { id: 'vidros',       label: 'Vidros' },
      { id: 'metais',       label: 'Metais' },
      { id: 'fitas',        label: 'Fitas de borda' },
      { id: 'texturas',     label: 'Texturas' },
      { id: 'favoritos',    label: 'Favoritos' },
      { id: 'aplicar-sel',  label: 'Aplicar em selecionados', badge: 'new' },
      { id: 'subst-massa',  label: 'Substituir em massa' },
    ],
  },
  {
    id: 'ferragens',
    label: 'Ferragens',
    icon: 'ferragens',
    hotkey: '6',
    module: ferragens,
    submenu: [
      { id: 'dobradicas',   label: 'Dobradiças' },
      { id: 'corredicas',   label: 'Corrediças' },
      { id: 'puxadores',    label: 'Puxadores' },
      { id: 'pes',          label: 'Pés e niveladores' },
      { id: 'dispositivos', label: 'Dispositivos' },
      { id: 'iluminacao',   label: 'Iluminação' },
      { id: 'acessorios',   label: 'Acessórios' },
    ],
  },
  {
    id: 'usinagens',
    label: 'Usinagens',
    icon: 'usinagens',
    hotkey: '7',
    module: usinagens,
    submenu: [
      { id: 'furacao',   label: 'Furação' },
      { id: 'rebaixos',  label: 'Rebaixos' },
      { id: 'encaixes',  label: 'Encaixes' },
      { id: 'cavilhas',  label: 'Cavilhas' },
      { id: 'rasgos',    label: 'Rasgos e canais' },
      { id: 'cnc-ops',   label: 'Operações CNC' },
      { id: 'padroes',   label: 'Padrões salvos', count: 6 },
    ],
  },
  {
    id: 'validacao',
    label: 'Validação',
    icon: 'validacao',
    hotkey: '8',
    module: validacao,
    submenu: [
      { id: 'resumo',       label: 'Resumo de checagem' },
      { id: 'conflitos',    label: 'Conflitos', count: 2 },
      { id: 'tolerancias',  label: 'Tolerâncias' },
      { id: 'folgas',       label: 'Folgas' },
      { id: 'viabilidade',  label: 'Viabilidade de produção' },
      { id: 'sugestoes',    label: 'Sugestões automáticas' },
    ],
  },
  {
    id: 'producao',
    label: 'Produção',
    icon: 'producao',
    hotkey: '0',
    module: producao,
    submenu: [
      { id: 'envio',        label: 'Enviar ao ERP' },
      { id: 'orcamento',    label: 'Orçamento' },
      { id: 'status',       label: 'Status (vindo do ERP)' },
      { id: 'historico',    label: 'Histórico de envios' },
    ],
  },
]

/* ─── Ação primária contextual por tab ─── */

export const primaryActionByTab = {
  projeto:     { label: 'Salvar dados',         icon: 'check-circle', tone: 'dark'    },
  ambiente:    { label: 'Sugerir modulação',    icon: 'lightbulb',    tone: 'primary' },
  biblioteca:  { label: 'Inserir',              icon: 'plus',         tone: 'primary' },
  internos:    { label: 'Adicionar',            icon: 'plus',         tone: 'primary' },
  acabamentos: { label: 'Aplicar',              icon: 'paintbrush',   tone: 'primary' },
  ferragens:   { label: 'Atribuir',             icon: 'plus',         tone: 'dark'    },
  usinagens:   { label: 'Configurar',           icon: 'settings',     tone: 'dark'    },
  validacao:   { label: 'Validar projeto',      icon: 'validacao',    tone: 'primary' },
  producao:    { label: 'Enviar p/ produção',   icon: 'send',         tone: 'primary' },
}

export function getTab(id) {
  return tabs.find(t => t.id === id) ?? tabs[0]
}
