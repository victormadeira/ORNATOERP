# frozen_string_literal: true
# tests/mira_tool_test.rb — testes do MiraTool (Sprint UX-2)
# Roda sem SketchUp (mocks inline).
require_relative 'test_helper'

unless defined?(Ornato::Core::RoleNormalizer)
  require_relative '../ornato_sketchup/core/role_normalizer'
end

require_relative '../ornato_sketchup/tools/selection_resolver'
require_relative '../ornato_sketchup/tools/mira_tool'

module MiraToolMocks
  class Ent
    attr_accessor :name, :entityID, :parent, :children, :hidden
    def initialize(attrs: {}, name: 'Ent', id: rand(1_000_000), parent: nil)
      @attrs    = { 'Ornato' => attrs, 'ornato' => {} }
      @name     = name
      @entityID = id
      @parent   = parent
      @children = []
      @hidden   = false
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

    def hidden=(v); @hidden = v; end
    def entities; @children; end
    def add_child(c); c.parent = self; @children << c; c; end
  end

  # Controller mock — captura execute_script para asserts.
  class Controller
    attr_reader :scripts
    def initialize; @scripts = []; end
    def send_to_panel(js); @scripts << js; end
  end
end

class MiraToolTest < OrnatoTest::Case
  MT = Ornato::Tools::MiraTool
  E  = MiraToolMocks::Ent

  def make_module
    E.new(attrs: { 'tipo' => 'modulo', 'module_id' => 'm1', 'module_type' => 'balcao' }, name: 'Modulo X')
  end

  def make_piece(parent: nil)
    E.new(attrs: { 'tipo' => 'peca', 'role' => 'lateral' }, name: 'Peca X', parent: parent)
  end

  def make_aggregate(parent: nil)
    E.new(attrs: { 'tipo' => 'agregado', 'aggregate_id' => 'prateleira' }, parent: parent)
  end

  def make_hardware(parent: nil)
    E.new(attrs: { 'tipo' => 'ferragem', 'regra' => 'hinge' }, parent: parent)
  end

  # Helper que simula o estado pós-hover injetando @hovered/@valid via
  # invocação direta do walk_up + cálculo de validade. Não chamamos
  # onMouseMove (depende de pick_helper). Tests focam na lógica MODES.
  def hover!(tool, ent)
    payload = Ornato::Tools::SelectionResolver.resolve(ent)
    targets = MT::MODES[tool.cor][:target_kinds]
    tool.instance_variable_set(:@hovered, ent)
    tool.instance_variable_set(:@hovered_kind, payload[:kind])
    tool.instance_variable_set(:@valid, targets.include?(payload[:kind]))
  end

  test '1) constructor com cor invalida → ArgumentError' do
    assert_raises(ArgumentError) { MT.new(:azul) }
  end

  test '2) constructor com cor valida → ok + cor exposto' do
    [:amarela, :verde, :vermelha].each do |c|
      t = MT.new(c)
      assert_equal c, t.cor
      refute t.valid?
    end
  end

  test '3) amarela hover em peca → @valid = false' do
    tool = MT.new(:amarela)
    hover!(tool, make_piece)
    refute tool.valid?, 'amarela nao deve aceitar peca'
  end

  test '4) verde hover em peca → @valid = true' do
    tool = MT.new(:verde)
    hover!(tool, make_piece)
    assert tool.valid?, 'verde deve aceitar peca'
  end

  test '5) amarela hover em modulo → @valid = true' do
    tool = MT.new(:amarela)
    hover!(tool, make_module)
    assert tool.valid?, 'amarela deve aceitar modulo'
  end

  test '6) amarela hover em agregado → @valid = true' do
    tool = MT.new(:amarela)
    hover!(tool, make_aggregate)
    assert tool.valid?, 'amarela deve aceitar agregado'
  end

  test '7) verde hover em ferragem → @valid = true' do
    tool = MT.new(:verde)
    hover!(tool, make_hardware)
    assert tool.valid?, 'verde deve aceitar ferragem'
  end

  test '8) verde hover em modulo → @valid = false' do
    tool = MT.new(:verde)
    hover!(tool, make_module)
    refute tool.valid?, 'verde nao deve aceitar modulo'
  end

  test '9) vermelha hover em qualquer kind → @valid = true' do
    tool = MT.new(:vermelha)
    [make_module, make_aggregate, make_piece, make_hardware].each do |ent|
      hover!(tool, ent)
      assert tool.valid?, "vermelha deve aceitar #{ent.get_attribute('Ornato', 'tipo')}"
    end
  end

  test '10) walk_up_to_targetable acha modulo subindo de peca (amarela)' do
    mod = make_module
    pec = make_piece(parent: mod)
    tool = MT.new(:amarela)
    # path do PickHelper vai de raiz pra folha: [model, mod, pec]
    found = tool.walk_up_to_targetable([mod, pec])
    assert_equal mod, found, 'amarela deve subir da peca ate o modulo'
  end

  test '11) walk_up_to_targetable em verde sobe ate peca (nao modulo)' do
    mod = make_module
    pec = make_piece(parent: mod)
    tool = MT.new(:verde)
    found = tool.walk_up_to_targetable([mod, pec])
    assert_equal pec, found, 'verde deve parar na peca, nao subir ao modulo'
  end

  test '12) emit_selection_to_ui dispara execute_script no controller injetado' do
    ctrl = MiraToolMocks::Controller.new
    tool = MT.new(:amarela, controller: ctrl)
    hover!(tool, make_module)
    tool.send(:emit_selection_to_ui)
    assert_equal 1, ctrl.scripts.length
    assert ctrl.scripts.first.include?('onSelectionResolved'),
           "esperava chamada onSelectionResolved, ficou: #{ctrl.scripts.first[0,80]}"
  end

  test '13) onLButtonDown em mira valida resolve_and_emit chama UI' do
    ctrl = MiraToolMocks::Controller.new
    tool = MT.new(:verde, controller: ctrl)
    hover!(tool, make_piece)
    tool.onLButtonDown(0, 0, 0, nil)
    assert_equal 1, ctrl.scripts.length
  end

  test '14) onLButtonDown em hover invalido nao emite' do
    ctrl = MiraToolMocks::Controller.new
    tool = MT.new(:amarela, controller: ctrl)
    hover!(tool, make_piece) # amarela + peca = invalido
    tool.onLButtonDown(0, 0, 0, nil)
    assert_equal 0, ctrl.scripts.length
  end

  test '15) prompt_remove sem confirmacao NAO oculta (mock retorna false)' do
    tool = MT.new(:vermelha)
    ent  = make_module
    hover!(tool, ent)
    # Stub do confirm_dialog para retornar false (usuario cancela)
    def tool.confirm_dialog(_msg); false; end
    result = tool.send(:prompt_remove_confirmation)
    refute result
    refute ent.hidden
    assert_equal nil, ent.get_attribute('Ornato', 'hidden')
  end

  test '16) prompt_remove com confirmacao oculta entidade + grava attr' do
    tool = MT.new(:vermelha)
    ent  = make_module
    hover!(tool, ent)
    def tool.confirm_dialog(_msg); true; end
    # Sem Sketchup real: prompt_remove guarda contra Sketchup.active_model
    # via respond_to?, então o set_attribute + hidden= rodam ok.
    result = tool.send(:prompt_remove_confirmation)
    assert result
    assert ent.hidden, 'entity.hidden deveria ser true'
    assert_equal true, ent.get_attribute('Ornato', 'hidden')
  end

  test '17) MODES estatico: amarela target_kinds = [:module, :aggregate]' do
    assert_equal [:module, :aggregate], MT::MODES[:amarela][:target_kinds]
    assert_equal :resolve_and_emit,     MT::MODES[:amarela][:action]
  end

  test '18) MODES vermelha action = :prompt_remove' do
    assert_equal :prompt_remove, MT::MODES[:vermelha][:action]
    assert_includes MT::MODES[:vermelha][:target_kinds], :piece
    assert_includes MT::MODES[:vermelha][:target_kinds], :hardware
  end
end

# AimPlacementTool retrocompat — garante que refator não quebrou API.
require_relative '../ornato_sketchup/tools/aim_placement_tool'

class AimPlacementToolBackCompatTest < OrnatoTest::Case
  APT = Ornato::Tools::AimPlacementTool

  test '1) initialize aceita aggregate_id posicional (retrocompat)' do
    t = APT.new('prateleira')
    assert_equal 'prateleira',       t.aggregate_id
    assert_equal :insert_aggregate,  t.mode
  end

  test '2) initialize aceita mode: custom' do
    t = APT.new('divisoria', mode: :insert_aggregate)
    assert_equal :insert_aggregate, t.mode
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
