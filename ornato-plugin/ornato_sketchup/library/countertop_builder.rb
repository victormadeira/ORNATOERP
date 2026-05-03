# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# CountertopBuilder — Geração automática de tampo sobre módulos base
#
# Detecta automaticamente todos os módulos base Ornato (armario_base,
# gaveteiro, etc) alinhados em sequência e gera um tampo contínuo
# cobrindo toda a extensão do conjunto.
#
# Uso:
#   CountertopBuilder.build_for_selection  → tampo sobre selecionados
#   CountertopBuilder.build_for_all        → tampo sobre todos os bases
#   CountertopBuilder.build_for_run(groups) → tampo para grupo específico
#
# Resultado:
#   - Grupo Ornato com module_type='tamponamento_tampo'
#   - Sobressai OVERHANG_MM mm na frente e laterais livres
#   - Posicionado exatamente sobre o módulo mais alto do conjunto
#   - Marcado com Ornato.role='countertop'
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Library
    class CountertopBuilder

      # Módulos considerados "base" (recebem tampo)
      BASE_TYPES = %w[
        armario_base gaveteiro coluna_canto
      ].freeze

      OVERHANG_FRONT_MM = 30.0   # tampo avança 30mm na frente
      OVERHANG_SIDE_MM  = 0.0    # laterais: sem sobra (flush)
      DEFAULT_THICKNESS = 30.0   # espessura do tampo em mm
      SNAP_TOLERANCE    = 50.0   # mm — bases alinhadas se dentro disso

      # ─────────────────────────────────────────────────────────
      # Gera tampo sobre todos os grupos selecionados que são bases
      # ─────────────────────────────────────────────────────────
      def self.build_for_selection(material: nil, thickness_mm: DEFAULT_THICKNESS)
        model = Sketchup.active_model
        sel   = model.selection.to_a
        bases = sel.select { |e| is_base_module?(e) }
        raise 'Nenhum módulo base selecionado.' if bases.empty?
        build_for_run(bases, material: material, thickness_mm: thickness_mm)
      end

      # ─────────────────────────────────────────────────────────
      # Gera tampos sobre todos os módulos base no modelo,
      # agrupando os que estão alinhados (mesma linha de Y e Z)
      # ─────────────────────────────────────────────────────────
      def self.build_for_all(material: nil, thickness_mm: DEFAULT_THICKNESS)
        model = Sketchup.active_model
        all_bases = model.active_entities.select { |e| is_base_module?(e) }
        raise 'Nenhum módulo base encontrado no modelo.' if all_bases.empty?

        runs = group_into_runs(all_bases)
        results = []
        runs.each do |run|
          g = build_for_run(run, material: material, thickness_mm: thickness_mm)
          results << g if g
        end
        results
      end

      # ─────────────────────────────────────────────────────────
      # Gera tampo para um conjunto específico de grupos
      # @return [Sketchup::Group] grupo do tampo criado
      # ─────────────────────────────────────────────────────────
      def self.build_for_run(base_groups, material: nil, thickness_mm: DEFAULT_THICKNESS)
        return nil if base_groups.empty?

        model = Sketchup.active_model
        model.start_operation('Ornato: Gerar Tampo', true)

        begin
          # Calcular extensão do conjunto
          min_x = Float::INFINITY
          max_x = -Float::INFINITY
          min_y = Float::INFINITY
          max_y = -Float::INFINITY
          max_z = -Float::INFINITY

          base_groups.each do |g|
            bb = g.bounds
            min_x = [min_x, bb.min.x].min
            max_x = [max_x, bb.max.x].max
            min_y = [min_y, bb.min.y].min
            max_y = [max_y, bb.max.y].max
            max_z = [max_z, bb.max.z].max
          end

          # Dimensões do tampo
          t  = thickness_mm.mm
          ov = OVERHANG_FRONT_MM.mm

          # Tampo: da extensão X dos módulos, profundidade + overhang na frente
          group = model.active_entities.add_group
          group.name = 'Tampo'

          pts = [
            Geom::Point3d.new(min_x, min_y, max_z),
            Geom::Point3d.new(max_x, min_y, max_z),
            Geom::Point3d.new(max_x, max_y + ov, max_z),
            Geom::Point3d.new(min_x, max_y + ov, max_z),
          ]

          face = group.entities.add_face(pts)
          face&.pushpull(-t)

          # Atributos
          largura_mm = (max_x - min_x).to_mm.round(1)
          prof_mm    = ((max_y - min_y) + OVERHANG_FRONT_MM).round(1)
          mat_code   = material || begin
            p = base_groups.first.get_attribute('Ornato', 'params')
            params = p ? JSON.parse(p, symbolize_names: true) : {}
            params[:material] || 'MDF30_BrancoTX'
          rescue
            'MDF30_BrancoTX'
          end

          group.set_attribute('Ornato', 'module_type', 'tamponamento_tampo')
          group.set_attribute('Ornato', 'role', 'countertop')
          group.set_attribute('Ornato', 'params', JSON.generate({
            largura:      largura_mm,
            profundidade: prof_mm,
            espessura:    thickness_mm,
            material:     mat_code,
          }))
          group.set_attribute('Ornato', 'created_at', Time.now.iso8601)
          group.set_attribute('Ornato', 'covers_modules', JSON.generate(base_groups.map(&:entityID)))

          # Aplicar material
          apply_material(group, mat_code, model)

          model.commit_operation

          Sketchup.status_text = "Ornato: Tampo gerado #{largura_mm.round}×#{prof_mm.round}×#{thickness_mm.round}mm"
          group

        rescue => e
          model.abort_operation
          puts "Ornato CountertopBuilder ERRO: #{e.message}\n#{e.backtrace.first(4).join("\n")}"
          raise
        end
      end

      # ─────────────────────────────────────────────────────────
      private_class_method
      # ─────────────────────────────────────────────────────────

      def self.is_base_module?(entity)
        return false unless entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
        type = entity.get_attribute('Ornato', 'module_type').to_s
        BASE_TYPES.include?(type)
      end

      # Agrupa módulos base em "fileiras" alinhadas (mesmo Y e Z ≈)
      def self.group_into_runs(bases)
        used   = {}
        runs   = []

        bases.sort_by { |g| g.bounds.min.y }.each do |g|
          next if used[g.entityID]
          run = [g]
          used[g.entityID] = true

          gy_min = g.bounds.min.y
          gz     = g.bounds.min.z

          bases.each do |other|
            next if used[other.entityID]
            next if (other.bounds.min.y - gy_min).abs > SNAP_TOLERANCE.mm
            next if (other.bounds.min.z - gz).abs      > SNAP_TOLERANCE.mm
            run << other
            used[other.entityID] = true
          end

          runs << run
        end

        runs
      end

      def self.apply_material(group, code, model)
        mat = model.materials.to_a.find { |m| m.name == code || m.display_name == code }
        unless mat
          mat = model.materials.add(code)
          if code =~ /branco/i
            mat.color = Sketchup::Color.new(245, 245, 243)
          elsif code =~ /preto/i
            mat.color = Sketchup::Color.new(30, 30, 30)
          elsif code =~ /carvalho/i
            mat.color = Sketchup::Color.new(175, 135, 85)
          else
            mat.color = Sketchup::Color.new(200, 195, 188)
          end
        end
        group.material = mat
      rescue; end
    end
  end
end
