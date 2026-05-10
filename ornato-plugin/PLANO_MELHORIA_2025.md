# Plano de Melhoria — Plugin Ornato 2025

> **Versão revisada após análise do ERP Ornato.** A versão anterior duplicava funções que o ERP já entrega. Esse plano foca exclusivamente no que o **plugin SketchUp** deve fortalecer: **modelagem 3D rica + detecção automática de usinagens + export UPM JSON completo**. Tudo que envolve cliente, produção real, plano de corte, etiquetas, faturamento e portal **fica no ERP Ornato**, não duplicamos.
>
> Pesquisa de mercado conduzida por 4 agents paralelos (~50 fontes web) sobre Promob, Gabster, UPMobb, DinaBox, IntProcess, MobPro e tendências UI/UX 2024-2025.

> **⚠️ Nota sobre o ambiente de desenvolvimento (mai/2026):** o protótipo Next.js que rodava em `localhost:3100/sketchup-plugin-ui` (servido por `sistemapesca/apps/web`) foi **descontinuado e removido**. Toda a UI do plugin canônica vive agora em `ornato-plugin/ornato_sketchup/ui/v2/` em **vanilla JS modular**, servida em `localhost:8765/panel.html` para preview local. O projeto `sistemapesca` é alheio ao Ornato — só foi usado como ambiente de prototipagem temporário.

---

## 0. Sumário executivo (TL;DR)

### A divisão de responsabilidades

```
┌──────────────────────────────────┐    UPM JSON     ┌──────────────────────────────────┐
│  PLUGIN SKETCHUP ORNATO          │  ◄──────────►   │  ERP ORNATO                       │
│  ──────────────────              │                  │  ──────────────                   │
│  • Modelagem 3D                   │                  │  • Plano de corte (nesting pro)   │
│  • Galeria paramétrica            │                  │  • Etiquetas QR                   │
│  • Composição contextual          │                  │  • Ordem de produção              │
│  • Detecção de usinagens          │                  │  • Produção CNC + lotes           │
│  • Validação pré-export           │                  │  • Compras, estoque, expedição    │
│  • Sync de catálogo (consumidor)  │                  │  • Portal do Cliente              │
│  • Status de produção (read-only) │                  │  • Landing de proposta            │
│                                   │                  │  • Aprovação digital ICP          │
│                                   │                  │  • CRM, funil, WhatsApp           │
│                                   │                  │  • Financeiro                     │
└──────────────────────────────────┘                  └──────────────────────────────────┘
```

### Tese de posicionamento revisada

> *"Ornato Plugin é a melhor ferramenta de modelagem de marcenaria do SketchUp. Tudo que ele faz é gerar dados perfeitos pro ERP Ornato fazer o resto."*

Comparativo natural pelo mercado:

- **Promob**: software fechado, cobre tudo num pacote engessado e caro
- **Gabster**: plugin SketchUp + portal cloud, mas sem ERP forte
- **DinaBox**: plugin + ERP/PCP próprio (mais próximo do nosso modelo)
- **MobPro**: plugin SketchUp + integrações de produção (mas sem ERP)
- **Ornato (nós)**: **plugin SketchUp moderno + ERP Ornato premium** — único onde plugin e ERP foram desenhados juntos

### O que muda do plano anterior

| Item do plano anterior | Decisão revisada |
|-----------------------|------------------|
| Plugin gera etiquetas QR | ❌ Vai no ERP (já existe) |
| Plugin tem plano de corte com nesting | ❌ ERP tem profissional (`nesting-engine.js` com BRKGA, simulated annealing) |
| Plugin tem portal de cliente / aprovação | ❌ ERP tem `PortalCliente.jsx`, `ProposalPublic.jsx`, `AssinaturaPublic.jsx` |
| Plugin tem CRM, lista de compras, finanças | ❌ ERP tem |
| Plugin tem AR mobile, tour 3D web | ❌ ERP entrega via `ProposalLanding` |
| Plugin tem render IA, marketplace | 🟡 Adiar — primeiro fortalecer modelagem |
| Plugin = "modelagem + detecção + export" | ✅ Foco real |

### Tese estratégica em 1 frase

> *"Ornato vence quando plugin e ERP juntos entregam o que o Promob entrega num pacote único — só que melhor desenhado, mais barato e com UX moderna."*

---

## 1. O que o ERP Ornato JÁ ENTREGA (não duplicar)

Auditoria feita lendo `src/pages/` e `server/routes/` em `/Users/madeira/SISTEMA NOVO/`.

### Apresentação ao cliente final
- ✅ `PortalCliente.jsx` — Gantt premium, status etapas, tracking de visitas, comentários
- ✅ `ProposalLanding.jsx` (rota `/lp/TOKEN`) — landing 5 seções (Hero/Sobre/Portfolio/Processo/CTA)
- ✅ `ProposalPublic.jsx` — proposta pública, aprovação digital, confetti, time on page
- ✅ `AssinaturaPublic.jsx` + `VerificacaoAssinatura.jsx` — assinatura ICP-Brasil
- ✅ `PortfolioPublico.jsx` — portfólio público da marcenaria
- ✅ `TermoEntregaHtml.jsx` — termo de entrega gerado em HTML

### Produção e CNC (já é industrial)
- ✅ `PlanoCorte.jsx` + `nesting-engine.js` (MaxRectsBin, SkylineBin, BRKGA, simulated annealing, two-phase, strip packing, ruin-and-recreate, cross-bin gap fill) — **nesting de nível profissional**
- ✅ `ProducaoCNC.jsx`, `ProducaoCNCTV.jsx`, `ProducaoCNC/` (módulos especializados)
- ✅ `OrdemProducao.jsx` — ordens com etapas, prazos, responsáveis
- ✅ `Industrializacao.jsx` — chão de fábrica
- ✅ `ProducaoFabrica.jsx`, `ProducaoTV.jsx` — telas de fábrica e TV
- ✅ `Expedicao.jsx`, `MontadorUpload.jsx`, `ModoOperador.jsx`
- ✅ Webhooks CNC, lotes, ferramentas, manutenção (route `cnc.js`)

### Gestão e comercial
- ✅ `Cli.jsx`, `FunilLeads.jsx` — clientes e leads
- ✅ `Cat.jsx` — catálogo (acabamentos, ferragens, materiais)
- ✅ `Compras.jsx`, `Estoque.jsx` — suprimentos
- ✅ `Financeiro.jsx` — financeiro completo
- ✅ `Orcs.jsx`, `OrcImport.jsx` — orçamentos
- ✅ `Mensagens.jsx`, route `whatsapp.js` — comunicação
- ✅ `Dash.jsx`, `GestaoAvancada.jsx`, `GerenteRevisional.jsx`, `Produtividade.jsx`, `Relatorios.jsx`

### Construtores web (limitados ao ERP)
- ✅ `ModuleBuilder.jsx`, `ItemBuilder.jsx` — construtores web (não substituem o construtor in-SketchUp)
- ✅ `ScanPeca3D.jsx` — scan 3D de peças

### Integração plugin ↔ ERP
- ✅ Route `cnc.js` recebe planos do plugin
- ✅ Route `biblioteca-skp.js` serve modelos `.skp` do ERP pro plugin
- ✅ Route `plugin.js` para download/auto-update
- ✅ Route `catalogo.js` (catálogo do ERP exposto)

**Conclusão:** O ERP Ornato é robusto. Ele **não precisa** que o plugin duplique nada disso. O que ele precisa do plugin é **dados de modelo bem estruturados, completos e validados**.

---

## 2. O que o plugin Ornato JÁ TEM (estado atual)

Auditoria feita lendo `/Users/madeira/SISTEMA NOVO/ornato-plugin/` e specs em `docs/`.

### Arquitetura
- ✅ Estrutura Ruby: `main.rb`, `dev_loader.rb`, `config.rb`, `ornato_loader.rb`
- ✅ Painéis HTML: `main_panel.html`, `cloud_library_panel.html`, `agregador.html`, `acabamentos.html`, `construtor.html`, `module_library.html`, `material_map.html`, `hardware_config.html`, `drilling_preview.html`, `troca_componente.html`, `export_preview.html`, `update_dialog.html`, `shop_config_panel.html`
- ✅ `dialog_controller.rb` — bridge Ruby ↔ HTML

### Tools (modelagem + edição)
- ✅ `placement_tool.rb` — colocar módulos
- ✅ `edit_tool.rb` — editar
- ✅ `ambiente_tool.rb` — desenhar ambiente
- ✅ `hole_tool.rb`, `hole_edit_tool.rb`, `hole_config_dialog.html` — usinagens
- ✅ `copy_array_tool.rb` — duplicação em série
- ✅ `collision_manager.rb`, `neighbor_resolver.rb` — detecção de junções

### Hardware/regras
- ✅ `hardware/rules_engine.rb` + `dowel_rule.rb`
- ✅ 8 regras de furação automática: dobradiça, minifix, cavilha, System32, puxador, corrediça, fundo, prateleira
- ✅ Catálogos integrados: Blum, Hettich, Hafele, Grass

### Inteligência
- ✅ `advisor/smart_advisor.rb` — sugestões automáticas

### Specs documentadas
- ✅ `docs/01_VISAO_GERAL.md` … `docs/12_COMPONENTES_DINAMICOS.md` (12 documentos)
- ✅ `SPEC_PLUGIN_ORNATO.md`, `MANUAL_COMPONENTES_ORNATO.md`, `MANUAL_DESENVOLVIMENTO_ORNATO.md`, `PLANEJAMENTO_ORNATO.md`, `ANALISE_UPMOBB.md`, `UI_DESIGN_BRIEF.md`
- ✅ Schema de export UPM JSON definido em `docs/09_EXPORTACAO_JSON.md`

### Numeração atual oficial (route `plugin.js`)
- ✅ 15 módulos paramétricos
- ✅ 92 itens na biblioteca (móveis, ferragens, usinagens, materiais, bordas)
- ✅ 15 validações pré-export

### UI atual
- 🟡 Tema **escuro** (`#0c1117` / `#111827` / `#172032`) com accent azul `#1379F0` e cobre `#C9A96E`
- 🟡 Conflito com decisão recente (dev anterior pediu branco/grafite; protótipo Next.js usa branco + laranja)
- ❌ UI antiga — não tem ainda Composição contextual, ⌘K, Modo Foco, Inspector dinâmico (tudo isso só existe no protótipo Next.js)

---

## 3. Matriz competitiva — só MODELAGEM (escopo do plugin)

Para comparar maçãs com maçãs, olhamos só o que **plugins de modelagem** fazem. As features de "produção real" ficam fora porque ERP Ornato faz mais e melhor.

### Legenda: ✅ tem · 🟡 parcial · ❌ não tem · 💎 diferencial único

| Feature | Ornato Plugin | Promob | Gabster | DinaBox | MobPro |
|---------|:-------------:|:------:|:-------:|:-------:|:------:|
| **Plataforma** |
| Plugin SketchUp | ✅ | ❌ (próprio) | ✅ | ✅ | ✅ |
| Compat SketchUp 2021+ | ✅ | — | ✅ | 🟡 (DB2.0 só 2024+) | ✅ |
| **Galeria** |
| Galeria paramétrica | 🟡 (15 módulos) | ✅ (massiva) | ✅ (500+) | ✅ | ✅ (200+) |
| Catálogos curados fabricantes BR | 🟡 (vem do ERP) | ✅ (Duratex/Berneck/Eucatex) | 🟡 | 🟡 | ❌ |
| Coleções/biblioteca pessoal | 🟡 (via ERP) | ✅ | ✅ | ✅ | ❌ |
| **Construtor** |
| Construtor de componentes do zero | 🟡 (`construtor.html`) | ✅ (Builder Closet) | ✅ | ✅ (`dbf()/dbt()` técnico) | ✅ |
| Modulação automática parede→módulos | ❌ | ✅ (Maker) | ❌ | ❌ | ❌ |
| Edição em massa multi-seleção | ❌ | 🟡 | ❌ | ✅ (DB2.0) | ✅ |
| Drag-and-place inteligente com snap | 🟡 (`placement_tool.rb`) | ✅ | ✅ | ✅ | 🟡 |
| **Composição/Inspector** |
| Inspector contextual unificado | 🟡 (no protótipo) | ❌ | ❌ (Component Options nativo) | 🟡 | ❌ |
| **Composição contextual de módulo** | 💎 (no protótipo) | ❌ | ❌ | ❌ | ❌ |
| Trocar agregados/ferragens/acabamentos contextual | 💎 (no protótipo) | 🟡 | 🟡 | ✅ (DB2.0) | 🟡 |
| Ferragens paramétricas com regras (Blum/Hettich) | ✅ (já tem) | ✅ | 🟡 | ✅ (DB2.0) | 🟡 |
| **Detecção de usinagens** |
| Detecção automática de furação | ✅ (8 regras) | ✅ | 🟡 | 🟡 | 🟡 |
| Sistema 32 customizado | ✅ | ✅ | 🟡 | 🟡 | ❌ |
| Detecção por colisão | ✅ (`collision_manager`) | ✅ | 🟡 | 🟡 | ❌ |
| Edição manual de furos | ✅ (`hole_edit_tool`) | ✅ | ❌ | 🟡 | 🟡 |
| **Validação** |
| Validação automática pré-export | ✅ (15 validações) | 🟡 (só Enterprise) | 🟡 | ❌ | ❌ |
| Highlight visual no modelo 3D | ❌ | ✅ | ✅ | 🟡 | ❌ |
| Bloqueio de export se erro crítico | ❌ | ✅ | 🟡 | 🟡 | ❌ |
| **UX moderna (do protótipo)** |
| ⌘K Command Palette | 💎 (no protótipo) | ❌ | ❌ | ❌ | ❌ |
| Modo Foco | 💎 (no protótipo) | ❌ | ❌ | 🟡 | ❌ |
| Atalhos numéricos para tabs | 💎 (no protótipo) | ❌ | ❌ | ❌ | ❌ |
| Status bar IDE-style | 💎 (no protótipo) | ❌ | ❌ | ❌ | ❌ |
| Drawer de Configurações Globais | ✅ (no protótipo) | ❌ | ❌ | ❌ | ❌ |
| **Export para ERP/CNC** |
| Export JSON estruturado | ✅ (UPM/Ornato schema) | ✅ | ✅ | ✅ | ✅ |
| Export DXF | ❌ | ✅ | ✅ | ✅ | ✅ |
| Sync com catálogo do ERP | ✅ (já tem) | ✅ (Connect) | ✅ (Via Gabster) | ✅ | 🟡 |
| **Templates e produtividade** |
| Templates de ambiente | ❌ | ✅ | 🟡 | 🟡 | 🟡 |
| Modulação automática heurística | ❌ | ✅ (Maker) | ❌ | ❌ | ❌ |

---

## 4. Gap analysis — o que falta no plugin

### 4.1 ✅ Vantagens já estabelecidas (manter e migrar do protótipo)

| Vantagem | Diferencial vs concorrência |
|----------|------------------------------|
| **Composição contextual de módulo** | NINGUÉM tem. Inovação real. |
| **⌘K Command Palette** | NINGUÉM tem em plugin SketchUp BR |
| **Modo Foco** | NINGUÉM tem |
| **Inspector dinâmico unificado** | Gabster usa Component Options nativo (fragmentado) |
| **Atalhos numéricos para tabs** | NINGUÉM tem |
| **Status bar IDE-style** | NINGUÉM tem |
| **Drawer de Configurações Globais** | NINGUÉM tem |
| **8 regras de furação + colisão** | Já implementado e robusto |
| **15 validações pré-export** | Já implementado |
| **ERP forte por trás** | DinaBox tenta, mas o nosso é mais maduro (visto no `nesting-engine.js`) |

### 4.2 ❌ Gaps críticos — implementar no plugin (Fase 1 e 2)

| Gap | Por que é crítico | Origem |
|-----|-------------------|--------|
| **Migrar UI do protótipo Next.js → HtmlDialog real** | Tudo que fizemos no protótipo (10 tabs, Composição, ⌘K, Modo Foco) precisa virar plugin de verdade | Trabalho atual |
| **Galeria paramétrica robusta (15 → 50+)** | Sem isso, marceneiro escolhe Promob (massiva) ou Gabster (500+) | Pesquisa |
| **Construtor in-SketchUp polido** | Tem `construtor.html` mas não está no nível Promob Builder Closet | Pesquisa |
| **Edição em massa multi-seleção** | DinaBox 2.0 e MobPro têm. Trocar acabamento em 12 portas de uma vez. | Pesquisa |
| **Highlight visual de validação** | Hoje validação é lista; precisa pintar peça vermelha no SketchUp | Gap próprio |
| **Bloqueio de export crítico** | Hoje export não é bloqueado mesmo com erros — gera retrabalho no ERP | Gap próprio |
| **Drag-and-place com snap inteligente** | Módulo grudar em parede, alinhar com vizinho — produtividade | Pesquisa |
| **Templates de ambiente** | "Cozinha padrão L" acelera 80% do projeto | Pesquisa |
| **Modulação automática heurística** | Promob Maker tem; é diferencial vendável | Pesquisa |

### 4.3 💎 Diferenciais defensáveis (médio/longo prazo)

| Diferencial | Por que é defensável |
|-------------|----------------------|
| **Plugin + ERP Ornato como pacote único** | Concorrentes vendem só plugin OU só ERP; nós vendemos os dois desenhados juntos |
| **Composição contextual** | Inovação que NINGUÉM tem |
| **UX moderna nativa** (⌘K, Modo Foco, Status bar) | Promob/Gabster/DinaBox UI dos anos 2000-2015 |
| **AI detector de conflitos visual** | "A porta abre sem bater?" — ninguém tem |
| **AI sugere modulação** por foto + briefing | Cyncly entrando, ninguém no BR ainda |
| **Multi-pós-processador AI** (G-code) | Ninguém faz, comoditiza algo travado |

---

## 5. Insights críticos da pesquisa de mercado

Síntese dos 4 relatórios (Promob, Gabster, UPMobb+DinaBox, Intmob+tendências).

### Promob (Cyncly) — o líder velho
- **Moat**: catálogos curados de fabricantes BR (Duratex/Berneck/Eucatex/Arauco) via Promob Publisher — **25 anos de relacionamento**
- **Cut Pro multi-projeto** otimiza chapas de N projetos juntos (ERP Ornato pode replicar)
- **Vulnerabilidades**: UI dos anos 2000, curva absurda (cursos R$ 300-2.000), preço proibitivo (pirataria endêmica), dependência de internet, render Real Scene 2.0 ainda criticado
- **Recomendação**: NÃO competir em catálogo de fabricante curto prazo. Atacar UX, transparência, preço.

### Gabster — concorrente mais próximo (mesma plataforma SketchUp)
- 500+ módulos paramétricos com **regras reais de fabricação**
- 51+ integrações CNC nativas
- **UX fragmentada** (várias janelas, Component Options nativo SU) — vulnerabilidade
- PDF de orçamento "feio" — sem identidade
- Suporte ruim pós-venda (Reclame Aqui)
- **Lacuna estratégica**: portal de apresentação fraco — mas no nosso caso ERP já entrega isso

### DinaBox — concorrente mais articulado (modelo similar)
- **Stack vertical único**: plugin + ERP + PCP — desenho à expedição
- **DinaBox 2.0** trouxe Editor em Massa, Parâmetros de Engenharia, Visualizador 3D de Usinagens, Ferragens Inteligentes (regras por marca), Substituição rápida 3D
- **Sintaxe `dbf()/dbt()` exposta ao usuário** — poderoso mas afasta marceneiro (vencer com parametrização visual no Inspector)
- **DB2.0 exige SketchUp 2024+** — quebrou base instalada (manter compat 2021+ é vantagem)

### UPMobb — não é o concorrente que parecia
- Pegada digital pequena, sem reviews, sem reclamações
- Plugin de nicho/regional
- **A "modulação automática" associada a ele é hipótese** sem evidência pública
- Ignorar como benchmark prioritário

### IntProcess + MobPro — foco produção (semelhante ao ERP Ornato)
- **IntProcess está em manutenção** — possível crise/rebrand
- **MobPro tem preços públicos** (R$ 149-390/mês) — RARO no mercado, vale copiar transparência
- Etiquetas QR + mobile já é table-stakes 2025 (ERP Ornato faz)

### Tendências 2024-2025
- **AI em design**: render por prompt já é commodity (SketchUp Diffusion nativo, Promob Real Scene 2.0). Sugestão de modulação e detecção de conflitos ainda **abertos** — janela de oportunidade.
- **AR mobile webAR**: +65% conversão fechamento — mas o ERP entrega isso via ProposalLanding
- **Marketplace de módulos paramétricos**: VAZIO no Brasil — oportunidade real
- **Cyncly + AI Inspired to Design** (LIDAR scan iPhone → 3D production-ready): risco real para 2026
- **SketchUp 2026 nativo com AI Diffusion**: reduz necessidade de plugins de visualização → focar em **produção e processo**, não em renderização básica

---

## 6. Roadmap em 4 fases (revisado)

### 🎯 FASE 1 — Migração do protótipo para plugin real (4-6 semanas)

**Objetivo:** Trazer toda a UX moderna que fizemos no protótipo Next.js para o plugin SketchUp real (HtmlDialog).

#### Entregáveis
- [ ] Estrutura de **9 tabs** (Projeto, Ambiente, Biblioteca, Internos, Acabamentos, Ferragens, Usinagens, Validação, Produção)
- [ ] Configurações na engrenagem da topbar (drawer, 8 seções)
- [ ] **⌘K Command Palette**
- [ ] **Modo Foco**
- [ ] **Atalhos numéricos** (1..9, 0)
- [ ] **Inspector dinâmico** (3 modos: vazio/módulo/múltiplos)
- [ ] **Composição contextual** (drawer com troca de agregados/ferragens/acabamentos)
- [ ] **Topbar** com brand Ornato + ambiente picker + sync chip
- [ ] **Status bar IDE-style** com seleção SketchUp + peças + m² + orçamento + conflitos
- [ ] **SVGs personalizados** (logo Ornato + 10 tab icons + spindle CNC)
- [ ] **Tema visual final**: branco/grafite default + dark mode opcional
- [ ] Renomear "Detalhes" → "Projeto"
- [ ] Tab "Produção" focada em "envio ao ERP + status read-only"

**Risco:** HtmlDialog do SketchUp tem limitações vs Next.js (sem React, sem Tailwind nativo). Precisa decidir: migrar com vanilla JS + CSS puro, ou usar build estático React/Preact.

---

### 🎯 FASE 2 — Engenharia de modelagem (4-6 semanas)

**Objetivo:** Plugin produz dados completos e validados pro ERP.

#### Entregáveis
- [ ] **Galeria paramétrica robusta** (15 → 50+ módulos)
  - 15 inferiores, 10 aéreos, 8 torres, 5 cantos, 5 dormitório, 5 banheiro, 5 escritório
  - Regras reais de fabricação (espessuras fixas, recuos, folgas, ferragens recalculadas)
- [ ] **Construtor in-SketchUp polido** (`construtor.html` melhorado)
  - Caixa → internos → frentes → acabamentos → ferragens
  - Salvar como módulo personalizado (vai pra biblioteca pessoal no ERP)
- [ ] **Edição em massa** (multi-seleção visual + Inspector com batch actions)
- [ ] **Sync bidirecional de catálogos**
  - Acabamentos do ERP (`Cat.jsx`) aparecem no plugin
  - Ferragens do ERP aparecem no plugin
  - Cores/códigos/preços fonte única no ERP
- [ ] **Validação visual com highlight no SketchUp**
  - Peças problema ficam vermelhas
  - Lista de pendências com botão "ir até a peça" (centraliza câmera)
  - Bloqueio de export até resolver erros críticos
- [ ] **Export UPM JSON 100% testado**
  - Schema `docs/09_EXPORTACAO_JSON.md` validado contra projetos reais
  - Cada peça leva: dimensões, material, espessura, todas 4 bordas, direção do veio, todas usinagens, posição/rotação no mundo
  - Test suite que valida JSON antes do envio
- [ ] **Status de produção read-only**
  - Plugin abre projeto e mostra: "Em fila", "Cortando", "Montando", "Pronto"
  - Vem de `/api/cnc/lote/:id/status`

---

### 🎯 FASE 3 — Produtividade do projetista (3-4 semanas)

**Objetivo:** Marceneiro projeta mais rápido. Diferencial defensável.

#### Entregáveis
- [ ] **Templates de ambiente**
  - "Cozinha em L padrão" (3.5m × 2m)
  - "Cozinha linear premium" (4m)
  - "Dormitório casal" (closet + cama + criados)
  - "Banheiro suíte" (gabinete + nicho)
  - 10-15 templates totais
- [ ] **Snap e encaixe inteligente**
  - Módulo gruda em parede automaticamente
  - Alinha com módulo vizinho
  - Cota inteligente entre módulos
- [ ] **Modulação automática heurística** (concorrente do Promob Maker)
  - Usuário desenha parede 3.5m
  - Plugin sugere 3 distribuições (linear / canto / com torre)
  - Heurística: módulos múltiplos de 300/450/600mm com regras de canto
  - **IA fica para Fase 4**, heurística já vence UPMobb
- [ ] **Drag-and-place inteligente** da Biblioteca pro modelo SketchUp
- [ ] **Re-importação** de projeto que voltou do ERP

---

### 🎯 FASE 4 — IA e diferenciais únicos (longo prazo, 6+ meses)

**Objetivo:** Janela de oportunidade antes do Cyncly aterrissar.

#### Entregáveis
- [ ] **AI sugere modulação** por foto + briefing
  - Vision API: foto do ambiente → detecta paredes, vão, vigas, tomadas
  - Briefing curto: "Cozinha em L, 3.5m × 2m, estilo industrial"
  - LLM com tool-use gera 3 opções de modulação
- [ ] **AI detector de conflitos visual**
  - Camada 1 (rules-based): "porta abre sem bater?", "veio orientado certo?", "fita cobre todas as faces visíveis?"
  - Camada 2 (LLM): análise semântica ("este módulo não cabe pela escada do prédio")
  - Highlight visual no SketchUp (peça vermelha)
- [ ] **AI render foto-realista** (pipeline Stable Diffusion + ControlNet)
  - SketchUp → screenshot → ControlNet (preserva geometria) → SDXL
  - 5 segundos por render (vs minutos do Promob)
  - **Diferencial vs Real Scene 2.0**: gratuito no plano base
- [ ] **Marketplace de módulos paramétricos**
  - Marceneiros publicam módulos próprios
  - Royalty (Stripe Connect / Pix automático)
  - 70/30 ou 80/20

---

## 7. Diferenciais defensáveis (combinando plugin + ERP)

| Diferencial | Plugin contribui com | ERP contribui com |
|-------------|---------------------|-------------------|
| **Pacote único plugin + ERP** | Modelagem rica | Tudo o resto |
| **UX moderna ponta-a-ponta** | ⌘K, Modo Foco, Composição | UI moderna no Portal/Proposta |
| **Composição contextual** | Drawer de troca de agregados | Catálogo do ERP alimenta a Composição |
| **Validação inteligente** | Highlight visual + bloqueio de export | Recebe JSON validado, processa sem erro |
| **Apresentação ao cliente** | Export rico → ERP gera Portal/Landing | Portal Cliente, ProposalPublic, AssinaturaPublic |
| **Produção certa de primeira** | Detecção automática + 15 validações | Nesting profissional + ordem produção |
| **AI detector de conflitos** | Visual no SketchUp | Re-roteia ordem se necessário |
| **Modulação automática** | Heurística parede→módulos | ERP recebe variantes, gera orçamento de cada |

---

## 8. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|:-------------:|:-------:|-----------|
| **Cyncly lança AI Inspired to Design no BR em 2026** | Alta | Alto | Acelerar Fase 4 (AI Co-Piloto) — começar com heurísticas, evoluir para LLM |
| **DinaBox lança marketplace primeiro** | Média | Médio | Marketplace é Fase 4 nossa; eles já têm cloud library; nós temos ERP mais maduro |
| **SketchUp 2026 nativo com AI Diffusion** mata necessidade de render externo | Alta | Médio | Focar em **produção e processo**, não em renderização |
| **HtmlDialog do SketchUp é limitado** vs Next.js | Alta | Médio | Decidir: vanilla JS + CSS puro, ou Preact build estático? |
| **Migrar UI do protótipo demora mais que 6 semanas** | Média | Médio | Quebrar em sub-fases (1.1 estrutura, 1.2 inspector, 1.3 ⌘K, 1.4 composição) |
| **Catálogo de fabricantes não fechar** (Duratex/Berneck demoram) | Alta | Baixo (não é blocker do plugin) | Plugin consome catálogo do ERP — fabricantes entram quando o ERP fechar |
| **Pirataria endêmica** | Alta | Médio | SaaS com server-side validation (já é o modelo VPS atual) — plugin valida com ERP |
| **Curva de aprendizado afasta marceneiro tradicional** | Média | Alto | Onboarding por pílulas + tour guiado + modo iniciante (esconde features avançadas) |

---

## 9. KPIs e marcos

### Fase 1 (6 semanas)
- 9 tabs migradas e funcionais no plugin real (HtmlDialog)
- Composição contextual funcionando
- ⌘K + Modo Foco + atalhos numéricos
- Tema final decidido (claro/escuro/híbrido)
- 5 marcenarias beta testando

### Fase 2 (12 semanas total)
- 50+ módulos paramétricos
- Sync de catálogo ERP↔plugin funcional
- Validação visual com highlight
- Export UPM JSON 100% testado contra 20 projetos reais
- 20 marcenarias beta

### Fase 3 (16 semanas total)
- 10 templates de ambiente
- Modulação automática heurística (3 sugestões por parede)
- Drag-and-place com snap
- 50 marcenarias pagantes

### Fase 4 (24+ semanas total)
- AI sugere modulação em 30% dos projetos
- AI detector de conflitos (camada rules-based funcional)
- AI render (pipeline SD+ControlNet) entregando 5 imagens/min
- 100 marcenarias pagantes
- 1 fabricante de catálogo fechado pelo ERP (Duratex/Berneck)

---

## 10. Decisões pendentes

Antes de iniciar Fase 1, preciso de decisão em:

1. **Tema visual final do plugin** — claro / escuro / híbrido com claro default?
   - *Eu voto: híbrido com claro default (CSS variables, opção em Configurações Globais)*

2. **Engine de UI no HtmlDialog** — vanilla JS+CSS / Preact build estático / outro?
   - *Eu voto: Preact build estático (preserva 80% do código React do protótipo)*

3. **Renomear "Relatórios" no plugin** — vira "Apresentação"? Ou some (já é do ERP)?
   - *Eu voto: some do plugin. ERP é quem gera relatórios.*

4. **Ordem de migração** dentro da Fase 1 — começar por estrutura ou por feature?
   - *Eu voto: 1.1 estrutura (10 tabs vazias), 1.2 inspector + composição, 1.3 ⌘K + atalhos, 1.4 status bar + drawers*

5. **Auditar specs antigas** (`docs/01..12 + SPEC_PLUGIN_ORNATO.md`) e gerar diff vs novo plano?
   - *Eu voto: sim, faz sentido. Posso disparar agent de leitura.*

---

## 11. Fontes consultadas (~50 referências)

### ERP Ornato (auditoria interna)
- `/Users/madeira/SISTEMA NOVO/src/pages/` — todas as 60+ páginas verificadas
- `/Users/madeira/SISTEMA NOVO/server/routes/` — todas as 40+ routes verificadas
- `/Users/madeira/SISTEMA NOVO/server/lib/nesting-engine.js` (algoritmos profissionais)

### Plugin Ornato (auditoria interna)
- `/Users/madeira/SISTEMA NOVO/ornato-plugin/` — Ruby, HTML, tools, hardware, advisor
- `/Users/madeira/SISTEMA NOVO/ornato-plugin/docs/01..12` — specs completas
- `/Users/madeira/SISTEMA SKETCHUP/` — análises e manuais

### Pesquisa de mercado (4 agents paralelos, ~50 fontes web)

**Promob/Cyncly:**
- promob.com, promob.com.br, promob.com/blog, suporte.promob.com
- emobile.com.br (FIMMA 2025 — Real Scene 2.0)
- megamoveleiros.com.br, marcenariadehoje.com.br, cortmdf.com.br
- reclameaqui.com.br/promob-softwares
- capterra.com, sketchupbrasil.com

**Gabster:**
- gabster.com.br, gabster.zendesk.com, via.gabster.com.br
- youtube.com/Gabster
- reclameaqui.com.br/empresa/gabster-learn
- calcme.com.br/blog

**DinaBox + UPMobb:**
- dinabox.net, ead.dinabox.net, dinabox.tawk.help
- extensions.sketchup.com (SketchUp Warehouse)
- blog.totalcad.com.br
- upmobb.com.br, youtube.com/UpMobb (playlist)
- siteconfiavel.com.br

**IntProcess + MobPro + tendências:**
- intprocess.com.br (em manutenção)
- mobprosketchup.com.br (preços públicos)
- hellomob.com.br, comunidade.hellomob.com.br
- freireproject.com.br (FP3D)
- cyncly.com (resources/news, KBIS 2025), fcnews.net
- mobbin.com (UX patterns command palette)
- cgifurniture.com, vividworks.com (AR furniture)
- plataine.com (WoodOptimizer AI), autodesk.com (nesting)
- sketchfab.com/store (marketplace 3D)
- helpx.adobe.com/legal/esignatures/regulations/brazil
- betterproposals.io (interior design signoff)
- institutobramante.com.br (plugins SketchUp 2026)
- blog.totalcad.com.br (SketchUp Diffusion AI)

---

*Documento revisado em 09/05/2026. Versão alinhada com a realidade do ERP Ornato (que já entrega Portal Cliente, Plano de Corte, Aprovação Digital, Produção CNC, Compras, Estoque, Financeiro). O plugin SketchUp foca exclusivamente em modelagem 3D + detecção de usinagens + export UPM JSON.*
