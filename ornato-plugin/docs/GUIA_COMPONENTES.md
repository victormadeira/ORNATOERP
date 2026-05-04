# Guia Completo de Componentes Dinâmicos — Ornato Plugin

> Versão 1.0 · Para modeladores, marceneiros-técnicos e desenvolvedores de biblioteca  
> Público: quem vai criar módulos novos para o sistema

---

## Índice

1. [O que é um Componente Dinâmico](#1-o-que-é-um-componente-dinâmico)
2. [Como o sistema "reconhece" cada peça](#2-como-o-sistema-reconhece-cada-peça--o-equivalente-ao-upmobb)
3. [Estrutura do arquivo JSON — anatomia completa](#3-estrutura-do-arquivo-json--anatomia-completa)
4. [Roles: a linguagem das peças](#4-roles-a-linguagem-das-peças)
5. [Expressões paramétricas](#5-expressões-paramétricas)
6. [ferragens_auto — declarando ferragens](#6-ferragens_auto--declarando-ferragens)
7. [Condições e variantes](#7-condições-e-variantes)
8. [Modelagem manual no SketchUp](#8-modelagem-manual-no-sketchup)
9. [Ferragens visuais (dobradiças, corrediças, puxadores)](#9-ferragens-visuais-dobradiças-corrediças-puxadores)
10. [Variáveis globais (ShopConfig)](#10-variáveis-globais-shopconfig)
11. [Exemplos completos](#11-exemplos-completos)
12. [Diagnóstico e problemas comuns](#12-diagnóstico-e-problemas-comuns)

---

## 1. O que é um Componente Dinâmico

No Ornato, um **Componente Dinâmico** (ou módulo paramétrico) é um móvel definido por:

- **Um arquivo JSON** que descreve todas as peças, expressões e ferragens
- **Parâmetros ajustáveis** que o usuário define na interface (largura, altura, etc.)
- **Roles** que identificam o papel estrutural de cada peça

Quando o usuário insere um balcão de 600mm e muda para 900mm, **nenhum arquivo é editado**. O sistema lê o JSON, substitui as variáveis e recalcula tudo automaticamente.

```
Arquivo JSON  →  Parâmetros do usuário  →  Peças no SketchUp  →  Usinagens CNC
balcao.json      { largura: 900 }          6 grupos criados       minifix, dobradiça, sys32
```

---

## 2. Como o sistema "reconhece" cada peça — o equivalente ao UpMoob

No UpMoob e Promob, cada peça tem uma **variável de tipo** que impede o sistema de tratá-la como parede ou superfície de sala. No Ornato, este mecanismo chama-se **role** (papel).

### O role é o dado mais importante de uma peça

Ele diz ao sistema:
- O que a peça é estruturalmente
- Que usinagens automáticas aplicar
- Como posicioná-la corretamente na planta CNC

```
SEM role                    COM role correto
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Uma chapa qualquer    →    lateral_esq  →  :lateral
                                           ↓
                                    recebe minifix,
                                    System 32,
                                    rasgo de fundo
```

### Como o role é definido (por ordem de prioridade)

**Prioridade 1 — Atributo SketchUp (mais confiável)**

Selecione o grupo → Janela → Atributos → Dicionário `Ornato` → chave `role`

```
Dicionário: Ornato
  role = "lateral_esq"
```

**Prioridade 2 — Campo `"role"` no JSON da peça**

```json
{ "nome": "Lateral Esquerda", "role": "lateral_esq", ... }
```

**Prioridade 3 — Nome do grupo (inferência automática)**

O sistema lê o nome do grupo e detecta palavras-chave:

```
"Lateral Esquerda"   →   :lateral
"Porta de Abrir"     →   :door
"Prateleira 01"      →   :shelf
"Traseira"           →   :back_panel
```

> **Boa prática**: sempre declare o role explicitamente no JSON. A inferência por nome é um fallback, não o caminho principal.

### O que o sistema NUNCA confunde com parede ou ambiente

O Ornato só interpreta como mobiliário o que está **dentro de um grupo Ornato** com os atributos corretos. Qualquer superfície, parede ou piso desenhado no SketchUp fora de um grupo com `Ornato → module_type` é completamente ignorado pelo sistema.

Analogia com o UpMoob:

| UpMoob | Ornato |
|---|---|
| Variável `tipo = "painel"` | Role `lateral`, `base`, `top`, etc. |
| Variável `tipo = "parede"` | Grupo sem atributo `Ornato` (ignorado) |
| Componente parametrizado | Arquivo JSON em `biblioteca/moveis/` |
| Parâmetros do componente | Seção `"parametros"` do JSON |

---

## 3. Estrutura do arquivo JSON — anatomia completa

```
biblioteca/
  moveis/
    cozinha/
      balcao_simples.json     ← id = "balcao_simples"
      balcao_gaveteiro.json
      aereo_duas_portas.json
    dormitorio/
      guarda_roupa_2_portas.json
    closet/
      modulo_prateleiras.json
```

### Esqueleto completo

```json
{
  "id":        "balcao_simples",
  "nome":      "Balcão Simples",
  "descricao": "Balcão inferior com porta de abrir e prateleira",
  "categoria": "cozinha",
  "tags":      ["base", "porta", "cozinha"],

  "parametros": {
    "largura":       { "label": "Largura",       "default": 600,  "min": 300,  "max": 1200, "step": 50,   "unit": "mm" },
    "altura":        { "label": "Altura",         "default": 850,  "min": 600,  "max": 900,  "step": 50,   "unit": "mm" },
    "profundidade":  { "label": "Profundidade",   "default": 580,  "min": 400,  "max": 700,  "step": 10,   "unit": "mm" },
    "espessura":     { "label": "Espessura MDF",  "default": 18,   "min": 15,   "max": 25,   "step": 0.5,  "unit": "mm" },
    "tipo_porta":    { "label": "Porta",          "default": "2_abrir", "type": "select",
                       "options": ["sem", "1_abrir_e", "1_abrir_d", "2_abrir"] },
    "n_prateleiras": { "label": "Prateleiras",    "default": 1,    "min": 0,    "max": 4,    "step": 1     },
    "com_rodape":    { "label": "Com rodapé",     "default": true,                           "type": "boolean" },
    "com_fundo":     { "label": "Com fundo",      "default": true,                           "type": "boolean" }
  },

  "pecas": [ ... ],

  "ferragens_auto": [ ... ]
}
```

### Campos do cabeçalho

| Campo | Obrigatório | Descrição |
|---|---|---|
| `"id"` | ✅ | Deve ser **idêntico** ao nome do arquivo (sem `.json`). Usado em código |
| `"nome"` | ✅ | Nome legível na interface |
| `"descricao"` | ❌ | Texto de ajuda na interface |
| `"categoria"` | ✅ | Define em qual aba aparece: `cozinha`, `dormitorio`, `closet`, `sala`, `banheiro`, `escritorio`, `lavanderia` |
| `"tags"` | ❌ | Palavras-chave para busca |

---

## 4. Roles: a linguagem das peças

### 4.1 Tabela completa de roles

| Role canônico | O que é | Nomes aceitos no JSON |
|---|---|---|
| `lateral` | Lateral vertical do móvel | `lateral`, `lateral_esq`, `lateral_dir`, `lateral_e`, `lateral_d`, `side`, `side_left`, `side_right` |
| `base` | Base horizontal inferior | `base`, `bottom`, `chao`, `floor` |
| `top` | Tampa horizontal superior | `topo`, `tampo`, `top`, `ceiling` |
| `door` | Porta de abrir | `porta`, `porta_abrir`, `porta_e`, `porta_d`, `porta_esq`, `porta_dir`, `door` |
| `sliding_door` | Porta de correr | `porta_correr`, `porta_deslizante`, `sliding_door` |
| `back_panel` | Fundo/traseira | `traseira`, `fundo`, `back`, `back_panel` |
| `shelf` | Prateleira | `prateleira`, `shelf` |
| `divider` | Divisória vertical interna | `divisoria`, `divisória`, `divider`, `partition` |
| `drawer_side` | Lateral da caixa de gaveta | `gaveta_lado`, `lateral_gaveta`, `gaveta_lat`, `drawer_side` |
| `drawer_bottom` | Fundo da caixa de gaveta | `gaveta_fundo`, `fundo_gaveta`, `gaveta_bot`, `drawer_bottom` |
| `drawer_back` | Traseira da caixa de gaveta | `gaveta_traseira`, `traseira_gaveta`, `gaveta_tras`, `drawer_back` |
| `drawer_front` | Frente/frente-falsa de gaveta | `gaveta_frente`, `frente_gaveta`, `frente_falsa`, `frente`, `drawer_front` |
| `kick` | Rodapé/saia | `rodape`, `rodapé`, `saia`, `kick`, `kickboard` |
| `cover` | Tamponamento lateral | `tamponamento`, `cover`, `acabamento`, `painel_lateral` |
| `rail` | Varão/cabideiro | `cabideiro`, `varao`, `varão`, `rail` |
| `countertop` | Tampo de bancada | `tampo_bancada`, `countertop` |
| `generic` | Peça sem papel definido | `generic`, `generica`, `outro` |

> O sistema remove acentos e converte para minúsculo: `"Lateral_Esq"`, `"LATERAL_ESQ"` e `"lateral_esq"` são equivalentes.

### 4.2 O que cada role ativa automaticamente

| Role | Sistema 32 | Rasgo fundo | Minifix (recebe) | Dobradiça | Corrediça | Puxador |
|---|---|---|---|---|---|---|
| `lateral` | ✅ | ✅ nas bordas | ✅ | — | — | — |
| `base` | — | ✅ na borda | ✅ | — | — | — |
| `top` | — | — | ✅ | — | — | — |
| `door` | — | — | — | ✅ recebe copo | — | ✅ |
| `back_panel` | — | — | — | — | — | — |
| `shelf` | — | — | — | — | — | — |
| `divider` | — | — | ✅ | — | — | — |
| `drawer_side` | — | ✅ | ✅ | — | ✅ | — |
| `drawer_bottom` | — | — | ✅ | — | — | — |
| `drawer_back` | — | — | ✅ | — | — | — |
| `drawer_front` | — | — | — | — | — | ✅ |
| `kick` | — | — | — | — | — | — |

### 4.3 Regras de inferência por nome (quando não há atributo explícito)

O sistema usa estas expressões regulares na ordem abaixo:

```
"lateral" ou "side"              → :lateral
"base", "bottom" ou "chao"       → :base
"topo", "tampo" ou "top"         → :top
"porta" (sem "correr")           → :door
"correr", "desliz" ou "sliding"  → :sliding_door
"traseira", "fundo" ou "back"    → :back_panel
"prat" ou "shelf"                → :shelf
"divis" ou "partition"           → :divider
"frente" ou "front"              → :drawer_front
"gaveta" + "lado" ou "drawer" + "side" → :drawer_side
"gaveta" + "fundo"               → :drawer_bottom
"rodape", "kick" ou "saia"       → :kick
"tampon", "cover" ou "acabam"    → :cover
"cabid", "varao" ou "rail"       → :rail
(nenhuma correspondência)        → :generic
```

---

## 5. Expressões paramétricas

Qualquer campo numérico nas `pecas` aceita uma expressão com variáveis.

### 5.1 Sintaxe básica

```json
"largura": "{largura} - 2 * {espessura}"
```

`{largura}` é substituído pelo valor atual do parâmetro antes de calcular.

### 5.2 Operadores disponíveis

```
+   subtração
-   adição
*   multiplicação
/   divisão
( ) agrupamento
```

### 5.3 Funções disponíveis

| Função | Uso | Exemplo | Resultado |
|---|---|---|---|
| `max(a, b)` | Maior valor | `max({largura} - 36, 100)` | No mínimo 100 |
| `min(a, b)` | Menor valor | `min({n_prateleiras}, 4)` | No máximo 4 |
| `round(x)` | Arredondamento | `round({altura} / 32) * 32` | Múltiplo de 32 |
| `floor(x)` | Arredonda para baixo | `floor({altura} / 32)` | Inteiro inferior |
| `ceil(x)` | Arredonda para cima | `ceil({largura} / 3)` | Inteiro superior |

### 5.4 Exemplos práticos de expressões

```json
// Altura da lateral (total menos rodapé menos espessura da base e topo)
"altura": "{altura} - {altura_rodape} - 2 * {espessura}"

// Largura interna (total menos as duas laterais)
"largura": "{largura} - 2 * {espessura}"

// Largura de porta dupla (metade do espaço interno, menos folga central)
"largura": "({largura} - 2 * {espessura} - {folga_entre_portas}) / 2 - {folga_porta_lateral}"

// Largura de prateleira (interna com folga de cada lado)
"largura": "{largura} - 2 * {espessura} - 2 * {folga_prat_lateral}"

// Profundidade da prateleira (menos recuo traseiro)
"altura": "{profundidade} - {espessura} - {folga_prat_traseira}"

// Altura da traseira (sem rodapé, de base a topo interno)
"altura": "{altura} - {altura_rodape} - 2 * {espessura}"

// Número de prateleiras a espacorar igualmente
// (usa round e floor para valores inteiros)
"posicao": { "z": "floor({altura} / ({n_prateleiras} + 1)) * 1" }
```

### 5.5 Expressões de posição

As posições `x`, `y`, `z` também são expressões. No sistema Ornato:

```
X = eixo horizontal (largura do móvel)
Y = eixo de profundidade (do front para o fundo)
Z = eixo vertical (altura)
```

```json
// Lateral direita: começa no extremo direito
"posicao": { "x": "{largura} - {espessura}", "y": "0", "z": "{altura_rodape}" }

// Base: começa acima do rodapé
"posicao": { "x": "{espessura}", "y": "0", "z": "{altura_rodape}" }

// Prateleira: no meio da lateral (simplificado)
"posicao": { "x": "{espessura}", "y": "{espessura}", "z": "{altura} / 2" }

// Traseira: encostada no fundo, com recuo de rasgo
"posicao": { "x": "{espessura}", "y": "{profundidade} - {espessura_fundo}", "z": "{altura_rodape} + {espessura}" }
```

---

## 6. `ferragens_auto` — declarando ferragens

A seção `ferragens_auto` é um array de regras. Cada regra instrui o sistema a gerar uma usinagem específica.

```json
"ferragens_auto": [
  { "regra": "minifix",      "juncao": "lateral_esq × base" },
  { "regra": "minifix",      "juncao": "lateral_dir × base" },
  { "regra": "dobradica",    "peca": "lateral_esq", "condicao": "{tipo_porta} != 'sem'" },
  { "regra": "system32",     "pecas": ["lateral_esq", "lateral_dir"], "condicao": "{n_prateleiras} > 0" },
  { "regra": "rebaixo_fundo","pecas": ["lateral_esq", "lateral_dir", "base"], "condicao": "{com_fundo}" }
]
```

### 6.1 Regra `minifix` — junção com parafuso minifix

```json
{ "regra": "minifix", "juncao": "ROLE_A × ROLE_B" }
```

- `ROLE_A × ROLE_B` são os roles das duas peças que se unem
- A ordem dos roles não importa
- O sistema calcula automaticamente quantos minifixes cabem (baseado em `{minifix_spacing}`)

```json
// Exemplos típicos para um balcão completo:
{ "regra": "minifix", "juncao": "lateral_esq × base" },
{ "regra": "minifix", "juncao": "lateral_dir × base" },
{ "regra": "minifix", "juncao": "lateral_esq × topo", "condicao": "{com_tampo}" },
{ "regra": "minifix", "juncao": "lateral_dir × topo", "condicao": "{com_tampo}" },
{ "regra": "minifix", "juncao": "lateral_esq × divisoria", "condicao": "{n_divisorias} > 0" }
```

### 6.2 Regra `cavilha` — junção com cavilha de madeira

```json
{ "regra": "cavilha", "juncao": "lateral_esq × base", "condicao": "{tipo_juncao} == 'cavilha'" }
```

### 6.3 Regra `confirmat` — parafuso confirmat

```json
{ "regra": "confirmat", "juncao": "lateral_esq × base", "condicao": "{tipo_juncao} == 'confirmat'" }
```

> **Boa prática**: declare as três formas de junção (minifix, cavilha, confirmat) com condição no parâmetro `tipo_juncao`. Assim o módulo funciona com qualquer configuração de marcenaria.

### 6.4 Regra `dobradica` — dobradiça de aba (35mm)

```json
{ "regra": "dobradica", "peca": "lateral_esq", "condicao": "{tipo_porta} != 'sem'" }
```

- `peca` é a lateral que recebe os **furos de copo**
- O plugin detecta automaticamente a porta adjacente e aplica os furos nela também
- Para módulo com 2 portas, declare uma regra para cada lateral:

```json
{ "regra": "dobradica", "peca": "lateral_esq", "condicao": "{tipo_porta} != 'sem'" },
{ "regra": "dobradica", "peca": "lateral_dir", "condicao": "{tipo_porta} == '2_abrir'" }
```

### 6.5 Regra `corredica` — corrediça de gaveta

```json
{ "regra": "corredica", "pecas": ["gaveta_lado", "lateral_esq"] }
```

- `pecas[0]` = lateral da **caixa** de gaveta
- `pecas[1]` = lateral do **móvel** onde a corrediça é parafusada

Para gaveteiro com múltiplas gavetas numeradas, use roles distintos:

```json
{ "regra": "corredica", "pecas": ["gv1_lado", "lateral_esq"] },
{ "regra": "corredica", "pecas": ["gv2_lado", "lateral_esq"] },
{ "regra": "corredica", "pecas": ["gv3_lado", "lateral_esq"] }
```

> A espessura e comprimento da corrediça vêm de `{corredica_comprimento}` nas Configurações Globais.

### 6.6 Regra `system32` — furos System 32

```json
{ "regra": "system32", "pecas": ["lateral_esq", "lateral_dir"], "condicao": "{n_prateleiras} > 0" }
```

- Gera duas fileiras de furos de 5mm a cada 32mm
- Posição determinada por `{sys32_front_offset}` e `{sys32_rear_offset}`

### 6.7 Regra `rebaixo_fundo` — rasgo para encaixe da traseira

```json
{ "regra": "rebaixo_fundo", "pecas": ["lateral_esq", "lateral_dir", "base"], "condicao": "{com_fundo}" }
```

- Abre um rasgo nas peças listadas para encaixar o `back_panel`
- Dimensões do rasgo: `{rasgo_largura}` × `{rasgo_profundidade}`, a `{rasgo_recuo}` da borda

> Se o móvel tem tampo (topo), inclua-o na lista também: `["lateral_esq", "lateral_dir", "base", "topo"]`

### 6.8 Regra `puxador` — furos de puxador

```json
{ "regra": "puxador", "peca": "porta", "espaco": 128, "condicao": "{tipo_porta} != 'sem'" }
```

- Se omitir `espaco`, usa `{puxador_espacamento}` das Configurações Globais
- Para frentes de gaveta: `"peca": "gaveta_frente"` ou `"peca": "frente_falsa"`

### 6.9 Regra `pistao` — pistão de gás (basculante)

```json
{ "regra": "pistao", "peca": "topo", "condicao": "{tipo_abertura} == 'basculante'" }
```

---

## 7. Condições e variantes

### 7.1 Sintaxe de condições

O campo `"condicao"` aceita expressões booleanas. Cada peça e cada ferragem pode ter sua própria condição.

```json
"condicao": "{com_fundo}"                          // boolean direto
"condicao": "{n_prateleiras} > 0"                  // comparação numérica
"condicao": "{tipo_porta} == '2_abrir'"             // comparação de string
"condicao": "{tipo_porta} != 'sem'"                 // diferente
"condicao": "{com_tampo} && {n_prateleiras} > 0"   // AND
"condicao": "{tipo_porta} == '1_abrir_e' || {tipo_porta} == '1_abrir_d'"  // OR
```

**Operadores:** `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`

### 7.2 Criar variantes de um módulo com condições

Em vez de criar múltiplos JSONs para "balcão com porta" e "balcão sem porta", use um único JSON com condições:

```json
"pecas": [
  // Peças estruturais — sempre presentes
  { "nome": "Lateral Esq", "role": "lateral_esq", ... },
  { "nome": "Lateral Dir", "role": "lateral_dir", ... },
  { "nome": "Base",        "role": "base", ... },
  
  // Fundo — apenas se com_fundo = true
  { "nome": "Traseira", "role": "traseira", ..., "condicao": "{com_fundo}" },
  
  // Tampo — apenas se com_tampo = true
  { "nome": "Topo", "role": "topo", ..., "condicao": "{com_tampo}" },
  
  // Porta esquerda — apenas se tipo_porta não for "sem"
  { "nome": "Porta E", "role": "porta_e", ..., "condicao": "{tipo_porta} != 'sem'" },
  
  // Porta direita — apenas para 2 portas
  { "nome": "Porta D", "role": "porta_d", ..., "condicao": "{tipo_porta} == '2_abrir'" },
  
  // Prateleiras — iteradas por posição usando expressões
  { "nome": "Prateleira 1", "role": "prateleira", ..., "condicao": "{n_prateleiras} >= 1" },
  { "nome": "Prateleira 2", "role": "prateleira", ..., "condicao": "{n_prateleiras} >= 2" },
  { "nome": "Prateleira 3", "role": "prateleira", ..., "condicao": "{n_prateleiras} >= 3" }
]
```

### 7.3 Parâmetros de tipo e seleção

Parâmetros `"type": "select"` criam dropdowns na interface:

```json
"tipo_porta": {
  "label": "Tipo de Porta",
  "type": "select",
  "default": "2_abrir",
  "options": ["sem", "1_abrir_e", "1_abrir_d", "2_abrir", "basculante"]
}
```

**Valores de string em condições devem usar aspas simples:**

```json
"condicao": "{tipo_porta} == '2_abrir'"    ✅
"condicao": "{tipo_porta} == \"2_abrir\""  ❌ (não use aspas duplas escapadas)
```

---

## 8. Modelagem manual no SketchUp

Use modelagem manual quando o módulo é único, muito personalizado, ou não tem JSON de biblioteca.

### 8.1 Regra fundamental: dois níveis de grupo

```
[Grupo pai — MÓDULO]
  Ornato → module_type = "balcao_simples"
  Ornato → params      = {"largura":600,"altura":850}
  │
  ├── [Grupo filho — PEÇA]
  │   Ornato → role     = "lateral_esq"
  │   Ornato → material = "MDF18_BrancoTX"
  │
  ├── [Grupo filho — PEÇA]
  │   Ornato → role = "base"
  │
  └── ...
```

**Nunca coloque geometria solta dentro do grupo pai.** Apenas grupos filhos (peças).

### 8.2 Passo a passo

**1. Defina as unidades em milímetros**

`Arquivo → Informações do modelo → Unidades → mm`

**2. Modele cada peça como um sólido retangular separado**

Use Retângulo + Push/Pull. Cada chapa = um grupo.

**3. Nomeie cada grupo com palavras-chave do sistema**

```
✅ "Lateral Esquerda"    → :lateral
✅ "Lateral Direita"     → :lateral
✅ "Base"                → :base
✅ "Topo"                → :top
✅ "Porta Abrir E"       → :door
✅ "Prateleira 01"       → :shelf
✅ "Traseira"            → :back_panel
✅ "Gaveta Lateral 1"    → :drawer_side
✅ "Frente Gaveta"       → :drawer_front
```

**4. Selecione todas as peças → Criar grupo (módulo pai)**

Nomeie: `Balcão Simples 600x850x580mm`

**5. Defina o role via atributo quando o nome não basta**

Para peças com nome incomum ou roles menos óbvios:

```
Selecione a peça → Botão direito → Entidade... → Atributos
Adicione dicionário: Ornato
Chave: role | Valor: lateral_esq
```

**6. Defina o material**

Opção A: aplique um material SketchUp com o código correto (ex: `MDF18_BrancoTX`)

Opção B: via atributo:
```
Dicionário: Ornato
Chave: material | Valor: MDF18_BrancoTX
```

**7. Agrupe em módulo e defina os atributos do pai**

```
Dicionário: Ornato
Chave: module_type | Valor: balcao_simples
Chave: params      | Valor: {"largura":600,"altura":850,"profundidade":580}
```

**8. No painel Ornato → Analisar modelo → Processar ferragens**

### 8.3 Orientação das peças

A orientação no SketchUp afeta como o sistema calcula usinagens.

```
LATERAL (vertical)          BASE / PRATELEIRA (horizontal)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A face MAIOR deve ser        A face MAIOR deve ser
o painel vertical.           o plano horizontal.
Modelar deitado e depois     Não precisa rotacionar.
rotacionar é OK.
```

**Convention de origem:** posicione as peças com o canto inferior frontal esquerdo em (0, 0, 0) dentro do grupo do módulo. Assim as coordenadas internas batem com as expressões do JSON.

---

## 9. Ferragens visuais (dobradiças, corrediças, puxadores)

O sistema calcula e gera as usinagens automaticamente, sem precisar de geometria de ferragem no modelo. Porém, para visualização e apresentação ao cliente, você pode adicionar componentes visuais de ferragens.

### 9.1 Abordagem 1 — Sem representação visual (recomendado para produção)

O modelo fica limpo. As usinagens aparecem apenas no relatório e no arquivo de CNC. Adequado para uso interno e exportação de BOM.

### 9.2 Abordagem 2 — Componentes do 3D Warehouse (para apresentação)

Baixe componentes realistas de dobradiças, corrediças e puxadores do 3D Warehouse e insira-os dentro do grupo do módulo como **sub-componentes não-Ornato** (sem atributo `role`).

**O sistema os ignora automaticamente** — qualquer grupo/componente sem `Ornato → role` dentro de um módulo é tratado como decoração.

Passos:
1. Baixe o componente do 3D Warehouse (ex: Blum Clip Top 110°)
2. Insira dentro do grupo do módulo
3. Posicione-o na localização correta da dobradiça
4. NÃO atribua nenhum atributo `Ornato` a ele

> **Convenção de nome para ignorar**: se preferir manter explícito, nomeie como `_visual_` ou `[ferragem]` — o sistema não faz nada com componentes assim nomeados.

### 9.3 Abordagem 3 — Componentes auto-posicionados (avançado)

Crie um componente SketchUp com eixo de inserção definido na posição correta de montagem da ferragem. O sistema pode posicionar instâncias automaticamente com base nas regras de dobradiça/corrediça.

**Convenções de eixo para dobradiça:**
- Origem = centro do copo (furo de 35mm)
- Eixo X = para o interior da lateral
- Eixo Z = eixo de rotação da dobradiça

**Convenções de eixo para corrediça:**
- Origem = ponto traseiro inferior de fixação
- Eixo X = comprimento da corrediça (em direção ao front)

**Convenções de eixo para puxador:**
- Origem = centro entre os dois furos de fixação
- Eixo Y = perpendicular à porta, para fora

### 9.4 Nomenclatura de componentes de ferragem (para que o sistema os identifique)

Se você quer que o sistema saiba que um componente é uma ferragem específica (para relatórios), nomeie o componente assim:

| Ferragem | Nome do componente SketchUp |
|---|---|
| Dobradiça | `ornato_ferragem_dobradica` |
| Corrediça | `ornato_ferragem_corredica` |
| Puxador | `ornato_ferragem_puxador` |
| Minifix | `ornato_ferragem_minifix` |
| Pistão gás | `ornato_ferragem_pistao` |

Com esses nomes, os componentes aparecem no relatório de ferragens mas não entram no BOM de chapas.

### 9.5 Representando dobradiças no modelo (guia prático)

**Opção A — Cilindro simples (rápido)**

1. Dentro da lateral, crie um grupo com nome `ornato_ferragem_dobradica`
2. Desenhe um cilindro de 35mm de diâmetro, 13mm de profundidade
3. Posicione a 22.5mm da borda frontal da porta e 100mm da borda superior
4. Duplique para cada dobradiça adicional

**Opção B — 3D Warehouse**

Busque: `"Blum Clip Top"` ou `"Hettich hinge"` no 3D Warehouse. Baixe e posicione.

**Opção C — Deixar para o plugin (recomendado)**

Não modele as dobradiças. O relatório de usinagem já mostra todas as posições dos copos com coordenadas exatas para CNC.

### 9.6 Representando corrediças no modelo

**Posicionamento padrão Blum Tandem:**

- Corrediça fixa na lateral do móvel: `Y = profundidade_gaveta - 50mm` (distância do front)
- Corrediça na lateral da gaveta: espelhada

```
Modelo simplificado de corrediça:
- Um retângulo de {corredica_comprimento} × 13mm × 13mm
- Posicionado a {corredica_alt_fixacao} = 37mm do centro ao fundo da gaveta
```

---

## 10. Variáveis globais (ShopConfig)

Todas as variáveis das Configurações Globais ficam disponíveis nas expressões do JSON sem precisar declarar nada. Se a marcenaria mudar a folga de porta, **todos os módulos** da biblioteca se atualizam automaticamente.

### 10.1 Variáveis disponíveis nas expressões

```
{folga_porta_lateral}      Default: 1.0mm   Gap porta↔lateral (cada lado)
{folga_porta_topo}         Default: 1.0mm   Gap porta↔tampo
{folga_porta_base}         Default: 1.0mm   Gap porta↔base/rodapé
{folga_entre_portas}       Default: 2.0mm   Gap total entre 2 portas no batente

{folga_correr_topo}        Default: 3.0mm   Folga porta correr no trilho superior
{folga_correr_base}        Default: 3.0mm   Folga porta correr no trilho inferior

{folga_gaveta_lateral}     Default: 12.5mm  Espaço caixa↔lateral (cada lado)
{folga_gaveta_fundo}       Default: 5.0mm   Caixa↔base do móvel
{folga_gaveta_topo}        Default: 5.0mm   Topo da caixa↔peça acima
{folga_entre_gavetas}      Default: 3.0mm   Gap entre frentes consecutivas

{folga_prat_lateral}       Default: 1.0mm   Prateleira↔lateral (cada lado)
{folga_prat_traseira}      Default: 20.0mm  Recuo da prateleira em relação ao fundo

{folga_div_topo}           Default: 1.0mm   Divisória↔tampo
{folga_div_base}           Default: 1.0mm   Divisória↔base

{rasgo_largura}            Default: 4.0mm   Largura do rasgo para fundo
{rasgo_profundidade}       Default: 8.0mm   Profundidade do rasgo
{rasgo_recuo}              Default: 10.0mm  Distância da borda traseira ao rasgo

{dobradica_edge_offset}    Default: 22.5mm  Centro copo → borda frontal da porta
{dobradica_cup_dia}        Default: 35.0mm  Diâmetro do copo
{dobradica_top_offset}     Default: 100.0mm Borda da porta → 1ª dobradiça

{minifix_spacing}          Default: 128.0mm Espaçamento entre pares de minifix
{minifix_body_dia}         Default: 15.0mm  Diâmetro do disco cam
{minifix_min_edge}         Default: 50.0mm  Distância mínima da borda

{corredica_comprimento}    Default: 450mm   Comprimento da corrediça
{corredica_alt_fixacao}    Default: 37.0mm  Y do 1º furo de fixação

{puxador_espacamento}      Default: 128mm   Centro a centro dos furos
{puxador_recuo}            Default: 37.0mm  Recuo da borda oposta à dobradiça
{puxador_y_porta}          Default: 100.0mm Deslocamento vertical em portas
{puxador_dia_furo}         Default: 5.0mm   Diâmetro do furo passante

{sys32_front_offset}       Default: 37.0mm  Eixo de furos → borda frontal
{sys32_rear_offset}        Default: 37.0mm  Eixo de furos → borda traseira
{sys32_top_margin}         Default: 37.0mm  Margem superior
{sys32_bottom_margin}      Default: 37.0mm  Margem inferior
{sys32_spacing}            Default: 32.0mm  Módulo de espaçamento
{sys32_dia}                Default: 5.0mm   Diâmetro dos furos
```

### 10.2 Como as variáveis se relacionam com as dimensões das peças

```
┌─────────────────────────────────────────────────────────────────┐
│                         MÓDULO  (largura)                        │
│  ┌──────┐ ┌─────────────────────────────────────┐ ┌──────┐     │
│  │      │ │           PORTA (ou par)              │ │      │     │
│  │      │ │  largura_porta = largura_interna/2    │ │      │     │
│  │  L   │ │              - folga_porta_lateral    │ │  L   │     │
│  │  A   │ │              - folga_entre_portas/2   │ │  A   │     │
│  │  T   │ │                                       │ │  T   │     │
│  │  E   │ │                                       │ │  E   │     │
│  │  R   │ └───────────────────────────────────────┘ │  R   │     │
│  │  A   │     ↑folga_porta_base                     │  A   │     │
│  │  L   ├─────────────────────────────────────────┤ │  L   │     │
│  │      │                BASE                      │ │      │     │
│  └──────┘ └─────────────────────────────────────────┘ └──────┘     │
│  ↑rodapé                                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Exemplos completos

### 11.1 Balcão simples com porta e prateleira

```json
{
  "id": "balcao_simples",
  "nome": "Balcão Simples",
  "descricao": "Balcão inferior com 1 ou 2 portas e prateleira",
  "categoria": "cozinha",

  "parametros": {
    "largura":       { "label": "Largura",       "default": 600,  "min": 300, "max": 1200, "step": 50, "unit": "mm" },
    "altura":        { "label": "Altura total",   "default": 850,  "min": 700, "max": 900,  "step": 50, "unit": "mm" },
    "profundidade":  { "label": "Profundidade",   "default": 580,  "min": 400, "max": 700,  "step": 10, "unit": "mm" },
    "espessura":     { "label": "Espessura MDF",  "default": 18,   "min": 15,  "max": 25,   "step": 1,  "unit": "mm" },
    "material":      { "label": "Material",       "default": "MDF18_BrancoTX", "type": "text" },
    "tipo_porta":    { "label": "Porta",          "default": "2_abrir", "type": "select",
                       "options": ["sem", "1_abrir_e", "1_abrir_d", "2_abrir"] },
    "n_prateleiras": { "label": "Prateleiras",    "default": 1, "min": 0, "max": 3, "step": 1 },
    "com_rodape":    { "label": "Com rodapé",     "default": true, "type": "boolean" },
    "com_fundo":     { "label": "Com fundo",      "default": true, "type": "boolean" }
  },

  "pecas": [
    {
      "nome": "Lateral Esquerda",
      "role": "lateral_esq",
      "largura":   "{profundidade}",
      "altura":    "{altura} - {altura_rodape} - {espessura}",
      "espessura": "{espessura}",
      "posicao":   { "x": "0", "y": "0", "z": "{altura_rodape}" },
      "bordas":    { "frontal": true }
    },
    {
      "nome": "Lateral Direita",
      "role": "lateral_dir",
      "largura":   "{profundidade}",
      "altura":    "{altura} - {altura_rodape} - {espessura}",
      "espessura": "{espessura}",
      "posicao":   { "x": "{largura} - {espessura}", "y": "0", "z": "{altura_rodape}" },
      "bordas":    { "frontal": true }
    },
    {
      "nome": "Base",
      "role": "base",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao":   { "x": "{espessura}", "y": "0", "z": "{altura_rodape}" },
      "bordas":    { "frontal": true }
    },
    {
      "nome": "Tampo Interno",
      "role": "topo",
      "largura":   "{largura}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao":   { "x": "0", "y": "0", "z": "{altura} - {espessura}" },
      "bordas":    { "frontal": true }
    },
    {
      "nome": "Traseira",
      "role": "traseira",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{altura} - {altura_rodape} - 2 * {espessura}",
      "espessura": "6",
      "posicao":   { "x": "{espessura}", "y": "{profundidade} - 6", "z": "{altura_rodape} + {espessura}" },
      "condicao":  "{com_fundo}"
    },
    {
      "nome": "Prateleira 1",
      "role": "prateleira",
      "largura":   "{largura} - 2 * {espessura} - 2 * {folga_prat_lateral}",
      "altura":    "{profundidade} - {espessura} - {folga_prat_traseira}",
      "espessura": "{espessura}",
      "posicao": {
        "x": "{espessura} + {folga_prat_lateral}",
        "y": "0",
        "z": "{altura_rodape} + {espessura} + ({altura} - {altura_rodape} - 3 * {espessura}) / 2"
      },
      "bordas":   { "frontal": true },
      "condicao": "{n_prateleiras} >= 1"
    },
    {
      "nome": "Porta Esquerda",
      "role": "porta_e",
      "largura":   "({largura} - 2 * {espessura} - {folga_entre_portas}) / 2 - {folga_porta_lateral}",
      "altura":    "{altura} - {altura_rodape} - 2 * {folga_porta_base}",
      "espessura": "{espessura}",
      "posicao": {
        "x": "{espessura} + {folga_porta_lateral}",
        "y": "-{espessura}",
        "z": "{altura_rodape} + {folga_porta_base}"
      },
      "bordas":   { "frontal": true, "topo": true, "baixo": true, "esq": true },
      "condicao": "{tipo_porta} != 'sem'"
    },
    {
      "nome": "Porta Direita",
      "role": "porta_d",
      "largura":   "({largura} - 2 * {espessura} - {folga_entre_portas}) / 2 - {folga_porta_lateral}",
      "altura":    "{altura} - {altura_rodape} - 2 * {folga_porta_base}",
      "espessura": "{espessura}",
      "posicao": {
        "x": "{largura} / 2 + {folga_entre_portas} / 2",
        "y": "-{espessura}",
        "z": "{altura_rodape} + {folga_porta_base}"
      },
      "bordas":   { "frontal": true, "topo": true, "baixo": true, "dir": true },
      "condicao": "{tipo_porta} == '2_abrir'"
    },
    {
      "nome": "Rodapé",
      "role": "rodape",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{profundidade} - 60",
      "espessura": "{espessura}",
      "posicao":   { "x": "{espessura}", "y": "60", "z": "0" },
      "condicao":  "{com_rodape}"
    }
  ],

  "ferragens_auto": [
    { "regra": "minifix",       "juncao": "lateral_esq × base",  "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "minifix",       "juncao": "lateral_dir × base",  "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "minifix",       "juncao": "lateral_esq × topo",  "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "minifix",       "juncao": "lateral_dir × topo",  "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "cavilha",       "juncao": "lateral_esq × base",  "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "cavilha",       "juncao": "lateral_dir × base",  "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "cavilha",       "juncao": "lateral_esq × topo",  "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "cavilha",       "juncao": "lateral_dir × topo",  "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "dobradica",     "peca": "lateral_esq", "condicao": "{tipo_porta} != 'sem'" },
    { "regra": "dobradica",     "peca": "lateral_dir", "condicao": "{tipo_porta} == '2_abrir'" },
    { "regra": "system32",      "pecas": ["lateral_esq", "lateral_dir"], "condicao": "{n_prateleiras} > 0" },
    { "regra": "rebaixo_fundo", "pecas": ["lateral_esq", "lateral_dir", "base"], "condicao": "{com_fundo}" },
    { "regra": "puxador",       "peca": "porta_e", "condicao": "{tipo_porta} != 'sem'" },
    { "regra": "puxador",       "peca": "porta_d", "condicao": "{tipo_porta} == '2_abrir'" }
  ]
}
```

---

### 11.2 Gaveteiro (3 gavetas)

```json
{
  "id": "gaveteiro_3gav",
  "nome": "Gaveteiro 3 Gavetas",
  "descricao": "Módulo de gavetas com corrediça Tandem",
  "categoria": "cozinha",

  "parametros": {
    "largura":       { "label": "Largura",      "default": 450, "min": 300, "max": 900, "step": 50, "unit": "mm" },
    "altura":        { "label": "Altura total",  "default": 850, "min": 700, "max": 900, "step": 50, "unit": "mm" },
    "profundidade":  { "label": "Profundidade",  "default": 580, "min": 450, "max": 650, "step": 10, "unit": "mm" },
    "espessura":     { "label": "Espessura",     "default": 18,  "min": 15,  "max": 25,  "step": 1,  "unit": "mm" },
    "material":      { "label": "Material",      "default": "MDF18_BrancoTX", "type": "text" }
  },

  "pecas": [
    { "nome": "Lateral Esq",  "role": "lateral_esq", "largura": "{profundidade}", "altura": "{altura} - 100 - {espessura}", "espessura": "{espessura}", "posicao": { "x": "0", "y": "0", "z": "100" }, "bordas": { "frontal": true } },
    { "nome": "Lateral Dir",  "role": "lateral_dir", "largura": "{profundidade}", "altura": "{altura} - 100 - {espessura}", "espessura": "{espessura}", "posicao": { "x": "{largura} - {espessura}", "y": "0", "z": "100" }, "bordas": { "frontal": true } },
    { "nome": "Base",         "role": "base",         "largura": "{largura} - 2 * {espessura}", "altura": "{profundidade}", "espessura": "{espessura}", "posicao": { "x": "{espessura}", "y": "0", "z": "100" }, "bordas": { "frontal": true } },
    { "nome": "Tampo",        "role": "topo",         "largura": "{largura}", "altura": "{profundidade}", "espessura": "{espessura}", "posicao": { "x": "0", "y": "0", "z": "{altura} - {espessura}" } },
    { "nome": "Traseira",     "role": "traseira",     "largura": "{largura} - 2 * {espessura}", "altura": "{altura} - 100 - 2 * {espessura}", "espessura": "6", "posicao": { "x": "{espessura}", "y": "{profundidade} - 6", "z": "100 + {espessura}" } },
    { "nome": "Rodapé",       "role": "rodape",       "largura": "{largura} - 2 * {espessura}", "altura": "{profundidade} - 60", "espessura": "{espessura}", "posicao": { "x": "{espessura}", "y": "60", "z": "0" } },

    { "nome": "Frente Gav 1", "role": "gaveta_frente", "largura": "{largura} - 2 * {espessura} - 2 * {folga_porta_lateral}", "altura": "({altura} - 100 - 2 * {espessura} - 3 * {folga_entre_gavetas}) / 3 - {folga_porta_base}", "espessura": "{espessura}", "posicao": { "x": "{espessura} + {folga_porta_lateral}", "y": "-{espessura}", "z": "100 + {espessura} + {folga_porta_base}" }, "bordas": { "frontal": true, "topo": true, "baixo": true, "esq": true, "dir": true } },
    { "nome": "Frente Gav 2", "role": "gaveta_frente", "largura": "{largura} - 2 * {espessura} - 2 * {folga_porta_lateral}", "altura": "({altura} - 100 - 2 * {espessura} - 3 * {folga_entre_gavetas}) / 3 - {folga_porta_base}", "espessura": "{espessura}", "posicao": { "x": "{espessura} + {folga_porta_lateral}", "y": "-{espessura}", "z": "100 + {espessura} + ({altura} - 100 - 2 * {espessura}) / 3 + {folga_entre_gavetas}" }, "bordas": { "frontal": true, "topo": true, "baixo": true, "esq": true, "dir": true } },
    { "nome": "Frente Gav 3", "role": "gaveta_frente", "largura": "{largura} - 2 * {espessura} - 2 * {folga_porta_lateral}", "altura": "({altura} - 100 - 2 * {espessura} - 3 * {folga_entre_gavetas}) / 3 - {folga_porta_base}", "espessura": "{espessura}", "posicao": { "x": "{espessura} + {folga_porta_lateral}", "y": "-{espessura}", "z": "100 + {espessura} + 2 * ({altura} - 100 - 2 * {espessura}) / 3 + 2 * {folga_entre_gavetas}" }, "bordas": { "frontal": true, "topo": true, "baixo": true, "esq": true, "dir": true } },

    { "nome": "Lat Gav 1 E",  "role": "gaveta_lado",   "largura": "{profundidade} - {espessura} - 60", "altura": "({altura} - 100 - 2 * {espessura}) / 3 - {folga_gaveta_topo} - {folga_gaveta_fundo} - {espessura}", "espessura": "18", "posicao": { "x": "{espessura} + {folga_gaveta_lateral}", "y": "{espessura} + 60", "z": "100 + {espessura} + {folga_gaveta_fundo}" } },
    { "nome": "Lat Gav 1 D",  "role": "gaveta_lado",   "largura": "{profundidade} - {espessura} - 60", "altura": "({altura} - 100 - 2 * {espessura}) / 3 - {folga_gaveta_topo} - {folga_gaveta_fundo} - {espessura}", "espessura": "18", "posicao": { "x": "{largura} - {espessura} - {folga_gaveta_lateral} - 18", "y": "{espessura} + 60", "z": "100 + {espessura} + {folga_gaveta_fundo}" } }
  ],

  "ferragens_auto": [
    { "regra": "minifix",       "juncao": "lateral_esq × base" },
    { "regra": "minifix",       "juncao": "lateral_dir × base" },
    { "regra": "minifix",       "juncao": "lateral_esq × topo" },
    { "regra": "minifix",       "juncao": "lateral_dir × topo" },
    { "regra": "rebaixo_fundo", "pecas": ["lateral_esq", "lateral_dir", "base"] },
    { "regra": "corredica",     "pecas": ["gaveta_lado", "lateral_esq"] },
    { "regra": "puxador",       "peca": "gaveta_frente" }
  ]
}
```

---

### 11.3 Aéreo com portas

```json
{
  "id": "aereo_2_portas",
  "nome": "Aéreo 2 Portas",
  "descricao": "Armário aéreo suspenso com 2 portas de abrir",
  "categoria": "cozinha",

  "parametros": {
    "largura":       { "label": "Largura",      "default": 900,  "min": 400, "max": 1200, "step": 50, "unit": "mm" },
    "altura":        { "label": "Altura",        "default": 700,  "min": 500, "max": 900,  "step": 50, "unit": "mm" },
    "profundidade":  { "label": "Profundidade",  "default": 350,  "min": 300, "max": 400,  "step": 10, "unit": "mm" },
    "espessura":     { "label": "Espessura",     "default": 18,   "min": 15,  "max": 25,   "step": 1,  "unit": "mm" },
    "material":      { "label": "Material",      "default": "MDF18_BrancoTX", "type": "text" },
    "n_prateleiras": { "label": "Prateleiras",   "default": 1, "min": 0, "max": 3, "step": 1 },
    "com_fundo":     { "label": "Com fundo",     "default": true, "type": "boolean" }
  },

  "pecas": [
    { "nome": "Lateral Esq",  "role": "lateral_esq", "largura": "{profundidade}", "altura": "{altura} - 2 * {espessura}", "espessura": "{espessura}", "posicao": { "x": "0", "y": "0", "z": "{espessura}" }, "bordas": { "frontal": true } },
    { "nome": "Lateral Dir",  "role": "lateral_dir", "largura": "{profundidade}", "altura": "{altura} - 2 * {espessura}", "espessura": "{espessura}", "posicao": { "x": "{largura} - {espessura}", "y": "0", "z": "{espessura}" }, "bordas": { "frontal": true } },
    { "nome": "Base",         "role": "base",         "largura": "{largura} - 2 * {espessura}", "altura": "{profundidade}", "espessura": "{espessura}", "posicao": { "x": "{espessura}", "y": "0", "z": "0" }, "bordas": { "frontal": true } },
    { "nome": "Topo",         "role": "topo",         "largura": "{largura} - 2 * {espessura}", "altura": "{profundidade}", "espessura": "{espessura}", "posicao": { "x": "{espessura}", "y": "0", "z": "{altura} - {espessura}" }, "bordas": { "frontal": true } },
    { "nome": "Traseira",     "role": "traseira",     "largura": "{largura} - 2 * {espessura}", "altura": "{altura} - 2 * {espessura}", "espessura": "6", "posicao": { "x": "{espessura}", "y": "{profundidade} - 6", "z": "{espessura}" }, "condicao": "{com_fundo}" },
    { "nome": "Prateleira 1", "role": "prateleira",   "largura": "{largura} - 2 * {espessura} - 2 * {folga_prat_lateral}", "altura": "{profundidade} - {espessura} - {folga_prat_traseira}", "espessura": "{espessura}", "posicao": { "x": "{espessura} + {folga_prat_lateral}", "y": "0", "z": "{altura} / 2" }, "bordas": { "frontal": true }, "condicao": "{n_prateleiras} >= 1" },
    { "nome": "Porta Esq",   "role": "porta_e",       "largura": "({largura} - 2 * {espessura} - {folga_entre_portas}) / 2 - {folga_porta_lateral}", "altura": "{altura} - 2 * {folga_porta_topo}", "espessura": "{espessura}", "posicao": { "x": "{espessura} + {folga_porta_lateral}", "y": "-{espessura}", "z": "{folga_porta_topo}" }, "bordas": { "frontal": true, "topo": true, "baixo": true, "esq": true } },
    { "nome": "Porta Dir",   "role": "porta_d",       "largura": "({largura} - 2 * {espessura} - {folga_entre_portas}) / 2 - {folga_porta_lateral}", "altura": "{altura} - 2 * {folga_porta_topo}", "espessura": "{espessura}", "posicao": { "x": "{largura} / 2 + {folga_entre_portas} / 2", "y": "-{espessura}", "z": "{folga_porta_topo}" }, "bordas": { "frontal": true, "topo": true, "baixo": true, "dir": true } }
  ],

  "ferragens_auto": [
    { "regra": "minifix",       "juncao": "lateral_esq × base" },
    { "regra": "minifix",       "juncao": "lateral_dir × base" },
    { "regra": "minifix",       "juncao": "lateral_esq × topo" },
    { "regra": "minifix",       "juncao": "lateral_dir × topo" },
    { "regra": "dobradica",     "peca": "lateral_esq" },
    { "regra": "dobradica",     "peca": "lateral_dir" },
    { "regra": "system32",      "pecas": ["lateral_esq", "lateral_dir"], "condicao": "{n_prateleiras} > 0" },
    { "regra": "rebaixo_fundo", "pecas": ["lateral_esq", "lateral_dir", "base", "topo"], "condicao": "{com_fundo}" },
    { "regra": "puxador",       "peca": "porta_e" },
    { "regra": "puxador",       "peca": "porta_d" }
  ]
}
```

---

## 12. Diagnóstico e problemas comuns

### 12.1 "Peça aparece como generic no relatório"

**Causa:** o role não foi reconhecido.

**Solução:**
1. Verifique o nome do grupo — contém palavra-chave da seção 4.3?
2. Verifique o campo `"role"` no JSON — usa um alias da tabela 4.1?
3. Defina o atributo SketchUp explicitamente: `Ornato → role = "lateral_esq"`

---

### 12.2 "Dobradiça não aparece no relatório de usinagem"

**Causa:** a regra `dobradica` não achou a porta adjacente.

**Verificar:**
- A peça com role `door` (ou `porta_e`, `porta_d`) existe no módulo?
- A condição `"condicao": "{tipo_porta} != 'sem'"` está sendo satisfeita?
- O role da lateral está correto (`lateral_esq` ou `lateral_dir`)?

---

### 12.3 "Sistema 32 não está aparecendo"

**Verificar:**
- `"n_prateleiras" > 0` na condição?
- As laterais têm role `lateral_esq` ou `lateral_dir` (não apenas `lateral`)?
- A regra `system32` está em `ferragens_auto`?

---

### 12.4 "Expressão retorna 0 ou valor errado"

**Dicas de debug:**
1. Adicione um parâmetro temporário com valor fixo para isolar a expressão
2. Verifique parênteses — `"{largura} - 2 * {espessura}"` vs `"({largura} - 2) * {espessura}"`
3. Confirme que o parâmetro existe em `"parametros"` ou nas Configurações Globais
4. Strings em condições precisam de aspas simples: `'{valor}'`

---

### 12.5 "A peça foi criada com tamanho errado"

**Verificar:**
- O campo `largura`, `altura` e `espessura` no JSON batem com as dimensões esperadas?
- Lembre: `largura` = dimensão horizontal no plano XY, `altura` = dimensão vertical (Z), `espessura` = terceira dimensão (profundidade da chapa)
- Para laterais verticais: `largura = profundidade do móvel`, `altura = altura útil do módulo`

---

### 12.6 "Módulo não aparece na Biblioteca do plugin"

**Verificar:**
- O arquivo está em `biblioteca/moveis/[categoria]/[id].json`?
- O campo `"id"` é **idêntico** ao nome do arquivo (sem `.json`)?
- O JSON é válido? Valide em [jsonlint.com](https://jsonlint.com)
- Clique em **Recarregar Biblioteca** no painel

---

### 12.7 Checklist antes de publicar um JSON novo

```
☐ id igual ao nome do arquivo
☐ categoria correta (cozinha/dormitorio/closet/sala/banheiro/etc.)
☐ Todos os roles da tabela 4.1
☐ Expressões testadas nos valores min, default e max de cada parâmetro
☐ Condições booleanas com aspas simples nas strings
☐ ferragens_auto cobre: minifix/cavilha, dobradiça (se tiver porta), System 32 (se tiver prateleira), rasgo fundo (se tiver traseira), puxador (se tiver porta)
☐ Bordas declaradas nas frentes das peças visíveis
☐ JSON válido (sem vírgulas extras, aspas corretas)
```

---

*Ornato Design Plugin · Documentação de Componentes Dinâmicos*
