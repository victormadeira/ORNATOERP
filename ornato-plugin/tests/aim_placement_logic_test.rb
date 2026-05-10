# frozen_string_literal: true
# tests/aim_placement_logic_test.rb
# ──────────────────────────────────────────────────────────────────
# Testa funções puras de AimPlacementTool sem precisar do SketchUp.
# Mockamos PickHelper path, Bay e Transformation com Structs.
# ──────────────────────────────────────────────────────────────────

require_relative 'test_helper'

# ── Stubs mínimos das constantes / classes do SketchUp ───────────
unless defined?(Sketchup)
  module Sketchup
    class Color
      def initialize(*); end
    end
    def self.active_model; nil; end
    def self.status_text=(*); end
    def self.status_text; ''; end
  end
end

unless defined?(Geom)
  module Geom
    class Point3d
      attr_reader :x, :y, :z
      def initialize(x, y, z); @x, @y, @z = x.to_f, y.to_f, z.to_f; end
    end
    class BoundingBox
      def initialize; @min = nil; @max = nil; end
    end
  end
end

unless defined?(Ornato)
  module Ornato; end
end

# Stub do BayDetector pra activate() não desligar a tool
unless defined?(Ornato::Geometry)
  module Ornato
    module Geometry
      class BayDetector
        def initialize(_grp); end
        def bays; []; end
      end
    end
  end
end

unless defined?(GL_QUADS); GL_QUADS = 1; end
unless defined?(GL_LINES); GL_LINES = 2; end
unless defined?(CONSTRAIN_MODIFIER_MASK); CONSTRAIN_MODIFIER_MASK = 8; end

require_relative '../ornato_sketchup/tools/aim_placement_tool'

# ── Helpers de teste ─────────────────────────────────────────────
class FakeBBox
  attr_reader :min, :max
  def initialize(min_pt, max_pt); @min = min_pt; @max = max_pt; end
  def contains?(pt)
    pt.x >= min.x && pt.x <= max.x &&
    pt.y >= min.y && pt.y <= max.y &&
    pt.z >= min.z && pt.z <= max.z
  end
end

FakeBay = Struct.new(:bbox_local, :width_mm, :height_mm, :depth_mm)

class FakeTransform
  # Identidade (transform * pt = pt) — suficiente pra testar transform_bbox
  def *(other); other; end
end

class FakeEntity
  attr_reader :entityID
  def initialize(attrs = {}, id = 1)
    @attrs = { 'Ornato' => attrs }
    @entityID = id
  end
  def get_attribute(dict, key, default = nil)
    (@attrs[dict] || {})[key.to_s] || (@attrs[dict] || {})[key] || default
  end
  def respond_to?(m, *)
    return true if m == :get_attribute
    super
  end
end

# ── Tests ────────────────────────────────────────────────────────
class AimPlacementLogicTest < OrnatoTest::Case
  def tool
    @tool ||= Ornato::Tools::AimPlacementTool.new('prateleira')
  end

  test 'walk_up_to_module retorna entity com tipo=modulo' do
    leaf   = FakeEntity.new({}, 10)
    parent = FakeEntity.new({ 'tipo' => 'modulo' }, 11)
    path = [parent, leaf]
    found = tool.walk_up_to_module(path)
    assert_equal 11, found.entityID
  end

  test 'walk_up_to_module aceita legado module_type' do
    leaf = FakeEntity.new({ 'module_type' => 'armario_base' }, 22)
    found = tool.walk_up_to_module([leaf])
    assert_equal 22, found.entityID
  end

  test 'walk_up_to_module retorna nil se não há módulo Ornato' do
    leaf = FakeEntity.new({}, 33)
    assert_equal nil, tool.walk_up_to_module([leaf])
    assert_equal nil, tool.walk_up_to_module(nil)
  end

  test 'aggregate_fits? aprova vão maior que mínimo' do
    bay  = FakeBay.new(nil, 600, 720, 350)
    meta = { 'min_bay' => { 'largura' => 100, 'altura' => 50, 'profundidade' => 100 } }
    assert tool.aggregate_fits?(bay, meta)
  end

  test 'aggregate_fits? rejeita vão menor que mínimo' do
    bay  = FakeBay.new(nil, 30, 720, 350)
    meta = { 'min_bay' => { 'largura' => 100, 'altura' => 50, 'profundidade' => 100 } }
    refute tool.aggregate_fits?(bay, meta)
  end

  test 'aggregate_fits? sem min_bay aceita qualquer dim' do
    bay = FakeBay.new(nil, 10, 10, 10)
    assert tool.aggregate_fits?(bay, { 'nome' => 'X' })
    assert tool.aggregate_fits?(bay, nil)
  end

  test 'aggregate_fits? false se bay nil' do
    refute tool.aggregate_fits?(nil, { 'min_bay' => { 'largura' => 100 } })
  end

  test 'transform_bbox retorna [min,max] em world coords (identidade)' do
    bbox = FakeBBox.new(Geom::Point3d.new(0, 0, 0), Geom::Point3d.new(100, 200, 300))
    bay  = FakeBay.new(bbox, 100, 300, 200)
    out  = Ornato::Tools::AimPlacementTool.transform_bbox(bay, FakeTransform.new)
    assert_equal 0,   out[0].x
    assert_equal 100, out[1].x
    assert_equal 300, out[1].z
  end

  test 'transform_bbox retorna nil se bay sem bbox_local' do
    bay = FakeBay.new(nil, 0, 0, 0)
    assert_equal nil, Ornato::Tools::AimPlacementTool.transform_bbox(bay, FakeTransform.new)
  end

  test 'load_aggregate_meta carrega defaults pra ids conhecidos' do
    meta = Ornato::Tools::AimPlacementTool.load_aggregate_meta('prateleira')
    assert_equal 'Prateleira', meta['nome']
    assert meta['min_bay']['largura'] > 0
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
