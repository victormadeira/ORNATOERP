# Auditoria — Configurações Globais (ShopConfig)

**Escopo:** existência da classe `ShopConfig`, persistência, integração com `wps_defaults.json` (1937 atributos) e UI v2.

---

## 1. Existência da classe — STATUS GERAL

| Item | Status | Caminho |
|---|---|---|
| Classe `ShopConfig` (módulo Ruby) | OK | `ornato_sketchup/hardware/shop_config.rb` |
| Persistência (Sketchup.read/write_default) | OK | linhas 246, 258, 267 |
| Override por instância (atributo no group) | OK | `for_group` / `save_for_group` (l. 274-292) |
| Painel HTML legado | OK | `ornato_sketchup/ui/shop_config_panel.html` |
| Atalho `Cmd/Ctrl + ,` | OK | `ui/v2/app.js:800` (`setState({ configOpen: true })`) |
| Painel de Config na UI v2 | PARCIAL — só UI shell, sem fields | `ui/v2/app.js:606-652` (`renderConfigDrawer`) |
| Consumo de `wps_defaults.json` em runtime | NAO — arquivo parado em disco | só lido por `tools/wps_attributes_converter.rb` |

**Persistência:** `Sketchup.write_default('Ornato', 'shop_config', JSON)` — escopo workstation, não por `.skp`. Override por módulo via `group.set_attribute('Ornato', 'hardware_config', JSON)`. Padrão correto.

---

## 2. Onde `ShopConfig` é consumido (runtime)

`grep -rln ShopConfig ornato_sketchup/` revela 8 consumidores:

- `library/json_module_builder.rb` (l. 82, 263) — injeta `to_expr_params` no contexto das expressões dos JSONs paramétricos. **Crítico.**
- `library/door_calculator.rb` (l. 56) — folgas e dobradiças.
- `machining/machining_interpreter.rb` — cálculo de furação.
- `hardware/rules_engine.rb` — regras de validação.
- `catalog/material_catalog.rb` — espessuras válidas.
- `ui/dialog_controller.rb` — callbacks `get/save/reset_shop_config`.

Tudo isso ainda aponta para o **dialog antigo** (`shop_config_panel.html`). A UI v2 não bind ainda.

---

## 3. `wps_defaults.json` — 1937 atributos parados

Categorias top-level (extraído via `python3`):

| Cat | Itens | Cat | Itens |
|---|---|---|---|
| bordas | 5 grupos | itinerario | 85 |
| materiais | 3 | puxadores | 33 |
| pecas | 20 | ferragens | 30 |
| corpos | 15 | gavetas | 7 |
| portas | 17 | corredicas | 6 |
| dobradicas | 4 | ferramentas | 1 |
| _unmapped | 2 | | |

**Status:** escrito uma vez por `tools/wps_attributes_converter.rb`. **Nenhum `require` ou `JSON.parse` em runtime.** É documentação morta.

---

## 4. Configs existentes vs faltantes (cruzando WPS x ShopConfig)

| Categoria | Existe em ShopConfig? | Faltante (vindo do WPS) |
|---|---|---|
| Espessuras carcaça/fundo/frente | OK | espessuras por papel (`espessurabordacorpo`, `_painel`, `_sanca`, `_painelcurvado`) |
| Folgas porta abrir/correr | OK | nenhum gap óbvio |
| Folgas gaveta/prateleira/divisória | OK | folga frente-gaveta vs corpo |
| Dobradiça (Blum/Grass/Häfele/Hettich) | OK | offsets por modelo de braço (reto/curva/super) por fabricante |
| Sobreposição reta/curva/super | OK | — |
| Minifix/Confirmat/Cavilha | OK | — |
| Sistema 32 + pino prateleira | OK (sys32 desligado) | — |
| Corrediça (4 modelos + holes 350-500) | OK | trilho lateral, soft-close por modelo |
| Puxador (espaçamento, recuo, y_porta) | OK | catálogo de modelos (33 itens em `puxadores`) — só tem espaçamento |
| Rasgo de fundo | OK | — |
| Pistão a gás | OK (força) | curso, modelo |
| **Bordas (fitas)** | **FALTA** | 11 perfis de largura de fita (`larguraborda15..50`, A-I), espessura por papel, lados padrão por peça (base/frente/traseira/laterais por tipo de peça), descontos |
| **Itinerário CNC** | **FALTA** | 85 atributos (ordem de máquinas, lado de referência, prioridade) |
| **Ferramentas CNC** | **FALTA** | calibração de fresa (a UI v2 já promete `cnc` em drawer mas sem fields) |
| **Materiais** (catálogo) | parcial em `material_catalog.rb` | densidade, fornecedor, código WPS por material |
| **Tamburato** (limites) | FALTA | `limite_largura_tamburato` (8 perfis) |
| **Puxadores — modelos** | FALTA | catálogo de 33 puxadores com posição/dimensões |

---

## 5. Como expor 1937 valores na UI sem virar bagunça

Princípio: **a UI não mostra 1937 fields**. Mostra o que a marcenaria troca; o resto fica em "Avançado / Catálogo WPS" colapsado.

**Recomendação de IA (Information Architecture) — 3 camadas:**

1. **Defaults da Marcenaria** (~30 fields, top do drawer):
   espessuras padrão, folgas, ferragem default, fitas mais usadas. Já existem em `ShopConfig`.
2. **Catálogos** (modal por categoria, lista editável):
   - Dobradiças, corrediças, puxadores, perfis de fita, materiais.
   - Cada item: card com defaults; "Editar" abre fields detalhados.
   - Origem inicial dos cards = `wps_defaults.json` (seed).
3. **Avançado / WPS Raw** (debug, expert):
   tabela searchable de `wps_defaults.json` cru — read-only com botão "promover para ShopConfig".

**Mecanismo:** carregar `wps_defaults.json` como `WPS_SEED` no boot; merge `FACTORY_DEFAULTS` (já hardcoded) **acima** do seed para o que coincide (ex: espessuras), e guardar o restante em `ShopConfig['catalogos']` lazy. UI v2 lê via novo callback `get_wps_seed` no dialog_controller.

---

## 6. Recomendação concreta — próximo passo (1 sprint)

1. **Adicionar loader do `wps_defaults.json`** em `shop_config.rb`:
   `WPS_SEED = JSON.parse(File.read(File.join(PLUGIN_DIR,'config/wps_defaults.json')))` (memoizado).
   Expor `ShopConfig.wps_seed` e `ShopConfig.wps_value(path)`.
2. **Estender `to_expr_params`** com aliases para fitas (`fita_largura_15`, `fita_largura_18`, `fita_espessura_corpo`...) e tamburato — desbloqueia JSONs paramétricos consumirem larguras de borda.
3. **Implementar fields no `renderConfigDrawer`** (ui/v2/app.js:606): seções `ferragens` e `tolerancias` primeiro (já existem em `ShopConfig`). Bind via `sketchup.get_shop_config` / `save_shop_config` — callbacks já estão em `dialog_controller.rb:611-640`.
4. **Modal de Catálogo** (segunda etapa) para puxadores/dobradiças/corrediças/fitas — sourced do WPS_SEED, salvo em `ShopConfig['catalogos']`.
5. **Não migrar** itinerário CNC e ferramentas para ShopConfig agora — esses pertencem ao módulo CNC (já existe `tools/` no plugin), tratar no Sprint CNC.

**Quick win:** itens 1+2+3 destravam UX completa de configurações para o usuário sem tocar no JsonModuleBuilder. Itens 4-5 são polish.

---

**Veredicto:** classe `ShopConfig` está **bem desenhada e plugada**, persistência e override estão OK. O gap está na UI v2 (drawer só tem o shell, sem fields) e no aproveitamento do `wps_defaults.json` (importado mas dormindo em disco). Não é refactor — é wiring.
