# frozen_string_literal: true
# tests/selection_resolver_test.rb — testes do SelectionResolver
# Roda sem SketchUp (mocks definidos inline).
require_relative 'test_helper'

# Stub do RoleNormalizer caso ainda não tenha sido carregado.
unless defined?(Ornato::Core::RoleNormalizer)
  require_relative '../ornato_sketchup/core/role_normalizer'
end

require_relative '../ornato_sketchup/tools/selection_resolver'

# ── Mocks dedicados (mais simples que SkpMock::Entity para resolver) ────
module SelResolverMocks
  # Entidade com Ornato attrs + parent + entities arbitrários.
  class Ent
    attr_accessor :name, :entityID, :parent, :children
    def initialize(attrs: {}, name: 'Ent', id: rand(1_000_000), parent: nil)
      @attrs    = { 'Ornato' => attrs, 'ornato' => {} }
      @name     = name
      @entityID = id
      @parent   = parent
      @children = []
    end

    def get_attribute(dict, key, default = nil)
      bag = @attrs[dict.to_s] || {}
      val = bag[key.to_s]
      val = bag[key.to_sym] if val.nil?
      val.nil? ? default : val
    end

    def set_attribute(dict, key, value)
      (@attrs[dict.to_s] ||= {})[key.to_s] = value
    end

    def entities; @children; end
    def add_child(c); c.parent = self; @children << c; c; end

    # responde a :bounds só se @bounds setado
    def bounds; @bounds; end
    def bounds=(b); @bounds = b; end
  end

  # Bounds duck — width/height/depth em "inches" (.to_mm multiplica por 25.4)
  class Bounds
    attr_reader :width, :height, :depth
    def initialize(w_mm, h_mm, d_mm)
      @width  = Len.new(w_mm)
      @height = Len.new(h_mm)
      @depth  = Len.new(d_mm)
    end
    def empty?; false; end
  end
  class Len
    def initialize(mm); @mm = mm; end
    def to_mm; @mm; end
  end
end

class SelectionResolverTest < OrnatoTest::Case
  SR = Ornato::Tools::SelectionResolver
  E  = SelResolverMocks::Ent

  test '1) entity nil → kind :empty' do
    p = SR.resolve(nil)
    assert_equal :empty, p[:kind]
    assert_equal [],     p[:allowed_actions]
    assert_equal [],     p[:compatible_aggregates]
    assert_equal [],     p[:compatible_swaps]
  end

  test '2) entity sem get_attribute → kind :invalid' do
    obj = Object.new
    p = SR.resolve(obj)
    assert_equal :invalid, p[:kind]
  end

  test '3) entity sem atributos Ornato → kind :unknown' do
    ent = E.new(attrs: {})
    p = SR.resolve(ent)
    assert_equal :unknown, p[:kind]
    assert_equal [], p[:allowed_actions]
  end

  test '4) module entity → kind :module + allowed_actions corretos' do
    mod = E.new(
      attrs: {
        'tipo'        => 'modulo',
        'module_id'   => 'balcao_2_portas',
        'module_type' => 'balcao_2_portas',
        'params'      => JSON.generate(largura: 800, altura: 720, profundidade: 560),
      },
      name: 'Balcao Cozinha'
    )
    p = SR.resolve(mod)
    assert_equal :module, p[:kind]
    assert_equal 'balcao_2_portas', p[:module_id]
    assert_equal 'Balcao Cozinha',  p[:name]
    assert p[:params].is_a?(Hash)
    assert_equal 800, p[:params]['largura']
    assert_includes p[:allowed_actions], 'add_aggregate'
    assert_includes p[:allowed_actions], 'swap_module'
    # Catálogo de agregados existe na biblioteca → deve trazer ao menos 1
    assert p[:compatible_aggregates].is_a?(Array)
  end

  test '5) module sem tipo mas com module_type → ainda detecta como :module (fallback)' do
    mod = E.new(attrs: { 'module_type' => 'gaveteiro' })
    p = SR.resolve(mod)
    assert_equal :module, p[:kind]
  end

  test '6) module stats conta peca/ferragem/agregado children' do
    mod = E.new(attrs: { 'tipo' => 'modulo', 'module_id' => 'm1' })
    mod.add_child(E.new(attrs: { 'tipo' => 'peca',     'role' => 'lateral' }))
    mod.add_child(E.new(attrs: { 'tipo' => 'peca',     'role' => 'base'    }))
    mod.add_child(E.new(attrs: { 'tipo' => 'ferragem', 'regra' => 'hinge'  }))
    mod.add_child(E.new(attrs: { 'tipo' => 'agregado', 'aggregate_id' => 'prateleira' }))
    p = SR.resolve(mod)
    assert_equal 2, p[:stats][:piece_count]
    assert_equal 1, p[:stats][:hardware_count]
    assert_equal 1, p[:stats][:aggregate_count]
  end

  test '7) piece entity → walk_up acha parent module_id' do
    mod = E.new(attrs: { 'tipo' => 'modulo', 'module_id' => 'arm_v1' })
    pec = E.new(
      attrs: { 'tipo' => 'peca', 'role' => 'lateral_esq', 'material' => 'MDF18_BrancoTX', 'espessura' => 18.0 },
      parent: mod
    )
    p = SR.resolve(pec)
    assert_equal :piece,   p[:kind]
    assert_equal 'lateral',p[:role]          # RoleNormalizer normaliza
    assert_equal 'arm_v1', p[:parent_module_id]
    assert_equal 'MDF18_BrancoTX', p[:material]
    assert_includes p[:allowed_actions], 'change_material'
  end

  test '8) piece sem parent module → parent_module_id nil (órfã)' do
    pec = E.new(attrs: { 'tipo' => 'peca', 'role' => 'shelf' })
    p = SR.resolve(pec)
    assert_equal :piece, p[:kind]
    assert_equal nil,    p[:parent_module_id]
  end

  test '9) hardware entity → kind :hardware + compatible_swaps vazio (catálogo não existe)' do
    mod = E.new(attrs: { 'tipo' => 'modulo', 'module_id' => 'mx' })
    fer = E.new(
      attrs: {
        'tipo'          => 'ferragem',
        'regra'         => 'hinge',
        'componente_3d' => 'dobradica_blum_35',
        'anchor_role'   => 'lateral',
      },
      parent: mod
    )
    p = SR.resolve(fer)
    assert_equal :hardware, p[:kind]
    assert_equal 'hinge',   p[:regra]
    assert_equal 'mx',      p[:parent_module_id]
    assert_equal [],        p[:compatible_swaps]  # biblioteca/swaps/hardware.json não existe
    assert_includes p[:allowed_actions], 'swap_variant'
  end

  test '10) aggregate entity → parent_module_id + bay_id corretos' do
    mod = E.new(attrs: { 'tipo' => 'modulo', 'module_id' => 'cozinha_01' })
    agg = E.new(
      attrs: {
        'tipo'         => 'agregado',
        'aggregate_id' => 'prateleira',
        'bay_id'       => 'bay_001',
        'params'       => JSON.generate(espessura: 18, recuo_frente: 5),
      },
      parent: mod
    )
    p = SR.resolve(agg)
    assert_equal :aggregate, p[:kind]
    assert_equal 'prateleira', p[:aggregate_id]
    assert_equal 'bay_001',    p[:bay_id]
    assert_equal 'cozinha_01', p[:parent_module_id]
    assert_includes p[:allowed_actions], 'move_to_bay'
  end

  test '11) walk_up retorna nil pra entity órfã (sem parent algum)' do
    fer = E.new(attrs: { 'tipo' => 'ferragem', 'regra' => 'hinge' })
    p = SR.resolve(fer)
    assert_equal :hardware, p[:kind]
    assert_equal nil,       p[:parent_module_id]
  end

  test '12) piece com bbox → dimensions são preenchidos em mm' do
    pec = E.new(
      attrs: { 'tipo' => 'peca', 'role' => 'lateral', 'espessura' => 18.0 },
    )
    pec.bounds = SelResolverMocks::Bounds.new(720.0, 560.0, 18.0)
    p = SR.resolve(pec)
    dims = p[:dimensions]
    assert_equal 720.0, dims[:largura]
    assert_equal 560.0, dims[:altura]
    assert_equal 18.0,  dims[:espessura]
  end

  test '13) walk_up_for_aggregate quando peça é filha de agregado dentro de módulo' do
    mod = E.new(attrs: { 'tipo' => 'modulo', 'module_id' => 'mod_x' })
    agg = E.new(attrs: { 'tipo' => 'agregado', 'aggregate_id' => 'gaveteiro' }, parent: mod)
    pec = E.new(attrs: { 'tipo' => 'peca', 'role' => 'drawer_front' }, parent: agg)
    p = SR.resolve(pec)
    assert_equal 'mod_x',     p[:parent_module_id]
    assert_equal 'gaveteiro', p[:parent_aggregate_id]
  end

  test '14) module payload contém compatible_aggregates da biblioteca real' do
    mod = E.new(attrs: { 'tipo' => 'modulo', 'module_id' => 'balcao' })
    p   = SR.resolve(mod)
    ids = p[:compatible_aggregates].map { |a| a[:id] }
    assert_includes ids, 'prateleira'
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
