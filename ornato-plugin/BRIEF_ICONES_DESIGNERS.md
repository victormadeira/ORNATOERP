# Brief para equipe de design — Ícones do Plugin SketchUp Ornato

> **Escopo:** apenas ícones do **plugin SketchUp** (UI dentro do HtmlDialog), não inclui ícones do ERP web.
> **Versão atual:** rascunhos minha autoria estão em `ornato_sketchup/ui/v2/icons.js` — servem só como **ponto de partida**, esperamos substituição/refinamento profissional.

---

## 1. Sobre o produto

O Ornato é um plugin para SketchUp que ajuda marceneiros e projetistas a:

- modelar móveis planejados em 3D dentro do SketchUp
- detectar peças, junções e usinagens automaticamente
- exportar dados para o ERP Ornato (que cuida de produção, etiquetas, plano de corte, orçamento, portal do cliente, etc.)

**O plugin é a etapa de DESENHO + INTELIGÊNCIA TÉCNICA.** É a ferramenta do projetista — não do vendedor, não do montador. Tudo que ele faz é gerar dados perfeitos para o ERP fazer o resto.

A jornada do projetista no plugin é estruturada em **9 tabs** que funcionam como uma trilha:

```
Projeto → Ambiente → Biblioteca → Internos → Acabamentos →
Ferragens → Usinagens → Validação → Produção
```

Cada uma dessas tabs precisa de um ícone que **comunique sua função em um único glance**, mesmo em 16px. O usuário vai trocar de tab dezenas de vezes por dia — os ícones precisam ser *imediatamente reconhecíveis*.

---

## 2. Princípios visuais

### 2.1 Estilo geral
- **Line icons** com stroke (não filled completo, exceto detalhes pontuais com fill 10-15% para profundidade)
- **Estética Linear / Notion / Lucide** — limpo, geométrico, coeso
- **Marcenaria-friendly mas moderno** — referência ao mundo da madeira sem ficar caricato (nada de serrote estilizado tipo logo de marcenaria de bairro)
- **Distintivo entre si** — cada um precisa ser visualmente diferente o suficiente pra não confundir mesmo em 16px

### 2.2 Especificações técnicas

| Item | Valor |
|------|-------|
| Formato | SVG inline (vai pro código JavaScript) |
| viewBox | `0 0 24 24` (padrão Lucide) |
| Stroke | `1.5px` para a maioria · `1.8px` para destaques · `1px` para detalhes pequenos |
| `stroke-linecap` | `round` |
| `stroke-linejoin` | `round` |
| Cor | `currentColor` (herda do parent — alterna conforme tema/estado) |
| Fill | Geralmente `none`. Quando usado, opacity entre `0.1` e `0.2` para áreas secundárias |
| Tamanhos onde aparece | **16px** (sidebar nav inativa), **20px** (active), **22px** (empty states), **28px** (cards de destaque tipo Spindle CNC hero) |

### 2.3 Cores (por contexto, controladas via CSS)

```css
/* O ícone HERDA cor do parent. Os tons abaixo são onde ele aparece, não são pintados no SVG. */
--text-mute:  #94a3b8  /* sidebar inativa */
--text-2:     #334155  /* hover */
--accent:     #d95f18  /* tab ativa (laranja Ornato) */
--text-3:     #94a3b8  /* topbar utility buttons */
```

### 2.4 O que evitar

- ❌ Pixel art ou estilo 8-bit
- ❌ Ícones com texto embutido (letras dentro)
- ❌ Cores hardcoded no SVG (sempre `currentColor`)
- ❌ Sombras, gradientes ou efeitos 3D
- ❌ Estilo Material Design Filled (muito pesado pra densidade do plugin)
- ❌ Ícones genéricos demais (folder padrão pra "Projeto" não passa o conceito específico)
- ❌ Detalhes que somem em 16px (testar legibilidade nesse tamanho é obrigatório)

---

## 3. Lista de ícones — 10 tab icons + 1 logo

### 3.1 Logo / brand mark
**Aparece em:** topbar (28px, dentro de quadradinho preto com fundo `#1a1f29`, ícone laranja `#d95f18`)

**Conceito proposto:** letra "O" estilizada com 3 linhas internas horizontais sugerindo prateleiras / chapas empilhadas / ranhuras de marcenaria.

**O que comunicar:** marca premium de marcenaria moderna; remete a arquitetura, geometria, precisão.

**Referências:** wordmarks de Linear, Notion, Vercel — formas geométricas simples, fáceis de reconhecer em 16-32px.

**Não deve parecer:** logotipo de marcenaria tradicional (serrotes, pinheiros, ferramentas).

---

### 3.2 `detalhes` — tab "Projeto"
**Função:** dados do projeto/cliente — nome do cliente, ambiente, medidas, observações, anexos.

**Conceito atual:** prancheta com clip no topo, contorno fino, com pontinhos representando linhas de informação e um lápis na lateral inferior direita (como em um documento sendo preenchido).

**O que comunicar:** "informação do projeto", "ficha técnica", "briefing".

**Referência:** estilo `clipboard-list` do Lucide, mas com uma identificação clara que é **dados de projeto**, não tarefas genéricas.

**Cuidados:** não pode parecer só "lista de tarefas" — precisa transmitir "dossiê do cliente".

---

### 3.3 `ambiente` — tab "Ambiente"
**Função:** modelagem do espaço onde o móvel vai (paredes, piso, teto, janelas, portas, tomadas, vigas).

**Conceito atual:** planta baixa em L com janela representada por tracejado, indicando a vista de cima de um cômodo.

**O que comunicar:** "espaço físico", "planta baixa", "cômodo", "obra".

**Referência:** ícones de `floor-plan` ou `room-layout` mas **mais geométrico e menos arquitetônico carregado**. Lembra os cantos de paredes desenhados em planta.

**Cuidados:** não confundir com "biblioteca" (que também é uma estrutura quadrada). Aqui o conceito é **espaço vazio onde móvel vai entrar**.

---

### 3.4 `biblioteca` — tab "Biblioteca"
**Função:** galeria de módulos paramétricos prontos (cozinhas, dormitórios, banheiros, etc.) — o usuário arrasta dali para o modelo SketchUp.

**Conceito atual:** parece uma estante com módulos empilhados em prateleiras, separados por divisórias.

**O que comunicar:** "catálogo de móveis", "estoque de modelos", "biblioteca técnica", "showroom".

**Referência:** estante de marcenaria; ou uma grade 2x2 de módulos empilhados como livros numa biblioteca.

**Cuidados:** não pode ser apenas uma "grade" genérica (tipo dashboard) — precisa lembrar que **são móveis sendo guardados/exibidos** num catálogo. Diferenciar visualmente de `internos` (que também tem prateleiras dentro).

---

### 3.5 `internos` — tab "Internos"
**Função:** componentes que vão DENTRO do módulo — gavetas, prateleiras, portas internas, divisórias, cestos, cabideiros.

**Conceito atual:** armário aberto visto de frente, com 2 colunas de gavetas/portas internas, mostrando o **interior** de um móvel.

**O que comunicar:** "anatomia interna do móvel", "o que tem dentro da caixa".

**Referência:** vista frontal de um armário/gabinete aberto com componentes visíveis.

**Cuidados:**
- Não confundir com `biblioteca` (que mostra módulos inteiros como produtos prontos).
- A diferença visual chave: `internos` deve sugerir uma **caixa aberta vista por dentro** (perspectiva de quem montou e abriu), `biblioteca` deve sugerir **módulos fechados em catálogo**.

---

### 3.6 `acabamentos` — tab "Acabamentos"
**Função:** materiais aplicados nas peças — MDF, laminados, vidros, metais, fitas de borda, texturas.

**Conceito atual:** balde de tinta com swatches de cores ondulando para fora, e um pincel ao lado.

**O que comunicar:** "cores e materiais", "texturas", "superfície".

**Referências aceitáveis:**
- pequena palette de pintor com swatches
- 3 amostras de chapa/laminado empilhadas com ângulos diferentes
- gota de tinta com swatch atrás

**Cuidados:**
- Evitar ícone de pincel padrão — está muito associado a "edição genérica" no software.
- Marcenaria usa muito laminado e vidro: o conceito de "swatch retangular" pode funcionar melhor que "tinta líquida" para esse universo.

---

### 3.7 `ferragens` — tab "Ferragens"
**Função:** dobradiças, corrediças, puxadores, pés, dispositivos. Componentes metálicos que conectam/movem peças.

**Conceito atual:** dobradiça aberta com 4 parafusos visíveis (2 em cada aba), com um símbolo de movimento embaixo.

**O que comunicar:** "ferragem física", "componente que une", "metal", "movimento mecânico".

**Referências:**
- dobradiça vista de frente, ligeiramente aberta (mostrando o pivô)
- corrediça telescópica (3 barras paralelas com setas indicando deslizamento)
- mistura: parte de dobradiça + parafuso, sugerindo "mundo das ferragens"

**Cuidados:**
- NÃO usar chave inglesa/wrench — confunde com "configurações" ou "manutenção".
- Diferenciar de `usinagens` (que também tem componentes mecânicos, mas é sobre o **trabalho na peça**, não o **componente em si**).

---

### 3.8 `usinagens` — tab "Usinagens" ⭐ (PRIORIDADE)
**Função:** detecção e configuração de furação, rebaixos, encaixes, cavilhas, rasgos, operações CNC. **Esta tab é o coração técnico do plugin.**

**Conceito atual:** Spindle CNC visto de frente — cabeçote retangular com aletas de refrigeração, mandril cônico, fresa cilíndrica com marcas helicoidais e elipse na base sugerindo material sendo usinado.

**O que comunicar:** "máquina CNC", "usinagem real de fábrica", "precisão industrial", "ponta de fresa girando".

**Por que importa:** o usuário **deve sentir** ao olhar este ícone que está entrando no domínio técnico/industrial. É onde o plugin gera o que vai pra máquina.

**Referências:**
- spindle CNC vertical (referência clássica)
- broca/fresa em ângulo descendendo numa peça
- cabeçote de fresadora com cone ISO/HSK
- pode misturar: spindle + ponto laranja na ponta sugerindo "operação ativa"

**Cuidados:**
- Não usar broca de furadeira manual (Drill genérico do Lucide) — passa imagem amadora.
- Detalhes helicoidais da fresa devem aparecer mesmo em 16px (testar!) ou pode ser substituído por marcas mais simples nesse tamanho.

---

### 3.9 `validacao` — tab "Validação"
**Função:** checagem pré-export. Plugin varre o modelo procurando inconsistências (peça sem material, furação conflitante, módulo sem usinagem, etc.) antes de mandar pro ERP.

**Conceito atual:** escudo com checkmark grande no centro.

**O que comunicar:** "verificação aprovada", "controle de qualidade", "barreira que impede erros".

**Referência:** `shield-check` clássico do Lucide.

**Cuidados:**
- O check deve ser o protagonista (espesso, claro). O escudo é o suporte.
- Diferenciar visualmente de `producao` (que também sugere "pronto"). Aqui é "verificação técnica passou", lá é "máquina trabalhando".

---

### 3.10 `producao` — tab "Produção"
**Função:** envio do projeto ao ERP Ornato + visualização do status que volta da fábrica (em fila, cortando, montando, pronto). **Aqui o plugin não produz nada — ele só "entrega" pro ERP e mostra o que está acontecendo.**

**Conceito atual:** serra circular industrial vista de frente, com dentes ao redor, suporte em baixo e linha de chão.

**O que comunicar:** "fábrica", "produção em andamento", "máquina trabalhando", "envio para o chão de fábrica".

**Referências:**
- serra circular profissional (atual)
- esteira transportadora com peças
- ponto de produção / engrenagem industrial (mas não a engrenagem padrão de "settings")
- carrinho de fábrica com peças

**Cuidados:**
- NÃO usar martelo (Hammer) — passa imagem de marcenaria artesanal/manual; queremos comunicar **fábrica industrial conectada**.
- Diferenciar de `usinagens` (que é a operação técnica detalhada de uma peça) — aqui é a **macro de produção**, processo todo.

---

## 4. Ícones utilitários (Lucide-style — manter como estão)

Não precisa redesenhar, mas confirmar que os SVGs estão coerentes com o resto:

| Nome | Onde aparece | Manter? |
|------|-------------|---------|
| `chevron-right`, `chevron-down`, `chevron-left` | Breadcrumbs, dropdowns, status bar | ✅ padrão Lucide |
| `panel-left-open`, `panel-left-close`, `panel-right-close` | Toggles de sidebar/inspector | ✅ padrão |
| `mouse-pointer` | Status bar (seleção do SketchUp) | ✅ padrão |
| `alert-triangle` | Status bar (chip de conflitos) | ✅ padrão |
| `plus`, `pencil`, `download`, `send` | Ações primárias | ✅ padrão |
| `minimize` | Sair do Modo Foco | ✅ padrão |
| `layers` | Botão "Filtros" no header de cada tab | ✅ padrão |
| `check-circle` | Aprovação genérica em UI | ✅ padrão |
| `paintbrush` | Ação primária Acabamentos | ⚠️ revisar (atualmente padrão Lucide; pode ganhar variante mais "marcenaria") |
| `lightbulb` | Botão "Sugerir modulação" em Ambiente | ✅ padrão |
| `settings` | Engrenagem na topbar (Configurações Globais) | ✅ padrão |

**Sobre `settings`:** importante ficar visualmente DIFERENTE de qualquer ícone de tab pra não confundir. Como engrenagem é universal, manter clássica.

---

## 5. Estados visuais que cada tab icon precisa funcionar

Cada um dos 10 tab icons (3.2 a 3.10) precisa ficar legível e bonito em **5 estados**:

| Estado | Background | Ícone | Tamanho típico |
|--------|------------|-------|----------------|
| Sidebar inativa | `#fafbfc` (claro) ou `#1a1f29` (dark) | `#94a3b8` | 16px |
| Sidebar hover | `#fff` ou `#232a36` | `#1a1f29` ou `#f1f5f9` | 16px |
| Sidebar ativa | `#fff` (claro) | `#d95f18` (laranja) | 16px |
| Header da tab (quadradinho à esquerda) | `#fff1e8` (laranja claro) | `#d95f18` | 14px (em wrapper 28px) |
| Empty state (centro da tela) | `#fff` (claro) ou `#1a1f29` (dark) | `#d95f18` | 22px (em wrapper 48px) |

**Ação de design:** testar cada SVG em 16px no Figma com background neutro e ver se a silhueta fica reconhecível.

---

## 6. Entregáveis esperados

1. **SVGs otimizados** (sem `<style>`, sem cores hardcoded, sem `<g>` desnecessários — o mais limpo possível pra inline em JS).
2. **Cada ícone em 4 tamanhos:** 16px, 20px, 24px, 28px. Conferir se em 16px ainda é legível ou se precisa de variante simplificada.
3. **Pictograma do logo Ornato** em PNG/SVG vetorial — máximo 32×32 cabe no quadradinho da topbar; deve funcionar em monocromático laranja sobre preto.
4. **Documento curto** (1 parágrafo por ícone) explicando a decisão visual final, pra equipe de produto referenciar quando alguém pedir mudança.

**Formato dos SVGs entregáveis:**
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- paths aqui -->
</svg>
```

Vai entrar direto no `icons.js` do plugin.

---

## 7. Tom geral / personalidade

A linguagem visual do Ornato é:

- **Técnica mas acessível** — projetista profissional, mas não engenheiro mecânico
- **Premium minimalista** — a UI "respira", os ícones acompanham
- **Identidade brasileira de marcenaria moderna** — sem ser regionalista; mais "estúdio de design" do que "loja de planejados"
- **Confiante** — o usuário sabe que o plugin entende de produção real (Spindle, Validação, Ferragens precisam transmitir isso)

Inspirações próximas:
- Linear (rigor, contraste, motion)
- Figma (densidade de informação organizada)
- Vercel (minimalismo + sofisticação)

Inspirações a evitar:
- Material Design 3 colorido demais
- Ícones de "casa e construção" genéricos do mercado de planejados antigo (Promob, Gabster) — queremos ser distintos disso

---

## 8. Como vamos validar

Quando os ícones chegarem, validamos em 4 passos:

1. **Print do plugin com ícones novos** em 3 estados: tela cheia, janela 420px, dark mode
2. **Teste de reconhecimento** com 5 marceneiros — eles dizem "para que serve essa tab?" só olhando o ícone
3. **Comparativo lado-a-lado** com Promob/Gabster/DinaBox — temos que parecer mais profissional, não menos
4. **Ajuste fino** se algum não passar nos 3 acima

---

## 9. Prazo sugerido

- Brief recebido + dúvidas: **1 dia**
- 1ª rodada de propostas (esboços de todos os 10): **3-5 dias**
- Iteração + finalização SVGs: **2-3 dias**
- **Total esperado: 1 a 2 semanas** corridas

---

## 10. Contato técnico

Para dúvidas sobre integração no código:
- Arquivo onde os SVGs entram: `ornato_sketchup/ui/v2/icons.js`
- Função que renderiza: `iconHTML(name, size)` em `app.js`
- Para validar visualmente os ícones nos vários tamanhos:
  ```bash
  cd "/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2"
  python3 -m http.server 8765
  ```
  e abrir **`http://localhost:8765/preview.html`** — simulador com presets 360/420/520/720/900 e tela cheia. Aperte `1`-`5` no teclado para alternar tamanhos rapidamente, `F` para tela cheia, `R` para recarregar.

---

*Documento gerado em 09/05/2026. Ícones atuais (autoria interna) servem só como ponto de partida — esperamos substituição/refinamento profissional pelos designers.*
