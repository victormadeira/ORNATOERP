# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# ErpIntegrator — Ponte entre o plugin SketchUp e o Ornato ERP
#
# Responsabilidades:
#   1. init_project(numero_ou_id) → busca dados do projeto no ERP
#   2. push_bom(modulos)          → envia BOM ao vivo para precificação
#   3. create_proposal(design)    → empurra o design para o orçamento ERP
#   4. Autenticação JWT via Sketchup.read_default('Ornato', 'auth_token')
#
# Todos os métodos retornam { ok: true/false, ... }
# e escrevem logs no console Ruby.
# ═══════════════════════════════════════════════════════════════

require 'net/http'
require 'uri'
require 'json'

module Ornato
  module Integration
    class ErpIntegrator

      DEFAULT_TIMEOUT = 8  # segundos

      def initialize(api_url = nil)
        config = defined?(Config) ? Config.load : {}
        @api_url = (api_url || config.dig(:api, :url) || 'http://localhost:3001').chomp('/')
        @token   = Sketchup.read_default('Ornato', 'auth_token', '').to_s
      end

      # ─────────────────────────────────────────────────────────
      # Inicia sessão de design para um projeto existente no ERP
      # @param numero_ou_id [String|Integer]  número ou ID do orçamento
      # @return [Hash] { ok:, projeto: { id, numero, cliente, ambiente, ... } }
      # ─────────────────────────────────────────────────────────
      def init_project(numero_ou_id)
        body = numero_ou_id.to_s.match?(/^\d+$/) ?
          { orc_id: numero_ou_id.to_i } :
          { numero:  numero_ou_id.to_s }

        post('/api/plugin/projeto/init', body)
      end

      # ─────────────────────────────────────────────────────────
      # Retorna informações de um projeto (sem iniciar sessão)
      # @param orc_id [Integer|String]
      # ─────────────────────────────────────────────────────────
      def project_info(orc_id)
        get("/api/plugin/projeto/#{orc_id}/info")
      end

      # ─────────────────────────────────────────────────────────
      # Envia BOM ao vivo para o ERP — retorna custo estimado
      # @param orc_id [Integer|String]
      # @param modulos [Array<Sketchup::Group>]  grupos Ornato no modelo
      # @return [Hash] { ok:, custo_estimado:, total_pecas: }
      # ─────────────────────────────────────────────────────────
      def push_bom(orc_id, modulos)
        bom = build_bom(modulos)
        result = post("/api/plugin/projeto/#{orc_id}/bom", bom)
        puts "Ornato ERP BOM: #{bom[:total_pecas]} peças → custo estimado R$ #{result[:custo_estimado]}" if result[:ok]
        result
      end

      # ─────────────────────────────────────────────────────────
      # Cria/atualiza proposta no ERP a partir do design completo
      # @param orc_id [Integer|String]
      # @param modulos [Array<Sketchup::Group>]
      # @param summary [Hash] { ambiente: 'Cozinha', ... }
      # @return [Hash] { ok:, proposta_url:, numero: }
      # ─────────────────────────────────────────────────────────
      def create_proposal(orc_id, modulos, summary = {})
        bom = build_bom(modulos)
        payload = {
          design_summary: summary,
          modulos:        bom[:modulos],
          pecas:          bom[:pecas],
        }
        post("/api/plugin/projeto/#{orc_id}/proposta", payload)
      end

      # ─────────────────────────────────────────────────────────
      # Ping rápido para verificar conectividade
      # ─────────────────────────────────────────────────────────
      def health_check
        get('/api/plugin/health')
      rescue
        { ok: false, error: 'Sem conexão com o ERP' }
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      # Constrói BOM a partir dos grupos Ornato no modelo
      def build_bom(modulos)
        mod_list = []
        peca_list = []

        [*modulos].each do |g|
          next unless g.is_a?(Sketchup::Group) || g.is_a?(Sketchup::ComponentInstance)
          type   = g.get_attribute('Ornato', 'module_type').to_s
          params = begin
            JSON.parse(g.get_attribute('Ornato', 'params') || '{}', symbolize_names: true)
          rescue; {}; end

          mod_list << {
            type:   type,
            label:  g.respond_to?(:name) ? g.name : type,
            params: params,
          }

          # Peças filhas
          g.entities.each do |e|
            next unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
            role = e.get_attribute('Ornato', 'role').to_s
            dims = begin
              JSON.parse(e.get_attribute('Ornato', 'dimensions') || '{}', symbolize_names: true)
            rescue; {}; end

            peca_list << {
              nome:        e.respond_to?(:name) ? e.name : role,
              modulo:      type,
              material:    params[:material].to_s,
              largura:     dims[:largura].to_f,
              comprimento: dims[:altura].to_f,
              espessura:   dims[:espessura].to_f,
              role:        role,
            }
          end
        end

        materiais_uniq = mod_list.map { |m| m[:params][:material] }.compact.uniq

        {
          modulos:      mod_list,
          pecas:        peca_list,
          total_pecas:  peca_list.length,
          materiais:    materiais_uniq,
        }
      end

      # ── HTTP helpers ─────────────────────────────────────────

      def get(path)
        uri = URI("#{@api_url}#{path}")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.open_timeout = DEFAULT_TIMEOUT
        http.read_timeout = DEFAULT_TIMEOUT

        req = Net::HTTP::Get.new(uri.request_uri)
        add_auth(req)

        response = http.request(req)
        parse_response(response)
      rescue => e
        puts "Ornato ERP GET #{path} ERRO: #{e.message}"
        { ok: false, error: e.message }
      end

      def post(path, body)
        uri = URI("#{@api_url}#{path}")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.open_timeout = DEFAULT_TIMEOUT
        http.read_timeout = DEFAULT_TIMEOUT

        req = Net::HTTP::Post.new(uri.request_uri)
        req['Content-Type'] = 'application/json'
        add_auth(req)
        req.body = body.to_json

        response = http.request(req)
        parse_response(response)
      rescue => e
        puts "Ornato ERP POST #{path} ERRO: #{e.message}"
        { ok: false, error: e.message }
      end

      def add_auth(req)
        req['Authorization'] = "Bearer #{@token}" unless @token.empty?
      end

      def parse_response(response)
        body = JSON.parse(response.body, symbolize_names: true)
        code = response.code.to_i
        if code == 200 || code == 201
          body[:ok] = true unless body.key?(:ok)
        else
          body[:ok] = false
          puts "Ornato ERP: HTTP #{code} — #{body[:error]}"
        end
        body
      rescue => e
        { ok: false, error: "Parse error: #{e.message}" }
      end
    end
  end
end
