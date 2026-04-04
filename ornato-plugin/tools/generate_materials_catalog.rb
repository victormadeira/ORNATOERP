# frozen_string_literal: true
# encoding: utf-8

require 'json'

materials = []
base = "/Users/madeira/Downloads/Biblioteca WPS/materials/MDF"

Dir.glob(File.join(base, "*")).select { |f| File.directory?(f) }.each do |supplier_dir|
  supplier = File.basename(supplier_dir)
  Dir.glob(File.join(supplier_dir, "*.skm")).each do |skm|
    name = File.basename(skm, ".skm")
    snake = name.encode('UTF-8', invalid: :replace, undef: :replace)
      .unicode_normalize(:nfkd)
      .gsub(/[\u0300-\u036f]/, '')
      .downcase
      .gsub(/[^a-z0-9]/, '_')
      .gsub(/_+/, '_')
      .gsub(/^_|_$/, '')
    materials << {
      id: snake,
      original_name: name,
      supplier: supplier,
      type: 'MDF',
      file_size: File.size(skm),
    }
  end
end

catalog = {
  generated_at: Time.now.strftime('%Y-%m-%dT%H:%M:%S%z'),
  total_materials: materials.length,
  suppliers: materials.map { |m| m[:supplier] }.uniq.sort,
  materials: materials.sort_by { |m| [m[:supplier], m[:id]] },
}

output = File.join(File.dirname(__FILE__), '..', 'biblioteca', 'materiais', 'catalogo_materiais.json')
File.write(output, JSON.pretty_generate(catalog))
puts "Generated catalog: #{materials.length} materials from #{catalog[:suppliers].length} suppliers"
