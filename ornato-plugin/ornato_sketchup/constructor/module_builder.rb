# frozen_string_literal: true
# Ornato CNC Plugin - Module Builder
# Creates cabinet modules by assembling pieces in the correct construction order.
# Generates proper SketchUp geometry with Ornato naming conventions and
# Dynamic Component attributes for parametric resizing.

module Ornato
  module Constructor
    class ModuleBuilder

      # Module type presets with default dimensions (mm)
      MODULE_PRESETS = {
        balcao: {
          label: 'Balcão',
          default_width: 800, default_height: 720, default_depth: 560,
          construction: :base_between_laterals,
          back_panel: :inset, # encaixado
          has_baseboard: true,
          baseboard_height: 100,
        },
        aereo: {
          label: 'Aéreo',
          default_width: 800, default_height: 720, default_depth: 350,
          construction: :base_between_laterals,
          back_panel: :inset,
          has_baseboard: false,
        },
        alto: {
          label: 'Alto (Coluna)',
          default_width: 600, default_height: 2100, default_depth: 560,
          construction: :base_between_laterals,
          back_panel: :inset,
          has_baseboard: true,
          baseboard_height: 100,
        },
        roupeiro: {
          label: 'Roupeiro',
          default_width: 1200, default_height: 2400, default_depth: 600,
          construction: :laterals_on_base,
          back_panel: :inset,
          has_baseboard: true,
          baseboard_height: 150,
        },
        nicho: {
          label: 'Nicho',
          default_width: 400, default_height: 400, default_depth: 300,
          construction: :base_top_passthrough,
          back_panel: :overlay, # sobreposto
          has_baseboard: false,
        },
        console: {
          label: 'Console',
          default_width: 1000, default_height: 500, default_depth: 400,
          construction: :base_between_laterals,
          back_panel: :overlay,
          has_baseboard: false,
        },
        mesa: {
          label: 'Mesa',
          default_width: 1200, default_height: 750, default_depth: 600,
          construction: :laterals_on_base,
          back_panel: :none,
          has_baseboard: false,
        },
        bau: {
          label: 'Baú',
          default_width: 800, default_height: 500, default_depth: 450,
          construction: :base_top_passthrough,
          back_panel: :overlay,
          has_baseboard: false,
        },
      }.freeze

      attr_reader :module_type, :width, :height, :depth, :thickness,
                  :back_thickness, :construction_type, :module_name

      # Initialize a new module builder
      # @param type [Symbol] module type from MODULE_PRESETS
      # @param options [Hash] override dimensions and settings
      def initialize(type, options = {})
        preset = MODULE_PRESETS[type]
        raise ArgumentError, "Unknown module type: #{type}" unless preset

        @module_type       = type
        @width             = (options[:width]  || preset[:default_width]).to_f
        @height            = (options[:height] || preset[:default_height]).to_f
        @depth             = (options[:depth]  || preset[:default_depth]).to_f
        @thickness         = (options[:thickness] || 18.0).to_f
        @back_thickness    = (options[:back_thickness] || 3.0).to_f
        @construction_type = (options[:construction] || preset[:construction]).to_sym
        @back_panel_type   = (options[:back_panel] || preset[:back_panel]).to_sym
        @has_baseboard     = options.key?(:has_baseboard) ? options[:has_baseboard] : preset[:has_baseboard]
        @baseboard_height  = (options[:baseboard_height] || preset[:baseboard_height] || 0).to_f
        @module_name       = options[:name] || generate_module_name(type)
        @pieces            = []
        @closures          = []
        @internals         = []
        @accessories       = []
      end

      # Build the module body (structure pieces)
      # @return [Hash] built module data with all pieces
      def build_body
        result = ConstructionLogic.calculate(
          @construction_type, @width, @height, @depth, @thickness, @back_thickness
        )

        @pieces = result[:pieces].map do |role, piece_data|
          piece_data.merge(role: role)
        end

        self
      end

      # Add a divider at a specific position
      # @param position_x [Float] horizontal position from left (mm)
      # @param options [Hash] additional options
      def add_divider(position_x, options = {})
        internal_height = calculate_internal_height
        internal_depth  = @depth

        @internals << {
          role: :divider,
          name: "DIV_%02d" % (@internals.count { |i| i[:role] == :divider } + 1),
          label: options[:label] || 'Divisória',
          dimensions: {
            length: internal_height,
            width: internal_depth,
            thickness: @thickness,
          },
          position: { x: position_x, y: 0, z: calculate_base_top },
          has_cutouts: options[:cutouts] || false,
        }
        self
      end

      # Add fixed shelves distributed evenly in a span
      # @param count [Integer] number of shelves
      # @param options [Hash] span limits, fixed positions, etc.
      def add_shelves(count, options = {})
        span_start = options[:span_start] || calculate_base_top
        span_end   = options[:span_end]   || calculate_top_bottom
        span_x     = options[:span_x]     || @thickness
        span_width = options[:span_width] || calculate_internal_width

        span_height = span_end - span_start
        body_depth  = @depth - ConstructionLogic::CLEARANCES[:shelf_depth_recess]

        shelves = ConstructionLogic.calculate_shelves(
          span_height, count, span_width, body_depth
        )

        shelves.each do |shelf|
          shelf[:position_z] += span_start
          shelf[:position_x] = span_x + ConstructionLogic::CLEARANCES[:shelf_side_gap]
          shelf[:role] = options[:fixed] ? :shelf_fixed : :shelf
          @internals << shelf
        end

        self
      end

      # Add closure (doors, drawers, basculante, etc.)
      # @param closure_type [Symbol] type of closure
      # @param options [Hash] configuration options
      def add_closure(closure_type, options = {})
        case closure_type
        when :doors
          add_doors(options)
        when :basculante
          add_basculante(options)
        when :drawers
          add_drawers(options)
        when :sliding_doors
          add_sliding_doors(options)
        else
          raise ArgumentError, "Unknown closure type: #{closure_type}"
        end
        self
      end

      # Get the complete module specification
      # @return [Hash] full module data
      def to_spec
        {
          name: @module_name,
          type: @module_type,
          dimensions: { width: @width, height: @height, depth: @depth },
          thickness: @thickness,
          back_thickness: @back_thickness,
          construction_type: @construction_type,
          back_panel_type: @back_panel_type,
          has_baseboard: @has_baseboard,
          baseboard_height: @baseboard_height,
          pieces: @pieces,
          closures: @closures,
          internals: @internals,
          accessories: @accessories,
          dc_formulas: ConstructionLogic.generate_dc_formulas(@construction_type),
        }
      end

      # Serialize to JSON for saving
      def to_json(*_args)
        require 'json'
        JSON.pretty_generate(to_spec)
      end

      private

      # Add door closure
      def add_doors(options)
        count     = options[:count] || 2
        overlay   = options[:overlay] || { left: :total, right: :total, top: :total, bottom: :total }
        handle_pos = options[:handle_position] || :bottom

        internal_w = calculate_internal_width
        internal_h = calculate_internal_height

        doors = ConstructionLogic.calculate_doors(
          internal_w, internal_h, count, @thickness, overlay
        )

        doors.each do |door|
          door[:closure_type] = :door
          door[:handle_position] = handle_pos
          door[:overlay] = overlay
          @closures << door
        end
      end

      # Add basculante (flip-up door)
      def add_basculante(options)
        overlay = options[:overlay] || { left: :total, right: :total, top: :total, bottom: :total }
        mechanism = options[:mechanism] || :gas_piston # :gas_piston, :aventos_hf, etc.

        internal_w = calculate_internal_width
        internal_h = calculate_internal_height

        ol = ConstructionLogic.resolve_overlay(overlay[:left], @thickness)
        or_ = ConstructionLogic.resolve_overlay(overlay[:right], @thickness)
        ot = ConstructionLogic.resolve_overlay(overlay[:top], @thickness)
        ob = ConstructionLogic.resolve_overlay(overlay[:bottom], @thickness)

        @closures << {
          name: 'POR_BAS',
          closure_type: :basculante,
          width: internal_w + ol + or_,
          height: internal_h + ot + ob,
          thickness: ConstructionLogic::THICKNESSES[:door],
          mechanism: mechanism,
          overlay: overlay,
        }
      end

      # Add drawer closure
      def add_drawers(options)
        count   = options[:count] || 3
        overlay = options[:overlay] || { left: :total, right: :total, top: :total, bottom: :total }

        span_start = options[:span_start] || calculate_base_top
        span_end   = options[:span_end]   || calculate_top_bottom
        span_height = span_end - span_start

        internal_w = calculate_internal_width

        drawers = ConstructionLogic.calculate_drawers(
          span_height, count, internal_w, overlay, @thickness
        )

        drawers.each do |drawer|
          drawer[:closure_type] = :drawer
          drawer[:overlay] = overlay
          @closures << drawer
        end
      end

      # Add sliding doors
      def add_sliding_doors(options)
        count      = options[:count] || 2
        track_type = options[:track_type] || :inset # :inset or :overlay

        internal_w = calculate_internal_width
        internal_h = calculate_internal_height

        # Sliding doors overlap each other
        overlap = 20.0 # mm overlap between doors
        door_width = (internal_w + (count - 1) * overlap) / count
        door_height = internal_h - 5.0 # clearance for tracks

        count.times do |i|
          @closures << {
            name: "POR_COR_%02d" % (i + 1),
            closure_type: :sliding_door,
            width: door_width,
            height: door_height,
            thickness: ConstructionLogic::THICKNESSES[:door],
            track_type: track_type,
            track_index: i,
          }
        end
      end

      # Calculate internal width (between laterals)
      def calculate_internal_width
        case @construction_type
        when :base_between_laterals, :laterals_on_base, :laterals_on_base_top_passthrough
          @width - 2 * @thickness
        when :base_top_passthrough
          @width - 2 * @thickness
        else
          @width - 2 * @thickness
        end
      end

      # Calculate internal height (between base and top)
      def calculate_internal_height
        case @construction_type
        when :base_between_laterals
          @height - 2 * @thickness
        when :laterals_on_base
          @height - 2 * @thickness
        when :base_top_passthrough
          @height - 2 * @thickness
        when :laterals_on_base_top_passthrough
          @height - 2 * @thickness
        else
          @height - 2 * @thickness
        end
      end

      # Z position of the top of the base
      def calculate_base_top
        case @construction_type
        when :base_between_laterals
          @thickness
        when :laterals_on_base, :base_top_passthrough, :laterals_on_base_top_passthrough
          @thickness
        else
          @thickness
        end
      end

      # Z position of the bottom of the top panel
      def calculate_top_bottom
        @height - @thickness
      end

      # Generate a unique module name
      def generate_module_name(type)
        prefix = MODULE_PRESETS[type][:label].upcase
          .gsub(/[ÁÀÃÂ]/, 'A').gsub(/[ÉÈÊ]/, 'E')
          .gsub(/[ÍÌÎ]/, 'I').gsub(/[ÓÒÕÔ]/, 'O')
          .gsub(/[ÚÙÛ]/, 'U').gsub(/[Ç]/, 'C')
          .gsub(/[^A-Z0-9]/, '_').gsub(/_+/, '_').gsub(/^_|_$/, '')

        timestamp = Time.now.strftime('%H%M%S')
        "ORN_#{prefix}_#{timestamp}"
      end

    end
  end
end
