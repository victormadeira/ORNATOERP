# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# HingeRule — Dobradica 35mm cup boring
#
# Applies when a lateral has a door joint (overlay).
# Generates:
#   - O35mm x 12.5mm cup boring at 22.5mm from front edge
#   - 2x O2.5mm x 10mm pilot holes at +/-24mm from cup center
#
# Number of hinges by door height:
#   <= 600mm  -> 2 hinges
#   <= 1200mm -> 3 hinges
#   <= 1800mm -> 4 hinges
#   > 1800mm  -> 5 hinges
#
# Positions: 100mm from top/bottom, evenly spaced between.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class HingeRule
      DEFAULTS = {
        cup_diameter:      35.0,
        cup_depth:         12.5,
        pilot_diameter:    2.5,
        pilot_depth:       10.0,
        pilot_spacing:     24.0,   # mm from cup center (along Y axis)
        edge_offset:       22.5,   # mm from front edge (X position)
        top_bottom_offset: 100.0,  # mm from top and bottom edges
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:hinge] || {})
      end

      # Applies when: piece is a lateral AND has a door partner via overlay joint
      #
      # @param piece [Ornato::Hardware::Piece]
      # @param joints [Array<Ornato::Hardware::Joint>]
      # @param hardware [Hash]
      # @return [Boolean]
      def applies?(piece, joints, _hardware)
        return false unless piece.lateral?

        door_joints(piece, joints).any?
      end

      # Generate all hinge machining operations for this lateral.
      #
      # @param piece [Ornato::Hardware::Piece]
      # @param joints [Array<Ornato::Hardware::Joint>]
      # @param hardware [Hash]
      # @return [Array<Hash>] array of worker hashes
      def generate(piece, joints, _hardware)
        ops = []

        door_joints(piece, joints).each do |joint|
          door = joint.partner_of(piece)
          door_height = door.height

          n_hinges  = hinge_count(door_height)
          positions = calculate_positions(door_height, n_hinges)

          # Determine X offset: from front edge of lateral
          # If door is on the right side, offset from right edge instead
          x_offset = determine_x_offset(piece, joint)

          positions.each_with_index do |y_pos, idx|
            # Main cup boring — O35mm x 12.5mm
            ops << {
              "category"    => "hole",
              "type"        => "transfer_hole",
              "position_x"  => x_offset,
              "position_y"  => y_pos.round(2),
              "diameter"    => @cfg[:cup_diameter],
              "depth"       => @cfg[:cup_depth],
              "side"        => "a",
              "tool_code"   => "broca_35mm",
              "description" => "Dobradica #{idx + 1}/#{n_hinges} - cup boring",
            }

            # Pilot hole 1 — below cup center (Y - 24mm)
            ops << {
              "category"    => "hole",
              "position_x"  => x_offset,
              "position_y"  => (y_pos - @cfg[:pilot_spacing]).round(2),
              "diameter"    => @cfg[:pilot_diameter],
              "depth"       => @cfg[:pilot_depth],
              "side"        => "a",
              "tool_code"   => "broca_2.5mm",
              "description" => "Dobradica #{idx + 1}/#{n_hinges} - piloto inferior",
            }

            # Pilot hole 2 — above cup center (Y + 24mm)
            ops << {
              "category"    => "hole",
              "position_x"  => x_offset,
              "position_y"  => (y_pos + @cfg[:pilot_spacing]).round(2),
              "diameter"    => @cfg[:pilot_diameter],
              "depth"       => @cfg[:pilot_depth],
              "side"        => "a",
              "tool_code"   => "broca_2.5mm",
              "description" => "Dobradica #{idx + 1}/#{n_hinges} - piloto superior",
            }
          end
        end

        ops
      end

      private

      # Find all door joints for this piece
      def door_joints(piece, joints)
        joints.select do |j|
          j.involves?(piece) && j.type == :overlay &&
            (j.partner_of(piece)&.door? || j.partner_of(piece)&.role == :door)
        end
      end

      # Determine number of hinges based on door height
      def hinge_count(door_height)
        case door_height
        when 0..600   then 2
        when 601..1200 then 3
        when 1201..1800 then 4
        else 5
        end
      end

      # Calculate Y positions of hinges along the lateral height.
      # First and last are at top_bottom_offset from edges,
      # intermediate ones are evenly distributed.
      #
      # @param height [Float] door height in mm
      # @param count [Integer] number of hinges
      # @return [Array<Float>] Y positions from bottom of lateral
      def calculate_positions(height, count)
        return [height / 2.0] if count == 1

        top_pos    = @cfg[:top_bottom_offset]
        bottom_pos = height - @cfg[:top_bottom_offset]

        return [top_pos, bottom_pos] if count == 2

        # Evenly space intermediate hinges
        step = (bottom_pos - top_pos).to_f / (count - 1)
        (0...count).map { |i| (top_pos + (i * step)).round(2) }
      end

      # Determine X offset for the cup boring.
      # Standard is 22.5mm from the front edge.
      # If the door is hung on the back side, mirror the offset.
      def determine_x_offset(piece, joint)
        face = joint.face_of(piece)
        if face == :back || face == :right
          # Door on back edge — offset from back
          piece.height - @cfg[:edge_offset]
        else
          @cfg[:edge_offset]
        end
      end
    end
  end
end
