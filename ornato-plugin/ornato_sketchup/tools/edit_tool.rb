# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# EditTool — Edição in-place de módulos Ornato
#
# Workflow:
#   1. Ativo ao clicar em "Editar" num módulo da lista no painel,
#      ou ao clicar com botão direito → "Editar Módulo Ornato"
#   2. O módulo selecionado fica destacado (ghost azul sobre ele)
#   3. O painel exibe os parâmetros atuais do módulo
#   4. Usuário altera dimensões/parâmetros no painel
#   5. Ao confirmar: deleta o grupo original e cria um novo no mesmo
#      lugar com os novos parâmetros — usando o mesmo engine
#   6. Reposiciona adjacências via NeighborResolver
#   7. ESC cancela sem modificar
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    class EditTool

      CURSOR_MOVE    = 633  # SketchUp move cursor
      CURSOR_DEFAULT = 0

      COLOR_HIGHLIGHT = Sketchup::Color.new(40, 120, 255, 50)
      COLOR_EDGE      = Sketchup::Color.new(40, 120, 255, 220)

      # ─────────────────────────────────────────────────────────
      # @param group [Sketchup::Group]  módulo a editar
      # @param controller [UI::DialogController, nil]
      # ─────────────────────────────────────────────────────────
      def initialize(group, controller = nil)
        @group      = group
        @controller = controller
        @active     = true

        # Lê os params atuais do módulo
        @type   = @group.get_attribute('Ornato', 'module_type').to_s
        @params = begin
          JSON.parse(@group.get_attribute('Ornato', 'params') || '{}', symbolize_names: false)
        rescue
          {}
        end
        @position_mm = group_position_mm(@group)
      end

      # ── Tool Interface ────────────────────────────────────────

      def activate
        update_status
        push_edit_state_to_panel
        Sketchup.active_model.active_view.invalidate
      end

      def deactivate(view)
        view.invalidate
        Sketchup.status_text = ''
        @active = false
      end

      def resume(view)
        update_status
        view.invalidate
      end

      def onKeyDown(key, _repeat, _flags, view)
        case key
        when 27  # ESC
          Sketchup.status_text = 'Ornato: Edição cancelada'
          Sketchup.active_model.select_tool(nil)
          return true
        end
        false
      end

      def onKeyUp(*); false; end

      def onSetCursor
        ::UI.set_cursor(CURSOR_MOVE)
      rescue
        ::UI.set_cursor(CURSOR_DEFAULT)
      end

      def getExtents
        @group ? @group.bounds : Geom::BoundingBox.new
      end

      # ── Drawing ───────────────────────────────────────────────

      def draw(view)
        return unless @group

        bb = @group.bounds
        corners = [
          bb.corner(0), bb.corner(1), bb.corner(3), bb.corner(2),
          bb.corner(4), bb.corner(5), bb.corner(7), bb.corner(6),
        ]

        # Highlight faces
        view.drawing_color = COLOR_HIGHLIGHT
        [
          [0,1,3,2], [4,5,7,6], [0,1,5,4], [2,3,7,6], [0,2,6,4], [1,3,7,5]
        ].each do |q|
          view.draw(GL_QUADS, q.map { |i| corners[i] })
        end

        # Highlight edges
        view.drawing_color = COLOR_EDGE
        view.line_width = 2
        lines = []
        [[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[3,7],[2,6]].each do |a, b|
          lines << corners[a] << corners[b]
        end
        view.draw(GL_LINES, lines)
      end

      # ─────────────────────────────────────────────────────────
      # Aplica novos parâmetros ao módulo.
      # Chamado pelo painel quando o usuário confirma edição.
      # ─────────────────────────────────────────────────────────
      def apply_params(new_params)
        return unless @group

        model = Sketchup.active_model
        model.start_operation('Ornato: Editar Módulo', true)

        begin
          # Guardar posição e tipo antes de apagar
          pos_mm  = group_position_mm(@group)
          type    = @type
          merged  = @params.merge(stringify_keys(new_params))

          # Apagar grupo original
          @group.erase!
          @group = nil

          # Criar novo grupo com novos parâmetros na mesma posição
          new_group = Library::ParametricEngine.create_module(type, merged, pos_mm)
          raise 'Falha ao criar módulo editado' unless new_group

          model.commit_operation

          # Resolver adjacências com novo grupo
          begin
            NeighborResolver.resolve_for(new_group)
          rescue => e
            puts "Ornato EditTool: NeighborResolver error: #{e.message}"
          end

          # Selecionar o novo grupo
          model.selection.clear
          model.selection.add(new_group)

          @group  = new_group
          @params = merged

          @controller&.panel_status("Módulo editado: #{type}")
          Sketchup.status_text = "Ornato: #{new_group.name} atualizado"

          new_group

        rescue => e
          model.abort_operation
          puts "Ornato EditTool apply_params ERRO: #{e.message}"
          @controller&.panel_status("Erro ao editar: #{e.message}")
          nil
        end
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      def group_position_mm(group)
        origin = group.transformation.origin
        [origin.x.to_mm, origin.y.to_mm, origin.z.to_mm]
      end

      def update_status
        type_label = Library::ParametricEngine::MODULE_TYPES[@type]&.dig(:label) || @type
        Sketchup.status_text = "Ornato Editar: #{type_label} | Altere parâmetros no painel e confirme | ESC=cancelar"
      end

      def push_edit_state_to_panel
        return unless @controller&.respond_to?(:send_to_panel)

        data = {
          action:    'edit_mode',
          type:      @type,
          params:    @params,
          entity_id: @group&.entityID.to_s,
        }.to_json

        @controller.send_to_panel("typeof enterEditMode==='function'&&enterEditMode(#{data})")
      end

      def stringify_keys(hash)
        result = {}
        hash.each { |k, v| result[k.to_s] = v }
        result
      end
    end # class EditTool
  end # module Tools
end # module Ornato
