# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# AmbienteTool — Desenha a planta de uma sala interativamente
#
# Experiência igual ao Promob:
#   1. Usuário ativa a ferramenta
#   2. Clica para definir os cantos da sala na planta (chão)
#   3. Preview mostra linha tracejada e dimensões em tempo real
#   4. Duplo-clique ou Enter fecha o polígono
#   5. Paredes são extrudadas automaticamente para cima
#   6. Cada parede é marcada como Ornato.wall — o PlacementTool
#      detecta isso e encosta módulos automaticamente
#   7. ESC cancela sem criar nada
#
# PAREDES
#   - Espessura padrão: 0 (wireframe) ou configurável
#   - Altura padrão: 2700mm (configurável no painel)
#   - Face interna marcada como wall (para snap de módulos)
#   - Grupo geral marcado como Ornato.ambiente
#
# OPENINGS (futuro)
#   - Após criar a sala, o usuário pode ativar o DoorTool
#     para recortar vãos nas paredes
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    class AmbienteTool

      CURSOR_PENCIL  = 632  # SketchUp pencil cursor ID
      CURSOR_DEFAULT = 0

      COLOR_LINE       = Sketchup::Color.new(255, 220, 60,  255)  # yellow
      COLOR_PREVIEW    = Sketchup::Color.new(255, 220, 60,  120)  # yellow transparent
      COLOR_FILL       = Sketchup::Color.new(200, 220, 255, 20)   # light blue tint
      COLOR_WALL_EDGE  = Sketchup::Color.new(80,  150, 255, 200)  # blue
      COLOR_CLOSE_HINT = Sketchup::Color.new(80,  255, 150, 200)  # green when can close
      COLOR_DIM        = Sketchup::Color.new(255, 255, 255, 220)

      WALL_HEIGHT_DEFAULT = 2700.0 # mm
      MIN_POINTS          = 3      # mínimo de pontos para fechar a sala
      CLOSE_RADIUS        = 300.mm # distância para "snap to close"

      # ─────────────────────────────────────────────────────────
      # @param controller [UI::DialogController, nil]
      # @param wall_height [Float]  altura das paredes em mm
      # ─────────────────────────────────────────────────────────
      def initialize(controller = nil, wall_height: WALL_HEIGHT_DEFAULT)
        @controller  = controller
        @wall_height = wall_height.to_f
        @points      = []       # Array<Geom::Point3d> — cantos definidos
        @cursor_pt   = nil      # ponto atual do cursor (no chão)
        @can_close   = false    # true quando cursor está perto do 1º ponto
        @ip          = nil
      end

      # ── Tool Interface ────────────────────────────────────────

      def activate
        @ip = Sketchup::InputPoint.new
        @points = []
        @cursor_pt = nil
        update_status
        Sketchup.active_model.active_view.invalidate
      end

      def deactivate(view)
        view.invalidate
        Sketchup.status_text = ''
      end

      def resume(view)
        update_status
        view.invalidate
      end

      def suspend(view)
        view.invalidate
      end

      def onMouseMove(flags, x, y, view)
        @ip.pick(view, x, y)
        pt = pick_floor_point(view, x, y)
        return unless pt

        # Snap ao ponto inicial para fechar a sala
        if @points.length >= MIN_POINTS
          dist = pt.distance(@points.first)
          @can_close = dist < CLOSE_RADIUS
          pt = @points.first if @can_close
        else
          @can_close = false
        end

        @cursor_pt = pt
        view.invalidate
        update_status
      end

      def onLButtonDown(flags, x, y, view)
        pt = @cursor_pt
        return unless pt

        if @can_close && @points.length >= MIN_POINTS
          # Fechar a sala
          build_ambiente
          Sketchup.active_model.select_tool(nil)
          return
        end

        # Evitar ponto duplicado (clique acidental)
        if @points.any? { |p| p.distance(pt) < 5.mm }
          return
        end

        @points << Geom::Point3d.new(pt.x, pt.y, 0)
        view.invalidate
        update_status
      end

      def onLButtonDoubleClick(flags, x, y, view)
        return unless @points.length >= MIN_POINTS
        build_ambiente
        Sketchup.active_model.select_tool(nil)
      end

      def onKeyDown(key, _repeat, _flags, view)
        case key
        when 13  # Enter
          if @points.length >= MIN_POINTS
            build_ambiente
            Sketchup.active_model.select_tool(nil)
            return true
          end
        when 8, 46  # Backspace / Delete — remove último ponto
          @points.pop if @points.any?
          @can_close = false
          view.invalidate
          update_status
          return true
        when 27  # ESC
          Sketchup.active_model.select_tool(nil)
          return true
        end
        false
      end

      def onKeyUp(*); false; end

      def onSetCursor
        ::UI.set_cursor(CURSOR_PENCIL)
      rescue
        ::UI.set_cursor(CURSOR_DEFAULT)
      end

      def getExtents
        bb = Geom::BoundingBox.new
        @points.each { |p| bb.add(p) }
        bb.add(@cursor_pt) if @cursor_pt
        bb
      end

      # ── Drawing ───────────────────────────────────────────────

      def draw(view)
        all_pts = @cursor_pt ? @points + [@cursor_pt] : @points

        # Filled polygon preview (floor)
        if all_pts.length >= 3
          view.drawing_color = COLOR_FILL
          view.draw(GL_POLYGON, all_pts.map { |p| Geom::Point3d.new(p.x, p.y, 0) })
        end

        # Outline
        if all_pts.length >= 2
          lines = []
          all_pts.each_cons(2) { |a, b| lines << a << b }
          # Close preview line to first point
          if all_pts.length >= 3
            lines << all_pts.last << all_pts.first
          end
          view.drawing_color = @can_close ? COLOR_CLOSE_HINT : COLOR_LINE
          view.line_width = 2
          view.line_stipple = @can_close ? '' : '-'
          view.draw(GL_LINES, lines.map { |p| Geom::Point3d.new(p.x, p.y, 0) })
          view.line_stipple = ''
        end

        # Points (vertices)
        @points.each_with_index do |pt, i|
          color = i == 0 ? COLOR_CLOSE_HINT : COLOR_LINE
          draw_vertex(view, pt, color, i == 0 ? 6 : 4)
        end

        # Cursor point
        if @cursor_pt
          draw_vertex(view, @cursor_pt, COLOR_WALL_EDGE, 4)
        end

        # Dimension labels
        draw_dimensions(view, all_pts)
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      # ── Pick point on ground plane ────────────────────────────

      def pick_floor_point(view, x, y)
        # Prefer horizontal faces first
        ph = view.pick_helper
        ph.do_pick(x, y)
        ph.count.times do |i|
          e = ph.leaf_at(i)
          next unless e.is_a?(Sketchup::Face)
          tr = ph.transformation_at(i)
          normal = tr * e.normal
          next unless normal.z > 0.7
          pt_on_face = tr * e.vertices.first.position
          ray = view.pickray(x, y)
          hit = Geom.intersect_line_plane(ray, [pt_on_face, normal])
          return hit if hit
        end

        # Fallback: Z=0 plane
        ray = view.pickray(x, y)
        hit = Geom.intersect_line_plane(ray, [Geom::Point3d.new(0, 0, 0), Z_AXIS])
        hit
      end

      # ── Build the room geometry ───────────────────────────────

      def build_ambiente
        return if @points.length < MIN_POINTS

        model = Sketchup.active_model
        height = @wall_height.mm

        model.start_operation('Ornato: Criar Ambiente', true)

        begin
          # ── Grupo principal do ambiente ──────────────────────
          ambiente_group = model.active_entities.add_group
          ambiente_group.name = "Ambiente #{Time.now.strftime('%H%M%S')}"
          ambiente_group.set_attribute('Ornato', 'type',        'ambiente')
          ambiente_group.set_attribute('Ornato', 'wall_height', @wall_height)
          ambiente_group.set_attribute('Ornato', 'points',      JSON.generate(@points.map { |p| [p.x.to_mm.round(1), p.y.to_mm.round(1)] }))
          ambiente_group.set_attribute('Ornato', 'created_at',  Time.now.iso8601)

          ents = ambiente_group.entities

          # ── Chão (piso) ─────────────────────────────────────
          floor_pts = @points.map { |p| Geom::Point3d.new(p.x, p.y, 0) }
          floor_face = ents.add_face(floor_pts)
          if floor_face
            # Garantir que a normal aponta para cima (Z+)
            floor_face.reverse! if floor_face.normal.z < 0
            floor_face.set_attribute('Ornato', 'type', 'floor')
            apply_floor_material(floor_face, model)
          end

          # ── Paredes ─────────────────────────────────────────
          n = @points.length
          n.times do |i|
            p1 = Geom::Point3d.new(@points[i].x,     @points[i].y,     0)
            p2 = Geom::Point3d.new(@points[(i+1)%n].x, @points[(i+1)%n].y, 0)
            p3 = Geom::Point3d.new(@points[(i+1)%n].x, @points[(i+1)%n].y, height)
            p4 = Geom::Point3d.new(@points[i].x,     @points[i].y,     height)

            seg_len = p1.distance(p2)
            next if seg_len < 1.mm

            wall_face = ents.add_face([p1, p2, p3, p4])
            next unless wall_face

            # Normal da parede aponta para dentro da sala
            wall_face.reverse! unless face_points_inward?(wall_face, @points)
            wall_face.set_attribute('Ornato', 'type',    'wall')
            wall_face.set_attribute('Ornato', 'wall_idx', i)
            wall_face.set_attribute('Ornato', 'length_mm', seg_len.to_mm.round(1))
            apply_wall_material(wall_face, model)
          end

          # ── Teto (opcional — útil para render) ──────────────
          ceiling_pts = @points.map { |p| Geom::Point3d.new(p.x, p.y, height) }.reverse
          ceiling_face = ents.add_face(ceiling_pts)
          if ceiling_face
            ceiling_face.reverse! if ceiling_face.normal.z < 0
            ceiling_face.set_attribute('Ornato', 'type', 'ceiling')
          end

          model.commit_operation

          # Feedback
          area_m2 = calc_area_m2
          @controller&.panel_status("Ambiente criado: #{area_m2.round(1)}m² | #{@points.length} paredes | #{@wall_height.to_i}mm altura")
          Sketchup.status_text = "Ornato: Ambiente criado (#{area_m2.round(1)}m²)"

          ambiente_group

        rescue => e
          model.abort_operation
          puts "Ornato AmbienteTool ERRO: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
          ::UI.messagebox("Erro ao criar ambiente: #{e.message}")
          nil
        end
      end

      # Verifica se a face aponta para o interior do polígono
      # (produto vetorial da normal com um vetor para o centro)
      def face_points_inward?(face, floor_points)
        center = Geom::Point3d.new(
          floor_points.sum(&:x) / floor_points.length,
          floor_points.sum(&:y) / floor_points.length,
          face.vertices.first.position.z
        )
        face_center = face.vertices.inject(Geom::Point3d.new(0,0,0)) do |sum, v|
          Geom::Point3d.new(sum.x + v.position.x / 4.0, sum.y + v.position.y / 4.0, sum.z + v.position.z / 4.0)
        end
        to_center = center - face_center
        face.normal.dot(to_center) > 0
      rescue
        true
      end

      def apply_wall_material(face, model)
        mat = model.materials['Ornato_Wall'] || begin
          m = model.materials.add('Ornato_Wall')
          m.color = Sketchup::Color.new(240, 238, 235)
          m.alpha = 0.85
          m
        end
        face.material = mat
        face.back_material = mat
      rescue; end

      def apply_floor_material(face, model)
        mat = model.materials['Ornato_Floor'] || begin
          m = model.materials.add('Ornato_Floor')
          m.color = Sketchup::Color.new(220, 210, 195)
          m
        end
        face.material = mat
      rescue; end

      # ── Drawing helpers ──────────────────────────────────────

      def draw_vertex(view, pt, color, size)
        screen = view.screen_coords(pt)
        half = size
        view.drawing_color = color
        view.draw2d(GL_POLYGON, [
          Geom::Point3d.new(screen.x - half, screen.y - half, 0),
          Geom::Point3d.new(screen.x + half, screen.y - half, 0),
          Geom::Point3d.new(screen.x + half, screen.y + half, 0),
          Geom::Point3d.new(screen.x - half, screen.y + half, 0),
        ])
      rescue; end

      def draw_dimensions(view, pts)
        return if pts.length < 2
        pts.each_cons(2) do |a, b|
          mid = Geom::Point3d.linear_combination(0.5, a, 0.5, b)
          len_mm = a.distance(b).to_mm.round
          sc = view.screen_coords(Geom::Point3d.new(mid.x, mid.y, 0))
          view.draw_text(sc, "#{len_mm}mm", color: COLOR_DIM, size: 11)
        end
      rescue; end

      def calc_area_m2
        return 0.0 if @points.length < 3
        n = @points.length
        area = 0.0
        n.times do |i|
          j = (i + 1) % n
          area += @points[i].x * @points[j].y
          area -= @points[j].x * @points[i].y
        end
        (area.abs / 2.0).to_mm.to_mm / 1_000_000.0  # mm² → m²
      rescue
        0.0
      end

      def update_status
        count = @points.length
        if count == 0
          Sketchup.status_text = 'Ornato Ambiente: Clique para definir os cantos da sala | ESC=cancelar'
        elsif count < MIN_POINTS
          Sketchup.status_text = "Ornato Ambiente: #{count} ponto(s) | Mais #{MIN_POINTS - count} para fechar | Backspace=desfazer | ESC=cancelar"
        else
          Sketchup.status_text = "Ornato Ambiente: #{count} pontos | Enter ou duplo-clique para fechar | Aproxime do 1º ponto para snap | Backspace=desfazer"
        end
      end
    end # class AmbienteTool
  end # module Tools
end # module Ornato
