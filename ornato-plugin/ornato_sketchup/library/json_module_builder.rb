# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# JsonModuleBuilder — Motor paramétrico orientado a JSON
#
# Interpreta a definição JSON de um módulo da biblioteca Ornato
# (ornato-plugin/biblioteca/moveis/**/*.json) e cria a geometria
# SketchUp correspondente, incluindo peças, materiais e atributos
# de ferragem — tudo sem escrever Ruby por módulo.
#
# Isso significa que adicionar um novo tipo de módulo é só criar
# um novo .json na pasta de biblioteca, sem alterar código Ruby.
#
# EXPRESSÕES PARAMÉTRICAS
# Os campos de dimensão/posição suportam expressões com:
#   {param}          → valor do parâmetro (ex: {largura} → 600)
#   {altura_rodape}  → alias automático se com_rodape = true
#   Operadores: + - * / ( )
#   Funções: max(a,b), min(a,b), round(x), floor(x)
#   Condições: {param} == 'valor', {param} > N, etc.
#
# EXEMPLO DE USO
#   def_path = '.../biblioteca/moveis/cozinha/balcao_simples.json'
#   params = { largura: 600, altura: 850, material: 'MDF18_BrancoTX' }
#   builder = JsonModuleBuilder.new(JSON.parse(File.read(def_path)), params)
#   builder.build(parent_group)   # → cria peças dentro do grupo
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Library
    class JsonModuleBuilder

      # Subs de alias automáticos para compatibilidade de campo
      PARAM_ALIASES = {
        'altura_rodape' => 100,
        'n_prateleiras' => 1,
        'tipo_porta'    => '2_abrir',
        'tipo_juncao'   => 'minifix',
        'com_fundo'     => true,
        'com_rodape'    => true,
        'com_tampo'     => true,
      }.freeze

      # ─────────────────────────────────────────────────────────
      # @param json_def [Hash]  parsed JSON definition
      # @param user_params [Hash]  user-supplied params (symbol or string keys)
      # ─────────────────────────────────────────────────────────
      def initialize(json_def, user_params = {})
        @def = json_def
        @params = build_param_context(json_def['parametros'] || {}, user_params)
      end

      # ─────────────────────────────────────────────────────────
      # Constrói todas as peças dentro do grupo pai.
      # @param parent_group [Sketchup::Group]
      # @return [Array<Sketchup::Group>] peças criadas
      # ─────────────────────────────────────────────────────────
      def build(parent_group)
        pieces = []
        (@def['pecas'] || []).each do |peca_def|
          next unless condition_met?(peca_def['condicao'])
          piece = build_piece(parent_group, peca_def)
          pieces << piece if piece
        end
        pieces
      end

      # ─────────────────────────────────────────────────────────
      # Retorna o contexto de parâmetros resolvido (para debug/UI)
      # ─────────────────────────────────────────────────────────
      def resolved_params
        @params.dup
      end

      # ─────────────────────────────────────────────────────────
      # Avalia uma expressão paramétrica e retorna Float.
      # Público para que outros sistemas possam usá-lo.
      # ─────────────────────────────────────────────────────────
      def eval_dim(expr)
        return expr.to_f unless expr.is_a?(String)
        evaluate_expr(expr)
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      # ── Monta contexto de parâmetros completo ─────────────────
      # Prioridade: user_params > JSON defaults > PARAM_ALIASES

      def build_param_context(param_defs, user_params)
        ctx = {}

        # 1. Alias padrões (base)
        PARAM_ALIASES.each { |k, v| ctx[k] = v }

        # 2. Defaults do JSON
        param_defs.each do |key, meta|
          next unless meta.is_a?(Hash)
          default = meta['default']
          ctx[key.to_s] = default unless default.nil?
        end

        # 3. Valores do usuário (máxima prioridade)
        user_params.each do |key, value|
          ctx[key.to_s] = value
        end

        # 4. Resolver aliases derivados
        if ctx['com_rodape'] && !ctx.key?('altura_rodape')
          ctx['altura_rodape'] = 100
        end
        ctx['altura_rodape'] ||= 0

        ctx
      end

      # ── Construção de uma peça individual ────────────────────

      def build_piece(parent_group, peca_def)
        largura    = evaluate_expr(peca_def['largura'])
        altura     = evaluate_expr(peca_def['altura'])
        espessura  = evaluate_expr(peca_def['espessura'])

        return nil if largura <= 0 || altura <= 0 || espessura <= 0

        posicao = peca_def['posicao'] || {}
        px = evaluate_expr(posicao['x'] || '0')
        py = evaluate_expr(posicao['y'] || '0')
        pz = evaluate_expr(posicao['z'] || '0')

        role = (peca_def['role'] || 'generic').to_sym
        nome = peca_def['nome'] || role.to_s
        material_code = @params['material'] || ''

        # Criar a peça via ParametricEngine.create_piece
        dims = { largura: largura, altura: altura, espessura: espessura }
        piece = ParametricEngine.create_piece(parent_group, nome, dims, material_code, [px, py, pz], role)

        return nil unless piece

        # Bordas
        if peca_def['bordas'].is_a?(Hash)
          ParametricEngine.add_edge_banding(piece, symbolize_borda(peca_def['bordas']))
        end

        # Tags de ferragem (role → apply_hardware_tags)
        config = {
          joint_type: @params['tipo_juncao'] || 'minifix',
          lado: @params['lado_porta'] || 'esquerda',
          puxador_espacamento: (@params['puxador'] || '').include?('160') ? 160 : 128,
          corredica: @params['corredica'] || '450mm',
          tipo: @params['tipo_prateleira'] || 'regulavel',
          com_system32: @params['n_prateleiras'].to_i > 0,
        }
        ParametricEngine.apply_hardware_tags(piece, role, config)

        piece
      end

      # ── Avaliador de expressões paramétricas ─────────────────
      # Substitui {param} por valores e avalia a expressão.
      # Suporta: aritmética, max(), min(), round(), floor(), ceil()

      def evaluate_expr(expr)
        return expr.to_f if expr.is_a?(Numeric)
        return 0.0 unless expr.is_a?(String)

        # Substituir {param} por valores numéricos
        result = expr.dup
        @params.each do |key, value|
          numeric_val = value.is_a?(Numeric) ? value.to_s : value.to_f.to_s
          result = result.gsub("{#{key}}", numeric_val)
        end

        # Substituir funções especiais
        result = result.gsub(/max\(([^,]+),([^)]+)\)/) {
          [evaluate_safe($1), evaluate_safe($2)].max.to_s
        }
        result = result.gsub(/min\(([^,]+),([^)]+)\)/) {
          [evaluate_safe($1), evaluate_safe($2)].min.to_s
        }
        result = result.gsub(/round\(([^)]+)\)/) {
          evaluate_safe($1).round.to_s
        }
        result = result.gsub(/floor\(([^)]+)\)/) {
          evaluate_safe($1).floor.to_s
        }
        result = result.gsub(/ceil\(([^)]+)\)/) {
          evaluate_safe($1).ceil.to_s
        }

        # Avaliar expressão aritmética pura
        evaluate_safe(result)
      rescue => e
        puts "Ornato JsonModuleBuilder: expr error '#{expr}' → #{e.message}"
        0.0
      end

      # Avalia string aritmética de forma segura (sem eval completo)
      def evaluate_safe(str)
        clean = str.to_s.strip.gsub(/[^0-9\+\-\*\/\(\)\.\s]/, '')
        return 0.0 if clean.empty?
        result = eval(clean) # safe: only digits + arithmetic operators
        result.to_f
      rescue
        str.to_f
      end

      # ── Avaliador de condição booleana ───────────────────────
      # Suporta: {param} == 'value', {param} > N, {param} != 'x',
      # {param} && {param2}, etc.

      def condition_met?(condition)
        return true if condition.nil? || condition.to_s.strip.empty?

        expr = condition.to_s.dup

        # Substituir {param} com valores literais para comparação
        @params.each do |key, value|
          if value.is_a?(TrueClass) || value.is_a?(FalseClass)
            expr = expr.gsub("{#{key}}", value.to_s)
          elsif value.is_a?(Numeric)
            expr = expr.gsub("{#{key}}", value.to_s)
          else
            expr = expr.gsub("{#{key}}", "'#{value}'")
          end
        end

        # Converter operadores para Ruby
        expr = expr.gsub(' == ', ' == ')
                   .gsub(' != ', ' != ')
                   .gsub(' && ', ' && ')
                   .gsub(' || ', ' || ')
                   .gsub(/\btrue\b/, 'true')
                   .gsub(/\bfalse\b/, 'false')

        result = eval(expr)
        result ? true : false
      rescue => e
        puts "Ornato JsonModuleBuilder: condition error '#{condition}' → #{e.message}"
        true # em caso de erro, incluir a peça
      end

      def symbolize_borda(hash)
        result = {}
        hash.each { |k, v| result[k.to_sym] = v }
        result
      end

      # ═══════════════════════════════════════════════════════
      # CLASS METHODS — Integração com ParametricEngine
      # ═══════════════════════════════════════════════════════

      def self.load_definition(module_id, biblioteca_dir = nil)
        dir = biblioteca_dir || default_biblioteca_dir
        return nil unless dir && File.directory?(dir)

        Dir.glob(File.join(dir, '**', "#{module_id}.json")).first&.then do |path|
          begin
            JSON.parse(File.read(path))
          rescue => e
            puts "Ornato JsonModuleBuilder: erro ao carregar #{path}: #{e.message}"
            nil
          end
        end
      end

      def self.default_biblioteca_dir
        File.join(Ornato::PLUGIN_DIR, 'biblioteca', 'moveis')
      rescue
        nil
      end

      # Cria um módulo completo a partir do JSON (equivalente a ParametricEngine.create_module)
      # mas usando o JSON como fonte de verdade das peças
      def self.create_from_json(module_id, params, position = [0, 0, 0], biblioteca_dir = nil)
        json_def = load_definition(module_id, biblioteca_dir)
        return nil unless json_def

        sym_params = {}
        params.each { |k, v| sym_params[k.to_s] = v }

        model = Sketchup.active_model
        nome_modulo = "#{json_def['nome'] || module_id} #{sym_params['largura']&.to_i}×#{sym_params['altura']&.to_i}×#{sym_params['profundidade']&.to_i}mm"

        model.start_operation("Ornato: #{json_def['nome'] || module_id}", true)

        begin
          group = model.active_entities.add_group
          group.name = nome_modulo

          tx = position[0].to_f.mm
          ty = position[1].to_f.mm
          tz = position[2].to_f.mm
          group.transform!(Geom::Transformation.new(Geom::Point3d.new(tx, ty, tz)))

          group.set_attribute('Ornato', 'module_type',  module_id.to_s)
          group.set_attribute('Ornato', 'module_id',    module_id.to_s)
          group.set_attribute('Ornato', 'params',       JSON.generate(sym_params))
          group.set_attribute('Ornato', 'json_driven',  true)
          group.set_attribute('Ornato', 'created_at',   Time.now.iso8601)

          builder = new(json_def, sym_params)
          builder.build(group)

          model.commit_operation
          group

        rescue => e
          model.abort_operation
          puts "Ornato JsonModuleBuilder.create_from_json ERRO: #{e.message}\n#{e.backtrace.first(4).join("\n")}"
          nil
        end
      end
    end
  end
end
