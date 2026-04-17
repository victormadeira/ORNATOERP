# Plano do Plugin Ornato para SketchUp — v3.0

**Data:** 2026-04-03
**Status:** DEFINITIVO
**Filosofia:** Plugin = MODELAGEM. ERP = TODO O RESTO.

---

## 1. Posicionamento

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│     PLUGIN ORNATO (SketchUp)    │     │       ORNATO ERP (Web)          │
│                                 │     │                                 │
│  O designer MODELA e EXPORTA    │────→│  O sistema PROCESSA e PRODUZ    │
│                                 │     │                                 │
│  • Modelagem inteligente        │     │  • Orçamento / Proposta         │
│  • Detecção de peças            │     │  • Nesting / Plano de corte     │
│  • Regras de furação            │     │  • G-Code multi-fase            │
│  • Mapeamento de materiais      │     │  • Etiquetas / QR              │
│  • Fita de borda                │     │  • Produção / Fila CNC         │
│  • Módulos paramétricos         │     │  • Conferência pós-corte       │
│  • Visualização ferragens 3D    │     │  • Expedição / Montagem        │
│  • Validação do modelo          │     │  • Financeiro / Relatórios     │
│  • Export JSON → ERP            │     │  • Rastreio entrega            │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

### Por que essa separação é MELHOR que DinaBox/Gabster/Mozaik

| Concorrente | Abordagem | Problema |
|-------------|-----------|---------|
| DinaBox | Tudo no plugin | Plugin pesado, dados presos no PC, sem acesso mobile |
| Gabster | Tudo na nuvem deles | Lock-in total, precisa do ecossistema deles |
| Mozaik | Software standalone + SketchUp | Windows only, $325/mês, curva de aprendizado brutal |
| **Ornato** | **Plugin leve + ERP web** | **Melhor dos 2 mundos: SKP que já conhecem + web acessível de qualquer lugar** |

**Vantagem Ornato:**
- Designer usa SketchUp que já sabe (zero curva de aprendizado)
- Plugin leve e rápido (só modelagem)
- ERP web = acessível no celular, tablet, TV da fábrica
- Operador, montador, financeiro, cliente = cada um acessa pelo web
- Dados na nuvem = backup automático, multi-user, multi-dispositivo
- Preço acessível (plugin grátis + ERP por assinatura)

---

## 2. O Que Já Temos (implementado)

### 2.1 Plugin SketchUp — 28 arquivos, 6.364 linhas

| Módulo | Arquivos | Linhas | Funcionalidade |
|--------|----------|--------|----------------|
| Core | 6 .rb | 1.578 | Detecção peças, junções, materiais, bordas, hierarquia |
| Hardware | 9 .rb | 1.560 | Rules Engine + 8 regras de furação automática |
| Export | 4 .rb | 853 | JSON (CNC), CSV (corte), BOM (ferragens), API sync |
| Machining | 1 .rb | 311 | Serialização operações CNC |
| UI | 5 .html | 1.730 | Painel principal, materiais, ferragens, preview furação, preview export |
| Config | 3 .rb | 332 | Loader, config persistente, entry point |

### 2.2 Regras de Furação Implementadas

| Regra | O que faz | Peça alvo |
|-------|-----------|-----------|
| HingeRule | Dobradiça 35mm + 2x piloto 2.5mm | Lateral (com porta) |
| System32Rule | Fileira Ø5mm×12mm a cada 32mm | Lateral (com prateleira) |
| MinifixRule | Ø15mm corpo + Ø8mm pino (cam lock) | Junção lateral×base |
| DowelRule | Ø8mm×15mm (alternativa minifix) | Qualquer junção |
| HandleRule | 2x Ø5mm passante (puxador) | Porta / frente gaveta |
| DrawerSlideRule | 3-4x Ø4mm (corrediça) | Lateral do corpo |
| BackPanelRule | Canal 4mm×8mm (fundo) | Lateral / base |
| ShelfRule | 2x Ø8mm (prateleira fixa) | Lateral |

### 2.3 ERP — Já Faz Tudo

O ERP Ornato web já tem 48+ features CNC implementadas:
- Import JSON/DXF/Promob/CSV
- Nesting 5 algoritmos
- G-Code multi-fase com helicoidal, vacuum-aware, TSP
- Simulador 2D animado
- Etiquetas com editor visual
- QR scan com vista explodida 3D do módulo
- Conferência, fila, custeio, estoque
- Predição ferramentas, manutenção
- Dashboard desperdício, sugestão agrupamento
- Modo operador TV/tablet
- WebSocket real-time
- Rastreio entrega GPS
- E muito mais

---

## 3. O Que FALTA no Plugin (vs concorrentes)

### Análise de Gap — Funcionalidades de MODELAGEM

| Feature | DinaBox | Gabster | Mozaik | Gava | ABF | **Ornato** | Gap? |
|---------|---------|---------|--------|------|-----|-----------|------|
| Detecção automática peças | ✅ | ✅ | ✅ | ✅ | Manual | ✅ | -- |
| Regras furação automática | ✅ | ✅ | ✅ | ✅ | Manual | ✅ 8 regras | -- |
| Detecção bordas expostas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | -- |
| Mapeamento materiais | ✅ | ✅ | ✅ | ✅ | Manual | ✅ | -- |
| Export JSON/DXF | ✅ | ✅ | ✅ | ✅ | DXF | ✅ JSON | -- |
| **Módulos paramétricos** | ✅ | ✅ 500+ | ✅ | ❌ | ❌ | ❌ | **GAP CRÍTICO** |
| **Ferragens 3D no modelo** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | **GAP ALTO** |
| **Validação inteligente** | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ básica | **GAP MÉDIO** |
| **Edição manual furos** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | **GAP ALTO** |
| **Catálogo ferragens** | ✅ | ✅ | ✅ Blum/Hettich | ❌ | Parcial | ❌ | **GAP MÉDIO** |
| **Cotas automáticas** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | **DIFERENCIAL** |
| **Multi-material/chapa** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | -- |
| Preview furação 2D | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | -- |
| Sync com ERP | PCP | ✅ | Job Mgr | ❌ | ❌ | ✅ API | VANTAGEM |

### Gaps Priorizados

**CRÍTICO — Sem isso não compete:**
1. Módulos paramétricos (Dynamic Components inteligentes)
2. Ferragens visuais no modelo 3D
3. Edição manual de furos (clicar na peça → adicionar/mover furo)

**ALTO — Diferencia dos gratuitos:**
4. Validação inteligente do modelo antes de exportar
5. Catálogo de ferragens com specs (Blum, Hettich, Hafele)

**MÉDIO — Polimento profissional:**
6. Cotas automáticas (dimensões no modelo)
7. Atalhos de teclado e workflow otimizado
8. Toolbar visual com ícones profissionais

---

## 4. Plano de Implementação — O Que Falta

### FASE 2: Módulos Paramétricos (prioridade máxima)

**O que:** Biblioteca de Dynamic Components que o marceneiro arrasta pro modelo, configura dimensões, e o componente se adapta automaticamente com todas as peças.

**Módulos a criar:**

| # | Módulo | Peças geradas | Ferragens auto |
|---|--------|--------------|----------------|
| 1 | Armário Base (pia/balcão) | 2 laterais, base, tampo, traseira, prateleira | Minifix/cavilha, rebaixo fundo |
| 2 | Armário Aéreo | 2 laterais, base, topo, traseira, porta(s) | Minifix, dobradiça, rebaixo fundo |
| 3 | Armário Torre (forno/geladeira) | 2 laterais, base, topo, divisória, traseira | Minifix, System32, rebaixo fundo |
| 4 | Gaveteiro (1-6 gavetas) | 2 laterais, base, divisórias, frentes gaveta | Corrediça, puxador, minifix |
| 5 | Nicho Aberto | 2 laterais, base, topo, traseira | Minifix, rebaixo fundo |
| 6 | Porta (abrir) | Porta + dobradiça | Dobradiça, puxador |
| 7 | Porta (correr) | 2 portas + trilho | Canal trilho |
| 8 | Gaveta Completa | 2 laterais, fundo, traseira, frente | Corrediça, puxador |
| 9 | Prateleira Regulável | Prateleira + 4 suportes | System32 na lateral |
| 10 | Prateleira Fixa | Prateleira | Cavilha/minifix |
| 11 | Sapateira | Suportes inclinados | Furação custom |
| 12 | Cabideiro | Barra + suportes | Furação lateral |
| 13 | Tamponamento Lateral | Peça de acabamento | Cavilha |
| 14 | Rodapé/Saia | Peça inferior | Parafusos |
| 15 | Coluna Angular (canto) | Módulo em L/diagonal | Minifix + especiais |

**Parâmetros configuráveis por módulo:**
- Largura, Altura, Profundidade (mm)
- Espessura das peças (mm)
- Material (select do mapeamento)
- Nº de prateleiras / gavetas
- Tipo de porta (abrir L/R, correr, basculante, sem porta)
- Tipo de junção (minifix ou cavilha)
- Puxador (modelo + posição)
- Com/sem fundo
- Com/sem tampo
- Recuo do fundo (encaixado ou sobreposto)

**Implementação técnica (Ruby):**
```
ornato_sketchup/
  library/
    parametric_engine.rb        # Motor que gera geometria a partir de params
    module_base.rb              # Classe base para módulos
    modules/
      armario_base.rb           # Cada módulo é uma subclasse
      armario_aereo.rb
      armario_torre.rb
      gaveteiro.rb
      nicho.rb
      porta_abrir.rb
      porta_correr.rb
      gaveta.rb
      prateleira.rb
      ...
    templates/                  # .skp pré-modelados como fallback
  ui/
    module_config.html          # Painel de configuração do módulo
    module_library.html         # Catálogo visual para arrastar
```

**Workflow do designer:**
```
1. Abre biblioteca Ornato (painel lateral)
2. Arrasta "Armário Base" para o modelo
3. Dialog abre com parâmetros:
   Largura: [1200] mm
   Altura:  [850]  mm
   Profundidade: [600] mm
   Material: [MDF Branco 18mm ▼]
   Prateleiras: [1]
   Porta: [2 portas abrir ▼]
   Puxador: [160mm ▼]
   Junção: [Minifix ▼]
4. Clica "Criar"
5. Módulo aparece no modelo com TODAS as peças corretas
6. Pode mover, duplicar, editar parâmetros depois
```

---

### FASE 3: Ferragens Visuais 3D + Edição Manual

**3A — Ferragens no modelo 3D**

Quando o plugin processa um módulo, ele coloca componentes 3D nos pontos de furação:

| Ferragem | Visual no SKP |
|----------|--------------|
| Dobradiça 35mm | Cilindro Ø35mm (amarelo) + 2 pontos piloto |
| Minifix corpo | Cilindro Ø15mm (azul) |
| Minifix parafuso | Cilindro Ø8mm (azul claro) |
| Cavilha | Cilindro Ø8mm (marrom) |
| Puxador | 2 círculos Ø5mm + linha conectando (verde) |
| Furo corrediça | Cilindros Ø4mm (laranja) |
| Canal fundo | Retângulo 4×8mm ao longo da peça (vermelho) |
| Furo System32 | Círculos Ø5mm em fileira (cinza) |

**Implementação:**
- Componentes .skp na pasta `library/components/`
- Cada componente tem atributos dinâmicos (diâmetro, profundidade, cor)
- Colocados automaticamente pelo Rules Engine nos pontos calculados
- Layer separado "Ornato_Ferragens" — toggle visibilidade on/off
- Podem ser selecionados e deletados (remove a furação correspondente)

**3B — Edição manual de furos**

O designer pode:
1. **Clicar na face de uma peça** → menu de contexto "Adicionar Furo Ornato"
2. **Escolher tipo:** Dobradiça, Minifix, Cavilha, Passante, Personalizado
3. **Clicar no ponto** da face onde quer o furo
4. **Ajustar:** diâmetro, profundidade, lado (A/B)
5. **Arrastar** furo existente para mover posição
6. **Duplicar** furo com offset (ex: fileira de furos)
7. **Deletar** furo (selecionar componente → Delete)

Isso cobre o caso onde as regras automáticas não são suficientes e o designer precisa de furação custom.

---

### FASE 4: Validação Inteligente + Catálogo Ferragens

**4A — Validação antes de exportar**

Quando o designer clica "Exportar", o plugin roda 15+ checagens:

| # | Validação | Severidade | Exemplo |
|---|-----------|-----------|---------|
| 1 | Peça sem material | ERRO | "Lateral Esq não tem material definido" |
| 2 | Espessura suspeita | AVISO | "Base tem 3mm — é fundo? Reclassifique" |
| 3 | Dimensão zero/negativa | ERRO | "Prateleira tem largura 0mm" |
| 4 | Furo fora da peça | ERRO | "Furo em X=900 mas peça tem 800mm" |
| 5 | Furo muito perto da borda | AVISO | "Minifix a 15mm da borda (mín: 37mm)" |
| 6 | Junção sem ferragem | AVISO | "Lateral×Base não tem minifix nem cavilha" |
| 7 | Dobradiça sem porta | AVISO | "Lateral tem furação dobradiça mas sem porta associada" |
| 8 | Bordas inconsistentes | AVISO | "Frontal tem fita mas traseira não — intencional?" |
| 9 | Material não mapeado | ERRO | "Material 'Texture1' não tem código Ornato" |
| 10 | Peça duplicada | AVISO | "2 peças idênticas (mesma pos/dim) — duplicata?" |
| 11 | Módulo sem peças | ERRO | "Grupo 'Armário' não tem peças detectadas" |
| 12 | Furo conflitante | ERRO | "2 furos se sobrepõem em X=22, Y=100" |
| 13 | Peça não-retangular | AVISO | "Peça 'Recorte' tem geometria não-retangular" |
| 14 | Quantidade total | INFO | "42 peças em 5 módulos — confirma?" |
| 15 | Conexão ERP | INFO | "Ornato ERP acessível em localhost:3001" |

**UI:** Dialog com lista de erros/avisos, cada um clicável (seleciona a peça no modelo). Botão "Exportar mesmo assim" para avisos. Erros bloqueiam.

**4B — Catálogo de ferragens**

Base de dados de ferragens reais com specs:

```
ferragens/
  dobradicas/
    blum_clip_top_110.json    # { marca, modelo, angulo: 110, cup: 35, profundidade: 11.5, piloto_dist: 24, ... }
    blum_clip_top_155.json
    hettich_sensys_110.json
    hafele_concepta.json
    grass_tiomos_110.json
    generica_35mm.json        # Padrão genérico
  minifix/
    hafele_minifix_15.json    # { corpo_diam: 15, corpo_prof: 12.5, pino_diam: 8, pino_prof: 11, ... }
    hettich_vb36.json
    generico_15mm.json
  corredicas/
    blum_tandem_350.json      # { tipo: 'oculta', comprimento: 350, furos: [{x: 37, y: 0}, ...], ... }
    blum_tandem_450.json
    hettich_actro_500.json
    telescopica_400.json
    generica_350.json
  puxadores/
    modelo_128mm.json         # { entre_furos: 128, furo_diam: 5, ... }
    modelo_160mm.json
    modelo_192mm.json
    modelo_256mm.json
    modelo_320mm.json
  cavilhas/
    cavilha_8x30.json         # { diam: 8, comprimento: 30, furo_prof: 15, ... }
    cavilha_6x30.json
    cavilha_10x40.json
```

Quando o designer configura ferragens, ele escolhe de um dropdown com marcas/modelos reais. Os parâmetros de furação vêm da spec da ferragem, não de valores genéricos.

---

### FASE 5: Polimento Profissional

| # | Feature | Descrição |
|---|---------|-----------|
| 1 | **Cotas automáticas** | Ao processar módulo, adiciona dimensões no modelo (SketchUp Dimensions) |
| 2 | **Toolbar com ícones SVG** | Barra de ferramentas visual profissional (não só menus texto) |
| 3 | **Atalhos de teclado** | Ctrl+Shift+A = Analisar, Ctrl+Shift+P = Processar, Ctrl+Shift+E = Exportar |
| 4 | **Observer pattern** | Plugin detecta quando peça é movida/redimensionada e recalcula furações |
| 5 | **Undo integrado** | Todas operações do plugin usam model.start_operation / commit |
| 6 | **Relatório imprimível** | Gera PDF direto do SketchUp com lista de peças + ferragens |
| 7 | **Templates de projeto** | Salvar/carregar configurações de projeto (materiais, ferragens, offsets) |
| 8 | **Modo batch** | Processar todos os módulos de uma vez |
| 9 | **Dark mode** | UI se adapta ao tema do SketchUp |
| 10 | **Localização** | PT-BR + EN + ES (para expandir mercado) |

---

## 5. Comparação Final: Ornato vs Concorrentes

### Quando plugin + ERP estiverem completos:

| Feature | DinaBox | Gabster | Mozaik | **Ornato** |
|---------|---------|---------|--------|-----------|
| Modelagem paramétrica | ✅ | ✅ | ✅ | ✅ 15 módulos |
| Furação automática | ✅ | ✅ | ✅ | ✅ 8 regras |
| Ferragens 3D no modelo | ✅ | ✅ | ✅ | ✅ |
| Edição manual furos | ✅ | ✅ | ✅ | ✅ |
| Validação modelo | ✅ | ✅ | ✅ | ✅ 15 checks |
| Catálogo ferragens reais | ✅ | ✅ | ✅ Blum/Hettich | ✅ Multi-marca |
| Export CNC | ✅ | ✅ | ✅ 175+ | ✅ JSON→ERP→G-Code |
| **Orçamento web** | Plugin | Nuvem deles | Plugin | **✅ ERP web** |
| **Produção web** | PCP | Nuvem deles | Não | **✅ ERP completo** |
| **QR + Vista explodida** | ❌ | ❌ | ❌ | **✅ EXCLUSIVO** |
| **Modo operador** | ❌ | ❌ | ❌ | **✅ EXCLUSIVO** |
| **Guia montagem** | ❌ | ❌ | ❌ | **✅ EXCLUSIVO** |
| **Rastreio entrega** | ❌ | ❌ | ❌ | **✅ EXCLUSIVO** |
| **Multi-device** | ❌ PC only | Web deles | ❌ Win only | **✅ Qualquer device** |
| **Preço** | Caro | Caro | $125-325/mês | **Acessível** |

### Diferenciais EXCLUSIVOS do Ornato (nenhum concorrente tem):

1. **Plugin leve + ERP web completo** — O melhor dos 2 mundos
2. **QR Scan com vista explodida 3D do módulo** — Montador vê onde a peça encaixa
3. **Checklist de montagem automático** — Ordem + ferragens por peça
4. **Modo operador chão de fábrica** — TV/tablet com fila em tempo real
5. **Guia de montagem passo a passo** — Gerado automaticamente
6. **Dashboard de desperdício** — Histórico por mês e material
7. **Sugestão de agrupamento** — Junta lotes com mesmo material
8. **Retalhos inteligentes** — Match de sobras com peças futuras
9. **Rastreio GPS de entrega**
10. **Push notifications** quando chapa termina corte

---

## 6. Modelo de Negócio

| Tier | Preço | Inclui |
|------|-------|--------|
| **Plugin Grátis** | R$ 0 | Plugin SketchUp completo (modelagem + export JSON) |
| **ERP Starter** | R$ X/mês | Import + Nesting + G-Code + Etiquetas |
| **ERP Pro** | R$ Y/mês | + Orçamento + Proposta + Financeiro + Dashboard |
| **ERP Enterprise** | R$ Z/mês | + Multi-user + API + Webhooks + Suporte priority |

**Estratégia:** Plugin grátis atrai designers. Quando a marcenaria quer produzir, precisa do ERP. O plugin é o funil de vendas do ERP.

---

## 7. Cronograma

| Fase | Escopo | Sessões | Status |
|------|--------|---------|--------|
| 1 | Plugin base + Rules Engine + Export | 3-4 | ✅ FEITO |
| 2 | Módulos paramétricos (15 componentes) | 4-5 | PRÓXIMO |
| 3 | Ferragens 3D + Edição manual furos | 3-4 | - |
| 4 | Validação + Catálogo ferragens | 2-3 | - |
| 5 | Polimento (cotas, toolbar, atalhos, i18n) | 2-3 | - |
| | **TOTAL** | **14-19 sessões** | |

---

## 8. Arquivos do Plugin (estado atual)

```
cnc/sketchup-plugin/                    28 arquivos, 6.364 linhas
├── ornato_loader.rb                     24 linhas  — Extension registration
├── ornato_sketchup/
│   ├── main.rb                         187 linhas  — Menus, toolbar, ações
│   ├── config.rb                       121 linhas  — Persistência configs
│   ├── core/
│   │   ├── model_analyzer.rb           203 linhas  — Traversal modelo 3D
│   │   ├── piece_detector.rb           273 linhas  — Detecta peças retangulares
│   │   ├── joint_detector.rb           293 linhas  — Detecta junções
│   │   ├── material_mapper.rb          228 linhas  — Material SKP→Ornato
│   │   ├── edge_banding.rb             259 linhas  — Bordas expostas
│   │   └── hierarchy_builder.rb        322 linhas  — Grupo→Módulo→Peça
│   ├── hardware/
│   │   ├── rules_engine.rb             362 linhas  — Orquestrador
│   │   ├── hinge_rule.rb              165 linhas  — Dobradiça 35mm
│   │   ├── system32_rule.rb           115 linhas  — Sistema 32
│   │   ├── minifix_rule.rb            182 linhas  — Cam lock
│   │   ├── dowel_rule.rb             151 linhas  — Cavilha
│   │   ├── handle_rule.rb            158 linhas  — Puxador
│   │   ├── drawer_slide_rule.rb      146 linhas  — Corrediça
│   │   ├── back_panel_rule.rb        148 linhas  — Rebaixo fundo
│   │   └── shelf_rule.rb             133 linhas  — Prateleira fixa
│   ├── machining/
│   │   └── machining_json.rb          311 linhas  — Serialização CNC
│   ├── export/
│   │   ├── json_exporter.rb           197 linhas  — JSON→Ornato
│   │   ├── csv_exporter.rb            175 linhas  — CSV lista corte
│   │   ├── bom_exporter.rb            277 linhas  — BOM ferragens
│   │   └── api_sync.rb               204 linhas  — Sync HTTP→ERP
│   └── ui/
│       ├── main_panel.html            271 linhas  — Painel principal
│       ├── material_map.html          266 linhas  — Mapeamento materiais
│       ├── hardware_config.html       451 linhas  — Config ferragens (8 tabs)
│       ├── drilling_preview.html      422 linhas  — Canvas 2D furações
│       └── export_preview.html        320 linhas  — Preview pré-export
```
