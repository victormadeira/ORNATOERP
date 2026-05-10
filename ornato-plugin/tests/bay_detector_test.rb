# frozen_string_literal: true
# tests/bay_detector_test.rb — testes do BayDetector standalone (sem SketchUp)
require_relative 'test_helper'
require_relative '../ornato_sketchup/geometry/bay_detector'

# ── Helpers de fixture ──────────────────────────────────────────
module BayFixtures
  BBox = Ornato::Geometry::BBox

  # Cria entrada de peca no formato esperado pelo piece_provider injetado
  def self.piece(role, x0, y0, z0, x1, y1, z1, name: nil)
    {
      role:   role,
      bbox:   BBox.new(x0, y0, z0, x1, y1, z1),
      entity: Object.new.tap { |o| o.define_singleton_method(:to_s) { name || role.to_s } }
    }
  end

  # Balcao base parametrico (800W × 720H × 560D, esp=18, rodape=100).
  # Coords em coords locais do modulo, em mm. Frente em y=0, fundo em y=560.
  def self.balcao_base
    [
      piece(:lateral, 0, 0, 100, 18, 560, 720, name: 'lat_esq'),
      piece(:lateral, 782, 0, 100, 800, 560, 720, name: 'lat_dir'),
      piece(:base, 18, 0, 100, 782, 560, 118, name: 'base'),
      piece(:top, 18, 0, 702, 782, 560, 720, name: 'top'),
      piece(:back_panel, 18, 547, 118, 782, 553, 702, name: 'back'),
    ]
  end

  def self.shelf_mid
    piece(:shelf, 18, 0, 401, 782, 540, 419, name: 'shelf_mid')
  end

  def self.divider_mid
    piece(:divider, 391, 0, 118, 409, 540, 702, name: 'divider_mid')
  end
end

# ── Testes ──────────────────────────────────────────────────────
class BayDetectorTest < OrnatoTest::Case
  Detector = Ornato::Geometry::BayDetector

  test '1) balcao vazio (sem prateleira/divisoria) produz 1 bay' do
    pieces = BayFixtures.balcao_base
    det = Detector.new(:fake_module, piece_provider: ->(_m) { pieces })
    bays = det.bays
    assert_equal 1, bays.length, "esperava 1 bay, vieram #{bays.length}"
    bay = bays.first
    # Volume util = 764 × 547 × 584 mm
    assert (bay.width_mm  - 764.0).abs < 0.5, "width=#{bay.width_mm}"
    assert (bay.depth_mm  - 547.0).abs < 0.5, "depth=#{bay.depth_mm}"
    assert (bay.height_mm - 584.0).abs < 0.5, "height=#{bay.height_mm}"
  end

  test '2) balcao com 1 prateleira produz 2 bays (acima e abaixo)' do
    pieces = BayFixtures.balcao_base + [BayFixtures.shelf_mid]
    bays = Detector.new(:m, piece_provider: ->(_m) { pieces }).bays
    assert_equal 2, bays.length, "esperava 2 bays, vieram #{bays.length}"
    heights = bays.map { |b| b.height_mm.round(1) }.sort
    # 401-118 = 283 (inferior); 702-419 = 283 (superior)
    assert_equal [283.0, 283.0], heights
  end

  test '3) balcao com 1 divisoria produz 2 bays (esquerda e direita)' do
    pieces = BayFixtures.balcao_base + [BayFixtures.divider_mid]
    bays = Detector.new(:m, piece_provider: ->(_m) { pieces }).bays
    assert_equal 2, bays.length
    widths = bays.map { |b| b.width_mm.round(1) }.sort
    # esq: 391-18 = 373; dir: 782-409 = 373
    assert_equal [373.0, 373.0], widths
  end

  test '4) balcao com prateleira + divisoria produz 4 bays' do
    pieces = BayFixtures.balcao_base + [BayFixtures.shelf_mid, BayFixtures.divider_mid]
    bays = Detector.new(:m, piece_provider: ->(_m) { pieces }).bays
    assert_equal 4, bays.length
  end

  test '5) bay superior tem neighbor top=:top, bottom=:shelf' do
    pieces = BayFixtures.balcao_base + [BayFixtures.shelf_mid]
    bays = Detector.new(:m, piece_provider: ->(_m) { pieces }).bays
    upper = bays.max_by { |b| b.bbox_local.z_min }
    assert_equal :top,   upper.neighbor_roles[:top],    "top vizinho errado: #{upper.neighbor_roles[:top].inspect}"
    assert_equal :shelf, upper.neighbor_roles[:bottom], "bottom errado: #{upper.neighbor_roles[:bottom].inspect}"
    assert_equal :lateral, upper.neighbor_roles[:left]
    assert_equal :lateral, upper.neighbor_roles[:right]
    assert_equal :back_panel, upper.neighbor_roles[:back]
    assert_equal nil, upper.neighbor_roles[:front], 'frente deve ser aberta'
  end

  test '6) vaos com dim < 50mm sao descartados' do
    # Prateleira com folga de apenas 30mm acima do top => bay superior invalida
    pieces = BayFixtures.balcao_base + [
      BayFixtures.piece(:shelf, 18, 0, 672, 782, 540, 690, name: 'shelf_alta'),
    ]
    bays = Detector.new(:m, piece_provider: ->(_m) { pieces }).bays
    # Bay superior teria altura 702-690 = 12mm → descartada.
    # Sobra apenas o bay grande inferior (z = 118..672, H=554)
    assert_equal 1, bays.length, "esperava 1 bay (vao pequeno descartado), veio #{bays.length}"
    assert (bays.first.height_mm - 554.0).abs < 0.5
  end

  test '7) modulo sem pecas estruturais retorna bays vazio' do
    bays = Detector.new(:m, piece_provider: ->(_m) { [] }).bays
    assert_equal [], bays
    # so com pecas nao-estruturais (porta) tambem
    pieces = [BayFixtures.piece(:door, 0, -20, 100, 400, -2, 720)]
    bays2 = Detector.new(:m, piece_provider: ->(_m) { pieces }).bays
    assert_equal [], bays2
  end

  test '8) back_panel recuado define depth do bay (respeita recuo)' do
    pieces = BayFixtures.balcao_base   # back em y_min=547 (recuo 13)
    bays = Detector.new(:m, piece_provider: ->(_m) { pieces }).bays
    assert_equal 1, bays.length
    # depth = y_back - y_front = 547 - 0 = 547 (nao 560)
    assert (bays.first.depth_mm - 547.0).abs < 0.5,
           "depth deve respeitar recuo do fundo, veio #{bays.first.depth_mm}"
  end

  test '9) bays e idempotente (memoizado)' do
    pieces = BayFixtures.balcao_base + [BayFixtures.shelf_mid]
    det = Detector.new(:m, piece_provider: ->(_m) { pieces })
    a = det.bays
    b = det.bays
    assert a.equal?(b), 'bays deve ser memoizado (mesma referencia)'
  end
end

OrnatoTest.run! if __FILE__ == $PROGRAM_NAME
