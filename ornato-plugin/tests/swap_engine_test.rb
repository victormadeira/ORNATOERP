# frozen_string_literal: true
# tests/swap_engine_test.rb — SwapEngine paramétrico (Sprint 3 / UX-3)
require_relative 'test_helper'
require_relative '../ornato_sketchup/library/expression_evaluator'
require_relative '../ornato_sketchup/constructor/swap_engine'

# Aponta SwapEngine para a raiz real do plugin (biblioteca/swaps/).
Ornato::Constructor::SwapEngine.plugin_root_override = PLUGIN_ROOT

class SwapEngineTest < OrnatoTest::Case
  SE = Ornato::Constructor::SwapEngine

  test 'list_swaps_for hardware dobradica retorna variantes compatíveis' do
    payload = { kind: :hardware, regra: 'dobradica',
                angulo_porta: 110, espessura_porta: 18 }
    list = SE.list_swaps_for(payload)
    assert(list.is_a?(Array), 'lista deve ser Array')
    ids = list.map { |x| x[:id] }
    assert_includes(ids, 'amor_reta')
    assert_includes(ids, 'sem_amor')
    refute(ids.include?('amor_canto_l'), 'canto_l só com angulo==165')
    refute(ids.include?('porta_espessa'), 'porta_espessa só com espessura>22')
  end

  test 'list_swaps_for hardware dobradica espessa filtra corretamente' do
    payload = { kind: :hardware, regra: 'dobradica',
                angulo_porta: 110, espessura_porta: 28 }
    list = SE.list_swaps_for(payload)
    ids = list.map { |x| x[:id] }
    assert_includes(ids, 'porta_espessa')
    refute(ids.include?('amor_reta'), 'amor_reta exige espessura<=22')
  end

  test 'list_swaps_for hardware angulo 165 expõe canto_l' do
    payload = { kind: :hardware, regra: 'dobradica',
                angulo_porta: 165, espessura_porta: 18 }
    ids = SE.list_swaps_for(payload).map { |x| x[:id] }
    assert_includes(ids, 'amor_canto_l')
  end

  test 'list_swaps_for context_match não bate → lista vazia' do
    payload = { kind: :hardware, regra: 'inexistente' }
    assert_equal([], SE.list_swaps_for(payload))
  end

  test 'compatible_when fail-closed: expressão inválida esconde variant' do
    payload = { kind: :hardware, regra: 'dobradica',
                angulo_porta: 110, espessura_porta: 18 }
    se = SE.new(payload)
    assert_equal(false,
      se.send(:evaluate_compatible_when, 'system("rm -rf /")', payload))
    assert_equal(false,
      se.send(:evaluate_compatible_when, '{xxxxx} ++ broken', payload))
  end

  test 'compatible_when "true" e nil retornam true' do
    se = SE.new({ kind: :hardware, regra: 'puxador' })
    assert_equal(true, se.send(:evaluate_compatible_when, 'true', {}))
    assert_equal(true, se.send(:evaluate_compatible_when, nil, {}))
  end

  test 'apply_swap em variante inexistente retorna ok:false' do
    payload = { kind: :hardware, regra: 'dobradica',
                angulo_porta: 110, espessura_porta: 18 }
    result = SE.apply_swap(payload, 'variante_que_nao_existe')
    assert_equal(false, result[:ok])
    assert(result[:message].to_s.include?('inexistente'),
      "mensagem deve indicar inexistência, recebi #{result[:message].inspect}")
  end

  test 'apply_swap kind sem catálogo retorna ok:false' do
    payload = { kind: :unknown }
    result = SE.apply_swap(payload, 'qualquer')
    assert_equal(false, result[:ok])
  end

  test 'apply_swap em aggregate atualiza atributos via mock entity' do
    ent = SkpMock::Entity.new(attrs: { 'aggregate_id' => 'prateleira',
                                        'tipo' => 'agregado' },
                              klass: :group, id: 4242)
    payload = { kind: :aggregate, aggregate_id: 'prateleira', _entity: ent }
    result = SE.apply_swap(payload, 'gaveteiro_simples')
    assert_equal(true, result[:ok])
    assert_equal('gaveteiro_simples', ent.get_attribute('Ornato', 'aggregate_id'))
    assert_equal('gaveteiro_simples', ent.get_attribute('Ornato', 'variant_id'))
  end

  test 'apply_swap em piece (drawer_front) aplica material_override' do
    ent = SkpMock::Entity.new(attrs: { 'role' => 'drawer_front',
                                        'material' => 'MDF18_BrancoTX',
                                        'tipo' => 'peca' },
                              klass: :group, id: 7777)
    payload = { kind: :piece, role: 'drawer_front', _entity: ent }
    result  = SE.apply_swap(payload, 'fresado')
    assert_equal(true, result[:ok])
    assert_equal('MDF18_Lacado', ent.get_attribute('Ornato', 'material'))
    assert_equal('fresado',       ent.get_attribute('Ornato', 'variant_id'))
  end

  test 'apply_swap em hardware seta componente_3d e params' do
    ent = SkpMock::Entity.new(attrs: { 'regra' => 'dobradica',
                                        'componente_3d' => 'ferragens/old.skp',
                                        'tipo' => 'ferragem' },
                              klass: :component, id: 9091)
    payload = { kind: :hardware, regra: 'dobradica',
                angulo_porta: 165, espessura_porta: 18, _entity: ent }
    result  = SE.apply_swap(payload, 'amor_canto_l')
    assert_equal(true, result[:ok])
    assert_equal('ferragens/dobradica_amor_165.skp',
                 ent.get_attribute('Ornato', 'componente_3d'))
    assert_equal('amor_canto_l', ent.get_attribute('Ornato', 'variant_id'))
    assert_equal(165, ent.get_attribute('Ornato', 'angulo'))
  end

  test 'apply_swap variante incompatível com contexto → ok:false' do
    payload = { kind: :hardware, regra: 'dobradica',
                angulo_porta: 110, espessura_porta: 18 }
    # amor_canto_l exige angulo==165 — não compatível neste payload.
    result = SE.apply_swap(payload, 'amor_canto_l')
    assert_equal(false, result[:ok])
    assert(result[:message].to_s.include?('incompat'),
           "esperava mensagem de incompatibilidade, recebi #{result[:message].inspect}")
  end

  test 'list_swaps_for piece drawer_front lista 2 estilos' do
    payload = { kind: :piece, role: 'drawer_front' }
    ids = SE.list_swaps_for(payload).map { |x| x[:id] }
    assert_includes(ids, 'liso')
    assert_includes(ids, 'fresado')
  end

  test 'list_swaps_for aggregate prateleira lista 2 destinos' do
    payload = { kind: :aggregate, aggregate_id: 'prateleira' }
    ids = SE.list_swaps_for(payload).map { |x| x[:id] }
    assert_includes(ids, 'gaveteiro_simples')
    assert_includes(ids, 'divisoria')
  end

  test 'list_swaps_for module → [] (catálogo vazio mas existe)' do
    payload = { kind: :module, module_id: 'qualquer' }
    assert_equal([], SE.list_swaps_for(payload))
  end
end
