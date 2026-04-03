# ═══════════════════════════════════════════════════════
# ModelAnalyzer — Traversal do modelo 3D SketchUp
# Detecta modulos (grupos), pecas, materiais e juncoes
# ═══════════════════════════════════════════════════════

module Ornato
  module Core
    class ModelAnalyzer
      def initialize(model)
        @model = model
      end

      # Analisa modelo completo e retorna hash com resultados
      def analyze
        modules = []
        pieces = []
        materials = []

        # Percorrer entidades do modelo
        traverse_entities(@model.active_entities, modules, pieces, materials)

        # Detectar juncoes entre pecas
        joint_detector = JointDetector.new
        joints = joint_detector.detect(pieces)

        {
          modules: modules,
          pieces: pieces,
          materials: materials.uniq,
          joints: joints,
          summary: {
            total_modules: modules.length,
            total_pieces: pieces.length,
            total_materials: materials.uniq.length,
            total_joints: joints.length,
          }
        }
      end

      private

      def traverse_entities(entities, modules, pieces, materials, parent_module: nil, depth: 0)
        entities.each do |entity|
          next unless entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)

          # Verificar se e um modulo (grupo pai com sub-grupos) ou peca (folha)
          children = get_children(entity)
          has_sub_groups = children.any? { |c| c.is_a?(Sketchup::Group) || c.is_a?(Sketchup::ComponentInstance) }

          if has_sub_groups && depth < 2
            # E um modulo (armario, gaveteiro, etc)
            mod = build_module_info(entity, parent_module)
            modules << mod
            traverse_entities(children, modules, pieces, materials, parent_module: mod, depth: depth + 1)
          else
            # E uma peca (lateral, base, etc)
            piece = build_piece_info(entity, parent_module)
            if piece && piece[:is_panel]
              pieces << piece
              materials << piece[:material_code] if piece[:material_code]
            end
          end
        end
      end

      def get_children(entity)
        if entity.is_a?(Sketchup::ComponentInstance)
          entity.definition.entities.to_a
        else
          entity.entities.to_a
        end
      end

      def build_module_info(entity, parent)
        bb = entity.bounds
        {
          group: entity,
          name: get_entity_name(entity),
          parent: parent,
          bounds: {
            width: bb.width.to_mm.round(1),
            height: bb.height.to_mm.round(1),
            depth: bb.depth.to_mm.round(1),
          },
          origin: [bb.min.x.to_mm, bb.min.y.to_mm, bb.min.z.to_mm],
        }
      end

      def build_piece_info(entity, parent_module)
        bb = entity.bounds
        dims = [bb.width.to_mm, bb.height.to_mm, bb.depth.to_mm].sort

        # Uma peca de marcenaria: uma dimensao << as outras (espessura)
        espessura = dims[0]
        return nil if espessura < 2 || espessura > 50 # nao e chapa

        largura = dims[1]
        comprimento = dims[2]

        # Detectar material
        material = detect_material(entity)
        material_code = material ? MaterialMapper.map(material.display_name) : nil

        # Detectar bordas expostas
        edges = EdgeBanding.detect(entity, parent_module)

        # Inferir funcao da peca pela posicao e proporcoes
        role = infer_role(entity, parent_module, comprimento, largura, espessura)

        {
          group: entity,
          name: get_entity_name(entity),
          persistent_id: generate_persistent_id(entity),
          module_name: parent_module ? parent_module[:name] : 'Avulso',
          module_group: parent_module ? parent_module[:group] : nil,
          role: role,
          comprimento: comprimento.round(1),
          largura: largura.round(1),
          espessura: espessura.round(1),
          material_name: material&.display_name,
          material_code: material_code,
          grain: detect_grain(entity, material),
          edges: edges,
          bounds: entity.bounds,
          transformation: entity.transformation,
          is_panel: true,
        }
      end

      # Detectar material aplicado na entidade ou nas faces
      def detect_material(entity)
        # Primeiro verifica material da entidade
        mat = entity.material
        return mat if mat

        # Depois verifica material das faces
        faces = get_faces(entity)
        face_materials = faces.map(&:material).compact
        return face_materials.first if face_materials.any?

        nil
      end

      def get_faces(entity)
        ents = entity.is_a?(Sketchup::ComponentInstance) ? entity.definition.entities : entity.entities
        ents.grep(Sketchup::Face)
      end

      # Inferir papel da peca (lateral, base, tampo, porta, etc)
      def infer_role(entity, parent_module, comp, larg, esp)
        name = get_entity_name(entity).downcase

        # Por nome explicito
        return :lateral if name =~ /lateral|side/
        return :base if name =~ /\bbase\b|fundo.*inferior|bottom/
        return :top if name =~ /tampo|topo|top/
        return :back if name =~ /traseira|fundo|back/
        return :door if name =~ /porta|door/
        return :drawer_front if name =~ /frente.*gaveta|drawer.*front/
        return :shelf if name =~ /prateleira|shelf/
        return :divider if name =~ /divisoria|divider/

        # Por posicao/proporcoes dentro do modulo
        return :unknown unless parent_module

        mod_bb = parent_module[:bounds]
        # Peca vertical alta = lateral
        return :lateral if comp > mod_bb[:height] * 0.8 && larg > mod_bb[:depth] * 0.7
        # Peca horizontal larga = base/tampo
        return :base if comp > mod_bb[:width] * 0.8 && larg > mod_bb[:depth] * 0.7
        # Peca fina grande = fundo/traseira
        return :back if esp < 8 && comp > mod_bb[:width] * 0.7

        :unknown
      end

      def detect_grain(entity, material)
        return 'sem_veio' unless material
        name = material.display_name.downcase
        return 'horizontal' if name =~ /horizontal|hz/
        return 'vertical' if name =~ /vertical|vt/
        'sem_veio'
      end

      def get_entity_name(entity)
        if entity.is_a?(Sketchup::ComponentInstance)
          entity.definition.name.to_s.empty? ? (entity.name.to_s.empty? ? 'Sem nome' : entity.name) : entity.definition.name
        else
          entity.name.to_s.empty? ? 'Grupo' : entity.name
        end
      end

      def generate_persistent_id(entity)
        # Gerar ID unico baseado na posicao + dimensoes
        bb = entity.bounds
        key = "#{bb.min.x.to_mm.round(0)}_#{bb.min.y.to_mm.round(0)}_#{bb.min.z.to_mm.round(0)}_#{bb.width.to_mm.round(0)}x#{bb.height.to_mm.round(0)}"
        "bp_#{Digest::MD5.hexdigest(key)[0..7]}"
      rescue
        "bp_#{rand(100000..999999)}"
      end
    end
  end
end
