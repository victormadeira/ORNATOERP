# ═══════════════════════════════════════════════════════
# Rodape — Saia / rodape frontal (kick plate / baseboard)
# Peca de acabamento na base do modulo.
# Pode incluir laterais opcionais para suporte.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Rodape

        DEFAULTS = {
          largura:          600,
          altura:           100,     # mm (tipico 100-150)
          espessura:        18,      # mm
          recuo_frontal:    30,      # mm recuado da face frontal
          com_laterais:     true,    # laterais de suporte
          material:         'MDF_18_BRANCO',
        }.freeze

        attr_reader :params

        def initialize(params = {})
          @params = DEFAULTS.merge(params)
        end

        def build(parent_group)
          larg        = @params[:largura].to_f
          alt         = @params[:altura].to_f.clamp(50, 200)
          esp         = @params[:espessura].to_f
          recuo       = @params[:recuo_frontal].to_f

          # ── Frente do rodape ──
          frente = ParametricEngine.create_piece(
            parent_group, 'Rodape Frente',
            { largura: larg, altura: alt, espessura: esp },
            @params[:material],
            [0, recuo, 0],
            :kick
          )

          edges = {
            frontal:  '22mm_branco',
            traseira: '',
            dir:      '',
            esq:      '',
          }
          ParametricEngine.add_edge_banding(frente, edges)
          ParametricEngine.apply_hardware_tags(frente, :cover, {})

          # ── Laterais de suporte (opcionais) ──
          if @params[:com_laterais]
            prof_lateral = 80  # profundidade dos suportes

            # Lateral esquerda
            ParametricEngine.create_piece(
              parent_group, 'Rodape Lat Esq',
              { largura: esp, altura: alt, espessura: prof_lateral },
              @params[:material],
              [0, recuo + esp, 0],
              :cover
            )

            # Lateral direita
            ParametricEngine.create_piece(
              parent_group, 'Rodape Lat Dir',
              { largura: esp, altura: alt, espessura: prof_lateral },
              @params[:material],
              [larg - esp, recuo + esp, 0],
              :cover
            )
          end
        end
      end
    end
  end
end
