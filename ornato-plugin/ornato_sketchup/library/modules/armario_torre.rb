# ═══════════════════════════════════════════════════════
# ArmarioTorre — Armario torre (tall cabinet)
# Modulo alto para forno embutido, geladeira ou despensa.
# Possui abertura central e prateleiras acima/abaixo.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class ArmarioTorre < ModuleBase

        DEFAULTS = {
          largura:                600,
          altura:                 2100,
          profundidade:           560,
          abertura_altura:        600,     # altura da abertura (forno)
          abertura_posicao:       'meio',  # 'meio', 'baixo', 'cima'
          n_prateleiras_acima:    1,
          n_prateleiras_abaixo:   1,
          tipo_porta:             '2_abrir',
          puxador_espacamento:    160,
        }.freeze

        def build(parent_group)
          esp   = @params[:espessura]
          larg  = @params[:largura]
          alt   = @params[:altura]
          prof  = @params[:profundidade]
          ab_h  = @params[:abertura_altura].to_f

          # ── Laterais (altura completa) ──
          create_lateral(parent_group, :esquerda, alt, prof, esp, 0)
          create_lateral(parent_group, :direita, alt, prof, esp, larg - esp)

          # ── Base ──
          create_horizontal(parent_group, 'Base', inner_width, prof, esp, 0, :base)

          # ── Topo ──
          create_horizontal(parent_group, 'Topo', inner_width, prof, esp, alt - esp, :top)

          # ── Calcular posicao da abertura ──
          espaco_interno = alt - 2 * esp
          case @params[:abertura_posicao]
          when 'baixo'
            ab_z = esp
          when 'cima'
            ab_z = alt - esp - ab_h
          else # 'meio'
            ab_z = esp + (espaco_interno - ab_h) / 2.0
          end

          # ── Divisoria horizontal inferior (abaixo da abertura) ──
          if ab_z > esp + 1
            create_horizontal(parent_group, 'Divisoria Inferior', inner_width, prof, esp, ab_z - esp, :base)
          end

          # ── Divisoria horizontal superior (acima da abertura) ──
          div_sup_z = ab_z + ab_h
          if div_sup_z < alt - esp - 1
            create_horizontal(parent_group, 'Divisoria Superior', inner_width, prof, esp, div_sup_z, :top)
          end

          # ── Fundo ──
          if @params[:com_fundo]
            # Fundo apenas nas areas com prateleira (nao na abertura)
            fundo_alt = alt - 2 * esp
            create_back_panel(parent_group, inner_width, fundo_alt, @params[:espessura_fundo], @params[:recuo_fundo])
          end

          # ── Prateleiras acima da abertura ──
          n_acima = @params[:n_prateleiras_acima].to_i.clamp(0, 4)
          if n_acima > 0 && div_sup_z < alt - esp
            espaco_acima = (alt - esp) - (div_sup_z + esp)
            if espaco_acima > 50
              intervalo = espaco_acima.to_f / (n_acima + 1)
              n_acima.times do |i|
                z = div_sup_z + esp + (intervalo * (i + 1))
                create_horizontal(parent_group, "Prateleira Sup #{i + 1}", inner_width, inner_depth, esp, z, :shelf)
              end
            end
          end

          # ── Prateleiras abaixo da abertura ──
          n_abaixo = @params[:n_prateleiras_abaixo].to_i.clamp(0, 4)
          if n_abaixo > 0 && ab_z > esp * 2
            espaco_abaixo = (ab_z - esp) - esp
            if espaco_abaixo > 50
              intervalo = espaco_abaixo.to_f / (n_abaixo + 1)
              n_abaixo.times do |i|
                z = esp + (intervalo * (i + 1))
                create_horizontal(parent_group, "Prateleira Inf #{i + 1}", inner_width, inner_depth, esp, z, :shelf)
              end
            end
          end

          # ── Portas (acima e/ou abaixo da abertura) ──
          build_doors(parent_group, ab_z, div_sup_z)
        end

        private

        def build_doors(parent_group, ab_z, div_sup_z)
          tipo = @params[:tipo_porta]
          return if tipo == 'sem'

          esp   = @params[:espessura]
          larg  = @params[:largura]
          folga = 2

          # Porta superior (se ha espaco)
          porta_sup_alt = @params[:altura] - esp - div_sup_z - esp - folga * 2
          if porta_sup_alt > 100
            build_door_pair(parent_group, 'Porta Sup', porta_sup_alt, div_sup_z + esp + folga, tipo)
          end

          # Porta inferior (se ha espaco)
          porta_inf_alt = ab_z - esp - esp - folga * 2
          if porta_inf_alt > 100
            build_door_pair(parent_group, 'Porta Inf', porta_inf_alt, esp + folga, tipo)
          end
        end

        def build_door_pair(parent_group, prefix, porta_alt, z_start, tipo)
          esp   = @params[:espessura]
          larg  = @params[:largura]
          folga = 2

          case tipo
          when '2_abrir'
            porta_larg = (larg.to_f / 2) - folga
            [['Esq', 'esquerda', folga], ['Dir', 'direita', larg / 2.0 + folga]].each do |suffix, lado, x|
              porta = ParametricEngine.create_piece(
                parent_group, "#{prefix} #{suffix}",
                { largura: porta_larg, altura: porta_alt, espessura: esp },
                @params[:material], [x, -esp - 2, z_start], :door
              )
              tag_door(porta, lado)
            end
          when '1_abrir_l', '1_abrir_r'
            porta_larg = larg - folga * 2
            lado = tipo.end_with?('_l') ? 'esquerda' : 'direita'
            porta = ParametricEngine.create_piece(
              parent_group, prefix,
              { largura: porta_larg, altura: porta_alt, espessura: esp },
              @params[:material], [folga, -esp - 2, z_start], :door
            )
            tag_door(porta, lado)
          end
        end

        def tag_door(piece, lado)
          edges = { frontal: '22mm_branco', traseira: '22mm_branco', dir: '22mm_branco', esq: '22mm_branco' }
          ParametricEngine.add_edge_banding(piece, edges)
          ParametricEngine.apply_hardware_tags(piece, :door, {
            lado: lado, puxador_espacamento: @params[:puxador_espacamento],
          })
        end
      end
    end
  end
end
