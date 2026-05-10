# Prompt de Auditoria — Ornato Plugin + ERP

**Como usar:** copie cada seção pra um agente Claude/Cursor/colega humano. Cada um produz um relatório `.md` que você consolida.

---

## 0. Setup e contexto

**Antes de qualquer auditoria, dê este contexto ao auditor:**

> Plugin SketchUp Ornato (Ruby) + ERP web (Express/SQLite/React). Entregamos ~30 sprints cobrindo: cloud library com auto-update, padrões da marcenaria, mira de implantação, edit workflow com checkout/versions/rollback, inspector contextual, reflow paramétrico, variação de bloco por marcenaria, validação central. ~14.000 linhas, 158 testes automatizados.
>
> Estrutura:
> - Plugin: `/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/`
> - ERP backend: `/Users/madeira/SISTEMA NOVO/server/`
> - ERP frontend: `/Users/madeira/SISTEMA NOVO/src/`
> - Biblioteca: `/Users/madeira/SISTEMA NOVO/ornato-plugin/biblioteca/`
> - Testes: `tests/` (plugin) e `server/tests/` (ERP)
> - CI: `bash tools/ci.sh` deve passar 100%

---

## 1. Auditoria de Arquitetura

```
Você é auditor de arquitetura. Plugin SketchUp Ornato + ERP.

LEIA esses 5 arquivos pra entender o sistema:
1. /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/library/json_module_builder.rb
2. /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/hardware/shop_config.rb
3. /Users/madeira/SISTEMA NOVO/server/routes/library.js
4. /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/library/expression_evaluator.rb
5. /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/geometry/bay_detector.rb

VERIFIQUE 10 INVARIANTES:

1. **Prioridade de resolução de parâmetros**: override local > snapshot do módulo > shop_config cloud > FACTORY_DEFAULTS > PARAM_ALIASES. Vá em build_param_context e prove que respeita essa ordem.

2. **Namespace whitelist**: ExpressionEvaluator só aceita `shop.` e `bay.` — qualquer outro identifier com `.` deve ser rejeitado. Procure ALLOWED_NAMESPACES e verifique.

3. **Multi-tenant isolation**: cada query SQL que retorna library_modules ou shop_profiles ou library_variations DEVE filtrar por `empresa_id` ou `org_id`. Liste todas queries em routes/library.js e routes/shop.js e marque OK/❌ por linha.

4. **Path traversal blocking**: 4 lugares vulneráveis (resolve_componente_path, library asset endpoint, plugin RBZ download, library export.zip). Cada um valida com `path.resolve` + startsWith do baseDir? Liste cada um.

5. **Lock TTL**: library_locks deve auto-expirar. Procure pruneExpiredLocks(). É chamado em todos endpoints que verificam lock?

6. **Backward compat**: módulos sem org_id (legacy = global), JSONs sem `{shop.xxx}` (continua resolvendo plain), módulos sem aggregates. Verifique 3 caminhos.

7. **Stamping consistency**: TodoEntity criada por JsonModuleBuilder tem `Ornato.tipo` (modulo/peca/ferragem/agregado). Liste os 4 caminhos.

8. **Idempotência de migrations**: todas em server/migrations/ usam `IF NOT EXISTS` ou try/catch. Liste e marque cada uma.

9. **Bootstrap ordering**: dev_loader.rb e main.rb carregam version.rb ANTES de qualquer require que use PLUGIN_VERSION. Verifique linha-a-linha.

10. **Schema versioning**: library_modules tem version, plugin_releases tem version, mas migrations não têm tabela schema_migrations. Como detectamos drift entre prod e dev?

ENTREGA: relatório `AUDIT_ARCHITECTURE.md` com:
- Invariante / Status (✅/⚠️/❌) / Evidência (arquivo:linha) / Risco se quebrar
- Top 3 problemas estruturais identificados
```

---

## 2. Auditoria de Segurança

```
Você é auditor de segurança. Plugin SketchUp Ornato + ERP.

CONTEXTO: já fechamos 2 vetores críticos no Sprint Sec (eval RCE + path traversal em resolve_componente_path). Verifique se ficaram fechados E busque vetores novos.

LEIA:
- /Users/madeira/SISTEMA NOVO/CRITICAL_REVIEW.md (R6)
- /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/library/expression_evaluator.rb

INVESTIGUE 12 VETORES:

🔴 CRÍTICOS (verificar 100%):
1. **eval/instance_eval/class_eval em código Ruby**: `grep -rn "eval(" ornato_sketchup/` deve retornar zero (exceto definições de método `def eval` em ExpressionEvaluator).
2. **Path traversal em downloads**: 4 endpoints de download de arquivo (plugin RBZ, library asset, library export, plugin attachment). Cada um valida basePath?
3. **SQL injection**: todas queries usam prepared statements (`db.prepare(...)`). Procure por `db.exec(`...${var}`...)` ou string concatenation em SQL — DEVE ser zero.
4. **Multi-tenant**: tabelas com `empresa_id`/`org_id` (shop_profiles, library_modules, library_variations) — TODA query filtra por isso? Liste cada query e marque ✅/❌.
5. **JWT secret**: como é gerado? Tem `.jwt_secret` no repo? Em produção é diferente? Onde é configurado?

🟡 IMPORTANTES:
6. **Auth bypass**: routes que NÃO usam `requireAuth`. `grep -rn "router\.\(get\|post\|put\|patch\|delete\)" server/routes/` e marque cada uma. Faltou em algum?
7. **Force unlock**: library_locks force release deve ser SÓ admin (logged in audit). Verifique.
8. **Telemetria sem PII**: payload em `send_telemetry` em auto_updater.rb — confirme que não envia nome do projeto, IP geo, hardware fingerprint.
9. **Material upload**: POST /admin/library/modules aceita multipart. Validação: filename sanitizado? Extensão whitelist? Size limit (50MB)?
10. **Heartbeat sem auth**: lib_locks heartbeat — atacante pode renovar lock alheio? Verifica que `req.user.id == lock.locked_by`?
11. **Origin updates cross-org**: variação da org A não pode aplicar/dismiss update da org B. Verifique cada endpoint.
12. **install_id leak**: install_id é UUID v4, persistido em Sketchup default. Pode atacante usar pra rastreio? Tem rotation? (provavelmente não — flagged como "v2").

ENTREGA: `AUDIT_SECURITY.md` com:
- Vetor / Severidade (🔴/🟡/🟢) / Status (FECHADO/ABERTO/PARCIAL) / Evidência / Recomendação
- Top 5 vulnerabilidades remanescentes ranqueadas por severidade
- Comandos `grep` exatos pra reproduzir cada finding
```

---

## 3. Auditoria de Performance

```
Você é auditor de performance. Plugin Ornato + ERP.

INVESTIGUE 10 GARGALOS POTENCIAIS:

1. **Boot do plugin**: 90+ arquivos Ruby + 388 .skp + 521 JSONs. Tempo de require em SketchUp? Profile com Sketchup.set_status_text marcando mim/máx (eyeballing).
2. **definitions.load lazy?**: JsonModuleBuilder.process_componente_3d carrega .skp. Cacheado em definitions.find? Confirmar (deve ser yes).
3. **BayDetector.bays**: O(N²) no algoritmo de subtraction grid? Pra módulo com 5 prateleiras + 2 divisórias = 35 candidates × 7 pieces = 245 overlap checks. Aceitável? Profile.
4. **FTS5 query latency**: /api/library/search com q + 5 filtros. Plan: `EXPLAIN QUERY PLAN SELECT...`. Index sendo usado?
5. **Manifest delta**: /api/library/manifest?since=v1.0.10 — query SCAN ou INDEX SEEK? Verifique idx_library_channel_status uso.
6. **LRU cache eviction**: LibrarySync.lru_evict_if_needed lê meta.json inteiro → ordena por last_accessed_at. Para 500MB com 1000 arquivos pequenos = 1000 entries. OK.
7. **SelectionObserver polling 1s**: faz `selection.first(5).map` em cada tick. 100% accuracy aceitável? CPU overhead?
8. **Migration 4MB+ DB**: 7 migrations executadas em sequência num DB com 100 marcenarias × 100 módulos cada. Tempo total?
9. **Drilling collision detector**: O(k²) por bucket [peca_id, lado]. Para módulo com 100 furos em uma lateral = 10.000 checks. Aceitável?
10. **CI suite**: 158 testes em quanto tempo? `time bash tools/ci.sh`. Threshold pra alerta: > 30s.

PROFILE com:
- `time` em comandos
- `EXPLAIN QUERY PLAN` em SQL críticas
- `Benchmark.realtime` em Ruby críticos
- Chrome DevTools Performance pra UI v2

ENTREGA: `AUDIT_PERFORMANCE.md` com:
- Gargalo / Tempo medido / Tempo aceitável / Fix proposto
- Top 3 otimizações com maior ROI
- Plano de monitoring contínuo (telemetry endpoints?)
```

---

## 4. Auditoria de API Contracts

```
Você é auditor de contratos REST. ERP Ornato.

ENDPOINTS A AUDITAR — ESCOPO PLUGIN/LIBRARY/SHOP (54 total).

> NOTA DE ESCOPO (2026-05-10): Esta auditoria cobre APENAS os 3 arquivos
> `server/routes/{plugin,library,shop}.js` (24 + 24 + 6 = 54 endpoints),
> que são a superfície de contrato do plugin SketchUp + galeria pública.
> O ERP completo expõe **746 endpoints** em 45 arquivos de rota
> (`cnc.js` sozinho tem 224; `financeiro.js` 36; `projetos.js` 32; etc.).
> Inventário ERP-wide vive em `INVENTARIO_API_ERP.md` (a ser gerado).
> NÃO inferir cobertura ERP a partir deste documento.

Contagens exatas re-validadas em 2026-05-10:
- plugin.js: 24 (`grep -cE "^router\.(get|post|put|patch|delete)" server/routes/plugin.js`)
- library.js: 24
- shop.js: 6

Legenda cobertura: ✅ coberto por server/tests/  ·  ⚠️ parcial  ·  ❌ sem teste

PLUGIN (24 endpoints — server/routes/plugin.js):
- GET    /api/plugin/latest                                  ❌
- GET    /api/plugin/download/:filename                      ✅ (plugin_endpoints_test.js)
- POST   /api/plugin/register                                ❌
- GET    /api/plugin/check-update                            ❌
- GET    /api/plugin/download/:filename  (rota duplicada L199) ⚠️
- POST   /api/plugin/telemetry                               ✅
- POST   /api/plugin/error-report                            ✅
- GET    /api/plugin/biblioteca                              ❌
- GET    /api/plugin/biblioteca/moveis                       ❌
- GET    /api/plugin/biblioteca/moveis/:id                   ❌
- GET    /api/plugin/biblioteca/ferragens                    ❌
- GET    /api/plugin/projeto/:id/info                        ❌
- POST   /api/plugin/projeto/init                            ❌
- POST   /api/plugin/projeto/:id/bom                         ❌
- GET    /api/plugin/projeto/:id/bom                         ❌
- POST   /api/plugin/projeto/:id/proposta                    ❌
- POST   /api/plugin/releases               (admin)          ✅ (plugin_admin_test.js)
- GET    /api/plugin/releases               (admin)          ✅
- PATCH  /api/plugin/releases/:id           (admin)          ✅
- DELETE /api/plugin/releases/:id           (admin)          ✅
- GET    /api/plugin/telemetry              (admin)          ⚠️
- GET    /api/plugin/error-reports          (admin)          ⚠️
- GET    /api/plugin/error-reports/:ticket_id (admin)        ❌
- GET    /api/plugin/health                 (público)        ❌

LIBRARY (24 endpoints — server/routes/library.js):
- GET    /api/library/manifest                               ✅ (library_endpoints_test.js)
- GET    /api/library/asset/:id                              ✅
- GET    /api/library/search                                 ✅
- GET    /api/library/autocomplete                           ⚠️
- GET    /api/library/filters                                ✅
- GET    /api/library/admin/modules         (curator)        ✅ (library_admin_test.js)
- GET    /api/library/admin/modules/:id     (curator)        ✅ (library_edit_test.js)
- POST   /api/library/admin/modules         (curator)        ✅
- PUT    /api/library/admin/modules/:id     (curator)        ✅
- PATCH  /api/library/admin/modules/:id/publish (curator)    ✅
- DELETE /api/library/admin/modules/:id     (master)         ✅
- POST   /api/library/admin/validate        (curator)        ✅
- POST   /api/library/admin/modules/:id/checkout             ✅
- POST   /api/library/admin/modules/:id/heartbeat            ⚠️
- POST   /api/library/admin/modules/:id/release              ⚠️
- POST   /api/library/admin/modules/:id/checkin              ✅
- GET    /api/library/admin/modules/:id/versions             ⚠️
- POST   /api/library/admin/modules/:id/rollback/:version_id ⚠️
- GET    /api/library/admin/modules/:id/export.zip           ❌
- POST   /api/library/admin/import                           ❌
- POST   /api/library/admin/modules/:id/duplicate-for-shop   ❌
- GET    /api/library/admin/origin-updates                   ❌
- POST   /api/library/admin/origin-updates/:id/apply         ❌
- POST   /api/library/admin/origin-updates/:id/dismiss       ❌

SHOP (6 endpoints — server/routes/shop.js):
- GET    /api/shop/config                                    ✅ (shop_endpoints_test.js)
- GET    /api/shop/profiles                 (admin)          ✅
- POST   /api/shop/profiles                 (admin)          ✅
- PUT    /api/shop/profiles/:id             (admin)          ✅
- PATCH  /api/shop/profiles/:id/activate    (admin)          ✅
- DELETE /api/shop/profiles/:id             (admin)          ✅

RESUMO COBERTURA:
- Plugin: 9/24 cobertos (37,5%)
- Library: 14/24 cobertos (58,3%)
- Shop: 6/6 cobertos (100%)
- TOTAL: 29/54 cobertos (~54%)

GAPS CRÍTICOS (sem teste):
1. POST /api/plugin/register — onboarding do plugin no servidor
2. POST /api/plugin/projeto/* (4 endpoints) — fluxo principal de BOM/proposta
3. GET /api/library/admin/modules/:id/export.zip — backup/migration
4. POST /api/library/admin/import — entrada de módulos terceiros
5. /api/library/admin/origin-updates/* (3 endpoints) — sync origem→shop

PRA CADA ENDPOINT VERIFIQUE 8 ITENS:
1. Auth correto (Bearer + role gating?)
2. Validação de input (body/query schema?)
3. Resposta documentada (shape + status codes)
4. Error handling (404/400/409/500 cobertos?)
5. Cache headers apropriados
6. Multi-tenant isolation (queries com empresa_id?)
7. Rate limiting (apenas em telemetry)
8. Logs de operação (audit?)

GERE OPENAPI 3.0 stub em `docs/api/openapi.yaml` cobrindo todos os endpoints com:
- summary, description, parameters, requestBody, responses, security

ENTREGA: `AUDIT_API.md` + `docs/api/openapi.yaml`
- Tabela dos 54 endpoints com 8 itens cada
- Top 5 endpoints com gaps
- Diff entre o que está implementado e o que falta documentar
```

---

## 5. Auditoria de Plugin SketchUp

```
Você é auditor especializado em plugins SketchUp Ruby.

INVESTIGUE 12 ÁREAS:

1. **Observer leaks**: SelectionObserver registrado em add_observer — onde é remove_observer? Em deactivate? Em quit?
2. **Geom transformations**: usar `transform!` (mutável) vs `transform` (cópia) — checar consistência. Performance.
3. **Operation atomicity**: todos write-ops devem ter `start_operation/commit_operation` (com rescue → abort_operation). Liste cada lugar.
4. **PickHelper precision**: AimPlacementTool#onMouseMove usa pick_helper.do_pick(x, y) + pick_helper.path_at(0). Confiável em modelos com nested groups? Casos edge?
5. **HtmlDialog vs WebDialog**: estamos no HtmlDialog (correto pra SU 17+). Plugin tem fallback pra SU pré-17?
6. **dialog.execute_script escape**: ao passar JSON, está sempre via JSON.generate (sanitizado)? Ou tem string interpolation perigosa?
7. **Sketchup.read_default fallback**: sempre tem 2º arg pra default? (não causa NPE)
8. **Thread safety**: ShopConfig, LibrarySync, AutoUpdater todos rodam em threads. SketchUp Ruby é single-threaded — qualquer chamada de API SU dentro de Thread.new vai crashar. Liste cada Thread.new e verifique que NÃO chama Sketchup.* dentro.
9. **Locale**: hardcoded pt-BR? Ou respeita Sketchup.locale? Strings em mensagens UI estão extraídas?
10. **Plugin path**: `File.expand_path('../...', __FILE__)` — funciona em SU instalado vs dev_loader? Mac vs Win?
11. **Memory profile**: PieceStamper grava 10+ atributos por peça. 100 módulos com 15 peças cada = 15.000 atributos no model. SketchUp file size?
12. **Crash recovery**: se plugin crasha mid-build, deixa modelo em estado inconsistente? `start_operation` com nome adequado pra usuário desfazer?

LEIA:
- /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/main.rb
- /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/library/json_module_builder.rb
- /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/tools/aim_placement_tool.rb
- /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/library/library_sync.rb

ENTREGA: `AUDIT_SKETCHUP_PLUGIN.md` com:
- 12 áreas / Status / Evidência / Risco
- Top 3 issues que podem crashar SketchUp
- Comandos de console pra reproduzir cada um
```

---

## 6. Auditoria de UI v2

```
Você é auditor UX/UI especializado em vanilla JS modular sem build.

INVESTIGUE:

1. **State management**: state global em app.js — leak quando mudar de tab? Cleanup?
2. **Bridge callRuby fire-and-forget**: como tratar timeout? Erros silenciosos?
3. **Setters globais window.onXXX**: namespace pollution. Listar todos.
4. **Render performance**: setState dispara render() completo. Para Inspector com módulo de 30 props, re-render custa? Aceitável < 16ms?
5. **Acessibilidade**: tabindex correto? aria-label nos botões? Contraste cores?
6. **Mobile viewport**: panel HtmlDialog é fixo. Usuário com tela pequena vê tudo?
7. **Dark mode toggle**: testar via T atalho. Variáveis CSS atualizam tudo?
8. **Cmd+K palette**: fuzzy search funciona? Latência?
9. **Tab navigation**: 1-9 teclas. Conflito com SketchUp shortcuts?
10. **Loading states**: Inspector tem loading skeleton? Tab Validação tem? Tab Ferragens tem?

LEIA:
- /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2/app.js
- /Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2/tabs/

ENTREGA: `AUDIT_UI.md`
- 10 áreas / Status / Evidência
- 5 melhorias UX prioritárias
```

---

## 7. Como consolidar

Após receber os 6 relatórios:

```
Você é auditor sênior. Recebeu 6 relatórios:
- AUDIT_ARCHITECTURE.md
- AUDIT_SECURITY.md
- AUDIT_PERFORMANCE.md
- AUDIT_API.md
- AUDIT_SKETCHUP_PLUGIN.md
- AUDIT_UI.md

PRODUZA `AUDIT_EXECUTIVE_SUMMARY.md` (sob 2000 palavras):

1. **Top 10 issues consolidados** ranqueados por severidade × probabilidade × esforço de fix
2. **Roadmap pra alfa interno** (7 dias): só 🔴 críticos
3. **Roadmap pra beta externo** (1 mês): + 🟡 importantes
4. **Roadmap pra produção** (3 meses): tudo
5. **Métricas de saúde**: testes/cobertura/débito técnico/segurança/performance — score 1-10 cada
6. **Decisões pendentes do CEO**: o que precisa de bizdev/jurídico/financeiro pra desbloquear
```
