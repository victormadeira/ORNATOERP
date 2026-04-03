# ═══════════════════════════════════════════════════════
# Divisoria — Divisor vertical interno (vertical divider)
# Painel vertical que divide o espaco interno de um
# modulo em compartimentos.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Divisoria

        DEFAULTS = {
          altura:       684,     # mm (altura interna tipica)
          profundidade: 540,     # mm
          espessura:    18,      # mm
          posicao_x:    300,     # mm do inicio do modulo
          material:     'MDF_18_BRANCO',
          com_system32: false,   # furacoes system32 nas faces
        }.freeze

        attr_reader :params

        def initialize(params = {})
          @params = DEFAULTS.merge(params)
        end

        def build(parent_group)
          alt  = @params[:altura].to_f
          prof = @params[:profundidade].to_f
          esp  = @params[:espessura].to_f
          px   = @params[:posicao_x].to_f

          piece = ParametricEngine.create_piece(
            parent_group, 'Divisoria',
            { largura: esp, altura: alt, espessura: prof },
            @params[:material],
            [px, 0, 0],
            :divider
          )

          # Bordas: apenas frontal exposta
          edges = {
            frontal:  '22mm_branco',
            traseira: '',
            dir:      '',
            esq:      '',
          }
          ParametricEngine.add_edge_banding(piece, edges)

          ParametricEngine.apply_hardware_tags(piece, :divider, {
            joint_type: 'minifix',
            com_system32: @params[:com_system32],
          })

          piece.set_attribute('Ornato', 'posicao_x', px)

          piece
        end
      end
    end
  end
end
