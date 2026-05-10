#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Migrador de keys de bordas inválidas → schema canônico.
#
# Mapeia:
#   frontal  → frente
#   traseira → tras
#   esq      → base
#   dir      → topo
#
# - Backup automático em wps_working/backups_pre_migration/<timestamp>/
# - Adiciona "_migration_notes" no JSON migrado pra rastreabilidade
# - Não toca arquivos já válidos
# - Idempotente (rodar 2x não corrompe)
#
# Uso: ruby tools/migrate_bordas_keys.rb

require 'json'
require 'fileutils'
require 'time'

ROOT       = File.expand_path('../..', __FILE__)
MOVEIS_DIR = File.join(ROOT, 'biblioteca/moveis')
BACKUP_DIR = File.join(ROOT, 'wps_working/backups_pre_migration', Time.now.strftime('%Y%m%d_%H%M%S'))

KEY_MAP = {
  'frontal'  => 'frente',
  'traseira' => 'tras',
  'esq'      => 'base',
  'dir'      => 'topo',
}.freeze

CANONICAL_KEYS = %w[frente tras topo base].freeze

def migrate_bordas(bordas)
  return [bordas, false] unless bordas.is_a?(Hash)
  has_invalid = bordas.keys.any? { |k| KEY_MAP.key?(k) }
  return [bordas, false] unless has_invalid

  migrated = {}
  bordas.each do |k, v|
    new_key = KEY_MAP[k] || k
    next unless CANONICAL_KEYS.include?(new_key)
    # Se ambos existirem (legado + canônico), preserva canônico (precedência)
    migrated[new_key] = bordas.key?(new_key) ? bordas[new_key] : v
  end
  # Garante 4 keys completas
  CANONICAL_KEYS.each { |k| migrated[k] = false unless migrated.key?(k) }
  [migrated, true]
end

def walk_pecas(pecas)
  return 0 unless pecas.is_a?(Array)
  count = 0
  pecas.each do |peca|
    next unless peca.is_a?(Hash) && peca['bordas']
    new_bordas, changed = migrate_bordas(peca['bordas'])
    if changed
      peca['bordas'] = new_bordas
      count += 1
    end
  end
  count
end

files = Dir.glob(File.join(MOVEIS_DIR, '**/*.json'))
puts "Migrador de Bordas — #{files.size} JSONs encontrados"
puts "Backup → #{BACKUP_DIR}"
puts '=' * 60

migrated_files = 0
total_pecas_migradas = 0
errors = []

files.each do |path|
  rel = path.sub("#{ROOT}/", '')
  begin
    raw = File.read(path)
    json = JSON.parse(raw)
    pecas_count = walk_pecas(json['pecas'])

    if pecas_count > 0
      # Backup
      backup_path = File.join(BACKUP_DIR, rel)
      FileUtils.mkdir_p(File.dirname(backup_path))
      File.write(backup_path, raw)

      # Audit trail
      json['_migration_notes'] ||= []
      json['_migration_notes'] << {
        'date'     => Time.now.iso8601,
        'tool'     => 'migrate_bordas_keys.rb',
        'mapping'  => KEY_MAP,
        'pecas_migradas' => pecas_count,
      }

      File.write(path, JSON.pretty_generate(json) + "\n")
      migrated_files += 1
      total_pecas_migradas += pecas_count
      printf "  [MIGRATED] %-60s (%d peças)\n", rel, pecas_count
    end
  rescue => e
    errors << "#{rel}: #{e.message}"
  end
end

puts '=' * 60
puts "Arquivos migrados: #{migrated_files}"
puts "Peças migradas:    #{total_pecas_migradas}"
puts "Backup em:         #{BACKUP_DIR}" if migrated_files > 0
unless errors.empty?
  puts ""
  puts "ERROS (#{errors.size}):"
  errors.each { |e| puts "  - #{e}" }
end
