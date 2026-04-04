# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# RulesEngine — Orchestrator for hardware machining rules
#
# Iterates all pieces in a module, detects joints and hardware
# assignments, then applies each rule to generate CNC workers.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    class RulesEngine
      # Rules are applied in order — earlier rules may influence later ones
      RULE_CLASSES = [
        HingeRule,
        GasPistonRule,
        SlidingDoorRule,
        System32Rule,
        MinifixRule,
        ConfirmatRule,
        DowelRule,
        HandleRule,
        DrawerSlideRule,
        BackPanelRule,
        ShelfRule,
        MiterRule,
        LEDChannelRule,
        PassThroughRule,
      ].freeze

      attr_reader :config, :rules

      # @param config [Hash] merged configuration from Ornato::Config
      def initialize(config)
        @config = config
        @rules = RULE_CLASSES.map { |klass| klass.new(config) }
      end

      # Process a complete furniture module (SketchUp group) and return
      # machining operations for every piece inside it.
      #
      # @param module_group [Sketchup::Group] the top-level furniture module
      # @return [Hash] piece_id => { "workers" => { op_key => worker_hash } }
      def process_module(module_group)
        pieces   = detect_pieces(module_group)
        joints   = detect_joints(pieces)
        hardware = detect_hardware(module_group)

        machining = {}

        pieces.each do |piece|
          workers    = {}
          op_counter = 0

          @rules.each do |rule|
            next unless rule.applies?(piece, joints, hardware)

            new_ops = rule.generate(piece, joints, hardware)
            new_ops.each do |op|
              key = op_key(rule, op_counter)
              workers[key] = op
              op_counter += 1
            end
          end

          # Only include pieces that actually have machining
          machining[piece.persistent_id] = { "workers" => workers } unless workers.empty?
        end

        machining
      end

      # Process a single piece (for manual / incremental use)
      #
      # @param piece [Ornato::Piece] the piece to process
      # @param joints [Array<Ornato::Joint>] all joints in the module
      # @param hardware [Hash] hardware assignments from the module
      # @return [Hash] { "workers" => { ... } }
      def process_piece(piece, joints, hardware)
        workers    = {}
        op_counter = 0

        @rules.each do |rule|
          next unless rule.applies?(piece, joints, hardware)

          new_ops = rule.generate(piece, joints, hardware)
          new_ops.each do |op|
            key = op_key(rule, op_counter)
            workers[key] = op
            op_counter += 1
          end
        end

        { "workers" => workers }
      end

      private

      # Generate a unique key for each operation
      def op_key(rule, counter)
        prefix = rule.class.name.split('::').last
                      .gsub(/Rule$/, '')
                      .gsub(/([A-Z])/, '_\1')
                      .downcase
                      .sub(/^_/, '')
        "#{prefix}_#{counter}"
      end

      # Extract all Ornato::Piece objects from a module group.
      # Delegates to the core ModelAnalyzer / PieceDetector.
      def detect_pieces(module_group)
        if defined?(Ornato::Core::PieceDetector)
          Ornato::Core::PieceDetector.new(@config).detect(module_group)
        else
          extract_pieces_simple(module_group)
        end
      end

      # Detect joints (contact relationships) between pieces.
      # Delegates to core JointDetector.
      def detect_joints(pieces)
        if defined?(Ornato::Core::JointDetector)
          Ornato::Core::JointDetector.new(@config).detect(pieces)
        else
          detect_joints_simple(pieces)
        end
      end

      # Read hardware assignments stored as SketchUp attributes on the group.
      def detect_hardware(module_group)
        hw = {}
        dict = module_group.attribute_dictionary('ornato_hardware')
        return hw unless dict

        dict.each_pair do |key, value|
          hw[key] = value.is_a?(String) ? JSON.parse(value) : value
        rescue JSON::ParserError
          hw[key] = value
        end
        hw
      end

      # ── Fallback piece extraction when core detectors are not loaded ──

      def extract_pieces_simple(group)
        pieces = []
        group.entities.each do |ent|
          next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)

          piece = piece_from_entity(ent)
          pieces << piece if piece
        end
        pieces
      end

      def piece_from_entity(ent)
        bb = ent.bounds
        return nil if bb.empty?

        dims = [bb.width.to_mm, bb.height.to_mm, bb.depth.to_mm].sort
        thickness = dims[0]
        return nil if thickness < 3 || thickness > 50 # not a panel

        Piece.new(
          entity: ent,
          width: dims[2],
          height: dims[1],
          thickness: thickness,
          role: read_role(ent),
          persistent_id: read_persistent_id(ent),
          origin: [bb.min.x.to_mm, bb.min.y.to_mm, bb.min.z.to_mm]
        )
      end

      def read_role(ent)
        role = ent.get_attribute('ornato', 'role', nil)
        role ? role.to_sym : guess_role(ent)
      end

      def read_persistent_id(ent)
        ent.get_attribute('ornato', 'persistent_id', nil) ||
          ent.get_attribute('ornato', 'upm_persistent_id', nil) ||
          "piece_#{ent.entityID}"
      end

      def guess_role(ent)
        name = (ent.name || '').downcase
        case name
        when /lateral|side/    then :lateral
        when /base|bottom/     then :base
        when /topo|top/        then :top
        when /porta|door/      then :door
        when /gaveta|drawer/   then :drawer
        when /fundo|back/      then :back_panel
        when /prat|shelf/      then :shelf
        when /divis|partition/ then :partition
        when /frente|front/    then :drawer_front
        else :unknown
        end
      end

      # Simple proximity-based joint detection fallback
      def detect_joints_simple(pieces)
        tolerance = @config[:tolerance] || 0.5
        joints = []

        pieces.combination(2).each do |a, b|
          contact = find_contact(a, b, tolerance)
          next unless contact

          joints << Joint.new(
            piece_a: a,
            piece_b: b,
            type: contact[:type],
            face_a: contact[:face_a],
            face_b: contact[:face_b],
            contact_length: contact[:contact_length]
          )
        end

        joints
      end

      def find_contact(a, b, tolerance)
        # Check each face pair for proximity within tolerance
        a_faces = bounding_faces(a)
        b_faces = bounding_faces(b)

        a_faces.each do |af_name, af_pos|
          b_faces.each do |bf_name, bf_pos|
            next unless same_axis?(af_name, bf_name)
            dist = (af_pos - bf_pos).abs
            next unless dist <= a.thickness + tolerance

            overlap = calculate_overlap(a, b, af_name)
            next unless overlap > tolerance

            return {
              type: classify_joint_type(af_name, bf_name, a, b),
              face_a: af_name,
              face_b: bf_name,
              contact_length: overlap,
            }
          end
        end

        nil
      end

      def bounding_faces(piece)
        ox, oy, oz = piece.origin
        {
          left:   ox,
          right:  ox + piece.width,
          bottom: oy,
          top:    oy + piece.height,
          front:  oz,
          back:   oz + piece.thickness,
        }
      end

      def same_axis?(f1, f2)
        axis_map = { left: :x, right: :x, bottom: :y, top: :y, front: :z, back: :z }
        axis_map[f1] == axis_map[f2]
      end

      def calculate_overlap(a, b, face_name)
        case face_name
        when :left, :right
          y_overlap = [a.origin[1] + a.height, b.origin[1] + b.height].min -
                      [a.origin[1], b.origin[1]].max
          [y_overlap, 0].max
        when :top, :bottom
          x_overlap = [a.origin[0] + a.width, b.origin[0] + b.width].min -
                      [a.origin[0], b.origin[0]].max
          [x_overlap, 0].max
        when :front, :back
          x_overlap = [a.origin[0] + a.width, b.origin[0] + b.width].min -
                      [a.origin[0], b.origin[0]].max
          [x_overlap, 0].max
        else
          0
        end
      end

      def classify_joint_type(_face_a, _face_b, piece_a, piece_b)
        roles = [piece_a.role, piece_b.role].sort
        if roles.include?(:door)
          :overlay
        elsif roles.include?(:back_panel)
          :dado
        else
          :butt
        end
      end
    end

    # ══════════════════════════════════════════════════════
    # Data structures used by the rules engine
    # ══════════════════════════════════════════════════════

    class Piece
      attr_accessor :entity, :width, :height, :thickness, :role,
                    :persistent_id, :origin

      def initialize(entity:, width:, height:, thickness:, role:, persistent_id:, origin: [0,0,0])
        @entity        = entity
        @width         = width.to_f
        @height        = height.to_f
        @thickness     = thickness.to_f
        @role          = role
        @persistent_id = persistent_id
        @origin        = origin
      end

      def lateral?;      role == :lateral; end
      def base?;         role == :base; end
      def top?;          role == :top; end
      def door?;         role == :door; end
      def drawer?;       role == :drawer; end
      def drawer_front?; role == :drawer_front; end
      def back_panel?;   role == :back_panel; end
      def shelf?;        role == :shelf; end
      def partition?;    role == :partition; end
    end

    class Joint
      attr_accessor :piece_a, :piece_b, :type, :face_a, :face_b, :contact_length

      def initialize(piece_a:, piece_b:, type:, face_a: nil, face_b: nil, contact_length: 0)
        @piece_a        = piece_a
        @piece_b        = piece_b
        @type           = type # :butt, :overlay, :dado, :miter
        @face_a         = face_a
        @face_b         = face_b
        @contact_length = contact_length.to_f
      end

      # Check if this joint involves a specific piece
      def involves?(piece)
        piece_a.persistent_id == piece.persistent_id ||
          piece_b.persistent_id == piece.persistent_id
      end

      # Get the partner piece given one side
      def partner_of(piece)
        if piece_a.persistent_id == piece.persistent_id
          piece_b
        elsif piece_b.persistent_id == piece.persistent_id
          piece_a
        end
      end

      # Get partner role relative to a piece
      def partner_role(piece)
        partner_of(piece)&.role
      end

      # Get the face of a specific piece in this joint
      def face_of(piece)
        if piece_a.persistent_id == piece.persistent_id
          face_a
        else
          face_b
        end
      end
    end
  end
end
