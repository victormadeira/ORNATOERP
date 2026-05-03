# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# CopyArrayTool — Cópia linear / espelho de módulos Ornato
#
# Funcionalidades:
#   - Cópia simples: duplica o módulo N vezes ao longo de um eixo
#   - Array linear: posiciona cópias lado a lado (X ou Y), sem gap
#   - Espelho: espelha o módulo em torno de um eixo (X ou Y)
#
# Workflow:
#   1. Usuário seleciona um grupo Ornato
#   2. Ativa CopyArrayTool (menu ou atalho)
#   3. Painel mostra opções: direção (X/Y), N cópias, gap
#   4. Clique confirma; ESC cancela
#
# Alternativa rápida (sem UI):
#   CopyArrayTool.copy_along_x(group, n_copies, gap_mm: 0)
#   CopyArrayTool.mirror_x(group)
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    class CopyArrayTool

      CURSOR_MOVE    = 633
      CURSOR_DEFAULT = 0

      COLOR_GHOST  = Sketchup::Color.new(19, 121, 240, 50)
      COLOR_EDGE   = Sketchup::Color.new(19, 121, 240, 200)
      COLOR_MIRROR = Sketchup::Color.new(201, 169, 110, 180)

      # ─────────────────────────────────────────────────────────
      # @param group   [Sketchup::Group]  módulo a copiar/espelhar
      # @param options [Hash]
      #   :direction [:x | :y]   eixo de cópia (default :x)
      #   :count     [Integer]   número de cópias (default 1)
      #   :gap_mm    [Float]     gap entre cópias em mm (default 0)
      #   :mirror    [Boolean]   se true faz espelho antes de copiar
      #   :controller [UI::DialogController, nil]
      # ─────────────────────────────────────────────────────────
      def initialize(group, options = {})
        @group      = group
        @direction  = (options[:direction] || :x).to_sym
        @count      = (options[:count] || 1).to_i
        @gap_mm     = (options[:gap_mm] || 0).to_f
        @mirror     = options[:mirror] || false
        @controller = options[:controller]
        @active     = true
        @preview_positions = []
      end

      def activate
        compute_preview_positions
        update_status
        Sketchup.active_model.active_view.invalidate
      end

      def deactivate(view)
        view.invalidate
        Sketchup.status_text = ''
        @active = false
      end

      def resume(view)
        update_status
        view.invalidate
      end

      def onKeyDown(key, _repeat, _flags, view)
        case key
        when 27  # ESC
          Sketchup.active_model.select_tool(nil)
          return true
        when 13  # Enter
          apply_copy
          Sketchup.active_model.select_tool(nil)
          return true
        end
        false
      end

      def onKeyUp(*); false; end

      def onLButtonDown(_flags, _x, _y, _view)
        apply_copy
        Sketchup.active_model.select_tool(nil)
      end

      def onSetCursor
        ::UI.set_cursor(CURSOR_MOVE)
      rescue
        ::UI.set_cursor(CURSOR_DEFAULT)
      end

      def getExtents
        bb = @group ? @group.bounds.clone : Geom::BoundingBox.new
        @preview_positions.each do |pos|
          bb.add(Geom::Point3d.new(pos[0].mm, pos[1].mm, pos[2].mm))
        end
        bb
      end

      # ── Drawing ───────────────────────────────────────────────

      def draw(view)
        return unless @group

        @preview_positions.each_with_index do |pos, idx|
          draw_ghost(view, pos, idx == 0 ? COLOR_MIRROR : COLOR_GHOST, idx)
        end
      end

      # ─────────────────────────────────────────────────────────
      # Class-level shortcuts — não precisam da tool interativa
      # ─────────────────────────────────────────────────────────

      def self.copy_along_x(group, n_copies = 1, gap_mm: 0)
        tool = new(group, direction: :x, count: n_copies, gap_mm: gap_mm)
        tool.apply_copy
      end

      def self.copy_along_y(group, n_copies = 1, gap_mm: 0)
        tool = new(group, direction: :y, count: n_copies, gap_mm: gap_mm)
        tool.apply_copy
      end

      def self.mirror_x(group)
        tool = new(group, mirror: true, count: 1, direction: :x)
        tool.apply_copy
      end

      # ─────────────────────────────────────────────────────────
      # Aplica as cópias (chamado pelo clique/Enter/API direta)
      # ─────────────────────────────────────────────────────────
      def apply_copy
        return unless @group
        model = Sketchup.active_model
        model.start_operation('Ornato: Copiar Modulos', true)

        begin
          new_groups = []

          @preview_positions.each do |pos|
            new_group = copy_group(@group, pos)
            new_groups << new_group if new_group
          end

          model.commit_operation

          # Resolve adjacências para todos os novos grupos
          new_groups.each do |g|
            begin
              NeighborResolver.resolve_for(g)
            rescue => e
              puts "Ornato CopyArrayTool: NeighborResolver error: #{e.message}"
            end
          end

          # Selecionar novos grupos
          model.selection.clear
          new_groups.each { |g| model.selection.add(g) }

          @controller&.panel_status("#{new_groups.length} copia(s) criada(s)")
          Sketchup.status_text = "Ornato: #{new_groups.length} copia(s) criada(s)"
          new_groups

        rescue => e
          model.abort_operation
          puts "Ornato CopyArrayTool apply_copy ERRO: #{e.message}"
          @controller&.panel_status("Erro ao copiar: #{e.message}")
          []
        end
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      def compute_preview_positions
        @preview_positions = []
        return unless @group

        bb     = @group.bounds
        origin = @group.transformation.origin

        # Tamanho do módulo no eixo de cópia
        width_mm = case @direction
          when :x then bb.width.to_mm
          when :y then bb.depth.to_mm
          else bb.width.to_mm
        end

        step_mm = width_mm + @gap_mm

        @count.times do |i|
          offset = step_mm * (i + 1)
          pos = case @direction
            when :x then [origin.x.to_mm + offset, origin.y.to_mm, origin.z.to_mm]
            when :y then [origin.x.to_mm, origin.y.to_mm + offset, origin.z.to_mm]
            else         [origin.x.to_mm + offset, origin.y.to_mm, origin.z.to_mm]
          end
          @preview_positions << pos
        end
      end

      def copy_group(source_group, position_mm)
        model = Sketchup.active_model
        new_group = model.active_entities.add_group

        # Copiar entidades filhas
        source_group.entities.each do |e|
          begin
            new_group.entities.add_instance(e.definition, e.transformation) if e.is_a?(Sketchup::ComponentInstance)
            # Para grupos filhos, copiamos recursivamente
            if e.is_a?(Sketchup::Group)
              child_copy = new_group.entities.add_group
              child_copy.name = e.name
              e.entities.each do |sub|
                begin
                  child_copy.entities.add_instance(sub.definition, sub.transformation) if sub.is_a?(Sketchup::ComponentInstance)
                rescue; end
              end
              child_copy.transform!(e.transformation)
            end
          rescue; end
        end

        # Copiar atributos Ornato
        %w[module_type params created_at json_driven module_id].each do |key|
          val = source_group.get_attribute('Ornato', key)
          new_group.set_attribute('Ornato', key, val) if val
        end
        new_group.name = source_group.name

        # Posicionar
        tx = position_mm[0].to_f
        ty = position_mm[1].to_f
        tz = position_mm[2].to_f

        # Aplicar espelho se solicitado
        if @mirror
          # Espelha em torno do eixo Y (inverte X)
          scale_tr = Geom::Transformation.scaling(-1, 1, 1)
          new_group.transform!(scale_tr)
        end

        tr = Geom::Transformation.new(Geom::Point3d.new(tx.mm, ty.mm, tz.mm))
        new_group.transform!(tr)

        new_group
      end

      def draw_ghost(view, pos_mm, color, idx)
        bb   = @group.bounds
        w    = bb.width
        d    = bb.depth
        h    = bb.height
        ox   = pos_mm[0].mm
        oy   = pos_mm[1].mm
        oz   = pos_mm[2].mm

        corners = [
          Geom::Point3d.new(ox,   oy,   oz  ),
          Geom::Point3d.new(ox+w, oy,   oz  ),
          Geom::Point3d.new(ox+w, oy+d, oz  ),
          Geom::Point3d.new(ox,   oy+d, oz  ),
          Geom::Point3d.new(ox,   oy,   oz+h),
          Geom::Point3d.new(ox+w, oy,   oz+h),
          Geom::Point3d.new(ox+w, oy+d, oz+h),
          Geom::Point3d.new(ox,   oy+d, oz+h),
        ]

        view.drawing_color = color
        [[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]].each do |q|
          view.draw(GL_QUADS, q.map { |i| corners[i] })
        end

        view.drawing_color = COLOR_EDGE
        view.line_width = 1
        lines = []
        [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].each do |a, b|
          lines << corners[a] << corners[b]
        end
        view.draw(GL_LINES, lines)

        # Número da cópia
        label_pt = view.screen_coords(corners[4])
        view.draw_text(label_pt, "#{idx+1}", color: COLOR_EDGE, size: 10)
      rescue; end

      def update_status
        dir_label = @direction == :x ? 'X (→)' : 'Y (↑)'
        Sketchup.status_text = "Ornato Copiar: #{@count} copia(s) em #{dir_label} | Clique/Enter=confirmar | ESC=cancelar"
      end
    end
  end
end
