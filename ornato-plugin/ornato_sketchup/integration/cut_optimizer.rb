# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# CutOptimizer — Integracao com o otimizador de corte do ERP
#
# Envia a lista de pecas (agrupada por material + espessura)
# para o servico de otimizacao de corte e recebe o plano
# de corte otimizado.
#
# API endpoints:
#   POST /api/cnc/optimize — envia lista de pecas, recebe planos
#   GET  /api/cnc/sheets   — lista chapas disponiveis
#
# O resultado pode ser visualizado no SketchUp ou exportado.
# ═══════════════════════════════════════════════════════════════

require 'net/http'
require 'json'
require 'uri'

module Ornato
  module Integration
    class CutOptimizer
      def initialize(config = {})
        @api_url = config.dig(:api, :url) || 'http://localhost:3001'
        @token = read_auth_token
      end

      # Generate cut list from analysis data, grouped by material
      #
      # @param analysis [Hash] from ModelAnalyzer
      # @param machining [Hash] from RulesEngine
      # @return [Hash] { materials: { "MDF_18" => { pieces: [...], total_area: X } } }
      def generate_cut_list(analysis, machining = {})
        materials = {}

        (analysis[:pieces] || []).each do |piece_info|
          piece = piece_info[:piece] || piece_info

          mat_key = extract_material_key(piece)
          materials[mat_key] ||= {
            material: mat_key,
            thickness: piece_thickness(piece),
            pieces: [],
            total_area_mm2: 0,
            total_area_m2: 0,
            total_edge_mm: 0,
          }

          length = piece_dim(piece, :width)  || 0
          width  = piece_dim(piece, :height) || 0

          # Determine grain direction
          grain = 'length'
          if piece.respond_to?(:entity) && piece.entity.respond_to?(:get_attribute)
            grain = piece.entity.get_attribute('ornato', 'grain_direction', 'length')
          end

          # Calculate edge banding total
          edge_total = calculate_edge_length(piece, length, width)

          entry = {
            id: piece_id(piece),
            name: piece_name(piece),
            length: length.round(1),
            width: width.round(1),
            quantity: 1,
            grain: grain,
            can_rotate: grain == 'none',
            edges: extract_edges(piece),
            edge_total_mm: edge_total,
            has_machining: machining.key?(piece_id(piece)),
          }

          materials[mat_key][:pieces] << entry
          materials[mat_key][:total_area_mm2] += length * width
          materials[mat_key][:total_area_m2] = (materials[mat_key][:total_area_mm2] / 1_000_000.0).round(3)
          materials[mat_key][:total_edge_mm] += edge_total
        end

        { materials: materials }
      end

      # Send cut list to the CNC optimizer API
      #
      # @param cut_list [Hash] from generate_cut_list
      # @return [Hash] optimization result or error
      def optimize(cut_list)
        uri = URI.parse("#{@api_url}/api/cnc/optimize")

        request = Net::HTTP::Post.new(uri.path)
        request['Content-Type'] = 'application/json'
        request['Authorization'] = "Bearer #{@token}" if @token

        request.body = cut_list.to_json

        response = Net::HTTP.start(uri.host, uri.port,
                                   use_ssl: uri.scheme == 'https',
                                   open_timeout: 10,
                                   read_timeout: 60) do |http|
          http.request(request)
        end

        if response.code.to_i == 200
          result = JSON.parse(response.body)
          { success: true, data: result }
        else
          { success: false, error: "HTTP #{response.code}: #{response.body}" }
        end
      rescue => e
        { success: false, error: e.message }
      end

      # Fetch available sheet sizes from the ERP
      #
      # @return [Array<Hash>] list of sheets { material, width, height, price }
      def fetch_available_sheets
        uri = URI.parse("#{@api_url}/api/cnc/sheets")
        request = Net::HTTP::Get.new(uri.path)
        request['Authorization'] = "Bearer #{@token}" if @token

        response = Net::HTTP.start(uri.host, uri.port,
                                   use_ssl: uri.scheme == 'https',
                                   open_timeout: 10,
                                   read_timeout: 30) do |http|
          http.request(request)
        end

        if response.code.to_i == 200
          JSON.parse(response.body)
        else
          []
        end
      rescue => e
        puts "Ornato CutOptimizer: Erro ao buscar chapas: #{e.message}"
        []
      end

      # Generate summary report of material usage
      #
      # @param cut_list [Hash] from generate_cut_list
      # @return [String] formatted report
      def generate_report(cut_list)
        report = "=== RELATORIO DE CORTE ===\n\n"

        (cut_list[:materials] || {}).each do |mat_key, data|
          report += "Material: #{mat_key}\n"
          report += "  Espessura: #{data[:thickness]}mm\n"
          report += "  Pecas: #{data[:pieces].length}\n"
          report += "  Area total: #{data[:total_area_m2]} m2\n"
          report += "  Borda total: #{(data[:total_edge_mm] / 1000.0).round(2)} m\n"
          report += "  Detalhes:\n"

          data[:pieces].sort_by { |p| [-p[:length] * p[:width]] }.each do |p|
            report += "    #{p[:name]}: #{p[:length]} x #{p[:width]}mm"
            report += " [veio: #{p[:grain]}]" if p[:grain] != 'none'
            report += " #{p[:edges].values.reject { |v| v == 'none' }.length} bordas"
            report += "\n"
          end
          report += "\n"
        end

        report
      end

      private

      def read_auth_token
        Sketchup.read_default('Ornato', 'auth_token', nil)
      rescue
        nil
      end

      def extract_material_key(piece)
        mat = nil
        if piece.respond_to?(:entity) && piece.entity.respond_to?(:get_attribute)
          mat = piece.entity.get_attribute('ornato', 'material', nil)
        end
        mat ||= "MDF_#{piece_thickness(piece).to_i}"
        mat
      end

      def piece_thickness(piece)
        return piece.thickness if piece.respond_to?(:thickness)
        return piece[:thickness] if piece.is_a?(Hash)
        18
      end

      def piece_dim(piece, dim)
        return piece.send(dim) if piece.respond_to?(dim)
        return piece[dim] if piece.is_a?(Hash)
        nil
      end

      def piece_id(piece)
        return piece.persistent_id if piece.respond_to?(:persistent_id)
        return piece[:persistent_id] if piece.is_a?(Hash)
        'unknown'
      end

      def piece_name(piece)
        if piece.respond_to?(:entity) && piece.entity.respond_to?(:name)
          piece.entity.name
        elsif piece.is_a?(Hash)
          piece[:name] || 'peca'
        else
          'peca'
        end
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

      def calculate_edge_length(piece, length, width)
        edges = extract_edges(piece)
        total = 0
        total += length * 2 if edges[:top] != 'none'    # top/bottom edges run along length
        total += length * 2 if edges[:bottom] != 'none'
        total += width  * 2 if edges[:left] != 'none'   # left/right edges run along width
        total += width  * 2 if edges[:right] != 'none'
        # Simplified: each edge appears once (not x2)
        total = 0
        total += length if edges[:top]    && edges[:top]    != 'none'
        total += length if edges[:bottom] && edges[:bottom] != 'none'
        total += width  if edges[:left]   && edges[:left]   != 'none'
        total += width  if edges[:right]  && edges[:right]  != 'none'
        total
      end
    end
  end
end
