# VALIDAÇÃO — "Vou conseguir VER a dobradiça na porta?"

Pergunta crítica do usuário decomposta em duas leituras: (A) viewport SketchUp 3D, (B) UI v2 do plugin.

---

## (A) SketchUp viewport — VAI APARECER A DOBRADIÇA 3D?

**Status global: ⚠️ PARCIAL — instancia mas posicionamento é sub-ótimo e há risco de "voar" longe da porta.**

### ✅ O que funciona
- `JsonModuleBuilder#process_componente_3d` (linhas 151–186) carrega o `.skp` da `biblioteca/modelos/` via `Sketchup.active_model.definitions.load(abs_path)` e instancia com `parent_group.entities.add_instance(definition, transformation)` (linha 203). Isso é a API correta — **a dobradiça 3D vai sim aparecer no viewport** como instância filha do grupo do módulo.
- A instância recebe attrs `Ornato/tipo=ferragem`, `regra`, `componente_3d`, `anchor_role`, `preserve_drillings=true` — pipeline CNC preservado.
- `instance_3d_component_definition` (190) tem cache via `defs.find` — não duplica definição em rebuilds.
- `calculate_distribution` distribui N dobradiças ao longo da altura útil respeitando `offset_top`, `offset_bottom`, `spacing_max` — coerente com `HingeRule::DEFAULTS` (100mm topo/base, qtd por altura da porta).

### ⚠️ Bugs e riscos de posicionamento (`build_anchor_transform` linhas 243–251)

1. **TRANSLAÇÃO PURA, SEM ROTAÇÃO.** `Geom::Transformation.new(origin)` aplica só translação. O `.skp` da biblioteca **precisa** já ter sido modelado com a orientação canônica esperada (eixo Y = profundidade da porta, X ao longo da face frontal da lateral, Z = altura). Se algum `.skp` legacy estiver com eixos rotacionados, a dobradiça aparece "deitada" ou "voando". Não há sanity-check.

2. **Origin = `bb.min.x, bb.min.y + depth_face, bb.min.z + z_mm`.** O `bb.min.x` é o canto **esquerdo** da lateral em world coords. Para uma lateral esquerda, isso é a face externa do móvel — **o lado errado**. A dobradiça deveria ancorar na face frontal interna (`bb.min.y` da face que confronta a porta) e em X igual à coordenada **da face interna da lateral** (não `bb.min.x`). Resultado provável: dobradiça aparece deslocada no eixo X, não rente à porta.

3. **`anchor_role: 'lateral'` resolve TODAS as laterais** (`resolve_anchor_geometry` filtra por role string apenas). Em módulo com 2 laterais (esq + dir) e 2 portas, **as N dobradiças vão ser instanciadas em CADA lateral igualmente** — sem associar L→porta-esq e R→porta-dir. Isso pode duplicar visualmente se a regra não for refinada ou pode parecer correto por coincidência se o cliente tem 1 porta.

4. **Comentário enganoso na linha 175:** o comentário diz `bb.depth em SketchUp é o eixo Z`, mas **isso está errado** — `Geom::BoundingBox#depth` em SketchUp retorna a dimensão **Y**, `#height` retorna Z, `#width` retorna X. **O CÓDIGO em si está correto** (usa `bb.max.z - bb.min.z` na linha 176, não `bb.depth`), então não há bug funcional, **mas o comentário induz refactors futuros ao erro.** O Agente B aparentemente sabia da pegadinha e contornou, deixando o comentário confuso.

5. **`depth_from_face` somado em `bb.min.y`** assume que a face frontal da lateral fica em `min.y`. Se o módulo foi gerado com Y crescendo pra trás (convenção variável), a dobradiça vai parar **atrás da lateral**, invisível dentro do volume.

6. **Sem flip/mirror para lateral direita.** Mesmo que a posição estivesse correta, a dobradiça da lateral direita precisa de `Geom::Transformation.scaling(-1,1,1)` (espelhamento X) — caso contrário fica com a copela apontando pro lado errado.

### ❌ TODOs concretos (A)
- [ ] Refatorar `build_anchor_transform` para receber `anchor_side` (`:left|:right`) e usar a face frontal interna correta da lateral (provavelmente `bb.min.y + espessura_porta_offset` e `bb.max.x - espessura_lateral` para lateral esquerda).
- [ ] Adicionar transformação de espelhamento para lateral direita.
- [ ] Pareamento `lateral ↔ porta` via `joint_detector` — instanciar dobradiça apenas na lateral que tem joint do tipo `door_overlay` com a porta correspondente.
- [ ] Sanity-check de orientação do `.skp`: ler attribute `Ornato/canonical_axis` no `.skp` e abortar com warn se ausente.
- [ ] Corrigir comentário linha 175 (`bb.depth → eixo Y`, altura usa `bb.max.z - bb.min.z`).
- [ ] Teste manual: gerar módulo `armario_2_portas` e capturar screenshot do viewport — verificar se as 4 dobradiças (2 por porta) aparecem visivelmente penduradas nas faces internas das laterais.

---

## (B) UI v2 — O PAINEL MOSTRA QUE A PORTA TEM DOBRADIÇA?

**Status global: ❌ NÃO — tab `ferragens.js` é placeholder vazio. Inspector mostra texto hard-coded.**

### Evidências
- `ornato_sketchup/ui/v2/tabs/ferragens.js` tem **6 linhas**: `export const meta = { phase: 'F1.1' }` — sem `render()`. App cai em `renderEmptyTab`.
- `app.js` linha 362 mostra `<span>2 portas com dobradiça</span>` — **string literal hard-coded**, não vem do módulo selecionado.
- `app.js` linhas 367–372: lista "Ferragens · 3 itens" também com `2× Clip Top Blumotion` e `1× Puxador Cava` **hard-coded em template literal**.
- Não existe `add_action_callback` em `dialog_controller.rb` que retorne lista de ferragens de um módulo selecionado para a UI v2 — só há `get_module_machining` (645) que vai para Inspector de usinagens, não ferragens.
- **Não há preview 2D/SVG da porta** com indicação de dobradiças. A UI v2 ainda é mockup visual da Fase 1.1.

### Mockup textual ideal (Inspector v2 — porta selecionada)

```
┌─ INSPECTOR · Porta esquerda (450×720) ─────────────┐
│  [SVG: porta com 3 círculos vermelhos na lateral]  │
│  ▸ Dobradiças  ······························  3 │
│     ① Clip Top Blumotion · 100mm topo · esq        │
│     ② Clip Top Blumotion · 410mm meio · esq        │
│     ③ Clip Top Blumotion · 620mm base · esq        │
│  ▸ Puxador  ·································  1 │
│     Cava 96mm · centralizado horizontal            │
└─────────────────────────────────────────────────────┘
```

### ❌ TODOs concretos (B)
- [ ] Criar callback `get_module_ferragens(entity_id)` em `dialog_controller.rb` que lê `module_group.get_attribute('Ornato', 'ferragens_auto')` + filhos com `tipo=ferragem` e retorna `[{regra, qtd, posicoes_z, anchor_role, componente_3d, preco}]`.
- [ ] Implementar `tabs/ferragens.js#render()` consumindo callback acima — listar por categoria (dobradiças, corrediças, puxadores, pés).
- [ ] No Inspector lateral (`renderInspectorSingle` em `app.js`) substituir texto hard-coded por chamada `loadFerragensSummary(entityId)`.
- [ ] Preview SVG 2D: gerar SVG da porta com círculos nas Z-positions calculadas por `calculate_distribution` — reusar a mesma função em JS (ou enviar Z-positions pré-calculadas via callback).
- [ ] Badge no card do módulo na lista: `🔩 3` indicando contagem de ferragens.
- [ ] Highlight bidirecional: clicar na dobradiça da lista → `Sketchup.active_model.selection.add(instance)` → câmera zoom.

---

## Veredito direto

**Hoje, se o cliente abrir o SketchUp e gerar um módulo com porta, ele PROVAVELMENTE vê uma forma 3D parecida com dobradiça aparecer perto da lateral — mas com chance real de estar deslocada no X, sem espelhamento na lateral direita, e duplicada quando há múltiplas laterais.** Na UI v2 ele **NÃO vê absolutamente nada** sobre as dobradiças além de strings mockadas. A feature mais visível pro usuário final está 40% pronta no 3D e 0% pronta na UI.
