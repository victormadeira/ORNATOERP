# =====================================================
# JsonExporter -- Gera JSON completo compativel com
# parsePluginJSON() do Ornato CNC (formato UPMob)
# =====================================================

require 'json'
require_relative '../machining/machining_json'

module Ornato
  module Export
    class JsonExporter
      # @param analysis [Hash] resultado de ModelAnalyzer#analyze
      #   { modules:, pieces:, materials:, joints:, summary: }
      # @param machining [Hash] mapa persistent_id => Array<Hash> de operacoes
      # @param config [Hash] configuracao do plugin (Config.load)
      def initialize(analysis, machining, config)
        @analysis = analysis
        @machining = machining
        @config = config
        @serializer = Machining::MachiningJson.new
      end

      # Gera o hash completo no formato parsePluginJSON.
      #
      # @return [Hash]
      def generate
        {
          'details_project' => build_project_details,
          'model_entities'  => build_model_entities,
          'machining'       => build_machining,
        }
      end

      # Retorna JSON string formatada.
      #
      # @return [String]
      def to_json
        JSON.pretty_generate(generate)
      end

      private

      # ── details_project ─────────────────────────────

      def build_project_details
        model = Sketchup.active_model rescue nil
        model_name = model ? (model.title.to_s.empty? ? 'Sem titulo' : model.title) : 'Sem titulo'

        {
          'client_name'  => extract_attribute('client_name', 'Cliente'),
          'project_name' => extract_attribute('project_name', model_name),
          'project_code' => extract_attribute('project_code', generate_project_code),
          'seller_name'  => extract_attribute('seller_name', ''),
        }
      end

      def extract_attribute(key, default)
        model = Sketchup.active_model rescue nil
        return default unless model

        # Tentar ler de atributos do modelo
        val = model.get_attribute('Ornato', key)
        val = model.get_attribute('ProjectInfo', key) if val.nil? || val.to_s.empty?
        (val.nil? || val.to_s.empty?) ? default : val.to_s
      end

      def generate_project_code
        "PRJ_#{Time.now.strftime('%Y%m%d_%H%M')}"
      end

      # ── model_entities ──────────────────────────────

      def build_model_entities
        entities = {}
        modules = @analysis[:modules] || []
        pieces = @analysis[:pieces] || []

        if modules.empty?
          # Sem modulos — agrupar tudo em um modulo virtual
          entities['0'] = build_module_entity('Geral', pieces, 0)
        else
          modules.each_with_index do |mod, mod_idx|
            mod_pieces = pieces.select { |p| p[:module_group] == mod[:group] }
            entities[mod_idx.to_s] = build_module_entity(mod[:name], mod_pieces, mod_idx)
          end

          # Pecas orfas (sem modulo)
          orphans = pieces.select { |p| p[:module_group].nil? }
          unless orphans.empty?
            idx = modules.length
            entities[idx.to_s] = build_module_entity('Avulso', orphans, idx)
          end
        end

        entities
      end

      def build_module_entity(module_name, pieces, mod_idx)
        piece_entities = {}

        pieces.each_with_index do |piece, p_idx|
          piece_entities[p_idx.to_s] = build_piece_entity(piece, module_name, mod_idx)
        end

        {
          'upmmasterdescription' => module_name,
          'upmmasterid'         => mod_idx,
          'entities'            => piece_entities,
        }
      end

      def build_piece_entity(piece, module_name, mod_idx)
        pid = piece[:persistent_id] || ''
        mat_code = resolve_material_code(piece)

        # Dimensoes: comprimento e a maior, largura a media, espessura a menor
        comp = piece[:comprimento] || 0
        larg = piece[:largura] || 0
        esp = piece[:espessura] || 0

        entity = {
          'upmpiece'              => true,
          'upmpersistentid'       => pid,
          'upmcode'               => piece[:name] || '',
          'upmdescription'        => piece[:name] || '',
          'upmmasterdescription'  => module_name,
          'upmmasterid'           => mod_idx,
          'upmproductfinal'       => module_name,
          'upmquantity'           => piece[:quantity] || 1,
          'upmheight'             => comp,
          'upmdepth'              => larg,
          'upmwidth'              => esp,
          'upmedgeside1'          => edge_code(piece, :right),
          'upmedgeside2'          => edge_code(piece, :left),
          'upmedgeside3'          => edge_code(piece, :front),
          'upmedgeside4'          => edge_code(piece, :back),
          'upmedgesidetype'       => piece[:grain] || 'sem_veio',
          'upmdraw'               => '',
          'upmprocesscodea'       => '',
          'upmprocesscodeb'       => '',
        }

        # Sub-entity para o painel (feedstock panel com material e dimensoes de corte)
        entity['entities'] = {
          '0' => {
            'upmfeedstockpanel' => true,
            'upmmaterialcode'   => mat_code,
            'upmdescription'    => piece[:material_name] || mat_code,
            'upmcode'           => mat_code,
            'upmrealthickness'  => esp,
            'upmthickness'      => esp,
            'upmcutlength'      => comp,
            'upmlength'         => comp,
            'upmcutwidth'       => larg,
            'upmwidth'          => larg,
          }
        }

        entity
      end

      def resolve_material_code(piece)
        # Primeiro: buscar no mapeamento de materiais configurado
        mat_map = @config[:material_map] || @config['material_map'] || {}
        mat_name = piece[:material_name].to_s

        mapped = mat_map[mat_name]
        return mapped if mapped && !mapped.empty?

        # Fallback: usar material_code da analise ou gerar do nome
        return piece[:material_code] if piece[:material_code] && !piece[:material_code].empty?

        # Gerar codigo baseado no material + espessura
        if mat_name && !mat_name.empty?
          clean_name = mat_name.gsub(/[^a-zA-Z0-9_]/, '_').upcase
          "#{clean_name}_#{piece[:espessura]}"
        else
          "MATERIAL_#{piece[:espessura]}"
        end
      end

      def edge_code(piece, side)
        edges = piece[:edges]
        return '' unless edges.is_a?(Hash)

        val = edges[side] || edges[side.to_s]
        val ? val.to_s : ''
      end

      # ── machining ───────────────────────────────────

      def build_machining
        @serializer.serialize(@machining)
      end
    end
  end
end
