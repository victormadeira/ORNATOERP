# frozen_string_literal: true
# Ornato CNC Plugin - Piece Inserter
# Downloads .skp models from the library server and inserts them into
# the SketchUp model, handling scaling, positioning, and attribute setup.

module Ornato
  module Constructor
    class PieceInserter

      LIBRARY_CACHE_DIR = File.join(
        Sketchup.find_support_file('Plugins'), 'ornato_sketchup', 'biblioteca', 'cache'
      )

      # Initialize the piece inserter
      # @param server_url [String] base URL of the Ornato server
      def initialize(server_url = nil)
        @server_url = server_url || Sketchup.read_default('Ornato', 'server_url', 'http://localhost:3000')
        @auth_token = Sketchup.read_default('Ornato', 'auth_token', '')
        ensure_cache_dir
      end

      # Insert a piece from the library into a module group
      # @param module_group [Sketchup::Group] the parent module group
      # @param piece_spec [Hash] piece specification from ModuleBuilder
      # @param library_model [String] library model name (e.g., "lateral_com_fixacao")
      # @return [Sketchup::ComponentInstance] the inserted component
      def insert_piece(module_group, piece_spec, library_model = nil)
        entities = module_group.entities

        if library_model
          # Insert from library .skp
          insert_from_library(entities, piece_spec, library_model)
        else
          # Generate basic geometry (rectangular box)
          insert_basic_geometry(entities, piece_spec)
        end
      end

      # Insert a basic rectangular piece (when no library model is needed)
      # @param entities [Sketchup::Entities] parent entities
      # @param piece_spec [Hash] piece specification
      # @return [Sketchup::Group] the created piece group
      def insert_basic_geometry(entities, piece_spec)
        dims = piece_spec[:dimensions]
        pos  = piece_spec[:position] || { x: 0, y: 0, z: 0 }
        name = piece_spec[:name] || 'PIECE'
        orientation = piece_spec[:orientation] || :horizontal

        # Convert mm to SketchUp internal units (inches)
        length_i = mm_to_inch(dims[:length])
        width_i  = mm_to_inch(dims[:width])
        thick_i  = mm_to_inch(dims[:thickness])

        pos_x = mm_to_inch(pos[:x])
        pos_y = mm_to_inch(pos[:y])
        pos_z = mm_to_inch(pos[:z])

        group = entities.add_group
        group.name = name

        # Create the rectangular face based on orientation
        case orientation
        when :horizontal
          # Piece lies flat (e.g., base, top, shelf)
          # Length along X, Width along Y, Thickness along Z
          pts = [
            Geom::Point3d.new(0, 0, 0),
            Geom::Point3d.new(length_i, 0, 0),
            Geom::Point3d.new(length_i, width_i, 0),
            Geom::Point3d.new(0, width_i, 0),
          ]
          face = group.entities.add_face(pts)
          face.pushpull(-thick_i) if face

        when :vertical
          # Piece stands upright (e.g., lateral, door)
          # Length along Z (height), Width along Y (depth), Thickness along X
          pts = [
            Geom::Point3d.new(0, 0, 0),
            Geom::Point3d.new(0, width_i, 0),
            Geom::Point3d.new(0, width_i, length_i),
            Geom::Point3d.new(0, 0, length_i),
          ]
          face = group.entities.add_face(pts)
          face.pushpull(thick_i) if face
        end

        # Position the piece
        tr = Geom::Transformation.new([pos_x, pos_y, pos_z])
        entities.transform_entities(tr, group)

        # Set Ornato attributes
        set_ornato_attributes(group, piece_spec)

        group
      end

      # Insert a model from the library
      # @param entities [Sketchup::Entities] parent entities
      # @param piece_spec [Hash] piece specification
      # @param library_model [String] library model name
      # @return [Sketchup::ComponentInstance] inserted component
      def insert_from_library(entities, piece_spec, library_model)
        skp_path = get_model_path(library_model)

        unless skp_path && File.exist?(skp_path)
          # Fallback: try downloading from server
          skp_path = download_model(library_model)
        end

        if skp_path && File.exist?(skp_path)
          # Load the component definition
          model = Sketchup.active_model
          cdef = model.definitions.load(skp_path)

          if cdef
            # Calculate required scaling
            dims = piece_spec[:dimensions]
            pos  = piece_spec[:position] || { x: 0, y: 0, z: 0 }

            # Get original bounds of the loaded component
            bounds = cdef.bounds
            orig_w = bounds.width.to_mm
            orig_h = bounds.height.to_mm
            orig_d = bounds.depth.to_mm

            # Calculate scale factors
            scale_x = dims[:length] / [orig_w, 0.1].max
            scale_y = dims[:width]  / [orig_d, 0.1].max
            scale_z = dims[:thickness] / [orig_h, 0.1].max

            # Create transformation: scale + translate
            pos_point = Geom::Point3d.new(
              mm_to_inch(pos[:x]),
              mm_to_inch(pos[:y]),
              mm_to_inch(pos[:z])
            )

            scale_tr = Geom::Transformation.scaling(scale_x, scale_y, scale_z)
            move_tr  = Geom::Transformation.new(pos_point)
            combined = move_tr * scale_tr

            # Insert the component
            instance = entities.add_instance(cdef, combined)
            instance.name = piece_spec[:name] || 'PIECE'

            # Set Ornato attributes
            set_ornato_attributes(instance, piece_spec)

            return instance
          end
        end

        # Fallback to basic geometry if library model not available
        UI.messagebox("Modelo '#{library_model}' não encontrado na biblioteca.\nUsando geometria básica.")
        insert_basic_geometry(entities, piece_spec)
      end

      # Download a model from the server
      # @param model_name [String] model name (category/name format)
      # @return [String, nil] local file path or nil
      def download_model(model_name)
        require 'net/http'
        require 'uri'

        # model_name format: "portas/porta_lisa" or just "porta_lisa"
        parts = model_name.split('/')
        if parts.length == 2
          category = parts[0]
          name = parts[1]
        else
          category = detect_category(model_name)
          name = model_name
        end

        url = URI.parse("#{@server_url}/api/biblioteca/modelo/#{category}/#{name}")

        begin
          http = Net::HTTP.new(url.host, url.port)
          http.use_ssl = (url.scheme == 'https')
          http.open_timeout = 10
          http.read_timeout = 60

          request = Net::HTTP::Get.new(url.path)
          request['Authorization'] = "Bearer #{@auth_token}"

          response = http.request(request)

          if response.code == '200'
            cache_path = File.join(LIBRARY_CACHE_DIR, category)
            FileUtils.mkdir_p(cache_path)

            file_path = File.join(cache_path, "#{name}.skp")
            File.open(file_path, 'wb') { |f| f.write(response.body) }

            return file_path
          else
            puts "Ornato: Failed to download model #{model_name}: HTTP #{response.code}"
            return nil
          end
        rescue StandardError => e
          puts "Ornato: Error downloading model #{model_name}: #{e.message}"
          return nil
        end
      end

      private

      # Set Ornato-specific attributes on a piece
      def set_ornato_attributes(entity, spec)
        dict_name = 'ornato'

        entity.set_attribute(dict_name, 'orn_name',        spec[:name] || '')
        entity.set_attribute(dict_name, 'orn_role',        (spec[:role] || '').to_s)
        entity.set_attribute(dict_name, 'orn_label',       spec[:label] || '')
        entity.set_attribute(dict_name, 'orn_orientation', (spec[:orientation] || :horizontal).to_s)

        if spec[:dimensions]
          entity.set_attribute(dict_name, 'orn_length',    spec[:dimensions][:length])
          entity.set_attribute(dict_name, 'orn_width',     spec[:dimensions][:width])
          entity.set_attribute(dict_name, 'orn_thickness', spec[:dimensions][:thickness])
        end

        # Closure-specific attributes
        if spec[:closure_type]
          entity.set_attribute(dict_name, 'orn_closure_type', spec[:closure_type].to_s)
          entity.set_attribute(dict_name, 'orn_overlay', spec[:overlay].to_s) if spec[:overlay]
          entity.set_attribute(dict_name, 'orn_handle_position', spec[:handle_position].to_s) if spec[:handle_position]
          entity.set_attribute(dict_name, 'orn_mechanism', spec[:mechanism].to_s) if spec[:mechanism]
        end

        # Set Dynamic Component attributes if present
        if spec[:dc_formula]
          dc_dict = 'dynamic_attributes'
          spec[:dc_formula].each do |attr, formula|
            entity.set_attribute(dc_dict, attr.to_s.downcase, formula)
          end
        end
      end

      # Get local path for a library model
      def get_model_path(model_name)
        parts = model_name.split('/')
        if parts.length == 2
          category = parts[0]
          name = parts[1]
        else
          category = detect_category(model_name)
          name = model_name
        end

        # Check cache first
        cache_path = File.join(LIBRARY_CACHE_DIR, category, "#{name}.skp")
        return cache_path if File.exist?(cache_path)

        # Check bundled library
        bundled_path = File.join(
          File.dirname(__FILE__), '..', 'biblioteca', 'modelos', category, "#{name}.skp"
        )
        return bundled_path if File.exist?(bundled_path)

        nil
      end

      # Try to detect the category from the model name
      def detect_category(name)
        case name
        when /porta/i       then 'portas'
        when /frente/i      then 'frentes'
        when /gaveta/i      then 'gavetas'
        when /puxador/i     then 'puxadores'
        when /prateleira/i  then 'prateleiras'
        when /lateral/i     then 'ferragens'
        when /base/i        then 'ferragens'
        when /dobradica/i   then 'ferragens'
        when /corredica/i   then 'ferragens'
        when /minifix/i     then 'ferragens'
        when /corpo/i       then 'corpos'
        when /basculante/i  then 'basculantes'
        when /aereo/i       then 'aereos'
        when /balcao/i      then 'balcoes'
        when /roup/i        then 'roupeiros'
        else 'outros'
        end
      end

      # Ensure cache directory exists
      def ensure_cache_dir
        FileUtils.mkdir_p(LIBRARY_CACHE_DIR) unless File.directory?(LIBRARY_CACHE_DIR)
      rescue StandardError
        # May not have write permissions in plugins folder
        @cache_dir = File.join(Dir.tmpdir, 'ornato_cache')
        FileUtils.mkdir_p(@cache_dir)
      end

      # Convert mm to inches
      def mm_to_inch(mm)
        mm.to_f / 25.4
      end

    end
  end
end
