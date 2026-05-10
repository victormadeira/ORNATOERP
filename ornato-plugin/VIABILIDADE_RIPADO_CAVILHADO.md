# Viabilidade Técnica — Painel Ripado Cavilhado

## Veredito: TOTALMENTE SUPORTADO

O sistema já modela painel ripado cavilhado de ponta-a-ponta. Existe JSON pronto, roles canônicos `:panel` e `:slat`, repetição paramétrica (`repeat`) no `JsonModuleBuilder`, e regra dedicada `cavilha_ripa` (alias `slat_dowel`) no `MachiningInterpreter` que gera furos espelhados (gabarito) entre painel base e cada ripa para CNC.

## Evidências no código

- JSON existente: `biblioteca/moveis/sala/painel_ripado.json` (id `painel_ripado`, tipo_ruby `painel_ripado`, schema 1). Já tem 14 parametros, peças `panel` + `slat` (com `repeat` em X), e `ferragens_auto` com regra `cavilha_ripa`.
- Roles canônicos: `ornato_sketchup/core/role_normalizer.rb` (linhas 126-133, 169-170, 194). Mapeia `painel_ripado/painel/panel` → `:panel` e `ripa/ripas/slat/ripado` → `:slat`. UI tem label "Ripa" e cor cobre.
- Repetição paramétrica: `ornato_sketchup/library/json_module_builder.rb` linhas 303-333 (`expand_piece_def`). Aceita `repeat: { axis, count, offset }` com `count` como expressão (ex.: `({largura} - 2*{margem_lateral} + {espacamento_ripas}) / ({largura_ripa} + {espacamento_ripas})`). Substitui `{i}/{index}/{n}` no nome e empilha posição via `axis * idx`.
- Ferragens auto: `JsonModuleBuilder#process_ferragens_3d` (linha 139) e o atributo `Ornato.ferragens_auto` é gravado no grupo (linha 795-799).
- CNC: `ornato_sketchup/machining/machining_interpreter.rb` linha 362 trata `cavilha_ripa`/`slat_dowel`. Métodos `slat_dowel_ops`, `panel_slat_dowel_ops`, `slat_piece_dowel_ops`, `vertical_dowel_positions` (linhas 370-429) calculam o eixo X de cada ripa (`origin + width/2`) e geram colunas de furos espelhados no painel e na ripa, com `margem_topo`, `margem_base`, `espacamento_vertical`, `diametro`, `profundidade_painel`, `profundidade_ripa`. `RulesEngine` (linha 192) já reconhece a regra como declarativa e delega ao interpreter.

## Gaps técnicos

Nenhum bloqueante. Pequenas observações:

1. O JSON existente fixa `cavilha_diametro` em 8 mm (faixa 6-10). Se quiser cavilha de 5 mm com espalhador, precisa ampliar `min`.
2. Não há checagem de "sobra" quando `(largura - 2*margem) % (ripa+espacamento) != 0`. A última ripa pode ficar fora do painel; o JSON deveria opcionalmente recalcular `espacamento` para distribuir uniformemente. Hoje fica a critério do usuário.
3. A regra `cavilha_ripa` calcula posição X pelo centro da ripa, então depende do builder ter rodado `repeat` antes (já roda). Se o usuário criar ripas manualmente, o normalizador detecta `:slat` por nome ("ripa"/"slat"/"ripado") em `RoleNormalizer.guess_from_name` (linha 259), então funciona também.
4. `COMPATIBLE_EXTRAS[:slat] = ['furo_livre']` (linha 194) — só permite furo_livre como extra manual. Suficiente.

## JSON template proposto (variante "decorativo")

O JSON da `sala/` já cobre o caso. Caso queira uma variante em `decorativo/` com perfil mais industrial (ripa quadrada 25×25, espacamento maior, profundidade reduzida):

```json
{
  "id": "painel_ripado_cavilhado",
  "codigo": "ORN_DEC_002",
  "nome": "Painel Ripado Cavilhado (Decorativo)",
  "descricao": "Painel decorativo com ripas quadradas fixadas por cavilha gabarito ao painel base.",
  "categoria": "decorativo",
  "tags": ["painel", "ripado", "cavilha", "decorativo", "parametrico"],
  "icone": "painel_ripado",
  "thumbnail": "painel_ripado_decorativo.png",
  "tipo_ruby": "painel_ripado",
  "versao_schema": 1,
  "parametros": {
    "largura":              { "type": "number", "default": 1800, "min": 400, "max": 4000, "step": 10, "unit": "mm" },
    "altura":               { "type": "number", "default": 2700, "min": 400, "max": 3200, "step": 10, "unit": "mm" },
    "espessura_painel":     { "type": "number", "default": 15,   "min": 6,   "max": 25,   "step": 1,  "unit": "mm" },
    "largura_ripa":         { "type": "number", "default": 25,   "min": 15,  "max": 80,   "step": 1,  "unit": "mm" },
    "profundidade_ripa":    { "type": "number", "default": 25,   "min": 12,  "max": 60,   "step": 1,  "unit": "mm" },
    "espacamento_ripas":    { "type": "number", "default": 25,   "min": 5,   "max": 80,   "step": 1,  "unit": "mm" },
    "margem_lateral":       { "type": "number", "default": 0,    "min": 0,   "max": 200,  "step": 1,  "unit": "mm" },
    "material_painel":      { "type": "select", "default": "MDF15_Preto",   "options": ["MDF15_Preto","MDF18_BrancoTX","MDF18_Natural"] },
    "material_ripa":        { "type": "select", "default": "MDF18_Natural", "options": ["MDF18_Natural","MDF25_BrancoTX","MDF18_Preto"] },
    "cavilha_diametro":            { "type": "number", "default": 8,   "min": 6, "max": 10, "step": 1, "unit": "mm" },
    "cavilha_profundidade_painel": { "type": "number", "default": 12,  "min": 6, "max": 18, "step": 1, "unit": "mm" },
    "cavilha_profundidade_ripa":   { "type": "number", "default": 15,  "min": 8, "max": 25, "step": 1, "unit": "mm" },
    "cavilha_margem_vertical":     { "type": "number", "default": 100, "min": 50,"max": 300,"step": 5, "unit": "mm" },
    "cavilha_espacamento_vertical":{ "type": "number", "default": 500, "min": 200,"max":700,"step": 10,"unit": "mm" }
  },
  "pecas": [
    {
      "nome": "Painel Base", "role": "panel", "material_param": "material_painel",
      "largura": "{largura}", "altura": "{altura}", "espessura": "{espessura_painel}",
      "posicao": { "x": 0, "y": 0, "z": "{altura}" },
      "bordas": { "frente": true, "topo": true, "base": true, "tras": false }
    },
    {
      "nome": "Ripa {i}", "role": "slat", "material_param": "material_ripa",
      "largura": "{largura_ripa}", "altura": "{altura}", "espessura": "{profundidade_ripa}",
      "posicao": { "x": "{margem_lateral}", "y": "0 - {profundidade_ripa}", "z": "{altura}" },
      "repeat": {
        "axis": "x",
        "count": "({largura} - 2 * {margem_lateral} + {espacamento_ripas}) / ({largura_ripa} + {espacamento_ripas})",
        "offset": "{largura_ripa} + {espacamento_ripas}"
      },
      "bordas": { "frente": true, "topo": true, "base": true, "tras": false }
    }
  ],
  "ferragens_auto": [
    {
      "regra": "cavilha_ripa",
      "painel": "panel",
      "ripa": "slat",
      "diametro": "{cavilha_diametro}",
      "profundidade_painel": "{cavilha_profundidade_painel}",
      "profundidade_ripa": "{cavilha_profundidade_ripa}",
      "margem_topo": "{cavilha_margem_vertical}",
      "margem_base": "{cavilha_margem_vertical}",
      "espacamento_vertical": "{cavilha_espacamento_vertical}"
    }
  ]
}
```

## Mudanças no código necessárias

Nenhuma. Tudo opera na configuração JSON. Sugestões opcionais (não bloqueantes):

- (opcional) Adicionar à `expand_piece_def` cálculo automático de `espacamento` distribuído quando o usuário marcar `distribuir_uniformemente: true`.
- (opcional) Permitir `cavilha_diametro` mínimo de 5 mm para perfis ultra-finos.
- (opcional) Criar thumbnail dedicada `painel_ripado_decorativo.png` em `biblioteca/icones/`.
