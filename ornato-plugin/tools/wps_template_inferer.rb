#!/usr/bin/env ruby
# frozen_string_literal: true
# ════════════════════════════════════════════════════════════════════
# wps_template_inferer.rb — Agente C
#
# Lê biblioteca/modelos/catalog.json, infere família/portas/gavetas a
# partir do nome WPS e gera JSONs paramétricos Ornato seguindo o schema
# canônico (biblioteca/moveis/cozinha/balcao_2_portas.json).
#
# Saída: biblioteca/moveis/wps_imported/<categoria>/<id>.json + INFER_REPORT.md
#
# REGRAS:
#  - Não sobrescreve JSONs de cozinha/dormitorio existentes
#  - Só escreve em wps_imported/
#  - Usa roles canônicos do RoleNormalizer
#  - Material codes em CamelCase (MDF18_BrancoTX, MDF6_Branco)
#  - Ferragens auto referenciam .skp por path relativo a biblioteca/modelos/
# ════════════════════════════════════════════════════════════════════

require 'json'
require 'fileutils'
require 'time'

ROOT      = File.expand_path('..', __dir__)
CATALOG   = File.join(ROOT, 'biblioteca', 'modelos', 'catalog.json')
OUT_DIR   = File.join(ROOT, 'biblioteca', 'moveis', 'wps_imported')
REPORT    = File.join(OUT_DIR, 'INFER_REPORT.md')

PARAMETRIC = %w[corpos portas frentes basculantes prateleiras gavetas roupeiros consoles nichos aereos kits].freeze

# ─── Dicionário de abreviações WPS (pré-processado antes das regex) ─
# Aplicado palavra-a-palavra com word boundaries, case-insensitive.
ABBREV_MAP = {
  /\bgav\.?\b/i      => 'Gaveta',
  /\broup\b/i        => 'Roupeiro',
  /\bcj\b/i          => '',
  /\bcjold\b/i       => '',
  /\bcan\b/i         => 'Canto',     # "Can L" → "Canto L"
  /\bsup\b/i         => 'Superior',
  /\binf\b/i         => 'Inferior',
  /\bcorred\b/i      => 'Corrediça',
  /\bdesl\b/i        => 'Deslizante',
  /\bdobrad\b/i      => 'Dobradiça',
  /\bbascul\b/i      => 'Basculante',
  /\bprat\b/i        => 'Prateleira',
  /\bgaveteir\b/i    => 'Gaveteiro',
  /\bdiv\b/i         => 'Divisao',
  /(\d+)\s*v[aã]os?\b/i => '\1Vaos',  # "5 Vaos" → "5Vaos" (preserva o número)
}.freeze

def normalize_name(raw)
  s = raw.dup
  ABBREV_MAP.each { |rx, repl| s = s.gsub(rx, repl) }
  s.gsub(/\s+/, ' ').strip
end

# ─── Heurísticas ────────────────────────────────────────────────────

FAMILY_RULES = [
  [/aereo|aéreo|wall|superior/i,            'aereo'],
  [/basculan/i,                              'basculante'],
  [/roupeir|guarda.?roup|wardrobe/i,         'roupeiro'],
  [/coluna|torre|column/i,                   'coluna'],
  [/gaveteir|drawer.?unit/i,                 'gaveteiro'],
  [/console/i,                               'console'],
  [/nicho/i,                                 'nicho'],
  [/balc[aã]o|base/i,                        'balcao'],
  [/kit/i,                                   'kit'],
  [/prateleira|shelf/i,                      'prateleira'],
  [/frente|frontal/i,                        'frente'],
  [/porta(?!.?correr)/i,                     'porta'],
  [/canto.?l/i,                              'canto_l'],
  [/canto/i,                                 'canto'],
  [/corpo\s+(simples|duplo)/i,               'corpo'],
].freeze

VAOS_REGEX = /(\d+)\s*Vaos/i

OPENING_RULES = [
  [/desliz|correr|sliding/i, 'deslizante'],
  [/basculan/i,              'basculante'],
  [/abrir|swing/i,           'abrir'],
].freeze

def slugify(s)
  s.to_s.downcase.tr('áàãâä', 'a').tr('éèêë', 'e').tr('íìîï', 'i')
   .tr('óòõôö', 'o').tr('úùûü', 'u').tr('ç', 'c')
   .gsub(/[^a-z0-9]+/, '_').gsub(/^_+|_+$/, '')
end

def detect_family(name)
  FAMILY_RULES.each { |rx, fam| return fam if name =~ rx }
  nil
end

def detect_vaos(name)
  return $1.to_i if name =~ VAOS_REGEX
  0
end

def detect_portas(name)
  if (m = name.match(/(\d+)\s*porta/i)); return m[1].to_i; end
  return 1 if name =~ /\bporta\b/i
  0
end

def detect_gavetas(name)
  if (m = name.match(/(\d+)\s*gavet/i)); return m[1].to_i; end
  return 1 if name =~ /gavet/i
  0
end

def detect_opening(name)
  OPENING_RULES.each { |rx, op| return op if name =~ rx }
  'abrir'
end

# ─── Confidence scoring ─────────────────────────────────────────────
def score_confidence(family, portas, gavetas, name)
  score = 0.3
  score += 0.25 if family
  score += 0.2  if name =~ /\d+\s*porta/i
  score += 0.2  if name =~ /\d+\s*gavet/i
  score += 0.05 if portas > 0 || gavetas > 0
  score += 0.1  if family && (portas + gavetas > 0)
  score = 1.0 if score > 1.0
  score.round(2)
end

# ─── Ferragens .skp lookup ──────────────────────────────────────────
def build_ferragens_index(catalog_models)
  idx = { dobradica: [], corredica: [], puxador: [] }
  catalog_models.each do |m|
    cat = m['category']
    fp  = m['file_path']
    if cat == 'ferragens'
      idx[:dobradica] << fp if m['id'] =~ /dobradic/
      idx[:corredica] << fp if m['id'] =~ /corredic/
    elsif cat == 'puxadores'
      idx[:puxador] << fp
    end
  end
  {
    dobradica: idx[:dobradica].sort_by(&:length).first,
    corredica: idx[:corredica].sort_by(&:length).first,
    puxador:   idx[:puxador].sort_by(&:length).first,
  }
end

# ─── Schema base ────────────────────────────────────────────────────
def base_parametros(family, portas, gavetas)
  altura_default = case family
                   when 'aereo'      then 700
                   when 'roupeiro'   then 2200
                   when 'coluna'     then 2100
                   when 'basculante' then 360
                   else 720
                   end
  prof_default   = case family
                   when 'aereo' then 320
                   when 'basculante' then 320
                   when 'roupeiro' then 600
                   else 560
                   end

  {
    'largura' => { 'label'=>'Largura', 'type'=>'number', 'default'=>800, 'min'=>300, 'max'=>2400, 'step'=>10, 'unit'=>'mm', 'unidade'=>'mm' },
    'altura'  => { 'label'=>'Altura',  'type'=>'number', 'default'=>altura_default, 'min'=>200, 'max'=>2700, 'step'=>10, 'unit'=>'mm', 'unidade'=>'mm' },
    'profundidade' => { 'label'=>'Profundidade', 'type'=>'number', 'default'=>prof_default, 'min'=>200, 'max'=>700, 'step'=>10, 'unit'=>'mm', 'unidade'=>'mm' },
    'espessura' => { 'label'=>'Espessura MDF', 'type'=>'number', 'default'=>18, 'min'=>15, 'max'=>25, 'step'=>1, 'unit'=>'mm', 'unidade'=>'mm' },
    'altura_rodape' => { 'label'=>'Rodape', 'type'=>'number', 'default'=>(family == 'aereo' || family == 'basculante' ? 0 : 100), 'min'=>0, 'max'=>180, 'step'=>10, 'unit'=>'mm', 'unidade'=>'mm' },
    'material_carcaca' => { 'label'=>'Material carcaca', 'type'=>'select', 'default'=>'MDF18_BrancoTX',
                            'options'=>['MDF18_BrancoTX','MDF18_Branco','MDF18_Cinza','MDF18_Natural','MDF25_BrancoTX'],
                            'opcoes' =>['MDF18_BrancoTX','MDF18_Branco','MDF18_Cinza','MDF18_Natural','MDF25_BrancoTX'] },
    'material_frente' => { 'label'=>'Material frentes', 'type'=>'select', 'default'=>'MDF18_BrancoTX',
                           'options'=>['MDF18_BrancoTX','MDF18_Branco','MDF18_Cinza','MDF18_Natural','MDF18_Lacado','MDF25_BrancoTX'],
                           'opcoes' =>['MDF18_BrancoTX','MDF18_Branco','MDF18_Cinza','MDF18_Natural','MDF18_Lacado','MDF25_BrancoTX'] },
    'material_fundo' => { 'label'=>'Material fundo', 'type'=>'select', 'default'=>'MDF6_Branco',
                          'options'=>['MDF6_Branco','MDF12_Branco','MDF18_Branco'],
                          'opcoes' =>['MDF6_Branco','MDF12_Branco','MDF18_Branco'] },
    'com_tampo' => { 'label'=>'Com tampo', 'type'=>'boolean', 'default'=> family != 'aereo' },
    'com_fundo' => { 'label'=>'Com fundo', 'type'=>'boolean', 'default'=>true },
    'n_prateleiras' => { 'label'=>'Prateleiras', 'type'=>'number', 'default'=>(gavetas > 0 ? 0 : 1), 'min'=>0, 'max'=>5, 'step'=>1 },
    'n_portas' => { 'label'=>'Portas', 'type'=>'number', 'default'=>portas, 'min'=>0, 'max'=>4, 'step'=>1 },
    'n_gavetas' => { 'label'=>'Gavetas', 'type'=>'number', 'default'=>gavetas, 'min'=>0, 'max'=>6, 'step'=>1 },
    'tipo_juncao' => { 'label'=>'Juncao', 'type'=>'select', 'default'=>'minifix',
                       'options'=>['minifix','cavilha','confirmat'], 'opcoes'=>['minifix','cavilha','confirmat'] },
    'tipo_abertura' => { 'label'=>'Abertura', 'type'=>'select', 'default'=>'abrir',
                         'options'=>['abrir','deslizante','basculante'], 'opcoes'=>['abrir','deslizante','basculante'] },
    'folga_porta_lateral' => { 'label'=>'Folga lateral porta', 'type'=>'number', 'default'=>2, 'min'=>1, 'max'=>5, 'step'=>0.5, 'unit'=>'mm', 'unidade'=>'mm' },
    'folga_porta_vertical' => { 'label'=>'Folga vertical porta', 'type'=>'number', 'default'=>2, 'min'=>1, 'max'=>5, 'step'=>0.5, 'unit'=>'mm', 'unidade'=>'mm' },
    'folga_entre_portas' => { 'label'=>'Folga entre portas', 'type'=>'number', 'default'=>3, 'min'=>1, 'max'=>6, 'step'=>0.5, 'unit'=>'mm', 'unidade'=>'mm' },
    'recuo_fundo' => { 'label'=>'Recuo fundo', 'type'=>'number', 'default'=>13, 'min'=>8, 'max'=>25, 'step'=>1, 'unit'=>'mm', 'unidade'=>'mm' },
    'puxador_espacamento' => { 'label'=>'Puxador', 'type'=>'number', 'default'=>128, 'min'=>96, 'max'=>320, 'step'=>32, 'unit'=>'mm', 'unidade'=>'mm' },
    'sys32_ativo' => { 'label'=>'System 32', 'type'=>'boolean', 'default'=>true },
  }
end

# ─── Pecas geradas dinamicamente ────────────────────────────────────
def base_pecas(portas, gavetas)
  pecas = []

  # Laterais
  pecas << {
    'nome'=>'Lateral Esquerda', 'role'=>'lateral', 'orientacao'=>'lateral',
    'largura'=>'{altura} - {altura_rodape}', 'altura'=>'{profundidade}', 'espessura'=>'{espessura}',
    'posicao'=>{'x'=>0,'y'=>0,'z'=>'{altura}'},
    'bordas'=>{'frente'=>true,'topo'=>true,'base'=>false,'tras'=>false}
  }
  pecas << {
    'nome'=>'Lateral Direita', 'role'=>'lateral', 'orientacao'=>'lateral',
    'largura'=>'{altura} - {altura_rodape}', 'altura'=>'{profundidade}', 'espessura'=>'{espessura}',
    'posicao'=>{'x'=>'{largura} - {espessura}','y'=>0,'z'=>'{altura}'},
    'bordas'=>{'frente'=>true,'topo'=>true,'base'=>false,'tras'=>false}
  }
  # Base
  pecas << {
    'nome'=>'Base', 'role'=>'base', 'orientacao'=>'horizontal',
    'largura'=>'{largura} - 2 * {espessura}', 'altura'=>'{profundidade}', 'espessura'=>'{espessura}',
    'posicao'=>{'x'=>'{espessura}','y'=>0,'z'=>'{altura_rodape} + {espessura}'},
    'bordas'=>{'frente'=>true,'topo'=>false,'base'=>false,'tras'=>false}
  }
  # Tampo
  pecas << {
    'nome'=>'Tampo', 'role'=>'top', 'orientacao'=>'horizontal',
    'largura'=>'{largura} - 2 * {espessura}', 'altura'=>'{profundidade}', 'espessura'=>'{espessura}',
    'condicao'=>'{com_tampo} == true',
    'posicao'=>{'x'=>'{espessura}','y'=>0,'z'=>'{altura}'},
    'bordas'=>{'frente'=>true,'topo'=>false,'base'=>false,'tras'=>false}
  }
  # Traseira
  pecas << {
    'nome'=>'Traseira', 'role'=>'back_panel',
    'largura'=>'{largura} - 2 * {espessura}',
    'altura'=>'{altura} - {altura_rodape} - 2 * {espessura}',
    'espessura'=>6,
    'condicao'=>'{com_fundo} == true',
    'posicao'=>{'x'=>'{espessura}','y'=>'{profundidade} - {recuo_fundo}','z'=>'{altura} - {espessura}'},
    'bordas'=>{'frente'=>false,'topo'=>false,'base'=>false,'tras'=>false}
  }
  # Prateleiras (até 3 condicionais)
  3.times do |i|
    n = i + 1
    z = if n == 1
          '{altura_rodape} + ({altura} - {altura_rodape}) / 2 + {espessura}'
        elsif n == 2
          '{altura_rodape} + ({altura} - {altura_rodape}) / 3 + {espessura}'
        else
          '{altura_rodape} + 2 * ({altura} - {altura_rodape}) / 3 + {espessura}'
        end
    pecas << {
      'nome'=>"Prateleira #{n}", 'role'=>'shelf', 'orientacao'=>'horizontal',
      'largura'=>'{largura} - 2 * {espessura} - 2', 'altura'=>'{profundidade} - 20', 'espessura'=>'{espessura}',
      'condicao'=>"{n_prateleiras} >= #{n}",
      'posicao'=>{'x'=>'{espessura} + 1','y'=>0,'z'=>z},
      'bordas'=>{'frente'=>true,'topo'=>false,'base'=>false,'tras'=>false}
    }
  end
  # Portas (geramos até 4 — engine usa n_portas)
  4.times do |i|
    n = i + 1
    pecas << {
      'nome'=>"Porta #{n}", 'role'=>'door',
      'largura'=>"({largura} - 2 * {folga_porta_lateral} - ({n_portas} - 1) * {folga_entre_portas}) / {n_portas}",
      'altura'=>'{altura} - {altura_rodape} - 2 * {folga_porta_vertical}',
      'espessura'=>'{espessura}',
      'condicao'=>"{n_portas} >= #{n}",
      'posicao'=>{
        'x'=>"{folga_porta_lateral} + (#{n - 1}) * (({largura} - 2 * {folga_porta_lateral}) / {n_portas})",
        'y'=>'0 - {espessura} - 2',
        'z'=>'{altura} - {folga_porta_vertical}'
      },
      'bordas'=>{'frente'=>true,'topo'=>true,'base'=>true,'tras'=>true}
    }
  end
  # Frentes de gaveta
  4.times do |i|
    n = i + 1
    pecas << {
      'nome'=>"Frente Gaveta #{n}", 'role'=>'drawer_front',
      'largura'=>'{largura} - 2 * {folga_porta_lateral}',
      'altura'=>"({altura} - {altura_rodape} - ({n_gavetas} + 1) * {folga_porta_vertical}) / {n_gavetas}",
      'espessura'=>'{espessura}',
      'condicao'=>"{n_gavetas} >= #{n}",
      'posicao'=>{
        'x'=>'{folga_porta_lateral}',
        'y'=>'0 - {espessura} - 2',
        'z'=>"{altura_rodape} + (#{n}) * (({altura} - {altura_rodape}) / {n_gavetas}) - {folga_porta_vertical}"
      },
      'bordas'=>{'frente'=>true,'topo'=>true,'base'=>true,'tras'=>true}
    }
  end
  # Rodape
  pecas << {
    'nome'=>'Rodape', 'role'=>'kick',
    'largura'=>'{largura} - 2 * {espessura}', 'altura'=>'{altura_rodape}', 'espessura'=>'{espessura}',
    'condicao'=>'{altura_rodape} > 0',
    'posicao'=>{'x'=>'{espessura}','y'=>50,'z'=>'{altura_rodape}'},
    'bordas'=>{'frente'=>true,'topo'=>false,'base'=>false,'tras'=>false}
  }
  pecas
end

def base_ferragens(portas, gavetas, ferr_idx)
  fa = [
    { 'regra'=>'minifix', 'juncao'=>'lateral × base', 'condicao'=>"{tipo_juncao} == 'minifix'" },
    { 'regra'=>'minifix', 'juncao'=>'lateral × top',  'condicao'=>"{tipo_juncao} == 'minifix' && {com_tampo} == true" },
    { 'regra'=>'cavilha', 'juncao'=>'lateral × base', 'condicao'=>"{tipo_juncao} == 'cavilha'" },
    { 'regra'=>'cavilha', 'juncao'=>'lateral × top',  'condicao'=>"{tipo_juncao} == 'cavilha' && {com_tampo} == true" },
    { 'regra'=>'confirmat','juncao'=>'lateral × base','condicao'=>"{tipo_juncao} == 'confirmat'" },
    { 'regra'=>'confirmat','juncao'=>'lateral × top', 'condicao'=>"{tipo_juncao} == 'confirmat' && {com_tampo} == true" },
  ]
  if portas > 0
    h = { 'regra'=>'dobradica', 'peca'=>'lateral', 'condicao'=>'{n_portas} > 0' }
    h['componente_3d'] = ferr_idx[:dobradica] if ferr_idx[:dobradica]
    fa << h
    p = { 'regra'=>'puxador', 'peca'=>'door', 'espacamento'=>'{puxador_espacamento}', 'condicao'=>'{n_portas} > 0' }
    p['componente_3d'] = ferr_idx[:puxador] if ferr_idx[:puxador]
    fa << p
  end
  if gavetas > 0
    c = { 'regra'=>'corredica', 'peca'=>'lateral', 'condicao'=>'{n_gavetas} > 0' }
    c['componente_3d'] = ferr_idx[:corredica] if ferr_idx[:corredica]
    fa << c
    pg = { 'regra'=>'puxador', 'peca'=>'drawer_front', 'espacamento'=>'{puxador_espacamento}', 'condicao'=>'{n_gavetas} > 0' }
    pg['componente_3d'] = ferr_idx[:puxador] if ferr_idx[:puxador]
    fa << pg
  end
  fa << { 'regra'=>'rebaixo_fundo', 'pecas'=>['lateral','base','top'], 'condicao'=>'{com_fundo} == true' }
  fa << { 'regra'=>'system32', 'pecas'=>['lateral'], 'condicao'=>'{sys32_ativo} == true && {n_prateleiras} > 0' }
  fa
end

# ─── Geração principal ──────────────────────────────────────────────
def infer_for(model, ferr_idx)
  raw_name = model['original_name']
  name     = normalize_name(raw_name)
  category = model['category']
  family   = detect_family(name)
  portas   = detect_portas(name)
  gavetas  = detect_gavetas(name)
  vaos     = detect_vaos(name)
  abertura = detect_opening(name)
  conf     = score_confidence(family, portas, gavetas, name)
  conf     = [conf + 0.15, 1.0].min if vaos > 0     # bônus por "N Vaos"
  conf     = [conf + 0.1,  1.0].min if name != raw_name  # bônus por abreviação resolvida

  # Ajustes default por família quando não há contagem explícita
  if portas == 0 && gavetas == 0
    case family
    when 'porta', 'aereo', 'basculante' then portas = 1
    when 'gaveteiro' then gavetas = 3
    when 'balcao' then portas = 2
    when 'roupeiro' then portas = 2
    end
  end

  id = model['id']
  codigo = "WPS_#{category[0..2].upcase}_#{id[0..15].upcase}"

  parametros = base_parametros(family, portas, gavetas)
  parametros['tipo_abertura']['default'] = abertura
  parametros['n_portas']['default']  = portas
  parametros['n_gavetas']['default'] = gavetas

  json = {
    'id'        => id,
    'codigo'    => codigo,
    'nome'      => name,
    'descricao' => "Modulo parametrico inferido da biblioteca WPS (#{category}). Familia: #{family || 'indeterminada'}.",
    'categoria' => category,
    'tags'      => [category, family, abertura, "#{portas}portas", "#{gavetas}gavetas"].compact.uniq,
    'icone'     => family || 'generic',
    'thumbnail' => "#{id}.png",
    'tipo_ruby' => 'wps_imported_generico',
    'versao_schema' => 1,
    'parametros' => parametros,
    'pecas'     => base_pecas(portas, gavetas),
    'ferragens_auto' => base_ferragens(portas, gavetas, ferr_idx),
    'agregados_sugeridos' => ['led','passa_fio','puxador'],
    '_review' => {
      'needs_review' => conf < 0.7,
      'confidence'   => conf,
      'source_skp'   => model['file_path'],
      'wps_original_name' => name,
      'inferred' => {
        'family'   => family,
        'portas'   => portas,
        'gavetas'  => gavetas,
        'abertura' => abertura,
      }
    }
  }
  [json, conf, family, portas, gavetas]
end

# ─── Main ───────────────────────────────────────────────────────────
def main
  catalog = JSON.parse(File.read(CATALOG))
  models  = catalog['models'].select { |m| PARAMETRIC.include?(m['category']) }
  ferr_idx = build_ferragens_index(catalog['models'])

  FileUtils.mkdir_p(OUT_DIR)
  results = []

  models.each do |m|
    json, conf, family, portas, gavetas = infer_for(m, ferr_idx)
    cat_dir = File.join(OUT_DIR, m['category'])
    FileUtils.mkdir_p(cat_dir)
    out_path = File.join(cat_dir, "#{m['id']}.json")
    File.write(out_path, JSON.pretty_generate(json))
    results << {
      id: m['id'], category: m['category'], name: m['original_name'],
      conf: conf, family: family, portas: portas, gavetas: gavetas,
      path: out_path
    }
  end

  total      = results.size
  high_conf  = results.count { |r| r[:conf] >= 0.7 }
  mid_conf   = results.count { |r| r[:conf] >= 0.5 && r[:conf] < 0.7 }
  low_conf   = results.count { |r| r[:conf] < 0.5 }
  needs_rev  = results.select { |r| r[:conf] < 0.7 }.sort_by { |r| r[:conf] }
  good       = results.sort_by { |r| -r[:conf] }.first(10)

  by_cat = Hash.new(0); results.each { |r| by_cat[r[:category]] += 1 }

  md = +""
  md << "# WPS Template Inferer — Relatorio\n\n"
  md << "Gerado: #{Time.now.iso8601}\n\n"
  md << "## Sumario\n\n"
  md << "- Total processados: **#{total}**\n"
  md << "- Confidence >= 0.7 (auto-aceitos): **#{high_conf}**\n"
  md << "- Confidence 0.5-0.7 (revisar): **#{mid_conf}**\n"
  md << "- Confidence < 0.5 (revisao manual): **#{low_conf}**\n\n"
  md << "## Distribuicao por categoria\n\n"
  by_cat.sort.each { |c, n| md << "- #{c}: #{n}\n" }
  md << "\n## Top 10 inferencias com maior confidence\n\n"
  good.each { |r| md << "- [#{r[:conf]}] **#{r[:name]}** (#{r[:category]}) — fam=#{r[:family]} portas=#{r[:portas]} gavetas=#{r[:gavetas]}\n" }
  md << "\n## Precisam revisao manual (confidence < 0.7)\n\n"
  needs_rev.first(50).each { |r| md << "- [#{r[:conf]}] #{r[:name]} (#{r[:category]}) — fam=#{r[:family] || '???'} | #{r[:path].sub(ROOT + '/', '')}\n" }
  md << "\n_(mostrando primeiros 50 de #{needs_rev.size})_\n" if needs_rev.size > 50

  File.write(REPORT, md)

  puts "OK — gerados #{total} JSONs em #{OUT_DIR}"
  puts "    high=#{high_conf} mid=#{mid_conf} low=#{low_conf}"
  puts "    relatorio: #{REPORT}"

  results
end

main if __FILE__ == $0
