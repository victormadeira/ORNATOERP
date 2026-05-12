# Auditoria tecnica e riscos

Este documento resume a auditoria feita sobre o codigo real do Ornato em 2026-05-11.

## Escopo auditado

Foram lidos/inspecionados:

| Area | Arquivos/pastas |
|---|---|
| Monorepo | Estrutura geral de `/Users/madeira/SISTEMA NOVO` |
| Frontend | `src/App.jsx`, `src/api.js`, `src/auth.jsx`, `src/components/layout`, telas admin |
| Backend | `server/index.js`, `server/auth.js`, `server/db.js`, rotas principais |
| Banco | `server/marcenaria.db`, migrations `002` a `007` |
| Plugin | `ornato-plugin/ornato_loader.rb`, `main.rb`, core, library, tools, updater, validation |
| Biblioteca | `ornato-plugin/biblioteca`, `ornato-plugin/wps_source`, `data/library` |
| Testes | `ornato-plugin/tests`, `server/tests` |
| Docs existentes | `docs/`, `ornato-plugin/docs/`, documentos soltos do plugin |

## Pontos fortes encontrados

| Area | Ponto forte |
|---|---|
| Organizacao | ERP e plugin estao centralizados no mesmo monorepo, mas separados por pasta. |
| Backend | `server/index.js` tem middlewares de seguranca, rate limit, helmet, CORS e error handler. |
| Auth | JWT com roles e `empresa_id`; helper de tenant existe. |
| Plugin cloud | Auto-update, biblioteca cloud, telemetria opt-in e error-report ja existem. |
| Biblioteca | API tem manifest, asset, search, admin, checkout, versionamento e variacoes. |
| ShopConfig | Padroes por marcenaria existem no backend e no plugin. |
| Plugin UX | Miras e resolver contextual ja existem. |
| Usinagem | RulesEngine suporta regras geometricas e declarativas. |
| Validacao | ValidationRunner centraliza issues, severity, auto-fix e ignore. |
| Testes | Ha testes Ruby do plugin e testes JS do backend para library/plugin/shop. |
| CNC | Pre-corte agora tem simulacao 2D por padrao e 3D alternavel; DXF exporta chapas com layers tecnicas. |

## Riscos e pendencias por severidade

### Critico

| Risco | Impacto | Onde olhar | Acao recomendada |
|---|---|---|---|
| Licenca/redistribuicao WPS indefinida | Risco juridico se servir SKP WPS a clientes | `ornato-plugin/wps_source/` | Decidir legalmente: referencia interna vs redistribuicao. |
| CNC route gigante | Dificil manter, testar e revisar | `server/routes/cnc.js` | Fatiar em sub-rotas por dominio. |
| Multi-tenant parcial | Possivel vazamento entre empresas em rotas antigas | `server/routes/*.js` | Auditar rotas antigas para `empresa_id`. |
| Biblioteca cloud pode servir assets sensiveis se path falhar | Vazamento de arquivo | `server/routes/library.js` | Manter path traversal tests e revisar storage. |

### Alto

| Risco | Impacto | Onde olhar | Acao recomendada |
|---|---|---|---|
| UI v2 ainda tem tabs simples/placeholders | UX incompleta no plugin | `ornato-plugin/ornato_sketchup/ui/v2/tabs` | Priorizar Projeto/Ambiente/Producao. |
| `dialog_controller.rb` esta muito grande | Bridge dificil de manter | `ornato-plugin/ornato_sketchup/ui/dialog_controller.rb` | Separar callbacks por modulo. |
| `ShopProfiles.jsx` usa PUT no-op para buscar profile inativo | UX/admin fragil | `src/pages/admin/ShopProfiles.jsx`, `server/routes/shop.js` | Criar `GET /api/shop/profiles/:id`. |
| Testes backend nao parecem estar integrados ao `npm test` | CI incompleto | `server/tests/*.js`, `package.json` | Adicionar script `test`. |
| Servicos automáticos iniciam no `server.listen` | Testes/dev podem disparar watchers | `server/index.js` | Guardar por env `ENABLE_JOBS`. |

### Medio

| Risco | Impacto | Onde olhar | Acao recomendada |
|---|---|---|---|
| Documentos antigos duplicados/desatualizados | Time se confunde | `docs/`, `ornato-plugin/*.md` | Criar indice oficial e marcar deprecated quando aplicavel. |
| `cnc/sketchup-plugin` pode ser confundido com plugin atual | Dev mexe no lugar errado | `cnc/sketchup-plugin` | Marcar como legado/referencia. |
| Biblioteca local grande dentro do repo | Git pesado, sync lento | `ornato-plugin/biblioteca` | Definir politica LFS/storage externo. |
| `server/db.js` cria muitas tabelas por side effect | Dificil migrar/validar schema | `server/db.js` | Migrar para migrations formais. |
| Muitas paginas React grandes | Manutencao dificil | `src/pages/*.jsx` | Refatorar paginas com mais de 1500 linhas. |

### CNC e Pre-corte

| Risco | Impacto | Onde olhar | Acao recomendada |
|---|---|---|---|
| Parser 3D pode nao reconhecer algum G-code valido | Operador acha que nao ha simulacao | `src/pages/ProducaoCNC/tabs/TabPlano/GcodeSimCanvas.jsx`, `src/pages/ProducaoCNC/tabs/TabPlano/PreCutWorkspace.jsx` | Manter modo 2D como fallback e evoluir parser 3D com casos reais. |
| G-code bloqueado por ferramenta/validacao abre Pre-corte sem percurso | Tela mostra arquivo vazio corretamente, mas pode parecer bug | `src/pages/ProducaoCNC/tabs/TabPlano/index.jsx`, `server/routes/cnc.js` | Exibir alertas claros e impedir envio quando `gcode` vier vazio. |
| Simulacao em branco quando nao existe percurso | Usuario interpreta como falha do simulador | `src/pages/ProducaoCNC/tabs/TabPlano/PreCutWorkspace.jsx` | Mostrar estado "Simulacao bloqueada" quando nao houver G-code com movimentos G1/G2/G3. |
| Usinagem da face oposta some ao inverter peca | Operador nao confere pecas com usinagem A/B | `src/pages/ProducaoCNC/tabs/TabPlano/renderMachining.jsx` | Renderizar a face ativa destacada e a oposta opaca/tracejada, lendo `workers`, `side_a`, `side_b` e `machining_json_b`. |
| Fundo escuro no preview 3D esconde peca/usinagem | Operador acha que a peca ou corte nao renderizou | `src/components/PecaViewer3D.jsx` | Manter fundo claro de inspecao como padrao, botao `BG` alternavel e validar MDF claro/escuro com fita e usinagem. |
| DXF completo depende da qualidade das usinagens no JSON | CAM externo pode receber layer incompleta se o worker estiver mal modelado | `server/routes/cnc.js` | Criar fixtures de DXF com furo, rasgo, rebaixo, borda e retalho. |
| Perfis compostos/curvos simplificados viram corte errado | Rebaixo de porta, curva ou suporte invisivel aparece incompleto e o G-code nao representa a usinagem real | `server/routes/cnc.js`, `src/components/PecaViewer3D.jsx`, `src/pages/ProducaoCNC/tabs/TabPlano/renderMachining.jsx` | Usar `positions_origin` como geometria principal, tratar `close: "1"` raso como rebaixo poligonal, e declarar cavidades compostas com `shape: "t_slot"` em vez de hardcode por ferragem. |
| Contorno externo organico vira furo interno | Preview mostra a sobra externa, G-code/DXF podem sair retangulares ou invertidos | `server/routes/cnc.js`, `src/components/PecaViewer3D.jsx`, `src/pages/ProducaoCNC/tabs/TabPlano/renderMachining.jsx` | Qualquer `close: "1"` passante que ocupa os quatro limites da peca deve virar contorno externo real, mantendo o miolo da peca. Validar com `UPM_PECA_CONTORNO` e tampos organicos. |

## Observacoes especificas

### 1. O monorepo esta certo

Nao precisa migrar o plugin. Ele ja esta dentro de `SISTEMA NOVO`:

```txt
/Users/madeira/SISTEMA NOVO/ornato-plugin
```

O que precisava era documentar e deixar claro.

### 2. A biblioteca cloud ja esta bem encaminhada

O backend tem:

```txt
server/routes/library.js
server/migrations/004_library_modules.sql
server/migrations/006_library_versions_locks.sql
server/migrations/007_library_variations.sql
```

O plugin tem:

```txt
ornato-plugin/ornato_sketchup/library/library_sync.rb
```

Isso confirma que a arquitetura "plugin leve + blocos online lazy" ja esta em construcao.

### 3. Padroes por marcenaria sao diferencial real

Backend:

```txt
server/routes/shop.js
server/migrations/005_shop_profiles.sql
src/pages/admin/ShopProfiles.jsx
```

Plugin:

```txt
ornato-plugin/ornato_sketchup/hardware/shop_config.rb
ornato-plugin/ornato_sketchup/library/json_module_builder.rb
```

Isso permite o que voce descreveu: uma marcenaria usar `FOLGA_PORTA_RETA = 3mm` e outra usar `4mm`, e os blocos herdarem isso.

### 4. Miras tipo UpMobb ja existem na base

Arquivos:

```txt
ornato-plugin/ornato_sketchup/tools/mira_tool.rb
ornato-plugin/ornato_sketchup/tools/selection_resolver.rb
```

Falta transformar isso em experiencia final polida na UI v2 e nos menus contextuais.

### 5. O plugin deve continuar sem build step na UI v2

`ornato-plugin/ornato_sketchup/ui/v2/README.md` deixa claro:

```txt
Vanilla JS modular
HTML estatico
Sem dependencias externas
Sem npm
```

Nao introduzir React/Vite dentro do HtmlDialog sem decisao explicita.

## Arquivos grandes que merecem refatoracao futura

| Arquivo | Motivo |
|---|---|
| `server/routes/cnc.js` | Muito grande, concentra quase todo CNC. |
| `ornato-plugin/ornato_sketchup/ui/dialog_controller.rb` | Muitos callbacks e responsabilidades. |
| `src/pages/Cfg.jsx` | Pagina muito grande. |
| `src/pages/Novo.jsx` | Pagina muito grande. |
| `src/pages/Projetos.jsx` | Pagina muito grande. |
| `src/pages/ProducaoCNC.jsx` | Area grande com varias tabs. |

## Checklist antes de beta

1. Rodar testes do plugin.
2. Rodar testes backend.
3. Fazer build frontend.
4. Testar plugin no SketchUp Windows.
5. Testar plugin no SketchUp macOS.
6. Testar login/token do plugin.
7. Testar auto-update dev -> beta -> stable.
8. Testar biblioteca cloud com cache vazio.
9. Testar modo offline com item ja cacheado.
10. Testar modo offline com item nao cacheado.
11. Testar variacao por marcenaria.
12. Testar ShopConfig alterando folgas e rebuildando modulo.
13. Testar painel ripado cavilhado ate export CNC.
14. Validar legalmente WPS antes de publicar assets para clientes.

## Decisao recomendada

Manter arquitetura atual:

```txt
SISTEMA NOVO/
  src/ + server/       ERP
  ornato-plugin/       Plugin
  data/                Storage local/cloud
```

E evoluir em tres frentes:

1. Polir plugin UX: miras, menus contextuais, biblioteca e validacao.
2. Fortalecer cloud library: upload, versionamento, cache e variacoes.
3. Endurecer producao: testes, multi-tenant, CI e deploy controlado.
