# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# MaterialCatalog — Catálogo de chapas e fitas de borda
#
# Espessuras válidas de MDF/MDP no mercado BR:
#   6, 12, 15, 18, 25, 30mm  (sem 3mm, sem 9mm)
#
# Cada material carrega sua espessura — ao selecionar um material,
# {espessura} é preenchido automaticamente no módulo.
#
# Convenção de código:
#   TIPO_ESPESSURA_ACABAMENTO
#   Ex: MDF18_BrancoTX, MDP18_Branco, MDF6_Branco, MDF25_Natural
#
# Uso:
#   cat = MaterialCatalog.instance
#   cat.thickness('MDF18_BrancoTX')    → 18
#   cat.tipo('MDF18_BrancoTX')         → 'MDF'
#   cat.sheet_price('MDF18_BrancoTX')  → 85.00
#   cat.for_ui                         → Array de hashes para select
#   cat.calculate_cost(pieces)         → { ... }
# ═══════════════════════════════════════════════════════════════

require 'json'

module Ornato
  module Catalog
    class MaterialCatalog

      # ─── Catálogo de chapas ────────────────────────────────
      # Cada entrada:
      #   code:        código único do material
      #   nome:        nome legível
      #   tipo:        'MDF' | 'MDP'
      #   espessura:   mm (Integer)
      #   acabamento:  string livre
      #   fita_padrao: código de fita padrão para esse material
      #   price_m2:    R$ por m² (editável via ERP/JSON externo)
      #   cor_hex:     cor visual no painel (opcional)

      DEFAULT_SHEETS = [
        # ── MDF 6mm ────────────────────────────────────────────
        { code: 'MDF6_Branco',      nome: 'MDF Branco 6mm',        tipo: 'MDF', espessura: 6,
          acabamento: 'Branco',     fita_padrao: 'BOR_04x22_Branco', price_m2: 38.0 },

        # ── MDF 12mm ───────────────────────────────────────────
        { code: 'MDF12_Branco',     nome: 'MDF Branco 12mm',       tipo: 'MDF', espessura: 12,
          acabamento: 'Branco',     fita_padrao: 'BOR_04x22_Branco', price_m2: 58.0 },
        { code: 'MDF12_Natural',    nome: 'MDF Natural 12mm',       tipo: 'MDF', espessura: 12,
          acabamento: 'Natural',    fita_padrao: 'BOR_04x22_Natural',price_m2: 55.0 },

        # ── MDF 15mm ───────────────────────────────────────────
        { code: 'MDF15_Branco',     nome: 'MDF Branco 15mm',       tipo: 'MDF', espessura: 15,
          acabamento: 'Branco',     fita_padrao: 'BOR_04x22_Branco', price_m2: 68.0 },
        { code: 'MDF15_BrancoTX',   nome: 'MDF Branco TX 15mm',    tipo: 'MDF', espessura: 15,
          acabamento: 'BrancoTX',   fita_padrao: 'BOR_04x22_Branco', price_m2: 72.0 },

        # ── MDF 18mm ───────────────────────────────────────────
        { code: 'MDF18_Branco',     nome: 'MDF Branco 18mm',       tipo: 'MDF', espessura: 18,
          acabamento: 'Branco',     fita_padrao: 'BOR_04x22_Branco', price_m2: 78.0 },
        { code: 'MDF18_BrancoTX',   nome: 'MDF Branco TX 18mm',    tipo: 'MDF', espessura: 18,
          acabamento: 'BrancoTX',   fita_padrao: 'BOR_04x22_Branco', price_m2: 85.0 },
        { code: 'MDF18_Preto',      nome: 'MDF Preto 18mm',        tipo: 'MDF', espessura: 18,
          acabamento: 'Preto',      fita_padrao: 'BOR_04x22_Preto',  price_m2: 90.0 },
        { code: 'MDF18_Natural',    nome: 'MDF Natural 18mm',       tipo: 'MDF', espessura: 18,
          acabamento: 'Natural',    fita_padrao: 'BOR_04x22_Natural',price_m2: 80.0 },
        { code: 'MDF18_Lacado',     nome: 'MDF Lacado Branco 18mm', tipo: 'MDF', espessura: 18,
          acabamento: 'Lacado',     fita_padrao: 'BOR_1x22_Branco',  price_m2: 145.0 },
        { code: 'MDF18_Cinza',      nome: 'MDF Cinza 18mm',         tipo: 'MDF', espessura: 18,
          acabamento: 'Cinza',      fita_padrao: 'BOR_04x22_Cinza',  price_m2: 88.0 },

        # ── MDF 25mm ───────────────────────────────────────────
        { code: 'MDF25_Branco',     nome: 'MDF Branco 25mm',       tipo: 'MDF', espessura: 25,
          acabamento: 'Branco',     fita_padrao: 'BOR_04x22_Branco', price_m2: 118.0 },
        { code: 'MDF25_BrancoTX',   nome: 'MDF Branco TX 25mm',    tipo: 'MDF', espessura: 25,
          acabamento: 'BrancoTX',   fita_padrao: 'BOR_04x22_Branco', price_m2: 125.0 },
        { code: 'MDF25_Natural',    nome: 'MDF Natural 25mm',       tipo: 'MDF', espessura: 25,
          acabamento: 'Natural',    fita_padrao: 'BOR_04x22_Natural',price_m2: 115.0 },

        # ── MDF 30mm ───────────────────────────────────────────
        { code: 'MDF30_Branco',     nome: 'MDF Branco 30mm',       tipo: 'MDF', espessura: 30,
          acabamento: 'Branco',     fita_padrao: 'BOR_2x22_Branco',  price_m2: 148.0 },
        { code: 'MDF30_Natural',    nome: 'MDF Natural 30mm',       tipo: 'MDF', espessura: 30,
          acabamento: 'Natural',    fita_padrao: 'BOR_2x22_Natural', price_m2: 140.0 },

        # ── MDP 15mm ───────────────────────────────────────────
        { code: 'MDP15_Branco',     nome: 'MDP Branco 15mm',       tipo: 'MDP', espessura: 15,
          acabamento: 'Branco',     fita_padrao: 'BOR_04x22_Branco', price_m2: 42.0 },

        # ── MDP 18mm ───────────────────────────────────────────
        { code: 'MDP18_Branco',     nome: 'MDP Branco 18mm',       tipo: 'MDP', espessura: 18,
          acabamento: 'Branco',     fita_padrao: 'BOR_04x22_Branco', price_m2: 52.0 },
        { code: 'MDP18_Preto',      nome: 'MDP Preto 18mm',         tipo: 'MDP', espessura: 18,
          acabamento: 'Preto',      fita_padrao: 'BOR_04x22_Preto',  price_m2: 58.0 },
        { code: 'MDP18_Natural',    nome: 'MDP Natural 18mm',        tipo: 'MDP', espessura: 18,
          acabamento: 'Natural',    fita_padrao: 'BOR_04x22_Natural',price_m2: 50.0 },

        # ── MDP 25mm ───────────────────────────────────────────
        { code: 'MDP25_Branco',     nome: 'MDP Branco 25mm',       tipo: 'MDP', espessura: 25,
          acabamento: 'Branco',     fita_padrao: 'BOR_04x22_Branco', price_m2: 88.0 },

        # ── MDP 30mm ───────────────────────────────────────────
        { code: 'MDP30_Branco',     nome: 'MDP Branco 30mm',       tipo: 'MDP', espessura: 30,
          acabamento: 'Branco',     fita_padrao: 'BOR_2x22_Branco',  price_m2: 115.0 },

      ].freeze

      # ─── Catálogo de fitas de borda ────────────────────────
      DEFAULT_EDGES = [
        # PVC 0.4mm (padrão)
        { code: 'BOR_04x22_Branco',  nome: 'Fita PVC 0.4x22 Branco',  espessura: 0.4, altura: 22, price_m: 1.20 },
        { code: 'BOR_04x22_Preto',   nome: 'Fita PVC 0.4x22 Preto',   espessura: 0.4, altura: 22, price_m: 1.40 },
        { code: 'BOR_04x22_Natural', nome: 'Fita PVC 0.4x22 Natural',  espessura: 0.4, altura: 22, price_m: 1.30 },
        { code: 'BOR_04x22_Cinza',   nome: 'Fita PVC 0.4x22 Cinza',   espessura: 0.4, altura: 22, price_m: 1.35 },

        # PVC 1mm
        { code: 'BOR_1x22_Branco',   nome: 'Fita PVC 1x22 Branco',    espessura: 1.0, altura: 22, price_m: 2.50 },
        { code: 'BOR_1x22_Preto',    nome: 'Fita PVC 1x22 Preto',     espessura: 1.0, altura: 22, price_m: 2.80 },

        # ABS 2mm
        { code: 'BOR_2x22_Branco',   nome: 'Fita ABS 2x22 Branco',    espessura: 2.0, altura: 22, price_m: 4.80 },
        { code: 'BOR_2x22_Preto',    nome: 'Fita ABS 2x22 Preto',     espessura: 2.0, altura: 22, price_m: 5.20 },
        { code: 'BOR_2x22_Natural',  nome: 'Fita ABS 2x22 Natural',   espessura: 2.0, altura: 22, price_m: 4.90 },
        { code: 'BOR_2x28_Branco',   nome: 'Fita ABS 2x28 Branco',    espessura: 2.0, altura: 28, price_m: 5.50 },
        { code: 'BOR_2x45_Branco',   nome: 'Fita ABS 2x45 Branco',    espessura: 2.0, altura: 45, price_m: 7.20 },

        # ABS 3mm
        { code: 'BOR_3x22_Branco',   nome: 'Fita ABS 3x22 Branco',    espessura: 3.0, altura: 22, price_m: 8.50 },
        { code: 'BOR_3x33_Branco',   nome: 'Fita ABS 3x33 Branco',    espessura: 3.0, altura: 33, price_m: 10.0 },
      ].freeze

      # Tamanhos padrão de chapa (mm)
      SHEET_SIZES = [
        { width: 2750, height: 1830, nome: '2750×1830 (padrão)' },
        { width: 2750, height: 1850, nome: '2750×1850' },
        { width: 2440, height: 1830, nome: '2440×1830' },
        { width: 2440, height: 1220, nome: '2440×1220' },
        { width: 1830, height: 1220, nome: '1830×1220 (meia chapa)' },
      ].freeze

      # ─── Singleton ────────────────────────────────────────
      @instance = nil
      def self.instance
        @instance ||= new
      end

      def initialize
        @sheets = load_sheets
        @edges  = load_edges
      end

      # ─── API de consulta ──────────────────────────────────

      # @param code [String]
      # @return [Integer, nil] espessura em mm
      def thickness(code)
        sheet = find_sheet(code)
        sheet ? sheet[:espessura] : extract_thickness_from_code(code)
      end

      # @param code [String]
      # @return [String, nil] 'MDF' | 'MDP'
      def tipo(code)
        find_sheet(code)&.dig(:tipo)
      end

      # @param code [String]
      # @return [String, nil] código da fita padrão para este material
      def default_edge(code)
        find_sheet(code)&.dig(:fita_padrao)
      end

      # @param code [String]
      # @return [Float] preço em R$/m²
      def sheet_price(code)
        sheet = find_sheet(code) || best_match_sheet(code)
        sheet ? sheet[:price_m2].to_f : 78.0
      end

      # @param code [String]
      # @return [Float] preço em R$/ml
      def edge_price(code)
        edge = @edges.find { |e| e[:code] == code }
        edge ? edge[:price_m].to_f : 4.80
      end

      # Lista todos os materiais para UI (select/dropdown)
      # @param filtro_tipo [String, nil] 'MDF' | 'MDP' | nil (todos)
      # @return [Array<Hash>]
      def for_ui(filtro_tipo: nil)
        list = @sheets
        list = list.select { |s| s[:tipo] == filtro_tipo } if filtro_tipo
        list.map do |s|
          {
            code:      s[:code],
            nome:      s[:nome],
            tipo:      s[:tipo],
            espessura: s[:espessura],
            acabamento:s[:acabamento],
          }
        end
      end

      # Lista fitas de borda para UI
      def edges_for_ui
        @edges.map { |e| { code: e[:code], nome: e[:nome], espessura: e[:espessura] } }
      end

      # Retorna hash completo de um material pelo código
      # @param code [String]
      # @return [Hash, nil]
      def sheet_info(code)
        find_sheet(code)
      end

      # Calcula custo de materiais a partir de peças analisadas
      # @param pieces [Array<Hash>] cada hash com :material, :comprimento, :largura, :bordas
      # @return [Hash] { chapas:, bordas:, total_chapas:, total_bordas:, total: }
      def calculate_cost(pieces)
        chapa_costs = {}
        borda_costs = {}

        (pieces || []).each do |p|
          mat  = p[:material].to_s
          comp = p[:comprimento].to_f   # mm
          larg = p[:largura].to_f       # mm
          qtd  = (p[:quantidade] || 1).to_i
          area = (comp * larg) / 1_000_000.0 * qtd

          chapa_costs[mat] ||= { area_m2: 0.0, price_m2: sheet_price(mat), custo: 0.0, qtd_pecas: 0 }
          chapa_costs[mat][:area_m2]   += area
          chapa_costs[mat][:custo]     += area * chapa_costs[mat][:price_m2]
          chapa_costs[mat][:qtd_pecas] += qtd

          # Bordas
          (p[:bordas] || {}).each do |lado, cod_borda|
            next if cod_borda.nil? || cod_borda.to_s.empty?
            dim_mm = [:frente, :tras].include?(lado.to_sym) ? comp : larg
            metros = (dim_mm / 1000.0) * qtd
            borda_costs[cod_borda] ||= { metros: 0.0, price_m: edge_price(cod_borda), custo: 0.0 }
            borda_costs[cod_borda][:metros] += metros
            borda_costs[cod_borda][:custo]  += metros * borda_costs[cod_borda][:price_m]
          end
        end

        total_chapas = chapa_costs.values.sum { |v| v[:custo] }.round(2)
        total_bordas = borda_costs.values.sum { |v| v[:custo] }.round(2)

        {
          chapas:        chapa_costs,
          bordas:        borda_costs,
          total_chapas:  total_chapas,
          total_bordas:  total_bordas,
          total:         (total_chapas + total_bordas).round(2),
        }
      end

      # Retorna JSON para a UI (catálogo completo)
      def to_ui_json
        JSON.generate({
          materiais:   for_ui,
          bordas:      edges_for_ui,
          tamanhos_chapa: SHEET_SIZES,
        })
      end

      # ─── Compatibilidade com código legado ────────────────
      # Suporte a códigos antigos estilo 'MDF_18', 'MDP_18'

      def self.thickness_from_legacy_code(code)
        parts = code.to_s.split('_')
        parts[1].to_i if parts.length >= 2 && parts[1].to_i > 0
      end

      private

      def load_sheets
        sheets = DEFAULT_SHEETS.map(&:dup)
        json_path = custom_json_path('chapas.json')
        if File.exist?(json_path)
          begin
            extra = JSON.parse(File.read(json_path), symbolize_names: true)
            extra.each do |item|
              existing = sheets.find { |s| s[:code] == item[:code] }
              if existing
                existing.merge!(item)
              else
                sheets << item
              end
            end
          rescue => e
            puts "Ornato MaterialCatalog: erro ao carregar chapas.json: #{e.message}"
          end
        end
        sheets
      end

      def load_edges
        edges = DEFAULT_EDGES.map(&:dup)
        json_path = custom_json_path('bordas.json')
        if File.exist?(json_path)
          begin
            extra = JSON.parse(File.read(json_path), symbolize_names: true)
            extra.each do |item|
              existing = edges.find { |e| e[:code] == item[:code] }
              if existing
                existing.merge!(item)
              else
                edges << item
              end
            end
          rescue => e
            puts "Ornato MaterialCatalog: erro ao carregar bordas.json: #{e.message}"
          end
        end
        edges
      end

      def find_sheet(code)
        @sheets.find { |s| s[:code] == code.to_s }
      end

      def best_match_sheet(code)
        esp = extract_thickness_from_code(code)
        return nil unless esp
        @sheets.find { |s| s[:espessura] == esp }
      end

      def extract_thickness_from_code(code)
        # Tenta MDF18_xxx → 18, MDF_18 → 18, 18mm → 18
        m = code.to_s.match(/(\d+)/)
        t = m ? m[1].to_i : nil
        Hardware::ShopConfig::FACTORY_DEFAULTS['espessuras_validas'].include?(t) ? t : nil
      rescue
        nil
      end

      def custom_json_path(filename)
        File.join(Ornato::PLUGIN_DIR, 'biblioteca', 'materiais', filename)
      rescue
        ''
      end

    end
  end
end
