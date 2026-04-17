# =====================================================
# CsvExporter -- Exporta lista de corte como CSV
# Para compatibilidade com usuarios sem plugin
# =====================================================

require 'csv'

module Ornato
  module Export
    class CsvExporter
      HEADERS = [
        'Modulo',
        'Peca',
        'Comp',
        'Larg',
        'Esp',
        'Material',
        'Qtd',
        'Borda1',
        'Borda2',
        'Borda3',
        'Borda4',
        'Observacao',
      ].freeze

      SEPARATOR = ';'

      # @param analysis [Hash] resultado de ModelAnalyzer#analyze
      # @param config [Hash] configuracao do plugin
      def initialize(analysis, config = {})
        @analysis = analysis
        @config = config
      end

      # Gera conteudo CSV como string.
      #
      # @param separator [String] separador de colunas (default: ";")
      # @return [String] conteudo CSV completo
      def generate(separator: SEPARATOR)
        rows = build_rows
        to_csv_string(rows, separator)
      end

      # Salva CSV em arquivo.
      #
      # @param path [String] caminho do arquivo
      # @param separator [String] separador
      def save(path, separator: SEPARATOR)
        content = generate(separator: separator)
        File.write(path, "\xEF\xBB\xBF" + content, encoding: 'UTF-8') # BOM para Excel
      end

      private

      def build_rows
        rows = []
        pieces = @analysis[:pieces] || []
        modules = @analysis[:modules] || []
        mat_map = @config[:material_map] || @config['material_map'] || {}

        # Agrupar pecas por modulo para ordenacao
        grouped = group_pieces_by_module(pieces, modules)

        grouped.each do |mod_name, mod_pieces|
          mod_pieces.each do |piece|
            material_display = resolve_material_display(piece, mat_map)
            edges = piece[:edges] || {}

            rows << {
              modulo:     mod_name,
              peca:       piece[:name] || 'Sem nome',
              comp:       format_dim(piece[:comprimento]),
              larg:       format_dim(piece[:largura]),
              esp:        format_dim(piece[:espessura]),
              material:   material_display,
              qtd:        piece[:quantity] || 1,
              borda1:     edge_label(edges, :right),
              borda2:     edge_label(edges, :left),
              borda3:     edge_label(edges, :front),
              borda4:     edge_label(edges, :back),
              observacao: build_observation(piece),
            }
          end
        end

        rows
      end

      def group_pieces_by_module(pieces, modules)
        grouped = {}

        # Mapear group -> nome do modulo
        mod_map = {}
        modules.each { |m| mod_map[m[:group]] = m[:name] }

        pieces.each do |piece|
          mod_name = mod_map[piece[:module_group]] || piece[:module_name] || 'Avulso'
          grouped[mod_name] ||= []
          grouped[mod_name] << piece
        end

        # Ordenar: modulos alfabeticamente, pecas por comprimento desc
        sorted = {}
        grouped.keys.sort.each do |key|
          sorted[key] = grouped[key].sort_by { |p| -(p[:comprimento] || 0) }
        end

        sorted
      end

      def resolve_material_display(piece, mat_map)
        mat_name = piece[:material_name].to_s
        mapped = mat_map[mat_name]
        return mapped unless mapped.nil? || mapped.empty?
        return piece[:material_code] unless piece[:material_code].nil? || piece[:material_code].empty?

        mat_name.empty? ? 'N/D' : mat_name
      end

      def edge_label(edges, side)
        return '' unless edges.is_a?(Hash)

        val = edges[side] || edges[side.to_s]
        (val.nil? || val.to_s.empty?) ? '' : val.to_s
      end

      def format_dim(val)
        return '0' if val.nil?

        # Remover .0 para valores inteiros
        val.to_f == val.to_f.round(0) ? val.to_f.round(0).to_s : val.to_f.round(1).to_s
      end

      def build_observation(piece)
        notes = []
        notes << "Veio: #{piece[:grain]}" if piece[:grain] && piece[:grain] != 'sem_veio'
        notes << piece[:role].to_s.capitalize if piece[:role] && piece[:role] != :unknown
        notes.join(' | ')
      end

      def to_csv_string(rows, separator)
        lines = []
        lines << HEADERS.join(separator)

        rows.each do |row|
          line = [
            row[:modulo],
            row[:peca],
            row[:comp],
            row[:larg],
            row[:esp],
            row[:material],
            row[:qtd],
            row[:borda1],
            row[:borda2],
            row[:borda3],
            row[:borda4],
            row[:observacao],
          ]
          lines << line.map { |v| escape_csv_field(v.to_s, separator) }.join(separator)
        end

        lines.join("\n") + "\n"
      end

      def escape_csv_field(value, separator)
        if value.include?(separator) || value.include?('"') || value.include?("\n")
          '"' + value.gsub('"', '""') + '"'
        else
          value
        end
      end
    end
  end
end
