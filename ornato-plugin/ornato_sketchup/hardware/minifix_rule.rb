# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# MinifixRule — Cam lock connector (Minifix)
#
# Applies to butt joints between lateral x base, lateral x top.
#
# In the LATERAL (support piece, side_b — external face):
#   O8mm through-hole for the minifix bolt
#
# In the BASE/TOP (receiving piece, side_a — top face):
#   O15mm x 12mm body cavity
#   O8mm x 11mm pin hole (centered inside the body)
#
# Spacing: 128mm between connectors, min 50mm from edges.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class MinifixRule
      DEFAULTS = {
        body_diameter:     15.0,
        body_depth:        12.0,
        pin_diameter:      8.0,
        pin_depth:         11.0,
        bolt_diameter:     8.0,
        bolt_depth:        18.0, # through lateral thickness
        spacing:           128.0,
        min_edge_distance: 50.0,
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:minifix] || {})
        @default_joint = config[:default_joint_type] || 'minifix'
      end

      # Applies when: butt joint between lateral and base/top,
      # AND default joint type is minifix (not dowel).
      def applies?(piece, joints, hardware)
        return false unless @default_joint == 'minifix'

        # This rule generates ops for BOTH sides of matching joints.
        # We apply it to laterals and to base/top pieces.
        return false unless piece.lateral? || piece.base? || piece.top?

        minifix_joints(piece, joints, hardware).any?
      end

      # Generate minifix holes for this piece.
      #
      # @return [Array<Hash>] array of worker hashes
      def generate(piece, joints, hardware)
        ops = []

        minifix_joints(piece, joints, hardware).each do |joint|
          partner = joint.partner_of(piece)
          joint_length = joint.contact_length
          joint_length = [piece.width, partner.width].min if joint_length <= 0

          positions = calculate_positions(joint_length)

          if piece.lateral?
            # Lateral gets the bolt through-holes on side_b
            ops.concat(generate_lateral_ops(piece, positions, partner))
          else
            # Base/top gets the body + pin holes on side_a
            ops.concat(generate_receiver_ops(piece, positions, partner))
          end
        end

        ops
      end

      private

      # Find joints that qualify for minifix
      def minifix_joints(piece, joints, hardware)
        joints.select do |j|
          next false unless j.involves?(piece)
          next false unless j.type == :butt

          partner = j.partner_of(piece)

          # Must be lateral <-> base/top
          if piece.lateral?
            partner.base? || partner.top?
          elsif piece.base? || piece.top?
            partner.lateral?
          else
            false
          end
        end
      end

      # Calculate X positions along the joint for connectors.
      # Min 50mm from each edge, then every 128mm.
      #
      # @param length [Float] contact length in mm
      # @return [Array<Float>] X positions
      def calculate_positions(length)
        min_edge = @cfg[:min_edge_distance]
        spacing  = @cfg[:spacing]

        usable = length - (2 * min_edge)
        return [length / 2.0] if usable < 0 # piece too short, single center

        n_connectors = (usable / spacing).floor + 1
        n_connectors = [n_connectors, 1].max

        if n_connectors == 1
          [length / 2.0]
        else
          actual_spacing = usable / (n_connectors - 1).to_f
          (0...n_connectors).map { |i| (min_edge + (i * actual_spacing)).round(2) }
        end
      end

      # Generate bolt through-holes in the lateral (side_b)
      def generate_lateral_ops(piece, positions, partner)
        ops = []

        # The bolt hole is drilled from the outside face (side_b)
        # at a distance from the edge equal to half the partner thickness
        # + the distance from the joint face to the minifix center
        y_offset = partner.thickness / 2.0

        positions.each_with_index do |x_pos, idx|
          ops << {
            "category"    => "hole",
            "type"        => "transfer_hole",
            "position_x"  => x_pos,
            "position_y"  => y_offset.round(2),
            "diameter"    => @cfg[:bolt_diameter],
            "depth"       => @cfg[:bolt_depth],
            "side"        => "b",
            "tool_code"   => "broca_8mm",
            "description" => "Minifix bolt #{idx + 1}/#{positions.size} - lateral",
          }
        end

        ops
      end

      # Generate body cavity + pin hole in the base/top (side_a)
      def generate_receiver_ops(piece, positions, partner)
        ops = []

        # Body and pin are drilled from the top face (side_a)
        # X position: centered on the mating edge = thickness/2 from edge
        y_offset = piece.thickness / 2.0

        positions.each_with_index do |x_pos, idx|
          # O15mm x 12mm body cavity
          ops << {
            "category"    => "hole",
            "type"        => "transfer_hole",
            "position_x"  => x_pos,
            "position_y"  => y_offset.round(2),
            "diameter"    => @cfg[:body_diameter],
            "depth"       => @cfg[:body_depth],
            "side"        => "a",
            "tool_code"   => "broca_15mm",
            "description" => "Minifix body #{idx + 1}/#{positions.size} - #{piece.role}",
          }

          # O8mm x 11mm pin hole (same center as body)
          ops << {
            "category"    => "hole",
            "position_x"  => x_pos,
            "position_y"  => y_offset.round(2),
            "diameter"    => @cfg[:pin_diameter],
            "depth"       => @cfg[:pin_depth],
            "side"        => "a",
            "tool_code"   => "broca_8mm",
            "description" => "Minifix pin #{idx + 1}/#{positions.size} - #{piece.role}",
          }
        end

        ops
      end
    end
  end
end
