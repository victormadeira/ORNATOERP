# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# PassThroughRule — Furos passantes para passa-fio / cable management
#
# Applies when a piece has the attribute ornato.passafio = true.
# Generates a through-hole for cable passthrough.
#
# Configurable via piece attributes:
#   passafio_diameter — hole diameter (default: 60mm)
#   passafio_x       — X position on piece (mm)
#   passafio_y       — Y position on piece (mm)
#   passafio_face    — top or bottom (default: top)
#
# Common diameters: 35mm, 60mm, 80mm
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class PassThroughRule
      DEFAULTS = {
        diameter:  60.0,
        face:      'top',
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:passthrough] || {})
      end

      # Applies when piece has passafio attribute
      def applies?(piece, _joints, _hardware)
        return false unless piece.entity.respond_to?(:get_attribute)

        val = piece.entity.get_attribute('ornato', 'passafio', nil)
        val.to_s.downcase == 'true'
      end

      def generate(piece, _joints, _hardware)
        ops = []

        diameter = read_attr(piece, 'passafio_diameter', @cfg[:diameter]).to_f
        x_pos    = read_attr(piece, 'passafio_x', piece.width / 2.0).to_f
        y_pos    = read_attr(piece, 'passafio_y', piece.height / 2.0).to_f
        face     = read_attr(piece, 'passafio_face', @cfg[:face]).to_s

        # Validate position is within piece bounds
        x_pos = [[x_pos, diameter / 2.0].max, piece.width  - diameter / 2.0].min
        y_pos = [[y_pos, diameter / 2.0].max, piece.height - diameter / 2.0].min

        tool_code = case diameter.to_i
                    when 35 then 'f_35mm_passafio'
                    when 60 then 'f_60mm_passafio'
                    when 80 then 'f_80mm_passafio'
                    else "f_#{diameter.to_i}mm_passafio"
                    end

        ops << {
          "category"    => "hole",
          "type"        => "through_hole",
          "position_x"  => x_pos.round(2),
          "position_y"  => y_pos.round(2),
          "diameter"    => diameter,
          "depth"       => 0,
          "through"     => true,
          "side"        => face == 'bottom' ? 'b' : 'a',
          "tool_code"   => tool_code,
          "description" => "Passa-fio #{diameter.to_i}mm",
        }

        # Support multiple passa-fios via numbered attributes
        (2..5).each do |n|
          x_n = piece.entity.get_attribute('ornato', "passafio_#{n}_x", nil)
          break unless x_n

          y_n = piece.entity.get_attribute('ornato', "passafio_#{n}_y", piece.height / 2.0).to_f
          d_n = piece.entity.get_attribute('ornato', "passafio_#{n}_diameter", diameter).to_f

          x_n = x_n.to_f
          x_n = [[x_n, d_n / 2.0].max, piece.width  - d_n / 2.0].min
          y_n = [[y_n, d_n / 2.0].max, piece.height - d_n / 2.0].min

          ops << {
            "category"    => "hole",
            "type"        => "through_hole",
            "position_x"  => x_n.round(2),
            "position_y"  => y_n.round(2),
            "diameter"    => d_n,
            "depth"       => 0,
            "through"     => true,
            "side"        => face == 'bottom' ? 'b' : 'a',
            "tool_code"   => "f_#{d_n.to_i}mm_passafio",
            "description" => "Passa-fio #{n} - #{d_n.to_i}mm",
          }
        end

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
