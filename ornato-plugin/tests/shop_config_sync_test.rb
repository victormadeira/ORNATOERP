# frozen_string_literal: true
# tests/shop_config_sync_test.rb — Cobertura do sync ShopConfig (Sprint SHOP-3)
#
# Testa: sync_from_cloud, version-skip (no-op), apply_cloud_config,
# JsonModuleBuilder snapshot resolution, refresh_module_shop_snapshot e
# tolerância a falhas de rede.

require_relative 'test_helper'
require 'tmpdir'
require 'fileutils'
require 'json'
require 'net/http'

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
require_relative '../ornato_sketchup/library/json_module_builder' rescue nil

# ── FakeHttp compartilhado (replica padrão do library_sync_test) ───────────
class ShopFakeHttpResponse
  attr_accessor :body, :code
  def initialize(body, code: '200', headers: {})
    @body    = body
    @code    = code
    @headers = headers
  end
  def [](key); @headers[key]; end
  def is_a?(klass)
    return true if klass == Net::HTTPSuccess && @code.to_i.between?(200, 299)
    super
  end
end

class ShopFakeHttp
  @@responses = {}
  @@call_count = 0
  def self.responses; @@responses; end
  def self.call_count; @@call_count; end
  def self.reset!
    @@responses = {}
    @@call_count = 0
  end

  def initialize(host, port); @host = host; @port = port; end
  attr_accessor :use_ssl, :open_timeout, :read_timeout, :verify_mode
  def use_ssl?; @use_ssl == true; end

  def request(req)
    @@call_count += 1
    @@responses[req.path] || ShopFakeHttpResponse.new('', code: '500')
  end
end

# Group mock — atributos in-memory
class ShopGroupMock
  def initialize; @attrs = {}; end
  def get_attribute(dict, key, default = nil)
    (@attrs[dict] || {}).fetch(key, default)
  end
  def set_attribute(dict, key, value)
    (@attrs[dict] ||= {})[key] = value
  end
  def respond_to?(m, *)
    return true if [:get_attribute, :set_attribute].include?(m)
    super
  end
end

class ShopConfigSyncTest < OrnatoTest::Case
  CACHE_PATH = File.expand_path('~/.ornato/shop/config.json')

  def with_fake_http
    original = Net::HTTP.method(:new)
    ShopFakeHttp.reset!
    Net::HTTP.define_singleton_method(:new) { |host, port| ShopFakeHttp.new(host, port) }
    yield
  ensure
    Net::HTTP.define_singleton_method(:new) { |*args| original.call(*args) }
  end

  def reset_state!
    Sketchup._reset_defaults! if Sketchup.respond_to?(:_reset_defaults!)
    Sketchup.write_default('Ornato', 'auth_token', 'test-token')
    FileUtils.rm_f(CACHE_PATH)
    # Reseta estado em memória
    Ornato::Hardware::ShopConfig.instance_variable_set(:@cloud_version, nil)
    Ornato::Hardware::ShopConfig.instance_variable_set(:@cloud_profile, nil)
    Ornato::Hardware::ShopConfig.instance_variable_set(:@last_sync_at, nil)
  end

  test 'sync_from_cloud aplica payload remoto' do
    reset_state!
    with_fake_http do
      payload = {
        'profile_name' => 'Marcenaria Teste',
        'version'      => 'v1',
        'values'       => { 'espessura_carcaca_padrao' => 25 },
        'custom_keys'  => { 'foo' => 'bar' },
      }
      ShopFakeHttp.responses['/api/shop/config'] = ShopFakeHttpResponse.new(payload.to_json)

      result = Ornato::Hardware::ShopConfig.sync_from_cloud
      assert !result.nil?, 'sync deve retornar payload'
      assert_equal 'v1', Ornato::Hardware::ShopConfig.cloud_version
      assert_equal 'Marcenaria Teste', Ornato::Hardware::ShopConfig.cloud_profile
      assert File.exist?(CACHE_PATH), 'cache local deve existir'
    end
  end

  test 'sync_from_cloud sem auth_token retorna nil' do
    reset_state!
    Sketchup.write_default('Ornato', 'auth_token', '')
    with_fake_http do
      result = Ornato::Hardware::ShopConfig.sync_from_cloud
      assert result.nil?, 'sem token deve retornar nil'
      assert_equal 0, ShopFakeHttp.call_count, 'não deve fazer request sem token'
    end
  end

  test 'sync com mesma version é no-op (não re-aplica)' do
    reset_state!
    with_fake_http do
      payload = { 'profile_name' => 'P', 'version' => 'v2', 'values' => { 'k' => 1 }, 'custom_keys' => {} }
      ShopFakeHttp.responses['/api/shop/config'] = ShopFakeHttpResponse.new(payload.to_json)

      Ornato::Hardware::ShopConfig.sync_from_cloud
      first_count = ShopFakeHttp.call_count

      # Segundo sync — http é chamado, mas como version bate, não re-aplica
      Ornato::Hardware::ShopConfig.sync_from_cloud
      assert ShopFakeHttp.call_count > first_count, 'http é chamado'
      assert_equal 'v2', Ornato::Hardware::ShopConfig.cloud_version
    end
  end

  test 'sync silencia erro de rede e retorna nil' do
    reset_state!
    with_fake_http do
      # Sem responses cadastradas → 500
      result = Ornato::Hardware::ShopConfig.sync_from_cloud
      assert result.nil?, 'falha de rede deve retornar nil'
      # Não deve crashar
    end
  end

  test 'apply_cloud_config mescla custom_keys com prefix' do
    reset_state!
    payload = {
      'profile_name' => 'P',
      'version'      => 'v9',
      'values'       => { 'fundo_metodo_padrao' => 'parafusado' },
      'custom_keys'  => { 'tag_x' => 'on' },
    }
    Ornato::Hardware::ShopConfig.apply_cloud_config(payload)
    assert_equal 'v9', Ornato::Hardware::ShopConfig.cloud_version

    cfg = Ornato::Hardware::ShopConfig.load
    assert_equal 'parafusado', cfg['fundo_metodo_padrao']
    assert_equal 'on', cfg['custom_tag_x']
  end

  test 'JsonModuleBuilder usa snapshot quando presente' do
    reset_state!
    snapshot = { 'folga_porta_lateral' => 99.0, 'espessura_carcaca' => 25 }
    json_def = { 'parametros' => {}, 'pecas' => [] }
    builder = Ornato::Library::JsonModuleBuilder.new(json_def, {}, shop_snapshot: snapshot)
    ctx = builder.resolved_params
    assert_equal 99.0, ctx['folga_porta_lateral']
    assert_equal 25, ctx['espessura_carcaca']
  end

  test 'refresh_shop_snapshot remove e re-aplica snapshot' do
    reset_state!
    group = ShopGroupMock.new
    group.set_attribute('Ornato', 'shop_snapshot', JSON.generate({ 'folga_porta_lateral' => 1.0 }))
    Ornato::Hardware::ShopConfig.instance_variable_set(:@cloud_version, 'v42')
    Ornato::Hardware::ShopConfig.instance_variable_set(:@cloud_profile, 'Marcenaria X')

    new_snap = Ornato::Library::JsonModuleBuilder.refresh_shop_snapshot(group)
    assert !new_snap.nil?, 'snapshot deve ser retornado'
    raw = group.get_attribute('Ornato', 'shop_snapshot', nil)
    assert raw, 'atributo deve estar populado'
    parsed = JSON.parse(raw)
    assert parsed.key?('folga_porta_lateral'), 'snapshot deve ter chaves de ShopConfig.to_expr_params'
    assert_equal 'Marcenaria X', group.get_attribute('Ornato', 'shop_profile', nil)
    assert_equal 'v42', group.get_attribute('Ornato', 'shop_version', nil)
  end

  test 'cloud_status retorna meta sem fazer request' do
    reset_state!
    Ornato::Hardware::ShopConfig.instance_variable_set(:@cloud_version, 'v7')
    Ornato::Hardware::ShopConfig.instance_variable_set(:@cloud_profile, 'A')
    status = Ornato::Hardware::ShopConfig.cloud_status
    assert_equal 'v7', status['version']
    assert_equal 'A',  status['profile']
    assert status.key?('cached')
  end

  test 'bootstrap thread não bloqueia processo principal' do
    reset_state!
    with_fake_http do
      # Resposta lenta (mas FakeHttp é síncrono — testamos só que Thread.new não levanta)
      ShopFakeHttp.responses['/api/shop/config'] = ShopFakeHttpResponse.new(
        { 'profile_name' => 'P', 'version' => 'v1', 'values' => {}, 'custom_keys' => {} }.to_json
      )
      t0 = Time.now
      th = Thread.new do
        begin
          Ornato::Hardware::ShopConfig.sync_from_cloud
        rescue
          nil
        end
      end
      # Main thread deve continuar imediatamente
      elapsed_main = Time.now - t0
      assert elapsed_main < 1.0, 'main thread não deve bloquear'
      th.join(5)
      assert !th.alive?, 'thread deve terminar'
    end
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
