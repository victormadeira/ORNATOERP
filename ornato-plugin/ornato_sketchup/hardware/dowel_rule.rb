# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# DowelRule — Cavilha (dowel pin) joints
#
# Alternative to MinifixRule for butt joints.
# O8mm x 15mm in both pieces (half the dowel in each).
#
# In the LATERAL: hole on side_b (face/edge)
# In the BASE/TOP: hole on the mating edge (side_a top)
#
# Also applies to lateral x partition joints.
#
# Spacing: 128mm between dowels, min 50mm from edges.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class DowelRule
      DEFAULTS = {
        diameter:          8.0,
        depth:             15.0,  # half dowel in each piece
        spacing:           128.0,
        min_edge_distance: 50.0,
        short_spacing:     96.0,  # for pieces shorter than 300mm
        short_threshold:   300.0, # use short_spacing below this
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:dowel] || {})
        @default_joint = config[:default_joint_type] || 'minifix'
      end

      # Applies when: butt joint exists AND default joint is 'dowel',
      # OR for partition joints (which always use dowels).
      def applies?(piece, joints, hardware)
        dowel_joints(piece, joints, hardware).any?
      end

      # Generate dowel holes for this piece.
      #
      # @return [Array<Hash>] array of worker hashes
      def generate(piece, joints, hardware)
        ops = []

        dowel_joints(piece, joints, hardware).each do |joint|
          partner = joint.partner_of(piece)
          joint_length = joint.contact_length
          joint_length = [piece.width, partner.width].min if joint_length <= 0

          spacing = joint_length < @cfg[:short_threshold] ? @cfg[:short_spacing] : @cfg[:spacing]
          positions = calculate_positions(joint_length, spacing)

          if piece.lateral? || piece.partition?
            # Lateral/partition: hole on side_b (edge face)
            ops.concat(generate_side_b_ops(piece, positions, partner, joint))
          else
            # Base/top/shelf: hole on side_a (mating face)
            ops.concat(generate_side_a_ops(piece, positions, partner, joint))
          end
        end

        ops
      end

      private

      # Find joints that qualify for dowels
      def dowel_joints(piece, joints, hardware)
        joints.select do |j|
          next false unless j.involves?(piece)
          next false unless j.type == :butt

          partner = j.partner_of(piece)

          # Dowel applies when default is 'dowel' for standard butt joints
          # OR always for partition joints
          is_partition_joint = piece.partition? || partner.partition?

          if is_partition_joint
            true
          elsif @default_joint == 'dowel'
            # Standard lateral <-> base/top
            roles = [piece.role, partner.role]
            (roles.include?(:lateral) && (roles.include?(:base) || roles.include?(:top)))
          else
            false
          end
        end
      end

      # Calculate positions along joint length
      def calculate_positions(length, spacing)
        min_edge = @cfg[:min_edge_distance]
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

      # Generate dowel holes on side_b (lateral / partition)
      def generate_side_b_ops(piece, positions, partner, _joint)
        ops = []
        y_offset = partner.thickness / 2.0

        positions.each_with_index do |x_pos, idx|
          ops << {
            "category"    => "hole",
            "position_x"  => x_pos,
            "position_y"  => y_offset.round(2),
            "diameter"    => @cfg[:diameter],
            "depth"       => @cfg[:depth],
            "side"        => "b",
            "tool_code"   => "broca_8mm",
            "description" => "Cavilha #{idx + 1}/#{positions.size} - #{piece.role} side_b",
          }
        end

        ops
      end

      # Generate dowel holes on side_a (base / top / shelf)
      def generate_side_a_ops(piece, positions, partner, _joint)
        ops = []
        y_offset = piece.thickness / 2.0

        positions.each_with_index do |x_pos, idx|
          ops << {
            "category"    => "hole",
            "position_x"  => x_pos,
            "position_y"  => y_offset.round(2),
            "diameter"    => @cfg[:diameter],
            "depth"       => @cfg[:depth],
            "side"        => "a",
            "tool_code"   => "broca_8mm",
            "description" => "Cavilha #{idx + 1}/#{positions.size} - #{piece.role} side_a",
          }
        end

        ops
      end
    end
  end
end
