# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# PieceStamper — Sistema de identificação de peças (o "wpsisashape")
#
# Toda peça reconhecida pelo sistema DEVE ter o atributo:
#   get_attribute('Ornato', 'tipo') == 'peca'
#
# Sem esse atributo o grupo é invisível para:
#   - Lista de corte
#   - Exportação JSON/CSV
#   - Cálculo de usinagens
#   - Cálculo de custo
#
# Isso evita que geladeiras, puxadores 3D, paredes de SketchUp
# e objetos decorativos sejam confundidos com peças de corte.
#
# TIPOS de entidade Ornato:
#   'peca'      → peça de corte MDF/MDP — ENTRA na lista
#   'modulo'    → container/caixaria — NÃO entra
#   'ferragem'  → dobradiça, corrediça 3D — NÃO entra
#   'ambiente'  → parede, piso, teto — NÃO entra
#   'decoracao' → objeto decorativo — NÃO entra
#
# Uso (builder automático):
#   PieceStamper.stamp(group, role: :lateral, material: 'MDF18_BrancoTX',
#                      espessura: 18, bordas: { frente: true, topo: true })
#
# Uso (verificação):
#   PieceStamper.piece?(group)           → true/false
#   PieceStamper.read(group)             → { role:, material:, espessura:, ... }
#   PieceStamper.tipo(group)             → 'peca' | 'modulo' | nil
#
# Uso (manual via painel):
#   PieceStamper.stamp_manual(group, params_hash)
#   PieceStamper.unstamp(group)          → remove atributos Ornato
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Library
    module PieceStamper

      DICT = 'Ornato'

      # Atributos obrigatórios para uma peça ser reconhecida
      REQUIRED_KEYS = %w[tipo espessura material role].freeze

      # Bordas padrão por role (quando não especificado explicitamente)
      DEFAULT_BORDAS = {
        lateral:      { frente: true,  tras: false, topo: true,  base: false },
        base:         { frente: true,  tras: false, topo: false, base: false },
        top:          { frente: true,  tras: false, topo: false, base: false },
        back_panel:   { frente: false, tras: false, topo: false, base: false },
        door:         { frente: true,  tras: true,  topo: true,  base: true  },
        drawer_front: { frente: true,  tras: true,  topo: true,  base: true  },
        shelf:        { frente: true,  tras: false, topo: false, base: false },
        divider:      { frente: true,  tras: false, topo: true,  base: false },
        kick:         { frente: true,  tras: false, topo: false, base: false },
        rail:         { frente: false, tras: false, topo: false, base: false },
        countertop:   { frente: true,  tras: false, topo: false, base: false },
        cover:        { frente: true,  tras: false, topo: true,  base: true  },
        drawer_side:  { frente: false, tras: false, topo: true,  base: false },
        drawer_back:  { frente: false, tras: false, topo: true,  base: false },
        drawer_bottom:{ frente: false, tras: false, topo: false, base: false },
        generic:      { frente: false, tras: false, topo: false, base: false },
      }.freeze

      # ─────────────────────────────────────────────────────
      # CARIMBAR uma peça criada pelo builder
      #
      # @param group [Sketchup::Group | Sketchup::ComponentInstance]
      # @param role [Symbol]  :lateral, :base, :door, etc.
      # @param material [String]  código do material (ex: 'MDF18_BrancoTX')
      # @param espessura [Numeric]  mm (real, não do BoundingBox)
      # @param bordas [Hash, nil]  { frente: bool, tras: bool, topo: bool, base: bool }
      #                            nil → usa DEFAULT_BORDAS para o role
      # @param obs [String]  observação livre
      # @param modulo_id [String]  ID do módulo pai (para rastreio)
      # @return [Sketchup::Group]
      # ─────────────────────────────────────────────────────
      def self.stamp(group, role:, material:, espessura:,
                     bordas: nil, obs: '', modulo_id: nil)

        return group unless valid_entity?(group)

        esp    = espessura.to_f
        role_s = role.to_s
        bordas_efetivas = resolve_bordas(role, bordas)

        # Resolve fita de borda padrão para o material
        fita_padrao = begin
          Catalog::MaterialCatalog.instance.default_edge(material) || ''
        rescue
          ''
        end

        group.set_attribute(DICT, 'tipo',        'peca')
        group.set_attribute(DICT, 'role',        role_s)
        group.set_attribute(DICT, 'material',    material.to_s)
        group.set_attribute(DICT, 'espessura',   esp)
        group.set_attribute(DICT, 'fita_padrao', fita_padrao)

        # Bordas individuais
        group.set_attribute(DICT, 'borda_frente', bordas_efetivas[:frente] ? true : false)
        group.set_attribute(DICT, 'borda_tras',   bordas_efetivas[:tras]   ? true : false)
        group.set_attribute(DICT, 'borda_topo',   bordas_efetivas[:topo]   ? true : false)
        group.set_attribute(DICT, 'borda_base',   bordas_efetivas[:base]   ? true : false)

        # Fita de cada borda (código da fita, ex: 'BOR_04x22_Branco')
        # Por padrão usa a fita padrão do material; pode ser sobrescrito
        group.set_attribute(DICT, 'fita_frente', bordas_efetivas[:frente] ? fita_padrao : '')
        group.set_attribute(DICT, 'fita_tras',   bordas_efetivas[:tras]   ? fita_padrao : '')
        group.set_attribute(DICT, 'fita_topo',   bordas_efetivas[:topo]   ? fita_padrao : '')
        group.set_attribute(DICT, 'fita_base',   bordas_efetivas[:base]   ? fita_padrao : '')

        group.set_attribute(DICT, 'obs',          obs.to_s)
        group.set_attribute(DICT, 'modulo_id',    modulo_id.to_s) if modulo_id
        group.set_attribute(DICT, 'stamped_at',   Time.now.iso8601)

        group
      end

      # ─────────────────────────────────────────────────────
      # CARIMBAR módulo container (caixaria)
      # ─────────────────────────────────────────────────────
      def self.stamp_module(group, module_id:, params: {}, nome: nil)
        return group unless valid_entity?(group)

        group.set_attribute(DICT, 'tipo',       'modulo')
        group.set_attribute(DICT, 'module_id',  module_id.to_s)
        group.set_attribute(DICT, 'module_type',module_id.to_s)
        group.set_attribute(DICT, 'params',     JSON.generate(params))
        group.set_attribute(DICT, 'nome',       nome.to_s) if nome
        group.set_attribute(DICT, 'created_at', Time.now.iso8601)

        group
      end

      # ─────────────────────────────────────────────────────
      # CARIMBO MANUAL — via painel do SketchUp
      # Usado quando o designer modela uma peça à mão e quer
      # que o sistema a reconheça.
      #
      # @param group [Sketchup::Group]
      # @param params [Hash] pode incluir qualquer chave do atributo
      # @return [Hash] { success:, errors:, data: }
      # ─────────────────────────────────────────────────────
      def self.stamp_manual(group, params)
        return { success: false, errors: ['Entidade inválida'] } unless valid_entity?(group)

        errors = []

        role_s    = params[:role]     || params['role']
        material  = params[:material] || params['material']
        espessura = params[:espessura]|| params['espessura']

        errors << 'role é obrigatório'     if role_s.nil? || role_s.to_s.empty?
        errors << 'material é obrigatório' if material.nil? || material.to_s.empty?
        errors << 'espessura é obrigatória'if espessura.nil?

        return { success: false, errors: errors } unless errors.empty?

        # Resolver espessura do material se não fornecida explicitamente
        esp_resolvida = if espessura.to_f > 0
          espessura.to_f
        else
          begin
            Catalog::MaterialCatalog.instance.thickness(material) || 18.0
          rescue
            18.0
          end
        end

        bordas = {
          frente: params[:borda_frente] || params['borda_frente'],
          tras:   params[:borda_tras]   || params['borda_tras'],
          topo:   params[:borda_topo]   || params['borda_topo'],
          base:   params[:borda_base]   || params['borda_base'],
        }

        obs      = params[:obs]      || params['obs']      || ''
        fita_f   = params[:fita_frente] || params['fita_frente'] || ''
        fita_t   = params[:fita_tras]   || params['fita_tras']   || ''
        fita_to  = params[:fita_topo]   || params['fita_topo']   || ''
        fita_b   = params[:fita_base]   || params['fita_base']   || ''

        stamp(group,
              role:      role_s.to_sym,
              material:  material.to_s,
              espessura: esp_resolvida,
              bordas:    bordas,
              obs:       obs)

        # Sobrescrever fitas se fornecidas explicitamente
        group.set_attribute(DICT, 'fita_frente', fita_f)  unless fita_f.empty?
        group.set_attribute(DICT, 'fita_tras',   fita_t)  unless fita_t.empty?
        group.set_attribute(DICT, 'fita_topo',   fita_to) unless fita_to.empty?
        group.set_attribute(DICT, 'fita_base',   fita_b)  unless fita_b.empty?

        group.set_attribute(DICT, 'manual', true)  # marcador de peça manual

        { success: true, errors: [], data: read(group) }
      end

      # ─────────────────────────────────────────────────────
      # VERIFICAÇÕES
      # ─────────────────────────────────────────────────────

      # Verifica se a entidade é uma peça reconhecida pelo sistema
      # @param entity [Sketchup::Entity]
      # @return [Boolean]
      def self.piece?(entity)
        return false unless valid_entity?(entity)
        entity.get_attribute(DICT, 'tipo') == 'peca'
      end

      # Verifica se é um módulo container
      def self.module?(entity)
        return false unless valid_entity?(entity)
        entity.get_attribute(DICT, 'tipo') == 'modulo'
      end

      # Retorna o tipo Ornato da entidade
      def self.tipo(entity)
        return nil unless valid_entity?(entity)
        entity.get_attribute(DICT, 'tipo')
      end

      # Verifica se a peça está completamente carimbada
      def self.fully_stamped?(entity)
        return false unless piece?(entity)
        REQUIRED_KEYS.all? do |key|
          val = entity.get_attribute(DICT, key)
          !val.nil? && val.to_s != ''
        end
      end

      # ─────────────────────────────────────────────────────
      # LEITURA de atributos de uma peça
      #
      # @param entity [Sketchup::Entity]
      # @return [Hash] todos os atributos Ornato da peça
      # ─────────────────────────────────────────────────────
      def self.read(entity)
        return {} unless valid_entity?(entity)

        role_s = entity.get_attribute(DICT, 'role').to_s

        {
          tipo:        entity.get_attribute(DICT, 'tipo'),
          role:        role_s.to_sym,
          material:    entity.get_attribute(DICT, 'material').to_s,
          espessura:   entity.get_attribute(DICT, 'espessura').to_f,
          fita_padrao: entity.get_attribute(DICT, 'fita_padrao').to_s,
          bordas: {
            frente: entity.get_attribute(DICT, 'borda_frente') == true,
            tras:   entity.get_attribute(DICT, 'borda_tras')   == true,
            topo:   entity.get_attribute(DICT, 'borda_topo')   == true,
            base:   entity.get_attribute(DICT, 'borda_base')   == true,
          },
          fitas: {
            frente: entity.get_attribute(DICT, 'fita_frente').to_s,
            tras:   entity.get_attribute(DICT, 'fita_tras').to_s,
            topo:   entity.get_attribute(DICT, 'fita_topo').to_s,
            base:   entity.get_attribute(DICT, 'fita_base').to_s,
          },
          obs:         entity.get_attribute(DICT, 'obs').to_s,
          modulo_id:   entity.get_attribute(DICT, 'modulo_id').to_s,
          manual:      entity.get_attribute(DICT, 'manual') == true,
          stamped_at:  entity.get_attribute(DICT, 'stamped_at').to_s,
          nome:        entity.name.to_s,
          entity_id:   entity.entityID,
        }
      end

      # Lê dimensões reais de uma peça (espessura do atributo, resto do BoundingBox)
      # @param entity [Sketchup::Entity]
      # @return [Hash] { comprimento:, largura:, espessura: } em mm
      def self.dimensions(entity)
        return {} unless valid_entity?(entity)

        esp_attr = entity.get_attribute(DICT, 'espessura').to_f
        bb       = entity.bounds

        dims_mm = [
          bb.width.to_mm.round(1),
          bb.height.to_mm.round(1),
          bb.depth.to_mm.round(1),
        ].sort.reverse  # maior → menor

        # Espessura vem do atributo (confiável), as outras 2 do BoundingBox
        if esp_attr > 0
          # Encontrar qual dimensão do BBox corresponde à espessura declarada
          # (a mais próxima do valor declarado)
          idx_esp = dims_mm.each_with_index.min_by { |v, _| (v - esp_attr).abs }[1]
          remaining = dims_mm.each_with_index.reject { |_, i| i == idx_esp }.map(&:first)
          {
            comprimento: remaining.max.round(1),
            largura:     remaining.min.round(1),
            espessura:   esp_attr,
          }
        else
          # Fallback: menor dimensão = espessura
          {
            comprimento: dims_mm[0],
            largura:     dims_mm[1],
            espessura:   dims_mm[2],
          }
        end
      end

      # ─────────────────────────────────────────────────────
      # REMOVER carimbo (desmarca a peça)
      # ─────────────────────────────────────────────────────
      def self.unstamp(entity)
        return unless valid_entity?(entity)
        dict = entity.attribute_dictionary(DICT)
        entity.delete_attribute(DICT) if dict
      end

      # ─────────────────────────────────────────────────────
      # VARREDURA — encontra todas as peças num conjunto de entidades
      #
      # @param entities [Sketchup::Entities]
      # @param recursive [Boolean] busca em sub-grupos também
      # @return [Array<Sketchup::Entity>]
      # ─────────────────────────────────────────────────────
      def self.find_pieces(entities, recursive: false)
        result = []
        entities.each do |ent|
          next unless ent.is_a?(Sketchup::Group) ||
                      ent.is_a?(Sketchup::ComponentInstance)

          if piece?(ent)
            result << ent
          elsif recursive && module?(ent)
            sub = ent.is_a?(Sketchup::Group) ? ent.entities :
                                               ent.definition.entities
            result.concat(find_pieces(sub, recursive: true))
          end
        end
        result
      end

      # Todas as peças de um módulo (group) — não recursivo por padrão
      def self.pieces_in_module(module_group)
        return [] unless valid_entity?(module_group)
        ents = module_group.is_a?(Sketchup::Group) ? module_group.entities :
                                                     module_group.definition.entities
        find_pieces(ents)
      end

      # ─────────────────────────────────────────────────────
      # EXPORTAÇÃO — serializa peça para o JSON de exportação
      # ─────────────────────────────────────────────────────
      def self.to_export_hash(entity)
        return nil unless piece?(entity)

        data  = read(entity)
        dims  = dimensions(entity)

        {
          id:          entity.entityID.to_s,
          nome:        entity.name.to_s,
          role:        data[:role].to_s,
          material:    data[:material],
          espessura:   dims[:espessura],
          comprimento: dims[:comprimento],
          largura:     dims[:largura],
          quantidade:  1,
          bordas: {
            frente: data[:fitas][:frente],
            tras:   data[:fitas][:tras],
            topo:   data[:fitas][:topo],
            base:   data[:fitas][:base],
          },
          obs:         data[:obs],
          modulo_id:   data[:modulo_id],
          manual:      data[:manual],
        }
      end

      # ─────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────

      def self.valid_entity?(ent)
        ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance)
      rescue
        false
      end

      def self.resolve_bordas(role, bordas_override)
        defaults = DEFAULT_BORDAS[role.to_sym] || DEFAULT_BORDAS[:generic]
        return defaults if bordas_override.nil?

        # Merge: usa o override onde fornecido, default onde não
        {
          frente: bordas_override.key?(:frente) ? bordas_override[:frente] : defaults[:frente],
          tras:   bordas_override.key?(:tras)   ? bordas_override[:tras]   : defaults[:tras],
          topo:   bordas_override.key?(:topo)   ? bordas_override[:topo]   : defaults[:topo],
          base:   bordas_override.key?(:base)   ? bordas_override[:base]   : defaults[:base],
        }
      end

    end
  end
end
