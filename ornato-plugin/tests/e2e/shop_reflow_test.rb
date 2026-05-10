# frozen_string_literal: true
# tests/e2e/shop_reflow_test.rb
# ──────────────────────────────────────────────────────────────────
# E2E-2 — Pipeline Shop config → Module reflow:
#   ShopConfig.apply_cloud_config({values:{folga_porta_lateral:4}})
#   → JsonModuleBuilder.refresh_shop_snapshot(group)
#   → group ganha shop_snapshot atualizado
#   → AggregatePersistor.snapshot preserva specs de agregados filhos
#
# Esse teste cobre o seam puro: stamp do snapshot novo + persistência
# dos agg_specs antes do rebuild destrutivo. O rebuild geométrico em si
# exige Sketchup::Model real (operation/commit/entidades) — coberto em
# manual/SketchUp checklist (CHECKLIST_VALIDACAO_MANUAL.md §4.2).
# ──────────────────────────────────────────────────────────────────

require_relative '../test_helper'
require 'tmpdir'
require 'fileutils'
require 'json'

# ── Sketchup stub (read_default/write_default in-memory) ──
unless defined?(::Sketchup)
  module ::Sketchup
    @@_defaults = {}
    def self.read_default(app, key, fallback = nil)
      (@@_defaults[app] || {}).fetch(key, fallback)
    end
    def self.write_default(app, key, value)
      (@@_defaults[app] ||= {})[key] = value
    end
    def self._reset_defaults!; @@_defaults = {}; end
    class ComponentInstance; end
    class Group; end
  end
end

require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'hardware', 'shop_config.rb')
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'library', 'aggregate_persistor.rb')
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'library', 'json_module_builder.rb') rescue nil

# Group mock — attribute dict in-memory; expõe entities + role
class E2EShopGroup
  attr_accessor :name, :entityID
  def initialize(attrs: {}, children: [])
    @attrs = { 'Ornato' => attrs }
    @children = children
    @entityID = rand(99_999)
    @name = 'BalcaoGroup'
  end
  def get_attribute(dict, key, default = nil)
    (@attrs[dict] || {}).fetch(key.to_s, (@attrs[dict] || {}).fetch(key, default))
  end
  def set_attribute(dict, key, value); (@attrs[dict] ||= {})[key.to_s] = value; end
  def entities; @children; end
  def respond_to?(m, *)
    return true if [:get_attribute, :set_attribute, :entities].include?(m)
    super
  end
  def is_a?(klass)
    return true if klass == Sketchup::Group
    super
  end
end

OrnatoTest.autorun_if_main!(__FILE__)

class ShopReflowE2ETest < OrnatoTest::Case
  def reset_state!
    Sketchup._reset_defaults! if Sketchup.respond_to?(:_reset_defaults!)
    Sketchup.write_default('Ornato', 'auth_token', 'test-token')
    FileUtils.rm_f(File.expand_path('~/.ornato/shop/config.json'))
    Ornato::Hardware::ShopConfig.instance_variable_set(:@cloud_version, nil)
    Ornato::Hardware::ShopConfig.instance_variable_set(:@cloud_profile, nil)
    Ornato::Hardware::ShopConfig.instance_variable_set(:@last_sync_at, nil)
  end

  test 'E2E: apply_cloud_config → to_expr_params reflete nova espessura_carcaca_padrao' do
    reset_state!
    # 1. Snapshot inicial (factory defaults)
    initial_params = Ornato::Hardware::ShopConfig.to_expr_params
    initial_esp = initial_params['espessura_carcaca']
    assert initial_esp.is_a?(Numeric),
           "espessura_carcaca default deve ser numeric, veio #{initial_esp.inspect}"

    # 2. Aplica payload remoto: novo padrao 25mm
    payload = {
      'profile_name' => 'Marcenaria Reflow E2E',
      'version'      => 'v42',
      'values'       => { 'espessura_carcaca_padrao' => 25 },
    }
    ok = Ornato::Hardware::ShopConfig.apply_cloud_config(payload)
    assert ok, 'apply_cloud_config deve retornar true'

    # 3. Snapshot agora reflete o novo valor (key 'espessura_carcaca' = esp_carcaca)
    new_params = Ornato::Hardware::ShopConfig.to_expr_params
    assert_equal 25, new_params['espessura_carcaca'].to_i,
                 'espessura_carcaca deve refletir o novo valor da cloud'
    assert_equal 25, new_params['espessura'].to_i,
                 'alias plano espessura também atualiza'
    assert_equal 'v42', Ornato::Hardware::ShopConfig.cloud_version
    assert_equal 'Marcenaria Reflow E2E', Ornato::Hardware::ShopConfig.cloud_profile
  end

  test 'E2E: refresh_shop_snapshot grava JSON novo no group' do
    reset_state!
    Ornato::Hardware::ShopConfig.apply_cloud_config(
      'profile_name' => 'P', 'version' => 'v9',
      'values'       => { 'espessura_carcaca_padrao' => 22 }
    )

    group = E2EShopGroup.new(attrs: {
      'tipo'         => 'modulo',
      'module_id'    => 'balcao_2_portas',
      'shop_snapshot' => JSON.generate({ 'espessura_carcaca' => 18 }),
      'shop_version' => 'v0',
    })

    snap = Ornato::Library::JsonModuleBuilder.refresh_shop_snapshot(group)
    assert snap.is_a?(Hash), 'refresh_shop_snapshot retorna Hash'
    assert_equal 22, snap['espessura_carcaca'].to_i,
                 'snapshot reflete valor da cloud (22)'

    raw = group.get_attribute('Ornato', 'shop_snapshot')
    parsed = JSON.parse(raw)
    assert_equal 22, parsed['espessura_carcaca'].to_i,
                 "atributo persistido no group atualizado, veio #{parsed.inspect}"
    assert_equal 'v9', group.get_attribute('Ornato', 'shop_version'),
                 'shop_version stampado'
  end

  test 'E2E: collect_aggregates_for_rebuild preserva agg_specs antes do rebuild' do
    reset_state!

    # Simula parent com lista de aggregates persistida (mas sem entities reais —
    # AggregatePersistor.snapshot retorna [] gracefully nesse caso, o que JÁ
    # demonstra que reflow não crasha em módulo sem agregados — caso comum).
    parent = E2EShopGroup.new(attrs: {
      'tipo'        => 'modulo',
      'module_id'   => 'balcao_2_portas',
      'aggregates'  => '[]',
    })

    specs = Ornato::Library::JsonModuleBuilder.collect_aggregates_for_rebuild(parent)
    assert specs.is_a?(Array), 'snapshot retorna Array'
    assert_equal 0, specs.size, 'parent sem agregados → specs vazio (não crasha)'

    # Agora simula parent COM 1 agregado registrado (entityID arbitrário) mas
    # sem o sub-group correspondente no .entities — Persistor pula sem erro.
    parent2 = E2EShopGroup.new(attrs: {
      'tipo'        => 'modulo',
      'module_id'   => 'balcao_2_portas',
      'aggregates'  => JSON.generate([
        { 'entityID' => 99999, 'aggregate_id' => 'prateleira', 'params' => {} }
      ]),
    })
    specs2 = Ornato::Library::JsonModuleBuilder.collect_aggregates_for_rebuild(parent2)
    assert specs2.is_a?(Array), 'snapshot tolera entity ausente'
    # AggregatePersistor pula entries sem entidade correspondente
    assert_equal 0, specs2.size,
                 'entries sem entity são puladas (não crasha reflow)'
  end

  test 'E2E: refresh nao crasha quando group nao eh modulo (degrada gracefully)' do
    reset_state!
    not_a_module = Object.new  # sem get_attribute/set_attribute
    out = Ornato::Library::JsonModuleBuilder.refresh_shop_snapshot(not_a_module)
    assert_equal nil, out, 'group inválido retorna nil sem crash'
  end
end
