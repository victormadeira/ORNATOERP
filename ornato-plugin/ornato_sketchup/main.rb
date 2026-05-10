# ═══════════════════════════════════════════════════════
# Ornato SketchUp Plugin — Main Entry Point
# ═══════════════════════════════════════════════════════

require 'json'
require 'base64'

# ─── Versão (carregada antes de tudo — define Ornato::Version + PLUGIN_VERSION) ─
require_relative 'core/version'

require_relative 'config'

# ─── Core modules ─────────────────────────────────────
require_relative 'core/logger'
require_relative 'core/role_normalizer'
require_relative 'core/model_analyzer'
require_relative 'core/piece_detector'
require_relative 'core/joint_detector'
require_relative 'core/material_mapper'
require_relative 'core/edge_banding'
require_relative 'core/hierarchy_builder'

# ─── Hardware rules engine ────────────────────────────
require_relative 'hardware/shop_config'
require_relative 'hardware/hinge_rule'
require_relative 'hardware/minifix_rule'
require_relative 'hardware/confirmat_rule'
require_relative 'hardware/dowel_rule'
require_relative 'hardware/handle_rule'
require_relative 'hardware/drawer_slide_rule'
require_relative 'hardware/back_panel_rule'
require_relative 'hardware/shelf_rule'
require_relative 'hardware/system32_rule'
require_relative 'hardware/led_channel_rule'
require_relative 'hardware/gas_piston_rule'
require_relative 'hardware/sliding_door_rule'
require_relative 'hardware/miter_rule'
require_relative 'hardware/passthrough_rule'
require_relative 'hardware/rules_engine'

# ─── Machining ────────────────────────────────────────
require_relative 'machining/machining_json'
require_relative 'machining/machining_interpreter'
require_relative 'machining/skp_feature_extractor'
require_relative 'machining/drilling_collision_detector'
require_relative 'machining/ferragem_drilling_collector'

# ─── Export ───────────────────────────────────────────
require_relative 'export/json_exporter'
require_relative 'export/dxf_exporter'

# ─── Validation (Fase 4A) ────────────────────────────
require_relative 'validation/validator'
require_relative 'validation/validation_runner'

# ─── Hardware Catalog (Fase 4B) ──────────────────────
require_relative 'catalog/hardware_catalog'

# ─── Library ──────────────────────────────────────────
require_relative 'library/parametric_engine'
require_relative 'library/countertop_builder'

# ─── LibrarySync (sync remoto da biblioteca com ERP) ─
begin
  require_relative 'library/library_sync'
  LIBRARY_SYNC_LOADED = true
rescue LoadError => e
  puts "Ornato: LibrarySync nao disponivel (#{e.message})"
  LIBRARY_SYNC_LOADED = false
end

# ─── Constructor (Construtor + Agregador + Troca + Acabamentos) ──
require_relative 'constructor/box_builder'
require_relative 'constructor/aggregator'
require_relative 'constructor/component_swap'
require_relative 'constructor/finish_manager'

# ─── Smart Advisor (inteligencia de sugestao) ────────
begin
  require_relative 'advisor/smart_advisor'
  ADVISOR_LOADED = true
rescue LoadError => e
  puts "Ornato: SmartAdvisor nao disponivel (#{e.message})"
  ADVISOR_LOADED = false
end

# ─── Dynamic Component Reader ────────────────────────
begin
  require_relative 'core/dynamic_component_reader'
  DC_READER_LOADED = true
rescue LoadError => e
  puts "Ornato: DC Reader nao disponivel (#{e.message})"
  DC_READER_LOADED = false
end

# ─── ERP + Cut Optimizer Integration ────────────────
begin
  require_relative 'integration/erp_integrator'
  require_relative 'integration/cut_optimizer'
  ERP_INTEGRATOR_LOADED = true
  CUT_OPTIMIZER_LOADED  = true
rescue LoadError => e
  puts "Ornato: Integracoes nao disponiveis (#{e.message})"
  ERP_INTEGRATOR_LOADED = false
  CUT_OPTIMIZER_LOADED  = false
end

# ─── Material Catalog ────────────────────────────────
begin
  require_relative 'catalog/material_catalog'
  MATERIAL_CATALOG_LOADED = true
rescue LoadError => e
  puts "Ornato: Material Catalog nao disponivel (#{e.message})"
  MATERIAL_CATALOG_LOADED = false
end

# ─── Unified Dialog Controller (OCL-style) ──────────
require_relative 'ui/dialog_controller'

# ─── Visual (optional — may not exist yet) ───────────
begin
  require_relative 'visual/hardware_visualizer'
  require_relative 'visual/hardware_components'
  require_relative 'visual/label_overlay'
  VISUAL_LOADED = true
rescue LoadError => e
  puts "Ornato: Modulos visuais nao disponiveis (#{e.message})"
  VISUAL_LOADED = false
end

# ─── Tools (optional — may not exist yet) ────────────
begin
  require_relative 'tools/hole_tool'
  require_relative 'tools/hole_edit_tool'
  require_relative 'tools/collision_manager'
  require_relative 'tools/placement_tool'
  require_relative 'tools/neighbor_resolver'
  require_relative 'tools/ambiente_tool'
  require_relative 'tools/edit_tool'
  require_relative 'tools/copy_array_tool'
  require_relative 'tools/aim_placement_tool'
  TOOLS_LOADED = true
rescue LoadError => e
  puts "Ornato: Ferramentas interativas nao disponiveis (#{e.message})"
  TOOLS_LOADED = false
end

# ─── Dev Loader (hot reload para desenvolvimento) ────
require_relative 'dev_loader'

# ─── Auto Updater (optional — silencioso se falhar) ──
begin
  require_relative 'updater/auto_updater'
  UPDATER_LOADED = true
rescue LoadError => e
  puts "Ornato: Auto-updater nao disponivel (#{e.message})"
  UPDATER_LOADED = false
end

module Ornato

  # ══════════════════════════════════════════════════════
  # ModelObserver — Detecta quando pecas sao movidas
  # e invalida dados de usinagem em cache
  # ══════════════════════════════════════════════════════

  class OrnatoModelObserver < Sketchup::ModelObserver
    def onTransactionCommit(model)
      Sketchup.status_text = 'Ornato: Modelo alterado — revalide antes de exportar'
    end

    def onActivePathChanged(model)
      # Useful to know when user enters/exits a group
    end

    def onEraseAll(model)
      Sketchup.status_text = 'Ornato: Modelo limpo'
    end
  end

  class OrnatoEntitiesObserver < Sketchup::EntitiesObserver
    def onElementAdded(entities, entity)
      if entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
        Sketchup.status_text = 'Ornato: Novo grupo detectado — use Analisar para atualizar'
      end
    end

    def onElementModified(entities, entity)
      if entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
        # Piece was moved/scaled — machining data may be stale
      end
    end
  end

  # ══════════════════════════════════════════════════════
  # Main — Menus, Toolbar, Shortcuts, Actions
  # ══════════════════════════════════════════════════════

  module Main
    @hardware_visible = true
    @validation_dialog = nil
    @catalog_dialog = nil
    @dialog_controller = nil
    @last_analysis = nil
    @last_machining = nil

    def self.dialog_controller
      @dialog_controller ||= UI::DialogController.new
    end

    # Gate: aborta operações pesadas se o plugin está em min_compat violation
    def self.compat_blocked?
      blocked = defined?(::Ornato::COMPAT_VIOLATED) && ::Ornato::COMPAT_VIOLATED
      if blocked
        ::UI.messagebox(
          "Ornato CNC bloqueado: versão incompatível com o servidor.\n\n" \
          "Atualize o plugin para continuar (Plugins → Ornato CNC → Verificar atualizações)."
        ) rescue nil
      end
      blocked
    end

    # ─── Menu Setup ─────────────────────────────────
    def self.setup_menu
      menu = ::UI.menu('Plugins').add_submenu('Ornato CNC')

      # Main panel — primary floating toolbar
      menu.add_item('Ornato Design (Painel)') { show_main_panel }
      menu.add_separator
      # Unified dialog — full-featured dialog
      menu.add_item('Abrir Ornato (Dialog completo)...') { show_dialog }
      menu.add_separator
      menu.add_item('Biblioteca...') { show_dialog('biblioteca') }
      menu.add_item('Construtor...') { show_dialog('construtor') }
      menu.add_item('Agregar...') { show_dialog('agregador') }
      menu.add_item('Acabamentos...') { show_dialog('acabamentos') }
      menu.add_separator
      if TOOLS_LOADED
        menu.add_item('Desenhar Sala (Ambiente)') { show_ambiente_tool }
        menu.add_item('Editar Modulo Selecionado') { edit_selected_module }
        menu.add_item('Copiar Modulo (Array)...') { copy_selected_module }
        menu.add_item('Espelhar Modulo') { mirror_selected_module }
        menu.add_separator
        menu.add_item('Gerar Tampo sobre Selecionados') { generate_countertop_for_selection }
        menu.add_item('Gerar Tampos (Modelo Inteiro)') { generate_all_countertops }
        menu.add_separator
        agg_menu = menu.add_submenu('Inserir agregado (mira)')
        agg_menu.add_item('Prateleira')         { activate_aim_placement('prateleira') }
        agg_menu.add_item('Divisória')          { activate_aim_placement('divisoria') }
        agg_menu.add_item('Gaveteiro Simples')  { activate_aim_placement('gaveteiro_simples') }
        menu.add_separator
      end
      menu.add_item('Analisar Modelo') { analyze_model }
      menu.add_item('Resolver Adjacencias') { resolve_neighbors } if TOOLS_LOADED
      menu.add_item('Processar Modelo Inteiro') { process_all_modules }
      menu.add_item('Processar Modulo Selecionado') { process_selected_module }
      menu.add_separator
      menu.add_item('Validar Modelo...') { show_dialog('validacao') }
      menu.add_item('Exportar JSON para CNC') { show_dialog('exportar') }
      menu.add_separator
      menu.add_item('Catalogo de Ferragens...') { show_hardware_catalog }
      if VISUAL_LOADED
        menu.add_item('Mostrar/Ocultar Ferragens') { toggle_hardware_visibility }
      end
      if TOOLS_LOADED
        menu.add_item('Adicionar Furo...') { activate_hole_tool }
        menu.add_item('Editar Furos') { activate_hole_edit_tool }
      end
      menu.add_separator
      menu.add_item('Configuracoes...') { show_dialog('config') }
      menu.add_item('Sobre') { show_dialog('sobre') }
      menu.add_separator
      menu.add_item('[Dev] Recarregar Plugin') { DevLoader.reload! }
      menu.add_item('[Dev] Watch Mode ON') { DevLoader.watch!(interval: 2) }
      menu.add_item('[Dev] Watch Mode OFF') { DevLoader.stop_watch! }
    end

    def self.show_main_panel
      dialog_controller.show_main_panel
    end

    def self.show_dialog(tab = 'biblioteca')
      dialog_controller.show(tab)
    end

    # ─── Toolbar Setup ──────────────────────────────
    def self.setup_toolbar
      toolbar = ::UI::Toolbar.new('Ornato CNC')

      # Open Ornato Design panel (new floating UI)
      cmd_panel = ::UI::Command.new('Ornato Design') { show_main_panel }
      cmd_panel.tooltip = 'Abrir Ornato Design — Biblioteca de modulos'
      cmd_panel.small_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_16.png')
      cmd_panel.large_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_24.png')
      toolbar.add_item(cmd_panel)

      # Open unified full dialog
      cmd_open = ::UI::Command.new('Ornato Dialog') { show_dialog }
      cmd_open.tooltip = 'Abrir dialogo completo Ornato CNC'
      cmd_open.small_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_16.png')
      cmd_open.large_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_24.png')
      toolbar.add_item(cmd_open)

      # Analyze
      cmd_analyze = ::UI::Command.new('Analisar') { analyze_model }
      cmd_analyze.tooltip = 'Analisar modelo e detectar pecas (Ctrl+Shift+A)'
      cmd_analyze.small_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_16.png')
      cmd_analyze.large_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_24.png')
      toolbar.add_item(cmd_analyze)

      # Process
      cmd_process = ::UI::Command.new('Processar') { process_selected_module }
      cmd_process.tooltip = 'Processar modulo selecionado (Ctrl+Shift+P)'
      cmd_process.small_icon = File.join(PLUGIN_DIR, 'icons', 'process_16.png')
      cmd_process.large_icon = File.join(PLUGIN_DIR, 'icons', 'process_24.png')
      toolbar.add_item(cmd_process)

      toolbar.add_separator

      # Export
      cmd_export = ::UI::Command.new('Exportar') { show_dialog('exportar') }
      cmd_export.tooltip = 'Exportar JSON para Ornato CNC (Ctrl+Shift+E)'
      cmd_export.small_icon = File.join(PLUGIN_DIR, 'icons', 'export_16.png')
      cmd_export.large_icon = File.join(PLUGIN_DIR, 'icons', 'export_24.png')
      toolbar.add_item(cmd_export)

      if TOOLS_LOADED
        cmd_ambiente = ::UI::Command.new('Sala') { show_ambiente_tool }
        cmd_ambiente.tooltip = 'Desenhar sala / ambiente (paredes automaticas)'
        cmd_ambiente.small_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_16.png')
        cmd_ambiente.large_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_24.png')
        toolbar.add_item(cmd_ambiente)

        cmd_edit_mod = ::UI::Command.new('Editar') { edit_selected_module }
        cmd_edit_mod.tooltip = 'Editar modulo Ornato selecionado'
        cmd_edit_mod.small_icon = File.join(PLUGIN_DIR, 'icons', 'process_16.png')
        cmd_edit_mod.large_icon = File.join(PLUGIN_DIR, 'icons', 'process_24.png')
        toolbar.add_item(cmd_edit_mod)

        cmd_add_hole = ::UI::Command.new('Furo') { activate_hole_tool }
        cmd_add_hole.tooltip = 'Adicionar furo manualmente'
        cmd_add_hole.small_icon = File.join(PLUGIN_DIR, 'icons', 'process_16.png')
        cmd_add_hole.large_icon = File.join(PLUGIN_DIR, 'icons', 'process_24.png')
        toolbar.add_item(cmd_add_hole)
      end

      if VISUAL_LOADED
        cmd_hardware_viz = ::UI::Command.new('Ferragens') { toggle_hardware_visibility }
        cmd_hardware_viz.tooltip = 'Mostrar/ocultar ferragens no modelo'
        cmd_hardware_viz.small_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_16.png')
        cmd_hardware_viz.large_icon = File.join(PLUGIN_DIR, 'icons', 'analyze_24.png')
        toolbar.add_item(cmd_hardware_viz)
      end

      toolbar.show
    end

    # ─── Keyboard Shortcuts ─────────────────────────
    def self.setup_shortcuts
      # Ctrl+Shift+A = Analyze
      cmd_a = ::UI::Command.new('Ornato: Analisar') { analyze_model }
      cmd_a.menu_text = 'Ornato: Analisar Modelo'
      cmd_a.set_validation_proc { MF_ENABLED }

      # Ctrl+Shift+P = Process
      cmd_p = ::UI::Command.new('Ornato: Processar') { process_selected_module }
      cmd_p.menu_text = 'Ornato: Processar Modulo'
      cmd_p.set_validation_proc { MF_ENABLED }

      # Ctrl+Shift+E = Export
      cmd_e = ::UI::Command.new('Ornato: Exportar') { show_dialog('exportar') }
      cmd_e.menu_text = 'Ornato: Exportar JSON'
      cmd_e.set_validation_proc { MF_ENABLED }

      # Register in Edit menu for shortcut discoverability
      edit_menu = ::UI.menu('Edit')
      edit_menu.add_separator
      edit_menu.add_item(cmd_a)
      edit_menu.add_item(cmd_p)
      edit_menu.add_item(cmd_e)

      # Assign accelerator keys (SketchUp 2021+)
      begin
        Sketchup.add_observer_method(:register_shortcut) if Sketchup.respond_to?(:register_shortcut)
      rescue
        # Shortcut registration may fail on older versions
      end
    end

    # ─── Observer Registration ──────────────────────
    def self.setup_observers
      model = Sketchup.active_model
      return unless model

      @model_observer = OrnatoModelObserver.new
      @entities_observer = OrnatoEntitiesObserver.new

      model.add_observer(@model_observer)
      model.active_entities.add_observer(@entities_observer)

      puts 'Ornato: Observers registrados para deteccao de alteracoes'
    rescue => e
      puts "Ornato: Erro ao registrar observers: #{e.message}"
    end

    # ─── Core Actions ───────────────────────────────
    def self.resolve_neighbors
      return unless TOOLS_LOADED

      adjacencies = Tools::NeighborResolver.resolve_all

      if adjacencies.empty?
        ::UI.messagebox("Nenhuma adjacencia encontrada.\n\nCertifique-se de que os modulos estao encostados.")
      else
        suppressed = adjacencies.count { |a| a[:suppress_lateral] }
        total_minifix = adjacencies.sum { |a| a[:minifix_positions].length }

        msg  = "Adjacencias resolvidas!\n\n"
        msg += "#{adjacencies.length} par(es) de modulos adjacentes\n"
        msg += "#{suppressed} lateral(is) compartilhada(s) detectada(s)\n"
        msg += "#{total_minifix} posicoes de minifix calculadas\n\n"

        adjacencies.each do |adj|
          side_label = { right: 'direita→esquerda', back: 'fundo→frente' }[adj[:contact_axis] == :x ? :right : :back] || adj[:contact_side].to_s
          suppress_note = adj[:suppress_lateral] ? ' [lateral suprimida]' : ''
          msg += "  #{adj[:group_a_name]} ↔ #{adj[:group_b_name]} (#{side_label})#{suppress_note}\n"
        end

        ::UI.messagebox(msg)
      end
    end

    def self.analyze_model
      model = Sketchup.active_model
      unless model
        ::UI.messagebox('Nenhum modelo aberto.')
        return
      end

      analyzer = Core::ModelAnalyzer.new(model)
      result = analyzer.analyze
      @last_analysis = result

      msg = "Analise completa:\n\n"
      msg += "Modulos encontrados: #{result[:modules].length}\n"
      msg += "Pecas detectadas: #{result[:pieces].length}\n"
      msg += "Materiais: #{result[:materials].uniq.length}\n"
      msg += "Juncoes: #{result[:joints].length}\n"

      ::UI.messagebox(msg)
      result
    end

    def self.process_selected_module
      return if compat_blocked?
      model = Sketchup.active_model
      selection = model.selection

      if selection.empty?
        ::UI.messagebox('Selecione um modulo (grupo/componente) para processar.')
        return
      end

      group = selection.first
      unless group.is_a?(Sketchup::Group) || group.is_a?(Sketchup::ComponentInstance)
        ::UI.messagebox('Selecione um grupo ou componente que represente um modulo.')
        return
      end

      config = Config.load
      engine = Hardware::RulesEngine.new(config)
      machining = engine.process_module(group)
      @last_machining = (@last_machining || {}).merge(machining)

      # Visualize hardware on the model (if visual modules loaded)
      if VISUAL_LOADED
        begin
          viz = Visual::HardwareVisualizer.new
          viz.visualize_module(group, machining)
        rescue => e
          puts "Ornato: Erro ao visualizar ferragens: #{e.message}"
        end
      end

      count = machining.values.sum { |m| m['workers']&.length || 0 }
      ::UI.messagebox(
        "Processamento completo!\n\n" \
        "#{machining.length} pecas processadas\n" \
        "#{count} operacoes de usinagem geradas" \
        "#{VISUAL_LOADED ? "\n\nFerragens visuais criadas no modelo." : ''}"
      )

      machining
    end

    def self.export_json
      return if compat_blocked?
      model = Sketchup.active_model
      unless model
        ::UI.messagebox('Nenhum modelo aberto.')
        return
      end

      # Analisar modelo completo
      analyzer = Core::ModelAnalyzer.new(model)
      analysis = analyzer.analyze
      @last_analysis = analysis

      # Processar todas as furacoes
      config = Config.load
      engine = Hardware::RulesEngine.new(config)

      all_machining = {}
      analysis[:modules].each do |mod|
        machining = engine.process_module(mod[:group])
        all_machining.merge!(machining)
      end
      @last_machining = all_machining

      # Validar antes de exportar
      validator = Validation::Validator.new(config)
      issues = validator.validate(analysis, all_machining)

      if validator.has_errors?(issues)
        show_validation_with_data(issues)
        return
      end

      # Gerar JSON
      exporter = Export::JsonExporter.new(analysis, all_machining, config)
      json_data = exporter.generate

      # Salvar arquivo
      path = ::UI.savepanel('Salvar JSON para CNC', '', "#{model.title || 'projeto'}.json")
      if path
        File.write(path, JSON.pretty_generate(json_data))
        ::UI.messagebox(
          "Exportado com sucesso!\n\n#{path}\n\n" \
          "#{analysis[:pieces].length} pecas\n" \
          "#{all_machining.values.sum { |m| m['workers']&.length || 0 }} operacoes"
        )
      end
    end

    # ─── DXF Export (1 arquivo por peça) ────────────
    # Emite um .dxf por peça-chapa em um diretório escolhido pelo usuário,
    # com camadas CNC convencionais (OUTLINE, DRILL_TOPSIDE, DRILL_EDGE_*,
    # POCKET_*, GROOVE_*, EDGE_BANDING, LABEL). Profundidade/tool/feed
    # embarcados via XDATA com app id ORNATO + fallback MTEXT.
    #
    # Reusa o pipeline analyzer + RulesEngine; NÃO modifica o JsonExporter.
    def self.export_dxf
      return if compat_blocked?
      model = Sketchup.active_model
      unless model
        ::UI.messagebox('Nenhum modelo aberto.')
        return
      end

      analyzer = Core::ModelAnalyzer.new(model)
      analysis = analyzer.analyze
      @last_analysis = analysis

      config = Config.load
      engine = Hardware::RulesEngine.new(config)

      all_machining = {}
      analysis[:modules].each do |mod|
        machining = engine.process_module(mod[:group])
        all_machining.merge!(machining)
      end
      @last_machining = all_machining

      out_dir = ::UI.select_directory(
        title: 'Pasta de saída para arquivos DXF',
        select_multiple: false,
      ) rescue nil

      return unless out_dir

      data = {
        pieces:    analysis[:pieces] || [],
        machining: all_machining,
        project:   { name: model.title, code: "PRJ_#{Time.now.strftime('%Y%m%d_%H%M')}" },
      }

      result = Export::DxfExporter.new(data).export_to_dir(out_dir)

      msg = "DXF exportado!\n\n" \
            "#{result[:stats][:pieces]} arquivos em:\n#{out_dir}\n\n" \
            "#{result[:stats][:drillings]} furos serializados"
      msg += "\n\nErros:\n" + result[:errors].first(5).join("\n") unless result[:errors].empty?
      ::UI.messagebox(msg)
    end

    # ─── Batch Processing (Modelo Inteiro) ──────────
    def self.process_all_modules
      return if compat_blocked?
      model = Sketchup.active_model
      unless model
        ::UI.messagebox('Nenhum modelo aberto.')
        return
      end

      # Analyze everything first
      analyzer = Core::ModelAnalyzer.new(model)
      analysis = analyzer.analyze
      @last_analysis = analysis

      if analysis[:modules].empty?
        ::UI.messagebox(
          "Nenhum modulo Ornato encontrado.\n\n" \
          "Certifique-se de que os grupos estao nomeados com prefixo ORN_ " \
          "(ex: ORN_BAL, ORN_ARM, etc.)"
        )
        return
      end

      config = Config.load
      engine = Hardware::RulesEngine.new(config)
      all_machining = {}
      total_ops = 0
      errors = []

      analysis[:modules].each do |mod|
        begin
          machining = engine.process_module(mod[:group])
          all_machining.merge!(machining)
          count = machining.values.sum { |m| m['workers']&.length || 0 }
          total_ops += count
        rescue => e
          mod_name = mod[:group].respond_to?(:name) ? mod[:group].name : 'desconhecido'
          errors << "#{mod_name}: #{e.message}"
        end
      end

      @last_machining = all_machining

      # Visualize all hardware
      if VISUAL_LOADED
        begin
          viz = Visual::HardwareVisualizer.new
          analysis[:modules].each do |mod|
            mod_machining = {}
            mod[:group].entities.each do |ent|
              pid = ent.get_attribute('ornato', 'persistent_id', nil) || "piece_#{ent.entityID}"
              mod_machining[pid] = all_machining[pid] if all_machining[pid]
            end
            viz.visualize_module(mod[:group], mod_machining)
          end
        rescue => e
          puts "Ornato: Erro ao visualizar ferragens: #{e.message}"
        end
      end

      # Run SmartAdvisor if available
      advisor_warnings = []
      if ADVISOR_LOADED
        begin
          advisor = Advisor::SmartAdvisor.new(config)
          advisor_warnings = advisor.analyze(analysis, all_machining)
        rescue => e
          puts "Ornato: SmartAdvisor erro: #{e.message}"
        end
      end

      msg = "Processamento em lote completo!\n\n"
      msg += "#{analysis[:modules].length} modulos processados\n"
      msg += "#{all_machining.length} pecas com usinagem\n"
      msg += "#{total_ops} operacoes geradas\n"
      msg += "\nRegras aplicadas: #{engine.rules.length} (incluindo novas)\n"

      unless errors.empty?
        msg += "\nErros (#{errors.length}):\n"
        errors.first(5).each { |e| msg += "  - #{e}\n" }
        msg += "  ... e mais #{errors.length - 5}\n" if errors.length > 5
      end

      unless advisor_warnings.empty?
        msg += "\nAvisos do SmartAdvisor (#{advisor_warnings.length}):\n"
        advisor_warnings.first(5).each { |w| msg += "  - #{w[:message]}\n" }
      end

      ::UI.messagebox(msg)
      all_machining
    end

    def self.sync_with_erp
      ::UI.messagebox(
        "Sincronizacao com Ornato ERP -- Em desenvolvimento.\n\n" \
        "Por enquanto, use Export JSON e importe manualmente no CNC."
      )
    end

    # ─── Validation (now in unified dialog, kept for export flow) ──

    def self.show_validation_with_data(issues)
      # Open unified dialog on validacao tab and send results
      show_dialog('validacao')
      issues_data = issues.map do |issue|
        {
          severity: issue.severity.to_s,
          code: issue.code.to_s,
          message: issue.message.to_s,
          piece_id: issue.piece_id,
          module_name: issue.module_name,
          suggestion: issue.suggestion,
        }
      end
      # Send after dialog loads
      ::UI.start_timer(1.0, false) do
        ctrl = dialog_controller
        if ctrl.visible?
          b64 = Base64.strict_encode64({ issues: issues_data }.to_json)
          ctrl.dialog.execute_script("ornatoValidationResults('#{b64}')")
        end
      end
    end

    def self.select_piece_in_model(piece_id)
      model = Sketchup.active_model
      return unless model

      model.selection.clear

      # Search all entities for the matching piece
      model.active_entities.each do |ent|
        next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)

        pid = ent.get_attribute('ornato', 'persistent_id', nil) ||
              ent.get_attribute('ornato', 'upm_persistent_id', nil) ||
              "piece_#{ent.entityID}"

        if pid.to_s == piece_id.to_s
          model.selection.add(ent)
          # Zoom to selection
          Sketchup.active_model.active_view.zoom(model.selection)
          return
        end

        # Also search inside groups (pieces are children of modules)
        if ent.respond_to?(:entities)
          ent.entities.each do |child|
            next unless child.is_a?(Sketchup::Group) || child.is_a?(Sketchup::ComponentInstance)
            cpid = child.get_attribute('ornato', 'persistent_id', nil) ||
                   child.get_attribute('ornato', 'upm_persistent_id', nil) ||
                   "piece_#{child.entityID}"
            if cpid.to_s == piece_id.to_s
              model.selection.add(child)
              Sketchup.active_model.active_view.zoom(model.selection)
              return
            end
          end
        end
      end
    end

    # ─── Hardware Catalog Dialog (Fase 4B) ──────────

    def self.show_hardware_catalog
      @catalog_dialog = ::UI::HtmlDialog.new(
        dialog_title: 'Catalogo de Ferragens -- Ornato',
        width: 520, height: 650,
        style: ::UI::HtmlDialog::STYLE_DIALOG
      )

      dialog = @catalog_dialog
      dialog.set_file(File.join(PLUGIN_DIR, 'ornato_sketchup', 'catalog', 'catalog_dialog.html'))

      # Callback: set a hardware item as default
      dialog.add_action_callback('set_default') do |_ctx, params|
        parts = params.to_s.split('|')
        if parts.length == 2
          category = parts[0]
          item_id = parts[1]
          apply_catalog_default(category, item_id)
        end
      end

      dialog.show

      # Inject catalog data after dialog loads
      catalog_json = Catalog::HardwareCatalog.to_json
      ::UI.start_timer(0.5, false) do
        dialog.execute_script("setCatalogData(#{catalog_json})") if dialog.visible?
      end
    end

    def self.apply_catalog_default(category, item_id)
      item = Catalog::HardwareCatalog.find_by_id(item_id)
      return unless item

      config = Config.load
      new_specs = Catalog::HardwareCatalog.to_config_specs(item)

      case category.to_sym
      when :hinge
        config[:hinge] = (config[:hinge] || {}).merge(new_specs)
      when :minifix
        config[:minifix] = (config[:minifix] || {}).merge(new_specs)
      when :slide
        config[:drawer_slide] = (config[:drawer_slide] || {}).merge(new_specs)
      when :handle
        config[:handle] = (config[:handle] || {}).merge(new_specs)
      when :dowel
        config[:dowel] = (config[:dowel] || {}).merge(new_specs)
      end

      # Save the selected default ID
      config[:catalog_defaults] ||= {}
      config[:catalog_defaults][category.to_sym] = item_id

      Config.save(config)
      Sketchup.status_text = "Ornato: #{item[:brand]} #{item[:model]} definido como padrao"
    end

    # ─── Legacy Dialogs (kept for specific features) ──

    def self.show_drilling_preview
      dialog = ::UI::HtmlDialog.new(
        dialog_title: 'Preview Furacoes — Ornato',
        width: 800, height: 600,
        style: ::UI::HtmlDialog::STYLE_DIALOG
      )
      dialog.set_file(File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'drilling_preview.html'))
      dialog.show
    end

    # ─── Visual Hardware & Manual Holes (Fase 3) ────

    def self.toggle_hardware_visibility
      return unless VISUAL_LOADED
      viz = Visual::HardwareVisualizer.new
      @hardware_visible = !@hardware_visible
      viz.toggle_visibility(@hardware_visible)
      state = @hardware_visible ? 'visiveis' : 'ocultas'
      Sketchup.status_text = "Ornato: Ferragens #{state}"
    end

    def self.activate_hole_tool
      return unless TOOLS_LOADED
      Sketchup.active_model.select_tool(Tools::HoleTool.new)
    end

    def self.activate_hole_edit_tool
      return unless TOOLS_LOADED
      Sketchup.active_model.select_tool(Tools::HoleEditTool.new)
    end

    # ─── Aim Placement (agregados em vão de módulo) ─
    def self.activate_aim_placement(aggregate_id)
      return unless TOOLS_LOADED
      unless defined?(Tools::AimPlacementTool)
        ::UI.messagebox('AimPlacementTool indisponivel.')
        return
      end
      tool = Tools::AimPlacementTool.new(aggregate_id.to_s)
      Sketchup.active_model.select_tool(tool)
    end

    # ─── Ambiente (Room Builder) ────────────────────
    def self.show_ambiente_tool(wall_height: 2700.0)
      return unless TOOLS_LOADED
      ctrl = dialog_controller
      tool = Tools::AmbienteTool.new(ctrl.main_panel_visible? ? ctrl : nil, wall_height: wall_height)
      Sketchup.active_model.select_tool(tool)
      Sketchup.status_text = 'Ornato: Clique para definir os cantos da sala | ESC=cancelar'
    end

    # ─── Edit selected Ornato module ────────────────
    def self.edit_selected_module
      return unless TOOLS_LOADED

      model = Sketchup.active_model
      sel = model.selection.first
      unless sel && (sel.is_a?(Sketchup::Group) || sel.is_a?(Sketchup::ComponentInstance))
        ::UI.messagebox('Selecione um modulo Ornato antes de editar.')
        return
      end

      has_ornato = sel.get_attribute('Ornato', 'module_type') || sel.get_attribute('Ornato', 'params')
      unless has_ornato
        ::UI.messagebox('O grupo selecionado nao e um modulo Ornato.')
        return
      end

      ctrl = dialog_controller
      tool = Tools::EditTool.new(sel, ctrl.main_panel_visible? ? ctrl : nil)
      model.select_tool(tool)
    end

    # ─── CopyArrayTool ──────────────────────────────
    def self.copy_selected_module(count: 1, direction: :x, gap_mm: 0)
      return unless TOOLS_LOADED
      group = selected_ornato_group
      return unless group
      ctrl = dialog_controller
      tool = Tools::CopyArrayTool.new(group,
        direction:  direction,
        count:      count,
        gap_mm:     gap_mm,
        controller: ctrl.main_panel_visible? ? ctrl : nil
      )
      Sketchup.active_model.select_tool(tool)
    end

    def self.mirror_selected_module
      return unless TOOLS_LOADED
      group = selected_ornato_group
      return unless group
      ctrl = dialog_controller
      tool = Tools::CopyArrayTool.new(group,
        mirror:     true,
        count:      1,
        direction:  :x,
        controller: ctrl.main_panel_visible? ? ctrl : nil
      )
      Sketchup.active_model.select_tool(tool)
    end

    # ─── CountertopBuilder ──────────────────────────
    def self.generate_countertop_for_selection
      Library::CountertopBuilder.build_for_selection
    rescue => e
      ::UI.messagebox("Erro ao gerar tampo: #{e.message}")
    end

    def self.generate_all_countertops
      groups = Library::CountertopBuilder.build_for_all
      ::UI.messagebox("#{groups.length} tampo(s) gerado(s)")
    rescue => e
      ::UI.messagebox("Erro ao gerar tampos: #{e.message}")
    end

    # ─── Helpers ────────────────────────────────────
    def self.selected_ornato_group
      model = Sketchup.active_model
      sel   = model.selection.first
      unless sel && (sel.is_a?(Sketchup::Group) || sel.is_a?(Sketchup::ComponentInstance))
        ::UI.messagebox('Selecione um modulo Ornato primeiro.')
        return nil
      end
      unless sel.get_attribute('Ornato', 'module_type') || sel.get_attribute('Ornato', 'params')
        ::UI.messagebox('O grupo selecionado nao e um modulo Ornato.')
        return nil
      end
      sel
    end

    # NOTE: Construtor, Agregador, Troca, Acabamentos, Sobre
    # are now tabs in the unified dialog (dialog_controller.rb)
  end

  # ══════════════════════════════════════════════════════
  # Bootstrap — Register everything on load
  # ══════════════════════════════════════════════════════

  # ── min_compat enforcement gate (Sprint A3 / C2) ──────────────
  # Se o servidor sinalizou em check anterior que a versão atual é
  # incompatível, bloqueia features pesadas até que o usuário atualize.
  COMPAT_VIOLATED = begin
    if UPDATER_LOADED && defined?(::Ornato::AutoUpdater)
      cv = ::Ornato::AutoUpdater.compat_violation
      if cv && Gem::Version.new(::Ornato::Version.current[:version].to_s) <
              Gem::Version.new(cv['min_required'].to_s)
        ::Ornato::Logger.error("Plugin disabled: min_compat violation #{cv.inspect}") rescue nil
        if defined?(::UI) && ::UI.respond_to?(:start_timer)
          ::UI.start_timer(0.5, false) do
            ::UI.messagebox("Ornato CNC: atualização obrigatória.\n\nVersão atual #{cv['current']} é incompatível com o servidor (mínima: #{cv['min_required']}).\n\nUse o menu Plugins → Ornato CNC para atualizar.") rescue nil
            ::Ornato::AutoUpdater.check_for_updates(silent: false) rescue nil
          end
        end
        true
      else
        false
      end
    else
      false
    end
  rescue => _e
    false
  end

  Main.setup_menu
  Main.setup_toolbar
  Main.setup_shortcuts
  Main.setup_observers unless COMPAT_VIOLATED

  # Verificar atualizações em background (silencioso)
  AutoUpdater.check_on_startup if UPDATER_LOADED

  # Primeiro uso: pergunta sobre telemetria (default OFF até decisão explícita).
  # Só aparece uma vez — mark_telemetry_decided persiste a resposta.
  if UPDATER_LOADED && defined?(::Ornato::AutoUpdater) &&
     !::Ornato::AutoUpdater.telemetry_decided?
    if defined?(::UI) && ::UI.respond_to?(:start_timer)
      ::UI.start_timer(2.0, false) do
        begin
          answer = ::UI.messagebox(
            "Ornato pode enviar telemetria anônima (versão, OS, SketchUp version) " \
            "para ajudar a melhorar o plugin?\n\n" \
            "Nada de informação pessoal ou de projetos é enviado. " \
            "Você pode mudar isso depois em Configurações.",
            MB_YESNO
          )
          ::Ornato::AutoUpdater.mark_telemetry_decided(answer == IDYES)
        rescue => e
          ::Ornato::Logger.warn("telemetry first-run prompt falhou: #{e.message}") rescue nil
        end
      end
    end
  end

  # Sync incremental do manifest da biblioteca (não bloqueante).
  if LIBRARY_SYNC_LOADED
    Thread.new do
      begin
        ::Ornato::Library::LibrarySync.instance.sync_manifest
      rescue => e
        ::Ornato::Logger.warn("LibrarySync startup falhou: #{e.message}") rescue nil
      end
    end
  end

  # Sync ShopConfig do ERP (perfil global da marcenaria) — não bloqueante.
  Thread.new do
    begin
      ::Ornato::Hardware::ShopConfig.sync_from_cloud
    rescue => e
      ::Ornato::Logger.warn("ShopConfig startup sync failed: #{e.message}") rescue nil
    end
  end

  puts "Ornato CNC v#{PLUGIN_VERSION} carregado — #{Catalog::HardwareCatalog.all.length} ferragens no catalogo"
end
