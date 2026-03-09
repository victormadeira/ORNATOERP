# Especificacao Funcional — CNC Optimizer Ornato

## 1. Visao Geral

Sistema de otimizacao de corte para CNC router que recebe pecas 2D com operacoes
de usinagem e chapas (novas, sobras, organicas) e produz:
- Layout otimizado (nesting)
- Plano de corte com precedencia tecnica
- Simulacao de estabilidade por vacuo
- Sugestao de tabs e onion skin
- G-code pronto para producao
- JSON tecnico para integracao

## 2. Entradas

### 2.1 Pecas
- **Origem**: JSON exportado pelo plugin Ornato SketchUp
- **Formato**: 3 secoes (`model_entities`, `details_project`, `machining`)
- **Geometria**: Retangulares (maioria) ou irregulares (contorno com segmentos line/arc)
- **Contorno**: `outer` (lista de segmentos) + `holes` (circulos ou poligonos)
- **Usinagem**: Workers com category, tool, face, side (A/B), x, y, depth
- **Quantidade**: 1-N instancias por peca

### 2.2 Chapas
- **Tipos**: Nova (retangular padrao), Remanescente (retangular), Organica (contorno irregular)
- **Dimensoes padrao**: 2750 x 1850 mm
- **Refilo**: Margem removida em todas as 4 bordas (padrao 10mm)
- **Veio**: sem_veio, horizontal, vertical
- **Kerf**: Largura do disco (padrao 4mm)

### 2.3 Maquina CNC
- Postprocessador G-code completo (header, footer, Z-origin, velocidades)
- Magazine de ferramentas (codigo, diametro, DOC, RPM, velocidade)
- Config tabs/onion skin/lead-in/rampa

## 3. Saidas

### 3.1 Layout Otimizado
- Posicao (x, y) e rotacao de cada peca em cada chapa
- Aproveitamento por chapa e medio
- Retalhos aproveitaveis identificados

### 3.2 Plano de Corte
- Sequencia de operacoes com precedencia tecnica
- Agrupamento por ferramenta
- Otimizacao de deslocamento vazio

### 3.3 G-code
- Multi-pass DOC automatico
- Contornos complexos (G2/G3 para arcos)
- Lead-in/lead-out
- Rampa de entrada
- Onion skin e tabs
- Separacao por fases (internos -> contornos -> retalhos)

### 3.4 JSON Tecnico
- Placements com coordenadas absolutas
- Operacoes com ferramentas
- Scores detalhados
- Recomendacoes de vacuo

### 3.5 SVG Visual
- Layout colorido por modulo
- Pecas com dimensoes
- Retalhos hachurados
- Zonas de refilo

## 4. Regras de Negocio

### 4.1 Materiais e Espessuras

| Nominal (mm) | Real (mm) |
|-------------|-----------|
| 6 | 6.0 |
| 9 | 9.0 |
| 12 | 12.0 |
| 15 | 15.5 |
| 18 | 18.5 |
| 20 | 20.5 |
| 25 | 25.5 |
| engrossado | 31.0 |

Codigo material: `MDF_{espessura_real}_{ACABAMENTO}` (ex: `MDF_18.5_BRANCO_TX`)

### 4.2 Veio (Direcao de Fibra)

| Veio | Rotacao Permitida | Descricao |
|------|-------------------|-----------|
| sem_veio | 0, 90, 180, 270 | Rotacao livre |
| horizontal | 0, 180 | Veio alinhado com comprimento da chapa |
| vertical | 0, 180 | Veio alinhado com largura da chapa |

Inferido do codigo `upmdraw`:
- FTE1x2, FTD1x2 → frente (lateral)
- FTED1x3, FT1x3 → topo/base
- F2x1, E2x1 → prateleira/divisoria
- FTED2x1 → porta
- 2x1 → fundo/traseira

### 4.3 Rotacao Inteligente

Para pecas sem veio, a rotacao considera (pesos configuraveis):
- **Encaixe** (0.25): Melhoria no aproveitamento
- **Compactacao** (0.20): Espaco livre fragmentado vs compacto
- **Suporte vacuo** (0.20): Area sobre zonas de vacuo
- **Estabilidade de corte** (0.15): Eixo longo alinhado com chapa
- **Reducao deslocamento** (0.10): Menos G0 entre operacoes
- **Acesso usinagem** (0.10): Ferramentas alcancam operacoes

Deduplicacao:
- Peca quadrada (W == H): [0, 90] apenas
- Peca simetrica 180: elimina rotacao 180

### 4.4 Face A/B de Usinagem

Workers podem ter campo `side`: `side_a` ou `side_b`.
Maquina tem flags `exportar_lado_a`, `exportar_lado_b`.

Regras de selecao da face principal:
1. Se apenas uma face tem usinagem → essa face
2. Se ambas: face com MAIS operacoes vira principal
3. Empate: face com MAIOR complexidade (mais depth, mais area removida)
4. Empate final: face mais estavel para referenciamento
5. Se precisa 2 setups → marcar explicitamente `requires_flip = true`

### 4.5 Fita de Borda

Formato codigo: `CMBOR{largura}x045{ACABAMENTO}`

| Espessura nominal | Largura fita |
|-------------------|-------------|
| 6mm | 10mm |
| 9mm | 13mm |
| 12mm | 16mm |
| 15mm | 19mm |
| 18mm | 22mm |
| 25mm | 29mm |

Tipos acabamento fita:
- Nenhum: ""
- 1C: 1 comprimento
- 1L: 1 largura
- 1C+1L: 1 comprimento + 1 largura
- 2C: 2 comprimentos
- 2C+1L: 2 comprimentos + 1 largura
- 4Lados: todas as 4 bordas

### 4.6 Precedencia de Operacoes

Ordem obrigatoria:
1. Furos (drilling) — holes e dowels
2. Pockets — caneco dobradica, almofadada
3. Rasgos — canal de fundo, veneziana
4. Contornos internos — cutouts, vazados
5. Contorno externo da peca
6. Contornos de retalho (sobra recortada)

Dentro de cada fase:
- Agrupar por ferramenta (minimizar troca de tool)
- Ordenar por proximidade (nearest-neighbor TSP)
- Pecas pequenas por ultimo (preservar vacuo)

### 4.7 Estabilidade por Vacuo

Modelo simplificado: campo continuo com decay linear do centro para bordas.
- Centro da chapa: forca = 1.0
- Bordas: forca = 0.3

Risco = 0.6 * risco_area + 0.4 * risco_borda

Classificacao:
- LOW: risco < 0.3
- MEDIUM: 0.3 - 0.7
- HIGH: 0.7 - 0.9
- CRITICAL: > 0.9

Acoes automaticas:
- CRITICAL antes do corte → sugerir reordenar, tabs ou onion skin
- Peca area < 500cm² → candidata a onion skin
- Peca area < 800cm² → candidata a tabs

### 4.8 Tabs

- Largura padrao: 4mm
- Altura padrao: 1.5mm
- Quantidade: 2-4 por peca (baseado no perimetro)
- Posicao: distribuida uniformemente, evitando cantos
- Nao usar tabs quando onion skin esta ativo

### 4.9 Onion Skin

- Espessura padrao: 0.5mm
- Area maxima para usar: 500cm² (configuravel)
- Passe normal: profundidade total - espessura onion
- Passe breakthrough: profundidade total, velocidade 60%

### 4.10 Retalhos (Sobras)

Dimensoes minimas para considerar retalho aproveitavel:
- Largura >= 300mm
- Comprimento >= 600mm

Score de valor:
- Area normalizada (vs chapa padrao)
- Retangularidade (bbox_area / polygon_area)
- Fragmentacao (regioes desconectadas)

Decisao sobra vs chapa nova:
- Usar sobra se aproveitamento projetado > 50%
- E se sobra cobre > 30% da area total das pecas restantes

### 4.11 Ferramentas CNC

| Codigo | Descricao | Diametro |
|--------|-----------|----------|
| f_15mm_tambor_min | Minifix drum (face) | 15mm |
| f_35mm_dob | Caneco dobradica | 35mm |
| f_5mm_twister243 | Shelf pin / minifix edge | 5mm |
| f_8mm_eixo_tambor_min | Minifix body (edge) | 8mm |
| f_8mm_cavilha | Cavilha | 8mm |
| f_3mm | Broca 3mm | 3mm |
| p_3mm | Pocket 3mm | 3mm |
| r_f | Serra de rasgo | variavel |

### 4.12 Codigos de Peca (upmcode)

| Codigo | Peca |
|--------|------|
| CM_LAT_DIR / CM_LAT_ESQ | Lateral direita/esquerda |
| CM_BAS | Base / Topo / Tampo |
| CM_FUN_VER / CM_FUN_HOR | Fundo vertical/horizontal |
| CM_REG | Regua / Regua pe |
| CM_PRA | Prateleira |
| CM_DIV | Divisoria |
| CM_TRG | Traseira |
| CM_POR_LIS | Porta (todos tipos) |
| CM_LEG / CM_LDG | Gaveta lateral esq/dir |
| CM_FUN_GAV_VER | Gaveta fundo |
| CM_CHGAV | Gaveta chapa |
| CM_CFG | Gaveta contra-frente |
| CM_FRE_GAV_LIS | Gaveta frente |
| CM_PCA | Peca generica |

## 5. Casos de Uso

### UC01: Otimizar lote simples
1. Importar JSON do SketchUp (10-50 pecas retangulares)
2. Sistema agrupa por material + espessura
3. Sistema otimiza nesting (GA + heuristicas)
4. Sistema gera plano de corte com precedencia
5. Sistema simula vacuo
6. Sistema gera G-code
7. Operador recebe: layout visual + G-code + etiquetas

### UC02: Otimizar com pecas organicas
1. Importar JSON com tampos organicos (arcos, formas irregulares)
2. Sistema constroi poligonos a partir do contorno
3. Sistema usa NFP para nesting de formas irregulares
4. Pecas irregulares + retangulares na mesma chapa
5. G-code com contornos G2/G3 para arcos

### UC03: Usar retalhos
1. Sistema verifica estoque de retalhos do material
2. Tenta encaixar pecas em retalhos antes de abrir chapa nova
3. Se aproveitamento do retalho > 50%, usa retalho
4. Retalho usado → marcado como indisponivel

### UC04: Otimizacao multi-lote
1. Combinar pecas de 2+ lotes no mesmo material
2. Otimizar juntos para maximizar aproveitamento
3. Rastrear qual peca pertence a qual lote

### UC05: Face A/B
1. Peca tem usinagem em ambas as faces
2. Sistema identifica face principal (mais operacoes)
3. G-code gerado para face A primeiro
4. Sistema marca `requires_flip = true`
5. Operador vira chapa e roda G-code face B

## 6. Criterios de Aceite

O sistema sera considerado pronto quando:
- [ ] Encaixar pecas em sobra organica com contorno irregular
- [ ] Respeitar furos e defeitos na chapa
- [ ] Girar pecas lisas de forma inteligente (score multi-criterio)
- [ ] Preservar orientacao de pecas com veio
- [ ] Escolher lado principal de usinagem corretamente
- [ ] Reduzir risco de arrasto (simulacao vacuo)
- [ ] Deixar pecas pequenas para o final quando possivel
- [ ] Sugerir retencao adicional (tabs/onion) quando necessario
- [ ] Exportar resultado legivel e util (JSON + SVG + G-code)
- [ ] Aproveitamento >= motor JS para pecas retangulares
- [ ] Zero alertas CRITICAL com config padrao
- [ ] 50 pecas otimizadas em < 30 segundos
