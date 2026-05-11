# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# Ornato::Constructor::ComponentEditor
#
# Acoes editaveis atomicas para entidades Ornato (peca / modulo /
# agregado / ferragem). Inspirado em UpMobb (turn_grain,
# get_turn_piece, transferPress, hidden_element, copy_component).
#
# Cada acao publica:
#   - Abre um start_operation (undo-friendly).
#   - Modifica atributos Ornato.<key> reais (NAO apenas visual).
#   - commit_operation no sucesso, abort_operation em erro.
#   - Retorna Hash { ok:, ...meta } / { ok: false, error: }.
#
# Disparo pela UI v2 (JS):
#   sketchup.edit_turn_grain(entityId)
#   sketchup.edit_rotate_piece(entityId, 90)
#   sketchup.edit_transfer_props(sourceId, targetId)
#   sketchup.edit_change_material(entityId, 'MDF18_BrancoTX')
#   sketchup.edit_change_edges(entityId, JSON.stringify({ frente: true, ... }))
#   ...
#
# Os callbacks em dialog_controller.rb mandam o resultado de volta
# via `window.onComponentEdit(result)`.
# ═══════════════════════════════════════════════════════════════

require 'json'

module Ornato
  module Constructor
    class ComponentEditor
      DICT = 'Ornato'

      VALID_ROTATIONS = [90, 180, 270, -90, -180, -270].freeze
      DEFAULT_TRANSFER_PROPS = %w[material espessura fita_padrao
                                  borda_frente borda_tras borda_topo borda_base
                                  fita_frente fita_tras fita_topo fita_base].freeze

      # ─── 1. Girar veio (alterna horizontal <-> vertical) ─────
      def self.turn_grain(entity_id)
        atomic('Girar veio') do
          ent = find(entity_id)
          next error('entidade nao encontrada') unless ent
          current = ent.get_attribute(DICT, 'grain_direction') || 'horizontal'
          new_dir = current.to_s == 'horizontal' ? 'vertical' : 'horizontal'
          ent.set_attribute(DICT, 'grain_direction', new_dir)
          { ok: true, entity_id: entity_id, new_direction: new_dir }
        end
      end

      # ─── 2. Rotacionar peca em Z (90 / 180 / 270) ─────────────
      def self.rotate_piece(entity_id, degrees)
        deg = degrees.to_i
        unless VALID_ROTATIONS.include?(deg)
          return error("rotacao invalida: #{degrees} (use 90/180/270)")
        end
        atomic("Rotacionar #{deg}") do
          ent = find(entity_id)
          next error('entidade nao encontrada') unless ent
          if defined?(::Geom) && ent.respond_to?(:transform!) && ent.respond_to?(:bounds)
            axis   = ::Geom::Vector3d.new(0, 0, 1)
            origin = ent.bounds.center
            radians = deg.to_f * Math::PI / 180.0
            tx = ::Geom::Transformation.rotation(origin, axis, radians)
            ent.transform!(tx)
          end
          ent.set_attribute(DICT, 'last_rotation_deg', deg)
          { ok: true, entity_id: entity_id, degrees: deg }
        end
      end

      # ─── 3. Transferir propriedades (copy_component) ──────────
      def self.transfer_props(source_id, target_id, props = nil)
        keys = (props || DEFAULT_TRANSFER_PROPS).map(&:to_s)
        atomic('Transferir propriedades') do
          src = find(source_id)
          tgt = find(target_id)
          if !src
            next error('source nao encontrada')
          elsif !tgt
            next error('target nao encontrada')
          end
          copied = {}
          keys.each do |key|
            val = src.get_attribute(DICT, key)
            next if val.nil?
            tgt.set_attribute(DICT, key, val)
            copied[key] = val
          end
          repaint_safe(tgt)
          { ok: true, source_id: source_id, target_id: target_id, copied: copied }
        end
      end

      # ─── 4. Ocultar (soft-hide, nao apaga) ────────────────────
      def self.hide_temporary(entity_id)
        atomic('Ocultar') do
          ent = find(entity_id)
          next error('entidade nao encontrada') unless ent
          ent.set_attribute(DICT, 'hidden_user', true)
          ent.hidden = true if ent.respond_to?(:hidden=)
          { ok: true, entity_id: entity_id }
        end
      end

      def self.unhide(entity_id)
        atomic('Mostrar') do
          ent = find(entity_id)
          next error('entidade nao encontrada') unless ent
          ent.set_attribute(DICT, 'hidden_user', false)
          ent.hidden = false if ent.respond_to?(:hidden=)
          { ok: true, entity_id: entity_id }
        end
      end

      def self.unhide_all
        atomic('Mostrar tudo') do
          model = active_model
          next error('sem modelo ativo') unless model
          count = 0
          each_group(model) do |g|
            if g.get_attribute(DICT, 'hidden_user')
              g.set_attribute(DICT, 'hidden_user', false)
              g.hidden = false if g.respond_to?(:hidden=)
              count += 1
            end
          end
          { ok: true, restored: count }
        end
      end

      # ─── 5. Duplicar peca (copy + offset) ─────────────────────
      def self.duplicate(entity_id, offset_mm = 50)
        atomic('Duplicar') do
          ent = find(entity_id)
          next error('entidade nao encontrada') unless ent
          new_ent = nil
          if ent.respond_to?(:copy)
            new_ent = ent.copy
            if new_ent.respond_to?(:transform!) && defined?(::Geom)
              tx = ::Geom::Transformation.translation([offset_mm.to_f.mm, 0, 0])
              new_ent.transform!(tx)
            end
          end
          new_id = new_ent && new_ent.respond_to?(:entityID) ? new_ent.entityID : nil
          { ok: true, entity_id: entity_id, new_entity_id: new_id, offset_mm: offset_mm }
        end
      end

      # ─── 6. Trocar material ───────────────────────────────────
      def self.change_material(entity_id, material_code)
        return error('material vazio') if material_code.nil? || material_code.to_s.empty?
        atomic('Trocar material') do
          ent = find(entity_id)
          next error('entidade nao encontrada') unless ent
          ent.set_attribute(DICT, 'material', material_code.to_s)
          repaint_safe(ent)
          { ok: true, entity_id: entity_id, material: material_code.to_s }
        end
      end

      # ─── 7. Trocar espessura (MVP grava attr; geom regen V2) ─
      def self.change_thickness(entity_id, espessura_mm)
        esp = espessura_mm.to_f
        return error("espessura invalida: #{espessura_mm}") if esp <= 0
        atomic('Trocar espessura') do
          ent = find(entity_id)
          next error('entidade nao encontrada') unless ent
          ent.set_attribute(DICT, 'espessura', esp)
          ent.set_attribute(DICT, 'thickness_dirty', true)
          { ok: true, entity_id: entity_id, espessura: esp, note: 'attr-only (V2 fara regen)' }
        end
      end

      # ─── 8. Trocar bordas (hash 4 chaves) ─────────────────────
      def self.change_edges(entity_id, bordas_hash)
        atomic('Trocar bordas') do
          ent = find(entity_id)
          next error('entidade nao encontrada') unless ent
          h = bordas_hash.is_a?(String) ? safe_parse_json(bordas_hash) : bordas_hash
          next error('bordas invalidas') unless h.is_a?(Hash)
          applied = {}
          %w[frente tras topo base].each do |b|
            val = h[b] || h[b.to_sym]
            bool = val ? true : false
            ent.set_attribute(DICT, "borda_#{b}", bool)
            applied[b] = bool
          end
          { ok: true, entity_id: entity_id, bordas: applied }
        end
      end

      # ─── Helpers internos ─────────────────────────────────────

      def self.atomic(operation_name)
        model = active_model
        model.start_operation(operation_name, true) if model.respond_to?(:start_operation)
        result = yield
        if result.is_a?(Hash) && result[:ok] == false
          model.abort_operation if model.respond_to?(:abort_operation)
        else
          model.commit_operation if model.respond_to?(:commit_operation)
        end
        result
      rescue => e
        begin
          model.abort_operation if model && model.respond_to?(:abort_operation)
        rescue StandardError
        end
        log_error("#{operation_name} falhou: #{e.message}")
        { ok: false, error: e.message, operation: operation_name }
      end

      def self.find(entity_id)
        return nil if entity_id.nil?
        eid = entity_id.to_i
        return nil if eid <= 0
        model = active_model
        return nil unless model
        scope = model.respond_to?(:active_entities) ? model.active_entities : nil
        scope ||= (model.respond_to?(:entities) ? model.entities : nil)
        return nil unless scope
        find_recursive(scope, eid)
      end

      def self.find_recursive(scope, eid)
        scope.each do |e|
          return e if e.respond_to?(:entityID) && e.entityID == eid
          children = nil
          if e.respond_to?(:entities) && !e.respond_to?(:definition)
            children = e.entities
          elsif e.respond_to?(:entities) && e.respond_to?(:definition)
            # Group: tem entities + (as vezes) definition. Usa entities.
            children = e.entities
          elsif e.respond_to?(:definition) && e.definition && e.definition.respond_to?(:entities)
            children = e.definition.entities
          end
          if children && children != scope
            found = find_recursive(children, eid)
            return found if found
          end
        end
        nil
      rescue StandardError
        nil
      end

      def self.active_model
        return ::Sketchup.active_model if defined?(::Sketchup) && ::Sketchup.respond_to?(:active_model)
        nil
      end

      def self.each_group(model, &blk)
        scope = model.respond_to?(:active_entities) ? model.active_entities :
                (model.respond_to?(:entities) ? model.entities : [])
        scope.each do |e|
          blk.call(e) if e.respond_to?(:get_attribute)
        end
      end

      def self.repaint_safe(entity)
        return unless defined?(::Ornato::Library::JsonModuleBuilder)
        return unless ::Ornato::Library::JsonModuleBuilder.respond_to?(:repaint)
        ::Ornato::Library::JsonModuleBuilder.repaint(entity) rescue nil
      end

      def self.error(msg)
        { ok: false, error: msg.to_s }
      end

      def self.log_error(msg)
        if defined?(::Ornato::Logger)
          ::Ornato::Logger.error(msg)
        else
          warn "[ComponentEditor] #{msg}"
        end
      rescue StandardError
        nil
      end

      def self.safe_parse_json(raw)
        JSON.parse(raw.to_s)
      rescue StandardError
        nil
      end

      # Helpers internos (callable da mesma classe).
      # Nao usamos private_class_method para manter callabilidade
      # dos testes (que usam .send para verificar abort em erro).
    end
  end
end

