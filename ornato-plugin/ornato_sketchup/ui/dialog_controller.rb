# ═══════════════════════════════════════════════════════
# DialogController — Unified OCL-style dialog manager
# Command bus: JS → Ruby via skp:ornato_command@base64
#              Ruby → JS via execute_script
# ═══════════════════════════════════════════════════════

require 'json'
require 'base64'
require 'net/http'
require 'uri'

module Ornato
  module UI
    class DialogController
      DIALOG_WIDTH       = 720
      DIALOG_HEIGHT      = 600
      MAIN_PANEL_WIDTH   = 420
      MAIN_PANEL_HEIGHT  = 720

      attr_reader :dialog

      def initialize
        @dialog      = nil
        @main_panel  = nil
        @commands    = {}
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

        # Push version + initial model summary after load
        ::UI.start_timer(0.5, false) do
          next unless @main_panel && @main_panel.visible?
          version = defined?(PLUGIN_VERSION) ? PLUGIN_VERSION : '0.1.0'
          @main_panel.execute_script("typeof setVersion==='function'&&setVersion('#{version}')")
          push_model_summary_to_panel
        end
      end

      def close_main_panel
        @main_panel.close if @main_panel && @main_panel.visible?
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

      # Push model stats + module list to the panel's Modelo tab
      def push_model_summary_to_panel
        return unless @main_panel && @main_panel.visible?
        groups = collect_ornato_groups_from_model
        total_pieces = groups.sum do |g|
          g.entities.count { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
        end

        module_list = groups.map do |g|
          params = begin; JSON.parse(g.get_attribute('Ornato', 'params') || '{}', symbolize_names: true); rescue; {}; end
          {
            id:           g.entityID.to_s,
            label:        g.respond_to?(:name) ? g.name : (g.get_attribute('Ornato', 'module_type') || 'Modulo'),
            type:         g.get_attribute('Ornato', 'module_type') || '',
            largura:      params[:largura],
            altura:       params[:altura],
            profundidade: params[:profundidade],
            material:     params[:material],
          }
        end

        data = {
          modules:     groups.length,
          pieces:      total_pieces,
          joints:      0,
          materials:   module_list.map { |m| m[:material] }.uniq.compact.length,
          module_list: module_list,
        }
        json = data.to_json
        @main_panel.execute_script("typeof updateSummary==='function'&&updateSummary(#{json})")
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
          tipo_ruby = params[:tipo_ruby] || 'armario_base'
          mod_params = params[:params] || {}

          if TOOLS_LOADED
            # Activate interactive placement tool — shows ghost, snaps, checks collisions
            tool = Tools::PlacementTool.new(tipo_ruby, mod_params, self)
            Sketchup.active_model.select_tool(tool)
            send_status('Clique no modelo para posicionar o modulo | ESC para cancelar')
          else
            # Fallback: place at origin if tools not available
            Library::ParametricEngine.create_module(tipo_ruby, mod_params)
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
            version: defined?(PLUGIN_VERSION) ? PLUGIN_VERSION : '0.1.0',
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
          version: defined?(PLUGIN_VERSION) ? PLUGIN_VERSION : '0.1.0',
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
