# Pipeline Principal — CNC Optimizer Ornato

## Fluxo Geral

```
JSON SketchUp ──→ IMPORT ──→ PARSE ──→ GEOMETRY ──→ ROTATION/FACE
                                                         │
                   ┌─────────────────────────────────────┘
                   ▼
              NESTING ──→ SCORE ──→ OPTIMIZE (GA) ──→ CUTTING PLAN
                                                          │
                   ┌──────────────────────────────────────┘
                   ▼
            VACUUM SIM ──→ TABS/ONION ──→ EXPORT (JSON + SVG + G-code)
```

## Detalhamento por Etapa

### 1. IMPORT
- Recebe JSON do SketchUp (3 secoes)
- Ou recebe batch_id para ler do banco (via Express API)
- Input: JSON raw ou batch_id
- Output: JSON estruturado

### 2. PARSE
- Extrair pecas de `model_entities` (hierarquia modulo → peca → sub-entidades)
- Extrair workers de `machining` (keyed by persistent_id)
- Extrair contornos (segmentos line/arc, holes circle/polygon)
- Inferir material, espessura, veio, bordas
- Input: JSON estruturado
- Output: list[Piece], detalhes projeto

### 3. GEOMETRY BUILD
- Converter contornos SketchUp → Shapely Polygons
- Discretizar arcos em polilinhas
- Validar e corrigir poligonos (auto-intersecoes, orientacao)
- Construir poligonos de chapas (retangulares e organicas)
- Calcular areas, perimetros, bounding boxes
- Input: Pecas com contorno raw
- Output: Pecas com poligonos Shapely validos

### 4. ROTATION & FACE
- Determinar rotacoes permitidas por peca (veio, textura, simetria)
- Construir perfil de usinagem por face (A e B)
- Selecionar face principal de usinagem
- Input: Pecas com geometria e workers
- Output: Pecas com rotation_policy, face_up, FaceMachiningProfile

### 5. NESTING (Placement)
- Agrupar pecas por material_code + espessura
- Para cada grupo:
  a. Tentar retalhos disponiveis primeiro
  b. Para cada estrategia de ordenacao (15+):
     - Para cada peca na ordem:
       - Gerar pontos candidatos (NFP para irregular, MaxRects para retangular)
       - Testar todas rotacoes permitidas
       - Escolher melhor posicao (score local)
     - Avaliar layout resultante
  c. Manter melhores layouts candidatos
- Input: Pecas com geometria + rotation_policy, Chapas, Retalhos
- Output: list[CandidateLayout] com placements

### 6. SCORE
- Avaliar cada layout candidato com score multi-objetivo:
  - Aproveitamento (30%)
  - Quantidade chapas (25%)
  - Compactacao (10%)
  - Deslocamento vazio (10%)
  - Suporte vacuo (10%)
  - Qualidade rotacao (5%)
  - Valor sobra (5%)
  - Selecao face (5%)
- Input: CandidateLayout
- Output: LayoutScore (total + detalhado por componente)

### 7. OPTIMIZE (GA)
- Algoritmo Genetico (BRKGA):
  - Cromossomo: ordem + rotacao + chapa + heuristica
  - Populacao: 50-200
  - Geracoes: 100-500
  - Fitness: Score (fase 6) + penalidades vacuo
  - Tier 1 (rapido): score basico para todos
  - Tier 2 (completo): vacuo + corte para top 20%
- Tambem roda Ruin & Recreate como alternativa
- Compara com heuristica inicial
- Input: Pecas, Chapas, Config
- Output: Melhor LayoutResult

### 8. CUTTING PLAN
- Coletar operacoes de cada peca posicionada
- Transformar coordenadas locais → absolutas (rotacao + offset)
- Construir grafo de precedencia (DAG):
  furos → pockets → rasgos → internos → contorno externo → retalhos
- Agrupar por ferramenta
- Otimizar rota (nearest-neighbor TSP + 2-opt)
- Input: LayoutResult com placements + machining data
- Output: CuttingPlan (lista ordenada de operacoes)

### 9. VACUUM SIMULATION
- Simular corte progressivo:
  a. Para cada operacao de contorno na sequencia:
     - "Cortar" peca da chapa restante (Shapely difference)
     - Recalcular suporte vacuo de pecas restantes
     - Classificar risco: LOW/MEDIUM/HIGH/CRITICAL
  b. Se alguma peca atinge CRITICAL:
     - Sugerir reordenar
     - Sugerir tabs
     - Sugerir onion skin
- Input: CuttingPlan + Layout
- Output: VacuumSimResult (risco por peca, sugestoes)

### 10. TABS & ONION SKIN
- Baseado em resultado do vacuo:
  - Pecas area < onion_max_area → onion skin
  - Pecas area < tab_max_area e sem onion → tabs
- Posicionar tabs no perimetro (espaçados, longe de cantos)
- Calcular profundidade onion (total - espessura)
- Input: VacuumSimResult + CuttingPlan
- Output: CuttingPlan atualizado com tabs/onion

### 11. EXPORT
- **JSON tecnico**: Placements, operacoes, scores, vacuo, config
- **SVG visual**: Layout colorido, pecas rotuladas, retalhos, refilo
- **G-code**: Programa CNC completo por chapa:
  - Header maquina
  - Fase 0: operacoes internas (furos, pockets, rasgos)
  - Fase 1: contornos de pecas (com tabs/onion)
  - Fase 1.5: breakthrough onion skin
  - Fase 2: contornos de retalhos
  - Footer maquina
- Input: Layout + CuttingPlan + VacuumSim + MachineConfig
- Output: GcodeResult + JSON + SVG

## Integracao com Ornato ERP

```
                    ┌──────────────────────────┐
                    │   React Frontend (5173)   │
                    │   Industrializacao.jsx     │
                    └─────────┬────────────────┘
                              │ REST
                    ┌─────────▼────────────────┐
                    │   Express API (3001)       │
                    │   cnc.js (proxy)           │
                    │   CRUD: lotes, pecas,      │
                    │   chapas, retalhos          │
                    └─────────┬────────────────┘
                              │ REST (proxy)
                    ┌─────────▼────────────────┐
                    │   Python FastAPI (8000)    │
                    │   CNC Optimizer            │
                    │   Nesting + G-code +       │
                    │   Vacuo + Score             │
                    └──────────────────────────┘
```

Express continua gerenciando CRUD e autenticacao.
Python faz o trabalho pesado de otimizacao e geracao de G-code.
React pode chamar Python diretamente para visualizacoes.
