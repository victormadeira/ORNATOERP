# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# ShelfRule — Fixed shelf support holes
#
# Applies to laterals that have fixed (non-adjustable) shelves.
# Generates 2x O8mm holes per side at the exact Y position of
# each fixed shelf.
#
# Hole positions per shelf:
#   Front hole: X = 37mm from front edge
#   Rear hole:  X = piece_depth - 37mm from rear edge
#   Y = shelf_position (center of shelf thickness)
#
# This is distinct from System32Rule which handles adjustable
# shelves with a full column of 5mm holes.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class ShelfRule
      DEFAULTS = {
        hole_diameter:  8.0,
        hole_depth:     15.0,
        front_offset:   37.0,  # X from front edge
        rear_offset:    37.0,  # X from rear edge
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:shelf] || config[:dowel] || {})
        # Use dowel diameter/depth if shelf-specific not set
        @cfg[:hole_diameter] ||= 8.0
        @cfg[:hole_depth]    ||= 15.0
      end

      # Applies when: piece is a lateral AND has fixed shelf joints
      def applies?(piece, joints, hardware)
        return false unless piece.lateral?

        fixed_shelf_joints(piece, joints, hardware).any?
      end

      # Generate shelf support holes for this lateral.
      #
      # @return [Array<Hash>] array of worker hashes
      def generate(piece, joints, hardware)
        ops = []

        piece_depth = piece.width # lateral width = cabinet depth

        x_front = @cfg[:front_offset]
        x_rear  = piece_depth - @cfg[:rear_offset]

        fixed_shelf_joints(piece, joints, hardware).each_with_index do |joint, shelf_idx|
          shelf = joint.partner_of(piece)

          # Y position: where the shelf meets the lateral
          y_pos = calculate_shelf_y(piece, shelf)

          # Front support hole
          ops << {
            "category"    => "hole",
            "position_x"  => x_front.round(2),
            "position_y"  => y_pos.round(2),
            "diameter"    => @cfg[:hole_diameter],
            "depth"       => @cfg[:hole_depth],
            "side"        => "a",
            "tool_code"   => "broca_8mm",
            "description" => "Prateleira fixa #{shelf_idx + 1} - suporte frontal",
          }

          # Rear support hole
          ops << {
            "category"    => "hole",
            "position_x"  => x_rear.round(2),
            "position_y"  => y_pos.round(2),
            "diameter"    => @cfg[:hole_diameter],
            "depth"       => @cfg[:hole_depth],
            "side"        => "a",
            "tool_code"   => "broca_8mm",
            "description" => "Prateleira fixa #{shelf_idx + 1} - suporte traseiro",
          }
        end

        ops
      end

      private

      # Find fixed shelf joints for this lateral
      def fixed_shelf_joints(piece, joints, hardware)
        joints.select do |j|
          next false unless j.involves?(piece)
          partner = j.partner_of(piece)
          next false unless partner&.shelf?

          # Only fixed shelves — adjustable ones are handled by System32Rule
          is_fixed?(partner, hardware)
        end
      end

      # Check if a shelf is explicitly marked as fixed
      def is_fixed?(shelf_piece, hardware)
        hw = hardware[shelf_piece.persistent_id]
        if hw.is_a?(Hash)
          return true if hw['fixed'] == true || hw['type'] == 'fixed'
          return false if hw['type'] == 'adjustable'
        end

        # Default: if shelf has a specific position attribute, treat as fixed
        entity = shelf_piece.entity
        if entity
          fixed_attr = entity.get_attribute('ornato', 'fixed', nil)
          return fixed_attr == true || fixed_attr == 'true' unless fixed_attr.nil?
        end

        # Default behavior: shelves are adjustable (System32) unless marked fixed
        false
      end

      # Calculate the Y position where the shelf meets the lateral.
      # This is the vertical distance from the bottom of the lateral
      # to the center of the shelf thickness.
      def calculate_shelf_y(lateral, shelf)
        lateral_bottom = lateral.origin[1]
        shelf_bottom   = shelf.origin[1]

        y_relative = shelf_bottom - lateral_bottom
        # Center of shelf thickness
        y_relative + (shelf.thickness / 2.0)
      end
    end
  end
end
