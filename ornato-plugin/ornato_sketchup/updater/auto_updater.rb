# ═══════════════════════════════════════════════════════
# Ornato CNC — Auto Updater
# Verifica e instala atualizações automaticamente
# ═══════════════════════════════════════════════════════

require 'net/http'
require 'uri'
require 'json'
require 'fileutils'

module Ornato
  module AutoUpdater

    # Intervalo entre verificações (segundos)
    CHECK_INTERVAL = 24 * 60 * 60  # 24 horas
    PREFS_KEY_LAST_CHECK = 'ornato_last_update_check'
    PREFS_KEY_SKIP_VERSION = 'ornato_skip_version'

    # ── Entrada principal ──────────────────────────────
    # Chamada no startup do plugin (não bloqueia a UI)
    def self.check_on_startup
      return unless Ornato::Config.get(:auto_check_updates, true)

      # Evita checar mais de uma vez por intervalo
      last_check = Sketchup.read_default('Ornato', PREFS_KEY_LAST_CHECK, 0).to_i
      return if (Time.now.to_i - last_check) < CHECK_INTERVAL

      # Roda em thread separada para não travar o SketchUp
      Thread.new do
        begin
          check_for_updates
        rescue => e
          # Silencioso — update check não deve crashar o plugin
          puts "Ornato AutoUpdater: #{e.message}" if $VERBOSE
        end
      end
    end

    # ── Verificar atualizações ─────────────────────────
    def self.check_for_updates(silent: true)
      api_url = Ornato::Config.get(:api_url, 'http://localhost:3001')
      uri = URI("#{api_url}/api/plugin/check-update?current_version=#{PLUGIN_VERSION}")

      response = nil
      Net::HTTP.start(uri.host, uri.port,
                      open_timeout: 5, read_timeout: 8,
                      use_ssl: uri.scheme == 'https') do |http|
        response = http.get(uri.request_uri)
      end

      return unless response&.code == '200'

      data = JSON.parse(response.body)

      # Salva timestamp da verificação
      Sketchup.write_default('Ornato', PREFS_KEY_LAST_CHECK, Time.now.to_i.to_s)

      return unless data['has_update']

      latest = data['latest_version']
      skip_ver = Sketchup.read_default('Ornato', PREFS_KEY_SKIP_VERSION, '')
      return if skip_ver == latest

      download_url = data['download_url']
      changelog = data['changelog'] || ''

      # Mostrar dialog na thread principal do SketchUp
      UI.start_timer(0.1, false) do
        show_update_dialog(latest, download_url, changelog)
      end
    end

    # ── Dialog de atualização ──────────────────────────
    def self.show_update_dialog(latest_version, download_url, changelog)
      dialog = UI::HtmlDialog.new(
        dialog_title:    "Atualização Disponível — Ornato CNC",
        preferences_key: "ornato_update_dialog",
        scrollable:      false,
        resizable:       false,
        width:           520,
        height:          420,
        left:            200,
        top:             100,
        style:           UI::HtmlDialog::STYLE_DIALOG
      )

      html_path = File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'update_dialog.html')
      dialog.set_file(html_path)

      # Passar dados via callback após load
      dialog.add_action_callback('ready') do |_ctx|
        dialog.execute_script(
          "initUpdateDialog(#{latest_version.to_json}, #{PLUGIN_VERSION.to_json}, #{changelog.to_json})"
        )
      end

      dialog.add_action_callback('download_update') do |_ctx|
        dialog.close
        perform_update(download_url, latest_version)
      end

      dialog.add_action_callback('skip_version') do |_ctx, version|
        Sketchup.write_default('Ornato', PREFS_KEY_SKIP_VERSION, version.to_s)
        dialog.close
      end

      dialog.add_action_callback('remind_later') do |_ctx|
        # Reset timer para checar amanhã
        Sketchup.write_default('Ornato', PREFS_KEY_LAST_CHECK, (Time.now.to_i - CHECK_INTERVAL + 3600).to_s)
        dialog.close
      end

      dialog.show
    end

    # ── Baixar e instalar atualização ─────────────────
    def self.perform_update(download_url, latest_version)
      # Mostrar progresso
      UI.messagebox("Baixando Ornato CNC v#{latest_version}...\nAguarde, o SketchUp pode ficar lento por alguns instantes.", MB_OK)

      begin
        rbz_data = download_file(download_url)
        temp_path = save_temp_file(rbz_data, latest_version)
        install_extension(temp_path)
      rescue => e
        UI.messagebox("Erro ao baixar atualização:\n#{e.message}\n\nBaixe manualmente em gestaoornato.com/download", MB_OK)
      ensure
        # Limpar arquivo temp
        File.delete(temp_path) if temp_path && File.exist?(temp_path) rescue nil
      end
    end

    # ── Download via Net::HTTP com redirect ───────────
    def self.download_file(url_str, redirect_limit: 5)
      raise 'Muitos redirecionamentos' if redirect_limit <= 0

      uri = URI(url_str)
      response = Net::HTTP.start(uri.host, uri.port,
                                 open_timeout: 10, read_timeout: 60,
                                 use_ssl: uri.scheme == 'https') do |http|
        http.get(uri.request_uri)
      end

      case response.code.to_i
      when 200
        response.body
      when 301, 302, 307, 308
        new_url = response['location']
        download_file(new_url, redirect_limit: redirect_limit - 1)
      else
        raise "HTTP #{response.code}: #{response.message}"
      end
    end

    # ── Salvar .rbz temporário ─────────────────────────
    def self.save_temp_file(data, version)
      temp_dir = ENV['TMPDIR'] || ENV['TMP'] || ENV['TEMP'] || Dir.tmpdir
      temp_path = File.join(temp_dir, "ornato_cnc_#{version}.rbz")
      File.open(temp_path, 'wb') { |f| f.write(data) }
      temp_path
    end

    # ── Instalar extensão ──────────────────────────────
    def self.install_extension(rbz_path)
      success = Sketchup.install_from_archive(rbz_path, show_log: false)

      if success
        result = UI.messagebox(
          "Ornato CNC atualizado com sucesso!\n\nReinicie o SketchUp para aplicar as mudanças.",
          MB_OKCANCEL
        )
        # MB_OK = 1
        Sketchup.quit if result == 1
      else
        UI.messagebox(
          "Não foi possível instalar automaticamente.\n\n" \
          "O arquivo foi baixado em:\n#{rbz_path}\n\n" \
          "Instale manualmente via Window → Extension Manager → Install Extension.",
          MB_OK
        )
      end
    end

  end
end
