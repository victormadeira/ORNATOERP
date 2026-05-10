# frozen_string_literal: true
# Rule: Role da peça fora do RoleNormalizer.MAP
# Severity: :warning — role desconhecido faz a engine tratar como :unknown
# e ferragens estruturais não são aplicadas.

module Ornato
  module Validation
    module Rules
      class EdgeRoleInvalid < BaseRule
        def detect
          issues = []
          map = role_map_keys
          iterate_pieces do |piece, path|
            role = safe_attr(piece, 'role', nil) || safe_attr(piece, 'tipo_peca', nil)
            next if role.nil? || role.to_s.strip.empty?

            key = role.to_s.downcase
            next if map.include?(key) || map.include?(role.to_s)

            issues << build_issue(
              severity: :warning,
              title: 'Role de peça não reconhecido',
              description: "Peça '#{path.last}' tem role '#{role}' que não está no RoleNormalizer.MAP. " \
                           "Será tratada como :unknown e não receberá ferragens estruturais.",
              entity_id: entity_id(piece),
              entity_path: path,
              auto_fix_action: nil
            )
          end
          issues
        end

        private

        def role_map_keys
          if defined?(Ornato::Core::RoleNormalizer) &&
             Ornato::Core::RoleNormalizer.const_defined?(:MAP)
            Ornato::Core::RoleNormalizer::MAP.keys.map { |k| k.to_s.downcase }
          else
            %w[lateral lateral_esq lateral_dir base topo top porta door
               porta_correr traseira fundo back back_panel prateleira shelf
               divisoria divider rodape kick]
          end
        end
      end
    end
  end
end
