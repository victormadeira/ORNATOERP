# =====================================================
# BomExporter -- Bill of Materials para ferragens
# Lista todos os parafusos, dobradicas, minifix,
# cavilhas, puxadores, corredicas com quantidades
# =====================================================

require 'json'

module Ornato
  module Export
    class BomExporter
      # Tipos de ferragem suportados com seus nomes de exibicao
      HARDWARE_TYPES = {
        hinge:        'Dobradica',
        minifix_body: 'Minifix (corpo)',
        minifix_pin:  'Minifix (pino)',
        minifix_bolt: 'Minifix (parafuso)',
        dowel:        'Cavilha',
        handle:       'Puxador',
        handle_screw: 'Parafuso de puxador',
        slide:        'Corredica',
        slide_screw:  'Parafuso de corredica',
        shelf_pin:    'Suporte de prateleira',
        system32_pin: 'Pino Sistema 32',
        screw:        'Parafuso generico',
        back_panel:   'Fundo (rasgo)',
      }.freeze

      # @param analysis [Hash] resultado de ModelAnalyzer#analyze (com joints)
      # @param machining [Hash] operacoes de usinagem por persistent_id
      # @param config [Hash] configuracao do plugin
      def initialize(analysis, machining, config)
        @analysis = analysis
        @machining = machining
        @config = config
      end

      # Gera BOM como array de hashes.
      #
      # @return [Array<Hash>] cada item: { type:, description:, reference:, quantity:, unit:, module:, notes: }
      def generate
        items = []

        items.concat(count_from_machining)
        items.concat(count_from_joints)

        # Consolidar itens identicos (mesmo type + reference + module)
        consolidated = consolidate(items)

        # Ordenar por modulo, depois por tipo
        consolidated.sort_by { |i| [i[:module].to_s, i[:type].to_s] }
      end

      # Gera BOM como CSV string.
      #
      # @return [String]
      def to_csv(separator: ';')
        bom = generate
        headers = %w[Tipo Descricao Referencia Qtd Unidade Modulo Observacao]
        lines = [headers.join(separator)]

        bom.each do |item|
          line = [
            item[:description],
            item[:reference],
            item[:specification],
            item[:quantity],
            item[:unit],
            item[:module],
            item[:notes],
          ].map { |v| v.to_s }
          lines << line.join(separator)
        end

        lines.join("\n") + "\n"
      end

      # Gera BOM como hash para JSON.
      #
      # @return [Hash] { items: [...], summary: { total_items:, total_quantity:, by_type: {...} } }
      def to_hash
        bom = generate

        by_type = {}
        bom.each do |item|
          key = item[:type].to_s
          by_type[key] ||= 0
          by_type[key] += item[:quantity]
        end

        {
          items: bom,
          summary: {
            total_items: bom.length,
            total_quantity: bom.sum { |i| i[:quantity] },
            by_type: by_type,
          }
        }
      end

      private

      # Conta ferragens a partir das operacoes de usinagem
      def count_from_machining
        items = []

        @machining.each do |persistent_id, operations|
          piece = find_piece(persistent_id)
          mod_name = piece ? (piece[:module_name] || 'Avulso') : 'Avulso'
          piece_name = piece ? (piece[:name] || persistent_id) : persistent_id
          quantity_mult = piece ? (piece[:quantity] || 1) : 1

          ops = normalize_operations(operations)

          ops.each do |op|
            hw_items = classify_hardware_from_operation(op, piece_name)
            hw_items.each do |hw|
              hw[:module] = mod_name
              hw[:quantity] = (hw[:quantity] || 1) * quantity_mult
              items << hw
            end
          end
        end

        items
      end

      # Conta ferragens a partir de juncoes detectadas
      def count_from_joints
        items = []
        joints = @analysis[:joints] || []

        joints.each do |joint|
          type = joint[:type] || joint['type']
          mod_name = joint[:module_name] || 'Geral'
          qty = joint[:quantity] || 1

          case type.to_s
          when 'minifix'
            items << bom_item(:minifix_body, 'Minifix corpo 15mm', 'MFX-15', qty, mod_name, "#{joint[:piece_a]} <> #{joint[:piece_b]}")
            items << bom_item(:minifix_pin, 'Minifix pino 8x11mm', 'MFX-PIN-8', qty, mod_name, '')
            items << bom_item(:minifix_bolt, 'Parafuso minifix 7x40mm', 'MFX-BLT-7x40', qty, mod_name, '')
          when 'dowel'
            items << bom_item(:dowel, 'Cavilha 8x30mm', 'CAV-8x30', qty * 2, mod_name, "#{joint[:piece_a]} <> #{joint[:piece_b]}")
          when 'screw'
            items << bom_item(:screw, 'Parafuso 4x30mm', 'PAR-4x30', qty, mod_name, '')
          end
        end

        items
      end

      # Classifica operacao de usinagem em tipo de ferragem
      def classify_hardware_from_operation(op, piece_name)
        items = []
        category = (op['category'] || op[:category]).to_s
        diameter = (op['diameter'] || op[:diameter]).to_f
        depth = (op['depth'] || op[:depth]).to_f

        case category
        when 'hole'
          item = classify_hole(diameter, depth, piece_name)
          items << item if item
        when 'pocket'
          width = (op['width'] || op[:width]).to_f
          height = (op['height'] || op[:height]).to_f
          item = classify_pocket(width, height, depth, piece_name)
          items << item if item
        when 'groove'
          items << bom_item(:back_panel, 'Rasgo para fundo', '', 1, '', "Peca: #{piece_name}")
        end

        items
      end

      def classify_hole(diameter, depth, piece_name)
        hinge_cfg = @config[:hinge] || {}
        minifix_cfg = @config[:minifix] || {}
        dowel_cfg = @config[:dowel] || {}
        handle_cfg = @config[:handle] || {}
        sys32_cfg = @config[:system32] || {}
        slide_cfg = @config[:drawer_slide] || {}

        cup_dia = (hinge_cfg[:cup_diameter] || 35).to_f
        mfx_body_dia = (minifix_cfg[:body_diameter] || 15).to_f
        mfx_pin_dia = (minifix_cfg[:pin_diameter] || 8).to_f
        dowel_dia = (dowel_cfg[:diameter] || 8).to_f
        handle_dia = (handle_cfg[:hole_diameter] || 5).to_f
        sys32_dia = (sys32_cfg[:hole_diameter] || 5).to_f
        slide_dia = (slide_cfg[:hole_diameter] || 4).to_f

        tolerance = 0.5

        if (diameter - cup_dia).abs < tolerance
          bom_item(:hinge, "Dobradica caneco #{diameter.round(0)}mm", 'DBR-35', 1, '', "Peca: #{piece_name}")
        elsif (diameter - mfx_body_dia).abs < tolerance
          bom_item(:minifix_body, "Minifix corpo #{diameter.round(0)}mm", 'MFX-15', 1, '', "Peca: #{piece_name}")
        elsif (diameter - mfx_pin_dia).abs < tolerance && depth < 15
          bom_item(:minifix_pin, "Minifix pino #{diameter.round(0)}x#{depth.round(0)}mm", 'MFX-PIN-8', 1, '', "Peca: #{piece_name}")
        elsif (diameter - dowel_dia).abs < tolerance
          bom_item(:dowel, "Cavilha #{diameter.round(0)}x#{(depth * 2).round(0)}mm", "CAV-#{diameter.round(0)}x#{(depth * 2).round(0)}", 1, '', "Peca: #{piece_name}")
        elsif (diameter - slide_dia).abs < tolerance
          bom_item(:slide_screw, "Parafuso corredica #{diameter.round(0)}mm", "PAR-#{diameter.round(0)}x12", 1, '', "Peca: #{piece_name}")
        elsif (diameter - handle_dia).abs < tolerance
          bom_item(:handle_screw, "Parafuso puxador M#{diameter.round(0)}", "PUX-M#{diameter.round(0)}", 1, '', "Peca: #{piece_name}")
        elsif (diameter - sys32_dia).abs < tolerance
          bom_item(:system32_pin, "Pino sistema 32 #{diameter.round(0)}mm", "S32-#{diameter.round(0)}", 1, '', "Peca: #{piece_name}")
        else
          bom_item(:screw, "Furo #{diameter.round(1)}x#{depth.round(1)}mm", '', 1, '', "Peca: #{piece_name}")
        end
      end

      def classify_pocket(width, height, depth, piece_name)
        hinge_cfg = @config[:hinge] || {}
        cup_dia = (hinge_cfg[:cup_diameter] || 35).to_f

        # Pocket circular ~ dobradica
        if (width - height).abs < 1 && (width - cup_dia).abs < 2
          bom_item(:hinge, "Dobradica caneco #{cup_dia.round(0)}mm", 'DBR-35', 1, '', "Peca: #{piece_name}")
        else
          nil # Pocket generico nao gera ferragem no BOM
        end
      end

      def bom_item(type, description, reference, quantity, mod_name, notes)
        {
          type:          type,
          description:   description,
          reference:     reference,
          specification: HARDWARE_TYPES[type] || type.to_s,
          quantity:      quantity,
          unit:          'un',
          module:        mod_name,
          notes:         notes,
        }
      end

      def find_piece(persistent_id)
        (@analysis[:pieces] || []).find { |p| p[:persistent_id] == persistent_id }
      end

      def normalize_operations(operations)
        if operations.is_a?(Hash) && operations['workers']
          operations['workers'].values
        elsif operations.is_a?(Hash)
          operations.values.select { |v| v.is_a?(Hash) }
        elsif operations.is_a?(Array)
          operations
        else
          []
        end
      end

      # Consolida itens identicos somando quantidades
      def consolidate(items)
        groups = {}

        items.each do |item|
          key = "#{item[:type]}|#{item[:reference]}|#{item[:module]}"
          if groups[key]
            groups[key][:quantity] += item[:quantity]
            # Acumular notas se diferentes
            existing_notes = groups[key][:notes].to_s
            new_notes = item[:notes].to_s
            unless new_notes.empty? || existing_notes.include?(new_notes)
              groups[key][:notes] = [existing_notes, new_notes].reject(&:empty?).join('; ')
            end
          else
            groups[key] = item.dup
          end
        end

        groups.values
      end
    end
  end
end
