# ═══════════════════════════════════════════════════════
# PortaAbrir — Porta avulsa de abrir (hinged door)
# Componente individual de porta com dobradicas.
# Usado tanto standalone quanto por outros modulos.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class PortaAbrir

        DEFAULTS = {
          largura:              450,
          altura:               700,
          espessura:            18,
          material:             'MDF_18_BRANCO',
          lado:                 'esquerda',  # 'esquerda' ou 'direita'
          puxador_espacamento:  128,
        }.freeze

        attr_reader :params

        def initialize(params = {})
          @params = DEFAULTS.merge(params)
        end

        def build(parent_group)
          larg = @params[:largura].to_f
          alt  = @params[:altura].to_f
          esp  = @params[:espessura].to_f
          lado = @params[:lado]

          # ── Painel da porta ──
          piece = ParametricEngine.create_piece(
            parent_group, "Porta #{lado == 'esquerda' ? 'Esq' : 'Dir'}",
            { largura: larg, altura: alt, espessura: esp },
            @params[:material],
            [0, 0, 0],
            :door
          )

          # Todas as 4 bordas expostas
          edges = {
            frontal:  '22mm_branco',
            traseira: '22mm_branco',
            dir:      '22mm_branco',
            esq:      '22mm_branco',
          }
          ParametricEngine.add_edge_banding(piece, edges)

          # Tags de ferragem
          ParametricEngine.apply_hardware_tags(piece, :door, {
            lado: lado,
            puxador_espacamento: @params[:puxador_espacamento],
            tipo_abertura: 'abrir',
          })

          # Atributos extras
          piece.set_attribute('Ornato', 'hinge_side', lado)
          piece.set_attribute('Ornato', 'hinge_count', alt > 1200 ? 3 : 2)

          piece
        end
      end
    end
  end
end
