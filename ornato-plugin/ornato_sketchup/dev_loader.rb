# ═══════════════════════════════════════════════════════
# Ornato Dev Loader — Recarrega código sem fechar SketchUp
#
# USO:
#   No SketchUp Ruby Console, execute:
#     load '/path/to/ornato_sketchup/dev_loader.rb'
#
#   Ou use o atalho no menu:
#     Plugins → Ornato CNC → [Dev] Recarregar Plugin
#
# Isso recarrega TODOS os .rb do plugin sem precisar
# reiniciar o SketchUp. Essencial para desenvolvimento.
# ═══════════════════════════════════════════════════════

module Ornato
  module DevLoader

    PLUGIN_ROOT = File.dirname(__FILE__)

    # Arquivos na ordem correta de carregamento
    LOAD_ORDER = [
      # Versão (primeiro — define Ornato::Version + PLUGIN_VERSION)
      'core/version.rb',

      'config.rb',

      # Core
      'core/role_normalizer.rb',
      'core/model_analyzer.rb',
      'core/piece_detector.rb',
      'core/joint_detector.rb',
      'core/material_mapper.rb',
      'core/edge_banding.rb',
      'core/hierarchy_builder.rb',

      # Hardware
      'hardware/shop_config.rb',
      'hardware/hinge_rule.rb',
      'hardware/minifix_rule.rb',
      'hardware/confirmat_rule.rb',
      'hardware/dowel_rule.rb',
      'hardware/handle_rule.rb',
      'hardware/drawer_slide_rule.rb',
      'hardware/back_panel_rule.rb',
      'hardware/shelf_rule.rb',
      'hardware/system32_rule.rb',
      'hardware/led_channel_rule.rb',
      'hardware/gas_piston_rule.rb',
      'hardware/sliding_door_rule.rb',
      'hardware/miter_rule.rb',
      'hardware/passthrough_rule.rb',
      'hardware/rules_engine.rb',

      # Machining
      'machining/machining_json.rb',
      'machining/machining_interpreter.rb',
      'machining/skp_feature_extractor.rb',
      'machining/drilling_collision_detector.rb',
      'machining/ferragem_drilling_collector.rb',

      # Export
      'export/json_exporter.rb',

      # Validation
      'validation/validator.rb',
      'validation/rules/base_rule.rb',
      'validation/rules/piece_without_material.rb',
      'validation/rules/edge_role_invalid.rb',
      'validation/rules/drilling_hitting_banding.rb',
      'validation/rules/collision_drillings.rb',
      'validation/rules/hardware_outside_standard.rb',
      'validation/rules/aggregate_without_hardware.rb',
      'validation/rules/offline_unavailable_module.rb',
      'validation/rules/expression_unresolved.rb',
      'validation/validation_runner.rb',

      # Catalog
      'catalog/hardware_catalog.rb',

      # Library
      'library/module_base.rb',
      'library/json_module_builder.rb',
      'library/parametric_engine.rb',
      'library/countertop_builder.rb',

      # Constructor
      'constructor/box_builder.rb',
      'constructor/aggregator.rb',
      'constructor/component_swap.rb',
      'constructor/finish_manager.rb',

      # Unified Dialog Controller
      'ui/dialog_controller.rb',

      # Visual (optional)
      'visual/hardware_visualizer.rb',
      'visual/hardware_components.rb',
      'visual/label_overlay.rb',

      # Integration
      'integration/erp_integrator.rb',

      # Tools (optional)
      'tools/hole_tool.rb',
      'tools/hole_edit_tool.rb',
      'tools/collision_manager.rb',
      'tools/placement_tool.rb',
      'tools/neighbor_resolver.rb',
      'tools/ambiente_tool.rb',
      'tools/edit_tool.rb',
      'tools/copy_array_tool.rb',
      'tools/selection_resolver.rb',
      'tools/aim_placement_tool.rb',
      'tools/mira_tool.rb',

      # Updater (optional)
      'updater/auto_updater.rb',

      # Main (sempre por último — registra menus e callbacks)
      'main.rb',
    ]

    def self.reload!
      t0 = Time.now
      loaded = 0
      errors = []

      LOAD_ORDER.each do |rel_path|
        full_path = File.join(PLUGIN_ROOT, rel_path)
        next unless File.exist?(full_path)

        begin
          load full_path
          loaded += 1
        rescue => e
          errors << "#{rel_path}: #{e.message}"
          puts "  ✗ #{rel_path}: #{e.message}"
        end
      end

      elapsed = ((Time.now - t0) * 1000).round
      msg = "Ornato DevLoader: #{loaded} arquivos recarregados em #{elapsed}ms"

      if errors.any?
        msg += "\n\n#{errors.length} erros:"
        errors.each { |e| msg += "\n  • #{e}" }
      end

      puts msg
      Sketchup.status_text = "Ornato: #{loaded} arquivos recarregados (#{elapsed}ms)"
      msg
    end

    # Recarregar só um arquivo específico
    def self.reload_file(rel_path)
      full_path = File.join(PLUGIN_ROOT, rel_path)
      unless File.exist?(full_path)
        puts "Ornato DevLoader: arquivo não encontrado: #{rel_path}"
        return false
      end

      begin
        load full_path
        puts "Ornato DevLoader: #{rel_path} recarregado"
        true
      rescue => e
        puts "Ornato DevLoader: ERRO em #{rel_path}: #{e.message}"
        false
      end
    end

    # Recarregar só os HTMLs (fecha e reabre dialogs)
    def self.reload_ui!
      puts "Ornato DevLoader: UI recarregada (feche e reabra os dialogs)"
      # Dialogs HTML são recarregados automaticamente ao reabrir
      # Este método existe para clareza — basta fechar/reabrir o dialog
    end

    # Watch mode — verifica mudanças a cada N segundos
    # USO: Ornato::DevLoader.watch!(interval: 2)
    @watch_timer = nil
    @file_mtimes = {}

    def self.watch!(interval: 3)
      stop_watch!

      # Snapshot inicial dos mtimes
      @file_mtimes = {}
      LOAD_ORDER.each do |rel_path|
        full_path = File.join(PLUGIN_ROOT, rel_path)
        @file_mtimes[rel_path] = File.mtime(full_path).to_i if File.exist?(full_path)
      end

      # Checar HTMLs também
      Dir.glob(File.join(PLUGIN_ROOT, 'ui', '*.html')).each do |f|
        rel = f.sub(PLUGIN_ROOT + '/', '')
        @file_mtimes[rel] = File.mtime(f).to_i
      end

      @watch_timer = UI.start_timer(interval, true) do
        check_changes
      end

      puts "Ornato DevLoader: Watch mode ATIVO (#{interval}s interval)"
      puts "  Use Ornato::DevLoader.stop_watch! para parar"
    end

    def self.stop_watch!
      if @watch_timer
        UI.stop_timer(@watch_timer)
        @watch_timer = nil
        puts "Ornato DevLoader: Watch mode PARADO"
      end
    end

    def self.check_changes
      changed = []

      LOAD_ORDER.each do |rel_path|
        full_path = File.join(PLUGIN_ROOT, rel_path)
        next unless File.exist?(full_path)
        mtime = File.mtime(full_path).to_i
        if @file_mtimes[rel_path] != mtime
          @file_mtimes[rel_path] = mtime
          changed << rel_path
        end
      end

      # Checar HTMLs
      Dir.glob(File.join(PLUGIN_ROOT, 'ui', '*.html')).each do |f|
        rel = f.sub(PLUGIN_ROOT + '/', '')
        mtime = File.mtime(f).to_i
        if @file_mtimes[rel] != mtime
          @file_mtimes[rel] = mtime
          changed << rel
        end
      end

      return if changed.empty?

      rb_files = changed.select { |f| f.end_with?('.rb') }
      html_files = changed.select { |f| f.end_with?('.html') }

      if rb_files.any?
        puts "Ornato DevLoader: Mudanças detectadas em #{rb_files.length} arquivo(s) Ruby"
        rb_files.each do |f|
          reload_file(f)
        end
      end

      if html_files.any?
        puts "Ornato DevLoader: #{html_files.length} HTML(s) alterado(s) — reabra os dialogs para ver"
      end
    end

  end
end
