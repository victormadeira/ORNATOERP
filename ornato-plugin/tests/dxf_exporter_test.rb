# frozen_string_literal: true
# Smoke test: Ornato::Export::DxfExporter
# Valida shape do DXF exportado: header, layers, entities, EOF.
require_relative 'test_helper'
require 'fileutils'
require 'tmpdir'

unless defined?(Sketchup)
  module Sketchup
    def self.active_model; nil; end
  end
end

require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'export', 'dxf_exporter.rb')

OrnatoTest.autorun_if_main!(__FILE__)

class DxfExporterTest < OrnatoTest::Case
  def fixture_data
    {
      pieces: [
        {
          persistent_id: 'P1',
          name: 'Lateral Esq',
          comprimento: 720, largura: 580, espessura: 18,
          edges: { right: 'fita_branca', left: '', front: 'fita_branca', back: '' },
        },
      ],
      machining: {
        'P1' => [
          # 4 furos topside
          { category: 'hole', side: 'topside', position_x: 50,  position_y: 50,  diameter: 8,  depth: 12, tool_code: 'BRK_8' },
          { category: 'hole', side: 'topside', position_x: 670, position_y: 50,  diameter: 8,  depth: 12, tool_code: 'BRK_8' },
          { category: 'hole', side: 'topside', position_x: 50,  position_y: 530, diameter: 8,  depth: 12, tool_code: 'BRK_8' },
          { category: 'hole', side: 'topside', position_x: 670, position_y: 530, diameter: 8,  depth: 12, tool_code: 'BRK_8' },
          # 2 furos edge_left (sistema 32)
          { category: 'hole', side: 'edge_left', position_x: 100, position_y: 9, diameter: 5, depth: 13, tool_code: 'BRK_5' },
          { category: 'hole', side: 'edge_left', position_x: 132, position_y: 9, diameter: 5, depth: 13, tool_code: 'BRK_5' },
          # 1 pocket topside
          { category: 'pocket', side: 'topside', position_x: 200, position_y: 200, width: 100, height: 50, depth: 8, tool_code: 'MILL_6' },
        ],
      },
    }
  end

  def export_and_read
    dir = Dir.mktmpdir('dxf_test')
    res = Ornato::Export::DxfExporter.new(fixture_data).export_to_dir(dir)
    [res, File.read(res[:files].first), dir]
  end

  test 'export retorna stats e cria 1 arquivo por peca' do
    res, _content, dir = export_and_read
    assert_equal 1, res[:stats][:pieces]
    assert_equal 6, res[:stats][:drillings]
    assert res[:errors].empty?, "errors: #{res[:errors].inspect}"
    assert File.exist?(res[:files].first)
    FileUtils.remove_entry(dir)
  end

  test 'arquivo comeca com SECTION HEADER e termina com EOF' do
    _res, content, dir = export_and_read
    assert content.start_with?("0\nSECTION\n2\nHEADER"),
      "esperado iniciar com '0\\nSECTION\\n2\\nHEADER', got: #{content[0, 60].inspect}"
    assert content.rstrip.end_with?("0\nEOF"),
      "esperado terminar com '0\\nEOF', got tail: #{content[-30..-1].inspect}"
    FileUtils.remove_entry(dir)
  end

  test 'contem CIRCLE em layer DRILL_TOPSIDE' do
    _res, content, dir = export_and_read
    # tag 0/CIRCLE + tag 8/DRILL_TOPSIDE em sequência (entidade)
    matches = content.scan(/^0\nCIRCLE\n8\nDRILL_TOPSIDE\n/m)
    assert matches.length >= 4, "esperava >=4 CIRCLEs em DRILL_TOPSIDE, got #{matches.length}"
    FileUtils.remove_entry(dir)
  end

  test 'contem CIRCLE em layer DRILL_EDGE_LEFT' do
    _res, content, dir = export_and_read
    matches = content.scan(/^0\nCIRCLE\n8\nDRILL_EDGE_LEFT\n/m)
    assert matches.length >= 2, "esperava >=2 CIRCLEs em DRILL_EDGE_LEFT, got #{matches.length}"
    FileUtils.remove_entry(dir)
  end

  test 'contem LWPOLYLINE em layer OUTLINE' do
    _res, content, dir = export_and_read
    matches = content.scan(/^0\nLWPOLYLINE\n8\nOUTLINE\n/m)
    assert matches.length >= 1, "esperava LWPOLYLINE em OUTLINE"
    FileUtils.remove_entry(dir)
  end

  test 'contem LWPOLYLINE em layer POCKET_TOPSIDE' do
    _res, content, dir = export_and_read
    matches = content.scan(/^0\nLWPOLYLINE\n8\nPOCKET_TOPSIDE\n/m)
    assert matches.length >= 1, "esperava LWPOLYLINE em POCKET_TOPSIDE"
    FileUtils.remove_entry(dir)
  end

  test 'declara layer DRILL_EDGE_RIGHT mesmo sem ops nesse lado' do
    _res, content, dir = export_and_read
    # LAYER table contém uma entrada por layer reservado
    assert content.include?("0\nLAYER\n2\nDRILL_EDGE_RIGHT\n"),
      'esperava layer DRILL_EDGE_RIGHT declarado em TABLES'
    FileUtils.remove_entry(dir)
  end

  test 'embute XDATA com depth_mm e tool_code nos furos' do
    _res, content, dir = export_and_read
    assert content.include?("1001\nORNATO\n"), 'esperava marcador XDATA ORNATO'
    assert content =~ /1000\ndepth_mm=12/, 'esperava depth_mm=12 em XDATA dos furos topside'
    assert content =~ /1000\ntool_code=BRK_8/, 'esperava tool_code=BRK_8 em XDATA'
    FileUtils.remove_entry(dir)
  end

  test 'edge banding markers sao emitidos para bordas com fita' do
    _res, content, dir = export_and_read
    assert content.include?('EB:R=fita_branca'), 'esperava marker EB:R=fita_branca'
    assert content.include?('EB:F=fita_branca'), 'esperava marker EB:F=fita_branca'
    refute content.include?('EB:L='), 'nao deve emitir marker pra borda sem fita'
    FileUtils.remove_entry(dir)
  end

  test 'pecas vazias geram zero arquivos sem quebrar' do
    res = Ornato::Export::DxfExporter.new({ pieces: [], machining: {} }).export_to_dir(Dir.mktmpdir)
    assert_equal 0, res[:stats][:pieces]
    assert res[:errors].empty?
  end
end
