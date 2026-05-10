# frozen_string_literal: true
# tests/shop_namespace_test.rb
# Testes do namespace {shop.xxx} no ExpressionEvaluator + migrator de JSONs.

require_relative 'test_helper'
require 'json'
require 'fileutils'
require 'tmpdir'
require_relative '../ornato_sketchup/library/expression_evaluator'

module OrnatoTest
  class ShopNamespaceTest < Case
    Eval = Ornato::Library::ExpressionEvaluator

    # ── Parser: namespace shop. resolve via _shop ───────────────
    test 'parser resolves {shop.key} via _shop bucket' do
      ev = Eval.new(
        'altura'  => 850,
        '_shop'   => { 'folga_porta_reta' => 2.5 },
      )
      assert_equal 845.0, ev.eval('{altura} - 2 * {shop.folga_porta_reta}')
    end

    # ── Parser: fallback para plain key se _shop não tem ────────
    test 'parser falls back to plain key when shop bucket lacks it' do
      ev = Eval.new(
        '_shop'             => {}, # vazio
        'folga_porta_reta'  => 3.0, # legacy plain
      )
      # Deve resolver via fallback legacy
      assert_equal 3.0, ev.eval('{shop.folga_porta_reta}')
    end

    # ── Parser: sem _shop, sem plain → 0.0 ──────────────────────
    test 'parser returns 0 for unknown shop key without legacy fallback' do
      ev = Eval.new({})
      assert_equal 0.0, ev.eval('{shop.nao_existe}')
    end

    # ── Parser: namespace inválido → erro (recuperado para 0.0) ─
    test 'parser rejects non-whitelisted namespace' do
      ev = Eval.new('_shop' => { 'x' => 1 })
      # Em eval (numérico), erro vira 0.0 com warn — mas eval_bool é fail-open
      assert_equal 0.0, ev.eval('{module.x}')
      assert_equal 0.0, ev.eval('{project.x}')
    end

    # ── Parser: math composta com shop ──────────────────────────
    test 'parser handles compound math with shop and plain params' do
      ev = Eval.new(
        'altura'  => 1000,
        'largura' => 600,
        '_shop'   => {
          'folga_porta_reta' => 2.0,
          'espessura'        => 18.0,
        },
      )
      result = ev.eval('{altura} - 2 * {shop.folga_porta_reta} - {shop.espessura}')
      assert_equal 978.0, result
    end

    # ── Parser: condição booleana com shop ──────────────────────
    test 'parser eval_bool works with shop ns' do
      ev = Eval.new('_shop' => { 'sys32_ativo' => true })
      assert_equal true, ev.eval_bool('{shop.sys32_ativo}')
    end

    # ── Parser: shop key precede plain (precedência) ────────────
    test 'parser prefers _shop value over plain when both present' do
      ev = Eval.new(
        '_shop' => { 'espessura' => 25.0 },
        'espessura' => 18.0, # plain — serve só como fallback
      )
      assert_equal 25.0, ev.eval('{shop.espessura}')
    end

    # ── Migrator: idempotência + backup + JSON quebrado ─────────
    test 'migrator is idempotent, creates backup, and survives broken json' do
      Dir.mktmpdir do |tmp|
        # Estrutura mínima esperada pelo migrator
        lib = File.join(tmp, 'biblioteca', 'moveis', 'cozinha')
        FileUtils.mkdir_p(lib)
        FileUtils.mkdir_p(File.join(tmp, 'wps_working'))
        FileUtils.mkdir_p(File.join(tmp, 'ornato_sketchup', 'hardware'))

        # Stub do shop_config.rb para shop_config_known_keys
        File.write(File.join(tmp, 'ornato_sketchup', 'hardware', 'shop_config.rb'), <<~RUBY)
          module Ornato
            module Hardware
              module ShopConfig
                def self.to_expr_params
                  {
                    'folga_porta_lateral' => 2.0,
                    'altura_rodape'       => 100,
                  }
                end
              end
            end
          end
        RUBY

        # JSON válido com referencia legacy
        json_ok = {
          'id'         => 'teste',
          'parametros' => {
            'altura_rodape' => { 'default' => nil, 'type' => 'number' },
            'largura'       => { 'default' => 600, 'type' => 'number' },
          },
          'pecas' => [
            { 'nome' => 'A', 'altura' => '{altura} - {altura_rodape}',
              'largura' => '{largura} - 2 * {folga_porta_lateral}' },
          ],
        }
        json_ok_path = File.join(lib, 'mod_ok.json')
        File.write(json_ok_path, JSON.pretty_generate(json_ok))

        # JSON quebrado (sintaxe inválida)
        json_bad_path = File.join(lib, 'mod_bad.json')
        File.write(json_bad_path, '{ "id": "broken", "parametros": {')

        # Roda migrator copiado pra tmpdir (precisa do ROOT)
        migrator_src = File.read(
          File.expand_path('../tools/migrate_shop_namespace.rb', __dir__),
          encoding: 'UTF-8'
        )
        # Substitui ROOT pra apontar pro tmp
        migrator_src = migrator_src.sub(
          /ROOT = .*$/,
          "ROOT = #{tmp.inspect}"
        )
        # Remove o exit() final pra não matar o processo
        migrator_src = migrator_src.sub(/^exit\(0\)\s*$/, '')

        # 1ª passada
        out1 = capture_stdout { eval(migrator_src) } # rubocop:disable Security/Eval
        assert out1.include?('JSONs alterados:'), 'esperado relatório do migrator'

        # Backup foi criado?
        backup_root = File.join(tmp, 'wps_working', 'backups_pre_shop_namespace')
        assert Dir.exist?(backup_root), 'backup_dir deve existir'
        backup_jsons = Dir.glob(File.join(backup_root, '**', '*.json'))
        refute backup_jsons.empty?, 'backup deve conter ao menos 1 JSON'

        # JSON ok foi convertido?
        migrated = JSON.parse(File.read(json_ok_path))
        peca = migrated['pecas'].first
        assert peca['largura'].include?('{shop.folga_porta_lateral}'),
               "esperado {shop.folga_porta_lateral} em '#{peca['largura']}'"
        assert peca['altura'].include?('{shop.altura_rodape}'),
               "esperado {shop.altura_rodape} em '#{peca['altura']}'"

        # JSON quebrado não foi tocado e não derrubou processo
        assert_equal '{ "id": "broken", "parametros": {', File.read(json_bad_path)

        # 2ª passada (idempotência)
        before2 = File.read(json_ok_path)
        out2 = capture_stdout { eval(migrator_src) } # rubocop:disable Security/Eval
        after2 = File.read(json_ok_path)
        assert_equal before2, after2, 'migrator não-idempotente: arquivo mudou na 2ª passada'
        # Numero de subs na 2ª passada deve ser 0
        assert out2.match?(/Substitui[çc][õo]es:\s+0/), 'esperado 0 substituições na 2ª passada'
      end
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
end

OrnatoTest.autorun_if_main!(__FILE__)
