# frozen_string_literal: true
# Smoke test: Ornato::Machining::FerragemDrillingCollector
#
# Estratégia: stub mínimo de Sketchup::*/Geom::* antes do require, depois
# substitui SkpFeatureExtractor#extract por uma versão fake que devolve
# features pré-fabricadas. Não carrega gem SketchUp.
require_relative 'test_helper'

# ── Stubs SketchUp/Geom mínimos (apenas constantes p/ resolver classes) ─
unless defined?(Sketchup)
  module Sketchup
    class ComponentInstance; end
    class Group; end
    class ComponentDefinition; end
    class Face; end
  end
end

unless defined?(Geom)
  module Geom
    class Point3d
      attr_accessor :x, :y, :z
      def initialize(x = 0, y = 0, z = 0); @x = x.to_f; @y = y.to_f; @z = z.to_f; end
      def transform(_tx); self.class.new(@x, @y, @z); end
    end
    class Vector3d
      attr_accessor :x, :y, :z
      def initialize(x = 0, y = 0, z = 0); @x = x.to_f; @y = y.to_f; @z = z.to_f; end
      def length; Math.sqrt(@x**2 + @y**2 + @z**2); end
      def normalize!; l = length; return self if l < 1e-12; @x /= l; @y /= l; @z /= l; self; end
      def clone; self.class.new(@x, @y, @z); end
      def transform(_tx); clone; end
    end
    class BoundingBox; end
  end
end

# Float#to_mm não existe fora de SketchUp — stub de identidade.
class ::Float; def to_mm; self; end; end unless 1.0.respond_to?(:to_mm)
class ::Integer; def to_mm; to_f; end; end unless 1.respond_to?(:to_mm)

require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'drilling_collision_detector.rb')
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'skp_feature_extractor.rb')
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'ferragem_drilling_collector.rb')

# Substitui o extractor real por stub controlável.
module Ornato::Machining
  class SkpFeatureExtractor
    def initialize(_defn); end
    def extract
      [
        { tipo: :furo_dobradica,
          center: Geom::Point3d.new(0.1, 0.05, 0.0),
          normal: Geom::Vector3d.new(0, 0, 1),
          diametro_mm: 35.0, profundidade_mm: 13.0,
          bbox: nil, confidence: 0.9, raw_face_count: 4, notes: [] }
      ]
    end
  end
end

# Mock de instance/group com API mínima usada pelo collector.
class FakeInstance
  attr_accessor :entityID, :transformation, :definition
  def initialize(attrs:, klass: :instance)
    @attrs = { 'Ornato' => attrs }
    @klass = klass
    @entityID = rand(99_999)
    @transformation = FakeTx.new
    @definition = Object.new
  end
  def get_attribute(dict, key, default = nil)
    h = @attrs[dict] || {}
    h.fetch(key, h.fetch(key.to_sym, default))
  end
  def set_attribute(dict, key, value); (@attrs[dict] ||= {})[key] = value; end
  def is_a?(klass)
    return true if klass == Sketchup::ComponentInstance && @klass == :instance
    return true if klass == Sketchup::Group && @klass == :group
    super
  end
end

class FakeTx
  def inverse; self; end
  def to_a; [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; end
end

class FakeParent
  attr_reader :entities
  def initialize(children); @entities = children; end
  def respond_to?(m, *); m == :entities ? true : super; end
end

OrnatoTest.autorun_if_main!(__FILE__)

class FerragemDrillingCollectorTest < OrnatoTest::Case
  test 'ignora ComponentInstance sem preserve_drillings' do
    inst = FakeInstance.new(attrs: { 'tipo' => 'ferragem', 'preserve_drillings' => false })
    anchor = FakeInstance.new(attrs: { 'tipo' => 'peca', 'role' => 'lateral_esq', 'persistent_id' => 'P1' }, klass: :group)
    parent = FakeParent.new([inst, anchor])
    out = Ornato::Machining::FerragemDrillingCollector.new(parent).collect
    # Sem ferragens válidas: hash vazio (defaultproc), e nenhum drilling collisions
    refute out.key?(:_drilling_collisions), 'nenhum relatorio quando nao ha ops'
    assert out.values.flatten.empty?, 'sem ops produzidas'
  end

  test 'processa ferragem 3D quando preserve_drillings=true e produz op' do
    inst = FakeInstance.new(attrs: {
      'tipo' => 'ferragem', 'preserve_drillings' => true,
      'anchor_role' => 'lateral_esq', 'componente_3d' => 'dobradica.skp',
      'regra' => 'hinge_blum'
    })
    anchor = FakeInstance.new(attrs: {
      'tipo' => 'peca', 'role' => 'lateral_esq', 'persistent_id' => 'P1'
    }, klass: :group)
    parent = FakeParent.new([inst, anchor])

    out = Ornato::Machining::FerragemDrillingCollector.new(parent).collect

    ops = out['P1']
    assert ops.is_a?(Array) && ops.size == 1, 'gerou 1 op pra P1'
    op = ops.first
    assert_equal 'hole', op[:category]
    assert_equal 'furo_dobradica', op[:tipo_ornato]
    assert_equal 35.0, op[:diameter]
    assert op[:fonte].include?('wps_skp:dobradica.skp')
  end

  test 'sem anchor matching: pula instance e nao quebra' do
    inst = FakeInstance.new(attrs: {
      'tipo' => 'ferragem', 'preserve_drillings' => true,
      'anchor_role' => 'role_inexistente', 'componente_3d' => 'x.skp'
    })
    parent = FakeParent.new([inst])
    out = Ornato::Machining::FerragemDrillingCollector.new(parent).collect
    assert out.values.flatten.empty?
  end
end
