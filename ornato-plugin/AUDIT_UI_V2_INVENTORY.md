# Auditoria UI v2 — Inventário Real (Plugin SketchUp)

**Data:** 2026-05-10
**Escopo:** `ornato-plugin/ornato_sketchup/ui/v2/`
**Método:** `wc -l` + `grep -cE` (callRuby/mock/loading/empty) — sem estimativa.

---

## 1. Tabs (`tabs/*.js`)

Status:
- ✅ REAL = render funcional + bridge Ruby + estados (loading/empty)
- 🟡 PARCIAL = render existe mas faltam estados ou bridge incompleto
- ❌ PLACEHOLDER = stub de 6 linhas, só comentário + `export const meta`

| Tab            | Status         | Linhas | callRuby | Mock | Loading | Empty |
|----------------|----------------|--------|----------|------|---------|-------|
| projeto.js     | ❌ PLACEHOLDER | 6      | 0        | ❌   | ❌      | ❌    |
| ambiente.js    | ❌ PLACEHOLDER | 6      | 0        | ❌   | ❌      | ❌    |
| biblioteca.js  | ❌ PLACEHOLDER | 6      | 0        | ❌   | ❌      | ❌    |
| internos.js    | ❌ PLACEHOLDER | 6      | 0        | ❌   | ❌      | ❌    |
| acabamentos.js | ❌ PLACEHOLDER | 6      | 0        | ❌   | ❌      | ❌    |
| ferragens.js   | ✅ REAL        | 202    | 2        | ✅   | ✅      | ✅    |
| usinagens.js   | ❌ PLACEHOLDER | 6      | 0        | ❌   | ❌      | ❌    |
| validacao.js   | ✅ REAL        | 300    | 12       | ✅   | ✅      | ✅    |
| producao.js    | ❌ PLACEHOLDER | 6      | 0        | ❌   | ❌      | ❌    |

> Nota: `tabs/index.js` (182 linhas) é o registry/loader das tabs, não uma tab em si.
> Nota: `empty` em placeholders é a string "empty" no comentário do stub —
> não há render real de empty-state. Tabs reais (`ferragens`, `validacao`)
> têm `<div class="empty-tab">` instanciado.

**Resultado: 2 de 9 tabs reais (22%). 7 placeholders.**

---

## 2. Inspector (col 4)

- Implementado em `app.js` (linhas 559-600 + helpers).
- `renderInspector()` presente ✅
- Modos (5 esperados → 5 encontrados via switch em `app.js:580-586`):
  - `modulo` → `renderInspectorModule()`
  - `peca` → `renderInspectorPiece()`
  - `ferragem` → `renderInspectorHardware()`
  - `agregado` → `renderInspectorAggregate()`
  - `default/unknown` → `renderInspectorUnknown()`
- Estados auxiliares: `renderInspectorEmpty()` (count=0), `renderInspectorMulti()` (count>1).
- Recolhe via `data-action="hide-inspector"` ✅

**Status Inspector: ✅ REAL (estrutura completa, 5+ modes).**

---

## 3. Drawer Configurações (⌘,)

- `renderConfigDrawer()` em `app.js:1335` ✅
- `renderComposicaoDrawer()` em `app.js:1024` ✅
- Estado: `shopDrawerCollapsed` (linha 68), modo override-edit (linha 69)
- Comando palette aponta para `id: 'config'` com hint `'⌘,'` (linha 1066) ✅
- Hidratação on-demand: `hidrata shopConfig no boot (e on-demand quando drawer abrir)` (linha 218)

**Status Drawer: ✅ REAL (config + composição implementados).**

---

## 4. Command Palette (⌘K)

- `renderCommandPalette()` em `app.js:1029` ✅
- Estado: `paletteOpen` (linha 50)
- Overlay: `<div id="overlayCommandPalette">` (linha 1030)
- `buildPaletteCommands()` (linha 1035) gera lista de comandos
- Inclui comando "Abrir Configurações Globais ⌘,"

**Status Palette: ✅ REAL.**

---

## 5. Bridge Ruby (callRuby)

- `app.js` define `callRuby` helper exportado (importado pelas 2 tabs reais).
- TODO remanescente: `app.js:1758 — TODO: bridge com Ruby — sketchup.callRuby('refresh_selection')` ⚠️
- Apenas 2 ocorrências de `sketchup.` em app.js (1 doc + 1 TODO).

---

## 6. Sumário

- **Tabs reais: 2 / 9** (`ferragens`, `validacao`)
- **Tabs placeholder: 7 / 9** (`projeto`, `ambiente`, `biblioteca`, `internos`, `acabamentos`, `usinagens`, `producao`)
- **Infra premium (Inspector / Drawer / Palette): ✅ todas as 3 reais**
- **Bridge Ruby:** funcional via `callRuby` em tabs reais; 1 TODO pendente em `refresh_selection`

### Próximas a priorizar (por ROI)

1. **`biblioteca.js`** — bloqueia fluxo central de inserção de módulos; tem callbacks Ruby já mapeados no plugin loader.
2. **`projeto.js`** — entrada do usuário; deveria mostrar metadados do projeto + sync com ERP (endpoint `/api/plugin/projeto/:id/info` já existe).
3. **`usinagens.js`** — depende de `ferragens` (já real) + `validacao` (já real); fluxo CAM/CNC alinhado.
4. **`producao.js`** — visão de status/expedição; pode reusar endpoints CNC existentes.
5. **`internos`, `acabamentos`, `ambiente`** — secundárias; ROI menor enquanto core (biblioteca/projeto) está placeholder.
