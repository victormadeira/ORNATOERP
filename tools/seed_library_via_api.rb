#!/usr/bin/env ruby
# frozen_string_literal: true
# ─────────────────────────────────────────────────────────────────────────────
# Sobe biblioteca paramétrica + .skp pra cloud via API REST.
# Executável standalone, idempotente. Sprint B5.
#
# Usage:
#   API_URL=http://localhost:3001 \
#   AUTH_TOKEN=<jwt> \
#   ruby tools/seed_library_via_api.rb [--dry-run] [--channel dev|beta|stable]
#
# Endpoints usados:
#   POST /api/library/admin/modules   (multipart: json_file, thumbnail?, skp_files[])
#
# Códigos esperados:
#   201  → criado          (count em "created")
#   409  → já existe       (count em "skipped")
#   outros → erro          (count em "errors")
# ─────────────────────────────────────────────────────────────────────────────

require 'json'
require 'net/http'
require 'uri'
require 'securerandom'
require 'pathname'

module SeedLibrary
  ROOT      = Pathname.new(File.expand_path('..', __dir__))
  PLUGIN    = ROOT.join('ornato-plugin', 'biblioteca')
  MOVEIS    = PLUGIN.join('moveis')
  MODELOS   = PLUGIN.join('modelos_ornato')

  # Subdiretórios "originais" Ornato (47). NÃO incluir wps_imported nem wps_source.
  ORIGINAL_DIRS = %w[area_servico banheiro closet comercial cozinha dormitorio escritorio sala].freeze
  # Importados (237) — refs já corrigidas (ornato_imported, NÃO wps_imported).
  IMPORTED_DIR  = 'ornato_imported'

  # ── Discovery ──────────────────────────────────────────────────────────────
  def self.discover_jsons
    files = []
    ORIGINAL_DIRS.each do |sub|
      dir = MOVEIS.join(sub)
      next unless dir.directory?
      files.concat(Dir.glob(dir.join('*.json').to_s))
    end
    imported = MOVEIS.join(IMPORTED_DIR)
    files.concat(Dir.glob(imported.join('**', '*.json').to_s)) if imported.directory?
    files.sort.uniq
  end

  # Extrai todas as refs de componente_3d (relativas a modelos_ornato/) do JSON.
  # Busca recursiva — componente_3d pode aparecer em pecas[], ferragens_auto[],
  # agregados, etc. Coletamos qualquer string sob a chave "componente_3d".
  def self.skp_refs_for(json_data)
    refs = []
    walk = lambda do |node|
      case node
      when Hash
        node.each do |k, v|
          if k == 'componente_3d' && v.is_a?(String) && !v.empty?
            refs << v
          else
            walk.call(v)
          end
        end
      when Array
        node.each { |x| walk.call(x) }
      end
    end
    walk.call(json_data)
    refs.uniq
  end

  # Resolve refs em paths absolutos existentes em modelos_ornato/.
  # Retorna [array de paths existentes, array de refs faltantes].
  def self.resolve_skp_paths(refs)
    found, missing = [], []
    refs.each do |ref|
      abs = MODELOS.join(ref)
      if abs.file?
        found << abs.to_s
      else
        missing << ref
      end
    end
    [found.uniq, missing]
  end

  # Procura thumbnail PNG com o mesmo basename do JSON, no mesmo dir.
  def self.thumbnail_for(json_path)
    p = Pathname.new(json_path)
    candidate = p.dirname.join("#{p.basename('.json')}.png")
    candidate.file? ? candidate.to_s : nil
  end

  # ── HTTP multipart ─────────────────────────────────────────────────────────
  # Constrói corpo multipart manualmente (stdlib, sem dependência externa).
  # parts: array of hashes:
  #   { name: 'json_file', filename: 'x.json', content: bytes, content_type: 'application/json' }
  #   { name: 'channel',   value: 'dev' }   # campo simples
  def self.build_multipart(parts)
    boundary = "----OrnatoSeed#{SecureRandom.hex(12)}"
    body = String.new(encoding: Encoding::ASCII_8BIT)
    parts.each do |part|
      body << "--#{boundary}\r\n"
      if part[:filename]
        body << %(Content-Disposition: form-data; name="#{part[:name]}"; filename="#{part[:filename]}"\r\n)
        body << "Content-Type: #{part[:content_type] || 'application/octet-stream'}\r\n\r\n"
        body << part[:content].to_s.dup.force_encoding(Encoding::ASCII_8BIT)
        body << "\r\n"
      else
        body << %(Content-Disposition: form-data; name="#{part[:name]}"\r\n\r\n)
        body << part[:value].to_s.dup.force_encoding(Encoding::ASCII_8BIT)
        body << "\r\n"
      end
    end
    body << "--#{boundary}--\r\n"
    [body, boundary]
  end

  # POST com 1 retry em network error. Retorna Net::HTTPResponse ou nil em falha total.
  def self.http_post_multipart(uri, parts, token, timeout: 60)
    body, boundary = build_multipart(parts)
    attempt = 0
    begin
      attempt += 1
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == 'https')
      http.open_timeout = 10
      http.read_timeout = timeout
      req = Net::HTTP::Post.new(uri.request_uri)
      req['Authorization'] = "Bearer #{token}"
      req['Content-Type']  = "multipart/form-data; boundary=#{boundary}"
      req.body = body
      http.request(req)
    rescue Errno::ECONNREFUSED, Errno::ETIMEDOUT, Net::OpenTimeout,
           Net::ReadTimeout, SocketError, EOFError => e
      if attempt < 2
        warn "  ! network error (#{e.class}: #{e.message}) — retrying..."
        retry
      end
      OpenStruct.new(code: '000', body: "network: #{e.class}: #{e.message}")
    end
  end

  # ── Builder do payload por módulo ──────────────────────────────────────────
  def self.build_parts_for(json_path, channel:, status:)
    raw = File.read(json_path)
    data = JSON.parse(raw)
    refs = skp_refs_for(data)
    skps, missing = resolve_skp_paths(refs)
    thumb = thumbnail_for(json_path)

    parts = []
    parts << {
      name: 'json_file',
      filename: File.basename(json_path),
      content: raw,
      content_type: 'application/json'
    }
    skps.each do |skp|
      parts << {
        name: 'skp_files',
        filename: skp.sub("#{MODELOS}/", ''),  # preserva subdir relativo
        content: File.binread(skp),
        content_type: 'application/octet-stream'
      }
    end
    if thumb
      parts << {
        name: 'thumbnail',
        filename: File.basename(thumb),
        content: File.binread(thumb),
        content_type: 'image/png'
      }
    end
    parts << { name: 'channel', value: channel }
    parts << { name: 'status',  value: status  }

    {
      id: data['id'],
      parts: parts,
      skp_count: skps.length,
      missing_refs: missing,
      has_thumb: !thumb.nil?
    }
  end

  # ── Runner ─────────────────────────────────────────────────────────────────
  def self.run(argv)
    require 'ostruct'
    dry_run = argv.include?('--dry-run')
    channel = 'dev'
    if (i = argv.index('--channel'))
      channel = argv[i + 1] if argv[i + 1]
    end
    unless %w[dev beta stable].include?(channel)
      abort "ERROR: --channel must be one of dev|beta|stable (got: #{channel.inspect})"
    end
    status = ENV.fetch('SEED_STATUS', 'draft')

    api_url = ENV.fetch('API_URL', 'http://localhost:3001')
    token   = ENV['AUTH_TOKEN']
    if !dry_run && (token.nil? || token.empty?)
      abort "ERROR: AUTH_TOKEN env obrigatório (Bearer JWT). Use --dry-run pra testar discovery."
    end

    uri = URI.join(api_url, '/api/library/admin/modules')

    files = discover_jsons
    total = files.length
    puts "─────────────────────────────────────────────────"
    puts " Ornato Library Seed via API"
    puts "─────────────────────────────────────────────────"
    puts "  endpoint  : POST #{uri}"
    puts "  channel   : #{channel}"
    puts "  status    : #{status}"
    puts "  dry-run   : #{dry_run ? 'YES' : 'no'}"
    puts "  discovered: #{total} JSONs"
    puts "─────────────────────────────────────────────────"

    created, skipped, errors = 0, 0, 0
    error_log = []

    files.each_with_index do |json_path, i|
      rel = Pathname.new(json_path).relative_path_from(ROOT).to_s
      bundle =
        begin
          build_parts_for(json_path, channel: channel, status: status)
        rescue => e
          errors += 1
          msg = "[#{i + 1}/#{total}] ✗ build failed #{rel}: #{e.message}"
          puts msg
          error_log << msg
          next
        end

      id = bundle[:id] || File.basename(json_path, '.json')
      meta = "skp=#{bundle[:skp_count]} thumb=#{bundle[:has_thumb] ? 'yes' : 'no'}"
      meta += " missing=#{bundle[:missing_refs].length}" if bundle[:missing_refs].any?

      if dry_run
        puts "[#{i + 1}/#{total}] (dry) #{id} (#{rel}) #{meta}"
        if bundle[:missing_refs].any?
          bundle[:missing_refs].each { |r| puts "      ! missing skp ref: #{r}" }
        end
        next
      end

      print "[#{i + 1}/#{total}] uploading #{id} (channel=#{channel}) #{meta} ... "
      res = http_post_multipart(uri, bundle[:parts], token)
      code = res.respond_to?(:code) ? res.code.to_s : '000'
      case code
      when '201'
        created += 1
        puts "201 OK"
      when '409'
        skipped += 1
        puts "409 (already exists, skipped)"
      else
        errors += 1
        body = res.respond_to?(:body) ? res.body.to_s[0, 200] : ''
        puts "#{code} ERROR"
        msg = "  #{id}: HTTP #{code} — #{body}"
        puts msg
        error_log << msg
      end
    end

    puts "─────────────────────────────────"
    puts "Total: #{total}"
    puts "  ✓ Created:    #{created}"
    puts "  ⊘ Skipped:    #{skipped}"
    puts "  ✗ Errors:     #{errors}"
    puts "─────────────────────────────────"
    unless error_log.empty?
      puts "\nError details:"
      error_log.each { |m| puts m }
    end

    exit(errors == 0 ? 0 : 1)
  end
end

# Standalone entry point (não executa quando require'd em testes)
if $PROGRAM_NAME == __FILE__
  SeedLibrary.run(ARGV)
end
