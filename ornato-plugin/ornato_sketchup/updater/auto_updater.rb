# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# Ornato CNC — Auto Updater (Sprint A3)
#
# Consome `GET /api/plugin/check-update?channel=<>&current=<>` e instala
# atualizações via `Sketchup.install_from_archive`.
#
# Recursos:
#   • Canal configurável (dev/beta/stable) persistido em Sketchup default
#   • Verificação SHA256 (header Content-SHA256 + campo JSON sha256)
#   • Force update (gate sem opção "mais tarde")
#   • Validação min_compat (versão mínima compatível com o servidor)
#   • Backup pré-install em ~/.ornato/backups/<old_version>/
#   • Telemetria pós-install via POST /api/plugin/telemetry
#
# Backward compat:
#   Se a resposta tiver shape antigo {has_update, latest_version,
#   download_url, changelog}, o updater ainda funciona (sem checksum).
# ═══════════════════════════════════════════════════════════════════════

require 'net/http'
require 'uri'
require 'json'
require 'fileutils'
require 'digest'
require 'securerandom'
require 'tmpdir'

module Ornato
  module AutoUpdater
    # ── Constantes ─────────────────────────────────────────────────────
    CHECK_INTERVAL          = 24 * 60 * 60 # 24h
    PREFS_KEY_LAST_CHECK    = 'ornato_last_update_check'
    PREFS_KEY_SKIP_VERSION  = 'ornato_skip_version'
    PREFS_KEY_CHANNEL       = 'update_channel'
    PREFS_KEY_INSTALL_ID    = 'install_id'
    PREFS_KEY_TELEMETRY     = 'telemetry_enabled'
    PREFS_KEY_TELEMETRY_DECIDED = 'telemetry_decided'
    PREFS_KEY_LAST_TELEMETRY = 'last_telemetry_at'
    PREFS_KEY_COMPAT_VIOL   = 'compat_violation'
    DEFAULT_CHANNEL         = 'stable'
    VALID_CHANNELS          = %w[dev beta stable].freeze

    # ── Logger helper (fallback se Ornato::Logger não existir) ────────
    def self.log_info(msg);  logger_call(:info,  msg); end
    def self.log_warn(msg);  logger_call(:warn,  msg); end
    def self.log_error(msg); logger_call(:error, msg); end

    def self.logger_call(level, msg)
      if defined?(Ornato::Logger) && Ornato::Logger.respond_to?(level)
        Ornato::Logger.send(level, "[AutoUpdater] #{msg}")
      else
        io = (level == :error || level == :warn) ? $stderr : $stdout
        io.puts("[Ornato AutoUpdater #{level.to_s.upcase}] #{msg}")
      end
    end

    # ── Canal ──────────────────────────────────────────────────────────
    def self.current_channel
      ch = if defined?(Sketchup) && Sketchup.respond_to?(:read_default)
             Sketchup.read_default('Ornato', PREFS_KEY_CHANNEL, DEFAULT_CHANNEL)
           else
             DEFAULT_CHANNEL
           end
      VALID_CHANNELS.include?(ch.to_s) ? ch.to_s : DEFAULT_CHANNEL
    end

    def self.set_channel(channel)
      ch = channel.to_s
      raise ArgumentError, "canal invalido: #{ch}" unless VALID_CHANNELS.include?(ch)
      if defined?(Sketchup) && Sketchup.respond_to?(:write_default)
        Sketchup.write_default('Ornato', PREFS_KEY_CHANNEL, ch)
      end
      log_info("canal alterado para #{ch}")
      ch
    end

    # ── Install ID (UUID estável por instalação) ──────────────────────
    def self.install_id
      if defined?(Sketchup) && Sketchup.respond_to?(:read_default)
        existing = Sketchup.read_default('Ornato', PREFS_KEY_INSTALL_ID, '')
        return existing unless existing.to_s.empty?
        new_id = SecureRandom.uuid
        Sketchup.write_default('Ornato', PREFS_KEY_INSTALL_ID, new_id)
        new_id
      else
        @install_id ||= SecureRandom.uuid
      end
    end

    # ── Telemetria opt-in (default OFF — pergunta no primeiro uso) ────
    def self.telemetry_enabled?
      return false unless defined?(Sketchup) && Sketchup.respond_to?(:read_default)
      v = Sketchup.read_default('Ornato', PREFS_KEY_TELEMETRY, false)
      # write_default armazena strings; aceitar bool ou string "false"/"true"/"0"/"1"
      case v
      when true, 'true', '1', 1 then true
      when false, 'false', '0', 0 then false
      else false
      end
    end

    def self.set_telemetry_enabled(flag)
      bool = (flag == true || flag.to_s == 'true' || flag.to_s == '1')
      if defined?(Sketchup) && Sketchup.respond_to?(:write_default)
        Sketchup.write_default('Ornato', PREFS_KEY_TELEMETRY, bool ? 'true' : 'false')
      end
      log_info("telemetry #{bool ? 'enabled' : 'disabled'}")
      bool
    end

    # Indica se o usuário já tomou uma decisão sobre telemetria (Sim/Não no
    # primeiro uso). Retorna false se nunca foi perguntado.
    def self.telemetry_decided?
      return false unless defined?(Sketchup) && Sketchup.respond_to?(:read_default)
      v = Sketchup.read_default('Ornato', PREFS_KEY_TELEMETRY_DECIDED, false)
      case v
      when true, 'true', '1', 1 then true
      when false, 'false', '0', 0 then false
      else false
      end
    end

    # Alias semântico (Sprint Audit FIX-Telemetry).
    def self.telemetry_decision_made?
      telemetry_decided?
    end

    # Dialog de consentimento exibido uma única vez no primeiro start.
    # Persiste a decisão (Sim/Não) e nunca mais pergunta. Pode ser revertida
    # via Configurações → set_telemetry_enabled.
    def self.show_telemetry_consent_dialog
      return mark_telemetry_decided(false) unless defined?(UI) && UI.respond_to?(:messagebox)
      msg = "O plugin Ornato pode enviar telemetria anônima " \
            "(versão, OS, SketchUp version) pra nos ajudar a melhorar.\n\n" \
            "ZERO informação pessoal, projetos ou dados de cliente.\n\n" \
            "Você pode mudar essa opção em Configurações a qualquer momento.\n\n" \
            "Aceita enviar telemetria?"
      result = UI.messagebox(msg, MB_YESNO)
      mark_telemetry_decided(result == IDYES)
    end

    # Persiste a decisão do usuário sobre telemetria (chamado uma única vez
    # no primeiro uso). Grava tanto a preferência quanto o flag "decidido".
    def self.mark_telemetry_decided(value)
      bool = (value == true || value.to_s == 'true' || value.to_s == '1')
      if defined?(Sketchup) && Sketchup.respond_to?(:write_default)
        Sketchup.write_default('Ornato', PREFS_KEY_TELEMETRY, bool ? 'true' : 'false')
        Sketchup.write_default('Ornato', PREFS_KEY_TELEMETRY_DECIDED, 'true')
      end
      log_info("telemetry decision recorded: #{bool ? 'opt-in' : 'opt-out'}")
      bool
    end

    def self.last_telemetry_at
      return nil unless defined?(Sketchup) && Sketchup.respond_to?(:read_default)
      v = Sketchup.read_default('Ornato', PREFS_KEY_LAST_TELEMETRY, '').to_s
      v.empty? ? nil : v.to_i
    end

    # ── Compat violation (gate min_compat) ────────────────────────────
    def self.compat_violation
      return nil unless defined?(Sketchup) && Sketchup.respond_to?(:read_default)
      raw = Sketchup.read_default('Ornato', PREFS_KEY_COMPAT_VIOL, '').to_s
      return nil if raw.empty?
      JSON.parse(raw)
    rescue
      nil
    end

    def self.set_compat_violation(min_required, current)
      data = { 'min_required' => min_required.to_s, 'current' => current.to_s, 'since' => Time.now.to_i }
      if defined?(Sketchup) && Sketchup.respond_to?(:write_default)
        Sketchup.write_default('Ornato', PREFS_KEY_COMPAT_VIOL, data.to_json)
      end
      log_warn("compat_violation persisted: #{data.inspect}")
      data
    end

    def self.clear_compat_violation
      if defined?(Sketchup) && Sketchup.respond_to?(:write_default)
        Sketchup.write_default('Ornato', PREFS_KEY_COMPAT_VIOL, '')
      end
      log_info('compat_violation cleared')
      true
    end

    # ── Versão atual ──────────────────────────────────────────────────
    def self.current_version
      if defined?(Ornato::Version) && Ornato::Version.respond_to?(:current)
        Ornato::Version.current[:version] || '0.0.0'
      elsif defined?(PLUGIN_VERSION)
        PLUGIN_VERSION
      else
        '0.0.0'
      end
    end

    # ── Entrada principal ─────────────────────────────────────────────
    def self.check_on_startup
      return unless defined?(Ornato::Config) && Ornato::Config.get(:auto_check_updates, true)

      last_check = Sketchup.read_default('Ornato', PREFS_KEY_LAST_CHECK, 0).to_i
      return if (Time.now.to_i - last_check) < CHECK_INTERVAL

      Thread.new do
        begin
          check_for_updates
        rescue => e
          log_warn("startup check falhou: #{e.message}")
        end
      end
    end

    # ── Verificar atualizações ────────────────────────────────────────
    # opts:
    #   silent:  - se true, não mostra dialog "tudo em dia"
    #   channel: - override (default: current_channel)
    def self.check_for_updates(silent: true, channel: nil)
      channel ||= current_channel
      config = defined?(Ornato::Config) ? Ornato::Config.load : {}
      api_url = config.dig(:api, :url) || 'http://localhost:3001'
      cur     = current_version
      uri     = URI("#{api_url}/api/plugin/check-update?current=#{cur}&channel=#{channel}")

      token = read_token
      if token.to_s.empty?
        log_info('sem auth_token; pulando check')
        return nil
      end

      response = http_get(uri, token: token, open_timeout: 5, read_timeout: 8)
      unless response && response.code.to_i == 200
        log_warn("check-update HTTP #{response&.code}")
        return nil
      end

      Sketchup.write_default('Ornato', PREFS_KEY_LAST_CHECK, Time.now.to_i.to_s) if defined?(Sketchup)

      data = JSON.parse(response.body)
      parsed = parse_response(data, current: cur)

      if parsed[:up_to_date]
        log_info("up to date (channel=#{channel}, v=#{cur})")
        UI.messagebox("Ornato CNC: você está na versão mais recente (#{cur}).") if !silent && defined?(UI)
        return parsed
      end

      latest = parsed[:latest]
      if !parsed[:force] && skipped?(latest)
        log_info("versão #{latest} marcada como skip — ignorando")
        return parsed
      end

      # min_compat enforcement
      if parsed[:min_compat] && version_lt?(cur, parsed[:min_compat])
        log_warn("current #{cur} < min_compat #{parsed[:min_compat]} → forçando update")
        parsed = parsed.merge(force: true, min_compat_violation: true)
        set_compat_violation(parsed[:min_compat], cur)
        send_telemetry_event('compat_violation_blocked',
                             min_required: parsed[:min_compat], current: cur)
      else
        # Servidor agora aceita versão atual → limpa flag se existia
        clear_compat_violation if compat_violation
      end

      # Dialog na thread principal
      if defined?(UI) && UI.respond_to?(:start_timer)
        UI.start_timer(0.1, false) { show_update_dialog(parsed) }
      else
        show_update_dialog(parsed)
      end

      parsed
    rescue => e
      log_error("check_for_updates: #{e.class}: #{e.message}")
      nil
    end

    # ── Parse da resposta (suporta schema novo e legacy) ──────────────
    def self.parse_response(data, current:)
      data ||= {}
      # Schema novo (Sprint A2)
      if data.key?('latest') || data.key?('up_to_date')
        return {
          latest:      data['latest'].to_s,
          url:         data['url'].to_s,
          sha256:      data['sha256'].to_s,
          force:       !!data['force'],
          changelog:   data['changelog'].to_s,
          min_compat:  data['min_compat'],
          up_to_date:  !!data['up_to_date'],
          schema:      :v2,
        }
      end

      # Schema legacy (clientes antigos / sem channel)
      has_update = !!data['has_update']
      {
        latest:      data['latest_version'].to_s,
        url:         data['download_url'].to_s,
        sha256:      '',
        force:       false,
        changelog:   data['changelog'].to_s,
        min_compat:  nil,
        up_to_date:  !has_update,
        schema:      :v1,
      }
    end

    # ── Comparação semver (1.2.3 vs 1.2.10) ───────────────────────────
    def self.version_lt?(a, b)
      compare_versions(a, b) < 0
    end

    def self.compare_versions(a, b)
      pa = (a || '0.0.0').to_s.split(/[.+-]/).map { |x| Integer(x) rescue 0 }
      pb = (b || '0.0.0').to_s.split(/[.+-]/).map { |x| Integer(x) rescue 0 }
      [pa.size, pb.size].max.times do |i|
        ai = pa[i] || 0
        bi = pb[i] || 0
        return -1 if ai < bi
        return  1 if ai > bi
      end
      0
    end

    def self.skipped?(version)
      return false unless defined?(Sketchup)
      Sketchup.read_default('Ornato', PREFS_KEY_SKIP_VERSION, '').to_s == version.to_s
    end

    # ── Dialog ────────────────────────────────────────────────────────
    def self.show_update_dialog(info)
      return unless defined?(UI::HtmlDialog)

      latest    = info[:latest]
      changelog = info[:changelog] || ''
      force     = !!info[:force]
      url       = info[:url]
      sha256    = info[:sha256]

      dialog = UI::HtmlDialog.new(
        dialog_title:    force ? 'Atualização Obrigatória — Ornato CNC' : 'Atualização Disponível — Ornato CNC',
        preferences_key: 'ornato_update_dialog',
        scrollable:      false,
        resizable:       false,
        width:           520,
        height:          440,
        left:            200,
        top:             100,
        style:           UI::HtmlDialog::STYLE_DIALOG
      )

      html_path = File.join(PLUGIN_DIR, 'ornato_sketchup', 'ui', 'update_dialog.html') if defined?(PLUGIN_DIR)
      dialog.set_file(html_path) if html_path && File.exist?(html_path)

      dialog.add_action_callback('ready') do |_ctx|
        payload = {
          latest:    latest,
          current:   current_version,
          changelog: changelog,
          force:     force,
          min_compat_violation: !!info[:min_compat_violation],
        }
        dialog.execute_script("initUpdateDialog(#{payload.to_json})")
      end

      dialog.add_action_callback('download_update') do |_ctx|
        dialog.close
        perform_update(url, latest, sha256: sha256)
      end

      dialog.add_action_callback('skip_version') do |_ctx, version|
        if force
          log_warn('skip ignorado em update obrigatório')
        else
          Sketchup.write_default('Ornato', PREFS_KEY_SKIP_VERSION, version.to_s)
        end
        dialog.close
      end

      dialog.add_action_callback('remind_later') do |_ctx|
        if force
          log_warn('remind_later ignorado em update obrigatório')
        else
          Sketchup.write_default('Ornato', PREFS_KEY_LAST_CHECK,
                                 (Time.now.to_i - CHECK_INTERVAL + 3600).to_s)
        end
        dialog.close
      end

      dialog.add_action_callback('quit_plugin') do |_ctx|
        dialog.close
        # Em update forçado o user pode "Sair do plugin" — desabilita auto load
        Sketchup.write_default('Ornato', 'force_disabled', '1') if defined?(Sketchup)
        UI.messagebox('Plugin desabilitado. Reinicie o SketchUp ou atualize.') if defined?(UI)
      end

      dialog.show
    end

    # ── Download + verify + install ───────────────────────────────────
    def self.perform_update(download_url, latest_version, sha256: '')
      log_info("perform_update v=#{latest_version}")
      tmp = Sketchup.respond_to?(:temp_dir) ? Sketchup.temp_dir : Dir.tmpdir
      target = File.join(tmp, "ornato_update_#{latest_version}.rbz")

      header_sha = nil
      begin
        header_sha = download_to_file(download_url, target)
      rescue => e
        log_error("download falhou: #{e.message}")
        UI.messagebox("Erro ao baixar atualização:\n#{e.message}") if defined?(UI)
        return false
      end

      file_sha = Digest::SHA256.file(target).hexdigest.downcase

      # Verifica contra header e contra JSON
      json_sha   = sha256.to_s.downcase
      header_sha = header_sha.to_s.downcase

      if !json_sha.empty? && file_sha != json_sha
        log_error("SHA256 mismatch (json): expected=#{json_sha} got=#{file_sha}")
        File.delete(target) rescue nil
        UI.messagebox("Falha na verificação de integridade do arquivo (SHA256).\nAtualização abortada.") if defined?(UI)
        return false
      end

      if !header_sha.empty? && file_sha != header_sha
        log_error("SHA256 mismatch (header): expected=#{header_sha} got=#{file_sha}")
        File.delete(target) rescue nil
        UI.messagebox("Falha na verificação de integridade do arquivo (header).\nAtualização abortada.") if defined?(UI)
        return false
      end

      log_info("SHA256 OK (#{file_sha[0, 12]}...)")

      # Backup pré-install
      backup_dir = backup_current_install!
      log_info("backup criado em #{backup_dir}") if backup_dir

      # Install via API nativa do SketchUp
      if try_install(target)
        log_info("install OK v=#{latest_version}")
        # Limpa compat_violation se a nova versão satisfaz o min_required
        cv = compat_violation
        if cv && !version_lt?(latest_version, cv['min_required'].to_s)
          clear_compat_violation
        end
        send_telemetry(latest_version)
        UI.messagebox("Ornato CNC atualizado para v#{latest_version}.\nReinicie o SketchUp para aplicar.") if defined?(UI)
        return true
      else
        log_warn('install_from_archive falhou — fallback para Downloads/')
        fallback_path = copy_to_downloads(target, latest_version)
        UI.messagebox("Não foi possível instalar automaticamente.\n\nO arquivo foi salvo em:\n#{fallback_path}\n\nInstale manualmente via Window → Extension Manager.") if defined?(UI)
        return false
      end
    ensure
      # Cleanup só se install OK (mantém pra fallback caso erro)
      File.delete(target) if target && File.exist?(target) && @cleanup_temp rescue nil
    end

    def self.try_install(rbz_path)
      return false unless defined?(Sketchup) && Sketchup.respond_to?(:install_from_archive)
      result = Sketchup.install_from_archive(rbz_path, false)
      @cleanup_temp = !!result
      !!result
    rescue => e
      log_error("install_from_archive raised: #{e.message}")
      false
    end

    # ── Backup ────────────────────────────────────────────────────────
    def self.backup_current_install!
      return nil unless defined?(PLUGIN_DIR)
      src = File.join(PLUGIN_DIR, 'ornato_sketchup')
      return nil unless File.directory?(src)

      home = ENV['HOME'] || ENV['USERPROFILE'] || Dir.tmpdir
      dest_root = File.join(home, '.ornato', 'backups', current_version.to_s)
      FileUtils.mkdir_p(dest_root)
      FileUtils.cp_r(src, dest_root)
      dest_root
    rescue => e
      log_warn("backup falhou: #{e.message}")
      nil
    end

    def self.copy_to_downloads(src, version)
      home = ENV['HOME'] || ENV['USERPROFILE'] || Dir.tmpdir
      downloads = File.join(home, 'Downloads')
      FileUtils.mkdir_p(downloads)
      dest = File.join(downloads, "ornato_cnc_#{version}.rbz")
      FileUtils.cp(src, dest)
      dest
    rescue => e
      log_error("fallback copy falhou: #{e.message}")
      src
    end

    # ── Telemetria ────────────────────────────────────────────────────
    # Schema enviado (mínimo, sem PII):
    #   install_id, plugin_version, os, sketchup_version, locale, [event, extra]
    # NUNCA envia: nome de cliente, conteúdo de projeto, IP geo, fingerprint hardware.
    def self.send_telemetry(new_version, event: 'install', extra: nil)
      # Gate 1: usuário precisa ter respondido o dialog do primeiro uso.
      # Default é OFF: enquanto não houver decisão explícita, não envia nada.
      unless telemetry_decided?
        log_info("telemetry skipped (no user decision yet)")
        return nil
      end
      # Gate 2: opt-out — usuário decidiu não enviar telemetria.
      unless telemetry_enabled?
        log_info("telemetry skipped (opt-out)")
        return nil
      end

      config = defined?(Ornato::Config) ? Ornato::Config.load : {}
      api_url = config.dig(:api, :url) || 'http://localhost:3001'
      uri = URI("#{api_url}/api/plugin/telemetry")
      token = read_token
      return if token.to_s.empty?

      body = {
        plugin_version:    new_version,
        os:                RUBY_PLATFORM,
        sketchup_version:  (defined?(Sketchup) && Sketchup.respond_to?(:version)) ? Sketchup.version : 'unknown',
        install_id:        install_id,
        locale:            (defined?(Sketchup) && Sketchup.respond_to?(:get_locale)) ? Sketchup.get_locale : 'unknown',
        event:             event,
      }
      body[:extra] = extra if extra

      Net::HTTP.start(uri.host, uri.port,
                      open_timeout: 5, read_timeout: 8,
                      use_ssl: uri.scheme == 'https') do |http|
        req = Net::HTTP::Post.new(uri.request_uri)
        req['Authorization'] = "Bearer #{token}"
        req['Content-Type']  = 'application/json'
        req.body = body.to_json
        resp = http.request(req)
        log_info("telemetry[#{event}]: HTTP #{resp.code}")
      end

      if defined?(Sketchup) && Sketchup.respond_to?(:write_default)
        Sketchup.write_default('Ornato', PREFS_KEY_LAST_TELEMETRY, Time.now.to_i.to_s)
      end
      true
    rescue => e
      log_warn("telemetry falhou (non-fatal): #{e.message}")
      nil
    end

    # Envia um evento auxiliar (compat_violation_blocked etc.)
    def self.send_telemetry_event(event, **extra)
      send_telemetry(current_version, event: event, extra: extra)
    end

    # ── HTTP helpers ──────────────────────────────────────────────────
    def self.read_token
      return '' unless defined?(Sketchup) && Sketchup.respond_to?(:read_default)
      Sketchup.read_default('Ornato', 'auth_token', '').to_s
    end

    def self.http_get(uri, token: nil, open_timeout: 10, read_timeout: 30, redirect_limit: 5)
      raise 'redirect limit excedido' if redirect_limit <= 0
      Net::HTTP.start(uri.host, uri.port,
                      open_timeout: open_timeout, read_timeout: read_timeout,
                      use_ssl: uri.scheme == 'https') do |http|
        req = Net::HTTP::Get.new(uri.request_uri)
        req['Authorization'] = "Bearer #{token}" if token && !token.empty?
        resp = http.request(req)
        case resp.code.to_i
        when 200 then return resp
        when 301, 302, 307, 308
          new_uri = URI(resp['location'])
          return http_get(new_uri, token: token, open_timeout: open_timeout,
                                  read_timeout: read_timeout,
                                  redirect_limit: redirect_limit - 1)
        else
          return resp
        end
      end
    end

    # Streamed download direto pra disco. Retorna o valor do header
    # `Content-SHA256` (se houver) pra cross-check.
    def self.download_to_file(url_str, dest_path, redirect_limit: 5)
      raise 'redirect limit excedido' if redirect_limit <= 0
      uri = URI(url_str)
      token = read_token
      header_sha = nil

      Net::HTTP.start(uri.host, uri.port,
                      open_timeout: 10, read_timeout: 120,
                      use_ssl: uri.scheme == 'https') do |http|
        req = Net::HTTP::Get.new(uri.request_uri)
        req['Authorization'] = "Bearer #{token}" unless token.empty?
        http.request(req) do |resp|
          case resp.code.to_i
          when 200
            header_sha = resp['Content-SHA256'] || resp['content-sha256']
            File.open(dest_path, 'wb') do |f|
              resp.read_body { |chunk| f.write(chunk) }
            end
          when 301, 302, 307, 308
            new_url = resp['location']
            return download_to_file(new_url, dest_path, redirect_limit: redirect_limit - 1)
          else
            raise "HTTP #{resp.code}: #{resp.message}"
          end
        end
      end
      header_sha
    end
  end
end
