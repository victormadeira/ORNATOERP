# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# core/version.rb — Versão do plugin lida dinamicamente de version.txt
#
# version.txt fica na raiz do plugin (mesmo nível de ornato_sketchup/) e é
# (re)gerado pelo CI antes de empacotar o RBZ via tools/build_version.sh.
#
# Formato esperado (todos campos opcionais exceto a versão na 1a linha):
#   0.4.2
#   sha:abc123
#   channel:dev
#   built:2026-05-10T10:30:00Z
#
# Fallbacks: se o arquivo não existe ou está malformado, usa defaults
# razoáveis ('0.0.0-dev' / sha 'unknown' / channel 'dev'). Nunca lança.
# ═══════════════════════════════════════════════════════════════════════

module Ornato
  module Version
    unless defined?(DEFAULTS)
      DEFAULTS = {
        version: '0.0.0-dev',
        sha:     'unknown',
        channel: 'dev',
        built:   nil
      }.freeze
    end

    # Caminho do version.txt: raiz do plugin (um nível acima de ornato_sketchup/)
    def self.version_file
      @version_file ||= File.expand_path(File.join(__dir__, '..', '..', 'version.txt'))
    end

    # Permite override em testes
    def self.version_file=(path)
      @version_file = path
      reset!
    end

    def self.reset!
      @current = nil
    end

    def self.current
      @current ||= load_version
    end

    def self.full
      "#{current[:version]}+#{current[:sha]}"
    end

    def self.channel
      current[:channel] || DEFAULTS[:channel]
    end

    def self.built_at
      current[:built]
    end

    # ── private ─────────────────────────────────────────────────────────
    def self.load_version
      return DEFAULTS.dup unless File.exist?(version_file)

      raw = File.read(version_file) rescue nil
      return DEFAULTS.dup if raw.nil? || raw.strip.empty?

      result = DEFAULTS.dup
      lines = raw.lines.map(&:strip).reject(&:empty?)

      # 1a linha não-vazia: versão (sem prefixo)
      if lines.first && !lines.first.include?(':')
        result[:version] = lines.shift
      end

      lines.each do |line|
        next unless line.include?(':')
        key, _, value = line.partition(':')
        key = key.strip.downcase
        value = value.strip
        next if value.empty?
        case key
        when 'sha'     then result[:sha]     = value
        when 'channel' then result[:channel] = value
        when 'built'   then result[:built]   = value
        when 'version' then result[:version] = value
        end
      end

      result
    rescue StandardError
      DEFAULTS.dup
    end
  end
end

# ── Retrocompatibilidade ───────────────────────────────────────────────
# Mantém constante PLUGIN_VERSION (módulo Ornato) — vários arquivos legacy
# (api_sync.rb, auto_updater.rb, dialog_controller.rb, main.rb) ainda
# referenciam-na. Nova source-of-truth é Ornato::Version.current.
module Ornato
  unless defined?(PLUGIN_VERSION) && PLUGIN_VERSION == Version.current[:version]
    remove_const(:PLUGIN_VERSION) if defined?(PLUGIN_VERSION)
    PLUGIN_VERSION = Version.current[:version].freeze
  end
end
