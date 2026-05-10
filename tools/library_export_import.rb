#!/usr/bin/env ruby
# frozen_string_literal: true
# ─────────────────────────────────────────────────────────────────────────────
# Library Export/Import — pacote zip via API REST (LIB-EDIT)
# Standalone, sem deps externas além de stdlib.
#
# Usage:
#   API_URL=http://localhost:3001 AUTH_TOKEN=<jwt> \
#     ruby tools/library_export_import.rb export <module_id> [--out=./output.zip]
#
#   API_URL=http://localhost:3001 AUTH_TOKEN=<jwt> \
#     ruby tools/library_export_import.rb import ./balcao.zip --channel=dev
#
# Endpoints usados:
#   GET  /api/library/admin/modules/:id/export.zip  (Bearer)
#   POST /api/library/admin/import                  (multipart: file, channel)
# ─────────────────────────────────────────────────────────────────────────────

require 'json'
require 'net/http'
require 'uri'
require 'securerandom'
require 'pathname'

API_URL    = ENV['API_URL']    || 'http://localhost:3001'
AUTH_TOKEN = ENV['AUTH_TOKEN'] or abort 'AUTH_TOKEN env var obrigatório'

def parse_args(argv)
  cmd  = argv.shift
  rest = []
  opts = {}
  argv.each do |a|
    if a.start_with?('--')
      k, v = a.sub(/^--/, '').split('=', 2)
      opts[k.to_sym] = (v.nil? ? true : v)
    else
      rest << a
    end
  end
  [cmd, rest, opts]
end

def http_request(req)
  uri = URI(API_URL)
  Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https',
                  read_timeout: 120) do |http|
    http.request(req)
  end
end

def cmd_export(module_id, out_path)
  abort 'module_id obrigatório' if module_id.nil? || module_id.empty?
  out_path ||= "./#{module_id}.zip"

  uri = URI("#{API_URL}/api/library/admin/modules/#{URI.encode_www_form_component(module_id)}/export.zip")
  req = Net::HTTP::Get.new(uri)
  req['Authorization'] = "Bearer #{AUTH_TOKEN}"
  res = http_request(req)

  unless res.code == '200'
    warn "ERRO HTTP #{res.code}: #{res.body[0..400]}"
    exit 1
  end

  File.binwrite(out_path, res.body)
  puts "✓ exportado: #{out_path} (#{res.body.bytesize} bytes)"
end

def cmd_import(zip_path, channel)
  abort "arquivo não encontrado: #{zip_path}" unless File.file?(zip_path)
  channel ||= 'dev'
  unless %w[dev beta stable].include?(channel)
    abort "channel inválido: #{channel} (use dev|beta|stable)"
  end

  boundary = '----RB' + SecureRandom.hex(8)
  body = +''
  body << "--#{boundary}\r\n"
  body << %(Content-Disposition: form-data; name="channel"\r\n\r\n)
  body << "#{channel}\r\n"
  body << "--#{boundary}\r\n"
  body << %(Content-Disposition: form-data; name="file"; filename="#{File.basename(zip_path)}"\r\n)
  body << "Content-Type: application/zip\r\n\r\n"
  body.force_encoding(Encoding::ASCII_8BIT)
  body << File.binread(zip_path)
  body << "\r\n--#{boundary}--\r\n"

  uri = URI("#{API_URL}/api/library/admin/import")
  req = Net::HTTP::Post.new(uri)
  req['Authorization']  = "Bearer #{AUTH_TOKEN}"
  req['Content-Type']   = "multipart/form-data; boundary=#{boundary}"
  req['Content-Length'] = body.bytesize.to_s
  req.body = body
  res = http_request(req)

  case res.code
  when '201'
    parsed = JSON.parse(res.body) rescue {}
    mod = parsed['module'] || {}
    puts "✓ importado: #{mod['id']} v#{mod['version']} (#{channel})"
    if parsed['warnings']&.any?
      puts "Warnings:"
      parsed['warnings'].each { |w| puts "  - #{w}" }
    end
  when '409'
    parsed = JSON.parse(res.body) rescue {}
    warn "✗ conflito: módulo em edição por #{parsed['locked_by_name']}"
    exit 2
  else
    warn "ERRO HTTP #{res.code}: #{res.body[0..400]}"
    exit 1
  end
end

def usage
  puts <<~USAGE
    Usage:
      ruby tools/library_export_import.rb export <module_id> [--out=./output.zip]
      ruby tools/library_export_import.rb import ./balcao.zip [--channel=dev]

    Env:
      API_URL=#{API_URL}
      AUTH_TOKEN=<JWT>
  USAGE
end

cmd, rest, opts = parse_args(ARGV)
case cmd
when 'export' then cmd_export(rest[0], opts[:out])
when 'import' then cmd_import(rest[0], opts[:channel])
else
  usage
  exit 1
end
