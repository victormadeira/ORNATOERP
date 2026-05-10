#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Enriquecedor de parâmetros dos JSONs de módulos paramétricos.
#
# Para cada entrada do bloco `parametros`, adiciona (sem sobrescrever):
#   - label : rótulo legível em PT (heurística por key)
#   - type  : "number" | "select" | "boolean" | "string" (heurística pelos campos)
#   - unit  : alias de `unidade` (preserva ambos, igual canônico)
#
# - Backup automático em wps_working/backups_pre_enrichment/<timestamp>/
# - Adiciona "_enrichment_notes" no JSON migrado pra rastreabilidade
# - NÃO toca pecas/ferragens_auto/agregados_sugeridos/bordas
# - NÃO toca biblioteca/moveis/wps_imported/** nem balcao_2_portas.json
# - Idempotente (rodar 2x não corrompe)
#
# Uso: ruby tools/enrich_module_params.rb

require 'json'
require 'fileutils'
require 'time'

ROOT       = File.expand_path('../..', __FILE__)
MOVEIS_DIR = File.join(ROOT, 'biblioteca/moveis')
TIMESTAMP  = Time.now.strftime('%Y%m%d_%H%M%S')
BACKUP_DIR = File.join(ROOT, 'wps_working/backups_pre_enrichment', TIMESTAMP)

SKIP_PATHS = [
  File.join(MOVEIS_DIR, 'wps_imported'),
  File.join(MOVEIS_DIR, 'cozinha/balcao_2_portas.json'),
].freeze

# Mapa explícito de labels conhecidos
LABEL_MAP = {
  'largura'              => 'Largura',
  'altura'               => 'Altura',
  'profundidade'         => 'Profundidade',
  'espessura'            => 'Espessura MDF',
  'altura_rodape'        => 'Rodape',
  'material_carcaca'     => 'Material carcaca',
  'material_frente'      => 'Material portas/frentes',
  'material_fundo'       => 'Material fundo',
  'material_tampo'       => 'Material tampo',
  'material_porta'       => 'Material portas',
  'material_gaveta'      => 'Material gavetas',
  'com_tampo'            => 'Com tampo',
  'com_fundo'            => 'Com fundo',
  'com_rodape'           => 'Com rodape',
  'com_base'             => 'Com base',
  'com_porta'            => 'Com porta',
  'com_portas'           => 'Com portas',
  'com_gavetas'          => 'Com gavetas',
  'n_prateleiras'        => 'Prateleiras',
  'n_portas'             => 'Quantidade de portas',
  'n_gavetas'            => 'Quantidade de gavetas',
  'n_divisorias'         => 'Divisorias',
  'n_nichos'             => 'Nichos',
  'tipo_juncao'          => 'Juncao',
  'tipo_abertura'        => 'Tipo de abertura',
  'tipo_porta'           => 'Tipo de porta',
  'tipo_corredica'       => 'Tipo de corredica',
  'tipo_dobradica'       => 'Tipo de dobradica',
  'folga_porta_lateral'  => 'Folga lateral porta',
  'folga_porta_vertical' => 'Folga vertical porta',
  'folga_entre_portas'   => 'Folga entre portas',
  'folga_gaveta_lateral' => 'Folga lateral gaveta',
  'folga_entre_gavetas'  => 'Folga entre gavetas',
  'recuo_fundo'          => 'Recuo fundo',
  'recuo_rodape'         => 'Recuo rodape',
  'puxador_espacamento'  => 'Puxador',
  'sys32_ativo'          => 'System 32',
  'altura_gaveta'        => 'Altura gaveta',
  'altura_gavetas'       => 'Altura gavetas',
  'altura_maleiro'       => 'Altura maleiro',
  'altura_cabideiro'     => 'Altura cabideiro',
  'altura_pia'           => 'Altura pia',
  'altura_cooktop'       => 'Altura cooktop',
  'largura_pia'          => 'Largura pia',
  'largura_cooktop'      => 'Largura cooktop',
  'com_cabideiro'        => 'Com cabideiro',
  'com_maleiro'          => 'Com maleiro',
  'com_espelho'          => 'Com espelho',
  'com_led'              => 'Com LED',
  'com_nicho'            => 'Com nicho',
  'com_basculante'       => 'Com basculante',
  'com_escorredor'       => 'Com escorredor',
  'angulo_canto'         => 'Angulo do canto',
  'lado_canto'           => 'Lado do canto',
  'profundidade_a'       => 'Profundidade A',
  'profundidade_b'       => 'Profundidade B',
  'largura_a'            => 'Largura A',
  'largura_b'            => 'Largura B',
}.freeze

def titlecase_key(key)
  key.to_s.split('_').map { |w| w.capitalize }.join(' ')
end

def infer_type(param)
  return param['type'] if param.is_a?(Hash) && param['type']
  return 'select' if param.is_a?(Hash) && (param['options'] || param['opcoes'])
  if param.is_a?(Hash)
    default = param['default']
    return 'boolean' if default == true || default == false
    has_numeric_range = %w[min max step].any? { |k| param[k].is_a?(Numeric) }
    return 'number' if has_numeric_range || default.is_a?(Numeric)
    return 'string' if default.is_a?(String)
  end
  'string'
end

def infer_label(key)
  LABEL_MAP[key] || titlecase_key(key)
end

# Retorna [novo_param, mudou?, label_generico?]
def enrich_param(key, param)
  return [param, false, false] unless param.is_a?(Hash)

  original = param.dup
  enriched = param.dup

  generic_label = false

  unless enriched.key?('label')
    enriched['label'] = infer_label(key)
    generic_label = !LABEL_MAP.key?(key)
  end

  unless enriched.key?('type')
    enriched['type'] = infer_type(enriched)
  end

  # unit / unidade: se um existe e o outro não, espelha (preserva ambos)
  if enriched.key?('unidade') && !enriched.key?('unit')
    enriched['unit'] = enriched['unidade']
  elsif enriched.key?('unit') && !enriched.key?('unidade')
    enriched['unidade'] = enriched['unit']
  end

  changed = enriched != original
  [enriched, changed, generic_label && changed]
end

def relevant_file?(path)
  return false unless path.end_with?('.json')
  return false if SKIP_PATHS.any? { |p| path == p || path.start_with?(p + File::SEPARATOR) }
  true
end

def backup_file(path)
  rel = path.sub(ROOT + File::SEPARATOR, '')
  dest = File.join(BACKUP_DIR, rel)
  FileUtils.mkdir_p(File.dirname(dest))
  FileUtils.cp(path, dest)
end

stats = {
  files_total: 0,
  files_enriched: 0,
  files_already_ok: 0,
  files_no_params: 0,
  params_total: 0,
  params_enriched: 0,
  params_label_added: 0,
  params_type_added: 0,
  params_unit_added: 0,
}
generic_labels = []

files = Dir.glob(File.join(MOVEIS_DIR, '**', '*.json')).sort
files.each do |path|
  next unless relevant_file?(path)

  stats[:files_total] += 1
  raw = File.read(path)
  begin
    data = JSON.parse(raw)
  rescue JSON::ParserError => e
    warn "[ERRO JSON] #{path}: #{e.message}"
    next
  end

  unless data.is_a?(Hash) && data['parametros'].is_a?(Hash)
    stats[:files_no_params] += 1
    next
  end

  file_changed = false
  file_param_count_changed = 0

  new_params = {}
  data['parametros'].each do |key, param|
    stats[:params_total] += 1
    before_has_label = param.is_a?(Hash) && param.key?('label')
    before_has_type  = param.is_a?(Hash) && param.key?('type')
    before_has_unit  = param.is_a?(Hash) && param.key?('unit')

    enriched, changed, generic = enrich_param(key, param)
    new_params[key] = enriched
    if changed
      file_changed = true
      file_param_count_changed += 1
      stats[:params_enriched] += 1
      stats[:params_label_added] += 1 if !before_has_label && enriched.key?('label')
      stats[:params_type_added]  += 1 if !before_has_type  && enriched.key?('type')
      stats[:params_unit_added]  += 1 if !before_has_unit  && enriched.key?('unit')
    end
    if generic
      rel = path.sub(ROOT + File::SEPARATOR, '')
      generic_labels << "#{rel} :: #{key} → \"#{enriched['label']}\""
    end
  end

  if file_changed
    data['parametros'] = new_params

    # _enrichment_notes (idempotente: append no array existente)
    note = {
      'timestamp' => Time.now.iso8601,
      'tool'      => 'enrich_module_params.rb',
      'params_enriched' => file_param_count_changed,
    }
    existing = data['_enrichment_notes']
    data['_enrichment_notes'] =
      if existing.is_a?(Array)
        existing + [note]
      elsif existing.is_a?(Hash)
        [existing, note]
      else
        [note]
      end

    backup_file(path)
    File.write(path, JSON.pretty_generate(data) + "\n")
    stats[:files_enriched] += 1
    rel = path.sub(ROOT + File::SEPARATOR, '')
    puts "  enriched: #{rel} (+#{file_param_count_changed} params)"
  else
    stats[:files_already_ok] += 1
  end
end

puts
puts '=' * 60
puts "Enriquecimento concluído — #{TIMESTAMP}"
puts '=' * 60
puts "Arquivos varridos        : #{stats[:files_total]}"
puts "Arquivos enriquecidos    : #{stats[:files_enriched]}"
puts "Arquivos já OK           : #{stats[:files_already_ok]}"
puts "Arquivos sem 'parametros': #{stats[:files_no_params]}"
puts "Params totais            : #{stats[:params_total]}"
puts "Params enriquecidos      : #{stats[:params_enriched]}"
puts "  + label adicionado     : #{stats[:params_label_added]}"
puts "  + type adicionado      : #{stats[:params_type_added]}"
puts "  + unit adicionado      : #{stats[:params_unit_added]}"
puts "Backup em                : #{BACKUP_DIR.sub(ROOT + File::SEPARATOR, '')}"
puts
if generic_labels.any?
  puts "Labels genéricos (titlecase) — revisão humana sugerida (#{generic_labels.size}):"
  generic_labels.each { |l| puts "  - #{l}" }
else
  puts 'Sem labels genéricos — todos os keys mapeados explicitamente.'
end
