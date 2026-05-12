# Guia dev operacional

Este documento e para qualquer dev conseguir rodar, testar e mexer no Ornato sem quebrar tudo.

## Antes de tudo

Sempre confirme onde voce esta:

```bash
pwd
```

Raiz correta do sistema:

```txt
/Users/madeira/SISTEMA NOVO
```

Plugin correto:

```txt
/Users/madeira/SISTEMA NOVO/ornato-plugin
```

## Rodar ERP local

```bash
cd "/Users/madeira/SISTEMA NOVO"
npm run dev
```

Isso sobe:

| Processo | Comando |
|---|---|
| Frontend | `vite` |
| Backend | `PORT=3001 node --watch server/index.js` |

Build:

```bash
cd "/Users/madeira/SISTEMA NOVO"
npm run build
```

Start producao/local:

```bash
cd "/Users/madeira/SISTEMA NOVO"
npm run start
```

## Rodar testes do backend

Hoje nao ha script `npm test` consolidado no `package.json`. Use:

```bash
cd "/Users/madeira/SISTEMA NOVO"
for f in server/tests/*.js; do node "$f"; done
```

E2E especifico:

```bash
cd "/Users/madeira/SISTEMA NOVO"
node server/tests/e2e/library_edit_workflow_test.js
```

## Rodar plugin local

Testes:

```bash
cd "/Users/madeira/SISTEMA NOVO/ornato-plugin"
bash tools/ci.sh
```

Build RBZ:

```bash
cd "/Users/madeira/SISTEMA NOVO/ornato-plugin"
./build.sh
```

UI v2 fora do SketchUp:

```bash
cd "/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2"
python3 -m http.server 8765
```

Abrir:

```txt
http://localhost:8765/preview.html
```

## Onde mexer por tipo de tarefa

### Quero mexer no site/ERP

| Tarefa | Arquivo/pasta |
|---|---|
| Nova pagina | `src/pages/` |
| Menu/rota interna | `src/App.jsx` |
| API frontend | `src/api.js` |
| Login/auth frontend | `src/auth.jsx` |
| Layout | `src/components/layout/` |
| Componentes comuns | `src/ui.jsx` |

### Quero mexer no backend/API

| Tarefa | Arquivo/pasta |
|---|---|
| Nova rota | `server/routes/` |
| Montar rota no app | `server/index.js` |
| Auth/roles | `server/auth.js` |
| Banco base | `server/db.js` |
| Migration | `server/migrations/` |
| Logica CNC | `server/lib/`, `server/routes/cnc.js` |
| Testes | `server/tests/` |

### Quero mexer no plugin SketchUp

| Tarefa | Arquivo/pasta |
|---|---|
| Loader | `ornato-plugin/ornato_loader.rb` |
| Carregamento geral | `ornato-plugin/ornato_sketchup/main.rb` |
| UI HtmlDialog | `ornato-plugin/ornato_sketchup/ui/v2/` |
| Bridge Ruby/JS | `ornato-plugin/ornato_sketchup/ui/dialog_controller.rb` |
| Biblioteca JSON/SKP | `ornato-plugin/biblioteca/` |
| Modulos parametricos | `ornato-plugin/ornato_sketchup/library/json_module_builder.rb` |
| Regras CNC/ferragens | `ornato-plugin/ornato_sketchup/hardware/` |
| Miras | `ornato-plugin/ornato_sketchup/tools/mira_tool.rb` |
| Selecao contextual | `ornato-plugin/ornato_sketchup/tools/selection_resolver.rb` |
| Validacao | `ornato-plugin/ornato_sketchup/validation/` |
| Auto-update | `ornato-plugin/ornato_sketchup/updater/auto_updater.rb` |

### Quero mexer na biblioteca cloud

| Tarefa | Arquivo/pasta |
|---|---|
| API public/plugin | `server/routes/library.js` |
| Tela admin | `src/pages/admin/LibraryManager.jsx` |
| Storage local | `data/library/` |
| Cliente plugin | `ornato-plugin/ornato_sketchup/library/library_sync.rb` |
| Schema/validacao | `server/lib/library_validator.js` |
| Testes | `server/tests/library_*.js` |

### Quero mexer nos padroes por marcenaria

| Tarefa | Arquivo/pasta |
|---|---|
| API | `server/routes/shop.js` |
| Banco | `server/migrations/005_shop_profiles.sql` |
| Tela admin | `src/pages/admin/ShopProfiles.jsx` |
| Plugin local | `ornato-plugin/ornato_sketchup/hardware/shop_config.rb` |
| Uso em JSON | `ornato-plugin/ornato_sketchup/library/json_module_builder.rb` |
| Testes | `server/tests/shop_endpoints_test.js`, `ornato-plugin/tests/shop_*` |

### Quero mexer no CNC, G-code, Pre-corte ou DXF

| Tarefa | Arquivo/pasta |
|---|---|
| Backend CNC principal | `server/routes/cnc.js` |
| Plano de corte e botoes de acao | `src/pages/ProducaoCNC/tabs/TabPlano/index.jsx` |
| Cockpit de Pre-corte | `src/pages/ProducaoCNC/tabs/TabPlano/PreCutWorkspace.jsx` |
| Simulador 3D do Pre-corte | `src/pages/ProducaoCNC/tabs/TabPlano/GcodeSimCanvas.jsx` |
| Simulador 2D reutilizado | `src/components/GcodeSimWrapper.jsx` |
| Aba G-code / CNC | `src/pages/ProducaoCNC/tabs/TabGcode.jsx` |
| Preview 3D individual da peca | `src/components/PecaViewer3D.jsx` |

Regras praticas:

1. Se mexer em G-code, validar o simulador no Plano de Corte, na aba G-code e no Pre-corte.
2. Se mexer em eixo X/Y, comparar a orientacao da chapa com a orientacao do toolpath.
3. Se mexer em Pre-corte, manter o modo 2D funcional. Ele e o fallback visual do operador.
4. Se mexer no simulador 3D, testar o aviso "Sem movimentos XY no parser 3D".
5. Se mexer em DXF, abrir pelo menos um arquivo em visualizador CAD/CAM e conferir as layers.
6. Se o backend retornar `ok: false`, o Pre-corte deve mostrar "G-code nao liberado para corte" e "Simulacao bloqueada"; nunca deve parecer que o canvas falhou em branco.
7. A simulacao so deve ficar disponivel quando existir G-code com movimentos de corte G1/G2/G3.
8. Ao mexer em `machining_json`, validar `/api/cnc/lotes/:loteId/face-cnc` com workers em array, objeto e `side_a`/`side_b`.
9. Ao mexer em renderizacao de usinagens, validar uma peca com Face A e Face B: a face ativa deve ficar destacada e a face oposta deve aparecer opaca/tracejada. Depois inverter a peca e confirmar que a logica troca.
10. Ao mexer no preview 3D individual, testar o fundo Estudio/Tecnico/Contraste pelo botao `BG`, com MDF claro, MDF escuro, fita de borda e usinagem CSG visivel.
11. Ao adicionar usinagem com curva ou pontos importados, preferir `positions_origin`; `positions` pode vir deslocado por ferramenta/normalizacao do software de origem.
12. Ao adicionar rebaixo fechado, usar `close: "1"` com `depth` menor que 90% da espessura. O sistema deve tratar como pocket poligonal, nao como linha grossa. Em molduras, o recorte passante fechado dentro do rebaixo deve virar ilha/furo interno do pocket.
13. Ao adicionar cava composta, declarar `shape: "t_slot"` com `slot_width`, `slot_length`, `head_width`, `head_depth`, `axis`, `edge` e `depth`. Isso vale para suporte invisivel e qualquer outra ferragem semelhante.
14. Depois de mexer em shape de usinagem, validar quatro saidas: overlay 2D no plano, preview 3D da peca, G-code/simulador e DXF.
15. Em portas com moldura/recorte central, conferir se a fita azul aparece apenas nas bordas externas. Paredes internas de recorte, rebaixo e moldura devem aparecer como MDF/usinagem, salvo quando o JSON tiver uma borda interna explicita.
16. No preview 3D, portas com rebaixo raso + recorte passante interno devem mostrar o fundo do rebaixo como anel/moldura visivel. Se parecer apenas corte passante, revisar `positions_origin`, `close`, `depth` e a deteccao de ilhas internas em `PecaViewer3D.jsx`.
17. Em tampos organicos e `UPM_PECA_CONTORNO`, validar se o caminho fechado passante encosta nos quatro limites da peca. Se sim, ele e o contorno externo; o preview, plano, G-code e DXF devem usar o miolo da peca, nao a sobra externa.

Endpoints DXF:

```txt
GET /api/cnc/export-dxf/:loteId/chapa/:chapaIdx
GET /api/cnc/export-dxf/:loteId?chapas=0,1,2
```

O ZIP de DXF e baixado pelo botao `Exportar DXF` no Plano de Corte. O backend gera uma layer por tipo/lado de operacao: furos, rebaixos, rasgos, fresagens, bordas, retalhos, contorno e labels.

## Como adicionar uma nova pagina no ERP

1. Criar arquivo em `src/pages/MinhaPagina.jsx`.
2. Importar com `lazy` em `src/App.jsx`.
3. Adicionar id em `VALID_PAGES`.
4. Adicionar item no grupo correto de `MENU_GROUPS`.
5. Adicionar case no `renderPage`.
6. Testar navegacao, refresh direto pela URL e permissao.

## Como adicionar uma nova rota no backend

1. Criar `server/routes/minha-rota.js`.
2. Usar `Router`.
3. Adicionar `requireAuth` se nao for publico.
4. Validar inputs.
5. Usar `tenantOf(req)` quando a rota for por empresa.
6. Montar em `server/index.js`:

```js
app.use('/api/minha-rota', minhaRotaRoutes);
```

7. Criar teste em `server/tests/`.

## Como adicionar um bloco de biblioteca

1. Criar JSON limpo.
2. Garantir `id`, `name`, `category`, `version`.
3. Definir parametros editaveis.
4. Usar `{shop.*}` para padroes de marcenaria.
5. Definir pecas com `role`, material, dimensoes, posicao e bordas.
6. Definir `ferragens_auto` quando houver usinagem/ferragem.
7. Associar SKP 3D se necessario.
8. Validar no `LibraryManager`.
9. Publicar em `dev`.
10. Testar no plugin.
11. Promover para `beta`.
12. So depois promover para `stable`.

## Como nao quebrar o plugin

1. Nao renomear atributos `Ornato` sem migração.
2. Nao mudar shape de payload JS sem atualizar `app.js`.
3. Nao colocar build step na UI v2 sem decisao.
4. Nao hardcodar caminho absoluto de biblioteca.
5. Nao servir arquivo de storage sem bloquear path traversal.
6. Nao quebrar `currentColor` nos SVGs do plugin.
7. Nao alterar WPS original sem copiar para area de trabalho.

## Checklist de PR

Antes de abrir PR:

```bash
cd "/Users/madeira/SISTEMA NOVO"
npm run build
node --check server/routes/cnc.js
for f in server/tests/*.js; do node "$f"; done
cd "/Users/madeira/SISTEMA NOVO/ornato-plugin"
bash tools/ci.sh
```

Se mexeu em UI v2 do plugin:

```bash
cd "/Users/madeira/SISTEMA NOVO/ornato-plugin/ornato_sketchup/ui/v2"
python3 -m http.server 8765
```

Abrir `preview.html` e testar:

| Estado | Testar |
|---|---|
| 360px | Janela estreita. |
| 420px | Tamanho parecido com plugin lateral. |
| 720px | Tamanho medio. |
| Dark mode | Contraste e icones. |
| Modo foco | Layout sem overlap. |
| Seleção mock/real | Inspector e callbacks. |

## Checklist especifico de plugin + ERP cloud

1. Usuario logado no ERP consegue baixar plugin.
2. Plugin consegue autenticar na API.
3. `GET /api/plugin/check-update` retorna correto.
4. Canal `stable` nao ve release `beta/dev`.
5. `force_update` bloqueia quando necessario.
6. `GET /api/library/manifest` retorna modulos publicados.
7. `GET /api/library/asset/:id` bloqueia `../`.
8. Plugin baixa asset e valida SHA-256.
9. Cache funciona offline.
10. Variacao privada aparece so para a empresa certa.
11. Profile ativo de `shop_profiles` chega no plugin.
12. Bloco com `{shop.*}` resolve corretamente.

## Quando pedir ajuda

Peca revisao antes de mexer se a tarefa tocar:

| Area | Por que |
|---|---|
| `server/routes/cnc.js` | Arquivo grande e sensivel. |
| `dialog_controller.rb` | Ponte critica entre Ruby e JS. |
| Migrations do banco | Pode quebrar dados reais. |
| WPS/source assets | Pode ter risco legal/licenca. |
| Auto-update | Pode travar todos os clientes. |
| Auth/tenant | Pode vazar dados entre empresas. |

## Comandos uteis

Status git:

```bash
cd "/Users/madeira/SISTEMA NOVO"
git status --short
```

Ver rotas backend:

```bash
cd "/Users/madeira/SISTEMA NOVO"
rg -n "router\\.(get|post|put|patch|delete)\\(" server/routes
```

Ver tabelas SQLite:

```bash
cd "/Users/madeira/SISTEMA NOVO"
sqlite3 server/marcenaria.db ".tables"
```

Ver arquivos do plugin:

```bash
cd "/Users/madeira/SISTEMA NOVO"
find ornato-plugin/ornato_sketchup -maxdepth 2 -type f | sort
```

Ver biblioteca:

```bash
cd "/Users/madeira/SISTEMA NOVO"
find ornato-plugin/biblioteca -maxdepth 3 -type f | sort
```
