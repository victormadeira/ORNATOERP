# frozen_string_literal: true
# tests/validation_runner_test.rb — ValidationRunner + Rules MVP

require_relative 'test_helper'
require 'json'

# Stub Sketchup namespace para que `defined?(Sketchup)` retorne nil sem
# carregar o plugin completo. Os testes usam um modelo mock próprio.

# ── Mock model ──────────────────────────────────────────────────────────
class VRFakeEntity
  attr_accessor :name, :entityID, :children
  def initialize(name: '', id: 1, attrs: {}, children: [])
    @name = name
    @entityID = id
    @attrs = { 'Ornato' => stringify(attrs) }
    @children = children
  end

  def stringify(h); h.transform_keys(&:to_s); end

  def get_attribute(dict, key, default = nil)
    (@attrs[dict] ||= {}).fetch(key.to_s, default)
  end

  def set_attribute(dict, key, value)
    (@attrs[dict] ||= {})[key.to_s] = value
    value
  end

  def entities; @children; end

  def is_a_group_or_instance?; true; end

  def respond_to?(m, *)
    return true if [:entities, :get_attribute, :set_attribute, :entityID, :name].include?(m)
    super
  end
end

class VRFakeModel
  attr_accessor :active_entities, :model_attrs
  def initialize(roots = [])
    @active_entities = roots
    @model_attrs = { 'Ornato' => {} }
  end

  def get_attribute(dict, key, default = nil)
    (@model_attrs[dict] ||= {}).fetch(key.to_s, default)
  end

  def set_attribute(dict, key, value)
    (@model_attrs[dict] ||= {})[key.to_s] = value
    value
  end

  def respond_to?(m, *)
    return true if [:active_entities, :get_attribute, :set_attribute].include?(m)
    super
  end
end

# ── Carrega rules + runner (stdlib only) ───────────────────────────────
PLUGIN = File.expand_path('../ornato_sketchup', __dir__)

# RoleNormalizer (real)
require File.join(PLUGIN, 'core/role_normalizer.rb')

# Rules
require File.join(PLUGIN, 'validation/rules/base_rule.rb')
require File.join(PLUGIN, 'validation/rules/piece_without_material.rb')
require File.join(PLUGIN, 'validation/rules/edge_role_invalid.rb')
require File.join(PLUGIN, 'validation/rules/drilling_hitting_banding.rb')
require File.join(PLUGIN, 'validation/rules/collision_drillings.rb')
require File.join(PLUGIN, 'validation/rules/hardware_outside_standard.rb')
require File.join(PLUGIN, 'validation/rules/aggregate_without_hardware.rb')
require File.join(PLUGIN, 'validation/rules/offline_unavailable_module.rb')
require File.join(PLUGIN, 'validation/rules/expression_unresolved.rb')

require File.join(PLUGIN, 'validation/validation_runner.rb')

# ── Test cases ─────────────────────────────────────────────────────────
class ValidationRunnerTest < OrnatoTest::Case
  def build_model_with_problems
    # Módulo "balcão 2 portas" com 2 peças:
    #   - Lateral esq SEM material   (PieceWithoutMaterial → :error)
    #   - Lateral dir com role inválido (EdgeRoleInvalid → :warning)
    lat_esq = VRFakeEntity.new(
      name: 'Lateral esq', id: 100,
      attrs: { tipo: 'peca', role: 'lateral_esq', material: '' }
    )
    lat_dir = VRFakeEntity.new(
      name: 'Lateral dir', id: 101,
      attrs: { tipo: 'peca', role: 'role_inexistente_xyz', material: 'MDF18_BrancoTX' }
    )
    modulo = VRFakeEntity.new(
      name: 'Balcão 2 portas', id: 99,
      attrs: { module_type: 'armario_base' },
      children: [lat_esq, lat_dir]
    )
    VRFakeModel.new([modulo])
  end

  test 'runner aggregates issues from multiple rules' do
    model = build_model_with_problems
    runner = Ornato::Validation::ValidationRunner.new(model)
    report = runner.run

    assert report[:issues].is_a?(Array), 'issues deve ser Array'
    assert report[:total] >= 2, "esperado >= 2 issues, vieram #{report[:total]}"
    assert report[:run_at].is_a?(Integer)
  end

  test 'severity counts are correct' do
    model = build_model_with_problems
    report = Ornato::Validation::ValidationRunner.new(model).run
    by_sev = report[:by_severity]
    assert_equal report[:total], (by_sev[:error] + by_sev[:warning] + by_sev[:info])
    assert by_sev[:error] >= 1, 'esperado pelo menos 1 erro (peça sem material)'
    assert by_sev[:warning] >= 1, 'esperado pelo menos 1 warning (role inválido)'
  end

  test 'PieceWithoutMaterial detects missing material' do
    model = build_model_with_problems
    rule = Ornato::Validation::Rules::PieceWithoutMaterial.new(model)
    issues = rule.detect
    assert_equal 1, issues.size
    issue = issues.first
    assert_equal :error, issue[:severity]
    assert_equal 'apply_default_material', issue[:auto_fix_action]
    assert_equal true, issue[:auto_fix_available]
    assert_equal 100, issue[:entity_id]
  end

  test 'EdgeRoleInvalid detects role outside RoleNormalizer.MAP' do
    model = build_model_with_problems
    rule = Ornato::Validation::Rules::EdgeRoleInvalid.new(model)
    issues = rule.detect
    assert_equal 1, issues.size
    assert_equal :warning, issues.first[:severity]
    assert_equal 101, issues.first[:entity_id]
  end

  test 'EdgeRoleInvalid does NOT flag valid role' do
    piece = VRFakeEntity.new(name: 'OK', id: 1,
      attrs: { tipo: 'peca', role: 'lateral_esq', material: 'MDF' })
    mod = VRFakeEntity.new(name: 'M', id: 2,
      attrs: { module_type: 'x' }, children: [piece])
    rule = Ornato::Validation::Rules::EdgeRoleInvalid.new(VRFakeModel.new([mod]))
    assert_equal 0, rule.detect.size
  end

  test 'ignored issues are flagged on the report' do
    model = build_model_with_problems
    # Roda 1x pra descobrir IDs
    first = Ornato::Validation::ValidationRunner.new(model).run
    target = first[:issues].find { |i| i[:rule] == 'piece_without_material' }
    assert target, 'esperado issue de piece_without_material'

    # Persiste ignore no model attribute
    list = [{ 'id' => target[:id], 'reason' => 'teste', 'token' => 'tok1', 'at' => 1, 'by' => 'me' }]
    model.set_attribute('Ornato', 'validation_ignores', list.to_json)

    report = Ornato::Validation::ValidationRunner.new(model).run
    found = report[:issues].find { |i| i[:id] == target[:id] }
    assert found[:ignored] == true, 'issue deveria estar marcada como ignored'
  end

  test 'rule errors are caught and reported as warnings' do
    # Cria rule que crasha
    bad_rule = Class.new(Ornato::Validation::Rules::BaseRule) do
      def self.name; 'TestModule::BadRule'; end
      def detect; raise 'boom'; end
    end
    runner = Ornato::Validation::ValidationRunner.new(VRFakeModel.new([]), rules: [bad_rule])
    report = runner.run
    assert_equal 1, report[:issues].size
    assert_equal :warning, report[:issues].first[:severity]
    assert report[:issues].first[:title].include?('Falha ao executar')
  end

  test 'empty model produces zero issues' do
    runner = Ornato::Validation::ValidationRunner.new(VRFakeModel.new([]))
    report = runner.run
    assert_equal 0, report[:total]
    assert_equal 0, report[:by_severity][:error]
  end

  test 'auto-fix payload is preserved on issue' do
    model = build_model_with_problems
    issue = Ornato::Validation::Rules::PieceWithoutMaterial.new(model).detect.first
    assert issue[:auto_fix_payload].is_a?(Hash)
    assert_equal 'MDF18_BrancoTX', issue[:auto_fix_payload][:material]
  end

  test 'issue ids are stable across runs' do
    model = build_model_with_problems
    a = Ornato::Validation::ValidationRunner.new(model).run[:issues].map { |i| i[:id] }.sort
    b = Ornato::Validation::ValidationRunner.new(model).run[:issues].map { |i| i[:id] }.sort
    assert_equal a, b
  end

  # ─── Maturity / placeholder flagging ────────────────────────────────────
  test 'placeholder rules expose MATURITY = :preliminary' do
    assert_equal :preliminary, Ornato::Validation::Rules::AggregateWithoutHardware.maturity
    assert_equal :preliminary, Ornato::Validation::Rules::OfflineUnavailableModule.maturity
    assert_equal :preliminary, Ornato::Validation::Rules::ExpressionUnresolved.maturity
  end

  test 'stable rules report maturity :stable' do
    %w[PieceWithoutMaterial EdgeRoleInvalid DrillingHittingBanding
       CollisionDrillings HardwareOutsideStandard].each do |name|
      klass = Ornato::Validation::Rules.const_get(name)
      assert_equal :stable, klass.maturity, "#{name} deveria ser :stable"
    end
  end

  test 'issues from placeholder rules carry placeholder=true' do
    # Modelo com agregado sem hardware (placeholder rule).
    shelf = VRFakeEntity.new(
      name: 'Prateleira A', id: 200,
      attrs: { tipo: 'peca', role: 'prateleira', material: 'MDF',
               bay_id: 'bay_1', hardware_attached: false }
    )
    mod = VRFakeEntity.new(
      name: 'Estante', id: 250,
      attrs: { module_type: 'estante' }, children: [shelf]
    )
    rule = Ornato::Validation::Rules::AggregateWithoutHardware.new(VRFakeModel.new([mod]))
    issues = rule.detect
    assert issues.size >= 1, 'placeholder deve gerar pelo menos 1 issue'
    issues.each do |i|
      assert_equal true, i[:placeholder], 'placeholder=true esperado'
      assert_equal 'preliminary', i[:maturity]
      # severity downgrade pra :info
      assert_equal :info, i[:severity], 'placeholder severity deve ser :info'
      # auto-fix indisponível em preliminar
      assert_equal false, i[:auto_fix_available], 'auto_fix_available deve ser false'
      assert i[:auto_fix_action].nil?, 'auto_fix_action deve ser nil em preliminar'
    end
  end

  test 'issues from stable rules carry placeholder=false' do
    model = build_model_with_problems
    issue = Ornato::Validation::Rules::PieceWithoutMaterial.new(model).detect.first
    assert_equal false, issue[:placeholder]
    assert_equal 'stable', issue[:maturity]
    assert_equal true, issue[:auto_fix_available]
  end

  test 'report includes rule_maturity hash' do
    model = build_model_with_problems
    report = Ornato::Validation::ValidationRunner.new(model).run
    rm = report[:rule_maturity]
    assert rm.is_a?(Hash), 'rule_maturity deve ser Hash'
    assert_equal :stable, rm['piece_without_material']
    assert_equal :preliminary, rm['aggregate_without_hardware']
    assert_equal :preliminary, rm['offline_unavailable_module']
    assert_equal :preliminary, rm['expression_unresolved']
  end
end
