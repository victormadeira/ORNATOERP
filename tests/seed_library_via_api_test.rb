#!/usr/bin/env ruby
# frozen_string_literal: true
# Tests for tools/seed_library_via_api.rb (Sprint B5)
# Standalone (Test::Unit). Run: ruby tests/seed_library_via_api_test.rb

require 'test/unit'
require 'json'
require 'tmpdir'
require 'fileutils'
require 'ostruct'
require 'pathname'

require_relative '../tools/seed_library_via_api'

class SeedLibraryTest < Test::Unit::TestCase
  # ── Test 1: discovery picks 47 originais + 237 imported, exclui wps_imported ─
  def test_discovers_jsons_excluding_wps_imported
    files = SeedLibrary.discover_jsons
    assert_kind_of(Array, files)
    assert(files.length > 0, 'esperava pelo menos 1 JSON')
    assert(files.none? { |f| f.include?('/wps_imported/') },
           'wps_imported NÃO deve aparecer no discovery')
    assert(files.none? { |f| f.include?('/wps_source/') },
           'wps_source NÃO deve aparecer no discovery')
    # Algum JSON original deve ter sido encontrado
    assert(files.any? { |f| f.include?('/cozinha/balcao_2_portas.json') },
           'esperava balcao_2_portas.json no discovery')
  end

  # ── Test 2: skp_refs extraídos corretamente ─────────────────────────────────
  def test_skp_refs_extraction
    sample = {
      'id' => 'x',
      'pecas' => [
        { 'nome' => 'A', 'componente_3d' => 'ferragens/dobradica.skp' },
        { 'nome' => 'B', 'componente_3d' => 'puxadores/sem_puxador.skp' },
        { 'nome' => 'C' },                      # sem componente
        { 'nome' => 'D', 'componente_3d' => '' }, # vazio
        { 'nome' => 'E', 'componente_3d' => 'ferragens/dobradica.skp' } # duplicado
      ]
    }
    refs = SeedLibrary.skp_refs_for(sample)
    assert_equal(2, refs.length, 'duplicatas e vazios devem ser removidos')
    assert_includes(refs, 'ferragens/dobradica.skp')
    assert_includes(refs, 'puxadores/sem_puxador.skp')
  end

  # ── Test 3: dry-run NÃO chama HTTP ──────────────────────────────────────────
  def test_dry_run_does_not_hit_network
    called = false
    SeedLibrary.singleton_class.send(:alias_method, :_orig_post, :http_post_multipart)
    SeedLibrary.define_singleton_method(:http_post_multipart) do |*_a, **_k|
      called = true
      OpenStruct.new(code: '500', body: 'should not be called')
    end
    out = capture_stdout do
      begin
        SeedLibrary.run(%w[--dry-run --channel dev])
      rescue SystemExit
        # exit(0) na conclusão é esperado
      end
    end
    refute(called, 'http_post_multipart NÃO deveria ser chamado em --dry-run')
    assert_match(/dry-run\s*:\s*YES/i, out)
  ensure
    SeedLibrary.singleton_class.send(:alias_method, :http_post_multipart, :_orig_post)
  end

  # ── Test 4: HTTP 409 conta como skip, 201 como created, outros como erro ────
  def test_http_status_classification
    # Stub: alterna 201, 409, 500 para os 3 primeiros files
    responses = [
      OpenStruct.new(code: '201', body: '{}'),
      OpenStruct.new(code: '409', body: '{"error":"exists"}'),
      OpenStruct.new(code: '500', body: 'boom')
    ]
    SeedLibrary.singleton_class.send(:alias_method, :_orig_post2, :http_post_multipart)
    SeedLibrary.singleton_class.send(:alias_method, :_orig_disc, :discover_jsons)

    # Reduz discovery a 3 arquivos reais (originais)
    real = SeedLibrary.discover_jsons.first(3)
    SeedLibrary.define_singleton_method(:discover_jsons) { real }
    SeedLibrary.define_singleton_method(:http_post_multipart) do |*_a, **_k|
      responses.shift || OpenStruct.new(code: '500', body: '')
    end

    out = nil
    exit_code = nil
    begin
      out = capture_stdout do
        begin
          ENV['AUTH_TOKEN'] = 'test-token'
          SeedLibrary.run([])
        rescue SystemExit => e
          exit_code = e.status
        end
      end
    ensure
      SeedLibrary.singleton_class.send(:alias_method, :http_post_multipart, :_orig_post2)
      SeedLibrary.singleton_class.send(:alias_method, :discover_jsons, :_orig_disc)
      ENV.delete('AUTH_TOKEN')
    end

    assert_match(/Created:\s+1/, out)
    assert_match(/Skipped:\s+1/, out)
    assert_match(/Errors:\s+1/, out)
    assert_equal(1, exit_code, 'exit code 1 quando há erros')
  end

  # ── Test 5: build_multipart formata corretamente ────────────────────────────
  def test_build_multipart_format
    body, boundary = SeedLibrary.build_multipart([
      { name: 'json_file', filename: 'a.json', content: '{"id":"x"}', content_type: 'application/json' },
      { name: 'channel', value: 'dev' }
    ])
    assert_match(/\A----OrnatoSeed[a-f0-9]+\z/, boundary)
    assert(body.include?(%(name="json_file"; filename="a.json")), 'parte de arquivo presente')
    assert(body.include?('Content-Type: application/json'), 'content-type presente')
    assert(body.include?(%(name="channel")), 'parte simples presente')
    assert(body.include?("--#{boundary}--\r\n"), 'fecha com boundary final')
  end

  # ── Test 6: missing skp refs são reportados sem crash ───────────────────────
  def test_missing_refs_reported
    found, missing = SeedLibrary.resolve_skp_paths(
      ['ferragens/__nao_existe_xyz__.skp', 'outro/__fake__.skp']
    )
    assert_equal([], found)
    assert_equal(2, missing.length)
  end

  private

  def capture_stdout
    old = $stdout
    $stdout = StringIO.new
    yield
    $stdout.string
  ensure
    $stdout = old
  end
end
