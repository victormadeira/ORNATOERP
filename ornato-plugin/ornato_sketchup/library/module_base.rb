# ═══════════════════════════════════════════════════════
# ModuleBase — Classe base abstrata para todos os modulos
# parametricos. Define parametros comuns, helpers de
# criacao de pecas (laterais, horizontais, fundo) e
# sistema de tagging para ferragens e fita de borda.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    class ModuleBase

      # Parametros comuns a todos os modulos
      COMMON_DEFAULTS = {
        largura:           600,    # mm
        altura:            720,    # mm
        profundidade:      560,    # mm
        espessura:         18,     # mm (paineis estruturais)
        material:          'MDF_18_BRANCO',
        tipo_juncao:       'minifix',  # 'minifix' ou 'cavilha'
        com_fundo:         true,
        espessura_fundo:   3,      # mm (HDF/eucatex)
        recuo_fundo:       10,     # mm do fundo da lateral
      }.freeze

      attr_reader :params

      # @param params [Hash] parametros do modulo (symbol keys)
      def initialize(params = {})
        @params = COMMON_DEFAULTS.merge(self.class.const_defined?(:DEFAULTS) ? self.class::DEFAULTS : {})
                                 .merge(params)
        validate_params!
      end

      # Metodo abstrato — subclasses devem implementar
      # @param parent_group [Sketchup::Group] grupo pai do modulo
      def build(parent_group)
        raise NotImplementedError, "#{self.class.name}#build deve ser implementado pela subclasse"
      end

      # ─── Dimension Helpers ──────────────────────────

      # Largura interna (descontando 2 laterais)
      def inner_width
        @params[:largura] - 2 * @params[:espessura]
      end

      # Profundidade interna (descontando recuo do fundo + espessura fundo)
      def inner_depth
        @params[:profundidade] - @params[:recuo_fundo] - @params[:espessura_fundo]
      end

      # Altura interna (descontando base + topo, se houver)
      def inner_height(com_base: true, com_topo: true)
        h = @params[:altura]
        h -= @params[:espessura] if com_base
        h -= @params[:espessura] if com_topo
        h
      end

      protected

      # ─── Piece Creation Helpers ─────────────────────

      # Cria lateral (painel vertical no plano YZ).
      # Gera box: espessura x profundidade x altura
      #
      # @param group [Sketchup::Group] grupo pai
      # @param side [Symbol] :esquerda ou :direita
      # @param altura [Float] altura da lateral em mm
      # @param profundidade [Float] profundidade em mm
      # @param espessura [Float] espessura em mm
      # @param y_offset [Float] offset lateral em X (mm)
      # @return [Sketchup::Group] grupo da peca
      def create_lateral(group, side, altura, profundidade, espessura, y_offset)
        name = side == :esquerda ? 'Lateral Esquerda' : 'Lateral Direita'
        x_pos = side == :esquerda ? 0 : y_offset

        piece = ParametricEngine.create_piece(
          group, name,
          { largura: espessura, altura: altura, espessura: profundidade },
          @params[:material],
          [x_pos, 0, 0],
          :lateral
        )

        edges = Core::EdgeBanding.detect_by_role({ role: :lateral, espessura: espessura })
        ParametricEngine.add_edge_banding(piece, edges)
        ParametricEngine.apply_hardware_tags(piece, :lateral, {
          joint_type: @params[:tipo_juncao],
        })

        piece
      end

      # Cria painel horizontal (base, tampo, prateleira).
      # Gera box: largura_interna x profundidade x espessura
      #
      # @param group [Sketchup::Group] grupo pai
      # @param name [String] nome da peca
      # @param largura [Float] largura em mm
      # @param profundidade [Float] profundidade em mm
      # @param espessura [Float] espessura em mm
      # @param z_offset [Float] posicao em Z (mm)
      # @param role [Symbol] papel (:base, :top, :shelf)
      # @return [Sketchup::Group]
      def create_horizontal(group, name, largura, profundidade, espessura, z_offset, role)
        # Horizontal fica entre as laterais
        x_pos = @params[:espessura]

        piece = ParametricEngine.create_piece(
          group, name,
          { largura: largura, altura: espessura, espessura: profundidade },
          @params[:material],
          [x_pos, 0, z_offset],
          role
        )

        edges = Core::EdgeBanding.detect_by_role({ role: role, espessura: espessura })
        ParametricEngine.add_edge_banding(piece, edges)
        ParametricEngine.apply_hardware_tags(piece, role, {
          joint_type: @params[:tipo_juncao],
        })

        piece
      end

      # Cria painel traseiro (fundo).
      # Gera box: largura_interna x espessura_fundo x (altura - recuos)
      #
      # @param group [Sketchup::Group] grupo pai
      # @param largura [Float] largura do fundo em mm
      # @param altura [Float] altura do fundo em mm
      # @param espessura_fundo [Float] espessura em mm
      # @param recuo [Float] distancia da borda traseira em mm
      # @return [Sketchup::Group]
      def create_back_panel(group, largura, altura, espessura_fundo, recuo)
        x_pos = @params[:espessura]
        y_pos = @params[:profundidade] - recuo - espessura_fundo

        piece = ParametricEngine.create_piece(
          group, 'Fundo',
          { largura: largura, altura: altura, espessura: espessura_fundo },
          'HDF_3',
          [x_pos, y_pos, @params[:espessura]],
          :back
        )

        edges = Core::EdgeBanding.detect_by_role({ role: :back, espessura: espessura_fundo })
        ParametricEngine.add_edge_banding(piece, edges)
        ParametricEngine.apply_hardware_tags(piece, :back, {})

        piece
      end

      # ─── Tagging Helper ─────────────────────────────

      # Define atributos Ornato numa peca (role, edges, hardware).
      #
      # @param piece [Sketchup::Group] grupo da peca
      # @param role [Symbol] papel da peca
      # @param edges [Hash] bordas com fita { frontal:, traseira:, dir:, esq: }
      def tag_piece(piece, role, edges = nil)
        piece.set_attribute('Ornato', 'role', role.to_s)

        if edges
          ParametricEngine.add_edge_banding(piece, edges)
        else
          detected = Core::EdgeBanding.detect_by_role({ role: role, espessura: @params[:espessura] })
          ParametricEngine.add_edge_banding(piece, detected)
        end
      end

      private

      # Valida parametros minimos
      def validate_params!
        %i[largura altura profundidade espessura].each do |key|
          val = @params[key]
          raise ArgumentError, "Parametro #{key} deve ser numerico positivo (recebeu #{val})" unless val.is_a?(Numeric) && val > 0
        end

        raise ArgumentError, "Espessura (#{@params[:espessura]}) nao pode ser maior que largura (#{@params[:largura]})" if @params[:espessura] * 2 >= @params[:largura]
      end
    end
  end
end
