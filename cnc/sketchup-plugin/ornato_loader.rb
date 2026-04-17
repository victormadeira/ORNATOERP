# ═══════════════════════════════════════════════════════
# Ornato SketchUp Plugin — Loader
# Integra SketchUp com Ornato ERP para marcenaria CNC
# ═══════════════════════════════════════════════════════

require 'sketchup'
require 'extensions'

module Ornato
  PLUGIN_NAME = 'Ornato CNC'.freeze
  PLUGIN_VERSION = '0.1.0'.freeze
  PLUGIN_DIR = File.dirname(__FILE__)

  unless file_loaded?(__FILE__)
    ext = SketchupExtension.new(PLUGIN_NAME, File.join(PLUGIN_DIR, 'ornato_sketchup', 'main'))
    ext.description = 'Plugin completo para marcenaria: detecta pecas, gera furacoes automaticas, exporta JSON para CNC Ornato.'
    ext.version = PLUGIN_VERSION
    ext.creator = 'Ornato ERP'
    ext.copyright = "2026, Ornato"

    Sketchup.register_extension(ext, true)
    file_loaded(__FILE__)
  end
end
