# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# MiterRule — Chanfro 45 graus para juncoes de moldura (meia-esquadria)
#
# Applies when two moldura (MOL) pieces meet at a miter joint
# (edge-to-edge at approximately 45 degrees).
#
# Generates:
#   In BOTH pieces:
#     - usi_chanfro_45: 45-degree chamfer milling along the miter edge
#
# Also supports variable-angle chamfers via piece attribute:
#   ornato.miter_angle = 30 (degrees)
#
# Standard tool: 45-degree chamfer bit, 38mm diameter
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class MiterRule
      DEFAULTS = {
        chamfer_angle:    45.0,
        tool_diameter:    38.0,
        tool_code:        'usi_chanfro_45',
        inset:            0,      # mm inset from ends (0 = full length)
      }.freeze

      def initialize(config)
        @cfg = DEFAULTS.merge(config[:miter] || {})
      end

      # Applies when piece is a moldura with a miter joint
      def applies?(piece, joints, _hardware)
        return false unless moldura?(piece)
        miter_joints(piece, joints).any?
      end

      def generate(piece, joints, _hardware)
        ops = []

        miter_joints(piece, joints).each do |joint|
          partner = joint.partner_of(piece)
          angle = read_angle(piece, partner)
          face  = joint.face_of(piece)

          # Determine which edge gets the chamfer
          chamfer_face = determine_chamfer_face(piece, face)

          ops << {
            "category"     => "milling",
            "type"         => "chamfer",
            "angle"        => angle,
            "start_x"      => @cfg[:inset].round(2),
            "start_y"      => 0,
            "end_x"        => (piece.width - @cfg[:inset]).round(2),
            "end_y"        => 0,
            "depth"        => piece.thickness.round(2),
            "width_tool"   => @cfg[:tool_diameter],
            "side"         => chamfer_face,
            "tool_code"    => angle == 45.0 ? 'usi_chanfro_45' : 'usi_chanfro_var',
            "description"  => "Chanfro #{angle.round(1)} graus - moldura meia-esquadria",
            "partner_name" => partner.entity.respond_to?(:name) ? partner.entity.name : '',
          }
        end

        ops
      end

      private

      def moldura?(piece)
        return false unless piece.entity.respond_to?(:name)
        name = (piece.entity.name || '').upcase
        name.include?('MOL') || name.include?('MOLDURA') ||
          piece.role == :moldura || piece.role == :trim
      end

      def miter_joints(piece, joints)
        joints.select do |j|
          next false unless j.involves?(piece)
          next false unless j.type == :miter

          partner = j.partner_of(piece)
          moldura?(partner)
        end
      end

      def read_angle(piece, partner)
        # Check piece-level override first
        angle = nil
        [piece, partner].each do |p|
          next unless p.entity.respond_to?(:get_attribute)
          a = p.entity.get_attribute('ornato', 'miter_angle', nil)
          angle = a.to_f if a
        end
        angle || @cfg[:chamfer_angle]
      end

      def determine_chamfer_face(piece, face)
        case face
        when :left   then 'left'
        when :right  then 'right'
        when :top    then 'top'
        when :bottom then 'bottom'
        when :front  then 'front'
        when :back   then 'rear'
        else 'left' # default
        end
      end
    end
  end
end
