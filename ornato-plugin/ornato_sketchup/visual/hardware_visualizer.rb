# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# HardwareVisualizer — Places 3D visual representations of
# machining operations (holes, grooves, pockets) in the model.
#
# All visuals are placed on the "Ornato_Ferragens" layer/tag
# and can be toggled on/off independently.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Visual
    class HardwareVisualizer
      LAYER_NAME = 'Ornato_Ferragens'
      VIZ_PREFIX = 'ornato_viz_'
      CIRCLE_SEGMENTS = 24

      # Color palette for different hardware types (hex => [r, g, b])
      COLORS = {
        hinge_cup:    [245, 158, 11],   # gold #f59e0b
        hinge_pilot:  [253, 230, 138],  # light yellow #fde68a
        minifix_body: [59, 130, 246],   # blue #3b82f6
        minifix_pin:  [147, 197, 253],  # light blue #93c5fd
        dowel:        [146, 64, 14],    # brown #92400e
        system32:     [156, 163, 175],  # gray #9ca3af
        handle:       [34, 197, 94],    # green #22c55e
        slide:        [249, 115, 22],   # orange #f97316
        groove:       [239, 68, 68],    # red #ef4444
        pocket:       [168, 85, 247],   # purple #a855f7
        custom:       [209, 213, 219],  # light gray #d1d5db
      }.freeze

      ALPHA = 0.7 # semi-transparent

      # ─── Main entry point ────────────────────────────
      # Iterates all pieces in a machining hash and creates
      # visual 3D components for each operation.
      #
      # @param module_group [Sketchup::Group] the furniture module group
      # @param machining_hash [Hash] piece_id => { "workers" => { op_key => op_hash } }
      def visualize_module(module_group, machining_hash)
        model = Sketchup.active_model
        ensure_layer(model)

        model.start_operation('Ornato: Visualizar Ferragens', true)
        begin
          # Map persistent_id to entity for lookup
          piece_map = build_piece_map(module_group)

          machining_hash.each do |piece_id, piece_data|
            workers = piece_data['workers'] || piece_data[:workers] || {}
            next if workers.empty?

            piece_entity = piece_map[piece_id.to_s]
            next unless piece_entity

            # Clear previous visuals for this piece
            clear_visuals(piece_entity)

            # Create visuals for each operation
            visualize_piece(piece_entity, workers)
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          puts "Ornato HardwareVisualizer error: #{e.message}"
          puts e.backtrace.first(5).join("\n")
          raise
        end
      end

      # ─── Visualize a single piece ────────────────────
      # @param piece_group [Sketchup::Group|ComponentInstance] the piece entity
      # @param workers [Hash] { op_key => operation_hash }
      def visualize_piece(piece_group, workers)
        model = Sketchup.active_model
        layer = ensure_layer(model)

        bb = piece_group.bounds
        piece_w = bb.width.to_mm
        piece_h = bb.height.to_mm
        piece_t = bb.depth.to_mm

        # Sort dimensions to detect thickness
        dims = [piece_w, piece_h, piece_t].sort
        thickness = dims[0]

        idx = 0
        workers.each do |op_key, op|
          category = (op['category'] || op[:category]).to_s

          case category
          when 'hole'
            create_hole_from_op(piece_group, op, idx, layer, thickness)
          when 'groove'
            create_groove_from_op(piece_group, op, idx, layer, thickness)
          when 'pocket'
            create_pocket_from_op(piece_group, op, idx, layer, thickness)
          end

          idx += 1
        end
      end

      # ─── Create a hole visual ────────────────────────
      # Creates a cylinder (circle + pushpull) representing a drill hole.
      #
      # @param parent [Sketchup::Group] parent piece entity
      # @param x [Float] X position in mm from piece origin
      # @param y [Float] Y position in mm from piece origin
      # @param diameter [Float] hole diameter in mm
      # @param depth [Float] hole depth in mm
      # @param side [String] "a" (top/Z+) or "b" (bottom/Z-)
      # @param color [Array<Integer>] [r, g, b] color
      # @param label [String] descriptive label
      # @return [Sketchup::Group] the visual group
      def create_hole_visual(parent, x, y, diameter, depth, side, color, label)
        model = Sketchup.active_model
        layer = ensure_layer(model)
        radius_mm = diameter / 2.0

        # Convert mm to inches (SketchUp internal unit)
        radius = radius_mm.mm
        depth_in = depth.mm
        x_in = x.mm
        y_in = y.mm

        bb = parent.bounds
        piece_depth = bb.depth # thickness in inches

        # Create group inside parent entities
        ents = parent.is_a?(Sketchup::ComponentInstance) ? parent.definition.entities : parent.entities
        grp = ents.add_group
        grp.name = "#{VIZ_PREFIX}hole_#{label}"
        grp.layer = layer

        # Draw circle on the appropriate face
        center = if side == 'b'
                   Geom::Point3d.new(x_in, y_in, 0)
                 else
                   Geom::Point3d.new(x_in, y_in, piece_depth)
                 end

        normal = if side == 'b'
                   Geom::Vector3d.new(0, 0, -1)
                 else
                   Geom::Vector3d.new(0, 0, 1)
                 end

        circle = grp.entities.add_circle(center, normal, radius, CIRCLE_SEGMENTS)
        face = grp.entities.add_face(circle)

        # Push/pull inward (negative direction into the piece)
        if face
          push_depth = [depth_in, piece_depth].min
          # Ensure we push into the piece
          if side == 'b'
            face.pushpull(push_depth)
          else
            face.pushpull(-push_depth)
          end
        end

        # Apply semi-transparent material
        mat = find_or_create_material(model, color, label)
        grp.entities.grep(Sketchup::Face).each { |f| f.material = mat; f.back_material = mat }

        grp
      end

      # ─── Create a groove visual ──────────────────────
      # Creates a thin rectangular box representing a groove/channel.
      #
      # @param parent [Sketchup::Group] parent piece entity
      # @param start_pos [Array] [x, y] start position in mm
      # @param end_pos [Array] [x, y] end position in mm
      # @param width [Float] groove width in mm
      # @param depth [Float] groove depth in mm
      # @param side [String] "a" or "b"
      # @param color [Array<Integer>] [r, g, b] color
      def create_groove_visual(parent, start_pos, end_pos, width, depth, side, color)
        model = Sketchup.active_model
        layer = ensure_layer(model)

        bb = parent.bounds
        piece_depth = bb.depth

        sx = start_pos[0].mm
        sy = start_pos[1].mm
        ex = end_pos[0].mm
        ey = end_pos[1].mm
        w = width.mm
        d = [depth.mm, piece_depth].min

        # Calculate groove direction and perpendicular offset
        dx = ex - sx
        dy = ey - sy
        length = Math.sqrt(dx * dx + dy * dy)
        return if length < 0.001

        # Normalize direction
        nx = dx / length
        ny = dy / length
        # Perpendicular
        px = -ny
        py = nx

        half_w = w / 2.0

        # Four corners of the groove rectangle
        z_top = side == 'b' ? 0 : piece_depth

        p1 = Geom::Point3d.new(sx + px * half_w, sy + py * half_w, z_top)
        p2 = Geom::Point3d.new(ex + px * half_w, ey + py * half_w, z_top)
        p3 = Geom::Point3d.new(ex - px * half_w, ey - py * half_w, z_top)
        p4 = Geom::Point3d.new(sx - px * half_w, sy - py * half_w, z_top)

        ents = parent.is_a?(Sketchup::ComponentInstance) ? parent.definition.entities : parent.entities
        grp = ents.add_group
        grp.name = "#{VIZ_PREFIX}groove_#{start_pos.join('_')}"
        grp.layer = layer

        face = grp.entities.add_face(p1, p2, p3, p4)
        if face
          if side == 'b'
            face.pushpull(d)
          else
            face.pushpull(-d)
          end
        end

        mat = find_or_create_material(model, color, 'groove')
        grp.entities.grep(Sketchup::Face).each { |f| f.material = mat; f.back_material = mat }

        grp
      end

      # ─── Create a pocket visual ──────────────────────
      # Creates a rectangular pocket (rebaixo) visual.
      #
      # @param parent [Sketchup::Group] parent piece entity
      # @param x [Float] X position in mm (center or corner)
      # @param y [Float] Y position in mm
      # @param w [Float] pocket width in mm
      # @param h [Float] pocket height in mm
      # @param depth [Float] pocket depth in mm
      # @param side [String] "a" or "b"
      # @param color [Array<Integer>] [r, g, b] color
      def create_pocket_visual(parent, x, y, w, h, depth, side, color)
        model = Sketchup.active_model
        layer = ensure_layer(model)

        bb = parent.bounds
        piece_depth = bb.depth

        x_in = x.mm
        y_in = y.mm
        w_in = w.mm
        h_in = h.mm
        d = [depth.mm, piece_depth].min

        z_top = side == 'b' ? 0 : piece_depth

        p1 = Geom::Point3d.new(x_in, y_in, z_top)
        p2 = Geom::Point3d.new(x_in + w_in, y_in, z_top)
        p3 = Geom::Point3d.new(x_in + w_in, y_in + h_in, z_top)
        p4 = Geom::Point3d.new(x_in, y_in + h_in, z_top)

        ents = parent.is_a?(Sketchup::ComponentInstance) ? parent.definition.entities : parent.entities
        grp = ents.add_group
        grp.name = "#{VIZ_PREFIX}pocket_#{x}_#{y}"
        grp.layer = layer

        face = grp.entities.add_face(p1, p2, p3, p4)
        if face
          if side == 'b'
            face.pushpull(d)
          else
            face.pushpull(-d)
          end
        end

        mat = find_or_create_material(model, color, 'pocket')
        grp.entities.grep(Sketchup::Face).each { |f| f.material = mat; f.back_material = mat }

        grp
      end

      # ─── Clear all visuals from a group ──────────────
      # Removes all groups whose name starts with VIZ_PREFIX.
      #
      # @param group [Sketchup::Group|ComponentInstance]
      def clear_visuals(group)
        ents = group.is_a?(Sketchup::ComponentInstance) ? group.definition.entities : group.entities
        to_delete = ents.grep(Sketchup::Group).select { |g| g.name.to_s.start_with?(VIZ_PREFIX) }
        to_delete.each { |g| g.erase! }

        # Recurse into sub-groups (pieces inside module)
        ents.grep(Sketchup::Group).each { |g| clear_visuals(g) }
        ents.grep(Sketchup::ComponentInstance).each { |ci| clear_visuals(ci) }
      end

      # ─── Toggle visibility of hardware layer ─────────
      # @param visible [Boolean] true to show, false to hide
      def toggle_visibility(visible)
        model = Sketchup.active_model
        layer = model.layers[LAYER_NAME]
        return unless layer

        layer.visible = visible
      end

      private

      # ─── Operation-based creators ────────────────────

      def create_hole_from_op(piece_group, op, idx, layer, thickness)
        x = to_f(op, 'position_x')
        y = to_f(op, 'position_y')
        diameter = to_f(op, 'diameter')
        depth_val = to_f(op, 'depth')
        side = (op['side'] || op[:side] || 'a').to_s
        tool_code = (op['tool_code'] || op[:tool_code] || '').to_s

        return if diameter <= 0 || depth_val <= 0

        color_key = classify_hole_color(diameter, depth_val, thickness, tool_code)
        color = COLORS[color_key] || COLORS[:custom]
        label = "#{color_key}_#{idx}"

        create_hole_visual(piece_group, x, y, diameter, depth_val, side, color, label)
      end

      def create_groove_from_op(piece_group, op, idx, layer, thickness)
        start_data = op['pos_start_for_line'] || op[:pos_start_for_line] || {}
        end_data = op['pos_end_for_line'] || op[:pos_end_for_line] || {}

        sx = to_f(start_data, 'x')
        sy = to_f(start_data, 'y')
        ex = to_f(end_data, 'x')
        ey = to_f(end_data, 'y')
        width = to_f(op, 'width_line') > 0 ? to_f(op, 'width_line') : to_f(op, 'width')
        depth_val = to_f(op, 'depth')
        side = (op['side'] || op[:side] || 'a').to_s

        return if width <= 0 || depth_val <= 0

        create_groove_visual(piece_group, [sx, sy], [ex, ey], width, depth_val, side, COLORS[:groove])
      end

      def create_pocket_from_op(piece_group, op, idx, layer, thickness)
        x = to_f(op, 'position_x')
        y = to_f(op, 'position_y')
        w = to_f(op, 'width')
        h = to_f(op, 'height')
        depth_val = to_f(op, 'depth')
        side = (op['side'] || op[:side] || 'a').to_s

        return if w <= 0 || h <= 0 || depth_val <= 0

        create_pocket_visual(piece_group, x, y, w, h, depth_val, side, COLORS[:pocket])
      end

      # ─── Classify hole type by diameter ──────────────

      def classify_hole_color(diameter, depth, thickness, tool_code)
        case
        when diameter >= 34.5 && diameter <= 35.5
          :hinge_cup
        when diameter >= 14.5 && diameter <= 15.5
          :minifix_body
        when diameter >= 7.5 && diameter <= 8.5 && tool_code.to_s =~ /minifix|mfx/i
          :minifix_pin
        when diameter >= 7.5 && diameter <= 8.5
          :dowel
        when diameter >= 4.5 && diameter <= 5.5 && depth >= (thickness - 1)
          :handle  # through-hole
        when diameter >= 4.5 && diameter <= 5.5
          :system32
        when diameter >= 3.5 && diameter <= 4.5
          :slide
        when diameter >= 2.0 && diameter <= 3.0
          :hinge_pilot
        else
          :custom
        end
      end

      # ─── Build piece ID map ──────────────────────────

      def build_piece_map(module_group)
        map = {}
        ents = module_group.is_a?(Sketchup::ComponentInstance) ? module_group.definition.entities : module_group.entities

        ents.each do |ent|
          next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)

          pid = ent.get_attribute('ornato', 'persistent_id', nil) ||
                ent.get_attribute('ornato', 'upm_persistent_id', nil) ||
                "piece_#{ent.entityID}"

          map[pid.to_s] = ent
        end

        map
      end

      # ─── Ensure layer exists ─────────────────────────

      def ensure_layer(model)
        layer = model.layers[LAYER_NAME]
        unless layer
          layer = model.layers.add(LAYER_NAME)
          layer.visible = true
        end
        layer
      end

      # ─── Material management ─────────────────────────

      def find_or_create_material(model, color_rgb, suffix)
        mat_name = "ornato_viz_#{suffix}"
        mat = model.materials[mat_name]
        return mat if mat

        mat = model.materials.add(mat_name)
        mat.color = Sketchup::Color.new(color_rgb[0], color_rgb[1], color_rgb[2])
        mat.alpha = ALPHA
        mat
      end

      # ─── Helpers ─────────────────────────────────────

      def to_f(hash, key)
        val = hash[key] || hash[key.to_sym]
        val ? val.to_f : 0.0
      end
    end
  end
end
