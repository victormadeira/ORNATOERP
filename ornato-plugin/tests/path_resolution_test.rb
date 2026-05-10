# frozen_string_literal: true
# Standalone test for resolve_componente_path (path traversal hardening).
# Reimplementa a lógica em isolamento — o método real está em
# JsonModuleBuilder, que requer SketchUp para carregar inteiro.
# Run: ruby tests/path_resolution_test.rb

require 'minitest/autorun'

# Reimplementação literal (mesma lógica que JsonModuleBuilder#resolve_componente_path).
# Mantemos um root falso aqui para isolamento — isso testa o ALGORITMO.
class PathResolver
  def initialize(root)
    @root = File.expand_path(root)
  end

  def resolve(rel)
    return nil if rel.nil?
    rel_str = rel.to_s.strip
    return nil if rel_str.empty?

    if rel_str.include?('..') || rel_str.start_with?('/') || rel_str.match?(/\A[A-Za-z]:[\\\/]/)
      return nil
    end

    return nil unless rel_str.downcase.end_with?('.skp')

    candidate = File.expand_path(File.join(@root, rel_str))
    return nil unless candidate.start_with?(@root + File::SEPARATOR) || candidate == @root
    candidate
  end
end

class PathResolutionTest < Minitest::Test
  def setup
    # /tmp não muda comportamento — é um root válido qualquer
    @resolver = PathResolver.new('/tmp/biblioteca/modelos')
  end

  # ── ATAQUES — devem retornar nil ────────────────────────────

  def test_block_dotdot_traversal
    assert_nil @resolver.resolve('../../../../etc/passwd')
  end

  def test_block_dotdot_to_skp
    assert_nil @resolver.resolve('../../wps_source/qualquer.skp')
  end

  def test_block_absolute_unix
    assert_nil @resolver.resolve('/etc/passwd')
  end

  def test_block_absolute_windows
    assert_nil @resolver.resolve('C:\\Windows\\System32\\drivers\\etc\\hosts')
  end

  def test_block_non_skp_extension
    assert_nil @resolver.resolve('arquivo.txt')
  end

  def test_block_no_extension
    assert_nil @resolver.resolve('arquivo')
  end

  def test_block_empty_string
    assert_nil @resolver.resolve('')
  end

  def test_block_nil
    assert_nil @resolver.resolve(nil)
  end

  def test_block_dotdot_in_middle
    assert_nil @resolver.resolve('puxadores/../../../../private.skp')
  end

  # ── CASOS VÁLIDOS ────────────────────────────────────────────

  def test_allow_simple_filename
    result = @resolver.resolve('puxador_basico.skp')
    assert_equal '/tmp/biblioteca/modelos/puxador_basico.skp', result
  end

  def test_allow_subdir
    result = @resolver.resolve('ferragens/dobradica.skp')
    assert_equal '/tmp/biblioteca/modelos/ferragens/dobradica.skp', result
  end

  def test_allow_uppercase_extension
    result = @resolver.resolve('PUXADOR.SKP')
    assert_equal '/tmp/biblioteca/modelos/PUXADOR.SKP', result
  end
end
