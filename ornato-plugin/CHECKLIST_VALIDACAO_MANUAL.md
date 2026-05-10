# Checklist de Validação Manual — Sprint 5

**Quando rodar:** antes de qualquer release. Cada item é executável em ~2 min no SketchUp aberto com plugin Ornato carregado.

**Como marcar:** `[ ]` → `[x]` quando passar. Anotar bug em `# OBS` se falhar.

---

## A. Smoke test — módulo legacy (sanity check)

- [ ] **A1.** `Plugins → Ornato → Inserir Módulo → balcao_2_portas` (largura 800, altura 720, profundidade 560). Geometria aparece sem warnings no Ruby Console.
- [ ] **A2.** Lista de corte gera **11 peças** (2 lat + base + topo + 2 portas + 1 fundo + 3 prateleiras + rodapé).
- [ ] **A3.** Export UPM JSON via `Ornato → Export JSON`. Confere que `entities[*].pieces.length == 11` e nenhuma op tem `side` inválido.

## B. Path 3D — dobradiça com `componente_3d`

- [ ] **B1.** Criar JSON teste em `biblioteca/moveis/_test/test_dobradica_3d.json` (copiar `balcao_2_portas.json`, adicionar em `ferragens_auto`:
  ```json
  { "regra": "dobradica", "anchor_role": "lateral", "secondary_role": "door",
    "componente_3d": "ferragens/dobradica_amor_cj.skp", "qtd": "2",
    "offset_top": 100, "offset_bottom": 100, "depth_from_face": 4 }
  ```
- [ ] **B2.** Inserir o módulo. **2 instâncias de dobradiça** aparecem por lateral = 4 totais.
- [ ] **B3.** Lateral DIREITA: dobradiça espelhada (copela apontando pra dentro do móvel — Sprint 3 fix bug 1). Inspecionar visualmente.
- [ ] **B4.** Origin da dobradiça na **face interna** da lateral (Sprint 3 fix bug 2). Não na face contra parede.
- [ ] **B5.** No Ruby Console: `Sketchup.active_model.entities.grep(Sketchup::ComponentInstance).first.get_attribute('Ornato','preserve_drillings')` → `true`.
- [ ] **B6.** Mesmo console: `.get_attribute('Ornato','componente_3d')` → `"ferragens/dobradica_amor_cj.skp"`.
- [ ] **B7.** Mesmo console: `.get_attribute('Ornato','anchor_role')` → `"lateral"`.

## C. Extração de furações 3D + UPM

- [ ] **C1.** Export UPM no módulo de B. Inspecionar JSON output.
- [ ] **C2.** `entities[*].pieces[lateral_*].operations[]` contém ops com `fonte: "wps_skp:ferragens/dobradica_amor_cj.skp"`.
- [ ] **C3.** Cada op tem `side` em `{topside, underside, edge_left, edge_right, edge_front, edge_back}`. Nenhuma com `side: "edge_frente"` (validar tradução PT→EN do Sprint 2).
- [ ] **C4.** Ops de borda (`edge_*`) todas com `category: "hole"` e `diameter <= 12.0`. (Sprint 2 envelope.)
- [ ] **C5.** UPM JSON tem chave top-level `_drilling_collisions`. Se não houver colisão, `{collisions: [], stats: {by_severity: {}}}`.

## D. Detecção de colisão de furos (intencional)

- [ ] **D1.** Editar JSON de teste, adicionar 2 entries de dobradiça **com offset_top idêntico** (ambos 100mm) e `componente_3d` diferentes (ex: `dobradica_amor_cj` e `dobradica_amor_165_cj`).
- [ ] **D2.** Re-inserir módulo. Export UPM.
- [ ] **D3.** `_drilling_collisions.collisions[]` tem ≥1 entry com `tipo: :overlap_xy` e `severity: :error`.

## E. Materiais (Sprint 1 fix)

- [ ] **E1.** Inserir `balcao_2_portas` com `material_carcaca: 'MDF18_BrancoTX'`. Lateral renderiza com material correto (não sem material/erro).
- [ ] **E2.** Trocar pra `MDF18_Cinza`. Repaint funciona, lateral muda cor.
- [ ] **E3.** Trocar pra `MDF18_Lacado`, `MDF18_Natural`, `MDF25_BrancoTX`, `MDF6_Branco`, `MDF12_Branco`, `MDF15_Branco` — todos resolvem.

## F. UI v2 — drawer de configurações (`Cmd+,`)

- [ ] **F1.** Abrir HtmlDialog do plugin. Pressionar `Cmd+,` (Mac) ou `Ctrl+,` (Win).
- [ ] **F2.** Drawer abre à direita com header "Configurações globais".
- [ ] **F3.** Seção "Padrões de ferragens" mostra 5 fields populados (não vazios).
- [ ] **F4.** Seção "Tolerâncias e folgas" mostra 4 fields.
- [ ] **F5.** Editar 1 valor. Click "Salvar". Toast "Configuração salva".
- [ ] **F6.** Fechar drawer. Reabrir. Valor persistiu.
- [ ] **F7.** "Resetar padrão". Toast aparece, valores voltam ao default.

## G. UI v2 — tab Ferragens

- [ ] **G1.** Selecionar 1 módulo no SketchUp. UI mostra `selection.count = 1`.
- [ ] **G2.** Click tab "Ferragens" (hotkey `6`). Lista aparece (não placeholder).
- [ ] **G3.** Resumo agregado mostra contagem por tipo (ex: "Dobradiça ×4, Minifix ×6").
- [ ] **G4.** Lista por peça com badge da quantidade.
- [ ] **G5.** Click "Atualizar" refaz fetch. Lista re-renderiza.
- [ ] **G6.** Desselecionar tudo. Tab volta pra empty state "Selecione um módulo".

## H. Ripado cavilhado (Agente N confirmou viabilidade)

- [ ] **H1.** Inserir `painel_ripado.json` (já existe em `biblioteca/moveis/sala/`).
- [ ] **H2.** Variar `n_ripas: 5` → 5 ripas paramétricas geradas.
- [ ] **H3.** Export UPM. Operações `cavilha_ripa` aparecem entre painel e cada ripa (= `2 × n_ripas` furos).

## I. Cavilha legacy (path 2D, sem componente_3d)

- [ ] **I1.** Inserir `balcao_2_portas` com `tipo_juncao: 'cavilha'`.
- [ ] **I2.** Export UPM. Ops `category: hole, diameter: 8, depth: 15, side: a` ou `side: b` em `lateral × base` e `lateral × top`.
- [ ] **I3.** Total de cavilhas = 4 furos por junção × 4 junções (com tampo) = 16 furos.

## J. Performance / regressão

- [ ] **J1.** Inserir 5 módulos no mesmo arquivo. Plugin não trava.
- [ ] **J2.** Export UPM com 5 módulos. Tempo < 5 segundos.
- [ ] **J3.** `Sketchup.active_model.definitions.length` não cresce a cada `JsonModuleBuilder.create_from_json` repetido (cache funcionou).

## K. Erro proposital (defensive)

- [ ] **K1.** Editar JSON com `componente_3d: "ferragens/inexistente.skp"`. Inserir módulo. Plugin **não crasha**, só warning no console.
- [ ] **K2.** JSON com sintaxe quebrada. Mensagem de erro clara, não stack trace cru.
- [ ] **K3.** Espessura inválida (-5). Validador reclama, peça não é criada.

---

## Critério de release

- 🟢 **Alfa interno:** A + E + F + I passando (12 itens)
- 🟡 **Beta fechado:** + B + C + G + J (≥ 30 itens)
- 🔵 **Produção:** todos (50 itens) + audit do operador CNC validando G-code real

## Reportar bugs

Adicionar ao final deste arquivo:
```
### BUG #XX — [Item Yn]
- **O quê:** descrição
- **Esperado:** ...
- **Real:** ...
- **Repro:** ...
- **Severidade:** 🔴/🟡/🟢
```
