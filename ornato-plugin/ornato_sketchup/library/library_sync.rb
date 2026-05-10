# frozen_string_literal: true
# =====================================================================
# Ornato::Library::LibrarySync — sync incremental do catálogo da
# biblioteca Ornato (modelos .skp + JSONs paramétricos) com o ERP.
#
# Responsabilidades:
#   • baixa GET /api/library/manifest no startup (incremental via
#     ?since=<library_version>) e cacheia em ~/.ornato/library/cache
#   • baixa GET /api/library/asset/:id sob demanda quando o usuário
#     arrasta um módulo, validando Content-SHA256
#   • mantém um cache LRU em disco com limite configurável (default 500MB)
#   • expõe search() que delega para GET /api/library/search
#
# Não toca em wps_source/, biblioteca/ ou JsonModuleBuilder. A integração
# com resolve_componente_path() acontece no sprint B3.
# =====================================================================

require 'net/http'
require 'uri'
require 'json'
require 'digest'
require 'fileutils'
require 'time'

module Ornato
  module Library
    class LibrarySync
      CACHE_DIR      = File.expand_path('~/.ornato/library/cache')
      DEFAULT_MAX_MB = 500
      DEFAULT_TIMEOUT = 30
      DEFAULT_BASE_URL = 'http://localhost:3001'

      class IntegrityError < StandardError; end
      class HttpError      < StandardError; end

      def self.instance
        @inst ||= new
      end

      # Permite testes substituirem a instância singleton
      def self.instance=(obj)
        @inst = obj
      end

      def self.reset!
        @inst = nil
      end

      def initialize(cache_dir: CACHE_DIR, base_url: nil, token: nil, timeout: DEFAULT_TIMEOUT)
        @cache_dir = cache_dir
        @timeout   = timeout
        @base_url  = (base_url || read_default('api_url', DEFAULT_BASE_URL)).to_s.chomp('/')
        @token     = token || read_default('auth_token', '')
        FileUtils.mkdir_p(@cache_dir)
      end

      # ─────────────────────────────────────────────────────────────────
      # API pública
      # ─────────────────────────────────────────────────────────────────

      # Baixa manifest se mudou. Idempotente quando já está atualizado.
      # @param force [Boolean] força refetch ignorando ?since
      # @return [Hash] manifest atualizado (ou cacheado se sem mudanças)
      def sync_manifest(force: false)
        current = force ? nil : safe_read_manifest
        since_v = current && current['library_version']
        url = "#{@base_url}/api/library/manifest"
        url += "?since=#{URI.encode_www_form_component(since_v)}" if since_v && !force

        log(:info, "LibrarySync: GET #{url}")
        response = http_get(URI.parse(url))

        unless response.is_a?(Net::HTTPSuccess)
          log(:warn, "LibrarySync: manifest HTTP #{response.code}")
          return current || {}
        end

        body = parse_json(response.body)
        # Resposta vazia ou sem módulos → preserva cache local
        modules = body['modules'] || []
        if modules.empty? && current
          log(:info, 'LibrarySync: manifest sem mudanças, mantendo cache local')
          return current
        end

        write_manifest_atomic(body)
        log(:info, "LibrarySync: manifest atualizado v=#{body['library_version']} modules=#{modules.length}")
        body
      rescue StandardError => e
        log(:warn, "LibrarySync.sync_manifest falhou: #{e.message}")
        safe_read_manifest || {}
      end

      # Baixa um asset (.skp/.json/.png) sob demanda. Cache hit retorna
      # o caminho local imediatamente.
      # @param rel_path [String] ex: "ferragens/dobradica_amor.skp"
      # @return [String] caminho absoluto do arquivo no cache
      def fetch_asset(rel_path)
        raise ArgumentError, 'rel_path vazio' if rel_path.nil? || rel_path.to_s.empty?

        local = cache_path_for(rel_path)
        sha_file = "#{local}.sha256"

        # Cache hit: arquivo + sidecar sha256 existem e batem
        if File.exist?(local) && File.exist?(sha_file)
          expected = File.read(sha_file).strip
          if verify_sha256(local, expected)
            touch_access(rel_path)
            return local
          else
            log(:warn, "LibrarySync: cache corrompido, refetch #{rel_path}")
            File.delete(local) rescue nil
            File.delete(sha_file) rescue nil
          end
        end

        # Cache miss → baixa
        url = "#{@base_url}/api/library/asset/#{rel_path}"
        log(:info, "LibrarySync: GET #{url}")
        response = http_get(URI.parse(url))
        raise HttpError, "HTTP #{response.code} em #{rel_path}" unless response.is_a?(Net::HTTPSuccess)

        body = response.body.to_s
        expected_sha = response['Content-SHA256'] || response['content-sha256'] ||
                       Digest::SHA256.hexdigest(body)
        actual_sha   = Digest::SHA256.hexdigest(body)

        if expected_sha != actual_sha
          raise IntegrityError, "SHA256 mismatch em #{rel_path} (#{expected_sha} vs #{actual_sha})"
        end

        # LRU eviction antes de salvar (libera espaço se necessário)
        lru_evict_if_needed(body.bytesize)

        FileUtils.mkdir_p(File.dirname(local))
        # Escrita atômica via temp file
        tmp = "#{local}.tmp"
        File.binwrite(tmp, body)
        File.rename(tmp, local)
        File.write(sha_file, actual_sha)

        record_access(rel_path, body.bytesize)
        log(:info, "LibrarySync: asset cacheado #{rel_path} (#{body.bytesize}B)")
        local
      rescue IntegrityError => e
        # Apaga qualquer fragmento corrompido
        File.delete(local) rescue nil
        File.delete("#{local}.tmp") rescue nil
        File.delete("#{local}.sha256") rescue nil
        log(:error, "LibrarySync: integridade #{e.message}")
        raise
      end

      # Pesquisa no ERP (não cacheada — sempre online).
      # @param query [String] termo livre
      # @param filters [Hash] ex: { category: 'puxadores' }
      # @return [Array<Hash>] resultados (ou [] se erro)
      def search(query, filters = {})
        params = { q: query }.merge(filters)
        qs = params.map { |k, v| "#{k}=#{URI.encode_www_form_component(v.to_s)}" }.join('&')
        url = "#{@base_url}/api/library/search?#{qs}"
        log(:info, "LibrarySync: search #{query.inspect}")
        response = http_get(URI.parse(url))
        return [] unless response.is_a?(Net::HTTPSuccess)

        body = parse_json(response.body)
        body.is_a?(Array) ? body : (body['results'] || [])
      rescue StandardError => e
        log(:warn, "LibrarySync.search falhou: #{e.message}")
        []
      end

      # Estatísticas do cache em disco.
      def cache_stats
        meta = read_meta
        log_entries = meta['access_log'] || []
        used = log_entries.sum { |e| e['size'].to_i }
        oldest = log_entries.map { |e| e['last_accessed_at'] }.compact.min
        {
          used_mb:    (used.to_f / (1024 * 1024)).round(2),
          max_mb:     configured_max_mb,
          file_count: log_entries.length,
          oldest_ts:  oldest,
        }
      end

      # Apaga todo o cache (preserva o diretório).
      def clear_cache
        FileUtils.rm_rf(@cache_dir)
        FileUtils.mkdir_p(@cache_dir)
        log(:info, 'LibrarySync: cache limpo')
        true
      end

      def set_max_mb(mb)
        write_default('library_max_mb', mb.to_i)
        mb.to_i
      end

      def configured_max_mb
        read_default('library_max_mb', DEFAULT_MAX_MB).to_i
      end

      # Manifest cacheado já parseado (Hash). {} se ausente.
      def manifest
        safe_read_manifest || {}
      end

      # ─────────────────────────────────────────────────────────────────
      # Privadas
      # ─────────────────────────────────────────────────────────────────
      private

      def manifest_path
        File.join(@cache_dir, 'manifest.json')
      end

      def meta_path
        File.join(@cache_dir, 'meta.json')
      end

      def cache_path_for(rel_path)
        # Bloqueia path traversal (../) — sempre relativo ao cache_dir
        clean = rel_path.to_s.gsub(/\.\.[\/\\]/, '').sub(%r{^[/\\]}, '')
        File.join(@cache_dir, clean)
      end

      def safe_read_manifest
        return nil unless File.exist?(manifest_path)
        JSON.parse(File.read(manifest_path))
      rescue StandardError
        nil
      end

      def write_manifest_atomic(body)
        tmp = "#{manifest_path}.tmp"
        File.write(tmp, JSON.pretty_generate(body))
        File.rename(tmp, manifest_path)
        File.write("#{manifest_path}.sha256", Digest::SHA256.hexdigest(File.read(manifest_path)))
      end

      def read_meta
        return { 'access_log' => [], 'total_bytes' => 0 } unless File.exist?(meta_path)
        JSON.parse(File.read(meta_path))
      rescue StandardError
        { 'access_log' => [], 'total_bytes' => 0 }
      end

      def write_meta(meta)
        tmp = "#{meta_path}.tmp"
        File.write(tmp, JSON.pretty_generate(meta))
        File.rename(tmp, meta_path)
      end

      def record_access(rel_path, size)
        meta = read_meta
        entries = meta['access_log'] || []
        entries.reject! { |e| e['path'] == rel_path }
        entries << { 'path' => rel_path, 'last_accessed_at' => Time.now.utc.iso8601, 'size' => size.to_i }
        meta['access_log']  = entries
        meta['total_bytes'] = entries.sum { |e| e['size'].to_i }
        write_meta(meta)
      end

      def touch_access(rel_path)
        meta = read_meta
        entries = meta['access_log'] || []
        entry = entries.find { |e| e['path'] == rel_path }
        return unless entry
        entry['last_accessed_at'] = Time.now.utc.iso8601
        meta['access_log'] = entries
        write_meta(meta)
      end

      # Apaga arquivos LRU até caber +new_size dentro do limite.
      def lru_evict_if_needed(new_size)
        max_bytes = configured_max_mb * 1024 * 1024
        meta = read_meta
        entries = meta['access_log'] || []
        total = entries.sum { |e| e['size'].to_i }
        return if total + new_size <= max_bytes

        # ordena por timestamp ASC (mais antigos primeiro)
        sorted = entries.sort_by { |e| e['last_accessed_at'].to_s }
        evicted = []
        sorted.each do |entry|
          break if total + new_size <= max_bytes
          path = cache_path_for(entry['path'])
          if File.exist?(path)
            File.delete(path) rescue nil
            File.delete("#{path}.sha256") rescue nil
          end
          total -= entry['size'].to_i
          evicted << entry['path']
        end
        meta['access_log']  = entries.reject { |e| evicted.include?(e['path']) }
        meta['total_bytes'] = meta['access_log'].sum { |e| e['size'].to_i }
        write_meta(meta)
        log(:info, "LibrarySync: LRU evict #{evicted.length} arquivos") unless evicted.empty?
      end

      def verify_sha256(path, expected)
        return false unless File.exist?(path)
        actual = Digest::SHA256.hexdigest(File.binread(path))
        actual == expected.to_s.strip
      end

      # HTTP GET — segue o pattern de api_sync.rb.
      def http_get(uri, headers: {})
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.open_timeout = @timeout
        http.read_timeout = @timeout
        http.verify_mode = OpenSSL::SSL::VERIFY_PEER if http.use_ssl?

        request = Net::HTTP::Get.new(uri.request_uri)
        request['Accept']     = '*/*'
        request['User-Agent'] = "Ornato-LibrarySync/#{plugin_version}"
        request['Authorization'] = "Bearer #{@token}" unless @token.nil? || @token.empty?
        headers.each { |k, v| request[k] = v }
        http.request(request)
      end

      def parse_json(body)
        return {} if body.nil? || body.empty?
        JSON.parse(body)
      rescue JSON::ParserError
        {}
      end

      def plugin_version
        defined?(::Ornato::Version) ? ::Ornato::Version.current[:version] : '0.0.0-dev'
      rescue StandardError
        '0.0.0-dev'
      end

      def read_default(key, fallback)
        if defined?(::Sketchup) && ::Sketchup.respond_to?(:read_default)
          ::Sketchup.read_default('Ornato', key, fallback)
        else
          fallback
        end
      rescue StandardError
        fallback
      end

      def write_default(key, value)
        return unless defined?(::Sketchup) && ::Sketchup.respond_to?(:write_default)
        ::Sketchup.write_default('Ornato', key, value)
      rescue StandardError
        nil
      end

      # Logger aware fallback (testes podem rodar sem Logger carregado).
      def log(level, msg)
        if defined?(::Ornato::Logger)
          ::Ornato::Logger.public_send(level, msg)
        else
          $stdout.puts("[#{level.to_s.upcase}] #{msg}")
        end
      rescue StandardError
        nil
      end
    end
  end
end
