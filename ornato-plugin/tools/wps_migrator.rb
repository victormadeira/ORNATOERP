#!/usr/bin/env ruby
# frozen_string_literal: true

# WPS Library Migrator
# Extracts .lib (ZIP) files from the WPS SketchUp library,
# normalizes filenames to snake_case, categorizes models,
# and generates a catalog.json manifest.
#
# Usage: ruby wps_migrator.rb

require 'fileutils'
require 'json'
require 'open3'
require 'time'

SOURCE_DIR  = File.expand_path("~/Downloads/Biblioteca WPS/models")
OUTPUT_DIR  = File.expand_path("~/SISTEMA NOVO/ornato-plugin/biblioteca/modelos")
CATALOG_PATH = File.join(OUTPUT_DIR, "catalog.json")

# ── Accent / diacritics table (Portuguese) ──────────────────────────
ACCENT_MAP = {
  'á' => 'a', 'à' => 'a', 'ã' => 'a', 'â' => 'a', 'ä' => 'a',
  'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
  'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
  'ó' => 'o', 'ò' => 'o', 'õ' => 'o', 'ô' => 'o', 'ö' => 'o',
  'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
  'ç' => 'c', 'ñ' => 'n',
  'Á' => 'a', 'À' => 'a', 'Ã' => 'a', 'Â' => 'a', 'Ä' => 'a',
  'É' => 'e', 'È' => 'e', 'Ê' => 'e', 'Ë' => 'e',
  'Í' => 'i', 'Ì' => 'i', 'Î' => 'i', 'Ï' => 'i',
  'Ó' => 'o', 'Ò' => 'o', 'Õ' => 'o', 'Ô' => 'o', 'Ö' => 'o',
  'Ú' => 'u', 'Ù' => 'u', 'Û' => 'u', 'Ü' => 'u',
  'Ç' => 'c', 'Ñ' => 'n'
}.freeze

def remove_accents(str)
  str.gsub(/[#{ACCENT_MAP.keys.join}]/) { |c| ACCENT_MAP[c] || c }
end

def to_snake_case(name)
  s = remove_accents(name.strip)
  s = s.downcase
  s = s.gsub(/[^a-z0-9]+/, '_')  # non-alphanum -> underscore
  s = s.gsub(/_{2,}/, '_')        # collapse multiple underscores
  s = s.sub(/^_/, '').sub(/_$/, '') # trim leading/trailing
  s
end

# ── Category classification ─────────────────────────────────────────
# Order matters: first match wins.  Patterns are tested against the
# ORIGINAL filename (before normalization) to preserve readability.
CATEGORY_RULES = [
  # Ferragens (hardware) -- must come before generic Porta match
  { category: 'ferragens',    pattern: /\A(Dobradica|Corredica|Minifix|Rafix|Cantoneira|Cavilha|Parafuso|Suporte|Pino|Sup Ixconnect)/i },

  # Puxadores (handles)
  { category: 'puxadores',    pattern: /\APuxador/i },
  { category: 'puxadores',    pattern: /\AFuracao.*(Puxador|Generico)/i },
  { category: 'puxadores',    pattern: /\ASem Puxador/i },

  # Gavetas (drawers)
  { category: 'gavetas',      pattern: /\A(Gaveta|Gav\.)/i },

  # Frentes (drawer fronts)
  { category: 'frentes',      pattern: /\AFrente/i },

  # Basculantes (lift-up doors) -- standalone basculante models (not Porta Basculante)
  { category: 'basculantes',  pattern: /\ABasculante/i },

  # Prateleiras (shelves)
  { category: 'prateleiras',  pattern: /\APrateleira/i },

  # Nichos
  { category: 'nichos',       pattern: /\ANicho/i },

  # Aereos (wall cabinets)
  { category: 'aereos',       pattern: /Corpo Aereo/i },

  # Consoles
  { category: 'consoles',     pattern: /Console/i },

  # Corpos (cabinet bodies) -- Corpo Simples / Corpo Duplo
  { category: 'corpos',       pattern: /\ACorpo (Simples|Duplo)/i },

  # Roupeiros (wardrobes)
  { category: 'roupeiros',    pattern: /\ARoup/i },

  # Acessorios -- broad bucket
  { category: 'acessorios',   pattern: /\A(Sapateira|Tulha|Porta Latas|Pe Nivelador|Rodape|Estrutura|Kit Desempenador|Tampo Vidro|Mascara|Fixacao|Perfil)/i },

  # Portas (doors) -- very broad, keep near end
  { category: 'portas',       pattern: /\A(Porta|Conjunto Porta)/i },

  # Kits -- catch-all for remaining Kit* items
  { category: 'kits',         pattern: /\AKit/i },
].freeze

def classify(original_name)
  CATEGORY_RULES.each do |rule|
    return rule[:category] if original_name.match?(rule[:pattern])
  end
  'acessorios' # fallback
end

# ── Main ────────────────────────────────────────────────────────────
unless Dir.exist?(SOURCE_DIR)
  abort "ERROR: Source directory not found: #{SOURCE_DIR}"
end

lib_files = Dir.glob(File.join(SOURCE_DIR, '*.lib')).sort
if lib_files.empty?
  abort "ERROR: No .lib files found in #{SOURCE_DIR}"
end

puts "WPS Library Migrator"
puts "=" * 60
puts "Source : #{SOURCE_DIR}"
puts "Output : #{OUTPUT_DIR}"
puts "Files  : #{lib_files.size} .lib archives"
puts "=" * 60

catalog = []
category_counts = Hash.new(0)
errors = []

lib_files.each_with_index do |lib_path, idx|
  original_basename = File.basename(lib_path, '.lib')
  category = classify(original_basename)
  snake_name = to_snake_case(original_basename)
  target_dir = File.join(OUTPUT_DIR, category)
  FileUtils.mkdir_p(target_dir)

  target_skp = File.join(target_dir, "#{snake_name}.skp")

  # Extract .skp from the ZIP (.lib) archive using system unzip
  # -o = overwrite, -j = junk paths (flatten), -d = destination
  tmp_dir = File.join(OUTPUT_DIR, '.tmp_extract')
  FileUtils.mkdir_p(tmp_dir)

  stdout, stderr, status = Open3.capture3('unzip', '-o', '-j', lib_path, '-d', tmp_dir)

  if status.success?
    # Find the extracted .skp file(s)
    extracted = Dir.children(tmp_dir)
    if extracted.empty?
      errors << "#{original_basename}: archive was empty"
      FileUtils.rm_rf(tmp_dir)
      next
    end
    # Take the first (usually only) file regardless of extension
    FileUtils.mv(File.join(tmp_dir, extracted.first), target_skp)
  else
    # Fallback: use Python zipfile for encoding-problematic archives
    py_script = "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);d=z.read(z.namelist()[0]);open(sys.argv[2],'wb').write(d)"
    _, py_err, py_status = Open3.capture3('python3', '-c', py_script, lib_path, target_skp)
    unless py_status.success?
      errors << "#{original_basename}: unzip failed and python fallback failed -- #{py_err.strip}"
      FileUtils.rm_rf(tmp_dir)
      next
    end
  end

  if true

    file_size = File.size(target_skp)
    category_counts[category] += 1

    catalog << {
      id: snake_name,
      original_name: original_basename,
      category: category,
      file_path: "#{category}/#{snake_name}.skp",
      file_size: file_size
    }

    printf "[%3d/%3d] %-40s -> %s/%s.skp\n", idx + 1, lib_files.size,
           original_basename, category, snake_name
  else
    errors << "#{original_basename}: unzip failed -- #{stderr.strip}"
  end

  # Clean up tmp
  FileUtils.rm_rf(tmp_dir)
end

# Write catalog.json
File.write(CATALOG_PATH, JSON.pretty_generate({
  version: "1.0",
  generated_at: Time.now.iso8601,
  total_models: catalog.size,
  categories: category_counts.sort_by { |_, v| -v }.to_h,
  models: catalog
}))

puts ""
puts "=" * 60
puts "MIGRATION COMPLETE"
puts "=" * 60
puts ""
puts "Category breakdown:"
category_counts.sort_by { |_, v| -v }.each do |cat, count|
  printf "  %-15s %3d models\n", cat, count
end
puts "  #{'─' * 25}"
printf "  %-15s %3d models\n", "TOTAL", catalog.size
puts ""
puts "Catalog written to: #{CATALOG_PATH}"

unless errors.empty?
  puts ""
  puts "ERRORS (#{errors.size}):"
  errors.each { |e| puts "  - #{e}" }
end
