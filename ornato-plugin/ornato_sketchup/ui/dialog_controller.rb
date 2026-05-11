# ═══════════════════════════════════════════════════════
# DialogController — Unified OCL-style dialog manager
# Command bus: JS → Ruby via skp:ornato_command@base64
#              Ruby → JS via execute_script
# ═══════════════════════════════════════════════════════

require 'json'
require 'base64'
require 'net/http'
require 'uri'
require 'set'

module Ornato
  module UI
    class DialogController
      DIALOG_WIDTH          = 720
      DIALOG_HEIGHT         = 600
      MAIN_PANEL_WIDTH      = 420
      MAIN_PANEL_HEIGHT     = 720
      SHOP_CONFIG_WIDTH     = 520
      SHOP_CONFIG_HEIGHT    = 640

      attr_reader :dialog

      def initialize
        @dialog        = nil
        @main_panel    = nil
        @shop_config   = nil
        @mp_sel_timer  = nil
        @mp_last_sel_id = nil
        @commands      = {}
        register_commands
      end

      def show(startup_tab = 'biblioteca')
        if @dialog && @dialog.visible?
          # If already open, just switch tab
          select_tab(startup_tab)
          @dialog.bring_to_front
          return
        end

        # Cancel any previous selection timer
        cancel_selection_timer

        @dialog = ::UI::HtmlDialog.new(
          dialog_title: 'Ornato CNC',
          preferences_key: 'ornato_main_dialog',
          width: DIALOG_WIDTH,
          height: DIALOG_HEIGHT,
          min_width: 500,
          min_height: 400,
          style: ::UI::HtmlDialog::STYLE_DIALOG
        )

        html_path = File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'dialog.html')
        @dialog.set_file(html_path)

        # Register the single command bus callback
        @dialog.add_action_callback('ornato_command') do |_ctx, encoded|
          handle_command(encoded)
        end

        @dialog.show

        # Init after load
        config = build_init_config(startup_tab)
        config_b64 = b64_encode(config.to_json)
        ::UI.start_timer(0.5, false) do
          @dialog.execute_script("ornatoInit('#{config_b64}')") if @dialog && @dialog.visible?
        end

        # Listen for selection changes
        setup_selection_observer
      end

      def close
        cancel_selection_timer
        @dialog.close if @dialog && @dialog.visible?
      end

      def select_tab(tab_name)
        return unless @dialog && @dialog.visible?
        @dialog.execute_script("OrnatoDialog.selectTab('#{tab_name}')")
      end

      def visible?
        @dialog && @dialog.visible?
      end

      def main_panel_visible?
        @main_panel && @main_panel.visible?
      end

      # Exposed so Main module can check before passing self as controller
      def main_panel
        @main_panel
      end

      # ── New Ornato Design Panel ────────────────────────
      # Floating utility panel with module library, model
      # summary and export — uses main_panel.html
      def show_main_panel
        if @main_panel && @main_panel.visible?
          @main_panel.bring_to_front
          return
        end

        @main_panel = ::UI::HtmlDialog.new(
          dialog_title:    'Ornato Design',
          preferences_key: 'ornato_main_panel',
          width:           MAIN_PANEL_WIDTH,
          height:          MAIN_PANEL_HEIGHT,
          min_width:       340,
          min_height:      500,
          style:           ::UI::HtmlDialog::STYLE_UTILITY
        )

        html_path = File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'main_panel.html')
        @main_panel.set_file(html_path)

        register_main_panel_callbacks

        @main_panel.show

        # Push version + model summary + library after load
        ::UI.start_timer(0.5, false) do
          next unless @main_panel && @main_panel.visible?
          version = ::Ornato::Version.current[:version]
          @main_panel.execute_script("typeof setVersion==='function'&&setVersion('#{version}')")
          push_model_summary_to_panel
          push_library_to_panel
          push_project_data_to_panel
        end

        # Start selection polling for the main panel
        setup_main_panel_selection_observer
      end

      def close_main_panel
        cancel_main_panel_selection_timer
        @main_panel.close if @main_panel && @main_panel.visible?
      end

      # ── ShopConfig Panel ───────────────────────────────
      # Floating utility window for global hardware settings.

      def show_shop_config_panel
        if @shop_config && @shop_config.visible?
          @shop_config.bring_to_front
          return
        end

        @shop_config = ::UI::HtmlDialog.new(
          dialog_title:    'Configurações da Marcenaria',
          preferences_key: 'ornato_shop_config',
          width:           SHOP_CONFIG_WIDTH,
          height:          SHOP_CONFIG_HEIGHT,
          min_width:       420,
          min_height:      500,
          style:           ::UI::HtmlDialog::STYLE_UTILITY
        )

        html_path = File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'shop_config_panel.html')
        @shop_config.set_file(html_path)

        # ── Callbacks para o painel de config ──────────
        @shop_config.add_action_callback('get_shop_config') do |_ctx|
          begin
            json = Hardware::ShopConfig.to_ui_json
            @shop_config.execute_script("window.setShopConfig(#{json})")
          rescue => e
            puts "Ornato ShopConfig get ERRO: #{e.message}"
          end
        end

        @shop_config.add_action_callback('save_shop_config') do |_ctx, config_json|
          begin
            config = JSON.parse(config_json.to_s)
            Hardware::ShopConfig.save(config)
            panel_status('Configurações da marcenaria salvas')
          rescue => e
            puts "Ornato ShopConfig save ERRO: #{e.message}"
          end
        end

        @shop_config.add_action_callback('reset_shop_config') do |_ctx|
          begin
            Hardware::ShopConfig.reset!
            json = Hardware::ShopConfig.to_ui_json
            @shop_config.execute_script("window.setShopConfig(#{json})")
            panel_status('Configurações resetadas para padrão')
          rescue => e
            puts "Ornato ShopConfig reset ERRO: #{e.message}"
          end
        end

        @shop_config.show

        # Push current config after the panel loads
        ::UI.start_timer(0.4, false) do
          next unless @shop_config && @shop_config.visible?
          begin
            json = Hardware::ShopConfig.to_ui_json
            @shop_config.execute_script("window.setShopConfig(#{json})")
          rescue => e
            puts "Ornato ShopConfig init ERRO: #{e.message}"
          end
        end
      end

      def close_shop_config_panel
        @shop_config.close if @shop_config && @shop_config.visible?
      end

      # ── Panel helpers (used by PlacementTool) ─────────

      # Execute arbitrary JS in the main panel
      def send_to_panel(js)
        return unless @main_panel && @main_panel.visible?
        @main_panel.execute_script(js)
      end

      # Short-cut: push a status / log message to the panel
      def panel_status(text)
        return unless @main_panel && @main_panel.visible?
        safe = text.to_s.gsub('\\', '\\\\\\\\').gsub("'", "\\\\'").gsub("\n", ' ')
        @main_panel.execute_script("typeof addLog==='function'&&addLog('#{safe}')")
        @main_panel.execute_script("typeof showToast==='function'&&showToast('#{safe}','info')")
      end

      # ── Send data to JS ──────────────────────────────

      def send_response(id, data)
        return unless @dialog && @dialog.visible?
        b64 = data ? b64_encode(data.to_json) : ''
        @dialog.execute_script("commandCallback('#{id}', '#{b64}')")
      end

      def send_status(text)
        return unless @dialog && @dialog.visible?
        safe = text.to_s.gsub('\\', '\\\\\\\\').gsub("'", "\\\\'").gsub("\n", ' ')
        @dialog.execute_script("ornatoStatus('#{safe}')")
      end

      def send_selection_changed(data)
        return unless @dialog && @dialog.visible?
        b64 = b64_encode(data.to_json)
        @dialog.execute_script("ornatoSelectionChanged('#{b64}')")
      end

      private

      # ── Main Panel Callbacks (direct — no command bus) ──────

      def register_main_panel_callbacks

        # "Inserir no Modelo" button → activate PlacementTool
        @main_panel.add_action_callback('create_module') do |_ctx, type, params_json|
          begin
            mod_params = JSON.parse(params_json.to_s, symbolize_names: true)
          rescue
            mod_params = {}
          end

          if defined?(TOOLS_LOADED) && TOOLS_LOADED
            tool = Tools::PlacementTool.new(type.to_s, mod_params, self)
            Sketchup.active_model.select_tool(tool)
            panel_status('Clique no modelo para posicionar | Shift+Clique repete | ESC cancela')
          else
            Library::ParametricEngine.create_module(type.to_s, mod_params)
            panel_status("Modulo inserido: #{type}")
            push_model_summary_to_panel
          end
        end

        # MIRA-B: ativa AimPlacementTool pra inserir agregado em vão.
        # UI v2 chama: window.sketchup.start_aim_placement('prateleira')
        @main_panel.add_action_callback('start_aim_placement') do |_ctx, aggregate_id|
          if defined?(TOOLS_LOADED) && TOOLS_LOADED && defined?(Tools::AimPlacementTool)
            tool = Tools::AimPlacementTool.new(aggregate_id.to_s)
            Sketchup.active_model.select_tool(tool)
            panel_status("Mire o cursor no vão para inserir #{aggregate_id} | ESC cancela")
          else
            panel_status('AimPlacementTool indisponível')
          end
        end

        # UI v2 Internos (Sprint UX-8): lista agregados disponíveis em biblioteca/agregados/
        # JS chama: window.sketchup.get_available_aggregates()
        # Ruby responde: window.onAggregatesList({ aggregates: [{id, nome, ...}] })
        @main_panel.add_action_callback('get_available_aggregates') do |_ctx|
          begin
            agg_dir = File.expand_path('../../biblioteca/agregados', __dir__)
            files = Dir.glob(File.join(agg_dir, '*.json'))
            agregados = files.map do |f|
              begin
                j = JSON.parse(File.read(f))
                {
                  id:         j['id'],
                  nome:       j['nome'],
                  descricao:  j['descricao'],
                  bay_target: j['bay_target'],
                  min_bay:    j['min_bay'],
                }
              rescue StandardError => e
                warn "[Ornato] falha lendo agregado #{f}: #{e.message}"
                nil
              end
            end.compact
            json = { aggregates: agregados }.to_json
            @main_panel.execute_script("window.onAggregatesList && window.onAggregatesList(#{json})")
          rescue StandardError => e
            warn "[Ornato] get_available_aggregates ERRO: #{e.message}"
            @main_panel.execute_script("window.onAggregatesList && window.onAggregatesList({\"aggregates\":[]})")
          end
        end

        # Analyze model — refreshes module/piece counts
        @main_panel.add_action_callback('analyze') do |_ctx|
          Main.analyze_model
          push_model_summary_to_panel
          panel_status('Modelo analisado')
        end

        # Process selected module (hardware rules)
        @main_panel.add_action_callback('process') do |_ctx|
          Main.process_selected_module
          panel_status('Ferragens processadas')
        end

        # Select entity by ID and zoom to it
        @main_panel.add_action_callback('select_module') do |_ctx, entity_id|
          Main.select_piece_in_model(entity_id)
        end

        # Delete an Ornato module group from the model
        @main_panel.add_action_callback('delete_module') do |_ctx, entity_id|
          delete_ornato_module_by_id(entity_id.to_s)
          push_model_summary_to_panel
          panel_status('Modulo removido')
        end

        # Export full JSON to file
        @main_panel.add_action_callback('export_json') do |_ctx|
          Main.export_json
        end

        # Export DXF (1 arquivo por peça-chapa, camadas CNC convencionais)
        @main_panel.add_action_callback('export_dxf') do |_ctx|
          Main.export_dxf
        end

        # Export CSV (piece list) — uses BomExporter if available
        @main_panel.add_action_callback('export_csv') do |_ctx|
          begin
            require_relative '../export/bom_exporter'
            model = Sketchup.active_model
            if model
              path = ::UI.savepanel('Exportar planilha', '', "#{model.title || 'projeto'}.csv")
              if path
                bom = Export::BomExporter.new(model)
                bom.export_csv(path)
                panel_status("CSV salvo: #{File.basename(path)}")
              end
            end
          rescue => e
            panel_status("Erro CSV: #{e.message}")
          end
        end

        # Sync with ERP
        @main_panel.add_action_callback('export_to_erp') do |_ctx, url, proj|
          Main.sync_with_erp
        end

        # Test ERP connection
        @main_panel.add_action_callback('test_erp_connection') do |_ctx, url|
          begin
            uri = URI(url.to_s)
            response = Net::HTTP.get_response(uri)
            ok = response.code.to_i == 200
            panel_status(ok ? "ERP conectado (#{url})" : "ERP nao respondeu (#{response.code})")
          rescue => e
            panel_status("Erro de conexao: #{e.message}")
          end
        end

        # ── ERP: vincular projeto ──────────────────────
        @main_panel.add_action_callback('erp_init_project') do |_ctx, numero_ou_id|
          unless defined?(ERP_INTEGRATOR_LOADED) && ERP_INTEGRATOR_LOADED
            panel_status('ERP Integrator nao disponivel')
            next
          end
          erp = Integration::ErpIntegrator.new
          result = erp.init_project(numero_ou_id.to_s.strip)
          if result[:ok]
            @erp_project = result[:projeto]
            safe_proj = (@erp_project.to_json).gsub('\\', '\\\\\\\\').gsub("'", "\\\\'")
            send_to_panel("typeof setErpProject==='function'&&setErpProject(#{@erp_project.to_json})")
            panel_status("Projeto vinculado: #{@erp_project[:numero]} — #{@erp_project[:cliente]}")
          else
            panel_status("ERP: #{result[:error] || 'Projeto nao encontrado'}")
          end
        end

        # ── ERP: push BOM ao vivo ──────────────────────
        @main_panel.add_action_callback('erp_push_bom') do |_ctx|
          unless @erp_project && @erp_project[:id]
            panel_status('Vincule um projeto ERP antes de enviar o BOM')
            next
          end
          modulos = collect_ornato_groups_from_model
          erp = Integration::ErpIntegrator.new
          result = erp.push_bom(@erp_project[:id], modulos)
          if result[:ok]
            custo = result[:custo_estimado]
            total = result[:total_pecas]
            send_to_panel("typeof setErpBom==='function'&&setErpBom(#{result.to_json})")
            panel_status("BOM enviado: #{total} pecas | Custo mat. estimado: R$ #{custo}")
          else
            panel_status("Erro ao enviar BOM: #{result[:error]}")
          end
        end

        # ── ERP: criar proposta a partir do design ─────
        @main_panel.add_action_callback('erp_create_proposal') do |_ctx, ambiente_nome|
          unless @erp_project && @erp_project[:id]
            panel_status('Vincule um projeto ERP antes de gerar a proposta')
            next
          end
          modulos = collect_ornato_groups_from_model
          erp = Integration::ErpIntegrator.new
          summary = { ambiente: (ambiente_nome.to_s.empty? ? @erp_project[:ambiente] : ambiente_nome) }
          result = erp.create_proposal(@erp_project[:id], modulos, summary)
          if result[:ok]
            url = result[:proposta_url]
            send_to_panel("typeof setErpProposal==='function'&&setErpProposal(#{result.to_json})")
            panel_status("Proposta criada! #{result[:modulos_inseridos]} modulos enviados")
            begin
              ::UI.openURL(url) if url && !url.empty?
            rescue; end
          else
            panel_status("Erro ao criar proposta: #{result[:error]}")
          end
        end

        # ── AmbienteTool — Desenhar sala ───────────────
        @main_panel.add_action_callback('create_ambiente') do |_ctx, params_json|
          begin
            p = JSON.parse(params_json.to_s, symbolize_names: true)
          rescue
            p = {}
          end
          wall_height = p[:wall_height].to_f
          wall_height = 2700.0 if wall_height <= 0
          if defined?(TOOLS_LOADED) && TOOLS_LOADED
            tool = Tools::AmbienteTool.new(self, wall_height: wall_height)
            Sketchup.active_model.select_tool(tool)
            panel_status("Clique para definir cantos da sala (#{wall_height.to_i}mm altura) | ESC=cancelar")
          else
            panel_status('Ferramentas nao carregadas')
          end
        end

        # ── EditTool — Editar modulo selecionado ───────
        @main_panel.add_action_callback('edit_module') do |_ctx, entity_id|
          model = Sketchup.active_model
          target = nil
          if entity_id.to_s.empty?
            target = model.selection.first
          else
            model.active_entities.each do |e|
              if (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
                  e.entityID.to_s == entity_id.to_s
                target = e
                break
              end
            end
          end

          unless target && (target.get_attribute('Ornato', 'module_type') || target.get_attribute('Ornato', 'params'))
            panel_status('Selecione um modulo Ornato para editar')
            next
          end

          if defined?(TOOLS_LOADED) && TOOLS_LOADED
            tool = Tools::EditTool.new(target, self)
            model.select_tool(tool)
            panel_status("Editando: #{target.name} — altere parametros e confirme")
            # Store current edit tool for apply_edit
            @current_edit_tool = tool
          else
            panel_status('Ferramentas nao carregadas')
          end
        end

        # ── CopyArrayTool ──────────────────────────────
        @main_panel.add_action_callback('copy_module') do |_ctx, options_json|
          begin
            opts = JSON.parse(options_json.to_s, symbolize_names: true)
          rescue
            opts = {}
          end
          model = Sketchup.active_model
          sel = model.selection.first
          unless sel && (sel.is_a?(Sketchup::Group) || sel.is_a?(Sketchup::ComponentInstance)) &&
              (sel.get_attribute('Ornato', 'module_type') || sel.get_attribute('Ornato', 'params'))
            panel_status('Selecione um modulo Ornato para copiar')
            next
          end
          if defined?(TOOLS_LOADED) && TOOLS_LOADED
            tool = Tools::CopyArrayTool.new(sel,
              direction:  (opts[:direction] || 'x').to_sym,
              count:      (opts[:count] || 1).to_i,
              gap_mm:     (opts[:gap_mm] || 0).to_f,
              mirror:     opts[:mirror] || false,
              controller: self
            )
            model.select_tool(tool)
            panel_status("Modo copia: #{opts[:count] || 1}x em #{opts[:direction] || 'x'} | Clique/Enter=confirmar")
          end
        end

        # ── CountertopBuilder ──────────────────────────
        @main_panel.add_action_callback('generate_countertop') do |_ctx, options_json|
          begin
            opts = JSON.parse(options_json.to_s, symbolize_names: true)
          rescue
            opts = {}
          end
          mode      = opts[:mode] || 'selection'  # 'selection' ou 'all'
          thickness = opts[:thickness_mm].to_f
          thickness = 30.0 if thickness <= 0
          mat       = opts[:material]

          begin
            if mode == 'all'
              groups = Library::CountertopBuilder.build_for_all(material: mat, thickness_mm: thickness)
              push_model_summary_to_panel
              panel_status("#{groups.length} tampo(s) gerado(s)")
            else
              group = Library::CountertopBuilder.build_for_selection(material: mat, thickness_mm: thickness)
              push_model_summary_to_panel
              panel_status("Tampo gerado: #{group&.name || '?'}") if group
            end
          rescue => e
            panel_status("Erro ao gerar tampo: #{e.message}")
          end
        end

        # ── apply_edit — Confirmar edicao ─────────────
        @main_panel.add_action_callback('apply_edit') do |_ctx, new_params_json|
          unless @current_edit_tool
            panel_status('Nenhuma edicao ativa')
            next
          end
          begin
            new_params = JSON.parse(new_params_json.to_s, symbolize_names: false)
          rescue
            new_params = {}
          end
          result = @current_edit_tool.apply_params(new_params)
          if result
            push_model_summary_to_panel
            panel_status("Modulo atualizado: #{result.name}")
          else
            panel_status('Falha ao aplicar edicao')
          end
          @current_edit_tool = nil
          Sketchup.active_model.select_tool(nil)
        end

        # ── Library: carregar módulos da biblioteca ───────────
        @main_panel.add_action_callback('load_library') do |_ctx|
          push_library_to_panel
        end

        # ── Projeto: salvar dados do projeto no modelo ─────────
        @main_panel.add_action_callback('save_project_data') do |_ctx, data_json|
          begin
            data = JSON.parse(data_json.to_s)
            model = Sketchup.active_model
            if model
              data.each { |k, v| model.set_attribute('Ornato_Project', k.to_s, v.to_s) }
              panel_status('Projeto salvo')
            end
          rescue => e
            puts "Ornato save_project_data ERRO: #{e.message}"
          end
        end

        # ── Agregados: aplicar ao módulo selecionado ───────────
        @main_panel.add_action_callback('apply_agregados') do |_ctx, data_json|
          begin
            data      = JSON.parse(data_json.to_s)
            entity_id = data['entity_id'].to_i
            agregados = data['agregados'] || []
            group     = find_group_by_id(entity_id)
            if group
              group.set_attribute('Ornato', 'agregados', JSON.generate(agregados))
              panel_status("#{agregados.length} agregado(s) salvos no módulo")
            else
              panel_status('Módulo não encontrado')
            end
          rescue => e
            puts "Ornato apply_agregados ERRO: #{e.message}"
          end
        end

        # ── Materiais: aplicar overrides ao módulo selecionado ─
        @main_panel.add_action_callback('apply_materials') do |_ctx, data_json|
          begin
            data      = JSON.parse(data_json.to_s)
            entity_id = data['entity_id'].to_i
            group     = find_group_by_id(entity_id)
            unless group
              panel_status('Módulo não encontrado'); next
            end

            # Store full material override as JSON attribute
            group.set_attribute('Ornato', 'materials_override', JSON.generate(data))

            # Also update per-piece material where applicable
            mat_carcaca = data.dig('carcaca', 'chapa').to_s
            mat_frente  = data.dig('frente',  'chapa').to_s
            mat_fundo   = data.dig('fundo',   'chapa').to_s

            model = Sketchup.active_model
            mats  = model.materials

            apply_mat = ->(ent, mat_name) {
              next if mat_name.empty?
              m = mats[mat_name] || mats.add(mat_name)
              ent.material = m if ent.respond_to?(:material=)
            }

            group.entities.each do |ent|
              next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
              role = (ent.get_attribute('Ornato', 'role') || 'generic').to_s
              case role
              when /porta|door|frente|front/
                apply_mat.call(ent, mat_frente)
              when /fundo|back/
                apply_mat.call(ent, mat_fundo)
              else
                apply_mat.call(ent, mat_carcaca)
              end
            end

            panel_status('Materiais aplicados ao módulo')
          rescue => e
            puts "Ornato apply_materials ERRO: #{e.message}"
          end
        end

        # ── Shop Config: abrir painel dedicado ───────────────
        @main_panel.add_action_callback('open_shop_config') do |_ctx|
          show_shop_config_panel
        end

        # ── Shop Config: load / save (inline — legado) ────────
        @main_panel.add_action_callback('get_shop_config') do |_ctx|
          begin
            json = Hardware::ShopConfig.to_ui_json
            @main_panel.execute_script("window.setShopConfig(#{json})")
          rescue => e
            puts "Ornato get_shop_config ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('save_shop_config') do |_ctx, config_json|
          begin
            config = JSON.parse(config_json.to_s)
            Hardware::ShopConfig.save(config)
            panel_status('Configuração da marcenaria salva')
            showToast = "window.showToast('Configuração salva', 'success')"
            @main_panel.execute_script(showToast)
          rescue => e
            puts "Ornato save_shop_config ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('reset_shop_config') do |_ctx|
          Hardware::ShopConfig.reset!
          json = Hardware::ShopConfig.to_ui_json
          @main_panel.execute_script("window.setShopConfig(#{json})")
          panel_status('Config resetada para padrão')
        end

        # ── Shop Config: cloud sync (Sprint SHOP-3) ───────────
        @main_panel.add_action_callback('sync_shop_config') do |_ctx|
          begin
            payload = Hardware::ShopConfig.sync_from_cloud(force: true)
            ok = !payload.nil?
            status = Hardware::ShopConfig.cloud_status.merge('ok' => ok)
            @main_panel.execute_script(
              "window.onShopConfigSync && window.onShopConfigSync(#{JSON.generate(status)})"
            )
            panel_status(ok ? "Shop config sincronizada (#{status['profile']} v#{status['version']})" : 'Sync falhou — verifique conexão')
          rescue => e
            puts "Ornato sync_shop_config ERRO: #{e.message}"
            @main_panel.execute_script(
              "window.onShopConfigSync && window.onShopConfigSync(#{JSON.generate({ ok: false, error: e.message })})"
            )
          end
        end

        @main_panel.add_action_callback('get_shop_config_status') do |_ctx|
          begin
            status = Hardware::ShopConfig.cloud_status
            @main_panel.execute_script(
              "window.onShopConfigStatus && window.onShopConfigStatus(#{JSON.generate(status)})"
            )
          rescue => e
            puts "Ornato get_shop_config_status ERRO: #{e.message}"
          end
        end

        # ── Shop Config: local overrides (Sprint SHOP-5) ──────
        @main_panel.add_action_callback('get_shop_overrides') do |_ctx|
          begin
            overrides = Hardware::ShopConfig.read_overrides
            @main_panel.execute_script(
              "window.onShopOverrides && window.onShopOverrides(#{JSON.generate(overrides)})"
            )
          rescue => e
            puts "Ornato get_shop_overrides ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('set_shop_config_override') do |_ctx, payload_json|
          begin
            payload = JSON.parse(payload_json.to_s)
            key   = payload['key'].to_s
            value = payload['value']
            next if key.empty?
            Hardware::ShopConfig.set_override(key, value)
            overrides = Hardware::ShopConfig.read_overrides
            @main_panel.execute_script(
              "window.onShopOverrides && window.onShopOverrides(#{JSON.generate(overrides)})"
            )
            panel_status("Override local aplicado: #{key} = #{value}")
          rescue => e
            puts "Ornato set_shop_config_override ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('clear_shop_config_override') do |_ctx, key|
          begin
            Hardware::ShopConfig.clear_override(key.to_s)
            overrides = Hardware::ShopConfig.read_overrides
            @main_panel.execute_script(
              "window.onShopOverrides && window.onShopOverrides(#{JSON.generate(overrides)})"
            )
            panel_status("Override local removido: #{key}")
          rescue => e
            puts "Ornato clear_shop_config_override ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('clear_all_shop_overrides') do |_ctx|
          begin
            Hardware::ShopConfig.clear_all_overrides!
            @main_panel.execute_script(
              "window.onShopOverrides && window.onShopOverrides(#{JSON.generate({})})"
            )
            panel_status('Todos os overrides locais removidos')
          rescue => e
            puts "Ornato clear_all_shop_overrides ERRO: #{e.message}"
          end
        end

        # ── Reflow: rebuild com novos params, preservando agregados (Sprint REFLOW)
        @main_panel.add_action_callback('rebuild_module') do |_ctx, entity_id, params_json|
          begin
            group = find_group_by_id(entity_id.to_i)
            unless group
              @main_panel.execute_script(
                "window.onModuleRebuild && window.onModuleRebuild(#{JSON.generate({ ok: false, error: 'modulo_nao_encontrado' })})"
              )
              next
            end
            params_override = JSON.parse(params_json.to_s) rescue {}
            ok = Library::JsonModuleBuilder.rebuild(group, params_override)
            stats_raw = group.get_attribute('Ornato', 'reflow_stats', '{}')
            stats = (JSON.parse(stats_raw) rescue {}) || {}
            payload = {
              ok:        ok,
              entity_id: entity_id.to_i,
              rebuilt:   stats['rebuilt'] || 0,
              dropped:   stats['dropped'] || 0,
            }
            @main_panel.execute_script(
              "window.onModuleRebuild && window.onModuleRebuild(#{JSON.generate(payload)})"
            )
            msg = ok ? "Módulo recalculado (#{payload[:rebuilt]} agregados, #{payload[:dropped]} descartados)" : 'Falha no rebuild'
            panel_status(msg)
          rescue => e
            puts "Ornato rebuild_module ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('refresh_module_shop_snapshot') do |_ctx, entity_id|
          begin
            group = find_group_by_id(entity_id.to_i)
            unless group
              @main_panel.execute_script("window.onModuleSnapshotRefresh && window.onModuleSnapshotRefresh(#{JSON.generate({ ok: false, error: 'modulo_nao_encontrado' })})")
              next
            end
            snap = Library::JsonModuleBuilder.refresh_shop_snapshot(group)
            ok = !snap.nil?
            payload = {
              ok:       ok,
              entity_id: entity_id.to_i,
              profile:  group.get_attribute('Ornato', 'shop_profile', 'local'),
              version:  group.get_attribute('Ornato', 'shop_version', '0'),
            }
            @main_panel.execute_script(
              "window.onModuleSnapshotRefresh && window.onModuleSnapshotRefresh(#{JSON.generate(payload)})"
            )
            panel_status(ok ? 'Snapshot do módulo atualizado para a config atual' : 'Falha ao atualizar snapshot')
          rescue => e
            puts "Ornato refresh_module_shop_snapshot ERRO: #{e.message}"
          end
        end

        # ── UI v2 Inspector: detalhes contextual por entidade ───
        # Os 3 callbacks abaixo respondem a `window.onModuleDetails`,
        # `window.onPieceDetails` e `window.onAggregateDetails`.
        @main_panel.add_action_callback('get_module_details') do |_ctx, opts_json|
          begin
            opts      = JSON.parse(opts_json.to_s)
            entity_id = opts['entity_id'].to_i
            group     = find_group_by_id(entity_id)
            data = if group
              build_v2_module_details(group)
            else
              { entity_id: entity_id.to_s, ok: false, error: 'group_not_found' }
            end
            @main_panel.execute_script(
              "typeof window.onModuleDetails==='function'&&window.onModuleDetails(#{JSON.generate(data)})"
            )
          rescue => e
            puts "Ornato get_module_details ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('get_piece_details') do |_ctx, opts_json|
          begin
            opts      = JSON.parse(opts_json.to_s)
            entity_id = opts['entity_id'].to_i
            piece     = find_entity_anywhere(entity_id)
            data = if piece
              build_v2_piece_details(piece)
            else
              { entity_id: entity_id.to_s, ok: false, error: 'piece_not_found' }
            end
            @main_panel.execute_script(
              "typeof window.onPieceDetails==='function'&&window.onPieceDetails(#{JSON.generate(data)})"
            )
          rescue => e
            puts "Ornato get_piece_details ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('get_aggregate_details') do |_ctx, opts_json|
          begin
            opts      = JSON.parse(opts_json.to_s)
            entity_id = opts['entity_id'].to_i
            aggr      = find_entity_anywhere(entity_id)
            data = if aggr
              build_v2_aggregate_details(aggr)
            else
              { entity_id: entity_id.to_s, ok: false, error: 'aggregate_not_found' }
            end
            @main_panel.execute_script(
              "typeof window.onAggregateDetails==='function'&&window.onAggregateDetails(#{JSON.generate(data)})"
            )
          rescue => e
            puts "Ornato get_aggregate_details ERRO: #{e.message}"
          end
        end

        # ── SelectionResolver (cockpit / Miras / Trocas / Inspector) ──
        # JS: sketchup.resolve_selection(entity_id)
        # Resposta: window.onSelectionResolved(payload) — payload sempre
        # contém :kind, :allowed_actions, :compatible_aggregates,
        # :compatible_swaps. Botões btn-aggregates/btn-change ficam
        # disabled enquanto kind == :empty/:invalid/:unknown.
        @main_panel.add_action_callback('resolve_selection') do |_ctx, entity_id|
          begin
            ent = entity_id.nil? ? nil : find_entity_anywhere(entity_id.to_i)
            payload = ::Ornato::Tools::SelectionResolver.resolve(ent)
            @main_panel.execute_script(
              "window.onSelectionResolved && window.onSelectionResolved(#{JSON.generate(payload)})"
            )
          rescue => e
            puts "Ornato resolve_selection ERRO: #{e.message}"
            @main_panel.execute_script(
              "window.onSelectionResolved && window.onSelectionResolved(#{JSON.generate({ kind: :invalid, error: e.message })})"
            )
          end
        end

        # ── SwapEngine: lista variantes compatíveis para entidade ──
        # JS: sketchup.list_swaps(entity_id)
        # Resposta: window.onSwapList({ entity_id, kind, swaps: [...] })
        @main_panel.add_action_callback('list_swaps') do |_ctx, entity_id|
          begin
            ent     = entity_id.nil? ? nil : find_entity_anywhere(entity_id.to_i)
            payload = ::Ornato::Tools::SelectionResolver.resolve(ent)
            payload = payload.merge(_entity: ent)
            list    = ::Ornato::Constructor::SwapEngine.list_swaps_for(payload)
            @main_panel.execute_script(
              "window.onSwapList && window.onSwapList(#{JSON.generate({ entity_id: entity_id, kind: payload[:kind], swaps: list })})"
            )
          rescue => e
            puts "Ornato list_swaps ERRO: #{e.message}"
            @main_panel.execute_script(
              "window.onSwapList && window.onSwapList(#{JSON.generate({ ok: false, error: e.message })})"
            )
          end
        end

        # ── SwapEngine: aplica troca ───────────────────────────
        # JS: sketchup.apply_swap(entity_id, variant_id)
        # Resposta: window.onSwapApplied(result)
        @main_panel.add_action_callback('apply_swap') do |_ctx, entity_id, variant_id|
          begin
            ent     = find_entity_anywhere(entity_id.to_i)
            payload = ::Ornato::Tools::SelectionResolver.resolve(ent)
            payload = payload.merge(_entity: ent)
            result  = ::Ornato::Constructor::SwapEngine.apply_swap(payload, variant_id)
            @main_panel.execute_script(
              "window.onSwapApplied && window.onSwapApplied(#{JSON.generate(result)})"
            )
          rescue => e
            puts "Ornato apply_swap ERRO: #{e.message}"
            @main_panel.execute_script(
              "window.onSwapApplied && window.onSwapApplied(#{JSON.generate({ ok: false, error: e.message })})"
            )
          end
        end

        # ── Machining: get piece data for drawer ───────────────
        @main_panel.add_action_callback('get_module_machining') do |_ctx, opts_json|
          begin
            opts       = JSON.parse(opts_json.to_s)
            entity_id  = opts['entity_id'].to_i
            group      = find_group_by_id(entity_id)
            unless group
              @main_panel.execute_script("window.setModuleMachining(#{JSON.generate({ pieces: [], ops: [], collisions: { collisions: [], stats: {} } })})")
              next
            end

            payload = build_machining_pieces_data(group)
            # Backward-compat: build_machining_pieces_data agora retorna Hash
            # { pieces:, ops:, collisions: } — mas pode ser apenas Array por
            # caminhos legados/erro. Normaliza aqui.
            if payload.is_a?(Hash)
              out = {
                pieces:     payload[:pieces]     || [],
                ops:        payload[:ops]        || [],
                collisions: payload[:collisions] || { collisions: [], stats: {} },
              }
            else
              out = { pieces: payload || [], ops: [], collisions: { collisions: [], stats: {} } }
            end
            @main_panel.execute_script(
              "window.setModuleMachining(#{JSON.generate(out)})"
            )
          rescue => e
            puts "Ornato get_module_machining ERRO: #{e.message}"
          end
        end

        # ── Machining: add extra op to a piece ────────────────
        @main_panel.add_action_callback('add_machining_op') do |_ctx, opts_json|
          begin
            opts      = JSON.parse(opts_json.to_s)
            entity_id = opts['entity_id'].to_i
            piece_id  = opts['piece_id'].to_s
            op        = opts['op'] || {}

            group = find_group_by_id(entity_id)
            next unless group

            piece_ent = find_piece_by_persistent_id(group, piece_id)
            next unless piece_ent

            existing = JSON.parse(piece_ent.get_attribute('Ornato', 'usinagens_extra', '[]') || '[]')
            existing << op
            piece_ent.set_attribute('Ornato', 'usinagens_extra', JSON.generate(existing))

            @main_panel.execute_script(
              "window.onMachOpAdded('#{piece_id}', #{JSON.generate(existing)})"
            )
            panel_status("Usinagem '#{op['tipo']}' adicionada")
          rescue => e
            puts "Ornato add_machining_op ERRO: #{e.message}"
          end
        end

        # ── Machining: remove extra op from a piece ───────────
        @main_panel.add_action_callback('remove_machining_op') do |_ctx, opts_json|
          begin
            opts      = JSON.parse(opts_json.to_s)
            entity_id = opts['entity_id'].to_i
            piece_id  = opts['piece_id'].to_s
            op_index  = opts['op_index'].to_i

            group = find_group_by_id(entity_id)
            next unless group

            piece_ent = find_piece_by_persistent_id(group, piece_id)
            next unless piece_ent

            existing = JSON.parse(piece_ent.get_attribute('Ornato', 'usinagens_extra', '[]') || '[]')
            existing.delete_at(op_index)
            piece_ent.set_attribute('Ornato', 'usinagens_extra', JSON.generate(existing))

            @main_panel.execute_script(
              "window.onMachOpRemoved('#{piece_id}', #{JSON.generate(existing)})"
            )
            panel_status('Usinagem removida')
          rescue => e
            puts "Ornato remove_machining_op ERRO: #{e.message}"
          end
        end

        # ── Update channel: get/set (Sprint A3) ───────────────
        @main_panel.add_action_callback('get_update_channel') do |_ctx|
          begin
            require_relative '../updater/auto_updater' unless defined?(Ornato::AutoUpdater)
            ch = Ornato::AutoUpdater.current_channel
            @main_panel.execute_script("window.onUpdateChannel && window.onUpdateChannel(#{{ channel: ch }.to_json})")
          rescue => e
            puts "Ornato get_update_channel ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('set_update_channel') do |_ctx, channel|
          begin
            require_relative '../updater/auto_updater' unless defined?(Ornato::AutoUpdater)
            ch = Ornato::AutoUpdater.set_channel(channel.to_s)
            @main_panel.execute_script("window.onUpdateChannelSet && window.onUpdateChannelSet(#{{ ok: true, channel: ch }.to_json})")
          rescue ArgumentError => e
            @main_panel.execute_script("window.onUpdateChannelSet && window.onUpdateChannelSet(#{{ ok: false, error: e.message }.to_json})")
          rescue => e
            puts "Ornato set_update_channel ERRO: #{e.message}"
          end
        end

        # ── Telemetria opt-in (Sprint A3 / C1) ───────────────────
        # JS:  sketchup.set_telemetry_enabled(true|false)
        # JS:  sketchup.get_telemetry_enabled()
        @main_panel.add_action_callback('set_telemetry_enabled') do |_ctx, enabled|
          begin
            require_relative '../updater/auto_updater' unless defined?(Ornato::AutoUpdater)
            flag = Ornato::AutoUpdater.set_telemetry_enabled(enabled)
            payload = { ok: true, enabled: flag }.to_json
            @main_panel.execute_script("window.onTelemetrySet && window.onTelemetrySet(#{payload})")
          rescue => e
            puts "Ornato set_telemetry_enabled ERRO: #{e.message}"
            err = { ok: false, error: e.message }.to_json
            @main_panel.execute_script("window.onTelemetrySet && window.onTelemetrySet(#{err})")
          end
        end

        @main_panel.add_action_callback('get_telemetry_enabled') do |_ctx|
          begin
            require_relative '../updater/auto_updater' unless defined?(Ornato::AutoUpdater)
            payload = {
              enabled: Ornato::AutoUpdater.telemetry_enabled?,
              decided: Ornato::AutoUpdater.telemetry_decided?,
              last_sent_at: Ornato::AutoUpdater.last_telemetry_at,
            }.to_json
            @main_panel.execute_script("window.onTelemetry && window.onTelemetry(#{payload})")
          rescue => e
            puts "Ornato get_telemetry_enabled ERRO: #{e.message}"
          end
        end

        # JS: sketchup.get_telemetry_status() — payload completo (enabled, decided, last_sent_at)
        @main_panel.add_action_callback('get_telemetry_status') do |_ctx|
          begin
            require_relative '../updater/auto_updater' unless defined?(Ornato::AutoUpdater)
            payload = {
              enabled:      Ornato::AutoUpdater.telemetry_enabled?,
              decided:      Ornato::AutoUpdater.telemetry_decided?,
              last_sent_at: Ornato::AutoUpdater.last_telemetry_at,
            }.to_json
            @main_panel.execute_script("window.onTelemetryStatus && window.onTelemetryStatus(#{payload})")
          rescue => e
            puts "Ornato get_telemetry_status ERRO: #{e.message}"
          end
        end

        # JS: sketchup.mark_telemetry_decision(true|false) — fluxo first-run alternativo (UI v2)
        @main_panel.add_action_callback('mark_telemetry_decision') do |_ctx, enabled|
          begin
            require_relative '../updater/auto_updater' unless defined?(Ornato::AutoUpdater)
            flag = Ornato::AutoUpdater.mark_telemetry_decided(enabled)
            payload = { ok: true, enabled: flag, decided: true }.to_json
            @main_panel.execute_script("window.onTelemetryDecision && window.onTelemetryDecision(#{payload})")
          rescue => e
            puts "Ornato mark_telemetry_decision ERRO: #{e.message}"
            err = { ok: false, error: e.message }.to_json
            @main_panel.execute_script("window.onTelemetryDecision && window.onTelemetryDecision(#{err})")
          end
        end

        # ── Compat violation: dev/admin reset (Sprint A3 / C2) ───
        @main_panel.add_action_callback('clear_compat_violation') do |_ctx|
          begin
            require_relative '../updater/auto_updater' unless defined?(Ornato::AutoUpdater)
            Ornato::AutoUpdater.clear_compat_violation
            payload = { ok: true }.to_json
            @main_panel.execute_script("window.onCompatCleared && window.onCompatCleared(#{payload})")
            panel_status('compat_violation limpa — reinicie o SketchUp')
          rescue => e
            puts "Ornato clear_compat_violation ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('get_compat_violation') do |_ctx|
          begin
            require_relative '../updater/auto_updater' unless defined?(Ornato::AutoUpdater)
            cv = Ornato::AutoUpdater.compat_violation
            payload = { violation: cv }.to_json
            @main_panel.execute_script("window.onCompatViolation && window.onCompatViolation(#{payload})")
          rescue => e
            puts "Ornato get_compat_violation ERRO: #{e.message}"
          end
        end

        # ── Cloud library toggle (opt-in v1) ──────────────────────
        # JS:  sketchup.set_cloud_library(true)  // ou false
        # JS:  sketchup.get_cloud_library()      // → window.onCloudLibrary({enabled: bool})
        @main_panel.add_action_callback('set_cloud_library') do |_ctx, enabled|
          begin
            flag = (enabled == true || enabled.to_s == 'true')
            Sketchup.write_default('Ornato', 'cloud_library_enabled', flag)
            @main_panel.execute_script("window.onCloudLibrarySet && window.onCloudLibrarySet(#{{ ok: true, enabled: flag }.to_json})")
          rescue => e
            puts "Ornato set_cloud_library ERRO: #{e.message}"
            @main_panel.execute_script("window.onCloudLibrarySet && window.onCloudLibrarySet(#{{ ok: false, error: e.message }.to_json})")
          end
        end

        @main_panel.add_action_callback('get_cloud_library') do |_ctx|
          begin
            flag = !!Sketchup.read_default('Ornato', 'cloud_library_enabled', false)
            @main_panel.execute_script("window.onCloudLibrary && window.onCloudLibrary(#{{ enabled: flag }.to_json})")
          rescue => e
            puts "Ornato get_cloud_library ERRO: #{e.message}"
          end
        end

        # ── Validação v2: ValidationRunner + central de issues ──
        @main_panel.add_action_callback('run_validation') do |_ctx, _arg|
          begin
            runner = Ornato::Validation::ValidationRunner.new(Sketchup.active_model)
            report = runner.run
            @main_panel.execute_script("window.setValidationReport && window.setValidationReport(#{report.to_json})")
          rescue => e
            puts "Ornato run_validation ERRO: #{e.message}"
            @main_panel.execute_script("window.setValidationReport && window.setValidationReport(#{ { error: e.message, issues: [] }.to_json })")
          end
        end

        @main_panel.add_action_callback('select_entity_in_model') do |_ctx, arg|
          begin
            payload = arg.is_a?(String) ? (JSON.parse(arg) rescue {}) : (arg || {})
            eid = payload['entity_id'].to_i
            model = Sketchup.active_model
            target = nil
            if model && eid > 0
              walker = lambda do |coll|
                coll.each do |e|
                  target ||= e if e.respond_to?(:entityID) && e.entityID == eid
                  return if target
                  walker.call(e.entities) if e.respond_to?(:entities)
                end
              end
              walker.call(model.active_entities)
              if target
                model.selection.clear
                model.selection.add(target)
                model.active_view.zoom(target) rescue nil
              end
            end
            @main_panel.execute_script("window.onEntitySelected && window.onEntitySelected(#{ { ok: !!target, entity_id: eid }.to_json })")
          rescue => e
            puts "Ornato select_entity_in_model ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('auto_fix_issue') do |_ctx, arg|
          begin
            payload = arg.is_a?(String) ? (JSON.parse(arg) rescue {}) : (arg || {})
            eid    = payload['entity_id'].to_i
            action = payload['action'].to_s
            ap     = payload['payload'] || {}
            model  = Sketchup.active_model

            target = nil
            if model && eid > 0
              walker = lambda do |coll|
                coll.each do |e|
                  target ||= e if e.respond_to?(:entityID) && e.entityID == eid
                  return if target
                  walker.call(e.entities) if e.respond_to?(:entities)
                end
              end
              walker.call(model.active_entities)
            end

            result = if target
                       model.start_operation("Ornato: Auto-fix #{action}", true)
                       begin
                         case action
                         when 'apply_default_material'
                           target.set_attribute('Ornato', 'material', (ap['material'] || 'MDF18_BrancoTX').to_s)
                         when 'apply_default_hardware'
                           target.set_attribute('Ornato', '_aggregate_hardware', true)
                           target.set_attribute('Ornato', 'hardware_rule', (ap['rule'] || 'pino_metalico').to_s)
                         when 'remove_duplicate_drilling'
                           target.set_attribute('Ornato', '_drilling_dedupe_requested', true)
                         when 'cache_module_offline'
                           target.set_attribute('Ornato', '_offline_cache_requested', true)
                         else
                           model.abort_operation
                           next { ok: false, error: "unknown_action:#{action}" }
                         end
                         model.commit_operation
                         { ok: true, action: action, entity_id: eid }
                       rescue => fix_e
                         model.abort_operation
                         { ok: false, error: fix_e.message }
                       end
                     else
                       { ok: false, error: 'entity_not_found' }
                     end
            @main_panel.execute_script("window.onAutoFixDone && window.onAutoFixDone(#{result.to_json})")
          rescue => e
            puts "Ornato auto_fix_issue ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('ignore_validation_issue') do |_ctx, arg|
          begin
            payload  = arg.is_a?(String) ? (JSON.parse(arg) rescue {}) : (arg || {})
            issue_id = payload['issue_id'].to_s
            reason   = (payload['reason'] || '').to_s
            model    = Sketchup.active_model

            result = if model && !issue_id.empty?
                       raw  = model.get_attribute('Ornato', 'validation_ignores', nil)
                       list = if raw.is_a?(String) then (JSON.parse(raw) rescue [])
                              elsif raw.is_a?(Array) then raw
                              else [] end
                       list.reject! { |e| (e['id'] || e[:id]) == issue_id }
                       token = "ign_#{Time.now.to_i}_#{issue_id.hash.abs}"
                       list << { 'id' => issue_id, 'reason' => reason, 'token' => token,
                                 'at' => Time.now.to_i, 'by' => ENV['USER'] || 'unknown' }
                       model.set_attribute('Ornato', 'validation_ignores', list.to_json)
                       { ok: true, token: token, id: issue_id }
                     else
                       { ok: false, error: 'missing_id_or_model' }
                     end
            @main_panel.execute_script("window.onIssueIgnored && window.onIssueIgnored(#{result.to_json})")
          rescue => e
            puts "Ornato ignore_validation_issue ERRO: #{e.message}"
          end
        end

        @main_panel.add_action_callback('get_ignored_issues') do |_ctx, _arg|
          begin
            model = Sketchup.active_model
            list = []
            if model
              raw  = model.get_attribute('Ornato', 'validation_ignores', nil)
              list = if raw.is_a?(String) then (JSON.parse(raw) rescue [])
                     elsif raw.is_a?(Array) then raw
                     else [] end
            end
            @main_panel.execute_script("window.setIgnoredIssues && window.setIgnoredIssues(#{ { ignored: list }.to_json })")
          rescue => e
            puts "Ornato get_ignored_issues ERRO: #{e.message}"
          end
        end

        # ── UX-2: Sistema de Miras (amarela / verde / vermelha) ──────────
        # UI v2 chama: window.sketchup.start_mira('amarela'|'verde'|'vermelha')
        @main_panel.add_action_callback('start_mira') do |_ctx, cor|
          begin
            unless defined?(Tools::MiraTool)
              panel_status('MiraTool indisponivel')
              next
            end
            sym = cor.to_s.downcase.to_sym
            tool = Tools::MiraTool.new(sym, controller: self)
            Sketchup.active_model.select_tool(tool)
            panel_status("Mira #{sym} ativada | ESC cancela")
          rescue ArgumentError => e
            panel_status("Cor de mira invalida: #{cor} (#{e.message})")
          rescue => e
            puts "Ornato start_mira ERRO: #{e.message}"
          end
        end

        # Soft-delete (oculta entidade sem apagar). Reversível via restore_hidden_entity.
        @main_panel.add_action_callback('soft_remove_entity') do |_ctx, entity_id|
          begin
            ent = find_entity_anywhere(entity_id.to_i)
            unless ent
              panel_status("Entidade #{entity_id} nao encontrada")
              next
            end
            Sketchup.active_model.start_operation('Ocultar entidade', true)
            ent.set_attribute('Ornato', 'hidden', true) if ent.respond_to?(:set_attribute)
            ent.hidden = true if ent.respond_to?(:hidden=)
            Sketchup.active_model.commit_operation
            panel_status("Entidade ocultada (id=#{entity_id})")
          rescue => e
            Sketchup.active_model.abort_operation rescue nil
            puts "Ornato soft_remove_entity ERRO: #{e.message}"
          end
        end

        # Restaura entidade ocultada por soft_remove_entity.
        @main_panel.add_action_callback('restore_hidden_entity') do |_ctx, entity_id|
          begin
            ent = find_entity_anywhere(entity_id.to_i)
            unless ent
              panel_status("Entidade #{entity_id} nao encontrada")
              next
            end
            Sketchup.active_model.start_operation('Restaurar entidade', true)
            ent.set_attribute('Ornato', 'hidden', false) if ent.respond_to?(:set_attribute)
            ent.hidden = false if ent.respond_to?(:hidden=)
            Sketchup.active_model.commit_operation
            panel_status("Entidade restaurada (id=#{entity_id})")
          rescue => e
            Sketchup.active_model.abort_operation rescue nil
            puts "Ornato restore_hidden_entity ERRO: #{e.message}"
          end
        end

        # ── ComponentEditor (UX-4): acoes editaveis atomicas ───
        # Cada callback dispara Ornato::Constructor::ComponentEditor.<acao>
        # e envia o resultado para a UI via:
        #   window.onComponentEdit({ action:, ok:, ...meta })
        # JS dispara via: sketchup.edit_turn_grain(entityId),
        #                 sketchup.edit_change_material(entityId, 'MDF18_Cinza'), etc.
        component_editor_actions = {
          'edit_turn_grain'       => ->(args) { ::Ornato::Constructor::ComponentEditor.turn_grain(args[0].to_i) },
          'edit_rotate_piece'     => ->(args) { ::Ornato::Constructor::ComponentEditor.rotate_piece(args[0].to_i, args[1].to_i) },
          'edit_transfer_props'   => ->(args) { ::Ornato::Constructor::ComponentEditor.transfer_props(args[0].to_i, args[1].to_i) },
          'edit_hide_temporary'   => ->(args) { ::Ornato::Constructor::ComponentEditor.hide_temporary(args[0].to_i) },
          'edit_unhide'           => ->(args) { ::Ornato::Constructor::ComponentEditor.unhide(args[0].to_i) },
          'edit_unhide_all'       => ->(_args) { ::Ornato::Constructor::ComponentEditor.unhide_all },
          'edit_duplicate_entity' => ->(args) { ::Ornato::Constructor::ComponentEditor.duplicate(args[0].to_i, (args[1] || 50).to_f) },
          'edit_change_material'  => ->(args) { ::Ornato::Constructor::ComponentEditor.change_material(args[0].to_i, args[1].to_s) },
          'edit_change_thickness' => ->(args) { ::Ornato::Constructor::ComponentEditor.change_thickness(args[0].to_i, args[1].to_f) },
          'edit_change_edges'     => ->(args) { ::Ornato::Constructor::ComponentEditor.change_edges(args[0].to_i, args[1]) }
        }
        component_editor_actions.each do |action_name, fn|
          @main_panel.add_action_callback(action_name) do |_ctx, *args|
            begin
              result  = fn.call(args)
              payload = result.is_a?(Hash) ? result.merge(action: action_name) :
                                             { ok: false, action: action_name, error: 'resultado invalido' }
              @main_panel.execute_script(
                "window.onComponentEdit && window.onComponentEdit(#{JSON.generate(payload)})"
              )
            rescue => e
              puts "Ornato #{action_name} ERRO: #{e.message}"
              err = { ok: false, action: action_name, error: e.message }
              @main_panel.execute_script(
                "window.onComponentEdit && window.onComponentEdit(#{JSON.generate(err)})"
              )
            end
          end
        end

        # ── UI v2 · Biblioteca: insere módulo via JSON definition ──
        # JS: window.sketchup.insert_module_from_library(JSON.stringify({ module_id: 'balcao_2_portas' }))
        # Cliente ack opcional: window.onLibraryModuleInserted({ ok, module_id, entity_id, error })
        @main_panel.add_action_callback('insert_module_from_library') do |_ctx, payload|
          ack = { ok: false, module_id: nil, entity_id: nil, error: nil }
          begin
            data = begin
              JSON.parse(payload.to_s)
            rescue
              {}
            end
            module_id = (data['module_id'] || data[:module_id]).to_s
            ack[:module_id] = module_id

            if module_id.empty?
              ack[:error] = 'module_id ausente'
            elsif defined?(Library::JsonModuleBuilder)
              group = Library::JsonModuleBuilder.create_from_json(module_id, {})
              if group
                ack[:ok] = true
                ack[:entity_id] = group.entityID
                if defined?(Ornato::Logger)
                  Ornato::Logger.info("Biblioteca: inserido #{module_id}",
                                      context: { entity_id: group.entityID })
                end
                panel_status("Módulo inserido: #{module_id}")
                push_model_summary_to_panel if respond_to?(:push_model_summary_to_panel, true)
              else
                ack[:error] = "Módulo '#{module_id}' não encontrado na biblioteca"
                panel_status(ack[:error])
              end
            else
              ack[:error] = 'JsonModuleBuilder indisponível'
            end
          rescue => e
            ack[:error] = e.message
            puts "Ornato insert_module_from_library ERRO: #{e.message}"
          end

          begin
            js = "typeof window.onLibraryModuleInserted==='function' && " \
                 "window.onLibraryModuleInserted(#{JSON.generate(ack)});"
            @main_panel.execute_script(js) if @main_panel && @main_panel.visible?
          rescue => e
            puts "Ornato insert_module_from_library ack ERRO: #{e.message}"
          end
        end
      end

      # ── Machining helper: build pieces data array ──────────
      # Uses MachiningInterpreter (declarative, role-based) when the
      # module has stored ferragens_auto. Falls back to hardware_tags
      # for older groups that don't have ferragens_auto.
      def build_machining_pieces_data(module_group)
        # ── 1. Collect piece entity data ──────────────────────────
        raw_pieces = []

        module_group.entities.each do |ent|
          next unless ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)

          bb = ent.bounds
          next if bb.empty?

          role_sym = if defined?(Core::RoleNormalizer)
            Core::RoleNormalizer.from_entity(ent)
          else
            raw = ent.get_attribute('Ornato', 'role', nil) ||
                  ent.get_attribute('ornato', 'role', nil) || 'generic'
            raw.to_sym
          end

          pid = ent.get_attribute('Ornato', 'persistent_id', nil) ||
                "piece_#{ent.entityID}"

          # Dimensions — prefer stored attribute, fallback to bbox
          dims_raw = ent.get_attribute('Ornato', 'dimensions', nil)
          dims = if dims_raw
            begin JSON.parse(dims_raw) rescue {} end
          else
            sorted = [bb.width.to_mm, bb.height.to_mm, bb.depth.to_mm].sort
            { 'largura' => sorted[2].round(1), 'altura' => sorted[1].round(1), 'espessura' => sorted[0].round(1) }
          end

          # Origin (bounding box min in mm)
          origin = [bb.min.x.to_mm, bb.min.y.to_mm, bb.min.z.to_mm]

          # Extra ops stored by user
          extra_ops = []
          extra_raw = ent.get_attribute('Ornato', 'usinagens_extra', nil)
          if extra_raw
            begin; extra_ops = JSON.parse(extra_raw); rescue; end
          end

          compatible = if defined?(Core::RoleNormalizer)
            Core::RoleNormalizer.compatible_extras(role_sym)
          else
            []
          end

          raw_pieces << {
            entity:            ent,
            id:                pid,
            name:              ent.name.empty? ? role_sym.to_s.capitalize : ent.name,
            role:              role_sym,
            dims:              dims,        # { 'largura', 'altura', 'espessura' }
            origin:            origin,
            extra_ops:         extra_ops,
            compatible_extras: compatible,
          }
        end

        return { pieces: [], ops: [], collisions: { collisions: [], stats: {} } } if raw_pieces.empty?

        # ── 2. Run MachiningInterpreter if ferragens_auto is stored ──
        interpreter_workers = {}

        ferragens_raw = module_group.get_attribute('Ornato', 'ferragens_auto', nil)
        params_raw    = module_group.get_attribute('Ornato', 'ferragens_auto_params', nil) ||
                        module_group.get_attribute('Ornato', 'params', nil)

        if ferragens_raw && defined?(Machining::MachiningInterpreter)
          begin
            ferragens_auto = JSON.parse(ferragens_raw)
            params         = params_raw ? JSON.parse(params_raw) : {}
            shop_config    = if defined?(Hardware::ShopConfig)
              Hardware::ShopConfig.for_group(module_group)
            else
              {}
            end

            # Build pieces_data format for interpreter ({ id:, role:, dims: {w,h,t}, origin: })
            pieces_for_interp = raw_pieces.map do |rp|
              d = rp[:dims]
              {
                id:     rp[:id],
                role:   rp[:role],
                origin: rp[:origin],
                dims:   {
                  w: (d['largura']   || d[:largura]   || 0).to_f,
                  h: (d['altura']    || d[:altura]    || 0).to_f,
                  t: (d['espessura'] || d[:espessura] || 18).to_f,
                },
              }
            end

            interpreter = Machining::MachiningInterpreter.new(shop_config, params)
            interpreter_workers = interpreter.interpret(ferragens_auto, pieces_for_interp)
          rescue => e
            puts "Ornato build_machining_pieces_data: interpreter error: #{e.message}"
            puts e.backtrace.first(3).join("\n")
          end
        end

        # ── 2b. Hook ferragens 3D (preserve_drillings) ──────────
        # Mescla ops vindas de ComponentInstances carimbadas com
        # `Ornato.preserve_drillings == true` no hash de workers,
        # antes do payload chegar a MachiningJson#serialize (via
        # JsonExporter / RulesEngine).
        drilling_collisions = { collisions: [], stats: {} }
        if defined?(Machining::FerragemDrillingCollector)
          begin
            collector_out = Machining::FerragemDrillingCollector
                              .new(module_group).collect
            collector_out.each do |pid, extra_ops|
              if pid == :_drilling_collisions
                drilling_collisions = extra_ops || drilling_collisions
                next
              end
              interpreter_workers[pid] ||= {}
              base_idx = interpreter_workers[pid].is_a?(Hash) ? interpreter_workers[pid].size : 0
              extra_ops.each_with_index do |op, i|
                interpreter_workers[pid]["ferragem_3d_#{base_idx + i}"] = op
              end
            end
          rescue => e
            puts "Ornato build_machining_pieces_data: ferragem 3D collector error: #{e.message}"
            puts e.backtrace.first(3).join("\n")
          end
        end

        # ── 3. Assemble final pieces array for UI ─────────────────
        piece_name_by_id = {}
        pieces_payload = raw_pieces.map do |rp|
          pid = rp[:id]
          piece_name_by_id[pid] = rp[:name]

          # Structural ops: from MachiningInterpreter output
          struct_ops = if interpreter_workers.key?(pid)
            derive_struct_op_labels(interpreter_workers[pid])
          else
            # Fallback: read from hardware_tags attribute (legacy)
            hardware_tags_to_op_labels(rp[:entity], rp[:role].to_s)
          end

          {
            id:                pid,
            name:              rp[:name],
            role:              rp[:role].to_s,
            dims:              rp[:dims],
            structural_ops:    struct_ops,
            extra_ops:         rp[:extra_ops],
            compatible_extras: rp[:compatible_extras],
          }
        end

        # ── 4. Flat ops array (for Usinagens tab) ─────────────────
        ops_flat = []
        interpreter_workers.each do |pid, workers|
          next unless workers.is_a?(Hash)
          pname = piece_name_by_id[pid] || pid.to_s
          workers.each do |op_key, op|
            next unless op.is_a?(Hash)
            ops_flat << {
              op_id:       op_key.to_s,
              peca_id:     pid,
              peca_name:   pname,
              category:    (op['category']    || op[:category]    || 'hole').to_s,
              tipo_ornato: (op['tipo_ornato'] || op[:tipo_ornato] ||
                            op['description'] || op[:description] || '').to_s,
              diameter:    (op['diameter']    || op[:diameter]    || op['diametro'] || 0).to_f,
              depth:       (op['depth']       || op[:depth]       || op['profundidade'] || 0).to_f,
              side:        (op['side']        || op[:side]        || '').to_s,
              x_mm:        (op['position_x']  || op[:position_x]  || op[:x_mm] || 0).to_f,
              y_mm:        (op['position_y']  || op[:position_y]  || op[:y_mm] || 0).to_f,
              tool_code:   (op['tool_code']   || op[:tool_code]   || '').to_s,
            }
          end
        end

        {
          pieces:     pieces_payload,
          ops:        ops_flat,
          collisions: drilling_collisions,
        }
      end

      # Convert MachiningInterpreter workers hash → distinct display labels
      def derive_struct_op_labels(workers)
        labels = Set.new

        workers.each_value do |op|
          next unless op.is_a?(Hash)

          desc  = (op['description'] || '').downcase
          tool  = (op['tool_code']   || '').downcase
          cat   = (op['category']    || '').downcase

          if tool.include?('35mm') || desc.include?('dobradica') || desc.include?('cup boring')
            labels << 'Dobradiça'
          elsif desc.include?('sistema 32') || desc.include?('system 32')
            labels << 'Sistema 32'
          elsif desc.include?('minifix')
            labels << 'Minifix'
          elsif desc.include?('confirmat')
            labels << 'Confirmat'
          elsif desc.include?('cavilha') || desc.include?('dowel')
            labels << 'Cavilha'
          elsif desc.include?('puxador') || desc.include?('handle')
            labels << 'Puxador'
          elsif desc.include?('corredica') || desc.include?('slide')
            labels << 'Corrediça'
          elsif desc.include?('fundo') || cat == 'transfer_vertical_saw_cut' || cat == 'transfer_horizontal_saw_cut'
            labels << 'Rasgo Fundo'
          elsif desc.include?('led')
            labels << 'Canal LED'
          elsif desc.include?('pistao') || desc.include?('gas')
            labels << 'Pistão'
          elsif desc.include?('passagem')
            labels << 'Passagem'
          end
        end

        labels.to_a
      end

      # Legacy fallback: derive display labels from hardware_tags attribute
      def hardware_tags_to_op_labels(ent, role)
        return [] unless ent
        labels = []

        tags_raw = ent.get_attribute('Ornato', 'hardware_tags', nil)
        return labels unless tags_raw

        begin
          tags = JSON.parse(tags_raw)
          labels << 'Sistema 32'  if tags['system32']
          labels << 'Rasgo Fundo' if tags['back_groove']
          labels << 'Minifix'     if tags['joints'] == 'minifix'
          labels << 'Confirmat'   if tags['joints'] == 'confirmat'
          labels << 'Cavilha'     if tags['joints'] == 'dowel'
          labels << 'Dobradiça'   if tags['hinges']
          labels << 'Puxador'     if tags['handle']
          labels << 'Corrediça'   if tags['drawer_slide']
        rescue; end

        labels
      end

      def find_group_by_id(entity_id)
        Sketchup.active_model.active_entities.find do |e|
          (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
            e.entityID == entity_id
        end
      end

      def find_piece_by_persistent_id(module_group, pid)
        module_group.entities.find do |e|
          next false unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
          pers = e.get_attribute('Ornato', 'persistent_id', nil) || "piece_#{e.entityID}"
          pers == pid
        end
      end

      # Busca entidade por entityID em todo o modelo (incluindo dentro de grupos).
      # Usado pelos callbacks da UI v2 que recebem id arbitrário (peça, ferragem ou agregado).
      def find_entity_anywhere(entity_id, scope = nil)
        scope ||= Sketchup.active_model.active_entities
        scope.each do |e|
          if e.respond_to?(:entityID) && e.entityID == entity_id
            return e
          end
          if e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
            child_ents = e.is_a?(Sketchup::Group) ? e.entities : e.definition.entities
            found = find_entity_anywhere(entity_id, child_ents)
            return found if found
          end
        end
        nil
      end

      # ── UI v2 Inspector: builders de detalhes ─────────────

      def build_v2_module_details(group)
        params = begin
          JSON.parse(group.get_attribute('Ornato', 'params') || '{}')
        rescue
          {}
        end
        ferragens_auto = begin
          JSON.parse(group.get_attribute('Ornato', 'ferragens_auto') || '[]')
        rescue
          []
        end
        agregados = begin
          JSON.parse(group.get_attribute('Ornato', 'agregados') || '[]')
        rescue
          []
        end

        # Conta ferragens por tipo (regra)
        ferr_counts = ferragens_auto.each_with_object(Hash.new(0)) do |f, h|
          tipo = (f.is_a?(Hash) ? (f['regra'] || f['tipo']) : nil) || 'desconhecida'
          qtd = (f.is_a?(Hash) && f['qtd']) ? f['qtd'].to_i : 1
          h[tipo] += qtd
        end

        # Filhos com tipo=ferragem ou agregado
        children = []
        group.entities.each do |e|
          next unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
          tipo = e.get_attribute('Ornato', 'tipo', nil)
          next unless %w[ferragem agregado peca].include?(tipo.to_s)
          children << {
            entity_id: e.entityID.to_s,
            tipo:      tipo,
            name:      (e.respond_to?(:name) ? e.name : nil),
            role:      e.get_attribute('Ornato', 'role', nil),
            aggregate_id: e.get_attribute('Ornato', 'aggregate_id', nil),
            bay_id:    e.get_attribute('Ornato', 'bay_id', nil),
          }
        end

        snapshot = group.get_attribute('Ornato', 'shop_config_snapshot', nil)
        profile_label = nil
        version_label = nil
        if snapshot
          begin
            sn = JSON.parse(snapshot)
            profile_label = sn['profile']
            version_label = sn['version']
          rescue
          end
        end

        {
          ok:           true,
          entity_id:    group.entityID.to_s,
          name:         (group.respond_to?(:name) ? group.name : 'Módulo'),
          module_type:  group.get_attribute('Ornato', 'module_type') || '',
          params:       params,
          ferragens_counts: ferr_counts,
          ferragens_total:  ferr_counts.values.inject(0, :+),
          agregados_count:  agregados.respond_to?(:size) ? agregados.size : 0,
          children:     children,
          shop_profile: profile_label,
          shop_version: version_label,
        }
      end

      def build_v2_piece_details(piece)
        role = if defined?(Core::RoleNormalizer)
          Core::RoleNormalizer.from_entity(piece).to_s
        else
          (piece.get_attribute('Ornato', 'role', nil) ||
           piece.get_attribute('ornato', 'role', nil) || 'generic').to_s
        end

        dims_raw = piece.get_attribute('Ornato', 'dimensions', nil)
        dims = if dims_raw
          (begin; JSON.parse(dims_raw); rescue; {}; end)
        else
          bb = piece.bounds
          if bb && !bb.empty?
            sorted = [bb.width.to_mm, bb.height.to_mm, bb.depth.to_mm].sort
            { 'largura' => sorted[2].round(1), 'altura' => sorted[1].round(1), 'espessura' => sorted[0].round(1) }
          else
            {}
          end
        end

        material = piece.get_attribute('Ornato', 'material', nil) ||
                   (piece.respond_to?(:material) && piece.material ? piece.material.name : nil)
        bordas   = piece.get_attribute('Ornato', 'bordas', nil)
        bordas_h = bordas.is_a?(String) ? (begin; JSON.parse(bordas); rescue; bordas; end) : bordas

        extra_ops = begin
          JSON.parse(piece.get_attribute('Ornato', 'usinagens_extra', '[]') || '[]')
        rescue
          []
        end

        bb = piece.bounds
        origin = bb && !bb.empty? ? [bb.min.x.to_mm.round(1), bb.min.y.to_mm.round(1), bb.min.z.to_mm.round(1)] : nil

        {
          ok:        true,
          entity_id: piece.entityID.to_s,
          name:      (piece.respond_to?(:name) && !piece.name.to_s.empty? ? piece.name : role),
          role:      role,
          dims:      dims,
          material:  material,
          bordas:    bordas_h,
          origin:    origin,
          extra_ops: extra_ops,
          persistent_id: piece.get_attribute('Ornato', 'persistent_id', nil),
        }
      end

      def build_v2_aggregate_details(aggr)
        params = begin
          JSON.parse(aggr.get_attribute('Ornato', 'params') || '{}')
        rescue
          {}
        end
        bb = aggr.bounds
        bay_dims = bb && !bb.empty? ? {
          w: bb.width.to_mm.round(1),
          h: bb.height.to_mm.round(1),
          d: bb.depth.to_mm.round(1),
        } : nil

        {
          ok:           true,
          entity_id:    aggr.entityID.to_s,
          aggregate_id: aggr.get_attribute('Ornato', 'aggregate_id', nil),
          bay_id:       aggr.get_attribute('Ornato', 'bay_id', nil),
          name:         (aggr.respond_to?(:name) ? aggr.name : nil),
          params:       params,
          bay_dims:     bay_dims,
        }
      end

      # Collect all Ornato module groups
      def collect_ornato_groups_from_model
        model = Sketchup.active_model
        return [] unless model
        model.active_entities.select do |e|
          (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
            (e.get_attribute('Ornato', 'module_type') || e.get_attribute('Ornato', 'params'))
        end
      end

      # Push library modules to the panel
      def push_library_to_panel
        return unless @main_panel && @main_panel.visible?

        bib_dir = File.join(PLUGIN_DIR, 'biblioteca', 'moveis')
        modules = []

        if File.directory?(bib_dir)
          Dir.glob(File.join(bib_dir, '**', '*.json')).sort.each do |f|
            begin
              raw  = JSON.parse(File.read(f, encoding: 'utf-8'))
              id   = raw['id'] || File.basename(f, '.json')
              modules << {
                'id'         => id,
                'nome'       => raw['nome'] || id,
                'categoria'  => raw['categoria'] || 'geral',
                'descricao'  => raw['descricao'] || '',
                'tipo_ruby'  => raw['tipo_ruby'] || id,
                'parametros' => raw['parametros'] || {},
              }
            rescue => e
              puts "Ornato push_library: skip #{f}: #{e.message}"
            end
          end
        end

        # Also try to enrich from API (non-blocking, best-effort)
        begin
          config  = Config.load
          api_url = config.dig(:api, :url) || 'http://localhost:3001'
          uri     = URI("#{api_url}/api/plugin/biblioteca/moveis")
          http    = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == 'https')
          http.open_timeout = 2
          http.read_timeout = 3
          req     = Net::HTTP::Get.new(uri.request_uri)
          add_auth_header(req)
          resp    = http.request(req)
          if resp.code.to_i == 200
            api_mods = JSON.parse(resp.body)
            # Merge: API items take priority over local by id
            local_ids = modules.map { |m| m['id'] }.to_set
            api_mods.each do |m|
              next if local_ids.include?(m['id'] || m[:id])
              modules << {
                'id'         => (m['id'] || m[:id]).to_s,
                'nome'       => m['nome'] || m[:nome] || m['id'],
                'categoria'  => m['categoria'] || m[:categoria] || 'geral',
                'descricao'  => m['descricao'] || m[:descricao] || '',
                'tipo_ruby'  => m['tipo_ruby'] || m[:tipo_ruby] || m['id'],
                'parametros' => m['parametros'] || m[:parametros] || {},
              }
            end
          end
        rescue
          # API unavailable — use local only
        end

        cats = modules.map { |m| m['categoria'] }.uniq.compact.map do |c|
          { 'id' => c, 'label' => cat_label(c) }
        end

        json = JSON.generate({ modules: modules, categories: cats })
        @main_panel.execute_script("typeof setLibraryModules==='function'&&setLibraryModules(#{json})")
      rescue => e
        puts "Ornato push_library_to_panel ERRO: #{e.message}"
      end

      # Push model stats + module list to the panel's Exportar tab
      def push_model_summary_to_panel
        return unless @main_panel && @main_panel.visible?
        groups = collect_ornato_groups_from_model
        total_pieces = 0
        total_area   = 0.0

        module_list = groups.map do |g|
          params = begin; JSON.parse(g.get_attribute('Ornato', 'params') || '{}', symbolize_names: true); rescue; {}; end
          pieces = g.entities.select { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
          total_pieces += pieces.length

          # Rough sheet area: sum of largest face on each piece (mm²)
          pieces.each do |p|
            bb = p.bounds
            w = bb.width.to_mm; h = bb.height.to_mm; d = bb.depth.to_mm
            areas = [w * d, w * h, d * h]
            total_area += (areas.max || 0)
          end

          {
            entity_id:   g.entityID.to_s,
            name:        g.respond_to?(:name) ? g.name : (g.get_attribute('Ornato', 'module_type') || 'Modulo'),
            module_type: g.get_attribute('Ornato', 'module_type') || '',
            categoria:   params[:categoria] || '',
            pieces:      pieces.length,
            largura:     params[:largura],
            altura:      params[:altura],
            profundidade:params[:profundidade],
            material:    params[:material],
          }
        end

        data = {
          modules:        groups.length,
          pieces:         total_pieces,
          sheet_area_mm2: total_area.round(0),         # already in mm²
          module_list:    module_list,
        }
        @main_panel.execute_script("typeof updateSummary==='function'&&updateSummary(#{data.to_json})")
      rescue => e
        puts "Ornato: push_model_summary_to_panel error: #{e.message}"
      end

      # Delete an Ornato group by its entityID string
      def delete_ornato_module_by_id(entity_id)
        model = Sketchup.active_model
        return unless model
        groups = collect_ornato_groups_from_model
        target = groups.find { |g| g.entityID.to_s == entity_id }
        return unless target
        model.start_operation('Ornato: Remover Modulo', true)
        target.erase!
        model.commit_operation
      rescue => e
        model&.abort_operation
        puts "Ornato: delete_ornato_module_by_id error: #{e.message}"
      end

      # ── Command Bus ──────────────────────────────────

      def handle_command(encoded)
        begin
          payload = JSON.parse(b64_decode(encoded), symbolize_names: true)
        rescue => e
          puts "Ornato: Failed to decode command: #{e.message}"
          return
        end

        id = payload[:id]
        command = payload[:command]
        params = payload[:params] || {}

        puts "Ornato CMD: #{command} (id:#{id})" if $VERBOSE

        handler = @commands[command]
        if handler
          begin
            result = handler.call(params)
            send_response(id, result)
          rescue => e
            puts "Ornato CMD error [#{command}]: #{e.message}"
            puts e.backtrace.first(3).join("\n")
            send_status("Erro: #{e.message}")
            send_response(id, nil)
          end
        else
          puts "Ornato: Unknown command '#{command}'"
          send_response(id, nil)
        end
      end

      def register_commands
        # ── Biblioteca ─────────────────────────────────
        @commands['biblioteca_list'] = ->(params) {
          config = Config.load
          api_url = config.dig(:api, :url) || 'http://localhost:3001'

          begin
            uri = URI("#{api_url}/api/plugin/biblioteca/moveis")
            http = Net::HTTP.new(uri.host, uri.port)
            http.use_ssl = (uri.scheme == 'https')
            http.open_timeout = 3
            http.read_timeout = 5
            req = Net::HTTP::Get.new(uri.request_uri)
            add_auth_header(req)
            response = http.request(req)
            if response.code.to_i == 401
              send_status('Sessao expirada — faca login novamente')
              return load_local_biblioteca
            end
            modules = JSON.parse(response.body, symbolize_names: true)

            cats = modules.map { |m| m[:categoria] }.compact.uniq.map { |c| { id: c, label: cat_label(c) } }

            { modules: modules, categories: cats }
          rescue => e
            puts "Ornato: Biblioteca fetch error: #{e.message}"
            load_local_biblioteca
          end
        }

        @commands['biblioteca_create'] = ->(params) {
          module_id = params[:module_id]
          tipo_ruby = params[:tipo_ruby] || ''
          mod_params = params[:params] || {}

          # Prefer JSON-first module slug when available; keep compat with older payloads.
          mid = module_id.to_s
          tr  = tipo_ruby.to_s
          valid = ->(s) { s =~ /\A[a-z0-9_-]{1,80}\z/i }
          build_type =
            if !mid.empty? && valid.call(mid)
              # If tipo_ruby looks like a legacy builder key (armario_base, etc.)
              # or a real module slug, both are acceptable. Prefer the explicit
              # tipo_ruby only when it is valid; otherwise fall back to module_id.
              valid.call(tr) ? tr : mid
            else
              valid.call(tr) ? tr : 'armario_base'
            end

          if TOOLS_LOADED
            # Activate interactive placement tool — shows ghost, snaps, checks collisions
            tool = Tools::PlacementTool.new(build_type, mod_params, self)
            Sketchup.active_model.select_tool(tool)
            send_status('Clique no modelo para posicionar o modulo | ESC para cancelar')
          else
            # Fallback: place at origin if tools not available
            Library::ParametricEngine.create_module(build_type, mod_params)
            send_status("Modulo inserido: #{module_id}")
          end
          nil
        }

        # ── Placement: model summary (called by PlacementTool after insert) ──
        @commands['model_summary'] = ->(params) {
          model = Sketchup.active_model
          return { modules: 0, pieces: 0 } unless model

          modules = model.active_entities.select do |e|
            (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
              (e.get_attribute('Ornato', 'module_type') || e.get_attribute('Ornato', 'params'))
          end

          total_pieces = modules.sum do |grp|
            grp.entities.count { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
          end

          {
            modules: modules.length,
            pieces:  total_pieces,
            module_names: modules.map { |g| g.respond_to?(:name) ? g.name : '' },
          }
        }

        # ── Construtor ─────────────────────────────────
        @commands['construtor_create'] = ->(params) {
          Constructor::BoxBuilder.create_from_json(params.to_json)
          nil
        }

        @commands['construtor_save_template'] = ->(params) {
          data = params
          name = (data.dig(:params, :nome) || 'template').gsub(/[^a-zA-Z0-9_]/, '_').downcase
          save_path = ::UI.savepanel('Salvar Template', '', "#{name}.json")
          if save_path
            File.open(save_path, 'w') { |f| f.write(JSON.pretty_generate(data)) }
            send_status("Template salvo: #{File.basename(save_path)}")
          end
          nil
        }

        @commands['construtor_load_template'] = ->(params) {
          path = ::UI.openpanel('Carregar Template', '', 'JSON|*.json||')
          if path && File.exist?(path)
            data = JSON.parse(File.read(path), symbolize_names: true)
            send_status("Template carregado: #{File.basename(path)}")
            data
          end
        }

        # ── Agregador ──────────────────────────────────
        @commands['agregador_get_target'] = ->(params) {
          group = get_selected_ornato_module
          return nil unless group
          get_module_target_data(group)
        }

        @commands['agregador_add'] = ->(params) {
          group = get_selected_ornato_module
          return nil unless group
          slot_data = { type: params[:type] }.to_json
          Constructor::Aggregator.add_component(group, slot_data)
          get_module_target_data(group)
        }

        @commands['agregador_remove'] = ->(params) {
          group = get_selected_ornato_module
          return nil unless group
          idx = params[:index].to_i
          slots = JSON.parse(group.get_attribute('Ornato', 'slots') || '[]')
          slot = slots[idx]
          if slot
            Constructor::Aggregator.remove_component(group, slot.to_json)
          end
          get_module_target_data(group)
        }

        @commands['troca_get_options'] = ->(params) {
          # Return swap options for a slot type
          slot = params[:slot] || {}
          { slot: slot, options: get_swap_options(slot[:type] || slot['type']) }
        }

        # ── Acabamentos ────────────────────────────────
        @commands['acabamentos_get_pieces'] = ->(params) {
          group = get_selected_ornato_module
          return { pieces: [] } unless group
          pieces = Constructor::FinishManager.get_pieces_data(group)
          { pieces: pieces }
        }

        @commands['acabamentos_apply'] = ->(params) {
          group = get_selected_ornato_module
          return nil unless group
          Constructor::FinishManager.apply_finishes(group, params.to_json)
          nil
        }

        @commands['acabamentos_reset'] = ->(params) {
          group = get_selected_ornato_module
          return nil unless group
          Constructor::FinishManager.reset_finishes(group)
          nil
        }

        # ── Validacao ──────────────────────────────────
        @commands['validacao_run'] = ->(params) {
          model = Sketchup.active_model
          return { issues: [] } unless model

          config = Config.load
          analyzer = Core::ModelAnalyzer.new(model)
          analysis = analyzer.analyze

          engine = Hardware::RulesEngine.new(config)
          machining = {}
          (analysis[:modules] || []).each do |mod|
            m = engine.process_module(mod[:group])
            machining.merge!(m)
          end

          validator = Validation::Validator.new(config)
          issues = validator.validate(analysis, machining)

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

          { issues: issues_data }
        }

        @commands['select_piece'] = ->(params) {
          Main.select_piece_in_model(params[:piece_id])
          nil
        }

        # ── Validação v2 (ValidationRunner + central de issues) ──
        @commands['run_validation'] = ->(_params) {
          model = Sketchup.active_model
          runner = Ornato::Validation::ValidationRunner.new(model)
          runner.run
        }

        @commands['select_entity_in_model'] = ->(params) {
          eid = params[:entity_id].to_i
          model = Sketchup.active_model
          return { ok: false } unless model && eid > 0
          target = nil
          model.active_entities.each do |ent|
            target = ent if ent.respond_to?(:entityID) && ent.entityID == eid
            break if target
            if ent.respond_to?(:entities)
              ent.entities.each do |c|
                target = c if c.respond_to?(:entityID) && c.entityID == eid
                break if target
              end
            end
            break if target
          end
          if target
            model.selection.clear
            model.selection.add(target)
            Sketchup.active_model.active_view.zoom(target) rescue nil
            { ok: true, entity_id: eid }
          else
            { ok: false, entity_id: eid }
          end
        }

        @commands['auto_fix_issue'] = ->(params) {
          model = Sketchup.active_model
          return { ok: false, error: 'no_model' } unless model
          eid = params[:entity_id].to_i
          action = params[:action].to_s
          payload = params[:payload] || {}

          ent = nil
          model.active_entities.each do |e|
            ent = e if e.respond_to?(:entityID) && e.entityID == eid
            break if ent
            if e.respond_to?(:entities)
              e.entities.each do |c|
                ent = c if c.respond_to?(:entityID) && c.entityID == eid
                break if ent
              end
            end
            break if ent
          end
          return { ok: false, error: 'entity_not_found' } unless ent

          model.start_operation("Ornato: Auto-fix #{action}", true)
          begin
            case action
            when 'apply_default_material'
              ent.set_attribute('Ornato', 'material', (payload[:material] || 'MDF18_BrancoTX').to_s)
            when 'apply_default_hardware'
              ent.set_attribute('Ornato', '_aggregate_hardware', true)
              ent.set_attribute('Ornato', 'hardware_rule', (payload[:rule] || 'pino_metalico').to_s)
            when 'remove_duplicate_drilling'
              # Auto-fix simbólico — marca pra coletor reprocessar.
              ent.set_attribute('Ornato', '_drilling_dedupe_requested', true)
            when 'cache_module_offline'
              ent.set_attribute('Ornato', '_offline_cache_requested', true)
            else
              model.abort_operation
              return { ok: false, error: "unknown_action:#{action}" }
            end
            model.commit_operation
            { ok: true, action: action, entity_id: eid }
          rescue => e
            model.abort_operation
            { ok: false, error: e.message }
          end
        }

        @commands['ignore_validation_issue'] = ->(params) {
          model = Sketchup.active_model
          return { ok: false } unless model
          issue_id = params[:issue_id].to_s
          reason = (params[:reason] || '').to_s
          return { ok: false, error: 'missing_id' } if issue_id.empty?

          raw = model.get_attribute('Ornato', 'validation_ignores', nil)
          list = if raw.is_a?(String)
                   (JSON.parse(raw) rescue [])
                 elsif raw.is_a?(Array)
                   raw
                 else
                   []
                 end
          list.reject! { |e| (e['id'] || e[:id]) == issue_id }
          token = "ign_#{Time.now.to_i}_#{issue_id.hash.abs}"
          list << { 'id' => issue_id, 'reason' => reason, 'token' => token,
                    'at' => Time.now.to_i, 'by' => ENV['USER'] || 'unknown' }
          model.set_attribute('Ornato', 'validation_ignores', list.to_json)
          { ok: true, token: token }
        }

        @commands['get_ignored_issues'] = ->(_params) {
          model = Sketchup.active_model
          return { ignored: [] } unless model
          raw = model.get_attribute('Ornato', 'validation_ignores', nil)
          list = if raw.is_a?(String)
                   (JSON.parse(raw) rescue [])
                 elsif raw.is_a?(Array)
                   raw
                 else
                   []
                 end
          { ignored: list }
        }

        # ── Exportar ───────────────────────────────────
        @commands['export_json'] = ->(params) {
          Main.export_json
          nil
        }

        @commands['sync_erp'] = ->(params) {
          Main.sync_with_erp
          nil
        }

        @commands['check_api'] = ->(params) {
          config = Config.load
          api_url = config.dig(:api, :url) || 'http://localhost:3001'
          begin
            uri = URI("#{api_url}/api/health")
            response = Net::HTTP.get_response(uri)
            token = Sketchup.read_default('Ornato', 'auth_token', '')
            { connected: response.code.to_i == 200, authenticated: !token.to_s.empty? }
          rescue
            { connected: false, authenticated: false }
          end
        }

        # ── Config ─────────────────────────────────────
        @commands['config_load'] = ->(params) {
          Config.load
        }

        @commands['config_save'] = ->(params) {
          current = Config.load
          merged = deep_merge_sym(current, params)
          Config.save(merged)
          send_status('Configuracoes salvas')
          nil
        }

        @commands['config_reset'] = ->(params) {
          Config.reset
          nil
        }

        @commands['config_test_api'] = ->(params) {
          url = params[:url] || 'http://localhost:3001'
          begin
            uri = URI("#{url}/api/plugin/version")
            response = Net::HTTP.get_response(uri)
            { ok: response.code.to_i == 200, status: response.code }
          rescue => e
            { ok: false, error: e.message }
          end
        }

        # ── Auth ────────────────────────────────────────
        @commands['auth_login'] = ->(params) {
          email = params[:email].to_s.strip
          senha = params[:senha].to_s
          return { ok: false, error: 'Email e senha obrigatorios' } if email.empty? || senha.empty?

          config = Config.load
          api_url = config.dig(:api, :url) || 'http://localhost:3001'

          begin
            uri = URI("#{api_url}/api/auth/login")
            http = Net::HTTP.new(uri.host, uri.port)
            http.use_ssl = (uri.scheme == 'https')
            http.open_timeout = 5
            http.read_timeout = 10

            req = Net::HTTP::Post.new(uri.request_uri)
            req['Content-Type'] = 'application/json'
            req.body = { email: email, senha: senha }.to_json

            response = http.request(req)
            data = JSON.parse(response.body, symbolize_names: true)

            if response.code.to_i == 200 && data[:token]
              Sketchup.write_default('Ornato', 'auth_token', data[:token])
              Sketchup.write_default('Ornato', 'auth_email', email)
              Sketchup.write_default('Ornato', 'auth_user', (data[:user] || {}).to_json)
              send_status("Login OK: #{email}")
              { ok: true, email: email, user: data[:user] }
            else
              { ok: false, error: data[:error] || 'Credenciais invalidas' }
            end
          rescue => e
            { ok: false, error: "Erro de conexao: #{e.message}" }
          end
        }

        @commands['auth_status'] = ->(params) {
          token = Sketchup.read_default('Ornato', 'auth_token', '')
          email = Sketchup.read_default('Ornato', 'auth_email', '')
          user_json = Sketchup.read_default('Ornato', 'auth_user', '{}')
          user = begin; JSON.parse(user_json, symbolize_names: true); rescue; {}; end
          if token.to_s.empty?
            { logged_in: false }
          else
            { logged_in: true, email: email, user: user }
          end
        }

        @commands['auth_logout'] = ->(params) {
          Sketchup.write_default('Ornato', 'auth_token', '')
          Sketchup.write_default('Ornato', 'auth_email', '')
          Sketchup.write_default('Ornato', 'auth_user', '{}')
          send_status('Sessao encerrada')
          { ok: true }
        }

        # ── About ──────────────────────────────────────
        @commands['about_info'] = ->(params) {
          catalog_count = begin
            Catalog::HardwareCatalog.all.length
          rescue
            0
          end

          {
            version: ::Ornato::Version.current[:version],
            sketchup_version: Sketchup.version,
            ruby_version: RUBY_VERSION,
            catalog_count: catalog_count,
          }
        }

        # ── Misc ───────────────────────────────────────
        @commands['open_url'] = ->(params) {
          ::UI.openURL(params[:url]) if params[:url]
          nil
        }
      end

      # ── Helpers ──────────────────────────────────────

      def build_init_config(startup_tab)
        {
          version: ::Ornato::Version.current[:version],
          startupTab: startup_tab,
        }
      end

      def b64_encode(str)
        Base64.strict_encode64(str)
      end

      def b64_decode(str)
        Base64.decode64(str)
      end

      def add_auth_header(request)
        token = Sketchup.read_default('Ornato', 'auth_token', '')
        request['Authorization'] = "Bearer #{token}" unless token.to_s.empty?
      end

      def get_selected_ornato_module
        model = Sketchup.active_model
        return nil unless model
        sel = model.selection.first
        return nil unless sel
        return nil unless sel.is_a?(Sketchup::Group) || sel.is_a?(Sketchup::ComponentInstance)
        # Check if it's an Ornato module
        has_ornato = sel.get_attribute('Ornato', 'module_type') || sel.get_attribute('Ornato', 'params')
        has_ornato ? sel : nil
      end

      def get_module_target_data(group)
        params = JSON.parse(group.get_attribute('Ornato', 'params') || '{}', symbolize_names: true)
        slots = JSON.parse(group.get_attribute('Ornato', 'slots') || '[]', symbolize_names: true)
        {
          nome: group.name,
          params: params,
          slots: slots,
        }
      end

      def get_swap_options(slot_type)
        case slot_type.to_s
        when /porta/, /door/, /fechamento/
          ['porta_2', 'porta_1', 'basculante', 'correr']
        when /gaveta/, /drawer/
          ['gaveta_1', 'gaveta_2', 'gaveta_3', 'gaveta_4', 'gaveta_5']
        when /prateleira/, /divisoria/, /shelf/, /interno/
          ['prateleira', 'divisoria', 'cabideiro', 'sapateira']
        else
          []
        end
      end

      def cat_label(cat_id)
        labels = {
          'cozinha' => 'Cozinha',
          'dormitorio' => 'Dormitorio',
          'banheiro' => 'Banheiro',
          'escritorio' => 'Escritorio',
          'sala' => 'Sala',
          'lavanderia' => 'Lavanderia',
          'closet' => 'Closet',
          'comercial' => 'Comercial',
        }
        labels[cat_id.to_s] || cat_id.to_s.capitalize
      end

      def load_local_biblioteca
        bib_dir = File.join(PLUGIN_DIR, 'biblioteca')
        return { modules: [], categories: [] } unless File.directory?(bib_dir)

        modules = []
        Dir.glob(File.join(bib_dir, '**', '*.json')).each do |f|
          begin
            data = JSON.parse(File.read(f), symbolize_names: true)
            modules << data
          rescue
            next
          end
        end

        cats = modules.map { |m| m[:categoria] }.compact.uniq.map { |c| { id: c, label: cat_label(c) } }
        { modules: modules, categories: cats }
      end

      def deep_merge_sym(base, override)
        result = base.dup
        override.each do |key, value|
          sym_key = key.is_a?(String) ? key.to_sym : key
          if value.is_a?(Hash) && result[sym_key].is_a?(Hash)
            result[sym_key] = deep_merge_sym(result[sym_key], value)
          else
            result[sym_key] = value
          end
        end
        result
      end

      # ── Main Panel selection observer ─────────────────────
      # Polls SketchUp selection every second; fires JS onEntitySelected /
      # onSelectionCleared in the main panel.

      def setup_main_panel_selection_observer
        cancel_main_panel_selection_timer
        @mp_last_sel_id = nil
        @mp_last_v2_sig = nil

        @mp_sel_timer = ::UI.start_timer(1.0, true) do
          unless @main_panel && @main_panel.visible?
            cancel_main_panel_selection_timer
            next
          end

          model = Sketchup.active_model
          next unless model

          # ── Legacy main_panel hook (módulo Ornato selecionado apenas) ──
          sel = model.selection.first
          if sel && (sel.is_a?(Sketchup::Group) || sel.is_a?(Sketchup::ComponentInstance)) &&
             (sel.get_attribute('Ornato', 'module_type') || sel.get_attribute('Ornato', 'params'))

            sel_id = sel.entityID
            if sel_id != @mp_last_sel_id
              @mp_last_sel_id = sel_id
              push_entity_selected_to_panel(sel)
            end

          else
            if @mp_last_sel_id
              @mp_last_sel_id = nil
              @main_panel.execute_script(
                "typeof onSelectionCleared==='function'&&onSelectionCleared()"
              )
            end
          end

          # ── UI v2 hook: dispara onSelectionChanged com payload contextual ──
          # Suporta peça/ferragem/agregado/módulo + multi-selection. Usa
          # assinatura simples (ids ordenados) pra evitar spam de redraws.
          begin
            ents = model.selection.to_a
            sig  = ents.first(8).map { |e| e.respond_to?(:entityID) ? e.entityID : e.object_id }.sort.join(',')
            sig  = "#{ents.size}|#{sig}"
            if sig != @mp_last_v2_sig
              @mp_last_v2_sig = sig
              push_v2_selection_changed(ents)
            end
          rescue => e
            puts "Ornato v2_selection observer ERRO: #{e.message}"
          end
        end
      end

      # ── UI v2: build + push selection payload ─────────────
      # Envia para `window.onSelectionChanged` (v2 inspector dispatch).
      def push_v2_selection_changed(entities)
        return unless @main_panel && @main_panel.visible?
        payload = build_v2_selection_payload(entities)
        json = JSON.generate(payload)
        @main_panel.execute_script(
          "typeof window.onSelectionChanged==='function'&&window.onSelectionChanged(#{json})"
        )
      rescue => e
        puts "Ornato push_v2_selection_changed ERRO: #{e.message}"
      end

      def build_v2_selection_payload(entities)
        return { count: 0, items: [], multi: false } if entities.nil? || entities.empty?

        items = entities.first(5).map do |entity|
          {
            entity_id: (entity.respond_to?(:entityID) ? entity.entityID.to_s : entity.object_id.to_s),
            type:      detect_v2_entity_type(entity),
            name:      (entity.respond_to?(:name) && !entity.name.to_s.empty? ? entity.name : nil),
            attrs:     read_v2_ornato_attrs(entity),
            bbox:      v2_bbox_to_hash(entity),
          }
        end

        type_counts = items.each_with_object(Hash.new(0)) { |it, h| h[it[:type]] += 1 }

        {
          count:       entities.size,
          items:       items,
          multi:       entities.size > 1,
          type_counts: type_counts,
        }
      end

      def detect_v2_entity_type(entity)
        return 'unknown' unless entity.respond_to?(:get_attribute)
        tipo = entity.get_attribute('Ornato', 'tipo', nil)
        return tipo if %w[modulo peca ferragem agregado].include?(tipo.to_s)

        # Fallbacks por outros sinais quando 'tipo' não foi gravado:
        if entity.get_attribute('Ornato', 'module_type', nil) ||
           entity.get_attribute('Ornato', 'params', nil)
          return 'modulo'
        end
        if entity.get_attribute('Ornato', 'role', nil) ||
           entity.get_attribute('ornato', 'role', nil)
          return 'peca'
        end
        if entity.get_attribute('Ornato', 'aggregate_id', nil)
          return 'agregado'
        end
        if entity.get_attribute('Ornato', 'componente_3d', nil) ||
           entity.get_attribute('Ornato', 'regra', nil)
          return 'ferragem'
        end
        'unknown'
      end

      def read_v2_ornato_attrs(entity)
        return {} unless entity.respond_to?(:get_attribute)
        keys = %w[
          tipo module_type role persistent_id regra componente_3d
          anchor_role aggregate_id bay_id preserve_drillings
        ]
        out = {}
        keys.each do |k|
          v = entity.get_attribute('Ornato', k, nil)
          out[k] = v unless v.nil?
        end
        out
      end

      def v2_bbox_to_hash(entity)
        return nil unless entity.respond_to?(:bounds)
        bb = entity.bounds
        return nil if bb.nil? || bb.empty?
        {
          w: bb.width.to_mm.round(1),
          h: bb.height.to_mm.round(1),
          d: bb.depth.to_mm.round(1),
        }
      rescue
        nil
      end

      def cancel_main_panel_selection_timer
        if @mp_sel_timer
          ::UI.stop_timer(@mp_sel_timer)
          @mp_sel_timer = nil
        end
      end

      def push_entity_selected_to_panel(group)
        return unless @main_panel && @main_panel.visible?

        params = begin; JSON.parse(group.get_attribute('Ornato', 'params') || '{}', symbolize_names: true); rescue; {}; end
        bb = group.bounds

        data = {
          entity_id: group.entityID.to_s,
          name:      group.respond_to?(:name) ? group.name : 'Módulo',
          module_type: group.get_attribute('Ornato', 'module_type') || '',
          dimensions: {
            largura:      (params[:largura]      || bb.width.to_mm).round(1),
            altura:       (params[:altura]       || bb.height.to_mm).round(1),
            profundidade: (params[:profundidade] || bb.depth.to_mm).round(1),
          },
          agregados:  group.get_attribute('Ornato', 'agregados', nil),
          materials:  group.get_attribute('Ornato', 'materials_override', nil),
        }

        json = JSON.generate(data)
        @main_panel.execute_script(
          "typeof onEntitySelected==='function'&&onEntitySelected(#{json})"
        )
      rescue => e
        puts "Ornato push_entity_selected_to_panel ERRO: #{e.message}"
      end

      # Push saved project metadata back to the panel on open
      def push_project_data_to_panel
        return unless @main_panel && @main_panel.visible?
        model = Sketchup.active_model
        return unless model

        keys = %w[cliente tel email nome ambiente designer material espessura fita]
        data = {}
        keys.each { |k| v = model.get_attribute('Ornato_Project', k); data[k] = v if v }
        return if data.empty?

        json = JSON.generate(data)
        @main_panel.execute_script(
          "typeof window.loadProjectData==='function'&&window.loadProjectData(#{json})"
        )
      rescue => e
        puts "Ornato push_project_data_to_panel ERRO: #{e.message}"
      end

      def cancel_selection_timer
        if @selection_timer_id
          ::UI.stop_timer(@selection_timer_id)
          @selection_timer_id = nil
        end
      end

      def setup_selection_observer
        cancel_selection_timer
        @last_selection_id = nil

        @selection_timer_id = ::UI.start_timer(1.5, true) do
          unless @dialog && @dialog.visible?
            cancel_selection_timer
            next
          end

          model = Sketchup.active_model
          next unless model

          sel = model.selection.first
          if sel && (sel.is_a?(Sketchup::Group) || sel.is_a?(Sketchup::ComponentInstance))
            # Only send if selection changed
            sel_id = sel.entityID
            next if sel_id == @last_selection_id
            @last_selection_id = sel_id

            has_ornato = sel.get_attribute('Ornato', 'module_type') || sel.get_attribute('Ornato', 'params')
            if has_ornato
              data = get_module_target_data(sel)
              pieces = begin
                Constructor::FinishManager.get_pieces_data(sel)
              rescue
                []
              end
              send_selection_changed({ target: data, pieces: pieces })
            end
          else
            @last_selection_id = nil
          end
        end
      end
    end
  end
end
