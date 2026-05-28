# PLANO MAESTRO — CNC Engine v3.0
## Do Otimizador Básico ao Equivalente de $100k

**Data:** 2026-05-13  
**Escopo:** Redesign completo do módulo CNC — nesting, simulação e geração de G-code  
**Meta:** Produto tecnicamente comparável a LaCut + HOMAG intelliDivide + simulação profissional

---

## 1. Por Que Podemos Valer $100k

O valor de softwares como HOMAG Cut Rite ($15k–$50k), SigmaNEST ($30k–$80k) ou VERICUT ($80k+) vem de:

| Componente de Valor | % do Preço | O que representa |
|---------------------|-----------|------------------|
| Algoritmo maduro (40+ anos de tuning) | 30% | 4–8% mais aproveitamento de material |
| Integração com hardware real (50+ máquinas) | 25% | Post-processadores validados, sem bugs destrutivos |
| Grain direction + grain matching | 15% | Feature sem equivalente em open-source |
| Rest sheet morphing | 10% | Retalho vira ativo, não lixo |
| SLA industrial + suporte | 10% | Fábrica não para por software |
| Compliance/documentação ISO | 10% | Auditabilidade de processo |

**Nossa vantagem estrutural que eles não têm:**  
Integração nativa `pedido → BOM → nesting → G-code → produção` num único fluxo. O cliente não precisa de 3 softwares separados (ERP + nesting + CAM). Isso por si só vale R$800–R$2k/mês que o cliente pagaria de assinaturas separadas.

**ROI direto para o cliente:**  
Marcenaria consumindo R$3.000/mês em MDF/aglomerado + R$2.000 em compensado:
- Melhoria de aproveitamento de 82% → 91% (NFP vs bounding-box): economia de R$450/mês  
- Eliminação de 2h/dia de setup de nesting manual: R$1.200/mês (R$30/hora)
- Eliminação de 3 erros/mês de operação (fresa errada, profundidade errada): R$600/mês  
- **Total:** R$2.250/mês de economia = **R$27.000/ano**  
- Software que justificaria R$2.000–R$3.000/mês ou R$80.000–R$150.000 de licença perpétua

---

## 2. Gap Analysis: Onde Estamos vs Melhores do Mundo

### 2.1 Nesting/Otimizador

| Feature | Ornato Atual | LaCut | Corte Certo | HOMAG intelliDivide |
|---------|:---:|:---:|:---:|:---:|
| Otimização retangular | ✅ | ✅ | ✅ | ✅ |
| True-shape nesting (NFP) | ❌ | ✅ | ❌ | ✅ |
| Grain direction (restrição de fio) | ❌ | ⚠️ | ⚠️ | ✅ |
| Grain matching por conjunto | ❌ | ❌ | ❌ | ✅ |
| Rest sheet management real | ⚠️ (score) | ✅ | ✅ | ✅ avançado |
| Part-in-part nesting | ❌ | ⚠️ | ❌ | ✅ |
| Multi-pedido batch | ❌ | ✅ | ❌ | ✅ |
| Priority rules por peça | ❌ | ⚠️ | ❌ | ✅ |
| Common-line cutting | ❌ | ❌ | ❌ | ✅ |
| Bridge nesting (micropontes) | ❌ | ❌ | ❌ | ✅ |
| Vacuum zone mapping | score | ❌ | ❌ | ✅ |
| Rotações contínuas | ❌ | ⚠️ | ❌ | ✅ |

**Score de paridade:**  
- Ornato atual: 2/14 features (14%)  
- LaCut: 7/14 (50%)  
- HOMAG: 12/14 (86%)  
- **Meta v3.0:** 12/14 (86%) — paridade com HOMAG

### 2.2 Simulador G-code

| Feature | Ornato Atual | Profissional (VERICUT/NCSimul) |
|---------|:---:|:---:|
| Visualização 2D de trajetória | ✅ | ✅ |
| Visualização 3D (Three.js) | ✅ | ✅ |
| Material Removal Simulation (voxel) | ❌ | ✅ |
| Collision detection fresa vs grampos | ❌ | ✅ |
| Cycle time com aceleração real | ❌ (±40% erro) | ✅ (±5% erro) |
| Dobradiça / onion skin visual | ✅ | ✅ |
| Surface comparison (got vs expected) | ❌ | ✅ |
| Machine kinematics simulation | ❌ | ✅ |
| Tool wear prediction | ❌ | ✅ premium |

### 2.3 Gerador de G-code

| Feature | Ornato Atual | Profissional |
|---------|:---:|:---:|
| Contornos, furos, rebaixos | ✅ | ✅ |
| Tool change minimization | ❌ | ✅ |
| Drill grouping (TSP nearest-neighbor) | ❌ | ✅ |
| Helical entry para pockets | básico | ✅ completo |
| Lead-in/Lead-out tangencial | ❌ | ✅ |
| Stay-down path linking | ❌ | ✅ |
| Common-line cutting | ❌ | ✅ |
| Kerf compensation automático | parcial | ✅ |
| Multi-pass roughing + finishing | ❌ | ✅ |
| Entry point por régua (longo+interior) | ✅ (recém) | ✅ |

---

## 3. Arquitetura Técnica v3.0

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORNATO CNC ENGINE v3.0                       │
├─────────────────────┬───────────────────────┬───────────────────┤
│   NESTING ENGINE    │   G-CODE GENERATOR    │   SIMULATOR       │
│                     │                       │                   │
│  ┌───────────────┐  │  ┌─────────────────┐  │  ┌─────────────┐ │
│  │ Rectangle     │  │  │ ToolPath Builder│  │  │ Sim2D (RAF) │ │
│  │ Optimizer     │  │  │ ─ contorno      │  │  │ ─ MDF warm  │ │
│  │ (atual, MIP)  │  │  │ ─ furo/dobrad.  │  │  │ ─ op colors │ │
│  └───────────────┘  │  │ ─ pocket        │  │  │ ─ timeline  │ │
│                     │  │ ─ canal/rasgo   │  │  └─────────────┘ │
│  ┌───────────────┐  │  └─────────────────┘  │                   │
│  │ NFP Engine    │  │                       │  ┌─────────────┐  │
│  │ (jagua-rs     │  │  ┌─────────────────┐  │  │ Sim3D       │  │
│  │  via WASM)    │◄─┼─►│ Post-processor  │  │  │ Three.js    │  │
│  └───────────────┘  │  │ ─ tool grouping │  │  └─────────────┘  │
│                     │  │ ─ drill TSP     │  │                   │
│  ┌───────────────┐  │  │ ─ helical entry │  │  ┌─────────────┐  │
│  │ GA/SA Layer   │  │  │ ─ lead-in/out   │  │  │ MRR Sim     │  │
│  │ (Web Workers) │  │  │ ─ stay-down     │  │  │ (voxel)     │  │
│  └───────────────┘  │  └─────────────────┘  │  └─────────────┘  │
│                     │                       │                   │
│  ┌───────────────┐  │  ┌─────────────────┐  │  ┌─────────────┐  │
│  │ Grain Dir.    │  │  │ CycleTime Model │  │  │ Collision   │  │
│  │ + Constraints │  │  │ (accel/decel)   │  │  │ Detector    │  │
│  └───────────────┘  │  └─────────────────┘  │  └─────────────┘  │
│                     │                       │                   │
│  ┌───────────────┐  │                       │                   │
│  │ Rest Sheet    │  │                       │                   │
│  │ Manager       │  │                       │                   │
│  └───────────────┘  │                       │                   │
└─────────────────────┴───────────────────────┴───────────────────┘
         ▲                       ▲                     ▲
         │                       │                     │
    SQLite (chapas,         SQLite (G-code         IndexedDB
    retalhos, grão)          cache, ops)           (sim state)
```

---

## 4. Algoritmos — Fundamentos Técnicos

### 4.1 Por Que NFP Muda o Jogo

**Algoritmo atual (Bounding Box heurístico):**
```
Aproveitamento típico: 80–88%
Para peças retangulares: OK
Para peças com recortes: RUIM — o "ar" entre o bounding-box e a peça real é desperdiçado
```

**NFP (No-Fit Polygon) + Genetic Algorithm:**
```
Aproveitamento típico: 90–95%
Como funciona:
1. Para cada par de peças (A, B), calcula o NFP — o polígono que define
   TODAS as posições válidas de B adjacente a A sem sobrepor
2. O GA evolui uma permutação de peças; o placement decoder
   usa os NFPs para encontrar a posição mais "esquerda/baixo" de cada peça
3. A fitness function é a área do bounding-box do layout resultante
4. Após 100–500 gerações: layout ótimo local
```

**jagua-rs (2024, state-of-the-art):**
- Escrito em Rust, compila para WebAssembly
- Guided Local Search com weighting dinâmico de colisões
- Two-phase: exploração (compactar junto) + otimização local
- Benchmarks: 3–4% melhor que SVGnest/DeepNest nos datasets padrão
- Licença: Mozilla Public License 2.0 (comercial OK com atribuição)

**Comparativo de aproveitamento por algoritmo:**

| Algoritmo | Tempo | Aproveitamento Típico |
|-----------|-------|-----------------------|
| FFDH retangular (atual) | < 1s | 80–87% |
| NFP + Greedy | 2–5s | 87–91% |
| NFP + Genetic Algorithm (SVGnest) | 30–120s | 90–94% |
| jagua-rs / sparrow (2024) | 20–90s | 92–96% |
| Ótimo global (NP-hard, intratável >20 peças) | ∞ | 97–100% |

### 4.2 Grain Direction — Algoritmo

```javascript
// Restrições de rotação por tipo de fio
const GRAIN_ROTATIONS = {
  'longitudinal':  [0, 180],          // paralelo ao fio → só 0° e 180°
  'transversal':   [90, 270],         // perpendicular ao fio → só 90° e 270°
  'any':           [0, 90, 180, 270], // sem fio definido → todas as rotações
  'continuous':    [0, 1, ..., 359],  // rotação livre (peças orgânicas)
};

// No NFP placement: filtrar rotações permitidas por peça antes de calcular NFP
function allowedAngles(peca, chapa) {
  const grain = peca.grain ?? 'any';
  return GRAIN_ROTATIONS[grain].filter(angle => {
    // verificar se a direção do fio da chapa é compatível
    if (chapa.grain_direction === 'horizontal') {
      return grain === 'longitudinal' ? [0, 180].includes(angle) : true;
    }
    return true;
  });
}
```

### 4.3 Rest Sheet Manager

```
Fluxo:
1. Após corte: calcular área do retalho restante
2. Se área_retalho > min_area_reuso (configurável, ex: 0.5m²):
   - Persistir no banco: { id, chapa_origem_id, material_id, comprimento_real, 
     largura_real, geometria_polygon (JSON), created_at, notas }
3. Na próxima otimização:
   - Carregar retalhos compatíveis (mesmo material, espessura)
   - Incluir como "chapas adicionais" no pool do nesting
   - Priorizar retalhos (custo = 0 vs novo material)
   - Marcar visualmente como "retalho" na UI (cor diferente)
4. Após uso: marcar como consumido ou calcular novo retalho do retalho
```

### 4.4 Tool Change Minimization (TSP-like)

```javascript
// Antes de gerar G-code, re-ordenar operações para minimizar trocas de ferramenta
function optimizeToolOrder(operations) {
  // 1. Agrupar por tool_id
  const groups = groupBy(operations, op => `${op.tool_id}_${op.z_depth}`);
  
  // 2. Dentro de cada grupo, otimizar sequência por vizinho mais próximo (TSP greedy)
  for (const group of groups.values()) {
    group.ops = nearestNeighborTSP(group.ops, op => ({ x: op.startX, y: op.startY }));
  }
  
  // 3. Ordenar grupos: minimizar distância entre fim de um grupo e início do próximo
  const groupOrder = nearestNeighborTSP(groups, g => g.ops[g.ops.length - 1].endPos);
  
  return groupOrder.flatMap(g => g.ops);
}

// Nearest-neighbor TSP: O(n²), suficiente para < 1000 operações
function nearestNeighborTSP(items, positionFn) {
  const visited = new Set();
  const result = [];
  let current = items[0];
  result.push(current);
  visited.add(0);
  
  while (result.length < items.length) {
    const curPos = positionFn(current);
    let bestDist = Infinity, bestIdx = -1;
    for (let i = 0; i < items.length; i++) {
      if (visited.has(i)) continue;
      const p = positionFn(items[i]);
      const d = Math.hypot(p.x - curPos.x, p.y - curPos.y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    current = items[bestIdx];
    result.push(current);
    visited.add(bestIdx);
  }
  return result;
}
```

### 4.5 Cycle Time com Aceleração Real

```javascript
// Modelo de cycle time com aceleração — elimina erro de 40% do modelo simples
function segmentTime(dist, feedrate_mm_per_min, accel_mm_per_s2 = 3000) {
  const v = feedrate_mm_per_min / 60; // mm/s
  
  // Distância mínima para atingir feedrate completo (aceleração + desaceleração)
  const d_full = v * v / accel_mm_per_s2;
  
  if (dist >= d_full) {
    // Move longo: acelera até v, cruza, desacelera
    const t_accel = v / accel_mm_per_s2; // tempo de aceleração
    const d_cruise = dist - d_full;
    const t_cruise = d_cruise / v;
    return 2 * t_accel + t_cruise;
  } else {
    // Move curto: não atinge velocidade máxima
    // v_peak = sqrt(accel * dist)
    const v_peak = Math.sqrt(accel_mm_per_s2 * dist);
    return 2 * v_peak / accel_mm_per_s2;
  }
}

// Parâmetros por máquina (configurável em Config → Máquinas)
// Típico para CNC router de painel:
// - Eixos XY: aceleração 2000–5000 mm/s²
// - Eixo Z: aceleração 500–1500 mm/s²
// - Jerk: 200–800 mm/s³ (pode refinar com modelo S-curve)
```

### 4.6 Helical Entry para Pockets

```javascript
// Gera G-code de entrada helicoidal em vez de mergulho direto
function helicalEntry(cx, cy, z_start, z_target, tool_diam, feed_plunge, feed_cut) {
  const r = tool_diam * 0.35; // raio da hélice: 35% do diâmetro da fresa
  const pitch_per_revolution = Math.min(tool_diam * 0.5, z_start - z_target);
  const revolutions = (z_start - z_target) / pitch_per_revolution;
  const segments_per_rev = 36; // 10° por segmento
  const total_segments = Math.ceil(revolutions * segments_per_rev);
  
  const lines = [`; Helical entry at (${cx.toFixed(3)}, ${cy.toFixed(3)})`];
  lines.push(`G0 X${(cx + r).toFixed(3)} Y${cy.toFixed(3)}`); // posicionar na borda
  
  for (let i = 0; i <= total_segments; i++) {
    const angle = (i / segments_per_rev) * 2 * Math.PI;
    const z = z_start - (i / total_segments) * (z_start - z_target);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} Z${z.toFixed(3)} F${feed_plunge}`);
  }
  
  // Mover para o centro ao atingir profundidade alvo
  lines.push(`G1 X${cx.toFixed(3)} Y${cy.toFixed(3)} F${feed_cut}`);
  return lines.join('\n');
}
```

### 4.7 Lead-In / Lead-Out Tangencial

```javascript
// Lead-in tangencial: entrar pelo lado, não pelo fronte direto
function tangentialLeadIn(contour, entry_point_idx, lead_length, tool_diam) {
  const p = contour[entry_point_idx];
  const p_next = contour[(entry_point_idx + 1) % contour.length];
  
  // Direção tangente ao contorno no ponto de entrada
  const dx = p_next.x - p.x;
  const dy = p_next.y - p.y;
  const len = Math.hypot(dx, dy);
  const nx = dx / len, ny = dy / len;
  
  // Ponto de início do lead-in (recuado lead_length mm ao longo da tangente)
  const lead_start = {
    x: p.x - nx * lead_length,
    y: p.y - ny * lead_length,
  };
  
  // Arc de 90° como lead-in (curva mais suave que linha reta)
  const arc_r = lead_length * 0.6;
  // ... (calcular centro do arco perpendicular à tangente)
  
  return { lead_start, lead_end: p, type: 'arc', radius: arc_r };
}
```

---

## 5. Plano de Sprints

### Sprint 1 — NFP Foundation (2–3 semanas)
**Meta:** Nesting true-shape funcional para formas irregulares

**Tarefas:**
1. Integrar `svg-nest` TypeScript (github.com/FrankSandqvist/svg-nest) como módulo server
2. Criar pipeline: geometria da peça (DXF/retângulo) → SVG polygon → NFP input
3. Expor via endpoint POST /cnc/nesting/nfp com progress SSE
4. Adicionar toggle "Modo NFP" na UI de geração do plano (lado a lado com resultado retangular)
5. Métricas: comparar aproveitamento retangular vs NFP na mesma chapa
6. Adicionar campo `geometria_real` nas peças (opcional, DXF upload)

**KPI:** NFP para 50 peças retangulares = mesmo resultado que otimizador atual; para 10 peças com chanfros = 5%+ melhoria de aproveitamento

---

### Sprint 2 — Grain Direction + Rest Sheet (2 semanas)
**Meta:** Fio da madeira respeitado; retalhos viram ativos

**Tarefas:**
1. `grain_direction` nas peças: `longitudinal | transversal | any`
2. `grain_direction` nas chapas: `horizontal | vertical`
3. UI: seletor de fio por peça no editor de itens; indicador visual no nesting
4. Rest Sheet Manager:
   - Tela "Retalhos" em Config CNC → Estoque de Chapas
   - Após plano de corte finalizado: calcular e oferecer persistir retalhos (área > min configurável)
   - Retalhos listados com dimensões reais, material, área, foto opcional
   - Na geração do plano: opção "usar retalhos disponíveis primeiro"
5. Prioridade por peça: campo `urgente` → aparece com badge na lista e é colocado primeiro no nesting

**KPI:** Geração de plano com material_override = [retalhos_disponíveis] funciona corretamente

---

### Sprint 3 — Tool Optimization + Cycle Time Preciso (2 semanas)
**Meta:** G-code profissional — menos trocas de ferramenta, tempo real estimado

**Tarefas:**
1. Tool change minimization:
   - No pós-processador: agrupar por ferramenta antes de gerar trajetórias
   - Nearest-neighbor TSP dentro de cada grupo
   - Exibir "X trocas de ferramenta" no resumo do plano
2. Drill grouping: furos do mesmo diâmetro processados juntos antes de passar para o próximo
3. Cycle time com aceleração:
   - Parâmetro `aceleracao_xy_mm_s2` e `aceleracao_z_mm_s2` por máquina (Config → Máquinas)
   - Novo cálculo de tempo usa `segmentTime()` (modelo aceleração real)
   - Comparar estimativa vs real: display "tempo est. ± 8%" vs atual "± 40%"
4. Helical entry para pockets:
   - Parâmetro por máquina: `usar_entrada_helicoidal: true/false`
   - Parâmetro por operação: `helix_diameter` (padrão: 0.35 * tool_diam)
5. Lead-in/lead-out tangencial para contornos

**KPI:** Tempo estimado dentro de ±12% do real medido em máquina real

---

### Sprint 4 — MRR Simulation + Collision Detection (3 semanas)
**Meta:** Simulador pro — ver material sendo removido, detectar colisão fresa vs grampos

**Tarefas:**
1. Material Removal Simulation (voxel):
   - Representar stock como Float32Array (heightmap do painel, resolução 1mm/px)
   - A cada move G1: "perfurar" o heightmap com raio da fresa, Z da operação
   - Three.js: renderizar heightmap como PlaneGeometry deformada (vertex shader)
   - Resultado visual: ver a chapa sendo usinada em tempo real
   - Toggle "MRR Mode" na aba 3D do simulador
2. Collision detection básica:
   - Definir zonas de grampo no editor de setup (posições X,Y, raio de exclusão)
   - Na simulação: detectar se tool_tip entra em zona de grampo → alerta vermelho
   - No G-code: highlight das linhas que causariam colisão
3. "Surface deviation" display:
   - Ao fim da simulação, colorir a chapa: verde = usinado correto, vermelho = sobra/excesso
   - Comparar heightmap simulado vs modelo esperado (geometria das peças)

**KPI:** MRR simulation funciona a 60fps para chapa 2750×1850 com resolução 2mm; 0 false positives de colisão em G-codes válidos

---

### Sprint 5 — Multi-Order Batch + jagua-rs WASM (4 semanas)
**Meta:** Nesting de múltiplos pedidos juntos; performance state-of-the-art

**Tarefas:**
1. Multi-order batch optimization:
   - UI: seleção de múltiplos lotes/pedidos para nesting conjunto
   - Backend: combinar peças de múltiplos pedidos num único pool
   - Etiquetas distinguem pedido de origem de cada peça no layout
   - Report: quantas chapas por pedido, aproveitamento conjunto vs individual
2. jagua-rs WASM integration:
   - Compilar jagua-rs para WASM target (wasm-pack)
   - Criar Node.js wrapper: `CncNestingEngine.solve(pieces, sheets, options) → layout`
   - A/B test vs SVGnest: comparar aproveitamento e tempo para mesma entrada
   - Fallback automático para SVGnest se WASM não disponível
3. Part-in-part nesting:
   - Detectar contornos "donut" (peças com recorte central, ex: molduras)
   - Marcar área interna como disponível para peças menores
   - Implementar como NFP interno (inner-fit polygon)

**KPI:** jagua-rs atinge aproveitamento ≥ 3% melhor que SVGnest nos mesmos inputs; multi-pedido funciona para até 5 pedidos simultâneos

---

### Sprint 6 — Polish + Vacuum Zone Mapping + Common-Line (2 semanas)
**Meta:** Features de acabamento que tornam o produto inegavelmente profissional

**Tarefas:**
1. Vacuum zone mapping visual:
   - Editor drag-and-drop de zonas de vácuo na mesa (tamanho configurável por máquina)
   - Exibir zonas no preview do nesting
   - Warning automático: peça pequena (<150×150mm) posicionada sem cobertura de vácuo
   - Sugestão: rotacionar/reposicionar peça para cobrir zona de vácuo
2. Common-line cutting detection:
   - Detectar contornos adjacentes na mesma profundidade que compartilham uma aresta
   - Gerar um único pass de fresa ao longo dessa aresta em vez de duas passes
   - Economia típica: 5–15% do tempo total de corte
3. Bridge nesting básico:
   - Para peças com risco de arrancamento (pequenas, aspect ratio extremo)
   - Gerar micropontes (tabs) no G-code: interromper o corte por 2–3mm a cada X mm de contorno
   - Configurável: `tab_width`, `tab_interval`, `tab_types: ['horizontal', 'vertical', 'both']`
4. Grain matching por conjunto:
   - Associar peças de um mesmo conjunto/componente (ex: todas as portas de um armário)
   - Garantir que sejam colocadas adjacentes na mesma chapa
   - Objetivo: continuidade visual do fio entre peças do mesmo conjunto

**KPI:** Vacuum warning detecta 100% dos casos de peça sem cobertura; common-line cutting reduz G-code em ≥5% para layouts com alta densidade

---

## 6. UI/UX do Sistema v3.0

### 6.1 Nova Página de Nesting

```
┌─────────────────────────────────────────────────────────────────┐
│ PLANO DE CORTE — Lote #42                            [Exportar] │
├────────────────┬────────────────────────────┬───────────────────┤
│  CONFIGURAÇÃO  │    PREVIEW DO LAYOUT        │  ANÁLISE          │
│                │                            │                   │
│  Material      │  [chapa renderizada com    │  Aproveitamento   │
│  ○ MDF 15mm    │   peças coloridas por      │  ████████░░ 91.3% │
│  ○ Retalho #3  │   pedido/conjunto]         │                   │
│                │                            │  vs anterior      │
│  Algoritmo     │  [timeline colorida]       │  ▲ +4.2%          │
│  ○ Retangular  │                            │                   │
│  ● NFP (rec.)  │  Chapa 1/3  ← →           │  Trocas ferr.     │
│  ○ jagua-rs    │                            │  3 (vs 12)        │
│                │  [zoom, pan, select piece] │                   │
│  Grain dir.    │                            │  Cycle time est.  │
│  ✅ Respeitar   │                            │  47min ±8%        │
│                │                            │                   │
│  Retalhos      │                            │  Retalhos gerados │
│  ✅ Usar primeiro│                            │  2 retalhos       │
│                │                            │  0.84m² total     │
│  Pedidos       │                            │                   │
│  ✅ Lote #42   │                            │  Alertas          │
│  ✅ Lote #41   │                            │  ⚠ 2 peças sem   │
│  ○ Lote #40   │                            │    vácuo          │
│                │                            │                   │
│  [OTIMIZAR ▶]  │                            │  [Gerar G-code ▶] │
└────────────────┴────────────────────────────┴───────────────────┘
```

### 6.2 Editor de Configuração de Máquina (ampliado)

Adicionar à tela Config → Máquinas:
- Aceleração XY/Z (mm/s²) — para cycle time preciso
- Perfil de vácuo (editor visual de zonas)
- Padrão de entrada: helical/ramp/direct
- Lead-in/lead-out: ativado/desativado, tipo (arc/line), comprimento
- Trocas de ferramenta automáticas: sim/não
- Clearance Z (altura de passagem entre operações)

### 6.3 Cockpit de Simulação (melhorias v3.0)

- **MRR toggle:** botão "Material" no header do 3D para ligar simulação voxel
- **Collision panel:** lista de riscos detectados com click-to-navigate
- **Cycle time dashboard:** gráfico Gantt de operações com tempo real ao lado do estimado
- **ROI display:** "este plano economizou X% vs bounding-box = R$Y de material"

---

## 7. Stack Técnico e Dependências

### 7.1 Novas Dependências

```json
{
  "dependencies": {
    "svg-nest": "github:FrankSandqvist/svg-nest", // NFP nesting TypeScript
    "clipper-lib": "^6.4.2",                       // polygon operations (já usado internamente pelo svgnest)
    "flatbush": "^4.2.0",                          // R-tree spatial index (para collision queries rápidas)
    "rbush": "^3.0.1"                              // R-tree alternativo (mais simples)
  },
  "devDependencies": {
    "wasm-pack": "latest"                          // para compilar jagua-rs (opcional, Sprint 5)
  }
}
```

### 7.2 Novos Endpoints Backend

```
POST /cnc/nesting/optimize          — Otimização completa (retangular ou NFP)
POST /cnc/nesting/optimize-stream   — Com progress SSE (long jobs)
GET  /cnc/retalhos                  — Listar retalhos disponíveis
POST /cnc/retalhos                  — Salvar retalho após corte
PUT  /cnc/retalhos/:id              — Marcar como usado/parcial
POST /cnc/gcode/analyze-collisions  — Detectar colisões fresa vs grampos
POST /cnc/gcode/simulate-mrr        — Simular material removal
GET  /cnc/gcode/cycle-time/:id      — Estimativa de tempo com modelo de aceleração
```

### 7.3 Novas Tabelas SQLite

```sql
-- Retalhos gerados após corte
CREATE TABLE cnc_retalhos (
  id INTEGER PRIMARY KEY,
  material_id INTEGER,
  espessura REAL,
  comprimento REAL,
  largura REAL,
  area REAL,
  geometria_json TEXT,           -- polygon dos retalhos irregulares
  grain_direction TEXT,
  origem_lote_id INTEGER,
  origem_chapa_idx INTEGER,
  data_criacao TEXT,
  status TEXT DEFAULT 'disponivel', -- disponivel | em_uso | consumido | descartado
  notas TEXT,
  foto_path TEXT
);

-- Zonas de vácuo por máquina
CREATE TABLE cnc_vacuum_zones (
  id INTEGER PRIMARY KEY,
  maquina_id INTEGER,
  x REAL, y REAL,
  largura REAL, altura REAL,
  ativa INTEGER DEFAULT 1,
  notas TEXT
);

-- Histórico de nesting com métricas
CREATE TABLE cnc_nesting_runs (
  id INTEGER PRIMARY KEY,
  lote_id INTEGER,
  algoritmo TEXT,                -- 'retangular' | 'nfp_svgnest' | 'jagua_rs'
  aproveitamento_pct REAL,
  tempo_otimizacao_ms INTEGER,
  pecas_count INTEGER,
  chapas_count INTEGER,
  trocas_ferramenta INTEGER,
  ciclo_estimado_min REAL,
  layout_json TEXT,              -- resultado completo para replay
  created_at TEXT
);
```

---

## 8. KPIs do Produto Final

| Métrica | Atual | Meta v3.0 | Como medir |
|---------|-------|-----------|------------|
| Aproveitamento de material (retangular puro) | ~82% | ~88% | benchmark com 100 layouts históricos |
| Aproveitamento (peças com chanfro/recorte) | ~80% | ~93% | NFP vs bounding-box, mesmas peças |
| Precisão de cycle time | ±40% | ±8% | medir em máquina real, comparar |
| Trocas de ferramenta | 15–20 por chapa típica | 3–5 por chapa | comparar antes/depois drill grouping |
| Tempo de geração do plano (50 peças) | <5s | <30s (NFP) / <3s (retangular) | benchmark |
| Detecção de colisão fresa-grampo | 0% | 95%+ dos casos reais | teste com G-codes com colisão conhecida |
| Retalhos reaproveitados | manual | 80%+ dos retalhos ≥0.5m² | relatório de consumo de material |

---

## 9. Roadmap Visual

```
Mês 1    Mês 2    Mês 3    Mês 4    Mês 5    Mês 6
   Sprint 1     Sprint 2     Sprint 3     Sprint 4     Sprint 5     Sprint 6
   ─────────    ─────────    ─────────    ─────────    ─────────    ─────────
   NFP          Grain Dir.   Tool Opt.    MRR Sim.     jagua-rs     Polish
   Foundation   + Rest Sheet + CycleTime  + Collision  + MultiOrder + VacZones
                             + Helical    Detection    Batch        + CommonLine
                             + LeadIn                               + Grain Match

   ▲ LaCut paridade (nesting)
              ▲ Corte Certo superado (retalhos + grain)
                             ▲ G-code qualidade profissional
                                          ▲ Simulação pro (único na faixa de preço)
                                                       ▲ Performance state-of-art
                                                                    ▲ Produto $100k
```

---

## 10. Diferencial Competitivo Final

### Por que o Ornato v3.0 pode valer $100k (ou R$500k):

1. **Único no Brasil a ter ERP + NFP nesting + simulação em um produto**  
   LaCut não tem ERP. Corte Certo não tem simulação. HOMAG não tem ERP de marcenaria. **Nós teremos tudo.**

2. **ROI mensurável imediato:**  
   `Economia material (4–8%) + economia tempo setup (2h/dia) + redução de erros = R$2.000–R$4.000/mês por cliente`

3. **Integração sem fricção:**  
   `pedido → projeto Sketchup → BOM automático → nesting otimizado → G-code → CNC → etiquetas → entrega`  
   Zero reentrada de dados. Zero exports manuais.

4. **jagua-rs como vantagem de performance:**  
   O algoritmo de nesting mais avançado do mundo (publicado em 2024, INFORMS Journal on Computing), rodando no browser via WASM. LaCut e Corte Certo não têm isso.

5. **Simulação de material removal + collision:**  
   Nenhum software na faixa de preço de $1k–$10k/ano tem MRR simulation. Isso cria uma barreira de diferenciação que justifica preço premium.

---

## Referências Técnicas

- [jagua-rs — State-of-art nesting engine (Rust/WASM)](https://github.com/JeroenGar/jagua-rs)
- [sparrow — paper com benchmarks 2025 (arXiv 2509.13329)](https://arxiv.org/html/2509.13329v1)
- [SVGnest — NFP + GA open source](https://github.com/Jack000/SVGnest)
- [DeepNest algorithm documentation](https://deepwiki.com/deepnest-next/deepnest/5.1-nesting-algorithm)
- [NFP robust generation algorithm (arXiv 1903.11139)](https://arxiv.org/pdf/1903.11139)
- [HOMAG intelliDivide Nesting](https://www.homag.com/en/product-detail/software/work-preparation/intellidivide-nesting)
- [Biesse b_NEST software](https://biesse.com/ww/en/software/b_nest/)
- [LaCut — otimizador brasileiro](https://lacut.com.br/)
- [Cycle time prediction with acceleration (CADEM)](https://cadem.com/cnc-acceleration-and-deceleration/)
