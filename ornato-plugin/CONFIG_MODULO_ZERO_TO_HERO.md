# Configuração de Módulo — Zero to Hero

> **Para quem:** equipe que vai cadastrar módulos na galeria.
> **O que tem aqui:** lista completa de variáveis (com nome exato), valores aceitos, e um exemplo completo do zero ao módulo pronto.
> **O que não tem aqui:** teoria. Pra aprofundar, ver `MANUAL_MODELAGEM_GALERIA.md` e `docs/02..12`.

---

## Sumário

1. [Anatomia de um módulo](#1-anatomia-de-um-módulo)
2. [Nome do grupo no SketchUp](#2-nome-do-grupo-no-sketchup)
3. [Atributos do grupo MÓDULO](#3-atributos-do-grupo-módulo-attributedictionary-ornato)
4. [Atributos do grupo PEÇA](#4-atributos-do-grupo-peça-attributedictionary-ornato)
5. [Códigos de role aceitos](#5-códigos-de-role-aceitos)
6. [Códigos de material aceitos](#6-códigos-de-material-aceitos)
7. [Códigos de borda aceitos](#7-códigos-de-borda-aceitos)
8. [Códigos de ferragem aceitos](#8-códigos-de-ferragem-aceitos)
9. [Atributos de feature especial](#9-atributos-de-feature-especial)
10. [JSON paramétrico — schema completo](#10-json-paramétrico--schema-completo)
11. [Exemplo zero-to-hero — Balcão 2 portas](#11-exemplo-zero-to-hero--balcão-2-portas)
12. [Cheat sheet 1 página](#12-cheat-sheet-1-página)

---

## 1. Anatomia de um módulo

```
ORN_BAL Balcão 2 portas               ← grupo MÓDULO
  │
  ├── LAT_ESQ     ← grupo PEÇA (lateral esquerda)
  ├── LAT_DIR     ← grupo PEÇA (lateral direita)
  ├── BASE        ← grupo PEÇA (fundo estrutural)
  ├── TOPO        ← grupo PEÇA (tampo superior)
  ├── FUN         ← grupo PEÇA (painel traseiro)
  ├── PRA         ← grupo PEÇA (prateleira fixa)
  ├── POR_ESQ     ← grupo PEÇA (porta esquerda)
  └── POR_DIR     ← grupo PEÇA (porta direita)
```

**Cada nível tem regras próprias:**

| Nível | Tipo | Atributos obrigatórios |
|-------|------|------------------------|
| Módulo | Grupo nomeado `ORN_xxx` | `tipo='modulo'`, `categoria`, `nome` |
| Peça | Grupo nomeado conforme role | `tipo='peca'`, `role`, `material`, `espessura` |

---

## 2. Nome do grupo no SketchUp

### 2.1 Nome do MÓDULO — sempre começa com `ORN_`

Padrão: `ORN_<código> <descrição livre>`

| Código | Categoria | Exemplo de nome |
|--------|-----------|-----------------|
| `ORN_BAL` | balcão de cozinha | `ORN_BAL Pia Cozinha 800mm` |
| `ORN_BAL_PIA` | balcão com pia | `ORN_BAL_PIA Cuba Inox` |
| `ORN_BAL_CK` | balcão cooktop | `ORN_BAL_CK 5 bocas` |
| `ORN_BAL_CAN` | balcão de canto | `ORN_BAL_CAN L 90°` |
| `ORN_BAL_GAV` | balcão gaveteiro | `ORN_BAL_GAV 4 gavetas` |
| `ORN_AER` | aéreo | `ORN_AER 2 portas` |
| `ORN_AER_ESC` | aéreo escorredor | `ORN_AER_ESC 800mm` |
| `ORN_AER_CAN` | aéreo de canto | `ORN_AER_CAN L` |
| `ORN_TOR_FOR` | torre forno/micro | `ORN_TOR_FOR Embutir` |
| `ORN_TOR_GEL` | torre geladeira | `ORN_TOR_GEL Side by Side` |
| `ORN_PAN` | paneleiro | `ORN_PAN 4 gavetas` |
| `ORN_ARM` | armário (genérico) | `ORN_ARM Suíte` |
| `ORN_ARM_POR` | armário c/ portas abrir | `ORN_ARM_POR 3 portas` |
| `ORN_ARM_COR` | armário portas correr | `ORN_ARM_COR 2 folhas` |
| `ORN_GAV` | gaveteiro avulso | `ORN_GAV 5 gavetas` |
| `ORN_SAP` | sapateira | `ORN_SAP 12 pares` |
| `ORN_CAB` | cabideiro | `ORN_CAB 1200mm` |
| `ORN_COM` | cômoda | `ORN_COM 6 gavetas` |
| `ORN_CRI` | criado mudo | `ORN_CRI` |
| `ORN_NIC` | nicho | `ORN_NIC Decorativo` |
| `ORN_BAN` | bancada/tampo | `ORN_BAN Escritório` |
| `ORN_MES` | mesa | `ORN_MES Jantar` |
| `ORN_EST` | estante | `ORN_EST Livros` |
| `ORN_PAI` | painel avulso | `ORN_PAI TV` |
| `ORN_MOL` | moldura | `ORN_MOL Teto` |
| `ORN_ROD` | rodapé | `ORN_ROD Cozinha` |
| `ORN_PRA` | prateleira avulsa | `ORN_PRA Decorativa` |
| `ORN_DIV` | divisória | `ORN_DIV Ambiente` |
| `ORN_HOM` | home theater | `ORN_HOM` |
| `ORN_LAV` | lavanderia | `ORN_LAV` |
| `ORN_BAN_WC` | gabinete banheiro | `ORN_BAN_WC Suspenso` |
| `ORN_ESP` | espelheira | `ORN_ESP Banheiro` |

> Plugin reconhece **case-insensitive**. Tudo após o código é descrição livre.

### 2.2 Nome da PEÇA — sempre é um dos códigos abaixo

Padrão: `<código>` ou `<código> <descrição livre>`

| Código | Descrição |
|--------|-----------|
| `LAT_ESQ` | lateral esquerda |
| `LAT_DIR` | lateral direita |
| `TOPO` | tampo superior |
| `BASE` | fundo estrutural inferior |
| `FUN` | fundo (painel traseiro 3-9mm) |
| `DIV_V` | divisor vertical |
| `DIV_H` | divisor horizontal |
| `TAM` | tamponamento |
| `TEST` | testeira |
| `ROD` | rodapé do móvel |
| `PRA` | prateleira fixa |
| `PRA_REG` | prateleira regulável |
| `POR` | porta única |
| `POR_ESQ` | porta esquerda |
| `POR_DIR` | porta direita |
| `POR_COR` | porta de correr |
| `POR_BAS` | porta basculante |
| `POR_VID` | porta de vidro |
| `GAV_FR` | frente de gaveta |
| `GAV_LAT` | lateral de gaveta |
| `GAV_FUN` | fundo de gaveta |
| `GAV_TRA` | traseira de gaveta |
| `GAV_BASE` | base de gaveta (se separado) |
| `MOL` | moldura |
| `PAI` | painel avulso |
| `CEN` | cenefa |
| `SUP` | suporte/reforço |

> Sufixo livre permitido: `LAT_ESQ mdf branco`, `POR_DIR#1` — todos válidos.

---

## 3. Atributos do grupo MÓDULO (`AttributeDictionary "Ornato"`)

### 3.1 Identificação

| Variável | Tipo | Obrigatório | Valores aceitos | Default | Descrição |
|----------|------|:-:|---|---|---|
| `tipo` | string | ✅ | `"modulo"` | — | Marca o grupo como módulo |
| `categoria` | string | ✅ | `"cozinha"`, `"dormitorio"`, `"banheiro"`, `"escritorio"`, `"sala"`, `"lavanderia"`, `"diversos"` | — | Categoria comercial do módulo |
| `nome` | string | ✅ | qualquer | — | Nome amigável que aparece na galeria |
| `codigo` | string | ✅ | `"ORN_BAL_001"` | — | Código único do módulo no catálogo |
| `versao` | string | recomendado | `"1.0.0"` | `"1.0.0"` | Versionamento do template |

### 3.2 Dimensões padrão (paramétricas)

| Variável | Tipo | Obrigatório | Valores aceitos | Default | Descrição |
|----------|------|:-:|---|---|---|
| `dim_L` | number | ✅ | 100–3000 | — | Largura padrão em mm |
| `dim_A` | number | ✅ | 100–3000 | — | Altura padrão em mm |
| `dim_P` | number | ✅ | 100–1000 | — | Profundidade padrão em mm |
| `dim_L_min` | number | recomendado | — | `dim_L * 0.7` | Largura mínima permitida |
| `dim_L_max` | number | recomendado | — | `dim_L * 1.5` | Largura máxima permitida |
| `dim_A_min` | number | recomendado | — | `dim_A * 0.8` | Altura mínima |
| `dim_A_max` | number | recomendado | — | `dim_A * 1.2` | Altura máxima |
| `dim_P_min` | number | recomendado | — | `dim_P * 0.9` | Profundidade mínima |
| `dim_P_max` | number | recomendado | — | `dim_P * 1.1` | Profundidade máxima |
| `dim_step` | number | opcional | 1–100 | `10` | Incremento permitido (mm) |

### 3.3 Materiais padrão do módulo

| Variável | Tipo | Obrigatório | Valores aceitos | Default | Descrição |
|----------|------|:-:|---|---|---|
| `mat_caixa` | string | ✅ | código de material (seção 6) | — | Material da estrutura (laterais, base, topo) |
| `mat_frente` | string | ✅ | código de material | igual a `mat_caixa` | Material das portas/gavetas |
| `mat_fundo` | string | ✅ | código de material | `"MDF_3_BRANCO"` | Material do painel traseiro |
| `mat_prateleira` | string | opcional | código de material | igual a `mat_caixa` | Material das prateleiras |
| `mat_interno` | string | opcional | código de material | igual a `mat_caixa` | Material de divisores e internos |

### 3.4 Configurações construtivas

| Variável | Tipo | Obrigatório | Valores aceitos | Default | Descrição |
|----------|------|:-:|---|---|---|
| `joint_type` | string | recomendado | `"minifix"`, `"confirmat"`, `"cavilha"`, `"misto"` | `"minifix"` | Tipo de junção padrão na caixa |
| `back_panel_type` | string | recomendado | `"rasgo"`, `"parafusado"`, `"sobreposto"` | `"rasgo"` | Como o fundo é fixado |
| `back_panel_thickness` | number | recomendado | `3`, `6`, `9` | `3` | Espessura do fundo (mm) |
| `espac_minifix` | number | opcional | 200–500 | `300` | Distância entre minifixes (mm) |
| `dist_minifix_borda` | number | opcional | 30–100 | `50` | Distância do primeiro minifix à borda |
| `n_cavilhas_extremidade` | number | opcional | 1–4 | `2` | Cavilhas por extremidade de prateleira |
| `s32_inicio` | number | opcional | 32–200 | `64` | Início da série System32 (mm da base) |
| `s32_fim` | number | opcional | 32–200 | `64` | Fim da série System32 (mm do topo) |
| `s32_passo` | number | opcional | 32, 64 | `32` | Espaçamento entre furos S32 |
| `tolerancia_folga` | number | opcional | 0–5 | `2` | Folga construtiva entre peças (mm) |

### 3.5 Ferragens padrão (overrides em peças individualmente)

| Variável | Tipo | Valores aceitos | Default | Descrição |
|----------|------|---|---|---|
| `dobradica_marca` | string | `"Blum"`, `"Hettich"`, `"FGV"`, `"Hafele"`, `"Grass"` | `"Blum"` | Marca padrão de dobradiça |
| `dobradica_modelo` | string | ver seção 8 | `"clip_top_blumotion"` | Modelo |
| `dobradica_angulo` | number | `95`, `110`, `155`, `170` | `110` | Ângulo de abertura |
| `corredica_marca` | string | `"Blum"`, `"Hettich"`, `"FGV"` | `"Blum"` | Marca padrão de corrediça |
| `corredica_modelo` | string | ver seção 8 | `"tandem_500"` | Modelo |
| `corredica_extensao` | string | `"telescopica"`, `"total"`, `"oculta"` | `"telescopica"` | Tipo de extensão |
| `corredica_carga_kg` | number | `15`, `30`, `40`, `50`, `70` | `30` | Carga máxima (kg) |
| `puxador_modelo` | string | ver seção 8 | `"cava_black_128"` | Modelo padrão |
| `puxador_pos` | string | `"horizontal"`, `"vertical"`, `"central"` | `"horizontal"` | Orientação |
| `puxador_offset` | number | 0–100 | `30` | Distância da borda (mm) |
| `pe_modelo` | string | `"cromado_100"`, `"plastico_100"`, `"metalico_150"`, `"sem_pe"` | `"cromado_100"` | Pé do móvel |
| `pe_altura` | number | 80–200 | `100` | Altura do pé (mm) |

### 3.6 Auto-preenchidos (não setar manualmente)

| Variável | Tipo | Quem preenche |
|----------|------|---|
| `modulo_id` | string | Plugin (UUID interno) |
| `created_at` | string | Plugin (ISO 8601) |
| `updated_at` | string | Plugin |
| `plugin_version` | string | Plugin |

---

## 4. Atributos do grupo PEÇA (`AttributeDictionary "Ornato"`)

### 4.1 Identificação obrigatória

| Variável | Tipo | Obrigatório | Valores aceitos | Default | Descrição |
|----------|------|:-:|---|---|---|
| `tipo` | string | ✅ | `"peca"` | — | Marca o grupo como peça |
| `role` | string | ✅ | ver seção 5 | — | Papel funcional da peça |
| `material` | string | ✅ | código de material (seção 6) | — | Código exato do material |
| `espessura` | number | ✅ | `3`, `6`, `9`, `12`, `15`, `18`, `25` | — | Espessura em mm |

### 4.2 Bordas (fitas aplicadas)

| Variável | Tipo | Obrigatório | Valores aceitos | Default | Descrição |
|----------|------|:-:|---|---|---|
| `borda_top` | string | recomendado | código de borda (seção 7) ou `"none"` | `"none"` | Fita na borda superior |
| `borda_bottom` | string | recomendado | idem | `"none"` | Fita na borda inferior |
| `borda_left` | string | recomendado | idem | `"none"` | Fita na borda esquerda |
| `borda_right` | string | recomendado | idem | `"none"` | Fita na borda direita |
| `grain_direction` | string | opcional | `"length"`, `"width"`, `"none"` | `"length"` | Direção do veio |

### 4.3 Override de comportamento

| Variável | Tipo | Obrigatório | Valores aceitos | Default | Descrição |
|----------|------|:-:|---|---|---|
| `skip_machining` | bool | opcional | `true`, `false` | `false` | Se `true`, peça NÃO recebe usinagem |
| `force_joint_type` | string | opcional | `"minifix"`, `"confirmat"`, `"cavilha"`, `"miter"` | herda do módulo | Override do tipo de junção |
| `is_visible_face` | string | opcional | `"front"`, `"top"`, `"bottom"`, `"left"`, `"right"`, `"rear"` | auto-detectado | Face visível ao cliente final |
| `obs` | string | opcional | qualquer | `""` | Observação livre (aparece no relatório) |

### 4.4 Ferragens específicas da peça (override do módulo)

Aplicar **apenas em portas/gavetas individuais**, sobrescreve o padrão do módulo:

| Variável | Tipo | Onde aplicar |
|----------|------|---|
| `dobradica_marca` | string | em peça `POR`, `POR_ESQ`, `POR_DIR` |
| `dobradica_modelo` | string | idem |
| `dobradica_angulo` | number | idem |
| `n_dobradicas` | number | idem (override automático: 2/3/4) |
| `corredica_marca` | string | em `GAV_FR` |
| `corredica_modelo` | string | idem |
| `corredica_extensao` | string | idem |
| `corredica_carga_kg` | number | idem |
| `puxador_modelo` | string | em `POR_*` ou `GAV_FR` |
| `puxador_pos_x` | number | mm da borda lateral |
| `puxador_pos_y` | number | mm da borda inferior, ou `"centro"` |
| `puxador_diametro` | number | override de diâmetro do furo |

### 4.5 Auto-preenchidos (não setar manualmente)

| Variável | Tipo | Quem preenche |
|----------|------|---|
| `peca_id` | string | Plugin |
| `modulo_id` | string | Plugin (referência ao módulo pai) |
| `dim_L_calc` | number | Plugin (largura calculada) |
| `dim_A_calc` | number | Plugin |
| `dim_esp_calc` | number | Plugin |
| `bbox_world` | object | Plugin (bounding box no espaço de mundo) |
| `bbox_local` | object | Plugin (bounding box local) |

---

## 5. Códigos de role aceitos (em `role` da peça)

### 5.1 Estrutura

| `role` | Equivalente nome do grupo | Recebe usinagem |
|--------|---|:-:|
| `lateral_esq` | `LAT_ESQ` | ✅ minifix + cavilha |
| `lateral_dir` | `LAT_DIR` | ✅ idem espelhado |
| `top` | `TOPO` | ✅ minifix + cavilha |
| `base` | `BASE` | ✅ idem |
| `back_panel` | `FUN` | ❌ (gera rasgo nas laterais) |
| `back_panel_screwed` | `FUN` (parafusado) | ✅ furos de parafuso |
| `divider_v` | `DIV_V` | ✅ cavilha |
| `divider_h` | `DIV_H` | ✅ cavilha |
| `panel_filler` | `TAM` | ❌ |
| `panel_decorative` | `PAI` | ❌ |
| `kickstrip` | `ROD` | ❌ |
| `support_brace` | `SUP` | ✅ cavilha simples |

### 5.2 Prateleiras

| `role` | Equivalente | Recebe usinagem |
|--------|---|:-:|
| `shelf_fixed` | `PRA` | ✅ cavilha |
| `shelf_adjustable` | `PRA_REG` | ❌ (gera S32 nas laterais) |

### 5.3 Portas

| `role` | Equivalente | Recebe usinagem |
|--------|---|:-:|
| `door` | `POR` | ✅ copa dobradiça + furo puxador |
| `door_left` | `POR_ESQ` | ✅ dobradiça à esquerda |
| `door_right` | `POR_DIR` | ✅ dobradiça à direita |
| `door_sliding` | `POR_COR` | ❌ (gera trilho no topo/base) |
| `door_flap` | `POR_BAS` | ✅ furos de pistão |
| `door_glass` | `POR_VID` | ❌ (gera canal de perfil) |

### 5.4 Gavetas

| `role` | Equivalente | Recebe usinagem |
|--------|---|:-:|
| `drawer_front` | `GAV_FR` | ✅ furo puxador |
| `drawer_side_left` | `GAV_LAT` (esq) | ✅ encaixe + rasgo fundo |
| `drawer_side_right` | `GAV_LAT` (dir) | ✅ idem espelhado |
| `drawer_back` | `GAV_TRA` | ✅ encaixe |
| `drawer_bottom` | `GAV_FUN` | ❌ (gera rasgo nas laterais da gaveta) |

### 5.5 Decorativos

| `role` | Equivalente | Recebe usinagem |
|--------|---|:-:|
| `molding` | `MOL` | ✅ chanfro 45° entre molduras |
| `cenefa` | `CEN` | ❌ |

---

## 6. Códigos de material aceitos (em `material`)

Padrão: `<TIPO>_<ESPESSURA>_<COR/PADRAO>` em maiúsculas separado por underscore.

### 6.1 MDF (mais comum)

| Código | Descrição |
|--------|---|
| `MDF_3_BRANCO` | MDF 3mm branco (fundo) |
| `MDF_6_BRANCO` | MDF 6mm branco |
| `MDF_15_BRANCO_TX` | MDF 15mm branco texturizado |
| `MDF_15_CARVALHO_NATURAL` | MDF 15mm carvalho |
| `MDF_18_BRANCO_TX` | MDF 18mm branco texturizado (Duratex) |
| `MDF_18_BRANCO_REAL` | MDF 18mm branco brilho (Eucatex) |
| `MDF_18_CARVALHO_NATURAL` | MDF 18mm carvalho |
| `MDF_18_PRETO_TX` | MDF 18mm preto texturizado |
| `MDF_18_NOGUEIRA` | MDF 18mm nogueira |
| `MDF_18_AREIA` | MDF 18mm areia |
| `MDF_25_BRANCO_TX` | MDF 25mm branco (chapa grossa) |

### 6.2 Vidros

| Código | Descrição |
|--------|---|
| `VID_4_TRANSP` | Vidro 4mm transparente |
| `VID_6_TRANSP` | Vidro 6mm transparente |
| `VID_8_TEMPERADO` | Vidro 8mm temperado |
| `VID_8_FUME` | Vidro 8mm fumê |
| `VID_8_JATEADO` | Vidro 8mm jateado |
| `VID_10_TEMPERADO` | Vidro 10mm temperado |

### 6.3 Metais

| Código | Descrição |
|--------|---|
| `MET_INOX_ESCOVADO` | Inox escovado |
| `MET_INOX_POLIDO` | Inox polido |
| `MET_ALU_ANODIZADO` | Alumínio anodizado |
| `MET_COBRE_ESCOVADO` | Cobre escovado |

### 6.4 Como cadastrar material novo

Materiais são gerenciados no **ERP Ornato** (`Cat.jsx`). O plugin sincroniza via `/api/catalogo/sync`. Códigos novos seguem o padrão acima.

---

## 7. Códigos de borda aceitos (em `borda_*`)

Padrão: `BOR_<ESPESSURA>x<LARGURA>_<COR>`

| Código | Descrição |
|--------|---|
| `none` | Sem fita de borda |
| `BOR_1x22_BR` | Fita 1mm × 22mm branca |
| `BOR_1x22_PR` | Fita 1mm × 22mm preta |
| `BOR_2x22_BR` | Fita 2mm × 22mm branca (mais comum) |
| `BOR_2x22_CV_NT` | Fita 2mm × 22mm carvalho natural |
| `BOR_2x22_CN_CR` | Fita 2mm × 22mm cinza cristal |
| `BOR_2x22_NG` | Fita 2mm × 22mm nogueira |
| `BOR_3x22_BR` | Fita 3mm × 22mm branca (espessura grande) |
| `BOR_2x42_BR` | Fita 2mm × 42mm branca (chapa 25mm+) |

> Sempre alinhar a cor da borda com a cor do material (`MDF_18_BRANCO_TX` + `BOR_2x22_BR`).
> Para porta de canto vista: `BOR_2x22_*` em todas as 4 bordas (4F).
> Para lateral interna: `BOR_1x22_*` apenas na borda visível (frente).

---

## 8. Códigos de ferragem aceitos

### 8.1 Dobradiças (`dobradica_modelo`)

| Código | Marca | Modelo | Ângulo | Soft-close |
|--------|-------|--------|:-:|:-:|
| `clip_top_blumotion` | Blum | Clip Top Blumotion | 110° | ✅ |
| `clip_top` | Blum | Clip Top | 110° | ❌ |
| `aventos_hf` | Blum | Aventos HF (basculante) | — | ✅ |
| `sensys` | Hettich | Sensys | 110° | ✅ |
| `sensys_8645i` | Hettich | Sensys 8645i (sem furo) | 110° | ✅ |
| `intermat` | Hettich | Intermat | 95° | ❌ |
| `mepla` | FGV | Mepla 35mm | 110° | ✅ |
| `caneco_35` | FGV | Caneco 35mm | 95° | ❌ |
| `metalla_a` | Hafele | Metalla A | 110° | ✅ |
| `tiomos` | Grass | Tiomos | 110° | ✅ |
| `push_to_open` | Blum | Tip-On | 110° | ✅ |

### 8.2 Corrediças (`corredica_modelo`)

| Código | Marca | Modelo | Carga | Extensão |
|--------|-------|--------|:-:|:-:|
| `tandem_500` | Blum | Tandem 500mm | 30kg | total |
| `tandem_box` | Blum | Tandembox | 40kg | total + soft-close |
| `actro_5d` | Hettich | Actro 5D | 40kg | total + 5D |
| `quadro_v6` | Hettich | Quadro V6 | 30kg | total |
| `telescopica_450` | FGV | Telescópica 450mm | 30kg | telescópica |
| `telescopica_500` | FGV | Telescópica 500mm | 30kg | telescópica |
| `metabox` | Blum | Metabox lateral | 25kg | telescópica |
| `legrabox` | Blum | Legrabox | 70kg | total + push |

### 8.3 Puxadores (`puxador_modelo`)

| Código | Tipo | Centros | Diâmetro furo |
|--------|------|:-:|:-:|
| `cava_black_128` | Cava preta alumínio | 128mm | 5mm |
| `cava_black_160` | Cava preta alumínio | 160mm | 5mm |
| `cava_black_192` | Cava preta alumínio | 192mm | 5mm |
| `alca_embutida_320` | Alça embutida linear | 320mm | 5mm |
| `botao_metalico_25` | Botão metálico Ø25mm | — | 4mm |
| `perfil_j_continuo` | Perfil J contínuo | — | — |
| `sem_puxador` | Sem puxador (push-to-open) | — | — |

### 8.4 Pés (`pe_modelo`)

| Código | Tipo | Altura padrão |
|--------|------|:-:|
| `cromado_100` | Cromado regulável | 100mm |
| `cromado_150` | Cromado regulável alto | 150mm |
| `plastico_100` | Plástico ABS | 100mm |
| `metalico_150` | Metálico industrial | 150mm |
| `sem_pe` | Móvel sem pé (apoio direto) | 0 |

---

## 9. Atributos de feature especial

### 9.1 Passa-fio

Aplicado em **peça** (lateral, fundo, prateleira):

| Variável | Tipo | Valores aceitos | Descrição |
|----------|------|---|---|
| `ornato_passafio` | bool | `true`/`false` | Liga/desliga feature |
| `ornato_passafio_diametro` | number | `35`, `60`, `80` | Diâmetro do furo (mm) |
| `ornato_passafio_x` | number | mm | Posição X do canto |
| `ornato_passafio_y` | number | mm | Posição Y do canto |
| `ornato_passafio_2` | bool | `true`/`false` | Segundo furo na mesma peça |
| `ornato_passafio_2_diametro` | number | `35`, `60`, `80` | |
| `ornato_passafio_2_x` | number | | |
| `ornato_passafio_2_y` | number | | |

### 9.2 Canal de LED

Aplicado em **peça** (geralmente prateleira ou lateral):

| Variável | Tipo | Valores aceitos | Descrição |
|----------|------|---|---|
| `ornato_led` | bool | `true`/`false` | Liga/desliga |
| `ornato_led_face` | string | `"front"`, `"top"`, `"bottom"`, `"left"`, `"right"`, `"rear"` | Face onde fresar o canal |
| `ornato_led_width` | number | `8`, `10`, `12` | Largura do canal (mm) |
| `ornato_led_depth` | number | 5–12 | Profundidade (mm) |
| `ornato_led_offset` | number | 0–100 | Distância da borda (mm) |
| `ornato_led_inicio` | number | mm | Onde começa o canal (default: 0) |
| `ornato_led_fim` | number | mm | Onde termina (default: comprimento total) |

### 9.3 Acabamento especial (chanfros, arredondamentos)

| Variável | Tipo | Valores aceitos | Descrição |
|----------|------|---|---|
| `ornato_chanfro` | bool | `true`/`false` | Aplica chanfro nas bordas |
| `ornato_chanfro_borda` | string | `"top"`, `"bottom"`, `"all"` | Quais bordas |
| `ornato_chanfro_angulo` | number | `30`, `45`, `60` | Ângulo (graus) |
| `ornato_chanfro_largura` | number | 2–10 | Largura do chanfro (mm) |
| `ornato_arredondamento` | bool | `true`/`false` | Arredondamento de borda |
| `ornato_arredondamento_raio` | number | 2–20 | Raio (mm) |

---

## 10. JSON paramétrico — schema completo

Todo módulo da galeria deve ter um JSON em `ornato-plugin/biblioteca/moveis/<categoria>/<codigo>.json`.

### 10.1 Schema raiz

```json
{
  "id": "ORN_BAL_001",
  "nome": "Balcão 2 portas",
  "categoria": "cozinha",
  "subcategoria": "balcao_inferior",
  "versao": "1.0.0",
  "descricao": "Balcão simples com 2 portas e 1 prateleira interna fixa",
  "thumbnail": "thumbnails/orn_bal_001.png",

  "parametros": {
    "L": { "label": "Largura",       "default": 800, "min": 400, "max": 1200, "step": 50 },
    "A": { "label": "Altura",        "default": 720, "min": 600, "max": 900,  "step": 10 },
    "P": { "label": "Profundidade",  "default": 560, "min": 350, "max": 650,  "step": 10 }
  },

  "materiais": {
    "caixa":      "MDF_18_BRANCO_TX",
    "frente":     "MDF_18_BRANCO_TX",
    "fundo":      "MDF_3_BRANCO",
    "prateleira": "MDF_15_BRANCO_TX"
  },

  "construtivo": {
    "joint_type": "minifix",
    "back_panel_type": "rasgo",
    "back_panel_thickness": 3,
    "espac_minifix": 300,
    "tolerancia_folga": 2
  },

  "ferragens_padrao": {
    "dobradica": {
      "marca": "Blum",
      "modelo": "clip_top_blumotion",
      "angulo": 110
    },
    "puxador": {
      "modelo": "cava_black_128",
      "pos": "horizontal",
      "offset": 30
    },
    "pe": {
      "modelo": "cromado_100",
      "altura": 100
    }
  },

  "pecas": [
    {
      "role": "lateral_esq",
      "label": "Lateral esquerda",
      "material": "{caixa}",
      "espessura": 18,
      "dimensoes": { "L": "{P}",     "A": "{A}-18", "esp": 18 },
      "posicao":   { "x": 0,         "y": 0,        "z": 18 },
      "bordas":    { "top": "BOR_2x22_BR", "bottom": "none", "left": "BOR_1x22_BR", "right": "none" },
      "grain_direction": "length"
    },
    {
      "role": "lateral_dir",
      "label": "Lateral direita",
      "material": "{caixa}",
      "espessura": 18,
      "dimensoes": { "L": "{P}",     "A": "{A}-18", "esp": 18 },
      "posicao":   { "x": "{L}-18",  "y": 0,        "z": 18 }
    }
    // ... outras peças
  ],

  "ferragens_auto": [
    { "tipo": "dobradica" },
    { "tipo": "puxador" },
    { "tipo": "corredica", "quando": "tem_gaveta" }
  ]
}
```

### 10.2 Sintaxe das expressões

Dentro de `dimensoes` e `posicao`, valores são **strings de expressão** que o `JsonModuleBuilder` avalia:

| Expressão | Significado |
|-----------|---|
| `"{L}"` | Substitui pelo valor do parâmetro L |
| `"{L}-18"` | L menos 18 |
| `"{L}-36"` | L menos 36 (largura interna entre 2 laterais de 18mm) |
| `"({L}-18)/2"` | Metade da largura interna |
| `"{A}/2 - 9"` | Metade da altura menos 9 |
| `"{P}-8"` | Profundidade menos 8 (recuo do fundo) |

> Operadores aceitos: `+`, `-`, `*`, `/`, `()`. Sem funções (sem `min`, `max`, `if`).

### 10.3 Materiais com placeholder

```json
"material": "{caixa}"   ← substitui pelo valor de materiais.caixa
"material": "{frente}"
"material": "{fundo}"
"material": "MDF_18_BRANCO_TX"  ← string literal
```

---

## 11. Exemplo zero-to-hero — Balcão 2 portas

Vamos criar **completo do zero** o módulo `ORN_BAL_001 Balcão 2 portas` (800 × 720 × 560).

### 11.1 Estrutura no SketchUp

```
ORN_BAL Balcão 2 portas 800mm   ← grupo MÓDULO
  ├── LAT_ESQ                    ← grupo PEÇA
  ├── LAT_DIR
  ├── BASE
  ├── TOPO
  ├── FUN
  ├── PRA
  ├── POR_ESQ
  └── POR_DIR
```

### 11.2 Posicionamento físico (cantos em coordenadas SketchUp)

> Origem (0,0,0) no canto inferior esquerdo frontal do módulo.

| Peça | Dim L (mm) | Dim A (mm) | Esp (mm) | Posição (x, y, z) |
|------|:-:|:-:|:-:|---|
| LAT_ESQ | 560 | 702 | 18 | (0, 0, 18) |
| LAT_DIR | 560 | 702 | 18 | (782, 0, 18) |
| BASE | 764 | 560 | 18 | (18, 0, 0) |
| TOPO | 764 | 560 | 18 | (18, 0, 720) |
| FUN | 764 | 702 | 3 | (18, 552, 18) ← recuado 8mm da borda traseira (560-3-5) |
| PRA | 760 | 555 | 15 | (18, 0, 360) ← centro vertical |
| POR_ESQ | 392 | 720 | 18 | (0, -18, 0) ← sobreposta à frente |
| POR_DIR | 392 | 720 | 18 | (408, -18, 0) ← sobreposta à frente |

### 11.3 Atributos do MÓDULO

```ruby
modulo = Sketchup.active_model.entities.find { |e| e.name.start_with?('ORN_BAL') }

# Identificação
modulo.set_attribute('Ornato', 'tipo', 'modulo')
modulo.set_attribute('Ornato', 'categoria', 'cozinha')
modulo.set_attribute('Ornato', 'nome', 'Balcão 2 portas')
modulo.set_attribute('Ornato', 'codigo', 'ORN_BAL_001')
modulo.set_attribute('Ornato', 'versao', '1.0.0')

# Dimensões
modulo.set_attribute('Ornato', 'dim_L', 800)
modulo.set_attribute('Ornato', 'dim_A', 720)
modulo.set_attribute('Ornato', 'dim_P', 560)
modulo.set_attribute('Ornato', 'dim_L_min', 400)
modulo.set_attribute('Ornato', 'dim_L_max', 1200)
modulo.set_attribute('Ornato', 'dim_step', 50)

# Materiais
modulo.set_attribute('Ornato', 'mat_caixa',      'MDF_18_BRANCO_TX')
modulo.set_attribute('Ornato', 'mat_frente',     'MDF_18_BRANCO_TX')
modulo.set_attribute('Ornato', 'mat_fundo',      'MDF_3_BRANCO')
modulo.set_attribute('Ornato', 'mat_prateleira', 'MDF_15_BRANCO_TX')

# Construtivo
modulo.set_attribute('Ornato', 'joint_type',           'minifix')
modulo.set_attribute('Ornato', 'back_panel_type',      'rasgo')
modulo.set_attribute('Ornato', 'back_panel_thickness', 3)
modulo.set_attribute('Ornato', 'espac_minifix',        300)

# Ferragens
modulo.set_attribute('Ornato', 'dobradica_marca',  'Blum')
modulo.set_attribute('Ornato', 'dobradica_modelo', 'clip_top_blumotion')
modulo.set_attribute('Ornato', 'dobradica_angulo', 110)
modulo.set_attribute('Ornato', 'puxador_modelo',   'cava_black_128')
modulo.set_attribute('Ornato', 'puxador_pos',      'horizontal')
modulo.set_attribute('Ornato', 'puxador_offset',   30)
modulo.set_attribute('Ornato', 'pe_modelo',        'cromado_100')
modulo.set_attribute('Ornato', 'pe_altura',        100)
```

### 11.4 Atributos das PEÇAS (loop helper)

```ruby
def stamp_piece(group, role, espessura, material, bordas = {})
  group.set_attribute('Ornato', 'tipo',      'peca')
  group.set_attribute('Ornato', 'role',      role)
  group.set_attribute('Ornato', 'material',  material)
  group.set_attribute('Ornato', 'espessura', espessura)
  group.set_attribute('Ornato', 'borda_top',    bordas[:top]    || 'none')
  group.set_attribute('Ornato', 'borda_bottom', bordas[:bottom] || 'none')
  group.set_attribute('Ornato', 'borda_left',   bordas[:left]   || 'none')
  group.set_attribute('Ornato', 'borda_right',  bordas[:right]  || 'none')
end

# LAT_ESQ — fita só na borda frontal (que aparece)
lat_esq = modulo.entities.find { |e| e.name == 'LAT_ESQ' }
stamp_piece(lat_esq, 'lateral_esq', 18, 'MDF_18_BRANCO_TX',
  left: 'BOR_2x22_BR', right: 'none', top: 'BOR_1x22_BR', bottom: 'none')

# LAT_DIR — espelhado
lat_dir = modulo.entities.find { |e| e.name == 'LAT_DIR' }
stamp_piece(lat_dir, 'lateral_dir', 18, 'MDF_18_BRANCO_TX',
  right: 'BOR_2x22_BR', left: 'none', top: 'BOR_1x22_BR', bottom: 'none')

# BASE — fita só na borda frontal
base = modulo.entities.find { |e| e.name == 'BASE' }
stamp_piece(base, 'base', 18, 'MDF_18_BRANCO_TX',
  top: 'BOR_2x22_BR')

# TOPO — fita na borda frontal
topo = modulo.entities.find { |e| e.name == 'TOPO' }
stamp_piece(topo, 'top', 18, 'MDF_18_BRANCO_TX',
  top: 'BOR_2x22_BR')

# FUN — fundo, sem fita
fun = modulo.entities.find { |e| e.name == 'FUN' }
stamp_piece(fun, 'back_panel', 3, 'MDF_3_BRANCO')

# PRA — prateleira fixa, fita frontal
pra = modulo.entities.find { |e| e.name == 'PRA' }
stamp_piece(pra, 'shelf_fixed', 15, 'MDF_15_BRANCO_TX',
  top: 'BOR_1x22_BR')

# POR_ESQ — porta esquerda com fita 4F (todas bordas visíveis)
por_esq = modulo.entities.find { |e| e.name == 'POR_ESQ' }
stamp_piece(por_esq, 'door_left', 18, 'MDF_18_BRANCO_TX',
  top: 'BOR_2x22_BR', bottom: 'BOR_2x22_BR',
  left: 'BOR_2x22_BR', right: 'BOR_2x22_BR')

# POR_DIR — porta direita com fita 4F
por_dir = modulo.entities.find { |e| e.name == 'POR_DIR' }
stamp_piece(por_dir, 'door_right', 18, 'MDF_18_BRANCO_TX',
  top: 'BOR_2x22_BR', bottom: 'BOR_2x22_BR',
  left: 'BOR_2x22_BR', right: 'BOR_2x22_BR')
```

### 11.5 JSON paramétrico equivalente

```json
{
  "id": "ORN_BAL_001",
  "nome": "Balcão 2 portas",
  "categoria": "cozinha",
  "subcategoria": "balcao_inferior",
  "versao": "1.0.0",
  "thumbnail": "thumbnails/orn_bal_001.png",

  "parametros": {
    "L": { "label": "Largura",      "default": 800, "min": 400, "max": 1200, "step": 50 },
    "A": { "label": "Altura",       "default": 720, "min": 600, "max": 900,  "step": 10 },
    "P": { "label": "Profundidade", "default": 560, "min": 350, "max": 650,  "step": 10 }
  },

  "materiais": {
    "caixa":      "MDF_18_BRANCO_TX",
    "frente":     "MDF_18_BRANCO_TX",
    "fundo":      "MDF_3_BRANCO",
    "prateleira": "MDF_15_BRANCO_TX"
  },

  "construtivo": {
    "joint_type": "minifix",
    "back_panel_type": "rasgo",
    "back_panel_thickness": 3,
    "espac_minifix": 300
  },

  "ferragens_padrao": {
    "dobradica": { "marca": "Blum", "modelo": "clip_top_blumotion", "angulo": 110 },
    "puxador":   { "modelo": "cava_black_128", "pos": "horizontal", "offset": 30 },
    "pe":        { "modelo": "cromado_100", "altura": 100 }
  },

  "pecas": [
    {
      "nome": "LAT_ESQ", "role": "lateral_esq", "material": "{caixa}", "espessura": 18,
      "dimensoes": { "L": "{P}",      "A": "{A}-18", "esp": 18 },
      "posicao":   { "x": 0,          "y": 0,        "z": 18 },
      "bordas":    { "top": "BOR_1x22_BR", "left": "BOR_2x22_BR" }
    },
    {
      "nome": "LAT_DIR", "role": "lateral_dir", "material": "{caixa}", "espessura": 18,
      "dimensoes": { "L": "{P}",      "A": "{A}-18", "esp": 18 },
      "posicao":   { "x": "{L}-18",   "y": 0,        "z": 18 },
      "bordas":    { "top": "BOR_1x22_BR", "right": "BOR_2x22_BR" }
    },
    {
      "nome": "BASE", "role": "base", "material": "{caixa}", "espessura": 18,
      "dimensoes": { "L": "{L}-36",   "A": "{P}",    "esp": 18 },
      "posicao":   { "x": 18,         "y": 0,        "z": 0 },
      "bordas":    { "top": "BOR_2x22_BR" }
    },
    {
      "nome": "TOPO", "role": "top", "material": "{caixa}", "espessura": 18,
      "dimensoes": { "L": "{L}-36",   "A": "{P}",    "esp": 18 },
      "posicao":   { "x": 18,         "y": 0,        "z": "{A}-18" },
      "bordas":    { "top": "BOR_2x22_BR" }
    },
    {
      "nome": "FUN", "role": "back_panel", "material": "{fundo}", "espessura": 3,
      "dimensoes": { "L": "{L}-36",   "A": "{A}-18", "esp": 3 },
      "posicao":   { "x": 18,         "y": "{P}-8",  "z": 18 }
    },
    {
      "nome": "PRA", "role": "shelf_fixed", "material": "{prateleira}", "espessura": 15,
      "dimensoes": { "L": "{L}-40",   "A": "{P}-5",  "esp": 15 },
      "posicao":   { "x": 20,         "y": 0,        "z": "{A}/2 - 9" },
      "bordas":    { "top": "BOR_1x22_BR" }
    },
    {
      "nome": "POR_ESQ", "role": "door_left", "material": "{frente}", "espessura": 18,
      "dimensoes": { "L": "({L}-2)/2", "A": "{A}",   "esp": 18 },
      "posicao":   { "x": 0,           "y": -18,     "z": 0 },
      "bordas":    { "top": "BOR_2x22_BR", "bottom": "BOR_2x22_BR", "left": "BOR_2x22_BR", "right": "BOR_2x22_BR" }
    },
    {
      "nome": "POR_DIR", "role": "door_right", "material": "{frente}", "espessura": 18,
      "dimensoes": { "L": "({L}-2)/2", "A": "{A}",   "esp": 18 },
      "posicao":   { "x": "({L}+2)/2", "y": -18,     "z": 0 },
      "bordas":    { "top": "BOR_2x22_BR", "bottom": "BOR_2x22_BR", "left": "BOR_2x22_BR", "right": "BOR_2x22_BR" }
    }
  ],

  "ferragens_auto": [
    { "tipo": "dobradica" },
    { "tipo": "puxador" }
  ]
}
```

### 11.6 O que o plugin gera automaticamente (você não precisa fazer)

Após salvar, o plugin **gera por colisão**:

| Em qual peça | Operação | Detalhe |
|--------------|----------|---|
| LAT_ESQ (face top) | `f_15mm_minifix` × 3 | Encaixe com BASE: 50mm + 350mm + 670mm |
| LAT_ESQ (face top) | `f_15mm_minifix` × 3 | Encaixe com TOPO (parte de cima) |
| LAT_ESQ (face front) | `f_8mm_cavilha` × 6 | Cavilhas alinhadas com PRA |
| LAT_ESQ (face top) | `r_f` | Rasgo de fundo (3.2mm × 8mm prof) |
| LAT_ESQ (face front, top) | `f_dob_base` × 2 | Base de dobradiça da POR_ESQ |
| LAT_DIR | tudo espelhado | |
| BASE (face left/right) | `p_8mm_eixo_minifix` × 6 | Parafuso minifix |
| TOPO | idem BASE | |
| PRA (face left/right) | `f_8mm_cavilha` × 4 | 2 cavilhas de cada lado |
| POR_ESQ (face top) | `f_35mm_dob` × 2 | Copas dobradiça (100mm + 100mm das bordas) |
| POR_ESQ (face front) | `f_puxador` × 2 | Furos puxador cava 128mm |
| POR_DIR | espelhado | |

**Nada disso você desenha. O plugin calcula tudo a partir das colisões.**

---

## 12. Cheat sheet 1 página

> Se você só pode olhar uma página, é essa.

### Hierarquia
```
ORN_<TIPO> Nome livre        ← MÓDULO (grupo)
  ├── LAT_ESQ                 ← PEÇA (grupo retangular 6 faces)
  ├── BASE
  ├── ...
```

### Atributos mínimos do MÓDULO
```
tipo='modulo' · categoria='cozinha' · nome='...' · codigo='ORN_BAL_001'
dim_L=800 · dim_A=720 · dim_P=560
mat_caixa='MDF_18_BRANCO_TX' · mat_frente='...' · mat_fundo='MDF_3_BRANCO'
joint_type='minifix' · back_panel_type='rasgo' · back_panel_thickness=3
dobradica_modelo='clip_top_blumotion' · puxador_modelo='cava_black_128'
```

### Atributos mínimos da PEÇA
```
tipo='peca' · role='lateral_esq' · material='MDF_18_BRANCO_TX' · espessura=18
borda_top='BOR_2x22_BR' · borda_bottom='none' · borda_left='BOR_2x22_BR' · borda_right='none'
```

### Roles principais (guarda essa)
```
ESTRUTURA   lateral_esq · lateral_dir · top · base · back_panel · divider_v · shelf_fixed
PORTAS      door_left · door_right · door_sliding · door_flap · door_glass
GAVETAS     drawer_front · drawer_side_left · drawer_side_right · drawer_back · drawer_bottom
PRATELEIRA  shelf_fixed (PRA) · shelf_adjustable (PRA_REG)
```

### Posicionamento (regra de ouro)
```
GAP ZERO          ← junção apertada (BUTT) → minifix + cavilha
RECUO 8mm         ← rasgo de fundo (DADO) → r_f
SOBREPOSIÇÃO      ← porta sobre lateral (OVERLAY) → dobradiça
```

### Materiais mais usados
```
MDF_18_BRANCO_TX           caixa padrão
MDF_18_CARVALHO_NATURAL    caixa amadeirada
MDF_3_BRANCO               fundo padrão
MDF_15_BRANCO_TX           prateleira
VID_8_FUME                 porta de vidro
```

### Bordas mais usadas
```
BOR_2x22_BR    fita branca padrão (caixa e portas)
BOR_1x22_BR    fita branca fina (laterais internas)
BOR_2x22_CV_NT fita carvalho (combinar com material)
none           sem fita
```

### Ferragens padrão
```
dobradica:    Blum clip_top_blumotion 110°  (60% dos casos)
corredica:    Blum tandem_500 30kg total    (gavetas padrão)
puxador:      cava_black_128                (cozinhas modernas)
pe:           cromado_100                   (ajustável)
```

### Validar antes de salvar
```
1. Plugin → Tab Validação → "Validar projeto" (sem erros vermelhos)
2. Plugin → Tab Usinagens → "Visualizar furação" (ghost no 3D)
3. Plugin → Tab Produção → "Exportar UPM JSON" → conferir 100% campos
4. Salvar JSON em ornato-plugin/biblioteca/moveis/<categoria>/<codigo>.json
```

---

*Documento criado mai/2026 · Versão 1.0 · Atualizar quando: novos roles · novas ferragens · novos materiais.*
