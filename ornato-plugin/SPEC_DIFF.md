# SPEC_DIFF — Auditoria de specs antigas vs PLANO_MELHORIA_2025

> **Documento gerado por agent de auditoria.**
> **Data:** 09/05/2026
> **Escopo:** comparar todo material em `ornato-plugin/docs/` + `SISTEMA SKETCHUP/*.md` contra `PLANO_MELHORIA_2025.md` e classificar cada arquivo (manter / ajustar / revisar / arquivar / criar).
> **Regra de ouro do novo plano:** *Plugin = MODELAGEM + DETECÇÃO + EXPORT. ERP = tudo o resto. Handshake = UPM JSON.*

---

## 0. Resumo executivo

### Quantitativo

| Total de specs auditadas | 14 |
|---|---|
| Em `ornato-plugin/docs/` | 8 numeradas (01–11 + 12) + `MANUAL.md` + `GUIA_COMPONENTES.md` = **14** |
| Em `SISTEMA SKETCHUP/` | `SPEC_PLUGIN_ORNATO.md`, `MANUAL_COMPONENTES_ORNATO.md`, `MANUAL_DESENVOLVIMENTO_ORNATO.md`, `PLANEJAMENTO_ORNATO.md`, `ANALISE_UPMOBB.md`, `UI_DESIGN_BRIEF.md` = **6** |
| **TOTAL** | **20 documentos** |

### Classificação

| Categoria | Quantidade | Documentos |
|---|---:|---|
| **A. Manter como estão** | 4 | `01_VISAO_GERAL`, `02_HIERARQUIA_MODELO`, `03_NOMENCLATURA`, `04_SISTEMA_COLISAO` |
| **B. Ajustes pequenos** | 5 | `05_MATRIZ_USINAGENS`, `06_CATALOGO_FERRAMENTAS`, `07_CONFIGURACAO_REGRAS`, `08_MATERIAIS_BORDAS`, `09_EXPORTACAO_JSON` |
| **C. Revisão profunda** | 4 | `10_EXEMPLOS_PRATICOS`, `11_FUNCIONALIDADES_AVANCADAS`, `12_COMPONENTES_DINAMICOS`, `MANUAL.md` |
| **D. Arquivar** | 5 | `GUIA_COMPONENTES.md`, `SPEC_PLUGIN_ORNATO.md`, `MANUAL_COMPONENTES_ORNATO.md`, `MANUAL_DESENVOLVIMENTO_ORNATO.md`, `PLANEJAMENTO_ORNATO.md`, `ANALISE_UPMOBB.md` (6) |
| **E. Criar novos** | 4+ | `13_INTEGRACAO_ERP`, `14_UX_GUIDELINES`, `15_COMPOSICAO_CONTEXTUAL`, `16_VALIDACAO_VISUAL` (e mais) |
| Em revisão à parte | 1 | `UI_DESIGN_BRIEF.md` (incorporar em `14_UX_GUIDELINES`) |

> Nota: `GUIA_COMPONENTES.md` é versão prévia em conteúdo do `12_COMPONENTES_DINAMICOS.md` — vai pra arquivamento.

### Top 3 mudanças prioritárias

1. **Excisar do plugin todo conteúdo de produção/orçamento/etiquetas/preço.** Hoje várias specs falam em "etiquetas inteligentes", "plano de corte local", "modo apresentação cliente", "precificação em tempo real", "roteiro de produção" — tudo isso agora é responsabilidade explícita do **ERP Ornato**. Plugin entrega JSON, ERP processa. A spec mais agressiva (`PLANEJAMENTO_ORNATO.md`) precisa ser arquivada por inteiro porque foi escrita ANTES da existência do `PortalCliente.jsx`, `PlanoCorte.jsx`, `nesting-engine.js` e da `Industrializacao.jsx`.
2. **Substituir o paradigma de UI da spec antiga (4 HtmlDialogs flutuantes / `UI_DESIGN_BRIEF.md` v1) pelo novo padrão de painel único com 9 tabs + drawer de Configurações + ⌘K + Modo Foco + Composição contextual.** Isso exige criar `14_UX_GUIDELINES.md` e `15_COMPOSICAO_CONTEXTUAL.md`.
3. **Formalizar o handshake plugin↔ERP em `13_INTEGRACAO_ERP.md`** — endpoints, schema UPM JSON canônico, sync de catálogo (read-only do ERP no plugin), status de produção read-only no plugin. Hoje isso está disperso em `09_EXPORTACAO_JSON.md` (formato), `SPEC_PLUGIN_ORNATO.md §5` (endpoints) e nada cobre o sync.

---

## A. Specs que continuam válidas (manter como estão)

Documentos que descrevem **mecânica de modelagem e detecção** — exatamente o escopo que sobrou pro plugin no novo plano.

| Arquivo | Resumo | Por que mantém |
|---|---|---|
| `docs/01_VISAO_GERAL.md` | Visão de "modela peças sólidas, plugin calcula furação automaticamente". Define o fluxo `MODELAGEM → ANALISE → FURACAO → EXPORTACAO`. | Esse é exatamente o discurso do novo plano. O princípio fundamental ("o modelador não desenha furos") continua intacto. |
| `docs/02_HIERARQUIA_MODELO.md` | Define hierarquia de 3 níveis Modelo > Módulo > Peça com prefixo `ORN_`. | A hierarquia continua igual no novo plano. Não há nada que conflite. |
| `docs/03_NOMENCLATURA.md` | Tabela completa de códigos `ORN_*` (módulos) e `LAT_ESQ`, `BASE`, `POR_ESQ`, etc. (peças). Inclui compat UPMobb (`CM_*`). | Nomenclatura é fundação da detecção. Manter. |
| `docs/04_SISTEMA_COLISAO.md` | Algoritmo de detecção FACE+EDGE → BUTT, FACE+FACE → OVERLAY, EDGE+EDGE → MITER, dado por offset. Tolerâncias. | Coração técnico do plugin. O novo plano reforça "detecção automática" como pilar. Manter integralmente. |

**Ação recomendada:** apenas adicionar uma nota de versão no topo de cada um indicando *"Spec validada para Plano Melhoria 2025-2026, plugin = modelagem+detecção+export."*

---

## B. Specs que precisam de pequenos ajustes

Documentos válidos no escopo, mas com terminologia/alcance precisando alinhamento.

### B.1 `docs/05_MATRIZ_USINAGENS.md`

- **Status:** núcleo correto.
- **Ajustes:**
  - Adicionar nota no topo: *"Esta matriz é gerada pelo plugin e enviada ao ERP via UPM JSON. O plugin não decide ordem de execução nem otimização — isso é responsabilidade do `nesting-engine.js` no ERP."*
  - Verificar se a contagem hoje (8 regras) bate com o que o plano cita. O plano fala em "**14 regras**" (citando `11_FUNCIONALIDADES_AVANCADAS.md`) e em outro lugar "**8 regras**" (na seção "Estado atual"). Resolver esse conflito: se o `RulesEngine` real tem 14, atualizar a tabela aqui também.
  - O documento usa "Ordem de execução" implicitamente — remover qualquer linguagem que sugira que o plugin organiza por ordem CNC. Isso é do ERP.

### B.2 `docs/06_CATALOGO_FERRAMENTAS.md`

- **Status:** referência técnica útil.
- **Ajustes:**
  - Seção *"Mapeamento ferramenta → código CNC"* (Biesse/SCM/Homag) deve ser **movida para o ERP** — quem traduz código Ornato genérico para pós-processador específico é o ERP (já tem `ProducaoCNC` e webhooks). Aqui pode ficar uma lista canônica dos códigos genéricos sem o mapeamento por marca.
  - Trecho a remover/relocar:
    > *"O mapeamento e configuravel na aba Configuracoes do plugin, secao 'Ferramentas CNC'."*  
    Substituir por: *"Mapeamento por marca de máquina é feito no ERP Ornato (módulo Produção CNC). O plugin sempre exporta códigos canônicos Ornato."*

### B.3 `docs/07_CONFIGURACAO_REGRAS.md`

- **Status:** pertinente.
- **Ajustes:**
  - O documento descreve "aba Configurações do plugin" como tela. No novo plano, configurações ficam no **drawer da engrenagem da topbar (8 seções)**. Renomear referências.
  - Hierarquia de overrides (peça > módulo > exclusões > matriz > global) está correta — manter.
  - Adicionar referência cruzada para o novo `14_UX_GUIDELINES.md` na parte de UI.

### B.4 `docs/08_MATERIAIS_BORDAS.md`

- **Status:** spec técnica boa.
- **Ajustes:**
  - Trecho problemático:
    > *"O plugin pode aplicar bordas automaticamente com base no papel da peca…"*  
    Manter — isso continua sendo do plugin (parte da modelagem).
  - **Mas adicionar:** *"O catálogo real de cores/códigos/preços de chapas e fitas vem do ERP via `Cat.jsx` (rota `/api/catalogo`). O plugin é consumidor, não fonte."*
  - Remover qualquer menção a "preço" se houver — já mapeado em `MaterialCatalog` no `11_FUNCIONALIDADES_AVANCADAS.md`, que vai ser revisado em C.

### B.5 `docs/09_EXPORTACAO_JSON.md`

- **Status:** crítico — é o handshake.
- **Ajustes:**
  - Renomear para refletir que **este é o contrato canônico UPM JSON**. Sugestão de header: *"Schema UPM JSON — contrato Plugin↔ERP. Validado em `server/routes/cnc.js`."*
  - Acrescentar, no fim, uma seção *"Onde o ERP recebe esse JSON"* listando os endpoints de destino.
  - Adicionar campo `validation_state` no envelope raiz (ver `16_VALIDACAO_VISUAL` proposto em E) — o JSON deve trazer flag `blocked|warning|clean` pra o ERP saber se aceita.
  - Atualizar `plugin_version` example pra refletir que o plugin será 1.0.0+ depois da Fase 1.

---

## C. Specs que precisam de revisão profunda

Documentos cujo escopo conceitual mudou — alguns ainda úteis em parte, outros falam de coisas que agora são do ERP.

### C.1 `docs/10_EXEMPLOS_PRATICOS.md`

- **O que muda:** os exemplos são bons (balcão simples, armário com prateleiras regulares), mas todos foram escritos no contexto de "modelar manualmente no SketchUp". O novo plano introduz **galeria paramétrica robusta (50+ módulos)** + **construtor in-SketchUp polido** + **drag-and-place**. Os exemplos práticos precisam refletir o novo fluxo: usuário arrasta da galeria, ajusta no Inspector, plugin gera tudo.
- **Ação:** reescrever cada exemplo com 2 versões — *"caminho A: galeria + Inspector"* e *"caminho B: modelagem manual"*. Adicionar pelo menos 2 exemplos novos: aéreo escorredor (paramétrico) e torre forno (paramétrica + ferragens reais 3D).
- **Remover:** qualquer exemplo que termine em "agora gere a etiqueta no plugin" — etiqueta é ERP.

### C.2 `docs/11_FUNCIONALIDADES_AVANCADAS.md`

- **O que muda:** este é o documento mais misturado. Tem coisas que continuam (SmartAdvisor, validações 1–20, leitura de DC) e coisas que agora são duplicação do ERP:
  - *"Integracao com otimizador de corte"* → **REMOVER**. Plugin não chama otimizador. Plugin envia JSON; otimizador roda no ERP (`nesting-engine.js`).
  - *"Catalogo de materiais → MaterialCatalog → calcula custos"* → **REMOVER**. Catálogo de preço é do ERP. Plugin pode mostrar preço *consultado*, mas não calcula.
  - *"Processamento em lote"* → **MANTER** (é apenas processar todos os módulos do .skp).
  - *"Regras de hardware (14 regras)"* → **MANTER** mas conferir contagem (B.1 acima).
  - *"SmartAdvisor"* → **MANTER** (fica melhor com o novo highlight visual).
  - *"Validações avançadas (20)"* → **MANTER e expandir** com bloqueio de export crítico (gap explícito do plano).
  - *"Leitura de Dynamic Components"* → **MANTER**.
- **Ação:** remover seções 7 e 8 (otimizador + custos), adicionar seção nova *"Validação visual com highlight no SketchUp"* + *"Bloqueio de export por severidade"*. Reorganizar para o documento ficar 100% sobre engenharia interna do plugin.

### C.3 `docs/12_COMPONENTES_DINAMICOS.md`

- **O que muda:** documento longo (48k) sobre PieceStamper + JsonModuleBuilder + DoorCalculator. Excelente conteúdo técnico. **Mantém valor**, mas:
  - Linguagem assume que JSON da biblioteca está na pasta `biblioteca/moveis/cozinha/*.json` *local* do plugin. No novo plano, a **biblioteca paramétrica passa a ter sync com o ERP** (rota `biblioteca-skp.js`). Acrescentar seção sobre como módulos paramétricos podem vir do ERP.
  - Filosofia "uma peça é uma peça porque diz que é" continua **central**. O `PieceStamper` é cabeça do detector. Manter.
  - Acrescentar nota: *"O construtor in-SketchUp polido (Fase 2) gera JSONs no mesmo formato deste documento e os salva como módulos personalizados — eles vão pra biblioteca pessoal no ERP."*
- **Ação:** adicionar capítulos 23–25 sobre: (23) sync com ERP, (24) construtor in-SketchUp, (25) edição em massa multi-seleção.

### C.4 `docs/MANUAL.md`

- **O que muda:** é o manual do usuário modelador. Bom conteúdo, mas:
  - Toda a seção sobre "como mandar pra produção" precisa redirecionar para o ERP.
  - O índice cita "Configurações Globais (ShopConfig)" como seção 11 — atualizar para refletir que ShopConfig agora vive **no drawer da engrenagem** (UX nova) E que tem espelho no ERP (a fonte da verdade pra parâmetros de fábrica é o ERP).
  - Substituir referências às "4 janelas HtmlDialog" pelo **painel único 9 tabs**.
  - Trecho a revisar:
    > *"O Ornato Design Plugin conecta o SketchUp ao ERP Ornato. O fluxo é: MODELAGEM → ANÁLISE → FERRAGENS → EXPORTAÇÃO"*
    Manter, mas adicionar passo final *"... → ERP gera plano de corte, etiquetas, ordem de produção, portal cliente"*.
- **Ação:** revisar índice (seções 11 e 13) e adicionar seção nova *"Para onde vão os dados depois do export"*.

---

## D. Specs que devem ser arquivadas

Mover para `docs/_arquivado/` com `git mv` e adicionar `_arquivado/README.md` com nota explicando o porquê.

| Arquivo | Razão | Resgate (o que aproveitar) |
|---|---|---|
| `docs/GUIA_COMPONENTES.md` | Versão anterior do `12_COMPONENTES_DINAMICOS.md` — duplica conteúdo. Tem 48k linhas, mesmo tamanho. | Fazer um diff entre os dois e absorver no `12` qualquer trecho útil que só esteja aqui. Depois arquivar. |
| `SISTEMA SKETCHUP/SPEC_PLUGIN_ORNATO.md` | Spec v2.0 de março/2026. Fala em arquitetura `ornato/ v1.0.0` (não commitada), versão `0.4.0` do plugin antigo, descreve coexistência das duas árvores. Hoje só interessa a árvore nova em `SISTEMA NOVO/ornato-plugin/`. Várias seções (CollisionEngine, HardwareResolver) já viraram `04_SISTEMA_COLISAO.md` e parte do `11_FUNCIONALIDADES_AVANCADAS.md`. | Seção §5 "Integração com ERP via API" tem boa lista de endpoints — extrair para `13_INTEGRACAO_ERP.md` (ver E). Seção §6 sobre blocos `.skp` da biblioteca tem valor — absorver em `12_COMPONENTES_DINAMICOS.md`. |
| `SISTEMA SKETCHUP/MANUAL_COMPONENTES_ORNATO.md` | Manual v0.3.0. 5 dicionários de atributos antigos (`ornato_modulo`, `ornato_peca`, etc.) — superseded por `12_COMPONENTES_DINAMICOS.md` que usa um dicionário único `Ornato`. | Tabela de tipos de peça com códigos UPM (seção 3) — confrontar com `03_NOMENCLATURA.md` para detectar gaps. |
| `SISTEMA SKETCHUP/MANUAL_DESENVOLVIMENTO_ORNATO.md` | "Arquitetura de dois níveis" (`ornato_plugin/` vs `ornato/ domain`). O novo plano consolida em árvore única. Conteúdo de transição ficou desatualizado. | Seção 3 sobre "agregados — calculadores de porta" é boa — absorver em `12_COMPONENTES_DINAMICOS.md` cap. 7 (DoorCalculator). |
| `SISTEMA SKETCHUP/PLANEJAMENTO_ORNATO.md` | **Documento mais conflitante com o novo plano.** Tem "5 pilares", "motor de inteligência", "motor de validação", **"plano de corte local"** (3.5), **"etiquetas locais"** (3.6), **"modo apresentação cliente"** (3.10), **"detalhamento rápido"** (3.11), **"sistema de etiquetas inteligentes"** (3.12), **"vista explodida"** (3.13), **"agrupamento de peças iguais"** (3.14), **"roteiro de produção"** (3.15) — quase tudo é hoje função do ERP. | Seções 3.2 (Motor de Ambiente) e 3.4 (Precificação tempo real, *consumindo do ERP*) — absorver como ideia de feature pra `13_INTEGRACAO_ERP.md`. Seção 3.13 (vista explodida) pode virar feature opcional do plugin pra apresentar internamente, não como entregável ao cliente. |
| `SISTEMA SKETCHUP/ANALISE_UPMOBB.md` | Engenharia reversa do UpMobb V2.10.22. Novo plano explicitamente rebaixa UpMobb como benchmark ("não é o concorrente que parecia"). | Seção 4.2 sobre Sistema de Agregados ainda é referência boa pra detalhar Composição Contextual. Mover trecho relevante para `15_COMPOSICAO_CONTEXTUAL.md`. |
| `SISTEMA SKETCHUP/UI_DESIGN_BRIEF.md` | UI brief v1.0 de 09/05/2026 — descreve 4 HtmlDialogs e tab "Projeto/Propriedades/Export". O novo plano define 9 tabs (Projeto, Ambiente, Biblioteca, Internos, Acabamentos, Ferragens, Usinagens, Validação, Produção), drawer de configurações, ⌘K, Modo Foco. **Conflito direto.** | Restrições técnicas HtmlDialog (seção 2) são úteis e atemporais — absorver em `14_UX_GUIDELINES.md`. Tudo que é layout/IA visual está obsoleto. |

**Ação concreta:**
```bash
mkdir -p ornato-plugin/docs/_arquivado
git mv ornato-plugin/docs/GUIA_COMPONENTES.md ornato-plugin/docs/_arquivado/
mkdir -p sistema-sketchup-arquivado
git mv "/Users/madeira/SISTEMA SKETCHUP/SPEC_PLUGIN_ORNATO.md" sistema-sketchup-arquivado/
# (etc)
```
Adicionar `_arquivado/README.md` listando o que tem ali e datando o arquivamento.

---

## E. Novos specs que precisam ser criados

### E.1 `13_INTEGRACAO_ERP.md` (alta prioridade)

Conteúdo proposto:

1. **Princípios do handshake** (1 frase: ERP = source of truth de catálogo, parâmetros de fábrica e produção; plugin = source of truth de modelo 3D e usinagens detectadas).
2. **Endpoints consumidos pelo plugin:**
   - `GET /api/catalogo` — chapas, fitas, ferragens (alimenta tabs Acabamentos e Ferragens)
   - `GET /api/biblioteca-skp/*` — módulos paramétricos (alimenta tab Biblioteca)
   - `POST /api/cnc/lote/importar` — recebe UPM JSON
   - `GET /api/cnc/lote/:id/status` — status read-only no plugin
   - `GET /api/plugin/auto-update` — auto-update
   - `POST /api/plugin/sync-handshake` — login JWT
3. **Schema UPM JSON canônico** (referência para `09_EXPORTACAO_JSON.md`).
4. **Fluxo de autenticação** (JWT, persistência via `Sketchup.write_default`).
5. **Sync chip da topbar** — estados (online/offline/erro/sincronizando).
6. **Política de cache local** — biblioteca/catálogo são cacheados por X horas; user pode forçar refresh.
7. **Política de offline** — plugin funciona offline com último cache; export fica em fila local até reconectar.
8. **Status de produção read-only** — quais campos vêm do ERP, refresh policy.

### E.2 `14_UX_GUIDELINES.md` (alta prioridade)

Conteúdo proposto:

1. **Identidade visual** — tema híbrido (claro default, dark opcional), CSS variables, paleta Ornato (#1379F0 azul, #C9A96E cobre, #1B2A4A primary navy proposta).
2. **Estrutura do painel principal** — 9 tabs (Projeto, Ambiente, Biblioteca, Internos, Acabamentos, Ferragens, Usinagens, Validação, Produção). Atalhos numéricos `1..9`, `0` para drawer global.
3. **Topbar** — brand Ornato + ambiente picker + sync chip + ⌘K + engrenagem.
4. **Drawer de Configurações Globais** — 8 seções (Geral, Junções, Dobradiças, Corrediças, Puxadores, S32, Materiais, Atalhos).
5. **⌘K Command Palette** — comandos disponíveis, fuzzy search, atalhos.
6. **Modo Foco** — esconde tudo exceto Inspector; toggle por atalho.
7. **Inspector dinâmico** — 3 modos (vazio / módulo selecionado / múltiplos selecionados → batch actions).
8. **Status bar IDE-style** — campos: seleção SketchUp, peças, m², orçamento (read-only do ERP), conflitos detectados, status de produção.
9. **Restrições técnicas HtmlDialog** (absorver de `UI_DESIGN_BRIEF.md` §2).
10. **Decisão de engine UI:** vanilla JS+CSS vs Preact build (recomendação do plano: Preact estático).
11. **Acessibilidade básica** — atalhos, foco, contraste mínimo.

### E.3 `15_COMPOSICAO_CONTEXTUAL.md` (alta prioridade — diferencial)

Conteúdo proposto:

1. **O que é Composição Contextual** — drawer que abre ao clicar num módulo selecionado, permitindo trocar agregados/ferragens/acabamentos *no próprio contexto do módulo*.
2. **Diferença de Inspector "padrão"** — Inspector edita propriedades atômicas; Composição troca agregados inteiros (porta → gaveta, dobradiça Blum → Hettich, MDF branco → MDF carvalho).
3. **Como o drawer é alimentado** — pelo catálogo do ERP (`Cat.jsx`) + biblioteca paramétrica.
4. **Regras de compatibilidade** — ex: dobradiça pra porta de vidro só pode ser tipo X, gaveta com fundo X exige folga Y.
5. **Histórico de troca** — undo/redo dentro da sessão.
6. **Multi-seleção** — trocar acabamento em 12 portas com 1 clique (gap citado no plano).

### E.4 `16_VALIDACAO_VISUAL.md` (média prioridade)

Conteúdo proposto:

1. **Severidades** — `blocked` (bloqueia export), `warning`, `info`.
2. **Lista canônica de validações** (consolidar as 20 do `11_FUNCIONALIDADES_AVANCADAS.md`).
3. **Highlight visual no SketchUp** — material vermelho temporário, layer dedicado, comportamento ao deselecionar.
4. **"Ir até a peça"** — centralizar câmera no SketchUp ao clicar na pendência.
5. **Bloqueio de export** — UI do botão "Enviar ao ERP" desabilitado se houver `blocked`. Checklist de pendências.
6. **Persistência** — validações ficam no `validation_state` do UPM JSON (ver `09_EXPORTACAO_JSON.md`).

### E.5 (opcional) `17_TEMPLATES_AMBIENTE.md`

Para Fase 3 do plano. Defina como templates de ambiente são modelados, salvos, sincronizados com o ERP.

### E.6 (opcional) `18_AI_FEATURES.md`

Placeholder para Fase 4 (modulação automática heurística → AI; detector de conflitos LLM; render SD+ControlNet). Pode ser stub no início.

---

## F. Conflitos entre specs antigas

| # | Conflito | Specs envolvidas | Decisão recomendada (PLANO_MELHORIA_2025) |
|---|---|---|---|
| F1 | **Quantas regras de hardware?** | `PLANO §2` cita "8 regras". `11_FUNCIONALIDADES_AVANCADAS.md` cita "14 regras". `MANUAL.md` é vago. | Verificar código real em `hardware/rules_engine.rb`. Atualizar PLANO + `11_FUNCIONALIDADES` para o número real. **Suspeita:** 14 está certo (8 são as regras "core" + 6 condicionais como GasPiston/Sliding/LED/PassThrough). |
| F2 | **Quantas validações?** | `PLANO §2` diz "15". `11_FUNCIONALIDADES_AVANCADAS.md §validacoes` diz "20". | 20 é a contagem nova (15 básicas + 5 avançadas). PLANO desatualizado — corrigir lá. |
| F3 | **Plugin tem otimizador de corte?** | `11_FUNCIONALIDADES_AVANCADAS.md §integracao com otimizador` afirma que sim ("Integration::CutOptimizer"). `PLANO_MELHORIA_2025` diz NÃO ("ERP tem profissional"). | **Plano vence.** Remover `CutOptimizer` da spec do plugin (e do código se existir — virou função do ERP). |
| F4 | **Plugin tem catálogo de materiais com preços?** | `11_FUNCIONALIDADES §catalogo de materiais` diz "MaterialCatalog gerencia precos e calcula custos". `PLANO` diz que catálogo é fonte única no ERP. | **Plano vence.** Plugin é consumidor read-only do catálogo do ERP. Manter no plugin apenas o cálculo derivado (m²/peça, comprimento/borda) — preço só é exibido. |
| F5 | **Plugin gera etiquetas?** | `PLANEJAMENTO_ORNATO.md §3.6 + §3.12` afirma "etiquetas locais" e "etiquetas inteligentes". `PLANO_MELHORIA_2025` diz NÃO (ERP tem). | **Plano vence.** Etiquetas saem do escopo do plugin. Arquivar `PLANEJAMENTO_ORNATO.md`. |
| F6 | **Plugin tem modo apresentação cliente?** | `PLANEJAMENTO_ORNATO.md §3.10`. `PLANO` diz NÃO (ERP entrega via `ProposalLanding.jsx`). | **Plano vence.** Remover. |
| F7 | **Plugin tem precificação?** | `PLANEJAMENTO_ORNATO.md §3.4` ("precificação em tempo real"). | Plugin pode **mostrar** preço estimado consumindo do ERP, mas não calcula. Status bar tem campo orçamento read-only. |
| F8 | **Quantas tabs no painel?** | `UI_DESIGN_BRIEF.md` diz 3 tabs (Projeto/Propriedades/Export). `PLANO` diz **9 tabs**. | **Plano vence.** Arquivar UI_DESIGN_BRIEF, criar `14_UX_GUIDELINES`. |
| F9 | **Janela única ou múltiplas HtmlDialogs?** | `UI_DESIGN_BRIEF.md §3` propõe painel principal + 2 overlays (catálogo + usinagem). `PLANO` propõe painel único com drawer + Composição Contextual + Inspector. | **Plano vence** (painel único). Overlays viram drawers internos. |
| F10 | **Versão do plugin atual** | `SPEC_PLUGIN_ORNATO.md` cita v0.4.0. `09_EXPORTACAO_JSON.md` cita 0.1.0. `PLANO` projeta 1.0.0+ pós-Fase 1. | Decidir versão de partida. Sugestão: começar Fase 1 em `0.5.0`, lançar `1.0.0` ao final dela. |
| F11 | **Dicionário(s) de atributo Ornato** | `MANUAL_COMPONENTES_ORNATO.md` usa **5 dicionários** (`ornato_modulo`, `ornato_peca`, etc.). `12_COMPONENTES_DINAMICOS.md` usa **dicionário único** `Ornato`. | **Dicionário único vence** (alinhado ao código atual e ao `PieceStamper`). Arquivar `MANUAL_COMPONENTES_ORNATO`. |
| F12 | **Compat SketchUp** | `01_VISAO_GERAL` diz 2021+. `UI_DESIGN_BRIEF` diz 2017+. | **2021+ vence** (alinhado com `PLANO §3` — "manter compat 2021+ é vantagem"). |

---

## G. Inconsistências entre spec e código real

> Nota: o agent não rodou o código; estas são *prováveis* defasagens. Confirmar com leitura do `ornato-plugin/` antes de aplicar.

| # | Inconsistência suspeita | Onde | Como verificar |
|---|---|---|---|
| G1 | Spec diz "8 regras de furação" no PLANO; código pode ter 14 (ver F1). | `hardware/rules_engine.rb`, `hardware/dowel_rule.rb`, etc. | `ls ornato-plugin/ornato_sketchup/hardware/` e contar `*_rule.rb`. |
| G2 | Spec descreve `CutOptimizer` (`11_FUNCIONALIDADES`). Código pode não ter (ou pode ter mas é morto). | `ornato-plugin/ornato_sketchup/integration/` | `find ornato-plugin -iname '*optimi*'`. Se não existe, remover spec. Se existe mas não é usado, **deletar o código** (já é função do ERP). |
| G3 | Spec descreve `MaterialCatalog` calculando custo. ERP tem `Cat.jsx` como fonte. | `ornato-plugin/ornato_sketchup/catalog/material_catalog.rb` (?) | Confrontar. Provavelmente o catálogo local virou apenas cache do ERP — atualizar spec. |
| G4 | Spec `MANUAL.md` cita 4 HtmlDialogs / `UI_DESIGN_BRIEF` cita 4 painéis. Código pode já ter mais (ver dialog_controller.rb que cita ~13 HTMLs). | `ornato-plugin/ornato_sketchup/ui/` | A partir do PLANO §2, lista 13 HTMLs (`main_panel.html`, `cloud_library_panel.html`, `agregador.html`, etc.) — UI virá de muito mais janelas que o brief antigo previa. **Spec está desatualizada vs código.** |
| G5 | Spec UI fala de tema laranja/escuro. Código novo usa azul `#1379F0`. | `ornato_sketchup/ui/theme.css` (?) | Sincronizar UX guideline com a paleta real. |
| G6 | `09_EXPORTACAO_JSON.md` define schema mas não inclui `validation_state`. Código pode ou não emitir esse campo. | `ornato_sketchup/export/json_exporter.rb` | Verificar e padronizar. |
| G7 | Specs mencionam `f_5mm_s32` para System32. PLANO menciona "diferentes catálogos Blum/Hettich/Hafele/Grass" — confirmar se cada um exige código diferente ou se o `f_5mm_s32` é genérico (e marca vai como metadado). | `06_CATALOGO_FERRAMENTAS.md` + código de regras | Se hoje é genérico, manter; o ERP traduz por marca. |
| G8 | Spec cita mapeamento Biesse/SCM/Homag *no plugin*. Código pode já ter movido pro ERP. | `ornato_sketchup/cnc_mapping.rb` (?) | Se ainda no plugin, **deprecar** (não fizer fizer mais sentido vs `nesting-engine` do ERP). |
| G9 | Spec cita `default_joint_type = minifix` como global. Código pode ter `default_joint_type = cavilha` em alguns presets de fábrica. | `config/defaults.json` | Conferir e padronizar. |
| G10 | Compat UPMobb com prefixo `CM_` (`03_NOMENCLATURA.md` linhas finais). Código pode não ter mais o parser desde que UPMobb saiu de cena. | `ornato_sketchup/parsers/upmobb_compat.rb` (?) | Se vai existir base instalada vinda de UPMobb, manter; senão, depricar e remover seção. |

---

## Apêndice — Roadmap de aplicação deste diff

### Sprint A (1 semana)

1. Criar `docs/_arquivado/` e mover os 6 arquivos da seção D.
2. Adicionar header de versão nos 4 arquivos da seção A.
3. Aplicar pequenos ajustes (B.1–B.5) — pull request único.

### Sprint B (1-2 semanas)

4. Criar `13_INTEGRACAO_ERP.md`, `14_UX_GUIDELINES.md`, `15_COMPOSICAO_CONTEXTUAL.md`, `16_VALIDACAO_VISUAL.md` (esqueletos).
5. Revisão profunda de `10_EXEMPLOS_PRATICOS`, `11_FUNCIONALIDADES_AVANCADAS`, `12_COMPONENTES_DINAMICOS`, `MANUAL.md`.
6. Resolver os 12 conflitos da seção F com decisões formais (criar `docs/CHANGELOG_SPECS.md`).

### Sprint C (paralelo a Fase 1 do PLANO)

7. Investigar inconsistências G1–G10 contra código.
8. Atualizar `09_EXPORTACAO_JSON.md` com `validation_state` (após decisão sobre bloqueio de export).
9. Quando Fase 2 começar: criar `17_TEMPLATES_AMBIENTE.md`. Quando Fase 4 começar: criar `18_AI_FEATURES.md`.

---

*Diff gerado por agent de auditoria em 09/05/2026. Para perguntas, ver `PLANO_MELHORIA_2025.md` como fonte canônica de direção estratégica.*
