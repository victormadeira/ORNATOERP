# frozen_string_literal: true
# tests/telemetry_optout_test.rb — Sprint A3 / C1 + FIX-1
require_relative 'test_helper'

# Reusa os stubs do auto_updater_test (define Sketchup + carrega modulo)
require_relative 'auto_updater_test'

class TelemetryOptOutTest < OrnatoTest::Case
  test 'default: telemetry_enabled? retorna false (default OFF, pergunta no 1o uso)' do
    Sketchup._reset_au_defaults!
    refute Ornato::AutoUpdater.telemetry_enabled?, 'default deve ser OFF'
  end

  test 'default: telemetry_decided? retorna false quando nunca foi perguntado' do
    Sketchup._reset_au_defaults!
    refute Ornato::AutoUpdater.telemetry_decided?, 'sem decisao deve ser false'
    refute Ornato::AutoUpdater.telemetry_decision_made?, 'alias semantico'
  end

  test 'telemetry_decision_made? = telemetry_decided? (alias)' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.mark_telemetry_decided(true)
    assert Ornato::AutoUpdater.telemetry_decision_made?
    assert Ornato::AutoUpdater.telemetry_decided?
  end

  test 'mark_telemetry_decided(true): persiste opt-in e marca decided=true' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.mark_telemetry_decided(true)
    assert Ornato::AutoUpdater.telemetry_decided?, 'apos decisao deve ser decided'
    assert Ornato::AutoUpdater.telemetry_enabled?, 'opt-in deve persistir enabled=true'
  end

  test 'mark_telemetry_decided(false): persiste opt-out e marca decided=true' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.mark_telemetry_decided(false)
    assert Ornato::AutoUpdater.telemetry_decided?, 'apos decisao deve ser decided'
    refute Ornato::AutoUpdater.telemetry_enabled?, 'opt-out deve persistir enabled=false'
  end

  test 'set_telemetry_enabled(false) persiste e telemetry_enabled? retorna false' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.set_telemetry_enabled(false)
    refute Ornato::AutoUpdater.telemetry_enabled?, 'após opt-out deve ser false'
  end

  test 'set_telemetry_enabled(true) reativa (mas ainda precisa decided=true pra enviar)' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.set_telemetry_enabled(true)
    assert Ornato::AutoUpdater.telemetry_enabled?
  end

  test 'send_telemetry skipped quando decided=false (mesmo se enabled=true acidental)' do
    Sketchup._reset_au_defaults!
    # Cenário defensivo: alguém setou enabled=true sem passar pelo dialog
    Ornato::AutoUpdater.set_telemetry_enabled(true)
    refute Ornato::AutoUpdater.telemetry_decided?, 'decidido nao deve ter sido setado'
    Sketchup.write_default('Ornato', 'auth_token', 'fake-token-xyz')

    t0 = Time.now
    result = Ornato::AutoUpdater.send_telemetry('1.2.3')
    elapsed = Time.now - t0
    assert_equal nil, result, 'sem decisao do usuario nao deve enviar'
    assert elapsed < 1.0, "deve retornar imediato (sem HTTP), durou #{elapsed}s"
  end

  test 'send_telemetry retorna nil sem fazer HTTP quando opt-out' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.mark_telemetry_decided(false)
    Sketchup.write_default('Ornato', 'auth_token', 'fake-token-xyz')

    t0 = Time.now
    result = Ornato::AutoUpdater.send_telemetry('1.2.3')
    elapsed = Time.now - t0
    assert_equal nil, result
    assert elapsed < 1.0, "deve retornar imediato (sem HTTP), durou #{elapsed}s"
  end

  test 'send_telemetry sem token retorna nil mesmo com opt-in' do
    Sketchup._reset_au_defaults!
    Ornato::AutoUpdater.mark_telemetry_decided(true)
    # sem auth_token
    result = Ornato::AutoUpdater.send_telemetry('1.2.3')
    assert_equal nil, result
  end

  test 'last_telemetry_at é nil quando nunca enviou' do
    Sketchup._reset_au_defaults!
    assert_equal nil, Ornato::AutoUpdater.last_telemetry_at
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
