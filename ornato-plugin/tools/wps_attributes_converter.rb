#!/usr/bin/env ruby
# frozen_string_literal: true

# WPS global_attributes.xml -> Ornato wps_defaults.json
# Extracts key configuration parameters organized by category

require 'rexml/document'
require 'json'

SOURCE_FILE = File.expand_path("../../wps_source/global attributes/global_attributes.xml", __FILE__)
OUTPUT_FILE = File.expand_path("../../config/wps_defaults.json", __FILE__)

xml = File.read(SOURCE_FILE, encoding: 'UTF-8')
doc = REXML::Document.new(xml)

# Collect all attributes organized by category and subcategory
raw_data = {}
doc.elements.each('Attributes/Category') do |cat|
  cat_name = cat.attributes['name']
  raw_data[cat_name] = {}

  cat.elements.each('Attribute') do |attr|
    subcat = attr.attributes['subcategory'] || 'Geral'
    name   = attr.attributes['name']
    title  = attr.attributes['title'] || ''
    value  = attr.attributes['value'] || ''
    option = attr.attributes['option'] || ''

    raw_data[cat_name][subcat] ||= []
    raw_data[cat_name][subcat] << {
      'wps_name' => name,
      'title'    => title,
      'value'    => value,
      'options'  => option,
    }
  end
end

# --- Helper: convert wpsg* name to orn_* ---
def orn_name(wps_name)
  key = wps_name
    .sub(/\Awpsg/, '')
    .sub(/\Awpsuser/, '')
    .sub(/\Awps/, '')
    .gsub(/([A-Z])/) { "_#{$1.downcase}" }
    .gsub(/\A_/, '')
    .gsub(/__+/, '_')
  "orn_#{key}"
end

# --- Helper: smart value conversion ---
def smart_value(val)
  return val.to_i   if val.match?(/\A-?\d+\z/)
  return val.to_f   if val.match?(/\A-?\d+\.\d+\z/)
  val
end

def parse_options(opt_str)
  return nil if opt_str.nil? || opt_str.strip.empty?
  opt_str.split(';').map(&:strip)
end

# --- Build focused output structure ---
output = {
  '_meta' => {
    'version'   => '1.0',
    'source'    => 'WPS global_attributes.xml',
    'converted' => Time.now.strftime('%Y-%m-%d %H:%M'),
    'description' => 'Default configuration values extracted from WPS Biblioteca for the Ornato plugin',
  },
  'bordas' => {
    'largura' => {},
    'limite_largura_tamburato' => {},
    'desconto' => {},
    'espessura' => {},
    'lados' => {},
  },
  'materiais' => {
    'tipo_chapa' => {},
    'direcao_veio' => {},
    'vidros' => {},
  },
  'pecas' => {
    'parametros_espessura' => {},
    'espessura' => {},
    'recobrimento' => {},
    'upperside' => {},
    'fundos' => {},
    'fundos_gavetas' => {},
    'tamburato' => {},
    'pecas_dupladas' => {},
    'pecas_engrossadas' => {},
    'perfil_j' => {},
    'moldura_rebaixo' => {},
    'suporte_invisivel' => {},
    'quadro_engrosso' => {},
    'estrutura_rodape' => {},
    'painel_curvado' => {},
    'tampo_45_graus' => {},
  },
  'corpos' => {
    'vao_ideal_prateleiras' => {},
    'configuracoes' => {},
    'pasta_suspensa' => {},
    'forno_embutido' => {},
    'corpo_gaveta' => {},
    'corpo_porta_latas' => {},
    'corpo_tulha' => {},
    'sanca' => {},
    'mesa' => {},
    'painel' => {},
    'configuracoes_bases' => {},
    'configuracoes_fundos' => {},
    'montante' => {},
    'nichos' => {},
    'corpo_bau' => {},
  },
  'ferragens' => {
    'parafuso' => {},
    'fixacao_frentes' => {},
    'minifix' => {},
    'minifix_simetrico' => {},
    'minifix_multiplo' => {},
    'cavilha' => {},
    'suporte_uniblock' => {},
    'rafix' => {},
    'rafix_duplo' => {},
    'cantoneira_13x13_prateleiras' => {},
    'cantoneira_13x13_corpos' => {},
    'cantoneira_22x22' => {},
    'suporte_f1109ni' => {},
    'suporte_cadeirinha' => {},
    'suporte_pino_metalico' => {},
    'suporte_pino_plastico' => {},
    'suporte_plastico_redondo' => {},
    'suporte_pino_metalico_chato' => {},
    'suporte_f1112ni' => {},
    'suporte_maori' => {},
    'suporte_ixconnect_tab' => {},
    'cantoneira_metalica' => {},
    'pe_nivelador' => {},
    'pistao_gas' => {},
    'cabideiro' => {},
    'kit_led' => {},
    'pulsadores' => {},
    'articuladores' => {},
    'dtc' => {},
  },
  'corredicas' => {
    'telescopica' => {},
    'telescopica_light' => {},
    'oculta' => {},
    'oculta_b' => {},
  },
  'gavetas' => {},
  'dobradicas' => {},
  'puxadores' => {},
  'portas' => {},
}

# --- Map subcategories to output paths ---
SUBCAT_MAP = {
  # Bordas
  'Largura Bordas'              => ['bordas', 'largura'],
  'Limite Largura Bordas'       => ['bordas', 'limite_largura_tamburato'],
  'Desconto Bordas'             => ['bordas', 'desconto'],
  'Espessura Bordas'            => ['bordas', 'espessura'],
  'Lado Fitas de Borda'         => ['bordas', 'lados'],
  # Materiais
  'Material da Chapa'           => ['materiais', 'tipo_chapa'],
  'Direção do Veio'             => ['materiais', 'direcao_veio'],
  'Configuração de Vidros'      => ['materiais', 'vidros'],
  # Pecas
  'Parametros de Espessura'     => ['pecas', 'parametros_espessura'],
  'Espessura'                   => ['pecas', 'espessura'],
  'Recobrimento'                => ['pecas', 'recobrimento'],
  'Upperside das Peças'         => ['pecas', 'upperside'],
  'Troca Lado Usinagem das Peças' => ['pecas', 'upperside'],
  'Fundos'                      => ['pecas', 'fundos'],
  'Fundos Gavetas'              => ['pecas', 'fundos_gavetas'],
  'Peças Tamburato'             => ['pecas', 'tamburato'],
  'Peças Dupladas'              => ['pecas', 'pecas_dupladas'],
  'Peças Engrossadas'           => ['pecas', 'pecas_engrossadas'],
  'Lateral Perfil J'            => ['pecas', 'perfil_j'],
  'Portas e Frentes com Moldura'=> ['pecas', 'moldura_rebaixo'],
  'Portas e Frentes Moldura Rebaixo' => ['pecas', 'moldura_rebaixo'],
  'Prateleira Suporte Invisível'=> ['pecas', 'suporte_invisivel'],
  'Prateleira de Vidro'         => ['pecas', 'suporte_invisivel'],
  'Quadro Engrosso'             => ['pecas', 'quadro_engrosso'],
  'Estrutura Rodape'            => ['pecas', 'estrutura_rodape'],
  'Painel Curvado J'            => ['pecas', 'painel_curvado'],
  'Sanca'                       => ['pecas', 'sanca'] , # from Pecas category
  'Tampo 45 Graus'              => ['pecas', 'tampo_45_graus'],
  'Base Canto L'                => ['pecas', 'base_canto_l'],
  'Canto Reto'                  => ['pecas', 'canto_reto'],
  'Canto Reto Modelo 2'         => ['pecas', 'canto_reto'],
  'Base Canto Obliquo'          => ['pecas', 'base_canto_obliquo'],
  'Esquadrejamento Tamponamento'=> ['pecas', 'tamburato'],
  # Corpos
  'Vão Idela Prateleiras'       => ['corpos', 'vao_ideal_prateleiras'],
  'Configurações Corpos'        => ['corpos', 'configuracoes'],
  'Pasta Suspensa'              => ['corpos', 'pasta_suspensa'],
  'Balcão Forno Embutido'       => ['corpos', 'forno_embutido'],
  'Corpo Gaveta'                => ['corpos', 'corpo_gaveta'],
  'Corpo Porta Latas'           => ['corpos', 'corpo_porta_latas'],
  'Corpo Tulha'                 => ['corpos', 'corpo_tulha'],
  'Mesa'                        => ['corpos', 'mesa'],
  'Painel'                      => ['corpos', 'painel'],
  'Configurações Bases'         => ['corpos', 'configuracoes_bases'],
  'Configurações Fundos'        => ['corpos', 'configuracoes_fundos'],
  'Montante'                    => ['corpos', 'montante'],
  'Nichos'                      => ['corpos', 'nichos'],
  'Corpo Baú'                   => ['corpos', 'corpo_bau'],
  'Corpo Sapateira com Laterais'=> ['corpos', 'corpo_sapateira'],
  # Ferragens
  'Parafuso'                    => ['ferragens', 'parafuso'],
  'Fixação Frentes'             => ['ferragens', 'fixacao_frentes'],
  'Minifix'                     => ['ferragens', 'minifix'],
  'Minifix e Cavilha Simetrico' => ['ferragens', 'minifix_simetrico'],
  'Minifix e Cavilha Multiplo'  => ['ferragens', 'minifix_multiplo'],
  'Cavilha'                     => ['ferragens', 'cavilha'],
  'Suporte Uniblock'            => ['ferragens', 'suporte_uniblock'],
  'Rafix'                       => ['ferragens', 'rafix'],
  'Rafix Duplo'                 => ['ferragens', 'rafix_duplo'],
  'Cantoneira 13x13 2F Para Prateleiras' => ['ferragens', 'cantoneira_13x13_prateleiras'],
  'Cantoneira 13x13 2F Para Corpos'      => ['ferragens', 'cantoneira_13x13_corpos'],
  'Cantoneira 22x22 3F'         => ['ferragens', 'cantoneira_22x22'],
  'Suporte F1109NI'             => ['ferragens', 'suporte_f1109ni'],
  'Suporte Cadeirinha Pino Duplo' => ['ferragens', 'suporte_cadeirinha'],
  'Suporte Pino Metalico'       => ['ferragens', 'suporte_pino_metalico'],
  'Suporte Pino Plastico'       => ['ferragens', 'suporte_pino_plastico'],
  'Suporte Pino Plastico Redondo' => ['ferragens', 'suporte_plastico_redondo'],
  'Suporte Pino Metalico Chato' => ['ferragens', 'suporte_pino_metalico_chato'],
  'Suporte F1112NI'             => ['ferragens', 'suporte_f1112ni'],
  'Suporte Maori'               => ['ferragens', 'suporte_maori'],
  'Suporte Ixconnect Tab'       => ['ferragens', 'suporte_ixconnect_tab'],
  'Cantoneira Metalica e Acabamento Plastico' => ['ferragens', 'cantoneira_metalica'],
  'Pé Nivelador Plástico'       => ['ferragens', 'pe_nivelador'],
  'Pistão a Gás'                => ['ferragens', 'pistao_gas'],
  'Cabideiro Oblongo'           => ['ferragens', 'cabideiro'],
  'Cabideiro Redondo'           => ['ferragens', 'cabideiro'],
  'Kit Led Linear'              => ['ferragens', 'kit_led'],
  'Rodizio Silicone'            => ['ferragens', 'rodizio'],
  'Pulsadores'                  => ['ferragens', 'pulsadores'],
  'DTC'                         => ['ferragens', 'dtc'],
  'Articulador Duo'             => ['ferragens', 'articuladores'],
  'Articulador Maxi'            => ['ferragens', 'articuladores'],
  'Articulador Free Flap'       => ['ferragens', 'articuladores'],
  # Corredicas
  'Distanciador Corrediça'      => ['corredicas', 'telescopica'],
  'Padrões Corrediça Telescópica' => ['corredicas', 'telescopica'],
  'Padrões Corrediça Telescópica Light' => ['corredicas', 'telescopica_light'],
}

# Mapping for entire WPS categories that go to a single output bucket
CAT_FALLBACK = {
  'Corrediças Telescópicas'       => 'corredicas',
  'Corrediças Telescópicas Light' => 'corredicas',
  'Corrediça Oculta'              => 'corredicas',
  'Corrediça Oculta B'            => 'corredicas',
  'Gavetas'                       => 'gavetas',
  'Dobradiças'                    => 'dobradicas',
  'Puxadores'                     => 'puxadores',
  'Portas'                        => 'portas',
  'Ferramentas'                   => 'ferramentas',
  'Itinerario'                    => 'itinerario',
}

# --- Process all attributes ---
attr_count = 0

raw_data.each do |cat_name, subcats|
  subcats.each do |subcat_name, attrs|
    path = SUBCAT_MAP[subcat_name]

    # For sub-categories from slide/drawer/hinge categories, map to flat bucket
    if path.nil? && CAT_FALLBACK[cat_name]
      fb = CAT_FALLBACK[cat_name]
      # Ensure top-level key exists as hash
      output[fb] = {} unless output[fb].is_a?(Hash)

      sub_key = subcat_name
        .downcase
        .gsub(/[^a-z0-9]+/, '_')
        .gsub(/\A_|_\z/, '')

      output[fb][sub_key] ||= {}
      attrs.each do |a|
        key = orn_name(a['wps_name'])
        entry = { 'default' => smart_value(a['value']), 'title' => a['title'] }
        opts = parse_options(a['options'])
        entry['options'] = opts if opts
        entry['wps_name'] = a['wps_name']
        output[fb][sub_key][key] = entry
        attr_count += 1
      end
      next
    end

    # For mapped subcategories
    if path
      section = output
      path.each_with_index do |p, i|
        section[p] ||= {}
        section = section[p]
      end

      attrs.each do |a|
        key = orn_name(a['wps_name'])
        entry = { 'default' => smart_value(a['value']), 'title' => a['title'] }
        opts = parse_options(a['options'])
        entry['options'] = opts if opts
        entry['wps_name'] = a['wps_name']
        section[key] = entry
        attr_count += 1
      end
    else
      # Unmapped: store under _unmapped
      output['_unmapped'] ||= {}
      output['_unmapped'][cat_name] ||= {}
      output['_unmapped'][cat_name][subcat_name] ||= {}
      attrs.each do |a|
        key = orn_name(a['wps_name'])
        entry = { 'default' => smart_value(a['value']), 'title' => a['title'] }
        opts = parse_options(a['options'])
        entry['options'] = opts if opts
        entry['wps_name'] = a['wps_name']
        output['_unmapped'][cat_name][subcat_name][key] = entry
        attr_count += 1
      end
    end
  end
end

# Clean up empty hashes
def prune_empty(obj)
  return obj unless obj.is_a?(Hash)
  obj.each { |k, v| obj[k] = prune_empty(v) }
  obj.reject { |_, v| v.is_a?(Hash) && v.empty? }
end

output = prune_empty(output)

output['_meta']['total_attributes'] = attr_count

File.write(OUTPUT_FILE, JSON.pretty_generate(output))
puts "Output: #{OUTPUT_FILE}"
puts "Total attributes: #{attr_count}"
puts "Top-level sections: #{output.keys.reject { |k| k.start_with?('_') }.join(', ')}"
