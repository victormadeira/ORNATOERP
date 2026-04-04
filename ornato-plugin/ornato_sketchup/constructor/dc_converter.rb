# frozen_string_literal: true
# Ornato CNC Plugin - Dynamic Component Converter
# Converts an assembled module (created by ModuleBuilder) into a
# SketchUp Dynamic Component with parametric formulas.
# This allows the module to be resized and all pieces recalculate automatically.

module Ornato
  module Constructor
    class DCConverter

      # DC attribute keys used by SketchUp
      DC_DICT = 'dynamic_attributes'

      # Convert a module group to a Dynamic Component
      # @param module_group [Sketchup::Group] the module group to convert
      # @param module_spec [Hash] the module specification from ModuleBuilder#to_spec
      # @return [Sketchup::ComponentDefinition] the new DC definition
      def self.convert_to_dc(module_group, module_spec)
        model = Sketchup.active_model

        # Convert group to component if needed
        if module_group.is_a?(Sketchup::Group)
          component = module_group.to_component
          cdef = component.definition
        else
          component = module_group
          cdef = component.definition
        end

        cdef.name = module_spec[:name]

        # Set DC attributes on the parent component
        setup_parent_dc(component, module_spec)

        # Set DC formulas on each child piece
        setup_children_dc(cdef, module_spec)

        # Set Ornato metadata
        setup_ornato_metadata(component, module_spec)

        cdef
      end

      # Save a DC module to the library (upload to server)
      # @param component [Sketchup::ComponentInstance] the DC component
      # @param module_spec [Hash] the module specification
      # @param server_url [String] server URL
      # @param auth_token [String] JWT token
      # @return [Boolean] success
      def self.save_to_library(component, module_spec, server_url, auth_token)
        require 'net/http'
        require 'uri'
        require 'json'
        require 'tempfile'

        # Save component to a temporary .skp file
        temp_file = Tempfile.new(['ornato_module', '.skp'])
        temp_path = temp_file.path
        temp_file.close

        cdef = component.definition
        cdef.save_as(temp_path)

        # Upload to server
        url = URI.parse("#{server_url}/api/biblioteca/personalizado")

        begin
          boundary = "----OrnatoUpload#{Time.now.to_i}"

          body = build_multipart_body(boundary, temp_path, module_spec)

          http = Net::HTTP.new(url.host, url.port)
          http.use_ssl = (url.scheme == 'https')

          request = Net::HTTP::Post.new(url.path)
          request['Authorization'] = "Bearer #{auth_token}"
          request['Content-Type'] = "multipart/form-data; boundary=#{boundary}"
          request.body = body

          response = http.request(request)

          if response.code == '200' || response.code == '201'
            UI.messagebox("Módulo '#{module_spec[:name]}' salvo na biblioteca com sucesso!")
            return true
          else
            UI.messagebox("Erro ao salvar módulo: HTTP #{response.code}")
            return false
          end
        rescue StandardError => e
          UI.messagebox("Erro ao salvar módulo: #{e.message}")
          return false
        ensure
          File.delete(temp_path) if File.exist?(temp_path)
        end
      end

      private

      # Setup Dynamic Component attributes on the parent component
      def self.setup_parent_dc(component, spec)
        dims = spec[:dimensions]

        # Enable DC behavior
        component.set_attribute(DC_DICT, '_has_dynamic_attributes', true)
        component.set_attribute(DC_DICT, '_name', spec[:name])

        # Set main dimensions (in inches for SketchUp DC)
        component.set_attribute(DC_DICT, 'lenx', mm_to_inch(dims[:width]))
        component.set_attribute(DC_DICT, 'leny', mm_to_inch(dims[:depth]))
        component.set_attribute(DC_DICT, 'lenz', mm_to_inch(dims[:height]))

        # Custom Ornato parameters (accessible in child formulas)
        component.set_attribute(DC_DICT, 'orn_thickness', mm_to_inch(spec[:thickness]))
        component.set_attribute(DC_DICT, 'orn_back_thickness', mm_to_inch(spec[:back_thickness]))
        component.set_attribute(DC_DICT, 'orn_door_gap', mm_to_inch(2.0))

        # Module type for the plugin to recognize
        component.set_attribute(DC_DICT, 'orn_module_type', spec[:type].to_s)
        component.set_attribute(DC_DICT, 'orn_construction_type', spec[:construction_type].to_s)

        # User-visible attributes (shown in Component Options)
        set_dc_display_attr(component, 'orn_largura', dims[:width],
                           label: 'Largura (mm)', access: 'TEXTBOX')
        set_dc_display_attr(component, 'orn_altura', dims[:height],
                           label: 'Altura (mm)', access: 'TEXTBOX')
        set_dc_display_attr(component, 'orn_profundidade', dims[:depth],
                           label: 'Profundidade (mm)', access: 'TEXTBOX')
        set_dc_display_attr(component, 'orn_espessura', spec[:thickness],
                           label: 'Espessura (mm)', access: 'LIST',
                           options: '15;18;25')
      end

      # Setup DC formulas on child pieces
      def self.setup_children_dc(cdef, spec)
        dc_formulas = spec[:dc_formulas] || {}

        cdef.entities.each do |entity|
          next unless entity.respond_to?(:name)

          piece_name = entity.name
          formulas = dc_formulas[piece_name]
          next unless formulas

          # Set DC formulas for this piece
          formulas.each do |attr, formula|
            dc_attr = case attr
                      when :LenX then 'lenx'
                      when :LenY then 'leny'
                      when :LenZ then 'lenz'
                      when :X    then 'x'
                      when :Y    then 'y'
                      when :Z    then 'z'
                      else attr.to_s.downcase
                      end

            entity.set_attribute(DC_DICT, dc_attr, formula)
          end

          # Mark as DC sub-component
          entity.set_attribute(DC_DICT, '_has_dynamic_attributes', true)
        end
      end

      # Setup Ornato metadata (non-DC, for our plugin to read)
      def self.setup_ornato_metadata(component, spec)
        dict = 'ornato'

        component.set_attribute(dict, 'module_type', spec[:type].to_s)
        component.set_attribute(dict, 'construction_type', spec[:construction_type].to_s)
        component.set_attribute(dict, 'created_at', Time.now.iso8601)
        component.set_attribute(dict, 'version', '1.0')

        # Store piece list for the plugin
        if spec[:pieces]
          piece_names = spec[:pieces].map { |p| p[:name] }.compact.join(',')
          component.set_attribute(dict, 'piece_list', piece_names)
        end

        if spec[:closures]
          closure_names = spec[:closures].map { |c| c[:name] }.compact.join(',')
          component.set_attribute(dict, 'closure_list', closure_names)
        end

        if spec[:internals]
          internal_names = spec[:internals].map { |i| i[:name] }.compact.join(',')
          component.set_attribute(dict, 'internal_list', internal_names)
        end
      end

      # Helper to set a DC attribute with display properties
      def self.set_dc_display_attr(entity, name, value, options = {})
        entity.set_attribute(DC_DICT, name, value)

        if options[:label]
          entity.set_attribute(DC_DICT, "_#{name}_label", options[:label])
        end
        if options[:access]
          entity.set_attribute(DC_DICT, "_#{name}_access", options[:access])
        end
        if options[:options]
          entity.set_attribute(DC_DICT, "_#{name}_options", options[:options])
        end
      end

      # Build multipart form body for upload
      def self.build_multipart_body(boundary, file_path, metadata)
        body = ""

        # Add metadata JSON part
        body << "--#{boundary}\r\n"
        body << "Content-Disposition: form-data; name=\"metadata\"\r\n"
        body << "Content-Type: application/json\r\n\r\n"
        body << metadata.to_json
        body << "\r\n"

        # Add file part
        body << "--#{boundary}\r\n"
        body << "Content-Disposition: form-data; name=\"model\"; filename=\"#{File.basename(file_path)}\"\r\n"
        body << "Content-Type: application/octet-stream\r\n\r\n"
        body << File.binread(file_path)
        body << "\r\n"

        body << "--#{boundary}--\r\n"
        body
      end

      def self.mm_to_inch(mm)
        mm.to_f / 25.4
      end

    end
  end
end
