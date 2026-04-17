# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# HandleRule — Door/drawer handle holes
#
# 2x O5mm through-holes for handle mounting screws.
# Spacing configurable: 128, 160, 192, 256, 320mm.
#
# Door position:
#   Y = 100mm from top edge
#   X = 37mm from hinge-opposite edge
#
# Drawer position:
#   Y = centered vertically
#   X = centered horizontally
#
# Depth = piece thickness + 1mm (through-hole)
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class HandleRule
      DEFAULTS = {
        hole_diameter:    5.0,
        default_spacing:  160.0,  # mm between the two holes
        door_y_offset:    100.0,  # mm from top edge (door)
        door_x_offset:    37.0,   # mm from edge opposite to hinges
        drawer_centered:  true,
        through_extra:    1.0,    # extra depth beyond thickness
      }.freeze

      VALID_SPACINGS = [128, 160, 192, 256, 320].freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:handle] || {})
      end

      # Applies when: piece is a door or drawer_front,
      # and has a handle assigned (or by default all doors/drawers get handles).
      def applies?(piece, _joints, hardware)
        return false unless piece.door? || piece.drawer_front? || piece.drawer?

        # Check if explicitly excluded
        hw = hardware[piece.persistent_id]
        return false if hw.is_a?(Hash) && hw['handle'] == false

        true
      end

      # Generate handle through-holes.
      #
      # @return [Array<Hash>] array of worker hashes
      def generate(piece, joints, hardware)
        ops = []

        spacing = determine_spacing(piece, hardware)
        depth   = piece.thickness + @cfg[:through_extra]

        if piece.door?
          ops.concat(generate_door_handle(piece, joints, spacing, depth))
        else
          ops.concat(generate_drawer_handle(piece, spacing, depth))
        end

        ops
      end

      private

      # Determine handle hole spacing from hardware config or default
      def determine_spacing(piece, hardware)
        hw = hardware[piece.persistent_id]
        if hw.is_a?(Hash) && hw['handle_spacing']
          hw['handle_spacing'].to_f
        else
          @cfg[:default_spacing]
        end
      end

      # Generate handle holes for a door.
      # Y = near top edge (100mm from top)
      # X = 37mm from the edge opposite to hinge side
      def generate_door_handle(piece, joints, spacing, depth)
        ops = []

        # Determine hinge side to place handle on the opposite side
        hinge_side = detect_hinge_side(piece, joints)

        # X position: offset from the edge opposite to hinges
        if hinge_side == :left
          x_center = piece.width - @cfg[:door_x_offset]
        else
          x_center = @cfg[:door_x_offset]
        end

        # Y position: from the top of the door
        y_center = piece.height - @cfg[:door_y_offset]

        # Two holes centered around y_center, separated by spacing
        half_spacing = spacing / 2.0

        ops << make_hole(x_center, y_center - half_spacing, depth, 1, spacing)
        ops << make_hole(x_center, y_center + half_spacing, depth, 2, spacing)

        ops
      end

      # Generate handle holes for a drawer front.
      # Both X and Y centered on the piece.
      def generate_drawer_handle(piece, spacing, depth)
        ops = []

        x_center = piece.width / 2.0
        y_center = piece.height / 2.0
        half_spacing = spacing / 2.0

        # Horizontal handle: holes separated along X axis
        ops << make_hole(x_center - half_spacing, y_center, depth, 1, spacing)
        ops << make_hole(x_center + half_spacing, y_center, depth, 2, spacing)

        ops
      end

      def make_hole(x, y, depth, index, spacing)
        {
          "category"    => "hole",
          "position_x"  => x.round(2),
          "position_y"  => y.round(2),
          "diameter"    => @cfg[:hole_diameter],
          "depth"       => depth.round(2),
          "side"        => "a",
          "tool_code"   => "broca_5mm",
          "description" => "Puxador furo #{index}/2 (espac. #{spacing.to_i}mm)",
        }
      end

      # Detect which side the hinges are on by checking overlay joints
      def detect_hinge_side(piece, joints)
        # Find the lateral that this door is attached to
        door_joint = joints.find do |j|
          j.involves?(piece) && j.type == :overlay
        end

        return :left unless door_joint

        lateral = door_joint.partner_of(piece)
        return :left unless lateral

        # If the lateral origin X is less than the door origin X,
        # hinges are on the left side
        if lateral.origin[0] < piece.origin[0]
          :left
        else
          :right
        end
      end
    end
  end
end
