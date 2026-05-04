# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# DoorCalculator — Cálculo de dimensões de portas e frentes
#
# Calcula altura e largura de portas com base em:
#   - Tipo de dobradiça (reta, curva, super_curva)
#   - Tipo de porta (normal, passante_sobe, passante_desce, basculante, correr)
#   - Número de portas (folhas)
#   - Folgas configuradas no ShopConfig
#   - Sobreposição por tipo de braço
#
# TIPOS DE BRAÇO / OVERLAY:
#   reta        → full overlay: porta cobre a lateral inteira
#                 sobreposição = espessura_carcaca - folga_lateral_ext
#   curva       → half overlay: porta cobre metade da lateral
#                 sobreposição = espessura_carcaca/2 - folga
#                 usada quando módulos são adjacentes + laterais duplas
#   super_curva → inset: porta embutida, não sobrepõe nada
#                 sobreposição = 0
#
# TIPOS DE PORTA:
#   normal        → dobradica padrão, com folgas em todos os lados
#   passante_sobe → (balcão) extensão passa ACIMA do tampo (área de grip)
#   passante_desce→ (aéreo)  extensão passa ABAIXO da base (área de grip)
#   basculante    → abre para cima com pistão; gira no topo
#   correr        → desliza em trilho; sem dobradiça
#
# Uso:
#   calc = DoorCalculator.new(shop_config)
#   result = calc.calculate(
#     abertura_altura:   720,    # altura interna da abertura (mm)
#     abertura_largura:  590,    # largura interna da abertura (mm)
#     n_portas:          2,
#     tipo_porta:        'normal',
#     tipo_braco:        'reta',
#     espessura_carcaca: 18,
#     extensao_passante: 0,
#     espessura_porta:   18,
#   )
#   result[:altura]  → 724   (altura da porta calculada)
#   result[:largura] → 294   (largura de cada folha)
#   result[:n_dobradicas] → 2
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Library
    class DoorCalculator

      # Tipos de braço de dobradiça
      TIPOS_BRACO = %w[reta curva super_curva].freeze

      # Tipos de porta
      TIPOS_PORTA = %w[normal passante_sobe passante_desce basculante correr].freeze

      # @param shop_config [Hash]  ShopConfig.load (ou .for_group)
      def initialize(shop_config = nil)
        @cfg = shop_config || (defined?(Hardware::ShopConfig) ? Hardware::ShopConfig.load : {})
        @folgas     = @cfg['folgas']       || {}
        @fpa        = @folgas['porta_abrir']|| {}
        @sobrepos   = @cfg['sobreposicao'] || {}
        @dob_cfg    = @cfg['dobradica']    || {}
      end

      # ─────────────────────────────────────────────────────
      # Calcula as dimensões de uma porta / frente de gaveta
      #
      # @param abertura_altura  [Numeric]  altura interna da abertura (mm)
      # @param abertura_largura [Numeric]  largura interna da abertura (mm)
      # @param n_portas         [Integer]  número de folhas
      # @param tipo_porta       [String]   'normal'|'passante_sobe'|'passante_desce'|...
      # @param tipo_braco       [String]   'reta'|'curva'|'super_curva'
      # @param espessura_carcaca[Numeric]  espessura do painel lateral (mm)
      # @param extensao_passante[Numeric]  quanto a porta passa além da carcaça (mm)
      # @param espessura_porta  [Numeric]  espessura da porta (mm)
      # @param lado_abertura    [String]   'esquerda'|'direita'|'par'|'impar'
      #
      # @return [Hash]
      #   :altura          → altura final da porta (mm)
      #   :largura         → largura de cada folha (mm)
      #   :n_portas        → número de folhas
      #   :n_dobradicas    → dobradiças por folha
      #   :sobreposicao    → overlay real aplicado (mm)
      #   :posicao_x       → offset X da 1ª porta em relação à lateral esq (mm)
      #   :posicao_z       → offset Z (altura da base da porta) (mm)
      #   :tipo_porta      → tipo normalizado
      #   :tipo_braco      → tipo de braço normalizado
      #   :folgas_aplicadas → hash das folgas usadas
      # ─────────────────────────────────────────────────────
      def calculate(abertura_altura:, abertura_largura:, n_portas: 1,
                    tipo_porta: 'normal', tipo_braco: 'reta',
                    espessura_carcaca: 18, extensao_passante: 0,
                    espessura_porta: 18, altura_rodape: 0,
                    lado_abertura: 'esquerda')

        tipo   = normalizar_tipo(tipo_porta)
        braco  = normalizar_braco(tipo_braco)
        n      = [n_portas.to_i, 1].max
        esp_c  = espessura_carcaca.to_f
        ext_p  = extensao_passante.to_f
        h_abe  = abertura_altura.to_f
        l_abe  = abertura_largura.to_f

        # ── Folgas base ──────────────────────────────────
        f_topo  = @fpa['topo'].to_f  || 2.0
        f_base  = @fpa['base'].to_f  || 2.0
        f_lat   = @fpa['lateral_ext'].to_f || 2.0
        f_int   = @fpa['lateral_int'].to_f || 1.5  # por folha, entre portas

        # ── Sobreposição pelo tipo de braço ──────────────
        sob = sobreposicao_para(braco, esp_c)

        # ── ALTURA da porta ──────────────────────────────
        altura = case tipo

        when 'normal'
          # Cobre a abertura interna + sobreposição topo + base
          # Porta reta: sobrepõe em cima e embaixo da abertura
          h_abe - f_topo - f_base + (braco != 'super_curva' ? sob * 2 : 0)

        when 'passante_sobe'
          # Balcão: porta passa ACIMA do tampo
          # Não tem folga no topo — a porta sobe além
          # Tem folga na base
          h_abe - f_base + ext_p

        when 'passante_desce'
          # Aéreo: porta passa ABAIXO da base
          # Não tem folga na base — a porta desce além
          # Tem folga no topo
          h_abe - f_topo + ext_p

        when 'basculante'
          # Abre para cima; mesmo cálculo da normal
          h_abe - f_topo - f_base

        when 'correr'
          # Porta de correr: só folgas verticais (trilho já contemplado)
          h_abe - f_topo - f_base

        else
          h_abe - f_topo - f_base
        end

        # ── LARGURA de cada folha ─────────────────────────
        # Espaço dividido entre n portas, com sobreposição lateral
        largura_total_com_sob = if braco == 'super_curva'
          # Inset: porta MENOR que a abertura interna
          l_abe - (f_lat * 2) - (f_int * (n - 1))
        else
          # Overlay: porta MAIOR que abertura (sobrepõe as laterais)
          l_abe + (sob * 2) - (f_lat * 2) - (f_int * (n - 1))
        end

        largura_folha = largura_total_com_sob / n

        # ── POSIÇÃO X da primeira folha ───────────────────
        pos_x = if braco == 'super_curva'
          esp_c + f_lat  # começa depois da lateral + folga
        else
          esp_c - sob + f_lat  # sobrepõe a lateral, respeitando folga
        end

        # ── POSIÇÃO Z (base da porta) ─────────────────────
        pos_z = case tipo
        when 'passante_sobe'
          # Porta sobe além do tampo → base na altura do base do módulo + folga
          altura_rodape + f_base
        when 'passante_desce'
          # Porta desce além da base → começa acima da abertura interna
          altura_rodape + esp_c + f_topo
        when 'normal', 'basculante'
          # Começa na parte interna + folga
          # Com reta/curva: sobrepõe → começa antes da abertura interna
          altura_rodape + esp_c - (braco != 'super_curva' ? sob : 0) + f_base
        when 'correr'
          altura_rodape + esp_c + f_base
        else
          altura_rodape + esp_c + f_base
        end

        # ── Número de dobradiças ──────────────────────────
        n_dob = if tipo == 'correr'
          0
        else
          dobradicam_count(altura.round(1))
        end

        {
          altura:        altura.round(1),
          largura:       largura_folha.round(1),
          n_portas:      n,
          n_dobradicas:  n_dob,
          sobreposicao:  sob,
          extensao_passante: ext_p,
          posicao_x:     pos_x.round(1),
          posicao_z:     pos_z.round(1),
          tipo_porta:    tipo,
          tipo_braco:    braco,
          folgas_aplicadas: {
            topo:  f_topo,
            base:  f_base,
            lat:   f_lat,
            int:   f_int,
          },
        }
      end

      # ─────────────────────────────────────────────────────
      # Calcula frente de gaveta
      #
      # @param abertura_altura  [Numeric]  altura da abertura da gaveta (mm)
      # @param abertura_largura [Numeric]  largura interna (mm)
      # @param tipo_braco       [String]   geralmente 'reta' em gavetas
      # @param espessura_carcaca[Numeric]
      # @param posicao_z_base   [Numeric]  Z base da abertura da gaveta (mm)
      #
      # @return [Hash] :altura, :largura, :posicao_x, :posicao_z
      # ─────────────────────────────────────────────────────
      def calculate_drawer_front(abertura_altura:, abertura_largura:,
                                  tipo_braco: 'reta', espessura_carcaca: 18,
                                  posicao_z_base: 0)

        f_lat   = @fpa['lateral_ext'].to_f || 2.0
        f_int   = @fpa['lateral_int'].to_f || 1.5
        sob     = sobreposicao_para(tipo_braco, espessura_carcaca.to_f)

        # Frente de gaveta: sem folga superior/inferior — adjacente às outras frentes
        # A folga entre frentes é {folga_entre_gavetas} no JSON
        altura  = abertura_altura.round(1)

        largura = if tipo_braco == 'super_curva'
          (abertura_largura - f_lat * 2).round(1)
        else
          (abertura_largura + sob * 2 - f_lat * 2).round(1)
        end

        pos_x = (espessura_carcaca - sob + f_lat).round(1)
        pos_z = posicao_z_base.round(1)

        { altura: altura, largura: largura, posicao_x: pos_x, posicao_z: pos_z }
      end

      # ─────────────────────────────────────────────────────
      # Quantidade de dobradiças pela altura da porta (mm)
      # ─────────────────────────────────────────────────────
      def dobradicam_count(altura_porta)
        return 0 if altura_porta <= 0
        cfg = @dob_cfg['quantidade_por_altura'] || {}
        h = altura_porta.to_f
        if    h <= (cfg['limite_800']  || 800)   then (cfg['ate_800']    || 2).to_i
        elsif h <= (cfg['limite_1200'] || 1200)  then (cfg['ate_1200']   || 3).to_i
        else                                          (cfg['acima_1200'] || 4).to_i
        end
      end

      # ─────────────────────────────────────────────────────
      # Posições Y das dobradiças na porta (offset do topo e da base)
      # @param altura_porta [Numeric] mm
      # @return [Array<Float>] posições em mm a partir do topo da porta
      # ─────────────────────────────────────────────────────
      def hinge_positions(altura_porta)
        n     = dobradicam_count(altura_porta)
        top_o = (@dob_cfg['top_offset'] || 100.0).to_f
        h     = altura_porta.to_f
        return [] if n == 0

        case n
        when 1 then [h / 2.0]
        when 2 then [top_o, h - top_o]
        when 3 then [top_o, h / 2.0, h - top_o]
        when 4 then [top_o, h * 0.33, h * 0.66, h - top_o]
        else
          # n > 4: distribuição uniforme
          (0...n).map { |i| top_o + (h - top_o * 2) * i / (n - 1).to_f }
        end
      end

      # Retorna JSON para ser usado nos ferragens_auto do módulo
      def to_hardware_params(altura_porta)
        {
          'n_dobradicas'     => dobradicam_count(altura_porta),
          'posicoes_dobrad'  => hinge_positions(altura_porta),
          'cup_dia'          => (@dob_cfg['cup_dia']      || 35.0).to_f,
          'cup_depth'        => (@dob_cfg['cup_depth']    || 13.5).to_f,
          'edge_offset'      => (@dob_cfg['edge_offset']  || 22.0).to_f,
        }
      end

      private

      def sobreposicao_para(braco, esp_carcaca)
        case braco
        when 'reta'
          f_lat = @fpa['lateral_ext'].to_f || 2.0
          esp_carcaca - f_lat
        when 'curva'
          f_lat = @fpa['lateral_ext'].to_f || 2.0
          (esp_carcaca / 2.0) - f_lat
        when 'super_curva'
          0.0
        else
          @sobrepos[braco].to_f
        end
      end

      def normalizar_tipo(tipo)
        t = tipo.to_s.downcase.strip
        TIPOS_PORTA.include?(t) ? t : 'normal'
      end

      def normalizar_braco(braco)
        b = braco.to_s.downcase.strip
        TIPOS_BRACO.include?(b) ? b : 'reta'
      end

    end
  end
end
