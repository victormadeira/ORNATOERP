# frozen_string_literal: true
# Rule: Peça sem material
# Severity: :error — sem material não tem como gerar nesting/orçamento.
# Auto-fix: aplica material default da config (apply_default_material).

module Ornato
  module Validation
    module Rules
      class PieceWithoutMaterial < BaseRule
        DEFAULT_MATERIAL = 'MDF18_BrancoTX'

        def detect
          issues = []
          iterate_pieces do |piece, path|
            mat = safe_attr(piece, 'material', '')
            next unless mat.nil? || mat.to_s.strip.empty?

            eid = entity_id(piece)
            issues << build_issue(
              severity: :error,
              title: 'Peça sem material',
              description: "A peça '#{path.last}' não tem material atribuído. Aplicar default ou ajustar manualmente.",
              entity_id: eid,
              entity_path: path,
              auto_fix_action: 'apply_default_material',
              auto_fix_payload: { material: DEFAULT_MATERIAL }
            )
          end
          issues
        end
      end
    end
  end
end
