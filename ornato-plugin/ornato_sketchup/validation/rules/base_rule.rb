# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# BaseRule — superclasse abstrata pras Rules de validação.
#
# Subclasses devem implementar:
#   #detect → Array<Hash> seguindo o schema do ValidationRunner.
#
# Helpers utilitários:
#   - iterate_pieces { |group, path| ... }   # walks ornato modules → peças
#   - build_issue(...)                        # builder canônico
# ═══════════════════════════════════════════════════════════════════════

module Ornato
  module Validation
    module Rules
      class BaseRule
        # Maturidade da rule:
        #   :stable      → comportamento validado em MVP, confiável.
        #   :preliminary → placeholder/heurística incompleta; pode gerar
        #                  falsos positivos/negativos. UI deve sinalizar.
        MATURITY = :stable

        attr_reader :model

        # @param model [Sketchup::Model, nil]
        def initialize(model = nil)
          @model = model
        end

        # @return [Array<Hash>] subclasses devem sobrescrever
        def detect
          []
        end

        # Identificador estável da rule (snake_case do nome da classe).
        def self.rule_id
          @rule_id ||= name.split('::').last
            .gsub(/([A-Z]+)([A-Z][a-z])/, '\1_\2')
            .gsub(/([a-z\d])([A-Z])/, '\1_\2')
            .downcase
        end

        # Maturidade da rule. Subclasses placeholder devem sobrescrever a
        # constante MATURITY (= :preliminary).
        def self.maturity
          const_defined?(:MATURITY, false) ? const_get(:MATURITY) : superclass.maturity
        end

        def maturity
          self.class.maturity
        end

        def preliminary?
          maturity == :preliminary
        end

        protected

        def build_issue(severity:, title:, description:,
                        entity_id: nil, entity_path: [],
                        auto_fix_action: nil, auto_fix_payload: nil,
                        suffix: nil)
          rule = self.class.rule_id
          uid_seed = entity_id || suffix || description.hash
          is_preliminary = preliminary?
          {
            id: "#{rule}_#{uid_seed}",
            rule: rule,
            severity: severity,
            title: title,
            description: description,
            entity_id: entity_id,
            entity_path: Array(entity_path),
            # auto_fix indisponível em regras preliminares (não é confiável).
            auto_fix_available: !auto_fix_action.nil? && !is_preliminary,
            auto_fix_action: is_preliminary ? nil : auto_fix_action,
            auto_fix_payload: is_preliminary ? nil : auto_fix_payload,
            ignore_token: nil,
            placeholder: is_preliminary,
            maturity: maturity.to_s,
          }
        end

        # Itera grupos Ornato no modelo. yield(group, path).
        # path: ['<modulo_name>', '<peca_name>'] (até onde der pra inferir)
        def iterate_pieces
          return unless @model && @model.respond_to?(:active_entities)
          @model.active_entities.each do |ent|
            next unless ornato_module?(ent)
            mod_name = entity_name(ent)
            walk_pieces(ent, [mod_name]) { |p, path| yield(p, path) }
          end
        rescue
          # Defensivo: em testes/modo headless, swallow
        end

        def walk_pieces(group, path, &block)
          return unless group.respond_to?(:entities)
          group.entities.each do |child|
            next unless child.is_a_group_or_instance?
            tipo = safe_attr(child, 'tipo')
            if tipo.to_s == 'peca'
              block.call(child, path + [entity_name(child)])
            elsif child.respond_to?(:entities)
              walk_pieces(child, path + [entity_name(child)], &block)
            end
          end
        rescue
        end

        def ornato_module?(ent)
          return false unless ent.respond_to?(:get_attribute)
          !!(safe_attr(ent, 'module_type') || safe_attr(ent, 'params'))
        end

        def safe_attr(ent, key, default = nil)
          return default unless ent.respond_to?(:get_attribute)
          ent.get_attribute('Ornato', key, default)
        rescue
          default
        end

        def entity_name(ent)
          return '' unless ent
          (ent.respond_to?(:name) ? ent.name : '').to_s
        end

        def entity_id(ent)
          ent.respond_to?(:entityID) ? ent.entityID : nil
        end
      end
    end
  end
end

# Polyfill p/ duck-typing em testes sem SketchUp.
class Object
  def is_a_group_or_instance?
    return true if respond_to?(:_ornato_pieceish?) && _ornato_pieceish?
    if defined?(Sketchup)
      return true if is_a?(Sketchup::Group) || is_a?(Sketchup::ComponentInstance)
    end
    false
  end
end
