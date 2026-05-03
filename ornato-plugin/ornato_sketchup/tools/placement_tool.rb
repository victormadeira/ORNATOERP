# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# PlacementTool — Interactive module placement for Ornato
#
# Workflow:
#   1. Activated by DialogController when user clicks "Inserir no Modelo"
#   2. Receives module type + params (dimensions, material, etc.)
#   3. Shows a transparent ghost bounding-box that follows the cursor
#   4. Snaps to: floor plane, horizontal surfaces, adjacent Ornato modules
#   5. Collision detection: ghost turns RED when overlapping existing modules
#   6. Left-click confirms placement → ParametricEngine creates the module
#   7. Shift+click keeps tool active for placing more of the same module
#   8. ESC cancels and returns to the select tool
#
# Ghost rendering (GL_LINES wireframe + transparent fill):
#   Green  → valid placement
#   Red    → collision detected
#   Yellow → snapping to adjacent module or surface
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    class PlacementTool

      # ── Cursors & Colors ──────────────────────────────────────
      CURSOR_CROSSHAIR = 0

      COLOR_VALID   = Sketchup::Color.new(80,  200, 80,  160)
      COLOR_INVALID = Sketchup::Color.new(220, 50,  50,  160)
      COLOR_SNAP    = Sketchup::Color.new(200, 180, 50,  160)
      COLOR_EDGE    = Sketchup::Color.new(255, 255, 255, 220)
      COLOR_FILL    = Sketchup::Color.new(100, 200, 100, 25)
      COLOR_FILL_BAD= Sketchup::Color.new(220, 60,  60,  25)
      COLOR_DIM_TXT = Sketchup::Color.new(255, 255, 255, 220)
      COLOR_SNAP_LINE= Sketchup::Color.new(255, 220, 60,  200)

      SNAP_TOLERANCE = 25.0  # mm — how close before we snap to adjacent module
      COLLISION_SHRINK = 2.0 # mm — shrink AABB slightly to allow touching

      # ─────────────────────────────────────────────────────────
      # @param type   [String] module type key (e.g. 'armario_base')
      # @param params [Hash]   module parameters (string or symbol keys)
      # @param controller [UI::DialogController, nil]  to push status back
      # ─────────────────────────────────────────────────────────
      def initialize(type, params, controller = nil)
        @type       = type.to_s
        @params     = symbolize(params)
        @controller = controller

        # Dimensions in SketchUp internal units (inches)
        @w = dim(:largura,      600).mm   # width  (X)
        @d = dim(:profundidade, 550).mm   # depth  (Y)
        @h = dim(:altura,       720).mm   # height (Z)

        @position    = nil   # Geom::Point3d — bottom-left-front corner (world)
        @valid       = true  # collision flag
        @snapping_to = nil   # symbol: :floor, :adjacent, :surface
        @snap_ref    = nil   # Geom::Point3d — reference used in snap line draw
        @adjacent    = nil   # Sketchup::Group we are snapping to
        @ip          = nil
      end

      # ── Tool Interface ────────────────────────────────────────

      def activate
        @ip = Sketchup::InputPoint.new
        update_status
        Sketchup.active_model.active_view.invalidate
      end

      def deactivate(view)
        view.invalidate
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
        @ip.pick(view, x, y)
        ray = view.pickray(x, y)

        # 1. Find where cursor intersects a horizontal surface (floor / countertop)
        pt = pick_placement_point(view, x, y, ray)

        if pt
          # 2. Snap to adjacent Ornato modules
          pt, snap_type, snap_ref, snap_grp = snap_to_modules(pt)
          @snapping_to = snap_type
          @snap_ref    = snap_ref
          @adjacent    = snap_grp

          # 3. Keep Z from surface pick (don't override Z with snap)
          @position = pt

          # 4. Check collisions with existing Ornato modules
          @valid = !collides?(pt)
        end

        view.invalidate
        update_status
      end

      def onLButtonDown(flags, x, y, view)
        return unless @position

        if @valid
          confirm_placement(flags, view)
        else
          # Flash feedback for invalid
          Sketchup.status_text = 'Ornato: Posicao invalida — colisao detectada!'
          ::UI.beep
        end
      end

      def onKeyDown(key, _repeat, _flags, view)
        case key
        when 27   # ESC
          cancel(view)
          return true
        end
        false
      end

      def onKeyUp(_key, _repeat, _flags, _view); false; end

      def onSetCursor
        ::UI.set_cursor(CURSOR_CROSSHAIR)
      end

      def getExtents
        bb = Geom::BoundingBox.new
        if @position
          bb.add(@position)
          bb.add(Geom::Point3d.new(@position.x + @w, @position.y + @d, @position.z + @h))
        end
        bb
      end

      # ── Drawing ───────────────────────────────────────────────

      def draw(view)
        return unless @position

        edge_col = edge_color
        fill_col = fill_color

        corners = build_corners(@position, @w, @d, @h)

        draw_ghost_faces(view, corners, fill_col)
        draw_ghost_edges(view, corners, edge_col)
        draw_dimensions(view, corners)
        draw_snap_line(view) if @snap_ref && @snapping_to == :adjacent
        draw_snap_badge(view, @position)
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      # ── Placement point from cursor ───────────────────────────

      def pick_placement_point(view, x, y, ray)
        # Priority 1: horizontal face under cursor (floor, shelf, countertop)
        ph = view.pick_helper
        ph.do_pick(x, y)

        ph.count.times do |i|
          e = ph.leaf_at(i)
          next unless e.is_a?(Sketchup::Face)

          tr = ph.transformation_at(i)
          world_normal = tr * e.normal

          # Only care about faces pointing mostly upward (Z > 0.7)
          next unless world_normal.z > 0.7

          # A point on this face
          face_pt = tr * e.vertices.first.position
          hit = Geom.intersect_line_plane(ray, [face_pt, world_normal])
          return hit if hit
        end

        # Priority 2: project onto world ground plane (Z = 0)
        ground = [Geom::Point3d.new(0, 0, 0), Z_AXIS]
        hit = Geom.intersect_line_plane(ray, ground)

        # Ensure we don't go below ground
        if hit && hit.z < -1.mm
          hit = Geom::Point3d.new(hit.x, hit.y, 0)
        end

        hit
      end

      # ── Snap to adjacent Ornato modules ───────────────────────
      # Returns [point, snap_type, snap_reference_point, snapping_group]

      def snap_to_modules(pt)
        model = Sketchup.active_model
        ornato_groups = collect_ornato_groups(model)

        best_dist = SNAP_TOLERANCE.mm
        best_pt   = pt
        snap_type = :floor
        snap_ref  = nil
        snap_grp  = nil

        ornato_groups.each do |grp|
          bb = grp.bounds

          # Candidate snap positions: left side, right side, front, back
          # Right side of grp → our left side at grp.max.x
          candidates = [
            # Place our left against grp's right
            { pt: Geom::Point3d.new(bb.max.x, pt.y, pt.z), ref: Geom::Point3d.new(bb.max.x, bb.center.y, bb.center.z) },
            # Place our right against grp's left
            { pt: Geom::Point3d.new(bb.min.x - @w, pt.y, pt.z), ref: Geom::Point3d.new(bb.min.x, bb.center.y, bb.center.z) },
            # Place our front against grp's back
            { pt: Geom::Point3d.new(pt.x, bb.max.y, pt.z), ref: Geom::Point3d.new(bb.center.x, bb.max.y, bb.center.z) },
            # Place our back against grp's front
            { pt: Geom::Point3d.new(pt.x, bb.min.y - @d, pt.z), ref: Geom::Point3d.new(bb.center.x, bb.min.y, bb.center.z) },
          ]

          candidates.each do |c|
            dist = pt.distance(c[:pt])
            if dist < best_dist
              best_dist = dist
              best_pt   = c[:pt]
              snap_type = :adjacent
              snap_ref  = c[:ref]
              snap_grp  = grp
            end
          end
        end

        [best_pt, snap_type, snap_ref, snap_grp]
      end

      # ── Collision detection ───────────────────────────────────

      def collides?(pt)
        model = Sketchup.active_model
        ornato_groups = collect_ornato_groups(model)

        # Our AABB, slightly shrunk to allow touching
        s = COLLISION_SHRINK.mm
        my_min = Geom::Point3d.new(pt.x + s, pt.y + s, pt.z + s)
        my_max = Geom::Point3d.new(pt.x + @w - s, pt.y + @d - s, pt.z + @h - s)

        ornato_groups.each do |grp|
          bb = grp.bounds
          oth_min = bb.min
          oth_max = bb.max

          # AABB overlap test (all 3 axes must overlap)
          overlap_x = my_min.x < oth_max.x && my_max.x > oth_min.x
          overlap_y = my_min.y < oth_max.y && my_max.y > oth_min.y
          overlap_z = my_min.z < oth_max.z && my_max.z > oth_min.z

          return true if overlap_x && overlap_y && overlap_z
        end

        false
      end

      # ── Collect all Ornato module groups in model ─────────────

      def collect_ornato_groups(model)
        model.active_entities.select do |e|
          (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
            (e.get_attribute('Ornato', 'module_type') || e.get_attribute('Ornato', 'params'))
        end
      end

      # ── Confirm placement ─────────────────────────────────────

      def confirm_placement(flags, view)
        pos_mm = [
          @position.x.to_mm,
          @position.y.to_mm,
          @position.z.to_mm,
        ]

        group = Library::ParametricEngine.create_module(@type, @params, pos_mm)

        if group
          Sketchup.status_text = "Ornato: #{group.name} inserido com sucesso"

          # Select the newly created group
          Sketchup.active_model.selection.clear
          Sketchup.active_model.selection.add(group)

          # Notify the panel
          if @controller&.respond_to?(:panel_status)
            label = Library::ParametricEngine::MODULE_TYPES[@type]&.dig(:label) || @type
            @controller.panel_status("Inserido: #{label}")
            push_model_summary
          end
        end

        # Shift+click → keep tool active for repeated placement
        if (flags & CONSTRAIN_MODIFIER_MASK) != 0
          # Reset position for next placement
          @position = nil
          @valid    = true
          update_status
          view.invalidate
        else
          # Return to select tool
          Sketchup.active_model.select_tool(nil)
        end
      end

      def cancel(view)
        Sketchup.status_text = 'Ornato: Insercao cancelada'
        @controller&.panel_status('Insercao cancelada')
        Sketchup.active_model.select_tool(nil)
        view.invalidate
      end

      # ── Push model summary to panel ───────────────────────────

      def push_model_summary
        return unless @controller&.respond_to?(:send_to_panel)

        model = Sketchup.active_model
        modules = collect_ornato_groups(model)
        total_pieces = modules.sum do |grp|
          grp.entities.count { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
        end

        data = {
          modules:  modules.length,
          pieces:   total_pieces,
          joints:   0,
          materials: 0,
        }.to_json

        @controller.send_to_panel("typeof updateSummary==='function'&&updateSummary(#{data})")
      rescue
        # Non-critical — ignore
      end

      # ── Ghost box helpers ─────────────────────────────────────

      # Returns array of 8 corners [Geom::Point3d, ...]
      # Corner index layout (bottom first):
      #   0: min  1: +X  2: +X+Y  3: +Y
      #   4: +Z   5: +X+Z  6: +X+Y+Z  7: +Y+Z
      def build_corners(origin, w, d, h)
        x, y, z = origin.x, origin.y, origin.z
        [
          Geom::Point3d.new(x,     y,     z    ),  # 0 BL front
          Geom::Point3d.new(x + w, y,     z    ),  # 1 BR front
          Geom::Point3d.new(x + w, y + d, z    ),  # 2 BR back
          Geom::Point3d.new(x,     y + d, z    ),  # 3 BL back
          Geom::Point3d.new(x,     y,     z + h),  # 4 TL front
          Geom::Point3d.new(x + w, y,     z + h),  # 5 TR front
          Geom::Point3d.new(x + w, y + d, z + h),  # 6 TR back
          Geom::Point3d.new(x,     y + d, z + h),  # 7 TL back
        ]
      end

      EDGE_PAIRS = [
        [0,1],[1,2],[2,3],[3,0],  # bottom face
        [4,5],[5,6],[6,7],[7,4],  # top face
        [0,4],[1,5],[2,6],[3,7],  # vertical edges
      ].freeze

      # The 6 faces as quads (indices into corners array)
      FACE_QUADS = [
        [0,1,5,4],  # front
        [1,2,6,5],  # right
        [2,3,7,6],  # back
        [3,0,4,7],  # left
        [4,5,6,7],  # top
        [3,2,1,0],  # bottom
      ].freeze

      def draw_ghost_faces(view, corners, color)
        view.drawing_color = color
        FACE_QUADS.each do |q|
          pts = q.map { |i| corners[i] }
          view.draw(GL_QUADS, pts)
        end
      end

      def draw_ghost_edges(view, corners, color)
        view.drawing_color = color
        view.line_width = 1
        lines = []
        EDGE_PAIRS.each do |a, b|
          lines << corners[a]
          lines << corners[b]
        end
        view.draw(GL_LINES, lines)
      end

      def draw_dimensions(view, corners)
        # Width label — bottom front midpoint
        mid_front_bot = Geom::Point3d.linear_combination(0.5, corners[0], 0.5, corners[1])
        mid_front_bot = mid_front_bot.offset(Z_AXIS, -15.mm)
        sc = view.screen_coords(mid_front_bot)
        view.draw_text(sc, format_dim(@w), color: COLOR_DIM_TXT, size: 11)

        # Height label — left front midpoint
        mid_left = Geom::Point3d.linear_combination(0.5, corners[0], 0.5, corners[4])
        sc2 = view.screen_coords(mid_left)
        view.draw_text(sc2.offset(X_AXIS, -5), format_dim(@h), color: COLOR_DIM_TXT, size: 11)

        # Depth label — left bottom midpoint (back)
        mid_depth = Geom::Point3d.linear_combination(0.5, corners[0], 0.5, corners[3])
        sc3 = view.screen_coords(mid_depth)
        view.draw_text(sc3, format_dim(@d), color: COLOR_DIM_TXT, size: 11)
      end

      def draw_snap_line(view)
        return unless @snap_ref && @position
        midpoint = Geom::Point3d.linear_combination(0.5, @position, 0.5, @snap_ref)
        view.drawing_color = COLOR_SNAP_LINE
        view.line_width = 1
        view.line_stipple = '_'
        view.draw(GL_LINES, [@position, @snap_ref])
        view.line_stipple = ''
      end

      def draw_snap_badge(view, pt)
        label = case @snapping_to
                when :adjacent then '⊞ Encostando'
                when :surface  then '⊡ Superfície'
                else                ''
                end
        return if label.empty?

        sc = view.screen_coords(pt.offset(Z_AXIS, @h + 30.mm))
        view.draw_text(sc, label, color: COLOR_SNAP_LINE, size: 11)
      end

      # ── Color helpers ─────────────────────────────────────────

      def edge_color
        return COLOR_SNAP  if @snapping_to == :adjacent
        return COLOR_INVALID if !@valid
        COLOR_EDGE
      end

      def fill_color
        return COLOR_FILL_BAD if !@valid
        COLOR_FILL
      end

      # ── Misc helpers ──────────────────────────────────────────

      def dim(key, default)
        (@params[key] || @params[key.to_s] || default).to_f
      end

      def format_dim(inches)
        "#{inches.to_mm.round}mm"
      end

      def symbolize(hash)
        return hash if hash.is_a?(Hash) && hash.keys.first.is_a?(Symbol)
        result = {}
        hash.each { |k, v| result[k.to_sym] = v }
        result
      rescue
        {}
      end

      def update_status
        type_label = Library::ParametricEngine::MODULE_TYPES[@type]&.dig(:label) || @type
        w_mm = @w.to_mm.round
        h_mm = @h.to_mm.round
        d_mm = @d.to_mm.round
        state = @valid ? 'OK' : 'COLISÃO'
        snap  = @snapping_to == :adjacent ? ' | Encostando em módulo' : ''

        Sketchup.status_text =
          "Ornato: Inserindo #{type_label} #{w_mm}×#{h_mm}×#{d_mm}mm" \
          " | #{state}#{snap}" \
          ' | Clique para confirmar | Shift+Clique para repetir | ESC para cancelar'
      end
    end # class PlacementTool
  end # module Tools
end # module Ornato
