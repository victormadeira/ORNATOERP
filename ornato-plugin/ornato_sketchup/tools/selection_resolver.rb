# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# SelectionResolver — Resolve qualquer entidade SketchUp selecionada
# num payload rico para a UI v2 (cockpit / Inspector / Miras / Trocas).
#
# Inspirado no setModuleCurrent do UpMobb: cada seleção é resolvida em
# um Hash padronizado por "kind" (module|aggregate|piece|hardware|empty|
# unknown). A UI usa o payload para:
#   - habilitar/desabilitar botões (btn-aggregates, btn-change, etc.)
#   - renderizar Inspector contextual
#   - listar Miras (compatible_aggregates) e Trocas (compatible_swaps)
#
# Uso (Ruby):
#   payload = Ornato::Tools::SelectionResolver.resolve(entity)
#
# Uso (JS, via dialog_controller):
#   sketchup.resolve_selection(entityId)
#   // controller chama: window.onSelectionResolved(payload)
#
# Não modifica entidades — apenas leitura.
# ═══════════════════════════════════════════════════════════════

require 'json'

module Ornato
  module Tools
    class SelectionResolver

      DICT = 'Ornato'

      KIND_MAP = {
        'modulo'   => :module,
        'agregado' => :aggregate,
        'peca'     => :piece,
        'ferragem' => :hardware,
      }.freeze

      ALLOWED_ACTIONS = {
        module:   %w[edit_params add_aggregate swap_module repaint duplicate delete].freeze,
        aggregate:%w[edit_params swap_aggregate move_to_bay remove].freeze,
        piece:    %w[change_material change_thickness change_edges hide rotate_grain duplicate delete].freeze,
        hardware: %w[swap_variant change_position remove].freeze,
      }.freeze

      # ─── API pública ───────────────────────────────────────────

      # @param entity [Sketchup::Entity, Sketchup::Group, Sketchup::ComponentInstance, nil]
      # @return [Hash] payload normalizado pra UI
      def self.resolve(entity)
        new(entity).resolve
      end

      def initialize(entity)
        @entity = entity
      end

      def resolve
        return empty_payload if @entity.nil?
        return invalid_payload unless @entity.respond_to?(:get_attribute)

        kind = detect_kind
        case kind
        when :module    then payload_for_modulo
        when :aggregate then payload_for_agregado
        when :piece     then payload_for_peca
        when :hardware  then payload_for_ferragem
        else                 unknown_payload
        end
      end

      # ─── Helpers públicos (uso pela controller) ────────────────

      def detect_kind
        tipo = read_attr('tipo')
        return KIND_MAP[tipo.to_s] if tipo && KIND_MAP.key?(tipo.to_s)

        # Fallbacks por outros sinais (mesma lógica de detect_v2_entity_type)
        return :module    if read_attr('module_type') || read_attr('params')
        return :aggregate if read_attr('aggregate_id')
        return :hardware  if read_attr('componente_3d') || read_attr('regra')
        return :piece     if read_attr('role') || read_attr_lower('role')
        :unknown
      end

      # ─── Payloads por kind ─────────────────────────────────────

      private

      def payload_for_modulo
        params    = parse_json(read_attr('params'), {})
        aggregates= parse_json(read_attr('agregados'), [])
        shop_snap = parse_json(read_attr('shop_config_snapshot'), nil)

        stats = compute_module_stats(@entity)

        {
          kind:                 :module,
          entity_id:            safe_entity_id,
          module_id:            (read_attr('module_id') || read_attr('module_type')).to_s,
          name:                 entity_name,
          params:               params,
          parent_module_id:     nil,
          allowed_actions:      ALLOWED_ACTIONS[:module],
          compatible_aggregates:load_compatible_aggregates_for_module(params),
          compatible_swaps:     load_compatible_swaps_for_module,
          aggregates:           aggregates,
          shop_profile:         shop_snap.is_a?(Hash) ? shop_snap['profile'] : nil,
          shop_version:         shop_snap.is_a?(Hash) ? shop_snap['version'] : nil,
          stats:                stats,
        }
      end

      def payload_for_agregado
        params = parse_json(read_attr('params'), {})
        {
          kind:             :aggregate,
          entity_id:        safe_entity_id,
          aggregate_id:     read_attr('aggregate_id'),
          parent_module_id: walk_up_for_module_id,
          bay_id:           read_attr('bay_id'),
          name:             entity_name,
          params:           params,
          allowed_actions:  ALLOWED_ACTIONS[:aggregate],
          compatible_swaps: load_compatible_swaps_for_aggregate,
          compatible_aggregates: [],
        }
      end

      def payload_for_peca
        bordas_raw = read_attr('bordas')
        bordas = if bordas_raw.is_a?(String)
                   parse_json(bordas_raw, individual_bordas)
                 elsif bordas_raw.is_a?(Hash)
                   bordas_raw
                 else
                   individual_bordas
                 end

        {
          kind:                :piece,
          entity_id:           safe_entity_id,
          parent_module_id:    walk_up_for_module_id,
          parent_aggregate_id: walk_up_for_aggregate_id,
          role:                normalize_role(read_attr('role') || read_attr_lower('role')),
          name:                entity_name,
          material:            (read_attr('material') || '').to_s,
          dimensions:          read_dimensions,
          bordas:              bordas,
          allowed_actions:     ALLOWED_ACTIONS[:piece],
          compatible_swaps:    load_compatible_swaps_for_piece,
          machining_ops:       parse_json(read_attr('usinagens_extra'), []),
          compatible_aggregates: [],
        }
      end

      def payload_for_ferragem
        {
          kind:             :hardware,
          entity_id:        safe_entity_id,
          parent_module_id: walk_up_for_module_id,
          regra:            (read_attr('regra') || '').to_s,
          componente_3d:    (read_attr('componente_3d') || '').to_s,
          anchor_role:      read_attr('anchor_role'),
          name:             entity_name,
          allowed_actions:  ALLOWED_ACTIONS[:hardware],
          compatible_swaps: load_compatible_swaps_for_hardware,
          compatible_aggregates: [],
        }
      end

      def empty_payload
        {
          kind: :empty,
          entity_id: nil,
          name: nil,
          allowed_actions: [],
          compatible_aggregates: [],
          compatible_swaps: [],
        }
      end

      def invalid_payload
        empty_payload.merge(kind: :invalid)
      end

      def unknown_payload
        {
          kind: :unknown,
          entity_id: safe_entity_id,
          name: entity_name,
          allowed_actions: [],
          compatible_aggregates: [],
          compatible_swaps: [],
        }
      end

      # ─── Walk-up helpers ───────────────────────────────────────

      # Sobe pela cadeia `parent` até encontrar um group com Ornato.tipo == 'modulo'.
      # Retorna nil se não encontrar (entidade órfã ou não estampada).
      def walk_up_for_module_id(start = @entity)
        node = parent_of(start)
        guard = 0
        while node && guard < 32
          if node.respond_to?(:get_attribute)
            tipo = safe_get(node, 'tipo')
            if tipo.to_s == 'modulo' || safe_get(node, 'module_type')
              return (safe_get(node, 'module_id') || safe_get(node, 'module_type') || node_entity_id(node)).to_s
            end
          end
          node = parent_of(node)
          guard += 1
        end
        nil
      end

      def walk_up_for_aggregate_id(start = @entity)
        node = parent_of(start)
        guard = 0
        while node && guard < 32
          if node.respond_to?(:get_attribute)
            tipo = safe_get(node, 'tipo')
            agg  = safe_get(node, 'aggregate_id')
            return agg.to_s if tipo.to_s == 'agregado' || agg
          end
          node = parent_of(node)
          guard += 1
        end
        nil
      end

      # Pai de uma entidade SketchUp: Group#parent → Entities (do qual o
      # parent group é dono). Trabalha com mocks usando @parent ou .parent.
      def parent_of(node)
        return nil if node.nil?
        return node.parent if node.respond_to?(:parent)
        nil
      end

      def node_entity_id(node)
        node.respond_to?(:entityID) ? node.entityID : nil
      end

      # ─── Leitura de atributos (compatível com mock + SketchUp) ─

      def read_attr(key)
        safe_get(@entity, key)
      end

      def read_attr_lower(key)
        return nil unless @entity.respond_to?(:get_attribute)
        @entity.get_attribute('ornato', key, nil)
      rescue
        nil
      end

      def safe_get(node, key)
        return nil unless node.respond_to?(:get_attribute)
        node.get_attribute(DICT, key, nil)
      rescue
        nil
      end

      def safe_entity_id
        @entity.respond_to?(:entityID) ? @entity.entityID : nil
      end

      def entity_name
        return nil unless @entity.respond_to?(:name)
        n = @entity.name
        n.to_s.empty? ? nil : n.to_s
      rescue
        nil
      end

      # ─── Dimensions + bordas ───────────────────────────────────

      def read_dimensions
        esp = (read_attr('espessura') || 0).to_f
        bb_dims = bbox_dims
        if bb_dims.nil?
          return { largura: nil, altura: nil, espessura: (esp.zero? ? nil : esp) }
        end
        sorted = bb_dims.sort
        if esp > 0
          { largura: sorted[2].round(1), altura: sorted[1].round(1), espessura: esp.round(1) }
        else
          { largura: sorted[2].round(1), altura: sorted[1].round(1), espessura: sorted[0].round(1) }
        end
      end

      def bbox_dims
        return nil unless @entity.respond_to?(:bounds)
        bb = @entity.bounds rescue nil
        return nil if bb.nil?
        return nil if bb.respond_to?(:empty?) && bb.empty?
        w = bb.respond_to?(:width)  ? to_mm(bb.width)  : nil
        h = bb.respond_to?(:height) ? to_mm(bb.height) : nil
        d = bb.respond_to?(:depth)  ? to_mm(bb.depth)  : nil
        return nil if [w, h, d].any?(&:nil?)
        [w, h, d]
      rescue
        nil
      end

      def to_mm(v)
        return v.to_mm if v.respond_to?(:to_mm)
        v.to_f
      end

      def individual_bordas
        {
          frente: read_attr('borda_frente') == true,
          tras:   read_attr('borda_tras')   == true,
          topo:   read_attr('borda_topo')   == true,
          base:   read_attr('borda_base')   == true,
        }
      end

      def normalize_role(raw)
        return 'generic' if raw.nil? || raw.to_s.empty?
        if defined?(::Ornato::Core::RoleNormalizer)
          ::Ornato::Core::RoleNormalizer.normalize(raw).to_s
        else
          raw.to_s
        end
      rescue
        raw.to_s
      end

      # ─── Catálogos (Miras / Trocas) ────────────────────────────

      # Lista de agregados compatíveis com o módulo atual. MVP: lê
      # biblioteca/agregados/*.json e devolve metadados. A UI cruza
      # `compatible_aggregates` com bays detectadas (BayDetector) para
      # habilitar btn-aggregates.
      def load_compatible_aggregates_for_module(_module_params)
        dir = aggregates_dir
        return [] unless dir && File.directory?(dir)

        out = []
        Dir.glob(File.join(dir, '*.json')).sort.each do |path|
          begin
            raw = JSON.parse(File.read(path, encoding: 'utf-8'))
            out << {
              id:        raw['id'] || File.basename(path, '.json'),
              nome:      raw['nome'] || raw['id'],
              bay_target:raw['bay_target'],
              min_bay:   raw['min_bay'],
              descricao: raw['descricao'],
            }
          rescue
            next
          end
        end
        out
      end

      # Sprint 3: integra com SwapEngine paramétrico. Mantém fallback
      # para JSON cru caso SwapEngine não esteja carregado (testes isolados).
      def load_compatible_swaps_for_module
        list_swaps_via_engine(:module, { module_id: read_attr('module_id'),
                                         module_type: read_attr('module_type') }) ||
          load_swap_catalog('modules')
      end

      def load_compatible_swaps_for_aggregate
        list_swaps_via_engine(:aggregate, { aggregate_id: read_attr('aggregate_id') }) ||
          load_swap_catalog('aggregates')
      end

      def load_compatible_swaps_for_piece
        role = normalize_role(read_attr('role') || read_attr_lower('role'))
        list_swaps_via_engine(:piece, { role: role }) ||
          load_swap_catalog('pieces')
      end

      def load_compatible_swaps_for_hardware
        list_swaps_via_engine(:hardware, { regra: read_attr('regra') }) ||
          load_swap_catalog('hardware')
      end

      # Chama SwapEngine.list_swaps_for(payload_stub) e retorna
      # [{ id:, label: }, ...]. Devolve nil se a engine não está
      # disponível para que o caller use o fallback.
      def list_swaps_via_engine(kind, extra)
        return nil unless defined?(::Ornato::Constructor::SwapEngine)
        stub = { kind: kind }.merge(extra || {})
        ::Ornato::Constructor::SwapEngine.list_swaps_for(stub).map { |s|
          { id: s[:id], label: s[:label] }
        }
      rescue
        nil
      end

      def load_swap_catalog(category)
        dir = swap_dir
        return [] unless dir && File.directory?(dir)
        path = File.join(dir, "#{category}.json")
        return [] unless File.file?(path)
        JSON.parse(File.read(path, encoding: 'utf-8'))
      rescue
        []
      end

      def aggregates_dir
        root = plugin_root
        root ? File.join(root, 'biblioteca', 'agregados') : nil
      end

      def swap_dir
        root = plugin_root
        root ? File.join(root, 'biblioteca', 'swaps') : nil
      end

      def plugin_root
        return ::PLUGIN_DIR if defined?(::PLUGIN_DIR) && ::PLUGIN_DIR
        # Fallback: 3 níveis acima deste arquivo (.../ornato-plugin/)
        File.expand_path('../../..', __FILE__)
      rescue
        nil
      end

      # ─── Stats do módulo (contagem rápida) ─────────────────────

      def compute_module_stats(module_entity)
        stats = { piece_count: 0, hardware_count: 0, aggregate_count: 0 }
        children = entities_of(module_entity)
        return stats if children.nil?
        children.each do |c|
          next unless c.respond_to?(:get_attribute)
          tipo = safe_get(c, 'tipo')
          case tipo.to_s
          when 'peca'     then stats[:piece_count]     += 1
          when 'ferragem' then stats[:hardware_count]  += 1
          when 'agregado' then stats[:aggregate_count] += 1
          end
        end
        stats
      rescue
        { piece_count: 0, hardware_count: 0, aggregate_count: 0 }
      end

      def entities_of(node)
        return nil unless node
        if node.respond_to?(:entities)
          return node.entities
        elsif node.respond_to?(:definition) && node.definition && node.definition.respond_to?(:entities)
          return node.definition.entities
        end
        nil
      rescue
        nil
      end

      # ─── JSON helpers ──────────────────────────────────────────

      def parse_json(raw, fallback)
        return fallback if raw.nil?
        return raw if raw.is_a?(Hash) || raw.is_a?(Array)
        JSON.parse(raw.to_s)
      rescue
        fallback
      end
    end
  end
end
