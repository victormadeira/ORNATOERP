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
      DIALOG_WIDTH  = 720
      DIALOG_HEIGHT = 600

      attr_reader :dialog

      def initialize
        @dialog = nil
        @commands = {}
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
            http.open_timeout = 3
            http.read_timeout = 5
            response = http.get(uri.request_uri)
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

          Library::ParametricEngine.create_module(tipo_ruby, mod_params)
          send_status("Modulo inserido: #{module_id}")
          nil
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
            uri = URI("#{api_url}/api/plugin/version")
            response = Net::HTTP.get_response(uri)
            { connected: response.code.to_i == 200 }
          rescue
            { connected: false }
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
