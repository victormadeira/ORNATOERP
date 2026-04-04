# frozen_string_literal: true
# Ornato CNC Plugin - Finish Manager
# Manages material/finish application to modules with intelligent edge banding.
# Supports different materials per group (body, doors, panels) and
# per-face edge banding overrides.

module Ornato
  module Catalog
    class FinishManager

      # Finish groups - pieces are categorized into these groups
      FINISH_GROUPS = {
        corpo: {
          label: 'Corpo',
          roles: %w[LAT_ESQ LAT_DIR BASE TOPO FUNDO DIV TRAV BAT MONT PRAT PRAT_FIXA],
        },
        portas: {
          label: 'Portas e Frentes',
          roles: %w[POR POR_ESQ POR_DIR POR_BAS POR_COR],
          match_pattern: /^POR/,
        },
        gavetas: {
          label: 'Gavetas',
          roles: %w[GAV],
          match_pattern: /^GAV/,
          inherits_from: :portas, # defaults to same as portas if not set
        },
        tamponamento: {
          label: 'Tamponamento',
          roles: %w[PAIN TAMPO],
          match_pattern: /^(PAIN|TAMPO)/,
        },
        rodape: {
          label: 'Rodapé',
          roles: %w[RODAPE],
          match_pattern: /^RODAPE/,
          inherits_from: :corpo,
        },
      }.freeze

      # Edge faces
      EDGE_FACES = [:front, :back, :left, :right].freeze

      # Initialize the finish manager
      def initialize
        @finishes = {}       # group => { material: ..., edges: ... }
        @piece_overrides = {} # piece_name => { material: ..., edges: ... }
        @materials_cache = {} # material_id => SketchUp::Material
      end

      # Set finish for a group
      # @param group [Symbol] finish group (:corpo, :portas, :gavetas, :tamponamento)
      # @param material [String] material identifier (e.g., "MDF_18_BRANCO_TX")
      # @param edge_config [Hash] edge configuration
      # @example
      #   set_group_finish(:corpo, "MDF_18_BRANCO_TX", {
      #     default: "MDF_18_BRANCO_TX",
      #     front: "MDF_18_CARVALHO",  # front edges match tamponamento
      #     back: nil,                  # no edge banding on back
      #   })
      def set_group_finish(group, material, edge_config = {})
        @finishes[group] = {
          material: material,
          edges: {
            default: edge_config[:default] || material,
            front:   edge_config[:front],
            back:    edge_config[:back],
            left:    edge_config[:left],
            right:   edge_config[:right],
          },
        }
      end

      # Set finish override for a specific piece
      # @param piece_name [String] piece name (e.g., "LAT_ESQ")
      # @param material [String] material identifier
      # @param edge_config [Hash] edge configuration (overrides group)
      def set_piece_finish(piece_name, material = nil, edge_config = {})
        @piece_overrides[piece_name] = {
          material: material,
          edges: edge_config,
        }
      end

      # Get the resolved finish for a specific piece
      # @param piece_name [String] piece name
      # @return [Hash] resolved finish with material and edge banding per face
      def resolve_finish(piece_name)
        group = detect_group(piece_name)
        group_finish = @finishes[group] || {}
        piece_override = @piece_overrides[piece_name] || {}

        # Resolve material: piece override > group > default
        material = piece_override[:material] || group_finish[:material]

        # If group inherits from another group and has no own finish
        if material.nil? && group
          parent_group = FINISH_GROUPS[group][:inherits_from]
          if parent_group
            parent_finish = @finishes[parent_group]
            material = parent_finish[:material] if parent_finish
          end
        end

        # Resolve edge banding per face
        edges = {}
        EDGE_FACES.each do |face|
          edge = resolve_edge(face, piece_override, group_finish, material)
          edges[face] = edge
        end

        {
          material: material,
          edges: edges,
        }
      end

      # Apply finishes to all pieces in a module
      # @param module_group [Sketchup::Group] the module group
      def apply_to_module(module_group)
        module_group.entities.each do |entity|
          next unless entity.respond_to?(:name) && entity.name && !entity.name.empty?

          piece_name = entity.name
          finish = resolve_finish(piece_name)

          # Apply material to the piece
          if finish[:material]
            apply_material(entity, finish[:material])
          end

          # Store edge banding info as attributes (for export)
          store_edge_attributes(entity, finish[:edges])
        end
      end

      # Get the full finish configuration as a hash (for saving/loading)
      # @return [Hash] serializable finish configuration
      def to_config
        {
          groups: @finishes.transform_keys(&:to_s),
          overrides: @piece_overrides,
        }
      end

      # Load finish configuration from a hash
      # @param config [Hash] finish configuration
      def load_config(config)
        if config['groups']
          config['groups'].each do |group_str, finish|
            group = group_str.to_sym
            @finishes[group] = symbolize_finish(finish)
          end
        end

        if config['overrides']
          @piece_overrides = config['overrides'].dup
        end
      end

      # Generate edge banding report for export
      # @return [Array<Hash>] edge banding specs per piece
      def edge_banding_report
        report = []

        @finishes.each do |group, finish|
          group_config = FINISH_GROUPS[group]
          next unless group_config

          group_config[:roles].each do |role|
            resolved = resolve_finish(role)
            next unless resolved[:material]

            edges_with_banding = resolved[:edges].select { |_, v| v }
            next if edges_with_banding.empty?

            report << {
              piece_role: role,
              group: group.to_s,
              material: resolved[:material],
              edges: edges_with_banding.transform_keys(&:to_s),
            }
          end
        end

        report
      end

      private

      # Detect which finish group a piece belongs to
      def detect_group(piece_name)
        FINISH_GROUPS.each do |group_key, config|
          # Check exact role match first
          return group_key if config[:roles].include?(piece_name)

          # Check pattern match
          if config[:match_pattern] && piece_name.match?(config[:match_pattern])
            return group_key
          end
        end

        # Default to corpo for unknown pieces
        :corpo
      end

      # Resolve edge banding for a specific face
      # Cascade: piece_override > group_face > group_default > material
      def resolve_edge(face, piece_override, group_finish, default_material)
        # Check piece-level override for this face
        if piece_override[:edges] && piece_override[:edges].key?(face)
          return piece_override[:edges][face]
        end

        # Check group-level specific face
        group_edges = group_finish[:edges] || {}
        if group_edges[face]
          return group_edges[face]
        end

        # Check if face should have no edge (explicit nil in group)
        if group_edges.key?(face) && group_edges[face].nil?
          return nil
        end

        # Use group default
        group_edges[:default] || default_material
      end

      # Apply a SketchUp material to an entity
      def apply_material(entity, material_id)
        model = Sketchup.active_model

        # Check cache first
        unless @materials_cache[material_id]
          # Try to find existing material in model
          existing = model.materials[material_id]
          if existing
            @materials_cache[material_id] = existing
          else
            # Try to load .skm from library
            skm_path = find_material_file(material_id)
            if skm_path
              loaded = model.materials.load(skm_path)
              if loaded
                loaded.name = material_id
                @materials_cache[material_id] = loaded
              end
            else
              # Create a placeholder material
              mat = model.materials.add(material_id)
              mat.color = material_color_hint(material_id)
              @materials_cache[material_id] = mat
            end
          end
        end

        mat = @materials_cache[material_id]
        entity.material = mat if mat
      end

      # Store edge banding info as Ornato attributes
      def store_edge_attributes(entity, edges)
        dict = 'ornato'

        EDGE_FACES.each do |face|
          edge_val = edges[face]
          attr_name = "orn_edge_#{face}"

          if edge_val
            entity.set_attribute(dict, attr_name, edge_val)
          else
            entity.set_attribute(dict, attr_name, 'none')
          end
        end
      end

      # Find .skm material file in library or cache
      def find_material_file(material_id)
        # Parse material_id: "MDF_18_BRANCO_TX" -> search in MDF folders
        search_paths = [
          File.join(File.dirname(__FILE__), '..', 'biblioteca', 'materiais'),
          File.join(Sketchup.find_support_file('Plugins'), 'ornato_sketchup', 'biblioteca', 'materiais'),
        ]

        # Extract potential filename from material_id
        # MDF_18_BRANCO_TX -> BRANCO_TX.skm
        parts = material_id.split('_')
        possible_names = [
          "#{material_id}.skm",
          "#{parts[2..].join('_')}.skm",
          "#{parts.last}.skm",
        ].compact.uniq

        search_paths.each do |base|
          next unless File.directory?(base)

          possible_names.each do |name|
            # Search recursively
            Dir.glob(File.join(base, '**', name)).each do |path|
              return path if File.exist?(path)
            end
          end
        end

        nil
      end

      # Generate a hint color for placeholder materials
      def material_color_hint(material_id)
        id = material_id.downcase
        if id.include?('branco') || id.include?('white')
          Sketchup::Color.new(240, 240, 235)
        elsif id.include?('preto') || id.include?('black')
          Sketchup::Color.new(40, 40, 40)
        elsif id.include?('cinza') || id.include?('grey') || id.include?('gray')
          Sketchup::Color.new(160, 160, 160)
        elsif id.include?('carvalho') || id.include?('madeira') || id.include?('wood')
          Sketchup::Color.new(180, 130, 80)
        elsif id.include?('nogueira') || id.include?('walnut')
          Sketchup::Color.new(100, 60, 30)
        else
          # Generate from hash of the name
          hash = material_id.bytes.reduce(0) { |s, b| s + b }
          Sketchup::Color.new(
            100 + (hash * 37) % 156,
            100 + (hash * 53) % 156,
            100 + (hash * 71) % 156
          )
        end
      end

      # Deep symbolize finish hash keys
      def symbolize_finish(hash)
        result = {}
        hash.each do |k, v|
          key = k.is_a?(String) ? k.to_sym : k
          if v.is_a?(Hash)
            result[key] = symbolize_finish(v)
          else
            result[key] = v
          end
        end
        result
      end

    end
  end
end
