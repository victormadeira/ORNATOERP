# ═══════════════════════════════════════════════════════
# Config — Persistencia de configuracoes do plugin
# ═══════════════════════════════════════════════════════

module Ornato
  module Config
    DEFAULTS = {
      # ─── Ferragens ─────────────────────────────────
      hinge: {
        cup_diameter: 35.0,
        cup_depth: 12.5,
        pilot_diameter: 2.5,
        pilot_depth: 10.0,
        pilot_spacing: 24.0,
        edge_offset: 22.5,
        top_bottom_offset: 100.0,
      },
      system32: {
        hole_diameter: 5.0,
        hole_depth: 12.0,
        spacing: 32.0,
        front_offset: 37.0,
        rear_offset: 37.0,
        top_offset: 37.0,
        bottom_offset: 37.0,
      },
      minifix: {
        body_diameter: 15.0,
        body_depth: 12.0,
        pin_diameter: 8.0,
        pin_depth: 11.0,
        bolt_diameter: 8.0,
        bolt_depth: 18.0, # passante na lateral
        spacing: 128.0,
        min_edge_distance: 50.0,
      },
      dowel: {
        diameter: 8.0,
        depth: 15.0,
        spacing: 128.0,
        min_edge_distance: 50.0,
      },
      handle: {
        hole_diameter: 5.0,
        default_spacing: 160.0, # entre furos do puxador
        door_y_offset: 100.0,   # mm do topo (porta)
        door_x_offset: 37.0,    # mm da borda (porta)
        drawer_centered: true,   # centralizar em gaveta
      },
      drawer_slide: {
        hole_diameter: 4.0,
        patterns: {
          '350mm' => [37, 212, 350],
          '400mm' => [37, 237, 400],
          '450mm' => [37, 260, 450],
          '500mm' => [37, 200, 350, 500],
          '550mm' => [37, 200, 400, 550],
          '600mm' => [37, 200, 400, 600],
        },
      },
      back_panel: {
        groove_width: 4.0,
        groove_depth: 8.0,
        offset_from_back: 10.0, # mm da borda traseira
      },

      # ─── Materiais mapeados ────────────────────────
      material_map: {
        # "Nome material SketchUp" => "codigo_ornato"
      },

      # ─── API Ornato ────────────────────────────────
      api: {
        url: 'http://localhost:3001',
        token: '',
      },

      # ─── Preferencias gerais ───────────────────────
      default_joint_type: 'minifix', # 'minifix' ou 'dowel'
      auto_process_on_export: true,
      show_preview_before_export: true,
      tolerance: 0.5, # mm de tolerancia em deteccao de juncoes
    }.freeze

    def self.load
      stored = Sketchup.read_default('Ornato', 'config', nil)
      if stored
        begin
          merged = deep_merge(DEFAULTS, JSON.parse(stored, symbolize_names: true))
          return merged
        rescue
          # fallback to defaults
        end
      end
      DEFAULTS.dup
    end

    def self.save(config)
      Sketchup.write_default('Ornato', 'config', JSON.generate(config))
    end

    def self.reset
      save(DEFAULTS)
      DEFAULTS.dup
    end

    private

    def self.deep_merge(base, override)
      result = base.dup
      override.each do |key, value|
        if value.is_a?(Hash) && result[key].is_a?(Hash)
          result[key] = deep_merge(result[key], value)
        else
          result[key] = value
        end
      end
      result
    end
  end
end
