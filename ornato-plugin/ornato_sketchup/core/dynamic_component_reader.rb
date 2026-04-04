# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# DynamicComponentReader — Leitura de atributos de Dynamic Components
#
# SketchUp Dynamic Components (DC) armazenam dados em
# attribute dictionaries especiais. Este modulo le esses
# atributos e os converte para o formato Ornato.
#
# Attribute dictionaries lidos:
#   "dynamic_attributes"   — atributos configurados pelo usuario
#   "SU_DefinitionSet"     — definicoes do componente
#   "ornato"               — atributos do plugin (prioridade)
#
# Dados extraidos:
#   - Dimensoes (LenX, LenY, LenZ, _lenx, _leny, _lenz)
#   - Material (material, _material)
#   - Nome/descricao (Name, _name, _description)
#   - Formulas (se houver — para componentes parametricos)
#   - Opcoes de configuracao (opcoes de dropdown, etc.)
#   - Atributos customizados definidos pelo criador do DC
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Core
    class DynamicComponentReader
      # Standard DC attribute names for dimensions (SketchUp stores in inches internally)
      DIM_ATTRS = {
        'lenx' => :length, '_lenx' => :length,
        'leny' => :width,  '_leny' => :width,
        'lenz' => :height, '_lenz' => :height,
      }.freeze

      # Attributes to skip (internal SketchUp DC attributes)
      SKIP_ATTRS = %w[
        _has_dc _lengthunits _formulaunits _access
        _isbehavior _formlabel _copies _scaletool
        onclick _onclick imageurl _imageurl
      ].freeze

      # Read all relevant DC attributes from an entity.
      #
      # @param entity [Sketchup::ComponentInstance, Sketchup::Group]
      # @return [Hash] parsed attributes or empty hash if not a DC
      def self.read(entity)
        return {} unless dynamic_component?(entity)

        result = {
          is_dynamic_component: true,
          dc_name: nil,
          dc_description: nil,
          dimensions: {},
          material: nil,
          custom_attributes: {},
          options: {},
          formulas: {},
        }

        dict = entity.attribute_dictionary('dynamic_attributes')
        return result unless dict

        dict.each_pair do |key, value|
          lkey = key.to_s.downcase

          # Skip internal attributes
          next if SKIP_ATTRS.include?(lkey)
          next if lkey.start_with?('_') && SKIP_ATTRS.include?(lkey)

          # Dimensions
          if DIM_ATTRS[lkey]
            dim_type = DIM_ATTRS[lkey]
            result[:dimensions][dim_type] = convert_to_mm(value)
            next
          end

          # Material
          if lkey == 'material' || lkey == '_material'
            result[:material] = value.to_s
            next
          end

          # Name / Description
          if lkey == 'name' || lkey == '_name'
            result[:dc_name] = value.to_s
            next
          end
          if lkey == 'description' || lkey == '_description'
            result[:dc_description] = value.to_s
            next
          end

          # Formulas (keys starting with _ that have corresponding display key)
          if lkey.start_with?('_') && !lkey.start_with?('__')
            display_key = lkey[1..]
            if dict[display_key]
              result[:formulas][display_key] = value.to_s
              next
            end
          end

          # Options (values that look like option lists)
          if value.is_a?(String) && value.include?('=')
            # Could be a formula — store in formulas
            result[:formulas][key] = value
            next
          end

          # Everything else is a custom attribute
          result[:custom_attributes][key] = value
        end

        # Also read the definition's DC attributes (for component-level settings)
        if entity.respond_to?(:definition)
          def_dict = entity.definition.attribute_dictionary('dynamic_attributes')
          if def_dict
            def_dict.each_pair do |key, value|
              lkey = key.to_s.downcase
              next if SKIP_ATTRS.include?(lkey)

              # Look for option lists in definition
              if lkey.end_with?('options') || lkey.end_with?('_options')
                result[:options][key.sub(/_?options$/i, '')] = parse_options(value)
              end

              # Look for formulas in definition (prefixed with _)
              if lkey.start_with?('_') && value.is_a?(String) && value =~ /[=+\-*\/()]/
                result[:formulas][key] = value
              end
            end
          end
        end

        result
      end

      # Check if entity is a Dynamic Component
      def self.dynamic_component?(entity)
        return false unless entity.respond_to?(:attribute_dictionary)
        dict = entity.attribute_dictionary('dynamic_attributes')
        return false unless dict

        # A true DC has at least _has_dc or lenx/leny/lenz
        dict['_has_dc'] || dict['lenx'] || dict['_lenx'] || dict.length > 2
      end

      # Convert all DC data to Ornato-compatible attributes.
      # Merges DC attributes with existing Ornato attributes,
      # with Ornato attributes taking priority.
      #
      # @param entity [Sketchup::ComponentInstance]
      # @return [Hash] merged attributes ready for piece detection
      def self.to_ornato_attributes(entity)
        dc_data = read(entity)
        return {} unless dc_data[:is_dynamic_component]

        ornato_attrs = {}

        # Map DC dimensions to Ornato expectations
        if dc_data[:dimensions][:length]
          ornato_attrs['dc_length'] = dc_data[:dimensions][:length]
        end
        if dc_data[:dimensions][:width]
          ornato_attrs['dc_width'] = dc_data[:dimensions][:width]
        end
        if dc_data[:dimensions][:height]
          ornato_attrs['dc_height'] = dc_data[:dimensions][:height]
        end

        # Map material
        if dc_data[:material]
          ornato_attrs['dc_material'] = dc_data[:material]
        end

        # Map DC name as fallback for piece recognition
        if dc_data[:dc_name]
          ornato_attrs['dc_name'] = dc_data[:dc_name]
        end

        # Include custom attributes with dc_ prefix
        dc_data[:custom_attributes].each do |k, v|
          ornato_attrs["dc_#{k}"] = v
        end

        ornato_attrs
      end

      # Batch-read all DCs in a group/model
      #
      # @param entities [Sketchup::Entities]
      # @return [Array<Hash>] array of { entity:, dc_data: }
      def self.scan_entities(entities)
        results = []

        entities.each do |ent|
          next unless ent.is_a?(Sketchup::ComponentInstance) || ent.is_a?(Sketchup::Group)

          if dynamic_component?(ent)
            results << {
              entity: ent,
              name: ent.respond_to?(:name) ? ent.name : '',
              dc_data: read(ent),
            }
          end

          # Recurse into groups
          if ent.respond_to?(:entities)
            sub = scan_entities(ent.entities)
            results.concat(sub)
          elsif ent.respond_to?(:definition)
            sub = scan_entities(ent.definition.entities)
            results.concat(sub)
          end
        end

        results
      end

      private

      # Convert SketchUp internal units (inches) to mm
      def self.convert_to_mm(value)
        return nil unless value
        v = value.to_f
        # SketchUp stores DC dimensions in inches
        (v * 25.4).round(2)
      rescue
        nil
      end

      # Parse DC option list format: "Option1=val1&Option2=val2"
      def self.parse_options(value)
        return [] unless value.is_a?(String)

        value.split('&').map do |pair|
          parts = pair.split('=')
          { label: parts[0].to_s.strip, value: parts[1].to_s.strip }
        end
      rescue
        []
      end
    end
  end
end
