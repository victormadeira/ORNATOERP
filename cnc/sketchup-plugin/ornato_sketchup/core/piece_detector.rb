# ═══════════════════════════════════════════════════════
# PieceDetector — Detecta paineis retangulares de moveis
# Analisa BoundingBox para identificar chapas (uma dimensao
# muito menor que as outras = espessura). Filtra geometria
# que nao e painel (puxadores, adornos, ferragens).
# ═══════════════════════════════════════════════════════

module Ornato
  module Core
    class PieceDetector
      # Limites de espessura para considerar como painel de marcenaria (mm)
      MIN_THICKNESS = 2.0
      MAX_THICKNESS = 50.0

      # Dimensao minima para considerar como peca real (mm)
      MIN_PANEL_DIMENSION = 50.0

      # Ratio maximo espessura/menor_dimensao para ser painel
      # (espessura deve ser significativamente menor que as outras dims)
      MAX_THICKNESS_RATIO = 0.35

      # Area minima do painel em mm2 (filtra pecas muito pequenas)
      MIN_PANEL_AREA = 2500.0

      def initialize(options = {})
        @min_thickness = options[:min_thickness] || MIN_THICKNESS
        @max_thickness = options[:max_thickness] || MAX_THICKNESS
        @min_dimension = options[:min_panel_dimension] || MIN_PANEL_DIMENSION
        @max_ratio = options[:max_thickness_ratio] || MAX_THICKNESS_RATIO
        @min_area = options[:min_panel_area] || MIN_PANEL_AREA
      end

      # Detecta todos os paineis dentro de um conjunto de entidades SketchUp.
      # Retorna array de hashes com informacoes de cada peca.
      #
      # @param entities [Sketchup::Entities] entidades a analisar
      # @param parent_module [Hash, nil] modulo pai (se houver)
      # @return [Array<Hash>] lista de pecas detectadas
      def detect(entities, parent_module: nil)
        pieces = []

        entities.each do |entity|
          next unless group_or_component?(entity)

          # Pular entidades que contem sub-grupos (sao modulos, nao pecas)
          next if contains_sub_groups?(entity)

          piece = analyze_entity(entity, parent_module)
          pieces << piece if piece
        end

        pieces
      end

      # Analisa uma unica entidade e retorna info de peca se for painel.
      #
      # @param entity [Sketchup::Group, Sketchup::ComponentInstance]
      # @param parent_module [Hash, nil]
      # @return [Hash, nil] informacoes da peca ou nil se nao for painel
      def analyze_entity(entity, parent_module = nil)
        return nil unless group_or_component?(entity)

        bb = entity.bounds
        return nil if bb.empty?

        # Extrair dimensoes em mm e ordenar
        dims_mm = extract_dimensions_mm(bb)
        sorted = dims_mm.sort

        thickness = sorted[0]
        width = sorted[1]
        length = sorted[2]

        # Validar se e painel
        return nil unless valid_panel?(thickness, width, length)

        # Determinar orientacao do painel (qual eixo e a espessura)
        orientation = detect_orientation(bb, thickness)

        # Detectar material aplicado
        material = detect_material(entity)

        # Calcular posicao real no modelo (considerando transformacao)
        world_position = calculate_world_position(entity)

        # Detectar faces do painel para analise posterior
        face_info = analyze_faces(entity)

        {
          group: entity,
          name: get_entity_name(entity),
          persistent_id: generate_persistent_id(entity),
          module_name: parent_module ? parent_module[:name] : 'Avulso',
          module_group: parent_module ? parent_module[:group] : nil,
          comprimento: length.round(1),
          largura: width.round(1),
          espessura: thickness.round(1),
          orientation: orientation,
          material: material,
          material_name: material&.display_name,
          grain: detect_grain(material),
          bounds: bb,
          transformation: entity.transformation,
          world_origin: world_position,
          face_count: face_info[:face_count],
          is_rectangular: face_info[:is_rectangular],
          is_panel: true,
        }
      end

      # Verifica se a entidade parece ser um painel (sem analise detalhada).
      # Util para filtragem rapida antes de analise completa.
      #
      # @param entity [Sketchup::Group, Sketchup::ComponentInstance]
      # @return [Boolean]
      def panel?(entity)
        return false unless group_or_component?(entity)

        bb = entity.bounds
        return false if bb.empty?

        dims = extract_dimensions_mm(bb).sort
        valid_panel?(dims[0], dims[1], dims[2])
      end

      private

      # Valida se as dimensoes correspondem a um painel de marcenaria
      def valid_panel?(thickness, width, length)
        # Espessura dentro dos limites de chapa
        return false if thickness < @min_thickness
        return false if thickness > @max_thickness

        # Dimensoes uteis minimas
        return false if width < @min_dimension
        return false if length < @min_dimension

        # Ratio espessura/largura — painel deve ser fino relativo ao tamanho
        return false if width > 0 && (thickness / width) > @max_ratio

        # Area minima
        area = width * length
        return false if area < @min_area

        true
      end

      # Determina qual eixo do BoundingBox corresponde a espessura
      # Retorna :x, :y ou :z indicando o eixo da menor dimensao
      def detect_orientation(bb, thickness)
        w = bb.width.to_mm
        h = bb.height.to_mm
        d = bb.depth.to_mm

        tolerance = 0.5 # mm

        if (w - thickness).abs < tolerance
          :x  # Painel no plano YZ (ex: lateral/divisoria vertical)
        elsif (d - thickness).abs < tolerance
          :y  # Painel no plano XZ (ex: traseira)
        elsif (h - thickness).abs < tolerance
          :z  # Painel no plano XY (ex: base/tampo/prateleira)
        else
          # Caso ambiguo: usar a menor dimensao
          min_val = [w, h, d].min
          if min_val == w then :x
          elsif min_val == d then :y
          else :z
          end
        end
      end

      # Extrai dimensoes do BoundingBox em milimetros
      def extract_dimensions_mm(bb)
        [bb.width.to_mm, bb.height.to_mm, bb.depth.to_mm]
      end

      # Detecta material aplicado na entidade (entidade > faces)
      def detect_material(entity)
        # Primeiro: material da entidade
        mat = entity.material
        return mat if mat

        # Segundo: material da maior face
        faces = get_faces(entity)
        return nil if faces.empty?

        # Ordenar faces por area e pegar material da maior
        faces_with_material = faces.select(&:material).sort_by { |f| -f.area }
        return faces_with_material.first.material unless faces_with_material.empty?

        # Terceiro: material de qualquer face
        nil
      end

      # Detecta direcao do veio baseado no nome do material
      def detect_grain(material)
        return 'sem_veio' unless material

        name = material.display_name.downcase
        return 'horizontal' if name =~ /horizontal|hz|h$/
        return 'vertical' if name =~ /vertical|vt|v$/

        'sem_veio'
      end

      # Calcula posicao no mundo considerando transformacoes aninhadas
      def calculate_world_position(entity)
        origin = entity.bounds.min
        transformed = entity.transformation * origin
        [transformed.x.to_mm.round(1), transformed.y.to_mm.round(1), transformed.z.to_mm.round(1)]
      end

      # Analisa as faces da entidade para determinar se e retangular
      def analyze_faces(entity)
        faces = get_faces(entity)

        {
          face_count: faces.length,
          # Um solido retangular (caixa) tem exatamente 6 faces
          is_rectangular: faces.length == 6 && faces.all? { |f| f.vertices.length == 4 },
        }
      end

      # Retorna todas as faces de uma entidade
      def get_faces(entity)
        ents = if entity.is_a?(Sketchup::ComponentInstance)
                 entity.definition.entities
               else
                 entity.entities
               end
        ents.grep(Sketchup::Face)
      end

      # Verifica se entidade e grupo ou componente
      def group_or_component?(entity)
        entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
      end

      # Verifica se entidade contem sub-grupos (indica que e modulo, nao peca)
      def contains_sub_groups?(entity)
        children = if entity.is_a?(Sketchup::ComponentInstance)
                     entity.definition.entities
                   else
                     entity.entities
                   end
        children.any? { |c| c.is_a?(Sketchup::Group) || c.is_a?(Sketchup::ComponentInstance) }
      end

      # Obtem nome descritivo da entidade
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

      # Gera ID persistente baseado em posicao e dimensoes
      def generate_persistent_id(entity)
        bb = entity.bounds
        key = "#{bb.min.x.to_mm.round(0)}_#{bb.min.y.to_mm.round(0)}_#{bb.min.z.to_mm.round(0)}" \
              "_#{bb.width.to_mm.round(0)}x#{bb.height.to_mm.round(0)}x#{bb.depth.to_mm.round(0)}"
        "pc_#{Digest::MD5.hexdigest(key)[0..7]}"
      rescue
        "pc_#{rand(100000..999999)}"
      end
    end
  end
end
