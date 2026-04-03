# Exemplos Praticos

## Exemplo 1 — Balcao de cozinha com 2 portas

### Passo 1: Criar o modulo

No SketchUp, crie um grupo e nomeie como:

```
ORN_BAL Cozinha 80cm
```

O plugin reconhece `ORN_BAL` como balcao de cozinha.

### Passo 2: Modelar as pecas

Dentro do grupo `ORN_BAL`, crie as pecas como grupos ou componentes:

```
ORN_BAL Cozinha 80cm
  ├── LAT_ESQ          (18mm x 720mm x 560mm)
  ├── LAT_DIR          (18mm x 720mm x 560mm)
  ├── BASE             (764mm x 560mm x 18mm)
  ├── TOPO             (764mm x 560mm x 18mm)
  ├── FUN              (714mm x 534mm x 3mm)
  ├── POR_ESQ          (358mm x 717mm x 18mm)
  └── POR_DIR          (358mm x 717mm x 18mm)
```

**Importante**: posicione as pecas de forma que se toquem onde havera juncao.

### Passo 3: Colisoes detectadas

O plugin analisa as 21 combinacoes de pares (7 pecas = 7x6/2) e encontra:

| Par | Tipo juncao | Usinagens |
|-----|-------------|-----------|
| LAT_ESQ ↔ BASE | butt | Minifix + cavilha |
| LAT_ESQ ↔ TOPO | butt | Minifix + cavilha |
| LAT_DIR ↔ BASE | butt | Minifix + cavilha |
| LAT_DIR ↔ TOPO | butt | Minifix + cavilha |
| LAT_ESQ ↔ FUN | dado | Rasgo de fundo na lateral |
| LAT_DIR ↔ FUN | dado | Rasgo de fundo na lateral |
| TOPO ↔ FUN | dado | Rasgo de fundo no topo |
| BASE ↔ FUN | dado | Rasgo de fundo na base |
| POR_ESQ ↔ LAT_ESQ | overlay | Dobradica (copa + calco) |
| POR_DIR ↔ LAT_DIR | overlay | Dobradica (copa + calco) |

Colisoes ignoradas (sem usinagem):
- POR_ESQ ↔ POR_DIR (nao se tocam ou toque sem relevancia)
- POR ↔ TOPO/BASE (overlay sem regra definida — porta nao se conecta ao topo)

### Passo 4: Usinagens geradas por papel

| Peca | Usinagem | Motivo |
|------|----------|--------|
| POR_ESQ | f_puxador (passante) | Toda porta recebe furo de puxador |
| POR_DIR | f_puxador (passante) | Idem |

### Passo 5: Resultado — Usinagens por peca

**LAT_ESQ** (lateral esquerda):
```
Face TOP:
  - f_15mm_minifix (x=50, y=280) — juncao com BASE
  - f_8mm_cavilha (x=82, y=280) — juncao com BASE
  - f_15mm_minifix (x=714, y=280) — juncao com BASE (outro extremo)
  - r_f rasgo 3.2mm (y=534, x=0→720) — encaixe do FUN

Face BOTTOM:
  - f_15mm_minifix (x=50, y=280) — juncao com TOPO
  - f_8mm_cavilha (x=82, y=280) — juncao com TOPO
  - f_15mm_minifix (x=714, y=280) — juncao com TOPO (outro extremo)

Face (interna):
  - f_dob_base (2 furos 4mm, prof 11mm) — calco da dobradica POR_ESQ
```

**POR_ESQ** (porta esquerda):
```
Face TOP:
  - f_35mm_dob (x=100, y=22.5, prof=11mm) — copa dobradica superior
  - f_35mm_dob (x=617, y=22.5, prof=11mm) — copa dobradica inferior
  - f_puxador (x=configuravel, y=40mm da borda) — furo de puxador
```

**BASE**:
```
Face TOP:
  - f_15mm_minifix (x=50, y=280) — juncao com LAT_ESQ
  - f_8mm_cavilha (x=82, y=280) — juncao com LAT_ESQ
  - f_15mm_minifix (x=714, y=280) — juncao com LAT_DIR
  - f_8mm_cavilha (x=682, y=280) — juncao com LAT_DIR
  - r_f rasgo 3.2mm (y=534, x=0→764) — encaixe do FUN
```

---

## Exemplo 2 — Armario com prateleiras regulaveis

### Modelo

```
ORN_ARM Quarto
  ├── LAT_ESQ          (18mm x 2100mm x 500mm)
  ├── LAT_DIR          (18mm x 2100mm x 500mm)
  ├── BASE             (764mm x 500mm x 18mm)
  ├── TOPO             (764mm x 500mm x 18mm)
  ├── FUN              (714mm x 2064mm x 3mm)
  ├── PRA_REG          (762mm x 480mm x 18mm) — nao encosta na lateral
  ├── PRA_REG#1        (762mm x 480mm x 18mm)
  └── POR              (397mm x 2097mm x 18mm)
```

### Comportamento especial: PRA_REG

A prateleira regulavel (`PRA_REG`) **nao gera usinagem por colisao** com as laterais. Em vez disso, sua mera **presenca no modulo** dispara a geracao de furos System32 nas laterais:

```
LAT_ESQ recebe:
  - f_5mm_s32 serie de furos System32
    Y = 37mm da borda frontal
    X = de 64mm ate 2036mm, a cada 32mm
    Diametro: 5mm, profundidade: 11mm
    Total: ~62 furos por linha

LAT_DIR recebe:
  - f_5mm_s32 serie identica (espelhada)
```

Se a largura da lateral for > 300mm, uma segunda linha de furos e adicionada:
```
  Segunda linha Y = largura - 37mm = 463mm
```

### Colisoes ignoradas

| Par | Motivo |
|-----|--------|
| PRA_REG ↔ LAT_ESQ | Prateleira regulavel — apoiada em pinos, sem furacao direta |
| PRA_REG ↔ LAT_DIR | Idem |

---

## Exemplo 3 — Balcao gaveteiro

### Modelo

```
ORN_BAL_GAV 4 gavetas
  ├── LAT_ESQ          (18mm x 720mm x 560mm)
  ├── LAT_DIR          (18mm x 720mm x 560mm)
  ├── BASE             (764mm x 560mm x 18mm)
  ├── TOPO             (764mm x 560mm x 18mm)
  ├── FUN              (714mm x 534mm x 3mm)
  ├── DIV_H            (764mm x 560mm x 18mm) — divisor entre gavetas
  ├── GAV_FR           (758mm x 170mm x 18mm) — frente da gaveta
  ├── GAV_LAT          (500mm x 120mm x 15mm) — lateral da gaveta
  ├── GAV_LAT#1        (500mm x 120mm x 15mm)
  ├── GAV_TRA          (720mm x 120mm x 15mm) — traseira da gaveta
  └── GAV_FUN          (720mm x 498mm x 3mm) — fundo da gaveta
```

### Colisoes especiais de gaveta

As pecas da gaveta (`GAV_*`) **nao geram usinagem com as laterais do movel** porque a corrediça faz a conexao:

| Par | Usinagem | Motivo |
|-----|----------|--------|
| GAV_FR ↔ LAT_ESQ | IGNORADA | Corrediça faz a conexao |
| GAV_FR ↔ LAT_DIR | IGNORADA | Idem |
| GAV_LAT ↔ LAT_ESQ | IGNORADA | Idem |
| GAV_LAT ↔ LAT_DIR | IGNORADA | Idem |

Juncoes **dentro da gaveta** (entre pecas GAV_*):

| Par | Tipo | Usinagem |
|-----|------|----------|
| GAV_LAT ↔ GAV_FR | butt | Cavilha (gaveta usa so cavilha, sem minifix) |
| GAV_LAT ↔ GAV_TRA | butt | Cavilha |
| GAV_LAT ↔ GAV_FUN | dado | Rasgo de fundo na lateral da gaveta |

### Usinagem por papel

| Peca | Usinagem | Motivo |
|------|----------|--------|
| GAV_FR | f_puxador (passante) | Frente de gaveta recebe puxador |

---

## Exemplo 4 — Armario com porta de correr

### Modelo

```
ORN_ARM_COR 2 folhas
  ├── LAT_ESQ          (18mm x 2100mm x 600mm)
  ├── LAT_DIR          (18mm x 2100mm x 600mm)
  ├── BASE             (1164mm x 600mm x 18mm)
  ├── TOPO             (1164mm x 600mm x 18mm)
  ├── FUN              (1114mm x 2064mm x 3mm)
  ├── POR_COR          (598mm x 2090mm x 18mm) — porta de correr
  └── POR_COR#1        (598mm x 2090mm x 18mm)
```

### Comportamento: POR_COR

A porta de correr (`POR_COR`) **nao recebe copa de dobradica**. Em vez disso, gera canais de trilho:

```
TOPO recebe:
  - r_trilho_sup (canal 3-5mm x 8mm, face bottom)
    Para trilho superior da porta de correr

BASE recebe:
  - r_trilho_inf (canal 3-5mm x 5mm, face top)
    Para trilho inferior da porta de correr
```

A POR_COR tambem **nao recebe furo de puxador padrao** — geralmente usa puxador embutido (usinagem meia-lua ou perfil de aluminio), configuravel via override.

---

## Exemplo 5 — Nicho simples (sem portas)

### Modelo

```
ORN_NIC Decorativo
  ├── LAT_ESQ          (18mm x 400mm x 300mm)
  ├── LAT_DIR          (18mm x 400mm x 300mm)
  ├── TOPO             (364mm x 300mm x 18mm)
  ├── BASE             (364mm x 300mm x 18mm)
  └── FUN              (362mm x 362mm x 3mm)
```

### Resultado simplificado

Todas as juncoes sao padrao (butt lateral ↔ topo/base + dado para fundo):

- 4 juncoes butt → minifix + cavilha em cada
- 4 rasgos de fundo (2 laterais + topo + base)
- Total: ~16 furos + 4 rasgos

---

## Exemplo 6 — Override para usar confirmat

Se o usuario quer usar confirmat em vez de minifix num modulo especifico:

### Via atributo no modulo

```ruby
grupo.set_attribute('ornato', 'joint_type', 'confirmat')
```

### Resultado

Todas as juncoes butt deste modulo passam a gerar:

```
Em vez de:
  f_15mm_minifix (face, 13mm) + f_8mm_eixo_minifix (edge, 34mm)

Gera:
  f_8mm_confirmat (face, passante) + f_5mm_confirmat (edge, 45mm)
```

---

## Exemplo 7 — Peca com passa-fio e canal LED

### Via atributo na peca

```ruby
# Adicionar passa-fio na prateleira
peca.set_attribute('ornato', 'passafio', 'true')
peca.set_attribute('ornato', 'passafio_diameter', '60')
peca.set_attribute('ornato', 'passafio_x', '200')
peca.set_attribute('ornato', 'passafio_y', '150')

# Adicionar canal LED
peca.set_attribute('ornato', 'led_channel', 'true')
peca.set_attribute('ornato', 'led_width', '10')
peca.set_attribute('ornato', 'led_depth', '8')
peca.set_attribute('ornato', 'led_position', 'front')
```

### Resultado

```
Prateleira recebe (alem das usinagens de colisao):
  - f_60mm_passafio (passante, x=200, y=150) — furo para cabos
  - r_led (canal 10mm x 8mm, posicao frontal) — canal para fita LED
```

---

## Exemplo 8 — Usando exclusoes para evitar usinagem indesejada

### Problema

O modelo tem um tamponamento (TAM) que encosta na lateral, mas nao deve receber usinagem (colagem externa).

### Solucao

As exclusoes padrao ja cobrem este caso:

```json
{
  "exclusions": [
    { "piece_a": "TAM", "piece_b": "*", "action": "ignore" }
  ]
}
```

Se precisar de exclusao personalizada (ex: suporte que nao deve ter usinagem com o topo):

```json
{
  "exclusions": [
    { "piece_a": "SUP", "piece_b": "TOPO", "action": "ignore" }
  ]
}
```

---

## Checklist de modelagem

Antes de rodar o plugin, verifique:

- [ ] O modulo (grupo pai) tem nome com prefixo `ORN_` valido
- [ ] Cada peca (grupo/componente) dentro do modulo tem nome com prefixo valido (LAT_ESQ, BASE, etc.)
- [ ] As pecas estao posicionadas corretamente (se tocando onde deve haver juncao)
- [ ] As pecas sao retangulares (sem recortes na geometria principal)
- [ ] As pecas estao alinhadas aos eixos (ortogonais, sem rotacao em angulo)
- [ ] A espessura de cada peca e detectavel (uma dimensao claramente menor que as outras)
- [ ] O fundo (FUN) esta posicionado com offset da borda traseira (encaixado, nao rente)
- [ ] Pecas que nao devem receber usinagem tem o atributo `skip_machining = true` ou estao na lista de exclusoes
- [ ] Prateleiras regulaveis estao nomeadas como `PRA_REG` (nao `PRA`)
- [ ] Portas estao nomeadas com o sufixo correto (_ESQ, _DIR, _COR, _BAS)
- [ ] O nesting nao excede 3 niveis de profundidade

## Erros comuns

| Erro | Causa | Solucao |
|------|-------|---------|
| Peca nao reconhecida | Nome sem prefixo valido | Renomear para LAT_ESQ, BASE, etc. |
| Sem usinagem detectada | Pecas nao se tocam (gap > 1mm) | Ajustar posicao para contato direto |
| Usinagem em peca errada | Colisao acidental entre pecas | Afastar pecas ou adicionar exclusao |
| Minifix onde deveria ser cavilha | Papel da peca sugere minifix | Override: `force_joint = cavilha` |
| Rasgo de fundo ausente | Fundo rente a borda (sem offset) | Posicionar fundo com offset de 8mm |
| System32 nao gerado | Prateleira nomeada como PRA (fixa) | Renomear para PRA_REG |
| Dobradica em porta errada | Porta sem sufixo _ESQ/_DIR | Renomear para POR_ESQ ou POR_DIR |
| Muitos furos desnecessarios | Pecas se tocando acidentalmente | Verificar posicionamento ou usar exclusoes |
