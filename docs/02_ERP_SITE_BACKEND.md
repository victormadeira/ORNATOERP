# ERP, site e backend

Este documento explica o ERP/site do Ornato: frontend React, backend Express, banco SQLite, rotas e modulos principais.

## Resumo simples

O ERP e o sistema web do Ornato. Ele roda na raiz de `/Users/madeira/SISTEMA NOVO`.

```txt
src/       # telas React
server/    # API Express
server/marcenaria.db  # banco SQLite
```

O frontend chama a API usando `src/api.js`. O backend monta todas as rotas em `server/index.js`.

## Frontend React

Entrada:

| Arquivo | Funcao |
|---|---|
| `src/main.jsx` | Inicializa React. |
| `src/App.jsx` | Roteamento interno, layout, menus, paginas. |
| `src/api.js` | Helper central de chamadas `/api/*` com JWT. |
| `src/auth.jsx` | Login, logout, usuario atual, expiracao do token. |
| `src/components/layout/Sidebar.jsx` | Menu lateral, busca global, favoritos/recentes. |
| `src/components/layout/Topbar.jsx` | Barra superior. |
| `src/ui.jsx` | Componentes e utilitarios visuais compartilhados. |

### Grupos principais de menu

O menu esta definido em `src/App.jsx`.

| Grupo | Telas principais |
|---|---|
| Comercial | Dashboard, projetos, clientes, orcamentos, funil, CRM, WhatsApp |
| Producao | Oficina, ordens, Corte & CNC, acompanhamento, expedicao |
| Cadastros | Materiais, engenharia/catalogo, estoque |
| Gestao | Financeiro, compras/NF, ponto, gestao avancada, relatorios |
| Sistema | IA, plugin, releases, curadoria da biblioteca, padroes de marcenaria, configuracoes, usuarios, erros |

### Telas administrativas importantes

| Tela | Arquivo | Serve para |
|---|---|---|
| Plugin SketchUp | `src/pages/PluginDownload.jsx` | Download do plugin. |
| Plugin releases | `src/pages/admin/PluginReleases.jsx` | Upload/publicacao de `.rbz` por canal. |
| Plugin telemetry | `src/pages/admin/PluginTelemetry.jsx` | Ver telemetria opt-in do plugin. |
| Plugin errors | `src/pages/admin/PluginErrorReports.jsx` | Ver crashes/erros enviados pelo plugin. |
| Biblioteca curadoria | `src/pages/admin/LibraryManager.jsx` | Upload/edicao/publicacao de blocos JSON/SKP. |
| Padroes marcenaria | `src/pages/admin/ShopProfiles.jsx` | Editar folgas, cavilhas, ferragens e materiais padrao por empresa. |

## Backend Express

Entrada:

| Arquivo | Funcao |
|---|---|
| `server/index.js` | Cria Express, middlewares, rotas, static build, WebSocket. |
| `server/db.js` | Abre SQLite, cria tabelas base e seeds. |
| `server/auth.js` | JWT, roles, tenant, middlewares de permissao. |
| `server/routes/*.js` | Rotas por dominio. |
| `server/services/*.js` | Servicos/automacoes. |
| `server/lib/*.js` | Logica reutilizavel de CNC, validacao, nesting, gcode etc. |
| `server/migrations/*.sql` | Migrations adicionais. |

### Middlewares importantes

`server/index.js` configura:

| Middleware | Funcao |
|---|---|
| `compression` | Gzip nos JSONs/respostas grandes. |
| `cors` | Libera origens configuradas. |
| `helmet` | Headers de seguranca e CSP. |
| `express-rate-limit` | Limites em login, publico, IA, uploads, deletes etc. |
| `express.json` | Body JSON com limites diferentes por rota. |
| anti-cache `/api` | Evita resposta stale na API. |
| error handler final | Registra erros 5xx em `error_log`. |
| WebSocket `/ws` | Broadcast em tempo real com auth JWT. |

## Auth e permissao

Backend:

| Funcao | Arquivo | O que faz |
|---|---|---|
| `signToken(user)` | `server/auth.js` | Gera JWT com `id`, `email`, `role`, `nome`, `empresa_id`. |
| `requireAuth` | `server/auth.js` | Exige Bearer token. |
| `requireRole(...roles)` | `server/auth.js` | Exige role especifica. |
| `tenantOf(req)` | `server/auth.js` | Pega `empresa_id` do usuario. |
| `requireSameTenant` | `server/auth.js` | Bloqueia acesso cruzado entre empresas. |

Frontend:

| Funcao | Arquivo | O que faz |
|---|---|---|
| `AuthProvider` | `src/auth.jsx` | Carrega usuario com `/auth/me`. |
| `login` | `src/auth.jsx` | Chama `/auth/login`, salva `erp_token`. |
| `logout` | `src/auth.jsx` | Remove token e estado local. |

Roles vistas na auditoria:

| Role | Uso |
|---|---|
| `admin` | Acesso total/admin. |
| `gerente` | Acesso gerencial. |
| `library_curator` | Curadoria de biblioteca. |
| `vendedor` | Padrao de usuario comercial. |

## API helper do frontend

Arquivo: `src/api.js`

Ele:

1. Usa base `/api`.
2. Injeta `Authorization: Bearer <erp_token>`.
3. Aplica timeout padrao de 30s.
4. Usa timeout maior para CNC e plano de corte.
5. Tem retry simples para erro de rede.
6. Suporta upload via `XMLHttpRequest`.
7. Suporta download blob para documentos.

## Rotas principais

`server/index.js` monta os grupos:

| Prefixo | Arquivo |
|---|---|
| `/api/auth` | `server/routes/auth.js` |
| `/api/clientes` | `server/routes/clientes.js` |
| `/api/orcamentos` | `server/routes/orcamentos.js` |
| `/api/config` | `server/routes/config.js` |
| `/api/catalogo` | `server/routes/catalogo.js` |
| `/api/biblioteca` | `server/routes/biblioteca.js` |
| `/api/portal` | `server/routes/portal.js` |
| `/api/projetos` | `server/routes/projetos.js` |
| `/api/financeiro` | `server/routes/financeiro.js` |
| `/api/estoque` | `server/routes/estoque.js` |
| `/api/whatsapp` | `server/routes/whatsapp.js` |
| `/api/ia` | `server/routes/ia.js` |
| `/api/cnc` | `server/routes/cnc.js` |
| `/api/plano-corte` | `server/routes/plano-corte.js` |
| `/api/industrializacao` | `server/routes/industrializacao.js` |
| `/api/plugin` | `server/routes/plugin.js` |
| `/api/biblioteca-skp` | `server/routes/biblioteca-skp.js` |
| `/api/library` | `server/routes/library.js` |
| `/api/shop` | `server/routes/shop.js` |
| `/api/search` | `server/routes/search.js` |
| `/api/errors` | `server/routes/errors.js` |
| `/api/oficina` | `server/routes/oficina.js` |

## Rotas criticas para o plugin

### Auto-update do plugin

Arquivo: `server/routes/plugin.js`

| Endpoint | Funcao |
|---|---|
| `GET /api/plugin/check-update` | Plugin pergunta se existe versao nova. |
| `GET /api/plugin/download/:filename` | Download do `.rbz`. |
| `POST /api/plugin/telemetry` | Telemetria opt-in. |
| `POST /api/plugin/error-report` | Relatorio de erro/crash. |
| `POST /api/plugin/releases` | Admin sobe release `.rbz`. |
| `GET /api/plugin/releases` | Admin lista releases. |
| `PATCH /api/plugin/releases/:id` | Admin publica/deprecia/promove release. |
| `DELETE /api/plugin/releases/:id` | Admin remove release. |

### Biblioteca cloud

Arquivo: `server/routes/library.js`

| Endpoint | Funcao |
|---|---|
| `GET /api/library/manifest` | Manifest incremental para o plugin. |
| `GET /api/library/asset/:id` | Baixa JSON/SKP/thumbnail. |
| `GET /api/library/search` | Busca catalogo. |
| `GET /api/library/autocomplete` | Sugestoes. |
| `GET /api/library/filters` | Facets/filtros. |
| `GET /api/library/admin/modules` | Admin lista modulos. |
| `POST /api/library/admin/modules` | Admin cria modulo. |
| `PUT /api/library/admin/modules/:id` | Admin edita modulo. |
| `PATCH /api/library/admin/modules/:id/publish` | Publica em canal. |
| `POST /api/library/admin/modules/:id/checkout` | Bloqueia para edicao. |
| `POST /api/library/admin/modules/:id/checkin` | Salva nova versao. |
| `GET /api/library/admin/modules/:id/export.zip` | Exporta pacote do bloco. |
| `POST /api/library/admin/import` | Importa pacote. |
| `POST /api/library/admin/modules/:id/duplicate-for-shop` | Cria variacao privada por marcenaria. |
| `GET /api/library/admin/origin-updates` | Lista updates pendentes da origem global. |

### Padroes por marcenaria

Arquivo: `server/routes/shop.js`

| Endpoint | Funcao |
|---|---|
| `GET /api/shop/config` | Plugin baixa profile ativo da empresa. |
| `GET /api/shop/profiles` | Admin lista profiles. |
| `POST /api/shop/profiles` | Admin cria profile. |
| `PUT /api/shop/profiles/:id` | Admin edita profile. |
| `PATCH /api/shop/profiles/:id/activate` | Ativa profile. |
| `DELETE /api/shop/profiles/:id` | Deleta profile inativo. |

## Banco SQLite

Arquivo: `server/marcenaria.db`.

O banco esta grande e cobre:

| Familia | Exemplos de tabelas |
|---|---|
| Usuarios/empresas | `users`, `empresas`, `empresa_config` |
| CRM/comercial | `clientes`, `orcamentos`, `leads`, `lead_colunas`, `follow_ups` |
| Projetos | `projetos`, `etapas_projeto`, `ocorrencias_projeto` |
| Portal | `portal_tokens`, `portal_acessos`, `portal_mensagens` |
| Financeiro | `contas_pagar`, `contas_receber`, `despesas_projeto` |
| Estoque/compras | `estoque`, `movimentacoes_estoque`, `fornecedores`, `ordens_compra` |
| Producao/CNC | `cnc_lotes`, `cnc_pecas`, `cnc_chapas`, `cnc_maquinas`, `cnc_ferramentas` |
| Biblioteca cloud | `library_modules`, `library_versions`, `library_locks`, `library_origin_updates` |
| Plugin | `plugin_releases`, `plugin_telemetry`, `plugin_error_reports` |
| Marcenaria padrao | `shop_profiles` |
| Observabilidade | `error_log`, `audit_log` |

Migrations especificas importantes:

| Migration | Conteudo |
|---|---|
| `002_precos_biblioteca.sql` | Precos de materiais/ferragens. |
| `003_plugin_releases.sql` | Releases, telemetria e erros do plugin. |
| `004_library_modules.sql` | Biblioteca cloud, manifest e FTS5. |
| `005_shop_profiles.sql` | Padroes tecnicos por marcenaria. |
| `006_library_versions_locks.sql` | Versoes e locks de edicao. |
| `007_library_variations.sql` | Variacoes privadas por empresa e updates de origem. |

## CNC dentro do ERP

O modulo CNC e um dos maiores pontos do backend.

Arquivo: `server/routes/cnc.js`.

Ele cobre:

| Area | O que existe |
|---|---|
| Importacao | JSON, DXF, Promob, plugin sync. |
| Lotes | CRUD de lotes, status, grupo de otimizacao. |
| Pecas | CRUD, fotos, historico, usinagens A/B. |
| Otimizacao | Plano de corte, multi-maquina, versoes. |
| G-code | Geracao por lote/chapa/peca, historico, envio. |
| Etiquetas | Templates, impressoes, QR/barcode. |
| Expedicao | Scans, checklist, volumes, fotos. |
| Materiais | Chapas, aliases, retalhos, mapas de materiais. |
| Maquinas | Maquinas, ferramentas, desgaste, manutencao. |
| Custos | Custeio, consumo, reserva, relatorios. |
| Validacao | Usinagens, bordas, conferencia. |

### Atualizacao CNC de 2026-05-12

Arquivos principais:

```txt
server/routes/cnc.js
src/pages/ProducaoCNC/tabs/TabPlano/index.jsx
src/pages/ProducaoCNC/tabs/TabPlano/PreCutWorkspace.jsx
src/pages/ProducaoCNC/tabs/TabPlano/GcodeSimCanvas.jsx
src/pages/ProducaoCNC/tabs/TabGcode.jsx
src/components/GcodeSimWrapper.jsx
src/components/PecaViewer3D.jsx
```

O Pre-corte abre o cockpit `PreCutWorkspace`. Esse cockpit agora tem dois modos de simulacao:

| Modo | Uso |
|---|---|
| 2D | Padrao para o operador revisar rapidamente chapa, pecas e percurso. Usa `GcodeSimWrapper`, que e mais tolerante para visualizacao. |
| 3D | Inspecao tecnica com animacao, spindle, velocidade e timeline propria. Usa `GcodeSimCanvas`. |

Motivo: o fluxo novo de Pre-corte pulava o modal antigo, que tinha o simulador 2D, e abria direto o cockpit 3D. Quando o parser 3D nao reconhecia movimentos XY, ou quando o backend bloqueava o G-code por validacao, a tela parecia nao ter simulacao. Agora o 2D aparece por padrao, o 3D fica alternavel, e o cockpit mostra aviso quando o parser 3D nao encontra movimentos XY.

Estado de bloqueio: quando `/api/cnc/gcode/:loteId/chapa/:chapaIdx` retorna `ok: false`, o frontend abre o Pre-corte com `generation_blocked: true`, `generation_error` e `gcode: ""`. O cockpit deve mostrar "G-code nao liberado para corte" e "Simulacao bloqueada", listando ferramenta ausente, alerta critico, zero movimentos de corte ou erro de validacao. A simulacao 2D/3D so deve aparecer quando houver percurso com movimentos de corte G1/G2/G3.

Face CNC: `/api/cnc/lotes/:loteId/face-cnc` aceita `machining_json.workers` como array ou objeto e tambem considera `side_a`/`side_b`. Isso evita erro quando o plugin/ERP salva workers em formato de mapa por id.

Visualizacao A/B no plano de corte: `src/pages/ProducaoCNC/tabs/TabPlano/renderMachining.jsx` deve sempre desenhar as duas faces quando a peca tiver usinagem dupla. A face que esta para cima (`lado_ativo` A ou B) fica colorida/destacada; a face oposta fica cinza, opaca e tracejada como referencia. Ao inverter a peca, a transformacao visual espelha as coordenadas e troca qual face fica destacada.

Preview 3D da peca: `src/components/PecaViewer3D.jsx` usa fundo claro de inspecao por padrao, com grade sutil, referencia de chao, iluminacao mais uniforme e botao `BG` para alternar entre Estudio, Tecnico e Contraste. A escolha foi feita para facilitar a leitura de MDF escuro, cortes CSG, fitas de borda e usinagens pequenas quando o usuario abre "Ver Peca 3D" pelo plano de corte ou pelo painel de inspecao. As fitas de borda do preview 3D devem aparecer somente nas bordas externas da peca; recortes internos, molduras, rebaixos e janelas usinadas usam material de corte/usinagem e nao podem receber fita azul automaticamente. Rebaixos fechados rasos com recorte passante interno devem renderizar uma superficie de fundo do rebaixo em formato de anel/moldura, para diferenciar claramente rebaixo de corte passante.

Contrato generico de usinagem: `server/routes/cnc.js`, `renderMachining.jsx` e `PecaViewer3D.jsx` agora tratam `positions_origin` como fonte preferencial de geometria quando existir. Isso corrige curvas e geometrias vindas de softwares externos que enviam `positions` ja deslocado/normalizado. O motor reconhece:

| Shape / caso | Como deve ser interpretado |
|---|---|
| `path` ou `positions_origin` aberto | Fresamento de caminho. |
| `close: "1"` com profundidade menor que 90% da espessura | Rebaixo/pocket poligonal preenchido. Se houver recorte passante fechado dentro dele, o G-code trata esse recorte como ilha/furo interno para formar uma moldura/anel. |
| `close: "1"` com profundidade passante | Recorte/contorno interno. |
| `close: "1"` passante encostando nos quatro limites da peca | Contorno externo real da peca. Usado em tampos organicos e `UPM_PECA_CONTORNO`; o sistema deve manter o miolo e descartar a sobra externa. |
| `shape: "t_slot"` | Rasgo composto em T, com haste + boca/cava. |

Rasgo T e cavidades compostas nao podem ser hardcoded para uma ferragem especifica. Qualquer bloco/ferragem deve declarar `shape`, `slot_width`, `slot_length`, `head_width`, `head_depth`, `depth`, `axis` e `edge` quando a usinagem real for composta. O G-code expande isso em trajetorias reais de maquina, e o DXF exporta as layers tecnicas correspondentes.

Exportacao DXF:

| Endpoint | Retorno | Observacao |
|---|---|---|
| `GET /api/cnc/export-dxf/:loteId/chapa/:chapaIdx` | `.dxf` | Uma chapa. |
| `GET /api/cnc/export-dxf/:loteId?chapas=0,1,2` | `.zip` | Varias chapas em lote. |

O DXF e gerado em `server/routes/cnc.js` no formato AutoCAD R12 ASCII. As camadas usam nomes tecnicos para facilitar CAM externo e conferencia: `SHEET`, `OUTLINE`, `PIECE_REF`, `SCRAP`, `DRILL_TOPSIDE`, `DRILL_UNDERSIDE`, `DRILL_EDGE_LEFT`, `DRILL_EDGE_RIGHT`, `DRILL_EDGE_FRONT`, `DRILL_EDGE_BACK`, `POCKET_TOPSIDE`, `POCKET_UNDERSIDE`, `GROOVE_TOPSIDE`, `GROOVE_UNDERSIDE`, `MILL_TOPSIDE`, `MILL_UNDERSIDE`, `EDGE_BANDING` e `LABEL`. Pecas com contorno organico usam `OUTLINE` como polilinha real; o retangulo bruto fica apenas em `PIECE_REF` para referencia.

## Servir o frontend

No final de `server/index.js`:

1. `/assets` serve arquivos hash do Vite com cache forte.
2. `dist/` serve o frontend.
3. `/uploads` serve uploads.
4. `/docs/plugin` serve `ornato-plugin/docs`.
5. Qualquer rota nao-API cai no `index.html` do React.

## WebSocket

O backend abre WebSocket em `/ws`.

Regras:

1. Cliente precisa autenticar com JWT em ate 8 segundos.
2. Limite de conexoes por IP.
3. `app.locals.wsBroadcast(type, data)` envia eventos para clientes autenticados.
