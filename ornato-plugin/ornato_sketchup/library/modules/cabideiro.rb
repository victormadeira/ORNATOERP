# ═══════════════════════════════════════════════════════
# Cabideiro — Varao de cabide (closet rod)
# Suporte para varao de cabide com 2 apoios laterais.
# Marca posicao do tubo para montagem.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Cabideiro

        DEFAULTS = {
          largura:           564,    # mm (vao entre laterais)
          altura_fixacao:    1600,   # mm do chao ate o centro do tubo
          diametro_tubo:     25,     # mm (padrao aluminio)
          espessura_suporte: 18,     # mm
          profundidade_suporte: 80,  # mm
          material:          'MDF_18_BRANCO',
        }.freeze

        attr_reader :params

        def initialize(params = {})
          @params = DEFAULTS.merge(params)
        end

        def build(parent_group)
          larg     = @params[:largura].to_f
          alt_fix  = @params[:altura_fixacao].to_f
          diam     = @params[:diametro_tubo].to_f
          esp_sup  = @params[:espessura_suporte].to_f
          prof_sup = @params[:profundidade_suporte].to_f

          # ── Suporte esquerdo ──
          sup_esq = ParametricEngine.create_piece(
            parent_group, 'Suporte Cabideiro Esq',
            { largura: esp_sup, altura: prof_sup, espessura: prof_sup },
            @params[:material],
            [0, 0, alt_fix - prof_sup / 2.0],
            :cover
          )
          tag_support(sup_esq)

          # ── Suporte direito ──
          sup_dir = ParametricEngine.create_piece(
            parent_group, 'Suporte Cabideiro Dir',
            { largura: esp_sup, altura: prof_sup, espessura: prof_sup },
            @params[:material],
            [larg - esp_sup, 0, alt_fix - prof_sup / 2.0],
            :cover
          )
          tag_support(sup_dir)

          # ── Tags para posicao do tubo ──
          # O tubo em si nao e peca de MDF — apenas marcamos a posicao
          parent_group.set_attribute('Ornato', 'rod_position', JSON.generate({
            x_start: esp_sup,
            x_end: larg - esp_sup,
            y: prof_sup / 2.0,
            z: alt_fix,
            diameter: diam,
          }))

          parent_group.set_attribute('Ornato', 'hardware_needed', JSON.generate([
            { type: 'tubo_cabide', diameter: diam, length: larg - 2 * esp_sup },
            { type: 'flange_tubo', diameter: diam, qty: 2 },
          ]))
        end

        private

        def tag_support(piece)
          edges = { frontal: '22mm_branco', traseira: '', dir: '', esq: '' }
          ParametricEngine.add_edge_banding(piece, edges)
          ParametricEngine.apply_hardware_tags(piece, :cover, {})

          piece.set_attribute('Ornato', 'sub_role', 'suporte_cabideiro')
          piece.set_attribute('Ornato', 'needs_hole', JSON.generate({
            diameter: @params[:diametro_tubo],
            depth: @params[:espessura_suporte],
            position: 'center',
          }))
        end
      end
    end
  end
end
