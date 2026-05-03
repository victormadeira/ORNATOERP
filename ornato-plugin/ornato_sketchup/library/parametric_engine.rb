# ═══════════════════════════════════════════════════════
# ParametricEngine — Motor parametrico para geracao de
# geometria SketchUp a partir de parametros.
# Ponto de entrada principal para criacao de modulos
# de marcenaria (armarios, gaveteiros, nichos etc).
# ═══════════════════════════════════════════════════════

require_relative 'module_base'
require_relative 'json_module_builder'
require_relative 'modules/armario_base'
require_relative 'modules/armario_aereo'
require_relative 'modules/armario_torre'
require_relative 'modules/gaveteiro'
require_relative 'modules/nicho'
require_relative 'modules/porta_abrir'
require_relative 'modules/porta_correr'
require_relative 'modules/gaveta'
require_relative 'modules/prateleira'
require_relative 'modules/sapateira'
require_relative 'modules/cabideiro'
require_relative 'modules/tamponamento'
require_relative 'modules/rodape'
require_relative 'modules/coluna_canto'
require_relative 'modules/divisoria'

module Ornato
  module Library
    module ParametricEngine

      # Registry de tipos de modulo disponiveis
      MODULE_TYPES = {
        'armario_base'   => { klass: Modules::ArmarioBase,   label: 'Armario Base',         desc: 'Armario inferior (sob bancada)' },
        'armario_aereo'  => { klass: Modules::ArmarioAereo,  label: 'Armario Aereo',        desc: 'Armario suspenso de parede' },
        'armario_torre'  => { klass: Modules::ArmarioTorre,  label: 'Armario Torre',        desc: 'Torre (forno/geladeira)' },
        'gaveteiro'      => { klass: Modules::Gaveteiro,     label: 'Gaveteiro',            desc: 'Modulo com gavetas' },
        'nicho'          => { klass: Modules::Nicho,         label: 'Nicho',                desc: 'Estante aberta' },
        'porta_abrir'    => { klass: Modules::PortaAbrir,    label: 'Porta de Abrir',       desc: 'Porta com dobradicas' },
        'porta_correr'   => { klass: Modules::PortaCorrer,   label: 'Porta de Correr',      desc: 'Par de portas deslizantes' },
        'gaveta'         => { klass: Modules::Gaveta,        label: 'Gaveta',               desc: 'Caixa de gaveta avulsa' },
        'prateleira'     => { klass: Modules::Prateleira,    label: 'Prateleira',           desc: 'Prateleira avulsa' },
        'sapateira'      => { klass: Modules::Sapateira,     label: 'Sapateira',            desc: 'Suporte inclinado p/ sapatos' },
        'cabideiro'      => { klass: Modules::Cabideiro,     label: 'Cabideiro',            desc: 'Varao de cabide' },
        'tamponamento'   => { klass: Modules::Tamponamento,  label: 'Tamponamento',         desc: 'Painel lateral de acabamento' },
        'rodape'         => { klass: Modules::Rodape,        label: 'Rodape',               desc: 'Saia / rodape frontal' },
        'coluna_canto'   => { klass: Modules::ColunaCanto,   label: 'Coluna de Canto',      desc: 'Modulo de canto (L ou diagonal)' },
        'divisoria'      => { klass: Modules::Divisoria,     label: 'Divisoria',            desc: 'Divisor vertical interno' },
      }.freeze

      class << self
        # ─── Main Entry Point ─────────────────────────
        # Cria um modulo SketchUp completo a partir do tipo e parametros.
        # Prioridade: JSON da biblioteca → builders Ruby legados.
        #
        # @param type [String] chave do MODULE_TYPES ou id da biblioteca
        # @param params [Hash] parametros do modulo (symbol ou string keys)
        # @param position [Array<Float>] posicao [x, y, z] em mm (default [0,0,0])
        # @return [Sketchup::Group] grupo SketchUp criado
        def create_module(type, params, position = [0, 0, 0])
          str_type  = type.to_s
          sym_params = symbolize_params(params)

          # ── Prioridade 1: JSON da biblioteca ──────────────────
          # Tenta encontrar um JSON correspondente ao module_id.
          # Isso permite adicionar novos módulos só com JSON, sem Ruby.
          json_group = try_json_builder(str_type, sym_params, position)
          return json_group if json_group

          # ── Prioridade 2: Builders Ruby legados ───────────────
          type_info = MODULE_TYPES[str_type]
          raise ArgumentError, "Tipo de modulo desconhecido: #{str_type}" unless type_info

          model = Sketchup.active_model
          model.start_operation("Ornato: Criar #{type_info[:label]}", true)

          begin
            parent_group = model.active_entities.add_group
            parent_group.name = "#{type_info[:label]} #{sym_params[:largura] || ''}x#{sym_params[:altura] || ''}x#{sym_params[:profundidade] || ''}"

            tx = position[0].to_f
            ty = position[1].to_f
            tz = position[2].to_f
            tr = Geom::Transformation.new(Geom::Point3d.new(tx.mm, ty.mm, tz.mm))
            parent_group.transform!(tr)

            parent_group.set_attribute('Ornato', 'module_type', str_type)
            parent_group.set_attribute('Ornato', 'params', JSON.generate(sym_params))
            parent_group.set_attribute('Ornato', 'created_at', Time.now.iso8601)

            builder = type_info[:klass].new(sym_params)
            builder.build(parent_group)

            model.commit_operation
            parent_group

          rescue => e
            model.abort_operation
            puts "Ornato ParametricEngine ERRO: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
            UI.messagebox("Erro ao criar modulo: #{e.message}")
            nil
          end
        end

        # ─── JSON-first builder ───────────────────────
        # Procura JSON na biblioteca e usa JsonModuleBuilder.
        # Retorna nil se não encontrar (permite fallback para Ruby).
        def try_json_builder(type, params, position)
          json_def = JsonModuleBuilder.load_definition(type)
          return nil unless json_def

          JsonModuleBuilder.create_from_json(type, params, position)
        rescue => e
          puts "Ornato: JsonModuleBuilder falhou para '#{type}': #{e.message}"
          nil
        end

        # ─── Piece Creation ───────────────────────────
        # Cria uma peca individual (caixa) dentro de um grupo pai.
        #
        # @param parent_group [Sketchup::Group] grupo pai
        # @param name [String] nome da peca (ex: "Lateral Direita")
        # @param dims [Hash] { largura:, altura:, espessura: } em mm
        # @param material [String, nil] codigo de material Ornato
        # @param position [Array<Float>] [x, y, z] mm relativo ao pai
        # @param role [Symbol] papel da peca (:lateral, :base, :top, :back, :door, :shelf, :divider, :drawer_side, :drawer_bottom, :drawer_back, :drawer_front, :cover, :kick)
        # @return [Sketchup::Group] grupo da peca
        def create_piece(parent_group, name, dims, material, position, role)
          ents = parent_group.entities
          piece = ents.add_group

          piece.name = name

          w = dims[:largura].to_f
          h = dims[:altura].to_f
          d = dims[:espessura].to_f

          # Criar face e extrudar (box)
          pts = [
            Geom::Point3d.new(0, 0, 0),
            Geom::Point3d.new(w.mm, 0, 0),
            Geom::Point3d.new(w.mm, d.mm, 0),
            Geom::Point3d.new(0, d.mm, 0),
          ]
          face = piece.entities.add_face(pts)
          face.pushpull(-h.mm) if face

          # Posicionar
          px = position[0].to_f
          py = position[1].to_f
          pz = position[2].to_f
          tr = Geom::Transformation.new(Geom::Point3d.new(px.mm, py.mm, pz.mm))
          piece.transform!(tr)

          # Aplicar material
          apply_material(piece, material)

          # Atributos Ornato
          piece.set_attribute('Ornato', 'role', role.to_s)
          piece.set_attribute('Ornato', 'module_type', parent_group.get_attribute('Ornato', 'module_type'))
          piece.set_attribute('Ornato', 'dimensions', JSON.generate({ largura: w, altura: h, espessura: d }))

          piece
        end

        # ─── Hardware Tags ────────────────────────────
        # Aplica tags de ferragem no AttributeDictionary da peca.
        # O RulesEngine usa esses tags para gerar furacoes automaticas.
        #
        # @param piece_group [Sketchup::Group] grupo da peca
        # @param role [Symbol] papel da peca
        # @param config [Hash] configuracao de ferragem { joint_type:, handle_spacing:, ... }
        def apply_hardware_tags(piece_group, role, config = {})
          joint_type = config[:joint_type] || config[:tipo_juncao] || 'minifix'

          tags = { joint_type: joint_type }

          case role
          when :lateral
            tags[:system32] = true
            tags[:joints] = joint_type
            tags[:back_groove] = true
          when :base, :top
            tags[:joints] = joint_type
          when :door
            tags[:hinges] = true
            tags[:handle] = true
            tags[:handle_spacing] = config[:puxador_espacamento] || 128
            tags[:hinge_side] = config[:lado] || 'esquerda'
          when :sliding_door
            tags[:groove_top] = true
            tags[:groove_bottom] = true
          when :shelf
            tags[:shelf_type] = config[:tipo] || 'regulavel'
          when :drawer_side
            tags[:drawer_slide] = true
            tags[:corredica] = config[:corredica] || '450mm'
          when :drawer_front
            tags[:handle] = true
            tags[:handle_spacing] = config[:puxador_espacamento] || 128
          when :drawer_bottom, :drawer_back
            tags[:groove] = true
          when :divider
            tags[:joints] = joint_type
            tags[:system32] = config[:com_system32] || false
          when :cover
            tags[:cover] = true
          end

          piece_group.set_attribute('Ornato', 'hardware_tags', JSON.generate(tags))
          tags
        end

        # ─── Edge Banding Tags ────────────────────────
        # Marca quais bordas da peca recebem fita de borda.
        #
        # @param piece_group [Sketchup::Group] grupo da peca
        # @param edges_hash [Hash] { frontal: 'codigo', traseira: '', dir: 'codigo', esq: '' }
        def add_edge_banding(piece_group, edges_hash)
          piece_group.set_attribute('Ornato', 'edges', JSON.generate(edges_hash))
          edges_hash
        end

        # ─── Configure Dialog ─────────────────────────
        # Abre HtmlDialog para configurar parametros de um tipo de modulo.
        # Retorna os parametros via callback.
        #
        # @param type [String] tipo do modulo
        # @param callback [Proc] bloco chamado com params quando usuario confirma
        def configure_dialog(type, &callback)
          type_info = MODULE_TYPES[type.to_s]
          return unless type_info

          dialog = UI::HtmlDialog.new(
            dialog_title: "Configurar #{type_info[:label]} - Ornato",
            width: 480,
            height: 640,
            style: UI::HtmlDialog::STYLE_DIALOG
          )

          dialog.set_file(File.join(Ornato::PLUGIN_DIR, 'ornato_sketchup', 'ui', 'module_library.html'))

          dialog.add_action_callback('create_module') do |_ctx, type_str, params_json|
            begin
              params = JSON.parse(params_json, symbolize_names: true)
              callback.call(params) if callback
              create_module(type_str, params)
              dialog.close
            rescue => e
              puts "Ornato configure_dialog ERRO: #{e.message}"
            end
          end

          dialog.add_action_callback('get_module_types') do |_ctx|
            types_json = MODULE_TYPES.map { |k, v| { type: k, label: v[:label], desc: v[:desc] } }
            dialog.execute_script("window.setModuleTypes(#{JSON.generate(types_json)})")
          end

          dialog.show
          dialog
        end

        private

        # Aplica material SketchUp a um grupo.
        # Tenta encontrar material existente ou cria placeholder.
        def apply_material(piece, material_code)
          return unless material_code && !material_code.empty?

          model = Sketchup.active_model
          materials = model.materials

          # Tentar encontrar material existente com esse codigo
          mat = materials.to_a.find do |m|
            code = Core::MaterialMapper.map(m.display_name)
            code == material_code
          end

          # Se nao encontrou, criar placeholder
          unless mat
            mat = materials.add(material_code)
            # Cor placeholder baseada no nome
            if material_code =~ /branco/i
              mat.color = Sketchup::Color.new(240, 240, 240)
            elsif material_code =~ /preto/i
              mat.color = Sketchup::Color.new(40, 40, 40)
            elsif material_code =~ /carvalho/i
              mat.color = Sketchup::Color.new(180, 140, 90)
            elsif material_code =~ /nogal/i
              mat.color = Sketchup::Color.new(120, 80, 50)
            elsif material_code =~ /cinza/i
              mat.color = Sketchup::Color.new(160, 160, 160)
            else
              mat.color = Sketchup::Color.new(200, 180, 150)
            end
          end

          piece.material = mat
        end

        # Garante que as chaves do hash sao symbols
        def symbolize_params(params)
          return params if params.is_a?(Hash) && params.keys.first.is_a?(Symbol)
          result = {}
          params.each { |k, v| result[k.to_sym] = v }
          result
        end
      end
    end
  end
end
