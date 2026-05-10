# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# ValidationRunner — Central de validação do modelo Ornato
#
# Roda múltiplas Rules em sequência sobre o modelo SketchUp ativo, agrega
# issues padronizadas e expõe stats por severity. Pure-data: NÃO modifica
# o modelo (auto-fix é feito por callbacks separados em dialog_controller).
#
# Schema de issue (cada Rule#detect retorna Array<Hash>):
#   {
#     id: 'piece_without_material_<entity_id>',
#     rule: 'piece_without_material',
#     severity: :error | :warning | :info,
#     title: 'Peça sem material',
#     description: 'A lateral esquerda do balcão não tem material atribuído',
#     entity_id: 12345,                    # nil se não aplicável
#     entity_path: ['Balcão 2 portas', 'Lateral esq'],
#     auto_fix_available: true,
#     auto_fix_action: 'apply_default_material',
#     auto_fix_payload: { material: 'MDF18_BrancoTX' },  # opcional
#     ignore_token: nil,
#     placeholder: false,               # true se rule é :preliminary
#     maturity: 'stable'                # 'stable' | 'preliminary'
#   }
#
# Uso:
#   runner = Ornato::Validation::ValidationRunner.new
#   report = runner.run
#   # => { run_at:, total:, by_severity:, rule_maturity: {rule => :stable|:preliminary}, issues: [...] }
# ═══════════════════════════════════════════════════════════════════════

require_relative 'rules/base_rule'
require_relative 'rules/piece_without_material'
require_relative 'rules/edge_role_invalid'
require_relative 'rules/drilling_hitting_banding'
require_relative 'rules/collision_drillings'
require_relative 'rules/hardware_outside_standard'
require_relative 'rules/aggregate_without_hardware'
require_relative 'rules/offline_unavailable_module'
require_relative 'rules/expression_unresolved'

module Ornato
  module Validation
    class ValidationRunner
      ALL_RULES = [
        Validation::Rules::PieceWithoutMaterial,
        Validation::Rules::DrillingHittingBanding,
        Validation::Rules::HardwareOutsideStandard,
        Validation::Rules::AggregateWithoutHardware,
        Validation::Rules::OfflineUnavailableModule,
        Validation::Rules::ExpressionUnresolved,
        Validation::Rules::EdgeRoleInvalid,
        Validation::Rules::CollisionDrillings,
      ].freeze

      attr_reader :model, :rules

      # @param model [Sketchup::Model, nil] modelo ativo (nil em testes)
      # @param rules [Array<Class>, nil] override pra testes (default: ALL_RULES)
      def initialize(model = nil, rules: nil)
        @model = model || (defined?(Sketchup) ? Sketchup.active_model : nil)
        @rules = rules || ALL_RULES
      end

      # Roda todas as rules e retorna o relatório agregado.
      #
      # @return [Hash] { run_at:, total:, by_severity:, issues: }
      def run
        issues = []
        rule_maturity = {}
        @rules.each do |rule_class|
          begin
            maturity = rule_class.respond_to?(:maturity) ? rule_class.maturity : :stable
            rule_id = rule_class.respond_to?(:rule_id) ? rule_class.rule_id : nil
            rule_maturity[rule_id] = maturity if rule_id
            rule = rule_class.new(@model)
            detected = rule.detect || []
            issues.concat(detected)
          rescue => e
            issues << build_runner_error(rule_class, e)
          end
        end

        ignored_ids = ignored_issue_ids
        issues.each do |i|
          if ignored_ids.key?(i[:id])
            i[:ignored] = true
            i[:ignore_token] = ignored_ids[i[:id]]
          end
        end

        {
          run_at: Time.now.to_i,
          total: issues.size,
          by_severity: group_severity(issues),
          rule_maturity: rule_maturity,
          issues: issues,
        }
      end

      private

      def group_severity(issues)
        out = { error: 0, warning: 0, info: 0 }
        issues.each { |i| s = (i[:severity] || :info).to_sym; out[s] = (out[s] || 0) + 1 }
        out
      end

      # Lê model attribute `validation_ignores` → Hash{ id => {reason, by, at} }
      def ignored_issue_ids
        return {} unless @model && @model.respond_to?(:get_attribute)
        raw = @model.get_attribute('Ornato', 'validation_ignores', nil)
        return {} unless raw
        list = raw.is_a?(String) ? (JSON.parse(raw) rescue []) : raw
        list = [] unless list.is_a?(Array)
        list.each_with_object({}) { |entry, h| h[entry['id'] || entry[:id]] = entry }
      rescue
        {}
      end

      def build_runner_error(rule_class, e)
        {
          id: "rule_error_#{rule_class.name.split('::').last}",
          rule: 'rule_error',
          severity: :warning,
          title: "Falha ao executar regra #{rule_class.name.split('::').last}",
          description: "#{e.class}: #{e.message}",
          entity_id: nil,
          entity_path: [],
          auto_fix_available: false,
          auto_fix_action: nil,
          ignore_token: nil,
        }
      end
    end
  end
end
