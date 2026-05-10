# frozen_string_literal: true
# Rule: Expressão paramétrica não resolvida (atributo `_expr_error` ou
# valor de campo paramétrico permaneceu como string crua "{x}").
# MVP placeholder — não modifica wps_source/expression_evaluator.

module Ornato
  module Validation
    module Rules
      class ExpressionUnresolved < BaseRule
        # Placeholder — não plugamos no wps_source/expression_evaluator real.
        MATURITY = :preliminary

        EXPR_PATTERN = /\{[a-zA-Z_][a-zA-Z0-9_\.]*\}/

        def detect
          issues = []
          return issues unless @model && @model.respond_to?(:active_entities)

          @model.active_entities.each do |root|
            next unless ornato_module?(root)
            err = safe_attr(root, '_expr_error', nil)
            if err && !err.to_s.strip.empty?
              issues << build_issue(
                severity: :info,
                title: '[Preliminar] Expressão paramétrica falhou',
                description: "Módulo '#{entity_name(root)}': #{err}. Esta validação ainda é preliminar e pode gerar falsos positivos. Revise manualmente.",
                entity_id: entity_id(root),
                entity_path: [entity_name(root)],
                auto_fix_action: nil
              )
            end

            params_raw = safe_attr(root, 'params', nil)
            next unless params_raw
            params = params_raw.is_a?(String) ? (JSON.parse(params_raw) rescue {}) : params_raw
            next unless params.is_a?(Hash)

            params.each do |k, v|
              next unless v.is_a?(String) && v.match?(EXPR_PATTERN)
              issues << build_issue(
                severity: :info,
                title: '[Preliminar] Parâmetro com expressão não avaliada',
                description: "Em '#{entity_name(root)}', parâmetro '#{k}' = '#{v}' contém token não resolvido. Esta validação ainda é preliminar e pode gerar falsos positivos. Revise manualmente.",
                entity_id: entity_id(root),
                entity_path: [entity_name(root), k.to_s],
                auto_fix_action: nil,
                suffix: "#{entity_id(root)}_#{k}"
              )
            end
          end
          issues
        rescue
          []
        end
      end
    end
  end
end
