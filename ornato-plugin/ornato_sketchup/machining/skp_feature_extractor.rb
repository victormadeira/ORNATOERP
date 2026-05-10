# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# SkpFeatureExtractor — Extrator de features de furação .skp WPS
#
# Lê a geometria (faces + edges) de uma `Sketchup::ComponentDefinition`
# importada da biblioteca WPS (ferragens, puxadores, acessórios) e
# devolve uma lista de features de usinagem que serão emitidas como
# operações CNC pelo exportador UPM (`machining_json.rb`).
#
# CONTEXTO DO PIPELINE
#   Etapa [4] de PIPELINE_FURACOES_3D.md. As componentes de WPS
#   carregadas no SketchUp já contêm furos modelados (cilindros,
#   slots, recortes). Esta classe identifica essas features puramente
#   geometricamente, sem confiar em metadados — o que existir como
#   forma é o que vai pro G-code.
#
# RESPONSABILIDADES (e o que NÃO faz)
#   ✓ Detectar furos passantes (cilindros que atravessam o sólido)
#   ✓ Detectar furos cegos (cilindro com tampa de fundo)
#   ✓ Detectar rasgos/slots (loop oblongo extrudado)
#   ✓ Detectar recortes (loops fechados não circulares extrudados)
#   ✗ Não transforma para coords da peça-âncora (responsabilidade do
#     exportador UPM, etapa [4b])
#   ✗ Não emite JSON UPM (Agente F faz isso em machining_json.rb)
#   ✗ Não modifica a definição
#
# API PÚBLICA
#   extractor = Ornato::Machining::SkpFeatureExtractor.new(definition)
#   features  = extractor.extract
#
#   features → Array<Hash>:
#     {
#       tipo: :furo_passante | :furo_cego | :rasgo_slot | :recorte | :desconhecido,
#       center: Geom::Point3d,           # local-space (definition coords)
#       normal: Geom::Vector3d,          # eixo do furo (unit vector)
#       diametro_mm: Float | nil,        # nil para slots/recortes
#       profundidade_mm: Float,
#       bbox: Geom::BoundingBox,
#       confidence: Float,               # 0.0..1.0
#       raw_face_count: Integer,
#       notes: String
#     }
#
# EXEMPLO DE USO (dentro do SketchUp)
#   defn = Sketchup.active_model.definitions['dobradica_amor_cj']
#   feats = Ornato::Machining::SkpFeatureExtractor.new(defn).extract
#   feats.each { |f| puts "#{f[:tipo]}  Ø#{f[:diametro_mm]}  z=#{f[:profundidade_mm]}" }
#
# LIMITAÇÕES CONHECIDAS
#   - Furos oblíquos (eixo não-cardinal) podem reduzir confidence
#   - Componentes nested são percorridos só 1 nível abaixo (sem
#     entrar em sub-grupos profundos)
#   - Slots com cantos suavizados (fillet) podem ser classificados
#     como :desconhecido
#   - Edges sem `curve` pareadas (ex: círculo modelado com 4 segmentos
#     retos) caem em :recorte ou :desconhecido — heurística exige
#     >= 6 segmentos curvos pra considerar círculo
#   - Tudo é em coords LOCAIS da definition, sem aplicar transformação
#     da instância
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Machining
    class SkpFeatureExtractor

      # Tolerâncias geométricas
      CIRCLE_MIN_SEGMENTS    = 6      # mínimo de edges curvas pra ser círculo
      CIRCLE_RADIUS_TOL_MM   = 0.5    # variação max de raio
      PARALLEL_NORMAL_DOT    = 0.985  # ~10° → faces consideradas paralelas
      MIN_HOLE_DIAMETER_MM   = 2.0    # ignora detalhes < 2mm
      MAX_HOLE_DIAMETER_MM   = 80.0   # ignora círculos enormes (não são furo)
      INCH_TO_MM             = 25.4

      # @param definition [Sketchup::ComponentDefinition, #entities]
      def initialize(definition)
        @definition = definition
      end

      # Ponto de entrada: devolve Array<Hash> de features.
      # Robusto: nunca propaga exceção — retorna [] em qualquer falha.
      def extract
        return [] if @definition.nil?
        return [] unless @definition.respond_to?(:entities)

        entities = @definition.entities
        return [] if entities.nil? || entities_empty?(entities)

        circle_loops = collect_circle_loops(entities)
        polygon_loops = collect_polygon_loops(entities)

        features = []
        features.concat(extract_holes(circle_loops))
        features.concat(extract_slots_and_pockets(polygon_loops))

        features
      rescue StandardError => e
        warn "Ornato::Machining::SkpFeatureExtractor#extract erro: #{e.message}"
        []
      end

      # ────────────────────────────────────────────────────────────
      private

      def entities_empty?(entities)
        entities.respond_to?(:length) ? entities.length.zero? : entities.to_a.empty?
      end

      # ── Circle loops ───────────────────────────────────────────
      # Devolve Array<Hash> { face:, loop:, center:, normal:, radius_mm:, segment_count: }
      def collect_circle_loops(entities)
        out = []
        each_face(entities) do |face|
          next unless face.respond_to?(:loops)

          face.loops.each do |loop|
            data = analyze_loop_as_circle(loop, face)
            out << data if data
          end
        end
        out
      end

      def analyze_loop_as_circle(loop, face)
        edges = loop.edges
        return nil if edges.nil? || edges.length < CIRCLE_MIN_SEGMENTS

        # Todas as edges precisam pertencer a uma curva (ArcCurve no SketchUp)
        curved = edges.count { |e| e.respond_to?(:curve) && e.curve }
        return nil if curved < CIRCLE_MIN_SEGMENTS

        pts = edges.map { |e| e.start.position }.compact
        return nil if pts.empty?

        center = average_point(pts)
        radii  = pts.map { |p| p.distance(center).to_f }
        r_avg  = radii.inject(0.0, :+) / radii.length
        r_avg_mm = inch_to_mm(r_avg)

        # Variação de raio precisa ser pequena (caso contrário não é círculo)
        max_dev = radii.map { |r| (r - r_avg).abs }.max
        return nil if inch_to_mm(max_dev) > CIRCLE_RADIUS_TOL_MM

        diameter_mm = r_avg_mm * 2.0
        return nil if diameter_mm < MIN_HOLE_DIAMETER_MM
        return nil if diameter_mm > MAX_HOLE_DIAMETER_MM

        normal = face_normal(face)
        return nil unless normal

        {
          face:           face,
          loop:           loop,
          center:         center,
          normal:         normal,
          radius_mm:      r_avg_mm,
          diameter_mm:    diameter_mm,
          segment_count:  edges.length,
        }
      end

      # ── Polygon (não-circular) loops ───────────────────────────
      # Captura loops fechados que não classificamos como círculo —
      # candidatos a slot, recorte, pocket retangular.
      def collect_polygon_loops(entities)
        out = []
        each_face(entities) do |face|
          next unless face.respond_to?(:loops)
          face.loops.each do |loop|
            next if analyze_loop_as_circle(loop, face) # já é círculo
            edges = loop.edges
            next if edges.nil? || edges.empty?

            normal = face_normal(face)
            next unless normal

            out << {
              face:    face,
              loop:    loop,
              edges:   edges,
              normal:  normal,
              bbox:    loop_bbox(loop),
            }
          end
        end
        out
      end

      # ── Hole pairing ───────────────────────────────────────────
      # Para cada círculo encontrado, procura outro círculo paralelo
      # com mesmo eixo. Se par encontrado → furo (passante ou cego);
      # se não → furo isolado de profundidade desconhecida (estimada).
      def extract_holes(circle_loops)
        return [] if circle_loops.empty?

        used = Array.new(circle_loops.length, false)
        features = []

        circle_loops.each_with_index do |c1, i|
          next if used[i]

          partner_idx = find_paired_circle(circle_loops, i, used)

          if partner_idx
            c2 = circle_loops[partner_idx]
            used[i] = true
            used[partner_idx] = true
            features << build_paired_hole(c1, c2)
          else
            used[i] = true
            features << build_isolated_hole(c1)
          end
        end

        features
      end

      def find_paired_circle(circles, base_idx, used)
        c1 = circles[base_idx]
        circles.each_with_index do |c2, j|
          next if j == base_idx || used[j]
          next unless normals_parallel?(c1[:normal], c2[:normal])
          next if (c1[:diameter_mm] - c2[:diameter_mm]).abs > 0.5

          # Centros precisam estar no mesmo eixo
          axis = c1[:normal]
          delta = c2[:center] - c1[:center]
          next if delta.length.to_f < 1e-6
          # Componente perpendicular ao eixo deve ser ~0
          axial_proj = delta.dot(axis)
          radial = Math.sqrt([delta.length * delta.length - axial_proj * axial_proj, 0.0].max)
          next if inch_to_mm(radial) > 0.3

          return j
        end
        nil
      end

      def build_paired_hole(c1, c2)
        depth_inch = c1[:center].distance(c2[:center]).to_f
        depth_mm   = inch_to_mm(depth_inch)

        # Convencionar center = média dos dois para furos (centro do canal)
        center = average_point([c1[:center], c2[:center]])
        bbox = Geom::BoundingBox.new
        bbox.add(c1[:center])
        bbox.add(c2[:center])

        # Heurística: se a profundidade é "grande" relativa ao diâmetro,
        # é provavelmente passante. Caso contrário, classificamos como
        # cego (mesmo que possa ser passante curto). A distinção fina
        # exige saber a espessura da peça-âncora — fora do escopo aqui.
        ratio = depth_mm / [c1[:diameter_mm], 1.0].max
        tipo = ratio >= 1.0 ? :furo_passante : :furo_cego

        {
          tipo:            tipo,
          center:          center,
          normal:          c1[:normal],
          diametro_mm:     c1[:diameter_mm].round(2),
          profundidade_mm: depth_mm.round(2),
          bbox:            bbox,
          confidence:      0.9,
          raw_face_count:  2,
          notes:           "círculo #{c1[:segment_count]}seg ⌀#{c1[:diameter_mm].round(2)}mm × prof #{depth_mm.round(2)}mm (par)",
        }
      end

      # Furo cuja contraparte não foi encontrada — provavelmente:
      #   - furo cego cuja face de fundo é tampa não-circular
      #   - furo modelado parcialmente (cap único)
      # Profundidade fica como 0 (a ser refinada pelo Agente F via
      # bbox da definition vs eixo do furo).
      def build_isolated_hole(c)
        bbox = Geom::BoundingBox.new
        bbox.add(c[:center])

        {
          tipo:            :furo_cego,
          center:          c[:center],
          normal:          c[:normal],
          diametro_mm:     c[:diameter_mm].round(2),
          profundidade_mm: 0.0,
          bbox:            bbox,
          confidence:      0.5,
          raw_face_count:  1,
          notes:           "círculo isolado #{c[:segment_count]}seg ⌀#{c[:diameter_mm].round(2)}mm — sem par, profundidade indefinida",
        }
      end

      # ── Slot / Pocket / Recorte ────────────────────────────────
      # Heurística:
      #   • slot oblongo: 4 edges, sendo 2 retas + 2 arcos
      #   • recorte: loop fechado puramente reto (>= 3 edges retas)
      #   • outros: :desconhecido
      def extract_slots_and_pockets(polygon_loops)
        return [] if polygon_loops.empty?

        features = []

        polygon_loops.each do |pl|
          straight = pl[:edges].count { |e| !(e.respond_to?(:curve) && e.curve) }
          curved   = pl[:edges].length - straight
          bbox     = pl[:bbox]

          if curved >= 2 && straight >= 2 && pl[:edges].length <= 8
            # Slot oblongo
            w = inch_to_mm([bbox.width, bbox.height, bbox.depth].min)
            l = inch_to_mm([bbox.width, bbox.height, bbox.depth].sort[1])
            next if w < MIN_HOLE_DIAMETER_MM
            next if w > MAX_HOLE_DIAMETER_MM * 1.5

            features << {
              tipo:            :rasgo_slot,
              center:          bbox.center,
              normal:          pl[:normal],
              diametro_mm:     w.round(2),  # diâmetro = largura do slot
              profundidade_mm: 0.0,         # extrusão precisa ser inferida
              bbox:            bbox,
              confidence:      0.75,
              raw_face_count:  1,
              notes:           "slot #{w.round(1)}×#{l.round(1)}mm (#{straight}reta+#{curved}arco)",
            }
          elsif curved.zero? && straight >= 3
            # Recorte poligonal (retângulo, recorte de fechadura, etc.)
            # Exigir tamanho mínimo pra evitar ruído de geometria
            w = inch_to_mm([bbox.width, bbox.height, bbox.depth].min)
            l = inch_to_mm([bbox.width, bbox.height, bbox.depth].sort[1])
            next if l < MIN_HOLE_DIAMETER_MM * 2
            next if w > MAX_HOLE_DIAMETER_MM * 4

            features << {
              tipo:            :recorte,
              center:          bbox.center,
              normal:           pl[:normal],
              diametro_mm:     nil,
              profundidade_mm: 0.0,
              bbox:            bbox,
              confidence:      0.6,
              raw_face_count:  1,
              notes:           "recorte poligonal #{straight}lados #{w.round(1)}×#{l.round(1)}mm",
            }
          else
            # Algo estranho — marca como desconhecido com confiança baixa
            w = inch_to_mm([bbox.width, bbox.height, bbox.depth].min)
            l = inch_to_mm([bbox.width, bbox.height, bbox.depth].sort[1])
            next if l < MIN_HOLE_DIAMETER_MM

            features << {
              tipo:            :desconhecido,
              center:          bbox.center,
              normal:          pl[:normal],
              diametro_mm:     nil,
              profundidade_mm: 0.0,
              bbox:            bbox,
              confidence:      0.3,
              raw_face_count:  1,
              notes:           "loop #{straight}reta+#{curved}arco #{w.round(1)}×#{l.round(1)}mm — não classificado",
            }
          end
        end

        features
      end

      # ── Helpers geométricos ────────────────────────────────────

      def each_face(entities)
        # SketchUp::Entities responde a `grep`. Em mocks/teste pode ser
        # um array simples — então usamos `select` defensivamente.
        if entities.respond_to?(:grep)
          entities.grep(Sketchup::Face) { |f| yield f } if defined?(Sketchup::Face)
          # Em ambientes mock onde Sketchup::Face não existe, cair pro select
          unless defined?(Sketchup::Face)
            entities.each { |e| yield e if e.respond_to?(:loops) }
          end
        else
          entities.each { |e| yield e if e.respond_to?(:loops) }
        end
      end

      def face_normal(face)
        n = face.respond_to?(:normal) ? face.normal : nil
        return nil unless n
        return nil if n.respond_to?(:length) && n.length.to_f < 1e-9

        if n.respond_to?(:normalize)
          n.normalize
        else
          n
        end
      end

      def normals_parallel?(n1, n2)
        return false unless n1 && n2
        d = n1.dot(n2).abs
        d >= PARALLEL_NORMAL_DOT
      end

      def average_point(points)
        n = points.length.to_f
        sx = points.inject(0.0) { |a, p| a + p.x.to_f }
        sy = points.inject(0.0) { |a, p| a + p.y.to_f }
        sz = points.inject(0.0) { |a, p| a + p.z.to_f }
        Geom::Point3d.new(sx / n, sy / n, sz / n)
      end

      def loop_bbox(loop)
        bb = Geom::BoundingBox.new
        loop.edges.each do |e|
          bb.add(e.start.position)
          bb.add(e.end.position)
        end
        bb
      end

      # SketchUp guarda comprimentos em polegadas (Length). Convertemos
      # explicitamente — `to_mm` é extension do SketchUp não disponível
      # em standalone Ruby. Mantemos puro pra ser testável.
      def inch_to_mm(v)
        v.to_f * INCH_TO_MM
      end

    end
  end
end
