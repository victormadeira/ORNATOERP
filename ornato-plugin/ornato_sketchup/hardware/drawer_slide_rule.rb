# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# DrawerSlideRule — Drawer slide mounting holes
#
# Applies to lateral pieces when a drawer is present.
# Generates 3-4x O4mm holes at specific positions along the
# lateral, based on the slide length.
#
# Hole patterns by slide length:
#   350mm: 3 holes at 37, 212, 350mm
#   400mm: 3 holes at 37, 237, 400mm
#   450mm: 3 holes at 37, 260, 450mm
#   500mm: 4 holes at 37, 200, 350, 500mm
#   550mm: 4 holes at 37, 200, 400, 550mm
#   600mm: 4 holes at 37, 200, 400, 600mm
#
# Y position is calculated from the drawer vertical position
# in the module.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class DrawerSlideRule
      DEFAULTS = {
        hole_diameter: 4.0,
        hole_depth:    12.0,
        # X positions along the lateral depth for each slide length
        patterns: {
          350 => [37, 212, 350],
          400 => [37, 237, 400],
          450 => [37, 260, 450],
          500 => [37, 200, 350, 500],
          550 => [37, 200, 400, 550],
          600 => [37, 200, 400, 600],
        },
        # Vertical offset from drawer bottom to slide center
        slide_y_offset: 20.0,
      }.freeze

      def initialize(config)
        raw = config[:drawer_slide] || {}
        @cfg = DEFAULTS.merge(raw)

        # Merge pattern overrides: convert string keys to integers
        if raw[:patterns]
          @cfg[:patterns] = DEFAULTS[:patterns].dup
          raw[:patterns].each do |k, v|
            int_key = k.to_s.gsub(/\D/, '').to_i
            @cfg[:patterns][int_key] = v if int_key > 0
          end
        end
      end

      # Applies when: piece is a lateral AND has drawer joints
      def applies?(piece, joints, hardware)
        return false unless piece.lateral?

        drawer_joints(piece, joints).any?
      end

      # Generate slide mounting holes on the lateral.
      #
      # @return [Array<Hash>] array of worker hashes
      def generate(piece, joints, hardware)
        ops = []

        drawer_joints(piece, joints).each_with_index do |joint, drawer_idx|
          drawer = joint.partner_of(piece)
          slide_length = determine_slide_length(piece, drawer, hardware)
          pattern = find_pattern(slide_length)

          # Y position: where the drawer sits relative to the lateral
          y_base = calculate_drawer_y(piece, drawer) + @cfg[:slide_y_offset]

          pattern.each_with_index do |x_pos, hole_idx|
            ops << {
              "category"    => "hole",
              "position_x"  => x_pos.to_f.round(2),
              "position_y"  => y_base.round(2),
              "diameter"    => @cfg[:hole_diameter],
              "depth"       => @cfg[:hole_depth],
              "side"        => "a",
              "tool_code"   => "broca_4mm",
              "description" => "Corredica gaveta #{drawer_idx + 1} - furo #{hole_idx + 1}/#{pattern.size} (#{slide_length}mm)",
            }
          end
        end

        ops
      end

      private

      # Find all drawer-related joints for this lateral
      def drawer_joints(piece, joints)
        joints.select do |j|
          j.involves?(piece) &&
            (j.partner_of(piece)&.drawer? || j.partner_of(piece)&.drawer_front?)
        end
      end

      # Determine slide length from hardware config or by matching
      # available patterns to the cabinet depth.
      def determine_slide_length(piece, drawer, hardware)
        # Check explicit assignment
        hw = hardware[drawer.persistent_id] || hardware[piece.persistent_id]
        if hw.is_a?(Hash) && hw['slide_length']
          return hw['slide_length'].to_i
        end

        # Auto-detect: use cabinet depth (lateral width) to pick closest pattern
        cabinet_depth = piece.width
        available = @cfg[:patterns].keys.sort

        # Pick the largest slide that fits (with 30mm clearance for face)
        usable = cabinet_depth - 30
        best = available.select { |len| len <= usable }.max

        best || available.min || 400
      end

      # Find the drill pattern for a given slide length.
      # Falls back to nearest available.
      def find_pattern(slide_length)
        @cfg[:patterns][slide_length] || find_nearest_pattern(slide_length)
      end

      def find_nearest_pattern(target)
        available = @cfg[:patterns].keys.sort
        nearest = available.min_by { |k| (k - target).abs }
        @cfg[:patterns][nearest] || [37, 200, target]
      end

      # Calculate Y position of the drawer relative to the lateral.
      # Uses the origin Z difference between drawer and lateral.
      def calculate_drawer_y(lateral, drawer)
        # Drawer bottom Y relative to lateral bottom
        lateral_bottom = lateral.origin[1]
        drawer_bottom  = drawer.origin[1]

        y_relative = drawer_bottom - lateral_bottom
        [y_relative, 0].max
      end
    end
  end
end
