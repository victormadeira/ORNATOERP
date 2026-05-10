#!/usr/bin/env ruby
# frozen_string_literal: true

# WPS .wctr Constructor -> Ornato JSON Converter
# Converts 64 .wctr XML files into a single categorized constructors.json

require 'rexml/document'
require 'json'

SOURCE_DIR = File.expand_path("../../wps_source/constructor", __FILE__)
OUTPUT_FILE = File.expand_path("../../constructor/templates/constructors.json", __FILE__)

# --- Field name translation: WPS FieldName -> [ornato_key, pt_label] ---
FIELD_MAP = {
  'recobrimentoesquerdo'          => ['overlay_left',              'Recobrimento Esquerdo'],
  'recobrimentodireito'           => ['overlay_right',             'Recobrimento Direito'],
  'recobrimentosuperior'          => ['overlay_top',               'Recobrimento Superior'],
  'recobrimentoinferior'          => ['overlay_bottom',            'Recobrimento Inferior'],
  'posicaopuxador'                => ['handle_position',           'Posicao do Puxador'],
  'ladoporta'                     => ['door_side',                 'Lado da Porta'],
  'PortaFrontal'                  => ['front_door',                'Porta Frontal'],
  'wpsusermodelotrilhoportaspequena' => ['track_type',             'Tipo de Trilho'],
  'wpsuserdrawerquantity'         => ['drawer_count',              'Qtd Gavetas'],
  'wpsuserdrawerquantitygavetas'  => ['drawer_count_drawers',      'Qtd Gavetas'],
  'wpsuserdrawerquantitygaveteiro'=> ['drawer_count_cabinet',      'Qtd Gaveteiro'],
  'wpsuserdrawerquantitysapateira'=> ['shoe_rack_count',           'Qtd Sapateiras'],
  'wpsvaoshorizontais'            => ['horizontal_spans',          'Vaos Horizontais'],
  'wpsvaosverticais'              => ['vertical_spans',            'Vaos Verticais'],
  'posicaoled'                    => ['led_position',              'Posicao LED'],
  'posicaobatente'                => ['rail_position',             'Posicao Batente'],
  'posicaotravessa'               => ['crossbar_position',         'Posicao Travessa'],
  'vistafechamentoeditavel'       => ['closure_view',              'Vista Fechamento'],
  'largurafechamento'             => ['closure_width',             'Largura Fechamento'],
  'larguravistafechamento'        => ['closure_view_width',        'Largura Vista Fechamento'],
  'wpsgalturarodape'              => ['baseboard_height',          'Altura Rodape'],
  'wpsuseralturapenivelador'      => ['leveler_height',            'Altura Pe Nivelador'],
  'wpsusername'                   => ['name',                      'Nome'],
  'QuantidadePrateleiras'         => ['shelf_count',               'Qtd Prateleiras'],
  'QuantidadeVaosVertical'        => ['vertical_span_count',       'Qtd Vaos Verticais'],
  'recorteinferiorfrontal'        => ['cutout_bottom_front',       'Recorte Inferior Frontal'],
  'recorteinferiortraseiro'       => ['cutout_bottom_rear',        'Recorte Inferior Traseiro'],
  'recortesuperiorfrontal'        => ['cutout_top_front',          'Recorte Superior Frontal'],
  'recortesuperiortraseiro'       => ['cutout_top_rear',           'Recorte Superior Traseiro'],
  'alturarecorteinffron'          => ['cutout_height_bottom_front', 'Altura Recorte Inf. Frontal'],
  'alturarecorteinftra'           => ['cutout_height_bottom_rear',  'Altura Recorte Inf. Traseiro'],
  'alturarecortesupfron'          => ['cutout_height_top_front',    'Altura Recorte Sup. Frontal'],
  'alturarecortesuptra'           => ['cutout_height_top_rear',     'Altura Recorte Sup. Traseiro'],
  'largurarecorteinffron'         => ['cutout_width_bottom_front',  'Largura Recorte Inf. Frontal'],
  'largurarecorteinftra'          => ['cutout_width_bottom_rear',   'Largura Recorte Inf. Traseiro'],
  'largurarecortesupfron'         => ['cutout_width_top_front',     'Largura Recorte Sup. Frontal'],
  'largurarecortesuptra'          => ['cutout_width_top_rear',      'Largura Recorte Sup. Traseiro'],
  'rotacaotravessatraseira'       => ['rear_crossbar_rotation',     'Rotacao Travessa Traseira'],
}

# --- Option translation: PT -> EN ---
OPTION_MAP = {
  'total'        => 'total',
  'parcial'      => 'partial',
  'embutido'     => 'inset',
  'passante'     => 'passthrough',
  'superior'     => 'top',
  'inferior'     => 'bottom',
  'centralizado' => 'center',
  'direita'      => 'right',
  'esquerda'     => 'left',
  'sobreposto'   => 'overlay',
  'cima'         => 'top',
  'baixo'        => 'bottom',
  'Esquerda'     => 'left',
  'Direita'      => 'right',
  'Ambas'        => 'both',
  'Nenhuma'      => 'none',
  'Sim'          => 'yes',
  'Nao'          => 'no',
}

# --- Category classification by keywords in the Entity name ---
CATEGORY_RULES = [
  # Order matters: more specific patterns first
  ['interno',    [/Gaveteiro Intern/i, /Sapateira Intern/i, /Colmeia Intern/i,
                  /Prateleira/i, /Calceiro/i, /Kit Gaveta/i, /Kit Tulha/i,
                  /Kit Porta Latas/i, /Kit Sapateira/i, /Kit Montante/i,
                  /Montante Intern/i, /Kit Colmeia/i, /Kit colmeia/i,
                  /Sapateira Corred/i]],
  ['fechamento', [/Kit.*Porta.*Dobrad/i, /Kit Basculante/i, /Kit.*Aventos/i,
                  /Kit Desl/i, /Kit Deslizante/i]],
  ['acessorio',  [/Led/i, /Rodap/i, /Pe Nivelador/i, /Cabideiro/i, /^Corpo /i,
                  /Cj Corpo/i]],
  ['estrutura',  [/Base/i, /Lateral/i, /Travessa/i, /Batente/i, /Fundo/i,
                  /Tampo/i, /Divisor/i, /Montante/i, /Perfil J/i]],
]

def classify(name)
  CATEGORY_RULES.each do |cat, patterns|
    return cat if patterns.any? { |p| name.match?(p) }
  end
  'estrutura' # fallback
end

def translate_option(val)
  OPTION_MAP[val] || val
end

def translate_options(options_str)
  return [] if options_str.nil? || options_str.strip.empty?
  options_str.split(';').map { |o| translate_option(o.strip) }
end

def parse_offsets(entity)
  offsets = {}
  %w[Back Bottom Front Left Right Top].each do |side|
    val = entity.attributes["offset#{side}"]
    offsets[side.downcase] = val.to_f if val && val.to_f != 0.0
  end
  offsets.empty? ? nil : offsets
end

def parse_alignment(entity, tag)
  el = entity.elements[tag]
  return nil unless el
  opts = (el.attributes['options'] || '').downcase.split(';').map(&:strip)
  val  = (el.attributes['value'] || '').downcase.strip
  { 'options' => opts, 'default' => val }
end

def parse_wctr(filepath)
  xml = File.read(filepath, encoding: 'UTF-8')
  doc = REXML::Document.new(xml)
  entity = doc.root
  return nil unless entity

  name = entity.attributes['name']
  result = {
    'id'          => File.basename(filepath, '_CTR.wctr').gsub(/[^a-zA-Z0-9]/, '_').downcase,
    'wps_name'    => name,
    'category'    => classify(name),
    'offsets'     => parse_offsets(entity),
    'alignment'   => {
      'vertical'   => parse_alignment(entity, 'VerticalAlignment'),
      'horizontal' => parse_alignment(entity, 'HorizontalAlignment'),
      'depth'      => parse_alignment(entity, 'DepthAlignment'),
    }.compact,
    'fields'      => [],
  }

  entity.elements.each('FieldSets/FieldSet') do |fs|
    wps_name = fs.attributes['FieldName']
    mapping  = FIELD_MAP[wps_name]

    ornato_key = mapping ? mapping[0] : wps_name
    label      = mapping ? mapping[1] : (fs.attributes['title'] || wps_name)

    raw_options = fs.attributes['options'] || ''
    options     = translate_options(raw_options)
    raw_value   = fs.attributes['value'] || ''
    default_val = translate_option(raw_value)

    # Try to detect numeric values
    if default_val.match?(/\A-?\d+(\.\d+)?\z/) && options.empty?
      default_val = default_val.include?('.') ? default_val.to_f : default_val.to_i
    end

    field = {
      'key'      => ornato_key,
      'wps_name' => wps_name,
      'label'    => label,
      'default'  => default_val,
    }
    field['options'] = options unless options.empty?
    result['fields'] << field
  end

  result.delete('offsets') if result['offsets'].nil?
  result
end

# --- Main ---
files = Dir.glob(File.join(SOURCE_DIR, '*.wctr')).sort
puts "Found #{files.length} .wctr files"

constructors = { 'estrutura' => [], 'fechamento' => [], 'interno' => [], 'acessorio' => [] }

files.each do |f|
  begin
    data = parse_wctr(f)
    if data
      cat = data['category']
      constructors[cat] ||= []
      constructors[cat] << data
      puts "  [#{cat.upcase.ljust(11)}] #{data['wps_name']}"
    end
  rescue => e
    puts "  ERROR processing #{File.basename(f)}: #{e.message}"
  end
end

output = {
  '_meta' => {
    'version'    => '1.0',
    'source'     => 'WPS Biblioteca Constructor (.wctr)',
    'converted'  => Time.now.strftime('%Y-%m-%d %H:%M'),
    'total'      => constructors.values.flatten.length,
    'categories' => constructors.transform_values(&:length),
  },
  'constructors' => constructors,
}

File.write(OUTPUT_FILE, JSON.pretty_generate(output))
puts "\nOutput: #{OUTPUT_FILE}"
puts "Total: #{output['_meta']['total']} constructors in #{constructors.keys.length} categories"
constructors.each { |k, v| puts "  #{k}: #{v.length}" }
