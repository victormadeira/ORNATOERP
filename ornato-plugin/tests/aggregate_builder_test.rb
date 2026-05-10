# frozen_string_literal: true
# tests/aggregate_builder_test.rb
# Testes do JsonModuleBuilder.build_aggregate (Sprint MIRA-C).

require_relative 'test_helper'
require 'json'
require_relative '../ornato_sketchup/library/expression_evaluator'
require_relative '../ornato_sketchup/library/json_module_builder'

module OrnatoTest
  class AggregateBuilderTest < Case
    Eval = Ornato::Library::ExpressionEvaluator

    AGREGADOS_DIR = File.expand_path('../biblioteca/agregados', __dir__)

    # ── 1. Os 3 JSONs de agregado parseiam ─────────────────────────
    test 'all 3 aggregate JSONs parse and have tipo=agregado' do
      %w[prateleira divisoria gaveteiro_simples].each do |id|
        path = File.join(AGREGADOS_DIR, "#{id}.json")
        assert File.exist?(path), "JSON ausente: #{path}"
        json = JSON.parse(File.read(path))
        assert_equal 'agregado', json['tipo'], "tipo errado em #{id}"
        assert json['min_bay'].is_a?(Hash), "min_bay ausente em #{id}"
        assert_equal 'interior_bay', json['bay_target']
      end
    end

    # ── 2. ExpressionEvaluator resolve {bay.xxx} via _bay ──────────
    test '{bay.largura} resolves via _bay bucket to numeric' do
      ev = Eval.new(
        'recuo_frente' => 5,
        '_bay' => { 'largura' => 800.0, 'altura' => 600.0, 'profundidade' => 400.0 }
      )
      assert_equal 800.0, ev.eval('{bay.largura}')
      assert_equal 395.0, ev.eval('{bay.profundidade} - {recuo_frente}')
      assert_equal 300.0, ev.eval('{bay.altura} / 2')
    end

    # ── 3. Namespace bay. é whitelisted (não rejeita) ─────────────
    test 'bay namespace is whitelisted in ExpressionEvaluator' do
      assert_includes Eval::ALLOWED_NAMESPACES, 'bay'
      # E o shop. continua funcionando
      assert_includes Eval::ALLOWED_NAMESPACES, 'shop'
    end

    # ── 4. Namespace inválido continua rejeitado ──────────────────
    test 'unknown namespace still rejected' do
      ev = Eval.new('_bay' => { 'largura' => 100 })
      assert_equal 0.0, ev.eval('{room.x}')
      assert_equal 0.0, ev.eval('{module.x}')
    end

    # ── 5. Repeat axis com {bay.xxx} no offset ────────────────────
    test 'repeat axis expands using bay-context expressions' do
      # Carrega definição do gaveteiro e checa que parametros usam {bay.altura}
      json = JSON.parse(File.read(File.join(AGREGADOS_DIR, 'gaveteiro_simples.json')))
      altura_frente_default = json['parametros']['altura_frente']['default']
      assert altura_frente_default.include?('{bay.altura}'),
             "default de altura_frente deveria usar {bay.altura}: #{altura_frente_default}"

      # Avalia altura_frente com bay 600mm e 3 gavetas e folga 3
      ev = Eval.new(
        'n_gavetas' => 3,
        'folga_entre_gavetas' => 3,
        '_bay' => { 'altura' => 609.0 }
      )
      result = ev.eval(altura_frente_default)
      # (609 - 3 * 2) / 3 = 603/3 = 201
      assert_equal 201.0, result.round(3)
    end

    # ── 6. validate_min_bay! levanta para vão pequeno ─────────────
    test 'validate_min_bay raises when bay is smaller than min' do
      json = { 'min_bay' => { 'largura' => 250, 'altura' => 200, 'profundidade' => 350 } }
      bay_small = { 'largura' => 200.0, 'altura' => 100.0, 'profundidade' => 200.0 }
      bay_ok    = { 'largura' => 300.0, 'altura' => 250.0, 'profundidade' => 400.0 }

      assert_raises(RuntimeError) do
        Ornato::Library::JsonModuleBuilder.validate_min_bay!(json, bay_small)
      end

      # ok não levanta
      Ornato::Library::JsonModuleBuilder.validate_min_bay!(json, bay_ok)
    end

    # ── 7. bay_to_params extrai dims do bay ───────────────────────
    test 'bay_to_params reads width/height/depth from bay duck-type' do
      bay = FakeBay.new(width_mm: 800, height_mm: 720, depth_mm: 560)
      h = Ornato::Library::JsonModuleBuilder.bay_to_params(bay)
      assert_equal 800.0, h['largura']
      assert_equal 720.0, h['altura']
      assert_equal 560.0, h['profundidade']
    end

    # ── 8. set_bay_context injeta _bay e invalida cache ───────────
    test 'set_bay_context injects _bay into params for expression evaluator' do
      stub_shop_config!
      json = { 'parametros' => { 'recuo' => { 'default' => 5 } }, 'pecas' => [] }
      builder = Ornato::Library::JsonModuleBuilder.new(json, {})
      builder.set_bay_context('largura' => 800.0, 'altura' => 600.0, 'profundidade' => 400.0)
      assert_equal 800.0, builder.eval_dim('{bay.largura}')
      assert_equal 395.0, builder.eval_dim('{bay.profundidade} - {recuo}')
    end

    # ── 9. load_aggregate_definition lê JSON do dir agregados ─────
    test 'load_aggregate_definition reads from biblioteca/agregados/' do
      defn = Ornato::Library::JsonModuleBuilder.load_aggregate_definition('prateleira')
      assert defn.is_a?(Hash)
      assert_equal 'agregado', defn['tipo']
      assert_equal 'prateleira', defn['id']
    end

    # ── 10. Slug inválido rejeitado ───────────────────────────────
    test 'load_aggregate_definition rejects path traversal slug' do
      assert_equal nil, Ornato::Library::JsonModuleBuilder.load_aggregate_definition('../moveis/cozinha/balcao_2_portas')
      assert_equal nil, Ornato::Library::JsonModuleBuilder.load_aggregate_definition('inexistente_xyz')
    end

    private

    # Mock leve compatível com a API esperada pelo build_aggregate
    class FakeBay
      attr_reader :module_group, :id, :width_mm, :height_mm, :depth_mm, :origin
      def initialize(module_group: nil, id: 'bay-1', width_mm: 0, height_mm: 0, depth_mm: 0, origin: [0, 0, 0])
        @module_group = module_group
        @id = id
        @width_mm = width_mm
        @height_mm = height_mm
        @depth_mm = depth_mm
        @origin = origin
      end
    end

    def stub_shop_config!
      return if defined?(Ornato::Hardware::ShopConfig) && Ornato::Hardware::ShopConfig.respond_to?(:to_expr_params)
      Object.const_set(:Ornato, Module.new) unless defined?(Ornato)
      Ornato.const_set(:Hardware, Module.new) unless defined?(Ornato::Hardware)
      unless defined?(Ornato::Hardware::ShopConfig)
        sc = Module.new do
          def self.to_expr_params; { 'espessura' => 18 }; end
          def self.cloud_profile; nil; end
          def self.cloud_version; '0'; end
          def self.load; { 'espessura' => 18 }; end
        end
        Ornato::Hardware.const_set(:ShopConfig, sc)
      end
    end
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
