# frozen_string_literal: true
# tests/component_editor_test.rb — testes do ComponentEditor (UX-4)
# Roda sem SketchUp real — usa mocks de Model/Entity inline.
require_relative 'test_helper'

require_relative '../ornato_sketchup/core/logger'
require_relative '../ornato_sketchup/constructor/component_editor'

# ── Mock Entity ────────────────────────────────────────────────
module ComponentEditorMocks
  class Ent
    attr_accessor :entityID, :name, :hidden, :children
    attr_reader :transforms

    def initialize(attrs: {}, id: rand(1_000_000), name: 'Ent')
      @attrs    = { 'Ornato' => {} }
      attrs.each { |k, v| @attrs['Ornato'][k.to_s] = v }
      @entityID = id
      @name     = name
      @hidden   = false
      @children = []
      @transforms = []
    end

    def get_attribute(dict, key, default = nil)
      bag = @attrs[dict.to_s] || {}
      val = bag[key.to_s]
      val.nil? ? default : val
    end

    def set_attribute(dict, key, value)
      (@attrs[dict.to_s] ||= {})[key.to_s] = value
    end

    def hidden=(v); @hidden = v ? true : false; end

    def entities; @children; end
    def add_child(c); @children << c; c; end

    def copy
      dup_ent = Ent.new(id: @entityID + 100_000, name: "#{@name} (copy)")
      (@attrs['Ornato'] || {}).each { |k, v| dup_ent.set_attribute('Ornato', k, v) }
      dup_ent
    end

    def transform!(tx)
      @transforms << tx
      self
    end

    # Bounds duck — center retorna [0,0,0] inert.
    def bounds; BoundsStub.new; end
  end

  class BoundsStub
    def center; [0, 0, 0]; end
  end

  class FakeModel
    attr_reader :ops
    def initialize(entities)
      @entities = entities
      @ops = []
    end
    def active_entities; @entities; end
    def entities; @entities; end
    def start_operation(name, _undo = false); @ops << [:start, name]; end
    def commit_operation; @ops << [:commit]; end
    def abort_operation; @ops << [:abort]; end
  end
end

# ── Stub Sketchup.active_model (idempotente: outros tests podem ter definido) ──
module Sketchup; end unless defined?(Sketchup)
module Sketchup
  class << self
    unless method_defined?(:active_model) || respond_to?(:active_model)
      attr_accessor :active_model
    end
    unless method_defined?(:active_model=) || respond_to?(:active_model=)
      define_method(:active_model=) { |m| @active_model = m }
      define_method(:active_model)  { @active_model }
    end
  end
end

# Stub Geom — idempotente (outros tests definem Vector3d/Point3d sem Transformation).
module Geom; end unless defined?(Geom)
module Geom
  unless const_defined?(:Vector3d, false)
    class Vector3d
      def initialize(*); end
    end
  end
  unless const_defined?(:Transformation, false)
    class Transformation
      def self.rotation(*); new; end
      def self.translation(*); new; end
    end
  end
end

class Numeric
  def mm; self * 1.0; end
  def to_mm; self * 1.0; end
end unless 1.respond_to?(:mm)

CE = ::Ornato::Constructor::ComponentEditor
M  = ComponentEditorMocks

module OrnatoTest
  class ComponentEditorTest < Case
    def setup_model(entities)
      Sketchup.active_model = M::FakeModel.new(entities)
    end

    test 'turn_grain alterna horizontal -> vertical' do
      ent = M::Ent.new(attrs: { 'grain_direction' => 'horizontal' }, id: 1)
      setup_model([ent])
      r = CE.turn_grain(1)
      assert_equal true, r[:ok]
      assert_equal 'vertical', r[:new_direction]
      assert_equal 'vertical', ent.get_attribute('Ornato', 'grain_direction')
    end

    test 'turn_grain alterna vertical -> horizontal' do
      ent = M::Ent.new(attrs: { 'grain_direction' => 'vertical' }, id: 2)
      setup_model([ent])
      r = CE.turn_grain(2)
      assert_equal 'horizontal', r[:new_direction]
    end

    test 'turn_grain default eh horizontal quando ausente' do
      ent = M::Ent.new(id: 3)
      setup_model([ent])
      r = CE.turn_grain(3)
      assert_equal 'vertical', r[:new_direction]
    end

    test 'rotate_piece rejeita degrees invalido' do
      ent = M::Ent.new(id: 4)
      setup_model([ent])
      r = CE.rotate_piece(4, 45)
      assert_equal false, r[:ok]
      assert_includes r[:error].to_s, 'rotacao invalida'
    end

    test 'rotate_piece com 90 grava attr' do
      ent = M::Ent.new(id: 5)
      setup_model([ent])
      r = CE.rotate_piece(5, 90)
      assert_equal true, r[:ok]
      assert_equal 90, r[:degrees]
      assert_equal 90, ent.get_attribute('Ornato', 'last_rotation_deg')
    end

    test 'transfer_props copia campos selecionados' do
      src = M::Ent.new(attrs: { 'material' => 'MDF18_Cinza', 'espessura' => 18.0 }, id: 10)
      tgt = M::Ent.new(id: 11)
      setup_model([src, tgt])
      r = CE.transfer_props(10, 11, %w[material espessura])
      assert_equal true, r[:ok]
      assert_equal 'MDF18_Cinza', tgt.get_attribute('Ornato', 'material')
      assert_equal 18.0, tgt.get_attribute('Ornato', 'espessura')
      assert_equal 'MDF18_Cinza', r[:copied]['material']
    end

    test 'transfer_props ignora chaves ausentes na fonte' do
      src = M::Ent.new(attrs: { 'material' => 'MDF15_Branco' }, id: 12)
      tgt = M::Ent.new(id: 13)
      setup_model([src, tgt])
      r = CE.transfer_props(12, 13, %w[material fita_padrao])
      assert_equal 1, r[:copied].size
    end

    test 'hide_temporary marca attr + entity.hidden = true' do
      ent = M::Ent.new(id: 20)
      setup_model([ent])
      r = CE.hide_temporary(20)
      assert_equal true, r[:ok]
      assert_equal true, ent.get_attribute('Ornato', 'hidden_user')
      assert_equal true, ent.hidden
    end

    test 'unhide reverte hidden_user + hidden' do
      ent = M::Ent.new(attrs: { 'hidden_user' => true }, id: 21)
      ent.hidden = true
      setup_model([ent])
      r = CE.unhide(21)
      assert_equal true, r[:ok]
      assert_equal false, ent.get_attribute('Ornato', 'hidden_user')
      assert_equal false, ent.hidden
    end

    test 'unhide_all conta restored' do
      a = M::Ent.new(attrs: { 'hidden_user' => true }, id: 30)
      b = M::Ent.new(attrs: { 'hidden_user' => true }, id: 31)
      c = M::Ent.new(id: 32)
      a.hidden = true; b.hidden = true
      setup_model([a, b, c])
      r = CE.unhide_all
      assert_equal true, r[:ok]
      assert_equal 2, r[:restored]
      assert_equal false, a.hidden
      assert_equal false, b.hidden
    end

    test 'change_material grava attr' do
      ent = M::Ent.new(id: 40)
      setup_model([ent])
      r = CE.change_material(40, 'MDF18_Cinza')
      assert_equal true, r[:ok]
      assert_equal 'MDF18_Cinza', ent.get_attribute('Ornato', 'material')
    end

    test 'change_material rejeita vazio' do
      ent = M::Ent.new(id: 41)
      setup_model([ent])
      r = CE.change_material(41, '')
      assert_equal false, r[:ok]
    end

    test 'change_thickness rejeita zero / negativo' do
      ent = M::Ent.new(id: 50)
      setup_model([ent])
      r = CE.change_thickness(50, 0)
      assert_equal false, r[:ok]
    end

    test 'change_thickness grava valor positivo' do
      ent = M::Ent.new(id: 51)
      setup_model([ent])
      r = CE.change_thickness(51, 25)
      assert_equal true, r[:ok]
      assert_equal 25.0, ent.get_attribute('Ornato', 'espessura')
      assert_equal true, ent.get_attribute('Ornato', 'thickness_dirty')
    end

    test 'change_edges aceita hash com 4 chaves' do
      ent = M::Ent.new(id: 60)
      setup_model([ent])
      r = CE.change_edges(60, { frente: true, tras: false, topo: true, base: false })
      assert_equal true, r[:ok]
      assert_equal true,  ent.get_attribute('Ornato', 'borda_frente')
      assert_equal false, ent.get_attribute('Ornato', 'borda_tras')
      assert_equal true,  ent.get_attribute('Ornato', 'borda_topo')
      assert_equal false, ent.get_attribute('Ornato', 'borda_base')
    end

    test 'change_edges aceita JSON string' do
      ent = M::Ent.new(id: 61)
      setup_model([ent])
      r = CE.change_edges(61, '{"frente":true,"tras":true,"topo":false,"base":false}')
      assert_equal true, r[:ok]
      assert_equal true, ent.get_attribute('Ornato', 'borda_tras')
    end

    test 'find retorna nil para entityID inexistente' do
      ent = M::Ent.new(id: 70)
      setup_model([ent])
      r = CE.turn_grain(99999)
      assert_equal false, r[:ok]
      assert_includes r[:error].to_s, 'nao encontrada'
    end

    test 'atomic chama abort_operation quando bloco lanca' do
      ent = M::Ent.new(id: 80)
      setup_model([ent])
      # Forca erro: set_attribute lanca via redef temporaria
      orig = ent.method(:set_attribute)
      ent.define_singleton_method(:set_attribute) { |*_| raise 'boom' }
      r = CE.turn_grain(80)
      ent.define_singleton_method(:set_attribute, orig)
      assert_equal false, r[:ok]
      assert_includes Sketchup.active_model.ops, [:abort]
    end

    test 'atomic chama commit_operation no sucesso' do
      ent = M::Ent.new(id: 81)
      setup_model([ent])
      CE.turn_grain(81)
      assert_includes Sketchup.active_model.ops, [:commit]
    end

    test 'duplicate cria nova entidade com novo entityID' do
      ent = M::Ent.new(attrs: { 'material' => 'MDF18_Branco' }, id: 90)
      setup_model([ent])
      r = CE.duplicate(90, 100)
      assert_equal true, r[:ok]
      assert_equal 100.0, r[:offset_mm]
      refute r[:new_entity_id].nil?, 'esperava new_entity_id nao-nil'
    end
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
