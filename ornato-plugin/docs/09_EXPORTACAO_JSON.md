# Exportacao JSON

## Visao geral

O plugin exporta os dados do modelo SketchUp em formato JSON compativel com o padrao UPMobb/Ornato. Este JSON e enviado ao ERP para geracao de planos de corte, programas CNC e listas de materiais.

## Estrutura raiz do JSON

```json
{
  "format_version": "1.0",
  "plugin_version": "0.1.0",
  "exported_at": "2025-01-15T14:30:00-03:00",
  "sketchup_version": "2024",
  "model_name": "Cozinha Completa",
  "model_entities": [ ... ],
  "machining": [ ... ]
}
```

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `format_version` | string | Versao do formato de exportacao |
| `plugin_version` | string | Versao do plugin que gerou o arquivo |
| `exported_at` | string (ISO 8601) | Data e hora da exportacao |
| `sketchup_version` | string | Versao do SketchUp |
| `model_name` | string | Nome do modelo (arquivo .skp) |
| `model_entities` | array | Hierarquia de modulos e pecas |
| `machining` | array | Lista de usinagens agrupadas por peca |

---

## model_entities — Hierarquia de entidades

Cada elemento do array `model_entities` representa um **modulo** (movel) ou uma **peca**.

### Estrutura de um modulo

```json
{
  "id": "orn_bal_001",
  "name": "ORN_BAL Pia Central",
  "type": "module",
  "module_code": "ORN_BAL",
  "description": "Pia Central",
  "position": { "x": 0, "y": 0, "z": 0 },
  "dimensions": { "width": 800, "height": 720, "depth": 560 },
  "overrides": {
    "joint_type": "minifix",
    "back_panel_thickness": 3
  },
  "children": [ ... ]
}
```

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | string | Identificador unico do modulo |
| `name` | string | Nome completo do grupo no SketchUp |
| `type` | string | Sempre `"module"` para modulos |
| `module_code` | string | Codigo do modulo (ex: `ORN_BAL`) |
| `description` | string | Parte descritiva do nome (apos o codigo) |
| `position` | object | Posicao do modulo no mundo (mm) |
| `dimensions` | object | Dimensoes da bounding box do modulo (mm) |
| `overrides` | object | Configuracoes que sobrescrevem o global (pode ser vazio) |
| `children` | array | Pecas e sub-modulos dentro deste modulo |

### Estrutura de uma peca

```json
{
  "id": "lat_esq_001",
  "name": "LAT_ESQ",
  "type": "piece",
  "piece_code": "LAT_ESQ",
  "role": "lateral_esquerda",
  "material": "MDF_18_BRANCO_TX",
  "thickness": 18,
  "dimensions": {
    "length": 720,
    "width": 560,
    "thickness": 18
  },
  "position": { "x": 0, "y": 0, "z": 0 },
  "rotation": { "rx": 0, "ry": 0, "rz": 0 },
  "bounding_box": {
    "min": { "x": 0, "y": 0, "z": 0 },
    "max": { "x": 18, "y": 560, "z": 720 }
  },
  "edges": {
    "top": "BOR_2x22_BRANCO_TX",
    "bottom": "none",
    "left": "BOR_1x22_BRANCO_TX",
    "right": "BOR_1x22_BRANCO_TX"
  },
  "grain_direction": "length",
  "overrides": {},
  "skip_machining": false
}
```

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | string | Identificador unico da peca |
| `name` | string | Nome do grupo/componente no SketchUp |
| `type` | string | Sempre `"piece"` para pecas |
| `piece_code` | string | Codigo reconhecido (ex: `LAT_ESQ`) |
| `role` | string | Papel legivel (ex: `lateral_esquerda`) |
| `material` | string | Codigo do material |
| `thickness` | number | Espessura detectada (mm) |
| `dimensions` | object | Comprimento, largura e espessura (mm) |
| `position` | object | Posicao no mundo (mm) |
| `rotation` | object | Rotacao em graus |
| `bounding_box` | object | Caixa delimitadora no mundo |
| `edges` | object | Bordas aplicadas em cada lado |
| `grain_direction` | string | Direcao do veio: `length`, `width`, `none` |
| `overrides` | object | Configuracoes especificas desta peca |
| `skip_machining` | boolean | Se true, nenhuma usinagem e gerada |

---

## machining — Lista de usinagens

O array `machining` contem um objeto para cada peca que recebeu usinagem:

```json
{
  "piece_id": "lat_esq_001",
  "piece_name": "LAT_ESQ",
  "piece_dimensions": { "length": 720, "width": 560, "thickness": 18 },
  "workers": [ ... ]
}
```

### Estrutura de um worker (operacao)

Cada operacao de usinagem e um **worker** no array `workers`:

```json
{
  "id": "w001",
  "tool_code": "f_15mm_minifix",
  "tool_description": "Corpo minifix",
  "category": "boring",
  "diameter": 15,
  "depth": 13,
  "quadrant": "top",
  "position_x": 50,
  "position_y": 37,
  "origin_junction": {
    "type": "butt",
    "partner_piece": "BASE",
    "partner_id": "base_001"
  }
}
```

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `id` | string | Identificador unico do worker |
| `tool_code` | string | Codigo da ferramenta (ver catalogo) |
| `tool_description` | string | Descricao legivel |
| `category` | string | Categoria: `boring`, `grooving`, `milling`, `cutting` |
| `diameter` | number | Diametro da ferramenta (mm) |
| `depth` | number | Profundidade da operacao (mm) ou `"through"` para passante |
| `quadrant` | string | Face onde a operacao e feita |
| `position_x` | number | Posicao X relativa ao canto da peca (mm) |
| `position_y` | number | Posicao Y relativa ao canto da peca (mm) |
| `origin_junction` | object | Informacao sobre a juncao que gerou esta usinagem |

### Categorias de operacao

| Categoria | Descricao | Campos adicionais |
|-----------|-----------|-------------------|
| `boring` | Furacao (furo pontual) | `diameter`, `depth`, `quadrant`, `position_x`, `position_y` |
| `grooving` | Rasgo linear (canal) | `width`, `depth`, `quadrant`, `start_x`, `start_y`, `end_x`, `end_y` |
| `milling` | Fresagem com caminho | `width_tool`, `depth`, `quadrant`, `positions` (array de pontos), `closed`, `correction` |
| `cutting` | Corte especial | `angle`, `quadrant`, `start_x`, `start_y`, `end_x`, `end_y` |

### Quadrantes (faces)

| Quadrant | Descricao | Tipo de furacao |
|----------|-----------|-----------------|
| `top` | Face superior | Vertical (CNC padrao) |
| `bottom` | Face inferior | Vertical |
| `left` | Borda esquerda (inicio do comprimento) | Horizontal |
| `right` | Borda direita (fim do comprimento) | Horizontal |
| `front` | Borda frontal | Horizontal |
| `rear` | Borda traseira | Horizontal |

### Worker de rasgo (grooving)

```json
{
  "id": "w010",
  "tool_code": "r_f",
  "tool_description": "Rasgo de fundo MDF 3mm",
  "category": "grooving",
  "width": 3.2,
  "depth": 8,
  "quadrant": "top",
  "start_x": 0,
  "start_y": 552,
  "end_x": 720,
  "end_y": 552,
  "origin_junction": {
    "type": "dado",
    "partner_piece": "FUN",
    "partner_id": "fun_001"
  }
}
```

### Worker de fresagem (milling)

```json
{
  "id": "w020",
  "tool_code": "usi_chanfro_45",
  "tool_description": "Chanfro 45 graus",
  "category": "milling",
  "width_tool": 38,
  "depth": 18,
  "quadrant": "top",
  "positions": [
    { "x": 0, "y": 0 },
    { "x": 500, "y": 0 }
  ],
  "closed": false,
  "correction": 1,
  "origin_junction": {
    "type": "miter",
    "partner_piece": "MOL",
    "partner_id": "mol_002"
  }
}
```

### Worker de serie (System32)

Furos em serie sao representados como multiplos workers individuais, cada um com sua posicao:

```json
[
  { "id": "s32_001", "tool_code": "f_5mm_s32", "category": "boring", "diameter": 5, "depth": 11, "quadrant": "top", "position_x": 64, "position_y": 37 },
  { "id": "s32_002", "tool_code": "f_5mm_s32", "category": "boring", "diameter": 5, "depth": 11, "quadrant": "top", "position_x": 96, "position_y": 37 },
  { "id": "s32_003", "tool_code": "f_5mm_s32", "category": "boring", "diameter": 5, "depth": 11, "quadrant": "top", "position_x": 128, "position_y": 37 }
]
```

---

## Coordenadas — Sistema de referencia

Todas as coordenadas de usinagem sao **locais a peca**, com origem no canto inferior-esquerdo da face de trabalho:

```
    Y (largura)
    ↑
    │
    │   ┌─────────────────────┐
    │   │                     │
    │   │   ○ (x=50, y=37)   │
    │   │                     │
    │   │                     │
    │   └─────────────────────┘
    └──────────────────────────→ X (comprimento)
  (0,0)

  X = posicao ao longo do comprimento da peca
  Y = posicao ao longo da largura da peca
  Profundidade = entra na espessura (eixo perpendicular a face)
```

### Transformacao mundo → peca

O plugin realiza a seguinte transformacao:

1. Extrai a bounding box da peca no espaco do mundo (SketchUp)
2. Identifica qual eixo corresponde a espessura (menor dimensao)
3. Define o canto de referencia (min da bounding box)
4. Projeta as coordenadas 3D do furo em 2D na face de trabalho
5. Calcula posicao relativa ao canto de referencia

---

## Exemplo completo — Balcao simples

```json
{
  "format_version": "1.0",
  "plugin_version": "0.1.0",
  "exported_at": "2025-01-15T14:30:00-03:00",
  "sketchup_version": "2024",
  "model_name": "Balcao Cozinha",
  "model_entities": [
    {
      "id": "mod_001",
      "name": "ORN_BAL Pia",
      "type": "module",
      "module_code": "ORN_BAL",
      "description": "Pia",
      "position": { "x": 0, "y": 0, "z": 0 },
      "dimensions": { "width": 800, "height": 720, "depth": 560 },
      "overrides": {},
      "children": [
        {
          "id": "p_lat_e",
          "name": "LAT_ESQ",
          "type": "piece",
          "piece_code": "LAT_ESQ",
          "role": "lateral_esquerda",
          "material": "MDF_18_BRANCO_TX",
          "thickness": 18,
          "dimensions": { "length": 720, "width": 542, "thickness": 18 },
          "position": { "x": 0, "y": 0, "z": 0 },
          "edges": { "top": "BOR_2x22_BRANCO_TX", "bottom": "none", "left": "BOR_1x22_BRANCO_TX", "right": "BOR_1x22_BRANCO_TX" },
          "grain_direction": "length"
        },
        {
          "id": "p_lat_d",
          "name": "LAT_DIR",
          "type": "piece",
          "piece_code": "LAT_DIR",
          "role": "lateral_direita",
          "material": "MDF_18_BRANCO_TX",
          "thickness": 18,
          "dimensions": { "length": 720, "width": 542, "thickness": 18 },
          "position": { "x": 782, "y": 0, "z": 0 },
          "edges": { "top": "BOR_2x22_BRANCO_TX", "bottom": "none", "left": "BOR_1x22_BRANCO_TX", "right": "BOR_1x22_BRANCO_TX" },
          "grain_direction": "length"
        },
        {
          "id": "p_base",
          "name": "BASE",
          "type": "piece",
          "piece_code": "BASE",
          "role": "base",
          "material": "MDF_18_BRANCO_TX",
          "thickness": 18,
          "dimensions": { "length": 764, "width": 542, "thickness": 18 },
          "position": { "x": 18, "y": 0, "z": 0 },
          "edges": { "top": "BOR_2x22_BRANCO_TX", "bottom": "none", "left": "none", "right": "none" },
          "grain_direction": "length"
        },
        {
          "id": "p_fun",
          "name": "FUN",
          "type": "piece",
          "piece_code": "FUN",
          "role": "fundo",
          "material": "MDF_3_BRANCO_ST",
          "thickness": 3,
          "dimensions": { "length": 714, "width": 534, "thickness": 3 },
          "position": { "x": 18, "y": 8, "z": 18 },
          "edges": { "top": "none", "bottom": "none", "left": "none", "right": "none" },
          "grain_direction": "none"
        }
      ]
    }
  ],
  "machining": [
    {
      "piece_id": "p_lat_e",
      "piece_name": "LAT_ESQ",
      "piece_dimensions": { "length": 720, "width": 542, "thickness": 18 },
      "workers": [
        {
          "id": "w001",
          "tool_code": "r_f",
          "category": "grooving",
          "width": 3.2,
          "depth": 8,
          "quadrant": "top",
          "start_x": 0,
          "start_y": 534,
          "end_x": 720,
          "end_y": 534,
          "origin_junction": { "type": "dado", "partner_piece": "FUN", "partner_id": "p_fun" }
        }
      ]
    },
    {
      "piece_id": "p_base",
      "piece_name": "BASE",
      "piece_dimensions": { "length": 764, "width": 542, "thickness": 18 },
      "workers": [
        {
          "id": "w010",
          "tool_code": "f_15mm_minifix",
          "category": "boring",
          "diameter": 15,
          "depth": 13,
          "quadrant": "top",
          "position_x": 50,
          "position_y": 271,
          "origin_junction": { "type": "butt", "partner_piece": "LAT_ESQ", "partner_id": "p_lat_e" }
        },
        {
          "id": "w011",
          "tool_code": "f_8mm_cavilha",
          "category": "boring",
          "diameter": 8,
          "depth": 12,
          "quadrant": "top",
          "position_x": 82,
          "position_y": 271,
          "origin_junction": { "type": "butt", "partner_piece": "LAT_ESQ", "partner_id": "p_lat_e" }
        },
        {
          "id": "w012",
          "tool_code": "f_15mm_minifix",
          "category": "boring",
          "diameter": 15,
          "depth": 13,
          "quadrant": "top",
          "position_x": 714,
          "position_y": 271,
          "origin_junction": { "type": "butt", "partner_piece": "LAT_DIR", "partner_id": "p_lat_d" }
        },
        {
          "id": "w013",
          "tool_code": "r_f",
          "category": "grooving",
          "width": 3.2,
          "depth": 8,
          "quadrant": "top",
          "start_x": 0,
          "start_y": 534,
          "end_x": 764,
          "end_y": 534,
          "origin_junction": { "type": "dado", "partner_piece": "FUN", "partner_id": "p_fun" }
        }
      ]
    }
  ]
}
```

---

## Validacao do JSON

O ERP valida o JSON recebido verificando:

1. **Campos obrigatorios**: `format_version`, `model_entities`, `machining`
2. **IDs unicos**: todos os `id` devem ser unicos no documento
3. **Referencias validas**: `piece_id` em machining deve existir em model_entities
4. **Dimensoes positivas**: length, width, thickness > 0
5. **Profundidade valida**: depth <= espessura da peca (para furos nao-passantes)
6. **Quadrante valido**: deve ser um dos 6 valores aceitos
7. **Coordenadas dentro da peca**: position_x <= length, position_y <= width
