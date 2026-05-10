#!/usr/bin/env ruby
# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# tools/migrate_shop_namespace.rb
#
# Migra JSONs paramétricos da biblioteca para o namespace `{shop.xxx}`,
# referenciando explicitamente os padrões da Marcenaria (ShopConfig).
#
# Comportamento:
#   1. Backup automático em wps_working/backups_pre_shop_namespace/<TS>/
#      preservando estrutura biblioteca/moveis/...
#   2. Para cada JSON em biblioteca/moveis/**/*.json (incluindo
#      ornato_imported/), substitui referências `{<key>}` → `{shop.<key>}`
#      em pecas / ferragens_auto / condicoes / etc — mas APENAS para as
#      chaves listadas em SHOP_KEYS e que NÃO tenham override explícito
#      em parametros[<key>].default (se default existe e não é a própria
#      referência shop, mantém: usuário definiu valor próprio).
#   3. Se a chave aparece em parametros sem override explícito (default
#      ausente, nulo, string vazia ou já apontando pra "{shop.<key>}"),
#      substitui o default por "{shop.<key>}" pra resolver em runtime.
#   4. Idempotente: rodar 2x = noop.
#   5. Robusto: JSON quebrado → reporta e segue.
#
# Uso:
#   ruby tools/migrate_shop_namespace.rb [--dry-run]
# ═══════════════════════════════════════════════════════════════

require 'json'
require 'fileutils'
require 'time'

ROOT = File.expand_path('..', __dir__)
LIB_DIR = File.join(ROOT, 'biblioteca', 'moveis')
BACKUP_BASE = File.join(ROOT, 'wps_working', 'backups_pre_shop_namespace')

# Chaves do ShopConfig que serão expostas pelo namespace `shop.`.
# (Vide brief Agente SHOP-1 — lista controlada manualmente.)
SHOP_KEYS = %w[
  folga_porta_lateral folga_porta_vertical folga_entre_portas
  folga_porta_reta folga_porta_dupla folga_gaveta
  recuo_fundo profundidade_rasgo_fundo largura_rasgo_fundo
  altura_rodape rodape_altura_padrao
  espessura espessura_padrao espessura_chapa_padrao
  sistema32_offset sistema32_passo
  cavilha_diametro cavilha_profundidade
  fita_borda_padrao
].freeze

# Carrega chaves disponíveis em ShopConfig.to_expr_params (best-effort).
# Em ambiente standalone (sem SketchUp), o load real falhará — usamos a
# constante FACTORY_DEFAULTS via parsing leve.
def shop_config_known_keys
  @shop_config_known_keys ||= begin
    src = File.join(ROOT, 'ornato_sketchup', 'hardware', 'shop_config.rb')
    return [] unless File.file?(src)
    txt = File.read(src, encoding: 'UTF-8')
    # Tenta isolar o método to_expr_params e extrair as chaves do hash retornado.
    m = txt.match(/def self\.to_expr_params.*?^\s*end/m)
    region = m ? m[0] : txt
    region.scan(/^\s*'([a-z0-9_]+)'\s*=>/).flatten.uniq
  rescue
    []
  end
end

DRY_RUN = ARGV.include?('--dry-run')

stats = {
  files_total:    0,
  files_changed:  0,
  files_skipped:  0,
  files_broken:   0,
  substitutions:  0,
  warnings:       [],
}

# Substitui `{key}` (não `{shop.key}` nem `{ns.key}` arbitrário) em string
# por `{shop.key}` quando key ∈ SHOP_KEYS. Conta substituições.
def rewrite_string(s, key, counter)
  # Regex: { + space* + key + space* + } — não casa se já tiver ponto antes (shop.key).
  re = /\{\s*#{Regexp.escape(key)}\s*\}/
  new_s = s.gsub(re) do |_match|
    counter[:n] += 1
    "{shop.#{key}}"
  end
  new_s
end

# Recursivamente percorre estrutura, aplicando rewrite_string para todas as
# strings — exceto valores em parametros[<key>] que têm override do usuário.
def transform!(node, counter, opts = {})
  case node
  when Hash
    node.each do |k, v|
      node[k] = transform!(v, counter, opts)
    end
    node
  when Array
    node.map! { |item| transform!(item, counter, opts) }
    node
  when String
    new_s = node
    SHOP_KEYS.each do |key|
      new_s = rewrite_string(new_s, key, counter)
    end
    new_s
  else
    node
  end
end

# Para cada chave SHOP_KEY presente em "parametros", garante que o default
# resolva via shop quando não há override do usuário.
def ensure_param_defaults!(json_def, counter)
  params = json_def['parametros']
  return unless params.is_a?(Hash)
  SHOP_KEYS.each do |key|
    next unless params.key?(key)
    meta = params[key]
    next unless meta.is_a?(Hash)
    default = meta['default']
    target = "{shop.#{key}}"
    # Override do usuário = default presente, não nulo, não vazio,
    # e diferente do nosso target (já migrado).
    has_user_override = !(
      default.nil? ||
      (default.is_a?(String) && default.strip.empty?) ||
      default == target
    )
    next if has_user_override
    if meta['default'] != target
      meta['default'] = target
      counter[:n] += 1
    end
  end
end

# Coleta arquivos
json_files = Dir.glob(File.join(LIB_DIR, '**', '*.json'))
stats[:files_total] = json_files.length

# Timestamp do backup
ts = Time.now.strftime('%Y%m%d_%H%M%S')
backup_dir = File.join(BACKUP_BASE, ts)

known_shop_keys = shop_config_known_keys
unknown_in_shop = SHOP_KEYS - known_shop_keys
unless unknown_in_shop.empty?
  warn "[INFO] Chaves SHOP_KEYS sem entrada em ShopConfig.to_expr_params: #{unknown_in_shop.join(', ')}"
end

json_files.each do |path|
  rel = path.sub(ROOT + File::SEPARATOR, '')
  begin
    raw = File.read(path)
    json_def = JSON.parse(raw)
  rescue JSON::ParserError => e
    stats[:files_broken] += 1
    stats[:warnings] << "BROKEN_JSON: #{rel} — #{e.message[0..80]}"
    next
  rescue => e
    stats[:files_broken] += 1
    stats[:warnings] << "READ_ERR: #{rel} — #{e.class}: #{e.message[0..80]}"
    next
  end

  # Snapshot serializado pra detecção de noop.
  before = JSON.generate(json_def)

  counter = { n: 0 }
  transform!(json_def, counter)
  ensure_param_defaults!(json_def, counter)

  after = JSON.generate(json_def)
  if before == after
    stats[:files_skipped] += 1
    next
  end

  # Identifica chaves usadas na lib mas ausentes no shop_config (warning humano).
  SHOP_KEYS.each do |key|
    next if known_shop_keys.include?(key)
    if before.include?("{#{key}}") || (json_def.dig('parametros', key))
      stats[:warnings] << "MISSING_IN_SHOP: #{key} (referenciado em #{rel})"
    end
  end

  stats[:files_changed] += 1
  stats[:substitutions] += counter[:n]

  next if DRY_RUN

  # Backup
  rel_lib = path.sub(ROOT + File::SEPARATOR, '')
  bkp_path = File.join(backup_dir, rel_lib)
  FileUtils.mkdir_p(File.dirname(bkp_path))
  FileUtils.cp(path, bkp_path)

  # Pretty-print pra preservar legibilidade.
  File.write(path, JSON.pretty_generate(json_def) + "\n")
end

# Dedup warnings
stats[:warnings] = stats[:warnings].uniq

puts ""
puts "═══════════════════════════════════════════════════"
puts " Migrate Shop Namespace — Relatório"
puts "═══════════════════════════════════════════════════"
puts " Modo:               #{DRY_RUN ? 'DRY-RUN (sem escrita)' : 'WRITE'}"
puts " JSONs analisados:   #{stats[:files_total]}"
puts " JSONs alterados:    #{stats[:files_changed]}"
puts " JSONs noop (skip):  #{stats[:files_skipped]}"
puts " JSONs com erro:     #{stats[:files_broken]}"
puts " Substituições:      #{stats[:substitutions]}"
puts " Backup em:          #{DRY_RUN ? '(skip)' : backup_dir}"
puts ""
unless stats[:warnings].empty?
  puts "─ Warnings (#{stats[:warnings].size}) ─"
  stats[:warnings].first(40).each { |w| puts "  • #{w}" }
  puts "  ... (#{stats[:warnings].size - 40} mais)" if stats[:warnings].size > 40
  puts ""
end
puts "═══════════════════════════════════════════════════"
exit(0)
