# frozen_string_literal: true
# tests/cloud_library_resolution_test.rb
#
# Testa a estratégia de resolução cloud-first com fallback local
# (Sprint B3). Reimplementa a lógica de JsonModuleBuilder#resolve_componente_path
# em isolamento — o método real exige SketchUp pra carregar.
#
# Run: ruby tests/cloud_library_resolution_test.rb
#
# Cenários:
#   1. cloud_enabled=false  → usa biblioteca local (modelos_ornato/modelos)
#   2. cloud_enabled=true + LibrarySync ok → usa path cloud
#   3. cloud_enabled=true + LibrarySync falha (raise/nil) → fallback local
#   4. arquivo não existe em nenhum dos 3 lugares → nil
#   5. validações de segurança preservadas (path traversal, ext)

require 'minitest/autorun'
require 'fileutils'
require 'tmpdir'

# Stub mínimo do Logger pra não exigir SketchUp
module Ornato
  module Logger
    @@logs = []
    def self.debug(msg, context: nil); @@logs << [:debug, msg, context]; end
    def self.info(msg, context: nil);  @@logs << [:info,  msg, context]; end
    def self.warn(msg, context: nil);  @@logs << [:warn,  msg, context]; end
    def self.error(msg, context: nil); @@logs << [:error, msg, context]; end
    def self.logs; @@logs; end
    def self.reset!; @@logs = []; end
  end
end

# Reimplementação isolada que recebe roots + flag por construtor (em vez de
# Sketchup.read_default e __FILE__). Mesma lógica de json_module_builder.rb.
class CloudResolverStub
  attr_writer :cloud_enabled, :sync

  def initialize(root_clean:, root_legacy:, sync: nil, cloud_enabled: false)
    @root_clean   = File.expand_path(root_clean)
    @root_legacy  = File.expand_path(root_legacy)
    @sync         = sync
    @cloud_enabled = cloud_enabled
  end

  def resolve(rel)
    return nil if rel.nil?
    rel_str = rel.to_s.strip
    return nil if rel_str.empty?

    if rel_str.include?('..') || rel_str.start_with?('/') || rel_str.match?(/\A[A-Za-z]:[\\\/]/)
      Ornato::Logger.warn("rejeitado (traversal)", context: { rel: rel_str })
      return nil
    end
    unless rel_str.downcase.end_with?('.skp')
      Ornato::Logger.warn("rejeitado (ext)", context: { rel: rel_str })
      return nil
    end

    if @cloud_enabled && @sync
      begin
        cloud_path = @sync.fetch_asset(rel_str)
        if cloud_path && File.exist?(cloud_path.to_s)
          Ornato::Logger.debug("library: cloud hit for #{rel_str}")
          return cloud_path.to_s
        end
      rescue => e
        Ornato::Logger.warn("cloud falhou — fallback", context: { err: e.message })
      end
    end

    pc = File.expand_path(File.join(@root_clean, rel_str))
    if (pc.start_with?(@root_clean + File::SEPARATOR) || pc == @root_clean) && File.exist?(pc)
      Ornato::Logger.debug("library: local clean hit for #{rel_str}")
      return pc
    end

    pl = File.expand_path(File.join(@root_legacy, rel_str))
    if (pl.start_with?(@root_legacy + File::SEPARATOR) || pl == @root_legacy) && File.exist?(pl)
      Ornato::Logger.debug("library: local legacy hit for #{rel_str}")
      return pl
    end

    Ornato::Logger.warn("nao encontrado", context: { rel: rel_str })
    nil
  end
end

# Mocks de LibrarySync
class FakeLibrarySyncOk
  def initialize(path); @path = path; end
  def fetch_asset(_rel); @path; end
end

class FakeLibrarySyncFail
  def fetch_asset(_rel); raise 'offline'; end
end

class FakeLibrarySyncNil
  def fetch_asset(_rel); nil; end
end

class CloudLibraryResolutionTest < Minitest::Test
  def setup
    Ornato::Logger.reset!
    @tmp = Dir.mktmpdir('ornato_lib_test')
    @clean  = File.join(@tmp, 'modelos_ornato')
    @legacy = File.join(@tmp, 'modelos')
    @cloud_cache = File.join(@tmp, 'cloud_cache')
    [@clean, @legacy, @cloud_cache].each { |d| FileUtils.mkdir_p(d) }

    # Arquivo na lib limpa
    @clean_file = File.join(@clean, 'puxador.skp')
    File.write(@clean_file, 'fake skp')

    # Arquivo só na legacy
    @legacy_only = File.join(@legacy, 'antigo.skp')
    File.write(@legacy_only, 'fake skp')

    # Arquivo "baixado" do cloud
    @cloud_file = File.join(@cloud_cache, 'puxador.skp')
    File.write(@cloud_file, 'fake skp cloud')
  end

  def teardown
    FileUtils.rm_rf(@tmp)
  end

  # ── Test 1: cloud_enabled=false → usa biblioteca local ─────────
  def test_cloud_disabled_uses_local
    r = CloudResolverStub.new(
      root_clean: @clean, root_legacy: @legacy,
      sync: FakeLibrarySyncOk.new(@cloud_file),
      cloud_enabled: false
    )
    result = r.resolve('puxador.skp')
    assert_equal @clean_file, result, 'deve preferir biblioteca local (clean) quando cloud off'
    refute_includes Ornato::Logger.logs.map(&:last).map(&:to_s), 'cloud hit'
  end

  # ── Test 2: cloud_enabled=true + LibrarySync responde ──────────
  def test_cloud_enabled_uses_cloud_path
    r = CloudResolverStub.new(
      root_clean: @clean, root_legacy: @legacy,
      sync: FakeLibrarySyncOk.new(@cloud_file),
      cloud_enabled: true
    )
    result = r.resolve('puxador.skp')
    assert_equal @cloud_file, result, 'deve retornar path do cloud quando habilitado e disponível'
    debug_msgs = Ornato::Logger.logs.select { |lvl, _, _| lvl == :debug }.map { |_, m, _| m }
    assert(debug_msgs.any? { |m| m.include?('cloud hit') }, 'deve logar cloud hit')
  end

  # ── Test 3: cloud falha → fallback pra local ──────────────────
  def test_cloud_failure_falls_back_to_local
    r = CloudResolverStub.new(
      root_clean: @clean, root_legacy: @legacy,
      sync: FakeLibrarySyncFail.new,
      cloud_enabled: true
    )
    result = r.resolve('puxador.skp')
    assert_equal @clean_file, result, 'deve cair pra local quando cloud raise'

    # cloud_enabled=true mas sync retorna nil
    r2 = CloudResolverStub.new(
      root_clean: @clean, root_legacy: @legacy,
      sync: FakeLibrarySyncNil.new,
      cloud_enabled: true
    )
    assert_equal @clean_file, r2.resolve('puxador.skp'), 'sync.nil → fallback local'
  end

  # ── Test 4: legacy fallback (não está em clean nem cloud) ─────
  def test_legacy_fallback
    r = CloudResolverStub.new(
      root_clean: @clean, root_legacy: @legacy,
      sync: FakeLibrarySyncNil.new,
      cloud_enabled: true
    )
    result = r.resolve('antigo.skp')
    assert_equal @legacy_only, result, 'deve achar em modelos/ (legacy)'
  end

  # ── Test 5: não existe em lugar nenhum → nil + warn ───────────
  def test_not_found_anywhere
    r = CloudResolverStub.new(
      root_clean: @clean, root_legacy: @legacy,
      sync: FakeLibrarySyncNil.new,
      cloud_enabled: true
    )
    result = r.resolve('inexistente.skp')
    assert_nil result
    warn_msgs = Ornato::Logger.logs.select { |lvl, _, _| lvl == :warn }.map { |_, m, _| m }
    assert(warn_msgs.any? { |m| m.include?('nao encontrado') }, 'deve logar warning de não encontrado')
  end

  # ── Test 6: segurança preservada (path traversal) ─────────────
  def test_security_path_traversal_still_blocked
    r = CloudResolverStub.new(
      root_clean: @clean, root_legacy: @legacy,
      sync: FakeLibrarySyncOk.new(@cloud_file),
      cloud_enabled: true
    )
    assert_nil r.resolve('../../../etc/passwd')
    assert_nil r.resolve('/etc/passwd.skp')
    assert_nil r.resolve('arquivo.txt')
  end
end
