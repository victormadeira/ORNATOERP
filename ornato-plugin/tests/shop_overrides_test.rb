# frozen_string_literal: true
# tests/shop_overrides_test.rb — Sprint SHOP-5
#
# Cobre overrides locais por workstation:
#   - read/write/set/clear/clear_all
#   - to_expr_params aplica overrides POR CIMA do profile sincronizado
#   - overrides persistem mesmo quando o profile do ERP é re-aplicado

require_relative 'test_helper'
require 'json'

# ── Mock mínimo do Sketchup module (read_default/write_default em memória) ──
unless defined?(::Sketchup)
  module ::Sketchup
    @@_defaults = {}
    def self.read_default(app, key, fallback = nil)
      @@_defaults.dig(app, key) || fallback
    end
    def self.write_default(app, key, value)
      (@@_defaults[app] ||= {})[key] = value
    end
    def self._reset_defaults!
      @@_defaults = {}
    end
  end
end

require_relative '../ornato_sketchup/hardware/shop_config'

class ShopOverridesTest < OrnatoTest::Case
  SC = ::Ornato::Hardware::ShopConfig

  def reset!
    ::Sketchup._reset_defaults!
  end

  test 'read_overrides retorna {} quando vazio' do
    reset!
    assert_equal({}, SC.read_overrides)
  end

  test 'set_override persiste e read_overrides recupera' do
    reset!
    SC.set_override('folga_porta_lateral', 2.5)
    h = SC.read_overrides
    assert_equal(2.5, h['folga_porta_lateral'])
  end

  test 'set_override com nil remove a chave' do
    reset!
    SC.set_override('folga_porta_lateral', 2.5)
    SC.set_override('folga_porta_lateral', nil)
    assert_equal({}, SC.read_overrides)
  end

  test 'clear_override remove uma chave individual' do
    reset!
    SC.set_override('folga_porta_lateral', 2.5)
    SC.set_override('cavilha_dia', 10.0)
    SC.clear_override('folga_porta_lateral')
    assert_equal({ 'cavilha_dia' => 10.0 }, SC.read_overrides)
  end

  test 'clear_all_overrides! limpa tudo' do
    reset!
    SC.set_override('folga_porta_lateral', 2.5)
    SC.set_override('cavilha_dia', 10.0)
    SC.clear_all_overrides!
    assert_equal({}, SC.read_overrides)
  end

  test 'to_expr_params aplica override POR CIMA do profile' do
    reset!
    base = SC.to_expr_params
    # Default factory: folga_porta_lateral = 2.0
    assert_equal(2.0, base['folga_porta_lateral'])

    SC.set_override('folga_porta_lateral', 2.5)
    after = SC.to_expr_params
    assert_equal(2.5, after['folga_porta_lateral'])
    # Outras chaves permanecem do profile
    assert_equal(base['folga_porta_int'], after['folga_porta_int'])
  end

  test 'override persiste quando profile do ERP é re-aplicado via save' do
    reset!
    SC.set_override('cavilha_dia', 12.0)

    # Simula novo profile chegando do ERP (apply_cloud_config)
    cfg = SC.load
    cfg['cavilha']['dia'] = 8.0  # ERP traz valor "diferente"
    SC.save(cfg)

    # to_expr_params ainda deve refletir o OVERRIDE local, não o ERP
    params = SC.to_expr_params
    assert_equal(12.0, params['cavilha_dia'])
    # E o override em si continua persistido
    assert_equal({ 'cavilha_dia' => 12.0 }, SC.read_overrides)
  end

  test 'override de boolean (sys32_ativo) é respeitado' do
    reset!
    base = SC.to_expr_params
    # Default factory: sys32_ativo = false
    assert_equal(false, !!base['sys32_ativo'])

    SC.set_override('sys32_ativo', true)
    after = SC.to_expr_params
    assert_equal(true, after['sys32_ativo'])
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
OrnatoTest.run! if __FILE__ == $PROGRAM_NAME
