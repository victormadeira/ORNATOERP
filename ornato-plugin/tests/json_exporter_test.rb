# frozen_string_literal: true
# Smoke test: Ornato::Export::JsonExporter
# Valida shape do JSON exportado: details_project, model_entities, machining.
require_relative 'test_helper'

# Sketchup stub mínimo (active_model retorna nil → exporter usa defaults)
unless defined?(Sketchup)
  module Sketchup
    def self.active_model; nil; end
  end
end

require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'export', 'json_exporter.rb')

OrnatoTest.autorun_if_main!(__FILE__)

class JsonExporterTest < OrnatoTest::Case
  def fixture_analysis
    {
      modules: [],
      pieces: [
        {
          persistent_id: 'P1',
          name: 'Lateral Esq',
          comprimento: 720, largura: 580, espessura: 18,
          quantity: 1,
          material_name: 'MDF Branco', material_code: 'MDF_BRANCO_18',
          edges: { right: 'fita_branca', left: '', front: 'fita_branca', back: '' },
          grain: 'sem_veio',
        },
        {
          persistent_id: 'P2',
          name: 'Base',
          comprimento: 568, largura: 580, espessura: 18,
          quantity: 1,
          material_name: 'MDF Branco', material_code: 'MDF_BRANCO_18',
          edges: {},
          grain: 'sem_veio',
        },
      ],
    }
  end

  test 'generate retorna shape com 3 chaves principais' do
    exporter = Ornato::Export::JsonExporter.new(fixture_analysis, {}, {})
    out = exporter.generate
    assert out.key?('details_project'), 'tem details_project'
    assert out.key?('model_entities'),  'tem model_entities'
    assert out.key?('machining'),       'tem machining'
  end

  test 'model_entities mapeia pecas em entities sob modulo virtual' do
    exporter = Ornato::Export::JsonExporter.new(fixture_analysis, {}, {})
    out = exporter.generate
    me = out['model_entities']
    assert me.is_a?(Hash)
    mod = me['0']
    assert mod, 'modulo 0 existe'
    pieces = mod['entities']
    assert_equal 2, pieces.size
    p1 = pieces['0']
    assert_equal true, p1['upmpiece']
    assert_equal 'P1', p1['upmpersistentid']
    assert_equal 720, p1['upmheight']
    assert_equal 580, p1['upmdepth']
    assert_equal 18,  p1['upmwidth']
    assert p1['entities']['0']['upmfeedstockpanel']
  end

  test 'to_json produz JSON parseable' do
    exporter = Ornato::Export::JsonExporter.new(fixture_analysis, {}, {})
    str = exporter.to_json
    parsed = JSON.parse(str)
    assert parsed.key?('details_project')
    assert parsed['model_entities']['0']['entities'].is_a?(Hash)
  end

  test 'machining vazio gera hash vazio sem quebrar' do
    exporter = Ornato::Export::JsonExporter.new(fixture_analysis, {}, {})
    out = exporter.generate
    assert out['machining'].is_a?(Hash)
  end

  test 'edge_code usa edges hash da peca' do
    exporter = Ornato::Export::JsonExporter.new(fixture_analysis, {}, {})
    out = exporter.generate
    p1 = out['model_entities']['0']['entities']['0']
    assert_equal 'fita_branca', p1['upmedgeside1']  # right
    assert_equal '',            p1['upmedgeside2']  # left
  end
end
