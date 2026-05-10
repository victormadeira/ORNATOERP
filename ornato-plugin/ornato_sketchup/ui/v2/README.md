# Ornato Plugin v2 — UI

Painel novo do plugin SketchUp Ornato, baseado no protótipo Next.js validado.

## Stack

- **Vanilla JS modular** (ES modules) — sem build step
- **CSS variables** com tema híbrido (claro default + dark via `data-theme="dark"`)
- **HTML estático** servido pelo HtmlDialog do SketchUp
- **Sem dependências externas** (zero npm)

## Estrutura

```
v2/
├── panel.html       # Shell HTML (topbar, body, statusbar, overlays)
├── styles.css       # Tokens + componentes + layout
├── app.js           # State + render + atalhos + bridge Ruby
├── icons.js         # SVGs inline (10 tab icons custom + utility lucide-style)
├── tabs/
│   ├── index.js     # Registry das 9 tabs + primaryActionByTab
│   ├── projeto.js   # Fase 1.1: placeholder
│   ├── ambiente.js
│   ├── biblioteca.js
│   ├── internos.js
│   ├── acabamentos.js
│   ├── ferragens.js
│   ├── usinagens.js
│   ├── validacao.js
│   └── producao.js
└── README.md
```

## Como testar localmente (sem SketchUp)

ES modules exigem servidor HTTP (não funciona via `file://`).

```bash
cd "/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2"
python3 -m http.server 8765
```

**Duas URLs disponíveis:**

| URL | Quando usar |
|-----|-------------|
| `http://localhost:8765/preview.html` | **Dev/QA** — simulador com presets de tamanho (360, 420, 520, 720, 900), modo Janela vs Tela cheia, sliders de Largura/Altura, atalhos (`1-5` presets, `F` tela cheia, `R` reload, `🌓 Tema`). É o que devs e designers devem abrir. |
| `http://localhost:8765/panel.html` | **Plugin real** — sem chrome/dev tools. É exatamente o que vai pro HtmlDialog do SketchUp. Útil pra ver o painel "puro" sem o wrapper do simulador. |

> O `preview.html` carrega o `panel.html` num iframe, então qualquer mudança em `panel.html`, `app.js`, `styles.css`, `icons.js` ou tabs reflete direto (basta `R` ou Cmd+Shift+R).

## Atalhos implementados (Fase 1.1)

| Tecla | Ação |
|-------|------|
| `1`..`9` `0` | Trocar tab |
| `⌘K` (Cmd/Ctrl+K) | Abrir Command Palette |
| `⌘,` (Cmd/Ctrl+,) | Abrir Configurações Globais |
| `F` | Toggle Modo Foco |
| `E` | Abrir Composição (se há seleção) |
| `T` | Toggle tema claro/escuro (atalho dev) |
| `Esc` | Fechar overlays |

## State

Tudo em `app.js` no objeto `state`:

```js
{
  activeTab: 'biblioteca',
  submenuByTab: { ... },
  ambienteId: 'cozinha',
  selection: { count: 0, label: null }, // mock até bridge Ruby
  syncStatus: 'online',
  width, navExpanded, showInspector,
  paletteOpen, configOpen, composicaoOpen, conflictsOpen, focusMode,
  theme: 'light' | 'dark', // persistido no localStorage
}
```

`setState(partial)` re-renderiza tudo. Simples por agora; se ficar pesado, pode-se adicionar shouldRender por região.

## Bridge Ruby (futuro)

O HtmlDialog do SketchUp expõe `window.sketchup` com método `callRuby(name, ...args)`. O plugin Ruby registra callbacks via `dialog.add_action_callback`.

Pontos de bridge previstos:
- `refresh_selection()` — Ruby lê seleção atual e responde com `setSelection({count, label})`
- `apply_finish(moduleId, finishId)` — aplica acabamento
- `export_json()` — exporta UPM JSON e envia ao ERP
- `sync_catalog()` — busca catálogos do ERP e popula state

## Status (Fase 1.1)

- ✅ Shell HTML com topbar/sidebar/main/inspector/statusbar
- ✅ Tema híbrido claro/escuro via CSS variables
- ✅ 9 tabs registradas com hotkeys
- ✅ Composição contextual / Inspector / ⌘K / Modo Foco — atalhos prontos (overlays virão Fase 1.2)
- ⏳ Fase 1.2: Inspector dinâmico real (3 modos)
- ⏳ Fase 1.3: ⌘K palette real + Composição drawer real
- ⏳ Fase 1.4: Status bar com seleção real do SketchUp + bridge Ruby
- ⏳ Fase 2: Conteúdo das 9 tabs
