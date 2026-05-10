# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# dump_skp_features.rb
#
# Helper de debug humano para o `Ornato::Machining::SkpFeatureExtractor`.
# Carrega 5-6 .skp da biblioteca WPS e imprime, em formato tabular,
# todas as features de furação detectadas em cada definition.
#
# ⚠️  EXECUÇÃO
#   Este script DEPENDE da API do SketchUp (Sketchup::Model,
#   Sketchup::Face, Geom::Point3d…). NÃO roda standalone com `ruby`.
#
#   • Modo recomendado — Ruby Console do SketchUp:
#       load '/caminho/absoluto/tools/dump_skp_features.rb'
#
#   • Modo standalone (CLI):
#       ruby tools/dump_skp_features.rb
#       → cai num path com mocks mínimos que apenas valida sintaxe
#         da classe e imprime aviso pedindo pra rodar no SketchUp.
#
# SAÍDA TÍPICA (dentro do SketchUp)
#   ── dobradica_amor_cj.skp ──────────────────────────────────────
#   #  tipo            ⌀(mm)  prof(mm)  conf  notes
#   1  furo_passante    35.0    18.50   0.90  círculo 24seg ⌀35.0mm × prof 18.5mm (par)
#   2  furo_cego         8.0     5.00   0.90  …
#   3  rasgo_slot        5.0     0.00   0.75  slot 5.0×24.0mm (2reta+2arco)
#   …
# ═══════════════════════════════════════════════════════════════

PLUGIN_ROOT = File.expand_path('..', __dir__)

EXAMPLE_SKPS = [
  'ferragens/dobradica_amor_cj.skp',
  'ferragens/dobradica_amor_165_cj.skp',
  'ferragens/corredica_oculta_slowmotion.skp',
  'ferragens/cavilha_cj.skp',
  'ferragens/minifix_e_cavilha_cj.skp',
  'ferragens/dobradica_amor_calco_duplo_cj.skp',
].freeze

# ── Detecta ambiente: SketchUp ou standalone? ────────────────────
RUNNING_IN_SKETCHUP = defined?(Sketchup) && Sketchup.respond_to?(:active_model)

if RUNNING_IN_SKETCHUP
  require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'skp_feature_extractor.rb')

  module Ornato
    module Machining
      module DumpSkpFeatures
        module_function

        def run(skp_paths = EXAMPLE_SKPS)
          model = Sketchup.active_model
          skp_paths.each do |rel|
            full = File.join(PLUGIN_ROOT, 'biblioteca', 'modelos', rel)
            unless File.exist?(full)
              puts "⚠ pulando #{rel} — arquivo não existe"
              next
            end

            defn = model.definitions.load(full)
            extractor = SkpFeatureExtractor.new(defn)
            features  = extractor.extract

            print_table(File.basename(rel), features)
          end
          nil
        end

        def print_table(label, features)
          puts ''
          puts "── #{label} #{'─' * [70 - label.length, 3].max}"
          if features.empty?
            puts '  (sem features detectadas)'
            return
          end
          puts '  #  tipo            ⌀(mm)   prof(mm)  conf  notes'
          puts '  ─  ──────────────  ──────  ────────  ────  ─────────────────────────'
          features.each_with_index do |f, i|
            d = f[:diametro_mm] ? format('%6.2f', f[:diametro_mm]) : '   -- '
            p = format('%8.2f', f[:profundidade_mm])
            c = format('%4.2f', f[:confidence])
            t = f[:tipo].to_s.ljust(14)
            puts format('  %-2d %s %s  %s  %s  %s',
                        i + 1, t, d, p, c, f[:notes])
          end
        end
      end
    end
  end

  Ornato::Machining::DumpSkpFeatures.run

else
  # ── Standalone: mocks mínimos ────────────────────────────────────
  # Exercita só o load da classe pra detectar erros de sintaxe.
  # NÃO carrega .skp reais (formato binário proprietário).
  warn '╭─────────────────────────────────────────────────────────────'
  warn '│ AVISO: dump_skp_features.rb foi invocado fora do SketchUp.'
  warn '│ Não é possível parsear .skp sem a API do SketchUp.'
  warn '│'
  warn '│ Para rodar com dados reais, abra o SketchUp e use:'
  warn "│   load '#{__FILE__}'"
  warn '│ no Ruby Console.'
  warn '│'
  warn '│ Em modo standalone, este script apenas tenta carregar o'
  warn '│ extractor com mocks pra validar sintaxe.'
  warn '╰─────────────────────────────────────────────────────────────'

  # Mocks mínimos do namespace Sketchup/Geom
  module Sketchup; end
  unless defined?(Sketchup::Face)
    Sketchup::Face = Class.new
  end
  unless defined?(Sketchup::ComponentDefinition)
    Sketchup::ComponentDefinition = Class.new
  end

  unless defined?(Geom::Point3d)
    module Geom
      class Point3d
        attr_reader :x, :y, :z
        def initialize(x = 0, y = 0, z = 0); @x, @y, @z = x.to_f, y.to_f, z.to_f; end
        def distance(o); Math.sqrt((x - o.x)**2 + (y - o.y)**2 + (z - o.z)**2); end
        def -(o); Geom::Vector3d.new(x - o.x, y - o.y, z - o.z); end
      end
      class Vector3d
        attr_reader :x, :y, :z
        def initialize(x = 0, y = 0, z = 0); @x, @y, @z = x.to_f, y.to_f, z.to_f; end
        def length; Math.sqrt(x * x + y * y + z * z); end
        def dot(o); x * o.x + y * o.y + z * o.z; end
        def normalize
          l = length
          return self if l.zero?
          Vector3d.new(x / l, y / l, z / l)
        end
      end
      class BoundingBox
        attr_reader :min, :max
        def initialize; @min = nil; @max = nil; end
        def add(p); @min ||= p; @max ||= p; end
        def width; 0.0; end
        def height; 0.0; end
        def depth; 0.0; end
        def center; @min || Point3d.new; end
      end
    end
  end

  load File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'skp_feature_extractor.rb')

  # Exercita com definition vazia
  fake_defn = Object.new
  def fake_defn.entities; []; end
  result = Ornato::Machining::SkpFeatureExtractor.new(fake_defn).extract
  puts "smoke-test (definition vazia) → #{result.inspect}"
  puts 'OK — classe carrega sem erros de sintaxe.'
end
