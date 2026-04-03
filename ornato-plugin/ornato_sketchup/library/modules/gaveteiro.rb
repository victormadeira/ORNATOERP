# ═══════════════════════════════════════════════════════
# Gaveteiro — Modulo com gavetas (drawer unit)
# Suporta 1-6 gavetas com alturas iguais ou customizadas.
# Gera caixa completa de cada gaveta (laterais, fundo,
# traseira, frente).
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Gaveteiro < ModuleBase

        DEFAULTS = {
          largura:              600,
          altura:               720,
          profundidade:         560,
          n_gavetas:            3,
          alturas_gavetas:      'iguais',   # 'iguais' ou array [120, 150, 200, ...]
          corredica_modelo:     '450mm',
          puxador_espacamento:  128,
          espessura_lateral_gaveta: 12,     # mm
          espessura_fundo_gaveta:   3,      # mm
        }.freeze

        def build(parent_group)
          esp   = @params[:espessura]
          larg  = @params[:largura]
          alt   = @params[:altura]
          prof  = @params[:profundidade]

          # ── Laterais ──
          create_lateral(parent_group, :esquerda, alt, prof, esp, 0)
          create_lateral(parent_group, :direita, alt, prof, esp, larg - esp)

          # ── Base ──
          create_horizontal(parent_group, 'Base', inner_width, prof, esp, 0, :base)

          # ── Fundo ──
          if @params[:com_fundo]
            fundo_alt = alt - esp
            create_back_panel(parent_group, inner_width, fundo_alt, @params[:espessura_fundo], @params[:recuo_fundo])
          end

          # ── Gavetas ──
          n = @params[:n_gavetas].to_i.clamp(1, 6)
          alturas = calculate_drawer_heights(n, alt - esp) # espaco acima da base
          folga_gaveta = 3  # mm entre gavetas
          folga_lateral = 13 # mm cada lado (corredica)

          z_current = esp  # comecar acima da base

          n.times do |i|
            gaveta_h = alturas[i]
            frente_h = gaveta_h - folga_gaveta
            caixa_h  = frente_h - 30  # caixa menor que frente

            gaveta_larg_interna = inner_width - folga_lateral * 2
            gaveta_prof = prof - 60  # recuo frontal + traseiro

            build_single_drawer(
              parent_group, i + 1,
              gaveta_larg_interna, caixa_h, gaveta_prof,
              frente_h, z_current, folga_lateral
            )

            z_current += gaveta_h
          end
        end

        private

        def calculate_drawer_heights(n, espaco_disponivel)
          if @params[:alturas_gavetas].is_a?(Array) && @params[:alturas_gavetas].length == n
            return @params[:alturas_gavetas].map(&:to_f)
          end

          # Alturas iguais
          h = espaco_disponivel.to_f / n
          Array.new(n, h)
        end

        def build_single_drawer(parent_group, index, larg, alt, prof, frente_h, z_offset, folga_lat)
          esp_lat = @params[:espessura_lateral_gaveta]
          esp_fun = @params[:espessura_fundo_gaveta]
          esp     = @params[:espessura]
          x_start = esp + folga_lat

          # ── Lateral esquerda gaveta ──
          ParametricEngine.create_piece(
            parent_group, "Gaveta #{index} Lat Esq",
            { largura: esp_lat, altura: alt, espessura: prof },
            @params[:material],
            [x_start, 30, z_offset],
            :drawer_side
          ).tap do |p|
            ParametricEngine.apply_hardware_tags(p, :drawer_side, { corredica: @params[:corredica_modelo] })
          end

          # ── Lateral direita gaveta ──
          ParametricEngine.create_piece(
            parent_group, "Gaveta #{index} Lat Dir",
            { largura: esp_lat, altura: alt, espessura: prof },
            @params[:material],
            [x_start + larg - esp_lat, 30, z_offset],
            :drawer_side
          ).tap do |p|
            ParametricEngine.apply_hardware_tags(p, :drawer_side, { corredica: @params[:corredica_modelo] })
          end

          # ── Fundo gaveta ──
          fundo_larg = larg - 2 * esp_lat
          ParametricEngine.create_piece(
            parent_group, "Gaveta #{index} Fundo",
            { largura: fundo_larg, altura: esp_fun, espessura: prof - esp_lat },
            'HDF_3',
            [x_start + esp_lat, 30 + esp_lat, z_offset],
            :drawer_bottom
          )

          # ── Traseira gaveta ──
          tras_larg = larg - 2 * esp_lat
          ParametricEngine.create_piece(
            parent_group, "Gaveta #{index} Traseira",
            { largura: tras_larg, altura: alt - esp_fun, espessura: esp_lat },
            @params[:material],
            [x_start + esp_lat, 30 + prof - esp_lat, z_offset + esp_fun],
            :drawer_back
          )

          # ── Frente gaveta ──
          frente_larg = inner_width - 4  # folga de 2mm cada lado
          frente = ParametricEngine.create_piece(
            parent_group, "Gaveta #{index} Frente",
            { largura: frente_larg, altura: frente_h, espessura: esp },
            @params[:material],
            [esp + 2, -esp - 2, z_offset],
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
