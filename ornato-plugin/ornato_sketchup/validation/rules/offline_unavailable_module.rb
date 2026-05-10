# frozen_string_literal: true
# Rule: Módulo no projeto não está disponível offline (cache local).
# MVP placeholder — depende de LibrarySync / cache local.
# Severity: :info (não bloqueia, mas avisa que se cair internet quebra).

module Ornato
  module Validation
    module Rules
      class OfflineUnavailableModule < BaseRule
        # Placeholder — depende de LibrarySync/cache local não finalizado.
        MATURITY = :preliminary

        def detect
          issues = []
          return issues unless @model && @model.respond_to?(:active_entities)

          available = available_offline_set

          @model.active_entities.each do |ent|
            next unless ornato_module?(ent)
            module_type = safe_attr(ent, 'module_type', nil) ||
                          safe_attr(ent, 'tipo_ruby', nil)
            next if module_type.nil? || module_type.to_s.strip.empty?
            next if available.include?(module_type.to_s)

            issues << build_issue(
              severity: :info,
              title: '[Preliminar] Módulo não disponível offline',
              description: "Módulo '#{module_type}' não está no cache local. Sem internet, não dá pra editar parâmetros. Esta validação ainda é preliminar e pode gerar falsos positivos. Revise manualmente.",
              entity_id: entity_id(ent),
              entity_path: [entity_name(ent)],
              auto_fix_action: 'cache_module_offline',
              auto_fix_payload: { module_type: module_type.to_s }
            )
          end
          issues
        rescue
          []
        end

        private

        def available_offline_set
          if defined?(Ornato::Library::LibrarySync) &&
             Ornato::Library::LibrarySync.respond_to?(:cached_module_ids)
            (Ornato::Library::LibrarySync.cached_module_ids rescue []).map(&:to_s).to_set
          else
            require 'set'
            Set.new
          end
        rescue
          require 'set'
          Set.new
        end
      end
    end
  end
end
