# Configuracao de Regras

## Visao geral

O plugin vem com regras padrao para a maioria dos cenarios de marcenaria. Todas as regras sao configuraveis para adaptar ao fluxo de trabalho de cada fabrica.

As configuracoes ficam em 3 niveis:
1. **Global** — aplica a todos os modulos (aba Configuracoes do plugin)
2. **Por modulo** — atributos no grupo do modulo (override do global)
3. **Por peca** — atributos no grupo da peca (override do modulo)

---

## Configuracoes globais

### Juncao padrao

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `default_joint_type` | minifix | Tipo de conexao padrao para juncoes butt: minifix, cavilha, confirmat |
| `edge_borda_dist` | 50 mm | Distancia do primeiro furo ate a borda |
| `edge_spacing` | 300 mm | Espacamento entre furos intermediarios |
| `center_on_width` | true | Centralizar furos na largura da peca |

### Minifix

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `minifix_body_diameter` | 15 mm | Diametro do corpo (tambor) |
| `minifix_body_depth` | 12 mm | Profundidade do corpo |
| `minifix_shaft_diameter` | 8 mm | Diametro do eixo (parafuso) |
| `minifix_shaft_depth` | 34 mm | Profundidade do eixo (lateral) |
| `minifix_add_dowels` | true | Adicionar cavilhas entre minifixes |
| `minifix_dowel_offset` | 32 mm | Distancia entre minifix e cavilha adjacente |

### Cavilha

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `dowel_diameter` | 8 mm | Diametro da cavilha |
| `dowel_depth_face` | 11 mm | Profundidade na face (top/bottom) |
| `dowel_depth_edge` | 24 mm | Profundidade na borda (lateral) |
| `dowel_count_min` | 2 | Minimo de cavilhas por juncao |
| `dowel_spacing` | 200 mm | Espacamento entre cavilhas |

### Confirmat

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `confirmat_diameter_face` | 8 mm | Diametro na face (pre-furo) |
| `confirmat_depth_face` | passante | Profundidade na face |
| `confirmat_diameter_edge` | 5 mm | Diametro na borda |
| `confirmat_depth_edge` | 45 mm | Profundidade na borda |

### Dobradica

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `hinge_cup_diameter` | 35 mm | Diametro da copa |
| `hinge_cup_depth` | 11 mm | Profundidade da copa |
| `hinge_y_offset` | 22.5 mm | Distancia da borda lateral |
| `hinge_edge_dist` | 100 mm | Distancia da dobradica ate a borda superior/inferior |
| `hinge_threshold_3` | 1200 mm | Altura da porta para adicionar 3a dobradica |
| `hinge_threshold_4` | 2000 mm | Altura da porta para adicionar 4a dobradica |
| `hinge_base_holes` | 2 | Numero de furos no calco (2 ou 3) |
| `hinge_base_diameter` | 4 mm | Diametro dos furos do calco |
| `hinge_base_depth` | 11 mm | Profundidade dos furos do calco |

### Rasgo de fundo

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `back_panel_thickness` | 3 mm | Espessura do painel traseiro |
| `groove_width_clearance` | 0.2 mm | Folga na largura do rasgo |
| `groove_depth` | 8 mm | Profundidade do rasgo |
| `groove_offset` | auto | Distancia da borda traseira (auto = espessura fundo + 5mm) |

### System32

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `s32_pitch` | 32 mm | Distancia entre furos (fixo no padrao System32) |
| `s32_diameter` | 5 mm | Diametro dos furos |
| `s32_depth` | 11 mm | Profundidade |
| `s32_y_offset` | 37 mm | Distancia da borda frontal |
| `s32_start_offset` | 64 mm | Distancia da borda inferior ate primeiro furo (2x pitch) |
| `s32_end_offset` | 64 mm | Distancia da borda superior ate ultimo furo |
| `s32_double_line` | auto | Linha dupla se largura > 300mm |
| `s32_double_line_y` | auto | Posicao Y da segunda linha (auto = largura - 37mm) |

### Puxador

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `handle_enabled` | true | Gerar furos de puxador automaticamente em portas |
| `handle_type` | single | Tipo: single (1 furo), double (2 furos), rail (trilho) |
| `handle_diameter` | 8 mm | Diametro do furo |
| `handle_height` | auto | Altura do puxador (auto = centro da porta ou 980mm do chao) |
| `handle_spacing` | 96 mm | Distancia entre furos (para double — padrao 96mm, 128mm, 160mm) |
| `handle_edge_offset` | 40 mm | Distancia do puxador ate a borda lateral da porta |

### Corrediça (gaveta)

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `slide_type` | telescopica | Tipo: telescopica, quadro_metalico, oculta |
| `slide_holes_enabled` | false | Gerar furos de fixacao da corrediça na lateral |
| `slide_ignore_drawer_collision` | true | Ignorar colisao gaveta ↔ lateral (nao gerar minifix/cavilha) |

### Tolerancias

| Parametro | Valor padrao | Descricao |
|-----------|-------------|-----------|
| `proximity_tolerance` | 1.0 mm | Distancia maxima para contato direto |
| `dado_tolerance` | 2.0 mm | Distancia maxima para contato dado |
| `min_overlap` | 10 mm | Sobreposicao minima para juncao valida |
| `min_contact_area` | 100 mm2 | Area minima de contato |
| `thickness_tolerance` | 0.5 mm | Tolerancia na deteccao de espessura |

---

## Override por modulo

Atributos no grupo do modulo que sobrescrevem as configuracoes globais:

```ruby
# No SketchUp, selecionar o grupo do modulo e definir atributos:
grupo.set_attribute('ornato', 'joint_type', 'cavilha')        # so cavilha neste movel
grupo.set_attribute('ornato', 'hinge_type', '26mm')            # dobradica mini
grupo.set_attribute('ornato', 'back_panel_thickness', '6')     # fundo 6mm
grupo.set_attribute('ornato', 'handle_enabled', 'false')       # sem puxador automatico
```

Ou via painel do plugin: selecionar o modulo → aba Config → secao "Override de Modulo".

---

## Override por peca

Atributos no grupo da peca:

```ruby
# Exemplos
peca.set_attribute('ornato', 'skip_machining', 'true')    # nao usinar esta peca
peca.set_attribute('ornato', 'force_joint', 'confirmat')  # usar confirmat nesta juncao
peca.set_attribute('ornato', 'passafio', 'true')          # adicionar passa-fio
peca.set_attribute('ornato', 'passafio_diameter', '60')   # diametro do passa-fio
peca.set_attribute('ornato', 'passafio_x', '200')         # posicao X do passa-fio
peca.set_attribute('ornato', 'passafio_y', '150')         # posicao Y do passa-fio
peca.set_attribute('ornato', 'led_channel', 'true')       # adicionar canal de LED
peca.set_attribute('ornato', 'led_width', '10')           # largura do canal
peca.set_attribute('ornato', 'led_depth', '8')            # profundidade do canal
peca.set_attribute('ornato', 'led_position', 'front')     # posicao: front, rear, center
```

---

## Exclusoes personalizadas

Para impedir usinagem em combinacoes especificas, defina regras de exclusao:

```ruby
# No config.json do plugin:
{
  "exclusions": [
    { "piece_a": "PAI", "piece_b": "*", "action": "ignore" },
    { "piece_a": "TAM", "piece_b": "*", "action": "ignore" },
    { "piece_a": "ROD", "piece_b": "*", "action": "ignore" },
    { "piece_a": "GAV_*", "piece_b": "LAT_*", "action": "ignore" },
    { "piece_a": "PRA_REG", "piece_b": "*", "action": "s32_only" }
  ]
}
```

Acoes disponiveis:
- `ignore` — nenhuma usinagem para este par
- `s32_only` — so gera System32, ignora juncao direta
- `dowel_only` — so cavilha, sem minifix
- `custom` — aplica regra customizada (definida em rules/)

---

## Hierarquia de prioridade

Quando ha conflito entre configuracoes:

```
1. Override da PECA       (mais especifico — prevalece)
    ↓
2. Override do MODULO     (nivel intermediario)
    ↓
3. Exclusoes personalizadas
    ↓
4. Matriz de regras padrao (05_MATRIZ_USINAGENS)
    ↓
5. Configuracao GLOBAL    (fallback)
```

Se a peca tem `skip_machining = true`, nenhuma regra e aplicada, independente do que o modulo ou as configuracoes globais digam.
