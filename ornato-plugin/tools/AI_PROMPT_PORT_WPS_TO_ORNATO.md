# Prompt — Portar bloco WPS para JSON paramétrico Ornato

**Como usar:**
1. No SketchUp: `Ornato::Inspector.export` (clipboard recebe MD)
2. Cole tudo abaixo (prompt + MD do export) num agente Claude/ChatGPT/Cursor
3. Receba JSON pronto
4. Salve em `/tmp/test_module.json`
5. No SketchUp Console: `Ornato::TestModule.build('/tmp/test_module.json')`
6. Compare visualmente. Ajuste o JSON se necessário e repita 5.

---

## INÍCIO DO PROMPT (copiar tudo abaixo até "FIM DO PROMPT")

Você é especialista em portar blocos paramétricos de bibliotecas WPS/UpMobb para o schema JSON paramétrico Ornato. Seu output **só pode ser JSON válido**, sem comentários, sem markdown, sem explicação. Apenas o JSON puro pronto pra salvar em `biblioteca/moveis/<categoria>/<id>.json`.

## Schema Ornato — campos obrigatórios

```json
{
  "id": "snake_case_id",
  "codigo": "ORNATO_CAT_001",
  "nome": "Nome humano",
  "descricao": "Descrição curta",
  "categoria": "cozinha|banheiro|dormitorio|closet|sala|escritorio|area_servico|comercial|decorativo",
  "tags": ["base", "...", "..."],
  "icone": "armario_base",
  "thumbnail": "id.png",
  "tipo_ruby": "id",
  "versao_schema": 1,
  "tipo": "modulo",

  "parametros": {
    "nome_param": {
      "label": "Label humano",
      "type": "number|select|boolean|string",
      "default": <valor> | "{shop.xxx}",
      "min": 0, "max": 0, "step": 0,        // só pra number
      "options": [...],                       // só pra select
      "unit": "mm",  "unidade": "mm"          // só pra dimensão
    }
  },

  "pecas": [
    {
      "nome": "Lateral Esquerda",
      "role": "<role canônico>",
      "orientacao": "lateral|horizontal",
      "largura": "<expressão>",
      "altura": "<expressão>",
      "espessura": "<expressão>",
      "posicao": { "x": "<expr>", "y": "<expr>", "z": "<expr>" },
      "bordas": { "frente": true, "topo": false, "base": false, "tras": false },
      "condicao": "<expr>",                   // opcional, peça só aparece se true
      "obs": "<texto>"                        // opcional
    }
  ],

  "ferragens_auto": [
    { "regra": "<regra>", "peca": "<role>", "componente_3d": "<path .skp>", "condicao": "<expr>", ...campos_específicos }
  ],

  "agregados_sugeridos": ["led", "passa_fio", "puxador"],

  "_review": {
    "needs_review": true,
    "confidence": 0.8,
    "wps_source_name": "<nome original WPS>"
  }
}
```

## Roles canônicos (USE SOMENTE estes valores em "role")

`lateral` `base` `top` `door` `sliding_door` `back_panel` `shelf` `divider` `drawer_side` `drawer_bottom` `drawer_back` `drawer_front` `kick` `cover` `panel` `slat` `rail` `countertop` `generic`

Aliases aceitos pelo RoleNormalizer (também funcionam): `lateral_esq`, `lateral_dir`, `topo`, `tampo`, `chao`, `floor`, `porta`, `porta_correr`, `traseira`, `fundo`, `prateleira`, `divisoria`, `gaveta_lado`, `gaveta_fundo`, `gaveta_traseira`, `gaveta_frente`, `frente_falsa`, `rodape`, `tamponamento`, `painel_ripado`, `ripa`, `cabideiro`, `varao`, `tampo_bancada`, `travessa`.

## Bordas — sempre 4 chaves (nunca esq/dir/frontal/traseira)

```json
"bordas": { "frente": true, "topo": false, "base": false, "tras": false }
```

## Material codes válidos (use 1 destes em `default` ou `options`)

`MDF18_BrancoTX` `MDF18_Branco` `MDF18_Cinza` `MDF18_Lacado` `MDF18_Natural` `MDF25_BrancoTX` `MDF6_Branco` `MDF12_Branco` `MDF15_Branco`

## Namespace `{shop.xxx}` — variáveis globais da marcenaria

Use em defaults dos parâmetros sempre que possível (substituem hardcode):

```
{shop.folga_porta_lateral}    {shop.folga_porta_vertical}   {shop.folga_entre_portas}
{shop.folga_porta_reta}        {shop.folga_porta_dupla}      {shop.folga_gaveta}
{shop.recuo_fundo}             {shop.profundidade_rasgo_fundo}  {shop.largura_rasgo_fundo}
{shop.altura_rodape}           {shop.rodape_altura_padrao}
{shop.espessura}               {shop.espessura_padrao}       {shop.espessura_chapa_padrao}
{shop.sistema32_offset}        {shop.sistema32_passo}
{shop.cavilha_diametro}        {shop.cavilha_profundidade}
{shop.fita_borda_padrao}
{shop.material_carcaca_padrao} {shop.material_frente_padrao}  {shop.material_fundo_padrao}
{shop.dobradica_padrao}        {shop.corredica_padrao}        {shop.puxador_padrao}
{shop.minifix_padrao}
```

## Como traduzir fórmulas DC do WPS

| Sintaxe WPS DC | Equivalente Ornato |
|---|---|
| `=Parent!LenX` | `"{largura}"` (parâmetro do módulo pai) |
| `=Parent!LenZ - Parent!altura_rodape` | `"{altura} - {altura_rodape}"` |
| `=FLOOR((LenX - 2*margem) / (ripa_w + gap))` | `"floor(({bay.largura} - 2 * {margem}) / ({largura_ripa} + {espacamento}))"` |
| `=Parent!LenY - 2*Parent!espessura` | `"{profundidade} - 2 * {shop.espessura}"` |
| `=18` (hardcoded espessura) | `"{shop.espessura}"` (parametrizado!) |
| `=Parent!n_portas * 2` | `"{n_portas} * 2"` |
| Refs `Parent.Parent!X` | Geralmente vira parâmetro do agregado |

**Operadores suportados:** `+ - * / ( )` + funções: `max(a,b)`, `min(a,b)`, `round(x)`, `floor(x)`, `ceil(x)`, `abs(x)`.

**Comparações pra `condicao`:** `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`.

## Conversões de unidades

WPS armazena dimensões em **inches** (formato SketchUp Length). Para mm:
- Valor inches × 25.4 = valor mm
- `LenX = 31.4961` (inches) → 800.0 mm
- Em `default` use direto em mm: `"default": 800`

## Repeat de peças (ripas, gavetas)

Para N peças semelhantes:
```json
{
  "repeat": {
    "axis": "x|y|z",
    "count": "<expr>",
    "offset": "<expr_distância_entre>"
  },
  "nome": "Ripa {i}",
  "role": "slat",
  ...
  "posicao": { "x": "{margem} + {i} * ({largura_ripa} + {espacamento})", ... }
}
```

A variável `{i}` é interna (0..count-1). NÃO use em `count`.

## Ferragens auto — regras válidas

`minifix` `cavilha` `confirmat` `dobradica` `puxador` `corredica` `corredica_oculta` `pino_prateleira` `cantoneira` `system32` `rebaixo_fundo` `cavilha_ripa` `slat_dowel` `rafix` `parafuso`

Com `componente_3d` (path relativo a `biblioteca/modelos_ornato/`):
- `ferragens/dobradica_amor.skp`
- `ferragens/corredica_telescopica_com_amortecedor.skp`
- `ferragens/cavilha.skp`
- `puxadores/puxador_galla_128mm.skp`
- etc.

Schema típico:
```json
{ "regra": "dobradica", "anchor_role": "lateral", "secondary_role": "door",
  "componente_3d": "ferragens/dobradica_amor.skp",
  "qtd": "{n_dobradicas}",
  "offset_top": 100, "offset_bottom": 100, "depth_from_face": 4 }
```

Pra junções estruturais:
```json
{ "regra": "minifix", "juncao": "lateral × base" }
{ "regra": "cavilha", "juncao": "lateral × top", "condicao": "{tipo_juncao} == 'cavilha'" }
```

## Coordenadas

- SketchUp: **X = largura**, **Y = profundidade**, **Z = altura**
- Origem do módulo no canto inferior-frontal-esquerdo
- Posicao das peças sempre em **mm** (não inches)

## Análise da Formula DAG

O export trouxe seção `Formula DAG`. Use ela pra identificar:

1. **Variáveis-RAIZ** (sem refs entrando): viram `parametros` do Ornato com type/default/options apropriados
2. **Variáveis-DERIVADAS** (têm fórmula que depende de outras): viram expressões inline em `pecas[].largura/altura/posicao/etc`
3. **Variáveis de hardware** (controlam ferragens): viram entradas de `ferragens_auto`

Variáveis com `access: EDIT` ou `access: LIST` → certeza que viram `parametros` (usuário pode editar).
Variáveis com `access: VIEW` ou `access: NONE` → cálculos internos, viram expressão direta nas peças.

## Geometry — círculos detectados

A seção `🔵 furo Ø..mm em [...]` mostra furos **pré-modelados na geometria**. Esses não viram peças do JSON — viram **operações CNC** que o `MachiningInterpreter` gera automaticamente via `ferragens_auto`. Confira se cada furo tem uma regra correspondente. Se aparecer furo que não bate com nenhuma regra padrão, deixa nota em `_review.unmatched_drillings: [...]`.

## Material catalog

Mapeie cada material WPS pra material Ornato CamelCase. Se nome WPS tipo "MDF BRANCO TX 18MM" → "MDF18_BrancoTX". Se for textura customizada não-padrão, anote em `_review.custom_materials: [...]` mas use o mais próximo da lista canônica em `parametros`.

## Definitions referenciadas (componentes 3D)

Cada definition no catálogo → vai virar `componente_3d` em alguma `ferragens_auto`. Mapeie nome WPS pra arquivo .skp em `biblioteca/modelos_ornato/`:

- "Dobradica Amor." → `ferragens/dobradica_amor.skp`
- "Corredica Telescopica" → `ferragens/corredica_telescopica_com_amortecedor.skp`
- "Puxador Galla 128" → `puxadores/puxador_galla_128mm.skp`

Se algum não tem equivalente direto, busque por similar e anote em `_review.unmatched_definitions: [...]`.

## Behavior do componente

Se behavior diz `glued_to: vertical face` → componente cola em parede (não móvel de chão típico).
Se `cuts_opening: true` → recorta abertura na parede (escaninho embutido, espelheira).
Geralmente módulos Ornato não têm behavior. Se tiver, anote em `_review.behavior_notes`.

## Output esperado — instruções

1. **Retorne SOMENTE o JSON** (sem ```json```, sem texto extra)
2. JSON deve ser válido (parsea sem erro)
3. Use indentação 2 espaços
4. Mantenha campos opcionais somente quando úteis (omita `condicao: "true"` se sempre é verdade)
5. Em caso de ambiguidade sobre uma fórmula complexa, **mantenha a fórmula original como string** no campo `_review.original_formulas`
6. `_review.confidence` honesto: 0.9+ se a conversão foi 1:1, 0.5-0.7 se houve simplificações, <0.5 se algo importante foi perdido
7. Use `{shop.xxx}` agressivamente — quase nunca hardcode espessura/folgas

## Sanity check antes de retornar

- [ ] Todas as bordas usam exatamente `frente/topo/base/tras` (nada de esq/dir/frontal/traseira)
- [ ] Todos os roles existem no RoleNormalizer (lista acima)
- [ ] Materiais são CamelCase válidos
- [ ] Não tem ``eval()``, `system()`, ou identifiers fora da whitelist nas expressões
- [ ] Todos os `componente_3d` apontam pra paths que existem em `biblioteca/modelos_ornato/`
- [ ] Cada `repeat` declara `axis`, `count`, `offset`
- [ ] Cada peça tem `largura`, `altura`, `espessura`, `posicao`
- [ ] JSON parsea com `JSON.parse` (valida sintaxe antes de retornar)

---

## INPUT DO EXPORT WPS

Cole abaixo o output completo do `Ornato::Inspector.export` (arquivo `/tmp/ornato_export_<ts>.md`):

```
<<< COLA AQUI O MD INTEIRO >>>
```

## FIM DO PROMPT
