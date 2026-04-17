# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# System32Rule — Shelf pin holes (Sistema 32)
#
# Applies when a lateral has adjustable shelves.
# Generates 2 vertical rows of O5mm x 12mm holes at 32mm spacing.
#
# Row positions:
#   Front row: X = 37mm from front edge
#   Rear row:  X = piece_depth - 37mm (37mm from rear edge)
#
# Y range: 37mm from bottom to 37mm from top,
#          every 32mm (European standard).
#
# Quantity per row = floor((usable_height - top_offset - bottom_offset) / spacing) + 1
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class System32Rule
      DEFAULTS = {
        hole_diameter:  5.0,
        hole_depth:     12.0,
        spacing:        32.0,
        front_offset:   37.0,  # X from front edge for front row
        rear_offset:    37.0,  # X from rear edge for rear row
        top_offset:     37.0,  # Y margin from top
        bottom_offset:  37.0,  # Y margin from bottom
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:system32] || {})
      end

      # Applies when: piece is a lateral AND module has adjustable shelves
      def applies?(piece, joints, hardware)
        return false unless piece.lateral?

        # Check if any joint partner is an adjustable shelf
        has_adjustable = joints.any? do |j|
          next false unless j.involves?(piece)
          partner = j.partner_of(piece)
          partner&.shelf? && !fixed_shelf?(partner, hardware)
        end

        # Also check explicit hardware assignment
        has_adjustable || hardware_requests_system32?(piece, hardware)
      end

      # Generate all System 32 holes for this lateral.
      #
      # @return [Array<Hash>] array of worker hashes
      def generate(piece, _joints, _hardware)
        ops = []

        # Piece dimensions: width = depth of the cabinet, height = height of lateral
        piece_depth  = piece.width  # lateral width corresponds to cabinet depth
        piece_height = piece.height

        # X positions for the two rows
        x_front = @cfg[:front_offset]
        x_rear  = piece_depth - @cfg[:rear_offset]

        # Y range
        y_start = @cfg[:bottom_offset]
        y_end   = piece_height - @cfg[:top_offset]

        # Guard: need at least one hole
        return ops if y_end <= y_start

        # Calculate number of holes
        n_holes = ((y_end - y_start) / @cfg[:spacing]).floor + 1

        row_counter = 0

        [[:front, x_front], [:rear, x_rear]].each do |row_name, x_pos|
          n_holes.times do |i|
            y_pos = y_start + (i * @cfg[:spacing])
            break if y_pos > y_end + 0.01 # floating point guard

            ops << {
              "category"    => "hole",
              "position_x"  => x_pos.round(2),
              "position_y"  => y_pos.round(2),
              "diameter"    => @cfg[:hole_diameter],
              "depth"       => @cfg[:hole_depth],
              "side"        => "a",
              "tool_code"   => "broca_5mm",
              "description" => "Sistema 32 #{row_name} - furo #{i + 1}/#{n_holes}",
            }
            row_counter += 1
          end
        end

        ops
      end

      private

      # Check if a shelf is explicitly marked as fixed (not adjustable)
      def fixed_shelf?(shelf_piece, hardware)
        hw = hardware[shelf_piece.persistent_id]
        return false unless hw.is_a?(Hash)
        hw['fixed'] == true || hw['type'] == 'fixed'
      end

      # Check if hardware dict explicitly requests system32 for this piece
      def hardware_requests_system32?(piece, hardware)
        hw = hardware[piece.persistent_id]
        return false unless hw.is_a?(Hash)
        hw['system32'] == true
      end
    end
  end
end
