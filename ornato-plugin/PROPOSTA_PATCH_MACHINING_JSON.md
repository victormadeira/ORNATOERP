# Proposta de Patch — `machining_json.rb` (Etapa 4 do Pipeline de Furações 3D)

> **Status:** PROPOSTA. NÃO APLICAR. Aplicação fica condicionada à
> entrega do `Ornato::Machining::SkpFeatureExtractor` (Agente E) e
> revisão humana posterior.

## 1. Análise da arquitetura atual

`machining_json.rb` (311 linhas) é um **serializador puro**: recebe
um hash `{ persistent_id => Array<Hash op_bruta> }` e o transforma
em payload UPM (`{ persistent_id => { workers: { op_N => {...} } } }`).
Não tem entrypoint que varra o modelo SketchUp — quem alimenta esse
hash é o `MachiningInterpreter` (regras declarativas legacy) e o
`RulesEngine` (heurísticas AABB), ambos chamados pelo
`DialogController` na hora do export.

| Camada | Responsabilidade | Arquivo |
|---|---|---|
| Coleta de peças/instâncias | Walking de Groups carimbados | `dialog_controller.rb` (não tocado) |
| Geração lógica das ops | Regras declarativas (`ferragens_auto`) | `machining_interpreter.rb` |
| Serialização para UPM | Hash bruto → JSON UPM | `machining_json.rb` |

Hoje o caminho **3D** (instâncias com `preserve_drillings = true`) é
**totalmente ignorado**: o `MachiningInterpreter` filtra por
`PieceStamper.piece?` (apenas Groups), e nenhum coletor visita
`ComponentInstance` carimbada como `tipo = 'ferragem'`.

A proposta abaixo introduz um **novo coletor** dedicado a ferragens 3D
(`FerragemDrillingCollector`), invocado em paralelo aos coletores
existentes, e cujo output é mesclado no hash bruto antes de chegar
em `MachiningJson#serialize`. Assim, o serializador permanece puro
(zero alteração no contrato público), e o caminho legacy fica
intacto.

## 2. Diff unified proposto

### 2.1 Novo arquivo: `ornato_sketchup/machining/ferragem_drilling_collector.rb`

```diff
--- /dev/null
+++ b/ornato_sketchup/machining/ferragem_drilling_collector.rb
@@
+# frozen_string_literal: true
+require_relative 'skp_feature_extractor'
+
+module Ornato
+  module Machining
+    # Varre ComponentInstances carimbadas com Ornato.preserve_drillings
+    # e converte features (furos, slots, recortes) em ops CNC brutas
+    # já no espaço local da peça-chapa âncora.
+    class FerragemDrillingCollector
+      AXIS_TOL_DEG = 20.0  # tolerância angular para classificar lado
+
+      def initialize(parent_group)
+        @parent = parent_group
+      end
+
+      # @return [Hash] { piece_persistent_id => Array<Hash op_bruta> }
+      def collect
+        out = Hash.new { |h, k| h[k] = [] }
+        anchors_by_role = index_anchors
+
+        @parent.entities.each do |ent|
+          next unless ferragem_3d?(ent)
+          anchor = anchors_by_role[ent.get_attribute('Ornato', 'anchor_role').to_s]&.first
+          next unless anchor
+
+          extractor = SkpFeatureExtractor.new(ent.definition)
+          combined_tx = ent.transformation
+          anchor_inv  = anchor.transformation.inverse
+
+          extractor.extract.each do |feat|
+            world_pt    = combined_tx * feat.center
+            local_pt    = anchor_inv * world_pt
+            world_norm  = combined_tx.xaxis  # placeholder, see normal helper
+            normal_w    = transform_vector(combined_tx, feat.normal)
+            local_norm  = transform_vector(anchor_inv, normal_w)
+            side        = detect_face_side(local_norm, anchor)
+
+            out[anchor.persistent_id] << {
+              category:        map_category(feat.kind),
+              tipo_ornato:     feat.kind,           # furo_passante etc
+              position_x:      local_pt.x.to_mm,
+              position_y:      local_pt.y.to_mm,
+              position_z:      local_pt.z.to_mm,
+              diameter:        feat.diameter_mm,
+              depth:           feat.depth_mm,
+              side:            side,
+              fonte:           "wps_skp:#{ent.get_attribute('Ornato', 'componente_3d')}",
+              ferragem_regra:  ent.get_attribute('Ornato', 'regra').to_s,
+              confidence:      feat.confidence,
+            }
+          end
+        end
+
+        out
+      end
+
+      private
+
+      def ferragem_3d?(ent)
+        ent.is_a?(Sketchup::ComponentInstance) &&
+          ent.get_attribute('Ornato', 'tipo') == 'ferragem' &&
+          ent.get_attribute('Ornato', 'preserve_drillings') == true
+      end
+
+      def index_anchors
+        idx = Hash.new { |h, k| h[k] = [] }
+        @parent.entities.each do |e|
+          next unless PieceStamper.piece?(e)
+          role = e.get_attribute('Ornato', 'role').to_s
+          idx[role] << e
+        end
+        idx
+      end
+
+      # Vetor normal local-da-peça → lado da chapa (Z = espessura)
+      def detect_face_side(local_normal, anchor_piece)
+        n = local_normal.normalize
+        ax_tol = Math.cos(AXIS_TOL_DEG * Math::PI / 180.0)
+        return 'topside'      if n.z >=  ax_tol
+        return 'underside'    if n.z <= -ax_tol
+        return 'edge_frente'  if n.y >=  ax_tol
+        return 'edge_tras'    if n.y <= -ax_tol
+        return 'edge_topo'    if n.x >=  ax_tol
+        return 'edge_base'    if n.x <= -ax_tol
+        'topside'
+      end
+
+      def transform_vector(tx, vec)
+        m = tx.to_a
+        Geom::Vector3d.new(
+          m[0] * vec.x + m[4] * vec.y + m[8]  * vec.z,
+          m[1] * vec.x + m[5] * vec.y + m[9]  * vec.z,
+          m[2] * vec.x + m[6] * vec.y + m[10] * vec.z
+        )
+      end
+
+      # Mapeia tipo Ornato → categoria UPM (validada em VALID_CATEGORIES)
+      def map_category(kind)
+        case kind.to_s
+        when 'furo_passante', 'furo_cego' then 'hole'
+        when 'rasgo_slot'                 then 'groove'
+        when 'recorte'                    then 'pocket'
+        else                                    'hole'
+        end
+      end
+    end
+  end
+end
```

### 2.2 Hook no controller (sugestão — não no `machining_json.rb`)

```diff
--- a/ornato_sketchup/dialog/dialog_controller.rb
+++ b/ornato_sketchup/dialog/dialog_controller.rb
@@ def collect_machining_for_module(module_group)
   raw = interpreter.interpret(ferragens_auto, pieces_data)
+
+  # ── NEW: ferragens 3D (preserve_drillings) ─────────────
+  collector = Ornato::Machining::FerragemDrillingCollector.new(module_group)
+  collector.collect.each do |pid, extra_ops|
+    raw[pid] ||= {}
+    base_idx = raw[pid].is_a?(Hash) ? raw[pid].size : raw[pid].length
+    extra_ops.each_with_index do |op, i|
+      key = "op_#{base_idx + i}"
+      raw[pid].is_a?(Hash) ? (raw[pid][key] = op) : (raw[pid] << op)
+    end
+  end
+
   MachiningJson.new.serialize(raw)
 end
```

### 2.3 Skip explícito no MachiningInterpreter (defensivo)

```diff
--- a/ornato_sketchup/machining/machining_interpreter.rb
+++ b/ornato_sketchup/machining/machining_interpreter.rb
@@ def evaluate_active_rules(ferragens_auto)
-  ferragens_auto.select { |r| condition_active?(r) }
+  ferragens_auto.select do |r|
+    next false if r['componente_3d']  # tratado por FerragemDrillingCollector
+    condition_active?(r)
+  end
```

Isto evita que a regra `dobradica` rode duas vezes quando o JSON
tiver tanto a regra legacy quanto o `componente_3d` (situação comum
durante migração).

## 3. Schema dos campos novos no UPM

| Campo | Tipo | Descrição | Origem |
|---|---|---|---|
| `category` | string | `hole` / `groove` / `pocket` (compatível com `VALID_CATEGORIES`) | `map_category` |
| `tipo_ornato` | string | `furo_passante` / `furo_cego` / `rasgo_slot` / `recorte` | `feat.kind` |
| `position_x/y/z` | float (mm) | centro da feature no sistema da peça-chapa âncora | tx local |
| `diameter` | float\|null (mm) | diâmetro nominal (null para slot/pocket) | `feat.diameter_mm` |
| `depth` | float (mm) | profundidade efetiva | `feat.depth_mm` |
| `side` | string | `topside`/`underside`/`edge_frente`/`edge_tras`/`edge_topo`/`edge_base` | `detect_face_side` |
| `fonte` | string | `wps_skp:<rel_path>` para rastreabilidade | atributo Ornato |
| `ferragem_regra` | string | regra do JSON (ex: `dobradica`, `minifix`) | atributo Ornato |
| `confidence` | float (0–1) | grau de certeza heurístico do extractor | `feat.confidence` |

> **Nota:** o serializador atual em `machining_json.rb` aceita `op[:position_x]` e descarta chaves desconhecidas. Os campos `tipo_ornato`, `fonte`, `ferragem_regra` e `confidence` são **descartados na serialização UPM** por enquanto — para que apareçam no JSON final, é preciso estender `serialize_hole`/`serialize_pocket`/`serialize_groove` adicionando esses campos como passthrough. Esta extensão é trivial mas fica fora desta proposta para minimizar surface de mudança.

## 4. Risco de retrocompatibilidade

- **Instâncias antigas (sem `preserve_drillings`):** o coletor filtra
  por `tipo == 'ferragem' && preserve_drillings == true`. Qualquer
  outro `ComponentInstance` (mobília existente, blocos do usuário)
  é ignorado.
- **Regras `ferragens_auto` sem `componente_3d`:** continuam fluindo
  normalmente pelo `MachiningInterpreter` — o filtro defensivo só
  elimina entradas que **explicitamente** têm `componente_3d`.
- **Sem `componente_3d` no JSON do módulo:** zero impacto. O coletor
  retorna hash vazio.
- **Falha do `SkpFeatureExtractor`:** ideal envolver `extractor.extract`
  em rescue local para que uma ferragem corrompida não quebre o
  export inteiro.
- **Persistent IDs:** `anchor.persistent_id` é estável entre saves,
  então o merge no hash bruto é seguro.

## 5. Checklist de testes manuais

1. **Smoke test sem ferragens 3D:** carregar módulo legacy
   (`armario_2_portas.json` sem `componente_3d`) e exportar UPM.
   Diff do JSON deve ser **idêntico** ao baseline.
2. **Dobradiça única:** módulo com 1 porta e 2 dobradiças via
   `componente_3d: ferragens/dobradica_blum_clip_45.skp`.
   Verificar:
   - 2 ops `hole` aparecem no `persistent_id` da `lateral_esq`.
   - `position_z` igual aos pontos calculados em `calculate_distribution`.
   - `side == 'edge_frente'` (face frontal da lateral).
   - `fonte` contém `wps_skp:ferragens/dobradica_blum_clip_45.skp`.
3. **Sistema 32 (linha de furos):** módulo com `componente_3d`
   apontando para um `.skp` com 16 furos cegos. Validar 16 ops
   `hole` com `side == 'topside'`.
4. **Coexistência:** módulo com `dobradica` (legacy) + `componente_3d`
   apontando para a mesma dobradiça. Confirmar que o filtro defensivo
   evita duplicação (aparecem só as ops do coletor 3D).
5. **Edge case — anchor inexistente:** `anchor_role: 'lateral_xyz'`.
   Esperado: warning, sem crash, sem ops emitidas.
6. **Round-trip ERP:** exportar, abrir UPM no ERP, verificar G-code
   gerado bate com Z dos furos no SketchUp (tolerância ±0.5 mm).
7. **Validação UPM:** rodar `MachiningJson#validate` no payload final
   — não deve emitir erros de categoria.

## 6. Observações finais

- A classe `Ornato::Machining::SkpFeatureExtractor` é dependência
  externa desta proposta. Contrato esperado: `#extract` retorna
  `Array<Struct>` com `:kind, :center (Point3d local), :normal
  (Vector3d local), :diameter_mm, :depth_mm, :confidence`.
- Caso o Agente E entregue assinatura diferente, basta ajustar o
  loop de mapeamento no coletor — schema UPM permanece estável.
- A detecção de lado por ângulo é **conservadora** (tol 20°). Para
  ferragens rotacionadas em ângulos arbitrários, considerar elevar
  para 30° ou usar projeção em vez de cosseno.
