# frozen_string_literal: true
# Smoke test: filtro defensivo Sprint K
# Garante que regras com `componente_3d` são puladas pelo
# MachiningInterpreter (delegadas pro FerragemDrillingCollector).
require_relative 'test_helper'

require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'machining_interpreter.rb')

OrnatoTest.autorun_if_main!(__FILE__)

class RulesEngineFilterTest < OrnatoTest::Case
  test 'evaluate_active_rules pula regras com componente_3d' do
    interpreter = Ornato::Machining::MachiningInterpreter.new({}, {})
    rules = [
      { 'regra' => 'minifix',   'condicao' => '' },
      { 'regra' => 'dobradica', 'componente_3d' => 'dobradica_blum.skp', 'condicao' => '' },
      { 'regra' => 'cavilha',   'condicao' => '' },
    ]
    active = interpreter.send(:evaluate_active_rules, rules)
    regras = active.map { |r| r['regra'] }
    assert_includes regras, 'minifix'
    assert_includes regras, 'cavilha'
    refute regras.include?('dobradica'), 'dobradica com componente_3d deve ser pulada'
  end

  test 'sem componente_3d todas regras passam' do
    interpreter = Ornato::Machining::MachiningInterpreter.new({}, {})
    rules = [
      { 'regra' => 'minifix' },
      { 'regra' => 'cavilha' },
    ]
    active = interpreter.send(:evaluate_active_rules, rules)
    assert_equal 2, active.size
  end

  test 'condicao falsa exclui regra' do
    interpreter = Ornato::Machining::MachiningInterpreter.new({}, {})
    rules = [
      { 'regra' => 'minifix', 'condicao' => 'false' },
      { 'regra' => 'cavilha', 'condicao' => 'true' },
    ]
    active = interpreter.send(:evaluate_active_rules, rules)
    assert_equal ['cavilha'], active.map { |r| r['regra'] }
  end
end
