# ═══════════════════════════════════════════════════════
# JointDetector — Detecta juncoes entre pecas de moveis
# Analisa proximidade de BoundingBoxes para encontrar
# faces em contato. Classifica tipo de juncao:
#   :butt    — face contra borda (lateral+base, minifix/cavilha)
#   :overlay — face contra face (porta sobreposta, dobradica)
#   :dado    — encaixe em canal (fundo em rebaixo)
# ═══════════════════════════════════════════════════════

module Ornato
  module Core
    # Estrutura para representar uma juncao entre duas pecas
    Joint = Struct.new(
      :piece_a,        # Hash da peca A
      :piece_b,        # Hash da peca B
      :type,           # :butt, :overlay, :dado
      :face_a,         # Face de contato em A (:top, :bottom, :left, :right, :front, :back)
      :face_b,         # Face de contato em B
      :contact_area,   # Area de contato em mm2
      :offset,         # Offset da borda (mm) — para encaixes rebaixados
      keyword_init: true
    ) do
      # Verifica se esta juncao envolve uma peca especifica
      def involves?(piece)
        piece_a.equal?(piece) || piece_b.equal?(piece)
      end

      # Retorna a peca parceira dado uma das pecas
      def partner_of(piece)
        if piece_a.equal?(piece)
          piece_b
        elsif piece_b.equal?(piece)
          piece_a
        end
      end

      # Retorna o role da peca parceira
      def partner_role(piece)
        partner = partner_of(piece)
        partner ? partner[:role] : nil
      end

      # Retorna a face de contato de uma peca especifica
      def contact_face_of(piece)
        if piece_a.equal?(piece)
          face_a
        elsif piece_b.equal?(piece)
          face_b
        end
      end
    end

    class JointDetector
      # Tolerancia para considerar faces em contato (mm)
      PROXIMITY_TOLERANCE = 1.0

      # Tolerancia para considerar encaixe parcial / dado (mm)
      DADO_TOLERANCE = 2.0

      # Sobreposicao minima para considerar contato valido (mm)
      MIN_OVERLAP = 10.0

      # Area minima de contato para considerar juncao real (mm2)
      MIN_CONTACT_AREA = 100.0

      def initialize(options = {})
        @tolerance = options[:tolerance] || PROXIMITY_TOLERANCE
        @dado_tolerance = options[:dado_tolerance] || DADO_TOLERANCE
        @min_overlap = options[:min_overlap] || MIN_OVERLAP
        @min_contact_area = options[:min_contact_area] || MIN_CONTACT_AREA
      end

      # Detecta todas as juncoes entre um conjunto de pecas.
      # Testa cada par de pecas para proximidade de faces.
      #
      # @param pieces [Array<Hash>] lista de pecas (do PieceDetector)
      # @return [Array<Joint>] lista de juncoes detectadas
      def detect(pieces)
        joints = []

        pieces.combination(2).each do |piece_a, piece_b|
          joint = detect_joint(piece_a, piece_b)
          joints << joint if joint
        end

        joints
      end

      # Detecta juncao entre duas pecas especificas.
      #
      # @param piece_a [Hash] peca A
      # @param piece_b [Hash] peca B
      # @return [Joint, nil] juncao ou nil se nao ha contato
      def detect_joint(piece_a, piece_b)
        bb_a = piece_a[:bounds]
        bb_b = piece_b[:bounds]

        # Extrair as 6 faces de cada BoundingBox como planos
        faces_a = extract_box_faces(bb_a)
        faces_b = extract_box_faces(bb_b)

        best_contact = nil
        best_area = 0

        # Testar cada combinacao de face A com face B
        faces_a.each do |fa_name, fa|
          faces_b.each do |fb_name, fb|
            contact = check_face_contact(fa, fb, fa_name, fb_name, bb_a, bb_b)
            next unless contact
            next unless contact[:area] > best_area

            best_contact = contact
            best_area = contact[:area]
          end
        end

        return nil unless best_contact
        return nil if best_contact[:area] < @min_contact_area

        # Classificar tipo de juncao
        joint_type = classify_joint(
          best_contact[:face_a_type],
          best_contact[:face_b_type],
          piece_a, piece_b, best_contact
        )

        Joint.new(
          piece_a: piece_a,
          piece_b: piece_b,
          type: joint_type,
          face_a: best_contact[:face_a],
          face_b: best_contact[:face_b],
          contact_area: best_contact[:area].round(1),
          offset: best_contact[:offset].round(1)
        )
      end

      private

      # Extrai as 6 faces do BoundingBox como coordenadas de plano.
      # Cada face e representada por sua posicao no eixo normal e os limites nos outros eixos.
      #
      # @param bb [Geom::BoundingBox]
      # @return [Hash] face_name => { axis, position, range_u, range_v, normal_dir }
      def extract_box_faces(bb)
        min = bb.min
        max = bb.max

        x0 = min.x.to_mm
        y0 = min.y.to_mm
        z0 = min.z.to_mm
        x1 = max.x.to_mm
        y1 = max.y.to_mm
        z1 = max.z.to_mm

        {
          left:   { axis: :x, pos: x0, dir: -1, u_range: [y0, y1], v_range: [z0, z1] },
          right:  { axis: :x, pos: x1, dir: +1, u_range: [y0, y1], v_range: [z0, z1] },
          front:  { axis: :y, pos: y0, dir: -1, u_range: [x0, x1], v_range: [z0, z1] },
          back:   { axis: :y, pos: y1, dir: +1, u_range: [x0, x1], v_range: [z0, z1] },
          bottom: { axis: :z, pos: z0, dir: -1, u_range: [x0, x1], v_range: [y0, y1] },
          top:    { axis: :z, pos: z1, dir: +1, u_range: [x0, x1], v_range: [y0, y1] },
        }
      end

      # Verifica se duas faces de BoundingBoxes estao em contato.
      # Duas faces estao em contato quando:
      #  1. Estao no mesmo eixo (ambas faces X, ou ambas Y, ou ambas Z)
      #  2. Estao proximas (distancia < tolerancia)
      #  3. Se sobrepoem nos outros dois eixos
      #
      # @return [Hash, nil] info de contato ou nil
      def check_face_contact(fa, fb, fa_name, fb_name, bb_a, bb_b)
        # Faces devem ser no mesmo eixo para estarem em contato
        return nil unless fa[:axis] == fb[:axis]

        # Faces devem estar viradas uma para a outra (normais opostas)
        return nil unless fa[:dir] != fb[:dir]

        # Distancia entre as faces
        distance = (fa[:pos] - fb[:pos]).abs

        # Verificar se estao proximas (contato direto)
        is_direct_contact = distance <= @tolerance

        # Verificar se e encaixe parcial (dado/rebaixo)
        is_dado_contact = !is_direct_contact && distance <= @dado_tolerance

        return nil unless is_direct_contact || is_dado_contact

        # Calcular sobreposicao nos eixos U e V
        overlap_u = calculate_overlap(fa[:u_range], fb[:u_range])
        overlap_v = calculate_overlap(fa[:v_range], fb[:v_range])

        return nil if overlap_u < @min_overlap || overlap_v < @min_overlap

        area = overlap_u * overlap_v

        # Determinar se e face (grande) ou borda (estreita) de cada peca
        fa_type = face_or_edge?(fa_name, bb_a)
        fb_type = face_or_edge?(fb_name, bb_b)

        {
          face_a: fa_name,
          face_b: fb_name,
          face_a_type: fa_type,
          face_b_type: fb_type,
          area: area,
          distance: distance,
          offset: is_dado_contact ? distance : 0.0,
          overlap_u: overlap_u,
          overlap_v: overlap_v,
        }
      end

      # Calcula sobreposicao entre dois intervalos 1D
      #
      # @param range_a [Array(Float, Float)] [min, max]
      # @param range_b [Array(Float, Float)] [min, max]
      # @return [Float] comprimento da sobreposicao (0 se nao sobrepoem)
      def calculate_overlap(range_a, range_b)
        overlap_min = [range_a[0], range_b[0]].max
        overlap_max = [range_a[1], range_b[1]].min
        overlap = overlap_max - overlap_min
        overlap > 0 ? overlap : 0.0
      end

      # Determina se uma face do BoundingBox e a face principal (larga)
      # ou uma borda (estreita/espessura) da peca.
      # Face principal: as duas dimensoes da face sao ambas grandes.
      # Borda: uma das dimensoes da face e a espessura da peca.
      #
      # @param face_name [Symbol] :left, :right, :front, :back, :top, :bottom
      # @param bb [Geom::BoundingBox]
      # @return [Symbol] :face ou :edge
      def face_or_edge?(face_name, bb)
        w = bb.width.to_mm
        h = bb.height.to_mm
        d = bb.depth.to_mm
        dims = [w, h, d]
        thickness = dims.min

        # Dimensoes da face dependem de qual face estamos olhando
        case face_name
        when :left, :right
          face_dims = [d, h] # face no plano YZ
        when :front, :back
          face_dims = [w, h] # face no plano XZ
        when :top, :bottom
          face_dims = [w, d] # face no plano XY
        end

        # Se a menor dimensao da face e a espessura da peca, e uma borda
        if face_dims.min <= thickness * 1.1
          :edge
        else
          :face
        end
      end

      # Classifica o tipo de juncao baseado nos tipos de face em contato.
      #
      # :butt    — face de uma peca contra borda de outra (juntas de topo)
      #            Ex: lateral com base apoiada na borda inferior
      # :overlay — face de uma peca contra face de outra (sobreposicao)
      #            Ex: porta cobrindo a lateral do armario
      # :dado    — encaixe parcial, com offset > 0 (rebaixo/canal)
      #            Ex: fundo encaixado em canal na lateral
      def classify_joint(fa_type, fb_type, piece_a, piece_b, contact)
        # Se ha offset, e encaixe dado/rebaixo
        return :dado if contact[:offset] > 0.5

        # Face contra borda = butt joint
        if (fa_type == :face && fb_type == :edge) ||
           (fa_type == :edge && fb_type == :face)
          return :butt
        end

        # Face contra face = overlay (porta, gaveta sobreposta)
        if fa_type == :face && fb_type == :face
          return :overlay
        end

        # Borda contra borda = miter (raro em marcenaria de painel)
        if fa_type == :edge && fb_type == :edge
          return :butt # tratar como butt para fins praticos
        end

        :butt
      end
    end
  end
end
