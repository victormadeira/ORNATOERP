# frozen_string_literal: true
# Rule: Agregado (prateleira/divisória interna em bay_*) sem ferragem de fixação.
# MVP placeholder — implementação completa depende de Sprint Q (bay_aggregator).

module Ornato
  module Validation
    module Rules
      class AggregateWithoutHardware < BaseRule
        # Placeholder — Sprint Q ainda não implementou bay_aggregator real.
        MATURITY = :preliminary

        AGGREGATE_ROLES = %w[prateleira shelf divisoria divider].freeze

        def detect
          issues = []
          iterate_pieces do |piece, path|
            role = safe_attr(piece, 'role', '').to_s.downcase
            next unless AGGREGATE_ROLES.include?(role)

            bay = safe_attr(piece, 'bay_id', nil) || safe_attr(piece, 'bay', nil)
            next if bay.nil? || bay.to_s.strip.empty?

            has_hw = safe_attr(piece, 'hardware_attached', false) ||
                     safe_attr(piece, '_aggregate_hardware', false)
            next if has_hw == true || has_hw.to_s == 'true'

            issues << build_issue(
              severity: :info,
              title: '[Preliminar] Agregado sem ferragem detectado',
              description: "#{role.capitalize} em '#{bay}' não tem ferragem de fixação. Aplicar pino metálico ou suporte. Esta validação ainda é preliminar e pode gerar falsos positivos. Revise manualmente.",
              entity_id: entity_id(piece),
              entity_path: path,
              auto_fix_action: 'apply_default_hardware',
              auto_fix_payload: { rule: 'pino_metalico' }
            )
          end
          issues
        end
      end
    end
  end
end
