# CRITICAL_REVIEW — Plugin Ornato (Agente R6)

Data: 2026-05-10 · Escopo: revisão sistêmica independente, não-bajulação. Foco em achados que os audits anteriores **não** cobriram.

---

## 1. Top 15 problemas SISTÊMICOS (ranqueados)

### 🔴 1. `evaluate_safe` usa `Kernel#eval` em string vinda de JSON — CVE em potencial
`library/json_module_builder.rb:658-665`. A "whitelist" é um regex `[^0-9\+\-\*\/\(\)\.\s]` aplicado **depois** de `gsub`s que injetam expressões `max(...)`, `min(...)`, `round(...)` — os argumentos dessas funções vêm de `evaluate_safe($1)` que executa `eval` num substring **antes** da limpeza global. Se um JSON malicioso definir `"largura": "max(1,2);system('rm -rf')"`, o regex aplicado ao substring `1` e `2` é seguro, mas a coexistência de `eval` + entrada externa é uma superfície que **não deveria existir** no design. **Fix**: substituir por parser aritmético explícito (`Dentaku` gem ou shunting-yard manual). Esforço: 1 dia.

### 🔴 2. Path traversal possível em `resolve_componente_path`
`library/json_module_builder.rb:286-289`. `File.join(root, rel)` onde `rel` vem de `componente_3d` no JSON. Um JSON com `"componente_3d": "../../../../etc/passwd"` ou `"../../wps_source/qualquer.skp"` carrega `.skp` arbitrário do filesystem. Não há `File.expand_path` + verificação de prefixo. Esforço: 30min (canonicalize + start_with? check).

### 🔴 3. Versão do plugin congelada em 0.1.0
`ornato_loader.rb:11`. Há `auto_updater` que envia `PLUGIN_VERSION` ao backend (`updater/auto_updater.rb:43`) mas a versão **nunca foi bumpada** apesar de Sprints 1-3 do CNC já entregues. Releases ficam invisíveis para telemetria/rollout. Esforço: 5min, mas exige disciplina de processo.

### 🔴 4. Zero suite de testes — 87 .rb sem cobertura executável
`AUDIT_PLUGIN_FINAL §6` confirmou. `tests/` só tem fixtures. Refactors de `evaluate_safe` (item 1) ou `build_anchor_transform` (`VALIDACAO_DOBRADICA_VISUAL`) sem testes = roleta russa. Esforço: 1 sprint para minitest + 5 smoke tests críticos.

### 🔴 5. `schema_version` não é usado em runtime para migrar JSONs antigos
`grep schema_version` no plugin: zero matches (`grep -rn versao_schema` no Ruby também). Apenas `balcao_2_portas.json` tem `versao_schema: 1` (`AUDIT_BIBLIOTECA_MOVEIS §metadados`). Quando o schema mudar (já mudou — bordas `frente/topo/base/tras` vs `frontal/traseira/esq/dir` em 28 JSONs), nada migra: aceita silenciosamente o legacy e gera output errado. Esforço: 2 dias para migrator + version gate em `JsonModuleBuilder.create_from_json`.

### 🔴 6. Mapping de materiais quebrado entre JSONs e catálogos físicos
`AUDIT_BIBLIOTECA_FINAL §3` flagou, mas é **sistêmico**: 9/9 IDs `MDF18_BrancoTX` etc. não existem em `chapas.json` nem `catalogo_materiais.json`. Significa que no fluxo `JSON → ParametricEngine → JsonExporter → ERP`, o ERP recebe códigos de material **fantasma**. Custo, fornecedor, densidade ficam em branco. Bloqueia BOM real. Esforço: 1 dia (tabela de mapping + validador).

### 🟡 7. Logger inexistente — `puts` espalhado, nada vai pra arquivo
17 `puts "Ornato JsonModuleBuilder ..."` só em um arquivo. Em produção SketchUp, `puts` cai no Ruby Console que o usuário **não abre**. Não há `Logger` central, nem rotação, nem envio remoto de stack trace para investigar. Quando o cliente diz "deu erro", time não tem nada. Esforço: 1 dia (`core/logger.rb` + Sentry-like ou file appender em `~/Library/Application Support/SketchUp/Plugins/ornato.log`).

### 🟡 8. `ShopConfig` é workstation-global — multi-usuário na mesma máquina mistura preferências
`hardware/shop_config.rb:258` usa `Sketchup.write_default('Ornato', 'shop_config', ...)` — escopo SketchUp registry/plist. Em ateliê com 2 marceneiros logados como mesmo usuário OS (comum em PME), config de um sobrescreve a do outro. Override por modelo existe (`for_group`) mas defaults globais não. Esforço: 1 dia (escopo `Sketchup.active_model.set_attribute` para "config do projeto").

### 🟡 9. 87 `.rb` carregados eagerly no boot — performance não medida
`main.rb` faz 53 `require_relative` diretos. Sem lazy loading de `library_manager` (que percorre 388 .skp + 237 JSONs). Tempo de boot do SketchUp com plugin instalado **nunca foi cronometrado**. Em laptops de marcenaria (i5 8ª gen, 8GB RAM) a primeira janela pode demorar 5-10s, suficiente para o usuário pensar que travou. Esforço: 4h para profiler + lazy require.

### 🟡 10. Sem locking de concorrência no `.skp` — dois usuários no mesmo arquivo
SketchUp não tem multi-user nativo. Mas com Dropbox/OneDrive 2 marceneiros podem editar `.skp` simultaneamente. Plugin grava `set_attribute('Ornato', ...)` direto, sem detecção de "outro processo modificou recentemente". Resultado: last-write-wins silencioso, dados perdidos. Esforço: 2 dias (token de sessão + warning quando attr muda externamente).

### 🟡 11. Constructor órfão (5 arquivos não carregados em loader algum)
`AUDIT_PLUGIN_FINAL §2` listou. `constructor/construction_logic.rb`, `dc_converter.rb`, `module_builder.rb`, `piece_inserter.rb`, `resize_observer.rb` — nenhum loader carrega. Ou é código morto (deletar) ou é código que **deveria** estar carregado e ninguém percebeu que está silenciosamente desligado. Há `piece_inserter.rb:114` chamando `definitions.load` — feature inteira pode estar quebrada sem aviso. Esforço: 1 dia (decidir: matar ou religar).

### 🟡 12. UI v2 não plugada — débito gigante
`AUDIT_PLUGIN_FINAL §5` confirmou. 9 tabs como mock, zero callbacks Ruby. Ferragens hard-coded (`VALIDACAO_DOBRADICA_VISUAL §B`). É Potemkin: parece pronto para apresentação mas vazio funcional. Esforço: 2-3 sprints para wiring completo.

### 🟡 13. `wps_defaults.json` (1937 atributos) carregado uma vez e abandonado
`AUDIT_CONFIG_GLOBAIS §3`. Seed importado mas nunca lido em runtime. Trabalho de extração desperdiçado. Esforço: 2 dias (seed loader + UI categórica).

### 🟡 14. i18n inexistente — strings PT-BR hard-coded em ~3700 linhas
`grep i18n/locale/translate`: zero. "Erro ao carregar", "Cavilha", "Furo" em todo lugar. Vender pro mercado hispânico ou para SketchUp em inglês exige refactor pesado. Esforço: 2 sprints (extração + arquivo `pt-BR.yml`).

### 🟢 15. Onboarding técnico mínimo
`README.md` (151 linhas) + `dev_setup.md` (107). Sem `Makefile`, sem `Gemfile`, sem CI (`.github/` não existe), sem `make test`. Novo dev precisa decifrar `build.sh` e `dev_loader.rb`. Esforço: 1 dia para Makefile + GitHub Actions + Gemfile com rubocop.

---

## 2. Riscos de produção (cenários reais)

1. **`.skp` corrompido na biblioteca**: `definitions.load` (`json_module_builder.rb:243`) está dentro de `rescue` que só faz `warn`. Se o arquivo está parcialmente baixado (sync interrompido), o load pode travar o SketchUp em vez de levantar exceção (API SketchUp pode ser bloqueante). Plugin não detecta corrupção (sem checksum) e não há fallback "instanciar bounding box dummy". Cliente vê SketchUp congelar — culpa o SketchUp, não nós.

2. **JSON malicioso compartilhado entre marceneiros**: usuário A baixa "biblioteca premium" via cloud (`load_remote_module`). JSON com `evaluate_safe` exploit ou `componente_3d: "../../"` traversal. Sem assinatura, sem sandbox.

3. **Auto-update sem rollback**: `updater/auto_updater.rb` baixa nova versão. Se a 0.2.0 quebrar `JsonModuleBuilder`, todos clientes simultaneamente afetados. Sem feature flag, sem canary, sem rollback automatizado.

4. **388 .skp + 237 JSONs em laptop de marcenaria**: catálogo cresce rapidamente. Em 1 ano fácil ter 1500 .skp. `LibraryManager` aparentemente lê tudo eagerly (boot scan). RAM baseline + custo first-paint = travar máquinas modestas.

5. **Cliente edita módulo customizado, não há backup**: usuário modifica JSON no `wps_working/`, salva, descobre erro. Não há versionamento Git automático, nem backup snapshot, nem `.bak`. (Existe `backups_pre_enrichment` único de 2026-05-10 — manual.) Trabalho de horas perdido.

---

## 3. Débito técnico — top 5 ofensores

| Arquivo | Linhas | Por que refactor |
|---|---:|---|
| `ui/dialog_controller.rb` | 1688 | God class, 33 callbacks, mistura auth + ERP + library + machining. Splitar por domínio. |
| `library/json_module_builder.rb` | 1182 | Builder + evaluator + remote loader + 3D ferragens + door calc. Quebrar em 4 classes. |
| `main.rb` | 868 | Carrega 53 requires + define menu + define toolbar + 1 callback. Mover wiring para `boot.rb`. |
| `machining/machining_interpreter.rb` | (não medido, mas o arquivo trata 12+ regras inline) | Strategy pattern por regra. |
| `hardware/rules_engine.rb` | (referenciado em vários audits) | Regras hard-coded misturadas com normalização. |

---

## 4. Cinco perguntas para o lead técnico

1. **Qual é o SLA de boot do plugin** num laptop alvo (cliente real)? Já mediram cold-start com biblioteca cheia?
2. **Há um plano de migração de JSONs legacy** quando `versao_schema` mudar de 1→2? Quem roda? Como o usuário no campo é avisado?
3. **Os 5 arquivos órfãos em `constructor/`** são código vivo (carregados dinamicamente) ou morto? Por que não estão em `dev_loader::LOAD_ORDER`?
4. **Quem é o "usuário-zero"** do plugin em produção hoje? Existe algum cliente real rodando ou ainda é só dogfooding interno? Isso muda priorização de logger/i18n.
5. **`wps_defaults.json` (1937 atributos) é fonte de verdade** ou snapshot histórico? Se a WPS atualizar amanhã, como o plugin pega o delta?

---

## 5. Veredito honesto

**Estado: pré-alfa avançado / alfa interno.** Não está pronto para beta externo, muito menos produção paga.

**Por quê.** O núcleo paramétrico (`ParametricEngine` + `JsonModuleBuilder`) e o pipeline CNC core (`MachiningJson`, `MachiningInterpreter`) estão sólidos — os audits comprovaram cobertura de roles, bordas, e integridade do catálogo `.skp`. Mas três classes de problema sistêmico bloqueiam pago externo:

1. **Segurança** (eval + path traversal) — qualquer JSON externo é vetor.
2. **Operabilidade** (zero logger, zero testes, versão estática) — quando quebrar em campo, ninguém sabe o quê nem onde.
3. **Multi-usuário / migração** (schema_version não usado, ShopConfig global, sem locking) — primeira marcenaria com 2 funcionários revela.

**O que aprovaria para alfa interno (3 marcenarias parceiras, supervisão direta):** sim, com itens 1-3 fixados em sprint de 1 semana. **Para beta público com pagamento:** precisa também 4, 5, 6, 7 (testes, schema migration, materiais, logger). **Produção SaaS:** precisa todos os 15 + auditoria externa de segurança + canary releases.

**Estimativa: 4-6 sprints (8-12 semanas) entre o estado atual e "vendável fora do círculo de confiança".** O que o time entregou em qualidade arquitetural (RoleNormalizer, schema canônico de bordas, separação machining/hardware) é genuinamente bom — mas a casca operacional ao redor está crua.

— Agente R6

(palavras: ~1480)
