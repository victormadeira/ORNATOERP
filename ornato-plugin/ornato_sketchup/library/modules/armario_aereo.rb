# ═══════════════════════════════════════════════════════
# ArmarioAereo — Armario aereo (wall-mounted cabinet)
# Modulo suspenso para cozinha/banheiro/area de servico.
# Suporta basculante, portas de abrir ou sem porta.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class ArmarioAereo < ModuleBase

        DEFAULTS = {
          largura:              600,
          altura:               700,
          profundidade:         340,
          tipo_porta:           'basculante',  # 'basculante', '2_abrir', '1_abrir_l', '1_abrir_r', 'sem'
          n_prateleiras:        1,
          puxador_espacamento:  128,
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

          # ── Topo ──
          create_horizontal(parent_group, 'Topo', inner_width, prof, esp, alt - esp, :top)

          # ── Fundo ──
          if @params[:com_fundo]
            fundo_alt = alt - 2 * esp
            create_back_panel(parent_group, inner_width, fundo_alt, @params[:espessura_fundo], @params[:recuo_fundo])
          end

          # ── Prateleiras ──
          n = @params[:n_prateleiras].to_i.clamp(0, 4)
          if n > 0
            espaco_util = alt - 2 * esp
            intervalo = espaco_util.to_f / (n + 1)

            n.times do |i|
              z = esp + (intervalo * (i + 1))
              create_horizontal(parent_group, "Prateleira #{i + 1}", inner_width, inner_depth, esp, z, :shelf)
            end
          end

          # ── Portas ──
          build_doors(parent_group)
        end

        private

        def build_doors(parent_group)
          tipo = @params[:tipo_porta]
          return if tipo == 'sem'

          alt   = @params[:altura]
          esp   = @params[:espessura]
          larg  = @params[:largura]
          folga = 2

          case tipo
          when 'basculante'
            # Porta unica basculante (abre para cima)
            porta_larg = larg - folga * 2
            porta_alt  = alt - folga * 2

            porta = ParametricEngine.create_piece(
              parent_group, 'Porta Basculante',
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material],
              [folga, -esp - 2, folga],
              :door
            )
            edges = { frontal: '22mm_branco', traseira: '22mm_branco', dir: '22mm_branco', esq: '22mm_branco' }
            ParametricEngine.add_edge_banding(porta, edges)
            ParametricEngine.apply_hardware_tags(porta, :door, {
              lado: 'cima',
              tipo_abertura: 'basculante',
              puxador_espacamento: @params[:puxador_espacamento],
            })

          when '2_abrir'
            porta_larg = (larg.to_f / 2) - folga
            porta_alt  = alt - folga * 2

            ['Esquerda', 'Direita'].each_with_index do |lado_nome, idx|
              x = idx == 0 ? folga : (larg / 2.0 + folga)
              lado = idx == 0 ? 'esquerda' : 'direita'

              porta = ParametricEngine.create_piece(
                parent_group, "Porta #{lado_nome}",
                { largura: porta_larg, altura: porta_alt, espessura: esp },
                @params[:material],
                [x, -esp - 2, folga],
                :door
              )
              edges = { frontal: '22mm_branco', traseira: '22mm_branco', dir: '22mm_branco', esq: '22mm_branco' }
              ParametricEngine.add_edge_banding(porta, edges)
              ParametricEngine.apply_hardware_tags(porta, :door, {
                lado: lado,
                puxador_espacamento: @params[:puxador_espacamento],
              })
            end

          when '1_abrir_l', '1_abrir_r'
            porta_larg = larg - folga * 2
            porta_alt  = alt - folga * 2
            lado = tipo == '1_abrir_l' ? 'esquerda' : 'direita'

            porta = ParametricEngine.create_piece(
              parent_group, 'Porta',
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material],
              [folga, -esp - 2, folga],
              :door
            )
            edges = { frontal: '22mm_branco', traseira: '22mm_branco', dir: '22mm_branco', esq: '22mm_branco' }
            ParametricEngine.add_edge_banding(porta, edges)
            ParametricEngine.apply_hardware_tags(porta, :door, {
              lado: lado,
              puxador_espacamento: @params[:puxador_espacamento],
            })
          end
        end
      end
    end
  end
end
