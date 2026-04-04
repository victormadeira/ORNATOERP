# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# LEDChannelRule — Canal para fita LED embutida
#
# Applies when a piece has the attribute ornato.led_channel = true.
# Generates a linear groove (r_led) on the specified face.
#
# Configurable via piece attributes:
#   led_width    — groove width (default: 10mm)
#   led_depth    — groove depth (default: 8mm)
#   led_position — front, rear, center (default: front)
#   led_offset   — custom distance from edge (overrides position)
#   led_face     — top or bottom (default: top)
#
# The groove runs the full length of the piece.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class LEDChannelRule
      DEFAULTS = {
        width:    10.0,
        depth:    8.0,
        position: 'front', # front, rear, center
        face:     'top',
        offset:   nil,      # custom offset overrides position
        inset:    5.0,      # mm inset from piece ends
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:led_channel] || {})
      end

      # Applies when piece has led_channel attribute
      def applies?(piece, _joints, _hardware)
        return false unless piece.entity.respond_to?(:get_attribute)

        val = piece.entity.get_attribute('ornato', 'led_channel', nil) ||
              piece.entity.get_attribute('ornato', 'led', nil)
        val.to_s.downcase == 'true'
      end

      def generate(piece, _joints, _hardware)
        ops = []

        width    = read_attr(piece, 'led_width',    @cfg[:width]).to_f
        depth    = read_attr(piece, 'led_depth',    @cfg[:depth]).to_f
        position = read_attr(piece, 'led_position', @cfg[:position]).to_s
        face     = read_attr(piece, 'led_face',     @cfg[:face]).to_s
        offset   = read_attr(piece, 'led_offset',   @cfg[:offset])
        inset    = @cfg[:inset]

        # Calculate Y position (across the width)
        y_pos = if offset
                  offset.to_f
                else
                  case position
                  when 'front'  then width / 2.0 + 5.0  # near front edge
                  when 'rear'   then piece.width - (width / 2.0) - 5.0
                  when 'center' then piece.width / 2.0
                  else piece.width / 2.0
                  end
                end

        # Ensure depth doesn't exceed half the piece thickness
        safe_depth = [depth, piece.thickness * 0.5].min

        ops << {
          "category"    => "groove",
          "type"        => "linear_groove",
          "start_x"     => inset.round(2),
          "start_y"     => y_pos.round(2),
          "end_x"       => (piece.width - inset).round(2),
          "end_y"       => y_pos.round(2),
          "width"        => width,
          "depth"       => safe_depth.round(2),
          "side"        => face == 'bottom' ? 'b' : 'a',
          "tool_code"   => "r_led",
          "description" => "Canal LED #{width}x#{safe_depth}mm - posicao #{position}",
        }

        ops
      end

      private

      def read_attr(piece, attr_name, default)
        return default unless piece.entity.respond_to?(:get_attribute)
        piece.entity.get_attribute('ornato', attr_name, default)
      end
    end
  end
end
