# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# ShopConfig — Configuração global da marcenaria
#
# Armazena as preferências padrão de ferragem de uma marcenaria:
# qual modelo de dobradiça usa, espaçamento de puxador, tipo de
# junção etc. Esses valores são herdados por todos os módulos e
# raramente precisam ser sobrescritos por instância.
#
# Persistência: Sketchup.read_default / write_default
# → Salva por workstation (preferências do usuário do SketchUp),
#   não por arquivo .skp. Ou seja, fica entre sessões.
#
# Uso:
#   cfg = ShopConfig.load
#   cfg['dobradica']['cup_dia']         → 35.0
#   cfg['juncao']                        → 'minifix'
#   ShopConfig.save(cfg)
#   ShopConfig.reset!
#
# Override por instância (em um módulo específico):
#   group.set_attribute('Ornato', 'hardware_config', JSON.generate({
#     juncao: 'confirmat',
#     dobradica: { soft_close: true }
#   }))
#   cfg_inst = ShopConfig.for_group(group)
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Hardware
    module ShopConfig

      PREF_KEY  = 'shop_config'
      PREF_APP  = 'Ornato'

      # ─── Defaults de fábrica ──────────────────────────────────
      FACTORY_DEFAULTS = {

        # ─── Espessuras válidas (mm) ───────────────────────────
        # MDF e MDP disponíveis no mercado BR. Sem 3mm, sem 9mm.
        'espessuras_validas'       => [6, 12, 15, 18, 25, 30],
        'espessura_carcaca_padrao' => 18,   # lateral, base, topo, divisória
        'espessura_fundo_padrao'   => 6,    # traseira / back panel
        'espessura_frente_padrao'  => 18,   # porta, frente gaveta

        # ─── Método de fixação do fundo ───────────────────────
        # 'rasgo'      → fundo entra em rasgo fresado nas laterais/base/topo
        # 'parafusado' → fundo vai por trás das laterais, fixado com parafuso
        'fundo_metodo_padrao' => 'rasgo',

        # Tipo de junção estrutural padrão
        'juncao' => 'minifix_cavilha',  # 'minifix_cavilha'|'minifix'|'cavilha'|'confirmat'

        # ─── Dobradiça ────────────────────────────────────────
        'dobradica' => {
          'modelo'       => 'blum_clip_top',
          'angulo'       => 110,
          'edge_offset'  => 22.0,   # mm da borda da porta até centro do cup
          'cup_dia'      => 35.0,   # mm (diâmetro do furo copa)
          'cup_depth'    => 13.5,   # mm (profundidade do furo copa)
          'pilot_dia'    => 2.5,    # mm dos furos piloto de fixação
          'pilot_depth'  => 10.0,   # mm
          'pilot_offset' => 24.0,   # mm do centro do cup (±Y)
          'top_offset'   => 100.0,  # mm da borda sup/inf até 1ª dobradiça
          'soft_close'   => true,
          'amortecedor'  => false,
          # Quantidade de dobradiças por altura de porta (mm)
          'quantidade_por_altura' => {
            'ate_800'    => 2,
            'ate_1200'   => 3,
            'acima_1200' => 4,
          },
        },

        # ─── Sobreposição (overlay) por tipo de braço ─────────
        # Define quanto a porta sobrepõe a lateral da carcaça.
        # reta        → full overlay (cobre toda a lateral)
        # curva       → half overlay (cobre metade — módulos adjacentes)
        # super_curva → inset (porta embutida, sem sobreposição)
        'sobreposicao' => {
          'reta'        => 16.0,   # espessura_carcaca - folga_lateral_ext
          'curva'       => 8.0,    # metade da lateral
          'super_curva' => 0.0,    # embutida
        },

        # ─── Puxador ──────────────────────────────────────────
        'puxador' => {
          'espacamento' => 128,      # mm entre furos (32/64/96/128/160/192/256/320)
          'posicao'     => 'topo',   # 'topo' | 'centro' | 'baixo'
          'dia_furo'    => 5.0,      # mm (furo passante)
          'recuo'       => 37.0,     # mm da borda oposta à dobradiça
          'y_porta'     => 100.0,    # mm da borda da porta até centro do puxador
          'cnc'         => true,     # furar puxador na CNC (false = furadeira manual)
        },

        # ─── Minifix ──────────────────────────────────────────
        'minifix' => {
          'body_dia'   => 15.0,
          'body_depth' => 13.0,
          'pin_dia'    => 8.0,
          'pin_depth'  => 11.0,
          'bolt_dia'   => 8.0,
          'bolt_depth' => 28.0,
          'spacing'    => 128.0,
          'min_edge'   => 50.0,
        },

        # ─── Confirmat ────────────────────────────────────────
        'confirmat' => {
          'face_dia'   => 8.0,
          'face_depth' => 12.0,
          'edge_dia'   => 5.0,
          'edge_depth' => 45.0,
          'spacing'    => 128.0,
          'min_edge'   => 50.0,
        },

        # ─── Cavilha ──────────────────────────────────────────
        'cavilha' => {
          'dia'      => 8.0,
          'depth'    => 15.0,   # profundidade em cada peça (total 30mm)
          'spacing'  => 96.0,
          'min_edge' => 32.0,
        },

        # ─── Pino de prateleira regulável ─────────────────────
        # Não usamos System32 como padrão, mas temos furos de pino regulável.
        'pino_prateleira' => {
          'diametro'    => 5.0,
          'profundidade'=> 12.0,
          'espacamento' => 32.0,  # mm entre furos (configurável)
          'quantidade'  => 10,    # furos por lado (configurável por módulo)
          'offset_base' => 64.0,  # mm do primeiro furo a partir da base
          'offset_topo' => 64.0,  # mm do último furo até o topo
          'cnc'         => true,  # furar na CNC
        },

        # ─── Sistema 32 (desabilitado por padrão) ─────────────
        'system32' => {
          'ativo'         => false,   # não é padrão, mas pode ser habilitado
          'dia'           => 5.0,
          'depth'         => 12.0,
          'spacing'       => 32.0,
          'front_offset'  => 37.0,
          'rear_offset'   => 37.0,
          'top_margin'    => 37.0,
          'bottom_margin' => 37.0,
        },

        # ─── Corrediça de gaveta ──────────────────────────────
        'corredica' => {
          # Modelos disponíveis — configurável por módulo
          # 'telescopica' | 'oculta_slim' | 'oculta' | 'tandem' | 'tandem_push'
          'modelo'         => 'tandem',
          'comprimento'    => 450,
          'extracao_total' => true,
          'altura_fixacao' => 37.0,
        },

        # ─── Rasgo de fundo ───────────────────────────────────
        # offset = 15mm: espaço para encaixar uma peça de 15mm por trás
        # profundidade = 6mm: o fundo entra 6mm dentro da lateral
        # largura = depende da espessura do fundo (calculado dinamicamente)
        'rasgo_fundo' => {
          'profundidade' => 6.0,    # mm de profundidade do rasgo
          'recuo'        => 15.0,   # mm da borda traseira (offset)
        },

        # ─── Pistão a gás ─────────────────────────────────────
        'pistao' => {
          'forca_padrao' => 80,  # Newtons
        },

        # ─── Folgas de fabricação ─────────────────────────────
        # Usados nos JSONs paramétricos via {folga_porta_lateral} etc.
        'folgas' => {

          # Porta de abrir
          'porta_abrir' => {
            'lateral_ext'  => 2.0,   # gap porta↔lateral externa (borda do módulo)
            'lateral_int'  => 1.5,   # gap entre portas, por lado (mesmo módulo → 3mm total)
            'entre_modulos'=> 3.0,   # gap por lado entre módulos adjacentes (6mm total)
            'topo'         => 2.0,   # gap porta↔tampo
            'base'         => 2.0,   # gap porta↔base / rodapé
          },

          # Porta de correr
          'porta_correr' => {
            'topo'  => 3.0,
            'base'  => 3.0,
          },

          # Gaveta (caixa interna)
          'gaveta' => {
            'lateral'       => 12.5,  # espaço por lado (largura corrediça tandem)
            'fundo'         => 5.0,   # caixa↔base do módulo
            'topo'          => 5.0,   # topo da caixa↔peça acima
            'entre_gavetas' => 3.0,   # entre frentes de gaveta consecutivas
          },

          # Prateleira
          'prateleira' => {
            'lateral'  => 1.0,
            'traseira' => 20.0,  # recuo em relação ao fundo/traseira
          },

          # Divisória vertical
          'divisoria' => {
            'topo'  => 1.0,
            'base'  => 1.0,
          },

        },

      }.freeze

      # ─── Catálogo de modelos disponíveis (para os selects da UI) ─
      HARDWARE_CATALOG = {
        'dobradica' => [
          { 'id' => 'blum_clip_top',     'label' => 'Blum Clip-Top 110°',     'edge_offset' => 22.5 },
          { 'id' => 'blum_clip_top_95',  'label' => 'Blum Clip-Top 95°',      'edge_offset' => 22.5 },
          { 'id' => 'grass_tiomos',      'label' => 'Grass Tiomos',            'edge_offset' => 22.5 },
          { 'id' => 'hafele_metalla',    'label' => 'Häfele Metalla',          'edge_offset' => 22.5 },
          { 'id' => 'hettich_sensys',    'label' => 'Hettich Sensys',          'edge_offset' => 22.5 },
          { 'id' => 'generica_35mm',     'label' => 'Genérica 35mm',           'edge_offset' => 22.5 },
        ],
        'corredica' => [
          { 'id' => 'tandem_push',       'label' => 'Blum Tandem Push-to-Open', 'holes' => { 350 => [37,212,350], 400 => [37,237,400], 450 => [37,260,450], 500 => [37,200,350,500] } },
          { 'id' => 'tandem_blumotion',  'label' => 'Blum Tandem Blumotion',    'holes' => { 350 => [37,212,350], 400 => [37,237,400], 450 => [37,260,450], 500 => [37,200,350,500] } },
          { 'id' => 'grass_dynapro',     'label' => 'Grass Dynapro Soft-Close', 'holes' => { 350 => [37,212,350], 400 => [37,237,400], 450 => [37,260,450], 500 => [37,200,350,500] } },
          { 'id' => 'convencional_rolim','label' => 'Convencional Rolinhos',    'holes' => { 350 => [37,187,350], 400 => [37,212,400], 450 => [37,237,450], 500 => [37,262,500] } },
        ],
        'puxador_espacamento' => [96, 128, 160, 192, 256, 320],
        'juncao' => [
          { 'id' => 'minifix',   'label' => 'Minifix (parafuso cam)' },
          { 'id' => 'confirmat', 'label' => 'Confirmat (parafuso)' },
          { 'id' => 'dowel',     'label' => 'Cavilha' },
        ],
      }.freeze

      # ─── API pública ──────────────────────────────────────────

      # Carrega config do workstation (merge com factory defaults)
      # @return [Hash]
      def self.load
        raw = Sketchup.read_default(PREF_APP, PREF_KEY)
        saved = raw ? JSON.parse(raw) : {}
        deep_merge(FACTORY_DEFAULTS, saved)
      rescue => e
        puts "Ornato ShopConfig.load ERRO: #{e.message}"
        FACTORY_DEFAULTS.dup
      end

      # Salva config no workstation
      # @param config [Hash]
      def self.save(config)
        merged = deep_merge(FACTORY_DEFAULTS, config)
        Sketchup.write_default(PREF_APP, PREF_KEY, JSON.generate(merged))
        merged
      rescue => e
        puts "Ornato ShopConfig.save ERRO: #{e.message}"
        false
      end

      # Reseta para factory defaults
      def self.reset!
        Sketchup.write_default(PREF_APP, PREF_KEY, nil)
        FACTORY_DEFAULTS.dup
      end

      # Config efetiva para um grupo (shop config + override da instância)
      # @param module_group [Sketchup::Group]
      # @return [Hash]
      def self.for_group(module_group)
        base = load
        raw  = module_group.get_attribute('Ornato', 'hardware_config', nil)
        return base unless raw
        begin
          override = JSON.parse(raw)
          deep_merge(base, override)
        rescue
          base
        end
      end

      # Salva override na instância do módulo
      # @param module_group [Sketchup::Group]
      # @param override [Hash] apenas os valores que diferem do shop default
      def self.save_for_group(module_group, override)
        module_group.set_attribute('Ornato', 'hardware_config', JSON.generate(override))
        override
      end

      # Extrai padrão de furos da corrediça pelo comprimento
      # @param modelo_id [String]
      # @param comprimento [Integer] mm
      # @return [Array<Float>] posições Y dos furos
      def self.drawer_slide_holes(modelo_id, comprimento)
        cat = HARDWARE_CATALOG['corredica'].find { |c| c['id'] == modelo_id }
        holes = cat ? cat['holes'] : HARDWARE_CATALOG['corredica'].first['holes']
        key = holes.keys.min_by { |k| (k - comprimento.to_i).abs }
        holes[key] || [37, comprimento / 2.0, comprimento]
      end

      # Serializado para enviar à UI (JSON)
      def self.to_ui_json
        JSON.generate({
          config:  load,
          catalog: HARDWARE_CATALOG,
        })
      end

      # ─── Parâmetros planos para expressões JSON ───────────────
      #
      # Converte a config aninhada em chaves planas usáveis nas
      # expressões paramétricas dos módulos da biblioteca:
      #
      #   "{largura} - 2 * {folga_porta_lateral}"
      #   "{profundidade} - {rasgo_recuo} - {rasgo_largura}"
      #   "{altura} - {folga_gaveta_fundo} - {folga_entre_gavetas}"
      #
      # Prioridade no JsonModuleBuilder:
      #   PARAM_ALIASES < shop_expr_params < JSON defaults < user_params
      #
      # @param cfg [Hash, nil]  config já carregada (evita double-load)
      # @return [Hash<String, Numeric|String>]
      # Quantidade de dobradiças para uma porta com dada altura (mm)
      # @param altura_porta [Numeric] altura em mm
      # @param config [Hash, nil]
      # @return [Integer]
      def self.hinge_count_for(altura_porta, config = nil)
        c   = config || load
        cfg = c.dig('dobradica', 'quantidade_por_altura') ||
              { 'ate_800' => 2, 'ate_1200' => 3, 'acima_1200' => 4 }
        h = altura_porta.to_f
        if    h <= 800  then cfg['ate_800']    || 2
        elsif h <= 1200 then cfg['ate_1200']   || 3
        else                 cfg['acima_1200'] || 4
        end
      end

      # Sobreposição em mm para um tipo de braço de dobradiça
      # @param tipo [String] 'reta' | 'curva' | 'super_curva'
      # @param config [Hash, nil]
      # @return [Float]
      def self.overlay_for(tipo, config = nil)
        c = config || load
        (c.dig('sobreposicao', tipo.to_s) || 0).to_f
      end

      def self.to_expr_params(cfg = nil)
        c = cfg || load

        fg   = c['folgas']         || {}
        fpa  = fg['porta_abrir']   || {}
        fpc  = fg['porta_correr']  || {}
        fgv  = fg['gaveta']        || {}
        fpr  = fg['prateleira']    || {}
        fdv  = fg['divisoria']     || {}
        dob  = c['dobradica']      || {}
        sob  = c['sobreposicao']   || {}
        mf   = c['minifix']        || {}
        cf   = c['confirmat']      || {}
        cv   = c['cavilha']        || {}
        pp   = c['pino_prateleira']|| {}
        s32  = c['system32']       || {}
        cr   = c['corredica']      || {}
        rf   = c['rasgo_fundo']    || {}
        pu   = c['puxador']        || {}

        {
          # ── Espessuras padrão ───────────────────────────────
          'espessura_carcaca'      => c['espessura_carcaca_padrao'] || 18,
          'espessura_fundo'        => c['espessura_fundo_padrao']   || 6,
          'espessura_frente'       => c['espessura_frente_padrao']  || 18,
          'fundo_metodo'           => c['fundo_metodo_padrao']      || 'rasgo',

          # ── Folgas: porta de abrir ──────────────────────────
          'folga_porta_lateral'    => fpa['lateral_ext']    || 2.0,
          'folga_porta_int'        => fpa['lateral_int']    || 1.5,
          'folga_entre_modulos'    => fpa['entre_modulos']  || 3.0,
          'folga_porta_topo'       => fpa['topo']           || 2.0,
          'folga_porta_base'       => fpa['base']           || 2.0,

          # ── Folgas: porta de correr ─────────────────────────
          'folga_correr_topo'      => fpc['topo']           || 3.0,
          'folga_correr_base'      => fpc['base']           || 3.0,

          # ── Folgas: gaveta ──────────────────────────────────
          'folga_gaveta_lateral'   => fgv['lateral']        || 12.5,
          'folga_gaveta_fundo'     => fgv['fundo']          || 5.0,
          'folga_gaveta_topo'      => fgv['topo']           || 5.0,
          'folga_entre_gavetas'    => fgv['entre_gavetas']  || 3.0,

          # ── Folgas: prateleira ──────────────────────────────
          'folga_prat_lateral'     => fpr['lateral']        || 1.0,
          'folga_prat_traseira'    => fpr['traseira']       || 20.0,

          # ── Folgas: divisória ───────────────────────────────
          'folga_div_topo'         => fdv['topo']           || 1.0,
          'folga_div_base'         => fdv['base']           || 1.0,

          # ── Rasgo de fundo ──────────────────────────────────
          # largura do rasgo = espessura do fundo (calculada por módulo)
          'rasgo_profundidade'     => rf['profundidade']    || 6.0,
          'rasgo_recuo'            => rf['recuo']           || 15.0,

          # ── Dobradiça ───────────────────────────────────────
          'dobradica_edge_offset'  => dob['edge_offset']    || 22.0,
          'dobradica_cup_dia'      => dob['cup_dia']        || 35.0,
          'dobradica_cup_depth'    => dob['cup_depth']      || 13.5,
          'dobradica_top_offset'   => dob['top_offset']     || 100.0,

          # ── Sobreposição por tipo de braço ──────────────────
          'sobreposicao_reta'      => sob['reta']           || 16.0,
          'sobreposicao_curva'     => sob['curva']          || 8.0,
          'sobreposicao_sup_curva' => sob['super_curva']    || 0.0,

          # ── Minifix ─────────────────────────────────────────
          'minifix_spacing'        => mf['spacing']         || 128.0,
          'minifix_body_dia'       => mf['body_dia']        || 15.0,
          'minifix_body_depth'     => mf['body_depth']      || 13.0,
          'minifix_min_edge'       => mf['min_edge']        || 50.0,

          # ── Confirmat ───────────────────────────────────────
          'confirmat_spacing'      => cf['spacing']         || 128.0,
          'confirmat_min_edge'     => cf['min_edge']        || 50.0,

          # ── Cavilha ─────────────────────────────────────────
          'cavilha_dia'            => cv['dia']             || 8.0,
          'cavilha_depth'          => cv['depth']           || 15.0,
          'cavilha_spacing'        => cv['spacing']         || 96.0,
          'cavilha_min_edge'       => cv['min_edge']        || 32.0,

          # ── Pino de prateleira ──────────────────────────────
          'pino_diametro'          => pp['diametro']        || 5.0,
          'pino_profundidade'      => pp['profundidade']    || 12.0,
          'pino_espacamento'       => pp['espacamento']     || 32.0,
          'pino_quantidade'        => pp['quantidade']      || 10,
          'pino_offset_base'       => pp['offset_base']     || 64.0,
          'pino_offset_topo'       => pp['offset_topo']     || 64.0,

          # ── Corrediça ───────────────────────────────────────
          'corredica_comprimento'  => cr['comprimento']     || 450,
          'corredica_alt_fixacao'  => cr['altura_fixacao']  || 37.0,

          # ── Puxador ─────────────────────────────────────────
          'puxador_espacamento'    => pu['espacamento']     || 128,
          'puxador_recuo'          => pu['recuo']           || 37.0,
          'puxador_y_porta'        => pu['y_porta']         || 100.0,
          'puxador_dia_furo'       => pu['dia_furo']        || 5.0,
          'puxador_cnc'            => pu['cnc']             || true,

          # ── Sistema 32 (desabilitado por padrão) ────────────
          'sys32_ativo'            => s32['ativo']          || false,
          'sys32_dia'              => s32['dia']            || 5.0,
          'sys32_spacing'          => s32['spacing']        || 32.0,
          'sys32_front_offset'     => s32['front_offset']   || 37.0,
          'sys32_top_margin'       => s32['top_margin']     || 37.0,
        }
      rescue => e
        puts "Ornato ShopConfig.to_expr_params ERRO: #{e.message}"
        {}
      end

      private

      def self.deep_merge(base, override)
        result = base.dup
        override.each do |k, v|
          result[k] = if v.is_a?(Hash) && base[k].is_a?(Hash)
            deep_merge(base[k], v)
          else
            v
          end
        end
        result
      end
    end
  end
end
