# ═══════════════════════════════════════════════════════
# Ornato SketchUp Plugin — Main Entry Point
# ═══════════════════════════════════════════════════════

require_relative 'config'
require_relative 'core/model_analyzer'
require_relative 'core/piece_detector'
require_relative 'core/joint_detector'
require_relative 'core/material_mapper'
require_relative 'core/edge_banding'
require_relative 'core/hierarchy_builder'
require_relative 'hardware/rules_engine'
require_relative 'machining/machining_json'
require_relative 'export/json_exporter'

module Ornato
  module Main
    # ─── Menu & Toolbar ─────────────────────────────
    def self.setup_menu
      menu = UI.menu('Plugins').add_submenu('Ornato CNC')

      menu.add_item('Analisar Modelo') { analyze_model }
      menu.add_item('Processar Modulo Selecionado') { process_selected_module }
      menu.add_separator
      menu.add_item('Mapeamento de Materiais...') { show_material_dialog }
      menu.add_item('Configurar Ferragens...') { show_hardware_config }
      menu.add_separator
      menu.add_item('Preview Furacoes') { show_drilling_preview }
      menu.add_item('Exportar JSON para CNC') { export_json }
      menu.add_item('Sincronizar com Ornato ERP') { sync_with_erp }
      menu.add_separator
      menu.add_item('Sobre') { show_about }
    end

    def self.setup_toolbar
      toolbar = UI::Toolbar.new('Ornato CNC')

      cmd_analyze = UI::Command.new('Analisar') { analyze_model }
      cmd_analyze.tooltip = 'Analisar modelo e detectar pecas'
      cmd_analyze.small_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_16.png')
      cmd_analyze.large_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_24.png')
      toolbar.add_item(cmd_analyze)

      cmd_process = UI::Command.new('Processar') { process_selected_module }
      cmd_process.tooltip = 'Processar modulo selecionado (gerar furacoes)'
      cmd_process.small_icon = File.join(PLUGIN_DIR, 'icons', 'process_16.png')
      cmd_process.large_icon = File.join(PLUGIN_DIR, 'icons', 'process_24.png')
      toolbar.add_item(cmd_process)

      cmd_export = UI::Command.new('Exportar') { export_json }
      cmd_export.tooltip = 'Exportar JSON para Ornato CNC'
      cmd_export.small_icon = File.join(PLUGIN_DIR, 'icons', 'export_16.png')
      cmd_export.large_icon = File.join(PLUGIN_DIR, 'icons', 'export_24.png')
      toolbar.add_item(cmd_export)

      toolbar.show
    end

    # ─── Core Actions ───────────────────────────────
    def self.analyze_model
      model = Sketchup.active_model
      unless model
        UI.messagebox('Nenhum modelo aberto.')
        return
      end

      analyzer = Core::ModelAnalyzer.new(model)
      result = analyzer.analyze

      msg = "Analise completa:\n\n"
      msg += "Modulos encontrados: #{result[:modules].length}\n"
      msg += "Pecas detectadas: #{result[:pieces].length}\n"
      msg += "Materiais: #{result[:materials].uniq.length}\n"
      msg += "Juncoes: #{result[:joints].length}\n"

      UI.messagebox(msg)
      result
    end

    def self.process_selected_module
      model = Sketchup.active_model
      selection = model.selection

      if selection.empty?
        UI.messagebox('Selecione um modulo (grupo/componente) para processar.')
        return
      end

      group = selection.first
      unless group.is_a?(Sketchup::Group) || group.is_a?(Sketchup::ComponentInstance)
        UI.messagebox('Selecione um grupo ou componente que represente um modulo.')
        return
      end

      config = Config.load
      engine = Hardware::RulesEngine.new(config)
      machining = engine.process_module(group)

      count = machining.values.sum { |m| m['workers']&.length || 0 }
      UI.messagebox("Processamento completo!\n\n#{machining.length} pecas processadas\n#{count} operacoes de usinagem geradas")

      machining
    end

    def self.export_json
      model = Sketchup.active_model
      unless model
        UI.messagebox('Nenhum modelo aberto.')
        return
      end

      # Analisar modelo completo
      analyzer = Core::ModelAnalyzer.new(model)
      analysis = analyzer.analyze

      # Processar todas as furacoes
      config = Config.load
      engine = Hardware::RulesEngine.new(config)

      all_machining = {}
      analysis[:modules].each do |mod|
        machining = engine.process_module(mod[:group])
        all_machining.merge!(machining)
      end

      # Gerar JSON
      exporter = Export::JsonExporter.new(analysis, all_machining, config)
      json_data = exporter.generate

      # Salvar arquivo
      path = UI.savepanel('Salvar JSON para CNC', '', "#{model.title || 'projeto'}.json")
      if path
        File.write(path, JSON.pretty_generate(json_data))
        UI.messagebox("Exportado com sucesso!\n\n#{path}\n\n#{analysis[:pieces].length} pecas\n#{all_machining.values.sum { |m| m['workers']&.length || 0 }} operacoes")
      end
    end

    def self.sync_with_erp
      UI.messagebox('Sincronizacao com Ornato ERP — Em desenvolvimento.\n\nPor enquanto, use Export JSON e importe manualmente no CNC.')
    end

    def self.show_material_dialog
      dialog = UI::HtmlDialog.new(
        dialog_title: 'Mapeamento de Materiais — Ornato',
        width: 500, height: 600,
        style: UI::HtmlDialog::STYLE_DIALOG
      )
      dialog.set_file(File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'material_map.html'))
      dialog.show
    end

    def self.show_hardware_config
      dialog = UI::HtmlDialog.new(
        dialog_title: 'Configurar Ferragens — Ornato',
        width: 600, height: 700,
        style: UI::HtmlDialog::STYLE_DIALOG
      )
      dialog.set_file(File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'hardware_config.html'))
      dialog.show
    end

    def self.show_drilling_preview
      dialog = UI::HtmlDialog.new(
        dialog_title: 'Preview Furacoes — Ornato',
        width: 800, height: 600,
        style: UI::HtmlDialog::STYLE_DIALOG
      )
      dialog.set_file(File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'drilling_preview.html'))
      dialog.show
    end

    def self.show_about
      UI.messagebox(
        "Ornato CNC para SketchUp\n" \
        "Versao: #{PLUGIN_VERSION}\n\n" \
        "Plugin completo para marcenaria industrializada.\n" \
        "Detecta pecas, gera furacoes automaticas,\n" \
        "exporta JSON para producao CNC.\n\n" \
        "www.gestaoornato.com"
      )
    end
  end

  # Registrar menus e toolbar ao carregar
  Main.setup_menu
  Main.setup_toolbar
end
