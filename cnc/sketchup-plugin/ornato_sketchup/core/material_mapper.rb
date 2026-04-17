# ═══════════════════════════════════════════════════════
# MaterialMapper — Mapeamento de materiais SketchUp → Ornato
# Traduz nomes de display do SketchUp para codigos de
# material do sistema CNC Ornato. Armazena mapeamentos
# persistentes nos defaults do SketchUp.
# ═══════════════════════════════════════════════════════

module Ornato
  module Core
    class MaterialMapper
      # Chave para persistencia nos SketchUp defaults
      DEFAULTS_KEY = 'ornato_material_mappings'
      DEFAULTS_SECTION = 'Ornato'

      # Padroes regex => codigo Ornato para mapeamento automatico
      # Ordem importa: padroes mais especificos primeiro
      DEFAULT_PATTERNS = [
        # MDF com espessuras e acabamentos
        { pattern: /mdf.*branco.*18|mdf\s*18.*branco/i,         code: 'MDF_18_BRANCO' },
        { pattern: /mdf.*branco.*15|mdf\s*15.*branco/i,         code: 'MDF_15_BRANCO' },
        { pattern: /mdf.*branco.*12|mdf\s*12.*branco/i,         code: 'MDF_12_BRANCO' },
        { pattern: /mdf.*branco.*9|mdf\s*9.*branco/i,           code: 'MDF_9_BRANCO' },
        { pattern: /mdf.*branco.*6|mdf\s*6.*branco/i,           code: 'MDF_6_BRANCO' },
        { pattern: /mdf.*branco.*3|mdf\s*3.*branco/i,           code: 'MDF_3_BRANCO' },
        { pattern: /mdf.*cru.*18|mdf\s*18.*cru/i,               code: 'MDF_18_CRU' },
        { pattern: /mdf.*cru.*15|mdf\s*15.*cru/i,               code: 'MDF_15_CRU' },
        { pattern: /mdf.*cru/i,                                  code: 'MDF_18_CRU' },
        { pattern: /mdf.*preto/i,                                code: 'MDF_18_PRETO' },
        { pattern: /mdf.*18/i,                                   code: 'MDF_18_BRANCO' },
        { pattern: /mdf.*15/i,                                   code: 'MDF_15_BRANCO' },
        { pattern: /mdf/i,                                       code: 'MDF_18_BRANCO' },

        # BP / Melamina com padroes
        { pattern: /bp.*carvalho|melamina.*carvalho/i,           code: 'BP_18_CARVALHO' },
        { pattern: /bp.*nogal|melamina.*nogal/i,                 code: 'BP_18_NOGAL' },
        { pattern: /bp.*branco|melamina.*branco/i,               code: 'BP_18_BRANCO' },
        { pattern: /bp.*preto|melamina.*preto/i,                 code: 'BP_18_PRETO' },
        { pattern: /bp.*cinza|melamina.*cinza/i,                 code: 'BP_18_CINZA' },
        { pattern: /bp.*15/i,                                    code: 'BP_15' },
        { pattern: /bp.*18/i,                                    code: 'BP_18' },
        { pattern: /bp|melamina/i,                               code: 'BP_15' },

        # MDP
        { pattern: /mdp.*18/i,                                   code: 'MDP_18' },
        { pattern: /mdp.*15/i,                                   code: 'MDP_15' },
        { pattern: /mdp/i,                                       code: 'MDP_15' },

        # Compensado
        { pattern: /compensado.*18|compen.*18/i,                 code: 'COMP_18' },
        { pattern: /compensado.*15|compen.*15/i,                 code: 'COMP_15' },
        { pattern: /compensado|compen/i,                         code: 'COMP_15' },

        # OSB
        { pattern: /osb/i,                                       code: 'OSB_18' },

        # HDF / Eucatex (fundos)
        { pattern: /hdf|eucatex|duratex|hardboard/i,             code: 'HDF_3' },

        # Vidro
        { pattern: /vidro|glass/i,                               code: 'VIDRO' },

        # Fundo 3mm generico
        { pattern: /fundo|back.*panel/i,                         code: 'HDF_3' },
      ]

      # Mapeamentos persistentes carregados do SketchUp defaults
      @custom_mappings = {}

      class << self
        # Mapeia nome de material SketchUp para codigo Ornato.
        # Primeiro tenta mapeamento customizado (persistente),
        # depois tenta padroes automaticos.
        #
        # @param skp_material_name [String] nome de display do material no SketchUp
        # @return [String, nil] codigo Ornato ou nil se nao encontrou
        def map(skp_material_name)
          return nil if skp_material_name.nil? || skp_material_name.empty?

          name = skp_material_name.strip

          # 1. Mapeamento customizado (do usuario)
          load_mappings if @custom_mappings.empty?
          custom = @custom_mappings[name.downcase]
          return custom if custom

          # 2. Mapeamento automatico por padroes
          match = DEFAULT_PATTERNS.find { |p| name.match?(p[:pattern]) }
          return match[:code] if match

          # 3. Nao encontrou mapeamento
          nil
        end

        # Adiciona ou atualiza mapeamento customizado.
        # Salva persistentemente nos SketchUp defaults.
        #
        # @param skp_name [String] nome do material no SketchUp
        # @param ornato_code [String] codigo do material no Ornato
        def add_mapping(skp_name, ornato_code)
          load_mappings if @custom_mappings.empty?
          @custom_mappings[skp_name.strip.downcase] = ornato_code.strip
          save_mappings
        end

        # Remove mapeamento customizado.
        #
        # @param skp_name [String] nome do material no SketchUp
        def remove_mapping(skp_name)
          load_mappings if @custom_mappings.empty?
          @custom_mappings.delete(skp_name.strip.downcase)
          save_mappings
        end

        # Retorna todos os mapeamentos customizados.
        #
        # @return [Hash] { skp_name_downcase => ornato_code }
        def custom_mappings
          load_mappings if @custom_mappings.empty?
          @custom_mappings.dup
        end

        # Retorna todos os padroes automaticos disponiveis.
        #
        # @return [Array<Hash>] lista de { pattern:, code: }
        def default_patterns
          DEFAULT_PATTERNS
        end

        # Tenta mapear e retorna info detalhada sobre o mapeamento.
        # Util para debug e interface de configuracao.
        #
        # @param skp_material_name [String]
        # @return [Hash] { code:, source:, pattern: }
        def map_with_info(skp_material_name)
          return { code: nil, source: :none, pattern: nil } if skp_material_name.nil?

          name = skp_material_name.strip

          # Custom?
          load_mappings if @custom_mappings.empty?
          custom = @custom_mappings[name.downcase]
          if custom
            return { code: custom, source: :custom, pattern: name.downcase }
          end

          # Auto pattern?
          match = DEFAULT_PATTERNS.find { |p| name.match?(p[:pattern]) }
          if match
            return { code: match[:code], source: :auto, pattern: match[:pattern].source }
          end

          { code: nil, source: :none, pattern: nil }
        end

        # Mapeia todos os materiais do modelo ativo.
        # Retorna relatorio de materiais encontrados e seus mapeamentos.
        #
        # @param model [Sketchup::Model]
        # @return [Array<Hash>] lista de { name:, code:, source:, used_count: }
        def map_model_materials(model)
          materials = model.materials
          results = []

          materials.each do |mat|
            info = map_with_info(mat.display_name)
            results << {
              name: mat.display_name,
              code: info[:code],
              source: info[:source],
              color: mat.color ? "#%02x%02x%02x" % [mat.color.red, mat.color.green, mat.color.blue] : nil,
            }
          end

          results
        end

        # Carrega mapeamentos persistentes dos SketchUp defaults.
        def load_mappings
          @custom_mappings = {}

          begin
            json_str = Sketchup.read_default(DEFAULTS_SECTION, DEFAULTS_KEY, '{}')
            parsed = JSON.parse(json_str)
            @custom_mappings = parsed if parsed.is_a?(Hash)
          rescue => e
            puts "Ornato MaterialMapper: Erro ao carregar mapeamentos: #{e.message}"
            @custom_mappings = {}
          end
        end

        # Salva mapeamentos persistentes nos SketchUp defaults.
        def save_mappings
          begin
            json_str = JSON.generate(@custom_mappings)
            Sketchup.write_default(DEFAULTS_SECTION, DEFAULTS_KEY, json_str)
          rescue => e
            puts "Ornato MaterialMapper: Erro ao salvar mapeamentos: #{e.message}"
          end
        end

        # Reseta mapeamentos customizados (para testes ou reset).
        def reset_mappings!
          @custom_mappings = {}
          save_mappings
        end

        # Importa mapeamentos de um hash externo (ex: de config JSON).
        #
        # @param mappings [Hash] { "MDF Branco" => "MDF_18_BRANCO", ... }
        def import_mappings(mappings)
          load_mappings if @custom_mappings.empty?
          mappings.each do |skp_name, ornato_code|
            @custom_mappings[skp_name.strip.downcase] = ornato_code.strip
          end
          save_mappings
        end

        # Exporta mapeamentos customizados como hash (para backup/config).
        #
        # @return [Hash]
        def export_mappings
          load_mappings if @custom_mappings.empty?
          @custom_mappings.dup
        end
      end
    end
  end
end
