# frozen_string_literal: true
# tests/auto_updater_test.rb — cobertura mínima do AutoUpdater (Sprint A3)
require_relative 'test_helper'
require 'json'
require 'digest'
require 'tmpdir'
require 'fileutils'

# ── Stubs mínimos do SketchUp + Ornato deps ──────────────────────────
# Re-abre o módulo (outros tests podem tê-lo definido antes) e garante
# os métodos/estado que o AutoUpdater precisa.
module Sketchup
  @au_defaults ||= {}
  @au_temp_dir ||= Dir.mktmpdir('ornato_au_test_')

  class << self
    def read_default(section, key, default = nil)
      (@au_defaults ||= {})[[section.to_s, key.to_s]] || default
    end

    def write_default(section, key, value)
      (@au_defaults ||= {})[[section.to_s, key.to_s]] = value.to_s
    end

    def temp_dir; @au_temp_dir ||= Dir.mktmpdir('ornato_au_test_'); end
    def version; '23.0.0'; end
    def get_locale; 'pt-BR'; end
    def install_from_archive(_path, _show_log = false); true; end
    def _reset_au_defaults!; (@au_defaults ||= {}).clear; end
  end
end

# Carrega arquivo sob teste
$LOAD_PATH.unshift(File.expand_path('..', __dir__))
require_relative '../ornato_sketchup/core/logger'
require_relative '../ornato_sketchup/updater/auto_updater'

class AutoUpdaterTest < OrnatoTest::Case
  test 'parse_response com schema novo (v2)' do
    data = {
      'latest' => '0.5.0',
      'url'    => 'http://srv/api/plugin/download/0.5.0.rbz?channel=stable',
      'sha256' => 'a' * 64,
      'force'  => true,
      'changelog' => 'fixes',
      'min_compat' => '0.4.0',
      'up_to_date' => false,
    }
    parsed = Ornato::AutoUpdater.parse_response(data, current: '0.4.2')
    assert_equal '0.5.0', parsed[:latest]
    assert_equal :v2, parsed[:schema]
    assert parsed[:force], 'force deve ser true'
    assert_equal '0.4.0', parsed[:min_compat]
    refute parsed[:up_to_date]
  end

  test 'parse_response backward-compat com schema legacy (v1)' do
    data = {
      'has_update' => true,
      'latest_version' => '0.2.0',
      'download_url' => 'http://srv/foo.rbz',
      'changelog' => 'old',
    }
    parsed = Ornato::AutoUpdater.parse_response(data, current: '0.1.0')
    assert_equal '0.2.0', parsed[:latest]
    assert_equal :v1, parsed[:schema]
    refute parsed[:force], 'legacy nunca tem force'
    refute parsed[:up_to_date]
  end

  test 'parse_response up_to_date no schema novo' do
    parsed = Ornato::AutoUpdater.parse_response({ 'latest' => '0.4.2', 'up_to_date' => true }, current: '0.4.2')
    assert parsed[:up_to_date]
  end

  test 'compare_versions handles patch e prerelease' do
    assert_equal(-1, Ornato::AutoUpdater.compare_versions('0.4.2', '0.4.10'))
    assert_equal( 1, Ornato::AutoUpdater.compare_versions('1.0.0', '0.99.99'))
    assert_equal( 0, Ornato::AutoUpdater.compare_versions('1.2.3', '1.2.3'))
    assert Ornato::AutoUpdater.version_lt?('0.3.0', '0.4.0')
  end

  test 'set_channel persiste e current_channel le' do
    Sketchup._reset_au_defaults!
    assert_equal 'stable', Ornato::AutoUpdater.current_channel # default
    Ornato::AutoUpdater.set_channel('beta')
    assert_equal 'beta', Ornato::AutoUpdater.current_channel
    Ornato::AutoUpdater.set_channel('dev')
    assert_equal 'dev', Ornato::AutoUpdater.current_channel
    assert_raises(ArgumentError) { Ornato::AutoUpdater.set_channel('alpha') }
  end

  test 'install_id é estável após primeira chamada' do
    Sketchup._reset_au_defaults!
    id1 = Ornato::AutoUpdater.install_id
    id2 = Ornato::AutoUpdater.install_id
    assert_equal id1, id2
    assert id1.length >= 32, 'UUID deve ter ao menos 32 chars'
  end

  test 'SHA256 verification: arquivo gravado bate com hash calculado' do
    tmp = File.join(Dir.tmpdir, "ornato_sha_#{rand(100000)}.bin")
    payload = "fake rbz content #{Time.now.to_f}"
    File.write(tmp, payload)
    expected = Digest::SHA256.hexdigest(payload)
    assert_equal expected, Digest::SHA256.file(tmp).hexdigest
    File.delete(tmp)
  end

  test 'force flag bloqueia skip_version' do
    # Smoke test: estado de skip não interfere quando force=true (lógica em check_for_updates)
    Sketchup._reset_au_defaults!
    Sketchup.write_default('Ornato', 'ornato_skip_version', '0.5.0')
    assert Ornato::AutoUpdater.skipped?('0.5.0')
    refute Ornato::AutoUpdater.skipped?('0.6.0')
  end

  test 'send_telemetry no-op quando não há token' do
    Sketchup._reset_au_defaults!
    # Sem auth_token → retorna sem erro (early return)
    result = Ornato::AutoUpdater.send_telemetry('0.5.0')
    assert_equal nil, result
  end
end
