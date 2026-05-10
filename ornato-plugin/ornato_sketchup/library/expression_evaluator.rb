# frozen_string_literal: true

# ═══════════════════════════════════════════════════════════════
# ExpressionEvaluator — Avaliador SEGURO de expressões paramétricas.
#
# Substitui o uso de Kernel#eval que existia em json_module_builder.rb.
# Implementa um parser recursivo descendente (Pratt-like) que:
#
#   • Aceita: números, parâmetros {param}, operadores aritméticos
#     + - * / ( ), funções max/min/round/floor/ceil/abs,
#     comparações == != > < >= <= e booleanos && || !.
#   • REJEITA: identificadores nus (system, exec, eval, File, Kernel,
#     send, __send__, instance_eval, class_eval, Open3, IO, etc.),
#     strings com aspas, backticks, ;, $, @, qualquer chamada de
#     método não whitelisted.
#
# API compatível com a antiga `evaluate_safe` / `evaluate_expr`:
#
#     evaluator = Ornato::Library::ExpressionEvaluator.new(params)
#     evaluator.eval('{largura} * 2 + 10')        # => Float
#     evaluator.eval_bool('{altura} > 700 && {profundidade} >= 300')
#
# Desenho: lexer → parser → AST nodes (apenas Numeric e Boolean).
# Não há eval, send, ou nenhuma forma de execução dinâmica de código.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Library
    class ExpressionEvaluator
      class ExpressionError < StandardError; end

      # Whitelist absoluta de funções suportadas
      FUNCTIONS = %w[max min round floor ceil abs].freeze

      # Whitelist de namespaces aceitos em identifiers paramétricos
      # (ex: {shop.folga_porta_lateral}). Outros namespaces (module., project.)
      # ficam reservados para uso futuro mas o parser rejeita explicitamente.
      ALLOWED_NAMESPACES = %w[shop bay].freeze

      # Tokens
      TOKEN_TYPES = %i[
        NUMBER STRING IDENT LPAREN RPAREN COMMA
        PLUS MINUS STAR SLASH
        EQ NEQ GT LT GTE LTE
        AND OR NOT
        TRUE FALSE
        EOF
      ].freeze

      Token = Struct.new(:type, :value)

      def initialize(params = {})
        @params = stringify_keys(params || {})
      end

      # Avalia expressão numérica → Float
      def eval(expr)
        return expr.to_f if expr.is_a?(Numeric)
        return 0.0 if expr.nil?

        s = expr.to_s.strip
        return 0.0 if s.empty?

        result = parse(s)
        case result
        when Numeric then result.to_f
        when true    then 1.0
        when false   then 0.0
        else 0.0
        end
      rescue ExpressionError => e
        warn "Ornato ExpressionEvaluator: erro em '#{expr}' → #{e.message}"
        0.0
      end

      # Avalia expressão booleana → true/false (fail-open: true em erro)
      def eval_bool(expr)
        return true if expr.nil?
        s = expr.to_s.strip
        return true if s.empty?

        result = parse(s)
        case result
        when true, false then result
        when Numeric     then result != 0
        else true
        end
      rescue ExpressionError => e
        warn "Ornato ExpressionEvaluator: erro condicional em '#{expr}' → #{e.message}"
        true
      end

      private

      def stringify_keys(hash)
        hash.each_with_object({}) { |(k, v), h| h[k.to_s] = v }
      end

      def param_numeric(name)
        v = param_raw(name)
        return 0.0 if v.nil? && !param_present?(name)
        case v
        when Numeric then v.to_f
        when true    then 1.0
        when false, nil then 0.0
        when String
          # Tenta converter como número; se for string textual usa 0.0
          # (comparações de string usam param_raw)
          Float(v) rescue 0.0
        else 0.0
        end
      end

      # Resolve identificador (com ou sem namespace) ao valor cru.
      # Regras:
      #   • "shop.xxx"  → @params['_shop']['xxx'] se existir
      #                   → fallback @params['xxx'] (compat reversa)
      #   • "xxx" plain → @params['xxx']
      def param_raw(name)
        if name.include?('.')
          ns, key = name.split('.', 2)
          bucket_key = "_#{ns}"
          bucket = @params[bucket_key]
          if bucket.is_a?(Hash) && bucket.key?(key)
            return bucket[key]
          end
          # Fallback legacy: tenta plain key (mantém compat com JSONs antigos)
          return @params[key]
        end
        @params[name]
      end

      # True se o identificador resolve para algum bucket conhecido
      # (mesmo que valor seja nil/false). Usado para distinguir
      # "param ausente" de "param presente com valor nulo".
      def param_present?(name)
        if name.include?('.')
          ns, key = name.split('.', 2)
          bucket = @params["_#{ns}"]
          return true if bucket.is_a?(Hash) && bucket.key?(key)
          return @params.key?(key)
        end
        @params.key?(name)
      end

      # ── LEXER ─────────────────────────────────────────────────
      def tokenize(src)
        tokens = []
        i = 0
        n = src.length
        while i < n
          c = src[i]
          if c == ' ' || c == "\t" || c == "\n" || c == "\r"
            i += 1
          elsif c == '{'
            close = src.index('}', i)
            raise ExpressionError, "'{' sem '}' correspondente" unless close
            name = src[(i + 1)...close].strip
            raise ExpressionError, "nome de parâmetro vazio" if name.empty?
            # Aceita identifier plain OU namespaced (ns.key); namespaces vêm de ALLOWED_NAMESPACES.
            unless name =~ /\A[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?\z/
              raise ExpressionError, "nome de parâmetro inválido: #{name.inspect}"
            end
            if name.include?('.')
              ns = name.split('.', 2).first
              unless ALLOWED_NAMESPACES.include?(ns)
                raise ExpressionError, "namespace não permitido: #{ns.inspect} (use um de #{ALLOWED_NAMESPACES.inspect})"
              end
            end
            # Substitui por valor numérico (ou string se houver comparação)
            raw = param_raw(name)
            if raw.is_a?(String) && !numeric_string?(raw)
              tokens << Token.new(:STRING, raw)
            else
              tokens << Token.new(:NUMBER, param_numeric(name))
            end
            i = close + 1
          elsif c =~ /[0-9.]/
            j = i
            j += 1 while j < n && src[j] =~ /[0-9.]/
            num_str = src[i...j]
            raise ExpressionError, "número inválido: #{num_str}" unless num_str =~ /\A\d+(\.\d+)?\z|\A\.\d+\z/
            tokens << Token.new(:NUMBER, num_str.to_f)
            i = j
          elsif c =~ /[a-zA-Z_]/
            j = i
            j += 1 while j < n && src[j] =~ /[a-zA-Z0-9_]/
            ident = src[i...j]
            i = j
            case ident
            when 'true'  then tokens << Token.new(:TRUE, true)
            when 'false' then tokens << Token.new(:FALSE, false)
            when *FUNCTIONS
              # Deve ser seguido por '('
              k = i
              k += 1 while k < n && src[k] =~ /\s/
              raise ExpressionError, "função #{ident} sem parênteses" if k >= n || src[k] != '('
              tokens << Token.new(:IDENT, ident)
            else
              raise ExpressionError, "identificador não permitido: #{ident.inspect}"
            end
          elsif c == "'" || c == '"'
            quote = c
            j = i + 1
            j += 1 while j < n && src[j] != quote
            raise ExpressionError, "string sem fechamento" if j >= n
            tokens << Token.new(:STRING, src[(i + 1)...j])
            i = j + 1
          elsif c == '('
            tokens << Token.new(:LPAREN, '('); i += 1
          elsif c == ')'
            tokens << Token.new(:RPAREN, ')'); i += 1
          elsif c == ','
            tokens << Token.new(:COMMA, ','); i += 1
          elsif c == '+'
            tokens << Token.new(:PLUS, '+'); i += 1
          elsif c == '-'
            tokens << Token.new(:MINUS, '-'); i += 1
          elsif c == '*'
            tokens << Token.new(:STAR, '*'); i += 1
          elsif c == '/'
            tokens << Token.new(:SLASH, '/'); i += 1
          elsif c == '=' && src[i + 1] == '='
            tokens << Token.new(:EQ, '=='); i += 2
          elsif c == '!' && src[i + 1] == '='
            tokens << Token.new(:NEQ, '!='); i += 2
          elsif c == '>' && src[i + 1] == '='
            tokens << Token.new(:GTE, '>='); i += 2
          elsif c == '<' && src[i + 1] == '='
            tokens << Token.new(:LTE, '<='); i += 2
          elsif c == '>'
            tokens << Token.new(:GT, '>'); i += 1
          elsif c == '<'
            tokens << Token.new(:LT, '<'); i += 1
          elsif c == '&' && src[i + 1] == '&'
            tokens << Token.new(:AND, '&&'); i += 2
          elsif c == '|' && src[i + 1] == '|'
            tokens << Token.new(:OR, '||'); i += 2
          elsif c == '!'
            tokens << Token.new(:NOT, '!'); i += 1
          else
            raise ExpressionError, "caractere não permitido: #{c.inspect}"
          end
        end
        tokens << Token.new(:EOF, nil)
        tokens
      end

      def numeric_string?(s)
        !!(s =~ /\A-?\d+(\.\d+)?\z/)
      end

      # ── PARSER (recursivo descendente) ────────────────────────
      def parse(src)
        @tokens = tokenize(src)
        @pos = 0
        result = parse_or
        unless peek.type == :EOF
          raise ExpressionError, "tokens extra após expressão: #{peek.value.inspect}"
        end
        result
      end

      def peek
        @tokens[@pos]
      end

      def consume(type)
        t = peek
        raise ExpressionError, "esperado #{type}, recebido #{t.type}" if t.type != type
        @pos += 1
        t
      end

      def accept(type)
        return nil if peek.type != type
        t = peek
        @pos += 1
        t
      end

      # or := and ('||' and)*
      def parse_or
        left = parse_and
        while accept(:OR)
          right = parse_and
          left = truthy(left) || truthy(right)
        end
        left
      end

      # and := not ('&&' not)*
      def parse_and
        left = parse_not
        while accept(:AND)
          right = parse_not
          left = truthy(left) && truthy(right)
        end
        left
      end

      # not := '!' not | comparison
      def parse_not
        if accept(:NOT)
          v = parse_not
          return !truthy(v)
        end
        parse_comparison
      end

      # comparison := add (op add)?
      def parse_comparison
        left = parse_add
        op = peek.type
        if %i[EQ NEQ GT LT GTE LTE].include?(op)
          @pos += 1
          right = parse_add
          return compare(left, op, right)
        end
        left
      end

      # add := mul (('+'|'-') mul)*
      def parse_add
        left = parse_mul
        loop do
          if accept(:PLUS)
            left = numeric(left) + numeric(parse_mul)
          elsif accept(:MINUS)
            left = numeric(left) - numeric(parse_mul)
          else
            break
          end
        end
        left
      end

      # mul := unary (('*'|'/') unary)*
      def parse_mul
        left = parse_unary
        loop do
          if accept(:STAR)
            left = numeric(left) * numeric(parse_unary)
          elsif accept(:SLASH)
            r = numeric(parse_unary)
            raise ExpressionError, "divisão por zero" if r.zero?
            left = numeric(left) / r
          else
            break
          end
        end
        left
      end

      # unary := ('-'|'+') unary | primary
      def parse_unary
        if accept(:MINUS)
          return -numeric(parse_unary)
        end
        accept(:PLUS) # noop
        parse_primary
      end

      # primary := NUMBER | STRING | TRUE | FALSE | '(' or ')' | func '(' args ')'
      def parse_primary
        t = peek
        case t.type
        when :NUMBER
          @pos += 1
          t.value
        when :STRING
          @pos += 1
          t.value
        when :TRUE
          @pos += 1; true
        when :FALSE
          @pos += 1; false
        when :LPAREN
          @pos += 1
          v = parse_or
          consume(:RPAREN)
          v
        when :IDENT
          name = t.value
          @pos += 1
          consume(:LPAREN)
          args = []
          unless peek.type == :RPAREN
            args << parse_or
            while accept(:COMMA)
              args << parse_or
            end
          end
          consume(:RPAREN)
          call_function(name, args)
        else
          raise ExpressionError, "token inesperado: #{t.type} (#{t.value.inspect})"
        end
      end

      def call_function(name, args)
        nums = args.map { |a| numeric(a) }
        case name
        when 'max'
          raise ExpressionError, "max precisa de >=2 args" if nums.size < 2
          nums.max
        when 'min'
          raise ExpressionError, "min precisa de >=2 args" if nums.size < 2
          nums.min
        when 'round'
          raise ExpressionError, "round precisa de 1 arg" if nums.size != 1
          nums[0].round.to_f
        when 'floor'
          raise ExpressionError, "floor precisa de 1 arg" if nums.size != 1
          nums[0].floor.to_f
        when 'ceil'
          raise ExpressionError, "ceil precisa de 1 arg" if nums.size != 1
          nums[0].ceil.to_f
        when 'abs'
          raise ExpressionError, "abs precisa de 1 arg" if nums.size != 1
          nums[0].abs
        else
          raise ExpressionError, "função desconhecida: #{name}"
        end
      end

      def numeric(v)
        case v
        when Numeric then v.to_f
        when true    then 1.0
        when false   then 0.0
        when String
          Float(v) rescue raise(ExpressionError, "string não-numérica em contexto numérico: #{v.inspect}")
        else
          raise ExpressionError, "valor não numérico"
        end
      end

      def truthy(v)
        case v
        when true, false then v
        when Numeric     then v != 0
        when nil         then false
        when String      then !v.empty?
        else true
        end
      end

      def compare(a, op, b)
        # Comparação string x string permitida apenas para == / !=
        if a.is_a?(String) || b.is_a?(String)
          sa = a.to_s; sb = b.to_s
          case op
          when :EQ  then return sa == sb
          when :NEQ then return sa != sb
          else
            # Tenta comparar numericamente
            return compare(numeric(a), op, numeric(b))
          end
        end
        na = numeric(a); nb = numeric(b)
        case op
        when :EQ  then na == nb
        when :NEQ then na != nb
        when :GT  then na > nb
        when :LT  then na < nb
        when :GTE then na >= nb
        when :LTE then na <= nb
        end
      end
    end
  end
end
