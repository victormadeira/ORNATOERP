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
# INTEGRAÇÃO COM O SISTEMA DE IDENTIFICAÇÃO
#   Toda peça criada recebe o stamp do PieceStamper:
#     tipo      = "peca"          ← flag primária, equivalente ao wpsisashape
#     role      = "lateral" | ... ← função estrutural
#     material  = "MDF18_BrancoTX"
#     espessura = 18.0
#     bordas_*  = true|false
#
#   O grupo-módulo recebe:
#     tipo      = "modulo"
#     module_id = "balcao_simples"
#
# TRÊS MATERIAIS POR MÓDULO
#   material_carcaca → laterais, base, topo, divisórias, prateleiras
#   material_fundo   → traseira (back_panel); default: MDF6_Branco
#   material_frente  → portas, frentes de gaveta; default: = material_carcaca
#   Caso só `material` seja fornecido, os três herdam dele.
#
# EXPRESSÕES PARAMÉTRICAS
#   {param}         → valor do parâmetro
#   Operadores:     + - * / ( )
#   Funções:        max(a,b), min(a,b), round(x), floor(x), ceil(x)
#   Condições:      {param} == 'valor', {param} > N, {param} && {param2}
#
# DOOR CALCULATOR
#   Se os parâmetros do módulo incluírem `abertura_altura` e
#   `abertura_largura`, peças com role `door` e `drawer_front`
#   terão suas dimensões calculadas pelo DoorCalculator em vez das
#   fórmulas estáticas do JSON. As posições X e Z também são
#   corrigidas automaticamente.
#
# EXEMPLO DE USO
#   params = { largura: 600, altura: 850, material: 'MDF18_BrancoTX' }
#   grp = JsonModuleBuilder.create_from_json('balcao_simples', params)
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Library
    class JsonModuleBuilder

      # Defaults aplicados quando o módulo não declara o parâmetro
      # e o usuário também não passou.  Prioridade: user > JSON > ShopConfig > estes.
      PARAM_ALIASES = {
        'altura_rodape'       => 100,
        'n_prateleiras'       => 1,
        'tipo_porta'          => 'normal',          # antes: '2_abrir'
        'tipo_braco'          => 'reta',
        'tipo_juncao'         => 'minifix_cavilha', # antes: 'minifix'
        'com_fundo'           => true,
        'com_rodape'          => true,
        'com_tampo'           => true,
        'extensao_passante'   => 0,
        'n_portas'            => 1,
        'lado_abertura'       => 'esquerda',
      }.freeze

      # ─────────────────────────────────────────────────────────
      # @param json_def    [Hash]  JSON do módulo já parseado
      # @param user_params [Hash]  parâmetros fornecidos pelo usuário
      # ─────────────────────────────────────────────────────────
      def initialize(json_def, user_params = {})
        @def    = json_def
        @params = build_param_context(json_def['parametros'] || {}, user_params)

        begin
          shop = Hardware::ShopConfig.load
          @door_calc = DoorCalculator.new(shop)
        rescue
          @door_calc = DoorCalculator.new
        end
      end

      # ─────────────────────────────────────────────────────────
      # Constrói todas as peças dentro do grupo pai.
      # @param parent_group [Sketchup::Group]
      # @return [Array<Sketchup::Group>]
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

      # Retorna o contexto de parâmetros resolvido (para debug/UI)
      def resolved_params
        @params.dup
      end

      # Avalia uma expressão paramétrica — público para outros sistemas
      def eval_dim(expr)
        return expr.to_f unless expr.is_a?(String)
        evaluate_expr(expr)
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      # ── Monta contexto de parâmetros ─────────────────────────
      # Prioridade: user_params > JSON defaults > ShopConfig > PARAM_ALIASES
      def build_param_context(param_defs, user_params)
        ctx = {}

        # 1. Aliases mínimos
        PARAM_ALIASES.each { |k, v| ctx[k] = v }

        # 2. Variáveis globais da marcenaria (ShopConfig)
        begin
          Hardware::ShopConfig.to_expr_params.each { |k, v| ctx[k.to_s] = v }
        rescue
          # ShopConfig pode não estar disponível em tests/isolados
        end

        # 3. Defaults declarados no JSON
        param_defs.each do |key, meta|
          next unless meta.is_a?(Hash)
          default = meta['default']
          ctx[key.to_s] = default unless default.nil?
        end

        # 4. Valores do usuário — máxima prioridade
        user_params.each { |k, v| ctx[k.to_s] = v }

        # 5. Aliases derivados
        ctx['altura_rodape'] ||= 0
        if ctx['com_rodape'] && ctx['altura_rodape'].to_i == 0
          ctx['altura_rodape'] = 100
        end

        # 6. Resolver espessura via catálogo de material se não declarada
        # Isso permite que selecionar material_carcaca preencha espessura auto.
        unless ctx.key?('espessura') && ctx['espessura'].to_f > 0
          mat = ctx['material_carcaca'] || ctx['material']
          if mat.to_s != ''
            begin
              t = Catalog::MaterialCatalog.instance.thickness(mat.to_s)
              ctx['espessura'] = t if t > 0
            rescue
            end
          end
        end

        ctx
      end

      # ── Resolução de material por role ───────────────────────
      # O módulo pode ter até três materiais; cada role mapeia para um.
      def resolve_material(role)
        case role
        when :door, :drawer_front
          # Frentes usam material_frente; fallback para material geral
          mat = @params['material_frente'] || @params['material'] || ''
          mat.to_s != '' ? mat : (@params['material_carcaca'] || '')
        when :back_panel
          # Fundo geralmente é um painel mais fino (6mm)
          @params['material_fundo'] || 'MDF6_Branco'
        else
          # Carcaça: laterais, base, topo, divisórias, prateleiras, rodapé
          @params['material_carcaca'] || @params['material'] || ''
        end
      end

      # ── Construção de uma peça individual ────────────────────
      def build_piece(parent_group, peca_def)
        role          = (peca_def['role'] || 'generic').to_sym
        nome          = peca_def['nome'] || role.to_s
        material_code = resolve_material(role)

        # Dimensões: porta/frente usa DoorCalculator se abertura disponível
        largura, altura, espessura, door_result = compute_dimensions(
          peca_def, role, material_code
        )
        return nil if largura <= 0 || altura <= 0 || espessura <= 0

        # Posição: DoorCalculator corrige x/z de portas
        posicao = peca_def['posicao'] || {}
        px = door_result ? door_result[:posicao_x].to_f : evaluate_expr(posicao['x'] || '0')
        py = evaluate_expr(posicao['y'] || '0')
        pz = door_result ? door_result[:posicao_z].to_f : evaluate_expr(posicao['z'] || '0')

        # ── Criar geometria via ParametricEngine ──
        dims  = { largura: largura, altura: altura, espessura: espessura }
        piece = ParametricEngine.create_piece(
          parent_group, nome, dims, material_code, [px, py, pz], role
        )
        return nil unless piece

        # ── Bordas ──
        bordas_hash = nil
        if peca_def['bordas'].is_a?(Hash)
          bordas_hash = symbolize_borda(peca_def['bordas'])
          ParametricEngine.add_edge_banding(piece, bordas_hash)
        end

        # ── PieceStamper — identidade da peça no sistema ─────
        # Equivalente ao wpsisashape = 1 do WPS.
        # Sem este stamp a peça é INVISÍVEL ao corte, exportação e usinagem.
        PieceStamper.stamp(piece,
          role:      role,
          material:  material_code,
          espessura: espessura,
          bordas:    bordas_hash,
          obs:       peca_def['obs'] || peca_def['observacao'],
        )

        # ── Atributos extras de portas ──
        if door_result
          piece.set_attribute('Ornato', 'n_dobradicas',      door_result[:n_dobradicas])
          piece.set_attribute('Ornato', 'tipo_porta',        door_result[:tipo_porta])
          piece.set_attribute('Ornato', 'tipo_braco',        door_result[:tipo_braco])
          piece.set_attribute('Ornato', 'sobreposicao',      door_result[:sobreposicao])
          piece.set_attribute('Ornato', 'extensao_passante', door_result[:extensao_passante])
          # Posições Y das dobradiças (serializado como JSON para o MachiningInterpreter)
          hinge_pos = @door_calc.hinge_positions(altura)
          piece.set_attribute('Ornato', 'posicoes_dobradicas', JSON.generate(hinge_pos))
        end

        # ── Atributos extras de fundo ──
        if role == :back_panel
          piece.set_attribute('Ornato', 'fundo_metodo',
                              @params['fundo_metodo'] || 'rasgo')
        end

        # ── Hardware tags (dados para MachiningInterpreter) ──
        hw_config = {
          joint_type:          @params['tipo_juncao'] || 'minifix_cavilha',
          lado:                @params['lado_porta']  || 'esquerda',
          puxador_espacamento: resolve_puxador_spacing,
          corredica:           @params['corredica']   || '450mm',
          tipo:                @params['tipo_prateleira'] || 'regulavel',
          com_system32:        @params['sys32_ativo'] || false,
        }
        ParametricEngine.apply_hardware_tags(piece, role, hw_config)

        piece
      end

      # ── Cálculo de dimensões ──────────────────────────────────
      # Para role :door / :drawer_front: tenta DoorCalculator.
      # Para qualquer outro: usa a fórmula declarada no JSON.
      # Retorna [largura, altura, espessura, door_result_or_nil]
      def compute_dimensions(peca_def, role, material_code)
        if %i[door drawer_front].include?(role) && door_calc_available?
          door_result = run_door_calculator(role)
          if door_result
            esp = evaluate_expr(peca_def['espessura'])
            esp = espessura_from_material(material_code) if esp <= 0
            return [door_result[:largura], door_result[:altura], esp, door_result]
          end
        end

        # Fallback: fórmula do JSON
        largura   = evaluate_expr(peca_def['largura'])
        altura    = evaluate_expr(peca_def['altura'])
        espessura = evaluate_expr(peca_def['espessura'])
        espessura = espessura_from_material(material_code) if espessura <= 0
        [largura, altura, espessura, nil]
      end

      # Retorna true se houver abertura declarada nos parâmetros (necessário para DoorCalculator)
      def door_calc_available?
        @params.key?('abertura_altura') && @params['abertura_altura'].to_f > 0 &&
          @params.key?('abertura_largura') && @params['abertura_largura'].to_f > 0
      end

      # Executa o DoorCalculator com os parâmetros do contexto atual
      def run_door_calculator(role)
        return nil unless @door_calc

        esp_c = (@params['espessura_carcaca'] || @params['espessura'] || 18).to_f

        begin
          if role == :drawer_front
            @door_calc.calculate_drawer_front(
              abertura_altura:   @params['abertura_altura'].to_f,
              abertura_largura:  @params['abertura_largura'].to_f,
              tipo_braco:        @params['tipo_braco'] || 'reta',
              espessura_carcaca: esp_c,
              posicao_z_base:    @params['pos_z_gaveta'].to_f,
            )
          else
            @door_calc.calculate(
              abertura_altura:   @params['abertura_altura'].to_f,
              abertura_largura:  @params['abertura_largura'].to_f,
              n_portas:          (@params['n_portas'] || 1).to_i,
              tipo_porta:        @params['tipo_porta']  || 'normal',
              tipo_braco:        @params['tipo_braco']  || 'reta',
              espessura_carcaca: esp_c,
              extensao_passante: (@params['extensao_passante'] || 0).to_f,
              espessura_porta:   espessura_from_material(resolve_material(:door)),
              altura_rodape:     (@params['altura_rodape'] || 0).to_f,
              lado_abertura:     @params['lado_abertura'] || 'esquerda',
            )
          end
        rescue => e
          puts "Ornato JsonModuleBuilder: DoorCalculator erro — #{e.message}"
          nil
        end
      end

      # Espessura pelo catálogo de material; fallback para o param geral
      def espessura_from_material(material_code)
        begin
          t = Catalog::MaterialCatalog.instance.thickness(material_code.to_s)
          t > 0 ? t.to_f : @params['espessura'].to_f
        rescue
          @params['espessura'].to_f
        end
      end

      # Espaçamento do puxador: param explícito > detect na string > 128mm
      def resolve_puxador_spacing
        return @params['puxador_espacamento'].to_i if @params['puxador_espacamento'].to_i > 0
        @params['puxador'].to_s.include?('160') ? 160 : 128
      end

      # ── Avaliador de expressões paramétricas ─────────────────
      def evaluate_expr(expr)
        return expr.to_f if expr.is_a?(Numeric)
        return 0.0 unless expr.is_a?(String)

        result = expr.dup

        # Substituir {param} por valores numéricos
        @params.each do |key, value|
          numeric_val = value.is_a?(Numeric) ? value.to_s : value.to_f.to_s
          result = result.gsub("{#{key}}", numeric_val)
        end

        # Funções especiais
        result = result.gsub(/max\(([^,]+),([^)]+)\)/) {
          [evaluate_safe($1), evaluate_safe($2)].max.to_s
        }
        result = result.gsub(/min\(([^,]+),([^)]+)\)/) {
          [evaluate_safe($1), evaluate_safe($2)].min.to_s
        }
        result = result.gsub(/round\(([^)]+)\)/) { evaluate_safe($1).round.to_s }
        result = result.gsub(/floor\(([^)]+)\)/) { evaluate_safe($1).floor.to_s }
        result = result.gsub(/ceil\(([^)]+)\)/)  { evaluate_safe($1).ceil.to_s  }

        evaluate_safe(result)
      rescue => e
        puts "Ornato JsonModuleBuilder: expr error '#{expr}' → #{e.message}"
        0.0
      end

      # Avalia string aritmética pura de forma segura (whitelist de chars)
      def evaluate_safe(str)
        clean = str.to_s.strip.gsub(/[^0-9\+\-\*\/\(\)\.\s]/, '')
        return 0.0 if clean.empty?
        result = eval(clean) # safe: apenas dígitos + operadores aritméticos
        result.to_f
      rescue
        str.to_f
      end

      # ── Avaliador de condição booleana ───────────────────────
      def condition_met?(condition)
        return true if condition.nil? || condition.to_s.strip.empty?

        expr = condition.to_s.dup
        @params.each do |key, value|
          replacement = if value.is_a?(TrueClass) || value.is_a?(FalseClass)
            value.to_s
          elsif value.is_a?(Numeric)
            value.to_s
          else
            "'#{value}'"
          end
          expr = expr.gsub("{#{key}}", replacement)
        end

        result = eval(expr)
        result ? true : false
      rescue => e
        puts "Ornato JsonModuleBuilder: condition error '#{condition}' → #{e.message}"
        true  # em caso de erro, incluir a peça (fail-open)
      end

      def symbolize_borda(hash)
        hash.each_with_object({}) { |(k, v), h| h[k.to_sym] = v }
      end

      # ═══════════════════════════════════════════════════════════
      # CLASS METHODS — criação de módulos completos
      # ═══════════════════════════════════════════════════════════

      # Localiza o JSON pelo module_id buscando recursivamente na biblioteca
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

      # ─────────────────────────────────────────────────────────
      # Cria um módulo completo a partir do JSON.
      # Equivalente ao ParametricEngine.create_module, mas usando
      # o JSON como fonte de verdade de peças + ferragens.
      #
      # @param module_id      [String]  ID do módulo (nome do .json)
      # @param params         [Hash]    parâmetros do usuário
      # @param position       [Array]   [x, y, z] em mm
      # @param biblioteca_dir [String]  opcional — override da pasta
      # @return [Sketchup::Group | nil]
      # ─────────────────────────────────────────────────────────
      def self.create_from_json(module_id, params, position = [0, 0, 0], biblioteca_dir = nil)
        json_def = load_definition(module_id, biblioteca_dir)
        return nil unless json_def

        str_params = {}
        params.each { |k, v| str_params[k.to_s] = v }

        model = Sketchup.active_model
        w = str_params['largura']&.to_i
        h = str_params['altura']&.to_i
        d = str_params['profundidade']&.to_i
        nome_modulo = "#{json_def['nome'] || module_id} #{w}×#{h}×#{d}mm"

        model.start_operation("Ornato: #{json_def['nome'] || module_id}", true)

        begin
          group = model.active_entities.add_group
          group.name = nome_modulo

          tx = position[0].to_f.mm
          ty = position[1].to_f.mm
          tz = position[2].to_f.mm
          group.transform!(Geom::Transformation.new(Geom::Point3d.new(tx, ty, tz)))

          # ── Stamp do módulo (identidade do grupo no sistema) ──
          PieceStamper.stamp_module(group,
            module_id: module_id.to_s,
            params:    str_params,
            nome:      json_def['nome'],
          )

          # Atributos legados para compatibilidade com código existente
          group.set_attribute('Ornato', 'module_type', module_id.to_s)
          group.set_attribute('Ornato', 'json_driven', true)
          group.set_attribute('Ornato', 'created_at',  Time.now.iso8601)

          builder = new(json_def, str_params)
          builder.build(group)

          # Ferragens declarativas: armazenar no grupo para o MachiningInterpreter
          if json_def['ferragens_auto'].is_a?(Array)
            group.set_attribute('Ornato', 'ferragens_auto',
                                JSON.generate(json_def['ferragens_auto']))
          end
          group.set_attribute('Ornato', 'ferragens_auto_params',
                              JSON.generate(builder.resolved_params))

          model.commit_operation
          group

        rescue => e
          model.abort_operation
          puts "Ornato JsonModuleBuilder.create_from_json ERRO: #{e.message}\n" \
               "#{e.backtrace.first(5).join("\n")}"
          nil
        end
      end

      # ─────────────────────────────────────────────────────────
      # REPAINT — Troca materiais sem rebuildar geometria.
      # Atualiza atributos Ornato de cada peça e aplica o material
      # SketchUp visualmente. Muito mais rápido que rebuild completo.
      #
      # Casos de uso:
      #   · Trocar cor/acabamento da frente (portas + drawer_fronts)
      #   · Trocar material da carcaça
      #   · Trocar material do fundo (sem mudar espessura)
      #
      # @param module_group [Sketchup::Group]
      # @param new_params   [Hash]  ex: { 'material_frente' => 'MDF18_Grafite' }
      # @return [Boolean]
      # ─────────────────────────────────────────────────────────
      def self.repaint(module_group, new_params)
        return false unless PieceStamper.module?(module_group)

        old_params_json = module_group.get_attribute('Ornato', 'params') || '{}'
        old_params = JSON.parse(old_params_json) rescue {}
        merged = old_params.merge(new_params.transform_keys(&:to_s))

        model = Sketchup.active_model
        model.start_operation('Ornato: Repaint', true)

        begin
          module_group.entities.each do |ent|
            next unless PieceStamper.piece?(ent)
            attrs = PieceStamper.read(ent)
            role  = attrs[:role]&.to_sym

            mat_code = case role
            when :door, :drawer_front
              merged['material_frente'] || merged['material_carcaca'] || merged['material'] || ''
            when :back_panel
              merged['material_fundo'] || 'MDF6_Branco'
            else
              merged['material_carcaca'] || merged['material'] || ''
            end

            next if mat_code.to_s.strip.empty?

            # Atualiza atributo Ornato
            ent.set_attribute('Ornato', 'material', mat_code)

            # Aplica SketchUp material (cria se não existir no modelo)
            sk_mat = model.materials[mat_code] || begin
              m = model.materials.add(mat_code)
              begin
                tex = Catalog::MaterialCatalog.instance.texture_path(mat_code)
                m.texture = tex if tex && File.exist?(tex.to_s)
              rescue; end
              m
            end
            ent.material = sk_mat
          end

          module_group.set_attribute('Ornato', 'params', JSON.generate(merged))
          model.commit_operation
          true

        rescue => e
          model.abort_operation
          puts "Ornato JsonModuleBuilder.repaint ERRO: #{e.message}"
          false
        end
      end

      # ─────────────────────────────────────────────────────────
      # ADD_SHELVES — Acrescenta prateleiras em alturas específicas.
      # Herda material_carcaca e é estampada automaticamente.
      # Não apaga prateleiras existentes.
      #
      # @param module_group [Sketchup::Group]
      # @param positions_z  [Array<Float>]  alturas em mm (a partir da base do módulo)
      # @param options      [Hash]
      #   :folga_lateral [Float]  folga de cada lado (default 2mm)
      #   :folga_frente  [Float]  folga na frente (default 2mm)
      # @return [Array<Sketchup::Group>]  grupos criados
      # ─────────────────────────────────────────────────────────
      def self.add_shelves(module_group, positions_z, options = {})
        return [] unless PieceStamper.module?(module_group)

        params   = JSON.parse(module_group.get_attribute('Ornato', 'params') || '{}') rescue {}
        esp      = (params['espessura']     || 18).to_f
        larg     = (params['largura']       || 600).to_f
        prof     = (params['profundidade']  || 600).to_f
        esp_f    = (params['esp_fundo']     || 6).to_f
        mat      = params['material_carcaca'] || params['material'] || ''
        flg_lat  = (options[:folga_lateral] || 2).to_f
        flg_fre  = (options[:folga_frente]  || 2).to_f

        larg_shelf = larg - (2 * esp) - (2 * flg_lat)
        prof_shelf = prof - esp_f - flg_fre

        model   = Sketchup.active_model
        created = []
        model.start_operation('Ornato: Add Shelves', true)

        begin
          positions_z.each_with_index do |z_mm, i|
            shelf = module_group.entities.add_group
            # Nome incremental: evita duplicar se já houver prateleiras
            n_existing = module_group.entities.count { |e|
              PieceStamper.piece?(e) && PieceStamper.read(e)[:role].to_s == 'shelf'
            }
            shelf.name = "Prateleira #{n_existing + i + 1}"

            pts = [
              Geom::Point3d.new(0, 0, 0),
              Geom::Point3d.new(larg_shelf.mm, 0, 0),
              Geom::Point3d.new(larg_shelf.mm, prof_shelf.mm, 0),
              Geom::Point3d.new(0, prof_shelf.mm, 0),
            ]
            face = shelf.entities.add_face(pts)
            face.pushpull(-esp.mm)

            shelf.transformation = Geom::Transformation.translation(
              Geom::Point3d.new((esp + flg_lat).mm, flg_fre.mm, z_mm.mm)
            )

            PieceStamper.stamp(shelf,
              role:      :shelf,
              material:  mat,
              espessura: esp,
              bordas:    { topo: false, base: false, frente: true, tras: false }
            )
            created << shelf
          end

          model.commit_operation
          created

        rescue => e
          model.abort_operation
          puts "Ornato JsonModuleBuilder.add_shelves ERRO: #{e.message}"
          []
        end
      end

      # ─────────────────────────────────────────────────────────
      # REMOVE_SHELVES — Remove todas as prateleiras (role=shelf).
      # Mantém carcaça, portas e ferragens intactas.
      #
      # @param module_group [Sketchup::Group]
      # @return [Integer]  número de prateleiras removidas
      # ─────────────────────────────────────────────────────────
      def self.remove_shelves(module_group)
        return 0 unless PieceStamper.module?(module_group)

        shelves = module_group.entities.select do |ent|
          PieceStamper.piece?(ent) &&
            PieceStamper.read(ent)[:role].to_s == 'shelf'
        end
        return 0 if shelves.empty?

        model = Sketchup.active_model
        model.start_operation('Ornato: Remove Shelves', true)
        begin
          module_group.entities.erase_entities(shelves)
          model.commit_operation
          shelves.length
        rescue => e
          model.abort_operation
          puts "Ornato remove_shelves ERRO: #{e.message}"
          0
        end
      end

      # ─────────────────────────────────────────────────────────
      # CHANGE_FUNDO — Troca método e/ou espessura do fundo.
      # Como rasgo↔parafusado altera profundidade das laterais,
      # sempre executa rebuild completo.
      #
      # métodos:
      #   'rasgo'       → fundo entra em canal fresado nas laterais
      #   'parafusado'  → fundo parafusado na face traseira da carcaça
      #   'flutuante'   → sem fixação (apenas estético, sem usinagem)
      #
      # @param module_group [Sketchup::Group]
      # @param metodo       [String]  'rasgo' | 'parafusado' | 'flutuante'
      # @param espessura    [Float, nil]  nova espessura (6 / 15 / 18 mm)
      # @param material     [String, nil] código do material
      # @return [Boolean]
      # ─────────────────────────────────────────────────────────
      def self.change_fundo(module_group, metodo:, espessura: nil, material: nil)
        new_p = { 'fundo_metodo' => metodo.to_s }
        new_p['esp_fundo']      = espessura if espessura
        new_p['material_fundo'] = material  if material
        rebuild(module_group, new_p)
      end

      # ─────────────────────────────────────────────────────────
      # CHANGE_DOOR_TYPE — Troca tipo e/ou braço da porta.
      # Executa rebuild completo (geometria da porta muda).
      #
      # @param module_group [Sketchup::Group]
      # @param tipo_porta   [String, nil]  'normal' | 'passante_sobe' | 'basculante' | 'correr'
      # @param tipo_braco   [String, nil]  'reta' | 'curva' | 'super_curva'
      # @return [Boolean]
      # ─────────────────────────────────────────────────────────
      def self.change_door_type(module_group, tipo_porta: nil, tipo_braco: nil)
        new_p = {}
        new_p['tipo_porta'] = tipo_porta if tipo_porta
        new_p['tipo_braco'] = tipo_braco if tipo_braco
        return false if new_p.empty?
        rebuild(module_group, new_p)
      end

      # ─────────────────────────────────────────────────────────
      # CLONE — Duplica um módulo com deslocamento de posição.
      # Útil para replicar módulos em sequência (coluna de armários).
      # O clone herda todos os atributos Ornato do original.
      #
      # @param module_group [Sketchup::Group]
      # @param offset       [Array<Float>]  [dx, dy, dz] em mm
      # @return [Sketchup::Group | nil]
      # ─────────────────────────────────────────────────────────
      def self.clone(module_group, offset = [0, 0, 0])
        return nil unless PieceStamper.module?(module_group)

        model = Sketchup.active_model
        model.start_operation('Ornato: Clone Module', true)
        begin
          copy = module_group.copy
          copy.transform!(Geom::Transformation.translation(
            Geom::Point3d.new(offset[0].to_f.mm, offset[1].to_f.mm, offset[2].to_f.mm)
          ))
          copy.set_attribute('Ornato', 'created_at', Time.now.iso8601)
          model.commit_operation
          copy
        rescue => e
          model.abort_operation
          puts "Ornato clone ERRO: #{e.message}"
          nil
        end
      end

      # ─────────────────────────────────────────────────────────
      # Reconstrói um módulo existente com novos parâmetros.
      # Apaga os filhos atuais e reconstrói pelo JSON.
      # Útil para o comportamento de componente dinâmico.
      #
      # @param module_group [Sketchup::Group]  grupo existente
      # @param new_params   [Hash]             parâmetros atualizados
      # @return [Boolean]
      # ─────────────────────────────────────────────────────────
      def self.rebuild(module_group, new_params)
        return false unless PieceStamper.module?(module_group)

        attrs      = PieceStamper.read(module_group)
        module_id  = attrs['module_id']
        return false if module_id.to_s.empty?

        json_def = load_definition(module_id)
        return false unless json_def

        # Mesclar parâmetros existentes com os novos
        old_params_json = module_group.get_attribute('Ornato', 'params') || '{}'
        old_params      = JSON.parse(old_params_json) rescue {}
        merged = old_params.merge(new_params.transform_keys(&:to_s))

        model = Sketchup.active_model
        model.start_operation("Ornato: Rebuild #{module_id}", true)

        begin
          # Apagar todas as peças filhas
          to_delete = module_group.entities.to_a
          module_group.entities.erase_entities(to_delete)

          # Atualizar params no grupo
          module_group.set_attribute('Ornato', 'params', JSON.generate(merged))

          w = merged['largura']&.to_i
          h = merged['altura']&.to_i
          d = merged['profundidade']&.to_i
          module_group.name = "#{json_def['nome'] || module_id} #{w}×#{h}×#{d}mm"

          # Rebuild
          builder = new(json_def, merged)
          builder.build(module_group)

          if json_def['ferragens_auto'].is_a?(Array)
            module_group.set_attribute('Ornato', 'ferragens_auto',
                                       JSON.generate(json_def['ferragens_auto']))
          end
          module_group.set_attribute('Ornato', 'ferragens_auto_params',
                                     JSON.generate(builder.resolved_params))

          model.commit_operation
          true

        rescue => e
          model.abort_operation
          puts "Ornato JsonModuleBuilder.rebuild ERRO: #{e.message}\n" \
               "#{e.backtrace.first(5).join("\n")}"
          false
        end
      end

    end
  end
end
