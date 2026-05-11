# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# MiraTool — Sistema unificado de "miras" coloridas (UX-2)
#
# Inspirado no UpMobb: cursor vira mira colorida, hover detecta
# entidade Ornato, click executa ação dependente da cor:
#
#   🟡 amarela  → seleciona MÓDULO ou AGREGADO (alimenta Inspector)
#   🟢 verde    → seleciona PEÇA ou FERRAGEM (alimenta Inspector)
#   🔴 vermelha → REMOVE (em 2 passos: hover preview + confirm)
#
# Diferente do AimPlacementTool (que é especializado em INSERIR
# agregados em vãos), MiraTool é GENÉRICO: não modifica geometria
# por padrão, apenas resolve seleção via SelectionResolver e dispara
# eventos pra UI. O modo `vermelha` é a exceção e faz soft-delete
# via attr `Ornato.hidden = true` + `entity.hidden = true`.
#
# Uso (Ruby):
#   tool = Ornato::Tools::MiraTool.new(:amarela)
#   Sketchup.active_model.select_tool(tool)
#
# Uso (UI v2 / JS):
#   sketchup.start_mira('amarela')   // registra via dialog_controller
#
# Não modifica selection_resolver.rb, bay_detector.rb, wps_source/,
# biblioteca/.
# ═══════════════════════════════════════════════════════════════

require_relative 'selection_resolver'

module Ornato
  module Tools
    class MiraTool
      # ── Paleta (RGBA) ─────────────────────────────────────────
      COLORS = {
        amarela:  {
          fill: (defined?(Sketchup::Color) ? Sketchup::Color.new(255, 220, 0,  60)  : nil),
          edge: (defined?(Sketchup::Color) ? Sketchup::Color.new(200, 170, 0,  220) : nil),
        },
        verde:    {
          fill: (defined?(Sketchup::Color) ? Sketchup::Color.new(0,   200, 80, 60)  : nil),
          edge: (defined?(Sketchup::Color) ? Sketchup::Color.new(0,   140, 50, 220) : nil),
        },
        vermelha: {
          fill: (defined?(Sketchup::Color) ? Sketchup::Color.new(220, 50,  50, 80)  : nil),
          edge: (defined?(Sketchup::Color) ? Sketchup::Color.new(160, 30,  30, 240) : nil),
        },
      }.freeze

      # ── Configuração por cor ──────────────────────────────────
      MODES = {
        amarela:  { target_kinds: [:module, :aggregate],                    action: :resolve_and_emit },
        verde:    { target_kinds: [:piece, :hardware],                      action: :resolve_and_emit },
        vermelha: { target_kinds: [:module, :aggregate, :piece, :hardware], action: :prompt_remove },
      }.freeze

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

      # @param cor [Symbol] :amarela | :verde | :vermelha
      # @param controller [Ornato::UI::DialogController, nil] opcional, pra emitir pra UI v2
      def initialize(cor, controller: nil)
        raise ArgumentError, "cor invalida: #{cor.inspect}" unless MODES.key?(cor)
        @cor          = cor
        @controller   = controller
        @hovered      = nil
        @hovered_kind = nil
        @valid        = false
      end

      # ── Tool Interface ──────────────────────────────────────

      def activate
        skp_set_status(status_for_mode)
        Sketchup.active_model.active_view.invalidate if defined?(Sketchup) && Sketchup.respond_to?(:active_model) && Sketchup.active_model
      end

      def deactivate(view)
        view.invalidate if view
        skp_set_status('')
      end

      def resume(view); view&.invalidate; skp_set_status(status_for_mode); end
      def suspend(view); view&.invalidate; end

      def onSetCursor
        ::UI.set_cursor(CURSOR_CROSSHAIR) if defined?(::UI)
      end

      def getExtents
        if defined?(Sketchup) && Sketchup.respond_to?(:active_model) && Sketchup.active_model
          Sketchup.active_model.bounds
        else
          Geom::BoundingBox.new
        end
      end

      def onMouseMove(_flags, x, y, view)
        ph = view.pick_helper
        ph.do_pick(x, y)
        ent = walk_up_to_targetable(ph.path_at(0))

        if ent
          payload  = Ornato::Tools::SelectionResolver.resolve(ent)
          kind     = payload[:kind]
          targets  = MODES[@cor][:target_kinds]
          @hovered      = ent
          @hovered_kind = kind
          @valid        = targets.include?(kind)
        else
          @hovered      = nil
          @hovered_kind = nil
          @valid        = false
        end

        update_status
        view.invalidate
      end

      def onLButtonDown(_flags, _x, _y, _view)
        return unless @valid && @hovered

        case MODES[@cor][:action]
        when :resolve_and_emit
          emit_selection_to_ui
        when :prompt_remove
          prompt_remove_confirmation
        end
      end

      def draw(view)
        return unless @hovered && @valid

        bbox = entity_bbox_world(@hovered)
        return unless bbox

        fill = COLORS[@cor][:fill]
        edge = COLORS[@cor][:edge]
        corners = bbox_corners(bbox)
        draw_faces(view, corners, fill)
        draw_edges(view, corners, edge)
        view.tooltip = build_tooltip
      end

      def onCancel(_reason, view)
        skp_set_status('Ornato: Mira cancelada')
        view&.invalidate
        Sketchup.active_model.select_tool(nil) if defined?(Sketchup) && Sketchup.respond_to?(:active_model) && Sketchup.active_model
      end

      def onKeyDown(key, _repeat, _flags, view)
        if key == 27
          onCancel(:user, view)
          return true
        end
        false
      end

      # ─────────────────────────────────────────────────────────
      # PUBLIC PURE — testáveis sem SketchUp
      # ─────────────────────────────────────────────────────────

      # Sobe na hierarquia do path do PickHelper procurando primeira
      # entidade com attr Ornato (kind != :unknown).
      # @param path [Array<Sketchup::Entity>, Sketchup::Entity, nil]
      # @return [Sketchup::Entity, nil]
      def walk_up_to_targetable(path)
        return nil if path.nil?
        arr = if path.respond_to?(:to_a)
                path.to_a
              elsif path.is_a?(Array)
                path
              else
                [path]
              end
        arr.reverse_each do |ent|
          next unless ent
          next unless ent.respond_to?(:get_attribute)
          payload = Ornato::Tools::SelectionResolver.resolve(ent)
          kind = payload[:kind]
          return ent if MODES[@cor][:target_kinds].include?(kind)
        end
        # fallback: qualquer entity Ornato (mesmo que não bata target — pra hover não-válido)
        arr.reverse_each do |ent|
          next unless ent
          next unless ent.respond_to?(:get_attribute)
          payload = Ornato::Tools::SelectionResolver.resolve(ent)
          return ent unless [:empty, :invalid, :unknown].include?(payload[:kind])
        end
        nil
      end

      # Indica se o último hover foi válido pra modo atual. Usado por tests.
      def valid?
        @valid
      end

      attr_reader :cor, :hovered, :hovered_kind

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      def emit_selection_to_ui
        payload = Ornato::Tools::SelectionResolver.resolve(@hovered)
        return unless payload

        # Caminho 1: controller injetado direto.
        if @controller && @controller.respond_to?(:send_to_panel)
          json = payload.to_json rescue '{}'
          @controller.send_to_panel("window.onSelectionResolved && window.onSelectionResolved(#{json})")
          return
        end

        # Caminho 2: descoberta via Ornato::Main.dialog_controller (runtime SketchUp).
        if defined?(::Ornato::Main) && ::Ornato::Main.respond_to?(:dialog_controller)
          begin
            ctrl = ::Ornato::Main.dialog_controller
            if ctrl && ctrl.respond_to?(:main_panel_visible?) && ctrl.main_panel_visible?
              json = payload.to_json rescue '{}'
              ctrl.send_to_panel("window.onSelectionResolved && window.onSelectionResolved(#{json})")
              return
            end
          rescue StandardError
            # silencioso — não pode interromper o tool por erro de UI
          end
        end

        # Sem UI? loga.
        log_info("[MiraTool/#{@cor}] selection_resolved kind=#{payload[:kind]} entity_id=#{payload[:entity_id]}")
      end

      # Mostra messagebox de confirmação. Se sim, marca hidden + Ornato.hidden.
      # Retorna true se confirmou e aplicou, false caso contrário.
      def prompt_remove_confirmation
        return false unless @hovered

        label = build_tooltip || "este item"
        result = confirm_dialog("Remover #{label}?\n\nO item será ocultado (soft delete) e pode ser restaurado depois.")
        return false unless result

        begin
          Sketchup.active_model.start_operation("Ocultar #{label}", true) if defined?(Sketchup) && Sketchup.respond_to?(:active_model) && Sketchup.active_model
          @hovered.set_attribute('Ornato', 'hidden', true) if @hovered.respond_to?(:set_attribute)
          @hovered.hidden = true if @hovered.respond_to?(:hidden=)
          Sketchup.active_model.commit_operation if defined?(Sketchup) && Sketchup.respond_to?(:active_model) && Sketchup.active_model
        rescue StandardError => e
          log_warn("MiraTool soft-remove falhou: #{e.message}")
          Sketchup.active_model.abort_operation if defined?(Sketchup) && Sketchup.respond_to?(:active_model) && Sketchup.active_model
        end

        @hovered      = nil
        @hovered_kind = nil
        @valid        = false
        update_status
        true
      end

      def confirm_dialog(msg)
        if defined?(::UI) && ::UI.respond_to?(:messagebox)
          answer = ::UI.messagebox(msg, (defined?(MB_YESNO) ? MB_YESNO : 4))
          return answer == (defined?(IDYES) ? IDYES : 6)
        end
        false
      end

      def status_for_mode
        case @cor
        when :amarela  then 'Ornato: Mira amarela — selecione modulo ou agregado | ESC cancela'
        when :verde    then 'Ornato: Mira verde — selecione peca ou ferragem | ESC cancela'
        when :vermelha then 'Ornato: Mira VERMELHA — clique remove (com confirmacao) | ESC cancela'
        end
      end

      def update_status
        if @hovered && @valid
          base = status_for_mode
          tip  = build_tooltip
          skp_set_status(tip ? "#{base} | hover: #{tip}" : base)
        elsif @hovered && !@valid
          skp_set_status("#{status_for_mode} (alvo invalido pra esta mira)")
        else
          skp_set_status(status_for_mode)
        end
      end

      # Helper guard pra Sketchup.status_text= que pode não existir em
      # contexto de testes (Sketchup pode ser stub Module sem o setter).
      def skp_set_status(msg)
        return unless defined?(Sketchup) && Sketchup.respond_to?(:status_text=)
        Sketchup.status_text = msg
      rescue StandardError
        nil
      end

      def build_tooltip
        return nil unless @hovered_kind
        name = (@hovered.respond_to?(:name) ? @hovered.name.to_s : '')
        name = nil if name.empty?
        kind_label = {
          module:    'Modulo',
          aggregate: 'Agregado',
          piece:     'Peca',
          hardware:  'Ferragem',
        }[@hovered_kind] || @hovered_kind.to_s
        name ? "#{kind_label}: #{name}" : kind_label
      end

      # ── Bbox helpers ─────────────────────────────────────────

      def entity_bbox_world(ent)
        return nil unless ent.respond_to?(:bounds)
        bb = ent.bounds rescue nil
        return nil unless bb
        return nil if bb.respond_to?(:empty?) && bb.empty?
        min_pt = bb.respond_to?(:min) ? bb.min : nil
        max_pt = bb.respond_to?(:max) ? bb.max : nil
        return nil unless min_pt && max_pt

        # Se entidade tem transformation (Group/Component), bbox já está em
        # coords do pai. Pra renderizar com view.draw, precisamos coords mundo.
        # Mantemos como retornado por #bounds (SketchUp já entrega em coords
        # do espaço pai/ativo) — suficiente pro draw com a view ativa.
        [min_pt, max_pt]
      rescue StandardError
        nil
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
        FACE_QUADS.each { |q| view.draw(GL_QUADS, q.map { |i| corners[i] }) }
      end

      def draw_edges(view, corners, color)
        return unless color
        view.drawing_color = color
        view.line_width = 2
        lines = []
        EDGE_PAIRS.each { |a, b| lines << corners[a] << corners[b] }
        view.draw(GL_LINES, lines)
      end

      # ── Logging ──────────────────────────────────────────────

      def log_info(msg)
        if defined?(::Ornato::Logger) && ::Ornato::Logger.respond_to?(:info)
          ::Ornato::Logger.info(msg)
        else
          puts "[Ornato MiraTool] INFO: #{msg}"
        end
      end

      def log_warn(msg)
        if defined?(::Ornato::Logger) && ::Ornato::Logger.respond_to?(:warn)
          ::Ornato::Logger.warn(msg)
        else
          puts "[Ornato MiraTool] WARN: #{msg}"
        end
      end
    end # class MiraTool
  end # module Tools
end # module Ornato
