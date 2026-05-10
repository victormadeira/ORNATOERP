# frozen_string_literal: true
require 'fileutils'
require_relative '../core/logger'
require_relative 'piece_stamper'
require_relative 'door_calculator'
require_relative 'expression_evaluator'
require_relative 'aggregate_persistor'
begin
  require_relative '../geometry/bay_detector'
rescue LoadError
  # geometry/bay_detector pode não estar disponível em testes isolados;
  # reflow detecta ausência e degrada para no-op.
end

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
      def initialize(json_def, user_params = {}, shop_snapshot: nil)
        @def            = json_def
        @shop_snapshot  = shop_snapshot
        @params         = build_param_context(json_def['parametros'] || {}, user_params)

        begin
          shop = Hardware::ShopConfig.load
          @door_calc = DoorCalculator.new(shop)
        rescue
          @door_calc = DoorCalculator.new
        end
      end

      # Reconstrói um builder a partir de um group existente — usa o
      # snapshot estampado nele (se presente) para garantir que o módulo
      # seja re-editado com a mesma config global em vigor no momento
      # da inserção. Útil para EditTool / "reaplicar parâmetros".
      def self.from_group(json_def, group, user_params = {})
        snapshot = read_shop_snapshot(group)
        new(json_def, user_params, shop_snapshot: snapshot)
      end

      # Lê snapshot serializado em JSON do atributo Ornato.shop_snapshot
      # @return [Hash, nil]
      def self.read_shop_snapshot(group)
        return nil unless group && group.respond_to?(:get_attribute)
        raw = group.get_attribute('Ornato', 'shop_snapshot', nil)
        return nil if raw.nil? || raw.to_s.empty?
        JSON.parse(raw)
      rescue StandardError
        nil
      end

      # Apaga o snapshot atual do group e o substitui pela ShopConfig
      # vigente. Usado pelo botão "Atualizar para padrão atual" da UI.
      # Não rebuilda a geometria — caller deve chamar EditTool/rebuild.
      # @return [Hash] novo snapshot aplicado
      def self.refresh_shop_snapshot(group)
        return nil unless group && group.respond_to?(:set_attribute)
        snap = Hardware::ShopConfig.to_expr_params
        group.set_attribute('Ornato', 'shop_snapshot', JSON.generate(snap))
        group.set_attribute('Ornato', 'shop_profile', Hardware::ShopConfig.cloud_profile || 'local')
        group.set_attribute('Ornato', 'shop_version', (Hardware::ShopConfig.cloud_version || '0').to_s)
        snap
      rescue StandardError => e
        Ornato::Logger.warn("JsonModuleBuilder.refresh_shop_snapshot: #{e.message}") rescue nil
        nil
      end

      # ─────────────────────────────────────────────────────────
      # Constrói todas as peças dentro do grupo pai.
      # @param parent_group [Sketchup::Group]
      # @return [Array<Sketchup::Group>]
      # ─────────────────────────────────────────────────────────
      def build(parent_group)
        stamp_shop_snapshot(parent_group)
        pieces = []
        (@def['pecas'] || []).each do |peca_def|
          expand_piece_def(peca_def).each do |expanded_def|
            next unless condition_met?(expanded_def['condicao'])
            piece = build_piece(parent_group, expanded_def)
            pieces << piece if piece
          end
        end
        process_ferragens_3d(parent_group)
        pieces
      end

      # Estampa o snapshot da ShopConfig no grupo-módulo. Se o grupo já
      # tem snapshot (re-build durante edit), preserva o existente.
      def stamp_shop_snapshot(parent_group)
        return unless parent_group && parent_group.respond_to?(:set_attribute)
        existing = parent_group.get_attribute('Ornato', 'shop_snapshot', nil)
        return if existing && !existing.to_s.empty?

        snapshot = @shop_snapshot || Hardware::ShopConfig.to_expr_params
        parent_group.set_attribute('Ornato', 'shop_snapshot', JSON.generate(snapshot))
        parent_group.set_attribute('Ornato', 'shop_profile', Hardware::ShopConfig.cloud_profile || 'local')
        parent_group.set_attribute('Ornato', 'shop_version', (Hardware::ShopConfig.cloud_version || '0').to_s)
      rescue StandardError => e
        Ornato::Logger.warn("JsonModuleBuilder.stamp_shop_snapshot: #{e.message}") rescue nil
      end

      # Retorna o contexto de parâmetros resolvido (para debug/UI)
      def resolved_params
        @params.dup
      end

      # Injeta um bucket de parâmetros do vão (bay) acessíveis via {bay.xxx}
      # nas expressões. Usado pelo build_aggregate.
      # @param bay_params [Hash<String, Numeric>]
      def set_bay_context(bay_params)
        @params['_bay'] = bay_params.each_with_object({}) { |(k, v), h| h[k.to_s] = v }
        @expression_evaluator = nil # invalida cache
        self
      end

      # Avalia uma expressão paramétrica — público para outros sistemas
      def eval_dim(expr)
        return expr.to_f unless expr.is_a?(String)
        evaluate_expr(expr)
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      # ═══════════════════════════════════════════════════════════
      # FERRAGENS 3D — instancia .skp da biblioteca WPS importada
      #
      # Para cada entry de ferragens_auto com `componente_3d`, carrega
      # o .skp via Sketchup::ComponentDefinition (preservando TODA a
      # geometria interna — incluindo furações pré-existentes que o
      # ERP usa pra gerar G-code CNC) e instancia adjacente à âncora.
      #
      # Furações dentro do .skp NÃO são duplicadas nem regeneradas —
      # são preservadas como geometria do componente. O exportador UPM
      # JSON detecta via `Ornato.preserve_drillings == true` e extrai
      # essa geometria como operações CNC pra cada peça-chapa adjacente.
      #
      # Entradas ferragens_auto SEM `componente_3d` são puladas
      # (legacy: continuam sendo só serializadas em Ornato.ferragens_auto
      # pra interpretação no MachiningInterpreter).
      # ═══════════════════════════════════════════════════════════
      def process_ferragens_3d(parent_group)
        list = @def['ferragens_auto']
        return unless list.is_a?(Array)
        list.each do |entry|
          next unless entry.is_a?(Hash) && entry['componente_3d']
          next unless condition_met?(entry['condicao'])
          process_componente_3d(entry, parent_group)
        end
      rescue => e
        Ornato::Logger.error("JsonModuleBuilder: ferragens 3D ERRO", context: { error: e.message })
      end

      def process_componente_3d(entry, parent_group)
        rel_path = entry['componente_3d'].to_s
        abs_path = resolve_componente_path(rel_path)
        unless abs_path && File.exist?(abs_path)
          Ornato::Logger.warn("JsonModuleBuilder: ferragem nao encontrada", context: { rel_path: rel_path })
          return
        end

        anchor_role  = (entry['anchor_role'] || entry['peca']).to_s
        anchor_pieces = resolve_anchor_geometry(parent_group, anchor_role)
        return if anchor_pieces.empty?

        qtd          = evaluate_expr(entry['qtd'] || 1).to_i
        qtd          = 1 if qtd < 1
        offset_top   = evaluate_expr(entry['offset_top']      || 100).to_f
        offset_bot   = evaluate_expr(entry['offset_bottom']   || 100).to_f
        spacing_max  = evaluate_expr(entry['spacing_max']     || 600).to_f
        depth_face   = evaluate_expr(entry['depth_from_face'] || 0).to_f

        definition = instance_3d_component_definition(abs_path)
        return unless definition

        # Bug 3 fix: se a entry exige pareamento porta-lateral, filtra laterais
        # que tenham porta na mesma metade Y do módulo. Sem pareamento explícito,
        # mantém comportamento atual mas loga warning quando há ambiguidade.
        if entry['secondary_role'].to_s == 'door'
          paired = filter_anchors_paired_with_door(parent_group, anchor_pieces)
          anchor_pieces = paired unless paired.empty?
        elsif anchor_pieces.size > 1 && anchor_role.to_s == 'lateral'
          Ornato::Logger.warn("JsonModuleBuilder: ferragem multi-anchor sem secondary_role door (pode duplicar)",
                              context: { regra: entry['regra'], anchors: anchor_pieces.size })
        end

        parent_bb = parent_group.bounds
        anchor_pieces.each do |anchor|
          bb = anchor.bounds
          # bb usa coords locais; altura útil = bb.max.z - bb.min.z (eixo Z)
          anchor_height_mm = (bb.max.z - bb.min.z).to_f.to_l.to_mm
          # Bug 1 fix: detecta lateral esq/dir pela posição do centro X em relação ao parent.
          # role canônico é :lateral (RoleNormalizer colapsa esq/dir) — info é recuperada via geometria.
          # TODO: futuro refactor — carimbar `role_raw` no PieceStamper pra evitar inferência geométrica.
          anchor_side = detect_anchor_side(bb, parent_bb)
          z_positions = calculate_distribution(
            anchor_height_mm, qtd, offset_top, offset_bot, spacing_max
          )
          z_positions.each do |z_mm|
            tx = build_anchor_transform(anchor, z_mm, depth_face, anchor_side)
            instance_3d_component(parent_group, definition, tx,
              regra: entry['regra'], rel_path: rel_path, anchor: anchor_role)
          end
        end
      end

      # Detecta se a peça âncora é lateral esquerda ou direita comparando
      # o centro X do bbox da peça com o centro X do parent.
      # Retorna :left, :right ou :center (peça única / não-lateral).
      def detect_anchor_side(piece_bb, parent_bb)
        piece_cx  = (piece_bb.min.x + piece_bb.max.x) / 2.0
        parent_cx = (parent_bb.min.x + parent_bb.max.x) / 2.0
        delta = piece_cx - parent_cx
        # Tolerância: 5% da largura do parent — abaixo disso considera centralizada
        tol = (parent_bb.max.x - parent_bb.min.x).abs * 0.05
        return :center if delta.abs < tol
        delta < 0 ? :left : :right
      end

      # Bug 3 helper: filtra laterais que têm porta na mesma metade Y do módulo.
      # Heurística: uma lateral está "pareada" com porta se houver entidade
      # role=door cujo centro Y esteja dentro do range Y da lateral (tolerância).
      def filter_anchors_paired_with_door(parent_group, anchors)
        doors = parent_group.entities.select do |ent|
          PieceStamper.piece?(ent) &&
            ent.get_attribute('Ornato', 'role').to_s == 'door'
        end
        return anchors if doors.empty?
        anchors.select do |a|
          abb = a.bounds
          doors.any? do |d|
            dbb = d.bounds
            d_cx = (dbb.min.x + dbb.max.x) / 2.0
            # Porta confronta lateral se centro X da porta cai no range X estendido da lateral
            # OU se as faces internas se tocam (lateral esq = max.x da lateral ≈ min.x da porta)
            ((d_cx - abb.min.x).abs < 50.mm) || ((d_cx - abb.max.x).abs < 50.mm) ||
              (d_cx >= abb.min.x && d_cx <= abb.max.x)
          end
        end
      end

      # Carrega/recupera ComponentDefinition do .skp.
      # Cache via definitions.find evita reload duplicado em rebuilds.
      def instance_3d_component_definition(abs_path)
        defs = Sketchup.active_model.definitions
        existing = defs.find { |d| d.path.to_s == abs_path }
        existing || defs.load(abs_path)
      rescue => e
        Ornato::Logger.error("JsonModuleBuilder: load skp falhou", context: { abs_path: abs_path, error: e.message })
        nil
      end

      # Insere instância e carimba como ferragem com flag de preservação
      # de furações (lida pelo exportador UPM/MachiningInterpreter).
      def instance_3d_component(parent_group, definition, transformation,
                                regra:, rel_path:, anchor:)
        inst = parent_group.entities.add_instance(definition, transformation)
        inst.set_attribute('Ornato', 'tipo',                'ferragem')
        inst.set_attribute('Ornato', 'regra',               regra.to_s)
        inst.set_attribute('Ornato', 'componente_3d',       rel_path)
        inst.set_attribute('Ornato', 'anchor_role',         anchor.to_s)
        # CRÍTICO: avisa o exportador UPM que este componente carrega
        # furações pré-existentes (vindas do .skp WPS) que devem virar
        # operações CNC para a peça-chapa adjacente.
        inst.set_attribute('Ornato', 'preserve_drillings',  true)
        inst.set_attribute('Ornato', 'drilling_source',     'wps_skp')
        inst
      end

      # Devolve as peças (Groups carimbados) cujo role bate com anchor_role.
      def resolve_anchor_geometry(parent_group, anchor_role)
        parent_group.entities.select do |ent|
          PieceStamper.piece?(ent) &&
            ent.get_attribute('Ornato', 'role').to_s == anchor_role.to_s
        end
      end

      # Distribui qtd posições Z ao longo de anchor_height (mm), respeitando
      # offsets e spacing_max. Retorna array de Z em mm, do menor ao maior.
      def calculate_distribution(anchor_height, qtd, offset_top, offset_bottom, spacing_max)
        usable = anchor_height - offset_top - offset_bottom
        return [] if usable <= 0 || qtd < 1
        return [offset_bottom + usable / 2.0] if qtd == 1
        step = usable / (qtd - 1).to_f
        step = [step, spacing_max].min if spacing_max > 0
        (0...qtd).map { |i| offset_bottom + i * step }
      end

      # Resolve path do componente_3d (cloud-first com fallback local).
      #
      # ESTRATÉGIA DE RESOLUÇÃO (em ordem):
      #   1. Cloud (LibrarySync) — se cloud_enabled? e LibrarySync disponível.
      #      Faz download sob demanda + cache local. Retorna path local.
      #   2. biblioteca/modelos_ornato/ — biblioteca limpa (preferencial).
      #   3. biblioteca/modelos/ — biblioteca legacy (compat).
      #   4. nil + warn — não encontrado em nenhum lugar.
      #
      # SEGURANÇA (fix path traversal — Sprint Sec):
      #   • Rejeita inputs com '..' ou caminhos absolutos.
      #   • Rejeita extensões diferentes de '.skp' (case-insensitive).
      #   • Whitelist: caminho final precisa estar DENTRO da raiz
      #     correspondente (defesa em profundidade contra symlinks).
      #   • Em violação: warning + retorna nil (fail-safe).
      def resolve_componente_path(rel)
        return nil if rel.nil?
        rel_str = rel.to_s.strip
        return nil if rel_str.empty?

        # ── Validações de segurança (preservadas) ─────────────────
        if rel_str.include?('..') || rel_str.start_with?('/') || rel_str.match?(/\A[A-Za-z]:[\\\/]/)
          Ornato::Logger.warn("JsonModuleBuilder: componente_3d rejeitado (path traversal)", context: { rel: rel_str })
          return nil
        end

        unless rel_str.downcase.end_with?('.skp')
          Ornato::Logger.warn("JsonModuleBuilder: componente_3d rejeitado (extensao nao .skp)", context: { rel: rel_str })
          return nil
        end

        # ── 1. Cloud (LibrarySync) ────────────────────────────────
        if cloud_enabled? && defined?(Ornato::Library::LibrarySync)
          begin
            cloud_path = Ornato::Library::LibrarySync.instance.fetch_asset(rel_str)
            if cloud_path && File.exist?(cloud_path.to_s)
              Ornato::Logger.debug("library: cloud hit for #{rel_str}")
              return cloud_path.to_s
            end
          rescue => e
            Ornato::Logger.warn("library: cloud fetch falhou — fallback local", context: { rel: rel_str, err: e.message })
          end
        end

        # ── 2. biblioteca/modelos_ornato/ (clean) ─────────────────
        root_clean = File.expand_path('../../../biblioteca/modelos_ornato', __FILE__)
        path_clean = File.expand_path(File.join(root_clean, rel_str))
        if (path_clean.start_with?(root_clean + File::SEPARATOR) || path_clean == root_clean) && File.exist?(path_clean)
          Ornato::Logger.debug("library: local clean hit for #{rel_str}")
          return path_clean
        end

        # ── 3. biblioteca/modelos/ (legacy) ───────────────────────
        root_legacy = File.expand_path('../../../biblioteca/modelos', __FILE__)
        path_legacy = File.expand_path(File.join(root_legacy, rel_str))
        if (path_legacy.start_with?(root_legacy + File::SEPARATOR) || path_legacy == root_legacy) && File.exist?(path_legacy)
          Ornato::Logger.debug("library: local legacy hit for #{rel_str}")
          return path_legacy
        end

        # ── 4. Não encontrado ─────────────────────────────────────
        Ornato::Logger.warn("library: componente_3d nao encontrado (cloud+local)", context: { rel: rel_str })
        nil
      end

      # Cloud library opt-in (default false em v1).
      # Ativado via Sketchup.write_default('Ornato', 'cloud_library_enabled', true)
      # ou pelo callback `set_cloud_library` na UI.
      def cloud_enabled?
        return false unless defined?(Sketchup) && Sketchup.respond_to?(:read_default)
        !!Sketchup.read_default('Ornato', 'cloud_library_enabled', false)
      end
      private :cloud_enabled?

      # Constrói Transformation: origem na FACE INTERNA da lateral, Z no ponto
      # distribuído, offset perpendicular pelo depth_from_face (mm).
      #
      # Bug 1+2 fix:
      # - Lateral esquerda: face interna = bb.max.x (X maior, voltado pro centro)
      # - Lateral direita:  face interna = bb.min.x (X menor, voltado pro centro)
      # - Lateral direita recebe espelhamento X (-1) pra copela apontar pro lado
      #   correto da porta (mesma orientação visual da esquerda, espelhada).
      def build_anchor_transform(anchor, z_mm, depth_face_mm, anchor_side = :left)
        bb = anchor.bounds
        x_origin = case anchor_side
                   when :right then bb.min.x   # face interna da lateral direita
                   when :left  then bb.max.x   # face interna da lateral esquerda
                   else             bb.min.x   # fallback (peça centralizada/não-lateral)
                   end
        origin = Geom::Point3d.new(
          x_origin,
          bb.min.y + depth_face_mm.mm,
          bb.min.z + z_mm.mm
        )
        translate = Geom::Transformation.new(origin)
        if anchor_side == :right
          # Espelha em X mantendo origem fixa: T * S(-1,1,1)
          mirror = Geom::Transformation.scaling(origin, -1, 1, 1)
          translate * mirror
        else
          translate
        end
      end

      # ── Monta contexto de parâmetros ─────────────────────────
      # Prioridade: user_params > JSON defaults > ShopConfig > PARAM_ALIASES
      def build_param_context(param_defs, user_params)
        ctx = {}

        # 1. Aliases mínimos
        PARAM_ALIASES.each { |k, v| ctx[k] = v }

        # 2. Variáveis globais da marcenaria (ShopConfig)
        # Prioridade: snapshot do grupo (se existir) > ShopConfig vigente.
        # Injeta tanto plano (compat reversa: {folga_porta_lateral}) quanto
        # via subcontexto _shop (namespace: {shop.folga_porta_lateral}).
        shop_params = {}
        begin
          shop_params =
            if @shop_snapshot.is_a?(Hash) && !@shop_snapshot.empty?
              @shop_snapshot
            else
              Hardware::ShopConfig.to_expr_params || {}
            end
          shop_params.each { |k, v| ctx[k.to_s] = v }
        rescue => e
          # ShopConfig pode não estar disponível em tests/isolados
          if defined?(Ornato::Logger)
            Ornato::Logger.warn("ShopConfig nao disponivel: #{e.message}")
          end
        end
        ctx['_shop'] = shop_params.each_with_object({}) { |(k, v), h| h[k.to_s] = v }

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

      # ── Repetição paramétrica de peças ────────────────────────
      # Permite que um JSON declare uma peça-modelo e o builder gere
      # N instâncias, mantendo cada grupo estampado como peça individual.
      def expand_piece_def(peca_def)
        repeat = peca_def['repeat'] || peca_def['repetir']
        return [peca_def] unless repeat.is_a?(Hash)

        count = evaluate_expr(repeat['count'] || repeat['quantidade'] || 0).floor
        return [] if count <= 0

        axis = (repeat['axis'] || repeat['eixo'] || 'x').to_s
        axis = 'x' unless %w[x y z].include?(axis)
        offset_expr = repeat['offset'] || repeat['passo'] || 0

        (0...count).map do |idx|
          copy = deep_dup(peca_def)
          copy.delete('repeat')
          copy.delete('repetir')

          human_index = idx + 1
          copy['nome'] = copy['nome'].to_s
                              .gsub('{i}', human_index.to_s)
                              .gsub('{index}', human_index.to_s)
                              .gsub('{n}', count.to_s)
          copy['repeat_index'] = human_index
          copy['repeat_total'] = count

          pos_key = copy.key?('posicao_relativa_bay') ? 'posicao_relativa_bay' : 'posicao'
          pos = copy[pos_key] || {}
          base_expr = pos[axis] || '0'
          pos[axis] = "(#{base_expr}) + #{idx} * (#{offset_expr})"
          copy[pos_key] = pos
          copy
        end
      end

      def deep_dup(obj)
        JSON.parse(JSON.generate(obj))
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

      def resolve_piece_material(peca_def, role)
        param_key = peca_def['material_param'] || peca_def['material_key']
        if param_key
          mat = @params[param_key.to_s]
          return mat if mat.to_s != ''
        end

        explicit = peca_def['material']
        return explicit if explicit.is_a?(String) && explicit.strip != '' && !explicit.include?('{')

        resolve_material(role)
      end

      # ── Construção de uma peça individual ────────────────────
      def build_piece(parent_group, peca_def)
        role          = (peca_def['role'] || 'generic').to_sym
        nome          = peca_def['nome'] || role.to_s
        material_code = resolve_piece_material(peca_def, role)

        # Dimensões: porta/frente usa DoorCalculator se abertura disponível
        largura, altura, espessura, door_result = compute_dimensions(
          peca_def, role, material_code
        )
        return nil if largura <= 0 || altura <= 0 || espessura <= 0

        # Posição: DoorCalculator corrige x/z de portas. Agregados usam
        # `posicao_relativa_bay` (coords relativas ao bbox do vão detectado).
        posicao = peca_def['posicao_relativa_bay'] || peca_def['posicao'] || {}
        px = door_result ? door_result[:posicao_x].to_f : evaluate_expr(posicao['x'] || '0')
        py = evaluate_expr(posicao['y'] || '0')
        pz = door_result ? door_result[:posicao_z].to_f : evaluate_expr(posicao['z'] || '0')

        # ── Criar geometria via ParametricEngine ──
        # O JSON guarda as dimensões técnicas da peça (largura, altura/profundidade,
        # espessura real). Para peças horizontais/laterais, a orientação no SketchUp
        # precisa trocar eixos sem corromper o atributo técnico de espessura.
        dims  = geometry_dims_for(peca_def['orientacao'], largura, altura, espessura)
        piece = ParametricEngine.create_piece(
          parent_group, nome, dims, material_code, [px, py, pz], role
        )
        return nil unless piece

        piece.set_attribute('Ornato', 'dimensions', JSON.generate({
          largura: largura,
          altura: altura,
          espessura: espessura,
        }))

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

        if peca_def['repeat_index']
          piece.set_attribute('Ornato', 'repeat_index', peca_def['repeat_index'])
          piece.set_attribute('Ornato', 'repeat_total', peca_def['repeat_total'])
        end

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

      def geometry_dims_for(orientation, largura, altura, espessura)
        case orientation.to_s
        when 'lateral'
          { largura: espessura, altura: largura, espessura: altura }
        when 'horizontal'
          { largura: largura, altura: espessura, espessura: altura }
        else
          { largura: largura, altura: altura, espessura: espessura }
        end
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
          Ornato::Logger.error("JsonModuleBuilder: DoorCalculator erro", context: { error: e.message })
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
      #
      # SEGURANÇA: usa Ornato::Library::ExpressionEvaluator (parser
      # recursivo descendente) em vez de Kernel#eval. Não há mais
      # nenhuma forma de execução dinâmica de código a partir de JSON.
      def evaluate_expr(expr)
        expression_evaluator.eval(expr)
      end

      # Wrapper retro-compatível. Antes chamava Kernel#eval; agora
      # delega ao parser seguro. Mantido apenas para callers internos.
      def evaluate_safe(str)
        expression_evaluator.eval(str)
      end

      # ── Avaliador de condição booleana ───────────────────────
      def condition_met?(condition)
        expression_evaluator.eval_bool(condition)
      end

      # Lazy: evita re-criar o evaluator a cada expressão; @params
      # é estável após build_param_context.
      def expression_evaluator
        @expression_evaluator ||= ExpressionEvaluator.new(@params)
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
        mod = module_id.to_s

        # 1) Local (bundled) biblioteca
        if dir && File.directory?(dir)
          local = Dir.glob(File.join(dir, '**', "#{mod}.json")).first
          if local
            begin
              return JSON.parse(File.read(local))
            rescue => e
              Ornato::Logger.error("JsonModuleBuilder: erro ao carregar JSON", context: { path: local, error: e.message })
            end
          end
        end

        # 2) Cache (downloaded) biblioteca
        cached = cached_definition_path(mod)
        if cached && File.exist?(cached)
          begin
            return JSON.parse(File.read(cached))
          rescue => e
            Ornato::Logger.warn("JsonModuleBuilder: cache corrompido", context: { path: cached, error: e.message })
          end
        end

        # 3) Remote fetch (ERP) — enables massive library migrations (WPS)
        remote = fetch_remote_definition(mod)
        if remote.is_a?(Hash)
          begin
            save_cached_definition(mod, remote)
          rescue => e
            puts "Ornato JsonModuleBuilder: falhou ao salvar cache: #{e.message}"
          end
          return remote
        end

        nil
      end

      def self.default_biblioteca_dir
        File.join(Ornato::PLUGIN_DIR, 'biblioteca', 'moveis')
      rescue
        nil
      end

      # ─────────────────────────────────────────────────────────
      # Remote JSON cache + fetch
      # ─────────────────────────────────────────────────────────

      def self.valid_slug?(s)
        !!(s.to_s =~ /\A[a-z0-9_-]{1,80}\z/i)
      end

      def self.cache_root_dir
        plugins_dir = Sketchup.find_support_file('Plugins')
        File.join(plugins_dir, 'ornato_sketchup', 'biblioteca', 'cache', 'moveis_json')
      rescue
        nil
      end

      def self.cached_definition_path(module_id)
        return nil unless valid_slug?(module_id)
        root = cache_root_dir
        return nil unless root
        File.join(root, "#{module_id}.json")
      end

      def self.save_cached_definition(module_id, json_hash)
        path = cached_definition_path(module_id)
        return unless path
        FileUtils.mkdir_p(File.dirname(path))
        File.write(path, JSON.pretty_generate(json_hash))
      end

      def self.fetch_remote_definition(module_id)
        return nil unless valid_slug?(module_id)

        begin
          require 'net/http'
          require 'uri'
        rescue
          return nil
        end

        api_url =
          begin
            cfg = Ornato::Config.load
            cfg.dig(:api, :url) || Sketchup.read_default('Ornato', 'server_url', 'http://localhost:3001')
          rescue
            Sketchup.read_default('Ornato', 'server_url', 'http://localhost:3001')
          end

        uri = URI("#{api_url}/api/plugin/biblioteca/moveis/#{module_id}")

        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.open_timeout = 3
        http.read_timeout = 5

        req = Net::HTTP::Get.new(uri.request_uri)
        token = Sketchup.read_default('Ornato', 'auth_token', '')
        req['Authorization'] = "Bearer #{token}" unless token.to_s.empty?

        resp = http.request(req)
        return nil unless resp.code.to_i == 200

        JSON.parse(resp.body)
      rescue => e
        puts "Ornato JsonModuleBuilder: remote fetch falhou (#{module_id}): #{e.message}"
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

        # Sprint REFLOW: snapshot agregados antes do rebuild destrutivo
        agg_specs = collect_aggregates_for_rebuild(module_group)

        model = Sketchup.active_model
        model.start_operation("Ornato: Rebuild #{module_id}", true)

        begin
          # Apagar todas as peças filhas (inclui agregados — serão re-criados abaixo)
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

          # Sprint REFLOW: tenta reposicionar agregados nos novos bays
          if agg_specs && !agg_specs.empty?
            stats = rebuild_aggregates(module_group, agg_specs)
            module_group.set_attribute('Ornato', 'reflow_stats',
                                       JSON.generate(stats))
          end

          model.commit_operation
          true

        rescue => e
          model.abort_operation
          puts "Ornato JsonModuleBuilder.rebuild ERRO: #{e.message}\n" \
               "#{e.backtrace.first(5).join("\n")}"
          false
        end
      end

      # Reflow para mudanças de shop_profile/snapshot.
      # Equivalente a um rebuild que herda os params atuais e troca
      # apenas o snapshot da ShopConfig vigente. Preserva agregados.
      #
      # @param module_group [Sketchup::Group]
      # @return [Hash] { ok:, rebuilt:, dropped: } ou nil em erro
      def self.refresh_shop_snapshot_with_reflow(module_group)
        return nil unless PieceStamper.module?(module_group)

        # Coleta specs ANTES de zerar snapshot (rebuild destrói filhos)
        agg_specs = collect_aggregates_for_rebuild(module_group)

        # Atualiza o snapshot estampado no group
        snap = refresh_shop_snapshot(module_group)
        return nil if snap.nil?

        # Rebuild via params atuais (snapshot novo entra no builder)
        old_params_json = module_group.get_attribute('Ornato', 'params') || '{}'
        old_params = JSON.parse(old_params_json) rescue {}

        # rebuild já chama collect_aggregates_for_rebuild novamente, mas
        # nesse ponto a lista 'aggregates' ainda não foi mexida — ok.
        ok = rebuild(module_group, old_params)
        stats = { rebuilt: 0, dropped: 0 }
        if ok
          raw_stats = module_group.get_attribute('Ornato', 'reflow_stats', '{}')
          stats = JSON.parse(raw_stats) rescue stats
        end
        { ok: ok, snapshot: snap }.merge(stats.transform_keys(&:to_sym))
      rescue => e
        (defined?(Ornato::Logger) ? Ornato::Logger.warn("refresh_shop_snapshot_with_reflow: #{e.message}") : warn(e.message))
        nil
      end

      # ─────────────────────────────────────────────────────────
      # AGREGADOS — peças/conjuntos inseridos em vão (Bay) interno
      # detectado por Ornato::Geometry::Bay (Sprint MIRA-A).
      #
      # Diferente de create_from_json, NÃO cria módulo top-level: o
      # agregado vira um sub-group dentro do módulo pai (parent_group),
      # estampado com tipo='agregado' e referenciando bay_id.
      #
      # Pré-requisito: o objeto `bay` precisa expor:
      #   bay.module_group   → Sketchup::Group pai
      #   bay.id             → identificador estável
      #   bay.width_mm       → largura interna do vão (mm)
      #   bay.height_mm      → altura interna do vão (mm)
      #   bay.depth_mm       → profundidade interna do vão (mm)
      #   bay.origin         → Geom::Point3d ou [x,y,z] em mm da origem do bay (canto inferior-esquerdo-fundo)
      #   bay.bbox           → opcional: hash {min:[x,y,z], max:[x,y,z]} em mm
      #
      # @param bay           [#module_group, #id, #width_mm, ...]
      # @param aggregate_id  [String] nome do .json em biblioteca/agregados/
      # @param params        [Hash] overrides do usuário
      # @return [Sketchup::Group, nil]
      # ─────────────────────────────────────────────────────────
      def self.build_aggregate(bay, aggregate_id, params = {})
        json_def = load_aggregate_definition(aggregate_id)
        raise "Agregado nao encontrado: #{aggregate_id}" unless json_def
        unless json_def['tipo'].to_s == 'agregado'
          raise "Esperado tipo=agregado em #{aggregate_id}.json"
        end

        parent_group = bay.respond_to?(:module_group) ? bay.module_group : nil
        raise 'bay.module_group ausente' unless parent_group

        str_params = {}
        params.each { |k, v| str_params[k.to_s] = v }

        bay_params = bay_to_params(bay)

        # Validação de min_bay (se declarado)
        validate_min_bay!(json_def, bay_params)

        model = (defined?(Sketchup) && Sketchup.respond_to?(:active_model)) ? Sketchup.active_model : nil
        model.start_operation("Ornato: Agregado #{aggregate_id}", true) if model

        begin
          agg_group = parent_group.entities.add_group
          agg_group.name = json_def['nome'] || aggregate_id

          # Posiciona o sub-group na origem do bay (coords locais do parent)
          if agg_group.respond_to?(:transformation=) && defined?(Geom::Transformation)
            ox, oy, oz = bay_origin_xyz(bay)
            agg_group.transformation = Geom::Transformation.new(
              Geom::Point3d.new(ox.to_f.mm, oy.to_f.mm, oz.to_f.mm)
            )
          end

          # Stamp como agregado (tipo != 'modulo')
          PieceStamper.stamp_module(agg_group,
            module_id: aggregate_id.to_s,
            params:    str_params,
            nome:      json_def['nome'])
          # sobrescreve tipo para 'agregado'
          agg_group.set_attribute('Ornato', 'tipo', 'agregado')
          agg_group.set_attribute('Ornato', 'aggregate_id',     aggregate_id.to_s)
          agg_group.set_attribute('Ornato', 'parent_module_id', parent_group.entityID)
          bay_id_value = bay.respond_to?(:id) ? bay.id : nil
          agg_group.set_attribute('Ornato', 'bay_id', bay_id_value) if bay_id_value
          agg_group.set_attribute('Ornato', 'bay_bbox', JSON.generate(bay_params))

          # Stamp bay_signature para reflow após resize do módulo pai (Sprint REFLOW)
          stamp_bay_signature(agg_group, bay, parent_group, str_params)

          # Persiste params do agregado no próprio agg_group (Sprint REFLOW)
          # — usado por AggregatePersistor.snapshot para rebuild fiel.
          agg_group.set_attribute('Ornato', 'params', JSON.generate(str_params))

          builder = new(json_def, str_params)
          builder.set_bay_context(bay_params)
          builder.build(agg_group)

          # Registra no parent: lista de agregados (id do entityID + meta)
          existing_raw = parent_group.get_attribute('Ornato', 'aggregates', '[]')
          existing = (JSON.parse(existing_raw) rescue []) || []
          existing = [] unless existing.is_a?(Array)
          existing << {
            'id'           => agg_group.entityID,
            'aggregate_id' => aggregate_id.to_s,
            'bay_id'       => bay_id_value
          }
          parent_group.set_attribute('Ornato', 'aggregates', JSON.generate(existing))

          model.commit_operation if model
          agg_group
        rescue => e
          model.abort_operation if model
          (defined?(Ornato::Logger) ? Ornato::Logger.error("build_aggregate ERRO", context: { error: e.message }) : warn("build_aggregate ERRO: #{e.message}"))
          nil
        end
      end

      # Localiza o JSON do agregado em biblioteca/agregados/<id>.json
      def self.load_aggregate_definition(aggregate_id)
        return nil unless valid_slug?(aggregate_id)
        path = File.expand_path("../../../biblioteca/agregados/#{aggregate_id}.json", __FILE__)
        return nil unless File.exist?(path)
        JSON.parse(File.read(path))
      rescue => e
        (defined?(Ornato::Logger) ? Ornato::Logger.warn("load_aggregate_definition ERRO", context: { error: e.message }) : warn("load_aggregate_definition ERRO: #{e.message}"))
        nil
      end

      # Extrai dimensões do bay para o contexto de expressões.
      def self.bay_to_params(bay)
        {
          'largura'      => bay.respond_to?(:width_mm)  ? bay.width_mm.to_f  : 0.0,
          'altura'       => bay.respond_to?(:height_mm) ? bay.height_mm.to_f : 0.0,
          'profundidade' => bay.respond_to?(:depth_mm)  ? bay.depth_mm.to_f  : 0.0,
        }
      end

      # Origem do bay em coords locais do módulo pai (em mm).
      def self.bay_origin_xyz(bay)
        if bay.respond_to?(:origin)
          o = bay.origin
          if o.respond_to?(:x) && o.respond_to?(:y) && o.respond_to?(:z)
            return [o.x.to_f, o.y.to_f, o.z.to_f]
          elsif o.is_a?(Array) && o.size >= 3
            return [o[0].to_f, o[1].to_f, o[2].to_f]
          end
        end
        if bay.respond_to?(:bbox) && bay.bbox.is_a?(Hash) && bay.bbox['min'].is_a?(Array)
          mn = bay.bbox['min']
          return [mn[0].to_f, mn[1].to_f, mn[2].to_f]
        end
        [0.0, 0.0, 0.0]
      end

      # ─────────────────────────────────────────────────────────
      # SPRINT REFLOW — Reflow paramétrico de agregados
      # ─────────────────────────────────────────────────────────
      #
      # Quando o módulo pai sofre rebuild (resize ou refresh shop),
      # `module_group.entities.erase_entities(...)` apaga TODOS os
      # filhos — inclusive sub-groups de agregados. O fluxo abaixo:
      #
      #   1. Antes do rebuild:  AggregatePersistor.snapshot(...)
      #   2. Rebuild padrão (apaga + recria peças)
      #   3. BayDetector.new(group).bays  → vãos novos
      #   4. Para cada spec persistido: match_bay_after_resize → bay
      #      4a. Se OK → build_aggregate(bay, aggregate_id, params)
      #      4b. Se nil → log warn (agregado descartado)
      #
      # Backward-compat: módulos sem agregados pulam todos esses
      # passos sem custo (snapshot devolve []).

      # Carimba bay_signature no agg_group para reflow.
      # @param agg_group   [Sketchup::Group]
      # @param bay         [Ornato::Geometry::Bay]
      # @param parent_group [Sketchup::Group]
      # @param str_params  [Hash<String, Object>]
      def self.stamp_bay_signature(agg_group, bay, parent_group, _str_params)
        return unless agg_group && agg_group.respond_to?(:set_attribute)

        rel_pos = AggregatePersistor.bay_relative_position(bay, parent_group)
        neighbors = bay.respond_to?(:neighbor_roles) ? (bay.neighbor_roles || {}) : {}

        sig = {
          'neighbors'    => neighbors.each_with_object({}) { |(k, v), h|
            h[k.to_s] = v.nil? ? nil : v.to_s
          },
          'relative_pos' => rel_pos,
          'type'         => (bay.respond_to?(:type) ? bay.type.to_s : 'interior_bay'),
        }
        agg_group.set_attribute('Ornato', 'bay_signature', JSON.generate(sig))
      rescue => e
        (defined?(Ornato::Logger) ? Ornato::Logger.warn("stamp_bay_signature falhou: #{e.message}") : warn(e.message))
      end

      # Coleta specs de agregados antes de um rebuild destrutivo.
      # Público para ser invocado por callers que customizam rebuild.
      def self.collect_aggregates_for_rebuild(parent_group)
        AggregatePersistor.snapshot(parent_group)
      end

      # Reconstrói os agregados em new_bays a partir dos specs.
      # @return [Hash] { rebuilt: Integer, dropped: Integer }
      def self.rebuild_aggregates(parent_group, specs)
        return { rebuilt: 0, dropped: 0 } if specs.nil? || specs.empty?
        return { rebuilt: 0, dropped: specs.size } unless defined?(Ornato::Geometry::BayDetector)

        # Reset do registro de agregados no parent — build_aggregate vai
        # repovoar com os novos entityIDs.
        parent_group.set_attribute('Ornato', 'aggregates', '[]') if parent_group.respond_to?(:set_attribute)

        detector = Ornato::Geometry::BayDetector.new(parent_group)
        new_bays = (detector.bays rescue []) || []

        rebuilt = 0
        dropped = 0
        specs.each do |spec|
          bay = AggregatePersistor.match_bay_after_resize(spec[:signature], new_bays, parent_group)
          if bay.nil?
            dropped += 1
            log_warn_drop(spec, 'bay perdido após resize')
            next
          end

          # Pre-check min_bay para evitar exception barulhenta
          begin
            json_def = load_aggregate_definition(spec[:aggregate_id])
            if json_def && json_def['min_bay'].is_a?(Hash)
              validate_min_bay!(json_def, bay_to_params(bay))
            end
          rescue => e
            dropped += 1
            log_warn_drop(spec, "min_bay violado: #{e.message}")
            next
          end

          result = build_aggregate(bay, spec[:aggregate_id], spec[:params] || {})
          if result.nil?
            dropped += 1
            log_warn_drop(spec, 'build_aggregate retornou nil')
          else
            rebuilt += 1
          end
        end

        { rebuilt: rebuilt, dropped: dropped }
      end

      def self.log_warn_drop(spec, reason)
        msg = "Agregado #{spec[:aggregate_id]} descartado no reflow: #{reason}"
        if defined?(Ornato::Logger) && Ornato::Logger.respond_to?(:warn)
          Ornato::Logger.warn(msg)
        else
          warn(msg)
        end
      end

      # Verifica min_bay (largura/altura/profundidade) e levanta se vão é menor.
      def self.validate_min_bay!(json_def, bay_params)
        min = json_def['min_bay']
        return unless min.is_a?(Hash)
        %w[largura altura profundidade].each do |k|
          required = min[k].to_f
          actual   = bay_params[k].to_f
          if required > 0 && actual + 1e-6 < required
            raise "Vão muito pequeno: #{k}=#{actual.round(1)} < min #{required.round(1)}"
          end
        end
      end

    end
  end
end
