# Plano de Engenharia: Integração SketchUp + Ornato ERP

**Data:** 2026-03-06
**Versão:** 2.0 — Escopo completo de manufatura
**Status:** PROPOSTA

---

## 1. Visão Geral

### O que é
Plugin SketchUp completo para marcenaria que transforma o SketchUp em ferramenta de **projeto + engenharia de produção**. O designer modela o móvel, o plugin automaticamente gera:

- Lista completa de peças com dimensões
- **Todas as furações** (dobradiça, minifix, cavilha, Sistema 32, puxador, corrediça)
- **Todas as usinagens** (rebaixos para fundo, canais para trilho, fresagens)
- **Fita de borda** por aresta
- **BOM completo** (cada parafuso, cavilha, minifix, dobradiça)
- Exporta JSON no formato que o CNC do Ornato **já consome**

### Descoberta importante
O sistema CNC do Ornato (`ProducaoCNC.jsx` + `cnc.js`) **já é avançado**:
- ✅ Importa JSON com operações de usinagem (`machining_json`)
- ✅ Gera G-code com furos, rasgos, rebaixos, contornos complexos
- ✅ Nesting com 5+ algoritmos (MaxRects, Guillotine, BRKGA genético)
- ✅ Multi-fase: usinagens internas → contornos → sobras
- ✅ Lead-in, ramp, onion-skin, vacuum-aware ordering
- ✅ Gerenciamento de ferramentas e máquinas

**O que falta = o PLUGIN que gera os dados de manufatura dentro do SketchUp.**

### Inspiração direta
- **UPMob** (o JSON de importação já segue formato UPMob: `model_entities`, `machining.workers`)
- **DinaBox** (plugin SketchUp completo com regras de produção)
- **Promob** (engenharia de furação automática)

---

## 2. Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                    SKETCHUP + PLUGIN ORNATO                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  1. MODELAGEM                                              │  │
│  │  Designer modela móvel com componentes paramétricos         │  │
│  │  (gaveta, porta, lateral, base, prateleira)                │  │
│  └──────────────────────┬─────────────────────────────────────┘  │
│                         │                                        │
│  ┌──────────────────────▼─────────────────────────────────────┐  │
│  │  2. MOTOR DE REGRAS (Ruby)                                 │  │
│  │                                                            │  │
│  │  Peça detectada → aplica regras automáticas:               │  │
│  │                                                            │  │
│  │  LATERAL com dobradiça?                                    │  │
│  │  → Furo 35mm (cup) a 22.5mm da borda + 2x Ø3mm pilot     │  │
│  │  → Repetir em Y conforme nº dobradiças (4 se A>800)       │  │
│  │                                                            │  │
│  │  LATERAL com prateleira?                                   │  │
│  │  → Sistema 32: fileira de Ø5mm×12mm a cada 32mm           │  │
│  │  → Offset 37mm da borda frontal, 37mm da traseira         │  │
│  │                                                            │  │
│  │  BASE + LATERAL junção?                                    │  │
│  │  → Cavilha Ø8mm×30mm a cada 128mm                         │  │
│  │  → OU Minifix Ø15mm na lateral + Ø8mm na base             │  │
│  │                                                            │  │
│  │  FUNDO?                                                    │  │
│  │  → Rebaixo 3mm×10mm em laterais e base                    │  │
│  │                                                            │  │
│  │  GAVETA com corrediça?                                     │  │
│  │  → Furos de fixação conforme modelo da corrediça           │  │
│  └──────────────────────┬─────────────────────────────────────┘  │
│                         │                                        │
│  ┌──────────────────────▼─────────────────────────────────────┐  │
│  │  3. EXPORTAÇÃO JSON (formato CNC Ornato)                   │  │
│  │                                                            │  │
│  │  {                                                         │  │
│  │    model_entities: { peças com dims, materiais, bordas }   │  │
│  │    machining: { por peça: workers com furos + usinagens }  │  │
│  │  }                                                         │  │
│  └──────────────────────┬─────────────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │
                     JSON export
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ORNATO ERP (já existe)                         │
│                                                                  │
│  Import JSON → Nesting → G-code → Etiquetas → Máquina CNC       │
│                                                                  │
│  + Orçamento → Proposta → Financeiro → Produção                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Regras de Furação Automática

### 3.1 Dobradiça (35mm cup boring)

```
Peça: LATERAL (quando recebe porta)

Furo principal: Ø35mm × 12.5mm profundidade
  X = 22.5mm da borda frontal (face visível)
  Y = calculado conforme altura da porta:
    - Porta até 600mm: 2 dobradiças (100mm do topo/base)
    - Porta até 1200mm: 3 dobradiças (100mm + centro)
    - Porta até 1800mm: 4 dobradiças (100mm + espaçados)
    - Porta até 2400mm: 5 dobradiças

Furos piloto: 2x Ø2.5mm × 10mm
  Espaçamento: 24mm do centro do furo 35mm (horizontal)

Face: Lado interno da lateral (side_a)
```

### 3.2 Sistema 32 (shelf pin holes)

```
Peça: LATERAL (quando tem prateleiras reguláveis)

Furo: Ø5mm × 12mm
  2 fileiras verticais:
    Fileira frontal: X = 37mm da borda frontal
    Fileira traseira: X = 37mm da borda traseira

  Espaçamento Y: 32mm (padrão europeu)
  Início: 37mm da borda inferior
  Fim: 37mm da borda superior

  Quantidade = (altura_util - 74mm) / 32mm + 1

Face: Lado interno da lateral (side_a)
```

### 3.3 Minifix (cam lock)

```
Junção: LATERAL × BASE (ou LATERAL × TOPO)

Na LATERAL (peça de apoio):
  Furo passante: Ø8mm (para o parafuso minifix)
  X = 37mm da borda (centralizado na espessura da base)
  Espaçamento: ~128mm entre furos
  Min: 50mm de cada extremidade
  Face: side_b (externo)

Na BASE (peça recebedora):
  Furo: Ø15mm × 12mm (para o corpo minifix)
  Furo: Ø8mm × 11mm (para o pino, centrado no Ø15)
  X = Espessura/2 (centroimbalanced na borda de junção)
  Face: side_a (topo)
```

### 3.4 Cavilha (dowel)

```
Junção: qualquer (alternativa ao minifix)

Em AMBAS as peças da junção:
  Furo: Ø8mm × 15mm (metade da cavilha em cada peça)
  Espaçamento: 128mm (ou 96mm para peças curtas)
  Min: 50mm de cada extremidade

  Na peça lateral: furo na FACE (side_b)
  Na peça base: furo na BORDA (topo da chapa)
```

### 3.5 Puxador

```
Peça: PORTA ou FRENTE DE GAVETA

Furos passantes: 2x Ø5mm (atravessa toda a espessura)
  Espaçamento horizontal: conforme puxador (128, 160, 192, 256, 320mm)

  Posição padrão:
    Porta: Y = 100mm do topo, X = 37mm da borda (ou centralizado)
    Gaveta: Y = centralizado, X = centralizado

  Face: passante (depth = espessura + 1mm)
```

### 3.6 Corrediça de Gaveta

```
Peça: LATERAL DO CORPO (recebe trilho)

Padrão de furos conforme modelo:
  Telescópica 350mm: 3 furos Ø4mm (frente: 37mm, meio: 212mm, fundo: 350mm)
  Telescópica 400mm: 3 furos Ø4mm (frente: 37mm, meio: 237mm, fundo: 400mm)
  Telescópica 500mm: 4 furos Ø4mm (frente: 37mm, 2: 200mm, 3: 350mm, 4: 500mm)
  Oculta/Tandem: furação própria do fabricante

  Y = conforme posição da gaveta (calculado)
  Face: side_a (interno)
```

### 3.7 Rebaixo para Fundo

```
Peça: LATERAL, BASE (recebem fundo encaixado)

Usinagem: Rasgo/canal
  Tipo: groove (Transfer_vertical_saw_cut)
  Largura: espessura_fundo + 1mm (ex: 4mm para fundo 3mm)
  Profundidade: 8mm

  Posição: offset da borda traseira = espessura_fundo + 5mm
  Direção: percorre todo o comprimento da peça

  Na LATERAL: rasgo horizontal (X completo, Y fixo)
  Na BASE: rasgo horizontal (X completo, Y fixo)

  OU alternativa: Rebaixo (pocket) se fundo colado
    Pocket retangular no fundo inteiro da peça
    Profundidade: espessura_fundo + 0.5mm
```

---

## 4. Formato JSON de Saída (compatível com CNC Ornato)

O plugin gera exatamente o JSON que `parsePluginJSON()` em `cnc.js` espera:

```json
{
  "details_project": {
    "client_name": "João Silva",
    "project_name": "Cozinha Ap 302",
    "project_code": "PRJ-2026-042",
    "seller_name": "Maria"
  },

  "model_entities": {
    "0": {
      "upmmasterdescription": "Armário Baixo Pia",
      "entities": {
        "0": {
          "upmpersistentid": "lat_esq_001",
          "upmcode": "AB_LE",
          "upmpiece": true,
          "upmdescription": "Lateral Esquerda",
          "upmmasterid": 0,
          "upmmasterdescription": "Armário Baixo Pia",
          "upmquantity": 1,
          "upmheight": 800,
          "upmdepth": 560,
          "upmwidth": 18,
          "upmedgeside1": "22mm_branco",
          "upmedgeside2": "",
          "upmedgeside3": "22mm_branco",
          "upmedgeside4": "",
          "entities": {
            "0": {
              "upmfeedstockpanel": true,
              "upmmaterialcode": "MDF_18_BRANCO",
              "upmmaterialdescription": "MDF Branco TX 18mm",
              "upmcutlength": 2750,
              "upmcutwidth": 1830,
              "upmrealthickness": 18.0
            }
          }
        }
      }
    }
  },

  "machining": {
    "lat_esq_001": {
      "workers": {
        "dob_cup_1": {
          "category": "hole",
          "type": "transfer_hole",
          "position_x": 22.5,
          "position_y": 100,
          "diameter": 35,
          "depth": 12.5,
          "side": "a",
          "tool_code": "broca_35mm"
        },
        "dob_pilot_1a": {
          "category": "hole",
          "position_x": 22.5,
          "position_y": 76,
          "diameter": 2.5,
          "depth": 10,
          "side": "a",
          "tool_code": "broca_2.5mm"
        },
        "dob_pilot_1b": {
          "category": "hole",
          "position_x": 22.5,
          "position_y": 124,
          "diameter": 2.5,
          "depth": 10,
          "side": "a",
          "tool_code": "broca_2.5mm"
        },
        "dob_cup_2": {
          "category": "hole",
          "type": "transfer_hole",
          "position_x": 22.5,
          "position_y": 700,
          "diameter": 35,
          "depth": 12.5,
          "side": "a"
        },
        "sys32_front_1": {
          "category": "hole",
          "position_x": 37,
          "position_y": 37,
          "diameter": 5,
          "depth": 12,
          "side": "a"
        },
        "sys32_front_2": {
          "category": "hole",
          "position_x": 37,
          "position_y": 69,
          "diameter": 5,
          "depth": 12,
          "side": "a"
        },
        "rebaixo_fundo": {
          "category": "Transfer_vertical_saw_cut",
          "tool_code": "fresa_4mm",
          "pos_start_for_line": { "position_x": 0, "position_y": 548 },
          "pos_end_for_line": { "position_x": 800, "position_y": 548 },
          "width_line": 4,
          "depth": 8,
          "side": "a"
        },
        "minifix_base_1": {
          "category": "hole",
          "position_x": 9,
          "position_y": 100,
          "diameter": 8,
          "depth": 18,
          "side": "b"
        }
      }
    }
  }
}
```

---

## 5. Plugin SketchUp — Estrutura Completa

### 5.1 Arquivos

```
ornato_sketchup/
├── ornato_loader.rb                    # Extension registration
├── ornato_sketchup/
│   ├── main.rb                         # Entry, menus, toolbar
│   ├── config.rb                       # Persistência de configurações
│   │
│   ├── core/
│   │   ├── model_analyzer.rb           # Traversal do modelo 3D
│   │   ├── piece_detector.rb           # Detecta peças retangulares
│   │   ├── joint_detector.rb           # Detecta junções entre peças
│   │   ├── material_mapper.rb          # Material SKP → código Ornato
│   │   ├── edge_banding.rb             # Detecção de bordas expostas
│   │   └── hierarchy_builder.rb        # Group → Módulo → Peça → Junção
│   │
│   ├── hardware/                       # ★ MOTOR DE REGRAS DE FURAÇÃO
│   │   ├── rules_engine.rb             # Orquestrador de regras
│   │   ├── hinge_rule.rb              # Dobradiça 35mm + piloto
│   │   ├── system32_rule.rb           # Sistema 32 (shelf pins)
│   │   ├── minifix_rule.rb            # Minifix (cam lock)
│   │   ├── dowel_rule.rb             # Cavilha
│   │   ├── handle_rule.rb            # Puxador (furos passantes)
│   │   ├── drawer_slide_rule.rb      # Corrediça de gaveta
│   │   ├── back_panel_rule.rb        # Rebaixo/canal para fundo
│   │   ├── shelf_rule.rb             # Furação para prateleira fixa
│   │   └── custom_rule.rb            # Regras customizáveis
│   │
│   ├── machining/                     # Geração de operações CNC
│   │   ├── hole_generator.rb         # Gera workers type=hole
│   │   ├── groove_generator.rb       # Gera workers type=groove/saw_cut
│   │   ├── pocket_generator.rb       # Gera workers type=pocket
│   │   ├── contour_generator.rb      # Contornos complexos (curvas)
│   │   └── machining_json.rb         # Serializa para JSON compatível
│   │
│   ├── export/
│   │   ├── json_exporter.rb          # Export JSON completo (CNC)
│   │   ├── csv_exporter.rb           # Export CSV (lista de corte)
│   │   ├── bom_exporter.rb           # Export BOM (ferragens)
│   │   └── api_sync.rb              # Sync direto com Ornato API
│   │
│   ├── library/                       # Componentes dinâmicos pré-feitos
│   │   ├── hinge_35mm.skp           # Dobradiça visual (para posicionar)
│   │   ├── minifix_15mm.skp         # Minifix visual
│   │   ├── dowel_8mm.skp            # Cavilha visual
│   │   ├── handle_*.skp             # Puxadores (vários tamanhos)
│   │   ├── drawer_slide_*.skp       # Corrediças (350, 400, 500)
│   │   └── shelf_pin_5mm.skp        # Suporte de prateleira
│   │
│   └── ui/
│       ├── main_panel.html           # Painel principal lateral
│       ├── hardware_config.html      # Config de ferragens por peça
│       ├── material_map.html         # Mapeamento de materiais
│       ├── export_preview.html       # Preview antes de exportar
│       ├── drilling_preview.html     # Visualização 2D das furações
│       └── assets/
│           ├── ornato.css
│           └── ornato.js
├── icons/
└── README.md
```

### 5.2 Motor de Regras (rules_engine.rb)

```ruby
module Ornato
  class RulesEngine
    RULES = [
      HingeRule,          # Detecta porta → gera furação dobradiça
      System32Rule,       # Detecta lateral c/ prateleira → Sistema 32
      MinifixRule,        # Detecta junção L/T → minifix ou cavilha
      DowelRule,          # Alternativa ao minifix
      HandleRule,         # Detecta porta/gaveta → furos puxador
      DrawerSlideRule,    # Detecta gaveta → furos corrediça
      BackPanelRule,      # Detecta fundo → rebaixo/canal
      ShelfRule,          # Prateleira fixa → furação de apoio
    ]

    def initialize(config)
      @config = config
      @rules = RULES.map { |r| r.new(config) }
    end

    # Analisa módulo completo e gera todas as operações
    def process_module(module_group)
      pieces = detect_pieces(module_group)
      joints = detect_joints(pieces)
      hardware = detect_hardware(module_group)

      machining = {}

      pieces.each do |piece|
        workers = {}
        op_counter = 0

        # Cada regra analisa a peça no contexto do módulo
        @rules.each do |rule|
          if rule.applies?(piece, joints, hardware)
            new_ops = rule.generate(piece, joints, hardware)
            new_ops.each do |op|
              workers["op_#{op_counter}"] = op
              op_counter += 1
            end
          end
        end

        machining[piece.persistent_id] = { "workers" => workers }
      end

      machining
    end
  end
end
```

### 5.3 Exemplo de Regra: Dobradiça

```ruby
module Ornato
  class HingeRule
    DEFAULTS = {
      cup_diameter: 35,
      cup_depth: 12.5,
      pilot_diameter: 2.5,
      pilot_depth: 10,
      pilot_spacing: 24,      # mm do centro do cup
      edge_offset: 22.5,      # mm da borda frontal
      top_bottom_offset: 100,  # mm do topo e base
    }

    def initialize(config)
      @cfg = DEFAULTS.merge(config[:hinge] || {})
    end

    def applies?(piece, joints, hardware)
      # Aplica se: peça é lateral E tem porta associada via junção
      piece.role == :lateral &&
        joints.any? { |j| j.involves?(piece) && j.partner_role == :door }
    end

    def generate(piece, joints, hardware)
      door_joint = joints.find { |j| j.involves?(piece) && j.partner_role == :door }
      door_height = door_joint.partner.height

      # Calcular número de dobradiças
      n_hinges = case door_height
        when 0..600 then 2
        when 601..1200 then 3
        when 1201..1800 then 4
        else 5
      end

      # Calcular posições Y
      positions = calculate_positions(door_height, n_hinges)

      ops = []
      positions.each_with_index do |y_pos, i|
        # Furo principal 35mm
        ops << {
          "category" => "hole",
          "type" => "transfer_hole",
          "position_x" => @cfg[:edge_offset],
          "position_y" => y_pos,
          "diameter" => @cfg[:cup_diameter],
          "depth" => @cfg[:cup_depth],
          "side" => "a",
          "tool_code" => "broca_35mm",
          "description" => "Dobradiça #{i+1} - cup"
        }

        # Furos piloto
        [-1, 1].each_with_index do |dir, pi|
          ops << {
            "category" => "hole",
            "position_x" => @cfg[:edge_offset],
            "position_y" => y_pos + (dir * @cfg[:pilot_spacing]),
            "diameter" => @cfg[:pilot_diameter],
            "depth" => @cfg[:pilot_depth],
            "side" => "a",
            "tool_code" => "broca_2.5mm",
            "description" => "Dobradiça #{i+1} - piloto #{pi+1}"
          }
        end
      end

      ops
    end

    private

    def calculate_positions(height, count)
      return [height / 2.0] if count == 1

      top = @cfg[:top_bottom_offset]
      bottom = height - @cfg[:top_bottom_offset]

      if count == 2
        [top, bottom]
      else
        step = (bottom - top).to_f / (count - 1)
        (0...count).map { |i| top + (i * step) }
      end
    end
  end
end
```

---

## 6. Workflow do Designer

```
1. MODELAR no SketchUp
   └── Usa componentes normais (grupos para peças)
   └── Aplica materiais (MDF 18mm, BP, etc)
   └── Organiza em módulos (Armário = grupo pai)

2. DEFINIR HARDWARE (Plugin Ornato)
   └── Seleciona lateral → "Adicionar Dobradiça"
   └── Seleciona módulo → "Adicionar Sistema 32"
   └── Seleciona junção → "Adicionar Minifix" ou "Cavilha"
   └── Plugin mostra preview 3D das ferragens
   └── Pode arrastar componentes da biblioteca (dobradiça, minifix)

3. GERAR AUTOMATICAMENTE
   └── Plugin → "Processar Módulo"
   └── Motor de regras analisa:
       - Quais peças existem
       - Quais junções entre elas
       - Quais ferragens foram definidas
   └── Gera TODAS as furações e usinagens
   └── Mostra preview 2D por peça (mapa de furação)

4. REVISAR
   └── Designer vê cada peça com furos plotados
   └── Pode editar/adicionar/remover furos manualmente
   └── Pode alterar parâmetros (offset, espaçamento)

5. EXPORTAR
   └── Plugin → "Exportar para Ornato"
   └── Gera JSON com model_entities + machining
   └── Opção: salvar arquivo OU sync direto via API

6. PRODUZIR (Ornato ERP — já funciona)
   └── Import no CNC → Nesting → G-code → Máquina
   └── Etiquetas com QR → Rastreamento
   └── Orçamento automático com custos
```

---

## 7. Detecção de Junções

A parte mais inteligente do plugin: detectar automaticamente como as peças se conectam.

### 7.1 Algoritmo de Detecção

```ruby
def detect_joints(pieces)
  joints = []

  pieces.combination(2).each do |a, b|
    # Verificar se faces estão próximas (< 1mm)
    contact = find_contact_face(a, b)
    next unless contact

    joint = Joint.new(
      piece_a: a,
      piece_b: b,
      type: classify_joint(contact),  # :butt, :rabbet, :dado, :miter
      face_a: contact[:face_a],       # :top, :bottom, :left, :right, :front, :back
      face_b: contact[:face_b],
      contact_area: contact[:area],
      offset: contact[:offset]
    )

    joints << joint
  end

  joints
end

def classify_joint(contact)
  # Face → Borda = Butt joint (cavilha ou minifix)
  # Face → Face = sobreposto (parafuso)
  # Borda encaixada = Rabbet (rebaixo)
  if contact[:face_a_type] == :face && contact[:face_b_type] == :edge
    :butt
  elsif contact[:face_a_type] == :face && contact[:face_b_type] == :face
    :overlay
  else
    :dado
  end
end
```

### 7.2 Tipos de Junção

| Junção | Peças | Hardware padrão | Furação |
|--------|-------|-----------------|---------|
| Lateral × Base | butt joint | Minifix OU Cavilha | Ø15+Ø8 OU 2×Ø8 |
| Lateral × Topo | butt joint | Minifix OU Cavilha | Ø15+Ø8 OU 2×Ø8 |
| Lateral × Porta | overlay | Dobradiça 35mm | Ø35 + 2×Ø2.5 |
| Lateral × Fundo | dado/rabbet | Encaixe (rebaixo) | Canal 4×8mm |
| Lateral × Divisória | butt joint | Cavilha | 2×Ø8 |
| Lateral × Prateleira | adjustable | Sistema 32 | Ø5×12mm |
| Gaveta × Corrediça | face mount | Parafusos | 3-4× Ø4mm |
| Porta × Puxador | through | Passante | 2× Ø5mm |

---

## 8. Fases de Implementação

### Fase 1: Plugin Básico + Furação Manual (3-4 sessões)

**O que:** Plugin SketchUp funcional que detecta peças e permite adicionar furações manualmente.

**Escopo:**
- Estrutura do plugin Ruby (.rbz)
- Detecção de peças (BoundingBox analysis)
- Material mapping (HtmlDialog)
- **Ferragens manuais:** designer clica na peça e escolhe "Adicionar Dobradiça aqui" com posição XY
- Export JSON no formato CNC Ornato
- Import funciona no ProducaoCNC existente

**Valor:** Designer exporta peças COM furações do SketchUp para CNC. Já funciona end-to-end.

---

### Fase 2: Regras Automáticas de Furação (3-4 sessões)

**O que:** Motor de regras que auto-gera furações baseado em tipos de peça e junções.

**Escopo:**
- Detecção de junções entre peças
- `HingeRule` — Dobradiça automática
- `System32Rule` — Prateleiras reguláveis
- `MinifixRule` + `DowelRule` — Junções
- `BackPanelRule` — Rebaixo para fundo
- `HandleRule` — Puxador
- Preview 2D de furações (HtmlDialog com canvas)

**Valor:** "Processar Módulo" gera 90% das furações automaticamente. Designer só revisa.

---

### Fase 3: Corrediças + Usinagens Complexas (2-3 sessões)

**O que:** Regras para gavetas, canais, rebaixos, corrediças de correr.

**Escopo:**
- `DrawerSlideRule` — Padrões de furação por modelo de corrediça
- `GrooveRule` — Canais para trilho de correr
- Rebaixos complexos (pocket para fundo não encaixado)
- Editor de padrões customizados (designer cria suas regras)
- Biblioteca de padrões de furação (importar/exportar)

---

### Fase 4: Biblioteca de Componentes Paramétricos (3-4 sessões)

**O que:** Dynamic Components pré-modelados com regras de produção embutidas.

**Escopo:**
- 15-20 componentes paramétricos:
  - Armário base (configura L, A, P, espessura)
  - Armário aéreo
  - Gaveteiro (1-6 gavetas)
  - Torre (forno, geladeira)
  - Porta (abrir, correr, basculante)
  - Prateleira regulável
  - Cabideiro
  - Sapateira
- Cada componente já tem hardware tagueado
- "Processar" gera todas as furações instantaneamente
- Download da biblioteca via Ornato ERP

---

### Fase 5: Sync Bidirecional + BOM + Orçamento (2-3 sessões)

**O que:** Integração completa plugin ↔ Ornato ERP.

**Escopo:**
- API sync (plugin → Ornato, Ornato → plugin)
- BOM automático (lista de TODAS as ferragens com qtd e preço)
- Orçamento automático a partir do modelo 3D
- Atualização do nesting existente ao reprocessar modelo
- Dashboard de status no plugin (projeto exportado? cortado? montado?)

---

## 9. Cronograma

| Fase | Sessões | Acumulado | Entrega |
|------|---------|-----------|---------|
| 1. Plugin + Furação Manual | 3-4 | 3-4 | Export funcional SKP → CNC |
| 2. Regras Automáticas | 3-4 | 6-8 | Auto-furação 90% dos casos |
| 3. Gavetas + Usinagens | 2-3 | 8-11 | Cobertura completa |
| 4. Componentes Paramétricos | 3-4 | 11-15 | Biblioteca de móveis |
| 5. Sync + BOM + Orçamento | 2-3 | 13-18 | Sistema integrado completo |

---

## 10. O que NÃO precisa mudar no Ornato

- ✅ `ProducaoCNC.jsx` — Já consome o JSON do plugin
- ✅ `cnc.js` — Já gera G-code com furos, rasgos, pockets
- ✅ `PlanoCorte.jsx` — Nesting já funciona
- ✅ `engine.js` — Cálculo de custos
- ✅ Database CNC — Tabelas já existem

**O trabalho é 95% no plugin Ruby do SketchUp.** O Ornato ERP já está pronto para receber.

---

## 11. Formato JSON: Compatibilidade UPMob

O CNC do Ornato já parseia o formato UPMob (`parsePluginJSON` em cnc.js). O plugin Ornato exporta no **mesmo formato**, garantindo:

- Zero mudanças no backend
- Testes instantâneos (importa no CNC → gera G-code → verifica)
- Compatibilidade com projetos UPMob existentes
- Migração gradual (pode usar UPMob e plugin Ornato ao mesmo tempo)

---

## 12. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Detecção de junções falha em modelos complexos | Furações erradas | Preview obrigatório + edição manual |
| SketchUp Free não suporta plugins | Metade dos marceneiros | Suportar import CSV como fallback |
| Precisão de furação (tolerância) | Peças não encaixam | Padrões conservadores + compensação configurável |
| Modelo mal organizado (peças não agrupadas) | Plugin não detecta | Wizard de organização + validação |
| Performance em modelos grandes (500+ peças) | Plugin lento | Processamento incremental por módulo |

---

## 13. Tecnologias

| Componente | Tecnologia | Motivo |
|-----------|-----------|--------|
| Plugin core | Ruby 2.7+ | SketchUp API nativa |
| UI do plugin | HTML/CSS/JS (HtmlDialog) | Interface moderna dentro do SKP |
| Detecção geométrica | SketchUp Ruby API (BoundingBox, Transformation) | Acesso direto ao modelo |
| Serialização | JSON (built-in Ruby) | Compatível com Ornato CNC |
| Preview 2D | Canvas HTML5 | Dentro do HtmlDialog |
| Backend Ornato | Node.js + Express (existente) | Nenhuma mudança necessária |
| Frontend Ornato | React + Vite (existente) | Nenhuma mudança necessária |
