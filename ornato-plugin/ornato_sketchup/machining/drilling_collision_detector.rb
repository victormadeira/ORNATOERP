# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# DrillingCollisionDetector — Detector de colisão entre furações CNC
#
# Quando múltiplas ferragens 3D são instanciadas próximas na mesma peça-
# chapa (ex: dobradiça + sistema 32 + minifix coexistindo no terço
# superior de uma lateral), as furações extraídas via
# `Ornato::Machining::SkpFeatureExtractor` podem se sobrepor ou ficar
# perigosamente próximas da borda. Sem detecção, o G-code envia operações
# conflitantes pra CNC e a peça pode quebrar (ou a broca, ou ambos).
#
# Esta classe é DIFERENTE do `Ornato::Core::JointDetector`:
#   - JointDetector   → analisa juncoes ESTRUTURAIS entre peças-chapa
#                       (BUTT, OVERLAY, DADO, MITER) com tolerâncias
#                       1mm/2mm/10mm/100mm²
#   - DrillingCollisionDetector → analisa colisões entre OPERAÇÕES de
#                                 furação dentro de uma mesma peça-chapa
#
# ─── API ───────────────────────────────────────────────────────────────
#
#   detector = Ornato::Machining::DrillingCollisionDetector.new(
#     ops,                          # Array de operações de furação
#     pieces_bbox: pieces_bbox,     # opcional: { peca_id => bbox_mm }
#     pieces_banding: banding,      # opcional: { peca_id => Set<lado> }
#     options: { tol_safety_mm: 2.0, edge_clearance_mm: 5.0, ... }
#   )
#   result = detector.analyze
#
#   # result:
#   # {
#   #   collisions: [ <hash de colisão>, ... ],
#   #   stats: { ops_total:, ops_with_issues:, by_severity: { error:, warning: } }
#   # }
#
# Cada operação de entrada é um Hash (ou objeto duck-typed) com:
#   :tipo            → Symbol/String  (:furo_passante, :furo_dobradica, ...)
#   :peca_id         → Integer/String (entityID da peça-chapa âncora)
#   :x_mm, :y_mm, :z_mm → Float (coords RELATIVAS à peça-chapa, em mm)
#   :diametro_mm     → Float
#   :profundidade_mm → Float
#   :lado            → Symbol (:topside, :underside, :edge_left, ...)
#   :normal          → Vector3d (opcional — usado pra agrupar por face)
#   :fonte           → String  ("wps_skp:ferragens/dobradica_blum_clip_45.skp")
#
# ─── TIPOS DE COLISÃO ─────────────────────────────────────────────────
#
#   :overlap_xy
#       Dois furos no mesmo (peca_id, lado), com distância XY menor que
#       (d1+d2)/2 + tol_safety. Severity :error se há sobreposição real,
#       :warning se está dentro da margem de segurança.
#
#   :duplicate
#       Caso degenerado de overlap_xy: mesmo XYZ, mesmo Ø, mesma normal.
#       Severity :warning. Sugestão de remediação: deduplicar.
#
#   :edge_too_close
#       Furo com center.x ou .y a menos de `edge_clearance_mm` da borda
#       da peça (requer `pieces_bbox`). Severity :warning.
#
#   :depth_through_other_face
#       Dois furos cegos opostos (lados topside/underside) na mesma
#       coluna XY, cujas profundidades somadas excedem a espessura da
#       peça (passam pelo meio e se encontram). Severity :error.
#
#   :intersects_banding
#       Furo na borda passante (lado :edge_*) cujo XY cai dentro da zona
#       de fitamento (default 8mm da borda, configurável). Requer
#       `pieces_banding`. Severity :warning.
#
# ─── SEVERIDADES ──────────────────────────────────────────────────────
#
#   :error    → bloqueia geração de G-code; UI deve marcar em vermelho.
#   :warning  → permite geração mas exige confirmação; UI em âmbar.
#
# ─── TOLERÂNCIAS CONFIGURÁVEIS (passar via options:) ─────────────────
#
#   :tol_safety_mm        (default 2.0)  margem extra entre furos
#   :edge_clearance_mm    (default 5.0)  distância mínima furo↔borda
#   :banding_zone_mm      (default 8.0)  largura da zona de fita
#   :duplicate_pos_tol_mm (default 0.1)  tolerância pra considerar
#                                         "mesmo XYZ"
#   :thickness_default_mm (default 18.0) espessura assumida quando bbox
#                                         da peça não for fornecida
#
# ─── EXEMPLO DE USO ───────────────────────────────────────────────────
#
#   ops = [
#     { tipo: :furo_dobradica, peca_id: 42, x_mm: 100, y_mm: 50, z_mm: 0,
#       diametro_mm: 35, profundidade_mm: 13, lado: :topside,
#       fonte: 'wps_skp:dobradica_blum.skp' },
#     { tipo: :furo_sys32, peca_id: 42, x_mm: 101, y_mm: 51, z_mm: 0,
#       diametro_mm: 8, profundidade_mm: 13, lado: :topside,
#       fonte: 'wps_skp:sys32.skp' },
#   ]
#   detector = Ornato::Machining::DrillingCollisionDetector.new(ops)
#   result = detector.analyze
#   # → result[:collisions].first[:tipo] == :overlap_xy
#
# ─── INTEGRAÇÃO (PROPOSTA, NÃO IMPLEMENTADA AQUI) ─────────────────────
#
#   No `machining_json.rb` (após patch do Agente F), ao final da fase de
#   coleta de furações vindas das ferragens 3D:
#
#     drilling_ops = collect_drilling_ops_from_ferragens(parent_group)
#     pieces_bbox  = collect_pieces_bbox(parent_group)
#     pieces_band  = collect_pieces_banding(parent_group)
#
#     detector = Ornato::Machining::DrillingCollisionDetector.new(
#       drilling_ops, pieces_bbox: pieces_bbox, pieces_banding: pieces_band
#     )
#     diag = detector.analyze
#
#     upm_json['_drilling_collisions'] = diag  # anexa ao UPM
#
#     if diag[:stats][:by_severity][:error] > 0
#       UI.messagebox("⚠ #{diag[:stats][:by_severity][:error]} colisões críticas detectadas. Revise antes de gerar G-code.")
#     end
#
#   UI v2 do plugin:
#     - Inspector: badge vermelho/âmbar na peça com colisões
#     - Painel "Validação": lista cada colisão com link pra highlightar
#       op_a/op_b no viewport (via entityIDs em :fonte / metadados extras)
#
# ─── COMPLEXIDADE ─────────────────────────────────────────────────────
#
#   Indexação por (peca_id, lado) → buckets pequenos.
#   overlap_xy:        O(k²) por bucket (k = ops por face, tipicamente <20)
#   duplicate:         idem (subcaso de overlap_xy)
#   edge_too_close:    O(n)
#   depth_through_*:   O(k²) por (peca_id), pareando topside vs underside
#   intersects_banding:O(n)
#
#   Total esperado: O(n + k²·b) onde b = nº de buckets. Em peças reais
#   com <50 furações totais, é desprezível.
#
# ═══════════════════════════════════════════════════════════════════════

require 'set'

module Ornato
  module Machining
    class DrillingCollisionDetector
      # ── Tolerâncias default (todas em mm) ─────────────────────────
      DEFAULT_TOL_SAFETY_MM        = 2.0
      DEFAULT_EDGE_CLEARANCE_MM    = 5.0
      DEFAULT_BANDING_ZONE_MM      = 8.0
      DEFAULT_DUPLICATE_POS_TOL_MM = 0.1
      DEFAULT_THICKNESS_MM         = 18.0

      # Lados considerados "face plana" (XY na peça-chapa)
      FACE_SIDES = [:topside, :underside].freeze

      # Lados considerados "borda" (passante lateral)
      EDGE_SIDES = [:edge_left, :edge_right, :edge_front, :edge_back].freeze

      attr_reader :ops, :pieces_bbox, :pieces_banding, :options

      # @param ops [Array<Hash>] operações de furação (já em coords da peça)
      # @param pieces_bbox [Hash{Object => Hash}] opcional. Cada bbox como
      #   { x_min:, y_min:, z_min:, x_max:, y_max:, z_max:, thickness_mm: }
      # @param pieces_banding [Hash{Object => Array<Symbol>}] opcional.
      #   Lados com fita de borda (ex: [:edge_front, :edge_left]).
      # @param options [Hash] tolerâncias custom (ver header)
      def initialize(ops, pieces_bbox: {}, pieces_banding: {}, options: {})
        @ops = (ops || []).map.with_index { |o, idx| normalize_op(o, idx) }
        @pieces_bbox    = pieces_bbox    || {}
        @pieces_banding = pieces_banding || {}
        @options        = default_options.merge(options || {})
      end

      # Executa todas as regras e retorna o relatório consolidado.
      #
      # @return [Hash] { collisions:, stats: }
      def analyze
        collisions = []
        collisions.concat(detect_overlap_xy)
        collisions.concat(detect_edge_too_close)
        collisions.concat(detect_depth_through_other_face)
        collisions.concat(detect_intersects_banding)

        {
          collisions: collisions,
          stats: build_stats(collisions),
        }
      end

      # ───────────────────────────────────────────────────────────────
      # REGRA 1 — overlap_xy + duplicate
      # Furos com mesmo (peca_id, lado), distância XY menor que o limiar.
      # ───────────────────────────────────────────────────────────────
      def detect_overlap_xy
        results = []
        tol_safety = @options[:tol_safety_mm]
        dup_tol    = @options[:duplicate_pos_tol_mm]

        # Indexa por (peca_id, lado) — apenas faces planas; bordas tratam-se
        # noutra regra (intersects_banding) pois tem semântica diferente.
        index_by_face_side.each_value do |bucket|
          bucket.combination(2).each do |a, b|
            dx = a[:x_mm] - b[:x_mm]
            dy = a[:y_mm] - b[:y_mm]
            distance = Math.hypot(dx, dy)

            min_safe   = (a[:diametro_mm] + b[:diametro_mm]) / 2.0
            min_buffer = min_safe + tol_safety

            next if distance >= min_buffer

            # Subcaso :duplicate — XYZ+Ø+normal idênticos
            if duplicate?(a, b, dup_tol)
              results << build_collision(
                tipo: :duplicate,
                severity: :warning,
                op_a: a, op_b: b,
                distance_mm: distance.round(3),
                min_safe_mm: min_safe.round(2),
                message: "Furo duplicado: #{describe_op(a)} idêntico a #{describe_op(b)} — manter apenas um."
              )
              next
            end

            severity = distance < min_safe ? :error : :warning
            results << build_collision(
              tipo: :overlap_xy,
              severity: severity,
              op_a: a, op_b: b,
              distance_mm: distance.round(3),
              min_safe_mm: min_safe.round(2),
              message: build_overlap_message(a, b, distance, min_safe, severity)
            )
          end
        end

        results
      end

      # ───────────────────────────────────────────────────────────────
      # REGRA 2 — edge_too_close
      # Furo cujo center está a menos de edge_clearance_mm da borda
      # da peça-chapa âncora. Requer `pieces_bbox`.
      # ───────────────────────────────────────────────────────────────
      def detect_edge_too_close
        results = []
        clearance = @options[:edge_clearance_mm]

        @ops.each do |op|
          next unless face_side?(op[:lado])
          bbox = @pieces_bbox[op[:peca_id]]
          next unless bbox

          dx_min = op[:x_mm] - bbox_get(bbox, :x_min)
          dx_max = bbox_get(bbox, :x_max) - op[:x_mm]
          dy_min = op[:y_mm] - bbox_get(bbox, :y_min)
          dy_max = bbox_get(bbox, :y_max) - op[:y_mm]

          radius = op[:diametro_mm] / 2.0
          # Considera o RAIO do furo: a borda do furo (não o centro) é o
          # que efetivamente fica próximo da borda da peça.
          gaps = {
            edge_left:  dx_min - radius,
            edge_right: dx_max - radius,
            edge_front: dy_min - radius,
            edge_back:  dy_max - radius,
          }

          gaps.each do |edge, gap|
            next if gap >= clearance

            results << build_collision(
              tipo: :edge_too_close,
              severity: :warning,
              op_a: op, op_b: nil,
              distance_mm: gap.round(3),
              min_safe_mm: clearance,
              edge: edge,
              message: "Furo Ø#{op[:diametro_mm]} a #{gap.round(2)}mm da borda #{edge} (mínimo #{clearance}mm) — peça #{op[:peca_id]}."
            )
          end
        end

        results
      end

      # ───────────────────────────────────────────────────────────────
      # REGRA 3 — depth_through_other_face
      # Dois furos cegos em lados opostos da mesma peça, com mesmo XY,
      # cujas profundidades somadas excedem a espessura da peça.
      # ───────────────────────────────────────────────────────────────
      def detect_depth_through_other_face
        results = []
        col_tol = @options[:tol_safety_mm]

        @ops.group_by { |op| op[:peca_id] }.each do |peca_id, ops_da_peca|
          thickness = piece_thickness(peca_id)
          next unless thickness && thickness.positive?

          tops    = ops_da_peca.select { |o| o[:lado] == :topside }
          unders  = ops_da_peca.select { |o| o[:lado] == :underside }

          tops.each do |a|
            unders.each do |b|
              # Mesma "coluna" XY (dentro de tolerância)
              col_dist = Math.hypot(a[:x_mm] - b[:x_mm], a[:y_mm] - b[:y_mm])
              max_radius = [a[:diametro_mm], b[:diametro_mm]].max / 2.0
              next if col_dist > (max_radius + col_tol)

              soma = a[:profundidade_mm] + b[:profundidade_mm]
              next if soma <= thickness

              results << build_collision(
                tipo: :depth_through_other_face,
                severity: :error,
                op_a: a, op_b: b,
                distance_mm: col_dist.round(3),
                min_safe_mm: thickness,
                thickness_mm: thickness,
                soma_profundidades_mm: soma.round(2),
                message: "Furos cegos opostos colidem dentro da peça #{peca_id}: #{a[:profundidade_mm]}mm + #{b[:profundidade_mm]}mm = #{soma.round(2)}mm > espessura #{thickness}mm."
              )
            end
          end
        end

        results
      end

      # ───────────────────────────────────────────────────────────────
      # REGRA 4 — intersects_banding
      # Furo nas faces planas cuja proximidade da borda invade a zona
      # de fita de borda. Só dispara se o lado adjacente tem fita.
      # ───────────────────────────────────────────────────────────────
      def detect_intersects_banding
        results = []
        zone = @options[:banding_zone_mm]

        @ops.each do |op|
          next unless face_side?(op[:lado])
          bbox    = @pieces_bbox[op[:peca_id]]
          banding = @pieces_banding[op[:peca_id]]
          next unless bbox && banding && !banding.empty?

          radius = op[:diametro_mm] / 2.0
          checks = {
            edge_left:  (op[:x_mm] - bbox_get(bbox, :x_min)) - radius,
            edge_right: (bbox_get(bbox, :x_max) - op[:x_mm]) - radius,
            edge_front: (op[:y_mm] - bbox_get(bbox, :y_min)) - radius,
            edge_back:  (bbox_get(bbox, :y_max) - op[:y_mm]) - radius,
          }

          checks.each do |edge, gap|
            next unless banding.include?(edge)
            next if gap >= zone

            results << build_collision(
              tipo: :intersects_banding,
              severity: :warning,
              op_a: op, op_b: nil,
              distance_mm: gap.round(3),
              min_safe_mm: zone,
              edge: edge,
              message: "Furo Ø#{op[:diametro_mm]} invade zona de fita (#{zone}mm) na borda #{edge} da peça #{op[:peca_id]} — gap=#{gap.round(2)}mm."
            )
          end
        end

        results
      end

      private

      # ── Helpers de normalização ──────────────────────────────────

      def default_options
        {
          tol_safety_mm:        DEFAULT_TOL_SAFETY_MM,
          edge_clearance_mm:    DEFAULT_EDGE_CLEARANCE_MM,
          banding_zone_mm:      DEFAULT_BANDING_ZONE_MM,
          duplicate_pos_tol_mm: DEFAULT_DUPLICATE_POS_TOL_MM,
          thickness_default_mm: DEFAULT_THICKNESS_MM,
        }
      end

      # Aceita Hash OU qualquer objeto que responda a x_mm, y_mm, etc.
      # Retorna sempre um Hash interno padronizado, com chaves Symbol.
      def normalize_op(raw, idx)
        h = if raw.is_a?(Hash)
              raw.transform_keys(&:to_sym)
            else
              {
                tipo:            safe_send(raw, :tipo),
                peca_id:         safe_send(raw, :peca_id),
                x_mm:            safe_send(raw, :x_mm),
                y_mm:            safe_send(raw, :y_mm),
                z_mm:            safe_send(raw, :z_mm),
                diametro_mm:     safe_send(raw, :diametro_mm),
                profundidade_mm: safe_send(raw, :profundidade_mm),
                lado:            safe_send(raw, :lado),
                normal:          safe_send(raw, :normal),
                fonte:           safe_send(raw, :fonte),
              }
            end

        # Defaults defensivos
        h[:_id]              ||= "op##{idx}"
        h[:x_mm]             = (h[:x_mm] || 0.0).to_f
        h[:y_mm]             = (h[:y_mm] || 0.0).to_f
        h[:z_mm]             = (h[:z_mm] || 0.0).to_f
        h[:diametro_mm]      = (h[:diametro_mm] || 0.0).to_f
        h[:profundidade_mm]  = (h[:profundidade_mm] || 0.0).to_f
        h[:lado]             = h[:lado].to_sym if h[:lado].respond_to?(:to_sym)
        h
      end

      def safe_send(obj, m)
        obj.respond_to?(m) ? obj.public_send(m) : nil
      end

      # ── Helpers de indexação / classificação ──────────────────────

      # Apenas operações em faces planas (topside/underside).
      def index_by_face_side
        @ops
          .select { |op| face_side?(op[:lado]) }
          .group_by { |op| [op[:peca_id], op[:lado]] }
      end

      def face_side?(lado)
        FACE_SIDES.include?(lado)
      end

      def duplicate?(a, b, tol)
        return false unless (a[:x_mm] - b[:x_mm]).abs <= tol
        return false unless (a[:y_mm] - b[:y_mm]).abs <= tol
        return false unless (a[:z_mm] - b[:z_mm]).abs <= tol
        return false unless (a[:diametro_mm] - b[:diametro_mm]).abs <= tol
        return false unless a[:lado] == b[:lado]
        true
      end

      def piece_thickness(peca_id)
        bbox = @pieces_bbox[peca_id]
        return @options[:thickness_default_mm] unless bbox
        explicit = bbox_get(bbox, :thickness_mm)
        return explicit if explicit && explicit.positive?

        # Fallback: menor dimensão do bbox
        w = bbox_get(bbox, :x_max) - bbox_get(bbox, :x_min)
        h = bbox_get(bbox, :y_max) - bbox_get(bbox, :y_min)
        d = bbox_get(bbox, :z_max) - bbox_get(bbox, :z_min)
        dims = [w, h, d].compact.select(&:positive?)
        dims.min || @options[:thickness_default_mm]
      end

      def bbox_get(bbox, key)
        return bbox[key] if bbox.is_a?(Hash) && bbox.key?(key)
        return bbox[key.to_s] if bbox.is_a?(Hash) && bbox.key?(key.to_s)
        return bbox.public_send(key) if bbox.respond_to?(key)
        nil
      end

      # ── Builders de mensagem / colisão ────────────────────────────

      def build_collision(tipo:, severity:, op_a:, op_b:, message:, **extras)
        {
          tipo: tipo,
          severity: severity,
          op_a: op_a,
          op_b: op_b,
          message: message,
        }.merge(extras)
      end

      def build_overlap_message(a, b, distance, min_safe, severity)
        prefix = severity == :error ? "Sobreposição real" : "Margem de segurança violada"
        "#{prefix}: #{describe_op(a)} e #{describe_op(b)} a #{distance.round(2)}mm (mínimo #{min_safe.round(2)}mm)."
      end

      def describe_op(op)
        tipo = op[:tipo] || :furo
        "#{tipo} Ø#{op[:diametro_mm]}mm"
      end

      def build_stats(collisions)
        by_severity = Hash.new(0)
        ops_with_issues = Set.new
        collisions.each do |c|
          by_severity[c[:severity]] += 1
          ops_with_issues << op_key(c[:op_a]) if c[:op_a]
          ops_with_issues << op_key(c[:op_b]) if c[:op_b]
        end

        {
          ops_total: @ops.size,
          ops_with_issues: ops_with_issues.size,
          by_severity: { error: by_severity[:error], warning: by_severity[:warning] },
        }
      end

      def op_key(op)
        op[:_id] || op.object_id
      end
    end
  end
end
