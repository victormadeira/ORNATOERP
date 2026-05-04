# Componentes Dinâmicos Ornato — Guia Completo
## Do zero ao móvel paramétrico com ferragens reais

**Versão:** 2.0 — Sistema PieceStamper + DoorCalculator + JsonModuleBuilder  
**Público:** Desenvolvedores Ruby / SketchUp que integram a biblioteca Ornato

---

## Índice

1. [Filosofia do sistema](#1-filosofia-do-sistema)
2. [Arquitetura em camadas](#2-arquitetura-em-camadas)
3. [O PieceStamper — identidade de cada peça](#3-o-piecestamper--identidade-de-cada-peça)
4. [Criando um módulo JSON do zero](#4-criando-um-módulo-json-do-zero)
5. [Expressões paramétricas](#5-expressões-paramétricas)
6. [Os três materiais por módulo](#6-os-três-materiais-por-módulo)
7. [Portas e DoorCalculator](#7-portas-e-doorcalculator)
8. [Gavetas completas](#8-gavetas-completas)
9. [Ferragens reais — blocos 3D no modelo](#9-ferragens-reais--blocos-3d-no-modelo)
10. [ferragens_auto — declaração automática](#10-ferragens_auto--declaração-automática)
11. [ShopConfig — configurações da marcenaria](#11-shopconfig--configurações-da-marcenaria)
12. [MaterialCatalog — espessura por material](#12-materialcatalog--espessura-por-material)
13. [Rebuild dinâmico — o componente que muda](#13-rebuild-dinâmico--o-componente-que-muda)
14. [Dobradiças — posição e usinagem](#14-dobradiças--posição-e-usinagem)
15. [Corrediças de gaveta](#15-corrediças-de-gaveta)
16. [Pistão basculante](#16-pistão-basculante)
17. [Fundo da caixa — rasgo vs parafusado](#17-fundo-da-caixa--rasgo-vs-parafusado)
18. [Marcação manual de peças](#18-marcação-manual-de-peças)
19. [Exportação — o que sai no JSON](#19-exportação--o-que-sai-no-json)
20. [Fluxo completo de exemplo](#20-fluxo-completo-de-exemplo)
21. [Referência rápida de roles](#21-referência-rápida-de-roles)
22. [Depuração e diagnóstico](#22-depuração-e-diagnóstico)

---

## 1. Filosofia do sistema

### Declarativo, não inferencial

O sistema Ornato tem um princípio central que o diferencia de soluções como WPS ou Promob:

> **Uma peça é uma peça porque diz que é, não porque parece ser.**

Isso significa que nenhum algoritmo geométrico (razão espessura/dimensão, contagem de faces) é a fonte de verdade. A fonte de verdade é o **atributo SketchUp**:

```
AttributeDictionary 'Ornato' → 'tipo' = 'peca'
```

Sem esse atributo, um grupo é invisível para todo o sistema — não entra na lista de corte, não gera usinagem, não aparece no custo. Isso é equivalente ao `wpsisashape = 1` do WPS.

### Consequências práticas

| Objeto no modelo | Deve ter stamp? | Entra na lista? |
|---|---|---|
| Lateral de armário (MDF18) | Sim — `tipo='peca'` | ✅ Sim |
| Dobradiça 3D importada | Sim — `tipo='ferragem'` | ❌ Não |
| Geladeira decorativa | Sim — `tipo='decoracao'` | ❌ Não |
| Parede do cômodo | Sim — `tipo='ambiente'` | ❌ Não |
| Grupo sem atributo algum | — | ⚠️ Detectado por heurística geométrica (retrocompat) |

### Hierarquia de um móvel

```
Grupo "Balcão 600×850×600mm"  [tipo=modulo]
  ├── Grupo "Lateral Esq"     [tipo=peca, role=lateral]
  ├── Grupo "Lateral Dir"     [tipo=peca, role=lateral]
  ├── Grupo "Base"            [tipo=peca, role=base]
  ├── Grupo "Tampo"           [tipo=peca, role=top]
  ├── Grupo "Traseira"        [tipo=peca, role=back_panel]
  └── Grupo "Porta"           [tipo=peca, role=door]
```

O grupo-módulo é o container. Ele **não entra** na lista de corte. Cada filho direto que é peça **entra**.

---

## 2. Arquitetura em camadas

```
┌─────────────────────────────────────────────────────────────┐
│                      JSON do módulo                          │
│  biblioteca/moveis/cozinha/balcao_simples.json               │
│  { "pecas": [...], "parametros": {...}, "ferragens_auto": [] }│
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   JsonModuleBuilder                           │
│  Lê JSON, avalia expressões {param}, cria grupos no modelo   │
│  Chama DoorCalculator para portas                            │
│  Chama PieceStamper.stamp() em cada peça criada              │
└─────────┬──────────────────────────┬────────────────────────┘
          │                          │
          ▼                          ▼
┌─────────────────┐    ┌──────────────────────────────────────┐
│  DoorCalculator │    │  PieceStamper                         │
│  Calcula: alt,  │    │  Escreve AttributeDictionary 'Ornato' │
│  larg, pos_x,   │    │  tipo, role, material, espessura,     │
│  pos_z, n_dob   │    │  bordas, fitas, obs, modulo_id        │
└─────────────────┘    └───────────────┬──────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                    ▼
           ┌─────────────┐  ┌─────────────────┐  ┌─────────────────┐
           │ ModelAnalyzer│  │  PieceDetector  │  │  JsonExporter   │
           │ Traversal    │  │  Detect pieces  │  │  Serialização   │
           └──────┬───────┘  └────────┬────────┘  └────────┬────────┘
                  │                   │                     │
                  └───────────────────▼─────────────────────┘
                               MachiningInterpreter
                               ferragens_auto → operações CNC
```

---

## 3. O PieceStamper — identidade de cada peça

### Como carimbar uma peça criada no código

```ruby
# Carimbo básico
PieceStamper.stamp(group,
  role:      :lateral,
  material:  'MDF18_BrancoTX',
  espessura: 18,
  bordas:    { frente: true, tras: false, topo: true, base: false },
  obs:       'Lateral esquerda do módulo'
)
```

### Bordas padrão por role (quando `bordas:` é nil)

| Role | frente | tras | topo | base |
|------|--------|------|------|------|
| `lateral` | ✅ | ❌ | ✅ | ❌ |
| `base` | ✅ | ❌ | ❌ | ❌ |
| `top` | ✅ | ❌ | ❌ | ❌ |
| `door` | ✅ | ✅ | ✅ | ✅ |
| `drawer_front` | ✅ | ✅ | ✅ | ✅ |
| `shelf` | ✅ | ❌ | ❌ | ❌ |
| `divider` | ✅ | ❌ | ✅ | ❌ |
| `back_panel` | ❌ | ❌ | ❌ | ❌ |
| `kick` | ✅ | ❌ | ❌ | ❌ |

### Como carimbar o grupo-módulo

```ruby
PieceStamper.stamp_module(group,
  module_id: 'balcao_simples',
  params:    { 'largura' => 600, 'altura' => 850 },
  nome:      'Balcão Simples'
)
```

### Verificações

```ruby
PieceStamper.piece?(entity)        # → true/false
PieceStamper.module?(entity)       # → true/false
PieceStamper.tipo(entity)          # → 'peca' | 'modulo' | 'ferragem' | nil
PieceStamper.fully_stamped?(entity)# → true se todos os campos obrigatórios presentes
PieceStamper.read(entity)          # → Hash completo de atributos
PieceStamper.dimensions(entity)    # → { comprimento:, largura:, espessura: }
```

### Atributos escritos pelo stamp (para referência)

```
Ornato.tipo          = 'peca'
Ornato.role          = 'lateral'
Ornato.material      = 'MDF18_BrancoTX'
Ornato.espessura     = 18.0
Ornato.fita_padrao   = 'BOR_04x22_Branco'
Ornato.borda_frente  = true
Ornato.borda_tras    = false
Ornato.borda_topo    = true
Ornato.borda_base    = false
Ornato.fita_frente   = 'BOR_04x22_Branco'
Ornato.fita_tras     = ''
Ornato.fita_topo     = 'BOR_04x22_Branco'
Ornato.fita_base     = ''
Ornato.obs           = ''
Ornato.modulo_id     = 'balcao_simples'
Ornato.stamped_at    = '2026-05-03T12:00:00+00:00'
```

---

## 4. Criando um módulo JSON do zero

### Estrutura mínima do arquivo JSON

Salve em `ornato-plugin/biblioteca/moveis/<categoria>/<nome>.json`:

```json
{
  "id":        "meu_modulo",
  "nome":      "Meu Módulo",
  "categoria": "cozinha",
  "descricao": "Descrição do módulo",
  "icone":     "meu_modulo",
  "thumbnail": "meu_modulo.png",

  "parametros": {
    "largura":      { "label": "Largura (mm)",      "default": 600, "min": 300, "max": 1200, "step": 50 },
    "altura":       { "label": "Altura (mm)",        "default": 850, "min": 700, "max": 1000, "step": 10 },
    "profundidade": { "label": "Profundidade (mm)", "default": 600, "min": 500, "max": 700,  "step": 10 },
    "espessura":    { "label": "Espessura MDF",     "default": 18,  "min": 15,  "max": 25,   "step": 1  },
    "material":     { "label": "Material",           "default": "MDF18_BrancoTX" }
  },

  "pecas": [
    {
      "nome":      "Lateral Esq",
      "role":      "lateral",
      "largura":   "{altura} - {altura_rodape}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao":   { "x": "0", "y": "0", "z": "{altura_rodape}" },
      "bordas":    { "frente": true, "topo": true, "base": false, "tras": false }
    }
  ],

  "ferragens_auto": [
    { "tipo": "minifix", "aplica_em": ["lateral", "base"] }
  ]
}
```

### Campos de uma peça (`pecas[]`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `nome` | string | Nome descritivo (aparece na lista de corte) |
| `role` | string | Função estrutural — ver §21 |
| `largura` | expr | Dimensão maior da face (mm) |
| `altura` | expr | Dimensão da profundidade / segunda dimensão (mm) |
| `espessura` | expr | Espessura real (mm) — declarada, não do BoundingBox |
| `posicao.x` | expr | Offset X a partir do canto esquerdo-frente-baixo do módulo |
| `posicao.y` | expr | Offset Y (profundidade) |
| `posicao.z` | expr | Offset Z (altura) |
| `bordas` | objeto | Quais arestas recebem fita de borda |
| `condicao` | expr bool | Peça só é criada se esta condição for verdadeira |
| `obs` | string | Observação livre (vai para a lista de corte) |

---

## 5. Expressões paramétricas

Qualquer campo dimensional ou de posição aceita expressões com `{param}`:

### Operadores e funções disponíveis

```
{largura}              → valor do parâmetro
{largura} - 36         → subtração
{largura} / 2          → divisão
({largura} + 10) * 2   → parênteses
max({largura}, 300)    → máximo entre dois valores
min({espessura}, 18)   → mínimo
round({largura} / 3)   → arredondamento inteiro
floor({altura} / 32)   → arredondamento para baixo
ceil({altura} / 32)    → arredondamento para cima
```

### Variáveis automáticas do ShopConfig

Além dos parâmetros do módulo, estas variáveis estão sempre disponíveis:

```
{espessura_carcaca}      → espessura padrão do painel (mm)
{espessura_fundo}        → espessura do fundo (mm)
{folga_porta_lateral}    → folga lateral da porta (mm) — padrão: 2.0
{folga_porta_int}        → folga entre folhas (mm) — padrão: 1.5
{folga_porta_topo}       → folga no topo (mm) — padrão: 2.0
{folga_porta_base}       → folga na base (mm) — padrão: 2.0
{rasgo_profundidade}     → profundidade do rasgo de fundo (mm) — padrão: 6.0
{rasgo_recuo}            → recuo do rasgo (mm) — padrão: 15.0
{sobreposicao_reta}      → overlay braço reto (mm) — padrão: 16.0
{sobreposicao_curva}     → overlay braço curvo (mm) — padrão: 8.0
{pino_diametro}          → diâmetro do pino de prateleira (mm) — padrão: 5.0
{pino_espacamento}       → espaçamento entre pinos (mm) — padrão: 32.0
```

### Condições booleanas (`condicao`)

```json
"condicao": "{com_tampo} == true"
"condicao": "{n_prateleiras} >= 1"
"condicao": "{altura_rodape} > 0"
"condicao": "{com_fundo} == true && {n_prateleiras} > 0"
```

### Exemplo real: Tampo condicional

```json
{
  "nome":      "Tampo",
  "role":      "top",
  "largura":   "{largura} - 2 * {espessura}",
  "altura":    "{profundidade}",
  "espessura": "{espessura}",
  "posicao":   { "x": "{espessura}", "y": "0", "z": "{altura} - {espessura}" },
  "bordas":    { "frente": true, "topo": false, "base": false, "tras": false },
  "condicao":  "{com_tampo} == true"
}
```

---

## 6. Os três materiais por módulo

Um módulo pode declarar até três materiais diferentes:

| Chave | Afeta | Exemplo |
|-------|-------|---------|
| `material` | Padrão para tudo que não tiver específico | `"MDF18_BrancoTX"` |
| `material_carcaca` | Laterais, base, tampo, divisórias, prateleiras | `"MDP18_Branco"` |
| `material_fundo` | Traseira (back_panel) | `"MDF6_Branco"` |
| `material_frente` | Portas e frentes de gaveta | `"MDF18_NogueiraTX"` |

### Como declarar nos parâmetros do JSON

```json
"parametros": {
  "largura":          { "label": "Largura", "default": 600, "min": 300, "max": 1200, "step": 50 },
  "material_carcaca": { "label": "Material carcaça",    "default": "MDF18_BrancoTX" },
  "material_fundo":   { "label": "Material fundo",      "default": "MDF6_Branco" },
  "material_frente":  { "label": "Material das portas", "default": "MDF18_BrancoTX" }
}
```

### O MaterialCatalog resolve a espessura automaticamente

Quando o usuário seleciona `MDF18_BrancoTX`, o sistema automaticamente sabe que `espessura = 18`. Não é necessário declarar a espessura separadamente se o material for selecionado corretamente.

```ruby
# Internamente, o JsonModuleBuilder faz:
espessura = Catalog::MaterialCatalog.instance.thickness('MDF18_BrancoTX')
# → 18
```

### Espessuras válidas no mercado brasileiro

```
6mm, 12mm, 15mm, 18mm, 25mm, 30mm
```

**Não existem:** MDF 3mm, MDF 9mm — não use esses valores.

---

## 7. Portas e DoorCalculator

### Como funciona o cálculo automático de porta

O `DoorCalculator` calcula automaticamente as dimensões corretas de uma porta baseado em:

- Tamanho da abertura (`abertura_altura`, `abertura_largura`)
- Tipo do braço de dobradiça (`tipo_braco`: `reta`, `curva`, `super_curva`)
- Tipo da porta (`tipo_porta`: `normal`, `passante_sobe`, `passante_desce`, `basculante`, `correr`)
- Número de folhas (`n_portas`)
- Configurações de folga do ShopConfig

### Tipos de braço (overlay)

```
reta        → Full overlay: porta cobre toda a lateral
              Sobreposição = espessura_carcaca − folga_lateral
              Usar quando: módulo isolado, lateral completa visível

curva       → Half overlay: porta cobre metade da lateral
              Sobreposição = espessura_carcaca / 2 − folga_lateral
              Usar quando: módulos adjacentes com lateral dupla

super_curva → Inset: porta embutida, não sobrepõe nada
              Sobreposição = 0
              Usar quando: porta dentro da abertura
```

### Tipos de porta

```
normal          → Padrão. Dobradiça lateral, abre para o lado.
passante_sobe   → (Balcão) porta passa ACIMA do tampo.
                  A extensão acima é a "área de grip" — funciona como puxador.
                  Configurar: extensao_passante = quanto passa acima (mm)

passante_desce  → (Aéreo) porta passa ABAIXO da base.
                  A extensão abaixo fica à vista, mesmo efeito de grip.
                  Configurar: extensao_passante = quanto passa abaixo (mm)

basculante      → Abre para cima com pistão de gás.
                  Dobradiça no topo. Mesmas dimensões da normal.

correr          → Porta deslizante em trilho.
                  Sem dobradiças (n_dobradicas = 0).
```

### Declarar porta passante no JSON do módulo

```json
"parametros": {
  "largura":            { "default": 600, "min": 300,  "max": 1200, "step": 50 },
  "altura":             { "default": 850, "min": 700,  "max": 1000, "step": 10 },
  "espessura":          { "default": 18,  "min": 15,   "max": 25,   "step": 1  },
  "tipo_porta":         { "default": "passante_desce" },
  "extensao_passante":  { "label": "Extensão passante (mm)", "default": 60, "min": 30, "max": 120, "step": 5 },
  "tipo_braco":         { "default": "reta" }
}
```

### Para que o DoorCalculator seja ativado automaticamente

O builder ativa o DoorCalculator quando **ambos** estão presentes nos parâmetros:
- `abertura_altura`
- `abertura_largura`

Declare-os nos parâmetros do módulo (calculados a partir das dimensões da caixaria):

```json
"parametros": {
  "largura":         { "default": 600 },
  "altura":          { "default": 850 },
  "espessura":       { "default": 18 },
  "abertura_altura": { "default": 814 },
  "abertura_largura":{ "default": 564 }
}
```

Ou calcule-os como expressões derivadas no Ruby antes de chamar o builder:

```ruby
params = {
  'largura'          => 600,
  'altura'           => 850,
  'espessura'        => 18,
  'abertura_altura'  => 850 - 18 - 18,  # altura - base - tampo
  'abertura_largura' => 600 - 18 - 18,  # largura - laterais
  'tipo_porta'       => 'normal',
  'tipo_braco'       => 'reta',
}
JsonModuleBuilder.create_from_json('balcao_simples', params)
```

### Resultado que o DoorCalculator devolve

```ruby
{
  altura:           820.0,   # altura calculada da porta (mm)
  largura:          278.0,   # largura de cada folha (mm)
  n_portas:         2,
  n_dobradicas:     3,       # determinado pela altura: ≤800→2, ≤1200→3, >1200→4
  sobreposicao:     16.0,    # overlay real aplicado
  extensao_passante: 0.0,
  posicao_x:         2.0,    # offset X da 1ª porta em relação ao módulo
  posicao_z:        18.0,    # altura da base da porta
  tipo_porta:       'normal',
  tipo_braco:       'reta',
  folgas_aplicadas: { topo: 2.0, base: 2.0, lat: 2.0, int: 1.5 }
}
```

### Usando o DoorCalculator diretamente no código

```ruby
calc = Library::DoorCalculator.new(Hardware::ShopConfig.load)

result = calc.calculate(
  abertura_altura:   814,
  abertura_largura:  564,
  n_portas:          2,
  tipo_porta:        'normal',
  tipo_braco:        'reta',
  espessura_carcaca: 18,
  extensao_passante: 0,
  espessura_porta:   18,
  altura_rodape:     100,
  lado_abertura:     'esquerda'
)

puts result[:altura]       # → 818.0
puts result[:largura]      # → 282.0 (cada folha)
puts result[:n_dobradicas] # → 3
```

---

## 8. Gavetas completas

### Anatomia de uma gaveta

Uma gaveta tem 5 peças de corte:

```
Frente de gaveta  [role: drawer_front]  → o rosto visível, com borda em 4 lados
Lateral esq       [role: drawer_side]   → lateral da caixa da gaveta
Lateral dir       [role: drawer_side]
Traseira gaveta   [role: drawer_back]   → fundo atrás
Fundo gaveta      [role: drawer_bottom] → base (HDF 6mm normalmente)
```

Além dessas peças, a corrediça é uma ferragem (não entra na lista de corte).

### JSON de um gaveteiro simples

```json
{
  "id":   "gaveteiro_3g",
  "nome": "Gaveteiro 3 Gavetas",
  "parametros": {
    "largura":      { "default": 450, "min": 300, "max": 900, "step": 50 },
    "altura":       { "default": 850, "min": 700, "max": 1000, "step": 10 },
    "profundidade": { "default": 600, "min": 500, "max": 700,  "step": 10 },
    "espessura":    { "default": 18,  "min": 15,  "max": 25,   "step": 1  },
    "n_gavetas":    { "default": 3,   "min": 2,   "max": 5,    "step": 1  },
    "corredica":    { "default": "450mm" }
  },
  "pecas": [
    {
      "nome":      "Lateral Esq",
      "role":      "lateral",
      "largura":   "{altura} - {altura_rodape}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao":   { "x": "0", "y": "0", "z": "{altura_rodape}" },
      "bordas":    { "frente": true, "topo": true, "base": false, "tras": false }
    },
    {
      "nome":      "Lateral Dir",
      "role":      "lateral",
      "largura":   "{altura} - {altura_rodape}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao":   { "x": "{largura} - {espessura}", "y": "0", "z": "{altura_rodape}" },
      "bordas":    { "frente": true, "topo": true, "base": false, "tras": false }
    },
    {
      "nome":      "Base",
      "role":      "base",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao":   { "x": "{espessura}", "y": "0", "z": "{altura_rodape}" },
      "bordas":    { "frente": true, "topo": false, "base": false, "tras": false }
    },
    {
      "nome":      "Frente Gaveta 1",
      "role":      "drawer_front",
      "largura":   "({altura} - {altura_rodape} - {espessura}) / {n_gavetas} - {folga_porta_int}",
      "altura":    "{largura} - 2 * {espessura} + 2 * {sobreposicao_reta} - 2 * {folga_porta_lateral}",
      "espessura": "{espessura}",
      "posicao": {
        "x": "{espessura} - {sobreposicao_reta} + {folga_porta_lateral}",
        "y": "0",
        "z": "{altura_rodape} + {espessura} + {folga_porta_base}"
      },
      "bordas": { "frente": true, "tras": true, "topo": true, "base": true }
    }
  ],
  "ferragens_auto": [
    { "tipo": "corredica",    "aplica_em": "drawer_side", "modelo": "tandem" },
    { "tipo": "puxador",      "aplica_em": "drawer_front", "espacamento": 128 },
    { "tipo": "minifix",      "aplica_em": ["lateral", "base"] }
  ]
}
```

---

## 9. Ferragens reais — blocos 3D no modelo

### O que é uma ferragem 3D

Dobradiças, corrediças, pistões de gás, puxadores 3D — todos esses são componentes SketchUp inseridos no modelo **apenas para visualização**. Eles **não entram na lista de corte**.

Para o sistema os ignorar, o grupo/componente precisa ser marcado:

```ruby
group.set_attribute('Ornato', 'tipo', 'ferragem')
# Opcionalmente:
group.set_attribute('Ornato', 'ferragem_tipo', 'dobradica')
group.set_attribute('Ornato', 'ferragem_modelo', 'Blum Clip Top 110°')
```

### Inserindo um bloco 3D de dobradiça

```ruby
def insert_hinge_3d(parent_group, position_xyz, rotation_deg = 0)
  model = Sketchup.active_model

  # Carregar definição do componente (arquivo .skp da dobradiça)
  hinge_path = File.join(Ornato::PLUGIN_DIR, 'assets', '3d', 'dobradica_blum_clip_top.skp')

  definition = model.definitions.load(hinge_path)
  t = Geom::Transformation.new(
    Geom::Point3d.new(position_xyz[0].mm, position_xyz[1].mm, position_xyz[2].mm)
  )

  instance = parent_group.entities.add_instance(definition, t)
  instance.name = 'Dobradiça Blum Clip Top'

  # CRITICAL: marcar como ferragem para o sistema ignorar
  instance.set_attribute('Ornato', 'tipo',           'ferragem')
  instance.set_attribute('Ornato', 'ferragem_tipo',  'dobradica')
  instance.set_attribute('Ornato', 'ferragem_modelo','Blum Clip Top 110°')

  instance
end
```

### Inserindo no lugar certo após o builder criar as peças

O `JsonModuleBuilder` cria a caixaria. Após o `build()`, você pode iterar pelas peças e adicionar os blocos 3D:

```ruby
group = JsonModuleBuilder.create_from_json('balcao_simples', params)

# Encontrar as peças com role :door
door_pieces = Library::PieceStamper.find_pieces(group.entities).select do |p|
  Library::PieceStamper.read(p)[:role] == :door
end

door_pieces.each do |door|
  attrs = Library::PieceStamper.read(door)
  dims  = Library::PieceStamper.dimensions(door)
  n_dob = door.get_attribute('Ornato', 'n_dobradicas') || 2

  # Calcular posições das dobradiças
  calc = Library::DoorCalculator.new
  positions = calc.hinge_positions(dims[:comprimento])

  # Posição X da caixa de copo (edge_offset da dobradiça)
  edge_offset = 22.0  # mm do ShopConfig
  x_pos = door.transformation.origin.x.to_mm + edge_offset

  positions.each do |y_pos|
    z_pos = door.transformation.origin.z.to_mm + y_pos
    insert_hinge_3d(group, [x_pos, 0, z_pos])
  end
end
```

### Organização dos arquivos 3D

```
ornato-plugin/
  assets/
    3d/
      dobradica_blum_clip_top.skp
      dobradica_blum_clip_top_165.skp
      corredica_blum_tandem_450.skp
      corredica_blum_tandem_500.skp
      pistao_blum_aventos_hf.skp
      pistao_blum_aventos_hs.skp
      puxador_128mm.skp
      puxador_160mm.skp
```

### Catálogo de ferragens 3D (HardwareCatalog)

O `HardwareCatalog` mapeia o código de ferragem para o arquivo `.skp`:

```ruby
Hardware::HardwareCatalog.path_for('dobradica_blum_clip_top')
# → 'assets/3d/dobradica_blum_clip_top.skp'

Hardware::HardwareCatalog.path_for('corredica_blum_tandem', size: '450mm')
# → 'assets/3d/corredica_blum_tandem_450.skp'
```

---

## 10. ferragens_auto — declaração automática

O array `ferragens_auto` no JSON declara quais ferragens um módulo usa. O `MachiningInterpreter` lê essas regras e gera as operações CNC correspondentes (rebaixos, furos, rasgos).

### Sintaxe das regras

```json
"ferragens_auto": [
  {
    "tipo":     "dobradica",
    "aplica_em":"door",
    "quantidade_por_folha": 2,
    "condicao": "{tipo_porta} != 'basculante'"
  },
  {
    "tipo":     "pistao",
    "aplica_em":"top",
    "condicao": "{tipo_porta} == 'basculante'"
  },
  {
    "tipo":     "puxador",
    "aplica_em":"door",
    "espacamento": 128
  },
  {
    "tipo":     "minifix",
    "aplica_em":["lateral", "divider", "base"]
  },
  {
    "tipo":     "cavilha",
    "aplica_em":["lateral", "shelf"]
  },
  {
    "tipo":     "corredica",
    "aplica_em":"drawer_side",
    "modelo":   "tandem"
  },
  {
    "tipo":     "rebaixo_fundo",
    "aplica_em":["lateral", "base"],
    "condicao": "{com_fundo} == true && {fundo_metodo} == 'rasgo'"
  },
  {
    "tipo":     "pino_prateleira",
    "aplica_em":["lateral"],
    "condicao": "{n_prateleiras} > 0"
  }
]
```

### Tipos de ferragem disponíveis

| `tipo` | Operação gerada | Aplica em |
|--------|-----------------|-----------|
| `dobradica` | Furo copo ø35mm + furo mola + furo fixação placa | lateral |
| `puxador` | Furo passante ø5mm (espaçamento) | door, drawer_front |
| `minifix` | Furo cego + canal | lateral, base, divider |
| `cavilha` | Furo cego ø8mm + furo espelho | lateral, shelf |
| `confirmat` | Furo escareado ø5mm + furo guia | lateral, base |
| `corredica` | Canal lateral corrediça | drawer_side, lateral |
| `rebaixo_fundo` | Rasgo ø6mm (rasgo no verso) | lateral, base, top |
| `pistao` | Furo fixação pistão | top, lateral |
| `pino_prateleira` | Série de furos ø5mm | lateral |
| `sistema32` | Série de furos Ø5mm a cada 32mm | lateral |
| `rasgo_led` | Canal fresado 10×8mm | shelf, top |

---

## 11. ShopConfig — configurações da marcenaria

O `ShopConfig` é o coração da configuração. Todas as folgas, espessuras padrão, espaçamentos de ferragem — tudo vem daqui.

### Onde fica o arquivo

```
ornato-plugin/ornato_sketchup/hardware/shop_config.rb
```

### Grupos de configuração

```ruby
Hardware::ShopConfig.load
# Retorna:
{
  'espessuras_validas'       => [6, 12, 15, 18, 25, 30],
  'espessura_carcaca_padrao' => 18,
  'espessura_fundo_padrao'   => 6,
  'espessura_frente_padrao'  => 18,
  'fundo_metodo_padrao'      => 'rasgo',  # 'rasgo' ou 'parafusado'

  'rasgo_fundo' => {
    'profundidade' => 6.0,   # profundidade do rasgo (mm)
    'recuo'        => 15.0,  # distância do fundo para dentro
    # 'largura' é dinâmico = espessura do painel de fundo
  },

  'sobreposicao' => {
    'reta'        => 16.0,
    'curva'       => 8.0,
    'super_curva' => 0.0,
  },

  'folgas' => {
    'porta_abrir' => {
      'lateral_ext'    => 2.0,   # folga entre porta e lateral externa (mm)
      'lateral_int'    => 1.5,   # folga por folha entre portas no mesmo módulo
      'entre_modulos'  => 3.0,   # folga por lado entre módulos adjacentes
      'topo'           => 2.0,
      'base'           => 2.0,
    },
    'porta_correr' => {
      'trilho_topo' => 8.0,
      'trilho_base' => 4.0,
    },
    'gaveta' => {
      'lateral' => 12.5,   # folga para corrediça (cada lado)
      'topo'    => 6.0,
      'entre'   => 2.0,    # entre frentes de gavetas adjacentes
    }
  },

  'dobradica' => {
    'cup_dia'    => 35.0,   # diâmetro da caixa de copo (mm)
    'cup_depth'  => 13.5,   # profundidade do furo de copo (mm)
    'edge_offset'=> 22.0,   # distância do furo ao fio da porta (mm)
    'top_offset' => 100.0,  # distância da dobradiça ao topo/base da porta
    'quantidade_por_altura' => {
      'limite_800'  => 800,  'ate_800'    => 2,
      'limite_1200' => 1200, 'ate_1200'   => 3,
      'acima_1200'  => 4,
    }
  },

  'minifix' => {
    'diametro_copo' => 15.0,
    'profundidade'  => 13.0,
    'offset_face'   => 8.0,
    'espacamento'   => 128.0,
  },

  'pino_prateleira' => {
    'diametro'    => 5.0,
    'profundidade'=> 12.0,
    'espacamento' => 32.0,
    'quantidade'  => 10,
    'offset_base' => 64.0,
    'offset_topo' => 64.0,
  },

  'system32' => { 'ativo' => false },   # desabilitado por padrão
}
```

### Sobrescrevendo por módulo

Na UI, cada módulo pode sobrescrever qualquer configuração da marcenaria. O builder mescla na ordem: `ShopConfig < JSON defaults < user params`.

---

## 12. MaterialCatalog — espessura por material

```ruby
cat = Catalog::MaterialCatalog.instance

# Consultas
cat.thickness('MDF18_BrancoTX')     # → 18
cat.thickness('MDF6_Branco')        # → 6
cat.tipo('MDP18_Branco')            # → 'MDP'
cat.default_edge('MDF18_BrancoTX')  # → 'BOR_04x22_Branco'

# Materiais disponíveis para dropdown
cat.for_ui                          # → todos
cat.for_ui(filtro_tipo: 'MDF')      # → apenas MDF

# Custo estimado de uma lista de peças
cat.calculate_cost(pieces_array)
# → { chapas: 12.5, bordas: 8.3, total: 20.8 }  (metros quadrados)
```

### Códigos de material disponíveis

| Código | Nome | Espessura | Tipo |
|--------|------|-----------|------|
| `MDF6_Branco` | MDF Branco 6mm | 6mm | MDF |
| `MDF12_Branco` | MDF Branco 12mm | 12mm | MDF |
| `MDF15_BrancoTX` | MDF Branco TX 15mm | 15mm | MDF |
| `MDF18_BrancoTX` | MDF Branco TX 18mm | 18mm | MDF |
| `MDF25_BrancoTX` | MDF Branco TX 25mm | 25mm | MDF |
| `MDF30_Branco` | MDF Branco 30mm | 30mm | MDF |
| `MDP18_Branco` | MDP Branco 18mm | 18mm | MDP |
| `MDP18_Natural` | MDP Natural 18mm | 18mm | MDP |

---

## 13. Rebuild dinâmico — o componente que muda

O `JsonModuleBuilder.rebuild` é o equivalente a "atualizar o componente dinâmico com novos parâmetros" do SketchUp.

### Como funciona

```
1. Ler module_id do grupo (atributo 'Ornato.module_id')
2. Carregar o JSON original (mesmo arquivo que gerou o módulo)
3. Mesclar params antigos com params novos
4. Apagar todos os grupos filhos (as peças)
5. Reconstruir com os novos params
6. Atualizar 'Ornato.params' no grupo
```

### Exemplo: mudar espessura de 18mm para 25mm

```ruby
# Selecionar o módulo na cena
module_group = Sketchup.active_model.selection.first

# Verificar que é um módulo Ornato
if Library::PieceStamper.module?(module_group)
  sucesso = Library::JsonModuleBuilder.rebuild(module_group, {
    'espessura' => 25,
    'material'  => 'MDF25_BrancoTX'
  })
  puts sucesso ? "Módulo reconstruído!" : "Erro no rebuild"
end
```

### Rebuild em cascata (múltiplos módulos)

```ruby
# Reconstruir todos os módulos de uma seleção com novo material
Sketchup.active_model.selection.each do |ent|
  next unless Library::PieceStamper.module?(ent)
  Library::JsonModuleBuilder.rebuild(ent, { 'material_carcaca' => 'MDP18_Branco' })
end
```

---

## 14. Dobradiças — posição e usinagem

### Regra de quantidade por altura

```
Porta até 800mm  → 2 dobradiças
Porta 801–1200mm → 3 dobradiças
Porta acima de 1200mm → 4 dobradiças
```

Configurável via `ShopConfig['dobradica']['quantidade_por_altura']`.

### Posições das dobradiças (offset do topo da porta)

```ruby
calc = Library::DoorCalculator.new
calc.hinge_positions(820)
# → [100.0, 720.0]           (2 dobradiças — topo e base)

calc.hinge_positions(1050)
# → [100.0, 525.0, 950.0]    (3 dobradiças — topo, meio, base)

calc.hinge_positions(1400)
# → [100.0, 462.0, 938.0, 1300.0]  (4 dobradiças)
```

### Parâmetros do furo de dobradiça (Blum Clip Top padrão)

```
Diâmetro da caixa de copo:  ø35mm (copo de dobradiça)
Profundidade do furo:        13.5mm
Distância ao fio da porta:   22mm (center do furo)
Diâmetro do furo da mola:    ø5mm
Distância dos furos da placa: 3.5mm e 35.5mm do centro do copo
```

### Operação CNC gerada pelo MachiningInterpreter

Para cada dobradiça, o interpretador gera:
```json
{
  "category": "dobradica",
  "tool":     "bit_35",
  "face":     "verso",
  "x":        22.0,
  "y":        100.0,
  "z":        -13.5,
  "diameter": 35.0,
  "depth":    13.5
}
```

### Inserindo o bloco 3D da dobradiça

```ruby
# Após criação do módulo, inserir blocos 3D das dobradiças
def add_hinge_blocks(door_group)
  attrs = Library::PieceStamper.read(door_group)
  dims  = Library::PieceStamper.dimensions(door_group)
  n_dob = door_group.get_attribute('Ornato', 'n_dobradicas').to_i

  calc      = Library::DoorCalculator.new
  positions = calc.hinge_positions(dims[:comprimento])

  positions.each_with_index do |y_from_top, i|
    # Transformação: colocar a dobradiça no lugar certo
    door_origin = door_group.transformation.origin
    x = door_origin.x
    y = door_origin.y
    z = door_origin.z + (dims[:comprimento].mm - y_from_top.mm)

    definition = load_hinge_definition
    t = Geom::Transformation.new(Geom::Point3d.new(x, y, z))
    inst = door_group.parent.entities.add_instance(definition, t)
    inst.set_attribute('Ornato', 'tipo', 'ferragem')
    inst.set_attribute('Ornato', 'ferragem_tipo', 'dobradica')
    inst.name = "Dobradiça #{i+1}"
  end
end
```

---

## 15. Corrediças de gaveta

### Tipos de corrediça suportados

```
tandem       → Blum Tandem / Grass Nova Pro — embutida no fundo lateral
lateral      → Corrediça de esferas lateral — parafusada na lateral
telescopica  → Corrediça telescópica simples
```

### Folga padrão para corrediças

A corrediça Tandem (Blum) requer:
- Folga lateral: **12.5mm** por lado → caixa de gaveta fica 25mm menos larga que o módulo interno
- Altura da caixa: sem folga específica por tipo, mas preste atenção à altura das frentes

```ruby
# Dimensões da caixa de gaveta para Tandem Blum
largura_modulo_interno = 600 - 18 - 18  # → 564mm
largura_caixa_gaveta   = 564 - 12.5 - 12.5  # → 539mm (cada lateral)
```

### Inserindo o bloco 3D da corrediça

```ruby
def add_drawer_slide_3d(drawer_group, side: :left)
  dims = Library::PieceStamper.dimensions(drawer_group)

  slide_path = Hardware::HardwareCatalog.path_for('corredica_blum_tandem',
                                                   size: "#{dims[:comprimento].to_i}mm")
  definition = Sketchup.active_model.definitions.load(slide_path)

  # Posição: junto à lateral, na base da gaveta
  origin = drawer_group.transformation.origin
  x_offset = side == :left ? 0 : dims[:largura].mm
  t = Geom::Transformation.new(Geom::Point3d.new(
    origin.x + x_offset, origin.y, origin.z
  ))

  inst = drawer_group.parent.entities.add_instance(definition, t)
  inst.set_attribute('Ornato', 'tipo', 'ferragem')
  inst.set_attribute('Ornato', 'ferragem_tipo', 'corredica')
  inst.name = "Corrediça Tandem #{side}"
end
```

---

## 16. Pistão basculante

### Tipos de pistão (Blum Aventos)

```
aventos_hf  → Abrir para cima (flip-up) — painel horizontal
aventos_hs  → Basculante simples — um pistão por porta
aventos_hk  → Porta dobrada (fold) — duas partes dobráveis
```

### No JSON, declarar uma porta basculante

```json
{
  "parametros": {
    "tipo_porta": { "default": "basculante" },
    "modelo_pistao": { "default": "aventos_hf" }
  },
  "ferragens_auto": [
    {
      "tipo":     "pistao",
      "aplica_em":"top",
      "modelo":   "aventos_hf",
      "condicao": "{tipo_porta} == 'basculante'"
    },
    {
      "tipo":     "dobradica",
      "aplica_em":"door",
      "tipo_dobradica": "basculante_blum",
      "condicao": "{tipo_porta} == 'basculante'"
    }
  ]
}
```

### Cálculo da força do pistão

O pistão correto depende do peso da porta. Regra geral:
- MDF 18mm: ~1.2 kg/m²
- Porta 600×400mm: `(0.6 × 0.4) × 1.2 × 2 faces ≈ 0.58kg` → pistão leve
- Porta 900×600mm: `(0.9 × 0.6) × 1.2 × 2 ≈ 1.3kg` → pistão médio

Blum cataloga por Nt (Newton) — a seleção é feita na UI ou no catálogo de ferragens.

---

## 17. Fundo da caixa — rasgo vs parafusado

### Método rasgo (padrão)

O fundo fica encaixado num rasgo nas laterais, base e tampo.

```
Recuo do rasgo:      15mm da face traseira
Profundidade:        6mm
Largura:             = espessura do fundo (normalmente 6mm)
```

No modelo SketchUp, a `Traseira` (back_panel) fica posicionada **dentro** da caixaria:
```
posicao.y = {profundidade} - {rasgo_recuo} - {espessura_fundo}
           = 600 - 15 - 6 = 579mm da frente
```

### Método parafusado

O fundo é um painel de 15mm ou 18mm que fica **atrás** das laterais, colado e parafusado.

```
posicao.y = {profundidade} - {espessura_fundo}
           = 600 - 18 = 582mm
largura    = {largura_total}       (cobre as laterais por fora)
```

O `fundo_metodo` é declarado nos parâmetros do módulo. O `PieceStamper` armazena no atributo `Ornato.fundo_metodo` de cada `back_panel`.

### Como detectar no MachiningInterpreter

```ruby
piece.get_attribute('Ornato', 'fundo_metodo')  # → 'rasgo' ou 'parafusado'
```

Para rasgo, gera `rebaixo_fundo`. Para parafusado, gera furos de fixação.

---

## 18. Marcação manual de peças

Quando o designer modela uma peça à mão (fora do JSON builder), a peça precisa ser marcada manualmente:

### Via código Ruby

```ruby
group = Sketchup.active_model.selection.first

Library::PieceStamper.stamp_manual(group, {
  role:         :lateral,
  material:     'MDF18_BrancoTX',
  espessura:    18,
  borda_frente: true,
  borda_topo:   true,
  borda_tras:   false,
  borda_base:   false,
  obs:          'Lateral esquerda — modelada manualmente'
})
# → { success: true, errors: [], data: { ... } }
```

### Via painel da UI (botão "Marcar como Peça")

O `DialogController` deve chamar:

```ruby
# Receber params do painel HTML via callback
selected = Sketchup.active_model.selection.to_a.first
result = Library::PieceStamper.stamp_manual(selected, params_do_painel)
dialog.execute_script("onStampResult(#{result.to_json})")
```

### Removendo o carimbo

```ruby
Library::PieceStamper.unstamp(group)
```

---

## 19. Exportação — o que sai no JSON

O `JsonExporter` usa `PieceStamper.to_export_hash(entity)` para serializar cada peça:

```json
{
  "id":          "1234",
  "nome":        "Lateral Esq",
  "role":        "lateral",
  "material":    "MDF18_BrancoTX",
  "espessura":   18.0,
  "comprimento": 700.0,
  "largura":     580.0,
  "quantidade":  1,
  "bordas": {
    "frente": "BOR_04x22_Branco",
    "tras":   "",
    "topo":   "BOR_04x22_Branco",
    "base":   ""
  },
  "obs":       "",
  "modulo_id": "balcao_simples",
  "manual":    false
}
```

Os usinagens ficam em `machining[id]`, separadas mas referenciadas pelo mesmo `id`.

---

## 20. Fluxo completo de exemplo

### Cenário: Balcão de cozinha 600×850×600mm, 2 portas, braço reto, MDF18 branco

**Passo 1 — Criar o JSON do módulo**

Arquivo: `biblioteca/moveis/cozinha/balcao_2_portas.json`

```json
{
  "id":        "balcao_2_portas",
  "nome":      "Balcão 2 Portas",
  "categoria": "cozinha",

  "parametros": {
    "largura":           { "default": 600,  "min": 300, "max": 1200, "step": 50 },
    "altura":            { "default": 850,  "min": 700, "max": 1000, "step": 10 },
    "profundidade":      { "default": 600,  "min": 500, "max": 700,  "step": 10 },
    "espessura":         { "default": 18,   "min": 15,  "max": 25,   "step": 1  },
    "altura_rodape":     { "default": 100,  "min": 0,   "max": 250,  "step": 10 },
    "material":          { "default": "MDF18_BrancoTX" },
    "tipo_porta":        { "default": "normal" },
    "tipo_braco":        { "default": "reta" },
    "extensao_passante": { "default": 0 },
    "com_fundo":         { "default": true },
    "abertura_altura":   { "default": 714 },
    "abertura_largura":  { "default": 564 }
  },

  "pecas": [
    {
      "nome": "Lateral Esq", "role": "lateral",
      "largura": "{altura} - {altura_rodape}", "altura": "{profundidade}", "espessura": "{espessura}",
      "posicao": { "x": "0", "y": "0", "z": "{altura_rodape}" },
      "bordas": { "frente": true, "topo": true, "base": false, "tras": false }
    },
    {
      "nome": "Lateral Dir", "role": "lateral",
      "largura": "{altura} - {altura_rodape}", "altura": "{profundidade}", "espessura": "{espessura}",
      "posicao": { "x": "{largura} - {espessura}", "y": "0", "z": "{altura_rodape}" },
      "bordas": { "frente": true, "topo": true, "base": false, "tras": false }
    },
    {
      "nome": "Base", "role": "base",
      "largura": "{largura} - 2 * {espessura}", "altura": "{profundidade}", "espessura": "{espessura}",
      "posicao": { "x": "{espessura}", "y": "0", "z": "{altura_rodape}" },
      "bordas": { "frente": true, "topo": false, "base": false, "tras": false }
    },
    {
      "nome": "Tampo", "role": "top",
      "largura": "{largura} - 2 * {espessura}", "altura": "{profundidade}", "espessura": "{espessura}",
      "posicao": { "x": "{espessura}", "y": "0", "z": "{altura} - {espessura}" },
      "bordas": { "frente": true, "topo": false, "base": false, "tras": false }
    },
    {
      "nome": "Traseira", "role": "back_panel",
      "largura": "{largura} - 2 * {espessura}",
      "altura":  "{altura} - {altura_rodape} - 2 * {espessura}",
      "espessura": 6,
      "posicao": { "x": "{espessura}", "y": "{profundidade} - 15", "z": "{altura_rodape} + {espessura}" },
      "bordas": { "frente": false, "topo": false, "base": false, "tras": false },
      "condicao": "{com_fundo} == true"
    },
    {
      "nome": "Rodapé", "role": "kick",
      "largura": "{largura} - 2 * {espessura}", "altura": "{altura_rodape}", "espessura": "{espessura}",
      "posicao": { "x": "{espessura}", "y": "50", "z": "0" },
      "bordas": { "frente": true, "topo": false, "base": false, "tras": false },
      "condicao": "{altura_rodape} > 0"
    }
  ],

  "ferragens_auto": [
    { "tipo": "dobradica",      "aplica_em": "door"                      },
    { "tipo": "puxador",        "aplica_em": "door",    "espacamento": 128},
    { "tipo": "minifix",        "aplica_em": ["lateral", "base"]         },
    { "tipo": "cavilha",        "aplica_em": ["lateral", "shelf"]        },
    { "tipo": "rebaixo_fundo",  "aplica_em": ["lateral", "base"],
      "condicao": "{com_fundo} == true"                                  }
  ]
}
```

**Passo 2 — Criar o módulo no SketchUp**

```ruby
params = {
  'largura'          => 600,
  'altura'           => 850,
  'profundidade'     => 600,
  'espessura'        => 18,
  'altura_rodape'    => 100,
  'material'         => 'MDF18_BrancoTX',
  'tipo_porta'       => 'normal',
  'tipo_braco'       => 'reta',
  'n_portas'         => 2,
  'com_fundo'        => true,
  'abertura_altura'  => 850 - 18 - 18 - 100,  # → 714
  'abertura_largura' => 600 - 18 - 18,          # → 564
}

group = Library::JsonModuleBuilder.create_from_json('balcao_2_portas', params, [0, 0, 0])
```

**Passo 3 — Verificar peças criadas**

```ruby
pieces = Library::PieceStamper.find_pieces(group.entities)
pieces.each do |p|
  data = Library::PieceStamper.read(p)
  dims = Library::PieceStamper.dimensions(p)
  puts "#{p.name}: #{dims[:comprimento]}×#{dims[:largura]}×#{dims[:espessura]} | #{data[:material]}"
end
```

**Passo 4 — Mudar para 25mm**

```ruby
Library::JsonModuleBuilder.rebuild(group, {
  'espessura'         => 25,
  'material'          => 'MDF25_BrancoTX',
  'abertura_altura'   => 850 - 25 - 25 - 100,  # → 700
  'abertura_largura'  => 600 - 25 - 25,          # → 550
})
```

---

## 21. Referência rápida de roles

| Role | Descrição | Bordas default | Entra no corte? |
|------|-----------|----------------|-----------------|
| `lateral` | Lateral da caixa | frente + topo | ✅ |
| `base` | Base / assoalho | frente | ✅ |
| `top` | Tampo | frente | ✅ |
| `back_panel` | Traseira / fundo | nenhuma | ✅ |
| `door` | Porta | todas as 4 | ✅ |
| `drawer_front` | Frente de gaveta | todas as 4 | ✅ |
| `shelf` | Prateleira | frente | ✅ |
| `divider` | Divisória interna | frente + topo | ✅ |
| `kick` | Rodapé | frente | ✅ |
| `rail` | Travessa | nenhuma | ✅ |
| `countertop` | Bancada / tamponamento | frente | ✅ |
| `cover` | Tampa / tamponamento lateral | frente + topo + base | ✅ |
| `drawer_side` | Lateral da caixa de gaveta | topo | ✅ |
| `drawer_back` | Traseira da gaveta | topo | ✅ |
| `drawer_bottom` | Fundo da gaveta | nenhuma | ✅ |
| `generic` | Genérico | nenhuma | ✅ |

---

## 22. Depuração e diagnóstico

### Listar todas as peças no modelo com seus atributos

```ruby
# No console Ruby do SketchUp
model = Sketchup.active_model

all_pieces = []
model.active_entities.each do |ent|
  if Library::PieceStamper.module?(ent)
    Library::PieceStamper.find_pieces(ent.entities).each do |p|
      all_pieces << Library::PieceStamper.read(p).merge(
        Library::PieceStamper.dimensions(p)
      )
    end
  elsif Library::PieceStamper.piece?(ent)
    all_pieces << Library::PieceStamper.read(ent).merge(
      Library::PieceStamper.dimensions(ent)
    )
  end
end

all_pieces.each do |p|
  printf "%-30s %s %3.0f×%3.0f×%2.0f %s\n",
    p[:nome], p[:role], p[:comprimento], p[:largura], p[:espessura], p[:material]
end
```

### Verificar um grupo selecionado

```ruby
ent = Sketchup.active_model.selection.first
puts Library::PieceStamper.tipo(ent).inspect
puts Library::PieceStamper.read(ent).inspect
puts Library::PieceStamper.dimensions(ent).inspect
puts Library::PieceStamper.fully_stamped?(ent).inspect
```

### Testar o DoorCalculator

```ruby
calc = Library::DoorCalculator.new
r = calc.calculate(
  abertura_altura: 714, abertura_largura: 564,
  n_portas: 2, tipo_porta: 'normal', tipo_braco: 'reta',
  espessura_carcaca: 18, extensao_passante: 0,
  espessura_porta: 18, altura_rodape: 100
)
p r
```

### Forçar rebuild de todos os módulos JSON no modelo

```ruby
Sketchup.active_model.active_entities.each do |ent|
  next unless Library::PieceStamper.module?(ent)
  next unless ent.get_attribute('Ornato', 'json_driven')

  module_id = ent.get_attribute('Ornato', 'module_id')
  params_json = ent.get_attribute('Ornato', 'params') || '{}'
  params = JSON.parse(params_json)

  result = Library::JsonModuleBuilder.rebuild(ent, params)
  puts "#{module_id}: #{result ? 'OK' : 'ERRO'}"
end
```

### Mensagens de erro comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `PieceStamper: espessura <= 0` | Material não encontrado no catálogo | Verificar código do material |
| `DoorCalculator: abertura_altura não declarada` | Params incompletos | Adicionar `abertura_altura` e `abertura_largura` |
| `JsonModuleBuilder: expr error '{largura}'` | Parâmetro não declarado | Verificar `parametros` no JSON |
| Peça não aparece na lista de corte | `tipo` não é `'peca'` | Chamar `PieceStamper.stamp()` na peça |
| Dobradiça 3D na lista de corte | Falta `tipo='ferragem'` | Chamar `set_attribute('Ornato', 'tipo', 'ferragem')` |

---

*Ornato Plugin — Documentação Técnica v2.0 — Gerado em 2026-05-03*
