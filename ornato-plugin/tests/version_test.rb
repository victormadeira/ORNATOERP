# frozen_string_literal: true
# tests/version_test.rb — cobertura do parser de version.txt
require_relative 'test_helper'
require 'tmpdir'
require 'fileutils'

require_relative '../ornato_sketchup/core/version'

class VersionTest < OrnatoTest::Case
  def with_version_file(content)
    Dir.mktmpdir do |dir|
      path = File.join(dir, 'version.txt')
      File.write(path, content) unless content.nil?
      original = Ornato::Version.version_file
      begin
        Ornato::Version.version_file = path
        yield
      ensure
        Ornato::Version.version_file = original
        Ornato::Version.reset!
      end
    end
  end

  def with_missing_file
    Dir.mktmpdir do |dir|
      path = File.join(dir, 'nope.txt')
      original = Ornato::Version.version_file
      begin
        Ornato::Version.version_file = path
        yield
      ensure
        Ornato::Version.version_file = original
        Ornato::Version.reset!
      end
    end
  end

  test 'parses complete version.txt' do
    content = "0.4.2\nsha:abc123\nchannel:beta\nbuilt:2026-05-10T10:30:00Z\n"
    with_version_file(content) do
      v = Ornato::Version.current
      assert_equal '0.4.2', v[:version]
      assert_equal 'abc123', v[:sha]
      assert_equal 'beta',   v[:channel]
      assert_equal '2026-05-10T10:30:00Z', v[:built]
      assert_equal '0.4.2+abc123', Ornato::Version.full
      assert_equal 'beta', Ornato::Version.channel
    end
  end

  test 'partial file uses defaults for missing fields' do
    with_version_file("1.2.3\n") do
      v = Ornato::Version.current
      assert_equal '1.2.3', v[:version]
      assert_equal 'unknown', v[:sha]
      assert_equal 'dev', v[:channel]
      assert v[:built].nil?, 'built deve ser nil quando ausente'
    end
  end

  test 'missing file falls back to defaults' do
    with_missing_file do
      v = Ornato::Version.current
      assert_equal '0.0.0-dev', v[:version]
      assert_equal 'unknown',   v[:sha]
      assert_equal 'dev',       v[:channel]
    end
  end

  test 'empty file falls back to defaults' do
    with_version_file('') do
      v = Ornato::Version.current
      assert_equal '0.0.0-dev', v[:version]
      assert_equal 'unknown', v[:sha]
    end
  end

  test 'extra whitespace and unknown keys are tolerated' do
    content = "  2.0.0  \n  sha: deadbee \n  channel: stable \n  garbage: ignored \n"
    with_version_file(content) do
      v = Ornato::Version.current
      assert_equal '2.0.0',  v[:version]
      assert_equal 'deadbee', v[:sha]
      assert_equal 'stable', v[:channel]
    end
  end

  test 'PLUGIN_VERSION constant stays in sync after reload' do
    with_version_file("9.9.9\nsha:zzz\n") do
      assert_equal '9.9.9', Ornato::Version.current[:version]
      # Re-aplica retrocompat (simula re-load do version.rb)
      load File.expand_path('../ornato_sketchup/core/version.rb', __dir__)
      assert_equal '9.9.9', Ornato::PLUGIN_VERSION
    end
  end
end
