# ═══════════════════════════════════════════════════════
# Sapateira — Suporte inclinado para sapatos (shoe rack)
# Modulo com prateleiras inclinadas em angulo configuravel.
# Cada nivel pode acomodar um par de sapatos.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class Sapateira < ModuleBase

        DEFAULTS = {
          largura:        600,
          altura:         720,
          profundidade:   340,
          n_niveis:       4,
          angulo:         20,    # graus de inclinacao (15-30)
          espessura:      18,
          material:       'MDF_18_BRANCO',
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

          # ── Prateleiras inclinadas ──
          n = @params[:n_niveis].to_i.clamp(1, 8)
          angulo = @params[:angulo].to_f.clamp(15, 30)
          angulo_rad = angulo * Math::PI / 180.0

          espaco_util = alt - esp  # acima da base
          intervalo = espaco_util.to_f / n
          shelf_depth = prof - 40  # recuo frontal/traseiro

          n.times do |i|
            z_center = esp + (intervalo * (i + 0.5))

            # Prateleira com rotacao (inclinada)
            shelf = ParametricEngine.create_piece(
              parent_group, "Suporte Sapato #{i + 1}",
              { largura: inner_width, altura: esp, espessura: shelf_depth },
              @params[:material],
              [esp, 20, z_center],
              :shelf
            )

            # Aplicar rotacao em torno do eixo X (inclinar para frente)
            center = Geom::Point3d.new(
              (esp + inner_width / 2.0).mm,
              (prof / 2.0).mm,
              z_center.mm
            )
            rotation = Geom::Transformation.rotation(center, Geom::Vector3d.new(1, 0, 0), -angulo_rad)
            shelf.transform!(rotation)

            edges = { frontal: '22mm_branco', traseira: '', dir: '', esq: '' }
            ParametricEngine.add_edge_banding(shelf, edges)
            ParametricEngine.apply_hardware_tags(shelf, :shelf, { tipo: 'fixa', angulo: angulo })
          end
        end
      end
    end
  end
end
