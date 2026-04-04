# frozen_string_literal: true
# Ornato CNC Plugin - Library Manager
# Manages the model library: catalog sync, download on demand, caching,
# and custom module upload/download.

module Ornato
  module Library
    class LibraryManager

      CACHE_DIR = File.join(
        Sketchup.find_support_file('Plugins'), 'ornato_sketchup', 'biblioteca', 'cache'
      )
      CATALOG_FILE = File.join(CACHE_DIR, 'catalogo.json')
      CATALOG_MAX_AGE = 86400 # 24 hours before re-fetching catalog

      attr_reader :catalog

      def initialize
        @server_url = Sketchup.read_default('Ornato', 'server_url', 'http://localhost:3000')
        @auth_token = Sketchup.read_default('Ornato', 'auth_token', '')
        @catalog = nil
        ensure_dirs
        load_cached_catalog
      end

      # =====================================================================
      # CATALOG
      # =====================================================================

      # Sync catalog from server
      # @param force [Boolean] force re-download even if cached
      # @return [Boolean] success
      def sync_catalog(force = false)
        if !force && catalog_fresh?
          return true
        end

        data = api_get('/api/biblioteca/catalogo')
        return false unless data

        @catalog = JSON.parse(data)
        File.write(CATALOG_FILE, data)
        true
      rescue StandardError => e
        puts "Ornato Library: Failed to sync catalog: #{e.message}"
        false
      end

      # List available models in a category
      # @param category [String] category name
      # @return [Array<Hash>] models in the category
      def list_category(category)
        ensure_catalog
        return [] unless @catalog && @catalog['models']

        @catalog['models'].select { |m| m['category'] == category }
      end

      # List all categories
      # @return [Array<String>] category names
      def categories
        ensure_catalog
        return [] unless @catalog && @catalog['models']

        @catalog['models'].map { |m| m['category'] }.uniq.sort
      end

      # Search models by name
      # @param query [String] search query
      # @return [Array<Hash>] matching models
      def search(query)
        ensure_catalog
        return [] unless @catalog && @catalog['models']

        q = query.downcase
        @catalog['models'].select do |m|
          m['id'].downcase.include?(q) ||
          (m['original_name'] || '').downcase.include?(q) ||
          (m['category'] || '').downcase.include?(q)
        end
      end

      # =====================================================================
      # MODEL DOWNLOAD
      # =====================================================================

      # Get a model file path (download if not cached)
      # @param category [String] model category
      # @param model_id [String] model identifier (snake_case)
      # @return [String, nil] local file path or nil
      def get_model(category, model_id)
        # Check cache first
        cached = cached_model_path(category, model_id)
        return cached if cached && File.exist?(cached)

        # Download from server
        download_model(category, model_id)
      end

      # Get a material file path (download if not cached)
      # @param supplier [String] supplier name
      # @param pattern [String] material pattern name
      # @return [String, nil] local file path or nil
      def get_material(supplier, pattern)
        cached = cached_material_path(supplier, pattern)
        return cached if cached && File.exist?(cached)

        download_material(supplier, pattern)
      end

      # Get thumbnail path (download if not cached)
      # @param category [String] model category
      # @param model_id [String] model identifier
      # @return [String, nil] local file path or nil
      def get_thumbnail(category, model_id)
        cached = File.join(CACHE_DIR, 'thumbnails', category, "#{model_id}.png")
        return cached if File.exist?(cached)

        data = api_get("/api/biblioteca/thumbnail/#{category}/#{model_id}", auth: false)
        return nil unless data

        dir = File.join(CACHE_DIR, 'thumbnails', category)
        FileUtils.mkdir_p(dir)
        File.binwrite(cached, data)
        cached
      rescue StandardError
        nil
      end

      # =====================================================================
      # CUSTOM MODULES
      # =====================================================================

      # List user's custom modules
      # @return [Array<Hash>] custom module metadata
      def list_custom_modules
        data = api_get('/api/biblioteca/personalizados')
        return [] unless data

        JSON.parse(data)
      rescue StandardError
        []
      end

      # Upload a custom module to the server
      # @param skp_path [String] path to .skp file
      # @param metadata [Hash] module metadata
      # @return [Boolean] success
      def upload_custom_module(skp_path, metadata)
        require 'net/http'

        url = URI.parse("#{@server_url}/api/biblioteca/personalizado")
        boundary = "----OrnatoUpload#{Time.now.to_i}#{rand(1000)}"

        body = ""
        body << "--#{boundary}\r\n"
        body << "Content-Disposition: form-data; name=\"metadata\"\r\n"
        body << "Content-Type: application/json\r\n\r\n"
        body << metadata.to_json
        body << "\r\n"

        body << "--#{boundary}\r\n"
        body << "Content-Disposition: form-data; name=\"model\"; filename=\"#{File.basename(skp_path)}\"\r\n"
        body << "Content-Type: application/octet-stream\r\n\r\n"
        body << File.binread(skp_path)
        body << "\r\n"

        body << "--#{boundary}--\r\n"

        http = Net::HTTP.new(url.host, url.port)
        http.use_ssl = (url.scheme == 'https')

        request = Net::HTTP::Post.new(url.path)
        request['Authorization'] = "Bearer #{@auth_token}"
        request['Content-Type'] = "multipart/form-data; boundary=#{boundary}"
        request.body = body

        response = http.request(request)
        response.code == '200' || response.code == '201'
      rescue StandardError => e
        puts "Ornato Library: Upload failed: #{e.message}"
        false
      end

      # Download a custom module
      # @param module_id [String] module identifier
      # @return [String, nil] local file path
      def download_custom_module(module_id)
        data = api_get("/api/biblioteca/personalizado/#{module_id}", binary: true)
        return nil unless data

        dir = File.join(CACHE_DIR, 'personalizados')
        FileUtils.mkdir_p(dir)

        path = File.join(dir, "#{module_id}.skp")
        File.binwrite(path, data)
        path
      rescue StandardError
        nil
      end

      # =====================================================================
      # CACHE MANAGEMENT
      # =====================================================================

      # Clear all cached files
      def clear_cache
        FileUtils.rm_rf(CACHE_DIR)
        ensure_dirs
        @catalog = nil
      end

      # Get cache size in bytes
      def cache_size
        return 0 unless File.directory?(CACHE_DIR)

        Dir.glob(File.join(CACHE_DIR, '**', '*'))
          .select { |f| File.file?(f) }
          .sum { |f| File.size(f) }
      end

      # Get cache size formatted
      def cache_size_formatted
        bytes = cache_size
        if bytes > 1_073_741_824
          "%.1f GB" % (bytes / 1_073_741_824.0)
        elsif bytes > 1_048_576
          "%.1f MB" % (bytes / 1_048_576.0)
        elsif bytes > 1024
          "%.1f KB" % (bytes / 1024.0)
        else
          "#{bytes} bytes"
        end
      end

      private

      # Download a model from server
      def download_model(category, model_id)
        data = api_get("/api/biblioteca/modelo/#{category}/#{model_id}", binary: true)
        return nil unless data

        dir = File.join(CACHE_DIR, 'modelos', category)
        FileUtils.mkdir_p(dir)

        path = File.join(dir, "#{model_id}.skp")
        File.binwrite(path, data)
        path
      rescue StandardError => e
        puts "Ornato Library: Download failed for #{category}/#{model_id}: #{e.message}"
        nil
      end

      # Download a material from server
      def download_material(supplier, pattern)
        data = api_get("/api/biblioteca/material/#{supplier}/#{pattern}", binary: true)
        return nil unless data

        dir = File.join(CACHE_DIR, 'materiais', supplier)
        FileUtils.mkdir_p(dir)

        path = File.join(dir, "#{pattern}.skm")
        File.binwrite(path, data)
        path
      rescue StandardError => e
        puts "Ornato Library: Material download failed: #{e.message}"
        nil
      end

      # Generic API GET request
      def api_get(path, options = {})
        require 'net/http'
        require 'uri'

        url = URI.parse("#{@server_url}#{path}")

        http = Net::HTTP.new(url.host, url.port)
        http.use_ssl = (url.scheme == 'https')
        http.open_timeout = 10
        http.read_timeout = 120

        request = Net::HTTP::Get.new(url.request_uri)
        unless options[:auth] == false
          request['Authorization'] = "Bearer #{@auth_token}"
        end

        response = http.request(request)

        if response.code == '200'
          response.body
        else
          puts "Ornato Library: API error #{response.code} for #{path}"
          nil
        end
      rescue StandardError => e
        puts "Ornato Library: API request failed: #{e.message}"
        nil
      end

      # Check if cached catalog is still fresh
      def catalog_fresh?
        return false unless File.exist?(CATALOG_FILE)

        age = Time.now - File.mtime(CATALOG_FILE)
        age < CATALOG_MAX_AGE
      end

      # Load catalog from cache
      def load_cached_catalog
        if File.exist?(CATALOG_FILE)
          @catalog = JSON.parse(File.read(CATALOG_FILE))
        end
      rescue StandardError
        @catalog = nil
      end

      # Ensure catalog is loaded
      def ensure_catalog
        return if @catalog

        load_cached_catalog
        sync_catalog unless @catalog
      end

      # Path to cached model
      def cached_model_path(category, model_id)
        File.join(CACHE_DIR, 'modelos', category, "#{model_id}.skp")
      end

      # Path to cached material
      def cached_material_path(supplier, pattern)
        File.join(CACHE_DIR, 'materiais', supplier, "#{pattern}.skm")
      end

      # Create required directories
      def ensure_dirs
        [
          CACHE_DIR,
          File.join(CACHE_DIR, 'modelos'),
          File.join(CACHE_DIR, 'materiais'),
          File.join(CACHE_DIR, 'thumbnails'),
          File.join(CACHE_DIR, 'personalizados'),
        ].each do |dir|
          FileUtils.mkdir_p(dir) unless File.directory?(dir)
        end
      rescue StandardError
        # Silently fail if permissions prevent directory creation
      end

    end
  end
end
