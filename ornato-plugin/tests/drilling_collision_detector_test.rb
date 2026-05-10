# frozen_string_literal: true
# Smoke test: Ornato::Machining::DrillingCollisionDetector
# Adaptado de tools/test_drilling_collisions.rb (Agente J).
require_relative 'test_helper'
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'drilling_collision_detector.rb')

OrnatoTest.autorun_if_main!(__FILE__)

class DrillingCollisionDetectorTest < OrnatoTest::Case
  D = Ornato::Machining::DrillingCollisionDetector

  def find(result, tipo)
    result[:collisions].select { |c| c[:tipo] == tipo }
  end

  test 'overlap_xy ERROR: dobradiça Ø35 vs sys32 Ø8 sobrepostos' do
    ops = [
      { tipo: :furo_dobradica, peca_id: 42, x_mm: 100.0, y_mm: 50.0, z_mm: 0.0,
        diametro_mm: 35.0, profundidade_mm: 13.0, lado: :topside, fonte: 'a' },
      { tipo: :furo_sys32, peca_id: 42, x_mm: 105.0, y_mm: 51.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'b' },
    ]
    res = D.new(ops).analyze
    overlaps = find(res, :overlap_xy)
    assert_equal 1, overlaps.size
    assert_equal :error, overlaps.first[:severity]
    assert res[:stats][:by_severity][:error] >= 1
  end

  test 'overlap_xy WARNING: dois sys32 a 9mm (margem violada)' do
    ops = [
      { tipo: :furo_sys32, peca_id: 7, x_mm: 100.0, y_mm: 50.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'a' },
      { tipo: :furo_sys32, peca_id: 7, x_mm: 109.0, y_mm: 50.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'b' },
    ]
    res = D.new(ops).analyze
    overlaps = find(res, :overlap_xy)
    assert_equal 1, overlaps.size
    assert_equal :warning, overlaps.first[:severity]
  end

  test 'duplicate: mesma op repetida' do
    ops = [
      { tipo: :furo_sys32, peca_id: 9, x_mm: 50.0, y_mm: 32.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'x' },
      { tipo: :furo_sys32, peca_id: 9, x_mm: 50.0, y_mm: 32.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'x_copia' },
    ]
    res = D.new(ops).analyze
    assert_equal 1, find(res, :duplicate).size
    assert find(res, :overlap_xy).empty?, 'duplicate não duplica overlap_xy'
  end

  test 'edge_too_close: furo a 3mm da borda esquerda' do
    ops = [
      { tipo: :furo_sys32, peca_id: 1, x_mm: 3.0, y_mm: 150.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'borda' },
    ]
    bbox = { 1 => { x_min: 0.0, y_min: 0.0, z_min: 0.0,
                    x_max: 600.0, y_max: 300.0, z_max: 18.0,
                    thickness_mm: 18.0 } }
    res = D.new(ops, pieces_bbox: bbox).analyze
    edges = find(res, :edge_too_close)
    assert edges.any? { |c| c[:edge] == :edge_left }, 'detecta borda esquerda'
  end

  test 'depth_through_other_face: 12mm + 10mm em peça 18mm' do
    ops = [
      { tipo: :furo_minifix, peca_id: 8, x_mm: 100.0, y_mm: 50.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 12.0, lado: :topside, fonte: 't' },
      { tipo: :furo_minifix, peca_id: 8, x_mm: 100.0, y_mm: 50.0, z_mm: 18.0,
        diametro_mm: 8.0, profundidade_mm: 10.0, lado: :underside, fonte: 'b' },
    ]
    bbox = { 8 => { x_min: 0.0, y_min: 0.0, z_min: 0.0,
                    x_max: 600.0, y_max: 300.0, z_max: 18.0,
                    thickness_mm: 18.0 } }
    res = D.new(ops, pieces_bbox: bbox).analyze
    depth = find(res, :depth_through_other_face)
    assert_equal 1, depth.size
    assert_equal :error, depth.first[:severity]
    assert_equal 22.0, depth.first[:soma_profundidades_mm]
  end

  test 'intersects_banding: furo invade fita frontal' do
    ops = [
      { tipo: :furo_sys32, peca_id: 3, x_mm: 100.0, y_mm: 6.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'fita' },
    ]
    bbox = { 3 => { x_min: 0.0, y_min: 0.0, z_min: 0.0,
                    x_max: 600.0, y_max: 300.0, z_max: 18.0,
                    thickness_mm: 18.0 } }
    band = { 3 => [:edge_front] }
    res = D.new(ops, pieces_bbox: bbox, pieces_banding: band).analyze
    band_hits = find(res, :intersects_banding)
    assert band_hits.any? { |c| c[:edge] == :edge_front }, 'detecta fita frontal'
  end

  test 'sanidade: 3 sys32 espaçados 32mm sem colisão' do
    ops = (0..2).map do |i|
      { tipo: :furo_sys32, peca_id: 11, x_mm: 37.0, y_mm: 100.0 + i * 32.0, z_mm: 0.0,
        diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: "s#{i}" }
    end
    bbox = { 11 => { x_min: 0.0, y_min: 0.0, z_min: 0.0,
                     x_max: 600.0, y_max: 1800.0, z_max: 18.0,
                     thickness_mm: 18.0 } }
    res = D.new(ops, pieces_bbox: bbox).analyze
    assert res[:collisions].empty?, 'nenhuma colisão'
    assert_equal 3, res[:stats][:ops_total]
    assert_equal 0, res[:stats][:by_severity][:error]
  end
end
