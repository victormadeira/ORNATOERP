# Proposta de Patch — JsonModuleBuilder com componentes 3D

## 1. Análise da arquitetura atual

`JsonModuleBuilder` (982 linhas) é uma classe + dois entrypoints de classe (`create_from_json`, `rebuild`, `repaint`).

Fluxo atual de `create_from_json` (linhas 623-679):

1. `model.start_operation` → cria `group` raiz.
2. `PieceStamper.stamp_module(group, ...)` carimba como `tipo=modulo`.
3. `builder = new(json_def, str_params)` → `builder.build(group)` itera `json_def['pecas']`, expande, condiciona e chama `build_piece` (linhas 240-324). Cada peça vira um sub-grupo via `ParametricEngine.create_piece` e é carimbada por `PieceStamper.stamp` (`tipo=peca`).
4. Bloco `ferragens_auto` (linhas 663-668 e 962-967): hoje **apenas serializa o array em `Ornato.ferragens_auto`** no grupo-módulo. A interpretação real (regras `minifix`, `cavilha`, `dobradica`, `puxador`, `rebaixo_fundo`, `system32`) é deferida ao `MachiningInterpreter` em runtime de usinagem — nada é instanciado em geometria.

Ou seja, o ponto de extensão correto é exatamente esse bloco: ao invés de só serializar, varremos o array e, para entradas com `componente_3d`, criamos `Sketchup::ComponentInstance` filhas do grupo-módulo. Entradas legacy (sem `componente_3d`) continuam apenas serializadas para o `MachiningInterpreter`. Retro-compat garantida por *opt-in*.

`PieceStamper` define `tipo='ferragem'` como categoria já reservada (linha 20 do `piece_stamper.rb`), então só precisamos chamar `set_attribute('Ornato', 'tipo', 'ferragem')` — não exigimos novo método público.

A peça âncora (`anchor_role`) já existe no grupo no momento em que `ferragens_auto` é processado (loop `pecas` roda antes). Basta varrer `parent_group.entities` filtrando por `Ornato.role == anchor_role`.

## 2. Diff proposto (unified)

```diff
--- a/ornato_sketchup/library/json_module_builder.rb
+++ b/ornato_sketchup/library/json_module_builder.rb
@@ -93,6 +93,7 @@ module Ornato
       def build(parent_group)
         pieces = []
         (@def['pecas'] || []).each do |peca_def|
           expand_piece_def(peca_def).each do |expanded_def|
             next unless condition_met?(expanded_def['condicao'])
             piece = build_piece(parent_group, expanded_def)
             pieces << piece if piece
           end
         end
+        process_ferragens_3d(parent_group)
         pieces
       end
@@ -117,6 +118,113 @@ module Ornato
       # ─────────────────────────────────────────────────────────
       private
       # ─────────────────────────────────────────────────────────
+
+      # Itera ferragens_auto e, para cada entrada com componente_3d,
+      # instancia o .skp resolvendo posição via anchor_role.
+      # Entradas SEM componente_3d são ignoradas aqui (legacy: ficam
+      # apenas no atributo Ornato.ferragens_auto para o MachiningInterpreter).
+      def process_ferragens_3d(parent_group)
+        list = @def['ferragens_auto']
+        return unless list.is_a?(Array)
+        list.each do |entry|
+          next unless entry.is_a?(Hash) && entry['componente_3d']
+          next unless condition_met?(entry['condicao'])
+          process_componente_3d(entry, parent_group)
+        end
+      rescue => e
+        warn "Ornato ferragens 3D ERRO: #{e.message}"
+      end
+
+      # Processa UMA entrada ferragens_auto com componente_3d.
+      def process_componente_3d(entry, parent_group)
+        rel_path = entry['componente_3d'].to_s
+        abs_path = resolve_componente_path(rel_path)
+        return warn("Ferragem nao encontrada: #{rel_path}") unless abs_path && File.exist?(abs_path)
+
+        anchor_role = (entry['anchor_role'] || entry['peca']).to_s
+        anchor_pieces = resolve_anchor_geometry(parent_group, anchor_role)
+        return if anchor_pieces.empty?
+
+        qtd          = evaluate_expr(entry['qtd'] || 1).to_i
+        qtd          = 1 if qtd < 1
+        offset_top   = evaluate_expr(entry['offset_top']    || 100).to_f
+        offset_bot   = evaluate_expr(entry['offset_bottom'] || 100).to_f
+        spacing_max  = evaluate_expr(entry['spacing_max']   || 600).to_f
+        depth_face   = evaluate_expr(entry['depth_from_face'] || 0).to_f
+
+        definition = instance_3d_component_definition(abs_path)
+        return unless definition
+
+        anchor_pieces.each do |anchor|
+          bb = anchor.bounds
+          z_positions = calculate_distribution(
+            (bb.depth.to_f).to_l.to_mm, qtd, offset_top, offset_bot, spacing_max
+          )
+          z_positions.each do |z_mm|
+            tx = build_anchor_transform(anchor, z_mm, depth_face, entry)
+            instance_3d_component(parent_group, definition, tx,
+              regra: entry['regra'], rel_path: rel_path, anchor: anchor_role)
+          end
+        end
+      end
+
+      # Carrega/recupera ComponentDefinition do .skp.
+      def instance_3d_component_definition(abs_path)
+        defs = Sketchup.active_model.definitions
+        existing = defs.find { |d| d.path.to_s == abs_path }
+        existing || defs.load(abs_path)
+      rescue => e
+        warn "load skp falhou (#{abs_path}): #{e.message}"
+        nil
+      end
+
+      # Insere instância e carimba como ferragem.
+      def instance_3d_component(parent_group, definition, transformation, regra:, rel_path:, anchor:)
+        inst = parent_group.entities.add_instance(definition, transformation)
+        inst.set_attribute('Ornato', 'tipo',          'ferragem')
+        inst.set_attribute('Ornato', 'regra',         regra.to_s)
+        inst.set_attribute('Ornato', 'componente_3d', rel_path)
+        inst.set_attribute('Ornato', 'anchor_role',   anchor.to_s)
+        inst
+      end
+
+      # Devolve as peças (Groups carimbados) cujo role bate com anchor_role.
+      def resolve_anchor_geometry(parent_group, anchor_role)
+        parent_group.entities.select do |ent|
+          PieceStamper.piece?(ent) &&
+            ent.get_attribute('Ornato', 'role').to_s == anchor_role.to_s
+        end
+      end
+
+      # Distribui qtd posições Z ao longo de anchor_height (mm), respeitando
+      # offsets e spacing_max. Retorna array de Z em mm, do menor ao maior.
+      def calculate_distribution(anchor_height, qtd, offset_top, offset_bottom, spacing_max)
+        usable = anchor_height - offset_top - offset_bottom
+        return [] if usable <= 0 || qtd < 1
+        return [offset_bottom + usable / 2.0] if qtd == 1
+        # se spacing_max apertado obriga mais pontos, ignoramos (qtd manda)
+        step = usable / (qtd - 1).to_f
+        step = [step, spacing_max].min if spacing_max > 0
+        (0...qtd).map { |i| offset_bottom + i * step }
+      end
+
+      # Resolve path do componente_3d relativo a biblioteca/modelos/.
+      def resolve_componente_path(rel)
+        root = File.expand_path('../../biblioteca/modelos', __dir__)
+        File.join(root, rel)
+      end
+
+      # Constrói Transformation: origem na peça âncora, Z no ponto distribuído,
+      # offset perpendicular à face frontal pelo depth_from_face.
+      def build_anchor_transform(anchor, z_mm, depth_face_mm, entry)
+        bb = anchor.bounds
+        origin = Geom::Point3d.new(bb.min.x, bb.min.y + depth_face_mm.mm, bb.min.z + z_mm.mm)
+        Geom::Transformation.new(origin)
+      end
+
+      # ─────────────────────────────────────────────────────────
       PARAM_ALIASES = {
```

### Explicação resumida

| Bloco | Propósito |
|------|-----------|
| `process_ferragens_3d` | Hook chamado no fim de `build`. Filtra apenas entradas com `componente_3d` → não toca em legacy. |
| `process_componente_3d` | Resolve path, âncora, distribui Z, instancia. |
| `instance_3d_component_definition` | Cacheia o `.skp` em `model.definitions` (evita reload duplicado se a regra disparar várias instâncias). |
| `instance_3d_component` | Cria a `ComponentInstance` e carimba com `tipo=ferragem` (categoria já reservada no PieceStamper). |
| `resolve_anchor_geometry` | Lê os atributos `Ornato.role` das peças já criadas no `parent_group`. Aproveita o stamping existente. |
| `calculate_distribution` | Algoritmo simples: 1 ponto = centro; >1 = distribuição uniforme entre `offset_bottom` e `anchor_height − offset_top`, com clamp por `spacing_max`. |
| `build_anchor_transform` | Posiciona pelo bounds da âncora e empurra `depth_from_face` mm para dentro da face frontal. |

## 3. Riscos de retrocompatibilidade

- **Entradas legacy** (`{regra:'minifix', juncao:'lateral × base'}`, `{regra:'dobradica', peca:'lateral'}` sem `componente_3d`) são **explicitamente puladas** em `process_ferragens_3d` (`next unless entry['componente_3d']`). Continuam armazenadas em `Ornato.ferragens_auto` exatamente como hoje.
- O atributo `Ornato.tipo='ferragem'` já era reservado no contrato do `PieceStamper` — listas de corte e exportação JSON/CSV ignoram, conforme docstring (linhas 20-22).
- `definitions.load` é idempotente quando feito via cache no `definitions.find` (linha do helper), evita inflar o `.skp` em rebuild repetido.
- `rebuild` (linha 927) apaga `entities.to_a` antes de reconstruir → ferragens 3D são apagadas e recriadas junto com as peças, comportamento desejado.
- `repaint` (linha 695) só itera `PieceStamper.piece?(ent)` → instâncias `tipo=ferragem` passam batidas, sem efeitos colaterais.
- Falha de I/O no `.skp` cai no `rescue` do `process_ferragens_3d` → log e segue sem abortar a operação.

## 4. Checklist de testes manuais (SketchUp)

- [ ] Inserir `balcao_2_portas` SEM modificar JSON → continua igual (sanity legacy).
- [ ] Adicionar entry `{regra:'dobradica', anchor_role:'lateral', componente_3d:'ferragens/dobradica_amor_cj.skp', qtd:'2'}` → 2 instâncias por lateral, total 4.
- [ ] Mudar `qtd` para `3` → 6 instâncias, espaçamento uniforme.
- [ ] Forçar `componente_3d` inválido → módulo cria peças normais + log de warning, não crasha.
- [ ] `JsonModuleBuilder.rebuild` após mudar `altura` → ferragens recriadas no novo Z proporcional.
- [ ] `JsonModuleBuilder.repaint` mudando material → ferragens permanecem intactas.
- [ ] Inspecionar instância no Ruby Console: `e.get_attribute('Ornato','tipo') == 'ferragem'`, `regra`, `componente_3d`, `anchor_role` presentes.
- [ ] Confirmar exclusão da lista de corte: lista exporta apenas `tipo=peca`.
- [ ] Conferir bounding box do componente após `add_instance` (origem = canto inferior-frente da lateral + `depth_from_face`).

## Apêndice — mapeamento padrão `regra → componente_3d`

Listagem real de `biblioteca/modelos/ferragens/` e `biblioteca/modelos/puxadores/` consultada na elaboração desta proposta. Defaults sugeridos (substituíveis por entrada explícita no JSON):

| regra | componente_3d default | observação |
|-------|------------------------|------------|
| `dobradica` | `ferragens/dobradica_amor_cj.skp` | dobradiça reta com amortecedor — caso mais comum |
| `dobradica_curva` | `ferragens/dobradica_curva_amor_cj.skp` | porta sobreposta lateral |
| `dobradica_165` | `ferragens/dobradica_amor_165_cj.skp` | porta de canto |
| `dobradica_porta_espessa` | `ferragens/dobradica_porta_espessa_amor_cj.skp` | portas ≥ 22 mm |
| `corredica` | `ferragens/corredica_telescopica_com_amortecedor.skp` | gaveta padrão |
| `corredica_oculta` | `ferragens/corredica_oculta_slowmotion.skp` | gaveta premium |
| `cantoneira` | `ferragens/cantoneira_13_x_13_2f_cj.skp` | reforço caixa |
| `minifix` | `ferragens/minifix_e_cavilha_cj.skp` | junção lateral×base/topo |
| `cavilha` | `ferragens/cavilha_cj.skp` | junção pura |
| `rafix` | `ferragens/rafix_cj.skp` | junção desmontável |
| `parafuso` | `ferragens/parafuso_4x40_cj.skp` | fixação genérica |
| `pino_prateleira` | `ferragens/suporte_pino_metalico_cj.skp` | suporte regulável |
| `puxador` | `puxadores/puxador_galla_128mm.skp` | default catálogo Galla 128 |
| `puxador_concha` | `puxadores/puxador_concha_horizontal.skp` | gaveta sem ferragem |
| `puxador_gola` | `puxadores/puxador_gola_com_ponteira.skp` | perfil contínuo |
| `puxador_cabo` | `puxadores/puxador_zen_sorento.skp` | barra Zen |
| `furação_puxador` | `puxadores/furacao_horizontal_puxador_generico.skp` | usinagem-only |
| `sem_puxador` | `puxadores/sem_puxador.skp` | porta lisa, abertura tip-on |

A escolha de variantes (`128mm`, `192mm`, `_canto_l`, `_155`, `slowmotion`, etc.) deve vir do JSON do módulo via `componente_3d` explícito — o default da tabela é só o *fallback* quando a entrada `ferragens_auto` declara apenas `regra`.
