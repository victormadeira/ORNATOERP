# Brief para equipe de Dev — Troca de ícones SVG do Plugin Ornato

> **Quando ler:** depois que os designers entregarem os SVGs novos (referência: `BRIEF_ICONES_DESIGNERS.md`).
> **Tempo estimado:** 1-2 horas para trocar todos os 11 ícones, incluindo testes.
> **Nível:** dev júnior consegue seguir.

---

## 0. TL;DR

1. Designer entrega SVGs em `.svg` ou colados em texto.
2. Você abre `ornato_sketchup/ui/v2/icons.js`, troca os paths internos do ícone correspondente.
3. Preferência atual: usar SVGs outline da **Tabler Icons** em `viewBox 0 0 24 24`.
4. Roda `python3 -m http.server 8765` na pasta `ui/v2/` e abre `http://localhost:8765/panel.html`.
5. Confere os 5 estados visuais (sidebar inactive/hover/active, header tab, empty state, dark mode).
6. Commit + PR.

Pronto. **Não há build step. Não há dependência npm. Não há transpilação.**

---

## 1. Localização dos arquivos

| Arquivo | Função | O que mexer |
|---------|--------|-------------|
| `ornato_sketchup/ui/v2/icons.js` | **Único arquivo onde os SVGs vivem** | ✅ trocar paths internos |
| `ornato_sketchup/ui/v2/panel.html` | Shell HTML do plugin. Tem 4 SVGs **inline** (refresh, foco, settings, search) | ⚠️ trocar SVG inline se designer revisou esses 4 |
| `ornato_sketchup/ui/v2/app.js` | Render. Chama `iconHTML('detalhes', 16)` etc | ❌ **não mexer** |
| `ornato_sketchup/ui/v2/styles.css` | Tokens de cor + componentes | ❌ **não mexer** |
| `ornato_sketchup/ui/v2/tabs/index.js` | Mapeia tab → nome do ícone | ❌ **não mexer** |

**Caminho absoluto na máquina dev:**
```
/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2/
```

**No git:** branch atual `main`, criar branch `feature/icons-update` antes de começar.

---

## 2. Anatomia do `icons.js`

### Como o arquivo é organizado

```js
export const ICONS = {
  /* ─── Brand ─── */
  'ornato-mark': `<path .../>`,            // logo do plugin

  /* ─── Tab icons (custom Ornato) ─── */
  detalhes:    `<path .../>`,              // tab Projeto
  ambiente:    `<path .../>`,              // tab Ambiente
  biblioteca:  `<path .../>`,              // tab Biblioteca
  internos:    `<path .../>`,              // tab Internos
  acabamentos: `<path .../>`,              // tab Acabamentos
  ferragens:   `<path .../>`,              // tab Ferragens
  usinagens:   `<path .../>`,              // tab Usinagens (Spindle CNC)
  validacao:   `<path .../>`,              // tab Validação
  relatorios:  `<path .../>`,              // (não está em uso, manter)
  producao:    `<path .../>`,              // tab Produção

  /* ─── Utility icons (lucide-style) ─── */
  search, 'chevron-right', 'chevron-down', 'chevron-left',
  'panel-left-open', 'panel-left-close', 'panel-right-close',
  'mouse-pointer', 'alert-triangle', 'plus', 'minimize',
  'layers', 'check-circle', 'paintbrush', 'send', 'download',
  'lightbulb', 'pencil', 'settings'
}

export function iconHTML(name, size = 16) {
  // recebe o nome do ícone e tamanho em px
  // retorna string HTML pronta pra injetar via innerHTML
}
```

### Como cada ícone é declarado

Cada chave do objeto recebe uma **string com PATHS SVG** (sem o `<svg>` wrapper).

```js
export const ICONS = {
  detalhes: `
    <rect x="5" y="4.75" width="14" height="15.75" rx="2"/>
    <path d="M9.25 4.75c.28-1.15 1.2-1.85..." fill="currentColor" fill-opacity="0.12"/>
    <circle cx="9" cy="11.4" r="1.45"/>
    <path d="M12.1 10.65h3.8M12.1 12.25h2.9M8 15.5h5.5"/>
  `,
}
```

A função `iconHTML(name, size)` envelopa esse conteúdo num `<svg>` com os defaults certos:

```html
<svg viewBox="0 0 24 24" width="16" height="16" fill="none"
     stroke="currentColor" stroke-width="1.5"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <!-- conteúdo da chave aqui -->
</svg>
```

**Você só precisa fornecer os elementos internos** (`<path>`, `<rect>`, `<circle>`, `<line>`). Sem `<svg>`, sem `xmlns`, sem `viewBox`.

**Importante:** a decisão atual é usar Tabler Icons para os tab icons. Ao copiar SVGs da biblioteca, remova o wrapper `<svg>` e o primeiro `<path stroke="none" d="M0 0h24v24H0z" fill="none" />`; cole apenas os paths reais dentro da chave.

---

## 3. Workflow passo a passo

### 3.1 Substituir um ícone existente

Cenário: designer entregou SVG novo para `detalhes` (tab Projeto).

**Passo 1.** Designer entregou um arquivo `detalhes.svg` ou colou no Slack tipo:
```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"
     fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
     stroke-linejoin="round">
  <rect x="6" y="3" width="13" height="18" rx="2"/>
  <path d="M9 1h7v4H9z" fill="currentColor" fill-opacity="0.15"/>
  <line x1="9" y1="9" x2="16" y2="9"/>
  <line x1="9" y1="13" x2="14" y2="13"/>
</svg>
```

**Passo 2.** Abrir `ornato_sketchup/ui/v2/icons.js`. Localizar a chave `detalhes:`.

**Passo 3.** Substituir o conteúdo da chave pelos elementos **internos** ao `<svg>` do designer (sem o wrapper):

```js
// ANTES
detalhes: `
  <rect x="5" y="4.75" width="14" height="15.75" rx="2"/>
  <path d="M9.25 4.75c.28-1.15..." fill="currentColor" fill-opacity="0.12"/>
  ...
`,

// DEPOIS
detalhes: `
  <rect x="6" y="3" width="13" height="18" rx="2"/>
  <path d="M9 1h7v4H9z" fill="currentColor" fill-opacity="0.15"/>
  <line x1="9" y1="9" x2="16" y2="9"/>
  <line x1="9" y1="13" x2="14" y2="13"/>
`,
```

**Passo 4.** Abrir `http://localhost:8765/panel.html`. Recarregar (Cmd+Shift+R no macOS, Ctrl+F5 no Windows).

**Passo 5.** Conferir nos 5 estados visuais (ver seção 5).

**Passo 6.** Commit:
```bash
git add ornato_sketchup/ui/v2/icons.js
git commit -m "icons: troca SVG da tab Projeto"
```

### 3.2 Substituir TODOS os 11 ícones (mais comum)

**O designer manda um zip com 11 SVGs**. Você abre cada um, copia o **conteúdo interno** e cola na chave correspondente do `icons.js`.

**Mapa designer → chave do icons.js:**

| Arquivo do designer | Chave em `icons.js` | Onde aparece |
|--------------------|----------------------|--------------|
| `01-logo.svg` | `'ornato-mark'` | Topbar (quadradinho preto, brand) |
| `02-projeto.svg` | `detalhes` | Tab 1 |
| `03-ambiente.svg` | `ambiente` | Tab 2 |
| `04-biblioteca.svg` | `biblioteca` | Tab 3 |
| `05-internos.svg` | `internos` | Tab 4 |
| `06-acabamentos.svg` | `acabamentos` | Tab 5 |
| `07-ferragens.svg` | `ferragens` | Tab 6 |
| `08-usinagens.svg` | `usinagens` | Tab 7 (Spindle CNC) |
| `09-validacao.svg` | `validacao` | Tab 8 |
| `10-producao.svg` | `producao` | Tab 0 |

**Não inclui** os utility icons (`chevron-right`, `plus`, etc.) — esses ficam como estão (lucide-style padrão).

### 3.3 Casos especiais

**Caso A — designer enviou em outro nome de chave**
Se vier `01-projeto.svg` mas no código a chave é `detalhes` (porque "Projeto" foi renomeado de "Detalhes"), usar a **chave do código**, não o nome do arquivo. Lista de mapeamento na seção 3.2.

**Caso B — SVG do designer tem `<defs>`, `<linearGradient>` ou `<filter>`**
Pedir pra simplificar. Plugin não usa gradiente nem filter (foge da estética minimalista). Se for absolutamente necessário, conversar com designer + tech lead antes de aceitar.

**Caso C — SVG do designer tem cores hardcoded (ex: `fill="#d95f18"`)**
Trocar **toda** ocorrência de cor por `currentColor`. Se você não fizer isso, o ícone vai ignorar o tema (fica fixo em uma cor) e quebrar dark mode.

**Caso D — SVG é grande demais (>3KB cada)**
Rodar pelo [SVGOMG](https://jakearchibald.github.io/svgomg/) com:
- ✅ Remove dimensions
- ✅ Cleanup IDs
- ✅ Remove unknown elements
- ✅ Collapse useless groups
- ❌ NÃO ativar "Convert to path" (deixar `<rect>`/`<circle>` como elementos primitivos pra ficar mais legível)
- ❌ NÃO remover `viewBox`

Esperado: cada ícone fica em 200-800 caracteres.

---

## 4. Convenções OBRIGATÓRIAS

Critérios para o SVG ser aceito:

### 4.1 Atributos do `<svg>` raiz (já são adicionados pela `iconHTML`, NÃO repetir dentro da chave)

```
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="1.5"
stroke-linecap="round"
stroke-linejoin="round"
```

### 4.2 Cores

- **Sempre** `currentColor` (para herdar do parent — habilita troca de tema, hover, active state)
- **Permitido** `fill="currentColor" fill-opacity="0.1"` para áreas secundárias
- **Proibido** qualquer cor hexadecimal (`#fff`, `#d95f18`, `rgb(...)`, etc.)

### 4.3 Stroke

- Padrão: `1.5` (já no wrapper, não precisa repetir)
- Destaque (linha mais grossa para chamar atenção): `1.8` ou `2`
- Detalhe pequeno (linhas internas finas): `1` ou `1.2`

Quando precisar override, declarar no elemento:
```svg
<path d="..." stroke-width="2"/>     <!-- linha grossa -->
<line x1="..." stroke-width="1"/>    <!-- linha fina -->
```

### 4.4 Fill

- Padrão: `none` (já no wrapper)
- Quando usar fill: **só com `currentColor` + `fill-opacity` 0.08-0.20** para áreas de profundidade visual
- Quando declarar fill explícito (ex: pontinho sólido), também declarar `stroke="none"` para evitar borda dupla:
  ```svg
  <circle cx="12" cy="19" r="0.65" fill="currentColor" stroke="none"/>
  ```

### 4.5 Elementos permitidos

- ✅ `<path>`, `<rect>`, `<circle>`, `<line>`, `<polyline>`, `<ellipse>`
- ❌ `<g>` (não usar — atrapalha herança de stroke)
- ❌ `<defs>`, `<clipPath>`, `<mask>`, `<filter>`, `<linearGradient>`, `<radialGradient>`
- ❌ `<text>`, `<image>` (sem texto, sem bitmap dentro de SVG)

### 4.6 Tamanhos

Os SVGs precisam ficar legíveis em **16px** (sidebar inactive) e bonitos em **28px** (Spindle CNC hero card).

---

## 5. Como testar

### 5.1 Subir o servidor local

```bash
cd "/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2"
python3 -m http.server 8765
```

(Funciona em qualquer Python 3. Não precisa npm, não precisa Node.)

**Para testar troca de ícones use `preview.html`, não `panel.html`:**

| URL | Quando usar |
|-----|-------------|
| `http://localhost:8765/preview.html` | ✅ **Aqui você testa.** Simulador SketchUp com presets de tamanho (360/420/520/720/900) + modo tela cheia + sliders + toggle de tema |
| `http://localhost:8765/panel.html` | Plugin "puro" sem dev chrome — é o que vai entrar no HtmlDialog real do SketchUp |

**Atalhos do `preview.html`:**

| Tecla | Ação |
|-------|------|
| `1` `2` `3` `4` `5` | Presets de tamanho (360, 420, 520, 720, 900) |
| `F` | Toggle tela cheia |
| `R` | Reload do plugin (sem reload da página inteira) |
| `?` | Mostrar atalhos |
| Botão **🌓 Tema** no topo | Alterna entre claro e escuro do plugin (passa pra dentro do iframe) |

### 5.2 Os 5 estados visuais que cada ícone precisa passar

| # | Estado | Onde olhar | O que checar |
|---|--------|------------|--------------|
| 1 | **Sidebar inactive** (16px) | Coluna esquerda, qualquer tab que não está ativa | Silhueta reconhecível, bom contraste em cinza |
| 2 | **Sidebar active** (16px laranja) | Tab ativa (laranja) | Ícone fica laranja por causa do `currentColor` — não pode ter cor hardcoded |
| 3 | **Header da tab** (14px no quadradinho laranja claro) | Faixa logo abaixo da topbar, ao lado do nome do submenu | Boa leitura em fundo `#fff1e8` |
| 4 | **Empty state** (22px no círculo branco) | Centro da tela quando a tab não tem conteúdo (placeholder) | Detalhes precisam aparecer no tamanho maior |
| 5 | **Dark mode** | Pressionar `T` no teclado | Tudo que estava OK no claro deve continuar OK no escuro |

### 5.3 Como navegar pelas 9 tabs rapidamente

Atalhos de teclado:
- `1` → Projeto · `2` → Ambiente · `3` → Biblioteca · `4` → Internos · `5` → Acabamentos
- `6` → Ferragens · `7` → Usinagens · `8` → Validação · `0` → Produção
- `T` → toggle dark/light mode
- `⌘K` (Cmd/Ctrl+K) → Command Palette

### 5.4 Onde também o ícone aparece (não esquecer)

Alguns ícones aparecem em **mais de um lugar**. Após trocar, verifique todos:

| Ícone | Lugares onde aparece |
|-------|----------------------|
| Tab icons (10) | sidebar nav · header da tab · empty state placeholder |
| `usinagens` (Spindle CNC) | sidebar tab 7 · drawer Configurações Globais (item "Calibração CNC") |
| `paintbrush` | botão "Aplicar" da tab Acabamentos · ações em massa do Inspector |
| `lightbulb` | botão "Sugerir modulação" em Ambiente · drawer Configurações ("Tema e UX") |
| `layers` | botão "Filtros" em todos os headers · botão "Composição" no Inspector |

### 5.5 Checklist final antes do PR

Use `localhost:8765/preview.html` e siga em cada tamanho:

- [ ] Carregou `preview.html` sem erro no console (F12 → Console)
- [ ] **Em 360 × 720** (ultra-compacto): testou todas 9 tabs com `1`..`9`,`0`, sidebar de ícones legível
- [ ] **Em 420 × 760** (modo recomendado SketchUp): tudo respira, ícones grudam no laranja certo na tab ativa
- [ ] **Em 520 × 820**: submenu lateral aparece, ícones do sidebar continuam OK
- [ ] **Em 720 × 900**: nav expande pra 180px com labels, inspector aparece à direita
- [ ] **Em tela cheia (F)**: layout completo, nada explode
- [ ] **Dark mode (botão 🌓 Tema na topbar do simulador)**: tudo continua legível em todos os tamanhos
- [ ] Abriu Configurações Globais (`⌘,` dentro do iframe) — ícones internos OK
- [ ] Abriu Composição: ⌘K → digitar "simular" → Enter → tecla `E` → ícones OK
- [ ] Abriu Command Palette (`⌘K`) — todos os 9 tabs aparecem com ícone
- [ ] Anexou no PR: 1 screenshot 420×760, 1 screenshot tela cheia, 1 dark mode

---

## 6. Comandos úteis

### Subir servidor
```bash
cd "/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2"
python3 -m http.server 8765
```

### Parar servidor
```bash
lsof -ti :8765 | xargs kill
```

### Ver mudanças no icons.js antes de commitar
```bash
cd /Users/madeira/SISTEMA\ NOVO/ornato-plugin
git diff ornato_sketchup/ui/v2/icons.js
```

### Rollback se quebrou tudo
```bash
git checkout ornato_sketchup/ui/v2/icons.js
```

### Reduzir tamanho dos SVGs em batch (se vier muito gordo)
```bash
# instalar uma vez
npm install -g svgo

# rodar na pasta dos SVGs originais
svgo --recursive --quiet pasta-com-svgs/
```

---

## 7. Cenários comuns + exemplos de código

### Cenário 1 — Trocar um ícone simples

**Antes:**
```js
detalhes: `
  <rect x="5" y="4.75" width="14" height="15.75" rx="2"/>
  <path d="M12.1 10.65h3.8"/>
`,
```

**Designer mandou:**
```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <rect x="6" y="3" width="13" height="18" rx="2"/>
  <line x1="9" y1="9" x2="16" y2="9"/>
</svg>
```

**Depois (no `icons.js`):**
```js
detalhes: `
  <rect x="6" y="3" width="13" height="18" rx="2"/>
  <line x1="9" y1="9" x2="16" y2="9"/>
`,
```

### Cenário 2 — Designer mandou SVG com cor hardcoded

**Recebido:**
```html
<svg viewBox="0 0 24 24">
  <rect x="5" y="4" width="14" height="16" stroke="#d95f18" stroke-width="2" fill="#fff1e8"/>
</svg>
```

**Você precisa converter:**
```js
detalhes: `
  <rect x="5" y="4" width="14" height="16" stroke="currentColor" stroke-width="2"
        fill="currentColor" fill-opacity="0.1"/>
`,
```

> Nota: `fill="#fff1e8"` (laranja muito claro) virou `fill-opacity="0.1"` — aproxima o efeito sem hardcodear cor.

### Cenário 3 — Adicionar um ícone NOVO (raro)

Se a equipe quiser adicionar um ícone que ainda não existe (ex: `cloud-sync`):

**Passo 1.** Adicionar a chave em `icons.js`:
```js
'cloud-sync': `
  <path d="M17 6.1a5 5 0 0 0-9.7 1.5..."/>
  ...
`,
```

**Passo 2.** Usar onde precisa (em `app.js` ou tabs):
```js
${iconHTML('cloud-sync', 16)}
```

### Cenário 4 — Atualizar SVG inline do `panel.html` (4 botões da topbar)

A topbar tem 4 SVGs **inline** (não passam pelo `iconHTML`):
- `#btnRefresh` (refresh do projeto SketchUp)
- `#btnFocus` (entrar em modo foco)
- `#btnConfig` (engrenagem)
- `#btnSearch` (lupa)

Para trocar, abrir `panel.html`, achar o `<button id="btnXxx">` e substituir o `<svg>` filho. **Manter** os atributos `viewBox`, `fill`, `stroke`, etc. — só trocar os paths internos.

---

## 8. Troubleshooting

### Ícone não aparece (vazio)
- Conferir se o nome da chave está exato (`detalhes`, não `Detalhes` nem `detalhe`)
- Conferir se não tem aspas/backticks faltando ao redor da string
- Abrir DevTools → Console: tem erro de sintaxe JS?

### Ícone aparece preto em vez de laranja na tab ativa
- **Causa:** SVG tem cor hardcoded (ex: `stroke="#000"`)
- **Solução:** trocar todas as cores por `currentColor`

### Ícone fica grande demais ou pequeno demais
- **Causa:** viewBox errado (designer entregou com `viewBox="0 0 32 32"`)
- **Solução:** redesenhar pra `viewBox="0 0 24 24"` ou ajustar coordenadas proporcionalmente
- **Atalho:** abrir o SVG num editor (Figma/Illustrator), redimensionar canvas para 24×24, exportar de novo

### Dark mode quebrou
- **Causa:** alguma cor hardcoded escondida
- **Solução:** buscar no SVG por `#`, `rgb(`, `hsl(` — substituir tudo por `currentColor`

### Borda dupla no ícone
- **Causa:** elemento tem `fill` E `stroke`
- **Solução:** se quiser área preenchida sem borda → `fill="currentColor" stroke="none"`. Se quiser linha sem preenchimento → `fill="none" stroke="currentColor"`.

### Servidor `localhost:8765` não responde
- **Causa:** servidor caiu
- **Solução:**
  ```bash
  lsof -ti :8765 | xargs kill 2>/dev/null
  cd "/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2"
  python3 -m http.server 8765
  ```

### Mudei o arquivo mas o navegador mostra a versão antiga
- **Causa:** cache do navegador
- **Solução:** Cmd+Shift+R (macOS) ou Ctrl+F5 (Windows) para hard reload

---

## 9. Workflow de PR sugerido

```bash
# 1. Branch
cd /Users/madeira/SISTEMA\ NOVO/ornato-plugin
git checkout -b feature/icons-update-2026-q2

# 2. Trabalhar (trocar SVGs)
# ... edita icons.js ...

# 3. Testar (servidor + checklist da seção 5)

# 4. Commit
git add ornato_sketchup/ui/v2/icons.js
git add ornato_sketchup/ui/v2/panel.html  # se mexeu nos 4 SVGs inline
git commit -m "icons: substitui 11 SVGs com versão final dos designers

- Logo brand redesenhada
- 9 tab icons custom (Projeto, Ambiente, Biblioteca, Internos,
  Acabamentos, Ferragens, Usinagens [Spindle CNC], Validação, Produção)
- Logo refinada com 3 linhas internas
- Todos seguem padrão Ornato (1.5px stroke, viewBox 24x24, currentColor)

Validado nos 5 estados visuais:
- sidebar inactive (16px)
- sidebar active laranja (16px)
- header da tab (14px)
- empty state (22px)
- dark mode (toggle T)

Refs: BRIEF_ICONES_DESIGNERS.md
"

# 5. Push e abrir PR
git push origin feature/icons-update-2026-q2
```

**No PR, anexar:**
- 1 screenshot tela cheia (>= 1280×720) modo claro
- 1 screenshot janela 420×760 (modo SketchUp dock)
- 1 screenshot dark mode
- 1 GIF curto navegando pelas 9 tabs com `1`..`9`,`0` (opcional)

---

## 10. FAQ

**P: Posso usar Tailwind/CSS classes nos SVGs?**
R: Não. SVGs são puros (path, rect, etc.) e herdam cor via `currentColor`. Estilo via CSS está fora do SVG.

**P: O designer pode usar `<g>` para agrupar?**
R: **Evite.** Funciona, mas confunde herança de stroke-width. Se ele usar e funcionar bem, ok manter; se quebrar, achatar removendo o `<g>`.

**P: O `viewBox` precisa ser exatamente `0 0 24 24`?**
R: Sim. A função `iconHTML` força `viewBox="0 0 24 24"` no wrapper. Coordenadas no path têm que respeitar essa escala.

**P: Tem como ver todos os ícones num "showcase" antes de testar tab por tab?**
R: Não temos showcase ainda. Se quiser, adiciona um arquivo `_test_icons.html` na pasta `ui/v2/` que importa `icons.js` e renderiza todos em grade. Pode commitar como bonus.

**P: Posso usar emojis no lugar de SVG?**
R: **Não.** Emojis dependem da fonte do SO, não escalam direito, não respeitam tema, e ficam ridículos em UI técnica.

**P: Mudei só uma cor do tema (light/dark) e os ícones quebraram. Por quê?**
R: Provavelmente algum SVG tem `fill="#000"` ou similar hardcoded. Procura por `#` em `icons.js` e substitui por `currentColor`.

**P: Como adicionar um ícone que precisa de DUAS cores (ex: ícone bicolor)?**
R: Não suportado nesse design system. Se for absolutamente necessário, conversar com o tech lead. Workaround simples: usar `currentColor` no stroke e `currentColor` + `fill-opacity` no fill (uma cor com 2 intensidades).

---

## 11. Contatos

| Pessoa | Função | Quando acionar |
|--------|--------|----------------|
| Tech lead do plugin | Revisão técnica do PR | Sempre — exigir review |
| Designer dos ícones | Dúvidas conceituais | Se um SVG não couber visualmente em 16px |
| Product owner | Decisões de escopo | Adicionar/remover ícones do conjunto |

**Documentos relacionados:**
- `BRIEF_ICONES_DESIGNERS.md` — contexto conceitual e princípios visuais
- `PLANO_MELHORIA_2025.md` — visão geral do roadmap do plugin
- `ornato_sketchup/ui/v2/README.md` — referência rápida da arquitetura da UI

---

*Documento criado em 09/05/2026. Atualizar se a estrutura do `icons.js` mudar (ex: migração para Preact build com sprite SVG).*
