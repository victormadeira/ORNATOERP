# ═══════════════════════════════════════════════════════
# ArmarioBase — Armario inferior (base cabinet)
# Modulo padrao de cozinha/banheiro sob a bancada.
# Suporta portas de abrir, correr ou sem porta,
# com prateleiras opcionais.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class ArmarioBase < ModuleBase

        DEFAULTS = {
          largura:              600,
          altura:               720,
          profundidade:         560,
          n_prateleiras:        1,
          tipo_porta:           '2_abrir',  # '2_abrir', '1_abrir_l', '1_abrir_r', 'correr', 'sem'
          puxador_espacamento:  128,         # mm entre furos do puxador
          com_tampo:            false,       # bancada normalmente avulsa
        }.freeze

        def build(parent_group)
          esp   = @params[:espessura]
          larg  = @params[:largura]
          alt   = @params[:altura]
          prof  = @params[:profundidade]

          # ── Laterais ──
          create_lateral(parent_group, :esquerda, alt, prof, esp, 0)
          create_lateral(parent_group, :direita, alt, prof, esp, larg - esp)

          # ── Base (horizontal inferior) ──
          create_horizontal(parent_group, 'Base', inner_width, prof, esp, 0, :base)

          # ── Tampo (opcional) ──
          if @params[:com_tampo]
            create_horizontal(parent_group, 'Tampo', inner_width, prof, esp, alt - esp, :top)
          end

          # ── Fundo ──
          if @params[:com_fundo]
            fundo_alt = alt - esp  # desconta base
            fundo_alt -= esp if @params[:com_tampo]
            create_back_panel(parent_group, inner_width, fundo_alt, @params[:espessura_fundo], @params[:recuo_fundo])
          end

          # ── Prateleiras ──
          n = @params[:n_prateleiras].to_i.clamp(0, 3)
          if n > 0
            espaco_util = alt - esp  # acima da base
            espaco_util -= esp if @params[:com_tampo]
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

          # Folga de porta: 2mm cada lado
          folga = 2

          case tipo
          when '2_abrir'
            # Duas portas iguais
            porta_larg = (larg.to_f / 2) - folga
            porta_alt  = alt - folga * 2

            porta_esq = ParametricEngine.create_piece(
              parent_group, 'Porta Esquerda',
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material],
              [folga, -esp - 2, folga],
              :door
            )
            tag_door(porta_esq, 'esquerda')

            porta_dir = ParametricEngine.create_piece(
              parent_group, 'Porta Direita',
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material],
              [larg / 2.0 + folga, -esp - 2, folga],
              :door
            )
            tag_door(porta_dir, 'direita')

          when '1_abrir_l'
            porta_larg = larg - folga * 2
            porta_alt  = alt - folga * 2
            porta = ParametricEngine.create_piece(
              parent_group, 'Porta',
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material],
              [folga, -esp - 2, folga],
              :door
            )
            tag_door(porta, 'esquerda')

          when '1_abrir_r'
            porta_larg = larg - folga * 2
            porta_alt  = alt - folga * 2
            porta = ParametricEngine.create_piece(
              parent_group, 'Porta',
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material],
              [folga, -esp - 2, folga],
              :door
            )
            tag_door(porta, 'direita')

          when 'correr'
            porta_larg = (larg.to_f / 2) + 20  # sobreposicao
            porta_alt  = alt - folga * 2
            # Porta traseira
            ParametricEngine.create_piece(
              parent_group, 'Porta Correr Tras',
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material],
              [0, -esp * 2 - 4, folga],
              :sliding_door
            )
            # Porta frontal
            ParametricEngine.create_piece(
              parent_group, 'Porta Correr Frente',
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material],
              [larg - porta_larg, -esp - 2, folga],
              :sliding_door
            )
          end
        end

        def tag_door(piece, lado)
          edges = { frontal: '22mm_branco', traseira: '22mm_branco', dir: '22mm_branco', esq: '22mm_branco' }
          ParametricEngine.add_edge_banding(piece, edges)
          ParametricEngine.apply_hardware_tags(piece, :door, {
            lado: lado,
            puxador_espacamento: @params[:puxador_espacamento],
            joint_type: @params[:tipo_juncao],
          })
        end
      end
    end
  end
end
