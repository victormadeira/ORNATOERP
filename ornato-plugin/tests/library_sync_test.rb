# frozen_string_literal: true
# tests/library_sync_test.rb — Cobertura do sync incremental da biblioteca.
#
# Testa: sync de manifest, cache hit/miss em fetch_asset, integridade SHA256,
# eviction LRU e search. Mocka Net::HTTP para evitar I/O real.

require_relative 'test_helper'
require 'tmpdir'
require 'fileutils'
require 'json'
require 'digest'
require 'net/http'

require_relative '../ornato_sketchup/library/library_sync'

# ────────────────────────────────────────────────────────────────────
# Fake HTTP — substitui Net::HTTP.new para retornar respostas pré-programadas
# ────────────────────────────────────────────────────────────────────
class FakeHttpResponse
  attr_accessor :body, :code
  def initialize(body, code: '200', headers: {})
    @body    = body
    @code    = code
    @headers = headers
  end

  def [](key)
    @headers[key] || @headers[key.downcase] || @headers[key.to_s.split('-').map(&:capitalize).join('-')]
  end

  def is_a?(klass)
    return true if klass == Net::HTTPSuccess && @code.to_i.between?(200, 299)
    super
  end
end

class FakeHttp
  @@responses = {}   # uri.to_s => FakeHttpResponse
  @@call_count = 0
  @@calls = []

  def self.responses; @@responses; end
  def self.calls; @@calls; end
  def self.call_count; @@call_count; end
  def self.reset!
    @@responses = {}
    @@call_count = 0
    @@calls = []
  end

  def initialize(host, port)
    @host = host
    @port = port
  end

  attr_accessor :use_ssl, :open_timeout, :read_timeout, :verify_mode
  def use_ssl?; @use_ssl == true; end

  def request(req)
    full = "http://#{@host}:#{@port}#{req.path}"
    @@call_count += 1
    @@calls << full
    @@responses[full] || @@responses[req.path] || FakeHttpResponse.new('', code: '404')
  end
end

# ────────────────────────────────────────────────────────────────────
class LibrarySyncTest < OrnatoTest::Case
  def fresh_sync(cache_dir)
    ::Ornato::Library::LibrarySync.new(
      cache_dir: cache_dir,
      base_url:  'http://localhost:3001',
      token:     'test-token',
      timeout:   1
    )
  end

  def with_fake_http
    original = Net::HTTP.method(:new)
    FakeHttp.reset!
    Net::HTTP.define_singleton_method(:new) { |host, port| FakeHttp.new(host, port) }
    yield
  ensure
    Net::HTTP.define_singleton_method(:new) { |*args| original.call(*args) }
  end

  test 'sync_manifest baixa e salva localmente' do
    Dir.mktmpdir do |dir|
      with_fake_http do
        manifest = { 'library_version' => 'v1.0.11', 'modules' => [{ 'id' => 'a' }, { 'id' => 'b' }] }
        FakeHttp.responses['/api/library/manifest'] = FakeHttpResponse.new(manifest.to_json)

        sync = fresh_sync(dir)
        result = sync.sync_manifest
        assert_equal 'v1.0.11', result['library_version']
        assert File.exist?(File.join(dir, 'manifest.json')), 'manifest.json deve existir'
        parsed = JSON.parse(File.read(File.join(dir, 'manifest.json')))
        assert_equal 2, parsed['modules'].length
      end
    end
  end

  test 'fetch_asset cacheia e re-fetch usa cache local' do
    Dir.mktmpdir do |dir|
      with_fake_http do
        body = 'fake .skp binary content'
        sha  = Digest::SHA256.hexdigest(body)
        FakeHttp.responses['/api/library/asset/ferragens/dobradica.skp'] =
          FakeHttpResponse.new(body, headers: { 'Content-SHA256' => sha })

        sync = fresh_sync(dir)
        path1 = sync.fetch_asset('ferragens/dobradica.skp')
        assert File.exist?(path1), 'asset deve estar em disco'
        first_count = FakeHttp.call_count
        assert_equal 1, first_count

        # Segundo fetch — deve ser cache hit, sem nova chamada HTTP
        path2 = sync.fetch_asset('ferragens/dobradica.skp')
        assert_equal path1, path2
        assert_equal first_count, FakeHttp.call_count, 'cache hit não deve chamar HTTP'
      end
    end
  end

  test 'SHA256 mismatch dispara erro e apaga arquivo' do
    Dir.mktmpdir do |dir|
      with_fake_http do
        body = 'corrupt payload'
        wrong_sha = Digest::SHA256.hexdigest('something else entirely')
        FakeHttp.responses['/api/library/asset/puxadores/p1.skp'] =
          FakeHttpResponse.new(body, headers: { 'Content-SHA256' => wrong_sha })

        sync = fresh_sync(dir)
        assert_raises(::Ornato::Library::LibrarySync::IntegrityError) do
          sync.fetch_asset('puxadores/p1.skp')
        end
        # Arquivo NÃO deve persistir após falha de integridade
        refute File.exist?(File.join(dir, 'puxadores/p1.skp')), 'arquivo corrompido deve ser apagado'
      end
    end
  end

  test 'LRU eviction quando cache excede limite' do
    Dir.mktmpdir do |dir|
      with_fake_http do
        sync = fresh_sync(dir)
        # Cap pequeno: 1MB
        sync.set_max_mb(1)

        # Cria 3 entradas no meta totalizando ~1MB já em uso
        old_path1 = File.join(dir, 'old1.skp'); File.write(old_path1, 'x' * 400_000)
        old_path2 = File.join(dir, 'old2.skp'); File.write(old_path2, 'x' * 400_000)
        meta = {
          'access_log' => [
            { 'path' => 'old1.skp', 'last_accessed_at' => '2020-01-01T00:00:00Z', 'size' => 400_000 },
            { 'path' => 'old2.skp', 'last_accessed_at' => '2024-01-01T00:00:00Z', 'size' => 400_000 },
          ],
          'total_bytes' => 800_000,
        }
        File.write(File.join(dir, 'meta.json'), JSON.pretty_generate(meta))

        # Adiciona novo asset de 400KB → total 1.2MB → precisa evictar o mais antigo
        body = 'y' * 400_000
        sha  = Digest::SHA256.hexdigest(body)
        FakeHttp.responses['/api/library/asset/new.skp'] =
          FakeHttpResponse.new(body, headers: { 'Content-SHA256' => sha })

        sync.fetch_asset('new.skp')

        refute File.exist?(old_path1), 'old1 (LRU) deve ter sido evictado'
        assert File.exist?(File.join(dir, 'new.skp')), 'novo asset deve existir'
        assert File.exist?(old_path2), 'old2 (mais recente) deve permanecer'
      end
    end
  end

  test 'search retorna resultados parseados' do
    Dir.mktmpdir do |dir|
      with_fake_http do
        results = [{ 'id' => 'puxador_x' }, { 'id' => 'puxador_y' }]
        # Path inclui querystring; FakeHttp tenta path com qs primeiro.
        FakeHttp.responses['/api/library/search?q=puxador'] =
          FakeHttpResponse.new(results.to_json)

        sync = fresh_sync(dir)
        out = sync.search('puxador')
        assert_equal 2, out.length
        assert_equal 'puxador_x', out.first['id']
      end
    end
  end

  test 'cache_stats reporta uso e clear_cache zera tudo' do
    Dir.mktmpdir do |dir|
      sync = fresh_sync(dir)
      File.write(File.join(dir, 'meta.json'), {
        'access_log' => [{ 'path' => 'a.skp', 'last_accessed_at' => '2024-01-01T00:00:00Z', 'size' => 2_097_152 }],
        'total_bytes' => 2_097_152,
      }.to_json)
      stats = sync.cache_stats
      assert_equal 1, stats[:file_count]
      assert_equal 2.0, stats[:used_mb]

      sync.clear_cache
      after = sync.cache_stats
      assert_equal 0, after[:file_count]
    end
  end
end
