# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# SmartAdvisor — Inteligencia de sugestao de ferragens e deteccao
# de erros comuns em projetos de marcenaria
#
# Analisa o modelo processado e gera avisos/sugestoes:
#   - Portas pesadas com poucas dobradicas
#   - Prateleiras longas sem suporte intermediario
#   - Gavetas sem corrediça adequada
#   - Pecas sem usinagem (possivelmente faltando contato)
#   - Furos muito proximos da borda
#   - Pecas duplicadas (mesma posicao e dimensao)
#   - Material inconsistente no mesmo modulo
#   - Bordas faltando em pecas visiveis
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Advisor
    class SmartAdvisor
      # Weight thresholds for door hinge calculation
      # Approximate weight: MDP ~700 kg/m3, MDF ~750 kg/m3
      DENSITY_KG_M3 = 720.0

      # Maximum recommended shelf span without support
      MAX_SHELF_SPAN = 800.0  # mm

      # Minimum edge distance for holes
      MIN_HOLE_EDGE_DIST = 30.0  # mm

      def initialize(config)
        @config = config
        @warnings = []
      end

      # Run all advisory checks
      # @param analysis [Hash] result from ModelAnalyzer
      # @param machining [Hash] result from RulesEngine
      # @return [Array<Hash>] list of warnings/suggestions
      def analyze(analysis, machining)
        @warnings = []

        analysis[:pieces].each do |piece_info|
          piece = piece_info[:piece] || piece_info
          check_door_hinges(piece, machining)
          check_shelf_span(piece, analysis)
          check_drawer_slides(piece, machining)
          check_missing_machining(piece, machining)
          check_hole_edge_distance(piece, machining)
          check_missing_edges(piece)
          check_thickness_vs_hardware(piece, machining)
        end

        check_duplicate_pieces(analysis)
        check_material_consistency(analysis)
        check_module_completeness(analysis)

        @warnings
      end

      private

      # ── Door weight vs hinge count ─────────────────────
      def check_door_hinges(piece, machining)
        return unless door?(piece)

        width  = piece_dim(piece, :width)  || 0
        height = piece_dim(piece, :height) || 0
        thick  = piece_dim(piece, :thickness) || 18

        # Calculate approximate weight in kg
        volume_m3 = (width / 1000.0) * (height / 1000.0) * (thick / 1000.0)
        weight_kg = volume_m3 * DENSITY_KG_M3

        # Count hinge operations
        pid = piece_id(piece)
        hinge_count = count_ops_by_tool(machining, pid, 'broca_35mm')

        # Recommended hinges by weight
        recommended = if weight_kg <= 5.0
                        2
                      elsif weight_kg <= 12.0
                        3
                      elsif weight_kg <= 20.0
                        4
                      else
                        5
                      end

        if hinge_count > 0 && hinge_count < recommended
          @warnings << {
            type: :suggestion,
            severity: :warning,
            piece_id: pid,
            piece_name: piece_name(piece),
            message: "Porta #{piece_name(piece)} pesa ~#{weight_kg.round(1)}kg " \
                     "mas tem apenas #{hinge_count} dobradicas (recomendado: #{recommended}). " \
                     "Considere adicionar mais dobradicas para evitar desalinhamento.",
            category: :hardware,
          }
        end

        # Check if very tall door has enough hinges
        if height > 2000 && hinge_count < 4
          @warnings << {
            type: :suggestion,
            severity: :warning,
            piece_id: pid,
            piece_name: piece_name(piece),
            message: "Porta #{piece_name(piece)} tem #{height.round(0)}mm de altura. " \
                     "Portas acima de 2000mm devem ter no minimo 4 dobradicas.",
            category: :hardware,
          }
        end
      end

      # ── Shelf span without intermediate support ────────
      def check_shelf_span(piece, analysis)
        return unless shelf?(piece)

        width = piece_dim(piece, :width) || 0

        if width > MAX_SHELF_SPAN
          @warnings << {
            type: :suggestion,
            severity: :info,
            piece_id: piece_id(piece),
            piece_name: piece_name(piece),
            message: "Prateleira #{piece_name(piece)} tem #{width.round(0)}mm de vao. " \
                     "Vao acima de #{MAX_SHELF_SPAN.to_i}mm pode causar flexao. " \
                     "Considere adicionar um divisor vertical intermediario.",
            category: :structural,
          }
        end
      end

      # ── Drawer slide adequacy ──────────────────────────
      def check_drawer_slides(piece, machining)
        return unless drawer?(piece) || drawer_front?(piece)

        width = piece_dim(piece, :width) || 0

        # Large drawers need heavy-duty slides
        if width > 600
          @warnings << {
            type: :suggestion,
            severity: :info,
            piece_id: piece_id(piece),
            piece_name: piece_name(piece),
            message: "Gaveta #{piece_name(piece)} tem #{width.round(0)}mm. " \
                     "Gavetas acima de 600mm devem usar corrediça de carga pesada (50kg+).",
            category: :hardware,
          }
        end
      end

      # ── Pieces without any machining ───────────────────
      def check_missing_machining(piece, machining)
        role = piece_role(piece)
        return if [:back_panel, :unknown, :trim, :filler].include?(role)

        pid = piece_id(piece)
        ops = machining[pid]

        if ops.nil? || (ops['workers'] || {}).empty?
          # Some pieces legitimately have no machining
          skip_roles = [:back_panel, :drawer_base, :filler, :trim, :moldura]
          return if skip_roles.include?(role)

          name = piece_name(piece)
          return if name =~ /TAM|PAI|CEN|ROD|TEST/i

          @warnings << {
            type: :warning,
            severity: :warning,
            piece_id: pid,
            piece_name: name,
            message: "Peca #{name} nao recebeu nenhuma usinagem. " \
                     "Verifique se ela esta em contato com outras pecas ou " \
                     "se a nomenclatura esta correta.",
            category: :machining,
          }
        end
      end

      # ── Holes too close to edge ────────────────────────
      def check_hole_edge_distance(piece, machining)
        pid = piece_id(piece)
        ops = machining.dig(pid, 'workers') || {}

        width  = piece_dim(piece, :width)  || 0
        height = piece_dim(piece, :height) || 0

        ops.each do |key, worker|
          next unless worker['category'] == 'hole'
          x = worker['position_x'].to_f
          y = worker['position_y'].to_f
          r = (worker['diameter'].to_f / 2.0)

          edge_dist = [x - r, y - r, width - x - r, height - y - r].min

          if edge_dist < MIN_HOLE_EDGE_DIST && edge_dist >= 0
            @warnings << {
              type: :warning,
              severity: :error,
              piece_id: pid,
              piece_name: piece_name(piece),
              message: "Furo #{worker['description'] || key} em #{piece_name(piece)} " \
                       "esta a apenas #{edge_dist.round(1)}mm da borda " \
                       "(minimo recomendado: #{MIN_HOLE_EDGE_DIST.to_i}mm). " \
                       "Risco de romper a chapa.",
              category: :machining,
            }
          end
        end
      end

      # ── Missing edge banding on visible pieces ─────────
      def check_missing_edges(piece)
        return unless piece.respond_to?(:entity) && piece.entity.respond_to?(:get_attribute)

        role = piece_role(piece)
        visible_roles = [:door, :drawer_front, :shelf, :lateral]
        return unless visible_roles.include?(role)

        # Check if any edge is defined
        has_edge = false
        %w[edge_top edge_bottom edge_left edge_right].each do |attr|
          val = piece.entity.get_attribute('ornato', attr, nil)
          has_edge = true if val && val.to_s != 'none'
        end

        unless has_edge
          @warnings << {
            type: :suggestion,
            severity: :info,
            piece_id: piece_id(piece),
            piece_name: piece_name(piece),
            message: "Peca visivel #{piece_name(piece)} (#{role}) nao tem bordas definidas. " \
                     "Considere adicionar fita de borda nas faces visiveis.",
            category: :finishing,
          }
        end
      end

      # ── Thickness vs hardware compatibility ────────────
      def check_thickness_vs_hardware(piece, machining)
        pid = piece_id(piece)
        thick = piece_dim(piece, :thickness) || 18

        ops = machining.dig(pid, 'workers') || {}
        ops.each do |_key, worker|
          next unless worker['category'] == 'hole'
          depth = worker['depth'].to_f
          next if depth <= 0 || worker['through']

          if depth > thick * 0.85
            @warnings << {
              type: :warning,
              severity: :error,
              piece_id: pid,
              piece_name: piece_name(piece),
              message: "Furo #{worker['description']} em #{piece_name(piece)} " \
                       "tem profundidade #{depth}mm em chapa de #{thick}mm " \
                       "(#{((depth / thick) * 100).round(0)}% da espessura). Risco de perfurar.",
              category: :machining,
            }
          end
        end
      end

      # ── Duplicate pieces (same position + dimensions) ──
      def check_duplicate_pieces(analysis)
        seen = {}
        (analysis[:pieces] || []).each do |p|
          piece = p[:piece] || p
          key = [
            piece_dim(piece, :width)&.round(0),
            piece_dim(piece, :height)&.round(0),
            piece_origin(piece),
          ].to_s

          if seen[key]
            @warnings << {
              type: :warning,
              severity: :warning,
              piece_id: piece_id(piece),
              piece_name: piece_name(piece),
              message: "Peca #{piece_name(piece)} parece duplicada " \
                       "(mesmas dimensoes e posicao que #{piece_name(seen[key])}). " \
                       "Verifique se nao ha pecas sobrepostas.",
              category: :structural,
            }
          else
            seen[key] = piece
          end
        end
      end

      # ── Material inconsistency in same module ──────────
      def check_material_consistency(analysis)
        (analysis[:modules] || []).each do |mod|
          materials = {}
          (mod[:pieces] || []).each do |p|
            piece = p[:piece] || p
            role = piece_role(piece)
            next if [:back_panel, :unknown].include?(role)

            mat = piece_material(piece) || 'unknown'
            thick = piece_dim(piece, :thickness) || 0
            key = "#{mat}_#{thick.round(0)}"
            materials[key] ||= []
            materials[key] << piece_name(piece)
          end

          # If structure pieces have more than 2 different materials, warn
          if materials.keys.length > 2
            mod_name = mod[:group].respond_to?(:name) ? mod[:group].name : 'modulo'
            @warnings << {
              type: :info,
              severity: :info,
              piece_id: nil,
              piece_name: mod_name,
              message: "Modulo #{mod_name} usa #{materials.keys.length} materiais diferentes. " \
                       "Verifique se esta correto (pode aumentar o custo de producao).",
              category: :material,
            }
          end
        end
      end

      # ── Module completeness ────────────────────────────
      def check_module_completeness(analysis)
        (analysis[:modules] || []).each do |mod|
          roles = (mod[:pieces] || []).map { |p| piece_role(p[:piece] || p) }
          mod_name = mod[:group].respond_to?(:name) ? mod[:group].name : 'modulo'

          # A standard cabinet should have at least 2 laterals + base/top
          has_laterals = roles.count(:lateral) >= 2
          has_base = roles.include?(:base)
          has_top  = roles.include?(:top)

          unless has_laterals
            @warnings << {
              type: :warning,
              severity: :warning,
              piece_id: nil,
              piece_name: mod_name,
              message: "Modulo #{mod_name} nao tem 2 laterais detectadas. " \
                       "Verifique a nomenclatura (LAT_ESQ / LAT_DIR).",
              category: :structural,
            }
          end

          unless has_base || has_top
            @warnings << {
              type: :warning,
              severity: :info,
              piece_id: nil,
              piece_name: mod_name,
              message: "Modulo #{mod_name} nao tem base ou topo detectados. " \
                       "Verifique a nomenclatura (BASE / TOPO).",
              category: :structural,
            }
          end
        end
      end

      # ── Helpers ────────────────────────────────────────

      def piece_id(piece)
        return piece.persistent_id if piece.respond_to?(:persistent_id)
        return piece[:persistent_id] if piece.is_a?(Hash)
        'unknown'
      end

      def piece_name(piece)
        if piece.respond_to?(:entity) && piece.entity.respond_to?(:name)
          piece.entity.name
        elsif piece.is_a?(Hash)
          piece[:name] || 'desconhecido'
        else
          'desconhecido'
        end
      end

      def piece_dim(piece, dim)
        return piece.send(dim) if piece.respond_to?(dim)
        return piece[dim] if piece.is_a?(Hash)
        nil
      end

      def piece_role(piece)
        return piece.role if piece.respond_to?(:role)
        return piece[:role] if piece.is_a?(Hash)
        :unknown
      end

      def piece_material(piece)
        if piece.respond_to?(:entity) && piece.entity.respond_to?(:get_attribute)
          piece.entity.get_attribute('ornato', 'material', nil)
        elsif piece.is_a?(Hash)
          piece[:material]
        end
      end

      def piece_origin(piece)
        return piece.origin.map { |v| v.round(0) } if piece.respond_to?(:origin)
        nil
      end

      def door?(piece)
        role = piece_role(piece)
        role == :door || (piece_name(piece) || '').upcase =~ /^POR/
      end

      def shelf?(piece)
        role = piece_role(piece)
        role == :shelf || (piece_name(piece) || '').upcase =~ /^PRA/
      end

      def drawer?(piece)
        piece_role(piece) == :drawer
      end

      def drawer_front?(piece)
        piece_role(piece) == :drawer_front
      end

      def count_ops_by_tool(machining, pid, tool_code)
        ops = machining.dig(pid, 'workers') || {}
        ops.values.count { |w| w['tool_code'] == tool_code }
      end
    end
  end
end
