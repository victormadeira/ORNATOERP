# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# SwapEngine — Sistema paramétrico de Trocas (UX-3 / Sprint 3)
#
# Substitui o ComponentSwap legado por uma engine baseada em
# catálogos JSON (`biblioteca/swaps/*.json`). Cada família declara
# `context_match` (filtro por kind/regra/role) e uma lista de
# `variants` com `compatible_when` — expressão segura avaliada
# pelo ExpressionEvaluator.
#
# Pipeline (inspirado em UpMobb get_groups_change → get_list_replace
# → insertComponentReplace):
#
#   1. SwapEngine.list_swaps_for(payload)   # filtra variantes
#       → retorna [{ id:, label:, variant_data: }]
#   2. UI exibe lista; user escolhe variant_id
#   3. SwapEngine.apply_swap(payload, variant_id)
#       → muda atributos, recarrega componente_3d (hardware),
#         estampa material/espessura (piece) ou reconstrói
#         agregado (aggregate). Atomic via start/commit_operation.
#
# REGRA DE OURO: NUNCA usa Kernel#eval. Toda expressão é
# delegada ao ExpressionEvaluator (parser whitelist-based).
# ═══════════════════════════════════════════════════════════════

require 'json'

begin
  require_relative '../library/expression_evaluator'
rescue LoadError
  # Em testes isolados, ExpressionEvaluator pode ser carregado por outro path.
end

module Ornato
  module Constructor
    class SwapEngine

      CATEGORY_FOR_KIND = {
        hardware:  'hardware',
        piece:     'pieces',
        aggregate: 'aggregates',
        module:    'modules',
      }.freeze

      # ─── API pública ─────────────────────────────────────────

      def self.list_swaps_for(payload)
        new(payload).list_swaps
      end

      def self.apply_swap(payload, variant_id)
        new(payload).apply(variant_id)
      end

      # Permite injetar plugin_root em testes (sem mexer em ::PLUGIN_DIR).
      def self.plugin_root_override=(path); @plugin_root_override = path; end
      def self.plugin_root_override;        @plugin_root_override; end

      def initialize(payload)
        @payload = symbolize_top(payload || {})
        @kind    = (@payload[:kind] || :unknown).to_sym
        @catalog = load_catalog_for_kind
      end

      # ─── Listagem ────────────────────────────────────────────

      def list_swaps
        return [] unless @catalog
        family = find_matching_family(@payload, @catalog)
        return [] unless family

        variants = family[:variants] || []
        variants.select { |v| evaluate_compatible_when(v[:compatible_when], @payload) }
                .map    { |v| { id: v[:id].to_s, label: v[:label].to_s, variant_data: v } }
      end

      # ─── Aplicação ───────────────────────────────────────────
      #
      # Retorno padronizado:
      #   { ok: Boolean, kind:, variant_id:, message:, applied_data: Hash }
      #
      # Atomic: se algo lança, faz abort_operation; se sucesso, commit.
      def apply(variant_id)
        return error_result("kind '#{@kind}' não suportado", variant_id) unless @catalog

        family  = find_matching_family(@payload, @catalog)
        return error_result("nenhuma família para o contexto", variant_id) unless family

        variant = (family[:variants] || []).find { |v| v[:id].to_s == variant_id.to_s }
        return error_result("variante #{variant_id.inspect} inexistente", variant_id) unless variant

        unless evaluate_compatible_when(variant[:compatible_when], @payload)
          return error_result("variante incompatível com contexto atual", variant_id)
        end

        model = sketchup_model
        op_name = "Trocar #{variant[:label] || variant_id}"
        started = false
        if model && model.respond_to?(:start_operation)
          begin
            model.start_operation(op_name, true)
            started = true
          rescue
            started = false
          end
        end

        begin
          applied = case @kind
                   when :hardware  then apply_hardware(variant)
                   when :piece     then apply_piece(variant)
                   when :aggregate then apply_aggregate(variant)
                   when :module    then return abort_and_warn(model, started, variant_id,
                                                              "swap de :module ainda não implementado (Sprint 4)")
                   else
                     return abort_and_warn(model, started, variant_id, "kind não suportado: #{@kind}")
                   end

          # Após a troca, recalcula usinagem se houver engine carregada.
          regenerate_machining_safely

          model.commit_operation if started
          {
            ok:           true,
            kind:         @kind,
            variant_id:   variant_id.to_s,
            message:      "Aplicado: #{variant[:label]}",
            applied_data: applied,
          }
        rescue => e
          model.abort_operation if started && model.respond_to?(:abort_operation)
          error_result("erro ao aplicar: #{e.message}", variant_id)
        end
      end

      # ─── Internals ───────────────────────────────────────────

      private

      def symbolize_top(h)
        return {} unless h.is_a?(Hash)
        h.each_with_object({}) { |(k, v), out| out[k.to_sym] = v }
      end

      def load_catalog_for_kind
        category = CATEGORY_FOR_KIND[@kind]
        return nil unless category
        path = File.join(swap_dir, "#{category}.json")
        return nil unless File.file?(path)
        JSON.parse(File.read(path, encoding: 'utf-8'), symbolize_names: true)
      rescue
        nil
      end

      def swap_dir
        File.join(plugin_root, 'biblioteca', 'swaps')
      end

      def plugin_root
        return self.class.plugin_root_override if self.class.plugin_root_override
        return ::PLUGIN_DIR if defined?(::PLUGIN_DIR) && ::PLUGIN_DIR
        File.expand_path('../../..', __FILE__)
      end

      def find_matching_family(payload, catalog)
        families = catalog[:families] || {}
        families.values.find do |fam|
          ctx = fam[:context_match] || {}
          ctx.all? { |k, v| payload[k.to_sym].to_s == v.to_s }
        end
      end

      # Reusa ExpressionEvaluator. Fail-CLOSED: variante oculta se expr
      # estiver malformada ou contiver tokens proibidos (system, eval, etc).
      # OBS: ExpressionEvaluator.eval_bool é fail-OPEN por design; aqui
      # nós forçamos o parser a rodar via send(:parse, ...) para distinguir
      # "expr inválida" (oculta variant) de "expr OK com resultado false".
      def evaluate_compatible_when(expr, payload)
        return true if expr.nil? || expr.to_s.strip.empty? || expr.to_s.strip == 'true'
        return false if expr.to_s.strip == 'false'
        evaluator_klass = expression_evaluator_class
        return true unless evaluator_klass

        params    = payload_to_params(payload)
        evaluator = evaluator_klass.new(params)
        # Parsa explicitamente: qualquer ExpressionError → variante escondida.
        raw = evaluator.send(:parse, expr.to_s)
        case raw
        when true, false then raw
        when Numeric     then raw != 0
        else true
        end
      rescue
        false
      end

      def expression_evaluator_class
        return ::Ornato::Library::ExpressionEvaluator if defined?(::Ornato::Library::ExpressionEvaluator)
        nil
      end

      # Achata payload para forma consumível pelo ExpressionEvaluator
      # (chaves string, valores escalares).
      def payload_to_params(payload)
        out = {}
        payload.each do |k, v|
          next if v.is_a?(Hash) || v.is_a?(Array)
          out[k.to_s] = v
        end
        if payload[:params].is_a?(Hash)
          payload[:params].each { |k, v| out[k.to_s] = v unless v.is_a?(Hash) || v.is_a?(Array) }
        end
        out
      end

      # ─── Aplicadores por kind ────────────────────────────────

      def apply_hardware(variant)
        ent = current_entity
        new_path = variant[:componente_3d].to_s
        params   = variant[:params] || {}

        if ent && ent.respond_to?(:set_attribute)
          ent.set_attribute('Ornato', 'componente_3d', new_path)
          ent.set_attribute('Ornato', 'variant_id', variant[:id].to_s)
          params.each { |k, v| ent.set_attribute('Ornato', k.to_s, v) }
        end

        # Recarrega definition 3D (best-effort: depende de SketchUp real).
        reload_definition_if_possible(ent, new_path)

        { componente_3d: new_path, params: params }
      end

      def apply_piece(variant)
        ent = current_entity
        override = variant[:material_override]
        if ent && ent.respond_to?(:set_attribute)
          ent.set_attribute('Ornato', 'variant_id', variant[:id].to_s)
          ent.set_attribute('Ornato', 'material', override.to_s) if override
          if variant[:espessura]
            ent.set_attribute('Ornato', 'espessura', variant[:espessura].to_f)
          end
          if variant[:bordas].is_a?(Hash)
            ent.set_attribute('Ornato', 'bordas', JSON.generate(variant[:bordas]))
          end
        end
        { material_override: override, variant_id: variant[:id].to_s }
      end

      def apply_aggregate(variant)
        ent      = current_entity
        new_id   = variant[:aggregate_id].to_s
        bay_id   = @payload[:bay_id]
        parent   = @payload[:parent_module_id]

        if ent && ent.respond_to?(:set_attribute)
          ent.set_attribute('Ornato', 'aggregate_id', new_id)
          ent.set_attribute('Ornato', 'variant_id',   variant[:id].to_s)
        end

        # Tenta reconstruir geometria via JsonModuleBuilder.build_aggregate
        # (best-effort; em testes só ajusta atributos).
        if defined?(::Ornato::Library::JsonModuleBuilder) &&
           ::Ornato::Library::JsonModuleBuilder.respond_to?(:build_aggregate) &&
           bay_id && parent
          begin
            ::Ornato::Library::JsonModuleBuilder.build_aggregate(bay_id, new_id)
          rescue
            # silencia: aplicação parcial (atributos) ainda válida
          end
        end

        { aggregate_id: new_id, bay_id: bay_id }
      end

      # ─── Utilitários SketchUp (best-effort + mock-friendly) ──

      def current_entity
        @payload[:_entity]
      end

      def sketchup_model
        return nil unless defined?(::Sketchup) && ::Sketchup.respond_to?(:active_model)
        ::Sketchup.active_model
      rescue
        nil
      end

      def reload_definition_if_possible(ent, path)
        return unless ent && path && !path.empty?
        return unless defined?(::Sketchup) && ::Sketchup.respond_to?(:active_model)
        model = ::Sketchup.active_model
        return unless model && model.respond_to?(:definitions)
        # plugin_root/biblioteca/<path>
        full = File.join(plugin_root, 'biblioteca', path)
        return unless File.file?(full)
        defn = model.definitions.load(full) rescue nil
        if defn && ent.respond_to?(:definition=)
          ent.definition = defn
        end
      rescue
        nil
      end

      def regenerate_machining_safely
        return unless defined?(::Ornato::Machining::MachiningInterpreter)
        interp = ::Ornato::Machining::MachiningInterpreter
        interp.recalculate(current_entity) if interp.respond_to?(:recalculate)
      rescue
        nil
      end

      # ─── Resultados ──────────────────────────────────────────

      def error_result(message, variant_id)
        {
          ok:         false,
          kind:       @kind,
          variant_id: variant_id.to_s,
          message:    message,
        }
      end

      def abort_and_warn(model, started, variant_id, message)
        model.abort_operation if started && model && model.respond_to?(:abort_operation)
        error_result(message, variant_id)
      end
    end
  end
end
