# ═══════════════════════════════════════════════════════
# FinishManager — Gerencia materiais e bordas dos módulos
# Aplica acabamentos em peças individuais ou em massa
# ═══════════════════════════════════════════════════════

require 'json'

module Ornato
  module Constructor
    module FinishManager

      # Mapeamento de códigos de material para cores SketchUp
      MATERIAL_COLORS = {
        'MDF_18_BRANCO'  => [245, 245, 245], 'MDF_15_BRANCO'  => [240, 240, 240],
        'MDF_18_CRU'     => [200, 185, 160], 'MDF_18_PRETO'   => [35, 35, 35],
        'MDF_9_CRU'      => [195, 180, 155], 'MDF_6_CRU'      => [190, 175, 150],
        'MDF_3_CRU'      => [185, 170, 145],
        'BP_18_BRANCO'   => [250, 250, 250], 'BP_18_CARVALHO' => [139, 115, 85],
        'BP_18_NOGAL'    => [100, 70, 50],   'BP_18_PRETO'    => [25, 25, 25],
        'BP_18_CINZA'    => [160, 160, 160], 'BP_18_FREIJO'   => [170, 140, 100],
        'BP_18_ROVERE'   => [180, 160, 130], 'BP_18_CANELA'   => [160, 120, 80],
        'BP_15_BRANCO'   => [248, 248, 248], 'BP_15_CARVALHO' => [135, 112, 82],
        'MDP_18_BRANCO'  => [242, 242, 242], 'MDP_15_BRANCO'  => [238, 238, 238],
        'COMP_18_NAVAL'  => [210, 190, 150], 'COMP_15_PINUS'  => [220, 200, 160],
      }.freeze

      # Regras automáticas de borda por role
      BORDA_RULES = {
        'lateral'         => { frontal: true, traseira: false, dir: false, esq: false },
        'base'            => { frontal: true, traseira: false, dir: false, esq: false },
        'topo'            => { frontal: true, traseira: false, dir: false, esq: false },
        'travessa'        => { frontal: true, traseira: false, dir: false, esq: false },
        'traseira'        => { frontal: false, traseira: false, dir: false, esq: false },
        'porta'           => { frontal: true, traseira: true, dir: true, esq: true },
        'porta_correr'    => { frontal: true, traseira: true, dir: true, esq: true },
        'frente_gaveta'   => { frontal: true, traseira: true, dir: true, esq: true },
        'lateral_gaveta'  => { frontal: true, traseira: false, dir: false, esq: false },
        'fundo_gaveta'    => { frontal: false, traseira: false, dir: false, esq: false },
        'traseira_gaveta' => { frontal: false, traseira: false, dir: false, esq: false },
        'prateleira'      => { frontal: true, traseira: false, dir: false, esq: false },
        'divisoria'       => { frontal: true, traseira: false, dir: false, esq: false },
        'rodape'          => { frontal: true, traseira: false, dir: false, esq: false },
        'reforco'         => { frontal: false, traseira: false, dir: false, esq: false },
      }.freeze

      # ── Aplicar acabamentos ──
      # @param group [Sketchup::Group] módulo alvo
      # @param finish_json [String] JSON do painel de acabamentos
      def self.apply_finishes(group, finish_json)
        data = JSON.parse(finish_json, symbolize_names: true)
        scope = data[:scope] || 'selection'

        model = Sketchup.active_model
        model.start_operation('Ornato: Aplicar acabamentos', true)

        begin
          targets = resolve_targets(group, scope)

          targets.each do |piece|
            role = piece.get_attribute('Ornato', 'role') || 'custom'

            # Material
            mat_code = resolve_material(data, role, piece)
            apply_material(piece, mat_code) if mat_code

            # Bordas
            bordas = resolve_bordas(data, role, piece)
            piece.set_attribute('Ornato', 'bordas', JSON.generate(bordas)) if bordas

            # Tipo de borda (fita)
            if data[:borda]
              piece.set_attribute('Ornato', 'borda_tipo', data[:borda])
            end
          end

          # Overrides por peça
          (data[:piece_overrides] || []).each do |override|
            idx = override[:index].to_i
            next if idx < 0 || idx >= targets.length
            piece = targets[idx]
            apply_material(piece, override[:material]) if override[:material]
            piece.set_attribute('Ornato', 'bordas', JSON.generate(override[:bordas])) if override[:bordas]
          end

          # Salvar config no módulo
          group.set_attribute('Ornato', 'finishes', JSON.generate({
            material: data[:material],
            material_rule: data[:material_rule],
            borda: data[:borda],
            borda_rule: data[:borda_rule],
          }))

          model.commit_operation
          count = targets.length
          Sketchup.status_text = "Ornato: Acabamentos aplicados em #{count} peças"

        rescue => e
          model.abort_operation
          UI.messagebox("Erro ao aplicar acabamentos: #{e.message}")
          puts "FinishManager ERRO: #{e.message}\n#{e.backtrace.first(3).join("\n")}"
        end
      end

      # ── Resetar acabamentos ──
      def self.reset_finishes(group)
        model = Sketchup.active_model
        model.start_operation('Ornato: Resetar acabamentos', true)

        begin
          group.entities.grep(Sketchup::Group).each do |piece|
            next unless piece.get_attribute('Ornato', 'role')
            piece.material = nil
            piece.set_attribute('Ornato', 'material_code', '')
            piece.set_attribute('Ornato', 'borda_tipo', '')
          end
          group.set_attribute('Ornato', 'finishes', '{}')
          model.commit_operation
        rescue => e
          model.abort_operation
        end
      end

      # ── Obter lista de peças para o dialog ──
      def self.get_pieces_data(group)
        pieces = []
        group.entities.grep(Sketchup::Group).each do |piece|
          role = piece.get_attribute('Ornato', 'role')
          next unless role
          dims = JSON.parse(piece.get_attribute('Ornato', 'dimensions') || '{}')
          bordas = JSON.parse(piece.get_attribute('Ornato', 'bordas') || '{}')

          pieces << {
            nome: piece.name,
            role: role,
            material: piece.get_attribute('Ornato', 'material_code') || '',
            bordas: bordas,
            dimensions: dims,
          }
        end
        pieces
      end

      private

      # ── Resolve targets ──
      def self.resolve_targets(group, scope)
        case scope
        when 'selection'
          sel = Sketchup.active_model.selection
          pieces = sel.grep(Sketchup::Group).select { |g| g.get_attribute('Ornato', 'role') }
          pieces.empty? ? all_pieces(group) : pieces
        when 'module'
          all_pieces(group)
        when 'project'
          all_project_pieces
        else
          all_pieces(group)
        end
      end

      def self.all_pieces(group)
        group.entities.grep(Sketchup::Group).select { |g| g.get_attribute('Ornato', 'role') }
      end

      def self.all_project_pieces
        pieces = []
        Sketchup.active_model.entities.grep(Sketchup::Group).each do |g|
          next unless g.get_attribute('Ornato', 'module_type')
          g.entities.grep(Sketchup::Group).each do |p|
            pieces << p if p.get_attribute('Ornato', 'role')
          end
        end
        pieces
      end

      # ── Resolve material ──
      def self.resolve_material(data, role, piece)
        rule = data[:material_rule]

        case rule
        when 'auto_fundo'
          role == 'traseira' ? 'MDF_3_CRU' : data[:material]
        when 'auto_porta'
          ['porta', 'porta_correr', 'frente_gaveta'].include?(role) ? 'BP_18_CARVALHO' : 'BP_18_BRANCO'
        else
          data[:material]
        end
      end

      # ── Resolve bordas ──
      def self.resolve_bordas(data, role, piece)
        rule = data[:borda_rule]

        case rule
        when 'visiveis'
          BORDA_RULES[role] || { frontal: true, traseira: false, dir: false, esq: false }
        when 'todas'
          { frontal: true, traseira: true, dir: true, esq: true }
        when 'manual'
          data[:borda_lados] || JSON.parse(piece.get_attribute('Ornato', 'bordas') || '{}')
        else
          BORDA_RULES[role] || {}
        end
      end

      # ── Aplicar material visual no SketchUp ──
      def self.apply_material(piece, mat_code)
        return unless mat_code && !mat_code.empty?

        model = Sketchup.active_model
        materials = model.materials

        # Buscar ou criar material
        mat_name = "Ornato_#{mat_code}"
        mat = materials[mat_name]

        unless mat
          mat = materials.add(mat_name)
          rgb = MATERIAL_COLORS[mat_code] || [200, 200, 200]
          mat.color = Sketchup::Color.new(*rgb)
        end

        piece.material = mat
        piece.set_attribute('Ornato', 'material_code', mat_code)
      end

    end
  end
end
