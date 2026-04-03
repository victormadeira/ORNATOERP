# ═══════════════════════════════════════════════════════
# Tamponamento — Painel lateral de acabamento (side cover)
# Painel que cobre a lateral exposta de um modulo.
# Normalmente usado em cantos ou extremidades de bancada.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Tamponamento

        DEFAULTS = {
          altura:       720,
          profundidade: 560,
          espessura:    18,
          material:     'MDF_18_BRANCO',
        }.freeze

        attr_reader :params

        def initialize(params = {})
          @params = DEFAULTS.merge(params)
        end

        def build(parent_group)
          alt  = @params[:altura].to_f
          prof = @params[:profundidade].to_f
          esp  = @params[:espessura].to_f

          piece = ParametricEngine.create_piece(
            parent_group, 'Tamponamento',
            { largura: esp, altura: alt, espessura: prof },
            @params[:material],
            [0, 0, 0],
            :cover
          )

          # Bordas: frontal e topo expostos, traseira e base cobertas
          edges = {
            frontal:  '22mm_branco',
            traseira: '',
            dir:      '22mm_branco',  # topo
            esq:      '',             # base
          }
          ParametricEngine.add_edge_banding(piece, edges)
          ParametricEngine.apply_hardware_tags(piece, :cover, {})

          piece
        end
      end
    end
  end
end
