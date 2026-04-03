# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# HoleTool — Custom SketchUp Tool for manually placing holes
# on piece faces.
#
# Workflow:
# 1. User activates tool from menu/toolbar
# 2. Hover over a piece face — face highlights, preview circle shown
# 3. Click — config dialog appears for type/diameter/depth
# 4. On confirm — hole visual + machining data created
# 5. Tool stays active for more clicks, ESC to deactivate
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    class HoleTool
      CURSOR_CROSSHAIR = 0
      PREVIEW_COLOR = Sketchup::Color.new(255, 180, 0, 128) # orange semi-transparent
      HIGHLIGHT_COLOR = Sketchup::Color.new(100, 200, 255, 80)
      SNAP_GRID = 32.0 # mm, for shift-snap

      # Hole type presets: [diameter_mm, depth_mm, label, color_key]
      PRESETS = {
        'dobradica'  => { diameter: 35.0, depth: 12.5,  label: 'Dobradica (copo)',   color: :hinge_cup },
        'minifix'    => { diameter: 15.0, depth: 12.0,  label: 'Minifix (corpo)',     color: :minifix_body },
        'cavilha'    => { diameter: 8.0,  depth: 15.0,  label: 'Cavilha',             color: :dowel },
        'passante'   => { diameter: 5.0,  depth: 0.0,   label: 'Passante (puxador)',  color: :handle },
        'sistema32'  => { diameter: 5.0,  depth: 12.0,  label: 'Sistema 32',          color: :system32 },
        'corredica'  => { diameter: 4.0,  depth: 11.0,  label: 'Corredica',           color: :slide },
        'custom'     => { diameter: 8.0,  depth: 10.0,  label: 'Personalizado',       color: :custom },
      }.freeze

      def initialize
        @hover_face = nil
        @hover_point = nil
        @hover_piece = nil
        @hover_normal = nil
        @current_type = 'dobradica'
        @snap_enabled = false
        @dialog = nil
        @click_point_local = nil
        @click_side = 'a'
      end

      # ─── Tool interface methods ──────────────────────

      def activate
        @hover_face = nil
        @hover_point = nil
        @hover_piece = nil
        @ip = Sketchup::InputPoint.new
        Sketchup.status_text = 'Ornato: Clique numa face para adicionar furo. Shift=snap grid. Tab=trocar tipo. ESC=cancelar.'
        update_status
      end

      def deactivate(view)
        view.invalidate
        close_dialog
        Sketchup.status_text = ''
      end

      def resume(view)
        update_status
        view.invalidate
      end

      def suspend(view)
        view.invalidate
      end

      def onMouseMove(flags, x, y, view)
        @snap_enabled = (flags & CONSTRAIN_MODIFIER_MASK) != 0
        @ip.pick(view, x, y)

        ph = view.pick_helper
        ph.do_pick(x, y)
        best_pick = ph.best_picked

        if best_pick && (best_pick.is_a?(Sketchup::Group) || best_pick.is_a?(Sketchup::ComponentInstance))
          @hover_piece = best_pick
          ray = view.pickray(x, y)
          result = find_face_hit(@hover_piece, ray)

          if result
            @hover_face = result[:face]
            @hover_point = result[:point]
            @hover_normal = result[:normal]
          else
            @hover_face = nil
            @hover_point = @ip.position
            @hover_normal = nil
          end
        else
          @hover_piece = nil
          @hover_face = nil
          @hover_point = @ip.position
          @hover_normal = nil
        end

        # Snap to grid if shift held
        if @snap_enabled && @hover_point && @hover_piece
          @hover_point = snap_to_grid(@hover_point, @hover_piece)
        end

        view.invalidate
        view.tooltip = @hover_piece ? "Peca: #{@hover_piece.name}" : ''
      end

      def onLButtonDown(flags, x, y, view)
        return unless @hover_piece && @hover_point

        # Convert world point to local piece coordinates
        tr = @hover_piece.transformation
        local_pt = tr.inverse * @hover_point

        @click_point_local = [local_pt.x.to_mm, local_pt.y.to_mm, local_pt.z.to_mm]

        # Determine side based on Z position relative to piece bounds
        bb = @hover_piece.bounds
        piece_depth = bb.depth
        local_z = local_pt.z
        @click_side = local_z > piece_depth / 2.0 ? 'a' : 'b'

        show_config_dialog
      end

      def onKeyDown(key, repeat, flags, view)
        case key
        when 27 # ESC
          Sketchup.active_model.select_tool(nil)
          return true
        when 9  # Tab — cycle type
          types = PRESETS.keys
          current_idx = types.index(@current_type) || 0
          @current_type = types[(current_idx + 1) % types.length]
          update_status
          view.invalidate
          return true
        end
        false
      end

      def onKeyUp(key, repeat, flags, view)
        false
      end

      def onSetCursor
        UI.set_cursor(CURSOR_CROSSHAIR)
      end

      def getExtents
        bb = Geom::BoundingBox.new
        bb.add(@hover_point) if @hover_point
        bb
      end

      # ─── Drawing ─────────────────────────────────────

      def draw(view)
        return unless @hover_point

        # Draw preview circle at cursor position
        preset = PRESETS[@current_type] || PRESETS['custom']
        radius = (preset[:diameter] / 2.0).mm

        if @hover_face && @hover_normal
          draw_circle_on_face(view, @hover_point, @hover_normal, radius)
        else
          draw_circle_screen(view, @hover_point, radius)
        end

        # Draw crosshair
        draw_crosshair(view, @hover_point)

        # Draw type indicator text
        view.draw_text(
          view.screen_coords(@hover_point).offset([15, -15, 0]),
          "#{preset[:label]} (#{preset[:diameter]}mm)",
          size: 12,
          color: Sketchup::Color.new(255, 255, 255)
        )
      end

      private

      # ─── Face hit detection ──────────────────────────

      def find_face_hit(piece, ray)
        ents = piece.is_a?(Sketchup::ComponentInstance) ? piece.definition.entities : piece.entities
        tr = piece.transformation

        best_hit = nil
        best_dist = Float::INFINITY

        ents.grep(Sketchup::Face).each do |face|
          # Transform face plane to world coordinates
          plane = face.plane
          world_normal = tr * Geom::Vector3d.new(plane[0], plane[1], plane[2])
          world_point_on_plane = tr * face.vertices.first.position

          # Ray-plane intersection
          hit = Geom.intersect_line_plane(ray, [world_point_on_plane, world_normal])
          next unless hit

          dist = hit.distance(ray[0])
          if dist < best_dist
            best_dist = dist
            best_hit = { face: face, point: hit, normal: world_normal }
          end
        end

        best_hit
      end

      # ─── Grid snapping ──────────────────────────────

      def snap_to_grid(world_point, piece)
        tr = piece.transformation
        local = tr.inverse * world_point
        grid = SNAP_GRID.mm

        snapped = Geom::Point3d.new(
          (local.x / grid).round * grid,
          (local.y / grid).round * grid,
          local.z
        )

        tr * snapped
      end

      # ─── Drawing helpers ─────────────────────────────

      def draw_circle_on_face(view, center, normal, radius)
        points = []
        segments = 24
        # Create a coordinate frame on the face
        up = normal.parallel?(Z_AXIS) ? Y_AXIS : Z_AXIS
        x_axis = normal.cross(up).normalize
        y_axis = normal.cross(x_axis).normalize

        segments.times do |i|
          angle = (2 * Math::PI * i) / segments
          pt = center.offset(x_axis, radius * Math.cos(angle))
          pt = pt.offset(y_axis, radius * Math.sin(angle))
          points << pt
        end
        points << points.first # close the circle

        view.drawing_color = PREVIEW_COLOR
        view.line_width = 2
        view.draw(GL_LINE_STRIP, points)

        # Fill
        view.drawing_color = Sketchup::Color.new(255, 180, 0, 40)
        view.draw(GL_POLYGON, points[0..-2])
      end

      def draw_circle_screen(view, center, radius)
        points = []
        segments = 24
        segments.times do |i|
          angle = (2 * Math::PI * i) / segments
          pt = center.offset(X_AXIS, radius * Math.cos(angle))
          pt = pt.offset(Y_AXIS, radius * Math.sin(angle))
          points << pt
        end
        points << points.first

        view.drawing_color = PREVIEW_COLOR
        view.line_width = 2
        view.draw(GL_LINE_STRIP, points)
      end

      def draw_crosshair(view, point)
        size = 10.mm
        view.drawing_color = Sketchup::Color.new(255, 255, 255, 180)
        view.line_width = 1
        view.draw(GL_LINES, [
          point.offset(X_AXIS, -size), point.offset(X_AXIS, size),
          point.offset(Y_AXIS, -size), point.offset(Y_AXIS, size),
        ])
      end

      # ─── Config Dialog ──────────────────────────────

      def show_config_dialog
        close_dialog

        @dialog = UI::HtmlDialog.new(
          dialog_title: 'Adicionar Furo - Ornato',
          width: 380,
          height: 520,
          style: UI::HtmlDialog::STYLE_DIALOG,
          resizable: false
        )

        html_path = File.join(Ornato::PLUGIN_DIR, 'ornato_sketchup', 'tools', 'hole_config_dialog.html')
        @dialog.set_file(html_path)

        # Callback: receive hole configuration from dialog
        @dialog.add_action_callback('confirm_hole') do |_action_context, json_str|
          begin
            data = JSON.parse(json_str)
            create_hole_at_click(data)
          rescue => e
            puts "Ornato HoleTool confirm error: #{e.message}"
          end
          close_dialog
        end

        @dialog.add_action_callback('cancel_hole') do |_action_context|
          close_dialog
        end

        # Send initial data to dialog after it loads
        @dialog.add_action_callback('dialog_ready') do |_action_context|
          preset = PRESETS[@current_type] || PRESETS['custom']
          init_data = {
            type: @current_type,
            diameter: preset[:diameter],
            depth: preset[:depth],
            side: @click_side,
            position_x: @click_point_local ? @click_point_local[0].round(1) : 0,
            position_y: @click_point_local ? @click_point_local[1].round(1) : 0,
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

      # ─── Create the hole ─────────────────────────────

      def create_hole_at_click(data)
        return unless @hover_piece && @click_point_local

        model = Sketchup.active_model
        model.start_operation('Ornato: Adicionar Furo Manual', true)

        begin
          type = data['type'] || @current_type
          diameter = (data['diameter'] || 8.0).to_f
          depth = (data['depth'] || 10.0).to_f
          side = data['side'] || @click_side
          tool_code = data['tool_code'] || ''
          description = data['description'] || ''
          pos_x = (data['position_x'] || @click_point_local[0]).to_f
          pos_y = (data['position_y'] || @click_point_local[1]).to_f

          # If depth is 0 for "passante", use piece thickness
          if depth <= 0
            bb = @hover_piece.bounds
            depth = bb.depth.to_mm
          end

          # Create the visual
          viz = Visual::HardwareVisualizer.new
          color_key = PRESETS[type] ? PRESETS[type][:color] : :custom
          color = Visual::HardwareVisualizer::COLORS[color_key] || Visual::HardwareVisualizer::COLORS[:custom]
          label = "manual_#{type}_#{Time.now.to_i}"

          viz.create_hole_visual(@hover_piece, pos_x, pos_y, diameter, depth, side, color, label)

          # Store machining data as attribute on the piece
          store_manual_hole(@hover_piece, {
            category: 'hole',
            position_x: pos_x,
            position_y: pos_y,
            diameter: diameter,
            depth: depth,
            side: side,
            tool_code: tool_code,
            description: description,
            type: type,
            manual: true,
          })

          # Add label
          overlay = Visual::LabelOverlay.new
          op_hash = {
            'category' => 'hole',
            'diameter' => diameter,
            'depth' => depth,
            'position_x' => pos_x,
            'position_y' => pos_y,
            'side' => side,
          }
          overlay.add_labels(@hover_piece, { label => op_hash })

          model.commit_operation
          Sketchup.status_text = "Furo #{type} criado: #{diameter}x#{depth}mm em (#{pos_x.round(1)}, #{pos_y.round(1)})"
        rescue => e
          model.abort_operation
          puts "Ornato HoleTool create error: #{e.message}"
          puts e.backtrace.first(5).join("\n")
          UI.messagebox("Erro ao criar furo: #{e.message}")
        end
      end

      # ─── Store manual hole data ──────────────────────

      def store_manual_hole(piece, hole_data)
        existing = piece.get_attribute('ornato', 'manual_holes', '[]')
        holes = begin
                  JSON.parse(existing)
                rescue
                  []
                end

        holes << hole_data
        piece.set_attribute('ornato', 'manual_holes', JSON.generate(holes))
      end

      # ─── Status bar ─────────────────────────────────

      def update_status
        preset = PRESETS[@current_type] || PRESETS['custom']
        snap_text = @snap_enabled ? ' [SNAP]' : ''
        Sketchup.status_text = "Ornato Furo: #{preset[:label]} (#{preset[:diameter]}mm)#{snap_text} | Tab=trocar tipo | ESC=sair"
      end
    end
  end
end
