# UX_PATTERNS_REFERENCIA — Ornato Plugin v2

Pesquisa de padrões aplicáveis a HtmlDialog vanilla JS (sem React, sem build). Foco prático.

---

## 1. Top 10 padrões UX a adotar

| # | Padrão | Origem | Aplicação no Ornato |
|---|--------|--------|---------------------|
| 1 | **Command Palette ⌘K com fuzzy + ações contextuais** | Linear, Raycast | Já temos hotkey. Falta: comandos contextuais ("Aplicar acabamento Branco TX em seleção", "Trocar dobradiça de Clip Top → Tip-On"). Fuzzy match sobre nome+sinônimo+tag. |
| 2 | **Inspector contextual reativo à seleção** | Figma right panel | Painel direito muda 100% conforme tipo: `nada`, `1 módulo`, `N módulos (intersect)`, `1 ferragem`, `1 face/joint`. Header sticky com thumbnail+breadcrumb do alvo. |
| 3 | **Properties em grupos colapsáveis com "show advanced"** | Figma, SolidWorks PropertyManager | 80% dos usuários só toca em 5 props. Default: 5 visíveis, resto atrás de `▸ Avançado`. Lembrar último estado por tipo de objeto. |
| 4 | **Slash-command inline em campos numéricos** | Notion, Figma | Campo "Altura" aceita `=720`, `=h-50`, `=ALTURA_PADRAO`. Avalia ao blur. Reduz dependência do painel de variáveis. |
| 5 | **Badge counter no nó** (sem expandir árvore) | SolidWorks Tree, VS Code | Cada módulo na lista tem `🔩3 ⚙2 ⚠1` sem precisar abrir. Click no badge = filtra inspector pra aquela categoria. |
| 6 | **Diff visual em multi-seleção** | Figma "Mixed", Plasticity compare | 2 módulos selecionados → props iguais aparecem normais, props diferentes aparecem com badge `Misto` clicável que mostra os valores divergentes. Editar valor força propagação. |
| 7 | **Onboarding por Coachmark contextual** | Linear primeira vez, Notion "?" | Não tour modal. Bolha discreta `?` ao lado de cada feature avançada que abre 1 frase + GIF. Auto-mostra primeiro uso, depois fica passivo. |
| 8 | **Preview SVG inline 2D** | Cabinet Vision Production Preview, Promob "vista frontal" | Em vez de só thumbnail 3D estática, gerar SVG procedural da face frontal do módulo com pontos vermelhos = ferragens, hachura azul = usinagens. Reusa Z-positions já calculadas pelo Ruby. |
| 9 | **Status bar como "linha viva"** | Linear bottom bar, VSCode | Sempre mostra: seleção atual, ambiente ativo, última ação (`✓ Acabamento aplicado`), conflitos pendentes (`⚠ 3`). Click = ação. |
| 10 | **Atalho-de-tecla visível em hover** | Linear, Notion | Toda ação clicável mostra a tecla no tooltip (`Modo Foco · F`). Treina o usuário sem ele perceber. |

---

## 2. Mockups ASCII — 3 telas refeitas

### 2.1 Tab Ferragens (hoje vazia)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FERRAGENS                                              [+ Regra]   [⌘K]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Filtros:  [Todas ▾]  [● Dobradiças  ● Corrediças  ● Puxadores  ● Pés]      │
│ Busca:    🔍 _______________________________________     12 itens / 47 usos│
├──────────────┬──────────────────────────────────────────────────────────────┤
│ CATÁLOGO     │ Detalhe: Clip Top Blumotion 110°                            │
│              │ ┌──────────────────────────────┬───────────────────────┐    │
│ ▾ Dobradiças │ │  ┌─ porta 450×720 ─┐         │ Aplicado em: 14 portas│    │
│   Clip Top.. │ │  │ ●               │         │ Estoque: 84 un        │    │
│   Tip-On  ⚠ │ │  │                 │  3×     │ Custo un: R$ 18,40    │    │
│   Salice... │ │  │ ●               │ por porta│ Última compra: 14 dias│   │
│ ▸ Corrediças │ │  │                 │         │                        │    │
│ ▸ Puxadores  │ │  │ ●               │         │ Regra: altura ≥ 600   │    │
│ ▸ Pés        │ │  └─────────────────┘         │ Offsets: 100 / 100    │    │
│              │ │  SVG vista frontal lateral E │ Espaçamento máx: 480  │    │
│ ▾ Regras     │ └──────────────────────────────┴───────────────────────┘    │
│   Auto-3p≥6 ✓│ Conflitos:  ✓ nenhum                                        │
│   2-portas ✓ │ ▸ Avançado (4)                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
 Statusbar:  📦 Cozinha · 🎯 1 ferragem · ✓ sync 2s · ⚠ 0     ?
```

### 2.2 Configurações Globais (⌘,)

```
┌─ Configurações  ────────────────────────────────────────────  Esc fecha ─┐
│ ┌─────────────┐                                                          │
│ │ ◉ Geral     │  IDENTIDADE                                              │
│ │ ○ Catálogo  │  Marca:        [Ornato_______________________________]  │
│ │ ○ CNC       │  Logo:         [📎 logo_v3.png    ✓]                    │
│ │ ○ ERP Sync  │                                                          │
│ │ ○ Atalhos   │  PADRÕES DE PROJETO                                      │
│ │ ○ Tema      │  Esp. lateral:  [15] mm    Esp. fundo: [3] mm           │
│ │ ○ Sobre     │  Esp. porta:    [18] mm    Folga porta: [2] mm          │
│ └─────────────┘  Profundidade base: [580] mm                             │
│                                                                          │
│                  ▸ Avançado (espessuras por tipo, recuos, ...)           │
│                                                                          │
│                  ─────────────────────────────────────────────────────   │
│                  💡 Mudanças aplicam só a NOVOS módulos. Para           │
│                     reaplicar em existentes, use ⌘K → "Reaplicar         │
│                     padrões em seleção"                                  │
│                                                                          │
│                                                  [Cancelar]  [Salvar ⏎]  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Inspector com 1 módulo selecionado

```
┌─ INSPECTOR ─────────────────────────────┐
│ 🗄 Armário 2 portas                     │  ← thumbnail 56px + nome
│ Cozinha › Superior › #M14    [↗ zoom]   │  ← breadcrumb + ação isolada
├─────────────────────────────────────────┤
│ ┌───────────────────────┐               │
│ │   ┌─────┬─────┐       │  900×720×320  │  ← SVG vista frontal procedural
│ │   │  ●  │  ●  │       │  L × A × P    │     com badges de ferragens
│ │   │     │     │       │               │
│ │   │  ●  │  ●  │       │  🔩 4  ⚙ 12   │
│ │   │     │     │       │  💰 R$ 412    │
│ │   │  ●  │  ●  │       │               │
│ │   └─────┴─────┘       │               │
│ └───────────────────────┘               │
├─────────────────────────────────────────┤
│ ▾ DIMENSÕES                             │  ← grupo colapsável
│   L  [900__] A [720__] P [320__]        │
│   Altura piso: [1800] mm                │
│                                         │
│ ▾ ACABAMENTOS                           │
│   Frente:   [Branco TX           ▾]     │
│   Corpo:    [Branco TX           ▾] ⚠   │  ← badge conflito
│   Interno:  [Igual corpo         ▾]     │
│                                         │
│ ▾ FERRAGENS  (4)                        │
│   ① Clip Top  · porta E · 3 un          │
│   ② Clip Top  · porta D · 3 un          │
│   ③ Puxador Cava 96 · ambas             │
│   [+ adicionar]                         │
│                                         │
│ ▸ USINAGENS (12)                        │
│ ▸ AVANÇADO                              │
├─────────────────────────────────────────┤
│ [⌘K Ações]   [E Composição]   [Del 🗑]  │
└─────────────────────────────────────────┘
```

---

## 3. Sistema de design tokens

```
SPACING (base 4)         TYPE                       SEMANTIC COLOR
--sp-0  : 0              --t-xs : 11/14   mono      --c-bg, --c-bg-elev
--sp-1  : 4              --t-sm : 12/16              --c-fg, --c-fg-muted
--sp-2  : 8              --t-md : 13/18  default     --c-border, --c-border-strong
--sp-3  : 12             --t-lg : 15/22              --c-accent (cobre #C9A96E)
--sp-4  : 16             --t-xl : 18/26              --c-success, --c-warn, --c-danger
--sp-6  : 24             --t-2xl: 22/30  display     --c-info, --c-selection
--sp-8  : 32             font-stack: Inter, system   --c-overlay (rgba)

RADIUS                   ELEVATION                   MOTION
--r-sm : 4               --el-1 : sombra 1px       --m-fast : 120ms ease-out
--r-md : 6               --el-2 : sombra 4px       --m-base : 200ms ease-out
--r-lg : 10              --el-3 : sombra 12px      --m-slow : 320ms cubic(.2,.8,.2,1)
--r-pill: 999            --el-pop: sombra 24px     prefers-reduced-motion: reset
```

Regra dura: **nada de px hard-coded em CSS de componente.** Tudo via var(). Permite densidade compacta/confortável global (multiplicar `--sp-*` por 0.85 ou 1.15).

---

## 4. Atalhos de teclado (estilo Linear)

### Navegação
- `1`–`9` `0` — trocar tab
- `g a` — go to Ambiente, `g b` — Biblioteca, `g f` — Ferragens (chord)
- `[` `]` — navegar histórico de seleção
- `⌘K` — Command Palette
- `⌘,` — Configurações
- `⌘/` — atalhos cheatsheet
- `?` — coachmark contextual da área hover

### Seleção / Edição
- `E` — abrir Composição
- `R` — Reaplicar padrões na seleção
- `D` — Duplicar módulo
- `⌫` / `Del` — remover
- `⌘D` — desselecionar tudo
- `⌘A` — selecionar tudo do ambiente

### Visualização
- `F` — Modo Foco
- `T` — toggle tema
- `Z` — zoom no objeto selecionado (bridge Ruby)
- `\` — toggle Inspector
- `|` — toggle Sidebar

### Operações de ferragem (chord)
- `h h` — adicionar dobradiça à porta selecionada
- `h s` — adicionar corrediça
- `h p` — adicionar puxador
- `h r` — re-distribuir (recalcular spacing)

### Validação / Produção
- `V` — rodar validação
- `⌘E` — exportar UPM JSON
- `⌘⇧E` — enviar pro ERP

Discoverability: cada item de menu mostra atalho à direita. `⌘/` exibe overlay completo.

---

## 5. Onboarding flow — 5 passos

```
PASSO 1 — primeira abertura
┌──────────────────────────────────────┐
│  Bem-vindo. Vou te mostrar 4 coisas. │
│  [Pular]                  [Começar →]│
└──────────────────────────────────────┘

PASSO 2 — ⌘K (coachmark sobre o input de busca da topbar)
   "⌘K abre tudo. Tenta agora: digite 'cozinha'."
   → AVANÇA SÓ QUANDO O USUÁRIO PRESSIONA ⌘K (não botão "next")

PASSO 3 — selecionar primeiro módulo (coachmark sobre lista Biblioteca)
   "Click num módulo aqui. O painel direito vai mostrar tudo dele."
   → AVANÇA QUANDO state.selection.count >= 1

PASSO 4 — Inspector (coachmark sobre ▾ ACABAMENTOS)
   "Mude o acabamento. Sem confirmação, atualiza no 3D em tempo real."

PASSO 5 — Modo Foco
   "Aperta F. Esconde tudo menos o que você tá editando.
    Pronto, agora é seu. ⌘/ pra ver todos atalhos."
   [Concluir]
```

Princípios: progride por **ação real**, não por click em "next". Persiste em localStorage `ornato.onboarding.v1=done`. Botão `Refazer tour` em Configurações › Sobre.

---

## 6. Anti-patterns a EVITAR

1. **Árvore monstro com 50+ nós aninhados** (Promob clássico) — substituir por busca + filtros + breadcrumb. Profundidade máxima visual: 3.
2. **Modal pra editar propriedade de módulo** — mata fluxo. Tudo inline no Inspector ou popover ancorado.
3. **Confirmação dupla** ("Tem certeza?" pra cada acabamento). Usar **undo persistente de 10s** estilo Gmail.
4. **Toolbar com 30 ícones sem label nem categoria** (SolidWorks classic). Máx 8 ações no header da tab; resto via ⌘K.
5. **Tabela de 40 colunas com scroll horizontal** pra ferragens. Substituir por master-detail (lista esquerda + detalhe direita).
6. **Configurações em formulário gigante de 200 campos** (Cabinet Vision). Tabs + grupos colapsáveis + "show advanced".
7. **Drag-drop como única forma de adicionar item** — sempre ter alternativa por teclado/menu.
8. **Status só no log/console** — toda ação Ruby precisa eco visual no statusbar (✓ ou ✗ com motivo).
9. **Cores semânticas inventadas** (verde pra "selecionado", verde pra "ok", verde pra "novo") — fixar 1 cor por significado em tokens.
10. **Texto técnico cru** (`MOD_PARAM_HEIGHT_MM_OVERRIDE`) — UI fala português de marceneiro: "Altura sob medida". Slug fica só no tooltip dev.
11. **Inspector que mostra TUDO sempre** — usuário perde props relevantes no meio. Default: essenciais; resto atrás de `▸ Avançado`.
12. **Reload total ao salvar config** — preservar seleção, scroll, tab ativa. Re-render diferencial.

---

## Notas de implementação prática (HtmlDialog vanilla JS)

- Coachmark: `<div class="coach" data-anchor="#cmdk-input">` posicionado via `getBoundingClientRect`. Sem libs.
- SVG procedural da vista frontal: função pura `renderModuleSvg(moduleData) → string`. ~80 linhas.
- Fuzzy search pra ⌘K: implementar `fuzzyScore(query, target)` em ~30 linhas (bonus por match no início, contíguo, palavra inteira).
- Diff de multi-seleção: `Object.keys` da união → comparar por chave → marcar `mixed` quando `new Set(values).size > 1`.
- Slash-command em input: `onBlur` chama `evalExpression(value, context)` que aceita `=` prefix, vars conhecidas, math básica.
- Atalhos chord (`g a`, `h h`): manter `state.pendingChord` + timeout 800ms.

Arquivos relevantes:
- `/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2/app.js`
- `/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2/styles.css`
- `/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2/tabs/ferragens.js` (vazio — primeira aplicação dos padrões 2, 5, 8)
