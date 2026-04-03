# =====================================================
# ApiSync -- HTTP client para sincronizar diretamente
# com o Ornato ERP via API REST
# =====================================================

require 'net/http'
require 'uri'
require 'json'

module Ornato
  module Export
    class ApiSync
      DEFAULT_TIMEOUT = 30 # segundos

      # @param config [Hash] configuracao do plugin (deve conter :api => { url:, token: })
      def initialize(config = {})
        api_cfg = config[:api] || config['api'] || {}
        @base_url = (api_cfg[:url] || api_cfg['url'] || 'http://localhost:3001').chomp('/')
        @token = api_cfg[:token] || api_cfg['token'] || ''
        @timeout = api_cfg[:timeout] || api_cfg['timeout'] || DEFAULT_TIMEOUT
      end

      # Testa conexao com o Ornato ERP.
      #
      # @param config [Hash] override de configuracao (opcional)
      # @return [Hash] { ok: true/false, message: String, version: String? }
      def test_connection(config = nil)
        if config
          api_cfg = config[:api] || config['api'] || config
          url = (api_cfg[:url] || api_cfg['url'] || @base_url).chomp('/')
          token = api_cfg[:token] || api_cfg['token'] || @token
        else
          url = @base_url
          token = @token
        end

        uri = URI.parse("#{url}/api/cnc/plugin")
        response = make_get_request(uri, token)

        if response.is_a?(Net::HTTPSuccess)
          body = parse_json(response.body)
          {
            ok: true,
            message: 'Conexao com Ornato ERP estabelecida',
            version: body['version'] || 'desconhecida',
            server: url,
          }
        else
          {
            ok: false,
            message: "Servidor respondeu com status #{response.code}: #{response.message}",
            server: url,
          }
        end
      rescue Errno::ECONNREFUSED
        { ok: false, message: "Conexao recusada em #{url}. Verifique se o servidor esta rodando.", server: url }
      rescue Errno::ETIMEDOUT, Net::OpenTimeout, Net::ReadTimeout
        { ok: false, message: "Timeout ao conectar em #{url}. Verifique a rede.", server: url }
      rescue SocketError => e
        { ok: false, message: "Erro de DNS/rede: #{e.message}", server: url }
      rescue StandardError => e
        { ok: false, message: "Erro inesperado: #{e.message}", server: url }
      end

      # Envia JSON de pecas para importacao no Ornato CNC.
      #
      # @param json_data [Hash|String] dados no formato parsePluginJSON
      # @param config [Hash] override de configuracao (opcional)
      # @param nome [String] nome do lote (opcional)
      # @param projeto_id [Integer] ID do projeto no ERP (opcional)
      # @param orc_id [Integer] ID do orcamento no ERP (opcional)
      # @return [Hash] { ok: true/false, lote_id:, total_pecas:, message: }
      def sync(json_data, config: nil, nome: nil, projeto_id: nil, orc_id: nil)
        if config
          api_cfg = config[:api] || config['api'] || config
          url = (api_cfg[:url] || api_cfg['url'] || @base_url).chomp('/')
          token = api_cfg[:token] || api_cfg['token'] || @token
        else
          url = @base_url
          token = @token
        end

        if token.nil? || token.empty?
          return { ok: false, message: 'Token de autenticacao nao configurado. Configure em Ornato > Configurar Ferragens > aba API.' }
        end

        uri = URI.parse("#{url}/api/cnc/lotes/importar")

        payload = {
          json: json_data.is_a?(String) ? JSON.parse(json_data) : json_data,
        }
        payload[:nome] = nome if nome && !nome.empty?
        payload[:projeto_id] = projeto_id if projeto_id
        payload[:orc_id] = orc_id if orc_id

        response = make_post_request(uri, token, payload)

        if response.is_a?(Net::HTTPSuccess)
          body = parse_json(response.body)
          {
            ok: true,
            lote_id: body['id'] || body['lote_id'],
            total_pecas: body['total_pecas'],
            nome: body['nome'],
            message: "Importado com sucesso: #{body['total_pecas']} pecas no lote ##{body['id'] || body['lote_id']}",
          }
        elsif response.is_a?(Net::HTTPUnauthorized) || response.is_a?(Net::HTTPForbidden)
          { ok: false, message: 'Token invalido ou expirado. Verifique suas credenciais no ERP.' }
        elsif response.is_a?(Net::HTTPBadRequest)
          body = parse_json(response.body)
          { ok: false, message: "Erro de validacao: #{body['error'] || response.message}" }
        else
          body = parse_json(response.body)
          { ok: false, message: "Erro do servidor (#{response.code}): #{body['error'] || response.message}" }
        end
      rescue Errno::ECONNREFUSED
        { ok: false, message: "Conexao recusada em #{url}. Verifique se o servidor esta rodando." }
      rescue Errno::ETIMEDOUT, Net::OpenTimeout, Net::ReadTimeout
        { ok: false, message: "Timeout ao enviar dados para #{url}." }
      rescue JSON::ParserError => e
        { ok: false, message: "JSON invalido: #{e.message}" }
      rescue StandardError => e
        { ok: false, message: "Erro inesperado: #{e.message}" }
      end

      # Busca lista de materiais da biblioteca do ERP.
      #
      # @return [Hash] { ok: true/false, materials: Array }
      def fetch_materials
        uri = URI.parse("#{@base_url}/api/cnc/materiais")
        response = make_get_request(uri, @token)

        if response.is_a?(Net::HTTPSuccess)
          body = parse_json(response.body)
          materials = body.is_a?(Array) ? body : (body['materiais'] || body['materials'] || [])
          { ok: true, materials: materials }
        else
          { ok: false, materials: [], message: "Erro ao buscar materiais: #{response.code}" }
        end
      rescue StandardError => e
        { ok: false, materials: [], message: "Erro: #{e.message}" }
      end

      # Busca lotes existentes do ERP.
      #
      # @return [Hash] { ok: true/false, lotes: Array }
      def fetch_lotes
        uri = URI.parse("#{@base_url}/api/cnc/lotes")
        response = make_get_request(uri, @token)

        if response.is_a?(Net::HTTPSuccess)
          body = parse_json(response.body)
          lotes = body.is_a?(Array) ? body : (body['lotes'] || [])
          { ok: true, lotes: lotes }
        else
          { ok: false, lotes: [], message: "Erro ao buscar lotes: #{response.code}" }
        end
      rescue StandardError => e
        { ok: false, lotes: [], message: "Erro: #{e.message}" }
      end

      private

      def make_get_request(uri, token)
        http = build_http(uri)
        request = Net::HTTP::Get.new(uri.request_uri)
        apply_headers(request, token)
        http.request(request)
      end

      def make_post_request(uri, token, payload)
        http = build_http(uri)
        request = Net::HTTP::Post.new(uri.request_uri)
        apply_headers(request, token)
        request.body = JSON.generate(payload)
        http.request(request)
      end

      def build_http(uri)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = (uri.scheme == 'https')
        http.open_timeout = @timeout
        http.read_timeout = @timeout
        http.verify_mode = OpenSSL::SSL::VERIFY_PEER if http.use_ssl?
        http
      end

      def apply_headers(request, token)
        request['Content-Type'] = 'application/json'
        request['Accept'] = 'application/json'
        request['User-Agent'] = "Ornato-SketchUp-Plugin/#{PLUGIN_VERSION rescue '1.0'}"
        request['Authorization'] = "Bearer #{token}" if token && !token.empty?
      end

      def parse_json(body)
        return {} if body.nil? || body.empty?

        JSON.parse(body)
      rescue JSON::ParserError
        {}
      end
    end
  end
end
