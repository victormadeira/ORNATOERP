# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# ConfirmatRule — Europarafuso (Confirmat screw) joints
#
# Alternative to MinifixRule for butt joints when configured.
# Uses a single screw instead of cam lock:
#
# In the BASE/TOP (receiving piece — face):
#   O8mm through-hole (pre-drilling for confirmat head)
#
# In the LATERAL (support piece — edge):
#   O5mm x 45mm blind hole (body of confirmat screw)
#
# Also supports thick panels (25mm+):
#   Face: O8mm through
#   Edge: O7mm x 50mm
#
# Spacing: same logic as minifix (128mm default, 50mm from edges)
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class ConfirmatRule
      DEFAULTS = {
        face_diameter:       8.0,
        face_depth:          0,       # 0 = through (passante)
        edge_diameter:       5.0,
        edge_depth:          45.0,
        # Thick panel overrides (25mm+)
        thick_threshold:     25.0,
        thick_edge_diameter: 7.0,
        thick_edge_depth:    50.0,
        spacing:             128.0,
        min_edge_distance:   50.0,
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:confirmat] || {})
        @default_joint = config[:default_joint_type] || 'minifix'
      end

      # Applies when default joint is 'confirmat' AND piece is in a butt joint
      def applies?(piece, joints, _hardware)
        return false unless @default_joint == 'confirmat'
        return false unless piece.lateral? || piece.base? || piece.top? || piece.partition?

        confirmat_joints(piece, joints).any?
      end

      def generate(piece, joints, _hardware)
        ops = []

        confirmat_joints(piece, joints).each do |joint|
          partner = joint.partner_of(piece)
          joint_length = joint.contact_length
          joint_length = [piece.width, partner.width].min if joint_length <= 0

          positions = calculate_positions(joint_length)

          if piece.lateral? || piece.partition?
            # Edge piece gets blind holes on the edge
            ops.concat(generate_edge_ops(piece, positions, partner))
          else
            # Face piece (base/top) gets through-holes
            ops.concat(generate_face_ops(piece, positions, partner))
          end
        end

        ops
      end

      private

      def confirmat_joints(piece, joints)
        joints.select do |j|
          next false unless j.involves?(piece)
          next false unless j.type == :butt

          partner = j.partner_of(piece)

          # Check for piece-level override
          override = read_piece_override(piece) || read_piece_override(partner)
          if override
            next override == 'confirmat'
          end

          roles = [piece.role, partner.role]
          (roles.include?(:lateral) || roles.include?(:partition)) &&
            (roles.include?(:base) || roles.include?(:top))
        end
      end

      def read_piece_override(piece)
        return nil unless piece.entity.respond_to?(:get_attribute)
        piece.entity.get_attribute('ornato', 'force_joint', nil)
      end

      def calculate_positions(length)
        min_edge = @cfg[:min_edge_distance]
        spacing  = @cfg[:spacing]
        usable = length - (2 * min_edge)
        return [length / 2.0] if usable < 0

        n = (usable / spacing).floor + 1
        n = [n, 1].max

        if n == 1
          [length / 2.0]
        else
          actual_spacing = usable / (n - 1).to_f
          (0...n).map { |i| (min_edge + (i * actual_spacing)).round(2) }
        end
      end

      # Through-holes on the face (base/top)
      def generate_face_ops(piece, positions, partner)
        ops = []
        y_offset = piece.thickness / 2.0

        positions.each_with_index do |x_pos, idx|
          ops << {
            "category"    => "hole",
            "type"        => "through_hole",
            "position_x"  => x_pos,
            "position_y"  => y_offset.round(2),
            "diameter"    => @cfg[:face_diameter],
            "depth"       => @cfg[:face_depth],
            "through"     => true,
            "side"        => "a",
            "tool_code"   => "f_8mm_confirmat",
            "description" => "Confirmat pre-furo #{idx + 1}/#{positions.size} - #{piece.role}",
          }
        end
        ops
      end

      # Blind holes on the edge (lateral/partition)
      def generate_edge_ops(piece, positions, partner)
        ops = []
        y_offset = partner.thickness / 2.0

        thick = piece.thickness >= @cfg[:thick_threshold]
        diameter = thick ? @cfg[:thick_edge_diameter] : @cfg[:edge_diameter]
        depth    = thick ? @cfg[:thick_edge_depth]    : @cfg[:edge_depth]

        positions.each_with_index do |x_pos, idx|
          ops << {
            "category"    => "hole",
            "type"        => "blind_hole",
            "position_x"  => x_pos,
            "position_y"  => y_offset.round(2),
            "diameter"    => diameter,
            "depth"       => depth,
            "side"        => "b",
            "tool_code"   => "f_#{diameter.to_i}mm_confirmat",
            "description" => "Confirmat #{idx + 1}/#{positions.size} - #{piece.role} edge",
          }
        end
        ops
      end
    end
  end
end
