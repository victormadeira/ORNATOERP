# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# FerragemDrillingCollector — Coletor de furações 3D para UPM
#
# Varre ComponentInstances dentro do grupo-módulo carimbadas com
# `Ornato.preserve_drillings == true` (ferragens 3D vindas dos .skp WPS),
# aplica o `SkpFeatureExtractor` em cada definição e converte as features
# em operações CNC brutas já no espaço local da peça-chapa âncora.
#
# Saída: Hash<persistent_id => Array<Hash op_bruta>> + relatório de
# colisões anexado em `:_drilling_collisions`.
#
# Esta classe é o ponto de fusão entre:
#   - SkpFeatureExtractor (Agente E) → extrai features locais da .skp
#   - DrillingCollisionDetector (Agente J) → analisa colisões nas ops
#   - MachiningJson serializer (legado) → consome ops brutas para UPM
#
# Adapta-se ao schema real produzido por SkpFeatureExtractor#extract:
#   { tipo:, center:, normal:, diametro_mm:, profundidade_mm:,
#     bbox:, confidence:, raw_face_count:, notes: }
# ═══════════════════════════════════════════════════════════════════════

require_relative 'skp_feature_extractor'
require_relative 'drilling_collision_detector'
require_relative '../core/logger'

module Ornato
  module Machining
    class FerragemDrillingCollector
      AXIS_TOL_DEG = 20.0  # tolerância angular para classificar lado

      # @param parent_group [Sketchup::Group] grupo-módulo
      def initialize(parent_group)
        @parent = parent_group
      end

      # Coleta operações brutas + relatório de colisões.
      #
      # @return [Hash] {
      #   piece_persistent_id => Array<Hash op_bruta>,
      #   :_drilling_collisions => Hash (resultado do DrillingCollisionDetector)
      # }
      def collect
        out = Hash.new { |h, k| h[k] = [] }
        all_ops_for_collision = []
        anchors_by_role = index_anchors

        return out unless @parent.respond_to?(:entities)

        @parent.entities.each do |ent|
          next unless ferragem_3d?(ent)

          anchor_role = ent.get_attribute('Ornato', 'anchor_role').to_s
          anchor      = anchors_by_role[anchor_role]&.first
          unless anchor
            Ornato::Logger.warn("FerragemDrillingCollector: anchor_role nao encontrado",
                                context: { anchor_role: anchor_role, entity_id: ent.entityID })
            next
          end

          features = safely_extract(ent)
          next if features.empty?

          combined_tx = ent.transformation
          anchor_inv  = anchor.transformation.inverse
          anchor_pid  = read_persistent_id(anchor)

          features.each do |feat|
            world_pt   = feat[:center].transform(combined_tx)
            local_pt   = world_pt.transform(anchor_inv)
            normal_w   = transform_vector(combined_tx, feat[:normal])
            local_norm = transform_vector(anchor_inv, normal_w)
            side       = detect_face_side(local_norm)

            tipo_ornato = feat[:tipo].to_s
            x_mm = local_pt.x.to_mm.round(3)
            y_mm = local_pt.y.to_mm.round(3)
            z_mm = local_pt.z.to_mm.round(3)

            op_bruta = {
              category:        map_category(tipo_ornato),
              tipo_ornato:     tipo_ornato, # furo_passante / furo_cego / rasgo_slot / recorte
              position_x:      x_mm,
              position_y:      y_mm,
              position_z:      z_mm,
              diameter:        feat[:diametro_mm],
              depth:           feat[:profundidade_mm],
              side:            side.to_s,
              fonte:           "wps_skp:#{ent.get_attribute('Ornato', 'componente_3d')}",
              ferragem_regra:  ent.get_attribute('Ornato', 'regra').to_s,
              confidence:      feat[:confidence],
            }

            out[anchor_pid] << op_bruta

            # Op normalizada para o DrillingCollisionDetector (chaves diferentes)
            all_ops_for_collision << {
              tipo:            feat[:tipo],
              peca_id:         anchor_pid,
              x_mm:            x_mm,
              y_mm:            y_mm,
              z_mm:            z_mm,
              diametro_mm:     feat[:diametro_mm] || 0.0,
              profundidade_mm: feat[:profundidade_mm] || 0.0,
              lado:            side,
              normal:          local_norm,
              fonte:           op_bruta[:fonte],
            }
          end
        end

        # Anexa relatório de colisões (não vinculado a piece_id)
        unless all_ops_for_collision.empty?
          begin
            detector = DrillingCollisionDetector.new(all_ops_for_collision)
            out[:_drilling_collisions] = detector.analyze
          rescue => e
            Ornato::Logger.error("FerragemDrillingCollector: collision detector falhou", context: { error: e.message })
          end
        end

        out
      end

      private

      def ferragem_3d?(ent)
        ent.is_a?(Sketchup::ComponentInstance) &&
          ent.get_attribute('Ornato', 'tipo') == 'ferragem' &&
          ent.get_attribute('Ornato', 'preserve_drillings') == true
      end

      def safely_extract(inst)
        defn = inst.respond_to?(:definition) ? inst.definition : nil
        return [] unless defn
        SkpFeatureExtractor.new(defn).extract
      rescue => e
        Ornato::Logger.warn("FerragemDrillingCollector: extract falhou",
                            context: { entity_id: inst.entityID, error: e.message })
        []
      end

      # Indexa peças-chapa do grupo por role.
      def index_anchors
        idx = Hash.new { |h, k| h[k] = [] }
        @parent.entities.each do |e|
          next unless piece_like?(e)
          role = e.get_attribute('Ornato', 'role').to_s
          next if role.empty?
          idx[role] << e
        end
        idx
      end

      # Predicate independente de PieceStamper para evitar dependência circular.
      # Considera peça qualquer Group/ComponentInstance carimbado com
      # `Ornato.tipo == 'peca'` (ou variantes legadas).
      def piece_like?(ent)
        return false unless ent.is_a?(Sketchup::Group) ||
                            ent.is_a?(Sketchup::ComponentInstance)
        tipo = ent.get_attribute('Ornato', 'tipo').to_s
        # ferragens 3D NÃO são âncoras
        return false if tipo == 'ferragem'
        # qualquer carimbo Ornato com role definido conta como peça
        !ent.get_attribute('Ornato', 'role').to_s.empty?
      end

      def read_persistent_id(ent)
        ent.get_attribute('Ornato', 'persistent_id', nil) ||
          ent.get_attribute('ornato', 'persistent_id', nil) ||
          "piece_#{ent.entityID}"
      end

      # Vetor normal local-da-peça → lado da chapa.
      # Convenções (alinhadas com DrillingCollisionDetector::FACE_SIDES e
      # EDGE_SIDES, que usa edge_left/right/front/back):
      #   - Eixo Z local da peça = espessura ⇒ topside/underside
      #   - Eixo Y local = altura  ⇒ edge_front (Y+) / edge_back (Y-)
      #   - Eixo X local = largura ⇒ edge_right (X+) / edge_left (X-)
      def detect_face_side(local_normal)
        return :topside if local_normal.length < 1e-6
        n = local_normal.clone
        n.normalize!
        ax_tol = Math.cos(AXIS_TOL_DEG * Math::PI / 180.0)
        return :topside    if n.z >=  ax_tol
        return :underside  if n.z <= -ax_tol
        return :edge_front if n.y >=  ax_tol
        return :edge_back  if n.y <= -ax_tol
        return :edge_right if n.x >=  ax_tol
        return :edge_left  if n.x <= -ax_tol
        :topside
      end

      # Transforma vetor (rotação apenas, ignora translação).
      # Usa o método nativo Geom::Vector3d#transform quando disponível,
      # com fallback manual para robustez em headless tests.
      def transform_vector(tx, vec)
        if vec.respond_to?(:transform)
          vec.transform(tx)
        else
          m = tx.to_a
          Geom::Vector3d.new(
            m[0] * vec.x + m[4] * vec.y + m[8]  * vec.z,
            m[1] * vec.x + m[5] * vec.y + m[9]  * vec.z,
            m[2] * vec.x + m[6] * vec.y + m[10] * vec.z
          )
        end
      end

      # Mapeia tipo Ornato → categoria UPM (compatível com VALID_CATEGORIES).
      def map_category(kind)
        case kind.to_s
        when 'furo_passante', 'furo_cego' then 'hole'
        when 'rasgo_slot'                 then 'groove'
        when 'recorte'                    then 'pocket'
        else                                   'hole'
        end
      end
    end
  end
end
