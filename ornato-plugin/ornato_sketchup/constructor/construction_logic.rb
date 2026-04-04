# frozen_string_literal: true
# Ornato CNC Plugin - Construction Logic
# Defines how modules are assembled: piece order, dimensional cascading,
# and parametric formulas for Dynamic Components.

module Ornato
  module Constructor
    class ConstructionLogic

      # =====================================================================
      # CONSTRUCTION TYPES
      # Defines the assembly order and dimensional formulas for each type.
      # The order determines which pieces are placed first and how subsequent
      # pieces calculate their dimensions.
      # =====================================================================

      CONSTRUCTION_TYPES = {
        # Base embutida entre laterais (most common for balcoes/aereos)
        base_between_laterals: {
          label: 'Base Embutida',
          description: 'Laterais definem altura, base e topo encaixam entre elas',
          order: [:lateral_left, :lateral_right, :base, :top, :back_panel],
          formulas: {
            lateral_left:  { w: 'H',         h: 'D',         t: 'T' },
            lateral_right: { w: 'H',         h: 'D',         t: 'T' },
            base:          { w: 'W - 2 * T', h: 'D',         t: 'T' },
            top:           { w: 'W - 2 * T', h: 'D',         t: 'T' },
            back_panel:    { w: 'W - 2 * T', h: 'H - 2 * T', t: 'BT' },
          },
          positions: {
            lateral_left:  { x: 0,       y: 0,       z: 0 },
            lateral_right: { x: 'W - T', y: 0,       z: 0 },
            base:          { x: 'T',     y: 0,       z: 0 },
            top:           { x: 'T',     y: 0,       z: 'H - T' },
            back_panel:    { x: 'T',     y: 'D - BT', z: 'T' },
          },
        },

        # Laterais sobre a base (common for roupeiros)
        laterals_on_base: {
          label: 'Laterais sobre Base',
          description: 'Base passante, laterais apoiam sobre ela',
          order: [:base, :lateral_left, :lateral_right, :top, :back_panel],
          formulas: {
            base:          { w: 'W',         h: 'D',         t: 'T' },
            lateral_left:  { w: 'H - T',     h: 'D',         t: 'T' },
            lateral_right: { w: 'H - T',     h: 'D',         t: 'T' },
            top:           { w: 'W - 2 * T', h: 'D',         t: 'T' },
            back_panel:    { w: 'W - 2 * T', h: 'H - 2 * T', t: 'BT' },
          },
          positions: {
            base:          { x: 0,       y: 0,       z: 0 },
            lateral_left:  { x: 0,       y: 0,       z: 'T' },
            lateral_right: { x: 'W - T', y: 0,       z: 'T' },
            top:           { x: 'T',     y: 0,       z: 'H - T' },
            back_panel:    { x: 'T',     y: 'D - BT', z: 'T' },
          },
        },

        # Base e topo passantes (nichos)
        base_top_passthrough: {
          label: 'Base e Topo Passantes',
          description: 'Base e topo definem largura, laterais encaixam entre',
          order: [:base, :top, :lateral_left, :lateral_right, :back_panel],
          formulas: {
            base:          { w: 'W',         h: 'D',             t: 'T' },
            top:           { w: 'W',         h: 'D',             t: 'T' },
            lateral_left:  { w: 'H - 2 * T', h: 'D',             t: 'T' },
            lateral_right: { w: 'H - 2 * T', h: 'D',             t: 'T' },
            back_panel:    { w: 'W - 2 * T', h: 'H - 2 * T',     t: 'BT' },
          },
          positions: {
            base:          { x: 0,       y: 0,       z: 0 },
            top:           { x: 0,       y: 0,       z: 'H - T' },
            lateral_left:  { x: 0,       y: 0,       z: 'T' },
            lateral_right: { x: 'W - T', y: 0,       z: 'T' },
            back_panel:    { x: 'T',     y: 'D - BT', z: 'T' },
          },
        },

        # Laterais sobre base, topo passante (roupeiro com topo cobrindo)
        laterals_on_base_top_passthrough: {
          label: 'Laterais sobre Base, Topo Passante',
          description: 'Base e topo passantes, laterais entre elas',
          order: [:base, :lateral_left, :lateral_right, :top, :back_panel],
          formulas: {
            base:          { w: 'W',         h: 'D',             t: 'T' },
            lateral_left:  { w: 'H - T',     h: 'D',             t: 'T' },
            lateral_right: { w: 'H - T',     h: 'D',             t: 'T' },
            top:           { w: 'W',         h: 'D',             t: 'T' },
            back_panel:    { w: 'W - 2 * T', h: 'H - 2 * T',     t: 'BT' },
          },
          positions: {
            base:          { x: 0,       y: 0,       z: 0 },
            lateral_left:  { x: 0,       y: 0,       z: 'T' },
            lateral_right: { x: 'W - T', y: 0,       z: 'T' },
            top:           { x: 0,       y: 0,       z: 'H - T' },
            back_panel:    { x: 'T',     y: 'D - BT', z: 'T' },
          },
        },
      }.freeze

      # =====================================================================
      # PIECE ROLE MAPPING
      # Maps constructor piece roles to Ornato standard names
      # =====================================================================

      PIECE_ROLES = {
        lateral_left:   { name: 'LAT_ESQ',  label: 'Lateral Esquerda',  orientation: :vertical },
        lateral_right:  { name: 'LAT_DIR',  label: 'Lateral Direita',   orientation: :vertical },
        base:           { name: 'BASE',     label: 'Base',              orientation: :horizontal },
        top:            { name: 'TOPO',     label: 'Topo',              orientation: :horizontal },
        back_panel:     { name: 'FUNDO',    label: 'Fundo',             orientation: :vertical },
        divider:        { name: 'DIV',      label: 'Divisória',         orientation: :vertical },
        crossbar:       { name: 'TRAV',     label: 'Travessa',          orientation: :horizontal },
        rail:           { name: 'BAT',      label: 'Batente',           orientation: :horizontal },
        shelf_fixed:    { name: 'PRAT_FIXA', label: 'Prateleira Fixa',  orientation: :horizontal },
        shelf:          { name: 'PRAT',     label: 'Prateleira',        orientation: :horizontal },
        drawer_front:   { name: 'GAV',      label: 'Frente Gaveta',     orientation: :vertical },
        door_left:      { name: 'POR_ESQ',  label: 'Porta Esquerda',    orientation: :vertical },
        door_right:     { name: 'POR_DIR',  label: 'Porta Direita',     orientation: :vertical },
        door_basculante: { name: 'POR_BAS', label: 'Porta Basculante',  orientation: :horizontal },
        door_sliding:   { name: 'POR_COR',  label: 'Porta Deslizante',  orientation: :vertical },
        panel:          { name: 'PAIN',     label: 'Painel',            orientation: :vertical },
        countertop:     { name: 'TAMPO',    label: 'Tampo',             orientation: :horizontal },
        baseboard:      { name: 'RODAPE',   label: 'Rodapé',            orientation: :vertical },
        molding:        { name: 'MOL',      label: 'Moldura',           orientation: :vertical },
        internal_mount: { name: 'MONT',     label: 'Montante',          orientation: :vertical },
      }.freeze

      # =====================================================================
      # OVERLAY / RECOBRIMENTO CALCULATIONS
      # How much the door/drawer overlaps the body
      # =====================================================================

      OVERLAY_TYPES = {
        total: {
          label: 'Total',
          # Door covers the full thickness of the lateral
          offset: 'T',
        },
        partial: {
          label: 'Parcial',
          # Door covers half the lateral thickness
          offset: 'T / 2',
        },
        inset: {
          label: 'Embutido',
          # Door sits inside the body opening
          offset: '0',
        },
        passthrough: {
          label: 'Passante',
          # Door extends beyond the body (e.g., below base)
          offset: 'T + GAP',
        },
      }.freeze

      # Default clearances in mm
      CLEARANCES = {
        door_gap: 2.0,            # gap between two doors
        door_body_gap: 1.0,       # gap door to body edge
        drawer_gap: 2.0,          # gap between drawers
        drawer_side_gap: 12.5,    # gap for drawer slides on each side
        back_panel_recess: 10.0,  # recess for back panel dado
        shelf_side_gap: 1.0,      # clearance shelf to lateral
        shelf_depth_recess: 20.0, # shelf depth less than body depth
      }.freeze

      # Standard thicknesses
      THICKNESSES = {
        body: 18.0,
        door: 18.0,
        drawer_front: 18.0,
        drawer_side: 15.0,
        drawer_bottom: 3.0,
        back_panel: 3.0,
        back_panel_thick: 6.0,
        shelf: 18.0,
        countertop: 30.0,
      }.freeze

      # =====================================================================
      # DIMENSIONAL CALCULATION ENGINE
      # Resolves formulas with actual module dimensions
      # =====================================================================

      # Calculate actual dimensions for all pieces in a construction type
      # @param type [Symbol] construction type key
      # @param width [Float] module external width (mm)
      # @param height [Float] module external height (mm)
      # @param depth [Float] module external depth (mm)
      # @param thickness [Float] body panel thickness (mm)
      # @param back_thickness [Float] back panel thickness (mm)
      # @return [Hash] piece dimensions and positions
      def self.calculate(type, width, height, depth, thickness = 18.0, back_thickness = 3.0)
        config = CONSTRUCTION_TYPES[type]
        raise ArgumentError, "Unknown construction type: #{type}" unless config

        vars = {
          'W'  => width.to_f,
          'H'  => height.to_f,
          'D'  => depth.to_f,
          'T'  => thickness.to_f,
          'BT' => back_thickness.to_f,
          'GAP' => CLEARANCES[:door_body_gap],
        }

        result = { order: config[:order], pieces: {} }

        config[:order].each do |role|
          formula = config[:formulas][role]
          position = config[:positions][role]
          next unless formula && position

          piece_w = resolve_formula(formula[:w], vars)
          piece_h = resolve_formula(formula[:h], vars)
          piece_t = resolve_formula(formula[:t], vars)

          pos_x = resolve_formula(position[:x], vars)
          pos_y = resolve_formula(position[:y], vars)
          pos_z = resolve_formula(position[:z], vars)

          role_info = PIECE_ROLES[role] || {}

          result[:pieces][role] = {
            name: role_info[:name] || role.to_s.upcase,
            label: role_info[:label] || role.to_s,
            orientation: role_info[:orientation] || :horizontal,
            dimensions: { length: piece_w, width: piece_h, thickness: piece_t },
            position: { x: pos_x, y: pos_y, z: pos_z },
          }
        end

        result
      end

      # Calculate door dimensions based on overlay type and body dimensions
      # @param body_width [Float] internal body width
      # @param body_height [Float] internal body height
      # @param door_count [Integer] number of doors (1 or 2)
      # @param thickness [Float] body panel thickness
      # @param overlay [Hash] overlay config per side (:left, :right, :top, :bottom)
      # @return [Array<Hash>] array of door dimension hashes
      def self.calculate_doors(body_width, body_height, door_count, thickness, overlay = {})
        overlay_left   = resolve_overlay(overlay[:left]   || :total, thickness)
        overlay_right  = resolve_overlay(overlay[:right]  || :total, thickness)
        overlay_top    = resolve_overlay(overlay[:top]    || :total, thickness)
        overlay_bottom = resolve_overlay(overlay[:bottom] || :total, thickness)

        total_door_width = body_width + overlay_left + overlay_right
        door_height = body_height + overlay_top + overlay_bottom

        gap = CLEARANCES[:door_gap]

        doors = []
        if door_count == 1
          doors << {
            name: 'POR',
            width: total_door_width,
            height: door_height,
            thickness: THICKNESSES[:door],
          }
        elsif door_count >= 2
          single_width = (total_door_width - (door_count - 1) * gap) / door_count
          door_count.times do |i|
            suffix = i == 0 ? 'ESQ' : (i == door_count - 1 ? 'DIR' : "%02d" % (i + 1))
            doors << {
              name: "POR_#{suffix}",
              width: single_width,
              height: door_height,
              thickness: THICKNESSES[:door],
              position_x: i * (single_width + gap),
            }
          end
        end

        doors
      end

      # Calculate drawer distribution in a given vertical span
      # @param span_height [Float] available height for drawers
      # @param drawer_count [Integer] number of drawers
      # @param body_width [Float] internal body width
      # @param overlay [Hash] overlay config
      # @param thickness [Float] body panel thickness
      # @return [Array<Hash>] array of drawer dimension hashes
      def self.calculate_drawers(span_height, drawer_count, body_width, overlay = {}, thickness = 18.0)
        overlay_left  = resolve_overlay(overlay[:left]  || :total, thickness)
        overlay_right = resolve_overlay(overlay[:right] || :total, thickness)

        gap = CLEARANCES[:drawer_gap]
        front_width = body_width + overlay_left + overlay_right
        front_height = (span_height - (drawer_count - 1) * gap) / drawer_count

        # Internal drawer box dimensions
        box_width  = body_width - 2 * CLEARANCES[:drawer_side_gap]
        box_depth  = 450.0 # standard, can be overridden
        box_height = [front_height - 25.0, 80.0].max # front height minus gap, min 80mm

        drawers = []
        drawer_count.times do |i|
          drawers << {
            name: "GAV_%02d" % (i + 1),
            front: {
              width: front_width,
              height: front_height,
              thickness: THICKNESSES[:drawer_front],
            },
            box: {
              width: box_width,
              height: box_height,
              depth: box_depth,
              side_thickness: THICKNESSES[:drawer_side],
              bottom_thickness: THICKNESSES[:drawer_bottom],
            },
            position_z: i * (front_height + gap),
          }
        end

        drawers
      end

      # Calculate shelf distribution in a vertical span
      # @param span_height [Float] available height
      # @param shelf_count [Integer] number of shelves
      # @param body_width [Float] internal body width
      # @param body_depth [Float] internal body depth
      # @return [Array<Hash>] array of shelf dimension hashes
      def self.calculate_shelves(span_height, shelf_count, body_width, body_depth)
        gap = CLEARANCES[:shelf_side_gap]
        shelf_width = body_width - 2 * gap
        shelf_depth = body_depth - CLEARANCES[:shelf_depth_recess]

        spacing = span_height / (shelf_count + 1)

        shelves = []
        shelf_count.times do |i|
          shelves << {
            name: "PRAT_%02d" % (i + 1),
            width: shelf_width,
            depth: shelf_depth,
            thickness: THICKNESSES[:shelf],
            position_z: spacing * (i + 1),
          }
        end

        shelves
      end

      # Generate SketchUp Dynamic Component formulas for a construction type
      # @param type [Symbol] construction type key
      # @return [Hash] DC attribute formulas per piece
      def self.generate_dc_formulas(type)
        config = CONSTRUCTION_TYPES[type]
        raise ArgumentError, "Unknown construction type: #{type}" unless config

        dc_formulas = {}

        config[:order].each do |role|
          formula = config[:formulas][role]
          position = config[:positions][role]
          next unless formula && position

          role_info = PIECE_ROLES[role] || {}
          piece_name = role_info[:name] || role.to_s.upcase

          # Convert our formula syntax to SketchUp DC formula syntax
          # In DC formulas: Parent!LenX = parent width, etc.
          dc_formulas[piece_name] = {
            LenX: to_dc_formula(formula[:w]),
            LenY: to_dc_formula(formula[:h]),
            LenZ: to_dc_formula(formula[:t]),
            X:    to_dc_formula(position[:x]),
            Y:    to_dc_formula(position[:y]),
            Z:    to_dc_formula(position[:z]),
          }
        end

        dc_formulas
      end

      private

      # Resolve a formula string with variable substitution
      def self.resolve_formula(formula, vars)
        return formula.to_f if formula.is_a?(Numeric)

        expr = formula.to_s.dup
        # Sort by length descending to avoid partial replacements (BT before T)
        vars.sort_by { |k, _| -k.length }.each do |key, value|
          expr.gsub!(key, value.to_s)
        end

        # Safe eval of simple arithmetic expressions
        safe_eval(expr)
      end

      # Convert formula to SketchUp Dynamic Component syntax
      def self.to_dc_formula(formula)
        return formula.to_s if formula.is_a?(Numeric)

        result = formula.to_s.dup
        # Map our variable names to DC parent references
        replacements = {
          'W'   => 'Parent!LenX',
          'H'   => 'Parent!LenZ',
          'D'   => 'Parent!LenY',
          'T'   => 'Parent!orn_thickness',
          'BT'  => 'Parent!orn_back_thickness',
          'GAP' => 'Parent!orn_door_gap',
        }

        replacements.sort_by { |k, _| -k.length }.each do |key, value|
          result.gsub!(/\b#{key}\b/, value)
        end

        "=#{result}"
      end

      # Resolve overlay type to mm value
      def self.resolve_overlay(type, thickness)
        case type.to_sym
        when :total       then thickness
        when :partial     then thickness / 2.0
        when :inset       then 0.0
        when :passthrough then thickness + CLEARANCES[:door_body_gap]
        else 0.0
        end
      end

      # Safe arithmetic evaluation (only allows numbers and basic operators)
      def self.safe_eval(expr)
        # Remove spaces
        expr = expr.strip
        # Only allow digits, dots, +, -, *, /, (, ), spaces
        unless expr.match?(/\A[\d\.\+\-\*\/\(\)\s]+\z/)
          raise ArgumentError, "Unsafe expression: #{expr}"
        end
        eval(expr).to_f
      rescue StandardError => e
        raise ArgumentError, "Cannot evaluate expression '#{expr}': #{e.message}"
      end

    end
  end
end
