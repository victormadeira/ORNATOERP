# frozen_string_literal: true
# tests/e2e/upm_to_gcode_test.rb
# ──────────────────────────────────────────────────────────────────
# E2E-1 — Pipeline UPM → G-code:
#   dobradica 3D (componente_3d) → FerragemDrillingCollector
#   → MachiningJson.serialize → JSON pronto pro pos-processador.
#
# Cobre o seam onde o plugin entrega ops a um serializador externo,
# garantindo que op.category=hole, side ∈ VALID_SIDES, diameter <= 12mm
# em edge_* e peca_id está presente.
# ──────────────────────────────────────────────────────────────────

require_relative '../test_helper'

# ── Stubs SketchUp/Geom mínimos (mesma técnica do ferragem_drilling_collector_test) ─
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

class ::Float; def to_mm; self; end; end unless 1.0.respond_to?(:to_mm)
class ::Integer; def to_mm; to_f; end; end unless 1.respond_to?(:to_mm)

require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'drilling_collision_detector.rb')
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'skp_feature_extractor.rb')
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'ferragem_drilling_collector.rb')
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'machining_json.rb')

# Substitui o extractor real por features de uma dobradiça (Amor 35mm).
# Simula 2 furos: corpo (35mm topside) + 2 furos satélite de fixação (5mm).
module Ornato::Machining
  class SkpFeatureExtractor
    SCENARIO = :dobradica_amor
    def initialize(_defn); end
    def extract
      case SCENARIO
      when :dobradica_amor
        [
          # Furo grande (caneco da dobradiça) — face superior
          { tipo: :furo_dobradica,
            center: Geom::Point3d.new(0.1, 0.05, 0.0),
            normal: Geom::Vector3d.new(0, 0, 1),
            diametro_mm: 35.0, profundidade_mm: 13.0,
            bbox: nil, confidence: 0.95, raw_face_count: 4, notes: [] },
          # Furo de fixação 1 — face inferior, broca pequena
          { tipo: :furo_fixacao,
            center: Geom::Point3d.new(0.12, 0.07, 0.0),
            normal: Geom::Vector3d.new(0, 0, 1),
            diametro_mm: 5.0, profundidade_mm: 13.0,
            bbox: nil, confidence: 0.9, raw_face_count: 4, notes: [] },
        ]
      end
    end
  end
end

# ── Fixtures (idênticas ao ferragem_drilling_collector_test) ──
class E2EFakeInstance
  attr_accessor :entityID, :transformation, :definition
  def initialize(attrs:, klass: :instance)
    @attrs = { 'Ornato' => attrs }
    @klass = klass
    @entityID = rand(99_999)
    @transformation = E2EFakeTx.new
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

class E2EFakeTx
  def inverse; self; end
  def to_a; [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; end
end

class E2EFakeParent
  attr_reader :entities
  def initialize(children); @entities = children; end
  def respond_to?(m, *); m == :entities ? true : super; end
end

OrnatoTest.autorun_if_main!(__FILE__)

class UpmToGcodeE2ETest < OrnatoTest::Case
  test 'E2E: ferragem 3D vira ops UPM serializadas pelo MachiningJson' do
    # ── 1. Monta cenário: 1 ferragem dobradica + 1 anchor lateral_esq ──
    dobradica = E2EFakeInstance.new(attrs: {
      'tipo' => 'ferragem',
      'preserve_drillings' => true,
      'anchor_role' => 'lateral_esq',
      'componente_3d' => 'ferragens/dobradica_amor.skp',
      'regra' => 'hinge_blum'
    })
    lateral_esq = E2EFakeInstance.new(attrs: {
      'tipo' => 'peca', 'role' => 'lateral_esq', 'persistent_id' => 'L_ESQ_01'
    }, klass: :group)
    parent = E2EFakeParent.new([dobradica, lateral_esq])

    # ── 2. Coleta ops (FerragemDrillingCollector) ──
    out = Ornato::Machining::FerragemDrillingCollector.new(parent).collect

    # ── 3. Valida shape (5 asserts) ──
    ops = out['L_ESQ_01']
    assert ops.is_a?(Array), 'peca_id presente como chave em machining_hash'
    assert ops.size >= 1, "esperava >= 1 op, veio #{ops&.size}"

    ops.each do |op|
      assert_equal 'hole', op[:category], "todas ops devem ser hole, veio #{op[:category]}"
      assert Ornato::Machining::MachiningJson::VALID_SIDES.include?(op[:side].to_s),
             "side #{op[:side].inspect} fora de VALID_SIDES"
      assert op[:diameter].to_f > 0, "diameter deve ser positivo"
      # Regra UPM: edge_* só com diameter <= 12mm
      if Ornato::Machining::MachiningJson::EDGE_SIDES.include?(op[:side].to_s)
        assert op[:diameter].to_f <= 12.0,
               "edge_* exige diameter <= 12mm (veio #{op[:diameter]})"
      end
    end

    # ── 4. Serializa via MachiningJson e valida saída ──
    serializer = Ornato::Machining::MachiningJson.new
    serialized = serializer.serialize(out)

    assert serialized.is_a?(Hash), 'serialize retorna Hash'
    assert serialized.key?('L_ESQ_01'), 'persistent_id estampado na saída'
    workers = serialized['L_ESQ_01']['workers']
    assert workers.is_a?(Hash) && !workers.empty?,
           'workers populado com ops_N'

    # ── 5. Validador interno (validate) confirma ops íntegras ──
    errors = serializer.validate(workers)
    assert errors.empty?, "MachiningJson.validate deve passar, erros: #{errors.inspect}"

    # ── 6. Cada worker tem campos obrigatórios (position_x/y, diameter, depth) ──
    first_op = workers.values.first
    %w[category position_x position_y diameter depth side].each do |k|
      assert first_op.key?(k), "worker deve ter campo '#{k}'"
    end
    assert_equal 'hole', first_op['category']
  end

  test 'E2E: ferragem sem anchor matching nao gera ops (degrada gracefully)' do
    dobradica = E2EFakeInstance.new(attrs: {
      'tipo' => 'ferragem', 'preserve_drillings' => true,
      'anchor_role' => 'role_inexistente', 'componente_3d' => 'x.skp'
    })
    parent = E2EFakeParent.new([dobradica])
    out = Ornato::Machining::FerragemDrillingCollector.new(parent).collect
    assert out.values.flatten.empty?, 'sem ops quando nenhum anchor encontrado'

    serialized = Ornato::Machining::MachiningJson.new.serialize(out)
    assert_equal({}, serialized, 'serialize de hash vazio retorna {}')
  end

  test 'E2E: pipeline completo — 2 ferragens, 2 anchors distintos, ops segregadas por peca_id' do
    f1 = E2EFakeInstance.new(attrs: {
      'tipo' => 'ferragem', 'preserve_drillings' => true,
      'anchor_role' => 'lateral_esq', 'componente_3d' => 'd1.skp'
    })
    f2 = E2EFakeInstance.new(attrs: {
      'tipo' => 'ferragem', 'preserve_drillings' => true,
      'anchor_role' => 'lateral_dir', 'componente_3d' => 'd2.skp'
    })
    lat_e = E2EFakeInstance.new(attrs: {
      'tipo' => 'peca', 'role' => 'lateral_esq', 'persistent_id' => 'L_E'
    }, klass: :group)
    lat_d = E2EFakeInstance.new(attrs: {
      'tipo' => 'peca', 'role' => 'lateral_dir', 'persistent_id' => 'L_D'
    }, klass: :group)
    parent = E2EFakeParent.new([f1, f2, lat_e, lat_d])

    out = Ornato::Machining::FerragemDrillingCollector.new(parent).collect
    assert out['L_E'] && !out['L_E'].empty?, 'L_E com ops'
    assert out['L_D'] && !out['L_D'].empty?, 'L_D com ops'

    serialized = Ornato::Machining::MachiningJson.new.serialize(out)
    assert serialized['L_E']['workers'].any?, 'L_E workers'
    assert serialized['L_D']['workers'].any?, 'L_D workers'
  end
end
