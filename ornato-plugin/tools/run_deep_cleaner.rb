# ═══════════════════════════════════════════════════════════════════════
# run_deep_cleaner.rb — Wrapper seguro pra LibraryDeepCleaner
#
# USO:
#   1. Abrir SketchUp
#   2. Window → Ruby Console
#   3. Cole: load '/Users/madeira/SISTEMA NOVO/ornato-plugin/tools/run_deep_cleaner.rb'
#
# O QUE FAZ:
#   - Backup automático em wps_working/backups_pre_deep_clean/<timestamp>/
#   - Roda LibraryDeepCleaner.run_interactive! (com diálogo de confirmação)
#   - Loga progresso em arquivo .log do timestamp
#   - Idempotente (pode rodar 2x sem corromper)
#
# DURAÇÃO ESTIMADA: ~15-20 minutos (386 .skp × 2-3 segundos)
#
# REVERSÍVEL: backup criado antes; se der ruim:
#   rm -rf biblioteca/modelos_ornato
#   cp -R wps_working/backups_pre_deep_clean/<timestamp> biblioteca/modelos_ornato
# ═══════════════════════════════════════════════════════════════════════

require 'fileutils'
require 'time'

PLUGIN_ROOT = File.expand_path('..', __dir__)
SRC  = File.join(PLUGIN_ROOT, 'biblioteca', 'modelos_ornato')
TS   = Time.now.strftime('%Y%m%d_%H%M%S')
BAK  = File.join(PLUGIN_ROOT, 'wps_working', 'backups_pre_deep_clean', TS)
LOG  = File.join(PLUGIN_ROOT, 'wps_working', 'deep_clean_logs', "#{TS}.log")

unless defined?(Sketchup)
  abort "ERRO: este script deve rodar DENTRO do SketchUp Ruby Console.\n" \
        "Como abrir: SketchUp → Window → Ruby Console → cole 'load \"#{__FILE__}\"'"
end

unless Dir.exist?(SRC)
  raise "Diretório não encontrado: #{SRC}\nRode primeiro: ruby tools/clone_library_clean.rb"
end

# ─── 1. Backup ────────────────────────────────────────────────────────
puts "═══ Deep Cleaner — #{TS} ═══"
puts "Backup → #{BAK}"
FileUtils.mkdir_p(File.dirname(LOG))
FileUtils.mkdir_p(BAK)

# cp -R (preserva estrutura)
start = Time.now
FileUtils.cp_r(Dir.glob(File.join(SRC, '*')), BAK)
dur_backup = (Time.now - start).round(1)
files = Dir.glob(File.join(SRC, '**', '*.skp'))
puts "✓ Backup feito em #{dur_backup}s (#{files.size} .skp protegidos)"

# ─── 2. Confirma + roda cleaner ───────────────────────────────────────
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'tools', 'library_deep_cleaner')

confirm = UI.messagebox(
  "Backup criado em:\n#{BAK}\n\n" \
  "Limpar #{files.size} arquivos .skp em modelos_ornato/?\n" \
  "Isso remove atributos WPS internos (wpsg*/wpsuser*) e renomeia " \
  "ComponentDefinitions.\n\nDuração: ~15-20 min.\n\nContinuar?",
  MB_YESNO
)

if confirm != IDYES
  puts "✗ Cancelado pelo usuário (backup preservado em #{BAK})"
  return
end

# Abre log
log_file = File.open(LOG, 'w')
log_file.puts "Deep cleaner started at #{Time.now.iso8601}"
log_file.puts "Source: #{SRC}"
log_file.puts "Backup: #{BAK}"
log_file.puts "Files:  #{files.size}"
log_file.puts "─" * 60

stats = { ok: 0, fail: 0, attrs_dropped: 0, defs_renamed: 0 }
t0 = Time.now

files.each_with_index do |path, i|
  pct = ((i + 1) * 100.0 / files.size).round(1)
  elapsed = (Time.now - t0).round(1)
  eta = i > 0 ? ((elapsed / i) * (files.size - i)).round(0) : '?'
  rel = path.sub(PLUGIN_ROOT + '/', '')
  msg = "[#{i + 1}/#{files.size}] (#{pct}%, ETA #{eta}s) #{File.basename(path)}"
  puts msg
  log_file.puts msg
  log_file.flush

  begin
    s = Ornato::Tools::LibraryDeepCleaner.clean_skp_file(path)
    stats[:ok] += 1
    stats[:attrs_dropped] += s[:attrs_dropped]
    stats[:defs_renamed]  += s[:defs_renamed]
  rescue StandardError => e
    stats[:fail] += 1
    err = "  ERRO: #{e.class} #{e.message}"
    warn err
    log_file.puts err
    log_file.puts e.backtrace.first(5).join("\n")
  end

  # A cada 50 arquivos, dá uma pausa pro SketchUp respirar
  if (i + 1) % 50 == 0
    Sketchup.active_model.entities.clear! rescue nil
    GC.start
  end
end

total = (Time.now - t0).round(1)
log_file.puts "─" * 60
log_file.puts "Concluído em #{total}s"
log_file.puts stats.inspect
log_file.close

puts ""
puts "═══════════════════════════════════════"
puts "✓ DEEP CLEAN CONCLUÍDO em #{total}s"
puts "  OK:                #{stats[:ok]} / #{files.size}"
puts "  Falhas:            #{stats[:fail]}"
puts "  Atributos drop:    #{stats[:attrs_dropped]}"
puts "  Definitions renom: #{stats[:defs_renamed]}"
puts "  Log:               #{LOG}"
puts "  Backup:            #{BAK}"
puts "═══════════════════════════════════════"

UI.messagebox(
  "Deep clean concluído em #{total}s!\n\n" \
  "✓ Arquivos OK: #{stats[:ok]} / #{files.size}\n" \
  "Falhas: #{stats[:fail]}\n" \
  "Atributos removidos: #{stats[:attrs_dropped]}\n" \
  "Definitions renomeadas: #{stats[:defs_renamed]}\n\n" \
  "Log salvo em:\n#{LOG}\n\nBackup:\n#{BAK}"
)
