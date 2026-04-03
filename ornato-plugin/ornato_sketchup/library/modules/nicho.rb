# ═══════════════════════════════════════════════════════
# Nicho — Estante aberta (open shelf unit)
# Modulo sem portas com prateleiras opcionais.
# Pode ter ou nao topo e fundo traseiro.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Nicho < ModuleBase

        DEFAULTS = {
          largura:        600,
          altura:         720,
          profundidade:   340,
          n_prateleiras:  2,
          com_topo:       true,
          com_fundo:      true,
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

          # ── Topo (opcional) ──
          if @params[:com_topo]
            create_horizontal(parent_group, 'Topo', inner_width, prof, esp, alt - esp, :top)
          end

          # ── Fundo ──
          if @params[:com_fundo]
            fundo_alt = alt - esp
            fundo_alt -= esp if @params[:com_topo]
            create_back_panel(parent_group, inner_width, fundo_alt, @params[:espessura_fundo], @params[:recuo_fundo])
          end

          # ── Prateleiras ──
          n = @params[:n_prateleiras].to_i.clamp(0, 8)
          if n > 0
            espaco_base = esp
            espaco_topo = @params[:com_topo] ? (alt - esp) : alt
            espaco_util = espaco_topo - espaco_base
            intervalo = espaco_util.to_f / (n + 1)

            n.times do |i|
              z = espaco_base + (intervalo * (i + 1))
              create_horizontal(parent_group, "Prateleira #{i + 1}", inner_width, inner_depth, esp, z, :shelf)
            end
          end
        end
      end
    end
  end
end
