# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# test_drilling_collisions.rb
#
# Teste standalone do `Ornato::Machining::DrillingCollisionDetector`.
#
# RODA SEM SKETCHUP:
#   ruby tools/test_drilling_collisions.rb
#
# A classe é puramente algébrica (Math.hypot + comparações), portanto
# não precisa de Sketchup::Model nem Geom::*. Os campos `:normal` são
# opcionais nas operações; quando passados em testes, usamos um struct
# leve que faz duck-type de Geom::Vector3d.
#
# Cenários cobertos:
#   1. overlap_xy (error)             — dobradiça Ø35 vs sys32 Ø8 sobrepostos
#   2. overlap_xy (warning)           — dois sys32 Ø8 a 9mm (margem violada)
#   3. duplicate                      — mesma op repetida exatamente
#   4. edge_too_close                 — furo a 3mm da borda esquerda
#   5. depth_through_other_face       — minifix topside + minifix underside
#                                       cujas profundidades somam > espessura
#   6. intersects_banding             — furo a 5mm da borda com fita
#   7. caso limpo (sanidade)          — 3 sys32 espaçados 32mm, sem colisão
# ═══════════════════════════════════════════════════════════════════════

PLUGIN_ROOT = File.expand_path('..', __dir__)
require File.join(PLUGIN_ROOT, 'ornato_sketchup', 'machining', 'drilling_collision_detector.rb')

# ── Mock leve de Vector3d (apenas pra duck-type opcional) ──────────────
FakeVec = Struct.new(:x, :y, :z)

# ── Utilitário de teste ────────────────────────────────────────────────
$failures = 0
$passes   = 0

def assert(cond, msg)
  if cond
    $passes += 1
    puts "  ✓ #{msg}"
  else
    $failures += 1
    puts "  ✗ FAIL: #{msg}"
  end
end

def find_collisions(result, tipo)
  result[:collisions].select { |c| c[:tipo] == tipo }
end

def section(title)
  puts ""
  puts "── #{title} #{'─' * (70 - title.length)}"
end

# ═══════════════════════════════════════════════════════════════════════
# Cenário 1 — overlap_xy ERROR
# ═══════════════════════════════════════════════════════════════════════
section("Cenário 1 — overlap_xy (error): dobradiça Ø35 vs sys32 Ø8 sobrepostos")
ops_1 = [
  { tipo: :furo_dobradica, peca_id: 42, x_mm: 100.0, y_mm: 50.0, z_mm: 0.0,
    diametro_mm: 35.0, profundidade_mm: 13.0, lado: :topside,
    fonte: 'wps_skp:dobradica_blum.skp' },
  { tipo: :furo_sys32, peca_id: 42, x_mm: 105.0, y_mm: 51.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside,
    fonte: 'wps_skp:sys32.skp' },
]
det_1 = Ornato::Machining::DrillingCollisionDetector.new(ops_1)
res_1 = det_1.analyze
overlaps_1 = find_collisions(res_1, :overlap_xy)
assert(overlaps_1.size == 1, "deve detectar 1 overlap_xy")
assert(overlaps_1.first[:severity] == :error, "severity = :error (sobreposição real)")
assert(res_1[:stats][:by_severity][:error] >= 1, "stats.by_severity.error >= 1")

# ═══════════════════════════════════════════════════════════════════════
# Cenário 2 — overlap_xy WARNING (margem de segurança)
# Dois sys32 Ø8: distância exigida = 8 + tol(2) = 10mm. A 9mm → warning.
# ═══════════════════════════════════════════════════════════════════════
section("Cenário 2 — overlap_xy (warning): dois sys32 a 9mm (margem violada)")
ops_2 = [
  { tipo: :furo_sys32, peca_id: 7, x_mm: 100.0, y_mm: 50.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'a' },
  { tipo: :furo_sys32, peca_id: 7, x_mm: 109.0, y_mm: 50.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'b' },
]
res_2 = Ornato::Machining::DrillingCollisionDetector.new(ops_2).analyze
overlaps_2 = find_collisions(res_2, :overlap_xy)
assert(overlaps_2.size == 1, "deve detectar 1 overlap_xy")
assert(overlaps_2.first[:severity] == :warning, "severity = :warning (apenas margem)")

# ═══════════════════════════════════════════════════════════════════════
# Cenário 3 — duplicate
# ═══════════════════════════════════════════════════════════════════════
section("Cenário 3 — duplicate: mesma op exatamente repetida")
ops_3 = [
  { tipo: :furo_sys32, peca_id: 9, x_mm: 50.0, y_mm: 32.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'x' },
  { tipo: :furo_sys32, peca_id: 9, x_mm: 50.0, y_mm: 32.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'x_copia' },
]
res_3 = Ornato::Machining::DrillingCollisionDetector.new(ops_3).analyze
dups_3 = find_collisions(res_3, :duplicate)
assert(dups_3.size == 1, "deve detectar 1 duplicate")
assert(dups_3.first[:severity] == :warning, "severity = :warning")
# Não deve emitir overlap_xy adicional pra esse par (foi consumido como dup)
assert(find_collisions(res_3, :overlap_xy).empty?, "duplicate não duplica relato como overlap_xy")

# ═══════════════════════════════════════════════════════════════════════
# Cenário 4 — edge_too_close
# Peça 600x300, furo Ø8 com x=3 → borda do furo a -1mm (invade!)
# ═══════════════════════════════════════════════════════════════════════
section("Cenário 4 — edge_too_close: furo Ø8 a 3mm da borda esquerda")
ops_4 = [
  { tipo: :furo_sys32, peca_id: 1, x_mm: 3.0, y_mm: 150.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'borda' },
]
bbox_4 = { 1 => { x_min: 0.0, y_min: 0.0, z_min: 0.0,
                  x_max: 600.0, y_max: 300.0, z_max: 18.0,
                  thickness_mm: 18.0 } }
res_4 = Ornato::Machining::DrillingCollisionDetector.new(ops_4, pieces_bbox: bbox_4).analyze
edges_4 = find_collisions(res_4, :edge_too_close)
assert(edges_4.any? { |c| c[:edge] == :edge_left }, "detecta proximidade da borda esquerda")
assert(edges_4.first[:severity] == :warning, "severity = :warning")

# ═══════════════════════════════════════════════════════════════════════
# Cenário 5 — depth_through_other_face
# Peça 18mm. Furo cego topside 12mm + cego underside 10mm = 22mm > 18mm → ERROR
# ═══════════════════════════════════════════════════════════════════════
section("Cenário 5 — depth_through_other_face: 12mm + 10mm em peça 18mm")
ops_5 = [
  { tipo: :furo_minifix, peca_id: 8, x_mm: 100.0, y_mm: 50.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 12.0, lado: :topside, fonte: 'top' },
  { tipo: :furo_minifix, peca_id: 8, x_mm: 100.0, y_mm: 50.0, z_mm: 18.0,
    diametro_mm: 8.0, profundidade_mm: 10.0, lado: :underside, fonte: 'bot' },
]
bbox_5 = { 8 => { x_min: 0.0, y_min: 0.0, z_min: 0.0,
                  x_max: 600.0, y_max: 300.0, z_max: 18.0,
                  thickness_mm: 18.0 } }
res_5 = Ornato::Machining::DrillingCollisionDetector.new(ops_5, pieces_bbox: bbox_5).analyze
depth_5 = find_collisions(res_5, :depth_through_other_face)
assert(depth_5.size == 1, "deve detectar 1 depth_through_other_face")
assert(depth_5.first[:severity] == :error, "severity = :error")
assert(depth_5.first[:soma_profundidades_mm] == 22.0, "soma_profundidades_mm = 22.0")

# Subteste: se profundidades NÃO somam mais que espessura, não dispara
ops_5b = [
  { tipo: :furo_minifix, peca_id: 8, x_mm: 100.0, y_mm: 50.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 8.0, lado: :topside, fonte: 't' },
  { tipo: :furo_minifix, peca_id: 8, x_mm: 100.0, y_mm: 50.0, z_mm: 18.0,
    diametro_mm: 8.0, profundidade_mm: 8.0, lado: :underside, fonte: 'b' },
]
res_5b = Ornato::Machining::DrillingCollisionDetector.new(ops_5b, pieces_bbox: bbox_5).analyze
assert(find_collisions(res_5b, :depth_through_other_face).empty?,
       "8mm + 8mm = 16mm <= 18mm → sem colisão de profundidade")

# ═══════════════════════════════════════════════════════════════════════
# Cenário 6 — intersects_banding
# Peça com fita na borda da frente (edge_front). Furo Ø8 a y=6 → invade.
# ═══════════════════════════════════════════════════════════════════════
section("Cenário 6 — intersects_banding: furo invade zona de fita (8mm)")
ops_6 = [
  { tipo: :furo_sys32, peca_id: 3, x_mm: 100.0, y_mm: 6.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: 'fita' },
]
bbox_6 = { 3 => { x_min: 0.0, y_min: 0.0, z_min: 0.0,
                  x_max: 600.0, y_max: 300.0, z_max: 18.0,
                  thickness_mm: 18.0 } }
band_6 = { 3 => [:edge_front] }
res_6 = Ornato::Machining::DrillingCollisionDetector.new(
  ops_6, pieces_bbox: bbox_6, pieces_banding: band_6
).analyze
band_hits = find_collisions(res_6, :intersects_banding)
assert(band_hits.any? { |c| c[:edge] == :edge_front }, "detecta invasão da fita frontal")

# Subteste: se a borda NÃO tem fita, não dispara intersects_banding
res_6b = Ornato::Machining::DrillingCollisionDetector.new(
  ops_6, pieces_bbox: bbox_6, pieces_banding: { 3 => [:edge_back] }
).analyze
assert(find_collisions(res_6b, :intersects_banding).empty?,
       "sem fita na borda em questão → sem colisão de banding")

# ═══════════════════════════════════════════════════════════════════════
# Cenário 7 — sanidade: 3 sys32 espaçados 32mm em uma lateral (caso limpo)
# ═══════════════════════════════════════════════════════════════════════
section("Cenário 7 — sanidade: 3 sys32 espaçados 32mm (sem colisão)")
ops_7 = (0..2).map do |i|
  { tipo: :furo_sys32, peca_id: 11, x_mm: 37.0, y_mm: 100.0 + i * 32.0, z_mm: 0.0,
    diametro_mm: 8.0, profundidade_mm: 13.0, lado: :topside, fonte: "sys#{i}" }
end
bbox_7 = { 11 => { x_min: 0.0, y_min: 0.0, z_min: 0.0,
                   x_max: 600.0, y_max: 1800.0, z_max: 18.0,
                   thickness_mm: 18.0 } }
res_7 = Ornato::Machining::DrillingCollisionDetector.new(
  ops_7, pieces_bbox: bbox_7
).analyze
assert(res_7[:collisions].empty?, "nenhuma colisão emitida")
assert(res_7[:stats][:ops_total] == 3, "stats.ops_total = 3")
assert(res_7[:stats][:by_severity][:error] == 0, "0 errors")
assert(res_7[:stats][:by_severity][:warning] == 0, "0 warnings")

# ═══════════════════════════════════════════════════════════════════════
# Cenário 8 — duck-typing: aceita objetos com x_mm/y_mm/etc
# ═══════════════════════════════════════════════════════════════════════
section("Cenário 8 — duck-typing: aceita objetos com x_mm/y_mm/...")
duck_op_class = Struct.new(:tipo, :peca_id, :x_mm, :y_mm, :z_mm,
                           :diametro_mm, :profundidade_mm, :lado,
                           :normal, :fonte, keyword_init: true)
ops_8 = [
  duck_op_class.new(tipo: :furo_dobradica, peca_id: 99, x_mm: 100.0, y_mm: 50.0,
                    z_mm: 0.0, diametro_mm: 35.0, profundidade_mm: 13.0,
                    lado: :topside, normal: FakeVec.new(0, 0, 1), fonte: 'd1'),
  duck_op_class.new(tipo: :furo_sys32,    peca_id: 99, x_mm: 102.0, y_mm: 51.0,
                    z_mm: 0.0, diametro_mm: 8.0,  profundidade_mm: 13.0,
                    lado: :topside, normal: FakeVec.new(0, 0, 1), fonte: 'd2'),
]
res_8 = Ornato::Machining::DrillingCollisionDetector.new(ops_8).analyze
assert(find_collisions(res_8, :overlap_xy).any?, "duck-typed ops também são analisadas")

# ═══════════════════════════════════════════════════════════════════════
# RESUMO
# ═══════════════════════════════════════════════════════════════════════
puts ""
puts "═" * 72
puts "Resultado: #{$passes} passes / #{$failures} falhas"
puts "═" * 72
exit($failures == 0 ? 0 : 1)
