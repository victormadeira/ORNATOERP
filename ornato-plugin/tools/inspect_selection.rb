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
        when :export     then out << "(modo .export — output completo em JSON ao final)"
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

        # ─── MODO EXPORT: gera arquivos extras completos ───
        if mode == :export
          export_data = build_full_export(entities, depth)
          export_json_path = "/tmp/ornato_export_#{ts}.json"
          export_md_path   = "/tmp/ornato_export_#{ts}.md"
          File.write(export_json_path, JSON.pretty_generate(export_data))
          File.write(export_md_path, render_export_markdown(export_data))
          puts "✓ EXPORT COMPLETO em:"
          puts "  JSON: #{export_json_path}  (estruturado, pra parsing)"
          puts "  MD:   #{export_md_path}    (análise humana, pra colar no chat)"
          puts ""
          puts "Stats: #{export_data[:stats].inspect}"
          if to_clipboard
            md_content = File.read(export_md_path)
            copy_to_clipboard(md_content)
            puts "✓ MD copiado pro clipboard (#{md_content.length} chars)"
          end
        end
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

    # ─── EXPORT: dump TOTAL pra reconstrução (modo máximo) ────────
    # JSON completo com: hierarquia + attrs com metadata + fórmulas
    # + DAG + behavior + geometry summary (furos detectados) + materials.
    # Output: /tmp/ornato_export_<ts>.json + .md (análise humana)
    def self.export(depth: 99, model: false)
      run(depth: depth, model: model, mode: :export, to_clipboard: false)
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

    # ═══════════════════════════════════════════════════════════════
    # EXPORT COMPLETO — captura TUDO pra reconstruir 100% fiel
    # ═══════════════════════════════════════════════════════════════

    def self.build_full_export(entities, max_depth)
      visited = {}
      ctx = {
        all_materials: {},
        all_definitions: {},
        formula_dag_nodes: {},
        formula_dag_edges: [],
        face_features: [],
      }

      roots = entities.map { |e| build_entity_export(e, 0, max_depth, ctx, visited) }

      {
        metadata: {
          extracted_at: Time.now.iso8601,
          sketchup_version: (Sketchup.version rescue 'unknown'),
          model_path: (Sketchup.active_model.path rescue ''),
          depth_max: max_depth,
          schema_version: '1.0',
        },
        roots: roots,
        formula_dag: {
          nodes: ctx[:formula_dag_nodes].values,
          edges: ctx[:formula_dag_edges],
        },
        materials_catalog: ctx[:all_materials].values,
        definitions_catalog: ctx[:all_definitions].values,
        stats: {
          roots: roots.size,
          entities_visited: visited.size,
          formula_nodes: ctx[:formula_dag_nodes].size,
          formula_edges: ctx[:formula_dag_edges].size,
          materials: ctx[:all_materials].size,
          definitions: ctx[:all_definitions].size,
          face_features_detected: ctx[:face_features].size,
        },
      }
    end

    def self.build_entity_export(ent, depth, max_depth, ctx, visited)
      eid = (ent.entityID rescue nil)
      visited[eid] = true if eid

      h = {
        class: ent.class.to_s,
        entityID: eid,
        persistent_id: (ent.persistent_id rescue nil),
        name: (ent.respond_to?(:name) ? ent.name : nil),
        depth: depth,
      }

      # ── Definition info (componentes) ──
      if ent.is_a?(Sketchup::ComponentInstance)
        d = ent.definition
        defkey = d.persistent_id rescue d.entityID
        ctx[:all_definitions][defkey] ||= {
          name: d.name,
          path: (d.path.to_s rescue ''),
          description: (d.description rescue ''),
          guid: (d.guid rescue nil),
          internal_name: (d.internal_name rescue nil),
        }
        h[:definition_ref] = defkey
        h[:definition_name] = d.name
      end

      # ── Behavior (DC: glue, cuts opening, snap, etc) ──
      h[:behavior] = extract_behavior(ent)

      # ── Transformation matrix completa (16 floats) ──
      if ent.respond_to?(:transformation)
        tx = ent.transformation
        h[:transformation_matrix] = tx.to_a rescue nil
        o = tx.origin
        mm = ->(v) { (v.to_f * 25.4).round(3) rescue v.to_f }
        h[:origin_mm] = [mm.call(o.x), mm.call(o.y), mm.call(o.z)]
        # Extrai rotação aproximada (axis+angle) — útil pra reconstruir
        h[:rotation_deg] = extract_rotation_deg(tx) rescue nil
        h[:scale] = extract_scale(tx) rescue nil
      end

      # ── Bounds em mm + inches ──
      if ent.respond_to?(:bounds) && ent.bounds && ent.bounds.valid?
        bb = ent.bounds
        mm = ->(v) { (v.to_f * 25.4).round(3) rescue v.to_f }
        h[:bbox_local_mm] = {
          min: [mm.call(bb.min.x), mm.call(bb.min.y), mm.call(bb.min.z)],
          max: [mm.call(bb.max.x), mm.call(bb.max.y), mm.call(bb.max.z)],
          size: [
            mm.call(bb.max.x - bb.min.x),
            mm.call(bb.max.y - bb.min.y),
            mm.call(bb.max.z - bb.min.z),
          ]
        }
      end

      # ── Material completo (texture path, scale, color) ──
      if ent.respond_to?(:material) && ent.material
        mat = ent.material
        matkey = mat.name
        ctx[:all_materials][matkey] ||= extract_material_data(mat)
        h[:material_ref] = matkey
      end

      # ── Layer/Tag ──
      h[:layer] = ent.layer.name if ent.respond_to?(:layer) && ent.layer

      # ── Visibility ──
      h[:hidden] = ent.hidden? if ent.respond_to?(:hidden?)
      h[:visible] = ent.visible? if ent.respond_to?(:visible?)

      # ── AttributeDictionaries com metadata enriquecida ──
      h[:attributes] = extract_attributes_with_metadata(ent, ctx)

      # ── Geometry summary (face count, circles detectados = furos pré-modelados) ──
      h[:geometry_summary] = analyze_geometry(ent, ctx)

      # ── Children recursivo ──
      children = nil
      if ent.is_a?(Sketchup::Group)
        children = ent.entities.to_a
      elsif ent.is_a?(Sketchup::ComponentInstance)
        children = ent.definition.entities.to_a
      end

      if children && children.any?
        h[:children_count] = children.size
        if depth < max_depth
          h[:children] = children.map { |c| build_entity_export(c, depth + 1, max_depth, ctx, visited) }
        end
      end

      h
    end

    # ─── Behavior do componente (DC behaviors) ────────────────────
    def self.extract_behavior(ent)
      data = {}
      return data unless ent.is_a?(Sketchup::ComponentInstance)
      d = ent.definition
      return data unless d.respond_to?(:behavior)
      b = d.behavior
      data[:always_face_camera]    = b.always_face_camera?    rescue nil
      data[:cuts_opening]          = b.cuts_opening?          rescue nil
      data[:is2d]                  = b.is2d?                  rescue nil
      data[:no_scale_mask]         = b.no_scale_mask          rescue nil
      data[:shadows_face_sun]      = b.shadows_face_sun?      rescue nil
      data[:snapto]                = b.snapto                 rescue nil  # 0=any, 1=horiz, 2=vert, 3=sloped
      data
    end

    # ─── Extrai rotation matrix → axis+angle ─────────────────────
    def self.extract_rotation_deg(tx)
      # Rotação ao redor de Z (eixo vertical SketchUp)
      arr = tx.to_a
      cos_theta = arr[0]
      sin_theta = arr[1]
      angle_rad = Math.atan2(sin_theta, cos_theta)
      (angle_rad * 180.0 / Math::PI).round(2)
    end

    def self.extract_scale(tx)
      arr = tx.to_a
      # Aproximação: norma das colunas 0/1/2
      sx = Math.sqrt(arr[0]**2 + arr[1]**2 + arr[2]**2).round(4)
      sy = Math.sqrt(arr[4]**2 + arr[5]**2 + arr[6]**2).round(4)
      sz = Math.sqrt(arr[8]**2 + arr[9]**2 + arr[10]**2).round(4)
      [sx, sy, sz]
    end

    # ─── Material catalog ─────────────────────────────────────────
    def self.extract_material_data(mat)
      data = {
        name: mat.name,
        display_name: (mat.display_name rescue mat.name),
        color_rgb: nil,
        alpha: (mat.alpha rescue nil),
        use_alpha: (mat.use_alpha? rescue nil),
        materialType: (mat.materialType rescue nil),  # 0=solid, 1=texture, 2=both
        texture: nil,
      }
      if mat.color
        c = mat.color
        data[:color_rgb] = [c.red, c.green, c.blue]
      end
      if mat.texture
        t = mat.texture
        data[:texture] = {
          filename: (t.filename rescue nil),
          width_mm:  ((t.width  rescue 0).to_f * 25.4).round(2),
          height_mm: ((t.height rescue 0).to_f * 25.4).round(2),
        }
      end
      data
    end

    # ─── AttributeDictionaries com metadata DC completa ──────────
    def self.extract_attributes_with_metadata(ent, ctx)
      result = {}
      return result unless ent.respond_to?(:attribute_dictionaries) && ent.attribute_dictionaries

      ent.attribute_dictionaries.each do |dict|
        dict_h = {}
        all_keys = {}
        dict.each_pair { |k, v| all_keys[k] = serialize_value(v) }

        if dict.name == 'dynamic_attributes'
          # Agrupa por variável: separa _KEY_xxx em metadata da var KEY
          vars = {}
          raw_others = {}
          all_keys.each do |k, v|
            if k.start_with?('_') && (m = k.match(/^_(\w+)_(\w+)$/))
              var = m[1]
              attr = m[2]
              vars[var] ||= {}
              vars[var][attr] = v
            else
              # É o VALOR atual de uma variável (ex: "LenX" = 0.5)
              vars[k] ||= {}
              vars[k][:current_value] = v
            end
          end
          # Constrói entrada estruturada
          structured = {}
          vars.each do |var, meta|
            entry = {
              current_value: meta[:current_value],
              formula:       meta['formula'],
              label:         meta['label'],
              units:         meta['units'],
              access:        meta['access'],          # VIEW/EDIT/LIST/NONE
              options:       meta['options'],
              formlabel:     meta['formlabel'],
              formatlength:  meta['formatlength'],
              # Detecta refs de fórmula → alimenta DAG
              refs_found:    extract_formula_refs(meta['formula']),
            }.compact
            structured[var] = entry

            # Alimenta DAG
            if entry[:formula]
              node_key = "#{ent.entityID}:#{var}" rescue var
              ctx[:formula_dag_nodes][node_key] = {
                entity_id: ent.entityID,
                entity_name: (ent.respond_to?(:name) ? ent.name : ''),
                variable: var,
                formula: entry[:formula],
                current_value: entry[:current_value],
                label: entry[:label],
              }
              entry[:refs_found].each do |ref|
                ctx[:formula_dag_edges] << {
                  from: node_key,
                  to: ref,
                  via: entry[:formula],
                }
              end
            end
          end
          dict_h[:dynamic_attributes_structured] = structured
        else
          # Outros dicts: dump direto
          dict_h[:keys] = all_keys
        end

        result[dict.name] = dict_h
      end
      result
    end

    # ─── Parse de refs em fórmula ────────────────────────────────
    # Ex: "=Parent!LenX-50" → ["Parent!LenX"]
    # Ex: "=Caixa.LenY + 10" → ["Caixa.LenY"]
    # Ex: "=FLOOR((Parent!LenX-2*margem)/(ripa_w+gap))" → ["Parent!LenX", "margem", "ripa_w", "gap"]
    def self.extract_formula_refs(formula_str)
      return [] unless formula_str.is_a?(String) && formula_str.start_with?('=')
      str = formula_str[1..]  # remove leading '='
      # Padrões: Parent!X, Component.X, ou identifier solto (var local)
      refs = []
      # 1. Refs explícitas com ! ou .
      str.scan(/([A-Za-z_][\w]*)\s*[!.]\s*([A-Za-z_][\w]*)/) do |scope, var|
        refs << "#{scope}!#{var}"
      end
      # 2. Identifiers locais (sem prefixo)
      tokens = str.scan(/[A-Za-z_][\w]*/)
      builtin_fns = %w[FLOOR CEIL ROUND ABS MIN MAX IF AND OR NOT MOD POW SQRT SIN COS TAN LEN LenX LenY LenZ RotX RotY RotZ]
      tokens.each do |t|
        next if builtin_fns.include?(t)
        next if str =~ /[!.]\s*#{Regexp.escape(t)}/  # já capturado como ref qualificada
        refs << t
      end
      refs.uniq
    end

    # ─── Análise geométrica: face count, círculos detectados (furos!), etc ─
    def self.analyze_geometry(ent, ctx)
      data = { face_count: 0, edge_count: 0, circles: [], rectangles: [], curves: 0 }

      entities = nil
      if ent.is_a?(Sketchup::Group)
        entities = ent.entities
      elsif ent.is_a?(Sketchup::ComponentInstance)
        entities = ent.definition.entities
      end
      return data unless entities

      mm = ->(v) { (v.to_f * 25.4).round(3) rescue v.to_f }

      faces = entities.grep(Sketchup::Face)
      edges = entities.grep(Sketchup::Edge)
      data[:face_count] = faces.size
      data[:edge_count] = edges.size
      data[:curves] = edges.count { |e| e.curve }
      total_area = 0.0

      faces.each do |face|
        begin
          area_in2 = face.area
          area_mm2 = area_in2 * 645.16  # in² → mm²
          total_area += area_mm2

          # Detecta círculo: outer_loop com >= 12 edges curvas e baixa variação de raio
          loop = face.outer_loop
          curved_edges = loop.edges.select { |e| e.curve }
          if curved_edges.size >= 6 && curved_edges.size == loop.edges.size
            # Calcula centro aproximado e raio
            verts = loop.vertices.map(&:position)
            cx = verts.map(&:x).sum / verts.size
            cy = verts.map(&:y).sum / verts.size
            cz = verts.map(&:z).sum / verts.size
            radii = verts.map { |p| Math.sqrt((p.x - cx)**2 + (p.y - cy)**2 + (p.z - cz)**2) }
            r_avg = radii.sum / radii.size
            r_var = radii.max - radii.min
            if r_var < r_avg * 0.05  # variação < 5% = círculo
              circle = {
                center_mm: [mm.call(cx), mm.call(cy), mm.call(cz)],
                radius_mm: mm.call(r_avg),
                diameter_mm: mm.call(r_avg * 2),
                segments: loop.edges.size,
                normal: face.normal.to_a.map { |v| v.round(4) },
                area_mm2: area_mm2.round(2),
              }
              data[:circles] << circle
              ctx[:face_features] << { type: 'circle', entity_id: ent.entityID, circle: circle }
            end
          elsif loop.edges.size == 4 && loop.edges.all? { |e| !e.curve }
            # Rectangle
            verts = loop.vertices.map(&:position)
            mins = [verts.map(&:x).min, verts.map(&:y).min, verts.map(&:z).min]
            maxs = [verts.map(&:x).max, verts.map(&:y).max, verts.map(&:z).max]
            rect = {
              min_mm: mins.map { |v| mm.call(v) },
              max_mm: maxs.map { |v| mm.call(v) },
              size_mm: [mm.call(maxs[0]-mins[0]), mm.call(maxs[1]-mins[1]), mm.call(maxs[2]-mins[2])],
              normal: face.normal.to_a.map { |v| v.round(4) },
              area_mm2: area_mm2.round(2),
            }
            data[:rectangles] << rect
          end
        rescue StandardError => e
          # face problemática, pula
        end
      end

      data[:total_area_mm2] = total_area.round(2)
      data
    end

    # ─── Render markdown da análise (pra colar no chat) ──────────
    def self.render_export_markdown(data)
      lines = []
      lines << "# Ornato Export — análise completa"
      lines << ""
      lines << "**Extraído:** #{data[:metadata][:extracted_at]}"
      lines << "**Modelo:** #{data[:metadata][:model_path].empty? ? '(não-salvo)' : File.basename(data[:metadata][:model_path])}"
      lines << "**SketchUp:** #{data[:metadata][:sketchup_version]}"
      lines << ""
      lines << "## Stats"
      data[:stats].each { |k, v| lines << "- **#{k}:** #{v}" }
      lines << ""

      # Hierarquia + attrs + geometria
      data[:roots].each_with_index do |root, i|
        lines << "## Entidade #{i + 1}/#{data[:roots].size}: #{root[:name]}"
        render_entity_md(root, lines, 0)
      end

      # Formula DAG
      if data[:formula_dag][:nodes].any?
        lines << ""
        lines << "## 📐 Formula DAG (dependências de cálculo)"
        lines << ""
        lines << "### Nodes (variáveis com fórmula)"
        data[:formula_dag][:nodes].each do |n|
          lines << "- **#{n[:entity_name]}.#{n[:variable]}** = `#{n[:formula]}`"
          lines << "  - atual: `#{n[:current_value]}`#{n[:label] ? ' — ' + n[:label] : ''}"
        end
        lines << ""
        lines << "### Edges (quem depende de quem)"
        data[:formula_dag][:edges].first(50).each do |e|
          lines << "- `#{e[:from]}` ← `#{e[:to]}`"
        end
        if data[:formula_dag][:edges].size > 50
          lines << "- ... (+ #{data[:formula_dag][:edges].size - 50} mais — ver JSON completo)"
        end
      end

      # Materials
      if data[:materials_catalog].any?
        lines << ""
        lines << "## 🎨 Materiais usados (#{data[:materials_catalog].size})"
        data[:materials_catalog].each do |m|
          lines << "- **#{m[:name]}** (display: #{m[:display_name]})"
          lines << "  - color: #{m[:color_rgb].inspect}, alpha: #{m[:alpha]}, type: #{m[:materialType]}"
          if m[:texture]
            lines << "  - texture: `#{m[:texture][:filename]}` (#{m[:texture][:width_mm]}×#{m[:texture][:height_mm]}mm)"
          end
        end
      end

      # Definitions
      if data[:definitions_catalog].any?
        lines << ""
        lines << "## 📦 Definitions referenciadas (#{data[:definitions_catalog].size})"
        data[:definitions_catalog].each do |d|
          lines << "- **#{d[:name]}**"
          lines << "  - path: `#{d[:path]}`"
          lines << "  - description: #{d[:description].inspect}" unless d[:description].to_s.empty?
        end
      end

      lines.join("\n")
    end

    def self.render_entity_md(ent, lines, indent)
      pad = '  ' * indent
      lines << "#{pad}- **#{ent[:class]}** \"#{ent[:name]}\""
      lines << "#{pad}  - id: `#{ent[:entityID]}` persistent: `#{ent[:persistent_id]}`"
      if ent[:bbox_local_mm]
        s = ent[:bbox_local_mm][:size]
        lines << "#{pad}  - dims: #{s[0]}×#{s[1]}×#{s[2]}mm"
      end
      if ent[:origin_mm]
        lines << "#{pad}  - origin: #{ent[:origin_mm].inspect}mm  rot_Z: #{ent[:rotation_deg]}°  scale: #{ent[:scale].inspect}"
      end
      if ent[:behavior] && !ent[:behavior].empty?
        nonzero = ent[:behavior].reject { |_, v| v.nil? || v == false || v == 0 }
        lines << "#{pad}  - behavior: #{nonzero.inspect}" unless nonzero.empty?
      end
      lines << "#{pad}  - material: #{ent[:material_ref]}" if ent[:material_ref]
      lines << "#{pad}  - layer: #{ent[:layer]}" if ent[:layer]

      # Attributes com fórmulas
      if ent[:attributes] && ent[:attributes]['dynamic_attributes']
        dc = ent[:attributes]['dynamic_attributes'][:dynamic_attributes_structured] || {}
        if dc.any?
          lines << "#{pad}  - **dynamic_attributes (#{dc.size} vars):**"
          dc.each do |var, m|
            l = m[:label] ? " (#{m[:label]})" : ''
            access = m[:access] ? " [#{m[:access]}]" : ''
            current = m[:current_value]
            cur_str = current.is_a?(Float) ? "#{current.round(4)} (#{(current * 25.4).round(2)}mm)" : current.inspect
            lines << "#{pad}    - **#{var}**#{l}#{access}: atual=#{cur_str}"
            if m[:formula]
              lines << "#{pad}      - fórmula: `#{m[:formula]}`"
              lines << "#{pad}      - refs: #{m[:refs_found].inspect}" if m[:refs_found]&.any?
            end
            lines << "#{pad}      - units: #{m[:units]}" if m[:units]
            lines << "#{pad}      - options: `#{m[:options]}`" if m[:options]
          end
        end
      end

      # Outros dicts
      (ent[:attributes] || {}).each do |dict_name, dict_data|
        next if dict_name == 'dynamic_attributes'
        next unless dict_data[:keys]
        lines << "#{pad}  - **dict '#{dict_name}' (#{dict_data[:keys].size} keys):**"
        dict_data[:keys].first(20).each do |k, v|
          val_str = v.is_a?(String) && v.length > 100 ? "#{v[0,97]}..." : v.inspect
          lines << "#{pad}    - #{k}: #{val_str}"
        end
        if dict_data[:keys].size > 20
          lines << "#{pad}    - ... (+ #{dict_data[:keys].size - 20} keys, ver JSON)"
        end
      end

      # Geometry
      g = ent[:geometry_summary]
      if g && (g[:circles].any? || g[:rectangles].any? || g[:face_count] > 0)
        lines << "#{pad}  - **geometry:** #{g[:face_count]} faces, #{g[:edge_count]} edges, #{g[:circles].size} círculos (furos!), #{g[:rectangles].size} retângulos"
        g[:circles].first(10).each do |c|
          lines << "#{pad}    - 🔵 furo Ø#{c[:diameter_mm]}mm em #{c[:center_mm].inspect}, normal #{c[:normal].inspect}"
        end
        if g[:circles].size > 10
          lines << "#{pad}    - ... (+ #{g[:circles].size - 10} círculos)"
        end
      end

      # Children
      if ent[:children]
        lines << "#{pad}  - **children (#{ent[:children_count]}):**"
        ent[:children].each { |c| render_entity_md(c, lines, indent + 2) }
      elsif ent[:children_count] && ent[:children_count] > 0
        lines << "#{pad}  - children: #{ent[:children_count]} (depth limit alcançado)"
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
puts "  Ornato::Inspector.tree        # ÁRVORE: hierarquia + dims (rápido)"
puts "  Ornato::Inspector.formulas    # FÓRMULAS: DynamicComponent paramétricas"
puts "  Ornato::Inspector.attrs_only  # ATRIBUTOS: foco em metadata"
puts "  Ornato::Inspector.run         # FULL texto: verbose"
puts ""
puts "  Ornato::Inspector.export      # 🌟 EXPORT TOTAL — JSON+MD com TUDO pra reconstruir"
puts "                                #     (DAG fórmulas, behavior, geometry com furos,"
puts "                                #      materials catalog, definitions, attrs+meta)"
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
