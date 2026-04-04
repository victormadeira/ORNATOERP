# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# SlidingDoorRule — Canais de trilho para portas de correr
#
# Applies when a module contains POR_COR (porta de correr).
# Generates:
#   In the TOPO (top panel):
#     - r_trilho_sup: groove for upper sliding rail
#     - Width: 3-5mm, Depth: 8mm
#
#   In the BASE (bottom panel):
#     - r_trilho_inf: groove for lower guide rail
#     - Width: 3-5mm, Depth: 5mm
#
# For 2-door setups: generates 2 parallel grooves (offset)
# For 3-door setups: generates 3 parallel grooves
#
# Standard: Hettich SlideLine, Hafele Slido, Grass Tiomos
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class SlidingDoorRule
      DEFAULTS = {
        top_groove_width:    5.0,
        top_groove_depth:    8.0,
        bottom_groove_width: 5.0,
        bottom_groove_depth: 5.0,
        # Offset from rear edge for first track
        rear_offset:         15.0,
        # Spacing between parallel tracks
        track_spacing:       18.0,
        # Inset from side edges
        side_inset:          2.0,
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:sliding_door] || {})
      end

      # Applies to top/base pieces when module has sliding doors
      def applies?(piece, joints, _hardware)
        return false unless piece.top? || piece.base?

        # Check if any sibling piece is a sliding door
        sliding_door_joints(piece, joints).any?
      end

      def generate(piece, joints, _hardware)
        ops = []
        doors = sliding_door_joints(piece, joints)
        n_tracks = [doors.length, 1].max

        # Read override from module attributes
        if piece.entity.respond_to?(:parent) && piece.entity.parent.respond_to?(:get_attribute)
          override = piece.entity.parent.get_attribute('ornato', 'sliding_tracks', nil)
          n_tracks = override.to_i if override
        end

        n_tracks.times do |track_idx|
          y_pos = @cfg[:rear_offset] + (track_idx * @cfg[:track_spacing])

          if piece.top?
            ops << generate_top_groove(piece, y_pos, track_idx, n_tracks)
          else
            ops << generate_bottom_groove(piece, y_pos, track_idx, n_tracks)
          end
        end

        ops
      end

      private

      def sliding_door_joints(piece, joints)
        joints.select do |j|
          next false unless j.involves?(piece)
          partner = j.partner_of(piece)
          sliding_door?(partner)
        end
      end

      def sliding_door?(piece)
        return false unless piece.entity.respond_to?(:name)
        name = (piece.entity.name || '').upcase
        name.include?('POR_COR') || name.include?('PORTA_COR') || name.include?('SLIDING')
      end

      def generate_top_groove(piece, y_pos, track_idx, total)
        {
          "category"    => "groove",
          "type"        => "linear_groove",
          "start_x"     => @cfg[:side_inset].round(2),
          "start_y"     => y_pos.round(2),
          "end_x"       => (piece.width - @cfg[:side_inset]).round(2),
          "end_y"       => y_pos.round(2),
          "width"       => @cfg[:top_groove_width],
          "depth"       => @cfg[:top_groove_depth],
          "side"        => "b",  # bottom face of top panel
          "tool_code"   => "r_trilho_sup",
          "description" => "Trilho superior #{track_idx + 1}/#{total}",
        }
      end

      def generate_bottom_groove(piece, y_pos, track_idx, total)
        {
          "category"    => "groove",
          "type"        => "linear_groove",
          "start_x"     => @cfg[:side_inset].round(2),
          "start_y"     => y_pos.round(2),
          "end_x"       => (piece.width - @cfg[:side_inset]).round(2),
          "end_y"       => y_pos.round(2),
          "width"       => @cfg[:bottom_groove_width],
          "depth"       => @cfg[:bottom_groove_depth],
          "side"        => "a",  # top face of bottom panel
          "tool_code"   => "r_trilho_inf",
          "description" => "Trilho inferior #{track_idx + 1}/#{total}",
        }
      end
    end
  end
end
