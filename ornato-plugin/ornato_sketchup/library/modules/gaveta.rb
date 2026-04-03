# ═══════════════════════════════════════════════════════
# Gaveta — Caixa de gaveta avulsa (single drawer)
# Conjunto completo: 2 laterais + fundo + traseira + frente.
# Pode ser usada standalone ou pelo Gaveteiro.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Gaveta

        DEFAULTS = {
          largura:            500,    # largura interna disponivel
          altura:             150,    # altura da caixa
          profundidade:       450,    # profundidade da caixa
          espessura_lateral:  12,     # mm (laterais da caixa)
          espessura_fundo:    3,      # mm (HDF)
          frente_altura:      180,    # altura da frente (maior que caixa)
          frente_espessura:   18,     # mm
          corredica:          '450mm',
          material:           'MDF_18_BRANCO',
          material_frente:    nil,    # nil = usa material principal
          puxador_espacamento: 128,
        }.freeze

        attr_reader :params

        def initialize(params = {})
          @params = DEFAULTS.merge(params)
          @params[:material_frente] ||= @params[:material]
        end

        def build(parent_group)
          larg     = @params[:largura].to_f
          alt      = @params[:altura].to_f
          prof     = @params[:profundidade].to_f
          esp_lat  = @params[:espessura_lateral].to_f
          esp_fun  = @params[:espessura_fundo].to_f
          frente_h = @params[:frente_altura].to_f
          frente_e = @params[:frente_espessura].to_f

          caixa_larg_int = larg - 2 * esp_lat

          # ── Lateral esquerda ──
          lat_esq = ParametricEngine.create_piece(
            parent_group, 'Gaveta Lat Esq',
            { largura: esp_lat, altura: alt, espessura: prof },
            @params[:material],
            [0, 0, 0],
            :drawer_side
          )
          ParametricEngine.apply_hardware_tags(lat_esq, :drawer_side, { corredica: @params[:corredica] })

          # ── Lateral direita ──
          lat_dir = ParametricEngine.create_piece(
            parent_group, 'Gaveta Lat Dir',
            { largura: esp_lat, altura: alt, espessura: prof },
            @params[:material],
            [larg - esp_lat, 0, 0],
            :drawer_side
          )
          ParametricEngine.apply_hardware_tags(lat_dir, :drawer_side, { corredica: @params[:corredica] })

          # ── Fundo ──
          ParametricEngine.create_piece(
            parent_group, 'Gaveta Fundo',
            { largura: caixa_larg_int, altura: esp_fun, espessura: prof - esp_lat },
            'HDF_3',
            [esp_lat, esp_lat, 0],
            :drawer_bottom
          )

          # ── Traseira ──
          tras_alt = alt - esp_fun
          ParametricEngine.create_piece(
            parent_group, 'Gaveta Traseira',
            { largura: caixa_larg_int, altura: tras_alt, espessura: esp_lat },
            @params[:material],
            [esp_lat, prof - esp_lat, esp_fun],
            :drawer_back
          )

          # ── Frente ──
          frente_offset_z = -((frente_h - alt) / 2.0)
          frente = ParametricEngine.create_piece(
            parent_group, 'Gaveta Frente',
            { largura: larg + 4, altura: frente_h, espessura: frente_e },
            @params[:material_frente],
            [-2, -frente_e - 2, frente_offset_z],
            :drawer_front
          )

          edges = { frontal: '22mm_branco', traseira: '22mm_branco', dir: '22mm_branco', esq: '22mm_branco' }
          ParametricEngine.add_edge_banding(frente, edges)
          ParametricEngine.apply_hardware_tags(frente, :drawer_front, {
            puxador_espacamento: @params[:puxador_espacamento],
          })
        end
      end
    end
  end
end
