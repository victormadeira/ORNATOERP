# ═══════════════════════════════════════════════════════
# ColunaCanto — Modulo de canto (corner unit)
# Suporta formato L ou diagonal para unir dois
# alinhamentos de modulos em 90 graus.
# ═══════════════════════════════════════════════════════

module Ornato
  module Library
    module Modules
      class ColunaCanto < ModuleBase

        DEFAULTS = {
          largura_a:      600,    # lado A (eixo X)
          largura_b:      600,    # lado B (eixo Y)
          altura:         720,
          profundidade:   560,
          tipo:           'L',    # 'L' ou 'diagonal'
          espessura:      18,
          material:       'MDF_18_BRANCO',
          n_prateleiras:  1,
        }.freeze

        # Override largura para evitar validacao do ModuleBase
        def initialize(params = {})
          merged = DEFAULTS.merge(params)
          merged[:largura] = [merged[:largura_a], merged[:largura_b]].max
          super(merged)
        end

        def build(parent_group)
          case @params[:tipo]
          when 'L'
            build_l_shape(parent_group)
          when 'diagonal'
            build_diagonal(parent_group)
          else
            build_l_shape(parent_group)
          end
        end

        private

        def build_l_shape(parent_group)
          esp   = @params[:espessura]
          la    = @params[:largura_a].to_f
          lb    = @params[:largura_b].to_f
          alt   = @params[:altura]
          prof  = @params[:profundidade]

          # ── Lateral externa A (face X, lado esquerdo) ──
          ParametricEngine.create_piece(
            parent_group, 'Lateral Ext A',
            { largura: esp, altura: alt, espessura: prof },
            @params[:material],
            [0, lb - prof, 0],
            :lateral
          ).tap { |p| tag_lateral(p) }

          # ── Lateral externa B (face Y, lado inferior) ──
          ParametricEngine.create_piece(
            parent_group, 'Lateral Ext B',
            { largura: la, altura: alt, espessura: esp },
            @params[:material],
            [0, 0, 0],
            :lateral
          ).tap { |p| tag_lateral(p) }

          # ── Lateral interna (canto do L, vertical) ──
          # Peca que forma o canto interno
          canto_prof = prof - esp
          ParametricEngine.create_piece(
            parent_group, 'Lateral Canto Vert',
            { largura: esp, altura: alt, espessura: canto_prof },
            @params[:material],
            [la - esp, esp, 0],
            :lateral
          ).tap { |p| tag_lateral(p) }

          # ── Peca de conexao horizontal (canto do L) ──
          ParametricEngine.create_piece(
            parent_group, 'Lateral Canto Horiz',
            { largura: la - esp, altura: alt, espessura: esp },
            @params[:material],
            [0, lb - esp, 0],
            :lateral
          ).tap { |p| tag_lateral(p) }

          # ── Base ──
          # Base em L: duas pecas retangulares
          base_a_larg = la - 2 * esp
          base_b_larg = lb - 2 * esp

          ParametricEngine.create_piece(
            parent_group, 'Base Faixa A',
            { largura: la - esp, altura: esp, espessura: prof - esp },
            @params[:material],
            [esp, esp, 0],
            :base
          ).tap { |p| ParametricEngine.apply_hardware_tags(p, :base, { joint_type: @params[:tipo_juncao] }) }

          # ── Fundo ──
          if @params[:com_fundo]
            fundo_alt = alt - esp
            ParametricEngine.create_piece(
              parent_group, 'Fundo',
              { largura: la - esp, altura: fundo_alt, espessura: @params[:espessura_fundo] },
              'HDF_3',
              [esp, lb - @params[:recuo_fundo] - @params[:espessura_fundo], esp],
              :back
            )
          end

          # ── Prateleiras ──
          n = @params[:n_prateleiras].to_i.clamp(0, 3)
          if n > 0
            espaco_util = alt - 2 * esp
            intervalo = espaco_util.to_f / (n + 1)
            n.times do |i|
              z = esp + (intervalo * (i + 1))
              ParametricEngine.create_piece(
                parent_group, "Prateleira #{i + 1}",
                { largura: la - 2 * esp, altura: esp, espessura: prof - esp - @params[:recuo_fundo] - @params[:espessura_fundo] },
                @params[:material],
                [esp, esp, z],
                :shelf
              )
            end
          end
        end

        def build_diagonal(parent_group)
          esp   = @params[:espessura]
          la    = @params[:largura_a].to_f
          lb    = @params[:largura_b].to_f
          alt   = @params[:altura]
          prof  = @params[:profundidade]

          # ── Lateral A (eixo X) ──
          ParametricEngine.create_piece(
            parent_group, 'Lateral A',
            { largura: esp, altura: alt, espessura: prof },
            @params[:material],
            [0, 0, 0],
            :lateral
          ).tap { |p| tag_lateral(p) }

          # ── Lateral B (eixo Y) ──
          ParametricEngine.create_piece(
            parent_group, 'Lateral B',
            { largura: la, altura: alt, espessura: esp },
            @params[:material],
            [0, lb - esp, 0],
            :lateral
          ).tap { |p| tag_lateral(p) }

          # ── Painel diagonal (fundo em angulo) ──
          diag_length = Math.sqrt(la**2 + lb**2)
          diag_angle = Math.atan2(lb, la)

          diag = ParametricEngine.create_piece(
            parent_group, 'Diagonal',
            { largura: diag_length, altura: alt, espessura: esp },
            @params[:material],
            [la, 0, 0],
            :back
          )

          # Rotacionar o painel diagonal
          origin = Geom::Point3d.new(la.mm, 0, 0)
          rotation = Geom::Transformation.rotation(origin, Geom::Vector3d.new(0, 0, 1), Math::PI - diag_angle)
          diag.transform!(rotation)

          # ── Base ──
          ParametricEngine.create_piece(
            parent_group, 'Base',
            { largura: la - esp, altura: esp, espessura: lb - esp },
            @params[:material],
            [esp, 0, 0],
            :base
          )
        end

        def tag_lateral(piece)
          edges = Core::EdgeBanding.detect_by_role({ role: :lateral, espessura: @params[:espessura] })
          ParametricEngine.add_edge_banding(piece, edges)
          ParametricEngine.apply_hardware_tags(piece, :lateral, { joint_type: @params[:tipo_juncao] })
        end
      end
    end
  end
end
