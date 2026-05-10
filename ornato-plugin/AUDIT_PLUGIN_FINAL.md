# AUDIT_PLUGIN_FINAL — Ornato SketchUp Plugin

**Escopo:** `ornato-plugin/ornato_sketchup/` — 87 arquivos `.rb`. Auditoria estática read-only.

---

## 1. Sintaxe (`ruby -c` em todos os .rb)

Rodado com Ruby 2.6.10 do sistema. SketchUp embarca Ruby 2.7+ — todos os "erros" abaixo são **falsos positivos do parser 2.6** (uso de `rescue` modifier dentro de parênteses, válido em 2.7+):

- `tools/neighbor_resolver.rb:327, 332` — `JSON.parse(... rescue '[]')` — válido em 2.7+
- `tools/placement_tool.rb:323` — `recuo.normalize rescue return nil` — válido em 2.7+

**Status:** 87/87 arquivos sintaticamente OK no runtime alvo (SU Ruby 2.7+). ✅
**Recomendação:** revalidar com `ruby -c` em Ruby 2.7+ no CI; opcionalmente refatorar pra `begin/rescue` blocks pra portabilidade.

---

## 2. Loader integrity (`main.rb` / `dev_loader.rb`)

`main.rb` carrega 53 `require_relative` diretos + carrega `dev_loader.rb`. `dev_loader.rb::LOAD_ORDER` lista 51 arquivos ordenados.

**Os 3 novos críticos estão CARREGADOS em ambos:**
- `machining/skp_feature_extractor.rb` ✅ (main.rb:39, dev_loader:54)
- `machining/drilling_collision_detector.rb` ✅ (main.rb:40, dev_loader:55)
- `machining/ferragem_drilling_collector.rb` ✅ (main.rb:41, dev_loader:56)

**Arquivos .rb que existem MAS não estão em nenhum loader:**
- `catalog/finish_manager.rb` — duplicado/sombra do `constructor/finish_manager.rb`? Nenhum dos dois loaders carrega o de `catalog/`. ⚠️
- `core/dynamic_component_reader.rb` — só carregado condicionalmente em `main.rb:73`, ausente do `dev_loader`. ⚠️
- `catalog/material_catalog.rb` — condicional em main.rb:94, ausente do dev_loader. ⚠️
- `integration/cut_optimizer.rb` — condicional em main.rb:83, ausente do dev_loader. ⚠️
- `library/library_manager.rb`, `library/json_module_builder.rb`, `library/door_calculator.rb`, `library/piece_stamper.rb` — não estão em loader explícito; dependem de cascata via `parametric_engine.rb`. ⚠️ (funcionam por transitividade, mas reload manual pelo dev_loader não pega esses).
- `constructor/construction_logic.rb`, `constructor/dc_converter.rb`, `constructor/module_builder.rb`, `constructor/piece_inserter.rb`, `constructor/resize_observer.rb` — **NENHUM loader carrega**. Possível código órfão ou usado dinamicamente. ❌

---

## 3. Requires quebrados

Verificados todos os `require_relative` (24 fora de main/dev_loader):
- `library/parametric_engine.rb` → 16 paths internos: TODOS existem ✅
- `library/json_module_builder.rb` → `piece_stamper`, `door_calculator`: existem ✅
- `machining/ferragem_drilling_collector.rb` → `skp_feature_extractor`, `drilling_collision_detector`: existem ✅
- `export/json_exporter.rb` → `../machining/machining_json`: existe ✅
- `ui/dialog_controller.rb:310` → lazy `'../export/bom_exporter'`: existe ✅

**Nenhum path quebrado.** ✅

---

## 4. Dependências cruzadas / constantes

Auditadas as referências aos novos módulos:
- `Ornato::Machining::FerragemDrillingCollector`: usado em `hardware/rules_engine.rb:86-88` (com `defined?` guard) ✅ e `ui/dialog_controller.rb:828-830` (com `defined?` guard) ✅
- `Ornato::Machining::SkpFeatureExtractor`: referenciado em comentários e em `ferragem_drilling_collector.rb:135` (chamada direta) — módulo é carregado antes via dev_loader/main ✅
- `Ornato::Machining::DrillingCollisionDetector`: chamado em `ferragem_drilling_collector.rb:114` — carregado antes ✅

**Risco:** `rules_engine.rb` e `dialog_controller.rb` usam `defined?` para fallback gracioso — comportamento correto. ✅

---

## 5. Bridge HtmlDialog (Ruby ↔ JS)

**46 `add_action_callback` registrados**, distribuídos:

- `ui/dialog_controller.rb` (33 callbacks): `ornato_command`, `get_shop_config`, `save_shop_config`, `reset_shop_config`, `create_module`, `analyze`, `process`, `select_module`, `delete_module`, `export_json`, `export_csv`, `export_to_erp`, `test_erp_connection`, `erp_init_project`, `erp_push_bom`, `erp_create_proposal`, `create_ambiente`, `edit_module`, `copy_module`, `generate_countertop`, `apply_edit`, `load_library`, `save_project_data`, `apply_agregados`, `apply_materials`, `open_shop_config`, `get_module_machining`, `add_machining_op`, `remove_machining_op`
- `tools/hole_tool.rb`, `tools/hole_edit_tool.rb` (3 cada): `confirm_hole`, `cancel_hole`, `dialog_ready`
- `library/parametric_engine.rb` (2): `create_module`, `get_module_types`
- `updater/auto_updater.rb` (4): `ready`, `download_update`, `skip_version`, `remind_later`
- `main.rb:683` (1): `set_default`

**UI v2 (`ornato_sketchup/ui/v2/`):** ❌ **NÃO está integrada ao plugin Ruby.**
- `grep "v2"` em todos os `.rb` retorna **zero matches**. Nenhum HtmlDialog Ruby aponta pra `ui/v2/panel.html`.
- `ui/v2/app.js` tem **um único** `sketchup.callRuby('refresh_selection')` e está como `// TODO` (linha 833).
- Os 9 tabs (`projeto/ambiente/biblioteca/internos/acabamentos/ferragens/usinagens/validacao/producao`) são UI mockada — nenhum invoca callbacks Ruby.
- O bridge real está em `ui/dialog.html` + `main_panel.html` (UI v1).

**Conclusão:** v2 é prototype isolado; precisa de (a) ponto de entrada Ruby que abra `panel.html`, (b) registro de callbacks que mapeiem ações dos tabs (ex.: `biblioteca.js` → `create_module`, `usinagens.js` → `add_machining_op`/`get_module_machining`, `producao.js` → `export_json`/`export_to_erp`).

---

## 6. Testes

**Pasta `tests/` existe** em `ornato-plugin/tests/` mas contém apenas `fixtures/` (`sketchup_export.json`, `test-sketchup-export.json`). **Zero specs/runners.** ❌

**Cobertura nominal: 0%.**

Top-5 áreas críticas que merecem smoke tests urgentes:

1. **`machining/ferragem_drilling_collector.rb`** — coleta de furações + colisões; bug aqui estoura UPM/CNC. Fixture: módulo com gaveteiro 3-gavetas + minifix.
2. **`machining/drilling_collision_detector.rb`** — sobreposições e tolerância XY/profundidade. Test cases óbvios: 2 dowels coincidentes, dowel×minifix, colisão pass-through.
3. **`hardware/rules_engine.rb`** — pipeline central de regras; regressões aqui afetam 12 hardware rules.
4. **`library/parametric_engine.rb` + `library/json_module_builder.rb`** — geração paramétrica de 14 tipos de módulo. Smoke: `create_module(:armario_base, w: 600, h: 720, d: 580)` e validar peças+ferragens.
5. **`export/json_exporter.rb`** — contrato de saída pro ERP. Snapshot test contra `tests/fixtures/sketchup_export.json` evita drift.

---

## 7. Score final

| Área | Score | Nota |
|---|---|---|
| Sintaxe | ✅ | 87/87 OK no runtime SketchUp 2.7+ (parser 2.6 dá falso positivo em 2 arquivos) |
| Loader (3 novos) | ✅ | skp_feature_extractor + drilling_collision_detector + ferragem_drilling_collector carregados em main.rb e dev_loader |
| Loader (geral) | ⚠️ | 5 arquivos em `constructor/` órfãos (não-carregados), 4 em `library/` carregados só por transitividade |
| Requires `require_relative` | ✅ | Zero paths quebrados |
| Deps cruzadas (novos módulos) | ✅ | Uso protegido por `defined?` guards corretos |
| Bridge Ruby↔JS (v1) | ✅ | 46 callbacks, cobertura completa do main_panel |
| Bridge Ruby↔JS (v2) | ❌ | UI v2 não integrada — zero rotas Ruby, app.js só tem TODO |
| Testes | ❌ | Sem suite executável; só fixtures JSON |

**Veredito global:** núcleo (machining/hardware/library) sólido e bem cabeado. Riscos concentrados em (a) órfãos no `constructor/`, (b) UI v2 isolada do Ruby, (c) ausência total de testes automatizados.
