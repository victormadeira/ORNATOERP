# =====================================================
# MachiningJson -- Serializa operacoes de usinagem para
# o formato JSON esperado pelo Ornato CNC (parsePluginJSON)
# =====================================================

require 'json'

module Ornato
  module Machining
    class MachiningJson
      # Categorias validas de operacoes reconhecidas pelo CNC
      VALID_CATEGORIES = %w[
        hole
        Transfer_vertical_saw_cut
        Transfer_horizontal_saw_cut
        pocket
        groove
        route
        contour
      ].freeze

      VALID_SIDES = %w[a b].freeze

      # Serializa hash de usinagem para o formato JSON esperado pelo Ornato CNC.
      #
      # @param machining_hash [Hash] mapa de persistent_id => Array<Hash> de operacoes brutas
      #   Cada operacao bruta deve conter:
      #     :category, :side, e parametros especificos por tipo
      # @return [Hash] hash JSON-ready no formato { persistent_id => { workers: { op_N => {...} } } }
      def serialize(machining_hash)
        result = {}

        machining_hash.each do |persistent_id, operations|
          next unless operations.is_a?(Array) || operations.is_a?(Hash)

          ops = operations.is_a?(Hash) ? operations.values : operations
          workers = {}

          ops.each_with_index do |op, idx|
            serialized = serialize_operation(op)
            next unless serialized

            workers["op_#{idx}"] = serialized
          end

          result[persistent_id.to_s] = { 'workers' => workers } unless workers.empty?
        end

        result
      end

      # Valida operacoes de usinagem e retorna lista de erros.
      #
      # @param workers [Hash] hash de workers { "op_0" => {...}, ... }
      # @return [Array<String>] lista de erros encontrados (vazia se tudo OK)
      def validate(workers)
        errors = []

        unless workers.is_a?(Hash)
          errors << 'workers deve ser um Hash'
          return errors
        end

        workers.each do |key, op|
          prefix = "#{key}:"

          unless op.is_a?(Hash)
            errors << "#{prefix} operacao deve ser um Hash"
            next
          end

          category = op['category'] || op[:category]
          unless category
            errors << "#{prefix} category ausente"
            next
          end

          unless VALID_CATEGORIES.include?(category.to_s)
            errors << "#{prefix} category '#{category}' invalida (validas: #{VALID_CATEGORIES.join(', ')})"
          end

          side = op['side'] || op[:side]
          if side && !VALID_SIDES.include?(side.to_s)
            errors << "#{prefix} side '#{side}' invalido (validos: #{VALID_SIDES.join(', ')})"
          end

          # Validar parametros especificos por tipo
          case category.to_s
          when 'hole'
            errors.concat(validate_hole(op, prefix))
          when 'Transfer_vertical_saw_cut', 'Transfer_horizontal_saw_cut'
            errors.concat(validate_saw_cut(op, prefix))
          when 'pocket'
            errors.concat(validate_pocket(op, prefix))
          when 'groove'
            errors.concat(validate_groove(op, prefix))
          when 'route'
            errors.concat(validate_route(op, prefix))
          end
        end

        errors
      end

      private

      # Serializa uma unica operacao conforme seu tipo
      def serialize_operation(op)
        return nil unless op.is_a?(Hash)

        category = (op[:category] || op['category']).to_s
        side = (op[:side] || op['side'] || 'a').to_s

        case category
        when 'hole'
          serialize_hole(op, side)
        when 'Transfer_vertical_saw_cut', 'Transfer_horizontal_saw_cut'
          serialize_saw_cut(op, category, side)
        when 'pocket'
          serialize_pocket(op, side)
        when 'groove'
          serialize_groove(op, side)
        when 'route'
          serialize_route(op, side)
        when 'contour'
          serialize_contour(op, side)
        else
          nil
        end
      end

      # ── Hole (furo passante ou cego) ────────────────

      def serialize_hole(op, side)
        {
          'category'   => 'hole',
          'position_x' => to_f(op, :position_x),
          'position_y' => to_f(op, :position_y),
          'diameter'   => to_f(op, :diameter),
          'depth'      => to_f(op, :depth),
          'side'       => side,
          'tool_code'  => to_s(op, :tool_code),
        }
      end

      def validate_hole(op, prefix)
        errs = []
        errs << "#{prefix} position_x ausente" unless numeric?(op, :position_x)
        errs << "#{prefix} position_y ausente" unless numeric?(op, :position_y)
        errs << "#{prefix} diameter ausente ou <= 0" unless positive?(op, :diameter)
        errs << "#{prefix} depth ausente ou <= 0" unless positive?(op, :depth)
        errs
      end

      # ── Saw cut (corte de serra vertical/horizontal) ──

      def serialize_saw_cut(op, category, side)
        {
          'category' => category,
          'pos_start_for_line' => {
            'x' => to_f(op, :start_x),
            'y' => to_f(op, :start_y),
          },
          'pos_end_for_line' => {
            'x' => to_f(op, :end_x),
            'y' => to_f(op, :end_y),
          },
          'width_line' => to_f(op, :width),
          'depth'      => to_f(op, :depth),
          'side'       => side,
        }
      end

      def validate_saw_cut(op, prefix)
        errs = []
        errs << "#{prefix} start_x ausente" unless numeric?(op, :start_x)
        errs << "#{prefix} start_y ausente" unless numeric?(op, :start_y)
        errs << "#{prefix} end_x ausente" unless numeric?(op, :end_x)
        errs << "#{prefix} end_y ausente" unless numeric?(op, :end_y)
        errs << "#{prefix} width ausente ou <= 0" unless positive?(op, :width)
        errs << "#{prefix} depth ausente ou <= 0" unless positive?(op, :depth)
        errs
      end

      # ── Pocket (rebaixo retangular) ─────────────────

      def serialize_pocket(op, side)
        {
          'category'   => 'pocket',
          'position_x' => to_f(op, :position_x),
          'position_y' => to_f(op, :position_y),
          'width'      => to_f(op, :width),
          'height'     => to_f(op, :height),
          'depth'      => to_f(op, :depth),
          'radius'     => to_f(op, :radius, default: 0),
          'side'       => side,
          'tool_code'  => to_s(op, :tool_code),
        }
      end

      def validate_pocket(op, prefix)
        errs = []
        errs << "#{prefix} position_x ausente" unless numeric?(op, :position_x)
        errs << "#{prefix} position_y ausente" unless numeric?(op, :position_y)
        errs << "#{prefix} width ausente ou <= 0" unless positive?(op, :width)
        errs << "#{prefix} height ausente ou <= 0" unless positive?(op, :height)
        errs << "#{prefix} depth ausente ou <= 0" unless positive?(op, :depth)
        errs
      end

      # ── Groove (rasgo/canal) ────────────────────────

      def serialize_groove(op, side)
        {
          'category' => 'groove',
          'pos_start_for_line' => {
            'x' => to_f(op, :start_x),
            'y' => to_f(op, :start_y),
          },
          'pos_end_for_line' => {
            'x' => to_f(op, :end_x),
            'y' => to_f(op, :end_y),
          },
          'width_line' => to_f(op, :width),
          'depth'      => to_f(op, :depth),
          'side'       => side,
          'tool_code'  => to_s(op, :tool_code),
        }
      end

      def validate_groove(op, prefix)
        errs = []
        errs << "#{prefix} start_x ausente" unless numeric?(op, :start_x)
        errs << "#{prefix} start_y ausente" unless numeric?(op, :start_y)
        errs << "#{prefix} end_x ausente" unless numeric?(op, :end_x)
        errs << "#{prefix} end_y ausente" unless numeric?(op, :end_y)
        errs << "#{prefix} width ausente ou <= 0" unless positive?(op, :width)
        errs << "#{prefix} depth ausente ou <= 0" unless positive?(op, :depth)
        errs
      end

      # ── Route (contorno/perfil) ─────────────────────

      def serialize_route(op, side)
        points = (op[:points] || op['points'] || []).map do |pt|
          { 'x' => pt[:x] || pt['x'] || 0, 'y' => pt[:y] || pt['y'] || 0 }
        end

        {
          'category'  => 'route',
          'points'    => points,
          'depth'     => to_f(op, :depth),
          'width'     => to_f(op, :width, default: 0),
          'side'      => side,
          'closed'    => op[:closed] || op['closed'] || false,
          'tool_code' => to_s(op, :tool_code),
        }
      end

      def validate_route(op, prefix)
        errs = []
        points = op[:points] || op['points']
        if !points || !points.is_a?(Array) || points.length < 2
          errs << "#{prefix} points deve ter ao menos 2 pontos"
        end
        errs << "#{prefix} depth ausente ou <= 0" unless positive?(op, :depth)
        errs
      end

      # ── Contour (contorno externo da peca) ──────────

      def serialize_contour(op, side)
        points = (op[:points] || op['points'] || []).map do |pt|
          if pt.is_a?(Array)
            { 'x' => pt[0] || 0, 'y' => pt[1] || 0 }
          else
            { 'x' => pt[:x] || pt['x'] || 0, 'y' => pt[:y] || pt['y'] || 0 }
          end
        end

        {
          'category' => 'contour',
          'points'   => points,
          'side'     => side,
        }
      end

      # ── Helpers ─────────────────────────────────────

      def to_f(op, key, default: 0)
        val = op[key] || op[key.to_s]
        val ? val.to_f : default.to_f
      end

      def to_s(op, key, default: '')
        val = op[key] || op[key.to_s]
        val ? val.to_s : default
      end

      def numeric?(op, key)
        val = op[key] || op[key.to_s]
        !val.nil?
      end

      def positive?(op, key)
        val = op[key] || op[key.to_s]
        val && val.to_f > 0
      end
    end
  end
end
