# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# RoleNormalizer — Normaliza roles de peças para o padrão interno
#
# Problema que resolve:
#   Os JSONs da biblioteca usam roles descritivos como 'lateral_esq',
#   'lateral_dir', 'topo', 'traseira', 'rodape'. O RulesEngine e o
#   MachiningInterpreter usam símbolos canônicos como :lateral, :top,
#   :back_panel, :kick. Este módulo faz a ponte entre os dois mundos.
#
# Uso:
#   RoleNormalizer.normalize('lateral_esq') → :lateral
#   RoleNormalizer.normalize('porta')       → :door
#   RoleNormalizer.normalize(:shelf)        → :shelf  (já normalizado)
#
# Consulta reversa (para UI):
#   RoleNormalizer.label(:lateral)          → "Lateral"
#   RoleNormalizer.color(:door)             → "#C9A96E"
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Core
    module RoleNormalizer

      # ─── Mapa canônico ────────────────────────────────────────
      # Chave: qualquer string/símbolo que apareça no JSON ou nos atributos
      # Valor: símbolo canônico interno
      MAP = {
        # Laterais
        'lateral'        => :lateral,
        'lateral_esq'    => :lateral,
        'lateral_dir'    => :lateral,
        'lateral_e'      => :lateral,
        'lateral_d'      => :lateral,
        'side'           => :lateral,
        'side_left'      => :lateral,
        'side_right'     => :lateral,

        # Horizontais — base
        'base'           => :base,
        'bottom'         => :base,
        'chao'           => :base,
        'floor'          => :base,

        # Horizontais — topo
        'topo'           => :top,
        'tampo'          => :top,
        'top'            => :top,
        'ceiling'        => :top,

        # Porta de abrir
        'porta'          => :door,
        'door'           => :door,
        'porta_abrir'    => :door,
        'porta_e'        => :door,
        'porta_d'        => :door,
        'porta_esq'      => :door,
        'porta_dir'      => :door,

        # Porta de correr
        'porta_correr'   => :sliding_door,
        'sliding_door'   => :sliding_door,
        'porta_deslizante'=> :sliding_door,

        # Traseira / fundo
        'traseira'       => :back_panel,
        'fundo'          => :back_panel,
        'back'           => :back_panel,
        'back_panel'     => :back_panel,

        # Prateleira
        'prateleira'     => :shelf,
        'shelf'          => :shelf,

        # Divisória
        'divisoria'      => :divider,
        'divisória'      => :divider,
        'divider'        => :divider,
        'partition'      => :divider,

        # Gaveta — lateral
        'gaveta_lado'    => :drawer_side,
        'drawer_side'    => :drawer_side,
        'lateral_gaveta' => :drawer_side,

        # Gaveta — fundo
        'gaveta_fundo'   => :drawer_bottom,
        'drawer_bottom'  => :drawer_bottom,

        # Gaveta — traseira
        'gaveta_traseira'=> :drawer_back,
        'drawer_back'    => :drawer_back,

        # Gaveta — frente / frente falsa
        'gaveta_frente'  => :drawer_front,
        'frente_gaveta'  => :drawer_front,
        'frente_falsa'   => :drawer_front,
        'drawer_front'   => :drawer_front,
        'frente'         => :drawer_front,

        # Gaveta — lateral interna (extra aliases)
        'gaveta_lat'     => :drawer_side,

        # Gaveta — fundo interno
        'fundo_gaveta'   => :drawer_bottom,
        'gaveta_bot'     => :drawer_bottom,

        # Gaveta — traseira interna
        'traseira_gaveta'=> :drawer_back,
        'gaveta_tras'    => :drawer_back,

        # Rodapé / saia
        'rodape'         => :kick,
        'rodapé'         => :kick,
        'kick'           => :kick,
        'saia'           => :kick,
        'kickboard'      => :kick,

        # Tamponamento / acabamento lateral
        'tamponamento'   => :cover,
        'cover'          => :cover,
        'acabamento'     => :cover,
        'painel_lateral' => :cover,

        # Painel ripado / revestimento decorativo técnico
        'painel'         => :panel,
        'panel'          => :panel,
        'painel_base'    => :panel,
        'painel_ripado'  => :panel,
        'ripa'           => :slat,
        'ripas'          => :slat,
        'slat'           => :slat,
        'ripado'         => :slat,

        # Cabideiro / varão / travessa
        'cabideiro'      => :rail,
        'varao'          => :rail,
        'varão'          => :rail,
        'rail'           => :rail,
        'travessa'       => :rail,
        'crossbar'       => :rail,

        # Tampo de bancada (countertop)
        'countertop'     => :countertop,
        'tampo_bancada'  => :countertop,

        # Genérico
        'generic'        => :generic,
        'generica'       => :generic,
        'outro'          => :generic,
      }.freeze

      # ─── Metadados para UI ────────────────────────────────────
      UI_META = {
        lateral:       { label: 'Lateral',        color: '#1379F0', pip: 'accent'  },
        base:          { label: 'Base',            color: '#22c55e', pip: 'green'   },
        top:           { label: 'Topo',            color: '#22c55e', pip: 'green'   },
        door:          { label: 'Porta',           color: '#C9A96E', pip: 'copper'  },
        sliding_door:  { label: 'Porta Correr',    color: '#C9A96E', pip: 'copper'  },
        back_panel:    { label: 'Fundo',           color: '#525d72', pip: 'muted'   },
        shelf:         { label: 'Prateleira',      color: '#a78bfa', pip: 'purple'  },
        divider:       { label: 'Divisória',       color: '#60a5fa', pip: 'blue'    },
        drawer_side:   { label: 'Lat. Gaveta',     color: '#f472b6', pip: 'pink'    },
        drawer_bottom: { label: 'Fundo Gaveta',    color: '#f472b6', pip: 'pink'    },
        drawer_back:   { label: 'Tras. Gaveta',    color: '#f472b6', pip: 'pink'    },
        drawer_front:  { label: 'Frente Gaveta',   color: '#C9A96E', pip: 'copper'  },
        kick:          { label: 'Rodapé',          color: '#525d72', pip: 'muted'   },
        cover:         { label: 'Tamponamento',    color: '#8b94a8', pip: 'gray'    },
        panel:         { label: 'Painel',          color: '#8b94a8', pip: 'gray'    },
        slat:          { label: 'Ripa',            color: '#C9A96E', pip: 'copper'  },
        rail:          { label: 'Varão',           color: '#8b94a8', pip: 'gray'    },
        countertop:    { label: 'Tampo Bancada',   color: '#C9A96E', pip: 'copper'  },
        generic:       { label: 'Peça',            color: '#525d72', pip: 'muted'   },
      }.freeze

      # ─── Usinagens compatíveis por role ───────────────────────
      # Usado pelo picker do drawer para filtrar opções relevantes
      COMPATIBLE_EXTRAS = {
        lateral:       %w[rasgo_led furo_passagem furo_livre],
        base:          %w[furo_livre recorte],
        top:           %w[rasgo_led pistao_gas furo_passagem furo_livre],
        door:          %w[rasgo_fechadura furo_passagem furo_livre],
        sliding_door:  %w[rasgo_fechadura furo_livre],
        back_panel:    %w[furo_passagem furo_livre],
        shelf:         %w[rasgo_led furo_passagem furo_livre],
        divider:       %w[furo_livre rasgo_led],
        drawer_side:   %w[furo_livre],
        drawer_bottom: %w[furo_livre],
        drawer_back:   %w[furo_livre],
        drawer_front:  %w[rasgo_fechadura furo_passagem furo_livre],
        kick:          %w[recorte furo_livre],
        cover:         %w[rasgo_led furo_livre],
        panel:         %w[furo_livre],
        slat:          %w[furo_livre],
        rail:          %w[],
        countertop:    %w[recorte furo_passagem rasgo_led furo_livre],
        generic:       %w[rasgo_led furo_passagem rasgo_fechadura pistao_gas recorte furo_livre],
      }.freeze

      # ─── API pública ──────────────────────────────────────────

      # Normaliza qualquer role para o símbolo canônico.
      # Aceita String ou Symbol. Retorna :generic se não reconhecido.
      #
      # @param raw [String, Symbol]
      # @return [Symbol]
      def self.normalize(raw)
        return :generic if raw.nil?
        key = raw.to_s.downcase.strip.tr('ç', 'c').tr('ã', 'a').tr('á', 'a')
        MAP[key] || MAP[raw.to_s.downcase] || :generic
      end

      # Normaliza e retorna como String (para gravar em atributo SketchUp)
      def self.normalize_s(raw)
        normalize(raw).to_s
      end

      # Label legível para UI
      def self.label(role)
        UI_META[normalize(role)]&.dig(:label) || role.to_s.capitalize
      end

      # Cor hex para UI
      def self.color(role)
        UI_META[normalize(role)]&.dig(:color) || '#525d72'
      end

      # CSS class do pip colorido
      def self.pip_class(role)
        UI_META[normalize(role)]&.dig(:pip) || 'muted'
      end

      # Lista de extras compatíveis com esse role
      def self.compatible_extras(role)
        COMPATIBLE_EXTRAS[normalize(role)] || COMPATIBLE_EXTRAS[:generic]
      end

      # Inferência por nome (fallback quando não há atributo role)
      # Versão expandida do guess_role do RulesEngine
      def self.guess_from_name(name)
        n = name.to_s.downcase
                .tr('çáàãâéêíóôõúü', 'caaaaeeiooouuu')

        return :lateral       if n =~ /lateral|side/
        return :base          if n =~ /\bbase\b|bottom|chao/
        return :top           if n =~ /topo|tampo\b|top\b/
        return :door          if n =~ /porta(?!_correr)|door/
        return :sliding_door  if n =~ /correr|desliz|sliding/
        return :back_panel    if n =~ /traseira|fundo|back/
        return :shelf         if n =~ /prat|shelf/
        return :divider       if n =~ /divis|partition/
        return :drawer_front  if n =~ /frente|front/
        return :drawer_side   if n =~ /gaveta.*lado|drawer.*side/
        return :drawer_bottom if n =~ /gaveta.*fundo|drawer.*bottom/
        return :drawer_back   if n =~ /gaveta.*tras|drawer.*back/
        return :kick          if n =~ /rodape|rodapé|kick|saia/
        return :cover         if n =~ /tampon|cover|acabam/
        return :panel         if n =~ /painel|panel/
        return :slat          if n =~ /ripa|slat|ripado/
        return :rail          if n =~ /cabid|varao|varão|rail/
        :generic
      end

      # Lê role de uma entidade SketchUp com fallback completo
      def self.from_entity(entity)
        # 1. Atributo explícito Ornato (maiúsculo — padrão ParametricEngine)
        raw = entity.get_attribute('Ornato', 'role', nil)
        # 2. Fallback legado lowercase
        raw ||= entity.get_attribute('ornato', 'role', nil)
        # 3. Inferência pelo nome do grupo
        raw ? normalize(raw) : guess_from_name(entity.name)
      end

    end
  end
end
