# ═══════════════════════════════════════════════════════
# HierarchyBuilder — Constroi hierarquia de modulos a
# partir da arvore do modelo SketchUp.
# Grupos de nivel superior → Modulos (armarios)
# Grupos/Componentes aninhados → Pecas
# Atribui roles (:lateral, :base, :top, :back, :door,
# :drawer_front, :shelf, :divider) por nome e posicao.
# ═══════════════════════════════════════════════════════

module Ornato
  module Core
    class HierarchyBuilder
      # Padroes de nome para deteccao de role por regex
      # Suporta portugues e ingles
      ROLE_PATTERNS = {
        lateral:      /\blateral\b|\bside\b|\blat[\._\-\s]/i,
        base:         /\bbase\b|\bbottom\b|\bfundo\s*inf/i,
        top:          /\btampo\b|\btopo\b|\btop\b|\btampa\b/i,
        back:         /\btraseira\b|\bfundo\b|\bback\b|\bcostas\b/i,
        door:         /\bporta\b|\bdoor\b/i,
        drawer_front: /\bfrente.*gaveta\b|\bdrawer.*front\b|\bfg\b/i,
        shelf:        /\bprateleira\b|\bshelf\b|\bprat[\._\-\s]/i,
        divider:      /\bdivisoria\b|\bdivider\b|\bdiv[\._\-\s]/i,
        drawer_side:  /\blateral.*gaveta\b|\bdrawer.*side\b/i,
        drawer_base:  /\bfundo.*gaveta\b|\bdrawer.*bottom\b/i,
        drawer_back:  /\btraseira.*gaveta\b|\bdrawer.*back\b/i,
      }

      # Padroes de nome para deteccao de tipo de modulo
      MODULE_PATTERNS = {
        armario_base:   /\barmario\s*baixo\b|\bbase\s*cab/i,
        armario_aereo:  /\barmario\s*aereo\b|\baereo\b|\bwall\s*cab/i,
        armario_torre:  /\btorre\b|\btall\s*cab|\bcoluna\b/i,
        gaveteiro:      /\bgaveteiro\b|\bdrawer\s*unit/i,
        estante:        /\bestante\b|\bbook\s*case/i,
        balcao:         /\bbalcao\b|\bcounter\b/i,
        painel:         /\bpainel\b|\bpanel\b/i,
        gaveta:         /\bgaveta\b|\bdrawer\b/i,
      }

      def initialize(options = {})
        @piece_detector = options[:piece_detector] || PieceDetector.new
        @max_depth = options[:max_depth] || 3
      end

      # Constroi hierarquia completa do modelo.
      # Retorna lista de modulos, cada um com suas pecas e roles atribuidos.
      #
      # @param model [Sketchup::Model] modelo SketchUp ativo
      # @return [Hash] { modules: [...], orphan_pieces: [...], stats: {...} }
      def build(model)
        modules = []
        orphan_pieces = []

        traverse(model.active_entities, modules, orphan_pieces, depth: 0, parent: nil)

        # Pos-processamento: refinar roles por analise de posicao
        modules.each { |mod| refine_roles(mod) }

        {
          modules: modules,
          orphan_pieces: orphan_pieces,
          stats: {
            total_modules: modules.length,
            total_pieces: modules.sum { |m| m[:pieces].length } + orphan_pieces.length,
            total_orphans: orphan_pieces.length,
            module_types: modules.map { |m| m[:type] }.tally,
          }
        }
      end

      # Constroi hierarquia para um unico grupo selecionado.
      #
      # @param group [Sketchup::Group, Sketchup::ComponentInstance]
      # @return [Hash] modulo com pecas
      def build_single(group)
        mod = build_module(group, parent: nil)
        refine_roles(mod)
        mod
      end

      private

      # Percorre entidades recursivamente, separando modulos de pecas.
      def traverse(entities, modules, orphan_pieces, depth:, parent:)
        entities.each do |entity|
          next unless group_or_component?(entity)

          children = get_children(entity)
          has_sub_groups = children.any? { |c| group_or_component?(c) }

          if has_sub_groups && depth < @max_depth
            # Entidade com filhos = modulo (armario, gaveteiro, etc)
            mod = build_module(entity, parent: parent)
            modules << mod

            # Pecas soltas dentro deste modulo (filhos que nao sao grupos)
            # ja foram processados em build_module

            # Sub-modulos (ex: gaveta dentro de armario)
            children.each do |child|
              next unless group_or_component?(child)
              child_children = get_children(child)
              child_has_subs = child_children.any? { |c| group_or_component?(c) }

              if child_has_subs && depth + 1 < @max_depth
                sub_mod = build_module(child, parent: mod)
                modules << sub_mod
              end
              # Pecas folha ja foram capturadas em build_module
            end
          else
            # Entidade folha sem sub-grupos — peca solta
            piece = @piece_detector.analyze_entity(entity, parent)
            orphan_pieces << piece if piece
          end
        end
      end

      # Constroi info de modulo a partir de um grupo SketchUp.
      # Detecta todas as pecas filhas e atribui roles iniciais.
      #
      # @param entity [Sketchup::Group, Sketchup::ComponentInstance]
      # @param parent [Hash, nil] modulo pai
      # @return [Hash] modulo completo
      def build_module(entity, parent:)
        bb = entity.bounds
        name = get_entity_name(entity)

        mod = {
          group: entity,
          name: name,
          type: detect_module_type(name),
          parent: parent,
          bounds: {
            width: bb.width.to_mm.round(1),
            height: bb.height.to_mm.round(1),
            depth: bb.depth.to_mm.round(1),
          },
          origin: [bb.min.x.to_mm.round(1), bb.min.y.to_mm.round(1), bb.min.z.to_mm.round(1)],
          pieces: [],
        }

        # Detectar pecas filhas
        children = get_children(entity)
        children.each do |child|
          next unless group_or_component?(child)

          # Pular sub-grupos que sao modulos (processados separadamente)
          child_children = get_children(child)
          next if child_children.any? { |c| group_or_component?(c) }

          piece = @piece_detector.analyze_entity(child, mod)
          if piece
            piece[:role] = detect_role_by_name(get_entity_name(child))
            piece[:module_name] = name
            piece[:module_group] = entity
            mod[:pieces] << piece
          end
        end

        mod
      end

      # Detecta tipo do modulo pelo nome
      def detect_module_type(name)
        MODULE_PATTERNS.each do |type, pattern|
          return type if name.match?(pattern)
        end
        :modulo_generico
      end

      # Detecta role da peca pelo nome (primeira passada)
      def detect_role_by_name(name)
        ROLE_PATTERNS.each do |role, pattern|
          return role if name.match?(pattern)
        end
        :unknown
      end

      # Refina roles das pecas por analise de posicao dentro do modulo.
      # Aplica heuristicas geometricas para pecas com role :unknown.
      #
      # @param mod [Hash] modulo com pecas
      def refine_roles(mod)
        return if mod[:pieces].empty?

        mod_w = mod[:bounds][:width]
        mod_h = mod[:bounds][:height]
        mod_d = mod[:bounds][:depth]

        mod[:pieces].each do |piece|
          next unless piece[:role] == :unknown

          comp = piece[:comprimento]
          larg = piece[:largura]
          esp = piece[:espessura]
          orientation = piece[:orientation]

          role = infer_role_by_geometry(
            comp, larg, esp, orientation,
            mod_w, mod_h, mod_d, piece
          )

          piece[:role] = role
        end

        # Segunda passada: resolver conflitos
        resolve_role_conflicts(mod)
      end

      # Infere role baseado em dimensoes e orientacao da peca
      # relativo ao modulo pai.
      def infer_role_by_geometry(comp, larg, esp, orientation, mod_w, mod_h, mod_d, piece)
        # Painel vertical (espessura em X): lateral ou divisoria
        if orientation == :x
          if comp >= mod_h * 0.7 && larg >= mod_d * 0.6
            return :lateral
          elsif comp >= mod_h * 0.3
            return :divider
          end
        end

        # Painel horizontal (espessura em Z): base, tampo, prateleira
        if orientation == :z
          if larg >= mod_d * 0.6 && comp >= mod_w * 0.7
            # Posicao vertical determina se e base, tampo ou prateleira
            world_z = piece[:world_origin] ? piece[:world_origin][2] : 0
            mod_z0 = piece[:module_group] ? piece[:module_group].bounds.min.z.to_mm : 0
            mod_z1 = mod_z0 + mod_h

            relative_z = world_z - mod_z0

            if relative_z < mod_h * 0.1
              return :base
            elsif relative_z > mod_h * 0.85
              return :top
            else
              return :shelf
            end
          end
        end

        # Painel em profundidade (espessura em Y): traseira/fundo
        if orientation == :y
          if esp <= 8 && comp >= mod_w * 0.6 && larg >= mod_h * 0.6
            return :back
          end
          # Porta: mesmo plano Y mas espessura normal
          if esp >= 12 && comp >= mod_h * 0.5 && larg >= mod_w * 0.3
            return :door
          end
        end

        # Peca fina, pequena relativa ao modulo = possivel fundo
        if esp <= 6 && (comp * larg) >= (mod_w * mod_h * 0.4)
          return :back
        end

        :unknown
      end

      # Resolve conflitos de role dentro do modulo.
      # Ex: se ha 3 pecas como :lateral, as intermediarias sao :divider.
      # Ex: se ha 2 pecas como :base, uma e base e a outra e tampo.
      def resolve_role_conflicts(mod)
        pieces = mod[:pieces]

        # Resolver laterais vs divisorias
        laterals = pieces.select { |p| p[:role] == :lateral }
        if laterals.length > 2
          # Ordenar por posicao X, as 2 extremas sao laterais, o resto divisorias
          sorted = laterals.sort_by { |p| p[:world_origin] ? p[:world_origin][0] : 0 }
          sorted[1..-2].each { |p| p[:role] = :divider }
        end

        # Resolver multiplas bases
        bases = pieces.select { |p| p[:role] == :base }
        if bases.length > 1
          sorted = bases.sort_by { |p| p[:world_origin] ? p[:world_origin][2] : 0 }
          # A mais baixa e base, a mais alta e tampo
          sorted.last[:role] = :top if sorted.length == 2
          # Se ha mais de 2, intermediarias sao prateleiras
          sorted[1..-2].each { |p| p[:role] = :shelf } if sorted.length > 2
        end

        # Resolver back panels: se ha mais de 1, manter apenas o mais fino
        backs = pieces.select { |p| p[:role] == :back }
        if backs.length > 1
          thinnest = backs.min_by { |p| p[:espessura] }
          backs.each { |p| p[:role] = :shelf unless p.equal?(thinnest) }
        end
      end

      # Retorna filhos de uma entidade
      def get_children(entity)
        if entity.is_a?(Sketchup::ComponentInstance)
          entity.definition.entities.to_a
        else
          entity.entities.to_a
        end
      end

      # Verifica se e grupo ou componente
      def group_or_component?(entity)
        entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
      end

      # Obtem nome da entidade
      def get_entity_name(entity)
        if entity.is_a?(Sketchup::ComponentInstance)
          name = entity.definition.name.to_s
          name = entity.name.to_s if name.empty?
          name.empty? ? 'Componente' : name
        else
          name = entity.name.to_s
          name.empty? ? 'Grupo' : name
        end
      end
    end
  end
end
