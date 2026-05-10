# frozen_string_literal: true
# tests/compat_enforcement_test.rb — Sprint A3 / C2
require_relative 'test_helper'
require_relative 'auto_updater_test' # reuse Sketchup stub + load auto_updater

class CompatEnforcementTest < OrnatoTest::Case
  test 'compat_violation default é nil' do
    Sketchup._reset_au_defaults!
    assert_equal nil, Ornato::AutoUpdater.compat_violation
  end

  test 'set_compat_violation persiste hash com min_required/current/since' do
    Sketchup._reset_au_defaults!
    data = Ornato::AutoUpdater.set_compat_violation('0.6.0', '0.4.2')
    assert_equal '0.6.0', data['min_required']
    assert_equal '0.4.2', data['current']
    assert data['since'].is_a?(Integer), 'since deve ser timestamp'

    cv = Ornato::AutoUpdater.compat_violation
    assert_equal '0.6.0', cv['min_required']
    assert_equal '0.4.2', cv['current']
  end

  test 'clear_compat_violation remove flag' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.set_compat_violation('0.6.0', '0.4.2')
    refute_nil_compat
    Ornato::AutoUpdater.clear_compat_violation
    assert_equal nil, Ornato::AutoUpdater.compat_violation
  end

  test 'version_lt? confirma current < min triggera violation' do
    assert Ornato::AutoUpdater.version_lt?('0.4.2', '0.6.0')
    refute Ornato::AutoUpdater.version_lt?('0.6.0', '0.6.0')
    refute Ornato::AutoUpdater.version_lt?('0.7.0', '0.6.0')
  end

  test 'simulação de update: após install com versão >= min_required, flag deve ser limpa' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.set_compat_violation('0.6.0', '0.4.2')

    # Simula post-install logic: se nova versão >= min_required → clear
    new_version = '0.6.1'
    cv = Ornato::AutoUpdater.compat_violation
    if cv && !Ornato::AutoUpdater.version_lt?(new_version, cv['min_required'].to_s)
      Ornato::AutoUpdater.clear_compat_violation
    end

    assert_equal nil, Ornato::AutoUpdater.compat_violation
  end

  test 'parse_response captura min_compat field' do
    data = { 'latest' => '0.6.0', 'min_compat' => '0.5.0', 'up_to_date' => false, 'force' => false }
    parsed = Ornato::AutoUpdater.parse_response(data, current: '0.4.0')
    assert_equal '0.5.0', parsed[:min_compat]
  end

  private

  def refute_nil_compat
    refute_nil Ornato::AutoUpdater.compat_violation, 'compat_violation deve estar setado'
  end

  def refute_nil(v, msg = nil)
    raise OrnatoTest::AssertionError, (msg || 'expected non-nil') if v.nil?
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
