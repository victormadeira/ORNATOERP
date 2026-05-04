# Manual de Modelagem — Ornato Design Plugin

> Versão 1.0 · Plugin para SketchUp 2021+  
> Público: Modeladores, marceneiros-técnicos e desenvolvedores de biblioteca

---

## Índice

1. [Como funciona o sistema](#1-como-funciona-o-sistema)
2. [Conceitos fundamentais](#2-conceitos-fundamentais)
3. [Workflow 1 — Modelagem manual no SketchUp](#3-workflow-1--modelagem-manual-no-sketchup)
4. [Workflow 2 — Módulos via Biblioteca JSON](#4-workflow-2--módulos-via-biblioteca-json)
5. [Referência: Roles de peças](#5-referência-roles-de-peças)
6. [Referência: ferragens_auto](#6-referência-ferragens_auto)
7. [Referência: Usinagens avulsas](#7-referência-usinagens-avulsas)
8. [Referência: Bordas](#8-referência-bordas)
9. [Referência: Materiais](#9-referência-materiais)
10. [Ferragens visuais em 3D](#10-ferragens-visuais-em-3d)
11. [Configurações Globais (ShopConfig)](#11-configurações-globais-shopconfig) — folgas, rasgo fundo, dobradiças, junção, corrediça, puxador, sistema 32
12. [Exemplos completos](#12-exemplos-completos)
13. [FAQ e resolução de problemas](#13-faq-e-resolução-de-problemas)

---

## 1. Como funciona o sistema

O Ornato Design Plugin conecta o SketchUp ao ERP Ornato. O fluxo é:

```
MODELAGEM         ANÁLISE             FERRAGENS           EXPORTAÇÃO
                                                          
Modelador    →   Plugin detecta   →   Plugin aplica   →   JSON para o
modela peças     peças e roles        regras e gera        ERP e para
no SketchUp      automaticamente      todas as             a CNC
                                      usinagens
```

**Princípio central:** o modelador nunca desenha furos. Ele modela peças sólidas, nomeia corretamente e o plugin cuida de tudo: minifix, dobradiça, corrediça, system32, puxador — tudo calculado automaticamente.

Existem dois caminhos para criar móveis:

| Caminho | Quando usar |
|---|---|
| **Modelagem manual** | Módulos únicos, personalizados, adaptações especiais |
| **Biblioteca JSON** | Módulos padronizados que se repetem (balcão, aéreo, gaveteiro…) |

Ambos chegam ao mesmo resultado: peças com `role` definido + `ferragens_auto` declaradas → usinagens geradas.

---

## 2. Conceitos fundamentais

### 2.1 Módulo e Peças

O SketchUp deve ser organizado em dois níveis de grupo:

```
[Grupo] Balcão Simples 600×850×580mm        ← MÓDULO (grupo pai)
  ├── [Grupo] Lateral Esquerda               ← PEÇA
  ├── [Grupo] Lateral Direita                ← PEÇA
  ├── [Grupo] Base                           ← PEÇA
  ├── [Grupo] Topo                           ← PEÇA
  ├── [Grupo] Traseira                       ← PEÇA
  ├── [Grupo] Prateleira                     ← PEÇA
  └── [Grupo] Porta Esquerda                 ← PEÇA
```

- **Módulo**: grupo pai que agrupa todas as peças de um móvel. Tem atributos de tipo (`module_type`), parâmetros e dimensões globais.
- **Peça**: grupo filho que representa uma chapa individual. Tem atributos de `role`, material e bordas.

> ⚠️ **Nunca misture peças de módulos diferentes dentro do mesmo grupo pai.** Cada móvel é um grupo separado.

### 2.2 Role (papel da peça)

O `role` é o papel estrutural de uma peça. É o dado mais importante — é a partir dele que o plugin decide quais ferragens aplicar.

Por exemplo:
- Uma peça com role `lateral` vai receber furos de minifix, rasgo de fundo, System 32
- Uma peça com role `door` vai receber furos de dobradiça e puxador
- Uma peça com role `shelf` vai receber pinos de prateleira

O role pode ser definido de três formas (em ordem de prioridade):

1. **Atributo SketchUp**: `Entity → Ornato → role = "lateral"` (mais confiável)
2. **Nome do grupo**: o plugin infere pelo nome (ver tabela na seção 5)
3. **JSON da biblioteca**: campo `"role"` dentro da definição da peça

### 2.3 Ferragem automática vs avulsa

**Automática (`ferragens_auto`):** declarada no JSON do módulo ou inferida pelas regras do sistema. O plugin aplica sem intervenção do modelador. Exemplos: minifix, dobradiça, System 32, corrediça.

**Avulsa (extra_ops):** adicionada manualmente via interface do plugin, peça por peça. Exemplos: canal de LED, furo de passagem de fio, fechadura, pistão de gás, recorte.

---

## 3. Workflow 1 — Modelagem manual no SketchUp

Use este workflow para módulos únicos ou quando não existe um JSON de biblioteca para o móvel.

### 3.1 Passo a passo

#### Passo 1 — Modele as peças individualmente

Cada chapa deve ser um **Grupo** separado. Use a ferramenta Retângulo + Push/Pull para criar sólidos retangulares representando cada peça com dimensões reais.

> Use milímetros como unidade do arquivo (Arquivo → Informações do modelo → Unidades → mm).

#### Passo 2 — Nomeie os grupos

Selecione o grupo → clique com botão direito → "Informações da entidade" → campo **Nome**.

O plugin infere o role pelo nome usando as regras abaixo. Use nomes descritivos que contenham as palavras-chave:

| Palavra-chave no nome | Role inferido |
|---|---|
| `lateral`, `side` | `lateral` |
| `base`, `bottom`, `chao` | `base` |
| `topo`, `tampo`, `top` | `top` |
| `porta`, `door` (sem "correr") | `door` |
| `correr`, `desliz`, `sliding` | `sliding_door` |
| `traseira`, `fundo`, `back` | `back_panel` |
| `prat`, `shelf` | `shelf` |
| `divis`, `partition` | `divider` |
| `frente`, `front` | `drawer_front` |
| `gaveta.*lado`, `drawer.*side` | `drawer_side` |
| `gaveta.*fundo`, `drawer.*bottom` | `drawer_bottom` |
| `rodape`, `kick`, `saia` | `kick` |
| `tampon`, `cover`, `acabam` | `cover` |
| `cabid`, `varao`, `rail` | `rail` |

**Exemplos de nomes válidos:**
```
✅ "Lateral Esquerda"       → role: lateral
✅ "Lat. Esq."              → role: lateral
✅ "Base do Armário"        → role: base
✅ "Porta E"                → role: door
✅ "Porta Correr 1"         → role: sliding_door
✅ "Prateleira 01"          → role: shelf
✅ "Gaveta Lateral 1"       → role: drawer_side
✅ "Frente Gaveta"          → role: drawer_front
```

#### Passo 3 — Agrupe em módulo

Selecione **todas** as peças do móvel → clique com botão direito → "Criar grupo". Nomeie o grupo pai com o tipo e dimensões:

```
Balcão Simples 600×850×580mm
Aéreo 900×700×350mm
Torre Forno 600×2200×600mm
```

#### Passo 4 — Atribua material

Selecione a peça → Janela → Materiais → aplique o material SketchUp. O nome do material no SketchUp deve corresponder a um código do sistema (ver seção 9).

> Alternativamente, defina o atributo `Ornato → material = "MDF18_BrancoTX"` diretamente.

#### Passo 5 — Defina bordas (opcional mas recomendado)

Via interface do plugin (aba Modelo → selecionar módulo → editar peça) ou diretamente como atributo:

```
Ornato → bordas = {"frontal": true, "topo": false, "tras": false, "baixo": false, "esq": false, "dir": false}
```

#### Passo 6 — Forçar role via atributo (quando o nome não basta)

Se precisar garantir o role sem depender do nome:

1. Selecione o grupo da peça
2. Janela → Atributos de atributo do modelo (ou: botão direito → Entidade → Atributos)
3. Adicione dicionário: `Ornato`
4. Adicione chave: `role` com valor: `lateral` (ou o role desejado)

```
Dicionário "Ornato":
  role     = "lateral"
  material = "MDF18_BrancoTX"
```

#### Passo 7 — Analisar e processar

No painel Ornato:
- Aba **Modelo** → clique no botão ↺ (Reescanear modelo)
- Verifique se todas as peças aparecem com o role correto
- Clique em **⚙ Processar ferragens** para gerar todas as usinagens automáticas

### 3.2 O que o plugin infere automaticamente

Ao processar um módulo modelado manualmente (sem JSON de biblioteca), o plugin:

| Detecção | Como funciona |
|---|---|
| Minifix / cavilha | Detecta quais peças se encostam (AABB collision) e infere tipo de junção pela configuração global |
| Dobradiça | Detecta peças `door` adjacentes a peças `lateral` |
| System 32 | Aplica em todas as peças `lateral` do módulo |
| Rasgo de fundo | Detecta peça `back_panel` e cria rasgo nas laterais, base e topo adjacentes |
| Corrediça | Detecta conjunto gaveta (drawer_side + drawer_bottom + drawer_front) |
| Puxador | Detecta peças `door` e `drawer_front` |

> Para módulos da biblioteca (JSON), a detecção geométrica é substituída pelas regras `ferragens_auto` — mais precisa e mais rápida.

---

## 4. Workflow 2 — Módulos via Biblioteca JSON

Módulos da biblioteca são definidos por arquivos `.json` em `biblioteca/moveis/[categoria]/`. Ao inserir um módulo da biblioteca, o plugin lê o JSON, cria os grupos automaticamente e aplica todas as ferragens declaradas.

### 4.1 Estrutura do arquivo JSON

```json
{
  "id": "nome_do_modulo",
  "nome": "Nome Legível do Módulo",
  "descricao": "Descrição para a interface",
  "categoria": "cozinha",
  "tags": ["base", "portas", "cozinha"],
  "icone": "cabinet",

  "parametros": { ... },
  "pecas": [ ... ],
  "ferragens_auto": [ ... ]
}
```

### 4.2 Parâmetros (`parametros`)

Define as variáveis que o usuário pode ajustar na interface:

```json
"parametros": {
  "largura":      { "default": 600,  "min": 300, "max": 1200, "step": 50,  "unidade": "mm" },
  "altura":       { "default": 850,  "min": 500, "max": 2200, "step": 50,  "unidade": "mm" },
  "profundidade": { "default": 580,  "min": 300, "max": 700,  "step": 10,  "unidade": "mm" },
  "espessura":    { "default": 18,   "min": 15,  "max": 25,   "step": 0.5, "unidade": "mm" },
  "tipo_porta":   { "default": "2_abrir", "opcoes": ["sem", "1_abrir_e", "1_abrir_d", "2_abrir"] },
  "com_fundo":    { "default": true },
  "n_prateleiras":{ "default": 1, "min": 0, "max": 4, "step": 1 }
}
```

**Parâmetros especiais reservados** (têm comportamento automático):

| Parâmetro | Comportamento |
|---|---|
| `com_rodape` | Se `true`, ativa o alias `altura_rodape` (default 100mm) |
| `altura_rodape` | Altura do rodapé. Default 100 se `com_rodape = true`, 0 se false |
| `tipo_juncao` | `"minifix"`, `"cavilha"` ou `"confirmat"` — afeta regras auto |
| `n_prateleiras` | Qtd de prateleiras — afeta regras de System 32 |

### 4.3 Peças (`pecas`)

Cada peça é um objeto com os seguintes campos:

```json
{
  "nome":      "Lateral Esquerda",
  "role":      "lateral_esq",
  "largura":   "{altura} - {altura_rodape}",
  "altura":    "{profundidade}",
  "espessura": "{espessura}",
  "posicao": {
    "x": "0",
    "y": "0",
    "z": "{altura_rodape}"
  },
  "bordas": {
    "frontal": true,
    "traseira": false,
    "topo": false,
    "baixo": false,
    "esq": false,
    "dir": false
  },
  "condicao": "{com_tampo} == true"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `nome` | ✅ | Nome do grupo no SketchUp |
| `role` | ✅ | Role da peça (ver seção 5) |
| `largura` | ✅ | Dimensão em mm ou expressão paramétrica |
| `altura` | ✅ | Dimensão em mm ou expressão paramétrica |
| `espessura` | ✅ | Espessura em mm ou expressão |
| `posicao.x/y/z` | ✅ | Posição em mm dentro do módulo |
| `bordas` | ❌ | Faces que recebem fita de borda (default: false para todas) |
| `condicao` | ❌ | Expressão booleana — se falsa, a peça não é criada |

### 4.4 Expressões paramétricas

Qualquer campo numérico aceita expressões com `{parametro}`:

```
"{largura} - 2 * {espessura}"
"{altura} - {altura_rodape} - 2 * {espessura} - 2"
"({largura} - 2 * {espessura}) / 2 - 2"
```

**Funções disponíveis:**

| Função | Exemplo | Resultado |
|---|---|---|
| `max(a, b)` | `max({largura} - 36, 100)` | O maior valor |
| `min(a, b)` | `min({altura}, 2200)` | O menor valor |
| `round(x)` | `round({largura} / 3)` | Inteiro arredondado |
| `floor(x)` | `floor({altura} / 32)` | Inteiro para baixo |
| `ceil(x)` | `ceil({largura} / 3)` | Inteiro para cima |

#### Variáveis das Configurações Globais

Além dos parâmetros declarados no JSON, todas as variáveis das **Configurações Globais (ShopConfig)** ficam automaticamente disponíveis nas expressões. Isso significa que um JSON criado hoje usa as folgas da sua marcenaria — e se amanhã você mudar a folga, todos os módulos passam a usar o novo valor sem editar nenhum arquivo JSON.

**Exemplo prático:**

```json
"largura": "{largura} - 2 * {folga_porta_lateral}"
```

Se `folga_porta_lateral = 1.0` e `largura = 600`, o resultado é `598.0` mm.

---

**Tabela completa de variáveis globais disponíveis:**

| Variável | Valor padrão | Descrição |
|---|---|---|
| **Folgas — Porta de Abrir** | | |
| `{folga_porta_lateral}` | `1.0` mm | Gap entre porta e lateral (cada lado) |
| `{folga_porta_topo}` | `1.0` mm | Gap entre porta e tampo |
| `{folga_porta_base}` | `1.0` mm | Gap entre porta e base/rodapé |
| `{folga_entre_portas}` | `2.0` mm | Gap total entre 2 portas no batente central |
| **Folgas — Porta de Correr** | | |
| `{folga_correr_topo}` | `3.0` mm | Folga no trilho superior |
| `{folga_correr_base}` | `3.0` mm | Folga no trilho inferior |
| **Folgas — Gaveta** | | |
| `{folga_gaveta_lateral}` | `12.5` mm | Espaço gaveta↔lateral (cada lado; = largura corrediça Tandem) |
| `{folga_gaveta_fundo}` | `5.0` mm | Caixa↔base do módulo |
| `{folga_gaveta_topo}` | `5.0` mm | Topo da caixa↔peça acima |
| `{folga_entre_gavetas}` | `3.0` mm | Gap entre frentes de gaveta consecutivas |
| **Folgas — Prateleira** | | |
| `{folga_prat_lateral}` | `1.0` mm | Cada lado (largura = espaço interno − 2×folga) |
| `{folga_prat_traseira}` | `20.0` mm | Recuo da prateleira em relação ao fundo |
| **Folgas — Divisória** | | |
| `{folga_div_topo}` | `1.0` mm | Divisória↔tampo |
| `{folga_div_base}` | `1.0` mm | Divisória↔base |
| **Rasgo de Fundo** | | |
| `{rasgo_largura}` | `4.0` mm | Largura do rasgo para encaixe do fundo |
| `{rasgo_profundidade}` | `8.0` mm | Profundidade do rasgo |
| `{rasgo_recuo}` | `10.0` mm | Distância da borda traseira ao início do rasgo |
| **Dobradiça** | | |
| `{dobradica_edge_offset}` | `22.5` mm | Centro do cup → borda frontal da porta |
| `{dobradica_cup_dia}` | `35.0` mm | Diâmetro do copo |
| `{dobradica_top_offset}` | `100.0` mm | Borda da porta → 1ª/última dobradiça |
| **Minifix** | | |
| `{minifix_spacing}` | `128.0` mm | Espaçamento entre pares de minifix |
| `{minifix_body_dia}` | `15.0` mm | Diâmetro do disco cam |
| `{minifix_min_edge}` | `50.0` mm | Distância mínima da borda |
| **Corrediça** | | |
| `{corredica_comprimento}` | `450` mm | Comprimento padrão da corrediça |
| `{corredica_alt_fixacao}` | `37.0` mm | Y do 1º furo de fixação |
| **Puxador** | | |
| `{puxador_espacamento}` | `128` mm | Centro a centro entre furos |
| `{puxador_recuo}` | `37.0` mm | Recuo da borda oposta à dobradiça |
| `{puxador_y_porta}` | `100.0` mm | Deslocamento vertical em portas |
| `{puxador_dia_furo}` | `5.0` mm | Diâmetro do furo passante |
| **Sistema 32** | | |
| `{sys32_front_offset}` | `37.0` mm | Eixo de furos → borda frontal da lateral |
| `{sys32_rear_offset}` | `37.0` mm | Eixo de furos → borda traseira da lateral |
| `{sys32_top_margin}` | `37.0` mm | Margem superior |
| `{sys32_bottom_margin}` | `37.0` mm | Margem inferior |
| `{sys32_spacing}` | `32.0` mm | Módulo de espaçamento |
| `{sys32_dia}` | `5.0` mm | Diâmetro dos furos |

> **Prioridade de resolução:**  
> `{folga_porta_lateral}` do ShopConfig é sobreposta se você declarar um parâmetro com o mesmo nome na seção `parametros` do JSON, ou se o usuário passar esse valor no momento da inserção.  
> Ordem: **valores do usuário > defaults do JSON > ShopConfig > aliases internos**

### 4.5 Condições (`condicao`)

O campo `condicao` aceita expressões booleanas. Se falsa, a peça é ignorada:

```json
"condicao": "{com_fundo}"
"condicao": "{n_prateleiras} > 0"
"condicao": "{tipo_porta} == '2_abrir'"
"condicao": "{tipo_porta} != 'sem'"
"condicao": "{tipo_porta} == '2_abrir' && {n_prateleiras} > 0"
"condicao": "{com_tampo} && {com_rodape}"
```

**Operadores suportados:** `==`, `!=`, `>`, `<`, `>=`, `<=`, `&&`, `||`

### 4.6 Onde salvar o arquivo JSON

```
biblioteca/
  moveis/
    cozinha/          ← categoria: "cozinha"
      meu_modulo.json
    dormitorio/       ← categoria: "dormitorio"
    banheiro/
    closet/
    escritorio/
    area_servico/
    comercial/
```

O `"id"` do JSON deve ser **idêntico** ao nome do arquivo (sem o `.json`).

---

## 5. Referência: Roles de Peças

### 5.1 Tabela completa de roles e aliases

| Role canônico | Aliases aceitos | Descrição |
|---|---|---|
| `lateral` | `lateral_esq`, `lateral_dir`, `lateral_e`, `lateral_d`, `side`, `side_left`, `side_right` | Lateral do móvel |
| `base` | `bottom`, `chao`, `floor` | Fundo horizontal (base) |
| `top` | `topo`, `tampo`, `ceiling` | Tampa horizontal superior |
| `door` | `porta`, `porta_abrir`, `porta_e`, `porta_d`, `porta_esq`, `porta_dir` | Porta de abrir |
| `sliding_door` | `porta_correr`, `porta_deslizante` | Porta de correr |
| `back_panel` | `traseira`, `fundo`, `back` | Fundo/traseira do móvel |
| `shelf` | `prateleira` | Prateleira |
| `divider` | `divisoria`, `divisória`, `partition` | Divisória vertical interna |
| `drawer_side` | `gaveta_lado`, `lateral_gaveta`, `gaveta_lat` | Lateral da gaveta |
| `drawer_bottom` | `gaveta_fundo`, `fundo_gaveta`, `gaveta_bot` | Fundo da gaveta |
| `drawer_back` | `gaveta_traseira`, `traseira_gaveta`, `gaveta_tras` | Traseira da gaveta |
| `drawer_front` | `gaveta_frente`, `frente_gaveta`, `frente_falsa`, `frente` | Frente/Frente-falsa da gaveta |
| `kick` | `rodape`, `rodapé`, `saia`, `kickboard` | Rodapé |
| `cover` | `tamponamento`, `acabamento`, `painel_lateral` | Tamponamento lateral |
| `rail` | `cabideiro`, `varao`, `varão` | Varão/cabideiro |
| `countertop` | `tampo_bancada` | Tampo de bancada (pedra, MDF espesso) |
| `generic` | `generica`, `outro` | Peça sem papel definido |

> **Dica**: o sistema remove acentos e converte para minúsculo antes de comparar. `"Lateral_Esq"` e `"lateral_esq"` são equivalentes.

### 5.2 O que cada role ativa automaticamente

| Role | Minifix/Cavilha | Dobradiça | System 32 | Rasgo fundo | Corrediça | Puxador |
|---|---|---|---|---|---|---|
| `lateral` | ✅ recebe | — | ✅ | ✅ recebe | — | — |
| `base` | ✅ recebe | — | — | ✅ recebe | — | — |
| `top` | ✅ recebe | — | — | — | — | — |
| `door` | — | ✅ recebe furos | — | — | — | ✅ |
| `sliding_door` | — | — | — | — | — | — |
| `back_panel` | — | — | — | — | — | — |
| `shelf` | — | — | — | — | — | — |
| `divider` | ✅ recebe | — | — | — | — | — |
| `drawer_side` | ✅ recebe | — | — | ✅ recebe | ✅ | — |
| `drawer_bottom` | ✅ recebe | — | — | — | — | — |
| `drawer_back` | ✅ recebe | — | — | — | — | — |
| `drawer_front` | — | — | — | — | — | ✅ |
| `kick` | — | — | — | — | — | — |

### 5.3 Usinagens compatíveis por role (usinagens avulsas)

Estas são as usinagens avulsas que aparecem no picker para cada tipo de peça:

| Role | Canal LED | Passagem fio | Fechadura | Pistão gás | Recorte | Furo livre |
|---|---|---|---|---|---|---|
| `lateral` | ✅ | ✅ | — | — | — | ✅ |
| `base` | — | — | — | — | ✅ | ✅ |
| `top` | ✅ | ✅ | — | ✅ | — | ✅ |
| `door` | — | ✅ | ✅ | — | — | ✅ |
| `back_panel` | — | ✅ | — | — | — | ✅ |
| `shelf` | ✅ | ✅ | — | — | — | ✅ |
| `divider` | ✅ | — | — | — | — | ✅ |
| `drawer_front` | — | ✅ | ✅ | — | — | ✅ |
| `kick` | — | — | — | — | ✅ | ✅ |
| `cover` | ✅ | — | — | — | — | ✅ |
| `countertop` | ✅ | ✅ | — | — | ✅ | ✅ |
| `generic` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 6. Referência: `ferragens_auto`

O campo `ferragens_auto` é um array de regras no JSON do módulo. Cada regra declara uma ferragem e as condições para aplicá-la.

```json
"ferragens_auto": [
  { "regra": "tipo_da_regra", ... campos específicos ... , "condicao": "expressão opcional" }
]
```

O campo `"condicao"` é **sempre opcional** em qualquer regra. Se omitido, a regra sempre se aplica.

---

### 6.1 `minifix` — Junção com minifix

Declara que duas peças se unem com parafuso minifix (corpo na peça horizontal, parafuso na peça vertical).

```json
{ 
  "regra": "minifix", 
  "juncao": "lateral_esq × base",
  "condicao": "{tipo_juncao} == 'minifix'"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `juncao` | ✅ | `"[role A] × [role B]"` — as duas peças que se unem. A ordem não importa. |
| `condicao` | ❌ | Expressão booleana |

**Como funciona:** o plugin calcula quantos minifixes cabem no comprimento da junção com base no espaçamento definido nas Configurações Globais.

**Exemplo para um balcão:**
```json
{ "regra": "minifix", "juncao": "lateral_esq × base" },
{ "regra": "minifix", "juncao": "lateral_dir × base" },
{ "regra": "minifix", "juncao": "lateral_esq × topo", "condicao": "{com_tampo}" },
{ "regra": "minifix", "juncao": "lateral_dir × topo", "condicao": "{com_tampo}" }
```

---

### 6.2 `cavilha` — Junção com cavilha

Mesmo uso que `minifix`, mas com cavilha. Os furos são calculados com o diâmetro e espaçamento de cavilha das Configurações Globais.

```json
{ 
  "regra": "cavilha", 
  "juncao": "lateral_esq × base",
  "condicao": "{tipo_juncao} == 'cavilha'"
}
```

---

### 6.3 `confirmat` — Junção com parafuso confirmat

Parafuso estrutural em diagonal. Usado principalmente em compensado e OSB.

```json
{ 
  "regra": "confirmat", 
  "juncao": "lateral_esq × base",
  "condicao": "{tipo_juncao} == 'confirmat'"
}
```

---

### 6.4 `dobradica` — Dobradiça de aba

Declara que a lateral indicada recebe furos de dobradiça. O plugin encontra automaticamente a porta adjacente a essa lateral.

```json
{ 
  "regra": "dobradica", 
  "peca": "lateral_esq",
  "condicao": "{tipo_porta} != 'sem'"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `peca` | ✅ | Role da lateral que recebe os furos de copo |
| `condicao` | ❌ | Expressão booleana |

**Como funciona:** o plugin usa as Configurações Globais para determinar:
- Diâmetro do copo (normalmente 35mm)
- Distância da borda da lateral (normalmente 3mm de overlay)
- Posição da primeira dobradiça (normalmente 100mm da borda)
- Quantidade de dobradiças baseado na altura da porta

**Para portas com abertura direita e esquerda**, declare uma regra para cada lateral:
```json
{ "regra": "dobradica", "peca": "lateral_esq", "condicao": "{tipo_porta} != 'sem'" },
{ "regra": "dobradica", "peca": "lateral_dir", "condicao": "{tipo_porta} == '2_abrir'" }
```

---

### 6.5 `pistao` — Pistão de gás (tampa basculante)

Declara pistão de gás para porta que abre para cima. A peça indicada é o topo que recebe o pistão.

```json
{ 
  "regra": "pistao", 
  "peca": "topo",
  "condicao": "{tipo_abertura} == 'basculante'"
}
```

---

### 6.6 `corredica` — Corrediça de gaveta

Declara o conjunto de gaveta que recebe corrediça. O plugin encontra as laterais do móvel adjacentes às laterais da gaveta.

```json
{ 
  "regra": "corredica", 
  "pecas": ["gaveta_lado", "lateral_esq"],
  "condicao": "{n_gavetas} > 0"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `pecas` | ✅ | Array com `[role_da_lateral_da_gaveta, role_da_lateral_do_móvel]` |
| `condicao` | ❌ | Expressão booleana |

> As configurações de comprimento e tipo de corrediça vêm das Configurações Globais.

---

### 6.7 `system32` — Perfuração System 32

Declara que as laterais listadas recebem a série de furos System 32 (para pinos de prateleira regulável).

```json
{ 
  "regra": "system32", 
  "pecas": ["lateral_esq", "lateral_dir"],
  "condicao": "{n_prateleiras} > 0"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `pecas` | ✅ | Array de roles das peças que recebem System 32 |
| `condicao` | ❌ | Expressão booleana |

**Como funciona:** gera furos de 5mm de diâmetro, a cada 32mm, nas duas fileiras (frente e atrás), dos dois lados internos da lateral.

---

### 6.8 `puxador` — Furo de puxador

Declara que a peça indicada recebe os furos de fixação do puxador.

```json
{ 
  "regra": "puxador", 
  "peca": "porta",
  "espaco": 128,
  "condicao": "{tipo_porta} != 'sem'"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `peca` | ✅ | Role da peça que recebe o puxador |
| `espaco` | ❌ | Espaçamento centro a centro em mm. Se omitido, usa o padrão das Configurações Globais |
| `condicao` | ❌ | Expressão booleana |

---

### 6.9 `rebaixo_fundo` — Rasgo do fundo

Declara que as peças listadas recebem um rasgo para encaixe da traseira (back_panel). O plugin encontra o back_panel do módulo automaticamente.

```json
{ 
  "regra": "rebaixo_fundo", 
  "pecas": ["lateral_esq", "lateral_dir", "base"],
  "condicao": "{com_fundo}"
}
```

| Campo | Obrigatório | Descrição |
|---|---|---|
| `pecas` | ✅ | Array de roles das peças que recebem o rasgo |
| `condicao` | ❌ | Expressão booleana |

**Medidas do rasgo:** largura e profundidade vêm das Configurações Globais (default: 8mm × 10mm, a 8mm da borda traseira).

---

### 6.10 Tabela resumo de regras

| Regra | Campo chave | Quem recebe usinagem |
|---|---|---|
| `minifix` | `juncao: "A × B"` | Ambas as peças da junção |
| `cavilha` | `juncao: "A × B"` | Ambas as peças da junção |
| `confirmat` | `juncao: "A × B"` | Ambas as peças da junção |
| `dobradica` | `peca: "lateral_esq"` | A lateral indicada + porta adjacente |
| `pistao` | `peca: "topo"` | O topo + porta basculante |
| `corredica` | `pecas: [gaveta_lado, lateral_esq]` | Lateral da gaveta + lateral do móvel |
| `system32` | `pecas: [lateral_esq, lateral_dir]` | As laterais listadas |
| `puxador` | `peca: "porta"` | A peça indicada |
| `rebaixo_fundo` | `pecas: [lateral_esq, lateral_dir, base]` | As peças listadas |

---

## 7. Referência: Usinagens Avulsas

Usinagens avulsas são adicionadas manualmente via interface do plugin (botão ⚙ no módulo → drawer de usinagens → "+ add"). Elas complementam as ferragens automáticas com operações especiais.

### 7.1 `rasgo_led` — Canal de LED

Fresa um canal retangular para perfil de LED embutido.

| Parâmetro | Unidade | Default | Min | Max | Descrição |
|---|---|---|---|---|---|
| `largura` | mm | 12 | 6 | 25 | Largura do canal |
| `profundidade` | mm | 8 | 3 | 15 | Profundidade do canal |
| `posicao` | — | `frontal` | — | — | `frontal`, `centro`, `traseiro` |

---

### 7.2 `furo_passagem` — Passagem de fio

Furo cilíndrico passante para cabos, eletrodutos, sifão.

| Parâmetro | Unidade | Default | Min | Max | Descrição |
|---|---|---|---|---|---|
| `diametro` | mm | 40 | 15 | 100 | Diâmetro do furo |
| `posicao_x` | mm | — | 0 | — | Posição X (a partir da borda esquerda da face) |
| `posicao_y` | mm | — | 0 | — | Posição Y (a partir da borda inferior da face) |

> Se `posicao_x` e `posicao_y` não forem informados, o operador define na CNC.

---

### 7.3 `rasgo_fechadura` — Fechadura

Usinagem para encaixe de fechadura em portas.

| Parâmetro | Unidade | Default | Opções | Descrição |
|---|---|---|---|---|
| `modelo` | — | `cilindrica` | `cilindrica`, `trava_movel`, `rolete`, `eletrica` | Tipo de fechadura |
| `posicao_y` | mm | — | — | Posição vertical (0 = base da porta) |

---

### 7.4 `pistao_gas` — Pistão de gás (avulso)

Indica posição do pistão de gás em tampas basculantes (versão avulsa, para quando não há `ferragens_auto`).

| Parâmetro | Unidade | Default | Opções | Descrição |
|---|---|---|---|---|
| `forca_n` | N | 80 | 30–200 | Força necessária do pistão |
| `lado` | — | `esquerda` | `esquerda`, `direita`, `ambos` | Lado de montagem |

---

### 7.5 `recorte` — Recorte retangular

Recorte (reentrância) em qualquer face da peça. Útil para sifão de pia, cooktop, coluna de geladeira, etc.

| Parâmetro | Unidade | Default | Descrição |
|---|---|---|---|
| `x` | mm | — | Posição X do canto do recorte |
| `y` | mm | — | Posição Y do canto do recorte |
| `largura` | mm | — | Largura do recorte |
| `altura` | mm | — | Altura do recorte |

---

### 7.6 `furo_livre` — Furo em posição livre

Furo de qualquer diâmetro e profundidade, em qualquer posição e face.

| Parâmetro | Unidade | Default | Min | Max | Opções | Descrição |
|---|---|---|---|---|---|---|
| `diametro` | mm | 8 | 2 | 60 | — | Diâmetro do furo |
| `profundidade` | mm | 15 | 1 | — | — | Profundidade (0 = passante) |
| `posicao_x` | mm | — | — | — | — | Posição X na face |
| `posicao_y` | mm | — | — | — | — | Posição Y na face |
| `face` | — | `a` | — | — | `a`, `b`, `c`, `d` | Face da peça a usinar |

**Convenção de faces:**
- `a` = face principal (a maior, voltada para frente do móvel)
- `b` = face externa oposta (topo da lateral, por exemplo)
- `c` = borda longitudinal esquerda
- `d` = borda longitudinal direita

---

## 8. Referência: Bordas

Bordas (fita de borda) são aplicadas nas arestas da peça após o corte CNC.

### 8.1 Faces de uma peça

Uma peça retangular tem 4 bordas aplicáveis (as faces planas maiores não recebem fita):

```
           TOPO (top)
          ┌────────────────────┐
          │                    │
ESQ (esq) │                    │ DIR (dir)
          │                    │
          └────────────────────┘
           BAIXO (baixo/bas)

  ← FRONTAL (frontal)   TRASEIRA (tras) →
```

| Chave JSON | Descrição |
|---|---|
| `frontal` | Aresta frontal (voltada para o usuário) |
| `traseira` ou `tras` | Aresta traseira (encostada na parede) |
| `topo` | Aresta superior |
| `baixo` ou `bas` | Aresta inferior |
| `esq` | Aresta esquerda (olhando de frente) |
| `dir` | Aresta direita (olhando de frente) |

### 8.2 Definindo bordas no JSON

```json
"bordas": {
  "frontal":  true,
  "traseira": false,
  "topo":     false,
  "baixo":    false,
  "esq":      false,
  "dir":      false
}
```

Qualquer chave omitida é tratada como `false`.

### 8.3 Bordas típicas por tipo de peça

| Peça | Borda frontal | Borda topo | Borda baixo | Borda esq | Borda dir |
|---|---|---|---|---|---|
| Lateral | ✅ | — | — | — | — |
| Base interna | ✅ | — | — | — | — |
| Topo interno | ✅ | — | — | — | — |
| Traseira | — | — | — | — | — |
| **Porta** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Prateleira | ✅ | — | — | — | — |
| Frente gaveta | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lateral gaveta | — | — | — | — | — |
| Rodapé | ✅ | — | — | — | — |
| Tamponamento | ✅ | ✅ | ✅ | ✅ | — |

---

## 9. Referência: Materiais

### 9.1 Formato do código de material

```
[TIPO][ESPESSURA]_[COR/ACABAMENTO]

Exemplos:
  MDF18_BrancoTX       → MDF 18mm, Branco Texturizado
  MDF18_Grafite        → MDF 18mm, Grafite
  MDF15_BrancoTX       → MDF 15mm, Branco Texturizado
  MDP18_BrancoTX       → MDP 18mm (aglomerado), Branco Texturizado
  Compensado15         → Compensado 15mm (natural)
  OSB18                → OSB 18mm
```

### 9.2 Lista de materiais padrão

| Código | Tipo | Espessura | Acabamento |
|---|---|---|---|
| `MDF18_BrancoTX` | MDF | 18mm | Branco texturizado |
| `MDF18_Grafite` | MDF | 18mm | Grafite |
| `MDF18_Carvalho` | MDF | 18mm | Carvalho |
| `MDF18_Preto` | MDF | 18mm | Preto |
| `MDF15_BrancoTX` | MDF | 15mm | Branco texturizado |
| `MDP15_BrancoTX` | MDP | 15mm | Branco texturizado |
| `MDP18_BrancoTX` | MDP | 18mm | Branco texturizado |
| `OSB18` | OSB | 18mm | Natural |
| `Compensado15` | Compensado | 15mm | Natural |
| `Compensado18` | Compensado | 18mm | Natural |

### 9.3 Adicionando novos materiais

Novos materiais podem ser cadastrados no ERP Ornato (Configurações → Materiais). O código registrado lá deve ser usado exatamente no SketchUp e no JSON.

---

## 10. Ferragens Visuais em 3D

### 10.1 Por que usar componentes 3D?

Os componentes 3D de ferragens servem para **apresentação ao cliente** e **verificação visual** do projeto. Eles não afetam os dados de usinagem — as posições dos furos vêm das regras `ferragens_auto` e das Configurações Globais.

O plugin posiciona os componentes visuais automaticamente depois de processar as ferragens.

### 10.2 Onde baixar

Use o **3D Warehouse** do SketchUp (Arquivo → 3D Warehouse → Buscar). Pesquise por:

| Ferragem | Termo de busca sugerido |
|---|---|
| Dobradiça Blum | `blum clip top hinge 35mm` |
| Dobradiça genérica | `cabinet hinge 35mm cup` |
| Corrediça Tandem Blum | `blum tandem plus drawer slide` |
| Corrediça telescópica | `telescopic drawer slide` |
| Minifix | `minifix connector cam nut` |
| Puxador barra | `bar handle cabinet pull` |
| Pistão de gás | `gas piston lid support` |
| Varão de closet | `wardrobe clothes rail` |
| Pino de prateleira | `shelf pin support` |

### 10.3 Como salvar e organizar

1. Baixe o componente do 3D Warehouse
2. Edite para remover geometria desnecessária (quanto mais simples, melhor o desempenho)
3. Ajuste a origem do componente (ver 10.4)
4. Salve como `.skp` em:

```
biblioteca/
  ferragens/
    dobradicas/
      blum_clip_top_35mm.skp
      generica_35mm.skp
    corredicas/
      blum_tandem_450mm.skp
      blum_tandem_500mm.skp
      telescopica_450mm.skp
    minifix/
      minifix_15mm_corpo.skp
      minifix_15mm_parafuso.skp
    puxadores/
      barra_128mm.skp
      barra_160mm.skp
      gola_32mm.skp
    suportes/
      pino_prateleira_5mm.skp
    especiais/
      pistao_gas_80n.skp
```

### 10.4 Convenção de origem do componente

A **origem** (ponto [0,0,0]) do componente define onde o plugin encaixa a ferragem. Siga as convenções:

#### Dobradiça (35mm)

```
         ↑ Z (altura no móvel)
         │
  LATERAL│ PORTA
    ──── │ ────────────┐
         │             │  ← Porta
    copa │  ← [0,0,0] (centro do copo, na face da lateral)
         │             │
    ──── │ ────────────┘
         │
```

- Origem: **centro do copo de 35mm**, na face interna da lateral
- Z = 0 na face da lateral que receberá o furo
- O eixo X aponta para dentro da porta

#### Corrediça

```
         Y (comprimento)
         ↑
         │
    ─────┼──────────────────────── comprimento total
[0,0,0] ─┘ (canto frontal inferior do trilho)
```

- Origem: **canto frontal inferior** do corpo da corrediça
- Y aponta para o fundo do móvel
- Z = 0 na face que encoста na lateral da gaveta

#### Minifix

- **Corpo (cam)**: origem no **centro do disco**, Z = 0 na face encostada na peça
- **Parafuso**: origem na **ponta da rosca**, Z aponta para dentro da madeira

#### Puxador

```
         [furo 1]        [furo 2]
           ●────────────────●
           ↑                ↑
        [0,0,0]         [0, esp, 0]  ← esp = espaçamento
```

- Origem: **centro do primeiro furo de fixação**
- Y aponta para o segundo furo
- Z aponta para fora da porta (sentido de puxar)

### 10.5 Vinculando componente ao sistema

No arquivo `config/shop_config.json` (ou via interface de Configurações Globais), vincule cada tipo de ferragem ao componente correspondente:

```json
{
  "visual": {
    "dobradica": "dobradicas/blum_clip_top_35mm.skp",
    "corredica": "corredicas/blum_tandem_450mm.skp",
    "minifix_corpo": "minifix/minifix_15mm_corpo.skp",
    "minifix_parafuso": "minifix/minifix_15mm_parafuso.skp",
    "pino_prateleira": "suportes/pino_prateleira_5mm.skp"
  }
}
```

O HardwareVisualizer usa esse mapeamento para auto-posicionar os componentes 3D após o processamento.

### 10.6 Ativando a visualização

No painel Ornato:
- Aba **Modelo** → selecione um módulo → ⚙ Processar ferragens
- O plugin posiciona automaticamente os componentes visuais nas posições calculadas
- Os componentes ficam dentro do grupo da peça, com a nomenclatura `[ferragem]_visual_N`

> Os componentes visuais são **somente para renderização**. Eles são ignorados na detecção de peças e na exportação de usinagens.

---

## 11. Configurações Globais (ShopConfig)

As Configurações Globais definem os padrões técnicos da sua marcenaria: diâmetros de ferramentas, folgas de montagem, espaçamentos. Esses valores ficam salvos por workstation (computador) e são herdados por todos os módulos automaticamente.

**Onde acessar:** Painel Ornato → ⚙ (engrenagem no canto superior direito) → abre o painel de Configurações Globais com 8 abas.

**Como as variáveis chegam aos JSONs:** cada configuração tem um nome de variável correspondente (ex: `{folga_porta_lateral}`) que pode ser usado diretamente em qualquer expressão paramétrica. Veja a seção 4.4 para a tabela completa.

**Como adicionar uma nova variável** (para desenvolvedores):
1. Adicionar ao `FACTORY_DEFAULTS` em `hardware/shop_config.rb`
2. Adicionar o campo HTML + `setVal`/`getVal` em `ui/shop_config_panel.html`
3. Adicionar à chave `to_expr_params` em `shop_config.rb` com o nome de variável desejado
4. Usar `{nome_variavel}` nos JSONs da biblioteca

---

### 11.1 Folgas de fabricação

Folgas são os espaços que a peça deixa para facilitar a montagem e o funcionamento. São os parâmetros que mais variam entre marcenarias — ajuste uma vez e todos os módulos ficam corretos.

#### Porta de abrir

| Parâmetro | Variável JSON | Default | Descrição |
|---|---|---|---|
| Lateral (cada lado) | `{folga_porta_lateral}` | `1.0` mm | Gap entre cada borda da porta e a lateral |
| Topo | `{folga_porta_topo}` | `1.0` mm | Gap entre porta e tampo |
| Base | `{folga_porta_base}` | `1.0` mm | Gap entre porta e base ou rodapé |
| Entre 2 portas | `{folga_entre_portas}` | `2.0` mm | Gap total nos batentes centrais de portas duplas |

**Como usar:**
```json
"largura": "({largura} - 2 * {espessura} - {folga_entre_portas}) / 2 - {folga_porta_lateral}"
```
*Para 2 portas numa abertura de 600mm, espessura 18mm, folgas padrão:*
*(600 − 36 − 2) / 2 − 1 = **281 mm** cada porta*

#### Porta de correr

| Parâmetro | Variável JSON | Default | Descrição |
|---|---|---|---|
| Folga trilho superior | `{folga_correr_topo}` | `3.0` mm | Encaixe no perfil superior |
| Folga trilho inferior | `{folga_correr_base}` | `3.0` mm | Encaixe no trilho inferior |

#### Gaveta (caixa interna)

| Parâmetro | Variável JSON | Default | Descrição |
|---|---|---|---|
| Lateral (cada lado) | `{folga_gaveta_lateral}` | `12.5` mm | Espaço gaveta↔lateral; igual à largura da corrediça Tandem Blum |
| Fundo | `{folga_gaveta_fundo}` | `5.0` mm | Caixa da gaveta↔base do módulo |
| Topo | `{folga_gaveta_topo}` | `5.0` mm | Topo da gaveta↔peça acima |
| Entre gavetas | `{folga_entre_gavetas}` | `3.0` mm | Gap entre frentes de gavetas consecutivas |

**Como usar:**
```json
"largura": "{largura} - 2 * {espessura} - 2 * {folga_gaveta_lateral}"
"altura":  "{altura_gaveta} - {folga_gaveta_fundo} - {folga_gaveta_topo}"
```

#### Prateleira

| Parâmetro | Variável JSON | Default | Descrição |
|---|---|---|---|
| Lateral (cada lado) | `{folga_prat_lateral}` | `1.0` mm | Folga de cada lado |
| Recuo traseiro | `{folga_prat_traseira}` | `20.0` mm | Distância prateleira↔fundo do módulo |

**Como usar:**
```json
"largura":    "{largura} - 2 * {espessura} - 2 * {folga_prat_lateral}"
"profundidade": "{profundidade} - {espessura} - {folga_prat_traseira}"
```

#### Divisória

| Parâmetro | Variável JSON | Default | Descrição |
|---|---|---|---|
| Topo | `{folga_div_topo}` | `1.0` mm | Divisória↔tampo |
| Base | `{folga_div_base}` | `1.0` mm | Divisória↔base |

---

### 11.2 Rasgo de fundo

O rasgo (dado) nas laterais, base e tampo para encaixar o painel de fundo.

| Parâmetro | Variável JSON | Default | Descrição |
|---|---|---|---|
| Largura do rasgo | `{rasgo_largura}` | `4.0` mm | Deve acomodar a espessura do fundo (HDF 3mm + folga) |
| Profundidade | `{rasgo_profundidade}` | `8.0` mm | Profundidade do canal |
| Recuo da borda traseira | `{rasgo_recuo}` | `10.0` mm | Da borda traseira da lateral ao início do rasgo |

**Como usar no JSON** (comprimento da lateral com desconto do rasgo):
```json
"largura": "{profundidade} - {rasgo_recuo}"
```

---

### 11.3 Dobradiças

| Parâmetro | Variável JSON | Default | Descrição |
|---|---|---|---|
| Modelo | — | `blum_clip_top` | Blum Clip-Top 110°, Grass Tiomos, Häfele Metalla… |
| Offset borda frontal | `{dobradica_edge_offset}` | `22.5` mm | Centro do cup → borda da porta |
| Diâmetro do cup | `{dobradica_cup_dia}` | `35.0` mm | Padrão de mercado |
| Profundidade do cup | — | `12.5` mm | Definido pelo modelo |
| Diâmetro furos piloto | — | `2.5` mm | Furos de fixação da chapa |
| 1ª / última dobradiça | `{dobradica_top_offset}` | `100.0` mm | Distância da borda da porta à primeira dobradiça |
| Soft-close integrado | — | desligado | Ativa amortecimento no modelo selecionado |

**Quantidade automática por altura de porta:**

| Altura | Dobradiças |
|---|---|
| até 600 mm | 2 |
| 601 – 1200 mm | 3 |
| 1201 – 1800 mm | 4 |
| acima de 1800 mm | 5 |

---

### 11.4 Junção estrutural

| Parâmetro | Variável JSON | Default | Opções |
|---|---|---|---|
| Tipo padrão | — | `minifix` | `minifix`, `confirmat`, `dowel` (cavilha) |

#### Minifix

| Parâmetro | Variável JSON | Default |
|---|---|---|
| Ø corpo (cam) | `{minifix_body_dia}` | `15.0` mm |
| Prof. corpo | — | `12.0` mm |
| Ø pino | — | `8.0` mm |
| Prof. pino | — | `11.0` mm |
| Espaçamento entre pares | `{minifix_spacing}` | `128.0` mm |
| Distância mínima da borda | `{minifix_min_edge}` | `50.0` mm |

#### Confirmat

| Parâmetro | Variável JSON | Default |
|---|---|---|
| Ø furo face | — | `8.0` mm |
| Ø furo topo | — | `5.0` mm |
| Prof. furo topo | — | `45.0` mm |
| Espaçamento | `{confirmat_spacing}` | `128.0` mm |
| Dist. mínima borda | `{confirmat_min_edge}` | `50.0` mm |

#### Cavilha

| Parâmetro | Variável JSON | Default |
|---|---|---|
| Diâmetro | — | `8.0` mm |
| Prof. (cada peça) | — | `15.0` mm |
| Espaçamento | `{cavilha_spacing}` | `96.0` mm |
| Dist. mínima borda | `{cavilha_min_edge}` | `32.0` mm |

---

### 11.5 Corrediça de gaveta

| Parâmetro | Variável JSON | Default | Opções |
|---|---|---|---|
| Modelo | — | `tandem_push` | Blum Tandem, Blum Blumotion, Grass Dynapro, Convencional |
| Comprimento | `{corredica_comprimento}` | `450` mm | 300, 350, 400, 450, 500, 550, 600 |
| Altura 1º furo | `{corredica_alt_fixacao}` | `37.0` mm | Y do primeiro furo de fixação |
| Extração total | — | sim | — |

> O padrão de furos de cada modelo por comprimento é fixo conforme o fabricante. O sistema calcula automaticamente.

---

### 11.6 Puxador

| Parâmetro | Variável JSON | Default | Opções |
|---|---|---|---|
| Espaçamento entre furos | `{puxador_espacamento}` | `128` mm | 96, 128, 160, 192, 256, 320 |
| Posição na porta | — | `topo` | `topo`, `centro`, `baixo` |
| Ø furo passante | `{puxador_dia_furo}` | `5.0` mm | — |
| Recuo da borda | `{puxador_recuo}` | `37.0` mm | Da borda oposta à dobradiça |
| Y da borda superior | `{puxador_y_porta}` | `100.0` mm | Para posição `topo` em portas |

---

### 11.7 Sistema 32

| Parâmetro | Variável JSON | Default | Descrição |
|---|---|---|---|
| Diâmetro | `{sys32_dia}` | `5.0` mm | Ø dos furos de pino de prateleira |
| Profundidade | `{sys32_depth}` | `12.0` mm | — |
| Módulo | `{sys32_spacing}` | `32.0` mm | Múltiplo de 32 mm |
| Offset frontal | `{sys32_front_offset}` | `37.0` mm | Eixo da fileira frontal de furos |
| Offset traseiro | `{sys32_rear_offset}` | `37.0` mm | Eixo da fileira traseira de furos |
| Margem superior | `{sys32_top_margin}` | `37.0` mm | Início dos furos a partir do topo |
| Margem inferior | `{sys32_bottom_margin}` | `37.0` mm | Fim dos furos antes da base |

---

### 11.8 Como as configurações se propagam

```
ShopConfig (workstation)
    ↓  carregado por ShopConfig.load
    ↓  convertido em variáveis planas por ShopConfig.to_expr_params
    ↓  injetado no JsonModuleBuilder como camada base
    ↓
Expressões dos JSONs resolvem {folga_porta_lateral} etc.
    ↓
Instância pode sobrescrever via atributo 'Ornato/hardware_config'
    ↓  lido por ShopConfig.for_group(module_group)
    ↓
Regras de ferragem calculam posições finais de furos
```

**Prioridade (maior sobrescreve menor):**
```
user_params > JSON defaults > ShopConfig global > PARAM_ALIASES internos
```

---

## 12. Exemplos Completos

### 12.1 Balcão simples — JSON comentado

```json
{
  "id": "balcao_simples",
  "nome": "Balcão Simples",
  "descricao": "Armário base com 1 ou 2 portas, prateleira opcional e rodapé.",
  "categoria": "cozinha",
  "tags": ["base", "porta", "cozinha"],
  "icone": "cabinet",

  "parametros": {
    "largura":       { "default": 600,  "min": 300,  "max": 1200, "step": 50  },
    "altura":        { "default": 850,  "min": 600,  "max": 1000, "step": 50  },
    "profundidade":  { "default": 580,  "min": 400,  "max": 700,  "step": 10  },
    "espessura":     { "default": 18,   "min": 15,   "max": 25,   "step": 0.5 },
    "n_prateleiras": { "default": 1,    "min": 0,    "max": 3,    "step": 1   },
    "tipo_porta":    { "default": "2_abrir", "opcoes": ["sem","1_abrir_e","1_abrir_d","2_abrir"] },
    "tipo_juncao":   { "default": "minifix", "opcoes": ["minifix","cavilha","confirmat"] },
    "com_fundo":     { "default": true },
    "com_rodape":    { "default": true },
    "com_tampo":     { "default": true },
    "puxador":       { "default": "modelo_128mm" }
  },

  "pecas": [
    {
      "nome": "Lateral Esquerda",
      "role": "lateral_esq",
      "largura":   "{altura} - {altura_rodape}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao": { "x": "0", "y": "0", "z": "{altura_rodape}" },
      "bordas": { "frontal": true }
    },
    {
      "nome": "Lateral Direita",
      "role": "lateral_dir",
      "largura":   "{altura} - {altura_rodape}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao": { "x": "{largura} - {espessura}", "y": "0", "z": "{altura_rodape}" },
      "bordas": { "frontal": true }
    },
    {
      "nome": "Base",
      "role": "base",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "posicao": { "x": "{espessura}", "y": "0", "z": "{altura_rodape}" },
      "bordas": { "frontal": true }
    },
    {
      "nome": "Tampo",
      "role": "topo",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{profundidade}",
      "espessura": "{espessura}",
      "condicao":  "{com_tampo}",
      "posicao": { "x": "{espessura}", "y": "0", "z": "{altura} - {espessura}" },
      "bordas": { "frontal": true }
    },
    {
      "nome": "Traseira",
      "role": "traseira",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{altura} - {altura_rodape} - 2 * {espessura}",
      "espessura": 3,
      "condicao":  "{com_fundo}",
      "posicao": { "x": "{espessura}", "y": "{profundidade} - 13", "z": "{altura_rodape} + {espessura}" },
      "bordas": {}
    },
    {
      "nome": "Prateleira",
      "role": "prateleira",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{profundidade} - 20",
      "espessura": "{espessura}",
      "condicao":  "{n_prateleiras} > 0",
      "posicao": {
        "x": "{espessura}",
        "y": "0",
        "z": "{altura_rodape} + ({altura} - {altura_rodape}) / 2"
      },
      "bordas": { "frontal": true }
    },
    {
      "nome": "Porta Esquerda",
      "role": "porta",
      "largura":   "{altura} - {altura_rodape} - 2 * {espessura} - 2",
      "altura":    "({largura} - 2 * {espessura}) / 2 - 2",
      "espessura": "{espessura}",
      "condicao":  "{tipo_porta} == '2_abrir'",
      "posicao": { "x": "{espessura}", "y": "0", "z": "{altura_rodape} + {espessura} + 1" },
      "bordas": { "frontal": true, "traseira": true, "topo": true, "baixo": true, "esq": true, "dir": true }
    },
    {
      "nome": "Porta Direita",
      "role": "porta",
      "largura":   "{altura} - {altura_rodape} - 2 * {espessura} - 2",
      "altura":    "({largura} - 2 * {espessura}) / 2 - 2",
      "espessura": "{espessura}",
      "condicao":  "{tipo_porta} == '2_abrir'",
      "posicao": {
        "x": "{largura} / 2 + 1",
        "y": "0",
        "z": "{altura_rodape} + {espessura} + 1"
      },
      "bordas": { "frontal": true, "traseira": true, "topo": true, "baixo": true, "esq": true, "dir": true }
    },
    {
      "nome": "Rodapé",
      "role": "rodape",
      "largura":   "{largura} - 2 * {espessura}",
      "altura":    "{altura_rodape}",
      "espessura": "{espessura}",
      "condicao":  "{com_rodape}",
      "posicao": { "x": "{espessura}", "y": "50", "z": "0" },
      "bordas": { "frontal": true }
    }
  ],

  "ferragens_auto": [
    { "regra": "minifix",        "juncao": "lateral_esq × base",  "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "minifix",        "juncao": "lateral_dir × base",  "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "minifix",        "juncao": "lateral_esq × topo",  "condicao": "{tipo_juncao} == 'minifix' && {com_tampo}" },
    { "regra": "minifix",        "juncao": "lateral_dir × topo",  "condicao": "{tipo_juncao} == 'minifix' && {com_tampo}" },
    { "regra": "cavilha",        "juncao": "lateral_esq × base",  "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "cavilha",        "juncao": "lateral_dir × base",  "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "cavilha",        "juncao": "lateral_esq × topo",  "condicao": "{tipo_juncao} == 'cavilha' && {com_tampo}" },
    { "regra": "cavilha",        "juncao": "lateral_dir × topo",  "condicao": "{tipo_juncao} == 'cavilha' && {com_tampo}" },
    { "regra": "confirmat",      "juncao": "lateral_esq × base",  "condicao": "{tipo_juncao} == 'confirmat'" },
    { "regra": "confirmat",      "juncao": "lateral_dir × base",  "condicao": "{tipo_juncao} == 'confirmat'" },
    { "regra": "dobradica",      "peca": "lateral_esq",           "condicao": "{tipo_porta} != 'sem'" },
    { "regra": "dobradica",      "peca": "lateral_dir",           "condicao": "{tipo_porta} == '2_abrir'" },
    { "regra": "rebaixo_fundo",  "pecas": ["lateral_esq", "lateral_dir", "base"], "condicao": "{com_fundo}" },
    { "regra": "puxador",        "peca": "porta",                 "condicao": "{tipo_porta} != 'sem'" },
    { "regra": "system32",       "pecas": ["lateral_esq", "lateral_dir"], "condicao": "{n_prateleiras} > 0" }
  ]
}
```

---

### 12.2 Gaveteiro 3 gavetas — JSON resumido

```json
{
  "id": "gaveteiro_3",
  "nome": "Gaveteiro 3 Gavetas",
  "categoria": "cozinha",

  "parametros": {
    "largura":      { "default": 450, "min": 300, "max": 900, "step": 50 },
    "altura":       { "default": 720, "min": 500, "max": 900, "step": 50 },
    "profundidade": { "default": 550, "min": 400, "max": 650, "step": 10 },
    "espessura":    { "default": 18,  "min": 15,  "max": 25  },
    "tipo_juncao":  { "default": "minifix", "opcoes": ["minifix","cavilha"] },
    "com_rodape":   { "default": true },
    "puxador":      { "default": "modelo_128mm" }
  },

  "pecas": [
    { "nome": "Lateral Esquerda", "role": "lateral_esq",
      "largura": "{altura} - {altura_rodape}", "altura": "{profundidade}", "espessura": "{espessura}",
      "posicao": { "x": "0", "y": "0", "z": "{altura_rodape}" }, "bordas": { "frontal": true } },

    { "nome": "Lateral Direita", "role": "lateral_dir",
      "largura": "{altura} - {altura_rodape}", "altura": "{profundidade}", "espessura": "{espessura}",
      "posicao": { "x": "{largura} - {espessura}", "y": "0", "z": "{altura_rodape}" }, "bordas": { "frontal": true } },

    { "nome": "Topo", "role": "topo",
      "largura": "{largura} - 2 * {espessura}", "altura": "{profundidade}", "espessura": "{espessura}",
      "posicao": { "x": "{espessura}", "y": "0", "z": "{altura} - {espessura}" }, "bordas": { "frontal": true } },

    { "nome": "Traseira", "role": "traseira",
      "largura": "{largura} - 2 * {espessura}", "altura": "{altura} - {altura_rodape} - 2 * {espessura}",
      "espessura": 3,
      "posicao": { "x": "{espessura}", "y": "{profundidade} - 13", "z": "{altura_rodape} + {espessura}" } },

    { "nome": "Frente Gaveta 1", "role": "gaveta_frente",
      "largura": "({altura} - {altura_rodape} - 2 * {espessura}) / 3 - 3",
      "altura": "{largura} - 2 * {espessura} - 4", "espessura": "{espessura}",
      "posicao": { "x": "{espessura} + 2", "y": "0", "z": "{altura_rodape} + {espessura} + 1" },
      "bordas": { "frontal": true, "traseira": true, "topo": true, "baixo": true, "esq": true, "dir": true } },

    { "nome": "Frente Gaveta 2", "role": "gaveta_frente",
      "largura": "({altura} - {altura_rodape} - 2 * {espessura}) / 3 - 3",
      "altura": "{largura} - 2 * {espessura} - 4", "espessura": "{espessura}",
      "posicao": {
        "x": "{espessura} + 2",
        "y": "0",
        "z": "{altura_rodape} + {espessura} + ({altura} - {altura_rodape} - 2 * {espessura}) / 3 + 2"
      },
      "bordas": { "frontal": true, "traseira": true, "topo": true, "baixo": true, "esq": true, "dir": true } },

    { "nome": "Frente Gaveta 3", "role": "gaveta_frente",
      "largura": "({altura} - {altura_rodape} - 2 * {espessura}) / 3 - 3",
      "altura": "{largura} - 2 * {espessura} - 4", "espessura": "{espessura}",
      "posicao": {
        "x": "{espessura} + 2",
        "y": "0",
        "z": "{altura} - {espessura} - ({altura} - {altura_rodape} - 2 * {espessura}) / 3 + 1"
      },
      "bordas": { "frontal": true, "traseira": true, "topo": true, "baixo": true, "esq": true, "dir": true } },

    { "nome": "Rodapé", "role": "rodape", "condicao": "{com_rodape}",
      "largura": "{largura} - 2 * {espessura}", "altura": "{altura_rodape}", "espessura": "{espessura}",
      "posicao": { "x": "{espessura}", "y": "50", "z": "0" }, "bordas": { "frontal": true } }
  ],

  "ferragens_auto": [
    { "regra": "minifix",   "juncao": "lateral_esq × topo", "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "minifix",   "juncao": "lateral_dir × topo", "condicao": "{tipo_juncao} == 'minifix'" },
    { "regra": "cavilha",   "juncao": "lateral_esq × topo", "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "cavilha",   "juncao": "lateral_dir × topo", "condicao": "{tipo_juncao} == 'cavilha'" },
    { "regra": "corredica", "pecas": ["gaveta_lado", "lateral_esq"] },
    { "regra": "corredica", "pecas": ["gaveta_lado", "lateral_dir"] },
    { "regra": "puxador",   "peca": "gaveta_frente" }
  ]
}
```

---

## 13. FAQ e Resolução de Problemas

### O plugin não detecta minhas peças

- Verifique se cada peça é um **Grupo** (não Componente) filho direto do grupo do módulo
- O grupo da peça deve ter forma retangular simples. Geometrias com furos ou arredondamentos não são detectadas como chapas
- Verifique se o grupo do módulo contém apenas peças (sem geometria solta ou guias)

### O role está errado / ferragens aparecem no lugar errado

- O nome do grupo pode estar ambíguo. Exemplo: "Porta_Fundo" pode ser confundido com `back_panel`. Prefira "Porta Abrir Esquerda" ou defina o atributo `Ornato → role` diretamente
- Verifique a tabela de inferência por nome na seção 5.1

### As dobradiças não aparecem

- Verifique se existe uma regra `"regra": "dobradica"` no `ferragens_auto` do JSON
- Verifique se a porta tem o role correto (`door`, `porta`, ou qualquer alias)
- Na modelagem manual, a porta deve estar **geometricamente adjacente** à lateral

### O minifix está gerando muitas posições / poucas

- Ajuste o parâmetro `minifix.espaco_entre` nas Configurações Globais
- O número de minifixes = `floor((comprimento_juncao - 2 * distancia_borda) / espaco_entre) + 1`

### Quero um módulo que não existe na biblioteca

1. Use **Modelagem Manual** (Workflow 1) para criar o módulo personalizado
2. Se for se repetir, crie um novo JSON na biblioteca seguindo os exemplos da seção 12

### Como adicionar uma usinagem que não está no picker

Qualquer usinagem não listada deve ser tratada como `furo_livre` com os parâmetros manuais, ou adicionada como um novo tipo no catálogo (requer alteração no código do plugin).

### A expressão paramétrica está dando resultado errado

Verifique:
- O nome do parâmetro entre `{}` é exatamente igual ao declarado em `"parametros"`
- Parênteses estão balanceados: `({largura} - 36) / 2`
- Não use vírgulas como separador decimal — use ponto: `0.5` não `0,5`

### Como saber se meu JSON está correto antes de testar no SketchUp?

Você pode validar a sintaxe JSON em [jsonlint.com](https://jsonlint.com). Para validar a lógica, insira o módulo pelo plugin e verifique na aba Modelo se todas as peças aparecem com o role correto.

---

*Manual Ornato Design Plugin — atualizado em 2025*  
*Para dúvidas técnicas: suporte@ornato.com.br*
