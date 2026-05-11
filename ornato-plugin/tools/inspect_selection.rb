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
# 4 MODOS:
#   Ornato::Inspector.run             # FULL (depth=99, todos attrs) — verbose
#   Ornato::Inspector.tree            # TREE só hierarquia + dims (rápido)
#   Ornato::Inspector.attrs_only      # só AttributeDictionaries (foco em metadata)
#   Ornato::Inspector.run(depth: 3)   # limita profundidade
#   Ornato::Inspector.run(model: true) # modelo inteiro
# ═══════════════════════════════════════════════════════════════════════

module Ornato
  module Inspector
    MAX_DEPTH = 99  # default: sem limite prático (gavetas têm 5-6 níveis)

    def self.run(depth: MAX_DEPTH, model: false, to_clipboard: true, to_file: true, mode: :full)
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
      out << "Modo: #{model ? 'MODELO INTEIRO' : 'SELEÇÃO'} | Output: #{mode.upcase}"
      out << "Entidades root: #{entities.size}"
      out << "Depth máximo: #{depth}"
      out << "═══════════════════════════════════════════════════════"
      out << ""

      entities.each_with_index do |ent, i|
        out << "┌─ ENTIDADE #{i + 1}/#{entities.size} ──────────────────────"
        case mode
        when :tree       then dump_tree(ent, out, 0, depth)
        when :attrs_only then dump_attrs_only(ent, out, 0, depth)
        when :formulas   then dump_formulas(ent, out, 0, depth)
        else                  dump_entity(ent, out, 0, depth)
        end
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
        children.each_with_index do |child, i|
          out << "#{pad}  ── [#{i + 1}/#{children.size}] ──"
          dump_entity(child, out, indent + 1, max_depth)
        end
      elsif children && children.any?
        out << "#{pad}Children:     #{children.size} (depth #{max_depth} alcançado — aumente)"
      end
    end

    # ─── TREE: só estrutura + dims (compacto, sem attrs) ──────────
    def self.tree(depth: 99, model: false)
      run(depth: depth, model: model, mode: :tree)
    end

    # ─── ATTRS_ONLY: só AttributeDictionaries de cada nó ──────────
    def self.attrs_only(depth: 99, model: false)
      run(depth: depth, model: model, mode: :attrs_only)
    end

    # ─── FORMULAS: só fórmulas paramétricas (DynamicComponent + WPS) ──
    # Captura {_KEY_formula} de dynamic_attributes E qualquer chave
    # que pareça fórmula (começa com '=') em qualquer dict.
    def self.formulas(depth: 99, model: false)
      run(depth: depth, model: model, mode: :formulas)
    end

    # Assinatura compacta de uma entidade pra detectar repetições (mesmo role + dims arredondadas)
    def self.entity_signature(ent)
      cls = ent.class.to_s.sub('Sketchup::', '')
      role = (ent.respond_to?(:get_attribute) ? (ent.get_attribute('Ornato', 'role') || ent.get_attribute('Ornato', 'tipo') || '') : '').to_s
      defname = ent.is_a?(Sketchup::ComponentInstance) ? ent.definition.name : ''
      dims = ''
      if ent.respond_to?(:bounds) && ent.bounds && ent.bounds.valid?
        bb = ent.bounds
        mm = ->(v) { (v.to_f * 25.4).round(0) rescue v.to_f.round(0) }
        dx = mm.call(bb.max.x - bb.min.x)
        dy = mm.call(bb.max.y - bb.min.y)
        dz = mm.call(bb.max.z - bb.min.z)
        dims = "#{dx}×#{dy}×#{dz}"
      end
      "#{cls}|#{role}|#{defname}|#{dims}"
    end

    def self.dump_tree(ent, out, indent, max_depth)
      pad = '│  ' * indent
      cls_short = ent.class.to_s.sub('Sketchup::', '')
      name = (ent.respond_to?(:name) ? ent.name : '').to_s
      role = (ent.respond_to?(:get_attribute) ? (ent.get_attribute('Ornato', 'role') || ent.get_attribute('Ornato', 'tipo')) : nil)
      role_tag = role ? " [#{role}]" : ''

      # Info de JSON template (se for módulo/agregado)
      tpl_info = ''
      if ent.respond_to?(:get_attribute)
        module_id = ent.get_attribute('Ornato', 'module_id') || ent.get_attribute('Ornato', 'aggregate_id')
        if module_id
          tpl_info = " 📄 #{module_id}"
        end
      end

      dims = ''
      if ent.respond_to?(:bounds) && ent.bounds && ent.bounds.valid?
        bb = ent.bounds
        mm = ->(v) { (v.to_f * 25.4).round(0) rescue v.to_f.round(0) }
        dx = mm.call(bb.max.x - bb.min.x)
        dy = mm.call(bb.max.y - bb.min.y)
        dz = mm.call(bb.max.z - bb.min.z)
        dims = " (#{dx}×#{dy}×#{dz}mm)"
      end

      out << "#{pad}#{cls_short} \"#{name}\"#{role_tag}#{dims}#{tpl_info} #id=#{ent.entityID rescue '?'}"

      children = nil
      if ent.is_a?(Sketchup::Group)
        children = ent.entities.to_a
      elsif ent.is_a?(Sketchup::ComponentInstance)
        children = ent.definition.entities.to_a
      end

      if children && children.any? && indent < max_depth
        # GROUPING: detecta repetições (ex: 20 ripas idênticas) e colapsa
        groups = group_repeated_children(children)
        groups.each do |grp|
          if grp[:count] == 1
            dump_tree(grp[:entities].first, out, indent + 1, max_depth)
          else
            # Colapsa: mostra primeiro + segundo + último + total
            sig = grp[:signature].split('|')
            role_of = sig[1].empty? ? '' : " [#{sig[1]}]"
            dims_of = sig[3].empty? ? '' : " (#{sig[3]}mm)"
            name_first = grp[:entities].first.respond_to?(:name) ? grp[:entities].first.name : ''
            out << "#{('│  ' * (indent + 1))}╔══ × #{grp[:count]} SIMILARES ═══════════════════════════"
            out << "#{('│  ' * (indent + 1))}║  #{sig[0]} \"#{name_first}\"#{role_of}#{dims_of}"
            out << "#{('│  ' * (indent + 1))}║  ids: #{grp[:entities].first(5).map { |e| e.entityID rescue '?' }.join(', ')}#{grp[:count] > 5 ? ', ...' : ''}"
            out << "#{('│  ' * (indent + 1))}╚══════════════════════════════════════════════════"
          end
        end
      elsif children && children.any?
        out << "#{pad}│  ... (+ #{children.size} sub, depth #{max_depth})"
      end
    end

    # Detecta sequências de children com mesma signature e agrupa.
    # Mantém ordem; só agrupa quando >= 3 consecutivos similares (ripas, sys32 furos, etc).
    def self.group_repeated_children(children)
      groups = []
      current_sig = nil
      current_group = nil

      children.each do |c|
        sig = entity_signature(c)
        if sig == current_sig
          current_group[:entities] << c
          current_group[:count] += 1
        else
          groups << current_group if current_group
          current_group = { signature: sig, entities: [c], count: 1 }
          current_sig = sig
        end
      end
      groups << current_group if current_group

      # Só colapsa grupos com >= 3 itens (2 mostra ambos)
      groups.map { |g| g[:count] < 3 ? g.merge(count: 1).then { |_| g.merge(force_expand: true) } : g }

      # Versão simplificada: se group tem >= 3, mantém como grupo (colapsa); se < 3, expande
      groups.each_with_object([]) do |g, acc|
        if g[:count] >= 3
          acc << g
        else
          g[:entities].each { |e| acc << { signature: nil, entities: [e], count: 1 } }
        end
      end
    end

    # ─── FORMULAS DUMP ────────────────────────────────────────────
    # Pesca chaves _*_formula em dynamic_attributes + valores que começam com '='
    # Apresenta como: nome_var = fórmula  (atual: valor_calculado, unidade)
    def self.dump_formulas(ent, out, indent, max_depth)
      pad = '│  ' * indent
      name = (ent.respond_to?(:name) ? ent.name : '').to_s
      out << "#{pad}● #{ent.class.to_s.sub('Sketchup::', '')} \"#{name}\" #id=#{ent.entityID rescue '?'}"

      if ent.respond_to?(:attribute_dictionaries) && ent.attribute_dictionaries
        formulas_found = []

        ent.attribute_dictionaries.each do |dict|
          # Coleta todas chaves do dict, separa em valor/fórmula/metadata
          all_keys = {}
          dict.each_pair { |k, v| all_keys[k] = v }

          # Heurística 1: chaves _KEY_formula em dynamic_attributes
          formula_keys = all_keys.keys.select { |k| k.start_with?('_') && k.end_with?('_formula') }

          # Heurística 2: qualquer valor String começando com '=' (formula syntax)
          inline_formulas = all_keys.select { |_k, v| v.is_a?(String) && v.start_with?('=') }

          formula_keys.each do |fk|
            var_name = fk.sub(/^_/, '').sub(/_formula$/, '')
            formula  = all_keys[fk]
            current  = all_keys[var_name]
            units    = all_keys["_#{var_name}_units"]
            label    = all_keys["_#{var_name}_label"]
            access   = all_keys["_#{var_name}_access"]

            formulas_found << {
              dict: dict.name,
              var: var_name,
              formula: formula,
              current: current,
              units: units,
              label: label,
              access: access
            }
          end

          # Inline formulas (valores que são fórmulas mas não estão em _*_formula keys)
          inline_formulas.each do |k, v|
            next if k.start_with?('_') && k.end_with?('_formula')  # já coberto acima
            formulas_found << {
              dict: dict.name,
              var: k,
              formula: v,
              current: nil,
              units: nil,
              label: nil,
              access: nil,
              inline: true
            }
          end
        end

        if formulas_found.empty?
          out << "#{pad}  (sem fórmulas paramétricas)"
        else
          out << "#{pad}  📐 #{formulas_found.size} fórmulas encontradas:"
          # Agrupa por dict
          formulas_found.group_by { |f| f[:dict] }.each do |dname, list|
            out << "#{pad}  ▸ Dict '#{dname}':"
            list.each do |f|
              label = f[:label] ? " (#{f[:label]})" : ''
              access = f[:access] ? " [access=#{f[:access]}]" : ''
              units = f[:units] ? " #{f[:units]}" : ''
              # Fórmula completa (sem truncar)
              out << "#{pad}     #{f[:var].ljust(28)}#{label}#{access}"
              out << "#{pad}       FÓRMULA: #{f[:formula]}"
              if f[:current]
                cur_str = if f[:current].is_a?(Float)
                  # Converte inches→mm se parecer dimensão
                  mm_val = (f[:current] * 25.4).round(2)
                  "#{f[:current].round(4)} (#{mm_val}mm se inches)"
                else
                  f[:current].inspect
                end
                out << "#{pad}       ATUAL  : #{cur_str}#{units}"
              end
              out << "#{pad}       ─"
            end
          end
        end
      end

      children = nil
      if ent.is_a?(Sketchup::Group)
        children = ent.entities.to_a
      elsif ent.is_a?(Sketchup::ComponentInstance)
        children = ent.definition.entities.to_a
      end

      if children && children.any? && indent < max_depth
        children.each { |c| dump_formulas(c, out, indent + 1, max_depth) }
      end
    end

    def self.dump_attrs_only(ent, out, indent, max_depth)
      pad = '│  ' * indent
      name = (ent.respond_to?(:name) ? ent.name : '').to_s
      out << "#{pad}● #{ent.class.to_s.sub('Sketchup::', '')} \"#{name}\" #id=#{ent.entityID rescue '?'}"

      if ent.respond_to?(:attribute_dictionaries) && ent.attribute_dictionaries
        dicts = ent.attribute_dictionaries.to_a
        if dicts.any?
          dicts.each do |dict|
            out << "#{pad}  ▸ '#{dict.name}' (#{dict.length} keys)"
            dict.each_pair do |k, v|
              val_str = v.inspect.length > 120 ? "#{v.inspect[0, 117]}..." : v.inspect
              out << "#{pad}     #{k.ljust(28)} = #{val_str}"
            end
          end
        else
          out << "#{pad}  (sem attrs)"
        end
      end

      children = nil
      if ent.is_a?(Sketchup::Group)
        children = ent.entities.to_a
      elsif ent.is_a?(Sketchup::ComponentInstance)
        children = ent.definition.entities.to_a
      end

      if children && children.any? && indent < max_depth
        children.each { |c| dump_attrs_only(c, out, indent + 1, max_depth) }
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
puts "Ornato::Inspector carregado. Selecione algo e rode 1 dos 3 modos:"
puts ""
puts "  Ornato::Inspector.tree        # ÁRVORE: hierarquia + dims (recomendado p/ estrutura)"
puts "  Ornato::Inspector.formulas    # FÓRMULAS: DynamicComponent + WPS paramétricas ★"
puts "  Ornato::Inspector.attrs_only  # ATRIBUTOS: foco em metadata Ornato/wps*"
puts "  Ornato::Inspector.run         # FULL: tudo (verbose)"
puts ""
puts "  Limitar profundidade:  Ornato::Inspector.tree(depth: 4)"
puts "  Modelo inteiro:        Ornato::Inspector.tree(model: true)"
puts "═══════════════════════════════════════════════════════════════════"
puts ""

# Roda TREE imediatamente se há seleção (modo mais útil pra debugar hierarquia):
if defined?(Sketchup) && !Sketchup.active_model.selection.empty?
  puts "→ Auto-executando .tree (hierarquia compacta)..."
  Ornato::Inspector.tree
end
