# Matriz de Usinagens

## Principio fundamental

> Nem toda colisao gera usinagem. A matriz define exatamente o que acontece quando cada par de pecas se toca.

## Tabela de regras — Estrutura do movel (caixa)

### Juncoes BUTT (borda contra face)

| Peca A | Peca B | Usinagem em A | Usinagem em B | Notas |
|--------|--------|---------------|---------------|-------|
| LAT_ESQ | BASE | f_8mm_eixo_minifix (edge, passante) | f_15mm_minifix (top, 12mm) + f_8mm_cavilha (top, 11mm) | Minifix a cada 300mm. Cavilha entre minifixes. |
| LAT_ESQ | TOPO | f_8mm_eixo_minifix (edge, passante) | f_15mm_minifix (bottom, 12mm) + f_8mm_cavilha (bottom, 11mm) | Idem. |
| LAT_DIR | BASE | f_8mm_eixo_minifix (edge, passante) | f_15mm_minifix (top, 12mm) + f_8mm_cavilha (top, 11mm) | Espelhado. |
| LAT_DIR | TOPO | f_8mm_eixo_minifix (edge, passante) | f_15mm_minifix (bottom, 12mm) + f_8mm_cavilha (bottom, 11mm) | Espelhado. |
| DIV_V | BASE | f_8mm_cavilha (edge) | f_8mm_cavilha (top, 11mm) | Divisor: so cavilha, sem minifix. |
| DIV_V | TOPO | f_8mm_cavilha (edge) | f_8mm_cavilha (bottom, 11mm) | Idem. |
| DIV_H | LAT_ESQ | f_8mm_cavilha (edge) | f_8mm_cavilha (face, 11mm) | Divisor horizontal em lateral. |
| DIV_H | LAT_DIR | f_8mm_cavilha (edge) | f_8mm_cavilha (face, 11mm) | Idem espelhado. |
| PRA | LAT_ESQ | f_8mm_cavilha (edge) | f_8mm_cavilha (face, 11mm) | Prateleira fixa: 2 cavilhas por lado (padrao). |
| PRA | LAT_DIR | f_8mm_cavilha (edge) | f_8mm_cavilha (face, 11mm) | Idem espelhado. |
| PRA | DIV_V | f_8mm_cavilha (edge) | f_8mm_cavilha (face, 11mm) | Prateleira contra divisor. |
| SUP | qualquer | f_8mm_cavilha (edge) | f_8mm_cavilha (face, 11mm) | Suporte/reforco: cavilha simples. |

### Juncoes DADO (borda recuada — offset > 0.5mm)

| Peca A | Peca B | Usinagem em A | Usinagem em B | Notas |
|--------|--------|---------------|---------------|-------|
| LAT_ESQ | FUN | r_f (rasgo de fundo, top, 8mm prof) | — | Rasgo na lateral para encaixar fundo. Largura = espessura do fundo + 0.2mm. |
| LAT_DIR | FUN | r_f (rasgo de fundo, top, 8mm prof) | — | Idem espelhado. |
| TOPO | FUN | r_f (rasgo de fundo, bottom, 8mm prof) | — | Rasgo no topo. |
| BASE | FUN | r_f (rasgo de fundo, top, 8mm prof) | — | Rasgo na base. |
| DIV_V | FUN | r_f (rasgo de fundo, top/bottom, 8mm prof) | — | Rasgo no divisor. |
| GAV_LAT | GAV_FUN | r_f (rasgo gaveta, bottom, 6mm prof) | — | Rasgo na lateral da gaveta para fundo. |

### Juncoes OVERLAY (face contra face)

| Peca A | Peca B | Usinagem em A | Usinagem em B | Notas |
|--------|--------|---------------|---------------|-------|
| POR | LAT_ESQ | f_35mm_dob (top, 11mm) | f_dob_base (face, 11mm, 2-3 furos) | Dobradica: copa na porta, calco na lateral. |
| POR | LAT_DIR | f_35mm_dob (top, 11mm) | f_dob_base (face, 11mm, 2-3 furos) | Idem. |
| POR_ESQ | LAT_ESQ | f_35mm_dob (top, 11mm) | f_dob_base (face, 11mm) | Porta esquerda: dobradica no lado esquerdo. |
| POR_DIR | LAT_DIR | f_35mm_dob (top, 11mm) | f_dob_base (face, 11mm) | Porta direita: dobradica no lado direito. |

### Juncoes MITER (borda contra borda)

| Peca A | Peca B | Usinagem em A | Usinagem em B | Notas |
|--------|--------|---------------|---------------|-------|
| MOL | MOL | usi_chanfro_45 (contorno) | usi_chanfro_45 (contorno) | Chanfro 45 nas duas molduras. Regra: MiterRule. |

### Juncoes OVERLAY especiais

| Peca A | Peca B | Usinagem em A | Usinagem em B | Notas |
|--------|--------|---------------|---------------|-------|
| POR_BAS | LAT | f_pistao (2x O10mm, 12mm prof) | f_pistao (2x O10mm, 12mm prof) | Pistao a gas para porta basculante. Regra: GasPistonRule. |
| POR_COR | TOPO | — | r_trilho_sup (canal 5mm x 8mm) | Canal trilho superior para porta de correr. Regra: SlidingDoorRule. |
| POR_COR | BASE | — | r_trilho_inf (canal 5mm x 5mm) | Canal trilho inferior para porta de correr. Regra: SlidingDoorRule. |

### Juncoes BUTT alternativas (Confirmat)

Quando `default_joint_type = confirmat` ou `force_joint = confirmat` na peca:

| Peca A | Peca B | Usinagem em A | Usinagem em B | Notas |
|--------|--------|---------------|---------------|-------|
| LAT_ESQ | BASE | p_5mm_confirmat (edge, 45mm) | f_8mm_confirmat (face, passante) | Confirmat em vez de minifix. Regra: ConfirmatRule. |
| LAT_ESQ | TOPO | p_5mm_confirmat (edge, 45mm) | f_8mm_confirmat (face, passante) | Idem. |
| LAT_DIR | BASE | p_5mm_confirmat (edge, 45mm) | f_8mm_confirmat (face, passante) | Espelhado. |
| LAT_DIR | TOPO | p_5mm_confirmat (edge, 45mm) | f_8mm_confirmat (face, passante) | Espelhado. |

Para chapas grossas (25mm+): p_7mm_confirmat (edge, 50mm) + f_8mm_confirmat (face, passante).

### Colisoes IGNORADAS (sem usinagem)

| Peca A | Peca B | Motivo |
|--------|--------|--------|
| PRA_REG | LAT_ESQ | Prateleira regulavel — apoiada em pinos System32, nao recebe furacao direta. |
| PRA_REG | LAT_DIR | Idem. |
| PRA_REG | DIV_V | Idem. |
| GAV_FR | LAT_ESQ | Gaveta nao se conecta diretamente a lateral — corrediça faz a conexao. |
| GAV_FR | LAT_DIR | Idem. |
| GAV_LAT | LAT_ESQ | Idem — corrediça. |
| GAV_LAT | LAT_DIR | Idem. |
| TAM | qualquer | Tamponamento — fixacao por cola. |
| PAI | qualquer | Painel avulso — fixacao externa. |
| TEST | qualquer | Testeira — fixacao por parafuso externo. |
| ROD | qualquer | Rodape — fixacao por parafuso externo. |
| CEN | qualquer | Cenefa — fixacao por cola ou grampo. |

---

## Usinagens geradas por PAPEL da peca (sem colisao direta)

Algumas usinagens sao geradas pelo papel da peca, nao por colisao:

| Peca | Condicao | Usinagem gerada | Onde |
|------|----------|-----------------|------|
| POR / POR_ESQ / POR_DIR | Sempre | f_puxador (passante) | Posicao configuravel |
| PRA_REG | Presente no modulo | f_5mm_s32 (series de furos System32) | Nas laterais e divisores do modulo |
| POR_COR | Presente no modulo | r_trilho (canal para trilho) | No topo e base do modulo |
| POR_BAS | Presente no modulo | f_pistao (furos para pistao) | Na lateral e na porta |
| GAV_FR | Sempre | f_puxador (passante) | Posicao configuravel (se puxador configurado) |
| qualquer peca | Atributo ornato_passafio = true | f_passafio (35mm ou 60mm, passante) | Posicao do atributo. Regra: PassThroughRule. Suporta multiplos furos (passafio_2_x, etc.) |
| qualquer peca | Atributo ornato_led = true | r_led (canal 8-12mm, 8mm prof) | Posicao do atributo. Regra: LEDChannelRule. Configuravel: led_width, led_depth, led_position, led_face |

---

## Regras de posicionamento

### Minifix — posicao dos furos

```
    ┌──────────────────────────────────────┐
    │                                      │
    │  ○         ○         ○         ○     │
    │  ↑         ↑         ↑         ↑     │
    │  50mm      350mm     650mm     950mm │
    │  (borda)   (+300mm)  (+300mm)  (-50mm da outra borda)
    │                                      │
    └──────────────────────────────────────┘
      ↑ distancia da borda frontal: 37mm (centro da largura do painel)
```

Regras:
- Primeiro minifix: `DIST_BORDA` mm da borda (padrao: 50mm)
- Ultimo minifix: `DIST_BORDA` mm da outra borda
- Intermediarios: a cada `ESPAC_MINIFIX` mm (padrao: 300mm)
- Se espaco insuficiente para intermediario, nao coloca
- Posicao Y: centro da largura da peca que recebe o corpo
- Cavilhas intercaladas entre minifixes, a `ESPAC_CAVILHA` mm (padrao: meio entre minifixes)

### Dobradica — posicao das copas

```
    ┌──────────────────────┐
    │                      │
    │  ○ (100mm da borda)  │ ← copa 1
    │                      │
    │                      │
    │  ○ (centro)          │ ← copa 3 (se altura > 1200mm)
    │                      │
    │                      │
    │  ○ (100mm da borda)  │ ← copa 2
    │                      │
    └──────────────────────┘
```

Regras:
- 2 dobradicas para portas ate 1200mm
- 3 dobradicas para portas de 1200mm a 2000mm
- 4 dobradicas para portas acima de 2000mm
- Distancia da borda: `DIST_DOB_BORDA` mm (padrao: 100mm)
- Copa: 35mm diametro, 11-13mm profundidade
- Distancia da borda lateral (y): 22.5mm (padrao)

### Rasgo de fundo — posicao

```
    ┌──────────────────────┐
    │                      │
    │   ┌──────────────┐   │
    │   │              │   │ ← rasgo de fundo
    │   │              │   │    offset da borda traseira
    │   └──────────────┘   │
    │                      │
    └──────────────────────┘
      ↑ offset: tipicamente 8mm da borda traseira
```

Regras:
- Offset da borda traseira: espessura do fundo + folga (padrao: 8mm para fundo 3mm)
- Largura do rasgo: espessura do fundo + 0.2mm de folga
- Profundidade: 8mm (padrao) — nunca mais que metade da espessura da peca

### System32 — series de furos

```
    ┌──────────────────────┐
    │  ○  ○  ○  ○  ○  ○   │ ← linha de furos System32
    │                      │    espaco: 32mm entre furos
    │                      │
    │  ○  ○  ○  ○  ○  ○   │ ← segunda linha (se largura > 300mm)
    │                      │
    └──────────────────────┘
```

Regras:
- Distancia entre furos: 32mm (fixo, padrao System32)
- Distancia da borda: 37mm (padrao europeu)
- Diametro: 5mm
- Profundidade: 11mm
- Linha unica se largura < 300mm, dupla se > 300mm
- Inicio: `DIST_S32_INICIO` mm da borda inferior (padrao: 64mm = 2x32)
- Fim: `DIST_S32_FIM` mm da borda superior (padrao: 64mm)
