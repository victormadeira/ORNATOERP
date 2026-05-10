# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# Ornato::Tools::LibraryDeepCleaner
#
# Parte B do "Agente Strip" — limpeza PROFUNDA dos .skp já clonados em
# biblioteca/modelos_ornato/. Remove atributos com namespace WPS dentro
# das ComponentDefinitions / Groups / Instances e renomeia entidades.
#
# Não toca biblioteca/modelos/ (extração WPS original) — só a cópia.
#
# Uso (manualmente acionado pelo usuário em modo dev):
#   Plugins → Ornato → Limpar biblioteca (deep)
#
# Idempotente: rodar duas vezes não corrompe nada.
# ═══════════════════════════════════════════════════════════════════════

module Ornato
  module Tools
    module LibraryDeepCleaner
      # Namespaces de attribute_dictionaries WPS-ish que dropamos.
      WPS_DICT_PATTERN = /\A(wpsg|wpsuser|wps_)/i

      # Tokens a remover de Definition.name
      NAME_PATTERNS = [
        [/_cjold(?=\b|$)/i, '_old'],
        [/_cj(?=\b|$)/i,    ''   ],
        [/\bwps_/i,         ''   ]
      ].freeze

      class << self
        def menu_path
          @menu_path ||= File.join(plugin_root, 'biblioteca', 'modelos_ornato')
        end

        def plugin_root
          # ornato_sketchup/tools/ → ornato_sketchup/ → ornato-plugin/
          File.expand_path('../..', __dir__)
        end

        # ─── menu ────────────────────────────────────────────────────
        def install_menu!
          return if @menu_installed

          # Só aparece se config dev/admin está ativo
          unless dev_mode?
            @menu_installed = true
            return
          end

          plugins = UI.menu('Plugins')
          ornato  = plugins.add_submenu('Ornato')
          ornato.add_item('Limpar biblioteca (deep)') { run_interactive! }
          @menu_installed = true
        end

        def dev_mode?
          # Heurística: existe arquivo .dev_mode no plugin root, OU
          # variável Ornato.dev? definida.
          return Ornato.dev? if defined?(Ornato) && Ornato.respond_to?(:dev?)
          File.exist?(File.join(plugin_root, '.dev_mode'))
        rescue StandardError
          false
        end

        # ─── execução ────────────────────────────────────────────────
        def run_interactive!
          dir = menu_path
          unless Dir.exist?(dir)
            UI.messagebox("Diretório não encontrado:\n#{dir}\n\nRode primeiro: ruby tools/clone_library_clean.rb")
            return
          end

          files = Dir.glob(File.join(dir, '**', '*.skp'))
          if files.empty?
            UI.messagebox("Nenhum .skp em #{dir}")
            return
          end

          confirm = UI.messagebox("Limpar #{files.size} arquivos .skp em modelos_ornato/?\n(sobrescreve cópias já cosmeticamente limpas)", MB_YESNO)
          return unless confirm == IDYES

          stats = { ok: 0, fail: 0, attrs_dropped: 0, defs_renamed: 0 }

          files.each_with_index do |path, i|
            puts "[deep_cleaner] [#{i + 1}/#{files.size}] #{File.basename(path)}"
            begin
              s = clean_skp_file(path)
              stats[:ok] += 1
              stats[:attrs_dropped] += s[:attrs_dropped]
              stats[:defs_renamed]  += s[:defs_renamed]
            rescue StandardError => e
              stats[:fail] += 1
              warn_log("Falha em #{path}: #{e.class} #{e.message}")
            end
          end

          info_log("Deep clean concluído: #{stats.inspect}")
          UI.messagebox("Concluído.\nArquivos OK: #{stats[:ok]}\nFalhas: #{stats[:fail]}\nAtributos removidos: #{stats[:attrs_dropped]}\nDefinitions renomeadas: #{stats[:defs_renamed]}")
        end

        # Limpa um único .skp: carrega como definition, walk, salva no mesmo path.
        # Retorna hash de stats.
        def clean_skp_file(path)
          stats = { attrs_dropped: 0, defs_renamed: 0 }
          model = Sketchup.active_model

          # carrega componente. SketchUp adiciona à lista de definitions.
          definition = model.definitions.load(path)
          return stats unless definition

          # walk recursivo
          visited = {}
          walk_definition(definition, visited, stats)

          # salva sobrescrevendo (apenas o conteúdo da definition raiz vai pro arquivo)
          definition.save_as(path)
          stats
        end

        def walk_definition(definition, visited, stats)
          return if visited[definition.entityID]
          visited[definition.entityID] = true

          # rename
          new_name, applied = clean_name(definition.name)
          if !applied.empty? && new_name != definition.name && new_name != ''
            definition.name = new_name
            stats[:defs_renamed] += 1
          end

          # strip atributos da definition
          stats[:attrs_dropped] += strip_wps_attrs(definition)

          # walk entities
          definition.entities.each do |ent|
            case ent
            when Sketchup::ComponentInstance
              stats[:attrs_dropped] += strip_wps_attrs(ent)
              walk_definition(ent.definition, visited, stats)
            when Sketchup::Group
              stats[:attrs_dropped] += strip_wps_attrs(ent)
              walk_definition(ent.definition, visited, stats) if ent.respond_to?(:definition)
            end
          end
        end

        def strip_wps_attrs(entity)
          return 0 unless entity.respond_to?(:attribute_dictionaries)
          dicts = entity.attribute_dictionaries
          return 0 unless dicts

          to_drop = []
          dicts.each { |d| to_drop << d.name if d.name =~ WPS_DICT_PATTERN }
          to_drop.each { |name| entity.attribute_dictionaries.delete(name) }
          to_drop.size
        end

        def clean_name(name)
          out = name.dup
          applied = []
          NAME_PATTERNS.each do |pat, repl|
            if out =~ pat
              out = out.gsub(pat, repl)
              applied << pat.source
            end
          end
          out = out.gsub(/__+/, '_').strip.sub(/_+\z/, '')
          [out, applied]
        end

        # ─── log helpers ─────────────────────────────────────────────
        def info_log(msg)
          if defined?(Ornato::Logger)
            Ornato::Logger.info("[LibraryDeepCleaner] #{msg}")
          else
            puts "[LibraryDeepCleaner] #{msg}"
          end
        end

        def warn_log(msg)
          if defined?(Ornato::Logger)
            Ornato::Logger.warn("[LibraryDeepCleaner] #{msg}")
          else
            warn "[LibraryDeepCleaner] #{msg}"
          end
        end
      end
    end
  end
end

# Instala menu na carga, se rodando dentro do SketchUp.
if defined?(UI) && defined?(Sketchup)
  Ornato::Tools::LibraryDeepCleaner.install_menu!
end
