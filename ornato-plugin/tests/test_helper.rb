# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════════════
# tests/test_helper.rb — Mini Test::Unit-like API + mocks compartilhados
# ═══════════════════════════════════════════════════════════════════════

PLUGIN_ROOT = File.expand_path('..', __dir__) unless defined?(PLUGIN_ROOT)

module OrnatoTest
  GREEN = "\e[32m"; RED = "\e[31m"; CYAN = "\e[36m"; GRAY = "\e[90m"; RESET = "\e[0m"

  class AssertionError < StandardError; end

  module Assertions
    def assert(cond, msg = 'assertion failed')
      raise AssertionError, msg unless cond
    end

    def assert_equal(expected, actual, msg = nil)
      return if expected == actual
      raise AssertionError, (msg || "expected #{expected.inspect}, got #{actual.inspect}")
    end

    def assert_includes(collection, item, msg = nil)
      return if collection.include?(item)
      raise AssertionError, (msg || "expected #{collection.inspect} to include #{item.inspect}")
    end

    def assert_raises(klass = StandardError, msg = nil)
      yield
      raise AssertionError, (msg || "expected #{klass} to be raised, but nothing was raised")
    rescue AssertionError
      raise
    rescue klass => _e
      :ok
    end

    def refute(cond, msg = 'refutation failed')
      raise AssertionError, msg if cond
    end
  end

  class Case
    include Assertions
    @@all = []
    def self.inherited(sub); @@all << sub; end
    def self.all; @@all; end

    def self.test(name, &blk)
      @tests ||= []
      @tests << [name, blk]
    end

    def self.tests; @tests || []; end

    def run_all
      results = []
      self.class.tests.each do |name, blk|
        begin
          instance_exec(&blk)
          results << [:pass, name, nil]
        rescue AssertionError => e
          results << [:fail, name, e.message]
        rescue => e
          bt = (e.backtrace || []).first(3).join("\n    ")
          results << [:error, name, "#{e.class}: #{e.message}\n    #{bt}"]
        end
      end
      results
    end
  end

  def self.run!
    passes = 0; fails = 0; errors = 0
    Case.all.each do |klass|
      puts "#{CYAN}── #{klass.name} ─#{RESET}"
      klass.new.run_all.each do |status, name, err|
        case status
        when :pass
          passes += 1
          puts "  #{GREEN}✓#{RESET} #{name}"
        when :fail
          fails += 1
          puts "  #{RED}✗ FAIL#{RESET} #{name}"
          puts "    #{GRAY}#{err}#{RESET}"
        when :error
          errors += 1
          puts "  #{RED}✗ ERROR#{RESET} #{name}"
          puts "    #{GRAY}#{err}#{RESET}"
        end
      end
    end
    total = passes + fails + errors
    color = (fails + errors).zero? ? GREEN : RED
    puts ""
    puts "#{color}══ #{passes}/#{total} passes — #{fails} fails — #{errors} errors ══#{RESET}"
    exit((fails + errors).zero? ? 0 : 1)
  end

  # Auto-run when a test file is invoked directly (ruby tests/foo_test.rb)
  def self.autorun_if_main!(invoked_path)
    at_exit do
      run! if File.expand_path(invoked_path) == File.expand_path($PROGRAM_NAME)
    end
  end
end

# ── Mocks compartilhados de SketchUp (stdlib only) ─────────────────────
module SkpMock
  # Geom-like Vector3d duck type
  class Vec
    attr_accessor :x, :y, :z
    def initialize(x, y, z); @x = x.to_f; @y = y.to_f; @z = z.to_f; end
    def length; Math.sqrt(@x**2 + @y**2 + @z**2); end
    def normalize!; l = length; return self if l < 1e-12; @x /= l; @y /= l; @z /= l; self; end
    def clone; self.class.new(@x, @y, @z); end
    def transform(_tx); clone; end
  end

  # Component / Group with Ornato attribute dictionary
  class Entity
    attr_accessor :entityID, :transformation, :definition, :name
    def initialize(attrs: {}, klass: :group, name: 'Entity', id: rand(100000))
      @attrs = { 'Ornato' => attrs }
      @klass = klass
      @name  = name
      @entityID = id
      @transformation = Identity.new
      @definition = nil
    end

    def get_attribute(dict, key, default = nil)
      (@attrs[dict] ||= {}).fetch(key.to_s, default).then { |v| v.nil? ? @attrs[dict][key.to_sym] || default : v }
    end

    def set_attribute(dict, key, value)
      (@attrs[dict] ||= {})[key.to_s] = value
    end

    def is_a?(other)
      return true if other.respond_to?(:name) && other.name.to_s == "Sketchup::#{@klass.to_s.capitalize}"
      super
    end

    def respond_to?(m, *)
      return true if [:entities, :transformation, :definition].include?(m) && @klass != :leaf
      super
    end

    def entities; @children ||= []; end
    def add_child(e); entities << e; e; end
  end

  class Identity
    def inverse; self; end
    def to_a; [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; end
  end
end
