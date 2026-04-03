# ═══════════════════════════════════════════════════════
# BoxBuilder — Constrói módulos peça-a-peça no SketchUp
# Motor de fórmulas: resolve {largura}, {espessura}, etc.
# ═══════════════════════════════════════════════════════

require 'json'

module Ornato
  module Constructor
    module BoxBuilder

      # ── Criar módulo customizado a partir do JSON do construtor ──
      # @param json_str [String] JSON do construtor (vem do dialog)
      # @return [Sketchup::Group] grupo criado
      def self.create_from_json(json_str)
        data = JSON.parse(json_str, symbolize_names: true)
        model = Sketchup.active_model
        return unless model

        nome   = data[:nome] || 'Módulo Customizado'
        params = {
          largura:       data[:largura].to_f,
          altura:        data[:altura].to_f,
          profundidade:  data[:profundidade].to_f,
          espessura:     data[:espessura].to_f,
          rodape:        data[:rodape].to_f,
        }

        # Variáveis derivadas
        params[:interna_w] = params[:largura] - 2 * params[:espessura]
        params[:interna_h] = params[:altura] - params[:espessura] - params[:rodape]
        params[:interna_d] = params[:profundidade]

        pecas = data[:pecas] || []
        if pecas.empty?
          UI.messagebox('Nenhuma peça definida no módulo.')
          return nil
        end

        model.start_operation("Ornato: Criar #{nome}", true)

        begin
          # Grupo pai do módulo
          parent = model.active_entities.add_group
          parent.name = "#{nome} #{params[:largura].to_i}x#{params[:altura].to_i}x#{params[:profundidade].to_i}"

          # Atributos Ornato
          parent.set_attribute('Ornato', 'module_type', 'custom')
          parent.set_attribute('Ornato', 'module_name', nome)
          parent.set_attribute('Ornato', 'params', JSON.generate(params))
          parent.set_attribute('Ornato', 'pecas_schema', json_str)
          parent.set_attribute('Ornato', 'slots', '[]')
          parent.set_attribute('Ornato', 'finishes', '{}')
          parent.set_attribute('Ornato', 'created_at', Time.now.iso8601)

          # Criar cada peça
          created_pieces = []
          pecas.each_with_index do |peca, idx|
            # Avaliar condição
            if peca[:condicao] && !peca[:condicao].to_s.empty?
              next unless evaluate_condition(peca[:condicao].to_s, params)
            end

            piece_group = create_piece(parent, peca, params, idx)
            created_pieces << piece_group if piece_group
          end

          # Aplicar ferragens automáticas
          if data[:ferragens]
            apply_auto_hardware(parent, created_pieces, data[:ferragens], data[:juncao], params)
          end

          model.commit_operation

          UI.messagebox(
            "Módulo \"#{nome}\" criado!\n\n" \
            "#{created_pieces.length} peças geradas.\n" \
            "Selecione o módulo e use Agregador para adicionar portas, gavetas, etc."
          )

          parent

        rescue => e
          model.abort_operation
          UI.messagebox("Erro ao criar módulo: #{e.message}")
          puts "BoxBuilder ERRO: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
          nil
        end
      end

      # ── Criar uma peça individual ──
      def self.create_piece(parent, peca, params, idx)
        w = resolve_formula(peca[:largura], params).to_f
        h = resolve_formula(peca[:altura], params).to_f
        e = resolve_formula(peca[:espessura], params).to_f

        return nil if w <= 0 || h <= 0 || e <= 0

        piece = parent.entities.add_group
        piece.name = peca[:nome] || "Peça #{idx + 1}"

        # Criar geometria (box)
        pts = [
          Geom::Point3d.new(0, 0, 0),
          Geom::Point3d.new(w.mm, 0, 0),
          Geom::Point3d.new(w.mm, e.mm, 0),
          Geom::Point3d.new(0, e.mm, 0),
        ]
        face = piece.entities.add_face(pts)
        face.pushpull(-h.mm) if face

        # Posicionar
        pos = peca[:posicao] || {}
        px = resolve_formula(pos[:x], params).to_f
        py = resolve_formula(pos[:y], params).to_f
        pz = resolve_formula(pos[:z], params).to_f
        tr = Geom::Transformation.new(Geom::Point3d.new(px.mm, py.mm, pz.mm))
        piece.transform!(tr)

        # Atributos
        role = peca[:role] || 'custom'
        piece.set_attribute('Ornato', 'role', role)
        piece.set_attribute('Ornato', 'piece_name', peca[:nome] || '')
        piece.set_attribute('Ornato', 'dimensions', JSON.generate({ largura: w, altura: h, espessura: e }))
        piece.set_attribute('Ornato', 'bordas', JSON.generate(peca[:bordas] || {}))
        piece.set_attribute('Ornato', 'formulas', JSON.generate({
          largura: peca[:largura], altura: peca[:altura], espessura: peca[:espessura],
          posicao: pos
        }))

        piece
      end

      # ── Resolver fórmulas ──
      # Suporta: {largura}, {altura}, operações matemáticas simples
      def self.resolve_formula(formula, params)
        return 0 if formula.nil?
        str = formula.to_s.strip
        return str.to_f if str.match?(/\A[\d.]+\z/)

        # Substituir variáveis
        resolved = str.gsub(/\{(\w+)\}/) do |_|
          key = $1.to_sym
          (params[key] || 0).to_s
        end

        # Avaliar expressão matemática segura
        safe_eval(resolved)
      end

      # ── Eval seguro (só números e operadores matemáticos) ──
      def self.safe_eval(expr)
        # Limpar tudo que não é número, operador, parêntese ou ponto
        clean = expr.gsub(/[^0-9+\-*\/().  ]/, '')
        return 0 if clean.strip.empty?

        begin
          result = eval(clean)
          result.is_a?(Numeric) ? result : 0
        rescue
          0
        end
      end

      # ── Avaliar condição ──
      def self.evaluate_condition(condition, params)
        resolved = condition.gsub(/\{(\w+)\}/) do |_|
          key = $1.to_sym
          val = params[key]
          val.is_a?(String) ? "'#{val}'" : val.to_s
        end

        begin
          result = eval(resolved)
          !!result
        rescue
          true # Em caso de erro, criar a peça
        end
      end

      # ── Ferragens automáticas ──
      def self.apply_auto_hardware(parent, pieces, ferragens_config, juncao, params)
        return unless defined?(Ornato::Hardware::RulesEngine)

        config = Ornato::Config.load rescue {}
        config[:default_junction] = juncao if juncao

        # Mapear roles
        roles = {}
        pieces.each do |p|
          next unless p
          role = p.get_attribute('Ornato', 'role')
          roles[role] ||= []
          roles[role] << p
        end

        engine = Ornato::Hardware::RulesEngine.new(config)

        # Aplicar regras conforme config
        if ferragens_config[:minifix] || ferragens_config[:cavilha]
          # Junções lateral × base/topo
          laterais = (roles['lateral'] || [])
          bases = (roles['base'] || []) + (roles['topo'] || [])
          # Engine handles this automatically when processing the module
        end

        # Process via engine (will apply all relevant rules)
        begin
          machining = engine.process_module(parent)
          parent.set_attribute('Ornato', 'machining_data', JSON.generate(machining)) if machining
        rescue => e
          puts "BoxBuilder: Ferragens auto falhou (#{e.message}) — módulo criado sem usinagem"
        end
      end

      # ── Recalcular módulo existente ──
      # Para quando parâmetros mudam (resize, etc.)
      def self.recalculate(group)
        schema_json = group.get_attribute('Ornato', 'pecas_schema')
        return unless schema_json

        data = JSON.parse(schema_json, symbolize_names: true)
        params_json = group.get_attribute('Ornato', 'params')
        return unless params_json

        params = JSON.parse(params_json, symbolize_names: true)

        # Recalcular dimensões derivadas
        params[:interna_w] = params[:largura] - 2 * params[:espessura]
        params[:interna_h] = params[:altura] - params[:espessura] - params[:rodape]
        params[:interna_d] = params[:profundidade]

        model = Sketchup.active_model
        model.start_operation('Ornato: Recalcular módulo', true)

        begin
          # Remover peças existentes
          group.entities.grep(Sketchup::Group).each do |g|
            g.erase! if g.get_attribute('Ornato', 'role')
          end

          # Recriar
          (data[:pecas] || []).each_with_index do |peca, idx|
            if peca[:condicao] && !peca[:condicao].to_s.empty?
              next unless evaluate_condition(peca[:condicao].to_s, params)
            end
            create_piece(group, peca, params, idx)
          end

          model.commit_operation
        rescue => e
          model.abort_operation
          UI.messagebox("Erro ao recalcular: #{e.message}")
        end
      end

    end
  end
end
