# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# LabelOverlay — Adds descriptive 3D text labels near hardware
# visuals to identify operation type and dimensions.
#
# Labels are Sketchup::Text objects positioned near each
# machining point. They are placed on the "Ornato_Ferragens"
# layer and can be toggled with the hardware visuals.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Visual
    class LabelOverlay
      LAYER_NAME = HardwareVisualizer::LAYER_NAME
      LABEL_PREFIX = 'ornato_lbl_'
      LABEL_OFFSET_Z = 5.0 # mm above the surface

      # ─── Add labels for all operations on a piece ────
      # Creates 3D text labels near each machining operation.
      #
      # @param piece_group [Sketchup::Group|ComponentInstance] the piece entity
      # @param workers [Hash] { op_key => operation_hash }
      def add_labels(piece_group, workers)
        model = Sketchup.active_model
        layer = ensure_layer(model)

        bb = piece_group.bounds
        piece_depth = bb.depth  # thickness in inches
        piece_t_mm = piece_depth.to_mm

        ents = piece_group.is_a?(Sketchup::ComponentInstance) ? piece_group.definition.entities : piece_group.entities

        idx = 0
        workers.each do |op_key, op|
          category = (op['category'] || op[:category]).to_s
          side = (op['side'] || op[:side] || 'a').to_s

          label_text = format_label(op, category, piece_t_mm)
          next if label_text.nil? || label_text.empty?

          point = label_point(op, category, side, piece_depth)
          next unless point

          # Create text annotation
          text = ents.add_text(label_text, point)
          if text
            text.layer = layer
            # Set leader arrow to point at the operation
            text.leader_type = Sketchup::Text::LEADER_NONE
          end

          idx += 1
        end
      end

      # ─── Clear all labels from a group ───────────────
      # Removes all Text entities on the Ornato_Ferragens layer.
      #
      # @param group [Sketchup::Group|ComponentInstance]
      def clear_labels(group)
        ents = group.is_a?(Sketchup::ComponentInstance) ? group.definition.entities : group.entities

        to_delete = ents.grep(Sketchup::Text).select do |t|
          t.layer && t.layer.name == LAYER_NAME
        end
        to_delete.each { |t| t.erase! }

        # Recurse into sub-groups
        ents.grep(Sketchup::Group).each { |g| clear_labels(g) }
        ents.grep(Sketchup::ComponentInstance).each { |ci| clear_labels(ci) }
      end

      private

      # ─── Format label text for an operation ──────────

      def format_label(op, category, piece_thickness)
        case category
        when 'hole'
          diameter = to_f(op, 'diameter')
          depth = to_f(op, 'depth')
          through = (depth >= piece_thickness - 0.5) ? ' pass.' : ''
          "#{format_dim(diameter)}x#{format_dim(depth)}mm#{through}"
        when 'groove'
          width = to_f(op, 'width_line')
          width = to_f(op, 'width') if width <= 0
          depth = to_f(op, 'depth')
          "#{format_dim(width)}x#{format_dim(depth)}mm canal"
        when 'pocket'
          w = to_f(op, 'width')
          h = to_f(op, 'height')
          depth = to_f(op, 'depth')
          "#{format_dim(w)}x#{format_dim(h)}x#{format_dim(depth)}mm rebaixo"
        else
          nil
        end
      end

      # ─── Calculate label position ────────────────────

      def label_point(op, category, side, piece_depth)
        offset_z = LABEL_OFFSET_Z.mm

        case category
        when 'hole'
          x = to_f(op, 'position_x').mm
          y = to_f(op, 'position_y').mm
          z = side == 'b' ? -offset_z : piece_depth + offset_z
          Geom::Point3d.new(x, y, z)

        when 'groove'
          start_data = op['pos_start_for_line'] || op[:pos_start_for_line] || {}
          end_data = op['pos_end_for_line'] || op[:pos_end_for_line] || {}
          sx = to_f(start_data, 'x').mm
          sy = to_f(start_data, 'y').mm
          ex = to_f(end_data, 'x').mm
          ey = to_f(end_data, 'y').mm
          # Place label at midpoint of groove
          mx = (sx + ex) / 2.0
          my = (sy + ey) / 2.0
          z = side == 'b' ? -offset_z : piece_depth + offset_z
          Geom::Point3d.new(mx, my, z)

        when 'pocket'
          x = to_f(op, 'position_x').mm
          y = to_f(op, 'position_y').mm
          w = to_f(op, 'width').mm
          h = to_f(op, 'height').mm
          # Place label at center of pocket
          cx = x + w / 2.0
          cy = y + h / 2.0
          z = side == 'b' ? -offset_z : piece_depth + offset_z
          Geom::Point3d.new(cx, cy, z)

        else
          nil
        end
      end

      # ─── Helpers ─────────────────────────────────────

      def format_dim(val)
        val == val.to_i.to_f ? val.to_i.to_s : format('%.1f', val)
      end

      def to_f(hash, key)
        val = hash[key] || hash[key.to_sym]
        val ? val.to_f : 0.0
      end

      def ensure_layer(model)
        layer = model.layers[LAYER_NAME]
        unless layer
          layer = model.layers.add(LAYER_NAME)
          layer.visible = true
        end
        layer
      end
    end
  end
end
