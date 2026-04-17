# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# BackPanelRule — Groove/rebate for back panel
#
# Applies to laterals and base when a back panel is present.
# Generates a groove (Transfer_vertical_saw_cut) running the
# full length of the piece.
#
# Groove specs:
#   Width:  back_panel_thickness + 1mm (default 4mm for 3mm panel)
#   Depth:  8mm
#   Offset: back_panel_thickness + 5mm from rear edge
#
# On LATERAL: horizontal groove (full X length, fixed Y near back)
# On BASE:    horizontal groove (full X length, fixed Y near back)
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class BackPanelRule
      DEFAULTS = {
        groove_width:     4.0,   # mm (back panel thickness + 1mm)
        groove_depth:     8.0,   # mm
        offset_from_back: 10.0,  # mm from rear edge to groove center
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:back_panel] || {})
      end

      # Applies when: piece is lateral or base AND the module has a back panel
      def applies?(piece, joints, _hardware)
        return false unless piece.lateral? || piece.base? || piece.top?

        has_back_panel?(piece, joints)
      end

      # Generate the groove for the back panel.
      #
      # @return [Array<Hash>] array of worker hashes
      def generate(piece, joints, hardware)
        ops = []

        back = find_back_panel(piece, joints)
        return ops unless back

        # Determine groove parameters
        groove_width = determine_groove_width(back, hardware)
        groove_depth = @cfg[:groove_depth]

        if piece.lateral?
          ops.concat(generate_lateral_groove(piece, groove_width, groove_depth))
        else
          # Base or top piece
          ops.concat(generate_base_groove(piece, groove_width, groove_depth))
        end

        ops
      end

      private

      # Check if the module contains a back panel
      def has_back_panel?(piece, joints)
        joints.any? do |j|
          j.involves?(piece) &&
            (j.partner_of(piece)&.back_panel? || j.type == :dado)
        end
      end

      # Find the back panel piece in the joints
      def find_back_panel(piece, joints)
        joint = joints.find do |j|
          j.involves?(piece) && j.partner_of(piece)&.back_panel?
        end
        joint&.partner_of(piece)
      end

      # Determine groove width from back panel thickness
      def determine_groove_width(back_panel, hardware)
        if back_panel
          # Groove width = panel thickness + 1mm tolerance
          back_panel.thickness + 1.0
        else
          @cfg[:groove_width]
        end
      end

      # Generate groove on lateral piece.
      # The groove runs horizontally along the full height of the lateral,
      # at a fixed X position near the rear edge.
      #
      # For the CNC, lateral lies flat: X = depth direction, Y = height direction.
      # Groove is at X position near rear edge, running full Y length.
      def generate_lateral_groove(piece, groove_width, groove_depth)
        # Y position of groove: near the rear edge of the lateral
        # piece.width = cabinet depth
        y_pos = piece.width - @cfg[:offset_from_back]

        [
          {
            "category"          => "Transfer_vertical_saw_cut",
            "tool_code"         => "fresa_#{groove_width.to_i}mm",
            "pos_start_for_line" => {
              "position_x" => 0.0,
              "position_y" => y_pos.round(2),
            },
            "pos_end_for_line"   => {
              "position_x" => piece.height.round(2),
              "position_y" => y_pos.round(2),
            },
            "width_line"        => groove_width,
            "depth"             => groove_depth,
            "side"              => "a",
            "description"       => "Rebaixo fundo - lateral (#{groove_width}x#{groove_depth}mm)",
          }
        ]
      end

      # Generate groove on base/top piece.
      # Groove runs along the full width (X direction) at a fixed Y near rear.
      def generate_base_groove(piece, groove_width, groove_depth)
        # Y position: near the rear edge
        y_pos = piece.height - @cfg[:offset_from_back]

        # For base piece: X runs full width, Y is fixed
        [
          {
            "category"          => "Transfer_vertical_saw_cut",
            "tool_code"         => "fresa_#{groove_width.to_i}mm",
            "pos_start_for_line" => {
              "position_x" => 0.0,
              "position_y" => y_pos.round(2),
            },
            "pos_end_for_line"   => {
              "position_x" => piece.width.round(2),
              "position_y" => y_pos.round(2),
            },
            "width_line"        => groove_width,
            "depth"             => groove_depth,
            "side"              => "a",
            "description"       => "Rebaixo fundo - #{piece.role} (#{groove_width}x#{groove_depth}mm)",
          }
        ]
      end
    end
  end
end
