# ═══════════════════════════════════════════════════════
# PortaCorrer — Par de portas de correr (sliding doors)
# Duas portas deslizantes em trilhos superior/inferior.
# Cada porta cobre metade + sobreposicao.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class PortaCorrer

        DEFAULTS = {
          largura:    800,
          altura:     700,
          espessura:  18,
          material:   'MDF_18_BRANCO',
        }.freeze

        attr_reader :params

        def initialize(params = {})
          @params = DEFAULTS.merge(params)
        end

        def build(parent_group)
          larg = @params[:largura].to_f
          alt  = @params[:altura].to_f
          esp  = @params[:espessura].to_f

          # Cada porta cobre metade + 20mm de sobreposicao
          porta_larg = (larg / 2.0) + 20
          folga = 2

          # ── Porta traseira (trilho de tras) ──
          porta_tras = ParametricEngine.create_piece(
            parent_group, 'Porta Correr Tras',
            { largura: porta_larg, altura: alt - folga * 2, espessura: esp },
            @params[:material],
            [0, esp + 2, folga],
            :sliding_door
          )
          tag_sliding(porta_tras)

          # ── Porta frontal (trilho da frente) ──
          porta_frente = ParametricEngine.create_piece(
            parent_group, 'Porta Correr Frente',
            { largura: porta_larg, altura: alt - folga * 2, espessura: esp },
            @params[:material],
            [larg - porta_larg, 0, folga],
            :sliding_door
          )
          tag_sliding(porta_frente)
        end

        private

        def tag_sliding(piece)
          edges = {
            frontal:  '22mm_branco',
            traseira: '22mm_branco',
            dir:      '22mm_branco',
            esq:      '22mm_branco',
          }
          ParametricEngine.add_edge_banding(piece, edges)
          ParametricEngine.apply_hardware_tags(piece, :sliding_door, {})

          piece.set_attribute('Ornato', 'needs_groove', true)
          piece.set_attribute('Ornato', 'groove_top', true)
          piece.set_attribute('Ornato', 'groove_bottom', true)
        end
      end
    end
  end
end
