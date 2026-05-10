# frozen_string_literal: true
# tests/reflow_test.rb
# ──────────────────────────────────────────────────────────────────
# Sprint REFLOW — testes do AggregatePersistor + match algorithm.
# Foco em lógica pura (sem SketchUp): signatures, compatibilidade,
# tolerâncias e roundtrip JSON. Os caminhos que dependem de
# Sketchup::Group real (rebuild end-to-end) são exercidos
# manualmente no plugin; aqui validamos os blocos puros.
# ──────────────────────────────────────────────────────────────────

require_relative 'test_helper'
require 'json'
require_relative '../ornato_sketchup/library/aggregate_persistor'

module OrnatoTest
  class ReflowTest < Case
    Persistor = Ornato::Library::AggregatePersistor

    # ── Mock de Bay simples (duck-type compatível com BayDetector) ──
    class FakeBBox
      attr_reader :x_min, :y_min, :z_min, :x_max, :y_max, :z_max
      def initialize(x_min, y_min, z_min, x_max, y_max, z_max)
        @x_min, @y_min, @z_min = x_min.to_f, y_min.to_f, z_min.to_f
        @x_max, @y_max, @z_max = x_max.to_f, y_max.to_f, z_max.to_f
      end
      def width;  @x_max - @x_min; end
      def height; @z_max - @z_min; end
      def depth;  @y_max - @y_min; end
    end

    class FakeBay
      attr_reader :id, :type, :bbox_local, :neighbor_roles
      def initialize(id:, bbox:, neighbors: {}, type: :interior_bay)
        @id = id
        @bbox_local = bbox
        @neighbor_roles = neighbors
        @type = type
      end
    end

    class FakeAgg
      attr_reader :entityID
      def initialize(id:, attrs: {})
        @entityID = id
        @attrs = { 'Ornato' => attrs }
      end
      def get_attribute(dict, key, default = nil)
        (@attrs[dict] || {}).fetch(key.to_s, default)
      end
      def set_attribute(dict, key, value)
        (@attrs[dict] ||= {})[key.to_s] = value
      end
      def valid?; true; end
    end

    class FakeParent
      attr_reader :entities
      def initialize(attrs: {}, entities: [], bounds_mm: nil)
        @attrs = { 'Ornato' => attrs }
        @entities = entities
        @bounds_mm = bounds_mm
      end
      def get_attribute(dict, key, default = nil)
        (@attrs[dict] || {}).fetch(key.to_s, default)
      end
      def set_attribute(dict, key, value)
        (@attrs[dict] ||= {})[key.to_s] = value
      end
      def respond_to?(m, *)
        return true if %i[bounds entities get_attribute set_attribute].include?(m)
        super
      end
      def bounds
        # Simula Sketchup::BoundingBox — coords em mm para simplificar (override de to_mm)
        return nil unless @bounds_mm
        FakeBounds.new(@bounds_mm)
      end
    end

    class FakeBounds
      attr_reader :min, :max
      def initialize(arr)
        @min = FakePt.new(*arr[0])
        @max = FakePt.new(*arr[1])
      end
    end

    class FakePt
      attr_reader :x, :y, :z
      def initialize(x, y, z); @x, @y, @z = x, y, z; end
    end

    # Persistor.to_mm trata valores numéricos sem `.to_mm` como inches
    # (multiplica por 25.4). Em runs onde outro test stuba Float#to_mm
    # como identidade, o caminho muda. Para evitar acoplamento, usamos
    # objetos value-only com `.to_mm` explícito devolvendo o valor em mm.
    class MmVal
      attr_reader :mm
      def initialize(mm); @mm = mm.to_f; end
      def to_f; @mm; end
      def to_mm; @mm; end
      def respond_to?(m, *)
        return true if %i[to_f to_mm].include?(m)
        super
      end
    end

    def parent_with_extent_mm(min_mm, max_mm)
      FakeParent.new(
        bounds_mm: [
          [MmVal.new(min_mm[0]), MmVal.new(min_mm[1]), MmVal.new(min_mm[2])],
          [MmVal.new(max_mm[0]), MmVal.new(max_mm[1]), MmVal.new(max_mm[2])],
        ]
      )
    end

    # ── 1. Signature roundtrip via JSON estampado ─────────────────
    test 'build_signature lê bay_signature persistido' do
      sig_json = JSON.generate(
        'neighbors'    => { 'top' => 'top', 'bottom' => 'base', 'left' => 'lateral', 'right' => 'lateral', 'back' => 'back_panel' },
        'relative_pos' => { 'x' => 0.0, 'y' => 0.0, 'z' => 0.5 },
        'type'         => 'interior_bay'
      )
      agg = FakeAgg.new(id: 1, attrs: { 'bay_signature' => sig_json })
      sig = Persistor.build_signature(agg, FakeParent.new, 0)
      assert_equal :base, sig[:neighbors][:bottom]
      assert_equal 0.5, sig[:relative_pos]['z']
      assert_equal :interior_bay, sig[:type]
    end

    # ── 2. signatures_compatible? — bay igual ─────────────────────
    test 'signatures_compatible? aceita bay com mesmas neighbors e pos' do
      a = { neighbors: { left: :lateral, right: :lateral, back: :back_panel },
            relative_pos: { 'x' => 0.0, 'y' => 0.0, 'z' => 0.5 }, type: :interior_bay }
      b = { neighbors: { left: :lateral, right: :lateral, back: :back_panel },
            relative_pos: { 'x' => 0.02, 'y' => 0.0, 'z' => 0.51 }, type: :interior_bay }
      assert Persistor.signatures_compatible?(a, b)
    end

    # ── 3. signatures_compatible? — relative_pos fora da tolerância ───
    test 'signatures_compatible? rejeita pos muito divergente' do
      a = { neighbors: {}, relative_pos: { 'x' => 0.0, 'y' => 0.0, 'z' => 0.0 }, type: :interior_bay }
      b = { neighbors: {}, relative_pos: { 'x' => 0.0, 'y' => 0.0, 'z' => 0.5 }, type: :interior_bay }
      refute Persistor.signatures_compatible?(a, b)
    end

    # ── 4. signatures_compatible? — neighbor side conflitante ─────
    test 'signatures_compatible? rejeita roles laterais incompatíveis' do
      a = { neighbors: { left: :lateral, right: :divider }, relative_pos: { 'x' => 0.0, 'y' => 0.0, 'z' => 0.0 }, type: :interior_bay }
      b = { neighbors: { left: :lateral, right: :lateral }, relative_pos: { 'x' => 0.0, 'y' => 0.0, 'z' => 0.0 }, type: :interior_bay }
      refute Persistor.signatures_compatible?(a, b)
    end

    # ── 5. match_bay_after_resize — resize simples preserva bay ───
    test 'match_bay_after_resize encontra bay equivalente após resize' do
      # Cenário: módulo 800×720×560 → resize 1000×720×560
      # Bay original ocupava todo o vão interior (rel_pos ~0,0,0.05)
      sig = {
        neighbors:    { left: :lateral, right: :lateral, back: :back_panel },
        relative_pos: { 'x' => 0.025, 'y' => 0.0, 'z' => 0.025 },
        type:         :interior_bay,
        index:        0,
      }
      # Bay novo (largura maior) com mesma topologia e fração próxima
      bay_new = FakeBay.new(
        id: 'bay_1',
        bbox: FakeBBox.new(18, 0, 18, 982, 560, 702),
        neighbors: { left: :lateral, right: :lateral, back: :back_panel, top: :top, bottom: :base }
      )
      parent = parent_with_extent_mm([0, 0, 0], [1000, 560, 720])
      result = Persistor.match_bay_after_resize(sig, [bay_new], parent)
      assert_equal bay_new, result
    end

    # ── 6. match_bay_after_resize — sem candidatos compatíveis ────
    test 'match_bay_after_resize devolve nil quando nenhum bay encaixa' do
      sig = {
        neighbors:    { left: :lateral, right: :lateral },
        relative_pos: { 'x' => 0.0, 'y' => 0.0, 'z' => 0.5 },
        type:         :interior_bay,
      }
      # Bay novo com pos completamente diferente
      bay_new = FakeBay.new(
        id: 'bay_X',
        bbox: FakeBBox.new(0, 0, 0, 100, 100, 50),
        neighbors: { left: :lateral, right: :lateral }
      )
      parent = parent_with_extent_mm([0, 0, 0], [200, 100, 720])
      result = Persistor.match_bay_after_resize(sig, [bay_new], parent)
      assert_equal nil, result
    end

    # ── 7. snapshot vazio quando parent não tem agregados ─────────
    test 'snapshot devolve [] quando parent.aggregates é vazio' do
      parent = FakeParent.new(attrs: { 'aggregates' => '[]' })
      assert_equal [], Persistor.snapshot(parent)
    end

    # ── 8. snapshot constrói specs com signature derivada ─────────
    test 'snapshot devolve spec por agregado encontrado no group' do
      sig_json = JSON.generate(
        'neighbors'    => { 'left' => 'lateral', 'right' => 'lateral' },
        'relative_pos' => { 'x' => 0.0, 'y' => 0.0, 'z' => 0.4 },
        'type'         => 'interior_bay'
      )
      agg = FakeAgg.new(id: 42, attrs: {
        'bay_signature' => sig_json,
        'params'        => JSON.generate('espessura' => 18, 'recuo_frente' => 5),
      })
      parent = FakeParent.new(
        attrs: { 'aggregates' => JSON.generate([
          { 'id' => 42, 'aggregate_id' => 'prateleira', 'bay_id' => 'bay_1' }
        ]) },
        entities: [agg]
      )

      specs = Persistor.snapshot(parent)
      assert_equal 1, specs.size
      assert_equal 'prateleira', specs[0][:aggregate_id]
      assert_equal 18, specs[0][:params]['espessura']
      assert_equal :lateral, specs[0][:signature][:neighbors][:left]
      assert_equal 0.4, specs[0][:signature][:relative_pos]['z']
    end

    # ── 9. snapshot ignora entries cujo entity sumiu ──────────────
    test 'snapshot pula entry sem entity correspondente no group' do
      parent = FakeParent.new(
        attrs: { 'aggregates' => JSON.generate([
          { 'id' => 999, 'aggregate_id' => 'prateleira', 'bay_id' => 'bay_1' }
        ]) },
        entities: []  # nenhum entity com id=999
      )
      assert_equal [], Persistor.snapshot(parent)
    end

    # ── 10. relative_pos_distance é euclidiana ────────────────────
    test 'relative_pos_distance computa distância 3D' do
      a = { 'x' => 0.0, 'y' => 0.0, 'z' => 0.0 }
      b = { 'x' => 1.0, 'y' => 0.0, 'z' => 0.0 }
      assert_equal 1.0, Persistor.relative_pos_distance(a, b).round(6)
    end
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
