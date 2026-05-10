# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# BayDetector — Detecta vãos (volumes uteis) dentro de um modulo
#
# Fundacao da feature "mira de implantacao": dado um modulo
# (Sketchup::Group carimbado como tipo='modulo'), retorna a lista
# de Bays — sub-volumes ortogonais delimitados pelas pecas
# estruturais (lateral, base, top, divider, shelf, back_panel).
#
# Cada Bay carrega:
#   - bbox em coords locais do modulo (mm)
#   - dims (width/height/depth)
#   - vizinhos por face (top/bottom/left/right/back/front)
#     — role canonico (:shelf, :divider, :base, :top, :lateral,
#       :back_panel) ou nil quando a face e externa/aberta
#   - refs as pecas vizinhas (Sketchup::Group)
#
# Algoritmo (subtraction grid):
#   1. Coleta pecas estruturais + bbox de cada uma em mm
#   2. Bbox total do modulo = uniao de todas as pecas
#   3. Coleta planos X (laterais + dividers): bordas internas
#   4. Coleta planos Z (base + shelves + top): bordas internas
#   5. Y: planos da back_panel definem o limite traseiro do
#      volume util; frente fica aberta (sem plano)
#   6. Para cada celula (xL,xR) x (zL,zH) do grid: cria bbox
#      candidato, descarta se sobrepoe alguma peca estrutural,
#      descarta se alguma dim < MIN_BAY_DIM_MM
#   7. Para cada bay sobrevivente: detecta vizinhos por face
#
# Limitacoes (MVP):
#   - So vaos ortogonais (paralelos aos eixos do modulo)
#   - Modulo precisa estar alinhado aos eixos locais
#   - Pecas inclinadas/curvas nao sao tratadas
#   - Nao detecta sub-vaos de gaveteiros (drawer_side ainda nao
#     entra no conjunto estrutural — fica para a Sprint B)
# ═══════════════════════════════════════════════════════════════

require_relative '../core/role_normalizer'

module Ornato
  module Geometry
    # ─── BBox value object em mm (independente de SketchUp) ─────
    # Evita dependencia direta de Geom::BoundingBox para testar
    # standalone. Em runtime SketchUp, .from_skp converte.
    class BBox
      attr_reader :x_min, :y_min, :z_min, :x_max, :y_max, :z_max

      def initialize(x_min, y_min, z_min, x_max, y_max, z_max)
        @x_min = x_min.to_f; @y_min = y_min.to_f; @z_min = z_min.to_f
        @x_max = x_max.to_f; @y_max = y_max.to_f; @z_max = z_max.to_f
      end

      def width;  @x_max - @x_min; end
      def height; @z_max - @z_min; end
      def depth;  @y_max - @y_min; end
      def volume; width * height * depth; end
      def valid?; width > 0 && height > 0 && depth > 0; end
      def center
        [(@x_min + @x_max) / 2.0,
         (@y_min + @y_max) / 2.0,
         (@z_min + @z_max) / 2.0]
      end

      # Sobreposicao volumetrica com outra bbox (mm^3). 0 se nao ha.
      def overlap_volume(other)
        ix = [0.0, [x_max, other.x_max].min - [x_min, other.x_min].max].max
        iy = [0.0, [y_max, other.y_max].min - [y_min, other.y_min].max].max
        iz = [0.0, [z_max, other.z_max].min - [z_min, other.z_min].max].max
        ix * iy * iz
      end

      # Distancia entre uma face desta bbox e a peca mais proxima
      # naquele lado. side ∈ :left,:right,:bottom,:top,:back,:front
      def face_distance_to(other, side)
        case side
        when :left   then x_min - other.x_max
        when :right  then other.x_min - x_max
        when :bottom then z_min - other.z_max
        when :top    then other.z_min - z_max
        when :back   then other.y_min - y_max
        when :front  then y_min - other.y_max
        else Float::INFINITY
        end
      end

      # Convert from a Sketchup::BoundingBox-like (inches) to mm.
      def self.from_skp(bb)
        new(bb.min.x.to_mm, bb.min.y.to_mm, bb.min.z.to_mm,
            bb.max.x.to_mm, bb.max.y.to_mm, bb.max.z.to_mm)
      end

      # Translate bbox by (dx, dy, dz) mm
      def translate(dx, dy, dz)
        BBox.new(x_min + dx, y_min + dy, z_min + dz,
                 x_max + dx, y_max + dy, z_max + dz)
      end
    end

    # ─── Bay value object ───────────────────────────────────────
    class Bay
      attr_reader :id, :type, :bbox_local,
                  :neighbor_roles, :neighbor_pieces, :module_group

      def initialize(id:, type:, bbox_local:, neighbor_roles:,
                     neighbor_pieces:, module_group:)
        @id              = id
        @type            = type
        @bbox_local      = bbox_local
        @neighbor_roles  = neighbor_roles
        @neighbor_pieces = neighbor_pieces
        @module_group    = module_group
      end

      def width_mm;  @bbox_local.width;  end
      def height_mm; @bbox_local.height; end
      def depth_mm;  @bbox_local.depth;  end
      def volume_mm3; @bbox_local.volume; end

      def to_h
        {
          id: @id, type: @type,
          width_mm: width_mm.round(1),
          height_mm: height_mm.round(1),
          depth_mm: depth_mm.round(1),
          volume_mm3: volume_mm3.round(1),
          neighbor_roles: @neighbor_roles,
        }
      end
    end

    # ─── Detector ───────────────────────────────────────────────
    class BayDetector
      MIN_BAY_DIM_MM    = 50.0
      OVERLAP_TOL_MM3   = 1.0    # tolerancia volumetrica para "sobrepoe peca"
      NEIGHBOR_TOL_MM   = 2.0    # distancia maxima para considerar vizinho

      # Roles que delimitam o volume util do modulo
      STRUCTURAL_ROLES = %i[lateral base top divider shelf back_panel].freeze

      # @param module_group [Sketchup::Group | mock] container do modulo
      # @param piece_provider [Proc, nil] fn(module_group) → Array<{role:, bbox:, entity:}>
      #        (injetavel para testes; em SketchUp default usa piece_stamper + bounds)
      def initialize(module_group, piece_provider: nil)
        @module = module_group
        @piece_provider = piece_provider
      end

      def bays
        @bays ||= detect
      end

      private

      def detect
        pieces = collect_pieces
        return [] if pieces.empty?

        structural = pieces.select { |p| STRUCTURAL_ROLES.include?(p[:role]) }
        return [] if structural.empty?

        mod_bbox = module_bbox(structural)

        # Y: limite traseiro = back_panel.y_min se existir; senao mod_bbox.y_max
        backs = structural.select { |p| p[:role] == :back_panel }
        y_back = backs.empty? ? mod_bbox.y_max : backs.map { |p| p[:bbox].y_min }.min
        # Y front: nao ha porta no STRUCTURAL_ROLES, entao frente = mod_bbox.y_min
        y_front = mod_bbox.y_min

        # Planos X: faces internas das laterais + ambos os lados dos dividers
        x_planes = [mod_bbox.x_min, mod_bbox.x_max]
        structural.each do |p|
          next unless %i[lateral divider].include?(p[:role])
          x_planes << p[:bbox].x_min
          x_planes << p[:bbox].x_max
        end
        x_planes = x_planes.uniq.sort

        # Planos Z: faces internas de base/top/shelf
        z_planes = [mod_bbox.z_min, mod_bbox.z_max]
        structural.each do |p|
          next unless %i[base top shelf].include?(p[:role])
          z_planes << p[:bbox].z_min
          z_planes << p[:bbox].z_max
        end
        z_planes = z_planes.uniq.sort

        candidates = []
        x_planes.each_cons(2) do |xL, xR|
          z_planes.each_cons(2) do |zL, zH|
            cand = BBox.new(xL, y_front, zL, xR, y_back, zH)
            next unless cand.valid?
            next unless bay_dims_ok?(cand)
            next if overlaps_any_piece?(cand, structural)
            candidates << cand
          end
        end

        # Merge adjacente nao implementado no MVP; cada celula ja e um bay distinto.
        candidates.each_with_index.map do |bbox, i|
          neighbors = detect_neighbors(bbox, structural)
          Bay.new(
            id: "bay_#{i + 1}",
            type: :interior_bay,
            bbox_local: bbox,
            neighbor_roles: neighbors[:roles],
            neighbor_pieces: neighbors[:pieces],
            module_group: @module,
          )
        end
      end

      # Provider: ou injetado (testes), ou via PieceStamper (SketchUp).
      def collect_pieces
        return @piece_provider.call(@module) if @piece_provider

        # Caminho SketchUp real
        ents = if @module.respond_to?(:entities)
                 @module.entities
               elsif @module.respond_to?(:definition) && @module.definition
                 @module.definition.entities
               else
                 []
               end

        result = []
        ents.each do |ent|
          next unless ent.respond_to?(:get_attribute)
          tipo = ent.get_attribute('Ornato', 'tipo', nil)
          next unless tipo == 'peca'
          role = Ornato::Core::RoleNormalizer.from_entity(ent)
          bb_skp = ent.respond_to?(:bounds) ? ent.bounds : nil
          next unless bb_skp
          result << { role: role, bbox: BBox.from_skp(bb_skp), entity: ent }
        end
        result
      end

      def module_bbox(pieces)
        x_min = pieces.map { |p| p[:bbox].x_min }.min
        y_min = pieces.map { |p| p[:bbox].y_min }.min
        z_min = pieces.map { |p| p[:bbox].z_min }.min
        x_max = pieces.map { |p| p[:bbox].x_max }.max
        y_max = pieces.map { |p| p[:bbox].y_max }.max
        z_max = pieces.map { |p| p[:bbox].z_max }.max
        BBox.new(x_min, y_min, z_min, x_max, y_max, z_max)
      end

      def bay_dims_ok?(bbox)
        bbox.width  >= MIN_BAY_DIM_MM &&
          bbox.height >= MIN_BAY_DIM_MM &&
          bbox.depth  >= MIN_BAY_DIM_MM
      end

      def overlaps_any_piece?(bbox, pieces)
        pieces.any? { |p| bbox.overlap_volume(p[:bbox]) > OVERLAP_TOL_MM3 }
      end

      # Para cada lado, encontra a peca mais proxima (face encostada).
      def detect_neighbors(bbox, pieces)
        sides = %i[top bottom left right back front]
        roles  = {}
        refs   = {}

        sides.each do |side|
          best = nil
          best_dist = Float::INFINITY
          pieces.each do |p|
            d = bbox.face_distance_to(p[:bbox], side)
            next unless d.finite?
            next if d < -NEIGHBOR_TOL_MM   # peca atras / sobreposta — ignora
            next if d > NEIGHBOR_TOL_MM    # nao encostada
            next unless overlaps_face_extent?(bbox, p[:bbox], side)
            if d.abs < best_dist
              best_dist = d.abs
              best = p
            end
          end
          roles[side] = best ? best[:role] : nil
          refs[side]  = best ? best[:entity] : nil
        end

        { roles: roles, pieces: refs }
      end

      # Verifica se a peca cobre minimamente a "area" da face em
      # questao do bay. Evita classificar uma prateleira distante
      # lateralmente como vizinha de cima.
      def overlaps_face_extent?(bay, piece, side)
        case side
        when :top, :bottom
          ox = [0.0, [bay.x_max, piece.x_max].min - [bay.x_min, piece.x_min].max].max
          oy = [0.0, [bay.y_max, piece.y_max].min - [bay.y_min, piece.y_min].max].max
          ox > 1.0 && oy > 1.0
        when :left, :right
          oy = [0.0, [bay.y_max, piece.y_max].min - [bay.y_min, piece.y_min].max].max
          oz = [0.0, [bay.z_max, piece.z_max].min - [bay.z_min, piece.z_min].max].max
          oy > 1.0 && oz > 1.0
        when :back, :front
          ox = [0.0, [bay.x_max, piece.x_max].min - [bay.x_min, piece.x_min].max].max
          oz = [0.0, [bay.z_max, piece.z_max].min - [bay.z_min, piece.z_min].max].max
          ox > 1.0 && oz > 1.0
        else
          false
        end
      end
    end
  end
end
