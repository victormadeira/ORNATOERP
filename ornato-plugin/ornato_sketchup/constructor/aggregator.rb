# ═══════════════════════════════════════════════════════
# Aggregator — Agrega componentes a módulos existentes
# Portas, gavetas, prateleiras, divisórias, etc.
# ═══════════════════════════════════════════════════════

require 'json'

module Ornato
  module Constructor
    module Aggregator

      # ── Adicionar componente a um módulo ──
      # @param group [Sketchup::Group] módulo pai
      # @param slot_json [String] JSON do componente a agregar
      def self.add_component(group, slot_json)
        slot = JSON.parse(slot_json, symbolize_names: true)
        params = get_module_params(group)
        return unless params

        model = Sketchup.active_model
        model.start_operation("Ornato: Agregar #{slot[:type]}", true)

        begin
          case slot[:slot]
          when 'fechamento'
            add_door(group, slot, params)
          when 'gaveta'
            add_drawers(group, slot, params)
          when 'interno'
            add_internal(group, slot, params)
          when 'especial'
            add_special(group, slot, params)
          else
            UI.messagebox("Tipo de componente desconhecido: #{slot[:slot]}")
            model.abort_operation
            return
          end

          # Registrar slot nos atributos do módulo
          slots = JSON.parse(group.get_attribute('Ornato', 'slots') || '[]')
          slots << slot
          group.set_attribute('Ornato', 'slots', JSON.generate(slots))

          model.commit_operation
          Sketchup.status_text = "Ornato: #{slot[:type]} agregado ao módulo"

        rescue => e
          model.abort_operation
          UI.messagebox("Erro ao agregar: #{e.message}")
          puts "Aggregator ERRO: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
        end
      end

      # ── Remover componente ──
      def self.remove_component(group, index_json)
        data = JSON.parse(index_json, symbolize_names: true)
        idx = data[:index].to_i

        slots = JSON.parse(group.get_attribute('Ornato', 'slots') || '[]')
        return if idx < 0 || idx >= slots.length

        model = Sketchup.active_model
        model.start_operation('Ornato: Remover componente', true)

        begin
          slot = slots[idx]
          # Remover geometria associada
          remove_slot_geometry(group, slot, idx)
          slots.delete_at(idx)
          group.set_attribute('Ornato', 'slots', JSON.generate(slots))
          model.commit_operation
        rescue => e
          model.abort_operation
          UI.messagebox("Erro ao remover: #{e.message}")
        end
      end

      private

      # ── Obter parâmetros do módulo ──
      def self.get_module_params(group)
        params_json = group.get_attribute('Ornato', 'params')
        return nil unless params_json
        params = JSON.parse(params_json, symbolize_names: true)
        # Garantir variáveis derivadas
        params[:interna_w] ||= params[:largura] - 2 * params[:espessura]
        params[:interna_h] ||= params[:altura] - params[:espessura] - (params[:rodape] || 0)
        params[:interna_d] ||= params[:profundidade]
        params
      end

      # ── Criar peça auxiliar (box) dentro do módulo ──
      def self.make_piece(parent, name, role, w, h, e, pos, bordas = {})
        piece = parent.entities.add_group
        piece.name = name

        pts = [
          Geom::Point3d.new(0, 0, 0),
          Geom::Point3d.new(w.mm, 0, 0),
          Geom::Point3d.new(w.mm, e.mm, 0),
          Geom::Point3d.new(0, e.mm, 0),
        ]
        face = piece.entities.add_face(pts)
        face.pushpull(-h.mm) if face

        tr = Geom::Transformation.new(Geom::Point3d.new(pos[0].mm, pos[1].mm, pos[2].mm))
        piece.transform!(tr)

        piece.set_attribute('Ornato', 'role', role)
        piece.set_attribute('Ornato', 'piece_name', name)
        piece.set_attribute('Ornato', 'aggregate', 'true')
        piece.set_attribute('Ornato', 'dimensions', JSON.generate({ largura: w, altura: h, espessura: e }))
        piece.set_attribute('Ornato', 'bordas', JSON.generate(bordas))
        piece
      end

      # ── Portas ──
      def self.add_door(group, slot, p)
        config = slot[:config] || {}
        folga = (config[:folga] || 2).to_f
        esp = p[:espessura]
        iw = p[:interna_w]
        ih = p[:interna_h]
        rodape = p[:rodape] || 0
        base_z = rodape + esp + folga / 2

        case slot[:type].to_s
        when 'porta_2_abrir'
          pw = (iw - folga) / 2.0
          ph = ih - folga
          make_piece(group, 'Porta Esquerda', 'porta', pw, ph, esp,
            [esp + folga / 2, -esp, base_z],
            { frontal: true, traseira: true, dir: true, esq: true })
          make_piece(group, 'Porta Direita', 'porta', pw, ph, esp,
            [esp + pw + folga, -esp, base_z],
            { frontal: true, traseira: true, dir: true, esq: true })

        when 'porta_1_abrir'
          pw = iw - folga
          ph = ih - folga
          make_piece(group, 'Porta', 'porta', pw, ph, esp,
            [esp + folga / 2, -esp, base_z],
            { frontal: true, traseira: true, dir: true, esq: true })

        when 'porta_basculante'
          pw = iw - folga
          ph = ih / 2.0
          make_piece(group, 'Porta Basculante', 'porta', pw, ph, esp,
            [esp + folga / 2, -esp, base_z + ih - ph - folga / 2],
            { frontal: true, traseira: true, dir: true, esq: true })

        when 'porta_correr'
          n = (config[:n_folhas] || 2).to_i
          pw = (p[:largura] / n.to_f) + 20  # sobreposição
          ph = ih - folga
          n.times do |i|
            offset_y = -esp - (i * 20)  # cada folha mais recuada
            make_piece(group, "Porta Correr #{i + 1}", 'porta_correr', pw, ph, esp,
              [folga / 2, offset_y, base_z],
              { frontal: true, traseira: true, dir: true, esq: true })
          end
        end
      end

      # ── Gavetas ──
      def self.add_drawers(group, slot, p)
        config = slot[:config] || {}
        esp = p[:espessura]
        iw = p[:interna_w]
        ih = p[:interna_h]
        id = p[:interna_d]
        rodape = p[:rodape] || 0
        folga = 3.0

        # Determinar quantidade
        n = case slot[:type].to_s
            when 'gaveta_unica' then 1
            when 'gavetas_2' then 2
            when 'gavetas_3' then 3
            when 'gavetas_4' then 4
            when 'gavetas_custom' then (config[:quantidade] || 3).to_i
            else 2
            end

        frente_h = (ih - folga * (n + 1)) / n.to_f
        caixa_h = [frente_h - 30, 80].max
        caixa_lat_esp = 12.0

        n.times do |i|
          z = rodape + esp + folga + i * (frente_h + folga)

          # Frente
          make_piece(group, "Frente Gaveta #{i + 1}", 'frente_gaveta', iw - folga, frente_h, esp,
            [esp + folga / 2, -esp, z],
            { frontal: true, traseira: true, dir: true, esq: true })

          # Laterais da caixa
          caixa_w = id - 50  # recuo para corrediça
          make_piece(group, "Lat.Esq Gaveta #{i + 1}", 'lateral_gaveta', caixa_w, caixa_h, caixa_lat_esp,
            [esp + 2, 0, z + (frente_h - caixa_h) / 2],
            { frontal: true, traseira: false, dir: false, esq: false })

          make_piece(group, "Lat.Dir Gaveta #{i + 1}", 'lateral_gaveta', caixa_w, caixa_h, caixa_lat_esp,
            [p[:largura] - esp - caixa_lat_esp - 2, 0, z + (frente_h - caixa_h) / 2],
            { frontal: true, traseira: false, dir: false, esq: false })

          # Fundo gaveta
          fundo_w = iw - 2 * caixa_lat_esp - 4
          make_piece(group, "Fundo Gaveta #{i + 1}", 'fundo_gaveta', fundo_w, caixa_w, 3,
            [esp + caixa_lat_esp + 2, 0, z + (frente_h - caixa_h) / 2],
            {})

          # Traseira gaveta
          make_piece(group, "Tras. Gaveta #{i + 1}", 'traseira_gaveta', fundo_w, caixa_h - 10, caixa_lat_esp,
            [esp + caixa_lat_esp + 2, caixa_w - caixa_lat_esp, z + (frente_h - caixa_h) / 2],
            {})
        end
      end

      # ── Internos (prateleira, divisória, cabideiro, etc.) ──
      def self.add_internal(group, slot, p)
        config = slot[:config] || {}
        esp = p[:espessura]
        iw = p[:interna_w]
        ih = p[:interna_h]
        id = p[:interna_d]
        rodape = p[:rodape] || 0

        case slot[:type].to_s
        when 'prateleira'
          n = (config[:quantidade] || 1).to_i
          recuo = (config[:recuo] || 20).to_f
          spacing = ih / (n + 1).to_f

          n.times do |i|
            z = rodape + esp + spacing * (i + 1)
            make_piece(group, "Prateleira #{i + 1}", 'prateleira', iw, id - recuo, esp,
              [esp, 0, z],
              { frontal: true, traseira: false, dir: false, esq: false })
          end

        when 'divisoria'
          pos_x = case config[:posicao].to_s
                  when 'centro' then esp + iw / 2.0 - esp / 2.0
                  when 'terco_esq' then esp + iw / 3.0 - esp / 2.0
                  when 'terco_dir' then esp + iw * 2.0 / 3.0 - esp / 2.0
                  when 'manual' then esp + (config[:posicao_mm] || iw / 2.0).to_f
                  else esp + iw / 2.0
                  end
          make_piece(group, 'Divisória', 'divisoria', ih, id, esp,
            [pos_x, 0, rodape + esp],
            { frontal: true, traseira: false, dir: false, esq: false })

        when 'cabideiro'
          # Cabideiro é representado como um cilindro simplificado (varão = peça fina)
          diam = (config[:diametro] || 25).to_f
          alt = (config[:altura_fixacao] || 0).to_f
          alt = rodape + esp + ih * 0.75 if alt <= 0
          make_piece(group, 'Cabideiro (varão)', 'cabideiro', iw, diam, diam,
            [esp, id / 2.0 - diam / 2.0, alt],
            {})

        when 'sapateira'
          niveis = (config[:niveis] || 3).to_i
          spacing = ih / (niveis + 1).to_f
          niveis.times do |i|
            z = rodape + esp + spacing * (i + 1)
            make_piece(group, "Sapateira #{i + 1}", 'prateleira', iw, id - 40, esp,
              [esp, 20, z],
              { frontal: true, traseira: false, dir: false, esq: false })
          end

        when 'espelho', 'iluminacao'
          # Representados como atributos (não geram geometria significativa)
          group.set_attribute('Ornato', "has_#{slot[:type]}", 'true')
          group.set_attribute('Ornato', "#{slot[:type]}_config", JSON.generate(config))
        end
      end

      # ── Especiais ──
      def self.add_special(group, slot, p)
        config = slot[:config] || {}
        # Componentes especiais são registrados como atributos
        # A geometria real depende do componente específico
        group.set_attribute('Ornato', "special_#{slot[:type]}", JSON.generate(config))
        Sketchup.status_text = "Ornato: #{slot[:type]} registrado (componente especial)"
      end

      # ── Remover geometria de um slot ──
      def self.remove_slot_geometry(group, slot, idx)
        # Remover todos os sub-grupos marcados como aggregate
        to_remove = []
        group.entities.grep(Sketchup::Group).each do |g|
          next unless g.get_attribute('Ornato', 'aggregate') == 'true'
          role = g.get_attribute('Ornato', 'role')
          # Tentar match por tipo de slot
          case slot['slot'] || slot[:slot]
          when 'fechamento'
            to_remove << g if ['porta', 'porta_correr'].include?(role)
          when 'gaveta'
            to_remove << g if ['frente_gaveta', 'lateral_gaveta', 'fundo_gaveta', 'traseira_gaveta'].include?(role)
          when 'interno'
            to_remove << g if ['prateleira', 'divisoria', 'cabideiro'].include?(role)
          end
        end
        to_remove.each { |g| g.erase! }
      end

    end
  end
end
