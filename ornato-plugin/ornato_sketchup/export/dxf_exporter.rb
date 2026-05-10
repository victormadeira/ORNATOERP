# =====================================================
# DxfExporter -- Exporta peças+usinagem para arquivos
# DXF 2D R12-compat com camadas CNC convencionais.
#
# Um arquivo .dxf por peça-chapa. Layers:
#   OUTLINE                  contorno da chapa (LWPOLYLINE fechada)
#   DRILL_TOPSIDE            furos face superior (CIRCLE)
#   DRILL_UNDERSIDE          furos face inferior (CIRCLE)
#   DRILL_EDGE_LEFT/RIGHT/FRONT/BACK
#                            furos de borda projetados
#   POCKET_TOPSIDE / POCKET_UNDERSIDE
#                            rebaixos (LWPOLYLINE fechada)
#   GROOVE_TOPSIDE / GROOVE_UNDERSIDE
#                            sulcos (LINE)
#   EDGE_BANDING             marcadores de fita (MTEXT)
#   LABEL                    metadados peça/módulo
#
# Profundidade/tool/feed embarcados via XDATA (app id ORNATO)
# em cada CIRCLE/LWPOLYLINE/LINE de operação. Fallback: MTEXT
# anotando 50mm acima do furo.
# =====================================================

require 'fileutils'
require_relative '../machining/machining_json'

module Ornato
  module Export
    class DxfExporter
      # Mapeamento de side cru → layer alvo (drills)
      DRILL_LAYER_BY_SIDE = {
        'a'           => 'DRILL_TOPSIDE',
        'topside'     => 'DRILL_TOPSIDE',
        'b'           => 'DRILL_UNDERSIDE',
        'underside'   => 'DRILL_UNDERSIDE',
        'edge_left'   => 'DRILL_EDGE_LEFT',
        'edge_right'  => 'DRILL_EDGE_RIGHT',
        'edge_front'  => 'DRILL_EDGE_FRONT',
        'edge_back'   => 'DRILL_EDGE_BACK',
      }.freeze

      POCKET_LAYER_BY_SIDE = {
        'a' => 'POCKET_TOPSIDE', 'topside' => 'POCKET_TOPSIDE',
        'b' => 'POCKET_UNDERSIDE', 'underside' => 'POCKET_UNDERSIDE',
      }.freeze

      GROOVE_LAYER_BY_SIDE = {
        'a' => 'GROOVE_TOPSIDE', 'topside' => 'GROOVE_TOPSIDE',
        'b' => 'GROOVE_UNDERSIDE', 'underside' => 'GROOVE_UNDERSIDE',
      }.freeze

      # ACI color codes (AutoCAD Color Index) — apenas por organização visual
      LAYER_COLORS = {
        'OUTLINE'           => 7,   # white/black
        'DRILL_TOPSIDE'     => 1,   # red
        'DRILL_UNDERSIDE'   => 2,   # yellow
        'DRILL_EDGE_LEFT'   => 3,   # green
        'DRILL_EDGE_RIGHT'  => 4,   # cyan
        'DRILL_EDGE_FRONT'  => 5,   # blue
        'DRILL_EDGE_BACK'   => 6,   # magenta
        'POCKET_TOPSIDE'    => 30,
        'POCKET_UNDERSIDE'  => 30,
        'GROOVE_TOPSIDE'    => 9,
        'GROOVE_UNDERSIDE'  => 9,
        'EDGE_BANDING'      => 8,
        'LABEL'             => 8,
      }.freeze

      ALL_LAYERS = LAYER_COLORS.keys.freeze

      # @param machining_data [Hash] {
      #   pieces: [{ persistent_id:, name:, comprimento:, largura:, espessura:,
      #              edges: {right:,left:,front:,back:} }, ...],
      #   machining: { persistent_id => Array<op_hash> },
      #   project: { name:, code: } (opcional)
      # }
      def initialize(machining_data)
        @data = machining_data || {}
        @pieces = @data[:pieces] || @data['pieces'] || []
        @machining = @data[:machining] || @data['machining'] || {}
        @project = @data[:project] || @data['project'] || {}
      end

      # Escreve um .dxf por peça em out_dir.
      # @return [Hash] { files:, errors:, stats: }
      def export_to_dir(out_dir)
        FileUtils.mkdir_p(out_dir)
        files = []
        errors = []
        total_drills = 0

        @pieces.each_with_index do |piece, idx|
          begin
            pid = (piece[:persistent_id] || piece['persistent_id'] || "p#{idx}").to_s
            name = (piece[:name] || piece['name'] || "peca_#{idx}").to_s
            slug = slugify(name)
            fname = "peca_#{slugify(pid)}_#{slug}.dxf"
            path = File.join(out_dir, fname)

            ops = @machining[pid] || @machining[pid.to_sym] || []
            ops = ops.values if ops.is_a?(Hash)

            dxf = build_dxf_for_piece(piece, ops)
            File.write(path, dxf)
            files << path
            total_drills += ops.count { |o| op_category(o) == 'hole' }
          rescue => e
            errors << "peca[#{idx}]: #{e.class}: #{e.message}"
          end
        end

        {
          files: files,
          errors: errors,
          stats: { pieces: files.length, drillings: total_drills },
        }
      end

      private

      # ── DXF builder ────────────────────────────────

      def build_dxf_for_piece(piece, ops)
        comp = (piece[:comprimento] || piece['comprimento'] || 0).to_f
        larg = (piece[:largura] || piece['largura'] || 0).to_f
        esp  = (piece[:espessura] || piece['espessura'] || 0).to_f
        name = (piece[:name] || piece['name'] || '').to_s
        pid  = (piece[:persistent_id] || piece['persistent_id'] || '').to_s

        @entities = []

        # 1) Outline da chapa: rect (0,0)→(comp,larg)
        add_lwpolyline('OUTLINE',
          [[0, 0], [comp, 0], [comp, larg], [0, larg]],
          closed: true)

        # 2) Label metadata
        add_text('LABEL', 5, larg + 10,
          "#{pid} | #{name} | #{comp.to_i}x#{larg.to_i}x#{esp.to_i}", 4.0)

        # 3) Operações
        ops.each do |op|
          emit_operation(op, comp, larg, esp)
        end

        # 4) Edge banding markers (MTEXT em meio da borda)
        edges = piece[:edges] || piece['edges'] || {}
        emit_edge_banding(edges, comp, larg)

        assemble_dxf
      end

      def emit_operation(op, comp, larg, esp)
        cat = op_category(op)
        side = (op[:side] || op['side'] || 'a').to_s

        case cat
        when 'hole'
          emit_hole(op, side, comp, larg, esp)
        when 'pocket'
          emit_pocket(op, side)
        when 'groove'
          emit_groove(op, side)
        when 'route', 'contour'
          emit_route(op, side)
        when 'Transfer_vertical_saw_cut', 'Transfer_horizontal_saw_cut'
          emit_groove(op, side) # tratado como linha
        end
      end

      def emit_hole(op, side, comp, larg, esp)
        layer = DRILL_LAYER_BY_SIDE[side] || 'DRILL_TOPSIDE'
        diam = (op[:diameter] || op['diameter'] || 0).to_f
        depth = (op[:depth] || op['depth'] || 0).to_f
        tool = (op[:tool_code] || op['tool_code'] || '').to_s

        # Para furos de borda, projetar coords no plano da borda.
        # Convenção: position_x = posição ao longo da borda, position_y =
        # altura na espessura. Renderizamos o furo no plano da chapa
        # projetado conforme borda:
        x = (op[:position_x] || op['position_x'] || 0).to_f
        y = (op[:position_y] || op['position_y'] || 0).to_f

        cx, cy =
          case side
          when 'edge_left'   then [0, x]            # furo na borda esquerda, posicionado em y=x ao longo do comprimento
          when 'edge_right'  then [comp, x]
          when 'edge_front'  then [x, 0]
          when 'edge_back'   then [x, larg]
          else                    [x, y]
          end

        add_circle(layer, cx, cy, diam,
                   xdata: { 'depth_mm' => depth, 'tool_code' => tool, 'side' => side })

        # Fallback textual: anotação 50mm acima do furo
        add_text('LABEL', cx + diam, cy + 2.5,
                 "D#{fmt(diam)} P#{fmt(depth)}#{tool.empty? ? '' : ' T'+tool}", 2.5)
      end

      def emit_pocket(op, side)
        layer = POCKET_LAYER_BY_SIDE[side] || 'POCKET_TOPSIDE'
        x = (op[:position_x] || op['position_x'] || 0).to_f
        y = (op[:position_y] || op['position_y'] || 0).to_f
        w = (op[:width] || op['width'] || 0).to_f
        h = (op[:height] || op['height'] || 0).to_f
        depth = (op[:depth] || op['depth'] || 0).to_f
        tool = (op[:tool_code] || op['tool_code'] || '').to_s

        add_lwpolyline(layer,
          [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
          closed: true,
          xdata: { 'depth_mm' => depth, 'tool_code' => tool, 'side' => side })

        add_text('LABEL', x + 2, y + h / 2.0,
                 "POCKET P#{fmt(depth)}#{tool.empty? ? '' : ' T'+tool}", 2.5)
      end

      def emit_groove(op, side)
        layer = GROOVE_LAYER_BY_SIDE[side] || 'GROOVE_TOPSIDE'
        sx = (op[:start_x] || op['start_x'] || 0).to_f
        sy = (op[:start_y] || op['start_y'] || 0).to_f
        ex = (op[:end_x]   || op['end_x']   || 0).to_f
        ey = (op[:end_y]   || op['end_y']   || 0).to_f
        depth = (op[:depth] || op['depth'] || 0).to_f
        width = (op[:width] || op['width'] || 0).to_f
        tool  = (op[:tool_code] || op['tool_code'] || '').to_s

        add_line(layer, sx, sy, ex, ey,
                 xdata: { 'depth_mm' => depth, 'width_mm' => width,
                          'tool_code' => tool, 'side' => side })
      end

      def emit_route(op, side)
        layer = side == 'underside' || side == 'b' ? 'POCKET_UNDERSIDE' : 'POCKET_TOPSIDE'
        pts_raw = op[:points] || op['points'] || []
        pts = pts_raw.map do |pt|
          if pt.is_a?(Array)
            [pt[0].to_f, pt[1].to_f]
          else
            [(pt[:x] || pt['x'] || 0).to_f, (pt[:y] || pt['y'] || 0).to_f]
          end
        end
        return if pts.length < 2
        closed = !!(op[:closed] || op['closed'])
        add_lwpolyline(layer, pts, closed: closed,
          xdata: { 'depth_mm' => (op[:depth] || op['depth'] || 0).to_f,
                   'tool_code' => (op[:tool_code] || op['tool_code'] || '').to_s,
                   'side' => side })
      end

      def emit_edge_banding(edges, comp, larg)
        return unless edges.is_a?(Hash)
        markers = {
          right: [comp, larg / 2.0, 'R'],
          left:  [0, larg / 2.0, 'L'],
          front: [comp / 2.0, 0, 'F'],
          back:  [comp / 2.0, larg, 'B'],
        }
        markers.each do |side_key, (mx, my, code)|
          val = edges[side_key] || edges[side_key.to_s]
          next if val.nil? || val.to_s.empty?
          add_text('EDGE_BANDING', mx, my, "EB:#{code}=#{val}", 3.0)
        end
      end

      # ── Entity adders ──────────────────────────────

      def add_lwpolyline(layer, points, closed: false, xdata: nil)
        @entities << {
          type: 'LWPOLYLINE', layer: layer, points: points, closed: closed, xdata: xdata,
        }
      end

      def add_circle(layer, x, y, diameter, xdata: nil)
        @entities << {
          type: 'CIRCLE', layer: layer, x: x, y: y, r: diameter / 2.0, xdata: xdata,
        }
      end

      def add_line(layer, x1, y1, x2, y2, xdata: nil)
        @entities << {
          type: 'LINE', layer: layer, x1: x1, y1: y1, x2: x2, y2: y2, xdata: xdata,
        }
      end

      def add_text(layer, x, y, text, height)
        @entities << {
          type: 'TEXT', layer: layer, x: x, y: y, text: text, height: height,
        }
      end

      # ── DXF assembly (grupo-código / valor por linhas) ──

      def assemble_dxf
        out = String.new
        write_header(out)
        write_tables(out)
        write_blocks(out)
        write_entities(out)
        write_eof(out)
        out
      end

      def gc(out, code, value)
        out << format("%d\n", code)
        out << "#{value}\n"
      end

      def write_header(out)
        gc(out, 0, 'SECTION')
        gc(out, 2, 'HEADER')
        gc(out, 9, '$ACADVER');  gc(out, 1, 'AC1009') # R12
        gc(out, 9, '$INSUNITS'); gc(out, 70, 4)       # 4 = millimeters
        gc(out, 9, '$MEASUREMENT'); gc(out, 70, 1)    # 1 = metric
        gc(out, 9, '$EXTMIN');  gc(out, 10, '0.0'); gc(out, 20, '0.0'); gc(out, 30, '0.0')
        gc(out, 9, '$EXTMAX');  gc(out, 10, '3000.0'); gc(out, 20, '3000.0'); gc(out, 30, '0.0')
        gc(out, 0, 'ENDSEC')
      end

      def write_tables(out)
        gc(out, 0, 'SECTION')
        gc(out, 2, 'TABLES')

        # APPID — registra ORNATO para XDATA
        gc(out, 0, 'TABLE')
        gc(out, 2, 'APPID')
        gc(out, 70, 1)
        gc(out, 0, 'APPID')
        gc(out, 2, 'ORNATO')
        gc(out, 70, 0)
        gc(out, 0, 'ENDTAB')

        # LAYER
        gc(out, 0, 'TABLE')
        gc(out, 2, 'LAYER')
        gc(out, 70, ALL_LAYERS.length)
        ALL_LAYERS.each do |lname|
          color = LAYER_COLORS[lname] || 7
          gc(out, 0, 'LAYER')
          gc(out, 2, lname)
          gc(out, 70, 0)         # flags
          gc(out, 62, color)     # color (ACI)
          gc(out, 6, 'CONTINUOUS')
        end
        gc(out, 0, 'ENDTAB')

        gc(out, 0, 'ENDSEC')
      end

      def write_blocks(out)
        gc(out, 0, 'SECTION')
        gc(out, 2, 'BLOCKS')
        gc(out, 0, 'ENDSEC')
      end

      def write_entities(out)
        gc(out, 0, 'SECTION')
        gc(out, 2, 'ENTITIES')

        @entities.each do |e|
          case e[:type]
          when 'LWPOLYLINE' then write_lwpolyline(out, e)
          when 'CIRCLE'     then write_circle(out, e)
          when 'LINE'       then write_line(out, e)
          when 'TEXT'       then write_text(out, e)
          end
        end

        gc(out, 0, 'ENDSEC')
      end

      def write_eof(out)
        gc(out, 0, 'EOF')
      end

      def write_lwpolyline(out, e)
        gc(out, 0, 'LWPOLYLINE')
        gc(out, 8, e[:layer])
        gc(out, 100, 'AcDbEntity')
        gc(out, 100, 'AcDbPolyline')
        gc(out, 90, e[:points].length)
        gc(out, 70, e[:closed] ? 1 : 0)
        e[:points].each do |(px, py)|
          gc(out, 10, fmt(px))
          gc(out, 20, fmt(py))
        end
        write_xdata(out, e[:xdata])
      end

      def write_circle(out, e)
        gc(out, 0, 'CIRCLE')
        gc(out, 8, e[:layer])
        gc(out, 10, fmt(e[:x]))
        gc(out, 20, fmt(e[:y]))
        gc(out, 30, '0.0')
        gc(out, 40, fmt(e[:r]))
        write_xdata(out, e[:xdata])
      end

      def write_line(out, e)
        gc(out, 0, 'LINE')
        gc(out, 8, e[:layer])
        gc(out, 10, fmt(e[:x1]))
        gc(out, 20, fmt(e[:y1]))
        gc(out, 30, '0.0')
        gc(out, 11, fmt(e[:x2]))
        gc(out, 21, fmt(e[:y2]))
        gc(out, 31, '0.0')
        write_xdata(out, e[:xdata])
      end

      def write_text(out, e)
        gc(out, 0, 'TEXT')
        gc(out, 8, e[:layer])
        gc(out, 10, fmt(e[:x]))
        gc(out, 20, fmt(e[:y]))
        gc(out, 30, '0.0')
        gc(out, 40, fmt(e[:height]))
        gc(out, 1, sanitize_text(e[:text]))
      end

      def write_xdata(out, xdata)
        return unless xdata.is_a?(Hash) && !xdata.empty?
        gc(out, 1001, 'ORNATO')
        xdata.each do |k, v|
          gc(out, 1000, "#{k}=#{v}")
        end
      end

      # ── Helpers ────────────────────────────────────

      def op_category(op)
        (op[:category] || op['category']).to_s
      end

      def fmt(n)
        format('%.4f', n.to_f)
      end

      def sanitize_text(s)
        s.to_s.gsub(/[\r\n]+/, ' ')
      end

      def slugify(s)
        s.to_s.strip.gsub(/[^a-zA-Z0-9_-]+/, '_').gsub(/_+/, '_').gsub(/^_|_$/, '')[0, 60]
      end
    end
  end
end
