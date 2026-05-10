# frozen_string_literal: true
# Rule: Furação invade zona de fita de borda.
# Reusa Ornato::Machining::DrillingCollisionDetector e filtra :intersects_banding.
# Severity: :warning — fita pode descolar se furo invade a zona.

module Ornato
  module Validation
    module Rules
      class DrillingHittingBanding < BaseRule
        def detect
          collisions = collect_collisions
          return [] if collisions.empty?

          collisions
            .select { |c| c[:tipo] == :intersects_banding }
            .map { |c| build_collision_issue(c) }
        end

        private

        def collect_collisions
          return [] unless defined?(Ornato::Machining::DrillingCollisionDetector)
          ops, bbox, banding = collect_inputs
          return [] if ops.empty?
          detector = Ornato::Machining::DrillingCollisionDetector.new(
            ops, pieces_bbox: bbox, pieces_banding: banding
          )
          (detector.analyze[:collisions] || [])
        rescue
          []
        end

        # Em produção, isso virá de FerragemDrillingCollector.
        # Por enquanto, lê do attribute `_drilling_ops` se já houver cache.
        def collect_inputs
          ops = []
          bbox = {}
          banding = {}
          return [ops, bbox, banding] unless @model && @model.respond_to?(:active_entities)

          @model.active_entities.each do |ent|
            next unless ent.respond_to?(:get_attribute)
            cached = ent.get_attribute('Ornato', '_drilling_ops', nil)
            next unless cached
            list = cached.is_a?(String) ? (JSON.parse(cached, symbolize_names: true) rescue []) : cached
            ops.concat(list) if list.is_a?(Array)
          end
          [ops, bbox, banding]
        rescue
          [[], {}, {}]
        end

        def build_collision_issue(c)
          op = c[:op_a] || {}
          peca_id = op[:peca_id] || op['peca_id']
          build_issue(
            severity: c[:severity] || :warning,
            title: 'Furo conflita com fita de borda',
            description: c[:message] || "Furo invade zona de fita na peça #{peca_id}.",
            entity_id: peca_id.is_a?(Integer) ? peca_id : nil,
            entity_path: ["peça #{peca_id}"],
            auto_fix_action: nil,
            suffix: "#{peca_id}_#{op[:_id] || op[:x_mm]}_#{op[:y_mm]}"
          )
        end
      end
    end
  end
end
