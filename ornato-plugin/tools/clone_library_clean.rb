# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# clone_library_clean.rb
#
# Parte A do "Agente Strip" — copia a biblioteca extraída do WPS pra um
# diretório espelho com nomes/paths "ornato-clean", sem tocar geometria.
#
# Origens (READ-ONLY):
#   biblioteca/modelos/                 (388 .skp)
#   biblioteca/modelos/catalog.json
#   biblioteca/moveis/wps_imported/     (237 .json)
#
# Destinos (criados/sobrescritos):
#   biblioteca/modelos_ornato/                   (.skp renomeados)
#   biblioteca/modelos_ornato/catalog.json
#   biblioteca/modelos_ornato/mapping.json       (casos ambíguos p/ humano)
#   biblioteca/migration_mapping.json            (old_id ↔ new_id)
#   biblioteca/moveis/ornato_imported/           (.json com paths atualizados)
#
# Idempotente: roda 2x sem duplicar nada.
#
# Uso:
#   ruby tools/clone_library_clean.rb
# ═══════════════════════════════════════════════════════════════════════

require 'json'
require 'fileutils'
require 'digest'
require 'find'

ROOT          = File.expand_path('..', __dir__)
SRC_MODELS    = File.join(ROOT, 'biblioteca', 'modelos')
DST_MODELS    = File.join(ROOT, 'biblioteca', 'modelos_ornato')
SRC_CATALOG   = File.join(SRC_MODELS, 'catalog.json')
DST_CATALOG   = File.join(DST_MODELS, 'catalog.json')
DST_MAPPING   = File.join(DST_MODELS, 'mapping.json')
MIGRATION_MAP = File.join(ROOT, 'biblioteca', 'migration_mapping.json')

SRC_MOVEIS    = File.join(ROOT, 'biblioteca', 'moveis', 'wps_imported')
DST_MOVEIS    = File.join(ROOT, 'biblioteca', 'moveis', 'ornato_imported')

# Tokens "WPS-ish" que dropamos do nome do arquivo.
# Ordem importa: padrões mais longos antes dos curtos.
RENAME_RULES = [
  # _cjold → _old   (preserva semântica de "old" mas remove marker WPS)
  { pattern: /_cjold(?=\.|_|$)/, replacement: '_old', label: 'cjold→old' },
  # _cj  → ''       (marker WPS interno "conjunto")
  { pattern: /_cj(?=\.|_|$)/,    replacement: '',     label: 'drop _cj'  },
  # wps_ prefixos (raros mas possíveis)
  { pattern: /\bwps_/i,          replacement: '',     label: 'drop wps_' }
].freeze

# Tokens AMBÍGUOS: aparecem mas podem ter outro significado. Marcamos pra revisão.
AMBIGUOUS_TOKENS = [].freeze

@stats = {
  dirs_created:        0,
  files_copied:        0,
  files_renamed:       0,
  files_skipped_same:  0,
  json_updated:        0,
  json_copied_clean:   0,
  ambiguous_cases:     []
}

def log(msg)
  puts "[clone_clean] #{msg}"
end

# Aplica regras de rename ao basename. Retorna [novo_nome, regras_aplicadas].
def clean_basename(name)
  applied = []
  out = name.dup
  RENAME_RULES.each do |rule|
    if out =~ rule[:pattern]
      out = out.gsub(rule[:pattern], rule[:replacement])
      applied << rule[:label]
    end
  end
  # colapsa __ duplos que possam ter sobrado
  out = out.gsub(/__+/, '_').gsub(/_(\.[a-z0-9]+)$/i, '\1')
  [out, applied]
end

# id slug a partir do basename sem extensão
def slug_id(basename_no_ext)
  basename_no_ext.downcase.gsub(/[^a-z0-9]+/, '_').gsub(/^_+|_+$/, '')
end

# ─── Parte 1: clonar .skp + montar mapping ───────────────────────────────
def clone_skp_files
  raise "modelos/ não encontrado em #{SRC_MODELS}" unless Dir.exist?(SRC_MODELS)

  FileUtils.mkdir_p(DST_MODELS)
  mapping = {}     # path_relativo_antigo => { new_path:, new_id:, old_id:, rules: }
  ambiguous = []

  Find.find(SRC_MODELS) do |path|
    next if File.directory?(path)
    rel  = path.sub("#{SRC_MODELS}/", '')
    next if rel == 'catalog.json'
    next unless rel.end_with?('.skp')

    dir       = File.dirname(rel)
    base      = File.basename(rel)
    new_base, applied = clean_basename(base)
    new_rel   = dir == '.' ? new_base : File.join(dir, new_base)
    dst_dir   = File.join(DST_MODELS, dir)
    dst_file  = File.join(DST_MODELS, new_rel)

    unless Dir.exist?(dst_dir)
      FileUtils.mkdir_p(dst_dir)
      @stats[:dirs_created] += 1
    end

    if File.exist?(dst_file) && File.size(dst_file) == File.size(path)
      @stats[:files_skipped_same] += 1
    else
      FileUtils.cp(path, dst_file)
      @stats[:files_copied] += 1
    end

    @stats[:files_renamed] += 1 unless applied.empty?

    old_id = slug_id(File.basename(base, '.skp'))
    new_id = slug_id(File.basename(new_base, '.skp'))

    mapping[rel] = {
      old_path: rel,
      new_path: new_rel,
      old_id:   old_id,
      new_id:   new_id,
      rules:    applied
    }

    # Detecção ambígua: nome ainda parece ter resíduo wps após limpeza
    if new_base =~ /wps|_cj/i
      ambiguous << { file: rel, after: new_rel, reason: 'token suspeito remanescente' }
    end
  end

  @stats[:ambiguous_cases] = ambiguous
  mapping
end

# ─── Parte 2: novo catalog.json ──────────────────────────────────────────
def write_catalog(skp_mapping)
  src = JSON.parse(File.read(SRC_CATALOG))
  models = src['models'].map do |m|
    old_path = m['file_path']
    map      = skp_mapping[old_path]
    if map
      {
        'id'        => map[:new_id],
        'category'  => m['category'],
        'file_path' => map[:new_path],
        'file_size' => m['file_size']
      }
    else
      # fallback: mantém entry sem original_name
      m.reject { |k, _| k == 'original_name' }
    end
  end

  out = {
    'version'       => '1.0-ornato',
    'generated_at'  => Time.now.strftime('%Y-%m-%dT%H:%M:%S%:z'),
    'total_models'  => models.size,
    'categories'    => src['categories'],
    'models'        => models
  }
  File.write(DST_CATALOG, JSON.pretty_generate(out))
end

# ─── Parte 3: atualizar JSONs de móveis ──────────────────────────────────
def update_moveis_jsons(skp_mapping)
  return unless Dir.exist?(SRC_MOVEIS)
  FileUtils.mkdir_p(DST_MOVEIS)

  Find.find(SRC_MOVEIS) do |path|
    next if File.directory?(path)
    rel = path.sub("#{SRC_MOVEIS}/", '')

    dst_dir  = File.join(DST_MOVEIS, File.dirname(rel))
    dst_file = File.join(DST_MOVEIS, rel)
    FileUtils.mkdir_p(dst_dir)

    if path.end_with?('.json')
      data = JSON.parse(File.read(path))
      changed = false

      # 1) componente_3d → re-mapear se aponta pra modelos/
      if data.is_a?(Hash) && data['componente_3d'].is_a?(String)
        old_ref = data['componente_3d']
        if (m = skp_mapping[old_ref])
          data['componente_3d'] = m[:new_path]
          changed = true
        end
      end

      # 2) _review.source_skp → idem
      if data.is_a?(Hash) && data['_review'].is_a?(Hash)
        rev = data['_review']
        if rev['source_skp'].is_a?(String) && (m = skp_mapping[rev['source_skp']])
          rev['source_skp'] = m[:new_path]
          changed = true
        end
        if rev.delete('wps_original_name')
          changed = true
        end
      end

      # 3) thumbnail: se contém _cj, limpa também
      if data.is_a?(Hash) && data['thumbnail'].is_a?(String)
        new_thumb, applied = clean_basename(data['thumbnail'])
        unless applied.empty?
          data['thumbnail'] = new_thumb
          changed = true
        end
      end

      # 4) codigo: WPS_* → ORNATO_*
      if data.is_a?(Hash) && data['codigo'].is_a?(String) && data['codigo'].start_with?('WPS_')
        data['codigo'] = data['codigo'].sub(/^WPS_/, 'ORNATO_')
        changed = true
      end

      File.write(dst_file, JSON.pretty_generate(data))
      @stats[:json_copied_clean] += 1
      @stats[:json_updated]      += 1 if changed
    elsif path.end_with?('.md')
      FileUtils.cp(path, dst_file)
    end
  end
end

# ─── Parte 4: arquivos de mapping pra revisão humana ─────────────────────
def write_mappings(skp_mapping)
  # mapping detalhado dentro de modelos_ornato/
  File.write(DST_MAPPING, JSON.pretty_generate(
    'generated_at' => Time.now.strftime('%Y-%m-%dT%H:%M:%S%:z'),
    'rules'        => RENAME_RULES.map { |r| { 'pattern' => r[:pattern].source, 'replacement' => r[:replacement], 'label' => r[:label] } },
    'ambiguous'    => @stats[:ambiguous_cases],
    'entries'      => skp_mapping
  ))

  # migration map enxuto: old_id → new_id
  migration = skp_mapping.values.each_with_object({}) do |v, h|
    h[v[:old_id]] = v[:new_id]
  end
  File.write(MIGRATION_MAP, JSON.pretty_generate(
    'generated_at' => Time.now.strftime('%Y-%m-%dT%H:%M:%S%:z'),
    'old_id_to_new_id' => migration
  ))
end

# ─── Run ─────────────────────────────────────────────────────────────────
def run
  log "Origem: #{SRC_MODELS}"
  log "Destino: #{DST_MODELS}"

  skp_mapping = clone_skp_files
  log "Clonados #{@stats[:files_copied]} .skp (#{@stats[:files_skipped_same]} já idênticos)"
  log "Renames aplicados: #{@stats[:files_renamed]}"

  write_catalog(skp_mapping)
  log "catalog.json escrito (#{skp_mapping.size} entries)"

  update_moveis_jsons(skp_mapping)
  log "JSONs móveis: #{@stats[:json_copied_clean]} copiados, #{@stats[:json_updated]} com refs atualizadas"

  write_mappings(skp_mapping)
  log "mappings escritos: #{DST_MAPPING}, #{MIGRATION_MAP}"

  if @stats[:ambiguous_cases].any?
    log "AMBÍGUOS pra revisão humana: #{@stats[:ambiguous_cases].size}"
  else
    log 'Sem casos ambíguos'
  end

  log 'OK'
end

run if $PROGRAM_NAME == __FILE__
