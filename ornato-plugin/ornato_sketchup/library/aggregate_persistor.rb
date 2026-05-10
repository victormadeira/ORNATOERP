# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# AggregatePersistor — Sprint MIRA-D / REFLOW
#
# Responsabilidade: persistir agregados antes de um rebuild do
# modulo pai e remapeá-los para os novos bays detectados após o
# resize. Sem isso, qualquer mudança de largura/altura/profundidade
# do módulo apagaria silenciosamente todos os agregados (prateleiras,
# divisórias, gaveteiros) inseridos via AimPlacementTool.
#
# Fluxo:
#   1. snapshot(parent_group)           → Array<spec>
#   2. … rebuild apaga tudo …
#   3. detector = BayDetector.new(group); new_bays = detector.bays
#   4. spec.each { |s| match_bay_after_resize(s[:signature], new_bays) }
#   5. JsonModuleBuilder.build_aggregate(new_bay, s[:aggregate_id], s[:params])
#
# Bay signature (estável a resize razoável):
#   neighbors    — hash side→role canônico ({top: :top, bottom: :base, ...})
#   relative_pos — frações [0..1] do bbox do módulo (canto inferior-esq-fundo do bay)
#   type         — :interior_bay (MVP)
#   index        — ordem canônica como tie-breaker
#
# Limitações MVP:
#   - resize que altera nº de prateleiras/divisórias do pai pode
#     mudar a topologia → nem sempre dá pra remapear (warn + skip).
#   - signature posicional é tolerante (5%); resize drástico (ex.
#     800→200mm) com agregado que não cabe no novo vão é descartado.
#   - bay_target diferente de :interior_bay não é tratado.
# ═══════════════════════════════════════════════════════════════

require 'json'
require_relative '../core/logger'

module Ornato
  module Library
    class AggregatePersistor
      # Tolerância (frações) para casar relative_pos entre snapshots.
      POS_TOLERANCE = 0.05
      DIM_TOLERANCE = 0.10

      # ── Snapshot ─────────────────────────────────────────────
      # @param parent_group [Sketchup::Group | mock]
      # @return [Array<Hash>] specs prontos para rebuild_aggregates
      def self.snapshot(parent_group)
        return [] unless parent_group && parent_group.respond_to?(:get_attribute)

        raw = parent_group.get_attribute('Ornato', 'aggregates', '[]')
        list = parse_json(raw, default: [])
        return [] unless list.is_a?(Array) && !list.empty?

        index_counter = 0
        list.map do |entry|
          next nil unless entry.is_a?(Hash)
          agg = find_entity_in_group(parent_group, entry['id'])
          next nil unless agg && entity_valid?(agg)

          spec = {
            aggregate_id: entry['aggregate_id'].to_s,
            bay_id:       entry['bay_id'],
            params:       parse_agg_params(agg),
            signature:    build_signature(agg, parent_group, index_counter),
          }
          index_counter += 1
          spec
        end.compact
      rescue => e
        log_warn("AggregatePersistor.snapshot erro: #{e.message}")
        []
      end

      # ── Match após resize ────────────────────────────────────
      # Retorna o Bay compatível mais provável, ou nil.
      def self.match_bay_after_resize(signature, new_bays, parent_group = nil)
        return nil if signature.nil? || new_bays.nil? || new_bays.empty?

        compat = new_bays.each_with_index.select do |bay, _|
          signatures_compatible?(signature, bay_signature(bay, parent_group, 0))
        end
        return nil if compat.empty?

        # Tie-break por proximidade de relative_pos
        ranked = compat.min_by do |bay, _idx|
          rp_new = bay_signature(bay, parent_group, 0)[:relative_pos]
          relative_pos_distance(signature[:relative_pos], rp_new)
        end
        ranked && ranked[0]
      end

      # ── Builder de signature a partir do agregado existente ──
      def self.build_signature(agg, parent_group, fallback_index = 0)
        # 1. Lê signature persistido (se foi stampado em build_aggregate)
        raw = agg.get_attribute('Ornato', 'bay_signature', nil) if agg.respond_to?(:get_attribute)
        if raw.is_a?(String) && !raw.empty?
          parsed = parse_json(raw, default: nil)
          if parsed.is_a?(Hash)
            return {
              neighbors:     symbolize_neighbors(parsed['neighbors'] || {}),
              relative_pos:  parsed['relative_pos'] || parsed['relative_position'] || {},
              type:          (parsed['type'] || 'interior_bay').to_sym,
              index:         parsed['index'] || fallback_index,
            }
          end
        end

        # 2. Fallback: deriva do bay_bbox armazenado
        bay_bbox = parse_json(agg.get_attribute('Ornato', 'bay_bbox', '{}'), default: {})
        {
          neighbors:    {},
          relative_pos: derive_rel_pos_from_bbox(bay_bbox, parent_group),
          type:         :interior_bay,
          index:        fallback_index,
        }
      end

      # Computa signature de um Bay vivo (após detect).
      def self.bay_signature(bay, parent_group, fallback_index = 0)
        rp = bay_relative_position(bay, parent_group)
        neigh = symbolize_neighbors(
          (bay.respond_to?(:neighbor_roles) ? bay.neighbor_roles : {}) || {}
        )
        {
          neighbors:    neigh,
          relative_pos: rp,
          type:         (bay.respond_to?(:type) ? bay.type : :interior_bay),
          index:        fallback_index,
        }
      end

      # ── Match algorithm ──────────────────────────────────────
      # Compara dois signatures: neighbors precisam coincidir nos
      # roles "duros" (lateral/divider/base/top/back_panel); shelf
      # é flexível (pode aparecer/desaparecer com resize).
      def self.signatures_compatible?(a, b)
        return false unless a.is_a?(Hash) && b.is_a?(Hash)
        return false unless (a[:type] || :interior_bay) == (b[:type] || :interior_bay)

        if !a[:neighbors].empty? && !b[:neighbors].empty?
          %i[left right back].each do |side|
            r_a = a[:neighbors][side]
            r_b = b[:neighbors][side]
            next if r_a.nil? || r_b.nil?
            return false unless r_a.to_s == r_b.to_s
          end
        end

        rp_a = a[:relative_pos] || {}
        rp_b = b[:relative_pos] || {}
        %w[x y z].each do |k|
          va = (rp_a[k] || rp_a[k.to_sym]).to_f
          vb = (rp_b[k] || rp_b[k.to_sym]).to_f
          return false if (va - vb).abs > POS_TOLERANCE
        end
        true
      end

      def self.relative_pos_distance(rp_a, rp_b)
        return Float::INFINITY if rp_a.nil? || rp_b.nil?
        sum = 0.0
        %w[x y z].each do |k|
          va = (rp_a[k] || rp_a[k.to_sym]).to_f
          vb = (rp_b[k] || rp_b[k.to_sym]).to_f
          sum += (va - vb)**2
        end
        Math.sqrt(sum)
      end

      # ── Helpers ──────────────────────────────────────────────

      # Calcula posição relativa (frações) do bay dentro do parent_group.
      # Usa bay.bbox_local (BBox em mm) e parent_group.bounds (inches).
      def self.bay_relative_position(bay, parent_group)
        return {} unless bay.respond_to?(:bbox_local)
        bb = bay.bbox_local
        pmin, pmax = parent_extent_mm(parent_group, bb)
        {
          'x' => safe_frac(bb.x_min - pmin[0], pmax[0] - pmin[0]),
          'y' => safe_frac(bb.y_min - pmin[1], pmax[1] - pmin[1]),
          'z' => safe_frac(bb.z_min - pmin[2], pmax[2] - pmin[2]),
        }
      end

      def self.derive_rel_pos_from_bbox(bay_params, parent_group)
        # bay_params veio de bay_to_params: largura/altura/profundidade —
        # não tem origem absoluta. Sem origem, devolve fração 0 (centro
        # arbitrário). O signature persistido pelo build_aggregate é a
        # fonte preferida; este é só fallback.
        { 'x' => 0.0, 'y' => 0.0, 'z' => 0.0 }
      end

      # Estima [min, max] mm do bbox do parent. Tenta `.bounds` (SketchUp);
      # senão, usa o próprio bay como referência (degenerado mas seguro).
      def self.parent_extent_mm(parent_group, fallback_bb)
        if parent_group.respond_to?(:bounds)
          bnds = parent_group.bounds
          if bnds.respond_to?(:min) && bnds.respond_to?(:max)
            mn = bnds.min; mx = bnds.max
            if mn.respond_to?(:x) && mx.respond_to?(:x)
              return [
                [to_mm(mn.x), to_mm(mn.y), to_mm(mn.z)],
                [to_mm(mx.x), to_mm(mx.y), to_mm(mx.z)],
              ]
            end
          end
        end
        # Fallback degenerado
        [
          [fallback_bb.x_min, fallback_bb.y_min, fallback_bb.z_min],
          [fallback_bb.x_max, fallback_bb.y_max, fallback_bb.z_max],
        ]
      end

      def self.to_mm(v)
        return v.to_f * 25.4 if v.respond_to?(:to_f) && !v.respond_to?(:to_mm)
        v.respond_to?(:to_mm) ? v.to_mm.to_f : v.to_f
      rescue
        v.to_f
      end

      def self.safe_frac(num, den)
        return 0.0 if den.nil? || den.abs < 1e-6
        (num.to_f / den.to_f).round(6)
      end

      def self.symbolize_neighbors(h)
        return {} unless h.is_a?(Hash)
        h.each_with_object({}) do |(k, v), acc|
          acc[k.to_sym] = v.nil? ? nil : v.to_sym
        end
      end

      def self.parse_agg_params(agg)
        raw = agg.get_attribute('Ornato', 'params', '{}')
        parse_json(raw, default: {})
      end

      def self.parse_json(raw, default:)
        return default if raw.nil?
        return raw if raw.is_a?(Hash) || raw.is_a?(Array)
        s = raw.to_s
        return default if s.empty?
        JSON.parse(s)
      rescue
        default
      end

      def self.find_entity_in_group(parent_group, entity_id)
        return nil unless parent_group && parent_group.respond_to?(:entities)
        return nil if entity_id.nil?
        target = entity_id.to_i
        parent_group.entities.find do |ent|
          ent.respond_to?(:entityID) && ent.entityID == target
        end
      rescue
        nil
      end

      def self.entity_valid?(ent)
        return false if ent.nil?
        return ent.valid? if ent.respond_to?(:valid?)
        true
      end

      def self.log_warn(msg)
        if defined?(Ornato::Logger) && Ornato::Logger.respond_to?(:warn)
          Ornato::Logger.warn(msg)
        else
          warn(msg)
        end
      end
    end
  end
end
