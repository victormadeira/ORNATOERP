# Manual de Modelagem da Galeria — Plugin Ornato

> **Para quem:** equipe que vai modelar os 30-50 módulos da galeria do plugin SketchUp Ornato.
> **Pré-requisito:** SketchUp 2021+ instalado, plugin Ornato carregado em modo dev.
> **Princípio absoluto:** *você não desenha furos. Você modela peças sólidas. O plugin calcula toda a usinagem por colisão.*

---

## 0. Os 3 mandamentos antes de começar

### 1️⃣ Modele peças, não furos
A CNC vai usinar. Você só posiciona as chapas. Furo de minifix, copa de dobradiça, rasgo de fundo, System32 — tudo isso é gerado **automaticamente** pelo plugin a partir do contato entre peças.

### 2️⃣ Nome correto = usinagem correta
Cada peça precisa ter um **nome de grupo** com prefixo padrão (`LAT_ESQ`, `BASE`, `POR_DIR` etc.). O plugin reconhece pelo prefixo e aplica a regra correta. Nome errado → usinagem errada.

### 3️⃣ Posição correta = junção correta
Encostar duas peças → o plugin detecta junção BUTT (gera minifix + cavilha).
Recuar uma peça em ~8mm → detecta DADO (gera rasgo de fundo).
Sobrepor peça à frente → detecta OVERLAY (gera dobradiça, se for porta).

**Resumo:** nomenclatura + posicionamento + atributos = usinagem automática perfeita.

---

## 1. Hierarquia obrigatória do modelo

Todo módulo da galeria deve seguir esta estrutura de 3 níveis:

```
MODELO (.skp)
  └── MÓDULO (grupo nomeado com ORN_xxx)
        ├── PEÇA (grupo com nome LAT_ESQ, BASE, etc.)
        ├── PEÇA
        ├── PEÇA
        └── SUBMÓDULO (opcional — gaveteiro interno, nicho)
              ├── PEÇA
              └── PEÇA
```

**Regras críticas:**

- ✅ Módulo no nível raiz do modelo (não solto dentro de outro grupo qualquer)
- ✅ Nome do módulo começa com `ORN_` + código do tipo (lista na seção 3)
- ✅ Toda peça é um **grupo retangular de 6 faces** (chapa)
- ✅ A menor dimensão é interpretada como espessura
- ❌ Peças soltas fora do grupo `ORN_xxx` são ignoradas
- ❌ Peças não-retangulares (com recortes na geometria principal) são ignoradas
- ❌ Profundidade máxima de aninhamento: 3 níveis

---

## 2. Sistema declarativo: PieceStamper

> **Uma peça é uma peça porque diz que é, não porque parece ser.**

Cada peça precisa ter um `AttributeDictionary` chamado `Ornato` no grupo. **Sem esse dicionário, o plugin pode ignorar a peça** (existe fallback heurístico geométrico, mas não confiável).

### Atributos do dicionário `Ornato`

| Atributo | Tipo | Obrigatório | Exemplo | Descrição |
|----------|------|:---:|---------|-----------|
| `tipo` | string | ✅ | `"peca"` | Diferencia peça vs ferragem 3D vs decoração. Valores: `peca`, `ferragem`, `modulo`, `decoracao`, `ambiente` |
| `role` | string | ✅ | `"lateral"` | Papel da peça (ver seção 3) |
| `material` | string | ✅ | `"MDF_18_BRANCO_TX"` | Código do material no catálogo do ERP |
| `espessura` | number | ✅ | `18` | Em mm |
| `borda_top` | string | recomendado | `"BOR_2x22_BR"` | Código da fita aplicada na borda superior |
| `borda_bottom` | string | recomendado | `"none"` | Idem, ou `none` |
| `borda_left` | string | recomendado | `"BOR_1x22_BR"` | |
| `borda_right` | string | recomendado | `"BOR_1x22_BR"` | |
| `grain_direction` | string | opcional | `"length"` | Direção do veio: `length` / `width` / `none` |
| `modulo_id` | string | auto | `"orn_bal_001"` | Preenchido pelo plugin |
| `obs` | string | opcional | `"face vista"` | Observação livre |
| `skip_machining` | bool | opcional | `false` | Se `true`, peça não recebe nenhuma usinagem |
| `force_joint_type` | string | opcional | `"confirmat"` | Override: força minifix/confirmat/cavilha em todas juncões |

### Como aplicar atributos no SketchUp

**Manualmente (Window → Entity Info → Advanced):** abra a peça, vá no painel `Component Attributes`, adicione campos.

**Via console Ruby:**
```ruby
group = Sketchup.active_model.entities.first
attrs = {
  'tipo' => 'peca',
  'role' => 'lateral_esq',
  'material' => 'MDF_18_BRANCO_TX',
  'espessura' => 18,
  'borda_top' => 'BOR_2x22_BR',
  'borda_bottom' => 'none',
  'borda_left' => 'BOR_1x22_BR',
  'borda_right' => 'BOR_1x22_BR',
}
attrs.each { |k, v| group.set_attribute('Ornato', k, v) }
```

**Via JSON (recomendado para galeria):** declare o módulo num arquivo `.json` em `ornato-plugin/biblioteca/` e o `JsonModuleBuilder` aplica os atributos automaticamente. Ver seção 14.

---

## 3. Cheat sheet de nomenclatura

### Códigos de MÓDULO (prefixo `ORN_`)

```
COZINHA
  ORN_BAL          balcão
  ORN_BAL_PIA      balcão com pia
  ORN_BAL_CK       balcão cooktop
  ORN_BAL_CAN      balcão de canto
  ORN_BAL_GAV      balcão gaveteiro
  ORN_AER          aéreo
  ORN_AER_ESC      aéreo escorredor
  ORN_AER_CAN      aéreo de canto
  ORN_TOR_FOR      torre forno/micro
  ORN_TOR_GEL      torre geladeira
  ORN_PAN          paneleiro

DORMITÓRIO/CLOSET
  ORN_ARM          armário
  ORN_ARM_POR      armário com portas de abrir
  ORN_ARM_COR      armário portas de correr
  ORN_GAV          gaveteiro
  ORN_SAP          sapateira
  ORN_CAB          cabideiro

DIVERSOS
  ORN_NIC          nicho
  ORN_BAN          bancada/tampo
  ORN_PAI          painel avulso
  ORN_PRA          prateleira avulsa

BANHEIRO
  ORN_BAN_WC       gabinete banheiro
  ORN_ESP          espelheira
```

> Nome completo aceita descrição livre depois do código: `ORN_BAL Pia Central 800mm` ✅

### Códigos de PEÇA (dentro do módulo)

```
ESTRUTURA
  LAT_ESQ          lateral esquerda     → minifix + cavilha em junção com base/topo
  LAT_DIR          lateral direita      → idem espelhado
  TOPO             tampo superior       → recebe minifix das laterais
  BASE             fundo estrutural     → recebe minifix das laterais
  FUN              fundo (painel 3-6mm) → gera rasgo nas laterais
  DIV_V            divisor vertical     → cavilha (sem minifix)
  DIV_H            divisor horizontal   → cavilha
  TAM              tamponamento         → SEM usinagem (cola)
  TEST             testeira             → SEM usinagem (parafuso externo)
  ROD              rodapé               → SEM usinagem

PRATELEIRAS
  PRA              prateleira fixa      → cavilha nas laterais
  PRA_REG          prateleira regulável → System32 nas laterais (não recebe furo direto)

PORTAS
  POR              porta única          → copa dobradiça + furo puxador
  POR_ESQ          porta esquerda       → dobradiça à esquerda
  POR_DIR          porta direita        → dobradiça à direita
  POR_COR          porta de correr      → trilho no topo/base (sem dobradiça)
  POR_BAS          porta basculante     → pistão a gás
  POR_VID          porta vidro          → canal de perfil

GAVETAS
  GAV_FR           frente de gaveta     → furo puxador
  GAV_LAT          lateral gaveta       → encaixe + rasgo fundo
  GAV_FUN          fundo de gaveta      → gera rasgo nas laterais
  GAV_TRA          traseira gaveta      → encaixe

DECORATIVOS
  MOL              moldura              → chanfro 45° entre molduras
  PAI              painel               → SEM usinagem
  CEN              cenefa               → SEM usinagem
  SUP              suporte/reforço      → cavilha simples
```

> O plugin é case-insensitive e aceita variantes: `LATERAL_ESQ`, `LAT_E`, `lat_esq` todos funcionam.

---

## 4. Sistema de colisão — como o plugin "vê" as peças

O plugin testa contato **face contra face** entre todos os pares de peças no mesmo módulo. O tipo de contato determina a usinagem.

### Os 4 tipos de junção

#### 🟦 BUTT — borda contra face (mais comum)
```
                      ┌────┐
                      │    │ ← edge da Peça B
        ╔═══════════╗ │    │
        ║  Peça A   ║─┴────┘
        ║  (face)   ║
        ╚═══════════╝
        
Resultado: minifix + cavilha
```

#### 🟧 OVERLAY — face contra face
```
        ╔════════════╗
        ║   PORTA    ║ ← face frontal
        ║            ║
        ╠════════════╣
        ║  LATERAL   ║ ← face frontal
        ╚════════════╝
        
Resultado: copa de dobradiça + base de dobradiça
```

#### 🟫 DADO — borda recuada com offset
```
        ╔══════════════════════╗
        ║  LAT_ESQ             ║
        ║      ┌──────┐        ║
        ║      │ FUN  │ ← edge recuada (offset 8mm)
        ║      │      │        ║
        ║      └──────┘        ║
        ╚══════════════════════╝
        
Resultado: rasgo de fundo na lateral
```

#### ⬜ MITER — borda contra borda em ângulo
```
              ╲
               ╲ ← edge MOL_1
                ╲
                 ├── edge MOL_2
                 │
        
Resultado: chanfro 45° em ambas
```

### Tolerâncias importantes

| Parâmetro | Padrão | O que significa |
|-----------|:---:|---|
| `PROXIMITY_TOLERANCE` | 1.0 mm | Peças com gap menor que isso = contato direto (BUTT/OVERLAY) |
| `DADO_TOLERANCE` | 2.0 mm | Gap entre 1 e 2mm = ainda BUTT. Acima de 2mm = DADO (rasgo) |
| `MIN_OVERLAP` | 10 mm | Sobreposição mínima pra contagem de contato válido |
| `MIN_CONTACT_AREA` | 100 mm² | Área mínima de contato pra gerar usinagem |

> **Regra prática:** se você quer junção apertada (minifix+cavilha), encoste as peças com `0` de gap. Se quer rasgo de fundo, recue a peça em **8mm** (espessura padrão do fundo MDF 3mm + folga).

---

## 5. Variáveis especiais reconhecidas pelo ERP

Atributos no dicionário `Ornato` que mudam comportamento:

### Atributos de override de usinagem

| Atributo | Quando usar | Exemplo |
|----------|-------------|---------|
| `skip_machining: true` | Peça decorativa que está em contato mas não deve ser usinada | Tamponamento aparafusado por fora |
| `force_joint_type: "confirmat"` | Forçar confirmat (europarafuso) em vez de minifix | Móvel pesado, cliente prefere |
| `force_joint_type: "minifix"` | Forçar minifix (default) | — |
| `back_panel_thickness: 6` | Override da espessura padrão do fundo | Fundo de 6mm em vez de 3mm |
| `joint_type: "minifix_only"` | Sem cavilhas intermediárias entre minifixes | Caixa pequena |

### Atributos de feature especial

| Atributo | Tipo | Resultado |
|----------|:---:|---|
| `ornato_passafio: true` | bool | Gera furo passa-fio na peça (35mm passante) |
| `ornato_passafio_diametro: 60` | number | Diâmetro do passa-fio (35, 60 ou 80) |
| `ornato_passafio_x: 200, _y: 100` | number | Posição do furo (mm do canto) |
| `ornato_passafio_2: true` | bool | Segundo passa-fio na mesma peça |
| `ornato_led: true` | bool | Gera canal de LED |
| `ornato_led_face: "front"` | string | Face do canal: `front`, `top`, `bottom` |
| `ornato_led_width: 12` | number | Largura do canal (8 ou 12mm) |
| `ornato_led_depth: 8` | number | Profundidade |
| `ornato_led_offset: 20` | number | Distância da borda |

### Atributos de dobradiça (override)

| Atributo | Tipo | Exemplo |
|----------|:---:|---|
| `dobradica_marca` | string | `"Blum"`, `"Hettich"`, `"FGV"`, `"Hafele"`, `"Grass"` |
| `dobradica_modelo` | string | `"clip_top_blumotion"`, `"sensys"`, `"mepla"` |
| `dobradica_angulo` | number | `95`, `110`, `155`, `170` |
| `n_dobradicas` | number | Override da contagem automática (2/3/4) |

### Atributos de gaveta

| Atributo | Tipo | Exemplo |
|----------|:---:|---|
| `corredica_marca` | string | `"Blum"`, `"Hettich"`, `"FGV"` |
| `corredica_modelo` | string | `"tandem_500"`, `"actro_5d"` |
| `corredica_extensao` | string | `"telescopica"`, `"total"` |
| `corredica_carga` | number | `30`, `50`, `70` (kg) |

---

## 6. 🛠️ RECEITA: Modelar uma DOBRADIÇA

> **O que você quer:** porta com 2 ou 3 dobradiças automáticas, copa 35mm na porta + base na lateral.

### Passo a passo

1. **Modele a porta** como grupo retangular (ex: 700 × 380 × 18mm).
2. **Renomeie** o grupo: `POR_ESQ` (se dobradiça à esquerda) ou `POR_DIR`.
3. **Posicione a porta** sobreposta à frente da lateral correspondente:
   - Se `POR_ESQ`: porta encostada na face frontal de `LAT_ESQ`
   - Espessura da porta totalmente à frente da face da lateral
4. **Garanta sobreposição**: a porta deve cobrir pelo menos 100×100mm da face da lateral.
5. **Aplique atributos** no grupo da porta:
   ```ruby
   por_grupo.set_attribute('Ornato', 'tipo', 'peca')
   por_grupo.set_attribute('Ornato', 'role', 'door_left')
   por_grupo.set_attribute('Ornato', 'material', 'MDF_18_BRANCO_TX')
   por_grupo.set_attribute('Ornato', 'espessura', 18)
   ```
6. **(opcional) Override de marca/modelo**:
   ```ruby
   por_grupo.set_attribute('Ornato', 'dobradica_marca', 'Blum')
   por_grupo.set_attribute('Ornato', 'dobradica_modelo', 'clip_top_blumotion')
   ```

### O que o plugin gera automaticamente

- **Na porta** (face top, em coordenadas locais): `f_35mm_dob` (Ø35, prof 11-13mm) — copa
  - Posição: 100mm do topo + 100mm do baixo (porta até 1200mm = 2 copas)
  - Posição Y: 22.5mm da borda lateral da porta
- **Na lateral** (face frontal): `f_dob_base` (Ø4, prof 11mm, 2-3 furos por dobradiça) — base/calço
  - Mesma altura das copas da porta (alinhamento automático)

### Quantas dobradiças?

| Altura da porta | Quantidade automática |
|-----------------|:---:|
| até 1200mm | 2 |
| 1200–2000mm | 3 |
| 2000mm+ | 4 |

Override com `n_dobradicas`.

### Checklist

- [ ] Porta é grupo retangular nomeado `POR_ESQ` ou `POR_DIR`
- [ ] Porta sobreposta à face frontal da lateral (sem gap)
- [ ] Atributos `tipo=peca`, `role=door_left/right`, `material`, `espessura` setados
- [ ] Sobreposição mínima de 100×100mm com a lateral
- [ ] Plugin detectou junção `OVERLAY` (ver no painel Validação após Analisar)

---

## 7. 🔩 RECEITA: Modelar MINIFIX

> **O que você quer:** caixa do móvel montada com minifixes (corpo na chapa horizontal + parafuso na lateral).

### Passo a passo

1. **Modele LAT_ESQ, LAT_DIR** (chapas verticais 18mm) e **BASE, TOPO** (chapas horizontais 18mm).
2. **Posicione** com a base/topo encostando nas laterais — **gap zero**, não recuar:
   ```
   LAT_ESQ              LAT_DIR
     │                    │
     │  ┌──────────────┐  │
     │  │     TOPO     │  │  ← topo encostado nas duas laterais
     │  └──────────────┘  │
     │                    │
     │  ┌──────────────┐  │
     │  │     BASE     │  │  ← base idem
     │  └──────────────┘  │
   ```
3. **Aplique atributos** em todas:
   ```ruby
   lat_esq.set_attribute('Ornato', 'role', 'lateral_esq')
   lat_dir.set_attribute('Ornato', 'role', 'lateral_dir')
   base.set_attribute('Ornato', 'role', 'base')
   topo.set_attribute('Ornato', 'role', 'top')
   ```

### O que o plugin gera automaticamente

- **Em BASE e TOPO** (face top/bottom respectivamente): `f_15mm_minifix` (Ø15, prof 12mm) — corpo do tambor
  - Posição: 50mm da borda + 300mm intermediários
- **Em LAT_ESQ e LAT_DIR** (face edge): `p_8mm_eixo_minifix` (Ø8, passante 34mm) — parafuso
  - Alinhado com o corpo

### Espaçamento padrão

| Comprimento da peça | Quantidade de minifixes |
|---------------------|:---:|
| até 350mm | 2 (apenas nas extremidades) |
| 350–650mm | 3 |
| 650–950mm | 4 |
| 950+mm | 4 + a cada 300mm |

Override com `espac_minifix` no atributo da peça (default 300mm).

### Querer CONFIRMAT em vez de MINIFIX?

```ruby
modulo.set_attribute('Ornato', 'force_joint_type', 'confirmat')
# ou em peça específica:
lat_esq.set_attribute('Ornato', 'force_joint_type', 'confirmat')
```

Resultado: `p_5mm_confirmat` (45mm) na borda da lateral + `f_8mm_confirmat` (passante) na face do topo/base.

### Checklist

- [ ] Peças encostadas (gap zero — tolerância 1mm)
- [ ] Roles corretos (`lateral_esq`, `lateral_dir`, `base`, `top`)
- [ ] Plugin detectou junção `BUTT`
- [ ] Visualizado o preview de furação (Tab Usinagens → Furação)

---

## 8. 🪵 RECEITA: Modelar CAVILHA (em divisor ou prateleira fixa)

> **O que você quer:** divisor vertical ou prateleira fixa apenas com cavilhas (sem minifix).

### Passo a passo

1. **Modele a prateleira ou divisor** como peça retangular 18mm.
2. **Renomeie** com role apropriado:
   - `PRA` para prateleira fixa
   - `DIV_V` para divisor vertical
   - `DIV_H` para divisor horizontal
   - `SUP` para suporte/reforço
3. **Encoste** nas peças adjacentes (gap zero).
4. **Aplique atributos**:
   ```ruby
   pra.set_attribute('Ornato', 'role', 'shelf_fixed')
   ```

### O que o plugin gera

- **Em PRA** (faces edge esq/dir): `f_8mm_cavilha` (Ø8, prof 11mm)
- **Nas LATERAIS** (face frontal interna, alinhada): `f_8mm_cavilha` (Ø8, prof 11mm)

### Quantas cavilhas?

Padrão: **2 cavilhas por extremidade** (4 total numa prateleira de 600mm).
Posição: 50mm de cada borda lateral.

Override com `n_cavilhas` no atributo da peça.

### Querendo prateleira REGULÁVEL em vez de fixa?

Use `PRA_REG`. O plugin **não gera furo direto na prateleira**. Em vez disso, gera **System32** nas laterais/divisores. Ver receita 10.

### Checklist

- [ ] Peça encostada nas laterais (gap zero)
- [ ] Role `shelf_fixed` ou `divider_v/h`
- [ ] Plugin detectou junção `BUTT` com classificação "cavilha simples"

---

## 9. 🔳 RECEITA: Modelar RASGO DE FUNDO

> **O que você quer:** painel traseiro 3-6mm encaixado em rasgo nas laterais, topo e base.

### Passo a passo

1. **Modele o fundo** como peça fina (espessura 3, 6 ou 9mm).
2. **Renomeie** o grupo: `FUN`.
3. **Posicione com OFFSET de ~8mm** da borda traseira das laterais/topo/base:
   ```
       ┌──────────────────────────┐
       │                          │
       │   ┌──────────────────┐   │
       │   │       FUN        │   │ ← recuado 8mm da borda
       │   │   (3mm de esp.)  │   │
       │   └──────────────────┘   │
       │                          │
       └──────────────────────────┘
                              ↑
                              borda traseira da lateral
   ```
4. **Aplique atributos**:
   ```ruby
   fun.set_attribute('Ornato', 'role', 'back_panel')
   fun.set_attribute('Ornato', 'espessura', 3)
   fun.set_attribute('Ornato', 'material', 'MDF_3_BRANCO')
   ```

### O que o plugin gera

- **Em LAT_ESQ, LAT_DIR, TOPO, BASE** (face top — virada pra dentro do móvel): `r_f` (rasgo de 3.2mm × 8mm prof, com offset de 8mm da borda)
- **Em DIV_V** se houver: idem.

> Largura do rasgo = espessura do fundo + 0.2mm de folga.
> Profundidade = 8mm (configurável).

### Override de espessura do fundo

```ruby
modulo.set_attribute('Ornato', 'back_panel_thickness', 6)  # 6mm em vez de 3mm
```

Plugin gera `r_f_6` automaticamente.

### Variante: fundo PARAFUSADO (sem rasgo)

Se preferir parafusar o fundo por trás (sem rasgo):

```ruby
fun.set_attribute('Ornato', 'role', 'back_panel_screwed')
# ou
fun.set_attribute('Ornato', 'skip_machining', true)
```

Plugin não gera rasgos, e gera furos `f_3mm_piloto` no perímetro do fundo + `f_3mm` nas laterais correspondentes.

### Checklist

- [ ] Fundo recuado ~8mm da borda traseira (pra plugin classificar como DADO, não BUTT)
- [ ] Espessura do fundo correta (3, 6 ou 9mm)
- [ ] Atributo `role=back_panel` setado
- [ ] Visualizado rasgo no preview (deve aparecer 4 rasgos: 2 laterais + 1 topo + 1 base)

---

## 10. 🪛 RECEITA: Modelar SYSTEM32 (prateleira regulável)

> **O que você quer:** linha de furos 5mm (espaçados a 32mm) nas laterais para apoiar pinos de prateleira regulável.

### Passo a passo

1. **Modele a prateleira regulável** como peça normal (18mm).
2. **Renomeie** o grupo: `PRA_REG`.
3. **Posicione livremente dentro do módulo** — o plugin **não usa** a posição da prateleira, só a presença dela como sinal.
4. **Aplique atributos**:
   ```ruby
   pra_reg.set_attribute('Ornato', 'role', 'shelf_adjustable')
   pra_reg.set_attribute('Ornato', 'skip_machining', true)  # prateleira não recebe furo
   ```

### O que o plugin gera

- **Em LAT_ESQ, LAT_DIR, DIV_V** (face top/frontal): `f_5mm_s32` em série
  - Espaçamento entre furos: **32mm** (padrão System32)
  - Distância da borda: 37mm
  - Diâmetro: 5mm, profundidade: 11mm
  - Linha única se largura do módulo < 300mm; **dupla** se > 300mm
  - Início: 64mm da borda inferior; fim: 64mm da borda superior

### Por que System32 dispensa cavilha?

Porque a prateleira é apoiada em pinos removíveis nos furos 5mm. Não há furo na prateleira (ela só "pousa").

### Override de range

```ruby
modulo.set_attribute('Ornato', 's32_inicio', 100)  # começa 100mm da base
modulo.set_attribute('Ornato', 's32_fim', 100)     # termina 100mm do topo
modulo.set_attribute('Ornato', 's32_passo', 64)    # espaçamento alternativo (raríssimo)
```

### Checklist

- [ ] Prateleira nomeada `PRA_REG` com `skip_machining=true`
- [ ] Furos System32 aparecem nas laterais (preview Usinagens)
- [ ] Linha dupla se módulo > 300mm de profundidade

---

## 11. 📦 RECEITA: Modelar GAVETA com corrediça

> **O que você quer:** gaveta com frente, 2 laterais, traseira e fundo, com furação automática para corrediça telescópica.

### Estrutura mínima

```
ORN_BAL_GAV (módulo)
  ├── LAT_ESQ      ← lateral esq do módulo
  ├── LAT_DIR
  ├── BASE
  ├── TOPO
  ├── FUN
  └── (gaveta — opcionalmente como submódulo)
        ├── GAV_FR      ← frente da gaveta
        ├── GAV_LAT_E   ← lateral esquerda da gaveta (use GAV_LAT)
        ├── GAV_LAT_D   ← lateral direita
        ├── GAV_TRA     ← traseira
        └── GAV_FUN     ← fundo da gaveta (espessura 6mm)
```

### Passo a passo

1. **Modele a frente da gaveta** (`GAV_FR`) sobreposta à frente do módulo (igual uma porta, mas só na altura da gaveta).
2. **Modele as 2 laterais** (`GAV_LAT`) atrás da frente, paralelas às laterais do módulo, com folga ~12.5mm de cada lado (espaço da corrediça).
3. **Modele a traseira** (`GAV_TRA`) entre as laterais.
4. **Modele o fundo** (`GAV_FUN`) recuado das laterais (offset 8mm pra plugin gerar rasgo).
5. **Aplique atributos** em cada peça:
   ```ruby
   gav_fr.set_attribute('Ornato', 'role', 'drawer_front')
   gav_lat_e.set_attribute('Ornato', 'role', 'drawer_side_left')
   gav_lat_d.set_attribute('Ornato', 'role', 'drawer_side_right')
   gav_tra.set_attribute('Ornato', 'role', 'drawer_back')
   gav_fun.set_attribute('Ornato', 'role', 'drawer_bottom')
   gav_fun.set_attribute('Ornato', 'espessura', 6)
   ```
6. **(opcional) Override de marca de corrediça**:
   ```ruby
   modulo.set_attribute('Ornato', 'corredica_marca', 'Blum')
   modulo.set_attribute('Ornato', 'corredica_modelo', 'tandem_500')
   modulo.set_attribute('Ornato', 'corredica_extensao', 'total')
   ```

### O que o plugin gera

- **Na frente da gaveta**: `f_puxador` (passante) — posição central ou conforme atributo
- **Nas laterais da gaveta** (face top): `f_8mm_cavilha` para encaixe com frente e traseira
- **Na lateral do MÓDULO** (face interna frontal): `f_corr` (4-5 furos para corrediça telescópica) — alinhada com a altura da gaveta
- **Nas laterais da gaveta** (face bottom): `r_f` (rasgo 6.2mm × 8mm prof) para encaixe do fundo
- **Furo de puxador**: posição depende do atributo `puxador_modelo`

### Quantas gavetas?

Cada gaveta é um conjunto. Para um gaveteiro de 4 gavetas, modele os 4 conjuntos completos. O plugin trata cada um independentemente.

### Checklist

- [ ] Frente sobreposta à frente do módulo (OVERLAY)
- [ ] Laterais com folga 12.5mm de cada lado (espaço pra corrediça)
- [ ] Fundo recuado 8mm das laterais (DADO)
- [ ] Roles corretos em cada peça
- [ ] `f_corr` aparece nas laterais do módulo (preview)

---

## 12. 🚪 RECEITA: PORTA com puxador

> **O que você quer:** porta normal (já vimos dobradiça na receita 6) + furo de puxador automático.

### Passo a passo

1. Após modelar a porta (receita 6), **adicione atributo de puxador**:
   ```ruby
   por.set_attribute('Ornato', 'puxador_modelo', 'cava_black_128')
   por.set_attribute('Ornato', 'puxador_pos_x', 30)   # 30mm da borda
   por.set_attribute('Ornato', 'puxador_pos_y', 'centro')  # centro vertical
   ```

### O que o plugin gera

- **Na porta** (face frontal): `f_puxador` passante. Diâmetro depende do modelo:
  - `cava_black_128` → 2 furos Ø5mm a 128mm de centro
  - `botao_metalico` → 1 furo Ø4mm
  - `alca_embutida_320` → 2 furos Ø5mm a 320mm
  - Etc.

### Sem puxador (push-to-open)

```ruby
por.set_attribute('Ornato', 'puxador_modelo', 'sem_puxador')
por.set_attribute('Ornato', 'dobradica_modelo', 'push_to_open')
```

Plugin não gera furo de puxador. Dobradiça muda para a variante push-to-open.

### Checklist

- [ ] Atributo `puxador_modelo` setado
- [ ] Furo aparece no preview na posição correta
- [ ] Diâmetro/quantidade compatível com o modelo

---

## 13. 🚪 RECEITA: TRILHO DE PORTA DE CORRER

> **O que você quer:** porta de correr com canal no topo e base do módulo.

### Passo a passo

1. **Modele a porta** como retângulo 18mm.
2. **Renomeie** o grupo: `POR_COR`.
3. **Posicione** sobreposta à frente do módulo (igual porta normal).
4. **Aplique atributos**:
   ```ruby
   por.set_attribute('Ornato', 'role', 'door_sliding')
   ```

### O que o plugin gera

- **No TOPO do módulo** (face bottom — virada pra dentro): `r_trilho_sup` (canal 5mm × 8mm de prof)
- **Na BASE do módulo** (face top): `r_trilho_inf` (canal 5mm × 5mm de prof)
- **Na porta**: NENHUM furo (porta corre no trilho, não tem dobradiça nem puxador padrão)

### Múltiplas portas de correr

Modele 2 portas `POR_COR` lado a lado, com sobreposição central de ~30mm. Plugin gera trilhos paralelos.

### Checklist

- [ ] Role `door_sliding` setado
- [ ] Trilhos aparecem no topo e base no preview
- [ ] Sem furação de dobradiça

---

## 14. 💡 RECEITA: PASSA-FIO E LED

### Passa-fio

> **Furo passante para passar cabos elétricos.**

```ruby
peca.set_attribute('Ornato', 'ornato_passafio', true)
peca.set_attribute('Ornato', 'ornato_passafio_diametro', 60)  # 35, 60 ou 80
peca.set_attribute('Ornato', 'ornato_passafio_x', 200)        # mm do canto
peca.set_attribute('Ornato', 'ornato_passafio_y', 100)
```

Multi-furos:
```ruby
peca.set_attribute('Ornato', 'ornato_passafio_2', true)
peca.set_attribute('Ornato', 'ornato_passafio_2_x', 500)
peca.set_attribute('Ornato', 'ornato_passafio_2_y', 100)
```

Plugin gera `f_60mm_passafio` (passante) na posição configurada.

### Canal de LED

> **Fresagem para fita LED embutida.**

```ruby
peca.set_attribute('Ornato', 'ornato_led', true)
peca.set_attribute('Ornato', 'ornato_led_face', 'front')  # front, top, bottom
peca.set_attribute('Ornato', 'ornato_led_width', 12)       # 8 ou 12mm
peca.set_attribute('Ornato', 'ornato_led_depth', 8)
peca.set_attribute('Ornato', 'ornato_led_offset', 20)      # mm da borda
```

Plugin gera `r_led` (canal contínuo) ao longo da face configurada.

---

## 15. 📐 Sistema de coordenadas (importante saber)

### Mundo SketchUp vs CNC

```
MUNDO (SketchUp 3D)              PEÇA (CNC 2D)

  Y ↑                             comprimento →
    │   Z                         ┌─────────────────┐
    │  /                          │                 │
    │/                            │  (0,0)          │ largura ↓
    └──────→ X                    │   ●             │
                                  └─────────────────┘
```

O plugin transforma automaticamente. Para cada peça:

1. Pega bounding box.
2. Define **canto de referência** (min XYZ).
3. Identifica **espessura** = menor dimensão.
4. Projeta coordenadas pra 2D na face de trabalho.
5. Gera furos com `position_x, position_y, depth, quadrant`.

### Os 6 quadrantes (faces)

```
              REAR
            ┌────────┐
           /        /│
         /  TOP    /  │
       ┌────────┐    │
       │        │    │ ← RIGHT
LEFT → │ FRONT  │    │
       │        │   /
       └────────┘  /
          BOTTOM
```

| Face | Onde aparece a furação |
|------|------------------------|
| `top` / `bottom` | Furos verticais na chapa horizontal (minifix corpo, copa de dobradiça, System32) |
| `left` / `right` / `front` / `rear` | Furos horizontais nas bordas (eixo minifix, cavilha lateral) |

---

## 16. 🚧 Pegadinhas comuns (e como evitar)

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| Plugin não detecta a peça | Peça solta fora do `ORN_xxx` | Mover pra dentro do grupo do módulo |
| Plugin diz "junção desconhecida" | Peça com geometria não-retangular | Refazer como retângulo simples 6 faces |
| Minifix não aparece | Gap entre peças > 1mm | Encostar com tolerância zero |
| Rasgo de fundo não aparece | Fundo encostado (não recuado) | Recuar 8mm da borda traseira |
| 2 minifixes em vez de 4 | Comprimento da peça < 350mm OU `espac_minifix` muito alto | Verificar dimensões e atributo |
| Dobradiça gerou em lugar errado | `role` errado (`door_left` em vez de `door_right`) | Verificar role |
| Peça aparece duplicada na lista | Componente com múltiplas instâncias | Plugin trata cada instância — verifique se realmente quer 2 |
| Espessura detectada errada | Peça muito pequena (menor dimensão < 3mm) | Mínimo é 3mm — peças de borda virada são auxiliares |
| Plugin trava em modelos grandes | >200 peças sem otimização | Quebrar em ambientes separados |

---

## 17. 🧪 Como TESTAR antes de salvar na galeria

### Workflow no SketchUp com plugin Ornato

1. **Modele o módulo** seguindo as receitas acima.
2. **Aplique atributos** em todas as peças.
3. **Abra o plugin** (Window → Ornato Plugin).
4. **Tab Validação** → clica "Validar projeto".
5. Plugin lista:
   - ✅ Peças detectadas
   - ✅ Junções classificadas
   - ⚠️ Avisos (peça sem material, sobreposição inválida, etc.)
   - ❌ Erros (peça órfã, junção impossível)
6. **Tab Usinagens** → "Visualizar furação". Plugin gera ghost de furos no modelo 3D.
7. **Confira visualmente:**
   - Minifixes na quantidade certa?
   - Cavilhas alinhadas?
   - Rasgo de fundo na profundidade certa?
   - Copa de dobradiça na posição correta?
8. **Tab Produção** → "Exportar UPM JSON" → arquivo gerado em `~/Downloads/orn_xxx.json`.
9. Abrir JSON, verificar:
   - Cada peça tem `id`, `role`, `material`, `dimensions`, `edges`, `position`
   - Array `machining` tem todas as operações esperadas
10. Se tudo OK → salvar como template em `ornato-plugin/biblioteca/moveis/[categoria]/[nome].json`

### Checklist final pré-galeria

- [ ] Módulo nomeado com `ORN_xxx` correto
- [ ] Todas as peças nomeadas com role correto
- [ ] Atributos do dicionário `Ornato` aplicados em todas peças
- [ ] Materiais e bordas atribuídos
- [ ] Plugin não emite erros na Validação
- [ ] Furação visualizada bate com expectativa
- [ ] Custos estimados batem com projetos similares (sanidade)
- [ ] Module foi testado em 2 dimensões diferentes (paramétrico, ver seção 18)
- [ ] JSON exportado tem 100% dos campos preenchidos

---

## 18. 🧮 Componentes paramétricos (avançado)

Para módulos da galeria, o ideal é serem **paramétricos** — usuário define largura/altura/profundidade e plugin recalcula peças.

### Estrutura mínima de um JSON paramétrico

```json
{
  "id": "balcao_2_portas",
  "nome": "Balcão 2 portas",
  "categoria": "cozinha",
  "parametros": {
    "L": { "default": 800, "min": 400, "max": 1200, "step": 50 },
    "A": { "default": 720, "min": 600, "max": 900, "step": 10 },
    "P": { "default": 560, "min": 350, "max": 650, "step": 10 }
  },
  "materiais": {
    "caixa": "MDF_18_BRANCO_TX",
    "frente": "MDF_18_BRANCO_TX",
    "fundo": "MDF_3_BRANCO"
  },
  "pecas": [
    {
      "role": "lateral_esq",
      "label": "Lateral esquerda",
      "material": "{caixa}",
      "espessura": 18,
      "dimensoes": { "L": "{P}", "A": "{A}-18", "esp": 18 },
      "posicao": { "x": 0, "y": 0, "z": 18 }
    },
    {
      "role": "base",
      "material": "{caixa}",
      "espessura": 18,
      "dimensoes": { "L": "{L}-36", "A": "{P}", "esp": 18 },
      "posicao": { "x": 18, "y": 0, "z": 0 }
    }
    // ... outras peças
  ],
  "ferragens_auto": [
    { "tipo": "dobradica", "marca": "Blum", "modelo": "clip_top_blumotion" },
    { "tipo": "puxador", "modelo": "cava_black_128" }
  ]
}
```

> Expressões `{L}`, `{A}-18` etc são avaliadas pelo `JsonModuleBuilder` em tempo de inserção.
> Mais detalhes em `docs/12_COMPONENTES_DINAMICOS.md`.

---

## 19. 📚 Referência cruzada

| Documento | Quando consultar |
|-----------|------------------|
| `docs/01_VISAO_GERAL.md` | Visão de alto nível do plugin |
| `docs/02_HIERARQUIA_MODELO.md` | Aprofundamento na estrutura |
| `docs/03_NOMENCLATURA.md` | Tabela completa de códigos |
| `docs/04_SISTEMA_COLISAO.md` | Como o plugin detecta junções |
| `docs/05_MATRIZ_USINAGENS.md` | Tabela completa de regras |
| `docs/06_CATALOGO_FERRAMENTAS.md` | Códigos de ferramentas CNC |
| `docs/07_CONFIGURACAO_REGRAS.md` | Como customizar regras |
| `docs/08_MATERIAIS_BORDAS.md` | Códigos de materiais e fitas |
| `docs/09_EXPORTACAO_JSON.md` | Schema do UPM JSON |
| `docs/10_EXEMPLOS_PRATICOS.md` | Exemplos resolvidos |
| `docs/12_COMPONENTES_DINAMICOS.md` | Sistema paramétrico avançado |
| `BRIEF_DEVS_TROCA_ICONES.md` | (não relacionado) Troca de ícones |
| `BRIEF_ICONES_DESIGNERS.md` | (não relacionado) Conceito visual |

---

## 20. ⏱️ Próximos passos

1. **Leitura obrigatória** dessa cartilha (1h).
2. **Tutorial mão-na-massa**: modelar 1 balcão simples seguindo a receita completa, exportar JSON, validar (2h).
3. **Selecionar 30 módulos prioritários** da galeria (categorias e tamanhos):
   - 12 cozinha (balcão simples, com pia, com cooktop, gaveteiro, aéreos, torres)
   - 8 dormitório (armário 2/3/4 portas, gaveteiro, sapateira)
   - 5 banheiro (gabinete, espelheira)
   - 5 escritório / diversos
4. **Modelar 1 a 2 por dia**: cada um deve passar checklist seção 17.
5. **Sprint inicial**: 30 módulos em 3 semanas.

---

*Documento criado em mai/2026. Versão 1.0. Atualizar quando: novos códigos de peça forem adicionados / novas ferragens entrarem no catálogo / matriz de regras mudar.*
