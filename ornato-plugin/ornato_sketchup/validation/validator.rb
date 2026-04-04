# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# Validator — Validacao completa do modelo antes da exportacao
#
# Executa 15 verificacoes de consistencia sobre o modelo
# analisado e as operacoes de usinagem geradas, retornando
# um array de Issue structs com severidade, codigo e sugestao.
# ═══════════════════════════════════════════════════════════════

require 'net/http'
require 'uri'
require 'json'

module Ornato
  module Validation
    Issue = Struct.new(:severity, :code, :message, :piece_id, :module_name, :suggestion, keyword_init: true)

    class Validator
      # Severity levels used in Issues
      SEVERITY_ERROR   = :error
      SEVERITY_WARNING = :warning
      SEVERITY_INFO    = :info

      # Thickness limits (mm)
      MIN_THICKNESS = 2.0
      MAX_THICKNESS = 50.0
      SUSPICIOUS_THICKNESS_THRESHOLD = 6.0

      # Minimum hole edge distance (mm)
      MIN_HOLE_EDGE_DISTANCE = 10.0

      # @param config [Hash] plugin configuration (from Ornato::Config)
      def initialize(config = nil)
        @config = config || (defined?(Ornato::Config) ? Ornato::Config.load : {})
      end

      # Run all validations on an analysis result + machining data.
      #
      # @param analysis [Hash] result from ModelAnalyzer#analyze
      #   Expected keys: :modules, :pieces, :materials, :joints
      # @param machining [Hash] piece_id => { "workers" => { ... } }
      # @return [Array<Issue>] all detected issues sorted by severity
      def validate(analysis, machining = {})
        @analysis  = analysis
        @machining = machining
        @issues    = []

        # Run each check
        check_piece_material
        check_piece_dimensions
        check_suspicious_thickness
        check_hole_in_bounds
        check_hole_edge_distance
        check_joint_without_hardware
        check_orphan_hardware
        check_edge_banding_consistency
        check_unmapped_material
        check_duplicate_pieces
        check_empty_module
        check_hole_overlap
        check_non_rectangular
        check_piece_count
        check_erp_connection

        # ── Advanced validations (v0.2) ──
        check_module_interference
        check_transport_limits
        check_edge_vs_hole_position
        check_symmetry
        check_depth_vs_thickness

        # Sort: errors first, then warnings, then info
        severity_order = { error: 0, warning: 1, info: 2 }
        @issues.sort_by { |i| severity_order[i.severity] || 99 }
      end

      # Convenience: does the result set contain any errors?
      def has_errors?(issues = nil)
        (issues || @issues).any? { |i| i.severity == SEVERITY_ERROR }
      end

      # Convenience: count by severity
      def summary(issues = nil)
        list = issues || @issues
        {
          errors:   list.count { |i| i.severity == SEVERITY_ERROR },
          warnings: list.count { |i| i.severity == SEVERITY_WARNING },
          info:     list.count { |i| i.severity == SEVERITY_INFO },
          total:    list.length,
        }
      end

      private

      # ─── Helpers ──────────────────────────────────────────

      def pieces
        @analysis[:pieces] || []
      end

      def modules_list
        @analysis[:modules] || []
      end

      def joints
        @analysis[:joints] || []
      end

      def material_map
        @config[:material_map] || @config['material_map'] || {}
      end

      def module_name_for(piece)
        return nil unless piece.respond_to?(:entity)
        parent = piece.entity.respond_to?(:parent) ? piece.entity.parent : nil
        return nil unless parent
        parent.respond_to?(:name) ? parent.name : nil
      rescue
        nil
      end

      def piece_label(piece)
        if piece.respond_to?(:entity) && piece.entity.respond_to?(:name) && !piece.entity.name.to_s.empty?
          piece.entity.name
        elsif piece.respond_to?(:persistent_id)
          piece.persistent_id.to_s
        else
          'desconhecida'
        end
      end

      # Extract all holes from machining workers for a given piece
      def holes_for_piece(piece)
        pid = piece.respond_to?(:persistent_id) ? piece.persistent_id : piece.to_s
        piece_machining = @machining[pid]
        return [] unless piece_machining

        workers = piece_machining['workers'] || piece_machining[:workers] || {}
        holes = []

        workers.each_value do |op|
          op_hash = op.is_a?(Hash) ? op : {}
          type = op_hash['type'] || op_hash[:type]
          next unless type.to_s =~ /hole|bore|drill|pilot|cup|pin|bolt/i

          x = (op_hash['x'] || op_hash[:x]).to_f
          y = (op_hash['y'] || op_hash[:y]).to_f
          d = (op_hash['diameter'] || op_hash[:diameter]).to_f
          depth = (op_hash['depth'] || op_hash[:depth]).to_f
          face = op_hash['face'] || op_hash[:face] || 'top'

          holes << { x: x, y: y, diameter: d, depth: depth, face: face.to_s }
        end

        holes
      end

      # ─── 1. check_piece_material ──────────────────────────
      # Every piece must have a mapped material. Error if not.
      def check_piece_material
        pieces.each do |piece|
          next unless piece.respond_to?(:entity)

          mat_name = nil
          if piece.entity.respond_to?(:material) && piece.entity.material
            mat_name = piece.entity.material.display_name
          end

          if mat_name.nil? || mat_name.to_s.strip.empty?
            @issues << Issue.new(
              severity: SEVERITY_ERROR,
              code: 'MAT_MISSING',
              message: "Peca '#{piece_label(piece)}' nao possui material atribuido.",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Atribua um material a esta peca no SketchUp antes de exportar.'
            )
            next
          end

          # Check if material is in the mapping
          mapped = material_map[mat_name] || material_map[mat_name.to_sym]
          if mapped.nil? || mapped.to_s.strip.empty?
            # This is handled by check_unmapped_material — skip here to avoid duplicate
          end
        end
      end

      # ─── 2. check_piece_dimensions ────────────────────────
      # Width/height > 0, thickness within 2-50mm. Error if violated.
      def check_piece_dimensions
        pieces.each do |piece|
          w = piece.respond_to?(:width) ? piece.width.to_f : 0
          h = piece.respond_to?(:height) ? piece.height.to_f : 0
          t = piece.respond_to?(:thickness) ? piece.thickness.to_f : 0

          if w <= 0 || h <= 0
            @issues << Issue.new(
              severity: SEVERITY_ERROR,
              code: 'DIM_ZERO',
              message: "Peca '#{piece_label(piece)}' tem dimensoes invalidas (#{w.round(1)} x #{h.round(1)} mm).",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Verifique se a geometria da peca esta correta e nao e um ponto ou linha.'
            )
          end

          if t < MIN_THICKNESS || t > MAX_THICKNESS
            @issues << Issue.new(
              severity: SEVERITY_ERROR,
              code: 'DIM_THICKNESS',
              message: "Peca '#{piece_label(piece)}' tem espessura fora do intervalo permitido (#{t.round(1)} mm). Esperado: #{MIN_THICKNESS}-#{MAX_THICKNESS} mm.",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Ajuste a espessura da peca ou verifique se o grupo esta correto.'
            )
          end
        end
      end

      # ─── 3. check_suspicious_thickness ────────────────────
      # Thickness < 6mm but piece is not back panel. Warning.
      def check_suspicious_thickness
        pieces.each do |piece|
          t = piece.respond_to?(:thickness) ? piece.thickness.to_f : 0
          is_back = piece.respond_to?(:back_panel?) ? piece.back_panel? : false
          role = piece.respond_to?(:role) ? piece.role : :unknown

          if t > 0 && t < SUSPICIOUS_THICKNESS_THRESHOLD && !is_back && role != :back_panel
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'DIM_THIN',
              message: "Peca '#{piece_label(piece)}' tem espessura fina (#{t.round(1)} mm) mas nao e fundo.",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Se for um fundo, atribua o papel (role) "back_panel". Caso contrario, verifique a espessura.'
            )
          end
        end
      end

      # ─── 4. check_hole_in_bounds ──────────────────────────
      # Every hole X,Y must be within piece dimensions. Error.
      def check_hole_in_bounds
        pieces.each do |piece|
          w = piece.respond_to?(:width) ? piece.width.to_f : 0
          h = piece.respond_to?(:height) ? piece.height.to_f : 0
          t = piece.respond_to?(:thickness) ? piece.thickness.to_f : 0

          holes = holes_for_piece(piece)
          holes.each do |hole|
            face = hole[:face].to_s.downcase
            hx = hole[:x]
            hy = hole[:y]

            # Determine bounds depending on face
            case face
            when 'top', 'bottom', 'face5', 'face6'
              max_x = w
              max_y = h
            when 'front', 'back', 'face3', 'face4'
              max_x = w
              max_y = t
            when 'left', 'right', 'face1', 'face2'
              max_x = h
              max_y = t
            else
              max_x = w
              max_y = h
            end

            if hx < 0 || hx > max_x || hy < 0 || hy > max_y
              @issues << Issue.new(
                severity: SEVERITY_ERROR,
                code: 'HOLE_OOB',
                message: "Furo em (#{hx.round(1)}, #{hy.round(1)}) fora dos limites da peca '#{piece_label(piece)}' (#{max_x.round(1)} x #{max_y.round(1)}).",
                piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
                module_name: module_name_for(piece),
                suggestion: 'Verifique os parametros de ferragem ou reposicione a peca.'
              )
            end
          end
        end
      end

      # ─── 5. check_hole_edge_distance ──────────────────────
      # Holes closer than 10mm to edge. Warning.
      def check_hole_edge_distance
        pieces.each do |piece|
          w = piece.respond_to?(:width) ? piece.width.to_f : 0
          h = piece.respond_to?(:height) ? piece.height.to_f : 0

          holes = holes_for_piece(piece)
          holes.each do |hole|
            hx = hole[:x]
            hy = hole[:y]
            r = hole[:diameter] / 2.0

            dist_left   = hx - r
            dist_right  = w - hx - r
            dist_bottom = hy - r
            dist_top    = h - hy - r
            min_dist = [dist_left, dist_right, dist_bottom, dist_top].min

            next unless min_dist >= 0 && min_dist < MIN_HOLE_EDGE_DISTANCE

            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'HOLE_EDGE',
              message: "Furo em (#{hx.round(1)}, #{hy.round(1)}) esta a #{min_dist.round(1)} mm da borda na peca '#{piece_label(piece)}'. Minimo recomendado: #{MIN_HOLE_EDGE_DISTANCE} mm.",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Afaste o furo da borda para evitar lascamento durante a usinagem.'
            )
          end
        end
      end

      # ─── 6. check_joint_without_hardware ──────────────────
      # Detected joint has no associated machining. Warning.
      def check_joint_without_hardware
        joints.each do |joint|
          pa_id = joint.respond_to?(:piece_a) ? joint.piece_a.persistent_id : nil
          pb_id = joint.respond_to?(:piece_b) ? joint.piece_b.persistent_id : nil

          has_machining_a = @machining.key?(pa_id) && !(@machining[pa_id]['workers'] || {}).empty?
          has_machining_b = @machining.key?(pb_id) && !(@machining[pb_id]['workers'] || {}).empty?

          unless has_machining_a || has_machining_b
            label_a = joint.piece_a.respond_to?(:entity) ? piece_label(joint.piece_a) : pa_id
            label_b = joint.piece_b.respond_to?(:entity) ? piece_label(joint.piece_b) : pb_id

            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'JOINT_NO_HW',
              message: "Juncao entre '#{label_a}' e '#{label_b}' (#{joint.type}) sem usinagem associada.",
              piece_id: pa_id,
              module_name: nil,
              suggestion: 'Execute "Processar" no modulo para gerar furacoes, ou verifique se os papeis (roles) estao corretos.'
            )
          end
        end
      end

      # ─── 7. check_orphan_hardware ─────────────────────────
      # Hinge holes on piece without door joint. Warning.
      def check_orphan_hardware
        pieces.each do |piece|
          pid = piece.respond_to?(:persistent_id) ? piece.persistent_id : nil
          next unless pid

          piece_workers = (@machining[pid] || {})['workers'] || {}
          has_hinge_holes = piece_workers.any? { |_k, op|
            t = (op['type'] || op[:type]).to_s
            t =~ /hinge|cup|dobradica/i
          }

          next unless has_hinge_holes

          # Check if this piece has a door joint
          has_door_joint = joints.any? { |j|
            next false unless j.involves?(piece)
            partner = j.partner_of(piece)
            partner && (partner.door? || partner.role == :door)
          }

          # Also ok if the piece itself is a door
          is_door = piece.respond_to?(:door?) ? piece.door? : (piece.respond_to?(:role) && piece.role == :door)

          unless has_door_joint || is_door
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'HW_ORPHAN_HINGE',
              message: "Peca '#{piece_label(piece)}' tem furos de dobradica mas nao possui juncao com porta.",
              piece_id: pid,
              module_name: module_name_for(piece),
              suggestion: 'Verifique se a porta esta corretamente posicionada no modulo ou remova as dobradicas.'
            )
          end
        end
      end

      # ─── 8. check_edge_banding_consistency ────────────────
      # Frontal has banding but traseira doesn't on a visible piece. Warning.
      def check_edge_banding_consistency
        pieces.each do |piece|
          next unless piece.respond_to?(:entity)
          next if piece.respond_to?(:back_panel?) && piece.back_panel?

          dict = piece.entity.respond_to?(:attribute_dictionary) ?
                   piece.entity.attribute_dictionary('ornato_edges') : nil
          next unless dict

          front_band = dict['front'] || dict['frente'] || dict[:front]
          back_band  = dict['back'] || dict['traseira'] || dict[:back]

          # Visible pieces (doors, drawer fronts) that have front banding but not back
          is_visible = piece.respond_to?(:role) &&
                       [:door, :drawer_front, :frente].include?(piece.role)

          if is_visible && front_band && !back_band
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'EDGE_INCONSISTENT',
              message: "Peca visivel '#{piece_label(piece)}' tem fita de borda na frente mas nao na traseira.",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Pecas visiveis geralmente precisam de fita de borda em todos os lados expostos.'
            )
          end
        end
      end

      # ─── 9. check_unmapped_material ───────────────────────
      # Material in model but not in mapping. Error.
      def check_unmapped_material
        model_materials = (@analysis[:materials] || []).uniq
        map = material_map

        model_materials.each do |mat_name|
          next if mat_name.nil? || mat_name.to_s.strip.empty?

          mapped = map[mat_name] || map[mat_name.to_s] || map[mat_name.to_sym]
          next if mapped && !mapped.to_s.strip.empty?

          @issues << Issue.new(
            severity: SEVERITY_ERROR,
            code: 'MAT_UNMAPPED',
            message: "Material '#{mat_name}' encontrado no modelo mas nao tem mapeamento configurado.",
            piece_id: nil,
            module_name: nil,
            suggestion: "Abra 'Mapeamento de Materiais' e associe '#{mat_name}' a um material da biblioteca Ornato."
          )
        end
      end

      # ─── 10. check_duplicate_pieces ───────────────────────
      # Same position + same dimensions = likely duplicate. Warning.
      def check_duplicate_pieces
        seen = {}

        pieces.each do |piece|
          w = piece.respond_to?(:width) ? piece.width.to_f.round(1) : 0
          h = piece.respond_to?(:height) ? piece.height.to_f.round(1) : 0
          t = piece.respond_to?(:thickness) ? piece.thickness.to_f.round(1) : 0
          ox = piece.respond_to?(:origin) ? piece.origin[0].to_f.round(0) : 0
          oy = piece.respond_to?(:origin) ? piece.origin[1].to_f.round(0) : 0
          oz = piece.respond_to?(:origin) ? piece.origin[2].to_f.round(0) : 0

          key = "#{w}_#{h}_#{t}_#{ox}_#{oy}_#{oz}"

          if seen[key]
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'PIECE_DUPLICATE',
              message: "Peca '#{piece_label(piece)}' parece ser duplicata de '#{piece_label(seen[key])}' (mesma posicao e dimensoes).",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Verifique se ha pecas sobrepostas no modelo. Remova duplicatas.'
            )
          else
            seen[key] = piece
          end
        end
      end

      # ─── 11. check_empty_module ───────────────────────────
      # Module group with no detected pieces. Error.
      def check_empty_module
        modules_list.each do |mod|
          mod_pieces = mod[:pieces] || mod['pieces']

          if mod_pieces.nil? || mod_pieces.empty?
            mod_name = mod[:name] || mod['name'] || 'Sem nome'
            @issues << Issue.new(
              severity: SEVERITY_ERROR,
              code: 'MOD_EMPTY',
              message: "Modulo '#{mod_name}' nao contem pecas detectadas.",
              piece_id: nil,
              module_name: mod_name,
              suggestion: 'Verifique se o modulo contem grupos/componentes que representem pecas (espessura 2-50mm).'
            )
          end
        end
      end

      # ─── 12. check_hole_overlap ───────────────────────────
      # Two holes with centers closer than max(d1,d2)/2. Error.
      def check_hole_overlap
        pieces.each do |piece|
          holes = holes_for_piece(piece)
          next if holes.length < 2

          # Group holes by face
          by_face = holes.group_by { |h| h[:face] }

          by_face.each do |face, face_holes|
            face_holes.combination(2).each do |a, b|
              dist = Math.sqrt((a[:x] - b[:x])**2 + (a[:y] - b[:y])**2)
              min_dist = [a[:diameter], b[:diameter]].max / 2.0

              if dist < min_dist && dist > 0
                @issues << Issue.new(
                  severity: SEVERITY_ERROR,
                  code: 'HOLE_OVERLAP',
                  message: "Furos sobrepostos na peca '#{piece_label(piece)}' face #{face}: distancia #{dist.round(1)} mm, minimo #{min_dist.round(1)} mm.",
                  piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
                  module_name: module_name_for(piece),
                  suggestion: 'Verifique os parametros de ferragem. Pode haver conflito entre diferentes tipos de furacao.'
                )
              end
            end
          end
        end
      end

      # ─── 13. check_non_rectangular ────────────────────────
      # Piece geometry not a simple box. Warning.
      def check_non_rectangular
        pieces.each do |piece|
          next unless piece.respond_to?(:entity)
          ent = piece.entity

          # Count faces — a rectangular box has exactly 6 faces
          face_count = 0
          if ent.respond_to?(:definition)
            face_count = ent.definition.entities.grep(Sketchup::Face).length
          elsif ent.respond_to?(:entities)
            face_count = ent.entities.grep(Sketchup::Face).length
          end

          # Skip if we can't determine face count (no SketchUp context)
          next if face_count == 0

          if face_count != 6
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'GEOM_NON_RECT',
              message: "Peca '#{piece_label(piece)}' nao e um prisma retangular simples (#{face_count} faces detectadas).",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Pecas com recortes ou chanfros podem precisar de ajustes manuais na exportacao CNC.'
            )
          end
        end
      end

      # ─── 14. check_piece_count ────────────────────────────
      # Info with total counts.
      def check_piece_count
        total_pieces = pieces.length
        total_with_machining = @machining.keys.length
        total_ops = @machining.values.sum { |m| (m['workers'] || m[:workers] || {}).length }

        @issues << Issue.new(
          severity: SEVERITY_INFO,
          code: 'STATS_PIECES',
          message: "Total: #{total_pieces} pecas, #{total_with_machining} com usinagem, #{total_ops} operacoes.",
          piece_id: nil,
          module_name: nil,
          suggestion: nil
        )

        # Module-level summary
        modules_list.each do |mod|
          mod_name = mod[:name] || mod['name'] || 'Modulo'
          mod_piece_count = (mod[:pieces] || mod['pieces'] || []).length
          @issues << Issue.new(
            severity: SEVERITY_INFO,
            code: 'STATS_MODULE',
            message: "Modulo '#{mod_name}': #{mod_piece_count} pecas.",
            piece_id: nil,
            module_name: mod_name,
            suggestion: nil
          )
        end
      end

      # ─── 15. check_erp_connection ─────────────────────────
      # Tests API connection. Info.
      def check_erp_connection
        api_cfg = @config[:api] || @config['api'] || {}
        url = (api_cfg[:url] || api_cfg['url'] || '').to_s.strip

        if url.empty?
          @issues << Issue.new(
            severity: SEVERITY_INFO,
            code: 'ERP_NOT_CONFIGURED',
            message: 'Conexao com Ornato ERP nao configurada.',
            piece_id: nil,
            module_name: nil,
            suggestion: 'Configure a URL do ERP em Configuracoes para sincronizar diretamente.'
          )
          return
        end

        begin
          uri = URI.parse("#{url.chomp('/')}/api/cnc/plugin")
          http = Net::HTTP.new(uri.host, uri.port)
          http.open_timeout = 5
          http.read_timeout = 5
          http.use_ssl = (uri.scheme == 'https')

          request = Net::HTTP::Get.new(uri.request_uri)
          token = api_cfg[:token] || api_cfg['token'] || ''
          request['Authorization'] = "Bearer #{token}" unless token.empty?

          response = http.request(request)

          if response.is_a?(Net::HTTPSuccess)
            @issues << Issue.new(
              severity: SEVERITY_INFO,
              code: 'ERP_OK',
              message: "Conexao com Ornato ERP OK (#{url}).",
              piece_id: nil,
              module_name: nil,
              suggestion: nil
            )
          else
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'ERP_ERROR',
              message: "Ornato ERP retornou erro #{response.code}: #{response.message}.",
              piece_id: nil,
              module_name: nil,
              suggestion: 'Verifique se o servidor ERP esta rodando e o token esta correto.'
            )
          end
        rescue Errno::ECONNREFUSED, Errno::ETIMEDOUT, SocketError, Timeout::Error => e
          @issues << Issue.new(
            severity: SEVERITY_WARNING,
            code: 'ERP_UNREACHABLE',
            message: "Nao foi possivel conectar ao Ornato ERP: #{e.message}",
            piece_id: nil,
            module_name: nil,
            suggestion: 'Verifique se o servidor esta rodando e acessivel na rede.'
          )
        rescue => e
          @issues << Issue.new(
            severity: SEVERITY_INFO,
            code: 'ERP_CHECK_SKIPPED',
            message: "Verificacao de conexao ERP ignorada: #{e.class}",
            piece_id: nil,
            module_name: nil,
            suggestion: nil
          )
        end
      end
      # ─── 16. check_module_interference ───────────────────
      # Two modules with overlapping bounding boxes. Warning.
      def check_module_interference
        mods = modules_list
        return if mods.length < 2

        mods.combination(2).each do |ma, mb|
          ga = ma[:group]
          gb = mb[:group]
          next unless ga.respond_to?(:bounds) && gb.respond_to?(:bounds)

          ba = ga.bounds
          bb = gb.bounds
          next if ba.empty? || bb.empty?

          # Check overlap in all 3 axes
          overlap_x = ba.max.x > bb.min.x && bb.max.x > ba.min.x
          overlap_y = ba.max.y > bb.min.y && bb.max.y > ba.min.y
          overlap_z = ba.max.z > bb.min.z && bb.max.z > ba.min.z

          if overlap_x && overlap_y && overlap_z
            name_a = ga.respond_to?(:name) ? ga.name : 'modulo A'
            name_b = gb.respond_to?(:name) ? gb.name : 'modulo B'
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'MOD_INTERFERENCE',
              message: "Modulos '#{name_a}' e '#{name_b}' se sobrepoem no espaco. " \
                       "Podem haver colisoes indesejadas.",
              piece_id: nil,
              module_name: name_a,
              suggestion: 'Verifique o posicionamento dos modulos e afaste-os se necessario.'
            )
          end
        end
      rescue => e
        # Silently skip if SketchUp bounds not available
      end

      # ─── 17. check_transport_limits ───────────────────────
      # Pieces exceeding standard sheet size (2750mm). Warning.
      def check_transport_limits
        max_sheet = 2750.0  # mm — standard max sheet length

        pieces.each do |piece|
          w = piece.respond_to?(:width)  ? piece.width.to_f  : 0
          h = piece.respond_to?(:height) ? piece.height.to_f : 0
          max_dim = [w, h].max

          if max_dim > max_sheet
            @issues << Issue.new(
              severity: SEVERITY_ERROR,
              code: 'DIM_EXCEEDS_SHEET',
              message: "Peca '#{piece_label(piece)}' tem #{max_dim.round(0)}mm, " \
                       "excede o tamanho maximo de chapa (#{max_sheet.to_i}mm).",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Divida a peca em duas partes ou use uma chapa especial.'
            )
          elsif max_dim > 2440
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'DIM_LARGE_PIECE',
              message: "Peca '#{piece_label(piece)}' tem #{max_dim.round(0)}mm. " \
                       "Pode nao caber em chapas padrao 2440mm.",
              piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
              module_name: module_name_for(piece),
              suggestion: 'Verifique a disponibilidade de chapas no tamanho necessario.'
            )
          end
        end
      end

      # ─── 18. check_edge_vs_hole_position ──────────────────
      # Edge banding thickness affects hole position. Info.
      def check_edge_vs_hole_position
        pieces.each do |piece|
          next unless piece.respond_to?(:entity) && piece.entity.respond_to?(:get_attribute)

          # Check if piece has 2mm+ edge banding
          %w[top bottom left right].each do |side|
            edge = piece.entity.get_attribute('ornato', "edge_#{side}", nil)
            next unless edge.is_a?(String) && edge =~ /BOR_(\d+)/

            edge_thick = $1.to_f
            next if edge_thick < 2.0

            # Check if any hole is close to this edge
            holes = holes_for_piece(piece)
            holes.each do |hole|
              # Simplified check — hole near the edged side
              w = piece.respond_to?(:width)  ? piece.width.to_f  : 0
              h = piece.respond_to?(:height) ? piece.height.to_f : 0

              edge_dist = case side
                          when 'left'   then hole[:x]
                          when 'right'  then w - hole[:x]
                          when 'bottom' then hole[:y]
                          when 'top'    then h - hole[:y]
                          end

              if edge_dist && edge_dist < 50 && edge_dist > 0
                @issues << Issue.new(
                  severity: SEVERITY_INFO,
                  code: 'EDGE_HOLE_OFFSET',
                  message: "Furo em #{piece_label(piece)} lado #{side}: borda #{edge_thick}mm " \
                           "pode deslocar o furo em #{edge_thick}mm. Distancia atual: #{edge_dist.round(1)}mm.",
                  piece_id: piece.respond_to?(:persistent_id) ? piece.persistent_id : nil,
                  module_name: module_name_for(piece),
                  suggestion: 'Considere compensar a espessura da borda no posicionamento dos furos.'
                )
                break  # One warning per side is enough
              end
            end
          end
        end
      end

      # ─── 19. check_symmetry ───────────────────────────────
      # LAT_ESQ and LAT_DIR should have same dimensions. Warning.
      def check_symmetry
        modules_list.each do |mod|
          mod_pieces = mod[:pieces] || []
          laterals = mod_pieces.select do |p|
            piece = p[:piece] || p
            role = piece.respond_to?(:role) ? piece.role : nil
            name = piece.respond_to?(:entity) && piece.entity.respond_to?(:name) ? piece.entity.name.to_s.upcase : ''
            role == :lateral || name =~ /^LAT_/
          end

          next if laterals.length < 2

          # Compare first two laterals
          a = laterals[0][:piece] || laterals[0]
          b = laterals[1][:piece] || laterals[1]

          wa = a.respond_to?(:width)  ? a.width.to_f.round(1) : 0
          ha = a.respond_to?(:height) ? a.height.to_f.round(1) : 0
          wb = b.respond_to?(:width)  ? b.width.to_f.round(1) : 0
          hb = b.respond_to?(:height) ? b.height.to_f.round(1) : 0

          if wa != wb || ha != hb
            mod_name = mod[:group].respond_to?(:name) ? mod[:group].name : 'modulo'
            @issues << Issue.new(
              severity: SEVERITY_WARNING,
              code: 'SYMMETRY_MISMATCH',
              message: "Laterais de '#{mod_name}' tem dimensoes diferentes: " \
                       "#{wa}x#{ha}mm vs #{wb}x#{hb}mm.",
              piece_id: nil,
              module_name: mod_name,
              suggestion: 'Verifique se as laterais devem ter o mesmo tamanho. ' \
                          'Diferenca pode indicar erro de modelagem.'
            )
          end
        end
      end

      # ─── 20. check_depth_vs_thickness ─────────────────────
      # Hole depth exceeding 85% of piece thickness. Error.
      def check_depth_vs_thickness
        pieces.each do |piece|
          t = piece.respond_to?(:thickness) ? piece.thickness.to_f : 0
          next if t <= 0

          pid = piece.respond_to?(:persistent_id) ? piece.persistent_id : nil
          next unless pid

          workers = (@machining[pid] || {})['workers'] || {}
          workers.each do |key, op|
            next unless op.is_a?(Hash)
            depth = (op['depth'] || 0).to_f
            through = op['through']
            next if through || depth <= 0

            if depth > t * 0.85
              @issues << Issue.new(
                severity: SEVERITY_ERROR,
                code: 'DEPTH_EXCEEDS',
                message: "#{op['description'] || key} em '#{piece_label(piece)}': " \
                         "profundidade #{depth}mm em chapa #{t}mm " \
                         "(#{((depth / t) * 100).round(0)}%). Risco de perfurar.",
                piece_id: pid,
                module_name: module_name_for(piece),
                suggestion: 'Reduza a profundidade do furo ou use chapa mais grossa.'
              )
            end
          end
        end
      end
    end
  end
end
