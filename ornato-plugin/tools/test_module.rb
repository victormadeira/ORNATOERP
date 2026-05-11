# ═══════════════════════════════════════════════════════════════════════
# test_module.rb — Recria um módulo Ornato a partir de JSON arbitrário
#
# WORKFLOW:
#   1. Selecionar bloco WPS no SketchUp
#   2. Ornato::Inspector.export       → gera .md (clipboard)
#   3. Cola .md no Claude com prompt em AI_PROMPT_PORT_WPS_TO_ORNATO.md
#   4. Claude retorna JSON paramétrico Ornato
#   5. Salva JSON em /tmp/test_module.json (ou qualquer path)
#   6. Console SketchUp:
#        load '/Users/madeira/SISTEMA NOVO/ornato-plugin/tools/test_module.rb'
#        Ornato::TestModule.build('/tmp/test_module.json')
#   7. Compare visualmente com o WPS original (lado a lado no SketchUp)
#   8. Se OK, salva em biblioteca/moveis/<categoria>/<id>.json definitivo
#
# OPÇÕES:
#   Ornato::TestModule.build(path, user_params)
#   Ornato::TestModule.build_and_compare(path, original_entity_id)
#   Ornato::TestModule.build_in_place(path, offset_mm: 1500)  # ao lado do original
# ═══════════════════════════════════════════════════════════════════════

module Ornato
  module TestModule
    class << self
      # ─── Build padrão ────────────────────────────────────────────
      def build(json_path, user_params = {})
        unless File.exist?(json_path)
          msg = "JSON não encontrado: #{json_path}"
          UI.messagebox(msg)
          return
        end

        json_def = JSON.parse(File.read(json_path), symbolize_names: false)
        module_id = json_def['id'] || File.basename(json_path, '.json')
        json_def['id'] ||= module_id

        puts "═══ TestModule.build ═══"
        puts "  ID: #{module_id}"
        puts "  Tipo: #{json_def['tipo']}"
        puts "  Peças declaradas: #{(json_def['pecas'] || []).size}"
        puts "  Ferragens auto:  #{(json_def['ferragens_auto'] || []).size}"
        puts "  Parâmetros:      #{(json_def['parametros'] || {}).size}"

        # Tenta usar JsonModuleBuilder.create_from_json se existir
        if defined?(Ornato::Library::JsonModuleBuilder)
          # JsonModuleBuilder normalmente lê de biblioteca/moveis/<id>.json
          # Vamos burlar: passa o JSON direto via initialize do builder
          group = Sketchup.active_model.entities.add_group
          group.name = json_def['nome'] || module_id

          Sketchup.active_model.start_operation("Teste módulo #{module_id}", true)
          begin
            builder = Ornato::Library::JsonModuleBuilder.new(json_def, user_params)
            pieces = builder.build(group)
            stamp_module_attrs(group, module_id, json_def, user_params)
            Sketchup.active_model.commit_operation
            puts "✓ Construído: #{pieces.size} peças no grupo '#{group.name}'"
            puts "  EntityID: #{group.entityID}"
            return group
          rescue StandardError => e
            Sketchup.active_model.abort_operation
            puts "✗ ERRO: #{e.class} #{e.message}"
            puts e.backtrace.first(10).join("\n")
            return nil
          end
        else
          UI.messagebox("Ornato::Library::JsonModuleBuilder não carregado. Carregue o plugin primeiro.")
          nil
        end
      end

      # ─── Build ao lado do original pra comparar ─────────────────
      def build_and_compare(json_path, original_entity_id, offset_mm: 1500)
        orig = find_entity_anywhere(original_entity_id)
        unless orig
          puts "✗ Entidade original #{original_entity_id} não encontrada"
          return
        end

        new_group = build(json_path)
        return unless new_group

        # Move new_group offset_mm pra direita do original
        orig_bb = orig.bounds
        orig_max_x = orig_bb.max.x.to_f
        tx = Geom::Transformation.translation([
          (orig_max_x + (offset_mm * 25.4 / 1000.0)),  # mm → SketchUp internal length
          0,
          0
        ])
        Sketchup.active_model.start_operation('Posicionar comparação', true)
        new_group.transformation = tx
        Sketchup.active_model.commit_operation

        puts ""
        puts "✓ Comparação posicionada:"
        puts "  Original (#{original_entity_id}) em x=#{orig_bb.min.x.to_l}..#{orig_bb.max.x.to_l}"
        puts "  Novo (#{new_group.entityID}) em x=#{new_group.bounds.min.x.to_l}..#{new_group.bounds.max.x.to_l}"
        puts ""
        puts "Dica: use Ornato::Inspector.export nos dois pra diff completo"

        new_group
      end

      # ─── Build em posição específica (sem comparar) ─────────────
      def build_in_place(json_path, offset_mm: 0, user_params: {})
        group = build(json_path, user_params)
        return unless group
        if offset_mm != 0
          tx = Geom::Transformation.translation([offset_mm.mm, 0, 0])
          group.transformation = tx
        end
        group
      end

      # ─── Iterativo: load JSON → build → repeat ──────────────────
      def iterate(json_path, max_iterations: 5)
        # Útil pra: ajustar JSON, re-build, comparar, ajustar...
        puts "═══ Iterando #{json_path} ═══"
        puts "Quando terminar de ajustar o JSON, rode novamente:"
        puts "  Ornato::TestModule.iterate('#{json_path}')"
        last = nil
        max_iterations.times do |i|
          puts "[Iteration #{i + 1}] Reconstruindo..."
          last&.erase!
          last = build(json_path)
          break unless UI.messagebox("Iteration #{i + 1}: Reconstruído. Continuar editando?", MB_YESNO) == IDYES
        end
      end

      private

      def stamp_module_attrs(group, module_id, json_def, user_params)
        group.set_attribute('Ornato', 'tipo', json_def['tipo'] || 'modulo')
        group.set_attribute('Ornato', 'module_id', module_id)
        group.set_attribute('Ornato', 'created_by', 'TestModule')
        group.set_attribute('Ornato', 'json_source', json_def['_source_export'] || 'manual')
        user_params.each { |k, v| group.set_attribute('Ornato', k.to_s, v) }
      end

      def find_entity_anywhere(entity_id)
        eid = entity_id.to_i
        Sketchup.active_model.entities.each do |e|
          return e if e.entityID == eid
          if e.is_a?(Sketchup::Group)
            found = walk_children(e, eid)
            return found if found
          end
        end
        nil
      end

      def walk_children(parent, target_id)
        parent.entities.each do |e|
          return e if e.entityID == target_id
          if e.is_a?(Sketchup::Group)
            found = walk_children(e, target_id)
            return found if found
          end
        end
        nil
      end
    end
  end
end

require 'json'

puts ""
puts "═══════════════════════════════════════════════════════════════"
puts "Ornato::TestModule carregado. Comandos:"
puts ""
puts "  Ornato::TestModule.build('/tmp/test_module.json')"
puts "  Ornato::TestModule.build('/tmp/x.json', { largura: 800 })"
puts "  Ornato::TestModule.build_and_compare('/tmp/x.json', 12345)"
puts "  Ornato::TestModule.build_in_place('/tmp/x.json', offset_mm: 1500)"
puts "  Ornato::TestModule.iterate('/tmp/x.json')   # loop editar → rebuild"
puts "═══════════════════════════════════════════════════════════════"
puts ""
