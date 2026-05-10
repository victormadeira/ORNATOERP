# frozen_string_literal: true
# Smoke test: Ornato::Library::ExpressionEvaluator
# É o coração paramétrico do ParametricEngine (substituiu o eval inseguro).
require_relative 'test_helper'

require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'library', 'expression_evaluator.rb')

OrnatoTest.autorun_if_main!(__FILE__)

class ParametricEngineEvaluatorTest < OrnatoTest::Case
  E = Ornato::Library::ExpressionEvaluator

  test 'aritmetica basica' do
    ev = E.new({})
    assert_equal 4.0, ev.eval('2 + 2')
    assert_equal 10.0, ev.eval('2 * 5')
    assert_equal 5.0, ev.eval('20 / 4')
    assert_equal 7.0, ev.eval('1 + 2 * 3')
  end

  test 'substituicao de parametros' do
    ev = E.new({ 'largura' => 600, 'altura' => 720 })
    assert_equal 1320.0, ev.eval('{largura} + {altura}')
    assert_equal 590.0, ev.eval('{largura} - 10')
  end

  test 'funcoes whitelisted' do
    ev = E.new({ 'a' => 5, 'b' => 9 })
    assert_equal 9.0, ev.eval('max({a}, {b})')
    assert_equal 5.0, ev.eval('min({a}, {b})')
    assert_equal 6.0, ev.eval('round(5.6)')
    assert_equal 5.0, ev.eval('floor(5.9)')
    assert_equal 6.0, ev.eval('ceil(5.1)')
  end

  test 'eval_bool com comparacoes' do
    ev = E.new({ 'altura' => 800 })
    assert ev.eval_bool('{altura} > 700')
    refute ev.eval_bool('{altura} < 500')
    assert ev.eval_bool('{altura} >= 800 && {altura} <= 900')
  end

  test 'rejeita identificadores nao-whitelisted (sem eval inseguro)' do
    ev = E.new({})
    # eval rescue interno → 0.0; usar parse direto pra confirmar que rejeita
    assert_raises(E::ExpressionError) { ev.send(:parse, 'system') }
    assert_raises(E::ExpressionError) { ev.send(:parse, 'exec') }
    # via API publica retorna 0.0 sem executar nada
    assert_equal 0.0, ev.eval('system')
  end

  test 'parametro inexistente vira 0' do
    ev = E.new({})
    assert_equal 0.0, ev.eval('{nao_existe}')
    assert_equal 10.0, ev.eval('{nao_existe} + 10')
  end
end
