# Ornato Plugin — Guia de Desenvolvimento

## Setup (uma única vez)

### 1. Symlink para o SketchUp
O plugin já está linkado via symlink — editar qualquer arquivo aqui
reflete imediatamente no SketchUp. Não precisa empacotar .rbz.

Para recriar os symlinks (se necessário):
```bash
REPO="$HOME/SISTEMA NOVO/ornato-plugin"
PLUGINS_2024="$HOME/Library/Application Support/SketchUp 2024/SketchUp/Plugins"
PLUGINS_2026="$HOME/Library/Application Support/SketchUp 2026/SketchUp/Plugins"

ln -sf "$REPO/ornato_loader.rb"  "$PLUGINS_2024/ornato_sketchup.rb"
ln -sf "$REPO/ornato_sketchup"   "$PLUGINS_2024/ornato_sketchup"
ln -sf "$REPO/ornato_loader.rb"  "$PLUGINS_2026/ornato_sketchup.rb"
ln -sf "$REPO/ornato_sketchup"   "$PLUGINS_2026/ornato_sketchup"
```

### 2. Extensão VSCode recomendada
- **SketchUp Ruby API Autocomplete** — snippets e autocomplete da API do SketchUp
- **Ruby** (by Shopify / castwide) — syntax highlighting, linting
- Instalar: `code --install-extension castwide.solargraph`

## Workflow diário

### Opção A — Watch Mode (recomendado)
Ative uma vez no Ruby Console do SketchUp no início do dia:
```ruby
Ornato::DevLoader.watch!(interval: 2)
```
Agora toda vez que salvar um `.rb` no VSCode, o SketchUp recarrega
automaticamente em ~2 segundos. Para parar:
```ruby
Ornato::DevLoader.stop_watch!
```

### Opção B — Reload manual rápido
Atalho de menu: **Plugins → Ornato CNC → [Dev] Recarregar Plugin**
Ou no Ruby Console:
```ruby
Ornato::DevLoader.reload!
```

### Opção C — Reload de um arquivo só
Quando alterar só um arquivo (mais rápido):
```ruby
Ornato::DevLoader.reload_file('tools/placement_tool.rb')
```

## Dicas por tipo de arquivo

| Arquivo editado | Como testar |
|---|---|
| `.rb` (lógica Ruby) | Watch mode recarrega sozinho |
| `.html` (UI panel) | Fechar e reabrir o dialog |
| `.html` (CSS/JS) | Abrir o HTML no Chrome primeiro para testar visual, depois no SketchUp |

## Testando no Ruby Console

O Ruby Console do SketchUp (Window → Ruby Console) é seu REPL:

```ruby
# Ver todos os módulos Ornato no modelo atual
Sketchup.active_model.active_entities.select { |e|
  e.get_attribute('Ornato', 'module_type')
}.map(&:name)

# Criar um módulo manualmente (sem usar a UI)
Ornato::Library::ParametricEngine.create_module(
  'armario_base',
  { largura: 600, altura: 720, profundidade: 550, material: 'MDF18_BrancoTX', espessura: 18 }
)

# Rodar o resolver de adjacências
Ornato::Tools::NeighborResolver.resolve_all

# Ver adjacências de um grupo selecionado
sel = Sketchup.active_model.selection.first
JSON.parse(sel.get_attribute('Ornato', 'adjacencies', '[]'))

# Abrir o novo painel design
Ornato::Main.show_main_panel

# Testar o CollisionManager
cm = Ornato::Tools::CollisionManager.new
puts "#{cm.count} módulos no índice"
```

## Testando HTML no Chrome (para UI panels)

Abra o HTML diretamente para testar CSS e JS:
```
/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/main_panel.html
```
As chamadas `sketchup.method()` vão falhar (sem SketchUp), mas tudo
o que é CSS/layout/JS puro funciona. Útil para iterar a UI sem abrir
o SketchUp toda hora.

## Criando o .rbz para distribuição (só quando for publicar)

```bash
cd /Users/madeira/SISTEMA\ NOVO/ornato-plugin
./build.sh
# Gera ornato_sketchup.rbz pronto para instalar
```
