# Materiais e Bordas

## Convencao de nomenclatura de materiais

O plugin identifica o material da peca pelo atributo `material` no grupo/componente do SketchUp, ou pelo nome do material aplicado na face principal.

### Formato padrao

```
TIPO_ESPESSURA_COR_TEXTURA

Exemplos:
  MDF_18_BRANCO_TX       → MDF 18mm branco texturizado
  MDF_15_CARVALHO_NA     → MDF 15mm carvalho natural
  MDP_18_CINZA_LN        → MDP 18mm cinza linho
  MDF_25_PRETO_BR        → MDF 25mm preto brilhante
  COM_18_FREIJO_TX       → Compensado 18mm freijo texturizado
```

### Tipos de chapa

| Codigo | Descricao | Uso tipico |
|--------|-----------|------------|
| `MDF` | MDF (fibra media densidade) | Portas, frentes, pecas com acabamento |
| `MDP` | MDP (particulas) | Estrutura interna (laterais, base, topo) |
| `COM` | Compensado | Fundos, gavetas, pecas estruturais |
| `OSB` | OSB | Uso raro em moveis — paineis estruturais |
| `MAD` | Madeira macica | Molduras, tampos, pecas especiais |
| `VID` | Vidro | Portas de vidro, prateleiras de vidro |
| `ACR` | Acrilico | Portas, paineis decorativos |
| `ALU` | Aluminio | Perfis, molduras metalicas |
| `ACO` | Aco | Estruturas metalicas |

### Espessuras comuns

| Espessura | Uso tipico |
|-----------|------------|
| 3 mm | Fundos (FUN), gaveta fundo (GAV_FUN) |
| 6 mm | Fundos reforcados |
| 9 mm | Fundos grossos, costas |
| 12 mm | Gavetas, nichos pequenos |
| 15 mm | Estrutura leve, prateleiras |
| 18 mm | Estrutura padrao (laterais, topo, base) |
| 25 mm | Tampos, bancadas, estrutura reforcada |
| 30 mm | Tampos grossos |
| 36 mm | Bancadas de cozinha |

### Codigos de acabamento (textura)

| Codigo | Descricao |
|--------|-----------|
| `TX` | Texturizado |
| `LN` | Linho |
| `NA` | Natural (veio de madeira) |
| `BR` | Brilhante (alto brilho) |
| `MT` | Matte (fosco) |
| `ST` | Sem tratamento (cru) |
| `LC` | Lacado (pintura) |
| `PT` | Pintura (generico) |

---

## Direcao do veio (grao)

Para materiais com veio (madeira, melamina texturizada), a direcao do veio e importante no corte e na otimizacao.

### Convencao

```
O veio segue o COMPRIMENTO da peca por padrao.

Se a peca precisa de veio na largura, usar atributo:
  peca.set_attribute('ornato', 'grain_direction', 'width')

Valores:
  length  → veio no comprimento (padrao, nao precisa definir)
  width   → veio na largura (rotacao de 90 graus no plano de corte)
  none    → sem veio (MDF branco liso, etc.)
```

### Impacto no plano de corte

Quando o veio e `width`, o otimizador de corte gira a peca 90 graus:
- Comprimento passa a ser posicionado na direcao Y da chapa
- Largura passa a ser posicionada na direcao X da chapa
- O rotulo no plano indica a rotacao com um simbolo de seta

---

## Bordas (fitas de borda)

### Formato padrao

```
BOR_ESPESSURA_x_ALTURA_COR_TEXTURA

Exemplos:
  BOR_2x45_BRANCO_TX     → Borda 2mm x 45mm branca texturizada
  BOR_1x22_CARVALHO_NA   → Borda 1mm x 22mm carvalho natural
  BOR_04x22_PRETO_BR     → Borda 0.4mm x 22mm preta brilhante
```

### Espessuras de borda comuns

| Espessura | Descricao | Uso |
|-----------|-----------|-----|
| 0.4 mm | Fita fina (PP/PVC) | Bordas nao visiveis, internas |
| 1.0 mm | Fita media (PVC/ABS) | Bordas semi-visiveis |
| 2.0 mm | Fita grossa (PVC/ABS) | Bordas visiveis, frontais |
| 3.0 mm | Fita extra-grossa (ABS) | Bordas de destaque, tampos |

### Alturas de borda

A altura da borda deve ser >= espessura da chapa:

| Espessura chapa | Altura borda recomendada |
|-----------------|------------------------|
| 15 mm | 22 mm |
| 18 mm | 22 mm |
| 25 mm | 28 mm ou 33 mm |
| 30 mm | 33 mm |
| 36 mm | 45 mm |

### Definicao de bordas por face

Cada peca pode ter bordas em ate 4 lados. A convencao segue o sentido horario a partir da borda superior:

```
         BORDA SUPERIOR (top)
    ┌────────────────────────────┐
    │                            │
B.  │                            │ B.
ESQ │        FACE DA PECA        │ DIR
    │                            │
    │                            │
    └────────────────────────────┘
         BORDA INFERIOR (bottom)

Atributos:
  edge_top     = "BOR_2x22_BRANCO_TX"   (ou "none")
  edge_bottom  = "BOR_2x22_BRANCO_TX"   (ou "none")
  edge_left    = "BOR_1x22_BRANCO_TX"   (ou "none")
  edge_right   = "BOR_1x22_BRANCO_TX"   (ou "none")
```

### Regras automaticas de borda

O plugin pode aplicar bordas automaticamente com base no papel da peca:

| Peca | edge_top | edge_bottom | edge_left | edge_right | Logica |
|------|----------|-------------|-----------|------------|--------|
| LAT_ESQ | sim (frontal) | none | sim (superior) | sim (inferior) | Borda frontal + topos |
| LAT_DIR | sim (frontal) | none | sim (superior) | sim (inferior) | Espelhado |
| TOPO | sim (frontal) | none | none | none | So borda frontal |
| BASE | sim (frontal) | none | none | none | So borda frontal |
| PRA | sim | sim | sim | sim | Todas as bordas (fixa) |
| PRA_REG | sim | sim | sim | sim | Todas as bordas (regulavel) |
| POR | sim | sim | sim | sim | Todas as bordas (porta) |
| FUN | none | none | none | none | Sem borda (fundo) |
| DIV_V | sim (frontal) | none | none | none | So borda frontal |
| DIV_H | sim (frontal) | none | none | none | So borda frontal |

**Nota**: "frontal" refere-se a borda que fica visivel na frente do movel. A orientacao depende da posicao da peca.

### Override de borda por peca

```ruby
peca.set_attribute('ornato', 'edge_top', 'BOR_2x22_BRANCO_TX')
peca.set_attribute('ornato', 'edge_bottom', 'none')
peca.set_attribute('ornato', 'edge_left', 'BOR_1x22_BRANCO_TX')
peca.set_attribute('ornato', 'edge_right', 'BOR_1x22_BRANCO_TX')
```

---

## Mapeamento material do SketchUp para material Ornato

O plugin tenta reconhecer o material do SketchUp automaticamente:

1. **Por atributo**: se o grupo tem atributo `ornato_material`, usa diretamente
2. **Por nome do material**: tenta parsear o nome no formato `TIPO_ESPESSURA_COR_TEXTURA`
3. **Por espessura**: se nao reconhece o nome, infere o tipo pela espessura detectada na geometria
4. **Fallback**: se nada funcionar, usa `MDF_18_BRANCO_TX` como padrao

### Exemplos de reconhecimento

```
Material SketchUp          →  Material Ornato
"MDF Branco Tx 18mm"       →  MDF_18_BRANCO_TX (parseia palavras-chave)
"Melamina Carvalho"        →  MDF_18_CARVALHO_NA (assume 18mm, natural)
"Branco"                   →  MDF_18_BRANCO_TX (assume MDF 18mm)
(sem material)             →  MDF_18_BRANCO_TX (fallback)
```

---

## Impacto do material na usinagem

A espessura do material afeta diretamente os parametros de usinagem:

| Espessura | Minifix corpo | Minifix eixo | Cavilha | Confirmat |
|-----------|--------------|-------------|---------|-----------|
| 15 mm | 15mm diam, 12mm prof | 8mm, 34mm prof | 8mm, 11mm prof | 5mm, 40mm prof |
| 18 mm | 15mm diam, 13mm prof | 8mm, 34mm prof | 8mm, 12mm prof | 5mm, 45mm prof |
| 25 mm | 20mm diam, 15mm prof | 8mm, 34mm prof | 10mm, 14mm prof | 7mm, 50mm prof |

A espessura tambem afeta:
- Profundidade maxima de rasgo (nunca > 50% da espessura)
- Posicao Y dos furos (centralizado na espessura)
- Profundidade da copa de dobradica
- Tipo de minifix (15mm padrao vs 20mm para chapas grossas)
