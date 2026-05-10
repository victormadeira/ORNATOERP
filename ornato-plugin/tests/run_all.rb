# frozen_string_literal: true
# tests/run_all.rb — discovery + roda todos os tests/*_test.rb
require_relative 'test_helper'

# Lista explícita dos test files novos (runner OrnatoTest).
# Tests legados que dependem de Minitest gem (`expression_evaluator_test.rb`,
# `path_resolution_test.rb`) ficam fora deste runner; rode-os com
# `ruby tests/<arquivo>` se precisar.
ORNATO_TESTS = %w[
  drilling_collision_detector_test.rb
  ferragem_drilling_collector_test.rb
  rules_engine_test.rb
  parametric_engine_test.rb
  json_exporter_test.rb
  dxf_exporter_test.rb
  version_test.rb
  auto_updater_test.rb
  telemetry_optout_test.rb
  compat_enforcement_test.rb
  library_sync_test.rb
  shop_namespace_test.rb
  shop_config_sync_test.rb
  shop_to_expr_params_test.rb
  bay_detector_test.rb
  aim_placement_logic_test.rb
  aggregate_builder_test.rb
  reflow_test.rb
  validation_runner_test.rb
].freeze

# E2E tests — pipelines críticos com mocks de SketchUp (tests/e2e/*).
E2E_TESTS = %w[
  e2e/upm_to_gcode_test.rb
  e2e/shop_reflow_test.rb
  e2e/mira_placement_logic_test.rb
].freeze

ORNATO_TESTS.each { |f| require_relative f }
E2E_TESTS.each    { |f| require_relative f }

OrnatoTest.run!
