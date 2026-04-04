# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# GasPistonRule — Furos para pistao a gas (porta basculante)
#
# Applies when a lateral has an overlay joint with POR_BAS
# (basculante / flip-up door).
#
# Generates:
#   In the LATERAL:
#     - 2x O10mm x 12mm holes for piston bracket mounting
#     - Positioned at hinge_offset from top edge
#
#   In the DOOR (POR_BAS):
#     - 2x O10mm x 12mm holes for piston arm mounting
#     - Positioned at arm_offset from bottom edge of door
#
# Standard gas piston: Hafele Free Flap / Blum Aventos HF
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class GasPistonRule
      DEFAULTS = {
        bracket_diameter:  10.0,
        bracket_depth:     12.0,
        arm_diameter:      10.0,
        arm_depth:         12.0,
        # Position on lateral (from top edge)
        lateral_offset_y:  80.0,   # mm from top of lateral
        lateral_offset_x:  37.0,   # mm from front edge
        # Position on door (from bottom edge)
        door_offset_y:     80.0,   # mm from bottom of door
        door_offset_x:     37.0,   # mm from hinge edge
        # Number of pistons per door
        piston_count:      2,
        # Spacing between piston pairs (if 2 pistons)
        piston_spacing:    0,      # 0 = one on each side
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:gas_piston] || {})
      end

      # Applies to laterals with basculante door joints,
      # or to basculante doors themselves
      def applies?(piece, joints, _hardware)
        piston_joints(piece, joints).any?
      end

      def generate(piece, joints, _hardware)
        ops = []

        piston_joints(piece, joints).each do |joint|
          partner = joint.partner_of(piece)

          if piece.lateral?
            ops.concat(generate_lateral_ops(piece, partner))
          elsif basculante?(piece)
            ops.concat(generate_door_ops(piece, partner))
          end
        end

        ops
      end

      private

      def piston_joints(piece, joints)
        joints.select do |j|
          next false unless j.involves?(piece)
          next false unless j.type == :overlay

          partner = j.partner_of(piece)

          if piece.lateral?
            basculante?(partner)
          elsif basculante?(piece)
            partner.lateral?
          else
            false
          end
        end
      end

      def basculante?(piece)
        return false unless piece.entity.respond_to?(:name)
        name = (piece.entity.name || '').upcase
        name.include?('POR_BAS') || name.include?('BASCULANTE')
      end

      # Bracket holes on the lateral (inside face)
      def generate_lateral_ops(piece, door)
        ops = []

        x_pos = @cfg[:lateral_offset_x]
        y_pos = piece.height - @cfg[:lateral_offset_y]

        # Left piston bracket
        ops << {
          "category"    => "hole",
          "type"        => "blind_hole",
          "position_x"  => x_pos.round(2),
          "position_y"  => y_pos.round(2),
          "diameter"    => @cfg[:bracket_diameter],
          "depth"       => @cfg[:bracket_depth],
          "side"        => "a",
          "tool_code"   => "f_pistao",
          "description" => "Pistao bracket - lateral",
        }

        # Second bracket (below first, for vertical arm travel)
        ops << {
          "category"    => "hole",
          "type"        => "blind_hole",
          "position_x"  => x_pos.round(2),
          "position_y"  => (y_pos - 32.0).round(2),
          "diameter"    => @cfg[:bracket_diameter],
          "depth"       => @cfg[:bracket_depth],
          "side"        => "a",
          "tool_code"   => "f_pistao",
          "description" => "Pistao bracket inferior - lateral",
        }

        ops
      end

      # Arm holes on the door (inside face)
      def generate_door_ops(piece, lateral)
        ops = []

        x_pos = @cfg[:door_offset_x]
        y_pos = @cfg[:door_offset_y]

        # Piston arm mounting hole
        ops << {
          "category"    => "hole",
          "type"        => "blind_hole",
          "position_x"  => x_pos.round(2),
          "position_y"  => y_pos.round(2),
          "diameter"    => @cfg[:arm_diameter],
          "depth"       => @cfg[:arm_depth],
          "side"        => "a",
          "tool_code"   => "f_pistao",
          "description" => "Pistao arm - porta basculante",
        }

        # Second arm hole (for arm pivot)
        ops << {
          "category"    => "hole",
          "type"        => "blind_hole",
          "position_x"  => x_pos.round(2),
          "position_y"  => (y_pos + 32.0).round(2),
          "diameter"    => @cfg[:arm_diameter],
          "depth"       => @cfg[:arm_depth],
          "side"        => "a",
          "tool_code"   => "f_pistao",
          "description" => "Pistao arm pivot - porta basculante",
        }

        ops
      end
    end
  end
end
