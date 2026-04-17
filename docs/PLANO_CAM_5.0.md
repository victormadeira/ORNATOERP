# 🏭 ORNATO CAM 5.0 — PLANO EXECUTIVO INDUSTRIAL

> Plano baseado na análise profunda de **10.183+ linhas** de código CNC existente.
> Data: 29/03/2026

---

## 📊 INVENTÁRIO DO SISTEMA ATUAL

Antes de planejar mudanças, é fundamental reconhecer a **profundidade** do que já existe:

| Componente | Arquivo | Linhas | Status |
|---|---|---|---|
| Produção CNC (UI principal) | `src/pages/ProducaoCNC.jsx` | **6.278** | ⚠️ Monolítico — precisa decomposição |
| Nesting Engine (algoritmos) | `server/lib/nesting-engine.js` | 1.557 | ✅ Robusto — MaxRects, Skyline, Guillotine, BRKGA, R&R |
| Backend CNC (rotas) | `server/routes/cnc.js` | 3.784 | ✅ Completo — otimizador, ajustes manuais, Python bridge |
| Viewer 3D de peças | `src/components/PecaViewer3D.jsx` | 678 | ✅ Maduro — textura MDF, furos, rasgos, fita de borda |
| Simulador G-code 3D | `src/components/GcodeSim3D.jsx` | 1.140 | ✅ Avançado — spindle animado, grooves em canvas |
| Editor de Etiquetas | `src/components/EditorEtiquetas.jsx` | 1.508 | ✅ Funcional — drag-drop SVG, variáveis, QR, barcode |
| Editor de Peças | `src/components/PecaEditor.jsx` | 583 | ✅ Funcional |

### Funcionalidades Já Implementadas

- ✅ 8 tabs de workflow: Importar → Peças → Plano → Materiais → Usinagens → Etiquetas → G-code → Config
- ✅ Import JSON (plugin SketchUp) e DXF (Promob/AutoCAD)
- ✅ Multi-projeto (merge de lotes) com cores por projeto
- ✅ Classificação de peças (normal/pequena/super_pequena) com limiares configuráveis
- ✅ Ajustes manuais: mover, rotacionar, transferir entre chapas, lock/unlock, compactar
- ✅ Optimistic UI updates com undo/redo e sync em background
- ✅ Zoom + Pan com scroll/middle-click no SVG detalhado
- ✅ Geração de G-code por chapa com preview
- ✅ Simulador 2D (`GcodeSimCanvas`) com animação, cores por operação, legenda
- ✅ Simulador 3D (`GcodeSim3D`) com spindle modelado, grooves em canvas texture
- ✅ Editor visual de etiquetas com templates (padrão/compacta/completa)
- ✅ Diagrama de bordas, minimapa da chapa, QR/barcode nas etiquetas
- ✅ Configuração completa de máquinas CNC (velocidades, lead-in, ramping, ordenação)
- ✅ Tipos de usinagem com mapeamento de categorias e prioridades
- ✅ Gerenciamento de retalhos
- ✅ Re-otimização por chapa individual
- ✅ Bandeja de transferência de peças entre chapas com verificação de material

---

## 🔴 PONTOS CRÍTICOS DE MELHORIA

---

### 1. ARQUITETURA — Decomposição do Monolito de 6.278 Linhas

**Problema:**
O arquivo `ProducaoCNC.jsx` contém **6.278 linhas** em um único arquivo, incluindo:
- 8 tabs completas com toda a lógica
- ~25 sub-componentes definidos inline (TabImportar, TabPecas, TabPlano, ChapaViz, etc.)
- ~40+ estados (useState) no escopo de diversos componentes
- Modais de configuração de máquinas (~300 linhas cada)
- Simulador G-code Canvas (~400 linhas)
- Lógica de impressão PDF (~150 linhas)

**Impacto:**
- Cada edição qualquer causa re-render desnecessário
- Hot Module Reload lento no dev
- Impossível reutilizar componentes em outras telas
- Debugging extremamente difícil
- Onboarding de novos devs impossível

**Solução — Decomposição em 15 arquivos focados:**

```
src/components/cnc/
├── CncWorkspace.jsx        ← Container cockpit principal (layout split-pane)
├── CncToolbar.jsx          ← Barra de ações (undo/redo, zoom, otimizar, print)
├── CncSidebar.jsx          ← Thumbnails das chapas + transfer tray + legenda + custo
├── CncConfigPanel.jsx      ← Configuração do otimizador (accordion na sidebar)
├── CncStatusBar.jsx        ← Barra inferior (ocupação, warnings, pending changes)
├── ChapaViewport.jsx       ← SVG 2D detalhado (extraído do ChapaViz atual)
├── ChapaPlan3D.jsx         ← Viewport WebGL 3D da chapa completa (NOVO)
├── GcodePreviewModal.jsx   ← Modal de preview do G-code gerado
├── GcodeSimCanvas.jsx      ← Simulador 2D animado com cores por operação
├── TabImportar.jsx         ← Tab de importação JSON/DXF
├── TabPecas.jsx            ← Tab de listagem de peças com filtros e 3D panel
├── TabGcode.jsx            ← Tab G-code batch
├── TabEtiquetas.jsx        ← Tab de geração de etiquetas
├── TabConfig.jsx           ← Tab de configurações (máquinas, usinagens, retalhos)
├── MachineModal.jsx        ← Modal config de máquinas CNC
└── UsinagemTipoModal.jsx   ← Modal tipos de usinagem
```

**Meta:** `ProducaoCNC.jsx` passa de **6.278 → ~250 linhas** (apenas imports + tab routing).

**Mapeamento de extração (de onde vem cada componente):**

| Novo Arquivo | Linhas Origem no ProducaoCNC.jsx | Linhas Estimadas |
|---|---|---|
| `TabImportar.jsx` | L136-476 | ~340 |
| `TabPecas.jsx` | L492-840 | ~350 |
| `TabPlano.jsx` → decomposta em Workspace | L999-2097 | ~1.100 |
| `CncToolbar.jsx` | L1584-1644 | ~100 |
| `CncSidebar.jsx` | L1728-1877 | ~200 |
| `ChapaViewport.jsx` | ChapaViz component inteiro | ~600 |
| `CncConfigPanel.jsx` | L1504-1582 | ~120 |
| `GcodePreviewModal.jsx` | L2100-2600 | ~500 |
| `GcodeSimCanvas.jsx` | L2160-2600 | ~400 |
| `MachineModal.jsx` | L5700-5990 | ~300 |
| `UsinagemTipoModal.jsx` | L6135-6219 | ~100 |
| `TabConfig.jsx` | L4600-5700 | ~1.100 |

---

### 2. UX — Layout Cockpit Industrial Split-Pane

**Problema atual:**
A tab "Plano de Corte" funciona como uma página web scroll-based. O painel de configuração, summary cards, botões de ação, thumbnails e viewport ficam todos empilhados verticalmente. O operador perde contexto ao scrollar para baixo.

O layout atual é assim:
```
┌────────────────────────────────────────┐
│ Config panel (colapsável)              │  ← scroll up
│ Botão "Otimizar" + actions             │
│ Summary cards (chapas, aproveit.)      │
│ Classification warning                 │
│ Legend                                 │
├──────────┬─────────────────────────────┤
│ Thumbs   │ ChapaViz (SVG detail)      │  ← finalmente visível
│ 220px    │                             │
│          │                             │
│ Transfer │                             │
│ Cost     │                             │
└──────────┴─────────────────────────────┘
│ Next step button                       │
└────────────────────────────────────────┘
```

**Solução — Split-Pane Fixo (zero scroll de página):**

```
┌──────────────────────────────────────────────────────────┐
│  ToolBar: [⚡Otimizar] [↶] [↷] [Compact] [+Ch]         │
│           [🖨PDF] [2D|3D|Sim] 🔍125% [Fit] [⚙Config]   │
├───────────┬──────────────────────────────────────────────┤
│           │                                              │
│  SIDEBAR  │  VIEWPORT PRINCIPAL                          │
│  280px    │  height: calc(100vh - 100px)                 │
│  fixed    │                                              │
│           │  ┌─────────────────────────────────────────┐ │
│ ╔═══════╗ │  │                                         │ │
│ ║ Ch.1  ║ │  │  SVG 2D (padrão)                        │ │
│ ║ 87.3% ║ │  │    — ou —                               │ │
│ ║ 12 pç ║ │  │  WebGL 3D (toggle)                      │ │
│ ╚═══════╝ │  │    — ou —                               │ │
│ ┌───────┐ │  │  G-code Simulator (animação)             │ │
│ │ Ch.2  │ │  │                                         │ │
│ │ 91.2% │ │  │  • Zoom infinito (Ctrl+Scroll)          │ │
│ │ 8 pç  │ │  │  • Pan (Middle-click ou Alt+Drag)       │ │
│ └───────┘ │  │  • Right-click → Context menu            │ │
│           │  │  • Multi-select (Shift+Click)            │ │
│ ─ ─ ─ ─  │  │  • Drag para mover peças                │ │
│ Transfer  │  │                                         │ │
│ ┌───────┐ │  └─────────────────────────────────────────┘ │
│ │ 2 pç  │ │                                              │
│ └───────┘ │                                              │
│           │                                              │
│ Legend    │                                              │
│ ■ Mod A  │                                              │
│ ■ Mod B  │                                              │
│           │                                              │
│ Custo    │                                              │
│ R$ 420   │                                              │
├───────────┴──────────────────────────────────────────────┤
│ StatusBar: 5 chapas · 87.3% avg · ⚠2 peças risco alto  │
└──────────────────────────────────────────────────────────┘
```

**Implementação CSS:**
```css
.cnc-cockpit {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 52px); /* desconta header do ERP */
  overflow: hidden;
}
.cnc-cockpit-toolbar {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
}
.cnc-cockpit-body {
  display: flex;
  flex: 1;
  min-height: 0; /* crucial para flex shrink */
  overflow: hidden;
}
.cnc-cockpit-sidebar {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  padding: 12px;
}
.cnc-cockpit-viewport {
  flex: 1;
  overflow: hidden;
  position: relative;
}
.cnc-cockpit-statusbar {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  border-top: 1px solid var(--border);
  font-size: 11px;
}
```

**O que muda para o operador:**
- Tudo visível ao mesmo tempo, sem scrollar NUNCA
- Clicar na thumbnail esquerda → viewport muda instantaneamente
- Config do otimizador acessível via accordion na sidebar OU via botão ⚙ na toolbar
- Sensação de software CAD profissional (como Fusion 360, RhinoNest)
- Sidebar sempre acessível durante edição

---

### 3. VIEWPORT 3D DA CHAPA COMPLETA (Novo Componente)

**Problema atual:**
O 3D existe apenas para:
- Peças individuais (`PecaViewer3D` — click na tabela de peças)
- Simulação de G-code (`GcodeSim3D` — mostra chapa com toolpath animado)

NÃO existe visão 3D do **plano de corte** inteiro mostrando as peças posicionadas na chapa como objetos 3D sólidos.

**Solução — `ChapaPlan3D.jsx` (novo componente):**

Reutilizar a infraestrutura já existente no `GcodeSim3D.jsx` (que já cria chapa 3D + peças extrudadas nas linhas L346-476) mas SEM a simulação de G-code — apenas a visualização estática.

**Funcionalidades:**

| Feature | Detalhe |
|---|---|
| Chapa base | Plano com textura de MDF procedural (reutilizar `makeWoodCanvas` do `PecaViewer3D`) |
| Peças extrudadas | Cada peça como BoxGeometry com espessura real (ex: 18mm) |
| Cores por modo | Módulo / Projeto / Classificação (mesmo sistema do SVG 2D) |
| Click na peça | Camera orbit-focus + info panel lateral |
| Retalhos | Planos transparentes verdes com linhas tracejadas |
| Background | Branco/ice (`#f0f2f5`) — "Studio Light" — melhor percepção de profundidade |
| Fita de borda | Strips coloridos nas laterais das peças (como `PecaViewer3D` já faz) |
| Highlight | Outline emissive na peça selecionada |
| OrbitControls | Rotação, zoom com damping e limites |
| Fallback | Se WebGL não disponível, mostra SVG 2D automaticamente |

**Implementação técnica:**
```jsx
// Reutilizar renderer singleton do PecaViewer3D (L11-38)
import { getRenderer } from '../PecaViewer3D';

// Construir cena similar ao GcodeSim3D L346-476
// Sem spindle, sem animação — apenas peças estáticas + interação
function ChapaPlan3D({ chapa, pecasMap, getModColor, onSelectPiece }) {
  // 1. Criar sheet mesh (plano com textura)
  // 2. Para cada peça: BoxGeometry(p.w, espessura, p.h) posicionada em (p.x, 0, p.y)
  // 3. Aplicar cor do módulo como material
  // 4. Raycaster para click detection
  // 5. OrbitControls com target no centro da chapa
}
```

**Toggle no toolbar:**
```
[2D Plan] [3D Studio] [G-code Sim]
```
- **2D Plan:** SVG atual refinado (já funcional com zoom/pan) — padrão
- **3D Studio:** Chapa com peças 3D sólidas — para inspeção visual
- **G-code Sim:** Animação do toolpath com canvas 2D (já existe)

---

### 4. SIMULADOR G-CODE — Melhorias

**O que já existe (excelente):**
- `GcodeSimCanvas` (L2160-2500+): Canvas 2D com animação frame-a-frame
- Cores por tipo de operação (contorno=verde, furo=amarelo, canal=roxo, rebaixo=azul, pocket=rosa, rasgo=cyan, gola=laranja, fresagem=ciano)
- Controles: Play/Pause, velocidade 1x-16x, step forward, slider de progresso
- Legenda de operações encontradas no G-code
- Stats: total de movimentos, rapid/traverse vs cutting
- Preview de peças da chapa como retângulos de fundo
- Eventos de ferramenta e operação marcados na timeline

**Melhorias propostas:**

| # | Melhoria | Detalhe | Prioridade |
|---|---|---|---|
| 1 | **Overlay de peças no canvas** | Durante simulação, as peças da chapa aparecem como sombras semi-transparentes para contextualizar onde a fresa está cortando em relação ao plano | P1 |
| 2 | **Indicador de ferramenta ativa** | Badge flutuante no canto mostrando "🔧 Fresa 6mm" ou "🔧 Broca 5mm" — muda quando o parser detecta troca de ferramenta | P1 |
| 3 | **Heatmap de tempo** | Colorir áreas onde a fresa passa mais tempo (áreas vermelhas = possíveis bottlenecks) | P3 |
| 4 | **Estimativa de tempo total** | Calcular tempo estimado baseado no feed rate (F) de cada movimento: `soma(distância/feedRate)` | P1 |
| 5 | **Export frame** | Botão para capturar screenshot do estado atual da simulação como PNG | P3 |
| 6 | **Timeline de ferramentas** | Barra abaixo do canvas mostrando quando cada ferramenta é usada — clicável | P2 |
| 7 | **Zoom para operação** | Click na legenda → zoom automático na área onde aquela operação acontece | P2 |

---

### 5. PÓS-PROCESSADOR — Melhorias

**O que já existe (funcional):**
O modal `MachineModal` (L5700-5990 do ProducaoCNC.jsx) já permite configurar:

| Parâmetro | Status | Onde |
|---|---|---|
| Cabeçalho G-code customizável | ✅ | `gcode_header` textarea |
| Rodapé G-code customizável | ✅ | `gcode_footer` textarea |
| Velocidade de corte (F) | ✅ | `vel_corte` mm/min |
| Velocidade rápida (G0) | ✅ | `vel_rapida` mm/min |
| RPM do spindle | ✅ | `rpm` |
| Profundidade por passe | ✅ | `profundidade_passe` mm |
| Z de segurança | ✅ | `z_seguranca` mm |
| Z de aproximação rápida | ✅ | `z_aproximacao_rapida` mm |
| Lead-in tipo (arco/linear) | ✅ | `lead_in_tipo` |
| Raio do lead-in | ✅ | `lead_in_raio` mm |
| Rampa de entrada | ✅ | `usar_rampa`, `rampa_angulo`, `vel_mergulho` |
| Ordenação de contornos | ✅ | menor_primeiro / maior_primeiro / proximidade |
| Feed rate reduction | ✅ | % para peças pequenas + área máxima |
| Exportação seletiva | ✅ | Lado A, Lado B, furos, rebaixos, usinagens |
| Casas decimais | ✅ | `casas_decimais` |
| N-codes | ✅ | `usar_n_codes` + incremento |
| Ponto vs vírgula decimal | ✅ | `usar_ponto_decimal` |

**Melhorias propostas:**

| # | Melhoria | Detalhe | Prioridade |
|---|---|---|---|
| 1 | **Presets de máquinas populares** | Botão "📥 Carregar Preset" com lista: NcStudio V5/V8, Mach3, Mach4, DSP A11, Syntec, LinuxCNC, GRBL, Biesse Rover. Cada preset pré-preenche TODOS os campos com valores recomendados | P1 |
| 2 | **Import/Export config JSON** | Exportar configuração da máquina como arquivo `.json` para backup ou compartilhar entre instalações Ornato | P1 |
| 3 | **Preview live do G-code** | Enquanto edita os campos, mostra um snippet real das primeiras 30 linhas do G-code que seria gerado (cabeçalho + primeira operação) | P1 |
| 4 | **Validação de sintaxe** | Alert vermelho se cabeçalho/rodapé tem comandos inválidos (ex: `G99` não existe) | P2 |
| 5 | **Múltiplas máquinas por lote** | Dropdown "Máquina destino" por chapa. Chapa 1 → Router grande, Chapa 2 → CNC mesa pequena | P2 |
| 6 | **Configuração de Tabs/Microjuntas** | UI dedicada para: número de tabs, tamanho (mm), espessura (mm), distribuição (automática/manual/cantos). Já existe lógica no backend (`tabSize: 3, tabCount: 2`) mas falta controle na UI | P1 |
| 7 | **Compensação de ferramenta visual** | Mostrar no SVG/3D o offset da fresa ao redor de cada peça (contorno azul transparente mostrando o caminho real que a fresa percorre) | P2 |
| 8 | **Geração batch de G-code** | Botão "Gerar Todas as Chapas" → ZIP com arquivo .nc para cada chapa. Já existe geração individual por chapa — falta batch | P1 |

**Exemplo de preset NcStudio V5:**
```json
{
  "nome": "NcStudio V5 — Router CNC Chinesa",
  "gcode_header": "G90 G21\nG0 Z30\nM3 S18000\nG4 P3",
  "gcode_footer": "M5\nG0 Z50\nG0 X0 Y0\nM30",
  "vel_corte": 5000,
  "vel_rapida": 12000,
  "rpm": 18000,
  "z_seguranca": 30,
  "z_aproximacao_rapida": 5,
  "profundidade_passe": 9,
  "lead_in_tipo": "arco",
  "lead_in_raio": 5,
  "usar_rampa": 1,
  "rampa_angulo": 3,
  "vel_mergulho": 1500,
  "ordenar_contornos": "menor_primeiro",
  "usar_ponto_decimal": 1,
  "casas_decimais": 3,
  "usar_n_codes": 0,
  "exportar_lado_a": 1,
  "exportar_lado_b": 0,
  "exportar_furos": 1,
  "exportar_rebaixos": 1,
  "exportar_usinagens": 1
}
```

---

### 6. MOTOR DE ETIQUETAS — Melhorias

**O que já existe (muito bom):**
O `EditorEtiquetas.jsx` (1.508 linhas) implementa:

| Feature | Status |
|---|---|
| Canvas SVG editável em mm | ✅ |
| Grid com snap | ✅ |
| Zoom + auto-fit | ✅ |
| 7 tipos de elementos | ✅ Texto, Retângulo, Barcode (Code128), QR Code, Diagrama de Bordas, Imagem/Logo, Minimapa da Chapa |
| 47 variáveis dinâmicas | ✅ `{{descricao}}`, `{{comprimento}}`, `{{material}}`, etc. |
| 3 templates pré-definidos | ✅ Padrão 100×50, Compacta 70×40, Completa 100×70 |
| Drag-and-drop | ✅ |
| Resize handles (8 pontos) | ✅ |
| Undo/redo (50 estados) | ✅ |
| Keyboard shortcuts | ✅ Delete, Ctrl+Z/Y, Ctrl+D, Arrows, Escape |
| Salvar/duplicar templates | ✅ |
| Config de impressão | ✅ `colunas_impressao`, `margem_pagina`, `gap_etiquetas` |

**Melhorias propostas:**

| # | Melhoria | Detalhe | Prioridade |
|---|---|---|---|
| 1 | **Print preview A4** | Tela modal mostrando como as etiquetas ficam dispostas em uma folha A4 real (grid N×M com margens). Simulação visual antes de imprimir | P1 |
| 2 | **Seletor de formato de papel** | Dropdown: A4 (210×297), A5 (148×210), Letter (216×279), Pimaco 6180, Pimaco 6181, Pimaco 6082, Custom (largura×altura mm) | P1 |
| 3 | **Formato Pimaco pré-configurado** | Templates de etiquetas Pimaco já com margens, colunas e linhas corretas. Ex: Pimaco 6180 = 2 colunas × 7 linhas = 14 etiquetas/folha | P1 |
| 4 | **ZPL Export (Zebra/Argox)** | Novo endpoint `POST /cnc/etiquetas/zpl` que converte template SVG → ZPL (Zebra Programming Language). Mapeamento: texto→`^FO^A0^FD^FS`, barcode→`^BY^BC^FD^FS`, QR→`^BQ^FD^FS` | P1 |
| 5 | **PDF batch server-side** | Endpoint `POST /cnc/etiquetas/pdf` que gera PDF com TODAS as etiquetas do lote em grid configurável. Usar `pdfkit` no Node.js | P1 |
| 6 | **Impressão rápida melhorada** | O right-click na peça (tab Plano) → "Imprimir Etiqueta" atualmente abre popup HTML básico. Melhorar para usar o template real do editor com todas as variáveis resolvidas | P2 |
| 7 | **Export/Import template JSON** | Compartilhar templates entre instalações Ornato | P2 |
| 8 | **Guias magnéticas (snap lines)** | Ao arrastar elementos, mostrar linhas guia de alinhamento (como Figma/Canva). Snap horizontal + vertical para bordas e centros | P2 |
| 9 | **Elemento: Seta de veio** | Novo tipo de elemento que desenha seta indicando direção do veio da madeira. Rotaciona automaticamente conforme `{{grain}}` | P2 |
| 10 | **Elemento: Tabela de dimensões** | Bloco compacto que mostra C×L×E em formato tabelar monospace | P3 |

**Estrutura do endpoint ZPL:**
```
POST /cnc/etiquetas/zpl
Body: {
  templateId: 3,
  pecaIds: [101, 102, 103, ...],
  loteId: 7,
  dpi: 203  // ou 300
}
Response: {
  zpl: "^XA\n^FO50,30^A0,30,30^FDLateral Direita^FS\n^FO50,70^A0,24,24^FD600 x 400 x 18mm^FS\n...\n^XZ",
  etiquetas: 45,
  formato: "100x50mm"
}
```

**Estrutura do endpoint PDF:**
```
POST /cnc/etiquetas/pdf
Body: {
  templateId: 3,
  pecaIds: [101, 102, 103, ...],
  loteId: 7,
  formato_papel: "A4",
  colunas: 2,
  linhas: 7,
  margem_topo: 15,
  margem_lateral: 10,
  gap_horizontal: 5,
  gap_vertical: 3
}
Response: Buffer PDF (download direto)
```

---

### 7. NESTING ENGINE — Melhorias Algorítmicas

**O que já existe (robusto):**
O `nesting-engine.js` (1.557 linhas) implementa:

| Algoritmo | Status | Linhas |
|---|---|---|
| MaxRects (6 heurísticas: BSSF, BLSF, BAF, BL, CP, contactPoint) | ✅ | ~400 |
| Guillotine (cortes de esquadrejadeira, ponta a ponta) | ✅ | ~200 |
| Skyline Bottom-Left | ✅ | ~150 |
| Shelf (faixas horizontais) | ✅ | ~100 |
| BRKGA (Biased Random-Key Genetic Algorithm, 1.000+ gerações) | ✅ | ~200 |
| Ruin & Recreate (300 iterações de refinamento) | ✅ | ~200 |
| Multi-pass por material (agrupa por material_code + espessura) | ✅ | ~100 |
| Rotação com respeito ao veio da madeira | ✅ | - |
| Retalhos como bins secundários | ✅ | - |
| Classificação de peças por tamanho | ✅ | - |
| Geração de sobras como novos retalhos | ✅ | - |

**Melhorias propostas:**

| # | Melhoria | Detalhe | Prioridade |
|---|---|---|---|
| 1 | **Visualização de progresso** | WebSocket durante otimização para mostrar barra de progresso real: "Iteração 127/300 — melhor: 4 chapas 87.3%" em vez de spinner genérico | P1 |
| 2 | **Benchmark multi-algoritmo** | Executar TODOS os algoritmos em paralelo e mostrar tabela comparativa: "MaxRects: 4 chapas 87% / Guillotine: 5 chapas 82% / Skyline: 4 chapas 85% / BRKGA: 4 chapas 89%". Operador escolhe qual resultado usar | P2 |
| 3 | **Grain-aware grouping** | Quando peças têm veio, agrupar peças do mesmo material+direção_veio na mesma chapa para otimizar visual e aproveitamento. Atualmente bloqueia rotação mas não agrupa | P2 |
| 4 | **Nested islands** | Se há uma peça grande com área interna vazia (ex: moldura/quadro), detectar e encaixar peças pequenas dentro do espaço livre. Economiza material significativamente | P3 |
| 5 | **Web Worker para BRKGA** | Executar o algoritmo genético em um Web Worker separado para não travar a UI durante otimização de lotes grandes (200+ peças) | P2 |
| 6 | **Histórico de otimizações** | Salvar cada resultado de otimização com timestamp, parâmetros usados e resultado. Permitir comparar e reverter para uma otimização anterior | P2 |
| 7 | **Auto-retry com parâmetros relaxados** | Se o resultado está abaixo de 75% de aproveitamento, automaticamente re-executar com rotação habilitada ou modo diferente e perguntar se quer trocar | P3 |
| 8 | **Detecção de impossíveis** | Se uma peça é maior que a chapa → alert imediato com sugestão (dividir peça ou usar chapa maior) | P1 |

---

### 8. ANTI-ARRASTAMENTO — Safety Engineering (Segurança de Corte)

**O que já existe:**

```javascript
// server/routes/cnc.js L1001-1006
if (classificacao === 'super_pequena') {
    corte = {
        passes: 2,           // corta em 2 passes (onion skinning)
        velocidade: 'lenta',  // feed rate reduzido
        tabs: true,           // gera microjuntas
        tabSize: 3,           // 3mm de tab
        tabCount: 2           // 2 tabs por peça
    };
} else if (classificacao === 'pequena') {
    corte = {
        passes: 1,
        velocidade: 'media',
        tabs: binType === 'maxrects' // tabs apenas se CNC livre (não guilhotina)
    };
}
```

Além disso:
- ✅ Feed rate reduction configurável (% para peças pequenas + área máxima)
- ✅ Limiar de classificação configurável na UI (L1569-1570)
- ✅ Ordenação de contornos por área (menor primeiro = mais seguro)
- ✅ Z aproximação rápida configurável
- ✅ Texto de alerta na UI quando há peças especiais

**Melhorias propostas:**

| # | Melhoria | Detalhe | Prioridade |
|---|---|---|---|
| 1 | **Vacuum Risk Score composto** | Índice calculado para cada peça combinando: `area × 0.40 + distância_borda × 0.30 + aspect_ratio × 0.20 + vizinhos_já_cortados × 0.10`. Escala: 0-100 (0=seguro, 100=alto risco) | P1 |
| 2 | **Badge de risco visual** | No SVG 2D, cada peça mostra um ícone de semáforo: 🟢 seguro, 🟡 atenção, 🔴 risco. Hover mostra detalhes do score | P1 |
| 3 | **Tabs automáticas visuais** | No SVG 2D, mostrar onde os tabs/microjuntas serão gerados como pequenos pontos vermelhos nos contornos das peças | P1 |
| 4 | **Onion Skinning visual** | Para peças com 2 passes, mostrar a diferença de profundidade com cor/transparência diferente (1º passe = opaco, 2º passe = semi-transparente) | P2 |
| 5 | **Relatório de segurança pré-corte** | Antes de gerar G-code: modal "⚠️ Relatório de Segurança: 3 peças com risco ALTO · 2 com tabs (4 tabs total) · 1 com feed reduzido 50% · Tempo estimado: +12% por safety features. [Aceitar & Gerar] [Ajustar]" | P1 |
| 6 | **Ordem de corte visual** | No SVG, números mostrando a sequência de corte (1, 2, 3...) em cada peça. O operador vê qual peça será cortada primeiro | P2 |
| 7 | **Zona morta de vácuo** | Calcular e colorir áreas da chapa onde o vácuo já está comprometido (muitas peças ao redor já cortadas). Warnings quando a próxima peça da sequência está em zona morta | P3 |
| 8 | **Configuração de tabs por peça** | Na lista de peças ou no context menu: "Esta peça precisa de tabs? Sim/Não · Quantas? · Tamanho?" — override manual do automático | P2 |

---

### 9. EXPERIÊNCIA DO OPERADOR — UX Details

| # | Melhoria | Onde | Detalhe | Prioridade |
|---|---|---|---|---|
| 1 | **Keyboard shortcuts globais** | Cockpit | `1-8` trocar tabs, `Space` otimizar, `F` fit-to-view, `G` toggle grid, `R` rotacionar peça selecionada, `Del` remover, `T` transferir | P1 |
| 2 | **Minimap** | Viewport | Canto inferior direito: miniatura 120×80px da chapa inteira mostrando retângulo de onde o zoom está focado. Clicável para navegar | P2 |
| 3 | **Réguas em milímetros** | Viewport | Réguas nas bordas superior e esquerda do viewport (como Photoshop/Illustrator) com marcações a cada 100mm | P2 |
| 4 | **Snap-to-grid** | Viewport | Ao mover peças manualmente, snap para múltiplos de 5mm ou 10mm (configurável). Toggle on/off | P2 |
| 5 | **Measurement tool** | Viewport | Modo "régua": clicar em 2 pontos → mostra distância em mm com linha tracejada | P3 |
| 6 | **Dark viewport** | Viewport | Background do SVG: `#0f1419` (carbono escuro) com grid `#1a2030`. Peças coloridas contrastam muito melhor | P1 |
| 7 | **Tooltip de peça** | Viewport | Hover na peça → tooltip com: nome, C×L×E, módulo, material, bordas (quais lados), usinagens (count) | P1 |
| 8 | **Color blind mode** | Config | Paleta alternativa para daltônicos (deuteranopia). Toggle nas configurações | P3 |
| 9 | **Session persistence** | Automático | Salvar no localStorage: zoom, pan, chapa selecionada, tab ativa, sidebar collapsed. Restaurar ao reabrir | P2 |
| 10 | **Sound feedback** | Config | Beep sutil ao completar otimização (toggle on/off). Diferente para sucesso vs erro | P3 |
| 11 | **Fullscreen do viewport** | Toolbar | Botão para expandir viewport para fullscreen, escondendo sidebar. Pressionar `Esc` para voltar | P2 |
| 12 | **Search peças no plano** | Toolbar | Input de busca: digitar nome da peça → highlight com brilho pulsante no SVG/3D | P2 |

---

### 10. INTEGRAÇÃO E WORKFLOW

| # | Melhoria | Detalhe | Prioridade |
|---|---|---|---|
| 1 | **Dashboard de produção** | Nova view com cards de todos os lotes: "3 importados · 2 otimizados · 1 em produção · 1 concluído". Kanban visual | P2 |
| 2 | **Histórico e versionamento** | Cada otimização salva snapshot com timestamp + parâmetros. Lista: "v1: 5 chapas 82% · v2: 4 chapas 87% · v3 (atual): 4 chapas 89%". Click para reverter | P2 |
| 3 | **Export relatório PDF** | Botão "📄 Relatório" que gera PDF com: capa do projeto, lista de materiais, chapas com SVG, aproveitamento, custo total, lista de peças, bordas, usinagens | P1 |
| 4 | **G-code batch ZIP** | Botão "⬇️ Baixar Todos" → ZIP com: `chapa_01.nc`, `chapa_02.nc`, ..., `relatorio.pdf`, `etiquetas.pdf` | P1 |
| 5 | **Modo operador** | View-only simplificado para o operador da máquina: só ver chapas (SVG grande), imprimir etiquetas de cada peça, baixar G-code. Sem edição, sem config | P3 |
| 6 | **Notificações** | Quando otimização de lote grande termina: toast notification + badge numérico na tab | P3 |
| 7 | **Conexão com ModuleBuilder** | As peças do orçamento modular (`BibliotecaModular`) geram automaticamente o lote CNC. Sem import manual de JSON | P2 |

---

## 📋 PRIORIDADES E FASEAMENTO

### FASE 1 — INFRAESTRUTURA (Semana 1-2)
> Sem resultado visual imediato, mas é pré-requisito para tudo

| Task | Esforço | Impacto |
|---|---|---|
| Decompor `ProducaoCNC.jsx` de 6.278 → 15 arquivos | Alto | 🔴 Crítico |
| Criar `src/components/cnc/` com barrel exports | Baixo | Base |
| Verificar zero regressão em todas as 8 tabs | Médio | Qualidade |

### FASE 2 — COCKPIT VISUAL (Semana 2-3)
> Transformação visual que o operador vai sentir imediatamente

| Task | Esforço | Impacto |
|---|---|---|
| Layout cockpit split-pane fixo | Médio | 🔴 Wow factor |
| CncToolbar com toggle 2D/3D/Sim | Médio | 🔴 Core UX |
| CncSidebar com thumbnails + transfer | Médio | 🟡 Ergonomia |
| CncStatusBar | Baixo | 🟡 Info |
| Dark viewport background | Baixo | 🟡 Estética |
| Keyboard shortcuts globais | Baixo | 🟡 Produtividade |

### FASE 3 — 3D E SIMULAÇÃO (Semana 3-4)
> Diferencial competitivo — nenhum concorrente brasileiro tem isso

| Task | Esforço | Impacto |
|---|---|---|
| `ChapaPlan3D.jsx` — viewport 3D da chapa | Alto | 🔴 Diferencial |
| Toggle 2D/3D/Sim funcional | Médio | 🟡 Core |
| Tooltip de peça no hover | Baixo | 🟡 UX |
| Tabs automáticas visuais no SVG | Médio | 🟡 Safety |

### FASE 4 — ETIQUETAS E IMPRESSÃO (Semana 4-5)
> Workflow diário do chão de fábrica

| Task | Esforço | Impacto |
|---|---|---|
| Print preview A4 com grid visual | Médio | 🔴 Diário |
| Seletor de formatos (A4, Pimaco, Custom) | Baixo | 🔴 Essencial |
| Endpoint ZPL para Zebra/Argox | Médio | 🟡 Industrial |
| Endpoint PDF batch | Médio | 🟡 Batch |
| G-code batch ZIP (todas as chapas) | Baixo | 🟡 Conveniência |

### FASE 5 — PÓS-PROCESSADOR E SAFETY (Semana 5-6)
> Refina a geração de código de máquina e segurança

| Task | Esforço | Impacto |
|---|---|---|
| Presets de máquinas (NcStudio, Mach3...) | Baixo | 🟡 Setup |
| Preview live do G-code no config | Médio | 🟡 Feedback |
| Vacuum Risk Score + badges visuais | Médio | 🟡 Safety |
| Relatório de segurança pré-corte | Médio | 🟡 Safety |
| Configuração de tabs/microjuntas na UI | Baixo | 🟡 Controle |

### FASE 6 — POLISH E POWER FEATURES (Semana 6+)
> Refinamentos para power users

| Task | Esforço | Impacto |
|---|---|---|
| Benchmark multi-algoritmo visual | Médio | 🟢 Power user |
| Progresso de otimização via WebSocket | Médio | 🟢 DX |
| Minimap no viewport | Baixo | 🟢 Navegação |
| Réguas em mm | Baixo | 🟢 Precisão |
| Export relatório PDF completo | Médio | 🟢 Documentação |
| Modo operador view-only | Médio | 🟢 Multi-user |
| Histórico de otimizações | Médio | 🟢 Versionamento |

---

## 🏗️ STACK TÉCNICA

| Domínio | Tecnologia | Status |
|---|---|---|
| Frontend Framework | React 18 + Vite | ✅ Existente |
| Styling | Tailwind CSS + CSS variables | ✅ Existente |
| 3D Rendering | Three.js (vanilla, sem R3F para perf) | ✅ Existente |
| SVG Viewport | SVG nativo com zoom/pan manual | ✅ Existente |
| Backend | Node.js + Express | ✅ Existente |
| Database | SQLite (better-sqlite3) | ✅ Existente |
| PDF Generation | `pdfkit` (server-side) | 🆕 Novo |
| ZPL Generation | Custom string builder | 🆕 Novo |
| WebSocket | `ws` ou Socket.io | 🆕 Opcional |
| Python Bridge | `child_process.execFile` | ✅ Existente |

---

## 🎯 MÉTRICAS DE SUCESSO

| Métrica | Atual | Meta |
|---|---|---|
| Linhas do `ProducaoCNC.jsx` | 6.278 | < 300 |
| Componentes extraídos | 0 | 15 |
| FPS no viewport 3D (50 peças) | N/A | ≥ 60 |
| Tempo para gerar G-code (20 chapas) | — | < 5s |
| Scroll necessário na tab Plano | ~4 telas | 0 (zero scroll) |
| Formatos de etiqueta suportados | HTML popup | PDF + ZPL + A4 grid |
| Presets de máquinas CNC | 0 | 6+ |

---

## ❓ PERGUNTAS PARA O OPERADOR/DONO

1. **Prioridade de execução:** Começar pela Fase 1 (arrumação técnica) ou Fase 2 (visual cockpit)?
2. **Impressora Zebra/Argox:** Disponível para teste real de ZPL? Qual modelo?
3. **PDF:** Gerar no servidor (mais robusto) ou no navegador (mais simples)?
4. **Quais máquinas CNC você usa?** Preciso saber quais presets criar primeiro (NcStudio V5? DSP A11? Mach3?)
5. **Formato Pimaco:** Qual modelo de etiqueta você usa? (6180, 6181, 6082, outro?)
6. **Plugin SketchUp:** O JSON é sempre do mesmo plugin? Ou precisa suportar outros formatos de entrada?

---

> **Documento gerado em 29/03/2026**
> **Análise de: 10.183 linhas de código CNC**
> **Arquivos analisados: ProducaoCNC.jsx, nesting-engine.js, cnc.js, PecaViewer3D.jsx, GcodeSim3D.jsx, EditorEtiquetas.jsx, PecaEditor.jsx**
