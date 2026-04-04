# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# MaterialCatalog — Catalogo de materiais (chapas e bordas)
#
# Gerencia o catalogo de chapas e fitas de borda disponiveis,
# com precos por m2 (chapas) e por metro linear (bordas).
#
# Os dados podem ser:
#   1. Locais (hardcoded defaults)
#   2. Carregados de JSON na pasta biblioteca/
#   3. Sincronizados com o ERP via API
#
# Uso:
#   catalog = Catalog::MaterialCatalog.new
#   catalog.sheet_price("MDF_18_BRANCO_TX") => 85.00 (R$/m2)
#   catalog.edge_price("BOR_2x22_BRANCO_TX") => 3.50 (R$/m)
#   catalog.calculate_cost(analysis) => { sheets: X, edges: Y, total: Z }
# ═══════════════════════════════════════════════════════════════

require 'json'

module Ornato
  module Catalog
    class MaterialCatalog
      # Default sheet prices (R$ per m2)
      DEFAULT_SHEETS = {
        'MDF_3'  => { description: 'MDF 3mm',  thickness: 3,  price_m2: 18.0 },
        'MDF_6'  => { description: 'MDF 6mm',  thickness: 6,  price_m2: 32.0 },
        'MDF_9'  => { description: 'MDF 9mm',  thickness: 9,  price_m2: 42.0 },
        'MDF_12' => { description: 'MDF 12mm', thickness: 12, price_m2: 55.0 },
        'MDF_15' => { description: 'MDF 15mm', thickness: 15, price_m2: 65.0 },
        'MDF_18' => { description: 'MDF 18mm', thickness: 18, price_m2: 78.0 },
        'MDF_25' => { description: 'MDF 25mm', thickness: 25, price_m2: 110.0 },
        'MDP_15' => { description: 'MDP 15mm', thickness: 15, price_m2: 45.0 },
        'MDP_18' => { description: 'MDP 18mm', thickness: 18, price_m2: 52.0 },
        'MDP_25' => { description: 'MDP 25mm', thickness: 25, price_m2: 85.0 },
      }.freeze

      # Default edge prices (R$ per meter)
      DEFAULT_EDGES = {
        'BOR_04x22' => { description: 'Fita 0.4mm x 22mm', thickness: 0.4, height: 22, price_m: 1.20 },
        'BOR_1x22'  => { description: 'Fita 1mm x 22mm',   thickness: 1.0, height: 22, price_m: 2.50 },
        'BOR_2x22'  => { description: 'Fita 2mm x 22mm',   thickness: 2.0, height: 22, price_m: 4.80 },
        'BOR_2x28'  => { description: 'Fita 2mm x 28mm',   thickness: 2.0, height: 28, price_m: 5.50 },
        'BOR_2x45'  => { description: 'Fita 2mm x 45mm',   thickness: 2.0, height: 45, price_m: 7.20 },
        'BOR_3x22'  => { description: 'Fita 3mm x 22mm',   thickness: 3.0, height: 22, price_m: 8.50 },
        'BOR_3x33'  => { description: 'Fita 3mm x 33mm',   thickness: 3.0, height: 33, price_m: 10.0 },
      }.freeze

      # Standard sheet sizes (mm)
      SHEET_SIZES = [
        { width: 2750, height: 1830, name: '2750x1830 (padrao)' },
        { width: 2750, height: 1850, name: '2750x1850' },
        { width: 2440, height: 1830, name: '2440x1830' },
        { width: 2440, height: 1220, name: '2440x1220' },
        { width: 1830, height: 1220, name: '1830x1220 (meia chapa)' },
      ].freeze

      attr_reader :sheets, :edges

      def initialize(config = {})
        @sheets = load_sheets(config)
        @edges  = load_edges(config)
      end

      # Get sheet price per m2 for a material code
      def sheet_price(material_code)
        # Try exact match first
        return @sheets[material_code][:price_m2] if @sheets[material_code]

        # Try base match (strip color/texture)
        base = material_code.to_s.split('_')[0..1].join('_')
        return @sheets[base][:price_m2] if @sheets[base]

        # Fallback: guess by thickness
        thickness = extract_thickness(material_code)
        match = @sheets.values.find { |s| s[:thickness] == thickness }
        match ? match[:price_m2] : 78.0  # default MDF 18mm price
      end

      # Get edge price per meter for an edge code
      def edge_price(edge_code)
        return @edges[edge_code][:price_m] if @edges[edge_code]

        # Try base match (strip color/texture)
        base = edge_code.to_s.split('_')[0..1].join('_')
        return @edges[base][:price_m] if @edges[base]

        4.80  # default 2mm edge price
      end

      # Calculate total material cost from analysis data
      #
      # @param analysis [Hash] from ModelAnalyzer
      # @return [Hash] { sheets: {mat => {area, cost}}, edges: {type => {length, cost}}, total: X }
      def calculate_cost(analysis)
        sheet_costs = {}
        edge_costs  = {}
        total = 0

        (analysis[:pieces] || []).each do |piece_info|
          piece = piece_info[:piece] || piece_info

          mat = extract_material(piece)
          length = piece_dim(piece, :width)  || 0
          width  = piece_dim(piece, :height) || 0
          area_m2 = (length * width) / 1_000_000.0

          sheet_costs[mat] ||= { area_m2: 0, price_m2: sheet_price(mat), cost: 0, pieces: 0 }
          sheet_costs[mat][:area_m2] += area_m2
          sheet_costs[mat][:pieces] += 1
          piece_cost = area_m2 * sheet_costs[mat][:price_m2]
          sheet_costs[mat][:cost] += piece_cost
          total += piece_cost

          # Edge costs
          edges = extract_edges(piece)
          edges.each do |side, edge_code|
            next if edge_code.nil? || edge_code == 'none'

            edge_length_m = case side
                            when :top, :bottom then length / 1000.0
                            when :left, :right then width / 1000.0
                            else 0
                            end

            edge_costs[edge_code] ||= { length_m: 0, price_m: edge_price(edge_code), cost: 0 }
            edge_costs[edge_code][:length_m] += edge_length_m
            edge_cost = edge_length_m * edge_costs[edge_code][:price_m]
            edge_costs[edge_code][:cost] += edge_cost
            total += edge_cost
          end
        end

        # Round all costs
        sheet_costs.each { |_, v| v[:area_m2] = v[:area_m2].round(3); v[:cost] = v[:cost].round(2) }
        edge_costs.each  { |_, v| v[:length_m] = v[:length_m].round(2); v[:cost] = v[:cost].round(2) }

        {
          sheets: sheet_costs,
          edges: edge_costs,
          total_sheets: sheet_costs.values.sum { |v| v[:cost] }.round(2),
          total_edges: edge_costs.values.sum { |v| v[:cost] }.round(2),
          total: total.round(2),
        }
      end

      # List all available sheet materials
      def list_sheets
        @sheets.map { |code, data| { code: code }.merge(data) }
      end

      # List all available edge types
      def list_edges
        @edges.map { |code, data| { code: code }.merge(data) }
      end

      # List standard sheet sizes
      def list_sheet_sizes
        SHEET_SIZES
      end

      # Calculate number of sheets needed (rough estimate)
      def sheets_needed(material_code, total_area_m2, waste_factor: 1.15)
        size = SHEET_SIZES.first
        sheet_area_m2 = (size[:width] * size[:height]) / 1_000_000.0
        ((total_area_m2 * waste_factor) / sheet_area_m2).ceil
      end

      private

      def load_sheets(config)
        sheets = DEFAULT_SHEETS.dup

        # Try loading from biblioteca/materiais/
        json_path = File.join(PLUGIN_DIR, 'biblioteca', 'materiais', 'chapas.json')
        if File.exist?(json_path)
          begin
            data = JSON.parse(File.read(json_path), symbolize_names: true)
            data.each { |item| sheets[item[:code]] = item }
          rescue => e
            puts "Ornato MaterialCatalog: Erro ao carregar chapas.json: #{e.message}"
          end
        end

        # Merge with config overrides
        (config[:sheet_prices] || {}).each { |code, price| sheets[code.to_s] = sheets.fetch(code.to_s, {}).merge(price_m2: price) }

        sheets
      end

      def load_edges(config)
        edges = DEFAULT_EDGES.dup

        json_path = File.join(PLUGIN_DIR, 'biblioteca', 'bordas', 'bordas.json')
        if File.exist?(json_path)
          begin
            data = JSON.parse(File.read(json_path), symbolize_names: true)
            data.each { |item| edges[item[:code]] = item }
          rescue => e
            puts "Ornato MaterialCatalog: Erro ao carregar bordas.json: #{e.message}"
          end
        end

        (config[:edge_prices] || {}).each { |code, price| edges[code.to_s] = edges.fetch(code.to_s, {}).merge(price_m: price) }

        edges
      end

      def extract_material(piece)
        if piece.respond_to?(:entity) && piece.entity.respond_to?(:get_attribute)
          piece.entity.get_attribute('ornato', 'material', nil)
        elsif piece.is_a?(Hash)
          piece[:material]
        end || "MDF_#{piece_dim(piece, :thickness)&.to_i || 18}"
      end

      def extract_thickness(code)
        parts = code.to_s.split('_')
        parts[1].to_i if parts.length >= 2
      end

      def extract_edges(piece)
        edges = { top: 'none', bottom: 'none', left: 'none', right: 'none' }
        return edges unless piece.respond_to?(:entity) && piece.entity.respond_to?(:get_attribute)

        %w[top bottom left right].each do |side|
          val = piece.entity.get_attribute('ornato', "edge_#{side}", nil)
          edges[side.to_sym] = val || 'none'
        end
        edges
      end

      def piece_dim(piece, dim)
        return piece.send(dim) if piece.respond_to?(dim)
        return piece[dim] if piece.is_a?(Hash)
        nil
      end
    end
  end
end
