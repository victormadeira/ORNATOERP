# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# AimPlacementTool — "Mira" visual para inserir agregados em vãos
#
# Sprint MIRA-B do plano premium CNC.
#
# Workflow:
#   1. Usuário escolhe um agregado (prateleira, divisória, gaveteiro)
#      pelo menu Ornato CNC → Inserir agregado, ou via UI v2.
#   2. Tool ativa: cursor vira mira; ao passar sobre um módulo
#      Ornato (Group com attr Ornato.tipo == 'modulo'),
#      o BayDetector retorna os vãos internos.
#   3. O vão sob o cursor recebe um ghost translúcido
#      (verde se cabe, vermelho se for muito pequeno).
#   4. Click = confirma → JsonModuleBuilder.build_aggregate(bay, id).
#   5. Shift+click = mantém a tool ativa pra repetir.
#   6. ESC cancela.
#
# Dependências (carregadas opcionalmente):
#   - Ornato::Geometry::BayDetector  (Sprint MIRA-A)
#   - Ornato::Library::JsonModuleBuilder.build_aggregate (Sprint MIRA-C)
# Caso ausentes, a tool degrada com aviso no logger.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    class AimPlacementTool
      ACTIVE_FILL_COLOR  = defined?(Sketchup::Color) ? Sketchup::Color.new(0,   200, 0,   60)  : nil
      INVALID_FILL_COLOR = defined?(Sketchup::Color) ? Sketchup::Color.new(220, 50,  50,  60)  : nil
      EDGE_OK_COLOR      = defined?(Sketchup::Color) ? Sketchup::Color.new(0,   100, 0,   220) : nil
      EDGE_BAD_COLOR     = defined?(Sketchup::Color) ? Sketchup::Color.new(160, 30,  30,  220) : nil
      TEXT_COLOR         = defined?(Sketchup::Color) ? Sketchup::Color.new(255, 255, 255, 230) : nil

      CURSOR_CROSSHAIR = 0

      EDGE_PAIRS = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7],
      ].freeze

      FACE_QUADS = [
        [0,1,5,4], [1,2,6,5], [2,3,7,6],
        [3,0,4,7], [4,5,6,7], [3,2,1,0],
      ].freeze

      # @param aggregate_id [String] ex: 'prateleira', 'divisoria', 'gaveteiro_simples'
      def initialize(aggregate_id)
        @aggregate_id   = aggregate_id.to_s
        @aggregate_meta = self.class.load_aggregate_meta(@aggregate_id)
        @hovered_bay    = nil
        @hovered_module = nil
        @valid          = false
        @detectors      = {}
      end

      # ── Tool Interface ──────────────────────────────────────

      def activate
        unless defined?(Ornato::Geometry::BayDetector)
          msg = "Ornato: BayDetector indisponivel (Sprint MIRA-A pendente). AimPlacementTool desativada."
          log_warn(msg)
          Sketchup.status_text = msg if defined?(Sketchup)
          Sketchup.active_model.select_tool(nil) if defined?(Sketchup) && Sketchup.active_model
          return
        end

        Sketchup.active_model.active_view.invalidate if defined?(Sketchup) && Sketchup.active_model
        update_status
      end

      def deactivate(view)
        view.invalidate if view
        Sketchup.status_text = '' if defined?(Sketchup)
      end

      def resume(view); view&.invalidate; update_status; end
      def suspend(view); view&.invalidate; end

      def onSetCursor
        ::UI.set_cursor(CURSOR_CROSSHAIR) if defined?(::UI)
      end

      def getExtents
        if defined?(Sketchup) && Sketchup.active_model
          Sketchup.active_model.bounds
        else
          Geom::BoundingBox.new
        end
      end

      def onMouseMove(flags, x, y, view)
        ph = view.pick_helper
        ph.do_pick(x, y)

        module_group = walk_up_to_module(ph.path_at(0))
        if module_group.nil?
          @hovered_module = nil
          @hovered_bay = nil
          @valid = false
          update_status
          view.invalidate
          return
        end

        ip = view.inputpoint(x, y)
        world_pt = ip.position
        local_pt = module_group.transformation.inverse * world_pt

        bays = bays_for(module_group)
        bay  = bays.find { |b| bay_contains?(b, local_pt) }

        @hovered_module = module_group
        @hovered_bay    = bay
        @valid          = !bay.nil? && aggregate_fits?(bay, @aggregate_meta)

        update_status
        view.invalidate
      end

      def onLButtonDown(flags, x, y, view)
        return unless @valid && @hovered_bay && @hovered_module

        unless defined?(Ornato::Library::JsonModuleBuilder) &&
               Ornato::Library::JsonModuleBuilder.respond_to?(:build_aggregate)
          log_warn("JsonModuleBuilder.build_aggregate indisponivel (Sprint MIRA-C pendente)")
          Sketchup.status_text = "Ornato: agregados ainda nao implementados (MIRA-C pendente)"
          return
        end

        Sketchup.active_model.start_operation("Inserir #{label}", true)
        begin
          Ornato::Library::JsonModuleBuilder.build_aggregate(
            @hovered_bay, @aggregate_id, parent: @hovered_module
          )
        rescue => e
          log_error("AimPlacementTool falhou: #{e.message}")
        ensure
          Sketchup.active_model.commit_operation
        end

        # Shift+click → continua tool; senão volta pra ferramenta padrão
        keep_active = (flags & CONSTRAIN_MODIFIER_MASK) == CONSTRAIN_MODIFIER_MASK if defined?(CONSTRAIN_MODIFIER_MASK)
        if keep_active
          @hovered_bay = nil
          @valid = false
          @detectors.delete(@hovered_module.entityID)
          view.invalidate
          update_status
        else
          Sketchup.active_model.select_tool(nil)
        end
      end

      def onCancel(_reason, view)
        Sketchup.status_text = 'Ornato: Insercao de agregado cancelada' if defined?(Sketchup)
        Sketchup.active_model.select_tool(nil) if defined?(Sketchup) && Sketchup.active_model
        view&.invalidate
      end

      def onKeyDown(key, _repeat, _flags, view)
        if key == 27
          onCancel(:user, view)
          return true
        end
        false
      end

      # ── Drawing ─────────────────────────────────────────────

      def draw(view)
        return unless @hovered_bay && @hovered_module

        bbox_world = self.class.transform_bbox(@hovered_bay, @hovered_module.transformation)
        return unless bbox_world

        fill = @valid ? ACTIVE_FILL_COLOR : INVALID_FILL_COLOR
        edge = @valid ? EDGE_OK_COLOR     : EDGE_BAD_COLOR

        corners = bbox_corners(bbox_world)
        draw_faces(view, corners, fill)
        draw_edges(view, corners, edge)

        view.tooltip = bay_tooltip(@hovered_bay)
      end

      # ─────────────────────────────────────────────────────────
      # PUBLIC PURE FUNCTIONS — testáveis sem SketchUp
      # ─────────────────────────────────────────────────────────

      # Sobe na hierarquia do PickHelper#path_at até achar primeiro
      # Group/ComponentInstance com attr Ornato.tipo == 'modulo'
      # (aceita também o legado Ornato.module_type).
      def walk_up_to_module(path)
        return nil if path.nil?
        arr = path.respond_to?(:to_a) ? path.to_a : [path]
        arr.reverse_each do |ent|
          next unless ent
          tipo = safe_attr(ent, 'Ornato', 'tipo')
          mtype = safe_attr(ent, 'Ornato', 'module_type')
          return ent if tipo.to_s == 'modulo' || (!mtype.nil? && !mtype.to_s.empty?)
        end
        nil
      end

      # Verifica se as dims mínimas do agregado cabem no bay.
      def aggregate_fits?(bay, meta)
        return false unless bay
        return true  if meta.nil? || meta['min_bay'].nil?

        min = meta['min_bay']
        bw = bay_dim(bay, :width_mm)
        bh = bay_dim(bay, :height_mm)
        bd = bay_dim(bay, :depth_mm)
        bw >= (min['largura']      || 0) &&
          bh >= (min['altura']        || 0) &&
          bd >= (min['profundidade'] || 0)
      end

      # Transforma o bbox local do bay → bbox em world coords.
      # Aceita Bay (com .bbox_local) ou hash. Retorna [min_pt, max_pt].
      def self.transform_bbox(bay, transformation)
        bbox = bay.respond_to?(:bbox_local) ? bay.bbox_local : bay[:bbox_local]
        return nil unless bbox

        min_pt = bbox.respond_to?(:min) ? bbox.min : bbox[0]
        max_pt = bbox.respond_to?(:max) ? bbox.max : bbox[1]
        return nil unless min_pt && max_pt

        if transformation && transformation.respond_to?(:*)
          [transformation * min_pt, transformation * max_pt]
        else
          [min_pt, max_pt]
        end
      end

      # Carrega meta JSON do agregado (min_bay, nome, etc.). Procura em
      # ornato_sketchup/library/modules/<id>.json se existir; senão
      # retorna stub.
      def self.load_aggregate_meta(aggregate_id)
        defaults = {
          'prateleira'         => { 'nome' => 'Prateleira',         'min_bay' => { 'largura' => 100, 'altura' => 50,  'profundidade' => 100 } },
          'divisoria'          => { 'nome' => 'Divisória',          'min_bay' => { 'largura' => 50,  'altura' => 100, 'profundidade' => 100 } },
          'gaveteiro_simples'  => { 'nome' => 'Gaveteiro Simples',  'min_bay' => { 'largura' => 200, 'altura' => 200, 'profundidade' => 250 } },
        }
        base = defaults[aggregate_id.to_s] || { 'nome' => aggregate_id.to_s, 'min_bay' => nil }

        path = File.expand_path("../library/modules/#{aggregate_id}.json", __dir__)
        if File.file?(path)
          begin
            require 'json'
            data = JSON.parse(File.read(path))
            base = base.merge(data['agregado'] || data)
          rescue StandardError
            # mantém defaults
          end
        end
        base
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      def label
        (@aggregate_meta && @aggregate_meta['nome']) || @aggregate_id
      end

      def bays_for(module_group)
        return [] unless defined?(Ornato::Geometry::BayDetector)
        @detectors[module_group.entityID] ||= Ornato::Geometry::BayDetector.new(module_group)
        d = @detectors[module_group.entityID]
        d.respond_to?(:bays) ? Array(d.bays) : []
      rescue => e
        log_warn("BayDetector erro: #{e.message}")
        []
      end

      def bay_contains?(bay, local_pt)
        bbox = bay.respond_to?(:bbox_local) ? bay.bbox_local : nil
        return false unless bbox
        bbox.respond_to?(:contains?) ? bbox.contains?(local_pt) : false
      rescue
        false
      end

      def bay_dim(bay, key)
        return bay.public_send(key).to_f if bay.respond_to?(key)
        return bay[key].to_f             if bay.is_a?(Hash) && bay[key]
        return bay[key.to_s].to_f        if bay.is_a?(Hash) && bay[key.to_s]
        0.0
      end

      def bay_tooltip(bay)
        w = bay_dim(bay, :width_mm).to_i
        h = bay_dim(bay, :height_mm).to_i
        d = bay_dim(bay, :depth_mm).to_i
        "Vao #{w}x#{h}x#{d}mm"
      end

      def safe_attr(ent, dict, key)
        return nil unless ent.respond_to?(:get_attribute)
        ent.get_attribute(dict, key)
      rescue
        nil
      end

      def update_status
        return unless defined?(Sketchup)
        msg =
          if @hovered_bay && @valid
            "Ornato: Click pra inserir #{label} | Shift+Click repete | ESC cancela"
          elsif @hovered_bay && !@valid
            "Ornato: Vao muito pequeno pra #{label}"
          else
            "Ornato: Mire o cursor no interior de um modulo Ornato"
          end
        Sketchup.status_text = msg
      end

      def bbox_corners(bbox_world)
        min_pt, max_pt = bbox_world
        x0, y0, z0 = min_pt.x, min_pt.y, min_pt.z
        x1, y1, z1 = max_pt.x, max_pt.y, max_pt.z
        [
          Geom::Point3d.new(x0, y0, z0), Geom::Point3d.new(x1, y0, z0),
          Geom::Point3d.new(x1, y1, z0), Geom::Point3d.new(x0, y1, z0),
          Geom::Point3d.new(x0, y0, z1), Geom::Point3d.new(x1, y0, z1),
          Geom::Point3d.new(x1, y1, z1), Geom::Point3d.new(x0, y1, z1),
        ]
      end

      def draw_faces(view, corners, color)
        return unless color
        view.drawing_color = color
        FACE_QUADS.each do |q|
          view.draw(GL_QUADS, q.map { |i| corners[i] })
        end
      end

      def draw_edges(view, corners, color)
        return unless color
        view.drawing_color = color
        view.line_width = 2
        lines = []
        EDGE_PAIRS.each { |a, b| lines << corners[a] << corners[b] }
        view.draw(GL_LINES, lines)
      end

      def log_warn(msg)
        if defined?(Ornato::Logger) && Ornato::Logger.respond_to?(:warn)
          Ornato::Logger.warn(msg)
        else
          puts "[Ornato AimPlacementTool] WARN: #{msg}"
        end
      end

      def log_error(msg)
        if defined?(Ornato::Logger) && Ornato::Logger.respond_to?(:error)
          Ornato::Logger.error(msg)
        else
          puts "[Ornato AimPlacementTool] ERROR: #{msg}"
        end
      end
    end # class AimPlacementTool
  end # module Tools
end # module Ornato
