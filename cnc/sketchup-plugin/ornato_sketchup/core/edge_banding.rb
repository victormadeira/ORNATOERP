# ═══════════════════════════════════════════════════════
# EdgeBanding — Deteccao de bordas expostas de paineis
# Determina quais arestas de uma peca estao visiveis
# (nao encostam em outra peca) e portanto precisam de
# fita de borda. Retorna codigos por posicao:
#   :frontal, :traseira, :dir (direita), :esq (esquerda)
# ═══════════════════════════════════════════════════════

module Ornato
  module Core
    class EdgeBanding
      # Tolerancia para considerar borda em contato com outra peca (mm)
      CONTACT_TOLERANCE = 2.0

      # Codigo de fita padrao por espessura de material
      DEFAULT_EDGE_CODES = {
        3  => '0.4mm_branco',
        6  => '0.4mm_branco',
        9  => '22mm_branco',
        12 => '22mm_branco',
        15 => '22mm_branco',
        18 => '22mm_branco',
        25 => '45mm_branco',
      }

      class << self
        # Detecta bordas expostas de uma peca.
        # Compara cada borda da peca contra todas as outras pecas do modulo
        # para determinar quais estao visiveis.
        #
        # @param piece [Hash] peca a analisar (do PieceDetector)
        # @param pieces [Array<Hash>] todas as pecas do mesmo modulo
        # @param joints [Array<Joint>] juncoes detectadas
        # @return [Hash] { frontal:, traseira:, dir:, esq: } — codigo de fita ou ""
        def detect(piece, pieces = [], joints = [])
          return default_edges(piece) if pieces.empty? && joints.empty?

          bb = piece[:bounds]
          orientation = piece[:orientation] || detect_orientation(piece)
          edge_code = edge_code_for(piece)

          # Obter as 4 bordas da peca (excluindo as 2 faces principais)
          edges = extract_panel_edges(bb, orientation)

          # Para cada borda, verificar se alguma outra peca a cobre
          result = {}
          edges.each do |edge_name, edge_info|
            covered = edge_covered?(edge_info, piece, pieces, joints)
            result[edge_name] = covered ? '' : edge_code
          end

          result
        end

        # Versao simplificada: retorna bordas baseado apenas em role da peca.
        # Usado como fallback quando nao ha dados de juncao.
        #
        # @param piece [Hash] peca com :role definido
        # @return [Hash] { frontal:, traseira:, dir:, esq: }
        def detect_by_role(piece)
          edge_code = edge_code_for(piece)
          role = piece[:role] || :unknown

          case role
          when :lateral
            # Lateral: frontal exposta, traseira pode ter fundo, topo/base cobertos
            { frontal: edge_code, traseira: '', dir: edge_code, esq: edge_code }
          when :base, :top
            # Base/tampo: frontal exposta, laterais cobertas pelas laterais
            { frontal: edge_code, traseira: '', dir: '', esq: '' }
          when :back
            # Traseira/fundo: normalmente sem fita (encaixado)
            { frontal: '', traseira: '', dir: '', esq: '' }
          when :door
            # Porta: todas as 4 bordas expostas
            { frontal: edge_code, traseira: edge_code, dir: edge_code, esq: edge_code }
          when :drawer_front
            # Frente de gaveta: todas as 4 bordas
            { frontal: edge_code, traseira: edge_code, dir: edge_code, esq: edge_code }
          when :shelf
            # Prateleira: frontal exposta, as outras normalmente nao
            { frontal: edge_code, traseira: '', dir: '', esq: '' }
          when :divider
            # Divisoria: frontal exposta
            { frontal: edge_code, traseira: '', dir: '', esq: '' }
          else
            # Default: todas expostas (conservador)
            { frontal: edge_code, traseira: edge_code, dir: edge_code, esq: edge_code }
          end
        end

        private

        # Extrai as 4 bordas (edges) de um painel, excluindo as 2 faces maiores.
        # A orientacao determina quais faces sao as principais.
        #
        # Orientacao:
        #   :x — painel no plano YZ (espessura em X). Faces: left/right. Bordas: front/back/top/bottom
        #   :y — painel no plano XZ (espessura em Y). Faces: front/back. Bordas: left/right/top/bottom
        #   :z — painel no plano XY (espessura em Z). Faces: top/bottom. Bordas: left/right/front/back
        #
        # Retorna hash mapeando :frontal/:traseira/:dir/:esq para info da borda
        def extract_panel_edges(bb, orientation)
          min = bb.min
          max = bb.max

          x0 = min.x.to_mm; x1 = max.x.to_mm
          y0 = min.y.to_mm; y1 = max.y.to_mm
          z0 = min.z.to_mm; z1 = max.z.to_mm

          case orientation
          when :x
            # Painel vertical (lateral/divisoria): espessura em X
            # Y = profundidade (frente-tras), Z = altura
            {
              frontal:  { axis: :y, pos: y0, u_range: [z0, z1], length: z1 - z0 },
              traseira: { axis: :y, pos: y1, u_range: [z0, z1], length: z1 - z0 },
              dir:      { axis: :z, pos: z1, u_range: [y0, y1], length: y1 - y0 },
              esq:      { axis: :z, pos: z0, u_range: [y0, y1], length: y1 - y0 },
            }
          when :y
            # Painel em profundidade (traseira): espessura em Y
            # X = largura, Z = altura
            {
              frontal:  { axis: :z, pos: z0, u_range: [x0, x1], length: x1 - x0 },
              traseira: { axis: :z, pos: z1, u_range: [x0, x1], length: x1 - x0 },
              dir:      { axis: :x, pos: x1, u_range: [z0, z1], length: z1 - z0 },
              esq:      { axis: :x, pos: x0, u_range: [z0, z1], length: z1 - z0 },
            }
          when :z
            # Painel horizontal (base/tampo/prateleira): espessura em Z
            # X = largura, Y = profundidade
            {
              frontal:  { axis: :y, pos: y0, u_range: [x0, x1], length: x1 - x0 },
              traseira: { axis: :y, pos: y1, u_range: [x0, x1], length: x1 - x0 },
              dir:      { axis: :x, pos: x1, u_range: [y0, y1], length: y1 - y0 },
              esq:      { axis: :x, pos: x0, u_range: [y0, y1], length: y1 - y0 },
            }
          end
        end

        # Verifica se uma borda especifica esta coberta por outra peca.
        # Uma borda esta coberta se existe outra peca cujo BoundingBox
        # encosta na posicao da borda e cobre pelo menos 80% do comprimento.
        #
        # @param edge_info [Hash] { axis:, pos:, u_range:, length: }
        # @param piece [Hash] peca dona da borda
        # @param pieces [Array<Hash>] outras pecas
        # @param joints [Array<Joint>] juncoes conhecidas
        # @return [Boolean] true se a borda esta coberta
        def edge_covered?(edge_info, piece, pieces, joints)
          # Verificar via juncoes primeiro (mais confiavel)
          piece_joints = joints.select { |j| j.involves?(piece) }

          piece_joints.each do |joint|
            partner = joint.partner_of(piece)
            next unless partner

            partner_bb = partner[:bounds]
            if edge_touches_piece?(edge_info, partner_bb)
              return true
            end
          end

          # Verificar via proximidade com outras pecas
          pieces.each do |other|
            next if other.equal?(piece)

            other_bb = other[:bounds]
            if edge_touches_piece?(edge_info, other_bb)
              return true
            end
          end

          false
        end

        # Verifica se uma borda esta em contato com o BoundingBox de outra peca.
        #
        # @param edge_info [Hash] info da borda
        # @param other_bb [Geom::BoundingBox] bounds da outra peca
        # @return [Boolean]
        def edge_touches_piece?(edge_info, other_bb)
          min = other_bb.min
          max = other_bb.max

          o_x0 = min.x.to_mm; o_x1 = max.x.to_mm
          o_y0 = min.y.to_mm; o_y1 = max.y.to_mm
          o_z0 = min.z.to_mm; o_z1 = max.z.to_mm

          axis = edge_info[:axis]
          pos = edge_info[:pos]
          u_range = edge_info[:u_range]
          edge_length = edge_info[:length]

          # Verificar se a outra peca esta na posicao da borda (no eixo normal)
          case axis
          when :x
            return false unless pos >= (o_x0 - CONTACT_TOLERANCE) && pos <= (o_x1 + CONTACT_TOLERANCE)
            # Verificar sobreposicao no eixo U (que pode ser Y ou Z dependendo do contexto)
            # u_range para borda em X pode ser Y ou Z — precisamos verificar ambos
            overlap_y = range_overlap(u_range, [o_y0, o_y1])
            overlap_z = range_overlap(u_range, [o_z0, o_z1])
            coverage = [overlap_y, overlap_z].max
          when :y
            return false unless pos >= (o_y0 - CONTACT_TOLERANCE) && pos <= (o_y1 + CONTACT_TOLERANCE)
            overlap_x = range_overlap(u_range, [o_x0, o_x1])
            overlap_z = range_overlap(u_range, [o_z0, o_z1])
            coverage = [overlap_x, overlap_z].max
          when :z
            return false unless pos >= (o_z0 - CONTACT_TOLERANCE) && pos <= (o_z1 + CONTACT_TOLERANCE)
            overlap_x = range_overlap(u_range, [o_x0, o_x1])
            overlap_y = range_overlap(u_range, [o_y0, o_y1])
            coverage = [overlap_x, overlap_y].max
          end

          # Borda esta coberta se a outra peca cobre pelo menos 70% do comprimento
          edge_length > 0 && coverage > 0 && (coverage / edge_length) >= 0.7
        end

        # Calcula sobreposicao entre dois intervalos 1D
        def range_overlap(range_a, range_b)
          overlap_min = [range_a[0], range_b[0]].max
          overlap_max = [range_a[1], range_b[1]].min
          overlap = overlap_max - overlap_min
          overlap > 0 ? overlap : 0.0
        end

        # Determina codigo de fita de borda baseado na espessura da peca
        def edge_code_for(piece)
          esp = piece[:espessura] || 18
          esp_rounded = esp.round(0)

          # Tentar match exato
          code = DEFAULT_EDGE_CODES[esp_rounded]
          return code if code

          # Tentar o mais proximo
          closest = DEFAULT_EDGE_CODES.keys.min_by { |k| (k - esp_rounded).abs }
          DEFAULT_EDGE_CODES[closest] || '22mm_branco'
        end

        # Detecta orientacao do painel baseado nas dimensoes
        def detect_orientation(piece)
          piece[:orientation] || :z
        end

        # Retorna bordas padrao (todas expostas) para quando nao ha contexto
        def default_edges(piece)
          role = piece[:role]
          return detect_by_role(piece) if role && role != :unknown

          edge_code = edge_code_for(piece)
          { frontal: edge_code, traseira: edge_code, dir: edge_code, esq: edge_code }
        end
      end
    end
  end
end
