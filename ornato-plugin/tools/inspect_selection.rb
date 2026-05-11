# ═══════════════════════════════════════════════════════════════════════
# inspect_selection.rb — Dump completo de info de componentes SketchUp
#
# USO (Ruby Console do SketchUp):
#
#   # 1. Selecione o(s) componente(s) no SketchUp
#   # 2. Cole no console:
#   load '/Users/madeira/SISTEMA NOVO/ornato-plugin/tools/inspect_selection.rb'
#
#   # 3. Output vai:
#   #    - Console (texto pretty)
#   #    - Clipboard (cópia pronta pra colar aqui)
#   #    - Arquivo /tmp/ornato_inspect_<timestamp>.json (estruturado)
#
# OPÇÕES:
#   Ornato::Inspector.run            # padrão (depth=3, selection)
#   Ornato::Inspector.run(depth: 5)  # mais profundo
#   Ornato::Inspector.run(model: true) # modelo inteiro (cuidado)
# ═══════════════════════════════════════════════════════════════════════

module Ornato
  module Inspector
    MAX_DEPTH = 3

    def self.run(depth: MAX_DEPTH, model: false, to_clipboard: true, to_file: true)
      out = []
      sel = Sketchup.active_model.selection

      if sel.empty? && !model
        puts "⚠️ Nenhuma seleção. Selecione algo OU use Ornato::Inspector.run(model: true)"
        return
      end

      entities = model ? Sketchup.active_model.entities.to_a : sel.to_a

      out << "═══════════════════════════════════════════════════════"
      out << "ORNATO INSPECTOR — #{Time.now.iso8601}"
      out << "Modelo: #{Sketchup.active_model.path.empty? ? '(não-salvo)' : File.basename(Sketchup.active_model.path)}"
      out << "Modo: #{model ? 'MODELO INTEIRO' : 'SELEÇÃO'}"
      out << "Entidades: #{entities.size}"
      out << "Depth máximo: #{depth}"
      out << "═══════════════════════════════════════════════════════"
      out << ""

      entities.each_with_index do |ent, i|
        out << "┌─ ENTIDADE #{i + 1}/#{entities.size} ──────────────────────"
        dump_entity(ent, out, 0, depth)
        out << "└─────────────────────────────────────────────────────"
        out << ""
      end

      out << ""
      out << "═══ FIM ═══"

      text = out.join("\n")
      puts text

      if to_clipboard
        copy_to_clipboard(text)
        puts ""
        puts "✓ Copiado pro clipboard (#{text.length} chars). Cola direto na conversa com o Claude."
      end

      if to_file
        ts = Time.now.strftime('%Y%m%d_%H%M%S')
        path = "/tmp/ornato_inspect_#{ts}.txt"
        json_path = "/tmp/ornato_inspect_#{ts}.json"
        File.write(path, text)
        File.write(json_path, JSON.pretty_generate(dump_entities_json(entities, depth)))
        puts "✓ Salvo em:"
        puts "  TXT:  #{path}"
        puts "  JSON: #{json_path}"
      end

      text
    end

    # ─── DUMP TEXTO HUMANO ─────────────────────────────────────────
    def self.dump_entity(ent, out, indent, max_depth)
      pad = '│  ' * indent

      out << "#{pad}Class:        #{ent.class}"
      out << "#{pad}EntityID:     #{ent.entityID rescue 'N/A'}"
      out << "#{pad}PersistentID: #{ent.persistent_id rescue 'N/A'}"

      if ent.respond_to?(:name)
        out << "#{pad}Name:         #{ent.name.inspect}"
      end

      if ent.is_a?(Sketchup::ComponentInstance)
        out << "#{pad}Definition:   #{ent.definition.name.inspect}"
        if ent.definition.path && !ent.definition.path.empty?
          out << "#{pad}Path:         #{ent.definition.path}"
        end
      end

      # Bounding box / dimensões
      if ent.respond_to?(:bounds)
        bb = ent.bounds
        if bb && bb.valid?
          dx = (bb.max.x - bb.min.x).to_l rescue (bb.max.x - bb.min.x)
          dy = (bb.max.y - bb.min.y).to_l rescue (bb.max.y - bb.min.y)
          dz = (bb.max.z - bb.min.z).to_l rescue (bb.max.z - bb.min.z)
          mm = ->(v) { (v.to_f * 25.4).round(2) rescue v.to_s }
          out << "#{pad}Dimensions:   #{mm.call(dx)} × #{mm.call(dy)} × #{mm.call(dz)} mm (W×D×H local)"
          out << "#{pad}BBox min:     [#{mm.call(bb.min.x)}, #{mm.call(bb.min.y)}, #{mm.call(bb.min.z)}]"
          out << "#{pad}BBox max:     [#{mm.call(bb.max.x)}, #{mm.call(bb.max.y)}, #{mm.call(bb.max.z)}]"
        end
      end

      # Transformação
      if ent.respond_to?(:transformation)
        tx = ent.transformation
        origin = tx.origin
        mm = ->(v) { (v.to_f * 25.4).round(2) rescue v.to_s }
        out << "#{pad}Origin:       [#{mm.call(origin.x)}, #{mm.call(origin.y)}, #{mm.call(origin.z)}] mm"
      end

      # Material
      if ent.respond_to?(:material) && ent.material
        out << "#{pad}Material:     #{ent.material.name}"
      end

      # Layer/Tag
      if ent.respond_to?(:layer) && ent.layer
        out << "#{pad}Layer/Tag:    #{ent.layer.name}"
      end

      # Hidden / visible
      if ent.respond_to?(:hidden?)
        out << "#{pad}Hidden:       #{ent.hidden?}"
      end

      # ATTRIBUTE DICTIONARIES (o ouro)
      if ent.respond_to?(:attribute_dictionaries) && ent.attribute_dictionaries
        dicts = ent.attribute_dictionaries.to_a
        if dicts.any?
          out << "#{pad}AttrDictionaries (#{dicts.size}):"
          dicts.each do |dict|
            out << "#{pad}  ▸ '#{dict.name}' (#{dict.length} keys)"
            dict.each_pair do |k, v|
              val_str = v.inspect.length > 120 ? "#{v.inspect[0, 117]}..." : v.inspect
              out << "#{pad}     #{k.ljust(28)} = #{val_str}"
            end
          end
        end
      end

      # Children (recursivo)
      children = nil
      if ent.is_a?(Sketchup::Group)
        children = ent.entities.to_a
      elsif ent.is_a?(Sketchup::ComponentInstance)
        children = ent.definition.entities.to_a
      end

      if children && children.any? && indent < max_depth
        out << "#{pad}Children (#{children.size}):"
        children.first(20).each_with_index do |child, i|
          out << "#{pad}  ── [#{i + 1}/#{children.size.clamp(0, 20)}] ──"
          dump_entity(child, out, indent + 1, max_depth)
        end
        if children.size > 20
          out << "#{pad}  ... (+ #{children.size - 20} mais — aumenta depth pra ver)"
        end
      elsif children && children.any?
        out << "#{pad}Children:     #{children.size} (depth limit alcançado, use depth: #{max_depth + 2} pra ver)"
      end
    end

    # ─── DUMP JSON ESTRUTURADO ─────────────────────────────────────
    def self.dump_entities_json(entities, max_depth)
      entities.map { |e| entity_to_h(e, 0, max_depth) }
    end

    def self.entity_to_h(ent, depth, max_depth)
      h = {
        class: ent.class.to_s,
        entityID: (ent.entityID rescue nil),
        persistent_id: (ent.persistent_id rescue nil),
        name: (ent.respond_to?(:name) ? ent.name : nil),
      }

      if ent.is_a?(Sketchup::ComponentInstance)
        h[:definition_name] = ent.definition.name
        h[:definition_path] = ent.definition.path unless ent.definition.path.to_s.empty?
      end

      if ent.respond_to?(:bounds) && ent.bounds && ent.bounds.valid?
        bb = ent.bounds
        mm = ->(v) { (v.to_f * 25.4).round(2) rescue v.to_f }
        h[:dimensions_mm] = {
          w: mm.call(bb.max.x - bb.min.x),
          d: mm.call(bb.max.y - bb.min.y),
          h: mm.call(bb.max.z - bb.min.z),
        }
      end

      if ent.respond_to?(:transformation)
        o = ent.transformation.origin
        mm = ->(v) { (v.to_f * 25.4).round(2) rescue v.to_f }
        h[:origin_mm] = [mm.call(o.x), mm.call(o.y), mm.call(o.z)]
      end

      if ent.respond_to?(:material) && ent.material
        h[:material] = ent.material.name
      end

      if ent.respond_to?(:layer) && ent.layer
        h[:layer] = ent.layer.name
      end

      h[:hidden] = ent.hidden? if ent.respond_to?(:hidden?)

      # ATTRIBUTE DICTIONARIES (estruturado)
      if ent.respond_to?(:attribute_dictionaries) && ent.attribute_dictionaries
        dicts = {}
        ent.attribute_dictionaries.each do |dict|
          dict_h = {}
          dict.each_pair { |k, v| dict_h[k] = serialize_value(v) }
          dicts[dict.name] = dict_h
        end
        h[:attributes] = dicts unless dicts.empty?
      end

      # Children
      children = nil
      if ent.is_a?(Sketchup::Group)
        children = ent.entities.to_a
      elsif ent.is_a?(Sketchup::ComponentInstance)
        children = ent.definition.entities.to_a
      end

      if children && children.any?
        h[:children_count] = children.size
        if depth < max_depth
          h[:children] = children.first(50).map { |c| entity_to_h(c, depth + 1, max_depth) }
        end
      end

      h
    end

    def self.serialize_value(v)
      case v
      when nil, true, false, Numeric, String then v
      when Symbol then v.to_s
      when Array then v.map { |x| serialize_value(x) }
      when Hash then v.transform_values { |x| serialize_value(x) }
      else v.to_s
      end
    end

    # ─── CLIPBOARD ─────────────────────────────────────────────────
    def self.copy_to_clipboard(text)
      if Object.const_defined?(:RUBY_PLATFORM) && RUBY_PLATFORM =~ /darwin/
        IO.popen('pbcopy', 'w') { |io| io.write(text) }
      elsif RUBY_PLATFORM =~ /mswin|mingw|cygwin/
        IO.popen('clip', 'w') { |io| io.write(text) }
      else
        File.write('/tmp/ornato_clipboard.txt', text)
      end
    rescue StandardError => e
      puts "⚠️  Falha ao copiar pro clipboard: #{e.message}"
    end
  end
end

require 'json'

# Auto-executa quando carregado via load:
puts ""
puts "═══════════════════════════════════════════════════════════════════"
puts "Ornato::Inspector carregado. Selecione algo e rode:"
puts "  Ornato::Inspector.run                  # padrão (depth=3, seleção)"
puts "  Ornato::Inspector.run(depth: 5)        # mais profundo"
puts "  Ornato::Inspector.run(model: true)     # modelo inteiro"
puts "═══════════════════════════════════════════════════════════════════"
puts ""

# Roda imediatamente se há seleção:
if defined?(Sketchup) && !Sketchup.active_model.selection.empty?
  Ornato::Inspector.run
end
