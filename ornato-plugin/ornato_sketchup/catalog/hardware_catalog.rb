# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# HardwareCatalog — Catalogo de ferragens para marcenaria
#
# Armazena especificacoes tecnicas reais de ferragens dos
# principais fabricantes (Blum, Hettich, Hafele, Grass).
# Usado para configurar parametros de furacao automatica.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Catalog
    class HardwareCatalog

      # ══════════════════════════════════════════════════════
      # DOBRADICAS (Hinges)
      # ══════════════════════════════════════════════════════

      HINGES = [
        {
          id: 'blum_clip_top_110',
          brand: 'Blum',
          model: 'CLIP top 110\u00B0',
          category: :hinge,
          specs: {
            cup_diameter: 35.0,
            cup_depth: 11.5,
            pilot_diameter: 2.5,
            pilot_depth: 10.0,
            pilot_spacing: 24.0,
            edge_offset: 22.5,
            angle: 110,
          },
          description: 'Dobradica Blum CLIP top 110\u00B0 com amortecedor integrado',
        },
        {
          id: 'blum_clip_top_155',
          brand: 'Blum',
          model: 'CLIP top 155\u00B0',
          category: :hinge,
          specs: {
            cup_diameter: 35.0,
            cup_depth: 11.5,
            pilot_diameter: 2.5,
            pilot_depth: 10.0,
            pilot_spacing: 24.0,
            edge_offset: 22.5,
            angle: 155,
          },
          description: 'Dobradica Blum CLIP top 155\u00B0 para portas com abertura ampla',
        },
        {
          id: 'blum_clip_top_170',
          brand: 'Blum',
          model: 'CLIP top 170\u00B0',
          category: :hinge,
          specs: {
            cup_diameter: 35.0,
            cup_depth: 11.5,
            pilot_diameter: 2.5,
            pilot_depth: 10.0,
            pilot_spacing: 24.0,
            edge_offset: 22.5,
            angle: 170,
          },
          description: 'Dobradica Blum CLIP top 170\u00B0 para portas com abertura maxima',
        },
        {
          id: 'hettich_sensys_110',
          brand: 'Hettich',
          model: 'Sensys 110\u00B0',
          category: :hinge,
          specs: {
            cup_diameter: 35.0,
            cup_depth: 12.0,
            pilot_diameter: 2.5,
            pilot_depth: 10.0,
            pilot_spacing: 24.0,
            edge_offset: 22.5,
            angle: 110,
          },
          description: 'Dobradica Hettich Sensys 110\u00B0 com Silent System',
        },
        {
          id: 'hettich_sensys_155',
          brand: 'Hettich',
          model: 'Sensys 155\u00B0',
          category: :hinge,
          specs: {
            cup_diameter: 35.0,
            cup_depth: 12.0,
            pilot_diameter: 2.5,
            pilot_depth: 10.0,
            pilot_spacing: 24.0,
            edge_offset: 22.5,
            angle: 155,
          },
          description: 'Dobradica Hettich Sensys 155\u00B0 abertura ampla com Silent System',
        },
        {
          id: 'hafele_concepta_110',
          brand: 'Hafele',
          model: 'Concepta 110\u00B0',
          category: :hinge,
          specs: {
            cup_diameter: 35.0,
            cup_depth: 12.5,
            pilot_diameter: 2.5,
            pilot_depth: 10.0,
            pilot_spacing: 24.0,
            edge_offset: 22.5,
            angle: 110,
          },
          description: 'Dobradica Hafele Concepta 110\u00B0 com amortecimento',
        },
        {
          id: 'grass_tiomos_110',
          brand: 'Grass',
          model: 'Tiomos 110\u00B0',
          category: :hinge,
          specs: {
            cup_diameter: 35.0,
            cup_depth: 12.0,
            pilot_diameter: 2.5,
            pilot_depth: 10.0,
            pilot_spacing: 24.0,
            edge_offset: 22.5,
            angle: 110,
          },
          description: 'Dobradica Grass Tiomos 110\u00B0 com Soft-close integrado',
        },
        {
          id: 'generica_110',
          brand: 'Generica',
          model: 'Dobradica 110\u00B0',
          category: :hinge,
          specs: {
            cup_diameter: 35.0,
            cup_depth: 12.5,
            pilot_diameter: 2.5,
            pilot_depth: 10.0,
            pilot_spacing: 24.0,
            edge_offset: 22.5,
            angle: 110,
          },
          description: 'Dobradica generica 110\u00B0 padrao para marcenaria (caneco 35mm)',
        },
      ].freeze

      # ══════════════════════════════════════════════════════
      # MINIFIX (Cam Lock / Excentric)
      # ══════════════════════════════════════════════════════

      MINIFIX = [
        {
          id: 'hafele_minifix_15',
          brand: 'Hafele',
          model: 'Minifix 15',
          category: :minifix,
          specs: {
            body_diameter: 15.0,
            body_depth: 12.5,
            pin_diameter: 8.0,
            pin_depth: 11.0,
            bolt_diameter: 8.0,
            bolt_depth: 34.0,
            bolt_length: 34.0,
            housing_diameter: 15.0,
            housing_depth: 12.5,
          },
          description: 'Minifix Hafele 15mm - conexao rapida com capa decorativa',
        },
        {
          id: 'hettich_vb_35',
          brand: 'Hettich',
          model: 'VB 35/36',
          category: :minifix,
          specs: {
            body_diameter: 15.0,
            body_depth: 12.7,
            pin_diameter: 8.0,
            pin_depth: 11.0,
            bolt_diameter: 7.0,
            bolt_depth: 34.0,
            bolt_length: 34.0,
            housing_diameter: 15.0,
            housing_depth: 12.7,
          },
          description: 'Hettich VB 35/36 - conector excentrico com encaixe rapido',
        },
        {
          id: 'blum_expando_t',
          brand: 'Blum',
          model: 'EXPANDO T',
          category: :minifix,
          specs: {
            body_diameter: 15.0,
            body_depth: 12.5,
            pin_diameter: 8.0,
            pin_depth: 11.0,
            bolt_diameter: 8.0,
            bolt_depth: 34.0,
            bolt_length: 34.0,
            housing_diameter: 15.0,
            housing_depth: 12.5,
          },
          description: 'Blum EXPANDO T - conector excentrico expansivo',
        },
        {
          id: 'generico_minifix_15',
          brand: 'Generico',
          model: 'Minifix 15mm',
          category: :minifix,
          specs: {
            body_diameter: 15.0,
            body_depth: 12.0,
            pin_diameter: 8.0,
            pin_depth: 11.0,
            bolt_diameter: 8.0,
            bolt_depth: 34.0,
            bolt_length: 34.0,
            housing_diameter: 15.0,
            housing_depth: 12.0,
          },
          description: 'Minifix generico 15mm - padrao para marcenaria',
        },
      ].freeze

      # ══════════════════════════════════════════════════════
      # CORREDICAS (Drawer Slides)
      # ══════════════════════════════════════════════════════

      SLIDES = [
        {
          id: 'blum_tandem_350',
          brand: 'Blum',
          model: 'TANDEM 350mm',
          category: :slide,
          specs: {
            length: 350,
            hole_diameter: 4.0,
            fixing_positions: [37, 212, 350],
            height: 13.0,
            load_capacity: 30,
            full_extension: true,
            soft_close: true,
          },
          description: 'Blum TANDEM 350mm extracao total com BLUMOTION',
        },
        {
          id: 'blum_tandem_400',
          brand: 'Blum',
          model: 'TANDEM 400mm',
          category: :slide,
          specs: {
            length: 400,
            hole_diameter: 4.0,
            fixing_positions: [37, 237, 400],
            height: 13.0,
            load_capacity: 30,
            full_extension: true,
            soft_close: true,
          },
          description: 'Blum TANDEM 400mm extracao total com BLUMOTION',
        },
        {
          id: 'blum_tandem_450',
          brand: 'Blum',
          model: 'TANDEM 450mm',
          category: :slide,
          specs: {
            length: 450,
            hole_diameter: 4.0,
            fixing_positions: [37, 260, 450],
            height: 13.0,
            load_capacity: 30,
            full_extension: true,
            soft_close: true,
          },
          description: 'Blum TANDEM 450mm extracao total com BLUMOTION',
        },
        {
          id: 'blum_tandem_500',
          brand: 'Blum',
          model: 'TANDEM 500mm',
          category: :slide,
          specs: {
            length: 500,
            hole_diameter: 4.0,
            fixing_positions: [37, 200, 350, 500],
            height: 13.0,
            load_capacity: 30,
            full_extension: true,
            soft_close: true,
          },
          description: 'Blum TANDEM 500mm extracao total com BLUMOTION',
        },
        {
          id: 'blum_tandem_550',
          brand: 'Blum',
          model: 'TANDEM 550mm',
          category: :slide,
          specs: {
            length: 550,
            hole_diameter: 4.0,
            fixing_positions: [37, 200, 400, 550],
            height: 13.0,
            load_capacity: 30,
            full_extension: true,
            soft_close: true,
          },
          description: 'Blum TANDEM 550mm extracao total com BLUMOTION',
        },
        {
          id: 'blum_tandem_600',
          brand: 'Blum',
          model: 'TANDEM 600mm',
          category: :slide,
          specs: {
            length: 600,
            hole_diameter: 4.0,
            fixing_positions: [37, 200, 400, 600],
            height: 13.0,
            load_capacity: 30,
            full_extension: true,
            soft_close: true,
          },
          description: 'Blum TANDEM 600mm extracao total com BLUMOTION',
        },
        {
          id: 'hettich_actro_5d_500',
          brand: 'Hettich',
          model: 'Actro 5D 500mm',
          category: :slide,
          specs: {
            length: 500,
            hole_diameter: 4.0,
            fixing_positions: [37, 200, 350, 500],
            height: 12.5,
            load_capacity: 40,
            full_extension: true,
            soft_close: true,
          },
          description: 'Hettich Actro 5D 500mm extracao total com Silent System',
        },
        {
          id: 'generica_telescopica_400',
          brand: 'Generica',
          model: 'Telescopica 400mm',
          category: :slide,
          specs: {
            length: 400,
            hole_diameter: 4.0,
            fixing_positions: [37, 200, 400],
            height: 12.7,
            load_capacity: 25,
            full_extension: false,
            soft_close: false,
          },
          description: 'Corredica telescopica generica 400mm - extracao parcial',
        },
      ].freeze

      # ══════════════════════════════════════════════════════
      # PUXADORES (Handles)
      # ══════════════════════════════════════════════════════

      HANDLES = [
        {
          id: 'puxador_96',
          brand: 'Universal',
          model: 'Puxador 96mm',
          category: :handle,
          specs: {
            hole_spacing: 96,
            hole_diameter: 5.0,
            bolt_length: 25,
          },
          description: 'Puxador com entre-furos de 96mm',
        },
        {
          id: 'puxador_128',
          brand: 'Universal',
          model: 'Puxador 128mm',
          category: :handle,
          specs: {
            hole_spacing: 128,
            hole_diameter: 5.0,
            bolt_length: 25,
          },
          description: 'Puxador com entre-furos de 128mm',
        },
        {
          id: 'puxador_160',
          brand: 'Universal',
          model: 'Puxador 160mm',
          category: :handle,
          specs: {
            hole_spacing: 160,
            hole_diameter: 5.0,
            bolt_length: 25,
          },
          description: 'Puxador com entre-furos de 160mm',
        },
        {
          id: 'puxador_192',
          brand: 'Universal',
          model: 'Puxador 192mm',
          category: :handle,
          specs: {
            hole_spacing: 192,
            hole_diameter: 5.0,
            bolt_length: 25,
          },
          description: 'Puxador com entre-furos de 192mm',
        },
        {
          id: 'puxador_256',
          brand: 'Universal',
          model: 'Puxador 256mm',
          category: :handle,
          specs: {
            hole_spacing: 256,
            hole_diameter: 5.0,
            bolt_length: 25,
          },
          description: 'Puxador com entre-furos de 256mm',
        },
        {
          id: 'puxador_320',
          brand: 'Universal',
          model: 'Puxador 320mm',
          category: :handle,
          specs: {
            hole_spacing: 320,
            hole_diameter: 5.0,
            bolt_length: 25,
          },
          description: 'Puxador com entre-furos de 320mm',
        },
      ].freeze

      # ══════════════════════════════════════════════════════
      # CAVILHAS (Dowels)
      # ══════════════════════════════════════════════════════

      DOWELS = [
        {
          id: 'cavilha_6x30',
          brand: 'Universal',
          model: 'Cavilha 6x30mm',
          category: :dowel,
          specs: {
            diameter: 6.0,
            length: 30.0,
            hole_depth: 15.0,
            hole_diameter: 6.0,
          },
          description: 'Cavilha estriada 6x30mm para uniao de paineis finos',
        },
        {
          id: 'cavilha_8x30',
          brand: 'Universal',
          model: 'Cavilha 8x30mm',
          category: :dowel,
          specs: {
            diameter: 8.0,
            length: 30.0,
            hole_depth: 15.0,
            hole_diameter: 8.0,
          },
          description: 'Cavilha estriada 8x30mm - padrao para marcenaria',
        },
        {
          id: 'cavilha_10x40',
          brand: 'Universal',
          model: 'Cavilha 10x40mm',
          category: :dowel,
          specs: {
            diameter: 10.0,
            length: 40.0,
            hole_depth: 20.0,
            hole_diameter: 10.0,
          },
          description: 'Cavilha estriada 10x40mm para uniao de paineis grossos',
        },
      ].freeze

      # ══════════════════════════════════════════════════════
      # Public API
      # ══════════════════════════════════════════════════════

      def self.all_hinges
        HINGES
      end

      def self.all_minifix
        MINIFIX
      end

      def self.all_slides
        SLIDES
      end

      def self.all_handles
        HANDLES
      end

      def self.all_dowels
        DOWELS
      end

      # All items in all categories
      def self.all
        HINGES + MINIFIX + SLIDES + HANDLES + DOWELS
      end

      # Find a specific item by category, brand, and model (partial match)
      #
      # @param category [Symbol] :hinge, :minifix, :slide, :handle, :dowel
      # @param brand [String] brand name (case-insensitive partial match)
      # @param model [String] model name (case-insensitive partial match)
      # @return [Hash, nil] the matching item or nil
      def self.find(category, brand = nil, model = nil)
        items = items_for_category(category)
        return nil if items.empty?

        items.find do |item|
          brand_match = brand.nil? || item[:brand].downcase.include?(brand.downcase)
          model_match = model.nil? || item[:model].downcase.include?(model.downcase)
          brand_match && model_match
        end
      end

      # Find by ID
      #
      # @param id [String] item ID (e.g. 'blum_clip_top_110')
      # @return [Hash, nil]
      def self.find_by_id(id)
        all.find { |item| item[:id] == id.to_s }
      end

      # Search across all categories
      #
      # @param query [String] search term (matches brand, model, description)
      # @return [Array<Hash>] matching items
      def self.search(query)
        q = query.to_s.downcase.strip
        return all if q.empty?

        all.select do |item|
          item[:brand].downcase.include?(q) ||
            item[:model].downcase.include?(q) ||
            item[:description].downcase.include?(q) ||
            item[:id].downcase.include?(q)
        end
      end

      # Default hardware spec for each category — used when no specific
      # item is selected by the user.
      #
      # @return [Hash] category => item hash
      def self.defaults
        {
          hinge:   find_by_id('generica_110'),
          minifix: find_by_id('generico_minifix_15'),
          slide:   find_by_id('generica_telescopica_400'),
          handle:  find_by_id('puxador_160'),
          dowel:   find_by_id('cavilha_8x30'),
        }
      end

      # Convert a catalog item's specs to the format used by Ornato::Config
      #
      # @param item [Hash] catalog item
      # @return [Hash] config-compatible specs
      def self.to_config_specs(item)
        return {} unless item
        category = item[:category]
        specs = item[:specs] || {}

        case category
        when :hinge
          {
            cup_diameter: specs[:cup_diameter],
            cup_depth: specs[:cup_depth],
            pilot_diameter: specs[:pilot_diameter],
            pilot_depth: specs[:pilot_depth],
            pilot_spacing: specs[:pilot_spacing],
            edge_offset: specs[:edge_offset],
          }
        when :minifix
          {
            body_diameter: specs[:body_diameter] || specs[:housing_diameter],
            body_depth: specs[:body_depth] || specs[:housing_depth],
            pin_diameter: specs[:pin_diameter],
            pin_depth: specs[:pin_depth],
            bolt_diameter: specs[:bolt_diameter],
            bolt_depth: specs[:bolt_depth],
          }
        when :slide
          {
            hole_diameter: specs[:hole_diameter],
            patterns: { "#{specs[:length]}mm" => specs[:fixing_positions] },
          }
        when :handle
          {
            hole_diameter: specs[:hole_diameter],
            default_spacing: specs[:hole_spacing],
          }
        when :dowel
          {
            diameter: specs[:hole_diameter] || specs[:diameter],
            depth: specs[:hole_depth],
          }
        else
          specs
        end
      end

      # Serializes all catalog data as JSON (for HTML dialog consumption)
      #
      # @return [String] JSON string
      def self.to_json
        data = {
          hinges:  HINGES,
          minifix: MINIFIX,
          slides:  SLIDES,
          handles: HANDLES,
          dowels:  DOWELS,
          defaults: defaults.transform_values { |v| v ? v[:id] : nil },
        }
        JSON.generate(data)
      end

      private

      def self.items_for_category(category)
        case category.to_sym
        when :hinge, :hinges, :dobradica    then HINGES
        when :minifix, :cam_lock            then MINIFIX
        when :slide, :slides, :corredica    then SLIDES
        when :handle, :handles, :puxador    then HANDLES
        when :dowel, :dowels, :cavilha      then DOWELS
        else []
        end
      end
    end
  end
end
