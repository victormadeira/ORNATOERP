# ═══════════════════════════════════════════════════════
# Prateleira — Prateleira avulsa (single shelf)
# Painel horizontal com opcao fixa ou regulavel.
# Bordas configuradas automaticamente.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Prateleira

        DEFAULTS = {
          largura:      564,    # mm (inner_width tipico 600-2*18)
          profundidade: 540,    # mm
          espessura:    18,     # mm
          tipo:         'regulavel',  # 'fixa' ou 'regulavel'
          material:     'MDF_18_BRANCO',
        }.freeze

        attr_reader :params

        def initialize(params = {})
          @params = DEFAULTS.merge(params)
        end

        def build(parent_group)
          larg = @params[:largura].to_f
          prof = @params[:profundidade].to_f
          esp  = @params[:espessura].to_f

          piece = ParametricEngine.create_piece(
            parent_group, 'Prateleira',
            { largura: larg, altura: esp, espessura: prof },
            @params[:material],
            [0, 0, 0],
            :shelf
          )

          # Prateleira: frontal exposta, demais encaixadas
          edges = {
            frontal:  '22mm_branco',
            traseira: '',
            dir:      '',
            esq:      '',
          }
          ParametricEngine.add_edge_banding(piece, edges)

          ParametricEngine.apply_hardware_tags(piece, :shelf, {
            tipo: @params[:tipo],
          })

          piece.set_attribute('Ornato', 'shelf_type', @params[:tipo])

          piece
        end
      end
    end
  end
end
