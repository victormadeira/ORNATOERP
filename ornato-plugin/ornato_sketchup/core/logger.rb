# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# Ornato::Logger — Logger central do plugin
#
# Substitui os `puts`/`warn` espalhados pelo código. API mínima e cirurgica
# pra que a substituição seja quase 1-pra-1.
#
# Uso:
#   Ornato::Logger.info("msg")
#   Ornato::Logger.warn("msg", context: { piece_id: 42 })
#   Ornato::Logger.error("msg")
#
# Persistência:
#   - Dentro do SketchUp: arquivo em `Sketchup.temp_dir + 'ornato.log'`
#     com rotação simples a 1MB (`ornato.log.1`).
#   - Fora (testes/CLI): STDOUT.
# ═══════════════════════════════════════════════════════════════════════

module Ornato
  module Logger
    LEVELS    = %i[debug info warn error fatal].freeze
    MAX_BYTES = 1 * 1024 * 1024 # 1 MB

    @level    = :info
    @log_path = nil
    @mutex    = Mutex.new

    class << self
      attr_accessor :level

      def debug(msg, context: nil); log(:debug, msg, context); end
      def info(msg, context: nil);  log(:info,  msg, context); end
      def warn(msg, context: nil);  log(:warn,  msg, context); end
      def error(msg, context: nil); log(:error, msg, context); end
      def fatal(msg, context: nil); log(:fatal, msg, context); end

      def log_path
        @log_path ||= begin
          if defined?(Sketchup) && Sketchup.respond_to?(:temp_dir)
            File.join(Sketchup.temp_dir, 'ornato.log')
          else
            nil
          end
        end
      end

      private

      def log(level, msg, context)
        return if LEVELS.index(level) < LEVELS.index(@level)
        line = format_line(level, msg, context)
        @mutex.synchronize { write(line) }
      end

      def format_line(level, msg, context)
        ts  = Time.now.strftime('%Y-%m-%d %H:%M:%S')
        ctx = context && !context.empty? ? " #{context.inspect}" : ''
        "[#{ts}] [#{level.to_s.upcase}] #{msg}#{ctx}"
      end

      def write(line)
        path = log_path
        if path
          rotate_if_needed!(path)
          File.open(path, 'a') { |f| f.puts(line) }
        else
          io = (line.include?('[ERROR]') || line.include?('[FATAL]') || line.include?('[WARN]')) ? $stderr : $stdout
          io.puts(line)
        end
      rescue => e
        $stderr.puts("Ornato::Logger fallback: #{e.message} | #{line}")
      end

      def rotate_if_needed!(path)
        return unless File.exist?(path) && File.size(path) > MAX_BYTES
        rotated = "#{path}.1"
        File.delete(rotated) if File.exist?(rotated)
        File.rename(path, rotated)
      rescue
        # se rotação falhar, segue (logger não pode quebrar o app)
      end
    end
  end
end
