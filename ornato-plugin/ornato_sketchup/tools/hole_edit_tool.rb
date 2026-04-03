# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# HoleEditTool — Custom SketchUp Tool for editing/moving/deleting
# existing hole visuals in the model.
#
# Workflow:
# 1. User activates "Editar Furos" from menu
# 2. Existing hole visuals become selectable (highlighted on hover)
# 3. Click to select a hole — shows details
# 4. Drag to move (constrained to face), right-click for context menu
# 5. ESC to deactivate
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    class HoleEditTool
      VIZ_PREFIX = Visual::HardwareVisualizer::VIZ_PREFIX
      HIGHLIGHT_COLOR = Sketchup::Color.new(255, 220, 0, 160)
      SELECTED_COLOR = Sketchup::Color.new(0, 200, 255, 200)

      def initialize
        @hover_viz = nil       # hovered visual group
        @selected_viz = nil    # selected visual group
        @parent_piece = nil    # parent piece of selected viz
        @dragging = false
        @drag_start = nil
        @ip = nil
        @dialog = nil
      end

      # ─── Tool interface ──────────────────────────────

      def activate
        @ip = Sketchup::InputPoint.new
        @hover_viz = nil
        @selected_viz = nil
        @dragging = false
        Sketchup.status_text = 'Ornato Editar Furos: Clique num furo para selecionar. Arraste para mover. Direito=menu. ESC=sair.'
      end

      def deactivate(view)
        view.invalidate
        close_dialog
        Sketchup.status_text = ''
      end

      def resume(view)
        view.invalidate
      end

      def suspend(view)
        view.invalidate
      end

      def onMouseMove(flags, x, y, view)
        @ip.pick(view, x, y)

        if @dragging && @selected_viz && @parent_piece
          # Move the selected visual
          move_visual_to(view, x, y)
          view.invalidate
          return
        end

        # Find viz group under cursor
        ph = view.pick_helper
        ph.do_pick(x, y)

        @hover_viz = nil
        # Walk pick path to find ornato_viz groups
        path = ph.path_at(0)
        if path
          path.each do |ent|
            if ent.is_a?(Sketchup::Group) && ent.name.to_s.start_with?(VIZ_PREFIX)
              @hover_viz = ent
              break
            end
          end
        end

        view.invalidate
        if @hover_viz
          view.tooltip = extract_viz_info(@hover_viz)
        else
          view.tooltip = ''
        end
      end

      def onLButtonDown(flags, x, y, view)
        if @hover_viz
          @selected_viz = @hover_viz
          @parent_piece = find_parent_piece(@selected_viz)
          @drag_start = @ip.position.clone
          @dragging = false
          view.invalidate

          Sketchup.status_text = "Selecionado: #{extract_viz_info(@selected_viz)} | Arraste=mover | Direito=opcoes | ESC=cancelar"
        else
          @selected_viz = nil
          @parent_piece = nil
          view.invalidate
        end
      end

      def onLButtonUp(flags, x, y, view)
        if @dragging && @selected_viz
          finalize_move(view, x, y)
          @dragging = false
        end
      end

      def onLButtonDoubleClick(flags, x, y, view)
        if @selected_viz
          show_edit_dialog
        end
      end

      def onRButtonDown(flags, x, y, view)
        if @hover_viz || @selected_viz
          target = @hover_viz || @selected_viz
          @selected_viz = target
          @parent_piece = find_parent_piece(target)
          show_context_menu(view, x, y)
        end
      end

      def onKeyDown(key, repeat, flags, view)
        case key
        when 27 # ESC
          if @selected_viz
            @selected_viz = nil
            @dragging = false
            view.invalidate
            Sketchup.status_text = 'Ornato Editar Furos: Selecao cancelada.'
            return true
          else
            Sketchup.active_model.select_tool(nil)
            return true
          end
        when 0x2E, 8 # Delete or Backspace
          delete_selected(view) if @selected_viz
          return true
        end
        false
      end

      def onKeyUp(key, repeat, flags, view)
        false
      end

      def onSetCursor
        if @hover_viz || @selected_viz
          UI.set_cursor(632) # Move cursor
        else
          UI.set_cursor(0)   # Default
        end
      end

      def getExtents
        bb = Geom::BoundingBox.new
        bb.add(@selected_viz.bounds) if @selected_viz
        bb.add(@hover_viz.bounds) if @hover_viz
        bb
      end

      # ─── Drawing ─────────────────────────────────────

      def draw(view)
        # Highlight hovered viz
        if @hover_viz && @hover_viz != @selected_viz
          draw_viz_highlight(view, @hover_viz, HIGHLIGHT_COLOR)
        end

        # Highlight selected viz
        if @selected_viz
          draw_viz_highlight(view, @selected_viz, SELECTED_COLOR)
        end

        # Draw drag guide line
        if @dragging && @drag_start && @ip.position
          view.drawing_color = Sketchup::Color.new(255, 255, 255, 128)
          view.line_width = 1
          view.line_stipple = '-'
          view.draw(GL_LINES, [@drag_start, @ip.position])
        end
      end

      private

      # ─── Visual highlighting ─────────────────────────

      def draw_viz_highlight(view, viz_group, color)
        bb = viz_group.bounds
        return if bb.empty?

        # Draw bounding box edges
        pts = [
          bb.corner(0), bb.corner(1), bb.corner(3), bb.corner(2), bb.corner(0),
          bb.corner(4), bb.corner(5), bb.corner(7), bb.corner(6), bb.corner(4),
        ]

        view.drawing_color = color
        view.line_width = 3
        view.draw(GL_LINE_STRIP, pts)

        # Connecting edges
        view.draw(GL_LINES, [
          bb.corner(0), bb.corner(4),
          bb.corner(1), bb.corner(5),
          bb.corner(2), bb.corner(6),
          bb.corner(3), bb.corner(7),
        ])
      end

      # ─── Movement ───────────────────────────────────

      def move_visual_to(view, x, y)
        return unless @selected_viz && @drag_start

        @ip.pick(view, x, y)
        new_pos = @ip.position
        delta = new_pos - @drag_start

        # Only start dragging after minimum distance
        if delta.length > 2.mm
          @dragging = true
        end
      end

      def finalize_move(view, x, y)
        return unless @selected_viz && @drag_start

        @ip.pick(view, x, y)
        new_pos = @ip.position
        delta = new_pos - @drag_start

        return if delta.length < 1.mm # too small, ignore

        model = Sketchup.active_model
        model.start_operation('Ornato: Mover Furo', true)

        begin
          tr = Geom::Transformation.translation(delta)
          @selected_viz.transform!(tr)

          # Update stored attribute data if parent piece exists
          update_stored_position(@parent_piece, @selected_viz, delta) if @parent_piece

          model.commit_operation
          @drag_start = new_pos.clone
          Sketchup.status_text = "Furo movido: #{delta.x.to_mm.round(1)}, #{delta.y.to_mm.round(1)}mm"
        rescue => e
          model.abort_operation
          puts "Ornato HoleEditTool move error: #{e.message}"
        end
      end

      # ─── Context menu ───────────────────────────────

      def show_context_menu(view, x, y)
        menu = UI::Menu.new
        # Note: SketchUp doesn't allow creating popup menus directly.
        # We use a workaround with getMenu or show a dialog instead.
        show_edit_options_dialog
      end

      def show_edit_options_dialog
        return unless @selected_viz

        info = extract_viz_info(@selected_viz)

        result = UI.messagebox(
          "Furo selecionado: #{info}\n\n" \
          "Opcoes:\n" \
          "- SIM = Editar propriedades\n" \
          "- NAO = Duplicar com offset\n" \
          "- CANCELAR = Excluir furo",
          MB_YESNOCANCEL
        )

        case result
        when IDYES
          show_edit_dialog
        when IDNO
          duplicate_with_offset
        when IDCANCEL
          delete_selected(nil)
        end
      end

      # ─── Edit dialog ────────────────────────────────

      def show_edit_dialog
        return unless @selected_viz

        close_dialog

        @dialog = UI::HtmlDialog.new(
          dialog_title: 'Editar Furo - Ornato',
          width: 380,
          height: 520,
          style: UI::HtmlDialog::STYLE_DIALOG,
          resizable: false
        )

        html_path = File.join(Ornato::PLUGIN_DIR, 'ornato_sketchup', 'tools', 'hole_config_dialog.html')
        @dialog.set_file(html_path)

        @dialog.add_action_callback('confirm_hole') do |_action_context, json_str|
          begin
            data = JSON.parse(json_str)
            apply_edit(data)
          rescue => e
            puts "Ornato HoleEditTool edit error: #{e.message}"
          end
          close_dialog
        end

        @dialog.add_action_callback('cancel_hole') do |_action_context|
          close_dialog
        end

        @dialog.add_action_callback('dialog_ready') do |_action_context|
          # Extract current values from viz name/attributes
          current = parse_viz_attributes(@selected_viz)
          init_data = {
            type: current[:type] || 'custom',
            diameter: current[:diameter] || 8.0,
            depth: current[:depth] || 10.0,
            side: current[:side] || 'a',
            position_x: current[:position_x] || 0,
            position_y: current[:position_y] || 0,
            tool_code: current[:tool_code] || '',
            description: current[:description] || '',
            edit_mode: true,
          }
          @dialog.execute_script("initData(#{JSON.generate(init_data)})")
        end

        @dialog.show
      end

      def close_dialog
        if @dialog
          @dialog.close rescue nil
          @dialog = nil
        end
      end

      # ─── Apply edits ────────────────────────────────

      def apply_edit(data)
        return unless @selected_viz && @parent_piece

        model = Sketchup.active_model
        model.start_operation('Ornato: Editar Furo', true)

        begin
          # Delete old visual
          @selected_viz.erase!

          # Recreate with new params
          diameter = (data['diameter'] || 8.0).to_f
          depth = (data['depth'] || 10.0).to_f
          side = data['side'] || 'a'
          pos_x = (data['position_x'] || 0).to_f
          pos_y = (data['position_y'] || 0).to_f
          type = data['type'] || 'custom'

          viz = Visual::HardwareVisualizer.new
          color_key = HoleTool::PRESETS[type] ? HoleTool::PRESETS[type][:color] : :custom
          color = Visual::HardwareVisualizer::COLORS[color_key] || Visual::HardwareVisualizer::COLORS[:custom]
          label = "edited_#{type}_#{Time.now.to_i}"

          viz.create_hole_visual(@parent_piece, pos_x, pos_y, diameter, depth, side, color, label)

          model.commit_operation
          @selected_viz = nil
          Sketchup.status_text = "Furo editado: #{diameter}x#{depth}mm"
        rescue => e
          model.abort_operation
          puts "Ornato HoleEditTool apply_edit error: #{e.message}"
        end
      end

      # ─── Delete ──────────────────────────────────────

      def delete_selected(view)
        return unless @selected_viz

        model = Sketchup.active_model
        model.start_operation('Ornato: Excluir Furo', true)

        begin
          info = extract_viz_info(@selected_viz)
          @selected_viz.erase!
          @selected_viz = nil
          model.commit_operation
          Sketchup.status_text = "Furo excluido: #{info}"
          view.invalidate if view
        rescue => e
          model.abort_operation
          puts "Ornato HoleEditTool delete error: #{e.message}"
        end
      end

      # ─── Duplicate ──────────────────────────────────

      def duplicate_with_offset
        return unless @selected_viz && @parent_piece

        input = UI.inputbox(
          ['Offset X (mm)', 'Offset Y (mm)'],
          [32.0, 0.0],
          'Duplicar Furo com Offset'
        )
        return unless input

        offset_x, offset_y = input

        model = Sketchup.active_model
        model.start_operation('Ornato: Duplicar Furo', true)

        begin
          current = parse_viz_attributes(@selected_viz)

          new_x = (current[:position_x] || 0) + offset_x.to_f
          new_y = (current[:position_y] || 0) + offset_y.to_f

          viz = Visual::HardwareVisualizer.new
          type = current[:type] || 'custom'
          color_key = HoleTool::PRESETS[type] ? HoleTool::PRESETS[type][:color] : :custom
          color = Visual::HardwareVisualizer::COLORS[color_key] || Visual::HardwareVisualizer::COLORS[:custom]
          label = "dup_#{type}_#{Time.now.to_i}"

          viz.create_hole_visual(
            @parent_piece, new_x, new_y,
            current[:diameter] || 8.0,
            current[:depth] || 10.0,
            current[:side] || 'a',
            color, label
          )

          model.commit_operation
          Sketchup.status_text = "Furo duplicado em (#{new_x.round(1)}, #{new_y.round(1)})"
        rescue => e
          model.abort_operation
          puts "Ornato HoleEditTool duplicate error: #{e.message}"
        end
      end

      # ─── Helpers ─────────────────────────────────────

      def find_parent_piece(viz_group)
        # Walk up the entity tree to find the parent piece group
        parent = viz_group.parent
        if parent.is_a?(Sketchup::ComponentDefinition)
          # Find the instance
          parent.instances.first
        elsif parent.is_a?(Sketchup::Model)
          nil
        else
          parent
        end
      end

      def extract_viz_info(viz_group)
        name = viz_group.name.to_s
        # Parse name pattern: ornato_viz_<type>_<suffix>
        parts = name.sub(VIZ_PREFIX, '').split('_')
        type_part = parts.first || 'hole'

        bb = viz_group.bounds
        w = bb.width.to_mm.round(1)
        h = bb.height.to_mm.round(1)
        d = bb.depth.to_mm.round(1)

        "#{type_part} (#{w}x#{h}x#{d}mm)"
      end

      def parse_viz_attributes(viz_group)
        name = viz_group.name.to_s
        bb = viz_group.bounds

        # Try to get data from parent piece attributes
        parent = find_parent_piece(viz_group)
        if parent
          manual_holes_json = parent.get_attribute('ornato', 'manual_holes', '[]')
          holes = begin
                    JSON.parse(manual_holes_json)
                  rescue
                    []
                  end

          # Find closest match by position
          center = bb.center
          local_center = parent.transformation.inverse * center

          holes.each do |h|
            hx = (h['position_x'] || h[:position_x] || 0).to_f.mm
            hy = (h['position_y'] || h[:position_y] || 0).to_f.mm
            dist = Math.sqrt((local_center.x - hx)**2 + (local_center.y - hy)**2)
            if dist < 5.mm
              return {
                type: h['type'] || h[:type] || 'custom',
                diameter: (h['diameter'] || h[:diameter] || 8.0).to_f,
                depth: (h['depth'] || h[:depth] || 10.0).to_f,
                side: (h['side'] || h[:side] || 'a').to_s,
                position_x: (h['position_x'] || h[:position_x] || 0).to_f,
                position_y: (h['position_y'] || h[:position_y] || 0).to_f,
                tool_code: (h['tool_code'] || h[:tool_code] || '').to_s,
                description: (h['description'] || h[:description] || '').to_s,
              }
            end
          end
        end

        # Fallback: estimate from bounding box
        {
          type: 'custom',
          diameter: [bb.width.to_mm, bb.height.to_mm].min.round(1),
          depth: bb.depth.to_mm.round(1),
          side: 'a',
          position_x: bb.center.x.to_mm.round(1),
          position_y: bb.center.y.to_mm.round(1),
          tool_code: '',
          description: '',
        }
      end

      def update_stored_position(piece, viz_group, delta)
        # Not implemented for auto-generated holes,
        # only for manual holes stored in attributes
        return unless piece

        manual_holes_json = piece.get_attribute('ornato', 'manual_holes', '[]')
        holes = begin
                  JSON.parse(manual_holes_json)
                rescue
                  []
                end

        return if holes.empty?

        # Find and update the closest hole
        bb = viz_group.bounds
        center = bb.center
        local_center = piece.transformation.inverse * center

        holes.each do |h|
          hx = (h['position_x'] || 0).to_f.mm
          hy = (h['position_y'] || 0).to_f.mm
          dist = Math.sqrt((local_center.x - delta.x - hx)**2 + (local_center.y - delta.y - hy)**2)
          if dist < 5.mm
            h['position_x'] = (h['position_x'].to_f + delta.x.to_mm).round(2)
            h['position_y'] = (h['position_y'].to_f + delta.y.to_mm).round(2)
            break
          end
        end

        piece.set_attribute('ornato', 'manual_holes', JSON.generate(holes))
      end
    end
  end
end
