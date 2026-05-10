# frozen_string_literal: true
# tests/shop_to_expr_params_test.rb — SHOP-6
#
# Garante que ShopConfig.to_expr_params expõe TODAS as 19 chaves planas
# que SHOP-1 migrou para o namespace {shop.xxx} nos JSONs.
# Cada chave deve resolver pra um valor não-nulo, com tipo coerente
# (Numeric ou String) e default funcional (não 0/'').

require_relative 'test_helper'

# Mock mínimo do Sketchup (compartilhado com shop_config_sync_test)
unless defined?(::Sketchup)
  module ::Sketchup
    @@_defaults = {}
    def self.read_default(app, key, fallback = nil)
      @@_defaults.dig(app, key) || fallback
    end
    def self.write_default(app, key, value)
      (@@_defaults[app] ||= {})[key] = value
    end
    def self._reset_defaults!
      @@_defaults = {}
    end
  end
end

require_relative '../ornato_sketchup/hardware/shop_config'

module OrnatoTest
  class ShopToExprParamsTest < Case
    SC = Ornato::Hardware::ShopConfig

    # Chaves migradas pelo SHOP-1 (19 totais — 1 já existia + 18 novas).
    # Cada entrada: [chave_plana, tipo_esperado, default_não-falsy]
    MIGRATED_KEYS = [
      # já existente
      ['folga_porta_lateral',    Numeric, 2.0],

      # 18 novas (SHOP-6)
      ['folga_porta_vertical',   Numeric, 2.0],
      ['folga_entre_portas',     Numeric, 3.0],
      ['folga_porta_reta',       Numeric, 2.0],
      ['folga_porta_dupla',      Numeric, 3.0],
      ['folga_gaveta',           Numeric, 3.0],
      ['recuo_fundo',            Numeric, 15.0],
      ['profundidade_rasgo_fundo', Numeric, 6.0],
      ['largura_rasgo_fundo',    Numeric, 6],
      ['altura_rodape',          Numeric, 100.0],
      ['rodape_altura_padrao',   Numeric, 100.0],
      ['espessura',              Numeric, 18],
      ['espessura_padrao',       Numeric, 18],
      ['espessura_chapa_padrao', Numeric, 18],
      ['sistema32_offset',       Numeric, 37.0],
      ['sistema32_passo',        Numeric, 32.0],
      ['cavilha_diametro',       Numeric, 8.0],
      ['cavilha_profundidade',   Numeric, 15.0],
      ['fita_borda_padrao',      String,  'BOR_04x22_Branco'],
    ].freeze

    def setup_clean_defaults
      if ::Sketchup.respond_to?(:_reset_defaults!)
        ::Sketchup._reset_defaults!
      else
        ::Sketchup.write_default('Ornato', 'shop_config', nil)
      end
    end

    # ── 1 assert por chave: tipo + default ──────────────────────
    MIGRATED_KEYS.each do |key, type, default|
      test "to_expr_params expõe '#{key}' como #{type} com default #{default.inspect}" do
        setup_clean_defaults
        params = SC.to_expr_params
        assert params.key?(key), "chave '#{key}' ausente em to_expr_params"
        v = params[key]
        assert !v.nil?, "chave '#{key}' tem valor nil"
        assert v.is_a?(type), "chave '#{key}' tipo errado: esperado #{type}, got #{v.class}"
        if v.is_a?(Numeric)
          assert v != 0, "chave '#{key}' tem default zero — esperado valor funcional"
        else
          assert !v.to_s.empty?, "chave '#{key}' tem default string vazia"
        end
        assert_equal default, v, "chave '#{key}' default mudou: esperado #{default.inspect}, got #{v.inspect}"
      end
    end

    # ── Backward-compat: chaves antigas continuam expostas ──────
    test 'chaves legadas pré-SHOP-6 continuam em to_expr_params' do
      setup_clean_defaults
      p = SC.to_expr_params
      %w[
        espessura_carcaca espessura_fundo espessura_frente
        folga_porta_int folga_entre_modulos folga_porta_topo folga_porta_base
        folga_correr_topo folga_correr_base
        folga_gaveta_lateral folga_gaveta_fundo folga_gaveta_topo folga_entre_gavetas
        folga_prat_lateral folga_prat_traseira folga_div_topo folga_div_base
        rasgo_profundidade rasgo_recuo
        dobradica_edge_offset dobradica_cup_dia dobradica_top_offset
        sobreposicao_reta sobreposicao_curva
        minifix_spacing confirmat_spacing
        cavilha_dia cavilha_depth cavilha_spacing
        pino_diametro pino_espacamento
        corredica_comprimento puxador_espacamento
        sys32_dia sys32_spacing
      ].each do |k|
        assert p.key?(k), "chave legada '#{k}' sumiu de to_expr_params"
      end
    end

    # ── Override via save: to_expr_params reflete mudanças ──────
    test 'override em folgas.porta_abrir.lateral_ext reflete em folga_porta_lateral e folga_porta_reta' do
      setup_clean_defaults
      cfg = SC.load
      cfg['folgas']['porta_abrir']['lateral_ext'] = 4.5
      SC.save(cfg)
      p = SC.to_expr_params
      assert_equal 4.5, p['folga_porta_lateral']
      # alias 'folga_porta_reta' deve refletir a mesma mudança
      assert_equal 4.5, p['folga_porta_reta']
    end

    test 'override em rodape.altura reflete em altura_rodape e rodape_altura_padrao' do
      setup_clean_defaults
      cfg = SC.load
      cfg['rodape'] ||= {}
      cfg['rodape']['altura'] = 150.0
      SC.save(cfg)
      p = SC.to_expr_params
      assert_equal 150.0, p['altura_rodape']
      assert_equal 150.0, p['rodape_altura_padrao']
    end

    test 'override em espessura_carcaca_padrao propaga para os 3 aliases planos' do
      setup_clean_defaults
      cfg = SC.load
      cfg['espessura_carcaca_padrao'] = 25
      SC.save(cfg)
      p = SC.to_expr_params
      assert_equal 25, p['espessura']
      assert_equal 25, p['espessura_padrao']
      assert_equal 25, p['espessura_chapa_padrao']
      # também propaga pra largura_rasgo_fundo? Não — esse é fundo, não carcaça.
      # Mas legacy 'espessura_carcaca' tem que mudar:
      assert_equal 25, p['espessura_carcaca']
    end

    test 'override em fita.padrao reflete em fita_borda_padrao' do
      setup_clean_defaults
      cfg = SC.load
      cfg['fita'] ||= {}
      cfg['fita']['padrao'] = 'BOR_05x22_Preto'
      SC.save(cfg)
      p = SC.to_expr_params
      assert_equal 'BOR_05x22_Preto', p['fita_borda_padrao']
    end

    test 'override em system32 propaga para sistema32_offset/passo' do
      setup_clean_defaults
      cfg = SC.load
      cfg['system32']['front_offset'] = 50.0
      cfg['system32']['spacing']      = 64.0
      SC.save(cfg)
      p = SC.to_expr_params
      assert_equal 50.0, p['sistema32_offset']
      assert_equal 64.0, p['sistema32_passo']
    end
  end
end

OrnatoTest.autorun_if_main!(__FILE__)
