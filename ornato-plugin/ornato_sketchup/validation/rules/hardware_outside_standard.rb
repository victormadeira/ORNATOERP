# frozen_string_literal: true
# Rule: Ferragem 3D com `regra` fora do catálogo conhecido.
# Severity: :warning — pode ser custom mas o cálculo de furação não vai ter base.

module Ornato
  module Validation
    module Rules
      class HardwareOutsideStandard < BaseRule
        # Catálogo padrão (mantido em sync com hardware/rules_engine.rb).
        KNOWN_RULES = %w[
          hinge minifix confirmat dowel handle drawer_slide back_panel
          shelf system32 led_channel gas_piston sliding_door miter passthrough
          dobradica puxador minifix_op cavilha corrediça corredica sistema_32
          rasgo_fundo prateleira pino_metalico
        ].freeze

        def detect
          issues = []
          return issues unless @model && @model.respond_to?(:active_entities)

          known = catalog_keys

          walk_all do |ent, path|
            tipo = safe_attr(ent, 'tipo')
            next unless tipo.to_s == 'ferragem'

            regra = safe_attr(ent, 'regra') || safe_attr(ent, 'rule') || safe_attr(ent, 'tipo_ferragem')
            next if regra.nil? || regra.to_s.strip.empty?

            key = regra.to_s.downcase
            next if known.include?(key)

            issues << build_issue(
              severity: :warning,
              title: 'Ferragem fora do padrão',
              description: "Ferragem '#{path.last}' usa regra '#{regra}' que não está no catálogo Ornato.",
              entity_id: entity_id(ent),
              entity_path: path,
              auto_fix_action: nil
            )
          end
          issues
        rescue
          []
        end

        private

        def catalog_keys
          base = KNOWN_RULES.dup
          if defined?(Ornato::Catalog::HardwareCatalog) &&
             Ornato::Catalog::HardwareCatalog.respond_to?(:known_rules)
            extra = (Ornato::Catalog::HardwareCatalog.known_rules rescue [])
            base.concat(extra.map(&:to_s))
          end
          base.map(&:downcase).uniq
        end

        def walk_all(&block)
          @model.active_entities.each do |root|
            next unless ornato_module?(root)
            recurse(root, [entity_name(root)], &block)
          end
        end

        def recurse(group, path, &block)
          return unless group.respond_to?(:entities)
          group.entities.each do |child|
            next unless child.is_a_group_or_instance?
            block.call(child, path + [entity_name(child)])
            recurse(child, path + [entity_name(child)], &block) if child.respond_to?(:entities)
          end
        end
      end
    end
  end
end
