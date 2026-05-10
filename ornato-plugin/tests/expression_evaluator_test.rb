# frozen_string_literal: true
# Standalone test for Ornato::Library::ExpressionEvaluator.
# Run: ruby tests/expression_evaluator_test.rb

require 'minitest/autorun'
require_relative '../ornato_sketchup/library/expression_evaluator'

class ExpressionEvaluatorTest < Minitest::Test
  Eval = Ornato::Library::ExpressionEvaluator

  def setup
    @params = {
      'largura'      => 600,
      'altura'       => 850,
      'profundidade' => 450,
      'espessura'    => 18,
      'tipo'         => 'piso',
      'tem_porta'    => true,
      'qtd_portas'   => 2
    }
    @ev = Eval.new(@params)
  end

  # ── 10+ casos VÁLIDOS ────────────────────────────────────────

  def test_simple_addition
    assert_in_delta 12.0, @ev.eval('5 + 7'), 1e-9
  end

  def test_param_substitution
    assert_in_delta 1200.0, @ev.eval('{largura} * 2'), 1e-9
  end

  def test_param_minus_thickness
    assert_in_delta 564.0, @ev.eval('{largura} - 2 * {espessura}'), 1e-9
  end

  def test_parens_precedence
    assert_in_delta 14.0, @ev.eval('(2 + 5) * 2'), 1e-9
  end

  def test_function_max
    assert_in_delta 850.0, @ev.eval('max({largura}, {altura})'), 1e-9
  end

  def test_function_min
    assert_in_delta 600.0, @ev.eval('min({largura}, {altura})'), 1e-9
  end

  def test_function_round_floor_ceil
    assert_in_delta 4.0, @ev.eval('round(3.6)'), 1e-9
    assert_in_delta 3.0, @ev.eval('floor(3.9)'), 1e-9
    assert_in_delta 4.0, @ev.eval('ceil(3.1)'), 1e-9
  end

  def test_unary_minus
    assert_in_delta(-7.0, @ev.eval('-7'), 1e-9)
    assert_in_delta(-582.0, @ev.eval('-{largura} + 18'), 1e-9)
  end

  def test_division_and_decimal
    assert_in_delta 2.5, @ev.eval('5 / 2.0'), 1e-9
    assert_in_delta 0.5, @ev.eval('.5'), 1e-9
  end

  def test_nested_functions
    assert_in_delta 850.0, @ev.eval('max(min({largura}, {altura}), {altura})'), 1e-9
  end

  def test_boolean_comparison
    assert_equal true,  @ev.eval_bool('{altura} > 700')
    assert_equal false, @ev.eval_bool('{largura} > 1000')
  end

  def test_boolean_logical
    assert_equal true, @ev.eval_bool('{altura} > 700 && {largura} >= 600')
    assert_equal true, @ev.eval_bool('{altura} > 9999 || {largura} == 600')
    assert_equal false, @ev.eval_bool('!{tem_porta}')
  end

  def test_string_equality
    assert_equal true, @ev.eval_bool("{tipo} == 'piso'")
    assert_equal false, @ev.eval_bool("{tipo} == 'aereo'")
    assert_equal true, @ev.eval_bool("{tipo} != 'aereo'")
  end

  def test_division_by_zero_returns_zero
    # Erro recuperável → 0.0 com warn
    assert_in_delta 0.0, @ev.eval('1 / 0'), 1e-9
  end

  # ── 10+ ATAQUES — todos devem ser BLOQUEADOS ────────────────

  def assert_blocked(expr)
    # Expressões maliciosas: parser deve recusar e retornar 0.0
    # (sem nunca executar código)
    assert_in_delta 0.0, @ev.eval(expr), 1e-9, "DEVERIA bloquear: #{expr.inspect}"
  end

  def test_block_system_call
    assert_blocked("system('ls')")
  end

  def test_block_file_read
    assert_blocked('File.read("/etc/passwd")')
  end

  def test_block_kernel_exit
    assert_blocked('Kernel.exit')
  end

  def test_block_backtick
    assert_blocked('`whoami`')
  end

  def test_block_eval_call
    assert_blocked('eval("1 + 1")')
  end

  def test_block_send_method
    assert_blocked('send(:exit)')
  end

  def test_block_underscored_send
    assert_blocked('__send__(:exit)')
  end

  def test_block_instance_eval
    assert_blocked('instance_eval("1")')
  end

  def test_block_open3
    assert_blocked("Open3.capture2('ls')")
  end

  def test_block_dollar_var
    assert_blocked('$LOAD_PATH')
  end

  def test_block_at_var
    assert_blocked('@params')
  end

  def test_block_semicolon_injection
    assert_blocked('1 + 1; system("ls")')
  end

  def test_block_method_chain
    assert_blocked('"foo".length')
  end

  def test_block_constant_access
    assert_blocked('ENV["HOME"]')
  end

  def test_block_unknown_function
    assert_blocked('exec(1)')
  end

  def test_block_curly_with_dot
    # Tentativa de call através de placeholder
    assert_blocked('{largura}.system')
  end

  def test_condition_block_fails_open
    # eval_bool retorna true (fail-open) em erro — comportamento documentado
    assert_equal true, @ev.eval_bool('system("ls")')
  end
end
