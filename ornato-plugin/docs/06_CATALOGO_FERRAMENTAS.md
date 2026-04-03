# Catalogo de Ferramentas

## Convencao de codigos

Cada ferramenta tem um codigo unico que identifica o tipo de operacao:

```
PREFIXO_DIAMETRO_TIPO

f_   = furo (boring) — furo cego ou parcial
p_   = passante (through hole) — furo que atravessa a peca
r_   = rasgo (grooving) — canal linear
rb_  = rebaixo (pocket) — cavidade retangular
usi_ = usinagem (milling) — fresagem com caminho de pontos
```

---

## Familia 1 — Furacoes verticais (top/bottom)

Furos feitos pela CNC na face superior ou inferior da peca (o mais comum).

| Codigo | Descricao | Diametro | Prof. tipica | Uso |
|--------|-----------|----------|-------------|-----|
| `f_35mm_dob` | Copa de dobradica | 35 mm | 11-13 mm | Dobradica de caneco padrao (Blum, Hettich, Grass, Hafele) |
| `f_26mm_dob` | Copa de dobradica mini | 26 mm | 11 mm | Dobradica mini para portas leves |
| `f_15mm_minifix` | Corpo minifix | 15 mm | 12-13 mm | Alojamento do tambor minifix |
| `f_20mm_minifix` | Corpo minifix grande | 20 mm | 13 mm | Minifix para chapas grossas (25mm+) |
| `f_15mm_uniblock` | Corpo uniblock | 15 mm | 12 mm | Uniblock (alternativa ao minifix) |
| `f_8mm_cavilha` | Furo para cavilha | 8 mm | 11-12 mm | Cavilha de madeira padrao 8mm |
| `f_10mm_cavilha` | Furo para cavilha 10 | 10 mm | 13 mm | Cavilha 10mm (menos comum) |
| `f_5mm_vb` | Furo VB / parafuso | 5 mm | 11 mm | Parafuso de montagem VB (Verbindungs Beschlag) |
| `f_5mm_s32` | Furo System32 | 5 mm | 11 mm | Serie de furos para prateleira regulavel |
| `f_3mm_piloto` | Pre-furo piloto | 3 mm | 8 mm | Furo guia para parafuso |
| `f_35mm_passafio` | Passa-fio | 35 mm | passante | Furo para passagem de cabos eletricos |
| `f_60mm_passafio` | Passa-fio grande | 60 mm | passante | Furo para passagem de cabos multiplos |
| `f_80mm_passafio` | Passa-fio jumbo | 80 mm | passante | Furo para passagem de canos/dutos |
| `f_puxador` | Furo de puxador | variavel | passante | Furo(s) para fixacao de puxador — diametro depende do puxador |
| `f_8mm` | Furo generico 8mm | 8 mm | variavel | Furo de uso geral |
| `f_10mm` | Furo generico 10mm | 10 mm | variavel | Furo de uso geral |
| `f_12mm` | Furo generico 12mm | 12 mm | variavel | Furo de uso geral |

---

## Familia 2 — Furacoes horizontais (left/right/front/rear)

Furos feitos na borda/lateral da peca (requer maquina com unidade horizontal ou boring).

| Codigo | Descricao | Diametro | Prof. tipica | Uso |
|--------|-----------|----------|-------------|-----|
| `p_8mm_eixo_minifix` | Eixo/parafuso minifix | 8 mm | 34 mm | Parafuso que conecta o tambor minifix a outra peca |
| `p_8mm_cavilha` | Cavilha lateral | 8 mm | 24-30 mm | Cavilha inserida pela borda |
| `p_10mm_cavilha` | Cavilha lateral 10 | 10 mm | 28-35 mm | Cavilha 10mm inserida pela borda |
| `p_5mm_confirmat` | Confirmat / europarafuso | 5 mm | 40-50 mm | Furo para confirmat (alternativa ao minifix) |
| `p_7mm_confirmat` | Confirmat corpo | 7 mm | 40-50 mm | Furo para corpo do confirmat (espessura > 18mm) |
| `p_12mm` | Passante 12mm | 12 mm | 20 mm | Furo lateral generico |
| `f_dob_base` | Furos base dobradica | 4 mm | 11 mm | 2-3 furos para fixacao da base/calco da dobradica |
| `f_pistao` | Furo para pistao | 8-10 mm | 12 mm | Fixacao de pistao a gas (porta basculante) |
| `f_corr` | Furos para corrediça | 4-5 mm | 11 mm | Fixacao de corrediça telescopica na lateral |

---

## Familia 3 — Rasgos lineares (grooving)

Canais retilineos feitos com serra ou fresa.

| Codigo | Descricao | Largura | Prof. tipica | Uso |
|--------|-----------|---------|-------------|-----|
| `r_f` | Rasgo de fundo (MDF 3mm) | 3.2 mm | 8 mm | Canal para encaixar painel traseiro 3mm |
| `r_f_6` | Rasgo de fundo (MDF 6mm) | 6.2 mm | 8 mm | Canal para encaixar painel traseiro 6mm |
| `r_f_9` | Rasgo de fundo (MDF 9mm) | 9.2 mm | 8 mm | Canal para encaixar painel traseiro 9mm |
| `r_div` | Rasgo para divisoria | espessura da div | 8 mm | Canal para encaixar divisor |
| `r_led` | Canal de LED | 8-12 mm | 8-10 mm | Fresagem para fita LED embutida |
| `r_vidro` | Canal para vidro | 4 mm | 10 mm | Rasgo para encaixar porta de vidro ou prateleira de vidro |
| `r_corr` | Canal de corrediça | variavel | variavel | Rasgo para trilho de porta de correr |
| `r_trilho_sup` | Trilho superior | 3-5 mm | 8 mm | Canal no topo do movel para porta de correr |
| `r_trilho_inf` | Trilho inferior | 3-5 mm | 5 mm | Canal na base do movel para porta de correr |
| `rb_av` | Rebaixo avulso | variavel | variavel | Canal generico configuravel |

### Posicionamento de rasgos

Cada rasgo e definido por:
- `pos_start` — ponto inicial (x, y) na face de trabalho
- `pos_end` — ponto final (x, y) na face de trabalho
- `width` — largura do rasgo (mm)
- `depth` — profundidade do rasgo (mm)
- `quadrant` — face onde o rasgo e feito (top, bottom)

---

## Familia 4 — Fresagens (milling)

Operacoes de fresagem com caminho de pontos (contorno complexo).

| Codigo | Descricao | Ferramenta tipica | Uso |
|--------|-----------|-------------------|-----|
| `usi_chanfro_45` | Chanfro 45 graus | Fresa chanfro 45, 38mm | Juncao de molduras, portas com acabamento meia-esquadria |
| `usi_chanfro_var` | Chanfro angulo variavel | Fresa chanfro regulavel | Chanfro em angulo diferente de 45 |
| `usi_contorno` | Fresagem de contorno | Fresa reta 6-12mm | Recorte seguindo caminho de pontos (formas curvas) |
| `usi_recorte` | Recorte (pia/cooktop) | Fresa reta 6-12mm | Recorte retangular ou oval para embutir equipamentos |
| `usi_rebaixo` | Rebaixo / pocket | Fresa reta 6-12mm | Cavidade retangular (para encaixe ou embutir) |
| `usi_meia_lua` | Meia-lua / arco | Fresa reta 6mm | Forma semicircular (puxador embutido, etc.) |
| `usi_perfil` | Perfil decorativo | Fresa de perfil | Moldura decorativa na borda (ogee, cove, etc.) |
| `usi_point_to_point` | Fresagem ponto-a-ponto | Fresa 5-8mm | Caminho complexo definido por serie de coordenadas |
| `usi_line` | Fresagem linear | Fresa 5-8mm | Fresagem em linha reta (canal complexo) |

### Posicionamento de fresagens

Fresagens complexas sao definidas por:
- `positions` — array de pontos [{x, y}, ...] na face de trabalho
- `depth` — profundidade (mm)
- `width_tool` — diametro da ferramenta
- `closed` — se o caminho e fechado (volta ao ponto inicial)
- `quadrant` — face onde a fresagem e feita
- `correction` — compensacao de raio (0 = sem, 1 = direita, -1 = esquerda)

---

## Familia 5 — Cortes especiais

Operacoes que alteram a forma externa da peca.

| Codigo | Descricao | Uso |
|--------|-----------|-----|
| `corte_esquadria_45` | Meia-esquadria 45 | Corte em 45 graus na borda (juncao de moldura) |
| `corte_esquadria_var` | Esquadria variavel | Corte em angulo configuravel |
| `corte_curvo` | Corte curvo | Corte seguindo curva (fresa) |
| `corte_angular` | Corte angular | Corte em angulo na chapa (serras angulares) |
| `corte_topo` | Corte de topo | Acerto na borda (esquadrejamento) |

---

## Mapeamento ferramenta → codigo CNC

Cada ferramenta pode ter um mapeamento customizado para o codigo da maquina CNC:

| Codigo Ornato | Maquina Biesse | Maquina SCM | Maquina Homag |
|---------------|---------------|-------------|---------------|
| `f_35mm_dob` | BOR_35 | T35 | BHR_35 |
| `f_15mm_minifix` | BOR_15 | T15 | BHR_15 |
| `f_8mm_cavilha` | BOR_8 | T8 | BHR_8 |
| `f_5mm_vb` | BOR_5 | T5 | BHR_5 |
| `r_f` | SAW_3 | S3 | SAG_3 |

O mapeamento e configuravel na aba Configuracoes do plugin, secao "Ferramentas CNC".

---

## Diametros de broca por espessura de chapa

Referencia rapida para dimensionamento correto:

| Espessura chapa | Minifix corpo | Minifix eixo | Cavilha | Confirmat |
|-----------------|--------------|-------------|---------|-----------|
| 15 mm | 15mm, prof 12mm | 8mm, prof 34mm | 8mm, prof 11mm | 5mm, prof 40mm |
| 18 mm | 15mm, prof 13mm | 8mm, prof 34mm | 8mm, prof 12mm | 5mm, prof 45mm |
| 25 mm | 20mm, prof 15mm | 8mm, prof 34mm | 10mm, prof 14mm | 7mm, prof 50mm |

| Espessura fundo | Rasgo largura | Rasgo profundidade |
|-----------------|--------------|-------------------|
| 3 mm | 3.2 mm | 8 mm |
| 6 mm | 6.2 mm | 8 mm |
| 9 mm | 9.2 mm | 10 mm |
