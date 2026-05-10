# Plano de Testes — Ornato Plugin + ERP

**Cobertura por camada:** Unit → Integration → E2E → Manual SketchUp → Carga → Regressão

---

## 0. Ferramentas

- **Plugin Ruby unit/integration**: runner caseiro `tests/run_all.rb` + `tests/test_helper.rb`. Stdlib only. Comando: `bash tools/ci.sh`
- **ERP backend**: Node test runner (sem Jest). Comando: `node server/tests/<file>.js`
- **Frontend React**: smoke build via `npm run build`. Sem unit tests JSX no MVP.
- **E2E**: scripts Ruby/Node que orquestram plugin + backend.
- **Manual SketchUp**: `CHECKLIST_VALIDACAO_MANUAL.md` + extensões.
- **Carga**: k6 ou wrk pra HTTP, smoke manual pra plugin.

---

## 1. Tests Unit (existentes — 158 asserts)

### Plugin Ruby (`tests/`)

| Arquivo | Asserts | O que cobre |
|---|---|---|
| `expression_evaluator_test.rb` | 31 | Parser seguro, ataques bloqueados, namespaces |
| `path_resolution_test.rb` | 12 | Path traversal blocking |
| `drilling_collision_detector_test.rb` | 7 | 4 tipos de colisão |
| `ferragem_drilling_collector_test.rb` | 3 | Walking instances |
| `rules_engine_test.rb` | 3 | Filtro componente_3d |
| `parametric_engine_test.rb` | 6 | ExpressionEvaluator integration |
| `json_exporter_test.rb` | 5 | UPM JSON schema |
| `version_test.rb` | 6 | version.txt parse + fallback |
| `auto_updater_test.rb` | 9 | Channels + SHA + force gate |
| `library_sync_test.rb` | 6 | Cache + LRU + SHA mismatch |
| `cloud_library_resolution_test.rb` | 6 | Fallback 3-camadas |
| `telemetry_optout_test.rb` | 6 | Opt-out skip |
| `compat_enforcement_test.rb` | 6 | Min compat gate |
| `shop_config_sync_test.rb` | 9 | Cloud sync + snapshot |
| `shop_namespace_test.rb` | 8 | `{shop.xxx}` resolve |
| `shop_to_expr_params_test.rb` | 25 | Aliases planos |
| `shop_overrides_test.rb` | 8 | Override local |
| `bay_detector_test.rb` | 9 | Detecção de vão |
| `aim_placement_logic_test.rb` | 10 | walk_up_to_module + fits |
| `aggregate_builder_test.rb` | 10 | build_aggregate |
| `reflow_test.rb` | 10 | Match algorithm + dropouts |
| `validation_runner_test.rb` | 10 | Rules + auto-fix + ignore |
| `dxf_exporter_test.rb` | 10 | Layers + XDATA |

### ERP backend (`server/tests/`)

| Arquivo | Asserts | O que cobre |
|---|---|---|
| `plugin_endpoints_test.js` | 25 | check-update + download + telemetry + errors |
| `plugin_admin_test.js` | 24 | Upload + promote + delete |
| `library_endpoints_test.js` | 58 | Manifest + asset + search + filtros |
| `library_admin_test.js` | 29 | CRUD + RBAC |
| `library_edit_test.js` | 38 | Checkout/checkin/rollback/zip |
| `library_variation_test.js` | 34 | Duplicate + origin updates |
| `shop_endpoints_test.js` | 43 | Profiles CRUD + multi-tenant |

**Comando consolidado:** `bash tools/ci.sh` (plugin) + `for f in server/tests/*.js; do node $f; done` (ERP).

---

## 2. Tests Integration (faltam — devem ser criados)

### 2.1 Plugin → ERP HTTP

```ruby
# tests/integration/plugin_to_erp_test.rb
class PluginToErpTest < OrnatoTest::Case
  test 'check-update flow' do
    # Mock HTTP server respondendo /api/plugin/check-update
    # Plugin AutoUpdater.check_for_updates
    # Assert install_from_archive chamado com SHA correto
  end
  
  test 'library sync flow' do
    # Server retorna manifest com 5 modules
    # LibrarySync.sync_manifest
    # Assert local cache populado
    # fetch_asset baixa 1 .skp
    # Assert SHA verificado
  end
  
  test 'shop config sync flow' do
    # Server retorna profile { folga_porta_lateral: 1.5 }
    # ShopConfig.sync_from_cloud
    # Assert FACTORY_DEFAULTS overrides com 1.5
    # ExpressionEvaluator.eval('{shop.folga_porta_lateral}') == 1.5
  end
end
```

### 2.2 ERP DB → API → Frontend

```js
// server/tests/integration/library_workflow_test.js
test('Editor full lifecycle', async () => {
  // 1. Admin POST /admin/modules (cria draft)
  // 2. Curator POST /checkout (lock 30min)
  // 3. Curator POST /heartbeat (renew)
  // 4. Curator POST /checkin (cria v1.0.14)
  // 5. Admin PATCH /publish (channel=stable)
  // 6. Hook cria origin_updates pra variações
  // 7. Variação curator GET /origin-updates → 1 pendente
  // 8. POST /apply → smart merge
  // 9. Admin POST /rollback/v1.0.13
  // 10. GET /versions → snapshot ativo é o rolledback
})
```

---

## 3. Tests E2E (faltam — críticos pra produção)

### 3.1 Pipeline UPM → G-code

```
Cenário: dobradiça 3D vira furo CNC
1. Carrega modelo SketchUp limpo
2. Executa: Ornato.insert_module('balcao_2_portas', {largura: 800})
3. Adiciona ferragens_auto[0].componente_3d='ferragens/dobradica_amor.skp'
4. Plugin processa via JsonModuleBuilder.process_ferragens_3d
5. Export UPM via Ornato::Main.export_json
6. Validador externo confere: ops com category=hole, side em VALID_SIDES, diameter <= 12mm em edges
7. ERP simula: gera G-code com mesmos ops
8. Comparar G-code esperado vs gerado (golden file)
```

**Status:** TODO. Crítico antes de produção.

### 3.2 Pipeline Shop → Module reflow

```
Cenário: shop config muda → módulo recalcula
1. Insert balcao com folga_porta_lateral=2mm
2. ShopConfig sync from cloud retorna folga=4mm
3. User clica "Atualizar pra padrão atual" no Inspector
4. JsonModuleBuilder.refresh_shop_snapshot_with_reflow(group)
5. Verifica: portas recalcularam com nova folga
6. Verifica: agregados filhos preservados (reflow)
```

**Status:** Lógica entregue, falta E2E test.

### 3.3 Pipeline Library Edit

```
Cenário: workflow editorial completo
1. Admin Ornato cria balcao_v1
2. Marcenaria duplicate-for-shop → balcao_org5_v1
3. Marcenaria checkout → SketchUp edit → checkin
4. Marcenaria publica em beta da org
5. Plugin org5 baixa via manifest scoped (vê variação privada)
6. Plugin org6 baixa via manifest scoped (NÃO vê org5)
7. Admin Ornato publica balcao_v2 (origin update)
8. Hook notifica variação org5
9. Org5 aplica update → smart merge preserva customs
```

**Status:** TODO E2E.

---

## 4. Manual SketchUp (CHECKLIST_VALIDACAO_MANUAL.md já existente)

**Extensões necessárias:**

### 4.1 Mira de Implantação
- [ ] Selecionar agregado "Prateleira" via menu
- [ ] Cursor vira mira (cross-hair)
- [ ] Hover sobre lateral → ghost vermelho (não é vão)
- [ ] Hover dentro do vão → ghost verde com dims
- [ ] Tooltip mostra "Vão 760×340×550mm"
- [ ] Click confirma → prateleira inserida
- [ ] Shift+click repete em outro vão
- [ ] Esc cancela
- [ ] Bay com altura < 80mm → ghost vermelho "Vão muito pequeno"

### 4.2 Reflow
- [ ] Insert balcão 800mm com 1 prateleira
- [ ] Mudar largura pra 1000mm via Inspector
- [ ] Click "Recalcular" → prateleira reposicionada
- [ ] Mudar largura pra 200mm → toast "1 agregado descartado"
- [ ] Verificar: prateleira removida, demais peças OK

### 4.3 Inspector contextual
- [ ] Clicar em módulo → Inspector mostra params + ferragens count + agregados
- [ ] Clicar em peça lateral → Inspector mostra role + dim + material + bordas
- [ ] Clicar em dobradiça → Inspector mostra anchor + furação gerada
- [ ] Clicar em prateleira (agregado) → Inspector mostra bay info + params
- [ ] Selecionar 5 peças → Inspector mostra "5 itens selecionados"

### 4.4 Validation
- [ ] Tab Validação carrega → roda automaticamente
- [ ] Inserir peça com material vazio → aparece erro
- [ ] Click "Selecionar no modelo" → SketchUp seleciona + zoom
- [ ] Click "Auto-fix Aplicar MDF18_BrancoTX" → material aplicado
- [ ] Re-rodar validação → erro sumiu
- [ ] Click "Ignorar" com justificativa → some da lista
- [ ] Toggle "Ignorados" → reaparece com motivo

### 4.5 Library Edit
- [ ] Admin abre /admin/biblioteca → seleciona módulo
- [ ] Click Editar (checkout) → banner amarelo "Bloqueado por 30min"
- [ ] Outro user tenta editar mesmo módulo → erro "Em edição por X"
- [ ] User1 fecha aba → após 30min lock expira automaticamente
- [ ] User1 reabre → faz checkin → versão 1.0.14
- [ ] Admin promove pra stable → status atualizado
- [ ] Admin click Rollback v1.0.13 → snapshot restaurado

### 4.6 Auto-update
- [ ] Mudar canal pra `dev` → check-update → encontra v0.0.1
- [ ] Click Atualizar → download + verify SHA → install_from_archive
- [ ] Restart SketchUp → nova versão carregada
- [ ] Force update test: server retorna `force: true` → dialog sem botão "Mais tarde"

---

## 5. Tests de Carga

### 5.1 Library manifest
**Setup:** 100 marcenarias × 200 módulos cada = 20.000 modules na DB.
```bash
# k6 script
import http from 'k6/http';
export let options = { vus: 200, duration: '60s' };
export default function() {
  http.get('https://erp.ornato.com.br/api/library/manifest', {
    headers: { Authorization: 'Bearer ' + __ENV.TOKEN }
  });
}
```
**Threshold:** p95 < 500ms.

### 5.2 Asset download
**Setup:** 100 clientes simultaneamente baixando 50 .skp cada.
**Threshold:** servidor não derruba, p95 < 2s.

### 5.3 FTS5 search
**Setup:** /api/library/search?q=balcao&category=cozinha — 1000 req/s.
**Threshold:** p99 < 200ms.

### 5.4 Plugin boot
**Setup:** SketchUp + plugin com 388 .skp + 521 JSONs.
**Threshold:** ready < 5s no laptop padrão (8GB RAM, SSD).

---

## 6. Tests de Regressão (cenários conhecidos pra quebrar)

### 6.1 Schema migration
- DB com migrations 001-006 → aplicar 007 → não quebra dados existentes
- DB fresh → todas migrations em sequência → todas tabelas + índices criados
- Rodar migration 2x → segunda execução é no-op

### 6.2 JSONs legacy
- JSON sem `{shop.xxx}` → continua funcionando (fallback)
- JSON com `tipo_juncao: 'cavilha'` legacy → MachiningInterpreter processa via DowelRule
- Módulo sem agregados → rebuild não tenta restaurar agregados (não crasha)

### 6.3 Plugin pré-A1
- version.txt ausente → load_version retorna defaults
- main.rb sem requires de SHOP-* → degrada gracefully (warn no log)

### 6.4 Cross-org isolation
- User org5 não vê profile de org6
- User org5 não vê variação de org6
- User org5 não pode aplicar/dismiss origin_update de org6

---

## 7. Tests de Segurança Adicionais

### 7.1 ExpressionEvaluator fuzzing
```ruby
# Gerar 10.000 strings aleatórias contendo:
# - chars Unicode aleatórios
# - keywords Ruby (eval, system, send, etc)
# - balanceamento { } incorreto
# - números enormes (overflow)
# Pra cada: ExpressionEvaluator.new({}).eval(str) NÃO deve crashar Ruby
# Deve OU retornar valor OU levantar ExpressionError
```

### 7.2 Path traversal endpoints
```bash
# Lista de payloads a testar em todos endpoints com :id ou filename
curl -H "Authorization: Bearer $T" \
  http://localhost:3001/api/library/asset/../../../etc/passwd
# Esperado: 400
curl -H "Authorization: Bearer $T" \
  "http://localhost:3001/api/plugin/download/..%2F..%2F..%2Fetc%2Fpasswd"
# Esperado: 400
```

### 7.3 SQL injection
```bash
# Tentar em todos endpoints com query params:
curl "http://localhost:3001/api/library/search?q=balcao' OR '1'='1"
# Esperado: 400 ou retorno só de "balcao' OR '1'='1" (escape)
```

### 7.4 RBAC bypass
```bash
# JWT com role=viewer tentar endpoints admin:
TOKEN=$(...) # token role=viewer
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/library/admin/modules
# Esperado: 403
```

---

## 8. CI/CD Gates

**Comando único: `bash tools/ci.sh`** deve passar 100% antes de merge.

Adicionar em CI (GitHub Actions / similar):

```yaml
- name: Plugin Ruby tests
  run: bash tools/ci.sh

- name: ERP backend tests  
  run: |
    for f in server/tests/*.js; do node $f || exit 1; done

- name: Frontend build
  run: npm run build

- name: Lint
  run: npx eslint src/ server/

- name: Security scan
  run: |
    grep -rn "eval(" ornato-plugin/ornato_sketchup/ | grep -v "expression_evaluator" && exit 1
    grep -rn "exec(" ornato-plugin/ornato_sketchup/ && exit 1
    echo "OK"

- name: Migration smoke
  run: |
    rm -f /tmp/test.db
    for m in server/migrations/*.sql; do sqlite3 /tmp/test.db < $m; done
    sqlite3 /tmp/test.db ".tables"
```

---

## 9. Cobertura Atual vs Alvo

| Camada | Atual | Alvo Beta | Alvo Prod |
|---|---|---|---|
| Unit Ruby | 158 asserts | 200 | 300 |
| Unit JS | 0 | 50 | 100 |
| Integration | 0 | 20 | 40 |
| E2E | 0 | 10 | 20 |
| Manual checklist | ~50 itens | 100 | 200 |
| Carga | 0 | 4 cenários | 10 |
| Segurança fuzzing | 0 | 10k inputs | 100k |

**Estimativa pra atingir alvo Beta:** ~10 dias dev de testing.

---

## 10. Cronograma sugerido

| Semana | Foco |
|---|---|
| 1 | Integration tests plugin↔ERP (10 cenários) |
| 2 | E2E pipelines (UPM→G-code, Edit workflow) |
| 3 | Manual checklist completo + bug fixes |
| 4 | Carga + segurança fuzzing |

Total: 1 mês pra cobertura beta-ready.

---

## 11. Como rodar (resumo)

```bash
# Ruby plugin
cd /Users/madeira/SISTEMA\ NOVO/ornato-plugin
bash tools/ci.sh

# ERP backend
cd /Users/madeira/SISTEMA\ NOVO
node server/tests/plugin_endpoints_test.js
node server/tests/library_endpoints_test.js
# ... etc

# Single test
ruby tests/library_sync_test.rb
node server/tests/library_edit_test.js

# Smoke build frontend
cd /Users/madeira/SISTEMA\ NOVO
npm run build

# Manual SketchUp
# Abrir SketchUp + checklist em CHECKLIST_VALIDACAO_MANUAL.md
```
