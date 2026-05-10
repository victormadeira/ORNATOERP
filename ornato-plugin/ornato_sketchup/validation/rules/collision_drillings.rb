# frozen_string_literal: true
# Rule: Colisão entre furações (overlap_xy + depth_through_other_face).
# Reusa Ornato::Machining::DrillingCollisionDetector.
# Severity: copia do detector (:error pra real overlap, :warning pra margem).

module Ornato
  module Validation
    module Rules
      class CollisionDrillings < BaseRule
        TARGET_TYPES = [:overlap_xy, :depth_through_other_face, :duplicate].freeze

        def detect
          collisions = collect_collisions
          return [] if collisions.empty?

          collisions
            .select { |c| TARGET_TYPES.include?(c[:tipo]) }
            .map { |c| build_collision_issue(c) }
        end

        private

        def collect_collisions
          return [] unless defined?(Ornato::Machining::DrillingCollisionDetector)
          ops = collect_ops
          return [] if ops.empty?
          detector = Ornato::Machining::DrillingCollisionDetector.new(ops)
          (detector.analyze[:collisions] || [])
        rescue
          []
        end

        def collect_ops
          ops = []
          return ops unless @model && @model.respond_to?(:active_entities)
          @model.active_entities.each do |ent|
            next unless ent.respond_to?(:get_attribute)
            cached = ent.get_attribute('Ornato', '_drilling_ops', nil)
            next unless cached
            list = cached.is_a?(String) ? (JSON.parse(cached, symbolize_names: true) rescue []) : cached
            ops.concat(list) if list.is_a?(Array)
          end
          ops
        rescue
          []
        end

        def build_collision_issue(c)
          op_a = c[:op_a] || {}
          op_b = c[:op_b] || {}
          peca_id = op_a[:peca_id] || op_a['peca_id']
          title = case c[:tipo]
                  when :depth_through_other_face then 'Furos cegos opostos colidem'
                  when :duplicate then 'Furo duplicado'
                  else 'Furos sobrepostos na mesma face'
                  end
          build_issue(
            severity: c[:severity] || :warning,
            title: title,
            description: c[:message] || "#{c[:tipo]} na peça #{peca_id}.",
            entity_id: peca_id.is_a?(Integer) ? peca_id : nil,
            entity_path: ["peça #{peca_id}"],
            auto_fix_action: c[:tipo] == :duplicate ? 'remove_duplicate_drilling' : nil,
            suffix: "#{peca_id}_#{op_a[:_id] || op_a[:x_mm]}_#{op_b[:_id] || op_b[:x_mm]}"
          )
        end
      end
    end
  end
end
